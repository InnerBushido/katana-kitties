import * as THREE from 'three';

/* ---------------------------------------------------------------------------
   THE TIDE — the ending's picture, and it is the world itself.

   Patchfur closes the story standing in front of every island at once (see
   `SummonScene._parkStage` and the finale camera in `main.js`), and what is
   behind her is a world with two hundred-odd knocked-over things in it. That
   IS the subject of her last four lines, so for the length of them the world
   acts them out.

   IT IS CUT TO WORDS, NOT TO BEATS. This file used to take a beat number and
   decide for itself what a beat meant — middle beats rose, the last one fell —
   and that is why the town used to start tidying itself several seconds before
   the camera found it, and why the crash landed in the middle of a clause
   instead of on the end of one. The ending is a shot list now
   (`FINALE_SHOTS` in summonscene.js) and the shot list is what drives this:
   three verbs, called on named words.

     only(at, r)  narrow what MOVES to one corner of the world. Everything is
                  still HELD — the fourth non-negotiable is about what gets put
                  back, and `finish()` still puts every last prop back — but a
                  reconstruction the camera is looking at reads as a place
                  tidying itself, where the whole archipelago rising at once
                  reads as a cutscene doing a trick.
     raise(secs)  stand that corner up, over a span MEASURED off the script:
                  the shot list knows the gap between "simpler" and "the rest
                  of them" and hands it over, so a line rewritten to be longer
                  cannot leave the wave finishing early.
     slam()       and put it all back over on the end of the clause, with the
                  first dozen landings making a noise through `onCrash`.

   Nothing here starts on its own. If the camera is not pointed at it, it does
   not move — which is the whole reason the three verbs exist rather than one
   `setBeat`.

   WHY THIS REPLACED A DIAGRAM. The first version of this scene drew four white
   line figures behind her — a scatter, a lattice, a circle and a chord — and it
   was a maths lesson in a game that already has two better ones (the Kotodama
   Orb and the Dojo are both walkable, both load-bearing, and neither is going
   anywhere). Richard's note was that the ENDING's idea is entropy, and entropy
   in this game is not an abstraction: it is 216 specific objects the girls
   spent an afternoon putting their paws through. Drawing a circle to explain
   that is drawing a picture of a thing that is standing right there.

   AND IT IS WHY THE KOTODAMA WOKE UP. The story the ending now tells: order is
   one arrangement of a town, disorder is all the rest, and the mischief the
   girls made is the potential that was sitting dormant inside every standing
   object. Knocking the world over let it out — and the Kotodama are what it
   looks like once it is out. `entities/clanpower.js` is the same sentence with
   a cooldown on it: 盗 Steal Mischief knocks a Kotodama off somebody because an
   orb IS mischief, and mischief can be knocked loose.

   ------------------------------------------------- NOTHING REGROWS, AND THIS
   DOES NOT BREAK THAT

   The fourth non-negotiable is that a prop knocked over stays knocked over, so
   the MISCHIEF counter is honest. This file never touches `knocked`, `scored`,
   `gone` or the total; it moves meshes and nothing else, and `finish()` puts
   every one of them back on the exact transform it was holding when `start()`
   ran. A kid who skips the scene at the halfway point gets her wrecked town
   back, upside down where she left it, to the last decimal. `world-check`
   asserts precisely that, because "the ending tidied my world up" would be the
   single worst bug this game could have.

   `Prop.held` IS WHAT KEEPS THE TWO OF US OFF EACH OTHER. A settled prop is
   still being lerped flat by its own `update` every frame (that is what makes
   it LIE there rather than stand on its end), which would fight this for the
   whole scene and win about half the time. The flag is set here, cleared here,
   and read in exactly one place.
--------------------------------------------------------------------------- */

/**
 * How long a town takes to stand back up, when nobody says.
 *
 * IT USED TO BE THE WHOLE ANSWER and now it is only the floor. The wave was
 * driven off BEAT NUMBERS — a middle beat meant rise, the last beat meant fall
 * — and six seconds was most of a beat, so the picture ran under the line
 * rather than punctuating it. The ending is cut to WORDS now: the rise starts
 * on "simpler" and has to be finished by "the rest of them", and how long that
 * is depends on how long the line is. So `raise()` is handed the span measured
 * off the script and this is what it falls back to when it is handed nothing.
 */
const RISE = 6;
/**
 * How far apart the near and far ends of the wave are, as a fraction of the
 * whole move.
 *
 * WITHOUT IT EVERY PROP MOVES AT ONCE and two hundred objects snapping upright
 * on the same frame reads as a rendering glitch rather than as a town being
 * tidied. With it the ripple crosses the archipelago and the eye follows it.
 * 0.45 leaves every prop more than half the move to itself.
 */
