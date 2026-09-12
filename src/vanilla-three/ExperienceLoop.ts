/** One owned loop with on-demand rendering when continuous motion is disabled. */
export class ExperienceLoop {
  private frameId: number | null = null;
  private previousTime: number | null = null;
  private visible = true;
  private disposed = false;
  private playing = true;
  private active = false;
  private failed = false;
  private dirty = false;
  private pending?: Promise<void>;
  private rendering = false;
  private readonly onError: (error: unknown) => void;
  private readonly motion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  );
  private readonly observer: IntersectionObserver;
  private readonly frame: (
    deltaSeconds: number,
    moving: boolean
  ) => void | Promise<void>;

  constructor(
    element: HTMLElement,
    frame: (deltaSeconds: number, moving: boolean) => void | Promise<void>,
    onError: (error: unknown) => void = console.error
  ) {
    this.frame = frame;
    this.onError = onError;
    this.observer = new IntersectionObserver((entries) => {
      this.visible = entries[entries.length - 1]?.isIntersecting ?? true;
      this.refresh();
    });
    this.observer.observe(element);
    document.addEventListener('visibilitychange', this.refresh);
    this.motion.addEventListener('change', this.refresh);
  }

  public get reducedMotion(): boolean {
    return this.motion.matches;
  }

  public setPlaying(playing: boolean): void {
    this.playing = playing;
    this.refresh();
  }

  /** Resolves only after the first frame has finished, including shader compilation. */
  public async start(): Promise<void> {
    if (this.disposed || this.failed) return;
    this.active = true;
    this.cancel();
    await this.render(performance.now());
    this.afterFrame();
  }

  public invalidate = (): void => {
    this.active = true;
    if (this.rendering) {
      this.dirty = true;
      return;
    }
    if (
      this.disposed ||
      this.failed ||
      !this.visible ||
      document.hidden ||
      this.frameId !== null
    )
      return;
    this.frameId = requestAnimationFrame(this.tick);
  };

  private refresh = (): void => {
    this.cancel();
    if (this.active) this.invalidate();
  };

  private cancel(): void {
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
    this.previousTime = null;
  }

  private tick = (now: number): void => {
    this.frameId = null;
    if (this.disposed || !this.visible || document.hidden) return;
    try {
      const result = this.render(now);
      if (result) void result.then(this.afterFrame, this.fail);
      else this.afterFrame();
    } catch (error) {
      this.fail(error);
    }
  };

  private fail = (error: unknown): void => {
    if (this.disposed || this.failed) return;
    this.failed = true;
    this.active = false;
    this.cancel();
    this.onError(error);
  };

  private afterFrame = (): void => {
    if (this.disposed) return;
    const requested = this.dirty;
    this.dirty = false;
    if (requested || (this.playing && !this.motion.matches)) this.invalidate();
  };

  private render(now: number): void | Promise<void> {
    const moving = this.playing && !this.motion.matches;
    const delta =
      moving && this.previousTime !== null
        ? Math.min(0.05, Math.max(0, (now - this.previousTime) / 1000))
        : 0;
    this.previousTime = now;
    this.rendering = true;
    try {
      const result = this.frame(delta, moving);
      if (result) {
        this.pending = result.finally(() => {
          this.pending = undefined;
          this.rendering = false;
        });
        return this.pending;
      }
      this.rendering = false;
    } catch (error) {
      this.rendering = false;
      throw error;
    }
  }

  public dispose(release?: () => void): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancel();
    this.observer.disconnect();
    document.removeEventListener('visibilitychange', this.refresh);
    this.motion.removeEventListener('change', this.refresh);
    // A cancelled RAF cannot cancel an in-flight GPU submission.
    if (this.pending)
      void this.pending.then(
        () => release?.(),
        () => release?.()
      );
    else release?.();
  }
}
