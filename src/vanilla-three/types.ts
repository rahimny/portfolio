export interface IExperience {
  init(signal?: AbortSignal): Promise<void>;
  dispose(): void;
  /** Optional: the experience's current Tweakpane state, for a share link. */
  getShareableState?(): unknown;
  /** Optional: apply a previously-exported state, e.g. from a share link. */
  setShareableState?(state: unknown): void;
}

/** A known capability limitation, distinct from an unexpected rendering failure. */
export class ExperienceUnavailableError extends Error {
  public readonly capability: 'webgpu';
  constructor(capability: 'webgpu', message: string) {
    super(message);
    this.capability = capability;
    this.name = 'ExperienceUnavailableError';
  }
}
