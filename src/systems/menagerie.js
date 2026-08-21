import * as THREE from 'three';
import {
  Critter, CRITTERS, EAT_TIME, MOUTH_TIME, CATCH_RADIUS,
} from '../entities/critter.js';
import { MAX_SLOTS } from '../core/input.js';

/** One entry per seat the game can deal, whoever is actually in them. */
const seats = (v) => Array.from({ length: MAX_SLOTS }, () => v);

/* ---------------------------------------------------------------------------
   The Menagerie — who is on the deck, and what happens when you grab one.

   ONE SYSTEM OWNS BOTH HALVES, AND IT HAS TO. Spawning and eating look like
   two features and are one: the spawn budget is what decides whether the
   fifteen-second feast between rounds has anything in it, and the eat is what
   frees the slot the next spawn goes into. Split across two files, the pair
   that has to agree — "there is a snack within reach right now" — becomes two
   opinions that disagree exactly when the deck is busy.

   IT IS THE ONLY GATE ON EATING, in the same way `Game.strikePlayers` is the
   only gate on the two of them hurting each other. `Player._doSlash` calls
   `Game.strikeCritters` on EVERY swing in the game — market square, bamboo
   grove, hillside — and the first thing this does is ask whether a tournament
   is running. There are no critters anywhere else, so the check is belt and
   braces; it is written anyway because "there is nothing to hit out there" is
   a fact about content, and this is a rule.

   THE HOLD IS READ FROM THE REAL PAD, and that is the whole reason the eat
   state lives here rather than on the Player. Eating freezes her, and the
   freeze is the game's dead-pad trick — `Game` swaps in a controller that
   reports nothing. A hold-detector reading the pad the player was handed would
   see the button come up on the very frame the freeze started and cancel
   itself, every time. This reads `Game.input.players[i]` directly, before the
   swap, so the two mechanisms cannot fight.
--------------------------------------------------------------------------- */

/**
 * The most animals on the deck at once.
 *
 * SIX, AND IT WAS THREE. Three was sized against the first version of the
 * catch, where every animal wanted a different button and finding the right
 * one was most of the job. Now a swing stops anything, so the deck is a place
 * you hunt rather than a puzzle you solve, and three animals spread over 56
 * units of stone meant long stretches with nothing in sight — especially
 * during a fifteen-second feast, where crossing the deck to the only rabbit on
 * it is most of the time you have.
 */
export const MAX_ON_STAGE = 6;
/**
 * The most of ONE species at once.
 *
 * The spawn is otherwise a straight uniform draw — see `_spawn` — and six
 * uniform draws put five or six of a kind on the deck often enough to notice.
 * Half the deck is as far as a run of luck may go.
 */
export const MAX_PER_SPECIES = 3;
/** Seconds before an eaten or escaped animal is replaced. */
export const RESPAWN_MIN = 45;
export const RESPAWN_MAX = 75;

/**
 * How still she has to be to keep eating.
 *
 * She is fed a dead pad while the hold runs so this is nearly always zero —
 * but "nearly" is the point. A kitten who is hit mid-meal keeps the knockback
 * (hit stun deliberately does not brake, see Player), so she really can be
 * sliding across the deck with a rat under her paw, and a meal that survives
 * being thrown across the ring is a meal her sister cannot interrupt.
 */
const STILL_SPEED = 3.0;

