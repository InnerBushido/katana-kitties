/* ---------------------------------------------------------------------------
   THE DRAGON'S LAIR — the checks that catch what still looks fine on screen.
   Run from world-check.mjs after the housing checks, against its own World
   and its own game row (`check-L`), so nothing here leans on what they left.

   What each one is protecting, in the order a dragon's life happens:
     the lair's only way in is its mouth, on paper and on the island
     the dragons' frame is the island's frame, on a lair that has been turned
     the egg hatches on the clock, and warming takes off what it says
     nothing dies and nothing shrinks: a year alone is HUNGRY, never gone
     a level-up is always visible: she is drawn bigger at every level
     one dragon each, and only an owner raises one at her lair
     a rebuild never teleports her; a battle teaches every fighter once
     the card's rows never move with the clock, and its questions open on NO
     a dragon is a kitten's, not a lair's: sell the lair, sell the home — she waits
     no combat: nothing here hurts anybody
--------------------------------------------------------------------------- */
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { Housing } from '../../src/systems/housing/housing.js';
import { ITEM_BY_ID, priceOf, HOME_SITES } from '../../src/systems/housing/catalog.js';
import { normalise, emptyStore, homeKey } from '../../src/systems/housing/homestore.js';
import { firstYardSpot, addOutdoor } from '../../src/systems/housing/editor.js';
import { removeBuilt, yardBody } from '../../src/systems/housing/build.js';
import { YARD_BUILT } from '../../src/systems/housing/homeisle.js';
import { orbPrice } from '../../src/entities/powerorb.js';
import { PLAYER_STYLE } from '../../src/core/palette.js';
import { PLAYER_RADIUS } from '../../src/entities/player.js';
import { PANDA_TIERS } from '../../src/entities/panda.js';
import { findViewBoxes } from '../../src/core/spritesheet.js';
import { readPNG } from '../png.mjs';
import {
  LAIR, LEVEL_XP, ADULT_LEVEL, ELEMENTS, RARE_TINT, LAIR_RING, SLOT_OFF, WINGS, levelOf, stageOf, drawHeight, roomFor,
  hatchLeft, warmWhy, feedWhy, playWhy, evolveWhy, isHungry, gainXp, newEgg, hatchDragon, nameIdeas, tintOf, tintCount,
  lairBody, eggMesh,
} from '../../src/systems/housing/lair.js';

const DAY = 24 * 3600 * 1000;

function fakePlayer(i, x = 0, z = 0, y = 0) {
  const style = PLAYER_STYLE[i];
  return {
    index: i, style, name: style.name, score: 0, radius: PLAYER_RADIUS, facing: 0,
    position: new THREE.Vector3(x, y, z), velocity: new THREE.Vector3(),
  };
}

/** Does a kitten walking (ax, az) → (bx, bz) touch any of these [x, z, r] circles? */
function blocked(obs, ax, az, bx, bz, pad = PLAYER_RADIUS) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  return obs.some(([x, z, r]) => {
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    return Math.hypot(ax + dx * t - x, az + dz * t - z) < r + pad;
  });
}

