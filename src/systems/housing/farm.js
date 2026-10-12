import * as THREE from 'three';
import { toonVertexMat, paint } from '../../core/gfx.js';

/* ---------------------------------------------------------------------------
   THE FARM AND THE PEN — the two things on her island that run on the
   CLOCK ON THE WALL, not the game's clock. Richard: "real time", like a
   Tamagotchi. Both are written as timestamps in the home row and computed
   from `Date.now()` when anybody looks, so nothing ticks while the tab is
   closed and nothing is lost by it either.

   NOTHING DIES (non-negotiable 4, extended to pets). An animal left alone
   for a month is HUNGRY — drawn sitting down, with a speech bubble — and is
   happy again the moment somebody feeds it. The worst neglect costs her the
   panda's care bonus, never an animal.

   THE CARE LADDER — what visiting buys her panda:
     a visit (feeding) at most once per CARE_GAP; the VISITS in the last
     CARE_WINDOW count. Two visits at least 24h apart in a week is the "twice
     a week" bonus, and is what the top step asks for.
       1 visit  in the week → +20% panda health
       2 visits             → + damage
       2 visits ≥24h apart  → + an extra jump while riding
       3+ visits, ≥24h apart → the panda's own sweep (ATTACKS.sweep)
   `careLevel` is the only place this is decided.
--------------------------------------------------------------------------- */

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
export const BAMBOO_GROW = 2 * HOUR;
export const BAMBOO_MAX = 12;
/** Points per stalk, as a fraction of one orb's price. */
export const BAMBOO_VALUE = 0.012;
export const CARE_WINDOW = 7 * DAY;
export const CARE_GAP = DAY;
export const HUNGRY_AFTER = 7 * DAY;

export const ANIMALS = [
  { id: 'chick', name: 'CHICK', colour: 0xffe066, size: 0.6 },
  { id: 'bunny', name: 'BUNNY', colour: 0xf3ece4, size: 0.7 },
  { id: 'goat', name: 'GOAT', colour: 0xd8cdbd, size: 1.0 },
];

/** The care step from the visit log, at `now`. Pure. */
export function careLevel(visits = [], now = Date.now()) {
  const recent = visits.filter((t) => now - t < CARE_WINDOW).sort((a, b) => a - b);
  if (!recent.length) return 0;
  let spaced = 1;
  let last = recent[0];
  for (const t of recent.slice(1)) {
    if (t - last >= CARE_GAP) { spaced++; last = t; }
  }
  if (spaced >= 3) return 4;
  if (spaced >= 2) return 3;
  if (recent.length >= 2) return 2;
  return 1;
}

/** What a care level does to her panda — read by panda.js and player.js. */
export function careBuff(level) {
  return {
    hp: level >= 1 ? 1.2 : 1,
    dmg: level >= 2 ? 1.15 : 1,
    jump: level >= 3 ? 1 : 0,
    sweep: level >= 4,
  };
}

/** How many stalks are standing, from the last harvest. Pure. */
export function stalksAt(farm, now = Date.now()) {
  if (!farm) return 0;
  return Math.min(BAMBOO_MAX, Math.floor((now - (farm.cut ?? now)) / BAMBOO_GROW));
}

export class Farm {
  constructor(housing) {
    this.H = housing;
    this.views = new Map(); // site → { group, stalks[], animals[] }
    this._check = 0;
  }

