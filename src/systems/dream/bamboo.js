import * as THREE from 'three';
import { SIM, HOLO } from '../../world/simworld.js';
import { Kiosk, idleIn, isleSpot, stars3 } from './kiosk.js';

/* ---------------------------------------------------------------------------
   BAMBOO INFILTRATION — 忍. Through a holo-bamboo forest to the scroll at the
   far side, past four watchers whose sight sweeps back and forth across the
   path. Seen for SEEN_T seconds and she is caught, and goes back to the last
   lantern she lit. Bamboo blocks a watcher's view — hiding works.

   THE SWEEP IS A SINE, again on purpose: a watcher looks along
        θ(t) = θ₀ + S · sin(ω t + φ)
   so the kitten who waits at the edge of a clearing is watching a sine wave
   swing, and the one who learns its rhythm walks through on the slack. The
   cone drawn on the floor is drawn from `lookAngle`, which is the same
   function `seenBy` asks — the picture cannot lie about where he is looking.

   THE FOREST IS BUILT FROM A SEED and a ROUTE, never by hand: clumps fill the
   island except a corridor round the route, so the way through always exists.
   `world-check` measures that (no clump inside the corridor) and then sends a
   patient kitten along it who waits whenever a step would be seen, and
   demands she reaches the scroll unseen.

   CAUGHT IS NOT FAILED. A nine-year-old caught at the third watcher who is sent
   back to the bridge will not try a second time; she is sent back to her last
   lantern, it costs her SPOT_COST seconds on the clock, and it says so.
--------------------------------------------------------------------------- */

/** The route, as (a, b) on the island: from the bridge to the scroll. */
export const ROUTE = [[-24, 0], [-12, -10], [0, 8], [12, -8], [22, 0]];
export const CORRIDOR = 3.0;
export const CLUMP_R = 1.0;
export const SEEN_T = 0.35;
export const SPOT_COST = 10;
export const BAMBOO_BANDS = [90, 55, 36];
export const WATCH = { range: 10, half: 0.38, off: 5.5, margin: 0.15 };
/** How far from its watcher a stretch's hide stands (of WATCH.off to the path). */
export const HIDE_AT = 3.3;
/** The kiosk, beside the light-cycle pad rather than on it. */
export const KIOSK_AT = [-25, 5];

/* A tiny seeded generator, so the forest is the same every afternoon. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function distToPolyline(pts, a, b) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]; const [bx, bz] = pts[i + 1];
    const ex = bx - ax; const ez = bz - az;
    const t = Math.max(0, Math.min(1, ((a - ax) * ex + (b - az) * ez) / (ex * ex + ez * ez || 1)));
    best = Math.min(best, Math.hypot(a - (ax + ex * t), b - (az + ez * t)));
  }
  return best;
}

/**
 * The whole layout in island terms (a along fwd, b across): watchers, clumps,
 * lanterns, scroll. Pure, so the check can build it without a scene.
 */
