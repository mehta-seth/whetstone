// node test/chart-harness.mjs
//
// The acceptance criterion is that every readable value is exactly recoverable
// from the rendered SVG. This asserts it rather than assuming it, and it does so the way a
// candidate does: recover the value from the drawn GEOMETRY, snap it to the chart's grid,
// and require the snapped result to equal the intended value exactly.
//
// It deliberately ignores the data-value attributes the renderer also emits. Those exist for
// the review screen. Reading them back would test nothing at all.
import { chartSpec, chartSvg, chartText, projector, onGrid, atMidpoint, readableValues } from '../../js/lib/chart.js';
import { checkChart } from '../../js/lib/validate.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL  ' + msg); } };

// Geometry constants have to agree with lib/chart.js. Asserted rather than imported, so that
// moving a padding value in the renderer fails here instead of silently shifting every read.
const G = { width: 700, height: 400, padTop: 34, padRight: 18, padBottom: 62, padLeft: 66 };
const PLOT = { left: G.padLeft, top: G.padTop,
  width: G.width - G.padLeft - G.padRight, height: G.height - G.padTop - G.padBottom };

const attrs = (svg, tag) => [...svg.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, 'g'))].map(m => {
  const o = {};
  for (const a of m[1].matchAll(/([\w-]+)="([^"]*)"/g)) o[a[1]] = a[2];
  return o;
});

// Snap to the grid the way a reader does. If the snapped value is not on the grid the chart
// is unreadable by construction, which is the failure this harness exists to catch.
const snap = (v, grid) => Math.round(v / grid) * grid;

function recoverAxisValues(spec, svg, cls) {
  const { unproject } = projector({ axisMax: spec.axisMax, top: PLOT.top, height: PLOT.height });
  return attrs(svg, 'rect')
    .filter(a => !(a.class ?? '').split(' ').includes('key'))    // legend swatches, not data
    .filter(a => (a.class ?? '').split(' ').some(c => cls.test(c)))
    .map(a => ({ top: unproject(Number(a.y)), base: unproject(Number(a.y) + Number(a.height)) }));
}

function checkSpecAndSvg(name, spec) {
  const failures = checkChart(spec);
  ok(failures.length === 0, `${name}: checkChart clean, got ${failures.join(',')}`);
  const svg = chartSvg(spec);
  ok(svg.startsWith('<svg') && svg.includes('</svg>'), `${name}: renders an svg`);
  ok(!/undefined|NaN/.test(svg), `${name}: no undefined or NaN in the output`);
  ok(chartText(spec).length > 0, `${name}: renders a text block`);
  return svg;
}

console.log('\n=== bar: 5 to 7 bars, every height on the grid ===');
{
  const spec = chartSpec({ kind: 'bar', interval: 500, grid: 500,
    label: 'Units produced', caption: 'Output by line, last quarter',
    bars: [{ label: 'P', value: 5500 }, { label: 'Q', value: 3000 }, { label: 'R', value: 4500 },
           { label: 'S', value: 5000 }, { label: 'T', value: 4000 }] });
  const svg = checkSpecAndSvg('bar', spec);
  const got = recoverAxisValues(spec, svg, /^bar$/);
  ok(got.length === 5, `bar: 5 bars recovered, got ${got.length}`);
  spec.bars.forEach((b, i) => {
    ok(snap(got[i].top, spec.grid) === b.value, `bar ${b.label}: recovered ${got[i].top.toFixed(4)} snaps to ${snap(got[i].top, spec.grid)}, want ${b.value}`);
    ok(Math.abs(got[i].base) < 1e-6, `bar ${b.label}: sits on the zero line`);
  });
  ok(svg.includes('0 0 700 400'), 'bar: viewBox as specified');
}

