import * as THREE from 'three';
import { Label, makeLabelTexture } from '../core/label.js';
import { tune } from '../core/tuning.js';

/* ---------------------------------------------------------------------------
   POWERUP KOTODAMA — the endgame collectible.

   The plain Kotodama Orb is a teaching object: one companion circling the
   kitten, drawing its own sin/cos working at a size you can read while you
   walk. These are the other thing. They are small, they sit close in, you wear
   up to eight of them at once, and every one changes a verb.

   WHY THEY REPLACE THE PLAIN ORB RATHER THAN SITTING ALONGSIDE IT. At 100%
   mischief every plain orb in the world and on both kittens is dissolved (see
   `systems/kotodama.js`), which sounds like taking away the thing the project
   is about. It isn't, and the reason is that the lesson has two homes: the
   Dojo of the Turning Circle is a walkable unit circle and is untouched by any
   of this. What the plain orb was carrying — that the numbers on screen are
   the numbers moving the thing — is carried here too, just smaller: the lead
   orb still prints its own live `cos θ` / `sin θ`, computed from the same two
   numbers that place it. The katakana are decoration AROUND a real readout,
   never instead of one. A prettier orb that lies about its own position would
   be worse than no orb.

   ONE TYPE, ONE VERB, AND IT WAS EIGHT OF EACH. Same rule the clans follow:
   swapping one changes how the game plays rather than recolouring a badge.
   Three are movement, two are reach and body, three are attacks she does not
   otherwise have — and the two on the end of the list are the dealer's, bought
   rather than found: one lengthens a block, one takes her off the floor
   entirely. See WORLD_ORB_IDS for what that split costs everything that reads
   the roster.

   THEY STACK, AND STACKING IS ADDITIVE, NOT MULTIPLICATIVE. Eight speed orbs
   at x1.22 each compounds to x4.9 and a kitten who cannot turn a corner;
   1 + 0.22n gives x2.76 at the same count, which is fast enough to be the
   joke and slow enough to still be a game. Every stack rule below is written
   as `1 + k*n` or `base + k*n` for that reason, and `world-check` asserts the
   eight-stack case for each one rather than the single.
--------------------------------------------------------------------------- */

/**
 * Nobody carries more than this.
 *
 * IT IS NOT THE SIZE OF THE ROSTER AND THE TWO USED TO BE THE SAME NUMBER.
 * There were eight kinds and eight slots, so every screen drew eight of
 * something and it was never clear which eight it meant. The roster is nine
 * ten now — see `aegis` and `blink` — and the screens that show a LIST of
 * kinds scroll, while
 * the screens that show her SLOTS still draw exactly this many. Any screen
 * that hard-codes 8 is wrong about one of the two.
 */
export const MAX_EQUIPPED = 8;

/**
 * The ten.
 *
 * `kanji` is what the orb prints on itself and what the profile screen shows;
 * `name` is the romaji the toasts use, because a nine-year-old cannot read the
 * first one and the sight of it is the point of having it.
 */
export const POWER_ORBS = [
  {
    id: 'swift',
    stack: true,
    name: 'Hayate',
    kanji: '疾',
    label: 'GALE',
    color: 0x53e2ff,
    blurb: 'Run faster.',
    detail: (n) => `Run speed x${(1 + 0.22 * n).toFixed(2)}`,
  },
  {
    id: 'reach',
    stack: true,
    name: 'Nagagiri',
    kanji: '斬',
    label: 'LONG CUT',
    color: 0xc08bff,
    blurb: 'The katana reaches further.',
    detail: (n) => `Katana reach x${(1 + 0.30 * n).toFixed(2)}`,
  },
  {
    id: 'vigor',
    stack: true,
    name: 'Kongo',
    kanji: '剛',
    label: 'ADAMANT',
    color: 0x6bf08a,
    blurb: 'More health in the ring.',
    detail: (n) => `Max health ${100 + 30 * n}`,
  },
  {
    id: 'leap',
    stack: true,
    name: 'Tobi',
    kanji: '跳',
    label: 'LEAP',
    color: 0xffe14f,
    blurb: 'One more jump in the air.',
    detail: (n) => `${2 + n} jumps`,
  },
  {
    id: 'ward',
    name: 'Kabe',
    kanji: '壁',
    label: 'WARD',
    color: 0x9fd8ff,
    blurb: 'HOLD the dragon button for a shield you cannot be hurt through.',
    /* THE ONE ROW THAT READS THE REST OF THE SET. Everything else on this
       screen is a function of its own count; the ward's block length is not
       any more, and printing a flat 2.0s to a girl wearing two 守 would be the
       shelf lying about the thing she paid for. `counts` is optional, so a
       caller that has not got it still gets the shipped numbers. */
    detail: (n, counts) => {
      const nA = counts?.aegis ?? 0;
      const g = wardFor(n, nA);
      return `${g.max.toFixed(1)}s of block, ${g.cool.toFixed(2)}s wait`
        + (nA ? ` — 守 +${(AEGIS.add * nA).toFixed(1)}s` : '');
    },
  },
  {
    id: 'dive',
    name: 'Otoshi',
    kanji: '落',
    label: 'POWER DIVE',
    color: 0xff7a3d,
    blurb: 'Interact in the air to fall like a hammer.',
    detail: (n) => `Dive damage ${DIVE.dmg + 6 * (n - 1)}`,
  },
  {
    /* `tri` FOR EVER. The id is written into every save file and read by the
       trade screen's stock table; the name beside it is free to change, and
       has — this was Sanzan / 三 / TRIPLE SLASH until the move learned to hold
       what it catches, at which point it was Cloud's and got his name for it.
       十 is the kanji for ten and is also, conveniently, a drawn cross. */
    id: 'tri',
    name: 'Juuji',
    kanji: '十',
    label: 'CROSS SLASH',
    color: 0xff6fae,
    blurb: 'Hold attack for three cuts that freeze whoever they catch, then send her flying. Tap for an ordinary swing.',
    detail: (n) => `3 cuts, x${(1 + 0.15 * (n - 1)).toFixed(2)} damage`,
  },
  {
    id: 'charge',
    name: 'Totsugeki',
    kanji: '突',
    label: 'CHARGE',
    color: 0xffd166,
    blurb: 'Attack while sprinting to charge straight through.',
    detail: (n) => `${(CHARGE.dist + 4 * (n - 1)).toFixed(0)}-unit charge`,
  },
  {
    /* THE NINTH, AND THE FIRST ONE THAT IS NOT IN THE WORLD.

       Every other orb lies on an island waiting to be walked up. This one is
       only ever on the dealer's shelf, and that is the whole shape of it: it
       is the rare thing, the one you have to have been to the ring for, and a
       rare thing you can trip over on a beach is not rare.

       IT DOES NOTHING ON ITS OWN, ON PURPOSE. Wearing it without 壁 Ward is a
       wasted slot — `aggregate` returns `ward: null` with no Ward orb, so
       there is nothing for this to add to. That is a real cost and it is the
       reason it may be as strong as it is: the set costs her two slots before
       it costs her a point, and the shelf's price is on top of that.

       AND IT IS THE ONE ORB THAT MOVES `WARD.max`, WHICH WAS A HARD CAP.
       That cap is still the rule — eight WARD orbs do not lengthen the block
       by a frame, and `world-check` still asserts it. What changed is that
       there is now exactly one way to buy seconds, it is visible on the shelf,
       it is expensive, it eats slots, and going past the old two seconds
       charges her a longer wait afterwards (`AEGIS.penalty`). A cap you can
       lift by paying is a decision; a cap that quietly rises with a stack of
       the same orb is the state the ward was designed not to be. */
    id: 'aegis',
    stack: true,
    shopOnly: true,
    /* WHAT IT IS USELESS WITHOUT, as a field rather than as a sentence in the
       blurb. `world-check` reads it: every other orb has to change something
       on its own, and this one has to change NOTHING on its own and something
       when worn beside what it names. Written as prose that rule could only
       have been checked by naming `aegis` in the test, which stops being true
       the day there is a second booster. */
    needs: 'ward',
    /* Twice what a move orb stocks, because a booster is only half a purchase:
       the pair is what does anything, and a shelf holding one of these behind
       a Ward she also has to find is a set nobody completes. */
    stockN: 2,
    priceK: 2.5,
    name: 'Nagamori',
    kanji: '守',
    label: 'LONG GUARD',
    color: 0x5b6bff,
    blurb: 'Rare — the dealer only. Your 壁 Ward holds for longer. Useless without one.',
    detail: (n) => `+${(AEGIS.add * n).toFixed(1)}s of block, with 壁 Ward`,
  },
  {
    /* THE TENTH, AND THE SECOND ONE THAT IS ONLY ON THE SHELF.

       守 Long Guard made "rare" mean "bought, never found", and this is the
       same kind of thing said about a MOVE instead of about a stat. It does
       not stack — one Flash Step is the whole ability, and a second copy would
       be a slot spent on nothing — so it stocks like every other move orb (one,
       plus one per extra kitten) rather than doubling the way 守 does. What it
       shares with 守 is the price: 2.5x, on the shelf, and you have to have
       been to the ring to see it at all.

       IT IS THE ONLY ORB THAT MOVES HER WITHOUT MOVING HER. Everything else in
       this list changes a number a verb already reads — how fast, how far, how
       hard. This one takes the floor away for half a second and puts her down
       somewhere else, and while it runs she is untouchable and cannot walk,
       jump, block or dive. See DODGE for the whole shape of it, and
       `Player._startDodge` for the sequencing. */
    id: 'blink',
    shopOnly: true,
    priceK: 2.5,
    name: 'Shunpo',
    kanji: '瞬',
    label: 'FLASH STEP',
    color: 0x21d6a8,
    blurb: 'Rare — the dealer only. Sprint + Interact: vanish, and land somewhere else. Nothing can touch you on the way.',
    detail: () => `${DODGE.invuln.toFixed(2)}s gone, ${DODGE.cool.toFixed(2)}s wait`,
  },
];

