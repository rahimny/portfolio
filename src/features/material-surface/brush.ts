import type { Deposit } from './field';
export type Contact = { x: number; y: number; angle: number; pressure: number };

/** A finite reservoir feeding swept bristle bundles. Pressure broadens contact;
 * remaining load controls both coverage and the separation of bristle trails. */
export class LoadedBrush {
  load = 0;
  private previous?: Contact;
  private readonly tip: { scale: number; flow: number; round: boolean };
  constructor(tip = { scale: 1, flow: 1, round: false }) {
    this.tip = tip;
  }
  dip(amount = 0.045) {
    this.load = amount;
    this.previous = undefined;
  }
  lift() {
    this.previous = undefined;
  }
  release(amount: number) {
    const mass = Math.min(this.load, Math.max(0, amount));
    this.load -= mass;
    return mass;
  }
  drag(contact: Contact, dt: number, emit: (stamp: Deposit) => void) {
    if (contact.pressure <= 0) {
      this.lift();
      return;
    }
    const previous = this.previous ?? contact;
    const distance = Math.hypot(contact.x - previous.x, contact.y - previous.y);
    const count = Math.max(
      1,
      Math.ceil(distance / (0.025 * Math.sqrt(this.tip.scale)))
    );
    const used = Math.min(
      this.load,
      (distance * 0.0025 + dt * 0.008) * contact.pressure * this.tip.flow
    );
    const saturation = Math.min(1, this.load / 0.015);
    for (let sample = 0; sample < count; sample++) {
      const t = (sample + 0.5) / count;
      const x = previous.x + (contact.x - previous.x) * t;
      const y = previous.y + (contact.y - previous.y) * t;
      if (this.tip.round) {
        emit({
          x,
          y,
          radius: (0.1 + contact.pressure * 0.065) * this.tip.scale,
          mass: used / count,
        });
        continue;
      }
      const width = (0.13 + contact.pressure * 0.24) * this.tip.scale;
      for (let bristle = 0; bristle < 9; bristle++) {
        const offset = ((bristle - 4) * width) / 8;
        emit({
          x: x - Math.sin(contact.angle) * offset,
          y: y + Math.cos(contact.angle) * offset,
          radius: 0.038 + contact.pressure * 0.025,
          minorRadius: (width / 10) * (0.6 + saturation * 1.1),
          angle: contact.angle,
          mass: used / count / 9,
        });
      }
    }
    this.load -= used;
    this.previous = { ...contact };
  }
}

/** Surface tangents are orthonormal world-space directions, in metres. */
export function surfaceGravity(
  gravity: readonly [number, number, number],
  u: readonly [number, number, number],
  v: readonly [number, number, number]
): readonly [number, number] {
  const dot = (a: readonly number[]) =>
    a.reduce((sum, value, i) => sum + value * gravity[i], 0);
  return [dot(u), dot(v)];
}
