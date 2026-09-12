import type { EcosystemState } from './EcosystemStates';
import type { RhythmState } from './NatureRhythmEngine';

export interface OrchestrationState {
  distortion: number;
  strength: number;
  relaxation: number;
  mouseRadius: number;
}

export class ParameterOrchestra {
  private currentState: OrchestrationState;
  private baseSettings: OrchestrationState;
  private buildupPhase = 0;
  private lastBuildupTime = 0;
  private buildupDecayRate = 0.0008;
  private holdDuration = 3000;
  private isInHoldPhase = false;
  private holdStartTime = 0;

  constructor(baseSettings: OrchestrationState) {
    this.baseSettings = { ...baseSettings };
    this.currentState = { ...baseSettings };
  }

  public updateBaseSettings(newSettings: Partial<OrchestrationState>): void {
    Object.assign(this.baseSettings, newSettings);
  }

  public orchestrate(
    ecosystem: EcosystemState,
    rhythms: RhythmState | null,
    deltaTime: number
  ): OrchestrationState {
    if (!rhythms) {
      return this.baseSettings;
    }

    const now = Date.now();

    const shouldTriggerBuildup =
      rhythms.chaos > 0.8 &&
      rhythms.intensity > 0.7 &&
      now - this.lastBuildupTime > 8000 &&
      Math.random() < 0.02;

    if (shouldTriggerBuildup) {
      this.buildupPhase = 1.0;
      this.lastBuildupTime = now;
      this.isInHoldPhase = true;
      this.holdStartTime = now;
    }

    if (this.isInHoldPhase) {
      if (now - this.holdStartTime > this.holdDuration) {
        this.isInHoldPhase = false;
        console.log('🌀 Hold phase complete, starting slow decay...');
      }
    } else if (this.buildupPhase > 0) {
      this.buildupPhase = Math.max(
        0,
        this.buildupPhase - this.buildupDecayRate * deltaTime
      );
    }

    const breathingMod = rhythms.breathing * 0.15;
    const pulseMod = rhythms.pulse * 0.2;
    const chaosMod = rhythms.chaos * 0.25;

    const breathingInfluence = ecosystem.breathingInfluence * breathingMod;
    const pulseInfluence = ecosystem.pulseInfluence * pulseMod;
    const chaosInfluence = ecosystem.chaosInfluence * chaosMod;

    const mouseRadiusBase = this.baseSettings.mouseRadius;
    const mouseRadiusFluctuation =
      Math.sin(now * 0.001) * 0.3 + rhythms.pulse * 0.4 + rhythms.chaos * 0.5;

    const mouseRadius = mouseRadiusBase * (0.5 + mouseRadiusFluctuation);

    let relaxation = this.baseSettings.relaxation * (1 - chaosInfluence * 0.1);

    // during buildup phase, relaxation approaches 1.0
    if (this.buildupPhase > 0) {
      const buildupIntensity = this.buildupPhase * this.buildupPhase; // Squared for sharper curve
      relaxation = relaxation * (1 - buildupIntensity) + 1.0 * buildupIntensity;
    }

    // Calculate modulated values
    this.currentState = {
      distortion:
        this.baseSettings.distortion *
        (1 + breathingInfluence + chaosInfluence),
      strength:
        this.baseSettings.strength * (1 + pulseInfluence + breathingInfluence),
      relaxation,
      mouseRadius,
    };

    this.currentState.distortion = Math.max(
      0.005,
      Math.min(0.1, this.currentState.distortion)
    );
    this.currentState.strength = Math.max(
      0.1,
      Math.min(1.5, this.currentState.strength)
    );
    this.currentState.relaxation = Math.max(
      0.5,
      Math.min(1.0, this.currentState.relaxation)
    );
    this.currentState.mouseRadius = Math.max(
      0.05,
      Math.min(1.0, this.currentState.mouseRadius)
    );

    return this.currentState;
  }

  public getCurrentState(): OrchestrationState {
    return { ...this.currentState };
  }

  public triggerBuildup(): void {
    this.buildupPhase = 1.0;
    this.lastBuildupTime = Date.now();
    this.isInHoldPhase = true;
    this.holdStartTime = Date.now();
  }

  public dispose(): void {
    // Cleanup if needed
  }
}
