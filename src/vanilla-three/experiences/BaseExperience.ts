import type { Renderer } from 'three/webgpu';
import type { IExperience } from '../types';

export interface ExperienceOptions {
  controlsContainer?: HTMLElement | null;
  onError?: (error: unknown) => void;
}

/**
 * Abstract base class for Three.js experiences.
 * Defines the minimal contract required by the ThreeCanvas component.
 * Subclasses must implement their own scene setup, animation loops, and cleanup logic.
 */
export abstract class BaseExperience implements IExperience {
  protected readonly canvas: HTMLCanvasElement;
  protected readonly options: ExperienceOptions;
  protected sizes!: { width: number; height: number; pixelRatio: number };

  constructor(canvas: HTMLCanvasElement, options: ExperienceOptions = {}) {
    this.canvas = canvas;
    this.options = options;
    this.updateSizes();
  }

  public updateSizes(): void {
    const width =
      this.canvas.parentElement?.clientWidth || this.canvas.clientWidth;
    const height =
      this.canvas.parentElement?.clientHeight || this.canvas.clientHeight;
    this.sizes = {
      width,
      height,
      pixelRatio: Math.min(window.devicePixelRatio, 2),
    };
  }

  /** Three reports some GPU failures outside the frame promise. Route them to the host too. */
  protected connectRendererErrors(
    renderer: Pick<Renderer, 'onError' | 'onDeviceLost'>
  ): void {
    const report = (cause: unknown) => {
      const message =
        typeof cause === 'object' && cause !== null && 'message' in cause
          ? String(cause.message)
          : String(cause);
      const error = cause instanceof Error ? cause : new Error(message);
      if (this.options.onError) this.options.onError(error);
      else console.error(error);
    };
    renderer.onError = report;
    renderer.onDeviceLost = report;
  }

  /**
   * Initialize the Three.js experience.
   * Should set up scene, camera, renderer, objects, animations, etc.
   */
  public abstract init(signal?: AbortSignal): Promise<void>;

  /**
   * Clean up all resources when the experience is destroyed.
   * Should cancel animation frames, dispose geometries/materials/renderer, remove event listeners, etc.
   */
  public abstract dispose(): void;
}
