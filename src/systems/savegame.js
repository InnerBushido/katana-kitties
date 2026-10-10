import { PLAYER_STYLE } from '../core/palette.js';
import { CLANS } from '../world/world.js';
import { MILESTONES } from './arenaquest.js';
import { cleanPayne } from './payne.js';
import { ORB_BY_ID, MAX_BAG, MAX_EQUIPPED, cleanHoloOrbs } from '../entities/powerorb.js';

/* ---------------------------------------------------------------------------
   SAVED GAMES — the afternoon, written down every half minute.

   THE SECOND THING IN THE PROJECT THAT OUTLIVES THE TAB, and the first one that
   is a STATE rather than a result. `leaderboard.js` opens with the argument
   that the record board is the only persistent thing here on purpose: the
   clan you swore to, the panda you fed forty canes, the stars you found are
   all gone when the tab closes, and that is right for a world you are meant to
   knock over and knock over again.

   IT IS STILL RIGHT, AND AN AFTERNOON IS LONGER THAN A TAB. A hundred and
   sixty props, a grown panda and seven dragon balls is four hours, and four
   hours is more than one sitting for a nine-year-old — a laptop that sleeps,
   a tab closed by a sister, a browser that updates itself. Nothing about the
   design wanted a save slot; the LENGTH of the thing that got built did.

   SO IT SAVES ITSELF AND NEVER ASKS. Asked for as "this state should be saved
   automatically, once every 30 seconds... The save should happen automatically
   and shouldn't start auto-saving until after the player has played for more
   than 5 minutes." Both halves matter. A game that asks a child to remember to
   save is a game she loses four hours of, and a game that writes a slot the
   moment she boots it fills all five with nothing and pushes the afternoon she
   cared about off the end of the list.

   FIVE SLOTS, OLDEST DROPPED. Also asked for. It is not a lot, and it is not
   meant to be: this is one world that keeps going, not a branching save tree,
   and five is enough to get back past whatever just went wrong.

   AND A GAME SOMEBODY ASKED TO KEEP IS NEVER "THE OLDEST". SAVE & QUIT GAME
   marks a game that is five minutes long or more as kept, and the cap goes
   round it rather than through it — `capFor` and `trimSaves` are the whole
   rule, in the words it was asked for in.

   WHAT IT DOES *NOT* SAVE IS THE POINT OF `restore`. It does not describe the
   world; it describes what the PLAYERS have done to it. The islands, the
   houses, the roads and the props all rebuild themselves identically from
   their own seeds on every boot — so a save is the list of which of them are
   lying on their sides, which orbs are gone, who swore where, and how far the
   tournament got. That is a couple of kilobytes rather than a couple of
   megabytes, and it cannot be wrong about the shape of a town it never
   described.

   AND IT REFUSES RATHER THAN GUESSES. `worldSig` pins a save to the world it
   was taken in; a build that changes how many props the town has renumbers
   every index in here, and the honest answer to that is a row you cannot load
   with a line saying why. Sixth non-negotiable: a refusal has to say so.

   @see src/systems/leaderboard.js — the same localStorage rules, per-browser
        and per-origin, and the same "validated on the way in, never trusted".
--------------------------------------------------------------------------- */

/** Where they live, and how the shape is versioned. Bumping `v` is how a
 *  format change throws the old ones away instead of misreading them.
 *
 *  V2 ADDED `session` AND THE FULL CAST. A v1 row has neither, which would
 *  read as "a game nobody ever played that is its own session" — five of those
 *  would be exactly the bug v2 exists to fix, so they go rather than being
 *  guessed at. */
const KEY = 'kk.saves.v1';
export const SAVE_VERSION = 2;

/**
 * How many are kept — and what ONE of them is.
 *
 * ONE SLOT PER PLAY SESSION, NOT PER SAVE. Reported: "it is currently saving
 * the last 30 secs of gameplay to a new save slot, overriding one of the 5
 * save slots. Instead, it should have 1 save slot for the current play session
 * and should override that save slot with the latest information for that
 * particular play session."
 *
 * That is the whole of it, and the first version had it backwards in a way
 * that made the feature useless within three minutes: five autosaves is two
 * and a half minutes, so by minute eight the list held five photographs of the
 * SAME afternoon, thirty seconds apart, and every other afternoon anybody had
 * ever played was gone. `Game.sessionId` is stamped into each snapshot and
 * `putSave` replaces the row carrying it, so an afternoon is one row that
 * keeps getting more recent and the list is five different afternoons.
 */
export const MAX_SAVES = 5;

/**
 * THE GAMES SOMEBODY ASKED TO KEEP, and the room left beside them.
 *
 * Asked for in these words. A game saved by SAVE & QUIT GAME once it is past
 * the five minutes is "marked as do not delete", so the cap takes another row
 * instead; "if there are more than 4 saved like this, then we will increase
 * the list to be 8 long maximum instead of 5"; past eight, "the one with the
 * minimum amount of play time will be deleted first"; there is always "room
 * for at least 1 new save file", with "a buffer of 2 more", "so a maximum of
 * 10 can be on the list (8 manually saved and 2 non-manually, auto-saved,
 * saves)"; and "if a manually saved game was the last one saved, even if it
 * has the minimum amount of play time, it should not be deleted."
 *
 * A KEPT ROW STAYS KEPT FOR THE REST OF ITS AFTERNOON. Loading a kept game and
 * playing on autosaves it every thirty seconds, and each of those writes is
 * the same session's row — `putSave` carries the mark across, or the first
 * autosave after a load would quietly un-keep the game somebody saved by hand.
 */
export const MAX_KEPT = 8;
export const SPARE_SLOTS = 2;
export const MAX_LIST = MAX_KEPT + SPARE_SLOTS;

