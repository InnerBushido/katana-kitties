import { tune } from '../core/tuning.js';

/* ---------------------------------------------------------------------------
   WHAT YOUR CLAN IS WORTH IN THE RING.

   Four of the six oaths already pay out in the arena without anybody writing a
   line of arena code: Thunderpaw runs, Riverclaw out-reaches, Shadowtail jumps
   three times and Pandapaw brings an animal into the fight. Two did not.
   Icewhisker's Sense Mischief points at the nearest unbroken barrel, and there
   are no barrels in the ring; Windwhisker's Huge Dragon Breath makes a DRAGON'S
   flame bigger, and there are no dragons in the ring either. So the two clans
   whose powers are about the world went quiet in the one place the girls
   compare clans out loud, and "which one did you pick" stopped being a question
   worth asking.

   This file is the numbers for the two arena answers. Both are the same shape
   and that is deliberate: one press of ACTION, aimed at somebody, a long wait
   afterwards, and something a nine-year-old can see happen.

     盗  STEAL MISCHIEF   (Icewhisker) — mark her, then land a hit inside the
                          window and a Kotodama comes off her and rolls onto
                          the deck for anybody to fight over.
     息  DRAGON BREATH    (Windwhisker) — rear back, then breathe. Smaller and
                          shorter than the one she gets on a dragon, and it
                          cannot be stopped once it is charging.

   WHY STEALING IS THE SAME IDEA AS KNOCKING A TOWN OVER. The orbs woke up at
   100% mischief, and what woke them was disorder: every barrel, lantern and
   cane the girls put their paws through was entropy going up, and the Kotodama
   are what that potential looks like once it is out of the furniture. So an orb
   is not treasure, it is stored mischief — and mischief is exactly the kind of
   thing that can be knocked loose from somebody who is holding it. The ending
   says this out loud (see `systems/summonscene.js`, SCRIPTS.finale, and
   `docs/notes/story.md`); this file is the same sentence with a cooldown on it.
--------------------------------------------------------------------------- */

/**
 * 盗 STEAL MISCHIEF.
 *
 * THE PRESS DOES NOT TAKE THE ORB. It puts a mark on somebody, and the mark is
 * a promise she still has to keep: a hit — any hit, her blade, her dash, her
 * panda's claw — landed on that kitten inside `window` seconds is what knocks
 * the Kotodama loose. Asked for as "they can knock a random Kotodama orb off a
 * selected player if they manage to hit them within a certain time frame", and
 * the two halves of that sentence are why it is not simply a second attack:
 * the mark is the aiming, the hit is the earning, and in between there is a
 * visible chase that everybody watching can follow.
 *
 * `cool` IS LONG AND IS MEANT TO BE. Richard asked for 30-60 seconds. A round
 * is 120, so 40 means two goes in a long round and one in a short one — rare
 * enough that using it is a decision rather than a rotation, which is the
 * difference between a clan power and a button.
 *
 * `lock` IS THE ORB'S OWN REFUSAL TO BE PICKED UP, and it is the whole reason
 * this is interesting. Asked for as "maybe make it that it can't be picked up
 * for 3-5 secs after it is knocked out to force players to battle for it" —
 * without it the thief walks through her own steal and the orb never touches
 * the floor. Four seconds is long enough for a third kitten to get there.
 */
export const STEAL = tune('STEAL', {
  /** Seconds between uses. */
  cool: 40,
  /** Seconds the mark lasts. Miss for this long and the wait is still owed. */
  window: 5,
  /** How far away she can mark somebody, and the arc she has to be facing. */
  range: 7,
  arc: 60,
  /** Seconds a knocked-loose orb refuses everybody. See above. */
  lock: 4,
  /** How hard the orb is thrown off her — it lands beside her, not on her. */
  toss: 2.4,
});

