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

/** Drawn height in world units. A storm dragon is 13; a kitten is 2.9. */
export const RYU_SIZE = 26;

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
  pilot: { fwd: 0.31, up: 0.375 },
  gunner: { fwd: 0.20, up: 0.345 },
};

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
    this.group.add(this.sprite);

    // A halo of its own light, so it reads as lit rather than painted even
    // once the sky has gone dark for it.
    this.glow = new THREE.Mesh(
      new THREE.SphereGeometry(quad * 0.30, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0xffe9a0, transparent: true, opacity: 0.13,
        side: THREE.BackSide, depthWrite: false, toneMapped: false,
      })
    );
    this.group.add(this.glow);

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

  /** Slaved to the pilot each frame, exactly like a ridden storm dragon. */
  carry(rider) {
    const seat = this.seatOffset('pilot');
    this.position.set(
      rider.position.x - seat.x,
      rider.position.y - seat.y,
      rider.position.z - seat.z
    );
    this.facing = rider.facing;
    this.flySide = rider.flySide ?? this.flySide;
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
    const origin = this.position.clone();
    origin.y += this.quad * 0.10;

    let hits = 0;
    for (let i = 0; i < this.beams.length; i++) {
      const m = this.beams[i];
      if (i >= n) { m.visible = false; continue; }
      // Centre beam straight ahead, the rest fanned evenly either side.
      const spread = n === 1 ? 0 : (i / (n - 1) - 0.5) * FAN;
      const a = base + spread;
      m.visible = true;
      m.position.set(0, this.quad * 0.10, 0);
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
      // Waiting to be climbed on: it hangs over the town, turning slowly.
      this.position.y = this.spawn.y + Math.sin(this.bob * 0.7) * 0.9;
      this.facing = Math.sin(this.bob * 0.25) * 0.5;
    }

    this.group.position.copy(this.position);
    this.sprite.facing = this.facing;

    /* Broadside only, exactly like a ridden storm dragon and the panda: it is
       one long side-on drawing, so steering the DRAWN heading with the real
       movement vector puts it edge-on at the billboard's mirror threshold and
       the whole creature snaps back and forth. */
    this.sprite.mesh.scale.y = 1 - Math.sin(this.bob * 2.1) * 0.035;
    this.glow.material.opacity = 0.11 + Math.sin(this.bob * 1.6) * 0.035;

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
