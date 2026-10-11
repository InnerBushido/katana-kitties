/* ---------------------------------------------------------------------------
   道標 WAYPOINTS — mark an island on the Map of the Simulator and follow the
   markers there.

   Richard: "Players can mark a destination on the Map of the Simulator and
   it shows the waypoint on the minimap. It will also show floating 3D
   holographic markers (upside down pyramids or a pointing cursor) bouncing
   above the next area to reach, at major intersections: the start and end of
   bridges, and the main walking path around the Dojo of the Turning Circle.
   Once she reaches a marker it disappears and the next should be in view;
   gone, they don't come back unless the waypoint is refreshed on the map.
   Reaching the waypoint removes it and all its markers."

   THE ROUTE IS THE REAL ONE, solved over the layer's own links (`links`):
   every island's bridge runs from the hub's rim (47 out from the Dojo's
   middle) or from the far rim of the island in front of it (`from` in
   islands.js — the Shadow is reached THROUGH the Arena School), to its own
   near rim, and those two ends are exactly what `_raiseIsland` and the port
   bridge were built from. So `route` walks up from wherever she is to the
   hub (or to the first island the two journeys share), round the hub's
   walking ring (`ring`, between the Turning Circle's floor at 38 and the
   rim at 50) the SHORT way, and down the target's chain: a marker at each
   bridge end and one every `step` degrees of ring between the two mouths.

   PURE BELOW THE LINE: `links`, `placeOf` and `route` take plain numbers, so
   world-check walks a kitten through every pair of places without a
   renderer. `Waypoints` owns the meshes and the per-kitten state.

   WHAT SHE SEES: the next `show` markers only — the one she is going to,
   bright, and the one after it, faint, so the next is in view as she
   reaches each one without a line of ten pyramids across the sky. They are
   in HER colour, because four sisters can each be going somewhere else.
   A marker is reached within `reach` of it on the flat (and `reachY` up or
   down, so a marker on a bridge below cannot be reached from the one
   above); reaching a LATER one takes the ones before it with it, so a
   sister who cuts a corner is not sent back for the one she skipped.
--------------------------------------------------------------------------- */

import * as THREE from 'three';
import { ISLANDS, ISLE_ABOUT } from './islands.js';
import { holoSolid } from './targets.js';

/* `gap` IS WHAT THE CAMERA SEES. Measured in the browser through her own
   lens (fov 38, one pane, aspect 1.8, standing on the walking ring): a
   marker's top is inside the frame (|x| < 0.92, |y| < 0.85) out to 14.5
   units ahead or to one side and only 12 toward the camera or the other side
   — the hub's camera swings round the Circle, so "ahead" is not fixed. The
   first cut spaced them 40° round the ring (31 units) and 65 apart across the
   Kata bridge, and walking it marker by marker the next was off the frame's
   edge at five of eleven (NDC x −1.16, y −1.60): "the next should be in
   view" was false half the time. So every marker is at most `gap` from the one before it,
   round the ring (`step` is that arc, in degrees), along a bridge ('along'
   markers between its two ends) and across an island she walks THROUGH
   ('across' — the Arena School, rim to rim on the way to the Shadow, is 56
   units with nothing on it otherwise). */
const GAP = 11;
const RING = 44;
export const WAYPOINT = {
  ring: RING, gap: GAP, step: (GAP / RING) * (180 / Math.PI), hubR: 47, rimIn: 2,
  reach: 4.5, reachY: 6, show: 2,
  size: 1.1, tall: 1.6, lift: 3, bob: 0.55, bobHz: 1.4, spin: 1.2, faint: 0.35,
  // The pointing cursor at her feet (see `_point`): how far out, how high, how big.
  pointR: 2.4, pointY: 0.7, pointLen: 1.3, pointW: 0.55, edge: 0.95,
  /* A marker nearer her lens than `near` is shrunk in proportion, so it is
     never drawn bigger than one `near` away. The camera sits ~25 from her
     (measured: 13 back, 13 across, 16 up on the hub), so a marker 11 toward
     it was 6 from the lens and filled the bottom of the pane as a half-cut
     orange kite — seen in the browser on the Sine route. */
  near: 24,
};

