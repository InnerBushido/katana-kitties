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

   THE DISTANCE: a kitten is about two units tall, so "15 - 30ft" is roughly
   five to ten of her heights. It starts easing in at `start` and is all the
   way over her shoulder by `full`, and the deck mouth is three units inside
   the hub's rim, so `full` is about where the rim is under her paws.

   ONLY WALKING UP TO IT. A kitten running round the hub's rim passes a mouth
   every thirty units, and a camera that swung out over the void at each one
   would be a carousel. So it asks whether she is heading for the mouth; a
   kitten standing still keeps the answer she had — she stopped to look.

   A LAYER, like `SnakeCam`: laid over whichever pose is already drawing.
   THE LENS IS BLENDED ROUND HER and the aim is blended separately, out to
   the island. Blending both as one orbit round the aim (SnakeCam's way) was
   tried first and measured: its aim slides 130 units out to the island, so
   the orbit's centre went with it and the lens moved 7.7 units in a frame.
--------------------------------------------------------------------------- */

export const PEEK = {
  /** Eases in from here (units from the mouth)... */
  start: 11,
  /** ...and is all the way over her shoulder by here. */
  full: 5,
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
  /** How fast the layer comes and goes. */
  rateIn: 3.2,
  rateOut: 3.2,
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
 * How much of the look across a kitten at `pos` going at `vel` wants, from
 * one bridge end `E` = { mouth, toward, far }. Returns 0..1, or -1 for "no
 * opinion" (standing still: keep what she had). Pure.
 */
export function peekWeight(pos, vel, E) {
  const dx = pos.x - E.mouth.x;
  const dz = pos.z - E.mouth.z;
  if (Math.abs(pos.y - E.mouth.y) > 3) return 0;
  // Behind the mouth: on the deck it opens from, not already on the bridge.
  if (dx * E.toward.x + dz * E.toward.z > 0.5) return 0;
  const d = Math.hypot(dx, dz);
  if (d > PEEK.start) return 0;
  const w = ss(Math.min(1, Math.max(0, (PEEK.start - d) / (PEEK.start - PEEK.full))));
  const sp = Math.hypot(vel.x, vel.z);
  if (sp < PEEK.moving) return -w;
  const cos = d > 0.3 ? -(dx * vel.x + dz * vel.z) / (d * sp) : 1;
  return cos >= PEEK.toward ? w : 0;
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
    const rate = want > this.w ? PEEK.rateIn : PEEK.rateOut;
    this.w += (want - this.w) * Math.min(1, dt * rate);
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
    const w = ss(Math.min(1, this.w));
    const b = O.b + wrap(Q.b - O.b) * w;
    const p = O.p + (Q.p - O.p) * w;
    const d = O.d + (Q.d - O.d) * w;
    camera.position.set(
      look.x + Math.sin(b) * Math.cos(p) * d,
      look.y + Math.sin(p) * d,
      look.z + Math.cos(b) * Math.cos(p) * d,
    );
    // ...and the aim on its own, from her out to the island.
    camera.lookAt(this._L.copy(look).lerp(this._aim.set(P.lx, P.ly, P.lz), w));
    return true;
  }
}
