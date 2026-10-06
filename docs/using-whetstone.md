# Using Whetstone

A reference for everything the app does. Nothing here is required reading to use it — pick a format, pick a mode, start — but every non-obvious control is explained.

What each archetype tests, with an example of each, is in [question-library.md](question-library.md). For how the questions are built, see [design-rules.md](design-rules.md). For how the code is organised, see [architecture.md](architecture.md).

---

## Formats

Five. Two for numerical reasoning, two for logical reasoning, and one that mixes them.

| | Items | Time | Target per item | Archetypes |
| --- | --- | --- | --- | --- |
| **Problem Solving** | 18 | 25 min | 83 s | 36 |
| **Data Interpretation** | 20 | 15 min | 45 s | 11 |
| **Deductive Reasoning** | 12 | 18 min | 90 s | 4 |
| **Inductive Reasoning** | 15 | 18 min | 72 s | 3 |
| **Mixed Reasoning** | 24 | 36 min | 90 s | draws on the three above |

Problem Solving is prose word problems. Data Interpretation reads off tables and charts, often with one stimulus serving several questions in a row. Deductive Reasoning is orders, groups and if-then rules, where the question is what must follow. Inductive Reasoning is number, letter and figure series, where the question is what comes next. Mixed Reasoning is a third of each of the last three, interleaved, in one timed sitting. Every format offers a shorter run when you want a single sitting.

The logical formats leave out Classify: with three or four question types each, naming the type is not a skill worth drilling. Their Timed test mode has no back navigation, because timed reasoning tests of this kind rarely let you go back.

## Modes

Modes are **presets over the session options below**, not separate code paths. Anything a mode does, you can switch on or off yourself.