export function bambooLayout(r) {
  const watchers = [];
  for (let i = 0; i < ROUTE.length - 1; i++) {
    const [a0, b0] = ROUTE[i]; const [a1, b1] = ROUTE[i + 1];
    const ma = (a0 + a1) / 2; const mb = (b0 + b1) / 2;
    const L = Math.hypot(a1 - a0, b1 - b0);
    const side = i % 2 ? 1 : -1;
    const na = (-(b1 - b0) / L) * side; const nb = ((a1 - a0) / L) * side;
    const wa = ma + na * WATCH.off; const wb = mb + nb * WATCH.off;
    /* Facing the middle of its stretch of path, sweeping across it — but
       NEVER AS FAR AS THE CORNERS. The first cut swung every watcher ±0.75
       rad and two of the lanterns sat inside a cone a fifth of the time, so
       the checkpoint she is sent back to could catch her again before she
       had moved. Now the sweep stops WATCH.margin short of the corner's
       bearing, and `world-check` asserts every lantern is never seen. */
    const S = Math.max(0.25, Math.atan2(L / 2, WATCH.off) - WATCH.half - WATCH.margin);
    watchers.push({ a: wa, b: wb, base: Math.atan2(mb - wb, ma - wa), S, w: 0.8 + 0.15 * i, ph: i * 1.3 });
  }
  /* ONE HIDE PER WATCHER, between him and the middle of his stretch. Without
     it the stretch CANNOT be crossed, and that was measured, not guessed: the
     path runs along his sweep, so his cone is always somewhere between her
     and the far side, and passing through it takes ~2.2s against SEEN_T. A
     time-expanded search over the first layout found no way through at any
     start time. The hide's shadow on the path is the stepping stone — in
     while he looks away, wait, out while he looks the other way — which is
     how every stealth game teaches it, and what the card promises. */
  const clumps = watchers.map((w, i) => {
    const [a0, b0] = ROUTE[i]; const [a1, b1] = ROUTE[i + 1];
    const ma = (a0 + a1) / 2; const mb = (b0 + b1) / 2;
    const k = HIDE_AT / WATCH.off;
    return { a: w.a + (ma - w.a) * k, b: w.b + (mb - w.b) * k, n: 6, h: 5.2, hide: true };
  });
  const route = [[-(r + 2), 0], ...ROUTE];
  const R = rng(0x6a3b);
  for (let a = -r; a <= r; a += 3.4) {
    for (let b = -r; b <= r; b += 3.4) {
      const ca = a + (R() - 0.5) * 1.6;
      const cb = b + (R() - 0.5) * 1.6;
      if (Math.hypot(ca, cb) > r - 2.5) continue;
      if (distToPolyline(route, ca, cb) < CORRIDOR + CLUMP_R + 0.2) continue;
      if (watchers.some((w) => Math.hypot(ca - w.a, cb - w.b) < 2.6)) continue;
      if (clumps.some((c) => c.hide && Math.hypot(ca - c.a, cb - c.b) < 2.4)) continue;
      if (Math.hypot(ca - KIOSK_AT[0], cb - KIOSK_AT[1]) < 3.2) continue;
      clumps.push({ a: ca, b: cb, n: 3 + Math.floor(R() * 3), h: 3.6 + R() * 2.2 });
    }
  }
  return {
    watchers, clumps,
    lanterns: ROUTE.slice(1, -1).map(([a, b]) => ({ a, b })),
    start: { a: ROUTE[0][0], b: ROUTE[0][1] },
    scroll: { a: ROUTE[ROUTE.length - 1][0], b: ROUTE[ROUTE.length - 1][1] },
  };
}

/** Where watcher `w` is looking at time `t`, as an angle in (a, b). THE ONE PLACE. */
export function lookAngle(w, t) {
  return w.base + w.S * Math.sin(w.w * t + w.ph);
}

/**
 * Does watcher `w` see the point (a, b) at time `t`? In range, inside the cone,
 * and no clump on the line between them.
 */
export function seenBy(w, t, a, b, clumps) {
  const da = a - w.a; const db = b - w.b;
  const d = Math.hypot(da, db);
  if (d > WATCH.range || d < 1e-3) return false;
  let off = Math.atan2(db, da) - lookAngle(w, t);
  off = Math.atan2(Math.sin(off), Math.cos(off));
  if (Math.abs(off) > WATCH.half) return false;
  for (const c of clumps) {
    // Distance from the clump to the sight line, only if it lies between them.
    const u = ((c.a - w.a) * da + (c.b - w.b) * db) / (d * d);
    if (u <= 0 || u >= 1) continue;
    if (Math.hypot(w.a + da * u - c.a, w.b + db * u - c.b) < CLUMP_R) return false;
  }
  return true;
}