/**
 * The ids that are scattered over the islands, and the ones that are not.
 *
 * A SHOP-ONLY ORB IS A NEW KIND OF THING and everything that reads the roster
 * has to be asked which list it wants. `spawnPickups` cycles WORLD_ORB_IDS so
 * the guarantee that every power is findable on foot still holds for every
 * power that is supposed to be; the Awakening prize draws from the same list,
 * because a rare orb falling out of the sky at the moment the endgame opens is
 * the one way to make it not rare. `ORB_IDS` stays the whole roster and is
 * what the shelf, the profile and the trade screen count.
 */
export const WORLD_ORB_IDS = POWER_ORBS.filter((o) => !o.shopOnly).map((o) => o.id);
export const SHOP_ONLY_IDS = POWER_ORBS.filter((o) => o.shopOnly).map((o) => o.id);

export const ORB_BY_ID = Object.fromEntries(POWER_ORBS.map((o) => [o.id, o]));
export const ORB_IDS = POWER_ORBS.map((o) => o.id);

/**
 * How many of each kind are in a list of ids.
 *
 * THE SECOND ARGUMENT `detail` TAKES. One row on every inventory screen — 壁
 * Ward's — is a function of an orb that is not itself, so a screen drawing a
 * row has to be able to hand it the rest of the set. Same shape `aggregate`
 * puts in `counts`, so the two are interchangeable at a call site.
 */
export const countsOf = (ids = []) =>
  Object.fromEntries(ORB_IDS.map((id) => [id, ids.filter((x) => x === id).length]));

/**
 * How many of each the dealer has at open.
 *
 * THE FOUR STAT ORBS ARE STOCKED DEEP AND THE FOUR MOVES ARE NOT, and the two
 * halves of the roster want opposite things from a shop. Gale, Long Cut,
 * Adamant and Leap are worth having four of — the whole point of them is the
 * number going up, and a second one is a real, felt difference. A second
 * Charge orb only widens a charge she already has; the move is the prize, and
 * the fourth copy of it is a slot she could have spent on something she cannot
 * do at all.
 *
 * IT DOES NOT MAKE THEM CHEAP. The world holds four orbs per player, so the
 * only way to STACK is to buy — and a purse buys three orbs TOTAL. The shelf
 * being deep moves the scarcity from "the dealer hasn't got one" to "you
 * cannot afford it and your sister has two", which is the scarcity that
 * produces a conversation instead of a shrug.
 *
 * THE SHELF GROWS WITH THE PARTY: one more of every kind per player past the
 * second. Four kittens shopping off a shelf sized for two means the third one
 * to reach the market finds it empty, which is not scarcity — scarcity is a
 * price you cannot meet, and an empty shelf is just being late. The four move
 * orbs go from one to three rather than to four, so they stay the thing you
 * mostly get by trading.
 *
 * A SPEC MAY NAME ITS OWN NUMBER with `stockN`, and exactly one does. 守 Long
 * Guard is stackable in effect but is stocked off the MOVE orbs' shallow shelf
 * rather than the deep one, at twice their count — it is a booster, so what it
 * needs is to be buyable in a PAIR, not to be buyable four deep. The party
 * bonus is added to it the same as everything else, so a fourth kitten still
 * widens the shelf rather than finding it empty.
 */
