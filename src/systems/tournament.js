import { MAX_HP, KO_TIME } from '../entities/player.js';
import { scoreOf, saveResult, loadBoard, NameEntry, ALPHABET, NAME_MAX } from './leaderboard.js';
import { styleCss } from '../core/palette.js';

/* ---------------------------------------------------------------------------
   The World Martial Arts Tournament.

   Owns exactly one question that the rest of the game asks: `fighting` — may
   these two kittens hurt each other right now? Everything else here is the
   ceremony around it.

   BEST OF THREE, NOT THREE ROUNDS. Two round wins takes it, so a tournament
   is two or three rounds long. Playing a dead third round after a 2-0 is
   worse than it sounds: the girls have already been told who won, and the
   round card that opens it says "everything comes down to this one", which by
   then is a lie. The third round only happens at one apiece, which is exactly
   when that line is true.

   NOTHING HERE IS A FULL-SCREEN SCENE. Round starts are a banner over the
   live world with both fighters visibly standing on their marks, because the
   thing the screen most needs to show at that moment is the two of them on
   opposite sides of a ring. The two moments that DO take the screen — the
   tournament opening and the result — are the two that are about something
   other than the fight.
--------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
   THE LEAGUES.

   A tournament is a set of SIDES, and everything else here is written against
   sides rather than against two players: a round is won by a side, `wins` is
   counted per side, and the one gate on player-versus-player damage asks
   whether two kittens are on the same one.

   `sides` maps FIGHTER INDEX -> SIDE INDEX, so a free-for-all is simply every
   fighter on her own side and a duel is the two-player case of `pairs`. That is
   what lets the whole feature be one code path: there is no "team mode" branch
   anywhere, because a duel already IS a team mode with one fighter a side.

   EACH LEAGUE KEEPS ITS OWN BOARD. A 2v2 win and a free-for-all win are not the
   same achievement and putting them in one table makes the number meaningless —
   see `boardKey` and `leaderboard.js`.

   WHICH LEAGUES EXIST DEPENDS ON WHO IS PLAYING, and the two-player game is
   deliberately unchanged: two kittens get DUEL and nothing else, which is the
   tournament the girls already know, on the board it is already on.
--------------------------------------------------------------------------- */
export const MODES = [
  {
    id: 'duel',
    name: 'DUEL',
    blurb: 'One against one.',
    players: [2],
    /** @param {number} n fighters -> side per fighter */
    sides: () => [0, 1],
  },
  {
    id: 'ffa',
    name: 'FREE FOR ALL',
    blurb: 'Everyone for herself. Last one standing takes the round.',
    players: [3, 4],
    sides: (n) => Array.from({ length: n }, (_, i) => i),
  },
  {
    id: 'pairs',
    name: 'TAG TEAM · 2v2',
    blurb: 'Two a side. Your partner cannot hurt you.',
    players: [4],
    sides: () => [0, 0, 1, 1],
  },
  {
    id: 'two_one',
    name: 'HANDICAP · 2v1',
    blurb: 'Two against one. The lone fighter gets a slightly bigger bar.',
    players: [3],
    sides: () => [0, 0, 1],
    /** The outnumbered side is given more health — see `_handicap`. */
    handicap: true,
  },
  {
    id: 'three_one',
    name: 'HANDICAP · 3v1',
    blurb: 'Three against one. The champion had better be good.',
    players: [4],
    sides: () => [0, 0, 0, 1],
    handicap: true,
  },
  /* THREE SIDES, WHICH IS NOT A NEW CODE PATH — and that is the whole reason
     it is one line. `sides` has always been a fighter -> side map rather than a
     pair of teams, so everything downstream already counted sides rather than
     twos: `wins` sizes itself off the highest side index, `_sidesUp` is a Set,
     `postsFor` has bearings for three, and `handicapFor` divides by how big
     each side actually is. A duel is a team mode with one fighter a side and
     this is a team mode with an odd number of them.

     THE TWO LONE FIGHTERS GET THE BIGGER BAR, and they need it more than a
     handicap fighter does: each of them is outnumbered by the pair AND has the
     other loner to worry about, so the pair wins by default without it.
     `handicapFor` works that out from the side sizes rather than being told —
     and it is the same fifth of a bar a 3v1 hands out, because it is capped.
     See `HANDICAP_MAX`.

     A ROUND ENDS WHEN ONE SIDE IS LEFT, unchanged. With three sides that means
     two of them have to be wiped, which is what makes this the longest league
     in the game and the only one where the answer to "who do I hit" is a real
     question. */
  {
    id: 'two_one_one',
    name: 'FREE TEAMS · 2v1v1',
    blurb: 'A pair against two loners. Everybody else is a target.',
    players: [4],
    sides: () => [0, 0, 1, 2],
    handicap: true,
  },
];

export const MODE_BY_ID = Object.fromEntries(MODES.map((m) => [m.id, m]));

/* ---------------------------------------------------------------------------
   WHO IS ON MY SIDE — the one question a team match did not answer.

   In a 2v2 there was nothing on screen or in the world that said who your
   partner was. You found out by swinging at somebody and watching nothing
   happen, which is the worst possible way to learn it: the rule that protects
   your partner is invisible, so the first thing it teaches you is that your
   attack is broken.

   RED AND BLUE, BECAUSE THAT IS WHAT TEAM COLOURS ARE. There is no cleverness
   available here and none wanted — every game either girl has played uses the
   same two, and the third side in a 2v1v1 takes gold, which is already this
   game's "won a round" colour and reads as a third thing rather than as a
   variation on the first two.

   THEY ARE DELIBERATELY NOT THE PLAYER COLOURS. A kitten's own colour answers
   "which one is me" — her marker ring, her minimap pip, her score badge and now
   her health bar all share it — and a team colour answers "who is with me".
   Painting one with the other loses the question a nine-year-old needs most in
   a hurry, which is finding herself. */
export const TEAM_COLOURS = ['#ff4136', '#3d7bff', '#ffc531'];
export const TEAM_NAMES = ['RED', 'BLUE', 'GOLD'];

/**
 * "She has not picked a side yet" — the seat every kitten holds when the team
 * picker opens, and one no league will ever accept.
 *
 * IT IS DELIBERATELY AN ILLEGAL SEAT rather than a flag beside the seats.
 * `_validSeats` already refuses anything outside `0 .. n-1`, so an undecided
 * kitten makes the whole arrangement invalid for free, and the confirm that
 * used to fire on the first frame of the picker cannot — see
 * `Game._openTeamPicker` for what that cost. A separate `chosen[]` would be a
 * second thing to keep in step with the first, and the failure mode is a match
 * that starts with somebody on a side she never picked.
 */
export const NO_SIDE = -1;

export function teamColour(side) {
  return TEAM_COLOURS[side % TEAM_COLOURS.length];
}
export function teamName(side) {
  return TEAM_NAMES[side % TEAM_NAMES.length];
}

/** The leagues a party of `n` can actually run. */
export function modesFor(n) {
  return MODES.filter((m) => m.players.includes(n));
}

/**
 * The most any fighter's bar may be scaled by, however badly she is outnumbered.
 *
 * IT USED TO BE UNCAPPED, AND THAT IS THE BUG THIS CONSTANT EXISTS FOR. The
 * multiplier was `biggest / mine`, so the lone fighter in a 3v1 opened on
 * THREE HUNDRED health and the two loners in a 2v1v1 on two hundred. On paper
 * it is fair — one bar each, three of them, one of her — and on the deck it is
 * a different game: her sisters watch a bar that will not move while she takes
 * three rounds to lose one, and the girl who "agreed to be alone" is suddenly
 * the one nobody can beat. A knockout is also the round, so the side with the
 * long bar is the side that decides how long everyone else's afternoon is.
 *
 * So the handicap is a NUDGE, not a compensation: a fifth of a bar more,
 * whether she is against two or against three. It is deliberately the SAME
 * number at both — being outnumbered worse is a reason to fight differently,
 * not a reason to be handed a different amount of health, and two leagues that
 * hand out different bars for the same job make the record boards
 * incomparable. What actually makes a handicap match survivable is the feast,
 * the snacks and rage, all of which she gets too.
 */
export const HANDICAP_MAX = 1.2;

/**
 * How much health a side starts with, as a multiple of the base bar.
 *
 * ONLY THE OUTNUMBERED SIDE IS TOUCHED, and it is CAPPED — see `HANDICAP_MAX`.
 * Everyone in the ring is on the same bar to within a fifth of it, whoever she
 * is standing with.
 *
 * @returns {number[]} multiplier per fighter
 */
export function handicapFor(sides, on = true) {
  if (!on) return sides.map(() => 1);
  const counts = {};
  for (const s of sides) counts[s] = (counts[s] ?? 0) + 1;
  const biggest = Math.max(...Object.values(counts));
  return sides.map((s) => Math.min(HANDICAP_MAX, biggest / counts[s]));
}

/** Round wins needed to take the tournament, and the most rounds it can run. */
export const WINS_NEEDED = 2;
export const MAX_ROUNDS = 3;

/** Seconds the round card holds before the countdown starts. */
const CARD_TIME = 3.4;
/** Seconds of "3 … 2 … 1 …". One a second, so the ticks land on the numbers. */
const COUNT_FROM = 3;
/** Held on the knockout before the next round is set up. */
const KO_HOLD = KO_TIME + 1.4;

/**
 * What he says when the round ended with everybody still on their feet.
 *
 * EXPORTED SO THE CARD AND THE RECORDING CANNOT DRIFT. `public/voice/sat_over.mp3`
 * is this sentence and nothing else; the pop-in card is the subtitle of a clip,
 * and the moment the two are written out separately one of them starts saying
 * less than the other — which is what had happened to the announcer's box (see
 * `BLAST_LINES` in satanblast.js) and was reported as the text being an
 * abbreviated version of what he says.
 */
export const ROUND_OVER_LINE = 'Not down... I guess... but we have a WINNER!';

/**
 * What fraction of the health she EATS back at the feast carries into the next
 * round as overflow.
 *
 * ASKED FOR AS A HALF, in those words: "take the health they gained, divide it
 * by two, and then add that to the maximum health that the player has in the
 * next round". Named rather than inlined because it is the one number in the
 * feature a player could argue about, and because a half written as `/ 2` in
 * two files is two numbers.
 *
 * IT IS HALF OF WHAT SHE GAINED, NOT HALF OF WHAT SHE ATE. A kitten at the top
 * of her bar swallowing a rat has gained nothing and banks nothing — see
 * `Player.fedHp`. That is what stops the feast being "stand still and chew" for
 * whoever is already winning.
 */
export const OVERFLOW_FRAC = 0.5;
/**
 * A round cannot run forever — see `_updateLive`.
 *
 * EXPORTED BECAUSE IT IS NOW ON SCREEN. It ran silently for its whole life,
 * which meant the one rule in the tournament nobody could see was also the one
 * that could take a round off you — two kittens circling each other at 118
 * seconds had no idea anything was about to be decided on damage. The clock in
 * `_paintHud` counts this down, so what the game measures is what she reads.
 */
export const ROUND_LIMIT = 120;

/**
 * The last thirty seconds, and the last fifteen.
 *
 * TWO NUMBERS BECAUSE THEY DO TWO DIFFERENT JOBS. `WARN_AT` is a nudge — he
 * says one line and the fight carries on. `COUNT_AT` is where the round stops
 * being a fight and starts being a deadline: the big clock appears, it blinks,
 * and he does not shut up again until it is over. Reported as "when 15 seconds
 * is left, a timer needs to show in the middle of the screen or below the menu
 * bar, a bigger text, showing that time is running out".
 *
 * FOUR CUES, ONE EVERY FIVE SECONDS, AND ONLY THE LAST OF THEM IS A CLIP THAT
 * CARES. The first cut of this made the whole fifteen seconds a single spliced
 * file and put its words on a card, which was wrong twice over: he was reading
 * out the count in a speech bubble that duplicated the number already on
 * screen, and a round that ended at 0:06 left nine seconds of him counting
 * queued behind it. Reported as both. So thirty, fifteen and ten are ordinary
 * cards he can be interrupted out of, and `COUNT_LAST` starts the one clip
 * whose insides are nailed to the clock — `sat_count`, five seconds long, one
 * number a second, no card at all. See `tools/capture/satan-countdown.mjs`.
 */
export const WARN_AT = 30;
export const COUNT_AT = 15;
/** Halfway down, and the point he gives up on them and starts counting. */
export const COUNT_MID = 10;
/** Under this, the number on screen turns and swells: he is counting now, and
 *  `COUNT_LAST` is also exactly how long `sat_count.mp3` runs. */
export const COUNT_LAST = 5;

/**
 * The beat between the end of his ZERO and the round being announced.
 *
 * ASKED FOR — "have him finish what he is saying, then continue with the
 * follow-up dialog tree... maybe even adding a 1 - 2 second pause for him to
 * calm down". It is a real pause and not a gap: the deck is already frozen,
 * everybody can see who is still standing, and a bell arriving on the tail of
 * his roar reads as the game talking over him.
 */
export const ZERO_BEAT = 1.5;

