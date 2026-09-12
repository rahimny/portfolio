import { BehavioralPatternLibrary } from './BehavioralPatterns';

export interface MovementPatternContext {
  time: number;
  noiseFunction: (x: number, y: number) => number;
  baseOffset: { x: number; y: number };
  scaleMultiplier: number;
  intensity: number;
  breathingRhythm: number;
  pulseRhythm: number;
  chaosLevel: number;
}

// Global behavioral pattern library instance
let behavioralLibrary: BehavioralPatternLibrary | null = null;

function getBehavioralLibrary(): BehavioralPatternLibrary {
  if (!behavioralLibrary) {
    behavioralLibrary = new BehavioralPatternLibrary();
  }
  return behavioralLibrary;
}

export function generateJellyfishPattern(ctx: MovementPatternContext): {
  x: number;
  y: number;
} {
  const pulseCycle = Math.sin(ctx.time * 0.002) * 0.5 + 0.5;
  const breathingMod = 0.7 + ctx.breathingRhythm * 0.3;
  const baseRadius = 0.3 * ctx.scaleMultiplier * ctx.intensity * breathingMod;
  const pulseRadius = baseRadius * (0.6 + pulseCycle * 0.8);

  const angle = ctx.time * 0.0008;
  const centerX = 0.5 + Math.cos(angle * 0.3) * 0.25;
  const centerY = 0.5 + Math.sin(angle * 0.3) * 0.25;

  const noiseX =
    ctx.noiseFunction(ctx.time * 0.005 + ctx.baseOffset.x, 0) * 0.2;
  const noiseY =
    ctx.noiseFunction(0, ctx.time * 0.005 + ctx.baseOffset.y) * 0.2;

  return {
    x: centerX + Math.cos(angle) * pulseRadius + noiseX,
    y: centerY + Math.sin(angle) * pulseRadius + noiseY,
  };
}

export function generateKelpPattern(ctx: MovementPatternContext): {
  x: number;
  y: number;
} {
  const anchorY = 0.8;
  const currentStrength = 0.3 + ctx.pulseRhythm * 0.4;
  const swayX =
    Math.sin(ctx.time * 0.001) * currentStrength * ctx.scaleMultiplier;
  const swayY = Math.cos(ctx.time * 0.0007) * 0.2 * ctx.scaleMultiplier;
  const breathingY = ctx.breathingRhythm * 0.1;
  const flowNoise =
    ctx.noiseFunction(ctx.time * 0.003, ctx.baseOffset.y) * 0.15;

  return {
    x: 0.5 + swayX + flowNoise,
    y: anchorY - Math.abs(swayY) - breathingY,
  };
}

export function generateThermalPattern(ctx: MovementPatternContext): {
  x: number;
  y: number;
} {
  const thermalCycle = (ctx.time * 0.0005) % (Math.PI * 4);
  const spiralRadius = 0.35 * ctx.scaleMultiplier * ctx.intensity;

  const radiusVariation = Math.sin(thermalCycle * 0.5) * 0.3 + 0.7;
  const currentRadius = spiralRadius * radiusVariation;

  // More dramatic vertical movement
  const verticalCycle = Math.sin(ctx.time * 0.0003) * 0.4;
  const breathingInfluence = ctx.breathingRhythm * 0.3;

  // Vary center positions more dramatically
  const angle = thermalCycle;
  const centerX = 0.5 + Math.sin(ctx.time * 0.0002) * 0.3;
  const centerY = 0.5 + verticalCycle + breathingInfluence;

  // Increased turbulence
  const turbulence = ctx.chaosLevel * 0.2;
  const turbX =
    ctx.noiseFunction(ctx.time * 0.008, ctx.baseOffset.x) * turbulence;
  const turbY =
    ctx.noiseFunction(ctx.baseOffset.x, ctx.time * 0.008) * turbulence;

  return {
    x: centerX + Math.cos(angle) * currentRadius + turbX,
    y: centerY + Math.sin(angle) * currentRadius * 0.8 + turbY,
  };
}