export const STOCK_STACKABLE = 4;
export const STOCK_UNIQUE = 1;
export const stockFor = (id, players = 2) => {
  const extra = Math.max(0, players - 2);
  const spec = ORB_BY_ID[id];
  const base = Number.isFinite(spec?.stockN)
    ? spec.stockN
    : (spec?.stack ? STOCK_STACKABLE : STOCK_UNIQUE);
  return base + extra;
};

/* --------------------------- the three abilities -------------------------- */

/**
 * The ward. HELD, not toggled.
 *
 * ON THE DRAGON BUTTON, AND THE DRAGON STILL WINS IT. `mount` already means
 * "get on the thing next to me", and a kitten standing beside a storm dragon
 * pressing it and getting a bubble instead would read as the game refusing to
 * let her fly. `Player._updateGround` tries every mount first and only reaches
 * the ward when nothing was in range — which is nearly always, because a
 * dragon is a place you walk to.
 *
 * IT IS A BUTTON YOU HOLD DOWN, AND THAT IS THE WHOLE DIFFERENCE BETWEEN A
 * BLOCK AND AN INVULNERABILITY. The first version was a toggle: press once,
 * get three seconds. Three seconds is a long time in a fight two nine-year-olds
 * are having, and a shield that stays up while she does something else is not
 * a decision — it is a state she is in. Holding costs her the button for as
 * long as she wants the cover, so blocking is something she is *doing*.
 *
 * `max` IS A HARD CAP AND STACKING DOES NOT MOVE IT. Two seconds, however many
 * Ward orbs she is wearing. Stacks buy a shorter WAIT instead, which is the
 * only one of the two numbers that can grow without the shield eventually
 * being up more than it is down.
 *
 * ONE ORB LIFTS IT AND IT IS NOT THIS ONE. 守 Long Guard, the ninth orb, is
 * bought and never found, costs two and a half times the shelf price, occupies
 * a second slot beside the Ward it is useless without, and charges her a
 * longer wait for every block she runs past the old two seconds (`AEGIS`).
 * That is the difference the cap was defending: seconds you PAY for are a
 * decision, seconds that arrive with the fourth copy of an orb you were
 * collecting anyway are the state the ward was designed not to be.
 *
 * `tail` — it keeps working for a fifth of a second after she lets go. Without
 * it, a blow that lands on the exact frame her thumb comes off reads as the
 * block failing, and a kid cannot tell that apart from a block that does not
 * work. It is short enough that letting go early is still letting go.
 *
 * THE WAIT STARTS WHEN SHE RELEASES, not when the tail ends and not when she
 * pressed. Started at the press, a 2s block on a 1.5s cooldown is already
 * available again before it runs out. Started at the end of the tail, the two
 * numbers on the profile screen do not add up to the gap she actually feels.
 *
 * `regrab` — HOW LONG THE SECOND TAP HAS TO UNDO THE FIRST TAP'S RELEASE, and
 * it is not the double-tap window. A double tap IS press-release-press, so by
 * the time the second press arrives the release has already ended the block and
 * charged the wait; this is the grace in which `Player._latchWard` can take
 * that back. Half a second against a 340ms tap window, so a gesture is never
 * lost to one long frame, and short enough that it can only ever forgive a
 * release the player is visibly still in the middle of.
 *
 * IT IS NOT A SECOND ABILITY. Latching buys her the BUTTON — two thumbs cannot
 * hold three things, which is the same problem the touch pad's RUN latch
 * solves. It buys no extra seconds: `wardUsed` keeps running, so a latched
 * bubble pops on the same frame a held one would have.
 *
 * QUARTER GRAVITY WHILE IT IS UP, and that is what makes it an air move rather
 * than a panic button. Holding it at the top of a jump turns a fall into a
 * float, which is how you cross to a shard or hang over a sister winding up a
 * dash — and now it costs her the two seconds she is holding it for.
 */
/* THE SHIELD IS A BUDGET, NOT A WALL, AND THAT IS WHAT `hitCut` BUYS.

   Reported as a feature and it fixes a real problem: a bubble that costs
   nothing to run into is a bubble her sister has no reason to swing at, so the
   two of them stand there and the round is a staring contest. Every blow it
   stops now takes HALF THE CLOCK OFF IT — the ceiling is halved, `wardUsed`
   is untouched, so a 2.0s block struck at 0.5s has 1.0s of ceiling and half a
   second left to live. The player asked for exactly that arithmetic.

   HALVING THE CEILING RATHER THAN ADDING TO THE CLOCK is what makes the tell
   free. `_updateWardMesh` already flickers over the last `dying` seconds of
   whatever the ceiling is, so a struck bubble starts warning on its own with
   nothing to keep in step — and a bubble struck so late that the new ceiling
   is already behind the clock simply has no life left, which is the "if the
   timer has expired, just turn it off" case falling out of the same line.

   `hits` IS THE FLOOR UNDER THE HALVING. Halving alone never reaches zero, so
   without this a kitten who blocks early enough could ride a sliver of bubble
   through an entire exchange; and a shield that survives being hit twice does
   not read as a shield anybody broke. The second blow smashes it whatever the
   clock says.

   IT RESETS WITH THE BLOCK, NOT WITH THE ROUND. `_popWard` takes a fresh
   ceiling and a fresh count, so the punishment is for the bubble that was hit
   and nothing else — the cooldown is what carries the cost forward. */
export const WARD = tune('WARD', {
  max: 2.0,
  hitCut: 0.5,
  hits: 2,
  breakT: 0.45,
  tail: 0.2,
  cool: 1.5,
  coolMin: 0.4,
  gravity: 0.25,
  radius: 2.6,
  regrab: 0.5,
});

