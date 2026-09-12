/** A short, local raster accent in the blast's breakup phase. */
export function blastPixelation(age: number, power: number): number {
  if (!Number.isFinite(age) || !Number.isFinite(power)) return 0;
  if (age <= 0.14 || age >= 0.42 || power <= 0.9) return 0;
  const strength = Math.min(1, (power - 0.9) / 0.7);
  return Math.sin(((age - 0.14) / 0.28) * Math.PI) * strength;
}

export const BLAST_DURATION = 0.72;
