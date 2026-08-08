# Design rules

Code comments in this project refer to "the spec" and "the archetype spec". This document is that spec: the rules an item must satisfy to be shown, and the reasoning behind the ones that are not obvious.

These rules are enforced in code, not by convention. `js/lib/constants.js` holds every number; `js/lib/validate.js` holds every predicate. The audit report (`npm run audit`) measures how often each one rejects a candidate, which is how you tell a rule that is protecting something from a rule that is merely present.

---

## 1. The option set

Five options, exactly one correct.

| Rule | Value | Why |
| --- | --- | --- |
| Minimum gap, non-integer types | 2% of the larger | A near-miss must be a real difference, not a rounding artefact |
| Minimum gap, integer types | 1 whole unit | Same, on a discrete scale |
| Tight neighbour | at least one option within 2× | Magnitude alone must not resolve the item |
| Near band | at least 3 of 5 within 4× | Stops the set being one plausible answer and four obvious rejects |
| Hard spread ceiling | 200× in either direction | An option nobody would pick is a wasted slot |
| Filler placement | within 2× of the answer | Filler is near cover, not decoration |

**The tight-neighbour rule is the load-bearing one, and it overturned an earlier reading.** The original rule was a flat wide spread, on the theory that spread makes an item harder. It does the opposite. The binding case is a pair of options at roughly 0.52× and 0.63× of the answer: close enough that estimating the order of magnitude cannot separate them, so the full calculation is required. An option set whose nearest neighbour sits several multiples away is answerable by estimation, which defeats the item. Magnitude has to be insufficient.

## 2. Distractors

Every distractor traces to a **named wrong procedure** applied to the stimulus — not to a perturbation of the correct answer.

This matters for two reasons. Scoring: the error type of the option chosen is what lets the analytics say *which* method failed rather than only that something did. And integrity: a distractor built by nudging the answer is recoverable from the option set by algebra, without reading the stimulus at all.

An archetype with a fixed catch-all option ("Cannot say", "All would cost the same") must have that option be correct sometimes. A catch-all that is never right is a free elimination.

## 3. Answer positioning

Two properties, both distributional, both invisible in any single item:

- **Position in the option set.** If the correct answer favours a slot, the library is guessable without arithmetic. The audit reports this pooled and per archetype, against the number of slots the archetype can structurally reach — an archetype capped at two slots by its own option geometry cannot beat 50% and should not be flagged as though it could.
- **Rank against every visible input column.** If the answer is always derived from the largest value on screen, "pick the biggest" scores above chance. The flag threshold is 2.4× chance, which is roughly 50% on a five-way set: at or above that it is a defect, below it a note.

## 4. Stimulus construction

Tables must be internally consistent: totals equal the sum of their parts, head and body agree in width, and any column presented as additive must actually be additive. Adding a price to a unit count is not a number.

Charts follow the **grid rule**: a readable value lands on a drawn gridline, or exactly midway between two adjacent ones, and never finer. Midpoint reading is exact for a human; quarter-position reading is not. Whenever any value sits at a midpoint, the axis label must state the precision — that note is what licenses the half-gridline read, and `validate.checkChart` rejects a midpoint value without it. Pie segments have a 10% floor, amended up from 5%, because a 5% wedge cannot be read to the precision the item requires.

Shared stimuli serve 3 to 7 questions, targeting 5. One table serving several questions is a cross-item structure, so the table has to belong to something that outlives the item and the item has to point at it.

## 5. Values

Numbers are drawn deliberately **awkward**. A round number invites mental arithmetic and skips the setup the item exists to force; 4,283 does not.

Formatting is natural per option — a set can legitimately carry 0.30%, 3.0%, 24%, 30% and 32% side by side. The one thing that must not happen is decimal variation singling out the correct answer. If the correct option's decimal count is unique in the set, and only then, the whole set is padded to the widest count present. The same guard applies in reverse: the answer may be a whole number, but not the only whole number.

## 6. Generation

The PRNG is pinned (mulberry32) and seeded, so any session is reproducible from its seed. Item seeds derive from the session seed by a prime stride; shared-stimulus seeds use a different prime so the two streams cannot collide.

Generation retries up to 50 times against validation. Fifty is generous — an archetype that regularly needs more than a handful has parameter ranges that are wrong, and the audit reports the rate per archetype.

Option ordering is applied after generation, not inside it, because ordering is a session setting rather than a property of the item.

## 7. Fixtures

Each archetype has one pinned fixture with injected parameters. Injecting parameters **pins the arithmetic and nothing else**: the fixture proves the formula, and the generator's own draws remain free. A fixture is not a substitute for the audit, which is the only thing that sees distributional defects.

## 8. Diagnostics

Two rules learned the hard way, both now enforced by the suite:

- **Every predicate must have a failing case.** A validator with no test that trips it is not known to fire. Several did not.
- **A diagnostic must exercise the code path the app actually runs.** A diagnostic that measures a different builder from the one a session uses reports a number that describes nothing. This happened more than once, which is why `test/run.js` now asserts that each audit section is registered in the manifest and emits rows.

## 9. Practice history

Exported practice history is personal data. `logs/*.csv` is gitignored and `test/run.js` asserts that rule holds, because an ignore rule is exactly the kind of thing a later tidy-up reverses with no visible symptom — and here the symptom would be publishing your own performance figures to a public repository.

The `logs/` directory itself is tracked, via `.gitkeep`, so the export has somewhere to land in a fresh clone.