/**
 * How long the list may be, given how many rows in it are kept.
 *
 *     kept 0–4   →  5    the old five; at four kept, one slot still turns over
 *     kept 5–6   →  8    "increase the list to be 8 long maximum"
 *     kept 7     →  9    so the buffer of two is still there
 *     kept 8     →  10   "8 manually saved and 2 non-manually"
 *
 * THE KEPT-7 ROW IS WHERE THE SENTENCES HAD TO BE RECONCILED. A flat eight
 * would leave one free slot at seven kept and none at eight — and "we need to
 * leave room for at least 1 new save file" is the sentence the rest of the
 * rule exists to protect. So from five kept up the list is the larger of
 * eight and the kept count plus the two spare, which honours all four numbers
 * as they were given.
 */
export function capFor(kept) {
  if (kept < MAX_SAVES) return MAX_SAVES;
  return Math.min(MAX_LIST, Math.max(MAX_KEPT, kept + SPARE_SLOTS));
}

/**
 * Seconds between automatic saves, and how long she has to have been playing
 * before the first one.
 *
 * FIVE MINUTES IS THE INTERESTING NUMBER. Thirty seconds is just "often
 * enough that losing the gap does not hurt"; the delay is what keeps the list
 * worth reading. Somebody who boots the game, looks at the town and closes the
 * tab has done nothing worth a slot, and five of those would push a real
 * afternoon off the end of a five-row list. The clock is PLAY time — it does
 * not run on the title screen and it does not run while the game is paused —
 * so five minutes means five minutes of a kitten actually moving about.
 */
export const AUTOSAVE_EVERY = 30;
export const AUTOSAVE_AFTER = 5 * 60;

/** A fingerprint of the world this save was taken in. See the header. */
/** Where the last build writes its shape, so the save list can be scored
 *  before this page has built a world of its own. */
export const WORLD_SHAPE_KEY = 'kk.worldshape.v1';

export function worldSig(world) {
  return `${world?.props?.length ?? 0}:${world?.mischiefTotal ?? 0}:`
    + `${world?.islands?.length ?? 0}:${world?.dragonBalls?.length ?? 0}`;
}

/* ------------------------------ storage -------------------------------- */

/**
 * Every save on this device, newest first. Never throws.
 *
 * VALIDATED ON THE WAY IN. Same rule as the record board and for the same
 * reason: this is a thing that survives a reload, so it is also a thing that
 * can be sitting there half-written from a tab that was closed mid-save, or
 * edited by a nine-year-old who found the dev tools.
 */
export function listSaves() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((r) => r && r.v === SAVE_VERSION && typeof r.id === 'string'
        && Number.isFinite(r.at) && Array.isArray(r.players))
      /* KEPT IS `true` OR IT IS NOT KEPT. A hand-edited `"yes"` is a string
         somebody typed, not a decision somebody made in the game. */
      .map((r) => (r.kept === true ? r : { ...r, kept: false }))
      .sort((a, b) => b.at - a.at)
      .slice(0, MAX_LIST);
  } catch {
    return [];
  }
}

function writeAll(rows) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(rows.slice(0, MAX_LIST)));
    return true;
  } catch {
    /* A FULL OR BLOCKED STORE IS NOT A CRASH. Private browsing throws on
       `setItem`, and an autosave that took the game down would be the feature
       doing considerably more harm than the problem it solves. */
    return false;
  }
}

/**
 * Put one away — over its OWN session's row if it has one, dropping the oldest
 * afternoon only when a genuinely new one arrives.
 *
 * THIS IS THE WHOLE OF THE ONE-SLOT-PER-SESSION RULE and it is four words of
 * code: filter out the row carrying this snapshot's `session`, then put this
 * one on the front. Everything else about the list follows from it — five rows
 * means five afternoons, the row for the game you are in the middle of is
 * always the freshest thing in the list, and nothing you played last week can
 * be pushed off the bottom by half an hour of playing today.
 *
 * A SNAPSHOT WITH NO SESSION STILL WORKS, and takes a slot of its own. That is
 * the degradation path rather than a mode: a caller that forgot to stamp one
 * gets the old behaviour instead of silently overwriting somebody else's
 * afternoon, which is the wrong failure to pick.
 *
 * @returns {boolean} whether it was actually written
 */
export function putSave(snap, { spare = null } = {}) {
  if (!snap) return false;
  const all = listSaves();
  const mine = snap.session ? all.find((r) => r.session === snap.session) : null;
  /* THE MARK TRAVELS WITH THE AFTERNOON — see `MAX_KEPT`. */
  const row = mine?.kept && !snap.kept ? { ...snap, kept: true } : snap;
  const rest = snap.session ? all.filter((r) => r.session !== snap.session) : all;
  return writeAll(trimSaves([row, ...rest], [row.id, spare]));
}

/**
 * Cut a list (newest first) down to what `capFor` allows. PURE — no storage —
 * so `world-check` can hand it any list it likes and read the answer.
 *
 * `spare` IS WHAT THIS CUT MAY NOT TAKE, whatever else is true of it: the row
 * that was just written ("if a manually saved game was the last one saved ...
 * it should not be deleted"), and during a load, the row being loaded — the
 * game being left is written down first, and that write must not push the
 * afternoon she just chose off the list out from under the load.
 *
 * KEPT ROWS GO ONLY PAST EIGHT, the least played first (and the older of two
 * equal ones). UNKEPT ROWS GO OLDEST FIRST, which is the rule the list always
 * had.
 *
 * IT CAN END ONE ROW OVER, IN ONE CASE, ON PURPOSE. Four kept, a fresh
 * autosave, and a second unkept row being spared for a load is six rows
 * against a cap of five with nothing it is allowed to take. Over by one until
 * the next write is the right failure; deleting a game somebody asked to keep
 * to make the number come out is the wrong one.
 */
export function trimSaves(rows, spare = []) {
  const safe = new Set(spare.filter(Boolean));
  let out = [...rows];
  const keptRows = () => out.filter((r) => r.kept);
  while (keptRows().length > MAX_KEPT) {
    const victim = keptRows().filter((r) => !safe.has(r.id))
      .sort((a, b) => (a.played ?? 0) - (b.played ?? 0) || a.at - b.at)[0];
    if (!victim) break;
    out = out.filter((r) => r !== victim);
  }
  const cap = capFor(keptRows().length);
  while (out.length > cap) {
    const victim = out.filter((r) => !r.kept && !safe.has(r.id))
      .sort((a, b) => a.at - b.at)[0];
    if (!victim) break;
    out = out.filter((r) => r !== victim);
  }
  return out;
}