const STAGGER = 0.45;
/**
 * How fast the reconstructed corner goes over again, and how many of them are
 * allowed to make a noise doing it.
 *
 * "Knock over all the reconstructed mischief again in a chaotic way, as if they
 * were knocked over again, can even play the sound effect of them getting
 * knocked over, just stagger the sound a bit so it is not too loud and on top
 * of itself." A second and a half is quick enough to read as a shove and long
 * enough that the wave's own stagger spreads the bangs out; the cap is what
 * keeps sixty props from arriving as one wall of noise. Every bang is the
 * prop's OWN sound — a cane cracks and a barrel thumps — because that is what
 * they sound like when the girls do it.
 */
const SLAM = 1.5;
const CRASHES = 12;

/** 0..1 ease. Slow at both ends — a thing standing up thinks about it. */
const ease = (t) => t * t * (3 - 2 * t);

export class FinaleTide {
  /** @param {object} world the real World — its real props */
  constructor(world) {
    this.world = world;
    this.running = false;
    /** 0 = as they left it, 1 = tidy. */
    this.k = 0;
    this.want = 0;
    this.rate = 1 / RISE;
    /** @type {Array} one entry per prop we are holding. */
    this.held = [];
    /** True once `slam()` has rewritten where "down" is. Nothing reads it but
     *  the checks and a future beat; it is here so the state is askable. */
    this.slamming = false;
    /** Called with a prop's `kind` as it lands, during a slam. The scene wires
     *  the audio in — nothing in this file may reach the sound system, the same
     *  rule `entities/panda.js` follows and for the same reason. */
    this.onCrash = null;
    this._e = new THREE.Euler();
  }

  /**
   * Take hold of the world.
   *
   * ONLY WHAT IS ACTUALLY DOWN. A prop still standing has nothing to rewind to
   * and would be included in the wave as a thing that does not move, which is
   * fine — and a prop that fell off the edge of the world (`gone`) is hidden
   * and must stay hidden: standing it back up would be the one thing the
   * retirement rule exists to prevent, in the one scene everybody watches.
   *
   * THE POSE IS SNAPSHOT, NOT DERIVED. `finish` restores from this list rather
   * than running the wave backwards to zero, because floating-point and a
   * skipped scene both make "backwards to zero" approximately right, and
   * approximately right is a town that ends the afternoon a few degrees
   * tidier than the kid left it.
   */
  start() {
    this.finish();
    const props = this.world?.props ?? [];
    for (const p of props) {
      if (!p?.knocked || p.gone || !p.group) continue;
      const g = p.group;
      this.held.push({
        prop: p,
        /* IN THE SHOT, until somebody says otherwise. `only()` narrows this to
           one corner of the world for the ending's reconstruction beat; what it
           may never do is narrow what is HELD, because `finish` restores from
           this list and a prop dropped from it is a prop nobody puts back. */
        inShot: true,
        bang: false,
        /* WHERE IT LANDED — the pose the afternoon actually produced. */
        pos: g.position.clone(),
        rot: g.rotation.clone(),
        /* ...AND WHERE IT BELONGS. `home` is the spot it was built on, and
           the yaw is its own: a barrel put back facing a random new direction
           is a barrel that has been REPLACED, not stood up. */
        home: p.home.clone(),
        yaw: g.rotation.y,
        /* WHERE "DOWN" IS FOR THE WAVE, which starts as the pose the afternoon
           produced and is rewritten by `slam()` into a fresh one. `pos`/`rot`
           above are the SNAPSHOT and are never rewritten: they are what
           `finish` puts back, and the whole fourth non-negotiable rests on
           those two fields being the ones the kid left behind. */
        downPos: g.position.clone(),
        downRot: g.rotation.clone(),
        /* Its place in the wave. Spread over the props in world order to
           begin with — the order they were planted, island by island, so the
           ripple crosses the archipelago rather than firing at random — and
           then re-dealt by `focusOn` on every cut, so the things that stand up
           first are the ones the camera is pointing at. */
        phase: 0,
      });
      p.held = true;
    }
    const n = Math.max(1, this.held.length - 1);
    this.held.forEach((h, ix) => { h.phase = (ix / n) * STAGGER; });
    this.running = this.held.length > 0;
    this.k = 0;
    this.want = 0;
    this.rate = 1 / RISE;
    return this.held.length;
  }

