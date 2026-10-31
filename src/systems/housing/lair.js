import * as THREE from 'three';
import { toonVertexMat, paint, Billboard } from '../../core/gfx.js';
import { mergeParts } from '../../world/build.js';
import { placeModel } from './models.js';

/* ---------------------------------------------------------------------------
   THE DRAGON'S LAIR — a pit in her yard where her own dragon hatches, lives
   and grows up. Richard, Oct 2026: "players can build on their island. They
   can buy a rare dragon egg, hatch the dragon egg, name their baby dragon,
   have it come into battles with them to train them to be bigger and
   stronger, feed them, play with them, take them on walks ... when the
   dragon levels up enough, it will evolve into a full grown dragon".

   WHAT THIS FIRST PASS IS (Oct 31 2026, `feature/dragon-lair`): the lair as a
   yard thing, the egg, the hatch, the name, the care loop (feed, tag, walk),
   battle training, the look (colour, voice, personality) and the evolution.
   The adult in the arena, the fire-dodging game, tea and the onsen together
   and the polymorph into a kitten vendor are the next passes — each is a
   row that SAYS it is coming (non-negotiable 6), never a button that does
   nothing. docs/notes/housing.md, "The Dragon's Lair", holds the whole list.

   A DRAGON BELONGS TO A KITTEN, NOT TO A LAIR. `store.dragons[name]`, in the
   game's home store beside the boons, so selling the lair, moving it or
   selling the whole home can never lose one (non-negotiable 4: "a pet can
   never be lost"). She lives at the first lair on any home her kitten owns
   (`lairFor`); with none she is away — not drawn, never gone — and the next
   lair she builds finds her waiting in it.

   THE CLOCK ON THE WALL, like the farm and the pen (farm.js): the egg is a
   timestamp, feeding is a timestamp, and everything is worked out from
   `Date.now()` when somebody looks. Nothing ticks while the tab is shut and
   nothing is lost by it either.

   NOTHING DIES, NOTHING SHRINKS. A dragon left alone is HUNGRY — drawn
   sitting still by her pocket — and does not GROW while she is (Richard, Oct
   2026, the animals: "Neglect means hungry and not growing, never death or
   running away"). XP is never taken away; the worst neglect costs time.

   NO COMBAT. The dragon never calls `hurt` and never asks the combat gate:
   in the arena this pass she watches from her kitten's shoulder and learns
   from it (`battleFought`). world-check pins that nothing in here calls
   hurt or names the gate (tools/checks/dragonlair.mjs).

   EVERY NUMBER THAT SETS THE PACE IS IN `LAIR`, one table, so the pacing is
   one edit and not a hunt.
--------------------------------------------------------------------------- */

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/**
 * THE PACE. An afternoon of play is meant to take a fresh egg to about level
 * five — hatched (15 min, less with warming), fed once (40), three games of
 * tag (150), a walk (60) and two battles (160) is 410 XP — and the adult is a
 * week of check-ins, which is the tamagotchi part. The rate of each source is
 * set by its gap, not by its size, so mashing one row is never the fast way.
 */
export const LAIR = {
  /** An egg costs this many orbs (`Housing.price`). */
  eggMult: 1,
  /** Laid to ready, real time. */
  hatch: 15 * MIN,
  /** WARM THE EGG takes this off the wait... */
  warm: MIN,
  /** ...at most this often. */
  warmGap: 30 * 1000,
  feedXp: 40,
  /** Fed this recently, she is full — the row says when she will eat again. */
  feedGap: HOUR,
  /** This long unfed and she is HUNGRY: no growing until she is fed. */
  hungryAfter: 12 * HOUR,
  playXp: 50,
  playGap: 10 * MIN,
  /** Tags to win a game of TAG, and the seconds she has before it tires. */
  playTags: 5,
  playTime: 60,
  /** A touch counts within this, flat (she is 0.75 wide, the dragon ~1). */
  tagReach: 2.4,
  /** A walk pays `walkXp` every `walkPer` units walked, up to `walkMax` a walk. */
  walkXp: 4,
  walkPer: 10,
  walkMax: 60,
  battleXp: 40,
  winXp: 40,
  /** One egg in eight hatches SHINY — the gold dragon (`RARE_TINT`). */
  rareChance: 0.125,
};

/** XP needed for each level, by level (index 1 is 0: a hatchling starts there). */
export const LEVEL_XP = [0, 0, 60, 150, 280, 450, 660, 910, 1200, 1530, 1900];
export const ADULT_LEVEL = LEVEL_XP.length - 1;

/**
 * THE STAGES, and how TALL she is drawn at the start of each, in world units
 * — the panda's yardstick (`PANDA_TIERS`), against a kitten's 2.9. Measured
 * off the loaded dragon sheet: its drawing fills 0.50 of the cell's height
 * (`contentScale`) and is 1.75 times wider than it is tall (`aspect`), so she
 * is `h` tall with wings `1.75 h` across. The first pass called this a WIDTH
 * and gave a hatchling 2.6: she hatched as tall as her kitten with a wingspan
 * of 4.5, and the grown dragon (11) would have been wider than her lair.
 * Grown, she is taller than the grown panda (5.6), the other thing a kitten
 * rides, and her wings still fit inside the ring of rock (`roomFor`).
 * Between two stages she grows a little every level, so a level-up is
 * always visible.
 */
export const STAGES = [
  { id: 'egg', name: 'EGG', from: 0, h: 0 },
  { id: 'hatchling', name: 'HATCHLING', from: 1, h: 1.2 },
  { id: 'youngling', name: 'YOUNGLING', from: 4, h: 1.9 },
  { id: 'juvenile', name: 'JUVENILE', from: 7, h: 3.0 },
  { id: 'adult', name: 'GROWN DRAGON', from: ADULT_LEVEL, h: 7 },
];

/**
 * THE FOUR KINDS, one per corner of the lair. Richard's prompt for the
 * Polyfork kit: "different color types (green gas, red fire, purple flames,
 * crystals etc.) for different dragon types that can be in the lair". Each
 * has its corner (`pocket`, in the lair's own frame, mouth toward +z), its
 * egg, the four colours CUSTOMIZE offers, its food and its names.
 */
