# Contributing

Thanks for looking. This is a small, deliberately dependency-free project, so contributing is mostly a matter of keeping it that way.

## Ground rules

- **No dependencies.** The project has none and should keep none. If something needs a library, it probably needs to be smaller instead.
- **No build step.** The browser loads `js/app.js` as a native ES module. Anything that requires compilation, bundling or transpilation is out of scope.
- **Both commands must pass.** `npm test` must be green, and `npm run audit` must run without throwing.
- **Every tunable number goes in `js/lib/constants.js`.** No magic numbers in archetypes or renderers.

## Setting up

```bash
git clone https://github.com/mehta-seth/whetstone.git
cd whetstone
npm start        # serve on :8000 (Node standard library, no install)
npm test         # the suite
npm run audit    # writes audit/audit.html
```

Nothing to install.

## Adding a question archetype

This is the most likely contribution, and it has its own guide: [docs/adding-an-archetype.md](docs/adding-an-archetype.md). In short — a new module in `js/archetypes/`, one import line in `index.js`, and one pinned fixture in `test/fixtures.json`.

An archetype is not finished when it generates a plausible question. It is finished when the audit report shows its constraint rejection rates are sane, its answer is not sitting in the same option slot every time, and its answer is not recoverable from the largest number on screen. `docs/adding-an-archetype.md` explains how to read those sections.

## Changing shared code

`js/lib/` is used by all 47 archetypes, so a change there can alter every item in the library. The fixture suite exists to catch exactly that: each archetype has a pinned fixture with a known seed and an expected option set, so an unintended change fails immediately and names the archetype.

If a fixture legitimately needs to change, update it in the same commit as the code change and say why in the commit body.

## Style

- `.editorconfig` covers the mechanics: two-space indentation, LF, final newline, no trailing whitespace.
- Match the surrounding code. There is no linter, on purpose.
- Comments should explain *why* a rule exists, not restate what the line does. The codebase leans heavily on this and it is worth preserving.
- All colour, spacing and type values belong in `css/tokens.css`.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `style:`, `perf:`, `chore:`, with an optional scope such as `feat(library):` or `fix(charts):`.

One capability or one fix per commit. If the subject line needs "and", it is probably two commits.

## Reporting a problem with a question

Sessions are reproducible from their seed, so include the seed and the archetype ID (shown on the feedback screen). With those two things a bad item can be regenerated exactly; without them it usually cannot be found.
