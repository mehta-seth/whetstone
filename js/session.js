// Builds the item list and runs the session loop.
import { makeRng } from './lib/rng.js';
import { reorder } from './lib/options.js';
import { item as validItem, checkItem } from './lib/validate.js';
import { GENERATE_MAX_ATTEMPTS, ITEM_SEED_STRIDE, CLASSIFY_SECONDS, CLASSIFY_CHOICES, STIMULUS_QUESTIONS_MIN, STIMULUS_QUESTIONS_MAX, STIMULUS_QUESTIONS_TARGET, STIMULUS_SEED_STRIDE } from './lib/constants.js';
import { makeStimulus, stimulusSeed, FAMILY_SUPPORT } from './lib/stimulus.js';
import { archetypes, forDesk } from './archetypes/index.js';
import { selectArchetypes, reviewDue, reviewPlan } from './adaptive.js';
import * as store from './store.js';
import { skipAllowed } from './toggles.js';

export const DESKS = {
  1: { id: 1, eyebrow: 'PROBLEM SOLVING', name: 'Problem Solving',
       purpose: 'Word problems under the clock.',
       items: 18, minutes: 25, seconds: 83, lengths: [10, 18, 20] },
  2: { id: 2, eyebrow: 'DATA INTERPRETATION', name: 'Data Interpretation',
       purpose: 'Tables and charts. Twenty items in fifteen minutes.',
       items: 20, minutes: 15, seconds: 45, lengths: [10, 20] },
};

export const inScope = ({ desk, tier, groups }) => forDesk(desk).filter(a =>
  (!tier || a.tiers.includes(tier)) && (!groups?.length || groups.includes(a.group)));

export const groupsForDesk = desk => {
  const counts = {};
  for (const a of forDesk(desk)) counts[a.group] = (counts[a.group] ?? 0) + 1;
  return Object.entries(counts).sort((a, b) => a[0] < b[0] ? -1 : 1);
};

// Fifty attempts is generous. If an archetype regularly needs more than five its
// parameter ranges are wrong. The audit reports the rate per archetype.
export function buildItem(archetype, rng, tier) {
  for (let attempt = 0; attempt < GENERATE_MAX_ATTEMPTS; attempt++) {
    let candidate = null;
    try { candidate = archetype.generate(rng, tier); }
    catch (e) { console.warn(`whetstone: ${archetype.id} threw`, e); candidate = null; }
    if (candidate && validItem(candidate)) return candidate;
    if (candidate) console.warn(`whetstone: ${archetype.id} failed validate`, checkItem(candidate));
  }
  return null;
}