  /** Make the rows exist for any home with the plot, and redraw. */
  sync() {
    const now = Date.now();
    for (const I of this.H.isles) {
      const H = I.home;
      const v = this.views.get(I.site.id);
      if (v) { v.group.parent?.remove(v.group); this.views.delete(I.site.id); }
      if (!H || H.preview) continue;
      const yard = Object.entries(H.yard ?? {});
      const farmPlot = yard.find(([, id]) => id === 'bamboofarm')?.[0];
      const penPlot = yard.find(([, id]) => id === 'pen')?.[0];
      if (farmPlot && !H.farm) H.farm = { cut: now - BAMBOO_GROW * 4 };
      if (penPlot && !H.pen) {
        H.pen = { animals: ANIMALS.map((a) => ({ kind: a.id, fed: now })), visits: [] };
      }
      if (!farmPlot && !penPlot) continue;
      const group = new THREE.Group();
      I.itemGroup.add(group);
      const view = { group, stalks: [], animals: [], farmPlot, penPlot };
      this.views.set(I.site.id, view);
      if (farmPlot) this._drawStalks(I, view);
      if (penPlot) this._drawAnimals(I, view);
    }
    this.applyCare();
  }

  _plot(I, id) {
    return I.plots.find((P) => P.id === id);
  }

  _drawStalks(I, view) {
    const P = this._plot(I, view.farmPlot);
    const mat = toonVertexMat();
    for (let k = 0; k < BAMBOO_MAX; k++) {
      const a = k * 2.399;
      const r = 1 + (k % 4) * ((P.r - 2.2) / 4);
      const geo = new THREE.CylinderGeometry(0.16, 0.2, 1, 6);
      geo.translate(0, 0.5, 0);
      paint(geo, k % 2 ? 0x6fb04a : 0x5a9a3a);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(P.x + Math.cos(a) * r, P.y, P.z + Math.sin(a) * r);
      view.group.add(m);
      view.stalks.push(m);
    }
    this._grow(I, view);
  }

  _grow(I, view) {
    const n = stalksAt(I.home?.farm);
    view.stalks.forEach((m, k) => {
      m.visible = k < n;
      m.scale.y = 4 + ((k * 37) % 5);
    });
  }

  _drawAnimals(I, view) {
    const P = this._plot(I, view.penPlot);
    const H = I.home;
    for (const [k, A] of (H.pen?.animals ?? []).entries()) {
      const def = ANIMALS.find((d) => d.id === A.kind) ?? ANIMALS[0];
      /* PLACEHOLDER BODIES: a body, a head and two ears, in the animal's
         colour. Sprites for them are a follow-up. */
      const parts = [];
      const body = new THREE.SphereGeometry(0.55, 10, 8);
      body.scale(1.2, 0.9, 0.9);
      body.translate(0, 0.55, 0);
      paint(body, def.colour);
      const head = new THREE.SphereGeometry(0.38, 10, 8);
      head.translate(0.6, 0.95, 0);
      paint(head, def.colour);
      const eye = new THREE.SphereGeometry(0.06, 6, 4);
      eye.translate(0.92, 1.02, 0.14);
      paint(eye, 0x1a1a1a);
      parts.push(body, head, eye);
      if (def.id === 'bunny' || def.id === 'goat') {
        for (const s of [-1, 1]) {
          const ear = new THREE.ConeGeometry(0.1, def.id === 'bunny' ? 0.6 : 0.3, 5);
          ear.translate(0.55, 1.4, s * 0.15);
          paint(ear, def.colour);
          parts.push(ear);
        }
      }
      if (def.id === 'chick') {
        const beak = new THREE.ConeGeometry(0.08, 0.2, 4);
        beak.rotateZ(-Math.PI / 2);
        beak.translate(1.0, 0.92, 0);
        paint(beak, 0xff9a2a);
        parts.push(beak);
      }
      const g = new THREE.Group();
      for (const geo of parts) g.add(new THREE.Mesh(geo, toonVertexMat()));
      g.scale.setScalar(def.size * 1.6);
      g.userData = { a: k * 2.1, r: 1 + k * 0.9, P, A };
      view.group.add(g);
      view.animals.push(g);
    }
  }

