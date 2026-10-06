# Contributing to Whetstone

Thanks for helping. The most useful contribution is a report of a question that is wrong, unclear or
hard to read: use **Report a problem** on the question screen, which fills the issue in for you.

## Setting up

```bash
git clone https://github.com/mehta-seth/whetstone.git
cd whetstone
npm start        # the app, on http://localhost:8000
npm test         # the test suite, over 800 checks, under a minute
npm run audit    # generates questions for every type and writes audit/audit.html
```

Node 18 or later is the only requirement. There are no dependencies to install and no build step, and
that is deliberate: the site must keep working for years without maintenance.

## How the project fits together

| Where | What |
| --- | --- |
| `index.html`, `css/`, `js/app.js`, `js/render.js` | The site: routing, screens, keyboard |
| `js/session.js`, `js/adaptive.js`, `js/store.js` | Sessions, the choice of question types, saved progress |
| `js/archetypes/` | One file per question type (internally, an *archetype*) |
| `js/lib/` | Shared building blocks: random numbers, options, validation, tables, charts, logic, series, figures |
| `js/report.js` | Report a problem: the issue text and the GitHub link |
| `test/run.js`, `test/logical.mjs` | The test suite |
| `audit/build.js` | The statistical audit |
| `tools/serve.js`, `tools/reproduce.mjs` | The local server, and a tool to rebuild a reported question |

[docs/architecture.md](docs/architecture.md) goes deeper.

## Fixing a reported question

1. Rebuild it from the report: `node tools/reproduce.mjs <question type> <seed> <tier>`. The command is
   in the issue, under *For the maintainer*.
2. Find the cause. Most problems are in one question type's file in `js/archetypes/`.
3. Add a check to `test/logical.mjs`, in *content regressions found by reading items*, that fails on the
   old behaviour, so the mistake cannot return.
4. Run `npm test` and `npm run audit`. The audit must still exit cleanly.

## Adding or changing a question type

Read [docs/design-rules.md](docs/design-rules.md) and
[docs/adding-an-archetype.md](docs/adding-an-archetype.md) first. The rules that matter most:

- The correct answer is computed from the question type's own definition, never searched for.
- Every wrong option is a named mistake applied to the question, never a random nudge from the answer.
- Questions are reproducible from their seed.
- A change that alters a pinned example in `test/fixtures.json` is either a bug, or a deliberate change
  to a wrong option whose reason goes in the example's label.

## Writing for the site

- Plain language. People see "question type", not "archetype".
- British spelling: practise as a verb, practice as a noun.
- No em dashes.
- The project is independent. Do not name commercial test providers or their products anywhere.

## Releasing

Bump `APP_VERSION` in `js/lib/constants.js` and `version` in `package.json` together (a test checks
they match), add an entry to [CHANGELOG.md](CHANGELOG.md), and tag the commit. Every push to `main`
that passes the tests is published to the live site.
