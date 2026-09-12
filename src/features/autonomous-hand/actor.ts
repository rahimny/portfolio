import {
  InteractionWorld,
  sweep,
  type HandCommand,
  type ActionResult,
  type ActionKind,
} from '../scene-interactions/world';
import {
  v,
  add,
  sub,
  mul,
  length,
  dot,
  identity,
  between,
  qmul,
  qlerp,
  axis,
  clamp,
  lerp,
  unit,
  type Vec3,
} from '../scene-interactions/math';
import {
  HOME,
  JOINTS,
  pose,
  mix,
  idle,
  socket,
  aimHand,
  type HandPose,
} from './rig';
import { PoseMotion, minimumJerk } from './motion';
import { isPhysical, type ActorCommand, type ExpressionKind } from './commands';
import {
  expressionPose,
  prepareExpression,
  type ExpressionStyle,
} from './expressions';
export type Personality = 'deliberate' | 'erratic';
export type Phase =
  | 'rest'
  | 'attend'
  | 'anticipate'
  | 'act'
  | 'recover'
  | 'inspect';
export interface PhaseEvent {
  time: number;
  actionId: string;
  kind: string;
}
export const ACTIONS: readonly ActionKind[] = ['shoot', 'poke', 'flick'];

export class HandActor {
  phase: Phase = 'rest';
  personality: Personality = 'deliberate';
  requestedPersonality: Personality = 'deliberate';
  automatic = true;
  time = 0;
  elapsed = 0;
  pose: HandPose;
  command?: ActorCommand;
  outcome?: ActionResult['kind'];
  readonly events: PhaseEvent[] = [];
  readonly motion: PoseMotion;
  readonly world: InteractionWorld;
  private start: HandPose;
  private goal: HandPose;
  private aim = v();
  private state: number;
  private sequence = 0;
  private released = false;
  private contacted = false;
  private previousTip = v();
  agitation = 0;
  interruptions = 0;
  corrections = 0;
  intention = 'Everything has its place.';
  private strikeDirection = v(1, 0, 0);
  private strikePose?: HandPose;
  private lastInterference = -100;
  private disposed = false;
  private duration = 1.4;
  private style: ExpressionStyle = { amplitude: 1, beats: 2, lean: 0 };
  private tempo = 1;
  private restVariation = 0;
  private restOffset = v();
  private reaction?: { action: ExpressionKind; targetId: string };
  private cancelled = false;
  constructor(world: InteractionWorld, seed: number) {
    this.world = world;
    this.state = seed >>> 0 || 1;
    this.motion = new PoseMotion(idle(0, false));
    this.pose = this.motion.value;
    this.start = structuredClone(this.pose);
    this.goal = structuredClone(this.pose);
  }
  private random(): number {
    let s = this.state;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.state = s >>> 0;
    return this.state / 4294967296;
  }
  private event(kind: string): void {
    this.events.push({
      time: this.time,
      actionId: this.command?.id ?? 'hand',
      kind,
    });
    if (this.events.length > 24) this.events.shift();
  }
  request(
    command: ActorCommand
  ): 'accepted' | 'busy' | 'unsupported' | 'unavailable' {
    if (this.disposed) return 'unavailable';
    if (this.phase !== 'rest') return 'busy';
    const target = this.world.targets.get(command.targetId);
    if (
      !target ||
      !target.visible ||
      length(sub(this.world.anchor(target), HOME)) > 7
    )
      return 'unavailable';
    if (
      (command.action === 'return' && !target.handling) ||
      (isPhysical(command) && !target.actions.includes(command.action))
    )
      return 'unsupported';
    this.command = { ...command };
    this.outcome = undefined;
    this.aim = this.world.anchor(target);
    this.strikeDirection = target.handling
      ? unit(sub(target.handling.home, this.aim))
      : v(1, 0, 0);
    if (length(this.strikeDirection) < 0.1) this.strikeDirection = v(1, 0, 0);
    this.strikePose = undefined;
    this.released = false;
    this.shotsFired = 0;
    this.nextShot = 0.14;
    this.burstSize = this.personality === 'erratic' ? 30 : 24;
    if (command.action === 'shoot') {
      this.intention = 'Watch this.';
      this.nextShowTime = this.time + 10;
    }
    this.contacted = false;
    this.cancelled = false;
    this.reaction = undefined;
    this.tempo = 0.94 + this.random() * 0.16;
    this.style = {
      amplitude:
        (0.88 + this.random() * 0.24) *
        (this.personality === 'erratic' ? 1.16 : 1 + this.agitation * 0.18),
      beats:
        this.random() > (this.personality === 'erratic' ? 0.3 : 0.65) ? 3 : 2,
      lean: (this.random() - 0.5) * 0.16,
    };
    this.enter(
      'attend',
      command.action === 'return'
        ? 0.06
        : (this.personality === 'erratic' ? 0.35 : 0.46) * this.tempo
    );
    return 'accepted';
  }
  setPersonality(value: Personality): void {
    this.requestedPersonality = value;
    if (this.phase === 'rest') this.personality = value;
  }
  disturb(): void {
    this.interruptions++;
    this.agitation = clamp(this.agitation + 0.28);
    this.lastInterference = this.time;
    this.intention =
      this.interruptions === 1 ? 'That goes over here.' : 'Again?';
    if (this.automatic || this.command?.action === 'return') {
      this.cancel('interrupted');
      this.reaction = undefined;
      this.enter('rest', 0.06);
    }
  }
  private resting(): HandPose {
    const p = idle(
      this.time,
      this.personality === 'erratic',
      this.restVariation
    );
    p.root = add(p.root, this.restOffset);
    const subject = this.world.targets.get('puck');
    if (subject && this.interruptions) {
      const towards = sub(subject.position, HOME);
      p.root = add(p.root, mul(towards, 0.08 + this.agitation * 0.06));
      p.rotation = qmul(
        p.rotation,
        axis(v(0, 0, 1), clamp(towards.x * -0.04, -0.15, 0.15))
      );
    }
    return p;
  }
  private aimed(root: Vec3): HandPose {
    const p = pose(this.command?.action === 'shoot' ? 'gun' : 'point');
    p.root = { ...root };
    return aimHand(p, this.aim, 0.3 + this.style.lean);
  }
  private preparation(): HandPose {
    const p = this.aimed(
      add(
        HOME,
        v(this.style.lean, 0, this.command?.action === 'shoot' ? 0.6 : 0)
      )
    );
    if (this.command?.action !== 'shoot') {
      const s = socket(p);
      p.root = add(
        p.root,
        sub(add(this.aim, mul(s.direction, -0.5)), s.position)
      );
      if (this.command?.action === 'flick') p.joints = pose('pinch').joints;
    }
    return p;
  }
  private enter(phase: Phase, duration: number): void {
    this.phase = phase;
    this.elapsed = 0;
    this.duration = duration;
    this.start = structuredClone(this.pose);
    this.event(phase);
    if (phase === 'act') {
      this.previousTip = socket(this.pose).position;
    }
    if (phase === 'recover') {
      // Uncurl in place before travelling home, retaining attention on the consequence.
      this.goal = this.resting();
      this.goal.root = add(this.pose.root, v(-0.12, 0.12, 0.08));
      this.goal.rotation = qlerp(this.pose.rotation, this.goal.rotation, 0.35);
    }
    if (phase === 'inspect') {
      this.personality = this.requestedPersonality;
      this.goal = this.resting();
      this.goal.root = add(
        HOME,
        v(this.style.lean + 0.12, this.outcome === 'hit' ? 0.1 : 0.22, 0.06)
      );
      this.goal.rotation = qmul(
        this.goal.rotation,
        axis(v(0, 1, 0), this.outcome === 'hit' ? -0.1 : 0.22)
      );
    }
    if (phase === 'rest') {
      this.command = undefined;
      this.personality = this.requestedPersonality;
      this.restVariation = this.random() * Math.PI * 2;
      this.restOffset = v(
        (this.random() - 0.5) * 0.26,
        (this.random() - 0.5) * 0.15,
        (this.random() - 0.5) * 0.08
      );
    }
  }
  cancel(reason = 'cancelled'): void {
    if (!this.command || this.cancelled) return;
    this.cancelled = true;
    const handling = this.world.targets.get(this.command.targetId)?.handling;
    handling?.cancelReturn();
    this.reaction = undefined;
    this.world.cancel(this.command.id);
    this.event(reason);
    this.enter('recover', 0.65);
  }
  private choose(): void {
    const puck = this.world.targets.get('puck');
    const handling = puck?.handling;
    if (puck && handling) {
      if (handling.heldBy === 'visitor') {
        this.intention =
          this.agitation > 0.5 ? 'Try me.' : 'I see what you are doing.';
        this.elapsed = 0;
        return;
      }
      if (
        length(sub(puck.position, handling.home)) > 0.16 &&
        !handling.returning
      ) {
        this.intention =
          this.agitation > 0.5 ? 'Back. Now.' : 'Right back where it belongs.';
        this.request({
          id: `auto-${++this.sequence}`,
          action: 'return',
          targetId: puck.id,
        });
        return;
      }
    }
    if (this.reaction) {
      const reaction = this.reaction;
      this.reaction = undefined;
      if (
        this.request({ id: `auto-${++this.sequence}`, ...reaction }) ===
        'accepted'
      )
        return;
    }
    // Boredom turns into another performance; visitor interference always takes priority.
    if (
      this.time >= this.nextShowTime &&
      this.time - this.lastInterference > 3
    ) {
      this.request({
        id: `auto-${++this.sequence}`,
        action: 'shoot',
        targetId: 'ink',
      });
      return;
    }
    this.intention =
      this.agitation > 0.3 ? 'Leave it there.' : 'Bet I can do that again.';
    this.elapsed = 0;
  }

