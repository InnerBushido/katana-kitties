import * as THREE from 'three';
import { Billboard } from '../core/gfx.js';

/* ---------------------------------------------------------------------------
   Ryuuseki — the legendary dragon the seven stars summon.

   The only two-seat animal in the game, and the only one that is BETTER with
   somebody else on it. Everything else here is parallel play: two kittens
   knocking over their own barrels, each raising her own panda, each flying her
   own dragon. This is the one thing neither of them can do properly alone, and
   the whole feature exists for that thirty seconds.

   THE SEATS DO DIFFERENT JOBS.

     PILOT   steers, and fires ONE beam. She takes `player.mount`, so every
             line of the existing flight controller applies unchanged.
     GUNNER  fires the FAN. She takes `player.rideAlong`, steers nothing, and
             her attack button opens all seven.

   THE BEAM COUNT IS A FACT ABOUT THE SEAT, NOT ABOUT HOW MANY SEATS ARE
   FILLED. It read the crew before: whoever pressed the button got seven the
   moment both girls were aboard, so a pilot who could only manage one beam
   alone suddenly fired the gunner's whole fan the instant her sister climbed
   on — and the gunner's job, the only thing she has, was something her sister
   could do without her. Now the pilot always fires one and the gunner always
   fires seven, so climbing into the second seat is what unlocks the fan and
   the girl in that seat is the one who owns it.

   A LONE PILOT CAN STILL FIRE, but one beam (`PILOT_BEAMS`). The alternative —
   no breath without a gunner — was rejected: a kid playing while her sister is
   off cutting bamboo would have summoned a legendary dragon and be flying a
   very slow taxi. One beam is a real weapon. Seven is a spectacle, and the
   difference is visible from across the island, which is the actual lesson.

   IT IS NOT A `Dragon`. It shares the flight interface (`seatOffset`,
   `hovering`, `breed.breath`) because the player's flight code reads those,
   and nothing else: it has no perch, no breed, no come-home rule, and it is
   never lost because there is exactly one and it is summoned to the town.
--------------------------------------------------------------------------- */

/** Beams per SEAT. The gunner owns the fan; the pilot always gets one. */
export const GUNNER_BEAMS = 7;
export const PILOT_BEAMS = 1;

/** How wide the full fan opens, in radians. Just under a third of a turn. */
export const FAN = 1.9;

/**
 * How far off his head a shooter may aim, in radians.
 *
 * THE BEAMS LEAVE HIS MOUTH, SO THEY HAVE TO GO WHERE HIS MOUTH POINTS. The
 * fan was aimed along the shooter's own facing with nothing tying it to the
 * animal, which is correct for the panda's claw — a kitten on a panda's back
 * can swing anywhere — and wrong here, because a claw comes out of the rider
 * and a beam comes out of the head. With the gunner's stick free, pointing it
 * back down his body fired seven beams out of his jaw travelling *backwards
 * over his own coils*: the thing Frost saw whenever he was drawn facing left
 * and she pushed right.
 *
 * A hard lock to the head instead would have made the second seat pointless —
 * a turret that cannot turn is a spectator. So she aims within an arc of the
 * mouth, and the bound is set against the FAN rather than picked: with the
 * outermost beam at `AIM_ARC + FAN / 2` off the head, keeping that under a
 * quarter turn is what guarantees nothing ever leaves the mouth pointing
 * behind him. `world-check` asserts the relationship, not the number, so
 * widening the fan later can't quietly reintroduce the bug.
 */
export const AIM_ARC = 0.55;

/** Reach and clout. Far longer than any storm dragon's 15–20. */
export const BEAM = { range: 34, power: 3.2, color: 0xfff0a0, name: 'a star beam' };

/**
 * Drawn height in world units. A storm dragon is 13; a kitten is 2.9.
 *
 * HALVED from 26. He is a worm, so his height is the small dimension: at 26
 * the drawn creature was 53 units long, which is most of the town, and no
 * camera distance framed him and the ground he was flying over at the same
 * time. 14 keeps him a head longer than a storm dragon — unmistakably the big
 * one — while fitting on screen with room to see what he is burning.
 */
export const RYU_SIZE = 14;

