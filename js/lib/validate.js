import { OPTION_RULES } from './constants.js';
import { NUMERIC_TYPES, ANSWER_TYPES, CATEGORICAL_TYPES, EXPLICIT_DISPLAY_TYPES, displayDp } from './format.js';
import { onGrid, atMidpoint, axisTicks, readableValues } from './chart.js';

// Named failure strings. The audit page reports rates per name, so keep them
// stable in the same way errorType strings are stable.
export function checkOptionSet(options, answerType, context = {}) {
  const f = [];
  const R = OPTION_RULES;
  if (!Array.isArray(options) || options.length !== R.count) { f.push('option-count'); return f; }
  if (!ANSWER_TYPES.has(answerType)) f.push('unknown-answer-type');

  const correct = options.filter(o => o.role === 'correct');
  if (correct.length === 0) f.push('no-correct');
  if (correct.length > 1) f.push('multi-correct');

  const displays = options.map(o => o.display);
  if (new Set(displays).size !== options.length) f.push('duplicate-display');
  if (displays.some(d => d === undefined || d === null || d === '')) f.push('missing-display');

  // Two separate questions. Are the values numbers, so finiteness and distinctness
  // apply? And are those numbers magnitudes, so the gap and ratio guards mean
  // anything? A month index is the first without being the second.
  const categorical = CATEGORICAL_TYPES.has(answerType);
  const numeric = !categorical
    && (NUMERIC_TYPES.has(answerType) || options.every(o => typeof o.value === 'number'));

  if (EXPLICIT_DISPLAY_TYPES.has(answerType)
      && options.some(o => typeof o.display !== 'string' || !o.display.length)) {
    f.push('missing-explicit-display');
  }

  if (categorical) {
    const values = options.map(o => o.value);
    if (values.some(v => typeof v === 'number' && !Number.isFinite(v))) f.push('non-finite');
    if (new Set(values.map(v => String(v))).size !== values.length) f.push('duplicate-value');
    const answer = correct[0]?.value;
    if (answer !== undefined) {
      for (const o of options) {
        if (o.role !== 'correct' && String(o.value) === String(answer)) f.push('distractor-equals-answer');
      }
    }
  }

  if (numeric) {
    const values = options.map(o => o.value);
    if (values.some(v => !Number.isFinite(v))) { f.push('non-finite'); return f; }
    if (new Set(values.map(v => v.toFixed(6))).size !== values.length) f.push('duplicate-value');

    const answer = correct[0]?.value;
    if (answer !== undefined) {
      for (const o of options) {
        if (o.role !== 'correct' && Math.abs(o.value - answer) < 1e-9) f.push('distractor-equals-answer');
      }
    }

    // Min gap. Integer sets use one whole unit, because a01's answer and its
    // round-up distractor are always adjacent integers by design. Everything
    // else uses 2% of the larger.
    const allInteger = values.every(v => Number.isInteger(v));
    const sorted = [...values].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      const need = allInteger ? R.minGapIntegerUnits : R.minGapRelative * Math.abs(sorted[i]);
      if (sorted[i] - sorted[i - 1] < need - 1e-9) f.push('min-gap');
    }

    // Spread. Derived distractors are exempt from the old flat 20x rule because
    // a candidate who makes that mistake picks that option however far out it
    // sits. Four guards replace it.
    //
    // Zero-magnitude options are excluded from all four. "Does not change" and
    // "Cannot Say" are verdicts sharing a numeric slot, not magnitudes: a13's own
    // specification makes "Does not change" mandatory, and a ratio against zero is
    // an infinity that fails every guard on an option the archetype requires.
    if (answer !== undefined && Math.abs(answer) > 1e-9) {
      const ratioTo = v => Math.max(Math.abs(v / answer), Math.abs(answer / v));
      const scaled = options.filter(o => Math.abs(o.value) > 1e-9);
      if (scaled.some(o => ratioTo(o.value) > R.maxSpreadAny)) f.push('max-spread');
      if (scaled.some(o => o.role === 'filler' && ratioTo(o.value) > R.fillerWithin)) f.push('filler-far');
      if (scaled.filter(o => ratioTo(o.value) <= R.nearBandFactor).length < R.nearBandMinCount) f.push('near-band');
      // The invariant that denies estimation: something has to sit close enough
      // to the answer that reading the magnitude does not resolve the item.
      if (!scaled.some(o => o.role !== 'correct' && ratioTo(o.value) <= R.tightNeighbourWithin)) f.push('no-tight-neighbour');
    }

    // THE WHOLE-VALUE TELL, CENTRAL AT LAST. `format.harmonise` gives an option set a
    // uniform decimal count, so the spec's decimal-place rule passes while ".00" against
    // ".32" survives inside it and "pick the one with no pence" needs no arithmetic. It was stated
    // as a non-negotiable and enforced by hand in seven archetypes out of forty-two, which meant
    // the other thirty-five passed by construction or by luck and nobody knew which. An earlier round
    // measured a05 at 34.5% of items before its local guard went in.
    //
    // Only the answer-alone case fails. One distractor alone is the weaker mirror, worth one free
    // elimination rather than the answer, and it is reported by the audit rather than enforced:
    // d07's rebuilt principal option sat at 89.0% on that column before it was given pence.
    // Explicit-display types are exempt: a `ratio` option renders as "3:1" and a `fraction` as
    // "3/4", so no fractional part is on screen to compare and the tell cannot exist. The
    // preflight's own ratio set 3:1 5:2 7:3 9:4 11:5 is the case that caught this.
    if (answer !== undefined && values.length > 2 && !EXPLICIT_DISPLAY_TYPES.has(answerType)) {
      const whole = v => Math.abs(v - Math.round(v)) < 1e-9;
      if (whole(answer) && !options.some(o => o.role !== 'correct' && Math.abs(o.value) > 1e-9 && whole(o.value))) {
        f.push('answer-alone-on-a-whole-value');
      }
    }

    if (context.expectedSign !== undefined && answer !== undefined
        && Math.sign(answer) !== Math.sign(context.expectedSign)) f.push('sign');
    if (context.range && answer !== undefined
        && (answer < context.range[0] || answer > context.range[1])) f.push('answer-out-of-range');
  }

  // Decimal variation must not isolate the correct answer. Categorical types are exempt: a label
  // such as "2.5 litre" carries a decimal point in its own name, and this check exists to stop
  // number formatting from singling out the answer, not to police what a product is called.
  if (correct.length === 1 && !categorical) {
    const dps = displays.map(displayDp);
    const cd = dps[options.indexOf(correct[0])];
    if (dps.filter(d => d === cd).length === 1) f.push('dp-isolates-answer');
  }
  return [...new Set(f)];
}

