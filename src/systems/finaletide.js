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
/**
 * How many of the falling props are allowed to make a noise, and how far from
 * an even share of them each one is allowed to stand.
 *
 * HALVED, AND THEN UNPICKED FROM THE GRID IT WAS ON. "It is a bit loud and
 * robotic sounding (too metronomic) so we can reduce the sounds that is played
 * by half and try to stagger/randomize the way they are played so it is not as
 * robotic." Both halves of that are one bug: twelve bangs was already too many
 * for a shove that lasts a second and a half, and they were picked as EVERY
 * NTH PROP IN WAVE ORDER — a perfectly even comb over a wave whose phases are
 * themselves evenly dealt, which is a metronome by construction. Six of them,
 * each nudged off its slot by up to most of a slot, is a town going over.
 *
 * THE JITTER IS IN THE PICK, NOT IN A DELAY. Nothing here can hold a sound
 * back: a bang fires when its own prop moves, which is the whole reason it
 * lands under the thing the eye is looking at. So the randomness has to be in
 * WHICH props are the loud ones, and a prop half a rank further along the wave
 * is a bang a few hundredths later.
 */
const CRASHES = 6;
const CRASH_JITTER = 0.8;
/**
 * How far into a prop's own fall its bang goes off, as a fraction of the fall.
 *
 * IT USED TO BE THE LANDING AND THAT IS WHY IT SOUNDED LATE. "Seems the sound
 * of when they are falling over is a bit delayed, it should start playing as
 * soon as they start getting knocked over." `t` runs 1 -> 0 through a shove —
 * 1 is standing, 0 is flat — and the test was `t < 0.12`, which is the moment
 * the barrel finishes arriving on the ground. Half a second after the eye saw
 * it topple, every time, and on a wave whose whole point is that the bangs
 * ripple with the picture.
 *
 * A CANE CRACKS WHEN IT IS CUT, NOT WHEN IT STOPS ROLLING. That is also what
 * these sounds ARE: they are the prop's own hit, the noise the girls make
 * knocking it over, and that noise belongs to the blow rather than to the
 * landing.
 */
const CRASH_AT = 0.9;
/**
 * How much of the wave's stagger a SHOVE gets. Standing up is a ripple and
 * being knocked over is not.
 *
 * "When the mischief gets knocked over, all the sounds should be played in a
 * duration that is half the time, so it sounds closer to as if they are all
 * getting knocked over around the same time." Exactly half, and it is the
 * stagger that is halved rather than `SLAM`: shortening the fall itself would
 * have made every barrel move twice as fast, which is a different note
 * entirely — the ask is about a town going over TOGETHER, not about it going
 * over FASTER. Measured, the bangs now arrive across 0.34s instead of 0.67s.
 *
 * THE RISE KEEPS THE FULL WAVE. A town tidying itself is the one place a long
 * ripple is the whole picture; see `STAGGER`.
 */
const SLAM_BUNCH = 0.5;

/** 0..1 ease. Slow at both ends — a thing standing up thinks about it. */
const ease = (t) => t * t * (3 - 2 * t);

/**
 * How far off dead flat a shoved prop may come to rest, in radians.
 *
 * "THE BAMBOO IS STILL NOT ALL KNOCKED OVER... looks like the time is frozen
 * and looks buggy with them half fallen over." Measured at the cut to the
 * crossing, which is the first shot after the shove that holds still long
 * enough to look at: of the 46 canes the shove had put down, EIGHTEEN were
 * standing more than thirty degrees off the floor and three were within thirty
 * of upright. Nothing was frozen — every one of them was exactly where `slam`
 * had told it to be. `slam` was the bug, twice over:
 *
 *   - it asked for 66 to 95 degrees of tip, so a third of the town went over
 *     two-thirds of the way and stopped in mid-air; and
 *   - it wrote that tip as `(cos a * tip, yaw, sin a * tip)` on an XYZ euler,
 *     with the yaw in the MIDDLE of the three turns. The yaw rotates the first
 *     tilt's axis before the second is applied, so the two halves of the lean
 *     partly cancel and how far a prop actually tipped depended on which way it
 *     happened to be facing. Ten degrees, for one of them.
 *
 * Flat, less a whisker, and never PAST flat: the prop's origin is its base, so
 * a lean beyond ninety degrees is a cane with its top half under the grass.
 */