/**
 * Where the two girls sit, in fractions of the quad.
 *
 * MEASURED off the atlas, because on a creature drawn as an S-curve there is
 * no such thing as "the middle of its back" and guessing lands you in a hole.
 * Scanning the topmost drawn pixel at each offset gives the upper profile, in
 * cell fractions above the drawn bottom, with `thick` as how much creature is
 * actually under that point:
 *
 * ```
 *   toward head   0.00   0.10   0.20   0.25   0.30   0.35   0.40
 *   top           0.377  0.320  0.371  0.410  0.404  0.404  0.336
 *   thickness     0.104  0.236  0.240  0.371  0.363  0.238  0.072
 *                                      ^ the hump behind his neck
 * ```
 *
 * The first attempt seated them near the body centre, which reads as the
 * obvious place and is the WORST place: at 0.00 the thickness is 0.104,
 * because the middle of an S-curve is the gap between two coils. Both kittens
 * came out floating inside a ring of dragon with daylight under them, and
 * because they were technically at his origin nothing about the numbers looked
 * wrong. `thick` is the column that matters here, not `top`.
 *
 * `up` sits a shade under the profile so their feet sink into the scales
 * rather than hovering a hair above them — the same finish the panda's seat
 * needed. The drawn body's bottom edge is exactly at the group origin
 * (`Billboard` translates by `height/2 - footOffset`, and footOffset is
 * `pad * quad`), so these fractions are measured from the same zero the code
 * adds them to.
 */
export const RYU_BACK = {
  /**
   * EMBER, on top of his back — the hump behind his neck, which the profile
   * above says is both the highest point (0.410) and the thickest (0.371).
   */
  pilot: { fwd: 0.18, up: 0.330 },
  /**
   * FROST, up on his neck just behind the jaw, because she is the one working
   * his mouth. The fan leaves from `RYU_MOUTH` (0.438 forward) and a gunner
   * sitting behind the pilot had no visible relationship to where her own
   * attack came out.
   *
   * These read about 0.07–0.15 further forward than they are set, because
   * `faceCamera` also pushes every rider a tenth of a quad TOWARD the camera
   * to keep her out of his billboard, and part of that push lands along his
   * body. It varies with the viewing angle, so it cannot be cancelled — the
   * numbers here are chosen against where the girls actually end up on screen,
   * not against where the arithmetic alone would put them.
   */
  gunner: { fwd: 0.30, up: 0.375 },
};

/**
 * Where his mouth is, in quad fractions — `fwd` toward the head, `up` from the
 * drawn bottom. Measured off the atlas by taking the opaque pixels in the
 * leading 6% of the body and averaging their height.
 *
 * The beams come out of HERE. They were firing from his origin, which on a
 * creature this long is the middle of his back — three coils and forty units
 * behind the head, so the attack appeared to erupt from his ribs.
 */
export const RYU_MOUTH = { fwd: 0.438, up: 0.292 };

/** How high above the ground he waits when nobody is riding. */
export const HOVER = 11;

/**
 * How far back the follow camera sits while he is ridden, as a multiple of the
 * storm dragon's range. Read by Player._updateCamera.
 *
 * Deliberately larger than his size alone would ask for (quad/24 = 1.35). Two
 * things need the extra distance and neither is about fitting him in frame:
 *
 *  - A yaw-only billboard is only truly square to the view at its centre. The
 *    further its edges sit off the view axis the harder perspective keystones
 *    them, and across thirty units that stops reading as perspective and
 *    starts reading as a dragon turned twenty degrees away from you. Distance
 *    is the only lever short of abandoning yaw-only billboards, which every
 *    other sprite in the game depends on.
 *  - You are flying him over a town you are supposed to be flattening. At the
 *    old distance he filled the screen and the thing you were aiming at did
 *    not fit on it.
 */
export const RYU_CAM = 2.3;

/**
 * How far the SHARED camera sits from him, in multiples of his quad.
 *
 * Riding him forces a merged view, and the merged camera is a different rig
 * from the per-player one — it frames the two kittens and sizes its distance
 * from how far apart they are. On him they are both at his origin, so it saw a
 * separation of nearly zero and clamped to its 26-unit minimum: a 28-unit
 * dragon viewed from 26 units. Every adjustment I made to the per-player
 * camera did nothing at all, because that camera is not the one drawing.
 */
