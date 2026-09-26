import * as THREE from 'three';

/* ---------------------------------------------------------------------------
   THE RIDE CAMERA ON SNAKE WAY.

   "While running on the bridges, players can get a cool, cinematic camera that
   follows near them and rotates around them in 3D to give a cool perspective
   depth view while running up it. The camera can rotate around the player and
   can play like on a swivel or on a rollercoaster... If they fall, or jump
   off, then it will zoom out like normal."

   A LAYER, NOT A CAMERA. It is applied on top of whichever camera is already
   drawing — a kitten's own follow camera when she is alone in her pane, a
   group's rig when all of them are on the road — and blended in and out by a
   weight. That is the rule this game keeps re-learning: the camera that draws
   when she is with her sisters is not her own, so a feature that only touched
   her own would do nothing half the time (Ryuuseki, the star shot and the
   grotto all fell into it). Here both callers hand their pose to the same
   object and get back the same kind of shot.

   IT STARTS WHERE THE CAMERA ALREADY IS. The first key of the sequence is the
   ordinary camera's own bearing, height and distance, read off the frame she
   stepped onto the road in, so there is no cut — the camera comes alive and
   swings away from where it was. Going back is the same blend in reverse,
   interpolated as bearing / pitch / distance round her rather than as a
   straight line between two points, because a straight line from the far side
   of her back to the normal view passes through her.

   IT NEVER TOUCHES THE STICK. Movement on the road is read against the stick
   she pressed to board it (`Player._snakeWish`), not against any camera, which
   is what "regardless of where the camera is pointing or rotated" asks for.
   This file only moves a lens.
--------------------------------------------------------------------------- */

/**
 * The shots the ride cycles through, as bearings RELATIVE TO "BEHIND HER"
 * (0 is behind, looking the way she runs; PI is in front, looking back at
 * her). The camera always travels forward round the list, so over a cycle it
 * orbits her once, the same way, like a car on a rollercoaster's loop.
 *
 *   chase  low behind — the road ahead of her climbing into the clouds
 *   side   level with her — the islands and the sky behind her profile
 *   front  ahead and high — her running at you with the road falling away
 *   over   over the top and round — the whole bend of the snake below
 *
 * `ahead` is how far along the road the lens looks past her: forward on the
 * chase so the road is the picture, back a little on the front so she is.
 */
export const SNAKE_SHOTS = [
  { name: 'chase', rel: 0, pitch: 0.3, dist: 15, ahead: 6 },
  { name: 'side', rel: 1.7, pitch: 0.1, dist: 13.5, ahead: 2 },
  { name: 'front', rel: 3.0, pitch: 0.46, dist: 16, ahead: -1.5 },
  { name: 'over', rel: 4.55, pitch: 0.82, dist: 21, ahead: 3 },
];
/** Seconds each move takes, and each hold after it. The hold is never still —
 *  it drifts on round at `DRIFT` rad/s, because a camera that stops on a
 *  rollercoaster is a camera that has broken. */
export const SNAKE_MOVE = 2.1;
export const SNAKE_HOLD = 1.9;
export const SNAKE_DRIFT = 0.07;
/** The bank into a swing, radians at the middle of a move. */
export const SNAKE_ROLL = 0.11;
/** How long the blend in and out take, roughly (a first-order ease). */
export const SNAKE_IN = 0.8;
export const SNAKE_OUT = 0.6;

const TAU = Math.PI * 2;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ss = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/**
 * The shot at `clock` seconds into a ride that began at `start` (the
 * ordinary camera's own relative bearing, pitch and distance).
 *
 * THE TIMELINE: one move from where the camera was to the chase, then for
 * ever a hold (drifting on round) and a move to the next shot in the list.
 * The first move has no hold in front of it so the ride starts moving the
 * moment she boards.
 *
 * Pure, so `world-check` can walk it without a renderer.
 * @returns {{rel:number, pitch:number, dist:number, ahead:number, roll:number, key:number}}
 */
