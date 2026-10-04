import * as THREE from 'three';
import { SIM, HOLO } from '../../world/simworld.js';
import { Kiosk, idleIn } from './kiosk.js';

/* ---------------------------------------------------------------------------
   THE DATA HIGHWAY AND ITS LIGHT CYCLES — 光.

   Richard's brief: islands that are far away are reached by "a tron-style
   motorcycle". The far islands (`cycle: true` in islands.js) are ~180 units
   of bridge from the holo-Dojo, which is seventeen seconds of walking; a
   light cycle does it in about four.

   THE HIGHWAY IS STILL A BRIDGE. It is a wide, nearly straight ribbon deck
   like every other bridge, so a kitten who would rather walk can, and one
   whose ride is cut short (a scene, the tournament, the ending — anything
   that pulls everybody out) is standing on a floor, not in the void. A ride
   that could leave her somewhere with nothing under her would break the
   fourth non-negotiable, so the ride never goes anywhere the deck is not:
   its path IS the deck's own polyline.

   A RIDE IS CARGO, LIKE THE GRIFFIN. While she rides, `padFor` hands her the
   dead pad — a stick still pushed when she pressed INTERACT must not steer her
   off the side — and the highway puts her on the path every frame AFTER the
   players have ticked (main.js ticks the arcade after the players for exactly
   this; it is how the tube holds her too).
--------------------------------------------------------------------------- */

/** Units a second at full throttle. ~180 units is ~4 seconds with the ramps. */
export const CYCLE_SPEED = 55;
/** Seconds spent speeding up and slowing down, each end. */
const RAMP = 0.6;
/** How far above the deck she sits while she rides — on the seat, not in it. */
export const SEAT = 0.5;

export class DataHighway {
  constructor(dream) {
    this.dream = dream;
    this.roads = [];
    this.kiosks = [];
    /** Player index -> her ride, or nothing. */
    this.rides = [];
    this.trails = [];
    dream.sim.tickers.push((dt) => this.update(dt));
  }

