export type FieldMood = 'Breathing' | 'Gathering' | 'Frenzy' | 'Settling';
export interface Mood {
  name: FieldMood;
  orbit: boolean;
  speed: number;
  radius: number;
  energy: number;
}
/** A shared phrase keeps every automatic missile in the same musical section. */
export function fieldMood(
  time: number,
  excitement: number,
  frenzyUntil = 0
): Mood {
  const phase = ((time % 28) + 28) % 28;
  if (time < frenzyUntil || (phase >= 16 && phase < 21))
    return { name: 'Frenzy', orbit: false, speed: 1.6, radius: 3.1, energy: 1 };
  if (phase >= 21)
    return {
      name: 'Settling',
      orbit: true,
      speed: 0.48,
      radius: 3.9,
      energy: 0.18,
    };
  if (phase < 7 && excitement < 0.3)
    return {
      name: 'Breathing',
      orbit: true,
      speed: 0.32,
      radius: 3.9,
      energy: 0.08,
    };
  return {
    name: 'Gathering',
    orbit: true,
    speed: 0.8 + excitement * 0.7,
    radius: 3.25,
    energy: 0.35 + excitement * 0.4,
  };
}