  private readResult(): void {
    if (!this.command || this.outcome === 'hit') return;
    const results = this.world.results.filter(
      (r) => r.actionId === this.command!.id
    );
    const result = results.find((r) => r.kind === 'hit') ?? results[0];
    if (!result || result.kind === this.outcome) return;
    this.outcome = result.kind;
    this.event(`result: ${result.kind}`);
    if (!this.cancelled && isPhysical(this.command)) {
      const action: ExpressionKind =
        result.kind !== 'hit'
          ? 'shrug'
          : this.command.action === 'shoot'
            ? 'approve'
            : this.command.action === 'poke'
              ? 'beckon'
              : 'approve';
      this.reaction = { action, targetId: this.command.targetId };
    }
  }
  private blendPreparation(target: HandPose, t: number): HandPose {
    const p = mix(this.start, target, minimumJerk(t));
    p.rotation = qlerp(
      this.start.rotation,
      target.rotation,
      minimumJerk(clamp(t * 1.15))
    );
    p.joints = this.start.joints.map((q, i) => {
      const j = JOINTS[i],
        delay = j.finger === 0 ? 0.06 : j.finger === 4 ? 0 : 0.025;
      return qlerp(q, target.joints[i], minimumJerk((t - delay) / (1 - delay)));
    });
    return p;
  }
  step(dt: number): void {
    if (this.disposed) return;
    this.time += dt;
    if (this.time - this.lastInterference > 6)
      this.agitation = Math.max(0, this.agitation - dt * 0.018);
    this.elapsed += dt;
    this.readResult();
    const completed =
      this.world.targets.get('puck')?.handling?.completedReturns ?? 0;
    if (completed > this.corrections) {
      this.corrections = completed;
      this.intention = 'There. Stay.';
      this.event('settled');
      this.reaction = {
        action: this.agitation > 0.5 ? 'scold' : 'approve',
        targetId: 'puck',
      };
    }
    const target =
      this.command && this.world.targets.get(this.command.targetId);
    if (
      this.command &&
      ['attend', 'anticipate', 'act'].includes(this.phase) &&
      (!target || !target.visible)
    ) {
      this.world.report({
        actionId: this.command.id,
        targetId: this.command.targetId,
        kind: 'target lost',
      });
      this.cancel('target lost');
    }
    const physical = this.command && isPhysical(this.command),
      t = clamp(this.elapsed / this.duration);
    let desired: HandPose;
    if (this.phase === 'rest') desired = this.resting();
    else if (this.phase === 'attend') {
      if (target) this.aim = this.world.anchor(target);
      const attention = this.resting();
      attention.root = add(attention.root, v(0.08, 0.06, 0));
      const heading = this.aimed(attention.root);
      attention.rotation = qlerp(attention.rotation, heading.rotation, 0.24);
      desired = mix(this.start, attention, minimumJerk(t));
    } else if (this.phase === 'anticipate') {
      if (target) this.aim = this.world.anchor(target);
      this.goal =
        this.command?.action === 'return'
          ? this.tapPose(0.65)
          : physical
            ? this.preparation()
            : prepareExpression(
                this.command!.action as ExpressionKind,
                t,
                this.style,
                this.aim
              );
      desired = this.blendPreparation(
        this.goal,
        this.command?.action === 'scold' ? clamp(t / 0.45) : t
      );
      if (this.command?.action === 'return')
        desired.root.z += 0.8 * Math.sin(Math.PI * t);
      // A small whole-hand draw-back belongs to the intention; it vanishes before contact.
      if (physical)
        desired.root = add(
          desired.root,
          v(
            -0.12 * Math.sin(Math.PI * t) ** 2,
            0.045 * Math.sin(Math.PI * t) ** 2,
            0
          )
        );
    } else if (this.phase === 'act' && this.command?.action === 'return') {
      if (this.released) {
        const recoil = minimumJerk(
          (this.elapsed - this.releaseTime - 0.033) / 0.23
        );
        desired = structuredClone(this.strikePose!);
        desired.root = add(
          desired.root,
          add(mul(this.strikeDirection, -0.65 * recoil), v(0, 0, 0.3 * recoil))
        );
      } else
        desired = this.tapPose(
          0.65 * (1 - minimumJerk(this.elapsed / 0.12)) - 0.025
        );
    } else if (this.phase === 'act' && physical) {
      desired = { ...this.goal };
      if (this.command!.action === 'shoot') {
        if (target) {
          this.aim = this.world.anchor(target);
          if (target.id === 'ink' && this.released)
            this.aim = add(
              this.aim,
              v(
                Math.sin(this.elapsed * 2.3) * 0.8,
                Math.sin(this.elapsed * 4.1) * 0.23,
                0
              )
            );
        }
        const age = this.released ? this.elapsed - this.releaseTime : 10;
        const kick =
          Math.exp(-age / 0.075) *
          (this.shotsFired === this.burstSize ? 1.8 : 1);
        const swagger = this.released ? Math.sin(this.elapsed * 5) : 0;
        desired = this.aimed(
          add(HOME, v(-0.28 * kick - 0.1 * swagger, 0.1 * swagger, 0.6))
        );
        desired.rotation = qmul(
          desired.rotation,
          axis(v(0, 0, 1), 0.12 * kick)
        );
        // The thumb works like a hammer while the extended index keeps its silhouette.
        desired.joints[13] = qmul(
          desired.joints[13],
          axis(v(1, 0, 0), -0.45 * kick)
        );
      } else {
        const extended = this.aimed(this.goal.root),
          direction = socket(extended).direction;
        desired.joints = mix(
          this.goal,
          extended,
          minimumJerk(this.elapsed / 0.2)
        ).joints;
        const targetRoot = add(
          extended.root,
          sub(add(this.aim, mul(direction, 0.2)), socket(extended).position)
        );
        const travel =
          minimumJerk(this.elapsed / 0.3) *
          (1 - minimumJerk((this.elapsed - 0.46) / 0.3));
        desired.root = add(
          this.goal.root,
          mul(sub(targetRoot, this.goal.root), travel)
        );
      }
    } else if (this.phase === 'act')
      desired = expressionPose(
        this.command!.action as ExpressionKind,
        this.elapsed / this.tempo,
        this.style,
        this.aim
      );
    else desired = mix(this.start, this.goal, minimumJerk(t));
    const hitHold =
      this.command?.action === 'return' &&
      this.phase === 'act' &&
      this.released &&
      this.elapsed - this.releaseTime < 0.033;
    if (!hitHold)
      this.pose = this.motion.step(
        desired,
        dt,
        (this.phase === 'act' && !!physical) ||
          this.command?.action === 'return'
      );
    if (this.phase === 'act' && this.command?.action === 'return')
      this.resolveTap();
    if (this.phase === 'act' && physical)
      this.resolvePhysical(this.command as HandCommand);
    const burstFinished =
      this.command?.action === 'shoot' &&
      this.phase === 'act' &&
      this.shotsFired === this.burstSize &&
      this.elapsed - this.releaseTime > 0.28;
    if (burstFinished || this.elapsed + 1e-9 >= this.duration) this.nextPhase();
    if (
      this.phase === 'rest' &&
      this.automatic &&
      this.elapsed >= this.duration
    )
      this.choose();
  }
  private tapPose(gap: number): HandPose {
    const p = pose('point');
    p.root = v();
    p.rotation = identity();
    p.rotation = between(socket(p).direction, this.strikeDirection);
    p.root = sub(
      add(this.aim, mul(this.strikeDirection, -0.36 - gap)),
      socket(p).position
    );
    return p;
  }
  private resolveTap(): void {
    const target = this.world.targets.get(this.command!.targetId)!;
    const handling = target.handling!;
    if (this.released || handling.heldBy) return;
    const tip = socket(this.pose).position;
    const hit = sweep(this.previousTip, tip, {
      kind: 'sphere',
      centre: target.position,
      radius: 0.36,
    });
    if (hit !== null) {
      // Stop at the actual swept rim contact; no follow-through inside the puck.
      const contact = lerp(this.previousTip, tip, hit);
      this.pose.root = add(this.pose.root, sub(contact, tip));
      this.motion.rootVelocity.x =
        this.motion.rootVelocity.y =
        this.motion.rootVelocity.z =
          0;
      this.strikePose = structuredClone(this.pose);
      this.released = true;
      this.releaseTime = this.elapsed;
      handling.strikeHome(contact);
      this.event('impact');
      this.world.report({
        actionId: this.command!.id,
        targetId: target.id,
        kind: 'hit',
        point: contact,
      });
    }
    this.previousTip = tip;
  }
  shotsFired = 0;
  burstSize = 24;
  lastShot?: { time: number; position: Vec3; direction: Vec3 };
  private nextShot = 0;
  private nextShowTime = 0;
  private releaseTime = 0;
  private resolvePhysical(command: HandCommand): void {
    const s = socket(this.pose);
    if (command.action === 'shoot') {
      if (this.shotsFired < this.burstSize && this.elapsed >= this.nextShot) {
        const toTarget = sub(this.aim, s.position);
        const projection = dot(toTarget, s.direction);
        const offAxis = length(sub(toTarget, mul(s.direction, projection)));
        // Settle the first aim; subsequent rounds preserve the visible recoiling muzzle direction.
        if (
          (this.shotsFired > 0 ||
            (offAxis < 0.065 && length(this.motion.rootVelocity) < 0.8)) &&
          this.world.launch(
            command,
            s.position,
            mul(s.direction, 13),
            this.shotsFired
          )
        ) {
          this.shotsFired++;
          this.released = true;
          this.releaseTime = this.elapsed;
          this.lastShot = {
            time: this.time,
            position: { ...s.position },
            direction: { ...s.direction },
          };
          const beat = this.shotsFired;
          this.nextShot =
            this.elapsed +
            (beat === 8 || beat === 16
              ? 0.27
              : beat < 8
                ? 0.14
                : beat < 16
                  ? 0.095
                  : 0.065);
          this.intention =
            beat === this.burstSize
              ? 'Nailed it.'
              : beat > 16
                ? 'MORE. MORE. MORE.'
                : beat > 8
                  ? 'Oh, this is good.'
                  : 'Just warming up.';
          this.event(`shot ${beat}/${this.burstSize}`);
        }
      }
    } else {
      const target = this.world.targets.get(command.targetId);
      const correction =
        this.automatic &&
        target?.handling &&
        length(sub(target.position, target.handling.home)) > 0.16;
      if (!this.contacted)
        this.contacted = this.world.contact(
          command,
          this.previousTip,
          s.position,
          correction
            ? mul(unit(sub(target.position, target.handling!.home)), -2)
            : mul(s.direction, command.action === 'flick' ? 5 : 3),
          this.time,
          command.action === 'flick' ? 0.5 : 0.3
        );
      this.previousTip = s.position;
      if (!this.released && this.elapsed >= 0.16) {
        this.released = true;
        this.event('release');
      }
    }
  }
  private nextPhase(): void {
    const physical = this.command && isPhysical(this.command),
      erratic = this.personality === 'erratic';
    if (this.phase === 'attend')
      this.enter(
        'anticipate',
        this.command?.action === 'return'
          ? 0.3
          : (physical ? 0.8 : 0.85) * this.tempo
      );
    else if (this.phase === 'anticipate') {
      const duration =
        this.command!.action === 'return'
          ? 0.65
          : this.command!.action === 'shoot'
            ? 4.2
            : physical
              ? 0.8
              : this.command!.action === 'scold'
                ? 0.5 + this.style.beats * 0.55
                : this.command!.action === 'beckon'
                  ? 2
                  : 1.75;
      this.enter('act', duration * this.tempo);
    } else if (this.phase === 'act') {
      if (this.command?.action === 'return' && !this.released) {
        this.world.report({
          actionId: this.command.id,
          targetId: this.command.targetId,
          kind: 'miss',
        });
        this.reaction = { action: 'shrug', targetId: this.command.targetId };
      }
      if (
        physical &&
        (!this.released ||
          (this.command!.action !== 'shoot' && !this.contacted))
      )
        this.world.report({
          actionId: this.command!.id,
          targetId: this.command!.targetId,
          kind: 'miss',
        });
      this.event('complete');
      this.enter(
        'recover',
        this.command?.action === 'return'
          ? 0.25
          : (erratic ? 0.57 : 0.7) * this.tempo
      );
    } else if (this.phase === 'recover')
      this.enter(
        'inspect',
        this.command?.action === 'return'
          ? 0.15
          : (physical ? 0.85 : 0.35) * this.tempo
      );
    else if (this.phase === 'inspect')
      this.enter(
        'rest',
        this.command?.action === 'return'
          ? 0.12
          : this.reaction
            ? 0.45
            : (erratic ? 0.75 : 1.1) + this.random() * 0.9
      );
  }
  dispose(): void {
    if (this.disposed) return;
    this.cancel();
    this.disposed = true;
    this.command = undefined;
  }
}
