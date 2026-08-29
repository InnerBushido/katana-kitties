import * as THREE from 'three';
import { tune } from '../core/tuning.js';

/* ---------------------------------------------------------------------------
   MR. SATAN LOSES HIS TEMPER.

   Climb onto the announcer's box during a tournament and the World Champion
   notices. He taunts you, gives you ten seconds to think about it, announces
   that he has had enough of your kitty shenanigans, charges up like the hero
   of an anime he is not the hero of, and detonates — and everybody standing up
   there with him goes over the horizon.

   NOBODY IS HURT AND NOTHING IS LOST. Not one point of damage, no knockout, no
   score, no ring-out charged that was not already being charged. It is a gag
   with a ten-second fuse, and the whole reason it can exist at all is that it
   takes nothing away from anybody — which is the fourth non-negotiable read as
   a design rule rather than as a bug report.

   IT IS NOT COMBAT AND IT DOES NOT GO NEAR `strikePlayers`. The third
   non-negotiable says that gate asks exactly one question and stays the only
   way a kitten can be harmed; this system never asks it, never calls `hurt`,
   and calls `Player.blast` instead — a push with no damage argument to pass,
   so it cannot grow one later without somebody editing the signature.

   WHY IT CANNOT DECIDE A ROUND, which was the first thing to check and the
   first thing to get wrong. `_reaches` asks three questions: close enough,
   level with him, and NOT STANDING IN THE FIGHTING SQUARE. The first draft had
   only the first two, and the reasoning behind it was nearly right — the booth
   stands eight units north of the ring's north edge and its deck is four units
   higher, so a fighter ON the deck is out of range on height alone. What that
   missed is that she does not stay on the deck: one jump near the north edge
   puts her level with him and inside a 14-unit blast, and being thrown north
   out of a live round is precisely the outcome this must never produce.

   So the ring itself is the third test, asked of `World.arenaOutBy` — the same
   square the ring-out rule measures on, so the two cannot drift apart. What is
   left is people already outside the fighting square.

   THAT LAST STEP WAS ALSO WRONG THE FIRST TIME, and the browser is what said
   so. Outside the square is not the same as already being penalised: a kitten
   standing on the announcer's box is outside it and safely ABOVE the deck, so
   `Tournament._updateOut` is charging her nothing — until this throws her off
   and she comes down below the floor, at which point it rings her out for
   thirty health and a point. She left with 100 and landed in the middle of the
   ring with 70, which is not what a gag that promises to cost nothing does.
   So the flight now carries `Player.blastT`, an exemption from that one rule
   for exactly as long as she is in the air; `_catchFallers` then puts her back
   in the middle with — in that function's own words — no damage and no banner.

   THE TEN SECONDS ARE NOT CANCELLABLE, and running away does not stop it. He
   is funnier when he goes off behind you, the promise the game made ("ten
   seconds") is one it then keeps whatever you do, and a fuse a child can put
   out by walking backwards is a fuse she will never see burn.
--------------------------------------------------------------------------- */

/**
 * Every number the gag runs on.
 *
 * `notice` / `noticeUp` ARE A CYLINDER, NOT A SPHERE, and that is what makes
 * the whole thing safe. See the header: the height test is the part that keeps
 * a kitten fighting on the deck out of range of a man standing four units above
 * her. A sphere of radius 9 would reach down onto the north edge of the ring
 * and start throwing live fighters out of a round.
 *
 * `reach` IS WIDER THAN `notice` ON PURPOSE. What wakes him up is somebody
 * arriving next to him; what the explosion catches is everybody up there, and
 * the two should not be the same number — a sister who edged to the far corner
 * of the box during the ten seconds has not escaped, she is on the box. 14
 * clears the 10x5.6 deck and its rail from the centre with room over.
 *
 * `knock` / `lift` ARE ENORMOUS AND THAT IS THE JOKE. A dash — the hardest
 * ordinary blow in the game — is knock 19, lift 5. This is a fifth again as
 * far and three times as high, so a kitten leaves at an angle nothing else in
 * the game produces and is a dot before she comes down.
 */
