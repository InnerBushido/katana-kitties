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
   *  DOUBLED FROM THE 0.8 IT SHIPPED AT, along with the flame, and asked for as
   *  one thing: "the duration of the attack should be twice as long". Both
   *  halves of it are the same move to a player — she rears back, she breathes
   *  — and lengthening only the flame would have made the warning shorter than
   *  the thing it warns about. It costs nothing in damage (that is applied once
   *  either way) and it buys the other kitten a whole second and a half to get
   *  out of a cone she can now see coming. */
  charge: 1.6,
  /** Seconds the flame is on screen. Damage is applied ONCE, on the frame it
   *  starts — see `Player._fireArenaBreath`. */
  fire: 1,
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