/** Every place a waypoint can be set on: the islands, the Dojo itself, and her tubes. */
export const DESTS = ['dojo', 'port', ...Object.keys(ISLANDS)];

/** A place's name, for the map and the toasts. */
export function destName(key) {
  if (key === 'dojo') return 'DOJO OF THE TURNING CIRCLE';
  if (key === 'port') return 'YOUR TUBES';
  return ISLANDS[key]?.name ?? key;
}

/** A place's short name, for the minimap. */
export function destShort(key) {
  if (key === 'dojo') return 'DOJO';
  if (key === 'port') return 'TUBES';
  return ISLE_ABOUT[key]?.short ?? key;
}

/**
 * THE LINKS, in the layer: for each island (and the port), its bridge's two
 * ends — `from` on the hub or on its parent's rim, `to` on its own near rim —
 * and its parent. The same arithmetic `_raiseIsland` and simworld's port
 * bridge were built with, off the same inputs, so a marker sits on a mouth.
 * `isles` is `{ key: { x, y, z, r, fwd } }`; `hub` `{ x, y, z }`; `port` a
 * disc `{ x, y, z, r }` or null.
 */
export function links(hub, isles, port) {
  const out = {};
  for (const key of Object.keys(ISLANDS)) {
    const I = isles[key];
    if (!I) continue;
    const dir = I.fwd;
    const parent = ISLANDS[key].from ?? null;
    const P = parent ? isles[parent] : null;
    const from = P
      ? { x: P.x + dir.x * (P.r - WAYPOINT.rimIn), y: P.y, z: P.z + dir.z * (P.r - WAYPOINT.rimIn) }
      : { x: hub.x + dir.x * WAYPOINT.hubR, y: hub.y, z: hub.z + dir.z * WAYPOINT.hubR };
    const to = { x: I.x - dir.x * (I.r - WAYPOINT.rimIn), y: I.y, z: I.z - dir.z * (I.r - WAYPOINT.rimIn) };
    out[key] = { key, from, to, parent, disc: { x: I.x, y: I.y, z: I.z, r: I.r } };
  }
  if (port) {
    const L = Math.hypot(port.x - hub.x, port.z - hub.z) || 1;
    const u = { x: (port.x - hub.x) / L, z: (port.z - hub.z) / L };
    out.port = {
      key: 'port', parent: null, disc: { x: port.x, y: port.y, z: port.z, r: port.r },
      from: { x: hub.x + u.x * WAYPOINT.hubR, y: hub.y, z: hub.z + u.z * WAYPOINT.hubR },
      to: { x: port.x - u.x * (port.r - WAYPOINT.rimIn), y: port.y, z: port.z - u.z * (port.r - WAYPOINT.rimIn) },
    };
  }
  return out;
}

/** Distance from `q` to the segment a–b, on the flat. */
function segDist(q, a, b) {
  const dx = b.x - a.x; const dz = b.z - a.z;
  const L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.z - a.z) * dz) / L2));
  return Math.hypot(q.x - (a.x + dx * t), q.z - (a.z + dz * t));
}

/**
 * WHERE SHE IS: `{ on: key }` on a floor ('dojo' the hub), `{ bridge: key }`
 * on the way across one, or null (in the void, which a route cannot start
 * from). A floor is within its disc and a few units of its height — she can
 * be in the air over it — and a bridge is within 6 of its line.
 */
export function placeOf(q, hub, L) {
  if (Math.hypot(q.x - hub.x, q.z - hub.z) < 50 && Math.abs(q.y - hub.y) < 5) return { on: 'dojo' };
  for (const l of Object.values(L)) {
    const d = l.disc;
    if (Math.hypot(q.x - d.x, q.z - d.z) < d.r && Math.abs(q.y - d.y) < 5) return { on: l.key };
  }
  let best = null;
  for (const l of Object.values(L)) {
    const k = segDist(q, l.from, l.to);
    if (k < 6 && (!best || k < best.k)) best = { k, key: l.key };
  }
  return best ? { bridge: best.key } : null;
}

/** The islands from the hub to `key`, hub side first: [school, shadow]. */
function chainOf(key, L) {
  const out = [];
  for (let k = key; k && L[k]; k = L[k].parent) out.unshift(k);
  return out;
}

