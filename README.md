# Whetstone

**A local-first numerical reasoning trainer. Every question is generated at run time, never replayed from a bank.**

[![tests](https://github.com/mehta-seth/whetstone/actions/workflows/test.yml/badge.svg)](https://github.com/mehta-seth/whetstone/actions/workflows/test.yml)

Whetstone is practice software for the numerical reasoning tests used in graduate and analyst hiring. It has no question bank. Each item is built from a parameterised archetype, checked against a set of item-design invariants, and never repeated.

## Why generated, not banked

A fixed bank teaches you the bank. Work through it twice and you are recalling answers rather than deriving them, and your measured accuracy stops describing your actual skill.

Whetstone draws fresh parameters for every item, so you can drill the same archetype fifty times without meeting the same numbers. What improves is the method. What the app records — accuracy, pace, and which shortcut you reached for when you got it wrong — describes the method rather than your memory.

## Quick start

```bash
git clone https://github.com/mehta-seth/whetstone.git
cd whetstone
npm start
```

Opens `http://localhost:8000`. There is no install step, no dependency tree, and no build.

**Requirements.** Node 18 or newer, and nothing else. The dev server is 90 lines of Node standard library; there is no dependency to install. The app ships as native ES modules, so it has to be served over HTTP rather than opened from the filesystem — that is the only reason a server is involved at all.

```bash
npm test        # fixture suite, ~660 assertions
npm run audit   # writes audit/audit.html
```

## What's inside

- **47 question archetypes** across ten answer types — currency, percentage, ratio, fraction, count-with-unit, label, month, signed direction, verdict, plain number
- **Five session modes** — untimed practice, per-item pacing, full timed sitting, an archetype-recognition drill, and a scheduled review queue
- **Adaptive selection** — a mastery model blends accuracy and pace, decays with staleness, and caps any single archetype's share of a session
- **Estimation routes** — 13 archetypes can show the approximate path to the answer alongside the exact one, because on a clock the estimate is often the better method
- **A statistical audit harness** — generates hundreds of items per archetype and reports on the properties that individual inspection cannot see
- **Zero dependencies** — no lockfile, no bundler, nothing to break in eighteen months

## Session formats

| Format | Items | Time | Target per item | Archetypes |
| --- | --- | --- | --- | --- |
| Problem Solving | 18 | 25 min | 83 s | 36 |
| Data Interpretation | 20 | 15 min | 45 s | 11 |

Both formats offer shorter runs (10 items) when you want a single sitting rather than a full one.

## Modes

| Mode | Behaviour |
| --- | --- |
| Practice | No clock. Feedback after every question. |
| Tempo | Per-item clock at the target pace. |
| Exam | One clock for the session. Feedback at the end only. |
| Classify | Name the archetype; do not solve it. Ten seconds per item. |
| Review due | Archetypes that are weak, or mastered but going stale. |

Every mode is a preset over twelve session options you can change yourself. Those, the
difficulty bands, the topic groups, review scheduling, and how mastery is calculated are
all covered in **[docs/using-whetstone.md](docs/using-whetstone.md)**.

## How an item is built

1. **Seed.** A session seed is drawn once; each item's seed is derived from it by a fixed stride. Any session is reproducible from its seed, which is what makes a defect reportable.
2. **Generate.** The archetype draws its parameters and returns a stem, a stimulus (a table or chart, where the archetype uses one), a correct answer, and four distractors, each labelled with the error type that produces it.
3. **Validate.** The item is checked against every invariant. A failure discards the item and the archetype is asked again, up to a bounded number of attempts.
4. **Order.** Options are ordered by session setting, either shuffled or ascending.
5. **Render.** Numbers are formatted for their answer type, with tabular figures so columns align.
6. **Score.** A wrong answer is recorded against the error type of the distractor chosen, so the analytics can say *which* shortcut failed rather than only that something did.

## Item-design invariants

The interesting problem in generating questions is not producing them — it is producing ones that are fair, unambiguous, and not solvable by the wrong method. Every item must satisfy all of the following before it is shown:

- Exactly five options, one correct.
- No two options closer than 2% of the larger, or one whole unit for integer types — so a near-miss is never a formatting artefact.
- At least one option within a factor of two of the answer, so the item cannot be resolved by magnitude alone.
- At least three of the five options within a factor of four of the answer.
- No option beyond a hard spread ceiling in either direction.
- Every distractor traceable to a named error type, so feedback can be specific.
- Where an archetype declares a decoy input, the answer must not be recoverable from that input alone.

These are enforced in code, not by convention, and the audit harness measures how often each one rejects a candidate.
The full set, with the reasoning behind the non-obvious ones, is in [docs/design-rules.md](docs/design-rules.md).

## Quality: the audit report

`npm run audit` generates hundreds of items per archetype and reports:

- **Constraint rejection rates**, per named constraint. A constraint that never fires is not protecting anything; one that fires constantly means the parameter ranges are wrong.
- **Answer position in the option set**, pooled and per archetype. If the correct answer sits in the same slot too often, the library is guessable without arithmetic — a defect invisible to any amount of per-item review.
- **Answer rank against every visible input column.** If the answer is always derived from the largest value on screen, "pick the biggest" scores above chance and the item is not testing what it claims to.
- **Estimation resolvability.** Whether the option set can be separated at one significant figure. If it can, the item rewards estimation; if it cannot, it requires the full calculation. Both are legitimate, but the mix should be deliberate.
- **Formatting tells.** Whether the correct option is distinguishable by how it is written rather than by what it says.

The second and third of these caught defects that no per-item inspection would have found. That is the argument for the harness.

## Your data

Everything stays on your machine. There is no account, no server and no telemetry —
the app is static files and the only network request is the one that loads them.

Practice history lives in `localStorage` under seven `whetstone:` keys: completed
sessions, per-archetype mastery, saved presets, flagged items, setup preferences, any
run in progress, and Classify state (kept separate, because naming an archetype is not
solving it). Clearing your browser data clears all of it.

Analytics can export a CSV of your history. It lands in `logs/`, which is gitignored —
your performance figures are personal and do not belong in a public repository.
`test/run.js` asserts that ignore rule holds, because a later tidy-up could reverse it
with no visible symptom, and the symptom here would be publishing your own data.

## Project structure

```
index.html          shell: sidebar, main region, key hints
tools/
  serve.js          local static server, Node standard library only
css/
  tokens.css        colour, spacing, type scale — restyle here only
  layout.css        page grid
  components.css    everything else
js/
  app.js            hash router, mounting, keyboard handling
  session.js        run construction, scope, item building
  render.js         screens
  dashboard.js      analytics and the weight table
  store.js          localStorage schema and CSV export
  adaptive.js       mastery model and weighted selection
  timer.js          session and per-item clocks
  toggles.js        modes and their default settings
  lib/              13 primitives: rng, validate, options, chart, table,
                    dataset, stimulus, relations, precision, format,
                    money, fraction, constants
  archetypes/       47 archetype modules + index.js registry
audit/
  build.js          generates the audit report
test/
  run.js            the suite
  fixtures.json     one pinned fixture per archetype
  probes/           reusable investigation scripts
docs/               feature guide, architecture, design rules, contributing
logs/               exported practice history (gitignored)
```

## The archetype contract

Every archetype is a module with one default export and the same shape:

```js
export default {
  id: 'a01',
  name: 'Budget allocation with a blanket discount',
  group: 'money',                 // one of ten topic groups
  desks: [1],                     // which session formats it belongs to
  tiers: ['warmup', 'standard'],  // difficulty bands
  stimulus: 'prose',              // 'prose' | 'table' | 'chart'
  answerType: 'countWithUnit',    // one of ten answer types
  targetSeconds: 83,
  constraints: [...],             // named, so the audit can report a rate per constraint
  errorTypes: [...],              // the wrong procedures the distractors come from
  formulaText: '...',             // plain English, for reading the question against
  generate(rng, tier, forced, diag) { /* → { stem, stimulus?, correct, options } */ },
};
```

Twelve required keys, declared identically by all 47 modules, plus optional
`estimate`, `formula`, `variants` and `generateAll` hooks.

`js/archetypes/index.js` is the only place an archetype is imported. Adding one is a new file, one import line, and one pinned fixture — see [docs/adding-an-archetype.md](docs/adding-an-archetype.md).

## Development

No dependencies, so there is nothing to install. `package.json` exists so that Node
treats `.js` as ESM, which the test runner and the audit generator require. CI runs the
suite and the audit generator on Node 18, 20 and 22.

The suite is fixture-driven: each archetype has a pinned fixture with known parameters and an expected option set, so a change to shared code that alters any item's output fails immediately and names the archetype.

Design notes worth knowing before changing the front end:

- All colour, spacing and type values live in `css/tokens.css`. Restyle there.
- Numeric cells use `font-variant-numeric: tabular-nums`; keep it, or columns of figures stop aligning.
- Dark mode is automatic via `prefers-color-scheme`; it overrides the same tokens, so nothing downstream knows which theme is active. Chart colours flow through the same set.
- `prefers-reduced-motion` is honoured globally.
- The app is fully keyboard-operable: `1`–`5` select, `Enter` advances, `Escape` skips, `F` flags.
- Generated charts are SVG with `role="img"` and a generated accessible name.

## Roadmap

- Worked explanations on the feedback screen, not only the exact chain
- Wider coverage of chart-based items — four of 47 archetypes use one
- Fill the two unbuilt slots in the `d` series

## Licence

MIT. See [LICENSE](LICENSE).
