import { createNoise2D } from 'simplex-noise';
import { NatureRhythmEngine } from './NatureRhythmEngine';
import type { RhythmState } from './NatureRhythmEngine';
import { getAllEcosystems, selectNextEcosystem } from './EcosystemStates';
import type { EcosystemState } from './EcosystemStates';
import {
  generateJellyfishPattern,
  generateThermalPattern,
  generateEnhancedOrganicPattern,
  generateEnhancedDriftPattern,
  behavioralPatterns,
  disposeBehavioralLibrary,
} from './EcosystemMovementPatterns';
import type { MovementPatternContext } from './EcosystemMovementPatterns';

export interface MovementMood {
  name: string;
  speedMultiplier: number;
  scaleMultiplier: number;
  pattern: 'organic' | 'circular' | 'figure8' | 'drift';
  intensity: number;
  duration: number; // in seconds
}

export interface IdleSettings {
  idleTimeout: number;
  transitionDuration: number;
  enabled: boolean;
}

export class IdleMovementController {
  private noise2D: (x: number, y: number) => number;
  private rhythmEngine: NatureRhythmEngine;
  private isIdle = false;
  private lastUserInteraction = 0;
  private idleStartTime = 0;
  private currentEcosystemIndex = 0;
  private ecosystemStartTime = 0;
  private transitionProgress = 0;
  private noiseTime = 0;
  private baseNoiseOffset = {
    x: Math.random() * 1000,
    y: Math.random() * 1000,
  };
  private currentRhythms: RhythmState | null = null;
  private currentEcosystem: EcosystemState;
  private ecosystems: EcosystemState[];

  private settings: IdleSettings = {
    idleTimeout: 3000, // 3 seconds
    transitionDuration: 1000, // 1 second transition
    enabled: true,
  };

  constructor() {
    this.noise2D = createNoise2D();
    this.rhythmEngine = new NatureRhythmEngine();
    this.ecosystems = getAllEcosystems();
    this.currentEcosystem = this.ecosystems[0]; // Start with first ecosystem
    this.resetIdleTimer();
  }

  public forceIdle(): void {
    this.lastUserInteraction = Date.now() - 10000;
  }

  public resetIdleTimer(): void {
    this.lastUserInteraction = Date.now();

    if (this.isIdle) {
      this.isIdle = false;
      this.transitionProgress = 0;
    }
  }

  public update(deltaTime: number): {
    shouldUseAutoMovement: boolean;
    position: { x: number; y: number } | null;
    transitionFactor: number;
    rhythms: RhythmState | null;
  } {
    if (!this.settings.enabled) {
      return {
        shouldUseAutoMovement: false,
        position: null,
        transitionFactor: 0,
        rhythms: null,
      };
    }

    const now = Date.now();
    const timeSinceLastInteraction = now - this.lastUserInteraction;

    // Check if we should enter idle state
    if (!this.isIdle && timeSinceLastInteraction > this.settings.idleTimeout) {
      this.isIdle = true;
      this.idleStartTime = now;
      this.ecosystemStartTime = now;
      this.transitionProgress = 0;
    }

    if (!this.isIdle) {
      return {
        shouldUseAutoMovement: false,
        position: null,
        transitionFactor: 0,
        rhythms: null,
      };
    }

    // Update transition progress
    const transitionTime = Math.min(
      now - this.idleStartTime,
      this.settings.transitionDuration
    );
    this.transitionProgress = transitionTime / this.settings.transitionDuration;

    // Update nature rhythms
    this.currentRhythms = this.rhythmEngine.updateRhythms();

    // Handle ecosystem changes with rhythm influence
    this.updateEcosystem(now);

    // Generate movement
    this.noiseTime += deltaTime;
    const position = this.generateMovement();

    return {
      shouldUseAutoMovement: true,
      position,
      transitionFactor: this.transitionProgress,
      rhythms: this.currentRhythms,
    };
  }

  private updateEcosystem(now: number): void {
    const ecosystemDuration = this.currentEcosystem.duration * 1000; // Convert to milliseconds
    const rhythms = this.currentRhythms;

    if (now - this.ecosystemStartTime > ecosystemDuration) {
      // Smart ecosystem selection based on rhythm state
      if (rhythms) {
        this.currentEcosystem = selectNextEcosystem(
          this.currentEcosystem,
          rhythms.intensity
        );
      } else {
        // Fallback to simple rotation
        this.currentEcosystemIndex =
          (this.currentEcosystemIndex + 1) % this.ecosystems.length;
        this.currentEcosystem = this.ecosystems[this.currentEcosystemIndex];
      }

      this.ecosystemStartTime = now;
      console.log(
        `Ecosystem changed to: ${this.currentEcosystem.name} (${this.currentEcosystem.category})`
      );
    }
  }

