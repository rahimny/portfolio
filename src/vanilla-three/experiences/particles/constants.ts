import * as THREE from 'three/webgpu';

// Reusable type definitions
export interface CameraConfig {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  fov: number;
}

export interface LightConfig {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  intensity: number;
  angle: number;
  penumbra: number;
}

export interface WorldConfig {
  size: number;
  rendererOffset: number;
}

export interface ParticleSettings {
  maxParticles: number;
  particles: number;
  actualSize: number;
  size: number;
  points: boolean;
}

export interface SimulationSettings {
  noise: number;
  speed: number;
  stiffness: number;
  restDensity: number;
  density: number;
  dynamicViscosity: number;
  gravity: number;
  gravitySensorReading: THREE.Vector3;
  accelerometerReading: THREE.Vector3;
}

export interface RenderSettings {
  bloom: boolean;
  gui: null;
  run: boolean;
}

// Main config with clear nested structure
export interface ExperienceConfig {
  particles: ParticleSettings;
  simulation: SimulationSettings;
  rendering: RenderSettings;
  camera: CameraConfig;
  light: LightConfig;
  world: WorldConfig;
}

export const conf: ExperienceConfig = {
  particles: {
    maxParticles: 8192 * 16,
    particles: 8192 * 4,
    actualSize: 1,
    size: 1,
    points: true,
  },

  simulation: {
    noise: 1.0,
    speed: 1,
    stiffness: 3.0,
    restDensity: 1.0,
    density: 1,
    dynamicViscosity: 0.1,
    gravity: 0,
    gravitySensorReading: new THREE.Vector3(),
    accelerometerReading: new THREE.Vector3(),
  },

  rendering: {
    bloom: true,
    gui: null,
    run: true,
  },

  camera: {
    position: [0.008, 0.867, -0.874],
    target: [0.008, 0.611, 0.153],
    fov: 60,
  },

  light: {
    position: [0, 1.2, -0.8],
    target: [0, 0.7, 0],
    intensity: 5,
    angle: Math.PI * 0.18,
    penumbra: 1,
  },

  world: {
    size: 64,
    rendererOffset: -32,
  },
};