/**
 * A ring-out: what it costs, and how long you have to be off before it counts.
 *
 * IT HURTS RATHER THAN ENDING THE ROUND, which is the single biggest balance
 * decision in this feature. Falling off is the loss condition in Smash and in
 * the DBZ tournament both, and it is genuinely the more exciting rule — but
 * this game already has health bars, and two loss conditions where one is
 * instant means a nine-year-old watching her sister's bar go down can still
 * lose the round in a frame she did not understand. One currency, one bar,
 * one way to lose. The ring still matters because 30 is a third of it.
 *
 * THE GRACE IS GONE FROM A LIVE ROUND, AND THE RULE MOVED TO THE STONE
 * INSTEAD. Half a second bought fairness against a test that was firing in the
 * wrong place: `out > 0` is the PAINTED LINE, which sits `ARENA_OUT` (1.1)
 * INSIDE the deck edge — so a kitten standing on the stone margin outside the
 * paint was being counted out of a ring she was visibly still on, and the only
 * thing stopping it was a timer she could run out by walking back. Two
 * complaints, one cause: rung out while still on the stage, and then a
 * half-second of nothing happening once she really was off it.
 *
 * So the penalty asks the honest question — HAS SHE COME DOWN ON THE LOWER
 * FLOOR? — and fires the moment the answer is yes. The paint keeps the job it
 * is good at: it is where the warning ring lights, a stride before the edge.
 * The grace survives only for the feast's free return, where nothing is at
 * stake and snapping a kitten back mid-stride for chasing a rabbit down the
 * steps would be the arena taking away the one thing she has to do.
 */
const OUT_GRACE = 0.5;
/**
 * How far below the deck's surface counts as "her feet are not on the ring".
 *
 * Small, because the deck is a flat platform and anything under it is the
 * island — but not zero: a kitten who lands hard dips momentarily under her
 * own platform, and a threshold of zero turns that frame into a ring-out on
 * the far side of the deck from any edge.
 */
const OUT_DROP = 0.6;
/**
 * How far below the deck counts as "she has fallen off it".
 *
 * Generous on purpose. It only has to be deeper than the dip a landing can put
 * her through — a kitten hitting the deck hard is momentarily under its own
 * surface — and shallower than anywhere she could hang about. Anything past
 * the rim is a hundred units of open sky, so there is no case in between. It
 * is the case `onGround` can never answer: out there nothing is under her, so
 * waiting to land means falling forever.
 */
const OUT_FALL = 3;
/**
 * How far below the deck is "gone", for ANYBODY, in ANY state.
 *
 * THIS IS THE FLOOR UNDER THE WHOLE TOURNAMENT AND NOT PART OF THE RING-OUT
 * RULE. `_updateOut` above is the rule: it asks whether a fighter has left the
 * ring, and it deliberately skips a kitten who is already knocked out, is
 * flying as an angel, or is frozen inside somebody's cross slash. It also only
 * runs while a round is live or during the feast.
 *
 * Every one of those exemptions is right, and together they leave a hole a
 * kitten can fall through forever. Reported from four-player play: "players
 * get knocked so far they fall off the island entirely and then the camera
 * zooms out infinitely far away." A knockout landing on the last frame of a
 * big launch is the common way in — she is KO'd, so `_updateOut` steps over
 * her; the round ends, so the state goes to `ko` and `_updateOut` stops being
 * called at all; and she keeps going until `Player._respawn` catches her at
 * y = -160 and puts her in the TOWN PLAZA, three hundred units from a
 * tournament that is about to post her back on her mark.
 *
 * So this is a separate, dumber question asked of everybody every frame the
 * tournament is on: is she under the floor? Nothing may be stranded — fourth
 * non-negotiable — and the arena is the one place in the game with a hundred
 * units of open sky on all four sides.
 *
 * 14 UNITS, WHICH IS BELOW THE ISLAND AND ABOVE THE VOID. The deck stands
 * clear of the island it is built on and a kitten rung out normally lands on
 * that island, several units down — so a shallower floor would fire on
 * somebody standing perfectly safely below the rim and yank her back mid-
 * stride. Deeper buys nothing: past the island's own edge there is nothing to
 * land on at any depth, and every extra unit is another frame of the camera
 * stretching to follow her down.
 */
export const OUT_FLOOR = 14;
const OUT_DAMAGE = 30;

/* ---------------------------------------------------------------------------
   HOW FAR BACK THE RING CAMERA SITS, and why a phone gets its own pair.

   THE PHONE ANSWER IS NOT A TASTE SETTING — it falls out of the lens. The
   camera's 38 degrees is a VERTICAL field of view, so how much WORLD fits
   across the screen depends on the aspect ratio:

     ground width at distance d  =  2 * d * aspect * tan(fov / 2)

   tan(19 degrees) is 0.3443. A desktop pane is about 16:9, so that is 1.226*d.
   A landscape phone is 844x390 — and it is always landscape, because the rotate
   gate says so, and always one pane, because `defaultSplit` is 'never' — which
   is 2.16, so 1.487*d. THE PHONE ALREADY SHOWS 21% MORE WORLD AT THE SAME
   DISTANCE, on a screen a fifth the physical size. `dist: 52` put the whole
   56-unit deck on a six-inch panel with room around it: the fight was four
   little sprites in the middle of a lot of stone.

   Turn the formula round and ask what distance FITS the fighters, with about
   ten units of air past the widest pair:

     d = (sep / 2 + 10) / (2.16 * 0.3443)      i.e.  / 0.744

       sep  0  ->  13     sep 40  ->  40
       sep 20  ->  27     sep 56  ->  51      (across the deck)
                          sep 79  ->  67      (corner to corner)

   `20 + sep * 0.6` tracks that line, a shade wider up close, landing on it at
   full spread. Clamped to [26, 66]: 26 is half the desktop minimum, which is
   the "at least twice as close" the phone test asked for, and 66 is the corner-
   to-corner fit rather than a number picked to look safe.

   The feast is the one shot that frames the deck rather than the fighters, so
   it takes the same treatment by hand: 68 holds all 56 units of stone AND the
   dragon thirty units above it (vertical coverage is 0.689*d, so 47 units).

   THE DESKTOP PAIR IS THE OLD EXPRESSION, DIGIT FOR DIGIT. Invariant 5. */
const RING_DIST = {
  desktop: { min: 52, max: 104, base: 46, k: 0.8 },
  touch: { min: 26, max: 66, base: 20, k: 0.6, feast: 68 },
};

/* THE SHOT ON MR. SATAN when the clock is what ended the round. Asked for:
   "when timer gets to Zero on a match, can have the camera zoom in on Mr.
   Satan since he is having a speech/dialogue at the end. Same can happen with
   him giving the Draw speech."

   NOT A RING DISTANCE AND THAT IS THE POINT. Every other number in
   `RING_DIST` is sized off a 56-unit deck with two kittens somewhere on it;
   this one is sized off one man on a booth, so it is a fifth of them.

   `lift` PUTS THE AIM ON HIS CHEST, not on his feet, and 1.9 IS MEASURED OFF
   A SCREENSHOT rather than reasoned. He stands on the booth at `arenaBooth.y`
   and his sprite runs up from there; aiming at the position itself framed his
   knees with the sky above his head. The first guess of 3.2 overcorrected and
   sat him 60px low in an 546px frame, which is exactly where the announcer's
   dialogue panel comes up — so his own speech, the reason for the shot, would
   have crowded him. At 1.9 he is centred with the whole canopy in and the
   panel clear beneath him.

   `pitch` IS ALMOST LEVEL. The camera has a fixed yaw, so this shot comes from
   the ring side of him looking back at the booth — an eye-level angle on a
   billboard, where the fight's 0.52 would look down on him and squash the
   drawing. Same argument the fight camera makes for its own flatness. */
const SATAN_SHOT = { dist: 19, lift: 1.9, pitch: 0.16 };

/* ---------------------------------------------------------------------------
   The feast — the gap between rounds, and the only reason it is a gap.

   A ROUND NO LONGER HANDS BOTH FIGHTERS A FULL BAR, and everything below is
   the consequence of that one change. It used to: each round was a clean bout,
   which is tidy and means nothing that happens in round one can be felt in
   round two. Now the kitten who WON the round keeps the health she finished it
   with, and the kitten who was knocked out comes back full.

   That reads backwards for about a second, and then it is obviously right. It
   makes winning a round cost something, so a 2-0 stops being the default shape
   of a match; it hands the girl who is behind a reason to keep playing; and it
   gives the fifteen seconds between rounds a JOB — the survivor spends them
   hunting rats with whatever bar she has left, while her sister, who has
   nothing to do, flies around above her as an angel. Two players doing two
   different things at the same time, which the tournament had never managed.

   `REGEN_FRAC` is the floor under the whole thing. A round that ends with the
   winner on four health and no animals within reach would otherwise send her
   into the next one dead on the first touch, which is not a comeback mechanic,
   it is a spiral — so ten per cent is handed over free the moment the round
   ends, and `Menagerie.topUp` guarantees there is something out there to catch
   on top of it.
--------------------------------------------------------------------------- */
export const FEAST_TIME = 15;
export const REGEN_FRAC = 0.10;

export class Tournament {
  constructor({ game, world, audio, announcer }) {
    this.game = game;
    this.world = world;
    this.audio = audio;
    this.announcer = announcer;

    /** off | card | count | live | ko | feast | result | leaving */
    this.state = 'off';
    this.t = 0;
    this.round = 0;
    /** The league being fought. Set by `begin`; DUEL for two players. */
    this.mode = MODES[0];
    /** Side index per fighter — the one structure the whole feature is written
     *  against. `[0, 1]` is a duel; `[0, 0, 1, 1]` is a 2v2. */
    this.sides = [0, 1];
    /** Round wins, BY SIDE. Not by player: in a 2v2 both members of a side win
     *  the same round, and counting it per kitten would need two rounds to
     *  reach a "best of three". */
    this.wins = [0, 0];
    /** Which side won the LAST round, or -1 for "nobody lost" — a draw, or no
     *  round finished yet. Decides who is healed to full at the top of the
     *  next one; see `_nextRound`. Not derivable from `wins`, which is a
     *  running total. */
    this._lastWinner = -1;
    /** Total seconds actually spent fighting — the speed term of the score. */
    this.fightTime = 0;
    this.winner = null;
    this.entry = new NameEntry();
    this.board = loadBoard(this.mode.id);
    this.rank = -1;

    this.bannerEl = document.getElementById('arena-banner');
    this.hudEl = document.getElementById('arena-hud');
    this.countEl = document.getElementById('arena-countdown');
    this.resultEl = document.getElementById('arena-result');
    this._bindResultTaps();
  }

  /**
   * The results screen under a thumb.
   *
   * WHY IT NEEDED ONE AT ALL: this screen is `z-index: 60` and the touch pad is
   * 7, so on a phone every control it names — the stick that picks a letter,
   * the JUMP that commits it, the JUMP that flies home — is drawn UNDERNEATH
   * the screen asking for them. Winning the tournament on a phone was a dead
   * end: a champion could not sign the board and could not leave the screen.
   * The character profile had the same shape of bug and the same fix.
   *
   * DELEGATED, AND BOUND ONCE. `_paintResult` replaces the whole `innerHTML`
   * on every letter, so a listener on a key would be thrown away the moment it
   * was used. The container survives.
   */
  _bindResultTaps() {
    this.resultEl?.addEventListener('click', (e) => {
      const el = e.target.closest('[data-ne]');
      if (!el) return;
      const v = el.dataset.ne;
      /* HOME IS CHECKED BEFORE THE ENTRY IS, because it is the only one of
         these that is live after the name is committed — and after `_commit`
         every `entry` method refuses. A button that stops working the instant
         it becomes the only one on screen is the dead end all over again. */
      if (v === 'home') { this.goHome(); return; }
      let moved = false;
      if (v === 'del') moved = this.entry.del();
      else if (v === 'ok' || v === 'yes') moved = this.entry.accept();
      else if (v === 'no') moved = this.entry.cancel();
      else if (v.startsWith('s')) moved = this.entry.pick(Number(v.slice(1)));
      else moved = this.entry.type(v);
      if (!moved) return;
      this.audio?.play('menu');
      if (this.entry.done) this._commit();
      this._paintResult();
    });
  }

  /* ------------------------------ questions ------------------------------ */

  /**
   * MAY THE TWO OF THEM HURT EACH OTHER RIGHT NOW?
   *
   * The one gate, read by `Game.strikePlayers` and by nothing else. It is
   * deliberately narrow: not "are we at the arena", not "is a tournament
   * running", but "is a round LIVE this frame". The countdown, the round card,
   * the knockout hold and the results screen are all tournament states in
   * which a swing must do nothing at all — the countdown especially, because
   * a kitten mashing attack while the numbers come down would otherwise open
   * with a free hit on a sister who cannot move.
   */
  get fighting() { return this.state === 'live'; }

  /** True from the moment they board the griffin until they are home. */
  get active() { return this.state !== 'off'; }

  /**
   * Is this a legal way to stand for this league?
   *
   * IT COMPARES THE SHAPE, NOT THE SEATING. A 2v2 needs two sides of two; which
   * two kittens are on which side is exactly what the picker exists to let them
   * decide, so the test sorts the side sizes and compares those. That is also
   * what makes 2v1 and 1v2 the same legal answer, which they are.
   *
   * The mode's own arrangement is the reference rather than a table written out
   * here, so a league added later cannot forget to say what shape it wants.
   *
   * THE MODE IS AN ARGUMENT, NOT `this.mode`, and that is not tidiness. The
   * team picker runs BEFORE `begin`, so at the moment it needs this answer the
   * tournament is still carrying whatever league it last ran — which on a fresh
   * game is the duel. Read off `this.mode` it happily reported that a perfectly
   * good 2v2 was illegal, and the screen sat there telling four kittens to move
   * somebody across when nobody needed to move at all.
   */
  _validSeats(seats, n, mode = this.mode) {
    if (!mode || !Array.isArray(seats) || seats.length !== n) return false;
    if (seats.some((s) => !Number.isInteger(s) || s < 0 || s >= n)) return false;
    const shape = (list) => {
      const c = {};
      for (const s of list) c[s] = (c[s] ?? 0) + 1;
      return Object.values(c).sort((a, b) => a - b).join(',');
    };
    return shape(seats) === shape(mode.sides(n));
  }

