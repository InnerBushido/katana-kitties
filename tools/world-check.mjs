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
import { Dragon, BREEDS } from '../src/entities/dragon.js';
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
import { SHRINE_DAIS, SHARD_RISE, SHARD_COUNT, SPIRE_H } from '../src/world/build.js';

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
};

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
  ok('and seven islands to put them on', world.islands.length === BALL_COUNT);

  /* One per island, and no island with two. The hunt sends the girls to every
     island in the game exactly once — two on the home island and none on the
     ash island is a pair flying in circles over a rock they have already
     stripped, with nothing telling them it is the wrong rock. */
  const perIsland = new Map();
  for (const b of balls) {
    let owner = null;
    for (const isl of world.islands) {
      if (Math.hypot(b.position.x - isl.x, b.position.z - isl.z) < isl.radius) owner = isl;
    }
    perIsland.set(owner, (perIsland.get(owner) ?? 0) + 1);
  }
  ok('every ball is ON an island', !perIsland.has(null));
  ok('exactly one per island',
    perIsland.size === world.islands.length
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
     ball's — a grotto is 11.6 across and the star inside it is a point. */
  {
    const FOOT = { cave: 11.6, perch: 5.2, sky: 4.2, none: 1, ice: 2, boulder: 2.4 };
    const perches = world.dragonPerches();
    line('dragon perches resolved', perches.length);
    ok('every dragon perch found real ground', perches.length === 8);
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
    const onFoot = { position: new THREE.Vector3(), mount: null, rideAlong: null, pandaMount: null };
    const onDragon = { ...onFoot, mount: {} };
    const onPanda = { ...onFoot, pandaMount: {} };
    for (const b of balls) {
      if (!b.rule.foot) continue;
      ok(`the ${b.lock} star refuses a dragon rider`, !b.canTake(onDragon).ok);
      ok('and refuses a panda rider', !b.canTake(onPanda).ok);
      ok('and both refusals explain themselves',
        !!b.canTake(onDragon).why && !!b.canTake(onPanda).why);
      ok('but takes her on her own two feet', b.canTake(onFoot).ok);
    }
    /* ...and the ones that DON'T say foot must still be takeable from a
       dragon, or the ice star — which you can only open from the air — would
       be a star you unlock and then cannot reach. */
    const ice = balls.find((b) => b.lock === 'ice');
    ice.strike('breath');
    ok('the ice star can be taken from the dragon that freed it',
      ice.canTake(onDragon).ok);
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

/* Print the total. HANDOFF.md quoted it in two places and they disagreed (150
   and 71) because it was only ever counted by hand — and counting the output by
   hand gets it wrong too: labels longer than the 42-char pad push the status
   past the column you'd grep for. The script knows; let it say. */
console.log(fails
  ? `\n${fails} of ${checks} CHECK(S) FAILED`
  : `\nall ${checks} checks passed`);
process.exit(fails ? 1 : 0);
