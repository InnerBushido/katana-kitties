import * as THREE from 'three';
import { Billboard } from '../core/gfx.js';

/* ---------------------------------------------------------------------------
   The Pandapaw panda — a pet you raise rather than a mount you find.

   Every other rideable thing in the game is already standing there waiting for
   you. This one only exists because you fed it: swear to Pandapaw, then cut
   bamboo. Twenty canes buys a cub that trots after you; twenty more and it is
   big enough to climb on. That's the whole arc, and it's deliberately made of
   the one verb the game already rewards — the katana in the grove.

   Two rules carried over from the dragons, both learned the hard way:

     A pet can never be lost. It follows on foot where it can and simply meets
     you where it can't (see _catchUp) — a nine-year-old who flies to another
     island and leaves her panda behind has no way to understand what happened
     or how to fix it.

     Its drawn heading is locked BROADSIDE. It's a single side-on drawing, so
     walking "into" the screen puts it edge-on, right on the billboard's mirror
     threshold, and the whole animal snaps back and forth. Same fix as the
     ridden dragon: the heading comes from the sign of sideways motion with a
     dead zone, never from the full movement vector.
--------------------------------------------------------------------------- */

/**
 * How the panda grows. `at` is the number of bamboo canes its owner has cut —
 * a lifetime tally, so cutting bamboo before finding the shrine is never
 * wasted work.
 *
 * `size` is the DRAWN HEIGHT of the animal in world units, not the width of
 * its atlas cell. Both panda sheets came back with their content height
 * filling almost exactly `contentScale` of the cell (0.727 vs 0.731, and
 * 0.688 vs 0.693), so `size / contentScale * heightFraction` collapses to
 * `size` to within one percent — measured off the loaded atlases, not
 * assumed. A kitten is 2.9 tall, which is the number these are set against:
 * the cub comes up to her chest and the grown panda is nearly twice her
 * height. Copying the dragon's 13 put a panda in the world four and a half
 * times taller than the girl riding it.
 */
export const PANDA_TIERS = [
  {
    id: 'cub',
    name: 'cub',
    at: 20,
    size: 2.2,
    followDist: 2.0,
    rideable: false,
    blurb: 'It follows you everywhere.',
  },
  {
    id: 'adult',
    name: 'grown panda',
    at: 40,
    size: 5.6,
    followDist: 3.4,
    rideable: true,
    blurb: 'Press MOUNT to ride it!',
  },
];

/** Tier a tally has earned, or -1 for none yet. */
export function tierFor(bambooCut) {
  let t = -1;
  for (let i = 0; i < PANDA_TIERS.length; i++) {
    if (bambooCut >= PANDA_TIERS[i].at) t = i;
  }
  return t;
}

/** Bamboo still to cut before the next growth, or 0 when fully grown. */
export function toNextTier(bambooCut) {
  const next = PANDA_TIERS.find((t) => bambooCut < t.at);
  return next ? next.at - bambooCut : 0;
}

/**
 * Riding a grown panda. Twice running speed.
 *
 * This was 10x first, which is what a panda charging at full pelt sounds like
 * it should be — and at 105 units a second it crosses the whole home island in
 * under two seconds, arrives at the far rim before you have finished pushing
 * the stick, and is simply not steerable by a nine-year-old. 2x is fast enough
 * to feel like a mount and slow enough to aim.
 */
export const PANDA_SPEED = 2;
/** ...and a bigger jump, because it is a very large animal. */
export const PANDA_JUMP = 1.5;

/**
 * The claw swipe — the panda's answer to the dragon's breath.
 *
 * Wider and much heavier than the katana, but close in: the dragon hits things
 * from twenty units up, and the trade for riding on the ground is that you
 * have to actually get to them.
 *
 * IT CUTS BAMBOO. This is the one exception to `katanaOnly` in the whole game,
 * and it was a deliberate reversal: the first version refused, on the grounds
 * that an animal which harvests its own food turns the Pandapaw arc into a
 * machine that feeds itself. Playing it settled the argument the other way.
 * You cannot ride a panda until it is FULLY GROWN, and a fully grown panda is
 * the end of the ladder — there is no further tier for the extra canes to buy,
 * so nothing is actually being short-circuited. What the refusal really did
 * was make the reward for forty canes useless in the only place you spend all
 * your time, and leave clearing a 150-cane grove a job for one kitten with a
 * short sword.
 *
 * A dragon still cannot: burning the grove from the air would skip the landing
 * entirely, and the grove existing as the one place flight fails is what makes
 * flying worth something.
 */
