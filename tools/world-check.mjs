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
import { SHRINE_DAIS } from '../src/world/build.js';

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
      get: (_, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}),
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
