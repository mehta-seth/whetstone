# Adding an archetype

An archetype is one question *type* — a parameterised template that can produce an unlimited number of distinct items. Adding one is four steps and touches three files.

Read [architecture.md](architecture.md) first if you have not; the contract described there is the thing you are implementing.

## 1. Write the module

Create `js/archetypes/<id>-<short-name>.js`. IDs are grouped by series (`a` problem-solving prose, `b` shared-stimulus, `c` charts, `d` mixed), then sequential. The filename convention is a sortable ID plus a human-readable description.

```js
// What the item asks, and why the distractors are the ones they are.
// This comment is the most valuable part of the file — say what makes
// the item well-formed, not what the code does.

import { pick, intBetween } from '../lib/rng.js';
import { currency } from '../lib/format.js';
import { OPTION_RULES } from '../lib/constants.js';

export default {
  id: 'a23',
  name: 'Short human-readable name',
  group: 'money',                    // one of the ten existing groups
  desks: [1],
  tiers: ['warmup', 'standard'],
  stimulus: 'prose',                 // 'prose' | 'table' | 'chart'
  answerType: 'currency',            // one of the ten existing types
  targetSeconds: 83,

  // Name every constraint you enforce. The audit reports a rejection rate per
  // name, which is the only way to tell a constraint that is protecting
  // something from one that never fires.
  constraints: [
    'answer lands clear of every distractor by the minimum gap',
    'all five options are distinct',
  ],

  // The wrong procedures the distractors come from. These strings are what the
  // analytics reports back, so write them as methods, not as symptoms.
  errorTypes: ['inverted', 'omitted-component'],

  // Plain English. Used to read the generated question text against the
  // arithmetic by hand, which catches wording defects no machine will.
  formulaText: 'gross revenue − fixed overhead',

  generate(rng, tier, forced = null, diag = null) {
    // 1. Draw parameters — or take them from `forced` when a fixture injects them.
    // 2. Compute the correct answer.
    // 3. Compute four distractors, each by a named wrong method.
    // 4. Push a constraint name onto `diag` on each rejection, then retry.
    return {
      stem: '…',
      correct: { value: answer, display: currency(answer) },
      options: [
        { value: answer, display: currency(answer), role: 'correct',    errorType: null },
        { value: wrong1, display: currency(wrong1), role: 'distractor', errorType: 'inverted' },
        // …
      ],
    };
  },
};
```

All twelve keys above are required. Omitting `constraints`, `errorTypes` or
`formulaText` will not throw, but the archetype will appear in the audit report
with nothing useful in it, which is worse — you will have no way to tell whether
the item is sound.

**Distractors are the design work, not the answer.** Every distractor must come from a specific plausible wrong method, and must be labelled with it. `errorType` is what lets the analytics say "you inverted the ratio" rather than "you got it wrong". A distractor invented to fill a slot teaches nothing and should be replaced.

**Take every tunable number to `js/lib/constants.js`.** No magic numbers in the module.

## 2. Register it

One import line and one array entry in `js/archetypes/index.js`. Keep the imports alphabetical. This is the only file that imports archetypes.

## 3. Pin a fixture

`test/fixtures.json` holds one fixture per archetype: a fixed seed, the expected stem, and the expected option set with each option's value, display, role and error type.

Generate the item once, inspect it by hand until you are satisfied it is correct, then pin it. From then on, any change to shared code that alters this archetype's output fails the suite and names it.

```bash
npm test
```

An archetype without a fixture is not covered, and a change to `js/lib/` can silently break it.

## 4. Read the audit

```bash
npm run audit
```

Then open `audit/audit.html` and check your archetype in five sections. **This is the step people skip, and it is where the real defects are.**

| Section | What you are looking for |
| --- | --- |
| **Constraint failure rates** | A constraint at 0% is not protecting anything — either it is unreachable or your ranges are too narrow. A constraint rejecting most candidates means the ranges are wrong. Both are worth fixing. |
| **Answer position in the option set** | The correct answer should not favour a slot. If it does, the item is guessable without arithmetic. |
| **Answer against each visible input column** | If the answer is consistently the largest (or smallest) value derivable from the stimulus, "pick the biggest" beats chance and the item is not testing what it claims. |
| **Estimation resolvability** | Whether the option set separates at one significant figure. Either answer is fine; what matters is that the mix across the library is deliberate rather than accidental. |
| **Formatting tells** | Whether the correct option is identifiable by how it is written — decimal places, trailing zeroes, unit placement — rather than by its value. |

An archetype that generates a plausible-looking question and passes validation can still fail all five of these. Position skew in particular is invisible to any amount of per-item review, which is the whole reason the harness exists.

## Optional: an estimation route

If the item has a sensible approximate method, add `estimate(item)`. It returns the rough path and the option it lands on. Thirteen archetypes have one.

The route **must land on the correct option**, or it teaches a method that fails. The suite asserts this as a property across many generated items, not just for the pinned fixture — a route that drifts fails on the first few items rather than the last.

## Checklist

- [ ] Module exports the full contract shape and nothing extra
- [ ] Every distractor has a named `errorType` derived from a real wrong method
- [ ] No magic numbers; tunables in `constants.js`
- [ ] Comment explains why the item is well-formed
- [ ] Registered in `index.js`, imports alphabetical
- [ ] Fixture pinned in `fixtures.json`
- [ ] `npm test` green
- [ ] `npm run audit` reviewed across the five sections above
- [ ] `estimate` added if the item has an approximate route, and it lands on the answer