/**
 * 息 DRAGON BREATH, ON FOOT.
 *
 * Richard's own comparison: "not as powerful/long range as normal
 * Dragonbreath, should be smaller and something used once in a while". The
 * breeds breathe 15-20 units with a spread of 0.5-0.95; this is 8.5 and 0.42,
 * so it is visibly the same trick at a kitten's size — about two and a half
 * katana lengths, on a 56-unit deck.
 *
 * IT CANNOT BE STOPPED AND IT CANNOT BE AIMED BY ANYBODY ELSE. "They can be
 * attacked while doing the ability, but they will continue with the ability if
 * attacked or hit unless they die. They don't get knocked back when hit while
 * doing the ability." All three of those live in `Player.hurt`, which skips the
 * throw and the cancel while `arenaBreathAt` is true — the damage is NOT
 * skipped, so charging it in front of somebody's blade still costs her the
 * fight if she is low. A knockout does stop it, through `_clearSpecials`.
 *
 * SHE KEEPS HER FEET. "Can be used when standing still or moving" — so she is
 * not planted like a Cross Slash; she walks at `moveK` while the charge runs
 * and her facing follows the stick, which is what makes "works in any
 * direction, controlled by the joystick" true without a second aiming system.
 * The flame goes where she is pointing at the moment it leaves her.
 *
 * AND THE BUBBLE GOES DOWN. "It should disable active shields while doing the
 * ability" — dropped through `_dropWard` on the frame the charge starts, so
 * she pays the ordinary wait for it, and `_startWard` refuses while she is
 * breathing.
 */
export const DBREATH = tune('DBREATH', {
  /** Seconds between uses — the same argument STEAL.cool makes. */
  cool: 40,
  /** Seconds of rearing back before it leaves her. The tell everybody else
   *  gets, and the reason this is not just a second slash.
   *
   *  IT WENT TO 1.6 AND CAME STRAIGHT BACK. "The duration of the attack should
   *  be twice as long" was read as the whole move, charge included; played, the
   *  charge was the half that felt wrong — "the charge up is taking too long,
   *  we should keep it charging for as long as it did previously". So the
   *  rear-back is the 0.8 it shipped at and the FLAME is the half that is
   *  twice as long. The warning is not weaker for it: what it lost in seconds
   *  it more than got back in `systems/clanfx.js` — the inhale pose, the
   *  vortex, the foot ring and `dbreathin` all landed in the same change, and
   *  the point of a tell is that it is noticed, not that it is slow. */
  charge: 0.8,
  /** Seconds the flame is on screen — doubled from the 0.5 it shipped at, and
   *  the half of the move that KEPT the doubling. It is a live hitbox for all
   *  of it now: the cone sweeps with her facing and catches anybody it crosses,
   *  once per `tick` each. See `Player._sweepArenaBreath`. */
  fire: 1,
  /**
   * Seconds a kitten the flame has already caught is safe from it, before the
   * same flame may catch her again.
   *
   * IT USED TO BE "ONCE, FOR EVER", which was the right answer to the wrong
   * question. The tally exists so a cone cannot deal damage at the frame rate
   * (see `BreathTally`), and "never again" is only the crudest way to get
   * that; what it actually bought was a flame you could stand inside for a
   * whole second having already paid for it. Asked for directly: "the shield
   * takes damage over time, so for every 0.5s the flame is on it, the shield
   * takes the equivalent of 1 swing hit on it, with the first hit happening as
   * soon as it collides. If the shield is broken and the player is still being
   * hit by it after 0.5s, then the player gets hit."
   *
   * SO THE NUMBERS SAY THE WHOLE RULE, AND NONE OF IT IS WRITTEN TWICE.
   * `fire` 1s at `tick` 0.5 is two bites: `WARD.hits` is 2, so a bubble is
   * absorbed on the first and smashed on the second, and a kitten standing in
   * it without one takes the hit on the first and is still invulnerable
   * (`COMBAT.invuln` 0.55 > 0.5) when the second arrives. Lengthen the flame on
   * the balance page and she burns; that is the move getting stronger, plainly,
   * rather than a second rule nobody can see.
   */
  tick: 0.5,
  /** How far, and how wide. Both well under a dragon's; see above. */
  range: 8.5,
  spread: 0.42,
  /** What it does when it lands. Between a standing slash (10) and a dash
   *  (15): it is a whole clan power on a 40-second wait, and it is also the
   *  only attack in the game that cannot be interrupted. */
  dmg: 13,
  knock: 12,
  lift: 3.2,
  /** How fast she may walk while it charges, as a fraction of her own speed.
   *  Slow enough to read as a commitment, not so slow it is a stun. */
  moveK: 0.45,
  /** THE HEART OF THE FLAME, and the only part of it that is not hers.
   *
   *  IT USED TO BE WINDWHISKER GREEN ALL THROUGH, on the argument that four
   *  kittens breathing in one round should read as one clan's trick. Played,
   *  that was exactly backwards: green on green on green is four people doing
   *  the same anonymous thing, and "it is hard to see the dragon breath in the
   *  match" was the report. A flame is now drawn in the PLAYER'S colour — the
   *  same colour as her ring, her name and her half of the screen — so a cone
   *  crossing the deck says who threw it before it says what it is.
   *
   *  What stays fixed is the core. Every fire anybody has ever looked at is
   *  hottest and therefore palest in the middle and coloured at its edges, and
   *  a cone that is one flat colour from mouth to tip reads as a spell. So the
   *  shards are mixed from this towards her colour as they travel, and this end
   *  of that mix is the one thing a clan colour may not move. */
  hot: 0xffe9a8,
});