  /**
   * Lay a highway from the hub's rim (`from`) to an island's (`to`) and put a
   * cycle pad at each end. Returns the road.
   */
  add(key, name, from, to, back = 'HOLO-DOJO') {
    const sim = this.dream.sim;
    const deck = sim.addBridge(from, to, { halfW: 3.2, wobble: 0.8, waves: 1, name: `${key} highway` });
    const pts = deck.pts;
    const L = Math.hypot(to.x - from.x, to.z - from.z) || 1;
    const dir = { x: (to.x - from.x) / L, z: (to.z - from.z) / L };
    // The lane line down the middle, so it reads as a road and not a bridge.
    const dash = [];
    for (let i = 0; i < pts.length - 1; i += 2) {
      const a = pts[i]; const b = pts[i + 1];
      dash.push(new THREE.Vector3(a.x, a.y + 0.06, a.z), new THREE.Vector3(b.x, b.y + 0.06, b.z));
    }
    sim.root.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(dash),
      new THREE.LineBasicMaterial({ color: HOLO.gold, transparent: true, opacity: 0.8, toneMapped: false })));
    const road = {
      key, name, deck,
      // Each pad stands on solid deck, three units back from where the ribbon
      // meets it, so getting off a cycle is never getting off onto the seam.
      A: { x: from.x - dir.x * 3, z: from.z - dir.z * 3, y: from.y },
      B: { x: to.x + dir.x * 3, z: to.z + dir.z * 3, y: to.y },
    };
    road.path = [road.A, ...pts, road.B];
    road.cum = [0];
    for (let i = 1; i < road.path.length; i++) {
      const a = road.path[i - 1]; const b = road.path[i];
      road.cum.push(road.cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
    }
    road.length = road.cum[road.cum.length - 1];
    for (const [end, way, to2] of [[road.A, 1, name], [road.B, -1, back]]) {
      const k = new Kiosk(this.dream, {
        x: end.x, z: end.z, y: end.y, r: 2.0, colour: HOLO.gold, kanji: '光', title: 'LIGHT CYCLE', near: 6,
        card: () => [
          { text: '光 LIGHT CYCLE', size: 2.0, color: HOLO.gold, glow: true, jp: true },
          { text: `to ${to2}`, size: 1.5 },
          { text: `${Math.round(road.length)} units · about ${Math.round(rideTime(road.length))} seconds`, size: 1.1, color: 0x9fefff },
          { text: 'or walk it — the highway is a bridge too', size: 1.0, color: 0x9fefff },
        ],
        prompt: (p, key2) => `[${key2}]  RIDE TO ${to2}`,
        interact: (p) => this.ride(p, road, way),
      });
      this.kiosks.push(k);
    }
    this.roads.push(road);
    return road;
  }

  get stations() { return this.kiosks.map((k) => k.station); }

  riding(i) { return !!this.rides[i]; }

  /** On the cycle and away. `way` 1 runs A to B, -1 back. */
  ride(p, road, way) {
    if (this.rides[p.index]) return false;
    const path = way > 0 ? road.path : [...road.path].reverse();
    const cum = way > 0 ? road.cum : road.cum.map((c) => road.length - c).reverse();
    /* IN THE LAYER, NOT IN HER GROUP: placed by `update` every frame, so it
       never inherits whatever her group is doing (a flip, a squash, a turn). */
    const cycle = buildCycle(p.style?.colour ?? HOLO.cyan);
    this.dream.sim.root.add(cycle);
    const trail = new Trail(this.dream.sim.root, p.style?.colour ?? HOLO.cyan);
    this.trails.push(trail);
    this.rides[p.index] = { p, road, path, cum, L: road.length, t: 0, T: rideTime(road.length), cycle, trail };
    /* CARGO TO THE SNAKE WAY TOO. A highway's deck is a ridden road now
       (`SimWorld.addBridge`), and she sits on it `onGround` for the whole
       ride — so without this `Player._stepSnake` boarded her, and the walking
       ride's orbit camera and lane split chased a kitten doing 55. */
    p.onCycle = true;
    p.snakeRide = null;
    this.dream.game.sfx?.('cycle');
    return true;
  }

  /** Off the cycle — at the end of the road, or wherever she is if cut short. */
  stop(p) {
    const r = this.rides[p.index];
    if (!r) return;
    r.cycle.removeFromParent();
    r.trail.done = true;
    p.onCycle = false;
    this.rides[p.index] = null;
  }

  update(dt) {
    for (const r of this.rides) {
      if (!r) continue;
      const { p } = r;
      r.t += dt;
      const s = rideDistance(r.t, r.T, r.L);
      const q = pointAt(r.path, r.cum, s);
      p.position.set(q.x + SIM.dx, q.y + SEAT, q.z + SIM.dz);
      p.velocity?.set(0, 0, 0);
      p.onGround = true;
      p.group.position.copy(p.position);
      p.facing = Math.atan2(q.dx, q.dz);
      r.cycle.position.set(q.x, q.y, q.z);
      r.cycle.rotation.y = p.facing;
      r.trail.push(q);
      if (r.t >= r.T) {
        this.stop(p);
        this.dream.game.sfx?.('score');
      }
    }
    for (const tr of this.trails) tr.update(dt);
    this.trails = this.trails.filter((tr) => !tr.gone);
    const inside = idleIn(this.dream).filter((p) => !this.rides[p.index]);
    for (const k of this.kiosks) k.update(dt, inside);
  }

  faceCamera(camera) {
    for (const k of this.kiosks) k.faceCamera(camera);
  }
}

/** Seconds a ride of length `L` takes: cruising, plus half a ramp each end. */
export function rideTime(L) {
  return L / CYCLE_SPEED + RAMP;
}

/**
 * Distance along the road at time `t` of a ride lasting `T`: speeding up
 * for RAMP, cruising, slowing for RAMP, arriving at exactly `L` at `T`. A
 * trapezoid of speed, so it never overshoots and never stops short.
 */
export function rideDistance(t, T, L) {
  const v = L / (T - RAMP);                 // cruise speed that makes it fit
  const c = Math.max(0, Math.min(T, t));
  if (c < RAMP) return 0.5 * (v / RAMP) * c * c;
  if (c > T - RAMP) {
    const r = T - c;
    return L - 0.5 * (v / RAMP) * r * r;
  }
  return 0.5 * v * RAMP + v * (c - RAMP);
}

