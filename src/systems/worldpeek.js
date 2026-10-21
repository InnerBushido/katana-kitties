import { PeekTrigger, peekPose, PEEK } from './dream/peek.js';

/* ---------------------------------------------------------------------------
   THE LOOK ACROSS, IN THE REAL WORLD — the simulator's over-the-shoulder look
   at the island on the other end of a bridge, at the mouth of every Snake Way
   road and every home bridge.

   Richard, Oct 2026: "the bridge camera's in the simulator, the look across
   to next island and transitions, we make a similar implementation to the
   bridges in the main world as well, so that when a player approaches near
   the bridge, it zooms in on the next island to go to".

   NOTHING NEW IS DRAWN HERE. The trigger (`PeekTrigger`: ON or OFF with a
   buffer, walking TOWARD the mouth AND along the road), the lens
   (`BridgePeek`, its own clock, the arc then the pan) and the hand-over to
   the ride camera (`peekHold`) are dream/peek.js's, five passes of Richard's
   notes deep, and the player and the group cameras already lay
   `p.peekAt` over whatever pose is drawing. This file only says, for a kitten
   in the real world, which mouths there are and what is on the other end —
   the job `DreamDojo._peekEnds` / `_peekFor` do in the layer.

   The Dream Dojo writes `p.peekAt` for every kitten each frame, but only
   once it is built, so this runs after it and owns every kitten outside the
   layer outright.
--------------------------------------------------------------------------- */

/** One end of a road as `peekZone` wants it: the mouth, the way into the
 *  road, and the middle of the island at the far end (floor height in y). */
export function roadEnds(road, farA, farB, extra = {}) {
  const pts = road.pts;
  const out = [];
  for (const [i, n, far] of [[0, 1, farB], [pts.length - 1, pts.length - 2, farA]]) {
    const m = pts[i];
    const q = pts[n];
    const l = Math.hypot(q.x - m.x, q.z - m.z) || 1;
    if (!far) continue;
    out.push({ road, mouth: m, toward: { x: (q.x - m.x) / l, z: (q.z - m.z) / l }, far, ...extra });
  }
  return out;
}

/* WHAT STANDS AT A MOUTH. The layer's bridges open onto bare holo-floor; the
   real ones open onto a town with dragons perched round it. Measured at the
   bamboo road: a perched dragon 8.4 from the mouth and 5.1 off the line to
   the island filled two-thirds of the frame with wing, the island behind it.
   Two answers, in this order:
     · the lens tries the other shoulder, then higher, and keeps the first
       pose with a clear view — chosen ONCE, as it turns on, because a lens
       that changed its mind mid-sweep would be the jump the sweep exists to
       avoid;
     · and a dragon that is STILL between the lens and the island (the bamboo
       one is: it stands between HER and the island, so no lens behind her
       can see past it — every one of the six tries measured the same) fades
       out of that pane while the look across is up (`fadeFor`). In that
       pane only: a sister playing beside her sees the dragon where it is. */
export const PEEK_TRIES = [[1, PEEK.up], [-1, PEEK.up], [1, 6], [-1, 6], [1, 10], [-1, 10]];
/** How far past her the view toward the island is tested. */
export const PEEK_SIGHT = 35;
/** How much of a dragon in the way is faded out, at the look's full weight. */
export const PEEK_FADE = 0.85;

function segDist(ax, ay, az, bx, by, bz, px, py, pz) {
  const ex = bx - ax; const ey = by - ay; const ez = bz - az;
  const L = ex * ex + ey * ey + ez * ez || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey + (pz - az) * ez) / L));
  return Math.hypot(ax + ex * t - px, ay + ey * t - py, az + ez * t - pz);
}

/**
 * The first of PEEK_TRIES whose lens sees her AND past her toward the island
 * without going through any of `blockers` ({ x, y, z, r } spheres), else the
 * least blocked. Pure. Returns { side, up, cost }.
 */
export function clearPose(S, blockers) {
  let best = null;
  for (const [side, up] of PEEK_TRIES) {
    const P = peekPose({ ...S, side, up });
    const hy = S.y + 1.2;
    let dx = P.lx - S.x; let dy = P.ly - hy; let dz = P.lz - S.z;
    const l = Math.hypot(dx, dy, dz) || 1;
    dx = S.x + (dx / l) * PEEK_SIGHT; dy = hy + (dy / l) * PEEK_SIGHT; dz = S.z + (dz / l) * PEEK_SIGHT;
    let cost = 0;
    for (const b of blockers) {
      cost += Math.max(0, b.r - segDist(P.x, P.y, P.z, S.x, hy, S.z, b.x, b.y, b.z));
      cost += Math.max(0, b.r - segDist(S.x, hy, S.z, dx, dy, dz, b.x, b.y, b.z));
    }
    if (cost === 0) return { side, up, cost };
    if (!best || cost < best.cost) best = { side, up, cost };
  }
  return best;
}

/** An island's middle, standing on its floor — what the lens aims over. */
function middleOf(isl) {
  if (!isl) return null;
  const y = isl.heightAt?.(isl.x, isl.z);
  return { x: isl.x, y: Number.isFinite(y) ? y : (isl.baseY ?? 0), z: isl.z };
}

export class WorldPeek {
  constructor(game) {
    this.game = game;
    this.trig = [];
    this._sig = '';
    this.ends = [];
    /** Per kitten: how far the dragon fade is in, and the island it is for. */
    this.fade = [];
    this.far = [];
  }