export const optionSet = (options, answerType, context = {}) => checkOptionSet(options, answerType, context).length === 0;

// Standalone table stimulus, part A3. One small table serving one question, which is
// what the real Desk 01 paper showed. Desk 02's shared-stimulus system is an earlier round.
//
// The spec asks that table totals equal the sum of their parts. None of the three
// A3 archetypes prints a total row, so the predicate has nothing to check yet, but it is
// written now because an earlier round's tables do and the shape is fixed here.
export function checkTable(t) {
  const f = [];
  // HEAD AND BODY MUST AGREE IN WIDTH, which nothing checked. An eight-entity civic
  // table was built from a scenario carrying only seven entity names, so every body row was one
  // cell longer than the header, and 37 such tables passed every invariant in the preflight before
  // a downstream undefined gave it away. A width mismatch is unrenderable, not merely ugly.
  if (Array.isArray(t.head) && Array.isArray(t.body)) {
    const w = t.head.length;
    if (t.body.some(r => Array.isArray(r) && r.length !== w)) f.push('head-body-width-mismatch');
  }
  if (!t || typeof t !== 'object') return ['table-missing'];
  if (!Array.isArray(t.head) || t.head.length < 2) f.push('table-head');
  if (!Array.isArray(t.body) || t.body.length < 2) f.push('table-body');
  if (Array.isArray(t.head) && Array.isArray(t.body)) {
    if (t.body.some(r => !Array.isArray(r) || r.length !== t.head.length)) f.push('table-ragged');
    if (t.body.some(r => Array.isArray(r) && r.some(c => c === null || c === undefined || c === '')))
      f.push('table-empty-cell');
  }
  if (t.align && (!Array.isArray(t.align) || t.align.length !== t.head?.length)) f.push('table-align');
  for (const row of t.totalRows ?? []) {
    const got = row.cells.reduce((s, v) => s + v, 0);
    if (Math.abs(got - row.total) > 1e-6) f.push('table-total-mismatch');
  }
  return [...new Set(f)];
}
export const table = (t) => checkTable(t).length === 0;