// Desk 02. One table serves 3 to 7 questions, so the item list is planned as a list of stimuli
// and then filled, rather than sampled item by item.
//
// THE ADAPTIVE ENGINE STILL DRIVES IT, at one remove. selectArchetypes runs first and produces
// exactly the plan it would produce on Desk 01, honouring the mastery weights and the 25% cap.
// Only the grouping is new: the plan is partitioned into stimuli by which family each archetype
// can run off, and any stimulus short of the three-question minimum is topped up from the
// archetypes that support its family.
//
// SO DESK 02 ADAPTATION IS COARSER THAN DESK 01'S, unavoidably. A nutrition stimulus can only
// ever be b01 and b05, whatever their mastery scores say, so a weak archetype drags its
// family-mates in with it. The realised share therefore deviates from the weight table's
// prediction, and the deviation is a property of shared stimuli rather than a bug. Recorded as
// blocker B4. The spec does not contemplate it.
//
// PAIRS ARE EXEMPT FROM the spec's NO-CONSECUTIVE-REPEAT RULE. b06 and b07 both mandate a matched
// pair off one stimulus placed close together, which is the same archetype twice in a row by
// definition. The rule is applied between pairs instead.
export function buildStimulusItems({ desk, tier, groups, length, sessionSeed, adaptive }) {
  const pool = inScope({ desk, tier, groups });
  if (!pool.length) return { items: [], pool, stimuli: [] };

  const plan = selectArchetypes({
    pool, length, masteryMap: store.mastery(), adaptive, rng: makeRng(sessionSeed),
  });

  // Not every Desk 02 archetype consumes a shared table. A chart archetype OWNS its
  // stimulus: c01's pie belongs to one question and there is nothing for a second question to read
  // off it. Those archetypes declare `generate` and no `build`, and the partition below routes
  // everything through `buildOnStimulus`, which returns null the moment `build` is missing. So a
  // chart archetype appeared in `inScope`, contributed a group pill to the setup screen, and could
  // never be selected into a session. Silently unreachable rather than visibly broken, which is the
  // worse failure of the two.
  //
  // They are pulled out here and built through the same plain loop Desk 01 uses, each becoming its
  // own single-question stimulus. `wantStimuli` counts only the shared ones, so a session with two
  // chart items and four tables reports six stimuli, which is what it is.
  const selfContained = plan.filter(a => typeof a.build !== 'function');
  const shared = plan.filter(a => typeof a.build === 'function');
  const soloItems = [];
  for (const [i, arch] of selfContained.entries()) {
    const rng = makeRng(sessionSeed + (i + 1) * STIMULUS_SEED_STRIDE);
    const built = buildItem(arch, rng, tier);
    if (!built) continue;
    const one = Array.isArray(built) ? built[0] : built;
    soloItems.push({ ...one, stimulusId: one.stimulusId ?? `${arch.id}s#${one.seed}`,
      stimulusIndex: 0, firstOnStimulus: true });
  }

  // Partition the plan into stimuli. Greedy on coverage: the family that can host the most of
  // what is left goes first. The slice is capped at the TARGET rather than the maximum, because
  // packing every stimulus to seven would give three stimuli for a twenty-item session and
  // The spec asks for four. Four tables read is a different session from three.
  const sharedLength = Math.max(0, length - soloItems.length);
  const wantStimuli = Math.max(1, Math.round(sharedLength / STIMULUS_QUESTIONS_TARGET));
  const perStimulus = Math.min(STIMULUS_QUESTIONS_MAX,
    Math.max(STIMULUS_QUESTIONS_MIN, Math.ceil(Math.max(1, sharedLength) / wantStimuli)));
  // The spec's cap, computed the same way it is for Desk 01. Enforced again here because the top-up
  // and the substitute-on-failure paths can both re-add an archetype the plan already used.
  const shareCap = Math.max(Math.ceil(0.25 * length), Math.ceil(length / pool.length));
  const used = {};
  const remaining = [...shared];
  const groupsOfWork = [];
  const families = Object.keys(FAMILY_SUPPORT);
  while (remaining.length) {
    let best = null;
    for (const family of families) {
      const take = remaining.filter(a => a.families?.includes(family));
      if (!take.length) continue;
      const fresh = groupsOfWork.every(g => g.family !== family) ? 1 : 0;
      const score = take.length + fresh * 100;
      if (!best || score > best.score) best = { family, take, score };
    }
    if (!best) break;                        // nothing left that any family can host
    // Once the target number of stimuli exists, leftovers join an existing one rather than
    // spawning a sixth table. Four tables read is a different session from six.
    if (groupsOfWork.length >= wantStimuli) {
      const host = groupsOfWork.find(g =>
        g.archetypes.length < STIMULUS_QUESTIONS_MAX
        && remaining.some(a => a.families?.includes(g.family)));
      if (host) {
        const move = remaining.filter(a => a.families?.includes(host.family))
          .slice(0, STIMULUS_QUESTIONS_MAX - host.archetypes.length);
        for (const a of move) remaining.splice(remaining.indexOf(a), 1);
        host.archetypes.push(...move);
        if (move.length) continue;
      }
      // PROBLEM 1's SECOND CAUSE. Falling through rather than breaking.
      //
      // This used to `break` when no existing table could host what was left, which silently
      // DISCARDED every remaining archetype. It bites hardest where the stimulus target is small
      // and the families are disjoint: at Desk 02 hard with a 10-item request, wantStimuli is 1,
      // so after the first table b05 and b08 belong to families no existing table serves, no host
      // matches, and both were dropped. That alone made a 10-item hard run 100% short, and
      // it is why regenerating the stimulus fixed the 20-item case and not this one.
      //
      // wantStimuli is a preference, stated as "four tables read is a different session from six",
      // not a hard limit. A fifth table is a smaller cost than a session that is 40% shorter than
      // the one you asked for, so the preference yields.
    }
    const slice = best.take.slice(0, perStimulus);
    for (const a of slice) remaining.splice(remaining.indexOf(a), 1);
    groupsOfWork.push({ family: best.family, archetypes: slice });
  }

  // Top up anything below the three-question minimum from that family's own supporters, so no
  // stimulus is read for the sake of one or two questions.
  for (const g of groupsOfWork) {
    const supporters = pool.filter(a => a.families?.includes(g.family));
    let guard = 0;
    while (g.archetypes.length < Math.min(STIMULUS_QUESTIONS_MIN, supporters.length * 2) && guard++ < 20) {
      g.archetypes.push(supporters[g.archetypes.length % supporters.length]);
    }
  }

  const items = [];
  const stimuli = [];
  // PROBLEM 1. THE RETRY IS OUTSIDE THE FILL, not inside it.
  //
  // This loop used to build one table and then try to read it, retrying only when `makeStimulus`
  // returned null, which it does for 0% to 0.3% of draws. The real failure is different: the table
  // comes back fine and then the archetype cannot meet its constraints ON that table. Measured on a
  // table already fixed, b04 builds on 66% of regional tables, b08 on 66% of retail, b02 on 70%.
  // `buildOnStimulus` retries the archetype's own rng fifty times, which cannot fix a table that
  // lacks the properties the archetype needs, so the stimulus was skipped and the session came up
  // short. At hard tier each family has exactly one eligible archetype, so a single failure lost
  // the whole table and the substitution path had nobody to substitute.
  //
  // Measured before this change, 40 seeds a config:
  //   desk 2 hard, 10 items    100% short, as few as 1 item delivered
  //   desk 2 hard, 20 items     48% short, as few as 10
  //   desk 2 standard, 10 items    28% short, as few as 5
  //   desk 1, every config           0% short
  //
  // So a Desk 02 exam was not a measurement. The deeper fix is for `makeStimulus` to take the
  // archetype list and satisfy their joint constraints, which is what the civic family already does
  // for d13 and d18; this is the general version that needs no per-family work.
  //
  // A failed attempt must not leave a mark, so each one tallies against a COPY of the share counts
  // and only the attempt that is kept updates the real one.
  const fillOne = (g, stimulus, supporters, startedAt, usedIn, want) => {
    const usedTry = { ...usedIn };
    const out = [];
    for (const arch of g.archetypes) {
      if (out.length >= want) break;
      const seed = sessionSeed + (startedAt + out.length) * ITEM_SEED_STRIDE;
      const room = a => (usedTry[a.id] ?? 0) + (a.emitsPair ? 2 : 1) <= shareCap;
      let chosen = room(arch) ? arch : null;
      let built = chosen ? buildOnStimulus(chosen, stimulus, makeRng(seed), tier) : null;
      if (!built) {
        // Either that archetype is at its share cap, or it cannot meet its constraints on this
        // table. Try the others that support the family before giving up on the table.
        for (const alt of supporters) {
          if (alt.id === arch.id || !room(alt)) continue;
          built = buildOnStimulus(alt, stimulus, makeRng(seed + 1), tier);
          if (built) { chosen = alt; break; }
        }
      }
      if (!built) continue;
      usedTry[chosen.id] = (usedTry[chosen.id] ?? 0) + built.length;
      out.push(...built);
    }
    return { items: out, usedTry };
  };

  for (let s = 0; s < groupsOfWork.length; s++) {
    const g = groupsOfWork[s];
    const supporters = pool.filter(a => a.families?.includes(g.family));
    const startedAt = items.length;
    const want = Math.min(perStimulus, sharedLength - items.length);
    if (want <= 0) break;

    // Up to eight tables. The first that fills the target is taken; otherwise the fullest, because
    // three questions off a table is still better than none.
    let best = null;
    for (let retry = 0; retry < 8; retry++) {
      const stimulus = makeStimulus({
        family: g.family,
        rng: makeRng(stimulusSeed(sessionSeed, s) + retry * 101),
      });
      if (!stimulus) continue;
      const attempt = fillOne(g, stimulus, supporters, startedAt, used, want);
      if (!best || attempt.items.length > best.attempt.items.length) best = { stimulus, attempt };
      if (attempt.items.length >= want) break;
    }
    if (!best || !best.attempt.items.length) continue;

    Object.assign(used, best.attempt.usedTry);
    for (const it of best.attempt.items) {
      it.stimulusIndex = items.length - startedAt;
      it.firstOnStimulus = it.stimulusIndex === 0;
      items.push(it);
    }
    stimuli.push({ ...best.stimulus, count: items.length - startedAt });
    if (items.length >= sharedLength) break;
  }

  // Top up. An archetype that cannot meet its constraints on a given table leaves a hole, and the
  // per-stimulus target stops the substitution filling it, so a second pass revisits each stimulus
  // in order and adds questions up to the seven-question maximum until the session is full. Without
  // this a twenty-item request shipped eighteen.
  for (let pass = 0; pass < 3 && items.length < sharedLength; pass++) {
    for (const st of stimuli) {
      if (items.length >= sharedLength) break;
      const supporters = pool.filter(a => a.families?.includes(st.family));
      let onThis = items.filter(it => it.stimulusId === st.id).length;
      for (const alt of supporters) {
        if (items.length >= sharedLength || onThis >= STIMULUS_QUESTIONS_MAX) break;
        // PROBLEM 1's THIRD CAUSE. The cap relaxes by one on each later top-up pass.
        //
        // The spec already relaxes the cap "whenever 25% of length would make the session impossible to
        // fill", so relaxing it further when the session is STILL not filling is the same principle
        // rather than a new one. It matters because the relaxed cap frequently lands so that
        // pool.length x cap equals the request EXACTLY, and then a single build failure anywhere
        // makes the session short with no slack to absorb it. Desk 02 warm-up at 20 items is four
        // archetypes at a cap of five, and it came up short in 97% of builds for that reason alone.
        // Pass 0 respects the cap, so it is still the preferred limit and not merely advisory.
        if ((used[alt.id] ?? 0) + (alt.emitsPair ? 2 : 1) > shareCap + pass) continue;
        const seed = sessionSeed + items.length * ITEM_SEED_STRIDE + pass * 31;
        const built = buildOnStimulus(alt, st, makeRng(seed), tier);
        if (!built) continue;
        used[alt.id] = (used[alt.id] ?? 0) + built.length;
        for (const it of built) {
          it.stimulusIndex = onThis++;
          it.firstOnStimulus = false;        // the table was already read on this stimulus
          items.push(it);
        }
      }
    }
  }

  // Regroup. The top-up pass appends to the end of the item list, so items for the first stimulus
  // can land after items for the fourth. Consecutive questions on one table is the entire point of
  // a shared stimulus, so the list is regrouped in stimulus order, preserving the order within
  // each group, and the two positional fields are recomputed from the final arrangement.
  const ordered = [];
  for (const st of stimuli) {
    const mine = items.filter(it => it.stimulusId === st.id);
    mine.forEach((it, i) => { it.stimulusIndex = i; it.firstOnStimulus = i === 0; });
    ordered.push(...mine);
  }

  // Self-contained items are appended after the shared groups rather than interleaved into them,
  // because breaking a table's run of questions to insert a pie would cost the candidate the reading
  // they already paid for on that table. Each one is its own stimulus of one.
  const soloStimuli = soloItems.map(it => ({ id: it.stimulusId, family: 'chart', count: 1 }));
  const kept = [...ordered, ...soloItems].slice(0, length);
  // Counts are recomputed against what actually shipped: the final stimulus can be truncated by
  // the session length, and a stimulus list that disagrees with the item list is worse than none.
  for (const s of [...stimuli, ...soloStimuli]) s.count = kept.filter(it => it.stimulusId === s.id).length;
  return { items: kept, pool, stimuli: [...stimuli, ...soloStimuli].filter(s => s.count > 0) };
}