/**
 * Does this clan's oath pay out in the ring, and under what name?
 *
 * ONE TABLE, ASKED BY EVERYTHING. The HUD pip, the profile screen, the round
 * card and the refusal toasts all want the same two facts — which power, what
 * is it called — and a second copy of that mapping is how the HUD ends up
 * calling it Sense Mischief while the toast calls it Steal Mischief.
 *
 * The four clans that are not here are not missing: their buffs are multipliers
 * on running, reaching and jumping, and those already apply in the ring because
 * nothing about them ever asked where she was standing.
 */
/**
 * Who a live flame has already bitten, and until when.
 *
 * WHAT IT IS FOR. `Game.strikePlayers` is handed one of these by 息 Dragon
 * Breath and by nothing else, and it asks it two questions: `has(body)` before
 * a blow and `add(body)` after one that landed. Everything else in the game
 * swings once and is done; a cone is a hitbox for a whole second and would
 * otherwise deal damage in proportion to how well the machine was running —
 * sixty bites a second on a fast one, thirty on a slow one. That is the bug
 * this object exists to make impossible.
 *
 * WHY IT IS NOT A `Set`. It was, and "caught once, safe for ever" is a rule
 * that reads correctly and plays wrong: a kitten who walked into the first
 * frame of the cone had paid for the entire breath and could stand in it. A
 * stamp per body says the same thing about the frame rate — the gap is in
 * SECONDS, so the number of bites is the same on any machine — while letting
 * a flame held on somebody go on costing her, which is what a flame is.
 *
 * PER BODY, NOT ONE CLOCK FOR THE WHOLE CONE. A sister caught 0.4s in must get
 * her own half second, not the 0.1 left of somebody else's; and a panda is a
 * body of its own here exactly as it is in the gate.
 */
export class BreathTally {
  /** @param {number} gap seconds before the same body may be bitten again */
  constructor(gap) {
    this.gap = Math.max(0, Number.isFinite(gap) ? gap : 0);
    /** Seconds since the flame left her. Advanced by the owner, never by a
     *  clock of its own — a tally that read the wall would keep running while
     *  the game was paused behind a scene. */
    this.t = 0;
    this.until = new Map();
    this.count = new Map();
  }

  step(dt) { this.t += dt; }

  has(body) {
    const until = this.until.get(body);
    return until !== undefined && this.t < until;
  }

  add(body) {
    this.until.set(body, this.t + this.gap);
    this.count.set(body, (this.count.get(body) ?? 0) + 1);
  }

  /** How many separate bites this flame has taken out of one body. Read by
   *  nothing in the game and by `world-check`, which is the point: the rule
   *  above is about a count over time, and a count over time is the thing that
   *  has to be asserted — "it did not hurt her twice" passes just as happily
   *  on a cone that stopped working. */
  bites(body) { return this.count.get(body) ?? 0; }
}

export const ARENA_POWERS = {
  steal: { id: 'steal', kana: '盗', name: 'Steal Mischief', cool: STEAL.cool },
  dbreath: { id: 'dbreath', kana: '息', name: 'Dragon Breath', cool: DBREATH.cool },
};

/** Which arena power this clan's buff grants, or null. */
export function arenaPowerFor(clan) {
  const b = clan?.buff;
  if (!b) return null;
  if (b.steal) return ARENA_POWERS.steal;
  if (b.arenaBreath) return ARENA_POWERS.dbreath;
  return null;
}
