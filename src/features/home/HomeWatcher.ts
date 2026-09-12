const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const ease = (t: number) => t * t * (3 - 2 * t);
const approach = (value: number, target: number, rate: number, dt: number) => {
  const next = value + (target - value) * (1 - Math.exp(-rate * dt));
  return Math.abs(next - target) < 0.0005 ? target : next;
};

export interface WatcherTarget {
  x: number;
  y: number;
  visible: boolean;
}

export interface WatcherExpression {
  focus: number;
  startled: number;
  confused: number;
  snap: number;
  withdraw?: number;
}

/** A small, fixed-floor octopod. Coordinates are in model units except x/floor.
 * Four feet stay planted during each swing. No renderer, allocation or clock
 * ownership in the update path; subpixel hover never starts another footstep. */
export class HomeWatcher {
  enabled = false;
  visible = false;
  inView = true;
  x = 0;
  floor = 0;
  scale = 22;
  bodyYaw = -0.2;
  headYaw = 0;
  headPitch = -0.35;
  headCant = 0;
  crouch = 0;
  velocity = 0;
  roll = 0;
  balance = 0;
  lift = 0;
  entering = false;
  moving = false;
  steps = 0;
  revision = 0;
  readonly feet = new Float64Array(8 * 3);
  /** Hip, knee, hock and foot for each leg. */
  readonly joints = new Float64Array(8 * 12);
  private readonly from = new Float64Array(8);
  private readonly to = new Float64Array(8);
  private readonly restX = new Float64Array(8);
  private readonly restZ = new Float64Array(8);
  private minX = 0;
  private maxX = 0;
  private goal = 0;
  private gazeX = 0;
  private gazeY = 0;
  private cohort = 0;
  private swing = -1;
  private cooldown = 0;
  private swingDuration = 0.24;
  private rollVelocity = 0;
  private balanceVelocity = 0;
  private liftVelocity = 0;
  private accumulator = 0;
  private width = 0;
  private laneHeight = 0;
  private cruising = false;
  private alarm = 0;
  private uncertainty = 0;
  private attentionSide = 1;
  private snap = 0;
  private withdraw = 0;

  resize(width: number, floor: number, laneHeight: number) {
    this.floor = floor;
    if (this.width === width && this.laneHeight === laneHeight) return;
    this.width = width;
    this.laneHeight = laneHeight;
    this.scale = Math.min(
      27,
      Math.max(19, width * 0.026),
      (laneHeight - 12) / 4.7
    );
    this.floor = floor;
    this.minX = this.scale * 3.1;
    // The existing target owns the right-hand end of the same strip.
    this.maxX = Math.max(this.minX, width - 100 - this.scale * 3.1);
    this.x = clamp(this.x || width * 0.3, this.minX, this.maxX);
    this.reset();
  }

  reset() {
    this.goal = this.x;
    this.swing = -1;
    this.cohort = 0;
    this.cooldown = this.accumulator = 0;
    this.steps = 0;
    this.bodyYaw = -0.2;
    this.headYaw = 0;
    this.headPitch = -0.35;
    this.headCant = 0;
    this.alarm = this.uncertainty = this.snap = 0;
    this.crouch = 0;
    this.velocity = this.roll = this.balance = this.lift = 0;
    this.rollVelocity = this.balanceVelocity = this.liftVelocity = 0;
    this.entering = false;
    this.gazeX = this.x;
    this.gazeY = this.floor - 160;
    this.moving = false;
    for (let i = 0; i < 8; i++) {
      const pair = i >> 1;
      const side = i % 2 ? 1 : -1;
      this.restX[i] = side * (pair === 0 || pair === 3 ? 1.9 : 2.65);
      this.restZ[i] = 1.65 - pair * 1.1;
      this.feet[i * 3] = this.restX[i];
      this.feet[i * 3 + 1] = 0;
      this.feet[i * 3 + 2] = this.restZ[i];
    }
    this.solve();
    this.revision++;
  }

