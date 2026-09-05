import * as THREE from 'three';
import { Billboard } from '../core/gfx.js';
import { styleFor } from '../core/palette.js';
import { tune } from '../core/tuning.js';

/* NOTHING HERE IMPORTS `player.js`, and that is load-bearing rather than
   tidy: `player.js` already imports PANDA_SPEED from this file, so a reference
   the other way closes an import cycle. The comment at the top of palette.js
   is the record of that. Everything this file needs to know about a kitten it
   is handed — `owner.maxHp`, `owner.hp` — and the one number it would
   otherwise have to import (the standing slash's damage) is applied by
   `Game.strikePlayers`, which imports both and is the one gate anyway. */

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

   AND THEN IT WAS GIVEN SOMETHING TO DO IN THE RING. Asked for as "panda in
   the arena, should have some kind of effect", and the answer is two different
   animals rather than one animal with a stat.

     THE GROWN PANDA IS A BODY IN THE FIGHT. It hits harder than the katana it
     replaces, it is much bigger to hit, it has a bar of its own — thirty per
     cent of its owner's — and a blow moves it a third as far as it would move
     a kitten. Knock that bar out and it does not die and is not lost: it is a
     cub again. Fourth non-negotiable, and it is the reason this is a
     COLLAPSE and never a removal.

     THE CUB IS A NURSE. Under a third of a bar and it comes and licks her, and
     she gets half a per cent of her maximum back every second it keeps at it.
     That is deliberately tiny — it is a reason to still care about a cub, not
     a second feast.

   THE COLLAPSE IS THE ONLY THING IN THIS GAME THAT UNDOES ITSELF AT A SHRINE.
   A knocked-down panda stays a cub for the rest of the game until its owner
   walks back to the Pandapaw hall and presses INTERACT — and it costs no
   bamboo, because the forty canes were already cut and charging them again
   would be taking the work away rather than the animal. `knockedDown` is what
   holds it down; `Game._updatePanda` would otherwise re-grow it out of the
   tally on the very next cane.

   NONE OF THE DAMAGE LIVES HERE. `Panda.hurt` takes a number and spends it;
   who may hit whom, with what, and when is `Game.strikePlayers` and stays
   there. Third non-negotiable: one gate, one `if`, and an animal that could
   hurt a kitten from its own file would be the second copy of it.
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
    /** Bought with LIFETIME canes — see tierFor. */
    at: 20,
    size: 2.2,
    followDist: 2.0,
    rideable: false,
    blurb: 'It follows you everywhere.',
  },
  {
    id: 'adult',
    name: 'grown panda',
    /** Bought with canes cut SINCE the cub arrived — see tierFor. */
    after: 20,
    size: 5.6,
    followDist: 3.4,
    rideable: true,
    blurb: 'Press MOUNT to ride it!',
  },
];

/**
 * Total canes one kitten must cut to go from nothing to a rideable panda.
 *
 * Exported because the two rungs are priced in different currencies and the
 * sum is not something a caller should be re-deriving: the world builder has
 * to guarantee twice this much bamboo within reach, and reading `.at` off the
 * last tier — which is what it used to do — silently returned NaN the moment
 * the adult stopped having one.
 */
export const FULL_PANDA_COST = PANDA_TIERS[0].at
  + PANDA_TIERS.slice(1).reduce((n, t) => n + t.after, 0);

/**
 * The tier this player has earned.
 *
 * The two rungs are paid for in deliberately different currencies.
 *
 * **The cub costs LIFETIME canes.** A kid who spent the afternoon in the grove
 * before she ever found the shrine should not be told none of it counted; she
 * swears the oath and a cub is already there.
 *
 * **Every rung above it costs canes cut SINCE the panda last grew** — that is
 * what `fedFrom` records. Charging lifetime canes for the adult too meant a
 * player who had banked forty before joining watched her cub appear and grow
 * up in the same breath, so the cub stage — the whole point of raising the
 * thing — lasted a single frame and she never saw it. Raising an animal is a
 * job you do in front of the animal; you cannot pre-pay for it.
 *
 * @param {number}  bambooCut lifetime canes cut
 * @param {?number} fedFrom   the tally when the current panda was granted
 * @param {number}  tier      the panda's current tier, -1 for no panda
 * @returns {number} tier earned, or -1 for none yet
 */