export function checkItem(it) {
  const f = [];
  if (!it) return ['null-item'];
  if (!it.archetypeId || !it.id) f.push('missing-id');
  if (!it.questionText) f.push('missing-question');
  if (!it.stimulus || (it.stimulusType === 'prose' && !it.stimulus.text)) f.push('missing-stimulus');
  if (it.stimulusType === 'table') f.push(...checkTable(it.stimulus?.table));
  if (it.stimulusType === 'chart') f.push(...checkChart(it.stimulus?.chart));
  if (!ANSWER_TYPES.has(it.answerType)) f.push('unknown-answer-type');
  if (!(it.targetSeconds > 0)) f.push('bad-target-seconds');
  if (!it.correct || !Number.isFinite(it.correct.value) && typeof it.correct.value !== 'string') f.push('bad-answer');
  for (const [k, v] of Object.entries(it.values ?? {})) {
    if (typeof v === 'number' && !Number.isFinite(v)) f.push(`non-finite:${k}`);
  }
  f.push(...checkOptionSet(it.options ?? [], it.answerType, it.optionContext ?? {}));
  return [...new Set(f)];
}

export const item = (it) => checkItem(it).length === 0;

// Chart stimulus. Replaces the an earlier round stub. Named failures, same convention
// as checkOptionSet and checkTable, so the audit reports rates per name.
//
// The grid rule is the whole of the spec as amended: a readable value lands on a
// drawn gridline or exactly midway between two, never finer, and a midpoint value obliges
// the axis label to state its precision. Everything else here is the per-kind shape from
// 12.2 to 12.6.
const CHART_KINDS = new Set(['bar', 'grouped', 'line', 'stacked', 'stacked100', 'pie', 'pies']);
const AXIS_KINDS  = new Set(['bar', 'grouped', 'line', 'stacked']);
const PIE_MIN_SEGMENT_PCT = 10;          // amended from 5; see lib/chart.js

