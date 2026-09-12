import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import { HandTrackingManager } from './HandTrackingManager';

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  create: vi.fn(),
  getUserMedia: vi.fn(),
}));
vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: vi.fn().mockResolvedValue({}) },
  HandLandmarker: { createFromOptions: mocks.create },
}));

function environment() {
  const elements: { remove: ReturnType<typeof vi.fn> }[] = [];
  vi.stubGlobal('document', {
    body: { appendChild: vi.fn() },
    createElement: () => {
      const element = {
        style: {},
        remove: vi.fn(),
        pause: vi.fn(),
        play: vi.fn().mockResolvedValue(undefined),
        getContext: () => ({}),
      };
      elements.push(element);
      return element;
    },
  });
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: mocks.getUserMedia },
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  mocks.create.mockResolvedValue({ close: mocks.close });
  return elements;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('HandTrackingManager cancellation', () => {
  it('stops a late camera stream after leaving during the permission prompt', async () => {
    const elements = environment();
    let grant!: (stream: { getTracks(): { stop(): void }[] }) => void;
    mocks.getUserMedia.mockReturnValue(
      new Promise((resolve) => {
        grant = resolve;
      })
    );
    const stop = vi.fn();
    const manager = new HandTrackingManager(new PerspectiveCamera());
    const ready = manager.init();
    expect(manager.init()).toBe(ready);
    await vi.waitFor(() => expect(mocks.getUserMedia).toHaveBeenCalledOnce());
    manager.dispose();
    expect(await ready).toBe(false);
    grant({ getTracks: () => [{ stop }] });
    await Promise.resolve();
    expect(stop).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(elements).toHaveLength(3);
    elements.forEach((element) =>
      expect(element.remove).toHaveBeenCalledOnce()
    );
    manager.dispose();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('releases the model and overlays on camera denial and permits retry', async () => {
    const elements = environment();
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.getUserMedia.mockRejectedValue(new Error('denied'));
    const manager = new HandTrackingManager(new PerspectiveCamera());
    expect(await manager.init()).toBe(false);
    expect(mocks.close).toHaveBeenCalledOnce();
    elements.forEach((element) =>
      expect(element.remove).toHaveBeenCalledOnce()
    );
    expect(await manager.init()).toBe(false);
    expect(mocks.create).toHaveBeenCalledTimes(2);
    manager.dispose();
    errorLog.mockRestore();
  });
});