  /** Which side a fighter is on. */
  sideOf(player) {
    const i = this.game.players.indexOf(player);
    return i < 0 ? -1 : (this.sides[i] ?? i);
  }

  /**
   * MAY THESE TWO HURT EACH OTHER? Asked by `Game.strikePlayers`, right after
   * `fighting`.
   *
   * NO FRIENDLY FIRE, and it is one more clause on the single gate rather than
   * a rule of its own. A tag-team partner you can cut down is not a partner,
   * and with two sisters on a side the first accident becomes an argument about
   * whether it was an accident. A duel is unaffected: nobody shares a side.
   */
  allies(a, b) {
    return a !== b && this.sideOf(a) >= 0 && this.sideOf(a) === this.sideOf(b);
  }

  /** Every fighter on a side, in fighter order. */
  sideMembers(side) {
    return this.game.players.filter((_, i) => this.sides[i] === side);
  }

  /** Sides with at least one fighter still standing. */
  _sidesUp() {
    const up = new Set();
    this.game.players.forEach((p, i) => { if (!p.ko) up.add(this.sides[i]); });
    return [...up];
  }

  /** Total damage a side has dealt this tournament — the timeout tiebreak. */
  _sideDamage(side) {
    return this.game.players.reduce(
      (n, p, i) => n + (this.sides[i] === side ? p.dmgDealt : 0), 0
    );
  }

  /** Which board this league writes to. See leaderboard.js. */
  get boardKey() { return this.mode.id; }

  /**
   * Somebody joined or left mid-game.
   *
   * OUTSIDE A TOURNAMENT THIS IS FREE — the sides are rebuilt when `begin`
   * runs. INSIDE one it cannot be, so a party change during a live tournament
   * ends it rather than trying to re-deal the teams underneath the girls: a
   * 2v2 that silently becomes a 2v1 between rounds is a match nobody agreed to
   * and a scoreboard that means nothing.
   */
  onPartyChanged() {
    if (this.state === 'off') return;
    this.game.toast('The party changed — the tournament is called off', 0);
    this.finish();
    this.game._goHome?.();
  }

  /** True while the tournament owns the whole screen (results + name entry). */
  get modal() { return this.state === 'result'; }

  /* ------------------------------- flow ---------------------------------- */

  /**
   * Everybody has landed at the arena. Start the show.
   *
   * @param {string=} modeId which league. Defaults to the first one this party
   *        size can run, which for two players is the duel it has always been.
   */
  /**
   * @param {?string} modeId  the league
   * @param {?number[]} seats one side per fighter, from the team picker —
   *        who chose to stand where. Null falls back to the mode's own
   *        arrangement, which is what a duel and a free-for-all always use and
   *        what a team league gets if the picker was skipped.
   */
  begin(modeId = null, seats = null) {
    const n = this.game.players.length;
    const available = modesFor(n);
    this.mode = MODE_BY_ID[modeId] ?? available[0] ?? MODES[0];
    /* THE PICKER'S ANSWER WINS, IF IT GAVE ONE. `mode.sides(n)` is the default
       arrangement — the first two kittens are the pair, the last one is alone —
       and it was the ONLY arrangement, which meant who your partner was fell
       out of the order you happened to join in. `_validSeats` is what makes it
       safe to accept: it checks the shape rather than trusting the caller, so a
       league can never be started with the wrong number of fighters a side. */
    this.sides = (seats && this._validSeats(seats, n)) ? seats.slice() : this.mode.sides(n);
    /* A mode whose table does not cover this party — a 2v2 with three players
       left after somebody dropped out — must not deal a fighter no side at
       all, which would make her unkillable and the round unwinnable. */
    while (this.sides.length < n) this.sides.push(this.sides.length);
    this.sides = this.sides.slice(0, n);

    this.state = 'card';
    this.round = 0;
    this.wins = Array.from({ length: Math.max(...this.sides) + 1 }, () => 0);
    /* A NEW MATCH HAS NO LAST ROUND. Left over, the first round of the second
       tournament of an afternoon would heal whoever lost the last round of the
       first one. */
    this._lastWinner = -1;
    this.fightTime = 0;
    this.winner = null;
    this.rank = -1;
    this.entry.reset();

    /* IS THIS A TEAM MATCH AT ALL? Derived from the sides rather than from a
       flag on the mode, so it cannot disagree with them — and it is what
       decides whether the team furniture appears. In a duel or a free-for-all
       everybody is her own side, so a pennant over every head and a colour name
       on every bar would be four labels saying nothing. */
    this.teamed = this.sides.slice(0, n).some(
      (s, i, all) => all.some((t, j) => j !== i && t === s)
    );

    const hp = handicapFor(this.sides, !!this.mode.handicap);
    this.game.players.forEach((p, i) => {
      p.dmgDealt = 0;
      p.dmgTaken = 0;
      /* THE PENNANT OVER HER HEAD, and it is only ever on in a team match —
         see `teamed`. This is the half of "who is with me" that lives in the
         world rather than on the HUD, and it is the half that matters while
         you are swinging: the HUD is at the top of the screen and the kitten
         you are about to hit is in the middle of it. */
      p.setTeamMark(this.teamed ? teamColour(this.sides[i]) : null);
      /* THE HANDICAP IS A BIGGER BAR, NOT A WEAKER OPPONENT. Scaling everyone
         else's damage down would make the lone fighter's own numbers lie — she
         would land a dash and see it take less than it takes in every other
         mode. A slightly longer bar is the same fight, with a head start; see
         `HANDICAP_MAX` for why it is slight. */
      p.setHpScale(hp[i]);
      /* ROUND ONE IS ALWAYS A FULL BAR, SAID OUT LOUD. Since the feast landed,
         `_nextRound` starts each kitten on whatever she is carrying — and for
         the first round of a tournament that is whatever she happened to walk
         in with. It is full today only because `finish` happens to restore it
         on the way out of the last one, which is a fact about a different
         function two hundred lines away. "The first round is clean and every
         round after it carries" is the rule; this is the half of it that was
         being left to luck. */
      /* ...AND WITH NO OVERFLOW ON IT. `setRoundBonus` is what makes the
         green a one-round thing; a tournament opening on a bar left green by
         the last one would be carrying a reward across a match boundary, and
         `p.hp = p.maxHp` on the line below would silently include it. Cleared
         before the fill, so the fill is to the ordinary top. */
      p.setRoundBonus?.(0);
      p.fedHp = 0;
      p.hp = p.maxHp;
      /* AND HER PANDA COMES IN ON A FULL BAR TOO. Nothing carries a wound
         between matches, for the animal for exactly the reason it does not for
         her. Being KNOCKED DOWN is not a wound and does not heal here — that
         one is for the rest of the game and comes back at the shrine; see
         `Panda.collapse`. */
      p.panda?.resetHp();
      p.barOn = true;
      p.landAngel();
    });
    this.hudEl?.classList.remove('hidden');
    /* The deck is stocked before the first countdown rather than after it.
       The first thing either girl has to learn about the snacks is that they
       exist, and she learns it by watching a rat run past her mark while she
       is standing frozen on it waiting for the gong. */
    this.game.menagerie?.start();
    this._nextRound();
  }

  /** Tear it all down — used on restart, and when the girls go home. */
  finish() {
    this.state = 'off';
    /* THE COUNT AND THE POSE OUTLIVE THE TOURNAMENT OTHERWISE. `clear` reaches
       neither: the count plays on the speech channel (see `_hushCount`) and the
       charging sprite is Mr Satan's, not the announcer's — so a tournament torn
       down at 0:03 left him counting over the town square with his arms in the
       air. Same class of latch as the wings and the pennant below. */
    this._hushCount();
    this._dropPose();
    this._pending = null;
    /* ...and the same class of latch: it only steers the camera while the
       state is `ko`, but a tournament torn down mid-ceremony and started again
       would carry it into the next one's first frame. */
    this._onTheClock = false;
    /* AND WHO WON THE LAST ROUND GOES WITH THEM. It decides who is healed at
       the top of the next one (`_nextRound`), so a tournament torn down and
       started again would open its first round handing somebody a full bar for
       a round she fought in a different match. -1 is "nobody lost", which is
       also what a draw leaves. */
    this._lastWinner = -1;
    this._koHold = KO_HOLD;
    this.announcer?.clear();
    this.bannerEl?.classList.add('hidden');
    /* EXPLICITLY, RATHER THAN LEAVING IT TO `_paintCountdown`. That runs from
       `update`, and `update` returns on the first line when the state is
       'off' — so a tournament torn down at 0:07 would leave a 7 hanging over
       the town for the rest of the session. */
    this._hideCountdown();
    this.hudEl?.classList.add('hidden');
    this.resultEl?.classList.add('hidden');
    this.game.menagerie?.stop();
    for (const p of this.game.players) {
      /* WINGS OFF FIRST. `landAngel` is the only thing that clears the flag,
         and the flag is what routes her into `_updateAngel` — a kitten flown
         home from the arena still holding it would drift through the town for
         the rest of the afternoon with no gravity and no katana. Same class of
         latch as `nearEdge` below, and a much louder one. */
      p.landAngel();
      p.barOn = false;
      p.hpGroup.visible = false;
      /* The pennant off with the bar, and for the same reason as `nearEdge`
         below: nothing else ever clears it, so a kitten flown home from a
         2v2 would wear a red flag over her head round the town all afternoon. */
      p.setTeamMark(null);
      p.hp = p.maxHp;
      p.ko = false;
      p.koT = 0;
      p.hitT = 0;
      p.invulnT = 0;
      p.outT = 0;
      p.eatT = 0;
      /* Cleared, or the edge warning latches on. `_updateOut` is the only
         thing that ever sets `nearEdge` false again, and it stops running the
         moment the tournament does — so a kitten who flew home from the last
         thing she did near the rim would keep a flashing red ring round her
         feet for the rest of the afternoon. */
      p.nearEdge = false;
    }
  }

  /**
   * The gap between rounds: fifteen seconds, two entirely different jobs.
   *
   * IT IS NOT A FROZEN STATE AND IT IS NOT A SCENE. Both girls are in charge of
   * themselves for the whole thing — one hunting, one flying — which is the
   * only reason it is worth fifteen seconds instead of the three the knockout
   * hold used to take. `fighting` stays false throughout, so nothing either of
   * them does to the other lands.
   */
  _startFeast() {
    this.state = 'feast';
    this.t = 0;

    const regen = Math.round(MAX_HP * REGEN_FRAC);
    for (const p of this.game.players) {
      /* THE TALLY STARTS AT ZERO, HERE, FOR EVERYBODY. It is what she eats
         THIS feast that carries, and a counter that survived a round would
         hand her the same meal twice. Zeroed for the angel too: she cannot eat
         while she is flying, and a stale number on somebody who ate nothing is
         exactly the kind of thing that ships. */
      p.fedHp = 0;
      if (p.ko) {
        /* SHE IS THE ONE WHO LOST THE ROUND, so she is the one with nothing to
           do — and giving her the sky is what stops her having nothing to do.
           Her health is not topped up here: she comes back full at the gong
           (see `_nextRound`), which is a different thing and happens later. */
        p.becomeAngel();
      } else {
        /* Free, immediate, and off the BASE hundred rather than her own bar:
           an Adamant orb must not quietly make the regen bigger too. */
        p.hp = Math.min(p.maxHp, p.hp + regen);
      }
    }

    /* Stocked NOW rather than on the respawn clock. Fifteen seconds of bare
       stone is the feature silently not happening — see Menagerie.topUp. */
    this.game.menagerie?.topUp();

    this._banner('FEAST!', 'feast');
    /* ONE LINE, NOT ONE PER OUTCOME, and the reason is the recording rather
       than the writing. `Announcer` prints the text it is given while playing
       the clip that matches the id, so two strings behind one id would put
       words on screen that are not the words being spoken — which is exactly
       the desynchronisation the cutscene's `typeRate` exists to prevent, in
       its stupidest possible form. The line is written to be true whether
       somebody is flying overhead or both of them are still standing. */
    this.announcer?.say('sat_feast',
      'Fifteen seconds, fighters! Get your breath back — and if something runs past you, EAT IT!');
    for (const p of this.game.players) {
      /* AND IT SAYS WHAT EATING IS NOW FOR. The feast used to buy exactly one
         thing — health you keep — which is worth very little to somebody about
         to be healed to full anyway. Half of it now comes back as a bar that
         goes PAST full next round, so the instruction has to say so or the
         green on her HUD is a mystery. */
      this.game.toast(p.angel
        ? 'Knocked out — fly it off! You come back with a full bar'
        : 'Catch and eat! Hold ATTACK next to a critter — half of what you'
          + ' heal comes back as GREEN overflow next round',
      p.index);
    }
  }

