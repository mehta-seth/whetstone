# Architecture

The two session formats are called *desks* in the code (`DESKS`, `deskId`, `forDesk`) — a
workstation metaphor, kept because the identifier is load-bearing in `localStorage` keys and
fixture data. On screen they appear by name: Problem Solving and Data Interpretation.

Whetstone is a static ES-module application with no dependencies and no build step. The browser loads `js/app.js` directly; Node runs the same modules for the test suite and the audit generator, and `tools/serve.js` serves the files locally using nothing but the Node standard library. One runtime, no install step. That constraint shapes everything below.

## Layers

```
┌───────────────────────────────────────────────────────────┐
│  app.js            hash router, mounting, keyboard        │
│  render.js         screens        dashboard.js  analytics │
├───────────────────────────────────────────────────────────┤
│  session.js        run construction, scope, item building │
│  adaptive.js       mastery model, weighted selection      │
│  toggles.js        modes and their defaults               │
│  timer.js          session and per-item clocks            │
│  store.js          localStorage schema, CSV export        │
├───────────────────────────────────────────────────────────┤
│  archetypes/       47 modules behind one contract         │
├───────────────────────────────────────────────────────────┤
│  lib/              generation and formatting primitives   │
└───────────────────────────────────────────────────────────┘
```

Dependencies point downward only. An archetype may import from `lib/`; nothing in `lib/` imports an archetype. `session.js` knows about archetypes through the registry and never about individual ones.

## The primitives (`js/lib/`)

| Module | Responsibility |
| --- | --- |
| `rng.js` | Seeded PRNG. The reason sessions are reproducible. |
| `constants.js` | Every tunable number in the project, in one file. |
| `validate.js` | The item invariants. Nothing is shown that fails these. |
| `options.js` | Building and ordering the five-option set. |
| `precision.js` | How many significant figures the option set actually requires. |
| `format.js` | Rendering a value for its answer type. |
| `money.js`, `fraction.js` | Type-specific arithmetic and display. |
| `table.js`, `dataset.js` | Tabular stimulus construction. |
| `chart.js` | SVG chart rendering. |
| `stimulus.js` | Shared stimuli — one table serving several questions. |
| `relations.js` | Relationships between generated quantities. |

Comments throughout the codebase refer to "the spec" and "the archetype spec". That is
[design-rules.md](design-rules.md), which states every rule the generator enforces.

`constants.js` is the file to read first. It states, as code, every rule the generator enforces: the option-set geometry, the mastery blend weights, the review scheduling thresholds, the seed strides.

## The archetype contract

An archetype is a module with a single default export:

```js
export default {
  id: 'a01',                                  // stable; used by fixtures, audit and storage
  name: 'Budget allocation with a blanket discount',
  group: 'money',                             // one of ten topic groups
  desks: [1],                                 // which session formats it belongs to
  tiers: ['warmup', 'standard'],              // difficulty bands it appears in
  stimulus: 'prose',                          // 'prose' | 'table' | 'chart'
  answerType: 'countWithUnit',                // one of ten answer types
  targetSeconds: 83,

  // Named constraints, declared so the audit can report a failure rate per name.
  // A constraint that never fires is not protecting anything.
  constraints: [
    'quotient lands between .3 and .8 above an integer',
    'fixed spend leaves at least 40% of the budget',
    'all five options are distinct positive integers',
  ],

  // The wrong procedures this archetype's distractors come from. Scoring records
  // which one the solver picked, so feedback can name the method that failed.
  errorTypes: ['partial-discount', 'omitted-component', 'round-up'],

  // Plain English, so the generated question text can be read against it by hand.
  formulaText: 'floor((budget − discounted fixed spend) ÷ discounted unit price)',

  generate(rng, tier, forced = null, diag = null) {
    // → { stem, stimulus?, correct, options }
    // `forced` injects fixture parameters; `diag` collects constraint rejections.
  },
};
```

All twelve keys above are required and every one of the 47 archetypes declares
them. Four optional hooks exist:

| Hook | Used by | Purpose |
| --- | --- | --- |
| `estimate(item)` | 13 archetypes | The approximate route, and which option it lands on |
| `formula(params)` | 14 archetypes | Pure arithmetic, exported so a fixture pins the formula and nothing else |
| `variants` | 15 archetypes | Named sub-shapes of the same item type |
| `generateAll` / `buildSolo` | 5 archetypes | Emit a matched set off one stimulus |

