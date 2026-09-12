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
 *  format change throws the old ones away instead of misreading them. */
const KEY = 'kk.saves.v1';
export const SAVE_VERSION = 1;

/** How many are kept. Asked for: "a maximum of only 5 saves in the save list." */
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
 * Put one away, dropping the oldest if there are already five.
 *
 * @returns {boolean} whether it was actually written
 */
export function putSave(snap) {
  if (!snap) return false;
  const rows = [snap, ...listSaves()].slice(0, MAX_SAVES);
  return writeAll(rows);
}

export function dropSave(id) {
  return writeAll(listSaves().filter((r) => r.id !== id));
}

export function clearSaves() {
  try { window.localStorage.removeItem(KEY); return true; } catch { return false; }
}

/* ------------------------------ writing -------------------------------- */

const idOf = () => `s${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

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

    players: game.players.map((p) => ({
      style: p.style?.name ?? PLAYER_STYLE[0].name,
      name: p.name ?? '',
      score: Math.round(p.score ?? 0),
      at: [p.position.x, p.position.y, p.position.z].map((n) => +n.toFixed(2)),
      facing: +(p.facing ?? 0).toFixed(3),
      clan: p.clan?.id ?? null,
      sworn: [...(p.clansSworn ?? [])],
      /* HER ORBS ARE THE THING THE LIST IS FOR. "People should be able to find
         the save they want based on some of the information shown in the save
         list... each players kotodama orbs equipped etc." */
      orbs: [...(p.powerOrbs ?? [])],
      /* THE PANDA IS NOT SAVED, THE FEEDING IS. `Game._updatePanda` grows one
         out of these two numbers on the next frame it is asked — so a restore
         hands the game's own rule the inputs and lets it build the animal,
         rather than trying to reconstruct an entity from the outside and
         getting its tier, its name or its mount state subtly wrong. */
      cut: p.bambooCut ?? 0,
      fedFrom: p.pandaFedFrom ?? null,
      raised: !!p.raisedPanda,
    })),

    world: {
      knocked, gone, scored,
      /** Which Kotodama are still lying about, by index. */
      pickups: game.pickups?.map((k) => !!k.taken) ?? [],
      balls: game.balls?.map((b) => !!b.taken) ?? [],
      arena: !!world.arenaOpen,
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
    party: snap.players.length,
    mischief: total ? Math.round((done / total) * 100) : null,
    arena: !!snap.world?.arena,
    balls: (snap.world?.balls ?? []).filter(Boolean).length,
    players: snap.players.map((p) => ({
      style: p.style,
      clan: p.clan ? (CLANS.find((c) => c.id === p.clan)?.name ?? p.clan) : null,
      orbs: p.orbs ?? [],
      score: p.score ?? 0,
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
 * Matched BY STYLE first so a girl playing Blossom gets Blossom's orbs back,
 * then by seat for whoever is left. The caller is told how many were dropped
 * and says so out loud.
 *
 * @returns {{seated: number, dropped: number}}
 */
export function restore(game, snap) {
  game.restart();

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
  const rows = [...(snap.players ?? [])];
  let seated = 0;
  for (const p of game.players) {
    /* HER OWN KITTEN'S ROW IF THERE IS ONE. Two girls who swapped seats
       between sessions still each get their own orbs back, because what a save
       is about is the KITTEN and not the socket the controller is in. */
    let ix = rows.findIndex((r) => r.style === p.style?.name);
    if (ix < 0) ix = 0;
    const row = rows.splice(ix, 1)[0];
    if (!row) break;
    seated++;
    p.score = row.score ?? 0;
    game.onScoreChanged?.(p);
    if (Array.isArray(row.at) && row.at.every(Number.isFinite)) {
      p.position.set(row.at[0], row.at[1], row.at[2]);
      p.camTarget.copy(p.position);
    }
    p.facing = row.facing ?? 0;
    p.velocity.set(0, 0, 0);
    p.clan = CLANS.find((c) => c.id === row.clan) ?? null;
    p.clansSworn = new Set(
      (row.sworn ?? []).filter((id) => CLANS.some((c) => c.id === id))
    );
    /* HER CLAN IS SET, NOT SWORN. `Game.onJoinClan` is a CEREMONY — a toast, a
       pose, a camera, a first-time celebration — and replaying four of them
       over a world that has just been rebuilt would be the load announcing
       itself four times as something that just happened. What swearing leaves
       BEHIND is the field, the ring colour and the badge, and those are set
       here directly. The ring's visibility is derived from `clan` every frame
       by `Player`, so it comes back on its own. */
    p.clanRing.material.color.set(p.clan?.color ?? p.style.colour);
    game._updateClanBadge?.(p);
    p.setPowerOrbs(row.orbs ?? []);
    game.syncOrbMeshes?.(p);
    p.bambooCut = row.cut ?? 0;
    p.pandaFedFrom = row.fedFrom ?? null;
    p.raisedPanda = !!row.raised;
  }
  game._reseedRigs?.();
  game.playT = snap.played ?? 0;

  return { seated, dropped: rows.length };
}
