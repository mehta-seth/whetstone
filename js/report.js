// Reporting a problem with a question.
//
// There is no server, so a report becomes a GitHub issue that the person files themselves: the app
// opens GitHub's new-issue page with the title and the details already filled in, and they press
// Submit. Anyone without a GitHub account can copy the same details instead.
//
// THE REPORT CARRIES EVERYTHING NEEDED TO JUDGE THE QUESTION WITHOUT REPRODUCING IT: the stem, the
// table or chart as text, every option in the order shown, the answer given, and, folded away so it
// does not spoil a question still being worked on, the answer key with how each option was built.
// The seed and question type are there as well, so the exact item can be rebuilt with
// tools/reproduce.mjs.
import { REPO, APP_VERSION } from './lib/constants.js';
import { tableText } from './lib/table.js';
import { chartText } from './lib/chart.js';
import { figureText } from './lib/figure.js';

export const REASONS = [
  ['wrong-answer', 'The marked answer is wrong'],
  ['two-answers', 'More than one option could be right'],
  ['no-answer', 'None of the options is right'],
  ['unclear', 'The question is unclear or could be read two ways'],
  ['wording', 'A typo or a wording problem'],
  ['display', 'The table, chart or figure is hard to read'],
  ['other', 'Something else'],
];

// GitHub rejects very long new-issue links. Past this, the link carries a short body and the full
// details travel on the clipboard instead.
export const MAX_URL = 7000;
const LETTERS = 'ABCDEFGH';

// ctx: { item, name, deskName, mode, chosenDisplay, typedText, submitted, userAgent }
export function reportText(ctx, reason = 'wrong-answer', note = '') {
  const it = ctx.item;
  const why = REASONS.find(([k]) => k === reason)?.[1] ?? 'Something else';
  const stim = [];
  if (it.stimulus?.text) stim.push(...quote(it.stimulus.text));
  if (it.stimulus?.lines) it.stimulus.lines.forEach((l, i) => stim.push(`> ${i + 1}. ${l}`));
  if (it.stimulus?.table) stim.push('', '```', tableText(it.stimulus.table, 0), '```');
  if (it.stimulus?.chart) stim.push('', '```', chartText(it.stimulus.chart, 0), '```');
  if (it.stimulus?.figures) it.stimulus.figures.forEach((f, i) => stim.push(`> Figure ${i + 1}: ${figureText(f)}`));

  const answered = ctx.submitted
    ? (ctx.typedText ? `typed "${ctx.typedText}"${ctx.chosenDisplay ? `, which matches ${ctx.chosenDisplay}` : ''}`
      : ctx.chosenDisplay ?? 'nothing chosen')
    : 'not answered yet';

  const key = it.options.map((o, i) => `- ${LETTERS[i]}. ${o.display}: ${o.role === 'correct' ? '**marked correct**'
    : `${o.note ?? 'no derivation recorded'}${o.errorType ? ` (\`${o.errorType}\`)` : ''}`}`);
  const steps = (it.workings?.steps ?? []).map(s => `    ${s}`);
  const standalone = !it.stimulusId;

  const head = [
    '### What is wrong',
    why,
    '',
    note.trim() || '_Add anything that would help: which option you think is right, or what reads two ways._',
    '',
    '### The question',
    `**${ctx.deskName}** · ${it.tier} · ${ctx.mode} mode · question type \`${it.archetypeId}\` ${ctx.name ?? ''}`.trim(),
    '',
  ];
  const question = [
    ...stim,
    '',
    `**${it.questionText}**`,
    '',
    ...it.options.map((o, i) => `${LETTERS[i]}. ${o.display}`),
    '',
    `**My answer:** ${answered}`,
  ];
  const tail = [
    '',
    '<details><summary>Answer key and how each option was built (spoiler)</summary>',
    '',
    ...key,
    '',
    'Worked answer:',
    '',
    ...steps,
    '',
    '</details>',
    '',
    '<details><summary>For the maintainer</summary>',
    '',
    `- Question id \`${it.id}\`, seed \`${it.seed}\`, tier \`${it.tier}\`${it.stimulusId ? `, shared table \`${it.stimulusId}\` question ${it.stimulusIndex + 1}` : ''}`,
    `- Whetstone ${APP_VERSION}`,
    standalone ? `- Rebuild it: \`node tools/reproduce.mjs ${it.archetypeId} ${it.seed} ${it.tier}\`` : '- Built on a shared table, so the full table is quoted above.',
    ctx.userAgent ? `- Browser: ${ctx.userAgent}` : '',
    '',
    '</details>',
  ];
  const title = `[question] ${it.archetypeId} (${ctx.deskName}): ${why.toLowerCase()}`;
  return {
    title,
    body: [...head, ...question, ...tail].join('\n'),
    // The short body keeps what a reader needs to find the item, and asks for the rest to be pasted.
    short: [...head, `Question id \`${it.id}\`, seed \`${it.seed}\`, tier \`${it.tier}\`, Whetstone ${APP_VERSION}.`, '',
      '_The full question and answer key were copied to your clipboard. Please paste them below this line._', ''].join('\n'),
  };
}

