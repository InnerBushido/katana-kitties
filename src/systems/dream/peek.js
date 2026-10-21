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

   ONE MOVE ONTO THE BRIDGE, NOT TWO — RICHARD'S THIRD PASS. "the transition
   from looking down the bridge to the bridge camera seems to not translate
   very well as the easing seems a bit off. If the player just runs across
   the bridge going from regular camera to bridge camera quickly, seems to be
   doing 2 transitions and a bit of a stutter ... We should increase the area
   for looking down the bridge so that it happens sooner, so maybe 1.5x's -
   2x's the radius as it currently is."
     · Two layers were moving at once. Stepping on turned the look across OFF,
       so it ran its 1.1 s home while the ride blended in over it — the ride's
       "start" was a pose still sliding back to the ordinary one: two moves.
       Now, while the ride takes over (`apply`'s `hold`), the look across
       never goes back: it finishes its own sweep, at its own pace, and lets
       go once the ride has the whole picture. FINISHES rather than freezes:
       frozen mid-sweep (a kitten who ran straight on) the lens stopped dead
       for the frames the ride's ease takes to get going — a stop and a
       start, the stutter itself, measured.
     · And the ride's first frame snapped the AIM from the island back to her:
       it blended its aim from `look` (her), and the look across had the lens
       pointed 130 units out. `SnakeCam` now blends from the aim the lens
       actually has.
     · The radius is 1.75× the 5.5 it was: `start` 9.6, `inner` 4.8, `exit` 13.

   AND THE STICK IS READ THROUGH IT. "when the camera changes, it should use
   the movement system for the bridge at this point": with the look across
   up, the screen faces the island, and a stick read through her ordinary
   `camYaw` pointed somewhere she could not see. `Player._moveBasis` reads it
   the way a Snake Way bridge does — through the lens that drew her, and a
   push held while the camera swings keeps going the way it started.

   THE CIRCLE BEFORE THE BRIDGE — RICHARD'S FOURTH PASS. "If player is
   standing on an interaction circle, let's not have the camera zoom in
   before crossing the bridge incase the interaction circle is near a
   bridge. The interaction circle should have camera priority over any
   bridge zooming functionality when player is in the interaction circle."
   And: "the bridge camera zooming before getting on the bridge radius is too
   big now, so lets make it 10 - 15% smaller. Or ... if player is walking
   towards the interaction circle, it should not do the camera zooming until
   they are approaching the bridge instead of the interaction circle."
     · Both: the radius is 12.5% smaller (`start` 8.4, `inner` 4.2, `exit`
       11.4), AND `stationFirst` says no look across while she stands in a
       kiosk's circle, or is walking at one that is nearer than the mouth.
       A look already up lets go the moment she steps into a circle.

   THREE MOVES WERE STILL TWO TOO MANY — RICHARD'S FIFTH PASS. "it looks like
   it is transitioning between 3 camera states: first is when the player
   starts approaching the bridge, it zooms in ... second the camera seems to
   be going back to a top-default camera view which shouldn't be happening at
   all, third the camera is transitioning to the bridge 'over the shoulders'
   camera view." Measured, walking on at a run: the look across was 0.28 of
   the way in at the mouth; `peekZone` let go of her 0.5 past it, and the ride
   did not board until 2.07 past — so for those frames the look across ran
   HOME (0.28 → 0.17, the lens 22 → 25.6 out), and then the ride came in over
   that. An ON trigger now keeps her out to `past` onto the deck, which is
   further than the ride ever takes to board, and `hold` takes it from there.
   "Also, the camera to 'look across the bridge' should only be happening if
   the player is moving in the direction to cross the bridge, if they are
   moving away from crossing the bridge, it should not show this camera
   view, such as, right after crossing the bridge". Heading at the MOUTH was
   the whole test, and a mouth is a point: off a bridge onto the hub's rim, a
   kitten turning along it heads straight at the neighbouring mouth while
   going square to the way that bridge runs. So `toward` also asks for her
   heading to agree with the BRIDGE's (`along`), and going against it is
   `away`.

   A LAYER, like `SnakeCam`: laid over whichever pose is already drawing.
   THE LENS IS BLENDED ROUND HER and the aim is blended separately, out to
   the island. Blending both as one orbit round the aim (SnakeCam's way) was
   tried first and measured: its aim slides 130 units out to the island, so
   the orbit's centre went with it and the lens moved 7.7 units in a frame.
--------------------------------------------------------------------------- */

export const PEEK = {
  /** Walking toward the mouth inside this (units from it) for `dwell`
   *  seconds turns it on. ~~11~~, ~~5.5 ("half as big")~~, ~~9.6, 1.75×
   *  that ("1.5x's - 2x's the radius")~~, and 12.5% smaller again: "too big
   *  now, so lets make it 10 - 15% smaller". */
  start: 8.4,
  dwell: 0.35,
  /** Inside this, going toward it, turns it on at once. */
  inner: 4.2,
  /** The buffer: once on, it stays on out to here... */
  exit: 11.4,
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
  /** ...and her heading must agree with the bridge's own direction by at
   *  least this much (a cosine): crossing it, not passing its mouth. */
  along: 0.35,
  /** Once ON, how far out onto the deck past the mouth it keeps her — the
   *  ride boards about 2 past it at a run, so the look across is never
   *  dropped in the gap before `hold` takes over. */
  past: 6,
};

const ss = (x) => x * x * (3 - 2 * x);

/** What the look across should do while the ride camera `snake` comes in for
 *  `riding` (her ride subject, or null): hold still under it, then go. */
export function peekHold(snake, riding) {
  if (!riding) return null;
  return snake && snake.w >= 1 ? 'gone' : 'hold';
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * The look across, as a lens and an aim. Pure.
 * @param S { x, y, z, far: {x, y, z}, spread?, side?, up? } — where she is,
 *   and the far island's centre (its floor height in `y`). `side` -1 puts the
 *   lens over her RIGHT shoulder and `up` raises it: the real world has
 *   things standing at a mouth that the layer does not (worldpeek.js
 *   `clearPose`), and the layer never passes either.
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
  const sh = PEEK.shoulder * (S.side ?? 1);
  return {
    x: S.x - ux * back - rx * sh,
    y: S.y + (S.up ?? PEEK.up),
    z: S.z - uz * back - rz * sh,
    lx: S.far.x,
    ly: S.far.y + PEEK.aimUp,
    lz: S.far.z,
  };
}

/**
 * Where a kitten at `pos` going at `vel` stands to one bridge end `E` =
 * { mouth, toward, far }: null when she is out of its reach (past `exit`, off
 * its deck's height, or already past the mouth onto the bridge — unless `on`,
 * when out to `past` onto it), else her distance and whether she is heading
 * for it, away from it, or neither. Pure.
 */
export function peekZone(pos, vel, E, on = false) {
  const dx = pos.x - E.mouth.x;
  const dz = pos.z - E.mouth.z;
  if (Math.abs(pos.y - E.mouth.y) > 3) return null;
  // Behind the mouth: on the deck it opens from, not already on the bridge.
  const out = dx * E.toward.x + dz * E.toward.z;
  if (out > (on ? PEEK.past : 0.5)) return null;
  const d = Math.hypot(dx, dz);
  if (d > PEEK.exit) return null;
  const sp = Math.hypot(vel.x, vel.z);
  const moving = sp >= PEEK.moving;
  // The way she goes against the way the bridge goes: crossing it, or not.
  const along = moving ? (vel.x * E.toward.x + vel.z * E.toward.z) / sp : 0;
  // Out on the deck already (an ON trigger only): onward is toward.
  if (out > 0.5) return { d, moving, toward: along >= PEEK.along, away: along <= -PEEK.toward };
  const cos = !moving ? 0 : d > 0.3 ? -(dx * vel.x + dz * vel.z) / (d * sp) : 1;
  return {
    d, moving,
    toward: moving && cos >= PEEK.toward && along >= PEEK.along,
    away: moving && (cos <= -PEEK.toward || along <= -PEEK.toward),
  };
}

/** How a kiosk's circle outranks a mouth: inside it (plus `pad`), or walking
 *  at it (a cosine of at least `cos` — narrower than a mouth's 0.35, so a
 *  circle merely off to one side does not hold the look back) while it is
 *  nearer than the nearest mouth. */
export const STATION_FIRST = { pad: 0.6, cos: 0.8 };

/**
 * The kiosk circle that has the camera instead of a bridge, or null. Pure.
 * `stations` are { x, y, z, r } and `ends` the mouths, both in the world.
 */
export function stationFirst(pos, vel, stations, ends) {
  const near = stations.filter((s) => Math.abs(pos.y - s.y) < 2);
  for (const s of near) if (Math.hypot(pos.x - s.x, pos.z - s.z) < s.r + STATION_FIRST.pad) return s;
  const sp = Math.hypot(vel.x, vel.z);
  if (sp < PEEK.moving) return null;
  let mouth = Infinity;
  for (const E of ends) mouth = Math.min(mouth, Math.hypot(pos.x - E.mouth.x, pos.z - E.mouth.z));
  if (mouth > PEEK.exit) return null;
  for (const s of near) {
    const d = Math.hypot(s.x - pos.x, s.z - pos.z);
    if (d >= mouth || d < 1e-6) continue;
    if (((s.x - pos.x) * vel.x + (s.z - pos.z) * vel.z) / (d * sp) >= STATION_FIRST.cos) return s;
  }
  return null;
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
      const z = peekZone(pos, vel, this.end, true);
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
   * `hold`: the ride camera is taking the picture over from this one — stay
   * exactly where it is, so the ride starts from ONE still pose, and drop
   * out once the ride has all of it (see the head of this file).
   */
  apply(dt, subject, camera, look, hold = null) {
    const want = subject ? subject.w : 0;
    if (hold === 'gone') this.w = 0;
    // ITS OWN CLOCK: once triggered it runs to the end at one speed, whatever
    // her feet do — "it should just move into place when triggered".
    else if (hold === 'hold' && !subject && this.w > 0.002) this.w = Math.min(1, this.w + dt / PEEK.sweepIn);
    else if (want > this.w) this.w = Math.min(want, this.w + dt / PEEK.sweepIn);
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