// Returns an array, because b06 and b07 emit matched pairs. Everything else returns one item.
function buildOnStimulus(archetype, stimulus, rng, tier) {
  if (typeof archetype.build !== 'function') return null;
  for (let attempt = 0; attempt < GENERATE_MAX_ATTEMPTS; attempt++) {
    let built = null;
    try { built = archetype.build({ stimulus, rng, tier }); }
    catch (e) { console.warn(`whetstone: ${archetype.id} threw`, e); built = null; }
    if (!built) continue;
    const list = Array.isArray(built) ? built : [built];
    if (list.every(validItem)) return list;
    for (const bad of list) if (!validItem(bad)) console.warn(`whetstone: ${archetype.id} failed validate`, checkItem(bad));
  }
  return null;
}

export function buildItems({ desk, tier, groups, length, sessionSeed, adaptive, mode }) {
  // PROBLEM 5. CLASSIFY GOES THROUGH THE STIMULUS BUILDER TOO.
  //
  // Excluding it meant a 20-item Classify session on Desk 02 built twenty separate tables, one per
  // item, for a three-minute run. Worse than the waste: Classify exists to train the first ten
  // seconds of an item, deciding what kind of question you are looking at, and on Desk 02 that
  // judgement is made off a SHARED table where several questions come from one stimulus. The mode
  // that trains stimulus recognition was the one mode that never showed a shared stimulus.
  //
  // Review still bypasses it, correctly: 13.6 makes its length one item per matching archetype
  // rather than a sampled session, so grouping it by stimulus would fight the selection it exists to
  // do. The classify choices are attached later in createRun, which does not care how the items were
  // built, so nothing else changes.
  if (desk === 2 && mode !== 'review') {
    return buildStimulusItems({ desk, tier, groups, length, sessionSeed, adaptive });
  }
  const pool = inScope({ desk, tier, groups });
  if (!pool.length) return { items: [], pool };
  // Review due bypasses the weighted sampler entirely. 13.6 is explicit that the mode's length
  // is one item per matching archetype rather than a sampled session, and running both would
  // create two sources of truth about what gets shown.
  const plan = mode === 'review'
    ? reviewPlan(reviewDue(inScope({ desk }), store.mastery()))
    : selectArchetypes({
        pool, length, masteryMap: store.mastery(), adaptive, rng: makeRng(sessionSeed),
      });
  const items = [];
  for (let i = 0; i < plan.length; i++) {
    const seed = sessionSeed + i * ITEM_SEED_STRIDE;
    let it = buildItem(plan[i], makeRng(seed), tier);
    if (!it) {
      // That archetype could not meet its constraints. Try the others rather
      // than shipping a short session.
      for (const alt of pool) {
        if (alt.id === plan[i].id) continue;
        it = buildItem(alt, makeRng(seed + 1), tier);
        if (it) break;
      }
    }
    if (it) items.push(it);
  }
  return { items, pool };
}