export function issueUrl(title, body) {
  const q = new URLSearchParams({ title, body, labels: 'bug' });
  return `https://github.com/${REPO}/issues/new?${q.toString()}`;
}

// The link to open: the full body if it fits, otherwise the short one.
export function bestUrl(report) {
  const full = issueUrl(report.title, report.body);
  return full.length <= MAX_URL ? { url: full, needsPaste: false } : { url: issueUrl(report.title, report.short), needsPaste: true };
}

function quote(text) {
  return String(text).split('\n').map(l => `> ${l}`);
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.append(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// The dialog. Built on demand, reused, and closed with Esc like any native dialog. While it is open
// the session's own keys (1 to 5, Enter, Esc) are ignored, so nothing is answered or skipped behind it.
export function openReport(ctx, { onNote } = {}) {
  document.getElementById('report-dialog')?.remove();
  const dlg = document.createElement('dialog');
  dlg.id = 'report-dialog';
  dlg.className = 'report';
  document.body.append(dlg);
  const back = document.activeElement;
  dlg.innerHTML = `
    <form method="dialog" class="report-form">
      <h2>Report a problem with this question</h2>
      <p class="purpose">Reports are how wrong questions get fixed. This opens a GitHub issue with the
        question already filled in; you can edit it before posting, and you need a free GitHub account
        to post. No account? Copy the details and send them however suits you.</p>
      <fieldset><legend>What is wrong?</legend>
        ${REASONS.map(([k, label], i) => `<label class="reason"><input type="radio" name="reason" value="${k}"${i === 0 ? ' checked' : ''}> ${esc(label)}</label>`).join('')}
      </fieldset>
      <label class="note-label" for="report-note">Anything else? <span class="empty">(optional)</span></label>
      <textarea id="report-note" rows="3" placeholder="Which option you think is right, or what reads two ways"></textarea>
      <details class="preview"><summary>Show what will be sent</summary><pre class="report-preview"></pre></details>
      <div class="btn-row">
        <button type="button" class="btn" value="cancel" data-act="cancel">Cancel</button>
        <button type="button" class="btn" data-act="copy">Copy details</button>
        <a class="btn btn-primary" data-act="open" target="_blank" rel="noopener">Open a GitHub issue</a>
      </div>
      <p class="empty fine">Whetstone ${esc(APP_VERSION)}. Nothing is sent anywhere until you post it yourself.</p>
    </form>`;
  const state = () => ({
    reason: dlg.querySelector('input[name="reason"]:checked')?.value ?? 'other',
    note: dlg.querySelector('#report-note').value,
  });
  const refresh = () => {
    const { reason, note } = state();
    const r = reportText(ctx, reason, note);
    const { url } = bestUrl(r);
    dlg.querySelector('[data-act="open"]').href = url;
    dlg.querySelector('.report-preview').textContent = r.body;
    return r;
  };
  dlg.addEventListener('input', refresh);
  dlg.addEventListener('change', refresh);
  dlg.querySelector('[data-act="cancel"]').addEventListener('click', () => dlg.close());
  dlg.querySelector('[data-act="copy"]').addEventListener('click', async () => {
    const ok = await copy(`${refresh().title}\n\n${refresh().body}`);
    dlg.querySelector('[data-act="copy"]').textContent = ok ? 'Copied' : 'Copy failed: select the preview instead';
  });
  dlg.querySelector('[data-act="open"]').addEventListener('click', async () => {
    const r = refresh();
    // When the link had to be shortened, the full details go to the clipboard in the same click.
    if (bestUrl(r).needsPaste) await copy(r.body);
    onNote?.();
    setTimeout(() => dlg.close(), 0);
  });
  dlg.addEventListener('close', () => back?.focus?.(), { once: true });
  refresh();
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  dlg.querySelector('input[name="reason"]')?.focus();
  return dlg;
}

export const reportOpen = () => !!document.querySelector('dialog[open]');