export function checkChart(c) {
  const f = [];
  if (!c || typeof c !== 'object') return ['chart-missing'];
  if (!CHART_KINDS.has(c.kind)) return ['chart-unknown-kind'];

  if (AXIS_KINDS.has(c.kind)) {
    if (!(c.interval > 0)) f.push('chart-no-interval');
    else {
      // grid is either the interval or exactly half of it. Nothing else is readable.
      const half = Math.abs(c.grid - c.interval / 2) < 1e-12;
      const full = Math.abs(c.grid - c.interval) < 1e-12;
      if (!half && !full) f.push('chart-grid-not-interval-or-half');
      if (!(c.axisMax > 0) || !onGrid(c.axisMax, c.interval)) f.push('chart-axis-max-off-interval');
      const vals = readableValues(c);
      if (!vals.length) f.push('chart-no-values');
      if (vals.some(v => !Number.isFinite(v))) f.push('chart-non-finite');
      if (vals.some(v => v < 0)) f.push('chart-negative-value');
      if (vals.some(v => v > c.axisMax + 1e-9)) f.push('chart-value-over-axis');
      // The invariant the acceptance criterion turns on.
      if (vals.some(v => !onGrid(v, c.grid))) f.push('chart-value-off-grid');
      // The axis-label note is mandatory the moment anything sits at a midpoint. It is what
      // licenses the half-gridline read; without it the chart is not answerable exactly.
      if (vals.some(v => atMidpoint(v, c.interval)) && !c.precisionNote) f.push('chart-midpoint-without-note');
      // A chart whose gridlines are unreadably dense is unanswerable for the opposite
      // reason to one whose values sit between them.
      if (axisTicks(c.interval, c.axisMax).length > 26) f.push('chart-too-many-gridlines');
    }
  }

  switch (c.kind) {
    case 'bar': {
      if (!Array.isArray(c.bars) || c.bars.length < 5 || c.bars.length > 7) f.push('chart-bar-count');
      if (new Set((c.bars ?? []).map(b => b.label)).size !== (c.bars ?? []).length) f.push('chart-duplicate-label');
      break;
    }
    case 'grouped': {
      const g = c.groups ?? [];
      if (g.length < 3 || g.length > 4) f.push('chart-group-count');
      if (g.some(x => x.values.length < 3 || x.values.length > 4)) f.push('chart-bars-per-group');
      if (new Set(g.map(x => x.values.length)).size > 1) f.push('chart-ragged-groups');
      if ((c.seriesLabels ?? []).length !== (g[0]?.values.length ?? 0)) f.push('chart-legend-mismatch');
      break;
    }
    case 'line': {
      const se = c.series ?? [];
      if (se.length < 4 || se.length > 6) f.push('chart-series-count');
      if (!Array.isArray(c.categories) || c.categories.length < 5 || c.categories.length > 7) f.push('chart-category-count');
      if (se.some(x => x.values.length !== (c.categories ?? []).length)) f.push('chart-series-length');
      // 12.2: the series must cross at least once, so reading the legend is necessary.
      let crossed = false;
      for (let a = 0; a < se.length && !crossed; a++) {
        for (let b = a + 1; b < se.length && !crossed; b++) {
          const d = se[a].values.map((v, i) => Math.sign(v - se[b].values[i])).filter(x => x !== 0);
          if (new Set(d).size > 1) crossed = true;
        }
      }
      if (!crossed) f.push('chart-series-never-cross');
      break;
    }
    case 'stacked': {
      const b = c.bars ?? [];
      if (b.length < 4 || b.length > 6) f.push('chart-stack-bar-count');
      if (b.some(x => x.values.length < 3 || x.values.length > 5)) f.push('chart-segment-count');
      if (new Set(b.map(x => x.values.length)).size > 1) f.push('chart-ragged-stack');
      if ((c.seriesLabels ?? []).length !== (b[0]?.values.length ?? 0)) f.push('chart-legend-mismatch');
      if (b.some(x => x.values.some(v => v <= 0))) f.push('chart-empty-segment');
      break;
    }
    case 'stacked100': {
      const b = c.bars ?? [];
      if (b.length < 4 || b.length > 6) f.push('chart-stack-bar-count');
      if (b.some(x => x.values.length < 3 || x.values.length > 5)) f.push('chart-segment-count');
      if (b.some(x => Math.abs(x.values.reduce((s, v) => s + v, 0) - 100) > 1e-9)) f.push('chart-shares-not-100');
      if (b.some(x => x.values.some(v => !Number.isInteger(v)))) f.push('chart-share-not-integer');
      if (b.some(x => x.values.some(v => v < PIE_MIN_SEGMENT_PCT))) f.push('chart-segment-below-minimum');
      // 12.6: the bar totals live in the caption and they differ, which is what makes the
      // absolute-against-share reversal available.
      if (b.some(x => !(x.total > 0))) f.push('chart-missing-bar-total');
      if (new Set(b.map(x => x.total)).size !== b.length) f.push('chart-bar-totals-equal');
      if ((c.seriesLabels ?? []).length !== (b[0]?.values.length ?? 0)) f.push('chart-legend-mismatch');
      break;
    }
    case 'pie':
      f.push(...checkPie(c));
      break;
    case 'pies': {
      const p = c.pies ?? [];
      if (p.length !== 2) f.push('chart-pie-pair-count');
      for (const one of p) f.push(...checkPie(one));
      if (p.length === 2) {
        const [a, b] = p;
        const la = a.segments.map(s => s.label).join('|'), lb = b.segments.map(s => s.label).join('|');
        if (la !== lb) f.push('chart-pie-labels-differ');
        if (!(a.total > 0) || !(b.total > 0)) f.push('chart-missing-pie-total');
        if (a.total === b.total) f.push('chart-pie-totals-equal');
        // The trap the spec asks for: at least one segment whose share falls while its absolute
        // value rises. Without it the item is a plain argmax and the whole point is gone.
        const abs = (pie, i) => pie.labelMode === 'percent'
          ? pie.segments[i].value / 100 * pie.total : pie.segments[i].value;
        const share = (pie, i) => pie.labelMode === 'percent'
          ? pie.segments[i].value
          : 100 * pie.segments[i].value / pie.segments.reduce((s, x) => s + x.value, 0);
        let reversal = false;
        for (let i = 0; i < a.segments.length; i++) {
          if (share(b, i) < share(a, i) - 1e-9 && abs(b, i) > abs(a, i) + 1e-9) reversal = true;
        }
        if (!reversal) f.push('chart-no-share-absolute-reversal');
      }
      break;
    }
  }
  return [...new Set(f)];
}