const angOf = (q, hub) => Math.atan2(q.z - hub.z, q.x - hub.x);

/** Ring markers from angle a0 to a1 the short way, ends excluded. */
function ringBetween(a0, a1, hub) {
  let d = a1 - a0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const n = Math.ceil(Math.abs(d) / ((WAYPOINT.step * Math.PI) / 180)) - 1;
  const out = [];
  for (let i = 1; i <= n; i++) {
    const a = a0 + (d * i) / (n + 1);
    out.push({ x: hub.x + Math.cos(a) * WAYPOINT.ring, y: hub.y, z: hub.z + Math.sin(a) * WAYPOINT.ring, kind: 'ring' });
  }
  return out;
}

/**
 * THE MARKERS from `q` (layer) to `target`, in order, or null when there is
 * nothing to walk (she is on it already, or nowhere a route can start).
 * Each is `{ x, y, z, kind }`: 'start' a bridge's near end, 'end' its far
 * end, 'along' a point on the bridge between them, 'across' one on an island
 * floor between two bridges, 'ring' a point on the hub's walking ring.
 */
export function route(q, target, hub, L) {
  const at = placeOf(q, hub, L);
  if (!at || at.on === target) return null;
  if (target !== 'dojo' && !L[target]) return null;
  const want = target === 'dojo' ? [] : chainOf(target, L);
  const out = [];
  const mk = (p, kind) => out.push({ x: p.x, y: p.y, z: p.z, kind });
  // Across a bridge: its near end, a marker every `gap` along it, its far
  // end — and when she has just come off another bridge onto this island's
  // floor, markers across the floor to this one first.
  const cross = (a, b) => {
    const prev = out.at(-1);
    if (prev?.kind === 'end') along(prev, a, 'across');
    mk(a, 'start');
    along(a, b);
    mk(b, 'end');
  };
  /* `y` straight between the two ends; the bridges actually climb in an S
     (measured on the Shadow's: 2.6 under the line at a tenth of the way, 2.6
     over at nine tenths), so `Waypoints` puts each one on the deck itself. */
  function along(a, b, kind = 'along') {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / WAYPOINT.gap) - 1;
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, kind });
    }
  }
  // UP: from where she is, toward the hub, until a place the target's chain shares.
  let cur = at.on ?? null;
  if (at.bridge) {
    const b = at.bridge;
    if (want.includes(b)) {
      // On a bridge she has to cross anyway: on along it to its far end, then on down.
      along(q, L[b].to);
      mk(L[b].to, 'end');
      cur = b;
    } else {
      along(q, L[b].from);
      mk(L[b].from, 'end');
      cur = L[b].parent ?? 'dojo';
    }
  }
  let arrive = null;     // where she came onto the hub, for the ring
  while (cur && cur !== 'dojo' && !want.includes(cur)) {
    const l = L[cur];
    cross(l.to, l.from);
    if (!l.parent) arrive = l.from;
    cur = l.parent ?? 'dojo';
  }
  // DOWN: the rest of the target's chain after the place she is in.
  const rest = cur === 'dojo' ? want : want.slice(want.indexOf(cur) + 1);
  if (cur === 'dojo' && rest.length) {
    const mouth = L[rest[0]].from;
    const a0 = angOf(arrive ?? q, hub);
    // From inside the Turning Circle she walks out to the ring first; from a mouth she is on it.
    out.push(...ringBetween(a0, angOf(mouth, hub), hub));
  }
  for (const k of rest) cross(L[k].from, L[k].to);
  return out.length ? out : null;
}

/** Is `q` on the target's floor? (Arriving anywhere on it counts.) */
export function onTarget(q, target, hub, L) {
  return placeOf(q, hub, L)?.on === target;
}

/* ------------------------------ the markers ------------------------------ */

/** One upside-down pyramid of light, point down, in her colour. */
function pyramid(colour) {
  const g = new THREE.ConeGeometry(WAYPOINT.size, WAYPOINT.tall, 4, 1).rotateX(Math.PI).translate(0, WAYPOINT.tall / 2, 0);
  const s = holoSolid(g, colour, 0.5);
  return s;
}

