import { money, roundTo, awkward } from '../lib/money.js';
import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import { sig2 } from '../lib/precision.js';

// d01 - Currency conversion
//
// The rate is quoted in one explicit direction, in words, and the direction of the transaction
// decides whether you multiply or divide. Both are visible in the stem before any arithmetic, so
// the diagnostics split on them.
//
// THREE DIVERGENCES FROM the archetype spec, all recorded rather than worked around.
//
// 1. The archetype spec names four distractors and two of them are the same value. "Multiplied where
//    division was needed" is T x r; "reciprocal of the rate used" is T / (1/r), which is also
//    T x r. With one printed rate and one printed amount there is no stem under which those two
//    differ, so the duplicate is replaced by `omitted-component`, converting one item rather than
//    the whole order. That is one of the three highest-frequency families in the format and
//    The archetype spec's own closing note says to drill it hardest, so the substitution is an improvement
//    rather than a compromise.
//
// 2. THE ORDER IS COMPOSITE, q items at a unit price, which is what makes `omitted-component`
//    exist at all. A single amount admits only powers of the rate, and an option set that is a
//    geometric sequence in r is a visual tell before it is anything else.
//
// 3. TWO SORTED SLOTS, 3 and 4, and the geometry is forced. Relative to the answer the inverted
//    rate is a factor of r^2 and the double application a factor of 1/r, so whichever way the
//    rate points exactly one of them sits above and the other below; `omitted-component` is the
//    answer divided by q, with q >= 2, so it is always below. Two below and one above, always.
//    The filler decides the slot, its side is drawn, and it is HIDDEN: the candidate cannot tell
//    which of five options is the filler without doing the arithmetic. Same disposition as a08,
//    so no severity flag under the spec's visible-split rule.
//
// A FOURTH DESIGN WAS MEASURED AND REJECTED, and it is worth recording because it looked better.
// Printing a second currency on the board and using its rate for the fourth distractor gives a
// derived option instead of a filler, which is what open item 10 wants. But that option sits
// above the answer exactly when the second rate is below the first, and both rates are printed,
// so the sorted slot becomes a stem-known function and the candidate goes from a one-in-two guess
// to a certainty. That is the b02 shape, a visible discriminator, and it is worse than the filler
// it replaces. The second rate belongs to d02, where the spread is the item.

// Each currency carries its own suppliers, because the first draft paired them at random and the
// audit sample opened with a lab in Singapore invoicing in Australian dollars. A stimulus that is
// obviously wrong costs trust on an item whose arithmetic is fine.
const CURRENCIES = [
  { name: 'US dollars', one: 'US dollar', symbol: '$', lo: 1.20, hi: 1.40, orders: [
    { org: 'a printer in Chicago',   item: 'display board',    plural: 'display boards' },
    { org: 'a supplier in Portland', item: 'pressure gauge',   plural: 'pressure gauges' } ] },
  { name: 'euros', one: 'euro', symbol: '\u20ac', lo: 1.19, hi: 1.32, orders: [
    { org: 'a workshop in Hamburg',  item: 'brake assembly',   plural: 'brake assemblies' },
    { org: 'a foundry in Bilbao',    item: 'bronze fitting',   plural: 'bronze fittings' } ] },
  { name: 'Canadian dollars', one: 'Canadian dollar', symbol: 'C$', lo: 1.60, hi: 1.85, orders: [
    { org: 'a mill in Vancouver',    item: 'oak panel',        plural: 'oak panels' },
    { org: 'a workshop in Toronto',  item: 'drive coupling',   plural: 'drive couplings' } ] },
  { name: 'Singapore dollars', one: 'Singapore dollar', symbol: 'S$', lo: 1.60, hi: 1.80, orders: [
    { org: 'a lab in Singapore',     item: 'filter cartridge', plural: 'filter cartridges' },
    { org: 'a plant in Jurong',      item: 'sensor housing',   plural: 'sensor housings' } ] },
  { name: 'Australian dollars', one: 'Australian dollar', symbol: 'A$', lo: 1.75, hi: 1.95, orders: [
    { org: 'a foundry in Adelaide',  item: 'bronze fitting',   plural: 'bronze fittings' },
    { org: 'a supplier in Geelong',  item: 'roller bearing',   plural: 'roller bearings' } ] },
];

