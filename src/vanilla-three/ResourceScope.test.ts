import { describe, expect, it, vi } from 'vitest';
import { ResourceScope } from './ResourceScope';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('ResourceScope', () => {
  it('cancels immediately and releases a camera arriving after cancellation exactly once', async () => {
    const camera = deferred<{ stop(): void }>();
    const stream = { stop: vi.fn() };
    const scope = new ResourceScope();
    const result = scope.acquire(camera.promise, (resource) => resource.stop());
    scope.dispose();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    camera.resolve(stream);
    await Promise.resolve();
    scope.dispose();
    expect(stream.stop).toHaveBeenCalledTimes(1);
  });

  it('releases partial setup in reverse order even when a cleanup fails', () => {
    const scope = new ResourceScope();
    const calls: string[] = [];
    scope.defer(() => {
      calls.push('renderer');
    });
    scope.defer(() => {
      calls.push('model');
      throw new Error('close failed');
    });
    scope.defer(() => {
      calls.push('stream');
    });
    expect(() => scope.dispose()).toThrow('close failed');
    expect(calls).toEqual(['stream', 'model', 'renderer']);
    scope.dispose();
    expect(calls).toHaveLength(3);
  });

  it('handles an acquisition rejecting after cancellation without an unhandled rejection', async () => {
    const pending = deferred<void>();
    const scope = new ResourceScope();
    const result = scope.wait(pending.promise);
    scope.dispose();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    pending.reject(new Error('camera denied'));
    await Promise.resolve();
  });
});