/** The point `s` along a polyline with cumulative lengths `cum`, and its heading. */
export function pointAt(path, cum, s) {
  let i = 1;
  while (i < path.length - 1 && cum[i] < s) i++;
  const a = path[i - 1]; const b = path[i];
  const seg = cum[i] - cum[i - 1] || 1;
  const u = Math.max(0, Math.min(1, (s - cum[i - 1]) / seg));
  return {
    x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, y: a.y + (b.y - a.y) * u,
    dx: (b.x - a.x) / seg, dz: (b.z - a.z) / seg,
  };
}

/* ------------------------------- the look ------------------------------- */

function buildCycle(colour) {
  /* IT HAS TO READ FROM BEHIND, because that is where the camera rides. The
     first cut was a dark box with two torus wheels and a 1.1-tall wall for a
     trail — every one of them edge-on to a chase camera, so a ride looked
     like a kitten sliding along with two thin lines behind her. Now it is a
     lit fairing with its edges drawn, a tail-light across the back, a glow on
     the deck under it, and a trail that lies flat on the road as well. */
  const g = new THREE.Group();
  const mat = (c, o, add = true) => new THREE.MeshBasicMaterial({
    color: c, transparent: true, opacity: o, toneMapped: false, depthWrite: false,
    blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const body = new THREE.BoxGeometry(1.1, 0.55, 2.8);
  const fairing = new THREE.Mesh(body, mat(colour, 0.45));
  fairing.position.y = 0.7;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(body),
    new THREE.LineBasicMaterial({ color: colour, toneMapped: false }));
  edges.position.y = 0.7;
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 1.2), mat(0x061018, 0.85, false));
  canopy.position.set(0, 1.1, 0.5);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 0.1), mat(0xffffff, 0.95));
  tail.position.set(0, 0.8, -1.42);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(1.8, 28).rotateX(-Math.PI / 2), mat(colour, 0.35));
  glow.position.y = 0.06;
  g.add(glow, fairing, edges, canopy, tail);
  for (const z of [-1.05, 1.05]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 24).rotateZ(Math.PI / 2), mat(colour, 0.9));
    w.position.set(0, 0.55, z);
    g.add(w);
  }
  g.renderOrder = 3;
  g.name = 'light-cycle';
  return g;
}

/** The wall of light a cycle leaves behind it, Tron's, fading once she stops. */
class Trail {
  constructor(parent, colour) {
    this.n = 48;
    this.pts = [];
    this.geo = new THREE.BufferGeometry();
    // Two strips of n pairs: the wall (rows 0..n-1) and the band on the road.
    this.pos = new Float32Array(this.n * 4 * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const idx = [];
    for (const base of [0, this.n * 2]) {
      for (let i = 0; i < this.n - 1; i++) {
        const a = base + i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    this.geo.setIndex(idx);
    this.mat = new THREE.MeshBasicMaterial({
      color: colour, transparent: true, opacity: 0.55, toneMapped: false, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
    this.done = false;
    this.fade = 1;
    this.gone = false;
  }

  push(q) {
    this.pts.unshift({ x: q.x, y: q.y, z: q.z });
    if (this.pts.length > this.n) this.pts.length = this.n;
  }

  update(dt) {
    if (this.done) {
      this.fade -= dt / 1.2;
      this.mat.opacity = 0.55 * Math.max(0, this.fade);
      if (this.fade <= 0) { this.mesh.removeFromParent(); this.geo.dispose(); this.mat.dispose(); this.gone = true; return; }
    }
    const last = this.pts[this.pts.length - 1];
    const B = this.n * 6;
    for (let i = 0; i < this.n; i++) {
      const q = this.pts[i] ?? last;
      if (!q) continue;
      const k = 1 - i / this.n;
      const h = 1.1 * k;
      this.pos.set([q.x, q.y + 0.1, q.z, q.x, q.y + 0.1 + h, q.z], i * 6);
      // Across the road at this point: from the neighbour, flat.
      const o = this.pts[Math.min(i + 1, this.pts.length - 1)] ?? q;
      const p0 = this.pts[Math.max(i - 1, 0)] ?? q;
      let sx = -(p0.z - o.z); let sz = p0.x - o.x;
      const n = Math.hypot(sx, sz) || 1;
      const w = 0.55 * k;
      sx = (sx / n) * w; sz = (sz / n) * w;
      this.pos.set([q.x - sx, q.y + 0.08, q.z - sz, q.x + sx, q.y + 0.08, q.z + sz], B + i * 6);
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