  _nextRound() {
    this.round++;
    this.t = 0;
    this.state = 'card';

    /* POSTED ON OPPOSITE SIDES, FACING EACH OTHER, AND FROZEN.
       `resetForRound` puts each of them on her mark with no timers, and the
       `card`/`count` states feed a dead pad (see `frozen`) so neither can move
       until the gong. Two kittens standing still on opposite sides of a ring
       is the picture that says "this is a duel" — and it is also the only
       moment either girl gets to see where her sister is before it starts. */
    /* POSTS COME FROM THE SIDES, so teammates open beside each other and the
       other team is across the ring. Two fighters fall through to the pair of
       posts the world already had, unchanged. */
    const posts = this.world.postsForSides(this.sides);
    /* Nobody carries an animal across a round boundary. Both kittens are about
       to be teleported to their marks, and a rat pinned to a cat who is no
       longer where she was gets dragged across the deck for the rest of the
       tournament. */
    this.game.menagerie?.releaseAll();
    this.game.players.forEach((p, i) => {
      const post = posts[i] ?? posts[0];
      /* She faces the middle of everybody who is NOT on her side. In a duel
         that is the other post, exactly as before; in a 2v2 it is the point
         between the two kittens she is about to fight, which is what makes the
         opening picture read as two teams rather than four cats in a square. */
      const foes = posts.filter((_, j) => this.sides[j] !== this.sides[i]);
      const other = foes.length
        ? {
          x: foes.reduce((n, q) => n + q.x, 0) / foes.length,
          z: foes.reduce((n, q) => n + q.z, 0) / foes.length,
        }
        : (posts[1 - i] ?? posts[0]);
      /* THE OVERFLOW IS BANKED BEFORE ANYTHING IS FILLED, because raising the
         ceiling and filling to it are two different events and `resetForRound`
         does the second one. Half of what she HEALED by eating — see
         `OVERFLOW_FRAC` and `Player.setRoundBonus`, which replaces rather than
         adds, so this lasts exactly one round. */
      p.setRoundBonus?.(Math.round((p.fedHp ?? 0) * OVERFLOW_FRAC));
      p.fedHp = 0;

      /* THE PANDA IS PATCHED UP BETWEEN ROUNDS, like she is — and AFTER the
         overflow is banked, because its bar is a fraction of hers and banking
         first is what lets a good feast make the animal tougher too. */
      p.panda?.resetHp();

      /* WHAT SHE STARTS WITH IS DECIDED HERE, and it is asked of her state
         rather than remembered from the last frame of the feast. There is no
         stored copy of any of it, so there is nothing for the feast to get out
         of step with.

         AN ANGEL IS REBORN FULL, and so is anybody who LOST the round on her
         feet. Reported from play: "if a player loses a round but is still
         alive, then they should be fully healed before the next match begins".
         It was a real unfairness rather than a preference — a kitten knocked
         out came back at the top of her bar, and the one who merely lost on
         the clock came back on whatever was left of hers, so being beaten
         BADLY was the better outcome of the two.

         THE WINNER KEEPS WHAT SHE HAS. That is the half that makes winning a
         round worth something at all now, and it is why this asks who won
         rather than healing everybody. A DRAW heals nobody, because nobody
         lost — `_lastWinner` is -1 and no side matches it. */
      const lost = this._lastWinner >= 0 && this.sides[i] !== this._lastWinner;
      const carried = (p.angel || lost) ? null : p.hp;
      // Facing is atan2(x, z) in this game — 0 is +Z. Point her at the other.
      const facing = Math.atan2(other.x - post.x, other.z - post.z);
      p.resetForRound(post.x, post.y, post.z, facing, carried);
    });

    const last = this.round === MAX_ROUNDS;
    this.announcer?.say(`sat_r${this.round}`, last
      ? 'FINAL ROUND! Everything comes down to this one!'
      : `ROUND ${this.round}! Ember versus Frost — fighters, take your marks!`);
    this._banner(last ? 'FINAL ROUND' : `ROUND ${this.round}`, 'round');
  }

  /**
   * True while the fighters must not be able to move.
   *
   * Read by `Game`, which swaps in a dead pad — the same mechanism the star
   * pose and hit-stun use, so none of the three movement modes has to know
   * that a tournament exists.
   */
  get frozen() {
    return this.state === 'card' || this.state === 'count'
      || this.state === 'ko' || this.state === 'result';
  }

  /* ------------------------------ events --------------------------------- */

  /** A blow landed. Called from Game.strikePlayers, after the damage. */
  onHit(attacker, target, dealt, kind) {
    this.game.hitSpark?.(target, kind);
    if (!target.ko) return;
    this._checkRoundOver(`${attacker.name} knocks ${target.name} down!`);
  }

  /**
   * A fighter went down — is the ROUND over?
   *
   * IT IS NOT OVER UNTIL A SIDE IS, which is the difference between a duel and
   * every other league. In a duel one knockout is one side wiped and this is
   * exactly what it always was; in a 2v2 the first kitten down leaves her
   * partner fighting alone, which is the whole shape of a tag-team round and
   * the reason to have one. Asking "did somebody go down" instead would end a
   * 2v2 on the first knockout and make the second fighter on each side
   * decorative.
   */
  _checkRoundOver(message) {
    if (this.state !== 'live') return;
    const up = this._sidesUp();
    if (up.length > 1) {
      // Still contested — say who went down, because in a four-way scrap it is
      // not otherwise obvious which side just lost somebody.
      this.game.toast(message, 0);
      this.audio?.play('ringout');
      return;
    }
    this._roundOver(up[0] ?? -1, message);
  }

  /**
   * End the live round NOW and give it to whoever is ahead on damage — the
   * clock running out, and the debug key that stands in for it.
   *
   * IT IS A METHOD BECAUSE IT HAS TWO CALLERS AND HAD ONE. Debug `4` used to
   * end a round by making player 1 hit player 2 for her whole health bar,
   * which in a duel looked like the round ending and in anything else was
   * simply Frost being killed: it named the two players by index, so at four
   * players it left the other two standing, and in a 2v2 it did not even end
   * the round. Reported from play as exactly that — "it doesn't end the
   * round, it just kills Frost". Going through the same decision the clock
   * makes means the debug key cannot disagree with the game about who won.
   *
   * NOBODY IS HURT. A round called on time is not a knockout, so this does not
   * touch anybody's health — the score it awards is the score they had earned.
   *
   * @returns {'won'|'draw'|null} what it decided, or null if no round is live.
   */
  callOnDamage(why = 'Time!', onTheClock = false) {
    if (this.state !== 'live') return null;
    /* Counted PER SIDE — in a 2v2 the honest reading of who was winning is
       what the team did between them, not which individual landed most. */
    const scores = this.wins.map((_, s) => this._sideDamage(s));
    const best = Math.max(...scores);
    const leaders = scores.map((v, s) => (v === best ? s : -1)).filter((s) => s >= 0);
    /* HIS SENTENCE BEFORE THE ROUND'S. On the clock this starts ZERO and hands
       back how long it runs; on anything else it silences him and hands back
       nought, and both endings below read the same either way. */
    const wait = this._letHimFinish(onTheClock);
    /* REMEMBERED FOR THE CAMERA, and only for it. `wait` is already 0 when
       something other than the clock ended the round, but "he has no shout to
       finish" and "the clock did this" are two different facts and the shot
       needs the second one: with the recordings deleted `_letHimFinish`
       returns 0 on the clock too (ninth non-negotiable), and the camera should
       still be on him for the beat. Cleared where the round starts, with the
       rest of the per-round latches. */
    this._onTheClock = onTheClock;
    /* A DRAW IS NOT A WIN FOR NOBODY — it still has to move the state on, or
       the round the clock just refused to keep open stays open. */
    if (leaders.length !== 1 || best <= 0) {
      this.state = 'ko';
      this.t = 0;
      /* A DRAW HEALS NOBODY, because nobody lost. See `_nextRound`. */
      this._lastWinner = -1;
      /* THE SAME BELL, ASKING A QUESTION. A draw needs to sound different from
         a result or it reads as the game having failed to decide — which is
         exactly what a nine-year-old will conclude from a K.O. bell over a
         banner that says DRAW. `drawgong` is `endgong` with its tail bending
         UP, which is what a question mark sounds like. It rings NOW, not after
         the wait: see `_announce`. */
      this._announce(wait, 'drawgong', () => {
        this._banner('DRAW', 'ko');
        /* IT IS RARE, SO IT IS FUNNY. Two sides finishing dead level on damage
           happens perhaps once in a hundred rounds, and a moment that rare
           earning the same shrug as any other is the moment wasted. */
        this.announcer?.say('sat_draw',
          'A DRAW?! Have you kittens decided that FRIENDSHIP IS MAGIC?! I LOVE it! '
          + 'Strength through LOVE, not war! BEAUTIFUL! ...Now get OUT of my ring.');
        this.game.toast(`${why} Nobody landed enough — the round is a draw`, 0);
      });
      return 'draw';
    }
    const names = this.sideMembers(leaders[0]).map((p) => p.name).join(' and ');
    this._roundOver(leaders[0], `${why} ${names} was ahead on damage`, wait);
    return 'won';
  }

  /**
   * @param {number} winnerSide
   * @param {string} message
   * @param {number|null} wait seconds already bought by `_letHimFinish`, or
   *        null to work it out here. `??` and not `||`, because ZERO IS AN
   *        ANSWER: a caller that has already decided there is nothing to wait
   *        for must not have `_letHimFinish` run a second time underneath it,
   *        which would clear the announcer and throw away the shout it just
   *        started.
   */
  _roundOver(winnerSide, message, wait = null) {
    if (this.state !== 'live') return;
    /* "K.O." IS A CLAIM ABOUT SOMEBODY'S BODY, AND HALF THE TIME IT WAS FALSE.
       A round ends two ways: a side is wiped out, or the clock runs out and it
       is given to whoever was ahead on damage. Only the first is a knockout —
       the second leaves both fighters on their feet — and the banner said
       K.O. either way while Mr. Satan shouted "DOWN!" at a kitten who was
       visibly standing up. Reported from play as exactly that.

       ASKED BEFORE THE WAIT, not inside the closure. `_announce` can hold this
       for as long as he takes to finish his sentence, and the answer is about
       the frame the round ENDED on. */
    const standing = this._sidesUp().length > 1;
    this.state = 'ko';
    this.t = 0;
    /* REMEMBERED FOR THE NEXT ROUND'S HEALING, and set here rather than read
       off `wins` because `wins` is a running total: "who won a round" and "who
       won THE LAST round" are different questions and only the second one
       decides who starts the next one full. */
    this._lastWinner = winnerSide;
    if (winnerSide >= 0) this.wins[winnerSide] = (this.wins[winnerSide] ?? 0) + 1;
    /* THE ROUND ENDS ON A BELL. The gong at the top of a round is the one sound
       in the game that STARTS something and it had no answer: a round simply
       stopped, with a banner. Reported as wanting one. Lower and longer than
       the fight gong, and it settles rather than rings out — and it rings on
       the frame the round ends, never after the wait: see `_announce`. */
    this._announce(wait ?? this._letHimFinish(false), 'endgong', () => {
      /* HE COMMENTS ON WHAT HE CAN SEE. Nobody went down, so he does not say
         anybody did — he is a showman who has to fill the silence, and being
         faintly disappointed that it went to the clock is more him than a
         shout that contradicts the screen. */
      if (standing) {
        this.announcer?.say('sat_over', ROUND_OVER_LINE);
        this._banner('ROUND OVER', 'ko');
      } else {
        this.announcer?.say('sat_ko', 'DOWN! Oh, that had to hurt!');
        this._banner('K.O.', 'ko');
      }
      // Addressed to a side now, so everybody on it hears it.
      for (const p of winnerSide >= 0 ? this.sideMembers(winnerSide) : this.game.players) {
        this.game.toast(message, p.index);
      }
    });
  }

  /* -------------------- the two debug fast-forwards ----------------------- */

  /**
   * END THIS BEAT AND GO TO THE NEXT ONE — debug `4`.
   *
   * IT USED TO ONLY KNOW ABOUT A LIVE ROUND, and a key called "end the round"
   * that does nothing for the fifteen seconds after it is a key you press,
   * watch do nothing, and press again. Asked for as: "make the 4 command to
   * end the round work for the current battle round, and feast, it is like a
   * fast forward button to move along the script to the next part."
   *
   * SO EVERY STATE ANSWERS IT, and each answer is the real transition rather
   * than a shortcut around one. The clock's own decision ends a round, the
   * `ko` beat's own hold ends the ceremony, and the feast's own timer starts
   * the next round — so this key cannot disagree with the game about what
   * comes next, which is the whole reason `4` stopped hitting player two for
   * her health bar in the first place.
   *
   * `result` IS NOT IN HERE ON PURPOSE. The results screen is waiting for a
   * kitten to enter a name, and a debug key that types it for her is a debug
   * key that skips the one screen a player has to answer.
   *
   * @returns {string|null} what it did, for the toast, or null if nothing
   */
  endBeat(why = '[debug] round called!') {
    switch (this.state) {
      case 'card':
      case 'count':
        /* Straight to the gong. `t` is what both of those states are waiting
           on, so this lands in `live` through the same line the wait does. */
        this.t = this.state === 'card' ? CARD_TIME : COUNT_FROM;
        return 'skipped to FIGHT!';
      case 'live': {
        const how = this.callOnDamage(why);
        return how === 'draw' ? 'round ended — a draw' : 'round ended';
      }
      case 'ko':
        /* HIS SENTENCE STILL GETS SAID, IT JUST GETS SAID NOW. Running the
           pending closure rather than dropping it is what keeps the banner and
           the result honest — skipping it would move the game on past a round
           whose outcome was never shown. */
        this._flushKo();
        this.t = this._koHold ?? KO_HOLD;
        return 'ceremony skipped';
      case 'feast':
        this.t = FEAST_TIME;
        return 'feast skipped';
      default:
        return null;
    }
  }

