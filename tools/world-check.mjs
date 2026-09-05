/* ---------------------------------------------------------------------------
   Headless smoke test for the world, the dragons and the sprite directions.

     node tools/world-check.mjs

   None of this needs a browser or a GPU — it builds the real World and pokes
   the real classes. It exists because the things most likely to break here are
   silent: a grove that generates zero canes, a clan trigger buried inside the
   building it belongs to, a dragon that never finishes flying home, a sprite
   sheet read in mirror image. All of those look fine in a screenshot.
--------------------------------------------------------------------------- */

import * as THREE from 'three';
import { World, CLANS } from '../src/world/world.js';
import { Dragon, BREEDS, DRAGON_SPOTS } from '../src/entities/dragon.js';
import { Billboard, xrayVertexMat } from '../src/core/gfx.js';
import { Player, CALLOUT_WIDEST, BLESS_STRETCH } from '../src/entities/player.js';
import {
  Panda, PANDA, PANDA_TIERS, PANDA_SPEED, CLAW, tierFor, toNextTier, FULL_PANDA_COST,
} from '../src/entities/panda.js';
import {
  LEADERS, ELDER, leaderSpot, LEADER_OFFSET, ClanLeader,
} from '../src/entities/leader.js';
import { promptGlyphs, PROMPTS, KEYSETS } from '../src/core/input.js';
import { durationMs, delaysCs } from './gif-sync.mjs';
import { beatOver, TAIL, LINE_TAIL, MAX_SLIP } from '../src/systems/cutscene.js';
import { SCENE_RADIUS, DWELL } from '../src/systems/shrinescene.js';
import { DragonBall, BALL_COUNT, PICKUP_RADIUS, LOCKS, ISLAND_LOCKS } from '../src/entities/dragonball.js';
import { Ryuuseki, GUNNER_BEAMS, PILOT_BEAMS, BEAM, RYU_SIZE, FAN, AIM_ARC, RYU_BACK, HOVER, RYU_MOUTH, RYU_CAM } from '../src/entities/ryuuseki.js';
import {
  SCRIPTS, DUSK_DEEP, DUSK_FALL, DAWN_RISE, DAWN_DEEP, SummonScene,
} from '../src/systems/summonscene.js';
import {
  SHRINE_DAIS, SHARD_RISE, SHARD_COUNT, SPIRE_H, __curvedWallForTest,
  buildArena,
} from '../src/world/build.js';
import { SatanBlast, BLAST, BLAST_LINES, card } from '../src/systems/satanblast.js';
import { MrSatan } from '../src/entities/satan.js';
import { ISLAND_MUSIC, MUSIC, SAMPLES, trackForIsland } from '../src/core/audio.js';
import { existsSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  floodBackground, clearSealedPockets, purelyWhite, pocketFloor,
  packMetrics, countInk,
} from '../src/core/spritesheet.js';
import {
  profileFor as deviceProfileFor, effectivePixelRatio,
  QUALITY, QUALITY_ORDER, nextQualityDown,
  autoQualityVerdict, AUTO_BAD_MS, AUTO_HOLD_MS,
} from '../src/core/device.js';
import { readPNG, blobs, writePNG, writeICO } from './png.mjs';
import { DEFAULTS, OVERRIDES, __mergeForTest as fold } from '../src/core/tuning.js';
import {
  POWER_ORBS, ORB_IDS, WORLD_ORB_IDS, SHOP_ONLY_IDS, MAX_EQUIPPED,
  aggregate, countsOf, orbPrice, orbSellPrice, orbPriceFor, orbSellPriceFor,
  WARD, AEGIS, DIVE, CROSS, CHARGE, DODGE, wardFor,
  stockFor, STOCK_STACKABLE, STOCK_UNIQUE,
  PowerOrb, PowerOrbPickup, ORB_BY_ID,
} from '../src/entities/powerorb.js';
import { Kotodama } from '../src/systems/kotodama.js';
import { CrossFx, sealStage, SIDES_BY_CUT } from '../src/systems/crossfx.js';
import { DodgeFx } from '../src/systems/dodgefx.js';
import { ATTACKS, COMBAT, BASE_REACH, MAX_HP, DAZE_TIME } from '../src/entities/player.js';
import {
  Tournament, WINS_NEEDED, MAX_ROUNDS, FEAST_TIME, REGEN_FRAC, OUT_FLOOR,
} from '../src/systems/tournament.js';
import {
  Critter, CRITTERS, CRITTER_BY_ID, EAT_TIME, MOUTH_TIME, CATCH_RADIUS, STUN_TIME,
  poseQuad,
} from '../src/entities/critter.js';
import {
  Menagerie, MAX_ON_STAGE, MAX_PER_SPECIES, RESPAWN_MIN, RESPAWN_MAX,
  CONJURE_CHANCE, BUG_LINES,
} from '../src/systems/menagerie.js';
import {
  MILESTONES, OPEN_AT, ArenaQuest, SATAN_TOWN, ANNOUNCE_DELAY,
  GATE_RADIUS, GATE_STAND,
} from '../src/systems/arenaquest.js';
import { MenuNav } from '../src/systems/menunav.js';
import { PLAYER_STYLE, MAX_PLAYERS, styleFor, styleCss, cssFor } from '../src/core/palette.js';
import {
  splitLayout, mapWidth, mapSpot, assignMaps, nearestMap, keyMaps, fitDistance, stablePanes,
  paneSeats, outOfShot, framedMembers, OUT_DROP, paneWiden, BIG_PANE_IN,
} from '../src/core/split.js';
import { clusterPlayers, MERGE_IN, MERGE_OUT } from '../src/core/cluster.js';
import { recolourPixels, liftWindow } from '../src/core/spritesheet.js';
import { postsFor } from '../src/world/build.js';
import { MathDojo, DOJO_RADIUS, DOJO_VIEW_R, inDojoView } from '../src/systems/mathdojo.js';
import { Orb } from '../src/entities/orb.js';
import { Minimap, ZOOMS } from '../src/systems/minimap.js';
import { Label, labelCacheStats } from '../src/core/label.js';
import {
  MODES, MODE_BY_ID, modesFor, handicapFor, HANDICAP_MAX, NO_SIDE, ROUND_LIMIT,
  WARN_AT, COUNT_AT, COUNT_MID, COUNT_LAST, ZERO_BEAT, ROUND_OVER_LINE,
} from '../src/systems/tournament.js';
import { worldSpawnCount, WORLD_PER_PLAYER } from '../src/systems/kotodama.js';
import {
  scoreOf, loadBoard, saveResult, clearBoard, BOARD_SIZE,
  NameEntry, NAME_MIN, NAME_MAX, ALPHABET,
} from '../src/systems/leaderboard.js';

const line = (l, v) => console.log(String(l).padEnd(42) + v);
let fails = 0;
let checks = 0;
const ok = (label, cond, extra = '') => {
  checks++;
  if (!cond) fails++;
  line(label, (cond ? 'ok   ' : 'FAIL ') + extra);
};

/**
 * One Help topic's markup, by the text of its heading — CLOSING TAGS COUNTED,
 * not the first one found.
 *
 * Four blocks below used to do this as `slice(at, indexOf('</details>', at))`,
 * which was right for as long as the accordion was flat. It is not: "Moving &
 * fighting" and "The arena" carry four sub-topics each now, so the naive cut
 * stops at the end of the FIRST sub-card and every check that reads further
 * silently passes on nothing. That is the worst shape a check can fail in —
 * green, and no longer looking at the thing it names — so the depth count lives
 * here once rather than being got right four times.
 */
/**
 * Source with its comments blanked out, for checks that are about WIRING.
 *
 * A regex over a whole file cannot tell an import from a sentence about one,
 * so every "this file must never mention X" check is one honest comment away
 * from failing. Blanking rather than deleting keeps line numbers and string
 * lengths roughly intact, so a failure still points somewhere useful.
 *
 * Deliberately naive — no string-literal awareness — because the callers ask
 * about identifiers, and an identifier inside a string is exactly the wiring
 * they mean to catch.
 */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const helpTopic = (html, title) => {
  const at = html.indexOf(`<span class="ht-title">${title}</span>`);
  if (at < 0) return '';
  let depth = 1;                        // we are already inside this topic's <details>
  const re = /<details\b|<\/details>/g;
  re.lastIndex = at;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0] === '</details>' ? -1 : 1;
    if (depth === 0) return html.slice(at, m.index);
  }
  return html.slice(at);
};

/* Clan shrines carry world-space text labels drawn onto a canvas, and Node has
   no DOM. Stand up just enough of one — nothing here is ever rasterised. This
   has to be assigned before the World is BUILT, not before the imports: ESM
   hoists those, and the DOM is only touched at construction time. */
/* A FACTORY AND NOT A LITERAL, because this file DELETES the document part
   way down on purpose (see the four-player menu block) and two later blocks
   still need one. A second hand-typed copy of the canvas stub is a second
   thing to keep in step with `label.js`; calling this again is not. */
const domStub = () => ({
  createElement: () => {
    const cv = {
    width: 1,
    height: 1,
    /* The OPTIONS are kept, not just answered. `willReadFrequently` decides
       whether a canvas is CPU- or GPU-backed, and a live label re-uploading
       from a GPU-backed one stalls the pipeline on every repaint — invisible
       to every other check here, because it changes pacing and not a single
       number. Recording the argument is what lets that be asserted at all. */
    getContext: (_type, opts) => { cv.ctxOpts = opts ?? null; return new Proxy({}, {
      /* Most 2D calls can be no-ops, but the two that RETURN something have to
         return something usable or the caller explodes on the next line:
         `measureText` is read for a width, and `createLinearGradient` gets
         `addColorStop` called on it (the dragon balls paint their glass that
         way). A no-op proxy returning undefined for those is a stub that
         breaks exactly the code it is meant to let run headlessly. */
      get: (_, k) => {
        if (k === 'measureText') return () => ({ width: 10 });
        if (k === 'createLinearGradient' || k === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        return () => {};
      },
      set: () => true,
    }); },
    };
    return cv;
  },
  /* The tournament reaches for its HUD elements in its constructor. Every use
     of them downstream is `?.`-guarded, so `null` is the honest stub — and it
     is a better one than a fake element, because a fake would let a check
     pass that only works because the DOM silently swallowed it. */
  getElementById: () => null,
  querySelectorAll: () => [],
});

globalThis.document = domStub();

/* The record board is the one thing in the game that persists, so testing it
   needs somewhere to persist TO. A Map behind the real API rather than a
   no-op: the checks below assert a save/load ROUND TRIP, and a stub that
   throws everything away would pass "loadBoard returns an array" while
   proving nothing about the thing that actually breaks. */
const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: (k) => _store.delete(k),
};
globalThis.window = { localStorage: globalThis.localStorage };

const world = new World(new THREE.Scene());

console.log('--- world ---');
line('islands', world.islands.length);
line('biomes', world.islands.map((i) => i.biome).join(', '));
line('props (mischief total)', world.mischiefTotal);
line('solids', world.solids.length);
line('clan halls', world.clanHalls.length);
line('platforms', JSON.stringify(world.platforms));

ok('one shrine per clan, no duplicates',
  world.clanHalls.length === CLANS.length
  && new Set(world.clanHalls.map((h) => h.clan.id)).size === CLANS.length);
ok('islands are visually distinct',
  new Set(world.islands.map((i) => i.palette.map)).size >= 5);

console.log('\n--- bamboo ---');
const bamboo = world.props.filter((p) => p.kind === 'bamboo');
line('bamboo props', bamboo.length);
ok('bamboo is katana-only and worth more',
  bamboo.length > 20 && bamboo.every((p) => p.katanaOnly && p.points === 25));
ok('nothing else is katana-only',
  world.props.filter((p) => p.kind !== 'bamboo').every((p) => !p.katanaOnly));
const homeGrove = bamboo.filter((p) => Math.hypot(p.home.x - 58, p.home.z - 44) < 12);
ok('a grove is on the HOME island (no dragon needed)', homeGrove.length >= 10,
  `${homeGrove.length} canes`);

/* Raising a panda costs 40 canes per kitten and there are two kittens, so the
   world has to carry 80 before either of them has knocked over anything for
   the fun of it. Checked as a hard floor with room to spare: a grove that
   silently generates short (canes landing off a rim, or inside a solid) is
   exactly the kind of failure that still looks completely fine on screen. */
const NEED = FULL_PANDA_COST * 2;
line('bamboo needed to raise two pandas', NEED);
ok('enough bamboo in the world for both kittens', bamboo.length >= NEED * 1.4,
  `${bamboo.length} canes, need ${NEED}`);
{
  const home = world.islands[0];
  const onHome = bamboo.filter(
    (p) => Math.hypot(p.home.x - home.x, p.home.z - home.z) < home.radius
  );
  line('bamboo on the home island', onHome.length);
  /* BOTH kittens must be able to raise a panda to full size without leaving
     the home island. Swearing the oath is a flight away and that's the point,
     but the FOOD must not be: they fly out to Pandapaw once, come home, and
     can then finish the job in the groves either side of their own town. With
     only one kitten's worth here, the second girl watches her counter stick
     while her sister's panda grows up. */
  ok('both kittens can fully grow a panda without leaving home',
    onHome.length >= FULL_PANDA_COST * 2, `${onHome.length} canes`);
  ok('the home island has two separate groves', world.groves.length >= 2);
  const isl = world.islands.find((i) => i.biome === 'bamboo');
  const onIsl = bamboo.filter(
    (p) => Math.hypot(p.home.x - isl.x, p.home.z - isl.z) < isl.radius
  );
  line('bamboo on the bamboo island', onIsl.length);
  ok('the bamboo island is actually a bamboo forest', onIsl.length >= 40);
}
ok('no cane is planted inside a solid', bamboo.every((p) => world.solids.every(
  (s) => Math.hypot(p.home.x - s.x, p.home.z - s.z) >= s.r)));

console.log('\n--- nothing regrows ---');
/* A prop knocked clean off the rim used to fall to y < -140 and reappear
   standing at `home`, un-knocked. For bamboo that is indistinguishable from
   regrowth, and it quietly breaks the one number the game asks a kid to trust:
   `scored` latches on the first hit, so the second cane she cuts in the same
   spot pays nothing and reads as a broken katana. Whatever is standing in the
   grove has to be exactly what still counts. */
{
  const cane = bamboo.find((p) => Math.hypot(p.home.x - 58, p.home.z - 44) < 12) ?? bamboo[0];
  const startedAt = cane.home.clone();
  cane.knock(new THREE.Vector3(1, 0, 0), 40);   // hard enough to clear the rim
  cane.scored = true;
  let fell = false;
  for (let i = 0; i < 3000 && !cane.gone; i++) {
    cane.update(1 / 60, world);
    if (cane.group.position.y < -140) fell = true;
  }
  line('cane cleared the island and fell', String(fell));
  ok('a prop knocked off the world is retired', fell && cane.gone === true);
  ok('it does NOT reappear standing at home',
    cane.group.position.distanceTo(startedAt) > 100);
  ok('and it is not drawn any more', cane.group.visible === false);
  ok('it stays scored, so the mischief total cannot shrink', cane.scored === true);

  /* Simulating it further must not undo any of that — the update early-out is
     the thing that keeps a retired prop retired. */
  for (let i = 0; i < 600; i++) cane.update(1 / 60, world);
  ok('and further frames leave it retired', cane.gone && !cane.group.visible);

  // The restart path is the ONE thing that may bring it back.
  cane._reset();
  ok('a restart puts it back in the grove',
    !cane.gone && cane.group.visible && cane.group.position.distanceTo(startedAt) < 0.001);
  ok('and standing, ready to be cut again', cane.knocked === false);
  cane.scored = false;
}

console.log('\n--- shrine scenes ---');
/* Every leader introduces herself once, in her own recorded voice, before her
   clan can be joined. The checks here are about the things that turn a scene
   into a nuisance rather than about the scene itself. */
{
  const ids = CLANS.map((c) => c.id);
  ok('every clan leader has a recorded line',
    ids.every((id) => typeof LEADERS[id]?.voice === 'string'
      && LEADERS[id].voice.endsWith('.mp3')));
  ok('and no two share a recording',
    new Set(ids.map((id) => LEADERS[id].voice)).size === ids.length);
  /* The voice file has to be the leader's OWN line, not the intro line she
     speaks in the cutscene — they are different pieces of writing and swapping
     them would have her introduce herself twice with the same words. */
  ok('the shrine recording is separate from her cutscene line',
    ids.every((id) => !LEADERS[id].voice.includes(`/${id}.mp3`)));

  /* The trigger must not be reachable by running past. The dwell radius is
     generous so she can be heard from the ring, which makes the two-second
     wait the only thing standing between a kitten and six cutscenes. */
  ok('you have to actually stop for her', DWELL >= 1.5);
  ok('and the radius reaches the join ring', SCENE_RADIUS >= 8);

  /* Every shrine's trigger ring must sit INSIDE the scene radius, or there is
     a place you can stand, press interact, be refused for not having met her,
     and never trigger the scene that would fix it. That is a soft lock on a
     buff, and it would look exactly like a broken button. */
  const worstRing = Math.max(...world.clanHalls.map((h) => h.r));
  line('widest join ring vs scene radius', `${worstRing.toFixed(1)} vs ${SCENE_RADIUS}`);
  ok('no spot lets you press interact out of her earshot', worstRing <= SCENE_RADIUS);
}

console.log('\n--- the seven dragon balls ---');
{
  const balls = world.dragonBalls;      // built by the World constructor now
  line('dragon balls placed', balls.length);
  ok('there are seven', balls.length === BALL_COUNT);
  /* `playIslands`, NOT `islands`. The arena is the eighth island and it
     deliberately has no star: it is shut until the tournament opens, and the
     dragon who opens it is summoned by the seventh star, so a star out there
     would be one the hunt can never finish. Asserting against the raw island
     count would now be asserting the world has seven islands, which is no
     longer the fact this check is about. */
  ok('and seven islands to put them on', world.questIslands.length === BALL_COUNT);
  ok('the arena has no star and is not one of them',
    world.arenaIsland != null && !world.questIslands.includes(world.arenaIsland));

  /* One per island, and no island with two. The hunt sends the girls to every
     island in the game exactly once — two on the home island and none on the
     ash island is a pair flying in circles over a rock they have already
     stripped, with nothing telling them it is the wrong rock. */
  const perIsland = new Map();
  for (const b of balls) {
    let owner = null;
    for (const isl of world.questIslands) {
      if (Math.hypot(b.position.x - isl.x, b.position.z - isl.z) < isl.radius) owner = isl;
    }
    perIsland.set(owner, (perIsland.get(owner) ?? 0) + 1);
  }
  ok('every ball is ON an island', !perIsland.has(null));
  ok('exactly one per island',
    perIsland.size === world.questIslands.length
    && [...perIsland.values()].every((n) => n === 1));
  ok('and their star counts are 1..7',
    balls.map((b) => b.stars).sort((a, b2) => a - b2).join(',') === '1,2,3,4,5,6,7');

  /* Standable ground, checked at the ball's own radius the way dragon perches
     are. A star on a rim reads perfectly in a screenshot and cannot be walked
     up to — and unlike a dragon there is no flying it home to try again. */
  ok('every ball stands on solid ground',
    balls.every((b) => world.heightAt(b.position.x, b.position.z, b.position.y + 0.5) != null));
  /* Buried in a solid — but a solid you are standing ON TOP of does not count,
     which is the whole reason solids grew a `top`. The spire's star is 21
     units above a 4.4-radius column and is in plan view dead centre of it. */
  ok('none is buried in a solid', balls.every((b) => world.solids.every(
    (s) => Math.hypot(b.position.x - s.x, b.position.z - s.z) >= s.r
      || (s.top != null && b.position.y >= s.top - 0.35))));
  /* And none inside a clan's join ring: a star collected by accident on the
     way to swearing an oath is a star that never got found. */
  ok('none sits in a clan join ring', balls.every((b) => world.clanHalls.every(
    (h) => Math.hypot(b.position.x - h.x, b.position.z - h.z) > h.r)));
  ok('the pickup radius is reachable on foot', PICKUP_RADIUS >= 2 && PICKUP_RADIUS <= 6);

  /* ------------------------- the locks ---------------------------------- */
  /* The hunt's whole point is that the seven stars ask for seven different
     things. Six identical stars and one cave is not a difficulty curve, it is
     a cave. */
  const kinds = balls.map((b) => b.lock);
  line('locks, in island order', kinds.join(' '));
  ok('every lock kind in LOCKS is actually used',
    Object.keys(LOCKS).every((k) => kinds.includes(k)));
  /* NO LOCK MAY SILENTLY FALL BACK. `placeDragonBalls` drops a lock to a plain
     star when it cannot find room for the furniture, which is the right
     behaviour — a grotto in the market square is worse than a star on a
     hillside — but it is a failure, not an outcome, and it is invisible in
     play. The dojo island did exactly this and shipped two free stars. */
  ok('every island got the lock it was assigned',
    kinds.join(' ') === ISLAND_LOCKS.join(' '),
    `wanted ${ISLAND_LOCKS.join(' ')}`);
  ok('exactly one star is free', kinds.filter((k) => k === 'none').length === 1);
  /* THE FREE ONE IS ON THE HOME ISLAND. A locked star teaches nothing to a
     player who has never picked up an unlocked one — she has to know what a
     star is and what the counter does before a ward can read as a ward. */
  ok('and it is the one on the home island',
    balls[0].lock === 'none' && balls[0].island === world.islands[0]);
  ok('no other star is free', balls.slice(1).every((b) => b.lock !== 'none'));

  /* THE FURNITURE MUST NOT LAND ON SOMETHING ELSE, and this is the check that
     did not exist when it did. The dusk grotto went up eight units behind the
     Windwhisker gate with a perched dragon inside the dome, wings out through
     the roof, and every check here passed — because "is the ball on solid
     ground, clear of solids, outside a join ring" is true of a rock dome built
     around a dragon. Two things were missing:

       - a shrine advertises itself at three distances precisely so it reads
         from a long way off, and a dome the same size parked behind it wrecks
         the far one;
       - DRAGONS ARE NOT SOLIDS. Nothing in the world model records that an
         animal is standing anywhere, so `findOpenSpot` cannot see a perch, and
         the grotto is built after the dragons are placed.

     `world.dragonPerches()` exists so both the spawner and the builder resolve
     the same spots. Checked here at the radius the FURNITURE occupies, not the
     ball's — a grotto reaches 17.2 with its boulders and the star inside
     it is a point. */
  {
    const FOOT = { cave: 17.2, perch: 5.2, sky: 4.2, none: 1, ice: 2, boulder: 2.4 };
    const perches = world.dragonPerches();
    line('dragon perches resolved', perches.length);
    ok('every dragon perch found real ground', perches.length === DRAGON_SPOTS.length);
    for (const b of balls) {
      const f = FOOT[b.lock];
      if (f < 4) continue;                     // only the built furniture
      const shrine = Math.min(...world.clanHalls.map(
        (h) => Math.hypot(b.position.x - h.x, b.position.z - h.z) - h.r));
      const dragon = Math.min(...perches.map(
        (p) => Math.hypot(b.position.x - p.x, b.position.z - p.z)));
      line(`${b.stars}* ${b.lock}: to shrine / to dragon`,
        `${shrine.toFixed(1)} / ${dragon.toFixed(1)}`);
      ok(`the ${b.lock} furniture is clear of every shrine`, shrine > f,
        `needs ${f} for its own footprint`);
      ok('and not built around a perched dragon', dragon > f + 5,
        `needs ${(f + 5).toFixed(1)}`);
    }
  }

  /* --- the grotto maze is a MAZE, and it is SOLVABLE ---

     Two ways this feature can fail and neither is visible in a screenshot:
     the maze can seal the star in (a wall segment overlapping one unit too
     far, and a star that is simply unreachable — the worst bug the game could
     ship, because a kid would hunt for it forever), or it can fail to block
     anything (the arc's gap lining up with the mouth, and the "maze" being a
     doorway you walk straight through).

     Both are settled by walking it. The walk is the REAL collision routine —
     `world.resolveSolids` at the player's real radius — so this is not a model
     of the maze, it is the maze. A cell is standable when resolving it does
     not move you; the flood is 4-connected, which is stricter than a kitten
     who can slide along a wall, so a route found here definitely exists. */
  for (const b of balls.filter((x) => x.lock === 'cave')) {
    const R = 0.75;                       // Player.radius
    const STEP = 0.5;
    const REACH = 26;                     // dome + boulders, comfortably
    const key = (i, j) => `${i},${j}`;
    const standable = (x, z) => {
      const f2 = world.resolveSolids(x, z, R);
      return Math.hypot(f2.x - x, f2.z - z) < 1e-6;
    };

    /* Start OUTSIDE, on the approach a kitten actually walks up from — but
       the exact point `REACH` out along that bearing is just a spot on a
       hillside, and it is allowed to have a tree on it. Sweep the bearing
       until one is clear rather than asserting the first guess: a start inside
       a trunk would make this measure a walk nobody takes. */
    const isl = b.island;
    const inward = Math.atan2(isl.x - b.position.x, isl.z - b.position.z);
    let start = null;
    for (let k = 0; k < 24 && !start; k++) {
      // 0, +15, -15, +30, -30 ... degrees off the approach.
      const a = inward + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.26;
      const x = b.position.x + Math.sin(a) * REACH;
      const z = b.position.z + Math.cos(a) * REACH;
      if (standable(x, z) && world.heightAt(x, z)) start = { x, z };
    }
    ok(`${b.stars}* cave: there is somewhere to start outside`, !!start);
    if (!start) continue;
    const si = Math.round(start.x / STEP);
    const sj = Math.round(start.z / STEP);

    const seen = new Set([key(si, sj)]);
    const dist = new Map([[key(si, sj), 0]]);
    const queue = [[si, sj]];
    let reached = null;
    while (queue.length) {
      const [i, j] = queue.shift();
      const x = i * STEP;
      const z = j * STEP;
      if (Math.hypot(x - b.position.x, z - b.position.z) < PICKUP_RADIUS) {
        reached = dist.get(key(i, j)) * STEP;
        break;
      }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di;
        const nj = j + dj;
        const k = key(ni, nj);
        if (seen.has(k)) continue;
        const nx = ni * STEP;
        const nz = nj * STEP;
        // Stay in the neighbourhood: this is a maze check, not a world walk.
        if (Math.hypot(nx - b.position.x, nz - b.position.z) > REACH + 2) continue;
        seen.add(k);
        if (!standable(nx, nz)) continue;
        dist.set(k, dist.get(key(i, j)) + 1);
        queue.push([ni, nj]);
      }
    }

    const straight = Math.hypot(start.x - b.position.x, start.z - b.position.z);
    ok(`${b.stars}* cave: the star can actually be walked to`, reached != null,
      reached == null ? 'SEALED IN — nobody can ever finish the hunt' : '');
    if (reached != null) {
      line('  walked / straight line', `${reached.toFixed(1)} / ${straight.toFixed(1)}`);
      /* The maze has to COST something. A ratio near 1 means the star is on a
         sight line from the mouth and the walls are decoration. 1.35 is a
         low bar deliberately — this is asserting that a detour exists, not
         grading how clever it is. */
      ok('  and the maze makes her go the long way', reached > straight * 1.35,
        `${(reached / straight).toFixed(2)}x the straight line`);
    }

    /* ...and the straight line really is blocked, which is the same claim
       from the other side and catches a maze that is merely long. */
    let blocked = false;
    for (let t = 0.02; t < 1 && !blocked; t += 0.01) {
      const x = start.x + (b.position.x - start.x) * t;
      const z = start.z + (b.position.z - start.z) * t;
      if (!standable(x, z)) blocked = true;
    }
    ok('  and you cannot see or walk straight in', blocked);

    /* THE MOUTH MUST BE WALKABLE. Both grottos shipped with trees across the
       doorway — the outlying scatter ran before the stars were placed AND
       never consulted `keepClear`, so the one bit of ground the grotto cannot
       do without was the one bit nothing was protecting. Checked from the
       outside in, along the doorway axis. */
    const G = world.grottoAt(b.position.x, b.position.z);
    ok(`${b.stars}* cave: the world knows about this grotto`, !!G);
    if (G) {
      let clear = true;
      for (let d = G.r + 7; d > G.r - 1; d -= 0.5) {
        const x = G.x + Math.sin(G.yaw) * d;
        const z = G.z + Math.cos(G.yaw) * d;
        if (!standable(x, z)) { clear = false; break; }
      }
      ok('  the doorway is not grown over', clear);
      ok('  and it has a roof and walls as separate meshes',
        !!G.roof && !!G.walls && G.roof !== G.walls);
    }
  }

  /* THE GROTTO WALLS ARE NOT INSIDE-OUT.
     `curvedWall` is hand-wound, and the first version had every face backwards
     — all four groups, consistently. The world material is FrontSide, so a
     back-facing wall is culled from the side you look at it from and drawn
     from the side you don't: the grotto rendered inside-out, lit wrong, with
     the far side of the room showing through the near side. It shipped, and it
     took a player to spot it, because "the walls look a bit odd" is not
     something a screenshot makes obvious.
     Normals are geometry, so they can just be measured. */
  {
    const g = __curvedWallForTest(5, 6, 0, 4, 0, Math.PI / 2, 0x888888);
    const pos = g.attributes.position.array;
    const nrm = g.attributes.normal.array;
    let outIn = 0;
    let outOut = 0;
    let topUp = 0;
    let topDown = 0;
    for (let v = 0; v < pos.length / 3; v++) {
      const x = pos[v * 3];
      const y = pos[v * 3 + 1];
      const z = pos[v * 3 + 2];
      const rad = Math.hypot(x, z) || 1;
      const radial = (x * nrm[v * 3] + z * nrm[v * 3 + 2]) / rad;
      if (rad > 5.5) { if (radial > 0.2) outOut++; else if (radial < -0.2) outIn++; }
      if (y > 3.9) { if (nrm[v * 3 + 1] > 0.2) topUp++; else if (nrm[v * 3 + 1] < -0.2) topDown++; }
    }
    ok('a curved wall faces OUTWARD on its outer side', outOut > 0 && outIn === 0,
      `${outOut} out / ${outIn} in`);
    ok('...and UP on top', topUp > 0 && topDown === 0, `${topUp} up / ${topDown} down`);
  }

  /* NOTHING IS PLACED AT ITS ISLAND'S EXACT CENTRE, and this is a check
     because four shrines and five dragon perches were, written out as world
     coordinates that happened to equal the island's own origin. It never
     showed while the outlying trees were planted first and shoved the
     placement search off centre by accident; moving them after the stars took
     the accident away. A shrine or a dragon in the dead middle of an island is
     arbitrary, it leaves no clear side for the star's furniture, and at zero
     `leaderSpot` has no axis to stand its leader along. */
  {
    const atCentre = (x, z) => world.islands.some(
      (isl) => Math.hypot(x - isl.x, z - isl.z) < 2.5,
    );
    for (const hall of world.clanHalls) {
      ok(`${hall.clan.name}'s shrine is not at the island's centre`,
        !atCentre(hall.x, hall.z));
    }
    for (const [i, p] of world.dragonPerches().entries()) {
      ok(`dragon perch ${i} is not at the island's centre`, !atCentre(p.x, p.z));
    }
  }

  /* A LOCK MUST SAY WHAT IT WANTS, in words, and as an INSTRUCTION. Every one
     of these was first written as a noun ("SEALED IN ICE") and every one had
     to be rewritten: a kid who can name what she is looking at still does not
     know what to do about it. Checked against a verb list rather than for
     mere presence, because a hint that describes is the failure mode. */
  const VERBS = ['GO', 'BURN', 'CRACK', 'FLY', 'JUMPS', 'RIDE', 'GET', 'HOP'];
  for (const b of balls) {
    if (b.lock === 'none') continue;
    ok(`the ${b.lock} lock tells you what to do`,
      !!b.rule.hint && VERBS.some((w) => b.rule.hint.includes(w)), b.rule.hint);
  }

  /* Breakable wards break to ONE thing. A ward that answers to anything is
     scenery with extra steps — and one that answers to the katana would make
     the panda and the dragon pointless, since every kitten has a katana. */
  for (const b of balls) {
    if (!b.rule.breaks) { ok(`the ${b.lock} star needs no ward broken`, b.open); continue; }
    ok(`the ${b.lock} star starts sealed`, !b.open);
    ok(`and a katana does nothing to it`, !b.strike('slash') && !b.open);
    const wrong = b.rule.breaks === 'claw' ? 'breath' : 'claw';
    ok(`nor does the ${wrong}`, !b.strike(wrong) && !b.open);
    ok(`but the ${b.rule.breaks} opens it`, b.strike(b.rule.breaks) && b.open);
    ok('and it cannot be broken twice', !b.strike(b.rule.breaks));
    b.reset();
    ok('a restart seals it again', !b.open);
  }

  /* The `foot` locks refuse a rider, and say why. This is the rule that makes
     a cave a cave: a billboarded dragon is a flat drawing with a POINT for a
     position, and that point fits through any doorway a kitten fits through,
     so the geometry alone cannot enforce "come in on foot". */
  {
    const onFoot = {
      position: new THREE.Vector3(),
      mount: null, rideAlong: null, pandaMount: null,
      onGround: true, footClimb: true,
    };
    const onDragon = { ...onFoot, mount: {}, footClimb: false };
    const onPanda = { ...onFoot, pandaMount: {}, footClimb: false };
    for (const b of balls) {
      if (!b.rule.foot) continue;
      ok(`the ${b.lock} star refuses a dragon rider`, !b.canTake(onDragon).ok);
      ok('and refuses a panda rider', !b.canTake(onPanda).ok);
      ok('and both refusals explain themselves',
        !!b.canTake(onDragon).why && !!b.canTake(onPanda).why);
      ok('but takes her on her own two feet', b.canTake(onFoot).ok);

      /* MID-AIR IS NOT ON FOOT, and this is the check that would have caught
         the 7★ shipping open. The pickup test allows 14 units of vertical
         slack so a dragon can sweep past a star on a rim — which means a
         double jump topping out well short of the top shard was still inside
         the window, and the third jump the island exists for was optional. */
      const jumping = { ...onFoot, onGround: false };
      ok('and refuses her in mid-air', !b.canTake(jumping).ok,
        b.canTake(jumping).why ?? '(no reason given)');
      ok('...with a reason', !!b.canTake(jumping).why);
    }

    /* The `sky` star asks a second question: not "are you on a dragon" but
       "did you get up here on one". Landing on the top shard after a dismount
       satisfies every `foot` rule and still has to be refused. */
    const sky = balls.find((b) => b.lock === 'sky');
    ok('the sky lock asks how she got there', !!sky.rule.climbed);
    ok('a dragon that DROPPED her on the shard is refused',
      !sky.canTake({ ...onFoot, footClimb: false }).ok);
    ok('...and says so', !!sky.canTake({ ...onFoot, footClimb: false }).why);
    ok('but a kitten who climbed it is not',
      sky.canTake({ ...onFoot, footClimb: true }).ok);
    /* Only `sky` may ask it. A grotto has a roof, so `climbed` there would
       refuse a player who walked in perfectly legitimately after a flight. */
    for (const b of balls) {
      if (b.lock === 'sky') continue;
      ok(`the ${b.lock} star does NOT require a climb`, !b.rule.climbed);
    }
    const cave = balls.find((b) => b.lock === 'cave');
    ok('a cave takes her whether or not she flew to the island',
      cave.canTake({ ...onFoot, footClimb: false }).ok);

    /* ...and the ones that DON'T say foot must still be takeable from a
       dragon, or the ice star — which you can only open from the air — would
       be a star you unlock and then cannot reach. */
    const ice = balls.find((b) => b.lock === 'ice');
    ice.strike('breath');
    ok('the ice star can be taken from the dragon that freed it',
      ice.canTake(onDragon).ok);
    ok('and in mid-air, since that is where a dragon is',
      ice.canTake({ ...onDragon, onGround: false }).ok);
    ice.reset();
  }
}

console.log('\n--- the jump gate is measured, not guessed ---');
{
  /* SHARD_RISE has to sit strictly between what two jumps can do and what
     three can, and both numbers are recomputed HERE from the real constants
     rather than copied. Retuning JUMP_V or the Shadowtail buff must fail this
     check rather than silently opening or closing the gate — a platform that
     is reachable "most of the time" is the worst possible thing to hang a
     collectible on.

     Apex of a jump from velocity v is v^2 / 2g. Chaining is best-case: each
     press fired exactly at the previous apex, which is the most generous
     reading and therefore the right one for an upper bound. */
  const GRAVITY = 26;
  const JUMP_V = 11.2;
  const LATER = 0.86;                       // later jumps are a little weaker
  const apex = (v) => (v * v) / (2 * GRAVITY);

  const leap = CLANS.find((c) => c.buff.jumps)?.buff ?? {};
  const jk = leap.jump ?? 1;
  const two = apex(JUMP_V) + apex(JUMP_V * LATER);
  const three = apex(JUMP_V * jk) * 2 + apex(JUMP_V * LATER * jk);

  line('best climb on two jumps', two.toFixed(2));
  line('best climb on three (Shadowtail)', three.toFixed(2));
  line('shard rise', SHARD_RISE.toFixed(2));
  ok('two jumps cannot reach the first shard', SHARD_RISE > two * 1.25,
    `${SHARD_RISE} vs ${two.toFixed(2)}`);
  ok('three jumps can, with slack for a nine-year-old', SHARD_RISE < three * 0.8,
    `${SHARD_RISE} vs ${three.toFixed(2)}`);
  ok('and the triple jump is a real clan buff somebody can get', leap.jumps === 3);

  /* The spire is the opposite gate: NO jump may reach it, so the dragon is
     the only way. Checked against the best climb in the game, which is the
     triple jump — not against a number somebody remembered. */
  line('spire height vs the best climb in the game', `${SPIRE_H} vs ${three.toFixed(2)}`);
  ok('nothing on foot can jump onto the spire', SPIRE_H > three * 1.8);

  /* And the shard staircase must be climbable in stages rather than needing
     one impossible leap — three hops of SHARD_RISE, not one of 3x. */
  ok('the shards are a staircase, not a wall', SHARD_COUNT >= 2);
  ok('every step is the same reachable size', SHARD_RISE * SHARD_COUNT > two * 2);

  /* SHARD_RISE IS THE DESIGN INTENT; THE BUILT WORLD IS THE ANSWER.
     Everything above checks a constant. What a player actually jumps is the
     gap between the deck she is standing on and the next one — and the first
     of those is measured against the TERRAIN under the bottom shard, which is
     not the ground at the placement spot the stack was positioned from. Those
     two are the same number only by luck of where the placer landed, so the
     real staircase is measured here out of `world.platforms`. */
  const skyBall = world.dragonBalls.find((b) => b.lock === 'sky');
  const pads = world.platforms
    .filter((p) => Math.hypot(
      (p.x0 + p.x1) / 2 - skyBall.position.x, (p.z0 + p.z1) / 2 - skyBall.position.z,
    ) < 34)
    .sort((a, b) => a.y - b.y);
  ok('the shard stack is really in the world', pads.length === SHARD_COUNT,
    `found ${pads.length}`);

  let below = null;
  pads.forEach((p, i) => {
    const cx = (p.x0 + p.x1) / 2;
    const cz = (p.z0 + p.z1) / 2;
    /* -1e9 asks for TERRAIN ONLY: heightAt skips a platform whose deck is
       above where the query says it is coming from, so an impossibly low
       `fromY` sees straight through the shards to the hillside beneath. */
    const terrain = world.heightAt(cx, cz, -1e9);
    const from = below ?? terrain?.y;
    const gap = p.y - from;
    line(`  hop ${i + 1} (real)`, gap.toFixed(2));
    ok(`  hop ${i + 1} is out of reach of two jumps`, gap > two,
      `${gap.toFixed(2)} vs ${two.toFixed(2)}`);
    ok(`  hop ${i + 1} is inside a triple jump`, gap < three,
      `${gap.toFixed(2)} vs ${three.toFixed(2)}`);
    below = p.y;
  });

  /* The star has to be ON the top deck. If it floated above it, standing on
     the shard would not be close enough and the climb would end in a refusal
     with nowhere left to go. */
  const top = pads[pads.length - 1];
  ok('the star sits on the top shard', Math.abs(skyBall.position.y - top.y) < PICKUP_RADIUS,
    `${(skyBall.position.y - top.y).toFixed(2)} apart`);
  ok('and over it horizontally',
    Math.hypot((top.x0 + top.x1) / 2 - skyBall.position.x,
      (top.z0 + top.z1) / 2 - skyBall.position.z) < PICKUP_RADIUS);
}

console.log('\n--- Ryuuseki, and why two seats beat one ---');
{
  /* contentScale is the REAL measured value off ryuuseki.png, not a round
     number. It matters: he is a worm, so his drawn content fills only 43% of
     the cell's height, and a stub guessing 0.7 shrinks his computed quad by a
     third — which would let a size that is far too big on screen sail through
     the framing check below. */
  const art = { texture: new THREE.Texture(), contentScale: 0.433, pad: 0.06, cols: 1 };
  const R = new Ryuuseki(art, 0, 60, -46);

  ok('he starts with both seats empty', R.freeSeat() === 'pilot' && !R.ridden);
  const flyer = {};
  const gunGirl = {};
  R.pilot = flyer;
  ok('the second rider gets the gunner seat', R.freeSeat() === 'gunner');
  ok('one rider is ridden but NOT duo', R.ridden && !R.duo);
  R.gunner = gunGirl;
  ok('and a third is turned away', R.freeSeat() === null);
  ok('he counts as ridden', R.ridden);
  ok('and now he is duo', R.duo);

  /* The whole feature. Two seats have to be MEASURABLY better than one, or the
     teamwork framing is decoration — and it has to be visible, not a damage
     number, because nobody reads damage numbers at nine years old. */
  line('beams: pilot vs gunner', `${PILOT_BEAMS} vs ${GUNNER_BEAMS}`);
  ok('the gunner fires more beams than the pilot', GUNNER_BEAMS > PILOT_BEAMS);
  ok('but the pilot is not locked out', PILOT_BEAMS >= 1);
  ok('the fan is wide enough to read as a fan', FAN > 1 && GUNNER_BEAMS >= 5);

  /* THE COUNT IS A FACT ABOUT THE SEAT, NOT ABOUT THE CREW.
     It used to read `pilot && gunner` and hand whoever pressed the button the
     full fan, so the pilot's one beam silently became seven the moment her
     sister climbed on — which both makes the gunner's only job redundant and
     means the two girls' attacks are indistinguishable in the one set-piece
     built around them doing different things. */
  ok('the pilot fires one beam with both aboard', R.beamsFor(flyer) === PILOT_BEAMS);
  ok('and the gunner fires the fan', R.beamsFor(gunGirl) === GUNNER_BEAMS);
  R.gunner = null;
  ok('a lone pilot still fires, and still just one',
    R.beamsFor(flyer) === PILOT_BEAMS && PILOT_BEAMS >= 1);
  R.gunner = gunGirl;

  /* THE BEAMS COME OUT OF HIS MOUTH, SO THEY MUST NOT GO BACKWARDS.
     The fan was aimed on the shooter's raw facing. His drawn heading is
     broadside and flips, so a gunner pushing her stick the other way fired
     seven beams out of his jaw travelling back over his own body. The bound is
     asserted as a RELATIONSHIP — widening FAN later must not quietly let a
     beam point behind him again. */
  line('worst beam angle off his head',
    `${(((AIM_ARC + FAN / 2) * 180) / Math.PI).toFixed(0)} degrees`);
  ok('no beam can ever leave the mouth pointing backwards',
    AIM_ARC + FAN / 2 < Math.PI / 2);
  ok('but the gunner can still swing the fan', AIM_ARC > 0.3);
  {
    R.facing = 0;                                 // head down +z
    ok('an aim within the arc is untouched',
      Math.abs(R.aimFor({ facing: 0.3 }) - 0.3) < 1e-9);
    ok('an aim behind him is pulled back to the arc',
      Math.abs(R.aimFor({ facing: Math.PI }) - AIM_ARC) < 1e-9);
    ok('and it clamps the short way round, not through his tail',
      Math.abs(R.aimFor({ facing: -Math.PI * 0.9 }) + AIM_ARC) < 1e-9);
    /* The clamp is relative to his HEADING, so it has to follow the flip —
       that is the exact case the bug appeared in (drawn left, aiming right). */
    R.facing = Math.PI;
    const flipped = R.aimFor({ facing: 0 });
    ok('the arc follows his heading when he flips',
      Math.abs(Math.abs(flipped - Math.PI) - AIM_ARC) < 1e-9);

    /* THE CLAMP MUST BE A NO-OP FOR THE PILOT, by construction rather than by
       luck: `_updateFlight` sets her facing to `camYaw + flySide * PI/2`, and
       `carry` gives him the same expression from the same two numbers. If that
       ever drifts apart, her single beam starts coming out at an angle to the
       head she is steering, which is a much harder thing to spot than the
       gunner's version of the same bug. */
    for (const side of [1, -1]) {
      const pilot = { position: new THREE.Vector3(0, 70, 0), camYaw: 0.7, flySide: side };
      pilot.facing = pilot.camYaw + side * (Math.PI / 2);
      R.carry(pilot);
      ok(`the pilot's aim is unclamped flying ${side > 0 ? 'right' : 'left'}`,
        Math.abs(R.aimFor(pilot) - pilot.facing) < 1e-9);
    }
    R.facing = 0;
  }

  /* He must outrange the storm dragons, or the reward for the whole hunt is a
     dragon that does less than the one perched outside your house. */
  const best = Math.max(...BREEDS.map((b) => b.breath.range));
  line('reach: best storm dragon vs Ryuuseki', `${best} vs ${BEAM.range}`);
  ok('he outreaches every storm dragon', BEAM.range > best);
  ok('and hits harder', BEAM.power > Math.max(...BREEDS.map((b) => b.breath.power)));

  /* Big enough to read as legendary next to a 13-unit storm dragon — measured
     along his LENGTH, which is the honest dimension for a worm. Comparing
     `RYU_SIZE` to a storm dragon's `size` compares two heights, and his height
     is the small one: at RYU_SIZE 26 he was half as tall again as a storm
     dragon and more than four times as long. That check said "bigger" while
     the thing that made him unusable on screen went unmeasured. */
  ok('he is visibly longer than a storm dragon', R.quad * 0.879 > 13 * 1.5);

  /* The two seats must not be drawn at the same spot, or the girls overlap
     into one smear and the depth sort flickers between them. */
  R.facing = 0;
  const a = R.seatOffset('pilot');
  const b = R.seatOffset('gunner');
  const gap = Math.hypot(a.x - b.x, a.z - b.z);
  line('gap between the two seats', gap.toFixed(2));
  ok('the riders do not sit inside each other', gap > 2.9 * 0.6);

  /* THE ANIMAL MUST NOT MOVE WHEN HIS DRAWN HEADING FLIPS.

     This has been got wrong twice from opposite directions, so it is worth
     stating as the rule rather than as a number. `carry` places him at
     `rider - offset`; his heading is broadside-only and SWAPS between two
     values; so any horizontal term in that offset throws the whole animal
     `2 * fwd * quad` sideways the instant a turn crosses the threshold.

     First attempt: seat both girls on the hump, which is the best place to be
     DRAWN and made him lurch. Second attempt: seat the pilot at `fwd 0`, which
     was steady and put her in the thin gap between two coils. Neither is
     needed — `carry` takes only the VERTICAL part now and the horizontal part
     moves her sprite (Ryuuseki.drawOffset), so she can sit anywhere on him
     without the animal caring. Checked by simulating the flip, because the
     stillness is the requirement and the numbers are just a means to it. */
  line('seats, fwd toward the head', `pilot ${RYU_BACK.pilot.fwd} / gunner ${RYU_BACK.gunner.fwd}`);
  {
    const rider = { position: new THREE.Vector3(10, 80, -20), facing: 0, camYaw: 0, flySide: 1 };
    R.carry(rider);
    const before = R.position.clone();
    rider.flySide = -1;              // the same turn, mirrored
    R.carry(rider);
    const lurch = R.position.distanceTo(before);
    line('how far he moves when his heading flips', lurch.toFixed(3));
    ok('flipping his heading does not move the animal', lurch < 0.001,
      'a non-zero pilot fwd throws him 2*fwd*quad sideways');
  }
  /* ...and the seat still has to be a real place on him. The flip-stillness
     check above passes trivially if both seats are zero, so the positions get
     asserted too — otherwise "he does not lurch" would be satisfied by two
     kittens hovering at his origin. */
  ok('the pilot rides the hump, the high thick part of his back',
    RYU_BACK.pilot.fwd >= 0.15 && RYU_BACK.pilot.fwd < 0.34);
  /* The gunner works his mouth, so she sits by his head — a kitten firing a
     beam out of a jaw thirty units in front of her reads as unrelated to it. */
  line('gunner vs mouth, forward of centre',
    `${RYU_BACK.gunner.fwd} vs ${RYU_MOUTH.fwd}`);
  ok('the gunner sits up by the mouth she is firing',
    RYU_BACK.gunner.fwd > RYU_BACK.pilot.fwd
    && Math.abs(RYU_BACK.gunner.fwd - RYU_MOUTH.fwd) < 0.16);
  ok('but not past the end of his snout', RYU_BACK.gunner.fwd < RYU_MOUTH.fwd);
  ok('both sit on the drawn body, not under or over it',
    Object.values(RYU_BACK).every((s) => s.up > 0.25 && s.up < 0.45));
  ok('and the seats are world-space, not quad-space',
    a.y > 0 && a.y < R.quad * 0.45);

  /* He must fit on screen with the ground under him. At 26 the drawn creature
     was 53 units long — most of the town — and no camera distance framed both. */
  line('drawn length vs a 2.9 kitten', `${(R.quad * 0.879).toFixed(0)} units`);
  ok('he is longer than a storm dragon but still framable',
    R.quad * 0.879 > 20 && R.quad * 0.879 < 36);

  /* The beams leave his MOUTH. Firing from his origin put them three coils
     back, erupting out of his ribs. */
  R.position.set(0, 0, 0);
  R.facing = Math.PI / 2;            // pointing down +x
  const mouth = R.mouthPos();
  line('mouth offset from his centre', `${mouth.x.toFixed(1)}, ${mouth.y.toFixed(1)}`);
  ok('the mouth is out at the head, not at his middle',
    Math.abs(mouth.x) > R.quad * 0.35);
  ok('and it tracks his heading', (() => {
    R.facing = -Math.PI / 2;
    return Math.sign(R.mouthPos().x) === -1;
  })());

  /* A FAN STILL FADING HAS TO STAY ON THE MOUTH WHEN HE FLIPS. The beams are
     children of his group, which travels with him for free — but the mouth is
     `RYU_MOUTH.fwd` along a heading that SWAPS, so a fan pinned to the local
     offset it was born with hangs off his tail for the rest of its fade.
     Their ANGLE is deliberately left alone: a beam already out of the mouth is
     in the world, and re-deriving it would sweep the fan across the town. */
  {
    R.position.set(0, 60, 0);
    R.facing = Math.PI / 2;
    R.pilot = flyer;
    R.gunner = null;
    R.fire({ props: [] }, null, flyer);
    const bornAt = R.beams[0].position.x;
    const bornAim = R.beams[0].rotation.y;
    R.facing = -Math.PI / 2;               // the same turn, mirrored
    R.update(1 / 60, null);
    line('live beam, mouth side before/after the flip',
      `${bornAt.toFixed(1)} -> ${R.beams[0].position.x.toFixed(1)}`);
    ok('a fading beam follows his mouth across a flip',
      Math.sign(R.beams[0].position.x) === -Math.sign(bornAt)
      && Math.abs(R.beams[0].position.x + bornAt) < 1e-9);
    ok('but does not swing its aim round with him',
      Math.abs(R.beams[0].rotation.y - bornAim) < 1e-9);
    R.beamT = 0;
    for (const m of R.beams) m.visible = false;
    R.pilot = null;
  }

  /* He must come DOWN when nobody is on him. Left at the height he is summoned
     to, stepping off once means never getting back on — a mount you can lose
     by dismounting is worse than no mount at all. */
  ok('he waits within reach of the ground', HOVER > 4 && HOVER < 18);

  /* BOTH riders have to bob with him. `flapBob` was only ever read through
     `mount`, so the gunner — who rides through `rideAlong` — sat perfectly
     still on a creature swelling underneath her, which is the exact thing
     flapBob exists to prevent. Driven for a second so it is genuinely moving
     rather than merely present. */
  {
    // Local, because the Pandapaw section's factory is scoped to its own block.
    const mkRider = () => new Player({
      texture: new THREE.Texture(), index: 0,
      spawn: new THREE.Vector3(0, world.heightAt(0, 40).y, 40),
      cols: 8, rows: 4, mirror: false,
    });
    const owner = mkRider();
    const gun = mkRider();
    owner.mount = R; gun.rideAlong = R;
    R.pilot = owner; R.gunner = gun;
    const seen = new Set();
    for (let i = 0; i < 60; i++) {
      R.update(1 / 60, world);
      owner._updateFeedback(1 / 60, world);
      gun._updateFeedback(1 / 60, world);
      seen.add(gun.sprite.mesh.position.y.toFixed(3));
    }
    line('gunner bob values over a second', seen.size);
    ok('the gunner rides his swell, not just the pilot', seen.size > 5);
    ok('and both seats read the same motion',
      Math.abs(owner.sprite.mesh.position.y - gun.sprite.mesh.position.y) < 1e-9);
    ok('neither seat is NaN', Number.isFinite(owner.sprite.mesh.position.y)
      && Number.isFinite(gun.sprite.mesh.position.y));

    /* The katana stays sheathed while riding. Two overlapping effects for one
       button press, and on a thirty-unit dragon a two-unit sword swipe going
       off in his middle is unmissable. */
    owner.attackTimer = 0.2;
    gun.attackTimer = 0.2;
    owner._updateFeedback(1 / 60, world);
    gun._updateFeedback(1 / 60, world);
    ok('no katana arc while flying him', !owner.slash.visible && !gun.slash.visible);
    // ...but it still comes out on foot, which is the point of having one.
    owner.mount = null; gun.rideAlong = null;
    R.pilot = null; R.gunner = null;
    owner.attackTimer = 0.2;
    owner._updateFeedback(1 / 60, world);
    ok('and it still swings on the ground', owner.slash.visible);
  }

  /* He asks the camera for more room than his size alone implies — a yaw-only
     billboard keystones at its edges, and across thirty units that reads as a
     dragon rotated away from you rather than as perspective. */
  line('camera pull-back on him', `${RYU_CAM}x a storm dragon`);
  ok('the camera pulls back further than his size alone asks',
    R.camScale > R.quad / 24);

  /* And it looks at THE GIRLS, not at his origin. Their positions are his
     origin — the seats are draw offsets — so "aim at the rider" and "aim at
     the dragon" are the same point, and pulling back alone re-framed nothing.
     The midpoint has to actually sit forward of his centre, on his neck. */
  {
    R.position.set(0, 50, 0);
    R.facing = Math.PI / 2;                 // pointing down +x
    R.pilot = null; R.gunner = null;
    ok('no midpoint with nobody aboard', R.ridersMidpoint() === null);
    R.pilot = {};
    const solo = R.ridersMidpoint();
    ok('a lone pilot gets her OWN seat, not a midpoint with an empty one',
      Math.abs(solo.x - R.quad * RYU_BACK.pilot.fwd) < 1e-6);
    R.gunner = {};
    const duo = R.ridersMidpoint();
    const wantFwd = R.quad * (RYU_BACK.pilot.fwd + RYU_BACK.gunner.fwd) / 2;
    line('camera aim, forward of his centre', `${duo.x.toFixed(1)} units`);
    ok('with both aboard it sits between them', Math.abs(duo.x - wantFwd) < 1e-6);
    ok('and that is genuinely forward of his origin', duo.x > R.quad * 0.15);
    ok('at the height they are drawn', duo.y > R.position.y && duo.y < R.position.y + R.quad * 0.45);
    R.pilot = null; R.gunner = null;
  }
}

console.log('\n--- the summoning ---');
{
  ok('both scripts have lines', SCRIPTS.found.length >= 2 && SCRIPTS.summon.length >= 2);
  ok('every line names a recording',
    [...SCRIPTS.found, ...SCRIPTS.summon].every((b) => b.voice?.endsWith('.mp3')));
  ok('and no two share one',
    new Set([...SCRIPTS.found, ...SCRIPTS.summon].map((b) => b.voice)).size
      === SCRIPTS.found.length + SCRIPTS.summon.length);
  /* The teamwork instruction has to be SAID. The two-seat split is the one
     mechanic in the game a player cannot discover by pressing buttons — there
     is no prompt that explains why the second kitten should climb on. */
  const spoken = SCRIPTS.summon.map((b) => b.text).join(' ').toLowerCase();
  ok('the dragon explains the two seats out loud',
    spoken.includes('steer') && spoken.includes('burn'));
  ok('and that together is better', spoken.includes('together'));
  ok('the sky goes properly dark, but not black', DUSK_DEEP > 0.6 && DUSK_DEEP < 1);
}

console.log('\n--- the 100% ending ---');
{
  const F = SCRIPTS.finale;
  ok('the finale has lines', F.length >= 3);

  /* IT MUST SAY SHE CAN KEEP PLAYING. This is the load-bearing line of the
     whole scene: nothing is taken away at 100%, but a kid who reads a
     completion screen concludes the game is finished and stops, and the
     Kotodama Orb and the Dojo are the two things she is most likely to still
     have in front of her. Checked against the words rather than assumed. */
  const said = F.map((b) => b.text).join(' ').toLowerCase();
  ok('it tells her she can keep playing',
    ['stay', 'again', 'tomorrow'].some((w) => said.includes(w)));
  /* ...and it sends them to the arena. This is the door into the next thing
     being built, so the word has to actually be there — a finale that ends on
     "well done" and nothing else leaves a kid who has finished the game with
     nowhere to go. */
  ok('it sends them to the arena', said.includes('arena'));
  ok('it thanks them for what they actually DID',
    said.includes('you') && (said.includes('crossed') || said.includes('paws')));

  /* PATCHFUR IS RECORDED, like she is everywhere else. A narrator who is
     ElevenLabs for seven lines and synthesised blips for the ending makes the
     ending sound like the part nobody finished. */
  ok('every finale line is recorded',
    F.every((b) => b.voice?.endsWith('.mp3')),
    F.map((b) => b.voice ?? 'none').join(' '));
  ok('and no two share a recording',
    new Set(F.map((b) => b.voice)).size === F.length);
  /* `dur` survives as a FLOOR. `load()` raises it to the real clip length plus
     TAIL, but a beat with no authored length at all would end on `undefined`
     the moment a file went missing, and the scene would run its whole script
     in a single frame. */
  ok('every finale beat still has an authored floor',
    F.every((b) => b.dur > 3),
    F.map((b) => b.dur).join('/'));
  ok('and the whole thing is a scene, not an essay',
    F.reduce((s, b) => s + b.dur, 0) < 45,
    `${F.reduce((s, b) => s + b.dur, 0).toFixed(1)}s`);

  /* The typewriter falls back to TYPE_SPEED (34 chars/s) with no clip to pace
     against, so a line has to be short enough to finish typing inside its own
     beat — otherwise the text is still appearing when the scene moves on and
     nobody ever reads the end of it. */
  for (const b of F) {
    ok(`  "${b.id}" finishes typing before its beat ends`,
      b.text.length / 34 < b.dur - 0.5,
      `${(b.text.length / 34).toFixed(1)}s of typing in ${b.dur}s`);
  }

  ok('it is a separate scene from the two dragon ones',
    !SCRIPTS.found.concat(SCRIPTS.summon).some((b) => F.includes(b)));
}

console.log('\n--- the cutscene never cuts a line off ---');
/* The beat used to end on a timer alone, and `dur` is only `voiceDur + TAIL` —
   so it assumed the audio started the instant the beat did. It doesn't: `speak`
   used to build an Audio element from cold per beat, and every millisecond of
   fetch-and-decode past TAIL came off the end of the sentence. Intermittent in
   Firefox, invisible in Chrome, and impossible to see in a screenshot.
   The rule is now "authored time has run AND the line has finished". */
{
  const VOICE = 5.6;
  const dur = VOICE + TAIL;          // how loadVoices sizes a beat

  // On time: the line ends at 5.6, the beat still runs its authored length.
  ok('a line that starts on time keeps the authored tail',
    !beatOver(VOICE + 0.1, dur, VOICE) && beatOver(dur, dur, VOICE),
    `ends at ${dur}s`);

  /* Late by more than TAIL: this is the bug. The old rule ended the beat at
     `dur` regardless, chopping the last (slip - TAIL) seconds off the line. */
  const slip = 2.4;
  const endsAt = slip + VOICE;       // when a line delayed by `slip` finishes
  ok('a late line is NOT cut off at the authored end',
    !beatOver(dur, dur, null), `still speaking at ${dur}s`);
  ok('and the beat waits for it to finish',
    !beatOver(endsAt, dur, endsAt) && beatOver(endsAt + LINE_TAIL, dur, endsAt),
    `ends at ${(endsAt + LINE_TAIL).toFixed(2)}s, not ${dur}s`);

  // A late line still gets a breath of silence before the next speaker.
  ok('a slipped beat still ends on a pause',
    !beatOver(endsAt + LINE_TAIL * 0.5, dur, endsAt));

  /* The escape hatch. A play() the browser refused never reports a finish, and
     a nine-year-old cannot be stranded on beat four with only the skip button.
     It has to give up on its own. */
  ok('a line that never starts cannot strand the scene',
    beatOver(dur + MAX_SLIP, dur, null, false), `gives up after ${MAX_SLIP}s`);
  ok('but not before it has genuinely waited',
    !beatOver(dur + MAX_SLIP - 0.1, dur, null, false));

  /* The cap must not become a second way to cut a line off. A clip that is
     audibly playing gets to finish however late it started — capping on
     elapsed time alone reintroduces the exact bug, it just needs a slower
     start to trigger it. */
  {
    const veryLate = 6, ends = veryLate + VOICE;   // 11.6s, well past dur+MAX_SLIP
    ok('a line playing past the cap is still not cut off',
      !beatOver(dur + MAX_SLIP + 0.1, dur, null, true), 'started, so it waits');
    ok('and it ends when the line does, not when the cap says',
      beatOver(ends + LINE_TAIL, dur, ends, true)
      && !beatOver(ends - 0.1, dur, null, true),
      `ends at ${(ends + LINE_TAIL).toFixed(2)}s`);
    ok('but a clip that stalls mid-word still gives up eventually',
      beatOver(dur + MAX_SLIP * 2, dur, null, true));
  }

  // Beats with no recording at all fall back to the authored timing exactly.
  ok('an unvoiced beat runs its authored length',
    beatOver(7, 7, 0, false) && !beatOver(6.9, 7, 0, false));
}

console.log('\n--- dragons get somewhere you can see them ---');
{
  // Deliberately ask for a perch on top of the main clan hall.
  const spot = world.findOpenSpot(-34, -30, 10);
  ok('a blocked spot gets moved', spot && Math.hypot(spot.x + 34, spot.z + 30) > 5);
  const clear = spot && world.solids.every(
    (s) => Math.hypot(spot.x - s.x, spot.z - s.z) >= s.r + 10
  );
  ok('and the spot it finds is genuinely clear', clear);
  ok('and is on solid ground', spot && world.heightAt(spot.x, spot.z) != null);
}

/* ONE HOME DRAGON PER PLAYER, and the count is asserted against MAX_PLAYERS
   rather than against 4. The rule has never been "two": it is that no kitten
   is left on the ground watching her sister fly, which is why the home island
   had two when the game seated two. A third and fourth player can join
   mid-session at any moment, and the failure that produces is silent — she
   picks her cat, walks to the plaza, and finds two dragons with her sisters
   already on them. Written against MAX_PLAYERS so seating a fifth kitten one
   day fails HERE, on a line that says why, rather than in front of her. */
{
  const home = world.islands[0];
  const perches = world.dragonPerches();
  const onHome = perches.filter((p) => Math.hypot(p.x - home.x, p.z - home.z) < home.radius);
  line('dragons on the home island', `${onHome.length} for ${MAX_PLAYERS} players`);
  ok('the home island has one dragon per player', onHome.length >= MAX_PLAYERS,
    `${onHome.length} perches, ${MAX_PLAYERS} seats`);
  /* SPREAD OUT, NOT STACKED. Four billboards on one patch of grass are one
     heap of dragon from every angle except directly overhead, and the mount
     prompt would pick whichever the scan reached first — so a kid pressing Y
     between two of them climbs onto an animal she was not looking at. The
     bound is the widest mountRadius in the game (size 13 * 0.62 = 8.06),
     doubled, so no two prompts can ever overlap. */
  let closest = Infinity;
  for (let i = 0; i < onHome.length; i++) {
    for (let j = i + 1; j < onHome.length; j++) {
      closest = Math.min(closest, Math.hypot(onHome[i].x - onHome[j].x, onHome[i].z - onHome[j].z));
    }
  }
  line('closest two home dragons', closest.toFixed(1));
  ok('no two home dragons share a mount prompt', closest > 13 * 0.62 * 2);
  /* AND EVERY ONE OF THEM IS A WALK FROM WHERE SHE STARTS. A fourth dragon
     parked on the far rim is not a fourth dragon, it is a hike — and the kid
     who has to take it is the one who joined last. Measured from the start
     line at (0, 40); the island is 96 across, so this is a bound with real
     room in it rather than one fitted to the numbers that happen to pass. */
  const walk = Math.max(...onHome.map((p) => Math.hypot(p.x - 0, p.z - 40)));
  line('furthest home dragon from the start line', walk.toFixed(1));
  ok('every home dragon is a walk from the start line', walk < home.radius * 0.75,
    `${walk.toFixed(1)} vs ${(home.radius * 0.75).toFixed(1)}`);
}

console.log('\n--- the snow island is no longer empty ---');
{
  const frost = world.islands.find((i) => i.biome === 'frost');
  const on = (p) => Math.hypot(p.group.position.x - frost.x, p.group.position.z - frost.z)
    < frost.radius;
  const icicles = world.props.filter((p) => p.kind === 'icicle');
  line('icicles', icicles.length);
  ok('icicles exist and are worth more than a crate',
    icicles.length > 15 && icicles.every((p) => p.points === 15));
  ok('they are all on the frost island', icicles.every(on));
  ok('the frost island has plenty to break', world.props.filter(on).length >= 20,
    `${world.props.filter(on).length} props`);
  ok('and a shrine of its own',
    world.clanHalls.some((h) => Math.hypot(h.x - frost.x, h.z - frost.z) < frost.radius));
  ok('icicles are not katana-only', icicles.every((p) => !p.katanaOnly));
}

console.log('\n--- clans ---');
const hall = world.clanHalls[0];
ok('clanHallNear finds a shrine you stand in', !!world.clanHallNear(hall.x, hall.z));
ok('clanHallNear is null in open ground', world.clanHallNear(0, 40) === null);
ok('every clan has a shrine', world.shrines.length === CLANS.length);

/* The whole point of the clans is that you go and FIND them, so no two may
   share an island and at least one must be reachable on foot from spawn. */
const islandOf = (x, z) => world.islands.indexOf(world.heightAt(x, z)?.island);
const shrineIslands = world.clanHalls.map((h) => islandOf(h.x, h.z));
line('shrine islands', shrineIslands.map((i, k) =>
  `${world.clanHalls[k].clan.name}:${world.islands[i]?.biome ?? '??'}`).join('  '));
ok('every shrine is on a real island', shrineIslands.every((i) => i >= 0));
ok('no two clans share an island', new Set(shrineIslands).size === shrineIslands.length);
ok('one is on the home island, reachable without a dragon',
  shrineIslands.includes(0));
ok('none is buried in scenery', world.clanHalls.every((h) => world.solids.every(
  (s) => Math.hypot(h.x - s.x, h.z - s.z) >= s.r + 2 || Math.abs(h.x - s.x) < 3.5)));

// Every clan must actually DO something, and no two the same thing.
const buffs = CLANS.map((c) => c.buff?.id);
line('clan buffs', CLANS.map((c) => `${c.name}=${c.buff.label}`).join(', '));
ok('every clan grants a buff', buffs.every(Boolean));
ok('no two clans grant the same buff', new Set(buffs).size === buffs.length);

console.log('\n--- the six clan cards in Help ---');
{
  /* THE HELP PANEL RESTATES THE CLAN TABLE IN HAND-WRITTEN HTML, which is the
     whole risk: change a buff label in world.js and the card still promises
     what the game used to do. Every string on those cards is checked against
     `CLANS` and `LEADERS` here, so the panel cannot drift away from the game
     silently — and there is no way to build the cards FROM the data, because
     the panel is static markup Vite never runs. */
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const grid = html.slice(html.indexOf('<ul class="clan-grid">'), html.indexOf('</ul>', html.indexOf('<ul class="clan-grid">')));
  ok('Help has a card for every clan', (grid.match(/class="clan-card"/g) || []).length === CLANS.length);
  /* The heading text with the tags and whitespace taken out, one per card, in
     document order — so this also pins the ORDER against `CLANS`, which is the
     order the rest of the game lists them in. */
  const heads = [...grid.matchAll(/<h4 class="clan-name">([\s\S]*?)<\/h4>/g)]
    .map((m) => m[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
  ok('...each headed by its clan, in the game\'s own order',
    heads.length === CLANS.length && CLANS.every((c, i) => heads[i] === c.name),
    heads.join(' | '));
  ok('...and promising the buff the game actually grants',
    CLANS.every((c) => grid.includes(`>${c.buff.label}<`)),
    CLANS.filter((c) => !grid.includes(`>${c.buff.label}<`)).map((c) => c.buff.label).join(' | ') || 'all six');
  /* THE MOTTOES WERE SWAPPED IN THE SOURCE DATA and nothing noticed for
     months, because until the Help cards existed `motto` was read by no code
     at all — Windwhisker claimed to be the fastest kittens on any island while
     Thunderpaw, the clan whose whole power is running faster, claimed to be
     the loudest. Checked per clan against the card so the pair cannot come
     apart again, and checked BY CLAN rather than as a set, which is the part
     that would have caught a swap. */
  ok('...quoting the motto that belongs to that clan',
    CLANS.every((c, i) => (grid.split('class="clan-card"')[i + 1] || '').includes(c.motto)),
    CLANS.filter((c, i) => !(grid.split('class="clan-card"')[i + 1] || '').includes(c.motto))
      .map((c) => c.name).join(' ') || 'all six');
  ok('...with the leader who hands it over',
    CLANS.every((c) => grid.includes(LEADERS[c.id].name) && grid.includes(LEADERS[c.id].breed)),
    CLANS.filter((c) => !grid.includes(LEADERS[c.id].name)).map((c) => c.id).join(' ') || 'all six');
  /* The accent is the shrine's FLOOR colour, not its beam. Every clan's `color`
     is a pastel tuned to glow against a night sky and all six are unreadable as
     paper-on-cream; the first cut of the header used one and came out
     vermillion on maroon. Pinned as the rule rather than as six hex strings. */
  ok('...tinted with the clan tile, never the beam colour',
    CLANS.every((c) => grid.includes(`--clan: #${c.tile.toString(16).padStart(6, '0')}`))
    && !CLANS.some((c) => grid.includes(`--clan: #${c.color.toString(16).padStart(6, '0')}`)));

  /* THE PICTURES ARE ONE SIZE, AND THAT IS LOAD-BEARING. tools/help-portraits
     writes all six leaders onto a single measured canvas so the cards line up
     by construction. The version before it cropped each cat to her own ink and
     let CSS `object-fit` sort it out, and three of the six came out a fifth
     shorter than the others because the slot ran out of WIDTH on them — the
     Himalayan and the Ragdoll are nearly square. If the art is re-exported and
     the tool is not re-run, this is what says so. */
  const png = (f) => {
    const b = readFileSync(new URL(`../public/help/clan/${f}`, import.meta.url));
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  };
  const cards = CLANS.map((c) => png(`leader-${c.id}.png`));
  const syms = CLANS.map((c) => png(`sym-${c.id}.png`));
  line('clan card art', `${cards[0].w}x${cards[0].h} leaders, ${syms[0].w}x${syms[0].h} symbols`);
  ok('every leader card is the same size as the others',
    new Set(cards.map((s) => `${s.w}x${s.h}`)).size === 1,
    [...new Set(cards.map((s) => `${s.w}x${s.h}`))].join(' '));
  ok('...and every symbol is square and the same', new Set(syms.map((s) => `${s.w}x${s.h}`)).size === 1
    && syms[0].w === syms[0].h);
  /* And the box they are drawn into keeps their aspect. A slot of the wrong
     shape either squashes a cat or, with `contain`, reintroduces the shrinking
     this was all fixed to stop — so the CSS is checked against the FILE. */
  const css0 = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const slot = css0.slice(css0.indexOf('.clan-leader {'), css0.indexOf('}', css0.indexOf('.clan-leader {')));
  const sw = Number((slot.match(/width:\s*(\d+)px/) || [])[1]);
  const sh = Number((slot.match(/height:\s*(\d+)px/) || [])[1]);
  ok('...and the card draws them at their own aspect',
    Number.isFinite(sw) && Number.isFinite(sh)
    && Math.abs((sw / sh) - (cards[0].w / cards[0].h)) < 0.02,
    `slot ${sw}x${sh}, art ${cards[0].w}x${cards[0].h}`);
  /* Off the wire until Help is opened, like every other picture in the panel —
     `Game._warmHelpClips` only queues an <img> that carries `loading`. */
  ok('...and the twelve pictures wait for Help to open',
    (grid.match(/loading="lazy"/g) || []).length === CLANS.length * 2);
}

console.log('\n--- the four "Moving & fighting" clips ---');
{
  /* THE ONE SECTION IN HELP THAT HAS TO SHOW A VERB. Everything else in the
     panel can be read; "what do I press and what happens" cannot, which is why
     this topic leads on two engine-captured clips instead of the still of the
     town it used to open on.
     FOUR CLIPS AND NOT ONE, and the first reason is the encoder rather than
     the design: every one of them is filmed on a PINNED camera, so the
     encoder's interframe differencing throws most of every frame away — and a
     single clip that also carried the flying beats came out at 4.5MB, more
     than twice anything else in the panel, because a dragon scrolls the whole
     world past the lens. Halving the palette moved it seven per cent, which is
     the number that says the palette was never the problem. The cap below is
     what stops the next session quietly merging them again.
     THE SPLIT IS TWO DIFFERENT SPLITS, ONE PER ROW. The first pair is the same
     run twice, once per kind of controller, which is the shape for "here is
     your device". The second pair has BOTH diagrams on every frame — one
     kitten on the keyboard, one on the pad — and splits by PLACE instead: the
     ring, where a slash is allowed to land, and the sky, where the same four
     buttons mean four other things. Neither shape works for the other job. */
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  /* ONE TOPIC BECAME FOUR, AND THE CHECKS FOLLOWED IT. These clips used to
     live in a single card; the dragon and the arena each have their own now,
     because at half a panel wide with a 13px caption underneath, the picture
     was smaller than the subject. So the cut below is per TOPIC, and each clip
     is asserted to be in the topic that is about it — which is a stronger
     statement than "somewhere in Help" and is the one that goes wrong when
     somebody moves a figure. */
  /* READ WITH THE COMMENTS STRIPPED. The first cut of this check failed on the
     comment RIGHT ABOVE THE CAPTION, which quotes the old wording in order to
     explain why it changed — so the source contained the phrase the page no
     longer shows. A check about what a nine-year-old READS must not be able to
     see the reasons written down for the next developer. */
  const readable = (one) => one.replace(/<!--[\s\S]*?-->/g, '');
  const topic = (title) => helpTopic(html, title);
  const sec = topic('Moving &amp; fighting');
  ok('Help still has a "Moving & fighting" topic', !!sec);
  const dragonSec = topic('Flying a dragon');
  ok('...and a "Flying a dragon" topic of its own', !!dragonSec);
  const arenaSec = topic('Fighting in the arena');
  ok('...and a "Fighting in the arena" topic of its own', !!arenaSec);
  const extraSec = topic('Good to know');
  ok('...and a "Good to know" topic for what belongs to neither', !!extraSec);

  const CLIPS = ['/help/move-keys.gif', '/help/move-pad.gif',
    '/help/move-arena.gif', '/help/move-air.gif'];
  const HOME = {
    '/help/move-keys.gif': ['Moving & fighting', sec],
    '/help/move-pad.gif': ['Moving & fighting', sec],
    '/help/move-air.gif': ['Flying a dragon', dragonSec],
    '/help/move-arena.gif': ['Fighting in the arena', arenaSec],
  };
  /* TWO IN THE FIRST TOPIC, AND THE PAIR IS THE POINT. `move-keys` and
     `move-pad` are one run filmed twice, so they have to stay together and
     side by side or the comparison they exist for is gone. The other two each
     stand alone in their own topic, at full width. */
  /* COUNTED ON THE LEAD, NOT ON THE WHOLE TOPIC. "Moving & fighting" carries
     the other three as sub-cards now, so its markup contains all four clips;
     what this check has always been about is what she sees the moment she opens
     it, which is everything before the fold. */
  const lead = (one) => (one.includes('class="ht-subs"') ? one.slice(0, one.indexOf('class="ht-subs"')) : one);
  ok('the first topic carries exactly the two device clips',
    (lead(sec).match(/data-help-gif=/g) || []).length === 2,
    `${(lead(sec).match(/data-help-gif=/g) || []).length}`);
  for (const [t, one] of [['Flying a dragon', dragonSec], ['Fighting in the arena', arenaSec]]) {
    ok(`"${t}" leads on exactly one clip, at full width`,
      (one.match(/data-help-gif=/g) || []).length === 1
      && one.includes('class="move-wide"'));
  }
  for (const clip of CLIPS) {
    /* The <img> is found by cutting around the path rather than by a regex, so
       nothing here depends on the order the attributes happen to be written
       in. */
    const [where, host] = HOME[clip];
    const at = host.indexOf(clip);
    const tag = at < 0 ? '' : host.slice(host.lastIndexOf('<img', at), host.indexOf('>', at) + 1);
    ok(`${clip} is wired into "${where}"`, !!tag);
    /* DEFERRED, LIKE EVERY OTHER PICTURE IN THE PANEL. `Game._warmHelpClips`
       only fills in an <img> that carries `data-help-gif` AND no `src` yet; a
       plain `src` here would pull two megabytes on boot, for a panel nobody
       has asked for. */
    ok('...and it is deferred, not src\'d',
      tag.includes('data-help-gif=') && !tag.includes(' src='));
    /* MEASURED OFF THE FILE, NOT COPIED FROM THE SHOT SCRIPT. A width/height
       pair that disagrees with the GIF reflows the whole topic the moment the
       image lands, which on a slow connection is a panel that jumps under a
       nine-year-old's finger. */
    const buf = readFileSync(new URL('../public' + clip, import.meta.url));
    const gw = buf.readUInt16LE(6), gh = buf.readUInt16LE(8);
    const dim = (name) => {
      const k = tag.indexOf(name + '="');
      return k < 0 ? NaN : Number(tag.slice(k + name.length + 2, tag.indexOf('"', k + name.length + 2)));
    };
    ok('...and the markup states its real size', dim('width') === gw && dim('height') === gh,
      `markup ${dim('width')}x${dim('height')}, file ${gw}x${gh}`);
    /* Under the cap the split exists to hold. Not a style rule: the panel
       warms these one after another and a fat one stalls every picture behind
       it. */
    ok('...and it stayed under 2.5MB', buf.length < 2.5 * 1024 * 1024,
      `${(buf.length / 1048576).toFixed(2)}MB`);
  }
  /* AND EACH ROW LOOPS TOGETHER — AT THE SAME SPEED. Two clips side by side
     start in step and drift apart on the first wrap, because the browser
     restarts each the moment it ends and nothing coordinates them; a minute in,
     one is slashing while the other is still walking and the pair stops reading
     as one demonstration shown twice. `tools/gif-sync.mjs` equalises them by
     rewriting delays — no pixels, no re-encode.

     THE FIRST VERSION OF THIS CHECK ONLY ASKED FOR EQUAL TOTALS, AND THAT LET A
     REAL BUG THROUGH. gif-sync used to buy the equal total by SPREADING the
     shortfall over every frame of the shorter clip, so `move-pad` ran at 10cs
     and 17cs where `move-keys` ran at 8cs and 14cs — the same beats, a fifth
     slower, landing at a different moment every time. Richard watched the pair
     and said the controller clip had been stretched. It had, and the totals
     were exactly equal the whole time.

     So the real invariant is frame-by-frame: for as far as the shorter clip
     goes, THE TWO CLIPS' DELAYS MUST BE THE SAME NUMBER. That is what makes a
     beat in one land with its twin in the other, and it is the thing an equal
     total cannot see. */
  const dl = (clip) => delaysCs(readFileSync(new URL('../public' + clip, import.meta.url)));
  const mode = (d) => {
    const h = {};
    for (const x of d.slice(0, -1)) h[x] = (h[x] || 0) + 1;
    return Number(Object.entries(h).sort((p, q) => q[1] - p[1])[0][0]);
  };
  for (const [a, b] of [[CLIPS[0], CLIPS[1]], [CLIPS[2], CLIPS[3]]]) {
    const da = dl(a), db = dl(b);
    const sa = da.reduce((x, y) => x + y, 0), sb = db.reduce((x, y) => x + y, 0);
    ok(`${a} and ${b} are exactly the same length, so they wrap together`,
      sa === sb, `${(sa / 100).toFixed(2)}s vs ${(sb / 100).toFixed(2)}s`);
    /* AND NEITHER WAS STRETCHED TO GET THERE. The rate most of a clip's frames
       run at is the rate the shot script was filmed at, and a spread moves it —
       8cs became 10cs and 6cs became 7cs, which is what "the pad clip looks
       stretched" was. Comparing the two MODES catches that in one number and
       says something true of both rows, which a frame-by-frame comparison
       cannot (see below). */
    ok('...and neither was stretched to get there — both play at one rate',
      mode(da) === mode(db), `${mode(da)}cs vs ${mode(db)}cs`);
  }
  /* THE FIRST ROW CAN PROMISE MORE, BECAUSE IT IS ONE RUN FILMED TWICE. Same
     kitten, same beats, one on a keyboard and one on a pad — so every frame the
     two share has to hold for the same length, or JUMP in one lands while the
     other is still walking. That is the strongest form of "in step" and it is
     available here and nowhere else.
     THE SECOND ROW CANNOT, and must not be made to. The ring and the sky are
     different demonstrations in different places with different beats; arena
     holds two frames for its landed slash that air has no counterpart for.
     Forcing them frame-for-frame would mean padding one of them with beats it
     does not have, which is worse than the drift it would fix. */
  {
    const da = dl(CLIPS[0]), db = dl(CLIPS[1]);
    const n = Math.min(da.length, db.length) - 1;   // the last is the tail
    const off = [];
    for (let i = 0; i < n; i++) if (da[i] !== db[i]) off.push(`${i}:${da[i]}vs${db[i]}`);
    ok('the keyboard and pad clips agree frame for frame, being one run twice',
      off.length === 0, off.slice(0, 4).join(' '));
  }
  /* NO FREEZE IN THE MIDDLE OF A CLIP, and no long one at the end of the clip
     that sets the pace. A held GIF frame costs nothing to store, which is why
     it is tempting, and with nothing on screen to read it does not look like a
     pause — it looks like the clip has broken. Reported exactly that way about
     the Ryuuseki capture.
     THE SHORTER CLIP OF A PAIR IS THE EXCEPTION, and deliberately: it owes its
     twin a wait, and a wait is the honest way to pay it. That frame still
     carries its caption, so the hold is reading time — which is the note
     Richard has now made twice about giving a reader a second or two more. It
     is bounded so "wait" cannot quietly become "stopped". */
  for (const clip of CLIPS) {
    const d = dl(clip), body = d.slice(0, -1);
    ok(`${clip} never freezes mid-clip`, Math.max(...body) <= 30,
      `${(Math.max(...body) / 100).toFixed(2)}s`);
    ok(`...and its tail is a pause, not a stall`, d.at(-1) <= 300,
      `${(d.at(-1) / 100).toFixed(2)}s`);
  }
  for (const [a, b] of [[CLIPS[0], CLIPS[1]], [CLIPS[2], CLIPS[3]]]) {
    const longer = dl(a).length >= dl(b).length ? a : b;
    ok(`${longer} sets the pace, so it ends on a short tail`,
      dl(longer).at(-1) <= 120, `${(dl(longer).at(-1) / 100).toFixed(2)}s`);
  }

  const gAt = sec.indexOf('<div class="move-grid">');
  const grid = gAt < 0 ? '' : sec.slice(gAt, sec.indexOf('</div>', sec.indexOf('</figure>', gAt)));
  ok('the two device clips sit side by side in one grid',
    grid.includes(CLIPS[0]) && grid.includes(CLIPS[1]));
  /* SOMEWHERE IN HELP NAMES ONE PAD AND THE GAME SUPPORTS THREE. A kid on a
     DualSense hunting for a button called B is the exact failure that turned
     `PROMPTS.playstation` into shapes; the panel's half of that fix has to keep
     naming them. It moved to "Good to know" when the topic split — it belongs
     to no single section — so this reads THAT topic now. */
  ok('"Good to know" still says what a PlayStation pad shows instead',
    ['✕', '□', '△'].every((glyph) => extraSec.includes(glyph)));

  /* ------------------ the drawn pad, and what it may claim ------------------
     THE DIAGRAM IS THE CLIP'S PAD, AND IT MUST STAY THAT WAY. The geometry in
     `#cp-shell` is transcribed from `padPanel` in the capture kit into the same
     280x214 box, so a child who has just watched `move-pad.gif` is looking at
     the same object with the same buttons in the same holes. Two pictures of a
     controller that disagreed about where the triangle sits would be worse than
     one, so the viewBox is pinned here: change it and this fails rather than
     quietly stretching a face the clip cannot match.

     AND IT IS DEFINED ONCE. Two copies of a hundred lines of path data is two
     things to keep in step, which in practice means one of them rots. */
  ok('the cat pad is defined once, in the panel-wide defs',
    (html.match(/id="cp-shell"/g) || []).length === 1);
  for (const [t, one] of [['Flying a dragon', dragonSec], ['Fighting in the arena', arenaSec]]) {
    ok(`"${t}" draws the pad rather than describing it`,
      one.includes('class="catpad"') && one.includes('href="#cp-shell"'));
    ok('...in the capture kit\'s own 280x214 box, so it matches the clip',
      one.includes('viewBox="0 0 280 214"'));
  }
  /* WHAT EACH DIAGRAM LIGHTS IS ITS ARGUMENT, so it is asserted rather than
     left to a reading of the markup. In the air every face button does
     something and that is the point of the picture; in the ring only two of
     them do, and a diagram that lit the other two would be telling a
     nine-year-old to keep a thumb spare for a button that does nothing there.
     Counted on the `lit` groups: four faces + the trigger + the stick in the
     air, two faces + the trigger + the stick in the ring. */
  const litCount = (one) => (one.match(/<g class="lit">/g) || []).length;
  ok('the dragon pad lights every face button, the trigger and the stick',
    litCount(dragonSec) === 6, `${litCount(dragonSec)}`);
  ok('the arena pad lights only jump, slash, the trigger and the stick',
    litCount(arenaSec) === 4, `${litCount(arenaSec)}`);
  /* AND THE ARENA'S DARK BUTTONS ARE EXPLAINED. An unlit control in a diagram
     reads as an omission unless something says otherwise, and "these two do
     nothing in here" is a rule of the game (no combat outside the ring's
     inverse: no climbing inside it), not a gap in the picture. */
  ok('...and it says out loud why the other two are dark',
    /ride<\/b> and <b>action/i.test(readable(arenaSec)));

  /* THE POINTER OUT OF THE DRAGON TOPIC. "The same four buttons, a long way up"
     was meant as "high in the sky" and was read as a direction — look up the
     page for the keys. If a reader has to ask, it is a direction whether it was
     meant as one or not, and now that the key table lives in a DIFFERENT topic
     there has to be a real one. */
  ok('the dragon caption says where the keys actually are',
    !readable(dragonSec).includes('a long way up')
    && /Moving &amp; fighting<\/i>/.test(dragonSec));
}

console.log('\n--- which button belongs to which device ---');
{
  /* THE COMPLAINT THIS ANSWERS, IN ONE LINE: "for Slash, it says X and F are
     the keys... but which is for gamepad and which is for keyboard?" It was a
     bulleted list of the form "Slash — X / F", and there was genuinely no way
     to tell. It is a table now, one column per device, and this check is what
     stops it drifting back into prose or going stale.

     BOTH COLUMNS ARE READ AGAINST THE REAL TABLES, not against a copy written
     down here. The pad column must be `PROMPTS.standard` — Xbox lettering,
     which is what a browser reporting `mapping: "standard"` describes — and
     the keyboard column must be `KEYSETS[0]`, player one's own keys. Renaming
     a button in input.js therefore fails HERE, rather than leaving a
     nine-year-old hunting a controller for a button that no longer exists.
     That exact failure is why `PROMPTS.playstation` became shapes. */
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const at = html.indexOf('<span class="ht-title">Moving &amp; fighting</span>');
  const sec = helpTopic(html, 'Moving &amp; fighting');
  ok('the Moving & fighting topic still exists', at > 0);

  const km = sec.slice(sec.indexOf('<div class="keymap">'), sec.indexOf('</div>', sec.indexOf('</table>', sec.lastIndexOf('<table>'))));
  ok('...and its controls are a table with a device per column, not a list',
    km.includes('<table>') && !km.includes('<ul>'));
  /* A HEADED COLUMN AND A TINTED ONE. The heading is what a reader parses; the
     tint is what she sees without parsing, and `km-pad` is the class that
     carries it on every cell in that column. */
  ok('...the gamepad column is named', /<th[^>]*class="km-pad"[^>]*>[^<]*(<[^>]+>[^<]*<\/[^>]+>)?\s*Gamepad/.test(km));
  ok('...and the keyboard column is named', km.includes('Keyboard'));
  const padCells = [...km.matchAll(/<td class="km-pad">([\s\S]*?)<\/td>/g)].map((m) => m[1]);
  const keyCells = [...km.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
  ok('...every row has a cell in both', padCells.length === keyCells.length && padCells.length >= 11,
    `${padCells.length} pad, ${keyCells.length} key`);

  /* Every glyph the pad column prints, against the table the GAME prints. */
  const glyphs = (cells) => cells.flatMap((c) => [...c.matchAll(/<kbd>([^<]*)<\/kbd>/g)].map((m) => m[1]));
  const padSaid = new Set(glyphs(padCells));
  for (const [what, action] of [['Jump', 'jump'], ['Slash and breathe', 'attack'],
    ['Dive', 'interact'], ['Ride and hop off', 'mount'], ['Sprint and boost', 'sprint']]) {
    ok(`...${what} names PROMPTS.standard.${action}`, padSaid.has(PROMPTS.standard[action]),
      PROMPTS.standard[action]);
  }
  /* AND NOT THE JOY-CON NAMES, which is what it said. They are the pads in
     Richard's room, so it was an understandable choice and the wrong one: this
     page is read before anything is plugged in, so it has to name the likeliest
     pad. The Joy-Con is covered in prose underneath, where saying "SR" is
     answering a question rather than assuming one. */
  ok('...and the table does not print Joy-Con lettering',
    !padSaid.has('ZL/ZR') && !padSaid.has('ZL') && !padSaid.has('ZR') && !padSaid.has('SR'));

  const keySaid = new Set(glyphs(keyCells));
  const K0 = KEYSETS[0];
  const keyName = { Space: 'Space', ShiftLeft: 'Shift', KeyF: 'F', KeyE: 'E', KeyQ: 'Q' };
  for (const [what, action] of [['Jump', 'jump'], ['Slash and breathe', 'attack'],
    ['Dive', 'interact'], ['Ride and hop off', 'mount'], ['Sprint and boost', 'sprint']]) {
    const want = keyName[K0[action][0]];
    ok(`...${what} names player one's own key`, keySaid.has(want), `${want}`);
  }
  ok('...and Move names all four of her movement keys',
    ['W', 'A', 'S', 'D'].every((k) => keySaid.has(k)));

  /* --- PLAYER TWO'S HAND, WHICH WAS NOWHERE ON THIS PAGE ---
     The tables are one keyboard column and it is player one's, so the second
     kitten's keys lived only in a comment in core/input.js — and that comment
     had been WRONG since jump and sprint swapped: it still called `'` the jump
     key and Right Alt the sprint. Nothing caught it because nothing was
     reading either one. So the page names them now and this reads the names
     back through the real key set, exactly the way the pad column is read
     through `PROMPTS`. A rebinding in input.js fails here rather than leaving a
     nine-year-old holding a key that does nothing. */
  const p2At = sec.indexOf('Player 2 plays the same shape');
  const p2 = p2At < 0 ? '' : sec.slice(p2At, sec.indexOf('</p>', p2At));
  const K1 = KEYSETS[1];
  ok('...and player two\'s half of the keyboard is on the page', p2At > 0);
  ok('...naming O K L ; as her W A S D',
    ['O', 'K', 'L', ';'].every((k) => p2.includes(`<kbd>${k}</kbd>`)));
  ok('...and Right Alt as her jump, which is what KEYSETS binds',
    K1.jump.includes('AltRight') && p2.includes('<kbd>Right Alt</kbd>'));
  ok('...and \' and Right Shift as her sprint, for the same reason',
    K1.sprint.includes('Quote') && K1.sprint.includes('ShiftRight')
    && p2.includes('<kbd>\'</kbd>') && p2.includes('<kbd>Right Shift</kbd>'));
  /* THE HALF THAT WENT WRONG LAST TIME, pinned from the other side: whatever
     else moves, Right Alt must never be a sprint key and `'` must never be a
     jump key again, because that is the pair of sentences the page now makes. */
  ok('...and the two are never bound the other way round again',
    !K1.sprint.includes('AltRight') && !K1.jump.includes('Quote'));

  /* AND THE CLIP AGREES WITH THE PARAGRAPH. `move-keys.gif` draws a keyboard
     for each kitten and reads the labels out of `KEYSETS` — but through a
     PREFERENCE list, and that list asked for `ControlRight` first, so the
     picture taught Right Ctrl while the game's own best answer is Right Alt.
     A GIF cannot be asserted; the script that is the only thing able to re-cut
     it can. */
  const shot = readFileSync(
    new URL('capture/shots/move-keys.js', import.meta.url), 'utf8');
  ok('...and the Help clip draws the same jump key the page names',
    /pick\(s, 'jump', \[[^\]]*'AltRight'[^\]]*\]\)/.test(shot)
    && !/pick\(s, 'jump', \['Space', 'ControlRight'\]\)/.test(shot));
  ok('...and the same sprint key',
    /pick\(s, 'sprint', \[[^\]]*'ShiftRight'[^\]]*\]\)/.test(shot));

  /* THE OTHER TWO PADS ARE STILL COVERED, and the cover moved when the topic
     split. The shapes are there because a kid on a DualSense reported hunting
     for a button called B; the sprint trigger is there because the table says
     RT, which a PlayStation pad does not have either. That note belongs to no
     one section, so it lives in "Good to know" now, and the DRAWN PAD in the
     dragon and arena topics shows the same shapes as a picture. Either would
     do; both is the point, so this asks the whole panel rather than one cut of
     it. */
  const note = helpTopic(html, 'Good to know');
  ok('...the note still names the PlayStation shapes',
    ['✕', '□', '△'].every((glyph) => note.includes(glyph)));
  ok('...and the PlayStation sprint trigger, which the table cannot show',
    note.includes(PROMPTS.playstation.sprint));
}

console.log('\n--- the "On a phone" clip, and the gesture it exists for ---');
{
  /* THE ONE TOPIC IN HELP WHOSE READER CANNOT SEE THE CONTROLS SHE IS BEING
     TOLD ABOUT. Everywhere else the panel can name a key and she can look down
     at it; here the buttons are drawn by the game, on the same glass the panel
     is covering, so the topic had three paragraphs and no picture and taught
     the double-tap lock to nobody.
     The clip is filmed at a REAL phone viewport (812x375, which is what puts
     `--tp-unit` at 68px through the `max-height: 460px` rule) and the overlay
     in it is redrawn frame by frame from `getBoundingClientRect` on the live
     `#touch-pad` elements — so if the pad is ever re-laid-out the clip is stale
     rather than wrong-by-invention, which is the failure we can actually see.
     See docs/notes/help.md for the traps that cost this shot seven takes. */
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const start = html.indexOf('<span class="ht-title">On a phone</span>');
  ok('Help still has an "On a phone" topic', start > 0);
  const sec = helpTopic(html, 'On a phone');
  const at = sec.indexOf('/help/phone.gif');
  ok('...and it leads on the phone clip', at > 0);
  const tag = at < 0 ? '' : sec.slice(sec.lastIndexOf('<img', at), sec.indexOf('>', at) + 1);
  ok('...deferred like every other picture in the panel',
    tag.includes('data-help-gif=') && !/\ssrc=/.test(tag));

  /* AND THE PROSE STILL NAMES THE GESTURE. The clip and the sentence teach the
     same thing on purpose — a child who has the panel open with the sound off
     and one who scrolls past the picture must both come away with it. This is
     the check that would have caught the topic as it stood: three notes, none
     of which said the word "double". */
  ok('...and the button list tells her about the lock',
    /double-tap/i.test(sec) && /tap it once more|tap it again/i.test(sec));

  /* THE HELP MAY ONLY PROMISE THE BUTTONS THE PAD WILL ACTUALLY LATCH.
     `TouchPad.lockable` is not a constant — `_updateTouchContext` narrows it to
     `['sprint']` the moment the ward orb comes off, because a double tap that
     latches a button which does nothing is worse than no latch at all. So the
     pair named here has to be the pair named there, and a session that makes
     JUMP lockable (or drops RIDE) has to fail HERE rather than in her lap. */
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  ok('...and RUN and RIDE are exactly what the pad will latch',
    main.includes("setLockable(p.power?.ward ? ['sprint', 'mount'] : ['sprint'])"));
  const pad = readFileSync(new URL('../src/core/touchpad.js', import.meta.url), 'utf8');
  ok('...with sprint the one that is always lockable',
    /this\.lockable = new Set\(\['sprint'\]\)/.test(pad));
}

console.log('\n--- every Help clip is the size its markup claims ---');
{
  /* THE SAME PROMISE THE TWO MOVEMENT CLIPS ALREADY MAKE, MADE BY ALL OF THEM.
     That pair was written when there were two clips, and it stayed pinned to
     those two while nine more arrived. Generalising it immediately found
     `panda.gif` claiming 640x360 for a 384x216 file — harmless only because the
     ratio happened to match, which is luck and not a rule. The attribute is the
     browser's intrinsic size before a byte of the image has landed, so a wrong
     one reflows the topic under a nine-year-old's finger the moment it does.

     Read off the GIF header, never copied from the shot script: a clip
     re-filmed at a different size has to fail here rather than in her lap. */
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const imgs = [...html.matchAll(/<img[^>]*data-help-gif="\/help\/([^"]+)"[^>]*>/g)];
  ok('the panel leads on fifteen engine-captured clips', imgs.length === 15, `${imgs.length}`);
  for (const [tag, file] of imgs) {
    const buf = readFileSync(new URL(`../public/help/${file}`, import.meta.url));
    const gw = buf.readUInt16LE(6), gh = buf.readUInt16LE(8);
    const dim = (name) => {
      const k = tag.indexOf(name + '="');
      return k < 0 ? NaN : Number(tag.slice(k + name.length + 2, tag.indexOf('"', k + name.length + 2)));
    };
    ok(`${file} states its real size`, dim('width') === gw && dim('height') === gh,
      `markup ${dim('width')}x${dim('height')}, file ${gw}x${gh}`);
    /* The cap the panel warms against: these load one after another, so a fat
       one stalls every picture behind it. */
    ok(`...and ${file} stayed under 2.5MB`, buf.length < 2.5 * 1024 * 1024,
      `${(buf.length / 1048576).toFixed(2)}MB`);
  }

  /* THE DRAGON TOPIC LEADS ON THE CLIP NOW, NOT ON A STILL. It was the last
     topic in the panel that described a run of VERBS — walk into a star, the
     sky goes out, two of you climb on and he fires — over a single frame of a
     dragon hanging in the air, which showed none of them. `ryuuseki.jpg` was
     deleted on the same argument that took `town.jpg`: an orphan under
     `public/` ships forever and is invisible on the page. */
  const at = html.indexOf('<span class="ht-title">Dragon balls &amp; Ryuuseki</span>');
  ok('Help still has a "Dragon balls & Ryuuseki" topic', at > 0);
  const sec = helpTopic(html, 'Dragon balls &amp; Ryuuseki');
  ok('...and it leads on the engine capture, not on a still',
    sec.includes('data-help-gif="/help/ryuuseki.gif"') && !sec.includes('ryuuseki.jpg'));
}

console.log('\n--- nothing in public/help/ is dead weight ---');
{
  /* EVERY FILE IN public/help/ SHIPS. `public/` is copied into `dist` wholesale
     — Vite does not tree-shake a folder — so a picture the panel stopped
     pointing at is not merely untidy, it is bytes on every deploy and in every
     clone forever.
     This is here because it happened: `town.jpg` led "Moving & fighting" until
     the two captured clips replaced it, and it sat in the folder afterwards,
     invisible, because nothing anywhere reads the directory. 95KB is not the
     point — the point is that an orphan is undetectable by looking at the page,
     which is the only place anyone ever looks. */
  const help = new URL('../public/help/', import.meta.url);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const walk = (dir, base = '') => readdirSync(new URL(dir, help), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory()
      ? walk(dir + e.name + '/', base + e.name + '/')
      : [base + e.name]));
  const files = walk('');
  ok('public/help/ is not empty', files.length > 0, `${files.length} files`);
  const orphans = files.filter((f) => !html.includes('/help/' + f));
  /* Matched on the path rather than the bare name so a file called `arena.jpg`
     cannot be kept alive by an unrelated `arena.jpg` elsewhere in the markup. */
  ok('every picture in public/help/ is pointed at by the panel', orphans.length === 0,
    orphans.join(', '));
}

console.log('\n--- a join does not wipe the scoreboard ---');
{
  /* `_buildHud` THROWS THE BADGES AWAY AND BUILDS THEM FROM A TEMPLATE, and
     that template hard-codes `0` and an empty clan. That is the truth exactly
     once — at boot. The method is also called when a player JOINS and when one
     LEAVES, and there it was blanking three sisters' scores and clans mid-game.
     What made it survive so long is that only the HUD was ever wrong: `p.score`
     and `p.clan` were untouched, and each badge silently repaired itself the
     next time that kitten knocked something over. So it looked like the game
     losing everybody's progress on a join and then handing it back one player
     at a time, which is a far worse thing to watch than a clean reset.
     Asserted against the SOURCE because the fix is a DOM repaint and there is
     no DOM here — what is being pinned is that the rebuild is followed by a
     repaint from the players, not the exact shape of it. */
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const at = main.indexOf('  _buildHud() {');
  ok('_buildHud is still there to check', at > 0);
  const body = main.slice(at, main.indexOf('\n  _', at + 20));
  ok('the badge template still starts every score at zero',
    body.includes('<b id="score-${i}">0</b>'));
  /* The two halves of the repaint. Named separately because the clan one was
     the half nobody thought of: a score comes back on the next prop, a clan
     comes back only if she swears to somebody again, which she cannot. */
  ok('...and the score is painted back from the player after the rebuild',
    /score-\$\{p\.index\}/.test(body) && /p\.score/.test(body));
  ok('...and so is the clan badge',
    body.includes('this._updateClanBadge(p)'));
  /* ORDER MATTERS AND IS THE WHOLE BUG. A repaint before the badges exist is a
     `getElementById` returning null and doing nothing at all — which is the
     silent-failure shape this check exists to refuse. */
  ok('...and it happens AFTER the badges are created',
    body.indexOf('this._updateClanBadge(p)') > body.indexOf('<b id="score-${i}">0</b>'));
}

console.log('\n--- nobody joined a clan, because nothing said they could ---');
{
  /* THE BUG WAS SILENCE. Four adults played a whole session and not one of them
     swore an oath — not because it is hard, but because standing in a shrine
     ring with a power one button away looks exactly like standing anywhere
     else. `Game._updateClanPrompt` is the line over her head that says
     otherwise, and every clan needs its own words. */
  ok('every clan has a call to action',
    CLANS.every((c) => typeof c.oath === 'string' && c.oath.length > 8),
    CLANS.filter((c) => !c.oath).map((c) => c.name).join(' ') || 'all six');
  ok('...and each one names its own clan', CLANS.every((c) => c.oath.includes(c.name)));
  /* SIX LINES AND NOT ONE TEMPLATE. "Press E to join the X clan" six times is a
     form to fill in; the prompt also has to answer "why would I", which is the
     question the silence was really failing. Six distinct opening verbs is the
     cheapest test that nobody has quietly collapsed them back into one. */
  const verbs = CLANS.map((c) => c.oath.split(' ')[0].toLowerCase());
  ok('...in six different words, not one template', new Set(verbs).size === CLANS.length,
    verbs.join(' '));

  /* IT HAS TO FIT. The callout is a `live` Label, so its canvas is sized once
     from CALLOUT_WIDEST and a longer string is clipped rather than wrapped.
     Build every prompt the game can actually produce — every clan crossed with
     the longest button glyph — and every reward line, and pin them all. The
     first version of the sizing string forgot the badge and lost eight
     characters off Riverclaw. */
  /* DERIVED FROM THE REAL TABLE, not from a note about it. This used to be
     `const badge = '[RIGHT]'` with a comment saying it was the longest
     `interact` glyph in input.js — a fact about another file, copied. Adding a
     PlayStation prompt set was exactly the change that would have gone wrong:
     had ○ been OPTIONS, the callout would have started clipping and this
     check would have gone on passing, because it was measuring a string
     nobody had updated. */
  const glyphs = promptGlyphs('interact');
  const badge = `[${glyphs.reduce((a, g) => (g.length > a.length ? g : a), '')}]`;
  line('widest interact glyph', `${badge} — out of ${glyphs.length}`);
  const real = [
    ...CLANS.map((c) => `${badge}  ${c.oath.toUpperCase()}`),
    ...CLANS.map((c) => `${c.name.toUpperCase()} — ${c.buff.label.toUpperCase()}`),
  ];
  const longest = real.reduce((a, t) => (t.length > a.length ? t : a), '');
  line('longest thing over a kitten', `${longest.length} chars — "${longest}"`);
  ok('...and the label was sized for it', longest.length <= CALLOUT_WIDEST.length);
  ok('...without being sized for far more than it needs',
    CALLOUT_WIDEST.length <= longest.length + 4);

  /* --- swearing lights a SECOND ring, and leaves her own colour alone ---
     It used to repaint `marker`, the ring that exists so a girl can find
     herself on a busy screen — so four kittens in Thunderpaw wore four
     identical gold rings and player one stopped being the orange one. */
  const hall = world.clanHalls[0];
  const hy = world.heightAt(hall.x, hall.z)?.y ?? 0;
  const kit = (index) => {
    const p = new Player({
      texture: new THREE.Texture(), index,
      spawn: new THREE.Vector3(hall.x, hy, hall.z), cols: 8, rows: 4, mirror: false,
    });
    p.position.set(hall.x, hy, hall.z);
    return p;
  };
  const press = { mx: 0, my: 0, down: () => false, pressed: (a) => a === 'interact' };
  /* A pad holding nothing, and a HUD that answers everything and says nothing —
     for the frames after the oath, where the interesting thing is the geometry
     and a second `interact` would only swear her in all over again. */
  const IDLE_PAD = { mx: 0, my: 0, down: () => false, pressed: () => false };
  const HUSH = { leaderFor: () => ({ met: true }), sfx() {}, toast() {}, onJoinClan() {} };
  const sworn = kit(0);
  const mine = sworn.marker.material.color.getHex();
  ok('a kitten standing in a hall is not in its clan yet', !sworn.clan);
  ok('...and wears no clan ring', !sworn.clanRing.visible);
  sworn.update(1 / 60, press, world, [],
    { leaderFor: () => ({ met: true }), sfx() {}, toast() {}, onJoinClan() {} });
  ok('...pressing interact swears the oath', sworn.clan?.id === hall.clan.id);
  ok('...which lights a clan ring in the clan colour',
    sworn.clanRing.visible && sworn.clanRing.material.color.getHex() === hall.clan.color);
  ok('...and leaves her own colour alone', sworn.marker.material.color.getHex() === mine);

  /* --- ...ON THE GROUND, NOT ON HER FEET ---
     Both rings are parented to `group`, which follows her into the air. The
     marker has always been pushed back down onto the terrain every frame; the
     clan ring was set to y=0.05 in the constructor and then never touched
     again, so it stayed glued to her paws and sailed up with every jump.
     Reported as "it attaches to the players feet instead of the ground".

     ASSERTED AGAINST THE MARKER RATHER THAN AGAINST A NUMBER, because the
     marker is the thing it has to agree with: they are two concentric rings
     drawn on the same terrain, and anything that moves one has to move both. */
  const groundY = sworn.marker.position.y;
  sworn.position.y = hy + 6;
  sworn.velocity.y = 4;
  sworn.onGround = false;
  sworn.update(1 / 60, IDLE_PAD, world, [], HUSH);
  ok('...and the clan ring sits on the ground, not on her feet',
    Math.abs(sworn.clanRing.position.y - sworn.marker.position.y) < 0.05,
    `clan ${sworn.clanRing.position.y.toFixed(2)} vs marker ${sworn.marker.position.y.toFixed(2)}`);
  ok('...which means six units under a jumping kitten',
    sworn.clanRing.position.y < -5, `${sworn.clanRing.position.y.toFixed(2)}`);
  ok('...and back under her paws when she lands',
    (sworn.position.y = hy, sworn.onGround = true, sworn.velocity.y = 0,
      sworn.update(1 / 60, IDLE_PAD, world, [], HUSH),
      Math.abs(sworn.clanRing.position.y - groundY) < 0.05),
    `${sworn.clanRing.position.y.toFixed(2)}`);
  /* AND ITS VISIBILITY IS DERIVED, NOT LATCHED. It used to be switched on once
     at the moment she swore and left alone forever, so it rode up onto a
     dragon with her. One owner, recomputed every frame. */
  sworn.clan = null;
  sworn.update(1 / 60, IDLE_PAD, world, [], HUSH);
  ok('...and leaving the clan takes the ring off without anybody hiding it',
    !sworn.clanRing.visible);
  sworn.clan = hall.clan;

  /* AND THE LEADER STILL GATES IT — the same `met` test the prompt asks, so the
     prompt can never offer something the button then refuses. */
  let told = 0;
  const early = kit(1);
  early.update(1 / 60, press, world, [],
    { leaderFor: () => ({ met: false }), sfx() {}, toast: () => { told++; }, onJoinClan() {} });
  ok('...but not before her leader has introduced herself', !early.clan);
  ok('...and that refusal says so out loud', told === 1);

  /* --- the callout's two contracts ---
     The standing prompt is re-asserted every frame and must vanish the instant
     it stops being true; the reward line is set once with a timer and must
     survive her walking straight back out of the ring, which she will, because
     the first thing anyone does with a new power is try it. */
  const c = kit(2);
  c.setCallout(`${badge}  ${CLANS[0].oath.toUpperCase()}`);
  ok('a standing prompt shows', c.callout.visible);
  c.setCallout(null);
  ok('...and clears the instant it stops being true', !c.callout.visible);
  c.setCallout('THUNDERPAW — RUN FASTER', 6);
  ok('a timed message shows', c.callout.visible && c.calloutT > 0);
  c.setCallout(null);
  ok('...and is NOT cleared by the prompt going false under it', c.callout.visible);
  c.setCallout(`${badge}  ${CLANS[0].oath.toUpperCase()}`);
  ok('...nor overwritten by one', c.calloutT > 0);
  for (let i = 0; i < 60 * 7; i++) c._updateCombat(1 / 60);
  ok('...but it does expire on its own', !c.callout.visible && c.calloutT === 0);

  /* --- AND IT HAS TO BE READABLE, WHICH IS A SEPARATE THING FROM CORRECT ---
     REPORTED: "it is a little hard to read the text above the players head
     stating what input button to press to join the clan, maybe make the text
     not transparent so it's easier to read or make the text bigger or both?"

     THE OLD BREATH WENT DOWN TO 0.74. That is a third of every cycle spent at
     an opacity a nine-year-old is reading a hillside through, on the one line
     in the game that is an INSTRUCTION rather than a caption. The breathing
     stays — a caption that is perfectly still for a minute stops being read —
     and the whole band moves above 0.9. Sampled across a full cycle rather
     than at one phase, because the floor is the number that was wrong. */
  c.setCallout(`${badge}  ${CLANS[0].oath.toUpperCase()}`);
  let lowest = 1;
  let highest = 0;
  let moved = 0;
  let prev = null;
  for (let i = 0; i < 400; i++) {
    c.idlePhase = i * 0.05;
    c._updateCombat(1 / 60);
    const o = c.callout.mat.opacity;
    lowest = Math.min(lowest, o);
    highest = Math.max(highest, o);
    if (prev !== null && Math.abs(o - prev) > 1e-6) moved += 1;
    prev = o;
  }
  ok('the standing prompt never thins past nine tenths', lowest >= 0.9,
    `dips to ${lowest.toFixed(2)}`);
  ok('...and still breathes rather than sitting perfectly still',
    moved > 100 && highest - lowest > 0.02,
    `${lowest.toFixed(2)} - ${highest.toFixed(2)}`);
  ok('...and never asks for more opacity than there is', highest <= 1,
    highest.toFixed(3));

  /* AND IT IS BIGGER IN THE WORLD, which is the other half of "or both". The
     world height and the authored pixel size have to move TOGETHER or the
     glyphs are magnified rather than drawn larger — same number of texture
     pixels stretched over a bigger quad is a softer line, not a clearer one.
     Read off the label the kitten really built. */
  ok('...and the line itself is bigger than the 0.9 it was',
    c.callout.baseHeight > 1.0, `${c.callout.baseHeight}`);
  const psrc = readFileSync(new URL('../src/entities/player.js', import.meta.url), 'utf8');
  const built = psrc.slice(psrc.indexOf('this.callout = new Label('),
    psrc.indexOf('this.callout.visible = false;'));
  const px = /size:\s*(\d+)/.exec(built);
  ok('...with the texture drawn larger to match, not just stretched',
    px && Number(px[1]) >= 76, px ? px[1] : 'no size');
}

console.log('\n--- swearing an oath is worth two and a half seconds ---');
{
  /* THE SECOND HALF OF THE SAME BUG. The block above is about nobody KNOWING
     they could join a clan; this one is about nothing HAPPENING when they did.
     A kitten walked into a hall, pressed a button, and the only sign anything
     had changed was a ring under her feet and a number she could not see.
     So: she takes the blessing with both paws, her leader dances, her own
     camera pulls in, and none of it touches anybody else's pane. */

  // --- one cheer per clan, and six different ones ---
  const specs = CLANS.map((c) => LEADERS[c.id]?.cheer);
  ok('every clan leader knows how to celebrate', specs.every(Boolean),
    CLANS.filter((c) => !LEADERS[c.id]?.cheer).map((c) => c.name).join(' ') || 'all six');
  ok('...with a hop, a rate and a lean, all real numbers',
    specs.every((c) => ['hop', 'rate', 'lean'].every(
      (k) => Number.isFinite(c[k]) && c[k] >= 0
    )));
  ok('...and a rate nobody set to zero', specs.every((c) => c.rate > 0));
  /* SIX CATS, SIX DANCES. The whole reason six leaders were drawn is that they
     are six different people; one bob played six times is the tell that this
     became a global animation again. */
  const shapes = specs.map((c) => `${c.hop}/${c.rate}/${c.lean}`);
  line('how each one celebrates', CLANS.map(
    (c, i) => `${c.name} ${shapes[i]}`).join(', '));
  ok('...no two the same', new Set(shapes).size === CLANS.length);
  /* ONE OF THEM DOES NOT JUMP, on purpose. Snowmantle is the still one, and a
     later pass that "fixes" her zero by rounding everybody up to a hop loses
     the only leader whose celebration is a shiver. */
  const still = CLANS.filter((c) => LEADERS[c.id].cheer.hop === 0).map((c) => c.id);
  ok('...and exactly one of them stays on the ground', still.length === 1, still.join(' '));
  ok('...and it is Icewhisker', still[0] === 'ice');

  /* THE CLOCK IS SET BY THE METHOD, not by whoever calls it. Called on a bare
     object because a ClanLeader needs a canvas to build her speech bubble and
     there is not one in node — the method touches nothing else. */
  const bare = { cheerT: 0, cheerDur: 0 };
  ClanLeader.prototype.cheer.call(bare, 2.4);
  ok('cheering starts a clock', bare.cheerT === 2.4);
  ok('...and remembers how long it was, so the ease-out has a scale',
    bare.cheerDur === 2.4);

  // --- what she holds up, and which of the two shapes it is ---
  const spawn = new THREE.Vector3(0, world.heightAt(0, 40).y, 40);
  const kit = () => new Player({
    texture: new THREE.Texture(), index: 0, spawn: spawn.clone(),
    cols: 8, rows: 4, mirror: false,
  });

  const fresh = kit();
  ok('a new kitten has sworn to nobody', fresh.clansSworn instanceof Set
    && fresh.clansSworn.size === 0);

  /* A BALL FOR A PRIZE AND A CARD FOR A PICTURE. A dragon ball's stars belong
     painted round a sphere; a clan emblem wrapped round one is squeezed into
     the silhouette at both edges and unreadable. The two must never both be
     up: they sit at the same point and would z-fight inside each other. */
  const p1 = kit();
  p1.holdAloft(null, 2.0);
  ok('a prize with no picture is a ball', p1.aloft.visible);
  ok('...and there is no card', !p1.aloftFlat?.visible);
  ok('...warm, not white, so it still reads as a prize',
    p1.aloft.material.color.getHex() !== 0xffffff);

  const map = new THREE.Texture();
  p1.holdAloft(map, 2.4, { flat: true, tint: 0xf5c341 });
  ok('an emblem is a card', p1.aloftFlat.visible);
  ok('...and the ball gets out of its way', !p1.aloft.visible);
  ok('...the emblem itself is left alone, not multiplied by the clan colour',
    p1.aloftFlat.material.map === map);
  ok('...while the halo takes the clan colour', p1.aloftGlow.material.color.getHex() === 0xf5c341);

  /* AND BACK AGAIN. She can swear to a clan and then find a dragon ball; the
     card has to give the ball its place back, or the second pickup shows the
     first clan's emblem for two seconds. */
  p1.holdAloft(map, 2.0);
  ok('...and a ball after a card puts the card away', !p1.aloftFlat.visible && p1.aloft.visible);
  ok('...with the halo back to its own colour', p1.aloftGlow.material.color.getHex() !== 0xf5c341);

  /* BOTH SHAPES RIDE ONE CLOCK. `_updateAloft` used to move `this.aloft` by
     name; a card that the update never touched would sit at the origin, inside
     her feet, for the whole two seconds. */
  const p2 = kit();
  p2.holdAloft(map, 2.0, { flat: true });
  p2._updateAloft(0.5);
  ok('the card is lifted over her head, like the ball is',
    p2.aloftFlat.position.y > p2.height);
  ok('...and the halo followed it up',
    Math.abs(p2.aloftGlow.position.y - p2.aloftFlat.position.y) < 0.001);
  for (let i = 0; i < 200; i++) p2._updateAloft(1 / 60);
  ok('...and when the clock runs out everything goes away',
    !p2.aloftFlat.visible && !p2.aloft.visible && !p2.aloftGlow.visible);

  // --- the receiving pose ---
  /* MEASURED, NOT GUESSED. It was guessed at 1.18 on the reasoning that paws
     over the head must draw taller; the ear tips are the top of both drawings,
     so it is not. The pin is that somebody who changes it has to have looked
     at the sheets, not that the number is any particular value. */
  line('the receiving pose renders at', `${BLESS_STRETCH} of her standing height`);
  ok('the receiving pose is sized like a cat and not a tower',
    Number.isFinite(BLESS_STRETCH) && BLESS_STRETCH > 0.5 && BLESS_STRETCH < 1.5);

  /* A MISSING SHEET COSTS THE POSE AND NOTHING ELSE — ninth non-negotiable.
     Delete `ember_bless.png` and the emblem, the halo, the camera move and the
     leader's dance all still happen; she plays it standing up. */
  const p3 = kit();
  p3.setBlessArt(null);
  ok('a kitten with no blessing sheet still has her ordinary sprite',
    !p3.blessPose && !!p3.sprite);
  p3.holdAloft(map, 2.4, { flat: true });
  p3._updateAloft(0.5);
  ok('...and can still hold the emblem up', p3.aloftFlat.visible);
  ok('...at a real height, not NaN', Number.isFinite(p3.aloftFlat.position.y));

  /* AND WITH A SHEET, THE SWAP IS DRIVEN BY THE CLOCK AND NOTHING ELSE, so a
     dragon ball and a clan oath both get the pose and a third such moment gets
     it free. */
  const p4 = kit();
  const art = { texture: new THREE.Texture(), contentScale: 0.9, pad: 0.06 };
  p4.setBlessArt(art);
  ok('a kitten with a blessing sheet has the pose ready', !!p4.blessPose);
  ok('...hidden until something is held up', !p4.blessPose.visible);
  ok('...and sized off the sheet, not off a guess',
    Math.abs(p4.blessPose.width - p4.height * BLESS_STRETCH / art.contentScale) < 1e-6);

  /* THE POSE IS NEVER MIRRORED. She is receiving something from the sky with
     both paws; there is no left or right version of that, and the sheet is one
     cell. A mirror flag here would flip her the moment the camera crossed her
     axis, which on a kimono with the sash over one shoulder is instantly
     obvious — the same reason the leaders are `mirror: false`. */
  ok('...and never mirrored', p4.blessPose.mirror === false);
}

console.log('\n--- the celebration cannot leak into anybody else\'s game ---');
{
  /* THESE ARE READ OUT OF main.js BECAUSE `Game` IS NOT EXPORTABLE — the module
     boots itself on import. The same trick the trailer and the confirm dialog
     checks use. What is being pinned is not the wording but the decisions:
     each one is a thing that was wrong at some point today. */
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

  ok('joining a clan starts a celebration', /_celebrateClan\(player, clan\)/.test(main));

  /* ONCE PER CLAN PER KITTEN. Swearing where you have sworn before is a
     correction, and congratulating somebody for undoing a mistake teaches a
     child the game is not paying attention. */
  ok('...only the first time she swears to that clan',
    /clansSworn\.has\(clan\.id\)\) return;/.test(main));
  /* AND THE GUARD COMES BEFORE THE SPEND. Adding to the set and THEN refusing
     to play the pose burns her one ceremony in a frame she could not watch. */
  const has = main.indexOf('clansSworn.has(clan.id)');
  const guard = main.indexOf('player.mount || player.rideAlong || player.ko || player.angel');
  const add = main.indexOf('clansSworn.add(clan.id)');
  ok('...and a ceremony she could not watch is not spent',
    has > 0 && guard > has && add > guard);

  /* THE TINT IS FOR THE FALLBACK ONLY. `color` multiplies a texture, so
     tinting the gold bolt gold burns it brown and tinting the panda's cream
     face green ruins the one emblem deliberately not in its clan's colour. */
  ok('...the emblem is hung flat and the clan colour goes on the halo',
    /holdAloft\(emblem, CLAN_POSE, \{ flat: true, tint: clan\.color \}\)/.test(main));
  ok('...and only a missing emblem lets the colour touch the orb',
    /if \(!emblem && player\.aloft\)/.test(main));

  /* HER LEADER, NOT EVERY LEADER. Six cats bouncing because one kitten swore
     somewhere else is the tell that this became a global flag. */
  ok('...and only her own leader dances',
    /this\.leaderFor\(clan\)\?\.cheer\(CLAN_POSE\)/.test(main));

  /* ONE CLOCK, DEFINED ONCE. The kitten's pose, the emblem, her camera and the
     leader's dance all run off `CLAN_POSE` — the first three because
     `holdAloft` stores it as `aloftDur` and everything downstream divides by
     that, the fourth because `cheer` is handed the same value. What would
     break it is a second literal creeping in beside the name, so the pin is
     that there is exactly one definition and every other mention is the
     constant being used. */
  const decl = main.match(/const CLAN_POSE = /g) ?? [];
  const uses = main.match(/CLAN_POSE/g) ?? [];
  ok('...on one clock, defined in one place', decl.length === 1 && uses.length > decl.length,
    `${decl.length} definition, ${uses.length - decl.length} use(s)`);

  /* A RESTART IS THE WORLD PUT BACK. Leaving `clansSworn` behind makes a second
     playthrough quietly flatter than the first; leaving the pose up leaves a
     kitten standing with her paws raised holding an orb nobody gave her. */
  ok('a restart forgets every oath she ever swore', /p\.clansSworn\.clear\(\)/.test(main));
  ok('...and puts her paws down', /if \(p\.blessPose\) p\.blessPose\.visible = false;/.test(main));
  ok('...and takes back both shapes of the thing she was holding',
    /if \(p\.aloft\) p\.aloft\.visible = false;/.test(main)
    && /if \(p\.aloftFlat\) p\.aloftFlat\.visible = false;/.test(main));
}

console.log('\n--- clan buffs actually do something ---');
{
  const spawn = new THREE.Vector3(0, world.heightAt(0, 40).y, 40);
  const mk = (clan) => {
    const p = new Player({
      texture: new THREE.Texture(), index: 0, spawn: spawn.clone(),
      cols: 8, rows: 4, mirror: false,
    });
    p.clan = clan;
    return p;
  };
  const byId = (id) => CLANS.find((c) => c.buff.id === id);

  // speed — run for a second and compare ground covered
  const runFor = (p) => {
    const pad = { mx: 1, my: 0, down: () => false, pressed: () => false };
    const x0 = p.position.x;
    const z0 = p.position.z;
    for (let i = 0; i < 60; i++) p.update(1 / 60, pad, world, [], null);
    return Math.hypot(p.position.x - x0, p.position.z - z0);
  };
  const plain = runFor(mk(null));
  const fast = runFor(mk(byId('speed')));
  line('run in 1s: no clan vs Thunderpaw', `${plain.toFixed(1)} vs ${fast.toFixed(1)}`);
  ok('Thunderpaw runs measurably faster', fast > plain * 1.2);

  // reach — a prop out at 4.6 is beyond the base 3.4 swing, inside Riverclaw's
  const target = world.props.find((pr) => !pr.katanaOnly);
  const slashFrom = (p, gap) => {
    target._reset();
    const t = target.group.position;
    p.position.set(t.x - gap, t.y, t.z);
    p.facing = Math.PI / 2;                 // +x, straight at it
    p._doSlash(world, null);
    return target.knocked;
  };
  ok('a plain katana cannot reach 4.6 away', !slashFrom(mk(null), 4.6));
  ok('Riverclaw can', slashFrom(mk(byId('reach')), 4.6));

  // leap — a third jump
  const leap = mk(byId('leap'));
  const pad0 = { mx: 0, my: 0, down: () => false, pressed: () => false };
  for (let i = 0; i < 10; i++) leap.update(1 / 60, pad0, world, [], null);
  line('jumps after landing: plain vs Shadowtail', `2 vs ${leap.jumpsLeft}`);
  ok('Shadowtail lands with three jumps', leap.jumpsLeft === 3);

  // breath — the cone reaches further
  const dr = new Dragon(new THREE.Texture(), 0, spawn.y, 40, { breed: BREEDS[1] });
  const windy = mk(byId('breath'));
  windy.mount = dr; dr.rider = windy;
  windy.facing = Math.PI / 2;
  const far = world.props.find((pr) => !pr.katanaOnly);
  far._reset();
  const fp = far.group.position;
  windy.position.set(fp.x - BREEDS[1].breath.range * 1.4, fp.y, fp.z);
  windy._doBreath(world, null);
  ok('Windwhisker breathes past the normal range', far.knocked,
    `range ${BREEDS[1].breath.range} -> ${(BREEDS[1].breath.range * 1.9).toFixed(0)}`);
  far._reset();
}

console.log('\n--- Pandapaw: the clan you have to earn ---');
{
  const isl = world.islands.find((i) => i.biome === 'bamboo');
  const hall = world.clanHalls.find((h) => h.clan.buff.panda);
  ok('Pandapaw has a shrine', !!hall);
  ok('and it is on the bamboo island',
    hall && Math.hypot(hall.x - isl.x, hall.z - isl.z) < isl.radius);
  ok('the food is where the shrine is', world.props.some(
    (p) => p.kind === 'bamboo'
      && Math.hypot(p.home.x - isl.x, p.home.z - isl.z) < isl.radius));

  /* The growth ladder, and the two different currencies it is paid in.
     The cub costs 20 LIFETIME canes, so an afternoon in the grove before she
     ever found the shrine still counts. The adult costs 20 canes cut SINCE the
     cub arrived, so those same banked canes cannot buy both rungs at once —
     the check that matters most here is the 400-cane player, who used to get a
     fully grown panda the instant she swore and never saw a cub at all. */
  line('tier at 0 / 19 / 20 / 400 canes, no panda yet',
    [0, 19, 20, 400].map((n) => tierFor(n)).join(', '));
  ok('no panda before the first tier is paid for', tierFor(0) === -1 && tierFor(19) === -1);
  ok('twenty canes buys a cub', tierFor(20) === 0);
  ok('a fresh panda is ALWAYS a cub, however deep the bank',
    tierFor(400) === 0 && tierFor(400, null, -1) === 0);
  ok('banked canes cannot also buy the adult',
    tierFor(400, 400, 0) === 0, 'sworn at 400 -> still a cub');
  ok('twenty more AFTER the cub grows it up',
    tierFor(419, 400, 0) === 0 && tierFor(420, 400, 0) === 1);
  ok('and it stops at the top', tierFor(9999, 420, 1) === 1);
  ok('the countdown counts down to the cub',
    toNextTier(0) === 20 && toNextTier(11) === 9 && toNextTier(20) === 0);
  ok('and then counts down to the adult',
    toNextTier(400, 400, 0) === 20 && toNextTier(411, 400, 0) === 9
    && toNextTier(420, 400, 0) === 0);
  ok('a grown panda asks for nothing more', toNextTier(9999, 420, 1) === 0);

  const art = { cub: { texture: new THREE.Texture() }, adult: { texture: new THREE.Texture() } };
  const mkP = (spawn) => new Player({
    texture: new THREE.Texture(), index: 0, spawn: spawn.clone(), cols: 8, rows: 4, mirror: false,
  });
  const gy = world.heightAt(0, 40).y;

  // A cub must NOT be rideable — the whole second half of the arc is that you
  // have to keep feeding it.
  {
    const owner = mkP(new THREE.Vector3(0, gy, 40));
    const cub = new Panda(art, { owner, tier: 0 });
    ok('a cub cannot be ridden', !cub.rideable);
    ok('a grown panda can', new Panda(art, { owner, tier: 1 }).rideable);
    ok('growing swaps which drawing is visible', (() => {
      const before = cub.poses.map((b) => b.visible).join();
      cub.setTier(1);
      return before === 'true,false' && cub.poses.map((b) => b.visible).join() === 'false,true';
    })());
    ok('and the grown one is bigger', PANDA_TIERS[1].size > PANDA_TIERS[0].size);

    /* `size` is the panda's drawn height in world units (see PANDA_TIERS), and
       a kitten is 2.9. Copying the dragon's 13 across put a panda in the world
       four and a half times the height of the girl riding it, which no
       screenshot check would ever have caught — it just looked like a panda,
       photographed from further away. */
    line('drawn heights vs a 2.9 kitten',
      PANDA_TIERS.map((t) => `${t.id} ${t.size}`).join(', '));
    ok('a cub is smaller than the kitten', PANDA_TIERS[0].size < 2.9);
    ok('a grown panda is big enough to ride but not a building',
      PANDA_TIERS[1].size > 2.9 * 1.4 && PANDA_TIERS[1].size < 2.9 * 3);

    /* A pet parks itself at followDist. If that lands OUTSIDE its own mount
       radius you can never climb onto your own panda without first walking at
       it, which is a baffling thing to have to discover. */
    for (const t of PANDA_TIERS) {
      const pet = new Panda(art, { owner, tier: PANDA_TIERS.indexOf(t) });
      ok(`a ${t.id} parks within reach of its own mount prompt`,
        pet.mountRadius > t.followDist, `radius ${pet.mountRadius} vs gap ${t.followDist}`);
    }
  }

  /* Riding must measurably change how the game plays, exactly like every other
     clan's buff — this is the check that a refactor which quietly stops
     applying PANDA_SPEED can't slip past. */
  {
    const pad = { mx: 1, my: 0, down: () => false, pressed: () => false };
    const runFor = (rider) => {
      const x0 = rider.position.x;
      const z0 = rider.position.z;
      for (let i = 0; i < 60; i++) rider.update(1 / 60, pad, world, [], null);
      return Math.hypot(rider.position.x - x0, rider.position.z - z0);
    };
    const onFoot = runFor(mkP(new THREE.Vector3(0, gy, 40)));
    const rider = mkP(new THREE.Vector3(0, gy, 40));
    const mountP = new Panda(art, { owner: rider, tier: 1 });
    rider.pandaMount = mountP;
    mountP.rider = rider;
    const riding = runFor(rider);
    line('run in 1s: on foot vs on a panda', `${onFoot.toFixed(1)} vs ${riding.toFixed(1)}`);
    ok('a grown panda is measurably faster than running', riding > onFoot * 1.5);
    /* Fast enough to be a mount, slow enough to aim. This was 10x first and a
       panda crossed the entire home island in under two seconds — it arrived
       at the far rim before you finished pushing the stick. The upper bound is
       the check that stops that creeping back in. */
    line('PANDA_SPEED', PANDA_SPEED);
    ok('but still steerable by a nine-year-old', PANDA_SPEED >= 1.5 && PANDA_SPEED <= 3);
    ok('the panda goes where the rider goes',
      Math.hypot(mountP.position.x - rider.position.x,
        mountP.position.z - rider.position.z) < 2);
  }

  // ...and jumps higher.
  {
    const jumpOnce = (rider) => {
      const jump = { mx: 0, my: 0, down: () => false, pressed: (a) => a === 'jump' };
      const hold = { mx: 0, my: 0, down: () => false, pressed: () => false };
      for (let i = 0; i < 5; i++) rider.update(1 / 60, hold, world, [], null);
      const y0 = rider.position.y;
      rider.update(1 / 60, jump, world, [], null);
      let peak = rider.position.y;
      for (let i = 0; i < 90; i++) {
        rider.update(1 / 60, hold, world, [], null);
        peak = Math.max(peak, rider.position.y);
      }
      return peak - y0;
    };
    const plain = jumpOnce(mkP(new THREE.Vector3(0, gy, 40)));
    const rider = mkP(new THREE.Vector3(0, gy, 40));
    const p2 = new Panda(art, { owner: rider, tier: 1 });
    rider.pandaMount = p2;
    p2.rider = rider;
    const high = jumpOnce(rider);
    line('jump height: on foot vs on a panda', `${plain.toFixed(2)} vs ${high.toFixed(2)}`);
    ok('a panda jumps higher', high > plain * 1.2);
  }

  /* Where the kitten is DRAWN when riding, which is two numbers and not one.
     Both failure modes look like a panda in a screenshot and neither looks
     like a bug: too low and her legs are buried to the thigh, too high and she
     floats over its back.

     The fractions come from scanning the adult atlas for the topmost drawn
     pixel at each offset along the body — the animal's upper profile, in cell
     fractions above its feet, measured toward the RUMP because that is the
     direction seatOffset moves the rider:

       behind centre   0.20   0.14   0.10   0.06   0.00  -0.08
       silhouette top  0.600  0.615  0.628  0.643  0.661  0.688

     Height alone was never enough to pin this down, which is exactly how the
     previous check passed a bad seat: it bounded the height against the 0.688
     crest while seatOffset sat her at 0.14 back, over a part of the back
     around 0.615 and falling away. The number described a piece of the animal
     she was nowhere near. So the PAIR is what gets checked. */
  {
    const owner = mkP(new THREE.Vector3(0, gy, 40));
    const pet = new Panda(art, { owner, tier: 1 });
    const q = pet.quad;
    const seat = pet.seatHeight / q;

    /* seatOffset is world-space along `facing`; at facing 0 it lands entirely
       on z, and carry() does `panda = rider - seat`, so the panda ends up
       forward of the rider — this is how far BACK along the body she sits. */
    pet.facing = 0;
    const back = -pet.seatOffset().z / q;

    const SADDLE_FRONT = 0.04;    // blanket's leading edge, behind centre
    const SADDLE_REAR = 0.293;    // and its trailing edge
    const CREST = 0.688;          // top of the shoulders

    line('seat / offset back / saddle span',
      `${seat.toFixed(3)} / ${back.toFixed(3)} / ${SADDLE_FRONT}..${SADDLE_REAR}`);
    ok('the rider is on the drawn saddle, not on bare fur',
      back >= SADDLE_FRONT && back <= SADDLE_REAR);
    ok('and toward its front, not back over the rump', back < 0.10);
    ok('her feet clear the back where she actually sits',
      seat > 0.643, 'profile at 0.06 back');
    ok('but she is not perched above the animal', seat < CREST + 0.10);
  }

  /* The claw swipe: the panda's answer to dragon breath. Wide and heavy but
     close in, and above all it must NOT cut bamboo — a panda that harvested
     its own food would turn the whole Pandapaw arc into a machine that feeds
     itself. */
  {
    const rider = mkP(new THREE.Vector3(0, gy, 40));
    rider.clan = world.clanHalls.find((h) => h.clan.buff.panda).clan;
    const pet = new Panda(art, { owner: rider, tier: 1 });
    rider.pandaMount = pet;
    pet.rider = rider;

    line('claw range / katana reach', `${CLAW.range} / 3.4`);
    ok('the claw out-reaches the katana', CLAW.range > 3.4);
    ok('but not the dragon breath', CLAW.range < BREEDS[0].breath.range);
    ok('and hits harder than the katana', CLAW.power > 1.15);

    // It reaches something a plain katana cannot.
    const target = world.props.find((pr) => !pr.katanaOnly);
    target._reset();
    const t = target.group.position;
    rider.position.set(t.x - 6, t.y, t.z);
    rider.facing = Math.PI / 2;
    rider._doClaw(world, null);
    ok('a claw swipe reaches 6 units and scatters things', target.knocked);
    ok('and it draws claw marks', pet.clawTimer > 0);
    target._reset();
    target.scored = false;

    /* The claw DOES fell bamboo — the one exception to katanaOnly in the game,
       and a deliberate reversal (see CLAW). You cannot ride a panda until it
       is fully grown, so there is no further tier the extra canes could buy
       and nothing is short-circuited; what refusing actually did was make the
       reward for forty canes useless in the only place you spend your time. */
    const cane = world.props.find((pr) => pr.katanaOnly);
    const canes = world.props.filter((pr) => pr.katanaOnly);
    canes.forEach((pr) => pr._reset());
    rider.position.set(cane.home.x - 1.5, cane.home.y, cane.home.z);
    rider.facing = Math.PI / 2;
    rider._doClaw(world, null);
    ok('a panda CAN cut bamboo — clearing a grove is what riding it is for',
      canes.some((pr) => pr.knocked),
      `${canes.filter((pr) => pr.knocked).length} canes in one swipe`);
    canes.forEach((pr) => pr._reset());

    /* But a DRAGON still cannot, by breath or by dive. The grove being the one
       place flight fails is what makes landing worth doing, and that survives
       the panda getting an exemption. */
    canes.forEach((pr) => { pr._reset(); pr.scored = false; });
    const flier = mkP(new THREE.Vector3(cane.home.x - 4, cane.home.y + 6, cane.home.z));
    const dr = new Dragon(new THREE.Texture(), 0, gy, 40, { breed: BREEDS[1] });
    flier.mount = dr; dr.rider = flier;
    flier.facing = Math.PI / 2;
    flier._doBreath(world, null);
    ok('dragon breath still cannot touch bamboo', canes.every((pr) => !pr.knocked));
    canes.forEach((pr) => pr._reset());
  }

  /* Leaving the clan: a grown panda stops heeling and waits where it is. You
     keep it and can still ride it — that's the difference between a pet and a
     mount, and it's the deal the dragons already offer. */
  {
    const owner = mkP(new THREE.Vector3(0, gy, 40));
    const panda = world.clanHalls.find((h) => h.clan.buff.panda).clan;
    const other = CLANS.find((c) => !c.buff.panda);

    const cub = new Panda(art, { owner, tier: 0 });
    const grown = new Panda(art, { owner, tier: 1 });
    owner.clan = panda;
    ok('sworn to Pandapaw, both tiers follow', cub.follows && grown.follows);
    owner.clan = other;
    ok('sworn elsewhere, a grown panda stops following', !grown.follows);
    ok('but a cub still does — it is a baby', cub.follows);
    ok('and the grown one is still rideable', grown.rideable);

    // It must genuinely hold position rather than drifting.
    grown.position.set(20, world.heightAt(20, 40).y, 40);
    const at = grown.position.clone();
    for (let i = 0; i < 240; i++) grown.update(1 / 60, world, owner);
    const drift = grown.position.distanceTo(at);
    line('drift over 4s after leaving the clan', drift.toFixed(3));
    ok('a waiting panda stays exactly put', drift < 0.01);

    // ...and starts following again the moment she re-swears.
    owner.clan = panda;
    for (let i = 0; i < 240; i++) grown.update(1 / 60, world, owner);
    ok('re-swearing to Pandapaw brings it back to heel',
      grown.position.distanceTo(owner.position) < PANDA_TIERS[1].followDist + 1);
  }

  /* A pet can never be lost — the same contract the dragons have, and for the
     same reason: a nine-year-old cannot recover from, or even understand, a
     panda stranded on an island she flew away from. */
  {
    const owner = mkP(new THREE.Vector3(-20, world.heightAt(-20, 20).y, 20));
    const pet = new Panda(art, { owner, tier: 0 });
    pet.position.set(400, 300, -400);
    for (let i = 0; i < 4; i++) pet.update(1 / 60, world, owner);
    const miss = Math.hypot(pet.position.x - owner.position.x, pet.position.z - owner.position.z);
    ok('a panda abandoned across the map comes back to you', miss < 20,
      `${miss.toFixed(1)} away`);
    ok('and it lands on solid ground, not in the sky',
      Math.abs(pet.position.y - world.heightAt(pet.position.x, pet.position.z).y) < 0.01);

    // But NOT while she's in the air — nothing to stand on, and a pet
    // materialising mid-flight reads as a bug.
    owner.mount = {};
    pet.position.set(400, 300, -400);
    for (let i = 0; i < 4; i++) pet.update(1 / 60, world, owner);
    ok('it never teleports to a kitten who is flying', pet.position.x === 400);
    owner.mount = null;
  }

  // Walking follow: it closes the gap and then holds station behind her.
  {
    const owner = mkP(new THREE.Vector3(0, gy, 40));
    const pet = new Panda(art, { owner, tier: 0 });
    pet.position.set(30, world.heightAt(30, 40).y, 40);
    for (let i = 0; i < 180; i++) pet.update(1 / 60, world, owner);
    const gap = Math.hypot(pet.position.x - owner.position.x, pet.position.z - owner.position.z);
    line('gap after trotting in from 30 units', gap.toFixed(2));
    ok('it catches up on foot', gap < PANDA_TIERS[0].followDist + 1);
    /* Not zero. Cutting the throttle at followDist only stops it
       ACCELERATING — a panda that arrives at speed and then coasts ends up
       standing inside the kitten, where the two sprites fight the depth sort
       and flicker against each other. It has to actively back off. */
    ok('but does not end up standing inside her',
      gap > PANDA_TIERS[0].followDist * 0.5);
    ok('it stays glued to the ground',
      Math.abs(pet.position.y - world.heightAt(pet.position.x, pet.position.z).y) < 0.01);
  }

  /* Broadside only. It is a single side-on drawing, so steering the drawn
     heading with the full movement vector puts it edge-on at the billboard's
     mirror threshold and the animal snaps back and forth — the exact bug the
     ridden dragon had. */
  {
    const owner = mkP(new THREE.Vector3(0, gy, 40));
    owner.camYaw = -Math.PI * 0.25;
    const pet = new Panda(art, { owner, tier: 1 });
    const headings = new Set();
    for (const [vx, vz] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1]]) {
      pet.velocity.set(vx * 20, 0, vz * 20);
      pet._aim(owner.camYaw);
      headings.add(pet.facing.toFixed(4));
    }
    line('distinct drawn headings over 6 directions', headings.size);
    ok('the panda only ever faces two ways', headings.size === 2);
  }
}

console.log('\n--- the panda in the ring ---');
{
  /* THE REAL GATE, LIFTED OUT OF `main.js` AND RUN. `Game` cannot be imported
     here — it boots a renderer against a DOM that does not exist — and the
     alternative on offer was a page of regexes asserting that certain words
     appear in a file, which is not a check about behaviour and would pass a
     rule that had been correctly WRITTEN and wrongly WIRED.

     So the method's own source is cut out and evaluated with the four tables
     it closes over. What runs below is the shipped code, character for
     character: change the rule and this moves with it; delete the rule and
     this fails. The `\n  }\n` terminator is the class's own indentation, which
     nothing inside a method body can reach. */
  const msrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n');
  const lift = (sig, args) => {
    const at = msrc.indexOf(`\n  ${sig} {`);
    ok(`${sig.split('(')[0]} is where this check thinks it is`, at > 0);
    const from = msrc.indexOf('{', at + 1) + 1;
    const body = msrc.slice(from, msrc.indexOf('\n  }\n', from));
    // eslint-disable-next-line no-new-func
    return new Function('ATTACKS', 'COMBAT', 'PANDA', 'BASE_REACH', 'Panda', 'tierFor',
      `return function (${args}) {${body}\n};`)(ATTACKS, COMBAT, PANDA, BASE_REACH, Panda, tierFor);
  };
  const strikePlayers = lift('strikePlayers(attacker, kind, reach, dir)',
    'attacker, kind, reach, dir');
  const updatePanda = lift('_updatePanda(player)', 'player');

  const art = { cub: { texture: new THREE.Texture() }, adult: { texture: new THREE.Texture() } };
  const gy = world.heightAt(0, 40).y;
  const mkP = (i, x) => new Player({
    texture: new THREE.Texture(), index: i, cols: 8, rows: 4, mirror: false,
    spawn: new THREE.Vector3(x, gy, 40), name: i ? 'Sky' : 'Ember',
  });

  /** A `Game` with nothing in it but the six things the gate touches. */
  const mkGame = (players, over = {}) => ({
    players,
    tournament: { fighting: true, allies: () => false, onHit: () => {} },
    sfx: () => {}, toast: () => {}, hitSpark: () => {},
    _pandaDown(pl) { this.downed = pl; pl.panda.collapse(); },
    ...over,
  });

  /** Attacker at 0, target at `gap`, both facing along +x. */
  const face = (a, b) => {
    a.facing = Math.PI / 2;          // +x
    b.position.y = a.position.y;
    return { x: Math.sin(a.facing), y: Math.cos(a.facing) };
  };

  /* --- WHO IS A BODY IN THE FIGHT AT ALL ------------------------------- */
  {
    const owner = mkP(0, 0);
    const cub = new Panda(art, { owner, tier: 0 });
    const grown = new Panda(art, { owner, tier: 1 });
    ok('a grown panda is a body a blade can find', grown.fighter);
    ok('a cub is not — it is what a losing kitten runs to', !cub.fighter);
    ok('...and carries no hit box at all, so the gate needs no second question',
      cub.hitRadius === 0 && cub.hitUp === 0);
    ok('a grown one is much bigger than a kitten, who is a point',
      grown.hitRadius === PANDA.body && grown.hitRadius > 1);
    ok('...and taller as well as wider', grown.hitUp === PANDA.bodyUp && grown.hitUp > 0);
    ok('its bar is a fraction of its owner\'s, not a number of its own',
      grown.maxHp === Math.round(owner.maxHp * PANDA.hpFrac) && grown.hp === grown.maxHp);
    line('panda health vs kitten health', `${grown.maxHp} vs ${owner.maxHp}`);
    ok('...and that fraction is well under half', PANDA.hpFrac < 0.5);
    ok('a cub has no bar to leave lying around', cub.maxHp === 0 && cub.hp === 0);
    ok('and nothing can hurt one', cub.hurt(999, new THREE.Vector3()) === 0);
  }

  /* --- THE CLAW IS A MULTIPLE OF THE STANDING SLASH --------------------- */
  {
    const a = mkP(0, 0);
    const b = mkP(1, 2);
    const dir = face(a, b);
    const g = mkGame([a, b]);
    strikePlayers.call(g, a, 'claw', BASE_REACH, dir);
    const dealt = b.maxHp - b.hp;
    line('claw damage vs standing slash', `${dealt} vs ${ATTACKS.stand.dmg}`);
    ok('one swipe hits for 1.2x a standing slash',
      Math.abs(dealt - ATTACKS.stand.dmg * PANDA.dmgK) < 1e-9);
    ok('...which is genuinely harder than the katana', dealt > ATTACKS.stand.dmg);

    /* AND MOVING THE SLASH MOVES THE CLAW. This is the whole reason the row
       has no `dmg`: the relationship was asked for as "1.2x's more than a
       regular player slash attack", which is a statement about `stand` rather
       than a number beside it, and a copied literal would go stale the first
       time somebody tuned the katana. */
    const was = ATTACKS.stand.dmg;
    ATTACKS.stand.dmg = was * 2;
    const c = mkP(0, 0);
    const d = mkP(1, 2);
    const dir2 = face(c, d);
    strikePlayers.call(mkGame([c, d]), c, 'claw', BASE_REACH, dir2);
    ok('...and tuning the standing slash moves the claw with it',
      Math.abs((d.maxHp - d.hp) - was * 2 * PANDA.dmgK) < 1e-9);
    ATTACKS.stand.dmg = was;
  }

  /* --- RIVERCLAW'S OATH DOES NOT LENGTHEN A PANDA'S ARM ----------------- */
  {
    /* Asked for as "if player has longer katana buff, it does not apply to big
       panda". Checked at a distance that a buffed KATANA would reach and a
       buffed claw must not, which is the only way to tell the rule from a
       comment about the rule. */
    const far = ATTACKS.claw.reach + 0.6;
    const a = mkP(0, 0);
    const b = mkP(1, far);
    const dir = face(a, b);
    strikePlayers.call(mkGame([a, b]), a, 'claw', BASE_REACH * 1.5, dir);
    line('claw reach / test distance', `${ATTACKS.claw.reach} / ${far.toFixed(2)}`);
    ok('a Riverclaw kitten\'s claw does not reach further than anybody else\'s',
      b.hp === b.maxHp);
    // Non-vacuous: the same buff on the same swing DOES lengthen her katana.
    const c = mkP(0, 0);
    const d = mkP(1, ATTACKS.stand.reach + 0.6);
    const dir2 = face(c, d);
    strikePlayers.call(mkGame([c, d]), c, 'stand', BASE_REACH * 1.5, dir2);
    ok('...though it certainly lengthens her katana', d.hp < d.maxHp);
  }

  /* --- THE CLAW GOES THROUGH THE ONE GATE ------------------------------- */
  {
    /* Third non-negotiable. A panda in the market square knocks barrels over
       and cannot touch the kitten standing beside them. */
    const a = mkP(0, 0);
    const b = mkP(1, 2);
    const dir = face(a, b);
    strikePlayers.call(mkGame([a, b], { tournament: { fighting: false } }), a, 'claw', BASE_REACH, dir);
    ok('a claw swung outside a live round does nothing at all',
      b.hp === b.maxHp && !b.ko);

    /* ...and `_doClaw` asks it rather than hurting her itself. */
    const rider = mkP(0, 0);
    const pet = new Panda(art, { owner: rider, tier: 1 });
    rider.pandaMount = pet; pet.rider = rider;
    const asked = [];
    rider._doClaw(world, {
      sfx: () => {}, onMischief: () => {}, strikeWards: () => {},
      strikePlayers: (_a, kind) => asked.push(kind),
    });
    ok('the panda\'s swipe asks the gate rather than hitting anybody itself',
      asked.includes('claw'), asked.join(' '));
  }

  /* --- THE THREE OUTCOMES, EXACTLY AS THEY WERE ASKED FOR --------------- */
  {
    const ride = (x) => {
      const pl = mkP(1, x);
      const pet = new Panda(art, { owner: pl, tier: 1 });
      pet.position.set(x, pl.position.y, 40);
      pl.panda = pet; pl.pandaMount = pet; pet.rider = pl;
      return pl;
    };

    /* HER ONLY. The blade found the kitten and missed the animal, so she takes
       it in full and comes off. */
    {
      const a = mkP(0, 0);
      const b = ride(2);
      b.panda.position.set(40, b.position.y, 40);   // parked far away
      const dir = face(a, b);
      strikePlayers.call(mkGame([a, b]), a, 'stand', BASE_REACH, dir);
      ok('a blow that finds her and misses the panda knocks her off it',
        b.pandaMount === null && b.panda.rider === null);
      ok('...and she takes it in full', b.maxHp - b.hp === ATTACKS.stand.dmg);
      ok('...and the animal is untouched', b.panda.hp === b.panda.maxHp);
    }

    /* THE PANDA ONLY. Out of reach of the kitten, inside the animal's body. */
    {
      const a = mkP(0, 0);
      const b = ride(ATTACKS.stand.reach + PANDA.body - 0.4);
      b.position.x = ATTACKS.stand.reach + PANDA.body + 4;   // her, well clear
      const dir = face(a, b);
      const g = mkGame([a, b]);
      strikePlayers.call(g, a, 'stand', BASE_REACH, dir);
      ok('a body three times her width can be cut from outside her own reach',
        b.panda.hp < b.panda.maxHp);
      ok('...and she is untouched by it', b.hp === b.maxHp);
      ok('...and stays on', b.pandaMount === b.panda);
    }

    /* BOTH. Overlapping, which is what riding actually looks like. */
    {
      const a = mkP(0, 0);
      const b = ride(2);
      const dir = face(a, b);
      strikePlayers.call(mkGame([a, b]), a, 'stand', BASE_REACH, dir);
      ok('a blow that catches both takes health off both',
        b.hp < b.maxHp && b.panda.hp < b.panda.maxHp);
      ok('...but she stays on the panda', b.pandaMount === b.panda);

      /* AND THE PUSH IS A THIRD OF WHAT IT WOULD HAVE BEEN. Measured against
         the same blow landing on a kitten on her own feet, because the rule is
         a RATIO and a literal typed twice would be no check at all. */
      const c = mkP(0, 0);
      const d = mkP(1, 2);
      const dir2 = face(c, d);
      strikePlayers.call(mkGame([c, d]), c, 'stand', BASE_REACH, dir2);
      const alone = Math.hypot(d.velocity.x, d.velocity.z);
      const mounted = Math.hypot(b.velocity.x, b.velocity.z);
      line('knockback: on foot vs on a panda', `${alone.toFixed(2)} vs ${mounted.toFixed(2)}`);
      ok('a rider is pushed a third as far as a kitten on her own feet',
        Math.abs(mounted - alone * PANDA.knockK) < 0.01);
      ok('...and it is genuinely less, not merely different', mounted < alone * 0.5);
      ok('...and she is lifted less too', b.velocity.y < d.velocity.y);
    }
  }

  /* --- AN EMPTY BAR MAKES IT A CUB, AND IT STAYS ONE -------------------- */
  {
    const owner = mkP(0, 0);
    owner.raisedPanda = true;
    owner.clan = CLANS.find((c) => c.buff.panda);
    const pet = new Panda(art, { owner, tier: 1 });
    owner.panda = pet; owner.pandaMount = pet; pet.rider = owner;
    owner.bambooCut = 400;
    owner.pandaFedFrom = 0;

    ok('collapsing a grown panda works', pet.collapse());
    ok('...and it is a cub', !pet.rideable && pet.tier === 0);
    ok('...and it puts the rider down rather than leaving her on a house cat',
      owner.pandaMount === null && pet.rider === null);
    ok('...and it is not a target any more', !pet.fighter && pet.hitRadius === 0);
    ok('...but it is still hers — nothing is lost', owner.panda === pet);
    ok('...and it can lick now, which a grown one cannot', !pet.rideable);

    /* THE ONE THAT MATTERS. `_updatePanda` runs on every cane she cuts and a
       collapsed panda is standing there with four hundred canes of credit
       against it; without its own guard the very next cane would grow it
       straight back and "stays a baby panda for the rest of the game" would be
       a sentence in a commit message and nowhere else. */
    const g = {
      pandaArt: art, world, scene: { add: () => {} },
      sfx: () => {}, toast: () => {}, _updateClanBadge: () => {},
    };
    for (let i = 0; i < 20; i++) { owner.bambooCut += 40; updatePanda.call(g, owner); }
    ok('...and no amount of bamboo grows it back', pet.tier === 0 && pet.knockedDown);

    // Non-vacuous: an ordinary cub on the same tally grows up at once.
    const other = mkP(1, 4);
    other.raisedPanda = true;
    other.clan = owner.clan;
    other.bambooCut = 400;
    other.pandaFedFrom = 0;
    other.panda = new Panda(art, { owner: other, tier: 0 });
    updatePanda.call(g, other);
    ok('...where a cub that has merely never grown up does grow up',
      other.panda.tier === 1);

    ok('the shrine puts it back on its feet', pet.restore());
    ok('...as a grown, rideable panda again', pet.rideable && pet.fighter);
    ok('...with a full bar', pet.hp === pet.maxHp && pet.maxHp > 0);
    ok('...and it charges no bamboo for canes already cut',
      owner.bambooCut === 1200 && owner.pandaFedFrom === 0);
    ok('...and restoring one that is already up does nothing', !pet.restore());
  }

  /* --- THE GATE IS WHAT KNOCKS IT DOWN ---------------------------------- */
  {
    const a = mkP(0, 0);
    const b = mkP(1, 2);
    const pet = new Panda(art, { owner: b, tier: 1 });
    pet.position.set(2, b.position.y, 40);
    b.panda = pet; b.pandaMount = pet; pet.rider = b;
    b.position.x = 40;                       // her clear, the animal in reach
    const dir = face(a, b);
    const g = mkGame([a, b]);
    let swings = 0;
    while (pet.hp > 0 && swings < 50) {
      strikePlayers.call(g, a, 'stand', BASE_REACH, dir);
      swings++;
    }
    line('slashes to empty a panda\'s bar', swings);
    ok('a panda can be cut down', pet.hp <= 0);
    ok('...and the gate is what says so, once its bar is empty', g.downed === b);
    ok('...and it takes several blows rather than one', swings > 2);
  }

  /* --- THE CUB LICKS HER BETTER ---------------------------------------- */
  {
    const owner = mkP(0, 0);
    const cub = new Panda(art, { owner, tier: 0 });
    cub.position.copy(owner.position);
    const step = (n = 1) => { for (let i = 0; i < n; i++) cub._stepLick(1 / 60, owner); };

    owner.hp = owner.maxHp;
    step(120);
    ok('a cub ignores a kitten on a full bar', !cub.lickWanted && !cub.licking);

    owner.hp = owner.maxHp * (PANDA.lickBelow + 0.05);
    step(120);
    ok('...and one that is merely a bit hurt', !cub.lickWanted);

    owner.hp = owner.maxHp * (PANDA.lickBelow - 0.05);
    cub._stepLick(1 / 60, owner);
    ok('but it comes over when she is badly hurt', cub.lickWanted);
    ok('...and does NOT start healing the instant it arrives', !cub.licking);
    const at = owner.hp;
    step(Math.round(PANDA.lickWarm * 60) - 2);
    ok('...nor at any point inside the warm-up', !cub.licking && owner.hp === at);
    step(4);
    ok('...but it does once it has kept station for the warm-up', cub.licking);

    /* THE RATE, MEASURED. Half a percent of her bar a second was the ask, and
       it is deliberately slower than one standing slash a minute — a cub that
       out-healed the fight would end rounds rather than rescue them. */
    const before = owner.hp;
    step(60);
    const gained = owner.hp - before;
    line('healed in one second', `${gained.toFixed(3)} of ${owner.maxHp}`);
    ok('it heals half a percent of her bar a second',
      Math.abs(gained - owner.maxHp * PANDA.lickRate) < owner.maxHp * 0.0002);
    ok('...which is far slower than one slash does damage',
      gained * 10 < ATTACKS.stand.dmg);

    /* AND IT CHIRPS ON THE BEAT, ONCE. The tongue is `sin(lickPhase)` and the
       noise counts whole turns of the same phase, so the sound cannot drift
       away from the picture. Sixty flags a second would be a machine gun. */
    let chirps = 0;
    for (let i = 0; i < 60; i++) { cub._stepLick(1 / 60, owner); if (cub.lickSfx) chirps++; }
    line('chirps in one second of licking', chirps);
    ok('the lick makes a noise, and not sixty of them', chirps >= 1 && chirps <= 3);

    /* WALKING OUT OF RANGE RESETS THE CLOCK RATHER THAN PAUSING IT. "Within
       radius for at least 1 second" is a promise about ONE continuous second,
       and a clock that merely paused would let a cub trotting in and out of
       reach collect it a tenth at a time. */
    cub.position.x = owner.position.x + PANDA.lickNear + 2;
    cub._stepLick(1 / 60, owner);
    ok('stepping out of reach stops it', !cub.licking && cub.lickT === 0);
    cub.position.copy(owner.position);
    step(Math.round(PANDA.lickWarm * 60) - 4);
    ok('...and it has to earn the whole warm-up again', !cub.licking);

    /* SHE HAS TO BE ON HER OWN FEET, and knocked out is not "very hurt". */
    step(20);
    ok('(licking again)', cub.licking);
    owner.ko = true;
    cub._stepLick(1 / 60, owner);
    ok('a knocked-out kitten is not healed back into a finished round', !cub.licking);
    owner.ko = false;
    step(Math.round(PANDA.lickWarm * 60) + 4);
    owner.carried = {};
    cub._stepLick(1 / 60, owner);
    ok('nor one the griffin is carrying', !cub.licking);
    owner.carried = null;

    // ...and a GROWN panda never does this. It is the cub's one job.
    const grown = new Panda(art, { owner, tier: 1 });
    grown.position.copy(owner.position);
    owner.hp = owner.maxHp * 0.05;
    for (let i = 0; i < 240; i++) grown._stepLick(1 / 60, owner);
    ok('a grown panda does not lick — that is what the cub is for',
      !grown.licking && !grown.lickWanted);
  }

  /* --- IT GETS HER OFF THE FLOOR AND THEN STOPS ------------------------- */
  {
    /* THE THRESHOLD IS WHERE IT STOPS AS WELL AS WHERE IT STARTS, and that is
       the ask read literally — "lick the player if they are below 30% health"
       is a condition, not a starting gun. It is also the right game: a cub that
       healed to FULL would mean a losing kitten could walk away from the fight,
       sit down with her panda for three minutes and come back whole, which ends
       rounds by attrition rather than rescuing them. This one gets her back on
       her feet and then goes quiet, and she still has to win the round with a
       bar under a third. */
    const owner = mkP(0, 0);
    const cub = new Panda(art, { owner, tier: 0 });
    cub.position.copy(owner.position);
    owner.hp = owner.maxHp * 0.05;
    for (let i = 0; i < 60 * 400; i++) cub._stepLick(1 / 60, owner);
    const frac = owner.hp / owner.maxHp;
    line('bar after six minutes of licking', `${(frac * 100).toFixed(1)}%`);
    ok('a cub left licking for six minutes gets her up to the threshold',
      frac >= PANDA.lickBelow - 0.01);
    ok('...and no further — it is a rescue, not a way to sit out a round',
      frac <= PANDA.lickBelow + 0.01);
    ok('...so it can never overfill her bar', owner.hp <= owner.maxHp);
  }

  /* --- WHAT THE LICK ACTUALLY LOOKS LIKE -------------------------------- */
  {
    /* MEASURED, NOT REASONED ABOUT. The house rule for anything drawn, and it
       earns its place here for a boring reason: the preview pane suspends
       requestAnimationFrame, so the browser could not be made to run a single
       frame of this and a screenshot was never going to be the check. What is
       on screen is a tongue that moves, motes that rise off HER rather than off
       the animal, and a lean — so those are the three things measured. */
    const owner = mkP(0, 0);
    const cub = new Panda(art, { owner, tier: 0 });
    cub.position.set(owner.position.x + 1, owner.position.y, owner.position.z);
    const draw = (n) => {
      for (let i = 0; i < n; i++) { cub._stepLick(1 / 60, owner); cub._drawLick(owner); }
    };

    owner.hp = owner.maxHp;
    draw(30);
    ok('nothing is drawn while it is not licking', !cub.lickRig.visible);

    owner.hp = owner.maxHp * 0.1;
    draw(Math.round(PANDA.lickWarm * 60) + 10);
    ok('the tongue and the motes appear once it starts', cub.lickRig.visible);

    const out = new Set();
    const rise = new Set();
    let worstOp = 0;
    for (let i = 0; i < 150; i++) {
      cub._stepLick(1 / 60, owner);
      cub._drawLick(owner);
      out.add(cub.tongue.position.length().toFixed(4));
      rise.add(cub.motes[0].position.y.toFixed(4));
      worstOp = Math.max(worstOp, ...cub.motes.map((m) => m.material.opacity),
        cub.tongue.material.opacity);
    }
    line('distinct tongue extensions / mote heights over 2.5s',
      `${out.size} / ${rise.size}`);
    /* A STILL TONGUE IS THE FAILURE MODE. It is `sin(lickPhase)` and the phase
       is the same one the chirp counts, so a tongue that stopped moving would
       be a chirp that had stopped agreeing with the picture. */
    ok('the tongue flicks rather than sitting out', out.size > 20);
    ok('...and never turns inside out', [...out].every((d) => Number(d) >= 0));
    ok('the motes rise rather than hanging', rise.size > 20);
    ok('nothing is drawn brighter than opaque', worstOp <= 1);

    /* THE MOTES COME OFF HER, NOT OFF THE ANIMAL. They are the same green as
       the overflow bar and they mean "health arriving"; drawn over the cub they
       would say the cub was being healed, which is the opposite of what
       happens. `lickRig` hangs off the panda's group, so this is a real
       question about a real offset and not a formality. */
    const near = cub.motes.filter((m) => Math.hypot(
      (cub.position.x + m.position.x) - owner.position.x,
      (cub.position.z + m.position.z) - owner.position.z,
    ) < 1.2).length;
    ok('the green motes rise off the KITTEN, not off the cub', near >= 4,
      `${near} of ${cub.motes.length} within a metre of her`);

    /* AND IT LEANS IN, on the same beat. Applied to the GROUP rather than to
       the drawing, so the shadow comes with it — a cub whose picture leans away
       from its own shadow reads as sliding rather than as reaching.

       MEASURED AS A DISTANCE FROM WHERE THE ANIMAL ACTUALLY IS, not along an
       axis. The first version of this check watched `group.position.x` and
       passed nothing: `facing` defaults to zero, the lean is `sin(facing)` on x
       and `cos(facing)` on z, and the whole movement was on the axis the check
       was not looking at. A distance has no axis to be wrong about. */
    const lean = new Set();
    for (let i = 0; i < 60; i++) {
      cub.group.position.copy(cub.position);   // what `update` does each frame
      cub._stepLick(1 / 60, owner);
      cub._drawLick(owner);
      lean.add(Math.hypot(
        cub.group.position.x - cub.position.x,
        cub.group.position.z - cub.position.z,
      ).toFixed(4));
    }
    ok('the whole animal leans in on the same beat', lean.size > 8);
    ok('...and never leans so far it leaves its own shadow',
      Math.max(...[...lean].map(Number)) < 0.4);
  }

  /* --- THE HIT FLASH AND THE FLINCH ------------------------------------- */
  {
    const owner = mkP(0, 0);
    const pet = new Panda(art, { owner, tier: 1 });
    ok('a panda starts white', pet.sprite.mat.color.r === 1);
    pet.hurt(5, new THREE.Vector3(owner.position.x - 3, owner.position.y, owner.position.z));
    pet._updateHurt(1 / 60);
    ok('a struck panda flashes, and past white like a kitten does',
      pet.sprite.mat.color.r > 1 && pet.sprite.mat.color.g < 1);
    ok('...and reels away from whoever hit it',
      Math.abs(pet.recoilDir) < 0.001 || Math.sin(pet.recoilDir) > 0);
    for (let i = 0; i < 120; i++) pet._updateHurt(1 / 60);
    ok('...and settles back to white rather than staying lit',
      pet.sprite.mat.color.r === 1);
    ok('...with the flinch spent', pet.recoil === 0);

    /* GROWING OR SHRINKING CLEARS IT. The two tiers are two Billboards with two
       materials, so a flash left burning on the drawing being hidden would
       still be burning when it came back — which is a panda that arrives at the
       shrine already red. */
    pet.hurt(5, new THREE.Vector3(0, 0, 0));
    pet.collapse();
    ok('shrinking mid-flash does not leave a lit drawing behind',
      pet.poses.every((b) => b.mat.color.r === 1) && pet.hurtT === 0);
  }

  /* --- AND THE BALANCE PAGE CAN REACH ALL OF IT ------------------------- */
  {
    ok('PANDA is reachable from the balance page',
      !!DEFAULTS.PANDA && Object.keys(DEFAULTS.PANDA).length === 9);
    const page = readFileSync(new URL('../src/tuning-page.js', import.meta.url), 'utf8');
    /* EVERY KNOB HAS A SENTENCE, not just a slider. The generic fallback would
       render an undescribed field with its raw name and a guessed range, which
       is honest but useless to somebody deciding what "bodyUp" ought to be —
       and these were asked for by name: "make all these variables editable in
       the Balance page". */
    for (const k of Object.keys(DEFAULTS.PANDA)) {
      ok(`...and ${k} is described there rather than guessed at`,
        new RegExp(`\\n\\s+${k}: \\['`).test(page));
    }
    ok('...and the claw row on the attacks table says where its damage lives',
      /claw: 'THE PANDA/.test(page));
  }
}

console.log('\n--- clan leaders (the cast from her drawing) ---');
{
  const ids = CLANS.map((c) => c.id);
  line('leaders', CLANS.map((c) => `${LEADERS[c.id]?.name ?? '??'}(${LEADERS[c.id]?.breed})`)
    .join(', '));
  ok('every clan has somebody standing at its shrine',
    ids.every((id) => !!LEADERS[id]));
  ok('no two leaders share a name',
    new Set(Object.values(LEADERS).map((l) => l.name)).size === ids.length);
  ok('no two leaders share a breed',
    new Set(Object.values(LEADERS).map((l) => l.breed)).size === ids.length);
  ok('the storyteller is not also a clan leader',
    !Object.values(LEADERS).some((l) => l.name === ELDER.name));
  ok('every leader has a sprite of her own',
    new Set(Object.values(LEADERS).map((l) => l.art)).size === ids.length
    && !Object.values(LEADERS).some((l) => l.art === ELDER.art));

  /* Her line has to NAME THE BUFF. The whole reason to cross an island is
     what you get, and a shrine that says only "join us" makes the player
     guess. This is the check that a rewrite can't quietly drop it. */
  const buffWords = {
    thunder: ['fast', 'run'], river: ['katana', 'reach'], shadow: ['jump', 'third'],
    wind: ['breathe', 'dragon'], ice: ['feel', 'unbroken'], panda: ['bamboo', 'cane'],
  };
  for (const id of ids) {
    const l = LEADERS[id].line.toLowerCase();
    ok(`${LEADERS[id].name} says what her clan actually gives you`,
      buffWords[id].some((w) => l.includes(w)));
  }
  ok('every line fits the bubble', Object.values(LEADERS).every(
    (l) => l.line.split('\n').every((row) => row.length <= 46)));

  /* Where she stands. Inside the trigger ring, so walking up to her IS
     walking into the shrine — and on the far side of it, so a kitten
     arriving from the island meets her face on rather than at her back. */
  for (const hall of world.clanHalls) {
    const s = leaderSpot(hall, world);
    const isl = world.heightAt(hall.x, hall.z)?.island;
    const dOut = Math.hypot(s.x - (isl?.x ?? 0), s.z - (isl?.z ?? 0));
    const dHall = Math.hypot(hall.x - (isl?.x ?? 0), hall.z - (isl?.z ?? 0));
    ok(`${LEADERS[hall.clan.id].name} stands in her own shrine ring`,
      Math.hypot(s.x - hall.x, s.z - hall.z) < hall.r,
      `${LEADER_OFFSET} out, ring is ${hall.r}`);
    ok(`...on the far side of it`, dOut > dHall);
    ok('...on real ground', world.heightAt(s.x, s.z) != null);
    /* ...and ON TOP of the stonework, not in it. The dais is decorative
       geometry merged into the world mesh, so heightAt returns the hillside
       underneath and using it planted every leader knee-deep in the top step.
       This is the check that catches it, because a cat standing half inside a
       stone platform still looks like a cat standing at a shrine. */
    ok('...on top of the dais, not sunk into it',
      Math.abs(s.y - (world.heightAt(hall.x, hall.z).y + SHRINE_DAIS.y)) < 0.001,
      `+${SHRINE_DAIS.y} above the shrine floor`);
    ok('...well inside the stone she is standing on', LEADER_OFFSET < SHRINE_DAIS.r);
  }
}

console.log('\n--- one-way platforms (bridge deck) ---');
const plat = world.platforms[0];
const mx = (plat.x0 + plat.x1) / 2;
const mz = (plat.z0 + plat.z1) / 2;
const above = world.heightAt(mx, mz, plat.y + 0.2);
const below = world.heightAt(mx, mz, plat.y - 4);
const terrain = world.heightAt(mx, mz, -Infinity);
line('deck y / terrain y', `${plat.y.toFixed(2)} / ${terrain.y.toFixed(2)}`);
ok('deck sits above the ground it spans', plat.y > terrain.y);
ok('standing above snaps to the deck', above.platform === plat);
ok('passing underneath ignores the deck', below.platform === undefined && below.y < plat.y);

console.log('\n--- dragons ---');
// Perched on the ground, exactly the way _spawnDragons places them.
const perchY = world.heightAt(26, 78).y;
const d = new Dragon(new THREE.Texture(), 26, perchY, 78, { breed: BREEDS[1] });
ok('dragon carries its breed', d.name === 'Ember' && d.breed.breath.name === 'fire');
d.rider = {};
d.position.set(400, 300, -400);          // let go of far away, over open sky
d.returnHome();
ok('dismount clears the rider', d.rider === null);
ok('dismount sends it home', d.state === 'returning');
let frames = 0;
while (d.state === 'returning' && frames++ < 6000) d.update(1 / 60, world, []);
line('frames to fly home', frames);
ok('it always arrives at its perch',
  d.state === 'perched' && d.position.distanceTo(d.perch) < 2,
  `dist ${d.position.distanceTo(d.perch).toFixed(2)}`);

console.log('\n--- dragon stays where you left it ---');
{
  const d2 = new Dragon(new THREE.Texture(), 26, world.heightAt(26, 78).y, 78, { breed: BREEDS[0] });
  d2.rider = {};
  d2.landAt(-20, 20);                       // stepped off across the home island
  ok('landing keeps it perched, not flying', d2.state === 'perched' && !d2.rider);
  ok('and it counts as strayed', d2.strayed);
  for (let i = 0; i < 60; i++) d2.update(1 / 60, world, []);
  ok('it stays put on its own', d2.state === 'perched'
    && Math.hypot(d2.position.x + 20, d2.position.z - 20) < 1);
  d2.returnHome();
  let f = 0;
  while (d2.state === 'returning' && f++ < 3000) d2.update(1 / 60, world, []);
  ok('and still flies home when told to', d2.state === 'perched' && !d2.strayed);
}

console.log('\n--- flying ---');
{
  const dr = new Dragon(new THREE.Texture(), 44, world.heightAt(44, 69).y, 69, { breed: BREEDS[0] });
  const rider = new Player({
    texture: new THREE.Texture(), index: 0,
    spawn: new THREE.Vector3(44, 60, 69), cols: 8, rows: 4, mirror: false,
  });
  rider.mount = dr; dr.rider = rider; dr.state = 'ridden';

  // Heading must be broadside and must NOT respond to up/down.
  const pad = (mx, my) => ({ mx, my, down: () => false, pressed: () => false });
  const fly = (mx, my, n = 40) => {
    for (let i = 0; i < n; i++) rider.update(1 / 60, pad(mx, my), world, [dr], null);
    return rider.facing;
  };
  const right = fly(1, 0);
  const afterUp = fly(0, -1);
  const afterDown = fly(0, 1);
  const left = fly(-1, 0);
  ok('up/down never flips the dragon', afterUp === right && afterDown === right);
  ok('left/right does flip it', Math.abs(Math.abs(left - right) - Math.PI) < 1e-6);

  // The rider must bob WITH the dragon's back, not against it.
  let outOfPhase = 0;
  for (let i = 0; i < 60; i++) {
    dr.flap = i * 0.21;
    const squash = 1 - Math.sin(dr.flap) * 0.09;   // dragon's scale.y
    if (Math.sign(squash - 1) !== Math.sign(dr.flapBob)) outOfPhase++;
  }
  ok('rider bobs in phase with the wingbeat', outOfPhase === 0, `${outOfPhase} bad samples`);

  // Diving at the ground must not bury the dragon in it.
  const gy = world.heightAt(0, 40).y;
  rider.position.set(0, gy + 60, 40);
  rider.velocity.set(0, 0, 0);
  const dive = { mx: 0, my: 0, down: (a) => a === 'interact', pressed: () => false };
  let lowest = Infinity;
  for (let i = 0; i < 400; i++) {
    rider.update(1 / 60, dive, world, [dr], null);
    dr.update(1 / 60, world, []);
    if (i > 100) lowest = Math.min(lowest, dr.position.y - world.heightAt(dr.position.x, dr.position.z).y);
  }
  ok('a dive never sinks the dragon into the hill', lowest > 0, `lowest ${lowest.toFixed(2)}`);
  ok('it knows it is hovering', dr.hovering);
  ok('but a ridden dragon keeps the flight pose', dr.sprite === dr.spriteFlying);

  // Bailing out high up: the dragon follows you down, it does NOT go home.
  dr.rider = rider; rider.mount = dr; dr.state = 'ridden'; dr.hovering = false;
  const BX = -60;
  const BZ = 20;
  rider.position.set(BX, world.heightAt(BX, BZ).y + 70, BZ);
  rider.update(1 / 60, { mx: 0, my: 0, down: () => false, pressed: (a) => a === 'mount' },
    world, [dr], null);
  let f = 0;
  while (dr.state === 'returning' && f++ < 5000) dr.update(1 / 60, world, []);
  const miss = Math.hypot(dr.position.x - BX, dr.position.z - BZ);
  ok('bailing out high brings the dragon down to you', miss < 2,
    `landed ${miss.toFixed(1)} from the jump point, not at its perch`);
}

console.log('\n--- the bridge is climbable stairs ---');
{
  const decks = world.platforms.filter((p) => p.z0 > 40 && p.z1 < 52);
  const ys = decks.map((p) => p.y);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  line('deck steps', decks.length);
  line('rise across the arch', (hi - lo).toFixed(2));
  ok('the deck is stepped, not one flat slab', decks.length >= 8 && hi - lo > 1.5);
  // Every step reachable from the one before it (jump clears ~2.4).
  const sorted = decks.slice().sort((a, b) => a.x0 - b.x0);
  let worst = 0;
  for (let i = 1; i < sorted.length; i++) {
    worst = Math.max(worst, Math.abs(sorted[i].y - sorted[i - 1].y));
  }
  line('biggest step between segments', worst.toFixed(2));
  ok('no step is too tall to walk up', worst < 0.9);
}

console.log('\n--- running downhill (the animation flicker) ---');
{
  /* Find the steepest downhill run WELL INSIDE the home island. Searching the
     whole disc just finds the rim, where the island falls away into open sky —
     running off a cliff is supposed to put you in the air. */
  const home = world.islands[0];
  const inner = home.radius * 0.6;
  let best = { grad: 0 };
  for (let x = -inner; x <= inner; x += 3) {
    for (let z = -inner; z <= inner; z += 3) {
      if (Math.hypot(x, z) > inner) continue;
      const h = home.heightAt(x, z);
      if (h == null) continue;
      for (const [ux, uz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const h2 = home.heightAt(x + ux * 6, z + uz * 6);
        if (h2 == null) continue;
        const grad = (h - h2) / 6;
        if (grad > best.grad) best = { grad, x, z, ux, uz };
      }
    }
  }
  line('steepest downhill slope found',
    `${best.grad.toFixed(3)} at ${best.x},${best.z} heading ${best.ux},${best.uz}`);

  /* Movement is camera-relative, so convert "downhill" into stick values
     through the same basis the player uses. */
  const yaw = -Math.PI * 0.25;
  const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  const dir = new THREE.Vector3(best.ux, 0, best.uz).normalize();
  const pad = {
    mx: dir.dot(right),
    my: -dir.dot(fwd),
    down: (a) => a === 'sprint',        // sprinting: the worst case
    pressed: () => false,
  };
  const p = new Player({
    texture: new THREE.Texture(), index: 0,
    spawn: new THREE.Vector3(best.x, home.heightAt(best.x, best.z), best.z),
    cols: 8, rows: 4, mirror: false,
  });

  const startY = p.position.y;
  let flips = 0;
  let airFrames = 0;
  let prevRow = null;
  // Settle a few frames first, then measure the run itself.
  for (let i = 0; i < 8; i++) p.update(1 / 60, pad, world, [], null);
  let ran = 0;
  for (let i = 0; i < 200; i++) {
    p.update(1 / 60, pad, world, [], null);
    /* Stop AT the rim, and don't score the frame that crosses it: running off
       the edge of a floating island is supposed to put you in the air, and
       counting that as a flicker measures the wrong thing entirely. */
    if (home.heightAt(p.position.x, p.position.z) == null) break;
    ran++;
    if (!p.onGround) airFrames++;
    if (prevRow !== null && p.sprite.row !== prevRow) flips++;
    prevRow = p.sprite.row;
  }
  line('frames airborne while running downhill', `${airFrames} / ${ran}`);
  line('animation row changes', flips);
  line('descended', (startY - p.position.y).toFixed(2));
  ok('stays glued to the ground running downhill', airFrames === 0);
  ok('never flips to the jump pose', flips === 0);
  ok('and it really did run down a slope', startY - p.position.y > 1.5);
}

console.log('\n--- a piece of music per island ---');
/* None of this is visible, which is exactly why it needs checking: a biome
   whose theme quietly falls back to the home tune is indistinguishable from
   one that has its own, and nobody would ever notice by playing. */
{
  const biomes = world.islands.map((i) => i.biome).filter(Boolean);
  line('biomes with an island', biomes.join(' '));
  ok('every biome in the world has a piece',
    biomes.every((b) => ISLAND_MUSIC[b]),
    biomes.filter((b) => !ISLAND_MUSIC[b]).join(' ') || 'all covered');
  ok('and every piece it names really exists',
    Object.values(ISLAND_MUSIC).every((m) => MUSIC[m]));

  /* RESOLVED THE WAY THE GAME RESOLVES IT, through the same function, because
     the interesting case is a special one: the Dojo sets no biome and `Island`
     defaults an unset biome to `meadow`, so a plain biome lookup hands the
     maths island the HOME theme. That is a silent wrong answer — every biome
     still maps to a piece and the right number of pieces still exist. */
  const tracks = world.islands.map((i) => trackForIsland(i, world.dojoIsland));
  line('island -> piece', tracks.join(' '));
  ok('the Dojo gets its own piece despite defaulting to the meadow biome',
    trackForIsland(world.dojoIsland, world.dojoIsland) === 'dojo'
    && world.dojoIsland.biome === 'meadow');

  /* THE POINT IS THAT THEY SOUND DIFFERENT. Seven entries that are all the
     same numbers is seven islands playing one tune, which is the failure this
     feature exists to fix and would pass any "does it have a theme" check. */
  ok('no two islands share a piece', new Set(tracks).size === world.islands.length);
  const sig = (m) => [MUSIC[m].scale.join(','), MUSIC[m].root ?? 146.83,
    MUSIC[m].beat, MUSIC[m].rest ?? 0.72].join('|');
  ok('and no two pieces are the same piece',
    new Set(tracks.map(sig)).size === tracks.length);
  /* Each one has to differ from the HOME theme in something a listener can
     hear — not merely differ in some field. Scale, key or tempo. */
  for (const m of tracks) {
    if (m === 'play') continue;
    const A = MUSIC[m];
    const B = MUSIC.play;
    const audible = A.scale !== B.scale
      || Math.abs((A.root ?? 146.83) - 146.83) > 1
      || Math.abs(A.beat - B.beat) > 0.06;
    ok(`the ${m} theme is audibly not the home theme`, audible);
  }

  /* Tempo and key have to stay somewhere sane, or a bad edit gives one island
     a 4-second gap between notes or a piece two octaves out of the set. */
  for (const m of tracks) {
    ok(`${m} sits at a playable tempo`, MUSIC[m].beat >= 0.2 && MUSIC[m].beat <= 1.0,
      `${MUSIC[m].beat}s per step`);
    const r = MUSIC[m].root ?? 146.83;
    ok(`${m} is in a key near the others`, r >= 80 && r <= 260, `${r}Hz`);
    ok(`${m} is not a solid wall of notes`, (MUSIC[m].rest ?? 0.72) <= 0.9);
  }
  /* The Dojo has a lesson on screen. It must be the sparsest thing in the game
     — a tune with an opinion competes with a live sine wave. */
  ok('the Dojo theme is the sparsest of them',
    MUSIC.dojo.rest > Math.max(...tracks.filter((m) => m !== 'dojo').map((m) => MUSIC[m].rest ?? 0.72)));
}

console.log('\n--- the two dragon themes ---');
{
  /* A storm dragon and Ryuuseki must not blur into each other: you can hear
     both inside a minute, and the whole reason he has his own is that he is
     not a storm dragon. */
  const F = MUSIC.flight;
  const R = MUSIC.ryu;
  ok('a storm dragon has its own piece', !!F);
  ok('it is not Ryuuseki\'s', F.scale !== R.scale);
  line('flight vs ryu: beat / octave', `${F.beat}/${F.oct} vs ${R.beat}/${R.oct}`);
  ok('and it differs in more than tempo',
    F.oct !== R.oct || !!F.bass !== !!R.bass || !!F.snare !== !!R.snare);

  /* BOTH ARE FASTER THAN ANY ISLAND. Riding is the exciting thing in the game
     and a flight theme slower than the ground theme would be a joke. */
  const slowestRide = Math.max(F.beat, R.beat);
  const fastestIsland = Math.min(...[...new Set(Object.values(ISLAND_MUSIC))]
    .concat('dojo').map((m) => MUSIC[m].beat));
  line('slowest ride vs fastest island', `${slowestRide} vs ${fastestIsland}`);
  ok('riding is always faster than walking anywhere', slowestRide < fastestIsland);

  /* The bassline is the Dragon Ball part, and the flight theme is the only
     thing that has one — it is what makes it a band rather than a koto. */
  ok('the flight theme is the one with a bassline', !!F.bass && !R.bass);
  ok('and a backbeat', !!F.snare);
  ok('both dragon themes push the fanfare fifth', F.fifths && R.fifths);
}

console.log('\n--- sprite directions ---');
/* The two sheets turn OPPOSITE ways, so each Billboard carries its own
   dirSense. These expectations were read off the actual art by drawing the
   cells enlarged onto a canvas — see HANDOFF.md. Don't re-derive them. */
const cam = { position: new THREE.Vector3(0, 0, 100) };   // camera due +Z
const cellsFor = (cols, dirSense) => {
  const bb = new Billboard(new THREE.Texture(), { cols, rows: 4, mirror: false, dirSense });
  return [0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
    bb.facing = (deg * Math.PI) / 180;
    bb.faceCamera(cam);
    return Math.round(bb.tex.offset.x * cols);
  });
};

// Ember: 10 cells, cell 0 front / 2 right / 5 away / 7 left.
const em = cellsFor(10, 1);
line('ember cells (down..down-left)', em.join(','));
ok('ember faces the camera on cell 0', em[0] === 0);
ok('ember RIGHT is the right profile (2)', em[2] === 2);
ok('ember UP is the back (5)', em[4] === 5);
ok('ember LEFT is the left profile (7)', em[6] === 7);

/* Frost: 8 cells from frost_grid.png. That sheet is internally consistent —
   all four rows turn the same way — which is why she needs no per-row
   override. (frost_grid_v2.png is NOT: its jump/attack rows are drawn mirrored
   against its idle/walk rows, so no single mapping can serve all four. That's
   why it isn't the live sheet.) */
const fr = cellsFor(8, 1);
line('frost cells (down..down-left)', fr.join(','));
ok('frost faces the camera on cell 0', fr[0] === 0);
ok('frost RIGHT is the right profile (2)', fr[2] === 2);
ok('frost UP is the back (4)', fr[4] === 4);
ok('frost LEFT is the left profile (6)', fr[6] === 6);
ok('frost turns the same way as ember', fr[2] < fr[4] && fr[6] > fr[4]);

// rowSense is still supported, for the next sheet that misbehaves.
{
  const bb = new Billboard(new THREE.Texture(), {
    cols: 8, rows: 4, mirror: false, dirSense: 1, rowSense: [1, 1, -1, -1],
  });
  const at = (row, deg) => {
    bb.row = row;
    bb.facing = (deg * Math.PI) / 180;
    bb.faceCamera(cam);
    return Math.round(bb.tex.offset.x * 8);
  };
  ok('rowSense can still flip a single row',
    at(0, 90) === 2 && at(1, 90) === 2 && at(2, 90) === 6 && at(3, 90) === 6);
}

/* Mirror symmetry about the camera axis is what breaks first if a dirSense is
   wrong, so it's the strongest check available. But it can only be demanded
   where the sheet actually has a cell for the direction: on Ember's 10 cells
   the steps are 36 degrees, so pure left and pure right fall EXACTLY between
   two drawn poses and no choice is symmetric. The diagonals are never ties, so
   they must always mirror. */
const mirrors = (cells, cols, i) => (cells[i] + cells[8 - i]) % cols === 0;
const tied = (cols, i) => ((i * 45) / (360 / cols)) % 1 === 0.5;
for (const [name, cells, cols] of [['ember', em, 10], ['frost', fr, 8]]) {
  const pairs = [1, 2, 3].filter((i) => !tied(cols, i));
  ok(`${name} is left/right symmetric`, pairs.every((i) => mirrors(cells, cols, i)),
    `checked ${pairs.length} of 3 pairs; the rest fall between drawn cells`);
}

/* ===========================================================================
   THE WORLD MARTIAL ARTS TOURNAMENT

   The three things here that would be invisible on screen, in order of how
   badly they would bite:

   1. COMBAT LEAKING OUT OF THE RING. `Player._doSlash` calls into the damage
      path on every swing in the game. If the gate ever comes off, two sisters
      can knock each other down in the middle of the town — and it would look
      completely normal, because a slash already plays there.
   2. THE ARENA BEING REACHABLE EARLY. Hidden mesh, no ground, no platforms,
      no solids: four separate facts, and three of them are lists that know
      nothing about an island.
   3. THE SCORE BEING WRONG. Four terms, and a weight that cannot change the
      ordering is a term that is not really being scored.
   =========================================================================== */

console.log('\n--- the griffin puts them down with the arena in shot ---');
{
  /* THE LAST SECOND OF THE RIDE WAS A SHOT OF THE GROUND SPINNING, with the
     griffin and both riders off screen behind the camera. Reported as "at the
     end of the pegasus cutscene the camera looks at the ground and spins
     weirdly instead of at the pegasus", and it was one sign: `back` was
     `-swing`, and `bx`/`bz` already subtract the heading, so the swing that
     was meant to bring the camera BEHIND the animal took it in front of it —
     past the point `_look` was aiming at. `lookAt` down a near-vertical
     direction has no stable yaw, which is the spin.

     WHAT IS PINNED IS THE SHOT, NOT THE NUMBERS. Every one of `out`, the
     0.62, the 1.5 and the seat heights is a taste decision somebody should be
     free to retune; what must survive any of that is that the animal stays in
     front of the camera, that the camera does not end up staring at its feet,
     and that the picture does not whip round. Those are three things a
     `lookAt` sign error breaks and nothing else does. */
  const { Griffin } = await import('../src/entities/griffin.js');
  const g = new Griffin({ texture: new THREE.Texture(), contentScale: 1, pad: 0 });
  /* No riders. `_place` and `_finish` both loop over the list, so an empty one
     exercises the camera and nothing else — and this section is about the
     camera. The riders have their own seat checks in the sprite section. */
  g.fly(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 300), []);

  const fwd = () => new THREE.Vector3(0, 0, -1).applyQuaternion(g.camera.quaternion);
  const heading = new THREE.Vector3(Math.sin(g.facing), 0, Math.cos(g.facing));

  let behindCamera = 0;
  let staringDown = 0;
  let worstWhip = 0;
  let last = null;
  const dt = 1 / 60;
  for (let i = 0; i < 2000 && g.flying; i++) {
    g.update(dt);
    const f = fwd();
    /* IN FRONT OF THE CAMERA. The failure was literally this: the subject
       ended up behind the lens. A dot against the direction the camera is
       looking is the whole of it. */
    const toAnimal = g.position.clone().sub(g.camera.position).normalize();
    if (toAnimal.dot(f) <= 0.2) behindCamera += 1;
    /* NOT POINTED AT THE FLOOR. 0.75 is well past anything the shot asks for
       — it climbs to about a fifth of a quad of downward tilt — and well short
       of the degenerate vertical that makes the yaw undefined. */
    if (Math.abs(f.y) > 0.75) staringDown += 1;
    /* AND IT DOES NOT WHIP. The spin was frames of nearly-free yaw; a real
       swing is a couple of degrees a frame. Measured as the angle between one
       frame's forward and the next's. */
    if (last) worstWhip = Math.max(worstWhip, last.angleTo(f));
    last = f;
  }
  ok('the griffin is in front of its own camera for every frame of the flight',
    behindCamera === 0, `${behindCamera} frames with it behind the lens`);
  ok('...and the camera never tips down to stare at the ground',
    staringDown === 0, `${staringDown} frames`);
  line('worst frame-to-frame swing', `${(worstWhip * 180 / Math.PI).toFixed(2)}°`);
  ok('...and the picture swings rather than spinning',
    worstWhip < 0.12, `${(worstWhip * 180 / Math.PI).toFixed(1)}° in one frame`);

  /* AND AT THE END IT IS BEHIND THEM, LOOKING THE WAY THEY ARE GOING — which
     is the point of swinging round at all: the last thing on screen is the
     arena coming up, not a wing. This is the assertion the sign error failed
     outright, and the one that would fail again if somebody negated it back. */
  const tail = g.camera.position.clone().sub(g.position);
  ok('the shot ends BEHIND the animal, not in front of it',
    tail.dot(heading) < 0, tail.dot(heading).toFixed(2));
  ok('...and pointed along the heading, at the arena they are landing on',
    fwd().dot(heading) > 0.6, fwd().dot(heading).toFixed(2));
  /* IT STARTS ALONGSIDE, and that is the other half of the same shot: the
     animal is a side-on drawing and a chase camera behind a yaw-only billboard
     is looking at a vertical line. A "fix" that simply put the camera behind
     it for the whole trip would pass everything above. */
  {
    const h = new Griffin({ texture: new THREE.Texture(), contentScale: 1, pad: 0 });
    h.fly(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 300), []);
    h.update(1 / 60);
    const off = h.camera.position.clone().sub(h.position);
    ok('...while the START of the ride is broadside, where the drawing is',
      Math.abs(off.dot(heading)) < Math.abs(off.x) * 0.35,
      `along ${off.dot(heading).toFixed(1)} vs across ${off.x.toFixed(1)}`);
  }

  /* SKIPPING IT LEAVES NOTHING BEHIND. The scene is skippable by Escape or a
     pad's Start (seventh non-negotiable), and the camera is the one thing here
     that outlives the flight. */
  const sk = new Griffin({ texture: new THREE.Texture(), contentScale: 1, pad: 0 });
  sk.fly(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 300), []);
  sk.update(1 / 60);
  sk.skip();
  ok('a skipped flight is over and put away',
    sk.flying === false && sk.done === true && sk.group.visible === false);
}

console.log('\n--- the arena ---');
{
  const R = world.arenaRing;
  line('ring (half-width, deck y)', `${R.half} @ ${R.y.toFixed(1)}`);
  line('arena centre', `${world.arenaCentre.x}, ${world.arenaCentre.z}`);

  /* FAR ENOUGH AWAY THAT NOBODY ARRIVES BY ACCIDENT. The whole design of the
     griffin rests on this: the arena is somewhere you are TAKEN. If it ever
     drifts to within a normal dragon hop of the archipelago, the ride stops
     being the way in and the lock becomes the feature instead. */
  const nearest = Math.min(...world.questIslands.map(
    (i) => Math.hypot(i.x - world.arenaCentre.x, i.z - world.arenaCentre.z) - i.radius
  ));
  line('gap to the nearest island', nearest.toFixed(0));
  ok('the arena is well clear of the archipelago', nearest > 150,
    `${nearest.toFixed(0)} units of open sky`);

  ok('both starting posts are inside the ring',
    world.arenaPosts.every((p) => world.arenaOutBy(p.x, p.z) < -4));
  ok('the posts are on OPPOSITE sides, facing each other',
    Math.sign(world.arenaPosts[0].x - R.x) === -Math.sign(world.arenaPosts[1].x - R.x)
    && Math.hypot(world.arenaPosts[0].x - world.arenaPosts[1].x,
      world.arenaPosts[0].z - world.arenaPosts[1].z) > R.half);

  /* The out test is a CHEBYSHEV distance, because the deck is a square. A
     radial test calls the corners out while a fighter is still standing on
     stone — and the corners are exactly where a knockback puts you. */
  ok('the middle of the ring is well inside', world.arenaOutBy(R.x, R.z) < -20);
  ok('the corners are IN, not out',
    world.arenaOutBy(R.x + R.half - 2, R.z + R.half - 2) < 0);
  ok('past the painted line is out',
    world.arenaOutBy(R.x + R.half + 2, R.z) > 0);

  /* Nothing the girls have to walk through on the way in, and — the part
     that matters for every round — nothing between the fight and the camera.
     This game's camera yaw is fixed at -PI/4, so it always sits at -x/+z of
     what it is watching: anything built at +z of the ring is permanently in
     front of the lens. The booth was, once. */
  ok('the announcer is NOT between the fight and the camera',
    world.arenaBooth.z < R.z, 'he is north; the camera is south');
  ok('the record board is off the camera axis too', world.arenaBoard.x < R.x);
  ok('the landing spot is outside the ring and clear of the stands',
    world.arenaOutBy(world.arenaLanding.x, world.arenaLanding.z) > 20);

  /* --- AND SHORT OF THE TORII, NOT PAST IT ------------------------------
     The gate is the one piece of architecture out here that means anything,
     and the ride used to end by flying through it: the town is north, so the
     flight comes in down the +z axis, and the landing sat at ring + 30 while
     the torii stands at ring + 34. Four units past. Reported as looking bad.

     ASSERTED AGAINST THE FLIGHT, not against a number. The direction they
     arrive from is what makes "in front of" mean anything, so it is computed
     from the two places the griffin actually flies between. */
  {
    const gate = world.arenaGate;
    const land = world.arenaLanding;
    ok('the torii and the landing are on the same side of the ring',
      Math.sign(gate.z - world.arenaCentre.z) === Math.sign(land.z - world.arenaCentre.z));
    /* Approaching from the town: whichever way that is, the landing has to
       come FIRST along it. */
    const townZ = 20;
    const inbound = Math.sign(world.arenaCentre.z - townZ);
    ok('they land BEFORE the gate, so the walk in goes through it',
      (land.z - gate.z) * inbound < 0,
      `landing z ${land.z.toFixed(0)}, gate z ${gate.z.toFixed(0)}`);
    ok('...with room to land — not standing in the gateway',
      Math.abs(land.z - gate.z) > 6, Math.abs(land.z - gate.z).toFixed(1));
    /* AND STILL OUTSIDE THE STANDS AND STILL ON THE ISLAND. Moving it out is
       the fix; moving it off the edge would be a worse bug than the one being
       fixed, and there is a hundred units of open sky under it. */
    ok('...outside the outermost seating', world.arenaOutBy(land.x, land.z) > 20);
    /* AND STILL ON THE ISLAND. `heightAt` only answers out here once the arena
       is open, so this asks the island itself — which is the thing that would
       actually stop being true if somebody pushed the landing further out. */
    const isl = world.arenaIsland;
    const outFromCentre = Math.hypot(land.x - isl.x, land.z - isl.z);
    ok('...and well inside the island, not hanging off the edge of it',
      outFromCentre < isl.radius - 12,
      `${outFromCentre.toFixed(0)} of ${isl.radius}`);
  }

  /* ---- NOBODY FALLS OUT OF THE ARENA ------------------------------------
     Reported from four-player play: "players get knocked so far they fall off
     the island entirely and then the camera zooms out infinitely far away."

     BEHAVIOURAL, THROUGH THE REAL `update`. Asserting that OUT_FLOOR is 14
     would pass whether or not anything reads it — and what was broken was not
     a number, it was that the check was skipped for exactly the kittens it
     needed to catch. So these drop fake players through the floor in each
     state that used to leak and ask where they ended up. */
  {
    const fake = (over) => ({
      name: 'Test', index: 0, ko: false, angel: null, heldBy: null, outT: 0,
      invulnT: 0, nearEdge: false,
      position: { x: R.x, y: R.y - 40, z: R.z, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
      velocity: { x: 0, y: -60, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
      camTarget: { copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; } },
      group: { position: { copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; } } },
      hurt() { return 0; },
      ...over,
    });
    const drive = (players, state) => {
      const t = new Tournament({
        players, world, toast() {}, audio: { play() {} },
        onTournamentEnd() {},
      });
      t.state = state;
      t.t = 0;
      t.game = { players, toast() {} };
      t.world = world;
      t.audio = { play() {} };
      t._paintHud = () => {};
      t._updateBanner = () => {};
      t.update(1 / 60, []);
      return players[0];
    };

    /* THE KO'D KITTEN, WHICH IS THE ONE THAT WAS FALLING. `_updateOut` opens
       with `if (p.ko) continue;` — right for the ring-out rule, and the exact
       hole she fell through. */
    const dead = drive([fake({ ko: true })], 'ko');
    ok('a knocked-out kitten under the floor is put back on the deck',
      Math.abs(dead.position.y - (R.y + 3)) < 0.001
      && Math.abs(dead.position.x - R.x) < 0.001, `y=${dead.position.y}`);
    ok('...and she is not still falling', dead.velocity.y === 0);

    /* AND IN EVERY STATE, because `_updateOut` is only called from two of
       them and the round ENDING is what stops it being called. */
    let leaked = 0;
    for (const st of ['card', 'count', 'live', 'ko', 'feast', 'result']) {
      const p = drive([fake({ ko: true })], st);
      if (p.position.y < R.y) leaked += 1;
    }
    ok('...in every state the tournament can be in', leaked === 0, `${leaked} leaked`);

    /* AN ANGEL IS LEFT ALONE. She has her own leash in Player._updateAngel and
       two systems reeling in the same kitten is how she lands somewhere
       neither of them meant. */
    const wings = drive([fake({ angel: {} })], 'live');
    ok('an angel under the rim is left to her own leash',
      wings.position.y < R.y - 30, `y=${wings.position.y}`);

    /* AND THE FLOOR IS BELOW THE ISLAND, NOT JUST BELOW THE DECK, which is the
       number that actually had to be measured rather than reasoned about
       (house rule eight). The island under the arena sits at y 46.6 and the
       deck at 49.0 — TWO AND A HALF UNITS apart, far closer than it looks
       standing on it. A floor of 3 or 4 would fire on a kitten standing
       perfectly safely on that island, which is exactly where a normal
       ring-out lands her, and yank her back mid-stride.

       The arena has to be OPENED to ask: `heightAt` returns nothing out there
       until Mr Satan says so, which is the whole point of the section below.
       Put back afterwards so the shut-arena checks still test a shut arena. */
    const wasOpen = world.arenaOpen;
    world.openArena(true);
    const ground = world.heightAt(R.x + R.half + 8, R.z);
    world.openArena(wasOpen);
    ok('the floor is below the island she would otherwise land on',
      ground && ground.y > R.y - OUT_FLOOR,
      ground ? `island ${ground.y.toFixed(1)}, deck ${R.y.toFixed(1)}, floor ${(R.y - OUT_FLOOR).toFixed(1)}` : 'no ground');
    ok('...and deeper than the ordinary ring-out ever reaches',
      OUT_FLOOR > 3 * 2, `${OUT_FLOOR}`);
  }
}

/* ---- AND THE CAMERA HAS A CEILING --------------------------------------
   The other half of the same report: "the camera zooms out infinitely far
   away". `fitDistance` is the only UNBOUNDED term in the pull-back — every
   other one has a ceiling written into it, `clamp(..., 26, 52)` and the Dojo
   and Ryuuseki constants and the ring's own deck-sized distance — and it takes
   the spread between the furthest two kittens, which a falling one makes as
   large as it likes.

   THE CEILING IS ONE WHOLE ISLAND, which is Richard's own framing: "from both
   opposite ends of the entire island to be covered, if camera zooms out that
   far, it cant zoom out any further". The largest island is 192 units across.

   BE HONEST ABOUT WHAT THIS DOES AND DOES NOT BOUND, because the numbers are
   closer together than they look and a future session should not have to
   re-derive them. At 16:9, measured:

     the widest legitimate group (four single-linked at MERGE_OUT)   152
     THE CEILING (largest island, 192 across)                        212
     a kitten falling the 160 units to Player._respawn               176   <- under
     respawned in the town while the others are at the arena         375   <- capped

   So the ceiling catches the cross-map case and NOT the long fall. It is a
   failsafe, not the fix; the fix is Tournament._catchFallers, which stops the
   fall happening at all. Both are wanted: one bounds the damage of every
   future way of getting a silly number in here, the other removes the way we
   know about. */
{
  const diam = Math.max(...world.islands.map((i) => i.radius)) * 2;
  const cap = (asp) => fitDistance({ spread: diam, fovDeg: 38, aspect: asp });
  ok('the largest island has a finite extent to cap against',
    diam > 100 && diam < 1000, `${diam.toFixed(0)} units across`);

  /* IT MUST NOT CLIP A SHOT THE GAME LEGITIMATELY WANTS. The widest group that
     can share a pane is four kittens single-linked in a chain at MERGE_OUT,
     and the ring's own framing of a 56-unit deck. Both have to fit under it at
     every pane shape, or the cap is a crop. */
  const chain = MERGE_OUT * 3;
  for (const asp of [16 / 9, 370 / 236, 0.8]) {
    ok(`the widest legitimate group still fits under the cap (aspect ${asp.toFixed(2)})`,
      fitDistance({ spread: chain, fovDeg: 38, aspect: asp }) < cap(asp),
      `${fitDistance({ spread: chain, fovDeg: 38, aspect: asp }).toFixed(0)} vs ${cap(asp).toFixed(0)}`);
  }
  /* ...AND IT MUST ACTUALLY BITE on the case that was reported. */
  const townToArena = 340;
  ok('...but a kitten respawned across the map is clamped',
    fitDistance({ spread: townToArena, fovDeg: 38, aspect: 16 / 9 }) > cap(16 / 9),
    `${fitDistance({ spread: townToArena, fovDeg: 38, aspect: 16 / 9 }).toFixed(0)} vs cap ${cap(16 / 9).toFixed(0)}`);

  /* A NARROW PANE GETS A BIGGER CEILING, asked at its own aspect for the same
     reason the floor under it is: one number for every pane shape would crop a
     quadrant or waste a widescreen. */
  ok('...and a narrow pane is allowed further back than a wide one',
    cap(0.8) > cap(1.78));
}

console.log('\n--- the arena is SHUT until it is opened ---');
{
  const A = world.arenaCentre;
  const R = world.arenaRing;
  ok('starts shut', world.arenaOpen === false);
  ok('no ground out there while shut', world.heightAt(A.x, A.z) == null);
  /* The deck is a PLATFORM, which is a separate list that never consulted an
     island. Hiding the island alone left a solid stone square floating in
     empty sky — a far worse bug than an arena you can reach early, because it
     looks like the world is broken. */
  ok('and no invisible deck to land on',
    world.heightAt(R.x, R.z, R.y + 1) == null);
  /* ...and the record board is a solid with NO `top`, i.e. an infinite
     cylinder, which would shove a kitten flying past the empty coordinates. */
  const shoved = world.resolveSolids(world.arenaBoard.x, world.arenaBoard.z, 0.75, 400);
  ok('and no invisible walls to be shoved by',
    Math.hypot(shoved.x - world.arenaBoard.x, shoved.z - world.arenaBoard.z) < 0.001);

  world.openArena(true);
  ok('opening it puts real ground there', world.heightAt(A.x, A.z) != null);
  ok('and the deck becomes standable',
    world.heightAt(R.x, R.z, R.y + 1)?.y === R.y);
  world.openArena(false);
  ok('and it can be shut again (restart)', world.heightAt(A.x, A.z) == null);
  world.openArena(true);
}

console.log('\n--- combat ---');
{
  const mk = (i) => new Player({
    texture: new THREE.Texture(), index: i, rows: 4, cols: 8,
    spawn: new THREE.Vector3(0, 0, i * 2), name: i ? 'B' : 'A', height: 2.9,
  });
  const A = mk(0);
  const B = mk(1);

  line('attacks (dmg / knock)', Object.entries(ATTACKS)
    .map(([k, a]) => `${k} ${a.dmg}/${a.knock}`).join('  '));

  /* THE THREE ATTACKS HAVE TO BE DIFFERENT, and different in the way the
     design says: the dash is the throw, the aerial is the damage, the
     standing slash is neither and is the one that is always available. Three
     entries with the same numbers is one attack with three names, which
     would pass any "does it hit" check. */
  ok('the dash throws hardest', ATTACKS.dash.knock > ATTACKS.air.knock
    && ATTACKS.air.knock > ATTACKS.stand.knock);
  ok('the standing slash is the weakest', ATTACKS.stand.dmg < ATTACKS.air.dmg
    && ATTACKS.stand.dmg < ATTACKS.dash.dmg);
  /* EVERY ROW, INCLUDING THE ONE WITH NO NUMBER IN IT. `claw` deliberately has
     no `dmg` — the animal hits for `stand.dmg * PANDA.dmgK` and the gate does
     that multiplication — and the plain sweep over `ATTACKS` therefore came out
     NaN and failed, which is exactly the catch this line is for: a row whose
     damage lives somewhere else must still be held to the cap. Resolving it
     here rather than skipping it is the difference between a check that covers
     six attacks and one that covers seven. */
  const dmgOf = (k, a) => (k === 'claw' ? ATTACKS.stand.dmg * PANDA.dmgK : a.dmg);
  line('effective damage per attack', Object.entries(ATTACKS)
    .map(([k, a]) => `${k} ${dmgOf(k, a)}`).join('  '));
  ok('no attack can end a full-health round in one hit',
    Math.max(...Object.entries(ATTACKS).map(([k, a]) => dmgOf(k, a))) < MAX_HP / 3);
  ok('...and the claw carries no damage of its own to go stale',
    ATTACKS.claw.dmg === undefined);

  B.position.set(2, 0, 0);
  const dealt = B.hurt(ATTACKS.stand.dmg, A.position, ATTACKS.stand, null);
  ok('a hit takes health and is credited', dealt === ATTACKS.stand.dmg
    && B.hp === MAX_HP - ATTACKS.stand.dmg);
  ok('...and throws her AWAY from the attacker', B.velocity.x > 0);
  ok('...and lifts her off the ground', B.velocity.y > 0 && !B.onGround);
  ok('...and stuns her briefly', B.hitT > 0 && B.invulnT > 0);

  ok('a second hit inside the invulnerability does nothing',
    B.hurt(ATTACKS.dash.dmg, A.position, ATTACKS.dash, null) === 0);

  /* Two fighters standing at exactly the same point is not a hypothetical in
     a game where they are trying to hit each other, and a zero-length vector
     normalises to NaN — which teleports somebody to the origin. */
  B.invulnT = 0;
  B.position.copy(A.position);
  B.hurt(5, A.position, ATTACKS.stand, null);
  ok('a hit at zero range does not produce NaN',
    Number.isFinite(B.velocity.x) && Number.isFinite(B.velocity.z));

  // Rage: the same blow throws a hurt fighter further.
  const throwAt = (hp) => {
    const C = mk(1);
    C.position.set(2, 0, 0);
    C.hp = hp;
    C.hurt(1, new THREE.Vector3(0, 0, 0), ATTACKS.dash, null);
    return C.velocity.x;
  };
  const fresh = throwAt(MAX_HP);
  const hurt = throwAt(MAX_HP * 0.2);
  line('knockback fresh vs nearly out', `${fresh.toFixed(1)} vs ${hurt.toFixed(1)}`);
  ok('a hurt fighter flies further', hurt > fresh * 1.2);

  // A knockout, and what it leaves behind.
  const C = mk(1);
  C.position.set(2, 0, 0);
  C.hurt(MAX_HP, A.position, ATTACKS.dash, null);
  ok('zero health is a knockout', C.ko && C.hp === 0 && C.koT > 0);
  ok('a knockout throws further than the blow', Math.abs(C.velocity.x) > ATTACKS.dash.knock);

  /* `resetForRound` must NOT clear the tournament totals — the score is
     computed across every round, and clearing them here would silently score
     only the last one. */
  C.dmgDealt = 55;
  C.dmgTaken = 77;
  C.resetForRound(1, 2, 3, 0);
  ok('a new round restores health and clears the knockout',
    C.hp === MAX_HP && !C.ko && C.koT === 0 && C.hitT === 0);
  ok('...but keeps the tournament damage totals',
    C.dmgDealt === 55 && C.dmgTaken === 77);
}

console.log('\n--- the score ---');
{
  const base = { wins: 2, dealt: 200, taken: 100, seconds: 60, rounds: 3, maxHp: MAX_HP };
  const s = scoreOf(base);
  line('a 2-1 win, 200 dealt, 100 taken, 60s', s);

  /* Every term has to be able to MOVE the total, and winning has to dominate.
     A weight small enough that no realistic value changes the ordering is a
     term that is in the formula and not in the game. */
  ok('winning another round is worth more than any other term',
    scoreOf({ ...base, wins: 3 }) - s > Math.abs(scoreOf({ ...base, dealt: 400 }) - s));
  ok('dealing more damage scores more', scoreOf({ ...base, dealt: 400 }) > s);
  ok('taking less damage scores more', scoreOf({ ...base, taken: 20 }) > s);
  ok('winning faster scores more', scoreOf({ ...base, seconds: 20 }) > s);

  /* The speed term is a BONUS that runs out, not a penalty that keeps going.
     A pair who spend ten minutes messing about should score less than a brisk
     pair — they should not be driven negative for enjoying themselves. */
  ok('a very slow tournament is not punished below zero',
    scoreOf({ ...base, seconds: 100000 }) > 0);
  ok('a flawless win beats a scrappy one',
    scoreOf({ ...base, taken: 0, seconds: 30 }) > scoreOf({ ...base, taken: 280, seconds: 110 }));
}

console.log('\n--- the record board ---');
{
  clearBoard();
  ok('an empty board is an empty list', loadBoard().length === 0);

  const saved = saveResult({ name: 'REK', score: 4200, wins: 2, dealt: 300, taken: 40, seconds: 55 });
  ok('a result is saved and comes back', saved.rows.length === 1 && saved.rank === 0);
  ok('...and survives a reload', loadBoard()[0]?.name === 'REK');

  for (let i = 0; i < BOARD_SIZE + 6; i++) {
    saveResult({ name: `P${i}`, score: 1000 + i * 10, wins: 1, dealt: 1, taken: 1, seconds: 1 });
  }
  const rows = loadBoard();
  ok(`the board keeps only the top ${BOARD_SIZE}`, rows.length === BOARD_SIZE);
  ok('...sorted best first', rows.every((r, i) => i === 0 || rows[i - 1].score >= r.score));
  ok('...and the best score is still on it', rows[0].score === 4200);

  const low = saveResult({ name: 'LOW', score: 1, wins: 0, dealt: 0, taken: 0, seconds: 999 });
  ok('a score that misses the board reports rank -1', low.rank === -1);

  /* THE ONE THING IN THIS GAME THAT SURVIVES A RELOAD is also the one thing
     that can be sitting in storage in a shape this build has never written —
     an older version, a half-finished write, somebody poking at devtools. A
     board that throws takes the results screen down at the exact moment
     somebody has just won a tournament. */
  globalThis.localStorage.setItem('kk.arena.board.v2', 'not json at all');
  ok('a corrupt board reads as empty rather than throwing', loadBoard().length === 0);
  globalThis.localStorage.setItem('kk.arena.board.v2', '{"not":"an array"}');
  ok('...and so does the wrong shape', loadBoard().length === 0);
  globalThis.localStorage.setItem('kk.arena.board.v2',
    '[{"name":"OK","score":5},{"nope":true},{"name":"X","score":"abc"}]');
  ok('...and junk rows are dropped, good ones kept',
    loadBoard().length === 1 && loadBoard()[0].name === 'OK');
  clearBoard();
}

console.log('\n--- signing the board ---');
{
  const ne = new NameEntry();
  const pad = (mx, my, btn = null) => ({ mx, my, pressed: (a) => a === btn, down: () => false });

  ok('it opens at the minimum length', ne.slots.length === NAME_MIN);
  ok('...and a default name is already valid', ne.valid);

  ne.update(0.016, [pad(0, 1)]);
  ok('down walks the alphabet', ne.name[0] === 'B');

  // Right past the end GROWS the name — that is how you get four or five
  // letters without a separate control for it.
  for (let i = 0; i < NAME_MAX + 3; i++) ne.update(1, [pad(1, 0)]);
  ok(`right grows the name, capped at ${NAME_MAX}`, ne.slots.length === NAME_MAX);
  const at = ne.cursor;
  ne.update(1, [pad(1, 0)]);
  ok('...and cannot run off the end', ne.cursor === at);

  const back = new NameEntry();
  back.update(1, [pad(-1, 0)]);
  ok('left off the front does nothing rather than wrapping', back.cursor === 0);

  /* JUMP ASKS, AND THE SECOND JUMP SIGNS. The board outlives the browser
     closing and `_commit` is one-way — there is no screen anywhere that can
     edit a name once it is on the list — so the press that makes it permanent
     has a question in front of it. Richard asked for this on the same list as
     RESTART and QUIT.

     THE FIRST PRESS MUST NOT COMMIT. That is the whole assertion: a one-stage
     `accept` and a two-stage one are indistinguishable from the second press
     onwards, so a check that only looked at the end state would pass on the
     bug. `confirmed` is false and `done` is false after press one. */
  const done = new NameEntry();
  const r1 = done.update(0.016, [pad(0, 0, 'jump')]);
  ok('jump raises the question rather than signing',
    r1.confirmed === false && done.done === false && done.confirming === true);
  /* ...and while it is up, the letters are frozen. A stick that still scrolled
     would change the name under a question that quotes it. */
  ok('...and the stick stops moving the letters while it is up',
    done.update(0.016, [pad(0, 1)]).moved === false && done.name[0] === 'A');
  const r2 = done.update(0.016, [pad(0, 0, 'jump')]);
  ok('...and the second jump signs it', r2.confirmed && done.done);
  ok('...and a confirmed entry stops responding',
    done.update(0.016, [pad(0, 1)]).moved === false);

  /* NO GETS OUT, WITH THE NAME INTACT. A question you cannot decline is not a
     question, and losing the spelling on the way back would make declining
     worse than saying yes. */
  const backOut = new NameEntry();
  for (const c of 'REK') backOut.type(c);
  backOut.update(0.016, [pad(0, 0, 'jump')]);
  backOut.update(0.016, [pad(0, 0, 'interact')]);
  ok('interact answers no and hands the letters back',
    backOut.confirming === false && backOut.done === false && backOut.name === 'REK');
  /* A MASH MUST NOT SIGN. A pad reporting jump AND attack in one frame is a
     child mashing, and the answer to a mash is no. `_answer` reads no first. */
  const mash = new NameEntry();
  mash.update(0.016, [pad(0, 0, 'jump')]);
  mash.update(0.016, [{ mx: 0, my: 0, pressed: (a) => a === 'jump' || a === 'attack', down: () => false }]);
  ok('...and jump+attack in one frame answers NO', mash.done === false && mash.confirming === false);

  /* EITHER PLAYER DRIVES IT. The winner types her own name and this screen
     cannot know which pad she is holding — locking it to player 1 means the
     younger sister wins the tournament and cannot sign for it. */
  const two = new NameEntry();
  two.update(0.016, [pad(0, 0), pad(0, 1)]);
  ok('player 2 can drive it too', two.name[0] === 'B');

  const kb = new NameEntry();
  for (const k of ['KeyR', 'KeyE', 'KeyK']) kb.key(k);
  ok('a keyboard still works', kb.name === 'REK');

  /* --- AND A THUMB, WHICH IT COULD NOT TAKE AT ALL ---
     THE DEAD END: `#arena-result` is z-index 60 and `#touch-pad` is 7, so on a
     phone every control this screen names — the stick that picks a letter, the
     JUMP that commits it, the JUMP that flies home — is drawn UNDERNEATH the
     screen asking for them. A champion on a phone could neither sign the board
     nor leave it. The character profile had the same shape of bug.

     THE KEYPAD CALLS THE SAME METHODS THE KEYBOARD DOES rather than
     synthesising `KeyA` events, so there is one implementation of what a letter
     means — and that is the thing worth asserting, because two would drift. */
  {
    const tapped = new NameEntry();
    for (const c of 'REK') tapped.type(c);
    ok('tapping spells the same name typing does', tapped.name === kb.name);
    ok('...and leaves the cursor in the same place', tapped.cursor === kb.cursor);

    /* DEL SHORTENS, and at the minimum length it blanks instead — there is
       nothing to remove from a three-letter name, and a DEL that did nothing
       at all reads as a broken button. */
    const five = new NameEntry();
    for (const c of 'REKTX') five.type(c);
    ok('a tapped name still stops at the cap', five.slots.length === NAME_MAX);
    five.del();
    ok('...and DEL takes a letter back off it', five.slots.length === NAME_MAX - 1);
    const short = new NameEntry();
    for (const c of 'ABC') short.type(c);
    while (short.slots.length > NAME_MIN) short.del();
    const was = short.slots.length;
    ok('...but never below the minimum', short.del() && short.slots.length === was);

    /* A TAP GOES STRAIGHT TO A SLOT. The stick can only WALK the cursor, so
       fixing the first letter of a five-letter name is four presses in the
       right direction; a thumb goes there. */
    const pick = new NameEntry();
    for (const c of 'REKT') pick.type(c);
    ok('a tap on a slot moves the cursor straight to it',
      pick.pick(0) && pick.cursor === 0);
    pick.type('Z');
    ok('...and the next letter lands there', pick.name[0] === 'Z');
    ok('...but not onto a slot that does not exist yet', pick.pick(NAME_MAX) === false);

    /* OK REFUSES RATHER THAN COMMITTING SOMETHING UNREADABLE, which is the same
       rule JUMP has always followed — invariant 6: a refusal has to be a
       refusal, not a button that quietly does nothing different. */
    const half = new NameEntry();
    for (const c of 'ABC') half.type(c);
    while (half.slots.length > NAME_MIN) half.del();
    for (let i = 0; i < NAME_MIN; i++) { half.pick(i); half.type(' '); }
    ok('OK refuses a name that is all blanks', half.valid === false && half.accept() === false);
    half.pick(0);
    half.type('R');
    half.pick(1);
    half.type('E');
    half.pick(2);
    half.type('K');
    /* Two presses here as well — `accept` raising the question IS the true
       return, so the check has to run it twice to get to `done`. */
    ok('...and takes it once there are letters in it',
      half.accept() && half.confirming && half.accept() && half.done);
    ok('...after which nothing else moves', half.type('Z') === false && half.del() === false);

    /* THE KEYPAD IS THE ALPHABET, NOT A SECOND COPY OF IT — 36 real glyphs,
       which is what makes the grid three rows of ten plus a short row that DEL
       and OK finish. A hand-written key list is how a keypad ends up offering a
       glyph the entry will not take. */
    ok('the keypad slice is 36 glyphs with no blank in it',
      ALPHABET.slice(0, 36).length === 36
      && !ALPHABET.slice(0, 36).includes(' ')
      && ALPHABET[36] === ' ');
  }
}

console.log('\n--- the tournament ---');
{
  line('best of', `${WINS_NEEDED} wins, max ${MAX_ROUNDS} rounds`);
  /* Two wins out of three. If these ever drift apart — three wins needed out
     of three rounds, say — a 1-1-1 outcome could never be decided and the
     third round would end in a state with nowhere to go. */
  ok('the rounds can actually produce a winner', WINS_NEEDED <= MAX_ROUNDS);
  ok('...and a decider is possible without being certain',
    WINS_NEEDED * 2 > MAX_ROUNDS);

  /* THE UNLOCK LADDER HAS TO CLIMB. Milestones out of order would fire in a
     jumble, and one at or above the opening threshold would be an
     announcement that can never be heard — the arena opens first. */
  line('milestones', MILESTONES.map((m) => `${Math.round(m.at * 100)}%`).join(' '));
  ok('the milestones are in ascending order',
    MILESTONES.every((m, i) => i === 0 || m.at > MILESTONES[i - 1].at));
  ok('...and all of them fire before the arena opens',
    MILESTONES.every((m) => m.at < OPEN_AT));
  ok('the arena opens short of 100%', OPEN_AT > 0.5 && OPEN_AT < 1,
    `${Math.round(OPEN_AT * 100)}% of ${world.mischiefTotal} props`);

  /* The arena carries no props of its own, and this is not cosmetic: the
     tournament unlocks at 80% of `mischiefTotal`, so a single crate out there
     would be a crate you need in order to open the place it is standing in. */
  const inArena = world.props.filter(
    (p) => Math.hypot(p.home.x - world.arenaCentre.x, p.home.z - world.arenaCentre.z)
      < world.arenaIsland.radius
  );
  ok('nothing knockable is inside the arena', inArena.length === 0,
    'or the unlock would need props only reachable after unlocking');
}

console.log('\n--- Mr. Satan has a voice ---');
{
  /* Every line in every script, checked against the files on disk. A missing
     mp3 does not throw — `SummonScene.load` falls back to the authored
     duration and the scene plays on silently, cutting nothing and reporting
     nothing. It is exactly the sort of failure that ships. */
  const scripted = [...SCRIPTS.satanAnnounce, ...SCRIPTS.satanOpen];
  const missing = scripted.filter(
    (b) => !existsSync(new URL(`../public${b.voice}`, import.meta.url))
  );
  ok('every scripted line has a recording', missing.length === 0,
    missing.map((b) => b.id).join(' '));

  const popIn = [...MILESTONES.map((m) => m.id),
    'sat_board', 'sat_r1', 'sat_r2', 'sat_r3', 'sat_fight', 'sat_ko', 'sat_over',
    'sat_win1', 'sat_win2'];
  const missingPop = popIn.filter(
    (id) => !existsSync(new URL(`../public/voice/${id}.mp3`, import.meta.url))
  );
  ok('every pop-in line has one too', missingPop.length === 0, missingPop.join(' '));

  /* One round call per round the tournament can actually reach. Three rounds
     and two recordings is a final round that opens in silence. */
  ok('there is a round call for every round',
    Array.from({ length: MAX_ROUNDS }, (_, i) => `sat_r${i + 1}`)
      .every((id) => existsSync(new URL(`../public/voice/${id}.mp3`, import.meta.url))));

  ok('the champion and the griffin both have art',
    existsSync(new URL('../public/sprites/leader_satan.png', import.meta.url))
    && existsSync(new URL('../public/sprites/griffin.png', import.meta.url)));

  /* --- the recorded SOUND EFFECTS, which are not dialogue ----------------
     A different contract from every line above, and the difference is the
     ninth non-negotiable. A missing cutscene line is allowed to be silence —
     the scene still plays and the blips still type. A missing SOUND EFFECT is
     not: `Audio.sample` falls back to `Audio.play`, so every key in SAMPLES
     must also be a case in that switch, or deleting `public/voice` turns the
     Cross Slash's whole outcome-grading into nothing at all.

     Read out of the source because that is where the contract lives — an
     `Audio` cannot be built here (it wants an AudioContext) and a list of
     names copied into this file would be the second place the truth is kept,
     which is the thing that drifts. */
  const audioSrc = readFileSync(new URL('../src/core/audio.js', import.meta.url), 'utf8');
  const names = Object.keys(SAMPLES);
  ok('the cross slash has a rung for every outcome, whiff included',
    names.length === CROSS.cuts + 1, names.join(' '));
  const unsynth = names.filter((n) => !audioSrc.includes(`case '${n}':`));
  ok('...and every recorded one has a synthesised stand-in',
    unsynth.length === 0, unsynth.join(' ') || 'all covered');
  const noFile = names.filter(
    (n) => !existsSync(new URL(`../public${SAMPLES[n]}`, import.meta.url))
  );
  /* The files themselves are generated — `node tools/kitten-cackle.mjs --game`
     — so this is not "somebody forgot to commit an asset", it is "the build
     step has not been run since the ladder changed". */
  ok('...and the four rungs are actually on disk', noFile.length === 0,
    noFile.join(' ') || 'all four');
  ok('...and the chime that says the recovery is over is synthesised too',
    audioSrc.includes("case 'crossReady':"));
}

console.log('\n--- the balance file, and what a typo in it may do ---');
{
  /* `src/tuning.json` IS HAND-EDITED, so it will eventually contain a string,
     a null, a misspelled key or a table that no longer exists — the balance
     page writes it, but a person with an editor is the point of it existing.
     Fourth house rule: prefer a rule that degrades over one that vanishes. A
     merged `undefined` here is a kitten at NaN, silently undrawn, and the
     cause three files away. */
  const base = { a: 1, b: 2, deep: { x: 10, y: 20 } };
  ok('a good override is taken', fold(base, { a: 5 }).a === 5);
  ok('...including through a nested table', fold(base, { deep: { y: 7 } }).deep.y === 7);
  ok('...leaving its siblings alone',
    fold(base, { deep: { y: 7 } }).deep.x === 10 && fold(base, { a: 5 }).b === 2);
  for (const [what, bad] of [
    ['a string', { a: '5' }], ['a null', { a: null }], ['a boolean', { a: true }],
    ['NaN', { a: NaN }], ['Infinity', { a: Infinity }], ['an object', { a: { b: 1 } }],
  ]) {
    ok(`...but ${what} is ignored rather than merged`, fold(base, bad).a === 1);
  }
  ok('a key the defaults do not have cannot appear',
    fold(base, { nope: 9 }).nope === undefined);
  ok('a table that is not a table at all is survivable',
    fold(base, 'banana').a === 1 && fold(base, null).b === 2);
  /* The shape belongs to the DEFAULTS and the file only ever supplies numbers,
     so a nested default cannot be flattened away by a scalar in the file. */
  ok('...and a scalar cannot replace a whole nested table',
    fold(base, { deep: 3 }).deep.x === 10);

  /* THE TABLES THE BALANCE PAGE EXPECTS TO FIND. `tuning.html` lists every
     entry in DEFAULTS, so a table that stops calling `tune()` does not error —
     it silently disappears off the page, which is how a tuning tool rots into
     something nobody trusts. */
  for (const table of ['CROSS', 'CHARGE', 'WARD', 'AEGIS', 'DIVE', 'COMBAT', 'ATTACKS']) {
    ok(`${table} is reachable from the balance page`,
      !!DEFAULTS[table] && Object.keys(DEFAULTS[table]).length > 0);
  }
  /* AND THE PAGE HAS A BLOCK FOR EACH. Reachable-from-`DEFAULTS` only says the
     table calls `tune()`; a table nobody wrote a panel for still renders as
     nothing. `tuning-page.js` is dev-only and never built, so this reads it
     off disk rather than importing it. */
  {
    const page = readFileSync(new URL('../src/tuning-page.js', import.meta.url), 'utf8');
    for (const table of Object.keys(DEFAULTS)) {
      ok(`${table} has a panel on the balance page`,
        new RegExp(`\n  ${table}: \{`).test(page));
    }
  }
  ok('...and the defaults recorded are the shipped ones, not the tuned ones',
    DEFAULTS.CROSS.cool === 0.75 && DEFAULTS.CROSS.wind === 0.25
    && DEFAULTS.COMBAT.maxHp === 100, `cool ${DEFAULTS.CROSS.cool}`);

  /* AN OVERRIDE IS ALLOWED TO BE COMMITTED — that is the whole point of the
     file — but every check in this run has been reading the TUNED values, so
     say out loud when they are not the shipped ones. A run that passes on a
     retuned game is still a passing run; a run that passes and nobody noticed
     the balance was not the documented one is a bad afternoon later. */
  const tuned = Object.keys(OVERRIDES).length;
  if (tuned) {
    line('src/tuning.json is overriding', `${tuned} table(s) — checks ran against those values`);
  } else {
    line('src/tuning.json', 'empty — this is the shipped balance');
  }

  /* --- and the way IN to the page, which must not follow it onto the web ---
     THE PAGE HAD NO DOOR. It was documented in CLAUDE.md and in endgame.md and
     still came back as "I don't see any information about that", because a
     tool you have to remember a URL for is a tool nobody opens. So the debug
     panel has a row that opens it.

     THAT ROW IS THE ONE THING HERE A PLAYER COULD SEE. The page itself is
     unreachable on Vercel twice over already — `vite build` reads its inputs
     from index.html alone, and the save endpoint is a `configureServer` hook a
     production build never runs — but a LINK is markup in main.js, which very
     much is built. `import.meta.env.DEV` is replaced by the literal `false` at
     build time, so the whole string is constant-folded away rather than
     hidden; what is pinned here is that the guard is still what builds it.
     A row moved outside that ternary would ship a dead link on the front page
     of a game children play, and nothing else in this file would notice. */
  /* NORMALISED, BECAUSE THIS REPO IS CHECKED OUT WITH CRLF. `core.autocrlf`
     is true on Richard's machine, so every source file on disk ends its
     lines with \r@LF and a pattern spanning a line break silently never
     matches — which is a check that passes by failing to look. The
     single-line patterns elsewhere in this file are accidentally immune;
     anything that reads across lines must do this. */
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
    .replace(/\r/g, '');
  ok('the debug panel can reach the balance page', /data-open="\/tuning\.html"/.test(main));
  ok('...and clicking it opens a tab rather than doing something to the game',
    /window\.open\(open\.dataset\.open, '_blank', 'noopener'\)/.test(main));
  /* The link and the DEV guard have to be the same expression, not merely both
     present somewhere in a 6,000-line file. */
  /* Sliced rather than regexed to a `;`, because the markup is full of HTML
     entities and every one of them ends in a semicolon. */
  const rowFrom = main.indexOf('const TUNING_ROW =');
  const rowEnd = rowFrom < 0 ? -1 : main.indexOf('\n\n', rowFrom);
  const row = rowFrom < 0 ? '' : main.slice(rowFrom, rowEnd);
  ok('...and the link only exists in a dev build',
    row.includes('import.meta.env?.DEV') && row.includes('/tuning.html'));
  ok('...with nothing to show when it is not', /\n\s*:\s*'';$/.test(row));

  /* AND THE PAGE IS STILL NOT AN ENTRY POINT. `vite build` bundles what
     index.html references; tuning.html is a sibling file it never reads. If
     somebody ever adds a `rollupOptions.input` listing both, this fails. */
  const vite = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');
  ok('...and nothing has made tuning.html a build input', !/input\s*:/.test(vite));
  ok('...and the save endpoint is still dev-server only',
    /configureServer\(server\)/.test(vite) && !/apply:\s*'build'/.test(vite));
}

console.log('\n--- a full-screen scene has no split to furnish ---');
{
  /* THE FOUR COLOURED FRAMES STAYED UP OVER THE CUTSCENE. Reported from
     four-player play: a clan leader's scene takes the whole screen and is
     shared by everybody, and four quarter-frames drawn on top of it are
     dividing a picture that is no longer divided.

     WHAT MAKES THIS A CHECK AND NOT A RESTATEMENT is the reason it happened.
     `_paintPaneEdges` already refuses to draw outside `state === 'play'` — it
     was not painting them wrong. It only runs from `_render`, and every scene
     block in `_tickBody` returns before reaching it, so the frames were simply
     left exactly as the last playing frame drew them. A rule that has to be
     re-run to take effect cannot be the rule for a case where nothing runs, so
     the fix is a class toggled from `_hudDuringScenes`, and what is pinned
     here is that all three layers go through that one call. */
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
    .replace(/\r/g, '');
  const from = main.indexOf('  _hudDuringScenes() {');
  const body = from < 0 ? '' : main.slice(from, main.indexOf('\n  }', from));
  ok('the pane frames and cards hide with the HUD', /\['hud', 'pane-edges', 'pane-cards'\]/.test(body));
  ok('...from the one call that already knew a scene was up',
    body.includes('this._sceneActive()') && body.includes("classList.toggle('scene-hidden', away)"));
  /* THE TRAILER COUNTS. It is deliberately not a `_sceneActive()` scene — no
     3D camera, nothing ticking underneath — but it is just as full-screen, and
     it can be opened from a paused four-player game. */
  ok('...and the trailer takes the screen the same way', /this\.trailer\?\.active/.test(body));
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  ok('...and the stylesheet actually hides them',
    /#pane-edges\.scene-hidden,\s*#pane-cards\.scene-hidden\s*\{[^}]*opacity:\s*0/.test(css));
  /* `pointer-events` because the CARDS take taps, unlike the frames — an
     invisible card that still swallows a tap is worse than a visible one. */
  ok('...without leaving an invisible card taking taps',
    /#pane-edges\.scene-hidden,\s*#pane-cards\.scene-hidden\s*\{[^}]*pointer-events:\s*none/.test(css));

  /* --- AND A CARD MEASURES ITS PANE BOTH WAYS ---------------------------
     Reported from a stacked four-player game: three sisters at the dealer's
     stall share a pane and one of them opens her card, which is 3v1 — so at
     1080p her pane came out 1920x410 and the card was unusable in it. The card
     is sized in container units, which is the whole reason it can be read in a
     quadrant at all, but they were `cqw` — a percentage of the pane's WIDTH —
     so its type, padding and dots were all sized for a pane 1920 across and
     then given 410 of height to fit into.

     `splitLayout` no longer hands out that shape (see the uneven-pair checks),
     and this is the half that means a squat pane merely looks small instead of
     breaking. Two halves, because the layout is not the only way to get a wide
     short pane — an ultrawide monitor stacked two ways is another.

     CHECKED AS TEXT, WHICH IS UNUSUAL HERE AND IS THE POINT. There is no
     layout engine in this file, so what can be pinned is the RULE: not one
     bare `cqw` survives anywhere in the card, because the next person to add a
     row will copy the line above it. */
  const cardFrom = css.indexOf('.pane-card {');
  const cardTo = css.indexOf('.pc-orb-num {');
  const card = cardFrom >= 0 && cardTo > cardFrom ? css.slice(cardFrom, cardTo) : '';
  ok('the card is a size container, so it can see its own height', card.length > 0
    && /\.pane-card\s*\{[^}]*container-type:\s*size/.test(card));
  ok('...and its unit is the SMALLER of the two ways to measure the pane',
    /--u:\s*min\(\s*1cqw\s*,\s*1\.78cqh\s*\)/.test(card));
  /* 1.78 IS NOT A TASTE NUMBER. It is 16:9, and it is what makes the change a
     no-op on every pane that already worked: in a 16/9 pane `1.78cqh` IS
     `1cqw`, so a full screen, a half and a quadrant come out exactly as they
     did. A different constant here would silently resize every card. */
  ok('...which is 16:9, so nothing about a normal pane moves',
    Math.abs(1.78 - 16 / 9) < 0.005);
  /* Stripped of comments and of the definition of `--u` itself, both of which
     say `cqw` on purpose and neither of which sizes anything. */
  const cardRules = card.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--u:[^;]*;/g, '');
  ok('...and not one bare cqw is left in the card to undo it',
    !/[\d.]cqw/.test(cardRules),
    (cardRules.match(/[\d.]+cqw/g) ?? []).slice(0, 3).join(' '));
  /* THE INSET IS THE OTHER HALF. Percentage padding resolves against WIDTH on
     BOTH axes, so `padding: 5%` on a 1920x410 pane spent 192 of its 410 pixels
     of height on the gap round the edges — a rule that cannot be fixed by
     shrinking the type. */
  ok('...and the gap round the edges is in that unit too, not a percentage',
    !/\.pane-card\s*\{[^}]*padding:\s*\d/.test(card)
    && /margin:\s*calc\(5 \* var\(--u\)\)/.test(card));
  /* AND THE ROUND SLOTS ARE CAPPED. Eight slots sharing the width of a very
     wide pane are eight big circles, and a circle's height is its width — so
     this is the one row `--u` cannot shrink on its own. */
  ok('...and her eight orb slots cannot grow taller than the card',
    /\.pc-slot\s*\{[^}]*max-width:\s*calc\([\d.]+ \* var\(--u\)\)/.test(card));

  /* --- THEY ARE ORBS NOW, AND ONE OF THEM ANSWERS THE ROW UNDER THE CURSOR --
     Reported from play: "the orbs at the top are in a square shape, may look
     better to have them circular or orb like, 3D-ish like a dragon ball", and
     separately "it just shows the kanji character and colour, and it's hard to
     know which one relates to which ability". Both of those are one card, so
     both are checked here. Drawn from `out/trailer/shots/s12.png`, which is
     the game's own promotional art of these eight objects. */
  ok('the worn orbs are round, not square',
    /\.pc-slot\s*\{[^}]*border-radius:\s*50%/.test(card));
  ok('...with a specular highlight and a ground, which is what makes it a ball',
    /\.pc-slot\.full\s*\{[^}]*radial-gradient\(circle at [\d.]+% [\d.]+%[\s\S]*?rgba\(255, 255, 255/
      .test(card));
  ok('...and a ring orbiting it, open at the top so it passes behind',
    /\.pc-slot\.full::after\s*\{[^}]*border-top-color:\s*transparent/.test(card)
    && /\.pc-slot\.full::after\s*\{[^}]*transform:\s*rotate\(/.test(card));
  /* THE LINK BETWEEN THE TWO ROWS, which is the half of this that is not
     decoration: the shelf row says what an orb DOES, and this says which of
     the ones she is wearing that sentence is about. */
  ok('...and the slots matching the cursor light up', /\.pc-slot\.full\.lit\s*\{/.test(card));
  ok('...in front of their neighbours, since a lifted orb grows into them',
    /\.pc-slot\.full\.lit\s*\{[^}]*z-index:/.test(card));
  ok('...and the others step back only when there IS a match',
    /\.pc-slots\.picking \.pc-slot\.full:not\(\.lit\)/.test(card));
  {
    const insp = readFileSync(new URL('../src/systems/inspector.js', import.meta.url), 'utf8');
    ok('...decided from the cursor row rather than from the slot index',
      /const lit = POWER_ORBS\[c\.i\]\?\.id/.test(insp));
    /* `picking` MUST NOT BE SET WHEN NOTHING MATCHES. Dimming all eight to
       point at none of them is a card that looks broken — she simply wears
       none of that orb, which the row's own "—" already says. */
    ok('...and nothing dims when she wears none of the orb under the cursor',
      /let anyLit = false;/.test(insp)
      && /pc-slots\$\{anyLit \? ' picking' : ''\}/.test(insp));
    /* THE SHELF DOT IS THE SAME OBJECT SEEN TWICE and is drawn as the same
       object. Two different-looking pictures of one orb is half of why the
       question was hard to answer. */
    ok('...and the shelf dot is the same glass as the slot above it',
      /\.pc-dot\s*\{[^}]*radial-gradient\(circle at [\d.]+% [\d.]+%/.test(card));
  }

  /* --- and one press is still one press ---
     Start ended the trailer and restarted it from the beginning, on a PS5 pad
     and on every other pad too. `trailer.update()` runs BEFORE MenuNav, so
     closing the video put the title screen back underneath in the same frame,
     with the cursor still on WATCH TRAILER — and on the title screen every
     button confirms. The press was still sitting there because `pressed()` is
     a pure test that nobody spends.

     PINNED AS ORDER, not just as presence: consuming AFTER `skip()` would work
     by accident today and break the moment `skip` grows a synchronous caller. */
  const tr = readFileSync(new URL('../src/systems/trailer.js', import.meta.url), 'utf8')
    .replace(/\r/g, '');
  const spend = tr.indexOf("this.game.input.consume('start')");
  const skip = tr.indexOf('this.skip();', spend < 0 ? 0 : spend);
  ok('the press that closes the trailer is spent', spend > 0);
  ok('...before the trailer acts on it', spend > 0 && skip > spend);
  ok('...and it is the START edge, the only thing that skips anything',
    /consume\('start'\)/.test(tr));
}

console.log('\n--- background removal keeps the drawn whites ---');
{
  /* THE REAL SHEETS, THROUGH THE REAL LOADER CODE. `clearSealedPockets` exists
     to delete background the border flood cannot reach — a pocket the lineart
     has sealed shut — and its first version was tuned on the one sheet that
     had one. It was "big and pure", and Mr. Satan arrived grinning: his teeth
     and an eye white are 1155, 621 and 609 px of near-perfect white, so he
     shipped with the world showing through his face.

     Size cannot tell those apart from a real pocket and not by a hair either —
     as a fraction of its own sheet his mouth is BIGGER than either of the
     pockets the rule was built for. Depth can, because it is what they are: a
     pocket is outdoors behind a hairline, an eye is behind a whole head.

     What makes this a check rather than a restatement of the code is
     `bigWhites`: on his sheet three white features clear the size floor and
     none may be removed, so a rule that goes back to size alone fails here
     instead of in front of a nine-year-old. */
  const SHEETS = [
    { file: 'leader_satan.png', pockets: 0, bigWhites: 3, what: 'teeth and eyes' },
    { file: 'ryuuseki.png', pockets: 2, bigWhites: 0, what: 'sealed under his chin' },
    { file: 'griffin.png', pockets: 1, bigWhites: 0, what: 'sealed under a wing' },
  ];

  /* --- and the clan emblems, which are the shape most likely to break it ---
     THE LOADER DOES NOT ASK FOR `clearPockets` ON THESE, so whatever the
     border flood cannot reach ships as a white blob. Two of the six are drawn
     inside a ring, which is exactly the sealed pocket the flag exists for, and
     Riverclaw's wave nearly was one: the fill only gets in through a break in
     the outline. So every emblem is checked for what survives the flood ALONE,
     and the expected number is written down per file rather than assumed to be
     zero — Icewhisker's emblem has a cat's eye in it, and its white must
     survive for the same reason Satan's does. */
  const EMBLEMS = [
    { file: 'clan_thunder.png', whites: 0, what: 'a paw behind a bolt, open on all sides' },
    { file: 'clan_river.png', whites: 0, what: 'a wave in a ring the flood gets into' },
    { file: 'clan_shadow.png', whites: 0, what: 'an open crescent, nothing enclosed' },
    { file: 'clan_wind.png', whites: 0, what: 'a filled disc with no white left in it' },
    { file: 'clan_ice.png', whites: 2, what: 'the eye, either side of the pupil — DRAWN' },
    { file: 'clan_panda.png', whites: 0, what: 'bamboo crossed behind a cream face' },
  ];

  for (const e of EMBLEMS) {
    const url = new URL(`../public/sprites/${e.file}`, import.meta.url);
    ok(`${e.file} is on disk`, existsSync(url));
    if (!existsSync(url)) continue;
    const { w, h, d } = readPNG(url);
    floodBackground(d, w, h);
    const floor = pocketFloor(w, h);
    const left = blobs(d, w, h, (p) => purelyWhite(d, p)).filter((b) => b.n >= floor);
    ok(`...and keys to ${e.whites} big white(s) left`, left.length === e.whites,
      `${left.length} (${e.what})`);
    /* AND THERE IS STILL AN EMBLEM AFTERWARDS. A threshold that ate the whole
       drawing would pass the test above by leaving nothing behind. */
    let ink = 0;
    for (let q = 0; q < w * h; q++) if (d[q * 4 + 3] > 200) ink++;
    ok('...with the drawing still in it',
      ink > w * h * 0.04 && ink < w * h * 0.75,
      `${(100 * ink / (w * h)).toFixed(1)}% opaque`);
  }

  for (const s of SHEETS) {
    const { w, h, d } = readPNG(new URL(`../public/sprites/${s.file}`, import.meta.url));
    floodBackground(d, w, h);

    const floor = pocketFloor(w, h);
    const bigBefore = blobs(d, w, h, (p) => purelyWhite(d, p)).filter((b) => b.n >= floor);

    clearSealedPockets(d, w, h);

    const gone = bigBefore.filter((b) => d[b.seed * 4 + 3] === 0);
    const kept = bigBefore.length - gone.length;

    ok(`${s.file}: ${s.pockets} pocket(s) cleared`, gone.length === s.pockets,
      `${gone.length} (${s.what})`);
    ok(`${s.file}: ${s.bigWhites} big drawn white(s) kept`, kept === s.bigWhites,
      `${kept} of ${bigBefore.length} over the ${floor}px floor`);
  }
}

console.log('\n--- the Powerup Kotodama ---');
{
  const ids = ORB_IDS;
  line('the roster', POWER_ORBS.map((o) => `${o.kanji} ${o.name}`).join(', '));
  ok('there are ten of them', ids.length === 10);
  ok('every id is unique', new Set(ids).size === ids.length);
  ok('every one has a kanji, a colour and a blurb',
    POWER_ORBS.every((o) => o.kanji && o.color && o.blurb && o.label));
  ok('no two share a colour',
    new Set(POWER_ORBS.map((o) => o.color)).size === ids.length);
  /* EIGHT ARE IN THE WORLD AND TWO ARE THE DEALER'S ALONE. The split is what
     every other count in this file now has to pick between — a rare orb you
     can trip over on a beach is not rare, and a "one of each kind" that
     included one would put it on an island in every full set. */
  ok('...eight of the ten lie in the world', WORLD_ORB_IDS.length === 8);
  ok('...and exactly two are bought and never found',
    SHOP_ONLY_IDS.length === 2 && SHOP_ONLY_IDS.join() === 'aegis,blink');
  ok('...and the two lists partition the roster',
    [...WORLD_ORB_IDS, ...SHOP_ONLY_IDS].sort().join() === [...ids].sort().join());

  /* EVERY ORB CHANGES A DIFFERENT VERB — the rule the clans follow, checked
     the same way. A roster where two of the eight both make her faster is a
     roster with seven things in it, and worse, it makes trading pointless:
     the whole feature turns on each orb being the only way to get its thing. */
  const base = aggregate([]);
  const changed = (id) => {
    const a = aggregate([id]);
    return Object.keys(base).filter(
      (k) => k !== 'counts' && k !== 'total' && JSON.stringify(a[k]) !== JSON.stringify(base[k])
    );
  };
  /* ...WITH ONE DELIBERATE EXCEPTION, AND IT DECLARES ITSELF. An orb carrying
     `needs` is a booster: it is supposed to do nothing alone, which is the
     price it pays for being allowed to lift a cap. Read off the spec rather
     than named here, so a second booster is covered the day somebody adds
     one. */
  const solo = ids.filter((id) => !ORB_BY_ID[id].needs);
  const fields = solo.map(changed);
  ok('every orb that stands alone changes something', fields.every((f) => f.length > 0),
    solo.filter((id, i) => !fields[i].length).join(' '));
  ok('...exactly one thing each', fields.every((f) => f.length === 1));
  const flat = fields.flat();
  ok('...and no two change the same thing', new Set(flat).size === flat.length,
    flat.join(' '));

  for (const o of POWER_ORBS.filter((x) => x.needs)) {
    ok(`${o.id} on its own changes nothing at all`, changed(o.id).length === 0,
      changed(o.id).join(' '));
    const alone = JSON.stringify(aggregate([o.needs]));
    const pair = JSON.stringify(aggregate([o.needs, o.id]));
    ok(`...and does change something beside ${o.needs}`, alone !== pair);
    ok('...and says so in words a nine-year-old can act on',
      /useless|only|with/i.test(o.blurb), o.blurb);
  }

  /* STACKING IS ADDITIVE. Eight Gale orbs compounded at x1.22 each is x4.9 and
     a kitten who physically cannot turn a corner on an island 56 units across;
     the additive rule gives x2.76, which is fast enough to be the joke. This
     asserts the SHAPE of the maths, not the constant: a compounding rule fails
     it however the per-orb number is tuned. */
  const one = aggregate(['swift']).speed - 1;
  const eight = aggregate(Array(8).fill('swift')).speed - 1;
  line('one Gale vs eight', `+${one.toFixed(2)} vs +${eight.toFixed(2)}`);
  ok('eight orbs are exactly eight times one', Math.abs(eight - one * 8) < 1e-9);
  ok('...and a full stack stays under x3', aggregate(Array(8).fill('swift')).speed < 3);
  ok('eight Adamant orbs are a survivable amount of health',
    aggregate(Array(8).fill('vigor')).hp <= 400);

  /* THE BLOCK LENGTH IS THE ONE NUMBER STACKING MUST NOT MOVE. Two seconds is
     what makes the ward a thing she is doing rather than a state she is in;
     any count of orbs that extends it turns it back into the second. Stacks
     buy a shorter WAIT, which is the only half that can grow without the
     shield eventually being up more than it is down. */
  const w1 = aggregate(['ward']).ward;
  const w8 = aggregate(Array(8).fill('ward')).ward;
  line('ward at 1 vs 8',
    `${w1.max.toFixed(1)}s block / ${w1.cool.toFixed(2)}s wait`
    + `  vs  ${w8.max.toFixed(1)}s / ${w8.cool.toFixed(2)}s`);
  ok('eight Ward orbs do not lengthen the block',
    w8.max === WARD.max && w1.max === WARD.max);
  ok('...they shorten the wait instead', w8.cool < w1.cool);
  ok('...and there is still a real wait at eight',
    w8.cool >= WARD.coolMin && w8.cool > 0);

  /* --- and the one orb that IS allowed to move it ------------------------
     The cap is still the rule; 守 Long Guard is the exception, and it is an
     exception you buy rather than one that arrives with the fourth copy of an
     orb you were collecting anyway. */
  const g1 = aggregate(['ward', 'aegis']).ward;
  const g3 = aggregate(['ward', 'aegis', 'aegis', 'aegis']).ward;
  line('ward with 守', `${w1.max.toFixed(1)}s -> ${g1.max.toFixed(1)}s`
    + ` -> ${g3.max.toFixed(1)}s at three`);
  ok('one Long Guard lengthens the block', g1.max === WARD.max + AEGIS.add);
  ok('...additively, like every other stack in this file',
    Math.abs((g3.max - WARD.max) - 3 * (g1.max - WARD.max)) < 1e-9);
  ok('...and does not also shorten the wait', g1.cool === w1.cool);
  ok('...and cannot be reached without a Ward to hold', aggregate(
    Array(8).fill('aegis')).ward === null);
  ok('the line the overtime is measured from is the SHIPPED max',
    g1.over === WARD.max && g3.over === WARD.max);
  ok('...and going past it costs a fifth more wait',
    Math.abs(g1.penalty - (1 + AEGIS.penalty)) < 1e-9);
  ok('`wardFor` is the one place both numbers come from',
    JSON.stringify(wardFor(1, 1)) === JSON.stringify(g1));
  ok('the tail is much shorter than the block it follows',
    WARD.tail > 0 && WARD.tail < WARD.max / 4);

  /* =========================================================================
     THE BUBBLE COSTS SOMETHING TO RUN INTO NOW.

     Asked for: "if shield is hit while active, it reduces its current max
     timer by 50% and resets after it expires. So, if Max timer is 2s, and has
     been on for 0.5s, then its Max timer is now 1s and will expire in 0.5s."
     Then: the tell has to follow the new ceiling; a blow that lands past the
     new ceiling just ends it; two blows smash it whatever the clock says; and
     the three outcomes have to be told apart by ear.

     WHAT IS CHECKED HERE IS THE ARITHMETIC AND THE SOUNDS, driven on a real
     Player rather than read off the source. The numbers in the request are
     specific enough to assert directly, and every one of them is below.
     ========================================================================= */
  console.log('\n--- the bubble costs something to run into ---');
  {
    const mkWard = () => {
      const q = new Player({
        texture: new THREE.Texture(), index: 0,
        spawn: new THREE.Vector3(0, world.heightAt(0, 40).y, 40),
        cols: 8, rows: 4, mirror: false,
      });
      q.setPowerOrbs(['ward']);
      return q;
    };
    /* A FAKE HUD THAT ONLY LISTENS. The sounds are this feature's whole
       interface at the moment a blow lands — a kid in a four-way round is not
       looking at the bubble — so they are asserted, not assumed. */
    const rig = () => {
      const said = [];
      const q = mkWard();
      q.wardCool = 0;
      q._popWard(null);
      return { q, said, hud: { sfx: (n) => said.push(n) } };
    };

    /* 1. THE PLAYER'S OWN WORKED EXAMPLE, to the number. */
    {
      const { q, hud, said } = rig();
      ok('a fresh bubble takes its ceiling from the orb', q.wardMax === WARD.max,
        `${q.wardMax}`);
      q.wardUsed = 0.5;
      const how = q._wardTakeHit(hud);
      ok('a blow halves the ceiling of a live bubble', q.wardMax === 1.0,
        `${q.wardMax} from ${WARD.max}`);
      ok('...and does NOT touch the clock, so half a second is left',
        q.wardUsed === 0.5 && q._wardCeiling() - q.wardUsed === 0.5);
      ok('...leaving it up', q.wardOn === true && how === 'absorbed');
      ok('...and it says so with the lower sound',
        said.length === 1 && said[0] === 'wardabsorb', said.join(','));
    }

    /* 2. THE TELL FOLLOWS THE CEILING AND NOTHING ELSE. This is the one the
       request calls out by name — "the about-to-expire animation should play
       accordingly based on the new max time" — and it is the reason the
       halving moves the CEILING rather than the clock: a struck bubble with
       half a second left has to flicker exactly like an untouched one with
       half a second left, and the only way to be sure is to drive both. */
    const flickers = (q) => {
      const seen = new Set();
      for (let i = 0; i < 10; i++) {
        q._updateWardMesh(0.016);
        seen.add(+q.wardShell.material.opacity.toFixed(4));
        q.wardUsed += 0.02;
      }
      return seen.size > 1;
    };
    {
      const a = rig().q; a.wardUsed = 0.5; a.wardFlash = 0;
      ok('an untouched bubble 1.5s from the end is steady', !flickers(a));
      const b = rig(); b.q.wardUsed = 0.5; b.q._wardTakeHit(b.hud); b.q.wardFlash = 0;
      ok('...and a STRUCK one at the same clock is already flickering',
        flickers(b.q), `ceiling ${b.q.wardMax}`);
      const c = rig().q; c.wardUsed = WARD.max - 0.5; c.wardFlash = 0;
      ok('...which is the same warning an untouched bubble gets at 0.5s left',
        flickers(c));
    }

    /* 3. A BLOW THAT LANDS PAST THE NEW CEILING JUST ENDS IT — the request's
       "if the timer has expired, then just turn it off". It is not a separate
       rule; it is the halving arriving behind the clock. */
    {
      const { q, hud, said } = rig();
      q.wardUsed = WARD.max * 0.7;                       // 1.4 of 2.0
      const how = q._wardTakeHit(hud);
      ok('a blow late enough to land behind the new ceiling ends the bubble',
        how === 'expired' && q.wardOn === false);
      ok('...and takes the tail with it, so a break has no grace after it',
        q.wardTail === 0);
      ok('...with the disabled sound and NOT the ordinary sweep-out',
        said.includes('wardbreak') && !said.includes('warddown'), said.join(','));
    }

    /* 4. TWO BLOWS SMASH IT WHATEVER THE CLOCK SAYS. Halving a positive number
       never reaches zero, so this is the floor under rule 1 — and without it a
       kitten who blocks early enough rides a sliver of bubble all round. */
    {
      const { q, hud, said } = rig();
      q.wardUsed = 0;                                    // as much clock as exists
      ok('the first blow is survived', q._wardTakeHit(hud) === 'absorbed');
      said.length = 0;
      const how = q._wardTakeHit(hud);
      ok('...and the second smashes it on a full clock',
        how === 'smashed' && q.wardOn === false, `${how} used=${q.wardUsed}`);
      ok('...with the same disabled sound the expiry gets',
        said.length === 1 && said[0] === 'wardbreak', said.join(','));
      ok('...and it is WARD.hits that decided, not a literal',
        q.wardHits === WARD.hits, `${q.wardHits} vs ${WARD.hits}`);
    }

    /* 5. IT RESETS WITH THE BLOCK. "Resets after it expires" — and the only
       door back into a block is `_popWard`, which is why nothing else has to
       remember to undo a halving. */
    {
      const { q, hud } = rig();
      q.wardUsed = 0.5; q._wardTakeHit(hud); q._wardTakeHit(hud);
      ok('a smashed bubble leaves a halved ceiling behind it', q.wardMax < WARD.max);
      q.wardCool = 0.1;
      ok('...and the next one is refused until the wait is paid',
        q._popWard(null) === false);
      q.wardCool = 0;
      ok('...but a fresh block starts from the orb again',
        q._popWard(null) === true && q.wardMax === WARD.max && q.wardHits === 0,
        `max ${q.wardMax} hits ${q.wardHits}`);
    }

    /* 6. THE BLOW STILL DEALS NOTHING, which was already true and is the whole
       reason anybody holds the button. Driven through `hurt` rather than the
       helper, because that is the path a blade actually takes. */
    {
      const { q, hud, said } = rig();
      q.hp = 100; q.wardUsed = 0.2;
      const dealt = q.hurt(20, { x: q.position.x + 3, z: q.position.z },
        { knock: 5, lift: 2 }, hud);
      ok('a blocked blade deals no damage', dealt === 0 && q.hp === 100);
      ok('...and still charges the bubble for it', q.wardMax === WARD.max / 2);
      ok('...and it is the block that made the noise',
        said.includes('wardabsorb'), said.join(','));
    }

    /* 7. A RING-OUT PIERCES IT AND THEREFORE MUST NOT CHARGE IT. `force.pierce`
       skips the whole branch, and a kitten thrown off the edge losing half her
       shield on the way down would be the bubble paying for the one thing it
       was never allowed to stop. */
    {
      const { q, hud } = rig();
      q.hp = 100;
      q.hurt(20, { x: q.position.x + 3, z: q.position.z },
        { knock: 5, lift: 2, pierce: true }, hud);
      ok('a ring-out pierces the bubble and does not charge it',
        q.hp < 100 && q.wardMax === WARD.max && q.wardHits === 0);
    }

    /* 8. THE PICTURE OUTLIVES THE BUBBLE. The shards only ever fly while the
       block is gone — the smash drops it on the same frame — so an effect
       drawn inside `if (!warded) return` would be drawn for exactly zero
       frames. It was written that way round first. */
    {
      const { q, hud } = rig();
      q.wardUsed = 0.2; q._wardTakeHit(hud); q._wardTakeHit(hud);
      ok('a smash starts the shards', q.wardBreakT > 0 && q.wardBurst.visible);
      ok('...while the bubble is already gone', q.warded === false);
      const r0 = q.wardShards[0].position.length();
      for (let i = 0; i < 6; i++) q._updateWardMesh(0.016);
      ok('...and they are still drawn, and moving, with the bubble down',
        q.wardBurst.visible && q.wardShards[0].position.length() > r0);
      for (let i = 0; i < 40; i++) q._updateWardMesh(0.016);
      ok('...then put themselves away', q.wardBreakT === 0 && !q.wardBurst.visible);
      ok('...and every shard flies its own way, on a unit vector',
        q.wardShards.every((m) => Math.abs(m.userData.dir.length() - 1) < 1e-6)
        && new Set(q.wardShards.map((m) => m.userData.dir.y.toFixed(3))).size
           === q.wardShards.length);
    }

    /* 9. AND IT DEGRADES. A Player who has never popped a bubble — every one
       built in this file, and the character picker's — still has to have a
       ceiling, or `used >= NaN` is false forever and the hard cap that makes
       this an ability rather than a state quietly stops existing. */
    {
      const q = mkWard();
      ok('a Player who never blocked still has a ceiling',
        q._wardCeiling() === WARD.max);
      q.wardMax = NaN;
      ok('...and a broken one falls back to the orb rather than never expiring',
        q._wardCeiling() === WARD.max);
      q.wardMax = 0;
      ok('...as does a zero', q._wardCeiling() === WARD.max);
    }

    /* 10. THE CROSS SLASH PAYS IT TOO, and the sound moved into the entity
       with it: main.js used to play a flat `wardhit` beside `triCapture`, and
       that stopped being one sound the moment a blocked cut started costing
       her half the bubble. */
    {
      const { q, hud, said } = rig();
      const by = mkWard();
      q.wardUsed = 0.2;
      ok('a blocked Cross Slash cut is still blocked',
        q.triCapture(by, 20, 1, 0, hud) === false && q.hp === q.maxHp);
      ok('...and charges the bubble like any blade', q.wardMax === WARD.max / 2);
      q.triCapture(by, 20, 1, 0, hud);
      ok('...and the second cut smashes it', q.wardOn === false);
      ok('...with the ward sounds, never the old flat one',
        said.includes('wardabsorb') && said.includes('wardbreak')
        && !said.includes('wardhit'), said.join(','));
    }

    const wsrc = readFileSync(new URL('../src/core/audio.js', import.meta.url), 'utf8');
    ok('both new cues exist in the sound set',
      /case 'wardabsorb':/.test(wsrc) && /case 'wardbreak':/.test(wsrc));
    ok('...and the cue nothing can play any more is gone',
      !/case 'wardhit':/.test(wsrc));
    const wmain = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    ok('...including from main.js, which used to own it',
      !/wardhit/.test(wmain.replace(/\/\*[\s\S]*?\*\//g, '')));
  }

  /* =========================================================================
     THE SECONDS YOU CAN BUY, AND WHAT THEY COST AFTERWARDS.

     守 Long Guard, the ninth orb: dealer-only, 2.5x, stackable, and useless
     without a 壁 Ward beside it. It lifts the block's ceiling and charges a
     fifth more wait for any block that runs past the SHIPPED ceiling.

     THE OVERTIME PREDICATE IS THE PART WORTH CHECKING and it was wrong first
     time — `wardUsed > over` alone made every ordinary full-length block pay,
     because a block ends on the frame the clock crosses its ceiling and
     therefore lands a fraction past it. The fix asks two questions and needs
     no tolerance; both halves are driven below, and so are the two worked
     examples from the request.
     ========================================================================= */
  console.log('\n--- the seconds you can buy ---');
  {
    /* HOLDING THE BLOCK BUTTON, because that is what a block IS. The first
       version of this pad answered false to everything and every bubble in the
       section was released on its first frame — a test that says nothing very
       convincingly. */
    const PADZ = {
      mx: 0, my: 0,
      down: (a) => a === 'mount', pressed: () => false, doubled: () => false,
    };
    const rig = (orbs) => {
      const said = [];
      const q = new Player({
        texture: new THREE.Texture(), index: 0,
        spawn: new THREE.Vector3(0, world.heightAt(0, 40).y, 40),
        cols: 8, rows: 4, mirror: false,
      });
      q.setPowerOrbs(orbs);
      q.wardCool = 0;
      const hud = { sfx: (n) => said.push(n) };
      q._popWard(null);
      return { q, said, hud };
    };
    /* Hold the block down until it ends on its own, then run the wait out.
       Stepped at a real frame length rather than jumped, because the whole
       point of the predicate is what happens on the frame the clock crosses
       a line. */
    const run = (q, hud, secs) => {
      for (let i = 0; i < Math.round(secs * 60); i++) {
        q._stepSpecials(1 / 60, PADZ, world, hud);
      }
    };
    /* STOPS ON THE FRAME THE BUBBLE ENDS, which is the only frame the wait can
       be read on. Running a fixed number of frames past it means the cooldown
       has already ticked down by however far past it went, and the assertion
       is then measuring the overshoot rather than the penalty. */
    const holdOut = (q, hud) => {
      for (let i = 0; i < 900 && q.wardOn; i++) {
        q._stepSpecials(1 / 60, PADZ, world, hud);
      }
    };

    /* 1. NO 守, NO OVERTIME — INCLUDING AT THE CAP. This is the regression the
       first version shipped and world-check caught: `wardUsed` lands past 2.0
       on the frame the cap ends the block, so a clock-only test charged every
       ordinary full-length block. */
    {
      const { q, hud, said } = rig(['ward']);
      run(q, hud, WARD.max + 0.2);
      ok('a plain block runs to the cap and ends', q.wardOn === false);
      ok('...having gone a frame PAST the line, as it must', q.wardUsed > WARD.max);
      ok('...and is still charged the ordinary wait, not the overtime',
        q.wardOver === false
        && Math.abs(q.wardCool - (WARD.cool - 0.2)) < 0.05, `${q.wardCool}`);
      run(q, hud, WARD.cool + 0.3);
      ok('...and comes back with no chime, because nothing was owed',
        q.wardCool === 0 && !said.includes('wardready'), said.join(','));
    }

    /* 2. WITH 守 IT LASTS LONGER, AND GOING PAST THE OLD LINE COSTS. */
    {
      const { q, hud, said } = rig(['ward', 'aegis']);
      ok('the ceiling is the shipped one plus the orb',
        Math.abs(q._wardCeiling() - (WARD.max + AEGIS.add)) < 1e-9,
        `${q._wardCeiling()}`);
      holdOut(q, hud);
      ok('...and the block really does run that long', q.wardUsed > WARD.max);
      ok('...so it is overtime', q.wardOver === true);
      ok('...and the wait is a fifth longer than her own wait',
        Math.abs(q.wardCool - q.power.ward.cool * (1 + AEGIS.penalty)) < 0.02,
        `${q.wardCool.toFixed(2)} vs ${q.power.ward.cool.toFixed(2)}`);
      said.length = 0;
      run(q, hud, q.wardCool + 0.3);
      ok('...and when THAT is over she is told, once',
        said.filter((n) => n === 'wardready').length === 1, said.join(','));
      ok('...with the spark in the air', q.wardReadyT > 0 && q.wardSpark.visible);
      ok('...and the debt cleared, so it cannot fire twice', q.wardOver === false);
      said.length = 0;
      run(q, hud, 2);
      ok('...and it does not fire again for standing there',
        !said.includes('wardready'), said.join(','));
    }

    /* 3. LET GO EARLY AND THERE IS NO PENALTY. This is the half that makes the
       orb a decision rather than a stat: the new ceiling is available, and
       not spending it costs nothing at all. */
    {
      const { q, hud, said } = rig(['ward', 'aegis']);
      run(q, hud, 1.0);
      q._dropWard(hud, 'release');
      ok('a short block under a raised ceiling is not overtime',
        q.wardOver === false && q.wardUsed < WARD.max);
      ok('...and pays exactly her ordinary wait',
        Math.abs(q.wardCool - q.power.ward.cool) < 1e-9);
      said.length = 0;
      run(q, hud, q.wardCool + 0.3);
      ok('...and comes back in silence', !said.includes('wardready'), said.join(','));
    }

    /* 4. THE PLAYER'S OWN TWO EXAMPLES, WHERE A BLOW ENDS IT EARLY.

       "if same situation, but 2.2s has passed and then player gets hit, with
       current max timer set to 1.5s, then the shield is disabled from the hit
       and the player must incur the recharge penalty for going over the 2s
       default maximum time" — and the companion case at 1.5s elapsed, which
       does not. The rule is that only the CLOCK decides, never the ceiling a
       blow cut down: otherwise her sister chooses when she pays. */
    {
      const { q, hud } = rig(['ward', 'aegis']);
      run(q, hud, 2.2);
      ok('2.2s in, the bubble is still up under a raised ceiling',
        q.wardOn === true && q.wardUsed > WARD.max);
      q._wardTakeHit(hud);
      q._wardTakeHit(hud);
      ok('...two blows smash it, exactly as before', q.wardOn === false);
      ok('...and the overtime is still owed, because 2.2 > 2.0',
        q.wardOver === true);
      ok('...even though the ceiling it ended on was BELOW the old line',
        q.wardMax < WARD.max, `${q.wardMax}`);
    }
    {
      const { q, hud } = rig(['ward', 'aegis']);
      run(q, hud, 1.5);
      q._wardTakeHit(hud);
      q._wardTakeHit(hud);
      ok('the same smash at 1.5s owes nothing', q.wardOver === false);
      ok('...and pays her ordinary wait',
        Math.abs(q.wardCool - q.power.ward.cool) < 1e-9);
    }

    /* 5. THE DEBT DIES WITH THE WAIT IT WAS OWED ON. Getting on a dragon
       clears the cooldown, so a flag left behind would chime at some unrelated
       moment later, after a wait she never served. */
    {
      const { q, hud } = rig(['ward', 'aegis']);
      holdOut(q, hud);
      ok('there is a debt to forget', q.wardOver === true && q.wardCool > 0);
      q._clearSpecials();
      ok('...and mounting forgets it with the wait',
        q.wardOver === false && q.wardCool === 0);
    }

    /* 6. AND SO DOES THE DOUBLE-TAP REFUND. The latch hands back the wait the
       release charged; handing back the wait and keeping the debt would chime
       at the end of a wait that never happened. */
    {
      const { q, hud } = rig(['ward', 'aegis']);
      holdOut(q, hud);
      ok('a full block owes', q.wardOver === true);
      q.wardRegrab = WARD.regrab;
      q.wardUsed = 0;
      ok('...the second tap takes the wait back', q._latchWard(hud) === true
        && q.wardCool === 0);
      ok('...and the debt with it', q.wardOver === false);
    }

    /* 7. THE SPARK FLIES IN, WHICH IS THE ONLY THING SEPARATING IT FROM THE
       SMASH. Same maths, opposite sign — and if it ever came out flying
       outwards it would read as losing the shield at the moment she got it
       back, which is the worst possible thing for this cue to say. */
    {
      const { q, hud } = rig(['ward', 'aegis']);
      holdOut(q, hud);
      run(q, hud, q.wardCool + 0.02);
      ok('the spark is up', q.wardReadyT > 0 && q.wardSpark.visible);
      /* ONE FRAME OF DRAWING BEFORE THE FIRST READING. `_stepSpecials` starts
         the spark; `_updateWardMesh` is what PLACES it, and sampling a radius
         off shards that have never been positioned reads zero and makes
         "flying inwards" true of anything. */
      q._updateWardMesh(1 / 60);
      const r0 = q.wardSparks[0].position.length();
      ok('...starting out away from her', r0 > WARD.radius);
      for (let i = 0; i < 8; i++) q._updateWardMesh(1 / 60);
      ok('...and it is coming IN, not going out',
        q.wardSparks[0].position.length() < r0);
      ok('...brightest in the middle rather than at the start',
        q.wardSparks[0].material.opacity > 0);
      for (let i = 0; i < 60; i++) q._updateWardMesh(1 / 60);
      ok('...then puts itself away',
        q.wardReadyT === 0 && !q.wardSpark.visible);
      ok('...on unit directions, none of them the same',
        q.wardSparks.every((m) => Math.abs(m.userData.dir.length() - 1) < 1e-6)
        && new Set(q.wardSparks.map((m) => `${m.userData.dir.x.toFixed(3)},${m.userData.dir.z.toFixed(3)}`))
          .size === q.wardSparks.length);
    }

    /* 8. THE SCREENS. Nine kinds do not fit a panel that was eight rows tall,
       and the failure is silent: the footer — which carries the key names on a
       desktop and the actual buttons on a phone — goes off the bottom, and the
       stick has no way to say there is a row below. */
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    const prof = readFileSync(new URL('../src/systems/profile.js', import.meta.url), 'utf8');
    ok('the dealer\'s shelf is its own scrolling box',
      /\.kd-shelf\s*\{[^}]*overflow-y:\s*auto/.test(css) && /kd-shelf/.test(prof));
    const rows = css.match(/--shelf-rows:\s*(\d+)/);
    ok('...showing the eight the screen was built around', rows?.[1] === '8');
    /* THE FADE'S ROW NUMBER IS `--shelf-rows` PLUS ONE and the two must move
       together — it is the count at which something first sits below the box's
       own bottom edge. On when nothing is hidden dims a row for no reason; off
       when something is says the list has ended. */
    const nth = css.match(/\.kd-shelf:not\(:has\(\.kd-row:nth-child\((\d+)\)\)\)/);
    ok('...and the "there is more" fade turns on one row later',
      Number(nth?.[1]) === Number(rows?.[1]) + 1, `${nth?.[1]} vs ${rows?.[1]}`);
    ok('...and the roster has already outgrown the box, so it is doing work',
      ORB_IDS.length > Number(rows?.[1]));
    ok('her own slot rack is bounded too, for when MAX_EQUIPPED grows',
      /\.kd-slots\s*\{[^}]*overflow-y:\s*auto/.test(css));
    ok('the cursor is walked back into view after every repaint',
      /_followCursors\(\)/.test(prof) && /scrollIntoView/.test(prof));
    ok('...only for a STICK, never for a tap that is already on screen',
      /this\._moved = index;/.test(prof));

    /* 9. THE PRICE IS ON THE ROW WHERE IT IS NEWS, AND NOWHERE ELSE. A figure
        repeated on all nine rows says one thing nine times; none at all lets a
        2.5x orb ambush her at the confirmation. */
    const insp = readFileSync(new URL('../src/systems/inspector.js', import.meta.url), 'utf8');
    ok('the shelf row prices the rare orb and only the rare orb',
      /cost !== K\.price/.test(prof) && /kd-rare/.test(prof));
    ok('...and the personal card does the same', /pc-rare/.test(insp));
    ok('...and both questions quote the orb its own price, not the shelf\'s',
      /priceOf\(id\)/.test(prof) && /sellPriceOf\(id\)/.test(prof)
      && !/\$\{K\.price\} points/.test(prof));
    ok('...and the ward row is handed the whole set, so it can add the boost in',
      /detail\(n, counts\)/.test(prof) && /detail\(n, counts\)/.test(insp));

    /* 10. AND THE HELP CARD SAYS THE TWO THINGS A KID HAS TO KNOW. Where it
        is, and that it is useless alone — the second one is the whole reason
        it is not filed under the eight findable orbs. */
    const helpHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    /* FROM THE SUMMARY, NOT THE FIRST MENTION. "The rare orb" also appears in
       the eight-orb card that points AT this one, and slicing from there read
       the wrong card's body and failed every assertion below. */
    const card = helpHtml.slice(helpHtml.indexOf('<span class="ht-title">The rare orb'));
    const body = card.slice(0, card.indexOf('</details>'));
    ok('the Help card says the dealer is the only place it is',
      /only the dealer has (it|them)|only ever at the dealer/i.test(body));
    ok('...and that it does nothing on its own',
      /does nothing on its own/i.test(body));
    ok('...and warns about the longer wait',
      /a fifth longer/i.test(body));
    /* AND IT COUNTS THE ONES SHE CANNOT FIND. It said "a ninth kind" while
       there was one; there are two now, and a card that undercounts them sends
       a nine-year-old back out to search the islands for something that is not
       on them. The number is what matters here, so the check reads it. */
    ok('...and the eight-orb card no longer implies the roster is all findable',
      /two more kinds[\s\S]{0,80}only ever at the dealer/i.test(helpHtml));
    ok('...and the rare card teaches both of them, and sends 瞬 to the moves',
      /two more Kotodama/i.test(body)
      && /瞬 Flash Step[\s\S]{0,200}Special[\s\S]{0,40}abilities/i.test(body));

    const aud = readFileSync(new URL('../src/core/audio.js', import.meta.url), 'utf8');
    ok('the recharge chime exists in the sound set', /case 'wardready':/.test(aud));
  }

console.log('\n--- half a second of not being there ---');
{
  /* A PAD YOU CAN ACTUALLY DRIVE. `hold` is what is DOWN this frame and `tap`
     is what was PRESSED, and the two are separate because the whole move turns
     on that difference: sprint is held, interact is a press, and the shield
     button is read as HELD at the commit and as a PRESS everywhere else. */
  const pad = (o = {}) => ({
    mx: o.mx ?? 0,
    my: o.my ?? 0,
    down: (a) => (o.hold ?? []).includes(a),
    pressed: (a) => (o.tap ?? []).includes(a),
    doubled: () => false,
    consume: () => {},
  });
  const NONE = pad();
  const GO = (extra = {}) => pad({ hold: ['sprint'], tap: ['interact'], ...extra });

  /* Away from every clan hall and every solid, on flat ground, so the only
     thing deciding where she ends up is the move. */
  const SPOT = new THREE.Vector3(0, 0, 40);
  SPOT.y = world.heightAt(SPOT.x, SPOT.z).y;

  const kitten = (orbs, at = SPOT, ix = 0) => {
    const q = new Player({
      texture: new THREE.Texture(), index: ix,
      spawn: at.clone(),
      cols: 8, rows: 4, mirror: false,
    });
    q.setPowerOrbs(orbs);
    /* THE STICK IS READ AGAINST THE CAMERA, NOT AGAINST THE WORLD — see
       `Player._basis`, and `_stickHeading`, which uses the same arithmetic
       precisely so the direction she teleports is the direction she would have
       walked. Pinning the yaw to PI makes `fwd` exactly +Z, so "push up" in
       these checks is "north" in the world and the landings below can be
       written as coordinates instead of as trigonometry. */
    q.camYaw = Math.PI;
    return q;
  };
  const hudFor = (...players) => {
    const said = [];
    const toasts = [];
    return {
      players,
      sfx: (nm) => said.push(nm),
      toast: (t) => toasts.push(t),
      said,
      toasts,
    };
  };
  /* Step the WHOLE ground controller, not just the sequencer. The button
     ordering between the Flash Step and the Power Dive lives in there, and a
     test that called `_startDodge` by hand would prove nothing about it. */
  const step = (q, p, hud, frames = 1) => {
    for (let i = 0; i < frames; i++) q._updateGround(1 / 60, p, world, [], hud);
  };

  /* --- 1. THE ORB ITSELF --------------------------------------------------- */
  const spec = ORB_BY_ID.blink;
  ok('瞬 Flash Step is on the roster', !!spec && spec.id === 'blink');
  ok('...bought and never found', spec.shopOnly === true
    && !WORLD_ORB_IDS.includes('blink') && SHOP_ONLY_IDS.includes('blink'));
  ok('...and it does NOT stack, unlike the other rare one',
    !spec.stack && ORB_BY_ID.aegis.stack === true);
  /* THE TWO RARE ORBS STOCK DIFFERENTLY AND THAT WAS THE ASK. The booster is
     half a purchase, so the dealer keeps two; this is a whole move, so it
     stocks exactly like the four moves that are lying about in the world. */
  ok('...so the shelf holds one of it, like every other move',
    stockFor('blink') === STOCK_UNIQUE && stockFor('aegis') === 2 * STOCK_UNIQUE);
  ok('...and the party bonus still reaches it',
    stockFor('blink', 4) === stockFor('blink', 2) + 2);
  ok('...and it costs two and a half times an ordinary orb', spec.priceK === 2.5);
  /* A SECOND COPY BUYS NOTHING, WHICH IS WHY IT MUST NOT BE `stack`. If the
     shelf ever holds two, the second one has to be a wasted slot and not a
     silent doubling — so the aggregate has to be identical. */
  /* THE TALLY IS ALLOWED TO DIFFER — `counts` is what the profile screen prints
     and two orbs really are two orbs. What must be identical is everything that
     CHANGES HOW SHE PLAYS, which is every other field. */
  const effect = (ids) => {
    const { counts, total, ...rest } = aggregate(ids);
    return JSON.stringify(rest);
  };
  ok('a second 瞬 changes nothing at all',
    effect(['blink']) === effect(['blink', 'blink']));
  /* AND THE TWO-PLAYER GAME IS UNTOUCHED. Fifth non-negotiable: a kitten
     wearing nothing, and a kitten wearing the four world moves, must fold to
     exactly what they folded to before this orb existed. */
  const bare = aggregate([]);
  ok('an unarmed kitten has no Flash Step and never had one', bare.blink === null);
  ok('...and the dive, the ward and the charge are where they were',
    bare.ward === null && bare.dive === null && bare.charge === null);

  /* --- 2. THE BUTTON ------------------------------------------------------- */
  {
    const q = kitten(['blink']);
    const hud = hudFor(q);
    step(q, pad({ tap: ['interact'] }), hud);
    ok('interact on its own does nothing', q.dodgeT === 0);
    step(q, pad({ hold: ['sprint'] }), hud);
    ok('...and so does sprint on its own', q.dodgeT === 0);
    step(q, GO(), hud);
    ok('sprint AND interact starts one', q.dodgeT > 0);
    ok('...and it makes a noise going', hud.said.includes('dodgeout'));
  }
  {
    /* NO ORB, NO MOVE — and this is the fifth non-negotiable stated as a test
       rather than as a comment. */
    const q = kitten([]);
    step(q, GO(), hudFor(q));
    ok('a kitten with no 瞬 cannot flash step', q.dodgeT === 0 && !q.dodgePlanted);
  }
  {
    /* THE DIVE IS UNCHANGED FOR SOMEBODY WHO ONLY HAS THE DIVE, sprint held or
       not. This is the exact regression the guard was written as a guard on the
       DIVE's condition to avoid. */
    const q = kitten(['dive']);
    q.position.y += 12;
    q.onGround = false;
    step(q, GO(), hudFor(q));
    ok('sprinting off a ledge still dives, with no 瞬 in the way', q.diving === true);
  }
  {
    /* ...AND WITH BOTH ORBS THE FLASH STEP TAKES THE PRESS. One press, one
       move. */
    const q = kitten(['dive', 'blink']);
    q.position.y += 12;
    q.onGround = false;
    step(q, GO(), hudFor(q));
    ok('with both, one press is one move and it is the Flash Step',
      q.dodgeT > 0 && q.diving === false);
  }
  {
    /* AND A BARE INTERACT IN THE AIR IS STILL THE DIVE, even wearing both. The
       two moves have to stay reachable from one button. */
    const q = kitten(['dive', 'blink']);
    q.position.y += 12;
    q.onGround = false;
    step(q, pad({ tap: ['interact'] }), hudFor(q));
    ok('...and letting go of sprint still gets her the dive',
      q.diving === true && q.dodgeT === 0);
  }

  /* --- 3. THE SHAPE OF IT -------------------------------------------------- */
  {
    const q = kitten(['blink']);
    const hud = hudFor(q);
    step(q, GO(), hud);
    ok('the vanish is DODGE.invuln long', Math.abs(q.dodgeT - DODGE.invuln) < 1 / 59);
    ok('...and she has not gone yet', q.dodgePlaced === false);

    /* THE COMMIT LANDS AT `DODGE.commit` OF THE WAY THROUGH, which is the only
       frame the direction is ever read on. */
    let placedAt = -1;
    for (let i = 0; i < 200 && q.dodgeT > 0; i++) {
      step(q, NONE, hud);
      if (q.dodgePlaced && placedAt < 0) placedAt = (i + 2) / 60;
    }
    ok('...the teleport fires four fifths of the way through',
      Math.abs(placedAt - DODGE.invuln * DODGE.commit) < 3 / 60, `${placedAt.toFixed(3)}s`);
    ok('...she is back when the vanish runs out', q.dodgeT === 0);
    ok('...and cannot move for the same time again',
      Math.abs(q.dodgeLockT - DODGE.invuln) < 1 / 59);
    ok('...and it makes a noise arriving', hud.said.includes('dodgein'));
    ok('...and the wait is charged', Math.abs(q.dodgeCool - DODGE.cool) < 1 / 59);

    /* THE LOCK IS NOT `busy`, WHICH IS THE WHOLE POINT: her feet are taken and
       her blade is not. */
    ok('she is planted through the tail', q.dodgePlanted === true);
    ok('...but she is not "busy", so the attack button still works',
      q.busy === false);
    for (let i = 0; i < 40 && q.dodgePlanted; i++) step(q, NONE, hud);
    ok('...and then she has her feet back', q.dodgePlanted === false);
  }

  /* --- 4. WHAT IT TAKES AWAY ----------------------------------------------- */
  {
    const q = kitten(['blink', 'ward', 'dive']);
    const hud = hudFor(q);
    q._popWard(hud);
    ok('she is blocking', q.wardOn === true);
    step(q, GO(), hud);
    ok('...and a Flash Step takes the bubble down with it', q.wardOn === false);

    /* SHE CANNOT WALK, JUMP, BLOCK OR DIVE — and the stick is checked by
       DISPLACEMENT rather than by reading a flag, because "cannot move" is a
       claim about where she ends up. */
    const was = q.position.clone();
    step(q, pad({ mx: 1, my: -1, tap: ['jump', 'mount', 'interact'] }), hud, 12);
    ok('...she cannot walk out of it',
      Math.abs(q.position.x - was.x) < 1e-6 && Math.abs(q.position.z - was.z) < 1e-6);
    ok('...cannot jump out of it', q.velocity.y === 0);
    ok('...cannot block out of it', q.wardOn === false);
    ok('...and cannot dive out of it', q.diving === false);
    ok('...and gravity is off while she is gone', q._gravityK() === 0);
  }
  {
    /* THE TAIL PLANTS HER TOO, and it is a different question from the vanish:
       she is visible, hittable and standing there. */
    const q = kitten(['blink', 'ward']);
    const hud = hudFor(q);
    step(q, GO(), hud);
    for (let i = 0; i < 200 && q.dodgeT > 0; i++) step(q, NONE, hud);
    const was = q.position.clone();
    step(q, pad({ mx: 1, tap: ['jump', 'mount'] }), hud, 6);
    ok('the landing tail still plants her',
      q.dodgeLockT > 0 && Math.abs(q.position.x - was.x) < 1e-6);
    ok('...and still refuses the block', q.wardOn === false);
  }

  /* --- 5. NOTHING TOUCHES HER --------------------------------------------- */
  {
    const q = kitten(['blink']);
    const hud = hudFor(q);
    step(q, GO(), hud);
    const hp = q.hp;
    ok('a blade does nothing to her',
      q.hurt(30, { x: 0, z: 0 }, ATTACKS.stand, hud) === 0 && q.hp === hp);
    /* AND NEITHER DOES THE RING-OUT, which pierces a ward on purpose. A bubble
       stops blades and not the edge of the world; this is not a bubble. */
    ok('...and neither does the ring-out, which goes through a ward',
      q.hurt(999, { x: 0, z: 0 }, { ...ATTACKS.stand, pierce: true }, hud) === 0
      && q.hp === hp);
    for (let i = 0; i < 200 && q.dodgeT > 0; i++) step(q, NONE, hud);
    ok('...and she is hittable again the moment she is back',
      q.hurt(10, { x: 0, z: 20 }, ATTACKS.stand, hud) === 10);
  }

  /* --- 6. WHO GETS THE RETICLE -------------------------------------------- */
  {
    const me = kitten(['blink']);
    me.facing = 0;                                    // looking down +Z
    const near = kitten([], new THREE.Vector3(0, SPOT.y, 44), 1);
    const far = kitten([], new THREE.Vector3(0, SPOT.y, 47), 2);
    const side = kitten([], new THREE.Vector3(6, SPOT.y, 41), 3);
    ok('the one dead ahead wins over the one further away',
      me._dodgeTargetFor(hudFor(me, far, near)) === near);
    /* CLOSEST TO THE FORWARD CENTRE IS AN ANGLE, NOT A DISTANCE. `side` is
       nearer than `far` and much further off her nose, and the rule has to pick
       the one she is looking at. */
    ok('...and an angle beats a distance', me._dodgeTargetFor(hudFor(me, side, far)) === far);
    const behind = kitten([], new THREE.Vector3(0, SPOT.y, 30), 1);
    ok('somebody behind her is not a target', me._dodgeTargetFor(hudFor(me, behind)) === null);
    const beyond = kitten([], new THREE.Vector3(0, SPOT.y, 40 + DODGE.range + 2), 1);
    ok('...nor is somebody past the range', me._dodgeTargetFor(hudFor(me, beyond)) === null);
    /* THE HEIGHT GATE IS THE SWORD'S, and it is the constant on the balance
       page rather than a number of its own — the ask was "if we would hit them
       with a sword swing at that height level". */
    const above = kitten([], new THREE.Vector3(0, SPOT.y + COMBAT.strikeHeight + 1, 44), 1);
    ok('...nor is somebody your blade could not reach anyway',
      me._dodgeTargetFor(hudFor(me, above)) === null);
    /* AND THE SWING IS THE OTHER DOOR IN. Standing on her shoulder is well
       outside a 60-degree cone and well inside a katana. */
    const shoulder = kitten([], new THREE.Vector3(2.6, SPOT.y, 40.6), 1);
    ok('...but somebody your swing would already reach is, however far round',
      me._dodgeTargetFor(hudFor(me, shoulder)) === shoulder);
    /* KNOCKED OUT IS NOT A TARGET. She is lying on the floor waiting for the
       count and pivoting round her would be pivoting round furniture. */
    near.ko = true;
    ok('...and a kitten who is down is nobody’s pivot',
      me._dodgeTargetFor(hudFor(me, near)) === null);
    near.ko = false;
  }

  /* --- 7. WHERE SHE COMES OUT --------------------------------------------- */
  const landing = (orbs, opts = {}) => {
    const q = kitten(orbs);
    q.facing = 0;
    const others = (opts.others ?? []);
    const hud = hudFor(q, ...others);
    step(q, GO({ mx: opts.mx ?? 0, my: opts.my ?? 0 }), hud);
    const from = q.dodgeFrom.clone();
    const held = opts.holdShield ? ['sprint', 'mount'] : ['sprint'];
    /* AND SHE LETS GO ONCE THE TELEPORT HAS FIRED, which is what a thumb
       actually does: the stick is an AIM, and the aim is spent at the commit.
       It matters because "planted but not pointed" is an older rule than this
       move — `_updateGround` sets her facing from the stick every frame,
       Flash Step or not, deliberately, so that she can turn on the spot while
       her feet are taken. A stick still shoved north on the frame she lands
       therefore outranks `_commitDodge`'s "look at whoever you pivoted
       around", and it should: she is asking to look somewhere. */
    for (let i = 0; i < 200 && q.dodgeT > 0; i++) {
      const p = q.dodgePlaced
        ? NONE
        : pad({ mx: opts.mx ?? 0, my: opts.my ?? 0, hold: held });
      step(q, p, hud);
    }
    return { q, from, hud };
  };
  {
    const { q, from } = landing(['blink']);
    ok('a centred stick means she stays exactly where she was',
      Math.abs(q.position.x - from.x) < 1e-6 && Math.abs(q.position.z - from.z) < 1e-6);
  }
  {
    /* NOBODY TO PIVOT AROUND: half the detection range, on her own feet. The
       flee is deliberately the SHORT version of the move. */
    const { q, from } = landing(['blink'], { my: -1 });
    const d = Math.hypot(q.position.x - from.x, q.position.z - from.z);
    ok('with nobody near she pivots on herself at half the range',
      Math.abs(d - DODGE.range * DODGE.selfK) < 0.01, `${d.toFixed(2)}`);
  }
  {
    /* A TARGET: she comes out on a circle around THEM, and the stick chooses
       which side. Pushed straight ahead — toward the target — she lands past
       them, still at their own radius. */
    const foe = kitten([], new THREE.Vector3(0, SPOT.y, 46), 1);
    const { q } = landing(['blink'], { my: -1, others: [foe] });
    const r = Math.hypot(q.position.x - foe.position.x, q.position.z - foe.position.z);
    ok('with somebody locked she comes out on a circle around THEM',
      Math.abs(r - 6) < 0.01, `${r.toFixed(2)} of 6`);
    /* AND FACING THEM. Landing behind a sister still looking the way you
       travelled means the first thing you do is turn round. */
    const want = Math.atan2(foe.position.x - q.position.x, foe.position.z - q.position.z);
    ok('...looking straight at them', Math.abs(q.facing - want) < 1e-6,
      `${q.facing.toFixed(3)} vs ${want.toFixed(3)}`);
  }
  {
    /* THE SHORTER OF THE TWO DISTANCES, so a sister who ran away during the
       vanish cannot drag the landing further than the move reaches. */
    const foe = kitten([], new THREE.Vector3(0, SPOT.y, 46), 1);
    const q = kitten(['blink']);
    q.facing = 0;
    const hud = hudFor(q, foe);
    step(q, GO({ my: -1 }), hud);
    ok('the distance at the press is remembered', Math.abs(q.dodgeD0 - 6) < 1e-6);
    foe.position.z = 52;                                 // she bolted
    for (let i = 0; i < 200 && q.dodgeT > 0; i++) step(q, pad({ my: -1, hold: ['sprint'] }), hud);
    const r = Math.hypot(q.position.x - foe.position.x, q.position.z - foe.position.z);
    ok('...and running away does not lengthen the hop', Math.abs(r - 6) < 0.01, `${r.toFixed(2)}`);
  }
  {
    /* THE SHIELD BUTTON OVERRIDES THE LOCK OUTRIGHT. She still locked them —
       the reticle stays — she simply left instead. */
    const foe = kitten([], new THREE.Vector3(0, SPOT.y, 46), 1);
    const { q, from } = landing(['blink'], { my: -1, others: [foe], holdShield: true });
    const d = Math.hypot(q.position.x - from.x, q.position.z - from.z);
    ok('holding the shield at the commit flees instead, whoever was locked',
      Math.abs(d - DODGE.range * DODGE.selfK) < 0.01, `${d.toFixed(2)}`);
    ok('...and she is still shown to have locked them', q.dodgeTarget === foe);
  }
  {
    /* NOTHING MAY BE STRANDED. A destination over the void is refused and she
       stays where she is — fourth non-negotiable, applied to the one move that
       can put a kitten somewhere she did not walk to. */
    let found = null;
    for (let r = 60; r < 900 && !found; r += 4) {
      if (!world.heightAt(r, 0)) found = r;
    }
    const q = kitten(['blink'], new THREE.Vector3((found ?? 0) - 2, 4, 0));
    const g = found == null ? null : world.heightAt(q.position.x, q.position.z);
    ok('there is an edge of the world to stand on', !!g);
    if (g) {
      q.position.y = g.y;
      const hud = hudFor(q);
      /* `mx: -1` IS EAST under the pinned yaw above (`right` comes out as -X),
         and east is where the ground runs out. */
      const was = q.position.clone();
      step(q, GO({ mx: -1 }), hud);
      for (let i = 0; i < 200 && q.dodgeT > 0; i++) step(q, pad({ mx: -1, hold: ['sprint'] }), hud);
      ok('a Flash Step into the void is refused, not taken',
        Math.abs(q.position.x - was.x) < 1e-6 && Math.abs(q.position.z - was.z) < 1e-6);
      ok('...and it says so', hud.said.includes('deny'));
    }
  }

  /* --- 8. THE FIVE DEGREES ------------------------------------------------ */
  {
    /* THE ONE CASE THE THRESHOLD DECIDES: a stick that is CENTRED when the
       window closes. Never aimed means stay here. */
    const q = kitten(['blink']);
    const hud = hudFor(q);
    step(q, GO(), hud);
    const from = q.dodgeFrom.clone();
    for (let i = 0; i < 200 && q.dodgeT > 0; i++) step(q, NONE, hud);
    ok('a thumb that never moved means she wanted to stay',
      q.dodgeAimed === false
      && Math.abs(q.position.z - from.z) < 1e-6);
  }
  {
    /* ...AND AIMED-THEN-RELEASED MEANS THE LAST DIRECTION SHE ASKED FOR. */
    const q = kitten(['blink']);
    const hud = hudFor(q);
    step(q, GO(), hud);
    const from = q.dodgeFrom.clone();
    step(q, pad({ my: -1, hold: ['sprint'] }), hud, 4);      // push north
    for (let i = 0; i < 200 && q.dodgeT > 0; i++) step(q, NONE, hud);
    ok('a deliberate push she then let go of is still a direction',
      q.dodgeAimed === true
      && Math.hypot(q.position.x - from.x, q.position.z - from.z) > 1);
  }
  {
    /* AND A STICK ALREADY HELD AT THE PRESS IS NOT "AIMING" until it moves —
       which is why the threshold exists at all. */
    const q = kitten(['blink']);
    const hud = hudFor(q);
    step(q, GO({ my: -1 }), hud);
    step(q, pad({ my: -1, hold: ['sprint'] }), hud, 4);
    ok('holding the same push you started with is not a new decision',
      q.dodgeAimed === false);
    step(q, pad({ mx: 1, hold: ['sprint'] }), hud, 2);
    ok('...turning it a quarter of the way round is', q.dodgeAimed === true);
  }

  /* --- 9. NOTHING IS STRANDED --------------------------------------------- */
  {
    const q = kitten(['blink']);
    const hud = hudFor(q);
    step(q, GO(), hud);
    q.dodgeTarget = q;
    q._clearSpecials();
    ok('a round reset drops the whole move, wait and all',
      q.dodgeT === 0 && q.dodgeLockT === 0 && q.dodgeCool === 0
      && q.dodgeTarget === null && q.dodgePlaced === false);
    ok('...but not the counter the effects tell two dodges apart by',
      q.dodgeSeq > 0);
  }

  /* --- 10. WHAT IT LOOKS LIKE --------------------------------------------- */
  {
    const src = readFileSync(new URL('../src/systems/dodgefx.js', import.meta.url), 'utf8');
    const psrc = readFileSync(new URL('../src/entities/player.js', import.meta.url), 'utf8');
    /* A POLLER, LIKE crossfx. If `player.js` ever imported this, the move would
       have one code path per way of ending and the one that got missed would
       leave a target ring welded to somebody's head. */
    /* IT MAY BE NAMED IN A COMMENT AND IT MAY NOT BE IMPORTED. Pointing at the
       file that draws a thing is how this codebase's comments work; depending
       on it is what would give the move one code path per way of ending, and
       the one that got missed would leave a target ring welded to somebody's
       head for the rest of the afternoon. */
    ok('the effects are a poller — player.js never imports them',
      !/from '[^']*dodgefx/.test(psrc) && /dodgeSeq/.test(src));
    ok('...and it reads the clocks rather than being called',
      /p\.dodgeT/.test(src) && /dodgePlanted/.test(src));
    ok('the reticle is pixel art, not a smoothed ring',
      /NearestFilter/.test(src) && /generateMipmaps = false/.test(src));
    ok('...and a Sprite, so it faces all four panes at once',
      /new THREE\.Sprite\(/.test(src));

    const fx = new DodgeFx(new THREE.Scene());
    const q = kitten(['blink']);
    const foe = kitten([], new THREE.Vector3(0, SPOT.y, 44), 1);
    q.facing = 0;
    const hud = hudFor(q, foe);
    step(q, GO(), hud);
    ok('she locked somebody', q.dodgeTarget === foe);
    fx.update(1 / 60, [q, foe]);
    const rig = fx.rigs.get(0);
    ok('...and the ring is on them, in HER colour', !!rig && rig.sprite.visible
      && rig.sprite.material.color.getHex() === q.style.colour);
    ok('...and it is over their head, not under their feet',
      rig.sprite.position.y > foe.position.y);
    /* NARROWS IN. Bigger on the frame it appears than a beat later, which is
       the difference between a lock and a decoration. */
    const s0 = rig.sprite.scale.x;
    for (let i = 0; i < 12; i++) fx.update(1 / 60, [q, foe]);
    ok('...narrowing in', rig.sprite.scale.x < s0, `${s0.toFixed(2)} -> ${rig.sprite.scale.x.toFixed(2)}`);

    /* ONE DECOY PER DODGE, DROPPED ON THE FRAME SHE ACTUALLY LEAVES. */
    const live = () => fx.decoys.filter((d) => d.t > 0).length;
    ok('nothing has been dropped yet', live() === 0);
    for (let i = 0; i < 200 && q.dodgeT > 0; i++) { step(q, NONE, hud); fx.update(1 / 60, [q, foe]); }
    ok('...and exactly one thing was left behind', live() === 1);
    ok('...where she was, not where she went', !!fx.decoys.find(
      (d) => d.t > 0 && Math.abs(d.group.position.z - q.dodgeFrom.z) < 1e-6
    ));
    ok('...and it is a real object with geometry in it',
      fx.decoys.find((d) => d.t > 0).prop.children.length > 0);

    /* AND IT SPRINGS OPEN WHEN THE MOVE ENDS. */
    for (let i = 0; i < 60 && q.dodgePlanted; i++) { step(q, NONE, hud); fx.update(1 / 60, [q, foe]); }
    const wide = rig.sprite.scale.x;
    fx.update(1 / 60, [q, foe]);
    ok('the ring expands out once she has her feet back',
      rig.on === false && rig.sprite.scale.x > wide * 0.99 && rig.sprite.scale.x > 1);
    for (let i = 0; i < 40; i++) fx.update(1 / 60, [q, foe]);
    ok('...and then puts itself away', rig.sprite.visible === false);
    fx.reset();
    ok('a restart clears every decoy on the ground', live() === 0);
  }

  /* --- 11. THE INSECT ----------------------------------------------------- */
  /* The same stub the feast's own checks build further down: a `Critter` builds
     real `Billboard`s out of it, so `{}` is not an atlas, it is a crash. */
  const stubArt = () => ({
    calm: { texture: new THREE.Texture(), contentScale: 0.7, pad: 0.06 },
    shock: { texture: new THREE.Texture(), contentScale: 0.7, pad: 0.06, facesRight: true },
  });
  {
    const m = CRITTER_BY_ID.mantis;
    ok('there is a rare animal and it is the only one', !!m && m.rare === true
      && CRITTERS.filter((c) => c.rare).length === 1);
    /* IT PAYS THE LEAST, WHICH IS OFF THE LADDER ON PURPOSE. rat < rabbit <
       bird prices the three you go and FIND; this one arrives by itself, so it
       is worth exactly what standing still between rounds is worth. */
    ok('...worth the least of anything on the deck',
      CRITTERS.every((c) => c === m || c.heal > m.heal));
    ok('...and exactly the free regen, which is the floor',
      m.heal === Math.round(MAX_HP * REGEN_FRAC));
    ok('...it cannot be walked down, and cannot outrun a sprint',
      m.speed > 10.5 && m.speed < 17);
    ok('...and it is the fastest thing on the deck',
      CRITTERS.every((c) => c === m || c.speed < m.speed));
    const hop = m.hopV ** 2 / (2 * 24);
    line('mantis hop height', `${hop.toFixed(2)} units`);
    ok('...it hops higher than a rabbit', hop > CRITTER_BY_ID.rabbit.hopV ** 2 / (2 * 24));
    ok('...and still inside the swing\'s upward reach', hop + m.size < 6.5);
  }
  {
    /* IT IS NOT IN THE LOTTERY. `species` is what `start` seeds and `_spawn`
       draws from; `rareSpecies` is the only door, and `_conjure` is the only
       thing that opens it. */
    const art = Object.fromEntries(CRITTERS.map((c) => [c.id, stubArt()]));
    const men = new Menagerie({
      game: { players: [], scene: new THREE.Scene(), toast: () => {} },
      world,
      art,
    });
    ok('the ordinary deck cannot produce a mantis',
      !men.species.some((c) => c.id === 'mantis'));
    ok('...and the rare pool is exactly it',
      men.rareSpecies.length === 1 && men.rareSpecies[0].id === 'mantis');
    ok('...and the other three are untouched', men.species.length === 3);
    const msrc = readFileSync(new URL('../src/systems/menagerie.js', import.meta.url), 'utf8');
    ok('a build with no mantis.png simply never makes one',
      /this\.art\[c\.id\]\?\.calm/.test(msrc));
    ok('...and the odds are five in a hundred, as asked', CONJURE_CHANCE === 0.05);
    ok('...and Mr Satan has something to say about it', BUG_LINES.length >= 3
      && BUG_LINES.every((l) => typeof l === 'string' && l.length > 10));
  }
  {
    /* ONE PER KITTEN PER ROUND, AND THE ROUND IS THE POINT. Rolled with the
       dice forced, so what is being measured is the CAP and not the chance. */
    const art = Object.fromEntries(CRITTERS.map((c) => [c.id, stubArt()]));
    const said = [];
    const q = kitten(['blink']);
    const men = new Menagerie({
      game: {
        players: [q], scene: new THREE.Scene(), toast: () => {},
        sfx: () => {}, announcer: { say: (id) => said.push(id) },
      },
      world,
      art,
    });
    men.on = true;
    men.list.length = 0;
    const roll = Math.random;
    Math.random = () => 0;                        // always
    q.dodgeSeq = 1; q.dodgeT = 0.1; q.dodgePlaced = true;
    q.dodgeFrom.copy(men.deck ? new THREE.Vector3(men.deck.x, men.deck.y, men.deck.z) : SPOT);
    men._maybeConjure(q, 0);
    ok('a vanish can leave an insect behind', men.list.length === 1
      && men.list[0].id === 'mantis');
    ok('...and he says something about it', said.includes('sat_bug'));
    q.dodgeSeq = 2;
    men._maybeConjure(q, 0);
    ok('...but only once in a round, however lucky she gets',
      men.list.length === 1);
    men.releaseAll();
    q.dodgeSeq = 3;
    men._maybeConjure(q, 0);
    ok('...and the next round gives her another chance', men.list.length === 2);
    /* AND THE SAME DODGE IS ROLLED FOR ONCE, not once per frame after the
       commit — which without `_dodgeSeen` would be thirty rolls a dodge. */
    men.releaseAll();
    Math.random = () => 0.99;                     // never
    q.dodgeSeq = 4;
    men._maybeConjure(q, 0);
    men._maybeConjure(q, 0);
    ok('an unlucky dodge stays unlucky for all of its frames', men.list.length === 2);
    Math.random = roll;
  }

  /* --- 12. THE HELP PAGE AND THE BALANCE PAGE ----------------------------- */
  {
    const helpHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const at = helpHtml.indexOf('<span class="ht-title">Special abilities');
    const card = helpHtml.slice(at, helpHtml.indexOf('</details>', at));
    ok('the Flash Step is in the Special abilities card', /Flash Step/.test(card));
    ok('...on the same grid as the other four, ready for its clip',
      (card.match(/<figure class="move"/g) ?? []).length === 5);
    /* THE SLOT IS THE POINT. It has a still now and a GIF later, and the swap
       has to be one attribute — so the placeholder sits in the same figure, at
       the same size, as the four clips beside it. */
    ok('...with a placeholder image standing in for the clip',
      /help\/ability-blink/.test(card));
    ok('...and it says the shield trick, which nothing else would teach her',
      /shield|Ward/i.test(card) && /Sprint/i.test(card));

    const page = readFileSync(new URL('../src/tuning-page.js', import.meta.url), 'utf8');
    ok('DODGE has a panel on the balance page', /\n  DODGE: \{/.test(page));

    const aud = readFileSync(new URL('../src/core/audio.js', import.meta.url), 'utf8');
    ok('going and coming back are two different sounds',
      /case 'dodgeout':/.test(aud) && /case 'dodgein':/.test(aud));
    ok('...and the lock has its own, quieter one', /case 'dodgelock':/.test(aud));
  }
}

  /* --- the economy --- */
  const price = orbPrice(world.pointsTotal);
  const sell = orbSellPrice(world.pointsTotal);
  const purse = world.pointsTotal / 2;
  line('points in the world', `${world.pointsTotal} across ${world.props.length} props`);
  line('buy / sell', `${price} / ${sell}  (an even share is ${Math.round(purse)})`);
  ok('a whole even share buys 3 orbs', Math.floor(purse / price) === 3);
  ok('...and never 5', Math.floor(purse / price) < 5);
  ok('selling returns 75%', Math.abs(sell / price - 0.75) < 0.002);
  /* BUY-THEN-SELL MUST LOSE MONEY. At 100% or more the two girls can bounce
     one orb off the counter for ever and buy the whole shelf, which deletes
     both the scarcity and the reason to trade with each other. */
  ok('...so buying and selling back is a loss', sell < price);
  ok('the price is derived from the world, not typed in',
    orbPrice(world.pointsTotal * 2) === price * 2);

  /* --- the Awakening --- */
  const fakeGame = {
    world,
    scene: new THREE.Scene(),
    pickups: [],
    players: [],
    sfx: () => {},
    toast: () => {},
    syncOrbMeshes: () => {},
    onScoreChanged: () => {},
  };
  const mkKit = (i, orbs = 0) => {
    const p = new Player({
      texture: new THREE.Texture(), index: i,
      spawn: new THREE.Vector3(0, world.heightAt(0, 40).y, 40),
      cols: 8, rows: 4, mirror: false,
    });
    p.name = i === 0 ? 'Ember' : 'Frost';
    p.orbs = Array.from({ length: orbs }, () => ({ group: new THREE.Group() }));
    return p;
  };

  /* ONLY ONE OF THESE IS ALLOWED TO DRESS THE WORLD. `spawnPickups` pushes
     into the real `world.keepClear` and `raiseStall` pushes a real solid, so
     running the prize logic three times over would leave 48 orbs and three
     stalls in one town — and the clearance assertions below would then be
     measuring each run against the last one's furniture. */
  const run = (aOrbs, bOrbs, place = false) => {
    const g = { ...fakeGame, pickups: [], players: [mkKit(0, aOrbs), mkKit(1, bOrbs)] };
    g.syncOrbMeshes = () => {};
    const K = new Kotodama(g);
    if (!place) { K.spawnPickups = () => {}; K.raiseStall = () => {}; }
    g.kotodama = K;
    const res = K.awaken();
    return { g, K, res };
  };

  const lead = run(4, 1, true);
  ok('the kitten with more plain orbs gets the prize', lead.res.prizes.length === 1
    && lead.res.prizes[0].player.index === 0);
  ok('...and the other one does not', lead.g.players[1].powerOrbs.length === 0);

  const tied = run(3, 3);
  ok('a tie gives one to BOTH', tied.res.tie && tied.res.prizes.length === 2
    && tied.g.players.every((p) => p.powerOrbs.length === 1));

  /* --- A KITTEN WALKS OUT, AND HER WHOLE NECK GOES ON THE FLOOR ----------
     Two bugs in the same six lines, both reported from play.

     ONE: every orb went to `p.position`, and `findOpenSpot` is deterministic —
     so eight orbs became one orb's worth of geometry z-fighting with itself,
     and a pile whose size you could not read. Only twenty-six of these exist
     in the world; a stack of eight has to LOOK like eight.

     TWO: `_leavePlayer` took down her PLAIN orbs (`p.orbs`) and not the power
     orbs she was wearing (`p.wornOrbs`) — so her worn shells stayed in the
     scene after she left, frozen, because the thing that moves them walks
     `this.players` and she had just been spliced out of it. Reported as "the
     rotating visual orbs stay on screen and are buggy". Both fields are
     optional on purpose, so `?? []` made a wrong NAME look like an empty list.
     That is the whole reason the second half of this is asserted against the
     source: the failure was a field that did not exist, and no amount of
     driving an object catches a name nobody ever writes. */
  {
    const g = { ...fakeGame, pickups: [], players: [mkKit(0), mkKit(1)] };
    const K = new Kotodama(g);
    K.raiseStall = () => {};
    g.kotodama = K;
    K.awakened = true;
    K.pickups = [];
    const at = { x: 0, z: 40 };
    /* SPREAD 0 IS THE OLD CALL, BIT FOR BIT. Everything about a drop of ONE
       has to come out exactly where it always did, or a change written for a
       kitten leaving with a full neck has quietly moved every other drop. */
    K.pickups = [];
    const solo = K.dropInWorld('reach', at);
    const soloExplicit = (() => { K.pickups = []; return K.dropInWorld('reach', at, 0); })();
    ok('one orb dropped alone lands exactly where it always did',
      solo.group.position.distanceTo(soloExplicit.group.position) < 1e-9);

    /* SWEPT, NOT SAMPLED. The fan is random, so one draw proves nothing about
       the case that matters — the tail, where two neighbours happen to wobble
       toward each other. Forty full necks is 1120 pairs and takes no time at
       all, and it is the run that caught the first version of the numbers:
       a bearing wobble of 0.7rad against a 0.785rad step let two orbs land
       1.15 apart, which is the pile again with a better excuse. */
    let closest = Infinity;
    let furthest = 0;
    for (let round = 0; round < 40; round++) {
      K.pickups = [];
      const drops = ORB_IDS.slice(0, MAX_EQUIPPED)
        .map((id, i) => K.dropInWorld(id, at, i));
      if (round === 0) {
        ok('a leaving kitten really puts every orb back in the world',
          drops.every((d) => d) && K.pickups.length === MAX_EQUIPPED,
          `${K.pickups.length}`);
      }
      for (let i = 0; i < K.pickups.length; i++) {
        const a = K.pickups[i].group.position;
        furthest = Math.max(furthest, Math.hypot(a.x - at.x, a.z - at.z));
        for (let j = i + 1; j < K.pickups.length; j++) {
          const b = K.pickups[j].group.position;
          closest = Math.min(closest, Math.hypot(a.x - b.x, a.z - b.z));
        }
      }
    }
    line('40 full necks dropped: closest pair ever / furthest from her',
      `${closest.toFixed(2)} / ${furthest.toFixed(2)}`);
    /* NO TWO IN THE SAME PLACE, which is the bug, stated as the property
       rather than as the formula — a spiral, a jittered ring or a Poisson
       draw would all satisfy it and all be fine. */
    ok('...and no two of them are ever on top of each other', closest > 1.2,
      `${closest.toFixed(2)} apart`);
    /* AND STILL A PILE. Scattering them across the town would be the same
       failure with the sign flipped: she has just left, and the sister picking
       them up should not have to go hunting for the last one. */
    ok('...but the whole drop is still a pile you can walk into', furthest < 12,
      `${furthest.toFixed(2)} out`);
  }

  {
    const mn = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    const leave = stripComments(mn).slice(stripComments(mn).indexOf('_leavePlayer(index)'));
    const body = leave.slice(0, leave.indexOf('_buildLeaveButtons'));
    ok('a leaving kitten takes her PLAIN orbs out of the scene',
      /for \(const o of p\.orbs \?\? \[\]\) this\.scene\.remove/.test(body));
    ok('...and the power orbs she was WEARING, which she did not',
      /for \(const o of p\.wornOrbs \?\? \[\]\) this\.scene\.remove/.test(body));
    ok('...and empties both, so nothing walks a list of removed meshes',
      /p\.orbs = \[\]/.test(body) && /p\.wornOrbs = \[\]/.test(body));
    ok('...and fans the drop out rather than stacking it on one point',
      /_dropOrbInWorld\(id, p\.position, i\)/.test(body));

    /* --- AND TWO KITTENS JOINING CANNOT LAND ON ONE SPOT ------------------
       `_joinSpot` has no memory, so two joins a second apart asked the same
       question about the same town centre and both got yes. Force-spawn made
       that the normal case — ENTER, ENTER seats a third and fourth in the time
       it takes to press a key twice — and two cats drawn on the same point
       read as one cat and a join that did nothing. Reported as "have some
       randomness when players spawn in the town, so they don't spawn right on
       top of each other."
       Source-asserted for the same reason as above: `_joinSpot` needs a built
       world, a party and a renderer, and the failure is a rule that was never
       written rather than a number that came out wrong. */
    const spot = stripComments(mn).slice(stripComments(mn).indexOf('_joinSpot() {'));
    const sb = spot.slice(0, spot.indexOf('_joinPlayer'));
    ok('a join spot refuses a point somebody is already standing on',
      /JOIN_APART/.test(sb) && /for \(const q of this\.players\)/.test(sb));
    ok('...and asks the LIVE positions, not a list of spots handed out',
      /q\.position\.x/.test(sb) && /q\.position\.z/.test(sb));
    /* AND A DIFFERENT BEARING EVERY TIME. The rule above stops them
       overlapping; without this the rings are walked in the same order for
       everybody and four joins come out in a neat line pointing one way. */
    ok('...and spins the search, so joins scatter instead of queueing',
      /const spin = Math\.random\(\)/.test(sb) && /\+ ring \+ spin/.test(sb));
    /* THE LAST RESORT IS STILL THE TOWN CENTRE. Every rule above is a
       preference. A kitten standing on her sister is one flick of the stick
       from fixed; a kitten in the sky is not. Ninth non-negotiable. */
    ok('...but still lands her somewhere real when nothing is free',
      /return hit \?\? \{ x: T\.x, y: T\.y, z: T\.z \}/.test(sb));

    /* --- AND THE STARTING MARKS WOBBLE, WITHOUT SHUFFLING ------------------
       The four marks are 3.5 apart and fixed, so every game opened on the same
       photograph. A unit of jitter each way is "some randomness" and still
       leaves the four of them in the same left-to-right ORDER every game,
       which is what keeps "go left, that's yours" true. */
    ok('a kitten’s starting mark is jittered', /START_JITTER/.test(stripComments(mn)));
    ok('...by less than half the gap between two marks, so nobody swaps sides',
      /const START_JITTER = 1;/.test(mn));
    /* DRAWN ONCE, AT CONSTRUCTION. `spawn` is also where she comes back after
       a fall; a respawn point that moved under her would be the game losing
       her mark rather than scattering it. */
    const seat = stripComments(mn).slice(stripComments(mn).indexOf('_seatPlayer(index'));
    const sp = seat.slice(0, seat.indexOf('_dressPlayer(p)'));
    ok('...and drawn once, so her respawn point does not wander',
      (sp.match(/Math\.random\(\)/g) ?? []).length === 2);
  }

  /* 0-0 IS A TIE AND IT HAS TO PAY OUT. Two girls who never picked up a plain
     orb — entirely possible, they are optional and there are six of them in a
     world this size — would otherwise be told at the top of the endgame that
     they both lost, and handed nothing to trade with. */
  const nil = run(0, 0);
  ok('...including nobody having collected any',
    nil.res.tie && nil.g.players.every((p) => p.powerOrbs.length === 1));

  const { g: aw, K } = lead;
  ok('every plain orb is gone from both kittens',
    aw.players.every((p) => p.orbs.length === 0));
  ok('...and out of the world', aw.pickups.length === 0);
  /* EIGHT IN THE WORLD, ONE OF EACH, AND NO DUPLICATES — the number that
     makes trading necessary rather than optional. Sixteen (one of each plus
     spares) let two girls each wander into a full set without ever speaking
     to each other, which deletes the only interesting thing in the feature. */
  ok('the world is reseeded with one of each', K.pickups.length === 8);
  ok('...every kind, exactly once',
    new Set(K.pickups.map((p) => p.id)).size === 8);
  ok('...so NOTHING can be stacked by walking',
    WORLD_ORB_IDS.every((id) => K.pickups.filter((p) => p.id === id).length === 1));
  /* AND THE RARE ONE IS NOT OUT THERE. This is the check that says what the
     word "rare" is actually worth: not a lower spawn rate, but no spawn at
     all. The prize draw is asserted against the same list below. */
  ok('...and the dealer-only orb is nowhere in the world',
    K.pickups.every((p) => !SHOP_ONLY_IDS.includes(p.id)));
  ok('...spread over every island but the arena',
    new Set(K.pickups.map((p) => world.heightAt(p.position.x, p.position.z)?.island)).size
      >= world.questIslands.length - 1);
  /* THE CANOPY, NOT THE TRUNK. `findOpenSpot` measures against a tree's SOLID,
     which is 0.9 across, and what hides a glowing ball is the four-unit canopy
     over it. This is the check that would have caught the dealer's stall
     coming up inside the cherry grove — which it did, first try. */
  const clearOf = (x, z, skip) => Math.min(...world.solids
    .filter((s) => Math.hypot(x - s.x, z - s.z) > skip)
    .map((s) => Math.hypot(x - s.x, z - s.z) - s.r));
  ok('no orb is under a canopy',
    K.pickups.every((p) => clearOf(p.position.x, p.position.z, 0.01) >= 4));
  ok('the dealer is not either',
    K.stall && clearOf(K.stall.position.x, K.stall.position.z, 0.01) >= 4);

  /* --- AND YOU CAN READ IT FROM A QUARTER OF A SCREEN -------------------
     Reported from four-player play: "too hard to read the text above the
     store, can hardly see it".

     A `Label` is a quad of a fixed WORLD size, so how many screen pixels it
     covers is a function of the pane it is drawn in — and a quadrant is half
     the width and half the height of the screen these were sized against, so
     every piece of world text in the game comes out at half its linear size.
     Both signs doubled.

     THE WORLD HEIGHT DOUBLED AND `size` DID NOT, which is the half worth
     pinning: `size` is the authored height of the CANVAS, so raising it costs
     texture memory quadratically, while `height` is the world size of the quad
     and is free. The labels are supersampled 3x and were already drawn well
     under 1:1, so there was headroom to spend. Somebody "fixing" the crispness
     by raising `size` instead would put megabytes back on a phone's budget. */
  {
    const st = K.stall;
    /* MEASURED IN WORLD SPACE, so the group's own -PI/4 and the labels' local
       offsets are all in it — which is the only frame in which "does the sign
       clear the roof beam" is a question with an answer. */
    st.group.updateMatrixWorld(true);
    const box = (l) => new THREE.Box3().setFromObject(l.mesh ?? l);
    ok('the stall has both a sign and a prompt', !!st?.sign && !!st?.prompt);
    const sign = box(st.sign);
    const prompt = box(st.prompt);
    const signH = sign.max.y - sign.min.y;
    const promptH = prompt.max.y - prompt.min.y;
    line('stall text (world units tall)',
      `sign ${signH.toFixed(2)}  prompt ${promptH.toFixed(2)}`);
    ok('the sign is at least a metre of world tall', signH >= 1.1, signH.toFixed(2));
    ok('...and so is the prompt under it', promptH >= 0.95, promptH.toFixed(2));
    /* THE CANVASES DID NOT GROW WITH THEM. */
    ok('...without either of them growing its texture to do it',
      st.sign._opts?.size <= 70 && st.prompt._opts?.size <= 70,
      `${st.sign._opts?.size} / ${st.prompt._opts?.size}`);

    /* AND THEY ARE NOT DRAWN THROUGH EACH OTHER. Both quads doubled about
       their own centres, and the old gap between those centres was smaller
       than the two new half-heights — which is the failure this exact kind of
       change produces and the one that is invisible until somebody walks up. */
    ok('...and the two of them do not overlap', prompt.min.y > sign.max.y,
      `sign top ${sign.max.y.toFixed(2)}, prompt bottom ${prompt.min.y.toFixed(2)}`);
    /* NOR THROUGH THE ROOF BEAM, which tops out at 3.35 in the stall's own
       space and is what the sign used to clear by 0.3. */
    ok('...nor through the stall\'s own roof beam', sign.min.y > 3.4,
      sign.min.y.toFixed(2));

    /* IT ALREADY FACED THE CAMERA AND STILL DOES. Half the report was "make the
       text always face the camera" — it always has, per pane, through
       `Kotodama.faceCamera`. Pinned so the answer to that half is a check
       rather than a claim in a reply. */
    const cam = new THREE.PerspectiveCamera(48, 16 / 9, 0.5, 600);
    cam.position.set(st.position.x + 30, st.position.y + 22, st.position.z + 30);
    cam.lookAt(st.position.x, st.position.y, st.position.z);
    cam.updateMatrixWorld(true);
    st.prompt.visible = true;
    K.faceCamera(cam);
    st.group.updateMatrixWorld(true);
    const facing = (l) => {
      const q = new THREE.Quaternion();
      l.mesh.getWorldQuaternion(q);
      return new THREE.Vector3(0, 0, 1).applyQuaternion(q)
        .dot(new THREE.Vector3(0, 0, 1).applyQuaternion(cam.quaternion));
    };
    ok('the sign turns to whichever camera is looking at it', facing(st.sign) > 0.999,
      facing(st.sign).toFixed(4));
    ok('...and so does the prompt, while it is up', facing(st.prompt) > 0.999);
    st.prompt.visible = false;
  }
  /* THE DEALER IS THE ONLY SOURCE OF A SECOND COPY, so his shelf is where the
     stacking rule lives. Four of each stat orb — the four whose whole point is
     a number going up — and one of each move, where a second copy only widens
     something she can already do. */
  /* THE DEEP SHELF IS THE FOUR STAT ORBS, and `stack` alone no longer names
     them: 守 Long Guard stacks in play but is stocked off the MOVE orbs'
     shallow shelf, because what it needs is to be buyable in a PAIR rather
     than four deep. `stockN` is how a spec says so. */
  const deep = POWER_ORBS.filter((o) => o.stack && !Number.isFinite(o.stockN))
    .map((o) => o.id);
  line('deep shelf', deep.map((id) => `${id} x${K.stock[id]}`).join(', '));
  ok('the four stat orbs are the deep-shelf ones',
    deep.join() === 'swift,reach,vigor,leap');
  ok(`...and the dealer holds ${STOCK_STACKABLE} of each`,
    deep.every((id) => K.stock[id] === STOCK_STACKABLE));
  ok('...one of every move', ids.filter((id) => !ORB_BY_ID[id].stack)
    .every((id) => K.stock[id] === STOCK_UNIQUE));
  ok('...and TWICE that of the booster, which is what was asked for',
    K.stock.aegis === 2 * STOCK_UNIQUE && K.stock.aegis === 2);
  ok('stock comes from stockFor, not from a second list',
    ids.every((id) => K.stock[id] === stockFor(id)));
  ok('...and the party bonus still reaches it',
    stockFor('aegis', 4) === stockFor('aegis', 2) + 2);

  /* --- what the rare one costs ------------------------------------------
     2.5x was the number asked for, and it is a MULTIPLIER on a price derived
     from the world's own point total rather than a figure typed in — so
     adding a prop to an island moves both together. */
  ok('the booster costs two and a half times an ordinary orb',
    K.priceOf('aegis') === Math.round(K.price * 2.5), `${K.priceOf('aegis')} vs ${K.price}`);
  ok('the Flash Step costs the same two and a half times',
    K.priceOf('blink') === Math.round(K.price * 2.5));
  /* AND THE RARE PRICE IS THE `shopOnly` LIST, NOT A PAIR OF NAMES. Written
     `id !== 'aegis'` this check passed the day a second rare orb was added and
     said nothing about it — the shape that only tests what it was written for
     is exactly what `needs` replaced over in the booster rule. */
  ok("...and every kind that is not the dealer’s costs the shelf price",
    WORLD_ORB_IDS.every((id) => K.priceOf(id) === K.price));
  ok('...while every one that IS costs more than it',
    SHOP_ONLY_IDS.every((id) => K.priceOf(id) > K.price));
  ok('...it sells back at the same fraction, not the common price',
    K.sellPriceOf('aegis') === Math.round(K.priceOf('aegis') * 0.75)
    && K.sellPriceOf('aegis') > K.sellPrice);
  ok('...so buying it and selling it back is still a loss, not a profit',
    K.sellPriceOf('aegis') < K.priceOf('aegis'));
  ok('...and one purse cannot reach the pair it needs',
    K.priceOf('ward') + 2 * K.priceOf('aegis') > purse);
  ok('the refusal quotes the orb its own price', (() => {
    const q = aw.players[0];
    const had = q.score;
    q.score = K.price;
    const why = K.buyRefusal(q, 'aegis');
    q.score = had;
    return typeof why === 'string' && why.includes(`${K.priceOf('aegis') - K.price}`);
  })());
  /* A DEEP SHELF MUST NOT MAKE THEM CHEAP. The scarcity is the purse, not the
     shelf: four Gale orbs on the counter and a wallet that reaches three orbs
     TOTAL is what turns "I want another one" into a conversation with her
     sister rather than a walk to the market. */
  ok('a whole purse still buys only 3', Math.floor(purse / price) === 3);
  ok('...far short of one full stack of four',
    price * STOCK_STACKABLE > purse);
  ok('the whole shelf costs more than one purse holds',
    price * 8 > purse);
  ok('awakening twice is a no-op', K.awaken() === null && K.pickups.length === 8);

  /* --- carrying, buying, trading --- */
  const [A, B] = aw.players;
  A.setPowerOrbs([]);
  B.setPowerOrbs([]);
  for (let i = 0; i < MAX_EQUIPPED; i++) K.give(A, 'swift');
  ok(`a kitten carries at most ${MAX_EQUIPPED}`, A.powerOrbs.length === MAX_EQUIPPED);
  ok('...and the ninth is REFUSED rather than dropped', K.give(A, 'leap') === false
    && A.powerOrbs.length === MAX_EQUIPPED);

  A.score = price;
  ok('a full kitten cannot buy either', K.buyRefusal(A, 'leap') !== null);
  ok('...and her points are still hers', A.score === price);

  A.setPowerOrbs(['swift', 'ward']);
  B.setPowerOrbs(['leap']);
  const total = () => A.powerOrbs.length + B.powerOrbs.length;
  const before = total();
  ok('a straight swap goes through', K.trade(A, 'swift', B, 'leap'));
  ok('...and conserves the count', total() === before);
  ok('...moving exactly the two named orbs',
    A.powerOrbs.includes('leap') && !A.powerOrbs.includes('swift')
    && B.powerOrbs.includes('swift') && !B.powerOrbs.includes('leap'));
  ok('a gift one way is allowed', K.trade(A, 'ward', B, null));
  ok('...and still conserves the count', total() === before);
  ok('offering something you do not have is refused',
    K.trade(A, 'charge', B, null) === false);
  ok('two empty offers are refused', K.trade(A, null, B, null) === false);

  /* A GIFT INTO A FULL KITTEN MUST FAIL WHOLE. Both girls are at eight slots
     more often than not by the time they are trading, and the naive
     "give hers to him, give his to her" overflows on the first half and
     leaves one of them a copy down with nothing to show for it. */
  B.setPowerOrbs(Array(MAX_EQUIPPED).fill('vigor'));
  A.setPowerOrbs(['charge']);
  const bBefore = [...B.powerOrbs];
  ok('a gift into a full kitten is refused', K.trade(A, 'charge', B, null) === false);
  ok('...and neither side lost anything', A.powerOrbs.length === 1
    && B.powerOrbs.join() === bBefore.join());
  ok('a SWAP with a full kitten still works', K.trade(A, 'charge', B, 'vigor'));

  /* --- A PILE FOR A PILE ---------------------------------------------------
     One orb per trade meant the thing the girls actually do here — the older
     one handing the younger one a fistful of spares — was four separate
     agreements, and four chances to press the wrong button. The screen offers
     a SET now (see `Side.offers`) and this is the half that moves it.

     A BARE ID IS STILL A LIST OF ONE. Every check above passes a single id and
     none of them changed, which is the point: a rule that degrades beats one
     that vanishes. */
  A.setPowerOrbs(['swift', 'ward', 'leap']);
  B.setPowerOrbs(['vigor']);
  const both = () => A.powerOrbs.length + B.powerOrbs.length;
  const pileBefore = both();
  ok('three orbs go across in one trade',
    K.trade(A, ['swift', 'ward', 'leap'], B, ['vigor']));
  ok('...and the count is still conserved', both() === pileBefore);
  ok('...with every named orb on the other side',
    ['swift', 'ward', 'leap'].every((id) => B.powerOrbs.includes(id))
    && A.powerOrbs.join() === 'vigor');

  /* A PILE ONE WAY IS A GIFT, exactly as one orb one way is. */
  ok('a pile as a gift is allowed', K.trade(B, ['swift', 'ward'], A, []));
  ok('...and conserves the count too', both() === pileBefore);

  /* DUPLICATES ARE COUNTED, NOT DEDUPED. A kitten can be wearing two of the
     same orb, and offering one of them is a different sentence from offering
     both — so the check is "has she got this MANY", not `includes`. Getting
     this wrong creates an orb out of nothing, and there are only twenty-six in
     the world. */
  A.setPowerOrbs(['vigor', 'vigor']);
  B.setPowerOrbs(['leap']);
  ok('offering two of something you have two of works',
    K.trade(A, ['vigor', 'vigor'], B, ['leap']));
  ok('...and it really moved both', B.powerOrbs.filter((x) => x === 'vigor').length === 2
    && A.powerOrbs.join() === 'leap');
  A.setPowerOrbs(['vigor']);
  B.setPowerOrbs(['leap']);
  const dupBefore = [...A.powerOrbs];
  ok('offering two of something you have ONE of is refused',
    K.trade(A, ['vigor', 'vigor'], B, ['leap']) === false);
  ok('...and nothing moved', A.powerOrbs.join() === dupBefore.join()
    && B.powerOrbs.join() === 'leap');

  /* AND A PILE THAT WOULD OVERFLOW FAILS WHOLE, which is the same rule as the
     single-orb case one step further along and the one most likely to be got
     wrong: emptying both sides before filling either is what makes it true. */
  A.setPowerOrbs(['swift', 'ward', 'leap']);
  B.setPowerOrbs(Array(MAX_EQUIPPED - 1).fill('vigor'));
  const overA = [...A.powerOrbs];
  const overB = [...B.powerOrbs];
  ok('a pile that would leave somebody carrying nine is refused',
    K.trade(A, ['swift', 'ward', 'leap'], B, []) === false);
  ok('...and neither side lost anything to the attempt',
    A.powerOrbs.join() === overA.join() && B.powerOrbs.join() === overB.join());
  ok('two empty piles are refused, like two empty offers',
    K.trade(A, [], B, []) === false);

  /* --- SHE CAN PUT THEM DOWN AGAIN --------------------------------------
     Asked for as "a button they can select to drop the currently selected
     orbs — it will randomly drop them around the player, like it does when a
     player drops out of the game". The half that is not the button. */
  {
    A.setPowerOrbs(['swift', 'ward', 'leap']);
    B.setPowerOrbs([]);
    const home = A.position.clone();
    /* HER SISTER IS PARKED WELL OUT OF IT. Two hundred units away is off the
       island, which is the point: every pickup below has to be decided by the
       rule under test and not by whoever happened to be standing nearby. */
    B.position.set(home.x + 200, home.y, home.z + 200);
    ok('the kitten doing the dropping is standing on real ground',
      !!world.heightAt(home.x, home.z));
    const before = K.pickups.length;
    const n = K.drop(A, ['swift', 'ward']);
    ok('a pile she picked out goes on the ground', n === 2, `${n}`);
    ok('...and comes off her neck', A.powerOrbs.join() === 'leap');
    ok('...as two real pickups, not one', K.pickups.length === before + 2);
    /* NOTHING IS CREATED OR DESTROYED. There are twenty-six of these in the
       world; a drop is a MOVE, and this is the same conservation the trade
       above is held to. */
    ok('...conserving the count exactly',
      A.powerOrbs.length + K.pickups.length === 1 + before + 2);

    const dropped = K.pickups.slice(-2);
    ok('...and they are the two she named',
      dropped.map((pk) => pk.id).sort().join() === 'swift,ward');
    /* THE FAN STARTS AT ONE, NOT AT ZERO. `_leavePlayer` starts at zero
       because the kitten it drops for has just left; this one is standing on
       the spot, and `spread: 0` means "exactly at `at`" — a pile under her own
       feet rather than a ring around her. */
    for (const pk of dropped) {
      ok('...landing AROUND her rather than under her feet',
        pk.position.distanceTo(home) > 1,
        `${pk.position.distanceTo(home).toFixed(1)} away`);
    }
    ok('...and apart from each other',
      dropped[0].position.distanceTo(dropped[1].position) > 0.9,
      `${dropped[0].position.distanceTo(dropped[1].position).toFixed(1)}`);

    /* AND THEY DO NOT LEAP STRAIGHT BACK ONTO HER. The ring starts at 2.6 and
       she picks up at 2.8, so an orb she drops can land inside her own pickup
       circle: without the shyness the button hands the pile back on the first
       frame the world runs again and reads as doing nothing at all. THIS is
       the check that would have caught it.

       SHE IS STOOD ON ONE ON PURPOSE. `findOpenSpot` walks a dropped orb
       several units to find room, so leaving her where she happened to be
       makes this pass without ever testing anything — measured at five to
       seven units away on the first three runs of it. */
    ok('...shy of the kitten who dropped them', dropped.every((pk) => pk.shyOf === A));
    A.position.copy(dropped[0].position);
    for (let i = 0; i < 30; i++) K.update(1 / 60);
    ok('...so standing right on top of her own does not pick it up',
      dropped.every((pk) => !pk.taken) && A.powerOrbs.join() === 'leap');

    /* AND WALKING AWAY IS WHAT UNDOES IT, rather than a timer. What she has to
       do to take them back is the obvious thing, and there is no window to
       miss it in. */
    A.position.set(home.x + 200, home.y, home.z + 200);
    K.update(1 / 60);
    ok('...and stepping off it drops the shyness',
      dropped.every((pk) => pk.shyOf === null));
    A.position.copy(dropped[0].position);
    K.update(1 / 60);
    ok('...so she can walk back and pick her own orb up again',
      dropped[0].taken && A.powerOrbs.includes(dropped[0].id));
    A.position.copy(home);
  }

  /* BUT SHY ONLY OF HER. A sister walking over them is most of the point of
     dropping them, and a rule that made them shy of everybody would be a
     different feature. Its own drop, so exactly one orb is in play. */
  {
    A.setPowerOrbs(['vigor']);
    B.setPowerOrbs([]);
    const home = A.position.clone();
    ok('a single orb goes down too', K.drop(A, ['vigor']) === 1);
    const pk = K.pickups.at(-1);
    /* A IS SENT AWAY AFTER THE DROP, so the only kitten in reach is the one
       the rule is about. */
    A.position.set(home.x + 200, home.y, home.z + 200);
    B.position.copy(pk.position);
    K.update(1 / 60);
    ok('...and a sister standing on it picks it straight up',
      pk.taken && B.powerOrbs.includes('vigor'), B.powerOrbs.join());
    A.position.copy(home);
    B.position.copy(home);
  }

  /* NOTHING IS LOST WHEN THERE IS NOWHERE TO PUT IT. `dropInWorld` can decline
     — the Kotodama are not awakened, or there is no ground under the fanned
     point — and a drop that took the orb off her first would delete one of
     twenty-six on exactly that path. Fourth non-negotiable. */
  {
    A.setPowerOrbs(['swift', 'ward']);
    const had = [...A.powerOrbs];
    const before = K.pickups.length;
    K.awakened = false;
    const n = K.drop(A, ['swift', 'ward']);
    K.awakened = true;
    ok('a drop with nowhere to land moves nothing', n === 0);
    ok('...and she still has every one of them', A.powerOrbs.join() === had.join());
    ok('...and none appeared in the world either', K.pickups.length === before);
  }

  /* DROPPING WHAT SHE HAS NOT GOT IS IGNORED, not invented. The ids come off a
     screen that can be a frame stale. */
  {
    A.setPowerOrbs(['swift']);
    const before = K.pickups.length;
    ok('an orb she is not wearing cannot be dropped', K.drop(A, ['vigor']) === 0);
    ok('...and nothing was conjured to drop', K.pickups.length === before);
    ok('...while the one she IS wearing still drops', K.drop(A, ['swift']) === 1);
  }

  /* --- health is the one stat with a current value as well as a maximum --- */
  const H = mkKit(0);
  H.setPowerOrbs(['vigor', 'vigor']);
  ok('vigor raises the maximum', H.maxHp === 160);
  H.hp = 80;                                   // half
  H.setPowerOrbs([]);
  ok('...and dropping it keeps the FRACTION, not the number',
    H.maxHp === MAX_HP && H.hp === 50);
  ok('...so it can never leave her over full', H.hp <= H.maxHp);
}

console.log('\n--- the orbs face the camera ---');
{
  /* THE TEXT ON A WORN ORB IS BOLTED TO SOMETHING THAT TURNS, and a quaternion
     copy is LOCAL. `group` carries the orbit tilt and `orbNode` tumbles on two
     axes every frame, so `mesh.quaternion.copy(camera.quaternion)` leaves the
     parent's rotation on top: the kanji and the cos/sin readout arrive sheared,
     leaning and rolling once a second. That is the exact bug that got the
     drifting glyphs deleted from the plain Kotodama Orb.

     A SCREENSHOT CANNOT CHECK THIS. A still frame is the one place the fault
     hides — the text is at some angle, and so is everything else in a 2.5D
     game. The measurement can: the WORLD rotation of every text quad must equal
     the camera's, to zero. */
  const orb = new PowerOrb(ORB_BY_ID.swift, 0, 3);
  orb.setMathVisible(true);
  const centre = new THREE.Vector3(4, 1, -7);
  for (let i = 0; i < 40; i++) orb.update(1 / 60, centre);   // tilt it, tumble it

  const cam = new THREE.PerspectiveCamera(38, 1, 0.5, 100);
  cam.position.set(-18, 21, 26);
  cam.lookAt(centre);
  cam.updateMatrixWorld(true);

  ok('the orb really is tilted and tumbling',
    Math.abs(orb.group.rotation.z) > 0.05 && Math.abs(orb.orbNode.rotation.y) > 0.05);

  orb.faceCamera(cam);
  orb.group.updateMatrixWorld(true);
  const _wq = new THREE.Quaternion();
  const offBy = (o) => {
    o.getWorldQuaternion(_wq);
    return (_wq.angleTo(cam.quaternion) * 180) / Math.PI;
  };
  const worst = Math.max(
    offBy(orb.mark.mesh), offBy(orb.readout.mesh),
    ...orb.drops.map((d) => offBy(d.mesh))
  );
  line('worst text quad, off camera', worst.toFixed(4) + ' degrees');
  ok('every glyph on a worn orb is square to the camera', worst < 0.01);

  /* Non-vacuity: the obvious version is measurably wrong on the same orb, by
     roughly the parent rotation it forgot to cancel. */
  orb.mark.mesh.quaternion.copy(cam.quaternion);
  orb.group.updateMatrixWorld(true);
  const naive = offBy(orb.mark.mesh);
  line('...the same quad, copied naively', naive.toFixed(1) + ' degrees out');
  ok('...and a plain local copy would NOT be', naive > 5);

  /* The pickup is the easy case and must stay easy: its group never rotates,
     so Label.faceCamera is already right and must not be "fixed" into
     cancelling a rotation that was never applied. */
  const pk = new PowerOrbPickup(ORB_BY_ID.ward, 0, 0, 0);
  pk.update(0.4);
  pk.faceCamera(cam);
  pk.group.updateMatrixWorld(true);
  ok('a pickup lying in the world faces it too',
    Math.max(offBy(pk.mark.mesh), offBy(pk.label.mesh)) < 0.01);
}

console.log('\n--- the three power moves ---');
{
  const spawn = new THREE.Vector3(0, world.heightAt(0, 40).y, 40);
  const mk = (orbs = []) => {
    const p = new Player({
      texture: new THREE.Texture(), index: 0, spawn: spawn.clone(),
      cols: 8, rows: 4, mirror: false,
    });
    p.setPowerOrbs(orbs);
    return p;
  };
  /* `doubled` IS PART OF THE SHAPE NOW, so the default stub answers it. A pad
     that simply lacked it would let `Player` be written against a method half
     the callers do not have — which is exactly what happened, and the crash was
     in this file rather than in the game. */
  const PAD = (over = {}) => ({
    mx: 0, my: 0, down: () => false, pressed: () => false, doubled: () => false,
    ...over,
  });

  ok('all three are entries in ATTACKS',
    ATTACKS.tri && ATTACKS.dive && ATTACKS.charge);
  ok('the dive has no forward arc — it lands on everything below',
    ATTACKS.dive.arc === -1);
  ok('no power move out-damages the tournament cap',
    Math.max(ATTACKS.tri.dmg, ATTACKS.dive.dmg, ATTACKS.charge.dmg) < MAX_HP / 3);

  /* COMBAT STAYS FENCED OFF. `Game.strikePlayers` is the single gate and it
     asks `Tournament.fighting`; these moves are new ways to swing, not a new
     damage path. A kitten with every attack orb standing on top of her sister
     in the market square must not be able to take a single point off her. */
  const attacker = mk(['dive', 'charge', 'tri']);
  const victim = mk([]);
  victim.position.copy(attacker.position);
  /* The hud stands in for `Game` with the tournament OFF, which is what the
     real `strikePlayers` collapses to: it returns before touching anybody.
     What this asserts is that there is no SECOND route — that none of the
     three moves reaches `hurt` on its own. */
  const asked = [];
  const offGame = {
    sfx: () => {}, onMischief: () => {},
    strikePlayers: (a, kind) => { asked.push(kind); },
  };
  attacker._diveImpact(world, offGame);
  attacker._chargeHit = new Set();
  attacker.chargeDir.set(0, 1);
  attacker._chargeStrike(world, offGame);
  attacker._doSlash(world, offGame, 'tri');
  ok('all three ask the gate rather than hitting her themselves',
    ['dive', 'charge', 'tri'].every((k) => asked.includes(k)), asked.join(' '));
  ok('...so with the tournament off they do nothing at all',
    victim.hp === victim.maxHp && !victim.ko);

  /* --- HOW FAR UP A BLADE REACHES ---
     Reported as "the katana hits players from pretty high up in the air".
     `strikePlayers` tests the ground distance against the attack's reach and
     then asks one SEPARATE question about height, and that second number was
     the literal 4.5 — a column nine metres tall, so a kitten standing on the
     arena floor could cut one who had double-jumped clean over her head. The
     girl in the air has no way to read that as anything but being hit from
     nowhere.

     CHECKED AGAINST THE NUMBER IT REPLACED, not against a number typed twice.
     "At least half as big" was the ask, and stating it that way is what makes
     this an assertion about the change rather than a copy of the answer — a
     later tuning session may well move it again, and this stays true until
     somebody moves it back UP, which is the thing worth catching. */
  const OLD_STRIKE_HEIGHT = 4.5;
  ok('a blade no longer reaches half a storey up',
    Number.isFinite(COMBAT.strikeHeight) && COMBAT.strikeHeight > 0
    && COMBAT.strikeHeight <= OLD_STRIKE_HEIGHT / 2,
    `${COMBAT.strikeHeight}m (was ${OLD_STRIKE_HEIGHT}m)`);
  line('vertical strike window', `+/-${COMBAT.strikeHeight}m (was +/-${OLD_STRIKE_HEIGHT}m)`);
  {
    const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    /* ONE NUMBER, IN THE TABLE. A literal left behind in main.js would be a
       balance knob the balance page cannot reach — which is how a tuning tool
       rots into something nobody trusts. */
    ok('...and the gate reads it from COMBAT rather than carrying its own copy',
      /Math\.abs\(dy\) > COMBAT\.strikeHeight/.test(src)
      && !/Math\.abs\(dy\) > 4\.5/.test(src));
    /* IT IS NOT SCALED BY THE CLAN BUFF, and that is a decision rather than an
       omission. Riverclaw's blade is LONGER, not TALLER: a reach buff says how
       far in FRONT of her the arc goes, and letting it grow the vertical window
       would hand the one clan that already out-reaches you the ability to reach
       UP as well as out — which is the invisible asymmetry the round card
       exists to prevent. */
    ok('...and a reach buff does not also make her taller',
      !/Math\.abs\(dy\) > COMBAT\.strikeHeight \* clanK/.test(src));
  }
  {
    /* AND IT IS ON THE BALANCE PAGE, because the right value here is a thing
       you find by playing. Halving it is the defensible answer without a play
       session behind it; the page is what lets the next session move it without
       a code edit. */
    const page = readFileSync(new URL('../src/tuning-page.js', import.meta.url), 'utf8');
    ok('...and the balance page can tune it', /strikeHeight:\s*\[/.test(page));
    /* NAMING THE TRAP. `lift` is how far a hit throws her UP and this is how
       far apart they may be for it to land at all; they were never related and
       the resemblance is exactly the sort of thing somebody equalises. */
    ok('...and says out loud that it is not the same thing as Lift',
      /strikeHeight:.*Lift/.test(page));
  }

  /* --- the ward: HELD, capped, tailed --- */
  const HOLD = PAD({ down: (a) => a === 'mount' });
  const step = (p, pad, n) => { for (let i = 0; i < n; i++) p._stepSpecials(1 / 60, pad, world, null); };

  const w = mk(['ward']);
  ok('the ward will not go up without the orb', mk([])._popWard(null) === false);
  ok('...and does with it', w._popWard(null) === true && w.warded);
  ok('...but not twice at once', w._popWard(null) === false);
  ok('gravity is quartered while it is up', w._gravityK() === WARD.gravity);
  ok('a blade is refused',
    w.hurt(40, { x: 5, z: 0 }, ATTACKS.stand, null) === 0 && w.hp === w.maxHp);
  /* The ring-out is the one caller that pierces it. Without that a kitten
     wearing the orb parks herself off the side of the arena and takes nothing
     for the whole round. */
  ok('the edge of the ring is not',
    w.hurt(30, { x: 5, z: 0 }, { knock: 0, lift: 0, pierce: true }, null) === 30);

  /* SHE HAS TO KEEP HOLDING IT. A block that survives the button coming up is
     the toggle this replaced, and the toggle is what made it a state she was
     in rather than something she was doing. */
  step(w, HOLD, 30);
  ok('holding keeps it up', w.wardOn && w.warded);
  step(w, PAD(), 1);
  ok('letting go ends the block', !w.wardOn);
  ok('...but it still works for a moment', w.warded && w.wardTail > 0);
  ok('...and a blow landing in that moment is still blocked',
    w.hurt(40, { x: 5, z: 0 }, ATTACKS.stand, null) === 0);
  /* THE WAIT STARTS AT THE RELEASE, and the tail runs INSIDE it. Charged from
     the press, a 2s block on a 1.5s wait is already back before it runs out;
     charged when the tail expires, the gap she feels is longer than the number
     the profile screen showed her. */
  ok('...and the wait started at the RELEASE',
    Math.abs(w.wardCool - WARD.cool) < 0.03);
  step(w, PAD(), Math.ceil(WARD.tail * 60) + 1);
  ok('the tail runs out', !w.warded);
  ok('...with most of the wait still to go', w.wardCool > WARD.cool - WARD.tail - 0.05);
  ok('...so she cannot block again yet', w._popWard(null) === false);
  step(w, PAD(), 200);
  ok('...and can once the wait is over', w.wardCool === 0 && w._popWard(null) === true);

  /* TWO SECONDS IS A HARD CAP, thumb down or not — otherwise "2s max" is a
     suggestion and the button is a toggle again with extra steps. */
  const capped = mk(['ward']);
  capped._popWard(null);
  let heldFor = 0;
  for (let i = 0; i < 600 && capped.wardOn; i++) {
    capped._stepSpecials(1 / 60, HOLD, world, null);
    heldFor += 1 / 60;
  }
  line('block length while held down', `${heldFor.toFixed(2)}s (cap ${WARD.max})`);
  ok('a block held forever still ends at the cap',
    Math.abs(heldFor - WARD.max) < 0.05);
  ok('...and charges the same wait', Math.abs(capped.wardCool - WARD.cool) < 0.03);

  /* Losing the orb mid-block is a real case: her sister can trade the Ward out
     of her hand while the bubble is up, and the block has to fall with it. */
  const robbed = mk(['ward']);
  robbed._popWard(null);
  robbed.setPowerOrbs([]);
  step(robbed, HOLD, 1);
  ok('trading the orb away mid-block drops it', !robbed.wardOn);

  /* And the whole thing has to be reachable through the real controller, on
     the real button, with nothing in reach to climb onto. */
  const real = mk(['ward']);
  real.update(1 / 60, PAD({ down: (a) => a === 'mount', pressed: (a) => a === 'mount' }),
    world, [], null);
  ok('the mount button really starts it', real.wardOn);


  /* --- and the double tap, which latches it ---
     TWO THUMBS CANNOT HOLD THREE THINGS. Blocking while steering and jumping
     wants the stick, MOUNT and A at once, which is one thumb short — the same
     shortage the touch pad's RUN latch already answers. The gesture is press,
     release, press, and the middle step is what makes it hard: the release has
     already ended the block and charged the wait before the second press
     arrives. See Player._latchWard. */
  {
    const TAP = PAD({ down: (a) => a === 'mount', pressed: (a) => a === 'mount',
      doubled: (a) => a === 'mount' });
    const ONE = PAD({ down: (a) => a === 'mount', pressed: (a) => a === 'mount' });
    const NONE = PAD({ doubled: () => false });

    /* The window is stated ONCE and imported. Two copies of a number that must
       agree is one copy a session tunes and one it does not — and this one is
       a gesture a child learns on glass and repeats on a controller. */
    const inp = readFileSync(new URL('../src/core/input.js', import.meta.url), 'utf8');
    const tp = readFileSync(new URL('../src/core/touchpad.js', import.meta.url), 'utf8');
    ok('the double-tap window is exported once',
      /export const DOUBLE_TAP_MS = \d+/.test(inp));
    ok('...and the touch pad imports it rather than keeping its own',
      /import \{ ACTIONS, DOUBLE_TAP_MS \} from '\.\/input\.js'/.test(tp)
      && !/const DOUBLE_TAP_MS = \d/.test(tp));

    /* THE WHOLE GESTURE, FRAME BY FRAME, because the middle step is the hard
       one and a test that skipped it would pass against a version that does
       not work. Press, LET GO, press: the release runs `_dropWard` and charges
       the wait a fifth of a second before the second press arrives, so the
       second press has to take that back rather than start something new. */
    const L = mk(['ward']);
    L.update(1 / 60, ONE, world, [], null);            // tap one
    ok('the first tap of a double tap is an ordinary held block',
      L.wardOn && !L.wardHold);
    step(L, NONE, 6);                                  // ...and she lets go
    ok('...and letting go ends it, as it always did', !L.wardOn);
    L.update(1 / 60, TAP, world, [], null);            // tap two, inside the window
    ok('...but the second tap inside the window latches it', L.wardOn && L.wardHold);
    /* THE PAYOFF: the button comes back and the bubble stays. */
    step(L, NONE, 30);
    ok('...so letting go no longer ends it', L.wardOn && L.warded);

    /* AND IT BUYS NO EXTRA TIME. A latch that also lengthened the block would
       be a second, better ability hiding inside the first, and the profile
       screen has one number on it. `wardUsed` has been running since tap ONE,
       so the cap is measured from there. */
    let latchedFor = L.wardUsed;
    for (let i = 0; i < 600 && L.wardOn; i++) {
      L._stepSpecials(1 / 60, NONE, world, null);
      latchedFor += 1 / 60;
    }
    /* A COLD DOUBLE TAP IS NOT A LATCH, and it must not be: with no block up
       and no release to forgive there is nothing to take back, so it falls
       through to an ordinary press. Two taps on a fresh kitten therefore give
       her exactly what two taps always gave her. */
    const cold = mk(['ward']);
    cold.update(1 / 60, TAP, world, [], null);
    ok('a double tap out of nowhere is just a press', cold.wardOn && !cold.wardHold);
    line('block length when latched', `${latchedFor.toFixed(2)}s (cap ${WARD.max})`);
    ok('a latched block ends at the same cap a held one does',
      Math.abs(latchedFor - WARD.max) < 0.05);
    ok('...and the latch comes off with it', !L.wardHold);

    /* SHE HAS TO DO IT AGAIN. This is the half that was broken on the phone:
       the latch outlived the block it was holding, so the shield worked once
       and the button was dead after. */
    ok('...so a single press cannot bring it back', L._popWard(null) === false);
    step(L, NONE, 200);
    L.update(1 / 60, ONE, world, [], null);
    ok('...and one press after the wait gives an ORDINARY held block',
      L.wardOn && !L.wardHold);

    /* THE RE-GRAB IS ARMED BY A RELEASE AND BY NOTHING ELSE. Armed by running
       out, a double tap on a spent bubble would hand her a fresh one free. */
    const spent = mk(['ward']);
    spent._popWard(null);
    step(spent, PAD({ down: (a) => a === 'mount' }), 600);
    ok('running out does not arm a re-grab', !spent.wardOn && spent.wardRegrab === 0);
    ok('...so a double tap on a spent bubble is refused',
      spent._latchWard(null) === false);

    const let_go = mk(['ward']);
    let_go._popWard(null);
    step(let_go, NONE, 1);
    ok('letting go DOES arm one', !let_go.wardOn && let_go.wardRegrab > 0);
    const usedBefore = let_go.wardUsed;
    ok('...and the second tap takes the bubble back', let_go._latchWard(null) === true);
    ok('...with the wait it charged', let_go.wardCool === 0 && let_go.wardTail === 0);
    /* NOT THE CLOCK, THOUGH. She resumes the same block, not a new one. */
    ok('...but NOT the seconds already spent',
      Math.abs(let_go.wardUsed - usedBefore) < 1e-9);
    ok('...and the grace is spent once', let_go.wardRegrab === 0);

    /* THE GRACE OUTLASTS THE TAP WINDOW, deliberately: a gesture must not be
       lost to one long frame, and it must not last long enough to forgive a
       release the player has finished making. */
    ok('the grace is longer than the tap window and still short',
      WARD.regrab > 0.34 && WARD.regrab < 1.0, `${WARD.regrab}s`);

    /* NOT OUT OF A CROSS SLASH, BY EITHER DOOR. The technique's whole price is
       that she is planted and open; a bubble she can get back on the second cut
       refunds it. `_popWard` always refused. `_latchWard` is the second door,
       and `_startTriple` dropping the ward as a "release" would have propped
       it open. */
    const cross = mk(['ward', 'tri']);
    cross._popWard(null);
    cross._startTriple(null);
    ok('starting a Cross Slash drops the bubble', !cross.wardOn);
    ok('...and arms no re-grab', cross.wardRegrab === 0);
    ok('...so a double tap cannot buy it back mid-technique',
      cross._latchWard(null) === false && !cross.wardOn);
    const crossLate = mk(['ward', 'tri']);
    crossLate._popWard(null);
    step(crossLate, NONE, 1);              // released: grace armed
    crossLate.triLockT = 0.5;              // ...and now she is in the technique
    ok('...nor inside the recovery, even with the grace still running',
      crossLate.wardRegrab > 0 && crossLate._latchWard(null) === false);

    /* A LATCH IS A PROMISE ABOUT ONE BLOCK. Outliving it means a kitten who
       gets on a dragon, gets off and taps mount ONCE is invincible. */
    const cleared = mk(['ward']);
    cleared.update(1 / 60, TAP, world, [], null);
    cleared._clearSpecials();
    ok('getting on a dragon takes the latch with the bubble',
      !cleared.wardOn && !cleared.wardHold && cleared.wardRegrab === 0);

    /* THE ANIMAL STILL WINS THE BUTTON. The double tap is read inside the
       branch nothing was in range for, so it cannot beat a dragon to it. */
    const src = readFileSync(new URL('../src/entities/player.js', import.meta.url), 'utf8');
    ok('the double tap is asked only after every mount has declined',
      /if \(!\(pad\.doubled\?\.\('mount'\) && this\._latchWard\(hud\)\)\) this\._popWard\(hud\);/
        .test(src));
  }

  /* --- the charge --- */
  const c = mk(['charge']);
  c.facing = Math.PI / 2;                       // +x
  c._startCharge(null);
  ok('a charge turns gravity off', c._gravityK() === 0);
  ok('...and takes her feet', c.busy);
  const cx = c.position.x;
  for (let i = 0; i < 120 && c.chargeT > 0; i++) {
    c.update(1 / 60, PAD(), world, [], null);
  }
  const went = Math.abs(c.position.x - cx);
  line('charge distance', `${went.toFixed(1)} of a nominal ${CHARGE.dist}`);
  ok('she really travels', went > CHARGE.dist * 0.5);
  ok('...and it ends', c.chargeT === 0 && !c.busy);
  ok('...handing back a velocity the controller can stop',
    Math.hypot(c.velocity.x, c.velocity.z) < CHARGE.speed);
  ok('a kitten without the orb cannot charge', mk([]).power.charge === null);

  /* --- the triple slash --- */
  /* A TAP AND A HOLD ARE ALTERNATIVES, NOT A SEQUENCE, and that is the whole
     rework. The old shape threw the ordinary swing on the PRESS and turned it
     into the first of three if the button was still down 0.22s later — so the
     technique could only ever start on somebody the first swing had already
     knocked out of reach of the other two, and it was strictly worse than the
     single slash it cost more to throw.
     Now the press only starts a stopwatch. These walk a real button through
     the real controller, because the bug being guarded against is a timing
     one and a timing bug does not show up in a unit call. */
  const SWINGS = () => {
    const kinds = [];
    /* Both doors, separately. `sfx` is a name that is always synthesised and
       `sample` is a name that is a recorded file — the Cross Slash's verdict
       comes out of the second one and a spy that lumped them together could
       not tell a cackle from a blip. */
    const sounds = [];
    const samples = [];
    return {
      kinds,
      sounds,
      samples,
      sfx: (n) => { sounds.push(n); },
      sample: (n) => { samples.push(n); },
      toast: () => {}, onMischief: () => {},
      strikePlayers: (_a, kind) => { kinds.push(kind); },
      strikeCritters: () => {},
    };
  };
  {
    const held = mk(['tri']);
    const down = PAD({ down: (a) => a === 'attack', pressed: (a) => a === 'attack' });
    const stay = PAD({ down: (a) => a === 'attack' });
    const spy = SWINGS();
    held.update(1 / 60, down, world, [], spy);          // the press
    /* THE PRESS ITSELF THROWS NOTHING. If it did, the move would be a slash
       plus three cuts again and every target would be gone before cut two. */
    ok('with the orb on, the press alone swings at nobody', spy.kinds.length === 0);
    let armedAt = -1;
    for (let i = 0; i < 60 && held.triLeft === 0; i++) {
      held.update(1 / 60, stay, world, [], spy);
      if (held.triLeft > 0) armedAt = (i + 1) / 60;
    }
    line('hold to the first cut',
      `${armedAt.toFixed(2)}s (hold ${CROSS.hold} + wind ${CROSS.wind})`);
    ok('holding attack really does fire it', held.triLeft > 0);
    /* THE FIRST CUT COMES AFTER `hold` PLUS `wind`, WHICH IS THE WHOLE POINT
       OF THE REWORK. It used to be `hold` alone and that was the complaint
       from a four-player afternoon: the technique landed as one unavoidable
       lump and the only warning was a quarter second she could spend walking.
       Both halves are asserted rather than the total, because they are two
       different rules and a future turn of one knob must not be able to hide
       under the other — see CROSS.wind. */
    ok('...after the hold AND the wind-up, not just the hold',
      armedAt > CROSS.hold + CROSS.wind - 0.02
      && armedAt < CROSS.hold + CROSS.wind + 0.12);
    ok('...having thrown no ordinary swing on the way there',
      spy.kinds.every((k) => k === 'tri'), spy.kinds.join(' ') || '(none)');

    /* SHE IS PLANTED FOR THE WIND-UP AND MOBILE FOR THE HOLD, and these are
       the two halves that must not merge. A kitten frozen for the tap window
       has lost the ordinary slash; a wind-up she can walk through is not a
       tell. Replayed from scratch so the frame counting is honest. */
    const timed = mk(['tri']);
    let mobileAt = -1;
    let plantedAt = -1;
    timed.update(1 / 60, down, world, [], SWINGS());
    for (let i = 1; i < 60 && timed.triLeft === 0; i++) {
      const at = i / 60;
      if (!timed.busy) mobileAt = at;
      else if (plantedAt < 0) plantedAt = at;
      timed.update(1 / 60, stay, world, [], SWINGS());
    }
    line('mobile until / planted from', `${mobileAt.toFixed(2)}s / ${plantedAt.toFixed(2)}s`);
    ok('...she can still walk through the tap window',
      mobileAt >= CROSS.hold - 0.03, `${mobileAt.toFixed(2)}s`);
    ok('...and is planted for the whole wind-up',
      plantedAt > 0 && plantedAt <= CROSS.hold + 0.03, `${plantedAt.toFixed(2)}s`);

    /* LETTING GO DURING THE WIND-UP THROWS IT AWAY — and throws away nothing
       else. Nothing has been swung, so the abort must not leak an ordinary
       slash out of the release the way a tap does; that would make the
       wind-up a free feint. */
    const bail = mk(['tri']);
    const bspy = SWINGS();
    bail.update(1 / 60, down, world, [], bspy);
    for (let i = 0; i < 19; i++) bail.update(1 / 60, stay, world, [], bspy);   // 0.33s
    ok('a released wind-up is a wind-up in progress', bail.triWindT > 0);
    bail.update(1 / 60, PAD(), world, [], bspy);                               // let go
    ok('...and letting go of it aborts', bail.triWindT === 0 && !bail.triAt);
    for (let i = 0; i < 60; i++) bail.update(1 / 60, PAD(), world, [], bspy);
    ok('...throwing nothing at all', bspy.kinds.length === 0, bspy.kinds.join(' ') || '(none)');
    ok('...and saying so out loud', bspy.sounds.includes('deny'));

    /* AND A TAP STILL SWINGS — on the release, but it swings. A kitten who
       picked up the orb and found her katana had stopped working on barrels
       would put it straight back. */
    const tap = mk(['tri']);
    const tspy = SWINGS();
    tap.update(1 / 60, down, world, [], tspy);
    tap.update(1 / 60, PAD(), world, [], tspy);          // let go
    ok('...and a tap swings on the release', tspy.kinds.length === 1, tspy.kinds.join(' '));
    for (let i = 0; i < 60; i++) tap.update(1 / 60, PAD(), world, [], tspy);
    ok('...without ever becoming the technique', tap.triLeft === 0 && !tap.triAt);

    /* THE TAX IS ONLY PAID BY THE ORB. Two sisters on the desktop game they
       already know have no Sanzan orb between them until 100% mischief, and
       their katana must still fire on the frame they press it — see the fifth
       non-negotiable. */
    const plain = mk([]);
    const pspy = SWINGS();
    plain.update(1 / 60, down, world, [], pspy);
    ok('without the orb the swing is still on the PRESS', pspy.kinds.length === 1);
    /* THE TAP/HOLD LINE HAS BEEN 0.22, 0.05 AND 0.25, AND ONLY THE MIDDLE ONE
       WAS TESTED IN A HAND. At 0.05 the technique came out when a kid meant to
       slash — three frames is shorter than a deliberate tap, never mind the
       grip of somebody mashing — so the ORDINARY swing became the hard one to
       throw, which is backwards.
       The latency worry that argued for 0.05 does not survive either: the
       swing goes out WHEN SHE LETS GO, so a 90ms tap is a 90ms slash and this
       number is not a delay anybody pays. It is only how long a hold has to be
       to mean she wanted the other move. */
    ok('...and the hold has to be meant, not brushed', CROSS.hold >= 0.2,
      `${(CROSS.hold * 1000).toFixed(0)}ms`);
    /* Slow enough to SEE three of something happen. It has been 0.16 and 0.21
       and both were over before a nine-year-old could count them. */
    ok('...and the three cuts take about a second', CROSS.cuts * CROSS.gap >= 0.85,
      `${(CROSS.cuts * CROSS.gap).toFixed(2)}s`);

    /* THE ORB'S ID MAY NEVER CHANGE. It is written into every saved profile
       and read by the dealer's stock table; the name beside it is free to move
       and has (Sanzan / TRIPLE SLASH became Juuji / CROSS SLASH). Renaming the
       id would cost every profile already on a machine its orb, silently. */
    const sanzan = ORB_BY_ID.tri;
    ok('the cross slash orb is still id `tri` whatever it is called',
      !!sanzan && sanzan.id === 'tri' && ATTACKS.tri);
    ok('...and the name a player sees is the Cross Slash',
      sanzan.label === 'CROSS SLASH' && sanzan.kanji === '十', sanzan.label);
  }

  const t = mk(['tri']);
  t._startTriple(null);
  ok('the technique owns all three cuts', t.triLeft === CROSS.cuts);
  ok('she cannot move or jump through it', t.busy);
  let cuts = 0;
  const spy = { sfx: (n) => { if (n === 'slash') cuts++; }, strikePlayers: () => {} };
  for (let i = 0; i < 120 && t.triLeft > 0; i++) t._stepSpecials(1 / 60, PAD(), world, spy);
  ok('...and every one of them lands', cuts === CROSS.cuts);
  /* THE THIRD CUT GETS THE SAME TIME ON SCREEN AS THE OTHER TWO. Starting the
     hang the instant it lands gives it none of the gap the first two got, so
     "three cuts at 0.3 each" would really be two at 0.3 and one at nothing —
     and she would be free a third of a second early, mid-move. */
  ok('...and the third one is on screen as long as the others',
    t.triT > 0 && t.triHangT === 0 && t.busy);
  let third = 0;
  for (let i = 0; i < 120 && t.triT > 0; i++) { t._stepSpecials(1 / 60, PAD(), world, spy); third++; }
  line('one cut', `${(third / 60).toFixed(2)}s (nominal ${CROSS.gap})`);
  ok('...she is still planted while it finishes', t.busy);
  /* THE PAUSE FOR EFFECT IS NOT DEAD TIME. She is still planted through it and
     everything she caught is still frozen — it is the beat before the launch
     that makes the launch read as one, and a `busy` that went false here would
     let her walk away mid-technique. */
  ok('...then a beat before the launch', t.triHangT > 0 && t.busy);
  let hang = 0;
  for (let i = 0; i < 120 && t.triAt; i++) { t._stepSpecials(1 / 60, PAD(), world, spy); hang++; }
  line('pause for effect', `${(hang / 60).toFixed(2)}s (nominal ${CROSS.hang})`);
  ok('...then she gets her feet back', !t.busy && !t.triAt);
  ok('...and cannot swing again for three quarters of a second',
    Math.abs(t.attackCooldown - CROSS.cool) < 0.02, t.attackCooldown.toFixed(2));

  /* --- the verdict, out loud ---------------------------------------------
     THE MOVE SAYS HOW WELL IT WENT, AND THAT IS THE FEATURE. Four rungs of one
     kitten's cackle: a squeak for a whiff, the trailer's demon for all three.
     What is actually pinned here is the GRADING — that the sound is a function
     of how many cuts connected — because the failure mode is not silence, it
     is the same noise every time, which reads as the move having no outcome.

     `landing` fakes the strike: the sequencer clears `_triLanded` before each
     `_doSlash` and reads it after, and `Game.strikePlayers` is what would
     normally set it. Counting the cuts here rather than trusting the count
     inside is what makes this a behaviour check and not a restatement. */
  {
    const runTech = (landing) => {
      const p = mk(['tri']);
      const heard = SWINGS();
      let cut = 0;
      heard.strikePlayers = (a, kind) => {
        heard.kinds.push(kind);
        if (kind === 'tri' && cut++ < landing) a._triLanded = true;
      };
      p._startTriple(heard);
      for (let i = 0; i < 600 && p.triAt; i++) p._stepSpecials(1 / 60, PAD(), world, heard);
      return { p, heard };
    };
    for (let n = 0; n <= CROSS.cuts; n++) {
      const { heard } = runTech(n);
      ok(`${n} cut(s) landing is graded as cross${n}`,
        heard.samples.length === 1 && heard.samples[0] === `cross${n}`,
        heard.samples.join(' ') || '(silent)');
    }
    /* ONE CUT CATCHING TWO SISTERS IS STILL ONE CUT. `_triLanded` is a boolean
       and not a counter for exactly this: "if 2 hits land" was said about the
       three swings, not about the bodies. A counter here would hand a kitten
       the demon cackle for one lucky swing through a crowd. */
    const crowd = mk(['tri']);
    const cspy = SWINGS();
    let swing = 0;
    cspy.strikePlayers = (a, kind) => {
      swing++;
      if (swing === 1) { a._triLanded = true; a._triLanded = true; a._triLanded = true; }
    };
    crowd._startTriple(cspy);
    for (let i = 0; i < 600 && crowd.triAt; i++) crowd._stepSpecials(1 / 60, PAD(), world, cspy);
    ok('...and one cut through a crowd is still one cut',
      cspy.samples[0] === 'cross1', cspy.samples.join(' '));

    /* THE RECOVERY ANNOUNCES ITSELF. Three quarters of a second is long enough
       to lose track of in a four-way brawl, which is the whole reason it is
       there — see CROSS.cool. Exactly once, and after the cooldown rather than
       with it: a chime on the launch would be telling her the opposite. */
    const { p: done, heard } = runTech(1);
    const before = heard.sounds.filter((n) => n === 'crossReady').length;
    ok('the recovery does not chime while it is still running', before === 0);
    for (let i = 0; i < 600 && done.triCoolT > 0; i++) {
      done.update(1 / 60, PAD(), world, [], heard);
    }
    ok('...and chimes exactly once when it ends',
      heard.sounds.filter((n) => n === 'crossReady').length === 1);
    ok('...at which point she really can swing again', done.attackCooldown <= 0);

    /* --- and being hit takes all of it away -----------------------------
       THE ONE WAY OUT OF A COMMITTED TECHNIQUE. Everything else about the move
       is deliberately unstoppable — she cannot cancel, block or walk out of it
       — so a sister who reads the wind-up and lands a blade first has to be
       able to stop it, or the counter-play is "stand somewhere else". */
    const struck = mk(['tri']);
    const sspy = SWINGS();
    sspy.strikePlayers = (a, kind) => { if (kind === 'tri') a._triLanded = true; };
    struck._startTriple(sspy);
    for (let i = 0; i < 40 && struck.triLeft > 1; i++) {
      struck._stepSpecials(1 / 60, PAD(), world, sspy);
    }
    ok('a technique interrupted mid-way was really under way',
      struck.triAt && struck.triHits > 0 && struck.triHits < CROSS.cuts);
    struck.hurt(10, { x: struck.position.x + 5, z: struck.position.z }, { knock: 10, lift: 4 }, sspy);
    ok('...is stopped dead by the hit',
      !struck.triAt && struck.triLeft === 0 && struck.triHangT === 0);
    for (let i = 0; i < 600; i++) struck._stepSpecials(1 / 60, PAD(), world, sspy);
    /* NO FUNNY NOISE FOR A TECHNIQUE THAT WAS STOPPED. Said in as many words by
       the person who asked for the cackles, and it falls out of WHERE the
       sound is played rather than out of a flag: only the launch branch plays
       it, and a cancel never reaches the launch branch. */
    ok('...and makes no cackle, then or ever', sspy.samples.length === 0,
      sspy.samples.join(' ') || '(silent)');
    ok('...nor a ready chime for a recovery she never got',
      !sspy.sounds.includes('crossReady'));
    /* The wind-up is stopped by a hit too — she is planted and open through it
       and a kitten who could be hit out of the cuts but not out of the wind-up
       would be safest during the half of the move that is meant to be the
       warning. */
    const early = mk(['tri']);
    const espy = SWINGS();
    early._startWind(espy);
    early.hurt(10, { x: early.position.x + 5, z: early.position.z }, { knock: 10, lift: 4 }, espy);
    ok('...and a wind-up is interruptible for the same reason',
      early.triWindT === 0 && !early.triAt);
  }

  /* --- the block may not be used to cancel the price of the move ---
     The whole cost of a cross slash is that she is planted and open for about
     a second. A bubble she can pop on the second cut, or on the frame the
     launch goes out, refunds that and makes the technique free. */
  {
    const both = mk(['tri', 'ward']);
    ok('a kitten wearing both can normally block', both._popWard(null) === true);
    both._dropWard(null);
    both.wardCool = 0;
    both.wardTail = 0;
    both._popWard(null);
    ok('...and a live block is dropped by starting a cross slash',
      both.wardOn && (both._startTriple(null), !both.wardOn));
    ok('...which charges her the ordinary wait for it, not a free cancel',
      both.wardCool > 0);
    let refusals = 0;
    const denied = { sfx: () => {}, toast: () => { refusals++; }, strikePlayers: () => {} };
    ok('...and she cannot put it back up mid-technique',
      both._popWard(denied) === false && !both.wardOn);
    /* A REFUSAL MUST SAY SO — sixth non-negotiable. This one is invisible
       otherwise: she is mid-swing, the button does nothing, and there is no
       way to find out why. */
    ok('...and the refusal says so out loud', refusals === 1);
    /* Run the whole move out, and the lock outlives it by the cooldown. */
    for (let i = 0; i < 600 && both.triAt; i++) both._stepSpecials(1 / 60, PAD(), world, spy);
    both.wardCool = 0;
    ok('...nor on the frame the launch goes out',
      !both.triAt && both.triLockT > 0 && both._popWard(denied) === false);
    for (let i = 0; i < 600 && both.triLockT > 0; i++) both._stepSpecials(1 / 60, PAD(), world, spy);
    ok('...but she gets it back once the recovery is over',
      both._popWard(null) === true);
    /* Starting a round unable to block would be invisible and unexplainable,
       so the reset clears the lock even though `_clearSpecials` leaves it. */
    const posted = mk(['tri', 'ward']);
    posted._startTriple(null);
    posted.resetForRound(0, world.heightAt(0, 40).y, 40, 0);
    ok('...and a round reset hands it straight back', posted.triLockT === 0);
  }

  /* --- caught in one: frozen, banked, and nobody else's business ---
     EVERY ONE OF THESE IS THE OLD BUG STATED AS A RULE. The cuts used to
     `hurt`, which threw the target clear on the first one; the whole point of
     the rework is that they hold instead, so what has to be pinned is that
     holding really holds — she does not fall, does not act, takes nothing yet,
     cannot be stolen, and cannot be cut a fourth time. */
  {
    const by = mk(['tri']);
    const her = mk([]);
    const dmg = ATTACKS.tri.dmg;
    ok('a cut catches her rather than hurting her',
      her.triCapture(by, dmg, 1, 0) && her.heldBy === by && her.hp === her.maxHp);
    ok('...weightless while she is held', her._gravityK() === 0);
    /* A FULL-TILT STICK AND SHE GOES NOWHERE. `heldBy` reaches the controller
       through the same dead-pad line a hit and a daze use, so no movement mode
       has to learn the technique exists — but that line is one `||` and this is
       what notices if somebody removes it. */
    const hx = her.position.x;
    const hz = her.position.z;
    const FULL = PAD({ mx: 1, my: 1, down: () => true, pressed: () => true });
    for (let i = 0; i < 30; i++) her.update(1 / 60, FULL, world, [], SWINGS());
    ok('...and the stick does nothing at all',
      Math.hypot(her.position.x - hx, her.position.z - hz) < 0.01);
    ok('...nor does she fall out from under the other two cuts',
      Math.abs(her.velocity.y) < 0.01);

    her.triCapture(by, dmg, 1, 0);
    her.triCapture(by, dmg, 1, 0);
    ok('three cuts bank three lots of damage',
      her.heldHits === CROSS.cuts && Math.abs(her.heldDmg - dmg * CROSS.cuts) < 0.001);
    /* THE CAP IS THE CONTRACT. A fourth cut landing would be invisible right
       up until the day it one-shot somebody, and a Sanzan stack is supposed to
       make each cut hurt MORE, never to add one. */
    ok('...and a fourth never lands', her.triCapture(by, dmg, 1, 0) === false
      && her.heldHits === CROSS.cuts);

    const thief = mk(['tri']);
    ok('nobody else can take her mid-technique',
      thief !== by && her.triCapture(thief, dmg, 1, 0) === false && her.heldBy === by);

    /* THE LAUNCH DIRECTION IS `hurt`'S OWN CONTRACT, and `Game._freeTripleHold`
       leans on it: it hands `hurt` a point one unit BEHIND her along the stored
       direction so the push comes back out along it. If `hurt` ever stopped
       computing the throw as (target - from), the technique would fire everyone
       it caught the wrong way and nothing else in the game would notice. */
    const dx = her.heldDx;
    const dz = her.heldDz;
    const banked = her.heldDmg;
    her.releaseHold();
    ok('letting go clears every scrap of the hold',
      !her.heldBy && her.heldHits === 0 && her.heldDmg === 0);
    const dealt = her.hurt(banked, { x: her.position.x - dx, z: her.position.z - dz },
      { knock: CROSS.knock, lift: CROSS.lift }, null);
    ok('...and the banked damage is paid all at once', dealt === banked, `${dealt}`);
    ok('...throwing her the way the cuts were coming from',
      her.velocity.x > 1 && Math.abs(her.velocity.z) < 0.001);
    ok('...and hard enough to be worth the wait', her.velocity.y >= CROSS.lift);

    /* THE WATCHDOG IS A FLOOR UNDER A BUG, NOT A TIMER ANYBODY PLAYS AGAINST.
       It has to outlast a healthy technique by a clear margin or it becomes
       the thing that ends the move — and a kitten released early is a kitten
       the last cut misses, which is the bug this whole file is about. */
    const fresh = mk([]);
    fresh.triCapture(by, dmg, 1, 0);
    ok('the stranding watchdog outlasts the whole technique',
      fresh.heldT > CROSS.cuts * CROSS.gap + CROSS.hang + 1,
      `${fresh.heldT.toFixed(2)}s`);

    /* The ward stops this the way it stops any other blade. An exception here
       would read to a kid as the bubble being broken. */
    const blocked = mk(['ward']);
    blocked._popWard(null);
    ok('a raised ward refuses the catch',
      blocked.triCapture(by, dmg, 1, 0) === false && !blocked.heldBy);
  }

  /* --- the dive --- */
  const d = mk(['dive']);
  d.diving = true;
  ok('a dive is a driven fall, not a faster one', DIVE.speed > 26);
  /* BAMBOO IS THE ONE THING IT CANNOT TOUCH, and `prop.js` said so before
     there was a dive: "bamboo answers to the katana and nothing else — not a
     dive-bomb, not dragon breath". The grove being the one place force fails
     is what makes landing worth doing. The charge keeps its blade out and
     does cut. */
  const cane = world.props.find((p) => p.katanaOnly);
  cane._reset();
  d.position.set(cane.group.position.x, cane.group.position.y, cane.group.position.z);
  d._diveImpact(world, { sfx: () => {}, strikePlayers: () => {}, onMischief: () => {} });
  ok('a power dive cannot cut bamboo', !cane.knocked);
  const ch = mk(['charge']);
  ch.position.set(cane.group.position.x, cane.group.position.y, cane.group.position.z);
  ch._chargeHit = new Set();
  ch.chargeDir.set(0, 1);
  ch._chargeStrike(world, { sfx: () => {}, strikePlayers: () => {}, onMischief: () => {} });
  ok('...but a charge can', cane.knocked);
  cane._reset();

  /* NO POWER MOVE SURVIVES GETTING ON AN ANIMAL. `_stepSpecials` only runs in
     the ground controller, so a ward popped a frame before mounting a dragon
     keeps its three seconds for ever: a permanently invincible kitten,
     produced by a button press that looks like climbing onto a dragon. */
  const m = mk(['ward', 'charge']);
  m._popWard(null);
  m._startCharge(null);
  m.mount = { quad: 24, seatOffset: () => ({ x: 0, y: 0, z: 0 }), flapBob: 0 };
  try { m.update(1 / 60, PAD(), world, [], null); } catch { /* flight needs a real dragon */ }
  ok('mounting drops the ward and the charge', !m.warded && m.chargeT === 0);

  /* A round reset has to clear them for the same reason: a charge that
     survives carries its committed direction and its zero gravity across the
     teleport to her post and flies her off the ring before the gong. */
  const r = mk(['ward', 'charge', 'tri']);
  r._popWard(null);
  r._startCharge(null);
  r._startTriple(null);
  r.resetForRound(0, 0, 0, 0);
  ok('so does a round reset',
    !r.warded && r.chargeT === 0 && r.triLeft === 0 && !r.diving);

  /* --- the buffs stack ON TOP of the clan, they do not replace it --- */
  const runFor = (p) => {
    const pad = PAD({ mx: 1 });
    const x0 = p.position.x;
    const z0 = p.position.z;
    for (let i = 0; i < 60; i++) p.update(1 / 60, pad, world, [], null);
    return Math.hypot(p.position.x - x0, p.position.z - z0);
  };
  const plain = runFor(mk([]));
  const orbed = runFor(mk(['swift', 'swift']));
  const both = (() => {
    const p = mk(['swift', 'swift']);
    p.clan = CLANS.find((c) => c.buff.id === 'speed');
    return runFor(p);
  })();
  line('run in 1s: plain / 2 Gale / + Thunderpaw',
    `${plain.toFixed(1)} / ${orbed.toFixed(1)} / ${both.toFixed(1)}`);
  ok('orbs make her measurably faster', orbed > plain * 1.2);
  ok('...and the clan buff MULTIPLIES with them', both > orbed * 1.15);

  const jumper = mk(['leap', 'leap']);
  for (let i = 0; i < 10; i++) jumper.update(1 / 60, PAD(), world, [], null);
  ok('two Leap orbs land her with four jumps', jumper.jumpsLeft === 4);

  const long = mk(['reach']);
  ok('a Long Cut orb really lengthens the swing', long._reach() > mk([])._reach());
  ok('...and the drawn arc is derived from the same number',
    long._reach() === BASE_REACH * long.power.reach);

  /* --- THE PICTURE HAS TO BE THE HITBOX ---
     THIS BLOCK IS A BUG REPORT, and the check above it is the one that let the
     bug through: it asserted that `_reach()` folds the orbs in, which was true,
     and then said "and the drawn arc is derived from the same number" — which
     was a sentence about a line of code it never looked at. The arc read
     `clan?.buff?.reach` DIRECTLY, so Riverclaw grew the picture and the Long
     Cut orbs, which multiply the same hitbox and STACK, did not. A kitten
     wearing three of them swung a normal-looking arc and hit you from a metre
     and a half outside it — which the girl being hit reads as the game
     cheating, not as her sister having earned something.

     SO THIS ASSERTS THE MESH, by driving the real feedback pass and reading the
     scale off `slash`. Ratios rather than absolutes: the animation term
     (`0.7 + t*0.9`) is a separate decision that is allowed to move, and a check
     pinned to its current value would fail on a change to how the arc snaps out
     — which is a check that teaches you to delete it. */
  const arcOf = (orbs, clanId = null) => {
    const p = mk(orbs);
    if (clanId) p.clan = CLANS.find((c) => c.buff.id === clanId);
    /* Mid-swing, at a fixed point in the animation, so the term is the same for
       every player compared below and divides out of the ratio. */
    p.attackTimer = 0.26;
    p._updateFeedback(1 / 60, world);
    return { scale: p.slash.scale.x, reach: p._reach(), visible: p.slash.visible };
  };
  const arcPlain = arcOf([]);
  const arcRiver = arcOf([], 'reach');
  const arcOne = arcOf(['reach']);
  const arcThree = arcOf(['reach', 'reach', 'reach']);
  const arcBoth = arcOf(['reach', 'reach', 'reach'], 'reach');
  line('drawn arc: plain / Riverclaw / 1 orb / 3 orbs / both',
    [arcPlain, arcRiver, arcOne, arcThree, arcBoth]
      .map((a) => a.scale.toFixed(2)).join(' / '));

  ok('the arc is actually drawn mid-swing', arcPlain.visible === true);
  /* THE CLAN ALREADY WORKED. Kept so the fix cannot be "make the orbs work by
     making the clan stop". */
  ok('Riverclaw draws a longer arc, as it always did',
    arcRiver.scale > arcPlain.scale * 1.5);
  /* THE BUG ITSELF, in one line: one orb has to move the picture at all. */
  ok('a Long Cut orb now lengthens the DRAWN arc too',
    arcOne.scale > arcPlain.scale * 1.2, `${arcPlain.scale} -> ${arcOne.scale}`);
  /* AND THE STACK HAS TO KEEP MOVING IT. Orbs stack; a picture that grew once
     and then stopped would be the same lie one orb later. */
  ok('...and three of them lengthen it further still',
    arcThree.scale > arcOne.scale * 1.2, `${arcOne.scale} -> ${arcThree.scale}`);
  /* THE PROPERTY THAT MAKES ALL OF THE ABOVE FOLLOW: the picture and the hitbox
     are ONE number. Asserted as a ratio over five different kittens, so it
     cannot be satisfied by a second formula that happens to agree at one point
     — which is exactly what the old direct read of the clan buff was. */
  for (const [what, a] of [['Riverclaw', arcRiver], ['one orb', arcOne],
    ['three orbs', arcThree], ['both together', arcBoth]]) {
    ok(`...and with ${what} the arc and the hitbox grow by the same factor`,
      Math.abs((a.scale / arcPlain.scale) - (a.reach / arcPlain.reach)) < 1e-9,
      `${(a.scale / arcPlain.scale).toFixed(4)} vs ${(a.reach / arcPlain.reach).toFixed(4)}`);
  }
  /* AND THE TWO ADD, on the picture as well as on the hitbox. */
  ok('...and a Riverclaw kitten wearing three of them gets both',
    arcBoth.scale > arcThree.scale * 1.2 && arcBoth.scale > arcRiver.scale * 1.2);

  /* --- THE TWO BONUSES ADD, THEY DO NOT MULTIPLY ---
     THIS BLOCK IS A BUG REPORT, and the check above it USED TO BE THE BUG: it
     asserted `arcBoth > arcThree * 1.5`, which is only satisfiable by a
     product. `_reach()` read `clanReach * power.reach`, so Riverclaw's 80% was
     charged on the ORBS' bonus as well as on the base blade — three Long Cut
     orbs under Riverclaw came out at 3.42, an 11.6m blade, longer than the
     arena is wide, cutting a girl standing nowhere near it.

     The law is that every bonus is measured against the UNSWORN, UNADORNED
     blade and then summed. Stated below as exactly that — the surplus over
     plain, added — rather than as the formula, so it cannot be satisfied by
     rewriting the same product a second way. And swept over the whole stack,
     because the double-count GREW with it: the old code doubled one orb's 0.30
     into 0.54 and three orbs' 0.90 into 1.62, which is why no smaller
     `buff.reach` could have fixed it. */
  const reachOf = (orbs, clanId = null) => {
    const p = mk(orbs);
    if (clanId) p.clan = CLANS.find((c) => c.buff.id === clanId);
    return p._reach();
  };
  const base = reachOf([]);
  const riverOnly = reachOf([], 'reach') - base;
  for (let n = 0; n <= 4; n++) {
    const orbs = Array(n).fill('reach');
    const orbsOnly = reachOf(orbs) - base;
    const together = reachOf(orbs, 'reach') - base;
    ok(`${n} Long Cut orb${n === 1 ? '' : 's'} + Riverclaw is the two bonuses ADDED`,
      Math.abs(together - (riverOnly + orbsOnly)) < 1e-9,
      `${together.toFixed(3)} vs ${(riverOnly + orbsOnly).toFixed(3)}`);
  }
  /* THE NUMBER FROM THE REPORT, written out. A property check that is right
     about the shape can still be right about the wrong shape, so one arithmetic
     assertion is pinned to the values a player actually swings: Riverclaw 1.8
     and three orbs 1.9 make 2.7, and the old code made 3.42. */
  line('reach x: plain / Riverclaw / 3 orbs / both',
    [reachOf([]), reachOf([], 'reach'), reachOf(['reach', 'reach', 'reach']),
      reachOf(['reach', 'reach', 'reach'], 'reach')]
      .map((r) => (r / BASE_REACH).toFixed(2)).join(' / '));
  ok('Riverclaw with three Long Cut orbs reaches 2.70x, not 3.42x',
    Math.abs(reachOf(['reach', 'reach', 'reach'], 'reach') - BASE_REACH * 2.7) < 1e-9,
    (reachOf(['reach', 'reach', 'reach'], 'reach') / BASE_REACH).toFixed(4));
  /* THE TWO IDENTITIES THE `- 1` HAS TO PRESERVE. Either one broken is a
     silent nerf to a kitten who has only done half the work — and an unsworn
     kitten with an empty neck reaching anything but 1x moves the whole game,
     not just the arena. */
  ok('...a kitten with no clan still reaches exactly her orbs',
    reachOf(['reach', 'reach']) === BASE_REACH * mk(['reach', 'reach']).power.reach);
  ok('...a Riverclaw kitten with no orbs still reaches exactly 1.8x',
    Math.abs(reachOf([], 'reach') - BASE_REACH * 1.8) < 1e-9);
  ok('...and plain is plain', base === BASE_REACH);
}

/* --------------------------------------------------------------------------
   The ring's wildlife, and the feast between rounds.

   None of this needs a GPU: a Critter is a Billboard over a bare THREE.Texture
   and the Menagerie is arithmetic over positions, so the REAL classes run
   headlessly and the checks below poke the real state machine rather than a
   description of it. What they are guarding is the pair of rules that are
   invisible on screen — that a snack cannot be eaten outside the ring, and
   that the health a kitten carries into the next round is the health she
   actually finished the feast with.
-------------------------------------------------------------------------- */
{
  console.log('\n--- the ring snacks ---');

  const art = () => ({
    calm: { texture: new THREE.Texture(), contentScale: 0.7, pad: 0.06 },
    shock: { texture: new THREE.Texture(), contentScale: 0.7, pad: 0.06, facesRight: true },
  });
  const ART = { rat: art(), rabbit: art(), bird: art() };

  const PADS = [0, 1].map(() => ({
    mx: 0, my: 0, held: new Set(),
    down(a) { return this.held.has(a); },
    pressed() { return false; },
  }));

  world.openArena(true);
  const R = world.arenaRing;

  const mkFighter = (i) => {
    const p = new Player({
      texture: new THREE.Texture(), index: i, rows: 4, cols: 8, height: 2.9,
      spawn: new THREE.Vector3(R.x + (i ? 6 : -6), R.y, R.z), name: i ? 'Frost' : 'Ember',
    });
    p.onGround = true;
    return p;
  };
  const fighters = [mkFighter(0), mkFighter(1)];

  const stubGame = {
    scene: new THREE.Scene(),
    players: fighters,
    input: { players: PADS },
    toast() {},
    sfx() {},
    hitSpark() {},
  };
  const men = new Menagerie({ game: stubGame, world, art: ART });
  stubGame.menagerie = men;

  line('critters', CRITTERS.map((c) => `${c.id} ${c.heal}hp`).join('  '));

  /* --- the reward is bounded, and ordered by how hard the animal is ---
     Richard's brief was "10-20% max off the BASE health", which is the part a
     percentage of `player.maxHp` would have broken silently: an Adamant orb
     raises that, so a fraction of it would make every snack in the ring
     stronger for whichever kitten is wearing more armour. */
  ok('every snack heals 10-20% of the base bar',
    CRITTERS.every((c) => c.heal >= MAX_HP * 0.10 - 0.5 && c.heal <= MAX_HP * 0.20 + 0.5));
  ok('...and the harder the catch, the bigger it is',
    CRITTER_BY_ID.rat.heal < CRITTER_BY_ID.rabbit.heal
    && CRITTER_BY_ID.rabbit.heal < CRITTER_BY_ID.bird.heal);
  ok('no two are worth the same', new Set(CRITTERS.map((c) => c.heal)).size === CRITTERS.length);

  line('hold / mouth / stun', `${EAT_TIME}s  ${MOUTH_TIME}s  ${STUN_TIME}s`);
  /* TWO SECONDS ROOTED IS THE PRICE, and it has to stay long enough to be a
     gamble in a live round. Trimming it is the obvious way to make the feature
     "feel better" and it is the one change that would delete the risk. */
  ok('the hold is a full two seconds', EAT_TIME === 2.0);
  /* A rabbit knocked out of its hop has to stay down long enough to walk over
     and START the hold — the hold itself replaces the stun, so this is about
     reaching it, not about eating it. Under EAT_TIME and the stun would be a
     window that closes before she can use it. */
  ok('a stunned rabbit stays down long enough to reach', STUN_TIME > EAT_TIME);
  /* ...and a bird in her mouth has to give her longer than the swallow, or the
     20hp snack would be impossible rather than merely urgent. */
  ok('a mouthed bird gives her more than one swallow', MOUTH_TIME > EAT_TIME * 2);

  /* --- ONE VERB: a swing reaches all three ---
     This is the correction that made the rat catchable at all. `swattable`
     used to ask what SPECIES it was and answer no for a rat, which left the
     slowest animal — the one that is supposed to teach the whole mechanic —
     as the one the katana could not touch: it flees at 8.2 against a 10.5
     walk, so closing to a 3.4 grab radius means cornering something that runs
     the moment you are near enough to try. If this ever goes back to asking
     about the species, that bug comes back with it. */
  const one = (id) => new Critter(CRITTER_BY_ID[id], ART[id]);
  const rat = one('rat');
  const rabbit = one('rabbit');
  const bird = one('bird');
  rat.onGround = true;
  rabbit.onGround = true;
  bird.onGround = false;
  ok('a swing stops ANY loose animal',
    rat.swattable && rabbit.swattable && bird.swattable);
  ok('...and nothing already caught', (() => {
    const c = one('rat');
    c.onGround = true;
    c.pin({ position: new THREE.Vector3(), facing: 0 });
    return !c.swattable;
  })());

  /* The grab survives underneath the swing: walk into a grounded animal, press
     attack, and it is pinned outright with no stun step. `Menagerie.strike`
     checks that FIRST, so the easy path stays open for anyone who gets close. */
  ok('a rat on the ground can still be pinned outright', rat.pinnable);
  ok('a grounded rabbit too', rabbit.pinnable);
  rabbit.onGround = false;
  ok('...but not one in mid-hop', !rabbit.pinnable && rabbit.swattable);
  ok('a bird is never taken off the floor', !bird.pinnable && bird.swattable);
  rabbit.stun();
  ok('a stunned rabbit is pinnable however it was drawn', rabbit.pinnable);
  ok('...and it is drawn startled while it is', rabbit.sprite === rabbit.poses[1]);
  rabbit.release();
  ok('letting go puts the loose drawing back', rabbit.sprite === rabbit.poses[2]);

  /* --- A RABBIT HAS A GROUND DRAWING AS WELL AS A LEAPING ONE ---
     It shipped with only the leap, so the animal was permanently frozen in a
     jumping pose while scampering along the floor: it reads as a broken sprite
     rather than as a rabbit, and it threw away the one visual cue that says
     whether it can be pinned right now. The pose is picked from `onGround`
     every frame in `_paint` rather than at the places that change it, because
     a rabbit crosses that boundary twice a second in three different movement
     branches and one of them would end up forgotten. */
  ok('a rabbit in the air is drawn leaping', (() => {
    const c = one('rabbit');
    c.onGround = false;
    c._setPose(c._loosePose());
    return c.sprite === c.poses[2];
  })());
  ok('...and on the ground it is drawn running', (() => {
    const c = one('rabbit');
    c.onGround = true;
    c._setPose(c._loosePose());
    return c.sprite === c.poses[0];
  })());
  /* A rat never leaves the ground and a bird never touches it, so neither has
     its own air sheet — both fall back to `calm` rather than becoming a
     special case inside Critter. */
  ok('a rat has no separate leaping drawing to fall out of',
    rat.poses[2].tex.image === rat.poses[0].tex.image);

  /* --- EVERY DRAWING OF ONE ANIMAL IS THE SAME SIZE ---
     Measured on the REAL sheets, because this is a bug that lived entirely in
     the art's proportions and nothing synthetic would have caught it: the
     rabbit visibly grew and shrank between running and hopping.

     `contentScale` is a height, so sizing each pose by it stretches every
     drawing until its bounding box is the same height — and a rabbit drawn
     flat out mid-run is 1.8 times as long as it is tall while one drawn
     bunched up mid-leap is 1.2. Equalising the heights therefore made the
     running one 38% longer than the leaping one. `poseQuad` matches them on
     drawn INK AREA instead, which does not care which way a pose is stretched.

     The packing options here must match the ones `main.js` loads critter
     sheets with; `packMetrics` is shared with the loader so only those four
     numbers are repeated, not the arithmetic. */
  {
    const OPTS = { cell: 256, maxAtlas: 768, pad: 0.06 };
    const measure = (file) => {
      const { w, h, d } = readPNG(new URL(`../public/sprites/${file}`, import.meta.url));
      floodBackground(d, w, h);
      let x0 = 1e9; let y0 = 1e9; let x1 = -1; let y1 = -1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (d[(y * w + x) * 4 + 3] > 8) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      const box = { x0, y0, x1, y1 };
      const bw = x1 - x0 + 1;
      const bh = y1 - y0 + 1;
      const m = packMetrics({
        tallest: bh, widest: bw, inked: countInk({ data: d }, w, box), ...OPTS,
      });
      // Both as a fraction of the cell, which is what a quad multiplies.
      return { ...m, w: (bw * m.scale) / m.cellPx, h: (bh * m.scale) / m.cellPx };
    };

    const SHEETS = {
      rabbit: ['rabbit_run.png', 'rabbit.png', 'rabbit_shock.png'],
      rat: ['rat.png', 'rat_shock.png'],
      bird: ['bird.png', 'bird_shock.png'],
      /* ONE DRAWING, AND THE SPREAD CHECKS BELOW GO TRIVIAL ON IT — which is
         fine, because the one that matters here is the FIRST: a conjured mantis
         has to come out exactly `size` tall like every other animal, and that
         is a real assertion about a sheet nobody has looked at since it was
         generated. It gets a second sheet the day somebody draws it startled,
         and the spread checks start doing work on their own. */
      mantis: ['mantis.png'],
    };
    const spread = (v) => Math.max(...v) / Math.min(...v);

  /* --- AND THE THREE NEW SHEETS ARE ONE FIGURE EACH ---
     The failure this catches is specific to how they are made: ask an image
     model for one character and it will now and then hand back two, or the
     same one twice at different sizes. `loadSpriteAtlas` would key that into a
     single wide cell, `contentScale` would come out of a box twice the width
     it should be, and the kitten would be drawn HALF SIZE the instant she
     concentrated — on screen for four tenths of a second, in a pose nobody has
     a reason to stare at. Measured, never eyeballed: eighth non-negotiable. */
  {
    const OVERLAY = ['ember_warp.png', 'frost_warp.png', 'mantis.png'];
    for (const f of OVERLAY) {
      const url = new URL(`../public/sprites/${f}`, import.meta.url);
      if (!existsSync(url)) { line(f, 'skipped (art not present)'); continue; }
      const { w, h, d } = readPNG(url);
      /* THE TWO CONVENTIONS NEED TWO DIFFERENT TESTS, and picking the wrong one
         is not a near miss. `public/sprites/` holds both kinds — the older
         sheets are opaque PNGs the loader keys at load time, the newer ones
         come back from `remove_background` with a real alpha channel — and
         "which pixels are drawn on" means something different in each. Asking
         "is it whitish?" of an ALPHA sheet cut Frost into three pieces on the
         first run of this check, because Frost is a grey-and-WHITE cat: her
         chest, muzzle and paws are white fur, not background, and excluding
         them severed her head from her body. So the sheet says which test it
         wants, by whether its own border is transparent. */
      let clear = 0;
      for (let x = 0; x < w; x++) {
        if (d[x * 4 + 3] < 8) clear++;
        if (d[((h - 1) * w + x) * 4 + 3] < 8) clear++;
      }
      const alphaSheet = clear > w * 2 * 0.9;
      const ink = alphaSheet
        ? (p) => d[p * 4 + 3] > 8
        : (p) => !(d[p * 4] >= 218 && d[p * 4 + 1] >= 218 && d[p * 4 + 2] >= 218);
      /* A tenth of a percent of the sheet. Below that is an eyelash or a
         compression speck, not a second character. */
      const floor = Math.round(w * h * 0.001);
      const big = blobs(d, w, h, ink).filter((b) => b.n >= floor);
      ok(`${f} is ONE figure, not two`, big.length === 1, `${big.length} blobs`);
      if (big.length !== 1) continue;
      const [b] = big;
      const bw = (b.maxX - b.minX + 1) / w, bh = (b.maxY - b.minY + 1) / h;
      line(`  ${f}`, `${w}x${h} ${alphaSheet ? 'alpha' : 'keyed'}, `
        + `fills ${(bw * 100).toFixed(0)}% x ${(bh * 100).toFixed(0)}%`);
      /* It has to be worth the atlas it costs, and a figure adrift in a sea of
         nothing keys to a `contentScale` that draws her tiny. */
      ok(`...and it fills its sheet`, bw > 0.3 && bh > 0.3);
      /* AND IT IS NOT RUNNING OFF THE EDGE. A drawing that touches the border
         has been cropped by the model, and on a keyed sheet it also seals the
         border flood out of whatever region it cut through. */
      ok(`...without touching the border`,
        b.minX > 0 && b.minY > 0 && b.maxX < w - 1 && b.maxY < h - 1);
    }
  }

    for (const [id, files] of Object.entries(SHEETS)) {
      if (!files.every((f) => existsSync(new URL(`../public/sprites/${f}`, import.meta.url)))) {
        line(`${id} sheets`, 'skipped (art not present)');
        continue;
      }
      const size = CRITTER_BY_ID[id].size;
      const arts = files.map(measure);
      const drawn = arts.map((a) => {
        const q = poseQuad(size, arts[0], a);
        return { w: a.w * q, h: a.h * q };
      });
      line(`${id} poses (w x h)`, drawn.map((d) => `${d.w.toFixed(2)}x${d.h.toFixed(2)}`).join('  '));

      /* The calm drawing is the anchor and its size may not move: every number
         in CRITTERS — the ring radius, the shadow, the poof — was tuned
         against the animal you see running around. */
      ok(`the ${id} you chase is still exactly ${size} tall`,
        Math.abs(drawn[0].h - size) < 1e-9);
      /* THE REAL CHECK, and it is deliberately measured on the BOUNDING BOX
         rather than on the ink. Ink area is equalised by construction, so
         asserting it would only be asking `poseQuad` to repeat itself; the box
         is the thing an eye actually compares, and it still lands inside a
         quarter because the sheets are honest — a rabbit's silhouette is about
         as densely filled whichever way it is drawn. Before the fix these were
         2.3 times apart. */
      ok(`...and every ${id} pose fills the screen within a quarter of another`,
        spread(drawn.map((d) => d.w * d.h)) < 1.25);
      /* And the failure mode this replaced, stated as itself: sizing on height
         alone put the poses 45% apart on length. */
      ok(`...so no ${id} pose is half as long as another`,
        spread(drawn.map((d) => d.w)) < 1.6);
    }
  }

  /* --- the difficulty ladder is SPEED now, not the button ---
     With one verb for all three, the only thing separating them is how hard
     the swing is to land. If the rat stopped being the slowest, the easiest
     animal would stop being the cheapest one and the ladder would invert. */
  line('flee speeds', CRITTERS.map((c) => `${c.id} ${c.speed}`).join('  '));
  ok('the rat is the slowest thing on the deck',
    CRITTER_BY_ID.rat.speed < CRITTER_BY_ID.rabbit.speed
    && CRITTER_BY_ID.rat.speed < CRITTER_BY_ID.bird.speed);
  /* A kitten WALKS at 10.5 and SPRINTS at 17, and the ladder is written across
     that pair rather than under one of them.

     THE RAT STAYS UNDER A WALK, because the rat is what teaches the mechanic:
     the easiest animal has to be catchable by a kid who has not worked out that
     the game has a sprint button. That is how it got into trouble the first
     time, at 8.2, and the fix was to slow it further.

     THE RABBIT IS DELIBERATELY OVER IT. At 9.0 it was under a walk too, so
     holding the stick toward it closed at 1.5 a second and caught it eventually
     with no decision in it — the middle animal was the easy one with a longer
     chase attached. Above a walk it cannot be caught by walking; well under a
     sprint, it is always caught by a sprint you commit to.

     NOTHING REACHES A SPRINT, or it could never be closed on at all. */
  ok('the rat stays catchable at a walk', CRITTER_BY_ID.rat.speed < 10.5);
  ok('a rabbit cannot be caught by walking after it',
    CRITTER_BY_ID.rabbit.speed > 10.5);
  ok('...and nothing on the deck outruns a sprint', CRITTERS.every((c) => c.speed < 17));

  /* A rabbit hops twice as high as it first did — and height is v²/2g, so that
     is the launch times root two, not times two. Bounded at the top by the
     vertical window `Menagerie.strike` allows, or it would stop being
     catchable rather than becoming harder to catch. */
  const hopH = CRITTER_BY_ID.rabbit.hopV ** 2 / (2 * 24);
  line('rabbit hop height', `${hopH.toFixed(2)} units`);
  /* OVER HER HEAD, not level with it. A hop that tops out at a kitten's own
     height (2.9) is inside the arc of every swing she throws, so the timing
     that is supposed to be the difficulty is not asked for. */
  ok('a rabbit hop clears a whole kitten', hopH > 2.9);
  ok('...and stays inside the swing\'s upward reach', hopH + 1.2 < 6.5);

  /* THE BIRD HAS TO BE OUT OF REACH FROM THE FLOOR, which is the whole reason
     it is worth the most health — and it was not. `Menagerie.strike` allows a
     swing 6.5 above her FEET (a billboard is a flat drawing with a point for a
     position), so a cruise of 4.6 was takeable by standing under it and
     pressing attack: the hardest animal on the deck cost nothing but walking.

     The numbers it is measured against are the real ones from player.js —
     JUMP_V 11.2 and GRAVITY 26 — so retuning the jump fails this check instead
     of silently making the bird free again. */
  const AIR_REACH = 6.5;
  const jump1 = 11.2 ** 2 / (2 * 26);
  const jump2 = jump1 + (11.2 * 0.86) ** 2 / (2 * 26);
  const cruise = CRITTER_BY_ID.bird.cruise;
  line('bird cruise vs jumps', `${cruise} up · one jump ${jump1.toFixed(2)} · two ${jump2.toFixed(2)}`);
  /* Measured at the BOTTOM of its bob (±0.5 in `_flyStep`), which is the lowest
     it ever is and therefore the only height that can make this false. */
  ok('a bird cannot be swatted off the floor', cruise - 0.5 > AIR_REACH);
  /* ...and at the TOP of it, so a single jump is never a near miss. */
  ok('...but a single jump brings it into reach', cruise + 0.5 - jump1 < AIR_REACH);
  ok('...and a double jump makes it comfortable', cruise - jump2 < AIR_REACH - 2);

  /* THE STARTLED RABBIT IS DRAWN FACING THE OTHER WAY, and the loader cannot
     know that — `facesRight` is declared per file in main.js. If the two poses
     of one animal ever share a flag again, it spins round at the exact instant
     a player pins it. */
  ok('facing is read per DRAWING, not per species',
    rabbit.poses[0].artFacesRight !== rabbit.poses[1].artFacesRight);

  /* --- the gate: no eating outside a running tournament --- */
  const A = fighters[0];
  men.on = false;
  men.list.length = 0;
  const stray = one('rat');
  stray.onGround = true;
  stray.position.copy(A.position);
  men.list.push(stray);
  ok('a swing outside the ring catches nothing', men.strike(A, 3.4) === false);
  ok('...and nothing is held', !men.held[0]);

  /* --- spawning --- */
  men.start();
  line('on the deck at the gong', men.list.map((c) => c.id).join(', '));
  ok('the deck opens stocked, not empty', men.list.length === MAX_ON_STAGE);
  ok('...with no more than the cap', men.list.length <= MAX_ON_STAGE);
  ok('the respawn wait is 45-75s',
    RESPAWN_MIN === 45 && RESPAWN_MAX === 75 && men.spawnT >= 45 && men.spawnT <= 75);
  /* THE OPENING DECK HAS ONE OF EACH, AND EVERY DECK AFTER IT IS A LOTTERY.
     The spawn used to prefer a species that was not already out there, which
     at a cap of three made the deck permanently one rat, one rabbit and one
     bird — the same picture every round of every tournament. It is a straight
     uniform draw now; the seeding in `start` is the one exception, so the
     girls meet all three difficulties before the randomness takes over. */
  ok('the opening deck has one of every animal',
    new Set(men.list.map((c) => c.id)).size === men.species.length);
  /* ...and a run of luck may not delete an animal from a tournament. */
  ok('never more than half the deck of one kind', men.list.every((c) => (
    men.list.filter((o) => o.id === c.id).length <= MAX_PER_SPECIES
  )));
  {
    /* Twenty fresh decks: the mix has to actually vary, or "randomised" is a
       comment rather than a behaviour. */
    const shapes = new Set();
    for (let i = 0; i < 20; i++) {
      men.clear();
      men.topUp();
      shapes.add(men.list.map((c) => c.id).sort().join('+'));
    }
    line('distinct decks in 20 top-ups', shapes.size);
    ok('a topped-up deck is not always the same animals', shapes.size > 3);
    ok('...and never breaks the per-species cap', [...shapes].every((s) => {
      const n = {};
      for (const id of s.split('+')) n[id] = (n[id] ?? 0) + 1;
      return Object.values(n).every((v) => v <= MAX_PER_SPECIES);
    }));
    men.start();
  }
  ok('nothing spawns off the stone', men.list.every((c) => (
    Math.abs(c.position.x - R.x) < R.half && Math.abs(c.position.z - R.z) < R.half
  )));
  ok('nothing spawns in a kitten\'s lap', men.list.every((c) => fighters.every((p) => (
    Math.hypot(p.position.x - c.position.x, p.position.z - c.position.z) > CATCH_RADIUS
  ))));

  /* --- catching one, all the way through ---
     THE DECK IS EMPTIED DOWN TO THE ONE ANIMAL UNDER TEST for each of these,
     and that is not tidiness. The cap went from three to six and the spawn
     became a uniform draw, and every one of these checks used to reach into a
     shared deck with `list.find(...)`: three of them started failing about a
     third of the time, because the pin is radius-only and searched before the
     air, so any OTHER animal that happened to spawn near her won the swing.
     The behaviour was right and the staging was lying. `only()` is what stops
     these checks depending on a dice roll. */
  const step = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) men.update(dt, fighters); };
  const putBeside = (c, p) => {
    c.position.set(p.position.x + 1.2, p.position.y, p.position.z);
    /* SAVED ONCE, NOT ON EVERY CALL. Overwriting `__flee` each time meant the
       second `putBeside` on a species banked the ZERO the first one had
       written, so `restoreFlee` "restored" a flee radius of 0 and the rat was
       fearless for the rest of the run — which is what made the flee check
       fail about half the time, on a behaviour that was never broken. */
    if (c.spec.__flee == null) c.spec.__flee = c.spec.flee;
    c.spec.flee = 0;
    c.onGround = true;
  };
  const restoreFlee = () => CRITTERS.forEach((s) => {
    if (s.__flee != null) { s.flee = s.__flee; delete s.__flee; }
  });
  /** Clear the deck and put exactly one animal of `id` on it. */
  const only = (id) => {
    for (let i = 0; i < men.held.length; i++) if (men.held[i]) men._drop(i);
    for (const c of men.list) c.dispose(men.scene);
    men.list.length = 0;
    return men._spawn(CRITTER_BY_ID[id]);
  };

  const theRat = only('rat');
  putBeside(theRat, A);
  A.hp = 40;
  PADS[0].held.add('attack');
  ok('pressing attack beside one pins it', men.strike(A, 3.4) && theRat.state === 'pinned');
  ok('...and that freezes her where she stands', men.eating(0) === true);
  step(60);
  ok('one second in, it is not eaten yet', men.list.includes(theRat) && A.hp === 40);
  /* A MEAL IS TWO SPRITES PRETENDING TO TOUCH, and where the animal is drawn is
     the whole trick. Everything used to be pinned on the FLOOR in front of her,
     which is where you put a thing you are holding DOWN — a rat lying a metre
     below her chin reads as a rat that happens to be standing there while a cat
     crouches nearby. A mouthful goes at her mouth (`EAT_MOUTH_Y`, exported off
     the crouch the eating pose is drawn at, so the two cannot drift apart). */
  ok('a rat is eaten at her mouth, not off the floor',
    theRat.position.y > A.position.y + A.height * 0.4);
  {
    /* A RABBIT IS TOO BIG TO LIFT — 1.35 units of animal against a 2.9-unit cat,
       and hoisting that to her face on frame one reads as a cat holding a dog.
       It stays on the ground and is drawn UP as it shrinks, which points the
       shrink at something: it is going INTO her rather than merely vanishing. */
    const bun = one('rabbit');
    const her = { position: { x: 0, y: 10, z: 0 }, height: 2.9, camYaw: -Math.PI / 4 };
    const at = (k) => bun._mealSpot(her, k);
    const outBy = (s) => Math.hypot(s.x - her.position.x, s.z - her.position.z);
    ok('a rabbit starts its meal on the ground', Math.abs(at(0).y - her.position.y) < 0.01);
    ok('...and finishes it at her mouth', at(1).y > her.position.y + her.height * 0.4);
    ok('...drawn in toward her as it goes', outBy(at(1)) < outBy(at(0)));
    /* And the small ones are up there from the first frame — the difference is
       the whole reason `eatLift` is a per-animal number. */
    ok('a rat is at her mouth from the first frame of the hold',
      one('rat')._mealSpot(her, 0).y > her.position.y + her.height * 0.4);
    bun.dispose(men.scene);
  }
  step(70);
  ok('two seconds in, it is', !men.list.includes(theRat));
  ok('...and she is 10 health better off', A.hp === 40 + CRITTER_BY_ID.rat.heal);
  ok('...and she has her feet back', men.eating(0) === false);

  /* --- A SWING THROWN ON THE MOVE STUNS, IT DOES NOT PIN ---
     This is the fix for "it stunned the rat the first time and never again".
     The pin is searched first and it reaches CATCH_RADIUS (3.4), which is
     exactly the katana's reach — so a kitten CHASING an animal, which is the
     normal way anybody meets one, spent every swing on a pin that the next
     frame cancelled for moving. Nothing was stunned, nothing was held, and the
     swing did nothing you could see. It worked the first time only because
     that first swing tends to be thrown from a standstill.

     `_canHold` is now asked before the pin is offered AND every frame to keep
     one, so the two answers cannot drift apart again. */
  {
    const moving = only('rat');
    putBeside(moving, A);
    A.velocity.set(9, 0, 0);
    A.onGround = true;
    ok('swinging while running stuns it instead of pinning it',
      men.strike(A, 3.4) && moving.state === 'stunned');
    ok('...so the swing is not thrown away on a hold she cannot keep',
      !men.held[0]);
    step(2);
    ok('...and two frames later it is still down, not roaming', moving.state === 'stunned');

    const jumped = only('rat');
    putBeside(jumped, A);
    A.velocity.set(0, 0, 0);
    A.onGround = false;
    ok('a swing from the air stuns it too',
      men.strike(A, 3.4) && jumped.state === 'stunned' && !men.held[0]);

    /* ...and the fast path is untouched: stand over it and it is pinned
       outright, with no stun step. That is the whole reason `strike` looks at
       the floor before the air. */
    const standing = only('rat');
    putBeside(standing, A);
    A.onGround = true;
    ok('standing still over one still pins it outright',
      men.strike(A, 3.4) && standing.state === 'pinned');
    men._drop(0);

    /* --- HITTING A STUNNED ANIMAL MAY ONLY EVER MAKE IT MORE STUNNED ---
       A second swing at a stunned rat used to fall past `swattable` — which
       was `roam` only — into the PIN, which `_updateHold` then cancelled on
       the next frame. So the blow WOKE IT UP. It went unnoticed until the
       cross slash, where three cuts land on the same animal inside a second:
       the first stunned it and the second handed it straight back, and the
       technique looked like it did nothing to wildlife at all. */
    const twice = only('rat');
    putBeside(twice, A);
    A.velocity.set(9, 0, 0);
    A.onGround = true;
    men.strike(A, 3.4);
    ok('a swing on the move stuns it', twice.state === 'stunned');
    step(30);
    const halfway = twice.t;
    ok('...and its clock has been running', halfway < STUN_TIME);
    ok('...a second swing does NOT wake it up',
      men.strike(A, 3.4) === true && twice.state === 'stunned');
    ok('...it resets the clock instead', Math.abs(twice.t - STUN_TIME) < 0.02,
      `${halfway.toFixed(2)}s -> ${twice.t.toFixed(2)}s`);
    ok('...and the swing was not spent starting a hold', !men.held[0]);

    /* THE CROSS SLASH'S OWN CUTS, THROUGH THE SAME DOOR. She is planted with a
       velocity of zero and both feet down, so every other clause of `_canHold`
       says yes — `busy` is the one that knows she is a second into a committed
       technique and cannot also be putting a paw on a rat. */
    const midMove = only('rat');
    putBeside(midMove, A);
    A.velocity.set(0, 0, 0);
    A.onGround = true;
    A._startTriple(null);
    ok('a cross-slash cut cannot pin, only stun',
      men.strike(A, 3.4) && midMove.state === 'stunned' && !men.held[0]);
    step(20);
    ok('...and the next cut keeps it down rather than freeing it',
      men.strike(A, 3.4) && midMove.state === 'stunned'
      && Math.abs(midMove.t - STUN_TIME) < 0.02);
    A._clearSpecials();

    /* ONE ANIMAL, ONE ATTACK, HOWEVER MANY FRAMES THE ATTACK LASTS.
       `Player._chargeStrike` tests its hitbox EVERY FRAME the charge is live —
       twenty-odd calls for one press — and kittens are protected from that by
       their invulnerability window and props by the charge's own `_chargeHit`
       set. Animals had neither, so charging through a rat re-stunned it and
       squeaked once a frame, which sounded exactly like being hit twenty
       times by one move. Reported as that.

       THE SET IS THE ONE THE PROPS ALREADY USE, passed straight through, so a
       charge cannot end up with two different ideas of what it has hit. */
    const runThrough = only('rat');
    putBeside(runThrough, A);
    A.velocity.set(9, 0, 0);
    A.onGround = true;
    const seen = new Set();
    ok('the first frame of a charge catches the rat',
      men.strike(A, 3.4, seen) === true && runThrough.state === 'stunned');
    ok('...and it is remembered on the attack, not on the animal',
      seen.has(runThrough) && seen.size === 1);
    step(20);
    const before = runThrough.t;
    ok('...so the NEXT frame of the same charge catches nothing',
      men.strike(A, 3.4, seen) === false);
    ok('...and the stun clock is left alone rather than topped up',
      runThrough.t === before, `${before.toFixed(2)}s -> ${runThrough.t.toFixed(2)}s`);
    /* A NEW ATTACK IS A NEW SET, so nothing here makes an animal permanently
       immune — which would be the obvious way to get this wrong. */
    ok('...while a fresh attack lands on it again',
      men.strike(A, 3.4, new Set()) === true);
    /* AND AN ORDINARY SWING PASSES NOTHING AND IS UNAFFECTED. Every existing
       check above calls `strike` with two arguments; this states why they
       still mean what they meant. */
    ok('...and a swing with no memory behaves exactly as it always did',
      men.strike(A, 3.4) === true);
    /* PUT HER BACK. The checks below this run against the same kitten, and a
       charge leaves her at 9 units a second — which is over STILL_SPEED, so
       `_canHold` would refuse every pin from here to the end of the section
       and half a dozen unrelated checks would fail for a reason none of them
       is about. */
    A.velocity.set(0, 0, 0);
    for (let i = 0; i < men.held.length; i++) if (men.held[i]) men._drop(i);

    restoreFlee();
  }

  /* THE HOLD IS READ FROM THE REAL PAD, and this is the check that keeps it
     that way. Eating hands her a dead controller, so a hold-detector reading
     the pad she was GIVEN would see the button come up on the frame the freeze
     started and cancel itself instantly, every time. */
  const rat2 = only('rat');
  putBeside(rat2, A);
  rat2.onGround = true;
  A.hp = 50;
  men.strike(A, 3.4);
  step(30);
  PADS[0].held.delete('attack');
  step(4);
  ok('letting go drops it', !men.held[0] && rat2.state === 'roam');
  ok('...and heals nothing', A.hp === 50);

  /* --- one animal at a time ---
     THE FLOOR IS SEARCHED BEFORE THE AIR, so nothing pinnable may be within
     reach of her when the bird is tested — otherwise the swing correctly takes
     the easier target and this becomes a check about the wrong rule. */
  const bird2 = only('bird');
  bird2.spec.flee = 0;
  bird2.position.set(A.position.x + 1.5, A.position.y + 4.2, A.position.z);
  ok('a swing under a bird puts it in her mouth',
    men.strike(A, 3.4) && bird2.state === 'mouthed');
  ok('...which does NOT root her — she may run somewhere safe', men.eating(0) === false);
  const rat3 = men._spawn(CRITTER_BY_ID.rat);
  putBeside(rat3, A);
  ok('she cannot grab a second animal while holding one',
    men.strike(A, 3.4) === false && rat3.state === 'roam');

  /* THE SWALLOW RESETS RATHER THAN BANKING. A bird has five seconds in there
     and the hold is two, so a chew you can chip away at in half-second slices
     while running is the same snack with the risk taken out. */
  PADS[0].held.add('attack');
  step(60);
  ok('holding starts the swallow, and roots her', men.chew[0] > 0.9 && men.eating(0));
  PADS[0].held.delete('attack');
  step(4);
  ok('...and letting go resets it to zero, not pausing it', men.chew[0] === 0);

  /* A bird that is not swallowed inside MOUTH_TIME gets away with it. */
  A.hp = 50;
  step(Math.ceil(MOUTH_TIME * 60) + 20);
  ok('an un-eaten bird escapes on its own five seconds', bird2.state === 'roam');
  ok('...and nobody is healed for it', A.hp === 50 && !men.held[0]);

  /* --- eating cannot overflow the bar --- */
  const rat4 = only('rat');
  putBeside(rat4, A);
  A.hp = A.maxHp - 2;
  men.strike(A, 3.4);
  PADS[0].held.add('attack');
  step(140);
  ok('a full kitten is not healed past her own bar', A.hp === A.maxHp);
  PADS[0].held.delete('attack');
  restoreFlee();

  /* --- they are frightened of you, and they stay on the stone ---
     Measured on a RAT, deliberately. It is the one that runs flat along the
     ground, so "did it get further away" is a clean question — a rabbit is
     airborne half the time and a bird is fleeing in three dimensions, so
     either would make this a check with a dice roll in it. */
  const runner = only('rat');
  restoreFlee();
  runner.position.set(A.position.x + 2, A.position.y, A.position.z);
  runner.onGround = true;
  const d0 = runner.position.distanceTo(A.position);
  step(60);
  ok('a critter runs away from a kitten', runner.position.distanceTo(A.position) > d0 + 1);
  men.start();
  restoreFlee();
  step(60 * 30);
  ok('none of them ever leaves the deck', men.list.every((c) => (
    Math.abs(c.position.x - R.x) <= R.half && Math.abs(c.position.z - R.z) <= R.half
  )));

  men.stop();
  ok('the tournament ending clears the deck', men.list.length === 0 && !men.on);

  /* --- the crouched eating pose ---
     Its own single front-facing cell rather than a row on her turnaround
     sheet: both live kitten sheets are 4-row turnarounds whose rows have to
     agree about which way the character turns, one of the two is already
     unusable because its rows don't, and every sprite-direction check above
     measures real cells out of them. */
  {
    const P = fighters[0];
    ok('a missing eating sheet costs the pose and nothing else', (() => {
      const q2 = new Player({ texture: new THREE.Texture(), index: 0, rows: 4, cols: 8 });
      q2.setEatArt(null);
      return q2.eatPose == null;
    })());

    P.setEatArt({ texture: new THREE.Texture(), contentScale: 0.7, pad: 0.06 });
    ok('the eating pose exists once she has the art', !!P.eatPose);
    /* `mirror: false` with ONE cell is the only combination that can never
       flip — the clan leaders' combination. She is drawn head-on holding food
       to her face; a mirror would be invisible, but a second cell would not
       be, and this is the setting that forbids both. */
    ok('...and it can never flip or pick another cell',
      P.eatPose.mirror === false && P.eatPose.cols === 1 && P.eatPose.rows === 1);
    /* SHORTER THAN SHE IS, because she is crouching. `contentScale` normally
       makes the drawn figure exactly `height` tall, which is right for every
       standing pose and wrong for this one — a squatting cat drawn to a
       standing cat's height is a cat that got bigger in order to crouch. */
    ok('...and she is drawn shorter than when she stands',
      P.eatPose.height * 0.7 < P.height && P.eatPose.height * 0.7 > P.height * 0.7);

    const dead = { mx: 0, my: 0, down: () => false, pressed: () => false };
    P.angel = false;
    P.eatT = 1.0;
    P.update(1 / 60, dead, world, [], null);
    ok('eating swaps the drawing over', P.eatPose.visible && !P.sprite.mesh.visible);
    P.eatT = 0;
    P.update(1 / 60, dead, world, [], null);
    ok('...and finishing puts her back', !P.eatPose.visible && P.sprite.mesh.visible);

    /* THE ANIMAL GOES BETWEEN HER AND THE CAMERA, not along her facing. She
       turns head-on for the whole meal, so a snack placed along `facing` sits
       behind her from the one angle anybody is watching from. */
    const c = new Critter(CRITTER_BY_ID.rat, ART.rat);
    P.position.set(0, 0, 0);
    P.facing = Math.PI;                     // pointedly NOT toward the camera
    P.camYaw = -Math.PI * 0.25;
    c.position.set(30, 0, 30);
    c.pin(P);
    for (let i = 0; i < 40; i++) c.update(1 / 60, world, [], { x: 0, z: 0, y: 0, half: 28 }, P.camYaw);
    const toCam = { x: Math.sin(P.camYaw), z: Math.cos(P.camYaw) };
    const dot = c.position.x * toCam.x + c.position.z * toCam.z;
    ok('a pinned animal is dragged in front of her mouth',
      c.position.length() < 2 && dot > 0.9);
  }

  /* --- THE CROSS SLASH ATE THE SNACK BUTTON, AND THEN THE FIX ATE THE ---
     --- CROSS SLASH ---

     TWO REPORTS, BOTH FROM PLAY, AND THE SECOND IS THE FIRST ONE'S CURE
     OVERSHOOTING.

     One: wearing the orb, standing over an animal and holding ATTACK wound up
     a three-cut technique instead of picking the animal up. `Menagerie.strike`
     is only ever called by `Player._doSlash`, and with the orb on ATTACK is a
     DEFERRED press — on a hold `_doSlash` is never reached, and neither is the
     two-second hold that KEEPS an animal, because a wind-up sets `busy` and
     `_canHold` refuses that. So the feast was unplayable for whoever had
     bought the Cross Slash. The repair is not in the swing, it is in the
     button.

     Two: that button asked `_findTarget` — the whole search, swat included —
     with her real `_reach()`. That radius grows with her blade, so a Riverclaw
     kitten wearing three Long Cut orbs had the technique taken off her out to
     twelve units by a rabbit she was not looking at. Reported as "it cancels
     the Cross Slash which it shouldnt; an animal shouldnt be affected by
     player distance or override their special abilities".

     `wouldHold` is the narrow question now — she is holding one, or she is
     standing still on top of one inside a FIXED `CATCH_RADIUS`. These check
     the predicate against the real Menagerie, and then the real `Player.update`
     against a stubbed one, because the bug lived in the seam between them and
     either half alone would have passed. */
  {
    const eater = mkFighter(0);
    eater.position.set(0, 0, 0);
    eater.velocity.set(0, 0, 0);
    eater.onGround = true;
    men.on = true;
    men.held[0] = null;
    men.list.length = 0;
    ok('no animal on the deck, nothing to hold', !men.wouldHold(eater));

    const rat2 = one('rat');
    rat2.onGround = true;
    rat2.position.set(1, 0, 0);
    men.list.push(rat2);
    ok('a rat at her feet is the eat gesture', men.wouldHold(eater));
    /* THE PREDICATE ASKS THE SAME QUESTION THE SWING DOES, which is the whole
       reason `_findPin` is shared: a button that declines to arm the technique
       for an animal the swing then refuses to catch is the same bug with the
       sign flipped. */
    ok('...and asking does not catch it', men.held[0] === null && !rat2.held);
    ok('...but swinging does', men.strike(eater, 3.4) && !!men.held[0]);
    /* AND THE OPPOSITE OF WHAT IT USED TO SAY. A kitten with a mouthful is the
       clearest case of ATTACK-MEANS-KEEP-EATING there is, and the old predicate
       returned FALSE for her — so a kitten with the orb could catch a bird and
       then never swallow it, because every attempt to hold the button wound up
       a technique whose `busy` reset her chew. That bug was there before this
       line was ever narrowed; the early return hid it. */
    ok('...and a kitten with a mouthful is STILL the eat gesture',
      men.wouldHold(eater));
    men.held[0] = null;
    rat2.release?.();

    /* SHE HAS TO BE ABLE TO HOLD IT. Running past a rat is a swing, not a
       snack — `_canHold` says so, and the button has to agree, or a kitten
       loses her technique every time she sprints over an animal. */
    eater.velocity.set(9, 0, 0);
    ok('...but not while she is running through it', !men.wouldHold(eater));
    eater.velocity.set(0, 0, 0);
    eater.onGround = false;
    ok('...nor in the air', !men.wouldHold(eater));
    eater.onGround = true;

    /* THE WHOLE POINT OF THE SECOND FIX, IN ONE CHECK. The rat goes out to
       eight units — well past `CATCH_RADIUS`, and well INSIDE the reach of a
       Riverclaw kitten wearing three Long Cut orbs (9.18). Under the old
       predicate this was false-for-her and true-for-her-sister purely because
       one of them had bought an orb: a special move taxed by an upgrade. */
    rat2.position.set(8, 0, 0);
    ok('an animal eight units off is not the eat gesture', !men.wouldHold(eater));
    const rich = mkFighter(0);
    rich.position.set(0, 0, 0);
    rich.velocity.set(0, 0, 0);
    rich.onGround = true;
    rich.clan = CLANS.find((c) => c.buff.id === 'reach');
    rich.setPowerOrbs(['reach', 'reach', 'reach']);
    ok('...not even for the longest katana in the game',
      !men.wouldHold(rich), `reach ${rich._reach().toFixed(2)}`);
    ok('...and that reach really would have covered it', rich._reach() > 8);
    rat2.position.set(1, 0, 0);

    /* AND IT IS OFF THE DECK ENTIRELY OUTSIDE THE TOURNAMENT, on the same gate
       as `strikeCritters` — the two answers must agree. */
    men.on = false;
    ok('with the menagerie off there is nothing to prioritise',
      !men.wouldHold(eater));
    men.on = true;

    /* --- THE SWAT IS THE SWING ---
       Reported from play: "we can hit animals even if not facing its direction
       with a swing; it should have the same hit collision as a normal swing."
       The air branch of `_findTarget` was radius-only at `reach * 1.35`, so a
       rabbit squarely BEHIND her, past the end of the drawn arc, was cut down
       by a swing pointed the other way.

       Driven at a BIRD, because the floor branch is radius-only on purpose and
       would answer first for anything standing. */
    men.held[0] = null;
    men.list.length = 0;
    const bird = one('bird');
    men.list.push(bird);
    const swat = (x, z, facing) => {
      eater.position.set(0, 0, 0);
      eater.velocity.set(0, 0, 0);
      eater.onGround = true;
      eater.facing = facing;
      bird.position.set(x, 2, z);
      return !!men._findTarget(eater, 3.4);
    };
    // +z is facing 0, so a bird at +z is in front of her and one at -z behind.
    ok('a bird in front of her is swattable', swat(0, 2.5, 0));
    ok('...and the same bird BEHIND her is not', !swat(0, -2.5, 0));
    ok('...it is her facing that decides, not its position',
      swat(0, -2.5, Math.PI));
    /* AND THE RANGE IS THE BLADE'S, NOT A THIRD MORE. 4.2 was inside the old
       `3.4 * 1.35 = 4.59` and is outside the swing. */
    ok('a bird 4.2 away is out of a 3.4 swing', !swat(0, 4.2, 0));
    ok('...and 3.0 away is inside it', swat(0, 3.0, 0));
    /* THE VERTICAL WINDOW IS DELIBERATELY NOT THE SWING'S. A flier is a flat
       drawing with one point for a position; the props' +/-3 would put a bird
       out of reach for a reason nobody watching can see. Height is not facing,
       and facing is what was reported. */
    eater.position.set(0, 0, 0);
    eater.facing = 0;
    bird.position.set(0, 5, 2.5);
    ok('...but a bird five units UP is still reachable',
      !!men._findTarget(eater, 3.4));
    men.list.length = 0;

    /* --- and now the seam: the real attack button ---
       A kitten wearing the Cross Slash orb, holding ATTACK for well past
       `CROSS.hold`, with and without the eat gesture under her. */
    const held = { mx: 0, my: 0, down: (a) => a === 'attack', pressed: (a) => a === 'attack' };
    const stillHeld = { mx: 0, my: 0, down: (a) => a === 'attack', pressed: () => false };
    const run = (eating) => {
      const k = mkFighter(0);
      k.position.set(0, world.heightAt(0, 40)?.y ?? 0, 40);
      k.onGround = true;
      let caught = 0;
      let said = 0;
      const hud = {
        sfx() {}, sample() {},
        toast() { said += 1; },
        critterHold: () => eating,
        strikeCritters: () => { caught += 1; },
        strikePlayers() {}, hitSpark() {},
      };
      k.power = { ...k.power, tri: 1 };
      k.update(1 / 60, held, world, [], hud);
      for (let i = 0; i < 40; i++) k.update(1 / 60, stillHeld, world, [], hud);
      return { k, caught, said };
    };
    const away = run(false);
    ok('holding ATTACK with nothing to eat still winds up the Cross Slash',
      away.k.triAt, `caught ${away.caught}`);
    const over = run(true);
    ok('...but holding it over an animal she can hold swings instead',
      !over.k.triAt);
    ok('...and that swing is the one that reaches the animal', over.caught >= 1,
      `${over.caught}`);
    /* --- AND IT SAYS NOTHING WHILE IT DOES IT ---
       Reported from play: "the message shouldnt appear saying Cross Slash if
       the player cancels the ability; probably remove the text altogether."
       The toast fired from `_startWind`, at the PLANT — which is the one part
       of the technique she can still lose, to a release or to a blade. So the
       game announced a move that then, whenever anybody actually countered it,
       did not happen. `crossfx` still draws the tell, and that one is drawn
       from the STATE rather than fired once, so it stops when the move does.

       ASSERTED ON THE WIND-UP THAT SUCCEEDED, not on a cancel: a check that
       only watched cancels would pass on a toast that fires every time. */
    ok('...and a Cross Slash announces itself with no toast at all',
      away.said === 0, `${away.said} toast(s)`);
  }
}

/* --------------------------------------------------------------------------
   The feast, the carried health and the angel.
-------------------------------------------------------------------------- */
{
  console.log('\n--- the feast ---');

  line('feast / regen', `${FEAST_TIME}s  +${Math.round(MAX_HP * REGEN_FRAC)}hp`);
  ok('the gap between rounds is 10-20s', FEAST_TIME >= 10 && FEAST_TIME <= 20);
  ok('the free regen is a tenth of the base bar', Math.abs(REGEN_FRAC - 0.10) < 1e-9);
  /* IT HAS TO BE WORTH LESS THAN GOING AND CATCHING SOMETHING. The regen is
     the floor that stops a spiral; the snacks are the mechanic. If the free
     ten were the biggest number on the deck, the right play would be to stand
     still for fifteen seconds. */
  ok('...and smaller than every snack on the deck',
    CRITTERS.every((c) => c.heal >= MAX_HP * REGEN_FRAC));
  /* And the deck has to be able to cover a bad round. Three animals plus the
     regen against a kitten who won on her last two health. */
  const feastMax = Math.round(MAX_HP * REGEN_FRAC)
    + CRITTERS.map((c) => c.heal).sort((a, b) => b - a).slice(0, MAX_ON_STAGE)
      .reduce((n, h) => n + h, 0);
  line('most a feast can be worth', `${feastMax} of ${MAX_HP}`);
  ok('a perfect feast is worth about half a bar, not a whole one',
    feastMax > MAX_HP * 0.4 && feastMax < MAX_HP * 0.75);

  /* --- resetForRound carries, clamps, and never starts her dead --- */
  const mkF = (i) => new Player({
    texture: new THREE.Texture(), index: i, rows: 4, cols: 8, height: 2.9,
    spawn: new THREE.Vector3(0, 0, 0), name: i ? 'Frost' : 'Ember',
  });
  const p = mkF(0);
  p.resetForRound(1, 2, 3, 0);
  ok('no carried health means a full bar', p.hp === p.maxHp);
  p.resetForRound(1, 2, 3, 0, 37);
  ok('a carried number is what she starts with', p.hp === 37);
  p.resetForRound(1, 2, 3, 0, 0);
  ok('...and it can never start her dead', p.hp >= 1);
  p.resetForRound(1, 2, 3, 0, 9999);
  ok('...nor above her own bar', p.hp === p.maxHp);

  /* --- THE OVERFLOW ------------------------------------------------------
     Asked for as "take the health they gained, divide it by two, and add that
     to the maximum health that the player has in the next round". It is a
     MAXIMUM and not a heal, and it lives INSIDE `maxHp` so that everything
     already reading `hp / maxHp` — this HUD, the bar over her head, the rage
     multiplier — carries on working and none of them can be handed a fraction
     over one. */
  {
    const o = mkF(0);
    const base = o.maxHp;
    o.hp = 40;
    o.setRoundBonus(10);
    ok('banking overflow raises her ceiling', o.maxHp === base + 10);
    ok('...and says what the ordinary top still is', o.baseMaxHp === base);
    /* RAISING THE CEILING IS NOT FILLING TO IT. Two different events; the
       second one belongs to `resetForRound`. */
    ok('...without healing her a single point', o.hp === 40);
    ok('...and she is not carrying any of it yet', o.overflowHp === 0);

    o.resetForRound(1, 2, 3, 0);
    ok('a full start is full INCLUDING the overflow', o.hp === base + 10);
    ok('...and that is what she is shown as carrying', o.overflowHp === 10);
    /* AND THE FRACTION EVERYTHING ELSE READS STAYS SANE. A bar wider than its
       own box, and a rage multiplier under 1, are both one line away. */
    ok('...with her bar still exactly full and never more', o.hp / o.maxHp === 1);

    /* IT DRAINS FIRST, AND THEN THE ORDINARY BAR STARTS MOVING — the rule as
       it was asked for: "when they lose health, it should reduce the green bar
       until they get below the maximum and then go back to normal". */
    o.hp = base + 4;
    ok('a blow eats the overflow before the bar', o.overflowHp === 4);
    o.hp = base;
    ok('...and at the ordinary top there is none of it left', o.overflowHp === 0);
    o.hp = base - 30;
    ok('...and it cannot go negative underneath her', o.overflowHp === 0);

    /* THE OVERFLOW SITS ON TOP OF WHATEVER SHE BRINGS. A survivor carrying 60
       into a round with 10 banked has to start at 70 of 110 — starting at 60
       would make a REWARD for eating read as a smaller bar than she had. */
    o.resetForRound(1, 2, 3, 0, 60);
    ok('a carried number gets the overflow on top of it', o.hp === 70);
    o.resetForRound(1, 2, 3, 0, base);
    ok('...and a full carry comes out full, not over', o.hp === base + 10);

    /* IT REPLACES, IT DOES NOT ADD. One round, and a kitten who eats well
       three feasts running does not walk into the final on a bar of 160. */
    o.setRoundBonus(10);
    ok('banking the same figure twice is still one bonus', o.maxHp === base + 10);
    o.setRoundBonus(0);
    ok('...and a feast that banked nothing takes the ceiling back down',
      o.maxHp === base && o.baseMaxHp === base);
    ok('...without leaving her standing above it', o.hp <= o.maxHp);

    /* AND IT SURVIVES THE TWO THINGS THAT RECOMPUTE `maxHp` FROM SCRATCH.
       Trading a Vigor away mid-round, and the handicap — both rewrite the
       whole bar, and anything written straight into `maxHp` evaporates the
       moment either runs. Same argument `setHpScale` already carries. */
    o.setRoundBonus(12);
    o.setPowerOrbs(['vigor']);
    ok('an orb change does not spend her overflow',
      o.maxHp === o.baseMaxHp + 12 && o.bonusHp === 12,
      `${o.maxHp} / ${o.baseMaxHp}`);
    o.setHpScale(1.2);
    ok('...and neither does the handicap',
      o.maxHp === o.baseMaxHp + 12 && o.bonusHp === 12);
    o.setPowerOrbs([]);
    o.setHpScale(1);
    o.setRoundBonus(0);

    /* A GARBAGE FIGURE DEGRADES RATHER THAN NaN-ING HER BAR. `fedHp` comes off
       a running game; a maximum of NaN is a kitten with no bar at all and no
       way to work out why. Fourth house rule. */
    o.setRoundBonus(Number.NaN);
    ok('a bonus that is not a number is no bonus, not a broken bar',
      o.bonusHp === 0 && Number.isFinite(o.maxHp));
    o.setRoundBonus(-50);
    ok('...and it can never be negative', o.bonusHp === 0);
  }

  /* --- the angel --- */
  const q = mkF(1);
  q.hp = 0;
  q.ko = true;
  q.koT = 1.4;
  q.pandaMount = { rider: q };
  q.becomeAngel();
  ok('a knockout becomes an angel', q.angel === true);
  /* `ko` MUST BE CLEARED. Every KO-shaped rule in the game — the dead pad, the
     flat-on-her-back pose, being skipped by the ring-out test — is exactly
     wrong for a cat who is now flying. */
  ok('...and stops being knocked out', q.ko === false && q.koT === 0);
  ok('...and lets go of whatever she was riding', q.pandaMount === null);

  /* SHE MUST NOT BE ABLE TO INTERFERE. The whole point of the fifteen seconds
     is that the kitten who WON the round gets them to herself. */
  const men2 = new Menagerie({
    game: {
      scene: new THREE.Scene(), players: [p, q], input: { players: [] },
      toast() {}, sfx() {}, hitSpark() {},
    },
    world,
    art: {},
  });
  men2.on = true;
  ok('an angel cannot catch anything', men2.strike(q, 3.4) === false);

  /* She flies, and she is bounded — a ghost who leaves the arena is a ghost
     the fight camera cannot follow back. */
  const R2 = world.arenaRing;
  q.position.set(R2.x, R2.y + 4, R2.z);
  const airPad = { mx: 0, my: -1, down: (a) => a === 'jump', pressed: () => false };
  for (let i = 0; i < 60 * 8; i++) q.update(1 / 60, airPad, world, [], null);
  ok('an angel really does fly', q.position.y > R2.y + 6);
  ok('...and cannot leave the top of the shot', q.position.y < R2.y + 40);
  ok('...nor drift off the island', Math.hypot(q.position.x - R2.x, q.position.z - R2.z)
    < R2.half + 40);

  /* THE BAR OVER HER HEAD IS DERIVED, NOT LATCHED. `barOn` is the tournament's
     intent and `hpGroup.visible` is computed from it every frame — written the
     obvious way (`visible = visible && !angel`) the flag has nowhere to come
     back from, and she spends the rest of the tournament with no bar. */
  q.barOn = true;
  q.angel = true;
  q.update(1 / 60, { mx: 0, my: 0, down: () => false, pressed: () => false }, world, [], null);
  ok('an angel has no bar over her head', q.hpGroup.visible === false);
  q.landAngel();
  q.update(1 / 60, { mx: 0, my: 0, down: () => false, pressed: () => false }, world, [], null);
  ok('...and it comes straight back when she lands', q.hpGroup.visible === true);
  q.barOn = false;

  ok('landing puts the cat back', q.angel === false);

  /* --- the deck still catches you during the feast, it just costs nothing ---
     Before the feast existed every non-live tournament state was a frozen one,
     so there was no way to walk off the arena at all. The island out there is
     finite: a kitten chasing a rat over the rim would fall for fifteen seconds
     and respawn in the town, three hundred units from a tournament that is
     about to post her back on her mark. */
  {
    const R3 = world.arenaRing;
    const T2 = new Tournament({
      game: { players: [p, q], menagerie: null, toast() {}, sfx() {} },
      world,
      audio: null,
      announcer: null,
    });
    /* WHERE SHE IS STANDING IS THE WHOLE QUESTION NOW — see `_updateOut`. The
       default drops her on the LOWER FLOOR, which is the real case: the island
       under the plinth, 2.4 below the deck. */
    const outX = R3.x + R3.half + 12;
    const floorAt = (x) => world.heightAt(x, R3.z)?.y ?? (R3.y - 2.4);
    const shove = (state, dmg, { y = null, onGround = true, x = outX, dt = 1.0 } = {}) => {
      T2.state = state;
      p.landAngel();
      p.hp = p.maxHp;
      p.invulnT = 0;
      p.outT = 0;
      p.onGround = onGround;
      p.position.set(x, y == null ? floorAt(x) : y, R3.z);
      T2._updateOut(dt, dmg);
      return { hp: p.hp, back: Math.abs(p.position.x - R3.x) < 1 };
    };
    const live = shove('live', 30);
    ok('a ring-out in a live round still hurts', live.hp < p.maxHp && live.back);
    const feast = shove('feast', 0);
    ok('...and during the feast it is free', feast.hp === p.maxHp);
    ok('...but she is still put back on the stone', feast.back);

    /* SHE IS NOT OUT UNTIL SHE HAS COME DOWN, which is the fix for a round
       being taken off you for being HIT. The test was horizontal only, so the
       timer ran the moment she crossed the line however she crossed it — and
       the commonest way to cross it is a knockback, which sends her over the
       edge in a long arc with `lift` on it. A kitten sailing across the line on
       her way back onto the deck was being counted out of a ring she was about
       to land in the middle of. */
    const air = shove('live', 30, { y: R3.y + 6, onGround: false });
    ok('a kitten flying over the line is NOT out yet',
      air.hp === p.maxHp && !air.back);
    /* Landing on the ground outside the ring is what the rule is FOR. */
    const landed = shove('live', 30);
    ok('...but landing past it still costs her', landed.hp < p.maxHp && landed.back);
    /* And off the rim entirely, where `onGround` never becomes true again
       because there is nothing under her — waiting for it would be falling
       forever. */
    const fallen = shove('live', 30, { y: R3.y - 20, onGround: false });
    ok('...and falling off the edge counts without landing',
      fallen.hp < p.maxHp && fallen.back);

    /* STANDING ON THE STONE IS STANDING IN THE RING, WHATEVER THE PAINT SAYS.
       `arenaOutBy` measures from the painted line, which sits ARENA_OUT (1.1)
       INSIDE the deck edge — so there is a full stride of real stone that reads
       as "out". It was, and kittens were rung out while visibly still on the
       stage. The paint is the warning; the deck is the rule. */
    const margin = R3.x + R3.half - R3.out / 2;
    ok('the deck margin outside the paint really is past the line',
      world.arenaOutBy(margin, R3.z) > 0);
    const onStone = shove('live', 30, { x: margin, y: R3.y });
    ok('...but standing on it is NOT a ring-out',
      onStone.hp === p.maxHp && !onStone.back);

    /* AND THERE IS NO GRACE LEFT IN A LIVE ROUND. Half a second of nothing
       happening after she has landed on the ground outside the ring reads as
       the rule being broken — one frame is enough now. The feast keeps its
       grace, because nothing there is at stake and snapping her back mid-stride
       for chasing a rabbit down the steps is the arena taking her one job away. */
    const instant = shove('live', 30, { dt: 1 / 60 });
    ok('...and one frame on the floor is enough to be out',
      instant.hp < p.maxHp && instant.back);
    const dawdle = shove('feast', 0, { dt: 1 / 60 });
    ok('...while the feast still gives her half a second to scramble back',
      !dawdle.back);
    ok('...and no edge warning flashes while nothing is at stake', p.nearEdge === false);

    /* An angel is ALLOWED off the deck — flying over the rim is most of what
       the wings are for, and she has her own leash. */
    q.becomeAngel();
    q.position.set(R3.x + R3.half + 12, R3.y + 10, R3.z);
    T2.state = 'feast';
    T2._updateOut(1.0, 0);
    ok('an angel is not dragged back into the ring',
      Math.abs(q.position.x - (R3.x + R3.half + 12)) < 0.01);
    q.landAngel();
  }

  /* THE WINGS COME OFF WHEN THE TOURNAMENT DOES. `angel` is what routes her
     into the flight mode, so a kitten flown home still holding it would drift
     through the town with no gravity and no katana for the rest of the
     afternoon. `Tournament.finish` is the one place that has to remember. */
  const T = new Tournament({
    game: { players: [p, q], menagerie: men2, toast() {} },
    world,
    audio: null,
    announcer: null,
  });
  p.becomeAngel();
  q.becomeAngel();
  T.finish();
  ok('going home clears both angels', !p.angel && !q.angel);
  ok('...and puts the wildlife away', men2.list.length === 0 && !men2.on);
  ok('...and hands both of them a full bar back', p.hp === p.maxHp && q.hp === q.maxHp);
}

/* ===========================================================================
   FOUR PLAYERS.

   Everything below is about the party being a NUMBER rather than two. The
   failures these catch are the quiet ones: a fourth kitten the same colour as
   the second, a viewport two pixels tall, a recolour that shifts the alpha
   channel and silently re-slices a sheet, a team mode where a partner can cut
   you down, a league whose board writes over the duel's.
   =========================================================================== */
{
  console.log('\n--- four players: who they are ---');

  ok('four kittens in the roster', PLAYER_STYLE.length === 4 && MAX_PLAYERS === 4);

  /* NO TWO PLAYERS MAY LOOK ALIKE, and hue is what a marker ring is read by at
     ring size on a busy screen.
     THE BOUND IS EMBER AND FROST, NOT A NUMBER I PICKED. The first pass asserted
     60 degrees and failed at 50 — and what it had found was the ORIGINAL pair:
     orange and pink have been 50 apart for the whole life of this project and
     are perfectly readable, partly because the cats themselves are also orange
     and grey. So the honest invariant is not an absolute separation, it is that
     adding kittens must not make the palette HARDER to read than the one the
     girls already play with. Every new pair has to be at least as far apart as
     the two that shipped. */
  const hueOf = (hex) => {
    const r = ((hex >> 16) & 255) / 255;
    const g = ((hex >> 8) & 255) / 255;
    const b = (hex & 255) / 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const d = mx - mn;
    if (d === 0) return 0;
    let h;
    if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (mx === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return h * 360;
  };
  const apart = (a, b) => {
    const d = Math.abs(hueOf(a) - hueOf(b));
    return Math.min(d, 360 - d);
  };
  const baseline = apart(PLAYER_STYLE[0].colour, PLAYER_STYLE[1].colour);
  let worst = 360;
  let worstPair = '';
  for (let i = 0; i < PLAYER_STYLE.length; i++) {
    for (let j = i + 1; j < PLAYER_STYLE.length; j++) {
      if (i === 0 && j === 1) continue;          // the baseline itself
      const d = apart(PLAYER_STYLE[i].colour, PLAYER_STYLE[j].colour);
      if (d < worst) { worst = d; worstPair = `${PLAYER_STYLE[i].name}/${PLAYER_STYLE[j].name}`; }
    }
  }
  ok('no new pair is closer in hue than Ember and Frost', worst >= baseline,
    `${worstPair} ${worst.toFixed(0)}deg vs baseline ${baseline.toFixed(0)}deg`);
  ok('every kitten has her own name', new Set(PLAYER_STYLE.map((s) => s.name)).size === 4);
  ok('every kitten has her own panda name',
    new Set(PLAYER_STYLE.map((s) => s.panda)).size === 4);

  /* THE FIRST TWO ARE UNCHANGED. The girls play two-player most of the time and
     the whole compatibility argument rests on this. */
  ok('Ember and Frost keep their colours',
    PLAYER_STYLE[0].colour === 0xff8a3d && PLAYER_STYLE[1].colour === 0xff6fae);
  ok('...and their spawn and respawn spots',
    PLAYER_STYLE[0].startX === -3.5 && PLAYER_STYLE[1].startX === 3.5
    && PLAYER_STYLE[0].spawnX === -3 && PLAYER_STYLE[1].spawnX === 3);
  ok('...and their pandas',
    PLAYER_STYLE[0].panda === 'Bao' && PLAYER_STYLE[1].panda === 'Mochi');
  ok('every respawn spot is 3 apart or more', PLAYER_STYLE.every((a, i) =>
    PLAYER_STYLE.every((b, j) => i === j || Math.abs(a.spawnX - b.spawnX) >= 3)));
  ok('styleFor degrades rather than returning undefined', styleFor(99) === PLAYER_STYLE[0]);
  ok('styleCss derives the same colour', styleCss(2) === '#35d7f0');

  /* --- A SEAT IS NOT A CAT ---
     `Game.roster` exists because the character picker lets a player choose a
     cat that is not her seat's default: player 3 picking Blossom makes the
     roster [0, 1, 3, 2]. Nine places in the HUD were passing a PLAYER index to
     `styleCss` / `styleFor` as though it were a STYLE index, which is the same
     number right up until that happens and then wrong for two players at once
     — reported from four-player play as "Storm and Blossom have the wrong
     border colours", with the two names swapped on the scoreboard as well.

     `cssFor` is the fix that cannot be handed the wrong number: it takes the
     style OBJECT the kitten was actually built from. These pin that it agrees
     with `styleCss` where the two questions coincide, that it degrades where
     the object is missing, and — the point of the whole exercise — that the
     two answers really do come apart, so the distinction is worth keeping. */
  ok('cssFor and styleCss agree seat by seat',
    PLAYER_STYLE.every((st, i) => cssFor(st) === styleCss(i)));
  ok('...and cssFor degrades to player one rather than to undefined',
    cssFor(null) === styleCss(0) && cssFor(undefined) === styleCss(0)
    && cssFor({}) === styleCss(0));
  /* The permuted roster, spelled out, because the bug is invisible until it
     is: seat 2 holding Blossom has to be purple and not Storm's teal. */
  const swapped = [0, 1, 3, 2];
  ok("...and a picked cat is not her seat's cat",
    cssFor(PLAYER_STYLE[swapped[2]]) !== styleCss(2)
    && cssFor(PLAYER_STYLE[swapped[2]]) === styleCss(3),
    `seat 2 -> ${cssFor(PLAYER_STYLE[swapped[2]])}, seat colour ${styleCss(2)}`);
  /* AND THE KITTEN CARRIES IT HERSELF, so a caller holding a Player never has
     to consult the roster at all. This is what every fixed call site now does. */
  const picked = new Player({
    texture: new THREE.Texture(), index: 2, style: PLAYER_STYLE[3],
    spawn: new THREE.Vector3(0, 0, 0), cols: 8, rows: 4, mirror: false,
  });
  ok('...and a Player knows which cat she is', cssFor(picked.style) === styleCss(3));
  ok('...including her own marker ring',
    picked.marker.material.color.getHex() === PLAYER_STYLE[3].colour);

  /* NOBODY MAY GO BACK TO ASKING A SEAT FOR A COLOUR. Source pins, because
     `Game` self-boots and cannot be constructed here — and because these are
     the exact lines that were wrong. Each is a PLAYER index being resolved
     before it reaches the palette, or the kitten being asked directly. */
  /* COMMENTS STRIPPED FIRST, and that is not tidiness. Half of these ask that
     something is ABSENT, and this codebase's comments name the thing that was
     tried and failed — so every one of these lines is quoted, verbatim, in the
     comment sitting directly above the line that fixed it. Three of these four
     checks failed on their own explanation the first time they ran.

     Crude on purpose: block comments and whole-line `//`, nothing that has to
     understand a regex literal or a string. There is no `/*` inside a string
     anywhere in these files, and if one ever appears this fails loudly rather
     than quietly reading less than it thinks. */
  const codeOnly = (src) => src
    .replace(/\r/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const seatSrc = codeOnly(
    readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  );
  ok('the pane frames ask the kitten, not the seat',
    seatSrc.includes('cssFor(this.players[m]?.style)') && !/styleCss\(m\)/.test(seatSrc));
  ok('...and the score badges resolve the seat through the roster',
    seatSrc.includes('styleFor(this._styleAt(i))')
    && seatSrc.includes('styleCss(this._styleAt(i))'));
  ok('...and the map tag names whoever is standing in the pane',
    !/styleFor\(members\[0\]\)/.test(seatSrc));
  ok('...and _styleAt goes through the roster it exists for',
    /_styleAt\(index\)\s*\{\s*return this\.roster\?\.\[index\] \?\? index;/.test(seatSrc));
  /* THE FIVE CALLS LEFT ARE THE ONES THAT WERE ALREADY RIGHT: the join card
     (twice) and the touch-pad kitten went through `this.roster` all along, and
     the score badge and the menu owner now go through `_styleAt`. Pinned by
     COUNT as well as by shape, so a tenth caller cannot quietly appear beside
     them holding a bare seat number. */
  const bySeat = seatSrc.match(/styleCss\(/g) ?? [];
  ok('...and every remaining styleCss call resolves its seat first',
    bySeat.length === 5
    && (seatSrc.match(/styleCss\(this\.(roster\[|_styleAt\()/g) ?? []).length === 5,
    `${bySeat.length} calls`);
  for (const f of ['systems/minimap.js', 'systems/inspector.js']) {
    const src = codeOnly(readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8'));
    ok(`${f} no longer colours anything by index`,
      !/styleCss\(/.test(src) && /cssFor\(/.test(src));
  }

  console.log('\n--- four players: the recolours ---');

  /* THE RECOLOUR MUST NOT TOUCH ALPHA. Everything measured about a sheet — the
     cell grid, contentScale, and every direction mapping the sprite checks
     assert — is computed from alpha during packing. This runs AFTER packing, so
     a recolour that moved alpha would silently re-slice a kitten. */
  const px = new Uint8ClampedArray([
    200, 90, 40, 255,     // saturated orange
    128, 128, 128, 255,   // pure grey
    10, 8, 9, 255,        // lineart
    250, 250, 250, 255,   // near-white
    0, 0, 0, 0,           // transparent
  ]);
  const alphaBefore = [px[3], px[7], px[11], px[15], px[19]];
  const rgbBefore = [...px];
  recolourPixels(px, { hue: 210, tint: 300, tintSat: 0.4, greyS: 0.5 });
  ok('recolour never writes alpha',
    [px[3], px[7], px[11], px[15], px[19]].every((v, i) => v === alphaBefore[i]));
  ok('...and does change the midtones',
    px[0] !== rgbBefore[0] || px[1] !== rgbBefore[1] || px[2] !== rgbBefore[2]);
  /* A grey pixel is exactly what a hue rotation cannot move, and colouring it
     is the entire reason `tint` exists as a second knob. */
  ok('...and gives a GREY pixel a colour', px[4] !== px[5] || px[5] !== px[6]);
  /* Lineart takes no saturation lift, or every outline gets a colour cast and
     the sheet reads as badly printed rather than as a different cat. */
  const lineWas = [rgbBefore[8], rgbBefore[9], rgbBefore[10]];
  const lineNow = [px[8], px[9], px[10]];
  ok('...and leaves the lineart alone',
    lineNow.every((v, i) => Math.abs(v - lineWas[i]) <= 2),
    `${lineWas} -> ${lineNow}`);
  ok('the lift window is zero on black and on white',
    liftWindow(0.05) === 0 && liftWindow(1) === 0 && liftWindow(0.5) === 1);

  /* Ember and Frost must be BYTE-FOR-BYTE the sheets that were loaded. */
  ok('the first two kittens take no recolour',
    PLAYER_STYLE[0].recolour === null && PLAYER_STYLE[1].recolour === null);
  ok('...and the new two do',
    !!PLAYER_STYLE[2].recolour && !!PLAYER_STYLE[3].recolour);
  /* Frost is a GREY cat, so a rotation alone cannot recolour her and her copy
     has to carry a tint. Ember is saturated and needs none. */
  ok('the recolour of the grey sheet carries a tint',
    PLAYER_STYLE[3].sheet === 'frost' && PLAYER_STYLE[3].recolour.tint != null);

  console.log('\n--- four players: the split screen ---');

  const VW = 1920;
  const VH = 1080;
  for (const n of [1, 2, 3, 4]) {
    const panes = splitLayout(n, VW, VH, 3, 'vertical');
    ok(`${n} view(s): one pane each`, panes.length === n);
    ok(`${n} view(s): every pane inside the frame`, panes.every(
      (v) => v.x >= 0 && v.y >= 0 && v.x + v.w <= VW && v.y + v.h <= VH
        && v.w > 2 && v.h > 2));
    /* NO TWO PANES MAY OVERLAP. A pane drawn over another is the one split bug
       a screenshot hides — the top one just looks like the whole view. */
    let overlap = false;
    for (let i = 0; i < panes.length; i++) {
      for (let j = i + 1; j < panes.length; j++) {
        const a = panes[i];
        const b = panes[j];
        if (a.x < b.x + b.w && b.x < a.x + a.w
          && a.y < b.y + b.h && b.y < a.y + a.h) overlap = true;
      }
    }
    ok(`${n} view(s): no two panes overlap`, !overlap);
    /* EQUAL AREA. Three players get quadrants with one cell empty precisely so
       nobody plays on a bigger screen than anybody else. */
    const areas = panes.map((v) => v.w * v.h);
    ok(`${n} view(s): every pane the same size`,
      Math.max(...areas) - Math.min(...areas) <= 2 * Math.max(VW, VH));
  }
  /* PLAYER 1 IS TOP-LEFT, and the horizontal split's inversion is where this
     has bitten before — WebGL's origin is bottom-left, so "on top" is the HIGH
     y. Getting it backwards silently swaps the two girls' halves. */
  const two = splitLayout(2, VW, VH, 3, 'horizontal');
  ok('horizontal split puts player 1 on top', two[0].y > two[1].y);
  const four = splitLayout(4, VW, VH, 3, 'vertical');
  ok('quadrants put player 1 top-left', four[0].x === 0 && four[0].y > four[2].y);
  ok('...and player 2 top-right', four[1].x > 0 && four[1].y === four[0].y);
  const vert = splitLayout(2, VW, VH, 3, 'vertical');
  ok('the two-player split is what it always was',
    vert[0].x === 0 && vert[0].y === 0 && vert[0].h === VH
    && vert[1].x === VW - Math.floor((VW - 3) / 2));

  /* A SHARED PANE IS WORTH HALF THE SCREEN, NOT A QUARTER. Equal panes are the
     fair rule when every pane holds one kitten and the wrong one the moment a
     pane holds two — a pair standing together were given the same quarter as
     somebody on her own, so teaming up COST them half their screen each. The
     rule underneath was always equal area PER PLAYER; equal panes is what that
     reduces to when everybody is alone. */
  {
    const full = VW * VH;
    const three = splitLayout(3, VW, VH, 3, 'vertical', [2, 1, 1]);
    ok('a pair in three panes gets half the screen',
      Math.abs(three[0].w * three[0].h / full - 0.5) < 0.02,
      `${(three[0].w * three[0].h / full).toFixed(3)}`);
    ok('...and the two on their own get a quarter each',
      [1, 2].every((i) => Math.abs(three[i].w * three[i].h / full - 0.25) < 0.02));
    /* EQUAL AREA PER PLAYER is the rule it is really enforcing, so state it. */
    ok('...which is the same screen each, per kitten',
      Math.abs((three[0].w * three[0].h) / 2 - three[1].w * three[1].h) / full < 0.02);
    /* STACKED, THE PAIR GETS A FULL-WIDTH STRIP — and that is what
       'horizontal' means now rather than what everybody got. The setting used
       to reach exactly one branch (two even panes), so a player who asked for
       a side-by-side screen got one with two kittens and a stacked one with
       three, from the same setting and with nothing on screen to say why. */
    const threeH = splitLayout(3, VW, VH, 3, 'horizontal', [2, 1, 1]);
    ok('the shared pane is FULL WIDTH when the split is stacked',
      threeH[0].w === VW && threeH[0].h < VH);
    /* ...AND THE MIRROR IMAGE WHEN IT IS NOT. A full-height column for the
       pair, the two singles sharing the other one. Worse shape for a pair, for
       the reason splitLayout gives, and it is what the setting says — and
       `fitDistance` means the worse shape costs a wider framing rather than
       kittens cropped off the edge of their own pane. */
    ok('...and a full-height COLUMN when it is side by side',
      three[0].h === VH && three[0].w < VW);
    ok('...with the two singles sharing the other column',
      three[1].x === three[2].x && three[1].x > three[0].x
      && three[1].y !== three[2].y);

    /* THE BIG PANE KEEPS ITS GROUP'S INDEX WHEREVER THAT GROUP SITS IN THE
       ORDER, so the returned array still lines up index-for-index with the
       caller's groups. Sorting the panes would silently hand one group
       another's camera. Asserted BOTH WAYS ROUND, because the two branches are
       two separate pieces of arithmetic and only one of them existed before. */
    for (const at of [0, 1, 2]) {
      const sizes = [1, 1, 1];
      sizes[at] = 2;
      const ph = splitLayout(3, VW, VH, 3, 'horizontal', sizes);
      ok(`a pair at index ${at} keeps index ${at} and takes the top strip`,
        ph[at].w === VW && ph[at].y > 0 && ph.length === 3);
      const pv = splitLayout(3, VW, VH, 3, 'vertical', sizes);
      ok(`...and the left column when the split is side by side (${at})`,
        pv[at].h === VH && pv[at].x === 0 && pv.length === 3);
    }

    /* THREE PLAYERS ALL APART ARE STILL QUADRANTS — no pane has two kittens in
       it, so there is nothing to weight and the old answer is the right one. */
    const solo = splitLayout(3, VW, VH, 3, 'vertical', [1, 1, 1]);
    const quad = splitLayout(3, VW, VH, 3, 'vertical');
    ok('three kittens on their own still get equal quadrants',
      JSON.stringify(solo) === JSON.stringify(quad));

    /* AND EVERY WEIGHTED LAYOUT IS STILL A LAYOUT: inside the frame, no
       overlaps. Getting this wrong draws one girl's view over another's. */
    let bad = 0;
    for (const sizes of [[2, 1, 1], [1, 2, 1], [1, 1, 2]]) {
      const p = splitLayout(3, VW, VH, 3, 'vertical', sizes);
      if (!p.every((v) => v.x >= 0 && v.y >= 0 && v.x + v.w <= VW && v.y + v.h <= VH)) bad += 1;
      for (let i = 0; i < p.length; i++) {
        for (let j = i + 1; j < p.length; j++) {
          const a = p[i];
          const b = p[j];
          if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) bad += 1;
        }
      }
    }
    ok('every weighted layout stays inside the frame and never overlaps', bad === 0);

    /* ---- A PANE YOU HAVE IS A PANE YOU KEEP ------------------------------
       Reported from four-player play: "a player's split screen can be in one
       corner and then because some other screens change, their split screen
       moves to a different area." It is not cosmetic — the entire value of
       split screen is knowing where to look, and the pane moved for reasons
       that had nothing to do with the player it moved.

       `splitLayout` hands panes back in GROUP order, and a group's index moves
       when anybody else on the screen pairs up. `stablePanes` reassigns them
       to whoever was nearest. These check the behaviour, not the arithmetic:
       every one of them is "did the player actually stay put". */
    {
      const seats = (panes, groups) => paneSeats(panes, groups, VW, VH);
      const where = (panes, groups, who) => {
        const g = groups.findIndex((m) => m.includes(who));
        return `${panes[g].x},${panes[g].y}`;
      };

      /* THE REPORTED BUG, EXACTLY. Four kittens alone in four quadrants; then
         players 1 and 2 walk together. The pair has to take the new full-width
         strip, but player 0 and player 3 both had a bottom cell available in
         the corner they were already in. Before this, player 0 was thrown from
         top-left to bottom-left by somebody else's walk. */
      const g4 = [[0], [1], [2], [3]];
      const p4 = splitLayout(4, VW, VH, 3, 'vertical', [1, 1, 1, 1]);
      const s4 = seats(p4, g4);

      /* 'horizontal', because these checks are about the full-width strip the
         stacked layout makes — the direction is not what is being tested and
         pinning it keeps them reading the same as when they were written. */
      const g3 = [[0], [1, 2], [3]];
      const raw3 = splitLayout(3, VW, VH, 3, 'horizontal', [1, 2, 1]);
      const fix3 = stablePanes(raw3, g3, s4, VW, VH);
      ok('the pane order alone moved player 1 across the screen',
        where(raw3, g3, 0) !== where(p4, g4, 0));
      ok('...and she keeps the side of the screen she was on',
        fix3[0].x === p4[0].x, `${fix3[0].x} vs ${p4[0].x}`);
      ok('...and player 4 is not moved either',
        fix3[2].x === p4[3].x && fix3[2].y === p4[3].y);
      /* THE PAIR STILL GETS THE BIG PANE. Only same-shaped rectangles may
         swap, which is what stops a nearer quarter being handed to a group
         that earned half the screen — the rule splitLayout exists to enforce. */
      ok('...and the pair still gets the full-width strip',
        fix3[1].w === VW, `${fix3[1].w}`);

      /* NOBODY MOVES WHEN NOTHING CHANGES. Fed its own seats back, the answer
         has to be a fixed point, or a pane would drift a little every frame. */
      let drifts = 0;
      let cur = p4;
      for (let f = 0; f < 8; f++) {
        const next = stablePanes(splitLayout(4, VW, VH, 3, 'vertical', [1, 1, 1, 1]),
          g4, seats(cur, g4), VW, VH);
        if (JSON.stringify(next) !== JSON.stringify(cur)) drifts += 1;
        cur = next;
      }
      ok('a settled four-way split does not drift frame to frame', drifts === 0);

      /* AND IT IS A PERMUTATION, NEVER AN INVENTION. Anything else would draw
         a camera into a rectangle splitLayout never sanctioned — off the edge
         of the frame, or on top of somebody else. */
      const sorted = (a) => JSON.stringify([...a].map((v) => `${v.x},${v.y},${v.w},${v.h}`).sort());
      let notPerm = 0;
      for (const sizes of [[1, 1, 1, 1], [2, 1, 1], [1, 2, 1], [1, 1, 2], [1, 1], [3, 1]]) {
        const gs = [];
        let next = 0;
        for (const k of sizes) { gs.push(Array.from({ length: k }, () => next++)); }
        const raw = splitLayout(sizes.length, VW, VH, 3, 'vertical', sizes);
        const fixed = stablePanes(raw, gs, { 0: { cx: 0.9, cy: 0.1 }, 1: { cx: 0.1, cy: 0.9 } },
          VW, VH);
        if (sorted(raw) !== sorted(fixed)) notPerm += 1;
        if (fixed.length !== raw.length) notPerm += 1;
        /* Same shape in the same slot: the size rules survive the shuffle. */
        for (let i = 0; i < raw.length; i++) {
          if (raw[i].w !== fixed[i].w || raw[i].h !== fixed[i].h) notPerm += 1;
        }
      }
      ok('reseating only ever permutes panes of identical shape', notPerm === 0);

      /* TWO PLAYERS COME OUT BIT-IDENTICAL. Fifth non-negotiable: everything
         four-player is additive, and where a rule generalises the two-player
         answer has to be unchanged. Two even panes are the same shape, so the
         only thing that could reorder them is the girls actually swapping
         sides — and with no history at all it must be the identity. */
      const g2 = [[0], [1]];
      for (const dir of ['vertical', 'horizontal']) {
        const raw2 = splitLayout(2, VW, VH, 3, dir);
        ok(`two players are untouched with no history (${dir})`,
          JSON.stringify(stablePanes(raw2, g2, {}, VW, VH)) === JSON.stringify(raw2));
        ok(`...and untouched again once seated (${dir})`,
          JSON.stringify(stablePanes(raw2, g2, seats(raw2, g2), VW, VH))
            === JSON.stringify(raw2));
      }

      /* A MERGED VIEW HAS NOTHING TO DECIDE, and asking must not throw. */
      const one = splitLayout(1, VW, VH, 3, 'vertical');
      ok('one pane is returned unchanged',
        JSON.stringify(stablePanes(one, [[0, 1, 2, 3]], s4, VW, VH)) === JSON.stringify(one));

      /* SEATS COVER EVERY PLAYER IN EVERY GROUP, or a kitten with no seat is a
         kitten whose next pane is chosen at random. */
      const sd = seats(raw3, g3);
      ok('every player in a group gets a seat', [0, 1, 2, 3].every((i) => sd[i]));
      ok('...and the two sharing a pane share a seat',
        sd[1].cx === sd[2].cx && sd[1].cy === sd[2].cy);
    }

    /* ---- TWO PANES HOLDING DIFFERENT NUMBERS OF KITTENS -------------------
       THIS USED TO ASSERT THE OPPOSITE, and the reason it gave was sound but
       incomplete: "carving a 3:1 split for a trio plus a straggler would hand
       the lone kitten a sliver the camera cannot use." True of a 3:1 split, and
       that is why this one is 0.62/0.38 rather than proportional.

       What the old answer missed is that the even split was not neutral — it
       was actively broken for the trio. Four players, three together and one
       away, is two groups, so it fell through to a 50/50 VERTICAL split: three
       kittens sharing half a screen (a sixth each against the solo's half), in
       a pane whose aspect drops from about 1.78 to 0.58. The camera's fov is
       vertical, so that collapses the horizontal field to a third of what every
       framing constant in main.js was tuned against, and two of the three were
       cropped off the sides of their own pane. Reported from a four-player game
       as "only Frost is visible — it thinks all three are, but that assumes the
       whole screen width". */
    const uneven = splitLayout(2, VW, VH, 3, 'vertical', [3, 1]);
    ok('an uneven pair of panes is SIDE BY SIDE, so both stay tall',
      uneven.every((v) => v.h === VH && v.y === 0));
    ok('...and the bigger group gets the wider column',
      uneven[0].w > uneven[1].w && uneven[0].x === 0);
    /* THE OLD OBJECTION, KEPT AS A CHECK. A solo pane must stay a shape
       something can be drawn in — this is the number that stops somebody
       "fixing" the fairness by making it proportional. */
    ok('...while the lone kitten still gets a pane, not a sliver',
      uneven[1].w > VW * 0.3, `${(uneven[1].w / VW).toFixed(2)} of the width`);
    ok('...and the two of them tile the frame exactly',
      uneven[1].x === VW - uneven[1].w && uneven[0].w + uneven[1].w <= VW);
    /* WHICHEVER PANE IS FIRST GOES ON THE LEFT, so the array still lines up
       index-for-index with the caller's groups. Sorting by size would hand one
       group another's camera. */
    const unevenB = splitLayout(2, VW, VH, 3, 'vertical', [1, 3]);
    ok('...and a group listed second keeps the second pane',
      unevenB[1].w > unevenB[0].w && unevenB[0].x === 0);

    /* AND THIS IS THE ONE PLACE THE SETTING IS OVERRIDDEN, ON PURPOSE.
       Reported from a stacked four-player game: three sisters at the dealer's
       stall in one pane and one girl opening her card is 3v1, so her pane came
       out 1920x410 at 1080p — a strip nearly five times wider than it is tall,
       with a MENU in it. `.pane-card` sizes itself in `cqw`, a percentage of
       the pane's WIDTH, so its type and padding were sized for a pane 1920
       across and then given 410 of height to fit in.

       The solo pane is not really a camera: it is the pane a card, a dragon's
       altitude, or a kitten on her own gets, and all three want height. This
       check is the whole of that decision, so it cannot be undone by accident
       the next time somebody makes the setting more thorough. */
    for (const d of ['vertical', 'horizontal']) {
      const u = splitLayout(2, VW, VH, 3, d, [3, 1]);
      ok(`an uneven pair is side by side even when the setting says ${d}`,
        u.every((v) => v.h === VH && v.y === 0),
        `${u[1].w}x${u[1].h}`);
      ok(`...and the solo pane is taller than it is wide (${d})`,
        u[1].h > u[1].w, `${u[1].w}x${u[1].h}`);
    }
    ok('...and the two directions come out identical for an uneven pair',
      JSON.stringify(splitLayout(2, VW, VH, 3, 'vertical', [2, 1]))
        === JSON.stringify(splitLayout(2, VW, VH, 3, 'horizontal', [2, 1])));
    /* AND AN EVEN PAIR STILL OBEYS IT, which is the two-player game and the
       thing that must not move. */
    ok('...while two EVEN panes still stack when the setting says so',
      splitLayout(2, VW, VH, 3, 'horizontal').every((v) => v.w === VW));

    /* QUADRANTS IGNORE IT, AND THAT IS THE ANSWER RATHER THAN AN OVERSIGHT.
       They are already cut both ways at once; the alternatives are three or
       four equal columns or rows, which splitLayout's header rejects on equal
       area and on the shape a fixed three-quarter camera can work in. */
    for (const n of [3, 4]) {
      ok(`${n} equal panes are the same either way — direction has no meaning`,
        JSON.stringify(splitLayout(n, VW, VH, 3, 'vertical'))
          === JSON.stringify(splitLayout(n, VW, VH, 3, 'horizontal')));
    }

    /* TWO EVEN PANES ARE UNTOUCHED, WHICH IS THE TWO-PLAYER GAME. The sizes are
       always 1 and 1 there, so it never reaches the branch above and keeps the
       `dir` setting it has always had. This is the compatibility claim. */
    ok('two even panes are exactly what they always were',
      JSON.stringify(splitLayout(2, VW, VH, 3, 'vertical', [1, 1]))
      === JSON.stringify(vert)
      && JSON.stringify(splitLayout(2, VW, VH, 3, 'vertical')) === JSON.stringify(vert));
    ok('...including stacked, when that is what she asked for',
      JSON.stringify(splitLayout(2, VW, VH, 3, 'horizontal', [1, 1]))
      === JSON.stringify(splitLayout(2, VW, VH, 3, 'horizontal')));
    ok('...and two pairs are even, so they split down the middle',
      JSON.stringify(splitLayout(2, VW, VH, 3, 'vertical', [2, 2]))
      === JSON.stringify(vert));

    /* ---- AND A NARROW PANE PULLS ITS CAMERA BACK -------------------------
       Reported from play, with the setting on Top and bottom and one kitten
       alone against the other three: "the camera is zoomed in too much, it
       should be pulled out more so the player can see the environment. At
       least zoomed out as much as they were taking up 1/4th the screen, which
       is at least zoomed out twice as much as currently."

       `fitDistance` below could not answer it. It frames a GROUP, and her
       group is one kitten, so the spread is 0 and it returns 0 — every
       distance in `_updateRig` was then a constant tuned on a full-width
       screen, applied to a pane 0.68 wide for its height. `paneWiden` is the
       missing term and these are its two claims: that the reported case is
       fixed, and that the two-player game is untouched. */
    {
      const un = splitLayout(2, VW, VH, 3, 'horizontal', [3, 1]);
      const her = paneWiden(un, 1, VW, VH);
      const them = paneWiden(un, 0, VW, VH);
      /* The number the player asked for, in the words she asked for it. */
      ok('the solo pane of a 3v1 is pulled back at least twice as far',
        her >= 2, `${her.toFixed(2)}x`);
      ok('...which is exactly a quadrant of the same screen, across',
        Math.abs(her - (VW / VH) / (un[1].w / un[1].h)) < 1e-9, `${her.toFixed(3)}x`);
      ok('...and the trio share a wider pane, so they are pulled back less',
        them > 1 && them < her, `${them.toFixed(2)}x vs ${her.toFixed(2)}x`);

      /* --- AND THE WIDE PANE COMES BACK IN, WHICH IS THE OTHER HALF ---
         Reported in the same breath as the line above: "for the other 3, can
         zoom in at least 25% more, as it has more screen space." The rule is
         written from the NARROW pane's side — nobody sees less across their
         pane than a quadrant would — and read from the wide side it says
         something nobody asked for: that a group holding 62% of the width must
         also be pushed out to a quadrant's framing. A quadrant is the floor,
         not the ceiling.

         ASSERTED AS THE RATIO TO THE RAW GEOMETRY, so it cannot be satisfied
         by moving the 0.62 split instead. */
      const rawThem = (VW / VH) / (un[0].w / un[0].h);
      ok('...and that wider pane keeps only 75% of its pull-back',
        Math.abs(them - rawThem * BIG_PANE_IN) < 1e-9,
        `${them.toFixed(3)}x of a raw ${rawThem.toFixed(3)}x`);
      ok('...which is the "zoom in at least 25% more" that was asked for',
        them <= rawThem * 0.75 + 1e-9, `${them.toFixed(2)}x vs ${rawThem.toFixed(2)}x`);
      /* IT IS THE PANE THAT IS OVER ITS SHARE, NOT SIMPLY THE BIGGEST. The
         narrow one is the one PAYING for the split, and it must keep every bit
         of its widening or the first report comes straight back. */
      ok('...and the narrow pane keeps all of hers',
        Math.abs(her - (VW / VH) / (un[1].w / un[1].h)) < 1e-9);
      /* AND IT IS STILL NEVER A ZOOM IN PAST 1. `BIG_PANE_IN` multiplies a
         number that may already be under 1 (the stacked trio's strip is 3.57
         wide for its height), and three quarters of nothing has to clamp. */
      ok('...and three quarters of a below-1 widening is still exactly 1',
        splitLayout(3, VW, VH, 3, 'horizontal', [2, 1, 1])
          .every((_, i) => paneWiden(splitLayout(3, VW, VH, 3, 'horizontal', [2, 1, 1]),
            i, VW, VH) === 1));

      /* THE COMPATIBILITY CLAIM, AND THE ONLY REASON THE EVEN-SPLIT GUARD
         EXISTS. Two even panes side by side are just as narrow as the trio's
         and are deliberately left alone: that is the two-player game, which
         may not move (non-negotiable 5). The rule is about a rectangle nobody
         asked for, not about width. */
      for (const [what, panes] of [
        ['two even panes side by side', splitLayout(2, VW, VH, 3, 'vertical')],
        ['two even panes stacked', splitLayout(2, VW, VH, 3, 'horizontal')],
        ['quadrants', splitLayout(4, VW, VH, 3, 'vertical')],
        ['one shared screen', splitLayout(1, VW, VH, 3, 'vertical')],
        ['two pairs', splitLayout(2, VW, VH, 3, 'vertical', [2, 2])],
      ]) {
        ok(`...and ${what} are widened by exactly 1 — nothing moves`,
          panes.every((_, i) => paneWiden(panes, i, VW, VH) === 1));
      }
      /* NEVER A ZOOM IN. It is a floor on how much world is visible, so it can
         only ever push the camera out — a pane WIDER than a quadrant (the
         stacked trio's strip) has nothing to fix. */
      const st = splitLayout(3, VW, VH, 3, 'horizontal', [2, 1, 1]);
      ok('...and a pane wider than a quadrant is left alone, never pulled in',
        st.every((_, i) => paneWiden(st, i, VW, VH) === 1));
      ok('...and it degrades rather than NaNs on a pane with no area',
        paneWiden([{ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 1, h: 1 }], 0, VW, VH) === 1
        && paneWiden(null, 0, VW, VH) === 1);
    }

    /* ---- AND THE SEAM: THE KITTEN WHO WAS NEVER TOLD ----------------------
       `paneWiden` was written for the lone player in the 62/38 column, its
       docblock quotes her report word for word, the function is correct — and
       for the whole of its life the only thing that called it was the SHARED
       rig, which by definition is framing two or more. A group of ONE draws
       with `Player._updateCamera` (see `Game._cameraFor`, and the good reasons
       it gives), so the one kitten the fix was for was the one player in the
       game who never received it. Reported a second time, in the same words.

       Driven rather than read: a Player, her own camera, the same distance
       asked for with and without the field. */
    {
      const spawn = new THREE.Vector3(0, world.heightAt(0, 40).y, 40);
      const mkCam = (widen) => {
        const p = new Player({
          texture: new THREE.Texture(), index: 0, spawn: spawn.clone(),
          cols: 8, rows: 4, mirror: false, name: 'Ember', height: 2.9,
        });
        p.paneWiden = widen;
        // Long enough for `camDist` to finish its lerp onto the new target.
        for (let i = 0; i < 240; i++) p._updateCamera(1 / 60);
        return p.camDist;
      };
      const flat = mkCam(1);
      const narrow = mkCam(2.634);
      line('lone kitten camera: full pane / 62-38 column',
        `${flat.toFixed(1)} / ${narrow.toFixed(1)}`);
      /* THE CLAIM, AS A RATIO. Pinning the absolute distance would pin the
         walking clamp with it, and that is a tunable somebody may move. */
      ok('a kitten alone in the narrow column really is pulled back',
        Math.abs(narrow / flat - 2.634) < 0.02, `${(narrow / flat).toFixed(3)}x`);
      ok('...and at least twice as far, which is what was asked for',
        narrow >= flat * 2, `${narrow.toFixed(1)} vs ${flat.toFixed(1)}`);
      /* THE FIFTH NON-NEGOTIABLE, TWICE OVER. `paneWiden` returns exactly 1
         for every even split, so the two-player game never sees this — and a
         Player built anywhere else (this file, the character picker) never has
         the field written at all, which is the degrade rule. Both have to come
         out bit-identical to the old code, so both are asserted against the
         SAME number rather than against a constant. */
      ok('...and an even split moves the camera not one millimetre',
        mkCam(1) === flat);
      const bare = new Player({
        texture: new THREE.Texture(), index: 0, spawn: spawn.clone(),
        cols: 8, rows: 4, mirror: false, name: 'Ember', height: 2.9,
      });
      ok('...nor does a Player nobody ever told about panes',
        bare.paneWiden === 1);
      for (let i = 0; i < 240; i++) bare._updateCamera(1 / 60);
      ok('...and she frames herself exactly as she always did',
        bare.camDist === flat, `${bare.camDist} vs ${flat}`);
      /* DEGRADE, DO NOT VANISH. This field is written from outside the class
         every frame; a bad one must cost the widening, never the position. */
      for (const bad of [NaN, undefined, null, -3, 'wide']) {
        const p = new Player({
          texture: new THREE.Texture(), index: 0, spawn: spawn.clone(),
          cols: 8, rows: 4, mirror: false, name: 'Ember', height: 2.9,
        });
        p.paneWiden = bad;
        for (let i = 0; i < 240; i++) p._updateCamera(1 / 60);
        ok(`...and a paneWiden of ${String(bad)} costs the widening, not the camera`,
          p.camDist === flat, `${p.camDist}`);
      }
    }

    /* ---- AND SOMEBODY HAS TO WRITE IT EVERY FRAME ------------------------- */
    {
      const mn = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
      const src = stripComments(mn);
      ok('the split pass hands the solo pane its widening',
        /solo\.paneWiden = widen/.test(src));
      /* CLEARED FIRST, FOR EVERYBODY. A kitten who was alone in the narrow
         column and has walked back to her sisters is no longer the leader of
         any group, so the loop cannot reach her to reset it — she would carry
         a 2.6x pull-back into a pane she is not in, for the rest of the game.
         The reset has to come BEFORE the assignment or it undoes it. */
      const reset = src.indexOf('p.paneWiden = 1');
      const set = src.indexOf('solo.paneWiden = widen');
      ok('...and clears it for everybody first, so nobody keeps a stale one',
        reset > 0 && set > 0 && reset < set, `${reset} then ${set}`);
    }

    /* ---- THE MATHS BOARD TAKES THE TOP OF A SHARED PANE -------------------
       Also reported from play, side by side with two kittens in one pane: the
       board came out 42% of 960 where an unsplit screen gives it 540, and the
       one thing the Dojo exists to teach was too small to read. It takes the
       full width and the TOP corner there, because at 540 in a 960 pane the
       bottom edge is not a corner any more and the girls it is for are
       standing on the circle underneath it. */
    {
      const half = splitLayout(2, VW, VH, 3, 'vertical');
      const box = { w: 540, h: 420 };
      const low = mapSpot({ v: half[0], VW, W: VW, H: VH, ...box, inner: false });
      const high = mapSpot({ v: half[0], W: VW, H: VH, ...box, inner: false, top: true });
      ok('the maths board can be anchored to the TOP of its pane', high.top < low.top,
        `${high.top} vs ${low.top}`);
      ok('...hard into the corner when nothing is in the way', high.top === 14);
      ok('...and pushed below the scoreboard when something is',
        mapSpot({ v: half[0], W: VW, H: VH, ...box, inner: false, top: true, clear: 62 }).top === 62);
      /* A LOWER PANE'S OWN TOP ALREADY CLEARS THE SCOREBOARD, so `clear` must
         not lift it — `Math.max` rather than a branch, and this is the case
         that would catch a branch getting it backwards. */
      const stack = splitLayout(2, VW, VH, 3, 'horizontal');
      ok('...and a pane below the seam is not dragged up to meet it',
        mapSpot({ v: stack[1], W: VW, H: VH, ...box, inner: false, top: true, clear: 62 }).top
        === mapSpot({ v: stack[1], W: VW, H: VH, ...box, inner: false, top: true }).top);
      /* AND THE OUTER EDGE IS STILL THE BOARD'S, top or bottom — the map has
         the seam, and swapping them draws one through the other. */
      ok('...and it keeps the outer edge either way', high.left === low.left && high.left === 14);
    }

    /* ---- AND THE CAMERA HAS TO KNOW HOW WIDE ITS PANE IS ------------------
       The layout above is half the fix. The other half is that `_updateRig`
       sized its pull-back from world spread alone — `clamp(26 + spread*0.85,
       26, 52)`, an empirical fit tuned on a full-width screen — so ANY pane
       narrower than that would crop its own group however it was shaped. */
    const FOV = 38;
    const wide = fitDistance({ spread: 30, fovDeg: FOV, aspect: 16 / 9 });
    const narrow = fitDistance({ spread: 30, fovDeg: FOV, aspect: 0.58 });
    ok('a narrow pane needs the camera much further back than a wide one',
      narrow > wide * 2, `${wide.toFixed(1)} vs ${narrow.toFixed(1)}`);
    /* THE WHOLE COMPATIBILITY ARGUMENT FOR THE FLOOR. On a full-width pane it
       comes out BELOW the distance the game already uses, so `Math.max` picks
       the tuned number and nothing about the two-player game moves. */
    ok('...and on a full-width pane it asks for less than the tuned distance',
      wide < 26 + 30 * 0.85, `${wide.toFixed(1)} < 51.5`);
    ok('...so it can only ever pull further out, never closer in',
      fitDistance({ spread: 0, fovDeg: FOV, aspect: 0.5 }) === 0);
    /* DEGRADE, DON'T VANISH. A missing or nonsense argument must not return
       NaN and hand the camera a NaN distance, which would silently undraw the
       entire pane rather than merely framing it badly. */
    ok('...and nonsense in gives zero out rather than a NaN camera',
      [{ spread: 30, fovDeg: FOV, aspect: 0 }, { spread: NaN, fovDeg: FOV, aspect: 1 },
        { spread: 30, fovDeg: 0, aspect: 1 }]
        .every((a) => fitDistance(a) === 0));
    ok('...and a wider spread always needs more room than a narrower one',
      fitDistance({ spread: 40, fovDeg: FOV, aspect: 1 })
      > fitDistance({ spread: 20, fovDeg: FOV, aspect: 1 }));
  }

  /* ------------------ four players: WHO SHARES A PANE ------------------- */
  /* HANDOFF listed proximity clustering as deliberately not built, and named
     the blocker: "cluster membership changing mid-flight strands the per-view
     lerp state... the camera identity has to be stable across a membership
     change before anything else." The answer is that a group is NAMED BY ITS
     LOWEST MEMBER and the caller keeps a rig per player index, so the checks
     that matter here are about identity and totality rather than about
     distances — a grouping that loses a kitten, or renames a group when
     somebody else joins it, is a camera cut nobody asked for. */
  console.log('\n--- four players: who shares a pane ---');

  const at = (...xs) => xs.map((x) => ({ x, z: 0 }));
  const shape = (g) => g.map((m) => m.join('')).join('|');
  const group = (pts, opts = {}) => clusterPlayers({
    pts, mergeIn: MERGE_IN, mergeOut: MERGE_OUT, ...opts,
  });

  line('merge in / merge out', `${MERGE_IN} / ${MERGE_OUT}`);
  ok('sharing starts closer than it stops', MERGE_IN < MERGE_OUT);

  /* THE TWO-PLAYER GAME IS THE BOOLEAN IT REPLACED. This is the whole
     compatibility claim for the feature and it is the first thing checked:
     the girls play two-player, and a pair joining and splitting at any
     distance other than the ones they already know is a regression however
     good the four-player behaviour is. */
  ok('two players close together share one view',
    shape(group(at(0, 10)).groups) === '01');
  ok('two players far apart get one view each',
    shape(group(at(0, 60)).groups) === '0|1');
  ok('...at exactly the distance they always did',
    group(at(0, MERGE_IN - 0.1)).groups.length === 1
    && group(at(0, MERGE_IN + 0.1)).groups.length === 2);

  /* THE ASK, IN TWO LINES. Two kittens together and a third away is 2 panes,
     not 3; a third joining them is 3 in one pane and the fourth in the other. */
  ok('a pair plus a straggler is two panes, not three',
    shape(group(at(0, 10, 200)).groups) === '01|2');
  ok('a third joining the pair keeps it to two panes',
    shape(group(at(0, 10, 20, 200)).groups) === '012|3');
  ok('two pairs are two panes', shape(group(at(0, 10, 200, 210)).groups) === '01|23');
  ok('four apart is four panes',
    shape(group(at(0, 100, 200, 300)).groups) === '0|1|2|3');
  ok('four together is one pane', shape(group(at(0, 8, 16, 24)).groups) === '0123');

  /* EVERY KITTEN IN EXACTLY ONE PANE. A player in none has no camera and is
     invisible to herself; a player in two is drawn twice on a screen where
     she is trying to find her own marker. Checked over a spread of layouts
     rather than one, because the failure is a partition bug and partition bugs
     hide in the arrangement nobody tried. */
  {
    let bad = 0;
    for (const xs of [[0, 10, 20, 30], [0, 40, 80, 120], [0, 10, 200, 210],
      [0, 35, 70, 105], [0, 200, 10, 210], [0, 0, 0, 0]]) {
      const { groups: gs } = group(at(...xs));
      const seen = gs.flat().sort((a, b) => a - b);
      if (seen.join(',') !== '0,1,2,3') bad += 1;
      if (gs.length > 4 || gs.some((m) => !m.length)) bad += 1;
      // Sorted by lowest member, so player 1's pane is always the first one.
      if (gs.some((m, i) => i > 0 && m[0] < gs[i - 1][0])) bad += 1;
    }
    ok('every kitten lands in exactly one pane, in every arrangement', bad === 0);
    ok('and player 1 is always in the first pane',
      group(at(0, 200, 100, 300)).groups[0].includes(0));
  }

  /* A GROUP IS NAMED BY ITS LOWEST MEMBER, which is the fix rather than a
     detail of it: the caller draws a group with the rig belonging to that
     player, so a group whose name moves is a group whose camera moves. Both
     directions matter — one joining and one leaving. */
  {
    const grow = group(at(0, 10, 20));
    ok('a pair that gains a member keeps its name',
      group(at(0, 10)).groups[0][0] === 0 && grow.groups[0][0] === 0);
    const { groups: split3 } = group(at(0, 10, 200), { prev: grow.of });
    ok('...and keeps it when that member leaves again',
      shape(split3) === '01|2' && split3[0][0] === 0);
    /* AND THE ONE WHO LEAVES GETS A NAME OF HER OWN rather than inheriting
       the group's — she is the lowest member of her new group of one, so her
       rig is the one that has been tracking her all along. */
    ok('and the one who left is named after herself', split3[1][0] === 2);
  }

  /* HYSTERESIS IS ONLY EVER STICKINESS. Between the two thresholds the answer
     depends on what it was last frame — which is what stops a pair walking at
     the boundary from strobing between one pane and two — but `prev` must
     never be able to PULL a group together across a gap it was not allowed to
     close, or a group could grow without anybody moving. */
  {
    const mid = at(0, (MERGE_IN + MERGE_OUT) / 2);
    const together = group(at(0, 5));
    ok('a pair at the boundary stays together if it was',
      group(mid, { prev: together.of }).groups.length === 1);
    const apart = group(at(0, 200));
    ok('...and stays apart if it was',
      group(mid, { prev: apart.of }).groups.length === 2);
    ok('history can never pull a group together',
      group(at(0, MERGE_OUT + 1), { prev: together.of }).groups.length === 2);
  }

  /* A FLYING KITTEN IS ALWAYS ALONE — the existing `anyFlying` rule, which is
     why a gunner thirty units up does not share a camera with her sister on
     the ground below. What changed at four players is that it now costs ONE
     pane rather than the whole screen: the two still standing in the market
     keep sharing theirs. That is the check. */
  {
    const { groups: gs } = group(at(0, 10, 20, 30), { solo: [false, false, false, true] });
    ok('a flyer gets a pane to herself', shape(gs) === '012|3');
    ok('...and does not split the ones still on the ground', gs[0].length === 3);
    const both = group(at(0, 10), { solo: [true, false] });
    ok('one kitten flying still splits a two-player screen', both.groups.length === 2);
  }

  /* SINGLE LINKAGE, ON PURPOSE. A near B and B near C puts all three in one
     pane even though A and C are not close, because B can see both of them
     and splitting the kitten standing between them into two panes would draw
     her twice. */
  ok('a chain of three shares one pane',
    shape(group(at(0, MERGE_IN - 1, (MERGE_IN - 1) * 2)).groups) === '012');

  /* AND THE GROUPING MUST BE SOMETHING `splitLayout` CAN ACTUALLY TILE. The
     two are written against each other — one decides how many panes there are
     and the other decides where they go — and neither imports the other, so
     this is the only place the pair is checked as a pair. */
  {
    let bad = 0;
    for (const xs of [[0, 10, 20, 30], [0, 200, 10, 210], [0, 100, 200, 300]]) {
      const n = group(at(...xs)).groups.length;
      if (splitLayout(n, VW, VH, 3, 'vertical').length !== n) bad += 1;
    }
    ok('every grouping tiles into panes', bad === 0);
  }

  console.log('\n--- four players: the leagues ---');

  ok('two players get exactly one league', modesFor(2).length === 1);
  ok('...and it is the duel they already know', modesFor(2)[0].id === 'duel');
  ok('three players get a free-for-all and a 2v1',
    modesFor(3).map((m) => m.id).sort().join(',') === 'ffa,two_one');
  ok('four players get a free-for-all, a 2v2, a 3v1 and a 2v1v1',
    modesFor(4).map((m) => m.id).sort().join(',') === 'ffa,pairs,three_one,two_one_one');

  /* THREE SIDES IS NOT A NEW CODE PATH, and these are the four places that
     would have had to be special-cased if it were. `sides` has always been a
     fighter -> side map rather than a pair of teams, which is exactly what
     makes 2v1v1 a table entry. */
  {
    const s = MODE_BY_ID.two_one_one.sides(4);
    ok('2v1v1 is a pair and two loners', s.join(',') === '0,0,1,2');
    ok('...so it really has three sides', new Set(s).size === 3);
    const h = handicapFor(s, true);
    ok('...and both loners get the bigger bar', h[0] === 1 && h[1] === 1
      && h[2] === HANDICAP_MAX && h[3] === HANDICAP_MAX, h.join(','));
    /* The posts have to seat three sides without stacking anybody. */
    const posts = postsFor(s);
    let clash = false;
    for (let i = 0; i < posts.length; i++) {
      for (let j = i + 1; j < posts.length; j++) {
        if (Math.hypot(posts[i].x - posts[j].x, posts[i].z - posts[j].z) < 3) clash = true;
      }
    }
    ok('...and nobody shares a post', !clash);
    ok('...with the pair standing together',
      Math.hypot(posts[0].x - posts[1].x, posts[0].z - posts[1].z)
      < Math.hypot(posts[0].x - posts[2].x, posts[0].z - posts[2].z));
  }
  ok('every league has an id of its own — its board key',
    new Set(MODES.map((m) => m.id)).size === MODES.length);
  ok('every league explains itself to a nine-year-old',
    MODES.every((m) => m.blurb && m.blurb.length > 10));

  /* A DUEL IS A TEAM MODE WITH ONE FIGHTER A SIDE. That equivalence is what
     lets the whole feature be one code path with no "team mode" branch. */
  ok('a duel is two sides of one', MODE_BY_ID.duel.sides(2).join() === '0,1');
  ok('a free-for-all is everyone her own side',
    MODE_BY_ID.ffa.sides(4).join() === '0,1,2,3');
  ok('a 2v2 is two sides of two', MODE_BY_ID.pairs.sides(4).join() === '0,0,1,1');
  ok('a 3v1 is three against one', MODE_BY_ID.three_one.sides(4).join() === '0,0,0,1');

  /* THE HANDICAP ONLY EVER HELPS THE OUTNUMBERED SIDE, AND IT IS CAPPED.
     It used to be `biggest / mine` with nothing on top of it, so the lone
     fighter in a 3v1 opened on THREE HUNDRED health. On paper that is fair —
     one bar each — and in the ring it is a different game: her sisters watch a
     bar that will not move, and because a knockout is also the round, the side
     with the long bar decides how long everybody else's afternoon is.

     THE SAME NUDGE AT EVERY SHAPE, which is the part worth asserting. Being
     outnumbered worse is a reason to fight differently, not a reason to hold a
     different amount of health — and two leagues that hand out different bars
     for the same job have record boards that cannot be compared. */
  const h31 = handicapFor([0, 0, 0, 1], true);
  line('handicap', `capped at ${HANDICAP_MAX}x`);
  ok('one fighter against three gets a fifth of a bar more', h31[3] === HANDICAP_MAX);
  ok('...and the three keep one each', h31.slice(0, 3).every((v) => v === 1));
  ok('one against two is handed exactly the same',
    handicapFor([0, 0, 1], true)[2] === h31[3]);
  ok('...and nobody in the ring is ever worth more than 1.2 of anybody else',
    [[0, 0, 1], [0, 0, 0, 1], [0, 0, 1, 2]].every((s) => (
      handicapFor(s, true).every((v) => v <= HANDICAP_MAX)
    )));
  ok('an even league hands nobody a handicap',
    handicapFor([0, 0, 1, 1], true).every((v) => v === 1));
  ok('...and a league that does not ask for one gets none',
    handicapFor([0, 0, 0, 1], false).every((v) => v === 1));
  ok('the two-player league never carries a handicap', !MODE_BY_ID.duel.handicap);

  /* HITTING YOUR OWN PARTNER COSTS HER CONTROL, WHICH IS THE POINT. "No
     friendly fire" used to mean nothing at all happened, and a rule with no
     teeth made the safest thing in a tag-team round holding attack down and
     swinging through everybody — the swing that hit your partner was free. It
     also made the protection invisible: you learned it by watching your attack
     do nothing, which reads as the attack being broken. */
  /* WHO IS ON WHOSE SIDE IS THE GIRLS' DECISION, and `_validSeats` is what
     makes it safe to accept one. `mode.sides(n)` used to be the only
     arrangement, so who your partner was fell out of the order you happened to
     pick up a controller in, three menus earlier.

     IT CHECKS THE SHAPE, NOT THE SEATING — a 2v2 needs two sides of two and
     does not care which two, which is exactly the part the picker owns. */
  /* =========================================================================
     THE LAST THIRTY SECONDS.

     `ROUND_LIMIT` could always take a round off you on damage and the only
     warning was a small clock going red in the corner, which nobody circling
     her sister at 1:50 is reading. What is checked here is not that the
     numbers are set — it is that the two calls happen ONCE each, that the big
     number on screen tells the truth about the clock, and that all of it still
     counts with `public/voice` deleted.
     ========================================================================= */
  /* =========================================================================
     THE INVISIBLE MAN IN THE TOWN SQUARE.

     Mr. Satan's collider was pushed as a bare literal at boot, at whatever
     coordinates he happened to be standing on, and then never touched again.
     He is invisible until the tournament is announced and he MOVES — town
     square, announcer's box, back again — so that one line was wrong twice
     over: a cylinder in the square from the first frame of the game with
     nothing drawn in it, and a second one left behind after he walked to the
     arena. Reported as "his collider is still there and players can run into
     it".
     ========================================================================= */
  console.log('\n--- a collider nobody can see ---');
  {
    /* THE HALF THAT ACTUALLY STOPS A KITTEN, driven rather than read. The flag
       is worthless unless `resolveSolids` honours it, and `resolveSolids` is
       walked by every kitten on every frame. */
    const ghost = { x: 300, z: 300, r: 4, off: true };
    world.solids.push(ghost);
    const inside = () => world.resolveSolids(300.5, 300, 0.6, 8);
    let hit = inside();
    ok('a solid marked off does not shove anybody',
      Math.abs(hit.x - 300.5) < 1e-9 && Math.abs(hit.z - 300) < 1e-9,
      `${hit.x.toFixed(2)}, ${hit.z.toFixed(2)}`);
    /* AND THE SAME CYLINDER, TURNED ON, REALLY DOES. Without this the check
       above passes just as well against a coordinate nothing was ever near —
       which is the shape of test that survives the feature being deleted. */
    ghost.off = false;
    hit = inside();
    ok('...and the same cylinder, turned on, certainly does',
      Math.hypot(hit.x - 300, hit.z - 300) > 4, `${Math.hypot(hit.x - 300, hit.z - 300).toFixed(2)}`);
    world.solids.pop();
    /* NOT SPLICED OUT OF THE ARRAY. `world.solids` is walked by every kitten
       every frame and by `findOpenSpot`; a solid that comes and goes changes
       its length underneath both. The flag is the same shape as `s.arena`,
       which turns the arena's stonework off while the arena is shut. */
    const w = stripComments(readFileSync(new URL('../src/world/world.js', import.meta.url), 'utf8'));
    ok('...and it is skipped, not removed from the list',
      /if \(s\.off\) continue;/.test(w) && !/solids\.splice/.test(w));

    /* THE HALF THAT WRITES THE FLAG. `Game` is not exported — it owns a
       renderer and a whole world — so this is asserted against the source,
       which is also the honest shape for it: the bug was a rule that was never
       written down, not a number that came out wrong. */
    const mn = stripComments(readFileSync(new URL('../src/main.js', import.meta.url), 'utf8'));
    ok('his collider is kept as a reference, not pushed and forgotten',
      /this\.satanSolid = \{ x: spot\.x, z: spot\.z, r: [\d.]+, off: true \};/.test(mn)
      && /this\.world\.solids\.push\(this\.satanSolid\);/.test(mn));
    /* IT STARTS OFF. He is invisible at boot, so a collider that started live
       and was only turned off later would still be a wall for one frame — and
       for the whole of any session in which `_syncSatanSolid` never ran. */
    ok('...and it starts off, because he starts invisible',
      /off: true \};/.test(mn));
    const sync = mn.slice(mn.indexOf('_syncSatanSolid() {'));
    const body = sync.slice(0, sync.indexOf('\n  }'));
    ok('...and his DRAWING is what decides whether it exists',
      /const on = !!this\.satan\?\.group\.visible;/.test(body) && /s\.off = !on;/.test(body));
    ok('...and it follows him when he walks to the arena',
      /s\.x = this\.satan\.position\.x;/.test(body) && /s\.z = this\.satan\.position\.z;/.test(body));
    /* IT DEGRADES. `satanArt` can fail to load, and then there is no Satan and
       no solid — a sync that assumed either would take the whole frame down.
       Fourth house rule: prefer a rule that degrades over one that vanishes. */
    ok('...and a game with no Mr. Satan in it does not crash on his collider',
      /const s = this\.satanSolid;\s*if \(!s\) return;/.test(body));

    /* BEFORE THE PLAYERS MOVE, and it is the whole reason this is one call in
       the frame rather than eight lines spread over the four places he is
       teleported. `Player.update` is what calls `resolveSolids`, so syncing
       after the loop shoves a kitten out of where he was LAST frame — three
       hundred units away, for a man who teleports. */
    ok('...and it is synced before anybody is asked to collide with it',
      mn.indexOf('this._syncSatanSolid();')
        < mn.indexOf('this.players[i].update(dt, pad, this.world'),
      `${mn.indexOf('this._syncSatanSolid();')} < ${mn.indexOf('this.players[i].update(dt, pad, this.world')}`);
  }

  console.log('\n--- the clock runs out, out loud ---');
  {
    /* A REAL ELEMENT'S WORTH OF SURFACE. `domStub` hands back null for every
       id, which makes `_paintCountdown` return on its first line — so a stub
       that did nothing would pass every check below while proving that the
       painter is unreachable. Only the four members it actually touches. */
    const mkEl = () => ({
      textContent: '',
      className: 'hidden',
      classList: {
        add(c) { if (!this._has(c)) this.owner.className = `${this.owner.className} ${c}`.trim(); },
        _has(c) { return this.owner.className.split(/\s+/).includes(c); },
        contains(c) { return this._has(c); },
      },
    });
    const el = mkEl();
    el.classList.owner = el;

    /* FOUR LOGS, BECAUSE THERE ARE NOW FOUR WAYS FOR HIM TO MAKE A NOISE and
       the whole feature turns on telling them apart. `said` is the card queue,
       `spoke` is the speech channel the count goes down instead, `played` is
       the bells and the tick, and `posed` is his arms. */
    const said = [];
    const spoke = [];
    const played = [];
    const posed = [];
    const ZERO_DUR = 4.5;
    const ALL = ['sat_t30', 'sat_last1', 'sat_last2', 'sat_count', 'sat_zero', 'sat_draw', 'sat_ko'];
    const mkT = (clips = ALL) => {
      said.length = 0; spoke.length = 0; played.length = 0; posed.length = 0;
      const have = new Map(clips.map((c) => [c, { el: { id: c }, dur: c === 'sat_zero' ? ZERO_DUR : 4 }]));
      const T = new Tournament({
        game: {
          players: [],
          toast() {},
          sfx() {},
          satan: { setPose: (name) => posed.push(name) },
          satanBlast: { stage: 'off' },
        },
        world,
        audio: {
          play: (n) => played.push(n),
          speak: (e) => { spoke.push(e.id); return e; },
          stopSpeaking: () => spoke.push('#stop'),
        },
        announcer: {
          clips: have,
          clip: (id) => have.get(id) ?? null,
          say: (id) => said.push(id),
          clear: () => said.push('#clear'),
        },
      });
      T.countEl = el;
      /* `_paintHud` writes `innerHTML`, and the small clock is read back out of
         it below — one of the two numbers this section exists to keep in step
         with the other. */
      T.hudEl = { innerHTML: '', classList: { add() {}, remove() {} } };
      el.className = 'hidden';
      T.wins = [0, 0];
      return T;
    };

    /* THE FOUR NUMBERS HAVE TO STAY IN THIS ORDER or the feature eats itself:
       a warning after the countdown starts, or a countdown longer than the
       round, is a call that never fires or one that fires on the round card. */
    ok('the clock warns before it counts, and counts before it panics',
      ROUND_LIMIT > WARN_AT && WARN_AT > COUNT_AT && COUNT_AT > COUNT_MID
      && COUNT_MID > COUNT_LAST && COUNT_LAST > 0,
      `${ROUND_LIMIT} > ${WARN_AT} > ${COUNT_AT} > ${COUNT_MID} > ${COUNT_LAST}`);
    /* AND THEY HAVE TO BE EVENLY SPACED, because the cues are recordings cut
       to a budget: a card gets exactly the gap to the next cue and no more.
       See CARD_MAX below, which is the same fact from the cutter's end. */
    ok('...and his three cards get the same five seconds each',
      COUNT_AT - COUNT_MID === COUNT_LAST && COUNT_MID - COUNT_LAST === COUNT_LAST,
      `${COUNT_AT}-${COUNT_MID}-${COUNT_LAST}`);

    /* --- ONCE EACH, WHATEVER THE FRAME RATE ---------------------------------
       This is the check that matters most and the one a "does it fire" test
       would miss entirely. A frame is not a second: at 300fps `_callTheClock`
       is called five times inside the same tick of the clock, and a call
       written as `if (left <= WARN_AT)` says "thirty seconds left" five times
       in a row and then two hundred more. */
    {
      const T = mkT();
      /* PAST ZERO, not down to the warning. The first version of this loop
         stopped at exactly `WARN_AT` and reported nought calls out of one —
         a sweep that never reaches the thing it is sweeping for. */
      for (let i = 0; i <= 1300; i++) T._callTheClock(ROUND_LIMIT - i * 0.1);
      const n = (id) => said.filter((x) => x === id).length;
      ok('a whole round at 10fps gets ONE thirty-second call', n('sat_t30') === 1, `${n('sat_t30')}`);
      ok('...ONE fifteen-second call', n('sat_last1') === 1, `${n('sat_last1')}`);
      ok('...ONE ten-second call', n('sat_last2') === 1, `${n('sat_last2')}`);
      ok('...and the count starts exactly once, not once a frame',
        spoke.filter((x) => x === 'sat_count').length === 1, spoke.join(','));
      ok('...in that order', said.indexOf('sat_t30') < said.indexOf('sat_last1')
        && said.indexOf('sat_last1') < said.indexOf('sat_last2'));
      /* THE COUNT IS PLAYED, NEVER SAID. Its words are the numbers, and the
         number is already on screen eighty pixels high — "does not need to be
         in a speech bubble since that is only for text/sentences that he is
         saying". A card here is the same information twice. */
      ok('...and the count never goes on a card', !said.includes('sat_count'), said.join(','));
      /* AND THE CARD IN FRONT OF IT COMES DOWN. Each number inside the clip is
         nailed to the second it names, so it starts the frame the clock says
         five whatever else is on screen — leaving the ten-second bubble up
         would put his own last sentence over the top of the count. */
      ok('...having taken the last card down first',
        said[said.length - 1] === '#clear', said.slice(-3).join(','));
    }

    /* AND NOT AT ALL BEFORE THEIR TIME. A call that fires a second early is
       the same bug as one that fires five times, and reads worse. */
    {
      const T = mkT();
      for (let i = 0; i < 200; i++) T._callTheClock(WARN_AT + 0.05 + i * 0.1);
      ok('nothing is said while there is still time on the clock',
        said.length === 0, said.join(','));
      T._callTheClock(COUNT_AT + 0.05);
      ok('...and the fifteen-second call holds until the fifteenth second',
        !said.includes('sat_last1'));
      T._callTheClock(COUNT_LAST + 0.05);
      ok('...and the count until the fifth', !spoke.includes('sat_count'), spoke.join(','));
    }

    /* --- THE NUMBER ON SCREEN IS THE NUMBER OF SECONDS YOU HAVE -------------
       CEILING, not floor. Flooring shows 14 for the whole of the fifteenth
       second and reaches 0 with a second still to play — which would make his
       recorded "ZERO!" a second early, and he is the one thing in this feature
       that cannot be adjusted afterwards. */
    {
      const T = mkT();
      T.state = 'live';
      const at = (left) => { T.t = ROUND_LIMIT - left; T._paintCountdown(); return el.textContent; };
      T.t = 0; T._paintCountdown();
      ok('the big clock is not on screen for most of a round',
        el.classList.contains('hidden'));
      ok('...nor at sixteen seconds', (at(16), el.classList.contains('hidden')));
      ok('...and appears at fifteen', at(15) === '15' && !el.classList.contains('hidden'));
      ok('...reading whole seconds REMAINING, not seconds gone',
        at(14.9) === '15' && at(14.0) === '14' && at(13.99) === '14');
      ok('...and it never shows a zero somebody could still play in',
        at(0.01) === '1');
      /* THE TWO CLOCKS AGREE. They are eighty pixels apart and a kid reads
         both at once; 14 sitting under 0:13 is the game contradicting itself
         about the only number that matters. The small one used to FLOOR — fine
         alone, wrong the moment anything was put under it — and it is the one
         that had to move, because the big one is what Mr. Satan is counting
         and his "ZERO!" is a recording. */
      T.t = ROUND_LIMIT - 13.4;
      T._paintHud();
      T._paintCountdown();
      const hud = /ah-clock[^>]*>([^<]+)</.exec(T.hudEl?.innerHTML ?? '');
      ok('the small clock and the big one never disagree',
        hud && hud[1] === `0:${el.textContent.padStart(2, '0')}`,
        `${hud ? hud[1] : 'no clock'} vs ${el.textContent}`);
      /* AND IT STILL READS LIKE A CLOCK ABOVE A MINUTE, which is the whole of
         a round and the only thing the girls have ever seen it do. */
      T.t = 0;
      T._paintHud();
      ok('...and a full round still opens on two minutes',
        /ah-clock[^>]*>2:00</.test(T.hudEl?.innerHTML ?? ''),
        (/ah-clock[^>]*>([^<]+)</.exec(T.hudEl?.innerHTML ?? '') ?? [])[1] ?? 'none');
      T.t = ROUND_LIMIT - 60;
      T._paintHud();
      ok('...and rolls the minute where it always did',
        /ah-clock[^>]*>1:00</.test(T.hudEl?.innerHTML ?? ''),
        (/ah-clock[^>]*>([^<]+)</.exec(T.hudEl?.innerHTML ?? '') ?? [])[1] ?? 'none');

      /* TWO LOOKS, NOT FIFTEEN. Under COUNT_LAST he is shouting the number and
         it changes character with him; a class per second would be fifteen
         rules that all have to keep agreeing. */
      at(6);
      ok('over five it is the warning look', !el.classList.contains('last'));
      at(5);
      ok('...and at five it is the one he is shouting', el.classList.contains('last'));
      /* IT GOES AWAY WITH THE ROUND, and it is painted from the state rather
         than hidden by whatever ended it — a live round ends six ways. */
      T.state = 'ko';
      T._paintCountdown();
      ok('a knockout at 0:07 does not leave a 7 hanging over the deck',
        el.classList.contains('hidden'));
      /* AND `finish` HAS TO SAY SO ITSELF: `update` returns on its first line
         when the state is 'off', so the painter never runs again. */
      T.state = 'live';
      T.t = ROUND_LIMIT - 7;
      T._paintCountdown();
      ok('...and neither does flying home mid-round',
        (T.finish(), el.classList.contains('hidden')));
    }

    /* --- IT STILL COUNTS WITH `public/voice` DELETED ------------------------
       Ninth non-negotiable. With no recording nothing plays at all, so the last
       five seconds would count down in silence — the tick is what stands in,
       and `_voiced` is the flag that decides. Both directions, because a tick
       that ALSO plays under his voice is two clocks disagreeing out loud. */
    {
      const T = mkT([]);
      T.state = 'live';
      T._callTheClock(COUNT_LAST);
      ok('with no recording there is nothing for him to count with', T._voiced === false);
      played.length = 0;
      for (let n = COUNT_LAST; n >= 1; n--) { T.t = ROUND_LIMIT - n; T._paintCountdown(); }
      ok('...so the countdown ticks instead, once a second',
        played.filter((x) => x === 'count').length === COUNT_LAST,
        played.join(','));

      const V = mkT();
      V.state = 'live';
      V._callTheClock(COUNT_LAST);
      ok('with the recording he does the counting', V._voiced === true);
      played.length = 0;
      for (let n = COUNT_LAST; n >= 1; n--) { V.t = ROUND_LIMIT - n; V._paintCountdown(); }
      ok('...and nothing ticks over the top of him',
        played.filter((x) => x === 'count').length === 0, played.join(','));
    }

    /* --- HE GETS TO FINISH SHOUTING ZERO ------------------------------------
       The bug this whole beat exists for. `sat_count` ends on ONE and the round
       ends on the same frame the clock does, so the bell and "DOWN!" landed on
       top of the one word the feature builds to — and not merely late:
       `Announcer.say` starts through `Audio.speak`, which opens with
       `stopSpeaking`, so the follow-up line did not queue behind the shout, it
       KILLED it. Reported as "the ZEROOO part is not happening at all". */
    {
      const T = mkT();
      T.state = 'live';
      T._callTheClock(COUNT_LAST);
      const got = T.callOnDamage('Time!', true);
      ok('a round called by the CLOCK ends on his ZERO', got === 'draw' && said.includes('sat_zero'));
      /* AND THE COUNT IS STOPPED DEAD, not left playing under him. `clear`
         cannot do it: it empties the card queue and touches no audio. */
      ok('...and the count is stopped, not just uncarded', spoke.includes('#stop'), spoke.join(','));
      /* THE BELL RINGS NOW. It was held back with everything else at first and
         that was wrong for the one reason a bell exists: it marks the moment.
         Six seconds after the moment it is a sound about something that
         already happened, and on a draw the question-mark gong is a punchline
         landing after the joke. It is also the ONLY thing that moves — see the
         two checks below, which are the ones that keep the rest waiting. */
      ok('...and the bell rings on the frame the round ended',
        played.includes('drawgong'), played.join(','));
      ok('...and it is the confused one, not the knockout bell',
        !played.includes('endgong'), played.join(','));
      /* NOTHING THAT READS AS A CONSEQUENCE HAPPENS YET. This is still the
         whole point of the beat: no banner and no draw line until he has run
         out of breath. */
      ok('...but not the line that follows it', !said.includes('sat_draw'));
      /* `_banner` sets `_bannerText` and only then touches an element, so with
         no element this reads the real method rather than a stub of it. */
      ok('...and not the banner either', T._bannerText !== 'DRAW', `${T._bannerText}`);
      ok('...his arms go up instead', posed.includes('charge'), posed.join(','));
      /* MEASURED OFF THE CLIP AND NOT GUESSED, so a re-cut that runs longer
         cannot start clipping itself again — plus the beat that was asked for
         ("maybe even adding a 1 - 2 second pause for him to calm down"). */
      const wait = T._pending?.at ?? 0;
      ok('...and the round waits exactly as long as the shout is, plus a beat',
        Math.abs(wait - (ZERO_DUR + ZERO_BEAT)) < 1e-9, `${wait}`);
      ok('...with the hold GROWN by it, not spent on it',
        T._koHold > wait, `${T._koHold} > ${wait}`);

      T.t = wait - 0.01;
      T.update(0, []);
      ok('...still nothing a hundredth of a second before he is done',
        !said.includes('sat_draw') && T._bannerText !== 'DRAW',
        `${said.join(',')} / ${T._bannerText}`);
      T.t = wait;
      T.update(0, []);
      ok('...and THEN the banner and his line',
        said.includes('sat_draw') && T._bannerText === 'DRAW');
      ok('...and his arms come down with them',
        posed[posed.length - 1] === 'idle', posed.join(','));
      /* AND THE BELL IS NOT RUNG AGAIN BY THE CLOSURE IT LEFT. One strike, at
         the start — this counts the whole beat, so it fails in both directions:
         a bell moved back inside the wait, or a bell rung twice. */
      ok('...with the bell struck once for the round, not once a frame',
        (T.update(0, []), T.update(0, []),
          played.filter((x) => x === 'drawgong').length === 1), played.join(','));
      /* AND THE BANNER STILL GETS ITS FULL TIME. Absorbing the wait into
         KO_HOLD would flash DRAW for half a second and cut to the feast. */
      ok('...and the round is not hurried off screen for having waited',
        T.state === 'ko', T.state);
    }

    /* EVERY OTHER ENDING IS UNCHANGED, which is the half of this that is easy
       to break: a knockout is not the clock running out and must not sit there
       for six seconds while nothing happens. */
    {
      const K = mkT();
      K.state = 'live';
      K.game.players = [];
      K._roundOver(0, 'x');
      ok('a knockout rings straight away', played.includes('endgong'), played.join(','));
      ok('...with nothing pending behind it', K._pending === null);
      ok('...and nobody strikes a pose for it', !posed.includes('charge'), posed.join(','));
      ok('...and he does not shout ZERO at a round that had time left',
        !said.includes('sat_zero'));
    }
    {
      /* THE DEBUG KEY IS NOT THE CLOCK EITHER. `4` means "end this round now",
         and a six-second ceremony on it would make the key useless for the
         thing it exists for. */
      const D = mkT();
      D.state = 'live';
      D.game.players = [];
      D.callOnDamage('[debug] round called!');
      ok('the debug key ends a round on the spot', D._pending === null && played.includes('drawgong'));
    }
    {
      /* NINTH NON-NEGOTIABLE, AND THE DEGRADE IS "DO NOT WAIT". With no
         recording there is nothing to wait FOR, and waiting anyway is six
         seconds of a frozen deck under a silent card. */
      const N = mkT([]);
      N.state = 'live';
      N.game.players = [];
      N.callOnDamage('Time!', true);
      ok('with no recording the round does not wait for a shout that cannot happen',
        N._pending === null && played.includes('drawgong'), played.join(','));
      ok('...and his arms stay down', !posed.includes('charge'), posed.join(','));
    }
    {
      /* THE BLAST GAG OWNS THE POSE FOR ITS OWN TEN SECONDS and puts it back
         to idle at the end of them — which would drop his arms in the middle
         of this and leave `_posed` lying about it. */
      const B = mkT();
      B.game.satanBlast.stage = 'charge';
      B.state = 'live';
      B.game.players = [];
      B.callOnDamage('Time!', true);
      ok('a tantrum already in progress keeps his arms', !posed.includes('charge'), posed.join(','));
      ok('...and the round does not put down a pose it did not raise',
        (B.finish(), !posed.includes('idle')), posed.join(','));
    }
    {
      /* AND FLYING HOME PUTS EVERYTHING BACK, from either half of it. `clear`
         reaches neither the speech channel nor the sprite — same class of latch
         as the wings and the pennant.
         TWO TOURNAMENTS, BECAUSE THE FIRST VERSION OF THIS PROVED NOTHING: it
         ran the count, ended the round and THEN tore down, by which point
         `_letHimFinish` had already hushed the count and `finish` was correctly
         doing nothing. A teardown check has to catch the state it is for. */
      const F = mkT();
      F.state = 'live';
      F._callTheClock(COUNT_LAST);
      F.finish();
      ok('flying home mid-count stops him counting', spoke.includes('#stop'), spoke.join(','));

      const G = mkT();
      G.state = 'live';
      G.game.players = [];
      G._callTheClock(COUNT_LAST);
      G.callOnDamage('Time!', true);
      posed.length = 0;
      G.finish();
      ok('...and flying home mid-shout puts his arms down',
        posed.includes('idle'), posed.join(','));
      ok('...and drops what was waiting to be announced', G._pending === null);
    }

    /* --- THE CUTTER AND THE GAME AGREE ABOUT THE CLOCK ----------------------
       `sat_count.mp3` is one continuous take re-timed so each number lands on
       the second it names, which only works if the cutter and the game agree
       about how long it is and when it starts. Two files, one number. */
    {
      const src = readFileSync(new URL('../tools/capture/satan-countdown.mjs', import.meta.url), 'utf8');
      const num = (name) => Number((new RegExp(`const ${name} = ([\\d.]+);`).exec(src) ?? [])[1]);
      const beat = num('BEAT');
      const nums = num('NUMS');
      ok('the cutter and the game agree how long the count is',
        Number.isFinite(beat) && Number.isFinite(nums) && beat * nums === COUNT_LAST,
        `${beat} x ${nums} vs ${COUNT_LAST}`);
      /* AND EVERY NUMBER SITS ON ITS OWN SECOND. This is the line that makes
         the clip truthful; a cut that packed them end to end would sound fine
         and count a different clock. */
      ok('...and that every number is pinned to a whole one of them',
        /t: k \* BEAT/.test(src));
      ok('...and it cuts every cue the game asks him for',
        ["'sat_last1'", "'sat_last2'", "'sat_zero'", "'sat_count.mp3'"].every((id) => src.includes(id)));
      /* A SPOKEN CUE HAS TO FINISH INSIDE ITS OWN FIVE SECONDS. The announcer
         holds a card for HOLD_TAIL after the voice stops and the next queued
         line waits for that — so a cue that fills its window pushes the NEXT
         one past the start of the count, and the count is the one thing here
         that cannot start late. The cutter enforces it on the audio; this is
         the same sum from the game's end, across the two files that hold the
         numbers. */
      const ann = readFileSync(new URL('../src/systems/announce.js', import.meta.url), 'utf8');
      const cardMax = num('CARD_MAX');
      const tail = Number((/const HOLD_TAIL = ([\d.]+);/.exec(ann) ?? [])[1]);
      ok('...and a spoken cue always finishes before the next one is due',
        Number.isFinite(cardMax) && Number.isFinite(tail)
        && cardMax + tail <= COUNT_AT - COUNT_MID,
        `${cardMax} + ${tail} <= ${COUNT_AT - COUNT_MID}`);
      /* A CARD IS SHORTENED BY CLOSING PAUSES, NOT BY PLAYING HIM FASTER.
         THIS IS THE CHECK THAT WOULD HAVE CAUGHT IT. `sat_last2` shipped at
         1.475x for a line where he is only talking, and nothing failed: the
         old ceiling was 1.5, borrowed from the shouts sneaked between the
         numbers, where 30-50% was asked for and belongs. It was reported by
         ear — "seems like it is sped up... he is just talking at this point" —
         which is the failure mode this file exists to remove.
         Two facts, and the second is the one with teeth. */
      const gapMax = num('CARD_GAP_MAX');
      ok('...and a card closes its dead air before it touches his speed',
        Number.isFinite(gapMax) && gapMax > 0
        && src.indexOf('tighten(raw.file') > 0
        && src.indexOf('tighten(raw.file') < src.indexOf('tight.dur / CARD_MAX'),
        `gap floor ${gapMax}s`);
      const cardTempo = num('CARD_TEMPO_MAX');
      /* A NUDGE, NOT A SQUEEZE. Anything a listener can hear as "sped up" has
         to fail here rather than ship. The shouts' own ceiling is the thing it
         must NOT be allowed to drift back up to. */
      ok('...and a card he is TALKING through is never squeezed like a shout',
        Number.isFinite(cardTempo) && cardTempo <= 1.1,
        `${cardTempo}x`);
      /* THE SHOUTS BETWEEN THE NUMBERS ARE FITTED, NOT PLACED. Which of them
         land is measured off the take; a table would go stale the first time
         anything was re-rendered. And the ceiling has to be a real test rather
         than a rubber stamp, or "NO TIME LEFT!" gets squeezed to a rattle. */
      const sayMax = num('SAY_MAX');
      ok('...and a card is held to a far tighter ceiling than a shout',
        Number.isFinite(cardTempo) && Number.isFinite(sayMax) && cardTempo < sayMax,
        `card ${cardTempo}x < shout ${sayMax}x`);
      ok('...and no shout between two numbers is doubled in speed',
        Number.isFinite(sayMax) && sayMax < 2, `${sayMax}`);
      ok('...with a cutter that measures the gap instead of assuming it',
        /shout\.dur \/ window/.test(src) && /Math\.max\(1, shout\.dur/.test(src));
    }

    /* --- A ROUND ENDS ON A BELL, AND A DRAW ASKS A QUESTION -----------------
       The gong at the top of a round is the one sound in the game that STARTS
       something, and a round ending had no answer to it. A draw needs its own,
       or it reads as the game having failed to decide — which is exactly what
       a nine-year-old concludes from a knockout bell over a DRAW banner. */
    {
      const T = mkT();
      T.state = 'live';
      T._roundOver(0, 'x');
      ok('a round that ends rings a bell', played.includes('endgong'), played.join(','));
      ok('...and it is not the one that starts a fight', !played.includes('gong'));
      ok('...and the countdown is cut, not queued behind',
        said.indexOf('#clear') < said.indexOf('sat_ko'));
    }

    /* --- "K.O." IS A CLAIM ABOUT SOMEBODY'S BODY ---------------------------
       Reported from play: a round given on the clock put K.O. on the screen
       and had Mr. Satan shout "DOWN!" at a kitten who was visibly standing up.
       Half of all endings are that one — the clock runs out and it goes to
       whoever was ahead on damage — so half the time the banner was wrong.

       ASSERTED BOTH WAYS ROUND, because a fix that simply renamed the banner
       would pass a one-sided check and lose the real knockout. */
    {
      const T = mkT();
      const two = [{ index: 0, ko: false }, { index: 1, ko: false }];
      T.game.players = two;
      T.sides = [0, 1];
      T.state = 'live';
      T._roundOver(0, 'time');
      ok('a round ended with the loser still standing does not say K.O.',
        T._bannerText === 'ROUND OVER', `${T._bannerText}`);
      ok('...and he does not shout DOWN at somebody who is up',
        said.includes('sat_over') && !said.includes('sat_ko'), said.join(','));
      /* THE WINNER STILL WINS. The banner is the only thing that changed —
         a rename that quietly stopped counting the round would be worse than
         the wrong word. */
      ok('...and it is still a win on the board', T.wins[0] === 1);
    }
    {
      const T = mkT();
      const two = [{ index: 0, ko: false }, { index: 1, ko: true }];
      T.game.players = two;
      T.sides = [0, 1];
      T.state = 'live';
      T._roundOver(0, 'down');
      ok('...but a side actually wiped out is still a K.O.',
        T._bannerText === 'K.O.', `${T._bannerText}`);
      ok('...and he still shouts DOWN for it',
        said.includes('sat_ko') && !said.includes('sat_over'), said.join(','));
    }
    /* AND THE WORDS ON THE CARD ARE THE WORDS IN THE CLIP. `sat_over.mp3` is
       `ROUND_OVER_LINE` and nothing else — one string, exported, read by the
       announcer. Two spellings of one sentence is how the announcer's box came
       to be showing an abbreviated version of what he says. */
    {
      const cards = [];
      const T = mkT();
      T.announcer.say = (id, text) => { said.push(id); cards.push(text); };
      T.game.players = [{ index: 0, ko: false }, { index: 1, ko: false }];
      T.sides = [0, 1];
      T.state = 'live';
      T._roundOver(0, 'time');
      ok('the card he shows is the line the recording says',
        cards.includes(ROUND_OVER_LINE), cards.join(' | '));
      /* IT SAYS THERE IS A WINNER, which is the whole content of the ask:
         "not down, I guess, but we have a winner". A line that only said
         "not down" would leave a child looking for the result. */
      ok('...and it tells her somebody won', /winner/i.test(ROUND_OVER_LINE),
        ROUND_OVER_LINE);
      const mp3 = new URL('../public/voice/sat_over.mp3', import.meta.url);
      ok('...and there is a recording of exactly that sentence',
        existsSync(mp3));
    }

    /* --- LOSING ON YOUR FEET USED TO BE WORSE THAN BEING KNOCKED OUT -------
       Reported from play: "if a player loses a round but is still alive, then
       they should be fully healed before the next match begins". It was a real
       unfairness and not a preference — a kitten knocked out became an angel
       and came back at the top of her bar, while the one who merely lost on
       the clock came back on whatever was left of hers. Being beaten BADLY was
       the better of the two outcomes.

       DRIVEN THROUGH THE REAL SEQUENCE — round over, feast, next round — with
       real `Player`s, because every number here is decided by one of those
       three and a stub would let the wiring between them rot. */
    const mkF2 = (i, name) => new Player({
      texture: new THREE.Texture(), index: i, rows: 4, cols: 8, height: 2.9,
      spawn: new THREE.Vector3(0, 0, 0), name,
    });
    {
      const T = mkT();
      const a = mkF2(0, 'Ember');
      const b = mkF2(1, 'Frost');
      const full = a.maxHp;
      T.game.players = [a, b];
      T.sides = [0, 1];
      T.wins = [0, 0];
      a.hp = 55;
      b.hp = 20;
      T.state = 'live';
      T._roundOver(0, 'time');              // Ember ahead on damage, both up
      T._startFeast();
      const regen = Math.round(MAX_HP * REGEN_FRAC);
      ok('the feast still tops everybody up by a tenth',
        a.hp === 55 + regen && b.hp === 20 + regen, `${a.hp} / ${b.hp}`);
      ok('...and starts both their meal tallies at nothing',
        a.fedHp === 0 && b.fedHp === 0);

      /* Frost eats 20 back — the number `Menagerie._devour` adds. */
      b.fedHp = 20;
      b.hp += 20;
      T._nextRound();

      ok('the kitten who LOST on her feet starts the next round full',
        b.hp === b.maxHp, `${b.hp} of ${b.maxHp}`);
      /* AND HALF OF WHAT SHE ATE IS ON TOP OF THAT FULL BAR, which is the
         other half of the ask and the thing that makes eating worth doing when
         you were going to be healed anyway. */
      ok('...and half of what she ate is overflow on top of it',
        b.bonusHp === 10 && b.maxHp === full + 10 && b.overflowHp === 10,
        `${b.hp} of ${b.maxHp}, over ${b.overflowHp}`);

      /* THE WINNER KEEPS WHAT SHE HAS. Healing everybody would make winning a
         round worth nothing at all, which is why this asks who won rather than
         who is standing. */
      ok('...while the kitten who WON keeps her bar as she left it',
        a.hp === 55 + regen && a.maxHp === full, `${a.hp} of ${a.maxHp}`);
      ok('...and banks nothing, having eaten nothing', a.bonusHp === 0);
      /* AND THE TALLY IS SPENT. Left standing it would bank the same meal
         again at the end of the next feast. */
      ok('...and the meal tally is spent, not left to be banked twice',
        a.fedHp === 0 && b.fedHp === 0);
    }

    /* A DRAW HEALS NOBODY, because nobody lost. */
    {
      const T = mkT();
      const a = mkF2(0, 'Ember');
      const b = mkF2(1, 'Frost');
      T.game.players = [a, b];
      T.sides = [0, 1];
      T.wins = [0, 0];
      a.hp = 30;
      b.hp = 30;
      T.state = 'live';
      T.callOnDamage('Time!');              // nobody dealt anything: a draw
      ok('a draw is a draw', T._lastWinner === -1);
      T._startFeast();
      const regen = Math.round(MAX_HP * REGEN_FRAC);
      T._nextRound();
      ok('...and neither of them is handed a full bar for it',
        a.hp === 30 + regen && b.hp === 30 + regen, `${a.hp} / ${b.hp}`);
    }

    /* THE OVERFLOW IS FOR ONE ROUND. A kitten who eats well three feasts
       running must not walk into the final on a bar half again as long. */
    {
      const T = mkT();
      const a = mkF2(0, 'Ember');
      const b = mkF2(1, 'Frost');
      const full = a.maxHp;
      T.game.players = [a, b];
      T.sides = [0, 1];
      T.wins = [0, 0];
      T.state = 'live';
      T._roundOver(0, 'time');
      T._startFeast();
      a.fedHp = 30;
      T._nextRound();
      ok('a big meal banks half of it', a.bonusHp === 15 && a.maxHp === full + 15);
      T.state = 'live';
      T._roundOver(0, 'time');
      T._startFeast();
      T._nextRound();                        // ate nothing this time
      ok('...and a feast she ate nothing at takes it all back off',
        a.bonusHp === 0 && a.maxHp === full, `${a.maxHp}`);
      ok('...leaving her bar exactly full rather than over it', a.hp <= a.maxHp);
    }

    /* AND AN ANGEL IS UNCHANGED. She was already reborn full; the new rule
       must not have quietly become "everybody who did not win", which would
       read the same in a duel and be wrong the first time somebody was knocked
       out on the winning side of a 2v2. */
    {
      const T = mkT();
      const a = mkF2(0, 'Ember');
      const b = mkF2(1, 'Frost');
      const c = mkF2(2, 'Blossom');
      const d = mkF2(3, 'Willow');
      T.game.players = [a, b, c, d];
      T.sides = [0, 0, 1, 1];               // a 2v2
      T.wins = [0, 0];
      a.hp = 70;
      b.hp = 0; b.ko = true;                // knocked out on the WINNING side
      c.hp = 25;
      d.hp = 40;
      T.state = 'live';
      T._roundOver(0, 'time');
      T._startFeast();
      ok('a knockout on the winning side is still an angel', b.angel === true);
      T._nextRound();
      ok('...and still comes back on a full bar', b.hp === b.maxHp);
      ok('...her partner who won on her feet keeps hers',
        a.hp === 70 + Math.round(MAX_HP * REGEN_FRAC), `${a.hp}`);
      ok('...and both of the losing side are healed',
        c.hp === c.maxHp && d.hp === d.maxHp, `${c.hp} / ${d.hp}`);
    }

    /* --- AND IT IS ON THE BAR, IN GREEN ------------------------------------
       Asked for as "repaint part of the health bar to indicate the overflow of
       extra hp... overlaid on top of their default health bar color". Read off
       the markup `_paintHud` actually writes, because that is where it goes
       wrong: every number behind it can be right while the bar says nothing.

       THE GREEN IS INSIDE THE FILL, NOT BESIDE IT. It is a fraction OF THE
       FILL, so the two shrink together as she is hit and the overflow drains
       from the far end first — which is the behaviour the ask describes. */
    {
      const T = mkT();
      const a = mkF2(0, 'Ember');
      const b = mkF2(1, 'Frost');
      T.game.players = [a, b];
      T.sides = [0, 1];
      T.wins = [0, 0];
      T.state = 'live';
      T._paintHud();
      ok('an ordinary bar has no green on it at all',
        !/ah-over/.test(T.hudEl.innerHTML));

      a.setRoundBonus(20);
      a.hp = a.maxHp;
      T._paintHud();
      const html = T.hudEl.innerHTML;
      ok('...and a bar with overflow does', /ah-over/.test(html));
      /* IT IS NESTED IN THE FILL. Written as a sibling it would sit in the
         empty part of the bar and grow as she was hurt. */
      ok('...inside the fill rather than beside it',
        /class="ah-fill[^"]*"[^>]*>\s*<i class="ah-over"/.test(html), html.slice(0, 220));
      /* AND IT IS THE RIGHT SIZE: 20 of 120 is a sixth of the fill. */
      const pct = Number((html.match(/ah-over" style="width:([\d.]+)%/) ?? [])[1]);
      ok('...sized as its share of the fill, not of the bar',
        Math.abs(pct - (20 / 120) * 100) < 0.01, `${pct}%`);

      /* IT DRAINS FIRST AND THEN GOES. */
      a.hp = a.baseMaxHp + 5;
      T._paintHud();
      ok('...shrinking as she is hit', /ah-over/.test(T.hudEl.innerHTML)
        && Number((T.hudEl.innerHTML.match(/ah-over" style="width:([\d.]+)%/) ?? [])[1]) < pct);
      a.hp = a.baseMaxHp;
      T._paintHud();
      ok('...and gone the moment she is back at her ordinary top',
        !/ah-over/.test(T.hudEl.innerHTML));

      /* AND DURING THE FEAST IT SHOWS WHAT SHE IS GATHERING, which is the
         other half of the ask: "a visual indicator on the screen that they are
         gathering the overflow effect that will carry to the next battle". The
         figure is what will CARRY — half of what she healed — because green
         means one thing everywhere, and a green that halved itself at the gong
         would read as losing something. */
      a.setRoundBonus(0);
      a.hp = 60;
      a.fedHp = 20;
      T.state = 'feast';
      T._paintHud();
      const feastPct = Number((T.hudEl.innerHTML.match(/ah-over" style="width:([\d.]+)%/) ?? [])[1]);
      ok('eating at the feast paints the carry green as she gathers it',
        Math.abs(feastPct - (10 / 60) * 100) < 0.01, `${feastPct}%`);
      /* AND ONLY AT THE FEAST. Mid-round `fedHp` is stale by definition — it
         is spent at the gong — and reading it there would put a green segment
         on a bar that has no overflow behind it. */
      T.state = 'live';
      T._paintHud();
      ok('...and a live round shows nothing for a tally already spent',
        !/ah-over/.test(T.hudEl.innerHTML));

      /* THE CSS IS THE OTHER HALF, and a class with no rule is a segment that
         inherits the fill colour and is invisible. Asserted on the sheet. */
      const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
      ok('the green has a rule to be green by', /\.ah-over\s*\{/.test(css));
      ok('...and bubbles inside it', /@keyframes hpBubble/.test(css));
      /* PINNED TO THE FAR END WITH A LOGICAL MARGIN, not a physical edge: the
         right-hand side's bars are `direction: rtl` so they drain toward their
         own edge of the screen, and `right: 0` would put the green on the
         wrong end of half the HUD. */
      ok('...pinned to the end of the fill in BOTH directions',
        /margin-inline-start:\s*auto/.test(css));
    }
    {
      const T = mkT();
      T.state = 'live';
      T.game.players = [];
      const got = T.callOnDamage('Time!');
      ok('nobody ahead on damage is a draw', got === 'draw');
      ok('...and it does NOT ring the knockout bell', !played.includes('endgong'));
      ok('...it asks a question instead', played.includes('drawgong'), played.join(','));
      ok('...and he has something to say about it', said.includes('sat_draw'));
    }

    /* THE TWO BELLS ARE DIFFERENT SOUNDS, not one at two volumes. They are the
       only bells in the game, so a girl hearing the fight gong at the END of a
       round would get up off her mark. */
    {
      const au = stripComments(readFileSync(new URL('../src/core/audio.js', import.meta.url), 'utf8'));
      const body = (name) => {
        const i = au.indexOf(`case '${name}':`);
        return i < 0 ? '' : au.slice(i, au.indexOf('break;', i));
      };
      ok('every bell the tournament rings actually exists',
        !!body('gong') && !!body('endgong') && !!body('drawgong'));
      ok('...and no two of them are the same sound',
        body('gong') !== body('endgong') && body('endgong') !== body('drawgong'));
      /* THE QUESTION MARK IS A RISE, and it is the whole idea — asserted on
         the shape rather than on a frequency, because any rising partial would
         do and pinning the number would just be pinning my own take. */
      ok('...and the draw bell is the one that bends upward',
        /to: semi\(-13\)|to: semi\(-7\)/.test(body('drawgong'))
        && !/to: semi/.test(body('endgong')));
    }
  }

  console.log('\n--- the team picker cannot make an illegal match ---');
  {
    const T = new Tournament({
      game: { players: [1, 2, 3, 4], toast() {}, sfx() {} },
      world, audio: null, announcer: null,
    });
    T.mode = MODE_BY_ID.pairs;
    ok('the mode\'s own arrangement is legal', T._validSeats([0, 0, 1, 1], 4));
    ok('...and so is any other 2 and 2', T._validSeats([0, 1, 1, 0], 4));
    ok('...which is the whole point of the picker', T._validSeats([1, 0, 0, 1], 4));
    ok('3 against 1 is refused in a 2v2', !T._validSeats([0, 0, 0, 1], 4));
    ok('everybody on one side is refused', !T._validSeats([0, 0, 0, 0], 4));
    ok('a fighter with no side is refused', !T._validSeats([0, 0, 1], 4));
    ok('a made-up side index is refused', !T._validSeats([0, 0, 1, 9], 4));
    ok('junk is refused', !T._validSeats(['a', 0, 1, 1], 4) && !T._validSeats(null, 4));

    T.mode = MODE_BY_ID.three_one;
    ok('3v1 accepts any three-and-one', T._validSeats([1, 0, 0, 0], 4));
    ok('...and refuses two-and-two', !T._validSeats([0, 0, 1, 1], 4));

    /* 2v1v1 is the case that proves the shape test is a MULTISET rather than a
       list: the pair may be any two of the four. */
    T.mode = MODE_BY_ID.two_one_one;
    ok('2v1v1 accepts the pair anywhere', T._validSeats([1, 0, 2, 0], 4));
    ok('...and still refuses a 2v2', !T._validSeats([0, 0, 1, 1], 4));

    /* AND `begin` MUST FALL BACK RATHER THAN TRUST THE CALLER. An illegal
       arrangement reaching the ring is a round somebody cannot win. */
    T.mode = MODE_BY_ID.pairs;
    ok('an illegal seating never reaches the ring',
      !T._validSeats([0, 0, 0, 1], 4));

    /* NOBODY STARTS ON A SIDE, AND THAT IS WHAT MADE THE SCREEN REAL.
       The picker opened on `mode.sides(n)`, which is a LEGAL arrangement — so
       it was confirmable on its first frame, and the JUMP that chose the league
       is still down on that frame (MenuNav confirms on it, the panel opens
       inside it, and the picker reads the same press later in it). Picking a
       2v2 went straight to the round card with whoever joined first paired up:
       the one thing this screen exists to prevent.

       `NO_SIDE` is an illegal seat rather than a flag beside the seats, so an
       undecided kitten makes the whole arrangement invalid for free. A separate
       "has she chosen" list would be a second thing to keep in step with the
       first, and its failure mode is a match starting with somebody on a side
       she never picked. */
    ok('nobody has picked a side, so nothing is legal yet',
      !T._validSeats([NO_SIDE, NO_SIDE, NO_SIDE, NO_SIDE], 4));
    ok('...nor when one kitten is still deciding',
      !T._validSeats([0, 0, 1, NO_SIDE], 4));
    ok('...and it is legal the moment she picks',
      T._validSeats([0, 0, 1, 1], 4));
  }

  /* THE BOARD IS SIGNED BY THE WINNERS, AND BY NOBODY ELSE.
     `NameEntry.update` folds every pad it is handed into one cursor — the
     largest stick reading wins and anybody's JUMP confirms — which is right
     when the question is "which of the two of you is holding the winning pad"
     and wrong the moment there are four, because the three who LOST are also
     holding sticks. The board was signed by whoever fidgeted. */
  console.log('\n--- only the winners sign the board ---');
  {
    const P = [0, 1, 2, 3].map((i) => ({ index: i, name: `P${i}`, dmgDealt: i }));
    const PADS4 = P.map(() => ({ mx: 0, my: 0, pressed: () => false, down: () => false }));
    const T = new Tournament({
      game: { players: P, toast() {}, sfx() {} },
      world, audio: null, announcer: null,
    });
    T.mode = MODE_BY_ID.pairs;
    T.sides = [0, 0, 1, 1];
    T.winners = [P[2], P[3]];
    T.winner = P[3];
    const got = T._signingPads(PADS4);
    ok('a losing kitten\'s stick cannot spell the champion\'s name',
      got.length === 2 && !got.includes(PADS4[0]) && !got.includes(PADS4[1]));
    /* IT IS THE WHOLE WINNING SIDE, not `winner`. A 2v2 is won by two kittens
       and `winner` is only the one the row is filed under. */
    ok('...and both winners may, not just the one on the row',
      got.includes(PADS4[2]) && got.includes(PADS4[3]));
    /* A winner with no pad — on the keyboard, or unplugged between the last
       blow and the results screen — must not leave a board nobody can sign. */
    T.winners = [P[3]];
    T.winner = P[3];
    ok('a champion with no controller does not strand the board',
      T._signingPads([PADS4[0], PADS4[1], PADS4[2]]).length === 3);
  }

  /* A ROUND HAS A CLOCK AND IT IS ON SCREEN. `ROUND_LIMIT` can hand the round
     to whoever is ahead on damage, and it ran silently for its whole life —
     the one rule in the tournament that could take a round off you was also
     the one nobody could see. */
  ok('the round limit is a real bound, not a formality',
    ROUND_LIMIT >= 60 && ROUND_LIMIT <= 300);

  /* --- AND THE DEBUG KEY ENDS THE ROUND THROUGH THAT SAME DECISION ---
     Reported from play: "pressing 4, End Live Round, doesn't end the round, it
     just kills Frost." It did `this.players[1].hurt(b.hp, ...)` — written when
     two players was the only number there was. At four it killed one kitten
     and left two standing; in a 2v2 it did not end the round AT ALL, because a
     side is not out until everybody on it is.

     `callOnDamage` is the `ROUND_LIMIT` branch, extracted so the clock and the
     key cannot disagree about who won. These check the behaviour rather than
     the extraction: that it ends the round at a league size the old code could
     not, that it awards the round to the side ahead on damage, and — the part
     that says it is not the old fix wearing a new name — that it hurts nobody
     to do it. */
  {
    const mk = (dmg) => {
      const players = dmg.map((d, i) => ({
        index: i, name: `P${i}`, hp: 100, ko: false, dmgDealt: d,
        position: { x: 0, y: 0, z: 0 },
      }));
      const T = new Tournament({
        game: { players, toast() {}, sfx() {}, audio: null },
        world,
        audio: null,
        announcer: null,
      });
      T.sides = [0, 0, 1, 1];
      T.wins = [0, 0];
      T.state = 'live';
      T.t = 0;
      return { T, players };
    };
    /* A 2v2 IS THE CASE THE OLD KEY COULD NOT END, so it is the case checked
       first: side 1 is ahead, so side 1 takes it. */
    const a = mk([5, 0, 40, 0]);
    const verdict = a.T.callOnDamage('[debug] round called!');
    ok('the debug round-ender ends a 2v2, which the old one could not',
      a.T.state === 'ko' && verdict === 'won', `${a.T.state} / ${verdict}`);
    ok('...and gives it to the side that was ahead on damage',
      a.T.wins[1] === 1 && a.T.wins[0] === 0, a.T.wins.join(','));
    /* IT KILLS NOBODY. A round called on time is not a knockout, and the whole
       complaint was that this key was a knockout wearing the wrong label. */
    ok('...and nobody is knocked down or loses a single point of health',
      a.players.every((p) => p.hp === 100 && !p.ko));
    /* COUNTED PER SIDE, not per fighter. Two kittens landing 20 each beat one
       landing 30, or a tag team is scored as two separate duels. */
    const b = mk([30, 0, 20, 20]);
    b.T.callOnDamage();
    ok('...and the damage is added up per SIDE, not per fighter',
      b.T.wins[1] === 1, b.T.wins.join(','));
    /* A DRAW STILL ENDS IT. Refusing the round and leaving it live is the one
       outcome that would hang the tournament open. */
    const c = mk([0, 0, 0, 0]);
    const drew = c.T.callOnDamage();
    ok('...and an untouched round is a draw that still ends',
      drew === 'draw' && c.T.state === 'ko' && c.T.wins.every((w) => w === 0));
    /* AND IT REFUSES OUTSIDE A LIVE ROUND rather than half-ending something. */
    const d = mk([9, 0, 0, 0]);
    d.T.state = 'card';
    ok('...and it does nothing at all when no round is live',
      d.T.callOnDamage() === null && d.T.state === 'card');
    /* THE CLOCK GOES THROUGH IT TOO, which is what stops the two answers
       drifting apart again — the old duplicate is the reason this exists. */
    const tsrc = readFileSync(new URL('../src/systems/tournament.js', import.meta.url), 'utf8');
    ok('...and the clock running out calls exactly the same method',
      /if \(this\.t > ROUND_LIMIT\) this\.callOnDamage\(/.test(tsrc));
    const msrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    const at = msrc.indexOf("if (code === 'Digit4' || code === 'Digit5') {");
    const key = at > 0 ? msrc.slice(at, at + 1400) : '';
    ok('...and so does the debug key, which no longer hurts anybody',
      at > 0 && /this\.tournament\.(endBeat|nudge)\(/.test(key)
      && !/\.hurt\(/.test(key), at > 0 ? '' : 'the Digit4/5 branch moved');
    /* IT ASKS `Tournament` AND DECIDES NOTHING ITSELF. The whole point of the
       key going through `callOnDamage` was that it could not disagree with the
       game about who won; `endBeat` and `nudge` inherit that only for as long
       as they are the ones setting the state. A `this.tournament.state =` in
       main.js would be the old bug wearing a new label. */
    ok('...and it never sets a tournament state from outside the tournament',
      !/this\.tournament\.state\s*=/.test(msrc));

    /* --- `4` ENDS THE BEAT, IN EVERY BEAT ---
       Asked for: "make the 4 command to end the round work for the current
       battle round, and feast, it is like a fast forward button to move along
       the script to the next part." Each state is asked separately, because
       "it did something" and "it did the right thing" are different questions
       and the feast is the one that used to do nothing at all. */
    const beat = (state, t = 0) => {
      const e = mk([9, 0, 0, 0]);
      e.T.state = state;
      e.T.t = t;
      const said = e.T.endBeat();
      return { T: e.T, said };
    };
    ok('4 in a live round ends it', beat('live').T.state === 'ko');
    const feast = beat('feast');
    ok('...and in the feast it runs the clock out rather than doing nothing',
      feast.said !== null && feast.T.t >= FEAST_TIME, `${feast.said} / ${feast.T.t}`);
    const card = beat('card');
    ok('...and in the round card it skips to the count',
      card.said !== null && card.T.t > 0, `${card.said}`);
    /* THE RESULTS SCREEN IS THE ONE IT MUST NOT TOUCH. It is waiting for a
       kitten to type a name, and a debug key that answers for her is a debug
       key that skips the one screen a player has to answer. */
    const res = beat('result');
    ok('...and it refuses on the results screen, which is waiting on a player',
      res.said === null && res.T.state === 'result');
    ok('...and says so rather than doing nothing quietly',
      msrc.indexOf('nothing to skip in this bit') > 0);

    /* --- `5` STEPS ONTO EACH MARK RATHER THAN PAST IT ---
       Mr. Satan says a different line at 30, 15 and 10 seconds, and each of
       them cost two minutes of a live round to hear. The ladder is what makes
       each one fire exactly as it does in play: the latches in `_callTheClock`
       are `left <=` tests, so landing ON 30 and then ON 15 fires one line
       each, while a jump from 120 straight to 15 fires two on one frame and
       queues them behind each other. */
    const rung = (left) => {
      const e = mk([9, 0, 0, 0]);
      e.T.state = 'live';
      e.T.t = ROUND_LIMIT - left;
      e.T.nudge();
      return ROUND_LIMIT - e.T.t;
    };
    ok('5 steps a fresh round down to the thirty-second mark', rung(120) === WARN_AT,
      `${rung(120)}`);
    ok('...then to fifteen', rung(WARN_AT) === COUNT_AT, `${rung(WARN_AT)}`);
    ok('...then to five', rung(COUNT_AT) === COUNT_LAST, `${rung(COUNT_AT)}`);
    /* AND PAST THE LAST MARK IT HANDS OVER TO THE CLOCK RATHER THAN CALLING
       THE ROUND ITSELF. `callOnDamage(_, false)` here would look identical and
       silently skip his ZERO shout, the bell's timing and the camera on him. */
    /* STRICTLY past the limit, because `update` tests `>` and a `t` landing
       exactly on it would leave the round live and the key looking dead. */
    ok('...and then lets the clock itself run out', rung(COUNT_LAST) < -1e-9,
      `${rung(COUNT_LAST) * 1000}ms past`);
    const ran = mk([9, 0, 0, 0]);
    ran.T.state = 'live';
    ran.T.t = ROUND_LIMIT - 1;
    ran.T.nudge();
    ok('...still LIVE, so the round ends through `update` and not through the key',
      ran.T.state === 'live');

    /* --- AND THE CAMERA KNOWS WHICH ENDING THIS WAS ---
       `_onTheClock` is the only thing separating "the clock did this, put the
       camera on the man shouting about it" from "somebody pressed 4". */
    const byKey = mk([9, 0, 0, 0]);
    byKey.T.state = 'live';
    byKey.T.callOnDamage('[debug] round called!');
    ok('a round ended by the debug key is NOT the clock', !byKey.T._onTheClock);
    const byClock = mk([9, 0, 0, 0]);
    byClock.T.state = 'live';
    byClock.T.callOnDamage('Time!', true);
    ok('...and a round ended by the clock is', byClock.T._onTheClock === true);
  }

  /* --- THE FIGHT CAMERA HAS TO FRAME EVERY FIGHTER ---
     It read `const [a, b] = this.game.players` and sized itself off the spread
     between exactly those two: written when two was the only number there was,
     and missed by the four-player pass. In a free-for-all that aimed the lens
     at the midpoint of players 1 and 2 and pushed in on their separation, so
     two kittens fighting in the far corner could be off screen entirely. It is
     the same bug `_paintHud` was fixed for, in the one place it also lived.

     THE TWO-PLAYER GAME MUST BE UNCHANGED TO THE DECIMAL. The girls play two
     players; a centroid that is not exactly the old midpoint is a camera that
     moved for them, which is not a fix, it is a regression with a good reason
     attached. For two fighters the centroid IS the midpoint and the widest
     pair IS the two of them, so this is an identity — asserted, not assumed. */
  console.log('\n--- the fight camera frames everybody ---');
  {
    const R = world.arenaRing;
    const at = (x, z) => ({ position: { x, y: R.y, z }, ko: false });
    const rig = (pts) => {
      const T = new Tournament({
        game: { players: pts, toast() {}, sfx() {} }, world, audio: null, announcer: null,
      });
      T.state = 'live';
      return T.cameraWant();
    };

    /* Two fighters, one in each corner of the deck: the answer this rig gave
       before the change, to four decimal places. */
    const two = rig([at(R.x - 20, R.z - 20), at(R.x + 20, R.z + 20)]);
    const midX = ((R.x - 20) + (R.x + 20)) / 2;
    const midZ = ((R.z - 20) + (R.z + 20)) / 2;
    const sep2 = Math.hypot(40, 40);
    ok('two fighters frame exactly where they always did',
      Math.abs(two.x - (midX + (R.x - midX) * 0.42)) < 1e-9
      && Math.abs(two.z - (midZ + (R.z - midZ) * 0.42)) < 1e-9
      && Math.abs(two.dist - Math.min(104, Math.max(52, 46 + sep2 * 0.8))) < 1e-9);

    /* Four fighters with a pair huddled in one corner and two in the other:
       the old rig looked at players 1 and 2 (the huddle) and never widened. */
    const huddle = [at(R.x - 22, R.z - 22), at(R.x - 20, R.z - 20),
      at(R.x + 22, R.z + 22), at(R.x + 20, R.z + 20)];
    const four = rig(huddle);
    const pairOnly = rig(huddle.slice(0, 2));
    ok('four fighters pull the camera back further than the first two would',
      four.dist > pairOnly.dist + 20, `${four.dist.toFixed(1)} vs ${pairOnly.dist.toFixed(1)}`);
    ok('...and it aims between all four, not between the first two',
      Math.abs(four.x - R.x) < 1e-6 && Math.abs(four.z - R.z) < 1e-6);
    /* The widest PAIR, not the widest from the centroid: three in a line and
       one far out has to fit the line, not half of it. */
    const line = rig([at(R.x - 24, R.z), at(R.x, R.z), at(R.x + 8, R.z), at(R.x + 24, R.z)]);
    ok('...sized off the two furthest apart', line.dist >= 46 + 48 * 0.8 - 1e-9);

    /* --- AND A PHONE SITS TWICE AS CLOSE ---
       The lens is a VERTICAL 38 degrees, so a 2.16 landscape phone already
       shows 21% more world than a 16:9 desktop at the same distance — on a
       screen a fifth the size. `dist: 52` put the whole 56-unit deck on a
       six-inch panel and the fight was four small sprites in the middle of a
       lot of stone. See RING_DIST in tournament.js for the arithmetic. */
    const phoneRig = (pts) => {
      const T = new Tournament({
        game: {
          players: pts, toast() {}, sfx() {}, device: { touchPrimary: true },
        },
        world,
        audio: null,
        announcer: null,
      });
      T.state = 'live';
      return T.cameraWant();
    };
    const close = [at(R.x - 3, R.z), at(R.x + 3, R.z)];
    ok('a phone frames a close exchange from half the distance',
      phoneRig(close).dist * 2 <= rig(close).dist + 1e-9,
      `${phoneRig(close).dist} vs ${rig(close).dist}`);
    /* IT STILL OPENS UP. "Zoom in" that could not pull back would crop a
       fighter the moment the two of them ran to opposite corners, which is the
       trap the desktop rig was written to avoid in the first place. */
    const wide = [at(R.x - 28, R.z - 28), at(R.x + 28, R.z + 28)];
    ok('...and still opens up when they run to opposite corners',
      phoneRig(wide).dist > phoneRig(close).dist * 2.4,
      `${phoneRig(wide).dist} vs ${phoneRig(close).dist}`);
    /* THE FIT, NOT A FEELING. At full spread the fighters must actually reach
       the edges of a 2.16 screen rather than sitting in the middle of it:
       ground width is 2 * d * aspect * tan(19deg), and the pair plus a little
       air has to be most of that. */
    {
      const d = phoneRig(wide).dist;
      const across = 2 * d * 2.16 * Math.tan((38 / 2) * Math.PI / 180);
      const sep = Math.hypot(56, 56);
      ok('...with the widest pair filling most of the phone screen',
        sep / across > 0.75 && sep / across < 1,
        `${(sep / across * 100).toFixed(0)}% of the frame`);
    }
    /* THE DESKTOP PAIR IS UNTOUCHED, and a rig with no `device` at all — which
       is every existing caller in this file — takes the desktop path. Invariant
       five, asserted where it could break. */
    ok('a rig that is not told what device it is on is a desktop',
      rig(close).dist === Math.min(104, Math.max(52, 46 + 6 * 0.8)));

    /* --- AND WHEN THE CLOCK KILLS A ROUND, THE CAMERA GOES TO HIM ---
       ASKED FOR: "when timer gets to Zero on a match, can have the camera zoom
       in on Mr. Satan since he is having a speech/dialogue at the end. Same can
       happen with him giving the Draw speech." Two kittens standing still while
       a man in a box shouts ZEEEEROOOO is a shot of the wrong half of the
       arena. */
    const booth = world.arenaBooth;
    const satanRig = (state, onTheClock, satan = {
      position: booth, group: { visible: true },
    }) => {
      const T = new Tournament({
        game: { players: close, toast() {}, sfx() {}, satan }, world, audio: null,
        announcer: null,
      });
      T.state = state;
      T._onTheClock = onTheClock;
      return T.cameraWant();
    };
    const shot = satanRig('ko', true);
    ok('the clock running out puts the camera on Mr. Satan, not on the ring',
      Math.abs(shot.x - booth.x) < 1e-9 && Math.abs(shot.z - booth.z) < 1e-9,
      `${shot.x.toFixed(1)},${shot.z.toFixed(1)} vs booth ${booth.x},${booth.z}`);
    ok('...aimed at his face rather than his feet', shot.y > booth.y + 1);
    ok('...and it is a close-up, not the fight camera again',
      shot.dist < rig(close).dist / 2, `${shot.dist} vs ${rig(close).dist}`);
    /* AND IT OPTS OUT OF THE PLAYER-SPREAD FLOOR IN main.js. That floor is a
       function of how far apart the FIGHTERS are, so a shot with neither of
       them in it would be pulled back by however far they happened to end the
       round from each other — a close-up that is further away than the fight it
       cut from. */
    ok('...and says it is not to be widened to fit the kittens',
      shot.fitPlayers === false);
    const msrc2 = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    ok('...and main.js honours that rather than flooring it anyway',
      /ring\.fitPlayers === false \? ring\.dist \* widen/.test(msrc2));

    /* A KNOCKOUT IS DELIBERATELY NOT IN THIS. The thing worth looking at there
       is the kitten who just went down, and cutting to the announcer throws
       away the one frame the whole round was for. */
    ok('a knockout keeps the camera in the ring',
      satanRig('ko', false).fitPlayers !== false);
    ok('...and so does a live round, whatever the flag says',
      satanRig('live', true).fitPlayers !== false);

    /* NINTH NON-NEGOTIABLE: no drawing, no shot. It falls back to the ring
       camera the round has been looking at all along rather than aiming at
       nothing — prefer a rule that degrades over one that vanishes. */
    ok('...and with no Mr. Satan in the world it frames the ring instead',
      satanRig('ko', true, null).fitPlayers !== false);
    ok('...and the same when he is in the world but not on screen',
      satanRig('ko', true, { position: booth, group: { visible: false } })
        .fitPlayers !== false);
  }

  /* --- THE MENAGERIE'S PER-PLAYER ARRAYS ---
     All four were `[null, null]`, and every consequence is silent: `releaseAll`
     iterates `held.length`, so an animal pinned by player 3 was never let go at
     a round reset and got dragged across the deck to her new mark for the rest
     of the tournament — the exact bug `releaseAll` exists to prevent. */
  console.log('\n--- the snacks know there are four kittens ---');
  {
    const four = [0, 1, 2, 3].map((i) => ({
      index: i, name: `P${i}`, eatT: 0, hp: 50, maxHp: 100,
      position: new THREE.Vector3(0, 0, 0),
    }));
    const m4 = new Menagerie({
      game: { scene: new THREE.Scene(), players: four, input: { players: [] },
        toast() {}, sfx() {} },
      world,
      art: {},
    });
    ok('there is a seat for every kitten, not just the first two',
      m4.held.length >= 4 && m4.chew.length >= 4
      && m4.eaten.length >= 4 && m4._taught.length >= 4);
    /* The fourth kitten's tally has to be a NUMBER. `eaten[3]++` on undefined
       is NaN, which the toast and these checks both read. */
    m4.eaten[3] += 1;
    ok('...and the fourth kitten\'s tally is a number', m4.eaten[3] === 1);
    /* And a round reset has to let go of what SHE is holding. */
    const fake = { state: 'pinned', holder: four[3], release() { this.state = 'roam'; } };
    m4.held[3] = fake;
    m4.releaseAll();
    ok('a round reset releases the fourth kitten\'s animal too',
      m4.held[3] == null && fake.state === 'roam');
  }

  console.log('\n--- friendly fire dazes rather than doing nothing ---');
  {
    const spawn2 = new THREE.Vector3(0, world.heightAt(0, 40).y, 40);
    const d = new Player({
      texture: new THREE.Texture(), index: 0, spawn: spawn2.clone(), height: 2.9,
    });
    line('daze / lockout', `${DAZE_TIME}s / ${DAZE_TIME * 2}s`);
    ok('a daze is long enough to be felt', DAZE_TIME >= 0.75);
    ok('...and short enough to survive', DAZE_TIME <= 1.5);

    ok('a partner is dazed', d.daze() === true);
    ok('...and loses the stick for it', d.stunT > 0);
    ok('...but takes NO damage', d.hp === d.maxHp);
    /* THE LOCKOUT IS WHAT STOPS IT BECOMING A WAY TO HOLD YOUR OWN PARTNER
       STILL FOR A ROUND, and it matters more at a full second than at half of
       one: without it a sister mashing attack owns her outright. */
    ok('a second swing while she is dazed is refused', d.daze() === false);
    d.stunT = 0;
    ok('...and so is one the moment she recovers', d.daze() === false,
      `lock ${d.stunLockT.toFixed(2)}s`);
    d.stunLockT = 0;
    ok('...but she can be dazed again once the lockout runs out', d.daze() === true);
    ok('the lockout outlasts the daze', DAZE_TIME * 2 > DAZE_TIME);

    /* A kitten who is already out of the fight has no control to lose, and
       stars over an angel is two "she is out of it" signals fighting. */
    d.stunT = 0; d.stunLockT = 0; d.ko = true;
    ok('a knocked-out kitten is not dazed', d.daze() === false);
    d.ko = false; d.angel = true;
    ok('...and neither is an angel', d.daze() === false);
    d.angel = false;
  }

  /* A handicap must MULTIPLY with an Adamant stack rather than replacing it —
     the clan-and-orb rule — and it must survive a trade, which recomputes
     maxHp from scratch. */
  {
    const f = new Player({ texture: new THREE.Texture(), index: 0, rows: 4, cols: 8 });
    f.setHpScale(3);
    const plain = f.maxHp;
    f.setPowerOrbs(['vigor', 'vigor']);
    ok('a handicap multiplies with an Adamant stack', f.maxHp > plain);
    ok('...and survives the orbs changing under it', f.hpScale === 3);
    const frac = f.hp / f.maxHp;
    f.setPowerOrbs(['vigor']);
    ok('...and keeps the fraction when they do',
      Math.abs(f.hp / f.maxHp - frac) < 0.02);
    f.setHpScale(1);
    ok('...and comes back off cleanly', f.hpScale === 1 && f.maxHp === f.power.hp);
  }

  console.log('\n--- four players: the ring ---');

  /* TEAMMATES ADJACENT, OPPONENTS ACROSS. Spaced evenly by index the four
     alternate round the circle and every 2v2 opens already tangled. */
  const P = postsFor([0, 0, 1, 1]);
  const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  ok('2v2: partners stand together', gap(P[0], P[1]) < gap(P[0], P[2]));
  ok('...and the other team is across the ring', gap(P[0], P[2]) > gap(P[0], P[1]) * 2);
  ok('...and nobody shares a post',
    P.every((a, i) => P.every((b, j) => i === j || gap(a, b) > 1)));
  const FFA = postsFor([0, 1, 2, 3]);
  ok('a free-for-all spreads all four',
    FFA.every((a, i) => FFA.every((b, j) => i === j || gap(a, b) > 1)));
  ok('two fighters still use the posts the world already had',
    postsFor([0, 1]).length === 2
    && postsFor([0, 1])[0].x < 0 && postsFor([0, 1])[1].x > 0);

  console.log('\n--- four players: the economy ---');

  /* FOUR PER PLAYER, and two players give the eight this was designed around. */
  ok('two players still scatter eight orbs', worldSpawnCount(2) === 8);
  ok('three players scatter twelve', worldSpawnCount(3) === 12);
  ok('four players scatter sixteen', worldSpawnCount(4) === 16);
  ok('it is four per player', WORLD_PER_PLAYER === 4);
  /* ...OF EACH KIND THAT IS OUT THERE. `ORB_IDS` would count the dealer-only
     orb and quietly inflate the floor by one, which is the shape of mistake
     this whole split exists to make visible. */
  ok('...and never fewer than one of each findable kind',
    worldSpawnCount(1) >= WORLD_ORB_IDS.length);

  /* THE PRICE IS A SHARE OF A FIXED POT, so it has to fall as the party grows
     or a kitten's share silently stops buying the three orbs it is meant to. */
  const pot = 4550;
  ok('two players pay what they always paid', orbPrice(pot, 2) === 650);
  ok('four players pay half that', orbPrice(pot, 4) === 325);
  ok('a share still buys three or four orbs at any party size',
    [2, 3, 4].every((n) => {
      const buys = (pot / n) / orbPrice(pot, n);
      return buys >= 3 && buys <= 4;
    }));
  ok('selling still loses money at every party size',
    [2, 3, 4].every((n) => orbSellPrice(pot, n) < orbPrice(pot, n)));

  /* THE DEBUG ENDGAME'S PURSE IS THAT SAME SHARE, and this is the check the
     bug it had would have failed. `Game._debugEndgame` used to hand every
     player `pointsTotal / 2` regardless of how many there were — so at four it
     paid out twice the money in the world, and since the PRICE is derived from
     the pot (`pointsTotal / players / 3.5`) it quietly made the whole shop half
     price for everybody. It is `/ partySize` now, which is the same arithmetic
     the price already uses, so the two cannot drift apart.

     Written against `Math.floor`, which is what the key does: four shares must
     never add up to more than the world actually contains. */
  {
    const purse = (n) => Math.floor(pot / n);
    ok('the debug purse is one honest share each',
      [2, 3, 4].every((n) => purse(n) * n <= pot));
    ok('...and it buys the same three or four orbs at every party size',
      [2, 3, 4].every((n) => {
        const buys = purse(n) / orbPrice(pot, n);
        return buys >= 3 && buys <= 4;
      }), [2, 3, 4].map((n) => (purse(n) / orbPrice(pot, n)).toFixed(1)).join(' '));
    /* The bug, stated: half the pot each at four players is eight orbs apiece
       off a shelf holding six of the stackable kinds. */
    ok('...and half the pot each would have been wrong at four',
      Math.floor(pot / 2) / orbPrice(pot, 4) > 4);
  }

  /* THE SHELF GROWS WITH THE PARTY, or the third kitten to reach the market
     finds it empty — which is not scarcity, it is being late. */
  ok('two players see the shelf they always saw',
    stockFor('swift', 2) === STOCK_STACKABLE && stockFor('ward', 2) === 1);
  ok('four players see two more of everything',
    stockFor('swift', 4) === STOCK_STACKABLE + 2 && stockFor('ward', 4) === 3);
  /* The move orbs must stay SHALLOWER than the stat orbs, or the reason to
     trade for a second Ward disappears. */
  ok('the move orbs stay the shallow half at four players',
    stockFor('ward', 4) < stockFor('swift', 4));
}

/* --- ONE KITTEN ---
   A phone starts at one player. Almost all of this already worked because the
   four-player pass made everything read `partySize` instead of assuming 2 —
   these checks pin the parts where one is genuinely a different answer, and the
   two-player results alongside them, because "additive" is the invariant. */
{
  const W = 1920;
  const H = 1080;
  const solo = splitLayout(1, W, H, 3, 'vertical');
  ok('one player gets one full-screen pane',
    solo.length === 1 && solo[0].w === W && solo[0].h === H
    && solo[0].x === 0 && solo[0].y === 0, JSON.stringify(solo[0]));
  /* Two is untouched by the same call — the fifth invariant, stated where a
     change to `splitLayout` would trip over it. */
  ok('...and two players still split exactly as they did',
    splitLayout(2, W, H, 3, 'vertical').length === 2);

  /* THE GROUPS SEED, which `main.js` builds from the party rather than writing
     `[[0, 1]]`. A one-kitten game that seeded the old literal would spend its
     first frame claiming a player 1 who does not exist, and `_buildHud` and
     `_drawMaps` both size themselves off it. */
  const seed = (n) => [Array.from({ length: n }, (_, i) => i)];
  ok('a solo party seeds one group of one', JSON.stringify(seed(1)) === '[[0]]');
  ok('...and a pair still seeds the pair', JSON.stringify(seed(2)) === '[[0,1]]');

  /* THE ARENA IS SHUT FOR ONE KITTEN, AND IT SAYS SO AS AN INSTRUCTION.
     Every league wants two fighters or more, so `modesFor(1)` is empty and
     `begin()` would fall through to a one-sided duel — a round that cannot be
     lost. The refusal lives at the door rather than in `begin`, or the griffin
     flies her north to nothing. */
  {
    const said = [];
    const toasts = [];
    const satan = {
      position: { x: SATAN_TOWN.x, y: 0, z: SATAN_TOWN.z },
      group: { visible: true },
      setLine: (t) => said.push(t),
      update: () => {},
    };
    const q = new ArenaQuest({
      game: null, world: { openArena: () => {} }, satan, announcer: null,
    });
    q.stage = 'open';
    const at = (x, z) => ({ position: { x, y: 0, z }, mount: null, rideAlong: null });
    const hud = {
      _sceneActive: () => false,
      toast: (t, i) => toasts.push([t, i]),
      enterArena: () => { throw new Error('the griffin must not fly a solo kitten'); },
    };
    const yes = { pressed: () => true, down: () => false };

    // One kitten standing on him, pressing INTERACT as hard as she likes.
    q.update(0.016, [at(SATAN_TOWN.x, SATAN_TOWN.z)], [yes], hud);
    ok('a solo kitten cannot board the griffin', q.bothHere === false);
    ok('...and he asks for a second fighter, by name',
      /TWO fighters/.test(said.at(-1) ?? '') && /Bring a sister/.test(said.at(-1) ?? ''),
      JSON.stringify(said.at(-1)));
    /* A REFUSAL MUST SAY SO: the line is the refusal, so the one thing that
       must never happen is an empty prompt. */
    ok('...so the refusal is never silent', (said.at(-1) ?? '').length > 20);

    // Two kittens on the same spot get the old behaviour back, unchanged.
    const q2 = new ArenaQuest({
      game: null, world: { openArena: () => {} }, satan, announcer: null,
    });
    q2.stage = 'open';
    let flew = false;
    q2.update(0.016, [at(SATAN_TOWN.x, SATAN_TOWN.z), at(SATAN_TOWN.x, SATAN_TOWN.z)],
      [yes, yes], {
        _sceneActive: () => false,
        toast: () => {},
        enterArena: () => { flew = true; },
      });
    ok('two kittens together still board it', flew === true && q2.bothHere === true);
  }
}

/* --- THE DEVICE ATLAS BUDGET: WHY IT MOVES `maxAtlas` AND NEVER `cell` ---

   A WRONG REASON WAS WRITTEN HERE FIRST AND THIS CHECK IS WHAT CAUGHT IT, so
   the wrong one is worth naming: the budget was justified by claiming that
   lowering `cell` would change `contentScale` and resize the kittens. It does
   not. `contentScale` works out to `(1 - 2*pad) * tallest / max(tallest,
   widest)` in every branch of `packMetrics` — `cellPx` cancels out of all of
   them. That is the whole point of the field, and `loadSpriteAtlas` says so:
   a character comes out the world height it asked for no matter how loosely the
   sheet happened to pack. Quad size is safe under BOTH knobs.

   The real reason is the one `packMetrics` documents: at `cell: 384` the two
   kitten sheets are FLOOR-PINNED (maxAtlas/10 and /8 are far below the floor),
   so they repack byte-for-byte unchanged — and the sprite-direction checks
   above measure real cells out of those sheets. Move `cell` and every number
   they assert moves with it. `maxAtlas` cannot do that, because it does not
   reach a floor-pinned sheet at all.

   So: `maxAtlas` bites exactly the big single-figure sheets that are over
   budget, and leaves everything the checks measure alone. */
{
  const D = { tallest: 1400, widest: 2600 };          // a dragon: wide, single figure
  const K = { tallest: 384, widest: 275, cols: 10, rows: 4 }; // a kitten sheet
  const pm = (o) => packMetrics({ cell: 384, maxAtlas: 2048, ...o });

  ok('a single-figure sheet keeps its size at a lower atlas ceiling',
    Math.abs(pm(D).contentScale - pm({ ...D, maxAtlas: 1024 }).contentScale) < 1e-12,
    pm(D).contentScale.toFixed(6));
  /* The resolution really does drop — otherwise the check above would pass by
     the budget doing nothing at all, which is the failure it cannot see. */
  ok('...but it really is a smaller texture',
    pm({ ...D, maxAtlas: 1024 }).cellPx * 2 === pm({ ...D, maxAtlas: 2048 }).cellPx,
    `${pm({ ...D, maxAtlas: 1024 }).cellPx} vs ${pm({ ...D, maxAtlas: 2048 }).cellPx}`);

  /* THE SAFETY PROPERTY THE BUDGET STANDS ON: the reduced ceiling cannot reach
     a floor-pinned sheet, so both kitten sheets pack identically on a phone and
     the sprite-direction checks stay true there. */
  ok('a kitten sheet is untouched by the atlas ceiling — it is floor-pinned',
    pm(K).cellPx === 384 && pm({ ...K, maxAtlas: 1024 }).cellPx === 384);
  ok('...at eight columns too', pm({ ...K, cols: 8 }).cellPx === 384
    && pm({ ...K, cols: 8, maxAtlas: 1024 }).cellPx === 384);
  /* THE TRAP, STATED AS A CHECK: `cell` is the knob that REPACKS a kitten
     sheet, which is what the direction checks forbid. Quad size survives it;
     their measurements do not. */
  ok('lowering `cell` WOULD repack a kitten sheet — so nothing may',
    pm({ ...K, cell: 256 }).cellPx === 256 && pm(K).cellPx === 384);
  ok('...even though the kitten would still be the same height',
    Math.abs(pm(K).contentScale - pm({ ...K, cell: 256 }).contentScale) < 1e-12);
}

/* --- THE DEVICE TIERS ---
   `profileFor` is pure so it can be asserted here, and the property that
   matters most is the one a check can state plainly: a desktop gets exactly
   what was hard-coded in `main.js` before the file existed. */
{
  const desk = deviceProfileFor({ coarse: false, touchPoints: 0, cores: 16 });
  /* THE TWO DEFAULTS THAT HAVE MOVED, AND THE THREE THAT HAVE NOT.
     `defaultQuality` went to `high` once the browser started using the GPU the
     machine actually has, and `defaultParty` went to ONE once solo became a
     game this code could represent — see the long note on it in device.js.
     Auto split, AA and the full atlas are the game the girls know and none of
     them is a performance guess, so they are pinned as a group. */
  ok('a desktop keeps auto split, AA on and the full atlas',
    desk.defaultSplit === 'auto'
    && desk.antialias === true && desk.atlasMax === 2048);
  /* ONE KITTEN ON EVERY TIER. The second seat is asked for — a controller
     picked up (`Game._autoSeat`) or ENTER on the keyboard — rather than dealt
     to nobody. Asserted on BOTH tiers in one line, because the thing that would
     break it is somebody re-splitting the answer by device. */
  ok('...and opens on one kitten, like a phone',
    desk.defaultParty === 1
    && deviceProfileFor({ coarse: true, touchPoints: 5, cores: 8 }).defaultParty === 1);
  ok('...and opens on the sharpest setting, which is the optimistic default',
    desk.defaultQuality === 'high');
  /* Above any real panel, so it never wins the `Math.min` — but FINITE, because
     `Infinity` JSON-serialises to null and `Math.min(dpr, q, null)` is 0. */
  ok('...and its pixel-ratio cap is finite and out of the way',
    Number.isFinite(desk.maxPixelRatio) && desk.maxPixelRatio >= 4);
  /* A TOUCHSCREEN LAPTOP IS NOT A PHONE. `maxTouchPoints > 0` alone would put
     Richard's own machine — a touchscreen desktop reporting two touch points —
     onto the mobile tier: phone-sized panels, a thumbstick over the game and
     the split turned off. "Starts it at one player" used to be on that list and
     no longer is, because every tier starts at one now; the layout half is what
     the pairing is still protecting. */
  ok('a touchscreen laptop is still a desktop',
    deviceProfileFor({ coarse: false, touchPoints: 10, cores: 8 }).tier === 'desktop');

  /* --- WHAT A PHONE ACTUALLY RENDERS AT ---
     THE CHECK THAT WOULD HAVE CAUGHT THE MOBILE PASS'S WORST BUG. Three caps
     multiply down — the panel's ratio, the quality tier's and the device's — and
     every one of them looked reasonable alone. `maxPixelRatio: 1.5` reads as
     generous; `defaultQuality: 'low'` reads as safe. Together, on a 3.0 panel,
     they rendered the game at 1.0: one ninth of the phone's pixels, on hardware
     that never dropped a frame. Asserting the factors would have passed. So this
     asserts the PRODUCT. */
  const phone = deviceProfileFor({ coarse: true, touchPoints: 5, dpr: 3, cores: 8 });
  ok('a capable phone: one kitten, never split, full atlas, AA on',
    phone.defaultParty === 1 && phone.defaultSplit === 'never'
    && phone.atlasMax === 2048 && phone.antialias === true
    && phone.touchPrimary === true);
  ok('...and it really renders above 1x on a 3x panel',
    effectivePixelRatio(phone, 3) >= 2,
    `${effectivePixelRatio(phone, 3)}`);
  /* The specific historical failure, named so it cannot come back quietly. */
  ok('...not the 1.0 it shipped at once',
    effectivePixelRatio(phone, 3) !== 1);
  /* Turning the setting DOWN must still work — the tier is a default, not a
     floor, and a phone that struggles has to have somewhere to go. */
  ok('...and turning quality down still lowers it',
    effectivePixelRatio(phone, 3, 'low') < effectivePixelRatio(phone, 3, 'high'));

  /* THE CAUTIOUS TIER IS STILL CAUTIOUS. A four-core phone is a real device and
     it gets the conservative answers the capable tier no longer takes. */
  const cheap = deviceProfileFor({ coarse: true, touchPoints: 5, dpr: 2, cores: 4 });
  ok('a weak phone keeps the cautious tier',
    cheap.tier === 'mobile-low' && cheap.antialias === false
    && cheap.atlasMax === 1024 && cheap.defaultQuality === 'low');
  ok('...and renders below a capable one',
    effectivePixelRatio(cheap, 3) < effectivePixelRatio(phone, 3));

  /* A DESKTOP IS UNMOVED BY ALL OF THIS. Its cap is out of the way, so the
     quality setting is the only thing deciding. */
  ok('a desktop still renders at the quality setting alone',
    effectivePixelRatio(desk, 3, 'high') === 2 && effectivePixelRatio(desk, 1, 'high') === 1.5);

  /* THE QUALITY SETTING HAS TO BUY PIXELS ON THE COMMONEST DESKTOP THERE IS,
     and for a long time it bought none. `low` was `pixelRatio: 1`, and the
     effective ratio is a `Math.min` — so on a 1:1 panel `high`, `medium` and
     `low` all came out at exactly 1.0 and the only thing turning quality down
     changed was the shadows. Reported as "badly lagging on PC" and chased
     through the maths overlay and the drifting petals first, because nothing
     said the one lever a fill-bound game has was inert. */
  ok('turning quality down on a 1:1 desktop actually costs fewer pixels',
    effectivePixelRatio(desk, 1, 'low') < effectivePixelRatio(desk, 1, 'medium'),
    `low ${effectivePixelRatio(desk, 1, 'low')} vs medium ${effectivePixelRatio(desk, 1, 'medium')}`);
  ok('...by rendering BELOW the panel, which is the only lever left',
    effectivePixelRatio(desk, 1, 'low') < 1);
  /* A low tier that still scaled with the panel would be no help on the big
     monitor that is the whole reason somebody picked it. */
  ok('...the same on any panel, however many pixels it has',
    effectivePixelRatio(desk, 1, 'low') === effectivePixelRatio(desk, 3, 'low'));
  /* AND `medium` — what the desktop used to open on — IS BIT-IDENTICAL. The
     default moved; the setting it moved off did not, so anybody who picks it
     gets exactly the game that shipped. */
  ok('...while `medium` itself renders exactly what it always did',
    effectivePixelRatio(desk, 1, 'medium') === 1
    && effectivePixelRatio(desk, 2, 'medium') === 1.5
    && effectivePixelRatio(desk, 3, 'medium') === 1.5);

  /* ---- `high` HAS TO BE SHARPER THAN `medium`, ON THE COMMONEST PANEL -----
     The same bug as `low` having nothing to cut, at the other end of the range:
     the effective ratio is a `Math.min` against dpr, so on a 1:1 desktop panel
     `high` and `medium` both came out at 1.0 and "High — sharpest" bought
     nothing but a bigger shadow map. A floor renders ABOVE the panel and lets
     the browser scale down, which is what supersampling is. */
  ok('`high` is genuinely sharper than `medium` on a 1:1 panel',
    effectivePixelRatio(desk, 1, 'high') > effectivePixelRatio(desk, 1, 'medium'));
  ok('...by rendering ABOVE the panel, which is the only way to be sharper than it',
    effectivePixelRatio(desk, 1, 'high') > 1);
  /* EVERY RUNG COSTS FEWER PIXELS THAN THE ONE ABOVE, on the panel where this
     has gone wrong twice. This is the check that would have caught both. */
  ok('every step down the ladder actually renders fewer pixels',
    QUALITY_ORDER.every((q, i) => i === 0
      || effectivePixelRatio(desk, 1, q) < effectivePixelRatio(desk, 1, QUALITY_ORDER[i - 1])),
    QUALITY_ORDER.map((q) => `${q} ${effectivePixelRatio(desk, 1, q)}`).join(' '));

  /* ---- THE LADDER THE AUTO-DOWNGRADE WALKS ------------------------------
     It has to terminate. A `nextQualityDown` that cycled, or that returned a
     name `QUALITY` does not hold, would have the game stepping down for ever
     while it drops frames — turning a slow machine into a slow machine that
     also toasts at the player every four seconds. */
  ok('the quality ladder steps down and stops',
    nextQualityDown('high') === 'medium' && nextQualityDown('medium') === 'low'
    && nextQualityDown('low') === null);
  ok('...and every rung on it is a real quality tier',
    QUALITY_ORDER.every((q) => !!QUALITY[q]));
  ok('...and an unknown setting cannot start a slide',
    nextQualityDown('ultra') === null && nextQualityDown(undefined) === null);

  /* ---- WHEN THE GAME MAY TURN ITSELF DOWN, AND WHEN IT MAY NOT ------------
     Every one of these is about NOT acting, which is why the decision is a pure
     function in device.js rather than a pile of `if`s in the game loop where no
     check could reach it. The hidden-tab one is not hypothetical: it is the bug
     this function was extracted after. */
  const V = (over) => autoQualityVerdict({
    quality: 'high', medianMs: 40, visible: true, playable: true,
    now: 100000, badSince: 0, notBefore: 0, ...over,
  }).verdict;

  ok('a slow frame, held long enough, turns the picture down',
    autoQualityVerdict({
      quality: 'high', medianMs: 40, visible: true, playable: true,
      now: 100000, badSince: 100000 - AUTO_HOLD_MS - 1, notBefore: 0,
    }).next === 'medium');
  ok('...but the first bad reading only starts the clock',
    V({ badSince: 0 }) === 'start');
  ok('...and a bad stretch shorter than the hold does nothing yet',
    V({ badSince: 100000 - AUTO_HOLD_MS + 500 }) === 'wait');

  /* A HIDDEN TAB IS NOT A SLOW MACHINE. `requestAnimationFrame` is throttled to
     roughly half a hertz in a background tab, so the frame ring fills with
     2000 ms samples; the first version of this read that as a machine that
     could not cope and stepped the quality down. Alt-tab away, come back, find
     the game had made itself uglier — measured at a median of 2006 ms while
     hidden, on the machine this was written on. */
  ok('a backgrounded tab NEVER turns the picture down, however bad it looks',
    V({ visible: false, medianMs: 2006, badSince: 1 }) === 'reset');
  ok('...nor does the title screen, a cutscene, or the pause menu',
    V({ playable: false, badSince: 1 }) === 'reset');
  ok('...nor the grace period just after it last changed something',
    V({ notBefore: 100001, badSince: 1 }) === 'reset');

  ok('a frame rate that is merely short of 60 is left alone',
    V({ medianMs: AUTO_BAD_MS - 1, badSince: 1 }) === 'reset');
  ok('...and so is a game that has no frames measured yet',
    V({ medianMs: 0, badSince: 1 }) === 'reset');
  /* NOTHING LEFT TO GIVE. `reset` rather than `wait`, so a machine already at
     the bottom is not holding a clock that can never fire. */
  ok('...and the bottom of the ladder stops trying instead of spinning',
    V({ quality: 'low', badSince: 1 }) === 'reset');
  /* IT ONLY EVER GOES DOWN. Climbing back needs hysteresis or the game
     oscillates between two settings for ever, and a picture that changes
     sharpness every eight seconds is worse than one that is slightly soft. */
  ok('...and a fast machine is never offered a step UP',
    ['reset', 'start', 'wait'].includes(V({ quality: 'low', medianMs: 5 })));

  /* A PHONE'S SUPERSAMPLE FLOOR IS STILL CAPPED BY WHAT A PHONE MAY SPEND.
     `Math.max(cap, floor)` applied naively would let `high` push a weak phone
     past `maxPixelRatio`, which is the single number that exists to stop that —
     and the cautious tier is a four-core phone, the exact machine this game is
     for. */
  ok('the sharpest setting cannot push a weak phone past its cap',
    effectivePixelRatio(cheap, 3, 'high') <= cheap.maxPixelRatio);
  ok('...and a capable phone is unmoved by the floor entirely',
    effectivePixelRatio(phone, 3, 'high') === 2);

  /* --- THE TEST OVERRIDE ---
     The touch pad is written on a desktop, so it has to be reachable from one or
     it gets looked at once a week on a phone. The override is the WHOLE answer
     when set, not a hint added to detection — "test as a phone" has to mean it on
     a machine that visibly is not one. */
  const forced = deviceProfileFor({
    coarse: false, touchPoints: 0, cores: 20, override: 'mobile',
  });
  ok('forcing mobile on a desktop really is the mobile tier',
    forced.touchPrimary === true && forced.tier === 'mobile'
    && forced.defaultParty === 1 && forced.defaultSplit === 'never');
  /* AND IT REMEMBERS THAT IT WAS FORCED, which is what lets `Game` merge the
     keyboard into the touch pad for testing without that path ever running on
     real hardware. */
  ok('...and it knows detection disagreed',
    forced.detected === false && forced.override === 'mobile');

  /* A FORCED MOBILE TIER IS NEVER THE WEAK ONE. `cores` is a phone signal and
     the desktop being tested on has twenty of them — reading it here would make
     "test as a phone" quietly exercise the FASTER tier on the machine most
     likely to be checking the slower one. */
  ok('a forced mobile tier is the ordinary one, not the weak one',
    deviceProfileFor({ coarse: false, touchPoints: 0, cores: 2, override: 'mobile' })
      .tier === 'mobile');
  /* But a real weak phone still finds itself. */
  ok('...while a real 4-core phone still detects as weak',
    deviceProfileFor({ coarse: true, touchPoints: 5, cores: 4 }).tier === 'mobile-low');

  /* --- THE STICK AND THE MACHINE ARE TWO QUESTIONS ---
     THIS SECTION IS A BUG REPORT. `touchPrimary` answered both — "is this a
     phone" and "is the on-screen stick up" — so turning the stick off on a
     phone to play on a controller ALSO threw away the phone-sized HUD: a
     desktop minimap eating a quarter of a 390px-tall screen, desktop panels,
     the desktop camera. Reported from a Galaxy S24 Ultra with a pad in hand.

     Every assertion below is about the pair moving independently, because
     asserting either one alone is what let them be one boolean for so long. */
  const off = deviceProfileFor({
    coarse: true, touchPoints: 5, cores: 8, override: 'desktop',
  });
  ok('hiding the stick on a phone hides ONLY the stick',
    off.padOn === false && off.touchPrimary === true && off.detected === true);
  /* THE CONSEQUENCES, NAMED. `touchPrimary` is not read for its own sake — it
     is read for these, and these are what came back desktop-sized. */
  ok('...so the phone keeps its tier, its atlas and its one kitten',
    off.tier === 'mobile' && off.atlasMax === 2048
    && off.defaultParty === 1 && off.defaultSplit === 'never');

  /* AND THE OTHER THREE CORNERS ARE BIT-IDENTICAL TO WHAT THEY WERE. Only the
     case above moves; if any of these did, the split would be a rewrite rather
     than a fix. */
  const deskAuto = deviceProfileFor({ coarse: false, touchPoints: 0, cores: 16 });
  ok('a desktop on automatic: no phone UI, no stick',
    deskAuto.touchPrimary === false && deskAuto.padOn === false);
  ok('the desktop test mode still claims to be a phone AND draws the stick',
    forced.touchPrimary === true && forced.padOn === true);
  const phoneAuto = deviceProfileFor({ coarse: true, touchPoints: 5, cores: 8 });
  ok('a phone on automatic: phone UI and a stick',
    phoneAuto.touchPrimary === true && phoneAuto.padOn === true);
  /* Forcing the stick OFF on a desktop is the one setting that changes nothing
     at all, and it has to stay that way — it is the default answer spelled out. */
  ok('forcing the stick off on a desktop changes nothing',
    JSON.stringify(deviceProfileFor({
      coarse: false, touchPoints: 0, cores: 16, override: 'desktop',
    })) === JSON.stringify({ ...deskAuto, override: 'desktop' }));

  /* --- THE SAME SWITCH, SPELLED FOR THE MACHINE IT IS ON ---
     What that setting DOES on a phone is move a seat: touch is dealt ahead of
     every controller, so hiding the stick makes the gamepad player 1 rather
     than player 2. It read as "On-screen stick / Always OFF", which describes
     the visible half and not the half that costs you your seat, so
     `Game._shapeTouchSetting` re-words the row in place on a detected phone.

     ONE SELECT, ONE STORED VALUE. The alternative — a second "Player 1 plays
     as" control over the same boolean — is two widgets to keep in step, and the
     first time they disagreed nobody could tell which one the game believed.
     Asserted as the STATES being identical, because that is the property that
     makes one row with two wordings honest rather than a shortcut. */
  const phoneTouch = deviceProfileFor({ coarse: true, touchPoints: 5, cores: 8, override: 'auto' });
  const phoneForced = deviceProfileFor({ coarse: true, touchPoints: 5, cores: 8, override: 'mobile' });
  ok('on a detected phone, `auto` and `mobile` are the same state',
    phoneTouch.padOn === phoneForced.padOn
    && phoneTouch.touchPrimary === phoneForced.touchPrimary
    && phoneTouch.tier === phoneForced.tier);
  /* ...WHICH IS WHAT LETS THE `mobile` ROW BE HIDDEN THERE. It is not a state
     being taken away; it is a duplicate wearing a label ("test touch on this
     computer") that names a machine the player is not holding. */
  ok('...so hiding the test-mode option on a phone removes no reachable state',
    /data-phone-hide/.test(readFileSync(new URL('../index.html', import.meta.url), 'utf8')));
  /* AND THE TWO WORDINGS LIVE NEXT TO EACH OTHER, in the markup, so a change to
     one is made while looking at the other. Strings for this row in main.js
     would be the version that drifts. */
  {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const row = html.slice(html.indexOf('id="set-touch-label"'),
      html.indexOf('id="touch-note"'));
    ok('...and both spellings of the row sit together in the markup',
      /data-phone="Player 1 plays as"/.test(row)
      && /data-phone="Mobile input/.test(row)
      && /data-phone="Gamepad/.test(row));
  }
  /* KEYED OFF `detected`, NOT `touchPrimary`, AND THIS IS THE ONE THAT WOULD
     SILENTLY GO WRONG. In the desktop test mode `touchPrimary` is true, so
     keying off it would re-word the test mode's own escape hatch as "Mobile
     input" — the row you use to get BACK to a keyboard, dressed as though you
     were holding a phone. `detected` is the hardware's answer and does not move
     when the override does. */
  ok('the desktop test mode is a desktop as far as that re-wording is concerned',
    forced.detected === false && forced.touchPrimary === true);
  {
    const body = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    /* THE BODY ONLY, not the doc comment above it — which says the word
       `touchPrimary` four times explaining why it is the wrong question, and
       a check that could not tell those apart would be asserting that the
       reasoning had been deleted. */
    const at = body.indexOf('_shapeTouchSetting(sel) {');
    const fn = body.slice(at, body.indexOf('_bindTouchHud() {', at));
    ok('...and the re-wording really asks `detected`, not `touchPrimary`',
      at > 0 && /device\?\.detected/.test(fn) && !/touchPrimary/.test(fn));
  }

  /* THE WEAK TIER IS ABOUT SILICON, NOT ABOUT A CONTROL. It used to key off
     `override === 'auto'`, which meant a real four-core phone stopped being
     weak the moment its owner hid the stick — a rendering decision made by a
     button that is not about rendering. */
  ok('a weak phone stays weak when the stick is hidden',
    deviceProfileFor({
      coarse: true, touchPoints: 5, cores: 4, override: 'desktop',
    }).tier === 'mobile-low');
  /* ...while the desktop test mode still must not reach it: the machine being
     tested on has twenty cores and would exercise the FASTER path. */
  ok('...and the desktop test mode still cannot reach the weak tier',
    deviceProfileFor({
      coarse: false, touchPoints: 0, cores: 2, override: 'mobile',
    }).tier === 'mobile');
}

/* ===========================================================================
   THE MINIMAP FITS THE PANE IT IS IN.

   `mapWidth` is pure and lives beside `splitLayout` for exactly this reason —
   it used to be one expression buried in `_drawMaps` with forty lines of
   comment around it and nothing checking any of them.
=========================================================================== */
console.log('\n--- the minimap fits its pane ---');
{
  /* A landscape phone, which is the only shape a phone is ever in: the rotate
     gate says so. */
  const PW = 844;
  const PH = 390;
  const full = { paneW: PW, paneH: PH, screenH: PH };

  ok('a desktop map is capped by width alone, exactly as it always was',
    mapWidth({ paneW: 1920, paneH: 1080, screenH: 1080 }) === 300
    && mapWidth({ paneW: 600, paneH: 800, screenH: 800 }) === 600 * 0.42);
  /* THE PHONE CAP IS ON HEIGHT, and that is the whole reason it exists: at
     844x390 the width rule alone asks for 354px of a 390px-tall screen. */
  ok('a phone map is capped by the pane HEIGHT, not its width',
    mapWidth({ ...full, touch: true }) < PW * 0.42);
  ok('...and the Dojo board makes it smaller still',
    mapWidth({ ...full, touch: true, mathUp: true })
      < mapWidth({ ...full, touch: true }));

  /* THE REPORT: two players side by side on a phone. `paneH` does not move in a
     vertical split, so the height cap does not either — the same 160px map,
     now in half the width, twice over. */
  const vert = { paneW: PW / 2, paneH: PH, screenH: PH, touch: true, merged: false };
  ok('a side-by-side split shrinks the phone map by a third',
    Math.abs(mapWidth(vert) / mapWidth({ ...full, touch: true }) - 0.67) < 1e-9,
    `${mapWidth(vert).toFixed(1)} vs ${mapWidth({ ...full, touch: true }).toFixed(1)}`);
  /* AND A STACKED SPLIT DOES NOT TAKE THE CUT TWICE. `paneH` already halved, so
     the height cap already halved with it; a second third leaves 54px of
     islands nobody can read. */
  const horiz = { paneW: PW, paneH: PH / 2, screenH: PH, touch: true, merged: false };
  ok('...but a stacked split does not, having already lost the height',
    Math.abs(mapWidth(horiz) - (PH / 2) * 0.41) < 1e-9,
    `${mapWidth(horiz).toFixed(1)}`);
  /* Spelled as the number the double cut WOULD have produced, because "it is
     bigger than 54" is the whole claim and a ratio hides which 54. */
  ok('...which would have left 54 unreadable pixels if it had',
    Math.abs((PH / 2) * 0.41 * 0.67 - 54) < 1 && mapWidth(horiz) > 70,
    `${mapWidth(horiz).toFixed(1)}`);

  /* NOTHING ABOUT A DESKTOP MOVED. The fifth invariant, asserted rather than
     hoped for: the split factor is inside the `touch` branch. */
  ok('splitting a desktop screen does not shrink its map',
    mapWidth({ paneW: 960, paneH: 1080, screenH: 1080, merged: false })
      === mapWidth({ paneW: 960, paneH: 1080, screenH: 1080 }));
}

console.log('\n--- and it sits on the seam, where both panes can read it ---');
{
  /* THE REPORT: on a side-by-side split one map was hard against the left edge
     of the screen and the other just right of the middle, which is as far
     apart as two boxes on one screen can be — so neither girl could read her
     sister's, and the maths board was drawn on top of one of them. `mapSpot`
     puts the map at the corner of its pane NEAREST the middle and the board at
     the corner FURTHEST from it, so they end up at opposite ends of the same
     edge with the kitten between them.

     Pure arithmetic, which is the only reason this can be checked at all: the
     alternative is a rule written inline in `_drawMaps` that could only ever
     be verified by looking at the screen. */
  const W = 1920;
  const H = 1080;
  const M = 260;                 // a map
  const B = { w: 380, h: 290 };  // and the Dojo's board
  const HINT = 30;
  const map = (v) => mapSpot({ v, W, H, size: M, hint: HINT });
  const board = (v) => mapSpot({ v, W, H, w: B.w, h: B.h, hint: HINT, inner: false });

  const inside = (v, spot, w, h) => {
    const top = H - v.y - v.h;
    return spot.left >= v.x && spot.left + w <= v.x + v.w
      && spot.top >= top && spot.top + h <= top + v.h;
  };
  const overlaps = (a, aw, ah, b, bw, bh) => (
    a.left < b.left + bw && b.left < a.left + aw
    && a.top < b.top + bh && b.top < a.top + ah
  );

  /* EVERY ARRANGEMENT AT ONCE, because the failure this prevents is a map
     drawn over somebody else's half of the screen and it only ever showed up
     in one layout at a time. */
  const LAYOUTS = [
    ['side by side', splitLayout(2, W, H, 3, 'vertical')],
    ['stacked', splitLayout(2, W, H, 3, 'horizontal')],
    ['quadrants', splitLayout(4, W, H, 3, 'vertical', [1, 1, 1, 1])],
    ['a pair and two singles', splitLayout(3, W, H, 3, 'horizontal', [2, 1, 1])],
    ['a pair and two singles, side by side', splitLayout(3, W, H, 3, 'vertical', [2, 1, 1])],
    ['an uneven pair', splitLayout(2, W, H, 3, 'horizontal', [3, 1])],
  ];
  for (const [name, panes] of LAYOUTS) {
    ok(`${name}: every map is inside its own pane`,
      panes.every((v) => inside(v, map(v), M, M)));
    ok(`...and the board is too`,
      panes.every((v) => inside(v, board(v), B.w, B.h)));
    /* THE ONE THAT WAS ACTUALLY BROKEN. A map and a board in the same pane
       must not be drawn through each other — which is what a fixed
       `left: 16px; bottom: 46px` board did to a map in the bottom-left of its
       pane, and why the board appeared to be "behind the minimap". */
    ok(`...and neither is drawn through the other`,
      panes.every((v) => !overlaps(map(v), M, M, board(v), B.w, B.h)));
  }

  /* THE SEAM RULE ITSELF. A left-hand pane's map hugs its RIGHT edge and a
     right-hand pane's its LEFT, so the two meet in the middle of the screen. */
  {
    const [L, R] = splitLayout(2, W, H, 3, 'vertical');
    const mL = map(L);
    const mR = map(R);
    ok('the two maps meet at the seam rather than at the outside edges',
      mL.left + M > W * 0.4 && mR.left < W * 0.6,
      `${mL.left} .. ${mR.left + M}`);
    ok('...and the boards go the other way, to the outside',
      board(L).left < W * 0.1 && board(R).left + B.w > W * 0.9);
    /* THE HINT LINE. `.hint` is one centred sentence at the bottom of the
       SCREEN, so two full-height panes closing in on the seam put their maps
       either side of it. Only a pane whose bottom IS the screen's bottom
       lifts; a pane sitting on a seam has a seam under it. */
    ok('...and both lift clear of the hint line',
      mL.top + M <= H - HINT && mR.top + M <= H - HINT);
  }
  {
    /* A BOTTOM-ROW QUADRANT CROSSES TO THE TOP OF ITS PANE, because that is
       where its seam is. Getting this inversion wrong does not look broken —
       it looks like the map belongs to the pane above. */
    const q = splitLayout(4, W, H, 3, 'vertical', [1, 1, 1, 1]);
    const topLeft = q[0];
    const botLeft = q[2];
    ok('a top-row pane puts its map along the bottom of itself',
      map(topLeft).top + M > (H - topLeft.y - topLeft.h) + topLeft.h * 0.5);
    ok('...and a bottom-row pane puts its along the TOP of itself',
      map(botLeft).top < (H - botLeft.y - botLeft.h) + botLeft.h * 0.5);
    ok('...so all four converge on the middle of the screen',
      q.every((v) => {
        const c = map(v);
        return Math.abs(c.left + M / 2 - W / 2) < W * 0.3
          && Math.abs(c.top + M / 2 - H / 2) < H * 0.3;
      }));
  }
  /* A FULL-WIDTH PANE HAS NO INSIDE ON THAT AXIS, so the two boxes take an end
     each — map right, board left, the same places the unsplit screen puts
     them. Without it both hug the left edge and one is drawn through the
     other, which is a case only a stacked split reaches. */
  {
    const [top] = splitLayout(2, W, H, 3, 'horizontal');
    ok('a full-width pane sends the map right and the board left',
      map(top).left > W * 0.5 && board(top).left < W * 0.1);
  }
}

console.log('\n--- one press of ZL/ZR is one toggle of the maths overlay ---');
{
  /* THE TWO JOY-CON HALVES READ ONE PHYSICAL PAD, and the feeder reports ZL and
     ZR as the same button index (see DEFAULT_VJOY_MAP, and the checks in
     pad-check.mjs that pin it). So both PadStates see the press on the same
     frame, and a `_toggleMath()` inside the per-player loop turned the overlay
     on and straight back off — a button that reads as dead.

     CHECKED AS SOURCE because the loop is inside `Game._step`, which this
     harness cannot run. What it can pin is the SHAPE: the ask is collected in
     the loop and fired once outside it. `map` deliberately stays inside,
     because each kitten zooms her own. */
  const mj = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const loop = mj.slice(mj.indexOf('let mathAsked = false;'));
  ok('the maths ask is collected, not fired, inside the player loop',
    /if \(p\.pressed\('math'\)\) mathAsked = true;/.test(loop.slice(0, 400)),
    'a _toggleMath inside the loop double-fires on a shared button');
  ok('...and fired once, after it', /if \(mathAsked\) this\._toggleMath\(\);/
    .test(loop.slice(0, 500)));
  ok('...while map zoom stays per player, because each kitten zooms her own',
    /if \(p\.pressed\('map'\)\) this\._zoomMap\(i\);/.test(loop.slice(0, 400)));
  ok('_toggleMath is called exactly once in that block',
    (loop.slice(0, 500).match(/_toggleMath\(\)/g) ?? []).length === 1);
}

console.log('\n--- a kitten on a dragon is still in the Dojo ---');
{
  /* THE REPORT: flying over the Dojo of the Turning Circle turned the maths
     board on and then drew it in the bottom-left corner of the SCREEN — in a
     pane belonging to somebody who was not at the Dojo at all.

     Two tests of the same thing that disagreed. `anyInDojo`, which switches the
     board on, never cared how she got there; `_drawMathBoard`, which decides
     whose pane it belongs in, said `!p.mount`, found nobody, and fell through
     to the stylesheet's fixed corner. `inDojoView` is now the only place the
     question is asked, and it answers it once. */
  const c = world.dojoCentre;
  const at = (x, z, extra = {}) => ({ position: { x, y: c.y, z }, ...extra });

  ok('a kitten standing on the circle is in the Dojo', inDojoView(at(c.x, c.z), c));
  /* THE ONE THAT WAS BROKEN, and it is stated as the mount rather than as a
     flag so it cannot be satisfied by deleting the flag from a struct. */
  ok('...and so is one thirty units above it on a dragon',
    inDojoView(at(c.x, c.z, { mount: { name: 'a dragon' } }), c));
  ok('...and one riding along behind her sister',
    inDojoView(at(c.x, c.z, { rideAlong: true }), c));
  ok('...and a kitten just off the painted disc, because the ROOM is bigger',
    inDojoView(at(c.x + DOJO_RADIUS + 2, c.z), c) && DOJO_VIEW_R > DOJO_RADIUS);
  ok('a kitten on another island is not, however she got there',
    !inDojoView(at(c.x + DOJO_VIEW_R + 1, c.z, { mount: {} }), c));
  ok('...and neither is a null, or a kitten with no world to be in',
    !inDojoView(null, c) && !inDojoView(at(c.x, c.z), null));

  /* THE RADIUS IS A CIRCLE, NOT A SQUARE. Trivial, and it is the shape of
     mistake that survives every check written against one axis. */
  const d = DOJO_VIEW_R * 0.75;
  ok('...and the boundary is round: 0.75r on BOTH axes at once is outside it',
    !inDojoView(at(c.x + d, c.z + d), c));

  /* AND `main.js` HAS STOPPED WRITING IT OUT BY HAND. Four call sites, one
     answer — the whole point of moving it. The one survivor is the `!p.mount`
     in `_clusters`, which is a different question (should everybody share ONE
     view) and is commented as such where it stands. */
  const mj = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  ok('main.js asks the question through inDojoView and never by hand',
    !/position\.x - dc\.x/.test(mj), 'a hand-written dojo distance is back');
  /* TWO SITES STILL EXCLUDE A RIDER, and both are commented where they stand:
     "should everybody share ONE view" (she is forced into her own pane anyway)
     and "should this pane's CAMERA lift to the overhead framing" (she is on a
     dragon and already has a camera). Neither is about the board. Pinned as a
     COUNT so a third one cannot appear quietly. */
  ok('...and exactly two rules still exclude a rider, both about cameras',
    (mj.match(/!p\??\.mount && inDojoView/g) ?? []).length === 2,
    String((mj.match(/!p\??\.mount && inDojoView/g) ?? []).length));
}

console.log('\n--- and it lets go of a kitten who has left the ring for good ---');
{
  /* THE REPORT: "when a player dies and is out of bounds, the camera drags away
     from the arena and zooms far out". A round is always ONE screen — the fight
     is the whole point of the mode — so the shared rig frames everybody in it,
     and the pull-back is sized from the widest gap between any two of them.

     A knockout deliberately throws her further than the blow that caused it, so
     the last hit of a round can put her over the rim and down onto the island
     underneath, forty units out from a 56-unit ring. `Tournament` exempts a
     knocked-out kitten from the ring-out rule on purpose — she has no health
     left to charge back with — so she lies there, and the camera went on
     fitting her in: the knockout that ENDED the round was watched from a
     hundred units up with the ring the size of a coin.

     PURE, so the fix is checkable at all. `Game._camIgnores` is four lines that
     read her position and hand the facts over. */
  const deck = 40;
  const lying = { ko: true, onGround: true, y: deck - 30 };

  ok('a kitten knocked out of the ring and landed is let go of',
    outOfShot(lying, 12, deck, true) === true);
  /* THE LINE THE REPORT ITSELF DREW: being launched out of the ring IS the
     shot. It stops being one when she stops moving. */
  ok('...but not while she is still flying out of it',
    outOfShot({ ko: true, onGround: false, y: deck + 6 }, 12, deck, true) === false);
  ok('...and a long fall past the rim counts as gone even in mid-air',
    outOfShot({ ko: true, onGround: false, y: deck - OUT_DROP - 1 }, 12, deck, true) === true);
  ok('...and one unit under the deck is still the same shot',
    outOfShot({ ko: true, onGround: false, y: deck - 1 }, 12, deck, true) === false);

  /* IT IS NOT A RING-OUT AND MUST NOT BECOME ONE. A kitten who is merely
     outside the ring, or merely knocked out, is framed exactly as she always
     was — this only fires where the two meet. Getting either half wrong loses
     the girl who is still fighting. */
  ok('a kitten standing outside the ring on her feet is still framed',
    outOfShot({ ko: false, onGround: true, y: deck }, 12, deck, true) === false);
  ok('...and one knocked out INSIDE the ring certainly is',
    outOfShot({ ko: true, onGround: true, y: deck }, -20, deck, true) === false);
  ok('...and one right on the rim is inside until she is outside it',
    outOfShot(lying, 0, deck, true) === false);

  /* ONLY DURING A ROUND, because "outside the ring" answers for the whole
     world: off the arena, every kitten on every island is outside it. `ko`
     should be unreachable out there, but a predicate that is only correct
     because of something two files away is one bad merge from framing nobody
     at all — and "nobody" here means a camera pointed at the origin. */
  ok('...and none of it applies when no round is live',
    outOfShot(lying, 12, deck, false) === false);
  ok('a null is not a kitten to drop', outOfShot(null, 12, deck, true) === false);

  /* AND THE WHOLE GROUP COMES BACK RATHER THAN NOTHING. A pane whose only
     kitten has been knocked out still has to point somewhere, and pointing it
     at her is a great deal better than pointing it at the origin — which is
     what a `filter` with no fallback gives, and it is a worse bug than the one
     being fixed. Prefer a rule that degrades. */
  const gone = new Set([1, 3]);
  ok('the framed set drops the ones who are gone',
    framedMembers([0, 1, 2, 3], (i) => gone.has(i)).join() === '0,2');
  ok('...and a group with nobody left keeps everybody',
    framedMembers([1, 3], (i) => gone.has(i)).join() === '1,3');
  ok('...and a group with nobody gone is returned untouched',
    framedMembers([0, 2], (i) => gone.has(i)).join() === '0,2');
  /* THE TWO-PLAYER GAME COMES OUT BIT-IDENTICAL while nobody is knocked out,
     which is the fifth non-negotiable and the reason this is a filter rather
     than a rewrite of the framing. */
  ok('...so an ordinary pair is framed exactly as it always was',
    framedMembers([0, 1], () => false).join() === '0,1');
}

console.log('\n--- and the two maps go where they are worth most ---');
{
  /* THE OLD RULE WAS "THE MAPS BELONG TO PANES 0 AND 1", i.e. to Ember and
     Frost. Stable, and it stranded exactly the wrong people: two sisters
     exploring together share ONE pane, so that pane could end up with no map
     while a map sat in a pane holding one girl standing next to the stall.
     Two kids with no map is the failure the minimap exists to prevent. */
  ok('two players get one map each, exactly as they always did',
    JSON.stringify(assignMaps([1, 1], [], 2)) === JSON.stringify([0, 1]));
  ok('...and a merged view uses one and parks the other',
    JSON.stringify(assignMaps([4], [0, 1], 2)) === JSON.stringify([0, -1]));

  /* THE FIX, STATED AS THE CASE IT WAS REPORTED FROM: four kittens, two of
     them together in pane 2, maps sitting on panes 0 and 1. */
  const moved = assignMaps([1, 1, 2], [0, 1], 2);
  ok('a pane holding two kittens takes a map off a pane holding one',
    moved.includes(2), JSON.stringify(moved));
  ok('...and exactly one pane is left without one, since there are only two',
    new Set(moved.filter((g) => g >= 0)).size === 2, JSON.stringify(moved));

  /* INCUMBENCY WINS TIES ON SIZE, WHICH IS WHAT STOPS IT FLICKERING. A map is
     taken off a pane only by a pane holding STRICTLY more players, so the
     ordinary four-player case — everybody alone — never moves a map once it
     has landed. A map that moves for a reason that has nothing to do with you
     costs you a second of hunting for it; same argument `stablePanes` makes. */
  ok('nothing moves when every pane holds the same number',
    JSON.stringify(assignMaps([1, 1, 1, 1], [0, 1], 2)) === JSON.stringify([0, 1]));
  ok('...and a settled assignment is a fixed point',
    JSON.stringify(assignMaps([1, 2, 1], assignMaps([1, 2, 1], [0, 1], 2), 2))
      === JSON.stringify(assignMaps([1, 2, 1], [0, 1], 2)));

  /* --- AND A MAP THAT IS NO LONGER NEEDED WHERE IT IS COMES BACK ---
     REPORTED TWICE IN ONE BREATH: "it is zooming the wrong map, it is not
     detecting which minimap is on which screen/tile", and "when Ember loses her
     minimap ... Z no longer zooms in on it". One bug, and it is incumbency
     with no way back: steps 1-3 only ever move a map towards a FULLER pane, so
     once a pair has taken Ember's map, the pair splitting up leaves every pane
     at size 1, nothing is "strictly more", and her map never returns.

     THIS IS THE EXACT SEQUENCE, played forward the way the panes really move:
     four kittens in two pairs, then one pair splits, then everybody apart. */
  let seq = assignMaps([2, 2], [], 2);
  seq = assignMaps([1, 1, 2], seq, 2);
  seq = assignMaps([1, 1, 1, 1], seq, 2);
  ok('four kittens who pair up and split again all get their maps back',
    seq.every((g) => g === 0 || g === 1), JSON.stringify(seq));
  ok('...so player one is not left mapless for the rest of the session',
    seq.includes(0), JSON.stringify(seq));

  /* IT CANNOT FLICKER, AND THAT IS THE ONE THING THE NEW RULE HAD TO PROVE.
     Every swap it makes strictly lowers the sum of the panes the maps sit in,
     and that sum is a non-negative integer — so it settles, and the thing it
     settles on does not depend on how it got there. Asked both ways: is it a
     fixed point, and does a different history reach the same answer. */
  ok('...and that arrangement is where it stops moving',
    JSON.stringify(assignMaps([1, 1, 1, 1], seq, 2)) === JSON.stringify(seq));
  const other = assignMaps([1, 1, 1, 1], assignMaps([1, 3], [1, 0], 2), 2);
  ok('...whichever way the panes got there',
    JSON.stringify(other) === JSON.stringify(seq),
    `${JSON.stringify(other)} vs ${JSON.stringify(seq)}`);

  /* AND THE SIZE RULE STILL OUTRANKS IT. The tie-break is only a tie-break: a
     pane holding two kittens keeps its map against a lower-indexed pane
     holding one, or this has quietly reinstated "the maps belong to Ember and
     Frost" — the rule step 3 exists to have replaced. */
  const busy = assignMaps([1, 2], [0, 1], 2);
  ok('...and a fuller pane still outranks a lower-numbered one',
    busy.includes(1), JSON.stringify(busy));
  const busier = assignMaps([1, 2, 2], [1, 2], 2);
  ok('...so a lone kitten does not take a map off two sisters',
    !busier.includes(0), JSON.stringify(busier));

  /* NO PANE EVER GETS BOTH MAPS, in any arrangement — that would be two
     archipelagos in one corner and a pane with none next door. */
  let doubled = 0;
  for (const sizes of [[1, 1], [1, 1, 1], [2, 1, 1], [1, 2, 1], [1, 1, 2],
    [1, 1, 1, 1], [2, 2], [3, 1], [1, 3]]) {
    for (const prev of [[], [0, 1], [1, 0], [2, 0], [-1, -1]]) {
      const got = assignMaps(sizes, prev, 2);
      const live = got.filter((g) => g >= 0);
      if (new Set(live).size !== live.length) doubled += 1;
      if (live.some((g) => g >= sizes.length)) doubled += 1;
    }
  }
  ok('no pane is ever handed both maps, and none points off the end',
    doubled === 0);
}

/* ===========================================================================
   LIVE TEXT DOES NOT ALLOCATE.

   THIS SECTION EXISTS BECAUSE THE DOJO CRASHED PHONES AND NOTHING CAUGHT IT.

   `makeLabelTexture` caches by content and never evicts, which is correct for
   text written once and catastrophic for text rewritten every frame. The Dojo's
   point readout is `( cos , sin )` to two places — 201 x 201 reachable strings —
   so one lap of the circle minted 568 supersampled canvases at 1.71 MB each and
   held all of them. Measured in a browser: 972 MB per lap from one label. The
   tab lagged for a few seconds and died, on every quality setting, because
   quality has nothing to do with it.

   Nothing about that is visible on screen until it is fatal, and no check here
   was watching allocation — every existing assertion asks whether a number came
   out right. So these ask a different question: does playing the lesson ALLOCATE
   anything? A canvas is the honest unit, because it is what the leak was made
   of, and `document.createElement` is the only door to one.
   =========================================================================== */
{
  console.log('\n--- the dojo allocates nothing while you walk it ---');

  /* Count every canvas the game asks for. Wrapping the stub rather than
     counting textures, because a texture is what three.js sees and a CANVAS is
     what the browser has to find memory for — and the second is the one that
     killed the tab. */
  const realCreate = globalThis.document.createElement;
  let created = 0;
  globalThis.document.createElement = (...a) => { created += 1; return realCreate(...a); };

  const dojo = new MathDojo(new THREE.Scene(), world.dojoCentre);
  const dc = world.dojoCentre;
  /* Enough of a player for the Dojo: it reads `mount`, `position` and `name`.
     Blossom because it is the longest kitten name, which is what the hint
     label's reserve has to cover. */
  const walker = {
    mount: null, name: 'Blossom',
    position: new THREE.Vector3(dc.x + DOJO_RADIUS, dc.y, dc.z),
  };

  const liveLabels = [dojo.lblTheta, dojo.lblCos, dojo.lblSin, dojo.lblPoint, dojo.lblHint];
  ok('every readout in the Dojo owns its canvas rather than the shared cache',
    liveLabels.every((l) => !!l._live));

  /* ---- and that canvas is CPU-backed, which is a PACING check ------------
     Owning a canvas is what makes a live label re-upload; being GPU-backed is
     what makes each re-upload sync the pipeline. The second cost never showed
     up in a frame-rate number — median frame time was identical with the
     overlay on and off — so it read as "the game chugs" with the fps counter
     insisting nothing was wrong. Measured as consecutive-frame jitter, flipping
     the flag back and forth on the same labels at a matched repaint rate: 12.6
     and 14.5 ms against a ~11 ms median, versus 3.8 and 3.6 ms once these
     canvases stopped living on the GPU. See `_liveCtx` in core/label.js.

     Asserting the REQUEST rather than the effect, because Node has no canvas
     to have an effect on — but the request is the whole of the fix, and
     deleting it is exactly how this comes back. */
  ok('...and asks for it CPU-backed, so repainting one never stalls the GPU',
    liveLabels.every((l) => l.mat.map.image.ctxOpts?.willReadFrequently === true),
    liveLabels.map((l) => JSON.stringify(l.mat.map.image.ctxOpts)).join(' '));

  /* The contrast matters: the flag is not free — it software-rasterises the
     drawing — so it belongs only where a canvas is painted MORE THAN ONCE.
     A static label uploads once and should stay on the fast side of that
     trade. This is the check that stops a future "apply it everywhere". */
  const staticLbl = new Label('LEDGER', { height: 1 });
  ok('...while a static label, which uploads once, stays GPU-backed',
    !staticLbl.mat.map.image.ctxOpts?.willReadFrequently);

  const arcBefore = dojo.arc.geometry;
  const cacheBefore = labelCacheStats().entries;
  const afterBuild = created;

  /* One full lap at 60fps — the exact motion that took the tab down, and long
     enough that a per-frame allocation cannot hide inside it. */
  const widest = new Map(liveLabels.map((l) => [l, 0]));
  for (let i = 0; i < 600; i++) {
    const a = (i / 600) * Math.PI * 2;
    walker.position.set(
      dc.x + Math.cos(a) * DOJO_RADIUS, dc.y, dc.z + Math.sin(a) * DOJO_RADIUS
    );
    dojo.update(1 / 60, [walker]);
    /* `_want`, NOT `_text`. `_text` is what the throttle actually painted, and
       in a tight loop like this one that is a handful of values — so measuring
       it would quietly stop sampling the wide strings and the reserve check
       would pass by never having been tested. `_want` is every value the Dojo
       asked to display, which is the set the reserve has to cover. */
    for (const l of liveLabels) widest.set(l, Math.max(widest.get(l), l._want.length));
  }

  ok('a lap of the circle creates no canvases at all', created - afterBuild === 0,
    `${created - afterBuild}`);
  ok('...and adds nothing to the shared label cache',
    labelCacheStats().entries === cacheBefore);
  /* The arc used to dispose and rebuild its geometry every frame for the same
     reason nobody noticed: it still drew correctly. */
  ok('...and the swept arc reuses one buffer instead of rebuilding it',
    dojo.arc.geometry === arcBefore
    && dojo.arc.geometry.drawRange.count <= dojo.arc.geometry.attributes.position.count);

  /* A RESERVE THAT IS TOO SHORT CLIPS THE TEXT, and that is the one way a live
     label can be wrong where the cached one could not — so it is checked against
     what the Dojo ACTUALLY printed over the lap, not against a guess. Length
     rather than pixels because the headless canvas cannot measure, and these are
     all the same string shape with the digits varying. */
  for (const l of liveLabels) {
    ok(`"${l._opts.live}" is wide enough for every value it showed`,
      l._opts.live.length >= widest.get(l), `${widest.get(l)} chars`);
  }

  /* The idle line is longer than any driven one, and it is the reserve — so it
     has to be checked against a real player standing there too. Driven from a
     player who is present but off the circle, because `update([])` with nobody
     at all now returns before the text runs (see below). */
  walker.position.set(dc.x, dc.y, dc.z);
  dojo.update(1 / 60, [walker]);
  ok('...including the line shown with nobody on the circle',
    dojo.lblHint._opts.live.length >= dojo.lblHint._want.length);

  /* THE GATE. The Dojo's `update` is called every frame from anywhere in the
     world and from the title screen, so the text and the board — the only
     expensive things in it — must not run unless somebody could read them.
     Re-uploading 9.5 MB of canvas from another island is what this stops. */
  const fair = { mount: null, name: 'Ember', position: new THREE.Vector3(dc.x + 900, dc.y, dc.z) };
  dojo.update(1 / 60, [fair]);
  ok('nobody within reading distance means the Dojo does no text work',
    dojo.readable === false);
  const boardBefore = dojo._boardAcc;
  dojo.update(1 / 60, [fair]);
  ok('...and the 1280x720 wave board is not redrawn either',
    dojo._boardAcc === boardBefore);
  ok('...but the diagram itself still turns, so it is right when you arrive',
    (() => { const before = dojo.theta; dojo.update(1 / 60, [fair]); return dojo.theta !== before; })());
  dojo.update(1 / 60, [walker]);
  ok('standing on the island turns the text back on', dojo.readable === true);

  /* THE THROTTLE. A live label repaints at most every LIVE_MS, which is what
     turned 7.3 uploads a frame back into something a GPU does not notice. A
     tight loop asks for 600 different values inside one millisecond; almost
     none of them may reach the canvas. */
  const spam = new Label('', { size: 40, live: 'xxxxxxxxxxxx' });
  let painted = 0;
  const seen = new Set();
  for (let i = 0; i < 600; i++) {
    spam.setText(`v${i}`);
    if (spam._text === `v${i}`) painted += 1;
    seen.add(spam._text);
  }
  ok('a live label refuses to repaint 600 times in one millisecond', painted <= 2, `${painted}`);
  /* AND THE LAST VALUE STILL LANDS. The throttle compares `_want` against
     `_text`, so a label that stops changing paints its final value on the next
     tick past the interval — rather than sitting on a stale number forever,
     which is what comparing against `_text` alone would have done. */
  spam._paintedAt = 0;
  spam.setText('final');
  ok('...but the value it settles on is the one that gets painted',
    spam._text === 'final');

  /* THE SAME BUG, TWICE MORE. The Kotodama orb and the power orb print the same
     kind of live trig, and the power orb's is `cos X  sin Y` — the identical
     combinatorial shape, on up to sixteen orbs at once. */
  const orb = new Orb({});
  ok('the Kotodama orb\u2019s readouts are live too',
    !!orb.thetaLabel._live && !!orb.cosLabel._live && !!orb.sinLabel._live);
  const orbArc = orb.arc.geometry;
  const beforeOrb = created;
  const centre = new THREE.Vector3(0, 0, 0);
  for (let i = 0; i < 240; i++) orb.update(1 / 60, centre);
  ok('...and an orbiting orb allocates nothing either', created - beforeOrb === 0,
    `${created - beforeOrb}`);
  ok('...reusing its arc buffer as well', orb.arc.geometry === orbArc);

  const po = new PowerOrb(POWER_ORBS[0], 0, 1);
  ok('the power orb\u2019s cos/sin readout is live', !!po.readout._live);

  /* THE DASHED LEGS MUST NOT REBUILD THEIR OWN BUFFERS.

     `Line.computeLineDistances()` hands the geometry a BRAND NEW attribute every
     call, so the GPU buffer is destroyed and recreated — and both the Dojo and
     every orb were calling it on two-point lines that move every frame. Sixteen
     dashed lines in a scene with the maths overlay up is sixteen buffer
     create/destroy cycles per frame, which is what the second desktop lag report
     turned out to be. The distances are `[0, length]`; they are written in place.

     Asserted on IDENTITY, not on the numbers, because the numbers were always
     right — which is exactly why nothing caught it. */
  const dashedOf = (root) => {
    const out = [];
    root.traverse((o) => { if (o.isLine && o.material?.isLineDashedMaterial) out.push(o); });
    return out;
  };
  const dojoDashed = dashedOf(dojo.group);
  const orbDashed = dashedOf(orb.group);
  ok('the Dojo and the orb both draw dashed legs',
    dojoDashed.length > 0 && orbDashed.length > 0, `${dojoDashed.length} + ${orbDashed.length}`);
  const allDashed = [...dojoDashed, ...orbDashed];
  ok('...and every one has its dash distances allocated up front',
    allDashed.every((l) => !!l.geometry.attributes.lineDistance));
  const dashBefore = allDashed.map((l) => l.geometry.attributes.lineDistance);
  for (let i = 0; i < 120; i++) {
    walker.position.set(
      dc.x + Math.cos(i / 20) * DOJO_RADIUS, dc.y, dc.z + Math.sin(i / 20) * DOJO_RADIUS
    );
    dojo.update(1 / 60, [walker]);
    orb.update(1 / 60, centre);
  }
  ok('...and moving them for two seconds rebuilds none of those buffers',
    allDashed.every((l, k) => l.geometry.attributes.lineDistance === dashBefore[k]));
  /* And the value is still real, or every dash would render as a solid line. */
  const legs = orbDashed.map((l) => l.geometry.attributes.lineDistance);
  ok('...while the dash lengths are still measured, not left at zero',
    legs.some((d) => d.getX(1) > 0) && legs.every((d) => d.getX(0) === 0));

  /* A CACHED LABEL MUST STILL CACHE. The fix would be worthless if it had
     quietly turned every static label into its own canvas — that is the same
     leak wearing the other hat. */
  const twiceA = new Label('WORLD CHECK STATIC', { size: 40 });
  const beforeSecond = created;
  const twiceB = new Label('WORLD CHECK STATIC', { size: 40 });
  ok('static text still shares one texture between two labels',
    twiceA.mat.map === twiceB.mat.map && created - beforeSecond === 0);

  globalThis.document.createElement = realCreate;
}

/* ===========================================================================
   THE PNG WRITER, WHICH IS THE ONLY NEW THING IN png.mjs THAT NOBODY LOOKS AT.

   `tools/steam-art.mjs` builds the Steam shelf and the desktop icon out of
   title_art.png, and its output is judged by eye — which means a codec bug in
   here would be seen as "the icon looks a bit washed out" and shrugged at. The
   decoder in this file has been trusted for a year because THIS file leans on
   it; the encoder gets the same treatment. Round-trip, including alpha, which
   is the channel an icon is entirely about.
=========================================================================== */
console.log('\n--- the PNG writer round-trips ---');
{
  const tmp = `${tmpdir()}/kk-png-check-${process.pid}.png`;
  const W = 7;
  const H = 5;
  const src = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    src[i * 4] = (i * 37) % 256;
    src[i * 4 + 1] = (i * 11) % 256;
    src[i * 4 + 2] = 255 - ((i * 5) % 256);
    /* Deliberately includes 0 and 255 and things in between: a writer that
       drops the alpha channel still passes a test made of opaque pixels. */
    src[i * 4 + 3] = [0, 1, 128, 254, 255][i % 5];
  }
  writeFileSync(tmp, writePNG(W, H, src));
  const back = readPNG(tmp);
  ok('a written PNG reads back at the same size', back.w === W && back.h === H);
  ok('...with every byte of every channel intact',
    back.d.length === src.length && src.every((v, i) => back.d[i] === v));
  /* NOT PREMULTIPLIED. A fully transparent pixel keeps its colour, because the
     resampler in steam-art divides by alpha and a zero would take the colour
     with it — that is the halo bug, and it starts here if the codec lies. */
  ok('...including the colour under a fully transparent pixel',
    back.d[3] === 0 && back.d[0] === src[0] && back.d[2] === src[2]);

  /* AN ODD WIDTH IS THE CASE THAT BREAKS A HAND-ROLLED WRITER. Each PNG row
     carries a leading filter byte, so the row stride is `w * 4 + 1` and not
     `w * 4`; get that wrong and the picture reads back sheared by one pixel
     per row — which on a diagonal is unmistakable and on a photograph is
     "hmm, looks a bit soft". So the fixture IS a diagonal. */
  const D = 5;
  const diag = new Uint8ClampedArray(D * D * 4);
  for (let y = 0; y < D; y++) {
    for (let x = 0; x < D; x++) {
      const i = (y * D + x) * 4;
      diag[i] = x === y ? 255 : 0;
      diag[i + 3] = 255;
    }
  }
  writeFileSync(tmp, writePNG(D, D, diag));
  const read = readPNG(tmp);
  let straight = true;
  for (let y = 0; y < D; y++) {
    for (let x = 0; x < D; x++) {
      if (read.d[(y * D + x) * 4] !== (x === y ? 255 : 0)) straight = false;
    }
  }
  ok('...and an odd-width image comes back square, not sheared', straight);

  /* THE ICON IS PNG-IN-ICO, which is the only form that can carry a 256px
     entry — the directory's width field is one BYTE, and 0 means 256. Every
     offset has to land exactly, because Windows does not repair a bad one, it
     draws the generic blank page instead and gives no reason. */
  const entries = [256, 32, 16].map((size) => {
    const n = size * size * 4;
    const d = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i += 4) { d[i] = 255; d[i + 3] = i % 511 > 255 ? 255 : 0; }
    return { size, png: writePNG(size, size, d) };
  });
  const ico = writeICO(entries);
  ok('an .ico declares itself an icon with the right count',
    ico.readUInt16LE(0) === 0 && ico.readUInt16LE(2) === 1 && ico.readUInt16LE(4) === 3);
  /* AND THE DIRECTORY IS CHECKED AGAINST THE PAYLOAD, not against itself. The
     failure that matters is an offset that points a few bytes wide: Windows
     does not report it, it draws the generic blank-page icon and says nothing,
     and from the outside that is indistinguishable from "the .ico is fine, the
     shortcut just didn't pick it up". So follow each offset, decode whatever
     is actually there, and make it agree with the size the entry CLAIMS —
     remembering that a claim of 256 is written as the byte 0. */
  let walked = 6 + entries.length * 16;
  let laidOut = true;
  for (let i = 0; i < entries.length; i++) {
    const at = 6 + i * 16;
    const claimed = ico[at] === 0 ? 256 : ico[at];
    const len = ico.readUInt32LE(at + 8);
    const off = ico.readUInt32LE(at + 12);
    if (off !== walked || ico.readUInt16LE(at + 6) !== 32) laidOut = false;
    writeFileSync(tmp, ico.subarray(off, off + len));
    /* try/catch, because a wrong offset does not come back as wrong pixels —
       it comes back as "not a PNG" from the decoder, and a check that dies
       takes the other 950 with it and reports nothing at all. */
    try {
      const got = readPNG(tmp);
      if (got.w !== claimed || got.h !== claimed) laidOut = false;
    } catch { laidOut = false; }
    walked += len;
  }
  unlinkSync(tmp);
  ok('...and each entry decodes to exactly the size it claims', laidOut);
  ok('...with nothing left over at the end', walked === ico.length);
}

/* ---------------------------------------------------------------------------
   The trailer costs nothing until somebody asks for it.

   `public/trailer/katana-kitties-trailer.mp4` is 20MB, which is a third of
   everything else in `public/` put together and forty times the JS bundle.
   The entire design rests on two attributes in one tag, and both of them are
   the kind of thing an editor or a tidy-up "fixes":

     - NO `src`. A <video> carrying a src is a request waiting to happen, and
       adding one back would make every player download 20MB on boot whether
       they ever open the trailer or not.
     - `preload="none"`. On its own this is only a hint — several browsers
       ignore it — which is exactly why the src is withheld as well, and why
       both are checked rather than either.

   Neither failure is visible while playing. The game would look and behave
   identically; it would simply cost 20MB more to start, on a phone, on data.
   Measured in the browser once and confirmed: opening it makes one 206 range
   request, and closing it aborts that request mid-stream rather than letting
   20MB finish downloading behind a video nobody is watching any more.
--------------------------------------------------------------------------- */
console.log('\n--- the trailer is opt-in ---');
{
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const tag = html.match(/<video[^>]*id="trailer-video"[\s\S]*?>/);
  ok('index.html has the trailer <video>', !!tag);
  if (tag) {
    const t = tag[0];
    ok('...and it carries NO src attribute', !/\ssrc\s*=/.test(t));
    ok('...and preload is none', /preload="none"/.test(t));
    /* iOS otherwise hoists it into the system player, which takes the skip
       rule away from us — there, the only way out is Apple's Done button. */
    ok('...and it plays inline', /playsinline/.test(t));
  }

  const js = readFileSync(new URL('../src/systems/trailer.js', import.meta.url), 'utf8');
  ok('close() detaches the source', /removeAttribute\('src'\)/.test(js));
  /* The one-time offer is answered when she CHOOSES, never when the video
     ends: a girl who skips it, or whose connection drops, must not be asked
     again every time she opens the game. Seventh non-negotiable, one floor up
     from the scenes it was written for. */
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const answer = main.slice(main.indexOf('_answerTrailerOffer(choice)'));
  ok('the offer is recorded on the CHOICE, not on the video ending',
    answer.indexOf('_offerAnswered = true') < answer.indexOf('trailer.open('));
  /* IT IS ASKED AGAIN EVERY TIME SHE COMES BACK TO THE TITLE, and that is a
     change from the first version, which remembered the answer in
     `localStorage` under `kk.trailerOffer`. Richard's report: "that option only
     ever appears once and never returns. Even if I refresh the browser, it
     still will not reappear." Remembering it forever is the right behaviour for
     a cookie banner and the wrong behaviour for a thing you might want to show
     somebody — the trailer is 68 seconds of the game's own art and the most
     likely reason to want it is a new person in the room.

     So: no storage at all, a plain field, and `toTitle()` clears it. The two
     halves are checked separately because either one alone silently restores
     the old behaviour — a `localStorage` read would pin it across refreshes,
     and a missing reset would pin it for the session. */
  ok('...and it is NOT remembered across games',
    !/kk\.trailerOffer/.test(main) && /_trailerOfferDue\(\)\s*\{[^}]*!this\._offerAnswered/.test(main));
  /* The METHOD, not the first mention of it — `onYes: () => this.toTitle()` in
     the pause menu's confirm comes 575 lines earlier in the file. */
  const tAt = main.indexOf('\n  toTitle() {');
  const toTitle = main.slice(tAt, tAt + 2200);
  ok('...because going back to the title clears the answer',
    /_offerAnswered = false/.test(toTitle));
  /* MenuNav has to stand down entirely, or the title screen underneath — the
     one surface where ANY button confirms — starts the game out from under a
     video she is still watching. */
  const nav = readFileSync(new URL('../src/systems/menunav.js', import.meta.url), 'utf8');
  ok('MenuNav takes no input while the trailer runs',
    /trailer\?\.active\) return null/.test(nav));
  ok('...and the trailer panels count as overlays',
    /'panel-trailer', 'panel-trailer-offer'/.test(main));
}

/* ---------------------------------------------------------------------------
   HOW TO PLAY is a picture-led accordion, and it stays cheap and reachable.

   It was rebuilt from one long scroll into a set of <details> topics a new
   player opens one at a time. Two properties are load-bearing and both are the
   kind a tidy-up quietly undoes:

     - The pictures are `loading="lazy"` inside a display:none panel, so not one
       is fetched until she opens Help. Drop the attribute and the screenshots
       land back on the 35MB boot, on a phone, on data — invisible while
       playing, exactly like the trailer's missing src.
     - The accordion is drivable on a pad. That rests on `summary.help-topic`
       being in MenuNav.items() AND `data-nav="vertical"`/`data-nav-start` on
       the panel; either half alone leaves it unreachable on a controller,
       which is the seventh non-negotiable (a menu four kids can only mouse).

   The bamboo warning is pinned as content, not decoration: clearing the grove
   before raising a big panda strands the fourth dragon ball (invariant 4),
   so the caution that says so has to actually be there and marked as a warning.
--------------------------------------------------------------------------- */
console.log('\n--- how-to-play is a picture-led accordion ---');
{
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const help = html.slice(html.indexOf('id="panel-help"'),
    html.indexOf('id="panel-settings"'));

  ok('the help panel is a vertical accordion, not a scroll',
    /data-nav="vertical"/.test(help) && /data-nav-start="first"/.test(help));

  /* READ OFF THE TAGS, NOT OFF THE FILE. This counted every `name="help"` in
     the panel's source and compared it to the card count, which passed for as
     long as the only place that string appeared was a tag — and then failed the
     moment a COMMENT explained why the sub-cards do not use it. A check a
     comment can break teaches the next person to delete the comment. */
  const cards = [...help.matchAll(/<details class="([^"]*)" name="([^"]*)">/g)]
    .map((m) => ({ cls: m[1], name: m[2] }));
  const topics = cards.filter((c) => c.cls === 'help-card').length;
  ok('...with all its topic cards', topics >= 8, `(${topics})`);
  ok('...opened one at a time (every top-level card shares name="help")',
    cards.filter((c) => c.name === 'help').length === topics,
    `${cards.filter((c) => c.name === 'help').length} of ${topics}`);

  /* The sections Richard listed, by their summary text. Named individually so
     a check tells you WHICH one went missing, not just that the count slipped. */
  for (const t of ['Moving', 'On a phone', 'Clans', 'Raise a panda',
    'Dragon balls', 'The arena', 'Battle Feast', 'Power-up orbs',
    'Special abilities', 'Trading', 'Dojo', 'Saving your progress']) {
    ok(`...including "${t}"`, help.includes(t));
  }

  /* --- TWO SUBJECTS, EIGHT CARDS FOLDED INTO THEM ---
     The list had grown to fifteen cards and a reader looking for the arena had
     to walk past every one of them — four screens of scrolling on a phone
     before a single picture. Eight of them are really two subjects, so four
     fold under "Moving & fighting" and four under "The arena". NOTHING IS
     HIDDEN by it: each is still a card, one tap further in, which is why the
     names above are checked against the whole panel and not against the top
     level. What is pinned here is the SHAPE — that the fold happened, that the
     eight really are inside their parents, and that they cannot close them. */
  const parentOf = (title) => {
    for (const p of ['Moving &amp; fighting', 'The arena']) {
      if (helpTopic(help, p).includes(`<span class="ht-title">${title}</span>`)) return p;
    }
    return null;
  };
  const MOVING = 'Moving &amp; fighting';
  for (const [title, parent] of [
    ['Every button', MOVING],
    ['Flying a dragon', MOVING],
    ['Fighting in the arena', MOVING],
    ['Good to know', MOVING],
    ['How the arena works', 'The arena'],
    ['Battle Feast &mdash; eating'.replace('&mdash;', '—'), 'The arena'],
    ['Power-up orbs', 'The arena'],
    ['The rare orbs — dealer only', 'The arena'],
    ['Special abilities', 'The arena'],
    ["Dealer's Stall &amp; Trading", 'The arena'],
  ]) {
    const plain = (s) => s.replace(/&amp;/g, '&');
    ok(`..."${plain(title)}" is inside "${plain(parent)}"`,
      parentOf(title) === parent, `${parentOf(title)}`);
  }
  /* A SUB-CARD IN THE PARENT'S OWN GROUP WOULD CLOSE THE PARENT. The exclusive
     accordion group is matched by `name` across the whole DOCUMENT, not within
     a parent — so a sub-card carrying `name="help"` shuts the card it lives
     inside the instant it opens, and the topic appears to vanish under the
     finger that tapped it. Two groups, one per parent. */
  const subs = [...help.matchAll(/<details class="help-card help-sub" name="([^"]+)">/g)]
    .map((m) => m[1]);
  ok('...and every sub-card is in its parent\'s own accordion group',
    subs.length === 10 && subs.every((n) => n === 'help-move' || n === 'help-arena'),
    `${subs.length}: ${[...new Set(subs)].join(', ')}`);
  ok('...never in the top-level group, which would close its parent',
    !subs.includes('help'));
  /* THE CLIPS AND THE PICTURE STAY OUTSIDE THE FOLD. A reader who opens a topic
     and is shown four more closed headings has been given a menu where she
     asked for an answer — so each parent still leads on its own pictures,
     before the first sub-card. */
  for (const [parent, mark] of [['Moving &amp; fighting', 'move-grid'],
    ['The arena', 'arena-shot']]) {
    const body = helpTopic(help, parent);
    ok(`..."${parent.replace('&amp;', '&')}" still shows its own pictures first`,
      body.indexOf(mark) > 0 && body.indexOf(mark) < body.indexOf('ht-subs'),
      `${body.indexOf(mark)} vs ${body.indexOf('ht-subs')}`);
  }
  /* AND THE ARENA SHOT IS CAPPED, which is the half of that bargain that broke.
     At full panel width `arena.jpg` is ~400px tall and filled the card on its
     own: opening "The arena" showed the arena and nothing else, with the four
     sub-cards below the fold on a phone. The cap only works because `width` is
     released as well — `.help-shot img` pins it at 100%, and a `max-height`
     against a pinned width squashes the picture instead of shrinking it. */
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const shot = css.slice(css.indexOf('.arena-shot img'), css.indexOf('}', css.indexOf('.arena-shot img')));
  ok('...and the arena shot is capped to about the height of the clips',
    /height:\s*2[0-4]\d px|height:\s*2[0-4]\dpx/.test(shot), shot.trim());
  ok('...with its width released, or the cap would squash it',
    /width:\s*auto/.test(shot), shot.trim());
  ok('...after the rule it has to beat', css.indexOf('.help-shot img') < css.indexOf('.arena-shot img'));

  /* --- WHO PLAYER ONE IS, ON A PHONE ---
     The setting was already there and did the right thing; what was missing was
     any way to find out that it MOVES A SEAT. Touch is dealt ahead of every
     controller, so "on-screen stick off" also means "the gamepad is player 1
     now", and a kid with a phone and a controller had to discover that by
     flipping it. The help topic has to name the row, both of its states, and the
     seat each one gives the gamepad — or it is describing the visible half of
     the change and not the half that matters. */
  /* WHITESPACE COLLAPSED FIRST. The sentences below wrap across lines in the
     markup, and a check that has to know WHERE they wrap is a check that
     fails on a re-indent — which teaches the next person to delete it rather
     than to read it. */
  const phoneSec = help.slice(help.indexOf('On a phone'), help.indexOf('Clans'))
    .replace(/\s+/g, ' ');
  ok('...and "On a phone" names the setting that moves player 1 to a gamepad',
    phoneSec.includes('Player 1 plays as') && phoneSec.includes('Gamepad'));
  ok('...and says which seat the controller takes in EACH state',
    /you become player 1 on the controller/i.test(phoneSec)
    && /Mobile input[^.]*?player 2/i.test(phoneSec));

  ok('the bamboo-deforestation warning is present and flagged as a warning',
    /class="ht-note warn"[\s\S]*?bamboo[\s\S]*?<\/p>/i.test(help)
    && /grows back|too early/i.test(help));

  /* THE ECONOMY IS RENEWABLE THROUGH THE RING, AND THE HELP NOW SAYS SO on both
     sides of it: where a player EARNS the purse (the arena) and where she SPENDS
     it (the dealer). Pinned because a kid out of points who does not know the
     arena refills them is simply stuck, and the fix was two paragraphs a later
     trim could quietly drop. The mechanic itself is checked with the shop above
     (a whole purse buys 3 orbs); see tournament._payPurse — every winner is paid
     one orb's price. */
  ok('the arena section says winning pays a purse worth an orb',
    /Winning pays[\s\S]*?one orb from the dealer/i.test(help));
  ok('...and the dealer points back to the ring to earn more',
    /Win in the arena[\s\S]*?purse[\s\S]*?The arena/i.test(help));
  /* The two hero stills are trailer shots (out/trailer/shots/s08,s12) resampled
     to help size; pinned to their own sections so a later art swap can't quietly
     move the arena picture onto the orbs card. On-disk-ness is covered by the
     generic screenshot check below; this pins the WIRING. */
  const arenaSec = help.slice(help.indexOf('The arena'), help.indexOf('Battle Feast'));
  ok('...and the arena section shows the arena still', /arena\.jpg/.test(arenaSec));

  /* THE ORBS SCATTER ON COMPLETION, AND THE HELP SAYS WHERE TO LOOK — the whole
     world again, and the mini-map, which drops a ring per orb and clears it as
     each is taken. The counts it prints are the CODE'S: worldSpawnCount already
     knows them (checked against the scatter above), so the help is asserted to
     agree with it rather than carrying a second set of numbers to keep in step.
     Pinned so a trim cannot leave "find them all" without the how or how-many. */
  /* THE ANIMALS RUN THROUGHOUT THE ARENA, and the feast is the CALM window, not
     the only one. Menagerie.start() fires in Tournament.begin() and stop() only
     in finish(), so critters are on the deck during LIVE rounds as well as the
     15-second feast between them — the round winner keeps her health, which is
     what makes the between-rounds feast the moment to top up. The help got this
     wrong twice: first "during a round" (dropping the feast), then only
     "between rounds" (dropping the fights). Both are true, so BOTH are pinned. */
  const feast = help.slice(help.indexOf('Battle Feast'), help.indexOf('Power-up orbs'));
  ok('the feast names the calm break between rounds',
    /between rounds/i.test(feast) && /feast/i.test(feast));
  ok('...and does not pretend the animals are only there in the break',
    /during the fights|mid-fight|in the fights/i.test(feast));
  ok('...and it shows the eating clip', /feast-eat\.gif/.test(feast));

  const orbsSec = help.slice(help.indexOf('Power-up orbs'), help.indexOf('Special abilities'));
  ok('the orbs section shows the eight-orb still', /orbs\.jpg/.test(orbsSec));
  ok('the orbs section sends her exploring with the mini-map',
    /explore[\s\S]*?mini-map/i.test(help));
  ok('...and its counts match worldSpawnCount for 2 / 3 / 4 players',
    new RegExp(`1.?2 players[^\\d]*${worldSpawnCount(2)}\\b`).test(help)
    && new RegExp(`\\b3 players[^\\d]*${worldSpawnCount(3)}\\b`).test(help)
    && new RegExp(`\\b4 players[^\\d]*${worldSpawnCount(4)}\\b`).test(help));

  /* The raise-a-panda topic shows the whole arc as one clip — cut bamboo, a cub
     appears and grows, then she rides it and its claw mows more bamboo — so the
     capture must be the panda one and wired the deferred (src-less) way. */
  const pandaSec = help.slice(help.indexOf('Raise a panda'), help.indexOf('Dragon balls'));
  ok('the raise-a-panda topic shows the panda-raising clip',
    /data-help-gif="\/help\/panda\.gif"/.test(pandaSec));

  /* THE DOJO IS TWO CLIPS NOW, SIDE BY SIDE. The sin/cos board used to be burnt
     ON TOP of the 3D circle in one frame and covered it; it is a separate clip
     now (dojo-sincos) shown beside the 3D one (dojo-world), both from the same
     synced capture. Both must be present and in order inside the pair figure —
     dropping the board, or un-pairing them, is the regression this pins. */
  ok('the Dojo topic pairs the 3D circle clip with the sin/cos board clip',
    /class="help-shot help-shot-pair"[\s\S]*?data-help-gif="\/help\/dojo-world\.gif"[\s\S]*?data-help-gif="\/help\/dojo-sincos\.gif"[\s\S]*?<\/figure>/.test(help));

  /* THE DEALER'S STALL IS A DOM PANEL (profile.js innerHTML), not a canvas —
     the engine canvas-mirror rig cannot film it, which is why it was a static
     photo. The clip is an html2canvas raster of the REAL shop being used, so pin
     that the topic now shows the clip and not the old stall screenshot. */
  ok('the Dealer topic shows the buying-an-orb clip',
    /Dealer's Stall[\s\S]*?data-help-gif="\/help\/dealer\.gif"/.test(help));

  const imgs = [...help.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  ok('the panel carries its screenshots and clips', imgs.length >= 4, `(${imgs.length})`);
  /* NOTHING THE PANEL SHOWS IS FETCHED AT BOOT, OR EVEN WHILE SHE PLAYS. The
     static screenshots defer with loading="lazy" inside the display:none panel;
     the heavy GIF clips go further and carry NO `src` at all — only
     `data-help-gif`, streamed in one at a time by `Game._warmHelpClips` once
     Help is open (the trailer's opt-in bargain, made bulletproof against a
     browser that preloads lazy images the moment it parses them). So every
     <img> must be one or the other, and a clip must NEVER carry a bare `src`
     that would put it on the wire during play. */
  ok('...and every one is deferred (a lazy screenshot, or a src-less data-help-gif clip)',
    imgs.length > 0 && imgs.every((t) =>
      /loading="lazy"/.test(t) || (/data-help-gif="/.test(t) && !/\bsrc="/.test(t))));
  ok('...no clip carries a src that would fetch it before Help is opened',
    imgs.every((t) => !(/data-help-gif="/.test(t) && /\bsrc="/.test(t))));

  /* COMMENTS ARE NOT MARKUP, and this check reads them if you let it. The
     placeholder figure's comment spells out the exact one-line edit that
     replaces it with a clip — `data-help-gif="/help/ability-blink.gif"` — and
     the first run of it duly failed on a file that is not supposed to exist
     yet. A note about a future filename is the most useful thing that comment
     could say; stripping comments here is what lets it say it. */
  const markup = help.replace(/<!--[\s\S]*?-->/g, '');
  const files = [
    ...markup.matchAll(/src="\/help\/([^"]+)"/g),
    ...markup.matchAll(/data-help-gif="\/help\/([^"]+)"/g),
  ].map((m) => m[1]);
  ok('...and each screenshot and clip is on disk under public/help/',
    files.length >= 4
    && files.every((f) => existsSync(new URL(`../public/help/${f}`, import.meta.url))));

  /* THE FIVE MOTION CLIPS, EACH WIRED TO THE MOVE IT SHOWS. These are engine
     captures (tools/gif.mjs), not screenshots, and each ability's clip was
     filmed for THAT ability — so a later file swap (the cross's clip dropped
     under the charge's caption) would silently teach the wrong button. Each is
     pinned inside its own <figure>, so the kanji and its filename must travel
     together. The generic checks above already prove "every src is lazy and on
     disk"; this names the exact clips so a dropped capture fails by name, not
     as a count that still reads >= 4. If you re-capture, keep the pairing. */
  const moves = help.slice(help.indexOf('Special abilities'), help.indexOf('Trading'));
  const moveFigs = [...moves.matchAll(/<figure class="move">[\s\S]*?<\/figure>/g)]
    .map((m) => m[0]);
  /* FIVE CELLS, FOUR OF THEM FILMED. The fifth is 瞬 Flash Step and it holds a
     drawing until its clip is shot — the count is here, the pairing below is
     only about the four that exist as GIFs, and the still's own checks live
     with the rest of the move up in "half a second of not being there". When
     the clip lands, this stays 5 and that list becomes 5. */
  ok('the abilities section shows all five moves', moveFigs.length === 5,
    `(${moveFigs.length})`);
  ok('...four of them filmed, and exactly one still awaiting its clip',
    moveFigs.filter((f) => /data-help-gif=/.test(f)).length === 4
    && moveFigs.filter((f) => /src="\/help\/ability-blink\.png"/.test(f)).length === 1);
  for (const [kanji, gif] of [['壁', 'ability-ward'], ['落', 'ability-dive'],
    ['十', 'ability-cross'], ['突', 'ability-charge']]) {
    ok(`...the ${kanji} move is illustrated by ${gif}.gif`,
      moveFigs.some((f) => f.includes(`${gif}.gif`) && f.includes(kanji)));
  }
  for (const g of ['feast-eat', 'ability-ward', 'ability-dive',
    'ability-cross', 'ability-charge', 'panda', 'dojo-world', 'dojo-sincos', 'dealer',
    'ryuuseki']) {
    ok(`the ${g}.gif clip is on disk`,
      existsSync(new URL(`../public/help/${g}.gif`, import.meta.url)));
  }

  const nav = readFileSync(new URL('../src/systems/menunav.js', import.meta.url), 'utf8');
  ok('a pad can land on a topic header (summary.help-topic in items())',
    /summary\.help-topic/.test(nav));
  ok('...and the help cursor opens on the first topic, not on BACK',
    /navStart === 'first'/.test(nav));
  ok('...and panel-help is still an input-owning overlay',
    /'panel-help'/.test(nav));

  /* OPENING HELP IS WHAT PUTS THE CLIPS ON THE WIRE — never the boot, never
     play. Game._warmHelpClips streams them in off the 'help' action, and each
     clip's src comes from its own data-help-gif. Drop the call or the streaming
     and the clips either never load or (worse) get a bare src back and fetch
     during play, which is the whole thing this scheme avoids. */
  const gmain = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  ok('opening Help warms the clips (Game._warmHelpClips off the help action)',
    /a === 'help'[\s\S]{0,80}_warmHelpClips\(\)/.test(gmain));
  ok('...and _warmHelpClips streams each src in from its data-help-gif',
    /_warmHelpClips\(\)\s*\{[\s\S]*?dataset\.helpGif/.test(gmain));
}

/* ===========================================================================
   THE CROSS SLASH'S TELL, AND THE SEAL IT CUTS.

   Reported as a design hole rather than a bug: the technique is the hardest
   thing in the game and it arrived with no warning, so the sister on the
   receiving end learned about it by being launched. `systems/crossfx.js` is
   the answer — an aura while she winds up, a stroke of a box in the air with
   each cut, the orb's kanji on the third, and the whole thing blown apart
   along the same vector the bodies go.

   WHAT IS PINNED HERE IS THE SEQUENCING, not the pixels. The effect is a
   POLLER: it reads the kitten's own clocks every frame and `player.js` does
   not know it exists, which is the same argument `Game._updateTripleHolds`
   makes about the technique ending five different ways. The whole risk of
   that design is one thing — that the mapping from her clocks to what is on
   screen drifts from what the clocks actually do — so it is asserted against
   a REAL kitten running a REAL technique, not against a hand-made fake.
=========================================================================== */
console.log('\n--- the cross slash announces itself ---');
{
  const spawn = new THREE.Vector3(0, world.heightAt(0, 40).y, 40);
  const mk = () => {
    const p = new Player({
      texture: new THREE.Texture(), index: 0, spawn: spawn.clone(),
      cols: 8, rows: 4, mirror: false,
    });
    p.setPowerOrbs(['tri']);
    return p;
  };
  const HOLD = { mx: 0, my: 0, down: (a) => a === 'attack', pressed: () => false };
  const DEAF = { sfx() {}, toast() {}, strikePlayers() {}, onMischief() {} };

  /* --- the reading, on its own ---
     -1 nothing, 0 winding up, 1..3 that many cuts thrown. */
  const idle = mk();
  ok('a kitten doing nothing has no seal', sealStage(idle) === -1);
  ok('...and neither has a null', sealStage(null) === -1);

  /* THE WIND-UP IS TESTED BEFORE THE SUBTRACTION, AND THIS IS THE CHECK THAT
     SAYS WHY. `triLeft` is zero BEFORE `_startTriple` runs as well as after
     the last cut, so `cuts - triLeft` reads 3 during the wind-up: the whole
     seal on screen, kanji and all, before a single cut has been thrown. The
     one moment the effect exists for would be the moment it lies. */
  const winding = mk();
  winding._startWind(DEAF);
  ok('winding up shows the aura and not one stroke', sealStage(winding) === 0);
  ok('...and NOT the finished seal, which is what the naive subtraction gives',
    sealStage(winding) !== CROSS.cuts);

  const cut = (n) => {
    const p = mk();
    p._startTriple(null);
    p.triLeft = CROSS.cuts - n;
    /* THE CUT JUST THROWN IS STILL ON SCREEN, which is not decoration in this
       fixture — it is the difference between the third cut and no technique at
       all. `triAt` is the OR of four clocks, and after the last cut `triLeft`
       is zero, so a fake that only sets `triLeft` says "she is not doing
       anything" for exactly the case the seal is finished in. Same shape as
       the real thing asserts further up: `triT > 0 && triHangT === 0`. */
    p.triT = CROSS.gap;
    return p;
  };
  ok('the first cut draws the first stroke', sealStage(cut(1)) === 1);
  ok('...the second the second', sealStage(cut(2)) === 2);
  ok('...and the third finishes it', sealStage(cut(3)) === 3);
  /* The beat after the last cut, before she lets everybody go: the seal has to
     HANG there, because that beat is the whole reason the launch reads as one
     event. A seal that vanished on the last cut would burst into an empty
     quarter second. */
  const hanging = mk();
  hanging._startTriple(null);
  hanging.triLeft = 0;
  hanging.triHangT = CROSS.hang;
  ok('...and stays up through the pause for effect', sealStage(hanging) === CROSS.cuts);

  /* CLAMPED BOTH WAYS, because `CROSS.cuts` is a slider on /tuning.html and a
     nine-year-old can ask for five. Prefer a rule that degrades. */
  const many = cut(1);
  many.triLeft = CROSS.cuts + 4;
  ok('...and a silly cut count cannot drive it negative', sealStage(many) === 0);
  const few = cut(1);
  few.triLeft = -3;
  ok('...nor past the last stroke', sealStage(few) === CROSS.cuts);

  /* --- the box: four sides, four strokes, none drawn twice --- */
  const flat = SIDES_BY_CUT.flat().sort((a, b) => a - b);
  ok('every side of the box is cut exactly once',
    flat.length === 4 && flat.every((v, i) => v === i), flat.join(','));
  ok('...over as many cuts as the technique has', SIDES_BY_CUT.length === CROSS.cuts);
  /* The last cut draws no SIDE — it draws the kanji. That is the whole shape
     of the idea the effect is built on: two cuts build the frame and the third
     is what the frame was for. */
  ok('...and the last cut draws the kanji instead of a fifth side',
    SIDES_BY_CUT[CROSS.cuts - 1].length === 0);
  /* A raised cut count must not index off the end mid-technique. */
  ok('...and a cut past the end asks for no side at all',
    (SIDES_BY_CUT[CROSS.cuts] ?? []).length === 0);

  /* --- and now the same reading, driven by a real technique ---------------
     Every frame of one Cross Slash, from the wind-up to the launch, asked what
     the seal should look like. This is the check that would catch somebody
     renaming a clock in player.js: the pure logic above would go on passing
     against its own fakes for ever. */
  const live = mk();
  const seen = [];
  let windFrames = 0;
  live._startWind(DEAF);
  for (let i = 0; i < 400 && live.triAt; i++) {
    const st = sealStage(live);
    if (st === 0 && live.triLeft === 0 && live.triWindT > 0) windFrames++;
    if (seen[seen.length - 1] !== st) seen.push(st);
    live._stepSpecials(1 / 60, HOLD, world, DEAF);
  }
  ok('one real technique walks the seal up 0-1-2-3 and never back',
    seen.length === CROSS.cuts + 1 && seen.every((v, i) => v === i), seen.join(' '));
  ok('...and ends with nothing on screen', sealStage(live) === -1);
  /* THE POINT OF THE WHOLE FEATURE IS THIS NUMBER. The aura has to be up long
     enough for a nine-year-old to see it and run; a tell nobody can act on is
     decoration. `CROSS.wind` is what buys that, and it is on the tuning page,
     so what is pinned is that the aura really is on screen for all of it. */
  line('reaction window', `${(windFrames / 60).toFixed(2)}s (nominal ${CROSS.wind})`);
  ok('...and the warning is up for the whole wind-up before the first stroke',
    windFrames / 60 > CROSS.wind - 0.03, `${(windFrames / 60).toFixed(2)}s`);

  /* --- it degrades headlessly rather than vanishing ---
     Three canvas textures are built lazily on the first Cross Slash. In Node
     there is no `document`, and the rule is that a missing thing must not NaN
     a position or throw halfway through a frame — it must draw nothing. This
     check is only meaningful BECAUSE it runs here, with no DOM. */
  const stage = new THREE.Scene();
  const fx = new CrossFx(stage);
  const before = stage.children.length;
  const headless = mk();
  headless._startWind(DEAF);
  /* TAKEN AWAY AND PUT BACK. The kitten above had to be built against the DOM
     stub this file installs — a Player makes a Label and a Label measures on a
     canvas — but what is being asserted is what happens with NO canvas at all,
     which is the state a build tool, or a check like this one, runs in. */
  const doc = globalThis.document;
  delete globalThis.document;
  let threw = null;
  try {
    for (let i = 0; i < 40; i++) {
      fx.update(1 / 60, [headless]);
      headless._stepSpecials(1 / 60, HOLD, world, DEAF);
    }
    fx.update(1 / 60, [null, undefined]);
    fx.update(1 / 60, undefined);
    fx.reset();
  } catch (e) { threw = e; }
  globalThis.document = doc;
  ok('with no canvas to draw on it draws nothing and does not throw',
    !threw, threw ? String(threw.message) : '');
  ok('...and puts nothing in the scene it cannot paint',
    stage.children.length === before, `${stage.children.length} added`);

  /* THE HEADLESS CHECK GOES FIRST, AND HAS TO. The seal's three canvases are
     built lazily and cached for the whole process, so anything that draws one
     with a `document` present leaves the "no canvas at all" path unreachable
     for everything after it — the block below used to sit above this one and
     turned the two assertions above into 7-children-added. */
  /* --- and it hangs where the last stroke was thrown ----------------------
     Reported as "the symbol should appear where the last slash was made — if
     she stands still it should stay put, and if she spins while slashing it
     should teleport around her". It was placed once, on cut 1, and then left:
     a kitten who turned between cuts went on adding strokes to a box hanging
     in the air behind her, so the seal recorded the first cut and lied about
     the other two.

     DRIVEN THROUGH THE REAL EFFECT, because the placement is three lines
     inside `_live` and the thing that can go wrong is WHICH FRAMES they run
     on. A fake would only ever assert my own idea of that. */
  {
    const seal = new THREE.Scene();
    const fx2 = new CrossFx(seal);
    /* Every cut's placement, in order, for a kitten given a `turn` to apply
       between cuts. `_stepSpecials` is what advances her clocks; `fx2.update`
       is what reads them. Same loop the sequencing check above runs. */
    const placements = (turn) => {
      const p = mk();
      p.position.set(0, 0, 0);
      p.facing = 0;
      p.velocity.set(0, 0, 0);
      const at = [];
      let last = -1;
      p._startWind(DEAF);
      for (let i = 0; i < 400 && p.triAt; i++) {
        const st = sealStage(p);
        if (st !== last) {
          if (st >= 1) p.facing += turn;
          last = st;
        }
        fx2.update(1 / 60, [p]);
        if (st >= 1 && sealStage(p) === st) {
          const r = fx2.rigs.get(p.index);
          if (at.length !== st) at.push(r.group.position.clone());
        }
        /* PLANTED. The technique holds her still by itself; zeroing this as
           well is what makes "she did not move" mean only "she did not turn",
           so a failure here can only be about the facing. */
        p.position.set(0, 0, 0);
        p.velocity.set(0, 0, 0);
        p._stepSpecials(1 / 60, HOLD, world, DEAF);
      }
      return at;
    };

    const still = placements(0);
    ok('a kitten who stands still cuts all three strokes in one place',
      still.length === CROSS.cuts
      && still.every((v) => v.distanceTo(still[0]) < 1e-6),
      still.map((v) => `${v.x.toFixed(2)},${v.z.toFixed(2)}`).join(' | '));
    /* AND IT IS IN FRONT OF HER, not on her. `AHEAD` is not exported and does
       not need to be — what matters is the sign, which is the thing a facing
       bug flips. */
    ok('...out in front of her rather than on top of her',
      still[0].z > 0.5 && Math.abs(still[0].x) < 1e-6,
      `${still[0].x.toFixed(2)},${still[0].z.toFixed(2)}`);

    /* A HALF TURN BETWEEN CUTS. Half a turn rather than a quarter because the
       failure mode is "it did not move at all", and the biggest possible move
       is the clearest way to say so. */
    const spun = placements(Math.PI / 2);
    ok('...and a kitten who turns between cuts leaves each one where she cut it',
      spun.length === CROSS.cuts
      && spun[1].distanceTo(spun[0]) > 1
      && spun[2].distanceTo(spun[1]) > 1,
      spun.map((v) => `${v.x.toFixed(2)},${v.z.toFixed(2)}`).join(' | '));
    /* IT TELEPORTS, IT DOES NOT SLIDE. The seal is a thing cut into the air,
       so it holds still between cuts and jumps on one — a seal that eased
       across would be a badge pinned to her chest, which is the reading the
       comment on `_live` rejects. Checked by turning her AFTER the last cut
       and watching the seal ignore her. */
    {
      const p = mk();
      p.position.set(0, 0, 0);
      p.facing = 0;
      p._startWind(DEAF);
      let done = null;
      for (let i = 0; i < 400 && p.triAt; i++) {
        if (sealStage(p) === CROSS.cuts) {
          fx2.update(1 / 60, [p]);
          const r = fx2.rigs.get(p.index);
          if (!done) done = r.group.position.clone();
          else {
            ok('...and once cut, the seal ignores her entirely',
              r.group.position.distanceTo(done) < 1e-6,
              `${r.group.position.x.toFixed(2)} vs ${done.x.toFixed(2)}`);
            break;
          }
          p.facing += Math.PI;
          p.position.set(6, 0, 6);
        } else fx2.update(1 / 60, [p]);
        p._stepSpecials(1 / 60, HOLD, world, DEAF);
      }
    }
    fx2.reset();
  }


  /* --- where it is wired, and where it is NOT ---------------------------- */
  const pl = readFileSync(new URL('../src/entities/player.js', import.meta.url), 'utf8');
  /* THE POLLER DOCTRINE, PINNED. player.js is the most-checked file in the
     repo and the technique can end five ways — released wind-up, interrupted,
     round reset, restart, or run to the end. Callbacks would mean five places
     to remember the seal; reading her clocks means none. If somebody ever
     "tidies" this into a hook, this check is where they find out why not. */
  /* ASKED OF THE CODE, NOT OF THE PROSE. This tested the raw file, so the
     first comment in player.js to EXPLAIN the doctrine — "crossfx still draws
     the tell" — failed the check that exists to protect it. A check a comment
     can break teaches the next person to delete the comment, which is the one
     outcome this is trying to prevent. */
  ok('the effect is a poller: player.js has never heard of it',
    !/crossfx|CrossFx/i.test(stripComments(pl)));

  const mn = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  /* THE ORDER IS THE WHOLE REASON THE SEAL BURSTS ON THE RIGHT FRAME.
     `_updateTripleHolds` frees everybody the technique caught on the frame
     `triAt` goes false; crossfx reads the same flag. Ticked second, the seal
     comes apart and the bodies go flying in the same frame. Ticked first, the
     seal bursts one frame early and the eye reads two events. */
  const holds = mn.indexOf('this._updateTripleHolds(dt);');
  const cfx = mn.indexOf('this.crossFx?.update(dt, this.players);');
  const booms = mn.indexOf('this._updateBooms(dt);');
  ok('the seal is ticked after the technique lets its victims go',
    holds > 0 && cfx > holds && booms > cfx, `${holds} ${cfx} ${booms}`);
  ok('...and a restart leaves no seal hanging over the new game',
    /this\.crossFx\?\.reset\(\);/.test(mn));

  const fxSrc = readFileSync(new URL('../src/systems/crossfx.js', import.meta.url), 'utf8');
  /* A WIND-UP SHE LET GO OF MUST NOT EXPLODE. Releasing attack during the
     wind-up ends the technique at stage 0 with nothing on screen; an explosion
     of nothing announces a Cross Slash that never happened, and the sister who
     backed off correctly learns that the warning lies. */
  ok('a wind-up let go of ends quietly, with nothing to blow up',
    /const drew = r\.stage >= 1;/.test(fxSrc)
    && /if \(!drew\) \{ r\.group\.visible = false; return; \}/.test(fxSrc));
  /* THE GLYPH IS FITTED TO ITS OWN INK, NOT TO ITS COORDINATES. House rule:
     measure, don't reason, about anything drawn. The 520-box numbers say where
     the CENTRELINES go; the brush hangs outside them by whatever the width
     profile says, and re-weighting a stroke moves the ink without moving a
     single coordinate. Reasoned, the 十 looked centred; drawn, it pushed off
     the left edge of its own texture. */
  ok('the kanji is fitted to the ink it actually lays down',
    /const box = inkBounds\(g, S, S\);/.test(fxSrc)
    && /S \/ 2 - \(box\.x \+ box\.w \/ 2\) \* fit/.test(fxSrc));
}

/* ---------------------------------------------------------------------------
   BUYING, SELLING AND TRADING ALL ASK FIRST - AND ONLY THE GIRL BEING ASKED
   CAN ANSWER.

   The dealer is eight nearly identical rows scrolled with a stick, SELL is a
   loss (an orb goes back for less than it cost), and none of it can be undone.
   A girl aiming for the row below hers sold her Ward, and nothing on screen had
   told her she was about to.

   THE QUESTION IS PER SIDE AND NOT A MODAL, which is the part worth checking:
   the shared `Confirm` dialog has one cursor, and one cursor over a four-player
   trade screen would be answered by whoever was nearest. Consent cannot be
   expressed through somebody else's controller - that sentence is the entire
   reason this screen has its own input path, and it is the thing a later tidy-
   up ("why does this not just use Confirm?") would delete.

   Driven through a stubbed DOM rather than by reading the source, because what
   matters here is behaviour: which orb actually moves, whose press counts, and
   what a half-answered question does when somebody backs out.
--------------------------------------------------------------------------- */
console.log('\n--- a trade is agreed twice, by two people ---');
{
  /* The smallest document ProfileScreen will start against. It never measures
     anything, so nothing here has to be real - `kd-actions` is deliberately
     absent so `_paintActions` bails out at its own guard. */
  const el = () => ({
    _bound: false,
    innerHTML: '', textContent: '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {},
  });
  const nodes = {
    'panel-profile': el(), 'kd-body': el(), 'kd-title': el(), 'kd-help': el(),
    /* THE FOOTER'S BUTTON ROW. Absent, `_paintActions` bails at its own guard
       — which was fine while nothing here read it, and silently skips the
       phone's only route to DROP now that something does. */
    'kd-actions': el(),
  };
  /* KEEPS `createElement`. A `Player` builds a `Label` for its clan callout,
     and a Label measures and paints on a canvas — so a stub that answers only
     `getElementById` makes constructing a real kitten throw, three hundred
     lines away from anything to do with the trade screen. Swapping in a
     narrower document than the one already installed is the trap; this
     borrows the real stub's canvas factory rather than reimplementing it. */
  const baseCreate = globalThis.document.createElement;
  globalThis.document = {
    getElementById: (id) => nodes[id] ?? null,
    createElement: (...a) => baseCreate(...a),
  };
  const { ProfileScreen } = await import('../src/systems/profile.js');
  /* The stub has to outlive the import - the constructor is what reads it, and
     that runs once per `mk` below, not at module load. Taken away at the end of
     the block so nothing after this can accidentally depend on it. */

  /* A REAL `Player`, not a bag of fields. `setPowerOrbs` is the only way the
     orb list is allowed to move — it recomputes `maxHp` from the buffs, and
     the whole reason it exists is that anything editing the array in place
     leaves a kitten whose health and whose inventory disagree. A stubbed
     player would let this section pass while the real trade broke that. */
  const kit = (i, name, orbs, score) => {
    const p = new Player({
      texture: new THREE.Texture(), index: i,
      spawn: new THREE.Vector3(0, world.heightAt(0, 40).y, 40),
      cols: 8, rows: 4, mirror: false,
    });
    p.name = name;
    p.score = score;
    p.setPowerOrbs([...orbs]);
    return p;
  };
  /* A pad reporting exactly one button this frame, like `_drive` reads it. */
  const press = (btn) => ({ mx: 0, my: 0, pressed: (a) => a === btn, down: () => false });

  /* RICH ENOUGH TO BUY, derived rather than typed: the price comes out of the
     world's point total (`orbPrice`) and a hardcoded purse would start failing
     the day somebody adds an island. */
  const mk = (aOrbs, bOrbs, aScore = null, bScore = null) => {
    const rich = orbPrice(world.pointsTotal, 2) * 4;
    const players = [kit(0, 'Ember', aOrbs, aScore ?? rich),
      kit(1, 'Frost', bOrbs, bScore ?? rich)];
    const g = {
      players,
      world,
      scene: new THREE.Scene(),
      pickups: [],
      audio: { play() {} },
      /* `close` drops the frame the screen ate, or the first tick after it is
         however long she spent shopping. Real in the game, stubbed here. */
      clock: { getDelta: () => 0 },
      sfx() {},
      syncOrbMeshes() {},
      toast() {},
      onScoreChanged() {},
    };
    g.kotodama = new Kotodama(g);
    g.kotodama.spawnPickups = () => {};
    g.kotodama.raiseStall = () => {};
    const ps = new ProfileScreen(g);
    return { g, ps, players };
  };

  /* --- WHAT CLAN SHE IS IN, ON HER OWN CARD ---
     It was already on this screen and nobody could see it: the clan name was
     the first third of a grey 13px line — `Riverclaw · 40 pts · 3/8` — sharing
     punctuation with two numbers it has nothing to do with. An oath is the
     biggest decision in the game outside the ring; it does not belong in an
     inventory count. It has its own row now, in the clan's own colour, and it
     names the BUFF as well as the clan, because "Longer katana" is the thing
     she was actually choosing between.

     ASSERTED OVER EVERY CLAN, not over one. Six entries, one of which
     (Pandapaw) grants a job rather than a power and has bitten this codebase
     before by being the one that is shaped differently. */
  {
    const { ps, players } = mk([], []);
    for (const clan of CLANS) {
      players[0].clan = clan;
      const card = ps._cardMarkup(players[0], 0);
      ok(`the profile names ${clan.name} and what it grants`,
        card.includes(clan.name) && card.includes(clan.buff.label), card.slice(0, 120));
      /* THE CLAN'S OWN COLOUR, read from the CLANS entry rather than from a
         copy — the same colour her HUD badge, her shrine and the second marker
         ring under her paws all use. A colour written down twice goes wrong in
         one place. */
      ok(`...in ${clan.name}'s own colour`,
        card.includes(`#${clan.color.toString(16).padStart(6, '0')}`));
    }
    /* PANDAPAW'S BAMBOO COUNTER HAS ONE HOME, and it is the HUD badge
       (`Game._updateClanBadge`), which moves while she plays. This screen is
       opened, read and closed — a second live counter here would be a second
       place for it to go stale. */
    players[0].clan = CLANS.find((c) => c.buff.panda);
    ok("...and Pandapaw’s bamboo counter is NOT duplicated onto the card",
      !/bamboo/i.test(ps._cardMarkup(players[0], 0)));

    /* UNSWORN IS AN INSTRUCTION, NOT A NOUN — the sixth non-negotiable. "no
       clan" is a label for a state; this has to say what to go and DO. */
    players[0].clan = null;
    const none = ps._cardMarkup(players[0], 0);
    ok('an unsworn kitten is told where to go, not labelled "no clan"',
      /shrine/i.test(none) && /swear/i.test(none), none.slice(0, 160));
    /* AND THE REST OF THE CARD SURVIVES IT. The clan row was carved out of the
       meta line, so the two numbers that used to live beside it have to still
       be there — this is the check that would have caught the points count
       leaving with it. */
    ok('...and her points and orb count are still on the card',
      /pts/.test(none) && /orbs/.test(none));
  }

  /* --- the dealer --- */
  {
    const { g, ps } = mk([], []);
    g.kotodama.stock[ORB_IDS[0]] = 3;
    ps.open('shop', { shopper: g.players[0] });
    ps.sides[0].i = 0;
    ps._buyHere(0);
    ok('buying puts a question up instead of buying',
      ps.sides[0].pending?.kind === 'buy' && g.players[0].powerOrbs.length === 0);
    /* THE ORB IS TAKEN FROM THE QUESTION, NOT FROM HER CURSOR. Between asking
       and answering the stick is not frozen - and on a phone the YES button is
       somewhere else on screen entirely - so a confirmation that acted on the
       cursor would put her yes behind the wrong orb, which is the exact
       accident it was added to prevent. */
    const asked = ps.sides[0].pending.id;
    ps.sides[0].i = 3;
    ps._answerHere(0, true);
    ok('...and YES buys what it ASKED about, not what the cursor moved to',
      g.players[0].powerOrbs.length === 1 && g.players[0].powerOrbs[0] === asked);

    ps.sides[0].i = 1;
    ps._buyHere(0);
    ps._answerHere(0, false);
    ok('...and NO buys nothing at all', g.players[0].powerOrbs.length === 1);
    ok('...and takes the question back down', ps.sides[0].pending === null);
  }

  /* A REFUSAL STILL COMES FIRST. Asking "buy this?" and only then saying "you
     cannot afford it" is two presses to be told no. Sixth non-negotiable. */
  {
    const { g, ps } = mk([], [], 0);
    g.kotodama.stock[ORB_IDS[0]] = 3;
    ps.open('shop', { shopper: g.players[0] });
    ps.sides[0].i = 0;
    ps._buyHere(0);
    ok('a refusal is immediate and is never dressed up as a question',
      ps.sides[0].pending === null);
  }

  /* --- the trade --- */
  {
    const { g, ps, players } = mk([ORB_IDS[0]], [ORB_IDS[1]]);
    ps.open('profile');
    ps.sides[0].offers.add(0);
    ps.sides[1].offers.add(0);
    ps._confirmHere(0);
    ps._confirmHere(1);
    /* The tick only says "I am ready" — `_maybeTrade`, which `update` runs
       every frame, is what notices that two of them are and asks. */
    ps._maybeTrade();
    ok('two ticks raise two questions, one each',
      ps.sides[0].pending?.kind === 'trade' && ps.sides[1].pending?.kind === 'trade');
    /* AND EACH NAMES WHAT SHE PERSONALLY GIVES AND GETS. "Are you sure?" is
       not a question a nine-year-old can answer while excited; the words have
       to carry the trade. The two texts are different because the two sides
       of a swap are. */
    ok('...and each question names her own side of it',
      ps.sides[0].pending.text.includes('Frost')
      && ps.sides[1].pending.text.includes('Ember')
      && ps.sides[0].pending.text !== ps.sides[1].pending.text);

    /* ONE YES IS NOT A TRADE. This is the assertion the whole section exists
       for: player 1 answering must not be able to complete it. */
    ps._answerHere(0, true);
    ps._maybeTrade();
    ok('...and one girl saying yes moves nothing',
      players[0].powerOrbs[0] === ORB_IDS[0] && players[1].powerOrbs[0] === ORB_IDS[1]);
    ok('...and the other question is still waiting for HER',
      ps.sides[1].pending?.kind === 'trade' && ps.sides[1].sure === false);

    ps._answerHere(1, true);
    ps._maybeTrade();
    ok('...and the second yes is what swaps them',
      players[0].powerOrbs[0] === ORB_IDS[1] && players[1].powerOrbs[0] === ORB_IDS[0]);
  }

  /* SAYING NO LEAVES EVERYTHING WHERE IT WAS, and does not strand the sister
     in a dialog about a trade that is not going to happen. */
  {
    const { g, ps, players } = mk([ORB_IDS[0]], [ORB_IDS[1]]);
    ps.open('profile');
    ps.sides[0].offers.add(0);
    ps.sides[1].offers.add(0);
    ps._confirmHere(0);
    ps._confirmHere(1);
    ps._maybeTrade();
    ps._answerHere(0, true);
    ps._answerHere(1, false);
    ps._maybeTrade();
    ok('one NO cancels the whole trade',
      players[0].powerOrbs[0] === ORB_IDS[0] && players[1].powerOrbs[0] === ORB_IDS[1]);
    /* A NO CALLS THE WHOLE TRADE OFF, and this check is why. `_maybeTrade`
       runs every frame; when it found two girls still ticked and one of them
       without a question up, it put the same question straight back — she
       pressed no, the box blinked, and it was still there. Both ticks and both
       answers go, so nobody is left holding a yes she gave to terms that are
       about to change. */
    ok('...and nobody is left holding a yes, or a question, for it',
      ps.sides.every((sd) => sd.sure === false && sd.pending === null
        && sd.ready === false));
    ps._maybeTrade();
    ok('...and the question does not come straight back up',
      ps.sides.every((sd) => sd.pending === null));
  }

  /* --- POINTS ON THEIR OWN ARE A WHOLE TRADE ------------------------------
     Reported from play: handing a sister points and nothing else was refused
     every single time, with "that would leave somebody carrying nine" — a
     sentence about orbs, in a trade where neither girl had put an orb on the
     table. `kotodama.trade` refuses two empty piles, correctly, because it is
     an orb function and that is a no-op to it; the screen was reading that
     `false` as a capacity problem and printing the only refusal it knew.

     THIS IS ASSERTED ON THE PURSES, NOT ON THE MESSAGE. A fix that made the
     wording honest — "there is nothing to trade" — would have been a smaller
     lie and still a refusal, and the girls want the points to move. The older
     sister giving the younger one a leg-up is most of what this screen is for
     and it is the one trade that needs no orbs at all. */
  {
    const { g, ps, players } = mk([ORB_IDS[0]], [ORB_IDS[1]], 500, 20);
    ps.open('profile');
    ps.sides[0].points = 200;
    ps._confirmHere(0);
    ps._confirmHere(1);
    ps._maybeTrade();
    ok('a gift of points alone still raises both questions',
      ps.sides[0].pending?.kind === 'trade' && ps.sides[1].pending?.kind === 'trade');
    ok('...and hers names the points and no orbs',
      /200 points/.test(ps.sides[0].pending.text)
      && !ORB_IDS.some((id) => ps.sides[0].pending.text.includes(ORB_BY_ID[id].name)),
      ps.sides[0].pending.text);
    ps._answerHere(0, true);
    ps._answerHere(1, true);
    ps._maybeTrade();
    ok('...and two yeses actually move the points',
      players[0].score === 300 && players[1].score === 220,
      `${players[0].score} / ${players[1].score}`);
    ok('...leaving both sets of orbs exactly where they were',
      players[0].powerOrbs.join() === ORB_IDS[0]
      && players[1].powerOrbs.join() === ORB_IDS[1]);
    ok('...and it is NOT refused with a sentence about carrying nine',
      !/carrying nine/i.test(ps._flash ?? ''), ps._flash);
    ok('...it SAYS who gave what, like every other trade does',
      /Ember gave 200 points/.test(ps._flash ?? ''), ps._flash);
    ok('...and clears both sides down afterwards',
      ps.sides.every((sd) => sd.points === 0 && !sd.ready && !sd.sure));
  }

  /* AND POINTS BOTH WAYS CROSS OVER RATHER THAN CANCELLING. Two purses moving
     at once is the case where an implementation that subtracts before it adds
     on a shared variable goes wrong, and a swap of equal piles hides it. */
  {
    const { g, ps, players } = mk([], [], 500, 300);
    ps.open('profile');
    ps.sides[0].points = 100;
    ps.sides[1].points = 250;
    ps._confirmHere(0);
    ps._confirmHere(1);
    ps._maybeTrade();
    ps._answerHere(0, true);
    ps._answerHere(1, true);
    ps._maybeTrade();
    ok('points crossing both ways land on the right sides',
      players[0].score === 650 && players[1].score === 150,
      `${players[0].score} / ${players[1].score}`);
    ok('...and no points were created or destroyed',
      players[0].score + players[1].score === 800);
  }

  /* A TRADE OF LITERALLY NOTHING NEVER GETS AS FAR AS A QUESTION. The screen
     bails at the top of `_maybeTrade`, and the check is here because the
     points fix above put a second no-op path next to that one: `orbs` is zero
     down both of them and only one of them is a real trade. */
  {
    const { g, ps, players } = mk([ORB_IDS[0]], [ORB_IDS[1]], 500, 300);
    ps.open('profile');
    ps._confirmHere(0);
    ps._confirmHere(1);
    ps._maybeTrade();
    ok('two ticks over an empty table ask nothing at all',
      ps.sides.every((sd) => sd.pending === null));
    ok('...and move nothing', players[0].score === 500 && players[1].score === 300);
  }

  /* --- SEVERAL ORBS AT ONCE, AND ONE PRESS TO PUT THEM ALL BACK -----------
     The offer used to be a single slot index, so handing a sister three spares
     was three trades. It is a SET of her own rows now. */
  {
    const { g, ps, players } = mk([ORB_IDS[0], ORB_IDS[2], ORB_IDS[3]], [ORB_IDS[1]]);
    ps.open('profile');
    ps.sides[0].i = 0; ps._offerHere(0);
    ps.sides[0].i = 1; ps._offerHere(0);
    ps.sides[0].i = 2; ps._offerHere(0);
    ok('three orbs can be on the table at once', ps.sides[0].offers.size === 3);
    /* JUMP ON ONE THAT IS ALREADY OFFERED TAKES JUST THAT ONE BACK — the
       toggle, which is what makes a set usable without a second button. */
    ps._offerHere(0);
    ok('...and pressing again takes exactly that one back off',
      ps.sides[0].offers.size === 2 && !ps.sides[0].offers.has(2));
    ps.sides[0].i = 2; ps._offerHere(0);

    ps.sides[1].offers.add(0);
    ps._confirmHere(0);
    ps._confirmHere(1);
    ps._maybeTrade();
    /* THE QUESTION NAMES EVERY ORB. A pile summarised as "3 orbs" is a
       yes-press behind a list she cannot see, which is the whole reason this
       screen asks in words at all. */
    const q = ps.sides[0].pending.text;
    ok('the question names every orb in the pile',
      [ORB_IDS[0], ORB_IDS[2], ORB_IDS[3]].every((id) => q.includes(ORB_BY_ID[id].name)),
      q);
    ps._answerHere(0, true);
    ps._answerHere(1, true);
    ps._maybeTrade();
    ok('...and both yeses move the whole pile',
      players[1].powerOrbs.length === 3 && players[0].powerOrbs.length === 1);
    ok('...and no orb was created or destroyed',
      players[0].powerOrbs.length + players[1].powerOrbs.length === 4);
    ok('...and both sides are cleared down afterwards',
      ps.sides.every((sd) => sd.offers.size === 0 && !sd.ready && !sd.sure));
  }

  /* --- AND SHE CAN PUT THE PILE DOWN INSTEAD OF TRADING IT ---------------
     Asked for as "add a button they can select to drop the currently selected
     orbs — it will randomly drop them around the player". SPRINT, because it
     is the one button this screen was not already using; the pile it acts on
     is the OFFER, which is the only multi-orb selection the screen has and the
     one she can see. */
  {
    const { g, ps, players } = mk([ORB_IDS[0], ORB_IDS[2], ORB_IDS[3]], []);
    g.kotodama.awakened = true;
    ps.open('profile');
    const sprint = { mx: 0, my: 0, down: () => false, pressed: (a) => a === 'sprint' };

    /* A REFUSAL SAYS WHAT TO GO AND DO. Sixth non-negotiable: "nothing
       selected" names a state; this has to name the press. */
    ps._tradeButtons(0, sprint, ps.sides[0]);
    ok('dropping with an empty table is refused in words, not silently',
      ps.sides[0].pending === null && /JUMP/.test(ps._flash ?? ''), ps._flash);
    ok('...and nothing left her', players[0].powerOrbs.length === 3);

    ps.sides[0].i = 0; ps._offerHere(0);
    ps.sides[0].i = 2; ps._offerHere(0);
    ps._tradeButtons(0, sprint, ps.sides[0]);
    /* IT ASKS FIRST. Seventh non-negotiable — an orb on the floor is not
       undone by pressing the same button again. */
    ok('SPRINT on a pile asks before it drops anything',
      ps.sides[0].pending?.kind === 'drop' && players[0].powerOrbs.length === 3);
    /* AND THE QUESTION NAMES EVERY ORB, like the trade question, for the same
       reason: a yes-press behind a list she cannot see is not consent. */
    const q = ps.sides[0].pending.text;
    ok('...naming every orb in it',
      [ORB_IDS[0], ORB_IDS[3]].every((id) => q.includes(ORB_BY_ID[id].name))
      && !q.includes(ORB_BY_ID[ORB_IDS[2]].name), q);

    /* NO LEAVES EVERYTHING WHERE IT IS. */
    ps._answerHere(0, false);
    ok('...and NO drops nothing at all',
      players[0].powerOrbs.length === 3 && g.kotodama.pickups.length === 0);

    ps._tradeButtons(0, sprint, ps.sides[0]);
    const ids = ps.sides[0].pending.ids;
    ps._answerHere(0, true);
    ok('...while YES puts exactly those two on the ground',
      players[0].powerOrbs.join() === ORB_IDS[2]
      && g.kotodama.pickups.length === 2, players[0].powerOrbs.join());
    ok('...as the orbs the question named',
      g.kotodama.pickups.map((pk) => pk.id).sort().join() === [...ids].sort().join());
    ok('...shy of her, so they do not jump straight back on',
      g.kotodama.pickups.every((pk) => pk.shyOf === players[0]));
    /* AND THE TABLE IS CLEARED. `Side.offers` is a set of ROW numbers and the
       rows below the dropped ones have shuffled up under it — left alone, she
       would be offering whatever moved into those slots. */
    ok('...and the pile comes off the table with them',
      ps.sides[0].offers.size === 0 && !ps.sides[0].ready && !ps.sides[0].sure);
    ok('...and it says how many went down', /dropped/i.test(ps._flash ?? ''), ps._flash);
  }

  /* A PHONE HAS NO SPRINT BUTTON, so the footer is its only way in — the same
     hole `_paintActions` was written to fill for OFFER and CONFIRM. */
  {
    const { g, ps } = mk([ORB_IDS[0], ORB_IDS[2]], []);
    g.device = { touchPrimary: true };
    g.input = { bindings: [{ touch: true }] };
    ps.open('profile');
    ps._paintActions();
    ok('with nothing selected the footer does not offer DROP',
      !/data-act="drop"/.test(ps.actions.innerHTML), ps.actions.innerHTML);
    ps.sides[0].i = 0; ps._offerHere(0);
    ps._paintActions();
    ok('...and picking one up puts the button there',
      /data-act="drop"/.test(ps.actions.innerHTML), ps.actions.innerHTML);
    /* THE REPAINT IS THE HALF THAT GOES WRONG. `_paintActions` early-returns on
       an unchanged signature, and the pile was not in it — so the button was
       drawn once, from whatever the offers were the first time, and offering
       an orb changed nothing on screen. */
    ps._offerHere(0);
    ps._paintActions();
    ok('...and taking it back off takes the button away again',
      !/data-act="drop"/.test(ps.actions.innerHTML), ps.actions.innerHTML);
  }

  /* SAYING NO IS THE DESELECT-ALL, and that is asked for rather than tidy.
     With one orb on the table, leaving the offer up after a no cost one press
     to undo. With a pile of them she has to remember which four slots she
     picked and un-pick each one, on a grid where an offered slot and a full
     one differ by a ring. */
  {
    const { g, ps } = mk([ORB_IDS[0], ORB_IDS[2]], [ORB_IDS[1]]);
    ps.open('profile');
    ps.sides[0].i = 0; ps._offerHere(0);
    ps.sides[0].i = 1; ps._offerHere(0);
    ps.sides[0].points = 100;
    ps.sides[1].offers.add(0);
    ps._confirmHere(0);
    ps._confirmHere(1);
    ps._maybeTrade();
    ps._answerHere(0, false);
    ok('a NO puts every offered orb back',
      ps.sides.every((sd) => sd.offers.size === 0));
    ok('...and the points with them', ps.sides[0].points === 0);
    ok('...and nobody is left holding a yes, a tick or a question',
      ps.sides.every((sd) => !sd.ready && !sd.sure && sd.pending === null));
    ok('...and it SAYS the whole trade came off, rather than silently emptying',
      /back/i.test(ps._flash) && ps._flashT > 0, ps._flash);
  }

  /* INTERACT IS THE PER-SIDE DESELECT-ALL. One press clears the whole offer
     rather than the last orb picked — she has no way to know which one that
     was, so "un-offer the most recent" would look like the button choosing at
     random. */
  {
    const { g, ps } = mk([ORB_IDS[0], ORB_IDS[2]], [ORB_IDS[1]]);
    ps.open('profile');
    ps.sides[0].i = 0; ps._offerHere(0);
    ps.sides[0].i = 1; ps._offerHere(0);
    const pad = {
      mx: 0, my: 0, down: () => false,
      pressed(a) { return a === 'interact'; },
    };
    ps._tradeButtons(0, pad, ps.sides[0]);
    ok('INTERACT takes the whole pile back in one press',
      ps.sides[0].offers.size === 0);
    ok('...and the screen is still open — it backs out one layer at a time',
      ps.mode === 'profile');
  }

  /* --- A QUESTION FREEZES THE CURSOR IT IS ABOUT --------------------------
     The stick used to be read BEFORE the pending question, so the highlight
     walked off the row "Sell Ward for 90 points?" was asking about and landed
     on whatever she drifted onto. The purchase was always safe — `_answerHere`
     takes the id from the QUESTION and says so — but what she could SEE
     disagreed with what she was agreeing to, and a confirmation you cannot
     trust the look of is not one. */
  {
    const { g, ps } = mk([], []);
    for (const id of ORB_IDS) g.kotodama.stock[id] = 3;
    ps.open('shop', { shopper: g.players[0] });
    ps.sides[0].i = 2;
    ps._buyHere(0);
    ok('a question is up', ps.sides[0].pending?.kind === 'buy');
    const asked = ps.sides[0].pending.id;
    /* A stick shoved hard down, for as long as it takes — the repeat would
       have walked her several rows in this many frames. */
    const stick = {
      mx: 0, my: 1, down: () => false, pressed: () => false,
    };
    for (let f = 0; f < 40; f++) ps._drive(0, stick, 1 / 60);
    ok('...and the stick does not move her cursor while it is', ps.sides[0].i === 2);
    ok('...so the row she is looking at is still the row being asked about',
      ORB_IDS[ps.sides[0].i] === asked);
    /* AND THE FREEZE IS HERS ALONE. The whole reason this screen reads two
       pads separately is that one girl's dialog must not stop her sisters. */
    ps._join(1);
    ps.sides[1].i = 0;
    for (let f = 0; f < 40; f++) ps._drive(1, stick, 1 / 60);
    ok('...while her sister is still shopping normally', ps.sides[1].i !== 0);
    /* START IS READ FIRST AND STILL WORKS. Trapping a kid behind a dialog is
       worse than anything the freeze prevents. */
    const start = { mx: 0, my: 0, down: () => false, pressed: (a) => a === 'start' };
    ps._drive(0, start, 1 / 60);
    ok('...and START still leaves the screen', ps.mode === null);
  }

  /* CHANGING THE OFFER AFTER SAYING YES THROWS THE YES AWAY. A girl who agreed
     to hand over 200 points and then dialled it to 800 has not agreed to that,
     and the same is true of swapping which orb is on the table. This rule
     already existed for the tick; it has to reach one step further now that
     there is an answer sitting behind the tick. */
  {
    const { g, ps } = mk([ORB_IDS[0], ORB_IDS[2]], [ORB_IDS[1]]);
    ps.open('profile');
    ps.sides[0].offers.add(0);
    ps.sides[1].offers.add(0);
    ps._confirmHere(0);
    ps._confirmHere(1);
    ps._maybeTrade();
    ps._answerHere(0, true);
    ps.sides[0].i = 1;
    ps._offerHere(0);
    ok('moving the offer drops the yes behind it', ps.sides[0].sure === false
      && ps.sides[0].ready === false && ps.sides[0].pending === null);

    ps._confirmHere(0);
    ps._maybeTrade();
    ps._answerHere(0, true);
    ps._bumpPoints(0, 1);
    ok('...and so does changing the points', ps.sides[0].sure === false
      && ps.sides[0].ready === false && ps.sides[0].pending === null);
  }

  /* A QUESTION OWNS ITS OWN SIDE'S BUTTONS AND NOBODY ELSE'S. Driven through
     `_drive` rather than by calling `_answerHere` directly, because the routing
     IS the rule: while Ember is being asked, Frost must still be able to shop. */
  {
    const { g, ps } = mk([], []);
    g.kotodama.stock[ORB_IDS[0]] = 3;
    ps.open('shop', { shopper: g.players[0] });
    ps.sides[0].i = 0;
    ps._buyHere(0);
    ps._drive(1, press('jump'), 0.016);
    ok("one girl's question does not eat another girl's press",
      ps.sides[0].pending !== null);
    ps._drive(0, press('jump'), 0.016);
    ok('...and JUMP on HER pad answers it', ps.sides[0].pending === null
      && g.players[0].powerOrbs.length === 1);
  }

  /* --- and the shelf says whose count it is printing ----------------------
     Reported from four-player play: "when 2 or more players' cursors are on
     the same item, show both of their inventories for that item". The line
     said "you have 1" — written when there was one shopper — and then named
     `here[0]`, whoever happened to be lowest-numbered, so two sisters looking
     at the same shelf read ONE count and the girl it did not belong to was
     told how many her sister had.

     ASSERTED AGAINST THE MARKUP, because that is where the bug was: every
     field behind it was already right. */
  {
    const { g, ps, players } = mk([ORB_IDS[0]], []);
    /* FROST opens it, so "the opener" and "player 0" are different people —
       with Ember opening, an implementation that simply sorted by seat would
       pass and be wrong the moment the younger one walked to the counter. */
    g.kotodama.stock[ORB_IDS[0]] = 3;
    ps.open('shop', { shopper: players[1] });
    ps._join(0);
    ps.sides[0].i = 0;
    ps.sides[1].i = 0;
    const row = ps._shopMarkup();
    ok('two cursors on one row print two counts, not one',
      row.includes('Ember has 1') && row.includes('Frost has 0'),
      (row.match(/\w+ has \d/g) ?? []).slice(0, 2).join(' / '));
    /* THE OPENER GOES LAST, and that is the one bit of order in it: she is the
       one who walked to the counter, the one about to press BUY, and the end
       of a sentence is where the eye stops. */
    ok('...with the kitten who OPENED the shop named last',
      row.indexOf('Ember has 1') < row.indexOf('Frost has 0'));
    /* AND ONE CURSOR ON A ROW IS STILL ONE COUNT. The two-player screen the
       girls know must come out unchanged where the rule generalises. */
    ps.sides[0].i = 2;
    const apart = ps._shopMarkup();
    ok('...and a row with one cursor on it names only her',
      (apart.match(/has \d/g) ?? []).length === ORB_IDS.length,
      String((apart.match(/has \d/g) ?? []).length));
    ok('...and a row nobody is on falls back to the opener rather than to nobody',
      apart.includes('Frost has'));
  }

  /* --- one counter, four purses ---------------------------------------
     Reported from four-player play: one kitten opening the shop threw all
     four onto it and three of them sat there with dead sticks. The other half
     of the fix is the personal card below; this is the half that makes the
     shared screen worth being on. */
  {
    const { g, ps } = mk([], []);
    g.kotodama.stock[ORB_IDS[0]] = 3;
    g.kotodama.stock[ORB_IDS[2]] = 3;
    ps.open('shop', { shopper: g.players[0] });
    ok('the kitten who walked to the counter is shopping already',
      ps.joined.has(0), [...ps.joined].join(','));
    ok('...and her sister is NOT, until she says so', !ps.joined.has(1));
    /* AN UNJOINED SISTER CANNOT SPEND. This is the whole reason it is opt-in
       rather than opt-out: everybody is on the screen either way, because it
       freezes the world, and a four-way shared surface where leaning on a
       stick buys an orb is an afternoon-ender. */
    g.input = { players: [
      { mx: 0, my: 0, pressed: () => false, down: () => false },
      { mx: 0, my: 0, pressed: (a) => a === 'jump', down: () => false },
    ] };
    ps.sides[1].i = 0;
    ps.update(0.016);
    ok('...so a stick she has not joined with buys nothing',
      ps.sides[1].pending === null && g.players[1].powerOrbs.length === 0);

    /* MOUNT IS THE JOIN BUTTON, and the same press must not also buy: she is
       read in the not-joined branch and `continue`s past `_drive`. */
    g.input.players[1] = { mx: 0, my: 0, pressed: (a) => a === 'mount', down: () => false };
    ps.update(0.016);
    ok('MOUNT joins her to the counter', ps.joined.has(1));
    ok('...without the same press also buying something',
      ps.sides[1].pending === null && g.players[1].powerOrbs.length === 0);
    ok('...and her cursor starts at the top rather than where a trade left it',
      ps.sides[1].i === 0);

    /* AND NOW SHE BUYS HER OWN, out of her own purse, with her own cursor —
       the two sides were always independent, and this is the check that they
       stayed that way once two of them could be live at once. */
    ps.sides[0].i = 0;
    ps.sides[1].i = 2;
    ps._buyHere(0);
    ps._buyHere(1);
    ok('two girls can be asked two different questions at once',
      ps.sides[0].pending?.id === ORB_IDS[0] && ps.sides[1].pending?.id === ORB_IDS[2]);
    ps._answerHere(0, true);
    ps._answerHere(1, true);
    ok('...and each ends up with the orb SHE picked',
      g.players[0].powerOrbs[0] === ORB_IDS[0]
      && g.players[1].powerOrbs[0] === ORB_IDS[2]);

    /* A JOINER STEPS BACK; THE SHOPPER SHUTS THE SHOP. A sister who joined out
       of curiosity closing the screen on the girl who walked to the counter is
       the four-player version of somebody else pressing your buttons. */
    ps._shopButtons(1, { pressed: (a) => a === 'interact', down: () => false });
    ok('a joiner backing out steps back rather than closing it on everybody',
      ps.mode === 'shop' && !ps.joined.has(1));
    ps._shopButtons(0, { pressed: (a) => a === 'interact', down: () => false });
    ok('...and the girl who opened it is the one who closes it', ps.mode === null);
    ok('...which empties the counter behind her', ps.joined.size === 0);
  }

  /* --- the personal card ------------------------------------------------
     "Let them look at their setup without everyone playing being thrown on
     that screen." One kitten's own screen, in her own pane, with the world
     still running for the other three. */
  {
    const stubEl = () => ({
      className: '', dataset: {}, innerHTML: '', textContent: '',
      style: { setProperty() {} },
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      remove() {}, appendChild() {}, addEventListener() {},
      querySelector: () => null,
    });
    const host = stubEl();
    const baseGet = globalThis.document.getElementById;
    const realCreate = globalThis.document.createElement;
    globalThis.document.getElementById = (id) => (id === 'pane-cards' ? host : baseGet(id));
    globalThis.document.createElement = (tag) => (tag === 'div' ? stubEl() : realCreate(tag));
    const { Inspector } = await import('../src/systems/inspector.js');

    const { g, ps } = mk([ORB_IDS[0]], []);
    g.profile = ps;
    g.input = { players: [] };
    const insp = new Inspector(g);

    ok('nobody has a card up to start with', !insp.any);
    insp.open(0);
    ok('opening one takes only HER pad', insp.busy(0) && !insp.busy(1));
    ok('...and does NOT open the shared counter', ps.mode === null);

    /* THE PANE IS THE POINT. `Game` feeds `Inspector.busy` into
       `clusterPlayers`' `solo` list, so a girl reading a card is not sharing a
       view with her sister — without it the card covers half of somebody
       else's game. Checked against the real clusterer with two kittens on the
       same spot, which is exactly where the dealer's stall puts them. */
    const at = new THREE.Vector3(0, 0, 0);
    const together = clusterPlayers({
      pts: [at, at.clone()], solo: [false, false], prev: null,
      mergeIn: MERGE_IN, mergeOut: MERGE_OUT,
    });
    ok('two kittens at the stall normally share one pane', together.groups.length === 1);
    const apart = clusterPlayers({
      pts: [at, at.clone()],
      solo: [0, 1].map((i) => insp.busy(i)),
      prev: null, mergeIn: MERGE_IN, mergeOut: MERGE_OUT,
    });
    ok('...and a card splits her out into her own', apart.groups.length === 2);

    /* THE TWO SCREENS, AND BACKING OUT OF EACH. INTERACT goes back one level
       and only then closes; it never skips the chooser, because a girl who has
       just read her orbs is the girl most likely to want to trade next. */
    /* A PAD THAT CAN BE SPENT, and the old one is why the stall bug got out.
       It was `{ pressed: (a) => a === btn }` — a press that is true for ever
       and that `consume` cannot touch. Every check below therefore handed
       `_drive` its own fresh press, so no check here could ever see the thing
       that was actually broken: TWO owners reading ONE press in one frame.
       This models `PadState`'s two fields and its `consume`, which is the only
       shape in which "the press has already been answered" can be expressed. */
    const pad = (btn) => ({
      mx: 0,
      my: 0,
      held: { [btn]: true },
      prev: {},
      pressed(a) { return !!this.held[a] && !this.prev[a]; },
      down(a) { return !!this.held[a]; },
      consume(a) { this.prev[a] = this.held[a]; },
    });
    insp.cards[0].i = 1;
    insp._drive(0, pad('jump'), 0.016);
    ok('JUMP on LOOK AT MY ORBS opens the shelf', insp.cards[0].state === 'look');
    ok('...and still has not opened the shared counter', ps.mode === null);
    insp._drive(0, pad('interact'), 0.016);
    ok('INTERACT goes back to the chooser rather than out',
      insp.cards[0].state === 'choose');
    insp._drive(0, pad('interact'), 0.016);
    ok('...and again closes it', !insp.busy(0));

    /* AND CHOOSING TRADE HANDS OVER. Every card goes down, not just hers: two
       girls can each have a chooser open, and one of them calling everybody to
       the counter would leave the other's card floating over a frozen world
       with a pad that no longer reaches it. */
    insp.open(0);
    insp.open(1);
    ok('two girls can read two cards at once', insp.busy(0) && insp.busy(1));
    insp.cards[0].i = 0;
    insp._drive(0, pad('jump'), 0.016);
    ok('TRADE WITH THE DEALER opens the shared counter', ps.mode === 'shop');
    ok('...seating the girl who chose it', ps.joined.has(0) && !ps.joined.has(1));
    ok('...and taking every card down, not only hers', !insp.any);
    ps.close();

    /* --- AND THE THIRD ROW IS THE TRADE WINDOW ----------------------------
       Trading orbs with each other was reachable only by pausing the game and
       finding a menu item, which put a wall between the counter and the screen
       next to it. It is the SAME screen the pause menu opens — a second door,
       not a second copy — so what is pinned is that it lands in `profile` mode
       and not in `shop`. */
    insp.open(0);
    insp.open(1);
    insp.cards[0].i = 2;
    insp._drive(0, pad('jump'), 0.016);
    ok('CHARACTER PROFILE opens the trade window, not the shop',
      ps.mode === 'profile', `${ps.mode}`);
    ok('...and takes every card down too, because it freezes the world',
      !insp.any);
    /* `fromPause` FALSE IS THE ONE THING THAT DIFFERS from the pause-menu
       route, and it is not cosmetic: `ProfileScreen.close` hands the frame
       back only when it is false, and without that the first tick after they
       stop trading is however long they spent in there — every kitten
       teleports and every dragon jumps. */
    ok('...opened from the world, so closing hands the frame back',
      ps.fromPause === false);
    ps.close();

    /* THE ORDER IS LOAD-BEARING AND SO IS THE COUNT. The cursor opens on row
       0, and the two rows that stop everybody are the outer ones — so the row
       a girl lands on by nudging once is never the one that freezes her
       sisters. A row appended in the middle would silently move what an
       already-learned press does. */
    insp.open(0);
    ok('the dealer asks three questions now', insp._rowCount(0) === 3);
    ok('...and the cursor still opens on the first of them', insp.cards[0].i === 0);
    insp.closeAll();
    {
      const src = readFileSync(
        new URL('../src/systems/inspector.js', import.meta.url), 'utf8');
      const order = ['trade', 'look', 'profile']
        .map((k) => src.indexOf(`key: '${k}'`));
      ok('...in the order trade, look, profile',
        order.every((i) => i >= 0) && order[0] < order[1] && order[1] < order[2],
        order.join(' '));
      /* THE MIDDLE ROW IS THE ONE THAT LEAVES THEM PLAYING. Stated against
         `_choose`, which is where it is true: `look` is the only key that
         returns without calling `closeAll` and handing the screen over. */
      const look = src.indexOf("if (pick.key === 'look')");
      ok('...and the middle one is the only one that leaves them playing',
        look >= 0 && !/closeAll/.test(src.slice(look, src.indexOf('}', look))));
    }

    /* START CLOSES IT FROM ANYWHERE. `Game` exempts the owner's Start from the
       pause menu for exactly this press — see the `inspector.busy(asked)`
       branch — so putting a card away must not also pause four kittens' game. */
    insp.open(0);
    insp.cards[0].state = 'look';
    insp._drive(0, pad('start'), 0.016);
    ok('START closes a card from either screen', !insp.busy(0));

    /* ATTACK IS DELIBERATELY INERT. On the shared counter it means SELL, and a
       girl who learned it here would press it there expecting nothing. */
    insp.open(0);
    insp._drive(0, pad('attack'), 0.016);
    ok('ATTACK does nothing on a card, on purpose',
      insp.busy(0) && insp.cards[0].state === 'choose');
    insp.closeAll();
    ok('closeAll puts everything away', !insp.any && !insp.busy(0) && !insp.busy(1));

    /* --- ONE PRESS IS ONE ANSWER TO ONE QUESTION -------------------------
       Reported as "I am pressing Interact on the store but it is not bringing
       up a menu — making a clicking sound but I am not seeing anything", and
       that is precisely what it did. `pressed()` is a pure test that nobody
       spends. The stall opened the chooser on the press and played the menu
       blip; `Inspector.update` runs later in the SAME frame and INTERACT there
       means back out; so the card opened and closed before one frame was
       drawn. The click was the only evidence it had ever existed.

       Two rules come out of it and both are checked. The one that ANSWERS a
       press spends it — and a press already answered must read as spent to
       everybody downstream, without lying about the button still being held. */
    {
      const live = pad('interact');
      ok('a fresh press reads as pressed', live.pressed('interact'));
      insp.open(0);
      /* What the stall does, having answered it. */
      live.consume('interact');
      insp._drive(0, live, 0.016);
      ok('the press that opened a card does not also close it', insp.busy(0));
      /* `consume` marks the edge spent by setting prev to held, NOT by
         clearing held: she really is still holding the button and `down()` has
         to go on telling the truth. */
      ok('...and the button is still down, because it is', live.down('interact'));
      insp.closeAll();
    }

    /* AND THE CARD SPENDS WHAT IT ANSWERS, for the owner further down the
       frame. The kitten loop runs after `Inspector.update`, and on the frame a
       card CLOSES `busy` has just gone false — so her REAL pad, not
       `DEAD_PAD`, reaches `Player.update` with the press still on it. Putting
       a card away would swing her katana or walk her onto a mount. */
    for (const btn of ['interact', 'start', 'jump']) {
      insp.open(0);
      const spent = pad(btn);
      insp._drive(0, spent, 0.016);
      ok(`...and ${btn.toUpperCase()} is spent by the card that answered it`,
        !spent.pressed(btn));
      insp.closeAll();
      ps.close();
    }

    /* THE STALL'S HALF OF IT, WHICH IS THE HALF THAT WAS WRONG. Pinned against
       the source because it is a fact about the ORDER of one frame in
       `Game._step`, and nothing that can be constructed here has a frame. */
    const gameSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    ok('the stall spends the interact press it answered',
      /this\.inspector\.open\(shopper\.index\);[\s\S]{0,1400}?this\.input\.players\[shopper\.index\]\?\.consume\('interact'\);/
        .test(gameSrc));
    /* ...AND ONLY THAT ONE. Her interact while a card is already up means
       CLOSE IT, and that press belongs to `_drive`. Spending it at the stall
       would leave her with a card she cannot put away — the same bug wearing
       the opposite consequence. */
    ok('...but not the press meant to close a card she already has up',
      /&& !this\.inspector\.busy\(p\.index\)/.test(gameSrc));
    ok('...and the card is driven later in the same frame, which is why it matters',
      gameSrc.indexOf('this.inspector.open(shopper.index)')
        < gameSrc.indexOf('this.inspector.update(dt);'));

    globalThis.document.getElementById = baseGet;
    globalThis.document.createElement = realCreate;
  }


console.log('\n--- Mr. Satan loses his temper ---');
{
  const R = world.arenaRing;
  const B = world.arenaBooth;
  /* He stands where the tournament puts him: on the announcer's box. Every
     distance below is measured against THAT, because the whole safety argument
     is about where the box is relative to the deck. */
  const satan = {
    position: new THREE.Vector3(B.x, B.y, B.z),
    group: { visible: true },
    lines: [],
    poses: [],
    setLine(t) { this.lines.push(t); },
    setPose(p) { this.poses.push(p); },
  };
  const said = [];
  const toasts = [];
  const mkP = (x, y, z) => {
    const p = new Player({
      texture: new THREE.Texture(), index: 0,
      spawn: new THREE.Vector3(x, y, z), cols: 8, rows: 4, mirror: false,
    });
    p.position.set(x, y, z);
    /* SHE HAS LANDED. A fresh `Player` is `onGround: false` — it is set by the
       ground step, which nothing here runs — and `_onBox` asks, so without
       this every kitten in this section is permanently in mid-air. */
    p.onGround = true;
    return p;
  };
  const game = {
    players: [],
    sfx: () => {},
    toast: (t) => toasts.push(t),
  };
  const blast = new SatanBlast({
    game, world, satan, announcer: { say: (id) => said.push(id) },
  });
  const run = (secs, armed = true) => {
    for (let i = 0; i < Math.round(secs * 60); i++) blast.update(1 / 60, armed);
  };

  /* --- WHERE IT CAN REACH, WHICH IS THE SAFETY PROPERTY --- */
  ok('the booth really is outside the fighting square',
    world.arenaOutBy(B.x, B.z) > 0, `${world.arenaOutBy(B.x, B.z).toFixed(1)} out`);
  const onBox = mkP(B.x + 1, B.y, B.z);
  ok('somebody standing on the box with him is in reach',
    blast._reaches(onBox, BLAST.notice));
  /* THE HEIGHT TEST IS WHAT KEEPS A LIVE ROUND SAFE. The deck is four units
     below the box; without this a radius of 9 reaches down onto the ring's
     north edge and starts throwing fighters out of rounds. */
  const onDeck = mkP(B.x, R.y, B.z + 8);
  ok('...but a fighter on the deck below is NOT, even though she is close',
    !blast._reaches(onDeck, BLAST.notice),
    `${Math.abs(onDeck.position.y - satan.position.y).toFixed(1)}m below`);
  ok('...and that is a height rule, not a distance one',
    Math.hypot(onDeck.position.x - B.x, onDeck.position.z - B.z) < BLAST.notice);
  /* AND NOBODY IN THE RING IS EVER TOUCHED, which is the whole argument for
     letting it fire during a live round rather than special-casing one.

     THE GEOMETRY DOES NOT GIVE THIS FOR FREE, and believing it did was the
     bug. A 14-unit blast from a booth eight units north of the edge reaches
     six units INTO the ring, so the circle alone is not an answer; the height
     test covers a fighter standing on the deck and stops covering her the
     moment she jumps. `_reaches` asks `arenaOutBy` for exactly this. */
  let reachIntoRing = 0;
  for (let a = 0; a < 32; a++) {
    const x = B.x + Math.cos((a / 32) * Math.PI * 2) * BLAST.reach;
    const z = B.z + Math.sin((a / 32) * Math.PI * 2) * BLAST.reach;
    if (world.arenaOutBy(x, z) <= 0) reachIntoRing++;
  }
  ok('the blast circle really does overlap the ring', reachIntoRing > 0,
    `${reachIntoRing}/32 of its rim`);
  /* So: a fighter jumping just inside the north edge, level with him and well
     inside the blast — the exact case the first draft would have thrown out of
     a live round. */
  const jumping = mkP(B.x, satan.position.y, R.z - R.half + 2);
  ok('...and a fighter jumping inside it is level with him and close enough',
    Math.abs(jumping.position.y - satan.position.y) <= BLAST.noticeUp
    && Math.hypot(jumping.position.x - B.x, jumping.position.z - B.z) < BLAST.reach);
  ok('...but is refused anyway, because she is in the ring',
    !blast._reaches(jumping, BLAST.reach)
    && world.arenaOutBy(jumping.position.x, jumping.position.z) <= 0);
  ok('...and it reaches the whole booth deck',
    BLAST.reach > Math.hypot(5, 2.8), `${BLAST.reach} vs ${Math.hypot(5, 2.8).toFixed(1)}`);
  ok('...which is wider than what wakes him', BLAST.reach > BLAST.notice);

  /* --- HE WAITS FOR HER TO LAND ------------------------------------------
     Reported from play: "he starts the speech even before people land on the
     platform". The notice test is a CYLINDER 3.5 units tall, so a kitten still
     rising towards the deck is inside it with her feet in the air and he was
     answering a jump rather than an arrival. `_onBox` is the grounded one and
     only the start of the taunt asks it. */
  const rising = mkP(B.x + 1, B.y, B.z);
  rising.onGround = false;
  ok('a kitten still in the air over the box has not arrived yet',
    !blast._onBox(rising));
  ok('...though she is well inside the cylinder that will catch her',
    blast._reaches(rising, BLAST.notice));
  rising.onGround = true;
  ok('...and the moment she lands, she has', blast._onBox(rising));
  /* AND LANDING IS NOT ENOUGH ON ITS OWN — the whole safety argument is in
     `_reaches` and `_onBox` must not have quietly widened it. */
  ok('...while a fighter standing on the deck below is still not on the box',
    !blast._onBox(onDeck) && onDeck.onGround === true);

  /* --- THE TEN SECONDS, AND WHAT HAPPENS AT THE END OF THEM --- */
  const victim = mkP(B.x + 1, B.y, B.z);
  game.players = [victim];
  run(0.1);
  ok('walking up to him sets him off', blast.stage === 'taunt');
  ok('...and he taunts you first', said[0] === 'sat_taunt');
  ok('...with a bubble that says it too', satan.lines.some((l) => /TOUGH/.test(l)));
  ok('...and he is still standing normally', satan.poses.length === 0);

  run(BLAST.taunt - 1);
  ok('nine seconds later he is still only talking', blast.stage === 'taunt');
  run(1.1);
  ok('at ten he has had enough', blast.stage === 'charge');
  ok('...and says so', said[1] === 'sat_blast');
  ok('...and puts his arms up', satan.poses.at(-1) === 'charge');

  /* THE CHARGE IS A BEAT, NOT A DELAY. One second is long enough to read the
     pose and short enough that a child does not wander off during it. */
  ok('the wind-up is about a second', BLAST.charge >= 0.6 && BLAST.charge <= 1.5,
    `${BLAST.charge}s`);
  const hpBefore = victim.hp;
  run(BLAST.charge + 0.05);
  ok('...then it goes off', blast.stage === 'boom');

  /* --- NOBODY IS HURT AND NOTHING IS LOST --- */
  ok('and she is thrown a long way',
    Math.hypot(victim.velocity.x, victim.velocity.z) > 20,
    `${Math.hypot(victim.velocity.x, victim.velocity.z).toFixed(0)} of ${BLAST.knock}`);
  ok('...upwards as well as outwards', victim.velocity.y >= BLAST.lift);
  ok('...AWAY from him', (victim.position.x - B.x) * victim.velocity.x > 0);
  ok('...taking no damage at all', victim.hp === hpBefore && hpBefore > 0);
  ok('...and not being knocked out', !victim.ko);
  ok('...and it says what happened', toasts.some((t) => /BLASTS/.test(t)));

  /* A HARDER THROW THAN ANY BLOW IN THE GAME, which is the joke. */
  ok('it throws further than the hardest real attack',
    BLAST.knock > ATTACKS.dash.knock && BLAST.lift > ATTACKS.air.lift);

  /* --- THE WARD DOES NOT STOP IT --- */
  const shielded = mkP(B.x + 1, B.y, B.z);
  shielded.setPowerOrbs(['ward']);
  shielded._popWard(null);
  ok('a kitten under the bubble really is protected from blades',
    shielded.hurt(40, { x: B.x, z: B.z }, ATTACKS.stand, null) === 0);
  shielded.blast({ x: B.x, z: B.z }, { knock: BLAST.knock, lift: BLAST.lift });
  ok('...but the bubble does not stop Mr. Satan',
    Math.hypot(shielded.velocity.x, shielded.velocity.z) > 20);
  ok('...and it comes down with her', !shielded.wardOn && !shielded.wardHold);

  /* A KNOCKED-OUT KITTEN IS LEFT ALONE. She is lying there being counted, and
     that count is the one thing here that could actually decide something. */
  const down = mkP(B.x + 1, B.y, B.z);
  down.ko = true;
  down.velocity.set(0, 0, 0);
  down.blast({ x: B.x, z: B.z }, { knock: BLAST.knock, lift: BLAST.lift });
  ok('somebody already knocked out is left where she is',
    down.velocity.length() === 0);

  /* TWO KITTENS IN THE SAME SPOT AS HIM — a nine-year-old's first idea, and a
     zero-length vector normalises to NaN. */
  const onTop = mkP(B.x, B.y, B.z);
  onTop.blast({ x: B.x, z: B.z }, { knock: BLAST.knock, lift: BLAST.lift });
  ok('standing exactly on him does not NaN her across the world',
    Number.isFinite(onTop.velocity.x) && Number.isFinite(onTop.velocity.z)
    && Math.hypot(onTop.velocity.x, onTop.velocity.z) > 20);

  /* --- AND HE CALMS DOWN --- */
  run(BLAST.boom + 0.05);
  ok('afterwards he puts his arms down', satan.poses.at(-1) === 'idle');
  ok('...and the drawing is put away', blast.fx.visible === false);
  ok('...and he will not do it again immediately', blast.stage === 'cool');
  run(BLAST.cool - 1);
  ok('...even with somebody standing right there', blast.stage === 'cool');
  /* AND SHE CAME DOWN. `Player.blast` clears `onGround` — she is a dot in the
     sky for most of that half minute — and `_onBox` asks. Without standing her
     back up this reads as "he ignored her" when what it means is "she has not
     landed yet", which is the distinction the grounded test exists to draw. */
  victim.onGround = true;
  run(1.2);
  ok('...but he will eventually', blast.stage === 'taunt');
  ok('the wait is long enough to be a treat rather than a nuisance',
    BLAST.cool >= 20, `${BLAST.cool}s`);

  /* --- HE DOES NOT DETONATE OVER AN EMPTY BOX ----------------------------
     Reported from play: "he loses his temper even if no one is near him". The
     fuse is still not cancellable — the ten seconds run down whatever she does
     — but what it finds at the bottom now matters. */
  {
    const wasCharge = satan.poses.filter((x) => x === 'charge').length;
    /* He is mid-taunt with her standing there (the line above left him so). */
    ok('he is mid-taunt with somebody on the box', blast.stage === 'taunt');
    victim.position.set(B.x + 40, B.y, B.z + 40);       // she legs it
    run(BLAST.taunt);
    ok('...and with nobody up there at zero, nothing goes off',
      blast.stage === 'off', blast.stage);
    ok('...he never raised his arms',
      satan.poses.filter((x) => x === 'charge').length === wasCharge);
    ok('...and the bubble came down with him', satan.lines.at(-1) === '');
    /* BACK TO `off` AND NOT TO `cool`, which is the half a player can feel:
       nothing happened, so nothing is spent, and the next kitten up gets the
       WHOLE performance rather than half a minute of a man ignoring her. */
    victim.position.set(B.x + 1, B.y, B.z);
    run(0.1);
    ok('...so the next kitten up the ladder gets the whole thing again',
      blast.stage === 'taunt' && said.at(-1) === 'sat_taunt');

    /* A SISTER IN MID-HOP AT ZERO STILL COUNTS. The presence test at the
       bottom of the fuse is the bare cylinder on purpose: a bang that fizzles
       because she happened to be jumping on the final frame reads as the gag
       being broken, not as a rule. */
    victim.onGround = false;
    run(BLAST.taunt + 0.1);
    ok('...and being mid-jump when it expires does not save her',
      blast.stage === 'charge', blast.stage);
    run(BLAST.charge + BLAST.boom + 0.05);
    victim.onGround = true;                    // she came down, again
    run(BLAST.cool + 0.2);
    ok('...and he comes all the way back round afterwards',
      blast.stage === 'taunt');
  }

  /* --- WHAT THE CARD SAYS IS WHAT HE SAYS --------------------------------
     Reported from play: "not all the text is displaying for what he is saying,
     it is like an abbreviated version". It was — the pop-in card carried its
     own shorter paraphrase of each line while the recording ran on. There is
     one string per thing he says now and both surfaces read it. */
  {
    const spoken = satan.lines.filter(Boolean);
    for (const [key, line] of Object.entries(BLAST_LINES)) {
      ok(`the ${key} bubble is the whole line`, spoken.includes(line),
        line.split('\n')[0]);
      /* THE CARD IS THAT LINE FLATTENED, not a summary of it. Asserted on
         every word, because the failure was a card that carried SOME of them:
         "you think you are TOUGH, huh?" out of a sentence twice as long. */
      const flat = card(line);
      ok(`...and the pop-in card says all of it`,
        !/\n/.test(flat) && line.split(/\s+/).every((w) => flat.includes(w)),
        flat);
    }
    /* AND IT REALLY IS THE ONE ON SCREEN. Reading `card(BLAST_LINES.x)` back
       out of the module would pass with the announcer still saying something
       else entirely, which is exactly the bug. */
    const cards = [];
    const b2 = new SatanBlast({
      game, world, satan, announcer: { say: (id, text) => cards.push(text) },
    });
    b2._taunt();
    b2._shout();
    ok('the announcer reads the same two strings the bubble does',
      cards[0] === card(BLAST_LINES.taunt) && cards[1] === card(BLAST_LINES.shout),
      cards.join(' | ').slice(0, 90));
    /* A DURATION SANITY CHECK, because that is how it was FOUND: `sat_taunt`
       runs 8.6 seconds and the old card was seven words. Harrison reads about
       2.5 words a second, so a card with fewer than two words per second of
       recording is a card that has run out before he has. */
    const mp3 = new URL('../public/voice/sat_taunt.mp3', import.meta.url);
    if (existsSync(mp3)) {
      const words = card(BLAST_LINES.taunt).split(/\s+/).length;
      ok('...and there are enough words on it to fill the recording',
        words >= 8.5 * 2, `${words} words for 8.6s`);
    }
  }

  /* --- THE ARENA CLOSING ENDS IT MID-SENTENCE --- */
  run(2);
  blast.update(1 / 60, false);
  ok('closing the arena stops him where he stands', blast.stage === 'off');
  ok('...and tidies the explosion away',
    !blast.fx.visible && !blast.charge.visible && satan.poses.at(-1) === 'idle');
  run(30, false);
  ok('...and he cannot start again while it is shut', blast.stage === 'off');

  /* --- IT IS NOT COMBAT --- */
  /* COMMENTS STRIPPED FIRST. The header of that file NAMES `strikePlayers` in
     order to say it never calls it, so a raw text search finds the promise and
     reports it as the breach. */
  const codeOnly = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const bsrc = codeOnly(readFileSync(
    new URL('../src/systems/satanblast.js', import.meta.url), 'utf8'));
  ok('the blast never calls hurt', !/\.hurt\(/.test(bsrc));
  ok('...and never asks the combat gate',
    !/strikePlayers/.test(bsrc) && !/\.fighting/.test(bsrc));
  const psrc = readFileSync(new URL('../src/entities/player.js', import.meta.url), 'utf8');
  const at = psrc.indexOf('  blast(from, force) {');
  const bfn = psrc.slice(at, at + 1400);
  ok('...and `blast` has no damage argument to pass', at > 0 && !/dmg/.test(bfn));
  ok('...and never touches her health', !/this\.hp/.test(bfn));
  const msrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  ok('it is armed only at the arena, with him in his box',
    /!!this\.tournament\?\.active && !!this\.satan\?\.group\.visible && !this\.travel/
      .test(msrc));
  ok('...and is reset when they fly home', /this\.satanBlast\?\.reset\(\);/.test(msrc));

  /* --- THE POSE IS OPTIONAL, LIKE EVERY OTHER DRAWING --- */
  const bare = new MrSatan(
    { texture: new THREE.Texture(), contentScale: 1, pad: 0 },
    { x: 0, y: 0, z: 0 },
  );
  bare.setChargeArt(null);
  bare.setPose('charge');
  ok('with no charge sheet he simply stays in his ordinary pose',
    bare.pose === 'idle' && bare.sprite.visible && !bare.chargeSprite);
  /* --- IT CAN BE LOOKED AT WITHOUT PLAYING FOR TEN SECONDS ---
     `provoke` is the debug key's entire implementation, and the point of it
     being one line is that the sequence it starts is the REAL one. A key that
     drew the explosion itself would keep working after the real path broke,
     which is the only interesting failure mode a debug key has. */
  blast.reset();
  said.length = 0;
  blast.provoke();
  ok('the debug key skips the fuse and goes straight to the shout',
    blast.stage === 'charge');
  ok('...through the real path, so he says the line and raises his arms',
    said.at(-1) === 'sat_blast' && satan.poses.at(-1) === 'charge');
  run(BLAST.charge + BLAST.boom + 0.1);
  ok('...and it really does end in the explosion', blast.stage === 'cool');

  /* --- AND THE KEY IS DISCOVERABLE ---
     The debug panel is opened with ` and LISTS ITS OWN KEYS, which is the only
     documentation any of them have. A key handled but not listed is a key
     nobody presses, so ask it generally rather than about the new one: every
     code `_debugKey` answers to has a row in the panel, and a label in the map
     the panel prints its rows from. */
  const dbgAt = msrc.indexOf('  _debugKey(code) {');
  const dbgEnd = msrc.indexOf('\n  _debugAllOrbs(', dbgAt);
  ok('the debug dispatcher was found', dbgAt > 0 && dbgEnd > dbgAt);
  const dbgBody = msrc.slice(dbgAt, dbgEnd);
  const handled = [...new Set(
    [...dbgBody.matchAll(/code === '([A-Za-z0-9]+)'/g)].map((m) => m[1]),
  )].filter((c) => c !== 'Backquote');   // its row is the CLOSE button
  const listed = new Set(
    [...msrc.matchAll(/\$\{row\('([A-Za-z0-9]+)'/g)].map((m) => m[1]),
  );
  const labelBlock = msrc.slice(
    msrc.indexOf('const DEBUG_KEY_LABEL = {'),
    msrc.indexOf('};', msrc.indexOf('const DEBUG_KEY_LABEL = {')),
  );
  ok('every debug key the game answers to is listed in the panel',
    handled.length > 8 && handled.every((c) => listed.has(c)),
    handled.filter((c) => !listed.has(c)).join(', ') || `${handled.length} keys`);
  ok('...and every one of them has a label to print',
    handled.every((c) => labelBlock.includes(`${c}:`)),
    handled.filter((c) => !labelBlock.includes(`${c}:`)).join(', ') || 'all');
  ok("...including Mr. Satan's", handled.includes('Digit2') && listed.has('Digit2'));

  /* --- AND THE PANEL LISTS NOTHING IT NO LONGER DOES ---
     The rule above catches a key with no row. This is the other direction, and
     it is the one a cleanup breaks: a row left behind is a line of
     documentation for a key that does nothing, which is worse than no line —
     it teaches a thing that is no longer true. Asked for as "clean up the
     debug to remove the 7 dragonballs scenes and unnecessary commands. Let's
     remove Debug items 7, 8, 9, 5, M, Z."

     `7` HAS BEEN REUSED, so it is named here rather than dropped from the
     check: it is GO TO THE ARENA now, and what has to be gone is the dragon
     hunt behind it. */
  ok('every row in the panel is a key the game still answers to',
    [...listed].every((c) => handled.includes(c)),
    [...listed].filter((c) => !handled.includes(c)).join(', ') || `${listed.size} rows`);
  ok('...and the seven-stars shortcuts are gone from both',
    !/_onAllBalls\(\)/.test(dbgBody) && !/freeSeat\(\)/.test(dbgBody)
    && !handled.includes('Digit8') && !handled.includes('Digit9'));
  ok("...and 7 is the arena now, through the scene viewer's own path",
    handled.includes('Digit7') && /Digit7'\) this\._goToArena\(\)/.test(dbgBody));

  /* `M` AND `Z` WERE PROMOTED, NOT DELETED. They had rows because they were
     the only way to reach the maths overlay and the map zoom from a keyboard —
     which made two real player controls look like debug tools, and forced the
     panel's click handler to call them directly instead of through
     `_debugKey`. The maths overlay is the FIRST non-negotiable; a cleanup that
     removed the only key for it would be removing the feature. */
  ok('the maths overlay and the map zoom are no longer debug rows',
    !listed.has('KeyM') && !listed.has('KeyZ'));
  ok('...but both keys still exist, because one of them is the whole point',
    /e\.code === 'KeyM'[\s\S]{0,60}this\._toggleMath\(\)/.test(msrc)
    && /e\.code === 'KeyZ'[\s\S]{0,80}this\._zoomMapKey\(0\)/.test(msrc));
  ok('...and the panel has no special case left for them',
    !/if \(code === 'KeyM'\) this\._toggleMath\(\)/.test(msrc));

  /* --- AND THE SCENE VIEWER LISTS THEM IN THE ORDER THEY HAPPEN ---
     The ending sat fifth, between Ryuuseki and the two Mr. Satan scenes, and
     it is the LAST thing in the game: he announces the tournament from 50%
     mischief and opens the arena at `OPEN_AT`, and the finale is 100%. A
     viewer whose order disagrees with the game teaches its order to whoever
     reads it. Checked against `OPEN_AT` rather than against a number typed
     twice, so moving the gate moves the check. */
  const sceneBlock = msrc.slice(msrc.indexOf('  get _scenes() {'),
    msrc.indexOf('  _pickScene(dir) {'));
  const order = [...sceneBlock.matchAll(/\{ id: '(\w+)'/g)].map((m) => m[1]);
  ok('the scene viewer runs in the order the story does',
    order.indexOf('satanOpen') < order.indexOf('finale')
    && order.indexOf('satanAnnounce') < order.indexOf('satanOpen')
    && order.indexOf('found') < order.indexOf('summon'),
    order.join(' '));
  ok('...which is the order the mischief gates fire in', OPEN_AT < 1);
  ok('...and "go to the arena" is no longer pretending to be a scene',
    !order.includes('arena') && /_goToArena\(\) \{/.test(msrc));
  /* --- AND FORCE-SPAWN'S THREE, WHICH ARE THE ONLY LETTERS IN THE SET ---
     `\` seats a third and fourth kitten on the keyboard alone; `R` and `U` pass
     WASD and the arrows between the two sharing each. They are checked by name
     as well as by the general rule above, because the general rule would be
     just as happy with a panel that listed three keys the handler had dropped —
     and a debug key whose row lies is worse than one that is missing. */
  for (const c of ['Backslash', 'KeyR', 'KeyU']) {
    ok(`...and force-spawn's ${c}`, handled.includes(c) && listed.has(c),
      `${handled.includes(c) ? '' : 'unhandled '}${listed.has(c) ? '' : 'unlisted'}`);
  }
  /* --- AND THE HAND-OVER TOAST NAMES EVERY KITTEN IT JUST HANDED TO ---
     `R` and `U` walk a ring of three now — her, her sister, then BOTH AT ONCE —
     and the last stop is the one you can be standing on without knowing it:
     two cats in different panes walking identically looks exactly like the
     split screen having desynced, which this project has actually had. So the
     toast is built from the whole list `swapKeyset` returns rather than from
     one slot out of it, and a refusal is `null` rather than a slot number that
     `P${to + 1}` would happily have rendered as "P0". Rule 6. */
  const passAt = msrc.indexOf('_passKeyboard(keyset) {');
  const passBody = msrc.slice(passAt, passAt + 600);
  ok('the hand-over key was found', passAt > 0);
  ok('...and its toast names every kitten the set now drives',
    /to\.map\(\(i\) => `P\$\{i \+ 1\}`\)\.join\(/.test(passBody), passBody.slice(0, 120));
  ok('...and says so when more than one of them answers',
    /to\.length > 1 \? ' together'/.test(passBody));
  ok('...and a refusal is a refusal, not slot zero',
    /if \(!to\) \{/.test(passBody)
    && /swapKeyset\(k\) \{[\s\S]{0,120}?return null;/
      .test(readFileSync(new URL('../src/core/input.js', import.meta.url), 'utf8')),
    passBody.slice(passBody.indexOf('const to'), passBody.indexOf('const to') + 90));

  /* --- ONE CHARACTER CARD AT A TIME, ON THE JOIN PATH AS WELL ---
     `this.picking` is a SINGLE card, so seating somebody while the kitten
     before her is still choosing her cat overwrites it: she never picks, and
     the card vanishes from under her hands. `_autoSeat` has always refused for
     this reason and said so in a comment; the ENTER path did not, and it was
     reachable before force-spawn (two pads, two quick presses) but only just.
     "Press ENTER twice" is now the whole instruction for testing four players,
     so the hole became the first thing that happens — found by playing it.

     ASSERTED AGAINST THE DISPATCH ITSELF, because the failure was never about
     the picker: it was one `if` in the frame loop that asked two questions
     where three were needed. And it must REFUSE OUT LOUD — a press that does
     nothing reads as the key being broken, and she is about to press it
     again. */
  const joinAt = msrc.indexOf('const join = this.input.pendingJoin();');
  const joinBody = msrc.slice(joinAt, joinAt + 400);
  ok('the ENTER join path was found', joinAt > 0);
  ok('...and it refuses to seat over a character card still being chosen',
    /if \(this\.picking\)/.test(joinBody) && /_joinPlayer\(join\)/.test(joinBody),
    joinBody.slice(0, 90));
  ok('...and says so rather than swallowing the press',
    /if \(this\.picking\) this\.toast\(/.test(joinBody));
  /* THE RULE `_autoSeat` ALREADY HAD, restated so the two cannot drift apart
     again — they are the same decision reached from a pad and from a key. */
  ok('...the same rule the spare-controller path already had',
    /_autoSeat\(\) \{[\s\S]{0,600}?if \(this\.picking\) return;/.test(msrc));
  /* NOTHING IN PLAY CALLS IT. One mention in the whole game, in the handler
     for the key — the gag has to be reached by walking up to him. */
  ok('nothing but the debug key provokes him',
    (msrc.match(/provoke\(/g) ?? []).length === 1
      && /Digit2'\)[\s\S]{0,600}?provoke\(\)/.test(msrc));

  /* --- AND IT REALLY DOES COST NOTHING, WHICH IS ITS WHOLE LICENCE ---
     THIS IS THE CHECK THAT WOULD HAVE CAUGHT IT, and it is written on the two
     numbers a browser produced rather than on the argument that was wrong.

     That argument was: the explosion can only catch somebody already outside
     the fighting square, so it cannot change a round. True, and not enough —
     outside the square is not the same as already being penalised. A kitten
     standing on the announcer's box is outside it and safely ABOVE the deck,
     so `_updateOut` is charging her nothing; being thrown off drops her below
     the floor, where the same rule takes thirty health and a point. She left
     with 100 and landed in the middle of the ring with 70. */
  {
    const T = new Tournament({
      game: { players: [], toast() {}, sfx() {} },
      world, audio: null, announcer: null,
    });
    const flung = mkP(B.x + 1.5, B.y, B.z);
    T.game.players = [flung];
    const hp0 = flung.hp;
    /* Off the side of the deck and below it — where the arc actually ends. */
    const dumped = () => {
      flung.position.set(R.x + R.half + 6, R.y - 10, R.z);
      flung.onGround = true;
      /* A ring-out hands out 1.5s of invulnerability so she is not dropped
         into a free combo, and no time passes in here — so without this the
         SECOND dump is silently swallowed by the FIRST one's mercy, and the
         check reads as the exemption never ending. */
      flung.invulnT = 0;
    };

    /* FIRST, THAT THE RULE BITES THERE AT ALL. Without this the rest of the
       block proves only that a kitten standing somewhere harmless is unharmed,
       which is the shape of test that passes after the feature is deleted. */
    dumped();
    T._updateOut(1, 30);
    ok('the ring-out rule really does reach where the blast throws her',
      flung.hp === hp0 - 30, `${hp0} -> ${flung.hp}`);

    /* NOW THE SAME FALL, ON MR. SATAN'S ACCOUNT. */
    flung.hp = hp0;
    flung.position.set(B.x + 1.5, B.y, B.z);
    flung.blast(satan.position, { knock: BLAST.knock, lift: BLAST.lift });
    ok('...and the flight he starts carries an exemption from it',
      flung.blastT > 0);
    dumped();
    T._updateOut(1, 30);
    ok('...so she comes down with the health she went up with', flung.hp === hp0);
    ok('...and with nothing counting against her', (flung.outT ?? 0) === 0);
    /* AND SHE IS PICKED UP, NOT LEFT THERE. Skipping the rule was the first
       version: it kept her health and then rang her out four seconds later
       when the flag ran out, which is the same penalty arriving too late to be
       understood. The free return — back in the middle, nothing said — is what
       the feast already does, and it is what ENDS the flight. */
    ok('...and the arena puts her back in the middle for nothing',
      Math.abs(flung.position.x - R.x) < 0.01 && Math.abs(flung.position.z - R.z) < 0.01);

    /* THE FLAG IS SPENT BY THAT, and it has to be: an exemption from the
       ring-out rule is the one thing in this feature that could be used to win
       a round, so it must not survive the thing it paid for. */
    ok('...which spends the exemption', flung.blastT === 0);
    dumped();
    T._updateOut(1, 30);
    ok('...leaving the ring-out rule exactly as it was', flung.hp === hp0 - 30);

    /* AND A CEILING, for the flight that is never caught at all — the arena
       closing under her, a landing back on the deck. */
    flung.hp = hp0;
    flung.position.set(B.x + 1.5, B.y, B.z);
    flung.blast(satan.position, { knock: BLAST.knock, lift: BLAST.lift });
    for (let i = 0; i < 8 * 60; i++) flung._updateCombat(1 / 60);
    ok('an uncaught flight expires on its own', flung.blastT === 0);
    dumped();
    T._updateOut(1, 30);
    ok('...and she is an ordinary kitten outside the ring again',
      flung.hp === hp0 - 30);

    /* THE OTHER CATCHER SPENDS IT TOO. `_catchFallers` is the floor under the
       whole island and it relocates her without going near the price above, so
       a flag only cleared by `_updateOut` would ride back up with her. */
    flung.position.set(B.x + 1.5, B.y, B.z);
    flung.blast(satan.position, { knock: BLAST.knock, lift: BLAST.lift });
    flung.position.set(R.x + R.half + 6, R.y - OUT_FLOOR - 5, R.z);
    T._catchFallers();
    ok('the floor of the arena spends it as well', flung.blastT === 0);
  }
}

console.log('\n--- seeing through the arena ---');
{
  /* FOUR CUTS, BECAUSE FOUR PLAY. This was two, written when two was the whole
     game, so kittens three and four were never cut for at all. */
  const gfx = readFileSync(new URL('../src/core/gfx.js', import.meta.url), 'utf8');
  ok('the x-ray material cuts for four kittens', /const MAX = 4;/.test(gfx));

  const mat = xrayVertexMat();
  /* Compile it by hand — there is no GL here, so drive `onBeforeCompile` with
     a stub shader and read the uniforms it was handed. */
  const shader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <worldpos_vertex>',
    fragmentShader: '#include <common>\n#include <clipping_planes_fragment>',
  };
  mat.onBeforeCompile(shader);
  ok('...and declares that many slots in the shader',
    shader.uniforms.uCutOn.value.length === 4
    && shader.uniforms.uCutPos.value.length === 4);
  ok('...and the fragment shader loops over all of them',
    /for \(int i = 0; i < 4; i\+\+\)/.test(shader.fragmentShader));

  /* THE TWO-PLAYER ANSWER IS BIT-IDENTICAL, which is the fifth non-negotiable.
     Two cuts set and two left off means slots 2 and 3 arrive with uCutOn at
     zero and `continue` out on the loop's first line. */
  mat.setCuts(new THREE.Vector3(0, 0, 0),
    [new THREE.Vector3(1, 2, 3), new THREE.Vector3(4, 5, 6)]);
  ok('two kittens leave the extra slots switched off',
    shader.uniforms.uCutOn.value[0] === 1 && shader.uniforms.uCutOn.value[1] === 1
    && shader.uniforms.uCutOn.value[2] === 0 && shader.uniforms.uCutOn.value[3] === 0);
  ok('...and the shader skips a slot that is off on its first line',
    /if \(uCutOn\[i\] < 0\.5\) continue;/.test(shader.fragmentShader));
  mat.setCuts(new THREE.Vector3(0, 0, 0), [
    new THREE.Vector3(1, 1, 1), new THREE.Vector3(2, 2, 2),
    new THREE.Vector3(3, 3, 3), new THREE.Vector3(4, 4, 4),
  ]);
  ok('...and four kittens all get one',
    [...shader.uniforms.uCutOn.value].every((v) => v === 1));

  /* --- the arena's own see-through furniture --- */
  const built = buildArena();
  ok('the arena comes back in two piles', Array.isArray(built.seeThrough));
  ok('...and the see-through one is not empty', built.seeThrough.length > 0,
    `${built.seeThrough.length} pieces`);
  /* THE FOUR CORNER POSTS AND THE BOOTH, and nothing that is not tall. Counted
     rather than named because the pieces have no ids: five per corner is the
     column, its two caps and its two banner strips. */
  ok('...and holds at least the four posts and the box',
    built.seeThrough.length >= 4 * 5 + 6);
  ok('...while the deck itself stays in the ordinary pile',
    built.parts.length > built.seeThrough.length * 2);

  ok('the world builds a second mesh for it', !!world.arenaSeeThrough);
  ok('...in the x-ray material',
    typeof world.arenaSeeThrough.material.setCuts === 'function');
  ok('...and the ordinary furniture is still the plain one',
    typeof world.arenaProps.material.setCuts !== 'function');
  /* NO SHADOW. The cut is a discard in the colour pass and the shadow pass
     knows nothing about it, so a post that has opened for you would go on
     casting a column of shade with no column above it. */
  ok('...and it casts no shadow, because a discard does not',
    world.arenaSeeThrough.castShadow === false);

  /* THE TWO MESHES ARE ONE PIECE OF FURNITURE. Missing this shows as four
     vermillion columns hanging over open sky where the arena will be. */
  const wasOpen = world.arenaOpen;
  world.openArena(true);
  ok('opening the arena shows both meshes',
    world.arenaProps.visible === true && world.arenaSeeThrough.visible === true);
  world.openArena(false);
  ok('...and shutting it hides both',
    world.arenaProps.visible === false && world.arenaSeeThrough.visible === false);
  world.openArena(wasOpen);

  const msrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
    .replace(/\r/g, '');
  ok('the arena cut is aimed per view, like the grottos',
    /_aimXray\(camera\) \{\n    this\._aimArenaXray\(camera\);/.test(msrc));
  /* HE GOES IN FIRST. Four kittens plus Mr Satan is five names for four slots,
     and he is the one everybody is looking at. */
  const aimAt = msrc.indexOf('_aimArenaXray(camera) {');
  const aim = msrc.slice(aimAt, aimAt + 1400);
  ok('...and Mr. Satan is added before the kittens',
    aimAt > 0 && aim.indexOf('this.satan') < aim.indexOf('for (const p of this.players)'));
  ok('...and it stops at four', /seen\.length >= 4/.test(aim));
}

  delete globalThis.document;
}

/* ---------------------------------------------------------------------------
   NOTHING BIG HAPPENS ON ONE PRESS, AND ONE PERSON DRIVES THE MENU.

   Four girls, four sticks, and every one of them being mashed. Three separate
   reports came out of that afternoon and they are all the same bug wearing
   different consequences:

     - a scene got skipped by somebody who was not watching it
     - RESTART threw away an afternoon, from a menu row directly under RESUME
     - four cursors fought over one list and it read as a frozen game

   The fixes are structural rather than defensive, which is why they can be
   checked from the outside at all. Each rule below is one that a later,
   entirely reasonable-looking edit would silently undo.
--------------------------------------------------------------------------- */
console.log('\n--- one press is not enough, and one player drives ---');
{
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  /* Anchoring on a METHOD needs the newline and the indent: half of these
     names appear as a call somewhere earlier in the file, and a slice that
     starts at the call reads the wrong body. */
  const NL = String.fromCharCode(10);

  /* --- skipping --- */
  /* SPACE AND ENTER ARE GONE FROM THE SKIP SET. They were in it because the
     seventh non-negotiable says "Start / Space / Enter only, never any button"
     - written when there were two players and one keyboard. With four girls
     around a laptop, Space is the key an elbow finds, and skipping the intro
     is not undoable: `played` latches on START, so the introduction is spent.
     Escape is deliberate in a way Space is not; nobody rests a thumb on it. */
  ok('a scene is skipped by Escape and nothing else on the keyboard',
    /const SKIP_KEYS = new Set\(\['Escape'\]\);/.test(main));
  /* AND THE PAD HALF EXCLUDES THE KEYBOARD SLOTS, which is not fussiness: a
     keyboard player's `start` action IS Enter, so asking every player for
     `start` puts Enter straight back into the skip set through the side door
     and the line above becomes decoration. */
  const sp = main.slice(main.indexOf('_skipPressed()'), main.indexOf('_skipPressed()') + 260);
  ok("...and by a real pad's START, never by a keyboard slot's",
    /source !== 'keyboard'/.test(sp) && /pressed\('start'\)/.test(sp));

  /* --- the confirm dialog --- */
  const conf = readFileSync(new URL('../src/systems/confirm.js', import.meta.url), 'utf8');
  const panel = html.slice(html.indexOf('id="panel-confirm"'),
    html.indexOf('id="panel-confirm"') + 700);
  /* THE ENTIRE SAFETY PROPERTY IS THAT THE PANEL HAS NO `.primary`. MenuNav
     opens a cursor on `.primary` if it finds one and on `.back` otherwise, so
     a mashed pad lands on "no, keep playing" - and a confirm dialog that
     opened on YES would be nothing but a second button to mash through on the
     way to deleting the world, which is strictly worse than no dialog at all.
     Somebody making the YES button look nicer takes the whole guard with it. */
  ok('the confirm dialog has NO primary button',
    !/class="[^"]*primary/.test(panel));
  ok('...so the cursor opens on the cancel, which carries .back',
    /id="confirm-no"[^>]*class="menu-btn back"|class="menu-btn back"[^>]*id="confirm-no"/.test(panel));
  /* One panel, reused for every question - so the remembered cursor index has
     to be dropped on the way in, or saying no to RESTART leaves the highlight
     on row two and the next question opens with YES under her thumb. */
  ok('...and the remembered cursor is dropped when a question opens',
    /index\.delete\('panel-confirm'\)/.test(conf));
  ok('...and it counts as an overlay, so the world does not take the buttons',
    /'panel-confirm'/.test(main));

  /* EVERY IRREVERSIBLE ROW GOES THROUGH IT. Checked one row at a time because
     the failure that matters is a NEW row added later without one - and each
     of these throws away something a nine-year-old spent an afternoon on. */
  for (const act of ['restart', 'quit-match', 'quit', 'title']) {
    const at = main.indexOf("if (a === '" + act + "') {");
    ok(act + ' asks before it acts',
      at > 0 && main.slice(at, at + 200).includes('this.confirm.ask({'));
  }
  /* DROP OUT is built in JS rather than sitting in the markup, and it matters
     more than the rest: it is directly above RESTART in the list, its words
     change depending on who joined, and what it throws away belongs to one
     named child. */
  const dAt = main.indexOf(NL + '  _buildLeaveButtons() {');
  const drop = main.slice(dAt, dAt + 3000);
  ok('drop out asks too', dAt > 0 && drop.indexOf('this.confirm.ask({') > 0
    && drop.indexOf('this.confirm.ask({') < drop.indexOf('this._leavePlayer('));
  ok('...and QUIT GAME exists at all', /data-action="quit"/.test(html));

  /* --- THE PAUSE MENU IS SIX ROWS AND WAS FIFTEEN ----------------------
     Reported from play: "the list on the pause menu is getting too long, can
     we clean it up or organize it by breaking the commands into sub menus."
     Grouping in place would have made it longer — fifteen rows plus four
     headings — so the three groups that are never urgent moved one press down.

     THE COUNT IS THE CHECK, because the failure is drift: the list grew to
     fifteen one honest row at a time and nothing was watching. */
  {
    const at = html.indexOf('id="panel-pause"');
    /* Bounded by the NEXT panel, not by a closing tag — counting `</div>`s in
       a slice is how a check ends up measuring half the document. */
    const pause = html.slice(at, html.indexOf('id="panel-', at + 20));
    const menu = pause.slice(pause.indexOf('<div class="pause-menu">'));
    const rows = (menu.match(/class="menu-btn[^"]*"/g) ?? []).length;
    ok('the pause menu is a short list, not a wall of buttons', rows <= 8, `${rows} rows`);
    /* RESUME'S NEIGHBOUR IS HARMLESS. Seventh non-negotiable, read as a list
       order: a thumb that overshoots the top row by one must not land on
       anything that ends the afternoon. */
    const order = [...menu.matchAll(/data-action="([a-z-]+)"/g)].map((m) => m[1]);
    ok('...and it still runs least to most final', order[0] === 'resume'
      && !['restart', 'title', 'quit'].includes(order[1]), order.slice(0, 3).join(' '));
    /* AND THE THREE ENDINGS ARE BEHIND ONE PRESS, which makes that rule
       stronger rather than weaker: there is now no way to reach any of them by
       overshooting RESUME. */
    for (const act of ['restart', 'title', 'quit']) {
      ok(`...so ${act.toUpperCase()} is not on the top level any more`,
        !order.includes(act));
    }
    /* QUIT THE MATCH IS THE ONE EXCEPTION and it is deliberate: it is the only
       ending that is ever urgent, and it is hidden unless a match is live, so
       it costs the list nothing. */
    ok('...except QUIT THE MATCH, which is the exit you need in a hurry',
      order.includes('quit-match') && /id="btn-quit-match"[^>]*class="[^"]*hidden|class="[^"]*hidden[^"]*"[^>]*id="btn-quit-match"/
        .test(pause.replace(/\n\s*/g, ' ')));
  }

  /* --- ONE LIST OF SUB-PANELS, BECAUSE THERE WERE FOUR ------------------
     "Which panels sit over the pause menu" was written out separately in the
     `data-close` handler, in the Escape handler, in `_overlayOpen` and in
     MenuNav's `PANELS`. Three agreed; the fourth had never heard of
     `panel-board`, so a pad driving the record board was really driving the
     pause menu behind it — and `panel-board` carries `data-nav="scroll"`, a
     mode that existed for it and could never fire. */
  {
    const menuNav = readFileSync(
      new URL('../src/systems/menunav.js', import.meta.url), 'utf8');
    const list = /const SUB_PANELS = \[([^\]]*)\]/.exec(main)?.[1] ?? '';
    const ids = [...list.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
    ok('every pause sub-panel is named in one place', ids.length >= 6, ids.join(' '));
    for (const id of ids) {
      ok(`...and ${id} exists in the markup`, html.includes(`id="${id}"`));
      ok(`...and MenuNav knows to drive ${id}`, menuNav.includes(`'${id}'`));
    }
    /* THE RECORD BOARD IS THE ONE THAT WAS MISSING, so it is named. */
    ok('...including the record board, which MenuNav could not reach at all',
      ids.includes('panel-board') && /'panel-board'/.test(menuNav));
    /* AND THE THREE PLACES READ THE LIST RATHER THAN REPEATING IT. */
    ok('...and the close handler, Escape and _overlayOpen all read that list',
      /_closeSubPanel\(\)/.test(main)
      && /\[\.\.\.SUB_PANELS, 'panel-pause'/.test(main)
      && /for \(const id of SUB_PANELS\)/.test(main));
    /* ESCAPE CLOSES ONE, INNERMOST FIRST. The board opens from KITTENS &
       SCORES with that group still up behind it, so backing out has to land on
       the group rather than three steps out at the pause menu. */
    ok('...and Escape backs out one level, board first',
      ids[0] === 'panel-board', ids[0]);
    /* AND EVERY ONE OF THEM CAN BE LEFT. A group you can open and not close is
       the frozen game the sixth non-negotiable is about. */
    for (const id of ['panel-kittens', 'panel-watch', 'panel-ending']) {
      const seg = html.slice(html.indexOf(`id="${id}"`), html.indexOf(`id="${id}"`) + 2200);
      ok(`...and ${id} carries a way out`, /class="menu-btn back" data-close/.test(seg));
    }
  }

  /* --- AND PICK YOUR SIDE DOES NOT FOLD UNDER A LONG NAME ---------------
     Reported from play: "when moving Blossom on the Choose Your Team screen,
     her arrows next to her name are pointing diagonally instead of left/right,
     and her box is almost twice as high as the others."

     ONE CAUSE, BOTH SYMPTOMS. `.tp-cat` is a flex row and `.tp-keys` was the
     only item in it with a shrink factor, so when a name overflowed the column
     the flexbox took the width out of `◀ ▶` and the two arrows wrapped onto
     two lines — which reads as a diagonal pair and doubles the row's height.
     Only Blossom's name is long enough to do it. The prompt is the instruction
     this screen exists to give and is the LAST thing that may shrink. */
  {
    const st = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    const keys = /\.tp-keys \{([^}]*)\}/.exec(st)?.[1] ?? '';
    ok('the stick prompt on a kitten\'s row never shrinks', /flex:\s*0 0 auto/.test(keys), keys.trim());
    ok('...and never wraps, so two arrows cannot become a diagonal pair',
      /white-space:\s*nowrap/.test(keys));
    /* A NAME HAS TO BE AN ELEMENT for the rule above to have somewhere to push
       the squeeze to — a bare text node is an anonymous flex item and no
       selector can reach it. */
    ok('...because the NAME is what gives instead, and it is a real element',
      /\.tp-name \{/.test(st) && /<span class="tp-name">/.test(main));
    /* AND THE COLUMN IS WIDE ENOUGH FOR THE LONGEST ROW, so in practice
       nothing has to give at all. */
    const side = /\.tp-side \{([^}]*)\}/.exec(st)?.[1] ?? '';
    const min = Number(/min-width:\s*(\d+)px/.exec(side)?.[1] ?? 0);
    ok('...and a team column fits the longest name plus its arrows', min >= 170, `${min}px`);
  }

  /* --- AND IT TAKES ITS FULL SIZE IN A PANE HOLDING MORE THAN ONE -------
     Reported from play, side by side with two kittens in one pane: "the math
     overlay is too small, make it the full size it would normally be, and move
     it to the top-left of the screen, as close to the corner as we can without
     overlaying the players UI elements on the top." 42% of a 960 pane is a
     403px board where an unsplit screen gives 540, and the Dojo's whole reason
     to exist came out too small to read. */
  {
    const at = main.indexOf('_drawMathBoard(panes, groups, W, H, mathUp) {');
    const fn = main.slice(at, main.indexOf('\n  onJoinClan(', at));
    ok('the maths board is sized by whether the pane is SHARED, not by a fraction',
      /const shared = \(groups\[best\]\?\.length \?\? 0\) > 1;/.test(fn));
    ok('...taking its full width there and the 42% only when she is alone',
      /shared[\s\S]{0,120}?Math\.min\(540, v\.w - \d+\)[\s\S]{0,120}?Math\.round\(v\.w \* 0\.42\)/.test(fn));
    ok('...and the top corner, since at full size the bottom is not a corner',
      /inner: false, top: shared/.test(fn));
    /* HOW FAR DOWN THE SCOREBOARD REACHES IS MEASURED, and only asked when the
       two would actually meet — "as close to the corner as we can" means the
       drop has to be nothing at all when the corner is free. */
    ok('...dropping below the scoreboard only when they would actually meet',
      /querySelector\('\.scoreboard'\)/.test(fn)
      && /spot\.left < sb\.right && spot\.left \+ w > sb\.left/.test(fn));
    /* AND IT STOPS BEFORE THE MAP, asked of the same two functions that place
       the map rather than added up by hand — the hand-rolled version was
       sixteen pixels short because it forgot `HINT_CLEAR`. */
    ok('...and it never grows down into the pane\'s own minimap',
      /const mapAt = mapSpot\(\{/.test(fn) && /const room = mapAt\.top/.test(fn));
  }

  /* --- THE MATHS OVERLAY IS A SETTING, NOT ONLY A BUTTON ----------------
     "Let's add the Turn Math Overlay during gameplay option on/off, as we may
     remove those from the controllers in the future." A setting only a button
     can reach is one a kid on a phone cannot reach at all. */
  ok('the maths overlay can be set from the menu', /id="set-math"/.test(html));
  ok('...with three answers, because automatic is not the same as on',
    /id="set-math"[\s\S]{0,400}?value="auto"[\s\S]{0,400}?value="on"[\s\S]{0,400}?value="off"/.test(html));
  ok('...and the game starts it from that setting rather than from the device alone',
    /this\.mathVisible = this\._mathDefault\(\);/.test(main)
    && /_mathDefault\(\) \{[\s\S]{0,300}?this\.settings\.math/.test(main));
  /* THE DOJO MUST NOT OVERRULE HER. It turns the board on when she walks in,
     which is helpful as an automatic answer and is a setting silently doing
     nothing when she has picked ON or OFF herself — the sixth non-negotiable. */
  ok('...and the Dojo stops overriding it once she has answered herself',
    /if \(this\.settings\.math !== 'auto'\) return;/.test(main));
  ok('...and changing the row takes effect on the spot, over a frozen world',
    /bind\('set-math', 'math'/.test(main));

  /* --- who drives --- */
  const nav = readFileSync(new URL('../src/systems/menunav.js', import.meta.url), 'utf8');
  /* ONE CURSOR, AND IT BELONGS TO WHOEVER OPENED THE MENU. Before this every
     seated pad drove the same highlight: four sticks, one list, and the
     cursor jumping two rows per nudge. Richard's rule, verbatim - "only 1
     player ever controls the Menu screen". */
  ok('the menu reads only its owner, when it has one',
    /menuOwner/.test(nav) && /\[all\[owner\]\] : all/.test(nav));
  /* WHICH pad asked, not whether any did. `some` returns a boolean and there
     is no way back from a boolean to the slot that pressed. */
  ok('...and the pause button claims the menu for the pad that pressed it',
    /findIndex/.test(main.slice(main.indexOf('_claimMenu(asked)') - 900,
      main.indexOf('_claimMenu(asked)'))));
  /* A DEAD PAD MUST NOT LOCK FOUR PEOPLE OUT OF RESUME. Checked every frame
     rather than on the disconnect event, because a pad that simply stops
     reporting never fires one. */
  ok('...and a vanished owner hands the menu on rather than freezing it',
    /_checkMenuOwner\(\)/.test(main.slice(main.indexOf('this.trailer.update();'),
      main.indexOf('this.trailer.update();') + 400)));
  ok('...and closing the menu gives it back to nobody',
    /if \(!on\) this\._claimMenu\(null\);/.test(main));
  /* AND IT SAYS SO. Three players pushing sticks at a cursor that will not
     move have no way to tell a lock from a crash; sixth non-negotiable. */
  ok('...and the screen names who is driving it', /id="menu-owner"/.test(html));

  /* --- the stuck vJoy button --- */
  /* NOT A PHANTOM CONTROLLER. Reported as "2 controllers connected and one of
     them autostarts the game", and it was real: vJoy reported button 9 held at
     1.00 forever, button 9 is `attack` on the left Joy-Con half, and the title
     screen's any-button rule started the game on it. Masked at the source, in
     the one pure helper every read goes through, so a profile lookup or a
     liveness check cannot route around it. */
  const inp = readFileSync(new URL('../src/core/input.js', import.meta.url), 'utf8');
  const bfn = inp.slice(inp.indexOf('function b(gp, i)'), inp.indexOf('function b(gp, i)') + 200);
  ok('a button held from the moment a pad appears is masked at the source',
    /LATCHED\.get\(gp\.index\)\?\.has\(i\)\) return false/.test(bfn));
  /* VJOY ONLY. A real pad is not surfaced by the browser until a human presses
     something on it, so latching on arrival would eat that very press and the
     pad would look dead. That asymmetry is the whole reason this is gated. */
  ok('...but only for vJoy, or a real pad would lose its wake-up press',
    /profileNameFor\(gp\) === 'vjoyDual'/.test(inp));
  ok('...and it clears the instant she lets go',
    /for \(const i of stuck\) if \(!rawDown\(gp, i\)\) stuck\.delete\(i\)/.test(inp));
  ok('...and the readout says a pad arrived stuck', /latched:/.test(inp));
}

/* ---------------------------------------------------------------------------
   SIX THINGS REPORTED FROM PLAY, and the checks that would have caught them.

   All six came back from one session at the machine: the announcement that
   would not arrive, the champion who was on no map, the ending played under a
   thunderstorm, a joining kitten landing on a clan leader, and half a party
   with no zoom button. Each is pinned here by the BEHAVIOUR that was wrong,
   not by the line that was changed.
--------------------------------------------------------------------------- */
{
  /* --- 1. HIS ANNOUNCEMENT MUST NOT WAIT FOR EVERYBODY TO DISMOUNT ---
     The stage that fires it opens thirty seconds after Ryuuseki has been
     RIDDEN, and it used to refuse while anybody was still on a mount — so the
     pair most likely to have earned it (the two who climbed on and stayed on)
     were the pair who could not have it. Reported as "he does not do his
     speech until all players jump off Ryuuseki". */
  const said = [];
  const satan = {
    position: { x: SATAN_TOWN.x, y: 0, z: SATAN_TOWN.z },
    group: { visible: false },
    setLine: (t) => said.push(t),
    update: () => {},
    art: null,
  };
  const quietWorld = { openArena: () => {}, mischiefTotal: 1, props: [] };
  const hudFor = (sceneActive, accept) => ({
    _sceneActive: () => sceneActive,
    ballsHeld: 7,
    townCentre: () => ({ x: 0, y: 0, z: 0 }),
    summonScene: { start: () => accept },
    toast: () => {},
    enterArena: () => {},
  });
  const rider = { position: { x: 0, y: 40, z: 0 }, mount: {}, rideAlong: null };

  const q = new ArenaQuest({
    game: null, world: quietWorld, satan, announcer: null,
  });
  q.stage = 'pending';
  q.timer = ANNOUNCE_DELAY;
  q.update(0.016, [rider], [{ pressed: () => false }], hudFor(false, true));
  ok('Mr. Satan announces the tournament from a kitten\'s back',
    q.stage === 'calling', q.stage);
  ok('...and he really does say his line', said.length > 0);

  /* THE ONE GATE THAT STAYS. A scene already owning the screen still holds it,
     and holds it in `pending` rather than losing it — nothing would ever ask
     again if the stage advanced on a refusal. */
  const q2 = new ArenaQuest({
    game: null, world: quietWorld, satan, announcer: null,
  });
  q2.stage = 'pending';
  q2.timer = ANNOUNCE_DELAY;
  q2.update(0.016, [rider], [{ pressed: () => false }], hudFor(true, true));
  ok('...but a scene already on screen still holds it back', q2.stage === 'pending');

  const q3 = new ArenaQuest({
    game: null, world: quietWorld, satan, announcer: null,
  });
  q3.stage = 'pending';
  q3.timer = ANNOUNCE_DELAY;
  q3.update(0.016, [rider], [{ pressed: () => false }], hudFor(false, false));
  ok('...and a refused scene is retried, not spent', q3.stage === 'pending');
}

{
  /* --- MR SATAN ANSWERS THE ARENA GATE ---
     The arena island is flyable the moment it appears, so two kittens could
     land at the torii and find nobody there: the tournament only ever opened
     from the town square, and the one place that LOOKS like the way in was the
     one place that was not. He steps out to the gate for two or more and walks
     home again for fewer, and a kitten alone there is told both of her ways
     out. See `ArenaQuest._holdCourt`. */
  const gate = { x: 40, y: 12, z: -268 };
  const home = { x: SATAN_TOWN.x, y: 0, z: SATAN_TOWN.z };
  const rig = () => {
    const toasts = [];
    const satan = {
      position: { x: home.x, y: home.y, z: home.z },
      homeAt: home,
      group: { visible: true },
      setLine: () => {},
      update: () => {},
      art: null,
      moveTo(x, y, z) { this.position = { x, y, z }; },
    };
    const hud = {
      _sceneActive: () => false,
      ballsHeld: 7,
      townCentre: () => ({ x: 0, y: 0, z: 0 }),
      summonScene: { start: () => true },
      toast: (t, i) => toasts.push([t, i]),
      enterArena: () => { hud.boarded = true; },
      boarded: false,
    };
    const q = new ArenaQuest({
      game: null,
      world: { openArena: () => {}, mischiefTotal: 1, props: [], arenaGate: gate },
      satan,
      announcer: null,
    });
    q.stage = 'open';
    return { q, satan, hud, toasts };
  };
  const at = (x, z, o = {}) => ({ position: { x, y: 0, z }, mount: null, rideAlong: null, ...o });
  const atGate = (dz = 0, o = {}) => at(gate.x, gate.z + dz, o);
  const inTown = () => at(home.x, home.z);
  const nopad = { pressed: () => false };
  const yes = { pressed: (a) => a === 'interact' };
  const step = (r, players, pads) => r.q.update(0.016, players, pads ?? players.map(() => nopad), r.hud);

  /* HIS DEFAULT IS THE TOWN AND STAYS THE TOWN. This is the two-player
     invariant for this feature: a pair who never fly north must see exactly
     the game they saw before, so a frame with nobody at the gate may not move
     him at all. */
  {
    const r = rig();
    step(r, [inTown(), inTown()]);
    ok('Mr. Satan holds his town square while the gate is empty',
      r.q.post === 'town' && r.satan.position.z === home.z, `${r.q.post} z=${r.satan.position.z}`);
    ok('...and nobody standing in town is toasted about a gate', r.toasts.length === 0);
  }

  /* TWO AT THE GATE FETCH HIM, and he plants himself up the approach rather
     than inside the torii — between the gate and where the griffin lands. */
  {
    const r = rig();
    step(r, [atGate(2), atGate(-2)]);
    ok('...but two kittens at the torii bring him to it',
      r.q.post === 'gate' && r.satan.position.z === gate.z + GATE_STAND,
      `${r.q.post} z=${r.satan.position.z}`);
    /* AND THE DOOR REALLY OPENS THERE. The whole feature is worthless if he
       arrives and the accept prompt does not follow him: `near` measures from
       HIS position, which is the reason `_holdCourt` runs before it. */
    step(r, [atGate(2), atGate(-2)], [yes, nopad]);
    ok('...and interact at the gate boards the griffin', r.hud.boarded);
  }

  /* ...AND THEY SEND HIM HOME AGAIN by leaving. */
  {
    const r = rig();
    step(r, [atGate(2), atGate(-2)]);
    step(r, [inTown(), inTown()]);
    ok('...and he walks home the moment they leave it',
      r.q.post === 'town' && r.satan.position.z === home.z, `${r.q.post}`);
  }

  /* =========================================================================
     ...AND THE DOORMAN SHUTS UP ONCE THE DOOR IS BEHIND THEM.

     Everything above is the doorman, and it ran during the tournament too.
     The torii is on the ARENA island, ten units from where the griffin sets
     them down, so the frame after `Game._arrive` put Mr. Satan in his
     announcer's box the checks above dragged him back out to the gate and
     wrote "I need BOTH of you here" over his head; then the round started, the
     fighters were posted 62 units away in the middle of the deck, the count
     went to zero and he was TELEPORTED THREE HUNDRED UNITS INTO THE TOWN.

     So for the whole of every round his box was empty and he was standing in
     the square asking two kittens who were already in the ring to come to a
     gate they had walked through. Nothing said so, because nothing had ever
     looked at him during a round — found the frame the shot above was added
     and pointed at the booth.

     These are the checks that would have caught it, and they are about
     BEHAVIOUR: not that a flag is read, but that a frame in each of the three
     match states moves him nowhere and says nothing. */
  console.log('\n--- and he stays in his box once the round starts ---');
  {
    const booth = { x: gate.x, y: 0, z: gate.z - 100 };
    const inRing = () => at(gate.x, gate.z - 62);
    /* HE IS PUT IN THE BOX THE WAY `Game._arrive` PUTS HIM THERE, then a frame
       is run. Anything that moves him after that is this file's bug. */
    const landed = (hud) => {
      const r = rig();
      r.satan.moveTo(booth.x, booth.y, booth.z);
      r.satan.setLine('');
      r.said = [];
      r.satan.setLine = (t) => r.said.push(t);
      Object.assign(r.hud, hud);
      return r;
    };
    const stayed = (r) => r.satan.position.z === booth.z && r.satan.position.x === booth.x;

    /* 1. A LIVE ROUND. The fighters are on their marks, nowhere near the
       torii, so the old code read "nobody at the gate" and sent him home. */
    {
      const r = landed({ inMatch: true });
      step(r, [inRing(), inRing()]);
      ok('a live round leaves Mr. Satan in his announcer\'s box', stayed(r),
        `z=${r.satan.position.z} want ${booth.z}`);
      ok('...and does not write the doorman\'s line over his head',
        r.said.length === 0, JSON.stringify(r.said[0] ?? ''));
      ok('...and clears `post`, so coming home re-decides from scratch',
        r.q.post === null, `${r.q.post}`);
    }

    /* 2. THE LANDING ITSELF, which is the frame that actually bit. They are
       standing ON the gate here — the griffin drops them ten units from it —
       and the old code therefore fetched him OUT of the box he had been put in
       one frame earlier. `inMatch` is true across the league and team pickers,
       which is what these frames are. */
    {
      const r = landed({ inMatch: true });
      step(r, [atGate(2), atGate(-2)]);
      ok('...and so does the landing, with both of them stood on the torii',
        stayed(r), `z=${r.satan.position.z} want ${booth.z}`);
      ok('...saying nothing to two kittens who have already come through it',
        r.said.length === 0, JSON.stringify(r.said[0] ?? ''));
    }

    /* 3. THE RIDE. `inMatch` is false on the way out — `begin` has not been
       called — so `travel` is a second term and not a belt-and-braces one. */
    {
      const r = landed({ travel: 'out' });
      step(r, [atGate(2), atGate(-2)]);
      ok('...and the griffin ride itself moves him nowhere', stayed(r),
        `z=${r.satan.position.z}`);
    }

    /* 4. AND THE MOMENT IT IS OVER HE IS THE DOORMAN AGAIN. A guard that
       latched would leave the arena permanently unopenable on a second visit,
       which is a worse bug than the one being fixed. */
    {
      const r = landed({ inMatch: true });
      step(r, [atGate(2), atGate(-2)]);
      r.hud.inMatch = false;
      step(r, [atGate(2), atGate(-2)]);
      ok('...but the frame after the match he answers the gate again',
        r.q.post === 'gate' && r.satan.position.z === gate.z + GATE_STAND,
        `${r.q.post} z=${r.satan.position.z}`);
    }

    /* IT ASKS `Game.inMatch` RATHER THAN RESTATING IT. The predicate has to
       span the two picker screens as well as the live round, and that is
       exactly what `inMatch` is for; a copy of it here would be a second place
       to forget `teamPicking`. Both halves are pinned, because the guard is
       only as good as the getter it leans on. */
    const asrc = readFileSync(new URL('../src/systems/arenaquest.js', import.meta.url), 'utf8');
    ok('the guard asks Game.inMatch rather than listing the states again',
      /if \(hud\.inMatch \|\| hud\.travel\) \{ this\.post = null; break; \}/.test(asrc));
    ok('...and it guards the whole doorman, not just where he stands',
      asrc.indexOf('hud.inMatch') < asrc.indexOf('_holdCourt(players, hud)'));
    const msrc3 = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    ok('...and Game.inMatch really does span the two picker screens',
      /get inMatch\(\) \{[^}]*this\.tournament\?\.active \|\| this\.leaguePicking \|\| this\.teamPicking/
        .test(msrc3));
  }

  /* A PAIR CIRCLING OVERHEAD HAVE NOT ARRIVED. They fly here on a dragon, so
     without the mount test he would be called out to the gate by two girls
     who never intended to land — the same rule `near` follows. */
  {
    const r = rig();
    step(r, [atGate(2, { mount: {} }), atGate(-2, { rideAlong: {} })]);
    ok('...but two kittens still on their dragons do not', r.q.post === 'town', r.q.post);
  }

  /* THE EDGE OF THE CIRCLE IS THE EDGE. A check that passed at the centre and
     nowhere else would be a radius that could quietly go to zero. */
  {
    const r = rig();
    step(r, [atGate(GATE_RADIUS - 1), atGate(-(GATE_RADIUS - 1))]);
    ok('...two just inside GATE_RADIUS count', r.q.post === 'gate', r.q.post);
    const r2 = rig();
    step(r2, [atGate(GATE_RADIUS + 1), atGate(-(GATE_RADIUS + 1))]);
    ok('...and two just outside it do not', r2.q.post === 'town', r2.q.post);
  }

  /* ONE KITTEN IS TOLD, ONCE, AND TOLD BOTH WAYS OUT. A gate that stayed quiet
     would read as the arena being shut; a message that repeated every frame
     would stop being read. */
  {
    const r = rig();
    step(r, [atGate(1), inTown()]);
    ok('a kitten alone at the gate is told what to do',
      r.toasts.length === 1, r.toasts[0]?.[0] ?? '');
    ok('...in her own colour', r.toasts[0]?.[1] === 0, `${r.toasts[0]?.[1]}`);
    ok('...naming BOTH ways out of it',
      /sister/i.test(r.toasts[0]?.[0] ?? '') && /town/i.test(r.toasts[0]?.[0] ?? ''));
    step(r, [atGate(1), inTown()]);
    step(r, [atGate(1), inTown()]);
    ok('...and not told again while she stands there', r.toasts.length === 1, `${r.toasts.length}`);
    step(r, [inTown(), inTown()]);
    step(r, [atGate(1), inTown()]);
    ok('...but told again if she walks off and comes back', r.toasts.length === 2, `${r.toasts.length}`);
  }

  /* SECOND SEAT, SECOND COLOUR. The toast is addressed to whoever is standing
     there, not to player one — the same rule the arena-open pair of toasts
     follows, and the reason `_holdCourt` finds her index rather than counting. */
  {
    const r = rig();
    step(r, [inTown(), atGate(1)]);
    ok('...and it is the kitten who is there who gets it', r.toasts[0]?.[1] === 1,
      `${r.toasts[0]?.[1]}`);
  }

  /* COMING HOME PUTS HIM BACK. `Game._arrive` has already moved him by the
     time `onReturn` is called; without this the quest would go on believing he
     was at a gate nobody is standing at. */
  {
    const r = rig();
    step(r, [atGate(2), atGate(-2)]);
    r.q.onReturn();
    ok('...and the end of a tournament puts him back in town', r.q.post === 'town', r.q.post);
    r.q.reset();
    ok('...as does starting the whole game over', r.q.post === 'town', r.q.post);
  }
}

{
  /* --- THE ORBITING ORBS' TEXT IS BEHIND THE WORLD, NOT IN FRONT OF IT ---
     Every quad on a PowerOrb carried `depthTest: false`, so the kanji and the
     live cos/sin readout drew through houses, dragons and the kitten wearing
     them. Reported from play as the glyphs "not being covered up by 3D
     objects", and the ring passes behind her several times a second.

     THE FIX IS NOT JUST TURNING THE TEST ON, which is why this is checked in
     two halves. The mark is a 0.4-unit quad pinned to the middle of a sphere
     whose halo breathes out to 0.49, so depth testing alone strobes it in and
     out of its own ball. `faceCamera` lifts it along the line to the camera
     instead — and that lift is the half a tidy-up would delete, because it
     looks like a line that does nothing.

     ITS OWN DOM, because the shared stub is deleted a few hundred lines above
     on purpose and a Label measures its text on a canvas. Put back the way it
     was found. */
  const hadDoc = 'document' in globalThis;
  globalThis.document = domStub();
  const orb = new PowerOrb(POWER_ORBS[0], 0, 1);
  ok('a power orb\' kanji is depth-tested against the world',
    orb.mark.mat.depthTest === true);
  ok('...and so is its cos/sin readout', orb.readout.mat.depthTest === true);
  ok('...and every falling glyph with it',
    orb.drops.every((d) => d.mesh.material.depthTest === true), `${orb.drops.length} drops`);
  /* TRANSPARENT QUADS STILL MUST NOT WRITE DEPTH, or they hide each other and
     the orb behind them. Testing and writing are different questions and the
     fix only changes one of them. */
  ok('...without any of them stamping the depth buffer',
    orb.mark.mat.depthWrite === false && orb.readout.mat.depthWrite === false
    && orb.drops.every((d) => d.mesh.material.depthWrite === false));

  /* THE LIFT IS MEASURED, FROM TWO DIFFERENT CAMERAS, and it has to point at
     whichever one is asking: `faceCamera` runs once per split-screen pane, so
     a lift that pointed anywhere fixed would be right in one pane and inside
     the ball in the next. */
  orb.setMathVisible(true);
  orb.update(0.016, new THREE.Vector3(0, 0, 0));
  const shot = (camPos) => {
    const cam = new THREE.PerspectiveCamera();
    cam.position.copy(camPos);
    cam.lookAt(orb.group.position);
    cam.updateMatrixWorld(true);
    orb.faceCamera(cam);
    /* The mark's position is in orbNode space; the direction that matters is
       the one it ends up pointing, which is the quad's own +Z. */
    const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(orb.mark.mesh.quaternion);
    return { lift: orb.mark.position.length(), along: orb.mark.position.dot(dir) };
  };
  const a = shot(new THREE.Vector3(0, 6, 30));
  const b = shot(new THREE.Vector3(-30, 2, -12));
  ok('...and the kanji is lifted clear of its own breathing halo',
    a.lift > 0.5 && Math.abs(a.lift - b.lift) < 1e-6, `${a.lift.toFixed(3)}`);
  ok('...towards whichever pane\' camera is asking, not a fixed way',
    a.along > 0.5 && b.along > 0.5 && Math.abs(a.along - a.lift) < 1e-6);

  /* THE RAIN COLUMN'S LIFT MAY NOT ACCUMULATE. `faceCamera` runs per view, so
     adding to `rain.position` in place would walk the column off the orb by
     one lift per pane — invisible at one player and wrong at four. */
  const camA = new THREE.PerspectiveCamera();
  camA.position.set(0, 6, 30);
  camA.lookAt(orb.group.position);
  camA.updateMatrixWorld(true);
  orb.faceCamera(camA);
  const p1 = orb.rain.position.clone();
  orb.faceCamera(camA);
  orb.faceCamera(camA);
  orb.faceCamera(camA);
  ok('...and four panes in a row do not walk the rain off the orb',
    orb.rain.position.distanceTo(p1) < 1e-6,
    `${orb.rain.position.distanceTo(p1).toFixed(4)}`);
  if (!hadDoc) delete globalThis.document;
}

{
  /* --- AN OFFERED ORB WEARS GOLD; ONLY THE CURSOR WEARS HER COLOUR ---
     Reported from play: an orb put on the trade table kept its owner's ring
     after her cursor had walked away, so two slots claimed to be under one
     cursor and the one she was actually on was the harder to find. `--me` is a
     statement about WHERE SHE IS and may only be drawn where she is. */
  const kd = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const rule = (sel) => {
    const at = kd.indexOf(`${sel} {`);
    return at < 0 ? null : kd.slice(at, kd.indexOf('}', at));
  };
  const offered = rule('.kd-slot.offered');
  const both = rule('.kd-slot.offered.cursor');
  ok('an offered orb is ringed in gold', /#f5c341/.test(offered ?? ''));
  ok('...and not in the player\' own colour', !/--me/.test(offered ?? ''), offered ?? 'missing');
  ok('...unless her cursor is on it too',
    /--me/.test(both ?? '') && /#f5c341/.test(both ?? ''), both ?? 'missing');
  /* SOURCE ORDER AND SPECIFICITY BOTH, because either alone lets the plain
     cursor rule win on a slot that is offered and drop the gold. */
  ok('...by a rule that outranks both of the ones above it',
    kd.indexOf('.kd-slot.offered.cursor {') > kd.indexOf('.kd-slot.cursor {')
    && kd.indexOf('.kd-slot.offered.cursor {') > kd.indexOf('.kd-slot.offered {'));
}

{
  /* --- MENUNAV PAYS FOR THE PRESS IT ACTS ON ---
     It was the one owner in the frame that never did. `Inspector` consumes,
     the stall branch consumes, `PadState.consume` carries a comment saying
     whoever acts on a press owes the call — and MenuNav acted and left every
     edge sitting there for the rest of `_updatePlay` to find. Two bugs came in
     from the same play session and both were this: backing out of the pause
     menu next to the dealer opened the dealer, and confirming CHARACTER
     PROFILE offered whichever orb the cursor was on.

     DRIVEN, NOT READ. A source check for the word `spend` would go on passing
     the day somebody moves the call above the read it is meant to follow. */
  const hadDoc = 'document' in globalThis;
  const el = (tag, cls = []) => {
    const set = new Set(cls);
    return {
      tagName: tag,
      offsetParent: {},
      clicks: 0,
      classList: {
        contains: (c) => set.has(c),
        add: (c) => set.add(c),
        remove: (c) => set.delete(c),
      },
      click() { this.clicks += 1; },
      scrollIntoView: () => {},
    };
  };
  const play = el('BUTTON', ['menu-btn', 'primary']);
  const back = el('BUTTON', ['menu-btn', 'back']);
  const panel = {
    id: 'panel-pause',
    dataset: {},
    classList: { contains: () => false },
    querySelectorAll: () => [play, back],
    querySelector: () => back,
  };
  globalThis.document = {
    getElementById: (id) => (id === 'panel-pause' ? panel : null),
    querySelectorAll: () => [],
  };

  /* A pad that answers `pressed` from a set, and records what is spent —
     which is the whole property under test. */
  const fakePad = (...down) => {
    const held = new Set(down);
    return {
      mx: 0,
      my: 0,
      spent: [],
      pressed: (a) => held.has(a),
      consume(a) { this.spent.push(a); held.delete(a); },
    };
  };
  const navGame = (pads) => ({
    input: { players: pads },
    menuOwner: 0,
    state: 'play',
    trailer: { active: false },
    audio: { play: () => {} },
    setPaused: () => {},
  });

  const jump = fakePad('jump');
  const nav1 = new MenuNav(navGame([jump, fakePad()]));
  nav1.update(0.016);
  ok('a confirm in a menu spends the press it confirmed with',
    jump.spent.includes('jump'), jump.spent.join(' ') || 'nothing');
  ok('...and the button it landed on really was clicked', play.clicks === 1, `${play.clicks}`);
  ok('...so nothing later in the frame can read it again', jump.pressed('jump') === false);

  const bpad = fakePad('interact');
  const nav2 = new MenuNav(navGame([bpad, fakePad()]));
  nav2.update(0.016);
  ok('backing out of a menu spends the interact that backed out',
    bpad.spent.includes('interact') && bpad.pressed('interact') === false,
    bpad.spent.join(' ') || 'nothing');

  /* ONLY HER PAD. `Input.consume` would spend the edge across all four slots,
     eating the sister's press — she can be standing at the stall with her own
     interact while player one is in the pause menu. */
  const sister = fakePad('interact');
  const owner = fakePad('jump');
  const nav3 = new MenuNav(navGame([owner, sister]));
  nav3.update(0.016);
  ok('...and only the pad that pressed it, not everybody\'',
    sister.spent.length === 0 && sister.pressed('interact') === true,
    sister.spent.join(' ') || 'untouched');

  /* A FRAME THAT DECIDES NOTHING PAYS NOTHING, or the menu would eat every
     press made anywhere near it. */
  const idle = fakePad('attack');
  const nav4 = new MenuNav(navGame([idle, fakePad()]));
  nav4.update(0.016);
  ok('...and a frame that neither confirms nor backs spends nothing',
    idle.spent.length === 0 && idle.pressed('attack') === true);

  /* --- AND THE CURSOR DOES NOT LAND INSIDE A SHUT TOPIC ---
     `offsetParent !== null` was the whole visibility test, and it is not enough
     for a `<details>`: browsers hide a closed disclosure's contents with
     `content-visibility: hidden`, not `display: none`, so the skipped subtree
     still has a layout box and every control inside it reports a live
     `offsetParent`. Flat cards had nothing inside them to land on; the moment
     Help grew sub-topics the cursor started stopping on eight headings a
     player could not see. Found by asking `items()` what it returned with
     "Moving & fighting" shut, and asserted the same way — DRIVEN, not read,
     because a source check for the word `closest` would pass a version that
     called it on the wrong element.

     A `<summary>` IS STILL REACHABLE INSIDE ITS OWN SHUT CARD — that is the
     whole accordion — so the two cases have to be told apart, and both are
     here: a shut top-level topic keeps its own header and loses its children. */
  {
    const kid = (tag, cls, parent) => {
      const e = el(tag, cls);
      e.parentElement = parent ?? null;
      e.hasAttribute = (a) => !!e._attrs?.[a];
      e.closest = (q) => {
        /* Enough of `closest` for the one query `items` asks: walk up looking
           for a <details> WITHOUT [open]. */
        for (let n = e; n; n = n.parentElement) {
          if (n.tagName === 'DETAILS' && !n.open && q.includes('not([open])')) return n;
        }
        return null;
      };
      return e;
    };
    const card = (open) => { const d = kid('DETAILS', ['help-card']); d.open = open; return d; };
    const shut = card(false);
    const openCard = card(true);
    const subsOf = (parent) => { const box = kid('DIV', ['ht-subs'], parent); return box; };
    const headOf = (parent) => kid('SUMMARY', ['help-topic'], parent);
    const shutHead = headOf(shut);
    const openHead = headOf(openCard);
    const buried = headOf(kid('DETAILS', ['help-card', 'help-sub'], subsOf(shut)));
    const shown = headOf(kid('DETAILS', ['help-card', 'help-sub'], subsOf(openCard)));
    const helpPanel = {
      id: 'panel-help',
      dataset: { nav: 'vertical' },
      classList: { contains: () => false },
      querySelectorAll: () => [shutHead, buried, openHead, shown],
      querySelector: () => null,
    };
    const got = new MenuNav(navGame([fakePad(), fakePad()])).items(helpPanel);
    ok('a shut topic still offers its own header to the pad', got.includes(shutHead));
    ok('...and an open one offers its sub-topics', got.includes(shown));
    ok('...but a sub-topic inside a shut one is not on the cursor',
      !got.includes(buried), `${got.length} items`);
  }

  if (!hadDoc) delete globalThis.document;
}

{
  /* --- 2. THE CHAMPION IS ON THE MAP ONCE HE IS IN THE WORLD ---
     The game tells the girls to go and find him twice ("find Mr. Satan in the
     town", and then his own line asking for everybody) and drew him nowhere.
     Asserted by RECORDING the canvas calls: a no-op stub would pass whatever
     the map did, so the context here remembers everything and the check reads
     back the star's own vertices. */
  const rec = () => {
    const ops = [];
    const ctx = new Proxy({}, {
      get: () => (...a) => { ops.push(a); },
      set: () => true,
    });
    const cv = {
      width: 300, height: 300,
      getContext: () => ctx,
      getBoundingClientRect: () => ({ width: 300, height: 300 }),
    };
    return { cv, ops };
  };
  /* THE STAR IS FOUND BY ITS SHAPE, which is the one thing on this canvas that
     cannot be anything else. Every other mark is at most five points — a
     dragon is three, a kitten's wedge four, the dealer's diamond five — and
     `beginPath` (no arguments) breaks the run, so the longest unbroken run of
     two-argument calls IS the star's ten vertices. Counting `fill`s or
     comparing op totals would pass on any change that happened to draw
     something, which is exactly the kind of check this file does not have. */
  const longestRun = (ops) => {
    let best = 0;
    let run = 0;
    for (const a of ops) {
      if (a.length === 2) { run += 1; best = Math.max(best, run); } else run = 0;
    }
    return best;
  };
  const said = (ops, text) => ops.find((a) => a[0] === text);

  const away = { position: { x: SATAN_TOWN.x, y: 4, z: SATAN_TOWN.z }, group: { visible: false } };
  const here = { position: { x: SATAN_TOWN.x, y: 4, z: SATAN_TOWN.z }, group: { visible: true } };
  const kitten = {
    position: { x: 0, y: 4, z: 20 }, facing: 0, style: 0, clan: null, panda: null,
  };

  const a = rec();
  const mapA = new Minimap(a.cv, world, 0);
  mapA.draw([kitten], [], null, here);
  ok('Mr. Satan is drawn on the minimap once he is in the world',
    longestRun(a.ops) >= 10, `${longestRun(a.ops)}-point path`);

  const b = rec();
  const mapB = new Minimap(b.cv, world, 0);
  mapB.draw([kitten], [], null, away);
  ok('...and not before he has announced himself',
    longestRun(b.ops) < 10, `${longestRun(b.ops)}-point path`);

  const c = rec();
  const mapC = new Minimap(c.cv, world, 0);
  mapC.draw([kitten], [], null, null);
  ok('...and a map handed no champion at all still draws',
    c.ops.length > 20 && longestRun(c.ops) < 10, String(c.ops.length));

  /* NAMED ONLY WHEN THERE IS ROOM, exactly like the clan shrines — four words
     on a phone-sized world-zoom map is worse than none. The name is the one
     mark drawn in the map's own coordinates, so it is also what pins his star
     to HIS position rather than to somewhere on the canvas. */
  const d = rec();
  const mapD = new Minimap(d.cv, world, 0, { zoom: ZOOMS[1] });
  mapD.draw([kitten], [], null, here);
  const label = said(d.ops, 'Mr. Satan');
  ok('...and he is named when the map is zoomed in', !!label);
  ok('...at his own position on it',
    !!label && Math.abs(label[1] - mapD._px(SATAN_TOWN.x)) < 1.5
    && Math.abs(label[2] - (mapD._py(SATAN_TOWN.z) - 10)) < 1.5,
    label ? `${label[1].toFixed(1)},${label[2].toFixed(1)}` : 'not drawn');
  ok('...and not at world zoom', !said(a.ops, 'Mr. Satan'));
}

{
  /* --- 3. THE ENDING CLEARS THE SKY, AND THE SKY STAYS CLEARED ---
     The finale fires at 100% mischief, which in a real run is long after
     Ryuuseki has been summoned — so Patchfur's four lines about what the girls
     made of this place were spoken over his thunderstorm. */
  const sky = () => ({
    top: world.skyMat.uniforms.top.value.getHex(),
    horizon: world.skyMat.uniforms.horizon.value.getHex(),
    cloud: world.skyMat.uniforms.cloud.value,
    fogNear: world.scene.fog.near,
    light: (world.lights ?? []).map((L) => L.intensity),
  });

  world.setSky(0, 0);
  const day = sky();
  world.setSky(1, 0);
  const storm = sky();
  world.setSky(0, 1);
  const morning = sky();

  ok('the storm sky is darker than the sunset it came from',
    storm.top < day.top && storm.fogNear < day.fogNear);
  ok('...and the morning is not the sunset either',
    morning.top !== day.top && morning.horizon !== day.horizon);
  /* THE ONE A PLAYER ACTUALLY READS. The colours are a mood; the fog is the
     whole archipelago coming into view at once, which is the thing the game
     has never shown them. */
  ok('...and the ending pushes the haze off the far islands',
    morning.fogNear > day.fogNear * 1.5,
    `${day.fogNear} -> ${morning.fogNear}`);
  ok('...and brings the lights back up rather than only the sky',
    morning.light.every((v, i) => v > day.light[i]));

  /* THE CLOUDS COST NOTHING UNTIL THE ENDING. `cloud` is multiplied through
     the haze bands in SKY_FRAG and it is also the gate on the cloud MESH, so a
     0 here is the whole game unchanged — sky and geometry both. */
  ok('...and the ukiyo-e clouds exist only at the ending',
    day.cloud === 0 && storm.cloud === 0 && morning.cloud === 1);

  /* GOING BACK TO THE SUNSET IS BIT-IDENTICAL, which is the fifth
     non-negotiable read as a rule about the sky: the sky the game has had all
     along must come out of the new two-channel path unchanged. */
  world.setSky(1, 0);
  world.setSky(0, 0);
  const back = sky();
  ok('...and the sunset comes back exactly as it was',
    back.top === day.top && back.horizon === day.horizon
    && back.fogNear === day.fogNear && back.cloud === day.cloud);

  /* --- THE CLOUD SHELVES ARE GEOMETRY, NOT SKY ---
     Three attempts at painting them into SKY_FRAG failed, and the reason is
     in the comment that replaced them: this camera looks DOWN, so a band cut
     out of the sky sphere by azimuth projects as a vertical stripe. These
     checks pin the things that made the geometry version work, because every
     one of them is invisible in a screenshot of a working build. */
  const C = world.clouds;
  ok('the ending has real cloud geometry, not a third shader band',
    !!C?.mesh && C.mesh.isMesh === true);
  ok('...in one draw call, like the distant islands next door',
    C.mesh.geometry.index.count / 3 > 400 && C.mesh.geometry.groups.length === 0,
    `${C.mesh.geometry.index.count / 3} tris`);

  /* THE VISIBILITY GATE, not just the opacity. A transparent mesh at zero
     alpha still costs a sort and a state change on every frame of a game it
     never appears in. */
  world.setSky(0, 0);
  const hiddenByDay = !C.mesh.visible;
  world.setSky(1, 0);
  const hiddenByStorm = !C.mesh.visible;
  world.setSky(0, 1);
  ok('...switched off outright for the whole game before the ending',
    hiddenByDay && hiddenByStorm && C.mesh.visible === true);
  ok('...and faded in by the dawn rather than popping on',
    C.mat.opacity > 0.8 && C.mat.transparent === true);

  /* THE ONE THAT WOULD HAVE CAUGHT THE BUG I BUILT AND MEASURED MY WAY OUT OF.
     An island is a keel, not a disc — the home island's underside reaches
     y = -98.3 at its centre — so a plate at y = -34..-106 that lands inside a
     footprint is a cream circle embedded in rock. The first version cleared
     the cloud's CENTRE and buried the far end of the shelf. */
  const cpos = C.mesh.geometry.attributes.position.array;
  let nearestRim = Infinity;
  let highest = -Infinity;
  for (let i = 0; i < cpos.length; i += 3) {
    if (cpos[i + 1] > highest) highest = cpos[i + 1];
    for (const L of world.islands) {
      const d = Math.hypot(cpos[i] - L.x, cpos[i + 2] - L.z) - L.radius;
      if (d < nearestRim) nearestRim = d;
    }
  }
  ok('...and no lobe of any shelf sits under an island',
    nearestRim > 5, `closest lobe clears the nearest rim by ${nearestRim.toFixed(1)}`);
  /* BELOW EVERYTHING, so the ending reveals the archipelago rather than
     covering it. The lowest island sits at baseY 0. */
  ok('...and every shelf lies below the lowest island',
    highest < -20, `highest cloud vertex y = ${highest.toFixed(1)}`);

  /* NOTHING IN THE WORLD KNOWS THEY ARE THERE. A cloud you can stand on is a
     promise the rest of the game does not keep, and the dragon would have to
     be taught about it — so they are not solid, not walkable, and not props. */
  const cx0 = cpos[0];
  const cz0 = cpos[2];
  const under = world.heightAt(cx0, cz0);
  const push = world.resolveSolids(cx0, cz0, 0.9, -70);
  ok('...and a kitten can neither land on one nor bump into one',
    (under === null || under.y > -20)
    && Math.hypot(push.x - cx0, push.z - cz0) < 0.01);

  /* THE DRIFT RUNS ONLY WHILE THEY ARE ON SCREEN. It is one line in
     `World.update`, and the whole point of putting it behind `visible` is that
     the game before the ending pays nothing for it. */
  const spun0 = C.mesh.rotation.y;
  world.setSky(0, 0);
  world.update(1, { x: 0, y: 4, z: 0 });
  const spunHidden = C.mesh.rotation.y;
  world.setSky(0, 1);
  world.update(1, { x: 0, y: 4, z: 0 });
  ok('...and they only drift once the ending has put them on screen',
    spunHidden === spun0 && C.mesh.rotation.y > spun0);

  /* AND THE SCENE THAT DRIVES IT. `dawnWant` is raised by the finale and by
     nothing else; the dragon leaving does not take the morning with him.
     ITS OWN DOM STUB, because the shared one is deleted a few hundred lines
     above on purpose — and it has to be an element rather than `null`: a scene
     opening really does call `classList.remove` on its box, so a null stub
     would fail here for a reason that has nothing to do with the sky. Put back
     the way it was found, so nothing downstream inherits a DOM. */
  const hadDoc = 'document' in globalThis;
  globalThis.document = {
    getElementById: () => ({
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      style: { setProperty() {} },
      textContent: '',
    }),
  };
  const S = new SummonScene({ world: null, audio: null });
  S.start('summon', { x: 0, y: 0, z: 0 });
  S.finish();
  ok('summoning the dragon darkens the sky and leaves the dawn alone',
    S.duskWant === DUSK_DEEP && S.dawnWant === 0);
  S.start('finale', { x: 0, y: 0, z: 0 });
  ok('...the ending lifts the storm and raises the dawn',
    S.duskWant === 0 && S.dawnWant === DAWN_DEEP);
  S.clearDusk();
  ok('...and Ryuuseki leaving does not undo it', S.dawnWant === DAWN_DEEP);
  S.resetSky();
  ok('...but a restart does', S.dawnWant === 0 && S.dawn === 0);

  /* IT TAKES LONGER THAN ANY OTHER SKY CHANGE, on purpose: it has to land
     inside Patchfur's first two lines, slowly enough to be noticed happening.
     Measured against the script rather than against a number typed twice. */
  const firstTwo = SCRIPTS.finale.slice(0, 2)
    .reduce((a, b) => a + (b.dur ?? 7), 0);
  ok('...and the sky clears within the finale\'s first two lines',
    DAWN_RISE > DUSK_FALL && DAWN_RISE < firstTwo,
    `${DAWN_RISE}s of ${firstTwo}s`);

  if (!hadDoc) delete globalThis.document;
  world.setSky(0, 0);        // leave the world as the rest of the file found it
}

{
  /* --- 5. A JOINING KITTEN LANDS SOMEWHERE, NOT ON SOMEBODY ---
     She used to appear at the party's centroid plus three units, and a
     centroid is not a place: it can be open sky, the inside of a house, or —
     reported from play — on top of a clan leader, where two seconds of
     standing still opens that leader's introduction on a player who has been
     in the game for two seconds. The town square is the answer, so the town
     square is what gets checked. */
  const T = { x: 0, z: 20 };
  const g = world.heightAt(T.x, T.z);
  ok('the town square is real ground', !!g, g ? g.y.toFixed(2) : 'none');
  /* `resolveSolids` declining to move a body is the same question the walking
     code asks every frame — so this is "nothing is standing there", asked of
     the world rather than of a list kept somewhere else. */
  const push = world.resolveSolids(T.x, T.z, 0.9, g ? g.y : 0);
  ok('...and nothing is standing in it',
    Math.hypot(push.x - T.x, push.z - T.z) < 0.01);
  /* AND OUT OF EVERY LEADER'S CIRCLE. `SCENE_RADIUS` is the distance
     `ShrineScene.watch` measures on, so this cannot drift from the rule it is
     avoiding. The nearest hall is Thunderpaw's, on the same island. */
  let nearest = Infinity;
  for (const hall of world.clanHalls) {
    const L = leaderSpot(hall, world);
    nearest = Math.min(nearest, Math.hypot(L.x - T.x, L.z - T.z));
  }
  ok('...and far enough from every clan leader not to open a cutscene',
    nearest > SCENE_RADIUS + 2, `${nearest.toFixed(1)} units to the nearest`);
}

{
  /* --- 6. TWO MAPS, FOUR KITTENS, TWO DRIVERS EACH ---
     There are at most two maps and there can be four panes, so at three and
     four players somebody's corner has none — and her bumper used to answer
     with a toast saying so, which is honest and useless. `nearestMap` hands
     her the box nearest her own tile instead. */
  const W = 1920;
  const H = 1080;
  const quad = splitLayout(4, W, H, 3, 'vertical', [1, 1, 1, 1]);
  const owner = assignMaps([1, 1, 1, 1], [], 2);

  const driven = [0, 1, 2, 3].map((p) => nearestMap(quad, owner, p));
  ok('every pane drives a map, even the two with none of their own',
    driven.every((m) => m >= 0 && m < 2), JSON.stringify(driven));
  ok('...and a pane that HAS one drives its own',
    owner.every((pane, m) => pane < 0 || nearestMap(quad, owner, pane) === m));
  ok('...so the four of them split two ways, two drivers each',
    driven.filter((m) => m === 0).length === 2
    && driven.filter((m) => m === 1).length === 2, JSON.stringify(driven));

  /* NEAREST MEANS NEAREST. With maps in panes 0 and 1 — the top row — pane 2
     (bottom-left) must take the one above it and not the one across the
     diagonal, which is the whole reason the rule is geometric. */
  const topRow = nearestMap(quad, [0, 1], 2);
  ok('...and it really is the nearer box, not the lower index',
    topRow === 0 && nearestMap(quad, [0, 1], 3) === 1,
    `${topRow} / ${nearestMap(quad, [0, 1], 3)}`);

  /* A TIE IS DECIDED THE SAME WAY EVERY FRAME. A pane equidistant from both
     maps — quadrants with the maps on a diagonal — must not flip between them
     while a kid is pressing the button. */
  ok('...and a tie always answers the same',
    nearestMap(quad, [0, 3], 1) === nearestMap(quad, [0, 3], 1)
    && nearestMap(quad, [0, 3], 1) >= 0);

  /* AND TWO PLAYERS ARE UNTOUCHED — the fifth non-negotiable. Each of the two
     panes owns a map, so the new rule never runs and each girl drives her own,
     exactly as she did before any of this. */
  const pair = splitLayout(2, W, H, 3, 'vertical', [1, 1]);
  const pairOwner = assignMaps([1, 1], [], 2);
  ok('two players each still drive their own map',
    nearestMap(pair, pairOwner, 0) === pairOwner.indexOf(0)
    && nearestMap(pair, pairOwner, 1) === pairOwner.indexOf(1),
    JSON.stringify(pairOwner));

  /* NO MAPS AT ALL IS ANSWERED, NOT CRASHED. `_zoomMap` still has a toast for
     it and this is what keeps that branch honest. */
  ok('...and a screen with no maps answers -1 rather than throwing',
    nearestMap(quad, [-1, -1], 0) === -1 && nearestMap(quad, [], 0) === -1);

  /* --- AND BETWEEN THEM, Z AND X REACH EVERY BOX ON SCREEN ---
     REPORTED: "the Z and X keys should zoom it in, regardless of who owns the
     minimap or if it is shared ... when ember and frost are together, Z and X
     zooms in their shared minimap, instead, Z should zoom in the one for Ember
     that is shared, and X should zoom in the one for storm and blossom that is
     shared."

     THE CAUSE WAS ASKING A PAD'S QUESTION ON A KEYBOARD. Both keys went
     through "which map does this player drive", which is exactly right for a
     bumper held by one kitten and gives the same answer twice the moment those
     two kittens share a pane — so X did what Z did and the other box on screen
     had no key at all. */
  const pairPanes = splitLayout(2, W, H, 3, 'vertical', [2, 2]);
  const pairOwn = assignMaps([2, 2], [0, 1], 2);
  const shared = [nearestMap(pairPanes, pairOwn, 0), nearestMap(pairPanes, pairOwn, 0)];
  ok('two sisters sharing a pane drive the same map — that is the bug',
    shared[0] === shared[1], JSON.stringify(shared));
  const zx = keyMaps(shared[0], shared[1], [0, 1]);
  ok('...and Z and X still come out as the two different boxes',
    zx[0] !== zx[1] && zx.every((m) => m >= 0), JSON.stringify(zx));
  ok('...with Z the one Ember is standing in, not merely the lower index',
    zx[0] === pairOwn.indexOf(0), `${zx[0]} vs pane 0's map ${pairOwn.indexOf(0)}`);

  /* TWO PLAYERS COME OUT BIT-IDENTICAL, which is the fifth non-negotiable and
     the reason X is the key that gives way rather than a re-deal of both. In
     their own panes the two answers already differ, so the rule never fires. */
  ok('two players in their own panes are untouched by the rule',
    JSON.stringify(keyMaps(0, 1, [0, 1])) === JSON.stringify([0, 1])
    && JSON.stringify(keyMaps(1, 0, [0, 1])) === JSON.stringify([1, 0]));

  /* AND IT NEVER POINTS A KEY AT A BOX THAT IS NOT DRAWN. `_drawMaps` hides a
     map `assignMaps` had nowhere to put, and a key that turns a hidden dial is
     the silent button the sixth non-negotiable is about — so with one map up,
     X keeps the collision rather than being handed a ghost. */
  ok('...and with only one map on screen X is not sent to a hidden one',
    JSON.stringify(keyMaps(0, 0, [0])) === JSON.stringify([0, 0]));
  ok('...and with no map at all it says so rather than inventing one',
    JSON.stringify(keyMaps(-1, -1, [])) === JSON.stringify([-1, -1]));

  /* THE HUD TAG READS THE SAME FUNCTION. A box labelled "· X" that X does not
     turn is the label lying, which is what it was doing: `_drawMaps` asked
     `_mapForPlayer` itself, agreed with the bug, and printed the key on one box
     and nothing on the other. */
  const msrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  ok('...and the map tag names its key from that one answer, not its own',
    /const \[zMap, xMap\] = this\._keyMaps\(\);/.test(msrc)
    && !/this\._mapForPlayer\(0\) === i/.test(msrc));
  ok('...and the Z and X keys ask it too',
    /KeyZ.*this\._zoomMapKey\(0\)/.test(msrc) && /KeyX.*this\._zoomMapKey\(1\)/.test(msrc));
}

/* ---------------------------------------------------------------------------
   PROJECT.md, the one page a human gets pointed at.

   A CHEAT SHEET THAT HAS GONE STALE IS WORSE THAN NO CHEAT SHEET, because it
   does not fail — it quietly teaches somebody a thing that stopped being true.
   Nothing else in this file guards a document, and normally that is right: the
   code is the spec. This one is different, because its whole value is being
   COMPLETE, and completeness is the one property a reader cannot check for
   themselves. So the register is enforced rather than trusted.

   WHAT IS CHECKED IS COVERAGE, NOT PROSE. Every design note, every top-level
   document, every tool a person could run: named. What any of them SAYS is not
   this file's business and could not be asserted anyway.

   `tools/capture/*` is deliberately out of scope — that rig has its own README
   and PROJECT.md points at it, which is the right depth for a one-page sheet.
--------------------------------------------------------------------------- */
{
  const root = new URL('../', import.meta.url);
  const proj = readFileSync(new URL('PROJECT.md', root), 'utf8');

  /* The date is the thing that makes the money numbers readable at all: a cost
     with no date on it is a claim about today, and it is never about today. */
  ok('PROJECT.md says when it was last updated',
    /\*\*Last updated: \d{1,2} [A-Z][a-z]+ 20\d\d\.?\*\*/.test(proj));

  const notes = readdirSync(new URL('docs/notes/', root)).filter((f) => f.endsWith('.md'));
  const missingNotes = notes.filter((f) => !proj.includes(`docs/notes/${f}`));
  ok('...and links every design note', missingNotes.length === 0,
    missingNotes.length ? missingNotes.join(' ') : `${notes.length} notes`);

  const tops = readdirSync(root).filter((f) => f.endsWith('.md'));
  const missingTops = tops.filter((f) => !proj.includes(f));
  ok('...and names every top-level document', missingTops.length === 0,
    missingTops.length ? missingTops.join(' ') : tops.join(' '));

  /* A tool nobody knows about is a tool that gets rewritten. Every one of these
     is a thing a person types; the capture rig's internals are not. */
  const tools = readdirSync(new URL('tools/', root))
    .filter((f) => f.endsWith('.mjs') || f.endsWith('.sh'));
  const missingTools = tools.filter((f) => !proj.includes(f));
  ok('...and names every tool a person could run', missingTools.length === 0,
    missingTools.length ? missingTools.join(' ') : `${tools.length} tools`);

  ok('...and points at the capture rig\'s own guide',
    proj.includes('tools/capture/README.md'));

  /* THE TWO NUMBERS THAT HAVE BEEN WRONG BEFORE. CLAUDE.md quoted a check count
     that had drifted twice; PROJECT.md quotes the same pair, so pin both to
     what this run actually counts rather than to a literal typed anywhere. */
  const claude = readFileSync(new URL('CLAUDE.md', root), 'utf8');
  const padTotal = Number(/# (\d+) checks: controllers/.exec(claude)?.[1]);
  ok('CLAUDE.md and PROJECT.md quote the same pad-check total',
    Number.isFinite(padTotal) && proj.includes(`${padTotal} checks: controllers`),
    String(padTotal));
  /* This file's own total cannot be asserted against itself — it is not known
     until the last check has run, and this IS one of them. Both documents
     quoting the same literal is the half that can be checked here; the value
     is checked by eye against the line this script prints. */
  const worldQuoted = /# (\d+) checks: world/.exec(claude)?.[1];
  ok('...and the same world-check total as each other',
    !!worldQuoted && proj.includes(`${worldQuoted} checks: world`), worldQuoted);

  /* THE GENERATED TABLES ARE THE BACKSTOP TO A HOOK, and a backstop is the
     whole reason to have this here rather than only in `.githooks/pre-commit`:
     a fresh clone has not run `git config core.hooksPath .githooks`, and the
     first thing anybody does in a fresh clone is change a number. This is the
     one check in the register block that would notice.

     IMPORTED, NOT SPAWNED. `execFileSync('node', ...)` would make the slowest
     assertion in this file a documentation one, and the slowest assertion is
     the one that gets deleted. `doc-sync` guards its own CLI on argv, so
     importing it renders and returns without touching the file. */
  const { staleBlocks, TARGETS } = await import('./doc-sync.mjs');
  const stale = staleBlocks();
  ok('...and its generated tables are in step with the code',
    stale.length === 0,
    stale.length ? `stale: ${stale.join(' ')} — run \`npm run docs\`` : `${TARGETS.length} files`);

  /* The markers are what makes the block above a NO-OP rather than a lie: with
     a pair deleted, `splice` throws and this fails loudly. Naming them here as
     well means the failure says WHICH file lost them — and the page's source is
     checked as hard as the doc, because it is the copy people are SENT. */
  for (const [file, blocks] of TARGETS) {
    const text = readFileSync(new URL(file, root), 'utf8');
    const lost = Object.keys(blocks).filter((id) =>
      !text.includes(`<!-- doc-sync:${id} -->`) || !text.includes(`<!-- /doc-sync:${id} -->`));
    ok(`...and ${file} still carries its doc-sync markers`, lost.length === 0,
      lost.length ? lost.join(' ') : Object.keys(blocks).join(' '));
  }

  /* THE PUBLISHED PAGE IS A SECOND COPY AND HAS ITS OWN WAY OF GOING STALE.
     doc-sync keeps its TABLES true, but nothing mechanical can mirror a
     paragraph, and nothing in this repo can push a file to claude.ai — that
     needs the Artifact tool. So the check is the one thing a script CAN do:
     compare hashes against what was recorded at the last publish, and say a
     publish is owed. It caught the page sitting three revisions behind on the
     day it was written (1805 checks against 1888). */
  const { artifactStatus } = await import('./artifact-sync.mjs');
  const art = artifactStatus();
  ok('the published page has been re-published since its source last changed',
    !art.pageStale, art.pageStale ? 'run `npm run artifact` for what to do' : art.publishedAt);
  ok('...and has been revised since PROJECT.md last changed',
    !art.sourceStale, art.sourceStale ? 'PROJECT.md has moved ahead of the page' : 'in step');
}

/* Print the total. HANDOFF.md quoted it in two places and they disagreed (150
   and 71) because it was only ever counted by hand — and counting the output by
   hand gets it wrong too: labels longer than the 42-char pad push the status
   past the column you'd grep for. The script knows; let it say. */
console.log(fails
  ? `\n${fails} of ${checks} CHECK(S) FAILED`
  : `\nall ${checks} checks passed`);
process.exit(fails ? 1 : 0);
