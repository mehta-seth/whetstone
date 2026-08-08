// Headless Desk 02 run. The spec: "a 20-item session runs off 4 stimuli; first-question-on-
// stimulus timing is recorded separately from subsequent questions on the same stimulus."
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { buildStimulusItems } = await import('../../js/session.js');
const r = buildStimulusItems({ desk: 2, tier: 'standard', groups: [], length: 20,
  sessionSeed: 4412907, adaptive: true });
console.log(`items ${r.items.length}   stimuli ${r.stimuli.length}`);
for (const s of r.stimuli) console.log(`  ${s.id.padEnd(26)} ${s.count} questions`);
const byArch = {};
for (const it of r.items) byArch[it.archetypeId] = (byArch[it.archetypeId] ?? 0) + 1;
console.log('  archetype mix ', JSON.stringify(byArch));
console.log('  first-on-stimulus flags', r.items.map(i => i.firstOnStimulus ? 'F' : '.').join(''));
console.log('  every item carries a stimulusId:', r.items.every(i => !!i.stimulusId));
console.log('  stimulus groups are contiguous:',
  r.items.every((it, i) => i === 0 || it.stimulusId === r.items[i-1].stimulusId || it.firstOnStimulus));
