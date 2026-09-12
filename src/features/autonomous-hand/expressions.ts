import { v, add, axis, qmul, type Vec3 } from '../scene-interactions/math';
import { HOME, pose, mix, type HandPose, type PoseName } from './rig';
import { minimumJerk, pulse } from './motion';
import type { ExpressionKind } from './commands';
export interface ExpressionStyle {
  amplitude: number;
  beats: number;
  lean: number;
}
const shape: Record<ExpressionKind, PoseName> = {
  scold: 'point',
  beckon: 'beckon',
  shrug: 'palm-up',
  approve: 'thumbs-up',
};
export function expressionPose(
  kind: ExpressionKind,
  time: number,
  style: ExpressionStyle,
  subject: Vec3
): HandPose {
  const p = pose(shape[kind]),
    towards = subject.y > 0 ? 0.08 : -0.1;
  p.root = add(HOME, v(0.24 + style.lean, 0.1 + towards, 0.12));
  if (kind === 'scold') {
    p.rotation = qmul(axis(v(0, 0, 1), -0.08), axis(v(0, 1, 0), 0.22));
    // Two or three unequal, separated strokes; each returns to a deliberate warning hold.
    let wag = 0;
    for (let i = 0; i < style.beats; i++) {
      const t = (time - 0.2 - i * 0.55) / 0.5;
      if (t > 0 && t < 1)
        wag +=
          Math.sin(t * Math.PI * 2) *
          Math.pow(Math.sin(t * Math.PI), 2) *
          (1 - i * 0.13);
    }
    p.rotation = qmul(
      p.rotation,
      axis(v(0, 0, 1), wag * 0.42 * style.amplitude)
    );
    p.root.x += wag * 0.035;
    p.joints[1] = qmul(p.joints[1], axis(v(0, 0, 1), wag * 0.055));
    p.joints[4] = qmul(p.joints[4], axis(v(1, 0, 0), -0.05 * wag));
  } else if (kind === 'beckon') {
    p.rotation = qmul(axis(v(0, 0, 1), -0.25), axis(v(1, 0, 0), -0.5));
    let curl = 0;
    for (let i = 0; i < 2; i++)
      curl += pulse(time, 0.2 + i * 0.72, 0.56 + i * 0.72) * (1 - i * 0.14);
    for (let i = 1; i <= 3; i++)
      p.joints[i] = qmul(
        p.joints[i],
        axis(v(1, 0, 0), curl * [0, 0.72, 1.04, 0.74][i])
      );
    p.root.z += 0.08 * curl;
    p.root.y += 0.04 * curl;
  } else if (kind === 'shrug') {
    const lift = pulse(time, 0.15, 1.05);
    p.root.y += 0.2 * lift * style.amplitude;
    p.rotation = qmul(p.rotation, axis(v(0, 1, 0), -0.22 * lift));
    for (const i of [1, 4, 7, 10])
      p.joints[i] = qmul(
        p.joints[i],
        axis(v(0, 0, 1), ((i - 5) / 18) * 0.22 * lift)
      );
  } else {
    const nod = pulse(time, 0.25, 0.62);
    p.root.y += 0.12 * nod;
    p.rotation = qmul(p.rotation, axis(v(1, 0, 0), -0.18 * nod));
  }
  return p;
}
export function prepareExpression(
  kind: ExpressionKind,
  t: number,
  style: ExpressionStyle,
  subject: Vec3
): HandPose {
  const target = expressionPose(kind, 0, style, subject);
  if (kind === 'scold') {
    const fist = pose('fist');
    fist.root = { ...target.root };
    fist.rotation = { ...target.rotation };
    return mix(fist, target, minimumJerk((t - 0.48) / 0.5));
  }
  return target;
}