/** How long the list on this device may be right now. */
export function saveCap(rows = listSaves()) {
  return capFor(rows.filter((r) => r.kept).length);
}

/**
 * SAVE & QUIT GAME's half of it: write this afternoon down NOW — if it is old
 * enough to be worth a row at all.
 *
 * UNDER FIVE MINUTES IT IS NOT WRITTEN, AND THAT IS A REVERSAL. It used to be
 * written-but-not-kept, on the reading that "if a player manually saves ... and
 * over the 5 minutes minimum play time, then that save will be marked as do not
 * delete" decides the MARK and not whether the button saves. Reported from play
 * against that reading, in these words: "When starting a new game and then doing
 * Save & Quit Game, it is saving the game, even if it is not 5 minutes of
 * gameplay. It should only save if they have more than 5 minutes of gameplay."
 *
 * AND THE OLD READING WAS WORSE THAN IT LOOKED. A short row is still a row: it
 * takes a slot, it shows up in the list under two kittens who have done nothing,
 * and it is the thing the five-minute rule exists to keep out — the autosave
 * refuses to write it, so a button that wrote it anyway was a second door into
 * the list with the opposite rule on it. Boot the game, look at the town, SAVE &
 * QUIT, four times, and the afternoon somebody cared about is off the bottom.
 *
 * THE REFUSAL IS A RETURN VALUE AND NOT A `null`, because the caller has to tell
 * the two apart: `null` is "this browser will not let the game store anything",
 * which must not close the window, and `short` is "there is nothing worth
 * writing yet", which may. Sixth non-negotiable — the caller says which.
 *
 * @returns {?{kept: boolean, id: ?string, short?: boolean}} null if nothing
 *   could be written; `short` when the game is younger than `AUTOSAVE_AFTER`
 *   and deliberately was not
 */
export function saveByHand(game) {
  if ((game.playT ?? 0) < AUTOSAVE_AFTER) {
    return { kept: false, id: null, short: true };
  }
  const snap = snapshot(game);
  if (!snap) return null;
  snap.kept = true;
  return putSave(snap) ? { kept: snap.kept, id: snap.id } : null;
}

export function dropSave(id) {
  return writeAll(listSaves().filter((r) => r.id !== id));
}

export function clearSaves() {
  try { window.localStorage.removeItem(KEY); return true; } catch { return false; }
}

/* ------------------------------ writing -------------------------------- */

