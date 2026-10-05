import * as THREE from 'three';

/* ---------------------------------------------------------------------------
   THE LOOK ACROSS — the camera over her shoulder at a bridge's mouth, aimed
   at the island on the other end, BEFORE she steps on.

   Richard: "Before the player steps on a bridge in the simulation, we should
   have the camera zoom in over the shoulder of the player and looking towards
   the island they are about to travel to, so they can see what the island
   looks like and how far away it is before deciding to get on the bridge to
   travel there. It kind of does that currently, but should happen sooner, as
   soon as they are within a decent area of the entrance of the bridge, 15 -
   30ft maybe (although use your best judgement)."

   What "kind of does that" was the Snake Way ride camera's first shot
   (`SnakeCam`, "chase — low behind, the road ahead of her"), which only comes
   alive once she is ON the road: by then the decision is made. This is the
   same idea moved to the approach, and it hands over to the ride camera with
   no cut, because `SnakeCam` starts from wherever the lens already is.

   ONLY WALKING UP TO IT. A kitten running round the hub's rim passes a mouth
   every thirty units, and a camera that swung out over the void at each one
   would be a carousel. So it asks whether she is heading for the mouth; a
   kitten standing still keeps the answer she had — she stopped to look.

   A TRIGGER, NOT A DIAL — RICHARD'S SECOND PASS. "The transition of the
   camera, especially when at the entrance with Lionheart is jarring, it needs
   to transition more smoothly, maybe by sweeping in an arc from where it is to
   where it needs to be and then lerping smoothly to face the direction it
   should be facing. Also, the radius for this transition camera is too big,
   lets make it half as big and it should not be 'incrementally' based on the
   position of the player moving into place, it should just move into place
   when triggered. Maybe add some buffer zone so that it doesn't transition
   until the player is 'definitely' in the zone area, either by moving close
   enough quickly or by getting close enough within an area."
     · The weight WAS a smoothstep of her distance, 11 out to 5: every step
       she took moved the lens, so a kitten pacing about by Lionheart (whose
       port mouth is a few strides off) drove it in and out like a dial.
     · Now `PeekTrigger` says ON or OFF. ON when she walks into `start` (5.5,
       half the 11) and keeps heading for the mouth for `dwell`, or gets
       inside `inner` going toward it — "moving close enough quickly". OFF
       only past `exit`, which is wider than `start` (the buffer), or after
       walking away for `awayT`. Standing still never turns it on, and never
       turns it off.
     · `BridgePeek` then runs the move on its own CLOCK, `sweepIn` seconds,
       in two parts: the lens swings round her in an arc first (`arc`), still
       looking at her, and the aim pans out to the island after (`turn`).
       Out again it runs backwards: the aim comes home, then the lens.

   AND THE STICK IS READ THROUGH IT. "when the camera changes, it should use
   the movement system for the bridge at this point": with the look across
   up, the screen faces the island, and a stick read through her ordinary
   `camYaw` pointed somewhere she could not see. `Player._moveBasis` reads it
   the way a Snake Way bridge does — through the lens that drew her, and a
   push held while the camera swings keeps going the way it started.

   A LAYER, like `SnakeCam`: laid over whichever pose is already drawing.
   THE LENS IS BLENDED ROUND HER and the aim is blended separately, out to
   the island. Blending both as one orbit round the aim (SnakeCam's way) was
   tried first and measured: its aim slides 130 units out to the island, so
   the orbit's centre went with it and the lens moved 7.7 units in a frame.
--------------------------------------------------------------------------- */

export const PEEK = {
  /** Walking toward the mouth inside this (units from it) for `dwell`
   *  seconds turns it on. Half the 11 it was. */
  start: 5.5,
  dwell: 0.35,
  /** Inside this, going toward it, turns it on at once. */
  inner: 2.75,
  /** The buffer: once on, it stays on out to here... */
  exit: 7.5,
  /** ...unless she walks away from the mouth for this long. */
  awayT: 0.25,
  /** The move's own clock, in seconds, in and out. At 1.2 the arc from the
   *  ordinary pose round behind her peaked at 1.49 units a frame (60 Hz), most
   *  of a half-turn in 0.84 s; 1.5 brings that to about 1.2. */
  sweepIn: 1.5,
  sweepOut: 1.1,
  /** Of that clock, the lens's arc round her is the first `arc`, and the
   *  aim's pan out to the island starts at `turn` — they overlap a little so
   *  neither one stops dead before the other starts. */
  arc: 0.7,
  turn: 0.3,
  /** Behind her, along the line to the island; up off her paws; across.
   *  Measured through a 38-degree lens: 8.5 back and 3.4 up put her middle
   *  at -0.97 of the frame and the mouth at -0.94, i.e. off the bottom —
   *  aimed level at an island 130 out, the lower half of the frame is only
   *  19 degrees deep. Lower and further back keeps her, paws to ears. */
  back: 10.5,
  up: 2.6,
  shoulder: 1.7,
  /** Aimed this far over the far island's floor — its middle, not its deck. */
  aimUp: 4,
  /** Heading: moving faster than `moving`, she must be going at least this
   *  much toward the mouth (a cosine) for it to count as walking up to it. */
  moving: 1.5,
  toward: 0.35,
};

const ss = (x) => x * x * (3 - 2 * x);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * The look across, as a lens and an aim. Pure.
 * @param S { x, y, z, far: {x, y, z}, spread? } — where she is, and the far
 *   island's centre (its floor height in `y`).
 */