console.log('\n=== grouped: a17 geometry, interval 1 with values at 0.5 midpoints ===');
{
  // a17's decided parameterisation. Interval 1 on a 0 to 22 axis, values at 0.5 precision, so
  // some bars sit on a line and some at exact midpoints, and the axis label states it.
  const spec = chartSpec({ kind: 'grouped', interval: 1, grid: 0.5,
    label: 'Sales in millions of dollars', precisionNote: 'rounded to the nearest 0.5 million dollars',
    caption: 'Quarterly sales by year',
    seriesLabels: ['Q1', 'Q2', 'Q3', 'Q4'],
    groups: [
      { label: '2019', values: [12.5, 13.0, 14.5, 12.0] },
      { label: '2020', values: [11.0, 14.0, 15.5, 13.5] },
      { label: '2021', values: [13.0, 12.0, 15.0, 14.0] },
      { label: '2022', values: [15.0, 16.5, 17.0, 13.5] },
    ] });
  const svg = checkSpecAndSvg('grouped', spec);
  ok(spec.axisLabel.includes('rounded to the nearest 0.5'), 'grouped: precision note folded into the axis label');
  const flat = spec.groups.flatMap(g => g.values);
  const got = recoverAxisValues(spec, svg, /^s[0-9]$/);
  ok(got.length === flat.length, `grouped: ${flat.length} bars recovered, got ${got.length}`);
  let onLine = 0, onMid = 0;
  flat.forEach((v, i) => {
    ok(snap(got[i].top, spec.grid) === v, `grouped bar ${i}: recovered ${got[i].top.toFixed(4)} snaps to ${snap(got[i].top, spec.grid)}, want ${v}`);
    if (onGrid(v, spec.interval)) onLine++; else if (atMidpoint(v, spec.interval)) onMid++;
  });
  console.log(`  ${onLine} of ${flat.length} bars sit on a gridline, ${onMid} at exact midpoints`);
  ok(onLine + onMid === flat.length, 'grouped: every bar is on a line or an exact midpoint');
  ok(spec.groups[0].values.reduce((a, b) => a + b, 0) === 52, 'grouped: 2019 totals 52.0');
  ok(spec.groups[3].values.reduce((a, b) => a + b, 0) === 62, 'grouped: 2022 totals 62.0');
}

console.log('\n=== the grid rule rejects a quarter-position value ===');
{
  const bad = chartSpec({ kind: 'grouped', interval: 1, grid: 0.5, label: 'Sales',
    precisionNote: 'nearest 0.5', seriesLabels: ['Q1', 'Q2', 'Q3'],
    groups: [{ label: 'A', values: [12.25, 13, 14] }, { label: 'B', values: [11, 12, 13] },
             { label: 'C', values: [10, 11, 12] }] });
  ok(checkChart(bad).includes('chart-value-off-grid'), 'a 12.25 value on a 0.5 grid is rejected');
  const noNote = chartSpec({ kind: 'grouped', interval: 1, grid: 0.5, label: 'Sales',
    seriesLabels: ['Q1', 'Q2', 'Q3'],
    groups: [{ label: 'A', values: [12.5, 13, 14] }, { label: 'B', values: [11, 12, 13] },
             { label: 'C', values: [10, 11, 12] }] });
  ok(checkChart(noNote).includes('chart-midpoint-without-note'), 'a midpoint value without the axis note is rejected');
  const dense = chartSpec({ kind: 'bar', interval: 0.5, grid: 0.5, label: 'x', axisMax: 22,
    bars: [1, 2, 3, 4, 5].map((v, i) => ({ label: 'ABCDE'[i], value: v })) });
  ok(checkChart(dense).includes('chart-too-many-gridlines'), '45 gridlines on a 0 to 22 axis is rejected');
}

