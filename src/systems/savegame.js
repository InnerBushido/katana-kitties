import { PLAYER_STYLE } from '../core/palette.js';
import { CLANS } from '../world/world.js';
import { MILESTONES } from './arenaquest.js';

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
      .sort((a, b) => b.at - a.at)
      .slice(0, MAX_SAVES);
  } catch {
    return [];
  }
}

function writeAll(rows) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(rows.slice(0, MAX_SAVES)));
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
export function putSave(snap) {
  if (!snap) return false;
  const rest = snap.session
    ? listSaves().filter((r) => r.session !== snap.session)
    : listSaves();
  return writeAll([snap, ...rest].slice(0, MAX_SAVES));
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
    at: [p.position.x, p.position.y, p.position.z].map((n) => +n.toFixed(2)),
    facing: +(p.facing ?? 0).toFixed(3),
    clan: p.clan?.id ?? null,
    sworn: [...(p.clansSworn ?? [])],
    orbs: [...(p.powerOrbs ?? [])],
    cut: p.bambooCut ?? 0,
    fedFrom: p.pandaFedFrom ?? null,
    raised: !!p.raisedPanda,
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
  return !!(row && (row.score || row.orbs?.length || row.clan || row.sworn?.length
    || row.cut || row.raised || row.fedFrom != null));
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
  game.syncOrbMeshes?.(p);
  p.bambooCut = row.cut ?? 0;
  p.pandaFedFrom = row.fedFrom ?? null;
  p.raisedPanda = !!row.raised;
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

    awakened: !!game.kotodama?.awakened,
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
    },
    ending: !!game._endingShown,
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
  const total = world?.mischiefTotal ?? 0;
  const done = snap.world?.scored?.length ?? 0;
  return {
    id: snap.id,
    when: `${when.getFullYear()}-${two(when.getMonth() + 1)}-${two(when.getDate())}`
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
    stale: world ? snap.sig !== worldSig(world) : false,
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
    /* `awaken` IS A CEREMONY AND A RESEED AT ONCE, and only the second half is
       wanted here: it dissolves the plain orbs, hands a random prize to
       whoever had collected the most, seeds every Powerup Kotodama at its
       opening spot and raises the stall. The prize is overwritten by her own
       row below and the reseed is overwritten by `putOrbs` — which is the only
       reason calling it is safe, and the reason those two lines are not
       optional. Doing the reseed by hand instead would be a second copy of the
       rule that puts the stall in the market. */
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
  }
  game._endingShown = !!snap.ending;
  game._finaleDue = false;

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
  game.sessionCast = new Map();
  for (const r of snap.players ?? []) {
    if (r?.style) game.sessionCast.set(r.style, { ...r, here: false });
  }

  putOrbs();
  game._reseedRigs?.();
  game.playT = snap.played ?? 0;

  /* `waiting` RATHER THAN `dropped`, and the word matters because the caller
     says it out loud: nothing was thrown away, those kittens are in the cast
     and come back the moment somebody plays them. */
  return { seated, waiting: rows.length };
}
