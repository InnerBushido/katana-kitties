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

     PILOT   steers. Ordinary flight — she takes `player.mount`, so every line
             of the existing flight controller applies unchanged.
     GUNNER  fires. She takes `player.rideAlong`, steers nothing, and her
             attack button opens the fan of beams.

   A LONE PILOT CAN STILL FIRE, but one beam (`SOLO_BEAMS`). The alternative —
   no breath without a gunner — was rejected: a kid playing while her sister is
   off cutting bamboo would have summoned a legendary dragon and be flying a
   very slow taxi. One beam is a real weapon. Seven is a spectacle, and the
   difference is visible from across the island, which is the actual lesson.

   IT IS NOT A `Dragon`. It shares the flight interface (`seatOffset`,
   `hovering`, `breed.breath`) because the player's flight code reads those,
   and nothing else: it has no perch, no breed, no come-home rule, and it is
   never lost because there is exactly one and it is summoned to the town.
--------------------------------------------------------------------------- */

/** Beams in the fan when both seats are filled, and when only one is. */
export const DUO_BEAMS = 7;
export const SOLO_BEAMS = 1;

/** How wide the full fan opens, in radians. Just under a third of a turn. */
export const FAN = 1.9;

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
    for (let i = 0; i < DUO_BEAMS; i++) {
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
  }

  /** Whichever seat is empty, or null when it is full. */
  freeSeat() {
    if (!this.pilot) return 'pilot';
    if (!this.gunner) return 'gunner';
    return null;
  }

  get ridden() { return !!(this.pilot || this.gunner); }

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
    const q = this.quad;
    return new THREE.Vector3(
      this.position.x + Math.sin(this.facing) * q * RYU_MOUTH.fwd,
      this.position.y + q * RYU_MOUTH.up,
      this.position.z + Math.cos(this.facing) * q * RYU_MOUTH.fwd
    );
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
   * @param {object} shooter the kitten who pressed it — the fan is aimed along
   *        HER facing, not the dragon's, for the same reason the panda's claw
   *        is: the dragon's drawn heading is locked broadside and only ever
   *        points two ways, so hanging the aim off it means the attack cannot
   *        be aimed at all.
   * @returns {number} beams fired, so the caller can say what happened
   */
  fire(world, hud, shooter) {
    const duo = !!(this.pilot && this.gunner);
    const n = duo ? DUO_BEAMS : SOLO_BEAMS;
    this.beamT = 0.42;
    this.beamCount = n;

    const base = shooter.facing;
    // Out of the MOUTH, not out of his middle — see RYU_MOUTH.
    const origin = this.mouthPos();
    const local = {
      x: Math.sin(this.facing) * this.quad * RYU_MOUTH.fwd,
      y: this.quad * RYU_MOUTH.up,
      z: Math.cos(this.facing) * this.quad * RYU_MOUTH.fwd,
    };

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
    hud?.sfx('ryubeam', duo ? 1 : 0.7);
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

    // Beams fade rather than blink out.
    if (this.beamT > 0) {
      this.beamT -= dt;
      const k = Math.max(0, this.beamT / 0.42);
      for (let i = 0; i < this.beams.length; i++) {
        const m = this.beams[i];
        if (i >= this.beamCount) { m.visible = false; continue; }
        m.material.opacity = 0.85 * k;
        m.visible = k > 0.02;
      }
    }
  }

  faceCamera(camera) {
    this.sprite.faceCamera(camera);
  }
}