export class Menagerie {
  /**
   * @param {object} opts { game, world, art } — `art` is
   *        { rat: {calm, shock}, rabbit: {...}, bird: {...} }, any of which
   *        may be missing. A species with no art simply never spawns.
   */
  constructor({ game, world, art }) {
    this.game = game;
    this.world = world;
    this.art = art ?? {};
    this.scene = game.scene;

    /** Live animals. Empty whenever a tournament is not running. */
    this.list = [];
    /** Seconds until the next spawn. */
    this.spawnT = 0;
    this.on = false;

    /* ---------------------------------------------------------------------
       FOUR PER-PLAYER ARRAYS, SIZED TO THE PARTY THE GAME CAN SEAT.

       All four were written `[null, null]` — two, because two was the only
       number there was when the snacks landed — and the four-player pass did
       not come back for them. Every one of the consequences is silent:

         `releaseAll` iterates `held.length`, so a rat pinned by player 3 is
         never let go at a round reset and `_updatePinned` drags it across the
         deck to her new mark for the rest of the tournament — which is the
         exact bug `releaseAll` exists to prevent, reintroduced for half the
         party;

         `clear` resets to a two-long array, dropping the reference to whatever
         players 3 and 4 were holding without releasing it;

         `eaten[2]++` on `undefined` is NaN, so the third kitten's tally — which
         the toast and the checks read — is not a number.

       `MAX_PLAYERS` rather than `game.players.length`, because the party grows
       while a tournament is not running and an array sized at construction
       would be a second thing to keep in step. Sized once, correct forever.
    --------------------------------------------------------------------- */
    /** Per player: what she is holding, and how long she has been chewing. */
    this.held = seats(null);
    this.chew = seats(0);
    /** How many each kitten has eaten, for the toast and for the checks. */
    this.eaten = seats(0);
    /** Has this kitten been told what a stunned animal is for? See `strike`. */
    this._taught = seats(false);

    this._poofs = [];
    this._poofIx = 0;
  }

  /** Which species this build can actually put on the deck. */
  get species() {
    return CRITTERS.filter((c) => this.art[c.id]?.calm);
  }

  /* -------------------------------- flow --------------------------------- */

  /**
   * A tournament has begun. Stock the deck.
   *
   * The opening round starts with a full house rather than an empty one and a
   * 45-second wait: the first thing either girl has to learn about this feature
   * is that it exists, and she learns it by seeing a rat run past her mark
   * during the countdown.
   */
  start() {
    this.on = true;
    this.eaten = seats(0);
    this._taught = seats(false);
    this.clear();
    /* THE VERY FIRST DECK IS SEEDED WITH ONE OF EACH, and only the first.
       Everything after this is a straight lottery, which is the point — but a
       random opening deck can be six rats, and then the two of them learn that
       the arena has rats in it and nothing else. One of each teaches all three
       difficulties in the first round; the other three slots, and every deck
       after it, are random. */
    for (const s of this.species) {
      if (this.list.length < MAX_ON_STAGE) this._spawn(s);
    }
    this.topUp();
  }

  /** Tournament over, or restart. Nothing survives the ring. */
  stop() {
    this.on = false;
    this.clear();
  }

  clear() {
    for (const c of this.list) c.dispose(this.scene);
    this.list.length = 0;
    this.held = seats(null);
    this.chew = seats(0);
    for (const p of this.game.players ?? []) p.eatT = 0;
  }

  /**
   * Fill the deck to capacity NOW, ignoring the respawn clock.
   *
   * Called at the start of each feast, and it is an exception with a reason.
   * The whole point of the gap between rounds is that the kitten who won it —
   * and is therefore the one carrying damage into the next one — can top
   * herself up. Fifteen seconds spent looking at bare stone because three
   * animals happened to be eaten late in the round is the feature silently not
   * happening, and she has no way to tell that from it being broken.
   */
  topUp() {
    let guard = MAX_ON_STAGE + 2;
    while (this.list.length < MAX_ON_STAGE && guard-- > 0) {
      if (!this._spawn()) break;
    }
    this.spawnT = this._nextDelay();
  }

  _nextDelay() {
    return RESPAWN_MIN + Math.random() * (RESPAWN_MAX - RESPAWN_MIN);
  }

  /** The stone they may not leave, in world coordinates. */
  get deck() {
    const R = this.world.arenaRing;
    return { x: R.x, z: R.z, y: R.y, half: R.half };
  }