/**
 * 守 LONG GUARD — the seconds you can buy, and what they cost afterwards.
 *
 * `add` IS PER ORB AND ADDITIVE, like every other stack in this file. One is
 * 2.6s of block, two is 3.2s. The multiplicative version reaches numbers that
 * are not a shield any more, and the additive one is also the version a child
 * can predict: another orb is another six tenths, every time.
 *
 * `penalty` IS WHAT MAKES THE EXTRA SECONDS A DECISION RATHER THAN A GIFT, and
 * the shape of it was asked for precisely: hold the bubble past the DEFAULT two
 * seconds and the wait afterwards is a fifth longer. So the orb does not make
 * her stronger, it widens the choice she is making with the button — she can
 * spend her new ceiling and pay for it, or let go at two seconds and be back as
 * fast as she ever was. A booster nobody can misuse is a stat, not a move.
 *
 * IT IS MEASURED AGAINST THE DEFAULT MAX, NOT THE CURRENT CEILING, AND THAT IS
 * DELIBERATE. `hitCut` halves the ceiling when a blow lands, so a bubble that
 * was smashed at 1.5s has a ceiling of 1.5s and has "run to the end" — charging
 * her the overtime for that would mean her SISTER decides when she pays it. The
 * question is only ever "how long was it actually up", which is `wardUsed`, and
 * only ever against `over`. The player's own example: 2.2s elapsed and then a
 * hit that ends it at a 1.5s ceiling still pays, because 2.2 > 2.0.
 *
 * WITHOUT THE ORB THIS CANNOT FIRE. No 守 means the ceiling IS `over`, so
 * `wardUsed > over` is never true on the frame the block ends — the whole
 * mechanic is dead code for anybody who has not bought into it, which is what
 * lets it exist at all without touching the two-player game.
 */
export const AEGIS = tune('AEGIS', {
  add: 0.6,
  penalty: 0.2,
  /* How long the "you can block again" spark lasts. Long enough to be seen in
     a quarter pane at arm's length, short enough that it is over before she
     has finished pressing the button it is telling her about. */
  ready: 0.5,
});

/**
 * The two ward numbers, for a given count of each orb.
 *
 * ONE PLACE, BECAUSE THREE SCREENS AND THE PLAYER ALL ASK. `aggregate` builds
 * the live one; the profile row and the personal card print it; and the ward's
 * own `detail` calls it so the sentence a girl reads on the shelf is computed
 * from the same line that runs the bubble. A number shown in words and a number
 * used in play that are worked out separately are two numbers.
 */
export function wardFor(ward = 1, aegis = 0) {
  return {
    max: WARD.max + AEGIS.add * Math.max(0, aegis),
    cool: Math.max(WARD.coolMin, WARD.cool - 0.25 * (ward - 1)),
    /* CARRIED WITH THE NUMBERS RATHER THAN LOOKED UP, so `_dropWard` does not
       have to know which orb causes an overtime penalty — only that this block
       had a line it could go past and what it costs to have gone past it. */
    over: WARD.max,
    penalty: 1 + AEGIS.penalty,
  };
}

/**
 * The power dive. Interact, in the air, and she drops.
 *
 * `interact` is free up there by construction: the only thing it does on the
 * ground is swear an oath at a shrine or open the stall, and neither of those
 * is reachable off the floor. No new button, which is the rule the tournament
 * set and the one worth keeping — two kids on Joy-Cons have six buttons
 * between them and every one is already spoken for.
 */
export const DIVE = tune('DIVE', {
  speed: 46,
  dmg: 22,
  knock: 14,
  lift: 6.5,
  radius: 4.2,
});

/**
 * The CROSS SLASH — Cloud's, by way of a nine-year-old who has played Smash.
 * Hold attack; she plants and cuts three times.
 *
 * The orb's id is still `tri` and so is its entry in `ATTACKS`. Those two
 * strings are written into save files and read by the trade screen, and
 * renaming them would cost every profile already on a machine its orb. The
 * name a player sees lives in POWER_ORBS below; this is the only note tying
 * the two together.
 *
 * SHE CANNOT MOVE OR JUMP THROUGH IT, which is the cost that makes it worth
 * having. In the air she gets quarter gravity for the duration instead of
 * being frozen — freezing a falling kitten in mid-air reads as the game
 * hanging, and a slow drift through three cuts reads as the move.
 *
 * IT USED TO BE THREE CUTS AT A CORPSE. The first swing knocked the target
 * away with ordinary knockback and the other two hit the air where she had
 * been — so the move was strictly worse than one slash, and read as the game
 * stuttering. The three cuts now HOLD whoever they catch: stunned in place,
 * gravity off, untouchable by anybody else, damage banking up. When the last
 * one lands there is a beat, and then everything held goes flying at once.
 *
 * That is Smash's charged bat, and it is deliberate — a big hit needs a moment
 * of nothing before it to be worth landing. `hang` is that moment.
 *
 * `hold` IS THE TAP/HOLD LINE, AND IT HAS BEEN BOTH WAYS.
 * It started at 0.22, which was wrong for a different reason: back then the
 * ordinary swing had ALREADY been thrown by the time the line was crossed, so
 * the move could only ever be a slash PLUS three cuts, at a target the slash
 * had already knocked out of reach. Making the swing fire on the RELEASE fixed
 * that and the line came down to 0.05 with it, on the theory that a shorter
 * wait meant a snappier ordinary slash.
 * THAT THEORY WAS WRONG IN THE HAND. At 0.05 a kid who means to slash gets the
 * technique — three frames is shorter than a deliberate tap, let alone the
 * grip of somebody mashing — so the ordinary swing became the hard one to
 * throw, which is backwards. It is 0.25 now, and the latency argument that
 * justified 0.05 does not survive contact either: the swing goes out WHEN SHE
 * LETS GO, so a 90ms tap is a 90ms slash. This number is not a delay she pays,
 * it is only the length of hold that means she wanted the other move.
 *
 * `gap` IS THE LENGTH OF ONE CUT, and every cut gets one, the third included —
 * so the cutting is `cuts * gap` end to end, near enough a second. It has been
 * 0.16 and 0.21 and both were too fast to see three of anything happen.
 *
 * `wind` IS THE WIND-UP, AND IT IS THE PRICE OF THE REWORK. Four adults played
 * a round of this and the verdict was that the move had become too good: the
 * cuts hold now, so the whole technique lands as one unavoidable lump, and the
 * only thing standing between a kitten and that lump was a quarter-second of
 * hold she could pay while still walking around. So she plants for `wind`
 * BEFORE the first cut, visibly, and anybody watching has that long to move.
 *
 * IT IS A SEPARATE NUMBER FROM `hold` AND MUST STAY ONE, however much
 * `hold + wind` looks like it wants to be a single 0.5. They are two different
 * questions asked of the same press. `hold` is "did she mean the other move?"
 * — it has to stay short and she has to stay MOBILE through it, because every
 * ordinary slash pays it and a kitten who freezes for half a second every time
 * she taps attack has lost the ordinary slash. `wind` is "she meant it, and
 * now she is committed" — she is planted, and its length is a balance knob
 * that will get turned again. Collapsing them would mean either freezing the
 * tap window or shortening the tell, and the tell is the whole fix.
 *
 * LETTING GO DURING `wind` ABORTS, and this is deliberately NOT a cancel of
 * the technique proper. Nothing has been thrown yet and nobody has been caught
 * yet; she has spent the wind-up planted and gets nothing for it, which is the
 * risk that makes the commitment mean something. Once the first cut is out she
 * is in it to the end — see `Player._stepSpecials`, and `Player.hurt`, which
 * is the one thing that CAN stop it.
 */
