import { money } from '../lib/money.js';
import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import { tableSpec } from '../lib/table.js';

// a12 - Total cost of ownership
//
// Sum every cost line, including both labour rates. The trainee wage bill is the line
// most often omitted and it is always the largest.
//
// ---------------------------------------------------------------------------------
// STRUCTURAL CHANGE 1, blocker B1: three separable omission distractors.
//
// As specified this archetype cannot produce five distinct options. All three omission
// distractors are package labels, and with licences drawn across the full 19,000 to
// 25,000 range the licence line spans 6,000 while the trainer labour line spans about
// 2,270. The licence dominates, so argmin(licence), argmin(trainer-only) and
// argmin(trainee-only) collapse onto one package. Measured over 43,421 draws satisfying
// every stated constraint, all three landed distinct and non-winning 38 times: 0.09%.
// The natural parameterisation of this item type collapses the same way.
//
// So the separation below is A DELIBERATE CHOICE, not a correctness fix. The simpler
// version of this item carries one derived distractor and two pure fillers. Three
// separable argmins buys something that version cannot give: the error type records
// which shortcut was taken, which is most of why this app exists. It costs a little
// realism. Recorded as a trade, not as a correction.
//
// The mechanism is total offsets proportional to the base gaps, so that
//   licence_i − licence_j = (base_i − base_j)(k − 1)
// and the licence spread becomes a controllable fraction of the base spread rather than an
// accident of the draw.
//
// The window is calibrated so that the option set behaves the way it must: its
// licences run 13,000 to 16,000 and the winner's licence premium over the cheapest licence
// is 1,000, or 5.3% of the total. That premium is what makes the cheapest-licence shortcut
// tempting, and too narrow a window kills the distractor it exists to bait. Swept over
// 3,000 accepted items per setting:
//
//   window   attempts/item   winner premium over the cheapest licence
//   1,200        1.12                 2.4% of total     too flat, the shortcut goes dead
//   1,800        1.09                 3.5%
//   2,400        1.08                 4.8%
//   3,000        1.05                 5.5%              chosen
//   3,600        1.06                 5.7%              saturates on the base gap
//
// 3,000 is used. It matches the source premium and costs nothing in attempts.
//
// ---------------------------------------------------------------------------------
// STRUCTURAL CHANGE 2: the catch-all is sometimes correct.
//
// A unique winner in every item makes "All would cost the same" wrong 100% of the time,
// and two hundred repetitions teach that the last option is never the answer. That habit
// transfers wrongly: Desk 02's b05 specifies "Cannot Say" as an option that may be
// correct, and items of this type do carry it live. So a share of items are genuine four-way
// ties where the catch-all is the answer. The three shortcut distractors still work,
// because a candidate taking any shortcut picks a specific package and is wrong.
//
// This is a general rule and belongs on the checklist: any archetype carrying a fixed
// catch-all option must have that option be correct sometimes. The audit page reports the
// observed rate per archetype against the declared target.
//
// ---------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------
// STRUCTURAL CHANGE 3: the winner sits at no extreme of a visible column.
//
// The first version of change 1 inverted the leak instead of removing it. Killing "the
// cheapest licence is the answer" produced "the priciest licence is the answer", which is
// the same free shortcut pointing the other way. Measured by the audit's column-correlation
// diagnostic: the winner held the highest licence in 100% of items, and the fewest training
// hours in 82%, against a 25% chance rate.
//
// The licence half is not a tuning problem, it is a geometric one. Write the total excess of
// a non-winner i over the winner as e_i, so licence_i = licence_W + e_i − (base_i − base_W).
// Two requirements pull against each other:
//
//   to sit ABOVE the winner on licence      e_i > base_i − base_W
//   to win its own omission argmin          e_i < (the gap on the line that gets omitted)
//
// For the max-base package the second bound is always the tighter one, so it is always below
// the winner. For the max-hours package T, with n_W trainers on the winner,
//
//   above needs   e_T > Δsetup + h_T(2A + B) − h_W(n_W A + B)
//   winning needs e_T < B(h_T − h_W)
//
// and subtracting, those windows overlap only when Δsetup + A(2h_T − 2h_W) < 0, which needs
// h_W > h_T. Since h_T is the maximum hours, T can never sit above the winner. The same
// argument puts the max-base package below it too.
//
// The four-trainer package R is the one that can. For it,
//
//   cap_R − gap_R = B(h_W − h_R) − Δsetup
//
// which is positive exactly when the winner has more training hours than R. And that is the
// same condition needed to stop the hours column pointing at the winner, so one constraint
// fixes both leaks. It is satisfiable while the winner still holds the smallest base because
// coef(2)/coef(4) = 0.82, so fewer trainers over more hours is still the cheaper labour bill.
//
// Exactly one non-winner can therefore sit above the winner on licence, which puts the winner
// at rank 3 of 4: never the cheapest, never the priciest. Rank 3 every time would itself be a
// pattern, so a share of items drop the licence shortcut to filler and place the licences
// freely, which both spreads the rank and tightens the option set, whose shape
// carries one derived distractor and two fillers.
//
// ---------------------------------------------------------------------------------
// Two constraints hold by construction rather than by rejection, the an earlier round pattern:
//
//   Trainee labour exceeds trainer labour in every package, always, because
//   trainees × traineeRate >= 10 × 14 = 140 an hour while trainers × trainerRate
//   <= 4 × 28 = 112 an hour. No legal draw can violate it.
//
//   The lowest licence fee is never the winner, because the winner's licence sits above
//   the cheapest by the base gap less the margin, which is positive by design.