export function snakePose(clock, start) {
  const k0 = { rel: start.rel, pitch: start.pitch, dist: start.dist, ahead: 0 };
  /* THE FIRST MOVE GOES TO THE CHASE BY THE SHORT WAY, and every one after it
     goes forward. Boarding with the camera already just past behind her must
     not buy a whole orbit to get back to where it nearly was. */
  const c = SNAKE_SHOTS[0];
  const k1 = { ...c, rel: start.rel + wrap(c.rel - start.rel) };
  const lerp = (a, b, u) => ({
    rel: a.rel + (b.rel - a.rel) * u,
    pitch: a.pitch + (b.pitch - a.pitch) * u,
    dist: a.dist + (b.dist - a.dist) * u,
    ahead: a.ahead + (b.ahead - a.ahead) * u,
  });
  if (clock < SNAKE_MOVE) {
    const u = ss(Math.max(0, clock) / SNAKE_MOVE);
    const sign = Math.sign(k1.rel - k0.rel) || 1;
    return { ...lerp(k0, k1, u), roll: SNAKE_ROLL * Math.sin(Math.PI * u) * sign, key: 0 };
  }
  const seg = SNAKE_HOLD + SNAKE_MOVE;
  const n = Math.floor((clock - SNAKE_MOVE) / seg);
  const t = clock - SNAKE_MOVE - n * seg;
  // Key n+1 is where this segment holds; walk forward to it.
  let at = k1;
  for (let i = 1; i <= n; i++) at = nextKey(at, i);
  const held = { ...at, rel: at.rel + SNAKE_DRIFT * Math.min(t, SNAKE_HOLD) };
  if (t < SNAKE_HOLD) return { ...held, roll: 0, key: n + 1 };
  const to = nextKey(at, n + 1);
  const u = ss((t - SNAKE_HOLD) / SNAKE_MOVE);
  return { ...lerp(held, to, u), roll: SNAKE_ROLL * Math.sin(Math.PI * u), key: n + 1 };
}

/** The shot after `prev`, forward round the list — always a forward turn of
 *  at least 0.4 rad, and the hold's drift already paid. */
function nextKey(prev, i) {
  const k = SNAKE_SHOTS[i % SNAKE_SHOTS.length];
  const from = prev.rel + SNAKE_DRIFT * SNAKE_HOLD;
  let step = ((k.rel - from) % TAU + TAU) % TAU;
  if (step < 0.4) step += TAU;
  return { ...k, rel: from + step };
}

