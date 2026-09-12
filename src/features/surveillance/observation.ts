import { MathUtils, Vector3 } from 'three';

/** Choose a floor position that leaves a comfortable elevation angle to the target. */
export function observationPosition(
  target: Vector3,
  preferred: Vector3,
  right: Vector3,
  forward: Vector3,
  halfWidth: number,
  eyeHeight: number,
  output: Vector3
) {
  const minDepth = -1.7;
  const maxDepth = 4.2;
  const constrain = (point: Vector3) =>
    right
      .clone()
      .multiplyScalar(MathUtils.clamp(point.dot(right), -halfWidth, halfWidth))
      .addScaledVector(
        forward,
        MathUtils.clamp(point.dot(forward), minDepth, maxDepth)
      );
  const comfortableDistance = Math.max(
    2.4,
    Math.abs(target.y - eyeHeight) / Math.tan(0.38)
  );
  const cost = (point: Vector3) => {
    const distance = Math.hypot(target.x - point.x, target.z - point.z);
    const strain = Math.max(0, comfortableDistance - distance);
    return point.distanceToSquared(preferred) + strain * strain * 24;
  };
  output.copy(constrain(preferred));
  let best = cost(output);
  // Sample the comfortable viewing circle; project candidates into the visible floor.
  // The target and preferred point are absolute, avoiding feedback drift as the body moves.
  for (let i = 0; i < 48; i++) {
    const angle = (i * Math.PI * 2) / 48;
    const candidate = constrain(
      new Vector3(
        target.x + Math.cos(angle) * comfortableDistance,
        0,
        target.z + Math.sin(angle) * comfortableDistance
      )
    );
    const score = cost(candidate);
    if (score < best) {
      best = score;
      output.copy(candidate);
    }
  }
  return output;
}
