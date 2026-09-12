import * as THREE from 'three';

/* ---------------------------------------------------------------------------
   THE TIDE — the ending's picture, and it is the world itself.

   Patchfur closes the story standing in front of every island at once (see
   `SummonScene._parkStage` and the finale camera in `main.js`), and what is
   behind her is a world with two hundred-odd knocked-over things in it. That
   IS the subject of her last four lines, so for the length of them the world
   acts them out:

     beat 1  the archipelago exactly as they left it — on its side
     beat 2  every barrel, lantern and cane STANDS BACK UP. Not restored:
             rewound. A town tidying itself in front of you, from the far
             island inwards, over about six seconds.
     beat 3  it holds. One tidy arrangement, the only one there is.
     beat 4  and it all goes over again, in the same wave, landing back in
             exactly the pose it was in when she started talking.

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
 * How long the world takes to stand up, and to go over again.
 *
 * SIX SECONDS, WHICH IS MOST OF A BEAT. Patchfur's lines run 7.5-9 seconds
 * each, so the wave is still travelling while she is still talking — the
 * picture is under the line rather than punctuating it, the same rule
 * `BEAT_ACTS`' gestures follow. Three was tried and reads as a cut.
 */
const RISE = 6;
/** ...and going over is faster than standing up. It always is. */
const FALL = 4.2;
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
        /* WHERE IT LANDED — the pose the afternoon actually produced. */
        pos: g.position.clone(),
        rot: g.rotation.clone(),
        /* ...AND WHERE IT BELONGS. `home` is the spot it was built on, and
           the yaw is its own: a barrel put back facing a random new direction
           is a barrel that has been REPLACED, not stood up. */
        home: p.home.clone(),
        yaw: g.rotation.y,
        /* Its place in the wave. Spread over the props in world order, which
           is the order they were planted island by island — so the ripple
           crosses the archipelago rather than firing at random. */
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
   * Which beat we are on, and therefore which way the tide is going.
   *
   * BEAT NUMBERS, NOT A STATE MACHINE OF ITS OWN. The scene already knows
   * which line is playing and this is derived from it, so a script that gains
   * or loses a line cannot leave the world half tidy — the last beat is always
   * the one that puts it back, whatever number it happens to be.
   *
   * @param {number} beat zero-based
   * @param {number} last the last beat's index
   */
  setBeat(beat, last) {
    if (!this.running) return;
    if (beat <= 0) { this.want = 0; this.rate = 1 / RISE; return; }
    if (beat >= last) { this.want = 0; this.rate = 1 / FALL; return; }
    this.want = 1;
    this.rate = 1 / RISE;
  }

  update(dt) {
    if (!this.running) return;
    const d = this.rate * dt;
    this.k = this.want > this.k
      ? Math.min(this.want, this.k + d)
      : Math.max(this.want, this.k - d);

    for (const h of this.held) {
      /* EACH PROP'S OWN SLICE OF THE MOVE. `phase` is where it sits in the
         wave and `1 - STAGGER` is what is left for any one of them, so the
         first prop has finished standing up while the last has not started. */
      const t = ease(
        Math.min(1, Math.max(0, (this.k - h.phase) / (1 - STAGGER)))
      );
      const g = h.prop.group;
      g.position.lerpVectors(h.pos, h.home, t);
      /* AND IT TURNS AS IT RISES. Lerped on the euler rather than slerped on a
         quaternion, deliberately: these are pitch-and-roll falls of less than
         half a turn from an upright pose, the shortest path is the obvious
         one, and a lerped euler is what the rest of this file's numbers are
         written in. A cane spinning the long way round to stand up would be
         funny once and wrong for the whole scene. */
      g.rotation.set(
        THREE.MathUtils.lerp(h.rot.x, 0, t),
        THREE.MathUtils.lerp(h.rot.y, h.yaw, t),
        THREE.MathUtils.lerp(h.rot.z, 0, t)
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
    this.k = 0;
    this.want = 0;
  }
}
