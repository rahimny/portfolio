import type {
  DomEffect,
  DomEffectPointer,
  DomEffectSize,
} from '@/features/dom-effects/types';
import { FlowField } from './FlowField';
import { PixelFlowRenderer } from './PixelFlowRenderer';
import type {
  PixelFlowSettings,
  PixelFlowSettingsStore,
} from './PixelFlowSettings';

const SETTLED_ENERGY = 0.002;

/** Pixel Flow implementation of the generic DOM effect contract. */
export class PixelFlowEffect implements DomEffect {
  private readonly renderer: PixelFlowRenderer;
  private readonly field: FlowField;
  private readonly unsubscribe: () => void;
  private size: DomEffectSize = { width: 1, height: 1 };
  private smoothedVelocity = { x: 0, y: 0 };
  private pendingPointer: DomEffectPointer | null = null;
  private velocitySmoothing = 0.4;

  constructor(canvas: HTMLCanvasElement, settings: PixelFlowSettingsStore) {
    this.renderer = new PixelFlowRenderer(canvas);
    this.field = new FlowField();
    this.unsubscribe = settings.subscribe((values) =>
      this.applySettings(values)
    );
  }

  public setSource(source: HTMLCanvasElement, size: DomEffectSize): void {
    this.size = size;
    this.renderer.setSource(source);
    this.field.resize(size.width, size.height);
  }

  public onPointerMove(pointer: DomEffectPointer): void {
    this.pendingPointer = this.pendingPointer
      ? {
          ...pointer,
          deltaX: this.pendingPointer.deltaX + pointer.deltaX,
          deltaY: this.pendingPointer.deltaY + pointer.deltaY,
        }
      : pointer;
  }

  public onPointerLeave(): void {
    this.smoothedVelocity = { x: 0, y: 0 };
  }

  public update(deltaTime: number): boolean {
    if (this.pendingPointer) {
      this.smoothedVelocity.x +=
        (this.pendingPointer.deltaX - this.smoothedVelocity.x) *
        this.velocitySmoothing;
      this.smoothedVelocity.y +=
        (this.pendingPointer.deltaY - this.smoothedVelocity.y) *
        this.velocitySmoothing;
      this.field.addImpulse(
        this.pendingPointer.x,
        this.pendingPointer.y,
        this.smoothedVelocity.x,
        this.smoothedVelocity.y
      );
      this.pendingPointer = null;
    }

    this.field.step(deltaTime);
    return this.field.energy > SETTLED_ENERGY;
  }

  public render(): void {
    this.renderer.render({
      width: this.field.textureWidth,
      height: this.field.textureHeight,
      data: this.field.textureData,
    });
  }

  public dispose(): void {
    this.unsubscribe();
    this.renderer.dispose();
  }

  private applySettings(settings: Readonly<PixelFlowSettings>): void {
    this.velocitySmoothing = settings.velocitySmoothing;
    this.renderer.setDisplacement(settings.offsetStrength);
    this.field.configure({
      gridSize: settings.gridSize,
      radius: settings.mouseRadius,
      impulse: settings.strength,
      relaxation: settings.relaxation,
    });

    if (this.size.width > 1 || this.size.height > 1) {
      this.field.resize(this.size.width, this.size.height);
    }
  }
}