/* ---------------------------------------------------------------------------
   THE ARENA ROAD IS SHOT, NOT ORBITED.

   "When players are climbing the bridge to the arena, we should have some
   cinematic camera angle shots to show off the new floating islands to the
   sides, show off the arena as we are circling it (mainly the entrance and as
   we are near the center of it and near the entrance of it, to build up
   excitement) and show a nice view of the Main island and the islands off in
   the distance as we climb higher up. The camera angle shots should be
   pre-planned ... and not random camera angles like it currently is."

   THE ORBIT ABOVE IS KEYED TO TIME, so what it shows depends on when you look,
   not on where you are — the same bend is a view of the arena one ride and a
   view of the underside of the deck the next. This is keyed to PLACE: each
   shot owns a stretch of the road (`from`, as a fraction of its length going
   up) and looks at a LANDMARK from over her shoulder — a named mark the world
   resolves (`road.marks`, see `World.buildSnakeWay`), never a typed
   coordinate. Only going UP: coming down, and every other road, still orbit.

   EVERY SHOT IS THE SAME SHAPE, an over-the-shoulder: the lens stands `dist`
   out from her on the far side from the landmark, swung `off` degrees round
   her, `h` up, and is AIMED so that she sits at `ky` in the frame — which
   leaves the landmark above her, beyond. One shape, five numbers, so a shot is
   a row a person can read and a solver can search. The numbers are SOLVED
   (docs/notes/world.md): she and the landmark both in frame, in a full-width
   pane and in a half-width one, with no island and no road between the lens
   and either, and the lens clear of every deck.

   THE SHOTS, in the order the road gives them:
     climb  leaving home — behind her, the road climbing away ahead towards
            the floating island, the frost island and the other roads beside
            it. NOT THE ARENA, which is what this shot was first: from the
            bottom of the road the arena is 140 units up the sight line and
            the 38-degree lens is 97 units of it high, so "look at the arena"
            was a frame of its keel — a brown wall — and passed every number,
            because a landmark's own rock is not counted in its way.
     home   the climb — in front of her and above, looking back past her and
            down the road to the main island and the islands round it.
     isle   the west side of the lap — from inside the loop, looking out past
            her at the floating island off the road.
     ring   the back of the lap, at the top — from outside the loop, over her
            shoulder and down into the ring, turning with her as she circles.
     gate   down the east side — the doors coming round into view.
     doors  the hook onto the carpet — low behind her, the torii, the lanterns
            and the shut doors ahead.
--------------------------------------------------------------------------- */
export const ARENA_RIDE = [
  { name: 'climb', from: 0, at: 'isle', off: -15, dist: 14, h: 3, ky: -0.45 },
  /* LONGER MOVES INTO THESE THREE, each about three seconds: each is a big
     swing round her — behind to in front, then round to face out of the lap,
     then all the way over to face into it — and over the standard blend they
     peaked at 5.6, 4.2 and 4.3 degrees a frame. */
  { name: 'home', from: 0.13, at: 'home', off: 0, dist: 16, h: 5, ky: -0.3, blend: 0.05 },
  { name: 'isle', from: 0.27, at: 'isle', off: 0, dist: 16, h: 3, ky: -0.3, blend: 0.05 },
  { name: 'ring', from: 0.42, at: 'arena', off: 0, dist: 16, h: 5, ky: -0.3, blend: 0.05 },
  { name: 'gate', from: 0.7, at: 'doors', off: 0, dist: 16, h: 4, ky: -0.3 },
  { name: 'doors', from: 0.9, at: 'doors', off: 0, dist: 14, h: 2.5, ky: -0.3 },
];
/** How much of the road a change of shot is spread over, as a fraction of
 *  its length: about a second and a half at a run. A MOVE, NOT A CUT — she is
 *  steering, and a cut under a kitten mid-stride is a jump of the world. A
 *  row's own `blend` overrides it. */
export const ARENA_BLEND = 0.025;

const DEG = Math.PI / 180;

/**
 * The lens and its aim for one shot, with her at `K` (her feet). Pure.
 * @returns {{x:number, y:number, z:number, lx:number, ly:number, lz:number}}
 */
export function shotPose(sh, marks, K, spread = 0, fov = 38) {
  const T = marks[sh.at];
  const kx = K.x;
  const ky = K.y + 1.3;
  const kz = K.z;
  const away = Math.atan2(kx - T.x, kz - T.z) + sh.off * DEG;
  const d = sh.dist + spread * 0.7;
  /* HEIGHT SCALES WITH DISTANCE, so a group pulled back is the same shot
     further away rather than a flatter one. */
  const cx = kx + Math.sin(away) * d;
  const cy = ky + (sh.h * d) / sh.dist;
  const cz = kz + Math.cos(away) * d;
  /* THE AIM: somewhere between her and the landmark, found so that she sits
     at `ky` down the frame. Bisection on the blend, because the answer
     depends on how far above her the landmark is, which the road changes. */
  const nrm = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
  const dK = nrm(kx - cx, ky - cy, kz - cz);
  const dT = nrm(T.x - cx, T.y - cy, T.z - cz);
  const tanH = Math.tan((fov * DEG) / 2);
  const ndcY = (a) => {
    const v = nrm(dK[0] + (dT[0] - dK[0]) * a, dK[1] + (dT[1] - dK[1]) * a, dK[2] + (dT[2] - dK[2]) * a);
    // right = v x up, up' = right x v
    const r = nrm(-v[2], 0, v[0]);
    const u = [r[1] * v[2] - r[2] * v[1], r[2] * v[0] - r[0] * v[2], r[0] * v[1] - r[1] * v[0]];
    const px = kx - cx; const py = ky - cy; const pz = kz - cz;
    const zc = px * v[0] + py * v[1] + pz * v[2];
    const yc = px * u[0] + py * u[1] + pz * u[2];
    return { y: yc / Math.max(1e-6, zc) / tanH, v };
  };
  let lo = 0;
  let hi = 1;
  let best = ndcY(1);
  if (best.y < sh.ky) {
    for (let k = 0; k < 18; k++) {
      const mid = (lo + hi) / 2;
      const m = ndcY(mid);
      if (m.y > sh.ky) lo = mid; else { hi = mid; best = m; }
    }
  }
  const v = best.v;
  return { x: cx, y: cy, z: cz, lx: cx + v[0] * 20, ly: cy + v[1] * 20, lz: cz + v[2] * 20 };
}

