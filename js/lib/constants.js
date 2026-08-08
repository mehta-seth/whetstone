// Every tunable number in one place, per the spec.

// Filler. KNOWN DEVIATION, to settle earlier.
// The spec asks for roughly one filler option per five ITEMS, meaning 20% of
// items carry one. The archetype spec names a mandatory filler inside the four
// distractors of a01, a19 and a20, which is 3 of the 5 earlier archetypes, so
// the delivered rate is 60% of items. Honouring 20% needs a fifth derived
// procedure per archetype to swap in, which the archetype spec does not supply. The
// constant is therefore declared and unused until those procedures exist.
export const FILLER_RATE = 0.20;

// Mastery blend, the spec. Uncalibrated judgement call, open item 2.
export const MASTERY_ACCURACY_WEIGHT = 0.7;
export const MASTERY_SPEED_WEIGHT    = 0.3;
export const MASTERY_PRIOR_CORRECT   = 2;
export const MASTERY_PRIOR_ATTEMPTS  = 4;
export const UNSEEN_SPEED            = 0.5;
export const AT_TARGET_MASTERY       = 0.85;
export const AT_TARGET_MIN_ATTEMPTS  = 8;
export const STALENESS_WEIGHT        = 0.3;
export const STALENESS_FULL_DAYS     = 14;
export const WEIGHT_FLOOR            = 0.05;
export const ARCHETYPE_SHARE_CAP     = 0.25;
export const REVIEW_WEAK_MASTERY     = 0.6;
export const REVIEW_WEAK_ATTEMPTS    = 3;
export const REVIEW_DECAY_DAYS       = 14;
export const REVIEW_MAX_LENGTH       = 20;

// Review due length. The spec pins one item per matching archetype. Below this many matches
// that is too short to be worth opening, so each archetype gets two items up to the cap.
// Breadth stays the point of the mode; depth is what Tempo with adaptive on is for.
export const REVIEW_DOUBLE_BELOW     = 8;
export const REVIEW_DOUBLE_CAP       = 16;

// Classify mode. The spec: 10s per item, twenty items in about three minutes. This is
// deliberately not targetSeconds, which is 83 and would give a 28-minute session for a
// task that is meant to train the first ten seconds of an item.
export const CLASSIFY_SECONDS        = 10;
// Eight names offered, drawn preferentially from the correct archetype's own group.
// Drawing at random across the whole library makes the task trivial, since the group is usually
// obvious from the stimulus.
export const CLASSIFY_CHOICES        = 8;

// Option set rules, as amended in order by:
//   decision 1  - the flat 20x spread rule exempts derived distractors
//   decision 9  - filler is near cover, not decoration, so it sits within 2x
//   decision 10 - a tight neighbour is the invariant that actually protects the
//                 item against estimation. The near band is a weaker backstop
//                 behind it.
//
// Why tightNeighbourWithin exists, recorded because it overturns the earlier
// reading that a wide spread was sufficient: the binding case is a pair sitting
// at roughly 0.52x and 0.63x of the answer, close enough that magnitude alone
// cannot separate them and only the full calculation can. An option set whose
// nearest neighbour is several multiples away is answerable by estimating order
// of magnitude, which defeats the point of the item. Magnitude has to be
// insufficient, so at least one option is pinned inside 2x.
export const OPTION_RULES = {
  count: 5,
  minGapRelative: 0.02,      // 2% of the larger, for non-integer types
  minGapIntegerUnits: 1,     // one whole unit for integer types
  fillerWithin: 2,           // filler must sit within 2x of the answer
  tightNeighbourWithin: 2,   // at least one option must sit within 2x
  maxSpreadAny: 200,         // hard ceiling on any option, either direction
  nearBandFactor: 4,         // "close to the answer" means within this factor
  nearBandMinCount: 3,       // at least this many of the five sit inside it
};

// Option ordering. 'realistic' reproduces the observed Desk 01 paper, which was
// ascending in 15 of 18 items. A pure shuffle of five options lands ascending
// once in 120, which is not the same test.
export const REALISTIC_ASCENDING_P = 0.83;

export const ITEM_SEED_STRIDE      = 7919;   // itemSeed = sessionSeed + i * this
export const GENERATE_MAX_ATTEMPTS = 50;
export const TAB_BLUR_THRESHOLD_MS = 5000;

// Desk 02 shared stimuli. The archetype spec asks that one table serve 3 to 7 questions. The spec
// wants a 20-item session off 4 stimuli, so the target is 5 and the band is the stated one.
// The stride is a separate prime from ITEM_SEED_STRIDE so that a stimulus seed can never
// collide with an item seed drawn from the same session seed.
export const STIMULUS_QUESTIONS_MIN    = 3;
export const STIMULUS_QUESTIONS_MAX    = 7;
export const STIMULUS_QUESTIONS_TARGET = 5;
export const STIMULUS_SEED_STRIDE      = 104729;