  /**
   * Point the wave at somewhere, so the things in shot are the things that move.
   *
   * THE RIPPLE USED TO START AT PROP ZERO. `phase` was handed out in world
   * order — the order the props were planted, island by island — which made a
   * ripple that crossed the archipelago in a sensible direction and had nothing
   * whatever to do with where the camera was pointing. Now that the ending cuts
   * to specific places (`FINALE_SHOTS`), the thing on screen was as likely as
   * not to be a corner of the world the wave had already been through, or had
   * not reached yet. Asked for as "just animate mainly the mischief that is in
   * the view of the camera, or the main ones being focused on".
   *
   * NOTHING IS SKIPPED AND NOTHING IS CULLED, which is the important half. Every
   * held prop still stands up and still goes over again — the last beat's fall
   * is a restoration and depends on it — and this only decides the ORDER. A
   * version that moved only what was on screen would leave the far islands tidy
   * at the end of a scene whose whole argument is that they do not stay that
   * way.
   *
   * AND IT REFUSES WHILE THE WAVE IS MOVING. `k` is one scalar for the whole
   * world and `phase` is where each prop sits inside it, so re-sorting halfway
   * through the rise teleports two hundred objects. A cut in the middle of a
   * beat therefore keeps the order it already had, which is right: the wave it
   * is in the middle of is the one the previous shot started.
   *
   * @param {?{x:number, z:number}} at where the ripple should begin, or null to
   *        leave it as it is.
   */
  focusOn(at) {
    if (!this.running || !at || this.k > 0.001) return false;
    /* DEALT ACROSS WHAT IS ACTUALLY GOING TO MOVE, which is the whole world
       until `only()` says otherwise. Ranking all two hundred and then moving
       thirty of them is how the ripple collapses: the thirty in a town square
       are the thirty NEAREST the mark, so they take ranks 0 to 29 out of 215
       and share the first seven hundredths of a wave that is supposed to be
       spread over nearly half of it. On screen that is a shove rather than a
       ripple, and in the ears it is ten canes cracking inside a tenth of a
       second — which is the exact noise the stagger exists to prevent. */
    const mine = this.held.filter((h) => h.inShot);
    if (!mine.length) return false;
    const n = Math.max(1, mine.length - 1);
    mine
      .map((h) => ({ h, d: Math.hypot(h.home.x - at.x, h.home.z - at.z) }))
      .sort((a, b) => a.d - b.d)
      .forEach((e, rank) => { e.h.phase = (rank / n) * STAGGER; });
    return true;
  }

  /**
   * Narrow the wave to one corner of the world.
   *
   * ASKED FOR AS A FIXED PLACE. "We can be zoomed on a specific area that has a
   * lot of mischief and furniture and have it be reconstructed rather than
   * focusing on random locations throughout the world, should be the same every
   * time." The whole archipelago standing up was the right picture for a shot
   * of the whole archipelago and the wrong one for a shot of a town square:
   * from a camera 17 units off the ground you could see six things move out of
   * two hundred, and the other 194 were the reason the wave took six seconds.
   *
   * IT NARROWS WHAT MOVES AND NOT WHAT IS HELD. Everything knocked over is
   * still in `held`, still has `Prop.held` set, and is still restored by
   * `finish` — so the corner that gets a performance and the rest of the world
   * that does not are the same promise to the player either way.
   *
   * @param {?{x:number,z:number}} at centre, or null to put the whole world
   *        back in the shot.
   * @param {number} r how far out, in world units.
   * @returns {number} how many props are in the shot.
   */
  only(at, r = 24) {
    let n = 0;
    for (const h of this.held) {
      h.inShot = !at || Math.hypot(h.home.x - at.x, h.home.z - at.z) <= r;
      if (h.inShot) n++;
    }
    /* AND THE RIPPLE RE-STARTS INSIDE IT. Without this the stagger is still
       spread across the whole world, so a corner of six props would all share
       one narrow slice of the wave and move as a block. */
    if (at) this.focusOn(at);
    return n;
  }

  /**
   * ...and over it all goes again, differently this time.
   *
   * A NEW POSE, NOT THE OLD ONE. Rewinding the rise would put every barrel back
   * exactly where it had been lying, which reads as the film running backwards
   * — and the line it plays under is "every other way is the rest of them",
   * which is a sentence about there being more than one way to fall. So each
   * prop is given a fresh direction, a fresh tilt and a fresh scatter, and that
   * is what the wave now falls toward.
   *
   * `pos`/`rot` ARE NOT TOUCHED. They are the snapshot `finish` restores. This
   * scene is allowed to invent a hundred new ways for a town to be lying on its
   * side, and it is not allowed to leave the world in any of them.
   *
   * @param {number} [seedTurn] optional fixed angle, for a test that wants the
   *        same fall twice.
   */
  slam(seedTurn = null) {
    if (!this.running) return 0;
    const mine = this.held.filter((h) => h.inShot);
    let n = 0;
    for (const h of mine) {
      const a = seedTurn ?? Math.random() * Math.PI * 2;
      const tip = 1.15 + Math.random() * 0.5;
      h.downPos.set(
        h.home.x + Math.cos(a) * (0.5 + Math.random() * 1.3),
        h.home.y + 0.1,
        h.home.z + Math.sin(a) * (0.5 + Math.random() * 1.3)
      );
      h.downRot.set(
        Math.cos(a) * tip,
        h.yaw + (Math.random() - 0.5) * 0.9,
        Math.sin(a) * tip
      );
      h.bang = false;
      n++;
    }
    /* THE BANGS ARE SPREAD OVER THE FALL, not fired with it. Every twelfth prop
       in wave order makes a noise, so the sounds arrive in the same ripple the
       eye is watching and the other fifty go over quietly. */
    const step = Math.max(1, Math.ceil(mine.length / CRASHES));
    mine.sort((x, y) => x.phase - y.phase);
    for (let i = 0; i < mine.length; i += step) mine[i].bang = true;

    this.want = 0;
    this.rate = 1 / SLAM;
    this.slamming = true;
    return n;
  }