  /**
   * NUDGE THE CURRENT BEAT FORWARD — debug `5`.
   *
   * The difference from `endBeat` is the whole reason it is a second key.
   * Asked for as "a command that will skip forward in the current scene/match
   * rather than skip it like the 4 command does", with the ladder spelled out:
   * a live round steps down to thirty seconds, then fifteen, then five, and
   * only then runs out.
   *
   * WHY A LADDER AND NOT A JUMP. Everything interesting about the last thirty
   * seconds is what Mr. Satan does at each of those marks, and they are the
   * three hardest things in the game to look at twice — two minutes of a live
   * round each time. Landing ON a mark rather than past it is what makes each
   * line fire exactly as it does in play: the latches in `_callTheClock` are
   * all `left <=` tests, so a step to 15 with 30 already said fires one line,
   * and a jump straight from 120 to 15 would fire two on the same frame and
   * queue them behind each other. The ladder is the thing that keeps a debug
   * key from showing you a timing bug it caused itself.
   *
   * PAST THE LAST MARK IT HANDS OVER TO THE CLOCK rather than calling the
   * round itself — `t` past `ROUND_LIMIT` is what `update` is already testing,
   * so the round ends ON THE CLOCK, with `_onTheClock` set, his ZERO shout and
   * the camera on him. A `callOnDamage(_, false)` here would look like the
   * same thing and silently skip all three.
   *
   * @returns {string|null} what it did, for the toast, or null if nothing
   */
  nudge() {
    if (this.state !== 'live') return this.endBeat('[debug] round called!');
    const left = ROUND_LIMIT - this.t;
    for (const mark of [WARN_AT, COUNT_AT, COUNT_LAST]) {
      if (left <= mark) continue;
      this.t = ROUND_LIMIT - mark;
      return `${mark}s left`;
    }
    /* Past five seconds already: let the clock run out on its own terms. A
       hair past the limit rather than exactly on it, because `update` tests
       `>` and a frame that lands exactly on the boundary would do nothing. */
    this.t = ROUND_LIMIT + 0.001;
    return 'clock run out';
  }

  /** The `ko` beat's pending banner-and-line, run NOW. Shared by the update
   *  loop's own timer and by both debug keys, so a skipped ceremony is the
   *  same ceremony, arriving early. */
  _flushKo() {
    if (!this._pending) return;
    const p = this._pending;
    this._pending = null;
    this._dropPose();
    p.run();
  }

  /* ------------------------------ update --------------------------------- */

  update(dt, pads) {
    if (this.state === 'off') return;

    this.t += dt;
    this._paintHud();

    /* BEFORE THE STATE MACHINE, AND IN EVERY STATE. See OUT_FLOOR: the
       ring-out rule has four exemptions that are each correct and that
       together let a kitten fall out of the world. This is the floor, and a
       floor that only exists on some frames is not a floor. */
    this._catchFallers();

    switch (this.state) {
      case 'card':
        if (this.t >= CARD_TIME) {
          this.state = 'count';
          this.t = 0;
          this._counted = COUNT_FROM + 1;
        }
        break;

      case 'count': {
        /* One tick a second, fired on the SECOND it belongs to rather than
           on a timer per number. Counting down by decrementing on an elapsed
           threshold drifts against the clock the banner is showing, and the
           gong landing a frame after "1" has left the screen is the one
           moment in this whole feature that has to be exact. */
        const left = Math.ceil(COUNT_FROM - this.t);
        if (left < this._counted && left > 0) {
          this._counted = left;
          this.audio?.play('count');
          this._banner(String(left), 'count');
        }
        if (this.t >= COUNT_FROM) {
          this.state = 'live';
          this.t = 0;
          /* THE CLOCK'S CALLS ARE PER ROUND, and this is the one line in the
             machine that means "a round has started" — `state = 'card'` is two
             places and `_nextRound` is not the only way into either. */
          this._warned = false;
          this._called15 = false;
          this._called10 = false;
          this._counting = false;
          this._voiced = false;
          this._countShown = null;
          this._pending = null;
          this._onTheClock = false;
          this._koHold = KO_HOLD;
          this.audio?.play('gong');
          this.announcer?.say('sat_fight', 'FIGHT!');
          this._banner('FIGHT!', 'fight');
        }
        break;
      }

      case 'live':
        this.fightTime += dt;
        this._updateOut(dt, OUT_DAMAGE);
        this._callTheClock(ROUND_LIMIT - this.t);
        /* A round that never ends. Two kittens who are both bored, or one
           who has climbed the announcer's box and is sitting on it, would
           otherwise hold the tournament open forever with no way out but the
           pause menu. Whoever has done the most damage takes it — the honest
           reading of who was winning. */
        if (this.t > ROUND_LIMIT) this.callOnDamage('Time!', true);
        break;

      case 'ko':
        /* HIS SENTENCE FIRST, THEN THE ROUND'S. See `_letHimFinish`: when the
           clock is what ended the round he is mid-shout, and the bell over the
           top of ZERO is the bug this beat exists to fix. */
        if (this._pending && this.t >= this._pending.at) this._flushKo();
        if (this.t >= (this._koHold ?? KO_HOLD)) {
          const decided = this.wins.some((w) => w >= WINS_NEEDED);
          /* THE FEAST ONLY HAPPENS IF THERE IS ANOTHER ROUND TO EAT FOR. It is
             not a victory lap and it is not a rest — it is fifteen seconds of
             preparing for the next bout, and running it before the results
             screen would be fifteen seconds of a decided tournament in which
             the health both girls are collecting means nothing. */
          if (decided || this.round >= MAX_ROUNDS) this._finishTournament();
          else this._startFeast();
        }
        break;

      case 'feast':
        /* THE DECK IS STILL THE DECK, IT JUST DOES NOT COST ANYTHING.
           Before the feast existed, every non-live tournament state was a
           frozen one, so there was no way to walk off the arena — and the
           island out there is finite. A kitten who chases a rat over the rim
           would otherwise fall for the whole fifteen seconds and respawn in
           the town, three hundred units from a tournament that is about to
           post her back on her mark. Same test, same grace, same throw back to
           the middle; zero damage, because nobody is fighting. */
        this._updateOut(dt, 0);
        if (this.t >= FEAST_TIME) this._nextRound();
        break;

      case 'result':
        this._updateResult(dt, pads);
        break;

      default:
        break;
    }

    this._updateBanner(dt);
    /* AFTER THE STATE MACHINE, so the frame a round ends is the frame the
       number goes away. Painted rather than driven by events, because there
       are six ways out of a live round and a hide that hangs off any one of
       them is five bugs waiting. */
    this._paintCountdown();
  }

  /**
   * Anybody under the floor goes back on the deck. See OUT_FLOOR.
   *
   * NO DAMAGE AND NO BANNER, EVER. A live fighter who leaves the ring has
   * already been charged by `_updateOut` — she is rung out the moment she is
   * past the line and has come down, which happens metres above this. Anyone
   * who reaches this floor got here through one of that rule's exemptions, and
   * charging her would mean a knocked-out kitten losing health she does not
   * have, or an angel being fined for flying. This is not a penalty; it is the
   * arena declining to let somebody fall out of it.
   *
   * PUT DOWN IN THE MIDDLE, exactly where a ring-out puts her, and for the
   * same reason `_updateOut` gives: her post is on one side of a 56-unit deck
   * and she went off some other edge.
   *
   * `camTarget` MOVES WITH HER. Without it the camera lerps across the gap she
   * just teleported over, which is the whole 160-unit swoop this exists to
   * stop — arriving a beat later and backwards.
   */
  _catchFallers() {
    const R = this.world.arenaRing;
    if (!R) return;
    for (const p of this.game.players) {
      if (p.position.y > R.y - OUT_FLOOR) continue;
      /* An angel has her own leash and flies UNDER the rim as happily as over
         it — see `_updateOut`. Hers is `Player._updateAngel`, and two systems
         reeling in the same kitten is how she ends up somewhere neither of
         them meant. */
      if (p.angel) continue;
      p.position.set(R.x, R.y + 3, R.z);
      p.group.position.copy(p.position);
      p.velocity.set(0, 0, 0);
      p.camTarget.copy(p.position);
      p.outT = 0;
      /* Her flight ended here rather than at the rule below, and the flag it
         set has to be spent by whichever of the two catches her. */
      p.blastT = 0;
    }
  }

  /**
   * Off the deck: a warning, then a price.
   *
   * The warning matters more than the damage. `arenaOutBy` returns a signed
   * distance rather than a boolean precisely so this can start shouting a
   * couple of units BEFORE the line — a penalty that arrives with no build-up
   * reads as the game taking health off you for no reason, and the whole
   * point of the painted border is that the rule is visible.
   */
  _updateOut(dt, damage) {
    for (const p of this.game.players) {
      if (p.ko) continue;
      /* An angel is ALLOWED off the deck — flying over the rim is most of what
         the wings are for, and she has her own leash (`Player._updateAngel`).
         Throwing her back into the middle of a ring she is not fighting in
         would be the game taking the one thing she has to do away from her. */
      if (p.angel) { p.nearEdge = false; continue; }
      /* NOR IS A KITTEN HELD IN A CROSS SLASH, for the same reason nobody
         else can hit her: she is frozen with gravity off in the middle of
         somebody's technique, and the edge of the world is not allowed to be
         the one thing that reaches into that. Caught over the rim she hangs
         there, takes the launch when the cuts finish, and gets rung out on her
         own account a moment later if that is where she lands — which is the
         same order of events a kid watching would expect. */
      if (p.heldBy) { p.nearEdge = false; p.outT = 0; continue; }
      /* MR. SATAN'S DOING, NOT HERS — AND THE PRICE IS PER PLAYER BECAUSE OF
         IT. A kitten still in the air on his account, or newly down from it,
         gets the FEAST'S deal instead of the round's: put back on the stone,
         nothing said, no banner, no health. The gag's whole licence is that it
         takes nothing from anybody (see `systems/satanblast.js`), and it does
         not reach that by avoiding `hurt` — it never calls `hurt` — but by not
         being charged HERE, because being blown off the announcer's box means
         coming down outside the ring and below the deck.

         SKIPPING HER OUTRIGHT WAS THE FIRST TRY AND IT DID NOT WORK. `continue`
         leaves her standing outside the ring with the rule waiting for her
         flag to expire, so she is rung out four seconds late instead of on
         time; and a flag cleared when she LANDS is cleared on the very frame
         `down` becomes true, which is the frame this charges her. What she
         wants is not to be skipped, it is to be picked up for free — which is
         a thing this function already knows how to do. */
      const price = p.blastT > 0 ? 0 : damage;
      const out = this.world.arenaOutBy(p.position.x, p.position.z);
      /* The warning ring is a FIGHTING warning. During the feast there is no
         penalty to warn about, and a red flashing ring round her feet while
         she is chasing a rabbit reads as damage she cannot find. */
      p.nearEdge = price > 0 && out > -3.5 && out <= 0;

      /* SHE IS OUT WHEN SHE IS STANDING ON THE LOWER FLOOR, AND NOT BEFORE.
         Three separate things have to be true, and each one is a bug that was
         really in here:

         PAST THE LINE (`out > 0`) — she is outside the ring horizontally.

         OFF THE STONE (`p.position.y < R.y - OUT_DROP`) — her feet are BELOW
         the deck. This is the half that was missing, and it is what rang
         kittens out while they were still visibly on the stage: the deck is 56
         across and the paint sits 1.1 units inside its edge, so there is a
         full stride of real stone past the line. Standing on stone is standing
         in the ring, whatever the paint says. The paint is the WARNING (see
         `nearEdge` above), not the penalty.

         AND SHE HAS COME DOWN — `onGround` on the island below, or fallen past
         `OUT_FALL` with nothing under her at all. Airborne over the line she
         keeps her jumps, her dive and every frame of the arc to get back,
         which is what stops a big hit costing 30 health for an arc that ends
         on the deck.

         NO GRACE ONCE ALL THREE HOLD. She is standing on the ground outside
         the ring; there is nothing left to wait for, and half a second of
         nothing happening reads as the rule being broken. The feast's free
         return keeps the grace — see `OUT_GRACE`. */
      const R0 = this.world.arenaRing;
      const offStone = !R0 || p.position.y < R0.y - OUT_DROP;
      const fallen = R0 && p.position.y < R0.y - OUT_FALL;
      const down = offStone && (p.onGround || fallen);
      if (out <= 0 || !down) { p.outT = 0; continue; }
      p.outT = (p.outT ?? 0) + dt;
      if (p.outT < (price > 0 ? 0 : OUT_GRACE)) continue;

      p.outT = 0;
      const R = this.world.arenaRing;
      /* Thrown back toward the MIDDLE, not to her post. Her post is on one
         side of a 56-unit square and she went off some other edge; sending
         her there can drop her straight back out of the far side, and it also
         hands her a free retreat across the ring. */
      /* `pierce` — the ward does not stop the edge of the world. Without it a
         kitten wearing the orb parks herself off the side of the ring and
         takes nothing for the whole round, because the bubble runs longer
         than its own cooldown. See Player.hurt. */
      const dealt = price > 0 ? p.hurt(
        price, { x: R.x, z: R.z }, { knock: 0, lift: 0, pierce: true }, this.game
      ) : 0;
      p.position.set(R.x, R.y + 3, R.z);
      p.group.position.copy(p.position);
      p.velocity.set(0, 0, 0);
      p.camTarget.copy(p.position);
      /* A free return during the feast: back on the stone, nothing said, no
         banner and no toast. It is not an event, it is the arena declining to
         let her fall off it. */
      /* THE FLIGHT IS OVER, whether it ended in the air or on the floor of
         the arena — she is back on the stone, so there is nothing left for the
         exemption to protect and leaving it set would hand her the rest of it
         as free time outside a ring she is now standing in the middle of. */
      p.blastT = 0;
      if (price <= 0) continue;
      /* Longer than an ordinary hit's invulnerability. She is being dropped
         back into the middle of the ring next to somebody who is already
         swinging, and landing straight into a free combo is exactly the sort
         of thing that reads as the game cheating. */
      p.invulnT = Math.max(p.invulnT, 1.5);
      this.audio?.play('ringout');
      this._banner('RING OUT!', 'ko');
      this.game.toast(`${p.name} was thrown out of the ring! −${dealt}`, p.index);
      if (p.ko) this._checkRoundOver(`${p.name} is out of the ring!`);
    }
  }