export async function dragonLairChecks({ ok, world }) {
  console.log("\n--- the dragon's lair: the pit, the egg, the care, nothing lost ---");

  /* ------------------------------ the pit ------------------------------ */
  const it = ITEM_BY_ID.dragonlair;
  ok("the DRAGON'S LAIR is a yard thing the island builds itself, opened with INTERACT",
    !!it?.where?.includes('yard') && YARD_BUILT.has('dragonlair') && it.act === 'lair' && !it.later);
  const B = lairBody();
  const R = LAIR_RING.r;
  ok('the lair has a ring of rock to bump into, and moving parts (the mist, the flames, the lava)',
    B.obstacles.length >= 20 && typeof B.fx.update === 'function', `${B.obstacles.length} rocks`);
  {
    /* EVERY POINT A REAL NUMBER. The first egg handed BufferGeometry.lookAt
       three numbers where it takes one vector: every spot went NaN, the egg
       was drawn bare, and the only sign was a bounding-sphere error in the
       console — after the egg had been on screen, so a hatch in the same
       frame as the buy never showed it. */
    const nan = [];
    B.group.traverse((o) => { const a = o.geometry?.attributes?.position?.array; if (a && !a.every(Number.isFinite)) nan.push(o.type); });
    for (const E of ELEMENTS) {
      for (const rare of [false, true]) {
        if (!eggMesh(E, rare).geometry.attributes.position.array.every(Number.isFinite)) nan.push(`${E.id}${rare ? ' shiny' : ''} egg`);
      }
    }
    ok('...and every point of the lair and of every egg, shiny or not, is a real number', nan.length === 0, nan.join(', ') || 'all finite');
  }
  ok('...its way in is the MOUTH: walked straight in from the front, she reaches the middle',
    !blocked(B.obstacles, 0, R + 4, 0, 0));
  {
    /* Every other bearing, a step apart, from just past the mouth's own
       first boulder round to the other side of it. */
    const open = [];
    for (let a = LAIR_RING.mouth + 0.12; a < Math.PI * 2 - LAIR_RING.mouth - 0.12; a += 0.05) {
      if (!blocked(B.obstacles, Math.sin(a) * (R + 4), Math.cos(a) * (R + 4), 0, 0)) open.push(a.toFixed(2));
    }
    ok('...and ONLY its mouth: walked in from any other bearing, she meets rock', open.length === 0, open.join(', ') || 'all shut');
  }

  /* ------------------------- the pure rules ---------------------------- */
  ok('levels run 1 to 10 off the XP table, and never past it',
    levelOf(0) === 1 && levelOf(LEVEL_XP[2] - 1) === 1 && levelOf(LEVEL_XP[2]) === 2
    && levelOf(LEVEL_XP[ADULT_LEVEL]) === ADULT_LEVEL && levelOf(1e9) === ADULT_LEVEL);
  const t0 = 1_000_000_000_000;
  {
    const D = newEgg('fire', t0, 0.9);
    ok('an egg is ready exactly LAIR.hatch after it is laid, and not a millisecond sooner',
      hatchLeft(D.egg, t0) === LAIR.hatch && hatchLeft(D.egg, t0 + LAIR.hatch - 1) === 1 && hatchLeft(D.egg, t0 + LAIR.hatch) === 0);
    ok('...and hatching it before then is refused', !hatchDragon(D, t0 + LAIR.hatch - 1000) && !!D.egg);
    D.egg.warm += LAIR.warm;
    D.egg.warmedAt = t0 + 5000;
    ok('...warming takes LAIR.warm off, and a second cuddle within LAIR.warmGap is refused with a reason',
      hatchLeft(D.egg, t0) === LAIR.hatch - LAIR.warm
      && typeof warmWhy(D.egg, t0 + 5001) === 'string' && warmWhy(D.egg, t0 + 5000 + LAIR.warmGap) === null);
    hatchDragon(D, t0 + LAIR.hatch);
    D.xp = 500;
    const yr = D.born + 365 * DAY;
    ok('a dragon left alone for a YEAR is hungry, not gone: still hatched, not a point of XP lost',
      D.born > 0 && D.xp === 500 && isHungry(D, yr) && stageOf(D).id !== 'egg');
    ok('...a hungry dragon learns nothing from play or a battle', gainXp(D, 50, yr).got === 0 && D.xp === 500);
    D.fed = yr;
    const meal = gainXp(D, LAIR.feedXp, yr, true);
    ok('...and a meal is what ends it: fed, she grows again',
      meal.got === LAIR.feedXp && !isHungry(D, yr) && gainXp(D, 10, yr).got === 10);
    ok('...and she will not eat again within the hour — and the refusal says when',
      typeof feedWhy(D, yr + 1000) === 'string' && feedWhy(D, yr + LAIR.feedGap) === null);
  }
  {
    const heights = [];
    for (let lv = 1; lv < ADULT_LEVEL; lv++) heights.push(drawHeight({ born: 1, xp: LEVEL_XP[lv], adult: false }));
    const grown = drawHeight({ born: 1, xp: LEVEL_XP[ADULT_LEVEL], adult: true });
    ok('every level-up is visible: she is drawn bigger at every level, and a grown dragon bigger still',
      heights.every((h, k) => k === 0 || h > heights[k - 1]) && grown > heights[heights.length - 1],
      `${heights.map((h) => h.toFixed(2)).join(' < ')} < ${grown}`);
    /* MEASURED, NOT ASSUMED (non-negotiable 8). The first pass sized her by a
       "width" that the billboard used as her HEIGHT, off a sheet 1.75 times
       wider than it is tall: the hatchling came out as tall as her kitten with
       wings 4.5 across. So the sheet is measured here the way the loader
       measures it, and the ladder is pinned against what it is read against —
       a kitten is 2.9 tall, and the grown panda is the other thing she rides. */
    const { w, h, d } = readPNG(new URL('../../public/sprites/beasts/dragon_sheet.png', import.meta.url));
    const [b] = findViewBoxes({ data: d }, w, h, 1, 1)[0];
    const aspect = (b.x1 - b.x0) / (b.y1 - b.y0);
    ok("her wingspan is the dragon sheet's own: WINGS is its measured width over its height",
      Math.abs(aspect / WINGS - 1) < 0.02, `${aspect.toFixed(3)} measured, ${WINGS} in lair.js`);
    const panda = PANDA_TIERS.find((t) => t.rideable).size;
    ok('a hatchling stands under half as tall as her kitten, and a grown dragon taller than a grown panda',
      heights[0] < 2.9 / 2 && grown > panda, `hatchling ${heights[0]}, grown ${grown}, panda ${panda}`);
    const ring = LAIR_RING.r - LAIR_RING.rock;
    const reach = [...heights, grown].map((hh) => Math.max(...ELEMENTS.flatMap((E) => SLOT_OFF.map(([sx, sz]) =>
      Math.hypot(...roomFor([E.pocket[0] + sx, E.pocket[1] + sz], hh)) + WINGS * hh / 2))));
    ok('...and at every size her wings fit inside the ring of rock: she stands nearer the middle as she grows',
      reach.every((r) => r <= ring + 1e-9), `widest reach ${Math.max(...reach).toFixed(2)} of ${ring}`);
    const top = { born: 1, xp: LEVEL_XP[ADULT_LEVEL] + 5000, adult: false };
    ok('reaching the top level OFFERS growing up; only her yes makes her grown',
      stageOf(top).id === 'juvenile' && evolveWhy(top) === null && typeof evolveWhy({ born: 1, xp: 0 }) === 'string');
  }
  {
    const kittens = PLAYER_STYLE.map((s) => s.name.toUpperCase());
    const all = ELEMENTS.flatMap((E) => [0, 1, 2, 3, 4].flatMap((s) => nameIdeas(E.id, s * 104729, 7)));
    const clash = [...new Set(all.filter((n) => kittens.includes(n)))];
    ok("a dragon's name ideas are never a kitten's name", clash.length === 0, clash.join(', ') || 'none');
    const a = nameIdeas('mist', 42), b = nameIdeas('mist', 42), c = nameIdeas('mist', 42 + 7919);
    ok('...six different ones, the same six for the same egg, and SHOW ME OTHER NAMES shows others',
      a.length === 6 && new Set(a).size === 6 && a.join() === b.join() && a.join() !== c.join());
    const shiny = newEgg('crystal', t0, 0);
    hatchDragon(shiny, t0 + LAIR.hatch);
    const plain = newEgg('crystal', t0, 0.99);
    hatchDragon(plain, t0 + LAIR.hatch);
    const plainTints = Array.from({ length: tintCount(plain) }, (_, k) => tintOf({ ...plain, tint: k }));
    ok('a shiny egg hatches GOLD, and a plain one can never be made gold',
      shiny.rare && tintOf(shiny) === RARE_TINT && !plain.rare && !plainTints.includes(RARE_TINT));
  }
  ok('the home store has a dragons row, normalise keeps every well-formed dragon and drops what is not one',
    !!emptyStore().dragons && normalise({ dragons: { Ember: { el: 'fire' }, Frost: 7 } }).dragons.Ember?.el === 'fire'
    && !('Frost' in normalise({ dragons: { Frost: 7 } }).dragons) && typeof normalise({}).dragons === 'object');

  /* ------------------------- in a real game ---------------------------- */
  const toasts = [];
  const game = {
    world, scene: new THREE.Scene(), players: [],
    kotodama: { price: 650 }, sessionCast: new Map(), sessionId: 'check-L',
    toast: (t, i) => toasts.push([i, t]),
    onScoreChanged: () => {}, audio: null,
    inspector: { openExt: () => true, cards: [], closeOne() {}, extOf: () => null },
  };
  localStorage.removeItem(homeKey('check-L'));
  const H = new Housing(game);
  H.build();
  H.debugOpen = true;
  const L = H.lair;
  const C = game.housingCards;
  const p0 = fakePlayer(0);
  const p1 = fakePlayer(1);
  const me = p0.style.name;
  game.players = [p0, p1];
  const site = HOME_SITES[0].id;
  const I = H.isleOf(site);
  const minka = H.housePrice('minka');
  p0.score = minka;
  const bought = H.buy(site, 'minka', [{ p: p0, share: minka }], null);
  H.purchase.finish();
  const Hm = H.store.homes[site];
  ok('(setup) a home to build the lair on', bought.ok && !!Hm, bought.why ?? '');
  const sp = firstYardSpot(Hm, it, I.radius);
  ok('the lair fits in the yard beside a first house', !!sp);
  // TURNED, so a sign wrong anywhere in the frame shows up as a dragon outside her lair
  const q = addOutdoor(Hm, 'dragonlair', sp.x, sp.z, 1.1);
  H.changed(Hm);
  I.group.visible = true;
  const P = I.placeOf('dragonlair');
  {
    const bad = [];
    for (const [fx, fz] of [[0, 0], [3, -2], [-4.6, 1.4], [0, -5.2]]) {
      const a = L._world(I, P, fx, fz);
      const b = I.local(...I._itemToHouse(q, fx, fz));
      if (Math.hypot(a.x - b.x, a.z - b.z) > 1e-6) bad.push(`${fx},${fz}`);
    }
    ok("the dragons' frame is the island's frame, on a lair turned 63°", bad.length === 0, bad.join(' ') || 'the same');
    const wobs = I.obstacles.map((o) => [o.x, o.z, o.r]);
    const front = L._world(I, P, 0, R + 2.5), back = L._world(I, P, 0, -(R + 2.5)), mid = L._world(I, P, 0, 0);
    ok('...and on the island it is solid: from behind she meets rock, through the mouth she walks in',
      blocked(wobs, back.x, back.z, mid.x, mid.z) && !blocked(wobs, front.x, front.z, mid.x, mid.z));
    const nObs = I.obstacles.length, nFx = I.fxSites.length;
    const ghost = yardBody(I, it);
    ok("the shop's turntable and build mode's ghost build the real lair without touching the island",
      !!ghost && ghost.children.length > 0 && I.obstacles.length === nObs && I.fxSites.length === nFx);
  }
  p0.position.set(P.x, P.y, P.z);
  ok("standing in it, the callout is THE DRAGON'S LAIR, and INTERACT opens its card",
    /DRAGON'S LAIR/.test(H.prompt(p0, 'E') ?? '') && H.interact(p0) && C.st.get(0)?.stack[0]?.v === 'lair', H.prompt(p0, 'E'));

  /* THE EGG. */
  const price = L.eggPrice();
  ok('an egg costs one orb, rounded like everything else on the islands', price === priceOf(LAIR.eggMult, orbPrice(world.pointsTotal, 1)), price);
  const noWhy = [];
  const view = () => {
    const V = C._view(0);
    for (const r of V.rows) if (r.disabled && !r.why) noWhy.push(r.title);
    return V;
  };
  const titles = () => view().rows.map((r) => r.title);
  p0.score = price - 1;
  ok("...short of it, the egg row is greyed and says how much more she needs",
    view().rows[0].disabled && /more/.test(view().rows[0].why));
  p0.score = price * 2;
  toasts.length = 0;
  const gotEgg = L.buyEgg(p0, Hm, 'fire');
  const D0 = L.dragonOf(p0);
  ok('buying an egg takes its price and puts it in her nest', gotEgg && p0.score === price && !!D0?.egg && !!L.views.get(me)?.egg);
  toasts.length = 0;
  ok('...one dragon each: a second egg is refused, and SAYS so',
    !L.buyEgg(p0, Hm, 'mist') && p0.score === price && toasts.some(([i, t]) => i === 0 && /one each/i.test(t)));
  p1.score = price * 2;
  toasts.length = 0;
  ok("...and a sister cannot raise one at somebody else's lair, and is told so",
    !L.buyEgg(p1, Hm, 'mist') && p1.score === price * 2 && toasts.some(([i]) => i === 1));
  {
    const before = hatchLeft(D0.egg);
    L.warm(p0);
    const took = before - hatchLeft(D0.egg);
    ok('WARM THE EGG takes a minute off the wait', Math.abs(took - LAIR.warm) < 250, `${took}ms`);
    toasts.length = 0;
    ok('...and a second cuddle straight after is refused, with how long to wait',
      !L.warm(p0) && toasts.some(([i, t]) => i === 0 && /seconds/.test(t)));
  }
  {
    const waiting = titles();
    const s1 = C.sig(0, { i: 0 });
    const laid = D0.egg.laid;
    D0.egg.laid -= 1000;
    const s2 = C.sig(0, { i: 0 });
    D0.egg.laid = laid - LAIR.hatch;
    const ready = titles();
    D0.egg.laid = laid;
    ok("the egg's rows never move: HATCH above WARM from the moment it is laid, greyed until it is ready",
      waiting.join() === ready.join() && /^HATCH/.test(waiting[0]) && view().rows[0].disabled, waiting.join(' / '));
    ok('...and the card repaints as the egg counts down (its signature moves every second)', s1 !== s2);
  }
  D0.egg.laid -= LAIR.hatch;
  const eggAt = L.views.get(me)?.group.position.clone();
  const hatched = L.hatch(p0);
  const v0 = L.views.get(me);
  ok('HATCH makes her dragon that press, and she comes out where the egg was',
    hatched && !D0.egg && D0.born > 0 && !!v0 && !v0.egg && !!eggAt && v0.pos.distanceTo(eggAt) < 1e-6);
  for (let k = 0; k < 150; k++) L.update(1 / 60, game.players);
  {
    const v = L.views.get(me);
    const dc = Math.hypot(v.pos.x - P.x, v.pos.z - P.z);
    ok('...and settles inside the ring of rock, by her own corner', dc < R - LAIR_RING.rock, dc.toFixed(2));
    const pos = v.pos;
    H.changed(Hm);                     // a rebuild: a new places map, the lair in the same place
    L.update(1 / 60, game.players);
    const w = L.views.get(me);
    ok('a yard rebuild redraws her where she IS — no teleport — and points her at the new place',
      w.pos === pos && w.L.P === I.placeOf('dragonlair'));
  }
  toasts.length = 0;
  ok('a dragon fresh out of the egg is full: FEED is refused, and says when',
    !L.feed(p0) && toasts.some(([i, t]) => i === 0 && /full/i.test(t)));

  /* THE CARD, with a dragon. */
  {
    const full = titles();
    D0.fed = Date.now() - LAIR.hungryAfter - 1;
    const hungry = titles();
    D0.played = Date.now();
    const tired = titles();
    D0.fed = Date.now();
    D0.played = 0;
    ok("the lair card's rows never move with the clock: full, hungry or tired out, the same rows in the same places",
      full.join() === hungry.join() && full.join() === tired.join(), full.join(' / '));
    C._push(0, { v: 'lairbuy', site, el: 'fire', cursor: 0 });
    const buyV = view();
    C._pop(0);
    C._push(0, { v: 'lairevolve', site, cursor: 0 });
    const evoV = view();
    C._pop(0);
    ok('both questions open on NO, say what each button DOES, and have no primary',
      [buyV, evoV].every((V) => V.rows.length === 2 && /^NO, /.test(V.rows[0].title) && /^YES, /.test(V.rows[1].title) && !V.rows.some((r) => r.primary)));
    C._push(0, { v: 'lairname', site, cursor: 0 });
    const n1 = view().rows.map((r) => r.title);
    view().rows[n1.length - 1].go();
    const n2 = view().rows.map((r) => r.title);
    view().rows[0].go();
    ok('naming: SHOW ME OTHER NAMES changes the names and not the row count, and a pick names her',
      n1.length === n2.length && n1.join() !== n2.join() && D0.name === n2[0] && C._top(0).v === 'lair', `${n1.length} rows, named ${D0.name}`);
  }

  /* WALKS AND TAG. */
  p0.position.set(P.x, P.y, P.z);
  ok('GO FOR A WALK starts on her island', L.start(p0, 'walk') && L.playing(0)?.kind === 'walk');
  {
    const xp = D0.xp;
    for (let k = 0; k < 600; k++) {
      const a = k * 0.02;
      p0.position.set(I.x + Math.cos(a) * 20, P.y, I.z + Math.sin(a) * 20);
      L.update(1 / 60, game.players);
    }
    ok('a walk pays as she walks, up to its cap, and then ends itself', D0.xp - xp === LAIR.walkMax && !L.playing(0), `+${D0.xp - xp}`);
    L.start(p0, 'walk');
    toasts.length = 0;
    p0.position.set(I.x + I.radius + 10, P.y, I.z);
    L.update(1 / 60, game.players);
    ok('...and walking off the island sends her home, and says so', !L.playing(0) && toasts.some(([i, t]) => i === 0 && /home/i.test(t)));
  }
  p0.position.set(P.x, P.y, P.z);
  ok('PLAY TAG starts', L.start(p0, 'tag'));
  {
    const S = L.playing(0);
    const xp = D0.xp;
    for (let guard = 0; L.playing(0) && guard < 40; guard++) {
      for (let k = 0; k < 90; k++) L.update(1 / 60, game.players);     // she darts to her spot
      const v = L.views.get(me);
      p0.position.set(v.pos.x, v.pos.y - 1, v.pos.z);                   // and is touched there
      L.update(1 / 60, game.players);
    }
    ok(`...touching her ${LAIR.playTags} times wins the game, and pays`,
      !L.playing(0) && S.tags === LAIR.playTags && D0.xp - xp === LAIR.playXp, `${S.tags} tags, +${D0.xp - xp}`);
    toasts.length = 0;
    ok('...and another game straight after is refused until she has her breath back',
      !L.start(p0, 'tag') && toasts.some(([i]) => i === 0));
  }

  /* THE ARENA. */
  {
    toasts.length = 0;
    D0.fed = Date.now();
    const xb = D0.xp;
    H.battleFought([me, p1.style.name], []);
    const lost = D0.xp - xb;
    H.battleFought([me, p1.style.name], [me]);
    const won = D0.xp - xb - lost;
    ok("a battle teaches every fighter's dragon once — and a win teaches more",
      lost === LAIR.battleXp && won === LAIR.battleXp + LAIR.winXp, `+${lost} for a loss, +${won} for a win`);
    D0.fed = Date.now() - LAIR.hungryAfter - 1000;
    const xh = D0.xp;
    toasts.length = 0;
    H.battleFought([me], [me]);
    ok('...but a HUNGRY dragon learns nothing from it, and her kitten is told to feed her',
      D0.xp === xh && toasts.some(([i, t]) => i === 0 && /hungry/i.test(t)));
    D0.fed = Date.now();
    const tsrc = readFileSync(new URL('../../src/systems/tournament.js', import.meta.url), 'utf8');
    const fin = tsrc.slice(tsrc.indexOf('_finishTournament() {'));
    const body = fin.slice(0, fin.indexOf('\n  _updateResult'));
    ok('the tournament tells the lair once per match, outside the win branch — a draw still teaches',
      (tsrc.match(/battleFought/g) ?? []).length === 1 && body.includes('battleFought')
      && body.indexOf('battleFought') > body.indexOf('this.score = 0;'));
    game.tournament = { state: 'live' };
    p0.position.set(I.x + 6, P.y + 1, I.z + 6);
    for (let k = 0; k < 240; k++) L.update(1 / 60, game.players);
    const vr = L.views.get(me);
    const dr = Math.hypot(vr.pos.x - p0.position.x, vr.pos.z - p0.position.z);
    ok("in a live match she flies at her kitten's shoulder", vr.inRing && dr < 3, dr.toFixed(2));
    game.tournament = { state: 'off' };
    for (let k = 0; k < 400; k++) L.update(1 / 60, game.players);
    const vh = L.views.get(me);
    const dh = Math.hypot(vh.pos.x - P.x, vh.pos.z - P.z);
    ok('...and after it she is home in her lair', !vh.inRing && dh < R, dh.toFixed(2));
    delete game.tournament;
  }

  /* THE DEBUG ROW winds the clocks on and nothing else: the egg is one the
     real HATCH will take, the dragon is exactly one level up, and the redraw
     is `sync`, which must not move her. */
  {
    const now = Date.now();
    H.store.dragons['check-egg'] = newEgg('mist', now, 0.9);
    const L0 = levelOf(D0.xp);
    const at = L.views.get(me).pos.clone();
    const n = L.debugGrow(now);
    const egg = H.store.dragons['check-egg'];
    ok("the debug row's grow: every egg ready to hatch, every dragon exactly one level up",
      n === 2 && hatchLeft(egg.egg, now) === 0 && levelOf(D0.xp) === L0 + 1, `${n} grown, level ${L0} -> ${levelOf(D0.xp)}`);
    ok('...and ready to eat and play again, drawn bigger where she stood',
      feedWhy(D0, now) === null && playWhy(D0, now) === null && !isHungry(D0, now)
      && L.views.get(me).pos.distanceTo(at) < 1e-6);
    delete H.store.dragons['check-egg'];
    L.sync();
  }

  /* GROWING UP — through the card's own buttons. */
  {
    D0.xp = LEVEL_XP[ADULT_LEVEL];
    C._push(0, { v: 'lairevolve', site, cursor: 0 });
    view().rows[0].go();
    const little = !D0.adult && C._top(0).v === 'lair';
    C._push(0, { v: 'lairevolve', site, cursor: 0 });
    view().rows[1].go();
    ok('growing up happens on YES, and only on YES', little && D0.adult && stageOf(D0).id === 'adult');
    p0.position.set(P.x, P.y, P.z);
    ok('...a grown dragon is too big for tag (and says so) but still goes for walks',
      typeof playWhy(D0) === 'string' && L.start(p0, 'walk'));
    L.stop(0, null);
    titles();
    ok('every greyed row on every lair card visited here says why on its face', noWhy.length === 0, noWhy.join(', ') || 'all say why');
  }

  /* NOTHING LOST. */
  {
    const k = Hm.outdoor.findIndex((o) => o.id === 'dragonlair');
    removeBuilt(Hm, 'yard', null, k);
    H.changed(Hm);
    L.update(1 / 60, game.players);
    ok('selling the lair keeps her dragon: the row stays, she is simply not drawn',
      H.store.dragons[me] === D0 && D0.born > 0 && !L.views.has(me));
    const sp2 = firstYardSpot(Hm, it, I.radius);
    addOutdoor(Hm, 'dragonlair', sp2.x, sp2.z, 0);
    H.changed(Hm);
    L.update(1 / 60, game.players);
    ok('...and the next lair she builds, she is in it: same dragon, same name, same XP',
      L.views.has(me) && L.dragonOf(p0) === D0 && !!D0.name);
    const snap = H.snapshot();
    const want = JSON.stringify(snap.dragons);
    H.sell(site);
    L.update(1 / 60, game.players);
    ok('selling the whole home keeps her dragon too', H.store.dragons[me] === D0 && !L.views.has(me));
    H.restore(JSON.parse(JSON.stringify(snap)));
    ok("a saved game carries every kitten's dragon", JSON.stringify(H.store.dragons) === want && !!H.store.dragons[me]?.born);
  }

  {
    const src = ['lair.js', 'laircards.js'].map((f) => readFileSync(new URL(`../../src/systems/housing/${f}`, import.meta.url), 'utf8')).join('\n');
    ok('no combat: nothing in the lair hurts anybody or asks the combat gate', !/\.hurt\(|strikePlayers|\.fighting\b/.test(src));
  }
  localStorage.removeItem(homeKey('check-L'));
}
