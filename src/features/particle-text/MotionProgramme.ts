/**
 * Manual gestures and the idle demonstration share a queue of movements.
 * Grabbing replaces that queue, so only one controller sets parameter targets.
 * Each parameter has its own damping time: attraction gathers the letters
 * before the depth and camera settle around them.
 */

export interface Modulation {
  /** Multipliers over the tuned settings. */
  attraction: number;
  damping: number;
  turbulence: number;
  cohesion: number;
  /** Multiplier on every pointer force, so holding is felt as more than hovering. */
  pointer: number;
  /** Position between the tuned resting and loose depths, normally 0..1. */
  depthMix: number;
  /** Extra depth in em, supplied by motion outside this programme. */
  depthOffset: number;
  /** Camera, radians. */
  yaw: number;
  pitch: number;
}

export const REST: Readonly<Modulation> = {
  attraction: 1,
  damping: 1,
  turbulence: 1,
  cohesion: 1,
  pointer: 1,
  depthMix: 0,
  depthOffset: 0,
  yaw: 0,
  pitch: 0,
};

/** Fixed, so `advance` never allocates a key array on the frame it walks. */
const MODULATION_KEYS = Object.keys(REST) as (keyof Modulation)[];

interface Movement {
  name: string;
  /** How long to hold once the targets are set. `Infinity` waits to be replaced. */
  seconds: number;
  /** Seconds for each parameter to reach its target. Lower is snappier. */
  ease: Partial<Record<keyof Modulation, number>> & { default: number };
  target: Modulation;
  /** One-shot kick at the start of the movement, em/s. */
  burst?: number;
  /** Shown under the masthead while this movement runs. */
  prompt?: string;
  /** `undefined` leaves the text alone; `null` restores whatever the reader's is. */
  text?: string | null;
  /** Whether a reader playing with it should postpone the next movement. */
  extendable?: boolean;
}

/**
 * The word the ink becomes while it is loose.
 *
 * `no gravity` was the first suggestion and it is the wrong label: there is no
 * gravity term anywhere in this simulation, and inventing one on a page whose
 * whole argument is that its systems are legible is a small lie for a small
 * effect. What is actually switched off is the spring pinning each particle to
 * its own sample point inside the letterform.
 */
const LOOSE_WORD = 'unpinned';

/**
 * Held: what a press feels like.
 *
 * The drama here comes from the pointer, not from the noise — `pointer` at 1.7
 * against turbulence at only 1.2. That is deliberate: an instrument has to feel
 * like *you* are causing the result. Ink that is already thrashing on its own
 * makes a drag feel like stirring something that was going to move anyway.
 */
const HELD: Modulation = {
  attraction: 0.14,
  damping: 0.5,
  turbulence: 1.2,
  cohesion: 0.5,
  pointer: 1.7,
  depthMix: 0.74,
  depthOffset: 0,
  yaw: 0,
  pitch: 0,
};

/**
 * Inviting: loose enough to read as liquid, firm enough to still read.
 *
 * Noticeably tighter than `HELD`, and the first pass had it looser than this by
 * a factor of three, which dissolved the word to the point where only the last
 * three letters survived. An invitation nobody can read is not an invitation,
 * and there is nothing left to smear if it has already come apart on its own.
 */
const INVITING: Modulation = {
  attraction: 0.3,
  damping: 0.6,
  turbulence: 1.5,
  cohesion: 0.6,
  pointer: 1.4,
  depthMix: 1,
  depthOffset: 0,
  yaw: 0,
  pitch: 0,
};

const SNAP: Movement = {
  name: 'snap',
  seconds: 0.9,
  ease: { default: 0.45, attraction: 0.1, pointer: 0.3 },
  burst: 2.6,
  text: null,
  target: {
    attraction: 2.6,
    damping: 1.6,
    turbulence: 0.5,
    cohesion: 1.5,
    pointer: 1,
    depthMix: 0.05,
    depthOffset: 0,
    yaw: 0,
    pitch: 0,
  },
};

const SETTLE: Movement = {
  name: 'settle',
  seconds: 1,
  ease: { default: 0.8 },
  target: { ...REST },
};

/**
 * `yaw` is signed per run, so consecutive performances turn the other way — a
 * masthead that always swings the same way is a loop, not a habit.
 */
