import * as THREE from 'three';
import { Billboard } from '../core/gfx.js';
import { PANDA_SPEED, PANDA_JUMP } from './panda.js';
import { aggregate, WARD, AEGIS, DIVE, CROSS, CHARGE, DODGE } from './powerorb.js';
import { ANGEL_ALPHA } from './angel.js';
import { styleFor } from '../core/palette.js';
import { tune } from '../core/tuning.js';
import { Label } from '../core/label.js';

/* ---------------------------------------------------------------------------
   A Katana Kitty and the camera that follows it.

   Two movement modes share one controller:
     ground â€” run, jump, double-jump, pounce-dash, katana slash
     flight â€” riding a storm dragon; the camera pulls way back so the world
              reads at Dragon Ball Z scale

   The camera keeps a fixed isometric yaw and pitch and only ever changes its
   distance. That's what holds the 2.5D look together: the billboard sprites
   are always seen from the angle they were drawn for.
--------------------------------------------------------------------------- */

const CAM_YAW = -Math.PI * 0.25;
const CAM_PITCH_GROUND = 0.66;
const CAM_PITCH_AIR = 0.60;

const GRAVITY = 26;
const WALK_SPEED = 10.5;
const SPRINT_SPEED = 17;
const ACCEL = 60;
const AIR_ACCEL = 26;
const JUMP_V = 11.2;
const COYOTE = 0.12;

/** A dead controller, for the frames a kitten is not in charge of herself.
 *  Shaped exactly like a real pad so nothing downstream has to check. */
const FROZEN_PAD = {
  mx: 0, my: 0, down: () => false, pressed: () => false,
};

const FLY_SPEED = 34;
const FLY_BOOST = 62;
const FLY_LIFT = 20;

/* ---------------------------------------------------------------------------
   Tournament combat.

   THE THREE ATTACKS ARE THE THREE THINGS SHE ALREADY DOES. There is no new
   button: a standing slash, a slash while sprinting, and a slash in the air.
   Two kids who have spent an afternoon knocking over barrels already know all
   three, so the tournament teaches a game rather than a control scheme — and
   the one that hits hardest is the one that costs the most to set up, which
   is the whole of the depth here and as much as this needs.

     standing   quick, short, safe
     dash       sprint into it — most knockback, and how you throw her out
     aerial     jump into it — most damage, hardest to land

   `hp` IS THE ONLY LOSS CONDITION. A ring-out hurts rather than ending the
   round (see Tournament._updateOut): two ways to lose, one of them instant,
   is two things for a nine-year-old to read on a screen where she is already
   watching her sister — and an instant one turns a two-minute round into a
   two-second one on a mistimed knockback.
--------------------------------------------------------------------------- */

/**
 * The numbers that are about being hit rather than about one attack.
 *
 * GATHERED INTO ONE TABLE SO THE TUNING PAGE CAN REACH THEM, and that is the
 * only reason they moved — each was a lone `const` a hundred lines from the
 * next, which is fine to read and impossible to balance. The individual names
 * below are kept and exported exactly as they were: `MAX_HP` is read by the
 * critters, the menagerie and the tournament, and turning four call sites into
 * `COMBAT.maxHp` would be churn in service of nothing.
 */
/**
 * The widest string the overhead callout will ever be asked to draw.
 *
 * Exported only so `world-check` can build every real prompt out of the real
 * clans and the real button glyphs and assert none of them is longer. See the
 * `live:` comment where it is used for why "longer" means "clipped".
 */
export const CALLOUT_WIDEST = '[RIGHT]  BOW BENEATH THE LONG BLADE OF RIVERCLAW';

export const COMBAT = tune('COMBAT', {
  maxHp: 100,
  /** Seconds a hit takes control away, and how long she cannot be hit again. */
  hitStun: 0.26,
  invuln: 0.55,
  /** What hitting your own partner costs her. See DAZE_TIME. */
  daze: 1.5,
  /** How much harder a hurt kitten flies, at zero health. See RAGE_MAX. */
  rage: 1.6,
  /**
   * HOW FAR ABOVE OR BELOW YOU A BLADE STILL REACHES, in metres.
   *
   * THIS WAS 4.5 AND IT WAS A CEILING NOBODY CHOSE. `strikePlayers` tests
   * `Math.hypot(dx, dz)` against the attack's reach and then asks one separate
   * question about height, and 4.5 was set generously so that a swing at
   * somebody mid-jump would not be refused on a technicality. What it actually
   * bought was a nine-metre-tall column: a kitten standing on the arena floor
   * could cut one who had double-jumped clean over her head, and the girl in
   * the air had no way to read that as anything but the game hitting her from
   * nowhere. Reported as "the katana reaches way too high up".
   *
   * HALVED, DELIBERATELY, AND NOT TUNED TO A GUESS. The ask was "at least half
   * as big", and half is the number that is defensible without a play session
   * behind it — every other answer would be a new invention. It is a knob on
   * the balance page for exactly that reason: the right value is a thing you
   * find by playing, and this is the shape that lets somebody find it.
   *
   * IT IS NOT THE SAME NUMBER AS `lift`. `lift` is how far a hit throws her UP;
   * this is how far apart you may be VERTICALLY for the hit to happen at all.
   * They were never related and the resemblance is a trap.
   */
  strikeHeight: 2.25,
});

/**
 * THE REACH EVERY OTHER REACH IS A MULTIPLE OF.
 *
 * `_reach()` returns this scaled by the clan buff and the orb stack, and
 * `Game.strikePlayers` divides by it to recover that scale before applying it
 * to the per-attack reaches in ATTACKS. So the literal `3.4` was written down
 * in three places that had to agree, and one of them was in another file.
 *
 * NOT FOLDED INTO `ATTACKS.stand.reach`, TEMPTING THOUGH IT IS. That entry is
 * a TUNABLE — somebody may set the standing swing to 3.0 on the balance page —
 * and this is the unit that tunable is expressed in. Tying them together would
 * mean tuning one attack silently rescaled every clan buff and every orb.
 */
export const BASE_REACH = 3.4;

export const MAX_HP = COMBAT.maxHp;

export const ATTACKS = tune('ATTACKS', {
  stand: { dmg: 10, knock: 9, lift: 3.5, reach: 3.4, arc: -0.25 },
  dash: { dmg: 15, knock: 19, lift: 5.0, reach: 3.9, arc: -0.1 },
  air: { dmg: 14, knock: 13, lift: 7.5, reach: 3.7, arc: -0.35 },

  /* THE THREE POWER-ORB MOVES ARE ENTRIES IN THIS TABLE AND NOT A SECOND
     SYSTEM, which is the whole reason they cannot leak out of the ring.
     `Game.strikePlayers` is still the one gate that asks whether the two of
     them are allowed to hurt each other; giving these their own damage path
     would put that question in a second place, and the copy nobody remembers
     is how a nine-year-old ends up able to power-dive her sister in the
     market square. `world-check` asserts a full-power charge does zero damage
     with the tournament off, exactly as it does for a dash.

     `arc` is the cosine floor on the forward test. The dive is -1 — it lands
     on everything under her, and a falling body has no facing. */
  tri: { dmg: 9, knock: 7, lift: 2.6, reach: 3.4, arc: -0.25 },
  dive: { dmg: DIVE.dmg, knock: DIVE.knock, lift: DIVE.lift, reach: DIVE.radius, arc: -1 },
  charge: { dmg: CHARGE.dmg, knock: CHARGE.knock, lift: CHARGE.lift, reach: CHARGE.radius, arc: -0.6 },
});

/* THE DIVE AND THE CHARGE ARE STILL DERIVED, and tuning either table works:
   `DIVE`/`CHARGE` are folded before this file is evaluated, so editing
   `DIVE.dmg` on the page moves the entry here with it. Editing
   `ATTACKS.dive.dmg` instead overrides the derivation for the strike while
   leaving the move's own number alone — which is a real distinction (the dive
   also uses `DIVE.speed`) and is spelled out on the page. */

/** Seconds a hit takes control away, and how long she cannot be hit again. */
const HIT_STUN = COMBAT.hitStun;
const INVULN = COMBAT.invuln;
/**
 * What hitting your own partner costs HER, and then you.
 *
 * NO FRIENDLY FIRE USED TO MEAN NOTHING AT ALL HAPPENED, and that is a rule
 * with no teeth: the safest thing in a tag-team round was to hold attack down
 * and swing through everybody, because the swing that hit your partner was
 * free. It also made the protection invisible — you learned it by watching your
 * attack do nothing, which reads as the attack being broken.
 *
 * A daze is the answer that costs the RIGHT person something. Her partner
 * loses a second and a half of control, which in a ring where a dash crosses
 * the whole deck is a long time; the attacker loses the swing and gets a screenful
 * of stars saying exactly whose fault it was. Spamming attacks in a 2v2 now
 * hurts your own side, which is the teamwork the league was supposed to be
 * about.
 *
 * A SECOND AND A HALF, AND IT HAS BEEN UP TWICE. The first pass was 0.5 and it
 * was not painful enough to change how anybody swings — you dazed your partner,
 * she blinked, and you both carried on mashing. A second was long enough to
 * lose a trade over and still short enough to read as a stumble rather than as
 * a mistake: the stars were on and off before the girl who caused it had looked
 * up. At 1.5 the animation is a beat you actually watch, which is the whole job
 * — the cost is meant to be legible to the person who caused it, not merely
 * suffered by the person who took it. Still well under a knockout (1.8), so it
 * can never be the thing that lost you the round.
 *
 * TWICE THE LENGTH IN LOCKOUT, so nobody can be held still forever. Dazed for
 * one beat and immune for two means a partner mashing attack can take at most a
 * third of anybody's time — painful, survivable, and clearly her fault.
 */
export const DAZE_TIME = COMBAT.daze;
/** How long she lies there after a knockout, before the round can move on. */
export const KO_TIME = 1.8;

/**
 * How much harder a hurt kitten flies.
 *
 * Smash's percent rule, borrowed on purpose: knockback grows as she loses
 * health, so a round that has been going a while starts throwing people
 * around and the ring's edge stops being decoration. Capped, and gentle at
 * the start — this is the difference between a fight that builds and a fight
 * that is the same exchange twelve times.
 */
const RAGE_MAX = COMBAT.rage;

/* ---------------------------------------------------------------------------
   The angel between rounds.

   A knocked-out kitten used to spend the gap watching a banner. She flies it
   off instead — which is the point of the feast: her sister is down on the
   deck hunting rats with the health she has left, and the two of them are
   doing different things at the same time for once.

   Slower than a dragon and much slower than running, because there is nowhere
   to be: this is a victory lap for the girl who lost, not a mode with a job.
--------------------------------------------------------------------------- */
const ANGEL_SPEED = 13;
const ANGEL_LIFT = 11;
/** Never lower than this above whatever is under her — an angel does not walk. */
const ANGEL_FLOOR = 1.6;
/** ...and never higher than this above the ring deck, or she leaves the shot. */
const ANGEL_CEIL = 34;
/** How far past the edge of the deck she may drift before she is reeled in. */
const ANGEL_ROAM = 26;

/**
 * How tall the RECEIVING drawing is, against her standing height.
 *
 * THE SAME AS THE EATING POSE, AND THAT IS A MEASUREMENT, NOT A COPY-PASTE.
 * It was guessed at 1.18 first, on the reasoning that a cat with both paws
 * stretched over her head must draw taller than a cat standing. She does not:
 * the top of the drawing is her EAR TIPS in both poses, because these are
 * chibi kittens whose ears are most of their height and whose paws come up
 * beside the head rather than above it. Measured on Frost, whose sheets are
 * the clean pair (Ember's raised paws sit level with her ears, so a band
 * across the top of that drawing catches both and cannot tell them apart):
 *
 *   frost_eat     707px tall,  423px ear span  ->  1.6714 ear-spans
 *   frost_bless   944px tall,  564px ear span  ->  1.6738 ear-spans
 *
 * A seventh of a percent apart, so the two drawings render at one number.
 * Kept as its own literal rather than aliased to `EAT_CROUCH`: they agree
 * today because one generator drew both at one scale, and a redraw of either
 * sheet is entitled to break that without silently resizing the other.
 * See the house rule about measuring anything drawn.
 */
export const BLESS_STRETCH = 0.86;

/** How tall the crouched eating drawing is, against her standing height. */
const EAT_CROUCH = 0.86;
/**
 * Where her MOUTH is while she eats, as a fraction of her standing height.
 *
 * Exported because the animal has to be drawn at it (`Critter._updatePinned`)
 * and the two numbers have to come from the same place. A meal is two sprites
 * pretending to touch: the snack sitting a foot below her chin does not read as
 * being eaten, it reads as a rat that happens to be standing there. Measured
 * off the crouch — she is hunched over, so her head is at about three quarters
 * of `EAT_CROUCH` and her mouth just under it.
 */
export const EAT_MOUTH_Y = EAT_CROUCH * 0.62;

