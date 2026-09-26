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
    const dist = P.dist + (S.spread ?? 0) * 0.7;

    this._look.set(S.x + tx * P.ahead, S.y + 1.3, S.z + tz * P.ahead);
    const w = ss(Math.min(1, this.w));
    const bb = behind + P.rel;
    // Blend round her, not across her.
    const b = nb + wrap(bb - nb) * w;
    const p = np + (P.pitch - np) * w;
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
    const roll = P.roll * w;
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