export const RYU_VIEW = 3.4;

export class Ryuuseki {
  constructor(art, x, y, z) {
    const quad = RYU_SIZE / (art.contentScale || 1);
    this.quad = quad;
    this.art = art;

    this.position = new THREE.Vector3(x, y, z);
    this.spawn = new THREE.Vector3(x, y, z);
    this.facing = 0;
    this.flySide = 1;
    this.bob = 0;
    this.hovering = false;
    /* The rider rides the animal's motion — a kitten hanging perfectly still
       over a moving creature reads as two drawings, not one. A storm dragon
       calls this its wingbeat; he has no wings, so it is the slow swell of a
       body that swims through the air. The field has to EXIST whatever it is
       called: Player reads `mount.flapBob`, and leaving it undefined NaN'd the
       rider's sprite and made her invisible. */
    this.flapBob = 0;
    /** How far back the follow camera sits on him. See RYU_CAM. */
    this.camScale = RYU_CAM;

    /** The two seats. */
    this.pilot = null;
    this.gunner = null;

    /* The flight controller reads `mount.breed.breath` for the dive-bomb and
       the toast text, so it has to look like a breed from the outside even
       though there is only ever one of these. */
    this.breed = { id: 'ryu', name: 'Ryuuseki', tint: 0xffffff, breath: BEAM };
    this.name = 'Ryuuseki';

    this.group = new THREE.Group();
    this.group.position.copy(this.position);

    this.sprite = new Billboard(art.texture, {
      cols: 1,
      rows: 1,
      width: quad,
      height: quad,
      footOffset: (art.pad ?? 0) * quad,
      artFacesRight: false,   // drawn facing left, like every dragon here
    });
    /* Draw him BEFORE the kittens. Both are transparent billboards, and at a
       60-unit quad the riders sit well inside his bounding box — near enough
       to his own depth that the sort flips between frames and the girls
       disappear into him. The outward nudge in Player.faceCamera handles the
       geometry; this makes the order deterministic on top of it. */
    this.sprite.renderOrder = -4;
    this.group.add(this.sprite);

    /* NO GLOW SPHERE. There was one — an 18-unit backside sphere meant to make
       him read as lit against the dark sky — and it was the single most
       obviously wrong thing on screen: a 3D ball hanging in the air around a
       flat drawing, lining up with nothing from any angle, because a sphere
       around a billboard is a sphere around a plane. Anything glowing here has
       to be a billboard too, or it isn't part of the same creature. */

    const shadowGeo = new THREE.CircleGeometry(RYU_SIZE * 0.22, 22);
    shadowGeo.rotateX(-Math.PI / 2);
    this.shadow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({
      color: 0x1a0f22, transparent: true, opacity: 0.32, depthWrite: false,
    }));
    this.group.add(this.shadow);