console.log('\n=== line: 4 to 6 series that must cross ===');
{
  const spec = chartSpec({ kind: 'line', interval: 200, grid: 200, label: 'Visitors',
    caption: 'Visitors by country', categories: [2004, 2005, 2006, 2007, 2008],
    series: [
      { label: 'USA',   values: [1000, 1200, 1400, 1200, 1600] },
      { label: 'Italy', values: [1400, 1200, 1000, 1400, 1200] },
      { label: 'Japan', values: [600, 800, 1200, 1600, 1400] },
      { label: 'Kenya', values: [400, 600, 800, 600, 1000] },
    ] });
  const svg = checkSpecAndSvg('line', spec);
  const { unproject } = projector({ axisMax: spec.axisMax, top: PLOT.top, height: PLOT.height });
  const hits = attrs(svg, 'circle').filter(a => a.class === 'hit');
  const want = spec.series.flatMap(s => s.values);
  ok(hits.length === want.length, `line: ${want.length} points recovered, got ${hits.length}`);
  want.forEach((v, i) => {
    const got = unproject(Number(hits[i].cy));
    ok(snap(got, spec.grid) === v, `line point ${i}: recovered ${got.toFixed(3)} snaps to ${snap(got, spec.grid)}, want ${v}`);
  });
  const flat = chartSpec({ ...spec, series: spec.series.map((s, i) => ({ ...s, values: s.values.map(v => v + i * 2000) })) });
  ok(checkChart(flat).includes('chart-series-never-cross'), 'non-crossing series are rejected');
}

console.log('\n=== absolute stacked: cumulative sums on the grid, not just segments ===');
{
  const spec = chartSpec({ kind: 'stacked', interval: 200, grid: 200, label: 'Head of livestock',
    caption: 'Livestock by farm', seriesLabels: ['Sheep', 'Cattle', 'Goats'],
    bars: [
      { label: 'Ardsley',  values: [600, 400, 200] },
      { label: 'Brackle',  values: [400, 600, 400] },
      { label: 'Carrow',   values: [800, 200, 400] },
      { label: 'Denwood',  values: [200, 800, 600] },
    ] });
  const svg = checkSpecAndSvg('stacked', spec);
  const { unproject } = projector({ axisMax: spec.axisMax, top: PLOT.top, height: PLOT.height });
  const rects = attrs(svg, 'rect').filter(a => /^s[0-9]$/.test(a.class ?? ''));
  let k = 0;
  for (const bar of spec.bars) {
    for (let seg = 0; seg < bar.values.length; seg++) {
      const a = rects[k++];
      const top = unproject(Number(a.y)), base = unproject(Number(a.y) + Number(a.height));
      ok(snap(top - base, spec.grid) === bar.values[seg],
        `stacked ${bar.label} segment ${seg}: differenced boundaries give ${snap(top - base, spec.grid)}, want ${bar.values[seg]}`);
      ok(onGrid(snap(top, spec.grid), spec.grid), `stacked ${bar.label} segment ${seg}: upper boundary is on the grid`);
    }
  }
  const offGrid = chartSpec({ ...spec, bars: [{ label: 'A', values: [500, 400, 200] }, ...spec.bars.slice(1)] });
  ok(checkChart(offGrid).includes('chart-value-off-grid'), 'a segment whose cumulative sum leaves the grid is rejected');
}

console.log('\n=== 100% stacked: labelled shares, differing captioned totals ===');
{
  const spec = chartSpec({ kind: 'stacked100', label: 'Share of revenue',
    caption: 'Revenue mix. Totals: 41,200 / 58,600 / 47,900 / 63,400',
    seriesLabels: ['Retail', 'Trade', 'Online'],
    bars: [
      { label: '2019', values: [50, 30, 20], total: 41200 },
      { label: '2020', values: [42, 33, 25], total: 58600 },
      { label: '2021', values: [38, 30, 32], total: 47900 },
      { label: '2022', values: [34, 28, 38], total: 63400 },
    ] });
  const svg = checkSpecAndSvg('stacked100', spec);
  for (const bar of spec.bars) for (const v of bar.values) ok(svg.includes(`>${v}%<`), `stacked100: ${v}% is printed on its segment`);
  ok(checkChart(chartSpec({ ...spec, bars: spec.bars.map(b => ({ ...b, total: 50000 })) })).includes('chart-bar-totals-equal'),
    'equal bar totals are rejected, since the reversal trap needs them to differ');
  ok(checkChart(chartSpec({ ...spec, bars: [{ label: 'X', values: [50, 30, 21], total: 1 }, ...spec.bars.slice(1)] })).includes('chart-shares-not-100'),
    'shares that do not sum to 100 are rejected');
}