  enter() {
    this.x = -this.scale * 3.4;
    this.reset();
    this.entering = true;
    this.goal = clamp(this.width * 0.3, this.minX, this.maxX);
  }

  advance(
    delta: number,
    target: WatcherTarget,
    walking: boolean,
    cruising = false,
    attention?: WatcherExpression
  ) {
    if (
      !this.enabled ||
      !this.visible ||
      !this.inView ||
      !Number.isFinite(delta)
    )
      return;
    this.cruising = cruising;
    this.alarm = attention?.startled ?? 0;
    this.uncertainty = attention?.confused ?? 0;
    this.attentionSide = attention?.focus ? 1 : -1;
    this.snap = attention?.snap ?? 0;
    this.withdraw = attention?.withdraw ?? 0;
    if (target.visible && Number.isFinite(target.x + target.y)) {
      if (
        Math.hypot(target.x - this.gazeX, target.y - this.gazeY) >
        (cruising ? 1.5 : 6)
      ) {
        this.gazeX = target.x;
        this.gazeY = target.y;
      }
      const offset = cruising
        ? Math.sign(target.x - this.x) * this.scale * 2.2
        : this.scale * 0.5;
      const desired = clamp(target.x - offset, this.minX, this.maxX);
      if (
        !this.entering &&
        walking &&
        Math.abs(desired - this.goal) > this.scale * 0.65 &&
        (!cruising || Math.abs(target.x - this.x) > this.scale * 4.5)
      )
        this.goal = desired;
    }
    if (!this.entering && (!walking || !target.visible)) this.goal = this.x;
    this.accumulator += clamp(delta, 0, 0.05);
    while (this.accumulator + 1e-9 >= 1 / 60) {
      this.accumulator -= 1 / 60;
      this.step(1 / 60);
    }
  }

