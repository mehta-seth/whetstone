// Generate the b01 fixture from forced parameters, then diff against arithmetic done by hand
// before any of the code was written. Display strings are emitted, never typed.
import { makeDataset } from '../../js/lib/dataset.js';
import { makeStimulusFrom } from '../../js/lib/stimulus.js';
import { makeRng } from '../../js/lib/rng.js';
import b01 from '../../js/archetypes/b01-unit-scaling.js';

const dataset = {
  family: 'nutrition',
  rows: [
    { key: 'energy', label: 'Energy', unit: 'kJ', dp: 0, additive: false },
    { key: 'fat',    label: 'Fat',    unit: 'g',  dp: 1, additive: false },
    { key: 'fibre',  label: 'Fibre',  unit: 'g',  dp: 1, additive: false },
    { key: 'salt',   label: 'Salt',   unit: 'g',  dp: 1, additive: false },
  ],
  cols: [{ key: 'Ready Salted', label: 'Ready Salted' }, { key: 'BBQ', label: 'BBQ' },
         { key: 'Pickled Onion', label: 'Pickled Onion' }, { key: 'Cheese & Chive', label: 'Cheese & Chive' }],
  values: [[2180, 1940, 2120, 2260], [31.4, 26.8, 33.2, 22.6], [3.6, 7.2, 4.8, 2.4], [1.7, 0.9, 2.1, 1.4]],
  totals: {},
  meta: { packs: [100, 25, 30, 75], refs: { energy: 9000, fat: 70, salt: 6 }, unreferenced: 'fibre',
    packRowLabel: 'Pack size', packUnit: 'g', pack: 'packet', packPlural: 'packets',
    scenario: { org: 'Tolliver Snacks' } },
  caption: 'Tolliver Snacks: nutritional content per 100 g',
  text: 'Every figure in the table is the amount contained in 100 g of that variety. The bottom row gives the weight of one packet as sold.',
};
const st = makeStimulusFrom(makeDataset(dataset), 1);
const forced = { nutrient: 0, variant: 'pair', pair: { target: 1, misread: 0 },
  picks: [{ col: 1, qty: 3 }, { col: 2, qty: 2 }], misread: 0 };
const it = b01.build({ stimulus: st, rng: makeRng(1), tier: 'standard', forced });
console.log(JSON.stringify({ dataset, tier: 'standard', forced,
  expect: { values: it.values, answer: { value: it.correct.value, display: it.correct.display },
    table: it.stimulus.table.body,
    options: it.options.map(o => ({ value: o.value, display: o.display, role: o.role, errorType: o.errorType })) } }, null, 1));