  /**
   * Stand back up, and be standing by then.
   *
   * THE SPAN IS MEASURED, NOT TYPED. It used to be six seconds because a beat
   * is about eight and a half; now the reconstruction runs between two WORDS in
   * one line — "I think it is simpler than that" and "every other way is the
   * rest of them" — and the scene works out how many seconds that is off the
   * script's own text and duration. Hand it four and it takes four; rewrite the
   * line and it takes however long the new one leaves it. A typed six here
   * would mean the town was still climbing to its feet when the shove came.
   *
   * `k` TRAVELS 0..1 IN EXACTLY `secs` AND THAT IS THE WHOLE MOVE. Each prop's
   * own slice is `(k - phase) / (1 - STAGGER)` and the last one to start sits
   * at `phase === STAGGER`, so it reaches the top at `k === 1` and not after —
   * the stagger is inside the span rather than added to the end of it.
   *
   * @param {number} [secs] how long it may take. Clamped off zero, because a
   *        wave with no time reads as two hundred objects teleporting.
   * @returns {boolean} false if there is no wave to steer.
   */
  raise(secs = RISE) {
    if (!this.running) return false;
    this.want = 1;
    this.rate = 1 / Math.max(0.4, Number.isFinite(secs) ? secs : RISE);
    this.slamming = false;
    return true;
  }

  update(dt) {
    if (!this.running) return;
    const d = this.rate * dt;
    this.k = this.want > this.k
      ? Math.min(this.want, this.k + d)
      : Math.max(this.want, this.k - d);

    for (const h of this.held) {
      /* OUT OF THE SHOT IS OUT OF THE WAVE. Still held, still restored — see
         `only()`. It is not skipped work either: a prop that never moves is a
         prop lying exactly where the girls left it, which is the picture. */
      if (!h.inShot) continue;
      /* EACH PROP'S OWN SLICE OF THE MOVE. `phase` is where it sits in the
         wave and `1 - STAGGER` is what is left for any one of them, so the
         first prop has finished standing up while the last has not started. */
      const t = ease(
        Math.min(1, Math.max(0, (this.k - h.phase) / (1 - STAGGER)))
      );
      /* AND IT LANDS AUDIBLY. Fired as the prop passes the bottom of its own
         slice rather than when the whole wave ends, so the bang is under the
         thing the eye is looking at. One per prop per slam: `bang` is spent
         here and only `slam()` sets it. */
      if (h.bang && t < 0.12) {
        h.bang = false;
        this.onCrash?.(h.prop.kind);
      }
      const g = h.prop.group;
      g.position.lerpVectors(h.downPos, h.home, t);
      /* AND IT TURNS AS IT RISES. Lerped on the euler rather than slerped on a
         quaternion, deliberately: these are pitch-and-roll falls of less than
         half a turn from an upright pose, the shortest path is the obvious
         one, and a lerped euler is what the rest of this file's numbers are
         written in. A cane spinning the long way round to stand up would be
         funny once and wrong for the whole scene. */
      g.rotation.set(
        THREE.MathUtils.lerp(h.downRot.x, 0, t),
        THREE.MathUtils.lerp(h.downRot.y, h.yaw, t),
        THREE.MathUtils.lerp(h.downRot.z, 0, t)
      );
    }
  }

  /**
   * Let go, and put everything back exactly as it was.
   *
   * THE ONE THING THIS FILE OWES THE REST OF THE GAME. Called when the scene
   * ends, when it is SKIPPED, and on the way into a new one — so every path
   * out of the ending, including a nine-year-old pressing Escape three seconds
   * in, leaves the world on the transforms it was holding beforehand.
   */
  finish() {
    for (const h of this.held) {
      const g = h.prop.group;
      g.position.copy(h.pos);
      g.rotation.copy(h.rot);
      h.prop.held = false;
    }
    this.held = [];
    this.running = false;
    this.slamming = false;
    this.k = 0;
    this.want = 0;
  }
}
