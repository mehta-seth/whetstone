// Registry. Every archetype is imported here and nowhere else, so the library has a
// single point of entry and adding one is a new file plus one line in this list.
//
// IDs group by series: a problem-solving prose, b shared-stimulus tables, c charts,
// d mixed money, rates and averages. The d series skips 11 and 12; those slots were
// planned and never built, and the remaining IDs are load-bearing in test/fixtures.json,
// the audit report and localStorage, so they are not renumbered to close the gap.
import a01 from './a01-budget-discount.js';
import a02 from './a02-red-herring.js';
import a03 from './a03-percent-faster.js';
import a04 from './a04-deficit-growth.js';
import a05 from './a05-payback-period.js';
import a06 from './a06-bulk-tiers.js';
import a07 from './a07-simultaneous.js';
import a08 from './a08-fraction-baseline.js';
import a09 from './a09-combined-rates.js';
import a10 from './a10-bar-loss-rates.js';
import a11 from './a11-cumulative-threshold.js';
import a12 from './a12-total-cost-ownership.js';
import a13 from './a13-price-cut-volume.js';
import a14 from './a14-throughput-revenue.js';
import a15 from './a15-markup-overhead.js';
import a16 from './a16-max-minus-min.js';
import a17 from './a17-grouped-bar-margin.js';
import a18 from './a18-solve-backwards.js';
import a19 from './a19-percent-of-percent.js';
import a20 from './a20-reverse-percentage.js';
import a21 from './a21-weighted-rate.js';
import a22 from './a22-compound-depreciation.js';
import b01 from './b01-unit-scaling.js';
import b02 from './b02-counterfactual-ratio.js';
import b03 from './b03-counterfactual-denominator.js';
import b04 from './b04-conservation.js';
import b05 from './b05-shortfall.js';
import b06 from './b06-derived-extremum.js';
import b07 from './b07-row-vs-column-share.js';
import b08 from './b08-derived-aggregation.js';
import c01 from './c01-pie-absolute.js';
import c02 from './c02-two-pies-reversal.js';
import d01 from './d01-currency-conversion.js';
import d02 from './d02-spread.js';
import d03 from './d03-break-even.js';
import d04 from './d04-margin-markup.js';
import d05 from './d05-tax.js';
import d06 from './d06-stacked-discounts.js';
import d07 from './d07-compound-interest.js';
import d08 from './d08-missing-mean.js';
import d09 from './d09-mean-shift.js';
import d10 from './d10-median-mean.js';
import d13 from './d13-per-capita.js';
import d14 from './d14-speed-conversion.js';
import d15 from './d15-inverse-proportion.js';
import d16 from './d16-divide-ratio.js';
import d17 from './d17-cagr.js';

export const archetypes = [
  a01, a02, a03, a04, a05, a06, a07, a08, a09, a10, a11, a12, a13, a14, a15, a16, a17, a18, a19, a20, a21, a22,
  b01, b02, b03, b04, b05, b06, b07, b08,
  c01, c02,
  d01, d02, d03, d04, d05, d06, d07, d08, d09, d10, d13, d14, d15, d16, d17,
];
export const byId = Object.fromEntries(archetypes.map(a => [a.id, a]));
export const forDesk = desk => archetypes.filter(a => a.desks.includes(desk));