/**
 * Where the planned lens is at arc length `s` going up the arena road.
 * Inside `ARENA_BLEND` after a shot's `from` it is travelling from the last
 * shot to this one — round her, as bearing / pitch / distance, so the move
 * never passes through her. Pure.
 */
export function arenaRidePose(road, s, K, spread = 0, fov = 38) {
  const u = s / road.length;
  let i = 0;
  while (i + 1 < ARENA_RIDE.length && u >= ARENA_RIDE[i + 1].from) i++;
  const cur = shotPose(ARENA_RIDE[i], road.marks, K, spread, fov);
  const into = i === 0 ? 1 : (u - ARENA_RIDE[i].from) / (ARENA_RIDE[i].blend ?? ARENA_BLEND);
  if (into >= 1) return { ...cur, shot: i };
  const prev = shotPose(ARENA_RIDE[i - 1], road.marks, K, spread, fov);
  const e = ss(Math.max(0, into));
  const ky = K.y + 1.3;
  const sph = (p) => {
    const dx = p.x - K.x; const dy = p.y - ky; const dz = p.z - K.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    return { b: Math.atan2(dx, dz), p: Math.asin(Math.max(-1, Math.min(1, dy / d))), d };
  };
  const A = sph(prev);
  const B = sph(cur);
  const b = A.b + wrap(B.b - A.b) * e;
  const p = A.p + (B.p - A.p) * e;
  const d = A.d + (B.d - A.d) * e;
  return {
    x: K.x + Math.sin(b) * Math.cos(p) * d,
    y: ky + Math.sin(p) * d,
    z: K.z + Math.cos(b) * Math.cos(p) * d,
    lx: prev.lx + (cur.lx - prev.lx) * e,
    ly: prev.ly + (cur.ly - prev.ly) * e,
    lz: prev.lz + (cur.lz - prev.lz) * e,
    shot: i,
  };
}

/**
 * One per camera that can draw a road: one per kitten, one per group rig.
 */
export class SnakeCam {
  constructor() {
    this.w = 0;
    this.clock = 0;
    this.start = null;
    this.last = null;
    this.rolled = false;
    this._look = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._r = new THREE.Vector3();
    this.seeded = false;
  }

  /** True while it has any say over the picture. */
  get live() { return this.w > 0.002; }

