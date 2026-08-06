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

const line = (l, v) => console.log(String(l).padEnd(42) + v);
let fails = 0;
const ok = (label, cond, extra = '') => {
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

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
