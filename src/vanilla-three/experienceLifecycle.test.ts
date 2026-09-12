import { describe, expect, it, vi } from 'vitest';
import { startExperience } from './experienceLifecycle';
import type { IExperience } from './types';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('experience lifecycle', () => {
  it('skips cancelled setup before a replacement uses the same canvas', async () => {
    const original: IExperience = {
      init: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
    };
    const replacement: IExperience = {
      init: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
    };
    const onError = vi.fn();
    const first = startExperience(original, onError);
    first.cancel();
    const second = startExperience(replacement, onError);

    await Promise.all([first.ready, second.ready]);

    expect(original.init).not.toHaveBeenCalled();
    expect(original.dispose).toHaveBeenCalledTimes(1);
    expect(replacement.init).toHaveBeenCalledTimes(1);
    expect(replacement.dispose).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    second.cancel();
  });

  it('disposes a completed experience exactly once', async () => {
    const experience: IExperience = {
      init: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
    };
    const lifecycle = startExperience(experience, vi.fn());

    await lifecycle.ready;
    lifecycle.cancel();
    lifecycle.cancel();

    expect(experience.dispose).toHaveBeenCalledTimes(1);
  });

  it('aborts pending initialisation and disposes after it settles', async () => {
    const pending = deferred();
    let signal: AbortSignal | undefined;
    const experience: IExperience = {
      init: vi.fn((receivedSignal?: AbortSignal) => {
        signal = receivedSignal;
        return pending.promise;
      }),
      dispose: vi.fn(),
    };
    const onError = vi.fn();
    const lifecycle = startExperience(experience, onError);

    await Promise.resolve();
    lifecycle.cancel();
    expect(signal?.aborted).toBe(true);
    expect(experience.dispose).not.toHaveBeenCalled();

    pending.resolve();
    await lifecycle.ready;

    expect(experience.dispose).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('cleans up and reports initialisation failures', async () => {
    const error = new Error('renderer unavailable');
    const experience: IExperience = {
      init: vi.fn().mockRejectedValue(error),
      dispose: vi.fn(),
    };
    const onError = vi.fn();
    const lifecycle = startExperience(experience, onError);

    await lifecycle.ready;

    expect(experience.dispose).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
  });
});