export const ELEMENTS = [
  {
    id: 'fire', name: 'FIRE', kanji: '火', pocket: [-4.6, 1.4], glow: 0xff5a1f, egg: 0xc8402a, spots: 0xffc04a,
    tints: [0xff9d5c, 0xff6a5a, 0xffc878, 0xff8ab0], food: 'FIRE PEPPERS',
    blurb: 'Hatches by the lava pool. Breathes FIRE.',
    names: ['CINDER', 'SPARKY', 'PEPPER', 'CHILI', 'TOASTY', 'BLAZE', 'SIZZLE', 'COCOA'],
  },
  {
    id: 'mist', name: 'GREEN MIST', kanji: '霧', pocket: [-3.4, -3.6], glow: 0x7dff6a, egg: 0x4f9a3a, spots: 0xc8ff8a,
    tints: [0x9fe0a0, 0x6fd8a0, 0xd0f07a, 0x7ad8d0], food: 'GLOW MUSHROOMS',
    blurb: 'Hatches in the swirling green gas. Breathes a MIST that makes everyone sneeze.',
    names: ['WASABI', 'MATCHA', 'SPROUT', 'PICKLE', 'MINTY', 'KIWI', 'BASIL', 'FERN'],
  },
  {
    id: 'spirit', name: 'SPIRIT FLAME', kanji: '霊', pocket: [3.4, -3.6], glow: 0xb06aff, egg: 0x6a3a9a, spots: 0xe0b0ff,
    tints: [0xe0a6e8, 0xb49cff, 0xff9ce0, 0xa0b0ff], food: 'MOON PLUMS',
    blurb: 'Hatches over the purple flames. Breathes cold SPIRIT FIRE that glows in the dark.',
    names: ['UBE', 'GRAPE', 'MYSTIC', 'PLUM', 'LUNA', 'MOCHI', 'VIOLET', 'WISP'],
  },
  {
    id: 'crystal', name: 'CRYSTAL', kanji: '水晶', pocket: [4.6, 1.4], glow: 0x6ae8ff, egg: 0x5ab0c8, spots: 0xffffff,
    tints: [0x9fd4ff, 0xc9f0ff, 0x8ce8e0, 0xd8d0ff], food: 'SPARKLE ROCKS',
    blurb: 'Hatches among the crystals. Breathes SPARKLES that sting like hail.',
    names: ['PEBBLE', 'GLIMMER', 'QUARTZ', 'SPARKLE', 'DIAMOND', 'TWINKLE', 'OPAL', 'GEM'],
  },
];
export const ELEMENT_BY_ID = Object.fromEntries(ELEMENTS.map((e) => [e.id, e]));

/** The shiny one's colour, and the names every kind can have. */
export const RARE_TINT = 0xffd86a;
const NAMES_ANY = ['NOODLE', 'BISCUIT', 'PIP', 'TOFU', 'DUMPLING', 'ZIGGY', 'BEAN', 'NORI', 'SUSHI', 'POCKY'];

/** How she sounds: the synthesised voice's pitch (audio.js `voice`). */
export const VOICES = [
  { id: 'chirp', name: 'CHIRPY', pitch: 1.6 },
  { id: 'squeak', name: 'SQUEAKY', pitch: 2.3 },
  { id: 'rumble', name: 'RUMBLY', pitch: 0.75 },
];

/** Who she is. Each has its own line for a game won, a meal and a hello. */
export const MOODS = [
  { id: 'playful', name: 'PLAYFUL', hello: 'does a loop-the-loop', meal: 'gobbles it up and asks for MORE', won: 'zooms round in circles' },
  { id: 'brave', name: 'BRAVE', hello: 'puffs out her chest', meal: 'eats like a warrior', won: 'roars a tiny roar' },
  { id: 'sleepy', name: 'SLEEPY', hello: 'yawns a little smoke ring', meal: 'eats it, then naps on the gold', won: 'flops down for a nap' },
  { id: 'cheeky', name: 'CHEEKY', hello: 'sticks her tongue out', meal: 'steals a bite off your plate too', won: 'blows a raspberry' },
];

/* ------------------------------ the pure part ------------------------------ */

/** Her level, from XP. Pure. */
export function levelOf(xp = 0) {
  let L = 1;
  for (let k = 2; k < LEVEL_XP.length; k++) if (xp >= LEVEL_XP[k]) L = k;
  return L;
}

/** 0..1 of the way to the next level (1 at the top). Pure. */
export function levelProgress(xp = 0) {
  const L = levelOf(xp);
  if (L >= ADULT_LEVEL) return 1;
  return (xp - LEVEL_XP[L]) / (LEVEL_XP[L + 1] - LEVEL_XP[L]);
}

/**
 * Her stage. GROWN only once she has been EVOLVED — reaching the level is
 * what offers it; her kitten pressing yes is what makes it (state changes on
 * ACCEPT, non-negotiable 7).
 */
export function stageOf(D) {
  if (!D?.born) return STAGES[0];
  if (D.adult) return STAGES[4];
  const L = Math.min(levelOf(D.xp), ADULT_LEVEL - 1);
  return [...STAGES].reverse().find((s) => s.id !== 'adult' && L >= s.from && s.from > 0) ?? STAGES[1];
}

/** How tall she is drawn: her stage's height, a step more for every level into it. */
export function drawHeight(D) {
  const S = stageOf(D);
  if (S.id === 'egg' || S.id === 'adult') return S.h;
  const next = STAGES[STAGES.indexOf(S) + 1];
  const L = Math.min(levelOf(D.xp), ADULT_LEVEL - 1);
  const span = Math.max(1, next.from - S.from);
  return S.h + (next.h - S.h) * 0.6 * ((L - S.from) / span);
}

/** The dragon sheet's width over its height, measured off the loaded atlas; this when there is none. */
export const WINGS = 1.75;

/**
 * Where in the lair a dragon `h` tall can stand: her spot, pulled in toward
 * the middle until her wings (`span` across) are inside the ring of rock.
 * A hatchling keeps her own corner; a grown dragon stands in the middle.
 * Pure.
 */
export function roomFor([x, z], h, span = WINGS * h) {
  const max = Math.max(0, LAIR_RING.r - LAIR_RING.rock - span / 2);
  const d = Math.hypot(x, z);
  return d <= max ? [x, z] : [x * max / d, z * max / d];
}

/** Milliseconds until the egg is ready; 0 is ready. Pure. */
export function hatchLeft(egg, now = Date.now()) {
  if (!egg) return 0;
  return Math.max(0, (egg.laid ?? now) + LAIR.hatch - (egg.warm ?? 0) - now);
}

/** Why the egg cannot be warmed right now, or null. Pure. */
export function warmWhy(egg, now = Date.now()) {
  if (!egg) return 'There is no egg to warm.';
  if (hatchLeft(egg, now) <= 0) return 'It is warm enough — it is ready to HATCH!';
  const wait = (egg.warmedAt ?? 0) + LAIR.warmGap - now;
  if (wait > 0) return `Cuddled just now — warm it again in ${Math.ceil(wait / 1000)} seconds.`;
  return null;
}

/** Is she hungry? Pure. */
export function isHungry(D, now = Date.now()) {
  return !!D?.born && now - (D.fed || D.born) > LAIR.hungryAfter;
}

/** Why she will not eat yet, or null. Pure. */
export function feedWhy(D, now = Date.now()) {
  if (!D?.born) return 'There is no dragon to feed yet.';
  const wait = (D.fed || 0) + LAIR.feedGap - now;
  if (wait > 0) return `${D.name ?? 'She'} is full! She will eat again in ${minutes(wait)}.`;
  return null;
}

/** Why she will not play yet, or null. Pure. */
export function playWhy(D, now = Date.now()) {
  if (!D?.born) return 'There is no dragon to play with yet.';
  if (D.adult) return 'She is too big for tag now — she would squash you! Take her for a WALK instead.';
  const wait = (D.played || 0) + LAIR.playGap - now;
  if (wait > 0) return `${D.name ?? 'She'} is still puffed out from the last game — play again in ${minutes(wait)}.`;
  return null;
}

