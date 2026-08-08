// Pinned PRNG. mulberry32, exactly as specified in the spec.
// Do not substitute another algorithm: every seed in logs/ becomes meaningless
// if the number stream changes.
//
// One documented addition: the returned object carries `seed`. The algorithm and
// the number stream are untouched. Item.id and Item.seed (the spec) are
// built inside generate(), which is only handed an rng, so the seed has to travel
// with it. The alternative was changing the pinned generate() signature.
export function makeRng(seed) {
  let a = seed >>> 0;
  function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    seed: seed >>> 0,
    next,
    int:   (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    float: (lo, hi) => lo + next() * (hi - lo),
    pick:  arr => arr[Math.floor(next() * arr.length)],
    shuffle: arr => {
      const b = arr.slice();
      for (let i = b.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [b[i], b[j]] = [b[j], b[i]];
      }
      return b;
    },
  };
}