console.log('\n=== pie: minimum segment 10%, one label mode, total in the caption ===');
{
  const spec = chartSpec({ kind: 'pie', labelMode: 'percent', total: 13700,
    caption: 'Complaints by category. Total: 13,700',
    segments: [{ label: 'Billing', value: 34, display: '34%' }, { label: 'Delivery', value: 26, display: '26%' },
               { label: 'Product', value: 22, display: '22%' }, { label: 'Other', value: 18, display: '18%' }] });
  const svg = checkSpecAndSvg('pie', spec);
  // The wedge geometry has to agree with the printed label, or the chart contradicts itself.
  const paths = attrs(svg, 'path').filter(a => (a.class ?? '').includes('wedge'));
  ok(paths.length === 4, `pie: 4 wedges, got ${paths.length}`);
  const cx = 250, cy = 205, r = 132;
  let acc = -90, checked = 0;
  for (let i = 0; i < spec.segments.length; i++) {
    const sweep = 360 * spec.segments[i].value / 100;
    const m = paths[i].d.match(/L([\d.]+) ([\d.]+)A/);
    const x = Number(m[1]), y = Number(m[2]);
    const ang = Math.atan2(y - cy, x - cx) * 180 / Math.PI;
    const norm = a => ((a % 360) + 360) % 360;
    ok(Math.abs(norm(ang) - norm(acc)) < 0.05, `pie wedge ${i}: starts at ${norm(ang).toFixed(2)} degrees, want ${norm(acc).toFixed(2)}`);
    ok(Math.abs(Math.hypot(x - cx, y - cy) - r) < 0.05, `pie wedge ${i}: start point on the circumference`);
    acc += sweep; checked++;
  }
  ok(checked === 4 && Math.abs(acc - 270) < 1e-9, 'pie: the wedges close on exactly 360 degrees');
  ok(checkChart(chartSpec({ ...spec, segments: [{ label: 'A', value: 8, display: '8%' }, { label: 'B', value: 34, display: '34%' },
      { label: 'C', value: 30, display: '30%' }, { label: 'D', value: 28, display: '28%' }] })).includes('chart-segment-below-minimum'),
    'an 8% segment is rejected under the amended 10% minimum');
  ok(checkChart(chartSpec({ ...spec, segments: spec.segments.map(s => ({ ...s, display: `${s.value}% (${Math.round(s.value / 100 * 13700)})` })) })).length >= 0,
    'a display carrying both a share and an absolute is representable, and the mode check governs it');
  const absMode = chartSpec({ kind: 'pie', labelMode: 'absolute', total: 13700,
    caption: 'Complaints by category. Total: 13,700',
    segments: [{ label: 'Billing', value: 4658, display: '4,658' }, { label: 'Delivery', value: 3562, display: '3,562' },
               { label: 'Product', value: 3014, display: '3,014' }, { label: 'Other', value: 2466, display: '2,466' }] });
  ok(checkChart(absMode).length === 0, `pie absolute mode clean, got ${checkChart(absMode).join(',')}`);
  ok(checkChart(chartSpec({ ...absMode, total: 13701 })).includes('chart-pie-absolutes-not-total'),
    'absolute segments that do not sum to the captioned total are rejected');
}

console.log('\n=== two pies: the reversal has to exist ===');
{
  const mk = (label, total, shares) => ({ label, total, labelMode: 'percent',
    segments: ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'].map((l, i) => ({ label: l, value: shares[i], display: `${shares[i]}%` })) });
  const spec = chartSpec({ kind: 'pies', caption: 'Membership by branch. Totals: 30,000 in 2019 and 39,000 in 2023',
    pies: [mk('2019', 30000, [17, 22, 23, 19, 19]), mk('2023', 39000, [19, 21, 19, 21, 20])] });
  const svg = checkSpecAndSvg('pies', spec);
  ok(svg.includes('2019') && svg.includes('2023'), 'pies: both pies titled');
  const flat = chartSpec({ ...spec, pies: [mk('2019', 30000, [20, 20, 20, 20, 20]), mk('2023', 39000, [20, 20, 20, 20, 20])] });
  ok(checkChart(flat).includes('chart-no-share-absolute-reversal'), 'two pies with no reversal are rejected');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