export class Player {
  constructor(opts) {
    const {
      texture, index = 0, spawn = new THREE.Vector3(),
      name = 'Kitty', tint = 0xffffff, height = 2.5,
      cols = 4, rows = 1, mirror = true, contentScale = 1, pad = 0,
      dirSense = 1, rowSense = null, style = null,
    } = opts;

    this.index = index;
    /**
     * WHICH KITTEN SHE IS, which is deliberately NOT her slot number.
     *
     * They matched until players could choose: a third player picking Blossom
     * leaves Storm unused, so slot 2 is playing style 3 and no lookup by index
     * can be right. Everything that used to ask `styleFor(this.index)` — her
     * ring colour, her health bar, her panda's name, where she respawns — asks
     * this instead.
     *
     * It falls back to the style at her index so the many `new Player({index})`
     * calls in `tools/world-check.mjs` keep meaning what they meant.
     */
    this.style = style ?? styleFor(index);
    this.name = name;
    this.position = spawn.clone();
    this.velocity = new THREE.Vector3();
    this.facing = 0;
    this.onGround = false;
    this.coyote = 0;
    this.jumpsLeft = 2;
    /**
     * True while everything between her and the ground was done on her own
     * feet. Cleared by touching ANY mount, and restored only by standing on
     * real terrain again — not on a platform, which is the whole point: the
     * jump shards are platforms, so a dragon that drops her on the top one
     * leaves this false and the 7★ still refuses her. See LOCKS.sky.climbed.
     */
    this.footClimb = true;
    /** The storm dragon being flown, or null. Flight is a whole other mode. */
    this.mount = null;
    /** The panda being ridden, or null. Riding one is still GROUND movement —
     *  see _updateGround — so it deliberately does not go through `mount`. */
    this.pandaMount = null;
    /** This kitten's own panda, once she has raised one. */
    this.panda = null;
    /** Lifetime bamboo canes cut. Feeds the panda; see PANDA_TIERS. */
    this.bambooCut = 0;
    /** `bambooCut` at the moment the panda was last granted or grown. Growth
     *  above the cub is charged from here, not from zero — see tierFor. */
    this.pandaFedFrom = null;
    /** Ryuuseki's second seat. Deliberately NOT `mount`: everything in the
     *  game reads `mount` as "is steering a flying thing", and a gunner is
     *  aboard without steering anything. See Player._updatePassenger. */
    this.rideAlong = null;
    this.score = 0;
    this.radius = 0.75;
    this.height = height;

    this.attackTimer = 0;
    this.attackCooldown = 0;
    this.stepPhase = 0;
    this.squash = 0;

    /* --- tournament combat ---
       All of this is inert outside a live round. Nothing here is gated on the
       PLAYER, though: `hurt` is only ever called from `Game.strikePlayers`,
       which is the single place that asks whether fighting is allowed. Two
       copies of that question is how you end up able to cut your sister down
       in the middle of the town. */
    this.maxHp = MAX_HP;
    this.hp = MAX_HP;
    /** Tournament handicap on the whole bar — see setHpScale. 1 outside the
     *  ring and in every mode that is not a handicap league. */
    this.hpScale = 1;
    /** Seconds of hit-stun left — she keeps her momentum and loses her stick. */
    this.hitT = 0;
    /** Seconds of PARTNER-daze left, and the lockout after it. No damage, no
     *  control, and a ring of stars — see `daze`. */
    this.stunT = 0;
    this.stunLockT = 0;
    /** Seconds of invulnerability left. Stops a fast blade chain-locking her. */
    this.invulnT = 0;
    /** Seconds of "she is off the ground because Mr. Satan put her there".
     *  NOT invulnerability — it buys nothing in a fight and no blade reads it.
     *  It is the flag the RING-OUT rule reads, so that a gag which promises to
     *  cost nothing really costs nothing: while it is set, coming down outside
     *  the ring is a free return rather than a penalty. See `blast` and
     *  `Tournament._updateOut`. */
    this.blastT = 0;
    /** Seconds left lying knocked out. Zero means she is up. */
    this.koT = 0;
    /** True from the moment she is knocked out until the round resets her. */
    this.ko = false;
    /** Scoring, per tournament. See Tournament.score. */
    this.dmgDealt = 0;
    this.dmgTaken = 0;
    /** Drives the white hit-flash on the sprite. */
    this.flashT = 0;
    /** Which way the last hit threw her, for the recoil lean. */
    this.hitLean = 0;
    /** Seconds left of the star-found pose. See Player.holdAloft. */
    this.aloftT = 0;
    /** The star she is holding up, parented to her group for the duration. */
    this.aloft = null;

    /* --- Powerup Kotodama ---
       `powerOrbs` is the ONE piece of truth about what she is wearing: an
       array of orb ids, duplicates and all. Everything else — the buff
       numbers, the profile screen, the worn geometry, what the stall will buy
       back — is derived from it, and `setPowerOrbs` is the only way it moves.
       Anything that edits the array in place gets a kitten whose maximum
       health and whose displayed inventory disagree. */
    this.powerOrbs = [];
    /** Folded buff totals. Never null: an empty list aggregates to the
     *  identity, so every read site is `this.power.speed` with no `?? 1`. */
    this.power = aggregate([]);
    /* --- the ward, which is HELD rather than toggled ---
       `wardOn` is "her thumb is on the button and the block is live";
       `wardUsed` is how much of WARD.max this block has spent; `wardTail` is
       the fifth of a second it keeps working after she lets go, so a blow that
       lands on the release frame is still blocked. `warded` is the one thing
       anything else should ask. */
    this.wardOn = false;
    this.wardUsed = 0;
    this.wardTail = 0;
    this.wardCool = 0;
    /* --- and what being hit costs it ---
       `wardMax` is THIS BLOCK'S ceiling rather than the ability's, which is
       the whole shape of the feature: a blow halves it and leaves `wardUsed`
       alone, so the bubble keeps the time it has already spent and loses half
       of what it had left to spend. It is re-read from the orb on every
       `_popWard`, so the punishment never outlives the bubble that earned it.

       IT IS A FIELD RATHER THAN A SUBTRACTION FROM `wardUsed` because the
       flicker that warns her is a function of the ceiling. Moving the clock
       instead would have meant teaching `_updateWardMesh` a second number to
       stay in step with; moving the ceiling means the tell corrects itself.

       `wardHits` is how many blows THIS bubble has stopped, and `WARD.hits`
       is the floor under the halving — halving alone never reaches zero. */
    this.wardMax = WARD.max;
    this.wardHits = 0;
    /** Seconds left of the smash effect. Outlives the bubble on purpose. */
    this.wardBreakT = 0;
    /* --- and the overtime, which only a 守 Long Guard orb can ever reach ---

       `wardOver` is set at the DROP, and says this block was up for longer
       than the default ceiling — so the wait after it is a fifth longer and,
       when that longer wait finally ends, she gets told. It is deliberately
       not a property of the bubble: the bubble is gone by the time any of it
       matters, and the whole point of the penalty is that it is paid after.

       WITHOUT THE ORB IT IS NEVER TRUE. `over` is the default max and the
       ceiling IS the default max with no 守 on her neck, so `used > over`
       cannot happen — the cue, the spark and the longer wait are all dead
       code for a kitten who has not bought into it, which is the whole of
       how this stays out of the two-player game. */
    this.wardOver = false;
    /** Seconds left of the recharge spark. Fires once, when the wait ends. */
    this.wardReadyT = 0;
    /* --- and the latch, which is the double tap ---
       `wardHold` is "she tapped twice, so the block does not need her thumb
       any more". It changes ONE thing — whether letting go of the button ends
       the block — and deliberately nothing else: the same `WARD.max`, the same
       tail, the same wait. A latch that also bought more time would be a
       second, better ability hiding inside the first, and the profile screen
       has one number on it.

       `wardRegrab` is the window in which a SECOND tap can take back the wait
       that the FIRST tap's release just charged. Without it the gesture cannot
       work at all: two taps are two presses with a release between them, and
       that release runs `_dropWard` and starts a 1.5s cooldown a fifth of a
       second before the second tap arrives. See `_latchWard`. */
    this.wardHold = false;
    this.wardRegrab = 0;
    /* --- 瞬 Flash Step: half a second of not being there ---

       FIVE CLOCKS AND A DESTINATION, and the two that matter are `dodgeT` and
       `dodgeLockT`. `dodgeT` is the vanish: she is gone, untouchable,
       weightless and planted. `dodgeLockT` is the same length again on the
       other side of it, in which she is back, visible, hittable and STILL
       planted — that is the price of the move and it is why the two are one
       number in DODGE rather than two.

       `dodgeAim` IS AN ANGLE OR NULL, AND NULL MEANS "STAY HERE". It is the
       last live stick heading seen during the vanish; `dodgeAimed` says whether
       she ever actually pushed it more than `DODGE.lockDeg` off where it was at
       the press. Those two together are what tell a deliberate "no direction"
       apart from a thumb that never moved — see `_commitDodge`.

       `dodgeTarget` is whoever the reticle is on, `dodgeD0` the distance to
       them at the press. Both are read by `systems/dodgefx.js`, which draws
       every visible part of this and is a poller: nothing here knows it
       exists, and no way of the move ending has to remember to tell it. */
    this.dodgeT = 0;
    this.dodgeLockT = 0;
    this.dodgeCool = 0;
    this.dodgeAim = null;
    this.dodgeAim0 = null;
    this.dodgeAimed = false;
    this.dodgeTarget = null;
    this.dodgeD0 = 0;
    /** Has the teleport itself already fired this move? The commit is one
     *  event inside a running clock, and a clock crossing a threshold is only
     *  an event on the frame it crosses. */
    this.dodgePlaced = false;
    /** Where she went, and where she came from — read by the effects to put
     *  the decoy on the spot she left rather than the spot she is now. */
    this.dodgeFrom = new THREE.Vector3();
    /** Bumped every time a Flash Step starts. `systems/dodgefx.js` watches it
     *  to know a NEW one began, which a clock alone cannot say: two dodges in
     *  a row with a frame between them look identical to `dodgeT > 0`. */
    this.dodgeSeq = 0;
    /** Seconds left of a charge, and the direction it is committed to. */
    this.chargeT = 0;
    this.chargeDir = new THREE.Vector2(0, 1);
    this.chargeLeft = 0;
    /** Triple-slash sequencer: cuts still to throw and the clock to the next. */
    this.triLeft = 0;
    this.triT = 0;
    /** Seconds of wind-up left BEFORE the first cut — planted, committed,
     *  nothing thrown. See CROSS.wind. */
    this.triWindT = 0;
    /** Seconds until the cross slash's recovery is over and `crossReady`
     *  chimes. A third clock alongside `attackCooldown` and `triLockT`, for
     *  the reasons written where it counts down. */
    this.triCoolT = 0;
    /** How many of the three cuts connected with anybody, this technique.
     *  Counted per CUT and not per victim: a swing that catches two sisters is
     *  one cut landing, which is what "if 2 hits land" means to the kid who
     *  said it. Read once at the launch to pick the purr. */
    this.triHits = 0;
    /** Set by `Game.strikePlayers` when a cut captures somebody, read and
     *  cleared by the sequencer around each `_doSlash`. A boolean rather than
     *  a counter for exactly the reason above. */
    this._triLanded = false;
    /** Seconds of pause-for-effect left AFTER the last cut, before the launch.
     *  She is still planted through it — see `busy`. */
    this.triHangT = 0;
    /** Seconds of "no block" left. Runs from the moment the cross slash starts
     *  until CROSS.cool after it ends, and it is a SEPARATE clock from
     *  `attackCooldown` on purpose: that one is shared with every ordinary
     *  swing, so hanging the ward lock off it would lock the bubble out for a
     *  third of a second after every barrel she cuts. See `_popWard`. */
    this.triLockT = 0;
    /** True while falling as a power dive. */
    this.diving = false;
    /** Seconds the attack button has been held, and whether a press is still
     *  waiting to find out whether it was a tap or a hold. See CROSS.hold. */
    this.attackHeld = 0;
    this._triPend = false;
    this._triKind = 'stand';

    /* --- caught in somebody's triple slash ---
       SHE IS NOT HURT YET, WHICH IS THE WHOLE POINT. `heldBy` is the kitten
       running the technique; while it is set she is frozen, weightless,
       untouchable by anybody else, and the damage the cuts are worth is
       banking up in `heldDmg` to be paid all at once when it finishes.
       `heldT` is a WATCHDOG and not a timer anything counts on: the release is
       driven by the holder's own state (see Game._updateTripleHolds), and this
       is only here so that no way of the holder disappearing — knocked out,
       rung out, round over, dragged onto a dragon — can leave a kitten frozen
       in mid-air for the rest of the afternoon. Nothing may be stranded. */
    this.heldBy = null;
    this.heldDmg = 0;
    this.heldHits = 0;
    this.heldT = 0;
    this.heldDx = 0;
    this.heldDz = 1;

    /* --- the ring's two tournament-only states ---
       `eatT` is seconds left of a snack she is swallowing, owned by
       `Menagerie` and read here only to hold the pose. `angel` is true while
       she is dead between rounds and flying it off. Both are inert everywhere
       else in the game because nothing outside the arena ever sets them. */
    this.eatT = 0;
    /**
     * Which clans have already taken her in.
     *
     * THE CELEBRATION IS A FIRST-TIME THING. Swearing to a clan you have sworn
     * to before is a correction — you wandered into the wrong hall, or you are
     * swapping back — and stopping the game to congratulate somebody for
     * undoing a mistake is the sort of reward that teaches a child the game is
     * not paying attention. The oath itself still works every time; only the
     * two seconds of pose and camera are spent once per clan per kitten.
     * Cleared by a restart with everything else.
     */
    this.clansSworn = new Set();
    this.angel = false;
    /** Wings and a halo, built once at boot. See AngelForm. */
    this.angelForm = null;

    this.group = new THREE.Group();

    /* `height` is how tall the KITTEN should be in world units. The quad has
       to be bigger than that, because the drawn art only fills part of its
       square atlas cell â€” dividing by contentScale keeps the character the
       requested size whatever the sheet's packing turned out to be.
       Square quad: the atlas cells are square and already preserve the art's
       own proportions (see loadSpriteAtlas). */
    const quad = height / (contentScale || 1);
    this.sprite = new Billboard(texture, {
      cols,
      rows,
      width: quad,
      height: quad,
      footOffset: pad * quad,
      artFacesRight: true,
      mirror,
      dirSense,
      rowSense,
    });
    /** Animation rows in the generated sheet, in order. A single-row fallback
     *  atlas collapses them all to 0. */
    this.anim = rows >= 4
      ? { idle: 0, walk: 1, jump: 2, attack: 3 }
      : { idle: 0, walk: 0, jump: 0, attack: 0 };
    if (tint !== 0xffffff) this.sprite.mat.color.set(tint);
    this.group.add(this.sprite);

    // Blob shadow.
    const sg = new THREE.CircleGeometry(0.62, 18);
    sg.rotateX(-Math.PI / 2);
    this.shadow = new THREE.Mesh(
      sg,
      new THREE.MeshBasicMaterial({ color: 0x2a1830, transparent: true, opacity: 0.38, depthWrite: false })
    );
    this.group.add(this.shadow);

    // Katana slash arc.
    const arc = new THREE.RingGeometry(1.0, 2.0, 20, 1, -0.9, 1.8);
    arc.rotateX(-Math.PI / 2);
    this.slash = new THREE.Mesh(
      arc,
      new THREE.MeshBasicMaterial({
        color: 0xbff3ff, transparent: true, opacity: 0,
        depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      })
    );
    this.slash.position.y = 0.9;
    this.group.add(this.slash);

    // Player-colour ring so you can always find yourself on a busy screen.
    const mg = new THREE.RingGeometry(0.78, 0.95, 24);
    mg.rotateX(-Math.PI / 2);
    this.marker = new THREE.Mesh(
      mg,
      new THREE.MeshBasicMaterial({
        color: this.style.colour,
        transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false,
      })
    );
    this.marker.position.y = 0.04;
    this.group.add(this.marker);

    /* THE CLAN RING IS A SECOND RING AND NOT A RECOLOUR OF THE FIRST.
       Swearing an oath used to repaint `marker` in the clan's colour, which
       quietly spent the thing the comment above says it is for: four kittens
       who all joined Thunderpaw had four gold rings and none of them could
       find herself, and player one stopped being the orange one. Her colour is
       hers. Membership gets its own ring, inside, a little brighter — so the
       two facts are two rings and neither has to be inferred from the other. */
    const cg = new THREE.RingGeometry(0.50, 0.68, 24);
    cg.rotateX(-Math.PI / 2);
    this.clanRing = new THREE.Mesh(
      cg,
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.85,
        depthWrite: false, toneMapped: false,
      })
    );
    /* A PARKING HEIGHT ONLY. Both rings are dropped to the GROUND every
       frame by `_updateVisuals` — see the blob-shadow block at the bottom of
       it — because they are shadows of a kind and belong under her, not on
       her. Whatever is set here lasts until the first update. */
    this.clanRing.position.y = 0.05;
    this.clanRing.visible = false;
    this.group.add(this.clanRing);

    /* THE CALL TO ACTION, over her head.
       Four adults played a whole session and nobody joined a clan, because
       standing in a shrine ring with the power one button away looks exactly
       like standing anywhere else. This is the line that says otherwise, and it
       also carries the answer when she HAS sworn — what she just gained.
       `live:` BECAUSE THE TEXT MOVES. A `setText` whose string changes mints a
       new cached texture per distinct string and the cache is never evicted;
       the widest string this will ever hold is passed once so the canvas is
       sized for it and reused. See core/label.js, and the Dojo, which is the
       bug that lesson came from.
       DELIBERATELY NOT `fixedScreenSize`. It is a thing in the world above one
       cat, and a prompt that stays the same size as the camera pulls back to
       cover four islands would end up bigger than the kitten it belongs to. */
    this.callout = new Label('', {
      /* THE WIDEST STRING THIS WILL EVER SHOW, badge and all. A live label's
         canvas is sized ONCE from this and never grows, so a longer string is
         not wrapped, it is CLIPPED — and the first version of this line was
         the bare oath, which loses eight characters to the button badge in
         front of it. world-check builds every real prompt and pins it against
         this string, so adding a clan or a longer verb fails the check rather
         than quietly cutting a word off the end.

         BIGGER THAN IT WAS, AND THE REPORT IS WHY. Reported from play as "a
         little hard to read the text above the players head stating what input
         button to press to join the clan" — asked as "make the text not
         transparent so it's easier to read or make the text bigger or both?",
         and the answer is both. `height` is the world size of the quad and
         `size` is how many texture pixels are drawn into it, so raising one
         without the other only magnifies the same glyphs and makes them
         softer: 0.9 -> 1.15 and 64 -> 76 keep the same pixels-per-world-unit
         while the whole line grows a quarter. The opacity is the other half
         and it is in `update`. */
      live: CALLOUT_WIDEST,
      height: 1.15, size: 76, color: '#fff6de', stroke: '#1d1216', strokeWidth: 10,
    });
    this.callout.visible = false;
    this.group.add(this.callout);
    /** Seconds left of a message that expires on its own — the one naming the
     *  ability she has just gained. Zero means the callout is whatever the
     *  game's per-frame prompt says it is, or nothing. */
    this.calloutT = 0;

    /* --- the health bar ---
       Over her head rather than only in the corner, and that is the important
       half. In split screen each girl reads her own corner fine; what neither
       of them can read is the OTHER kitten's health, which is the number that
       decides whether you press the attack or back off. Above the target, in
       the target's own colour, is the only place that works from both halves
       of the screen at once.
       Hidden outside the tournament — a permanent health bar over a kitten
       knocking over barrels states a threat the rest of the game does not
       have. `depthTest: false` so it reads through the ring's corner posts:
       a bar you lose behind scenery is worse than no bar. */
    this.hpGroup = new THREE.Group();
    this.hpGroup.visible = false;
    /** Should she have a bar over her head at all? The tournament owns this;
     *  `_updateCombat` derives `hpGroup.visible` from it and her angel state. */
    this.barOn = false;
    const barW = 3.0;
    const barMesh = (w, color, z, opacity = 1) => {
      const g = new THREE.PlaneGeometry(w, 0.42);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity, depthTest: false, depthWrite: false,
        toneMapped: false, side: THREE.DoubleSide,
      }));
      m.renderOrder = 20 + z;
      return m;
    };
    this.hpBack = barMesh(barW + 0.22, 0x1c1016, 0, 0.85);
    this.hpFill = barMesh(barW, this.style.colour, 1);
    /* The fill shrinks from the LEFT EDGE, not from its centre. A plane
       scaled on x contracts toward its own origin, so a bar built centred
       eats itself from both ends and reads as half the damage it is showing.
       Parenting the quad to a pivot at the left end and scaling the pivot is
       the cheap fix that keeps the geometry untouched. */
    this.hpPivot = new THREE.Group();
    this.hpPivot.position.x = -barW / 2;
    this.hpFill.position.x = barW / 2;
    this.hpPivot.add(this.hpFill);
    this.hpGroup.add(this.hpBack, this.hpPivot);
    this.group.add(this.hpGroup);
    this._barW = barW;

    /* THE TEAM PENNANT — a flat coloured chevron above her head, on in team
       matches only (`Tournament.setTeamMark`).

       WHO IS ON MY SIDE was a question the game never answered. In a 2v2 you
       found out by swinging at somebody and watching nothing happen, which is
       the worst way to learn it: the rule that protects your partner is
       invisible, so the first thing it teaches you is that your attack is
       broken.

       A CHEVRON RATHER THAN A DISC, because from this game's fixed
       three-quarter camera a flat disc above a head reads as the halo the
       angel already owns, and two round things over two kittens meaning
       opposite things is worse than no marker. A downward wedge points at the
       cat it belongs to and is the one shape on screen nothing else uses.

       `depthTest: false` and a high `renderOrder`, exactly like the health bar
       under it and for the same reason — a marker you lose behind a corner
       post is worse than no marker. It is parented to `group` rather than to
       `hpGroup` so it survives the bar being hidden between rounds. */
    const pen = new THREE.Shape();
    pen.moveTo(-0.62, 0.52);
    pen.lineTo(0.62, 0.52);
    pen.lineTo(0, -0.52);
    this.teamMark = new THREE.Mesh(
      new THREE.ShapeGeometry(pen),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.96,
        depthTest: false, depthWrite: false, toneMapped: false,
        side: THREE.DoubleSide,
      })
    );
    this.teamMark.renderOrder = 24;
    this.teamMark.visible = false;
    this.group.add(this.teamMark);

    /* THE DAZE STARS — three of them, orbiting, while a partner's swing has
       her. The cartoon shorthand every kid already reads, and the same one the
       arena's stunned animals wear, so "that one cannot move" means one thing
       on this deck whether it is a rat or your sister.

       THEY ARE NOT BILLBOARDED, deliberately. A ring of stars has to go BEHIND
       her head on the far side of the orbit or it is not a ring, it is three
       stars in a row — so they keep their world orientation and get their
       depth from scale (see `_updateDaze`) rather than from facing the lens. */
    this.dazeStars = new THREE.Group();
    this.dazeStars.visible = false;
    /* SIZED FOR THE FIGHT CAMERA, NOT FOR A CLOSE-UP — the lesson the angel
       already paid for. The ring is framed from 96 units out and the first pass
       here was a 0.24-unit star, which is 8% of a kitten's height: from the
       deck it read as a speck of dust rather than as "she cannot move". */
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? 0.17 : 0.42;
      if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const starGeo = new THREE.ShapeGeometry(star);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(starGeo, new THREE.MeshBasicMaterial({
        color: 0xffd83d, transparent: true, opacity: 0.98,
        depthTest: false, depthWrite: false, toneMapped: false,
        side: THREE.DoubleSide,
      }));
      m.renderOrder = 25;
      this.dazeStars.add(m);
    }
    this.group.add(this.dazeStars);

    /* --- the ward bubble ---
       Two shells, both BackSide, both additive-ish through low opacity: from
       inside you see the far wall of the sphere, which is what makes it read
       as being INSIDE something rather than as a ball stuck to her. Built
       once and hidden, because a kitten with the orb pops this every few
       seconds and allocating a sphere per press is how you get a hitch every
       time she defends herself. */
    this.wardMesh = new THREE.Group();
    const shell = (r, c, o) => new THREE.Mesh(
      new THREE.IcosahedronGeometry(r, 2),
      new THREE.MeshBasicMaterial({
        color: c, transparent: true, opacity: o, side: THREE.BackSide,
        depthWrite: false, toneMapped: false,
      })
    );
    this.wardShell = shell(WARD.radius, 0x9fd8ff, 0.22);
    this.wardCore = shell(WARD.radius * 0.82, 0xe8f6ff, 0.10);
    this.wardMesh.add(this.wardShell, this.wardCore);
    this.wardMesh.visible = false;
    this.group.add(this.wardMesh);

    /* --- and the pieces it comes apart into ---
       BUILT ONCE AND HIDDEN, for the same reason the bubble is: this fires
       every time somebody lands a second blow on a block, which in a four-way
       round is often, and allocating geometry on the frame a kitten loses her
       shield is the worst possible frame to hitch on.

       THE DIRECTIONS ARE FIXED, NOT RANDOM. A golden-angle spiral gives
       fourteen shards spread evenly over the sphere with no RNG anywhere, so
       the smash looks the same every time — which is what makes it read as
       one thing happening rather than as noise. It also means `world-check`
       can assert the shape.

       THEY ARE THE CORE'S WHITE, NOT THE SHELL'S BLUE, AND THAT IS MEASURED.
       The first cut used the shell colour on the argument that these are
       pieces of that bubble — correct, and invisible: 0x9fd8ff at a third
       opacity over bright grass and pale sand is not there. Screenshotted,
       then changed to `wardCore`'s near-white and half again the size. Still
       the same object's palette; just the end of it that survives a
       background nobody gets to choose. */
    this.wardBurst = new THREE.Group();
    this.wardShards = [];
    const SHARDS = 14;
    const GOLDEN = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < SHARDS; i++) {
      const y = 1 - (i / (SHARDS - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const a = GOLDEN * i;
      const m = new THREE.Mesh(
        new THREE.TetrahedronGeometry(WARD.radius * 0.26),
        new THREE.MeshBasicMaterial({
          color: 0xe8f6ff, transparent: true, opacity: 0,
          depthWrite: false, toneMapped: false,
        })
      );
      m.userData.dir = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
      /* Each piece tumbles on its own axis, and the axis is its own direction
         so a shard flying up spins about up. Reused rather than re-derived
         every frame — this runs on four kittens at once. */
      m.userData.spin = 3 + (i % 5) * 0.8;
      this.wardShards.push(m);
      this.wardBurst.add(m);
    }
    this.wardBurst.visible = false;
    this.group.add(this.wardBurst);

    /* --- and the spark that says the shield is back ---
       THE SHARDS FLY OUT; THESE FLY IN, and that is the entire vocabulary of
       it. One picture for "you lost it", the reverse picture for "you have it
       again", so a kid does not have to learn a second symbol — she has to
       notice a direction, which is the thing a four-way split screen is worst
       at hiding and eyes are best at catching.

       TEN, NOT FOURTEEN, AND ON A RING RATHER THAN A SPHERE. This is the
       quieter of the two events and it is competing with a live round rather
       than announcing one; a full sphere of them read as a second smash. A
       ring around her chest converging inwards reads as gathering.

       IT IS 守'S OWN BLUE, not the bubble's. The player asked for this cue to
       exist only when the penalty is paid, so it belongs to the orb that
       created the penalty — the same colour as its dot on the shelf, its slot
       on her card and its ball over the dealer's counter, which is the one
       thread tying a thing on screen to a thing she bought. */
    this.wardSpark = new THREE.Group();
    this.wardSparks = [];
    const SPARKS = 10;
    for (let i = 0; i < SPARKS; i++) {
      const a = (i / SPARKS) * Math.PI * 2;
      const m = new THREE.Mesh(
        new THREE.TetrahedronGeometry(WARD.radius * 0.13),
        new THREE.MeshBasicMaterial({
          color: 0x8fa4ff, transparent: true, opacity: 0,
          depthWrite: false, toneMapped: false,
        })
      );
      /* Tilted off the horizontal by index so ten of them are not a flat
         hoop seen edge-on from this game's one fixed camera yaw. */
      const tilt = ((i % 3) - 1) * 0.42;
      m.userData.dir = new THREE.Vector3(
        Math.cos(a), Math.sin(tilt), Math.sin(a)
      ).normalize();
      m.userData.spin = 5 + (i % 4) * 1.1;
      this.wardSparks.push(m);
      this.wardSpark.add(m);
    }
    this.wardSpark.visible = false;
    this.group.add(this.wardSpark);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 4000);
    this.camDist = 26;
    this.camTarget = this.position.clone();
    this._offset = new THREE.Vector3();
    /* How much further back the SHAPE of her pane says to sit — 1 unless the
       split screen has handed her a rectangle narrower than a quadrant, and
       written every frame by `Game._updateSplit` (see `core/split.js`
       `paneWiden`). A Player built outside the game — every one in
       `world-check`, and the character picker's — never has it written, so it
       is 1 here and the camera behaves exactly as it did before it existed. */
    this.paneWiden = 1;

    /* When the kitten walks into a "focus" area â€” right now the Unit Circle
       Dojo â€” the camera pulls back and tilts toward top-down so the whole
       diagram is legible instead of filling the screen one label at a time. */
    this.focus = null;
    this.focusT = 0;
    this.camYaw = CAM_YAW;
  }

  /** @param {{centre: THREE.Vector3, dist: number, pitch: number}|null} f */
  setFocus(f) {
    this.focus = f;
  }

  /**
   * Give her the crouched eating drawing. One cell, front-facing, never
   * mirrored — the clan leaders' combination, and the only one that cannot
   * flip.
   *
   * A SEPARATE FILE, NOT A ROW ON HER TURNAROUND SHEET, and this is the same
   * decision the hit and KO states made for the same reason: both live kitten
   * sheets are 4-row turnarounds whose rows have to agree about which way the
   * character turns, one of the two in this project is already unusable
   * because its rows don't, and every sprite-direction check in `world-check`
   * measures real cells out of them. A single-cell file bolted alongside
   * cannot touch any of that.
   *
   * The difference from the hit and KO states is that this one really did need
   * new art. Being hit is a flash and a lean, and being knocked out is the
   * jump pose rotated — both are things the material can express. "Hunched
   * over eating with both paws" is a pose, and there is no transform of a
   * standing cat that produces one.
   *
   * @param {?object} art loaded atlas, or null — a missing sheet costs the
   *        pose and nothing else; she just keeps her attack row.
   */
  /**
   * Take a partner's swing: no damage, no control, and a ring of stars.
   *
   * IT REFUSES WHILE SHE IS ALREADY DAZED OR STILL LOCKED OUT, which is what
   * stops the whole thing becoming a way to hold your own partner still for a
   * round — and it matters more at a full second than it did at half of one.
   * One second dazed and two immune caps a sister mashing attack at a third of
   * anybody's time.
   *
   * A KO'd or angel kitten is never dazed: she has nothing to lose control of,
   * and stars over an angel is two "she is out of it" signals fighting.
   *
   * @returns {boolean} true if it landed — the caller uses it for the toast.
   */
  daze(seconds = DAZE_TIME) {
    if (this.ko || this.angel) return false;
    if (this.stunT > 0 || this.stunLockT > 0) return false;
    this.stunT = seconds;
    this.stunLockT = seconds * 2;
    return true;
  }

  /** Spin the stars, and switch them on and off with the daze. */
  _updateDaze(dt) {
    if (!this.dazeStars) return;
    const on = this.stunT > 0;
    this.dazeStars.visible = on;
    if (!on) return;
    this._dazeSpin = (this._dazeSpin ?? 0) + dt * 7.5;
    this.dazeStars.position.set(0, this.height * 1.18, 0);
    this.dazeStars.children.forEach((s, i) => {
      const a = this._dazeSpin + (i / this.dazeStars.children.length) * Math.PI * 2;
      s.position.set(Math.cos(a) * 1.05, Math.sin(a * 2) * 0.16, Math.sin(a) * 1.05);
      /* Scaled by the SINE of the orbit so the ones going away from the camera
         shrink. Three flat stars at one size read as a triangle stuck to her
         head; the same three breathing read as a ring going round it, which is
         the whole cartoon. */
      const k = 0.72 + 0.34 * (0.5 + 0.5 * Math.sin(a));
      s.scale.setScalar(k);
    });
  }

  /**
   * Wear a team colour, or `null` for none.
   *
   * ONLY THE TOURNAMENT CALLS THIS, and only in a match where somebody
   * actually shares a side — a pennant over every head in a free-for-all is
   * four labels saying nothing. See `Tournament.teamed`.
   */
  setTeamMark(colour) {
    if (!this.teamMark) return;
    this.teamMark.visible = colour != null;
    if (colour != null) this.teamMark.material.color.set(colour);
  }

  setEatArt(art) {
    if (!art?.texture) return;
    // Replacing one rather than stacking a second in the group. Nothing calls
    // this twice today; a pose drawn on top of a pose is a silent bug if
    // anything ever does.
    if (this.eatPose) this.group.remove(this.eatPose);
    /* SHORTER THAN SHE IS, because she is crouching. `contentScale` makes the
       drawn figure exactly `height` tall whatever the sheet's packing, which
       is right for every standing pose and wrong for this one: a squatting cat
       drawn to a standing cat's height is a cat that got bigger in order to
       crouch. */
    const quad = this.height * EAT_CROUCH / (art.contentScale || 1);
    this.eatPose = new Billboard(art.texture, {
      cols: 1,
      rows: 1,
      mirror: false,
      width: quad,
      height: quad,
      footOffset: (art.pad ?? 0) * quad,
    });
    this.eatPose.visible = false;
    this.group.add(this.eatPose);
  }

  /**
   * Give her the RECEIVING drawing: both paws to the sky, taking the thing
   * over her head.
   *
   * ONE POSE, TWO MOMENTS, AND THAT IS THE WHOLE DESIGN. It is worn while
   * `aloftT` is running, and `holdAloft` is called by exactly two things — a
   * dragon ball being picked up, and a clan taking her in. Both are "a thing
   * appeared above me and it is mine now", both already zoom her own camera in
   * (see `_updateCamera`), and both were being played by a cat standing in her
   * idle. Keying the pose off `aloftT` rather than off either caller means a
   * third such moment gets it for free and cannot forget to.
   *
   * SAME SHAPE AS `setEatArt` — a separate single-cell file rather than a row
   * on the turnaround, front-facing, never mirrored. The reasoning there
   * applies here word for word: the turnarounds are four-row sheets whose rows
   * have to agree about facing, one of the two is already unusable because its
   * rows do not, and every sprite-direction check in `world-check` measures
   * real cells out of them.
   *
   * @param {?object} art loaded atlas, or null — a missing sheet costs the
   *        pose and nothing else. The star, the emblem, the glow and the
   *        camera move are all code, so the moment still happens; she plays it
   *        standing up. Ninth non-negotiable, same as the voices.
   */
  setBlessArt(art) {
    if (!art?.texture) return;
    if (this.blessPose) this.group.remove(this.blessPose);
    const quad = this.height * BLESS_STRETCH / (art.contentScale || 1);
    this.blessPose = new Billboard(art.texture, {
      cols: 1,
      rows: 1,
      mirror: false,
      width: quad,
      height: quad,
      footOffset: (art.pad ?? 0) * quad,
    });
    this.blessPose.visible = false;
    this.group.add(this.blessPose);
  }

  /**
   * Give her the CONCENTRATING drawing: two fingers to her forehead, eyes shut.
   *
   * IT IS THE TELL, NOT THE TELEPORT. She wears it for the four fifths of a
   * Flash Step that happen BEFORE she goes — which is also the window she aims
   * it in — so a sister watching gets the same half-beat of warning the Cross
   * Slash's wind-up gives her, and the pose is on screen long enough to be read
   * rather than being a frame nobody sees. The moment she actually vanishes she
   * is not drawn at all; see `_updateFeedback`.
   *
   * SAME SHAPE AS `setEatArt` AND `setBlessArt` — one front-facing cell that
   * never mirrors. The argument there applies word for word, and there is a
   * second one here: this pose has no direction. She is standing perfectly
   * still with her eyes closed, so mirroring it by heading would be inventing
   * a facing for a drawing that does not have one.
   *
   * @param {?object} art loaded atlas, or null — a missing sheet costs the pose
   *        and nothing else. The vanish, the smoke, the decoy, the reticle and
   *        the teleport are all code, so the move still happens in full; she
   *        simply concentrates in her ordinary standing pose. Ninth
   *        non-negotiable, same as the voices and the trailer.
   */
  setWarpArt(art) {
    if (!art?.texture) return;
    if (this.warpPose) this.group.remove(this.warpPose);
    const quad = this.height / (art.contentScale || 1);
    this.warpPose = new Billboard(art.texture, {
      cols: 1,
      rows: 1,
      mirror: false,
      width: quad,
      height: quad,
      footOffset: (art.pad ?? 0) * quad,
    });
    this.warpPose.visible = false;
    this.group.add(this.warpPose);
  }

  /* ------------------------ Powerup Kotodama ---------------------------- */

  /**
   * Equip a list of orb ids. The ONLY way `powerOrbs` ever changes.
   *
   * HEALTH IS THE ONE STAT THAT CANNOT SIMPLY BE RECOMPUTED, because it has a
   * current value as well as a maximum. Taking a vigor orb off a kitten
   * standing at 130 of 130 has to leave her at 100 of 100 and not at 130 of
   * 100; putting one on mid-round must not be a free heal either, so the
   * CURRENT value keeps its share of the bar rather than its absolute number.
   * Trading a stack away in the middle of a fight is a real thing two sisters
   * will try, and both of the obvious implementations of it are wrong.
   *
   * @param {string[]} ids
   */
  setPowerOrbs(ids) {
    const frac = this.maxHp > 0 ? this.hp / this.maxHp : 1;
    this.powerOrbs = [...ids];
    this.power = aggregate(this.powerOrbs);
    this.maxHp = Math.round(this.power.hp * this.hpScale);
    this.hp = Math.round(this.maxHp * frac);
    return this.powerOrbs;
  }

  /**
   * The tournament handicap: a multiplier on her whole bar.
   *
   * IT MULTIPLIES INTO `maxHp` RATHER THAN REPLACING IT, so an Adamant stack
   * and a 3v1 handicap compose instead of one silently cancelling the other —
   * the same rule the clan buffs and the orbs already follow. It is a field on
   * the player rather than a number the tournament applies once, because
   * `setPowerOrbs` recomputes `maxHp` from scratch: a handicap written straight
   * into `maxHp` would evaporate the moment she traded an orb mid-match.
   *
   * Keeps the FRACTION, for the reason `setPowerOrbs` gives.
   */
  setHpScale(k = 1) {
    if (k === this.hpScale) return;
    const frac = this.maxHp > 0 ? this.hp / this.maxHp : 1;
    this.hpScale = k;
    this.maxHp = Math.round(this.power.hp * k);
    this.hp = Math.round(this.maxHp * frac);
  }

  /** True while the block is doing anything at all — held, or in its tail. */
  get warded() {
    return this.wardOn || this.wardTail > 0;
  }

  /** How much of gravity applies this frame. See WARD / CROSS / CHARGE. */
  _gravityK() {
    if (this.chargeT > 0) return 0;
    /* GONE MEANS GONE. Asked for outright — "while this ability is active,
       gravity should be turned off for the player" — and it is also the only
       thing that makes a Flash Step thrown mid-jump land where the stick
       said rather than a metre and a half below it. */
    if (this.dodgeAt) return 0;
    /* CAUGHT MID-AIR AND STAYING THERE. Weightless is not a detail of the
       hold, it IS the hold — a kitten who keeps falling while the other three
       cuts land is a kitten the other three cuts miss, which is the bug the
       whole rework exists to kill. */
    if (this.heldBy) return 0;
    if (this.warded) return WARD.gravity;
    if (this.triAt && !this.onGround) return CROSS.gravity;
    return 1;
  }

  /**
   * True while a cross slash is running, INCLUDING the third cut's own time on
   * screen and the pause-for-effect after it.
   *
   * THE WIND-UP IS IN HERE TOO, and it has to be: she is planted through it
   * (`busy` reads this), the ward is locked out from the moment she commits
   * rather than from the first cut, and in the air she gets the same quarter
   * gravity — a kitten who hangs still for the cuts but plummets through the
   * wind-up reads as two different moves. What it does NOT do is release
   * anybody: `Game._updateTripleHolds` frees on `!triAt` and nobody is caught
   * yet, so the extra clause is invisible there.
   *
   * `triT > 0` IS IN HERE FOR THE THIRD CUT. Every cut owns `CROSS.gap`, the
   * last one included, so that three cuts take `cuts * gap` rather than
   * `(cuts - 1) * gap` — otherwise the third one is over the instant it lands
   * and the technique runs a third shorter than the number says. Between that
   * cut and the hang, `triLeft` is already zero and `triHangT` is not yet set,
   * and without this clause she would get her feet back for those frames in
   * the middle of her own move.
   */
  get triAt() {
    return this.triWindT > 0 || this.triLeft > 0 || this.triT > 0 || this.triHangT > 0;
  }

  /** True while a special move owns her feet — no stick, no jump. */
  get busy() {
    return this.triAt || this.chargeT > 0;
  }

  /* ------------------------------ helpers ------------------------------- */

  /** Camera-relative basis, so "up on the stick" is always "away from you".
   *  Uses the live camera yaw, so movement stays correct while the camera
   *  swings round to square up with the dojo's axes. */
  _basis() {
    const y = this.camYaw;
    const fwd = new THREE.Vector3(-Math.sin(y), 0, -Math.cos(y)).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    return { fwd, right };
  }

  faceCamera(camera) {
    this.sprite.faceCamera(camera);
    /* The eating pose turns to the lens too. One cell and `mirror: false`, so
       `faceCamera` only ever squares the quad up — it can never pick a
       different cell and it can never flip. */
    if (this.eatPose?.visible) this.eatPose.faceCamera(camera);
    if (this.blessPose?.visible) this.blessPose.faceCamera(camera);
    if (this.warpPose?.visible) this.warpPose.faceCamera(camera);

    /* THE HEALTH BAR IS A FLAT QUAD AND HAS TO BE TURNED, like the leaders'
       speech bubbles are. It is parented to `group`, which never rotates, so
       without this it stays facing +Z for ever: from the game's fixed -PI/4
       camera every bar rendered as a thin diagonal streak above a kitten,
       which reads as a rendering fault rather than as a health bar.
       A FULL quaternion copy, not a yaw — `Billboard.faceCamera` turns on Y
       only, which is right for a character standing on the ground and wrong
       for a strip of UI. The fight camera looks down at ~0.55 radians and a
       yaw-only bar is foreshortened to about half its height there. */
    if (this.hpGroup.visible) this.hpGroup.quaternion.copy(camera.quaternion);
    // Same full-quaternion turn as the bar, and for the same reason: it is a
    // flat piece of UI, not a character standing on the ground.
    if (this.teamMark.visible) this.teamMark.quaternion.copy(camera.quaternion);
    /* Through `Label.faceCamera` rather than a quaternion copy, because a
       Label's turn also handles its own scaling rules — copying the quaternion
       straight would square it up and silently skip that. */
    if (this.callout.visible) this.callout.faceCamera(camera);
    /* The wings are turned and pushed BEHIND her here for the same reason the
       mount nudge below is done here: "behind" is a direction from a camera,
       and this function is the one thing in the entity that runs once per
       view. Same computation as the nudge with the sign reversed. */
    if (this.angel) this.angelForm?.aim(camera, this.position);
    // A mounted kitten sits inside the dragon's billboard quad, so at equal
    // depth it loses the sort and disappears. Nudging the rider toward the
    // camera puts it cleanly in front from every angle â€” and it has to happen
    // per view, because the two split-screen cameras see it from different
    // sides.
    /* `carried` is the griffin. It is deliberately NOT `mount` — everything
       in this game reads `mount` as "is steering a flying thing", and a
       passenger on a scripted taxi steers nothing — but it needs this one
       piece of mount behaviour: the outward nudge. Without it both kittens
       sit at the animal's own depth inside a quad three times their height,
       lose the sort, and vanish into the thing carrying them. Exactly the bug
       Ryuuseki had, and the same fix. */
    if (this.mount || this.pandaMount || this.rideAlong || this.carried) {
      const dx = camera.position.x - this.position.x;
      const dz = camera.position.z - this.position.z;
      const len = Math.hypot(dx, dz) || 1;
      /* Ryuuseki's quad is far bigger than a storm dragon's, so the 2.4 that
         lifts a kitten clear of one leaves her buried inside him. The nudge is
         scaled to whatever she is sitting on. */
      const seat = this.mount ?? this.rideAlong ?? this.carried;
      const out = seat ? Math.max(2.4, seat.quad * 0.10) : 2.4;
      /* ...and on top of that, a Ryuuseki rider's place ALONG his body is a
         draw offset rather than a position — so the animal under the pilot
         never lurches when his drawn heading flips, and both girls resolve
         their seat against the same heading in the same frame. See
         Ryuuseki.drawOffset. */
      const s = seat?.drawOffset
        ? seat.drawOffset(this.rideAlong ? 'gunner' : 'pilot')
        : null;
      this.sprite.position.set(
        (dx / len) * out + (s ? s.x : 0),
        0,
        (dz / len) * out + (s ? s.z : 0)
      );
    } else if (this.sprite.position.lengthSq() > 0) {
      this.sprite.position.set(0, 0, 0);
    }
  }

  /* ------------------------------- update ------------------------------- */

  update(dt, pad, world, dragons, hud) {
    /* A kitten holding a star over her head is not also sprinting off with it.
       Feeding the ground controller a dead stick freezes her without any of
       the three movement modes needing to know this pose exists.

       NOT WHILE SHE IS FLYING. A dead stick on a dragon is a dragon nobody is
       steering, thirty units up, for two seconds — and one of the seven stars
       is deliberately taken from the air, so this is a case that really
       happens rather than a hypothetical. She keeps the reins; she just gets
       the camera and the noise. */
    if (this.aloftT > 0 && !this.mount && !this.rideAlong) pad = FROZEN_PAD;

    /* A HIT TAKES THE STICK, AND A KNOCKOUT KEEPS IT. Same trick as the star
       pose: hand the ground controller a dead pad and none of the three
       movement modes has to know combat exists. It is the stick and not the
       physics — she keeps every bit of the momentum the blow gave her, which
       is the difference between being knocked across the ring and being
       switched off in mid-air. */
    /* A DAZE TAKES THE STICK THE SAME WAY A HIT DOES. Same one line, same dead
       pad, so none of the three movement modes has to learn that a partner's
       swing exists — and she keeps her momentum, which is what stops it reading
       as being switched off. */
    /* AND SO DOES BEING CAUGHT. Same one line again, for the same reason: a
       kitten held in the middle of a triple slash may not act, and no movement
       mode has to learn what a triple slash is to know that. */
    if (this.hitT > 0 || this.stunT > 0 || this.ko || this.heldBy) pad = FROZEN_PAD;

    /* NO POWER MOVE SURVIVES GETTING ON AN ANIMAL. `_stepSpecials` only runs
       inside the ground controller, so a ward popped a frame before mounting
       a dragon would keep `wardOn` true for ever — a permanently invincible
       kitten, produced by a button press that looks like getting on a dragon.
       The hold-to-block rework does NOT fix this by itself: the release that
       would end it is read in the ground controller too. Same for a charge,
       which would hold gravity at zero. */
    if ((this.mount || this.rideAlong) && (this.warded || this.busy || this.diving)) {
      this._clearSpecials();
    }

    /* THE ANGEL OUTRANKS EVERY OTHER MODE, and it is checked first rather than
       last on purpose. She has just been knocked out; `becomeAngel` drops
       whatever she was riding, and putting the test here means no later branch
       can ever see a half-cleared mount on a dead kitten. */
    if (this.angel) this._updateAngel(dt, pad, world);
    else if (this.rideAlong) this._updatePassenger(dt, pad, world, hud);
    else if (this.mount) this._updateFlight(dt, pad, world, hud);
    else this._updateGround(dt, pad, world, dragons, hud);

    this.group.position.copy(this.position);
    this.sprite.facing = this.facing;
    this.angelForm?.update(dt);
    this._updateAloft(dt);
    this._updateCombat(dt);
    this._updateFeedback(dt, world);
    this._updateCamera(dt);
  }

  /* ---------------------------- combat ---------------------------------- */

  /**
   * Take a hit. Called ONLY from `Game.strikePlayers`.
   *
   * Returns the damage actually dealt, so the attacker can be credited with
   * it — 0 when the hit was eaten by invulnerability, which the caller needs
   * to know so a whiffed swing does not score.
   *
   * @param {number} dmg
   * @param {{x:number,z:number}} from where the blow came from
   * @param {{knock:number, lift:number}} force
   */
  hurt(dmg, from, force, hud) {
    /* NOT THERE, SO NOT HIT — AND NOT EVEN BY THE RING-OUT. `force.pierce`
       gets through a ward because a bubble stops blades and not the edge of
       the world; it does not get through this, because this is not a shield
       she is standing behind, it is half a second in which she is somewhere
       else. She cannot fall out of the ring during it either: her velocity
       is pinned at zero and gravity is off. */
    if (this.dodgeAt) return 0;
    if (this.invulnT > 0 || this.ko) return 0;

    /* THE WARD STOPS BLADES, NOT THE EDGE OF THE WORLD. `force.pierce` is set
       by exactly one caller — the ring-out — and it has to be, because the
       bubble runs 3s on a 1.5s wait: without this a kitten with the orb can
       stand off the side of the arena for the whole round and take nothing,
       which deletes the ring. Blocking a blade is what she bought; blocking
       the floor is not. */
    if (this.warded && !force?.pierce) {
      /* AND IT COSTS HER THE BUBBLE. `_wardTakeHit` owns the flash, the
         halved ceiling, the tally and all three sounds — including whether
         `wardhit` is the right noise at all, which after this change it is
         not: a blow that takes half the clock off her shield may not sound
         identical to one that costs nothing. The blow still deals nothing,
         which is the part that was never in question. */
      this._wardTakeHit(hud);
      return 0;
    }

    const before = this.hp;
    this.hp = Math.max(0, this.hp - dmg);
    const dealt = before - this.hp;
    this.dmgTaken += dealt;

    /* THE PUSH IS AWAY FROM THE ATTACKER, and it needs a fallback. Two
       kittens standing in exactly the same spot give a zero-length vector,
       which normalises to NaN and teleports somebody to the origin — and two
       kittens standing in the same spot is not a hypothetical in a game where
       they are trying to hit each other. */
    let dx = this.position.x - from.x;
    let dz = this.position.z - from.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.001) { dx = Math.sin(this.facing) * -1; dz = Math.cos(this.facing) * -1; }
    else { dx /= len; dz /= len; }

    // Smash's percent rule: the more she has taken, the further she flies.
    const rage = 1 + (1 - this.hp / this.maxHp) * (RAGE_MAX - 1);
    this.velocity.x = dx * force.knock * rage;
    this.velocity.z = dz * force.knock * rage;
    this.velocity.y = Math.max(this.velocity.y, force.lift * rage);

    /* --- AND IT STOPS A CROSS SLASH DEAD ---
       THE ONE WAY OUT OF THE TECHNIQUE ONCE IT HAS STARTED. Everything else
       about the move is committed on purpose: she cannot cancel it, cannot
       block out of it and cannot walk out of it, which is what the three cuts
       are paid for. A sister who reads the wind-up and gets a blade in first
       has to be able to stop it, or the counter-play is "stand somewhere else"
       and nothing more.
       THE KITTENS SHE HAD ALREADY CAUGHT ARE NOT FORGOTTEN, and nothing here
       has to remember them: `triAt` goes false on the next line, and
       `Game._updateTripleHolds` — which frees on exactly that — pays out the
       damage banked so far and launches them for the cuts that did land. Two
       cuts in when she is interrupted means two cuts' worth of damage and a
       throw, immediately. That is the whole reason the release is driven by
       state rather than by a callback; see there.
       NO CACKLE ON A CANCEL: the purr fires from the launch branch of
       `_stepSpecials`, which this skips. */
    if (this.triAt) {
      this.triWindT = 0;
      /* No "ready!" for a recovery she never got to: the chime answers the
         technique ENDING, and this one was stopped. */
      this.triCoolT = 0;
      this.triLeft = 0;
      this.triT = 0;
      this.triHangT = 0;
      this.triHits = 0;
      this._triLanded = false;
      /* `triLockT` is left running. She does not get her bubble back early as
         a reward for being hit out of her own technique — same reasoning as
         `_clearSpecials`, which also leaves it alone. */
    }

    this.hitT = HIT_STUN;
    this.invulnT = INVULN;
    this.flashT = 0.3;
    this.squash = 1;
    this.hitLean = Math.sign(dx * Math.cos(this.camYaw) - dz * Math.sin(this.camYaw)) || 1;
    this.onGround = false;

    if (this.hp <= 0) {
      this.ko = true;
      this.koT = KO_TIME;
      /* A knockout throws her further than the blow that caused it. The last
         hit of a round has to look different from the eleven before it, and
         this is the cheapest way to say so with no new art. */
      this.velocity.x *= 1.5;
      this.velocity.z *= 1.5;
      this.velocity.y = Math.max(this.velocity.y, force.lift * 2.2);
      hud?.sfx('ko');
    } else {
      hud?.sfx('hurt');
    }
    return dealt;
  }

  /* ------------------------- the angel between rounds --------------------- */

  /**
   * Knocked out, and the round is over: sprout wings and take the sky.
   *
   * SHE IS NOT DEAD AND SHE IS NOT ALIVE — she is out of the fight and out of
   * the way, which is the job. `ko` is cleared because every KO-shaped rule in
   * the game (the dead pad, the flat-on-her-back pose, being skipped by the
   * ring-out test) is exactly wrong for a cat who is now flying; `angel` takes
   * over as the thing everything asks. What she cannot do is the part that
   * matters: no attack, no mount, no oath, no snack — see `_updateAngel`.
   */
  becomeAngel() {
    if (this.angel) return;
    /* Whatever she was on, she is off it. A knockout can land on a kitten who
       is standing on a platform or — through a ring-out — mid-air, and an
       angel still holding a mount is a mount nobody is steering. */
    if (this.pandaMount) { this.pandaMount.rider = null; this.pandaMount = null; }
    this.angel = true;
    this.ko = false;
    this.koT = 0;
    this.hitT = 0;
    this.invulnT = 0;
    this.flashT = 0;
    this.velocity.set(0, 0, 0);
    this._clearSpecials();
    this.angelForm?.show();
  }

  /** Back to earth, and back to being a cat. */
  landAngel() {
    this.angel = false;
    this.angelForm?.hide();
    this.sprite.mesh.rotation.z = 0;
  }

  /**
   * Free flight with no animal under her.
   *
   * A FOURTH MOVEMENT MODE, DELIBERATELY TINY. It could have been three more
   * conditionals inside the ground controller, and that is the version that
   * rots: gravity, the ground snap, `resolveSolids`, the mount button, the
   * oath and the katana would all have grown an `if (!angel)`, and the one
   * that got missed would be a dead kitten swearing to a clan. Nothing here
   * calls anything: she drifts, she rises, she sinks, and that is the mode.
   */
  _updateAngel(dt, pad, world) {
    const { fwd, right } = this._basis();
    const wish = new THREE.Vector3()
      .addScaledVector(right, pad.mx)
      .addScaledVector(fwd, -pad.my);
    if (wish.lengthSq() > 0.0001) {
      wish.normalize();
      this.facing = Math.atan2(wish.x, wish.z);
    }

    /* Jump climbs, interact descends — the two buttons that already mean up
       and down on a dragon. There is no new control to learn for a state that
       lasts fifteen seconds. */
    const lift = (pad.down('jump') ? 1 : 0) - (pad.down('interact') ? 1 : 0);
    const target = wish.multiplyScalar(ANGEL_SPEED * (pad.down('sprint') ? 1.6 : 1));
    const rate = 26 * dt;
    this.velocity.x += THREE.MathUtils.clamp(target.x - this.velocity.x, -rate, rate);
    this.velocity.z += THREE.MathUtils.clamp(target.z - this.velocity.z, -rate, rate);
    this.velocity.y += THREE.MathUtils.clamp(
      lift * ANGEL_LIFT - this.velocity.y, -rate, rate
    );
    this.position.addScaledVector(this.velocity, dt);

    /* SHE FLOATS RATHER THAN FALLING, and she cannot be pushed through
       anything either — there is no `resolveSolids` here, because a ghost that
       bumps into the announcer's box is a ghost. The only bound is the one
       that stops her leaving: a ceiling so she cannot vanish upward out of
       shot, and a floor so she cannot sink through the deck.
       Both are measured off the ARENA, not off the world, because the angel
       only ever exists there and a camera framing two fighters cannot follow
       somebody who has flown to another island. */
    const g = world.heightAt(this.position.x, this.position.z, this.position.y);
    const floor = (g ? g.y : this.position.y) + ANGEL_FLOOR;
    if (this.position.y < floor) {
      this.position.y = floor;
      this.velocity.y = Math.max(0, this.velocity.y);
    }
    const R = world.arenaRing;
    if (R) {
      const ceil = R.y + ANGEL_CEIL;
      if (this.position.y > ceil) {
        this.position.y = ceil;
        this.velocity.y = Math.min(0, this.velocity.y);
      }
      /* Reeled back in at the rim of the island rather than stopped at it.
         A wall you bounce off reads as a bug on a ghost; a gentle pull home
         reads as her not being allowed to leave, which is the truth. */
      const dx = this.position.x - R.x;
      const dz = this.position.z - R.z;
      const far = Math.hypot(dx, dz);
      const leash = R.half + ANGEL_ROAM;
      if (far > leash) {
        const k = Math.min(1, dt * 2.2);
        this.position.x -= (dx / far) * (far - leash) * k;
        this.position.z -= (dz / far) * (far - leash) * k;
      }
    }

    this.onGround = false;
    this.airTime = (this.airTime ?? 0) + dt;
    this.stepPhase = 0;
    this.coyote = 0;
  }

  /**
   * Put her back on her feet for a fresh round.
   *
   * Deliberately NOT a general reset — it leaves `dmgDealt`/`dmgTaken` alone,
   * because those are tournament totals and the score is computed across all
   * three rounds. Clearing them here would silently score only the last one.
   *
   * `hp` IS AN ARGUMENT, AND THAT IS THE FEAST. It used to refill to the top
   * unconditionally, which made a round a self-contained bout; now the kitten
   * who WON the round carries her damage into the next one and the kitten who
   * was knocked out comes back full. That looks backwards for about a second
   * and is the whole balance: winning costs something, the fifteen seconds
   * between rounds is where she pays it back, and a 2-0 stops being the
   * default shape of a match. See Tournament.
   */
  resetForRound(x, y, z, facing, hp = null) {
    this.landAngel();
    this.hp = hp == null ? this.maxHp : THREE.MathUtils.clamp(hp, 1, this.maxHp);
    this.hitT = 0;
    this.invulnT = 0;
    this.koT = 0;
    this.ko = false;
    this.flashT = 0;
    this.outT = 0;
    this.position.set(x, y, z);
    this.group.position.copy(this.position);
    this.velocity.set(0, 0, 0);
    this.facing = facing;
    this.camTarget.copy(this.position);
    this.onGround = true;
    this.attackTimer = 0;
    this.attackCooldown = 0;
    /* And the block's lock with them. `_clearSpecials` leaves this one running
       on purpose (see there), which is right everywhere except here: a kitten
       standing on her post waiting for the gong is not in anybody's recovery
       frames, and starting a round unable to block would be invisible and
       unexplainable. */
    this.triLockT = 0;
    /* Every power move dies with the round too. A charge that survives the
       reset carries its committed direction and its zero gravity across the
       teleport to her post and flies her straight back off the ring before
       the countdown has finished. */
    this._clearSpecials();
  }

  /** Drop every power move on the floor. Safe to call at any time. */
  _clearSpecials() {
    this.wardOn = false;
    /* THE LATCH GOES WITH THE BUBBLE IT WAS HOLDING. It is a promise about one
       particular block — "this one does not need your thumb" — and a promise
       that outlives its block is a kitten who gets on a dragon, gets off, taps
       mount once and is invincible with no second tap. */
    this.wardHold = false;
    this.wardRegrab = 0;
    this.wardUsed = 0;
    this.wardTail = 0;
    this.wardCool = 0;
    /* THE CEILING AND THE TALLY GO WITH THE BUBBLE. Left behind, a kitten
       who was smashed out of a block would pop her next one already half
       spent and one blow from breaking — a punishment outliving the thing
       it was for. `wardBreakT` is NOT cleared: the shards are a picture of
       something that happened, not a state she is in. */
    this.wardMax = WARD.max;
    this.wardHits = 0;
    /* THE OVERTIME GOES WITH THE WAIT IT WAS OWED ON. This clears `wardCool`
       two lines up, so the debt has just been forgiven — leaving the flag set
       would fire "you can block again" at some unrelated moment later, after a
       wait she never actually served. `wardReadyT` is NOT cleared, for the
       same reason as `wardBreakT`: a spark already in the air is a picture of
       something that happened, not a state she is in. */
    this.wardOver = false;
    this.chargeT = 0;
    this.chargeLeft = 0;
    this.triWindT = 0;
    this.triCoolT = 0;
    this.triLeft = 0;
    this.triT = 0;
    this.triHangT = 0;
    /* No purr on a technique that was stopped rather than finished — see the
       launch branch in `_stepSpecials`. Zeroed rather than left because the
       count is read by nothing else and a stale one would be added to the
       next technique's. */
    this.triHits = 0;
    this._triLanded = false;
    /* `triLockT` is deliberately NOT cleared here. This fires when a round
       resets or she climbs onto a dragon, and both of those already end the
       move; what it must not also do is hand the bubble straight back to a
       kitten still inside the recovery frames of one. It runs down on its own,
       and a round reset zeroes it explicitly where the rest of combat is. */
    this.diving = false;
    /* THE FLASH STEP GOES WITH THEM, WAIT AND ALL. A vanish that survived a
       round reset would put an untouchable, invisible kitten on her starting
       post for the first half second of the countdown; a lock that survived
       one would plant her there. `dodgeCool` is cleared for the same reason
       `wardCool` is — the wait was owed on a move this has just erased.
       `dodgeSeq` is NOT cleared: it only ever counts up, and the effects
       watch it to tell one Flash Step from the next. */
    this.dodgeT = 0;
    this.dodgeLockT = 0;
    this.dodgeCool = 0;
    this.dodgeTarget = null;
    this.dodgePlaced = false;
    this.dodgeAimed = false;
    this.dodgeAim = null;
    this.dodgeAim0 = null;
    this.attackHeld = 0;
    this._triPend = false;
    /* The eat pose goes with them. `Menagerie` owns the hold itself and lets
       go on its own terms, but this flag is only ever a DRAWING — leaving it
       set after a mount or a round reset holds the attack row for ever. */
    this.eatT = 0;
    this.wardMesh.visible = false;
  }

  /** Which of the three attacks this swing is. See ATTACKS. */
  attackKind(pad) {
    if (!this.onGround) return 'air';
    const moving = Math.abs(pad.mx) + Math.abs(pad.my) > 0.2;
    return (pad.down('sprint') && moving) ? 'dash' : 'stand';
  }

  _updateCombat(dt) {
    this.hitT = Math.max(0, this.hitT - dt);
    this.stunT = Math.max(0, (this.stunT ?? 0) - dt);
    this.stunLockT = Math.max(0, (this.stunLockT ?? 0) - dt);
    this._updateDaze(dt);
    this.invulnT = Math.max(0, this.invulnT - dt);
    /* THE CEILING ON IT. It is normally spent by the arena picking her up
       (`Tournament._updateOut` and `_catchFallers` both clear it), and this is
       the other end: a kitten who is never picked up — because the tournament
       ended under her, because she landed back on the deck — must not carry an
       exemption from the ring-out rule around for the rest of the round.

       NOT CLEARED WHEN SHE LANDS, which was the first version and was exactly
       wrong. `_updateOut` charges her on the frame she comes DOWN outside the
       ring, so a flag cleared by landing is a flag cleared one line before the
       rule that reads it — she flew, she landed, and she was rung out anyway,
       which is what the browser said the first time this was tried. */
    this.blastT = Math.max(0, (this.blastT ?? 0) - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    if (this.koT > 0) this.koT = Math.max(0, this.koT - dt);

    /* AN ANGEL HAS NO HEALTH BAR OVER HER HEAD. It reads zero, which is true
       and useless — the bar exists so the OTHER kitten can decide whether to
       press the attack, and there is no attack to press during a feast. It was
       also drawing straight through the halo, and a black stripe across a gold
       ring reads as a rendering fault rather than as either of them. The
       corner HUD still shows her at zero, which is where that fact belongs.

       `barOn` IS THE INTENT AND `visible` IS DERIVED FROM IT, which is the
       whole reason the flag exists. Writing `visible = visible && !angel`
       looks equivalent and is a latch: the frame she lands there is nothing
       left saying the bar was ever meant to be on, and she spends the rest of
       the tournament with no bar over her head. */
    /* THE PENNANT RIDES ABOVE THE BAR AND SURVIVES IT. It is on whenever she
       has a team, including while she is a KO'd angel between rounds — that is
       exactly when "whose side was she on" is being asked, because her partner
       is down on the deck fighting alone. Its height clears the bar's slot so
       the two never overlap when both are up. */
    if (this.teamMark.visible) {
      this.teamMark.position.set(0, this.height * (this.barOn ? 1.62 : 1.36), 0);
      this.teamMark.rotation.z = Math.sin((this.idlePhase ?? 0) * 2.2) * 0.09;
    }

    /* THE CALLOUT SITS ABOVE EVERYTHING ELSE SHE MIGHT BE WEARING — the bar,
       the pennant, the halo — because it is the only one of them that is a
       sentence, and a sentence overlapping a health bar is unreadable rather
       than merely untidy. */
    if (this.calloutT > 0) {
      this.calloutT -= dt;
      /* IT FADES OUT RATHER THAN VANISHING, and the fade is most of the answer
         to "don't let it be annoying". A line that disappears between frames
         pulls the eye to where it was; one that thins away over the last
         second is gone before she notices it going.
         THE CEILING USED TO BE 0.88, on the argument that this is text
         floating over the picture and the picture is the game. That argument
         is right about a caption and wrong about an INSTRUCTION: this line is
         the only thing telling her which button swears the oath, and a wash of
         island behind a thin glyph is what made it hard to read. Full
         strength, and the fade still does the whole of the work it was for. */
      if (this.calloutT <= 0) { this.calloutT = 0; this.callout.visible = false; }
      else this.callout.mat.opacity = Math.min(1, this.calloutT);
    } else if (this.callout.visible) {
      /* The standing prompt breathes instead. It has no timer, so it could sit
         there for a minute while she works out what a clan is — and a caption
         that is perfectly still for a minute stops being read.
         THE BREATH IS NOW ENTIRELY ABOVE 0.9 — 0.74 to 0.88 spent a third of
         every cycle at an opacity a nine-year-old was reading a hillside
         through. Keeping the movement and lifting the band is what "not
         transparent OR bigger" turned into: it still moves, and there is no
         longer a moment in the cycle where the stroke stops holding it off the
         background. */
      this.callout.mat.opacity = 0.95 + Math.sin((this.idlePhase ?? 0) * 1.8) * 0.05;
    }
    if (this.callout.visible) {
      /* LIFTED WITH THE LABEL. The quad is centred on its own origin, so
         growing it from 0.9 to 1.15 pushed its BOTTOM edge down by half the
         growth — straight at the health bar this line is deliberately clear
         of. 1.66 -> 1.72 and 1.92 -> 1.98 hand that half back at the kitten
         heights the game actually uses, which is why the two numbers move by
         the same amount rather than being re-derived. */
      this.callout.position.set(0, this.height * (this.barOn ? 1.98 : 1.72), 0);
    }

    const bar = this.hpGroup;
    bar.visible = this.barOn && !this.angel;
    if (!bar.visible) return;
    // Above her head, clear of the star she might be holding.
    bar.position.set(0, this.height * 1.32, 0);
    const k = Math.max(0, this.hp / this.maxHp);
    this.hpPivot.scale.x = k;
    /* THE BAR CHANGES COLOUR BEFORE IT RUNS OUT. Her own colour down to a
       third, then amber, then red — so "I am nearly out" is something she
       reads from the corner of her eye rather than by measuring a stripe
       against a stripe. The pulse is what carries it in peripheral vision;
       a static red bar at 12% and a static red bar at 30% look the same. */
    const low = k <= 0.34;
    this.hpFill.material.color.set(
      k > 0.34 ? this.style.colour : k > 0.18 ? 0xffc23d : 0xff3b30
    );
    this.hpFill.material.opacity = low
      ? 0.65 + Math.abs(Math.sin((this.idlePhase ?? 0) * 4.5)) * 0.35
      : 1;
  }

  /**
   * The Zelda beat: she stops where she is and holds the star over her head.
   *
   * IT IS PER PLAYER, NOT A CUTSCENE, and that is deliberate. Every other
   * scripted moment in this game (the intro, the shrines, the summoning) takes
   * the whole screen from both girls, which is right when the thing being said
   * is said to both of them. A star is found by ONE kitten, usually while her
   * sister is two islands away doing something else — stopping that sister's
   * game to show her a cutscene about something she did not do is the exact
   * interruption the split screen exists to avoid. So this rides her own
   * camera, and in split screen the other half never notices.
   *
   * @param {THREE.Texture} map the star's own face, so the thing over her head
   *        is visibly the 4★ she just picked up and not a generic orb.
   * @param {number} dur seconds. Drives the pose, the camera and the caller's
   *        own flourishes off one clock.
   * @param {object} [opts] `{ flat: true }` hangs the picture on a card facing
   *        the camera instead of painting it round the ball, and `{ tint }`
   *        colours the halo.
   */
  holdAloft(map, dur = 2.0, opts = {}) {
    this.aloftT = dur;
    this.aloftDur = dur;
    if (!this.aloft) {
      this.aloft = new THREE.Mesh(
        new THREE.SphereGeometry(0.62, 20, 14),
        new THREE.MeshBasicMaterial({ toneMapped: false })
      );
      /* Over everything. She is a transparent billboard and the star sits at
         very nearly her own depth, so without this the sort decides which of
         the two is in front on a frame-by-frame basis and the prize flickers
         inside the cat holding it. */
      this.aloft.renderOrder = 8;
      this.aloft.material.depthTest = false;
      this.group.add(this.aloft);

      this.aloftGlow = new THREE.Mesh(
        new THREE.SphereGeometry(1.5, 16, 12),
        new THREE.MeshBasicMaterial({
          color: 0xffe9a8, transparent: true, opacity: 0.3,
          side: THREE.BackSide, depthWrite: false, depthTest: false,
          toneMapped: false,
        })
      );
      this.aloftGlow.renderOrder = 7;
      this.group.add(this.aloftGlow);
    }

    /* --- a ball for a ball, a card for a picture ---
       A DRAGON BALL IS A SPHERE AND ITS STARS BELONG ON A SPHERE. A clan
       emblem is a flat drawing, and wrapping a flat drawing round a ball
       squeezes it into the silhouette at both edges and smears whatever is at
       the poles: the Thunderpaw bolt came out bent round the horizon and
       unreadable. So a caller with a picture rather than a prize asks for
       `flat`, and gets it upright.

       A `Sprite` AND NOT A BILLBOARD, because this is the one thing in the
       game that must face FOUR cameras at once. Every other billboard here is
       turned by hand in `faceCamera`, once per pane per frame, which works
       because each pane re-renders the whole scene; a Sprite is turned by
       three.js during each of those renders instead, so the card is square-on
       in all four quadrants without this class knowing how many there are. */
    const flat = !!opts.flat && !!map;
    if (flat && !this.aloftFlat) {
      this.aloftFlat = new THREE.Sprite(new THREE.SpriteMaterial({
        transparent: true, depthTest: false, depthWrite: false,
        toneMapped: false,
      }));
      this.aloftFlat.renderOrder = 8;
      this.group.add(this.aloftFlat);
    }
    /** Whichever of the two is carrying this one. `_updateAloft` moves it and
     *  does not care which it got. */
    this.aloftShown = flat ? this.aloftFlat : this.aloft;

    if (flat) {
      this.aloftFlat.material.map = map;
      this.aloftFlat.material.needsUpdate = true;
    } else {
      this.aloft.material.map = map ?? null;
      this.aloft.material.color.set(map ? 0xffffff : 0xffcf6a);
      this.aloft.material.needsUpdate = true;
    }
    if (this.aloft) this.aloft.visible = !flat;
    if (this.aloftFlat) this.aloftFlat.visible = flat;
    /* The halo takes the caller's colour when it is offered, so a clan's own
       gold or green reads even though the emblem itself is left alone. */
    this.aloftGlow.material.color.set(opts.tint ?? 0xffe9a8);
    this.aloftGlow.visible = true;
  }

  _updateAloft(dt) {
    if (this.aloftT <= 0) return;
    this.aloftT = Math.max(0, this.aloftT - dt);
    const dur = this.aloftDur || 2.0;
    const t = 1 - this.aloftT / dur;              // 0 at the start, 1 at the end

    /* Up fast, hold, then away. The rise overshoots by a hair and settles —
       a linear lift to a stop reads as an object being positioned, and the
       whole point of this pose is that she is presenting it. */
    const rise = t < 0.22 ? Math.sin((t / 0.22) * Math.PI * 0.62) * 1.08 : 1;
    const y = this.height * 0.55 + rise * (this.height * 0.85);
    const bob = Math.sin(t * 9) * 0.06 * (t > 0.22 ? 1 : 0);
    /* `aloftShown` rather than `aloft`: same rise, same bob, same halo,
       whether it is a ball or a card. The spin is the ONE thing that is not
       shared — a card spun round Y is edge-on and invisible for half of every
       turn, so it stays still and lets the bob carry the life. */
    const held = this.aloftShown || this.aloft;
    held.position.set(0, y + bob, 0);
    if (held === this.aloft) this.aloft.rotation.y += dt * 3.4;
    this.aloftGlow.position.copy(held.position);

    const fade = this.aloftT < 0.4 ? this.aloftT / 0.4 : 1;
    const pop = 1 + Math.sin(Math.min(1, t / 0.22) * Math.PI) * 0.35;
    /* A Sprite's scale IS its size in world units, where the ball's is a
       multiplier on a 0.62 radius. Matching the two by eye would drift the
       moment either changed, so the card is sized off the ball's diameter. */
    held.scale.setScalar(fade * pop * (held === this.aloft ? 1 : 2.1));
    this.aloftGlow.scale.setScalar(fade * (0.7 + Math.sin(t * 7) * 0.12));
    this.aloftGlow.material.opacity = 0.3 * fade;

    if (this.aloftT <= 0) {
      this.aloft.visible = false;
      if (this.aloftFlat) this.aloftFlat.visible = false;
      this.aloftGlow.visible = false;
    }
  }

  _updateGround(dt, pad, world, dragons, hud) {
    /* THE POWER MOVES ARE STEPPED BEFORE THE STICK IS READ, because two of
       them take the stick away. Running the sequencers afterwards means a
       charge that ended this frame still eats this frame's input, which is
       one frame of unresponsiveness per charge — small, constant, and exactly
       the kind of thing that makes a control scheme feel soft. */
    this._stepSpecials(dt, pad, world, hud);

    const { fwd, right } = this._basis();
    const wish = new THREE.Vector3()
      .addScaledVector(right, pad.mx)
      .addScaledVector(fwd, -pad.my);

    let moving = wish.lengthSq() > 0.0001;
    if (moving) {
      wish.normalize();
      /* PLANTED AND NOT POINTED IS THE OLDER RULE, AND THE FLASH STEP IS ITS
         ONE EXCEPTION. Through a Cross Slash she turns on the spot on purpose
         (see the note below); through a 瞬 she must not, because during one the
         stick is an AIM and not a heading — it is choosing which side of her
         sister she comes out on. Left in, the thumb that aimed the teleport
         would then overwrite, on the very frame it landed, the facing
         `_commitDodge` had just set to look at whoever she pivoted around: she
         would arrive behind her sister staring at the far wall, which is the
         one thing the move promises not to do. */
      if (!this.dodgePlanted) this.facing = Math.atan2(wish.x, wish.z);
    }
    /* PLANTED, BUT NOT POINTED. Her FEET are taken and her aim is not, and
       the order of these two lines is what does it: the facing above is set
       from the stick before the stick is thrown away here, so through a whole
       triple slash she turns on the spot and goes nowhere. That is deliberate
       and it is the move — three cuts you can sweep round you catch the sister
       who ran in behind you, and three cuts you could also WALK with would be
       a dash attack with no downside.
       (The comment that used to sit here said she kept the facing from the
        frame the move started. She never did; the code has always been in
        this order. It was describing a triple slash nobody could aim.) */
    if (this.busy) { wish.set(0, 0, 0); moving = false; }
    /* AND A FLASH STEP TAKES HER FEET WITHOUT TAKING HER BLADE. A separate
       test from `busy` for exactly that reason — see `dodgePlanted`. The
       facing above is set from the stick BEFORE this, which is what lets her
       aim the teleport with the same push that would have walked her. */
    if (this.dodgePlanted) { wish.set(0, 0, 0); moving = false; }

    const sprinting = pad.down('sprint') && moving;
    const buff = this.clan?.buff;
    /* Clan buff and orbs MULTIPLY. Thunderpaw's 1.35 on top of four Gale orbs
       is 2.54, which is absurd and correct: the orbs only exist after 100%
       mischief, the clans are a mid-game choice, and a kid who has done both
       has earned the silly number. Nothing downstream reads speed as bounded. */
    const speedK = (buff?.speed ?? 1) * this.power.speed;
    /* A grown panda is a mount, not a buff — riding one multiplies whatever
       you already had, so a Thunderpaw kitten on a panda is the fastest thing
       in the game. It is ground movement throughout: same gravity, same
       collisions, same slope snapping, so nothing about the world has to know
       she is on it. */
    const rideK = this.pandaMount ? PANDA_SPEED : 1;
    const target = wish.multiplyScalar(
      moving ? (sprinting ? SPRINT_SPEED : WALK_SPEED) * speedK * rideK : 0
    );
    /* Acceleration is scaled by the square root of the speed jump, not by the
       speed jump itself. At the flat ground figure a panda needs nearly two
       seconds to reach full pelt, which reads as unresponsive; at the full
       multiple it hits 10x from a standstill in a frame, which reads as a
       teleport. The middle keeps the animal's weight — it gathers itself and
       then goes. */
    const rate = (this.onGround ? ACCEL : AIR_ACCEL) * Math.sqrt(rideK) * dt;

    /* KNOCKBACK IS NOT STEERED, AND IT MUST NOT BE BRAKED EITHER.
       While she is stunned the pad is dead, so `target` is zero — and the
       ordinary controller reads a zero target as "stop", decelerating at
       ACCEL (60/s). That erases a 19-unit knockback in about a third of a
       second, which is shorter than the stun itself: every blow landed, every
       health bar moved, and nobody ever went anywhere. Being hit has to
       LOOK like being hit.
       So during the stun the movement accel is skipped entirely and the
       throw decays on its own gentle drag instead. Gravity is untouched, so
       she still falls, still lands, and still slides to a stop. */
    if (this.dodgeAt) {
      /* NOTHING MOVES HER WHILE SHE IS NOT THERE. "Velocity set to zero
         before, during, and at the end of the ability" — so it is pinned
         every frame rather than zeroed once at the press, which is the
         difference between a teleport and a teleport you can be knocked out
         of by a shove that landed a frame earlier. Gravity is off too; see
         `_gravityK`. */
      this.velocity.set(0, 0, 0);
    } else if (this.chargeT > 0) {
      /* A CHARGE IS A VELOCITY, NOT A TARGET. Feeding it through the ordinary
         accelerator makes it ramp up over a third of a second and arrive
         nowhere near CHARGE.speed before the timer runs out — the move looks
         like a brisk walk. It is set flat, every frame, in the direction it
         committed to at the press. */
      this.velocity.x = this.chargeDir.x * CHARGE.speed;
      this.velocity.z = this.chargeDir.y * CHARGE.speed;
      this.velocity.y = 0;
    } else if (this.hitT > 0 || this.ko) {
      const drag = Math.min(1, dt * (this.onGround ? 3.4 : 0.7));
      this.velocity.x -= this.velocity.x * drag;
      this.velocity.z -= this.velocity.z * drag;
    } else {
      this.velocity.x += THREE.MathUtils.clamp(target.x - this.velocity.x, -rate, rate);
      this.velocity.z += THREE.MathUtils.clamp(target.z - this.velocity.z, -rate, rate);
    }
    /* A power dive is a fall she is DRIVING. Gravity alone tops out around
       terminal for the height of a double jump and reads as an ordinary drop
       with a sound effect on it; pinning the speed is what makes it a move. */
    if (this.diving) this.velocity.y = -DIVE.speed;
    else this.velocity.y -= GRAVITY * this._gravityK() * dt;

    // --- jump / double jump ---
    if (this.onGround) this.coyote = COYOTE;
    else this.coyote -= dt;

    /* Shadowtail grants a third jump and a little more lift. `maxJumps` is
       read wherever the count is refilled, so landing restores all of them. */
    const jumpK = (buff?.jump ?? 1) * (this.pandaMount ? PANDA_JUMP : 1);
    /* Leap orbs ADD to whatever the clan gave her, so a Shadowtail kitten
       wearing three of them has six. The count is read wherever jumps are
       refilled, so landing restores all of them however many that is. */
    this.maxJumps = (buff?.jumps ?? 2) + this.power.jumps;
    if (pad.pressed('jump') && !this.busy && !this.dodgePlanted) {
      if (this.coyote > 0 || this.jumpsLeft > 1) {
        this.velocity.y = JUMP_V * jumpK;
        this.jumpsLeft = Math.max(1, this.jumpsLeft - 1);
        this.coyote = 0;
        this.squash = 1;
        hud?.sfx('jump');
      } else if (this.jumpsLeft > 0) {
        hud?.sfx('doubleJump');
        // Later jumps are a little weaker but add a forward pop.
        this.velocity.y = JUMP_V * 0.86 * jumpK;
        if (moving) {
          this.velocity.x += Math.sin(this.facing) * 4;
          this.velocity.z += Math.cos(this.facing) * 4;
        }
        this.jumpsLeft = 0;
        this.squash = 1;
      }
    }

    /* --- katana slash, or the panda's claw ---
       Riding one swaps the attack the way riding a dragon swaps it for the
       breath. The kitten still plays her attack pose, which reads as the two
       of them going for it together. */
    /* THE COOLDOWN, AND THE CHIME WHEN THE TECHNIQUE'S ONE ENDS.
       `triCoolT` IS ITS OWN CLOCK AND NOT A READ OF THE OTHER TWO, which is
       the second attempt. `attackCooldown` is charged by every ordinary swing
       as well, so it cannot say what ended; and pairing it with `triLockT`
       fails on the arithmetic — that one is decremented up in `_stepSpecials`,
       a whole block earlier in the same frame, and clamped at zero rather than
       allowed to go negative, so it reliably reaches zero one frame BEFORE
       this crosses and the chime would never once have played. A third clock
       is duller and it fires.
       It counts down here beside the cooldown it mirrors, so the two cannot
       drift, and only the CROSSING is the event — `attackCooldown` runs
       negative for ever after, so `<= 0` is not news. */
    this.attackCooldown -= dt;
    if (this.triCoolT > 0) {
      this.triCoolT -= dt;
      if (this.triCoolT <= 0) {
        this.triCoolT = 0;
        hud?.sfx('crossReady');
      }
    }
    /* --- WITH THE SANZAN ORB ON, THE SWING IS THROWN ON THE RELEASE ---
       The button has to mean two different things and it cannot know which
       until it is let go, so the press only starts a stopwatch: let go inside
       CROSS.hold and the ordinary swing goes out then, keep holding and the
       technique starts instead and the ordinary swing never happens at all.
       IT USED TO ARM AFTER THE SWING. The old shape threw the ordinary slash
       on the press and turned it into the first of three if you were still
       holding 0.22s later, which made the move a slash PLUS three cuts and
       meant it could only ever start on a target the first slash had already
       knocked away. A tap and a hold have to be ALTERNATIVES for the technique
       to have anybody left to cut.
       The cost is CROSS.hold — currently 0.25s — on every ordinary slash, and
       only for a kitten wearing the orb. THAT IS NOT A DELAY SHE PAYS, which
       is the thing to keep straight: the swing goes out WHEN SHE LETS GO, so a
       90ms tap is a 90ms slash and only a hold longer than the line costs her
       anything. The number went 0.22 -> 0.05 -> 0.25 and the middle value was
       the mistake; see CROSS.hold for why 0.05 lost. (This comment claimed
       0.05 long after the constant had moved, which is the exact failure mode
       the house rule about comments is about.)
       SHE IS STILL MOBILE FOR ALL OF IT. The planting starts at CROSS.wind,
       after the line is crossed and the technique is committed. */
    /* THE EAT GESTURE TAKES THE PRESS BACK OFF THE TECHNIQUE — and NOTHING
       ELSE DOES, which is the second half of this rule and was missing.

       The Cross Slash made ATTACK a deferred press, and both halves of eating
       — the swing that catches, and the two-second hold that keeps — die on a
       wind-up. So a kitten wearing the orb could not eat at all. That is the
       first report and this line is its fix.

       IT WAS ASKED FAR TOO WIDELY. `critterNear` used to hand her real
       `_reach()` to the whole target search, swat included, so the radius over
       which a rabbit could take the technique away GREW WITH HER BLADE: past
       twelve units for a Riverclaw kitten wearing three Long Cut orbs. She had
       earned the longest katana in the game and paid for it with her special
       move over most of the deck. Reported as "it cancels the Cross Slash
       which it shouldn't — an animal shouldn't be affected by player distance
       or override their special abilities", and that is the right rule: an
       animal a cut sweeps over now just gets stunned, like anything else.

       `critterHold` is the narrow question — she is already holding one, or
       she is standing still on top of one inside a FIXED 3.4. Both are states
       where ATTACK visibly means "keep eating", and neither moves when she
       buys an orb. Step off the animal and the technique is hers again. */
    const deferred = !!this.power.tri && !this.pandaMount
      && !hud?.critterHold?.(this);
    if (pad.pressed('attack') && this.attackCooldown <= 0 && !this.busy) {
      if (this.pandaMount) {
        this.attackTimer = 0.26;
        this.attackCooldown = 0.45;
        this._doClaw(world, hud);
      } else if (this.power.charge && sprinting) {
        /* CHARGE OUTRANKS THE HOLD, and the reason is that it is the one the
           stick already says out loud. She is sprinting in a direction with
           the trigger down; a hold-detector that stole that press would make
           the sprint attack unreachable for anyone wearing both orbs, and the
           sprint attack is the one two kids already know from the barrels. */
        this.attackTimer = 0.26;
        this._startCharge(hud);
      } else if (deferred) {
        /* The kind is read from the pad AT THE MOMENT OF THE PRESS, not
           recomputed later — and now it has to be STORED, because the swing it
           belongs to may not go out for another three frames. `onGround` and
           the stick both change in that time, so asking again at the release
           can turn the aerial she actually asked for into a standing slash on
           the frame she lands. */
        this._triPend = true;
        this._triKind = this.attackKind(pad);
        this.attackHeld = 0;
      } else {
        this.attackTimer = 0.26;
        this.attackCooldown = 0.36;
        hud?.sfx('slash');
        this._doSlash(world, hud, this.attackKind(pad));
      }
    }

    /* --- and here is where that press finds out what it was --- */
    if (this._triPend) {
      this.attackHeld += dt;
      if (!pad.down('attack')) {
        // A TAP. The swing she asked for, thrown now, with the kind she had.
        this._triPend = false;
        this.attackTimer = 0.26;
        this.attackCooldown = 0.36;
        hud?.sfx('slash');
        this._doSlash(world, hud, this._triKind);
      } else if (this.attackHeld >= CROSS.hold) {
        /* A HOLD. She has said which move she wants; now she has to stand
           still and mean it. `_startTriple` is no longer called from here —
           the wind-up runs first and calls it. */
        this._triPend = false;
        this._startWind();
      }
    }

    /* --- and letting go of the wind-up throws it all away ---
       ONLY THE WIND-UP, AND ONLY ON THE RELEASE. Nothing has been thrown and
       nobody has been caught, so there is nothing to unwind — she has simply
       spent the planted time for nothing, which is the risk that pays for how
       hard the technique hits. Once `_startTriple` has run this branch cannot
       fire: `triWindT` is zero for the rest of the move and letting go does
       nothing at all, which is the "no cancelling it" rule.
       IT IS NOT SILENT. A button that visibly stops her, then does nothing,
       reads as the game dropping the input — sixth non-negotiable. The refusal
       blip is the same one every other "no" in the game uses. */
    if (this.triWindT > 0 && !pad.down('attack')) {
      this.triWindT = 0;
      this.attackHeld = 0;
      hud?.sfx('deny');
    }
    if (this.attackTimer > 0) this.attackTimer -= dt;

    /* --- 瞬 Flash Step: sprint held, interact pressed ---
       TESTED BEFORE THE DIVE AND IT SPENDS THE PRESS. Both moves live on
       `interact`; this one additionally wants `sprint` down, so a kitten
       wearing both orbs who sprints off a ledge and presses interact would
       otherwise throw both at once. Written as a guard on the DIVE rather
       than as `!pad.down('sprint')` inside it, because `_startDodge` returns
       false immediately without the 瞬 orb — so for everybody who has not
       bought one the dive's condition is the expression it always was. */
    const dodged = pad.down('sprint') && pad.pressed('interact')
      && this._startDodge(world, pad, hud);

    /* --- the power dive ---
       Airborne only, which is what keeps `interact` free for the oath and the
       stall: neither of those is reachable off the floor, so the two meanings
       of the button can never both be live at once. */
    if (this.power.dive && !dodged && pad.pressed('interact') && !this.onGround
        && !this.diving && !this.busy && !this.dodgePlanted) {
      this._startDive(hud);
    }

    // --- move + collide ---
    const wasX = this.position.x;
    const wasZ = this.position.z;
    this.position.addScaledVector(this.velocity, dt);

    /* Her own height goes in, so a solid she is standing ON TOP of stops
       shoving her sideways — see World.resolveSolids. Without it the spire
       holding one of the seven stars throws her off its own deck. */
    const fixed = world.resolveSolids(
      this.position.x, this.position.z, this.radius, this.position.y
    );
    this.position.x = fixed.x;
    this.position.z = fixed.z;

    /* How far we actually travelled across the ground this frame â€” including
       any shove out of a tree or a wall, which can be a lot further than
       velocity alone predicts. The ground-snap tolerance below is sized from
       this, because that's what bounds how much the surface can have dropped
       underneath us. */
    const travelled = Math.hypot(this.position.x - wasX, this.position.z - wasZ);

    // Own height passed in so bridge decks and terraces are one-way: you land
    // on top of them, and walk underneath from below.
    const g = world.heightAt(this.position.x, this.position.z, this.position.y);
    const wasGrounded = this.onGround;

    /* Ground snapping. Running DOWN a slope, gravity alone leaves the kitten
       a hair above the falling surface for a frame or two every frame â€” enough
       to read as airborne, flip to the jump pose, land, and flip back. That's
       the buzzing animation on every hillside.
       So: if we were on the ground and aren't rising, and the surface is just
       below, stick to it. The tolerance scales with how far we actually moved
       this frame, because that's what bounds how far the ground can have
       fallen away under us. */
    const snap = 0.35 + travelled * 2.6;

    if (g && this.position.y <= g.y) {
      /* THE DIVE LANDS BEFORE THE VELOCITY IS ZEROED. Two lines further down
         `velocity.y = 0` and `onGround = true`, and a shockwave that asks
         afterwards how fast she was falling gets nothing. */
      if (this.diving) this._diveImpact(world, hud);
      if (!wasGrounded && this.velocity.y < -12) this.squash = 1;
      // Only a real fall gets a landing thump â€” the ground snapping below
      // means brief slope blips must not fire one every stride.
      if (!wasGrounded && (this.airTime ?? 0) > 0.14) {
        hud?.sfx('land', Math.min(1, 0.4 + Math.abs(this.velocity.y) / 22));
      }
      this.position.y = g.y;
      this.velocity.y = 0;
      this.onGround = true;
      this.jumpsLeft = this.maxJumps ?? 2;
    } else if (g && wasGrounded && this.velocity.y <= 0 && this.position.y - g.y <= snap) {
      this.position.y = g.y;
      this.velocity.y = 0;
      this.onGround = true;
      this.jumpsLeft = this.maxJumps ?? 2;
    } else {
      this.onGround = false;
      // Fell off the world â€” respawn in the plaza.
      if (this.position.y < -160) this._respawn(world);
    }

    // Time spent genuinely airborne, for the animation to threshold against.
    this.airTime = this.onGround ? 0 : (this.airTime ?? 0) + dt;

    /* `footClimb` — did she get where she is under her own power?
       Written here rather than at each of the four places a mount is taken,
       because the question is about STATE and there are more ways onto an
       animal than there are lines that say `this.mount =`: a storm dragon, a
       panda, and both of Ryuuseki's seats. Being on any of them clears it.
       Only TERRAIN restores it — `g.platform` is set when she is standing on a
       shard deck or a spire cap, and treating those as ground would hand the
       7★ back to anyone who can fly. */
    if (this.mount || this.rideAlong || this.pandaMount) this.footClimb = false;
    else if (this.onGround && g && !g.platform) this.footClimb = true;

    /* --- mount: a dragon if one is in reach, otherwise your own panda ---
       Dragons are scanned FIRST and win ties outright. A panda is always at
       your heel, so letting it match first would mean a kitten who has raised
       one could never climb onto a dragon again. */
    /* NOT WHILE A FLASH STEP OWNS HER. During one the mount button has a
       different job — held at the commit it overrides the target and pivots
       her on herself (see `_commitDodge`) — and a press that ALSO popped a
       bubble or climbed onto a dragon would be one button doing two things
       in the same half second. The lock's tail is included for the same
       reason the stick is: the move is not over until she can walk. */
    if (pad.pressed('mount') && !this.dodgePlanted) {
      if (this.pandaMount) {
        const p = this.pandaMount;
        this.pandaMount = null;
        p.rider = null;
        hud?.sfx('dismount');
        hud?.toast(`${this.name} hopped off ${this.pandaName}`, this.index);
      } else if (hud?.ryu && hud.ryu.freeSeat()
                 && this.position.distanceTo(hud.ryu.position) < hud.ryuMountRadius) {
        /* Ryuuseki wins the mount button outright when he is in reach and has
           a seat free. He is one summoned animal parked over the town, and a
           storm dragon perched nearby stealing the button would be baffling —
           there are seven of those and one of him. */
        const R = hud.ryu;
        const seat = R.freeSeat();
        this.velocity.set(0, 0, 0);
        if (seat === 'pilot') {
          R.pilot = this;
          this.mount = R;
          this.flySide = 1;
        } else {
          R.gunner = this;
          this.rideAlong = R;
        }
        hud.sfx('mount');
        hud.onRyuMount?.(this, seat);
      } else {
        let best = null;
        let bestD = Infinity;
        for (const d of dragons) {
          if (d.mounted) continue;
          const dist = this.position.distanceTo(d.position);
          if (dist < d.mountRadius && dist < bestD) { best = d; bestD = dist; }
        }
        if (best) {
          this.mount = best;
          best.rider = this;
          best.state = 'ridden';
          best.facing = this.facing;
          this.velocity.set(0, 0, 0);
          hud?.sfx('mount');
          hud?.toast(`${this.name} is riding ${best.name}!`, this.index);
        } else if (this.panda?.rideable && !this.panda.mounted
                   && this.position.distanceTo(this.panda.position) < this.panda.mountRadius) {
          this.pandaMount = this.panda;
          this.panda.rider = this;
          this.velocity.set(0, 0, 0);
          hud?.sfx('mount');
          hud?.toast(`${this.name} climbed onto ${this.pandaName}!`, this.index);
        } else {
          /* NOTHING TO CLIMB ON — so this is the ward. The animal wins the
             button outright and always will: a kitten standing beside a storm
             dragon who presses mount and gets a bubble reads as the game
             refusing to let her fly, and she has no way to tell that the orb
             she is wearing is the reason. It falls through to here, which is
             nearly always, because a dragon is a place you walk to.

             AND A SECOND TAP LATCHES IT. The double tap is read HERE, inside
             the same branch, rather than earlier beside the mount tests — for
             the reason the paragraph above gives. A kitten double-tapping her
             way onto a dragon must get the dragon twice (on, then off), not a
             bubble; asking the question after every animal has already
             declined is what makes that automatic instead of a special case
             somebody has to remember.

             THE LATCH IS TRIED FIRST AND FALLS BACK. `_latchWard` refuses when
             there is nothing to latch — no orb, or a bubble that ended for a
             reason other than her letting go of it — and then this is simply
             an ordinary press and pops an ordinary held block. So a double tap
             on a spent Ward behaves exactly as two single taps would. */
          /* `?.` BECAUSE A PAD WITHOUT THE METHOD IS A PAD, NOT A CRASH.
             Every real device arrives through `PadState`, which always has it
             — but this function is also driven by hand-built stubs in
             `world-check` and the smoke test, and the house rule is that a
             missing field degrades rather than vanishes. Without the latch,
             a double tap is two ordinary taps, which is what the game did
             before this existed. */
          if (!(pad.doubled?.('mount') && this._latchWard(hud))) this._popWard(hud);
        }
      }
    }

    // --- swear to a clan ---
    if (pad.pressed('interact')) {
      const hall = world.clanHallNear(this.position.x, this.position.z);
      if (hall && this.clan?.id !== hall.clan.id) {
        /* You cannot swear to somebody you have not met. The leader's shrine
           scene is the introduction, and it fires on its own after two seconds
           of standing here — so this branch is only reachable by pressing
           interact within that window, which is a very small door. Saying so
           out loud matters more than blocking silently: an interact button
           that does nothing is indistinguishable from a broken one. */
        if (hud?.leaderFor && !hud.leaderFor(hall.clan)?.met) {
          hud?.toast?.('Wait — she has something to say first…', this.index);
        } else {
          this.clan = hall.clan;
          /* HER OWN RING KEEPS HER OWN COLOUR — see `clanRing` in the
             constructor for what this used to do and why it was wrong. */
          /* Colour only. Whether it is SHOWN is derived from `this.clan` in
             `_updateVisuals`, so there is one owner of that answer and a
             kitten who leaves a clan, gets on a dragon or is restarted cannot
             be left wearing a ring nobody switched off. */
          this.clanRing.material.color.set(hall.clan.color);
          hud?.sfx('clan');
          hud?.onJoinClan?.(this, hall.clan);
        }
      }
    }

    // Footstep bob.
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.onGround && speed > 0.6) this.stepPhase += dt * (5 + speed * 0.55);
    else this.stepPhase *= 1 - Math.min(1, dt * 6);

    /* Hang the panda off the kitten once her position is final, so the SEAT
       lands where the player is. Solved the other way round — panda first,
       rider offset from it — the player's own position lags the thing she is
       steering, and the camera follows the player. Same reasoning as the
       dragon's seat in _updateFlight. */
    if (this.pandaMount) this.pandaMount.carry(this);
  }

  /**
   * Put a line over her head, or take it away.
   *
   * TWO CALLERS AND TWO CONTRACTS, which is what `secs` distinguishes. The
   * standing prompt ("you may swear here") is re-asserted every frame with no
   * `secs` and vanishes the moment it stops being true, because a call to
   * action that outlives the thing it is calling for is a lie. The reward line
   * ("you gained longer reach") is set ONCE with a timer and must survive her
   * walking out of the ring — she almost certainly will, immediately, and the
   * one thing she must not miss is what she just got.
   *
   * A TIMED MESSAGE OUTRANKS THE PROMPT. She has just sworn, so the prompt is
   * about to go false anyway; and in the frames before it does, "press RIGHT to
   * swear" over the head of somebody who has already sworn is nonsense.
   *
   * @param {string|null} text  null or '' hides it
   * @param {number} secs  0 = hold until told otherwise
   */
  setCallout(text, secs = 0) {
    if (secs <= 0 && this.calloutT > 0) return;
    if (!text) {
      if (secs <= 0) { this.callout.visible = false; this.calloutT = 0; }
      return;
    }
    this.callout.setText(text);
    this.callout.visible = true;
    this.calloutT = secs;
  }

  /** Each kitten's panda has its own name, so the girls aren't both
   *  shouting about "the panda". */
  get pandaName() {
    return this.style.panda;
  }

  /* ------------------------- the power moves ---------------------------- */

  /**
   * Step every power-move clock. Runs before the stick is read.
   *
   * ONE FUNCTION FOR ALL FOUR, and the ordering inside it is the contract:
   * the ward is stepped first because it is the only one that can be up at
   * the same time as another, and the charge last because ending it has to
   * leave a velocity the ordinary controller can take back over.
   */
  _stepSpecials(dt, pad, world, hud) {
    /* FIRST, because everything below it can be cut short by a Flash Step
       landing this frame and nothing below it may start one. It is also the
       only sequencer here that MOVES her, so running it after the ward's
       clocks keeps "where is she" and "what is she wearing" in one order. */
    this._stepDodge(dt, pad, world, hud);
    /* --- ward: HELD, capped, with a short tail and a wait that starts on the
       RELEASE ---
       Three ways out and they are not the same event. Letting go is the
       ordinary one. Running out the two seconds is the punished one, and it
       has to drop her block even though her thumb is still down — otherwise
       "2 seconds max" is a suggestion. Losing the orb mid-block is the third,
       and it happens: her sister can trade the Ward orb away from her while
       the bubble is up. */
    this.wardRegrab = Math.max(0, this.wardRegrab - dt);
    if (this.wardOn) {
      this.wardUsed += dt;
      const spent = this.wardUsed >= this._wardCeiling();
      /* THE ORDER OF THESE TWO IS THE WHOLE LATCH. Running out and losing the
         orb end a latched block exactly as they end a held one — `wardHold`
         buys her the BUTTON back, not the clock — so they are tested first and
         unconditionally. Only the release is skipped while she is latched. */
      if (spent || !this.power.ward) this._dropWard(hud, 'spent');
      else if (!this.wardHold && !pad.down('mount')) this._dropWard(hud, 'release');
    } else {
      /* THE TAIL AND THE WAIT RUN TOGETHER, and that is what makes the wait
         mean what the profile screen says. The tail is 0.2s of grace inside a
         1.5s cooldown that started when she let go — not 0.2 and then 1.5, or
         the gap she feels is longer than the number she was shown. */
      this.wardTail = Math.max(0, this.wardTail - dt);
      const waiting = this.wardCool > 0;
      this.wardCool = Math.max(0, this.wardCool - dt);
      /* THE ONE FRAME THE WAIT ENDS, AND ONLY AFTER A LONG ONE.

         Asked for exactly this way: the sound and the spark fire only when the
         block ran past the default maximum and therefore cost her a longer
         wait. Fired on every recharge instead, this would go off several times
         a round for every kitten wearing a Ward and become the sound of
         nothing in particular — a cue that answers a question nobody asked is
         noise, and this one answers "why is it still not back yet?".

         ON THE EDGE, NOT ON THE STATE. `wardCool === 0` is true for every
         frame she is not blocking, so the test needs the frame it BECAME
         zero — hence `waiting`. Without it this fires once per frame for the
         rest of her life. */
      if (waiting && this.wardCool === 0 && this.wardOver) {
        this.wardOver = false;
        this.wardReadyT = AEGIS.ready;
        this.wardSpark.visible = true;
        hud?.sfx?.('wardready');
      }
    }
    this.wardFlash = Math.max(0, (this.wardFlash ?? 0) - dt);

    /* --- triple slash: three cuts, then a beat, then everything goes ---
       THE HANG IS NOT DEAD TIME. It is the moment of nothing that makes the
       launch land — Smash's charged bat, the same trick every time. `busy`
       stays true through it so she is still planted, and the kittens the cuts
       caught are still frozen; `Game._updateTripleHolds` watches `triAt` go
       false and throws them all at once.
       THE RELEASE IS NOT CALLED FROM HERE, and that is on purpose. If this
       function had to hand the held kittens back, then every other way this
       move can end — a knockout mid-technique, a ring-out, the round finishing
       between two cuts, `_clearSpecials` firing because she got on a dragon —
       would be a separate path that has to remember to do the same thing, and
       one of them would not. The game watches the state instead. */
    if (this.triWindT > 0) {
      /* THE WIND-UP. Planted and silent — `busy` is already true through this,
         so the stick and the jump are gone, and the attack pose below holds
         her blade back. The only ways out are letting go (handled in the
         controller, above) and being hit (`hurt`). */
      this.triWindT -= dt;
      if (this.triWindT <= 0) {
        this.triWindT = 0;
        this._startTriple(hud);
      }
    } else if (this.triLeft > 0) {
      this.triT -= dt;
      if (this.triT <= 0) {
        this.triLeft--;
        this.attackTimer = 0.2;
        hud?.sfx('slash');
        /* CLEARED BEFORE AND READ AFTER, and `_doSlash` reaching the other
           kittens synchronously is what makes that work — it calls
           `Game.strikePlayers` inline, which sets the flag on a capture. One
           increment per cut however many sisters it caught. */
        this._triLanded = false;
        this._doSlash(world, hud, 'tri');
        if (this._triLanded) this.triHits++;
        this.triT = CROSS.gap;
      }
    } else if (this.triT > 0) {
      /* THE THIRD CUT'S OWN TIME ON SCREEN. Starting the hang the instant the
         last cut lands gives that cut none of the `gap` the other two got, so
         "three cuts at 0.3 each" would really be two at 0.3 and one at nothing
         — and the whole technique would come in a third under the second it is
         supposed to take. */
      this.triT -= dt;
      if (this.triT <= 0) { this.triT = 0; this.triHangT = CROSS.hang; }
    } else if (this.triHangT > 0) {
      this.triHangT -= dt;
      /* The cooldown is charged HERE and not when the last cut lands, so the
         half second she cannot attack for starts after the launch rather than
         overlapping the pause that precedes it. Otherwise the gap she feels is
         a quarter of a second short of the number, and the move ends with her
         already swinging again. */
      if (this.triHangT <= 0) {
        this.attackCooldown = CROSS.cool;
        this.triCoolT = CROSS.cool;
        /* THE VERDICT, OUT LOUD. Four rungs of one kitten's cackle, graded by
           how many of the three cuts connected: nothing lands and you get a
           squeak, all three and you get the demon from the trailer. See
           SAMPLES in core/audio.js, and kitten-cackle.mjs for where they come
           from.
           HERE AND NOWHERE ELSE, because this is the only branch that means
           the technique FINISHED. The zero-hit case has no victim, so it could
           not live in `Game._updateTripleHolds` — that loop iterates the
           kittens who were caught, and on a whiff there are none. And every
           way the move can be stopped early — a hit, a knockout, a ring-out,
           `_clearSpecials` — skips this line without having to know it exists,
           which is the rule that a cancelled technique makes no funny noise.
           `triHits` is capped by the sequencer at three cuts, but clamped
           anyway: a fourth cut appearing is exactly the kind of bug that would
           otherwise surface as `sample('cross4')` playing silence. */
        hud?.sample?.(`cross${Math.min(CROSS.cuts, this.triHits)}`);
        this.triHits = 0;
      }
    }
    /* THE BLOCK IS LOCKED OUT FOR THE WHOLE MOVE AND THE RECOVERY AFTER IT.
       Topped up every frame the technique is live rather than set once, so
       however the move ends — three cuts, or a `_clearSpecials` halfway through
       — the lock is already correct and simply runs down from wherever it got
       to. See `_popWard` for why it must exist at all. */
    if (this.triAt) this.triLockT = CROSS.cool;
    else this.triLockT = Math.max(0, this.triLockT - dt);

    // --- charge ---
    if (this.chargeT > 0) {
      this.chargeT -= dt;
      this.chargeLeft -= CHARGE.speed * dt;
      this._chargeStrike(world, hud);
      if (this.chargeT <= 0 || this.chargeLeft <= 0) this._endCharge();
    }

    /* --- the dive ends when she stops falling ---
       Landing is handled where the ground snap happens, because the impact
       needs the speed. This is the OTHER way out: a dive that clips a wall,
       gets shoved by `resolveSolids` and ends up rising, or one thrown while
       a round ends. Without it `diving` latches and pins her downward
       velocity for the rest of the afternoon. */
    if (this.diving && (this.onGround || this.hitT > 0 || this.ko)) this.diving = false;
  }

  /**
   * Start a block. Held from here; `_stepSpecials` ends it.
   *
   * NOT THROUGH A CROSS SLASH, AND NOT OUT OF ITS RECOVERY. The whole price of
   * the technique is that she is planted and open for about a second; a bubble
   * she can pop on the second cut, or on the frame the launch goes out, refunds
   * that price and makes the move free. `triLockT` covers the move and
   * `CROSS.cool` after it — the same window she cannot attack in.
   *
   * IT SAYS SO. The other three refusals below are all things she can see: no
   * orb on the profile screen, a bubble already round her, a wait she just
   * spent. This one is invisible — she is mid-swing, the button does nothing,
   * and there is no way to find out why. A refusal that says nothing reads as
   * a broken button.
   */
  /**
   * How long THIS block may run, in seconds.
   *
   * DEGRADES RATHER THAN VANISHES, which is why it is a function and not a
   * bare read. `wardMax` is halved by blows and re-read from the orb on every
   * pop, and a Player built outside the game — every one in `world-check`, and
   * the character picker's — may never have been popped at all. A NaN here
   * would not throw: `used >= NaN` is false, so the bubble would simply never
   * expire, which is the exact bug this ability's hard cap exists to prevent
   * and is invisible until somebody times it.
   */
  _wardCeiling() {
    const m = this.wardMax;
    return Number.isFinite(m) && m > 0 ? m : (this.power.ward?.max ?? WARD.max);
  }

  /**
   * A blow landed on the bubble. Charge it.
   *
   * ASKED FOR, AND THE ARITHMETIC IS THE PLAYER'S OWN: "if Max timer is 2s,
   * and has been on for 0.5s, then it's Max timer is now 1s and will expire in
   * 0.5s". So the CEILING halves and the clock is untouched — see `wardMax`.
   *
   * THREE OUTCOMES AND THEY ARE THREE DIFFERENT SOUNDS, because they are three
   * different instructions. Absorbed means keep blocking. Expired means the
   * bubble is gone and she should run. Smashed is the same instruction arrived
   * at from the second blow, and it is deliberately the SAME sound as expired:
   * "the high pitched, or unique shield disabled sound" — one noise for one
   * fact, which is that the shield is not there any more. What separates them
   * is the picture, not the pitch.
   *
   * `WARD.hits` IS THE FLOOR UNDER THE HALVING and it is checked FIRST. Halving
   * a positive number never reaches zero, so without it a kitten who blocks
   * early enough rides a sliver of bubble through a whole exchange — and a
   * shield that survives two clean hits does not read as something anybody
   * broke. Two blows end it whatever the clock says.
   *
   * THE TAIL COUNTS AS THE BUBBLE. `warded` is true through the fifth of a
   * second after she lets go, and a blow that lands in it is blocked — so it
   * has to be chargeable too, or letting go early becomes a free block. There
   * is nothing to halve once `wardOn` is false, so it goes straight to the
   * smash: the tail is already the end of the bubble.
   *
   * @returns {'absorbed'|'expired'|'smashed'} what the blow did
   */
  _wardTakeHit(hud) {
    this.wardFlash = 0.25;
    this.wardHits += 1;

    const smash = (why) => {
      /* THE PICTURE OUTLIVES THE BUBBLE, which is why `wardBreakT` is set here
         and cleared by nothing that clears the block. A kitten who is knocked
         out on the same frame her shield breaks still gets to see it break. */
      this.wardBreakT = WARD.breakT;
      this.wardBurst.visible = true;
      hud?.sfx?.('wardbreak');
      /* AFTER the sound, and 'smashed' is why `_dropWard` holds its own. */
      this._dropWard(hud, 'smashed');
      this.wardTail = 0;
      return why;
    };

    if (this.wardHits >= (WARD.hits ?? 2) || !this.wardOn) return smash('smashed');

    this.wardMax = this._wardCeiling() * (WARD.hitCut ?? 0.5);
    /* THE HALVING CAN LAND BEHIND THE CLOCK, and that is the player's fourth
       case — "if the timer has expired, then just turn it off". It is not a
       separate rule, it is this one arriving at a ceiling she has already
       spent, so it says the same thing the second blow says. */
    if (this.wardUsed >= this.wardMax) return smash('expired');

    hud?.sfx?.('wardabsorb');
    return 'absorbed';
  }

  _popWard(hud) {
    if (this.triLockT > 0 && this.power.ward) {
      hud?.sfx?.('deny');
      hud?.toast?.(`${this.name} — finish the Cross Slash before you block`, this.index);
      return false;
    }
    if (!this.power.ward || this.warded || this.wardCool > 0) return false;
    this.wardOn = true;
    this.wardUsed = 0;
    /* A FRESH CEILING AND A FRESH TALLY, every time. This is the whole of
       "reset after it expires": nothing anywhere else has to remember to
       undo a halving, because the only way back into a block is through
       here and here always starts from the orb's own number. */
    this.wardMax = this.power.ward?.max ?? WARD.max;
    this.wardHits = 0;
    this.wardMesh.visible = true;
    hud?.sfx?.('wardup');
    return true;
  }

  /**
   * Get thrown, without being hit.
   *
   * NOT `hurt`, AND DELIBERATELY NOT REACHABLE FROM IT. Mr Satan's tantrum
   * (`systems/satanblast.js`) is the only caller and it is a gag, not a blow:
   * no damage, no knockout, no score, no invulnerability spent, no Cross Slash
   * interrupted, nothing banked and nothing owed. There is no `dmg` parameter
   * to pass, so this cannot quietly become an attack later without somebody
   * changing the signature in front of a reviewer — which is the third
   * non-negotiable defended by construction rather than by a comment.
   *
   * THE WARD DOES NOT STOP IT AND MUST NOT. A bubble is a thing that stops
   * BLADES; the same rule that lets a ring-out pierce it applies here, and for
   * the funnier version of the same reason — a kitten who could stand on the
   * announcer's box holding SHIELD and watch the explosion part around her
   * would have found the one place in the game where the joke does not work.
   *
   * NOR DOES `invulnT`. She is not being hurt, so there is nothing for the
   * invulnerability to refuse; skipping her because she was hit a moment ago
   * would mean the blast caught three sisters and left the fourth standing.
   *
   * @param {{x:number,z:number}} from  what to push away from
   * @param {{knock:number, lift:number}} force
   */
  blast(from, force) {
    /* A KNOCKED-OUT KITTEN IS LEFT WHERE SHE IS. She is lying on the floor
       waiting for `koT` and the round is watching her; picking her up and
       throwing her across the island mid-count is the one outcome here that
       could actually change something. */
    if (this.ko) return;

    /* THE SAME ZERO-LENGTH GUARD `hurt` USES, and it is not hypothetical here
       either: he detonates at his own feet and a kitten who has climbed onto
       exactly the square he is standing on is a nine-year-old's first idea. */
    let dx = this.position.x - from.x;
    let dz = this.position.z - from.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.001) { dx = Math.sin(this.facing); dz = Math.cos(this.facing); }
    else { dx /= len; dz /= len; }

    /* NO `rage` MULTIPLIER. Everywhere else knockback grows with the damage
       she has taken — Smash's percent rule — because knockback is how a fight
       is won. This is not a fight, and a kitten who is losing one should not
       be thrown further by a joke than her sister standing beside her. */
    this.velocity.x = dx * force.knock;
    this.velocity.z = dz * force.knock;
    this.velocity.y = Math.max(this.velocity.y, force.lift);
    this.onGround = false;

    /* OFF WHATEVER SHE WAS ON AND OUT OF WHATEVER SHE WAS DOING. `_clearSpecials`
       is how every other "she is somewhere else now" path ends a technique —
       a kitten mid-charge or mid-block who is suddenly airborne over the
       island keeps the move's state otherwise, and a latched Ward would ride
       all the way down with her. */
    this._clearSpecials();
    this.hitLean = Math.sign(dx * Math.cos(this.camYaw) - dz * Math.sin(this.camYaw)) || 1;
    this.squash = 1;

    /* AND IT REALLY IS FREE, WHICH TOOK A SECOND GO TO BE TRUE.
       The first version reasoned that the explosion could only catch somebody
       already outside the fighting square, so it could not change a round.
       That is right about `hurt` and wrong about the ARENA: a kitten stood on
       the announcer's box is outside the square but safely ABOVE the floor, so
       nothing is being charged to her — and being thrown off it drops her
       below the deck, where `Tournament._updateOut` rings her out for thirty
       health and a point. Measured in the browser, not deduced: she left with
       100 and landed in the middle of the ring with 70.

       So the flight sets this flag, and `Tournament._updateOut` reads it as a
       PRICE OF ZERO rather than as an exemption — she is picked up and put back
       in the middle of the ring on exactly the terms the feast uses, which is
       a thing that function already knew how to do. Skipping her instead only
       moved the penalty later; see the comment there.

       Six seconds is roughly twice the arc `knock`/`lift` actually produce,
       and it is a ceiling rather than a duration: the arena spends it the
       moment it picks her up. */
    this.blastT = 6;
  }

  /**
   * End a block, whichever of the three ways it ended.
   *
   * ONE EXIT, so the tail and the wait cannot be started by one path and
   * forgotten by another. The wait is charged here — at the RELEASE — rather
   * than when the tail expires: started at the press a 2s block on a 1.5s
   * cooldown is already available again before it has finished, and started at
   * the end of the tail the number on the profile screen is 0.2s short of the
   * gap she actually feels.
   */
  _dropWard(hud, why = 'release') {
    if (!this.wardOn) return;
    this.wardOn = false;
    this.wardHold = false;
    /* ONLY A RELEASE ARMS THE RE-GRAB, and that distinction is what stops the
       latch being a way to dodge the cooldown. A block she ran to the end of,
       or one that ended because her sister traded the orb away, must not be
       re-grabbable by tapping — the second tap would hand her a fresh bubble
       for nothing. A block she LET GO of a fifth of a second ago is a different
       thing: she is mid-gesture, and the wait charged for that release has not
       been earned yet. See `_latchWard` for what spends this. */
    this.wardRegrab = why === 'release' ? WARD.regrab : 0;
    this.wardTail = WARD.tail;
    /* --- and what a long block costs ---
       MEASURED AGAINST `over`, WHICH IS THE DEFAULT CEILING, NEVER THE CURRENT
       ONE. `hitCut` moves the current ceiling down when a blow lands, so a
       bubble smashed at 1.5s has "run to the end" of a 1.5s ceiling — charging
       overtime for that would put her sister in charge of when she pays it.
       The only question asked here is how long the thing was actually up.

       The player's own example: 2.2s elapsed, then a hit drops the ceiling to
       1.5s and ends it. That pays, because 2.2 > 2.0. The same hit at 1.0s
       elapsed does not.

       IT IS A MULTIPLIER ON HER OWN WAIT, not a flat addition, so a stack of
       Ward orbs that bought her a shorter cooldown keeps the saving in
       proportion — the penalty is "a fifth longer than whatever yours is",
       which is a sentence that survives every other number moving. */
    /* AND IT ASKS TWO QUESTIONS, NOT ONE, WHICH IS WHAT KEEPS IT EPSILON-FREE.

       `wardUsed > over` ALONE IS WRONG and world-check caught it on the first
       run: a block held to a 2.0s cap ends on the frame `wardUsed` crosses
       2.0, so it lands a fraction of a frame PAST it and every ordinary
       full-length block charged the penalty. A tolerance would have hidden
       that, badly — the right size of it depends on the frame rate.

       So the first question is whether there was any headroom to use:
       `g.max` is the granted ceiling, which is the default plus whatever 守
       Long Guard added, and it is NOT touched by `hitCut`. With no booster it
       equals `over` exactly, the test is false by construction, and the whole
       mechanic is unreachable — no tolerance, no frame rate, no drift.

       The second is the one the player asked for: how long was it actually up.
       Using `g.max` for that instead would have got the other case wrong — a
       bubble smashed down to a 1.3s ceiling after 2.2s of life still owes,
       because it was still up for 2.2 seconds. Her sister does not decide when
       she pays; the clock does. */
    const g = this.power.ward;
    const over = g?.over ?? WARD.max;
    this.wardOver = (g?.max ?? WARD.max) > over && this.wardUsed > over;
    this.wardCool = (g?.cool ?? WARD.cool)
      * (this.wardOver ? (g?.penalty ?? 1 + AEGIS.penalty) : 1);
    /* A SMASH HAS ALREADY MADE ITS NOISE. `_wardTakeHit` plays `wardbreak`
       on the frame the blow lands, and layering the ordinary sweep-out under
       it reads as the audio being broken rather than as emphasis — the same
       argument that keeps the round-end bell off the ZERO shout. */
    if (why !== 'smashed') hud?.sfx?.('warddown');
  }

  /**
   * Take the thumb off the block: the second tap of a double tap.
   *
   * IT BUYS THE BUTTON, NOT TIME. `wardUsed` is not touched, so a latched
   * bubble runs out on exactly the frame a held one would have. The whole
   * feature is that two thumbs cannot hold three things — the same reason the
   * touch pad latches RUN — and answering that with extra seconds would be
   * answering a different question.
   *
   * TWO WAYS IN, AND THE SECOND ONE IS WHY `wardRegrab` EXISTS. If the second
   * tap lands while the bubble is still up (her thumb never left, or the frame
   * fell kindly) there is nothing to do but set the flag. Usually it does not:
   * a double tap is press, release, press, and the release already ran
   * `_dropWard` and charged her the wait. So the second tap TAKES THAT BACK —
   * the cooldown and the tail, both of which were charged for a let-go she was
   * in the middle of un-doing. It cannot be used to refund an ordinary block,
   * because `wardRegrab` is only armed by a release and only lasts `WARD.regrab`
   * — a fifth of a second longer than the double-tap window itself, so the
   * gesture is not lost to one slow frame.
   */
  _latchWard(hud) {
    if (!this.power.ward) return false;
    /* NOT OUT OF A CROSS SLASH — the same rule `_popWard` states, closed here
       too because this is a second door into the same room. Two ways in is how
       the first one's rule gets quietly bypassed: she blocks, lets go, starts
       the technique inside the half-second the release armed, taps twice and
       has her bubble back for the whole second she is supposed to be planted
       and open. `_startTriple` arms nothing on its own drop, which closes the
       other half of it.

       SILENT HERE, ON PURPOSE, AND THAT IS NOT A REFUSAL THAT DOES NOTHING —
       returning false drops the caller through to `_popWard`, which makes the
       same test and says the sentence. Toasting from both would deny her twice
       in one frame for one press. The message is `_popWard`'s to own because
       it is the one that fires for a single tap as well. */
    if (this.triLockT > 0) return false;
    if (!this.wardOn) {
      if (this.wardRegrab <= 0) return false;
      this.wardOn = true;
      this.wardTail = 0;
      this.wardCool = 0;
      /* AND THE OVERTIME WITH IT. This is undoing a release, and the release
         is what charged her — refunding the wait while leaving the debt behind
         would fire "you can block again" at the end of a wait that was handed
         back. The block goes on running, so if it really does end past the
         line, `_dropWard` charges it again then. */
      this.wardOver = false;
      this.wardMesh.visible = true;
    }
    this.wardRegrab = 0;
    this.wardHold = true;
    hud?.sfx?.('wardup');
    return true;
  }

  /* ------------------------------ 瞬 Flash Step -------------------------- */

  /**
   * Where the stick is pointing, in world radians — or null if it is centred.
   *
   * THE SAME ARITHMETIC `_updateGround` USES TO SET HER FACING, and it has to
   * be: the whole aiming rule is "point the stick the way you want to go", and
   * a second opinion about what the stick says would mean the direction she
   * teleports is not the direction she would have walked. The dead-zone test is
   * the same `lengthSq > 0.0001` too, so "the stick is pushed" means one thing
   * in this file.
   */
  _stickHeading(pad) {
    const { fwd, right } = this._basis();
    const wish = new THREE.Vector3()
      .addScaledVector(right, pad?.mx ?? 0)
      .addScaledVector(fwd, -(pad?.my ?? 0));
    if (wish.lengthSq() <= 0.0001) return null;
    return Math.atan2(wish.x, wish.z);
  }

  /**
   * Who the reticle goes on — or null.
   *
   * "THE ONE CLOSEST TO THE FORWARD CENTRE", which is an ANGLE and not a
   * distance, and the difference matters: a sister three units away and 55
   * degrees off her shoulder is further from where she is looking than one
   * eight units away and dead ahead, and the move is aimed with the camera.
   * The dot product is exactly that measure, so it is what sorts; distance only
   * breaks a tie.
   *
   * TWO WAYS TO QUALIFY, AND BOTH WERE ASKED FOR. Inside `DODGE.range` and
   * within `DODGE.arc` of dead ahead is the first — the deliberate, look-at-her
   * one. The second is "anybody your swing would already reach", which is a
   * narrower distance and a much wider arc, and it exists so that somebody
   * standing on your shoulder cannot be missed by a rule about looking.
   *
   * THE HEIGHT GATE IS `COMBAT.strikeHeight` AND NOT A NUMBER OF ITS OWN. The
   * ask was "only if we would hit them with a sword swing at that height
   * level", so this is that same question, asked with that same constant, which
   * is on the balance page. A kitten who has double-jumped over your head is
   * not somebody you can flash-step around, for the same reason she is not
   * somebody you can cut.
   *
   * NOT GATED ON THE TOURNAMENT, and that is deliberate. This is not a strike —
   * nothing here calls `hurt`, and `Game.strikePlayers` is still the one gate
   * on the two of them hurting each other (third non-negotiable). It is a
   * PIVOT: the reticle says "I am about to move relative to you", which is a
   * true and useful thing to say in the market square as well as in the ring.
   */
  _dodgeTargetFor(hud) {
    const list = hud?.players;
    if (!list) return null;
    const fx = Math.sin(this.facing);
    const fz = Math.cos(this.facing);
    const cosArc = Math.cos(THREE.MathUtils.degToRad(DODGE.arc));
    /* HER REAL REACH, recovered the same way `Game.strikePlayers` recovers it,
       so a Riverclaw kitten wearing three Long Cut orbs qualifies exactly the
       people her blade actually qualifies. A literal 3.4 here would have been
       the fourth copy of that number. */
    const swing = ATTACKS.stand.reach * (this._reach() / BASE_REACH);

    let best = null;
    let bestDot = -2;
    let bestD = Infinity;
    for (const q of list) {
      if (!q || q === this || q.ko || q.angel) continue;
      const dy = q.position.y - this.position.y;
      if (Math.abs(dy) > COMBAT.strikeHeight) continue;
      const dx = q.position.x - this.position.x;
      const dz = q.position.z - this.position.z;
      const d = Math.hypot(dx, dz);
      const dot = d > 0.001 ? (dx * fx + dz * fz) / d : 1;
      const inSight = d <= DODGE.range && dot >= cosArc;
      const inSwing = d <= swing && dot >= ATTACKS.stand.arc;
      if (!inSight && !inSwing) continue;
      if (dot > bestDot + 1e-4 || (Math.abs(dot - bestDot) <= 1e-4 && d < bestD)) {
        best = q;
        bestDot = dot;
        bestD = d;
      }
    }
    return best;
  }

  /**
   * Sprint + Interact: go.
   *
   * RETURNS WHETHER IT TOOK THE PRESS, and the caller uses that to decide
   * whether the power dive still gets it. Both live on `interact` and the dodge
   * additionally wants `sprint` held, so on a kitten wearing both orbs one
   * press in mid-air would otherwise fire both moves. Ordering them here rather
   * than adding `!pad.down('sprint')` to the dive is what keeps the dive
   * bit-identical for everybody who has not bought a 瞬 (fifth non-negotiable):
   * with no Flash Step orb this returns false before it looks at anything.
   *
   * THE OATH WINS THE BUTTON OUTRIGHT, exactly as a dragon wins `mount`. A
   * kitten standing in a clan hall she has not sworn to presses interact to
   * swear; teleporting her out of the doorway instead — and doing it silently,
   * because the oath branch further down would then find her somewhere else —
   * is the same class of bug as getting a bubble when you meant to fly. The
   * dealer's stall does not need a clause here: `Game` answers that press and
   * spends it (`consume('interact')`) long before `Player.update` runs.
   */
  _startDodge(world, pad, hud) {
    if (!this.power.blink) return false;
    if (this.dodgeT > 0 || this.dodgeLockT > 0) return false;
    /* NOT OFF AN ANIMAL, NOT OUT OF A TECHNIQUE, NOT MID-MEAL. Every one of
       these already owns her position for the next second, and a teleport out
       of the middle of one leaves the thing that owned it holding a kitten who
       is somewhere else — a panda carrying nobody, a Cross Slash whose cuts
       land in an empty space, an animal pinned under a paw that has gone. */
    if (this.mount || this.rideAlong || this.pandaMount) return false;
    if (this.ko || this.angel || this.busy || this.eatT > 0) return false;

    const hall = world?.clanHallNear?.(this.position.x, this.position.z);
    if (hall && this.clan?.id !== hall.clan.id) return false;

    /* AND THE WAIT SAYS WHAT IT WANTS. Sixth non-negotiable: a button that
       silently does nothing reads as broken, and a lock has to say what it is
       waiting for as an instruction rather than as a complaint. */
    if (this.dodgeCool > 0) {
      hud?.sfx?.('deny');
      hud?.toast?.(`${this.name} — wait for 瞬 Flash Step to come back`, this.index);
      return false;
    }

    /* THE BLOCK GOES DOWN WITH HER, and it was asked for that way: "all other
       special abilities are disabled, including if the shield is on, it gets
       disabled". Dropped through `_dropWard` rather than by clearing the flag,
       so she pays the ordinary wait for it and the overtime rule still gets to
       ask its question — the same argument `_startTriple` makes. Not a
       'release', so it cannot be re-grabbed by a double tap out of a dodge. */
    if (this.wardOn) this._dropWard(hud, 'blink');
    this.diving = false;

    this.dodgeT = DODGE.invuln;
    this.dodgeLockT = 0;
    this.dodgePlaced = false;
    this.dodgeSeq++;
    this.dodgeFrom.copy(this.position);
    this.dodgeAim0 = this._stickHeading(pad);
    this.dodgeAim = this.dodgeAim0;
    this.dodgeAimed = false;
    this.dodgeTarget = this._dodgeTargetFor(hud);
    this.dodgeD0 = this.dodgeTarget
      ? Math.hypot(
        this.dodgeTarget.position.x - this.position.x,
        this.dodgeTarget.position.z - this.position.z
      )
      : 0;
    this.velocity.set(0, 0, 0);
    hud?.sfx?.('dodgeout');
    /* AND THE LOCK MAKES ITS OWN, SMALLER NOISE. A fact about a THIRD party —
       somebody has been chosen — so it is deliberately thin and dry; four of
       them in a scrap must not be four alarms. Played from here rather than
       from `systems/dodgefx.js` because that file is drawing and this is the
       frame the decision was actually made on. */
    if (this.dodgeTarget) hud?.sfx?.('dodgelock');
    return true;
  }

  /**
   * The vanish, the aim, the landing and the wait. Stepped from `_stepSpecials`.
   *
   * THE AIM IS WATCHED FOR THE WHOLE VANISH AND READ ONCE AT THE END OF IT.
   * `DODGE.commit` is four fifths of the way through, which leaves the last
   * fifth for arriving — so the teleport happens while she is still invisible
   * and the fifth after it is her fading back in where she landed, rather than
   * a cat popping out of existence in one place and into it in another.
   */
  _stepDodge(dt, pad, world, hud) {
    this.dodgeCool = Math.max(0, this.dodgeCool - dt);
    if (this.dodgeT <= 0) {
      this.dodgeLockT = Math.max(0, this.dodgeLockT - dt);
      return;
    }

    /* --- did she aim, or was her thumb just where it already was? ---
       `dodgeAimed` is the answer, and it decides exactly one case: a stick that
       is CENTRED when the commit lands. Never aimed means "stay here"; aimed
       and then let go means the last direction she asked for. Without the five
       degrees those two inputs are the same reading and one of them has to be
       guessed wrong. */
    const aim = this._stickHeading(pad);
    if (aim != null) {
      if (this.dodgeAim0 == null) this.dodgeAimed = true;
      else {
        /* WRAPPED, because 359 degrees and 1 degree are two apart and not 358.
           A stick pushed north at the press and a hair west of north now must
           not read as a deliberate half-turn. */
        let d = aim - this.dodgeAim0;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        if (Math.abs(d) > THREE.MathUtils.degToRad(DODGE.lockDeg)) this.dodgeAimed = true;
      }
      this.dodgeAim = aim;
    }

    this.dodgeT = Math.max(0, this.dodgeT - dt);

    if (!this.dodgePlaced && this.dodgeT <= DODGE.invuln * (1 - DODGE.commit)) {
      this._commitDodge(pad, world, hud);
    }

    if (this.dodgeT === 0) {
      /* SHE IS BACK, AND SHE STILL CANNOT MOVE. The immobile half is the same
         length as the invulnerable half by construction — one number, used
         twice — because two knobs would let somebody set this one to zero and
         turn a trade into a free escape. */
      this.dodgeLockT = DODGE.invuln;
      this.dodgeCool = DODGE.cool;
      this.velocity.set(0, 0, 0);
      hud?.sfx?.('dodgein');
    }
  }

  /**
   * Read the stick, pick the pivot, and put her down.
   *
   * THREE DESTINATIONS AND THEY ARE IN PRIORITY ORDER.
   *
   *   1. No direction at all — she stays exactly where she is. That is a
   *      CHOICE and not a failure: half a second of nothing being able to touch
   *      her, spent standing still, is the whole of the defensive version of
   *      this move.
   *   2. The shield button held at the commit — pivot on HERSELF, at half the
   *      detection range, whatever the reticle says. This is the flee: it
   *      overrides the target outright, and the reticle deliberately stays on
   *      whoever it locked, because she really did lock them and then leave.
   *   3. A target — pivot on THEM, at the SHORTER of the distance when she
   *      pressed and the distance now. Shorter, because the other one lets a
   *      sister who ran away during the vanish drag the landing further than
   *      the move is supposed to reach; and taking it from the target rather
   *      than from her own feet is what makes the stick mean "which side of her
   *      do I come out on" instead of "how far do I go".
   *
   * NOTHING MAY BE STRANDED, so a destination with no ground under it is
   * refused and she stays put with the refusal blip. That is the fourth
   * non-negotiable applied to the one move in the game that can put a kitten
   * somewhere she did not walk to: `heightAt` returning null is the void, and a
   * teleport into it would be a fall out of the world she did not ask for.
   */
  _commitDodge(pad, world, hud) {
    this.dodgePlaced = true;

    const live = this._stickHeading(pad);
    const aim = live != null ? live : (this.dodgeAimed ? this.dodgeAim : null);
    if (aim == null) return;

    const flee = !!pad?.down?.('mount');
    const t = flee ? null : this.dodgeTarget;

    let px = this.dodgeFrom.x;
    let pz = this.dodgeFrom.z;
    let r = DODGE.range * DODGE.selfK;
    if (t) {
      px = t.position.x;
      pz = t.position.z;
      const now = Math.hypot(px - this.dodgeFrom.x, pz - this.dodgeFrom.z);
      r = Math.min(this.dodgeD0, now);
    }

    /* THE SAME sin/cos THAT PLACES EVERY ORB IN THIS GAME. A heading and a
       radius are a point on a circle, and this is that arithmetic written out
       rather than borrowed — see systems/kotodama.js for the version a
       nine-year-old is supposed to read off the screen. */
    const x = px + Math.sin(aim) * r;
    const z = pz + Math.cos(aim) * r;

    const g = world?.heightAt?.(x, z, this.position.y);
    if (!g) {
      hud?.sfx?.('deny');
      return;
    }

    this.position.x = x;
    this.position.z = z;
    /* SHE KEEPS HER HEIGHT UNLESS THE FLOOR IS HIGHER. A flash step is a
       sideways move; carrying her altitude across is what makes one thrown
       mid-jump land her mid-jump. The `max` is the one case that cannot be
       carried — arriving inside a terrace — and the ordinary ground snap two
       screens down does the rest. */
    this.position.y = Math.max(this.position.y, g.y);
    this.velocity.set(0, 0, 0);

    /* SHE COMES OUT LOOKING AT WHOEVER SHE PIVOTED AROUND. Landing behind a
       sister while still facing the way you travelled means the first thing
       you do is turn round, and the move's whole promise is that you arrive
       ready. With nobody to pivot on there is nothing to look at, so she faces
       the way she went. */
    this.facing = t
      ? Math.atan2(t.position.x - x, t.position.z - z)
      : aim;
  }

  /** True while she is GONE — untouchable, weightless, and not drawn. */
  get dodgeAt() { return this.dodgeT > 0; }

  /**
   * True while the Flash Step owns her feet — the vanish AND the wait after it.
   *
   * IT IS NOT `busy`. `busy` also takes the attack button away, and the whole
   * ask here was that she keeps it: "can still swing or do cross-slash
   * ability". So this is a second, narrower question — may she WALK — and it is
   * asked separately by the stick, the jump, the dive and the mount button.
   */
  get dodgePlanted() { return this.dodgeT > 0 || this.dodgeLockT > 0; }

  /**
   * Commit to a charge.
   *
   * THE DIRECTION IS TAKEN ONCE, AT THE PRESS. A charge you can steer is a
   * sprint with a hitbox — the whole shape of the move is that she picks a
   * line and lives with it, which is what makes dodging one a skill her
   * sister can learn rather than a coin flip.
   */
  _startCharge(hud) {
    this.chargeDir.set(Math.sin(this.facing), Math.cos(this.facing));
    this.chargeLeft = this.power.charge.dist;
    this.chargeT = this.power.charge.dist / CHARGE.speed;
    this.attackTimer = this.chargeT;
    this.attackCooldown = this.chargeT + 0.28;
    this._chargeHit = new Set();
    hud?.sfx('slash');
    hud?.sfx('mount', 0.5);
  }

  _endCharge() {
    this.chargeT = 0;
    this.chargeLeft = 0;
    /* Hand her back a velocity the controller can decelerate, not the 42/s
       the charge was running at — released at full pelt she skates halfway
       across the island afterwards, which reads as ice rather than as a stop. */
    this.velocity.x *= 0.35;
    this.velocity.z *= 0.35;
  }

  /**
   * Commit to the technique. All three cuts, none of them thrown yet.
   *
   * `cuts` AND NOT `cuts - 1`, which is the arithmetic the rework turned over.
   * The old version fired on a swing that had already gone out, so it only had
   * two of its own left; now nothing has been thrown when this is called and
   * the sequencer owns all three. `triT` starts at zero so the first one lands
   * on the very next frame — `_stepSpecials` runs at the TOP of the controller
   * and this is called from further down it, so a positive start value would
   * put a whole extra gap in front of a move that is meant to feel like a
   * decision she already made.
   */
  _startTriple(hud) {
    /* THE BUBBLE COMES DOWN WITH THE FIRST CUT. A kitten who blocks and then
       starts a cross slash would otherwise be untouchable for the whole second
       she is planted, which is the one window in the move where she is meant
       to be committed and open — that is the cost the three cuts are paid for.
       Dropped through `_dropWard` rather than by clearing the flag, so she is
       charged the ordinary wait for it too and this is not a free cancel. */
    if (this.wardOn) this._dropWard(hud, 'cross');
    this.triLeft = CROSS.cuts;
    this.triT = 0;
    this.triHangT = 0;
    this.triLockT = CROSS.cool;
    this.triHits = 0;
    this.attackHeld = 0;
    this._triPend = false;
  }

  /**
   * She has held past the line: plant her, and let everybody see it coming.
   *
   * THERE IS NO TOAST HERE ANY MORE, AND IT WAS THE WIND-UP THAT KILLED IT.
   * The line used to read `CROSS SLASH!` the moment she planted, on the
   * argument that a tell nobody can act on is decoration — announce it a
   * quarter of a second early and her sisters can move. What that argument
   * missed is that the wind-up is the one part of the technique she can still
   * lose: letting go cancels it, and so does a blade (`hurt`). So the game
   * shouted CROSS SLASH and then, most of the time somebody was actually
   * fighting back, nothing happened — which reads as the move being broken
   * rather than as the counter having worked. Reported from play: "the message
   * shouldn't appear if the player cancels the ability; probably remove the
   * text altogether."
   *
   * THE TELL IS NOT LOST WITH IT. `systems/crossfx.js` draws the wind-up and
   * its seal, and that one is drawn WHILE the state is true rather than fired
   * once at the start of it — so it comes and goes with the technique instead
   * of outliving it. A picture that stops is a cancel; a toast that has
   * already been read is not.
   *
   * The ward is NOT dropped here. `_startTriple` still owns that, because a
   * kitten who commits and then lets go should not have paid her bubble for a
   * move she never threw.
   */
  _startWind() {
    this.triWindT = CROSS.wind;
    this.triHits = 0;
  }

  /* ---------------------- caught in one of them -------------------------- */

  /**
   * A cut from somebody's triple slash landed on her.
   *
   * SHE TAKES NO DAMAGE HERE. She is frozen, floated and BANKED — the number
   * goes into `heldDmg` and is not paid until the technique finishes, which is
   * what lets all three cuts land on the same kitten instead of the first one
   * throwing her out of reach of the other two. That was the bug: three cuts
   * at a body that had already gone.
   *
   * THE CAP IS THE CONTRACT. Three cuts, three hits, no more, whatever else
   * calls this — a stacked Juuji orb makes each cut hurt more, not a fourth
   * cut appear, and a bug that let a fourth land would be invisible right up
   * until it one-shot somebody.
   *
   * The ward still stops it, the same way it stops an ordinary blade. A block
   * that held against every attack in the game except this one would be the
   * kind of exception a nine-year-old reads as the bubble being broken.
   *
   * @param {object} hud  the Game, for the block's sound. It is a parameter
   *   rather than something the Player holds because the sound was the
   *   CALLER'S until this change, and one owner is the point: see the
   *   ward branch below.
   * @returns {boolean} true if this cut counted.
   */
  triCapture(by, dmg, dx, dz, hud) {
    if (this.ko || this.angel) return false;
    if (this.heldBy && this.heldBy !== by) return false;
    /* THE CROSS SLASH PAYS THE SAME PRICE AS A BLADE, and it pays it three
       times: each cut is a separate call, so a bubble that stops the first
       is smashed by the second. That is the rule this branch already
       stated — "the same way it stops an ordinary blade" — followed through
       to the part that is now expensive. A technique that could be walked
       into for free would make the bubble the answer to the strongest
       move in the game. */
    if (this.warded) { this._wardTakeHit(hud); return false; }
    if (this.heldBy === by && this.heldHits >= CROSS.cuts) return false;

    if (!this.heldBy) {
      this.heldBy = by;
      this.heldDmg = 0;
      this.heldHits = 0;
      /* Whatever she was doing, she is not doing it. Her own charge or dive
         would otherwise keep driving her velocity straight through the freeze,
         and a "frozen" kitten sliding across the ring is worse than no freeze
         at all. */
      this._clearSpecials();
      this.velocity.set(0, 0, 0);
      this.onGround = false;
    }
    /* The watchdog is reset by every cut, so it can only ever expire on a
       technique that has actually stopped landing. Generous on purpose: it is
       a floor under a bug, not a rule anybody plays against. */
    this.heldT = CROSS.cuts * CROSS.gap + CROSS.hang + 1.5;
    this.heldHits++;
    this.heldDmg += dmg;
    this.heldDx = dx;
    this.heldDz = dz;
    /* THE FREEZE HAS TO BE READABLE. A kitten hanging motionless in mid-air
       with nothing happening to her looks like the game locking up, so each
       cut flashes her the same white an ordinary hit does — three flashes on a
       body that is not moving is hit-stop, which every kid who has played
       Smash already reads without being told. */
    this.flashT = 0.22;
    this.squash = 1;
    /* Invulnerability is CLEARED here rather than granted. The protection
       while she is held comes from `heldBy` (see Game.strikePlayers); a
       leftover `invulnT` from the blow before would make the LAUNCH — which is
       an ordinary `hurt` call — silently do nothing at the end of a technique
       that visibly landed three times. */
    this.invulnT = 0;
    this.hitT = 0;
    return true;
  }

  /** Let her go. The damage and the throw are the caller's job — see
   *  `Game._freeTripleHold`, the only thing that calls this. */
  releaseHold() {
    this.heldBy = null;
    this.heldDmg = 0;
    this.heldHits = 0;
    this.heldT = 0;
  }

  _startDive(hud) {
    this.diving = true;
    /* PINNED HERE AS WELL AS IN THE CONTROLLER. The controller's pin runs near
       the top of `_updateGround`, next to gravity, and this is called from
       further down it — so on the frame she presses the button she keeps
       whatever upward velocity the jump left her with, and the drop starts one
       frame late. One frame is not much; it is enough to see, because the
       thing she is watching for is an instant change of direction. */
    this.velocity.y = -DIVE.speed;
    this.velocity.x *= 0.3;
    this.velocity.z *= 0.3;
    this.squash = 1;
    hud?.sfx('slash');
  }

  /**
   * The charge's moving hitbox, tested every frame it is live.
   *
   * REPEAT HITS ON A KITTEN ARE STOPPED BY INVULNERABILITY, not by a
   * per-charge set — `hurt` already refuses for INVULN seconds after a blow
   * lands, and a charge is over in under half a second. Props get their own
   * set, because `knock` has no equivalent guard and a barrel hit forty times
   * in one pass scores once and rattles forty times.
   *
   * AND SO DO ANIMALS, WHICH IS THE THIRD CASE AND WAS MISSING. A critter has
   * no invulnerability window: charging through a rat re-stunned it and played
   * `squeak` on every frame of the pass, which is what "they get hit many
   * times by one ability" was. They go in the SAME set as the props — one
   * attack, one memory, whatever kind of thing it caught.
   */
  _chargeStrike(world, hud) {
    hud?.strikePlayers?.(this, 'charge', this._reach(), this.chargeDir);
    /* THE WILDLIFE TOO, and this was missing. `_doSlash` asks both questions
       on every ordinary swing — the other kitten and the deck's animals — and
       the two power-orb attacks asked only the first, so a rat could be
       charged straight through and a dive could land on top of one and neither
       did anything at all. That reads as the move being broken rather than as
       the animal being fast, and it hit the rat hardest because the rat is the
       one you chase. */
    hud?.strikeCritters?.(this, CHARGE.radius, this._chargeHit);
    for (const p of world.props) {
      if (this._chargeHit.has(p)) continue;
      const dx = p.group.position.x - this.position.x;
      const dz = p.group.position.z - this.position.z;
      if (Math.abs(p.group.position.y - this.position.y) > 3) continue;
      const dist = Math.hypot(dx, dz);
      if (dist > CHARGE.radius) continue;
      this._chargeHit.add(p);
      this._knockProp(p, dx, dz, 1.5, world, hud);
    }
  }

  /** The dive's landing: everything around her feet goes over. */
  _diveImpact(world, hud) {
    this.diving = false;
    this.squash = 1;
    hud?.sfx('rockbreak');
    /* Straight down has no facing, so the strike is fed the direction she is
       pointed and ATTACKS.dive's arc of -1 ignores it. Passing the UNSCALED
       katana reach is deliberate: this is a falling body, not a blade, so a
       Riverclaw oath must not widen the crater. */
    hud?.strikePlayers?.(this, 'dive', 3.4, new THREE.Vector2(Math.sin(this.facing), Math.cos(this.facing)));
    // ...and the animals, for the reason `_chargeStrike` gives.
    hud?.strikeCritters?.(this, DIVE.radius);
    for (const p of world.props) {
      /* THE DIVE IS THE DIVE-BOMB `prop.js` ALREADY NAMES. "Bamboo answers to
         the katana and nothing else — not a dive-bomb, not dragon breath" was
         written before there was a dive to bomb with, and it is still the
         rule that makes a 150-cane grove the one place flight and force fail
         and a girl has to stand there and cut. The charge keeps its blade out
         and does cut; a falling body does not. */
      if (p.katanaOnly) continue;
      const dx = p.group.position.x - this.position.x;
      const dz = p.group.position.z - this.position.z;
      if (Math.abs(p.group.position.y - this.position.y) > 3.5) continue;
      if (Math.hypot(dx, dz) > DIVE.radius) continue;
      this._knockProp(p, dx, dz, 1.9, world, hud);
    }
  }

  /**
   * Her katana's real reach, clan and orbs folded in. One place.
   *
   * THE TWO BONUSES ADD; THEY DO NOT MULTIPLY. This read
   * `clanReach * power.reach`, so Riverclaw's oath was charged on the ORBS'
   * bonus as well as on the base blade: three Long Cut orbs (x1.90) under
   * Riverclaw (x1.80) came out at 3.42 — a blade eleven and a half metres
   * long, more than the whole arena's half-width, hitting a girl who was
   * nowhere near it. The orbs were paying Riverclaw's 80% a second time.
   *
   * Each bonus is measured against the UNSWORN, UNADORNED blade and then the
   * two are summed: `clan + (orbs - 1)`. The `- 1` is the base being taken
   * back out of the orb multiplier so only its bonus is left — 1.90 is "the
   * blade, plus 0.90 of a blade", and it is that 0.90 that Riverclaw's 1.80
   * gets added to. Same kitten now reaches 2.70.
   *
   * WHY NOT JUST LOWER `buff.reach`? Because the double-count grows with the
   * stack — one orb doubled 0.30 into 0.54, three doubled 0.90 into 1.62 —
   * so no single smaller number fixes it, it only picks which stack size is
   * wrong by how much. The shape of the sum is the bug.
   *
   * Both identities still hold: no clan is `1 + (orbs - 1) = orbs`, and no
   * orbs is `clan + 0 = clan`. An unsworn kitten with an empty neck is
   * `1 + 0 = 1`, which is why nothing outside the arena moved.
   */
  _reach() {
    const clan = this.clan?.buff?.reach ?? 1;
    return BASE_REACH * (clan + (this.power.reach - 1));
  }

  /**
   * Knock one prop over and score it.
   *
   * Lifted out of `_doSlash` when the dive and the charge arrived: three
   * copies of "push it, play a noise, score it if it is fresh" is three places
   * for the bamboo tally or the mischief hook to be forgotten in.
   */
  _knockProp(p, dx, dz, power, world, hud) {
    const push = new THREE.Vector3(dx, 0, dz).normalize();
    const fresh = p.knock(push, power);
    hud?.sfx(p.kind === 'bamboo' ? 'bamboo' : 'hit');
    if (fresh && !p.scored) {
      p.scored = true;
      this.score += p.points ?? 10;
      hud?.sfx('score');
      hud?.onMischief(this, p);
    }
    return fresh;
  }

  _doSlash(world, hud, kind = 'stand') {
    const dir = new THREE.Vector2(Math.sin(this.facing), Math.cos(this.facing));
    // Riverclaw's blade reaches further, and so does every Long Cut orb — and
    // the drawn arc grows with both, so the buff is something you can see
    // rather than just feel. One accessor, so the arc can never disagree with
    // the hitbox it is drawing.
    const reach = this._reach();

    /* THE OTHER KITTEN, FIRST — and through the game, not from here.
       `strikePlayers` is the ONE place that asks whether the two of them are
       allowed to hurt each other, exactly like `strikeWards` is the one place
       that knows what a lock answers to. Testing "am I in the arena?" here
       would put that rule in a second place, and the copy nobody remembers is
       how you end up able to cut your sister down in the market square. */
    hud?.strikePlayers?.(this, kind, reach, dir);
    /* ...and the ring's wildlife, through the game for the same reason. A rat
       is pinned, a rabbit is knocked out of its hop and a bird ends up in her
       mouth — three outcomes of one swing, none of which may happen anywhere
       but the arena, so the question is asked in the one place that knows. */
    hud?.strikeCritters?.(this, reach);
    let hits = 0;
    for (const p of world.props) {
      const dx = p.group.position.x - this.position.x;
      const dz = p.group.position.z - this.position.z;
      const dy = p.group.position.y - this.position.y;
      const dist = Math.hypot(dx, dz);
      if (dist > reach || Math.abs(dy) > 3) continue;
      // 150-degree arc in front
      const dot = (dx * dir.x + dz * dir.y) / (dist || 1);
      if (dot < -0.25) continue;
      // Bamboo gets its own crack; everything else a wooden knock. One per
      // prop is fine â€” the voice cap in the audio engine handles a big hit.
      this._knockProp(p, dx, dz, 1.15, world, hud);
      hits++;
    }
    if (hits) this.squash = 0.6;
  }

  /**
   * The panda's claw swipe — the ground-level counterpart to dragon breath.
   *
   * Wide and heavy but close in, and it swings along the KITTEN's facing
   * rather than the panda's. The panda's drawn heading is locked broadside so
   * it only ever points two ways; hanging the hitbox off that would mean the
   * attack could not be aimed at all. She steers, the panda swings.
   *
   * It DOES cut bamboo — the only thing in the game besides the katana that
   * does. See CLAW in panda.js for why that reversed. Dragon breath and
   * dive-bombing still can't, so the grove stays the place flight fails.
   */
  _doClaw(world, hud) {
    const c = this.pandaMount.swipe(this.facing);
    hud?.sfx('claw');
    const dir = new THREE.Vector2(Math.sin(this.facing), Math.cos(this.facing));
    let hits = 0;
    for (const p of world.props) {
      const dx = p.group.position.x - this.position.x;
      const dz = p.group.position.z - this.position.z;
      const dy = p.group.position.y - this.position.y;
      const dist = Math.hypot(dx, dz);
      if (dist > c.range || Math.abs(dy) > 5) continue;
      const dot = (dx * dir.x + dz * dir.y) / (dist || 1);
      if (dot < 1 - c.spread) continue;
      const push = new THREE.Vector3(dx, 0, dz).normalize();
      const fresh = p.knock(push, c.power);
      // Bamboo keeps its own hollow crack whatever cut it.
      hud?.sfx(p.kind === 'bamboo' ? 'bamboo' : 'hit');
      if (fresh && !p.scored) {
        p.scored = true;
        this.score += p.points ?? 10;
        hud?.sfx('score');
        hud?.onMischief(this, p, 'a panda claw');
      }
      hits++;
    }
    // The boulder over a star answers to this and to nothing else.
    if (hud?.strikeWards) hud.strikeWards(this, 'claw', c.range);
    if (hits) this.squash = 0.6;
  }

  /**
   * Dragon breath: a cone of whatever this breed exhales.
   *
   * Deliberately cannot cut bamboo. Bamboo is the one thing in the world that
   * only answers to the katana, which means the grove is the place you have to
   * get OFF the dragon â€” the flying is more fun for having somewhere it
   * doesn't work.
   */
  _doBreath(world, hud) {
    /* Ryuuseki fires a fan of beams rather than a cone of breath, and owns
       that code because the count and the aim are facts about the dragon and
       the seat, not about the kitten pressing the button. From here it is one
       call either way. The PILOT always gets one beam — see PILOT_BEAMS. */
    if (this.mount.fire) { this.mount.fire(world, hud, this); return; }
    // Windwhisker makes the flame itself bigger, so the dragon draws a longer
    // cone as well as hitting further.
    const k = this.clan?.buff?.breath ?? 1;
    const b = this.mount.breathe(k);
    hud?.sfx('breath');
    const range = b.range * k;
    const dir = new THREE.Vector2(Math.sin(this.facing), Math.cos(this.facing));
    let hits = 0;
    for (const p of world.props) {
      if (p.katanaOnly) continue;
      const dx = p.group.position.x - this.position.x;
      const dz = p.group.position.z - this.position.z;
      const dy = p.group.position.y - this.position.y;
      const dist = Math.hypot(dx, dz);
      if (dist > range || dy > 6 || dy < -range) continue;
      const dot = (dx * dir.x + dz * dir.y) / (dist || 1);
      if (dot < 1 - b.spread) continue;
      const push = new THREE.Vector3(dx, 0, dz).normalize();
      if (p.knock(push, b.power) && !p.scored) {
        p.scored = true;
        this.score += p.points ?? 10;
        hud?.onMischief(this, p, b.name);
      }
      hits++;
    }
    // The ice over a star cracks to any breath. See LOCKS.ice.
    if (hud?.strikeWards) hud.strikeWards(this, 'breath', range);
    if (hits) this.squash = 0.5;
  }

  /**
   * The gunner's seat on Ryuuseki.
   *
   * She steers NOTHING. Her position is whatever the dragon says it is, which
   * is the only honest way to do it — giving the second seat any influence
   * over where the animal goes means two kittens fighting over one heading,
   * and the loser concludes the controls are broken.
   *
   * What she does own is the fan. It is aimed along HER facing, and her stick
   * turns that facing, so she is a turret: she cannot go anywhere but she
   * chooses what gets hit. That division is the whole feature — neither girl
   * can do both, and the dragon only does its best trick when both are aboard.
   */
  _updatePassenger(dt, pad, world, hud) {
    const R = this.rideAlong;
    /* VERTICAL ONLY, exactly like the pilot — her place along his body is a
       DRAW offset (Ryuuseki.drawOffset), applied in faceCamera.
       Doing it here instead put her seat and Ember's on two different clocks:
       this runs in the update phase and the pilot's runs at render, so the two
       were resolved against different values of a heading that swaps. She
       measured 0.112 along his body when the number said 0.38, and no amount
       of staring at the constant would have explained it. Same offset, same
       place, same frame. */
    const seat = R.seatOffset('gunner');
    this.position.set(R.position.x, R.position.y + seat.y, R.position.z);
    this.velocity.set(0, 0, 0);
    this.onGround = false;
    this.airTime = 0;

    // Her stick aims the guns. No stick, and she keeps the last heading.
    const { fwd, right } = this._basis();
    if (Math.abs(pad.mx) + Math.abs(pad.my) > 0.15) {
      const ax = right.x * pad.mx + fwd.x * -pad.my;
      const az = right.z * pad.mx + fwd.z * -pad.my;
      this.facing = Math.atan2(ax, az);
    }
    /* CLAMPED TO HIS HEAD, every frame rather than only when she pushes the
       stick, because the thing she is clamped against MOVES — his drawn
       heading flips whenever the pilot turns decisively, and an aim left
       correct against the old side is 180 degrees out against the new one.
       `Ryuuseki.aimFor` is the same call `fire` makes, so what she is drawn
       pointing at is exactly where the beams will go: a gunner visibly aiming
       one way while seven beams leave the jaw another reads as broken even
       when the beams are the part that's right. */
    this.facing = R.aimFor(this);

    this.attackCooldown -= dt;
    if (pad.pressed('attack') && this.attackCooldown <= 0) {
      this.attackTimer = 0.26;
      this.attackCooldown = 0.55;
      R.fire(world, hud, this);
    }
    if (this.attackTimer > 0) this.attackTimer -= dt;

    if (pad.pressed('mount')) {
      R.gunner = null;
      this.rideAlong = null;
      hud?.sfx('dismount');
      hud?.onRyuDismount?.(this);
    }
  }

  _updateFlight(dt, pad, world, hud) {
    const { fwd, right } = this._basis();
    const wish = new THREE.Vector3()
      .addScaledVector(right, pad.mx)
      .addScaledVector(fwd, -pad.my);

    const moving = wish.lengthSq() > 0.0001;
    if (moving) wish.normalize();

    /* A dragon is a long side-on drawing, so it only really has two poses:
       facing screen-left and facing screen-right. Steering it with the full
       movement heading meant flying "into" the screen put it edge-on, where
       the billboard's mirror test sits right on its threshold and the whole
       creature snapped back and forth â€” pressing UP made it flip.
       So the drawn heading is locked broadside and only swaps on decisive
       LEFT/RIGHT motion. Movement itself is unaffected: that comes from
       `wish` and the camera basis, not from this. */
    const lateral = this.velocity.x * right.x + this.velocity.z * right.z;
    if (Math.abs(lateral) > 2.5) this.flySide = Math.sign(lateral);
    this.flySide = this.flySide || 1;
    this.facing = this.camYaw + this.flySide * (Math.PI / 2);

    const boosting = pad.down('sprint');
    const speed = boosting ? FLY_BOOST : FLY_SPEED;
    const target = wish.multiplyScalar(moving ? speed : 0);

    // Vertical: jump climbs, interact dives, otherwise gently level out.
    let vy = 0;
    if (pad.down('jump')) vy = FLY_LIFT;
    else if (pad.down('interact')) vy = -FLY_LIFT;

    const rate = 26 * dt;
    this.velocity.x += THREE.MathUtils.clamp(target.x - this.velocity.x, -rate, rate);
    this.velocity.z += THREE.MathUtils.clamp(target.z - this.velocity.z, -rate, rate);
    this.velocity.y += THREE.MathUtils.clamp(vy - this.velocity.y, -rate * 1.6, rate * 1.6);

    this.position.addScaledVector(this.velocity, dt);

    /* Don't let the dragon fly through terrain. The floor is measured from the
       DRAGON, not the rider: the creature hangs a seat-height below you, so a
       floor set at the rider's height buries the whole animal in the hill.
       Coming within a couple of units of it counts as hovering, which swaps
       the dragon to its perched pose â€” see Dragon.update. */
    const d0 = this.mount;
    const clearance = d0.seatOffset().y + 1.2;
    const g = world.heightAt(this.position.x, this.position.z, this.position.y);
    const floor = (g ? g.y : -200) + clearance;
    if (this.position.y < floor) {
      this.position.y = floor;
      if (this.velocity.y < 0) this.velocity.y = 0;
    }
    d0.hovering = !!g && this.position.y - floor < 2.5;
    if (this.position.y > 420) {
      this.position.y = 420;
      this.velocity.y = Math.min(0, this.velocity.y);
    }

    // --- breathe ---
    this.attackCooldown -= dt;
    if (pad.pressed('attack') && this.attackCooldown <= 0) {
      this.attackTimer = 0.26;
      this.attackCooldown = 0.5;
      this._doBreath(world, hud);
    }
    if (this.attackTimer > 0) this.attackTimer -= dt;

    // Dive-bomb: flying low and fast scatters everything you pass over â€”
    // except bamboo, which is katana-only.
    if (Math.hypot(this.velocity.x, this.velocity.z) > 18) {
      for (const p of world.props) {
        if (p.katanaOnly) continue;
        const dx = p.group.position.x - this.position.x;
        const dz = p.group.position.z - this.position.z;
        const dy = this.position.y - p.group.position.y;
        if (dy > 6 || dy < -2) continue;
        if (dx * dx + dz * dz > 30) continue;
        const push = new THREE.Vector3(dx, 0, dz).normalize();
        if (p.knock(push, 1.5) && !p.scored) {
          p.scored = true;
          this.score += p.points ?? 10;
          hud?.onMischief(this, p);
        }
      }
    }

    /* The kitten drives; the dragon is hung off the kitten's position so that
       the SEAT lands where the player is. Solving it the other way (dragon
       first, rider offset from it) makes the player's own position lag the
       thing they're steering, and the camera follows the player. */
    const d = this.mount;
    d.facing = this.facing;
    const seat = d.seatOffset();
    d.position.set(
      this.position.x - seat.x,
      this.position.y - seat.y,
      this.position.z - seat.z
    );

    if (pad.pressed('mount')) {
      /* Ryuuseki has no perch to go back to and cannot be lost — there is one
         of him and he was summoned to the town. He simply stops where he is
         and waits, with his mount ring lit, which is also what a gunner still
         aboard needs him to do. */
      if (d.pilot !== undefined) {
        d.pilot = null;
        this.mount = null;
        this.velocity.set(0, 0, 0);
        this.dismountEase = 1;
        hud?.sfx('dismount');
        hud?.onRyuDismount?.(this);
        return;
      }
      /* If there is ANY ground under you, the dragon comes down to it â€” right
         beside you if you stepped off, following you down if you bailed out
         from height. It only goes back to its own perch when you let go over
         open sky, where there's nowhere for it to land. */
      const g = world.heightAt(this.position.x, this.position.z);
      const bailedHigh = !!g && this.position.y - g.y > 12;
      if (!g) d.returnHome();
      else if (bailedHigh) d.flyTo(this.position.x, this.position.z);
      else d.landAt(this.position.x, this.position.z);
      const high = !g;

      this.mount = null;
      this.velocity.y = Math.min(this.velocity.y, 0);
      this.dismountEase = 1;
      hud?.sfx('dismount');
      hud?.toast(
        high ? `${this.name} let go over the sky! ${d.name} flies home`
          : bailedHigh ? `${this.name} jumped! ${d.name} is coming down`
            : `${this.name} hopped off`,
        this.index
      );
    }
  }

  _respawn(world) {
    const g = world.heightAt(0, 30);
    this.position.set(this.style.spawnX, (g ? g.y : 10) + 2, 30);
    this.velocity.set(0, 0, 0);
  }

  /**
   * Draw the ward.
   *
   * IT HAS TO SAY WHEN IT IS ABOUT TO GO OUT. A bubble that vanishes without
   * warning teaches nothing except that the game is unfair — the last 0.7s
   * flicker at 9Hz, which is early enough to run and unmistakable next to the
   * steady breath it holds for the rest of its life. The white flash on a
   * blocked blow is the other half: a shield you cannot tell is working is
   * indistinguishable from a sister who keeps missing.
   */
  _updateWardMesh(dt) {
    /* THE SHARDS ARE UPDATED BEFORE THE EARLY RETURN, and that is the whole
       reason they are a separate group. They only ever fly while the bubble is
       GONE — a smash drops the block on the same frame it starts them — so
       anything below `if (!this.warded) return` would be drawn for exactly
       zero frames. Found by writing it the other way round first. */
    if (this.wardBreakT > 0) {
      this.wardBreakT = Math.max(0, this.wardBreakT - dt);
      const t = 1 - this.wardBreakT / (WARD.breakT || 0.45);   // 0 -> 1
      this.wardBurst.position.set(0, this.height * 0.55, 0);
      for (const m of this.wardShards) {
        /* OUT FAST AND THEN COASTING, rather than at a constant speed: a
           `sqrt` ease is what a thing that was shoved looks like, and a linear
           one reads as a diagram of an explosion. They keep going after they
           have faded out, which nobody sees and costs nothing to be honest
           about. */
        const d = WARD.radius * (0.9 + 1.0 * Math.sqrt(t));
        m.position.copy(m.userData.dir).multiplyScalar(d);
        m.rotation.x += dt * m.userData.spin;
        m.rotation.z += dt * m.userData.spin * 0.7;
        /* Fading on a square keeps them solid through the first third, which
           is the part that has to be legible, and then gets out of the way. */
        m.material.opacity = 0.95 * (1 - t) * (1 - t);
        m.scale.setScalar(1 - 0.35 * t);
      }
      if (this.wardBreakT === 0) this.wardBurst.visible = false;
    }

    /* THE SPARK, AND IT RUNS THE SHARDS' MATHS BACKWARDS. Same `t` from 0 to
       1, same tumble, but the radius falls instead of rising and the opacity
       peaks in the middle rather than at the start — energy arriving has to
       get brighter as it lands, or it reads as the last of something leaving.

       DRAWN OUT HERE WITH THE SMASH, ABOVE THE `!warded` RETURN, for the same
       reason: she is not blocking when this plays — being able to block again
       is the entire message — so an effect inside the bubble's own guard would
       never be drawn at all. */
    if (this.wardReadyT > 0) {
      this.wardReadyT = Math.max(0, this.wardReadyT - dt);
      const t = 1 - this.wardReadyT / (AEGIS.ready || 0.5);      // 0 -> 1
      this.wardSpark.position.set(0, this.height * 0.55, 0);
      for (const m of this.wardSparks) {
        m.position.copy(m.userData.dir)
          .multiplyScalar(WARD.radius * 1.5 * (1 - t) * (1 - t));
        m.rotation.y += dt * m.userData.spin;
        m.rotation.x += dt * m.userData.spin * 0.6;
        m.material.opacity = 0.95 * Math.sin(Math.PI * t);
        m.scale.setScalar(0.6 + 0.8 * t);
      }
      if (this.wardReadyT === 0) this.wardSpark.visible = false;
    }

    this.wardMesh.visible = this.warded;
    if (!this.warded) return;
    this.wardMesh.position.set(0, this.height * 0.55, 0);

    /* IT HAS TO SAY WHEN IT IS ABOUT TO RUN OUT. A block that vanishes without
       warning teaches nothing except that the game is unfair, and now that it
       is held rather than toggled she has no press to count from — the only
       clock she has is the bubble itself. The last 0.6s of the two seconds
       flicker at 9Hz, which is early enough to let go and unmistakable next to
       the steady breath it holds for the rest of its life. */
    const left = Math.max(0, this._wardCeiling() - this.wardUsed);
    const dying = this.wardOn && left < 0.6;
    const flick = dying ? 0.45 + 0.55 * (Math.sin(left * 56) > 0 ? 1 : 0) : 1;
    const hit = (this.wardFlash ?? 0) > 0 ? 1 + this.wardFlash * 2.4 : 1;
    /* The tail fades rather than holding full strength: it is still protecting
       her, and it should look like a bubble collapsing rather than one that
       stayed up after she let go. */
    const tail = this.wardOn ? 1 : this.wardTail / WARD.tail;
    this.wardShell.material.opacity = 0.22 * flick * hit * tail;
    this.wardCore.material.opacity = 0.10 * flick * hit * tail;
    const born = Math.min(1, this.wardUsed / 0.18);
    this.wardMesh.scale.setScalar(born * (1 + Math.sin(this.wardUsed * 3.1) * 0.04));
    this.wardShell.rotation.y += dt * 0.7;
    this.wardCore.rotation.y -= dt * 1.1;
  }

  _updateFeedback(dt, world) {
    /* ---- pick the animation row ----
       Attack wins over everything so a slash always reads, then airborne,
       then walking. Ordered by what the player most needs to see. */
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const a = this.anim;
    /* A short airborne threshold on top of the ground snapping above. Snapping
       fixes the physics; this makes the pose robust to any single-frame blip
       that still gets through â€” dropping off a kerb shouldn't strobe. Rising
       fast is exempt so a real jump reads instantly. */
    const airborne = !this.onGround && ((this.airTime ?? 0) > 0.09 || this.velocity.y > 1);
    /* Sitting on a panda holds the IDLE pose. There is no drawn sit, and the
       walk cycle is the wrong lie — legs pumping while the panda does the
       running reads as the kitten sliding along above it. Idle plus the
       animal's own waddle underneath is what sells being carried. */
    /* Eating holds the ATTACK row for the whole two seconds. There is no drawn
       chew and there is not going to be one — see the note below on why no
       kitten sheet in this project gets new rows — and the attack pose is the
       one where her paws are already up in front of her. The wobble under it
       is what turns a held pose into a cat working at something. */
    if (this.eatT > 0) this.sprite.row = a.attack;
    else if (this.attackTimer > 0) this.sprite.row = a.attack;
    else if (this.mount || airborne) this.sprite.row = a.jump;
    else if (this.pandaMount) this.sprite.row = a.idle;
    else if (speed > 0.9) this.sprite.row = a.walk;
    else this.sprite.row = a.idle;

    // Squash & stretch on jumps, landings and hits.
    this.squash *= 1 - Math.min(1, dt * 7);
    const bob = this.onGround ? Math.abs(Math.sin(this.stepPhase)) * 0.06 : 0;
    const sq = this.squash;

    /* Secondary motion on top of the drawn poses: a breathing rise when idle,
       and a lean that rocks in time with the footstep bob when walking. One
       drawn walk frame plus this reads as a walk cycle; without it the pose
       just slides along the ground. */
    this._updateWardMesh(dt);

    this.idlePhase = (this.idlePhase ?? 0) + dt * 2.1;
    const idling = this.onGround && !this.mount && speed <= 0.9 && this.attackTimer <= 0;
    const breathe = idling ? Math.sin(this.idlePhase) * 0.018 : 0;
    const lean = this.onGround && speed > 0.9 ? Math.sin(this.stepPhase) * 0.05 : 0;
    this.sprite.mesh.rotation.z = lean;

    /* The chew. Squash on a fast beat, on top of everything else — she is
       stock still for two seconds (the pad she is handed is dead), so without
       this the eat reads as the game having frozen rather than as her eating.
       It is deliberately the same squash-and-stretch the jump and the landing
       use, one octave up: the vocabulary is already established. */
    const chew = this.eatT > 0 ? Math.sin(this.idlePhase * 9) * 0.09 : 0;

    /* THE CROSS SLASH'S WIND-UP, AS A CROUCH. She plants for CROSS.wind before
       the first cut and there is no drawn pose for it — and "stood perfectly
       still" is not a tell, it is what a disconnected pad looks like. She
       compresses instead, deeper as the wind-up runs down, and is released by
       the first cut. Deliberately the same squash-and-stretch as the jump, the
       landing and the chew: that vocabulary already means "something is about
       to happen to this cat", and a new pose would need art nobody drew.
       The whole point of the wind-up is that three sisters can SEE it coming
       (see CROSS.wind), so this is the feature, not a flourish on it. */
    const wind = this.triWindT > 0
      ? (1 - this.triWindT / CROSS.wind) * 0.18
      : 0;

    this.sprite.mesh.scale.set(
      1 + sq * 0.22 + bob * 0.4 - breathe + chew + wind,
      1 - sq * 0.24 + bob + breathe - chew - wind,
      1
    );
    /* Riding: the seat is solved in _updateFlight, so the sprite sits at the
       group origin â€” but it has to RIDE THE WINGBEAT. Without this the kitten
       hangs perfectly still while the dragon heaves up and down underneath
       it, which instantly reads as two separate drawings rather than one
       creature carrying another. */
    /* Riding a panda raises the DRAWING onto its back and leaves the kitten
       herself on the ground, where all the ground physics still expect her —
       see Panda.seatHeight. The dragon needs no equivalent because flight
       moves the whole entity. */
    /* `?? 0` is load-bearing, not defensive noise. `flapBob` is a storm-dragon
       field; Ryuuseki has no wings and did not have one, so this produced
       `undefined`, NaN'd the rider's local Y, and three.js silently refused to
       draw her — the PILOT was invisible on the legendary dragon while the
       gunner, who rides through `rideAlong` and never touches this line, was
       fine. It read exactly like a depth-sorting problem and was not one. Any
       future mount that misses a field must fall back, not vanish. */
    /* `mount ?? rideAlong`, so BOTH seats ride the animal's motion. Reading
       `mount` alone meant the gunner sat perfectly still on a creature that was
       swelling underneath her — two drawings sliding past each other, which is
       the exact thing flapBob exists to prevent, and it was only ever wired up
       for the seat that steers.
       `?? 0` is load-bearing too: flapBob is a storm-dragon field, and when
       Ryuuseki lacked one this line NaN'd the rider's local Y and three.js
       silently refused to draw her. Any mount missing a field must degrade,
       not vanish. */
    const ride = this.mount ?? this.rideAlong;
    this.sprite.mesh.position.y = ride ? (ride.flapBob ?? 0)
      : this.pandaMount ? this.pandaMount.seatHeight + this.pandaMount.bounce : 0;

    /* ---- what being hit LOOKS like ----

       NO NEW ART, AND THAT IS A DECISION RATHER THAN A SHORTCUT. The obvious
       answer to "how do we show a hit" is to generate a hurt pose and a KO
       pose and add two rows to each sheet. Both live sheets are 4x8-or-10
       turnarounds whose rows have to agree with each other about which way
       the character turns, and one of the two sheets in this project is
       already unusable because its rows DON'T (see frost_grid_v2 in
       HANDOFF). Regenerating either to add rows risks the direction mapping
       that every one of the sprite checks in world-check exists to protect —
       to buy two poses that the material can express anyway.

       So all three states are transforms of the drawn cell:
         hit    a hot flash and a recoil lean, away from the blow
         invuln a hard flicker — the arcade convention, and the only one a
                nine-year-old already knows means "can't be hit"
         KO     laid flat on her side, darkened, still visibly herself */
    /* Both live kitten sheets ship untinted (`tint` defaults to white and
       main.js passes none), so this block owns the material colour outright.
       If a sheet ever DOES want a tint, it has to become the rest value here
       rather than a one-off `set` in the constructor — otherwise the first
       hit would wash it out permanently. */
    const mat = this.sprite.mat;
    const base = 1;

    /* SHE REALLY IS TRANSLUCENT AS AN ANGEL, and the first pass wrongly
       concluded she could not be. The reasoning was the invulnerability
       flicker's, which is correct for what IT does and does not generalise:
       `alphaTest: 0.35` is tested against the fragment alpha with
       `material.opacity` already folded in, so opacity *below* 0.35 kills the
       whole sprite — but `ANGEL_ALPHA` (0.62) sits comfortably above it and
       simply makes her see-through. The flicker fades to zero, which is why it
       cannot do this; the ghost never goes near the threshold. Reset to 1 for
       everybody else, unconditionally, or a kitten who was ever an angel stays
       half-there for the rest of the afternoon. */
    mat.opacity = this.angel ? ANGEL_ALPHA : 1;

    if (this.angel) {
      /* WASHED OUT, NOT TINTED. `toneMapped: false` hands the colour straight
         through, so pushing all three channels past 1 blows her toward white
         the way the hit flash blows her toward red — which is what makes a
         pale kitten read as pale from ninety-six units away instead of just
         looking slightly cold. The blue is a hair ahead of the red, so the
         wash is moonlight rather than paper. */
      const shimmer = 1 + Math.sin((this.idlePhase ?? 0) * 3.2) * 0.07;
      mat.color.setRGB(base * 1.18 * shimmer, base * 1.30 * shimmer, base * 1.55 * shimmer);
      this.sprite.mesh.rotation.z = lean;
      this.sprite.mesh.visible = true;
    } else if (this.ko) {
      /* Flat on her back. The JUMP row, not idle: it is the one pose with the
         limbs away from the body, and an idle cell rotated 90 degrees reads
         as a cat standing on a wall rather than as a cat who has been knocked
         over. Which WAY she falls follows the blow. */
      this.sprite.row = a.jump;
      const fall = Math.min(1, (KO_TIME - this.koT) / 0.35);
      this.sprite.mesh.rotation.z = (this.hitLean || 1) * 1.42 * fall;
      this.sprite.mesh.position.y -= this.height * 0.30 * fall;
      mat.color.setRGB(base * 0.52, base * 0.46, base * 0.55);
      this.sprite.mesh.visible = true;
    } else if (this.flashT > 0) {
      /* Brighter than white. `toneMapped: false` on this material means the
         renderer hands the colour straight through, so pushing the red
         channel past 1 blows the sprite out into a hot flash instead of
         merely tinting it — a tint at these sizes is invisible. */
      const f = this.flashT / 0.3;
      mat.color.setRGB(base * (1 + f * 1.5), base * (1 - f * 0.42), base * (1 - f * 0.5));
      this.sprite.mesh.rotation.z = lean + (this.hitLean || 1) * 0.42 * f;
      this.sprite.mesh.visible = true;
    } else if (this.invulnT > 0) {
      /* A HARD FLICKER, NOT A FADE. Fading is the natural reach and it does
         not work here: the material runs `alphaTest: 0.35`, so any opacity
         below that discards every pixel of the sprite at once and she does
         not fade out, she disappears in one step. Toggling visibility is
         honest about what the material can actually do, and it is also the
         convention every game a kid has played uses for exactly this. */
      mat.color.setRGB(base, base, base);
      this.sprite.mesh.visible = Math.floor(this.invulnT * 16) % 2 === 0;
    } else {
      mat.color.setRGB(base, base, base);
      this.sprite.mesh.visible = true;
    }

    // Slash arc: snap out and fade. The panda draws its own claw marks, so the
    // katana arc stays sheathed while she's riding — two overlapping arcs on
    // one swing just reads as a smear.
    /* Sheathed whenever she is riding ANYTHING. The panda draws its own claw
       marks and a dragon breathes; in both cases the katana arc is a second
       overlapping effect for one button press. On Ryuuseki it was unmissable —
       a two-metre sword swipe going off in the middle of a thirty-metre dragon
       every time the beams fired. The dragon case was there before he was, it
       was just small enough on a storm dragon to look like part of the breath. */
    const riding = this.pandaMount || this.mount || this.rideAlong;
    if (this.attackTimer > 0 && !riding) {
      const t = 1 - this.attackTimer / 0.26;
      this.slash.visible = true;
      this.slash.material.opacity = (1 - t) * 0.9;
      /* The arc geometry is a ring wedge centred on its own local +X. After
         the -90 degree X rotation that lays it flat, local +X points along
         world +X, which is a facing angle of PI/2 â€” not 0. So the yaw needs
         that quarter turn removed, and it needs +facing, not -facing: the old
         `-facing` mirrored the arc across the diagonal, which read as the
         slash coming out sideways or backwards depending on which way you
         were walking. */
      this.slash.rotation.y = this.facing - Math.PI / 2 + (1 - t) * 0.7;
      /* THE ARC IS DRAWN AT HER REAL REACH, WHICH IS NOT WHAT IT WAS DOING.
         This read `clan?.buff?.reach` directly — so Riverclaw's long blade grew
         the picture and the Long Cut orbs, which multiply the same hitbox and
         STACK, did not. A kitten wearing three of them swung a normal-looking
         arc and hit you from a metre and a half outside it, which reads as the
         game cheating rather than as her having earned something.

         `_doSlash`'s own comment two hundred lines up has claimed for a while
         that "the drawn arc grows with both", and it was only half true. It is
         one accessor now, so the picture and the hitbox cannot disagree by
         construction — which is the whole reason `_reach()` exists.

         DIVIDED BY `BASE_REACH` because this is a SCALE on a ring authored at
         the unsworn size, not a length. */
      this.slash.scale.setScalar((0.7 + t * 0.9) * (this._reach() / BASE_REACH));
    } else {
      this.slash.visible = false;
    }

    // The panda carries its own ring in the same colour, so two would stack.
    this.marker.visible = !this.mount && !this.pandaMount;
    /* THE CLAN RING GOES WHEREVER HER OWN RING GOES. It used to be switched on
       once, at the moment she swore, and then left alone forever — so it rode
       up onto a dragon with her and hung in the air under a mount that has its
       own markings. Derived from `this.clan` every frame instead: the two
       rings are one piece of furniture with two colours in it, and a rule
       computed fresh cannot go stale the way a rule set once does. */
    this.clanRing.visible = !!this.clan && this.marker.visible;

    /* THE EDGE WARNING GOES ON HER FEET, because that is what is about to
       leave the stage. `Tournament._updateOut` sets `nearEdge` inside the
       last few units of deck and rules at the line, and the gap between the
       two is the entire point: a thirty-point penalty that arrives with no
       warning reads as the game taking health off you for no reason.
       Her own colour ring is already the thing a player uses to find herself
       in a scrap, so flashing THAT red needs no new object and no new place
       to look — she is watching it anyway. */
    const edgeLit = !!(this.nearEdge && this.hpGroup.visible);
    if (edgeLit) {
      /* SAVED ON THE WAY IN, not reconstructed on the way out. This ring is
         also the clan badge — `_updateGround` recolours it the moment she
         swears an oath — so restoring it to "her player colour" would
         silently strip a Thunderpaw kitten's green the first time she backed
         toward the edge of the ring. Remember what it actually was. */
      if (!this._edgeLit) this._edgeSaved = this.marker.material.color.getHex();
      const beat = Math.sin((this.idlePhase ?? 0) * 11) > 0;
      this.marker.material.color.set(beat ? 0xff2a20 : 0xfff0a0);
      this.marker.material.opacity = 0.95;
      this.marker.scale.setScalar(1.25);
    } else if (this._edgeLit) {
      this.marker.material.color.set(this._edgeSaved ?? this.style.colour);
      this.marker.material.opacity = 0.75;
      this.marker.scale.setScalar(1);
    }
    this._edgeLit = edgeLit;

    /* --- the meal takes the whole drawing over ---

       SHE TURNS TO FACE THE CAMERA AND STAYS THERE for the two seconds, which
       is what makes this read as a moment rather than as a stance. It is the
       one pose in the game that ignores her heading entirely: `eatPose` is a
       single front-facing cell that can never flip, so whichever way she was
       running when she grabbed the thing, she is hunched over facing you while
       she eats it — and `Critter._mealSpot` puts the animal between her and the
       lens, at `EAT_MOUTH_Y`, for the same reason.

       Applied at the END, after every other branch above has had its say about
       the ordinary sprite, so there is exactly one place that decides which of
       the two drawings is on screen. The colour and opacity are copied across
       so anything the material is doing — a hit flash landing on the frame the
       meal is interrupted — carries onto the pose instead of popping. */
    if (this.eatPose) {
      const eating = this.eatT > 0;
      this.eatPose.visible = eating;
      if (eating) {
        this.sprite.mesh.visible = false;
        this.eatPose.mesh.scale.set(1 + chew * 1.4, 1 - chew * 1.4, 1);
        this.eatPose.mesh.rotation.z = Math.sin((this.idlePhase ?? 0) * 4.5) * 0.03;
        this.eatPose.mat.color.copy(mat.color);
        this.eatPose.mat.opacity = mat.opacity;
      }
    }

    /* --- and the same again for the blessing ---
       AFTER THE MEAL, so that if the two ever overlap the meal wins. They
       cannot today — nothing hands out a star during a feast — but "which
       drawing is on screen" has to have one answer and this is where it is
       decided, so the ordering is written down rather than left to whichever
       branch happened to be last.

       SHE RISES ONTO HER TOES AS IT ARRIVES AND SETTLES. The lift is taken
       from the same `t` the star's own rise uses, so the cat and the thing she
       is reaching for move together; a pose that snapped to full height on
       frame one would read as a sprite swap, which is exactly what it is and
       exactly what it must not look like. */
    if (this.blessPose) {
      const blessed = this.aloftT > 0 && this.eatT <= 0
        && this.onGround && !this.mount && !this.rideAlong && !this.ko;
      this.blessPose.visible = blessed;
      if (blessed) {
        this.sprite.mesh.visible = false;
        const dur = this.aloftDur || 2;
        const t = 1 - this.aloftT / dur;
        const rise = Math.sin(Math.min(1, t / 0.22) * Math.PI * 0.5);
        const sway = Math.sin(t * 7.5) * 0.02 * rise;
        this.blessPose.mesh.scale.set(1 - rise * 0.04, 1 + rise * 0.07, 1);
        this.blessPose.mesh.rotation.z = sway;
        this.blessPose.mat.color.copy(mat.color);
        this.blessPose.mat.opacity = mat.opacity;
      }
    }

    /* --- 瞬 Flash Step: concentrate, then stop being drawn ---

       TWO STATES OUT OF ONE CLOCK. `dodgeT` is running and the teleport has
       not fired yet, so she is standing there with her fingers to her forehead;
       `dodgePlaced` is true, so she is GONE and nothing of her is on screen at
       all. The second is not a fade: this material runs `alphaTest: 0.35`, so
       any opacity under that discards every pixel at once — a fact this file
       already writes down twice, for the invulnerability flicker and for the
       angel. Fading out would be a hard cut pretending to be a fade, so the
       vanish is an honest cut with the smoke and the decoy from
       `systems/dodgefx.js` over the top of it doing the work a fade would.

       THE SHADOW AND THE MARKER GO WITH HER. They are drawn further down and
       switched off again there — a shadow on the floor and a coloured ring
       under nobody would say exactly the thing the move exists to stop saying,
       which is where she is.

       LAST, AFTER THE MEAL AND THE BLESSING, so that the ordering of "which
       drawing is on screen" stays written down in one place. It cannot collide
       with either today — `_startDodge` refuses mid-meal, and nothing hands out
       a star during one — but this is the branch that wins if it ever does,
       because being invisible is not a pose you can lose an argument about. */
    const gone = this.dodgeT > 0 && this.dodgePlaced;
    if (this.warpPose) {
      const winding = this.dodgeT > 0 && !this.dodgePlaced;
      this.warpPose.visible = winding;
      if (winding) {
        this.sprite.mesh.visible = false;
        /* SHE GATHERS AND SETTLES. The scale is taken from how far through the
           wind-up she is, so the pose arrives at full size rather than popping
           on — the same trick the blessing uses, and for the same reason. */
        const t = 1 - (this.dodgeT - DODGE.invuln * (1 - DODGE.commit))
          / Math.max(0.0001, DODGE.invuln * DODGE.commit);
        const k = Math.min(1, Math.max(0, t));
        this.warpPose.mesh.scale.set(1 - k * 0.05, 1 + k * 0.05, 1);
        this.warpPose.mesh.rotation.z = Math.sin(k * 34) * 0.012 * k;
        this.warpPose.mat.color.copy(mat.color);
        this.warpPose.mat.opacity = mat.opacity;
      }
    }
    if (gone) {
      this.sprite.mesh.visible = false;
      if (this.warpPose) this.warpPose.visible = false;
      if (this.eatPose) this.eatPose.visible = false;
      if (this.blessPose) this.blessPose.visible = false;
      this.slash.visible = false;
    }

    // Blob shadow tracks the ground below and shrinks with altitude.
    const g = world.heightAt(this.position.x, this.position.z, this.position.y);
    if (g) {
      const drop = this.position.y - g.y;
      this.shadow.visible = drop < 60;
      this.shadow.position.y = -drop + 0.05;
      const k = Math.max(0.2, 1 - drop / 60);
      this.shadow.scale.setScalar(0.6 + k * 0.6);
      this.shadow.material.opacity = 0.4 * k;
      this.marker.position.y = -drop + 0.07;
      /* THE CLAN RING IS ON THE GROUND, NOT ON HER FEET. It is parented to
         `group` like the marker is, and the marker has always been pushed back
         down to the terrain here — the clan ring was left at its constructor
         height, so it stayed glued to her paws and sailed off into the sky
         with every jump. Reported as "it attaches to the players feet instead
         of the ground/shadow beneath the player".
         A HAIR ABOVE THE MARKER because it is the inner of the two concentric
         rings and they are drawn on the same terrain; the same 0.01 the
         constructor already used. */
      this.clanRing.position.y = -drop + 0.08;
    } else {
      this.shadow.visible = false;
      this.marker.visible = false;
      this.clanRing.visible = false;
    }
    /* AND NOTHING ON THE FLOOR GIVES HER AWAY EITHER. Written here rather than
       folded into the three assignments above because it is a different rule
       from "is there ground under her" — it is "is she anywhere" — and the
       block above has to keep answering its own question so that one frame of
       being over the void cannot leave a ring switched on. */
    if (gone) {
      this.shadow.visible = false;
      this.marker.visible = false;
      this.clanRing.visible = false;
    }
  }

  _updateCamera(dt) {
    // Look slightly ahead of the kitten so you can see where you're going.
    const flying = !!(this.mount || this.rideAlong);
    const lead = flying ? 0.55 : this.pandaMount ? 0.42 : 0.25;
    /* On a big mount, look at and orbit THE RIDERS AS DRAWN.
       Their `position` is the animal's centre — the seats are draw offsets —
       so aiming at "the rider" and aiming at "the dragon" are the same point,
       which is why pulling the camera back never re-framed anything. The place
       a player is actually watching is the pair of kittens on his neck.
       `camScale` marks the mounts that want this. */
    const big = (this.mount ?? this.rideAlong);
    const mid = big?.camScale ? big.ridersMidpoint() : null;
    const aim = mid ?? this.position;
    // Aim at where the kitten is DRAWN, which on a panda is up on its back.
    const want = new THREE.Vector3(
      aim.x + this.velocity.x * lead,
      aim.y + (mid ? 0 : (flying ? 2.5 : 1.4))
        + (this.pandaMount ? this.pandaMount.seatHeight : 0),
      aim.z + this.velocity.z * lead
    );
    const follow = flying ? 3.2 : 7.5;
    this.camTarget.lerp(want, Math.min(1, dt * follow));

    // Distance grows with speed and altitude â€” that's the Dragon Ball Z zoom.
    const speed = this.velocity.length();
    /* Riding gets its own range, between the walking camera and the flying
       one — which is exactly where the speed sits. The walking camera tops out
       at 34 units, close enough that at a panda's pace the next building is on
       screen only after you have hit it. It also has to start further back
       than the walking one whatever the speed, because the kitten is sitting
       four units up and the animal under her is another six wide. */
    /* The flying range is sized for a storm dragon, whose quad is about 24
       units across. The ride distance scales with whatever you are actually on
       rather than assuming every flying thing is the same size — `mountScale`
       is 1 for a storm dragon by construction.

       A mount may ask for MORE than its size implies, and Ryuuseki does. A
       yaw-only billboard only really faces you at its centre; the further its
       edges are off the view axis the more the perspective keystones them, and
       on a creature nearly thirty units wide that reads as the whole dragon
       being rotated twenty degrees away from you rather than as perspective.
       Pulling the camera back shrinks the angle he subtends, which is the only
       thing that actually fixes it short of abandoning yaw-only billboards —
       and it is also what lets you see the ground he is flying over. */
    const seat = this.mount ?? this.rideAlong;
    const mountScale = seat ? (seat.camScale ?? Math.max(1, seat.quad / 24)) : 1;
    let wantDist = seat
      ? THREE.MathUtils.clamp((46 + speed * 1.5) * mountScale, 46 * mountScale, 320)
      : this.pandaMount
        ? THREE.MathUtils.clamp(28 + speed * 0.6, 28, 52)
        : THREE.MathUtils.clamp(24 + speed * 0.35, 24, 34);
    let pitch = flying ? CAM_PITCH_AIR : CAM_PITCH_GROUND;

    // Ease into (and out of) a focus area.
    const active = this.focus && !flying;
    this.focusT += ((active ? 1 : 0) - this.focusT) * Math.min(1, dt * 2.2);
    let yaw = CAM_YAW;
    if (this.focusT > 0.001 && this.focus) {
      const t = this.focusT;
      wantDist = THREE.MathUtils.lerp(wantDist, this.focus.dist, t);
      pitch = THREE.MathUtils.lerp(pitch, this.focus.pitch, t);
      yaw = THREE.MathUtils.lerp(CAM_YAW, this.focus.yaw ?? CAM_YAW, t);
      // Slide the look-at toward the middle of the diagram so it stays centred
      // however far around the circle the player walks.
      this.camTarget.lerp(this.focus.centre, Math.min(1, dt * 3.4) * t);
    }

    /* THE STAR SHOT. Applied on top of whatever the camera was already doing
       rather than through `setFocus`, because `focus` is the Dojo's and the
       two overlap: the dojo island has a star on it, and a kitten can be
       standing on the unit circle when she finds it. Composing means the shot
       pulls in from wherever the dojo had put the camera instead of the two
       systems fighting over one field.
       Eased in and out on a sine so it never snaps — the pose is two seconds
       long and half a second of that is the camera moving. */
    if (this.aloftT > 0) {
      const dur = this.aloftDur || 2;
      const k = Math.sin(Math.min(1, (1 - this.aloftT / dur) / 0.25) * Math.PI * 0.5)
        * Math.min(1, this.aloftT / 0.45);
      wantDist = THREE.MathUtils.lerp(wantDist, flying ? wantDist * 0.62 : 12, k);
      pitch = THREE.MathUtils.lerp(pitch, 0.42, k);
      /* AND IT LOOKS HIGHER, or the shot frames the cat and crops the prize.
         The ordinary camera aims 1.4 units over her feet, which is her chest;
         the thing she is holding up is at `height * 1.4` above them, so at the
         12 units this shot pulls in to it lands hard against the top of the
         pane and goes behind the score pill. Found by watching a clan emblem
         disappear under EMBER's own HUD chip.
         Half her height splits the difference: her face and the emblem both
         sit inside the frame with room over the top. It rides the same `k` as
         the pull-in, so it eases in and out with the rest of the shot, and it
         is a lerp toward the RAISED target rather than an offset added to
         `camTarget` — adding would accumulate every frame the hold is up. */
      this.camTarget.y = THREE.MathUtils.lerp(
        this.camTarget.y, want.y + this.height * 0.5, Math.min(1, dt * follow) * k
      );
    }

    this.camYaw = yaw;

    /* AND THEN THE SHAPE OF HER PANE, WHICH EVERY DISTANCE ABOVE IGNORES.
       All of them — the walking clamp, the panda's, the mount's, the Dojo's
       and the star shot's — were tuned on a full-width screen, and in the
       62/38 split a kitten on her own is drawing into 730x1080. She sees 38%
       of the world across that a quadrant of the same screen would, which is
       what "the camera is zoomed in too much, it should be pulled out more"
       means from inside that column.

       APPLIED LAST AND TO EVERYTHING, deliberately. It is not a property of
       walking or of flying, it is a property of the RECTANGLE, so every
       framing above pays it equally — otherwise the pull-back would appear
       and disappear as she got on a dragon or walked into the Dojo, which is
       the camera lurching for a reason nothing on screen explains.

       `Math.max(1, ...)` and the finite test are the degrade rule: this field
       is written from outside, and a bad one must cost the widening and not
       the position. It is exactly 1 for one pane, for even panes and for the
       whole two-player game — see `paneWiden`, which refuses to answer for an
       even split precisely so that game cannot move. */
    const pw = Number.isFinite(this.paneWiden) ? Math.max(1, this.paneWiden) : 1;
    wantDist *= pw;

    /* Easing back down after a dismount. The flight camera sits up to 130
       units out and the ground camera at 24, so snapping between them at the
       normal follow rate is a lurch right at the moment the player is trying
       to work out where they landed. Decay the ease so it only slows the
       first second or so. */
    this.dismountEase = Math.max(0, (this.dismountEase ?? 0) - dt * 0.9);
    const zoomRate = this.mount ? 1.6 : THREE.MathUtils.lerp(4, 1.5, this.dismountEase);
    this.camDist += (wantDist - this.camDist) * Math.min(1, dt * zoomRate);

    this._offset.set(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch)
    ).multiplyScalar(this.camDist);

    this.camera.position.copy(this.camTarget).add(this._offset);
    this.camera.lookAt(this.camTarget);
  }
}
