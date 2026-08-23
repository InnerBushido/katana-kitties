import * as THREE from 'three';
import { Billboard } from '../core/gfx.js';

/* ---------------------------------------------------------------------------
   The griffin — Mr Satan's taxi to the tournament.

   IT IS NOT A MOUNT, AND THAT IS THE WHOLE DESIGN. Every other animal in this
   game is something you climb onto and steer; this one is a scripted ride
   with a camera on it. The reason is what the arena is: a place 330 units
   north that has no ground under it until the tournament opens. If the girls
   could fly themselves there, "the arena is shut" would have to be a wall
   they bounce off — and the moment a kid can aim at a place and be refused,
   the refusal is the feature she remembers. Being CARRIED there means the
   question never comes up: there is nowhere to go until somebody takes you,
   and then you are simply there.

   It also solves a two-player problem the dragons have never had to. The
   tournament needs BOTH kittens at the arena, together, at the same moment.
   Two independently flown dragons arrive whenever they arrive, and one girl
   sitting in an empty ring waiting for her sister to work out where north is
   would be the worst possible opening for the best thing in the game.

   UNDER TEN SECONDS AND SKIPPABLE, both from the brief and both right. A
   fly-through is worth watching once; the second and third tournaments of an
   afternoon it is a loading screen with a griffin on it.
--------------------------------------------------------------------------- */

/** Drawn height in world units. A storm dragon is 13, a kitten is 2.9. */
export const GRIFFIN_SIZE = 12;

/** How long the flight takes. The brief said under ten seconds. */
export const FLIGHT_TIME = 8.0;

/** How high above the straight line the arc bulges, in world units. */
const ARC_LIFT = 120;

/**
 * Where the two of them sit, as fractions of the drawn quad.
 *
 * SEPARATED ALONG THE BODY, and the first pass was not. At 0.02 apart they
 * were the same point to within half a kitten: two transparent billboards at
 * one depth, so the sort picked one and the other simply was not in the shot.
 * Ember was on the griffin for the whole flight and invisible for all of it,
 * which reads as her having been left behind.
 *
 * `up` differs slightly too — the saddle sits on a back that rises toward the
 * shoulders, so the front seat is the higher one.
 *
 * FOUR OF THEM, AND THE FALLBACK WAS THE BUG. There were two, and `_place` read
 * `SEATS[i] ?? SEATS[0]` — so a third and fourth rider were placed at the FIRST
 * seat, back to exactly the case above: several transparent billboards at one
 * depth, the sort picks one, and two kittens are invisible for the whole flight
 * to a tournament they are about to fight in. The spacing is the measured 0.19
 * continued fore and aft, and `up` keeps falling toward the tail because that
 * is the shape of the back they are sitting on.
 */
const SEATS = [
  { along: -0.29, up: 0.21 },
  { along: -0.10, up: 0.19 },
  { along: 0.09, up: 0.16 },
  { along: 0.28, up: 0.13 },
];

export class Griffin {
  constructor(art) {
    this.group = new THREE.Group();
    this.position = new THREE.Vector3();
    this.facing = 0;
    this.quad = GRIFFIN_SIZE / (art.contentScale ?? 1);
    /** Set by the flight; the riders bob with it, like a dragon's flapBob. */
    this.flapBob = 0;

    this.sprite = new Billboard(art.texture, {
      cols: 1,
      rows: 1,
      width: this.quad,
      height: this.quad,
      footOffset: (art.pad ?? 0) * this.quad,
      // Drawn facing LEFT, like the dragons and the panda.
      artFacesRight: false,
    });
    /* Behind the riders, deterministically. Both are transparent billboards
       and the kittens sit well inside this quad's bounding box, so without a
       fixed order the depth sort flips frame to frame and the girls blink in
       and out of the animal carrying them. Same fix as Ryuuseki. */
    this.sprite.renderOrder = -4;
    this.group.add(this.sprite);
    this.group.visible = false;

    /** Its own camera, so the flight can be a shot rather than a follow. */
    this.camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.5, 6000);
    this._look = new THREE.Vector3();