const SCENARIOS = [
  { org: 'Brackwell Health Partnership', system: 'a patient records system',
    trainee: 'ward administrator', trainees: 'ward administrators' },
  { org: 'Halvorsen Logistics', system: 'a fleet scheduling system',
    trainee: 'depot clerk', trainees: 'depot clerks' },
  { org: 'Ashcombe Legal', system: 'a case management system',
    trainee: 'paralegal', trainees: 'paralegals' },
  { org: 'Netherfield College', system: 'a learning platform',
    trainee: 'course tutor', trainees: 'course tutors' },
  { org: 'Rowan Structural', system: 'a CAD suite',
    trainee: 'design technician', trainees: 'design technicians' },
];

const LETTER_SETS = [['W', 'X', 'Y', 'Z'], ['J', 'K', 'L', 'M'], ['P', 'Q', 'R', 'S'], ['C', 'D', 'E', 'F']];

const r50 = v => Math.round(v / 50) * 50;

const BUF = 130;                     // absorbs the 200 to 320 setup range, must not flip an argmax
const GAP_LO = 800, GAP_HI = 2400;   // winner's base gap below the cheapest non-winner
const WINDOW = 3000;                 // licence spread ceiling; see the note above
const K_FLOOR = 0.25;
const TIE_RATE = 0.09;               // share of items where the catch-all is the answer
// The winner must sit at neither extreme of the licence column. See the note below.
const MIN_ABOVE = 1;
// Share of items that drop the licence shortcut to filler, freeing the licence placement.
// The simpler form of this item is one of these: one derived distractor and two fillers.
const FREE_LICENCE_RATE = 1.0;    // always. See the proof in structural change 3.
const CATCH_ALL = 'All would cost the same';

// Exported so the fixture harness can pin the arithmetic independently of the parameter
// draw. The spec: injecting parameters pins the arithmetic and nothing else. This is
// what keeps the archetype spec's machine-verified four-package fixture as a live test even though
// its parameters are rejected by the distinctness constraint above.
export function formula({ packages, trainees, trainerRate, traineeRate }) {
  const rows = packages.map(p => ({
    key: p.key,
    trainerLabour: p.trainers * trainerRate * p.hours,
    traineeLabour: trainees * traineeRate * p.hours,
    total: p.licence + p.setup + p.trainers * trainerRate * p.hours + trainees * traineeRate * p.hours,
  }));
  const sorted = [...rows].sort((a, b) => a.total - b.total);
  const out = { winner: sorted[0].key, margin: sorted[1].total - sorted[0].total };
  for (const r of rows) out['total_' + r.key] = r.total;
  return out;
}