/** Why she cannot be evolved, or null. Pure. */
export function evolveWhy(D) {
  if (!D?.born) return 'Hatch her first!';
  if (D.adult) return 'She is already grown.';
  const L = levelOf(D.xp);
  if (L < ADULT_LEVEL) return `She grows up at level ${ADULT_LEVEL} — she is level ${L}.`;
  return null;
}

/**
 * XP for something she did. Pure apart from writing `D`. A hungry dragon
 * learns nothing until she is fed (the `meal` itself is how that ends), and
 * an egg cannot learn at all. Returns { got, from, to } — `to > from` is a
 * level-up, which the caller says out loud.
 */
export function gainXp(D, amount, now = Date.now(), meal = false) {
  const from = levelOf(D?.xp ?? 0);
  if (!D?.born || amount <= 0 || (!meal && isHungry(D, now))) return { got: 0, from, to: from };
  D.xp = (D.xp ?? 0) + Math.round(amount);
  return { got: Math.round(amount), from, to: levelOf(D.xp) };
}

/** A new egg of kind `el`, laid at `now`. `roll` is 0..1 for the shiny. Pure. */
export function newEgg(el, now = Date.now(), roll = Math.random()) {
  return {
    v: 1,
    el,
    egg: { laid: now, warm: 0, warmedAt: 0, rare: roll < LAIR.rareChance },
    rare: false,
    name: null,
    tint: 0,
    voice: VOICES[0].id,
    mood: MOODS[0].id,
    xp: 0,
    born: 0,
    fed: 0,
    played: 0,
    adult: false,
    seed: Math.floor(roll * 1e6),
  };
}

/** Out of the egg — the moment HATCH is pressed. Pure apart from writing `D`. */
export function hatchDragon(D, now = Date.now()) {
  if (!D?.egg || hatchLeft(D.egg, now) > 0) return false;
  D.rare = !!D.egg.rare;
  // a shiny one comes out GOLD (the colour past her kind's four, `tintOf`); CUSTOMIZE can change it
  D.tint = D.rare ? (ELEMENT_BY_ID[D.el] ?? ELEMENTS[0]).tints.length : 0;
  D.egg = null;
  D.born = now;
  D.fed = now;
  D.xp = 0;
  return true;
}

/** Six names for the naming card, shuffled by `seed`: her kind's, then anybody's. Pure. */
export function nameIdeas(el, seed = 0, n = 6) {
  const pool = [...(ELEMENT_BY_ID[el]?.names ?? []), ...NAMES_ANY];
  let s = (Math.abs(seed | 0) % 2147483646) + 1;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  for (let k = pool.length - 1; k > 0; k--) {
    const j = Math.floor(rnd() * (k + 1));
    [pool[k], pool[j]] = [pool[j], pool[k]];
  }
  return pool.slice(0, n);
}

/** The colour she is drawn: gold if she hatched shiny and kept it, else her kind's pick. */
export function tintOf(D) {
  const E = ELEMENT_BY_ID[D?.el] ?? ELEMENTS[0];
  if (D?.rare && (D.tint ?? 0) === E.tints.length) return RARE_TINT;
  return E.tints[(D?.tint ?? 0) % E.tints.length];
}

/** How many colours CUSTOMIZE cycles: her kind's four, and gold for a shiny. */
export const tintCount = (D) => (ELEMENT_BY_ID[D?.el] ?? ELEMENTS[0]).tints.length + (D?.rare ? 1 : 0);

export const moodOf = (D) => MOODS.find((m) => m.id === D?.mood) ?? MOODS[0];
export const voiceOf = (D) => VOICES.find((v) => v.id === D?.voice) ?? VOICES[0];
export const dragonName = (D) => D?.name ?? 'your baby dragon';

function minutes(ms) {
  const m = Math.ceil(ms / MIN);
  return m <= 1 ? 'about a minute' : `${m} minutes`;
}

/* ------------------------------ the drawn lair ----------------------------- */

/** The ring of rock: how far out, and the mouth's half-angle (toward +z). */
export const LAIR_RING = { r: 8.4, mouth: 0.66, step: 0.245, rock: 1.5 };
/** Where the nest is, in the lair's frame, and where she can stand to ask. */
export const LAIR_NEST = { x: 0, z: -5.2, r: 1.7 };
export const LAIR_SPOT = { x: 0, z: 0.6, r: 6.4 };

/**
 * THE LAIR, in its own frame (mouth toward +z): a dark pit ringed by rock that
 * rises toward the back like the mountain in Richard's picture, a pocket of
 * each kind round the inside, and the nest with its gold at the back. OPEN TO
 * THE SKY on purpose — a roof would hide the dragons from the camera, and the
 * houses have taught this project what x-raying a roof costs.
 *
 * Returns the drawable group plus everything the island must learn from it:
 * `obstacles` ([x, z, r] in the lair's frame — the ring, leaving the mouth),
 * and `fx`, a site that animates itself (`update`, pathfx.js runs it).
 *
 * PLACEHOLDER (Oct 2026): drawn, plus four vendored Polyfork accents, until
 * Richard's "Dragons Lair" kit comes out of the Polyfork factory. `placeModel`
 * is the swap point: give each piece a model id and the drawn piece is its
 * stand-in, so deleting the files puts the drawing back (non-negotiable 9).
 */