  /**
   * Put one animal on the deck. Returns it, or null if there is no room.
   *
   * THE SPECIES IS A STRAIGHT UNIFORM DRAW, AND IT USED TO BE THE OPPOSITE.
   * The first version deliberately preferred a species that was NOT already
   * out there, which with a three-animal cap meant the deck was always exactly
   * one rat, one rabbit and one bird — completely predictable, every round,
   * every tournament. It was solving a real problem (a bird a pair might never
   * meet) with a rule that removed all the variety along with it.
   *
   * Randomness is the whole appeal of a deck you have to look at: some rounds
   * are full of rabbits and some are a rat farm. `MAX_PER_SPECIES` is the only
   * constraint, and it exists so a run of luck cannot delete a whole animal
   * from a tournament — and `start` seeds the opening deck with one of each so
   * the girls meet all three before the lottery takes over.
   *
   * @param {?object} want force a species, used by `start` for that seeding
   */
  _spawn(want = null) {
    const pool = this.species;
    if (!pool.length || this.list.length >= MAX_ON_STAGE) return null;

    const count = (id) => this.list.reduce((n, c) => n + (c.id === id ? 1 : 0), 0);
    const open = want ? [want] : pool.filter((s) => count(s.id) < MAX_PER_SPECIES);
    if (!open.length) return null;
    const spec = open[Math.floor(Math.random() * open.length)];

    const deck = this.deck;
    const spot = this._openSpot(deck);
    const c = new Critter(spec, this.art[spec.id]);
    c.position.set(spot.x, deck.y + (spec.kind === 'flier' ? spec.cruise : 0), spot.z);
    this.scene.add(c.group);
    this.list.push(c);
    return c;
  }

  /**
   * Somewhere on the deck that is not under a kitten's feet.
   *
   * An animal that appears inside the two-second grab radius is a free snack
   * for whoever happened to be standing there, which in a live round is a free
   * 20 health for standing still — the exact opposite of what the risk is
   * meant to be.
   */
  _openSpot(deck) {
    const inner = deck.half - 6;
    let best = { x: deck.x, z: deck.z };
    let bestD = -1;
    for (let i = 0; i < 12; i++) {
      const x = deck.x + (Math.random() * 2 - 1) * inner;
      const z = deck.z + (Math.random() * 2 - 1) * inner;
      let d = Infinity;
      for (const p of this.game.players) {
        d = Math.min(d, Math.hypot(p.position.x - x, p.position.z - z));
      }
      if (d > bestD) { bestD = d; best = { x, z }; }
      if (d > 14) break;
    }
    return best;
  }

  /* ------------------------------- catching ------------------------------- */