const idOf = () => `s${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

/** A fresh play-session id. One per game started or loaded; see `MAX_SAVES`. */
export const newSessionId = () => `p${idOf().slice(1)}`;

/**
 * One kitten's afternoon, as facts.
 *
 * THE SAME SHAPE WHETHER SHE IS SITTING THERE OR WENT HOME, which is the point
 * of having it in one function. Reported: "every player in the play sessions
 * data should be saved in the save file, so that, even if a player drops out,
 * when they return with that player, they will return with all their data from
 * where they left off." A row written when she leaves and a row written by the
 * autosave have to be interchangeable, or a rejoining kitten gets back a
 * different subset of herself depending on when the save happened to land.
 *
 * `here` IS WHETHER SOMEBODY WAS HOLDING A CONTROLLER FOR HER at the moment
 * the save was taken. It is not whether she counts — see `meaningful`.
 */
export function castRow(p, here = true) {
  return {
    style: p.style?.name ?? PLAYER_STYLE[0].name,
    name: p.name ?? '',
    here,
    score: Math.round(p.score ?? 0),
    /* `dreamAnchor` FIRST: a kitten in the Dream Dojo's simulator is saved
       standing in her tube, never at her coordinates in the void. */
    at: ['x', 'y', 'z'].map((k) => +(p.dreamAnchor ?? p.position)[k].toFixed(2)),
    facing: +(p.facing ?? 0).toFixed(3),
    /* `dreamOath.was` FIRST, for the same reason as `dreamAnchor`: a trial
       oath in the Clan Trial Hall is the simulator's, and a save taken while
       she is trying Riverclaw on must remember the clan she really swore. */
    clan: (p.dreamOath ? p.dreamOath.was : p.clan)?.id ?? null,
    sworn: [...(p.clansSworn ?? [])],
    orbs: [...(p.powerOrbs ?? [])],
    /* HER BAG — the INVENTORY tab's sixteen. A row without it is a save from
       before the bag existed, and reads as an empty one. */
    bag: [...(p.orbBag ?? [])],
    cut: p.bambooCut ?? 0,
    fedFrom: p.pandaFedFrom ?? null,
    raised: !!p.raisedPanda,
    /* --- AND THE ANIMAL ITSELF, WHICH THOSE THREE NUMBERS COULD NOT REBUILD.
       This file used to argue, at length, that saving the panda was wrong —
       that `cut`, `fedFrom` and `raised` are the inputs `Game._updatePanda`
       grows one out of, so a restore should hand the game's own rule its
       numbers rather than reconstruct an animal from outside and get its tier
       subtly wrong. The argument was good and the code did not do it:
       `applyCast` never called `_updatePanda`, and `_updatePanda` is only ever
       reached by swearing the oath or by cutting a cane. So a load came back
       with no panda at all, and the badge said "20 more bamboo" under a kitten
       who had had a full-grown one for an hour. Reported in exactly those
       words.

       AND THE RULE COULD NOT BE TRUSTED TO GET IT RIGHT EVEN IF IT HAD RUN.
       When this was written it could not get it right at ALL: `tierFor` would
       only ever hand out a CUB to a kitten with no panda, so replaying it over
       a grown panda's numbers lost the animal outright. That half has since
       been overturned — banked canes now buy every rung they cover, so a
       reconstruction would usually come back with the adult. USUALLY is the
       word that keeps the tier a saved fact: a KNOCKED-DOWN panda is a cub
       whose owner has forty-odd lifetime canes behind her, so the rule would
       confidently stand it back up, which is precisely the state the shrine
       exists to be the only way out of. A rule that is right about the common
       case and wrong about the one that cannot be undone is worse here than no
       rule at all.

       SO THE TIER IS A FACT AND IT IS RECORDED. `down` with it, because a
       knocked-down panda is a cub that must STAY one until the shrine, and
       rebuilding it from the tally alone would quietly grow it back — the very
       case `_updatePanda`'s `knockedDown` guard exists to prevent. Bamboo never
       regrows (fourth non-negotiable), so an animal lost on a load is lost for
       the rest of that world.

       `at` IS WHERE IT WAS STANDING, for the same reason her own `at` is:
       a pet that reappears in the town square when the party is three islands
       away has been moved by the save rather than kept by it. */
    panda: p.panda ? {
      tier: p.panda.tier,
      down: !!p.panda.knockedDown,
      at: [p.panda.position.x, p.panda.position.y, p.panda.position.z]
        .map((n) => +n.toFixed(2)),
    } : null,
    /* HOW MANY PLAIN ORBS SHE IS CARRYING, WHICH NOTHING RECORDED. The world
       remembered which pedestals were empty and nobody remembered who had
       emptied them, so a load — or a kitten dropping out and back in — handed
       the orbs to nobody. That was invisible until a quest was decided by it:
       "Orb collector" is whoever has the most, and a count that silently goes
       to zero on a load is a prize handed to the wrong sister. */
    plain: p.orbs?.length ?? 0,
    /* Her quest ledger — see systems/feats.js. Copied, so a row taken now does
       not keep counting her Dojo seconds while it sits in the cast. */
    feats: p.feats ? {
      ...p.feats, got: [...p.feats.got], paid: [...p.feats.paid],
    } : null,
    /* Her history with Payne — met, hints on, the trick, rounds fought. See
       systems/payne.js. Copied for the same reason `feats` is. */
    payne: p.payne ? { ...p.payne } : null,
    /* Whether she has been round Lionheart's racks THIS GAME — see
       DreamDojo.interact. An old row has none and is a kitten who has not. */
    geared: !!p.dreamGeared,
    /* Shadow Lionheart's three levels, beaten THIS GAME — all three is his 凶
       Cross Slash. An old row has none and is a kitten who has beaten none. */
    shadow: { easy: !!p.shadowBeat?.easy, medium: !!p.shadowBeat?.medium, hard: !!p.shadowBeat?.hard, extra: !!p.shadowBeat?.extra },
    /* The orbs she EARNED in the simulator — her holo inventory, which
       persists across visits (dream/holokit.js). Never what she wears in
       there: that is a copy of `orbs`, made fresh on every way in. */
    holo: [...(p.holoOrbs ?? [])],
    /* And what the simulator puts back on her next time: the holo-clan she
       last swore in there, and what she last wore (dream/holokit.js). An old
       row has neither and is a kitten who has sworn and worn nothing. */
    holoClan: p.holoClan ?? null,
    holoWorn: [...(p.holoLastWorn ?? [])],
  };
}

/**
 * Did this kitten actually do anything, or did she just appear?
 *
 * THE TEST FOR WHETHER A DEPARTED KITTEN IS REMEMBERED. Asked for in these
 * words: "if a player joins the play session and has some points, kotodama, or
 * joined a clan (something meaningful was done by that player) and even if the
 * player leaves/drops out of the session, then they should be marked as being
 * in that session."
 *
 * A kitten who joined, ran three steps and dropped out again is NOT part of
 * the afternoon, and remembering her would put a fourth name on a save row
 * that a girl reading the list would not recognise — which is the one thing
 * the row exists to avoid. Somebody currently PLAYING is always counted
 * whatever this says: she is there, holding a controller.
 */
export function meaningful(row) {
  return !!(row && (row.score || row.orbs?.length || row.bag?.length || row.clan || row.sworn?.length
    || row.cut || row.raised || row.fedFrom != null || row.plain
    || row.feats?.got?.length || row.feats?.mischief || row.feats?.balls
    || row.payne?.sweep || row.payne?.rounds));
}

/**
 * Put a remembered row back onto a kitten who has just sat down.
 *
 * HER CLAN IS SET, NOT SWORN, for the reason `restore` gives at length: joining
 * one is a ceremony with a toast, a pose and a camera, and replaying it over a
 * girl who is simply picking her controller back up would announce a thing
 * that happened twenty minutes ago as news.
 *
 * WHERE SHE STANDS IS NOT IN HERE. A load places everybody; a REJOIN does not —
 * she comes back beside the party, at the join spot her sisters can see, rather
 * than being teleported to whatever hillside she was on when she put the
 * controller down.
 *
 * EXCEPT THE FIRST TIME SHE IS SEATED OUT OF A LOADED SAVE, and that is not
 * decided here either: see `fromSave` in `restore` and `Game._placeFromSave`.
 */
export function applyCast(game, p, row) {
  if (!p || !row) return false;
  p.score = row.score ?? 0;
  game.onScoreChanged?.(p);
  p.clan = CLANS.find((c) => c.id === row.clan) ?? null;
  p.clansSworn = new Set(
    (row.sworn ?? []).filter((id) => CLANS.some((c) => c.id === id))
  );
  if (p.clanRing) p.clanRing.material.color.set(p.clan?.color ?? p.style.colour);
  game._updateClanBadge?.(p);
  p.setPowerOrbs?.(row.orbs ?? []);
  /* THE BAG IS FILTERED AND CAPPED, the one thing on this row that is a list
     the game will index by slot: an id this build does not know would draw an
     empty-looking slot that JUMP calls empty, and a hand-edited thirty-orb bag
     would draw past the sixteen the tab has room for. */
  p.orbBag = (Array.isArray(row.bag) ? row.bag : [])
    .filter((id) => ORB_BY_ID[id]).slice(0, MAX_BAG);
  game.syncOrbMeshes?.(p);
  p.bambooCut = row.cut ?? 0;
  p.pandaFedFrom = row.fedFrom ?? null;
  p.raisedPanda = !!row.raised;
  /* HER PANDA, PUT BACK AS IT WAS — see `castRow`'s `panda` for why the tier
     is a recorded fact and not something re-derived from the tally. The game
     owns the building of it (`Game._recallPanda`), because a Panda needs the
     art, the scene and the ground height, none of which this file has. It is
     safe on the rejoin path as well as the load path: a kitten picking her
     controller back up finds the same animal, at the same size, and it is the
     one she left rather than a second one. */
  game._recallPanda?.(p, row.panda ?? null);
  /* HER PLAIN ORBS, BUT ONLY BEFORE THE AWAKENING — after it there are none
     anywhere, on anybody, and a row taken before 100% being loaded after it
     is not a thing that can happen (a load rebuilds the world from the save).
     Quiet: she is picking her controller back up, not finding them again. */
  if (!game.kotodama?.awakened && game._giveOrb) {
    for (const o of p.orbs ?? []) p.orbRoot?.remove(o.group);
    p.orbs = [];
    const n = Math.max(0, Math.min(20, Math.floor(row.plain ?? 0)));
    for (let k = 0; k < n; k++) game._giveOrb(p, { quiet: true });
  }
  game.feats?.applyRow(p, row.feats);
  /* An old row has no `payne` and comes back as a kitten who has not met her
     — which is true of every save taken before she existed. */
  p.payne = cleanPayne(row.payne);
  p.dreamGeared = !!row.geared;
  p.shadowBeat = { easy: !!row.shadow?.easy, medium: !!row.shadow?.medium, hard: !!row.shadow?.hard, extra: !!row.shadow?.extra };
  p.holoOrbs = cleanHoloOrbs(row.holo);
  p.holoClan = CLANS.some((c) => c.id === row.holoClan) ? row.holoClan : null;
  p.holoLastWorn = cleanHoloOrbs(row.holoWorn).slice(0, MAX_EQUIPPED);
  return true;
}

/**
 * Everything about this afternoon that the world will not rebuild by itself.
 *
 * BY NAME AND BY ID, NEVER BY INDEX INTO A TABLE THAT COULD BE REORDERED. A
 * kitten is her style's name, a clan is its id, an orb is its id. Prop and
 * pickup positions are indices — they have no names, and they are generated in
 * one deterministic order from one seed — which is exactly what `worldSig`
 * exists to protect.
 *
 * @param {object} game
 * @returns {?object} null if there is nothing worth saving yet
 */
export function snapshot(game) {
  const world = game?.world;
  if (!world || !game.players?.length) return null;

  /* --- EVERYBODY WHO PLAYED, NOT EVERYBODY IN A SEAT --------------------
     `game.sessionCast` is the kittens who did something and then put the
     controller down; the live players are written over the top of it, so
     somebody who left and came back is one row and it is the recent one.
     Asked for as "let's state how many players have logged in and played in
     that play session, versus just how many are currently logged in" — both
     numbers are in here, because `here` is per row. */
  const cast = new Map();
  for (const [style, row] of game.sessionCast ?? []) {
    if (meaningful(row)) cast.set(style, { ...row, here: false });
  }
  for (const p of game.players) cast.set(p.style?.name ?? '?', castRow(p, true));

  const knocked = [];
  const gone = [];
  const scored = [];
  world.props.forEach((p, i) => {
    if (p.gone) gone.push(i);
    else if (p.knocked) knocked.push(i);
    /* SCORED IS ITS OWN LIST AND NOT "KNOCKED OR GONE". It is what the
       MISCHIEF counter reads, and the two lists genuinely differ: the debug
       wreck marks every prop scored including the retired ones, and a prop
       knocked over by a falling neighbour is knocked without ever having been
       counted. Fourth non-negotiable — the counter has to be honest. */
    if (p.scored) scored.push(i);
  });

  return {
    v: SAVE_VERSION,
    id: idOf(),
    at: Date.now(),
    /** Seconds of actual play, which is what the list shows and what the
     *  five-minute gate is measured against. */
    played: Math.round(game.playT ?? 0),
    sig: worldSig(world),

    /** WHICH AFTERNOON THIS IS. `putSave` replaces the row carrying it, so
     *  one play session is one slot however long it runs. */
    session: game.sessionId ?? null,

    /* THE WHOLE CAST — see the merge above and `castRow` for the shape. Her
       orbs are in it because the list is partly for them ("each players
       kotodama orbs equipped etc."), and the panda is NOT: `cut`, `fedFrom`
       and `raised` are the inputs `Game._updatePanda` grows one out of on the
       next frame it is asked, so a restore hands the game's own rule its
       numbers rather than reconstructing an animal from the outside and
       getting its tier, its name or its mount state subtly wrong. */
    players: [...cast.values()],

    world: {
      knocked, gone, scored,
      /** Which Kotodama are still lying about, by index. */
      pickups: game.pickups?.map((k) => !!k.taken) ?? [],
      balls: game.balls?.map((b) => !!b.taken) ?? [],
      arena: !!world.arenaOpen,
      /* THE COINS ON SNAKE WAY THAT HAVE BEEN SPENT, by road name. Nothing
         regrows — fourth non-negotiable. */
      coins: world.coinsTaken?.() ?? [],
      /* THE POWERUP KOTODAMA LYING LOOSE IN THE WORLD, WHICH NOTHING RECORDED.
         They are not `game.pickups` — those are the six plain orbs — and they
         have no fixed index to name: `spawnPickups` seeds them at 100% and
         then they move: the dealer sells one, a steal knocks one onto the
         arena deck, and a kitten who does not want to carry hers any further
         can put the lot on the ground wherever she is standing. A load used to
         call `awaken()`, which re-seeds all of them at their opening spots, ON
         TOP OF handing every player her worn ones back: twenty-six orbs became
         thirty-four. Recorded as facts and put back exactly, so an orb left
         lying in the town is still lying in the town — at the same place — the
         next time that afternoon is loaded. */
      orbs: game.kotodama?.worldOrbs?.() ?? [],
    },

    quest: game.quest ? {
      stage: game.quest.stage,
      spent: [...game.quest.spent],
      rodeRyu: !!game.quest.rodeRyu,
    } : null,

    /* RYUUSEKI, WHO CANNOT BE SUMMONED TWICE.
       Reported with the panda, and it is the more serious half: "Ryuuseki was
       also spawned before, but after loading, is no longer in the game. He
       should stay spawned if already spawned and should be on the map where
       last left, or respawned at the torii gate where he originally spawns, in
       case he is lost floating in the world somewhere. This is important as
       Ryuuseki cannot be respawned."

       AND HE REALLY CANNOT. There are seven stars, they are taken once, and
       `restore` puts them back exactly as the save found them — so a save
       taken after the summon came back with `scenes.summon` spent, seven stars
       gone, and no dragon anywhere, with nothing in the game able to make
       another. Fourth non-negotiable, in the one place it had teeth.

       ONE FLAG AND A POINT. He has no state worth keeping beyond where he was
       floating: his riders are cleared by `restart`, and `restore` seats the
       kittens on the ground. */
    ryu: game.ryu ? {
      at: [game.ryu.position.x, game.ryu.position.y, game.ryu.position.z]
        .map((n) => +n.toFixed(2)),
    } : null,

    awakened: !!game.kotodama?.awakened,
    /** Who claimed the one-kitten quest, and whether the dragon-ball count is
     *  settled. Everything per kitten is in her row. */
    feats: game.feats?.save?.() ?? null,
    /** The Dream Dojo's stars, bests and flags, per kitten — THIS game's, so a
     *  new game starts the simulator from nothing (dream/progress.js). */
    dream: game.dream?.progress?.toSave?.() ?? null,
    /** Which story scenes have been spent. A restore that forgot these would
     *  play the dragon's arrival a second time over a world that already has
     *  him in it. */
    scenes: { ...(game.summonScene?.played ?? {}) },
    /* THE SKY IS A FACT ABOUT THE RUN. The ending's dawn is deliberately
       permanent within a run (see `SummonScene.start`), so a save taken after
       the ending has to come back under the morning it was taken in. */
    sky: {
      dusk: game.summonScene?.duskWant ?? 0,
      dawn: game.summonScene?.dawnWant ?? 0,
      /* Snake Way, which the ending builds and nothing takes down. */
      bridges: game.summonScene?.bridgeWant ?? 0,
    },
    ending: !!game._endingShown,
    /* SEPARATE FROM `ending`, because they answer different questions and a
       save that carried only the first one came back with WATCH THE ENDING
       AGAIN hidden for somebody who had watched it. `ending` is "this
       afternoon reached 100%" and gates the real trigger; this is "the scene
       has been played at somebody" and gates the menu row. See
       `Game._endingSeen`. */
    watched: !!game._endingWatched,
  };
}

/* ----------------------------- describing ------------------------------ */

const two = (n) => (n < 10 ? `0${n}` : `${n}`);

/**
 * The one line the load list shows, and it has to be enough to choose by.
 *
 * ASKED FOR EXACTLY THIS: "People should be able to find the save they want
 * based on some of the information shown in the save list (like how many
 * players, whether arena is unlocked, each players kotodama orbs equipped
 * etc.)" So the row carries the things that differ between two afternoons —
 * who was playing, how far the town got knocked down, whether the ring is open
 * — and NOT a slot number, which is the one thing about a save nobody can
 * recognise.
 */
export function describe(snap, world = null) {
  const when = new Date(snap.at);
  const mins = Math.floor((snap.played ?? 0) / 60);
  /* `world` IS THE WORLD, OR ITS SHAPE (`{ sig, mischiefTotal }`, the
     `WORLD_SHAPE_KEY` note the last build left behind) — the list is painted
     BEFORE the world is built now, because LOAD picks a save first and builds
     after. The shape is advisory: `Game._loadSave` asks the real world again
     once it exists, and refuses there. */
  const total = world?.mischiefTotal ?? 0;
  const sigNow = typeof world?.sig === 'string' ? world.sig : worldSig(world);
  const done = snap.world?.scored?.length ?? 0;
  return {
    id: snap.id,
    session: snap.session ?? null,
    /** Saved by hand and kept — see `MAX_KEPT`. The row says so, or a list
     *  that deletes some games and not others reads as random. */
    kept: !!snap.kept,
    when:`${when.getFullYear()}-${two(when.getMonth() + 1)}-${two(when.getDate())}`
      + ` ${two(when.getHours())}:${two(when.getMinutes())}`,
    /* HOURS AND MINUTES, because "247 minutes" is a number a nine-year-old has
       to do arithmetic on to recognise her own afternoon. */
    played: mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`,
    /* TWO NUMBERS, BECAUSE THEY ARE TWO QUESTIONS. Asked for as "let's state
       how many players have logged in and played in that play session, versus
       just how many are currently logged in": `party` is the afternoon's whole
       cast and `seated` is how many were holding controllers when the save
       landed. A girl looking for the game her cousin was in needs the first;
       a girl wondering why the row says four when she remembers two needs the
       second. */
    party: snap.players.length,
    seated: snap.players.filter((p) => p.here !== false).length,
    mischief: total ? Math.round((done / total) * 100) : null,
    arena: !!snap.world?.arena,
    balls: (snap.world?.balls ?? []).filter(Boolean).length,
    players: snap.players.map((p) => ({
      style: p.style,
      clan: p.clan ? (CLANS.find((c) => c.id === p.clan)?.name ?? p.clan) : null,
      orbs: p.orbs ?? [],
      score: p.score ?? 0,
      /** Was somebody holding her controller when this was taken? A kitten who
       *  had gone home is still in the row — that is the point — but she is
       *  marked, or the row reads as four people in the room. */
      here: p.here !== false,
    })),
    /** Whether this save can be loaded at all, and if not, why — in words,
     *  because a greyed-out row that will not say what is wrong with it is the
     *  sixth non-negotiable broken in the place it is easiest to break. */
    stale: world ? snap.sig !== sigNow : false,
  };
}

