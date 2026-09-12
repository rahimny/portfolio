/** The same weighted, curling approach is used by Helion and the masthead seekers. */
export function pursuitResponse(age: number, dt: number): number {
  return 1 - Math.exp(-dt * (3.2 + age * 1.8));
}

export function pursuitCurl(
  age: number,
  distance: number,
  phase: number
): number {
  return (
    Math.min(1, distance * 0.35) *
    Math.sin(age * 5.5 + phase) *
    0.9 *
    Math.exp(-age * 0.45)
  );
}

export function pursuitSpeed(age: number, power: number): number {
  return (4.4 + power * 0.75) * Math.min(1, 0.6 + age * 0.8);
}