    this.riders = [];
    this.flying = false;
    this.t = 0;
    this.dur = FLIGHT_TIME;
    this.from = new THREE.Vector3();
    this.to = new THREE.Vector3();
  }

  /**
   * Start the ride.
   *
   * @param {THREE.Vector3} from where they are standing now
   * @param {THREE.Vector3} to   where they are being put down
   * @param {Player[]} riders
   */
  fly(from, to, riders) {
    this.from.copy(from);
    this.to.copy(to);
    this.riders = riders;
    for (const p of riders) p.carried = this;
    this.flying = true;
    this.done = false;
    this.t = 0;
    this.group.visible = true;
    /* Faces along the trip and STAYS there. A billboard drawn side-on has
       exactly two honest poses, and re-deriving the heading from velocity on
       a curved path puts it edge-on at the top of the arc — the mirror
       threshold — where the whole animal snaps back and forth. The trip is a
       straight line in plan view, so one heading is the truth for all of it.
       Same rule as a ridden dragon's `flySide`. */
    this.facing = Math.atan2(to.x - from.x, to.z - from.z);
    this._place(0);
  }

  /** Jump to the end. Called when somebody presses skip. */
  skip() {
    if (!this.flying) return;
    this.t = this.dur;
    this._finish();
  }

  _finish() {
    this.flying = false;
    this.done = true;
    this.group.visible = false;
    /* Put them down properly rather than wherever the arc ended. The landing
       spot is a real place on the island with real ground under it; the last
       frame of a parabola is 0.4 units above it and reads as a hover. */
    for (const p of this.riders) {
      p.velocity.set(0, 0, 0);
      p.onGround = true;
      /* Cleared, or `faceCamera` keeps nudging her sideways for the rest of
         the game — the offset is only ever reset in the `else` branch, and
         that branch is unreachable while `carried` is still set. */
      p.carried = null;
    }
    this.riders = [];
  }

  /**
   * Position everything for a normalised time along the flight.
   *
   * The path is a straight line in x/z with a parabola in y, which is the
   * cheapest thing that reads as flight and the only thing that reads as
   * flight from a camera riding alongside it. The lift is `4t(1-t)` — zero at
   * both ends, one in the middle — so they take off from the ground and land
   * on it without either end needing a special case.
   */
  _place(k) {
    const ease = k * k * (3 - 2 * k);          // smoothstep: a gentle launch
    this.position.lerpVectors(this.from, this.to, ease);
    this.position.y += ARC_LIFT * 4 * ease * (1 - ease);

    // A slow wingbeat, and the riders ride the NEGATIVE of it — the sprite
    // squashes, so its back drops exactly when the sine is positive.
    const flap = Math.sin(this.t * 4.4);
    this.sprite.mesh.scale.set(1, 1 - flap * 0.05, 1);
    this.flapBob = -flap * this.quad * 0.02;

    this.group.position.copy(this.position);
    this.sprite.facing = this.facing;

    /* The riders are moved to the animal, not carried by it. Their own
       `update` is not running during the flight (Game skips it, exactly as it
       does for a cutscene), so nothing is fighting this for their position —
       and their groups have to be moved explicitly because `Player.update` is
       what normally copies position into group. */
    /* Two riders keep the two seats they were measured into rather than being
       spread over four — the griffin is drawn for a pair, and pushing them out
       to the extreme seats to make room for kittens who are not on it would
       change the shot the girls already know. */
    const seats = this.riders.length <= 2 ? SEATS.slice(1, 3) : SEATS;
    this.riders.forEach((p, i) => {
      const s = seats[i] ?? seats[0];
      p.position.set(
        this.position.x + Math.sin(this.facing) * s.along * this.quad,
        this.position.y + s.up * this.quad,
        this.position.z + Math.cos(this.facing) * s.along * this.quad
      );
      p.group.position.copy(p.position);
      p.velocity.set(0, 0, 0);
      // Facing the way they are travelling, in the airborne pose.
      p.facing = this.facing;
      p.sprite.facing = this.facing;
      p.sprite.row = p.anim.jump;
      p.onGround = false;
    });
  }

  /**
   * @returns {boolean} true while the flight is still running
   */
  update(dt) {
    if (!this.flying) return false;
    this.t = Math.min(this.dur, this.t + dt);
    this._place(this.t / this.dur);
    this._updateCamera();
    if (this.t >= this.dur) this._finish();
    return this.flying;
  }

  /**
   * A travelling side-on shot that swings behind them as they arrive.
   *
   * BROADSIDE FIRST, BECAUSE THE ANIMAL IS A SIDE-ON DRAWING. A chase camera
   * sitting behind a yaw-only billboard is looking at a vertical line — the
   * one angle at which this sprite has nothing to show. So the shot runs
   * alongside for most of the trip, where the griffin and both riders are
   * fully drawn, and only swings round toward the end so the last thing on
   * screen is the arena coming up ahead of them rather than a wing.
   */
  _updateCamera() {
    const k = this.t / this.dur;
    const side = Math.sin(this.facing + Math.PI / 2);
    const sideZ = Math.cos(this.facing + Math.PI / 2);
    // 0 alongside, 1 behind. Held flat until the last third, then swings.
    const swing = Math.max(0, (k - 0.62) / 0.38) ** 1.5;
    /* POSITIVE, AND THE SIGN WAS THE WHOLE OF "THE CAMERA GOES MAD AT THE END".
       `bx`/`bz` below are already negated — they subtract the heading — so a
       NEGATIVE `back` swung the camera round to the FRONT of the griffin
       instead of behind it. At `swing` 1 that put the camera 2.4 quads ahead of
       the animal while `_look` aimed 2.2 quads ahead of it, i.e. at a point a
       fifth of a quad BEHIND the camera and a whole quad below it. `lookAt`
       with a near-vertical direction has no stable yaw, so the last second of
       the ride was a shot of the ground spinning, with the griffin and both
       riders off screen behind it. Reported as exactly that. */
    const back = swing;
    // Far enough back that the whole animal AND both riders are in frame —
    // at 2.3 the wings ran off the top of the screen and the shot was a
    // close-up of a saddle.
    const out = this.quad * (3.0 - swing * 0.6);

    const bx = -Math.sin(this.facing) * out * back;
    const bz = -Math.cos(this.facing) * out * back;
    this.camera.position.set(
      this.position.x + side * out * (1 - swing) + bx,
      this.position.y + this.quad * (0.55 + swing * 0.35),
      this.position.z + sideZ * out * (1 - swing) + bz
    );
    /* Looking a little AHEAD of them rather than at them. The subject of the
       last few seconds is where they are going, and a camera locked on the
       animal keeps the arena off the bottom of the frame until they land on
       it. */
    this._look.set(
      this.position.x + Math.sin(this.facing) * this.quad * swing * 2.2,
      this.position.y - this.quad * 0.1,
      this.position.z + Math.cos(this.facing) * this.quad * swing * 2.2
    );
    this.camera.lookAt(this._look);
  }

  faceCamera(camera) {
    this.sprite.faceCamera(camera);
  }
}
