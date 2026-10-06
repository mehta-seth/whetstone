# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The `localStorage` schema and the archetype contract are treated as public
interfaces: a breaking change to either is a major version bump.

## [1.2.0] - 2026-10-06

The first public release since 1.0.0. It includes the changes listed under 1.1.0 and 1.1.1, which
were not published separately.

### Added

- **Report a problem**, on every question and in the session review. It opens a GitHub issue with
  the question, the options, your answer and the answer key filled in, or copies the same details for
  anyone without an account. `F` opens it too.
- **One-click starts.** Every practice area on the home screen has Practise, a short untimed session
  with explanations, and Timed test, the full set against one clock.
- **An About page**, and a home screen written for someone arriving for the first time.
- **A live site**, published to GitHub Pages by `.github/workflows/pages.yml` once the tests pass.
- `tools/reproduce.mjs`, which rebuilds a reported question from its question type, seed and tier.
- Issue forms for wrong questions, bugs and ideas; a pull request checklist; CONTRIBUTING.md and a
  code of conduct.

### Changed

- Plain language throughout the site: question types rather than archetypes, mastered rather than at
  target, Timed test rather than Exam, Mixed Reasoning rather than General Ability.
- The README now describes the practice site first and how the questions are made second.
- No streak is shown until there is one.

## [1.1.1] - 2026-10-05

A first-principles audit: every archetype read as a candidate would read it, the charts and figures
rendered and looked at, and the session layer re-checked. Every defect below passed the full test
suite before it was found.

### Fixed

- **`d13` asked about a year with no data.** The question named 2022, the price-index year, while
  every figure on the table and in the worked answer was 2024. A destructure took the second of
  three years after the index row was added.
- **`a08` filled vessels past the brim.** "5/6 full, and must end up holding 50% more" is 5/4 of a
  vat. Amounts are now measured in barrels and gallons, so a target above one is an amount, not an
  overflow. The specification's own fixture had the same flaw.
- **`d05` named the wrong number as the tax.** The option labelled "the tax itself" was 15% of the
  tax-inclusive total, which is neither the tax nor the net price. It is now the tax.
- **`c02` let the share shortcut land on the answer.** Two segments could tie on the largest rise in
  share, one of them the answer. Every shortcut role must now be a unique extreme. The stem also
  stopped announcing the trap ("a category can take a smaller share of a larger number").
- **`c02` legend.** Each pie drew its own legend at a fixed offset, so the first sat on top of the
  second pie and the second was off the canvas. One shared legend now sits below both.
- **`a17` axis label.** The precision note that licenses reading a bar at a half gridline was cut off
  at the top of the axis. Long axis labels now break onto a second line.
- **`d14` swimmers at six times the world record.** Leg speeds are now held to what rowing,
  running and swimming can do.
- **`a12` mislabelled a shortcut.** The cheapest-licence package was recorded as filler in items
  that dropped the licence role, so picking it never reached the analytics as `headline-price`.
- **`a10` asked about a different stage.** The stem gave rejection rates at screening and asked who
  passed the online assessment. The stage is now named the same way in both.
- **Wording.** "1 shelf tags" (`a03`), "needs torque driver" (`a04`), "At January" and "Dairies's"
  (`a19`), a mean "a week across 5 weeks" followed by figures for Monday to Thursday (`d08`), "across
  10 people" in a kiln works (`d09`), "the number of Other" (`b02` `b03` `b04`), "tyres at £2.17" and
  "sells tyre" (`b06`), "Textiles's" (`l01` `l02`), "the tenants's share" (`d16`), and a worked
  answer printing 5.333333333333333 hours (`a09`).
- **`a18`** now says the stated total includes the warranty bonuses, which an attentive reader could
  otherwise exclude.
- **`a19`** wrote its point difference backwards in the worked answer.
- **`d17`** explained rooting by n - 1 as "the count of figures", which is n + 1.
- **`i02`** no longer offers a letter already in the series, and no longer builds one-letter-step
  series, whose off-by-one distractor was the last letter shown.