/* ------------------------------ reading -------------------------------- */

/**
 * Put an afternoon back.
 *
 * IT STARTS BY THROWING THE CURRENT ONE AWAY, THROUGH `Game.restart`. That is
 * the whole design: `restart` is already the one heavily-argued place that
 * knows how to put every subsystem back to its opening state — the leaders
 * un-met, the stars back on their islands, the dragon gone, the sky reset, the
 * seals and rings and marks all dropped — and it is the path `world-check`
 * already covers. A second "undo everything" written here would be that list
 * copied, and the copy would rot the first time a subsystem was added.
 *
 * SO A LOAD IS: RESET, THEN REPLAY THE FACTS. Everything below is an
 * assignment onto a world that is known to be brand new, which means nothing
 * in here has to know what it might be overwriting.
 *
 * IT RESTORES ONTO THE SEATS THAT ARE ACTUALLY BEING PLAYED, and that is a
 * decision rather than a limitation. A save of four kittens loaded into a
 * one-kitten session could seat three more — the game can do it — but three
 * kittens nobody is holding a controller for would stand in the town for the
 * rest of the afternoon, which is the fifth and sixth non-negotiables at once.
 *
 * WHOEVER IS NOT SEATED IS NOT LOST. Every unseated row goes into
 * `game.sessionCast`, so picking up a third controller — or swapping to that
 * cat in the character picker — hands her back exactly what she had. The
 * caller is told how many are waiting and says so out loud, because a load
 * that quietly seats two of four reads as a save that only kept two.
 *
 * @returns {{seated: number, waiting: number}}
 */