export const CROSS = tune('CROSS', {
  cuts: 3,
  gap: 0.3,
  hold: 0.25,
  /** Planted, committed, and nothing thrown yet. See above. `hold + wind` is
   *  the half second of holding the button before the first cut. */
  wind: 0.25,
  gravity: 0.25,
  /** The beat between the last cut and the launch. Smash's pause-for-effect. */
  hang: 0.25,
  /** ...and how long she cannot attack, or block, once it is over. See
   *  `Player.triLockT` — the block is locked out for the whole technique and
   *  this long afterwards, because a bubble popped out of the recovery would
   *  make the move free.
   *  0.75, UP FROM 0.5 — the other half of the same playtest as `wind`. Half a
   *  second of recovery is under two of the technique's own cuts, so a kitten
   *  who landed one could simply throw another before anybody had got back up.
   *  `crossReady` chimes when it runs out, because a recovery long enough to
   *  matter is long enough to lose track of mid-fight. */
  cool: 0.75,
  /** THE LAUNCH IS NOT `tri.knock`. That number is per-cut and deliberately
     feeble — nine damage and a nudge — because the cuts are not supposed to
     move anybody any more; they are supposed to HOLD. All the force the move
     ever had is spent here, once, on everything it caught. */
  knock: 30,
  lift: 13,
});

/**
 * The charge. Sprint into an attack and she goes straight through it.
 *
 * GRAVITY IS OFF FOR THE DURATION, IN THE AIR AND ON THE GROUND. On the ground
 * that is invisible and harmless; in the air it is the whole move, because a
 * charge that arcs is a jump with a sword in it. It ends early on hitting
 * anything solid, so charging a clan hall stops at the wall rather than
 * pushing a kitten through it.
 */
export const CHARGE = tune('CHARGE', {
  dist: 16,
  speed: 42,
  dmg: 18,
  knock: 22,
  lift: 5.5,
  radius: 2.4,
});

/**
 * 瞬 FLASH STEP — half a second of not being there.
 *
 * THE WHOLE MOVE IS ONE NUMBER TWICE. `invuln` is how long she is gone and
 * untouchable, and it is ALSO how long she cannot move once she lands — asked
 * for that way, and it is the thing that makes the move a trade rather than a
 * free escape. Half a second of nothing can touch you, then half a second of
 * standing there while everybody works out where you went. Two knobs would let
 * somebody set the second to zero and delete the cost.
 *
 * `commit` IS THE FRACTION OF `invuln` AT WHICH THE STICK IS READ, and the
 * fifth that is left after it is the reappearing. It exists because the
 * direction cannot be taken on the press: she is holding sprint, which means
 * she was almost certainly already running somewhere, and a teleport that fires
 * along the direction her thumb happened to be pointing at the instant she hit
 * the button is a teleport nobody aims. Four fifths of the vanish is the window
 * she has to say where — and the reticle is already on whoever she is about to
 * pivot around, so it is a window she can see.
 *
 * `lockDeg` IS THE DIFFERENCE BETWEEN AIMING AND HAPPENING TO BE HOLDING. Five
 * degrees off where the stick was when she pressed is a deliberate movement;
 * anything less is the same push she was already making. It matters in exactly
 * one place — a stick that is CENTRED at the commit mark. If she never aimed,
 * that means "stay where I am"; if she aimed and then let go, it means the last
 * direction she asked for. Without the threshold those two are the same input.
 *
 * `range` IS IN THE GAME'S OWN UNIT, WHICH IS THE METRE, AND THE ASK SAID TEN
 * FEET. Ten feet is 3.05, and `BASE_REACH` — the length of a katana swing — is
 * 3.4: a detection range shorter than her own sword would make the second half
 * of the targeting rule ("or anybody your swing would already reach") strictly
 * larger than the first, and the ten-foot clause would never once have decided
 * anything. Ten of the unit everything else in this file is written in is the
 * reading that leaves both halves of the rule alive, and it is on the balance
 * page precisely because the right number is a thing you find by playing.
 *
 * `arc` IS A HALF-ANGLE IN DEGREES, off dead ahead — "a 60 degree splay from
 * their forward direction", read literally. Everything else in the combat code
 * states its arc as a cosine floor (`ATTACKS.stand.arc`) because that is what
 * the dot product wants; this one is degrees because it is a knob a person sets
 * on a page, and `Math.cos` is one call.
 *
 * `selfK` IS HOW FAR SHE GOES WITH NOBODY TO PIVOT AROUND: half the detection
 * range, so the "flee" version of the move is deliberately shorter than the
 * "get behind her" version. That is the right way round — the escape is the
 * safe option and should not also be the long one.
 *
 * `cool` STARTS LIFE AS THE WARD'S WAIT AND IS WRITTEN OUT RATHER THAN READ
 * FROM IT. Asked for as "the same time as the shield cooldown, but a separate
 * variable" — so the number is 1.5 here in full. Deriving it would have meant a
 * tuning override on WARD silently moving a move that has nothing to do with
 * the ward, which is exactly the coupling the ask was asking not to have.
 */
export const DODGE = tune('DODGE', {
  invuln: 0.5,
  cool: 1.5,
  commit: 0.8,
  lockDeg: 5,
  range: 10,
  arc: 60,
  selfK: 0.5,
});

/* ------------------------------- aggregation ------------------------------ */

/**
 * Fold a kitten's orbs into one buff object.
 *
 * ONE FUNCTION, CALLED FROM EVERYWHERE, AND IT TAKES A LIST OF IDS. Every
 * caller that wants to know "how fast is she" — the controller, the profile
 * screen, the smoke test — asks this, so there is no second place where the
 * stacking maths can drift from the first. Passing ids rather than orb objects
 * is what lets `world-check` ask the question without building any geometry.
 *
 * @param {string[]} ids
 */