Every module implements exactly this shape. Nothing else is permitted to vary, which is what lets the registry, the audit harness and the fixture suite treat the library uniformly — and it is why `constraints` and `errorTypes` are declared as data rather than left implicit in the generator: the audit reads them to report a rejection rate per named constraint.

One error type is universal and therefore not declared per archetype: `filler`, which marks an option that exists to occupy a slot rather than to model a wrong method. Every *other* error type an archetype emits must appear in its `errorTypes` list, or the analytics will report a string the dashboard cannot rank.

`js/archetypes/index.js` is the only file that imports archetypes. It exports `archetypes` (the array), `byId`, and `forDesk`.

## The item pipeline

1. **Session seed.** Drawn once per run, or supplied. Each item's seed is `sessionSeed + i × stride`, where the stride is a prime — so item seeds never collide, and a shared-stimulus seed drawn from the same session seed uses a different prime and cannot collide with an item seed either.
2. **Scope.** `inScope({ desk, tier, groups })` filters the library.
3. **Selection.** `adaptive.js` weights the in-scope archetypes by mastery, staleness and a per-archetype share cap, then draws.
4. **Generation.** `buildItem` calls `archetype.generate(rng, tier)` and validates the result. A failure retries, up to a bounded attempt count. The audit reports the retry rate per archetype: an archetype that regularly needs more than a handful of attempts has parameter ranges that are wrong.
5. **Ordering.** Options are ordered per session setting — shuffled, or ascending.
6. **Render.** `render.js` mounts the item; numbers are formatted for their answer type.
7. **Scoring.** A wrong answer records the `errorType` of the chosen distractor, so the analytics can name the failed method rather than just the failure.

## Validation

`validate.js` enforces the item invariants. The load-bearing ones are geometric properties of the option set: minimum gap between any two options, at least one option within a factor of two of the answer, at least three inside a wider band, a hard spread ceiling, and every distractor traceable to a named error type.

The reasoning behind the tight-neighbour rule is worth stating because it is not obvious: an option set whose nearest neighbour is several times away from the answer is answerable by estimating magnitude alone, which defeats the item. Magnitude has to be insufficient.

## Adaptive selection

`adaptive.js` maintains a mastery score per archetype, blending accuracy and pace against the archetype's target time, with a Bayesian prior so a single attempt does not swing the score. Mastery decays with staleness over a fixed window. Selection weights are floored so nothing disappears entirely, and capped so no single archetype can dominate a session.

Review scheduling picks archetypes that are weak or decayed, one item each — two each when the matching set is small enough that one apiece would make the session too short to be worth opening. The gates and the exact formulas are in [using-whetstone.md](using-whetstone.md).

## Storage

`store.js` owns every key. All are namespaced:

| Key | Contents |
| --- | --- |
| `whetstone:sessions` | Completed session records |
| `whetstone:mastery` | Per-archetype mastery state |
| `whetstone:settings` | Per-format setup, persisted between visits |
| `whetstone:presets` | Named toggle configurations |
| `whetstone:flags` | Flagged items |
| `whetstone:activeSession` | In-progress run, so a reload does not lose it |
| `whetstone:classify` | Recognition-drill state, kept separate from mastery — naming an archetype is not solving it |

This schema is a public interface. Changing it is a major version bump.

## Verification

Two independent mechanisms, and they catch different things.

**`test/run.js`** is deterministic. Each archetype has a pinned fixture in `test/fixtures.json` with known parameters and an expected option set, so any change to shared code that alters an item's output fails immediately and names the archetype. It also unit-tests the primitives — the PRNG, precision arithmetic, formatters, validator paths.

**`audit/build.js`** is statistical. It generates hundreds of items per archetype and reports on distributional properties: per-constraint rejection rates, answer position in the option set, answer rank against every visible input column, estimation resolvability, formatting tells, and adjacent-value pairs.

The distinction matters. The fixture suite catches regressions. The audit catches *classes of defect that are invisible in any single item* — an answer that sits in the last slot too often, or that is always derived from the largest number on screen. Neither substitutes for the other.