  update(dt) {
    this._check -= dt;
    const recheck = this._check <= 0;
    if (recheck) { this._check = 20; this.applyCare(); }
    const now = Date.now();
    const t = this.H.time;
    for (const I of this.H.isles) {
      const view = this.views.get(I.site.id);
      if (!view) continue;
      if (recheck && view.stalks.length) this._grow(I, view);
      for (const g of view.animals) {
        const u = g.userData;
        const hungry = now - (u.A.fed ?? 0) > HUNGRY_AFTER;
        // A hungry animal sits by the trough; a fed one potters about.
        const a = hungry ? u.a : u.a + t * 0.35;
        const r = hungry ? u.P.r - 2.4 : Math.min(u.r, u.P.r - 2);
        g.position.set(u.P.x + Math.cos(a) * r, u.P.y + (hungry ? 0 : Math.abs(Math.sin(t * 6 + u.a)) * 0.25), u.P.z + Math.sin(a) * r);
        g.rotation.y = -a + (hungry ? 0 : -Math.PI / 2);
      }
    }
  }

  /** INTERACT at the bamboo: cut every stalk, sell it to Roshi on the spot. */
  harvest(p, H) {
    const G = this.H.game;
    if (!H.farm) { this.sync(); }
    const n = stalksAt(H.farm);
    if (!H.owners.includes(p.style.name)) {
      G.toast(`That is ${H.owners.join(' & ')}'s bamboo — no cutting!`, p.index);
      return;
    }
    if (n <= 0) {
      const wait = Math.ceil((BAMBOO_GROW - (Date.now() - H.farm.cut) % BAMBOO_GROW) / 60000);
      G.toast(`The bamboo is still growing — the next stalk is ready in about ${wait} minutes.`, p.index);
      return;
    }
    const pts = n * Math.max(5, Math.round(this.H.price(BAMBOO_VALUE)));
    H.farm.cut = Date.now();
    p.score += pts;
    G.onScoreChanged?.(p);
    G.audio?.play?.('bamboo');
    G.toast(`${p.name} harvested ${n} bamboo and sold it to Roshi for ${pts} points!`, p.index);
    this.H.save();
    const v = this.views.get(H.site);
    const I = this.H.isleOf(H.site);
    if (v && I) this._grow(I, v);
  }

  /** Feed the pen: a VISIT, counted for her panda at most once a CARE_GAP. */
  feed(p, H) {
    const G = this.H.game;
    const now = Date.now();
    if (!H.pen) this.sync();
    for (const A of H.pen.animals) A.fed = now;
    const last = H.pen.visits[H.pen.visits.length - 1] ?? 0;
    let counted = false;
    if (now - last >= CARE_GAP || !H.pen.visits.length) {
      H.pen.visits.push(now);
      counted = true;
    }
    H.pen.visits = H.pen.visits.filter((t) => now - t < CARE_WINDOW * 2);
    this.H.save();
    this.applyCare();
    G.audio?.play?.('chomp');
    const L = careLevel(H.pen.visits, now);
    G.toast(counted
      ? `The animals munch happily! Panda care is now level ${L} of 4.`
      : 'The animals munch happily! (Come back tomorrow to count another visit.)', p.index);
  }

  /** Hand every present owner's panda its care buff. */
  applyCare() {
    const now = Date.now();
    for (const p of this.H.game.players ?? []) {
      const H = this.H.homeOf(p);
      const L = H?.pen ? careLevel(H.pen.visits, now) : 0;
      const B = careBuff(L);
      if (p.panda) {
        const had = p.panda.care?.hp ?? 1;
        p.panda.care = B;
        if (had !== B.hp && p.panda.maxHp > 0) p.panda.resetHp?.();
      }
      p.pandaCare = B;
    }
  }

  /** For the pen card. */
  describe(H, now = Date.now()) {
    const L = careLevel(H.pen?.visits ?? [], now);
    const animals = (H.pen?.animals ?? []).map((A) => {
      const def = ANIMALS.find((d) => d.id === A.kind) ?? ANIMALS[0];
      const days = Math.floor((now - (A.fed ?? 0)) / DAY);
      return { name: def.name, hungry: now - (A.fed ?? 0) > HUNGRY_AFTER, days };
    });
    return { level: L, animals };
  }
}