export function aggregate(ids = []) {
  const n = (id) => ids.filter((k) => k === id).length;
  const swift = n('swift');
  const reach = n('reach');
  const vigor = n('vigor');
  const leap = n('leap');
  const ward = n('ward');
  const dive = n('dive');
  const tri = n('tri');
  const charge = n('charge');
  const aegis = n('aegis');
  const blink = n('blink');

  return {
    counts: Object.fromEntries(ORB_IDS.map((id) => [id, n(id)])),
    total: ids.length,
    speed: 1 + 0.22 * swift,
    reach: 1 + 0.30 * reach,
    hp: 100 + 30 * vigor,
    jumps: leap,
    /* Only the WAIT moves with a stack of WARDS. The two seconds of block are
       still a hard cap against its own orb — no count of them turns the shield
       back into a state she is in. `aegis` is the one thing that lifts it, and
       it is a different orb, bought rather than found, that does nothing at all
       on its own. See WARD and AEGIS.

       AND IT IS NULL WITHOUT A WARD, WHICH IS HOW 守 STAYS HONEST. Eight Long
       Guards and no Ward is eight wasted slots — there is no object here for
       them to add to — and that is the sentence the shelf and the Help card
       both make: it is useless on its own. */
    ward: ward ? wardFor(ward, aegis) : null,
    dive: dive ? { dmg: DIVE.dmg + 6 * (dive - 1) } : null,
    tri: tri ? { dmgK: 1 + 0.15 * (tri - 1) } : null,
    charge: charge ? { dist: CHARGE.dist + 4 * (charge - 1) } : null,
    /* NOTHING TO STACK, SO NOTHING IN THE OBJECT. It is the only entry here
       that is a bare flag, and that is the honest shape: a second 瞬 Flash
       Step buys nothing, the shelf stocks it like a move rather than like a
       booster, and every timing the move has lives in DODGE where the
       balance page can reach it. An empty object rather than `true` so a
       later field (a longer vanish for a second copy, say) is an addition
       and not a change of type. */
    blink: blink ? {} : null,
  };
}

/* -------------------------------- economy --------------------------------- */

/**
 * What the stall charges.
 *
 * DERIVED FROM THE WORLD, NOT PICKED. Every point either kitten will ever have
 * comes from knocking something over, the orbs only exist once everything has
 * been knocked over, so the entire economy is a fixed pot: `world.pointsTotal`,
 * currently 4550 across 216 props. Two girls who split it evenly hold about
 * 2275 each, and the brief is that all of it buys three or four orbs — so the
 * price is that share divided by 3.5.
 *
 * That number matters more than it looks. Eight types, a stall that stocks one
 * of each, and a wallet that reaches three of them is what makes TRADING the
 * way you build a set rather than an extra you can ignore: there is no amount
 * of playing that buys a stack, and the only other copies in the world are the
 * ones lying on the islands and the ones in your sister's hand.
 *
 * THE SHARE IS PER PLAYER, so the divisor is the party size rather than 2. The
 * pot is fixed — it is every prop in the world — so four kittens split it four
 * ways, and leaving the price alone would quietly halve what each of them can
 * buy and turn "your share buys three or four" into "your share buys one and a
 * half". Two players give exactly the number they gave before.
 *
 * @param {number} totalPoints every point earnable in the world
 * @param {number} players     how many kittens are splitting it
 */
export const BUYS_PER_PURSE = 3.5;
export const SELL_FRACTION = 0.75;

export const orbPrice = (totalPoints, players = 2) =>
  Math.round(totalPoints / Math.max(1, players) / BUYS_PER_PURSE);
export const orbSellPrice = (totalPoints, players = 2) =>
  Math.round(orbPrice(totalPoints, players) * SELL_FRACTION);

/**
 * What THIS orb costs, which is not what every orb costs any more.
 *
 * `priceK` IS A MULTIPLIER ON THE SHELF PRICE, NOT A PRICE. The base is
 * derived from the world's own point total (see above) and has to stay derived
 * — a rare orb with a typed-in price would drift the moment a prop was added
 * to an island. 守 is 2.5x, so it is most of a purse on its own and the pair it
 * needs is more than one; that is the whole of its rarity, and it is a number
 * on the shelf rather than a lock on a door.
 *
 * SELLING IS THE SAME FRACTION OF THE SAME PRICE, so a rare orb sells for more
 * than a common one and the 25% fee is proportional. Selling a 守 back at the
 * common price would have been a way to convert points into fewer points.
 */
export const orbPriceFor = (id, totalPoints, players = 2) =>
  Math.round(orbPrice(totalPoints, players) * (ORB_BY_ID[id]?.priceK ?? 1));
export const orbSellPriceFor = (id, totalPoints, players = 2) =>
  Math.round(orbPriceFor(id, totalPoints, players) * SELL_FRACTION);

/* ------------------------- the worn companion orb ------------------------- */

/** Scratch, so turning sixteen orbs toward two cameras allocates nothing. */
const _q = new THREE.Quaternion();
/** Scratch for the camera-ward lift below. */
const _v = new THREE.Vector3();

/* HOW FAR THE TEXT IS PUSHED TOWARDS THE CAMERA, in world units.
 *
 * WHY THERE IS A LIFT AT ALL. Every quad on this orb used to carry
 * `depthTest: false`, so the kanji and the cos/sin readout drew over the whole
 * world — through a house, through a dragon, through the kitten wearing them.
 * Reported from play as the glyphs "not being covered up by 3D objects", and
 * it looks like a bug in the sky rather than a label: text on a ring that
 * orbits a cat passes BEHIND her several times a second, and every one of
 * those passes was drawn in front.
 *
 * WHY IT IS NOT JUST `depthTest: true`. That is what the old comment was
 * defending against: `mark` is a 0.4-unit quad pinned to the centre of a
 * sphere whose halo reaches 0.44 and breathes to 0.49, so at equal depth the
 * sort flickers the glyph in and out of the ball it is labelling. Turning the
 * test on without moving anything trades a label that ignores the world for a
 * label that strobes.
 *
 * So the quad is moved instead: depth testing on, and the plane shifted along
 * the line to the camera until it clears its own orb. 0.62 beats the breathing
 * halo's 0.49 with room to spare, and is small enough that the glyph still
 * reads as sitting ON the ball rather than floating off it. The rain column
 * hangs 1.25x further out than the orb already, so it only needs enough to
 * clear the kitten's own body when the ring swings in front of her. */
const MARK_LIFT = 0.62;
const RAIN_LIFT = 0.3;

/** Katakana the drifting glyphs are drawn from. Deliberately not kanji: these
 *  are meant to read as a rain of characters rather than as words, which is
 *  what the Matrix look actually is. */
const KANA = [...'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン'];

