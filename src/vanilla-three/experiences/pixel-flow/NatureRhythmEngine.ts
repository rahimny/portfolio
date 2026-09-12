import { createNoise2D } from 'simplex-noise';

export interface RhythmLayer {
  name: string;
  frequency: number; // cycles per minute
  amplitude: number; // 0-1 influence strength
  phase: number; // 0-2π offset
  enabled: boolean;
}

export interface NatureRhythms {
  microBreathing: RhythmLayer;
  mesoPulse: RhythmLayer;
  macroCircadian: RhythmLayer;
  chaosWeather: RhythmLayer;
}

export interface RhythmState {
  // Combined rhythm values (0-1)
  breathing: number;
  pulse: number;
  circadian: number;
  chaos: number;

  // Composite values for easy use
  overall: number; // master rhythm combining all layers
  intensity: number; // how active the system should be
  relaxation: number; // how much the system should decay
}

export class NatureRhythmEngine {
  private noise2D: (x: number, y: number) => number;
  private startTime: number;
  private lastChaosEvent: number;

  private rhythms: NatureRhythms = {
    // Fast breathing pattern - 4-7 breaths per minute
    microBreathing: {
      name: 'Breathing',
      frequency: 5.5, // breaths per minute
      amplitude: 0.8,
      phase: 0,
      enabled: true,
    },

    // Medium pulse - like a slow heartbeat
    mesoPulse: {
      name: 'Pulse',
      frequency: 1.2, // beats per minute
      amplitude: 0.6,
      phase: Math.PI / 4,
      enabled: true,
    },

    // Slow circadian-like cycle
    macroCircadian: {
      name: 'Circadian',
      frequency: 0.1, // 10-minute cycles
      amplitude: 0.4,
      phase: 0,
      enabled: true,
    },

    // Chaotic weather events
    chaosWeather: {
      name: 'Weather',
      frequency: 0.3, // random events every ~3 minutes
      amplitude: 0.9,
      phase: 0,
      enabled: true,
    },
  };

  constructor() {
    this.noise2D = createNoise2D();
    this.startTime = Date.now();
    this.lastChaosEvent = 0;
  }

  public updateRhythms(): RhythmState {
    const now = Date.now();
    const elapsed = (now - this.startTime) / 1000; // seconds since start
    const elapsedMinutes = elapsed / 60;

    // Calculate each rhythm layer
    const breathing = this.calculateRhythm(
      this.rhythms.microBreathing,
      elapsedMinutes
    );
    const pulse = this.calculateRhythm(this.rhythms.mesoPulse, elapsedMinutes);
    const circadian = this.calculateRhythm(
      this.rhythms.macroCircadian,
      elapsedMinutes
    );
    const chaos = this.calculateChaosLayer(elapsed);

    // Create composite values
    const overall = this.combineRhythms(breathing, pulse, circadian, chaos);
    const intensity = this.calculateIntensity(breathing, pulse, chaos);
    const relaxation = this.calculateRelaxation(circadian, chaos);

    return {
      breathing,
      pulse,
      circadian,
      chaos,
      overall,
      intensity,
      relaxation,
    };
  }

  private calculateRhythm(rhythm: RhythmLayer, elapsedMinutes: number): number {
    if (!rhythm.enabled) return 0.5;

    const cyclePosition =
      (elapsedMinutes * rhythm.frequency + rhythm.phase / (2 * Math.PI)) % 1;

    // Use sine wave for smooth, natural rhythm
    const sineValue = Math.sin(cyclePosition * 2 * Math.PI);

    // Convert from [-1, 1] to [0, 1] and apply amplitude
    return 0.5 + sineValue * rhythm.amplitude * 0.5;
  }

  private calculateChaosLayer(elapsedSeconds: number): number {
    const timeSinceLastEvent = elapsedSeconds - this.lastChaosEvent;

    // Base chaos from noise
    const baseNoise = this.noise2D(elapsedSeconds * 0.01, 0) * 0.5 + 0.5;

    // Periodic chaos events (like weather changes)
    const eventThreshold = 180; // ~3 minutes
    if (timeSinceLastEvent > eventThreshold && Math.random() < 0.1) {
      this.lastChaosEvent = elapsedSeconds;
      return Math.random() * 0.8 + 0.2; // Strong chaos event
    }

    // Decay from last event
    const decayFactor = Math.max(0, 1 - timeSinceLastEvent / eventThreshold);
    const eventChaos = decayFactor * 0.6;

    return Math.max(baseNoise, eventChaos);
  }

  private combineRhythms(
    breathing: number,
    pulse: number,
    circadian: number,
    chaos: number
  ): number {
    // Weighted combination of all rhythms
    const weights = {
      breathing: 0.4,
      pulse: 0.3,
      circadian: 0.2,
      chaos: 0.1,
    };

    return (
      breathing * weights.breathing +
      pulse * weights.pulse +
      circadian * weights.circadian +
      chaos * weights.chaos
    );
  }

  private calculateIntensity(
    breathing: number,
    pulse: number,
    chaos: number
  ): number {
    // Higher values during active breathing, strong pulse, or chaos events
    const breathingContrib = Math.pow(breathing, 2) * 0.4;
    const pulseContrib = pulse * 0.4;
    const chaosContrib = Math.pow(chaos, 1.5) * 0.2;

    return Math.min(1, breathingContrib + pulseContrib + chaosContrib);
  }

  private calculateRelaxation(circadian: number, chaos: number): number {
    // Higher relaxation during low circadian periods and low chaos
    const circadianFactor = 1 - circadian; // inverse relationship
    const chaosFactor = 1 - chaos;

    // Map to relaxation range [0.85, 0.98]
    const baseRelaxation = 0.85;
    const relaxationRange = 0.13;

    return baseRelaxation + circadianFactor * chaosFactor * relaxationRange;
  }

  // Public getters for debugging and control
  public getRhythms(): NatureRhythms {
    return { ...this.rhythms };
  }

  public updateRhythm(
    layerName: keyof NatureRhythms,
    updates: Partial<RhythmLayer>
  ): void {
    this.rhythms[layerName] = { ...this.rhythms[layerName], ...updates };
  }

  public resetChaos(): void {
    this.lastChaosEvent = 0;
  }

  public triggerChaosEvent(): void {
    this.lastChaosEvent = (Date.now() - this.startTime) / 1000;
  }

  public dispose(): void {
    // Clean up if needed
  }
}