/** The pointing cursor: a flat four-sided pyramid lying down, tip along +z. */
function pointer(colour) {
  const g = new THREE.ConeGeometry(WAYPOINT.pointW, WAYPOINT.pointLen, 4, 1).rotateX(Math.PI / 2).scale(1, 0.35, 1);
  return holoSolid(g, colour, 0.5);
}

/**
 * Every kitten's waypoint: `{ target, marks: [{x,y,z,kind}], i, meshes }` by
 * seat. `dream` supplies the layout (`links`), the clock and the toasts.
 */
export class Waypoints {
  constructor(dream) {
    this.dream = dream;
    this.by = new Map();
    this.root = new THREE.Group();
    this.root.name = 'waypoints';
    dream.sim?.root?.add(this.root);
    this.t = 0;
  }

  /** The layout's links, read off the islands as they stand (built once they all are). */
  links() {
    const D = this.dream;
    const hub = D.game?.world?.dojoCentre;
    if (!hub || !D.isles) return null;
    return (this._links ??= links(hub, D.isles, D.sim?.portDeck ?? null));
  }

  hub() { return this.dream.game?.world?.dojoCentre; }

  of(p) { return this.by.get(p.index) ?? null; }

  /**
   * MARK `target` for her: a fresh route, its markers all back — which is
   * the one way they come back (Richard: "unless the waypoint is refreshed
   * on the map"). Returns what to tell her, refusal or confirmation (6).
   */
  set(p, target) {
    const L = this.links();
    const hub = this.hub();
    const q = this.dream._flatPos(p);
    const pos = { x: q.x, y: p.position.y, z: q.z };
    if (!L || !hub) return { ok: false, text: 'The map is not ready yet — try again in a moment' };
    if (onTarget(pos, target, hub, L)) {
      this.clear(p);
      return { ok: false, text: `You're already on the ${destName(target)}!` };
    }
    const marks = route(pos, target, hub, L);
    if (!marks) return { ok: false, text: 'Get back onto an island or a bridge first, then mark it again' };
    // On the deck, not on the straight line between a bridge's two ends.
    const S = this.dream.sim;
    const o = S?.root?.position;
    for (const m of marks) {
      if (m.kind !== 'along' || !S?.heightAt || !o) continue;
      const h = S.heightAt(m.x + o.x, m.z + o.z, m.y + 5)?.y;
      if (Number.isFinite(h)) m.y = h;
    }
    this.clear(p);
    const colour = p.style?.colour ?? 0xffd24a;
    const meshes = marks.map(() => {
      const m = pyramid(colour);
      m.visible = false;
      this.root.add(m);
      return m;
    });
    const arrow = pointer(colour);
    arrow.visible = false;
    this.root.add(arrow);
    this.by.set(p.index, { target, marks, i: 0, meshes, colour, arrow });
    this._place(this.by.get(p.index));
    return { ok: true, text: `Waypoint set: the ${destName(target)} — follow your markers` };
  }

  clear(p) {
    const w = this.by.get(p.index);
    if (!w) return false;
    for (const m of [...w.meshes, w.arrow].filter(Boolean)) {
      m.removeFromParent();
      m.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
    }
    this.by.delete(p.index);
    return true;
  }

  /** Each marker where it stands, the next `show` of them lit. */
  _place(w, p = null) {
    const bob = Math.sin(this.t * Math.PI * 2 * WAYPOINT.bobHz) * WAYPOINT.bob;
    const cam = p?.camera?.isCamera ? p.camera : null;
    const o = this.root.parent?.position ?? { x: 0, y: 0, z: 0 };
    w.meshes.forEach((m, k) => {
      const q = w.marks[k];
      const ahead = k - w.i;
      m.visible = ahead >= 0 && ahead < WAYPOINT.show;
      if (!m.visible) return;
      m.position.set(q.x, q.y + WAYPOINT.lift + bob, q.z);
      m.rotation.y = this.t * WAYPOINT.spin;
      const d = cam ? Math.hypot(cam.position.x - (q.x + o.x), cam.position.y - (m.position.y + o.y), cam.position.z - (q.z + o.z)) : Infinity;
      m.scale.setScalar(Math.min(1, d / WAYPOINT.near));
      const f = ahead === 0 ? 1 : WAYPOINT.faint;
      for (const mat of m.userData.mats ?? []) mat.opacity = (mat.isLineBasicMaterial ? 0.95 : 0.5) * f;
    });
  }