- **`a03`** states its convention: "18% faster" is read as 18% less time, and the strict reading,
  dividing by 1.18, is shown in the worked answer since it is not among the options.
- **Typed answers** for counts and series terms must be whole: 96.4 no longer scores as "96 pads".
- **Analytics** no longer ranks "filler" as a mistake family. Filler picks and typed answers that
  match no option are grouped as unmodelled.
- **The streak** counts local calendar days, so a session after midnight in a British summer is not
  booked to the day before.

## [1.1.0] - 2026-10-05

### Added

- **Logical reasoning.** Two new formats and seven archetypes. Deductive Reasoning: sequencing
  (`l01`), what must or cannot be true (`l02`), grouping (`l03`) and conditional reasoning (`l04`).
  Inductive Reasoning: number series (`i01`), letter and code series (`i02`) and figure series
  (`i03`), with a new SVG figure renderer.
- **A mixed format**, data interpretation, deductive and inductive items in thirds, 24 items in 36
  minutes.
- **Type the answer**, a session option that hides the options on numeric items and takes a typed
  value. A typed value is matched to the option it rounds to, so a wrong answer is still
  error-typed; one matching nothing is recorded as unmatched.
- **An independent reader** in `test/logical.mjs` that re-solves every deductive item with its own
  semantics and enumeration, recomputes every series, and re-derives every figure rule.
- `test/probes/slot-reach.mjs`, restored: `audit/build.js` already cited it.

### Changed

- The audit renders clues and figures, pools answer position for every desk, and counts the new
  archetypes in its section manifest.
- Version 1.1.0. The storage schema gains two optional response fields, `typedText` and
  `unmatched`; nothing existing changes meaning, so this is not a breaking change.

### Fixed

- Phrases left ungrammatical by the comment rewrite before 1.0.0.

## [1.0.0] — 2026-08-07

First public release.

### Features

- **Question library** — 47 archetypes across ten answer types and ten topic
  groups, every item generated at run time from a seeded PRNG rather than
  drawn from a bank.
- **Two session formats** — Problem Solving (18 items, 25 minutes) and Data
  Interpretation (20 items, 15 minutes), with shorter runs available in both.
- **Five modes** — untimed practice, per-item pacing, full timed sitting, an
  archetype-recognition drill, and a scheduled review queue.
- **Item validation** — every generated item is checked against the option-set
  invariants before it is shown, and discarded if it fails.
- **Adaptive selection** — a mastery model blending accuracy and pace, with
  staleness decay, a weight floor, and a per-archetype share cap.
- **Estimation routes** — 13 archetypes show the approximate path to the
  answer alongside the exact one, with a precision statement derived from the
  option geometry.
- **Charts** — SVG bar, grouped-bar and pie stimuli, with accessible names.
- **Shared stimuli** — one table serving three to seven questions, for the
  data-interpretation format.
- **Analytics** — per-archetype mastery, error-type breakdown, and CSV export
  of practice history.
- **Statistical audit report** — `npm run audit` generates hundreds of items
  per archetype and reports constraint rejection rates, answer-position skew,
  answer rank against visible input columns, estimation resolvability, and
  formatting tells.

- **Theming** — light and dark, automatic via `prefers-color-scheme`. Every
  value flows through the token set in `css/tokens.css`, including the chart
  palette, so restyling happens in one file.
- **Accessibility** — full keyboard operation, a skip link, `prefers-reduced-motion`
  honoured globally, `role="img"` with generated accessible names on charts, and
  tabular figures so columns of numbers align.

### Notes

- No dependencies, no lockfile, no build step. `package.json` exists only so
  that Node treats `.js` as ESM for the test runner and audit generator. The dev
  server is Node standard library, so Node is the only runtime required.
- Fixture-driven test suite: one pinned fixture per archetype, plus unit
  coverage of the generation primitives. CI runs it on Node 18, 20 and 22.
- All practice data is local. Nothing leaves the browser, and exported CSVs are
  gitignored so performance history never reaches the repository.
