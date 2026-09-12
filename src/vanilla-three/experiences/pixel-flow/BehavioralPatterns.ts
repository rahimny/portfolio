import type { MovementPatternContext } from './EcosystemMovementPatterns';

export interface BehavioralState {
  energy: number;
  phase: number;
}

export class BehavioralPatternLibrary {
  private behavioralState: BehavioralState;

  constructor() {
    this.behavioralState = {
      energy: 0.5,
      phase: 0,
    };
  }

  public generateSchoolingFish(ctx: MovementPatternContext): {
    x: number;
    y: number;
  } {
    const speed = 0.0008 * (0.5 + this.behavioralState.energy * 0.5);
    const time = ctx.time * speed;

    const centerX = 0.5 + Math.sin(time * 0.7) * 0.2 * ctx.scaleMultiplier;
    const centerY = 0.5 + Math.cos(time * 0.5) * 0.15 * ctx.scaleMultiplier;

    const offsetX = Math.sin(time * 2 + this.behavioralState.phase) * 0.05;
    const offsetY = Math.cos(time * 1.5 + this.behavioralState.phase) * 0.05;

    return { x: centerX + offsetX, y: centerY + offsetY };
  }

  public generateBirdMigration(ctx: MovementPatternContext): {
    x: number;
    y: number;
  } {
    const speed = 0.0006 * (0.3 + this.behavioralState.energy * 0.7);
    const time = ctx.time * speed;

    const angle = (time * 0.3) % (Math.PI * 2);
    const x = 0.5 + Math.cos(angle) * 0.3 * ctx.scaleMultiplier;
    const y = 0.5 + Math.sin(angle) * 0.2 * ctx.scaleMultiplier;

    return { x, y };
  }

  public generatePredatorStalking(ctx: MovementPatternContext): {
    x: number;
    y: number;
  } {
    const huntPhase = (ctx.time * 0.0003) % (Math.PI * 4);
    const isStriking = Math.sin(huntPhase) > 0.8;

    if (isStriking) {
      const speed = 0.003 * ctx.intensity;
      const x = 0.5 + Math.sin(ctx.time * speed) * 0.4;
      const y = 0.5 + Math.cos(ctx.time * speed * 0.8) * 0.3;
      return { x, y };
    } else {
      const speed = 0.0002;
      const time = ctx.time * speed;
      const x =
        0.5 +
        ctx.noiseFunction(time + ctx.baseOffset.x, 0) *
          0.3 *
          ctx.scaleMultiplier;
      const y =
        0.5 +
        ctx.noiseFunction(0, time + ctx.baseOffset.y) *
          0.3 *
          ctx.scaleMultiplier;
      return { x, y };
    }
  }

  public generateInsectSwarm(ctx: MovementPatternContext): {
    x: number;
    y: number;
  } {
    const speed = 0.002 * (0.5 + this.behavioralState.energy * 0.5);
    const time = ctx.time * speed;

    const centerX = 0.5 + Math.sin(time * 0.3) * 0.2;
    const centerY = 0.5 + Math.cos(time * 0.4) * 0.2;

    const offsetX =
      ctx.noiseFunction(time * 3, this.behavioralState.phase) * 0.1;
    const offsetY =
      ctx.noiseFunction(this.behavioralState.phase, time * 3) * 0.1;

    return { x: centerX + offsetX, y: centerY + offsetY };
  }

  public generateSeaweedSway(ctx: MovementPatternContext): {
    x: number;
    y: number;
  } {
    const speed = 0.0005;
    const time = ctx.time * speed;

    const anchorX = 0.5;
    const currentX = Math.sin(time) * 0.3 * ctx.scaleMultiplier;
    const currentY = Math.sin(time * 0.7) * 0.2 * ctx.scaleMultiplier;

    return { x: anchorX + currentX, y: 0.5 + currentY };
  }

  public generateTerritorialPatrol(ctx: MovementPatternContext): {
    x: number;
    y: number;
  } {
    const speed = 0.0004;
    const time = ctx.time * speed;

    const radius = 0.25 * ctx.scaleMultiplier;
    const angle = time % (Math.PI * 2);

    const x = 0.5 + Math.cos(angle) * radius;
    const y = 0.5 + Math.sin(angle) * radius;

    return { x, y };
  }

  public getBehavioralState(): BehavioralState {
    return { ...this.behavioralState };
  }

  public dispose(): void {
    // Cleanup if needed
  }
}