const FLAT_SLACK = 0.08;
const _UP = new THREE.Vector3(0, 1, 0);
const _axis = new THREE.Vector3();
const _yawQ = new THREE.Quaternion();

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
    /** How wide the wave's fan is right now, as a fraction of `STAGGER`. See
     *  `SLAM_BUNCH`. */
    this.bunch = 1;
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
        /* AS A QUATERNION, and the upright one beside it — see `update` for
           why the fall is no longer an euler lerp. */
        downQuat: g.quaternion.clone(),
        upQuat: new THREE.Quaternion().setFromAxisAngle(_UP, g.rotation.y),
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
      const tip = Math.PI / 2 - Math.random() * FLAT_SLACK;
      h.downPos.set(
        h.home.x + Math.cos(a) * (0.5 + Math.random() * 1.3),
        h.home.y + 0.1,
        h.home.z + Math.sin(a) * (0.5 + Math.random() * 1.3)
      );
      /* TURN ON ITS OWN AXIS, THEN LAY IT DOWN TOWARD `a`. Two separate
         rotations composed in that order, so the lean is `tip` whichever way
         the prop was facing — see `FLAT_SLACK` for the euler that could not
         promise that. The axis is `up x (cos a, 0, sin a)`, which is the one
         that swings the top of the prop toward the side its base slid to. */
      _axis.set(Math.sin(a), 0, -Math.cos(a));
      _yawQ.setFromAxisAngle(_UP, h.yaw + (Math.random() - 0.5) * 0.9);
      h.downQuat.setFromAxisAngle(_axis, tip).multiply(_yawQ);
      h.bang = false;
      n++;
    }
    /* THE BANGS ARE SPREAD OVER THE FALL, not fired with it. A handful of props
       in wave order make a noise, so the sounds arrive in the same ripple the
       eye is watching and the other fifty go over quietly.

       AND THEY ARE NOT ON A GRID. Every Nth prop out of a list whose phases
       were themselves dealt evenly is a metronome — the bangs came out at one
       rate, in one rhythm, every time the ending played. Each pick is nudged
       off its slot by up to `CRASH_JITTER` of a slot instead, which is the
       difference between a drum machine and a town falling over. */
    const step = Math.max(1, mine.length / CRASHES);
    mine.sort((x, y) => x.phase - y.phase);
    for (let i = 0; i < CRASHES; i++) {
      const slot = (i + 0.5 + (Math.random() - 0.5) * CRASH_JITTER) * step;
      const ix = Math.max(0, Math.min(mine.length - 1, Math.floor(slot)));
      mine[ix].bang = true;
    }

    this.want = 0;
    this.rate = 1 / SLAM;
    this.slamming = true;
    /* AND THE WAVE CLOSES UP UNDER IT. See `SLAM_BUNCH`: the ranks stay where
       `focusOn` dealt them — nearest the mark first, which is still the shape
       of the thing — and the whole fan is squeezed to half its width for as
       long as the shove is running. */
    this.bunch = SLAM_BUNCH;
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
    this.bunch = 1;
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
         wave and what is left over is what any one of them has to move in, so
         the first prop has finished standing up while the last has not
         started. `bunch` narrows the fan without re-dealing it — 1 while the
         town stands up, `SLAM_BUNCH` while it goes over. */
      const bunch = this.bunch ?? 1;
      const t = ease(
        Math.min(1, Math.max(0, (this.k - h.phase * bunch) / (1 - STAGGER * bunch)))
      );
      /* AND IT IS AUDIBLE AS IT GOES, not once it has got there. Fired as the
         prop LEAVES its standing pose — `t` runs 1 to 0 through a shove — so
         the bang is under the thing the eye is looking at on the frame the eye
         sees it move. See `CRASH_AT`: this used to be `t < 0.12`, the far end
         of the same fall, which put every crash most of half a second behind
         its own picture. One per prop per slam: `bang` is spent here and only
         `slam()` sets it. */
      if (h.bang && t < CRASH_AT) {
        h.bang = false;
        this.onCrash?.(h.prop.kind);
      }
      const g = h.prop.group;
      g.position.lerpVectors(h.downPos, h.home, t);
      /* AND IT TURNS AS IT RISES — ON A QUATERNION NOW. This was a lerp on the
         euler, on the argument that these are falls of under half a turn and
         the shortest path is the obvious one. Neither half held. The fall the
         euler DESCRIBED was not the fall it drew (see `FLAT_SLACK`: eighteen
         canes in forty-six left standing at an angle), and the pose a prop
         arrives in from the afternoon is not under half a turn of anything:
         `Prop.update` integrates spin onto `rotation` for as long as it
         tumbles, so a barrel can lie flat on `x = 2PI + PI/2` and a lerp to zero
         stands it up by cartwheeling it four times. A slerp is the shortest
         way between two orientations by construction, which is what the old
         comment was asking for. */
      g.quaternion.slerpQuaternions(h.downQuat, h.upQuat, t);
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
    this.bunch = 1;
    this.k = 0;
    this.want = 0;
  }
}