  /**
   * A kitten swung. Did she catch anything?
   *
   * Called from `Game.strikeCritters`, which `Player._doSlash` calls on every
   * swing. Returns true when the swing was spent on an animal, purely so the
   * caller can say so.
   *
   * ONE ANIMAL AT A TIME. Without this a kitten with a bird in her mouth pins a
   * rat with the same button, and the pair then have to share one `t`, one
   * freeze and one release — three bugs for a case nobody wanted.
   */
  strike(player, reach) {
    if (!this.on || player.angel || player.ko) return false;
    if (this.held[player.index]) return false;

    /* THE PIN IS RADIUS-ONLY, NO FORWARD ARC. The animal's own ring is what
       tells her she can grab it, and that ring lights on distance — an arc
       test here would put the promise and the rule in two different places,
       so she would see the ring, press the button and get nothing. She is
       reaching down for a rat at her feet, not swinging at a barrel.

       AND IT IS ONLY OFFERED WHEN SHE COULD ACTUALLY HOLD IT — which is the
       fix for "it stunned the rat once and then never again". The pin is
       searched first and it wins out to CATCH_RADIUS (3.4), which is exactly
       the katana's reach, so a kitten CHASING an animal — the normal way you
       meet one — had every swing spent on a pin that `_updateHold` then
       cancelled on the very next frame for moving, or for being in the air.
       The rat bolted, nothing was stunned, and the swing did nothing you could
       see. It stunned the first time only because that first swing tends to be
       the one thrown from a standstill at range.

       So the fast path stays open for a kitten who is standing over the animal
       and takes it outright, and everyone else falls through to the swing —
       which stops it dead and lets her walk up and start the hold properly.
       Running past something and swinging is now the ordinary way to catch it,
       which is also how it reads. */
    let pick = null;
    let pickD = CATCH_RADIUS;
    if (this._canHold(player)) {
      for (const c of this.list) {
        if (!c.pinnable) continue;
        const d = player.position.distanceTo(c.position);
        if (d < pickD) { pick = c; pickD = d; }
      }
    }
    if (pick) {
      this._grab(player, pick);
      return true;
    }

    /* Nothing on the floor — is there something in the air? A rabbit gets
       knocked down and a bird ends up in her mouth, which is the difference
       between the 15 and the 20: one costs a swing and then a hold, the other
       costs a swing and then a place to stand. The vertical window is generous
       because a billboard is a flat drawing with a point for a position. */
    let air = null;
    let airD = reach * 1.35;
    for (const c of this.list) {
      if (!c.swattable) continue;
      const d = Math.hypot(c.position.x - player.position.x, c.position.z - player.position.z);
      const dy = c.position.y - player.position.y;
      if (d < airD && dy > -1.5 && dy < 6.5) { air = c; airD = d; }
    }
    if (!air) return false;

    this.game.hitSpark?.({ position: air.position, height: air.spec.size }, 'stand');
    /* ALREADY DOWN: TOP THE CLOCK UP AND SAY NOTHING ELSE. Every branch below
       is about an animal that was loose a moment ago — a mouthful, a first
       stun, a lesson — and none of them is true of one that is already sitting
       there cross-eyed. Running them anyway is how a stunned rat ended up
       being re-taught, re-announced, or (before `_canHold` learned about power
       moves) picked up and dropped. */
    if (air.state === 'stunned') {
      air.stun();
      this.game.sfx?.('squeak');
      return true;
    }
    if (air.spec.kind === 'flier') {
      air.mouth(player);
      this.held[player.index] = air;
      this.chew[player.index] = 0;
      this.game.sfx?.('squeak');
      this.game.toast(
        `${player.name} has a ${air.spec.name} in her mouth — STAND STILL and hold ATTACK!`,
        player.index
      );
    } else {
      air.stun();
      this.game.sfx?.('squeak');
      /* SAY WHAT TO DO NEXT, ONCE PER KITTEN PER TOURNAMENT. A stunned animal
         sitting still with stars round its head is a strong hint and it is not
         an instruction — the first time a nine-year-old lands this she has a
         rat frozen in front of her and no reason to know the hold exists.
         Once, because after that it is noise, and per kitten, because the two
         of them learn it at different moments. */
      if (!this._taught[player.index]) {
        this._taught[player.index] = true;
        this.game.toast(
          `Stunned the ${air.spec.name}! Walk up to it and HOLD ATTACK`,
          player.index
        );
      }
    }
    return true;
  }

  /**
   * Could this kitten hold an animal down right now?
   *
   * ONE ANSWER, ASKED IN BOTH PLACES. `strike` asks it before offering the pin
   * and `_updateHold` asks it every frame to keep one, and the bug this file
   * carried was precisely that only the second one existed: a swing thrown
   * while running started a hold that the very next frame threw away, so the
   * animal was neither pinned nor stunned and the swing did nothing at all.
   * Two copies of this rule is the same failure with an extra frame in it.
   *
   * `holding` — the attack button still being down — is deliberately NOT part
   * of it: at the instant she swings she has just pressed the thing.
   */
  _canHold(player) {
    if (player.ko || player.angel || player.hitT > 0) return false;
    if (!player.onGround || player.mount || player.pandaMount) return false;
    /* NOT IN THE MIDDLE OF A POWER MOVE, and the cross slash is why. She is
       planted with a velocity of zero and both feet on the deck, so every
       other test here says yes — and a kitten reaching down to put a paw on a
       rat is not what is happening: she is a second into a committed
       three-cut technique. Without this the second cut GRABBED the rat the
       first one stunned, and the pin was cancelled the moment the launch threw
       her, which read as the animal shrugging the whole move off. */
    if (player.busy) return false;
    return Math.hypot(player.velocity.x, player.velocity.z) < STILL_SPEED;
  }

  _grab(player, c) {
    c.pin(player);
    this.held[player.index] = c;
    this.chew[player.index] = 0;
    player.eatT = EAT_TIME;
    this.game.sfx?.('squeak');
  }