export function peekPose(S) {
  let ux = S.far.x - S.x;
  let uz = S.far.z - S.z;
  const l = Math.hypot(ux, uz) || 1;
  ux /= l; uz /= l;
  // Right of the way she looks; the lens is over her LEFT shoulder, so the
  // gate sign (on the right of every mouth) is not between her and the lens.
  const rx = -uz;
  const rz = ux;
  const back = PEEK.back + (S.spread ?? 0) * 0.7;
  return {
    x: S.x - ux * back - rx * PEEK.shoulder,
    y: S.y + PEEK.up,
    z: S.z - uz * back - rz * PEEK.shoulder,
    lx: S.far.x,
    ly: S.far.y + PEEK.aimUp,
    lz: S.far.z,
  };
}

/**
 * Where a kitten at `pos` going at `vel` stands to one bridge end `E` =
 * { mouth, toward, far }: null when she is out of its reach (past `exit`, off
 * its deck's height, or already past the mouth onto the bridge), else her
 * distance and whether she is heading for it, away from it, or neither. Pure.
 */
export function peekZone(pos, vel, E) {
  const dx = pos.x - E.mouth.x;
  const dz = pos.z - E.mouth.z;
  if (Math.abs(pos.y - E.mouth.y) > 3) return null;
  // Behind the mouth: on the deck it opens from, not already on the bridge.
  if (dx * E.toward.x + dz * E.toward.z > 0.5) return null;
  const d = Math.hypot(dx, dz);
  if (d > PEEK.exit) return null;
  const sp = Math.hypot(vel.x, vel.z);
  const moving = sp >= PEEK.moving;
  const cos = !moving ? 0 : d > 0.3 ? -(dx * vel.x + dz * vel.z) / (d * sp) : 1;
  return { d, moving, toward: moving && cos >= PEEK.toward, away: moving && cos <= -PEEK.toward };
}

/**
 * ON or OFF, with a buffer — see the head of this file. One per kitten.
 * `step` returns the end she is looking across from, or null.
 */
export class PeekTrigger {
  constructor() { this.reset(); }

  reset() {
    this.end = null;     // ON: the end she is looking across from
    this.cand = null;    // OFF: the end she is walking into
    this.dwell = 0;
    this.away = 0;
  }

  step(dt, pos, vel, ends) {
    if (this.end) {
      const z = peekZone(pos, vel, this.end);
      if (!z) { this.reset(); return null; }
      this.away = z.away ? this.away + dt : 0;
      if (this.away >= PEEK.awayT) { this.reset(); return null; }
      return this.end;
    }
    let best = null;
    let bz = null;
    for (const E of ends) {
      const z = peekZone(pos, vel, E);
      if (!z || z.d > PEEK.start || !z.toward) continue;
      if (!bz || z.d < bz.d) { best = E; bz = z; }
    }
    if (!best) { this.cand = null; this.dwell = 0; return null; }
    if (best !== this.cand) { this.cand = best; this.dwell = 0; }
    this.dwell += dt;
    if (bz.d <= PEEK.inner || this.dwell >= PEEK.dwell) {
      this.end = best;
      this.cand = null;
      this.away = 0;
      return best;
    }
    return null;
  }
}

export class BridgePeek {
  constructor() {
    this.w = 0;
    this.last = null;
    this._L = new THREE.Vector3();
    this._aim = new THREE.Vector3();
  }

  get live() { return this.w > 0.002; }

  /**
   * Lay the look across over `camera`, which already holds the ordinary
   * pose looking at `look`. `subject` is null, or { x, y, z, far, w, spread }.
   */
  apply(dt, subject, camera, look) {
    const want = subject ? subject.w : 0;
    // ITS OWN CLOCK: once triggered it runs to the end at one speed, whatever
    // her feet do — "it should just move into place when triggered".
    if (want > this.w) this.w = Math.min(want, this.w + dt / PEEK.sweepIn);
    else this.w = Math.max(want, this.w - dt / PEEK.sweepOut);
    if (subject) this.last = subject;
    if (!subject && this.w < 0.002) {
      this.w = 0;
      return false;
    }
    const P = peekPose(subject ?? this.last);
    // Both lenses as bearing / pitch / distance round HER (the ordinary aim)...
    const polar = (x, y, z) => {
      const d = Math.hypot(x, y, z) || 1;
      return { b: Math.atan2(x, z), p: Math.asin(Math.max(-1, Math.min(1, y / d))), d };
    };
    const O = polar(camera.position.x - look.x, camera.position.y - look.y, camera.position.z - look.z);
    const Q = polar(P.x - look.x, P.y - look.y, P.z - look.z);
    // The lens's arc first, the aim's pan after (see the head of this file).
    const w = ss(Math.min(1, Math.max(0, this.w / PEEK.arc)));
    const wa = ss(Math.min(1, Math.max(0, (this.w - PEEK.turn) / (1 - PEEK.turn))));
    const b = O.b + wrap(Q.b - O.b) * w;
    const p = O.p + (Q.p - O.p) * w;
    const d = O.d + (Q.d - O.d) * w;
    camera.position.set(
      look.x + Math.sin(b) * Math.cos(p) * d,
      look.y + Math.sin(p) * d,
      look.z + Math.cos(b) * Math.cos(p) * d,
    );
    // ...and the aim on its own, from her out to the island.
    camera.lookAt(this._L.copy(look).lerp(this._aim.set(P.lx, P.ly, P.lz), wa));
    return true;
  }
}
