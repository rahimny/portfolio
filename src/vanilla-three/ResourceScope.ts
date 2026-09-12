/** Own resources across asynchronous acquisition, including results arriving after cancellation. */
export class ResourceScope {
  private readonly controller = new AbortController();
  private cleanups: (() => void)[] = [];

  public get signal(): AbortSignal {
    return this.controller.signal;
  }

  public defer(cleanup: () => void): void {
    if (this.signal.aborted) cleanup();
    else this.cleanups.push(cleanup);
  }

  public wait<T>(pending: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const abort = () => reject(this.signal.reason);
      if (this.signal.aborted) abort();
      else this.signal.addEventListener('abort', abort, { once: true });
      pending.then(resolve, reject).finally(() => {
        this.signal.removeEventListener('abort', abort);
      });
    });
  }

  public acquire<T>(
    pending: Promise<T>,
    release: (resource: T) => void
  ): Promise<T> {
    return this.wait(
      pending.then((resource) => {
        this.defer(() => release(resource));
        this.signal.throwIfAborted();
        return resource;
      })
    );
  }

  public dispose = (): void => {
    if (this.signal.aborted) return;
    this.controller.abort();
    const errors: unknown[] = [];
    for (const cleanup of this.cleanups.splice(0).reverse()) {
      try {
        cleanup();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw errors[0];
  };
}
