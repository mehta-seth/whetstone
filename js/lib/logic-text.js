// The English for the deductive desk, kept apart from the semantics in logic.js.
//
// A clue is written once as semantics and once as words, and never in the same function. That
// separation is what lets test/run.js check the words against an independent reading of them: a
// template that says "earlier" while the semantics says "the day before" is a wrong item that every
// enumeration would pass.
import { WEEKDAYS, COMPANIES, numberWord, cap, listJoin } from './logic.js';

// Sequencing scenarios. Each supplies the verb forms its clues need, so "is interviewed" and
// "presents" both read naturally without a grammar engine.
// "Ashby Foods'" rather than "Ashby Foods's". People's names keep 's.
const poss = n => (/s$/.test(n) && n.includes(' ') ? `${n}'` : `${n}'s`);

export const SEQ_SCENARIOS = [
  {
    id: 'standup',
    intro: names => `Five analysts, ${listJoin(names)}, each give one update at next week's team stand-up. `
      + 'There is exactly one update each day, Monday to Friday.',
    on: (a, d) => `${a} presents on ${d}`,
    notOn: (a, d) => `${a} does not present on ${d}`,
    before: (a, b) => `${a} presents on an earlier day than ${b}`,
    dayBefore: (a, b) => `${a} presents the day before ${b}`,
    gap: (a, b, k) => `There ${k === 1 ? 'is' : 'are'} exactly ${numberWord(k)} day${k === 1 ? '' : 's'} between ${poss(a)} update and ${poss(b)} update`,
    end: a => `${a} presents on either Monday or Friday`,
    either: (a, d1, d2) => `${a} presents on either ${d1} or ${d2}`,
    apartDays: (a, b) => `${a} and ${b} do not present on consecutive days`,
    adjacent: (a, b) => `${a} and ${b} present on consecutive days`,
    who: d => `Who presents on ${d}?`,
    when: a => `On which day does ${a} present?`,
    people: true,
  },
  {
    id: 'deliveries',
    intro: names => `Five suppliers, ${listJoin(names)}, each make one delivery to the warehouse next week. `
      + 'There is exactly one delivery each day, Monday to Friday.',
    on: (a, d) => `${a} delivers on ${d}`,
    notOn: (a, d) => `${a} does not deliver on ${d}`,
    before: (a, b) => `${a} delivers on an earlier day than ${b}`,
    dayBefore: (a, b) => `${a} delivers the day before ${b}`,
    gap: (a, b, k) => `There ${k === 1 ? 'is' : 'are'} exactly ${numberWord(k)} day${k === 1 ? '' : 's'} between ${poss(a)} delivery and ${poss(b)} delivery`,
    end: a => `${a} delivers on either Monday or Friday`,
    either: (a, d1, d2) => `${a} delivers on either ${d1} or ${d2}`,
    apartDays: (a, b) => `${a} and ${b} do not deliver on consecutive days`,
    adjacent: (a, b) => `${a} and ${b} deliver on consecutive days`,
    who: d => `Which supplier delivers on ${d}?`,
    when: a => `On which day does ${a} deliver?`,
    people: false,
  },
  {
    id: 'interviews',
    intro: names => `Five candidates, ${listJoin(names)}, are each interviewed once next week. `
      + 'There is exactly one interview each day, Monday to Friday.',
    on: (a, d) => `${a} is interviewed on ${d}`,
    notOn: (a, d) => `${a} is not interviewed on ${d}`,
    before: (a, b) => `${a} is interviewed on an earlier day than ${b}`,
    dayBefore: (a, b) => `${a} is interviewed the day before ${b}`,
    gap: (a, b, k) => `There ${k === 1 ? 'is' : 'are'} exactly ${numberWord(k)} day${k === 1 ? '' : 's'} between ${poss(a)} interview and ${poss(b)} interview`,
    end: a => `${a} is interviewed on either Monday or Friday`,
    either: (a, d1, d2) => `${a} is interviewed on either ${d1} or ${d2}`,
    apartDays: (a, b) => `${a} and ${b} are not interviewed on consecutive days`,
    adjacent: (a, b) => `${a} and ${b} are interviewed on consecutive days`,
    who: d => `Who is interviewed on ${d}?`,
    when: a => `On which day is ${a} interviewed?`,
    people: true,
  },
];

export const scenarioNames = (rng, S, drawNames) => S.people ? drawNames(rng, 5)
  : rng.shuffle(COMPANIES).slice(0, 5).sort();

