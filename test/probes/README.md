# Probes

Investigation scripts. **These are not tests** — `test/run.js` is the suite.

Probes are the expensive measurements that some of the suite's assertions were
derived from. The suite runs a cheap version at low `n` and points here for the
full sweep, so a number in an assertion can always be traced to the thing that
produced it.

| Script | What it measures |
| --- | --- |
| `option-algebra.mjs` | Whether the answer is recoverable by algebra on the other four options |
| `directional-attacks.mjs` | Whether directional heuristics ("pick the largest") beat chance |
| `path-divergence.mjs` | Whether two derivation paths through a stimulus agree |
| `estimation-route-hit-rate.mjs` | How often an estimation route lands on the correct option |
| `data-interp-session.mjs` | Builds a full data-interpretation session for inspection |
| `build-single-item.mjs` | Builds one item from one archetype |
| `chart-harness.mjs` | Renders chart stimuli in isolation |
| `slot-reach.mjs` | Which numeric archetypes can put the answer in slot 1 or 5 at all; the audit cites it |

Run any of them directly:

```bash
node test/probes/option-algebra.mjs
```
