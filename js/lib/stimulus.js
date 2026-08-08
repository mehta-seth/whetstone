// The shared-stimulus layer. The spec asks for "shared stimuli so 3 to 7 questions
// run off one table".
//
// lib/table.js already renders a table. What was missing is an owner for it. On Desk 01 the
// table belongs to the item, because each table serves one question. On Desk 02 one table
// carries several questions, so the table has to belong to something that outlives the item,
// and the item has to point at it.
//
// A stimulus is { id, family, seed, dataset, table, text }. Items carry `stimulusId` and
// `stimulusIndex`, and `item.stimulus` still holds { text, table } exactly as before, so
// render.js, the audit page and the review screen need no change to display one.

import { buildDataset, cellText, rowTotal, colTotal, grandTotal } from './dataset.js';
import { tableSpec } from './table.js';
import { groupDigits } from './money.js';
import { STIMULUS_SEED_STRIDE } from './constants.js';

// Which archetypes can run off which family. Declared here rather than inside each archetype
// so the session loop can plan a stimulus before any archetype has been asked anything, and
// so the map can be read in one place. Each archetype also declares `families`, and the
// preflight checks the two agree.
export const FAMILY_SUPPORT = {
  regional:  ['b02', 'b03', 'b04', 'b07'],   // b06 dropped; see its header
  // b03 and b04 were listed against retail in the first draft of this map and are not. b03
  // needs a share along the wrong axis as a distractor and b04 needs the perturbed cell to sit
  // inside a plausible band against a printed total; a retail column mixes a unit count with
  // three prices, so a total along it is not a number.
  // 'b02' is REMOVED from retail, and it is a correction rather than a narrowing.
  // Measured at 2 accepted of 797 retail datasets, 0.3%, against 570 of 800 on regional, 71.3%.
  // Open item 21 recorded b02 as rejecting 61% with no-exact-ratio-available dominant,
  // which was a POOLED figure over both families and hid the fact that one of them contributes
  // essentially nothing. Same defect as b06's regional family earlier, and the same warning:
  // a rejection rate can hide a zero. The cause is already written down two lines above for b03
  // and b04: a retail column mixes a unit count with three prices, so b02's requirement that the
  // perturbed ratio reduce to a denominator of 12 or less almost never holds on it.
  retail:    ['b06', 'b08'],
  nutrition: ['b01', 'b05'],
  civic:     ['d13'],            // d18 joins in this session; see the civic note in dataset.js
};

export const familiesFor = archetypeId =>
  Object.entries(FAMILY_SUPPORT).filter(([, ids]) => ids.includes(archetypeId)).map(([f]) => f);

export const stimulusSeed = (sessionSeed, i) => (sessionSeed + (i + 1) * STIMULUS_SEED_STRIDE) >>> 0;

// ---- rendering -------------------------------------------------------------------------
//
// Desk 02's tables print totals and Desk 01's do not, which is why checkTable's `totalRows`
// predicate was written earlier and never exercised. It is exercised now: every printed
// total is handed to the validator as numbers alongside the display strings, so a total that
// does not equal the sum of its parts fails the item rather than reaching a candidate.