  /* ------------------------------ the purse ------------------------------ */

  /**
   * Winning pays, in the points the dealer takes.
   *
   * THIS MAKES THE ECONOMY RENEWABLE, AND IT WAS DELIBERATELY FIXED BEFORE.
   * Every point in the game came from knocking something over — 4550 across 216
   * props — and the orbs only exist once everything has been knocked over, so
   * the pot was closed and a stack of four was priced to be unreachable on
   * purpose. A tournament can be replayed all afternoon, so this opens it.
   *
   * That is the point of it: a kitten who has spent her share has something to
   * do about it besides asking her sister, and the arena gets a reason to be
   * gone back to. But it does move the ceiling, so the purse is ONE ORB and it
   * is DERIVED rather than picked — `kotodama.price` already knows what an orb
   * costs for this party size, so the purse tracks the price automatically
   * instead of being a second number that has to be kept in step with it.
   *
   * EVERY MEMBER OF THE WINNING SIDE IS PAID THE SAME. Splitting it would make
   * a 2v2 win worth half a duel win each, which teaches two sisters that
   * teaming up is worse than fighting — the exact opposite of the reason the
   * team modes exist.
   */
  _payPurse(winners) {
    const purse = this.game.kotodama?.price ?? 0;
    if (purse <= 0) return;
    for (const p of winners) {
      p.score += purse;
      this.game.onScoreChanged?.(p);
      this.game.toast(`${p.name} won ${purse} points in the ring!`, p.index);
    }
  }

  /* ------------------------------ the end -------------------------------- */

  _finishTournament() {
    this.state = 'result';
    this.t = 0;

    /* THE WINNER IS A SIDE. Most round wins takes it; a dead heat — three
       rounds with one of them drawn on the clock — falls through to total
       damage, and if that is level too the tournament is a draw and nobody
       signs the board. That is a real outcome and has to be said out loud
       rather than silently crowning whoever happens to be first in the list. */
    const best = Math.max(...this.wins);
    let lead = this.wins.map((w, s) => (w === best ? s : -1)).filter((s) => s >= 0);
    if (lead.length > 1) {
      const dmg = lead.map((s) => this._sideDamage(s));
      const top = Math.max(...dmg);
      lead = dmg.filter((v) => v === top).length > 1
        ? [] : [lead[dmg.indexOf(top)]];
    }
    const ws = lead.length === 1 ? lead[0] : -1;

    /** Everybody on the winning side, or empty for a draw. */
    this.winners = ws < 0 ? [] : this.sideMembers(ws);
    /* `winner` stays the single kitten the results screen and the name entry
       are written against — the highest scorer on the winning side, so a 2v2
       is signed by whoever actually earned it rather than by the lower index.
       `winners` is what the purse and the board rows iterate. */
    this.winner = this.winners.length
      ? this.winners.reduce((a, b) => (b.dmgDealt > a.dmgDealt ? b : a))
      : null;
    this.entry.reset();

    if (this.winner) {
      this.score = scoreOf({
        wins: this.wins[ws],
        dealt: this.winner.dmgDealt,
        taken: this.winner.dmgTaken,
        seconds: this.fightTime,
        rounds: this.round,
        maxHp: MAX_HP,
      });
      this._payPurse(this.winners);
      this.audio?.play('victory');
      this.announcer?.say('sat_win1', 'AND THAT IS THE MATCH! What a display!');
      this.announcer?.say('sat_win2', 'Put your name on my board, champion. It stays there.');
    } else {
      this.score = 0;
    }
    this._paintResult();
    this.resultEl?.classList.remove('hidden');
    this.hudEl?.classList.add('hidden');
    this.bannerEl?.classList.add('hidden');
  }

  _updateResult(dt, pads) {
    if (!this.winner) {
      // A draw signs nothing. Any button sends them home.
      if (pads.some((p) => p.pressed('jump'))) this.goHome();
      return;
    }
    if (this.entry.done) {
      if (pads.some((p) => p.pressed('jump'))) this.goHome();
      return;
    }
    const { moved, confirmed } = this.entry.update(dt, this._signingPads(pads));
    if (moved) this.audio?.play('menu');
    if (confirmed) this._commit();
    if (moved || confirmed) this._paintResult();
  }

  /**
   * WHOSE STICKS MAY SPELL THE CHAMPION'S NAME — the winning side's, and
   * nobody else's.
   *
   * `NameEntry.update` folds every pad it is given into one cursor: it takes
   * the largest stick reading of the lot and confirms on anybody's JUMP. That
   * is exactly right when the question is "which of the two of you is holding
   * the pad she won on", and it is wrong the moment there are four of them,
   * because the three who LOST are also holding sticks. In practice the board
   * was signed by whoever was fidgeting: a losing kitten resting a thumb on her
   * stick out-voted the winner spelling her own name, and a stray JUMP
   * committed a half-typed one she could never go back and fix.
   *
   * IT IS THE WHOLE WINNING SIDE, NOT `winner`. A 2v2 is won by two kittens and
   * `winner` is only the one the row is filed under (the higher scorer); both
   * of them earned it, and locking the letters to one of them is the same
   * unfairness one step smaller.
   *
   * A DRAW AND THE FLY-HOME PRESS ARE UNTOUCHED. Nothing is being decided
   * there, and making three players watch a fourth press JUMP to leave is the
   * kind of gate that has one kid holding the controller for everybody.
   */
  _signingPads(pads) {
    const winners = this.winners?.length ? this.winners : (this.winner ? [this.winner] : []);
    const mine = winners.map((p) => this.game.players.indexOf(p)).filter((i) => i >= 0);
    const picked = mine.map((i) => pads[i]).filter(Boolean);
    /* A winner with no pad at all — she is on the keyboard, or her controller
       was unplugged between the last blow and the results screen — must not
       leave a board nobody can sign. Falling back to every pad is the old
       behaviour, which is the right failure: shared, rather than stuck. */
    return picked.length ? picked : pads;
  }

  /** Keyboard route into the same name entry. */
  key(code) {
    if (this.state !== 'result' || !this.winner || this.entry.done) return false;
    if (!this.entry.key(code)) return false;
    if (this.entry.done) this._commit();
    this._paintResult();
    return true;
  }

  _commit() {
    const w = this.winner;
    /* `wins` is per SIDE, so the row records the winning side's round wins —
       which is what "2-1" means in a team match. Reading `wins[w.index]` was
       right only while a side and a player were the same thing. */
    const saved = saveResult({
      name: this.entry.name,
      score: this.score,
      wins: this.wins[this.sideOf(w)] ?? 0,
      dealt: Math.round(w.dmgDealt),
      taken: Math.round(w.dmgTaken),
      seconds: Math.round(this.fightTime),
    }, this.boardKey);
    this.board = saved.rows;
    this.rank = saved.rank;
    this.audio?.play('clan');
  }

  /** Send them back to the town. The griffin does the travelling. */
  goHome() {
    this.state = 'leaving';
    this.resultEl?.classList.add('hidden');
    this.game.leaveArena?.();
  }

  /* ------------------------------ the camera ----------------------------- */