export function restore(game, snap) {
  game.restart();

  /* THE AFTERNOON'S OWN NAME COMES WITH IT. Carrying the loaded session's id
     rather than minting a fresh one is what makes carrying on from a save
     carry on IN that save's slot: play for another hour and it is still one
     row in the list, brought up to date, rather than a second afternoon
     sitting beside the one it continues. */
  game.sessionId = snap.session ?? newSessionId();

  /* --- the world, first: everybody's positions are on it ---------------- */
  const W = snap.world ?? {};
  const props = game.world.props;
  const down = new Set(W.knocked ?? []);
  const away = new Set(W.gone ?? []);
  const paid = new Set(W.scored ?? []);
  props.forEach((p, i) => {
    p.scored = paid.has(i);
    if (away.has(i)) { p._retire(); return; }
    if (!down.has(i)) return;
    /* THE SAME RECIPE THE DEBUG WRECK USES, and for the same reason: a town
       where every barrel is lying along one axis reads as a bug. A saved game
       does not record which way each one fell — that is 216 numbers for a
       detail nobody could name afterwards — so they are re-scattered, and the
       one thing that must be true (it is DOWN, it stays down, it is counted)
       is exactly what is recorded. */
    p.knocked = true;
    p.settleTimer = 9;
    p.vel.set(0, 0, 0);
    p.spin.set(0, 0, 0);
    const a = Math.random() * Math.PI * 2;
    const tip = 1.15 + Math.random() * 0.5;
    const away2 = 0.5 + Math.random() * 1.3;
    const x = p.home.x + Math.cos(a) * away2;
    const z = p.home.z + Math.sin(a) * away2;
    const g = game.world.heightAt(x, z);
    p.group.position.set(x, g ? g.y : p.home.y, z);
    p.group.rotation.set(
      Math.cos(a) * tip,
      p.group.rotation.y + (Math.random() - 0.5) * 0.8,
      Math.sin(a) * tip
    );
  });
  /* THE LOOSE POWERUP KOTODAMA, PUT BACK EXACTLY. This has to happen after
     `awaken()` below has run — it is what creates them at all — so it is
     deferred to `putOrbs`, called down there. Declared here beside the rest of
     the world for the same reason the props are: it is a fact about the town,
     not about anybody playing. */
  const putOrbs = () => game.kotodama?.setWorldOrbs?.(W.orbs ?? []);

  const mt = document.getElementById('mtotal');
  if (mt) mt.textContent = `${paid.size} / ${game.world.mischiefTotal}`;

  (W.pickups ?? []).forEach((taken, i) => {
    const pk = game.pickups?.[i];
    if (!pk || !taken || pk.taken) return;
    pk.taken = true;
    game.scene.remove(pk.group);
  });
  (W.balls ?? []).forEach((taken, i) => {
    const b = game.balls?.[i];
    if (!b || !taken) return;
    b.take?.();
    game.ballsHeld++;
  });
  game._updateBallHud?.();

  /* --- the tournament, which is what makes the eighth island exist ------ */
  if (snap.awakened && game.kotodama && !game.kotodama.awakened) {
    /* `awaken` IS A COUNT AND A RESEED AT ONCE, and only the second half is
       wanted here: it dissolves the plain orbs, seeds every Powerup Kotodama
       at its opening spot and raises the stall. The reseed is overwritten by
       `putOrbs` — which is the only reason calling it is safe, and the reason
       that line is not optional. Doing the reseed by hand instead would be a
       second copy of the rule that puts the stall in the market.

       IT HANDS NOTHING TO ANYBODY ANY MORE, which makes this safer than it
       was: the plain-orb prize used to be given here and then overwritten by
       her saved row a few lines down. Now the win is a quest in her ledger,
       and her ledger is restored like everything else. */
    game.kotodama.awaken();
  }
  if (snap.quest && game.quest) {
    game.quest.rodeRyu = !!snap.quest.rodeRyu;
    game.quest.stage = snap.quest.stage ?? 'waiting';
    game.quest.spent = new Set(
      (snap.quest.spent ?? []).filter((id) => MILESTONES.some((m) => m.id === id))
    );
  }
  if (W.arena) {
    game.world.openArena(true);
    if (game.satan) {
      game.satan.group.visible = true;
      game.satan.moveTo(game.satan.homeAt.x, game.satan.homeAt.y, game.satan.homeAt.z);
      game.satan.setLine('');
    }
  }

  /* --- the story, so nothing plays at her twice ------------------------- */
  if (game.summonScene) {
    game.summonScene.played = { ...game.summonScene.played, ...(snap.scenes ?? {}) };
    game.summonScene.duskWant = snap.sky?.dusk ?? 0;
    game.summonScene.dusk = game.summonScene.duskWant;
    game.summonScene.dawnWant = snap.sky?.dawn ?? 0;
    game.summonScene.dawn = game.summonScene.dawnWant;
    /* A SAVE FROM BEFORE SNAKE WAY EXISTED has no `bridges` and may still be
       from after the ending, which built them; the dawn says which. Loaded up
       whole, never grown — the growing belongs to the ending. */
    const roads = snap.sky?.bridges ?? (game.summonScene.dawnWant >= 1 ? 1 : 0);
    game.summonScene.bridgeWant = roads;
    game.summonScene.bridges = roads;
    game.summonScene.bridgeHold = false;
    game.world?.setBridges?.(roads);
    game.world?.setCoinsTaken?.(W.coins ?? []);
  }
  /* ...AND THE DRAGON, WHO IS PART OF THE STORY RATHER THAN OF THE WORLD.
     BEFORE the sky and the flags below only by accident of reading order; what
     matters is that it is after `restart()`, which is what took him out.
     `_spawnRyuuseki` puts him at the torii, and then the saved point moves him
     — but ONLY if there is ground under it. "In case he is lost floating in the
     world somewhere" was asked for in those words, and a y that came from a
     build with different terrain is exactly how that happens; the torii is the
     answer that is always framable. House rule: degrade, don't vanish. */
  if (snap.ryu && game._spawnRyuuseki) {
    const r = game._spawnRyuuseki();
    const at = snap.ryu.at;
    if (r && Array.isArray(at) && at.every(Number.isFinite)
      && game.world?.heightAt?.(at[0], at[2])) {
      r.position.set(at[0], at[1], at[2]);
      r.group.position.copy(r.position);
    }
    game._updateBallHud?.();
  }

  game._endingShown = !!snap.ending;
  /* A SAVE WRITTEN BEFORE `watched` EXISTED STILL ANSWERS THE QUESTION, out of
     the two facts that used to be ANDed to answer it — a finished game whose
     finale scene had run. Degrading rather than vanishing (house rule): the
     alternative is every save on the device losing the row. */
  game._endingWatched = snap.watched != null
    ? !!snap.watched
    : !!(snap.ending && snap.scenes?.finale);
  game._finaleDue = false;
  /* BEFORE THE KITTENS, because handing each her ledger rebuilds her tokens
     and asks this for nothing — but a load that set the claims after would
     leave a window where the Beam gunner quest looked unclaimed. */
  game.feats?.load(snap.feats);
  /* The simulator's ledger is the save's, and a save from before it was
     carried is an empty one rather than whatever this page had. */
  game.dream?.progress?.fromSave?.(snap.dream);

  /* --- and the kittens ------------------------------------------------- */
  /* --- BY KITTEN, AND ONLY BY KITTEN --------------------------------------
     A row belongs to a CAT, not to a seat. The first version fell back to "the
     first row nobody has claimed" when a seat's cat was not in the save, which
     handed Ember somebody else's afternoon — her score, her clan, her orbs,
     under the wrong name — and there is now no need for it: a row nobody is
     playing goes into the session's cast a few lines down, and the moment
     anybody picks up that cat, in the picker or on a new controller, she gets
     her own afternoon back intact. Waiting is better than mis-assigned. */
  const rows = [...(snap.players ?? [])];
  let seated = 0;
  for (const p of game.players) {
    const ix = rows.findIndex((r) => r.style === p.style?.name);
    if (ix < 0) continue;
    const row = rows.splice(ix, 1)[0];
    seated++;
    applyCast(game, p, row);
    /* A LOAD PLACES HER; A REJOIN DOES NOT. See `applyCast` — this is the
       half that is only ever right when the whole world is being put back. */
    if (Array.isArray(row.at) && row.at.every(Number.isFinite)) {
      p.position.set(row.at[0], row.at[1], row.at[2]);
      p.camTarget.copy(p.position);
    }
    p.facing = row.facing ?? 0;
    p.velocity.set(0, 0, 0);
  }
  /* ...AND EVERY KITTEN WHO DID NOT GET ONE IS REMEMBERED RATHER THAN LOST.
     Asked for as "even if a player drops out, when they return with that
     player, they will return with all their data from where they left off" —
     and a save loaded into a smaller party is the same situation arriving from
     the other direction. The rows that found no seat go into the session's
     cast, so the moment somebody picks up a fourth controller (or swaps to
     that cat in the picker) `Game._recallPlayer` hands her back her score, her
     clan, her oaths and her panda. Nothing is dropped; it is waiting. */
  /* `fromSave` ON THE ONES STILL WAITING FOR A SEAT. Every tier opens on one
     kitten now, so loading a two-kitten afternoon seats ONE — and her sister,
     picking up the second controller a minute later, was put at the join
     spot like any rejoin: "When a player spawns in from a saved game (if they
     were already playing) they should spawn into their previously saved
     position". A kitten sitting down out of the save IS being loaded, late;
     it is a girl who put her controller down mid-afternoon who comes back to
     the party. So the row carries the difference, `Game._placeFromSave`
     spends it once, at the picker's confirm, and every row written after
     that (a drop-out, a swap) is written without it. */
  const waiting = new Set(rows.map((r) => r.style));
  game.sessionCast = new Map();
  for (const r of snap.players ?? []) {
    if (r?.style) game.sessionCast.set(r.style, { ...r, here: false, fromSave: waiting.has(r.style) });
  }

  putOrbs();
  game._reseedRigs?.();
  game.playT = snap.played ?? 0;

  /* `waiting` RATHER THAN `dropped`, and the word matters because the caller
     says it out loud: nothing was thrown away, those kittens are in the cast
     and come back the moment somebody plays them. */
  return { seated, waiting: rows.length };
}