  /** Every frame: reached markers go, the destination clears the lot. */
  update(dt) {
    this.t += dt;
    const D = this.dream;
    const L = this.links();
    const hub = this.hub();
    for (const [i, w] of [...this.by]) {
      const p = D.game?.players?.[i];
      if (!p) { this.clear({ index: i }); continue; }
      const inSim = D.realmOf?.(p) === 'sim';
      if (!inSim) { for (const m of w.meshes) m.visible = false; if (w.arrow) w.arrow.visible = false; continue; }
      const f = D._flatPos(p);
      const q = { x: f.x, y: p.position.y, z: f.z };
      for (let k = w.marks.length - 1; k >= w.i; k--) {
        const m = w.marks[k];
        if (Math.hypot(q.x - m.x, q.z - m.z) < WAYPOINT.reach && Math.abs(q.y - m.y) < WAYPOINT.reachY) {
          w.i = k + 1;
          D.shards?.burst?.(m.x, m.y + WAYPOINT.lift, m.z, w.colour, 14, 3, 4);
          D.game?.sfx?.('star', 0.35);
          break;
        }
      }
      if ((L && hub && onTarget(q, w.target, hub, L)) || w.i >= w.marks.length) {
        this.clear(p);
        D.game?.sfx?.('star');
        D.game?.toast?.(`${p.name} reached the ${destName(w.target)}! Waypoint cleared`, p.index);
        continue;
      }
      this._place(w, p);
      this._point(w, p, q);
    }
  }

  /* 道標 THE POINTING CURSOR. Spacing cannot put the next marker in her frame
     in every direction: the camera keeps one fixed yaw (player.js), so
     toward the camera it shows only about 12 units, and walking four routes
     marker by marker in the browser the next one sat 0.0–0.2 past the
     frame's edge at 12 stops of 75, every one of them a marker toward the
     camera or out to the side. Richard offered "upside down pyramids or a
     pointing cursor"; this is the cursor, for exactly those stops — a flat
     arrow at her feet in her colour, aimed at the marker, up ONLY while that
     marker is out of her frame (`edge`), so it is never two things saying
     the same thing. No camera (a check's stub) means no arrow. */
  _point(w, p, q) {
    const a = w.arrow;
    if (!a) return;
    const n = w.marks[w.i];
    const cam = p.camera;
    const o = this.root.parent?.position ?? { x: 0, y: 0, z: 0 };
    let off = false;
    if (n && cam?.isCamera) {
      const v = (this._v ??= new THREE.Vector3()).set(n.x + o.x, n.y + WAYPOINT.lift + o.y, n.z + o.z).project(cam);
      off = v.z > 1 || Math.abs(v.x) > WAYPOINT.edge || Math.abs(v.y) > WAYPOINT.edge;
    }
    a.visible = off;
    if (!off) return;
    const dx = n.x - q.x;
    const dz = n.z - q.z;
    const L = Math.hypot(dx, dz) || 1;
    a.position.set(q.x + (dx / L) * WAYPOINT.pointR, q.y + WAYPOINT.pointY + Math.sin(this.t * 6) * 0.08, q.z + (dz / L) * WAYPOINT.pointR);
    a.rotation.y = Math.atan2(dx, dz);
  }

  /** For the corner minimap: each kitten's destination and next marker, in WORLD coordinates. */
  forMap(dx, dz) {
    const L = this.links();
    const hub = this.hub();
    const out = [];
    for (const [index, w] of this.by) {
      const d = w.target === 'dojo' ? { x: hub?.x ?? 0, z: hub?.z ?? 0, r: 50 } : L?.[w.target]?.disc;
      if (!d) continue;
      const n = w.marks[w.i];
      out.push({ index, key: w.target, x: d.x + dx, z: d.z + dz, r: d.r, colour: w.colour, next: n ? { x: n.x + dx, z: n.z + dz } : null });
    }
    return out;
  }

  dispose() {
    for (const i of [...this.by.keys()]) this.clear({ index: i });
    this.root.removeFromParent();
  }
}