  /**
   * Where the shared camera wants to be, or null to leave it alone.
   *
   * IT HAS TO BE ITS OWN RIG, because the ordinary one cannot frame this. The
   * merged camera sizes its distance as `clamp(26 + separation * 0.85, 26, 52)`
   * — a clamp written for two kittens running around a town, and the ring is
   * 56 units across, so at full separation it tops out framing about half of
   * it and one of the two fighters is off screen. Same trap Ryuuseki fell
   * into, and the same fix: a rig that knows how big its own subject is.
   *
   * It tracks the CENTROID rather than the ring's centre, so the fighters stay
   * large on screen when they close — that dynamic push-in is most of what
   * makes a fighting game read — but the distance is floored high enough that
   * the edge of the deck is always somewhere on screen. A fighter who cannot
   * see how much ring is behind her cannot avoid a ring-out.
   *
   * IT FRAMES EVERY FIGHTER, AND IT USED TO FRAME THE FIRST TWO. This read
   * `const [a, b] = this.game.players` and measured the spread between exactly
   * those two — written when two was the only number there was, and left behind
   * by the four-player pass. In a free-for-all or a 2v2 the camera was
   * therefore aimed at the midpoint of players 1 and 2 and sized off their
   * separation, so two kittens fighting in the far corner could be off screen
   * entirely while the lens pushed in on a pair standing next to each other.
   * Exactly the bug `_paintHud` names below, in the one place it also had to be
   * fixed and was not.
   *
   * IT IS A STRICT GENERALISATION: for two fighters the centroid IS the
   * midpoint and the widest pair IS the two of them, so the two-player game the
   * girls know is unchanged to the last decimal. Verified in `world-check`.
   */
  cameraWant() {
    if (!this.active || this.state === 'result' || this.state === 'leaving') return null;
    const touch = !!this.game.device?.touchPrimary;
    const R = this.world.arenaRing;
    const all = this.game.players;
    const mid = {
      x: all.reduce((n, p) => n + p.position.x, 0) / all.length,
      z: all.reduce((n, p) => n + p.position.z, 0) / all.length,
    };
    /* The WIDEST pair, not the first two: the distance has to cover whoever is
       furthest apart, or the fighters at the edges of the spread are the ones
       it crops. */
    let sep = 0;
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        sep = Math.max(sep, Math.hypot(
          all[i].position.x - all[j].position.x,
          all[i].position.z - all[j].position.z
        ));
      }
    }

    /* THE CLOCK'S ENDING IS HIS, AND THE CAMERA GOES TO HIM FOR IT.
       Asked for: the timer hitting zero, and the draw speech, are the two
       moments in a round where the thing worth looking at is not in the ring —
       two kittens standing still while a man in a box shouts ZEEEEROOOO is a
       shot of the wrong half of the arena. `_onTheClock` is set only by
       `callOnDamage(_, true)`, so it is the CLOCK and never the debug key.

       A KNOCKOUT IS DELIBERATELY NOT IN THIS. The thing worth looking at there
       is the kitten who just went down, and cutting away from her to the
       announcer would throw away the one frame the whole round was for.

       IT LASTS THE `ko` BEAT AND NOT A SECOND LONGER. Hanging it off "is he
       still talking" would put the camera back in the ring for the half second
       between ZERO and the line that follows it and then drag it out again;
       `_koHold` already grew by exactly the length of his shout (see
       `_announce`), so the state IS the shot. His draw speech outruns the beat
       by a few seconds and the feast takes the screen — which is right: the
       feast is its own thing and he can finish over the top of it.

       NINTH NON-NEGOTIABLE. With no `satan` in the world — the drawing absent
       — there is nothing to point at and this falls through to the ring
       camera, which is what the whole round has been looking at anyway. */
    if (this.state === 'ko' && this._onTheClock && this.game.satan?.group?.visible) {
      const s = this.game.satan.position;
      return {
        x: s.x, y: s.y + SATAN_SHOT.lift, z: s.z,
        dist: SATAN_SHOT.dist, pitch: SATAN_SHOT.pitch,
        /* AND IT DOES NOT GET WIDENED TO FIT THE KITTENS. `main.js` floors
           every ring distance with `fitDistance` off the players' spread,
           which is right for every other shot here and would silently undo
           this one: two fighters at opposite corners of the deck ask for 80-odd
           units, so the "zoom in on Mr. Satan" would come out further back
           than the fight it cut away from. He is the subject; they are not in
           the frame at all. */
        fitPlayers: false,
      };
    }

    /* THE FEAST FRAMES THE RING, NOT THE PAIR. Every other tournament state
       wants the two fighters large, and the dynamic push-in on the midpoint is
       most of what makes an exchange read. The feast wants the opposite: the
       subject is the whole deck and the three animals running around on it,
       and the two kittens are deliberately nowhere near each other — one is on
       the stone and the other is thirty units up. A midpoint camera between
       those two frames the empty air between them. Fixed, high and wide, and
       it never moves for fifteen seconds, which is also the calmest the screen
       gets all match. */
    if (this.state === 'feast') {
      return {
        x: R.x, y: R.y + 9, z: R.z, dist: touch ? RING_DIST.touch.feast : 96, pitch: 0.56,
      };
    }

    /* Pulled toward the middle of the ring rather than sitting on the
       centroid. With every fighter in one corner, a pure centroid camera
       looks at that corner and three quarters of the screen is the island
       outside the ring. */
    const midX = mid.x;
    const midZ = mid.z;
    const k = 0.42;
    const D = touch ? RING_DIST.touch : RING_DIST.desktop;
    return {
      x: midX + (R.x - midX) * k,
      y: R.y + 2.4,
      z: midZ + (R.z - midZ) * k,
      // 52 frames a close exchange; 104 holds the whole square at full
      // spread with air around it. Measured against the deck: the diagonal of
      // a 56-unit square is 79, and a camera at 79 puts a fighter in each
      // corner of the frame with nothing to spare.
      dist: Math.min(D.max, Math.max(D.min, D.base + sep * D.k)),
      /* FLATTER THAN THE WALKING CAMERA, because the fight is horizontal and
         these are billboards. The first pass looked down at 0.72 and filled
         two thirds of the screen with an empty stone floor while squashing
         both fighters — steep pitches flatten a yaw-only billboard, which is
         the same reason the grotto camera could not simply tilt over a wall.
         The round card is a fraction higher so the whole ring reads once,
         before the fight makes the middle of it the only thing that matters. */
      pitch: this.state === 'card' ? 0.60 : 0.52,
    };
  }

  /* -------------------------------- HUD ---------------------------------- */

  /**
   * The last thirty seconds, out loud.
   *
   * A ROUND USED TO END WITHOUT WARNING. `ROUND_LIMIT` has always been able to
   * take a round off you on damage, and the only sign it was coming was a
   * small clock in the corner going red — which nobody circling a sister at
   * 1:50 is reading. Reported as wanting a countdown: a bigger number, and Mr.
   * Satan getting more and more upset about it.
   *
   * TWO EVENTS AND A PAINTER, not a per-second event stream. `_warned` and
   * `_ranting` are latches because a frame is not a second: at 300fps this is
   * called five times inside the same tick of the clock, and a call that fired
   * on `left <= 30` without one would say "thirty seconds" five times.
   *
   * @param {number} left seconds of round remaining, and it may be negative on
   *        the frame the limit is crossed.
   */
  _callTheClock(left) {
    if (!this._warned && left <= WARN_AT) {
      this._warned = true;
      this.announcer?.say('sat_t30',
        'THIRTY SECONDS LEFT! That is half a minute! Do SOMETHING!');
    }
    if (!this._called15 && left <= COUNT_AT) {
      this._called15 = true;
      this.announcer?.say('sat_last1',
        'FIFTEEN SECONDS! Are you KIDDING me?! DO something!');
    }
    if (!this._called10 && left <= COUNT_MID) {
      this._called10 = true;
      this.announcer?.say('sat_last2',
        "TEN SECONDS! FINE! I'll count! I HATE counting!");
    }
    if (this._counting || left > COUNT_LAST) return;
    this._counting = true;

    /* THE COUNT IS PLAYED, NOT SAID, AND THAT IS THE WHOLE SHAPE OF IT.
       Two reasons, both reported from play.
       Its WORDS have no business on a card: the number he is shouting is
       already on the screen eighty pixels high, and putting "FIVE! FOUR!
       THREE!" in a speech bubble underneath it is the same information twice —
       "does not need to be in a speech bubble since that is only for
       text/sentences that he is saying".
       Its TIMING cannot survive the queue. `say` queues and never interrupts,
       which is right for everything else he does and fatal here: each number
       inside this clip is nailed to the second it names, so a card ahead of it
       that runs half a second long has him shouting FIVE at a screen showing
       four. Going straight to the speech channel means it starts on the frame
       the clock says five, whatever else is on screen.
       Clearing first is what takes the ten-second card down, so the last five
       seconds are the number, his voice, and nothing else. */
    this.announcer?.clear();
    const count = this.announcer?.clip('sat_count');
    this._countVoice = count ? (this.audio?.speak(count.el) ?? null) : null;
    /* ONLY IF HE CAN ACTUALLY SAY IT. Without the recording nothing plays at
       all, so the tick in `_paintCountdown` stands in and counts the last five
       seconds out loud on its own. Ninth non-negotiable: delete `public/voice`
       and this still counts. */
    this._voiced = !!this._countVoice;
  }

  /**
   * Stop the count dead.
   *
   * IT NEEDS ITS OWN METHOD BECAUSE `Announcer.clear()` CANNOT DO IT. The count
   * plays on the speech channel rather than on a card, and `clear` empties the
   * queue and hides the card without touching audio that is already running —
   * see announce.js, where that is deliberate. A knockout at 0:03 that only
   * cleared the announcer would leave him counting over a kitten who is
   * already flat on her back.
   */
  _hushCount() {
    if (!this._countVoice) return;
    this._countVoice = null;
    this.audio?.stopSpeaking();
  }

  /**
   * Let him finish, or shut him up — and say how long the round has to wait.
   *
   * THE ZERO WAS BEING EATEN, EVERY TIME. `sat_count` ends on ONE and the round
   * ends on the same frame the clock does, so the bell and "DOWN! Oh, that had
   * to hurt!" landed on top of the one word the whole feature builds to. Worse
   * than late: `Announcer.say` starts through `Audio.speak`, which opens with
   * `stopSpeaking` — so the follow-up line did not queue behind the shout, it
   * KILLED it. Reported as "the ZEROOO part is not happening at all, because as
   * soon as the match is over, he either says the Draw dialog or other dialog".
   *
   * So the shout goes first and the round's own announcement is handed back a
   * number of seconds to wait — MEASURED off the clip rather than guessed, so
   * a re-cut that runs longer cannot start clipping itself again.
   *
   * @param {boolean} onTheClock did the ROUND TIMER end this, or something else
   * @returns {number} seconds the bell and the banner must wait
   */
  _letHimFinish(onTheClock) {
    this._hushCount();
    this.announcer?.clear();
    if (!onTheClock) return 0;

    this.announcer?.say('sat_zero', 'ZEEEEROOOO! AAAARGHHH! NO! NO! NOOOO!');
    const zero = this.announcer?.clip('sat_zero');
    /* NINTH NON-NEGOTIABLE, AND THE DEGRADE IS "DO NOT WAIT". With no recording
       there is nothing to wait FOR, and waiting anyway is six seconds of a
       frozen deck under a silent card — worse than the bug this delay fixes.
       The card still shows, the bell still rings, and it rings now. */
    if (!zero) return 0;
    /* HIS ARMS GO UP WHILE HE SHOUTS IT — asked for: "can also have him play
       his satan_charge.png animation while he is shouting ZEROOO... before
       reverting to his normal sprite". The same `setPose` the blast gag uses,
       and the same rule: a REQUEST, not a requirement. With `satan_charge.png`
       absent it does nothing at all and he shouts in his ordinary pose.
       NOT WHILE THE BLAST IS RUNNING. That gag owns the pose for its own ten
       seconds and puts it back to idle at the end of them, which would drop
       his arms in the middle of this and leave `_posed` lying about it. */
    if (!this.game.satanBlast || this.game.satanBlast.stage === 'off') {
      this.game.satan?.setPose?.('charge');
      this._posed = true;
    }
    return zero.dur + ZERO_BEAT;
  }

  /** Arms down. Idempotent, and it never touches a pose it did not set. */
  _dropPose() {
    if (!this._posed) return;
    this._posed = false;
    this.game.satan?.setPose?.('idle');
  }

  /**
   * Ring the bell and put the banner up — now, or once he has finished.
   *
   * ONE PLACE AND ONE CLOCK. Everything a round ending has to do goes in `run`
   * — the bell, the banner, his line and the toast — rather than a bell here, a
   * banner there and a line somewhere else, each with its own idea of "after".
   *
   * THE HOLD GROWS BY THE WAIT rather than absorbing it. `KO_HOLD` is how long
   * a decided round sits on screen before the next is set up and it is measured
   * from the BANNER; spending it on a shout nobody has been told the result of
   * yet would flash K.O. for half a second and cut straight to the feast.
   *
   * @param {number} wait seconds, from `_letHimFinish`
   * @param {() => void} run the bell, the banner, the line and the toast
   */
  _announce(wait, bell, run) {
    /* THE BELL IS NOT PART OF THE WAIT, AND THAT IS THE WHOLE REASON IT TAKES
       ITS OWN ARGUMENT. It is the sound that says the round is OVER, so it has
       to ring when the round is over. Held back with the rest it arrives six
       seconds after the fact, once his shout has run out — a sound about
       something that already happened, which is exactly how it was reported:
       a round ending with no gong to mark it.
       ON A DRAW IT IS ALSO THE JOKE, and a punchline has to land on the beat.
       `drawgong` is the bell-ringer looking up and finding two fighters still
       standing; that confusion belongs at the instant the clock dies, not
       after Mr. Satan has finished explaining how he feels about it.
       Everything that reads as a CONSEQUENCE — the banner, his next line, the
       toast — still waits for him to finish. Nothing about a knockout moves:
       `wait` is 0 there and this runs exactly as it always did. */
    if (bell) this.audio?.play(bell);
    this._koHold = KO_HOLD + Math.max(0, wait);
    if (wait > 0) { this._pending = { at: wait, run }; return; }
    this._pending = null;
    run();
  }

  /**
   * The big number, under the round box.
   *
   * PAINTED FROM THE STATE EVERY FRAME rather than shown and hidden by events.
   * A live round can end six ways — a knockout, a side wiped, the clock, the
   * debug key, the pause menu, flying home — and a `hidden` that hangs off any
   * one of them is five ways to leave a 3 floating over the town.
   *
   * IT SITS UNDER THE HUD, NOT IN THE MIDDLE. The middle is where the fight
   * is, and it is also where `#arena-banner` puts K.O. and FIGHT!; a number
   * that big over the deck would cover the two kittens it is counting for.
   * Below the one box both girls already read is the same argument the round
   * clock itself was built on.
   */
  _paintCountdown() {
    const el = this.countEl;
    if (!el) return;
    if (this.state !== 'live') { this._hideCountdown(); return; }
    const left = Math.max(0, ROUND_LIMIT - this.t);
    if (left > COUNT_AT) { this._hideCountdown(); return; }

    /* CEILING, so the number on screen is the number of whole seconds you
       still have. Flooring shows 14 for the whole of the fifteenth second and
       reaches 0 with a second left to play, which would make his "ZERO!" a
       second early — and he is the one thing here that cannot be adjusted. */
    const n = Math.ceil(left);
    if (n === this._countShown) return;
    this._countShown = n;
    el.textContent = String(n);
    /* Two looks, not five. Under `COUNT_LAST` it is what he is shouting; above
       it, it is a warning. A class per second would be five rules that all
       have to keep agreeing with each other. */
    el.className = n <= COUNT_LAST ? 'last' : '';
    if (n <= COUNT_LAST && !this._voiced) this.audio?.play('count');
  }

  /** Idempotent, because `_paintCountdown` calls it on every frame of the
   *  hundred and five seconds before the countdown starts and a DOM write a
   *  frame for a class that is already there is a hundred and five seconds of
   *  nothing. `_countShown` is the guard AND the reset. */
  _hideCountdown() {
    if (this._countShown === null) return;
    this._countShown = null;
    this.countEl?.classList.add('hidden');
  }

  _banner(text, kind) {
    this._bannerText = text;
    this._bannerT = kind === 'count' ? 0.9 : kind === 'fight' ? 1.1 : 2.4;
    if (!this.bannerEl) return;
    this.bannerEl.textContent = text;
    this.bannerEl.className = `banner-${kind}`;
    this.bannerEl.classList.remove('hidden');
  }

  _updateBanner(dt) {
    if (this._bannerT == null) return;
    this._bannerT -= dt;
    if (this._bannerT <= 0) {
      this._bannerT = null;
      this.bannerEl?.classList.add('hidden');
    }
  }

  /**
   * ONE BAR PER FIGHTER, GROUPED BY SIDE.
   *
   * It used to be `const [a, b] = this.game.players` — two bars, written when
   * two was the only number there was. With four kittens in the ring the third
   * and fourth had no bar at all, so half the fighters could not see their own
   * health and nobody could see theirs. The pips were worse than missing: they
   * are indexed by SIDE (`wins` counts sides) and were being drawn against
   * PLAYER 0 and PLAYER 1, which is the same number only in a duel.
   *
   * THE SIDES SPLIT AROUND THE ROUND BOX SO THE TWO-PLAYER LAYOUT IS EXACTLY
   * WHAT IT WAS. Sides are dealt to the left until the left holds at least half
   * the fighters, and the rest go right — which gives `[P1] ROUND [P2]` at two,
   * the pair against the pair at 2v2, and an even 2/2 split in a four-way free
   * for all. The girls play two-player; their HUD must not move.
   *
   * A BAR KEEPS ITS OWN KITTEN'S COLOUR, and the TEAM colour is the block
   * around it. Those are two different questions — "which bar is mine" and "who
   * is with me" — and answering both with one colour loses the first, which is
   * the one a nine-year-old needs in a hurry.
   */
  _paintHud() {
    if (!this.hudEl || this.state === 'result') return;
    const players = this.game.players;
    const ids = [...new Set(this.sides.slice(0, players.length))];

    const pips = (side) => Array.from({ length: WINS_NEEDED }, (_, k) => (
      `<i class="${k < (this.wins[side] ?? 0) ? 'won' : ''}"></i>`
    )).join('');
    /**
     * How much of her bar is GREEN, in health.
     *
     * TWO DIFFERENT SUMS, AND ONE MEANING: "this is overflow". During a round
     * it is what she is actually carrying above her ordinary top. During the
     * FEAST it is that plus what she is in the middle of gathering — half of
     * what she has healed by eating — because the ask was for "a visual
     * indicator on the screen that they are gathering the overflow effect that
     * will carry to the next battle", and the honest indicator is the quantity
     * that will actually carry rather than the whole mouthful. Half of a meal
     * shown as green and then halved again at the gong would read as losing
     * something.
     *
     * CAPPED BY WHAT SHE HAS. The green is drawn INSIDE the fill, so a figure
     * bigger than her health would paint a bar that is entirely overflow.
     */
    const overOf = (p) => {
      const gathering = this.state === 'feast'
        ? Math.round((p.fedHp ?? 0) * OVERFLOW_FRAC) : 0;
      return Math.max(0, Math.min(p.hp, (p.overflowHp ?? 0) + gathering));
    };
    const bar = (p) => {
      /* CLAMPED AT THE TOP NOW THAT THERE IS AN ABOVE-THE-TOP. `hp` never
         exceeds `maxHp` — `setRoundBonus` puts the overflow INSIDE the maximum
         — but this is the one line the whole HUD hangs off and a fraction over
         1 would be a fill wider than its own bar. */
      const k = Math.max(0, Math.min(1, p.hp / p.maxHp));
      const cls = k > 0.34 ? '' : k > 0.18 ? ' warn' : ' crit';
      /* THE FILL IS HER OWN COLOUR, INLINE. It used to be two CSS rules —
         `.ah-fill` ember, `.p1 .ah-fill` frost — which is two of the four
         kittens and no way to say the other two. `styleCss` is the same source
         the marker ring, the minimap pip and the score badge already read, so a
         bar cannot end up a different orange from the cat it belongs to. */
      const style = cls ? '' : `background:${styleCss(this.game.roster?.[p.index] ?? p.index)};`;
      /* THE OVERFLOW RIDES INSIDE THE FILL, AT ITS FAR END, and it is a
         fraction OF THE FILL rather than of the bar — so it stays put as she
         is hit and the two shrink together. `margin-inline-start: auto` is
         what pins it to the end in both directions: the right-hand side's bars
         are `direction: rtl` so they drain toward their own edge of the
         screen, and a hard `right: 0` would put the green on the wrong end of
         half the HUD.

         DRAWN ONLY WHEN THERE IS SOME. An empty span is a repaint and a rule
         nobody can see, and this markup is rebuilt every frame. */
      const over = overOf(p);
      const green = over > 0 && p.hp > 0
        ? `<i class="ah-over" style="width:${Math.min(100, (over / p.hp) * 100)}%"></i>`
        : '';
      return `<div class="ah-bar"><span class="ah-fill${cls}" `
        + `style="width:${k * 100}%;${style}">${green}</span></div>`;
    };
    /* A fighter's own line: her name, and a KO cross once she is down. Knowing
       your partner has gone is the whole shape of a tag-team round. */
    const fighter = (p) => `
      <div class="ah-f${p.ko ? ' out' : ''}">
        <div class="ah-name">${escapeHtml(p.name)}</div>
        ${bar(p)}
      </div>`;
    const sideBlock = (side, align) => {
      const mates = players.filter((_, i) => this.sides[i] === side);
      if (!mates.length) return '';
      const col = teamColour(side);
      // The team swatch and the round pips ride together: both are facts about
      // the SIDE rather than about any one kitten in it.
      const head = `<div class="ah-team" style="--team:${col}">`
        + `<span class="ah-swatch"></span>${this.teamed ? escapeHtml(teamName(side)) : ''}`
        + `<span class="ah-pips">${pips(side)}</span></div>`;
      return `<div class="ah-side ${align}" style="--team:${col}">`
        + `${head}${mates.map(fighter).join('')}</div>`;
    };

    // Deal sides left until the left half holds half the fighters.
    const left = [];
    const right = [];
    let got = 0;
    for (const s of ids) {
      const n = this.sides.filter((x) => x === s).length;
      if (got < players.length / 2 && right.length === 0) { left.push(s); got += n; }
      else right.push(s);
    }
    /* THE MIDDLE OF THE BAR IS A CLOCK, because a countdown nobody can see is
       a rule that arrives as a surprise. The feast had one from the start — its
       fifteen seconds are the whole point of the state — and the ROUND did not,
       even though `ROUND_LIMIT` can hand the round to whoever is ahead on
       damage. Two kittens circling each other at 118 seconds had no idea
       anything was about to be decided.

       IT SITS ABOVE THE ROUND NUMBER RATHER THAN REPLACING IT. Which round this
       is and how long is left are two different questions and both are asked
       during a fight; the round number is also the thing a kid looks at to know
       the match is progressing at all. One box, two lines — no new furniture and
       nowhere new to look.

       IT RUNS ONLY WHILE THE ROUND IS LIVE. `this.t` is the state's own clock,
       so during the card and the countdown it is measuring the card, not the
       round — a timer ticking down while both fighters are frozen on their
       marks is time she is being charged for and cannot use. Before the gong it
       simply shows the full allowance. */
    /* CEILING, AND IT USED TO FLOOR. On its own that was invisible: a clock
       that reads 0:13 for the whole of the fourteenth second is what every
       stopwatch does. Put the big countdown under it and the two disagreed on
       screen — 14 over 0:13 — and of the two it is the BIG one that cannot
       move, because Mr. Satan's recorded "ZERO!" is nailed to the second it
       names and flooring would have him shouting it with a second still to
       play. So both of them now say how many whole seconds you still have. */
    const clock = (s) => {
      const n = Math.ceil(s);
      return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
    };
    let mid;
    if (this.state === 'feast') {
      mid = `<span class="ah-feast">FEAST ${Math.max(0, Math.ceil(FEAST_TIME - this.t))}</span>`;
    } else {
      /* IT HOLDS WHERE IT STOPPED THROUGH THE KNOCKOUT rather than being
         recomputed from a clock that is now measuring the KO hold. Reset on the
         card, run during the round, frozen everywhere else — a clock that snaps
         back to 2:00 on the frame somebody goes down reads as the round
         restarting, which is the opposite of what just happened. */
      if (this.state === 'card' || this.state === 'count') this._roundLeft = ROUND_LIMIT;
      else if (this.state === 'live') this._roundLeft = Math.max(0, ROUND_LIMIT - this.t);
      const left = this._roundLeft ?? ROUND_LIMIT;
      /* Red under fifteen seconds, which is the point at which "who is ahead on
         damage" stops being trivia and starts being the result. */
      mid = `<span class="ah-clock${left <= 15 ? ' low' : ''}">${clock(left)}</span>`
        + `<span class="ah-round">ROUND ${this.round}</span>`;
    }

    this.hudEl.innerHTML = `
      <div class="ah-wing">${left.map((s) => sideBlock(s, 'l')).join('')}</div>
      <div class="ah-mid">${mid}</div>
      <div class="ah-wing r">${right.map((s) => sideBlock(s, 'r')).join('')}</div>`;
  }

  _paintResult() {
    if (!this.resultEl) return;
    /* A PHONE GETS BUTTONS FOR EVERY INSTRUCTION THIS SCREEN GIVES — see
       `_bindResultTaps` for why the ones it used to name are unreachable. Gated
       on the device rather than rendered always and hidden by CSS, so the
       desktop screen the girls know comes out of here byte for byte. */
    const touch = !!this.game.device?.touchPrimary;
    /* THE KEYPAD IS THE ALPHABET, NOT A COPY OF IT. Building it from a second
       list of letters is how a keypad ends up offering a glyph the name entry
       will not accept — the trailing blank is dropped because DEL is what
       shortens a name, and `ALPHABET`'s 36 real glyphs land exactly as three
       rows of ten plus a short row that DEL and OK finish. */
    /* HIDDEN WHILE SHE IS BEING ASKED, not merely inert. `NameEntry.type` and
       `del` both refuse during `confirming`, so leaving the keypad up would be
       36 buttons that silently do nothing — the exact reading of "broken" the
       sixth non-negotiable exists to prevent. YES and NO take its place. */
    const keypad = touch && !this.entry.confirming ? `
      <div class="ne-pad">
        ${ALPHABET.slice(0, 36).map((c) => `<button class="ne-key" data-ne="${c}">${c}</button>`).join('')}
        <button class="ne-key wide" data-ne="del">DEL</button>
        <button class="ne-key wide go" data-ne="ok">OK</button>
      </div>` : '';
    const flyHome = touch
      ? '<button class="ar-go" data-ne="home">FLY HOME</button>'
      : '<p class="ar-hint">PRESS JUMP TO FLY HOME</p>';
    const rows = this.board.map((r, i) => `
      <tr class="${i === this.rank ? 'me' : ''}">
        <td class="lb-rank">${i + 1}</td>
        <td class="lb-name">${escapeHtml(r.name)}</td>
        <td class="lb-score">${r.score}</td>
        <td class="lb-detail">${r.wins}W · ${r.dealt} dealt · ${r.taken} taken · ${r.seconds}s</td>
      </tr>`).join('') || '<tr><td colspan="4" class="lb-empty">No champions yet.</td></tr>';

    if (!this.winner) {
      this.resultEl.innerHTML = `
        <div class="ar-box">
          <h2>A DRAW</h2>
          <p class="ar-sub">Nobody could be separated. Mr. Satan is delighted — it means he is still the champion.</p>
          <table class="lb">${rows}</table>
          ${flyHome}
        </div>`;
      return;
    }

    const w = this.winner;
    /* THE SLOTS ARE TAPPABLE TOO, and that is not decoration: the stick can only
       WALK the cursor, so fixing the first letter of a five-letter name means
       four presses in the right direction. A thumb goes straight there. */
    const slots = this.entry.done ? '' : this.entry.slots.map((ix, i) => `
      <span class="ne-slot${i === this.entry.cursor ? ' on' : ''}" data-ne="s${i}">${
      ALPHABET[ix] === ' ' ? '&nbsp;' : ALPHABET[ix]}</span>`).join('');

    /* ARE YOU SURE THIS IS THE NAME? See `NameEntry.confirming`. The board
       outlives the browser closing and `_commit` is one-way, so the press that
       makes it permanent gets a question in front of it — and the question
       QUOTES THE NAME rather than asking in the abstract, because the thing
       she is checking is the spelling and the slots above are a row of boxes
       she has been staring at for a minute. */
    const ask = this.entry.confirming ? `
      <div class="ne-ask">
        <p class="ne-ask-q">SIGN THE BOARD AS
          &ldquo;<b>${escapeHtml(this.entry.name)}</b>&rdquo;?</p>
        <p class="ne-ask-sub">You cannot change it afterwards.</p>
        ${touch
    ? '<div class="ne-ask-keys"><button class="ne-key wide go" data-ne="yes">YES</button>'
      + '<button class="ne-key wide" data-ne="no">NO, FIX IT</button></div>'
    : '<p class="ne-ask-keys">JUMP or ENTER <b>yes</b>'
      + ' · ATTACK, INTERACT or ESC <b>no, fix it</b></p>'}
      </div>` : '';

    this.resultEl.innerHTML = `
      <div class="ar-box">
        <h2 class="ar-win p${w.index}">${w.name} WINS THE TOURNAMENT</h2>
        <div class="ar-stats">
          <!-- ROUNDS ARE COUNTED PER SIDE. Indexing wins by the PLAYER is the
               same number only in a duel: in a 2v2 the winner can be fighter 2
               or 3 and wins has two entries, so the box read "undefined rounds
               won" for half the champions. Same fix _commit already carries. -->
          <span><b>${this.wins[this.sideOf(w)] ?? 0}</b> rounds won</span>
          <span><b>${Math.round(w.dmgDealt)}</b> damage dealt</span>
          <span><b>${Math.round(w.dmgTaken)}</b> damage taken</span>
          <span><b>${Math.round(this.fightTime)}s</b> to do it</span>
        </div>
        <div class="ar-score">SCORE <b>${this.score}</b></div>
        ${this.entry.done ? `
          <p class="ar-sub">${this.rank >= 0
            ? `Signed in at number ${this.rank + 1}.`
            : 'Not quite a top-ten score — the board keeps the best ten.'}</p>`
        : `
          <div class="ne">
            <!-- NAMED, because the letters only answer to the winning side's
                 sticks (see _signingPads) and a screen that ignores three of
                 four players without saying so reads as three broken pads. -->
            <p class="ne-label">${escapeHtml(this.winners?.length > 1
    ? `${teamName(this.sideOf(w))} SIGNS THE BOARD` : `${w.name.toUpperCase()} SIGNS THE BOARD`)}
              ${this.entry.confirming ? ''
    : `— ${touch ? 'tap a letter, or tap a box to go back to it'
      : 'stick up/down picks a letter, left/right moves'}`}</p>
            <div class="ne-slots">${slots}</div>
            ${ask}
            ${keypad}
            ${this.entry.confirming ? '' : `<p class="ne-hint">${NAME_MAX} letters max · ${touch
    ? 'tap a letter, then OK' : "JUMP or ENTER when you're done"}</p>`}
          </div>`}
        <table class="lb">${rows}</table>
        ${this.entry.done ? flyHome : ''}
      </div>`;
  }
}

/** Names come from a player typing them, so they are escaped before HTML. */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