/**
 * One worn orb.
 *
 * SMALLER AND CLOSER IN THAN THE PLAIN ORB, and that is a requirement rather
 * than a style note: eight of the old ones at radius 3.2–9.5 would be a
 * twelve-unit-wide cloud of geometry around a 2.9-unit kitten, and in split
 * screen it would fill her half of the display. These sit on a 1.5–2.6 shell
 * and read as armour.
 *
 * @param {object} spec one of POWER_ORBS
 * @param {number} slot 0..7 — decides the shell radius, speed and phase
 */
export class PowerOrb {
  constructor(spec, slot = 0, ofTotal = 1) {
    this.spec = spec;
    this.id = spec.id;
    this.slot = slot;

    /* The shell grows slowly and alternates direction by slot, so eight orbs
       are eight readable paths rather than one blurred sphere. Phase is spread
       over the whole ring by how many she is actually wearing — spacing them
       by a fixed angle bunches the first three together and leaves a gap. */
    this.r = 1.5 + (slot % 4) * 0.36;
    this.speed = (1.5 + (slot % 3) * 0.34) * (slot % 2 ? -1 : 1);
    this.theta = (slot / Math.max(1, ofTotal)) * Math.PI * 2;
    this.height = 1.05 + (slot % 4) * 0.34;
    this.tilt = 0.16 + (slot % 3) * 0.14;

    this.group = new THREE.Group();
    this.orbNode = new THREE.Group();
    this.group.add(this.orbNode);

    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.26, 1),
      new THREE.MeshBasicMaterial({ color: spec.color, toneMapped: false })
    );
    const halo = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.44, 1),
      new THREE.MeshBasicMaterial({
        color: spec.color, transparent: true, opacity: 0.3,
        side: THREE.BackSide, depthWrite: false, toneMapped: false,
      })
    );
    this.orbNode.add(core, halo);
    this.core = core;
    this.halo = halo;

    /* The orb wears its own kanji, which is how you tell eight glowing dots
       apart at a glance. Depth-tested, and lifted towards the camera in
       `faceCamera` so it clears its own halo without also clearing the world
       — see MARK_LIFT for what that replaced and why. */
    this.mark = new Label(spec.kanji, {
      height: 0.52, size: 76, color: '#ffffff',
      stroke: '#101018', strokeWidth: 9,
    });
    this.orbNode.add(this.mark);

    this._buildRain(spec.color);
    this.showMath = false;
    /** Where the rain column hangs before the per-view lift. See `_updateRain`. */
    this._rainAt = new THREE.Vector3();
  }

  /**
   * The character rain, and the live readout underneath it.
   *
   * THE GLYPHS ARE DECORATION; THE NUMBER IS NOT. Four katakana fall down a
   * short column beside the orb on their own loop, and below them sits the
   * same `cos θ = …` the plain Kotodama Orb printed, driven by the very cosine
   * that put the orb where it is this frame. Kill the readout and this is a
   * screensaver; kill the glyphs and it is the old orb at half size. The lead
   * orb is the only one that prints the numbers — eight copies of the same
   * two figures orbiting one cat is noise, and the whole reason the old
   * overlay was legible was that there was one of it.
   */
  _buildRain(color) {
    this.rain = new THREE.Group();
    this.group.add(this.rain);

    const hex = `#${new THREE.Color(color).getHexString()}`;
    this.hex = hex;
    this.drops = [];
    for (let i = 0; i < 4; i++) {
      const { texture, aspect } = makeLabelTexture(
        KANA[(Math.random() * KANA.length) | 0],
        { size: 64, color: hex, stroke: '#06131a', strokeWidth: 7 }
      );
      const h = 0.34;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(h * aspect, h),
        /* `depthWrite: false` and depth TESTING on: these are transparent
           quads, so they must not stamp the depth buffer and hide each other,
           but they do have to lose to anything solid in front of them. */
        new THREE.MeshBasicMaterial({
          map: texture, transparent: true, opacity: 0.8,
          depthWrite: false, toneMapped: false,
        })
      );
      m.renderOrder = 15;
      this.rain.add(m);
      this.drops.push({ mesh: m, t: Math.random(), swap: 0 });
    }

    /* `live`. This one is `cos X  sin Y` — 201 x 201 reachable strings, the same
       combinatorial shape as the Dojo's point readout that took the tab down at
       roughly a gigabyte per lap, and there are up to sixteen orbs. The cached
       path would mint a never-freed texture per value. See `Label`'s `_live`. */
    this.readout = new Label('cos θ', {
      height: 0.34, size: 60, color: hex,
      stroke: '#06131a', strokeWidth: 7,
      live: 'cos -0.00  sin -0.00',
    });
    this.rain.add(this.readout);
    this.rain.visible = false;
  }

  /** Only the lead orb shows its working. See _buildRain. */
  setMathVisible(v) {
    this.showMath = v;
    this.rain.visible = v;
  }

  /** @returns the same {theta, cos, sin} the plain orb returned. */
  update(dt, centre) {
    this.theta += this.speed * dt;
    if (this.theta > Math.PI * 2) this.theta -= Math.PI * 2;
    else if (this.theta < 0) this.theta += Math.PI * 2;

    const c = Math.cos(this.theta);
    const s = Math.sin(this.theta);
    const x = c * this.r;
    const z = s * this.r;

    this.group.position.set(centre.x, centre.y + this.height, centre.z);
    this.group.rotation.z = this.tilt;
    this.orbNode.position.set(x, 0, z);
    this.orbNode.rotation.y += dt * 2.2;
    this.mark.position.set(0, 0, 0);

    // A slow breath so a still kitten still looks powered up.
    const pulse = 1 + Math.sin(this.theta * 3) * 0.12;
    this.halo.scale.setScalar(pulse);

    if (this.showMath) this._updateRain(dt, x, z, c, s);
    return { theta: this.theta, cos: c, sin: s, x, z, r: this.r };
  }

  _updateRain(dt, x, z, c, s) {
    /* The column hangs beside the orb, not at the kitten's centre, so it
       travels with the thing whose numbers it is printing — which is the same
       reason the plain orb anchored its labels to the diagram rather than to
       the cat. */
    /* KEPT, because `faceCamera` runs once PER VIEW and adds a lift that
       points at that view's camera. Adding it to `rain.position` in place
       would accumulate across the four panes of a split screen and walk the
       column off the orb. */
    this._rainAt.set(x * 1.25, 0, z * 1.25);
    this.rain.position.copy(this._rainAt);
    for (const d of this.drops) {
      d.t += dt * 0.7;
      if (d.t > 1) {
        d.t -= 1;
        /* A new glyph at the top of the fall, not a new mesh: swapping the map
           on a cached texture costs nothing, and building four canvases a
           second per orb across sixteen orbs would be the most expensive thing
           in the frame. `makeLabelTexture` caches by content, so this settles
           onto the same 47 textures for the whole session. */
        const { texture } = makeLabelTexture(
          KANA[(Math.random() * KANA.length) | 0],
          { size: 64, color: this.hex, stroke: '#06131a', strokeWidth: 7 }
        );
        d.mesh.material.map = texture;
        d.mesh.material.needsUpdate = true;
      }
      d.mesh.position.set(0, 0.85 - d.t * 1.7, 0);
      // Brightest at the head of the fall and gone by the bottom — the one
      // detail that makes falling characters read as falling.
      d.mesh.material.opacity = 0.9 * Math.sin(d.t * Math.PI);
    }
    this.readout.position.set(0, -1.0, 0);
    this.readout.setText(`cos ${c.toFixed(2)}  sin ${s.toFixed(2)}`);
  }

  /**
   * Turn every piece of text to face the camera SQUARELY.
   *
   * A QUATERNION COPY IS LOCAL, AND EVERYTHING HERE HANGS OFF SOMETHING THAT
   * IS TURNING. `group` is tilted by `tilt` so the orbit reads as 3D, and
   * `orbNode` tumbles on two axes every frame — so `mesh.quaternion.copy(cam)`
   * leaves the parent's rotation still applied on top and the text arrives
   * sheared, leaning, and rolling once a second. It is legible in a still
   * frame and unreadable in motion, which is the worst way for it to be wrong.
   *
   * This is the same bug that got the drifting glyphs deleted from the plain
   * Kotodama Orb — see the note in `orb.js`. They were parented to a node that
   * tumbled, the billboarding fought the parent's spin, and the answer at the
   * time was to remove them. The answer here is to cancel the parent first:
   * invert its world rotation, then apply the camera's, and the result is a
   * quad that is genuinely square to the viewer whatever it is bolted to.
   *
   * The parent quaternions are composed by hand rather than read from
   * `getWorldQuaternion`, which needs the world matrices to be current — they
   * are not, because this runs per VIEW before the render that would update
   * them. `Object3D` keeps `.quaternion` in step with `.rotation` on every
   * assignment, so these two are always live.
   */
  faceCamera(camera) {
    // mark: parented to orbNode, which is parented to group.
    _q.copy(this.group.quaternion).multiply(this.orbNode.quaternion).invert();
    this.mark.mesh.quaternion.copy(_q).multiply(camera.quaternion);
    /* THE LIFT FALLS OUT OF THE BILLBOARDING AND COSTS NOTHING TO FIND. The
       quaternion just written maps the quad's local axes into its PARENT's
       space, and the quad's local +Z is the axis pointing at the viewer — so
       +Z through that same rotation IS the direction to the camera expressed
       in the parent's frame, which is exactly the frame `position` is in. No
       world matrix is consulted, which matters: this runs per view, before
       the render that would bring the world matrices up to date. */
    _v.set(0, 0, 1).applyQuaternion(this.mark.mesh.quaternion);
    this.mark.position.copy(_v).multiplyScalar(MARK_LIFT);
    if (!this.showMath) return;
    // rain and readout: parented to `rain`, which only ever moves, so the
    // group's tilt is the whole of what has to come off.
    _q.copy(this.group.quaternion).invert();
    for (const d of this.drops) d.mesh.quaternion.copy(_q).multiply(camera.quaternion);
    this.readout.mesh.quaternion.copy(_q).multiply(camera.quaternion);
    _v.set(0, 0, 1).applyQuaternion(this.readout.mesh.quaternion);
    this.rain.position.copy(this._rainAt).addScaledVector(_v, RAIN_LIFT);
  }

  dispose(parent) {
    parent.remove(this.group);
  }
}