export function lairBody(rockMat = toonVertexMat()) {
  const g = new THREE.Group();
  const rock = [];
  const glow = [];
  const obstacles = [];
  const R = LAIR_RING;
  // the pit's floor
  const floor = new THREE.CylinderGeometry(R.r - 0.2, R.r + 0.4, 0.08, 40);
  paint(floor, 0x2e2830);
  floor.translate(0, 0.04, 0);
  rock.push(floor);
  /* THE RING: boulders all round but the mouth, taller toward the back.
     Spread evenly across the arc rather than stepped from one side, which
     left the mouth lopsided by the remainder. Their colliders overlap (2.1
     apart, 1.5 each), so the only way in is the way the camera sees in. */
  const arc = Math.PI * 2 - 2 * R.mouth;
  const n = Math.round(arc / R.step);
  for (let k = 0; k <= n; k++) {
    const a = R.mouth + (arc * k) / n;
    const back = (1 - Math.cos(a)) / 2;           // 0 at the mouth, 1 at the back
    const h = 2.4 + 4.6 * back;
    const b = new THREE.DodecahedronGeometry(1.7, 0);
    b.scale(1, h / 3.2, 1);
    b.rotateY(a * 3.1);
    b.translate(Math.sin(a) * R.r, h / 2 - 0.2, Math.cos(a) * R.r);
    paint(b, [0x4a4048, 0x3d353c, 0x55494c][k % 3]);
    rock.push(b);
    obstacles.push([Math.sin(a) * R.r, Math.cos(a) * R.r, R.rock]);
  }
  // spires behind, the mountain's peak — solid from outside too
  for (const [a, h] of [[2.75, 9.5], [3.14, 11.5], [3.55, 9]]) {
    const s = new THREE.ConeGeometry(1.7, h, 6);
    s.translate(Math.sin(a) * (R.r + 0.9), h / 2, Math.cos(a) * (R.r + 0.9));
    paint(s, 0x3a3238);
    rock.push(s);
    obstacles.push([Math.sin(a) * (R.r + 0.9), Math.cos(a) * (R.r + 0.9), 1.4]);
  }
  // the nest: a ring of straw, and the gold every dragon sits on
  const N = LAIR_NEST;
  const nest = new THREE.TorusGeometry(N.r, 0.42, 6, 18);
  nest.rotateX(Math.PI / 2);
  nest.translate(N.x, 0.3, N.z);
  paint(nest, 0x8a6a3a);
  const straw = new THREE.CylinderGeometry(N.r, N.r, 0.12, 18);
  straw.translate(N.x, 0.12, N.z);
  paint(straw, 0xc8a050);
  rock.push(nest, straw);
  for (let k = 0; k < 14; k++) {
    const c = new THREE.CylinderGeometry(0.34, 0.34, 0.08, 10);
    const a = k * 2.4;
    const rr = N.r + 0.8 + (k % 3) * 0.45;
    c.translate(N.x + Math.cos(a) * rr, 0.08 + (k % 4) * 0.08, N.z + Math.sin(a) * rr * 0.6);
    paint(c, k % 3 ? 0xffd24a : 0xe8b030);
    rock.push(c);
  }
  // the four pockets
  const fx = { kind: 'lair', puffs: [], flames: [], shards: [], pools: [], t: 0 };
  for (const E of ELEMENTS) {
    const [px, pz] = E.pocket;
    const pool = new THREE.CylinderGeometry(1.5, 1.6, 0.1, 20);
    pool.translate(px, 0.1, pz);
    paint(pool, E.glow);
    glow.push(pool);
    for (let k = 0; k < 7; k++) {
      const s = new THREE.DodecahedronGeometry(0.42 + (k % 3) * 0.12, 0);
      s.translate(px + Math.cos(k * 0.9) * 1.75, 0.25, pz + Math.sin(k * 0.9) * 1.75);
      paint(s, 0x3a3238);
      rock.push(s);
    }
    if (E.id === 'mist') {
      for (let k = 0; k < 6; k++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.55 + (k % 3) * 0.2, 10, 8),
          new THREE.MeshBasicMaterial({ color: E.glow, transparent: true, opacity: 0.32, depthWrite: false, toneMapped: false }));
        m.userData = { px, pz, k };
        g.add(m);
        fx.puffs.push(m);
      }
    }
    if (E.id === 'spirit') {
      for (let k = 0; k < 3; k++) {
        const bx = px + [-0.9, 0.9, 0][k], bz = pz + [0.5, 0.5, -0.9][k];
        const bowl = new THREE.CylinderGeometry(0.45, 0.3, 0.7, 8);
        bowl.translate(bx, 0.35, bz);
        paint(bowl, 0x5a5058);
        rock.push(bowl);
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.1, 7).translate(0, 0.55, 0),
          new THREE.MeshBasicMaterial({ color: E.glow, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
        f.position.set(bx, 0.7, bz);
        f.userData = { k };
        g.add(f);
        fx.flames.push(f);
      }
    }
    if (E.id === 'crystal') {
      for (let k = 0; k < 5; k++) {
        const c = new THREE.OctahedronGeometry(0.4 + (k % 2) * 0.2, 0);
        c.scale(0.6, 2.4, 0.6);
        c.rotateZ((k - 2) * 0.22);
        c.translate(px + Math.cos(k * 1.3) * 0.8, 0.9, pz + Math.sin(k * 1.3) * 0.8);
        paint(c, E.glow);
        glow.push(c);
      }
    }
    if (E.id === 'fire') {
      for (let k = 0; k < 4; k++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xffd04a, toneMapped: false }));
        b.userData = { px, pz, k };
        g.add(b);
        fx.pools.push(b);
      }
    }
  }
  /* `rockMat` is the island's x-ray plant material when the yard builds it:
     the spires are taller than a house, and a kitten behind them must not
     vanish (the rule every wall and roof on the island already keeps). */
  g.add(new THREE.Mesh(mergeParts(rock), rockMat));
  const glowMesh = new THREE.Mesh(mergeParts(glow), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  g.add(glowMesh);
  /* THE POLYFORK ACCENTS — real models beside the drawn pockets, until the
     lair kit lands. Fitted to a height in units (a kitten is 2.9), like every
     yard model (`fitTo`); no stand-in, so a missing file costs the accent and
     nothing else. */
  for (const [id, x, z, h, ry] of [
    ['lava-rock-pile-d56d19', -5.9, 3.0, 1.4, 0.4],
    ['mushroom-cluster-18dc1d', -4.9, -4.6, 1.3, 1.2],
    ['obsidian-shard-cluster-c8f5d3', 1.9, -6.6, 2.2, 2.1],
    ['crystal-cluster-624138', 5.8, 3.0, 2.4, -0.6],
  ]) {
    const m = placeModel(id, null, { h });
    m.position.set(x, 0, z);
    m.rotation.y = ry;
    g.add(m);
  }
  fx.update = (dt, t) => lairFxStep(fx, t);
  return { group: g, obstacles, fx };
}

/** The lair's moving parts: the mist rolls, the spirit fire flickers, the lava bubbles. */
function lairFxStep(fx, t) {
  for (const m of fx.puffs) {
    const { px, pz, k } = m.userData;
    const a = t * 0.6 + k * 1.05;
    const rise = (t * 0.35 + k * 0.17) % 1;
    m.position.set(px + Math.cos(a) * 0.9, 0.4 + rise * 2.2, pz + Math.sin(a) * 0.9);
    m.material.opacity = 0.34 * Math.sin(rise * Math.PI);
    m.scale.setScalar(0.8 + rise * 0.7);
  }
  for (const f of fx.flames) {
    const k = f.userData.k;
    const s = 1 + 0.25 * Math.sin(t * (9 + k * 2.3) + k) + 0.12 * Math.sin(t * 21 + k * 4);
    f.scale.set(1 - 0.1 * (s - 1), s, 1 - 0.1 * (s - 1));
  }
  for (const b of fx.pools) {
    const { px, pz, k } = b.userData;
    const ph = (t * 0.7 + k * 0.27) % 1;
    b.position.set(px + Math.cos(k * 1.7) * 0.8, 0.12 + ph * 0.25, pz + Math.sin(k * 1.7) * 0.8);
    b.scale.setScalar(ph < 0.85 ? 0.5 + ph : 3 * (1 - ph) * 4);
  }
}

/* --------------------------------- in play --------------------------------- */

/** Where each of up to four dragons idles, around her own kind's pocket. */
export const SLOT_OFF = [[0.0, 1.9], [1.4, 1.2], [-1.4, 1.2], [0.0, -1.9]];

export class DragonLair {
  constructor(housing) {
    this.H = housing;
    this.game = housing.game;
    /** Kitten name → her dragon's drawn view. */
    this.views = new Map();
    /** Seat → what she is doing with her dragon: a walk or a game of tag. */
    this.s = new Map();
    /** Kitten name → { t } of a hatch being shown (cosmetic: the fact changed on the press). */
    this.hatching = new Map();
    /** The bits of shell and sparkle flying off a hatch or a level-up. */
    this.bursts = [];
    /** What the views were drawn from — the store, and every island's places (`_stale`). */
    this._seen = null;
    this._time = 0;
  }

