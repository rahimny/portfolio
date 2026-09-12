export interface DomEffectSize {
  width: number;
  height: number;
}

export interface DomEffectPointer {
  x: number;
  y: number;
  deltaX: number;
  deltaY: number;
}

/**
 * Contract for a canvas effect that complements a live DOM subtree.
 *
 * The host owns capture, resize, pointer routing, animation scheduling and the
 * visual hand-off. Implementations own only their simulation and rendering.
 * A Three.js scene can implement this interface just as readily as a small
 * purpose-built WebGL renderer.
 */
export interface DomEffect {
  setSource(source: HTMLCanvasElement, size: DomEffectSize): void;
  onPointerMove(pointer: DomEffectPointer): void;
  onPointerLeave(): void;
  update(deltaTime: number): boolean;
  render(): void;
  dispose(): void;
}