function checkPie(c) {
  const f = [];
  const seg = c.segments ?? [];
  if (seg.length < 4 || seg.length > 7) f.push('chart-pie-segment-count');
  if (new Set(seg.map(s => s.label)).size !== seg.length) f.push('chart-duplicate-label');
  // Labelled in percent or in absolute value, never both. Showing both removes the
  // calculation the item exists to test.
  if (c.labelMode !== 'percent' && c.labelMode !== 'absolute') f.push('chart-pie-label-mode');
  if (seg.some(s => typeof s.display !== 'string' || !s.display.length)) f.push('chart-pie-no-display');
  if (!(c.total > 0)) f.push('chart-missing-pie-total');
  if (c.labelMode === 'percent') {
    if (seg.some(s => !Number.isInteger(s.value))) f.push('chart-pie-share-not-integer');
    // Drawn as integers summing to exactly 100, so there is no rounding drift to explain.
    if (Math.abs(seg.reduce((a, s) => a + s.value, 0) - 100) > 1e-9) f.push('chart-pie-not-100');
    if (seg.some(s => s.value < PIE_MIN_SEGMENT_PCT)) f.push('chart-segment-below-minimum');
    if (seg.some(s => /[0-9]\s*$/.test(s.display) && !/%/.test(s.display))) f.push('chart-pie-display-mode-mismatch');
  } else {
    const sum = seg.reduce((a, s) => a + s.value, 0);
    if (Math.abs(sum - c.total) > 1e-9) f.push('chart-pie-absolutes-not-total');
    if (seg.some(s => 100 * s.value / sum < PIE_MIN_SEGMENT_PCT - 1e-9)) f.push('chart-segment-below-minimum');
    if (seg.some(s => /%/.test(s.display))) f.push('chart-pie-display-mode-mismatch');
  }
  return f;
}

export const chart = (spec) => checkChart(spec).length === 0;

// Constraint rejection. Returns null for the caller, per the 8.3 contract, and
// records why into an optional diagnostics array so audit/build.js can
// report failure rates per named constraint (the spec). Production never
// passes diag, exactly as it never passes forced.
export function reject(diag, name) {
  if (diag) diag.push(name);
  return null;
}