export function generateMigrationPattern(ctx: MovementPatternContext): {
  x: number;
  y: number;
} {
  // Migration: coordinated directional movement
  const migrationPhase = (ctx.time * 0.0003) % (Math.PI * 2);
  const formationTightness = 0.8 + ctx.pulseRhythm * 0.2;

  // V-formation or line formation
  const useVFormation = ctx.chaosLevel < 0.5;

  if (useVFormation) {
    // V-formation like birds
    const vAngle = Math.PI * 0.2; // 36 degree V
    const distanceFromLeader = 0.3 * ctx.scaleMultiplier;
    const leaderX = 0.3 + Math.sin(migrationPhase) * 0.2;
    const leaderY = 0.5 + Math.cos(migrationPhase * 0.7) * 0.1;

    // Follow leader with V offset
    const side = Math.sin(ctx.time * 0.001) > 0 ? 1 : -1;
    const offsetX =
      Math.cos(vAngle) * distanceFromLeader * side * formationTightness;
    const offsetY = Math.sin(vAngle) * distanceFromLeader * formationTightness;

    return {
      x: leaderX + offsetX,
      y: leaderY + offsetY,
    };
  } else {
    // Line formation like fish school
    const schoolDirection = migrationPhase;
    const schoolSpeed = 0.2 * ctx.intensity;
    const cohesionRadius = 0.15 * formationTightness;

    // Move in formation
    const formationX = 0.5 + Math.cos(schoolDirection) * schoolSpeed;
    const formationY = 0.5 + Math.sin(schoolDirection) * schoolSpeed * 0.5;

    // Add slight randomness for natural feel
    const randomOffset =
      ctx.noiseFunction(ctx.time * 0.004, ctx.baseOffset.x) * cohesionRadius;

    return {
      x: formationX + randomOffset,
      y:
        formationY +
        ctx.noiseFunction(ctx.baseOffset.y, ctx.time * 0.004) * cohesionRadius,
    };
  }
}

// Enhanced organic pattern with rhythm integration
export function generateEnhancedOrganicPattern(ctx: MovementPatternContext): {
  x: number;
  y: number;
} {
  // Multi-layered organic movement with rhythm integration
  const breathingScale = 0.8 + ctx.breathingRhythm * 0.4;
  const pulseSpeed = 0.8 + ctx.pulseRhythm * 0.4;

  // Primary organic flow
  const primaryX =
    ctx.noiseFunction(ctx.time * 0.01 * pulseSpeed + ctx.baseOffset.x, 0) *
    ctx.scaleMultiplier *
    ctx.intensity *
    breathingScale;

  const primaryY =
    ctx.noiseFunction(0, ctx.time * 0.01 * pulseSpeed + ctx.baseOffset.y) *
    ctx.scaleMultiplier *
    ctx.intensity *
    breathingScale;

  // Secondary layer for complexity
  const secondaryScale = 0.3 * ctx.chaosLevel;
  const secondaryX =
    ctx.noiseFunction(
      ctx.time * 0.003 + ctx.baseOffset.x + 100,
      ctx.time * 0.002
    ) * secondaryScale;

  const secondaryY =
    ctx.noiseFunction(
      ctx.time * 0.002 + 200,
      ctx.time * 0.003 + ctx.baseOffset.y
    ) * secondaryScale;

  return {
    x: 0.5 + primaryX + secondaryX,
    y: 0.5 + primaryY + secondaryY,
  };
}

// Enhanced drift pattern with environmental influences
export function generateEnhancedDriftPattern(ctx: MovementPatternContext): {
  x: number;
  y: number;
} {
  const driftSpeed = 0.0003 * (0.7 + ctx.pulseRhythm * 0.6);
  const environmentalPush = ctx.chaosLevel * 0.4;

  // Main drift with environmental influence
  const driftX =
    ctx.noiseFunction(
      ctx.time * driftSpeed + ctx.baseOffset.x,
      ctx.time * driftSpeed * 0.7
    ) *
    ctx.scaleMultiplier *
    ctx.intensity;

  const driftY =
    ctx.noiseFunction(
      ctx.time * driftSpeed * 1.3,
      ctx.time * driftSpeed + ctx.baseOffset.y
    ) *
    ctx.scaleMultiplier *
    ctx.intensity;

  // Environmental push (like wind or current)
  const pushAngle = ctx.time * 0.0001;
  const pushX = Math.cos(pushAngle) * environmentalPush * 0.1;
  const pushY = Math.sin(pushAngle) * environmentalPush * 0.1;

  // Breathing influence on buoyancy
  const buoyancy = ctx.breathingRhythm * 0.05;

  return {
    x: 0.5 + driftX + pushX,
    y: 0.5 + driftY + pushY - buoyancy,
  };
}

// Advanced behavioral patterns using the behavioral library
// Movement pattern functions that use behavioral library
export const behavioralPatterns = {
  schoolingFish: (ctx: MovementPatternContext) =>
    getBehavioralLibrary().generateSchoolingFish(ctx),
  birdMigration: (ctx: MovementPatternContext) =>
    getBehavioralLibrary().generateBirdMigration(ctx),
  predatorStalking: (ctx: MovementPatternContext) =>
    getBehavioralLibrary().generatePredatorStalking(ctx),
  insectSwarm: (ctx: MovementPatternContext) =>
    getBehavioralLibrary().generateInsectSwarm(ctx),
  seaweedSway: (ctx: MovementPatternContext) =>
    getBehavioralLibrary().generateSeaweedSway(ctx),
  territorialPatrol: (ctx: MovementPatternContext) =>
    getBehavioralLibrary().generateTerritorialPatrol(ctx),
};

export function disposeBehavioralLibrary(): void {
  if (behavioralLibrary) {
    behavioralLibrary.dispose();
    behavioralLibrary = null;
  }
}