export function datasetTable(d) {
  const wantRowTotal = d.totals.row;
  const wantColTotal = d.totals.col;

  const head = [d.meta.rowHeading ?? headingFor(d), ...d.cols.map(c => c.label)];
  if (wantRowTotal) head.push(d.totals.label);

  const body = [];
  const totalRows = [];
  d.rows.forEach((row, r) => {
    const cells = d.values[r];
    const line = [row.label, ...cells.map(v => cellText(row, v))];
    if (wantRowTotal) {
      const t = rowTotal(d, r);
      line.push(cellText(row, t));
      totalRows.push({ cells: cells.slice(), total: t });
    }
    body.push(line);
  });

  if (wantColTotal) {
    const proto = d.rows[0];
    const colTotals = d.cols.map((_, c) => colTotal(d, c));
    const line = [d.totals.label, ...colTotals.map(v => cellText(proto, v))];
    if (wantRowTotal) line.push(cellText(proto, grandTotal(d)));
    body.push(line);
    totalRows.push({ cells: colTotals, total: grandTotal(d) });
  }

  // Family extras that are not nutrient or metric rows but that the candidate must see.
  // b01 and b05 are unanswerable without the pack sizes, and b05's shortfall variant is
  // unanswerable without the reference amounts.
  const notes = [];
  // The civic family prints a price index, which is a property of the year rather than of an
  // entity, so it cannot be a row on a table whose rows are years. d12 reads it from here.
  if (d.family === 'civic' && d.meta.note) notes.push(d.meta.note);
  if (d.family === 'nutrition') {
    body.push([`${d.meta.packRowLabel} (${d.meta.packUnit})`,
      ...d.meta.packs.map(p => groupDigits(p, 0)),
      ...(wantRowTotal ? ['-'] : [])]);
    const refs = d.rows.filter(r => d.meta.refs[r.key] !== undefined)
      .map(r => `${r.label} ${groupDigits(d.meta.refs[r.key], 0)} ${r.unit}`);
    if (refs.length) notes.push(`Recommended daily amount: ${refs.join(', ')}.`);
  }

  const t = tableSpec({
    caption: d.caption,
    head, body,
    note: notes.length ? notes.join(' ') : null,
  });
  t.totalRows = totalRows;
  return t;
}

// A heading must never throw: the preflight builds a bare dataset with no family metadata,
// and a rendering helper that crashes on one is a helper that cannot be tested.
const headingFor = d => ({
  regional:  d.meta?.scenario?.of ?? 'Site',
  retail:    'Measure',
  nutrition: 'Per 100 g',
}[d.family] ?? 'Item');

// ---- the correlation view --------------------------------------------------------------
//
// The column-correlation diagnostic matches a label answer back to a row of the rendered
// table. On Desk 02 a label answer is a COLUMN key (a product size, an animal category), so
// the diagnostic needs the transpose: one entity per column, one measure per row. The audit
// already supports an explicit `correlation` block for exactly this reason, so no change to
// the harness is needed, only the right block.
export function columnCorrelationView(d, { extraSeries = [] } = {}) {
  const measures = [
    ...d.rows.map(r => ({ head: r.label, values: d.values[d.rows.indexOf(r)] })),
    ...extraSeries.map(s => ({ head: s.label, values: s.values })),
  ];
  return {
    keys: d.cols.map(c => c.key),
    columns: Object.fromEntries(measures.map(m => [m.head, m.values.slice()])),
  };
}

// The same thing where the answer is a row key rather than a column key.
export function rowCorrelationView(d) {
  return {
    keys: d.rows.map(r => r.key),
    columns: Object.fromEntries(d.cols.map((c, ci) => [c.label, d.values.map(row => row[ci])])),
  };
}

// ---- construction ----------------------------------------------------------------------

export function makeStimulus({ family, rng, opts = {} }) {
  // A builder that cannot satisfy its family invariant now returns null rather than
  // falling through with an invalid table, so this returns null too and every caller checks.
  const dataset = buildDataset(family, rng, opts);
  if (!dataset) return null;
  const table = datasetTable(dataset);
  return {
    id: `st_${family}#${rng.seed}`,
    family, seed: rng.seed, dataset, table,
    text: dataset.text,
    caption: dataset.caption,
    items: [],
  };
}

// A stimulus built from an explicit dataset rather than a seed. Part B supplies no fixtures
// of its own, so every Desk 02 fixture has to inject its whole table; this is what lets it.
// Production never calls this.
export function makeStimulusFrom(dataset, seed = 0) {
  return { id: `st_${dataset.family}#${seed}`, family: dataset.family, seed,
    dataset, table: datasetTable(dataset), text: dataset.text, caption: dataset.caption, items: [] };
}

// What an item copies out of its stimulus. Kept in one function so an item can never carry a
// table that differs from the one the stimulus rendered.
export const stimulusFor = st => ({ text: st.text, table: st.table });