| Mode | What it is for |
| --- | --- |
| **Practice** | Learning the method. No clock, feedback after every question, back navigation on. |
| **Tempo** | Building speed. A per-item clock at the archetype's target pace, feedback still immediate. |
| **Timed test** | Measuring where you are. One session clock, feedback only at the end, blanks blocked, adaptive weighting off so the sample is unbiased. |
| **Classify** | Recognition drill. Ten seconds an item to *name* the question type without solving it. Recognising an archetype is most of solving it on a clock. |
| **Review due** | Whatever the scheduler has queued — see [Review scheduling](#review-scheduling). |

Classify keeps its own record, separate from mastery. Naming an archetype is not solving it, so letting recognition drills move your scores would corrupt the selection weights.

## Difficulty

Three bands. Each archetype declares which it appears in, so the counts beside each band are the archetypes in scope, not a share of the session.

- **Warm-up** — the shape of the item with the arithmetic kept light
- **Standard** — the working case
- **Hard** — awkward numbers, more steps, or a distractor set that punishes the obvious shortcut

An archetype often appears in two bands with different parameter ranges. Selecting a band filters the pool; it does not change how any individual item is scored.

## Groups

Ten topic groups: algebra, averages, charts, comparison, fractions, money, normalising, percentages, rates, series. Selecting none means all of them. A group showing `0` has nothing in the current format and difficulty combination and is disabled rather than hidden, so you can see the scope you are excluding.

The line under the setup box reads *N archetypes in scope · M flagged weak* — `M` counts archetypes in the current scope whose mastery is below the review threshold. If it says *one archetype only*, the no-repeat rule is off because it would otherwise deadlock.

## Session options

Thirteen toggles, under **Session options** on the setup screen. The header shows how many you have changed from the mode's defaults.

| Option | Effect |
| --- | --- |
| Setup box | An input for writing the expression before answering. Records how long comprehension took, separately from arithmetic. Off by default everywhere. |
| Back navigation | Return to earlier questions in the session |
| Option letters | A–E badges rather than bare radios |
| Per-item clock | Countdown for the current item at target pace |
| Session clock | Whole-session countdown |
| Instant feedback | Reveal correct or incorrect immediately rather than at the end |
| Allow skip | `Esc` moves on without answering |
| Block blanks | Refuse to advance on an unanswered item. Takes precedence over Allow skip where both are on. |
| Show archetype name | Name the question type on the question screen |
| Show option spread | After answering, show the gap between the two closest options |
| Adaptive weighting | Weight selection toward weak archetypes. Off means uniform. |
| Timer warning | Visual pulse in the final 60 seconds |
| Type the answer | Hide the options on numeric items and type the value instead, the way some online tests ask. A value that rounds to what an option shows counts as that option, so a typed wrong answer still names its mistake; one that matches nothing is recorded as unmatched. Label, month and verdict items are still answered by choosing. Off by default. |

**Option order** is a fourth choice alongside these:

- `ascending` — options sorted by value
- `shuffled` — uniform random
- `realistic` — mostly ascending, occasionally not

Order matters more than it looks. Under `shuffled`, position carries no information at all; under `ascending` it carries some. The audit's position diagnostics report both, so you can see what a given setting is worth to a guesser.

**Save as my preset** stores the current toggle set under a name you choose, so a configuration you like survives without re-deriving it. Presets are per-browser, like everything else.

## Review scheduling

Review due builds a session from the archetypes the scheduler thinks need revisiting, rather than sampling the pool. An archetype is due when either of two things is true:

- **Weak** — at least 3 attempts and mastery below 0.60. The attempt floor stops one bad item queueing an archetype.
- **Decayed** — it was at target (mastery 0.85 or better across at least 8 attempts) and you have not seen it for 14 days or more.

Something never attempted is never *due*: that is coverage, not review.

There is a deliberate gap between the two. An archetype between 0.60 and 0.85 with recent practice matches neither — not weak enough to queue, not at target so it cannot decay. That band is in progress, and adaptive weighting already over-samples it in ordinary sessions.

The queue is **one item per due archetype**. Below 8 due, a session that short is not worth opening, so each gets two items up to a cap of 16; at 8 or more it reverts to one each, capped at 20. The two items from one archetype are never consecutive, since answering the same type twice in a row tests recall of the last answer rather than the method.

Breadth is the point of this mode. Depth is what Tempo with adaptive weighting on is for.

## Mastery and selection

**Mastery** blends accuracy and pace, 70/30:

```
mastery = 0.7 × (correct + 2) / (attempts + 4)
        + 0.3 × min(targetSeconds × 1000 / medianMs, 1)
```

The `+2 / +4` is a prior. Raw accuracy is far too jumpy early on — one wrong answer out of one attempt is not zero ability. The speed term caps at 1, so being faster than target earns nothing further, and an unseen archetype is given 0.5 rather than dividing by an undefined median. Correct but slow still fails a timed test, which is why pace is in the score at all.

**At target** means mastery 0.85 or better across at least 8 attempts. Both conditions, so a short lucky run does not qualify.

**Selection weight** is `(1 − mastery) + staleness`, floored at 0.05:

```
staleness = 0.3 × min(days since last seen / 14, 1)
```

The floor means nothing ever disappears from the pool entirely. A per-archetype cap of 25% of session length stops one weak archetype swallowing a session, and no archetype appears twice in a row.

Turning **Focus on weak areas** off makes selection uniform. Timed test mode does this by default: a biased sample is fine for training and useless for measurement.

## Reporting a problem

**Report a problem** on the question screen, or `F`, opens a short form: pick what is wrong and add a note if you like. **Open a GitHub issue** then opens GitHub with the question, its options, your answer and the answer key already filled in, ready to submit; you need a free GitHub account. **Copy details** puts the same text on your clipboard instead. The session review has the same button under each question, and a reported question is marked in the review.

## Analytics

- **At target** — how many archetypes have cleared the bar, and the share of the library that represents
- **The weight table** — every archetype in scope with its attempts, mastery, selection weight and expected share of the next session. This is the model showing its working: if selection feels wrong, the reason is in this table.
- **Weakest right now** — lowest mastery first
- **Last 5 sessions** — date, format, mode, items, accuracy

The **streak** in the sidebar counts consecutive days with at least one non-abandoned session, ending today or yesterday.

## Sessions in progress

Leaving mid-session keeps the run. On return you are offered it back, and it is rebuilt **from the stored seed** rather than from saved question text — the same items, regenerated. Abandoning it discards the record; an abandoned session does not count toward the streak or mastery.

## Your data

Everything is local: no account, no server, no telemetry. Seven `whetstone:` keys in `localStorage` hold sessions, mastery, presets, flags, setup preferences, any run in progress, and Classify state. Clearing browser data clears all of it.

Analytics can export a CSV. It lands in `logs/`, which is gitignored — practice history is personal and does not belong in a repository.

## Keyboard

| Key | Action |
| --- | --- |
| `1`–`5` | Select an option (`1`–`8` in Classify) |
| `Enter` | Submit, or advance |
| `Esc` | Skip |
| `F` | Report a problem with the current question |

Keys are ignored while you are typing in the setup box, so a `3` in an expression is a 3.
