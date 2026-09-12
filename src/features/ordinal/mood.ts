/**
 * The phrase the field is playing.
 *
 * `features/helion/mood.ts` already establishes the pattern: a shared clock on a
 * fixed period, producing named states, so everything on screen is in the same
 * musical section rather than each element drifting on its own noise. The period
 * and the four names are taken from there deliberately — this is the same idea
 * applied to a different substrate, not a second mood system.
 *
 * What ASCII adds is that mood can be **vocabulary**. No other study here can do
 * this: the character set in play is a discrete, nameable thing, so a viewer can
 * read the mood off the glyphs rather than infer it from tempo. Breathing is a
 * field of punctuation with the corpus legible through it; Frenzy is the whole
 * table at once with nothing readable left.
 */

export type OrdinalMoodName = 'Breathing' | 'Gathering' | 'Frenzy' | 'Settling';

export const MOOD_NAMES = [
  'Breathing',
  'Gathering',
  'Frenzy',
  'Settling',
] as const satisfies readonly OrdinalMoodName[];

export interface OrdinalMood {
  name: OrdinalMoodName;
  /**
   * The codepoints an unresolved cell is folded into. This is the mood's
   * vocabulary, and it is the part a viewer can name.
   */
  band: readonly [number, number];
  /** How hard a calm cell is drawn back to its corpus character, per step. */
  pull: number;
  /** Chance per step that a new wave of dissolution nucleates. */
  excite: number;
  /** Which space the field diffuses in: 0 ordinal, 1 ink. */
  metric: number;
  /** Gain on the shear the energy field applies to the characters. */
  drift: number;
  /** One line for the readout. */
  note: string;
}

/** The full phrase, in the order it plays. */
const MOODS: Record<OrdinalMoodName, OrdinalMood> = {
  Breathing: {
    name: 'Breathing',
    band: [32, 47],
    pull: 0.3,
    excite: 0.004,
    metric: 0.15,
    drift: 0.25,
    note: 'Punctuation and space. The index is legible through it.',
  },
  Gathering: {
    name: 'Gathering',
    band: [32, 122],
    pull: 0.16,
    excite: 0.03,
    metric: 0.4,
    drift: 0.7,
    note: 'The whole alphabet is available. Words begin to shear.',
  },
  Frenzy: {
    name: 'Frenzy',
    band: [33, 126],
    pull: 0.02,
    excite: 0.14,
    metric: 0.85,
    drift: 1.5,
    note: 'Every printable character, sorted by weight. Nothing resolves.',
  },
  Settling: {
    name: 'Settling',
    band: [32, 64],
    pull: 0.26,
    excite: 0.006,
    metric: 0.3,
    drift: 0.4,
    note: 'Collapsing toward the full stop. The index comes back wrong.',
  },
};

export function moodByName(name: OrdinalMoodName): OrdinalMood {
  return MOODS[name];
}

/** Seconds in one phrase. Helion's period, for the same reason it has one. */
export const PHRASE_SECONDS = 28;

/**
 * Where the phrase is now.
 *
 * `agitation` is the field's own mean energy fed back in, so a field that has
 * been stirred by hand stays in Gathering instead of dropping to Breathing while
 * it is visibly still moving. The clock leads; the field can only refuse to
 * settle, never force a Frenzy it did not earn.
 */
export function ordinalMood(time: number, agitation: number): OrdinalMood {
  const phase = ((time % PHRASE_SECONDS) + PHRASE_SECONDS) % PHRASE_SECONDS;

  if (phase >= 16 && phase < 21) return MOODS.Frenzy;
  if (phase >= 21) return MOODS.Settling;
  if (phase < 7 && agitation < 0.06) return MOODS.Breathing;
  return MOODS.Gathering;
}