  private generateMovement(): { x: number; y: number } {
    const ecosystem = this.currentEcosystem;
    const rhythms = this.currentRhythms;

    // Apply rhythm modulation to movement parameters
    const rhythmSpeedMultiplier = rhythms ? 0.5 + rhythms.overall * 0.5 : 1.0;
    const rhythmIntensityMultiplier = rhythms
      ? 0.5 + rhythms.intensity * 0.5
      : 1.0;

    // Apply ecosystem-specific rhythm influences
    const breathingInfluence = rhythms
      ? rhythms.breathing * ecosystem.breathingInfluence
      : 0.5;
    const pulseInfluence = rhythms
      ? rhythms.pulse * ecosystem.pulseInfluence
      : 0.5;
    const chaosInfluence = rhythms
      ? rhythms.chaos * ecosystem.chaosInfluence
      : 0.1;

    const time =
      this.noiseTime * ecosystem.speedMultiplier * rhythmSpeedMultiplier;

    // Create movement pattern context
    const context: MovementPatternContext = {
      time,
      noiseFunction: this.noise2D,
      baseOffset: this.baseNoiseOffset,
      scaleMultiplier: ecosystem.scaleMultiplier,
      intensity: ecosystem.intensity * rhythmIntensityMultiplier,
      breathingRhythm: breathingInfluence,
      pulseRhythm: pulseInfluence,
      chaosLevel: chaosInfluence,
    };

    let position: { x: number; y: number };

    switch (ecosystem.pattern) {
      case 'jellyfish':
        position = generateJellyfishPattern(context);
        break;
      case 'thermal':
        position = generateThermalPattern(context);
        break;
      case 'schoolingFish':
        position = behavioralPatterns.schoolingFish(context);
        break;
      case 'seaweedSway':
        position = behavioralPatterns.seaweedSway(context);
        break;
      case 'organic':
        position = generateEnhancedOrganicPattern(context);
        break;
      case 'drift':
        position = generateEnhancedDriftPattern(context);
        break;
      case 'circular': {
        const radius =
          0.4 *
          ecosystem.scaleMultiplier *
          ecosystem.intensity *
          rhythmIntensityMultiplier;
        const angle = time * 0.001;
        // Add some drift to the center position
        const centerDrift = Math.sin(time * 0.0002) * 0.1;
        position = {
          x: 0.5 + centerDrift + Math.cos(angle) * radius,
          y: 0.5 + Math.sin(angle) * radius,
        };
        break;
      }
      case 'figure8': {
        const fig8Scale =
          0.35 *
          ecosystem.scaleMultiplier *
          ecosystem.intensity *
          rhythmIntensityMultiplier;
        const t = time * 0.0005;
        // Add asymmetry to make it more interesting
        position = {
          x: 0.5 + Math.sin(t) * fig8Scale,
          y: 0.5 + Math.sin(2 * t) * fig8Scale * 0.8,
        };
        break;
      }
      default:
        position = generateEnhancedOrganicPattern(context);
        break;
    }

    // Clamp to valid range
    position.x = Math.max(0.1, Math.min(0.9, position.x));
    position.y = Math.max(0.1, Math.min(0.9, position.y));

    return position;
  }

  public getCurrentEcosystem(): EcosystemState {
    return this.currentEcosystem;
  }

  public getSettings(): IdleSettings {
    return this.settings;
  }

  public updateSettings(newSettings: Partial<IdleSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
  }

  public getEcosystems(): EcosystemState[] {
    return this.ecosystems;
  }

  public setEcosystem(index: number): void {
    if (index >= 0 && index < this.ecosystems.length) {
      this.currentEcosystemIndex = index;
      this.currentEcosystem = this.ecosystems[index];
      this.ecosystemStartTime = Date.now();
    }
  }

  public setEcosystemByName(name: string): void {
    const ecosystem = this.ecosystems.find((eco) => eco.name === name);
    if (ecosystem) {
      this.currentEcosystem = ecosystem;
      this.currentEcosystemIndex = this.ecosystems.indexOf(ecosystem);
      this.ecosystemStartTime = Date.now();
    }
  }

  public getIdleState(): boolean {
    return this.isIdle;
  }

  public getCurrentRhythms(): RhythmState | null {
    return this.currentRhythms;
  }

  public getRhythmEngine(): NatureRhythmEngine {
    return this.rhythmEngine;
  }

  public dispose(): void {
    if (this.rhythmEngine) {
      this.rhythmEngine.dispose();
    }

    // Dispose behavioral library
    disposeBehavioralLibrary();
  }
}
