import * as THREE from 'three';
import { toonVertexMat, paint } from '../../core/gfx.js';
import { loadModel } from './models.js';

/* ---------------------------------------------------------------------------
   THE KOI — fed in real time, grown in real time.

   Each koi is a row in the home: colour, size, and when it was last fed. A
   feeding at least FEED_GAP after the last one grows every koi a step; a
   pond fed often gets a new fish now and then, and a new fish has a small
   chance of a RARE colour (gold, platinum, the red-and-black showa). Nothing
   shrinks and nothing dies — a forgotten pond is hungry koi that crowd the
   bank when somebody walks up.

   The fish are drawn from the vendored Polyfork koi (its colours are vertex
   colours, so a rare colour is a material tint, not a new model), with a
   procedural fish under it until the GLB loads.
--------------------------------------------------------------------------- */

const HOUR = 3600 * 1000;
export const FEED_GAP = 12 * HOUR;
export const KOI_MAX = 9;
export const KOI_COLOURS = [
  { id: 'kohaku', name: 'KOHAKU', colour: 0xff6a3a, rare: false },
  { id: 'yamabuki', name: 'YAMABUKI', colour: 0xffc23a, rare: false },
  { id: 'asagi', name: 'ASAGI', colour: 0x8fb6d8, rare: false },
  { id: 'ogon', name: 'GOLDEN OGON', colour: 0xffe680, rare: true },
  { id: 'platinum', name: 'PLATINUM', colour: 0xf2f4f8, rare: true },
  { id: 'showa', name: 'SHOWA', colour: 0x2a2228, rare: true },
];
const RARE_CHANCE = 0.12;

export function newKoi(rng = Math.random) {
  const rare = rng() < RARE_CHANCE;
  const pool = KOI_COLOURS.filter((c) => c.rare === rare);
  const c = pool[Math.floor(rng() * pool.length)];
  return { colour: c.id, size: 1, born: Date.now(), fed: Date.now() };
}

export class Koi {
  constructor(housing) {
    this.H = housing;
    this.views = new Map();
  }

  sync() {
    for (const v of this.views.values()) v.group.parent?.remove(v.group);
    this.views.clear();
    for (const I of this.H.isles) {
      const H = I.home;
      if (!H || H.preview) continue;
      const plot = Object.entries(H.yard ?? {}).find(([, id]) => id === 'koipond')?.[0];
      if (!plot) continue;
      H.koi ??= { fish: [newKoi(), newKoi(), newKoi()], fed: 0 };
      const P = I.plots.find((q) => q.id === plot);
      const group = new THREE.Group();
      I.itemGroup.add(group);
      const fish = H.koi.fish.map((f, k) => this._fish(f, k, P, group));
      this.views.set(I.site.id, { group, fish, P });
    }
  }

  _fish(f, k, P, group) {
    const c = KOI_COLOURS.find((q) => q.id === f.colour) ?? KOI_COLOURS[0];
    const g = new THREE.Group();
    const geo = new THREE.SphereGeometry(0.35, 10, 6);
    geo.scale(1.8, 0.5, 0.7);
    paint(geo, 0xffffff);
    const mat = toonVertexMat({ color: c.colour });
    g.add(new THREE.Mesh(geo, mat));
    const tail = new THREE.ConeGeometry(0.22, 0.5, 4);
    tail.rotateZ(Math.PI / 2);
    tail.translate(-0.8, 0, 0);
    paint(tail, 0xffffff);
    g.add(new THREE.Mesh(tail, mat));
    loadModel('koi-base').then((m) => {
      if (!m) return;
      g.clear();
      const c2 = m.clone(true);
      c2.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color?.set(c.colour); } });
      c2.rotation.y = Math.PI / 2;
      g.add(c2);
    });
    g.scale.setScalar(0.6 + f.size * 0.25);
    g.userData = { a: k * 1.7, r: 1 + (k % 3) * ((P.r - 2.4) / 3), sp: 0.35 + (k % 4) * 0.08, f };
    group.add(g);
    return g;
  }

  update(dt) {
    const t = this.H.time;
    for (const v of this.views.values()) {
      for (const g of v.fish) {
        const u = g.userData;
        const a = u.a + t * u.sp;
        g.position.set(v.P.x + Math.cos(a) * u.r, v.P.y + 0.18, v.P.z + Math.sin(a) * u.r);
        g.rotation.y = -a - Math.PI / 2;
      }
    }
  }

  /** Feed: grows them if it has been FEED_GAP; sometimes a new one. */
  feed(p, H) {
    const G = this.H.game;
    const now = Date.now();
    H.koi ??= { fish: [newKoi()], fed: 0 };
    G.audio?.play?.('chomp');
    if (now - (H.koi.fed ?? 0) < FEED_GAP) {
      G.toast('The koi are still full! Come back later to feed them again.', p.index);
      return;
    }
    H.koi.fed = now;
    for (const f of H.koi.fish) { f.size = Math.min(6, (f.size ?? 1) + 1); f.fed = now; }
    let born = null;
    if (H.koi.fish.length < KOI_MAX && Math.random() < 0.5) {
      born = newKoi();
      H.koi.fish.push(born);
    }
    this.H.save();
    this.sync();
    const c = born && KOI_COLOURS.find((q) => q.id === born.colour);
    G.toast(born
      ? `The koi gobble it up and grow! A new ${c.rare ? 'RARE ' : ''}${c.name} koi appeared!`
      : 'The koi gobble it up and grow bigger!', p.index);
  }

  describe(H) {
    return (H.koi?.fish ?? []).map((f) => {
      const c = KOI_COLOURS.find((q) => q.id === f.colour) ?? KOI_COLOURS[0];
      return { name: c.name, rare: c.rare, size: f.size };
    });
  }
}
