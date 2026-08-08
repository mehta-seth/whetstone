// Standalone table stimulus. Part A3 only: one small table serving one question, which
// is what the real Desk 01 paper showed in 3 of its 18 items. Desk 02's shared-stimulus
// system, where one table serves 3 to 7 questions, is an earlier round and is a different
// thing entirely.
//
// One spec, three renderers. The app screen, the audit page and the terminal summary all
// read the same object, so a table can never look right in the app and wrong in the
// audit report it is being reviewed against.
//
//   { caption, head: [...], body: [[...], ...], align: [...], note }
//
// Cells are display strings, already formatted by the archetype. The renderer never
// formats a number, because the audit has to show exactly what the candidate sees.

export function tableSpec({ caption = null, head, body, align = null, note = null, keys = null }) {
  return {
    caption,
    head,
    body,
    // Entity key per row, in row order. Lets the audit's column-correlation diagnostic
    // match the correct answer back to its row without parsing the label cell.
    keys,
    // Text left, everything else right. Numbers in a column a candidate has to scan
    // must line up or the reading error the item measures becomes a rendering error.
    align: align ?? head.map((_, i) => (i === 0 ? 'left' : 'right')),
    note,
  };
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function tableHtml(t, { cls = 'stim-table' } = {}) {
  if (!t) return '';
  const head = t.head.map((h, i) =>
    `<th class="${t.align[i] === 'right' ? 'num' : ''}">${esc(h)}</th>`).join('');
  const body = t.body.map(row => '<tr>' + row.map((c, i) =>
    `<td class="${t.align[i] === 'right' ? 'num' : ''}">${esc(c)}</td>`).join('') + '</tr>').join('');
  return `<table class="${cls}">`
    + (t.caption ? `<caption>${esc(t.caption)}</caption>` : '')
    + `<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
    + (t.note ? `<p class="table-note">${esc(t.note)}</p>` : '');
}

// Fixed-width text, for the terminal block in build.js. Column widths come from
// the content so the numbers line up the way they do on screen.
export function tableText(t, indent = 11) {
  if (!t) return '';
  const rows = [t.head, ...t.body].map(r => r.map(c => String(c)));
  const w = t.head.map((_, i) => Math.max(...rows.map(r => (r[i] ?? '').length)));
  const pad = (s, i) => t.align[i] === 'right' ? s.padStart(w[i]) : s.padEnd(w[i]);
  const line = r => ' '.repeat(indent) + r.map(pad).join('  ').trimEnd();
  const out = [];
  if (t.caption) out.push(' '.repeat(indent) + t.caption);
  out.push(line(rows[0]));
  out.push(' '.repeat(indent) + w.map(n => '-'.repeat(n)).join('  '));
  for (const r of rows.slice(1)) out.push(line(r));
  if (t.note) out.push(' '.repeat(indent) + t.note);
  return out.join('\n');
}