export function tierFor(bambooCut, fedFrom = null, tier = -1) {
  if (tier < 0 || fedFrom == null) return bambooCut >= PANDA_TIERS[0].at ? 0 : -1;
  const next = PANDA_TIERS[tier + 1];
  return next && bambooCut - fedFrom >= next.after ? tier + 1 : tier;
}

/** Canes still to cut before the next growth, or 0 when fully grown. */
export function toNextTier(bambooCut, fedFrom = null, tier = -1) {
  if (tier < 0 || fedFrom == null) return Math.max(0, PANDA_TIERS[0].at - bambooCut);
  const next = PANDA_TIERS[tier + 1];
  return next ? Math.max(0, next.after - (bambooCut - fedFrom)) : 0;
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

/**
 * Everything the panda is worth in a fight, and everything the cub is worth
 * out of one. On the balance page as **Panda**.
 *
 * WHY THESE ARE ONE TABLE AND NOT TWO. The cub and the grown panda are the
 * same animal at two rungs of one ladder, and the interesting question a
 * person tuning this asks is about the whole arc: is being knocked down back
 * to a cub a punishment or a consolation? That is `hpFrac` and `lickRate`
 * read together, and splitting them across two panels would hide it.
 *
 * `dmgK` IS A MULTIPLE AND NOT A DAMAGE. Asked for as "1.2x more than a
 * regular player slash attack", and written that way so it stays true: tune
 * the standing slash on the same page and the claw follows it. The
 * multiplication happens in `Game.strikePlayers`, which is where the standing
 * slash's number lives — see `ATTACKS.claw`, which deliberately has no `dmg`
 * of its own for exactly this reason.
 */
export const PANDA = tune('PANDA', {
  /**
   * The grown panda's bar, as a fraction of its owner's OWN maximum.
   *
   * A fraction rather than a number, so a kitten wearing three Vigor orbs
   * rides a correspondingly tougher animal and the panda never becomes the
   * weak link of a build that was supposed to be about surviving. It also
   * means the overflow banked at a feast lifts the panda with her.
   */
  hpFrac: 0.30,
  /** Claw damage, as a multiple of the standing slash it replaces. */
  dmgK: 1.2,
  /**
   * How far a blow moves the panda, as a fraction of how far it would move a
   * kitten. Asked for as a third.
   *
   * IT IS APPLIED TO WHOEVER IS DRIVING. Ridden, the panda is slaved to the
   * rider every frame (see `carry`), so a velocity written onto the animal is
   * overwritten before it is ever drawn — the push has to go on the kitten or
   * it does not happen at all. What you see is the pair sliding back a third
   * as far as she would have flown alone, with the animal reeling under her
   * (`recoil`). Unridden it goes on the panda itself.
   */
  knockK: 0.33,
  /**
   * How much wider than a kitten the panda is to hit, in world units, and how
   * much taller.
   *
   * A kitten is a POINT in `strikePlayers` — the range test is against her
   * centre and nothing else. "Much bigger hit box" therefore cannot be a
   * scale factor on anything; it is a body radius that is ADDED to whatever
   * the attacker's reach already was. 2.8 against a drawn height of 5.6 is
   * about half the animal, which is what a side-on panda actually occupies.
   */
  body: 2.8,
  bodyUp: 1.6,
  /* --- and the cub ----------------------------------------------------- */
  /** She has to be under this fraction of her bar before the cub comes. */
  lickBelow: 0.30,
  /** ...and gets this fraction of her MAXIMUM back per second while it does. */
  lickRate: 0.005,
  /**
   * How long the cub has to keep station beside her before any of it counts.
   *
   * Asked for as "within radius of the player for at least 1 second", and the
   * warm-up is the half that makes it readable: without it a cub brushing past
   * a hurt kitten would tick her health up by a fifth of a point and nobody
   * would ever see why. Leaving the radius resets it to zero rather than
   * draining, because "at least a second" is a promise about one continuous
   * second.
   */
  lickWarm: 1.0,
  /** How close "beside her" is. */
  lickNear: 3.0,
});

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

    /* --- the grown panda as a fighter --------------------------------- */
    /** Its own bar. Zero until it is grown — see `resetHp` and `fighter`. */
    this.maxHp = 0;
    this.hp = 0;
    /**
     * Knocked down in a round, and a cub again until the Pandapaw shrine.
     *
     * IT IS A SEPARATE FLAG AND NOT "tier === 0", because those are two
     * different animals with the same drawing: a cub that has never grown up
     * is waiting for bamboo, and `Game._updatePanda` will hand it the adult
     * rung the moment the tally allows. A collapsed one must NOT be re-grown
     * that way — it was asked for as "stays baby panda for the rest of the
     * game until player goes back to the clan temple" — so the two states
     * have to be distinguishable and this is what distinguishes them.
     */
    this.knockedDown = false;
    /** A blow taken while ridden: the rider keeps the push (see PANDA.knockK),
     *  the animal keeps the flinch. Decays. */
    this.recoil = 0;
    this.recoilDir = 0;
    /** Hit flash, the kitten's own idiom — see `_updateHurt`. */
    this.hurtT = 0;

    /* --- the cub as a nurse ------------------------------------------- */
    /** Seconds it has kept station beside a hurt owner. PANDA.lickWarm. */
    this.lickT = 0;
    /** True on the frames it is actually healing her. Read by `main.js` for
     *  the sound, and by the drawing below for the tongue. */
    this.licking = false;
    /** True while it WANTS to — which is what pulls it in close, a beat
     *  before any healing starts. Separated so the walk and the heal cannot
     *  disagree about which one is happening. */
    this.lickWanted = false;
    this.lickPhase = 0;
    /** True for ONE frame per lick, so the noise fires on the beat rather than
     *  sixty times a second. Read and spent by `main.js` — a flag rather than a
     *  call because nothing in this file may reach the audio system. */
    this.lickSfx = false;
    this._lickBeat = -1;

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
      color: (owner?.style ?? styleFor(0)).colour,
      transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
    }));
    this.group.add(this.ring);

    this._buildClaw();
    this._buildLick();

    this.tier = -1;
    this.setTier(tier);
  }

  /**
   * The lick, and the little green motes it puts on the kitten.
   *
   * NO NEW ART, and there was never a version of this that had any. Ninth
   * non-negotiable: the cub is one drawn cell and it stays one drawn cell.
   * What says "it is licking her" is three procedural things together —
   * the animal leaning in on a fast beat, a small pink tongue flicking out of
   * its face, and green motes rising off her.
   *
   * THE MOTES ARE THE SAME GREEN AS THE OVERFLOW BAR, on purpose. That is the
   * only other place in this game where green means "health arriving", and
   * two different greens for one idea is how a nine-year-old ends up thinking
   * they are two different things.
   *
   * SPHERES RATHER THAN QUADS, because everything else here that faces the
   * camera has to be told to (`faceCamera`), and these hang off a group that
   * is aimed at the OWNER rather than at the camera. A ball looks the same
   * from every seat in a split screen and costs eight triangles.
   */
  _buildLick() {
    this.lickRig = new THREE.Group();

    // A flattened blob at mouth height, pushed out along `facing` and back.
    const tongueGeo = new THREE.SphereGeometry(0.17, 8, 6);
    tongueGeo.scale(1.0, 0.55, 0.8);
    this.tongue = new THREE.Mesh(tongueGeo, new THREE.MeshBasicMaterial({
      color: 0xff8fb0, transparent: true, opacity: 0, depthWrite: false,
      toneMapped: false,
    }));
    this.lickRig.add(this.tongue);

    this.motes = [];
    const moteGeo = new THREE.SphereGeometry(0.11, 6, 5);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(moteGeo, new THREE.MeshBasicMaterial({
        color: i % 2 ? 0x86ffbe : 0x17c964,
        transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
      }));
      /* Deterministic, not shuffled: four cubs licking four kittens in a split
         screen must not be four different random clouds, or the effect reads
         as noise rather than as one thing the game does. */
      m.userData.phase = i / 6;
      m.userData.ring = 0.34 + (i % 3) * 0.22;
      m.userData.spin = (i % 2 ? 1 : -1) * (1.1 + (i % 3) * 0.4);
      this.lickRig.add(m);
      this.motes.push(m);
    }
    this.lickRig.visible = false;
    this.group.add(this.lickRig);
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
    /* GROWING UP FILLS THE BAR AND SHRINKING EMPTIES IT, here, because this is
       the one function that knows the tier changed. A cub has no bar at all —
       `fighter` is false, nothing can hit it, and a stale 30 left lying on
       `hp` would be a number waiting to be believed by the next thing that
       reads it. */
    if (this.spec.rideable) this.resetHp();
    else { this.maxHp = 0; this.hp = 0; }
    /* The two tiers are two Billboards with two materials, so a flash left
       burning on the one being hidden would still be burning when it came
       back. */
    this.hurtT = 0;
    this.poses.forEach((b) => b.mat.color.setRGB(1, 1, 1));
    return this.spec;
  }

  get rideable() {
    return !!this.spec?.rideable;
  }

  /**
   * Is it a body in the fight — something a blade can find and hurt?
   *
   * ONLY THE GROWN ONE, AND ONLY WHILE IT IS STANDING. A cub is not a target:
   * it is the size of a house cat, it is the thing a kitten runs to when she is
   * losing, and letting a sister cut it down would make the consolation prize
   * the next thing to take away. `knockedDown` is folded in for the same
   * reason it exists — a collapsed panda IS a cub.
   */
  get fighter() {
    return this.rideable && !this.knockedDown && this.maxHp > 0;
  }

  /** How far OUTSIDE an attacker's reach a blade still finds it, and how far
   *  above or below. Zero for anything that is not a fighter, so the test in
   *  `Game.strikePlayers` needs no second question. */
  get hitRadius() { return this.fighter ? PANDA.body : 0; }
  get hitUp() { return this.fighter ? PANDA.bodyUp : 0; }

  /**
   * Fill the bar, sized off its owner's.
   *
   * A FRACTION OF HERS RATHER THAN A NUMBER OF ITS OWN — see `PANDA.hpFrac`.
   * Called on growing up and at the top of every round, which is the same deal
   * the kittens get: nothing carries a wound between rounds.
   */
  resetHp() {
    this.maxHp = Math.max(1, Math.round((this.owner?.maxHp ?? 100) * PANDA.hpFrac));
    this.hp = this.maxHp;
  }

  /**
   * Take a blow. Returns the damage actually dealt, or 0.
   *
   * IT DECIDES NOTHING ABOUT WHO MAY HIT IT. `Game.strikePlayers` has already
   * asked whether a round is live, whether these two are on the same side and
   * whether the blade reached; third non-negotiable, and an animal that asked
   * any of that again would be the second copy of the one gate. This spends a
   * number and draws the flinch.
   *
   * THE KNOCKBACK IS NOT HERE EITHER, and that is not an oversight: where the
   * push goes depends on whether anybody is sitting on it, which is a fact the
   * caller is holding and this is not. See `PANDA.knockK`.
   */
  hurt(dmg, from = null) {
    if (!this.fighter) return 0;
    const before = this.hp;
    this.hp = Math.max(0, this.hp - dmg);
    const dealt = before - this.hp;
    if (!dealt) return 0;
    this.hurtT = 0.3;
    if (from) {
      const dx = this.position.x - from.x;
      const dz = this.position.z - from.z;
      const len = Math.hypot(dx, dz);
      /* Same fallback as `Player.hurt`, for the same reason: two bodies at one
         point normalise to NaN, and a rider standing exactly where her own
         panda is drawn is not a hypothetical. */
      this.recoilDir = len < 0.001 ? this.facing : Math.atan2(dx, dz);
      this.recoil = 1;
    }
    return dealt;
  }

  /**
   * Its bar is empty: it is a cub again.
   *
   * NOT A DEATH AND NOT A REMOVAL. Fourth non-negotiable — a pet can never be
   * lost — so the worst thing that can happen to a panda in this game is that
   * it gets small. It keeps its name, it keeps following her, and it picks up
   * the one thing a cub can do that a grown panda cannot.
   *
   * WHOEVER WAS RIDING IT IS PUT DOWN, and it is done here rather than at the
   * call site because there is exactly one way this can happen and leaving a
   * kitten seated on an animal a third her size is the sort of thing that
   * survives a review. The caller still owns the noise and the words.
   */
  collapse() {
    if (!this.rideable) return false;
    const rider = this.rider;
    if (rider) { rider.pandaMount = null; this.rider = null; }
    this.knockedDown = true;
    this.setTier(0);
    this.lickT = 0;
    return true;
  }

  /**
   * Back on its feet, at the shrine, for nothing.
   *
   * NO BAMBOO IS CHARGED. Asked for in those words — "since we already
   * harvested the 20 bamboo to make it a big panda and no need to do it again"
   * — and it is the right call for a reason worth writing down: the canes were
   * cut, and charging for them twice takes away the WORK rather than the
   * animal. `pandaFedFrom` is deliberately not touched, so a kitten who has
   * been cutting since is not handed anything either.
   */
  restore() {
    if (!this.knockedDown) return false;
    this.knockedDown = false;
    this.setTier(PANDA_TIERS.length - 1);
    this.lickT = 0;
    this.licking = false;
    return true;
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
   * Measured, and then measured again along the body rather than at a single
   * point. Scanning the adult atlas for the topmost drawn pixel at each offset
   * gives the animal's upper profile, in cell fractions above its feet
   * (positive = toward the rump, which is the direction `seatOffset` moves the
   * rider):
   *
   * ```
   *   behind centre   0.20   0.14   0.10   0.06   0.00  -0.05  -0.08
   *   silhouette top  0.600  0.615  0.628  0.643  0.661  0.680  0.688
   *                          ^ she was here            the shoulders ^
   * ```
   *
   * The original 0.688 was read off the sheet as one global maximum and used
   * as though the rider sat under it. She didn't: `seatOffset` put her 0.14
   * back, in the middle of the saddle blanket, where the profile has already
   * fallen to ~0.615 and is still falling. So the number that bounded the seat
   * described a part of the animal she was nowhere near, and no value of it
   * could have framed her correctly. **Height and offset only mean anything
   * together** — that is the actual lesson here, and it is why the smoke test
   * now checks the pair.
   *
   * 0.74, with the offset pulled forward to 0.06, is set to Richard's eye on
   * the running game after 0.66 still read as sitting in the animal rather
   * than on it. The profile is the guardrail, not the source: a straddling
   * rider's feet belong somewhat above the silhouette, because her legs hang
   * down the far side of it, and how far above is a judgement about a drawing.
   * The bounds that are NOT judgement: tucking her under the saddle (0.55)
   * buried 1.1 units of a 2.9-unit kitten, her legs to the thigh, and 1.10
   * would park her three units clear of an animal only 5.6 tall.
   *
   * This LIFTS THE DRAWING ONLY. Unlike the dragon, riding a panda is ground
   * movement, so the player's own position has to stay on the ground where
   * gravity, slope snapping and collision all expect it — moving the entity
   * up here would put her physically inside the hillside on every slope.
   */
  get seatHeight() {
    return this.quad * 0.74;
  }

  /**
   * Horizontal offset from the rider to the panda's centre.
   *
   * `carry()` does `panda = rider - seat`, so this offset moves the panda
   * FORWARD of the rider — which is to say it seats her that far BACK along
   * its body. Easy to read the wrong way round, and worth stating, because
   * getting the sign wrong moves her the full 0.12 the wrong way.
   *
   * The crimson saddle blanket runs from 0.04 to 0.293 of a cell behind the
   * body centre (measured off the atlas). 0.14 sat her in the middle of it,
   * which is where a saddle says to sit and is the lowest useful place on the
   * animal: the back profile there is ~0.615 and dropping toward the rump,
   * with the shoulder hump rising in front of her. That is most of why she
   * read as sunk.
   *
   * 0.06 keeps her on the blanket — just inside its leading edge — but at the
   * front of it, where the back is climbing toward the shoulders. Going
   * further, past 0.04, would take her off the drawn saddle altogether and
   * onto bare fur, which looks like a rider who has slipped forward.
   *
   * World-space along `facing`, which is correct from every camera angle
   * because the billboard mirrors itself so the drawn head always points the
   * way the panda is facing.
   */
  seatOffset() {
    const q = this.quad;
    return {
      x: -Math.sin(this.facing) * q * 0.06,
      y: 0,
      z: -Math.cos(this.facing) * q * 0.06,
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
   * The same broadside rule, pointed at a place instead of along a velocity.
   *
   * The dead zone is much smaller than `_aim`'s because the input is an
   * OFFSET in world units rather than a speed: a cub a metre to her left is
   * decisively to her left, where a cub moving at one unit a second is barely
   * moving at all.
   */
  _aimAt(camYaw, dx, dz) {
    const rx = Math.cos(camYaw);
    const rz = -Math.sin(camYaw);
    const lateral = dx * rx + dz * rz;
    if (Math.abs(lateral) > 0.25) this.side = Math.sign(lateral);
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
    /* `carried` IS THE GRIFFIN, and it counts as being in the air for exactly
       the same reason `mount` does. Without it a panda whose owner is being
       flown to the arena walks off the rim after her and out over open water,
       where `heightAt` answers nothing and it hangs at the last height it had.
       It got away with that while nothing in the ring cared where the animal
       was; it stopped being harmless the moment the panda became a fighter. */
    if (owner.mount || owner.carried) return false;
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

    /* BEFORE THE WALK, because the walk reads `lickWanted` to decide how close
       to stand. One frame of disagreement between "it wants to lick her" and
       "it is walking in to lick her" is one frame of the cub visibly changing
       its mind, and it would happen every time she crossed the threshold. */
    this._stepLick(dt, owner);

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
    this._updateHurt(dt);
    this._drawLick(owner);

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

  /**
   * Does the cub want to lick her, is it close enough, and has it been there
   * long enough — and if all three, heal her.
   *
   * THE THREE QUESTIONS ARE SEPARATE ON PURPOSE. `lickWanted` is about HER
   * (she is hurt, she is alive, she is on the ground), the radius is about
   * WHERE the cub is, and `lickT` is about HOW LONG it has kept station. Only
   * the first pulls the animal in; only all three heal. Folding them into one
   * boolean is what would make a cub that has just arrived start healing on
   * the frame it arrives, which is the thing the warm-up exists to prevent.
   *
   * IT IS THE CUB'S JOB AND ONLY THE CUB'S. Asked for in those words. A grown
   * panda is a mount and a fighter and giving it this as well would make being
   * knocked down a strict downgrade with nothing on the other side of it.
   *
   * SHE HAS TO BE ON HER OWN FEET. Flying, carried by the griffin or knocked
   * out, there is no cub beside her to do it — and an angel healing while she
   * flies would put health on a kitten the round has already finished with.
   */
  _stepLick(dt, owner) {
    this.lickPhase += dt * 7.5;
    const want = !this.rideable && !!owner
      && !owner.ko && !owner.angel && !owner.mount && !owner.carried
      && owner.hp > 0 && owner.maxHp > 0
      && owner.hp < owner.maxHp * PANDA.lickBelow;
    this.lickWanted = want;
    this.lickSfx = false;
    if (!want) { this.lickT = 0; this.licking = false; this._lickBeat = -1; return; }

    const d = Math.hypot(owner.position.x - this.position.x,
      owner.position.z - this.position.z);
    /* OUT OF RANGE RESETS THE CLOCK RATHER THAN DRAINING IT. "Within radius of
       the player for at least 1 second" is a promise about ONE continuous
       second; a clock that merely paused would let a cub trotting in and out
       of reach accumulate it a tenth at a time. */
    if (d > PANDA.lickNear) { this.lickT = 0; this.licking = false; return; }

    this.lickT += dt;
    this.licking = this.lickT >= PANDA.lickWarm;
    if (!this.licking) { this._lickBeat = -1; return; }

    /* ONE CHIRP PER LICK. The sound has to fire on the same beat the tongue
       comes out on, and the tongue is `sin(lickPhase)` — so counting whole
       turns of that phase is the only figure that cannot drift away from the
       picture. A timer of its own would look right for about ten seconds. */
    const beat = Math.floor(this.lickPhase / (Math.PI * 2));
    if (beat !== this._lickBeat) { this._lickBeat = beat; this.lickSfx = true; }
    /* A FRACTION OF HER MAXIMUM, so a kitten wearing Vigor is healed in
       proportion rather than being handed a smaller share of a bigger bar.
       Fractional health is fine — nothing in this game prints the number, and
       every reader of it is a ratio or a comparison. */
    owner.hp = Math.min(owner.maxHp, owner.hp + owner.maxHp * PANDA.lickRate * dt);
  }

  /** The hit flash and the flinch. The flash is the kitten's own idiom — see
   *  `Player._updateVisuals`, including why it is pushed past white. */
  _updateHurt(dt) {
    if (this.hurtT > 0) {
      this.hurtT = Math.max(0, this.hurtT - dt);
      const f = this.hurtT / 0.3;
      this.sprite.mat.color.setRGB(1 + f * 1.5, 1 - f * 0.42, 1 - f * 0.5);
    } else if (this.sprite.mat.color.r !== 1) {
      this.sprite.mat.color.setRGB(1, 1, 1);
    }
    if (this.recoil <= 0) return;
    this.recoil = Math.max(0, this.recoil - dt * 3.2);
    /* THE ANIMAL REELS WHERE THE KITTEN WOULD HAVE FLOWN. Ridden, the panda's
       own velocity is overwritten by `carry` every frame, so this is the only
       way the blow shows on the animal at all — and it has to, or "the panda is
       knocked back" is a sentence with nothing on screen behind it. */
    const k = this.recoil * 0.45;
    this.group.position.x += Math.sin(this.recoilDir) * k;
    this.group.position.z += Math.cos(this.recoilDir) * k;
  }

  /** The tongue, the lean, and the motes rising off her. See `_buildLick`. */
  _drawLick(owner) {
    const on = this.licking && !!owner;
    this.lickRig.visible = on;
    if (!on) return;

    const size = this.spec.size;
    // Out and back twice a second; never negative, so it rests retracted.
    const flick = Math.max(0, Math.sin(this.lickPhase));
    const reach = size * (0.34 + flick * 0.22);
    this.tongue.position.set(
      Math.sin(this.facing) * reach,
      size * 0.58,
      Math.cos(this.facing) * reach
    );
    this.tongue.material.opacity = 0.35 + flick * 0.6;
    /* And the whole animal leans in on the same beat. Applied to the GROUP so
       the shadow comes with it: a cub whose drawing leans away from its own
       shadow reads as sliding rather than as reaching. */
    this.group.position.x += Math.sin(this.facing) * flick * 0.16;
    this.group.position.z += Math.cos(this.facing) * flick * 0.16;

    const ox = owner.position.x - this.position.x;
    const oy = owner.position.y - this.position.y;
    const oz = owner.position.z - this.position.z;
    for (const m of this.motes) {
      const { phase, ring, spin } = m.userData;
      const t = (this.lickPhase * 0.11 + phase) % 1;
      const a = phase * Math.PI * 2 + t * spin * Math.PI;
      m.position.set(ox + Math.sin(a) * ring, oy + 0.3 + t * 2.5, oz + Math.cos(a) * ring);
      // In and out again, so nothing ever pops on or off.
      m.material.opacity = Math.sin(t * Math.PI) * 0.85;
      m.scale.setScalar(0.7 + (1 - t) * 0.5);
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
    if (owner.mount || owner.carried) {
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
    /* IT COMES IN CLOSER TO LICK HER. Asked for as "the panda will try to get
       close to the player", and this is the whole of that: the cub's ordinary
       station is two units back, which is already outside the reach it needs.
       Half of `lickNear` puts it comfortably inside with room for the back-off
       term below to still hold it out of her sprite. */
    const gap = this.lickWanted
      ? Math.min(this.spec.followDist, PANDA.lickNear * 0.5)
      : this.spec.followDist;
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

    /* FACING HER WHILE IT LICKS, rather than facing wherever it last walked.
       Still broadside — the rule at the top of this file is not negotiable and
       an edge-on cub flickers — but the SIDE is chosen to put the drawn head
       toward her instead of away from her, which is the difference between a
       cub licking a kitten and a cub ignoring one. */
    if (this.lickWanted) this._aimAt(owner.camYaw ?? 0, dx, dz);
    else this._aim(owner.camYaw ?? 0);

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