  /* SELF-HEALING, rather than one more `sync()` beside every rebuild. A yard
     rebuild — a sale, a move, a preview, a cup on the shelf, a load — always
     makes the island a NEW `places` map, and a load or a new game a new
     store; so watching those identities catches every way a lair can come,
     go or move, including the ones added after this was written. The pen
     needed six call sites; this needs none, and cannot miss one. */
  _stale() {
    const S = this._seen;
    const isles = this.H.isles ?? [];
    if (!S || S.store !== this.H.store || S.places.length !== isles.length) return true;
    return isles.some((I, k) => I.places !== S.places[k]);
  }

  _mark() { this._seen = { store: this.H.store, places: (this.H.isles ?? []).map((I) => I.places) }; }

  /** Every dragon in this game: name → row. Made on first ask. */
  dragons() {
    const S = this.H.store;
    if (!S.dragons || typeof S.dragons !== 'object') S.dragons = {};
    return S.dragons;
  }

  dragonOf(p) {
    const n = p?.style?.name;
    return n ? this.dragons()[n] ?? null : null;
  }

  /** The lair a kitten's dragon lives at: the first lair on a home she owns, or null. */
  lairFor(name) {
    for (const I of this.H.isles ?? []) {
      const H = I.home;
      if (!H || H.preview || !H.owners?.includes(name)) continue;
      const P = I.placeOf?.('dragonlair');
      if (P) return { I, H, P };
    }
    return null;
  }

  /** A point in a lair's own frame, in the world (`_itemToHouse` then `local`, folded). */
  _world(I, P, fx, fz) {
    const a = (I.ry ?? 0) + (P.a ?? 0);
    return { x: P.x + fx * Math.cos(a) + fz * Math.sin(a), z: P.z - fx * Math.sin(a) + fz * Math.cos(a), y: P.y + (I.group?.position?.y ?? 0) };
  }

  /**
   * Redraw every dragon and egg where it lives now. Cheap, and it never MOVES
   * a dragon: one who was already drawn keeps where she is and eases to her
   * new home from there, so a rebuild mid-walk is not a teleport.
   */
  sync() {
    const old = this.views;
    this.views = new Map();
    for (const v of old.values()) v.group.parent?.remove(v.group);
    this._mark();
    const scene = this.game.scene;
    if (!scene) return;
    const D = this.dragons();
    const names = Object.keys(D);
    for (const name of names) {
      const row = D[name];
      const L = this.lairFor(name);
      if (!L) continue;
      const E = ELEMENT_BY_ID[row.el] ?? ELEMENTS[0];
      const sameKind = names.filter((n) => D[n].el === row.el && this.lairFor(n)?.P === L.P);
      const slot = SLOT_OFF[Math.max(0, sameKind.indexOf(name)) % SLOT_OFF.length];
      const eggs = names.filter((n) => D[n].egg && this.lairFor(n)?.P === L.P);
      const base = [E.pocket[0] + slot[0], E.pocket[1] + slot[1]];
      const view = { name, L, E, row, group: new THREE.Group(), base, home: base };
      if (row.egg) {
        const k = Math.max(0, eggs.indexOf(name));
        view.home = [LAIR_NEST.x + (k - (eggs.length - 1) / 2) * 1.1, LAIR_NEST.z + (k % 2) * 0.3];
        view.egg = eggMesh(E, row.egg.rare);
        view.group.add(view.egg);
      } else {
        this._drawDragon(view);
      }
      const w = this._world(L.I, L.P, view.home[0], view.home[1]);
      const was = old.get(name);
      view.pos = was && !was.egg && !view.egg ? was.pos : new THREE.Vector3(w.x, w.y, w.z);
      view.inRing = !!was?.inRing;
      view.group.position.copy(view.pos);
      scene.add(view.group);
      this.views.set(name, view);
    }
  }

  /** Draw one dragon again where she is — a level-up, a new colour, growing up. */
  _redraw(name) {
    const v = this.views.get(name);
    if (!v) return;
    if (v.egg) { this.sync(); return; }
    v.group.clear();
    v.bb = v.mesh = v.shadow = null;
    this._drawDragon(v);
  }