export const CLAW = { range: 8, spread: 0.7, power: 2.1, time: 0.3 };

/* A follower has to out-run what it is following, or it trails further behind
   every second a kitten sprints. Thunderpaw sprinting is 23, so this is
   comfortably clear of the fastest thing on foot. */
const FOLLOW_SPEED = 38;
/* Past this it stops trying to walk and just meets you there — see _catchUp. */
const WARP_DIST = 90;

export class Panda {
  /**
   * @param {object} art  { cub, adult } — each an atlas as returned by
   *        loadSpriteAtlas: { texture, contentScale, pad }. The two drawings
   *        are packed independently, so each tier carries its own contentScale
   *        rather than sharing one; a shared value would make whichever sheet
   *        packed more loosely come out the wrong size.
   * @param {object} opts { owner, tier }
   */
  constructor(art, opts = {}) {
    const { owner = null, tier = 0 } = opts;
    const forTier = (t) => (t.id === 'cub' ? art.cub : (art.adult ?? art.cub));

    /** The player who raised it. A panda belongs to exactly one kitten. */
    this.owner = owner;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.facing = 0;
    /** The player currently sitting on it, or null. */
    this.rider = null;
    this.step = Math.random() * Math.PI * 2;

    this.group = new THREE.Group();

    /* One quad per tier, toggled by visibility — the two drawings are
       different sizes, and a Billboard bakes its size into its geometry, so
       they can't share one. Same reason the dragon carries two poses. */
    this.poses = PANDA_TIERS.map((t) => {
      /* `size` is the width of the square atlas cell, not of the animal: the
         loader fits each view into a square cell, so the quad must be square
         too and is divided by contentScale to get the drawn creature to the
         size actually asked for. */
      const a = forTier(t);
      const quad = t.size / (a.contentScale || 1);
      const b = new Billboard(a.texture, {
        cols: 1,
        rows: 1,
        width: quad,
        height: quad,
        footOffset: (a.pad ?? 0) * quad,
        artFacesRight: false,   // the generated panda faces left, like the dragon
      });
      b.visible = false;
      b.quad = quad;
      this.group.add(b);
      return b;
    });

    // Blob shadow, so it reads as standing on the ground rather than near it.
    const shadowGeo = new THREE.CircleGeometry(1, 20);
    shadowGeo.rotateX(-Math.PI / 2);
    this.shadow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({
      color: 0x2a1830, transparent: true, opacity: 0.32, depthWrite: false,
    }));
    this.group.add(this.shadow);