  /** Every mouth a kitten could walk into right now. Rebuilt only when the
   *  set of open roads changes — the ending, the arena, a bridge bought. */
  _endsNow() {
    const g = this.game;
    const W = g.world;
    const H = g.housing;
    const roads = W?.snakeOpen ? (W.snakeWay?.roads ?? []).filter((r) => !r.arena || W.arenaOpen) : [];
    const homes = H?.built && H.isUp?.() ? (H.bridges ?? []).map((B, k) => (B?.solid ? k : -1)).filter((k) => k >= 0) : [];
    const sig = `${roads.map((r) => r.id).join(',')}|${homes.join(',')}`;
    if (sig === this._sig) return this.ends;
    this._sig = sig;
    const ends = [];
    for (const r of roads) ends.push(...roadEnds(r, middleOf(r.from), middleOf(r.to)));
    for (const k of homes) {
      const B = H.bridges[k];
      const I = H.isles[k];
      const isle = I ? { x: I.x, y: I.groundY, z: I.z } : null;
      ends.push(...roadEnds(B.road, middleOf(B.road.from), isle, { home: k }));
    }
    this.ends = ends;
    for (const t of this.trig) t?.reset();
    return ends;
  }

  /** The look across for kitten `p` this frame, or null. */
  for(p, dt) {
    const g = this.game;
    const t = (this.trig[p.index] ??= new PeekTrigger());
    const free = p.onGround && !p.snakeRide && !p.mount && !p.rideAlong && !p.pandaMount && !p.carried
      && !p.pinnedAt && !p.onCycle && !p.angel && p.realm !== 'sim';
    if (!free || g.tournament?.active || g._sceneActive?.()) { t.reset(); return null; }
    let ends = this._endsNow();
    if (!ends.length) { t.reset(); return null; }
    /* A LOCKED HOME BRIDGE IS NOT A WAY ACROSS FOR HER: it is a hologram she
       falls through (housing.js `ghostFor`), and swinging the lens out to an
       island she cannot reach would be a promise the bridge then breaks. */
    if (g.housing?.ghostFor) ends = ends.filter((E) => E.home == null || !g.housing.ghostFor(p, E.home));
    if (t.end && !ends.includes(t.end)) t.reset();
    const E = t.step(dt, p.position, p.velocity ?? { x: 0, z: 0 }, ends);
    if (!E) { t.pose = null; return null; }
    const S = { x: p.position.x, y: p.position.y, z: p.position.z, far: E.far, w: 1 };
    if (t.pose?.end !== E) t.pose = { end: E, ...clearPose(S, this._blockers(p)) };
    S.side = t.pose.side;
    S.up = t.pose.up;
    return S;
  }

  /** The dragons near her, as spheres round their bodies. A dragon is a
   *  billboard `quad` wide and tall standing on its feet (measured: its box
   *  runs -12.9..12.9 across and -1.6..24.6 up at quad 25.9), and it turns
   *  to face whichever lens looks at it, so a sphere is the honest shape. */
  _blockers(p) {
    const out = [];
    for (const d of this.game.dragons ?? []) {
      const q = d.position;
      if (!q || d.rider || Math.hypot(q.x - p.position.x, q.z - p.position.z) > 70) continue;
      const s = d.quad ?? 26;
      out.push({ x: q.x, y: q.y + s * 0.45, z: q.z, r: s * 0.42 });
    }
    return out;
  }

  /**
   * Fade, in the pane `camera` draws, every dragon between its lens and the
   * island its kittens are looking across at. Called per pane, after the
   * billboards have turned to it (main.js `_renderView`); every other pane
   * puts them back. The fade is OPACITY with `alphaTest` scaled by it: the
   * sprite's cut-out is alphaTest 0.35, and opacity alone would have kept
   * every texel until 0.35 and then dropped the whole dragon at once.
   */
  fadeFor(camera, members) {
    let far = null;
    let w = 0;
    for (const i of members ?? []) {
      const p = this.game.players?.[i];
      const f = this.fade[i] ?? 0;
      if (p && f > w && this.far[i]) { w = f; far = this.far[i]; }
    }
    const c = camera.position;
    for (const d of this.game.dragons ?? []) {
      const m = d.sprite?.mat;
      if (!m) continue;
      let o = 1;
      if (far && !d.rider) {
        const s = d.quad ?? 26;
        let ex = far.x - c.x; let ey = far.y + PEEK.aimUp - c.y; let ez = far.z - c.z;
        const l = Math.hypot(ex, ey, ez) || 1;
        const L = Math.min(l, 90);
        ex = c.x + (ex / l) * L; ey = c.y + (ey / l) * L; ez = c.z + (ez / l) * L;
        const hit = segDist(c.x, c.y, c.z, ex, ey, ez, d.position.x, d.position.y + s * 0.45, d.position.z) < s * 0.5;
        if (hit) o = 1 - PEEK_FADE * w;
      }
      if (d._peekBase == null) d._peekBase = m.alphaTest;
      if (m.opacity !== o) {
        m.opacity = o;
        m.alphaTest = d._peekBase * o;
      }
    }
  }

  update(dt) {
    for (const p of this.game.players ?? []) {
      // the layer's own kittens are the Dream Dojo's (`_peekFor`)
      if (!p || p.realm === 'sim') { if (p) this.fade[p.index] = 0; continue; }
      p.peekAt = this.for(p, dt);
      // the fade runs on the look across's own clock, in and out
      const on = !!p.peekAt;
      this.fade[p.index] = Math.max(0, Math.min(1, (this.fade[p.index] ?? 0) + (on ? dt / PEEK.sweepIn : -dt / PEEK.sweepOut)));
      if (on) this.far[p.index] = p.peekAt.far;
    }
  }

  reset() { this.trig = []; this._sig = ''; this.fade = []; this.far = []; }
}