// Classify mode offers eight archetype names: the correct one plus seven drawn preferentially
// from the same group, topped up from other groups only if that group has fewer than eight
// members. Drawing at random across all of them makes the task trivial, because the group is
// usually obvious from the stimulus.
export function classifyChoices(archetype, pool, rng) {
  const sameGroup = pool.filter(a => a.group === archetype.group && a.id !== archetype.id);
  const otherGroups = pool.filter(a => a.group !== archetype.group);
  const picked = rng.shuffle(sameGroup).slice(0, CLASSIFY_CHOICES - 1);
  if (picked.length < CLASSIFY_CHOICES - 1) {
    picked.push(...rng.shuffle(otherGroups).slice(0, CLASSIFY_CHOICES - 1 - picked.length));
  }
  return rng.shuffle([archetype, ...picked]).map(a => ({ id: a.id, name: a.name, group: a.group }));
}

const newId = () => {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `ses_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
};

export function createRun(config) {
  const desk = DESKS[config.desk];
  const sessionSeed = config.sessionSeed ?? Math.floor(Math.random() * 2 ** 31);
  const { items, pool } = buildItems({
    ...config, sessionSeed, adaptive: config.toggles.adaptive, mode: config.mode });

  const isClassify = config.mode === 'classify';
  // Classify runs at 10 seconds an item, not targetSeconds. The spec: twenty items in about
  // three minutes. Deriving it from targetSeconds would give a 28 minute session for a task
  // that exists to train the first ten seconds of an item.
  const perItemMs = isClassify ? CLASSIFY_SECONDS * 1000 : null;
  if (isClassify) {
    for (const it of items) {
      const arch = archetypes.find(a => a.id === it.archetypeId);
      it.classifyChoices = classifyChoices(arch, pool, makeRng(it.seed ^ 0x9e3779b9));
    }
  }

  // Ordering is applied here, not in generate: optionOrder is a session toggle and
  // generate cannot see the session. Seeded off the item so it is reproducible.
  for (const it of items) {
    it.options = reorder(it.options, config.toggles.optionOrder, makeRng(it.seed ^ 0x5f3759df));
  }

  const session = {
    id: config.id ?? newId(),
    startedAt: config.startedAt ?? new Date().toISOString(),
    desk: config.desk, mode: config.mode, tier: config.tier,
    // PROBLEM 1's SECOND FIX, independent of the first. `length` used to be the DELIVERED count,
    // so nothing anywhere recorded that you asked for 20 and got 19. A silent shortfall in Exam mode
    // is a measurement you cannot trust and cannot detect. Both numbers are stored and the review
    // screen says so when they differ.
    groups: config.groups ?? [], length: items.length, requestedLength: config.length ?? items.length,
    toggles: config.toggles, sessionSeed,
    responses: [], blurEvents: [], finishedAt: null,
  };

  const state = items.map(() => ({
    chosenIndex: null, setupText: '', msToFirstSetupKey: null,
    accumulatedMs: 0, shownAt: null, submitted: false,
    flagged: false, skipped: false, timedOut: false,
  }));

  let index = 0;

  const durationMs = isClassify
    ? items.length * CLASSIFY_SECONDS * 1000
    : items.length * (desk.minutes * 60000 / desk.items);

  const names = items.map(it => archetypes.find(a => a.id === it.archetypeId)?.name ?? it.archetypeId);

  const run = {
    session, items, state, pool, names,
    durationMs, isClassify,
    perItemMs: it => perItemMs ?? (it ?? items[index]).targetSeconds * 1000,
    get currentName() { return names[index]; },
    get index() { return index; },
    get current() { return items[index]; },
    get cur() { return state[index]; },
    finished: false,

    show() { if (state[index].shownAt === null) state[index].shownAt = Date.now(); },

    choose(i) {
      const s = state[index];
      if (s.submitted && config.toggles.instantFeedback) return false;
      s.chosenIndex = i;
      return true;
    },

    setupKey(text) {
      const s = state[index];
      s.setupText = text;
      if (s.msToFirstSetupKey === null && text.length) {
        s.msToFirstSetupKey = Date.now() - (s.shownAt ?? Date.now());
      }
    },

    flag() {
      const s = state[index];
      s.flagged = !s.flagged;
      if (s.flagged) {
        store.addFlag({ seed: items[index].seed, archetypeId: items[index].archetypeId,
          itemIndex: index, sessionId: session.id, timestamp: new Date().toISOString() });
      }
      return s.flagged;
    },

    canAdvance() {
      const s = state[index];
      if (config.toggles.blockBlanks && s.chosenIndex === null) return false;
      return true;
    },

    // Records the response. Written on every answer, so a crash loses at most one
    // item.
    commit({ skipped = false, timedOut = false } = {}) {
      const s = state[index];
      const it = items[index];
      s.accumulatedMs += Date.now() - (s.shownAt ?? Date.now());
      s.shownAt = null;
      s.submitted = true;
      s.skipped = skipped || (s.chosenIndex === null);
      s.timedOut = timedOut;
      const chosen = s.chosenIndex === null ? null
        : (isClassify ? null : it.options[s.chosenIndex]);
      const pickedArch = isClassify && s.chosenIndex !== null
        ? it.classifyChoices[s.chosenIndex] : null;
      const response = {
        itemId: it.id, archetypeId: it.archetypeId, seed: it.seed, mode: config.mode,
        // The spec's acceptance criterion for shared stimuli: the first question on a stimulus pays
        // the reading cost and the rest do not, so the two are recorded separately. These two are
        // now CSV columns 21 and 22 as well, so the number reaches pandas; the spec is amended.
        stimulusId: it.stimulusId ?? null,
        stimulusIndex: it.stimulusIndex ?? null,
        firstOnStimulus: it.firstOnStimulus ?? null,
        chosenArchetypeId: pickedArch ? pickedArch.id : null,
        classifiedCorrectly: isClassify ? (pickedArch?.id === it.archetypeId) : null,
        answerType: it.answerType,
        // Classify runs at its own tempo, so the logged budget has to be that and not the
        // archetype's 83 seconds, or the CSV misreports what the clock actually allowed.
        targetSeconds: Math.round((perItemMs ?? it.targetSeconds * 1000) / 1000),
        chosenIndex: s.chosenIndex,
        chosenValue: chosen ? chosen.value : null,
        correctValue: it.correct.value,
        correct: isClassify
          ? (pickedArch?.id === it.archetypeId)
          : (!!chosen && chosen.role === 'correct'),
        errorType: chosen && chosen.role !== 'correct' ? chosen.errorType : null,
        setupText: config.toggles.setupBox ? s.setupText : null,
        msToFirstSetupKey: config.toggles.setupBox ? s.msToFirstSetupKey : null,
        msToSubmit: s.accumulatedMs,
        skipped: s.skipped, flagged: s.flagged, timedOut: s.timedOut,
      };
      session.responses = session.responses.filter(r => r.itemId !== it.id).concat(response);
      store.saveActive({ ...session, index });
      store.applyResponse(response);
      return response;
    },

    responseFor(i) { return session.responses.find(r => r.itemId === items[i]?.id) ?? null; },

    next() {
      if (index >= items.length - 1) { run.finish(); return false; }
      index += 1; run.show(); return true;
    },
    back() {
      if (!config.toggles.backNav || index === 0) return false;
      index -= 1; run.show(); return true;
    },
    goto(i) { if (i >= 0 && i < items.length) { index = i; run.show(); } },

    // Session clock expiry is a hard stop. Anything unanswered is recorded as a
    // skip, which keeps it out of the mastery figures.
    expire() {
      for (let i = 0; i < items.length; i++) {
        if (!state[i].submitted) { const save = index; index = i; run.commit({ timedOut: true }); index = save; }
      }
      run.finish();
    },

    finish() {
      if (run.finished) return;
      run.finished = true;
      session.finishedAt = new Date().toISOString();
      store.finishSession(session);
    },

    abandon() { store.abandonSession(session); },
    noteBlur(e) { session.blurEvents.push(e); store.saveActive({ ...session, index }); },
    skipIsAllowed: () => skipAllowed(config.toggles),
    optionCount() { return isClassify ? (items[index]?.classifyChoices?.length ?? 0) : 5; },
    stats() {
      const answered = session.responses.filter(r => !r.skipped);
      return {
        answered: answered.length,
        correct: answered.filter(r => r.correct).length,
        skipped: session.responses.filter(r => r.skipped).length,
      };
    },
  };
  run.show();
  return run;
}

export const allArchetypes = archetypes;