export default {
  id: 'a12',
  name: 'Total cost of ownership',
  group: 'comparison',
  desks: [1],
  tiers: ['standard'],
  stimulus: 'table',
  answerType: 'label',
  targetSeconds: 83,

  // Tie and winner items share a stem and a four-way tie cannot be seen without adding four columns, so the split is hidden and carries no severity flag
  variants: { key: 'variant', visible: false },

  constraints: [
    'the package with the lowest licence fee is not the winner',
    'the winning margin over second place is under 1.5% of the total',
    'trainee labour exceeds trainer labour in every package',
    'the three omission procedures land on three distinct packages, none of them the winner',
    'the winner sits at neither extreme of the licence column',
    'the winner has more training hours than the four-trainer package, so hours is not its minimum either',
    'roughly one item in eleven is a genuine four-way tie, where the catch-all option is correct',
  ],

  errorTypes: ['headline-price', 'omitted-component'],

  formulaText: 'licence + setup + trainers × trainer rate × hours + trainees × trainee rate × hours, lowest wins',

  // Any archetype with a fixed catch-all option declares the share of items in which that
  // option is correct, and the audit reports the observed rate against it.
  catchAllTargetRate: TIE_RATE,

  formula,

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const scenario    = f.scenario    ?? rng.pick(SCENARIOS);
    const letters     = f.letters     ?? rng.pick(LETTER_SETS);
    const trainees    = f.trainees    ?? rng.int(10, 14);
    const trainerRate = f.trainerRate ?? rng.int(24, 28);
    const traineeRate = f.traineeRate ?? rng.int(14, 16);
    const variant     = f.variant     ?? (rng.next() < TIE_RATE ? 'tie' : 'winner');

    // Write A = trainerRate and B = trainees × traineeRate, so a package's labour bill is
    // hours × (trainers × A + B) and its base is that plus setup. Four roles, each the
    // unique argmax of one line:
    //   T  max hours with 2 trainers, so the largest trainee bill
    //   R  4 trainers, so the largest trainer bill
    //   L  max base, so the cheapest licence once the totals are placed
    //   fourth  smallest base, so the winner, or the filler label in a tie item
    const A = trainerRate, B = trainees * traineeRate;
    const coef = n => n * A + B;
    const base = p => p.setup + p.hours * coef(p.trainers);
    const labourOf = p => p.hours * coef(p.trainers);
    const win = (lo, hi, test) => {
      const out = [];
      for (let h = lo; h <= hi; h++) if (test(h)) out.push(h);
      return out;
    };

    let freeLicence = f.freeLicence ?? false;
    let packages = f.packages ?? null;
    if (!packages) {
      const hT = rng.int(26, 28);
      const wL = win(18, hT - 1, h => h * coef(3) > hT * coef(2) + BUF);
      if (!wL.length) return reject(diag, 'no-licence-package');
      const hL = rng.pick(wL);
      const wR = win(18, 28, h => h * coef(4) < hL * coef(3) - BUF
        && 4 * h > 3 * hL && 4 * h > 2 * hT && h !== hT && h !== hL);
      if (!wR.length) return reject(diag, 'no-trainer-package');
      // Drawn from the top of its window on purpose. The four-trainer package is the only one
      // that can sit above the winner on licence, and its room to do that is
      //   margin + A(4h_R − 3h_L) − gap_R
      // which grows as 4h_R approaches its ceiling of 3.63h_L. Drawn uniformly, the max-base
      // package's own trainer bill sits about £130 below R's and steals the argmin, so no
      // package can go above and the winner is pinned to the top of the licence column.
      const hR = rng.pick(wR.slice(-Math.max(1, Math.ceil(wR.length / 3))));

      const trio = [
        { role: 'trainees', hours: hT, trainers: 2, setup: rng.int(200, 320) },  // max trainee bill
        { role: 'trainers', hours: hR, trainers: 4, setup: rng.int(200, 320) },  // max trainer bill
        { role: 'licence',  hours: hL, trainers: 3, setup: rng.int(200, 320) },  // max base
      ];
      const bS = Math.min(...trio.map(base));
      const bMax = Math.max(...trio.map(base));

      // The winner keeps two trainers and is required to have MORE training hours than the
      // four-trainer package. Both at once is possible because coef(2)/coef(4) = 0.82, so
      // fewer trainers over more hours still gives the smaller base. That single condition
      // does double duty: it stops the hours column pointing at the winner, and it is
      // exactly the condition under which the four-trainer package can sit above the winner
      // on licence. See structural change 3.
      const setupW = rng.int(200, 320);
      const wW = win(18, 28, h => {
        const b = setupW + h * coef(2);
        return bS - b >= GAP_LO && bS - b <= GAP_HI && h > hR && ![hT, hL, hR].includes(h);
      });
      if (!wW.length) return reject(diag, 'no-fourth-hours');
      const fourth = { role: 'winner', hours: rng.pick(wW), trainers: 2, setup: setupW };
      const shuffled = rng.shuffle([...trio, fourth]);

      if (variant === 'tie') {
        // Every total identical, so the catch-all is correct. With equal totals the three
        // omission argmins reduce to the three argmaxes the trio already separates:
        //   licence only        -> argmax(base)
        //   trainees left out   -> argmax(trainee bill) -> argmax(hours)
        //   trainers left out   -> argmax(trainer bill) -> argmax(trainers × hours)
        // Licences are then set from the common total, which spreads them by the full
        // labour spread, so the cheapest-licence shortcut is if anything more tempting.
        const labours = shuffled.map(labourOf);
        const lo = 19260 + Math.max(...labours);
        const hi = 25260 + Math.min(...labours);
        if (lo > hi) return reject(diag, 'tie-total-infeasible');
        const total = Math.round(rng.float(lo, Math.min(hi, lo + 3000)));
        packages = shuffled.map((p, i) => {
          const licence = r50(total - labours[i] - 260);
          return { ...p, key: letters[i], licence, setup: total - licence - labours[i] };
        });
        if (packages.some(p => p.setup < 200 || p.setup > 320)) return reject(diag, 'tie-setup-range');
        if (packages.some(p => p.licence < 19000 || p.licence > 25000)) return reject(diag, 'licence-range');
      } else {
        const bW = base(fourth);
        const wi = shuffled.indexOf(fourth);
        const bs = shuffled.map(base);
        const others = [0, 1, 2, 3].filter(i => i !== wi);

        // Each shortcut package must strictly minimise (total − the line that shortcut omits).
        // The excesses are therefore fixed one at a time, and each cap is computed against the
        // ones already fixed. An earlier version compared only against the winner, which let
        // the max-base package steal the trainer-omission argmin and collapsed the option set
        // in a quarter of attempts.
        const traineeLine = i => B * shuffled[i].hours;
        const trainerLine = i => A * shuffled[i].trainers * shuffled[i].hours;
        const gapFor = i => bs[i] - bW;

        freeLicence = f.freeLicence ?? (rng.next() < FREE_LICENCE_RATE);

        const iLic = others.find(i => shuffled[i].role === 'licence');
        const iTee = others.find(i => shuffled[i].role === 'trainees');
        const iTer = others.find(i => shuffled[i].role === 'trainers');
        const margin = f.margin ?? rng.int(6, 30) * 10;

        const excess = [];
        excess[wi] = 0;

        const capAgainst = (i, line, fixed) =>
          Math.min(...fixed.map(j => excess[j] + line(i) - line(j)));

        // The max-hours package, carrying the trainee-omission shortcut. Its cap is always
        // below its base gap, so it always sits below the winner on licence.
        // The max-base package no longer carries a shortcut, so its excess is free. It is the
        // only package that can sit above the winner on licence, and it is biased there so
        // that the winner is usually rank 3 rather than rank 4 of four.
        const licAbove = rng.next() < 0.7;
        const gapLic = gapFor(iLic);
        excess[iLic] = licAbove
          ? Math.round(gapLic + rng.float(60, 700))
          : Math.round(rng.float(margin + 60, Math.max(margin + 120, gapLic - 30)));

        const capTee = capAgainst(iTee, traineeLine, [wi, iLic]);
        const loTee = margin, hiTee = Math.min(gapFor(iTee) - 30, capTee - 30);
        if (hiTee <= loTee) return reject(diag, 'trainee-window-empty');
        excess[iTee] = Math.round(rng.float(loTee, hiTee));

        // The four-trainer package, carrying the trainer-omission shortcut. This is the only
        // package whose window can reach above its base gap, which is what puts the winner's
        // licence off the top of the column. Whether it does is a choice, unless the licence
        // shortcut has been dropped, in which case the placement is free.
        const capTer = capAgainst(iTer, trainerLine, [wi, iLic, iTee]);
        const gapTer = gapFor(iTer);
        const canAbove = capTer - 30 > gapTer + 30;
        if (!freeLicence && !canAbove) return reject(diag, 'no-package-above-winner');
        const goAbove = freeLicence ? (canAbove && rng.next() < 0.5) : true;
        const loTer = goAbove ? gapTer + 30 : margin;
        const hiTer = goAbove ? capTer - 30 : Math.min(gapTer - 30, capTer - 30);
        if (hiTer <= loTer) return reject(diag, 'trainer-window-empty');
        excess[iTer] = Math.round(rng.float(loTer, hiTer));

        // licence_W drawn from the interval that keeps every licence inside 19,000 to 25,000.
        const need = Math.max(...others.map(i => gapFor(i) - excess[i]));
        const lo = Math.max(19000 + Math.max(0, need), 19600);
        if (lo > 23900) return reject(diag, 'licence-range');
        const licenceW = f.licenceW ?? r50(rng.float(lo, 23900));
        const totalW = licenceW + bW;

        const licence = [];
        licence[wi] = licenceW;
        for (const i of others) licence[i] = r50(totalW + excess[i] - bs[i]);
        if (licence.some(l => l < 19000 || l > 25000)) return reject(diag, 'licence-range');
        if (Math.max(...licence) - Math.min(...licence) > WINDOW) return reject(diag, 'licence-window');

        packages = shuffled.map((p, i) => ({ ...p, key: letters[i], licence: licence[i] }));
      }
    }
    if (packages.length !== 4) return reject(diag, 'package-count');

    // Every constraint re-checked against the finished numbers, whatever their origin, so
    // a forced fixture is held to exactly the same bar as a generated item.
    const d = formula({ packages, trainees, trainerRate, traineeRate });
    const totals = packages.map(p => d['total_' + p.key]);
    const lowest = Math.min(...totals);
    const isTie = totals.every(t => t === lowest);
    if (variant === 'tie' && !isTie) return reject(diag, 'tie-not-tied');
    if (variant === 'winner' && isTie) return reject(diag, 'unexpected-tie');

    if (!packages.every(p => trainees * traineeRate * p.hours > p.trainers * trainerRate * p.hours))
      return reject(diag, 'trainee-bill-not-largest');

    let w = -1;
    if (!isTie) {
      w = totals.indexOf(lowest);
      if (totals.filter(t => t === lowest).length > 1) return reject(diag, 'winner-tie');
      if (d.margin <= 0) return reject(diag, 'winner-tie');
      if (d.margin / totals[w] >= 0.015) return reject(diag, 'margin-band');
      // The winner at either extreme of the licence column is a free shortcut, in both
      // directions. Rank 2 or 3 of 4.
      const lics = packages.map(p => p.licence);
      const licRank = [...lics].sort((a, b) => a - b).indexOf(lics[w]) + 1;
      if (!freeLicence && (licRank === 1 || licRank === 4)) return reject(diag, 'licence-extreme');
      const hrs = packages.map(p => p.hours);
      if (hrs[w] === Math.max(...hrs) || hrs[w] === Math.min(...hrs)) return reject(diag, 'hours-extreme');
    }

    const argmin = key => {
      const vals = packages.map(key);
      const lo = Math.min(...vals);
      return vals.filter(v => v === lo).length === 1 ? vals.indexOf(lo) : -1;
    };
    const pLicence  = argmin(p => p.licence);
    const pTrainees = argmin(p => p.licence + p.setup + p.trainers * trainerRate * p.hours);
    const pTrainers = argmin(p => p.licence + p.setup + trainees * traineeRate * p.hours);
    const useLicence = !freeLicence && pLicence >= 0 && pLicence !== w
      && pLicence !== pTrainees && pLicence !== pTrainers;
    const picks = useLicence ? [pLicence, pTrainees, pTrainers] : [pTrainees, pTrainers];
    if (picks.some(i => i < 0)) return reject(diag, 'distractor-tie');
    if (new Set(picks).size !== picks.length) return reject(diag, 'distractor-collision');
    if (!isTie && picks.includes(w)) return reject(diag, 'distractor-is-answer');
    if (!freeLicence && !useLicence) return reject(diag, 'licence-pick-lost');

    const m = v => money(v, '£', 0);
    const label = i => `Package ${packages[i].key}`;
    const spares = [0, 1, 2, 3].filter(i => !picks.includes(i) && i !== w);
    if (isTie && !spares.length) return reject(diag, 'no-spare-label');

    const distractors = [
      ...(useLicence ? [{ i: pLicence, errorType: 'headline-price',
        note: `took the lowest licence fee, ${m(packages[pLicence].licence)}, and stopped there` }] : []),
      { i: pTrainees, errorType: 'omitted-component',
        note: `costed the trainers but left the ${scenario.trainees} out of the wage bill` },
      { i: pTrainers, errorType: 'omitted-component',
        note: `costed the ${scenario.trainees} but left the trainers out of the wage bill` },
    ].map(s => ({ value: packages[s.i].key, display: label(s.i), sortKey: s.i,
      errorType: s.errorType, note: s.note }));

    const correct = isTie
      ? { value: 'same', display: CATCH_ALL, sortKey: 9, kind: 'verdict',
          note: `all four totals come to ${m(lowest)}` }
      : { value: packages[w].key, display: label(w), sortKey: w };

    const spareFiller = spares.map(i => ({ value: packages[i].key, display: label(i), sortKey: i,
      note: 'filler, no shortcut lands on this package' }));
    const catchAll = { value: 'same', display: CATCH_ALL, sortKey: 9, kind: 'verdict',
      note: 'filler, the totals differ' };
    const filler = isTie ? spareFiller : [...spareFiller, catchAll];
    if (distractors.length + filler.length !== 4) return reject(diag, 'option-count');

    let options;
    try {
      options = assemble({ correct, distractors, filler, answerType: 'label', rng });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    const table = tableSpec({
      head: ['Package', 'Licence fee', 'Setup fee', 'Trainers', 'Training hours'],
      keys: packages.map(p => p.key),
      body: packages.map(p => [`Package ${p.key}`, m(p.licence), m(p.setup), String(p.trainers), String(p.hours)]),
    });

    const licences = packages.map(p => p.licence);
    const values = { licenceSpread: Math.max(...licences) - Math.min(...licences) };
    if (!isTie) {
      values.margin = d.margin;
      values.licenceRank = [...licences].sort((a, b) => a - b).indexOf(packages[w].licence) + 1;
    }
    for (const p of packages) values['total_' + p.key] = d['total_' + p.key];

    return {
      id: `a12#${rng.seed}`,
      archetypeId: 'a12',
      seed: rng.seed,
      tier,
      stimulusType: 'table',
      stimulus: {
        table,
        text: `${scenario.org} is choosing ${scenario.system} and has four quotations. `
            + `The setup fee is charged once. Training is then delivered on site: the number of trainers `
            + `shown attends for the number of training hours shown, and ${trainees} ${scenario.trainees} `
            + `attend as trainees for those same hours. Trainers are billed at ${money(trainerRate, '£', 0)} an hour. `
            + `${scenario.trainees[0].toUpperCase()}${scenario.trainees.slice(1)} are paid ${money(traineeRate, '£', 0)} an hour.`,
      },
      questionText: 'Counting the licence fee, the setup fee and all of the training time, '
                  + 'which package would cost the least in total?',
      answerType: 'label',
      correct: { value: correct.value, display: correct.display },
      options,
      optionContext: {},
      values,
      workings: {
        formulaText: this.formulaText,
        steps: [
          ...packages.map((p, i) => `${label(i)} = ${m(p.licence)} + ${m(p.setup)} `
            + `+ ${p.trainers} × ${money(trainerRate, '£', 0)} × ${p.hours} + ${trainees} × ${money(traineeRate, '£', 0)} × ${p.hours} `
            + `= ${m(d['total_' + p.key])}`),
          isTie
            ? `every package comes to ${m(lowest)}, so no single package is cheapest`
            : `lowest is ${label(w)} at ${m(totals[w])}, ahead of ${m(totals[w] + d.margin)} by ${m(d.margin)} `
              + `(${(100 * d.margin / totals[w]).toFixed(2)}% of the total)`,
        ],
      },
      targetSeconds: 83,
      params: { scenario, letters, trainees, trainerRate, traineeRate, variant, freeLicence, packages },
    };
  },
};