  private step(dt: number) {
    const previousX = this.x;
    const previousVelocity = this.velocity;
    let stanceError = 0;
    for (let i = 0; i < 8; i++)
      if (this.feet[i * 3 + 1] < 0.01)
        stanceError = Math.max(
          stanceError,
          Math.abs(this.feet[i * 3] - this.restX[i])
        );
    const distance = this.goal - this.x;
    const limit =
      this.scale * (this.entering ? 8.5 : this.cruising ? 2.2 : 6.2);
    const desired =
      Math.sign(distance) * Math.min(limit, Math.abs(distance) * 5.5);
    // A stance nearing full reach brakes the mass until the next feet land.
    const reach = clamp((1.0 - stanceError) / 0.3, 0, 1);
    const acceleration = clamp(
      (desired * reach - this.velocity) * 9,
      -this.scale * (this.cruising ? 10 : 38),
      this.scale * (this.cruising ? 7 : 25)
    );
    this.velocity += acceleration * dt;
    if (Math.abs(distance) < 0.5 && Math.abs(this.velocity) < 2) {
      this.x = this.goal;
      this.velocity = 0;
    } else this.x += this.velocity * dt;
    const travel = (this.x - previousX) / this.scale;
    for (let i = 0; i < 8; i++) this.feet[i * 3] -= travel;
    const speed = Math.abs(this.velocity) / this.scale;
    const force = (this.velocity - previousVelocity) / (dt * this.scale);

    const dx = (this.gazeX - this.x) / this.scale;
    const dy = (this.floor - this.gazeY) / this.scale - 3.1;
    const yaw = clamp(Math.atan2(dx, 6), -0.85, 0.85);
    const pitch = clamp(-Math.atan2(dy, Math.hypot(dx, 5)), -0.85, 0.18);
    const near = clamp(1 - Math.hypot(dx, dy) / 3.2, 0, 1);
    const body = approach(this.bodyYaw, yaw * 0.35 - 0.12, 2.8, dt);
    const head = approach(
      this.headYaw,
      yaw - body,
      this.snap > 0 ? 24 : this.cruising ? 6 : 10,
      dt
    );
    const tilt = approach(
      this.headPitch,
      pitch - this.alarm * 0.16,
      this.snap > 0 ? 18 : this.cruising ? 6 : 9,
      dt
    );
    const cant = approach(
      this.headCant,
      this.uncertainty * this.attentionSide * 0.18,
      9,
      dt
    );
    const crouch = approach(
      this.crouch,
      near * 0.4 + Math.min(0.12, speed * 0.025) + this.alarm * 0.22,
      7,
      dt
    );
    let changed =
      body !== this.bodyYaw ||
      head !== this.headYaw ||
      tilt !== this.headPitch ||
      crouch !== this.crouch ||
      this.x !== previousX ||
      cant !== this.headCant;
    this.headCant = cant;
    this.bodyYaw = body;
    this.headYaw = head;
    this.headPitch = tilt;
    this.crouch = crouch;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.swing < 0 && this.cooldown === 0) {
      let error = 0;
      for (let i = 0; i < 8; i++)
        error = Math.max(error, Math.abs(this.feet[i * 3] - this.restX[i]));
      if (speed > 0.2 || error > 0.08) {
        this.swing = 0;
        this.swingDuration = 0.27 - Math.min(1, speed / 4) * 0.12;
        for (let i = 0; i < 8; i++) {
          this.from[i] = this.feet[i * 3] + this.x / this.scale;
          this.to[i] =
            this.restX[i] +
            this.x / this.scale +
            clamp(
              (this.velocity / this.scale) * this.swingDuration * 1.3,
              -0.75,
              0.75
            );
        }
      }
    }
    if (this.swing >= 0) {
      this.swing = Math.min(1, this.swing + dt / this.swingDuration);
      const t = ease(this.swing);
      for (let i = 0; i < 8; i++) {
        const lifted = ((i >> 1) + (i % 2)) % 2 === this.cohort;
        if (lifted)
          this.feet[i * 3] =
            this.from[i] +
            (this.to[i] - this.from[i]) * t -
            this.x / this.scale;
        this.feet[i * 3 + 1] = lifted
          ? Math.sin(this.swing * Math.PI) ** 2 *
            (0.2 + Math.min(speed, 5) * 0.035)
          : 0;
      }
      if (this.swing === 1) {
        this.swing = -1;
        this.cohort = 1 - this.cohort;
        this.cooldown = 0.035;
        this.steps += 4;
      }
      changed = true;
    }
    const rollTarget = clamp(
      (-this.velocity / this.scale) * 0.035 - force * 0.009,
      -0.23,
      0.23
    );
    const balanceTarget = clamp(force * 0.008 + this.withdraw, -0.2, 0.2);
    const liftTarget =
      this.swing >= 0
        ? -Math.sin(this.swing * Math.PI) * Math.min(0.1, 0.025 + speed * 0.02)
        : 0;
    const oldRoll = this.roll,
      oldBalance = this.balance,
      oldLift = this.lift;
    // Underdamped chassis suspension: load, small overshoot, then a finite rest.
    this.rollVelocity +=
      ((rollTarget - this.roll) * 100 - this.rollVelocity * 13) * dt;
    this.roll += this.rollVelocity * dt;
    this.balanceVelocity +=
      ((balanceTarget - this.balance) * 85 - this.balanceVelocity * 12) * dt;
    this.balance += this.balanceVelocity * dt;
    this.liftVelocity +=
      ((liftTarget - this.lift) * 160 - this.liftVelocity * 17) * dt;
    this.lift += this.liftVelocity * dt;
    if (
      Math.abs(this.roll - rollTarget) + Math.abs(this.rollVelocity) <
      0.001
    ) {
      this.roll = rollTarget;
      this.rollVelocity = 0;
    }
    if (
      Math.abs(this.balance - balanceTarget) + Math.abs(this.balanceVelocity) <
      0.001
    ) {
      this.balance = balanceTarget;
      this.balanceVelocity = 0;
    }
    if (
      Math.abs(this.lift - liftTarget) + Math.abs(this.liftVelocity) <
      0.001
    ) {
      this.lift = liftTarget;
      this.liftVelocity = 0;
    }
    changed ||=
      this.roll !== oldRoll ||
      this.balance !== oldBalance ||
      this.lift !== oldLift;
    this.moving = this.swing >= 0 || this.velocity !== 0;
    if (this.entering && !this.moving && Math.abs(distance) < 1)
      this.entering = false;
    if (changed) {
      this.solve();
      this.revision++;
    }
  }

  private solve() {
    const cos = Math.cos(this.bodyYaw),
      sin = Math.sin(this.bodyYaw);
    const cosRoll = Math.cos(this.roll),
      sinRoll = Math.sin(this.roll);
    // Suspension yields to the planted feet's reach envelope during a hard
    // brake; the support links never lengthen to accommodate body momentum.
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < 8; i++) {
        const side = i % 2 ? 1 : -1;
        const z = 0.8 - (i >> 1) * 0.53;
        const localX = side * 0.78 * cosRoll + 0.2 * sinRoll;
        const hipX = localX * cos + z * sin + this.balance;
        const hipZ = z * cos - localX * sin;
        const dx = this.feet[i * 3] - hipX;
        const dz = this.feet[i * 3 + 2] - hipZ;
        const maxX = Math.sqrt(Math.max(0.01, 3.28 ** 2 - dz * dz));
        if (Math.abs(dx) > maxX) this.balance += dx - Math.sign(dx) * maxX;
        const horizontal = Math.hypot(
          this.feet[i * 3] - (localX * cos + z * sin + this.balance),
          dz
        );
        const maxY = Math.sqrt(Math.max(0.01, 3.32 ** 2 - horizontal ** 2));
        const hipY =
          1.85 -
          this.crouch +
          this.lift +
          side * 0.78 * sinRoll -
          0.2 * cosRoll;
        const excess = hipY - this.feet[i * 3 + 1] - 0.18 - maxY;
        if (excess > 0) {
          this.lift -= excess;
          this.liftVelocity = Math.min(0, this.liftVelocity);
        }
      }
    }
    for (let i = 0; i < 8; i++) {
      const side = i % 2 ? 1 : -1;
      const z = 0.8 - (i >> 1) * 0.53;
      const localX = side * 0.78 * cosRoll + 0.2 * sinRoll;
      const hipX = localX * cos + z * sin + this.balance;
      const hipZ = z * cos - localX * sin;
      const hipY =
        1.85 - this.crouch + this.lift + side * 0.78 * sinRoll - 0.2 * cosRoll;
      const footX = this.feet[i * 3],
        footY = this.feet[i * 3 + 1],
        footZ = this.feet[i * 3 + 2];
      // Two rigid links solved in the vertical plane through hip and foot.
      const horizontal = Math.hypot(footX - hipX, footZ - hipZ);
      const vertical = footY + 0.18 - hipY;
      const distance = Math.hypot(horizontal, vertical);
      const a = 1.5,
        b = 1.85;
      const along = (a * a - b * b + distance * distance) / (2 * distance);
      const bend = Math.sqrt(Math.max(0, a * a - along * along));
      const kneeR = (horizontal * along - vertical * bend) / distance;
      const kneeY = hipY + (vertical * along + horizontal * bend) / distance;
      const ux = (footX - hipX) / horizontal,
        uz = (footZ - hipZ) / horizontal;
      const j = i * 12;
      this.joints[j] = hipX;
      this.joints[j + 1] = hipY;
      this.joints[j + 2] = hipZ;
      this.joints[j + 3] = hipX + ux * kneeR;
      this.joints[j + 4] = kneeY;
      this.joints[j + 5] = hipZ + uz * kneeR;
      this.joints[j + 6] = footX;
      this.joints[j + 7] = footY + 0.18;
      this.joints[j + 8] = footZ;
      this.joints[j + 9] = footX;
      this.joints[j + 10] = footY;
      this.joints[j + 11] = footZ;
    }
  }
}
