export type EcosystemPattern =
  | 'organic'
  | 'circular'
  | 'figure8'
  | 'drift'
  | 'jellyfish'
  | 'thermal'
  | 'schoolingFish'
  | 'seaweedSway';

export interface EcosystemState {
  name: string;
  category: 'calm' | 'dynamic' | 'transition';
  speedMultiplier: number;
  scaleMultiplier: number;
  pattern: EcosystemPattern;
  intensity: number;
  duration: number;
  breathingInfluence: number;
  pulseInfluence: number;
  chaosInfluence: number;
  transitionWeight: number;
  preferredTransitions: string[];
}

export interface EcosystemCollection {
  calm: EcosystemState[];
  dynamic: EcosystemState[];
  transition: EcosystemState[];
}

export const ECOSYSTEM_STATES: EcosystemCollection = {
  calm: [
    {
      name: 'Lake',
      category: 'calm',
      speedMultiplier: 0.1,
      scaleMultiplier: 1.5,
      pattern: 'drift',
      intensity: 0.2,
      duration: 25,
      breathingInfluence: 0.3,
      pulseInfluence: 0.1,
      chaosInfluence: 0.05,
      transitionWeight: 0.5,
      preferredTransitions: ['Ocean'],
    },
  ],

  dynamic: [
    {
      name: 'Ocean',
      category: 'dynamic',
      speedMultiplier: 0.8,
      scaleMultiplier: 1.8,
      pattern: 'figure8',
      intensity: 0.8,
      duration: 12,
      breathingInfluence: 0.4,
      pulseInfluence: 0.8,
      chaosInfluence: 0.3,
      transitionWeight: 0.7,
      preferredTransitions: ['Storm', 'Kelp'],
    },
    {
      name: 'Storm',
      category: 'dynamic',
      speedMultiplier: 1.2,
      scaleMultiplier: 2.0,
      pattern: 'organic',
      intensity: 1.0,
      duration: 8,
      breathingInfluence: 0.2,
      pulseInfluence: 0.6,
      chaosInfluence: 0.9,
      transitionWeight: 0.3,
      preferredTransitions: ['Wind', 'Ocean'],
    },
    {
      name: 'Jellyfish',
      category: 'dynamic',
      speedMultiplier: 0.5,
      scaleMultiplier: 1.0,
      pattern: 'jellyfish',
      intensity: 0.4,
      duration: 12,
      breathingInfluence: 0.5,
      pulseInfluence: 0.6,
      chaosInfluence: 0.1,
      transitionWeight: 0.5,
      preferredTransitions: ['Ocean'],
    },
    {
      name: 'Kelp',
      category: 'dynamic',
      speedMultiplier: 0.4,
      scaleMultiplier: 1.4,
      pattern: 'seaweedSway',
      intensity: 0.7,
      duration: 11,
      breathingInfluence: 0.6,
      pulseInfluence: 0.3,
      chaosInfluence: 0.2,
      transitionWeight: 0.6,
      preferredTransitions: ['Ocean', 'School'],
    },
    {
      name: 'School',
      category: 'dynamic',
      speedMultiplier: 0.7,
      scaleMultiplier: 1.3,
      pattern: 'schoolingFish',
      intensity: 0.6,
      duration: 10,
      breathingInfluence: 0.3,
      pulseInfluence: 0.7,
      chaosInfluence: 0.4,
      transitionWeight: 0.5,
      preferredTransitions: ['Ocean', 'Kelp'],
    },
  ],

  transition: [
    {
      name: 'Wind',
      category: 'transition',
      speedMultiplier: 0.9,
      scaleMultiplier: 1.6,
      pattern: 'circular',
      intensity: 0.6,
      duration: 5,
      breathingInfluence: 0.5,
      pulseInfluence: 0.5,
      chaosInfluence: 0.8,
      transitionWeight: 1.0,
      preferredTransitions: ['Storm'],
    },
  ],
};

export function getAllEcosystems(): EcosystemState[] {
  return [
    ...ECOSYSTEM_STATES.calm,
    ...ECOSYSTEM_STATES.dynamic,
    ...ECOSYSTEM_STATES.transition,
  ];
}

export function getEcosystemByName(name: string): EcosystemState | null {
  const all = getAllEcosystems();
  return all.find((eco) => eco.name === name) || null;
}

export function getEcosystemsByCategory(
  category: 'calm' | 'dynamic' | 'transition'
): EcosystemState[] {
  return ECOSYSTEM_STATES[category];
}

export function selectNextEcosystem(
  currentEcosystem: EcosystemState,
  rhythmIntensity: number
): EcosystemState {
  // Prefer transitions from current ecosystem
  const preferred = currentEcosystem.preferredTransitions
    .map((name) => getEcosystemByName(name))
    .filter((eco) => eco !== null) as EcosystemState[];

  if (preferred.length === 0) {
    return getAllEcosystems()[0]; // fallback
  }

  // Simple selection based on rhythm intensity
  if (rhythmIntensity > 0.7) {
    return preferred.find((eco) => eco.category === 'dynamic') || preferred[0];
  } else if (rhythmIntensity < 0.3) {
    return preferred.find((eco) => eco.category === 'calm') || preferred[0];
  } else {
    return preferred[Math.floor(Math.random() * preferred.length)];
  }
}
