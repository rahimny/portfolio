/**
 * The opening: the name deletes itself, offers the invitation, and returns.
 *
 * A particle masthead that only sits there is a still with a time uniform in it.
 * What makes this one worth the frame time is that you can type into it — and
 * nothing on a page announces that. So the masthead demonstrates it once:
 * the name erases, the field types the invitation in its place, erases that,
 * and writes the name back. By the time it rests, the reader has watched the
 * mechanism and has a caret blinking at the end of the word.
 *
 * Written as a programme advanced by delta time rather than as a chain of
 * timeouts: state that persists between frames
 * belongs in something the render loop drives, so pausing the surface when it
 * scrolls out of view pauses the sequence with it instead of letting it run on
 * invisibly and finish before it is ever seen.
 */

export type ProgrammeStep =
  | { kind: 'hold'; seconds: number }
  | { kind: 'erase'; perChar: number }
  | { kind: 'write'; text: string; perChar: number };

/** Deterministic 0..1, so the same run types with the same rhythm every time. */
function hash(n: number): number {
  n = Math.imul(n ^ (n >>> 16), 0x27d4eb2d);
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}

export class TypingProgramme {
  private index = 0;
  private elapsed = 0;
  private beat = 0;
  private text: string;
  private finished = false;

  private readonly steps: readonly ProgrammeStep[];
  private readonly onChange: (text: string) => void;

  constructor(
    steps: readonly ProgrammeStep[],
    initial: string,
    onChange: (text: string) => void
  ) {
    this.steps = steps;
    this.onChange = onChange;
    this.text = initial;
  }

  public get done(): boolean {
    return this.finished;
  }

  public cancel(): void {
    this.finished = true;
  }

  public advance(dt: number): void {
    if (this.finished) return;
    this.elapsed += dt;

    // A loop, not an `if`: a long frame — a tab returning to the foreground, a
    // slow first paint — must not swallow whole steps of the sequence.
    let guard = 0;
    while (!this.finished && guard++ < 64) {
      const step = this.steps[this.index];
      if (!step) {
        this.finished = true;
        return;
      }

      if (step.kind === 'hold') {
        if (this.elapsed < step.seconds) return;
        this.elapsed -= step.seconds;
        this.next();
        continue;
      }

      // Typing that lands on an exact metronome reads as a machine. A fixed
      // deterministic wobble on each interval is enough to read as a hand.
      const nominal = step.perChar;
      const interval =
        nominal * (0.65 + hash(this.index * 31 + this.beat) * 0.7);
      if (this.elapsed < interval) return;
      this.elapsed -= interval;
      this.beat++;

      if (step.kind === 'erase') {
        if (this.text.length === 0) {
          this.next();
          continue;
        }
        this.set(Array.from(this.text).slice(0, -1).join(''));
        if (this.text.length === 0) this.next();
        continue;
      }

      const target = Array.from(step.text);
      const current = Array.from(this.text);
      if (current.length >= target.length) {
        this.next();
        continue;
      }
      this.set(target.slice(0, current.length + 1).join(''));
      if (this.text.length === target.length) this.next();
    }
  }

  private next(): void {
    this.index++;
    this.beat = 0;
    if (this.index >= this.steps.length) this.finished = true;
  }

  private set(text: string): void {
    this.text = text;
    this.onChange(text);
  }
}

/**
 * The masthead sequence. Timings are deliberately asymmetric: erasing is faster
 * than writing, because a held backspace is faster than typing, and the pause
 * before the name returns is shorter than the one that lets the invitation be
 * read.
 *
 * Slower than the first tuning by about half. The point of the sequence is the
 * ink, and each edit now sends a wave through it that takes the better part of
 * a second to cross a few letters (see `burstSpan` in the settings). At thirty
 * characters a second the next keystroke landed before the last one had
 * arrived, so the whole thing read as a rattle. This is still faster than a
 * person types, and now every letter's disturbance is legible on its own.
 */
export function mastheadProgramme(name: string, hint: string): ProgrammeStep[] {
  return [
    { kind: 'hold', seconds: 1.4 },
    { kind: 'erase', perChar: 0.05 },
    { kind: 'hold', seconds: 0.34 },
    { kind: 'write', text: hint, perChar: 0.1 },
    { kind: 'hold', seconds: 1.3 },
    { kind: 'erase', perChar: 0.044 },
    { kind: 'hold', seconds: 0.26 },
    { kind: 'write', text: name, perChar: 0.085 },
  ];
}