export const BLAST = tune('BLAST', {
  notice: 9,
  noticeUp: 3.5,
  taunt: 10,
  charge: 1.0,
  boom: 0.9,
  reach: 14,
  knock: 34,
  lift: 16,
  cool: 30,
});

/** What he says on the way in, and what he says when he has had enough. */
export const BLAST_LINES = {
  taunt: 'Oh ho ho! You think you are TOUGH, huh?\nWant to take on the CHAMPION next? Maybe next time!',
  shout: 'THAT IS IT! I HAVE HAD ENOUGH\nOF YOUR KITTY SHENANIGANS!',
};

export class SatanBlast {
  /**
   * @param {object} o
   * @param {object} o.game     the Game, for players, toasts and sfx
   * @param {object} o.world    for `arenaOutBy` — see `_reaches`
   * @param {object} o.satan    MrSatan
   * @param {object} o.announcer his pop-in card
   */
  constructor({ game, world, satan, announcer }) {
    this.game = game;
    this.world = world;
    this.satan = satan;
    this.announcer = announcer;

    /** 'off' | 'taunt' | 'charge' | 'boom' | 'cool' */
    this.stage = 'off';
    this.t = 0;

    /* --- the explosion, which is two shells and a ring ---
       Drawn rather than particled, for the reason everything else in this game
       is: a shell is one draw call whose whole animation is two numbers, and a
       particle system for a thing that happens once every thirty seconds would
       cost memory for the whole session to buy nothing anybody can point at.

       `depthWrite: false` on all three. They are transparent and they overlap
       each other and the man in the middle of them; writing depth would make
       whichever drew first punch a hole in the other two. */
    this.fx = new THREE.Group();
    this.fx.visible = false;
    const shell = (r, colour, opacity) => new THREE.Mesh(
      new THREE.SphereGeometry(r, 20, 14),
      new THREE.MeshBasicMaterial({
        color: colour, transparent: true, opacity, depthWrite: false,
        toneMapped: false, side: THREE.DoubleSide,
      }),
    );
    this.shellOuter = shell(1, 0xffd166, 0.34);
    this.shellInner = shell(0.82, 0xfff6d8, 0.5);
    const ringGeo = new THREE.RingGeometry(0.86, 1, 40);
    ringGeo.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: 0xff8a3d, transparent: true, opacity: 0.6, depthWrite: false,
      toneMapped: false, side: THREE.DoubleSide,
    }));
    this.fx.add(this.shellOuter, this.shellInner, this.ring);

    /* --- the wind-up, which is a separate object because it is a separate
       IDEA --- A gathering ball at his chest that grows for one second and
       then is not there any more. Sharing the shells would mean the charge and
       the blast were the same three meshes at different scales, and the moment
       they need to differ (they already do — one gathers, one expands) that is
       a pile of flags. */
    this.charge = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0xfff0b8, transparent: true, opacity: 0.8, depthWrite: false,
        toneMapped: false,
      }),
    );
    this.charge.visible = false;
    this.fx.add(this.charge);
  }

  /** True while he is doing anything — the HUD and the camera can ask. */
  get busy() { return this.stage === 'taunt' || this.stage === 'charge' || this.stage === 'boom'; }

  /**
   * Put him back to neutral. Called when the tournament closes, when the whole
   * game resets, and by the debug key.
   *
   * IT PUTS THE POSE BACK TOO. `stage` going to 'off' with the charging
   * drawing left on screen is Mr Satan standing in his box with his arms in
   * the air for the rest of the afternoon, and the fourth non-negotiable's
   * spirit — nothing is left in a state nobody asked for — applies to a sprite
   * as much as to a barrel.
   */
  reset() {
    this.stage = 'off';
    this.t = 0;
    this.fx.visible = false;
    this.charge.visible = false;
    this.satan?.setPose?.('idle');
  }

  /**
   * Skip the fuse and go straight to the shout. THE DEBUG KEY, AND NOTHING
   * ELSE — nothing in play calls this.
   *
   * It exists because the gag's whole shape is a ten-second wait, which is
   * right in play and useless to look at: checking one colour on the shockwave
   * meant opening the arena, climbing the box and counting to ten, every time.
   *
   * IT GOES THROUGH `_shout`, not around it, so what appears on screen is the
   * real sequence — the same line, the same pose, the same charge, the same
   * explosion catching the same people — rather than a debug imitation of it
   * that can drift away from the thing it is supposed to be showing.
   */
  provoke() {
    this._shout();
  }

  /**
   * Is `p` up on the box with him, and out of the fight?
   *
   * THREE TESTS, AND THE THIRD ONE IS THE SAFETY PROPERTY. Close enough, level
   * with him, and not standing in the ring — see the header for why the first
   * two were not enough on their own, which is the bug this shape exists to
   * close rather than a precaution against a hypothetical one.
   *
   * ONE FUNCTION, because it is asked twice: once to wake him and once to
   * decide who the explosion catches. Two copies of a rule whose whole job is
   * to be conservative is one copy that gets relaxed.
   *
   * @param {object} p a Player
   * @param {number} r horizontal radius
   */
  _reaches(p, r) {
    const S = this.satan?.position;
    if (!S || !p || p.ko) return false;
    if (Math.abs(p.position.y - S.y) > BLAST.noticeUp) return false;
    if (Math.hypot(p.position.x - S.x, p.position.z - S.z) > r) return false;
    /* NOBODY IN THE FIGHTING SQUARE, EVER — jumping does not put her within
       his reach, it only puts her level with him. Measured on `arenaOutBy`
       rather than on a radius of our own so that "in the ring" means here
       exactly what it means to the rule that calls a ring-out. */
    const out = this.world?.arenaOutBy?.(p.position.x, p.position.z);
    return !(typeof out === 'number' && out <= 0);
  }

  /**
   * @param {number} dt
   * @param {boolean} armed is the tournament open and Mr Satan in his box?
   */
  update(dt, armed) {
    /* THE ARENA CLOSING ENDS IT MID-SENTENCE, and it has to. He walks back to
       the town square when the tournament shuts, and a countdown still running
       against his old position would detonate an invisible bomb over an empty
       island — or, worse, over the town, where the kittens actually are. */
    if (!armed) {
      if (this.stage !== 'off') this.reset();
      return;
    }

    this.t += dt;
    const players = this.game.players ?? [];

    switch (this.stage) {
      case 'off':
        if (players.some((p) => this._reaches(p, BLAST.notice))) this._taunt();
        break;

      case 'taunt':
        if (this.t >= BLAST.taunt) this._shout();
        break;

      case 'charge':
        this._drawCharge(this.t / BLAST.charge);
        if (this.t >= BLAST.charge) this._boom();
        break;

      case 'boom':
        this._drawBoom(this.t / BLAST.boom);
        if (this.t >= BLAST.boom) {
          this.stage = 'cool';
          this.t = 0;
          this.fx.visible = false;
          this.satan?.setPose?.('idle');
          this.satan?.setLine?.('');
        }
        break;

      case 'cool':
        /* THE WAIT RUNS WHETHER OR NOT ANYBODY IS STANDING THERE, so a kitten
           who liked it and climbed straight back up gets the full thirty
           seconds rather than an immediate second helping. The gag is worth
           doing twice in an afternoon and not twice in a minute. */
        if (this.t >= BLAST.cool) { this.stage = 'off'; this.t = 0; }
        break;

      default:
        break;
    }
  }

  _taunt() {
    this.stage = 'taunt';
    this.t = 0;
    this.announcer?.say('sat_taunt', 'You think you are TOUGH, huh? Ha!');
    this.satan?.setLine?.(BLAST_LINES.taunt);
  }

  _shout() {
    this.stage = 'charge';
    this.t = 0;
    this.announcer?.say('sat_blast', 'I HAVE HAD ENOUGH OF YOUR KITTY SHENANIGANS!');
    this.satan?.setLine?.(BLAST_LINES.shout);
    /* THE POSE IS A REQUEST, NOT A REQUIREMENT. `setPose` does nothing at all
       when `satan_charge.png` is absent, and the ninth non-negotiable says
       that has to be a working game rather than a broken one: he stands there
       in his ordinary pose, the ball still gathers, the explosion still goes
       off and the joke still lands. One drawing quieter, and nothing else. */
    this.satan?.setPose?.('charge');
    this.game?.sfx?.('wardup');
    this.fx.visible = true;
    this.charge.visible = true;
  }

  /**
   * The explosion itself: one loop, no damage, no score, no state kept.
   *
   * EVERY KITTEN IN REACH, INCLUDING ONE WHO IS ALREADY FLYING. There is no
   * "only if she is on the ground" test, because being caught in mid-air by
   * this is the best version of it and because such a test would silently
   * exempt whoever happened to be jumping on the frame it went off — the sort
   * of rule that reads as the game working sometimes.
   */
  _boom() {
    this.stage = 'boom';
    this.t = 0;
    this.charge.visible = false;
    this.game?.sfx?.('gong');
    const S = this.satan.position;
    let caught = 0;
    for (const p of this.game.players ?? []) {
      if (!this._reaches(p, BLAST.reach)) continue;
      p.blast(S, { knock: BLAST.knock, lift: BLAST.lift });
      caught += 1;
    }
    /* IT SAYS WHAT HAPPENED, and it says it only when it happened to somebody.
       A toast reading "everybody was blown away" over an empty booth would be
       the HUD reporting an event nobody was in. */
    if (caught) {
      this.game?.toast?.(
        caught > 1
          ? 'MR. SATAN BLASTS EVERYBODY OFF HIS BOX!'
          : 'MR. SATAN BLASTS YOU OFF HIS BOX!',
        0,
      );
    }
  }

  /** The gathering ball, `k` running 0 -> 1 across BLAST.charge. */
  _drawCharge(k) {
    const S = this.satan.position;
    const t = Math.min(1, Math.max(0, k));
    this.charge.position.set(S.x, S.y + 2.4, S.z);
    /* IT PULSES ON THE WAY UP rather than growing smoothly. A ball that just
       inflates reads as a loading bar; the wobble is what says it is being
       held in by somebody who is about to stop holding it. */
    this.charge.scale.setScalar(0.5 + t * 2.2 + Math.sin(t * 34) * 0.16 * t);
    this.charge.material.opacity = 0.45 + t * 0.45;
  }

  /** The expanding shells, `k` running 0 -> 1 across BLAST.boom. */
  _drawBoom(k) {
    const S = this.satan.position;
    const t = Math.min(1, Math.max(0, k));
    /* EASED OUT HARD — most of the radius is spent in the first third. An
       explosion that expands linearly looks like a balloon; the whole read of
       one is that it is fastest at the instant it happens. */
    const grow = 1 - (1 - t) ** 3;
    const r = 1 + grow * BLAST.reach;
    this.shellOuter.position.set(S.x, S.y + 1.8, S.z);
    this.shellInner.position.copy(this.shellOuter.position);
    this.shellOuter.scale.setScalar(r);
    this.shellInner.scale.setScalar(r * 0.86);
    this.shellOuter.material.opacity = 0.34 * (1 - t);
    this.shellInner.material.opacity = 0.5 * (1 - t) ** 2;
    /* The ground ring is flatter and faster — it is the shockwave crossing the
       deck, and it should already be at the rail while the ball is still
       leaving him. */
    this.ring.position.set(S.x, S.y + 0.06, S.z);
    this.ring.scale.setScalar(1 + grow * BLAST.reach * 1.25);
    this.ring.material.opacity = 0.6 * (1 - t);
  }
}