// One clue as a sentence, without the full stop, so it can be quoted inside an option note.
export function seqSentence(c, S, names) {
  const N = i => names[i], D = i => WEEKDAYS[i];
  switch (c.type) {
    case 'before':    return S.before(N(c.a), N(c.b));
    case 'dayBefore': return S.dayBefore(N(c.a), N(c.b));
    case 'on':        return S.on(N(c.a), D(c.d));
    case 'notOn':     return S.notOn(N(c.a), D(c.d));
    case 'gap':       return S.gap(N(c.a), N(c.b), c.k);
    case 'end':       return S.end(N(c.a));
    case 'either':    return S.either(N(c.a), D(Math.min(c.d1, c.d2)), D(Math.max(c.d1, c.d2)));
    case 'apartDays': return S.apartDays(N(c.a), N(c.b));
    case 'adjacent':  return S.adjacent(N(c.a), N(c.b));
    default: throw new Error(`no wording for sequencing clue ${c.type}`);
  }
}

// How a misreading is described in the option note, quoting the clue it came from.
export function misreadNote(errorType, sentence, k) {
  switch (errorType) {
    case 'missed-clue':          return `left out "${sentence}"`;
    case 'reversed-order':       return `reversed the order in "${sentence}"`;
    case 'next-read-as-earlier': return `read "${sentence}" as any earlier day rather than the day immediately before`;
    case 'gap-off-by-one':       return `read "exactly ${numberWord(k)} day${k === 1 ? '' : 's'} between" as ${numberWord(k)} day${k === 1 ? '' : 's'} apart`;
    case 'missed-negation':      return `missed the "not" in "${sentence}"`;
    case 'converse-conditional': return `read "${sentence}" backwards, as if the second half implied the first`;
    default:                     return `misread "${sentence}"`;
  }
}

// Grouping scenarios. Two labelled teams of three.
export const GRP_SCENARIOS = [
  {
    id: 'projects',
    teams: ['the North team', 'the South team'],
    intro: names => `Six new joiners, ${listJoin(names)}, are split into two project teams of three: `
      + 'the North team and the South team.',
  },
  {
    id: 'shifts',
    teams: ['the early shift', 'the late shift'],
    intro: names => `Six nurses, ${listJoin(names)}, are rostered for Saturday. Three work the early `
      + 'shift and three work the late shift, and nobody works both.',
  },
  {
    id: 'offices',
    teams: ['the Leeds office', 'the Bristol office'],
    intro: names => `Six graduates, ${listJoin(names)}, are placed in two offices, three in the Leeds `
      + 'office and three in the Bristol office.',
  },
];

// "is on" reads for teams and for shifts alike once the team label carries its article.
const onPhrase = (S, t) => S.id === 'shifts' ? `works ${S.teams[t]}` : S.id === 'offices'
  ? `is placed in ${S.teams[t]}` : `is on ${S.teams[t]}`;

export function grpSentence(c, S, names) {
  const N = i => names[i];
  switch (c.type) {
    case 'same':   return S.id === 'shifts' ? `${N(c.a)} and ${N(c.b)} work the same shift`
      : S.id === 'offices' ? `${N(c.a)} and ${N(c.b)} are placed in the same office`
      : `${N(c.a)} and ${N(c.b)} are on the same team`;
    case 'diff':   return S.id === 'shifts' ? `${N(c.a)} and ${N(c.b)} do not work the same shift`
      : S.id === 'offices' ? `${N(c.a)} and ${N(c.b)} are not placed in the same office`
      : `${N(c.a)} and ${N(c.b)} are not on the same team`;
    case 'on':     return `${N(c.a)} ${onPhrase(S, c.t)}`;
    case 'ifThen': return `If ${N(c.a)} ${onPhrase(S, c.s)}, then ${N(c.b)} ${onPhrase(S, c.t)}`;
    default: throw new Error(`no wording for grouping clue ${c.type}`);
  }
}

export const grpPartnerQuestion = (S, x) => S.id === 'shifts' ? `Who must work the same shift as ${x}?`
  : S.id === 'offices' ? `Who must be placed in the same office as ${x}?`
  : `Who must be on the same team as ${x}?`;

export const grpSuppose = (S, y, t) => `Suppose ${y} ${onPhrase(S, t)}.`;

export const sentence = s => cap(s) + '.';
