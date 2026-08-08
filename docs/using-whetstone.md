# Using Whetstone

A reference for everything the app does. Nothing here is required reading to use it — pick a format, pick a mode, start — but every non-obvious control is explained.

For how the questions themselves are built, see [design-rules.md](design-rules.md). For how the code is organised, see [architecture.md](architecture.md).

---

## Formats

Two, matching the two shapes numerical reasoning tests take.

| | Items | Time | Target per item | Archetypes |
| --- | --- | --- | --- | --- |
| **Problem Solving** | 18 | 25 min | 83 s | 36 |
| **Data Interpretation** | 20 | 15 min | 45 s | 11 |

Problem Solving is prose word problems. Data Interpretation reads off tables and charts, often with one stimulus serving several questions in a row. Both offer a 10-item run when you want a single sitting.

## Modes

Modes are **presets over the session options below**, not separate code paths. Anything a mode does, you can switch on or off yourself.

| Mode | What it is for |
| --- | --- |
| **Practice** | Learning the method. No clock, feedback after every question, back navigation on. |
| **Tempo** | Building speed. A per-item clock at the archetype's target pace, feedback still immediate. |
| **Exam** | Measuring where you are. One session clock, feedback only at the end, blanks blocked, adaptive weighting off so the sample is unbiased. |
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

Twelve toggles, under **Session options** on the setup screen. The header shows how many you have changed from the mode's defaults.

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

Turning **Adaptive weighting** off makes selection uniform. Exam mode does this by default: a biased sample is fine for training and useless for measurement.

## Flagging

`F` flags the current item. A flag records the archetype and **the item's seed**, so a flagged question can be regenerated exactly — the same numbers, not merely the same type. That is what makes a bad item reportable, and it is why the issue template asks for the seed.

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
| `F` | Flag the current item |

Keys are ignored while you are typing in the setup box, so a `3` in an expression is a 3.
