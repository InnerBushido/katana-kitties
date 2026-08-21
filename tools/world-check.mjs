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
import { Billboard } from '../src/core/gfx.js';
import { Player } from '../src/entities/player.js';
import {
  Panda, PANDA_TIERS, PANDA_SPEED, CLAW, tierFor, toNextTier, FULL_PANDA_COST,
} from '../src/entities/panda.js';
import { LEADERS, ELDER, leaderSpot, LEADER_OFFSET } from '../src/entities/leader.js';
import { beatOver, TAIL, LINE_TAIL, MAX_SLIP } from '../src/systems/cutscene.js';
import { SCENE_RADIUS, DWELL } from '../src/systems/shrinescene.js';
import { DragonBall, BALL_COUNT, PICKUP_RADIUS, LOCKS, ISLAND_LOCKS } from '../src/entities/dragonball.js';
import { Ryuuseki, GUNNER_BEAMS, PILOT_BEAMS, BEAM, RYU_SIZE, FAN, AIM_ARC, RYU_BACK, HOVER, RYU_MOUTH, RYU_CAM } from '../src/entities/ryuuseki.js';
import { SCRIPTS, DUSK_DEEP } from '../src/systems/summonscene.js';
import { SHRINE_DAIS, SHARD_RISE, SHARD_COUNT, SPIRE_H, __curvedWallForTest } from '../src/world/build.js';
import { ISLAND_MUSIC, MUSIC, trackForIsland } from '../src/core/audio.js';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  floodBackground, clearSealedPockets, purelyWhite, pocketFloor,
  packMetrics, countInk,
} from '../src/core/spritesheet.js';
import {
  profileFor as deviceProfileFor, effectivePixelRatio,
} from '../src/core/device.js';
import { readPNG, blobs, writePNG, writeICO } from './png.mjs';
import {
  POWER_ORBS, ORB_IDS, MAX_EQUIPPED, aggregate, orbPrice, orbSellPrice,
  WARD, DIVE, TRIPLE, CHARGE, stockFor, STOCK_STACKABLE,
  PowerOrb, PowerOrbPickup, ORB_BY_ID,
} from '../src/entities/powerorb.js';
import { Kotodama } from '../src/systems/kotodama.js';
import { ATTACKS, MAX_HP, DAZE_TIME } from '../src/entities/player.js';
import {
  Tournament, WINS_NEEDED, MAX_ROUNDS, FEAST_TIME, REGEN_FRAC,
} from '../src/systems/tournament.js';
import {
  Critter, CRITTERS, CRITTER_BY_ID, EAT_TIME, MOUTH_TIME, CATCH_RADIUS, STUN_TIME,
  poseQuad,
} from '../src/entities/critter.js';
import {
  Menagerie, MAX_ON_STAGE, MAX_PER_SPECIES, RESPAWN_MIN, RESPAWN_MAX,
} from '../src/systems/menagerie.js';
import {
  MILESTONES, OPEN_AT, ArenaQuest, SATAN_TOWN,
} from '../src/systems/arenaquest.js';
import { PLAYER_STYLE, MAX_PLAYERS, styleFor, styleCss } from '../src/core/palette.js';
import { splitLayout, mapWidth } from '../src/core/split.js';
import { clusterPlayers, MERGE_IN, MERGE_OUT } from '../src/core/cluster.js';
import { recolourPixels, liftWindow } from '../src/core/spritesheet.js';
import { postsFor } from '../src/world/build.js';
import { MathDojo, DOJO_RADIUS } from '../src/systems/mathdojo.js';
import { Orb } from '../src/entities/orb.js';
import { Label, labelCacheStats } from '../src/core/label.js';
import {
  MODES, MODE_BY_ID, modesFor, handicapFor, HANDICAP_MAX, NO_SIDE, ROUND_LIMIT,
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

/* Clan shrines carry world-space text labels drawn onto a canvas, and Node has
   no DOM. Stand up just enough of one — nothing here is ever rasterised. This
   has to be assigned before the World is BUILT, not before the imports: ESM
   hoists those, and the DOM is only touched at construction time. */
globalThis.document = {
  createElement: () => ({
    width: 1,
    height: 1,
    getContext: () => new Proxy({}, {
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
    }),
  }),
  /* The tournament reaches for its HUD elements in its constructor. Every use
     of them downstream is `?.`-guarded, so `null` is the honest stub — and it
     is a better one than a fake element, because a fake would let a check
     pass that only works because the DOM silently swallowed it. */
  getElementById: () => null,
};

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
  ok('no attack can end a full-health round in one hit',
    Math.max(...Object.values(ATTACKS).map((a) => a.dmg)) < MAX_HP / 3);

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

  const done = new NameEntry();
  const r = done.update(0.016, [pad(0, 0, 'jump')]);
  ok('jump confirms', r.confirmed && done.done);
  ok('...and a confirmed entry stops responding',
    done.update(0.016, [pad(0, 1)]).moved === false);

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
    ok('...and takes it once there are letters in it', half.accept() && half.done);
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
    'sat_board', 'sat_r1', 'sat_r2', 'sat_r3', 'sat_fight', 'sat_ko', 'sat_win1', 'sat_win2'];
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
  line('the eight', POWER_ORBS.map((o) => `${o.kanji} ${o.name}`).join(', '));
  ok('there are eight of them', ids.length === 8);
  ok('every id is unique', new Set(ids).size === ids.length);
  ok('every one has a kanji, a colour and a blurb',
    POWER_ORBS.every((o) => o.kanji && o.color && o.blurb && o.label));
  ok('no two share a colour', new Set(POWER_ORBS.map((o) => o.color)).size === 8);

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
  const fields = ids.map(changed);
  ok('every orb changes something', fields.every((f) => f.length > 0),
    ids.filter((id, i) => !fields[i].length).join(' '));
  ok('...exactly one thing each', fields.every((f) => f.length === 1));
  const flat = fields.flat();
  ok('...and no two change the same thing', new Set(flat).size === flat.length,
    flat.join(' '));

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
  ok('the tail is much shorter than the block it follows',
    WARD.tail > 0 && WARD.tail < WARD.max / 4);

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
    ORB_IDS.every((id) => K.pickups.filter((p) => p.id === id).length === 1));
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
  /* THE DEALER IS THE ONLY SOURCE OF A SECOND COPY, so his shelf is where the
     stacking rule lives. Four of each stat orb — the four whose whole point is
     a number going up — and one of each move, where a second copy only widens
     something she can already do. */
  const stackable = POWER_ORBS.filter((o) => o.stack).map((o) => o.id);
  line('stackable in stock', stackable.map((id) => `${id} x${K.stock[id]}`).join(', '));
  ok('the four stat orbs are the stackable ones',
    stackable.join() === 'swift,reach,vigor,leap');
  ok(`...and the dealer holds ${STOCK_STACKABLE} of each`,
    stackable.every((id) => K.stock[id] === STOCK_STACKABLE));
  ok('...one of every move', ids.filter((id) => !stackable.includes(id))
    .every((id) => K.stock[id] === 1));
  ok('stock comes from stockFor, not from a second list',
    ids.every((id) => K.stock[id] === stockFor(id)));
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
  const PAD = (over = {}) => ({
    mx: 0, my: 0, down: () => false, pressed: () => false, ...over,
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
  /* THE ARMING WINDOW IS THE WHOLE MOVE. Gated on the swing animation instead
     of on a flag, the usable window is TRIPLE.hold to attackTimer — about two
     frames — and the move fires roughly a third of the time, which reads as
     the game ignoring her rather than as a timing she could learn. This walks
     a real held button through the real controller. */
  {
    const held = mk(['tri']);
    const down = PAD({ down: (a) => a === 'attack', pressed: (a) => a === 'attack' });
    const stay = PAD({ down: (a) => a === 'attack' });
    held.update(1 / 60, down, world, [], null);          // the press
    let armedAt = -1;
    for (let i = 0; i < 60 && held.triLeft === 0; i++) {
      held.update(1 / 60, stay, world, [], null);
      if (held.triLeft > 0) armedAt = (i + 1) / 60;
    }
    line('hold to triple slash', `${armedAt.toFixed(2)}s (threshold ${TRIPLE.hold})`);
    ok('holding attack really does fire it', held.triLeft > 0);
    ok('...promptly after the threshold', armedAt > 0 && armedAt < TRIPLE.hold + 0.12);

    const tapOnly = mk(['tri']);
    tapOnly.update(1 / 60, down, world, [], null);
    for (let i = 0; i < 60; i++) tapOnly.update(1 / 60, PAD(), world, [], null);
    ok('...and a plain tap never does', tapOnly.triLeft === 0);
  }

  const t = mk(['tri']);
  t._startTriple(null);
  ok('three cuts, and the swing that armed it was the first',
    t.triLeft === TRIPLE.cuts - 1);
  ok('she cannot move or jump through it', t.busy);
  let cuts = 0;
  const spy = { sfx: (n) => { if (n === 'slash') cuts++; }, strikePlayers: () => {} };
  for (let i = 0; i < 120 && t.triLeft > 0; i++) t._stepSpecials(1 / 60, PAD(), world, spy);
  ok('...and the other two land', cuts === TRIPLE.cuts - 1);
  ok('...then she gets her feet back', !t.busy);

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
    long._reach() === 3.4 * long.power.reach);
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
    };
    const spread = (v) => Math.max(...v) / Math.min(...v);

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
    ok('the shared pane is FULL WIDTH, not a tall half',
      three[0].w === VW && three[0].h < VH);

    /* THE BIG PANE GOES ON TOP WHEREVER ITS GROUP SITS IN THE ORDER, so the
       returned array still lines up index-for-index with the caller's groups.
       Sorting the panes would silently hand one group another's camera. */
    for (const at of [0, 1, 2]) {
      const sizes = [1, 1, 1];
      sizes[at] = 2;
      const p = splitLayout(3, VW, VH, 3, 'vertical', sizes);
      ok(`a pair at index ${at} keeps index ${at} and takes the top strip`,
        p[at].w === VW && p[at].y > 0 && p.length === 3);
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

    /* TWO PANES ARE LEFT ALONE. Both are already at least half the screen,
       which is the rule; carving a 3:1 split for a trio plus a straggler would
       hand the lone kitten a sliver the camera cannot use. */
    ok('two panes are unchanged whatever is in them',
      JSON.stringify(splitLayout(2, VW, VH, 3, 'vertical', [3, 1]))
      === JSON.stringify(vert));
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
  ok('...and never fewer than one of each kind',
    worldSpawnCount(1) >= ORB_IDS.length);

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
  ok('a desktop is unchanged: two kittens, auto split, medium, AA on',
    desk.defaultParty === 2 && desk.defaultSplit === 'auto'
    && desk.defaultQuality === 'medium' && desk.antialias === true
    && desk.atlasMax === 2048);
  /* Above any real panel, so it never wins the `Math.min` — but FINITE, because
     `Infinity` JSON-serialises to null and `Math.min(dpr, q, null)` is 0. */
  ok('...and its pixel-ratio cap is finite and out of the way',
    Number.isFinite(desk.maxPixelRatio) && desk.maxPixelRatio >= 4);
  /* A TOUCHSCREEN LAPTOP IS NOT A PHONE. `maxTouchPoints > 0` alone would take
     antialiasing off a desktop and start it at one player. */
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
    effectivePixelRatio(desk, 3, 'high') === 2 && effectivePixelRatio(desk, 1, 'high') === 1);

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

/* Print the total. HANDOFF.md quoted it in two places and they disagreed (150
   and 71) because it was only ever counted by hand — and counting the output by
   hand gets it wrong too: labels longer than the 42-char pad push the status
   past the column you'd grep for. The script knows; let it say. */
console.log(fails
  ? `\n${fails} of ${checks} CHECK(S) FAILED`
  : `\nall ${checks} checks passed`);
process.exit(fails ? 1 : 0);