    const ringGeo = new THREE.RingGeometry(RYU_SIZE * 0.20, RYU_SIZE * 0.27, 32);
    ringGeo.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: 0xffd76a, transparent: true, opacity: 0.2,
      depthWrite: false, toneMapped: false,
    }));
    this.group.add(this.ring);

    /* The beams. Built once and hidden, because a fan of seven allocated per
       shot is seven geometries a second at the fire rate this thing allows. */
    this.beams = [];
    for (let i = 0; i < GUNNER_BEAMS; i++) {
      const g = new THREE.CylinderGeometry(0.5, 1.5, BEAM.range, 8, 1, true);
      g.translate(0, BEAM.range / 2, 0);
      g.rotateX(Math.PI / 2);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
        color: BEAM.color, transparent: true, opacity: 0,
        depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      }));
      m.visible = false;
      this.group.add(m);
      this.beams.push(m);
    }
    this.beamT = 0;
    this.beamCount = 0;
    /** Centre of the fan currently fading, in world yaw. See `fire`. */
    this.beamAim = 0;
  }

  /** Whichever seat is empty, or null when it is full. */
  freeSeat() {
    if (!this.pilot) return 'pilot';
    if (!this.gunner) return 'gunner';
    return null;
  }

  get ridden() { return !!(this.pilot || this.gunner); }

  /**
   * BOTH seats filled — the only state that gets the shared camera.
   *
   * `ridden` is not the same question and the two were confused, which cost
   * the split screen: a solo pilot forced a merged view, so the sister still
   * walking around town lost her own half of the screen to a dragon she wasn't
   * on. See `_updateSplit`.
   */
  get duo() { return !!(this.pilot && this.gunner); }

  /** Which seat this kitten is in, or null if she isn't aboard. */
  seatOf(who) {
    if (who && who === this.pilot) return 'pilot';
    if (who && who === this.gunner) return 'gunner';
    return null;
  }

  /**
   * How many beams this shooter opens. A fact about her SEAT — see the header.
   * An unseated caller (the debug key, a test) gets the gunner's fan.
   */
  beamsFor(shooter) {
    return this.seatOf(shooter) === 'pilot' ? PILOT_BEAMS : GUNNER_BEAMS;
  }

  /**
   * The centre of the fan: the shooter's aim, clamped to `AIM_ARC` either side
   * of the way his head is pointing. See AIM_ARC for why the clamp exists.
   *
   * The pilot is unaffected by construction — `_updateFlight` sets her facing
   * to `camYaw + flySide * PI/2`, which is exactly the heading `carry` gives
   * him, so her difference is zero. It is the gunner's free stick this bounds.
   */
  aimFor(shooter) {
    let d = (shooter?.facing ?? this.facing) - this.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return this.facing + Math.max(-AIM_ARC, Math.min(AIM_ARC, d));
  }

  /**
   * Where a rider is drawn, relative to the dragon's own position.
   *
   * The flight controller hangs the whole PILOT entity off this — the dragon
   * sits `seatOffset().y` below her, exactly like a storm dragon — so the
   * pilot's offset is the one that has to satisfy the flight code. The gunner
   * is placed from the same numbers so the two of them sit on one back rather
   * than at two unrelated heights.
   *
   * The drawn creature is a long horizontal worm inside a square cell, so it
   * fills well under half the cell's height: offsets scaled to the QUAD would
   * put both girls a body-length above it. These are fractions of the drawn
   * body, the same correction the storm dragon needed.
   */
  seatOffset(seat = 'pilot') {
    const q = this.quad;
    /* `fwd` is toward the HEAD, and the sign matters: `carry` does
       `dragon = rider - seat`, so a positive term here puts the rider that far
       forward along `facing`. Both girls sit on the hump behind his neck.
       See RYU_BACK for why there and nowhere else. */
    const s = seat === 'gunner' ? RYU_BACK.gunner : RYU_BACK.pilot;
    return {
      x: Math.sin(this.facing) * q * s.fwd,
      y: q * s.up,
      z: Math.cos(this.facing) * q * s.fwd,
    };
  }

  /**
   * Where his mouth is in world space, for the beams to leave from.
   *
   * `fwd` runs along `facing`, which is the DRAWN heading — locked broadside
   * and mirrored, so the head really is at `+fwd` along it whichever way he is
   * pointing. That is the whole reason the drawn heading exists.
   */
  mouthPos() {
    const m = this.mouthLocal();
    return new THREE.Vector3(
      this.position.x + m.x, this.position.y + m.y, this.position.z + m.z
    );
  }

  /** The same point relative to his group, which is where the beams live. */
  mouthLocal() {
    const q = this.quad;
    return {
      x: Math.sin(this.facing) * q * RYU_MOUTH.fwd,
      y: q * RYU_MOUTH.up,
      z: Math.cos(this.facing) * q * RYU_MOUTH.fwd,
    };
  }

  /**
   * The pilot's seat, applied to her DRAWING rather than to her position.
   *
   * This is the panda's trick and it is here for a harder reason. `carry` puts
   * the animal at `rider - offset`; if that offset has a horizontal term, and
   * the term rotates with a heading that SWAPS between two values, then every
   * flip throws the whole animal `2 * fwd * quad` sideways. Ember cannot sit
   * on his hump and have the dragon hang off her at the same time.
   *
   * So `carry` only ever uses the vertical part — the animal's position is
   * rock steady under her — and this horizontal part moves her sprite onto the
   * hump instead. A flip now slides one small kitten across his back, which is
   * what a rider on a turning animal should look like anyway.
   */
  drawOffset(seat = 'pilot') {
    const q = this.quad;
    const s = RYU_BACK[seat] ?? RYU_BACK.pilot;
    return {
      x: Math.sin(this.facing) * q * s.fwd,
      y: 0,
      z: Math.cos(this.facing) * q * s.fwd,
    };
  }

  /**
   * The point the camera should look at and orbit: where the GIRLS are, not
   * where the animal's origin is.
   *
   * Both riders' positions sit at his centre — their seats are draw offsets —
   * so pointing the camera at "the rider" and pointing it at "the dragon" are
   * the same point, which is why pulling back alone never re-framed anything.
   * The place a player is actually watching is the pair of kittens on his
   * neck, and that is `drawOffset` forward of centre.
   *
   * Averaged across whichever seats are filled, so a solo pilot gets her own
   * seat rather than a midpoint with an empty one.
   */
  ridersMidpoint() {
    const seats = [];
    if (this.pilot) seats.push('pilot');
    if (this.gunner) seats.push('gunner');
    if (!seats.length) return null;
    const p = new THREE.Vector3();
    for (const s of seats) {
      const d = this.drawOffset(s);
      p.x += this.position.x + d.x;
      p.z += this.position.z + d.z;
      p.y += this.position.y + this.quad * RYU_BACK[s].up;
    }
    return p.multiplyScalar(1 / seats.length);
  }

  /** Slaved to the pilot each frame, exactly like a ridden storm dragon. */
  carry(rider) {
    // VERTICAL ONLY — see drawOffset for why the horizontal part cannot live
    // here without making him lurch on every heading flip.
    const seat = this.seatOffset('pilot');
    this.position.set(
      rider.position.x,
      rider.position.y - seat.y,
      rider.position.z
    );
    /* His DRAWN heading is broadside-only and comes from `flySide`, not from
       the rider's facing. Copying her facing straight across spun the drawing
       with every stick nudge, which on a single side-on cell means a mirror
       flip on every crossing — the "flipping too much" the whole creature was
       doing. She aims; he faces the way he is travelling. */
    this.flySide = rider.flySide ?? this.flySide;
    this.facing = (rider.camYaw ?? 0) + this.flySide * (Math.PI / 2);
  }

  /**
   * Open fire.
   *
   * @param {object} world  for the props
   * @param {object} hud    for the score and the noise
   * @param {object} shooter the kitten who pressed it. Her SEAT decides how
   *        many beams open, and her facing aims them — within `AIM_ARC` of the
   *        way his head is pointing, because they come out of his mouth.
   * @returns {number} beams fired, so the caller can say what happened
   */
  fire(world, hud, shooter) {
    const n = this.beamsFor(shooter);
    this.beamT = 0.42;
    this.beamCount = n;

    const base = this.aimFor(shooter);
    this.beamAim = base;
    // Out of the MOUTH, not out of his middle — see RYU_MOUTH.
    const origin = this.mouthPos();
    const local = this.mouthLocal();

    let hits = 0;
    for (let i = 0; i < this.beams.length; i++) {
      const m = this.beams[i];
      if (i >= n) { m.visible = false; continue; }
      // Centre beam straight ahead, the rest fanned evenly either side.
      const spread = n === 1 ? 0 : (i / (n - 1) - 0.5) * FAN;
      const a = base + spread;
      m.visible = true;
      m.position.set(local.x, local.y, local.z);
      m.rotation.set(0, a, 0);
      m.material.opacity = 0.85;

      // Everything inside a wedge along this beam goes over.
      for (const p of world.props) {
        if (p.taken || p.gone || p.knocked || p.katanaOnly) continue;
        const dx = p.home.x - origin.x;
        const dz = p.home.z - origin.z;
        const dist = Math.hypot(dx, dz);
        if (dist > BEAM.range) continue;
        let d = Math.atan2(dx, dz) - a;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        // A beam is a line, so the wedge is narrow — it widens with distance
        // only enough that a far prop is still hittable.
        if (Math.abs(d) > 0.13 + 1.2 / Math.max(4, dist)) continue;
        const dir = new THREE.Vector3(dx / (dist || 1), 0, dz / (dist || 1));
        if (p.knock(dir, BEAM.power) && !p.scored) {
          p.scored = true;
          shooter.score += p.points ?? 10;
          hud?.onMischief(shooter, p, BEAM.name);
          hits++;
        }
      }
    }
    hud?.sfx('ryubeam', n > 1 ? 1 : 0.7);
    return n;
  }

  update(dt, world) {
    this.bob += dt;

    if (!this.ridden) {
      /* HE COMES DOWN TO BE CLIMBED ON. He used to hang at whatever height he
         was summoned to, which was well over the town — you could see him,
         you could not reach him, and stepping off once meant never getting
         back on. A mount you can lose by dismounting is worse than no mount.
         So when nobody is aboard he settles to HOVER above the ground under
         him, which is inside `ryuMountRadius` from a kitten standing there. */
      const g = world?.heightAt(this.position.x, this.position.z);
      const want = (g ? g.y : this.spawn.y) + HOVER;
      this.position.y += (want - this.position.y) * Math.min(1, dt * 1.4);
      this.position.y += Math.sin(this.bob * 0.7) * 0.05;
      /* HE DOES NOT TURN WHILE HE WAITS, and that is the storm dragon's own
         hard-won rule (see Dragon._perch): a single side-on cell mirrors the
         instant its facing crosses the camera axis, so anything idly rotating
         flips left-right every few seconds for no reason a player can see. The
         first version eased `facing` between +90 and -90 degrees, which walks
         straight through that threshold twice a cycle — it was the jarring
         flip. He holds his heading and the billboard just faces you. */
    }

    this.group.position.copy(this.position);
    this.sprite.facing = this.facing;

    /* Broadside only, exactly like a ridden storm dragon and the panda: it is
       one long side-on drawing, so steering the DRAWN heading with the real
       movement vector puts it edge-on at the billboard's mirror threshold and
       the whole creature snaps back and forth. */
    this.sprite.mesh.scale.y = 1 - Math.sin(this.bob * 2.1) * 0.035;
    /* NEGATIVE of the swell, like the storm dragon's rider bob and for the
       same reason: squashing the sprite drops his back exactly when the sine
       is positive, so following it directly lifts the girls as he dips and the
       two read as separate drawings sliding past each other. */
    this.flapBob = -Math.sin(this.bob * 2.1) * this.quad * 0.012;

    // Ground shadow and the mount ring track the terrain under it.
    const g = world?.heightAt(this.position.x, this.position.z, this.position.y);
    const gy = g ? g.y : this.position.y - 40;
    this.shadow.position.set(0, gy - this.position.y + 0.06, 0);
    this.shadow.visible = !!g;
    this.ring.position.copy(this.shadow.position);
    this.ring.visible = !!g && !!this.freeSeat();
    const pulse = 0.22 + Math.sin(this.bob * 3) * 0.12;
    this.ring.material.opacity = this.freeSeat() ? pulse : 0;

    /* Beams fade rather than blink out — and they stay ON THE MOUTH while they
       do. They are children of his group, so they travel with him for free,
       but the mouth is `RYU_MOUTH.fwd` along a heading that SWAPS: fire while
       flying left, flip right, and a fan pinned to the local offset it was
       born with hangs off his tail for the rest of its fade. Re-anchoring is
       one vector a frame and it is only ever done while something is visible.

       Their ANGLE is deliberately not re-derived: a beam already out of the
       mouth is in the world, and swinging the whole fan round to follow his
       head would sweep it across everything between. */
    if (this.beamT > 0) {
      this.beamT -= dt;
      const k = Math.max(0, this.beamT / 0.42);
      const local = this.mouthLocal();
      for (let i = 0; i < this.beams.length; i++) {
        const m = this.beams[i];
        if (i >= this.beamCount) { m.visible = false; continue; }
        m.position.set(local.x, local.y, local.z);
        m.material.opacity = 0.85 * k;
        m.visible = k > 0.02;
      }
    }
  }

  faceCamera(camera) {
    this.sprite.faceCamera(camera);
  }
}