    /* "You can ride me" ring, in the owner's colour. Only ever shown on a
       grown panda: a ring on a cub would promise something it can't do. */
    const ringGeo = new THREE.RingGeometry(0.72, 0.95, 26);
    ringGeo.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: owner?.index === 1 ? 0xff6fae : 0xff8a3d,
      transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
    }));
    this.group.add(this.ring);

    this._buildClaw();

    this.tier = -1;
    this.setTier(tier);
  }

  /**
   * Three raked streaks that rip outward in front of the panda.
   *
   * Built like the katana's arc — ring wedges laid flat — rather than the
   * dragon's cloud of instanced shards, because a claw is a shape and not a
   * spray. Three separate wedges at slightly different radii is what makes it
   * read as claws instead of one more sword slash.
   */
  _buildClaw() {
    this.claw = new THREE.Group();
    this.clawMarks = [];
    for (let i = 0; i < 3; i++) {
      // Fanned around local +X, which is where a flat ring wedge points once
      // it has been laid down — the same quarter-turn the katana arc needs.
      const geo = new THREE.RingGeometry(0.42 + i * 0.05, 1.0, 20, 1, -0.38 + i * 0.34, 0.2);
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: i === 1 ? 0xfff4d2 : 0xffd98a,
        transparent: true, opacity: 0, depthWrite: false,
        side: THREE.DoubleSide, toneMapped: false,
      }));
      this.claw.add(m);
      this.clawMarks.push(m);
    }
    this.claw.visible = false;
    this.clawTimer = 0;
    this.clawDir = 0;
    this.group.add(this.claw);
  }

  /**
   * Swipe. Returns the spec so the caller can apply it, exactly the way
   * Dragon.breathe() does.
   * @param {number} dir world facing to swipe along
   */
  swipe(dir) {
    this.clawTimer = CLAW.time;
    this.clawDir = dir;
    return CLAW;
  }

  _updateClaw(dt) {
    if (this.clawTimer <= 0) {
      if (this.claw.visible) this.claw.visible = false;
      return;
    }
    this.clawTimer -= dt;
    const t = 1 - Math.max(0, this.clawTimer) / CLAW.time;   // 0 -> 1
    this.claw.visible = true;
    // Rake outward and fade. The quarter turn is removed for the same reason
    // the katana arc removes it: a flat ring wedge points along world +X.
    this.claw.rotation.y = this.clawDir - Math.PI / 2 + t * 0.5;
    this.claw.position.y = this.quad * 0.30;
    this.claw.scale.setScalar(CLAW.range * (0.45 + t * 0.72));
    this.clawMarks.forEach((m, i) => {
      m.material.opacity = Math.max(0, (1 - t) * 0.9 - i * 0.06);
    });
  }

  /** Grow (or shrink, on a restart) to a tier index. */
  setTier(i) {
    const t = THREE.MathUtils.clamp(i, 0, PANDA_TIERS.length - 1);
    if (t === this.tier) return this.spec;
    this.tier = t;
    this.spec = PANDA_TIERS[t];
    this.poses.forEach((b, k) => { b.visible = k === t; });
    this.sprite = this.poses[t];
    this.quad = this.sprite.quad;
    /* Generous, and it MUST be larger than followDist — a pet that parks
       itself just outside its own mount radius can never be climbed onto
       without walking at it, which is a baffling thing to have to work out
       about your own panda. */
    this.mountRadius = this.spec.size * 1.0;
    this.shadow.scale.setScalar(this.spec.size * 0.55);
    this.ring.scale.setScalar(this.spec.size * 0.62);
    return this.spec;
  }

  get rideable() {
    return !!this.spec?.rideable;
  }

  /**
   * Does it still trot after its owner?
   *
   * A GROWN panda only follows a kitten who is still sworn to Pandapaw. Leave
   * the clan and it stops where it is — you keep it, you can still walk back
   * and ride it, but it will not come to you any more. That is the difference
   * between a pet and a mount, and it's the same deal the dragons offer:
   * something big that waits for you at a place you have to remember.
   *
   * A CUB follows regardless. It's a baby; it doesn't care which shrine you
   * stood in, and stranding one somewhere a kid then has to remember is a
   * worse outcome than the rule being slightly inconsistent.
   */
  get follows() {
    if (!this.rideable) return true;
    return this.owner?.clan?.buff?.panda === true;
  }

  get mounted() {
    return this.rider != null;
  }

  /**
   * How far up the drawn animal the kitten sits.
   *
   * Measured, not guessed: scanning the loaded adult atlas puts the crimson
   * saddle blanket's top edge at 0.638 of the cell above the drawn feet, and
   * the top of the animal's back at 0.688.
   *
   * She sits on the BACK, a whisker under 0.688, so her soles disappear into
   * the fur and nothing hangs in the air. Tucking her under the saddle (0.55)
   * to overlap the flank was the wrong call — it hid 1.1 units of a 2.9-unit
   * kitten, which is her legs to the thigh, and read as a cat sunk into a bear
   * rather than riding one. But it cannot simply be doubled either: the saddle
   * is draped over the upper flank, not the spine, so even 0.72 floats her
   * clear of the animal and 1.10 would park her three units above a panda that
   * is only 5.6 tall. The back, not the saddle, is the thing to land on.
   *
   * This LIFTS THE DRAWING ONLY. Unlike the dragon, riding a panda is ground
   * movement, so the player's own position has to stay on the ground where
   * gravity, slope snapping and collision all expect it — moving the entity
   * up here would put her physically inside the hillside on every slope.
   */
  get seatHeight() {
    return this.quad * 0.66;
  }

  /**
   * Horizontal offset from the rider to the panda's centre.
   *
   * The saddle is drawn 0.167 of a cell BEHIND the middle of the animal (also
   * measured), so the panda's body has to sit that far forward of the kitten
   * or she ends up riding its rump. World-space along `facing`, which is
   * correct from every camera angle because the billboard mirrors itself so
   * the drawn head always points the way the panda is facing.
   */
  seatOffset() {
    const q = this.quad;
    return {
      x: -Math.sin(this.facing) * q * 0.14,
      y: 0,
      z: -Math.cos(this.facing) * q * 0.14,
    };
  }

  /**
   * Vertical bob of the waddle, for a rider to be matched to.
   *
   * NEGATIVE of sin(step), for exactly the reason the dragon's flapBob is:
   * the waddle is faked by squashing the sprite (scale.y = 1 - sin(step)*f),
   * so the panda's back drops when sin(step) is positive. Following it
   * directly lifts the kitten as the panda dips and the two instantly read as
   * two drawings sliding past each other rather than one riding the other.
   */
  get bounce() {
    return -Math.sin(this.step) * (this.rider ? 0.30 : 0.12) * (this.quad / 13);
  }

  faceCamera(camera) {
    this.sprite.faceCamera(camera);
  }

  /**
   * Point the drawn animal broadside, from decisive sideways motion only.
   *
   * `camYaw` comes from the owner's camera, because "sideways" is a screen
   * direction, not a world one — and in split screen the two kittens are
   * looking at the world from their own cameras.
   */
  _aim(camYaw) {
    const rx = Math.cos(camYaw);
    const rz = -Math.sin(camYaw);
    const lateral = this.velocity.x * rx + this.velocity.z * rz;
    if (Math.abs(lateral) > 1.6) this.side = Math.sign(lateral);
    this.side = this.side || 1;
    this.facing = camYaw + this.side * (Math.PI / 2);
  }

  /**
   * Put the panda beside its owner, on the ground.
   *
   * This is the "a pet can never be lost" clause. Walking works right up until
   * the kitten climbs on a dragon and flies to another island — after that no
   * amount of trotting will ever close the gap, and a panda left behind on an
   * island a kid cannot get back to is a dead end she can neither understand
   * nor fix. So beyond WARP_DIST it simply meets her there.
   *
   * Never while she is in the air: a pet popping into existence mid-flight
   * reads as a bug, and there is nothing under her to stand on anyway.
   */
  _catchUp(world, owner) {
    if (owner.mount) return false;
    const spot = world.findOpenSpot(owner.position.x, owner.position.z, 3)
      ?? { x: owner.position.x, z: owner.position.z };
    const g = world.heightAt(spot.x, spot.z);
    if (g == null) return false;
    this.position.set(spot.x, g.y, spot.z);
    this.velocity.set(0, 0, 0);
    return true;
  }

  update(dt, world, owner) {
    this.step += dt * (this.rider ? 9 : 2.4 + Math.hypot(this.velocity.x, this.velocity.z) * 0.34);

    if (this.rider) {
      /* Ridden: the KITTEN drives and the panda hangs off her, so the seat
         lands exactly where the player is. Solving it the other way round
         makes the player's own position lag the thing she is steering, and
         the camera follows the player. Position is set in Player. */
      this.ring.material.opacity = 0;
    } else {
      this._follow(dt, world, owner);
    }

    this.group.position.copy(this.position);
    this._updateClaw(dt);

    // Waddle: squash on the beat, and lean into it a little.
    const f = this.rider ? 0.05 : 0.035;
    this.sprite.mesh.scale.set(
      1 + Math.sin(this.step) * f * 0.6,
      1 - Math.sin(this.step) * f,
      1
    );
    this.sprite.mesh.rotation.z = Math.sin(this.step * 0.5) * 0.035;
    this.sprite.facing = this.facing;

    // Drop the shadow onto whatever is below.
    const below = world.heightAt(this.position.x, this.position.z);
    if (below) {
      const drop = this.position.y - below.y;
      this.shadow.visible = drop < 40;
      this.shadow.position.y = -drop + 0.05;
      this.ring.position.y = -drop + 0.06;
      this.shadow.material.opacity = 0.34 * Math.max(0.25, 1 - drop / 40);
    } else {
      this.shadow.visible = false;
    }
  }

  _follow(dt, world, owner) {
    /* She's on a dragon: the panda WAITS, exactly where it is.
       It cannot follow her into the sky, and chasing the point underneath a
       flying kitten walks it straight off the nearest rim and out over open
       water — where there is no ground to stand on and nothing to stop it.
       Sitting still is both the correct behaviour and the readable one: you
       look down and your panda is where you left it. It rejoins her the
       moment she is back on the ground; see _catchUp. */
    if (owner.mount) {
      this.velocity.multiplyScalar(1 - Math.min(1, dt * 6));
      this.ring.material.opacity *= 1 - Math.min(1, dt * 8);
      return;
    }

    /* Sworn to another clan: a grown panda stops following and waits. It stays
       rideable, so the ring keeps pulsing when she comes back to it — the
       whole point is that it is still hers, it just doesn't heel any more. */
    if (!this.follows) {
      this.velocity.multiplyScalar(1 - Math.min(1, dt * 6));
      const d = Math.hypot(owner.position.x - this.position.x,
        owner.position.z - this.position.z);
      const close = !owner.mount && d < this.mountRadius;
      const want = close ? 0.55 + Math.sin(this.step * 3) * 0.2 : 0.2;
      this.ring.material.opacity += (want - this.ring.material.opacity) * Math.min(1, dt * 8);
      return;
    }

    const dx = owner.position.x - this.position.x;
    const dz = owner.position.z - this.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist > WARP_DIST && this._catchUp(world, owner)) return;

    /* Hold station at followDist rather than walking into her back. Speed
       ramps with how far behind it is, so it ambles when she strolls and
       gallops when she sprints — one number instead of a state machine.

       The back-off term is not optional. Cutting the throttle at followDist
       only stops it ACCELERATING; a panda that arrives at speed then coasts
       ends up standing inside the kitten, and two sprites at the same point
       fight the depth sort and flicker against each other. Below 60% of the
       gap it actively shuffles back out, which also reads as the animal
       giving her room rather than shoving her. */
    const gap = this.spec.followDist;
    const want = dist > gap ? Math.min(FOLLOW_SPEED, (dist - gap) * 3.4)
      : dist < gap * 0.6 ? -(gap * 0.6 - dist) * 2.6
        : 0;
    const nx = dist > 0.001 ? dx / dist : 0;
    const nz = dist > 0.001 ? dz / dist : 0;

    const rate = 40 * dt;
    this.velocity.x += THREE.MathUtils.clamp(nx * want - this.velocity.x, -rate, rate);
    this.velocity.z += THREE.MathUtils.clamp(nz * want - this.velocity.z, -rate, rate);

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    /* Shove it out of houses and tree trunks the same way the kittens are.
       Without this it walks through the town and the illusion goes with it. */
    const fixed = world.resolveSolids(this.position.x, this.position.z, this.spec.size * 0.22);
    this.position.x = fixed.x;
    this.position.z = fixed.z;

    /* Glued to the ground, not falling onto it. A pet is never the thing you
       want doing interesting physics — if it walks off a rim, it stops at the
       last solid ground rather than tumbling into the sky. */
    const g = world.heightAt(this.position.x, this.position.z, this.position.y + 2);
    if (g) this.position.y = g.y;
    else this._catchUp(world, owner);

    this._aim(owner.camYaw ?? 0);

    // Pulse the ride ring when she's close enough to climb on.
    const near = this.rideable && !owner.mount && dist < this.mountRadius;
    const target = near ? 0.55 + Math.sin(this.step * 3) * 0.2 : (this.rideable ? 0.14 : 0);
    this.ring.material.opacity += (target - this.ring.material.opacity) * Math.min(1, dt * 8);
  }

  /**
   * Slaved to the rider each frame while mounted.
   *
   * Same Y as the rider — they are both standing on the same ground, and the
   * kitten is put on the panda's back by raising her sprite (seatHeight), not
   * by raising her. See seatHeight for why that has to be the way round.
   */
  carry(rider) {
    const seat = this.seatOffset();
    this.position.set(
      rider.position.x - seat.x,
      rider.position.y,
      rider.position.z - seat.z
    );
    this.velocity.copy(rider.velocity);
    this._aim(rider.camYaw ?? 0);
  }
}