  /**
   * True while player `i` must be handed a dead pad.
   *
   * Read by `Game` next to `Tournament.frozen`, which is the same mechanism —
   * so none of the three movement modes has to learn that eating exists.
   * A bird in a mouth does NOT freeze her: she is allowed to run somewhere
   * safe with it, and only the two-second swallow roots her.
   */
  eating(i) {
    const c = this.held[i];
    return !!c && (c.state === 'pinned' || this.chew[i] > 0);
  }

  /* -------------------------------- update -------------------------------- */

  update(dt, players) {
    this._updatePoofs(dt);
    if (!this.on) return;

    const deck = this.deck;
    /* One camera yaw for everybody: a round — and the feast that follows it —
       is always drawn merged (`_updateSplit`, `inRing`), so there is exactly
       one screen direction and "broadside" means one thing. */
    const camYaw = players[0]?.camYaw ?? -Math.PI * 0.25;

    for (let i = 0; i < players.length; i++) this._updateHold(dt, players[i], i);

    for (const c of this.list) c.update(dt, this.world, players, deck, camYaw);

    // A bird that ran out its five seconds gets away with it.
    for (const c of this.list) {
      if (c.state === 'mouthed' && c.t <= 0) this._escape(c);
    }

    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      if (this.list.length < MAX_ON_STAGE) this._spawn();
      this.spawnT = this._nextDelay();
    }
  }

  _updateHold(dt, player, i) {
    const c = this.held[i];
    if (!c) return;

    /* THE FOUR WAYS TO LOSE IT, and all four have to be here rather than in
       the Critter: three of them are facts about the KITTEN. Those three are
       `_canHold`, which `strike` asks before it ever offers her the pin. */
    const pad = this.game.input?.players?.[i];
    const holding = !!pad?.down('attack');
    const canHold = this._canHold(player);
    const alive = !player.ko && !player.angel && player.hitT <= 0;

    if (c.state === 'pinned') {
      if (!holding || !canHold) { this._drop(i); return; }
      player.eatT = Math.max(0, EAT_TIME - c.t);
      if (c.t >= EAT_TIME) this._devour(player, c);
      return;
    }

    if (c.state === 'mouthed') {
      if (!alive) { this._escape(c); return; }
      if (holding && canHold) {
        this.chew[i] += dt;
        player.eatT = Math.max(0, EAT_TIME - this.chew[i]);
        if (this.chew[i] >= EAT_TIME) this._devour(player, c);
      } else if (this.chew[i] > 0) {
        /* THE SWALLOW RESETS RATHER THAN PAUSING. A bird has five seconds in
           there and the hold is two, so a chew you can chip away at in
           half-second slices while running is not a decision — it is the same
           snack with the risk taken out. Same rule as the shrine dwell. */
        this.chew[i] = 0;
        player.eatT = 0;
      }
      return;
    }

    // It is neither pinned nor mouthed any more — something else released it.
    this.held[i] = null;
    this.chew[i] = 0;
    player.eatT = 0;
  }

  /**
   * Everybody lets go of everything.
   *
   * Called when a round resets. `resetForRound` teleports both kittens to
   * their marks, and a rat still pinned to a cat who is now thirty units away
   * would be dragged across the deck by `_updatePinned` for the rest of the
   * tournament — the hold is a fact about two positions, and one of them just
   * moved without asking.
   */
  releaseAll() {
    for (let i = 0; i < this.held.length; i++) if (this.held[i]) this._drop(i);
  }

  /** She let go, moved, or got hit. It bolts and she gets nothing. */
  _drop(i) {
    const c = this.held[i];
    this.held[i] = null;
    this.chew[i] = 0;
    const p = this.game.players[i];
    if (p) p.eatT = 0;
    if (!c) return;
    c.release();
    this.game.sfx?.('squeak');
  }

  /** Five seconds up. It flies out of her mouth, and nobody heals. */
  _escape(c) {
    const i = c.holder?.index;
    if (i != null) {
      this.held[i] = null;
      this.chew[i] = 0;
      if (this.game.players[i]) this.game.players[i].eatT = 0;
      this.game.toast(`The ${c.spec.name} wriggled free!`, i);
    }
    c.release();
    /* Straight up and away, so it is unmistakably the bird leaving rather than
       her having dropped it. It re-enters ordinary roaming on the next frame. */
    c.position.y += 1.2;
    this.game.sfx?.('squeak');
  }

  /**
   * Eaten. The heal, the poof, the toast.
   *
   * `heal` IS CLAMPED TO HER OWN BAR, not to MAX_HP. An Adamant orb raises
   * `maxHp`, and a kitten wearing two of them still may not go over the top of
   * the bar she is actually shown — a health number above the end of the
   * drawn bar is a number nobody can read.
   */
  _devour(player, c) {
    const i = player.index;
    const before = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + c.spec.heal);
    const gained = Math.round(player.hp - before);

    this.held[i] = null;
    this.chew[i] = 0;
    this.eaten[i]++;
    player.eatT = 0;
    /* A little pop of the same squash the game uses for a landing, so the meal
       finishes on her rather than on the empty air the animal was in. */
    player.squash = 0.7;

    this._poof(c.position, c.spec.size);
    this._remove(c);
    this.game.sfx?.('chomp');
    this.game.toast(
      gained > 0
        ? `${player.name} ate the ${c.spec.name} — +${gained} health!`
        : `${player.name} ate the ${c.spec.name} — already full!`,
      i
    );
    /* The replacement is scheduled from NOW rather than left on whatever was
       left of the old clock: eating one is what starts the wait for the next,
       which is the rule the girls will actually infer from watching it. */
    this.spawnT = this._nextDelay();
  }

  _remove(c) {
    const ix = this.list.indexOf(c);
    if (ix >= 0) this.list.splice(ix, 1);
    c.dispose(this.scene);
  }

  /* -------------------------------- poof ---------------------------------- */

  /**
   * The puff it vanishes in — pooled rings, exactly like `Game.hitSpark`.
   *
   * IT IS A PUFF OF SMOKE AND NOT AN IMPACT. This is the one moment in the
   * feature where the joke could curdle: the animal has to disappear the way a
   * cartoon disappears, so it is soft white expanding rings and nothing red,
   * nothing sharp and no shards.
   */
  _poof(at, size) {
    if (!this._poofs.length) {
      for (let i = 0; i < 4; i++) {
        const g = new THREE.Group();
        const parts = [];
        for (let k = 0; k < 3; k++) {
          const m = new THREE.Mesh(
            new THREE.SphereGeometry(0.5, 10, 8),
            new THREE.MeshBasicMaterial({
              color: 0xfff6e0, transparent: true, opacity: 0,
              depthWrite: false, toneMapped: false,
            })
          );
          m.renderOrder = 24;
          g.add(m);
          parts.push(m);
        }
        g.visible = false;
        this.scene.add(g);
        this._poofs.push({ group: g, parts, t: 0, size: 1 });
      }
    }
    const p = this._poofs[this._poofIx];
    this._poofIx = (this._poofIx + 1) % this._poofs.length;
    p.t = 0.45;
    p.size = size;
    p.group.visible = true;
    p.group.position.copy(at);
  }

  _updatePoofs(dt) {
    for (const p of this._poofs) {
      if (p.t <= 0) continue;
      p.t -= dt;
      if (p.t <= 0) { p.group.visible = false; continue; }
      const k = 1 - p.t / 0.45;
      p.parts.forEach((m, i) => {
        const a = (i / 3) * Math.PI * 2;
        const r = k * p.size * 1.5;
        m.position.set(Math.cos(a) * r, p.size * 0.5 + k * p.size * 1.1, Math.sin(a) * r);
        m.scale.setScalar(p.size * (0.5 + k * 1.2));
        m.material.opacity = (1 - k) * 0.85;
      });
    }
  }

  faceCamera(camera) {
    for (const c of this.list) c.faceCamera(camera);
  }
}

export { EAT_TIME, MOUTH_TIME, CATCH_RADIUS };