/**
 * How far watcher `w` sees along island angle `theta`: the range, or the first
 * clump that `seenBy` would call in the way — a clump blocks a point when its
 * centre projects between them and lies within CLUMP_R of the line, so along
 * one ray everything past that projection is hidden. The cone on the floor is
 * drawn from this, so the SHADOW behind each clump is drawn where `seenBy`
 * puts it, and "bamboo hides you" is something she can see.
 */
export function sightReach(w, theta, clumps) {
  const ca = Math.cos(theta); const cb = Math.sin(theta);
  let reach = WATCH.range;
  for (const c of clumps) {
    const t = (c.a - w.a) * ca + (c.b - w.b) * cb;
    if (t <= 0 || t >= reach) continue;
    if (Math.abs(-(c.a - w.a) * cb + (c.b - w.b) * ca) < CLUMP_R) reach = t;
  }
  return reach;
}

/** Rays in a drawn cone. */
export const CONE_RAYS = 28;

export class BambooInfiltration {
  constructor(dream, isle) {
    this.dream = dream;
    this.isle = isle;
    const L = bambooLayout(isle.r);
    this.layout = L;
    const at = (a, b) => isleSpot(isle, a, b);
    const sim = dream.sim;
    // The forest: one instanced mesh of canes, one solid per clump.
    const canes = [];
    const R = rng(0x51ce);
    for (const c of L.clumps) {
      const q = at(c.a, c.b);
      sim.solids.push({ x: q.x, z: q.z, r: CLUMP_R });
      for (let k = 0; k < c.n; k++) {
        const ang = R() * Math.PI * 2;
        const rr = R() * 0.7;
        canes.push({ x: q.x + Math.cos(ang) * rr, z: q.z + Math.sin(ang) * rr, h: c.h * (0.75 + R() * 0.4), lean: (R() - 0.5) * 0.12 });
      }
    }
    const geo = new THREE.CylinderGeometry(0.13, 0.16, 1, 6).translate(0, 0.5, 0);
    const inst = new THREE.InstancedMesh(geo,
      new THREE.MeshBasicMaterial({ color: 0x6dffb0, transparent: true, opacity: 0.5, toneMapped: false, depthWrite: false }), canes.length);
    const m4 = new THREE.Matrix4();
    const qt = new THREE.Quaternion();
    const e = new THREE.Euler();
    canes.forEach((c, i) => {
      e.set(c.lean, 0, -c.lean);
      inst.setMatrixAt(i, m4.compose(new THREE.Vector3(c.x, isle.y, c.z), qt.setFromEuler(e), new THREE.Vector3(1, c.h, 1)));
    });
    sim.root.add(inst);
    // The watchers: a post, an eye, and the cone of what it sees on the floor.
    this.watchers = L.watchers.map((w) => {
      const q = at(w.a, w.b);
      sim.solids.push({ x: q.x, z: q.z, r: 0.7 });
      const grp = new THREE.Group();
      grp.position.set(q.x, isle.y, q.z);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2.6, 8).translate(0, 1.3, 0),
        new THREE.MeshBasicMaterial({ color: 0x1a3a40, transparent: true, opacity: 0.9 }));
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xffb347, toneMapped: false }));
      eye.position.y = 2.9;
      /* A FAN OF RAYS, each as long as `sightReach` says, rewritten every
         frame. In the group's frame +X is where he looks and a ray at island
         offset psi lies along (cos psi, 0, sin psi) — the group is turned by
         -angle (see `update`), which flips the sign a CircleGeometry would
         have needed. */
      const fan = new THREE.BufferGeometry();
      fan.setAttribute('position', new THREE.BufferAttribute(new Float32Array((CONE_RAYS + 2) * 3), 3));
      const idx = [];
      for (let j = 0; j < CONE_RAYS; j++) idx.push(0, j + 1, j + 2);
      fan.setIndex(idx);
      const cone = new THREE.Mesh(fan,
        new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.22, toneMapped: false, depthWrite: false, side: THREE.DoubleSide }));
      cone.position.y = 0.07;
      cone.frustumCulled = false;
      grp.add(post, eye, cone);
      sim.root.add(grp);
      // Only the clumps he could ever see past, so the per-frame clip is cheap.
      const near = L.clumps.filter((c) => Math.hypot(c.a - w.a, c.b - w.b) < WATCH.range + CLUMP_R);
      return { ...w, grp, cone, eye, near };
    });
    // Lanterns (checkpoints), and the scroll.
    this.lanterns = L.lanterns.map((l) => {
      const q = at(l.a, l.b);
      const side = at(l.a, l.b + 2.0);
      const g = new THREE.Group();
      g.position.set(side.x, isle.y, side.z);
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 0.6).translate(0, 0.7, 0),
        new THREE.MeshBasicMaterial({ color: 0x2a3a40 }));
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8).translate(0, 1.7, 0),
        new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.8, toneMapped: false }));
      g.add(base, light);
      sim.root.add(g);
      return { ...l, x: q.x, z: q.z, light };
    });
    const s = at(L.scroll.a, L.scroll.b);
    this.scroll = { x: s.x, z: s.z };
    const scroll = new THREE.Group();
    scroll.position.set(s.x, isle.y, s.z);
    const altar = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.2, 0.8, 16).translate(0, 0.4, 0),
      new THREE.MeshBasicMaterial({ color: 0x1a3040 }));
    this.scrollMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.6, 12),
      new THREE.MeshBasicMaterial({ color: HOLO.gold, toneMapped: false }));
    this.scrollMesh.rotation.z = Math.PI / 2;
    this.scrollMesh.position.y = 1.5;
    scroll.add(altar, this.scrollMesh);
    sim.root.add(scroll);
    sim.addSign(s.x, isle.y + 6, s.z, '巻', 'THE SCROLL', HOLO.gold);
    const k = at(...KIOSK_AT);
    this.kiosk = new Kiosk(dream, {
      x: k.x, z: k.z, y: isle.y, colour: 0x6dffb0, kanji: '忍', title: 'INFILTRATION',
      card: (p) => {
        const name = p.style?.name ?? p.name;
        const best = dream.progress.best(name, 'bamboo');
        return [
          { text: '忍 BAMBOO INFILTRATION', size: 1.8, color: 0x6dffb0, glow: true, jp: true },
          { text: 'Reach the scroll without being SEEN', size: 1.2 },
          { text: 'Watch the orange cones swing — bamboo hides you', size: 1.05, color: 0x9fefff },
          { text: `best ${best != null ? `${best.toFixed(1)}s` : '—'}   ${stars3(dream.progress.stars(name, 'bamboo'))}`, size: 1.2, color: HOLO.gold },
        ];
      },
      prompt: (p, key) => `[${key}]  BAMBOO INFILTRATION`,
      interact: (p) => dream.startDrill(p, INFILTRATE(this), { x: isle.x, y: isle.y, z: isle.z, r: isle.r, fwd: isle.fwd }),
    });
    this.stations = [this.kiosk.station];
    dream.sim.tickers.push((dt, t) => this.update(dt, t));
  }

  /** Her place in island terms. */
  coords(p) {
    const f = this.isle.fwd;
    const x = p.position.x - SIM.dx - this.isle.x;
    const z = p.position.z - SIM.dz - this.isle.z;
    return { a: x * f.x + z * f.z, b: -x * f.z + z * f.x };
  }

  /** The angle an (a, b) direction makes in the layer, for the cone's mesh. */
  _worldAngle(theta) {
    const f = this.isle.fwd;
    // (a, b) unit -> layer x/z: x = f.x a - f.z b, z = f.z a + f.x b.
    const a = Math.cos(theta); const b = Math.sin(theta);
    return Math.atan2(f.z * a + f.x * b, f.x * a - f.z * b);
  }

  update(dt, t) {
    this.t = t;
    for (const w of this.watchers) {
      // The cone's +X is turned to the look direction: rotation.y = -angle.
      const look = lookAngle(w, t);
      w.grp.rotation.y = -this._worldAngle(look);
      const pos = w.cone.geometry.attributes.position;
      pos.setXYZ(0, 0, 0, 0);
      for (let j = 0; j <= CONE_RAYS; j++) {
        const psi = -WATCH.half + (2 * WATCH.half * j) / CONE_RAYS;
        const r = sightReach(w, look + psi, w.near);
        pos.setXYZ(j + 1, r * Math.cos(psi), 0, r * Math.sin(psi));
      }
      pos.needsUpdate = true;
      w.cone.material.color.set(w.seeing ? 0xff3b3b : 0xffb347);
      w.cone.material.opacity = w.seeing ? 0.4 : 0.22;
      w.seeing = false;
    }
    this.scrollMesh.rotation.x += dt;
    this.kiosk.update(dt, idleIn(this.dream));
  }

  faceCamera(camera) { this.kiosk.faceCamera(camera); }
}

