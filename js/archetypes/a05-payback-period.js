import { money, roundTo } from '../lib/money.js';
import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import { sig2 } from '../lib/precision.js';

// a05 - Payback period
//
// Convert throughput to revenue per day through a container size, then divide the capital cost
// by it. Two unit conversions, and the batch window is the one candidates read as an hour.
//
// Generated backwards from the answer, as the archetype spec requires it to land on a clean 0.5. That
// makes the capital cost a round number, which the spec would rather avoid. The
// archetype's own constraint wins; `isRound` is a generator helper, not a validator predicate.

const PLANTS = [
  { org: 'Culverden Potteries', unit: { s: 'pot', p: 'pots' }, box: { s: 'tray', p: 'trays' }, kit: 'a second kiln' },
  { org: 'Hartsmere Bakery', unit: { s: 'roll', p: 'rolls' }, box: { s: 'crate', p: 'crates' }, kit: 'a new prover' },
  { org: 'Bythorn Components', unit: { s: 'bushing', p: 'bushings' }, box: { s: 'carton', p: 'cartons' }, kit: 'a second lathe' },
  { org: 'Selmeston Cider', unit: { s: 'bottle', p: 'bottles' }, box: { s: 'case', p: 'cases' }, kit: 'a bottling line' },
];

export default {
  id: 'a05',
  name: 'Payback period',
  group: 'money',
  desks: [1],
  tiers: ['standard'],
  stimulus: 'prose',
  answerType: 'number',
  targetSeconds: 83,

  constraints: [
    'the hourly rate and the container count are both whole numbers',
    'the answer lands on a multiple of 0.5 between 8 and 30',
    'all four distractors are distinct from the answer and from each other',
  ],

  errorTypes: ['wrong-input', 'wrong-unit'],

  formulaText: 'capital cost ÷ (containers a day × container price)',


  // THE ESTIMATION ROUTE.
  //
  // a05 resolves at one figure in only 26% of items and at two in 99%, so it is a genuine two-figure
  // item and the route rounds accordingly. It is also the longest chain in the library: two unit
  // conversions, a container size and a price before a single division.
  //
  // THE ROUTE MUST NOT READ `params.answer`. a05 generates BACKWARDS, drawing the payback period first
  // and deriving the capital cost from it, so the answer is a parameter of the draw and returning it
  // would be a lookup dressed as an estimate. The capital cost was added to the worked values in
  // An earlier round for exactly this reason, and the route divides it by the revenue it computes.
  //
  // Every distractor here is a wrong INPUT rather than wrong arithmetic: a 24-hour day, a wrong day
  // length, units priced instead of containers, throughput read per hour instead of per batch. So the
  // route states the day length and the container size explicitly, since those are the two readings
  // that decide the answer.
  estimate(p, v) {
    const perDay = v.perHour * p.hoursPerDay;
    const revenue = sig2(perDay / p.containerSize * p.containerPrice);
    const value = v.capitalCost / revenue;
    return {
      value,
      text: `${v.perHour} an hour over ${p.hoursPerDay} hours is ${perDay} a day, about `
        + `${Math.round(revenue)} of revenue, so about ${value.toFixed(1)} days`,
    };
  },

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const plant         = f.plant         ?? rng.pick(PLANTS);
    // 30 and 60 are excluded. The per-hour misreading is the answer scaled by batchMinutes / 60, so at
    // 30 it is exactly half the answer and at 60 it equals it, and a clean 2:1 pair against the answer
    // is what made a05 solvable from the option values. The residual after fixing the halved day was
    // 16.5%, all of it batchMinutes 30.
    const batchMinutes  = f.batchMinutes  ?? rng.pick([35, 40, 45, 50, 55]);
    // 12 is dropped from the allowed day lengths. At 12 the 24-hour distractor is exactly half the
    // answer, which puts a clean 2:1 pair in the option set. See the note on dWrongDay below.
    const hoursPerDay   = f.hoursPerDay   ?? rng.pick([8, 9, 10, 11]);
    // The wrong day length a careless reader substitutes. Drawn from the OTHER allowed values rather
    // than being half of the right one.
    const wrongHours    = f.wrongHours    ?? rng.pick([8, 9, 10, 11].filter(h => h !== hoursPerDay));
    // The hourly rate must be whole, so the batch size comes from the multiples that make it so.
    const step = batchMinutes / gcd(batchMinutes, 60);
    const lo = Math.ceil(1000 / step), hi = Math.floor(1800 / step);
    if (hi < lo) return reject(diag, 'no-whole-hourly-rate');
    const unitsPerBatch = f.unitsPerBatch ?? rng.int(lo, hi) * step;

    const perHour = unitsPerBatch / batchMinutes * 60;
    if (!Number.isInteger(perHour)) return reject(diag, 'hourly-rate-not-whole');
    const perDay = perHour * hoursPerDay;

    // The container size is taken from the divisors of the daily output in the 20 to 50 range,
    // not drawn from it. Drawing rejected 84% of attempts on this one condition.
    const sizes = [];
    for (let c = 20; c <= 50; c++) if (perDay % c === 0) sizes.push(c);
    if (!sizes.length) return reject(diag, 'no-whole-container-count');
    const containerSize = f.containerSize ?? rng.pick(sizes);
    const containers = perDay / containerSize;

    const containerPrice = f.containerPrice ?? roundTo(rng.float(10, 20), 2);
    const revenue = roundTo(containers * containerPrice, 2);

    // Backwards: the answer is chosen first and the capital cost follows.
    const answer = f.answer ?? rng.int(16, 60) / 2;      // 8.0 to 30.0 in steps of 0.5
    const capitalCost = roundTo(revenue * answer, 2);

    const dAllDay   = roundTo(capitalCost / (perHour * 24 / containerSize * containerPrice), 2);
    const dPerUnit  = roundTo(capitalCost / (perDay * containerPrice), 2);
    const dPerHour  = roundTo(capitalCost / (unitsPerBatch * hoursPerDay / containerSize * containerPrice), 2);
    // WAS `hoursPerDay / 2`, and that made a05 the only fully solvable archetype in the library.
    //
    // Halving the day gives a payback period of exactly twice the answer, every time, so the answer
    // was always the smaller member of a 2:1 pair. Measured over 200 items: "find the unique 2:1 pair
    // and take the smaller" hit 64%, and on the other 36%, where hoursPerDay was 12 and the 24-hour
    // distractor supplied a second 2:1 pair, "find the 1:2:4 triple and take the middle" hit the rest.
    // The two rules together covered every item, with no chart, no stem and no arithmetic beyond
    // spotting a doubling.
    //
    // Substituting a wrong day length from the other allowed values gives ratios of 8/9, 8/11, 11/9
    // and so on, none of them 2 and none of them constant across items, so no single rule transfers.
    const dWrongDay = roundTo(capitalCost / (perHour * wrongHours / containerSize * containerPrice), 2);

    const set = [answer, dAllDay, dPerUnit, dPerHour, dWrongDay];
    if (!set.every(v => Number.isFinite(v) && v > 0)) return reject(diag, 'option-not-positive');
    if (new Set(set.map(v => v.toFixed(2))).size !== 5) return reject(diag, 'option-collision');

    // FORMATTING TELL, and this is the SECOND free rule found in a05. The archetype spec puts
    // the answer on a multiple of 0.5, so it is a whole number of days half the time while the
    // four distractors are quotients and are not. Measured over 200 items, the answer was the only
    // option with an empty fractional part in 34.5% of them, so "pick the one with no decimal
    // part" gives an expected 47.6%, or 2.38x chance, for no arithmetic at all. That is worse than
    // the narrowing cases recorded at 1.67x, which at least cost as much as solving.
    //
    // The spec already forbids this: the answer must not be the single visually distinct
    // option. What hid it is that format.harmonise gives the set a uniform decimal count, so the
    // decimal-place check passes while .00 against .17 survives inside it. Forcing the answer never
    // to be whole would be the same tell reversed, so the guard is the one the spec states.
    const isWhole = v => Math.abs(v - Math.round(v)) < 1e-9;
    if (isWhole(answer) && ![dAllDay, dPerUnit, dPerHour, dWrongDay].some(isWhole)) {
      return reject(diag, 'answer-alone-on-a-whole-value');
    }

    const m = v => money(v, '£', 2);
    let options;
    try {
      options = assemble({
        correct: { value: answer },
        distractors: [
          { value: dAllDay, errorType: 'wrong-input',
            note: `ran the line 24 hours a day rather than ${hoursPerDay}` },
          { value: dPerUnit, errorType: 'wrong-unit',
            note: `priced individual ${plant.unit.p} at the ${plant.box.s} price` },
          { value: dPerHour, errorType: 'wrong-unit',
            note: `read ${unitsPerBatch.toLocaleString('en-GB')} as an hourly figure rather than a ${batchMinutes} minute batch` },
          { value: dWrongDay, errorType: 'wrong-input',
            note: `used a ${wrongHours} hour day rather than ${hoursPerDay}` },
        ],
        answerType: 'number',
        rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    return {
      id: `a05#${rng.seed}`,
      archetypeId: 'a05',
      seed: rng.seed,
      tier,
      stimulusType: 'prose',
      stimulus: {
        text: `${plant.org} produces ${unitsPerBatch.toLocaleString('en-GB')} ${plant.unit.p} `
            + `every ${batchMinutes} minutes and runs for ${hoursPerDay} hours a day. `
            + `${plant.unit.p[0].toUpperCase()}${plant.unit.p.slice(1)} are sold by the ${plant.box.s} `
            + `of ${containerSize}, at ${m(containerPrice)} a ${plant.box.s}. `
            + `${plant.kit[0].toUpperCase()}${plant.kit.slice(1)} would cost ${money(capitalCost, '£', 0)}.`,
      },
      questionText: `How many days of output would it take to pay for ${plant.kit}?`,
      answerType: 'number',
      correct: { value: answer, display: options.find(o => o.role === 'correct').display },
      options,
      optionContext: {},
      // `capitalCost` added. a05 draws its ANSWER first and derives the capital cost from
      // it, so `params.answer` is a lookup rather than an estimate and a route must not read it.
      // The capital cost is a stem quantity, so it belongs in the worked values regardless.
      values: { perHour, perDay, containers, revenue, capitalCost },
      workings: {
        formulaText: this.formulaText,
        steps: [
          `per hour = ${unitsPerBatch.toLocaleString('en-GB')} ÷ ${batchMinutes} × 60 = ${perHour.toLocaleString('en-GB')}`,
          `per day = ${perHour.toLocaleString('en-GB')} × ${hoursPerDay} = ${perDay.toLocaleString('en-GB')}`,
          `${plant.box.p} a day = ${perDay.toLocaleString('en-GB')} ÷ ${containerSize} = ${containers.toLocaleString('en-GB')}`,
          `revenue a day = ${containers.toLocaleString('en-GB')} × ${m(containerPrice)} = ${m(revenue)}`,
          `answer = ${money(capitalCost, '£', 0)} ÷ ${m(revenue)} = ${answer} days`,
        ],
      },
      targetSeconds: 83,
      params: { plant, unitsPerBatch, batchMinutes, hoursPerDay, wrongHours, containerSize, containerPrice, answer },
    };
  },
};

function gcd(a, b) { while (b) { [a, b] = [b, a % b]; } return a; }