// Rates are two decimal places, which is what a bureau board shows, and the roundest values are
// left out because 1.50 and 1.25 can be done in the head and the spec wants a setup forced.
const RATES = [128, 132, 136, 138, 144, 152, 155, 164, 168, 172, 176, 184, 188, 192];

const BUYERS = ['Priya', 'Marguerite', 'Delphine', 'Emeka', 'Rosalind', 'Tomas', 'Nuala', 'Fenella'];

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

export default {
  id: 'd01',
  name: 'Currency conversion',
  group: 'money',
  desks: [1],
  tiers: ['warmup', 'standard'],
  stimulus: 'prose',
  answerType: 'currency',
  targetSeconds: 83,

  // The stem says whether the invoice is priced in pounds or in the foreign currency, so the
  // candidate knows which way the rate runs before doing anything. Visible.
  variants: { key: 'direction', visible: true },

  constraints: [
    'the rate is quoted in one explicit direction, stated in words',
    'inverting the rate gives a value at least 1.4 times away from the answer, which fixes the '
      + 'rate at 1.19 or above since the inversion is a factor of r squared',
    'the answer lands exactly on two decimal places, by choosing the unit price from the residue '
      + 'class the rate divides cleanly',
    'the rate is not a value that can be applied in the head',
    'the order is three or four items, so the omitted-component option is never exactly half '
      + 'the answer and the set carries no clean 2:1 pair',
    'all five options distinct after formatting',
  ],

  errorTypes: ['inverted-rate', 'double-application', 'omitted-component', 'filler'],

  formulaText: 'order total in the priced currency, converted once in the direction the quote runs',


  // THE ESTIMATION ROUTE.
  //
  // d01 carries the warmup tier, so it rotates more than almost anything in the library, and it is
  // the archetype whose whole difficulty is choosing a DIRECTION: multiply or divide. The estimate
  // settles that before any arithmetic, because the two candidate results differ by a factor of
  // rate squared and the option set is built so that inversion is at least 1.4x away. Rounding the
  // order total to two figures is enough to name the answer and is measured doing so.
  estimate(p) {
    const total = sig2(p.q * p.unitPrice);
    const value = p.direction === 'intoHome' ? total / p.rate : total * p.rate;
    return {
      value,
      text: `about ${total} ${p.direction === 'intoHome' ? 'divided by' : 'multiplied by'} `
        + `${p.rate.toFixed(2)} is about ${Math.round(value)}`,
    };
  },

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const direction = f.direction ?? (rng.next() < 0.5 ? 'intoHome' : 'intoForeign');
    const cur = f.cur ?? rng.pick(CURRENCIES);
    const order = f.order ?? rng.pick(cur.orders);
    const buyer = f.buyer ?? rng.pick(BUYERS);
    // q STARTS AT THREE, and the reason is measured. At q = 2 the omitted-component option is
    // exactly half the answer, so the option set carries a clean 2:1 pair with the answer as its
    // larger member in every such item. The directional check read 41.0%, or 2.05x chance, on
    // "find the unique 2:1 pair and take the larger" - the a05 shape exactly, and above the 1.6x
    // bar at which a directional rule is fixed locally. Dropping q = 2 removes the pair rather
    // than obscuring it. No other pair of options stands in an exact small-integer ratio: the
    // remaining ratios are r squared, r and q, none of which is 2 anywhere in the drawn ranges.
    const q = f.q ?? rng.int(3, 4);

    // The rate, in hundredths, from the band this currency plausibly trades in.
    const band = RATES.filter(k => k >= cur.lo * 100 - 0.5 && k <= cur.hi * 100 + 0.5);
    if (!band.length) return reject(diag, 'no-rate-in-band');
    const k = f.k ?? rng.pick(band);
    const r = k / 100;
    // The archetype spec: inverting the rate must give a value at least 1.4x away. Inverting is a factor
    // of r squared, so this is r >= sqrt(1.4) = 1.1832 and every listed rate clears it. Checked
    // rather than assumed, because the rate list is the kind of thing a later edit widens.
    if (r * r < 1.4) return reject(diag, 'inversion-too-close');

    // Exactness. Working in pence, dividing by r multiplies by 100/k, so the priced total must be
    // a multiple of k / gcd(k,100); multiplying by r multiplies by k/100, so it must be a multiple
    // of 100 / gcd(k,100). The unit price is drawn from that residue class, which is a constructive
    // draw rather than a rejection: a20 does the same thing for its reverse percentage.
    const g = gcd(k, 100);
    const mod = direction === 'intoHome' ? k / g : 100 / g;
    let pencePer;
    if (f.pencePer !== undefined) {
      pencePer = f.pencePer;
    } else {
      const lo = Math.ceil(Math.round(awkward(rng, 9000, 16000, 0)) / mod);
      pencePer = lo * mod;
    }
    if ((q * pencePer) % mod !== 0) return reject(diag, 'total-not-clean');

    const unitPrice = pencePer / 100;
    const totalPriced = roundTo(q * unitPrice, 2);
    const answerPence = direction === 'intoHome'
      ? (q * pencePer * 100) / k
      : (q * pencePer * k) / 100;
    if (!Number.isInteger(answerPence)) return reject(diag, 'answer-not-exact');
    const answer = answerPence / 100;

    // The three derived procedures. Relative to the answer they are r^2, 1/r and 1/q, so exactly
    // one of the first two is above and the other below whichever way the rate points, and the
    // third is always below.
    const inverted = roundTo(direction === 'intoHome' ? totalPriced * r : totalPriced / r, 2);
    const twice    = roundTo(direction === 'intoHome' ? totalPriced / (r * r) : totalPriced * r * r, 2);
    const oneItem  = roundTo(answer / q, 2);

    // The filler, and its side is drawn. Below the answer it sits between the answer and the
    // nearer of the two options underneath it; above, between the answer and the option above.
    // Drawn from the interval rather than derived, so nothing about it is recoverable, and drawn
    // BEFORE the interval search so the tie-break cannot resolve to one side every time, which is
    // the a08 defect.
    const below = [inverted, twice, oneItem].filter(v => v < answer).sort((a, b) => b - a);
    const above = [inverted, twice, oneItem].filter(v => v > answer).sort((a, b) => a - b);
    if (below.length !== 2 || above.length !== 1) return reject(diag, 'unexpected-option-geometry');
    const fillerBelow = f.fillerBelow ?? (rng.next() < 0.5);
    // The interval is clamped to what validate will accept rather than left to be rejected
    // afterwards: a filler must sit within 2x of the answer, and every adjacent pair needs 2% of
    // the larger between them. Above the answer the inverted-rate option reaches 3.7x at the top
    // of the rate range, so without the clamp one attempt in nine died on filler-far.
    const nearBelow = Math.max(below[0], answer / 1.9);
    const nearAbove = Math.min(above[0], answer * 1.9);
    const span = fillerBelow ? [nearBelow, answer] : [answer, nearAbove];
    const width = span[1] - span[0];
    if (width < 0.05 * answer) return reject(diag, 'no-room-for-filler');
    // Forceable, because the spec asks a fixture to inject every parameter the arithmetic
    // depends on. Leaving this to the rng made the fixture pass or fail on draw order.
    const filler = f.filler ?? roundTo(span[0] + width * rng.float(0.28, 0.72), 2);
    const gapOk = (a, b) => Math.abs(a - b) >= 0.021 * Math.max(Math.abs(a), Math.abs(b));
    if (![answer, ...below, ...above].every(v => gapOk(v, filler))) return reject(diag, 'filler-too-tight');

    // FORMATTING TELL. The exactness constraint puts the answer on a whole number of pounds in
    // 31% of draws, and in 15% it was the ONLY option with no pence, which is a free rule needing
    // no arithmetic. Forcing the answer never to be whole is the same tell reversed, so the guard
    // is the one the spec actually states: the answer may be whole, but not alone in it.
    const isWhole = v => Math.abs(v - Math.round(v)) < 1e-9;
    if (isWhole(answer) && ![inverted, twice, oneItem, filler].some(isWhole)) {
      return reject(diag, 'answer-alone-on-a-whole-value');
    }

    const homeSym = '\u00a3';
    const paySym = direction === 'intoHome' ? cur.symbol : homeSym;
    const ansSym = direction === 'intoHome' ? homeSym : cur.symbol;
    const m = (v, sym) => money(v, sym, 2);

    let options;
    try {
      options = assemble({
        correct: { value: answer },
        distractors: [
          { value: inverted, errorType: 'inverted-rate',
            note: direction === 'intoHome'
              ? `multiplied by ${r.toFixed(2)} where the quote runs the other way, so this converts pounds into ${cur.name}`
              : `divided by ${r.toFixed(2)} where the quote runs the other way, so this converts ${cur.name} into pounds` },
          { value: twice, errorType: 'double-application',
            note: `applied the rate twice, ${direction === 'intoHome' ? 'dividing' : 'multiplying'} by ${r.toFixed(2)} a second time` },
          { value: oneItem, errorType: 'omitted-component',
            note: `converted one ${order.item} at ${m(unitPrice, paySym)} and not the order of ${q}` },
        ],
        filler: [{ value: filler, note: 'filler, sits between two derived values so magnitude cannot resolve the item' }],
        answerType: 'currency',
        context: { currencySymbol: ansSym },
        rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    const quote = `\u00a31 buys ${r.toFixed(2)} ${cur.name}`;
    const stimulus = direction === 'intoHome'
      ? `${buyer} is settling an invoice from ${order.org} for ${q} ${order.plural} at `
        + `${m(unitPrice, cur.symbol)} each. Her bank's board quotes ${quote}.`
      : `${buyer} is ordering ${q} ${order.plural} from ${order.org}. They are listed at `
        + `${m(unitPrice, homeSym)} each in sterling and the supplier will be paid in `
        + `${cur.name}. Her bank's board quotes ${quote}.`;

    return {
      id: `d01#${rng.seed}`,
      archetypeId: 'd01',
      seed: rng.seed,
      tier,
      stimulusType: 'prose',
      stimulus: { text: stimulus },
      questionText: direction === 'intoHome'
        ? 'What will the invoice cost her in pounds?'
        : `What will the order cost in ${cur.name}?`,
      answerType: 'currency',
      correct: { value: answer, display: options.find(o => o.role === 'correct').display },
      options,
      optionContext: { currencySymbol: ansSym },
      values: { unitPrice, q, totalPriced, rate: r },
      workings: {
        formulaText: this.formulaText,
        steps: [
          `order = ${q} × ${m(unitPrice, paySym)} = ${m(totalPriced, paySym)}`,
          direction === 'intoHome'
            ? `${quote}, and the invoice is in ${cur.name}, so divide`
            : `${quote}, and the order is in pounds, so multiply`,
          `answer = ${m(totalPriced, paySym)} ${direction === 'intoHome' ? '÷' : '×'} ${r.toFixed(2)} = ${m(answer, ansSym)}`,
        ],
      },
      targetSeconds: 83,
      params: { direction, currency: cur.name, q, rate: r, unitPrice, fillerBelow },
    };
  },
};
