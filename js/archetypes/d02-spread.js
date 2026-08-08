import { money, roundTo, awkward } from '../lib/money.js';
import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';

// d02 - Currency conversion with a spread
//
// Two rates are printed and only one applies. A bureau BUYS the foreign currency low and SELLS it
// high, so which side you land on depends on which way you are going, and the stem says which.
// A percentage commission on top gives the second half of the item.
//
// TWO DIVERGENCES, both measured.
//
// 1. The archetype spec names "spread ignored entirely" and "mid-rate used" as separate distractors and
//    they are the same value: ignoring the spread means using the midpoint, and there is no third
//    rate to ignore it towards. The duplicate is replaced by `wrong-base`.
//
// 2. THE SPREAD BAND OF 1.5 TO 4 PER CENT IS ARITHMETICALLY IMPOSSIBLE HERE, and it took a 100%
//    rejection rate to see why. The sell rate, the mid and the buy rate are evenly spaced, so the
//    three options built on them sit at adjacent gaps of HALF the spread, 0.75 to 2 per cent. The
//    library's minimum option gap is 2 per cent of the larger. The two constraints cannot both
//    hold, and min-gap rejected 77.5% of attempts with spread-out-of-band taking most of the rest.
//    The band widens to 6 to 12 per cent, which also happens to be the right number: 1.5 to 4 is
//    an interbank spread, and a retail bureau at a port or an airport runs 6 to 12. The
//    specification was quoting the wholesale figure at a retail counter.
//
// 3. NO WRONG-BASE OPTION EXISTS IN THIS ARCHETYPE, and two attempts at one were measured and
//    dropped. A percentage commission COMMUTES with the conversion, so "charged the commission on
//    the converted amount" is algebraically the answer. A flat fee does not commute, but the
//    non-commuting part is the raw fee against a converted total, which is 0.1 to 1 per cent
//    apart and fails the minimum option gap in 96.4% of attempts. A single linear conversion has
//    no second base to get wrong. The fourth option is therefore a filler on a drawn side, which
//    is also what decides the sorted slot.
//
// POSITION. All three derived options sit ABOVE the answer, and that is forced: the wrong side of
// the spread, the mid-rate and the un-commissioned amount are each the answer with one adverse
// term removed. So the slot is 1 or 2 depending on where the filler falls, and the filler is
// hidden, which is the a08 disposition and carries no severity flag. Worth having: The spec
// records sorted slot 1 as reached by almost nothing in the library.

const BUREAUX = [
  { city: 'Dover',     cur: 'euros',            one: 'euro',            sym: '\u20ac', lo: 112, hi: 132 },
  { city: 'Heathrow',  cur: 'US dollars',       one: 'US dollar',       sym: '$',      lo: 120, hi: 140 },
  { city: 'Gatwick',   cur: 'Canadian dollars', one: 'Canadian dollar', sym: 'C$',     lo: 160, hi: 185 },
  { city: 'Holyhead',  cur: 'Swiss francs',     one: 'Swiss franc',     sym: 'CHF ',   lo: 108, hi: 124 },
];
const TRAVELLERS = ['Priya', 'Delphine', 'Emeka', 'Rosalind', 'Tomas', 'Nuala', 'Bertrand', 'Sasha'];

