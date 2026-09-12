import {
  add,
  sub,
  mul,
  dot,
  rotate,
  inverse,
  identity,
  type Vec3,
  type Quat,
} from './math';
export type ActionKind = 'shoot' | 'poke' | 'flick';
export interface HandCommand {
  id: string;
  action: ActionKind;
  targetId: string;
}
/** All vectors and radius are in the receiving target’s local space; time is seconds. */
export interface LocalImpact {
  eventId: string;
  actionId: string;
  sourceId: string;
  targetId: string;
  simulationTime: number;
  point: Vec3;
  deltaVelocity: Vec3;
  radius: number;
}
export type Proxy =
  | { kind: 'sphere'; centre: Vec3; radius: number }
  | { kind: 'box'; min: Vec3; max: Vec3 };
export interface ImpactTarget {
  id: string;
  actions: readonly ActionKind[];
  visible: boolean;
  position: Vec3;
  rotation?: Quat;
  scale?: number;
  anchor: Vec3;
  proxies: readonly Proxy[];
  handling?: {
    home: Vec3;
    heldBy: 'visitor' | null;
    returning: boolean;
    completedReturns: number;
    strikeHome(contact: Vec3): void;
    cancelReturn(): void;
  };
  receiveImpact(impact: LocalImpact): 'applied' | 'ignored';
}
export interface ActionResult {
  actionId: string;
  targetId: string;
  kind: 'hit' | 'miss' | 'rejected' | 'target lost';
  point?: Vec3;
}
export interface Projectile {
  id: string;
  command: HandCommand;
  position: Vec3;
  velocity: Vec3;
  life: number;
}
export function sweep(a: Vec3, b: Vec3, p: Proxy): number | null {
  const d = sub(b, a);
  if (p.kind === 'sphere') {
    const o = sub(a, p.centre),
      c = dot(o, o) - p.radius * p.radius;
    if (c <= 0) return 0;
    const aa = dot(d, d),
      bb = dot(o, d),
      disc = bb * bb - aa * c;
    if (aa < 1e-12 || disc < 0) return null;
    const t = (-bb - Math.sqrt(disc)) / aa;
    return t >= 0 && t <= 1 ? t : null;
  }
  let lo = 0,
    hi = 1;
  for (const k of ['x', 'y', 'z'] as const) {
    if (Math.abs(d[k]) < 1e-9) {
      if (a[k] < p.min[k] || a[k] > p.max[k]) return null;
      continue;
    }
    const t1 = (p.min[k] - a[k]) / d[k],
      t2 = (p.max[k] - a[k]) / d[k];
    lo = Math.max(lo, Math.min(t1, t2));
    hi = Math.min(hi, Math.max(t1, t2));
    if (lo > hi) return null;
  }
  return lo;
}
export class InteractionWorld {
  readonly targets = new Map<string, ImpactTarget>();
  readonly projectiles: Projectile[] = [];
  readonly results: ActionResult[] = [];
  private delivered = new Set<string>();
  private disposed = false;
  register(target: ImpactTarget): () => void {
    if (this.disposed) throw new Error('Interaction world is disposed');
    if (this.targets.has(target.id)) throw new Error('Duplicate target');
    if ((target.scale ?? 1) <= 0)
      throw new Error('Target scale must be positive');
    this.targets.set(target.id, target);
    return () => {
      if (this.targets.get(target.id) === target)
        this.targets.delete(target.id);
    };
  }
  anchor(target: ImpactTarget): Vec3 {
    return add(
      target.position,
      rotate(
        mul(target.anchor, target.scale ?? 1),
        target.rotation ?? identity()
      )
    );
  }
  private local(target: ImpactTarget, p: Vec3): Vec3 {
    return mul(
      rotate(sub(p, target.position), inverse(target.rotation ?? identity())),
      1 / (target.scale ?? 1)
    );
  }
  launch(
    command: HandCommand,
    origin: Vec3,
    velocity: Vec3,
    shot = 0
  ): boolean {
    if (this.disposed || this.projectiles.length >= 24) return false;
    this.projectiles.push({
      id: `${command.id}:impact:${shot}`,
      command: { ...command },
      position: { ...origin },
      velocity: { ...velocity },
      life: 1.5,
    });
    return true;
  }
  contact(
    command: HandCommand,
    a: Vec3,
    b: Vec3,
    velocity: Vec3,
    time: number,
    radius: number,
    eventId = command.id + ':impact'
  ): boolean {
    if (this.disposed || this.delivered.has(eventId)) return false;
    let nearest: { target: ImpactTarget; t: number } | undefined;
    for (const target of this.targets.values()) {
      if (!target.visible || !target.actions.includes(command.action)) continue;
      const la = this.local(target, a),
        lb = this.local(target, b);
      for (const proxy of target.proxies) {
        const t = sweep(la, lb, proxy);
        if (t !== null && (!nearest || t < nearest.t)) nearest = { target, t };
      }
    }
    if (!nearest) return false;
    const { target, t } = nearest,
      point = add(a, mul(sub(b, a), t)),
      id = eventId;
    this.delivered.add(id);
    if (this.delivered.size > 512)
      this.delivered.delete(this.delivered.values().next().value!);
    const response = target.receiveImpact({
      eventId: id,
      actionId: command.id,
      sourceId: 'hand',
      targetId: target.id,
      simulationTime: time,
      point: this.local(target, point),
      deltaVelocity: mul(
        rotate(velocity, inverse(target.rotation ?? identity())),
        1 / (target.scale ?? 1)
      ),
      radius: radius / (target.scale ?? 1),
    });
    this.report({
      actionId: command.id,
      targetId: target.id,
      kind: response === 'applied' ? 'hit' : 'rejected',
      point,
    });
    return true;
  }
  report(result: ActionResult): void {
    this.results.push(result);
    if (this.results.length > 32) this.results.shift();
  }
  step(dt: number, time: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i],
        next = add(p.position, mul(p.velocity, dt));
      const target = this.targets.get(p.command.targetId);
      if (!target || !target.visible) {
        this.report({
          actionId: p.command.id,
          targetId: p.command.targetId,
          kind: 'target lost',
        });
        this.projectiles.splice(i, 1);
        continue;
      }
      p.life -= dt;
      if (
        this.contact(
          p.command,
          p.position,
          next,
          mul(p.velocity, 0.35),
          time,
          0.5,
          p.id
        )
      ) {
        this.projectiles.splice(i, 1);
        continue;
      }
      p.position = next;
      if (p.life <= 0) {
        this.report({
          actionId: p.command.id,
          targetId: p.command.targetId,
          kind: 'miss',
        });
        this.projectiles.splice(i, 1);
      }
    }
  }
  cancel(actionId?: string): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--)
      if (!actionId || this.projectiles[i].command.id === actionId)
        this.projectiles.splice(i, 1);
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancel();
    this.targets.clear();
    this.results.length = 0;
    this.delivered.clear();
  }
}
