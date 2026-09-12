import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExperienceLoop } from './ExperienceLoop';

function environment(reduced = false) {
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0;
  const motion = Object.assign(new EventTarget(), { matches: reduced });
  const document = Object.assign(new EventTarget(), { hidden: false });
  let intersection!: (entries: { isIntersecting: boolean }[]) => void;
  const disconnect = vi.fn();
  vi.stubGlobal('window', { matchMedia: () => motion });
  vi.stubGlobal('document', document);
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: typeof intersection) {
        intersection = callback;
      }
      observe() {}
      disconnect = disconnect;
    }
  );
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => {
    frames.set(++id, frame);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (frame: number) =>
    frames.delete(frame)
  );
  return {
    motion,
    document,
    frames,
    disconnect,
    intersect: (visible: boolean) =>
      intersection([{ isIntersecting: visible }]),
    advance(now: number) {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((frame) => frame(now));
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('ExperienceLoop', () => {
  it('coalesces requests and pauses without a catch-up jump after visibility changes', () => {
    const env = environment();
    const frame = vi.fn();
    const loop = new ExperienceLoop({} as HTMLElement, frame);
    loop.invalidate();
    loop.invalidate();
    expect(env.frames.size).toBe(1);
    env.advance(100);
    env.advance(120);
    expect(frame).toHaveBeenLastCalledWith(0.02, true);
    env.document.hidden = true;
    env.document.dispatchEvent(new Event('visibilitychange'));
    expect(env.frames.size).toBe(0);
    loop.invalidate();
    expect(env.frames.size).toBe(0);
    env.document.hidden = false;
    env.document.dispatchEvent(new Event('visibilitychange'));
    env.advance(60000);
    expect(frame).toHaveBeenLastCalledWith(0, true);
    loop.dispose();
  });

  it('renders on demand in reduced motion, including a live preference change', () => {
    const env = environment(true);
    const frame = vi.fn();
    const loop = new ExperienceLoop({} as HTMLElement, frame);
    loop.invalidate();
    env.advance(0);
    expect(frame).toHaveBeenLastCalledWith(0, false);
    expect(env.frames.size).toBe(0);
    loop.invalidate();
    env.advance(10);
    expect(frame).toHaveBeenCalledTimes(2);
    env.motion.matches = false;
    env.motion.dispatchEvent(new Event('change'));
    env.advance(20);
    expect(env.frames.size).toBe(1);
    env.motion.matches = true;
    env.motion.dispatchEvent(new Event('change'));
    env.advance(30);
    expect(env.frames.size).toBe(0);
    loop.dispose();
  });

  it('pauses offscreen, draws once while paused, and releases every subscription', () => {
    const env = environment();
    const frame = vi.fn();
    const removeDocument = vi.spyOn(env.document, 'removeEventListener');
    const removeMotion = vi.spyOn(env.motion, 'removeEventListener');
    const loop = new ExperienceLoop({} as HTMLElement, frame);
    env.intersect(false);
    loop.invalidate();
    expect(env.frames.size).toBe(0);
    env.intersect(true);
    loop.setPlaying(false);
    env.advance(100);
    expect(frame).toHaveBeenLastCalledWith(0, false);
    expect(env.frames.size).toBe(0);
    loop.dispose();
    loop.dispose();
    loop.invalidate();
    env.document.dispatchEvent(new Event('visibilitychange'));
    expect(env.frames.size).toBe(0);
    expect(env.disconnect).toHaveBeenCalledTimes(1);
    expect(removeDocument).toHaveBeenCalledTimes(1);
    expect(removeMotion).toHaveBeenCalledTimes(1);
  });
});

function pendingFrame() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

it('waits for the first frame and never overlaps async frames', async () => {
  const env = environment();
  const first = pendingFrame();
  const frame = vi.fn().mockReturnValueOnce(first.promise);
  const loop = new ExperienceLoop({} as HTMLElement, frame);
  const started = vi.fn();
  const ready = loop.start().then(started);
  loop.invalidate();
  env.advance(20);
  expect(frame).toHaveBeenCalledTimes(1);
  expect(started).not.toHaveBeenCalled();
  first.resolve();
  await ready;
  expect(started).toHaveBeenCalledOnce();
  expect(env.frames.size).toBe(1);
  env.advance(40);
  expect(frame).toHaveBeenCalledTimes(2);
  loop.dispose();
});

it('defers GPU disposal until an in-flight frame settles', async () => {
  const env = environment();
  const pending = pendingFrame();
  const loop = new ExperienceLoop({} as HTMLElement, () => pending.promise);
  const ready = loop.start();
  const release = vi.fn();
  loop.dispose(release);
  expect(release).not.toHaveBeenCalled();
  pending.resolve();
  await ready;
  expect(release).toHaveBeenCalledOnce();
  expect(env.frames.size).toBe(0);
  loop.dispose(release);
  expect(release).toHaveBeenCalledOnce();
});

it('reports a later frame failure once and stops scheduling', async () => {
  const env = environment();
  const pending = pendingFrame();
  const error = new Error('device lost');
  const onError = vi.fn();
  const frame = vi
    .fn()
    .mockReturnValueOnce(undefined)
    .mockReturnValue(pending.promise);
  const loop = new ExperienceLoop({} as HTMLElement, frame, onError);
  await loop.start();
  env.advance(10);
  pending.reject(error);
  await pending.promise.catch(() => {});
  await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error));
  loop.invalidate();
  env.advance(20);
  expect(frame).toHaveBeenCalledTimes(2);
  expect(env.frames.size).toBe(0);
  loop.dispose();
});

it('coalesces invalidation raised inside an async frame before its promise is returned', async () => {
  const env = environment();
  const pending = pendingFrame();
  const frame = vi.fn(() => {
    loop.invalidate();
    return pending.promise;
  });
  const loop = new ExperienceLoop({} as HTMLElement, frame);
  const ready = loop.start();
  env.advance(100);
  expect(frame).toHaveBeenCalledOnce();
  expect(env.frames.size).toBe(0);
  pending.resolve();
  await ready;
  expect(env.frames.size).toBe(1);
  loop.dispose();
});