function INFILTRATE(B) {
  return {
    id: 'bamboo', title: 'BAMBOO INFILTRATION', kanji: '忍',
    // No clock: leaving the island is the way out, and a 'Time! 0 of 1'
    // would be a refusal that explains nothing.
    goalText: 'To the scroll — unseen', bands: BAMBOO_BANDS,
    score: (d) => d.t + d.spotted * SPOT_COST, lowerIsBetter: true,
    setup(d) {
      d.spotted = 0;
      d.expo = 0;
      d.grace = 0;
      d.lit = -1;
      d.cp = { a: ROUTE[0][0], b: ROUTE[0][1] };
      for (const l of B.lanterns) l.light.material.color.set(0x555555);
    },
    tick(d, dt) {
      const p = d.p;
      const q = B.coords(p);
      const t = B.t ?? 0;
      // Lanterns light as she reaches them, in order.
      B.lanterns.forEach((l, i) => {
        if (i > d.lit && Math.hypot(q.a - l.a, q.b - l.b) < 2.6) {
          d.lit = i;
          d.cp = { a: l.a, b: l.b };
          l.light.material.color.set(d.colour);
          d.dream.game.sfx?.('star');
        }
      });
      d.grace = Math.max(0, d.grace - dt);
      let seen = null;
      if (d.grace <= 0) {
        for (const w of B.watchers) {
          if (seenBy(w, t, q.a, q.b, B.layout.clumps)) { seen = w; w.seeing = true; }
        }
      }
      d.expo = seen ? d.expo + dt : Math.max(0, d.expo - dt * 2);
      if (d.expo >= SEEN_T) {
        d.expo = 0;
        d.grace = 1.5;
        d.spotted++;
        const c = isleSpot(B.isle, d.cp.a, d.cp.b);
        p.position.set(c.x + SIM.dx, B.isle.y + 0.3, c.z + SIM.dz);
        p.velocity?.set(0, 0, 0);
        d.dream.game.sfx?.('spotted');
        d.dream.hint(p, `SPOTTED! +${SPOT_COST}s, back to the ${d.lit < 0 ? 'start' : 'lantern'} — wait for the cone to swing away`);
      }
      if (Math.hypot(q.a - ROUTE[ROUTE.length - 1][0], q.b - ROUTE[ROUTE.length - 1][1]) < 2.2) d.progress();
    },
    paint(d) {
      if (d.state !== 'live') return null;
      return [
        { text: '忍 INFILTRATION', size: 1.9, color: d.colour, glow: true, jp: true },
        { text: d.expo > 0 ? 'SEEN…' : `lanterns ${d.lit + 1} / ${B.lanterns.length}`, size: 1.7, color: d.expo > 0 ? 0xff6a6a : 0xffffff },
        { text: `${d.t.toFixed(1)}s${d.spotted ? `  + ${d.spotted * SPOT_COST}s` : ''}`, size: 1.5, color: HOLO.cyan },
      ];
    },
  };
}