export default {
  id: 'd02',
  name: 'Currency conversion with a spread',
  group: 'money',
  desks: [1],
  tiers: ['standard', 'hard'],
  stimulus: 'prose',
  answerType: 'currency',
  targetSeconds: 83,

  // The stem says whether she is buying the foreign currency or selling it back, so she knows
  // which side of the board applies before doing any arithmetic.
  variants: { key: 'direction', visible: true },

  constraints: [
    'the spread is between 6 and 12 per cent of the mid-rate, which is what a retail bureau runs '
      + 'and is also the narrowest band that clears the 2 per cent minimum option gap, since the '
      + 'mid-rate option sits halfway between the two sides',
    'a percentage commission is stated, and it differs from the half-spread by at least 2.5 '
      + 'points so the un-commissioned option and the mid-rate option cannot collide',
    'the answer lands exactly on two decimal places',
    'the answer is not the only option sitting on a whole number of pounds',
  ],

  errorTypes: ['wrong-side', 'used-mid', 'omitted-component', 'filler'],

  formulaText: 'amount less commission, converted at the side of the spread that applies',

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const b = f.bureau ?? rng.pick(BUREAUX);
    const who = f.who ?? rng.pick(TRAVELLERS);
    const direction = f.direction ?? (rng.next() < 0.5 ? 'buying' : 'sellingBack');

    // Rates in hundredths of a unit per pound. A bureau always deals on the side that is worse
    // for the customer: it sells foreign currency at the LOWER units-per-pound and buys it back
    // at the higher, so either way she gets less than the mid-market figure.
    const mid = f.mid ?? rng.int(b.lo, b.hi);
    const halfSpread = f.halfSpread
      ?? rng.int(Math.ceil(mid * 0.052), Math.max(Math.ceil(mid * 0.052) + 1, Math.floor(mid * 0.065)));
    const sell = mid - halfSpread;
    const buy = mid + halfSpread;
    const halfPct = 100 * halfSpread / mid;
    // THE BAND IS SET BY THE OPTION GEOMETRY, not by taste, and this took three measurements to
    // get right. Every derived option here is the answer plus a small percentage: the commission
    // c, the half-spread, and the full spread at twice the half. Five options inside a band that
    // narrow cannot all keep the 2% minimum gap, and the first two attempts rejected 61.9% and
    // 96.4% on exactly that. Solving the four gaps simultaneously against a 2.2% floor gives
    // c = 3 with a half-spread of 5.2 to 6.5, so the option positions are 0, 3, 5.2-6.5 and
    // 10.4-13 per cent. A full spread of 10 to 13 per cent is also what an airport bureau
    // actually charges; the archetype spec's 1.5 to 4 is an interbank spread quoted at a retail counter.
    if (halfPct < 5.2 || halfPct > 6.5) return reject(diag, 'spread-out-of-band');

    // Drawn away from the half-spread rather than drawn and rejected: the un-commissioned option
    // sits `c` above the answer and the mid-rate option sits `halfPct` above it, so the two
    // collide on the minimum gap whenever they are close.
    const commission = f.commission ?? 3;
    if (halfPct - commission < 2.2) return reject(diag, 'no-commission-clear-of-the-half-spread');

    const applied = direction === 'buying' ? sell : buy;
    const wrongSide = direction === 'buying' ? buy : sell;
    const convert = (amt, rate) => direction === 'buying' ? amt * rate / 100 : amt * 100 / rate;

    // NO EXACTNESS CONSTRAINT, deliberately. Requiring the answer to land on a whole penny means
    // clearing both the commission and the rate, and the residue class that survives is coarse
    // enough to reject 28% of attempts and to make the printed amounts look chosen. A bureau
    // rounds to the penny and so does this, which is what the real product does. The answer is
    // computed unrounded and only the printed value is rounded, as b03 does.
    const amount = f.amount ?? roundTo(Math.round(awkward(rng, 40000, 150000, 0)) / 100, 2);
    const answer = roundTo(direction === 'buying'
      ? amount * (100 - commission) / 100 * applied / 100
      : amount * (100 - commission) / 100 * 100 / applied, 2);
    const net = amount * (100 - commission) / 100;

    const dSide = roundTo(convert(net, wrongSide), 2);
    const dMid = roundTo(convert(net, mid), 2);
    const dNoComm = roundTo(convert(amount, applied), 2);
    const above = [dSide, dMid, dNoComm].filter(v => v > answer);
    if (above.length !== 3) return reject(diag, 'unexpected-option-geometry');

    // The filler decides the slot, and its side is drawn. Hidden from the candidate, who cannot
    // tell which of five options is the filler without doing the arithmetic.
    // The filler has exactly two homes and they give different sorted slots. Below the answer the
    // space is open, which puts the answer second. In the gap between the mid-rate option and the
    // wrong-side option, which is the half-spread wide and the only interior gap with room for two
    // 2% clearances, everything is above the answer and it lands FIRST. Sorted slot 1 is reached
    // by almost nothing else in the library, so the second home is worth the arithmetic.
    const sortedAbove = [...above].sort((x, y) => x - y);
    const fillerBelow = f.fillerBelow ?? (rng.next() < 0.5);
    const span = fillerBelow
      ? [answer / 1.14, answer]
      : [sortedAbove[1], sortedAbove[2]];
    const width = span[1] - span[0];
    if (width < 0.042 * answer) return reject(diag, 'no-room-for-filler');
    const filler = f.filler ?? roundTo(span[0] + width * rng.float(0.42, 0.58), 2);
    const gapOk = (x, y) => Math.abs(x - y) >= 0.021 * Math.max(Math.abs(x), Math.abs(y));
    if (![answer, ...above].every(v => gapOk(v, filler))) return reject(diag, 'filler-too-tight');

    const isWhole = v => Math.abs(v - Math.round(v)) < 1e-9;
    if (isWhole(answer) && ![dSide, dMid, dNoComm, filler].some(isWhole)) {
      return reject(diag, 'answer-alone-on-a-whole-value');
    }

    const outSym = direction === 'buying' ? b.sym : '\u00a3';
    const inSym = direction === 'buying' ? '\u00a3' : b.sym;
    const m = (v, sym) => money(v, sym, 2);

    let options;
    try {
      options = assemble({
        correct: { value: answer },
        distractors: [
          { value: dSide, errorType: 'wrong-side',
            note: `used ${(wrongSide / 100).toFixed(2)}, which is the side the bureau deals on when the money goes the other way` },
          { value: dMid, errorType: 'used-mid',
            note: `split the board and used the mid-market ${(mid / 100).toFixed(2)}, which no bureau deals at` },
          { value: dNoComm, errorType: 'omitted-component',
            note: `converted the whole amount and never took the ${commission}% commission off` },
        ],
        filler: [{ value: filler, note: 'filler, close enough that magnitude cannot resolve the item' }],
        answerType: 'currency',
        context: { currencySymbol: outSym },
        rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    const board = `The ${b.city} bureau sells ${b.cur} at ${(sell / 100).toFixed(2)} to the pound `
      + `and buys them back at ${(buy / 100).toFixed(2)}, and charges ${commission}% commission either way.`;
    const stimulus = direction === 'buying'
      ? `${who} is changing ${m(amount, '\u00a3')} into ${b.cur} before a trip. ${board}`
      : `${who} is back from a trip with ${m(amount, b.sym)} left over and is changing it back into pounds. ${board}`;

    return {
      id: `d02#${rng.seed}`,
      archetypeId: 'd02',
      seed: rng.seed,
      tier,
      stimulusType: 'prose',
      stimulus: { text: stimulus },
      questionText: direction === 'buying'
        ? `How many ${b.cur} will she receive?`
        : 'How much will she receive in pounds?',
      answerType: 'currency',
      correct: { value: answer, display: options.find(o => o.role === 'correct').display },
      options,
      optionContext: { currencySymbol: outSym },
      values: { amount, sell: sell / 100, buy: buy / 100, mid: mid / 100, commission, applied: applied / 100 },
      workings: {
        formulaText: this.formulaText,
        steps: [
          `commission = ${commission}% of ${m(amount, inSym)}, leaving ${m(net, inSym)}`,
          `she is ${direction === 'buying' ? 'buying' : 'selling'} ${b.cur}, so the bureau's `
            + `${direction === 'buying' ? 'sell' : 'buy'} rate of ${(applied / 100).toFixed(2)} applies`,
          `answer = ${m(answer, outSym)}`,
        ],
      },
      targetSeconds: 83,
      params: { direction, city: b.city, mid: mid / 100, spreadPct: roundTo(2 * halfPct, 2), commission, fillerBelow },
    };
  },
};