  /**
   * Lay the ride over `camera`, which already holds the ordinary pose looking
   * at `look`.
   *
   * @param subject null when nobody this camera frames is on a road, else
   *   { road, s, dir, x, y, z, spread } — the road, how far along it, which
   *   way along it they are going, where they are, and how far apart.
   * @param islands the world's islands, so the lens never goes into rock.
   */
  apply(dt, subject, camera, look, islands = null) {
    const want = subject ? 1 : 0;
    const rate = subject ? 1 / SNAKE_IN : 1 / SNAKE_OUT;
    this.w += (want - this.w) * Math.min(1, dt * rate * 2.2);
    if (subject) this.last = subject;
    if (!subject && this.w < 0.002) {
      this.w = 0;
      this.start = null;
      this.clock = 0;
      this.seeded = false;
      if (this.rolled) {
        camera.up.set(0, 1, 0);
        camera.lookAt(look);
        this.rolled = false;
      }
      return false;
    }
    const S = subject ?? this.last;
    const f = S.road.frameAt(S.s);
    const hl = Math.hypot(f.tx, f.tz) || 1;
    const tx = (f.tx / hl) * S.dir;
    const tz = (f.tz / hl) * S.dir;
    const behind = Math.atan2(-tx, -tz);

    // The ordinary pose, as bearing / pitch / distance round what it looks at.
    const ox = camera.position.x - look.x;
    const oy = camera.position.y - look.y;
    const oz = camera.position.z - look.z;
    const nd = Math.hypot(ox, oy, oz) || 1;
    const nb = Math.atan2(ox, oz);
    const np = Math.asin(Math.max(-1, Math.min(1, oy / nd)));
    if (!this.start) {
      this.start = { rel: wrap(nb - behind), pitch: np, dist: nd };
      this.clock = 0;
    }
    if (subject) this.clock += dt;
    const P = snakePose(this.clock, this.start);
    let dist = P.dist + (S.spread ?? 0) * 0.7;
    this._look.set(S.x + tx * P.ahead, S.y + 1.3, S.z + tz * P.ahead);
    let bb = behind + P.rel;
    let pitch = P.pitch;
    let banks = 1;
    /* THE ARENA ROAD, GOING UP, IS THE SHOT LIST instead of the orbit (see
       `ARENA_RIDE`). It comes back as a lens and an aim, and is turned into
       the same bearing / pitch / distance round the aim the orbit is, so the
       blend in and out below is the one both use. No bank: a planned shot is
       composed level. */
    const plan = S.road.arena && S.dir > 0 && S.road.marks
      ? arenaRidePose(S.road, S.s, S, S.spread ?? 0, camera.fov) : null;
    if (plan) {
      this._look.set(plan.lx, plan.ly, plan.lz);
      const dx = plan.x - plan.lx;
      const dy = plan.y - plan.ly;
      const dz = plan.z - plan.lz;
      dist = Math.hypot(dx, dy, dz) || 1;
      bb = Math.atan2(dx, dz);
      pitch = Math.asin(Math.max(-1, Math.min(1, dy / dist)));
      banks = 0;
    }
    const w = ss(Math.min(1, this.w));
    // Blend round her, not across her.
    const b = nb + wrap(bb - nb) * w;
    const p = np + (pitch - np) * w;
    const d = nd + (dist - nd) * w;
    const L = this._v.copy(look).lerp(this._look, w);
    const want3 = this._r.set(
      L.x + Math.sin(b) * Math.cos(p) * d,
      L.y + Math.sin(p) * d,
      L.z + Math.cos(b) * Math.cos(p) * d,
    );
    /* NEVER INSIDE AN ISLAND. At the landings the orbit swings the lens over
       the rim and, at the low side shot, under it — into the keel, which is
       solid rock from inside. Held three units over whatever ground is under
       the lens. */
    for (const isl of islands ?? S.road.islands ?? []) {
      if (Math.hypot(want3.x - isl.x, want3.z - isl.z) > isl.radius + 2) continue;
      const g = isl.heightAt(want3.x, want3.z);
      if (g != null && want3.y < g + 3) want3.y = g + 3;
    }
    if (!this.seeded) { this._pos.copy(want3); this.seeded = true; }
    this._pos.lerp(want3, Math.min(1, dt * 9));
    camera.position.copy(this._pos);

    /* THE BANK. Up is tipped round the line of sight by the roll, weighted
       like everything else so it is never there when the ride is not. */
    const roll = P.roll * w * banks;
    const vx = L.x - this._pos.x;
    const vy = L.y - this._pos.y;
    const vz = L.z - this._pos.z;
    const vl = Math.hypot(vx, vy, vz) || 1;
    // right = view x worldUp
    let rx = -vz / vl;
    let rz = vx / vl;
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl; rz /= rl;
    camera.up.set(rx * Math.sin(roll), Math.cos(roll), rz * Math.sin(roll));
    this.rolled = true;
    camera.lookAt(L);
    return true;
  }
}