function act(direction: number): Movement[] {
  return [
    // Stated first, at full stiffness, so the new word arrives as a crisp
    // statement rather than as mush. Only then does it let go.
    // Stiffer than rest and given a kick, because the name is two lines of
    // fifteen glyphs and the word is one line of eight: most of the ink has a
    // long way to travel, and at resting stiffness it is still a smear by the
    // time the next movement lets go of it.
    {
      name: 'declare',
      seconds: 1.25,
      ease: { default: 0.3 },
      text: LOOSE_WORD,
      burst: 1.6,
      target: { ...REST, attraction: 1.9, damping: 1.2, cohesion: 1.3 },
    },
    {
      name: 'invite',
      seconds: 3.8,
      ease: { default: 0.7, attraction: 0.85 },
      prompt: 'hold and drag to smear it',
      extendable: true,
      target: { ...INVITING, yaw: 0.18 * direction, pitch: 0.05 },
    },
    {
      ...SNAP,
      seconds: 1.4,
      ease: { default: 0.7, attraction: 0.12, turbulence: 0.2 },
    },
    SETTLE,
  ];
}

export class MotionProgramme {
  /** Live values, eased toward the current movement's targets. */
  public readonly value: Modulation = { ...REST };
  /** Set for one frame when a movement asks for a kick. */
  public burst = 0;
  public prompt: string | null = null;
  /** `null` means "show the reader's own text". */
  public text: string | null = null;
  /**
   * Set by the engine when the reader is actively playing. An extendable
   * movement will not time out while this is true — the masthead waits while it
   * is being used, the same way Quasicity's traverse slows while it is looked at.
   */
  public attending = false;

  private queue: Movement[] = [];
  private elapsed = 0;
  private extended = 0;
  private direction = 1;
  private grabbed = false;

  public get active(): boolean {
    return this.queue.length > 0;
  }

  /** True while the reader is holding, so the caret and the caption can react. */
  public get held(): boolean {
    return this.grabbed;
  }

  public start(): void {
    if (this.active || this.grabbed) return;
    this.play(act(this.direction));
    this.direction *= -1;
  }

  /** Press and hold. Replaces whatever was queued; there is nothing to reconcile. */
  public grab(): void {
    if (this.grabbed) return;
    this.grabbed = true;
    this.play([
      {
        name: 'grab',
        seconds: Infinity,
        ease: { default: 0.3, attraction: 0.18, pointer: 0.15 },
        prompt: 'release to snap it back',
        // Text deliberately left alone. Grabbing part-way through the act should
        // hand over control, not yank the word back mid-gesture; `snap` restores
        // it on release either way.
        target: HELD,
      },
    ]);
  }

  public releaseGrab(): void {
    if (!this.grabbed) return;
    this.grabbed = false;
    this.play([SNAP, SETTLE]);
  }

  /**
   * Stand down without jumping — used when the reader starts typing. The
   * masthead performing over the top of somebody using it is the site talking
   * across them, and whatever word the act had put up has to go back to theirs.
   */
  public standDown(): void {
    this.grabbed = false;
    if (!this.active) return;
    this.play([
      {
        name: 'yield',
        seconds: 0.9,
        ease: { default: 0.45 },
        text: null,
        target: { ...REST },
      },
    ]);
  }

  public advance(dt: number): void {
    this.burst = 0;

    const movement = this.queue[0];
    const target = movement ? movement.target : REST;

    for (const key of MODULATION_KEYS) {
      const tau = movement
        ? (movement.ease[key] ?? movement.ease.default)
        : 0.8;
      // Critically damped toward the target, in the 1/(1 + dt/tau) form used
      // everywhere else here: stable at any dt, no transcendental.
      const blend = 1 - 1 / (1 + dt / Math.max(0.01, tau));
      this.value[key] += (target[key] - this.value[key]) * blend;
    }

    if (!movement) return;

    // Someone is playing with it, so do not take it away from them — but cap how
    // long that can hold the act open, or a resting cursor keeps it there for ever.
    if (movement.extendable && this.attending && this.extended < 8) {
      this.extended += dt;
      return;
    }

    this.elapsed += dt;
    if (this.elapsed < movement.seconds) return;

    this.elapsed -= movement.seconds;
    this.queue.shift();
    this.enter();
  }

  private play(queue: Movement[]): void {
    this.queue = queue;
    this.elapsed = 0;
    this.extended = 0;
    this.enter();
  }

  private enter(): void {
    const movement = this.queue[0];
    if (!movement) {
      this.prompt = null;
      this.text = null;
      return;
    }
    this.burst = movement.burst ?? 0;
    this.prompt = movement.prompt ?? null;
    if (movement.text !== undefined) this.text = movement.text;
  }
}