  /** Bits of shell and sparkle off a hatch or a level-up. Cosmetic, and gone in a second. */
  _burst(pos, color, n = 14) {
    const scene = this.game.scene;
    if (!scene || !pos) return;
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, toneMapped: false });
    const geo = new THREE.OctahedronGeometry(0.18, 0);
    const bits = [];
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(geo, mat);
      const a = (k / n) * Math.PI * 2;
      m.position.y = 0.8;
      m.userData.v = new THREE.Vector3(Math.cos(a) * 3.2, 3.5 + (k % 3), Math.sin(a) * 3.2);
      g.add(m);
      bits.push(m);
    }
    g.position.copy(pos);
    scene.add(g);
    this.bursts.push({ g, mat, bits, t: 0 });
  }

  _drawDragon(view) {
    const D = view.row;
    const h = drawHeight(D);
    const art = this.game.dragonArt;
    view.h = h;
    // her spot moves in as she grows, so a level-up redraw moves it too
    view.home = roomFor(view.base, h, (art?.aspect || WINGS) * h);
    if (art?.texture) {
      const quad = h / (art.contentScale || 1);
      const bb = new Billboard(art.texture, {
        cols: 1, rows: 1, width: quad, height: quad, footOffset: (art.pad ?? 0) * quad, artFacesRight: false,
      });
      bb.mat.color.set(tintOf(D));
      view.bb = bb;
      view.group.add(bb);
    } else {
      /* THE FALLBACK — a build (or world-check) without the dragon drawing: a
         body, a head and two wings, in her colour, at her size. */
      const parts = [];
      const body = new THREE.SphereGeometry(0.5, 10, 8);
      body.scale(1.3, 0.9, 0.9);
      body.translate(0, 0.7, 0);
      const head = new THREE.SphereGeometry(0.34, 10, 8);
      head.translate(-0.7, 1.15, 0);
      parts.push(body, head);
      for (const s of [-1, 1]) {
        const wing = new THREE.ConeGeometry(0.5, 1.2, 3);
        wing.rotateX(s * 1.2);
        wing.translate(0.1, 1.2, s * 0.55);
        parts.push(wing);
      }
      for (const p of parts) paint(p, tintOf(D));
      const m = new THREE.Mesh(mergeParts(parts), toonVertexMat());
      // the parts stand 1.8 tall, wingtip to foot
      m.scale.setScalar(h / 1.8);
      view.group.add(m);
      view.mesh = m;
    }
    // her shadow, so a hover reads as off the ground
    const sh = new THREE.Mesh(new THREE.CircleGeometry(h * 0.45, 18).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x1a1020, transparent: true, opacity: 0.3, depthWrite: false }));
    sh.position.y = 0.06;
    view.shadow = sh;
    view.group.add(sh);
  }

  /** Square every dragon to this pane's camera. */
  faceCamera(camera) {
    for (const v of this.views.values()) v.bb?.faceCamera(camera);
  }

  update(dt, players = []) {
    if (this._stale()) this.sync();
    this._time += dt;
    const t = this._time;
    const now = Date.now();
    for (const [i, S] of [...this.s]) this._session(i, S, players[i], dt, t, now);
    for (const B of [...this.bursts]) {
      B.t += dt;
      for (const m of B.bits) {
        m.userData.v.y -= 9 * dt;
        m.position.addScaledVector(m.userData.v, dt);
        m.rotation.x += dt * 7;
      }
      B.mat.opacity = Math.max(0, 1 - B.t / 0.9);
      if (B.t > 0.9) { B.g.parent?.remove(B.g); this.bursts.splice(this.bursts.indexOf(B), 1); }
    }
    const T = this.game.tournament;
    // every seated kitten is on a side (tournament.js `sideOf`), so a match on is her match
    const ringOn = !!T && !['off', 'result', 'leaving'].includes(T.state);
    for (const v of this.views.values()) {
      const up = !!v.L.I.group?.visible;
      v.group.visible = up;
      if (!up) continue;
      const row = v.row;
      if (v.egg) {
        // a ready egg rocks; a warmed one shivers for a moment; a waiting one sits still
        const ready = hatchLeft(row.egg, now) <= 0;
        const shiver = Math.max(0, 1 - (now - (row.egg.warmedAt ?? 0)) / 1500);
        const wob = ready ? Math.sin(t * 7) * 0.22 : shiver * Math.sin(t * 40) * 0.12;
        v.egg.rotation.z = wob;
        v.egg.position.y = ready ? Math.abs(Math.sin(t * 7)) * 0.15 : 0;
        const w = this._world(v.L.I, v.L.P, v.home[0], v.home[1]);
        v.group.position.set(w.x, w.y + 0.3, w.z);
        continue;
      }
      // a hatch being shown: she grows out of the burst
      const h = this.hatching.get(v.name);
      let grow = 1;
      if (h) {
        h.t += dt;
        grow = Math.min(1, h.t / 0.7);
        if (h.t > 1.5) this.hatching.delete(v.name);
      }
      const seat = players.findIndex((p) => p?.style?.name === v.name);
      const busy = seat >= 0 && this.s.get(seat);
      const owner = seat >= 0 ? players[seat] : null;
      /* AT HER KITTEN'S SHOULDER IN THE RING. She does not fight (no `hurt`,
         no gate); she watches, and `battleFought` pays her for it. A grown
         dragon stays home this pass — the arena adult is the next one. */
      if (ringOn && owner?.position && !row.adult) {
        // beside her by about half a wingspan, feet at a kitten's shoulder, and a little higher the bigger she is
        this._toward(v, owner.position.x - (0.7 + 0.55 * v.h), owner.position.y + 1.4 + 0.2 * v.h + Math.sin(t * 3) * 0.2, owner.position.z + 0.6, dt, 9);
        v.inRing = true;
      } else if (!busy) {
        const w = this._world(v.L.I, v.L.P, v.home[0], v.home[1]);
        if (v.inRing) { v.inRing = false; v.pos.set(w.x, w.y, w.z); }
        const hungry = isHungry(row, now);
        const wander = hungry ? 0 : 0.7;
        const a = t * 0.5 + v.name.length;
        const hop = hungry ? 0 : Math.abs(Math.sin(t * 2.6 + v.name.length)) * (row.adult ? 0.4 : 0.6);
        this._toward(v, w.x + Math.cos(a) * wander, w.y + hop, w.z + Math.sin(a) * wander, dt, 3);
      }
      v.group.position.copy(v.pos);
      v.group.scale.setScalar(grow);
      if (v.shadow) v.shadow.position.y = Math.min(0, (v.L.P.y + (v.L.I.group?.position?.y ?? 0)) - v.pos.y) + 0.06;
    }
  }

  /** Ease her toward a point, facing the way she goes. */
  _toward(v, x, y, z, dt, k) {
    const dx = x - v.pos.x, dz = z - v.pos.z;
    const e = 1 - Math.exp(-k * dt);
    v.pos.x += dx * e;
    v.pos.y += (y - v.pos.y) * e;
    v.pos.z += dz * e;
    if (Math.hypot(dx, dz) > 0.05) {
      if (v.bb) v.bb.facing = Math.atan2(dx, dz);
      else if (v.mesh) v.mesh.rotation.y = Math.atan2(-dz, dx) + Math.PI;
    }
  }

  /* -------------------------------- the egg -------------------------------- */

  /** BUY: one egg of `el`, laid in her lair now. The card has checked the purse and asked. */
  buyEgg(p, H, el) {
    const G = this.game;
    const n = p.style?.name;
    if (!n) return false;
    if (this.dragons()[n]) { G.toast?.(`${p.name} already has a dragon — one each!`, p.index); return false; }
    if (!H?.owners?.includes(n)) { G.toast?.(`Only ${H?.owners?.join(' & ') ?? 'the owners'} can raise a dragon here.`, p.index); return false; }
    const price = this.eggPrice();
    if (!this.H.spend(p, H, price)) { G.toast?.(`${p.name} needs ${price - p.score} more points for an egg.`, p.index); return false; }
    this.dragons()[n] = newEgg(el, Date.now());
    this.H.save();
    this.sync();
    G.audio?.play?.('menu');
    G.toast?.(`A ${ELEMENT_BY_ID[el]?.name ?? ''} DRAGON EGG! It is in the nest — it hatches in about ${Math.round(LAIR.hatch / MIN)} minutes. WARM it to make it hatch sooner!`, p.index);
    return true;
  }

  eggPrice() { return this.H.price(LAIR.eggMult); }

  warm(p) {
    const D = this.dragonOf(p);
    const G = this.game;
    const why = warmWhy(D?.egg);
    if (why) { G.toast?.(why, p.index); G.audio?.play?.('deny'); return false; }
    const now = Date.now();
    D.egg.warm = (D.egg.warm ?? 0) + LAIR.warm;
    D.egg.warmedAt = now;
    this.H.save();
    G.audio?.play?.('boing', 0.5);
    const left = hatchLeft(D.egg, now);
    G.toast?.(left > 0 ? `${p.name} cuddles the egg. It wiggles! About ${minutes(left)} to go.` : 'The egg is RATTLING — it is ready to HATCH!', p.index);
    return true;
  }

  /** HATCH: the fact changes here, on the press; the burst is only a picture of it. */
  hatch(p) {
    const D = this.dragonOf(p);
    const G = this.game;
    if (!D?.egg) return false;
    const left = hatchLeft(D.egg);
    if (left > 0) { G.toast?.(`Not yet — about ${minutes(left)} to go. WARM it to hurry it up!`, p.index); G.audio?.play?.('deny'); return false; }
    const egg = this.views.get(p.style.name);
    const at = egg ? egg.group.position.clone() : null;
    hatchDragon(D);
    this.H.save();
    this.sync();
    // she comes out where the egg was, and flies to her own corner from there
    const v = this.views.get(p.style.name);
    if (v && at) v.pos.copy(at);
    this._burst(at, (ELEMENT_BY_ID[D.el] ?? ELEMENTS[0]).egg, 16);
    this.hatching.set(p.style.name, { t: 0 });
    this.chirp(D, 4);
    G.audio?.play?.('starfound');
    G.toast?.(D.rare ? 'CRACK! A SHINY GOLD dragon! Now give her a name.' : 'CRACK! Out pops a baby dragon! Now give her a name.', p.index);
    return true;
  }

  /** Her voice: the synthesised blip at her pitch, a few times. Recorded chirps are a follow-up. */
  chirp(D, n = 3) {
    const A = this.game.audio;
    if (!A?.voice) return;
    const f = voiceOf(D).pitch * (D?.adult ? 0.6 : 1);
    for (let k = 0; k < n; k++) setTimeout(() => A.voice(f * (1 + (k % 2) * 0.18)), k * 90);
  }

  /* ------------------------------- the care -------------------------------- */

  feed(p) {
    const D = this.dragonOf(p);
    const G = this.game;
    const now = Date.now();
    const why = feedWhy(D, now);
    if (why) { G.toast?.(why, p.index); G.audio?.play?.('deny'); return false; }
    const was = isHungry(D, now);
    D.fed = now;
    const r = gainXp(D, LAIR.feedXp, now, true);
    this.H.save();
    G.audio?.play?.('chomp');
    this.chirp(D, 2);
    const E = ELEMENT_BY_ID[D.el] ?? ELEMENTS[0];
    G.toast?.(`${dragonName(D)} ${moodOf(D).meal}! ${E.food}, +${r.got} XP.${was ? ' Not hungry any more — she can grow again!' : ''}`, p.index);
    this._levelUp(p, D, r);
    return true;
  }

  name(p, nm) {
    const D = this.dragonOf(p);
    if (!D?.born || !nm) return false;
    D.name = String(nm).toUpperCase().slice(0, 14);
    this.H.save();
    this.chirp(D, 3);
    this.game.toast?.(`Say hello to ${D.name}! She ${moodOf(D).hello}.`, p.index);
    return true;
  }

  /** CUSTOMIZE: step one of her looks along. `what` is 'tint' | 'voice' | 'mood'. */
  restyle(p, what) {
    const D = this.dragonOf(p);
    if (!D?.born) return false;
    if (what === 'tint') D.tint = ((D.tint ?? 0) + 1) % tintCount(D);
    if (what === 'voice') D.voice = VOICES[(VOICES.indexOf(voiceOf(D)) + 1) % VOICES.length].id;
    if (what === 'mood') D.mood = MOODS[(MOODS.indexOf(moodOf(D)) + 1) % MOODS.length].id;
    this.H.save();
    const v = this.views.get(p.style.name);
    if (what === 'tint' && v?.bb) v.bb.mat.color.set(tintOf(D));
    else if (what === 'tint') this._redraw(p.style.name);
    this.chirp(D, what === 'voice' ? 3 : 1);
    return true;
  }

  /** EVOLVE, on her yes. */
  evolve(p) {
    const D = this.dragonOf(p);
    const G = this.game;
    const why = evolveWhy(D);
    if (why) { G.toast?.(why, p.index); G.audio?.play?.('deny'); return false; }
    this.stop(p.index, null);
    D.adult = true;
    D.grown = Date.now();
    this.H.save();
    const n = p.style.name;
    this._redraw(n);
    this.hatching.set(n, { t: 0 });
    this._burst(this.views.get(n)?.pos, (ELEMENT_BY_ID[D.el] ?? ELEMENTS[0]).glow, 24);
    this.chirp(D, 5);
    G.audio?.play?.('victory');
    G.toast?.(`${dragonName(D)} is a GROWN DRAGON! Riding her into the arena is coming in the next update.`, p.index);
    return true;
  }

  _levelUp(p, D, r) {
    if (r.to <= r.from) return;
    const G = this.game;
    const n = p.style.name;
    // a size up where she is — mid-walk she stays at your shoulder, a step bigger
    this._redraw(n);
    this.hatching.set(n, { t: 0.35 });
    this._burst(this.views.get(n)?.pos, (ELEMENT_BY_ID[D.el] ?? ELEMENTS[0]).glow, 10);
    G.audio?.play?.('starfound');
    G.toast?.(r.to >= ADULT_LEVEL && !D.adult
      ? `${dragonName(D)} reached level ${r.to} — she is ready to GROW UP! Visit the lair to evolve her.`
      : `${dragonName(D)} grew to level ${r.to}!${stageOf(D).from === r.to ? ` She is a ${stageOf(D).name} now.` : ''}`, p.index);
  }

  /** The arena's end: every fighter's dragon learns from it (tournament.js `_finishTournament`). */
  battleFought(names = [], winners = []) {
    const now = Date.now();
    const D = this.dragons();
    let any = false;
    for (const n of new Set(names)) {
      const row = D[n];
      if (!row?.born) continue;
      const r = gainXp(row, LAIR.battleXp + (winners.includes(n) ? LAIR.winXp : 0), now);
      const p = (this.game.players ?? []).find((q) => q?.style?.name === n);
      if (!p) { any ||= r.got > 0; continue; }
      if (r.got) {
        this.game.toast?.(winners.includes(n)
          ? `${dragonName(row)} ${moodOf(row).won} — she watched you WIN! +${r.got} XP.`
          : `${dragonName(row)} watched every move. +${r.got} XP.`, p.index);
        this._levelUp(p, row, r);
      } else if (isHungry(row, now)) {
        this.game.toast?.(`${dragonName(row)} was too hungry to learn anything — feed her at the lair!`, p.index);
      }
      any ||= r.got > 0;
    }
    if (any) this.H.save();
  }

  /**
   * The debug panel's row (main.js `_debugDragons`). A real-clock pet cannot be
   * tested at a desk — a hatch is 15 minutes and the adult a week of visits —
   * so this winds the CLOCKS on rather than adding a path of its own: every
   * egg ready to hatch, every dragon a level up, fed long enough ago to eat
   * again and rested for another game. What happens next is the real code.
   */
  debugGrow(now = Date.now()) {
    let n = 0;
    for (const row of Object.values(this.dragons())) {
      if (row.egg) {
        row.egg.laid = now - LAIR.hatch;
      } else if (row.born) {
        const L = levelOf(row.xp ?? 0);
        if (L < ADULT_LEVEL) row.xp = LEVEL_XP[L + 1];
        row.fed = now - LAIR.feedGap;
        row.played = 0;
      } else continue;
      n++;
    }
    // `sync` draws each at her new size and keeps every dragon where she stands
    if (n) { this.H.save(); this.sync(); }
    return n;
  }

  /* ---------------------------- walks and tag ------------------------------ */

  playing(i) { return this.s.get(i) ?? null; }

  /** Start a walk or a game of tag. True if it started (the card closes). */
  start(p, kind) {
    const G = this.game;
    const D = this.dragonOf(p);
    const v = this.views.get(p.style?.name);
    if (!D?.born || !v) { G.toast?.('Your dragon is not here — she lives at your lair.', p.index); return false; }
    if (kind === 'tag') {
      const why = playWhy(D);
      if (why) { G.toast?.(why, p.index); G.audio?.play?.('deny'); return false; }
    }
    if (!v.L.I.over(p.position.x, p.position.z)) { G.toast?.('Go to your island first — that is where she lives.', p.index); return false; }
    this.stop(p.index, null);
    const S = { kind, name: p.style.name, v, D, t: 0, walked: 0, paid: 0, got: 0, tags: 0, last: p.position.clone() };
    if (kind === 'tag') S.spot = this._tagSpot(S, p);
    this.s.set(p.index, S);
    this.chirp(D, 2);
    // a hungry dragon plays, but learns nothing — said now, not after the walk
    const hungry = isHungry(D) ? ` She is HUNGRY, so she will not grow from it — feed her first!` : '';
    G.toast?.(kind === 'walk'
      ? `${dragonName(D)} flies along behind you! Walk round your island — off it, she flies home.${hungry}`
      : `TAG! Run and touch ${dragonName(D)} ${LAIR.playTags} times before she gets tired.${hungry}`, p.index);
    return true;
  }

  stop(i, why) {
    const S = this.s.get(i);
    if (!S) return;
    this.s.delete(i);
    if (why) this.game.toast?.(why, i);
  }

  drop(i) { this.stop(i, null); }

  _tagSpot(S, p) {
    const I = S.v.L.I;
    for (let k = 0; k < 24; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = 6 + Math.random() * 8;
      const x = p.position.x + Math.cos(a) * r, z = p.position.z + Math.sin(a) * r;
      if (I.over(x, z, -4)) return { x, z };
    }
    return { x: S.v.pos.x, z: S.v.pos.z };
  }

  _session(i, S, p, dt, t, now) {
    if (!p?.position) { this.s.delete(i); return; }
    const v = this.views.get(S.name);
    if (!v || v.egg) { this.s.delete(i); return; }
    S.v = v;
    S.t += dt;
    const I = v.L.I;
    if (!I.over(p.position.x, p.position.z, 2)) {
      this.stop(i, `${dragonName(S.D)} flies home to the lair.`);
      return;
    }
    const groundY = I.heightAt?.(p.position.x, p.position.z, p.position.y + 3)?.y ?? p.position.y;
    if (S.kind === 'walk') {
      /* behind her shoulder, a little above: she is walked, not ridden. The
         bigger she is the further back and higher she keeps — a grown dragon
         is twelve wide, and close in she would be the only thing on screen. */
      const back = (p.facing ?? 0) + Math.PI;
      const off = 1 + 0.6 * v.h;
      this._toward(v, p.position.x + Math.sin(back) * off + 0.8, Math.max(groundY, p.position.y) + 0.8 + 0.4 * v.h + Math.sin(t * 4) * 0.25, p.position.z + Math.cos(back) * off, dt, 4);
      S.walked += Math.hypot(p.position.x - S.last.x, p.position.z - S.last.z);
      S.last.copy(p.position);
      const due = Math.min(LAIR.walkMax, Math.floor(S.walked / LAIR.walkPer) * LAIR.walkXp);
      if (due > S.paid) {
        const r = gainXp(S.D, due - S.paid, now);
        S.paid = due;
        S.got += r.got;
        if (r.got) { this.H.save(); this._levelUp(p, S.D, r); }
        if (due >= LAIR.walkMax) {
          this.chirp(S.D, 2);
          this.stop(i, S.got <= 0
            ? `${dragonName(S.D)} is too hungry to enjoy it — feed her at the lair!`
            : `What a walk! ${dragonName(S.D)} got +${S.got} XP and flies back to the lair.`);
        }
      }
      return;
    }
    // TAG: she hovers at her spot until touched, then darts to the next
    const sy = (I.heightAt?.(S.spot.x, S.spot.z, groundY + 6)?.y ?? groundY) + 1.2 + Math.sin(t * 5) * 0.3;
    this._toward(v, S.spot.x, sy, S.spot.z, dt, 6);
    if (Math.hypot(p.position.x - v.pos.x, p.position.z - v.pos.z) < LAIR.tagReach && Math.abs(p.position.y + 1 - v.pos.y) < 3) {
      S.tags++;
      this.chirp(S.D, 1);
      this.game.audio?.play?.('starfound', 0.5);
      if (S.tags >= LAIR.playTags) { this._tagDone(i, S, p, now, true); return; }
      S.spot = this._tagSpot(S, p);
    }
    if (S.t >= LAIR.playTime) this._tagDone(i, S, p, now, false);
  }

  /** A game of tag over. A short game still pays for every tag — there is no losing at tag. */
  _tagDone(i, S, p, now, won) {
    S.D.played = now;
    const r = gainXp(S.D, Math.round(LAIR.playXp * (S.tags / LAIR.playTags)), now);
    this.H.save();
    this.stop(i, isHungry(S.D, now)
      ? `${dragonName(S.D)} is too hungry to play properly — feed her at the lair!`
      : won ? `TAG, you got her ${LAIR.playTags} times! ${dragonName(S.D)} ${moodOf(S.D).won}. +${r.got} XP.`
        : `${dragonName(S.D)} is tired out — ${S.tags} of ${LAIR.playTags} tags. +${r.got} XP.`);
    this._levelUp(p, S.D, r);
  }

  /** The callout over her head while she plays. */
  prompt(p) {
    const S = this.s.get(p.index);
    if (!S) return null;
    if (S.kind === 'walk') return `WALKING ${dragonName(S.D).toUpperCase()} · +${S.got}/${LAIR.walkMax} XP`;
    return `TAG ${dragonName(S.D).toUpperCase()} · ${S.tags}/${LAIR.playTags} · ${Math.max(0, Math.ceil(LAIR.playTime - S.t))}s`;
  }

  /** For the card. */
  describe(D, now = Date.now()) {
    if (!D) return null;
    const S = stageOf(D);
    return {
      stage: S.name,
      level: levelOf(D.xp),
      next: levelOf(D.xp) >= ADULT_LEVEL ? null : LEVEL_XP[levelOf(D.xp) + 1],
      progress: levelProgress(D.xp),
      hungry: isHungry(D, now),
      left: D.egg ? hatchLeft(D.egg, now) : 0,
    };
  }
}

/** An egg in her kind's colour, speckled; a shiny one has gold speckles. */
export function eggMesh(E, rare) {
  const parts = [];
  const shell = new THREE.SphereGeometry(0.62, 16, 12);
  shell.scale(1, 1.32, 1);
  shell.translate(0, 0.82, 0);
  paint(shell, E.egg);
  parts.push(shell);
  for (let k = 0; k < 9; k++) {
    const s = new THREE.SphereGeometry(0.12 + (k % 3) * 0.04, 6, 4);
    s.scale(1, 1, 0.35);
    const a = k * 2.3, y = 0.45 + (k % 4) * 0.25;
    const rr = 0.6 * Math.sqrt(Math.max(0.1, 1 - ((y - 0.82) / 0.82) ** 2));
    /* A VECTOR, not three numbers: BufferGeometry.lookAt takes one argument,
       so (x, 0, z) set y and z to undefined and every spot came out NaN — an
       egg drawn with no spots and a NaN bounding sphere in the console. */
    s.lookAt(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
    s.translate(Math.cos(a) * rr, y, Math.sin(a) * rr);
    paint(s, rare ? RARE_TINT : E.spots);
    parts.push(s);
  }
  return new THREE.Mesh(mergeParts(parts), toonVertexMat());
}