/* --------------------------------- pickups -------------------------------- */

/**
 * One lying in the world, waiting to be walked into.
 *
 * IT SAYS WHAT IT IS BEFORE YOU TAKE IT. A ring of eight identical glowing
 * balls scattered over six islands, each of which silently grants a different
 * power, is a lottery — the label and the colour are what turn "there's
 * another one" into "that's the jump one, I want that". Same three-distance
 * argument the shrines make, minus the beam: these are small on purpose.
 */
export class PowerOrbPickup {
  constructor(spec, x, y, z) {
    this.spec = spec;
    this.id = spec.id;
    this.position = new THREE.Vector3(x, y, z);
    this.taken = false;
    this.t = Math.random() * 6.28;

    this.group = new THREE.Group();
    this.group.position.set(x, y, z);

    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.42, 1),
      new THREE.MeshBasicMaterial({ color: spec.color, toneMapped: false })
    );
    core.position.y = 1.5;
    const halo = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.78, 1),
      new THREE.MeshBasicMaterial({
        color: spec.color, transparent: true, opacity: 0.24,
        side: THREE.BackSide, depthWrite: false, toneMapped: false,
      })
    );
    halo.position.y = 1.5;

    /* A short column, thinner and shorter than a dragon ball's, which is
       itself thinner and shorter than a shrine beam. The three heights are the
       whole legibility system for "how big a deal is that light". */
    const beamGeo = new THREE.CylinderGeometry(0.16, 0.30, 9, 10, 1, true);
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
      color: spec.color, transparent: true, opacity: 0.16,
      side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
    }));
    beam.position.y = 5.2;

    const ringGeo = new THREE.TorusGeometry(0.85, 0.045, 6, 28);
    ringGeo.rotateX(Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: spec.color, transparent: true, opacity: 0.65, toneMapped: false,
    }));
    ring.position.y = 1.5;

    this.core = core;
    this.ring = ring;
    this.group.add(core, halo, ring, beam);

    this.mark = new Label(spec.kanji, {
      height: 0.62, size: 80, color: '#ffffff',
      stroke: '#101018', strokeWidth: 9, depthTest: false,
    });
    this.mark.position.y = 1.5;
    this.group.add(this.mark);

    this.label = new Label(spec.label, {
      height: 0.46, size: 58,
      color: `#${new THREE.Color(spec.color).getHexString()}`,
      stroke: '#101820', strokeWidth: 7,
    });
    this.label.position.y = 2.85;
    this.group.add(this.label);
  }

  update(dt) {
    this.t += dt;
    this.group.position.y = this.position.y + Math.sin(this.t * 1.7) * 0.24;
    this.core.rotation.y += dt * 1.5;
    this.core.rotation.x += dt * 0.7;
    this.ring.rotation.z += dt * 1.1;
  }

  faceCamera(camera) {
    this.mark.faceCamera(camera);
    this.label.faceCamera(camera);
  }
}
