// Rebuild one question exactly, from the details in a report.
//
//   node tools/reproduce.mjs <question type> <seed> [tier]
//   node tools/reproduce.mjs a19 8814092 standard
//
// Prints the question as the report would show it, answer key included. Generation is seeded, so the
// same question type, seed and tier always rebuild the same question.
import { byId } from '../js/archetypes/index.js';
import { makeRng } from '../js/lib/rng.js';
import { buildItem } from '../js/session.js';
import { reportText } from '../js/report.js';

const [id, seedArg, tier = 'standard'] = process.argv.slice(2);
const arch = byId[id];
if (!arch || !seedArg) {
  console.error('usage: node tools/reproduce.mjs <question type> <seed> [tier]');
  process.exit(2);
}
if (typeof arch.generate !== 'function') {
  console.error(`${id} is built on a shared table, so it cannot be rebuilt alone; the report quotes the full table.`);
  process.exit(2);
}
const item = buildItem(arch, makeRng(Number(seedArg)), tier);
if (!item) { console.error(`${id} produced no valid question for seed ${seedArg} at ${tier}.`); process.exit(1); }
console.log(reportText({ item, name: arch.name, deskName: `format ${arch.desks[0]}`, mode: 'rebuilt', submitted: false }).body);
