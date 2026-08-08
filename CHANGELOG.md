# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The `localStorage` schema and the archetype contract are treated as public
interfaces: a breaking change to either is a major version bump.

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
