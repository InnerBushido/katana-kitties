/* ---------------------------------------------------------------------------
   CUSTOM HOUSING — the checks that catch what still looks fine on screen.
   Run from world-check.mjs at the end, against its own World.

   What each one is protecting, in the order a purchase happens:
     the four roads wind, fault-free, round Snake Way and each other
     a house's floors are walkable from its door, upstairs included
     buying takes exactly the price, from every co-owner, and writes it down
     selling pays 75% back to EACH owner — the absent ones into the bank
     the world's signature does not move because somebody bought a house
     a locked island pushes a stranger out and lets an owner in
     the care ladder, the furnishing grid, the speed strip, the music fallback
     the one combat gate is still the first line of `strikePlayers`
--------------------------------------------------------------------------- */
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { mergeParts } from '../../src/world/build.js';
import { Housing, TOUR, HOME_FORWARD } from '../../src/systems/housing/housing.js';
import { HOME_SITES, HOUSES, HOUSE_BY_ID, PRESETS, ITEM_BY_ID, priceOf, HOME_SELL, SPEED_STRIP, FREE_ANNEX, homeRooms } from '../../src/systems/housing/catalog.js';
import { linkWhy, linkBlockers, portSpots, linkModels, linkGeom, linkParts, linkAll, linkColliders, linkPriceK, defaultVia, endAt, overStrip, turnArc, TURN_PRICE } from '../../src/systems/housing/links.js';
const ITEMS_PATHS = () => ITEMS.filter((it) => it.path);
import { emptyStore, newHome, normalise, saveStore, loadStore, migrateYard, HOME_KEY, homeKey, pruneRows, HOME_ROWS_KEPT } from '../../src/systems/housing/homestore.js';
import { careLevel, careBuff, stalksAt, BAMBOO_GROW, BAMBOO_MAX } from '../../src/systems/housing/farm.js';
import { fits, firstFit, gridOf, autoLayout, ITEM_SELL, yardWhy, yardR, firstYardSpot, addOutdoor, wallSlots, houseWhy, defaultWindows } from '../../src/systems/housing/editor.js';
import { buildWhy, commitBuild, removeBuilt, pickList, stepToward, BUILD_KEYS, carry, uncarry } from '../../src/systems/housing/build.js';
import { houseRadius, houseShape, HEAD_H, SLAB_T, buildHouseShell, houseFoot, WINDOW, PORT_H, stairBlocks } from '../../src/systems/housing/homehouse.js';
import { possessive, ownedCount, roomRefund, changeRoomType, roomTypeRefund } from '../../src/systems/housing/cards.js';
import { JUKEBOX, JUKEBOX_BY_ID, PREVIEW_AT, previewOf, ACTIVITY_MUSIC } from '../../src/systems/housing/jukebox.js';
import { MUSIC_FILES } from '../../src/core/musicfiles.js';
import { JUKEBOX_FILES } from '../../src/systems/housing/jukeboxfiles.js';
import { rollFish, FISH } from '../../src/systems/housing/fishing.js';
import { PLAYER_STYLE } from '../../src/core/palette.js';
import { worldSig } from '../../src/systems/savegame.js';
import { ROSHI_LINES, ROSHI_VOICE } from '../../src/systems/housing/roshi.js';
import { Kendo, KIAI_T, BOUT, SEIZA, KENDO_HIT, KENDO_TURN, yawAcross } from '../../src/systems/housing/kendo.js';
import { LOWER_XRAY, BEHIND_HOP, KNOCK, DOOR_XRAY, TEA_SHOT, doorSeg } from '../../src/systems/housing/housing.js';
import { roofY } from '../../src/systems/housing/homehouse.js';
import { XRAY_SLOTS, SLIDE_W } from '../../src/systems/housing/homeisle.js';
import { HoloStar, LASER_ORDER, LASER_COLOUR } from '../../src/systems/dream/targets.js';
import { kendoArea, kendoMarks } from '../../src/systems/housing/catalog.js';
import { KENDO_DODGE, KENDO_SCALE, KENDO_CEREMONY_H, Player } from '../../src/entities/player.js';
import { Billboard } from '../../src/core/gfx.js';
import { clusterPlayers, MERGE_IN, MERGE_OUT } from '../../src/core/cluster.js';
import { PurchaseScene } from '../../src/systems/housing/purchasescene.js';
import { voicePath } from '../../src/core/audio.js';
import { existsSync } from 'node:fs';
import { mealPct, BOON } from '../../src/systems/housing/boons.js';
import { DOOR_SWING, HomeBridge, GATE, STATUE_SLOTS, faceCamera, bannerYaw, BARREL_H } from '../../src/systems/housing/homebridge.js';
import { napFade, napFacing, HomeActivities, LOOK_SHOT, lookShot } from '../../src/systems/housing/activities.js';
import { DOOR_PATHS, doorPathId, doorWalk, doorWalkBox, layDoorPath } from '../../src/systems/housing/editor.js';
import { ringR, RING_R } from '../../src/systems/housing/build.js';
import { LOOK_FADE, PLAYER_RADIUS } from '../../src/entities/player.js';
import { xrayModel, PANEL_GAP, WINDOW_IN, furnScale, FURN_REACH, FURN_INSET, pathParts, steppingStones } from '../../src/systems/housing/homeisle.js';
import { PathFX, FLARE_T, FLARE_COLOURS, LAMP_TINT } from '../../src/systems/housing/pathfx.js';
import { ZEN, ZEN_STONES, ZEN_RAKE, RAKE_T } from '../../src/systems/housing/zengarden.js';
import { TEA, TEA_T, TEA_LEN, TEA_ANIM, TEA_SHEET, teaFrameAt, teaSips } from '../../src/systems/housing/teahouse.js';
import { zFights } from './zfight.mjs';
import { TREEHOUSE_PLAN, slidePath, LIP_WALL } from '../../src/systems/housing/treehouse.js';
import { aheadOnPath, SLIDE_LOOK } from '../../src/systems/housing/sliderider.js';
/** The slide drops her from the roof (SP.top 15.7) to the run; "all the way down" is most of it. */
const SLIDE_DROP_MIN = 14;
import { holoLayout, HOLO_GRAB, HOLO_TUBE, holoKit, ensureHoloKit, holoWhyRemove, holoTubes, holoCell, HOLO_TUBE_ID, HOLO_MAX_TUBES } from '../../src/systems/housing/holodeck.js';
import { GEAR_ITEMS } from '../../src/systems/dream/gear.js';
import { fits as fitsGrid } from '../../src/systems/housing/editor.js';
import { ROOM_TYPE_BY_ID, TINY_HOUSE, pathPosts } from '../../src/systems/housing/catalog.js';
import { HOME_FLOAT_H } from '../../src/systems/dreamdojo.js';
import { TUBE_FRAG } from '../../src/systems/dream/gear.js';
import { castPoint, fishCount, fishLen, ANGLE } from '../../src/systems/housing/angling.js';
import { petLevel, petBoost, messesAt, rhythmError, PLAY } from '../../src/systems/housing/petplay.js';
import { fitTo, styleModel, stylesFor, drawItem, placeModel, LOOK_MUL, TINTS, STONES, primeModel } from '../../src/systems/housing/models.js';
import { MODEL_STYLES } from '../../src/systems/housing/modelstyles.js';
import { roomLook, CEILING_GAP, FLOOR_H, YARD_BUILT } from '../../src/systems/housing/homeisle.js';
import { ITEMS, LINK_STYLES } from '../../src/systems/housing/catalog.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const DAY = 24 * 3600 * 1000;

function fakePlayer(i, x = 0, z = 0, y = 0) {
  const style = PLAYER_STYLE[i];
  return {
    // a REAL kitten's radius: at 0.6 the slide check walked a body 0.3 thinner than any girl into a chute she could not enter
    index: i, style, name: style.name, score: 0, radius: PLAYER_RADIUS,
    position: new THREE.Vector3(x, y, z), velocity: new THREE.Vector3(),
  };
}

export async function housingChecks({ ok, world }) {
  console.log('\n--- custom housing: roads, floors, money, locks ---');
  localStorage.removeItem(HOME_KEY);
  for (const s of ['check-A', 'check-B']) localStorage.removeItem(homeKey(s));
  const toasts = [];
  const game = {
    world, scene: new THREE.Scene(), players: [],
    kotodama: { price: 650 }, sessionCast: new Map(), sessionId: 'check-A',
    toast: (t, i) => toasts.push([i, t]),
    onScoreChanged: () => {}, audio: null,
    inspector: { openExt: () => true, cards: [], closeOne() {}, extOf: () => null },
  };
  const sigBefore = worldSig(world);
  const H = new Housing(game);
  H.build();
  ok('housing builds four islands, one per site, none of them in world.islands',
    H.isles.length === HOME_SITES.length && H.isles.every((I) => !world.islands.includes(I.island)));
  /* NOT UP UNTIL THE ENDING. Richard: "The islands for purchase shouldn't be
     spawned until after the ending cutscene plays" — and a new game after
     one that had seen it found them still there. */
  {
    const wasOpen = world.snakeOpen;
    world.snakeOpen = false;
    H.update(1 / 30);
    const I0 = H.isles[0];
    ok('before the ending the islands are not in the sky: unseen, and nothing to stand on',
      H.isles.every((I) => !I.group.visible) && H.heightAt(I0.x, I0.z) == null);
    H.debugOpen = true;
    H.update(1 / 30);
    ok('...and once the shop opens they are', H.isles.every((I) => I.group.visible) && H.heightAt(I0.x, I0.z) != null);
    world.snakeOpen = wasOpen;
  }

  /* THE ROADS. Solved in one canonical order so no purchase order can make
     two of them cross. */
  H.solveNow();
  const wound = H.wound ?? [];
  ok('all four home roads wind', wound.length === 4 && wound.every(Boolean),
    wound.map((w, k) => `${HOME_SITES[k].id}:${w ? 'ok' : 'NONE'}`).join(' '));
  ok('...with no faults against Snake Way or each other', wound.every((w) => w && !(w.faults?.length)),
    wound.map((w) => w?.faults?.length ?? '-').join(','));
  const starts = wound.filter(Boolean).map((w) => w.pts[0]);
  let minGap = Infinity;
  for (let a = 0; a < starts.length; a++) {
    for (let b = a + 1; b < starts.length; b++) minGap = Math.min(minGap, Math.hypot(starts[a].x - starts[b].x, starts[a].z - starts[b].z));
  }
  ok('...and no two leave from the same stretch of the town rim (≥ 16 apart)', minGap >= 16, minGap.toFixed(1));
  ok('...each starting over the main island', starts.every((s) => world.islands[0].heightAt(s.x, s.z) != null
    || Math.hypot(s.x - world.islands[0].x, s.z - world.islands[0].z) < world.islands[0].radius + 6));
  ok('an island is about a minute\'s walk out (road ≥ 300 units)', H.bridges.every((B) => B && B.road.length >= 300),
    H.bridges.map((B) => B?.road.length.toFixed(0)).join(','));

  /* THE SPEED STRIP: 2x in the middle, 1x at both ends. */
  const B0 = H.bridges[0];
  const mid = B0.road.frameAt(B0.road.length * 0.5);
  const end = B0.road.frameAt(B0.road.length * 0.03);
  const boostMid = B0.road.boost(mid.x ?? mid.pos?.x, mid.z ?? mid.pos?.z, (mid.y ?? mid.pos?.y) - 0.1);
  const boostEnd = B0.road.boost(end.x ?? end.pos?.x, end.z ?? end.pos?.z, (end.y ?? end.pos?.y) - 0.1);
  ok('the bridge\'s speed strip is 2x down the middle and 1x by the gates', boostMid === SPEED_STRIP.mult && boostEnd === 1,
    `${boostMid} ${boostEnd}`);

  /* NOT GROUND UNTIL SOMEBODY OWNS IT. */
  ok('an unbought bridge is not ground', H.heightAt(mid.x ?? mid.pos?.x, mid.z ?? mid.pos?.z, 9999)?.platform == null);

  /* BUYING. */
  const p0 = fakePlayer(0, 4, 4);
  const p1 = fakePlayer(1, 6, 4);
  const p2 = fakePlayer(2, 8, 4);
  game.players = [p0, p1];
  const minka = priceOf(HOUSE_BY_ID.minka.mult, 650);
  p0.score = minka + 5;
  const r1 = H.buy('sunrise', 'minka', [{ p: p0, share: minka }], null);
  H.purchase.finish();
  ok('buying a small house takes exactly its price', r1.ok && p0.score === 5, `${r1.why ?? ''} purse ${p0.score}`);
  ok('...and is written down that frame, not when the scene ends — in THIS game\'s row',
    !!JSON.parse(localStorage.getItem(homeKey('check-A'))).homes.sunrise && !localStorage.getItem(HOME_KEY));
  ok('...priced at 8 orbs, rounded to a ten', minka === 5200, minka);
  ok('one home each: a second purchase is refused, with a reason',
    !H.buy('cloudpeak', 'minka', [{ p: p0, share: 0 }]).ok);
  ok('the world\'s signature does not move because somebody bought a house', worldSig(world) === sigBefore);
  ok('a bought bridge is ground, from the town to her island',
    H.heightAt(mid.x ?? mid.pos?.x, mid.z ?? mid.pos?.z, (mid.y ?? mid.pos?.y) + 0.3)?.platform?.home === true);
  ok('...and World.heightAt finds it', world.heightAt(mid.x ?? mid.pos?.x, mid.z ?? mid.pos?.z, (mid.y ?? mid.pos?.y) + 0.3)?.platform?.home === true);

  /* FLOORS: every floor of every house is walkable from its door. */
  let doorChecked = false;
  for (const h of HOUSES) {
    const I = H.isles[3];
    I.setHome(newHome(I.site.id, h.id, ['Ember']), [0xff8a3d]);
    const door = I.local(0, I.shell.door.z + 0.5);
    const atDoor = I.heightAt(door.x, door.z, I.groundY + 5);
    const bad = [];
    for (const room of h.rooms) {
      const c = I.local(room.cx, room.cz);
      const fy = I.groundY + I.shell.floorY[room.floor];
      const g = I.heightAt(c.x, c.z, fy + 0.3);
      if (!g || Math.abs(g.y - fy) > 0.35) bad.push(`${room.id}@${g?.y?.toFixed?.(2)} want ${fy.toFixed(2)}`);
    }
    ok(`${h.name}: the door step is ground and every room's floor is where it is drawn`, !!atDoor && !bad.length, bad.join(' '));
    /* Climbing: walk the stair decks from bottom to top, step by step. */
    if (I.shell.floorY.length > 1) {
      const stairs = I.decks.filter((d) => d.stair != null);
      ok(`${h.name}: there is a ramp to every upper floor`, stairs.length >= I.shell.floorY.length - 1, stairs.length);
      /* AND IT CAN BE CLIMBED: walked up from the bottom in small steps, the
         ground under her never jumps by more than a step. A ramp drawn with
         its slope the wrong way round passes the count above and fails here. */
      const climbs = stairs.map((d) => {
        const xc = (d.x0 + d.x1) / 2;
        let y = null;
        let worst = 0;
        for (let k = 0; k <= 40; k++) {
          const z = d.z1 - (k / 40) * (d.z1 - d.z0);
          const w = I.local(xc, z);
          const g = I.heightAt(w.x, w.z, y == null ? I.groundY + d.yAt(xc, d.z1) + 0.1 : y + 0.1);
          if (!g) return Infinity;
          if (y != null) worst = Math.max(worst, Math.abs(g.y - y));
          y = g.y;
        }
        const top = I.groundY + I.shell.floorY[d.stair + 1];
        return Math.abs(y - top) < 0.4 ? worst : Infinity;
      });
      /* THE TIMBER STAYS UNDER THE TILES. Richard: "the beams in the roof
         are poking out from outside the house". Cast straight down from just
         over the storey on every corner post and the middle of every wall
         beam: the first tile hit has to be ABOVE the timber's top. (From the
         sky, the top roof's overhang answers first and hides the very skirt
         the beams came through — the first version of this check passed the
         broken house.) And
         no skirt may reach into the storey above it. */
      {
        const SH = buildHouseShell(h.id);
        const tiles = SH.tint.map((g) => new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })));
        const rc = new THREE.Raycaster();
        const bad = [];
        const sh = houseShape(h.id);
        sh.floors.forEach(([hw, hd], f) => {
          const top = SH.floorY[f] + FLOOR_H;
          const pts = [[hw, hd], [-hw, hd], [hw, -hd], [-hw, -hd], [0, hd], [0, -hd], [hw, 0], [-hw, 0]];
          for (const [x, z] of pts) {
            // (the top storey's own roof lifts at the corners — start over it)
            rc.set(new THREE.Vector3(x, top + (f === sh.floors.length - 1 ? 3 : 0.6), z), new THREE.Vector3(0, -1, 0));
            const hit = rc.intersectObjects(tiles)[0];
            // the post's top is 0.22 under the storey's top, the beam's 0.30
            if (!hit || hit.point.y < top - 0.22 + 0.04) bad.push(`f${f} (${x},${z}) ${hit ? (hit.point.y - top).toFixed(2) : 'open sky'}`);
          }
          if (f < sh.floors.length - 1) {
            const [uw, ud] = sh.floors[f + 1];
            for (const [x, z] of [[0, 0], [uw - 0.5, ud - 0.5]]) {
              rc.set(new THREE.Vector3(x, top + 0.05, z), new THREE.Vector3(0, -1, 0));
              const hit = rc.intersectObjects(tiles)[0];
              if (hit && hit.point.y > top - 0.05) bad.push(`f${f} skirt inside the floor above at (${x},${z})`);
            }
          }
        });
        const nrm = SH.tint.flatMap((g) => { const n = g.getAttribute('normal'); return Array.from({ length: n.count }, (_, i) => n.getY(i)); });
        ok(`${h.name}: no post or beam pokes out through the roof or an eave skirt, and no skirt reaches into the room above`, !bad.length, bad.join('; '));
        ok(`${h.name}: ...and every tile faces up, so none is culled from outside`, nrm.every((y) => y > 0), `${nrm.filter((y) => y <= 0).length} face down`);
      }
      ok(`${h.name}: every ramp climbs smoothly from one floor to the next`, climbs.every((w) => w < 0.6), climbs.map((w) => w.toFixed(2)).join(','));
      /* ...AND COMES DOWN AGAIN. "If player navigated to the 2nd or 3rd floor
         in the house, they are getting stuck on that floor." Start on the
         floor above, behind the top of the stairs, and walk forward over the
         stairwell: the ground under her has to follow the steps all the way
         down, not stay at the upper floor's height. */
      const descents = stairs.map((d) => {
        const xc = (d.x0 + d.x1) / 2;
        let y = I.groundY + I.shell.floorY[d.stair + 1];
        let worst = 0;
        for (let k = -4; k <= 40; k++) {
          const z = d.z0 + (k / 40) * (d.z1 - d.z0);
          const w = I.local(xc, z);
          const g = I.heightAt(w.x, w.z, y + 0.1);
          if (!g) return Infinity;
          worst = Math.max(worst, Math.abs(g.y - y));
          y = g.y;
        }
        const bottom = I.groundY + I.shell.floorY[d.stair];
        return Math.abs(y - bottom) < 0.4 ? worst : Infinity;
      });
      ok(`${h.name}: every staircase can be walked DOWN, from the floor above to the one below`, descents.every((w) => w < 0.6), descents.map((w) => w.toFixed(2)).join(','));
      /* THE CEILING. "if they double or triple jump, they can jump to the
         floor above them, we should make it that they hit the ceiling". */
      const W = I.shell.wells[0];
      const fy0 = I.groundY + I.shell.floorY[0];
      const fy1 = I.groundY + I.shell.floorY[1];
      const room = I.local(-W.xc, 0);
      const jumper = fakePlayer(0, room.x, room.z, fy1 - SLAB_T - HEAD_H + 0.5);
      jumper.velocity.y = 20;
      const was = { dbg: H.debugOpen, home: H.store.homes[I.site.id] };
      H.debugOpen = true;
      H.store.homes[I.site.id] = I.home;
      H.wall(jumper, jumper.position.x, jumper.position.z, null);
      ok(`${h.name}: a kitten jumping on the ground floor hits the ceiling, and stops rising`,
        jumper.position.y + HEAD_H <= fy1 - SLAB_T + 1e-6 && jumper.velocity.y === 0, `head ${(jumper.position.y + HEAD_H).toFixed(2)} lid ${(fy1 - SLAB_T).toFixed(2)}`);
      const inWell = I.local((W.x0 + W.x1) / 2, (W.z0 + W.z1) / 2);
      ok('...except up through the stairwell, which has no lid', I.ceilingAt(inWell.x, fy0 + 1, inWell.z) == null);
      ok('...and somebody on the floor above is not under the floor she is standing on', I.ceilingAt(room.x, fy1 + 0.1, room.z) !== fy1 - SLAB_T);
      /* WALKED, THROUGH THE WALLS. "Unable to climb to the second floor in
         the castle house ... there is a barrier blocking the walking path at
         the top of the steps." Every check above read the decks and passed:
         the stair's own rail stood 2 over the floor above, and 1.2 from the
         back wall, for a kitten 1.2 wide. So: walk her up every staircase
         with `H.wall` after each step, off the top onto the landing, round
         into the room upstairs — and back down again. */
      const walker = fakePlayer(0, 0, 0, 0);
      const walk = (path) => {
        for (const [tx, tz] of path) {
          const tw = I.local(tx, tz);
          for (let n = 0; n < 400; n++) {
            const dx = tw.x - walker.position.x, dz = tw.z - walker.position.z;
            const d = Math.hypot(dx, dz);
            if (d < 0.15) break;
            const wx = walker.position.x, wz = walker.position.z;
            walker.position.x += (dx / d) * 0.1;
            walker.position.z += (dz / d) * 0.1;
            const g = I.heightAt(walker.position.x, walker.position.z, walker.position.y);
            if (g) walker.position.y = g.y;
            walker.velocity.set(0, 0, 0);
            H.wall(walker, wx, wz, null);
          }
          const L = I.toLocal(walker.position.x, walker.position.z);
          if (Math.hypot(L.x - tx, L.z - tz) > 0.3) return `stuck at (${L.x.toFixed(1)}, ${L.z.toFixed(1)}) y ${(walker.position.y - I.groundY).toFixed(1)}, going to (${tx}, ${tz})`;
        }
        return null;
      };
      const stuck = [];
      for (const Wk of I.shell.wells) {
        const [uw] = houseShape(h.id).floors[Wk.floor + 1];
        const landZ = (Wk.z0 + -houseShape(h.id).floors[Wk.floor + 1][1]) / 2;
        const inward = Wk.xc - Wk.sx * ((Wk.x1 - Wk.x0) / 2 + 1.5);
        const start = I.local(Wk.xc, Wk.z1 + 1);
        walker.position.set(start.x, I.groundY + Wk.y0, start.z);
        const up = walk([[Wk.xc, Wk.z1 + 0.5], [Wk.xc, Wk.z0 + 0.2], [Wk.xc, landZ], [inward, landZ], [inward, 0]]);
        const fUp = I.floorAt(walker.position.x, walker.position.y, walker.position.z);
        if (up || fUp !== Wk.floor + 1) stuck.push(`up ${Wk.floor}->${Wk.floor + 1}: ${up ?? `ended on floor ${fUp}`} (${uw})`);
        /* ...to 0.6 past the stair's foot, not 1: in the dojo house the wall
           behind it is 1.6 past, and a REAL kitten (PLAYER_RADIUS 0.75 + the
           0.18 skin) stops 0.93 short of it. At the old fake 0.6 radius the
           point was reachable; at her real size it was a wall doing its job. */
        const down = walk([[inward, landZ], [Wk.xc, landZ], [Wk.xc, Wk.z0 + 0.2], [Wk.xc, Wk.z1 + 0.6]]);
        const fDn = I.floorAt(walker.position.x, walker.position.y, walker.position.z);
        if (down || fDn !== Wk.floor) stuck.push(`down ${Wk.floor + 1}->${Wk.floor}: ${down ?? `ended on floor ${fDn}`}`);
      }
      ok(`${h.name}: a kitten can WALK up every staircase into the room above, and back down, through every wall and rail`, !stuck.length, stuck.join('; '));
      if (was.home === undefined) delete H.store.homes[I.site.id]; else H.store.homes[I.site.id] = was.home;
      H.debugOpen = was.dbg;
      // furniture keeps off the stairs and the hole over them
      const r0 = h.rooms.find((r) => r.floor === 0);
      const r1 = h.rooms.find((r) => r.floor === 1);
      const onWell = (room) => {
        for (let gx = 0; gx < gridOf(room).cols; gx++) for (let gz = 0; gz < gridOf(room).rows; gz++) {
          const x = room.cx - room.w / 2 + gx * 2 + 1, z = room.cz - room.d / 2 + gz * 2 + 1;
          if (x > W.x0 && x < W.x1 && z > W.z0 && z < W.z1) return { gx, gz };
        }
        return null;
      };
      const c0 = r0 && onWell(r0);
      const c1 = r1 && onWell(r1);
      ok(`${h.name}: no furniture can stand on the stairs, or over the hole they come up through`,
        (!c0 || !fits(r0, [], ITEM_BY_ID.tansu, c0.gx, c0.gz)) && (!c1 || !fits(r1, [], ITEM_BY_ID.tansu, c1.gx, c1.gz)) && !!(c0 || c1));
      /* THE DOOR SHOT IS A PANE'S, NOT A KITTEN'S. Richard: "when multiple
         players are in front of a player's house, it does not do the 3D
         camera view ... But, the controls are being overridden as if the
         camera rotated". Two kittens in one pane: one at the door, one just
         behind her — both get the shot (both sticks turn) and so does the
         rig (`doorShotFor`); the moment one of them is inside, nobody does. */
      if (!doorChecked) {
        doorChecked = true;
        const was = { groups: game.groups, players: game.players, home: H.store.homes[I.site.id], dbg: H.debugOpen };
        H.debugOpen = true;
        H.store.homes[I.site.id] = I.home;
        const S = I.shell;
        const atDoor = I.local(0, S.door.z + 4);
        const behind = I.local(3, S.door.z + 22);
        const a = fakePlayer(0, atDoor.x, atDoor.z, I.groundY + S.base);
        const b = fakePlayer(1, behind.x, behind.z, I.groundY + S.base);
        game.players = [a, b];
        game.groups = [[0, 1]];
        const both = !!H._doorShot(a) && !!H._doorShot(b) && !!H.doorShotFor([0, 1]) && H._doorShot(b).yaw === H.doorShotFor([0, 1]).yaw;
        game.groups = [[0], [1]];
        const apart = !!H._doorShot(a) && !H._doorShot(b);
        game.groups = [[0, 1]];
        const inside = I.local(0, 0);
        b.position.set(inside.x, I.groundY + S.floorY[0] + 0.1, inside.z);
        const vetoed = !H._doorShot(a) && !H.doorShotFor([0, 1]);
        ok('two kittens sharing a pane at a front door BOTH get the door shot, and the shared camera gets the same one', both);
        ok('...split into their own panes, only the one at the door does', apart);
        ok("...and somebody inside the house puts everybody's camera back", vetoed);
        Object.assign(game, { groups: was.groups, players: was.players });
        if (was.home === undefined) delete H.store.homes[I.site.id]; else H.store.homes[I.site.id] = was.home;
        H.debugOpen = was.dbg;
      }
    }
    I.setHome(null);
  }

  /* LOCKS. A stranger is pushed out of the bubble; the owner is not. */
  const I0 = H.isles[0];
  const stranger = fakePlayer(1, I0.x + 4, I0.z + 4, I0.groundY + 1);
  const owner = fakePlayer(0, I0.x + 4, I0.z + 4, I0.groundY + 1);
  H.wall(stranger, stranger.position.x, stranger.position.z, null);
  H.wall(owner, owner.position.x, owner.position.z, null);
  ok('a locked island pushes a stranger out to its bubble', Math.hypot(stranger.position.x - I0.x, stranger.position.z - I0.z) >= I0.bubbleRadius());
  ok('...and lets its owner walk in', Math.hypot(owner.position.x - I0.x, owner.position.z - I0.z) < 10);
  ok('...and the refusal says whose island it is', toasts.some(([i, t]) => i === 1 && /Ember's island is locked/.test(t)));
  H.setOpen(p0, H.store.homes.sunrise, true);
  const guest = fakePlayer(1, I0.x + 4, I0.z + 4, I0.groundY + 1);
  H.wall(guest, guest.position.x, guest.position.z, null);
  ok('unlocked, a visitor walks in', Math.hypot(guest.position.x - I0.x, guest.position.z - I0.z) < 10);

  /* THE GRAND GATES, AT BOTH ENDS. "A jukebox and a door at both ends; her
     statue on her island; grand doors with an open/close animation and a
     force field, toggled at the bridge entrance." */
  {
    const B = H.bridges[0];
    const Hs = H.store.homes.sunrise;
    ok('her bridge has a gate, a jukebox and a statue at BOTH ends',
      B.gates?.length === 2 && B.doorSegments().length === 2 && B.jukeboxSpots?.length === 2
      && B.statue.children.length === 1 && B.statue2.children.length === 1);
    const [G0, G1] = B.gates;
    const S2 = B.statue2.children[0].position;
    const gyEnd = I0.island.heightAt(S2.x, S2.z) ?? I0.groundY;
    ok('...and the far end stands on HER island, not out over the sky',
      Math.abs(S2.y - gyEnd) < 0.5 && Math.hypot(G1.cx - B.end.x, G1.cz - B.end.z) < 3,
      `${S2.y.toFixed(2)} vs ${gyEnd.toFixed(2)}`);
    /* "Remove the 'Snake way' statue (the snake head) from her island." */
    const bsrc = readFileSync(new URL('../../src/systems/housing/homebridge.js', import.meta.url), 'utf8');
    ok('there is no snake head at her end of the bridge any more', !/buildSnakeHead\s*[,(}]/.test(bsrc) && !B.headMesh);
    /* FACING. "The boombox and the player's flag face the entrance the player
       walks in from" at the town end; at hers, toward the bridge if that
       faces the camera, else turned round, and "both flags face the same way
       as the statue". A thing's front is (sin θ, cos θ). */
    const front = (o) => ({ x: Math.sin(o.rotation.y), z: Math.cos(o.rotation.y) });
    const camF = { x: Math.sin(-Math.PI / 4), z: Math.cos(-Math.PI / 4) };
    const fT = front(B.statue.children[0]), fJ = front(B.jukebox);
    ok('at the town end, her statue and the boombox face the way she walks in from',
      fT.x * -B.fx + fT.z * -B.fz > 0.999 && fJ.x * -B.fx + fJ.z * -B.fz > 0.999,
      `${(fT.x * -B.fx + fT.z * -B.fz).toFixed(3)} ${(fJ.x * -B.fx + fJ.z * -B.fz).toFixed(3)}`);
    const fI = front(B.statue2.children[0]);
    const flags2 = []; B.endGroup.traverse((o) => { if (o.name === 'banner') flags2.push(o); });
    ok('...and at hers they face the camera, with both flags turned the same way as the statue',
      fI.x * camF.x + fI.z * camF.z >= 0.5 - 1e-6 && flags2.length === 2
      && flags2.every((f) => Math.abs(f.rotation.y - B.statue2.children[0].rotation.y) < 1e-9)
      && Math.abs(front(B.jukebox2).x - fI.x) < 1e-9,
      `dot ${(fI.x * camF.x + fI.z * camF.z).toFixed(3)} flags ${flags2.length}`);
    /* THE BARREL UNDER THE BOOMBOX, at both ends. Richard: "missing or too
       low. It must look right on both the main island and her island." The
       island end was a clone taken while the barrel model loaded, so it kept
       a stand-in for good; and the barrel was a SCALE, right only for the
       model it was measured on. Measured here off the stand-in, which is
       what a clone was stuck with: its top and the boombox's foot. */
    {
      const lid = (jbx) => {
        const barrel = jbx.getObjectByName('barrel');
        const bb = jbx.getObjectByName('boombox');
        jbx.updateMatrixWorld(true);
        const inv = new THREE.Matrix4().copy(jbx.matrixWorld).invert();
        const top = new THREE.Box3().setFromObject(barrel).applyMatrix4(inv).max.y;
        const foot = new THREE.Box3().setFromObject(bb).applyMatrix4(inv).min.y;
        return { top, foot };
      };
      const [l1, l2] = [B.jukebox, B.jukebox2].map(lid);
      ok('both ends have a barrel of their own, as tall as the boombox sits, the boombox on its lid',
        B.jukebox2 !== B.jukebox && B.jukebox2.getObjectByName('barrel') !== B.jukebox.getObjectByName('barrel')
        && [l1, l2].every((l) => Math.abs(l.top - BARREL_H) < 0.02 && Math.abs(l.foot - l.top) < 0.02),
        JSON.stringify([l1, l2]));
      ok('...and neither is a clone of the other', !/=\s*jb\.clone\(/.test(bsrc) && /const jb2 = makeJukebox\(\)/.test(bsrc));
    }
    ok('faceCamera turns a thing round only when it would show the camera its back, and bannerYaw stops a flag going edge-on',
      faceCamera(-Math.PI / 4) === -Math.PI / 4 && Math.abs(faceCamera(Math.PI * 0.75) - Math.PI * 1.75) < 1e-9
      && Math.abs(bannerYaw(-Math.PI / 4 + 1.48) - (-Math.PI / 4 + Math.acos(0.5))) < 1e-9 && bannerYaw(0.1) === 0.1);
    /* "Every owner's statue, in her colour, at the entrance: one each side,
       and a third or fourth next to those." */
    B.setOwners([0, 1, 2].map((i) => ({ name: PLAYER_STYLE[i].name, colour: PLAYER_STYLE[i].colour ?? 0xffffff })));
    const E0 = B.ends[0];
    const sideOf = (o) => Math.sign((o.position.x - E0.at.x) * E0.rx + (o.position.z - E0.at.z) * E0.rz);
    const three = B.statue.children;
    ok('a home of three has three statues at each end, either side of the road, and three statues\' worth of colliders',
      three.length === 3 && B.statue2.children.length === 3 && new Set(three.map(sideOf)).size === 2
      && B.solids.filter((o) => o.kind === 'statue').length === 6 && STATUE_SLOTS.length === 4,
      `${three.length} ${B.statue2.children.length} sides ${three.map(sideOf)}`);
    /* THE PURCHASE SCENE'S STATUE SHOT HOLDS EVERY ONE. Richard: "The statues
       shot in the purchase cutscene must include all co-owners' statues." It
       framed slot 0 alone. Each statue's measured box, all eight corners,
       through the scene's own lens at the start, middle and end of the move,
       for one to four owners — and one owner keeps the 8-away shot. */
    {
      const PS = new PurchaseScene(H);
      const frame = [];
      for (const n of [1, 2, 3, 4]) {
        B.setOwners([0, 1, 2, 3].slice(0, n).map((i) => ({ name: PLAYER_STYLE[i].name, colour: PLAYER_STYLE[i].colour ?? 0xffffff })));
        B.group.updateMatrixWorld(true);
        let worst = 0;
        const ext = { x: 0, top: -9, bot: 9 };
        for (const u of [0, 0.5, 1]) {
          PS._statueCam(B, u);
          PS.camera.updateMatrixWorld(true);
          for (const st of B.statue.children) {
            const bx = new THREE.Box3().setFromObject(st);
            // the TOP HALF: the liked one-statue shot is a close-up with the plinth off the bottom
            for (const cx of [bx.min.x, bx.max.x]) for (const cy of [(bx.min.y + bx.max.y) / 2, bx.max.y]) for (const cz of [bx.min.z, bx.max.z]) {
              const v = new THREE.Vector3(cx, cy, cz).project(PS.camera);
              worst = Math.max(worst, Math.abs(v.x), Math.abs(v.y), v.z > 1 ? 9 : 0);
              ext.x = Math.max(ext.x, Math.abs(v.x)); ext.top = Math.max(ext.top, v.y); ext.bot = Math.min(ext.bot, v.y);
            }
          }
        }
        PS._statueCam(B, 0);
        const S0 = B.statue.children.map((c) => c.getWorldPosition(new THREE.Vector3()));
        const mx = S0.reduce((t, q) => t + q.x, 0) / n;
        const mz = S0.reduce((t, q) => t + q.z, 0) / n;
        frame.push({ n, worst, ext, d: Math.hypot(PS.camera.position.x - mx, PS.camera.position.z - mz) });
      }
      ok('the purchase scene\'s statue shot has the top half of EVERY owner\'s statue in frame, start to end of its move',
        frame.every((f) => f.worst < 0.95), frame.map((f) => `${f.n}: ${f.worst.toFixed(2)} at ${f.d.toFixed(1)} (x ${f.ext.x.toFixed(2)} top ${f.ext.top.toFixed(2)})`).join(' · '));
      ok('...and one owner keeps the shot that was liked, 8 away', Math.abs(frame[0].d - 8) < 1e-6);
      ok('...and the caption counts them', /Statues of/.test(readFileSync(new URL('../../src/systems/housing/purchasescene.js', import.meta.url), 'utf8')));
      B.setOwners([0, 1, 2].map((i) => ({ name: PLAYER_STYLE[i].name, colour: PLAYER_STYLE[i].colour ?? 0xffffff })));
    }
    ok('...and the boombox steps back out of the third one\'s way',
      B.solids.filter((o) => o.kind === 'jukebox').every((J) => B.solids.filter((o) => o.kind === 'statue').every((S) => Math.hypot(J.x - S.x, J.z - S.z) >= J.r + S.r - 1e-6)));
    B.setOwners([{ name: 'Ember', colour: 0xff8a3d }]);
    /* "The players statues and entrance decorations and boom box need to
       have colliders." Stood inside each, she is pushed to its edge. */
    const solidKinds = ['statue', 'jukebox', 'lantern', 'pole', 'torii'];
    const pushed = B.solids.filter((o) => solidKinds.includes(o.kind)).map((o) => {
      const kid = fakePlayer(2, o.x + 0.05, o.z, o.y0 + 1);
      H.wall(kid, kid.position.x, kid.position.z, null);
      return Math.hypot(kid.position.x - o.x, kid.position.z - o.z) >= o.r - 1e-6;
    });
    const kinds = new Set(B.solids.map((o) => o.kind));
    ok('the statues, the boombox, the lanterns, the banner poles and the torii are all solid',
      solidKinds.every((k) => kinds.has(k)) && pushed.length >= 8 && pushed.every(Boolean),
      `${[...kinds]} ${pushed.filter((v) => !v).length} not pushed`);
    ok('...and the ends have their ramps, and the barrier runs along the entrance\'s edges as well as across it',
      B.aprons?.length === 2 && B.barrierSegments().length > B.doorSegments().length);
    const at = (pl, Gt) => { pl.position.set(Gt.cx + Gt.fx * 1.5, Gt.y, Gt.cz + Gt.fz * 1.5); };
    const own = fakePlayer(0);
    at(own, G0);
    /* "When it says 'Close the gates', should say 'Close the gates for visitors'" */
    ok('an owner at the gate is offered it', H._spotFor(own)?.act === 'gates' && /CLOSE THE GATES FOR VISITORS/.test(H.prompt(own, 'E') ?? ''));
    /* THE CALLOUT NEVER THROWS, for an owner or a visitor, at any spot. Its
       words are one object literal, so every entry is evaluated at every spot;
       a `s.door.hs` in one of them threw at Roshi and at every doorless spot
       for a visitor, once per frame, and froze the game (Richard, Oct 2026). */
    {
      const vis = fakePlayer(2), real = H._spotFor;
      const spots = [{ act: 'roshi' }, { act: 'jukebox', k: 0, home: Hs }, { act: 'gates', k: 0, home: Hs },
        ...H.isles.flatMap((I) => (I.home ? I.spots.map((s) => ({ ...s, isle: I, home: I.home })) : []))];
      // a bridge doorway's knock, which this island has no bridge for: the front door's, relabelled
      const fd = spots.find((s) => s.act === 'frontdoor');
      if (fd) spots.push({ ...fd, act: 'portknock' }, { ...fd, act: 'portdoor' });
      const threw = [];
      for (const s of spots) {
        H._spotFor = () => s;
        for (const p of [own, vis]) { try { H.prompt(p, 'E'); } catch (e) { threw.push(`${s.act} (${p === own ? 'owner' : 'visitor'}): ${e.message}`); } }
      }
      H._spotFor = real;
      ok('...and no spot\'s callout throws, for an owner or a visitor — Roshi, the gates, every door and seat',
        threw.length === 0 && spots.some((s) => s.act === 'frontdoor') && spots.some((s) => s.act === 'portknock'),
        threw.length ? threw.slice(0, 4).join(' · ') : `${spots.length} spots, acts ${[...new Set(spots.map((s) => s.act))].join(' ')}`);
    }
    B.update(DOOR_SWING * 2, 0, [false, false]);   // the unlock above has swung them open by now
    const wasLocked = H.locked(Hs);
    H.interact(own);
    /* THE DOORS OPEN FOR AN OWNER; the button moves the hologram. "When an
       owner gets near the entrance of the bridge, the doors animate open for
       them" — so locking with her stood there leaves her end open. */
    const slow = Math.max(DOOR_SWING, GATE.fade) * 2;
    B.update(slow, 0, H._ownersNear(B, Hs, [own]));
    ok('...and pressing it puts the hologram up across BOTH ends, and the doors stay open for the owner standing there',
      !wasLocked && H.locked(Hs) && G0.openK === 1 && G1.openK === 0
      && B.gates.every((Gt) => Gt.field.visible && Gt.sides.every((m) => m.visible)),
      `k ${G0.openK} ${G1.openK}`);
    ok('...and the toast says it is the barrier that moved', toasts.some(([i, t]) => i === 0 && /hologram barrier hums ON/.test(t)));
    own.position.set(G0.cx + G0.fx * 40, G0.y, G0.cz + G0.fz * 40);
    B.update(DOOR_SWING / 2, 0, H._ownersNear(B, Hs, [own]));
    const halfK = B.openK;
    const halfRot = G0.leaves[0].rotation.y;
    B.update(DOOR_SWING, 0, H._ownersNear(B, Hs, [own]));
    ok('...and when she walks away they swing shut, not snap: halfway through the swing they are halfway',
      Math.abs(halfK - 0.5) < 0.01 && Math.abs(halfRot - G0.leaves[0].userData.ry) > 0.1 && B.openK === 0
      && Math.abs(G0.leaves[0].rotation.y - G0.leaves[0].userData.ry) < 1e-9,
      `k ${halfK} rot ${halfRot} ry ${G0.leaves[0].userData.ry} final ${B.openK} ${G0.leaves[0].rotation.y}`);
    const n0 = toasts.length;
    const visitor = fakePlayer(1);
    at(visitor, G1);
    ok('...and they do not open for a visitor who walks up', H._ownersNear(B, Hs, [visitor]).every((v) => !v));
    H.interact(visitor);
    ok('a visitor at the gate is told whose gates they are, and they stay shut',
      H.locked(Hs) && toasts.slice(n0).some(([i, t]) => i === 1 && /only she can open them/.test(t)));
    /* "if a player that is not an owner tries to jump on the bridge while
       'the gates are closed' then they will pass-through it as if it doesn't
       exist". A point on the deck, found from the gate along the road. */
    const P = B.platform;
    let deck = null;
    for (let d = 7; d < 40 && !deck; d += 1) {
      for (const sg of [1, -1]) {
        const x = G0.cx + G0.fx * d * sg, z = G0.cz + G0.fz * d * sg;
        const y = P.yAt(x, z, Infinity);
        if (y != null) { deck = { x, y, z }; break; }
      }
    }
    const jumper = fakePlayer(1, deck?.x, deck?.z, (deck?.y ?? 0) + 1);
    jumper.footing = null;
    const owner2 = fakePlayer(0, deck?.x, deck?.z, (deck?.y ?? 0) + 1);
    const hJ = deck && H.heightAt(deck.x, deck.z, deck.y + 1, jumper);
    const hO = deck && H.heightAt(deck.x, deck.z, deck.y + 1, owner2);
    ok('a visitor jumping onto a locked bridge falls through it, while it stays solid for the owner',
      !!deck && H.ghostFor(jumper, 0) && hO?.platform === P && hJ?.platform !== P,
      `deck ${!!deck} owner ${hO?.platform === P} visitor ${hJ?.platform === P}`);
    ok('...and the deck shows itself as a hologram round her, and not round the owner',
      H._holoPoints(0, [jumper]).length === 1 && H._holoPoints(0, [owner2]).length === 0);
    jumper.footing = P;
    const hOn = deck && H.heightAt(deck.x, deck.z, deck.y + 1, jumper);
    ok('...and a visitor already ON it when it locked keeps her feet, and can walk off',
      hOn?.platform === P && !H.ghostFor(jumper, 0));
    jumper.footing = null;
    at(own, G1);
    H.interact(own);
    B.update(slow, 0, H._ownersNear(B, Hs, [own]));
    ok('...and the owner opens them again from her own end', !H.locked(Hs) && B.openK === 1 && B.gates.every((Gt) => !Gt.field.visible) && !H.ghostFor(jumper, 0));
  }

  /* THE PATH TO THE DOOR. "There was a Cherry Tree infront of the door ...
     we should ensure there is no objects directly in the walking path of the
     front door ... walking paths from the bridge gate to the front of the
     door. The Castle should get red carpet or sakura petals, Dojo house
     should get Flagstone path or Raked Gravel Path, and Small Japanese house
     should get Stepping Stone or Boardwalk." */
  {
    const Ip = H.isles[3];
    const envP = () => ({ r: Ip.radius, landing: { x: 0, z: Ip.radius - 4 } });
    for (const house of ['minka', 'dojohouse', 'castle']) {
      const Hp = newHome(Ip.site.id, house, ['Ember']);
      const env = envP();
      const n = layDoorPath(Hp, env);
      const ids = new Set((Hp.outdoor ?? []).map((q) => q.id));
      const W = doorWalk(Hp, env);
      ok(`a new ${house} comes with a path from its door to the bridge, in its own style (${doorPathId(Hp)})`,
        n >= 2 && ids.size === 1 && DOOR_PATHS[house].includes([...ids][0]) && Hp.outdoor.every((q) => q.free)
        && !!W && W.len > 8, `${n} pieces of ${[...ids]}, ${W?.len?.toFixed(1)} long`);
    }
    // the walk as a box with no pad: nothing but path may have its middle on it
    const onWalk = PRESETS.map((PR) => {
      const Hp = newHome(Ip.site.id, 'minka', ['Ember']);
      const env = envP();
      layDoorPath(Hp, env);
      autoLayout(Hp, PR, Ip, env);
      const W = doorWalk(Hp, env);
      const half = 1.5;
      return Hp.outdoor.filter((q) => !ITEM_BY_ID[q.id]?.path).filter((q) => {
        const dx = q.x - W.a.x, dz = q.z - W.a.z;
        const along = dx * Math.sin(W.rot) + dz * Math.cos(W.rot);
        const across = dx * Math.cos(W.rot) - dz * Math.sin(W.rot);
        return along > 0 && along < W.len && Math.abs(across) < half;
      }).map((q) => `${PR.id}:${q.id}`);
    }).flat();
    ok('...and nothing a preset brings stands on that walk', onWalk.length === 0, onWalk.join(', '));
    ok('...and doorWalkBox is the walk, padded', !!doorWalkBox(newHome(Ip.site.id, 'minka', ['Ember']), envP()));
  }

  /* "The yellow selection circle below big items like the table is not
     visible, it should scale with the size of the item and its collision
     area ... unless it is a small item where it can stay its current size." */
  {
    const big = ringR(ITEM_BY_ID.kotatsu), long = ringR(ITEM_BY_ID.futon), small = ringR(ITEM_BY_ID.katana);
    ok('the selection ring is past the edge of a table and a futon, and a small thing keeps the old ring',
      big > 1.8 && long > 2.7 && small === RING_R && ringR(ITEM_BY_ID.kotatsu, { s: 1.5 }) > big,
      `table ${big.toFixed(2)} futon ${long.toFixed(2)} katana ${small.toFixed(2)}`);
    const bsrc2 = readFileSync(new URL('../../src/systems/housing/build.js', import.meta.url), 'utf8');
    ok('...both while she places one and while she picks one', /top\.kind === 'room' \? ringR\(/.test(bsrc2) && /this\.pickRingR\(H, top\) \/ RING_R/.test(bsrc2));
  }

  /* THE CASTLE: pooled, and every owner refunded. */
  const castle = priceOf(HOUSE_BY_ID.castle.mult, 650);
  const share = Math.ceil(castle / 2 / 10) * 10;
  p1.score = share; p2.score = share;
  game.players = [p0, p1, p2];
  const r2 = H.buy('moonwater', 'castle', [{ p: p1, share }, { p: p2, share }]);
  H.purchase.finish();
  ok('two sisters share a castle, each paying half', r2.ok && p1.score === 0 && p2.score === 0, r2.why);
  ok('...and both are its owners', H.store.homes.moonwater?.owners.join() === 'Frost,Storm');
  /* "move the castle a bit forward so there is more room to build the Koi
     pond": a new castle stands HOME_FORWARD toward its bridge. */
  ok('...and a new castle stands forward, toward its bridge, leaving the back a garden',
    H.store.homes.moonwater?.at?.z === HOME_FORWARD.castle && HOME_FORWARD.castle > 0, JSON.stringify(H.store.homes.moonwater?.at));
  game.players = [p0, p1];
  H.sell('moonwater');
  ok('selling pays 75% back to the owner who is here', p1.score === Math.round(share * HOME_SELL), p1.score);
  ok('...and banks the absent owner\'s 75% under her name', H.store.bank.Storm === Math.round(share * HOME_SELL), H.store.bank.Storm);
  game.players = [p0, p1, p2];
  H._payBank(game.players);
  ok('...which she is paid the moment she is in a game', p2.score === Math.round(share * HOME_SELL) && !H.store.bank.Storm);

  /* THE STORE survives a round trip and a bad file. */
  const S = emptyStore();
  S.homes.sunrise = newHome('sunrise', 'minka', ['Ember']);
  saveStore(S);
  ok('the homes store round-trips through localStorage', loadStore().homes.sunrise?.owners[0] === 'Ember');
  localStorage.removeItem(HOME_KEY);

  /* ONE SAVED GAME'S HOMES ARE THAT GAME'S. Richard: "Purchased islands and
     furniture ... should be linked to the save file of the game and not be
     shared between different save files or new games" — and the same for a
     boon earned at home. Driven the way Game does it: restart mints a new
     session and calls reset; a load sets the session back and restores. */
  {
    H.boons.grant(p0, 'onsen');
    const snapA = H.snapshot();
    const homesA = Object.keys(snapA.homes).sort().join();
    game.sessionId = 'check-B';
    H.reset();
    ok('a NEW game owns no islands, and her home boon is not waiting in it',
      !Object.keys(H.store.homes).length && !H.boons.banked('Ember') && !H.homeOf(p0) && H.isles.every((I) => !I.home));
    ok('...and the islands are back in the clouds until ITS ending', !H.isUp() || world.snakeOpen);
    H.debugOpen = true;
    const r = H.buy('cloudpeak', 'minka', [{ p: p0, share: 0 }]);
    H.purchase.finish();
    ok('...where she can buy a different one', r.ok && !!H.store.homes.cloudpeak && !H.store.homes.sunrise);
    game.sessionId = 'check-A';
    H.reset();
    H.restore(snapA);
    ok('LOADING the first game brings back ITS homes and its boon — not the second game\'s',
      Object.keys(H.store.homes).sort().join() === homesA && !H.store.homes.cloudpeak && !!H.boons.banked('Ember')?.onsen);
    game.sessionId = 'check-B';
    H.reset();
    H.restore(null);
    ok('...and a game whose save predates its last purchase still has it, off its own row',
      !!H.store.homes.cloudpeak && !H.store.homes.sunrise);
    game.sessionId = 'check-A';
    H.reset();
    H.restore(snapA);
    H.debugOpen = true;
    delete H.store.boons.Ember;
    // A pretend browser with too many games in it: the oldest rows go, never this one.
    const mem = new Map();
    const fake = { get length() { return mem.size; }, key: (k) => [...mem.keys()][k] ?? null,
      getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
    for (let k = 0; k < HOME_ROWS_KEPT + 4; k++) fake.setItem(homeKey(`old${k}`), JSON.stringify({ at: k + 1 }));
    fake.setItem(homeKey('now'), JSON.stringify({ at: 0 }));
    pruneRows(fake, homeKey('now'));
    ok(`the browser keeps the newest ${HOME_ROWS_KEPT} games' rows, and always the one being played`,
      mem.size === HOME_ROWS_KEPT && mem.has(homeKey('now')) && mem.has(homeKey(`old${HOME_ROWS_KEPT + 3}`)) && !mem.has(homeKey('old0')));
  }
  ok('...and a garbage file normalises to nothing rather than throwing', normalise('nope')?.homes != null && Object.keys(normalise({ homes: 5 }).homes).length === 0);

  /* CARE LADDER (pure). */
  const now = Date.now();
  ok('care: nobody visited is level 0', careLevel([], now) === 0);
  ok('...one visit is 1, two the same day is 2', careLevel([now - 1000], now) === 1 && careLevel([now - 2000, now - 1000], now) === 2);
  ok('...two a day apart is 3, three spaced is 4 (the sweep)', careLevel([now - 2 * DAY, now - 1000], now) === 3
    && careLevel([now - 4 * DAY, now - 2 * DAY, now - 1000], now) === 4 && careBuff(4).sweep);
  ok('...and a visit older than a week counts for nothing — hungry, never gone', careLevel([now - 8 * DAY], now) === 0);
  ok('bamboo grows on the wall clock and stops at the top', stalksAt({ cut: now - BAMBOO_GROW * 3 - 1 }, now) === 3
    && stalksAt({ cut: now - BAMBOO_GROW * 99 }, now) === BAMBOO_MAX);

  /* FURNISHING. */
  const living = HOUSE_BY_ID.minka.rooms[0];
  const { cols, rows } = gridOf(living);
  ok('the tatami grid refuses a thing off its edge and a thing on top of another',
    !fits(living, [], ITEM_BY_ID.kotatsu, cols - 1, 0) && !fits(living, [{ id: 'futon', gx: 0, gz: 0, rot: 0 }], ITEM_BY_ID.tansu, 0, 1)
    && fits(living, [], ITEM_BY_ID.tansu, 0, rows - 1));
  for (const P of PRESETS) {
    const Hm = autoLayout(newHome('emberleaf', 'dojohouse', ['Ember']), P, H.isles[3]);
    const placed = Object.values(Hm.rooms).reduce((a, R) => a + (R.items?.length ?? 0), 0);
    const yard = Hm.outdoor.length;
    ok(`the ${P.name} preset fits a dojo house completely`, placed === P.room.length && yard === P.yard.length, `${placed}/${P.room.length} ${yard}/${P.yard.length}`);
  }

  /* A ROOM TYPE CHANGE SELLS THE FURNITURE BACK. Richard: buying a holodeck
     "automatically happens without a confirmation screen" and the furniture
     was simply gone. */
  {
    const Hm = newHome('sunrise', 'minka', ['Ember']);
    const R = { type: 'living', items: [{ id: 'kotatsu', gx: 0, gz: 0, rot: 0 }, { id: 'futon', gx: 3, gz: 0, rot: 0 }] };
    Hm.rooms = { [living.id]: R };
    Hm.paid = { Ember: 9000 };
    const q = fakePlayer(0);
    q.score = 0;
    const refund = roomRefund(H, R);
    const want = Math.round(H.itemPrice('kotatsu') * ITEM_SELL) + Math.round(H.itemPrice('futon') * ITEM_SELL);
    const r = changeRoomType(H, q, Hm, R, 'kendo', Math.min(refund, H.roomPrice('kendo')));
    ok('changing a room\'s type pays its furniture back at the sell price, first', refund === want && r.ok && R.items.length === 0 && R.type === 'kendo',
      `${refund} vs ${want}, ${r.why ?? ''}`);
    ok('...and the refund comes off what she is recorded as having put in', Hm.paid.Ember === 9000 - refund + Math.min(refund, H.roomPrice('kendo')), Hm.paid.Ember);
    const poor = fakePlayer(1);
    const R2 = { type: 'living', items: [] };
    ok('...and a kitten who cannot pay is refused with how much she needs', !changeRoomType(H, poor, Hm, R2, 'holodeck', 500).ok && R2.type === 'living');
    /* "Selling a holodeck, or converting it to a tatami room should refund
       money to the player, same for the kendo dojo." The dojo just bought
       above is turned back into tatami: she gets the dojo's price back at the
       furniture's rate, and only once — the tatami room it becomes is worth
       nothing more. A holodeck's free kit is not paid for twice either. */
    {
      const paidK = R.typePaid;
      const before = q.score;
      const back = roomTypeRefund(H, R);
      const r3 = changeRoomType(H, q, Hm, R, 'living', 0);
      ok('turning a kendo dojo back into tatami pays the dojo back, at the sell price',
        paidK > 0 && back === Math.round(paidK * ITEM_SELL) && r3.ok && q.score - before === back && roomTypeRefund(H, R) === 0 && R.typePaid === undefined,
        `paid ${paidK}, back ${back}, got ${q.score - before}`);
      const rich = { ...fakePlayer(2), score: 1e6 };
      const R4 = { type: 'living', items: [] };
      changeRoomType(H, rich, Hm, R4, 'holodeck', H.roomPrice('holodeck'), living);
      ok('...and so does a holodeck, and its free kit adds nothing to it',
        R4.items.length >= 4 && roomRefund(H, R4) === Math.round(H.roomPrice('holodeck') * ITEM_SELL), roomRefund(H, R4));
      ok('...and an old save\'s dojo, with no price written down, is refunded at today\'s',
        roomTypeRefund(H, { type: 'kendo', items: [] }) === Math.round(H.roomPrice('kendo') * ITEM_SELL));
      const hsrc5 = readFileSync(new URL('../../src/systems/housing/housing.js', import.meta.url), 'utf8');
      ok('...and selling a whole extra house pays its holodeck and dojo back too', /n \+= roomTypeRefund\(this, R\);/.test(hsrc5));
    }
    const src = readFileSync(new URL('../../src/systems/housing/cards.js', import.meta.url), 'utf8');
    ok('...and the card asks before it does it, NO first', /_v_roomtype[\s\S]{0,1500}title: 'NO, KEEP THE ROOM AS IT IS'[\s\S]{0,200}title: `YES, MAKE IT A/.test(src)
      && !/MAKE IT A \$\{T\.name\}`[^\n]*\n[^\n]*\n[^\n]*\n[^\n]*this\.H\.spend/.test(src));
    ok('"Ember\'S" is "EMBER\'S" — a possessive is all capitals', possessive('Ember') === "EMBER'S" && possessive(['Ember', 'Frost']) === "EMBER & FROST'S"
      && !/\$\{who\}'S/.test(src));
    addOutdoor(Hm, 'koipond', 0, -30, 0);
    Hm.rooms[living.id].wall = [{ id: 'window', side: 2, k: 0 }];
    ok('the shop says how many of each thing she owns, 0 included — yard and walls too', ownedCount(Hm, 'koipond') === 1 && ownedCount(Hm, 'futon') === 0
      && ownedCount(Hm, 'window') === 1
      && /YOU HAVE \$\{ownedCount\(H, it\.id\)\}/.test(src));
    ok('the home card has no music row and no file rows (the boombox and the debug panel have them)',
      !/PICK THE BRIDGE MUSIC|SAVE HOMES TO A FILE|LOAD HOMES FROM A FILE/.test(src));
    const msrc0 = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
    ok('...and the debug panel does, both asking first', /row\('HousingExport'/.test(msrc0) && /row\('HousingImport'/.test(msrc0)
      && /_debugHousingImport\(\) \{[\s\S]{0,300}confirm\.ask\(/.test(msrc0));
  }

  /* THE YARD IS FREE NOW. Richard: "rather than having predetermined
     locations for all the plots". A home saved with the old plots must come
     back with its things where they stood, and the rules that replaced the
     plots must actually refuse what they say they refuse. */
  {
    const old = migrateYard({ ...newHome('sunrise', 'minka', ['Ember']), yard: { p2: 'koipond', p4: 'pen' } });
    const pond = old.outdoor.find((q) => q.id === 'koipond');
    ok('an old plot home comes back with its pond where plot 2 stood, with a uid',
      !old.yard && old.outdoor.length === 2 && Math.abs(pond.x - Math.sin(1.75) * 31) < 0.01 && Math.abs(pond.z - Math.cos(1.75) * 31) < 0.01
      && old.outdoor.every((q) => Number.isFinite(q.uid)) && new Set(old.outdoor.map((q) => q.uid)).size === 2);
    const Hm = newHome('sunrise', 'minka', ['Ember']);
    const it = ITEM_BY_ID.onsen;
    const hr = houseRadius('minka');
    const why = [
      yardWhy(Hm, it, 0, -48), yardWhy(Hm, it, 0, -(hr + 1)), yardWhy(Hm, it, 0, 30, -1, { r: 50, landing: { x: 0, z: 30 } }), null,
    ];
    addOutdoor(Hm, 'koipond', -25, -20, 0);
    why[3] = yardWhy(Hm, it, -25, -14);
    ok('the yard refuses the rim, the house, the bridge landing and another thing — each with its reason',
      /edge/.test(why[0]) && /HOUSE/.test(why[1]) && /landing/.test(why[2]) && /overlaps the KOI POND/.test(why[3]), why.join(' | '));
    /* Richard: "remove the restriction that doesn't let players build in front
       of their house because of the path ... the 'No build buffer zone'
       around houses ... should be smaller." The old path strip refused z=20
       in front of the door; a lantern now stands a step off the wall. */
    const F = houseFoot('minka'), lan = ITEM_BY_ID.lantern;
    ok('the yard takes the spot in front of the house that the old path strip refused', yardWhy(Hm, it, 0, 20) === null, yardWhy(Hm, it, 0, 20));
    ok('...and a small thing a step off the house wall', yardWhy(Hm, lan, F.x1 + yardR(lan) + 0.6, 0) === null, yardWhy(Hm, lan, F.x1 + yardR(lan) + 0.6, 0));
    ok('...and takes a clear spot', yardWhy(Hm, it, 25, -20) === null);
    const spot = firstYardSpot(Hm, ITEM_BY_ID.treehouse, 50);
    ok('...and finds room for the treehouse on an island with a pond on it', !!spot && yardWhy(Hm, ITEM_BY_ID.treehouse, spot.x, spot.z) === null);
  }

  /* MORE HOUSES, BRIDGES, PATHS, WINDOWS. Richard: "Each island will come with
     a free (for the first one built), smaller version house of the one they
     bought"; bridges "should work on the 1st, 2nd, or 3rd floor"; "If a
     bridge is on the 1st floor, it should prevent building any outdoor
     objects on it but if the objects fit under the bridge, then they can
     stay"; paths "can be narrow or wide". */
  {
    const Hx = newHome('sunrise', 'minka', ['Ember']);
    ok('a SMALL HOUSE island comes with a TINY HOUSE, and a DOJO HOUSE island with a SMALL HOUSE',
      FREE_ANNEX.minka === 'tiny' && FREE_ANNEX.dojohouse === 'minka' && FREE_ANNEX.castle === 'dojohouse' && HOUSE_BY_ID.tiny?.floors === 1);
    ok('a second house may not stand on the first, and may stand beside it',
      /SMALL HOUSE/.test(houseWhy(Hx, { hk: null, house: 'minka', x: 8, z: 0, rot: 0 }, 50) ?? '') && houseWhy(Hx, { hk: null, house: 'minka', x: 24, z: 0, rot: 0 }, 50) === null);
    Hx.annex = [{ uid: 1, house: 'minka', x: 24, z: 0, rot: 0, paid: 0, free: true }];
    const rs = homeRooms(Hx);
    ok('the extra house\'s rooms are rooms of the home, named for their house and keyed to it',
      rs.some((r) => r.hk === 'a1' && r.id.startsWith('a1_') && /SMALL HOUSE/.test(r.name)) && rs.filter((r) => r.hk === 'main').length === HOUSE_BY_ID.minka.rooms.length);
    const Lk = { a: { hk: 'main', floor: 0, side: 1, at: 0 }, b: { hk: 'a1', floor: 0, side: 3, at: 0 }, style: 'plank' };
    ok('a bridge between two doors that face each other can be built',
      linkWhy(Hx, Lk, { r: 50 }) === null, linkWhy(Hx, Lk, { r: 50 }));
    ok('...but not from a house to itself, nor from doors facing away',
      !!linkWhy(Hx, { ...Lk, b: { hk: 'main', floor: 0, side: 3, at: 0 } }, { r: 50 }) && !!linkWhy(Hx, { ...Lk, a: { hk: 'main', floor: 0, side: 3, at: 0 } }, { r: 50 }));
    ok('...nor onto a floor the house does not have', !!linkWhy(Hx, { ...Lk, b: { hk: 'a1', floor: 2, side: 3, at: 0 } }, { r: 50 }));
    addOutdoor(Hx, 'lantern', 12, 0, 0);
    addOutdoor(Hx, 'path_stone', 12, 3, 0);
    const blk = linkBlockers(Hx, Lk, { r: 50 });
    ok('a lantern taller than a ground-floor bridge is in its way; a path under it is not',
      blk.length === 1 && Hx.outdoor[blk[0]].id === 'lantern', JSON.stringify(blk));
    Hx.links = [{ uid: 9, ...Lk, paid: 100 }];
    ok('...and once it is built, a tall thing cannot go under it',
      !!yardWhy(Hx, ITEM_BY_ID.lantern, 12, -0.5, -1, 50), yardWhy(Hx, ITEM_BY_ID.lantern, 12, -0.5, -1, 50));
    addOutdoor(Hx, 'path_wood', -20, -20, 0);
    addOutdoor(Hx, 'koipond', 20, -25, 0);
    ok('two paths may cross; a path still may not sit on a pond',
      yardWhy(Hx, ITEM_BY_ID.path_carpet, -20, -20, -1, { r: 50, rot: Math.PI / 2 }) === null && !!yardWhy(Hx, ITEM_BY_ID.path_carpet, 20, -25, -1, { r: 50 }),
      yardWhy(Hx, ITEM_BY_ID.path_carpet, -20, -20, -1, { r: 50, rot: Math.PI / 2 }));
    ok('every path is a narrow or wide strip, and the fancy ones are there',
      ['path_carpet', 'path_tiki', 'path_lantern'].every((id) => ITEM_BY_ID[id]?.path) && Math.min(...ITEMS_PATHS().map((it) => it.pw)) < 2.5 && Math.max(...ITEMS_PATHS().map((it) => it.pw)) > 4);
    const plain = buildHouseShell('minka').walls.length, cut = buildHouseShell('minka', [{ floor: 0, side: 1, at: 0, w: 2.6, sill: 0, h: 3.1 }]).walls.length;
    ok('a bridge door cuts the wall\'s collider in two, so she can walk through it', cut > plain, `${plain} -> ${cut}`);
    /* "avoid z-fighting at all costs in all housing related things (roof,
       doors, windows, ceiling, etc.), and double check it when the house is
       modified". Every house, with a window in every outside wall of every
       floor and a bridge door beside it — the shapes a modified house has —
       and no two same-facing faces in one plane. The only faces let off are
       the undersides of things standing ON a floor, which no camera is ever
       beneath. */
    {
      const bad = [];
      for (const h of HOUSES) {
        const op = [];
        for (let f = 0; f < h.floors; f++) for (let s = 0; s < 4; s++) {
          if (f === 0 && s === 0) continue;   // the front door's wall
          op.push({ floor: f, side: s, at: -1.4, ...WINDOW });
          op.push({ floor: f, side: s, at: 2.2, w: 2.6, sill: 0, h: PORT_H });
        }
        const S = buildHouseShell(h.id, op);
        const all = [...S.floors.flat(), ...S.roof, ...S.tint, ...S.accent.flat(), ...(S.ridge ?? []).flat()];
        const lv = [0, ...S.floorY];
        const f = zFights(all, (x) => x.axis === 'y' && x.side === '-' && lv.some((l) => Math.abs(l - x.plane) < 1e-3));
        if (f.length) bad.push(`${h.id}: ${f.length}, e.g. ${JSON.stringify(f[0])}`);
      }
      ok('no house has two faces fighting in one plane — windows, doors, frames, stairs, roof', !bad.length, bad.join('; '));
      const isrc = readFileSync(new URL('../../src/systems/housing/homeisle.js', import.meta.url), 'utf8');
      const msrc = readFileSync(new URL('../../src/systems/housing/models.js', import.meta.url), 'utf8');
      ok('...and shoji that meet run in two grooves, the window\'s inside the wall',
        PANEL_GAP >= 0.04 && /m\.position\.z = sgn \* PANEL_GAP;/.test(isrc) && /m\.position\.set\(sgn \* w \/ 4, 0, sgn \* PANEL_GAP\)/.test(msrc)
        && /P\.group\.position\.z = -WINDOW_IN;/.test(isrc) && WINDOW_IN === 0.22);
      /* "Shoji in furniture view should be the same model as the actual shoji
         being placed on the walls." The shop's window holds the same shoji
         model, at the wall window's size. */
      const shop = [];
      drawItem('window', 2).traverse((o) => { if (o.userData.modelId) shop.push(o.userData.modelId); });
      ok('...and the shop\'s window is the wall\'s: the same shoji pair, the same model',
        shop.length === 2 && shop.every((id) => id === 'props/shoji-door') && /const P = shojiPair\(WINDOW\.w, WINDOW\.h, this\.wallMat\);/.test(isrc), shop.join(','));
    }
    const Hw = newHome('sunrise', 'minka', ['Ember']);
    defaultWindows(Hw);
    const wins = Object.values(Hw.rooms).flatMap((R) => R.wall ?? []).filter((q) => q.id === 'window');
    ok('a new house comes with windows, free, one to an outside wall', wins.length >= 2 && wins.every((q) => q.free));
    const hsrc2 = readFileSync(new URL('../../src/systems/housing/homeisle.js', import.meta.url), 'utf8');
    ok('only the first house carries the name board (the front-door camera follows it)', /hs\.hk === 'main'/.test(hsrc2) || /s\.hk === 'main'/.test(hsrc2));
    /* THE WINDOW: "Looking out the window should be an option when
       interacting with the window, not every time you open it ... the player
       fade away as the camera gets near to her ... more of a 'first person'
       view". The camera is aimed OUT of the wall (its own turn, not the
       island's middle) and stands LOOK_SHOT.back inside the frame, in front
       of her, so she is behind the lens. */
    {
      const toasts = [];
      const A = new HomeActivities({ game: { toast: (m) => toasts.push(m) } });
      const kit = { index: 0, name: 'Ember', position: new THREE.Vector3(), velocity: new THREE.Vector3(), facing: 0 };
      const face = 0.6;   // the window's +z into the room
      const spot = { act: 'look', x: 3 + Math.sin(face) * 1.2, z: 4 + Math.cos(face) * 1.2, y: 0, face, wx: 3, wz: 4, isle: { x: 100, z: 100 } };
      A.start(kit, spot);
      const F = A.cameraFocus(kit);
      const out = { x: -Math.sin(face), z: -Math.cos(face) };
      // the camera, exactly as the rig places it: centre + (sin yaw·cos p, sin p, cos yaw·cos p)·dist
      const cam = F && {
        x: F.centre.x + Math.sin(F.yaw) * F.dist * Math.cos(F.pitch),
        y: F.centre.y + Math.sin(F.pitch) * F.dist,
        z: F.centre.z + Math.cos(F.yaw) * F.dist * Math.cos(F.pitch),
      };
      const inFrom = cam && ((3 - cam.x) * out.x + (4 - cam.z) * out.z);   // how far inside the frame
      const herAhead = cam && ((kit.position.x - cam.x) * out.x + (kit.position.z - cam.z) * out.z);
      ok('a window spot starts a LOOK hold, and she faces out of the wall',
        A.held.get(0)?.act === 'look' && Math.abs(Math.atan2(out.x, out.z) - kit.facing) < 1e-6);
      ok('...and the camera is first person: just inside the frame, at the middle of the opening, with her BEHIND the lens',
        !!F && Math.abs(inFrom - LOOK_SHOT.back) < 1e-6 && Math.abs(cam.y - LOOK_SHOT.eye) < 1e-6
        && herAhead < 0 && F.exact && F.fadeHer && LOOK_SHOT.eye > 1.0 && LOOK_SHOT.eye < 2.6,
        `${inFrom?.toFixed(2)} in, ${cam?.y.toFixed(2)} up, her ${herAhead?.toFixed(2)}`);
      const L = lookShot(spot, out);
      ok('...and lookShot\'s eye is where the rig really puts the lens', Math.hypot(L.eye.x - cam.x, L.eye.y - cam.y, L.eye.z - cam.z) < 1e-6);
      ok('...and she fades on the way: whole at LOOK_FADE.far, gone by near, and the lens ends inside near of her chest',
        LOOK_FADE.far > LOOK_FADE.near && Math.hypot(kit.position.x - cam.x, 1.2 - cam.y, kit.position.z - cam.z) <= LOOK_FADE.near,
        Math.hypot(kit.position.x - cam.x, 1.2 - cam.y, kit.position.z - cam.z).toFixed(2));
      const psrc = readFileSync(new URL('../../src/entities/player.js', import.meta.url), 'utf8');
      ok('...by alpha AND alphaTest, so it is a fade and not a pop at 0.35, and the split screen does not push the lens back through the wall',
        psrc.includes('mat.alphaTest = this._alphaTest0 * Math.max(0.04, 1 - lf)') && psrc.includes('this.focus?.exact ?'));
      const hsrc3 = readFileSync(new URL('../../src/systems/housing/housing.js', import.meta.url), 'utf8');
      const csrc3 = readFileSync(new URL('../../src/systems/housing/cards.js', import.meta.url), 'utf8');
      const v = csrc3.slice(csrc3.indexOf('_v_window('), csrc3.indexOf('_v_window(') + 1600);
      ok('...and the window\'s INTERACT asks first: no, look out, open or shut, and "no" is first',
        hsrc3.includes("C.open(p.index, 'window', { spot: s })")
        && v.indexOf("'NO, LEAVE IT'") > 0 && v.indexOf("'NO, LEAVE IT'") < v.indexOf("'LOOK OUT OF THE WINDOW'")
        && v.includes("'SHUT THE WINDOW' : 'OPEN THE WINDOW'") && !v.includes('primary'));
      /* HER OWN PANE. Richard, Oct 2026: "A player looking out of a window
         gets her own split-screen pane if she is sharing one." The shot is
         first person through the glass; a sister sharing the pane was taken
         through it with her. A sister a step away, through the real
         clustering, with the flag main.js hands it. */
      const msrc = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
      const near = [{ x: 0, z: 0 }, { x: 2, z: 0 }];
      const apart = clusterPlayers({ pts: near, solo: [A.lookingOut(kit), A.lookingOut({ index: 1 })], mergeIn: MERGE_IN, mergeOut: MERGE_OUT });
      const together = clusterPlayers({ pts: near, solo: [false, false], mergeIn: MERGE_IN, mergeOut: MERGE_OUT });
      ok('looking out of a window, she gets a pane of her own, and her sister a step away keeps hers',
        A.lookingOut(kit) && !A.lookingOut({ index: 1 }) && apart.groups.length === 2 && together.groups.length === 1
        && /solo: this\.players\.map\([\s\S]{0,1600}this\.housing\?\.activities\?\.lookingOut\?\.\(p\)[\s\S]{0,600}this\.housing\?\.slides\?\.riding\?\.\(p\)\)/.test(msrc));
    }
  }

  /* BUILD MODE: what the ghost says is what gets written. */
  {
    const Hm = newHome('sunrise', 'minka', ['Ember']);
    const room = HOUSE_BY_ID.minka.rooms[0];
    Hm.rooms = { [room.id]: { type: 'living', items: [] } };
    const t1 = { kind: 'room', room: room.id, id: 'kotatsu', sel: -1, gx: 0, gz: 0, rot: 0 };
    ok('build: a clear cell is a yes, and putting it there writes it', buildWhy(Hm, t1) === null
      && commitBuild(Hm, t1).rooms[room.id].items.length === 1);
    ok('...the same cell again is a no, with a reason', /fit/.test(buildWhy(Hm, { ...t1 }) ?? ''));
    ok('...but moving the one already there onto its own cell is fine', buildWhy(Hm, { ...t1, sel: 0 }) === null);
    const slots = wallSlots('minka', room);
    const S = houseShape('minka');
    const [hw, hd] = S.floors[room.floor];
    ok('wall spans are all on the OUTER wall, and none of them is the front door',
      slots.length > 0 && slots.every((s) => Math.abs(Math.abs(s.x) - (hw - 0.22)) < 0.01 || Math.abs(Math.abs(s.z) - (hd - 0.22)) < 0.01)
      && !slots.some((s) => s.side === 0 && room.floor === 0 && Math.abs(s.x) < 2.4), slots.length);
    const w1 = { kind: 'wall', room: room.id, id: 'window', sel: -1, side: slots[0].side, k: slots[0].k };
    commitBuild(Hm, w1);
    ok('...a window takes a span, and a second thing on that span is refused', /hangs/.test(buildWhy(Hm, { ...w1, id: 'scroll' }) ?? ''));
    const y1 = { kind: 'yard', id: 'cherry', sel: -1, x: 20, z: -20, rot: 0 };
    commitBuild(Hm, y1);
    commitBuild(Hm, { ...y1, x: -20 });
    ok('...a yard thing gets its own uid, so a moved pond keeps its fish', Hm.outdoor.length === 2 && Hm.outdoor[0].uid !== Hm.outdoor[1].uid);
    commitBuild(Hm, { ...y1, sel: 0, x: 22, z: -24, rot: Math.PI / 4 });
    ok('...moving it moves it and keeps the uid', Hm.outdoor[0].x === 22 && Hm.outdoor[0].z === -24 && Hm.outdoor[0].uid === 1);
    const L = pickList(Hm, 'yard');
    ok('the selector hops to the thing the stick points at', stepToward(L, L[0], -1, 0) === 1 && stepToward(L, L[0], 1, 0) === -1);
    ok('...and selling takes exactly that one out', removeBuilt(Hm, 'yard', null, 0)?.uid === 1 && Hm.outdoor.length === 1 && Hm.outdoor[0].uid === 2);
    /* "Can't sell furniture as the up and down buttons are overridden by the
       placement controls." SELL is its own button in build mode now, and the
       key legend says so. */
    const bsrc = readFileSync(new URL('../../src/systems/housing/build.js', import.meta.url), 'utf8');
    ok('SELL is a button in build mode (SPRINT), not a row the stick cannot reach',
      /pressed\('sprint'\)\) \{ pad\.consume\?\.\('sprint'\); C\.askSell/.test(bsrc) && BUILD_KEYS.some(([k, w]) => k === 'SPRINT' && w === 'sell'));
    const csrc = readFileSync(new URL('../../src/systems/housing/cards.js', import.meta.url), 'utf8');
    ok('...and selling asks first, NO on top', /_v_sellitem[\s\S]{0,900}title: `NO, KEEP THE[\s\S]{0,200}title: (?:it\?\.holo \? `YES, TAKE THE \$\{it\.name\} OUT` : )?`YES, SELL IT FOR/.test(csrc));
    /* "rotation of walking paths should be in 15 degree increments ... the
       RIDE button toggles between 15, 30, and 45 degrees ... default should be
       45 degrees except for walking paths which is 15". Pressed, not read. */
    {
      const B = H.builder, deg = (r) => Math.round(r * 180 / Math.PI);
      const toasts = [];
      const keepToast = H.game.toast;
      H.game.toast = (m, k) => toasts.push(m);
      const pth = { kind: 'yard', id: 'path_stone', sel: -1, x: 0, z: 0, rot: 0 };
      const lan = { kind: 'yard', id: 'lantern', sel: -1, x: 0, z: 0, rot: 0 };
      const hou = { kind: 'house', id: 'minka', sel: -1, x: 0, z: 0, rot: 0 };
      B.rotate(pth); B.rotate(lan); B.rotate(hou);
      const first = [deg(pth.rot), deg(lan.rot), deg(hou.rot)];
      B.turnStep(0, lan);                 // 45 -> 15
      B.rotate(lan);                      // 45 -> 60
      B.turnStep(0, lan); B.rotate(lan);  // 15 -> 30: 60 -> 90
      B.turnStep(0, pth);                 // 15 -> 30
      B.rotate(pth);                      // 15 -> 30
      const room = { kind: 'room', id: 'kotatsu', sel: -1, gx: 0, gz: 0, rot: 0 };
      const nT = toasts.length;
      B.turnStep(0, room);
      ok('ATTACK turns a path 15° and everything else 45° (a house too); RIDE steps 15 → 30 → 45, each from the angle it is at',
        first.join() === '15,45,45' && deg(lan.rot) === 90 && lan.rotStep === 30 && pth.rotStep === 30 && deg(pth.rot) === 30,
        `first ${first}, lantern ${deg(lan.rot)}° at ${lan.rotStep}, path ${deg(pth.rot)}° at ${pth.rotStep}`);
      ok('...every RIDE press says what ATTACK now does, and in a room it says why it cannot',
        toasts.slice(0, 3).every((m) => /ATTACK now turns it \d+°/.test(m)) && toasts.length === nT + 1 && /quarter/.test(toasts[nT]) && room.rotStep === undefined);
      const C = H.game.housingCards;
      const leg = C._stepKeys(lan, BUILD_KEYS);
      ok('...and the legend and the touch pad both show the step',
        leg.some(([k, w]) => k === 'RIDE' && w === 'turn by 30°') && !C._stepKeys(room, BUILD_KEYS).some(([k]) => k === 'RIDE')
          && /data-hact="step"[^>]*>30°/.test(C._touchPad(0, true, false, 30)) && /pressed\('mount'\)\) \{ pad\.consume\?\.\('mount'\); this\.turnStep/.test(bsrc));
      H.game.toast = keepToast;
    }
  }

  /* THE HOUSE AND ITS THINGS ARE ONE. "Furniture and windows aren't scaled
     with the build animation. Can we parent them to the house" and "When
     moving a house that has furniture inside it ... should be parented to the
     house and move with it". Measured on the real island's meshes. */
  {
    const I = H.isles[0];
    const Hm = newHome(I.site.id, 'minka', ['Ember']);
    const room = HOUSE_BY_ID.minka.rooms[0];
    Hm.rooms = { [room.id]: { type: 'living', items: [{ id: 'kotatsu', gx: 0, gz: 0, rot: 0 }] } };
    defaultWindows(Hm);
    I.setHome(Hm, null);
    const mine = I.itemGroup.children.filter((g) => g.userData.floor != null && (g.userData.hk ?? 'main') === 'main');
    const hs = I.houseOf('main');
    const before = mine.map((g) => ({ y: g.position.y, s: g.scale.y, x: g.position.x, z: g.position.z }));
    I.rise('main', 0.5);
    const half = mine.every((g, k) => Math.abs(g.scale.y - before[k].s * 0.5) < 1e-9
      && Math.abs((g.position.y - hs.gy) - (before[k].y - hs.gy) * 0.5) < 1e-9) && hs.group.scale.y === 0.5;
    I.rise('main', 1);
    const back = mine.every((g, k) => g.scale.y === before[k].s && g.position.y === before[k].y) && hs.group.scale.y === 1;
    ok('a house rising brings its furniture AND its windows up with it, and puts them back exactly',
      mine.length >= 3 && half && back, `${mine.length} things`);
    const hsrc4 = readFileSync(new URL('../../src/systems/housing/housing.js', import.meta.url), 'utf8');
    const psrc4 = readFileSync(new URL('../../src/systems/housing/purchasescene.js', import.meta.url), 'utf8');
    ok('...the purchase scene uses it, and so does a new house being built',
      /I\.rise\('main', e\)/.test(psrc4) && /I\.rise\('main', 1\)/.test(psrc4) && /I\?\.raise\?\.\(raise\)/.test(hsrc4));
    I.raise('main');
    for (let k = 0; k < 40; k++) I.update(0.1, k * 0.1, []);
    ok('...and the raise finishes on its own at full height', !I.raising.size && mine.every((g, k) => g.scale.y === before[k].s));
    // the move: a ghost 10 east and a quarter turn round carries every one of them
    const G = { group: new THREE.Group(), carry: null };
    G.group.position.copy(hs.group.position).add(new THREE.Vector3(10, 0, 0));
    G.group.rotation.y = hs.group.rotation.y + Math.PI / 2;
    carry(G, I, 'main', hs.group);
    const rel = (g, P) => {
      const v = new THREE.Vector3(g.position.x, g.position.y, g.position.z).sub(P.position);
      return v.applyAxisAngle(new THREE.Vector3(0, 1, 0), -P.rotation.y);
    };
    const same = mine.every((g, k) => {
      const a = rel(g, G.group);
      const b = new THREE.Vector3(before[k].x, before[k].y, before[k].z).sub(hs.group.position).applyAxisAngle(new THREE.Vector3(0, 1, 0), -hs.group.rotation.y);
      return a.distanceTo(b) < 1e-6;
    });
    uncarry(G);
    const home = mine.every((g, k) => Math.abs(g.position.x - before[k].x) < 1e-9 && Math.abs(g.position.z - before[k].z) < 1e-9);
    ok('moving a house carries everything in it, in the house\'s own frame, and lets go exactly', same && home);
    const bsrc2 = readFileSync(new URL('../../src/systems/housing/build.js', import.meta.url), 'utf8');
    /* "Sometimes after moving or rotating a house, the player can just walk
       through the base ... should be pushed up on top of it." Every island,
       the small house stood at a spread of places and turns: from the grass
       just outside each edge of the plinth, the next step in is ON it. The
       worst rise is reported, because that is the number that was past the
       old 0.75 step. */
    {
      let worst = 0, miss = 0, n = 0;
      for (const J of H.isles) {
        const Hp = newHome(J.site.id, 'minka', ['Ember']);
        for (const [fx, fz, rot] of [[0, 0, 0], [12, -10, 0.7], [-14, 8, 2.1], [6, 16, 3.9], [-10, -14, 5.2]]) {
          Hp.at = { x: fx, z: fz, rot };
          J.setHome(Hp, null);
          const hs = J.houseOf('main');
          const P = hs.decks.find((d) => d.plinth);
          for (let k = 0; k < 16; k++) {
            const a = (k / 16) * Math.PI * 2;
            // a point just inside the plinth's edge, and one 0.5 outside it, along a ray from its middle
            const sx = Math.sin(a), sz = Math.cos(a);
            const t = Math.min(P.x1 / Math.abs(sx || 1e-9), P.z1 / Math.abs(sz || 1e-9));
            const inn = hs.local(sx * (t - 0.3), sz * (t - 0.3));
            const out = hs.local(sx * (t + 0.5), sz * (t + 0.5));
            const g = J.island.heightAt(out.x, out.z);
            if (g == null) continue;
            n++;
            const top = hs.gy + P.y;
            worst = Math.max(worst, top - g);
            const on = J.heightAt(inn.x, inn.z, g);
            if (!on || Math.abs(on.y - top) > 1e-6) miss++;
          }
        }
        J.setHome(null, null);
      }
      ok('a plinth lifts her onto it from the grass at every edge, wherever the house stands and however it turns',
        n > 200 && miss === 0, `${miss}/${n} edges walked into, worst rise ${worst.toFixed(2)}`);
    }
    ok('...and the build ghost does it, and lets go when it is dropped', /if \(real\) carry\(G, I, hk, real\); else uncarry\(G\);/.test(bsrc2) && /uncarry\(G\);\s*this\.ghosts\.delete\(i\);/.test(bsrc2));
    I.setHome(null, null);
  }

  /* FURNITURE IS SOLID. "Players should not be able to walk through
     furniture like the table, futon, kitchen ... but can get close to it
     (collision at half the radius of the player) ... always be able to walk
     around the edges of the room, and through gaps in between objects ... an
     object at 150% gets a 125% collider". Walked, through `Housing.wall`. */
  {
    ok('a furnishing\'s collider: 150% gets 125%, 50% gets 50%, 100% is 100%',
      furnScale(1.5) === 1.25 && furnScale(0.5) === 0.5 && furnScale(1) === 1 && Math.abs(FURN_INSET - 0.555) < 1e-9);
    const I = H.isles[0];
    const Hf = newHome(I.site.id, 'minka', ['Ember']);
    const room = HOUSE_BY_ID.minka.rooms[0];
    /* A table in the middle (cells 1-2 by 1-2 of a 5 by 4 grid), so the
       room's edge is clear all round; then a chest at cell 4 for the gap
       between them (cell 3). A thing stood AGAINST a wall closes that bit of
       edge, and that is the player's doing, not the collider's. */
    Hf.rooms = { [room.id]: { type: 'living', items: [{ id: 'kotatsu', gx: 1, gz: 1, rot: 0 }] } };
    const was = { dbg: H.debugOpen, home: H.store.homes[I.site.id] };
    H.debugOpen = true;
    H.store.homes[I.site.id] = Hf;
    I.setHome(Hf, null);
    const hs = I.houseOf('main');
    const y = hs.gy + hs.shell.floorY[0];
    const walker = fakePlayer(0);
    walker.radius = 0.75;
    const walk = (path) => {
      for (const [tx, tz] of path) {
        const tw = hs.local(tx, tz);
        for (let n = 0; n < 400; n++) {
          const dx = tw.x - walker.position.x, dz = tw.z - walker.position.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.12) break;
          const wx = walker.position.x, wz = walker.position.z;
          walker.position.x += (dx / d) * Math.min(0.1, d);
          walker.position.z += (dz / d) * Math.min(0.1, d);
          walker.position.y = y;
          walker.velocity.set(0, 0, 0);
          H.wall(walker, wx, wz, null);
        }
      }
      return hs.toLocal(walker.position.x, walker.position.z);
    };
    // the first table, measured in its own frame
    const kot = I.itemMeshes.get(`r:${room.id}:0`);
    const par = kot.parent, keep = [kot.position.clone(), kot.rotation.y];
    par.remove(kot); kot.position.set(0, 0, 0); kot.rotation.y = 0; kot.updateMatrixWorld(true);
    const kb = new THREE.Box3().setFromObject(kot);
    kot.position.copy(keep[0]); kot.rotation.y = keep[1]; par.add(kot); kot.updateMatrixWorld(true);
    const kc = hs.toLocal(kot.position.x, kot.position.z);
    // straight at its middle from the room's back: she stops half her radius off its edge
    const start = hs.local(kc.x + (kb.min.x + kb.max.x) / 2, kc.z + kb.min.z - 1.6);
    walker.position.set(start.x, y, start.z);
    const L = walk([[kc.x + (kb.min.x + kb.max.x) / 2, kc.z]]);
    const gap = (kc.z + kb.min.z) - L.z;
    ok('she cannot walk through a table, and stops half her radius from its edge',
      Math.abs(gap - FURN_REACH) < 0.06, `${gap.toFixed(3)} off the edge (want ${FURN_REACH})`);
    // round the room's edge, then through the one-cell gap between the table and a chest
    const ed = (room.w / 2) - 0.9, ez = (room.d / 2) - 0.9;
    const s0 = hs.local(-ed, -ez);
    walker.position.set(s0.x, y, s0.z);
    const lap = walk([[ed, -ez], [ed, ez], [-ed, ez], [-ed, -ez]]);
    Hf.rooms[room.id].items.push({ id: 'tansu', gx: 4, gz: 1, rot: 0 });
    I.setHome(Hf, null);
    const midX = room.cx - room.w / 2 + 7;   // the gap: cell 3, x 6..8 from the room's edge
    const g0 = hs.local(midX, -ez);
    walker.position.set(g0.x, y, g0.z);
    const thru = walk([[midX, ez]]);
    ok('...and she can walk all the way round the room\'s edge, and through the gap between a table and a chest',
      Math.hypot(lap.x + ed, lap.z + ez) < 0.2 && Math.hypot(thru.x - midX, thru.z - ez) < 0.2,
      `lap ends (${lap.x.toFixed(2)}, ${lap.z.toFixed(2)}), gap walk ends (${thru.x.toFixed(2)}, ${thru.z.toFixed(2)})`);
    // the futon at 150%: its collider is 125% of its own size, less the inset
    Hf.rooms[room.id].items = [{ id: 'futon', gx: 1, gz: 0, rot: 0, look: { s: 1.5 } }];
    I.setHome(Hf, null);
    const fu = I.itemMeshes.get(`r:${room.id}:0`);
    const fp = fu.parent;
    fp.remove(fu); const fk = [fu.position.clone(), fu.rotation.y]; fu.position.set(0, 0, 0); fu.rotation.y = 0; fu.updateMatrixWorld(true);
    const fb = new THREE.Box3().setFromObject(fu);
    fu.position.copy(fk[0]); fu.rotation.y = fk[1]; fp.add(fu);
    const fw = I.walls.filter((w) => w.furn === 'futon');
    const sides = fw.map((w) => Math.hypot(w.bx - w.ax, w.bz - w.az)).sort((a, b) => a - b);
    const want = [fb.max.x - fb.min.x, fb.max.z - fb.min.z].map((v) => v * (1.25 / 1.5) - 2 * FURN_INSET).sort((a, b) => a - b);
    ok('...and a futon at 150% has a 125% collider',
      fw.length === 4 && Math.abs(sides[0] - want[0]) < 1e-6 && Math.abs(sides[3] - want[1]) < 1e-6,
      `${sides.map((v) => v.toFixed(2))} vs ${want.map((v) => v.toFixed(2))}`);
    /* "The player does not collide with the paper floor lamp, samurai armor,
       katana stand etc. All furniture placed needs colliders." Anything
       under 1.2 across used to be skipped as too slight. EVERY furnishing a
       room sells gets its four sides, and walking at the lamp's middle stops
       her outside its drawn edge. */
    const floorIds = ITEMS.filter((it) => !it.holo && (it.where ?? []).includes('room')).map((it) => it.id);
    const bare = floorIds.filter((id) => {
      Hf.rooms[room.id].items = [{ id, gx: 1, gz: 1, rot: 0 }];
      I.setHome(Hf, null);
      return I.walls.filter((w) => w.furn === id).length !== 4;
    });
    ok(`every furnishing a room sells is solid (${floorIds.length}: ${floorIds.join(', ')})`,
      floorIds.length >= 8 && floorIds.includes('andon') && floorIds.includes('yoroi') && floorIds.includes('katana') && !bare.length,
      `no collider: ${bare.join(', ')}`);
    Hf.rooms[room.id].items = [{ id: 'andon', gx: 1, gz: 1, rot: 0 }];
    I.setHome(Hf, null);
    const an = I.itemMeshes.get(`r:${room.id}:0`);
    const ac = hs.toLocal(an.position.x, an.position.z);
    const ab = new THREE.Box3().setFromObject(an);
    const aHalf = (ab.max.z - ab.min.z) / 2;
    const a0 = hs.local(ac.x, ac.z - 2.5);
    walker.position.set(a0.x, y, a0.z);
    const aL = walk([[ac.x, ac.z]]);
    const aGap = (ac.z - aHalf) - aL.z;
    ok('...and she stops outside the paper lamp instead of walking through it',
      aGap > 0.2 && aGap < 1, `${aGap.toFixed(3)} short of its edge`);
    const hsrc6 = readFileSync(new URL('../../src/systems/housing/housing.js', import.meta.url), 'utf8');
    ok('...and a kitten lying on it or sat at the table is not shoved out of it', /if \(held && w\.furn\) continue;/.test(hsrc6));
    H.debugOpen = was.dbg;
    if (was.home) H.store.homes[I.site.id] = was.home; else delete H.store.homes[I.site.id];
    I.setHome(null, null);
  }

  /* "The stone lanterns at the entrance of the island gate are too small.
     They should be the same size as the stone lantern yard item." The gate's
     own `_dress`, run into a bare group, against the yard's lantern. */
  {
    const g = new THREE.Group();
    HomeBridge.prototype._dress.call({ fx: 0, fz: 1, rx: 1, rz: 0, accentMats: [], colour: 0xffffff, solids: [] }, { x: 0, y: 0, z: 0 }, 1, null, g);
    const tall = (o) => { o.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(o); return b.max.y - b.min.y; };
    const gate = tall(g.children[0]);
    const yard = tall(placeModel(ITEM_BY_ID.lantern.model, drawItem('lantern'), ITEM_BY_ID.lantern.size));
    ok('the island gate\'s stone lanterns are the yard\'s stone lantern, at its size', Math.abs(gate - yard) < 1e-6 && Math.abs(yard - ITEM_BY_ID.lantern.size.h) < 0.01,
      `gate ${gate.toFixed(2)}, yard ${yard.toFixed(2)}`);
  }

  /* THE PATHS, Richard's playthrough list for them, each one walked:
     "ground paths (not tiki) can be built under yard objects", "tiki torches
     and the lantern path's lanterns get colliders that interfere with other
     yard objects", "she stands on top of path meshes", "stepping-stone paths
     get varied heights (no z-fighting) and shapes that fit tightly without
     intersecting", the petals, the carpet, the torches and the lamps. */
  {
    const I = H.isles[0];
    const Hm = newHome(I.site.id, 'minka', ['Ember']);
    const paths = ITEMS.filter((i) => i.path);
    // ---- what may stand on what
    const gravel = ITEM_BY_ID.path_gravel, tiki = ITEM_BY_ID.path_tiki;
    const at = firstYardSpot(Hm, ITEM_BY_ID.koipond, I.radius);
    addOutdoor(Hm, 'path_gravel', at.x, at.z, 0);
    const onGravel = yardWhy(Hm, ITEM_BY_ID.lantern, at.x, at.z, -1, I.radius);
    Hm.outdoor = [];
    addOutdoor(Hm, 'lantern', at.x, at.z, 0);
    const gravelOver = yardWhy(Hm, gravel, at.x, at.z, -1, I.radius);
    const tikiOver = yardWhy(Hm, tiki, at.x, at.z, -1, I.radius);                       // its middle on the lantern
    const post = pathPosts(tiki).at[0];
    const tikiPost = yardWhy(Hm, tiki, at.x - post[0], at.z - post[1], -1, I.radius);   // a POST on the lantern
    ok('a flat path goes under a yard thing and a yard thing onto it; a torch path only minds its posts',
      onGravel == null && gravelOver == null && tikiOver == null && /overlaps the STONE LANTERN/.test(tikiPost ?? ''),
      `${onGravel} / ${gravelOver} / ${tikiOver} / ${tikiPost}`);
    // ---- every path is stood ON, at its own top, and its posts are solid where they are drawn
    Hm.outdoor = [];
    const spots = paths.map((it, k) => {
      const x = at.x + (k % 3 - 1) * 7, z = at.z + Math.floor(k / 3) * 7 - 7;
      addOutdoor(Hm, it.id, x, z, 0.4);
      return { it, x, z, uid: Hm.outdoor.at(-1).uid };
    });
    I.setHome(Hm, null);
    const bad = [];
    for (const S of spots) {
      const P = pathParts(S.it);
      const d = P.decks[0];
      const fx = (d.x0 + d.x1) / 2, fz = (d.z0 + d.z1) / 2;
      const w = I.local(...I._itemToHouse({ x: S.x, z: S.z, rot: 0.4 }, fx, fz));
      const c = I.local(S.x, S.z);
      const gy = I.island.heightAt(c.x, c.z) ?? I.groundY;
      const lift = 0.004 + (S.uid % 6) * 0.006;
      const h = I.heightAt(w.x, w.z, gy + 0.05)?.y - gy;
      if (!(Math.abs(h - (lift + d.y)) < 1e-6 && d.y >= 0.05)) bad.push(`${S.it.id} ${h?.toFixed(3)} vs ${(lift + d.y).toFixed(3)}`);
    }
    ok('she stands ON every kind of path, at the top of what is drawn (a boardwalk is 0.17)', bad.length === 0, bad.join('; ') || `${spots.length} kinds`);
    const tk = spots.find((S) => S.it.id === 'path_tiki');
    const posts = pathPosts(tiki).at.map(([px, pz]) => I.local(...I._itemToHouse({ x: tk.x, z: tk.z, rot: 0.4 }, px, pz)));
    const flames = pathParts(tiki).torches;
    ok('...a torch path\'s four posts are solid, where its torches are drawn',
      posts.every((p) => I.obstacles.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < 1e-6 && o.r === pathPosts(tiki).r))
        && flames.every(([x, , z], k) => x === pathPosts(tiki).at[k][0] && z === pathPosts(tiki).at[k][1]));
    // ---- no flat path fights itself
    // (faces turned DOWN at the ground are never seen, and every path has some there)
    const fights = paths.map((it) => [it.id, zFights(pathParts(it).solid.filter((g) => g.type === 'BoxGeometry'), (x) => x.axis === 'y' && x.side === '-' && Math.abs(x.plane) < 1e-6).length]).filter(([, n]) => n);
    ok('...and no path\'s parts share a face (the zfight scan, on every path\'s boxes)', fights.length === 0, JSON.stringify(fights));
    // ---- stepping stones: each convex, none touching, neighbours at different heights
    let seed = 3.3;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    let worst = Infinity, same = 0, n = 0;
    for (let trial = 0; trial < 40; trial++) {
      const St = steppingStones(ITEM_BY_ID.path_stone, rnd);
      n += St.length;
      for (let k = 0; k + 1 < St.length; k++) {
        // least distance between the two outlines' vertices and the other's edges is the seam
        const A = St[k].poly, Bp = St[k + 1].poly;
        const maxA = Math.max(...A.map((p) => p[1])), minB = Math.min(...Bp.map((p) => p[1]));
        const seg = (p, a, b) => { const vx = b[0] - a[0], vz = b[1] - a[1]; const u = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vz) / (vx * vx + vz * vz))); return Math.hypot(p[0] - a[0] - u * vx, p[1] - a[1] - u * vz); };
        const gap = Math.min(...A.flatMap((p) => Bp.map((q, i) => seg(p, q, Bp[(i + 1) % Bp.length]))), ...Bp.flatMap((p) => A.map((q, i) => seg(p, q, A[(i + 1) % A.length]))));
        worst = Math.min(worst, gap);
        if (Math.abs(St[k].h - St[k + 1].h) < 0.005) same++;
        if (maxA > minB + 0.6) worst = -1;
      }
    }
    ok('stepping stones fit tight and never touch: the narrowest seam over 40 strips is a hair over 0.1, and neighbours differ in height',
      worst > 0.1 && worst < 0.2 && same === 0, `seam ${worst.toFixed(3)}, ${same} level pairs in ${n} stones`);
    // ---- the effects, driven by a kitten walking about
    const fx = I.pathFx ?? new PathFX(I);
    const kit = fakePlayer(0);
    const torch = I.fxSites.find((s) => s.kind === 'torch');
    const tw = torch.parts[0].getWorldPosition(new THREE.Vector3());
    const cols = [];
    for (let pass = 0; pass < 3; pass++) {
      kit.position.set(tw.x + 6, tw.y - 2.7, tw.z);
      fx.update(0.016, pass, [kit]);
      kit.position.set(tw.x + 0.5, tw.y - 2.7, tw.z);
      fx.update(0.3, pass + 0.3, [kit]);
      cols.push(torch.col.getHex());
    }
    const lit = torch.parts[0].material.color.getHex();
    kit.position.set(tw.x + 6, tw.y - 2.7, tw.z);
    for (let k = 0; k < 120; k++) fx.update(0.016, 2 + k * 0.016, [kit]);
    ok('a tiki torch flares blue, then purple, then HER colour as she passes, and burns orange again after',
      cols[0] === FLARE_COLOURS[0] && cols[1] === FLARE_COLOURS[1] && cols[2] === kit.style.colour && lit !== 0xff6a12
        && torch.flare === 0 && torch.parts[0].material.color.getHex() === 0xff6a12 && FLARE_T >= 1 && FLARE_T <= 2,
      cols.map((c) => c.toString(16)).join(' '));
    const lamp = I.fxSites.find((s) => s.kind === 'lamp');
    const lw = lamp.mesh.getWorldPosition(new THREE.Vector3());
    kit.position.set(lw.x + 1, lw.y - 0.6, lw.z);
    for (let k = 0; k < 60; k++) fx.update(0.016, k, [kit]);
    const want = new THREE.Color(0xfff0c8).lerp(new THREE.Color(kit.style.colour), LAMP_TINT);
    ok('...a lantern leans a third of the way toward her colour while she is beside it ("subtly")', lamp.mesh.material.color.equals(want));
    const walk = (kind) => {
      const S = I.fxSites.find((s) => s.kind === kind);
      fx.parts.length = 0;
      kit.velocity.set(Math.sin(S.a) * 6, 0, Math.cos(S.a) * 6);
      kit.position.set(S.x, S.y, S.z);
      for (let k = 0; k < 30; k++) fx.update(0.016, k, [kit]);
      const got = fx.parts.map((o) => o.kind);
      kit.velocity.set(0, 0, 0);
      for (let k = 0; k < 40; k++) fx.update(0.016, k, [kit]);   // standing still kicks nothing up
      return { got, S, after: fx.parts };
    };
    const pet = walk('petal');
    const landed = pet.after.filter((o) => o.kind === 'petal').every((o) => o.p.y >= o.floor - 1e-9);
    ok('walking the sakura path kicks petals up off her feet, and they settle back on it', pet.got.filter((k) => k === 'petal').length >= 5 && landed && pet.after.length <= pet.got.length);
    const car = walk('carpet');
    ok('...and the red carpet leaves gold footprints with a glint off each', car.got.includes('print') && car.got.includes('spark') && car.got.filter((k) => k === 'print').length >= 1);
    const me = I.fxSites.length;
    I.setHome(null, null);
    ok('...and the yard\'s effects go with the yard', me > 0 && I.fxSites.length === 0);
    ok('a lone TIKI TORCH and PATH LANTERN are yard decorations, solid, burning and glowing like the paths\' own',
      ['tiki', 'pathlamp'].every((id) => ITEM_BY_ID[id]?.deco && ITEM_BY_ID[id].where.includes('yard') && YARD_BUILT.has(id)));
  }

  /* THE ZEN GARDEN. "stepping stones, sand whose pattern changes when walked
     on, and a rake to the side that clears it." Walked: across the sand, then
     along the stepping stones, then raked, then the yard rebuilt under it. */
  {
    const I = H.isles[0];
    const Hm = newHome(I.site.id, 'minka', ['Ember']);
    const at = firstYardSpot(Hm, ITEM_BY_ID.zengarden, I.radius);
    addOutdoor(Hm, 'zengarden', at.x, at.z, 0.5);
    I.setHome(Hm, null);
    const Z = I.fxSites.find((s) => s.kind === 'zen');
    const kit = fakePlayer(1);
    const W = (fx, fz) => I.local(...I._itemToHouse({ x: at.x, z: at.z, rot: 0.5 }, fx, fz));
    const stand = (fx, fz) => {
      const w = W(fx, fz);
      kit.position.set(w.x, I.heightAt(w.x, w.z, Z.at.y + 0.05)?.y, w.z);
      (I.pathFx ??= new PathFX(I)).update(0.016, 0, [kit]);
    };
    // along the stepping stones: she is ON them, and the sand is untouched
    for (const [x, z] of ZEN_STONES) stand(x, z);
    const onStones = Z.trodden;
    const stoneY = kit.position.y - Z.at.y;
    // across the sand, the long way, between the stones
    for (let x = -ZEN.w / 2 + 0.3; x < ZEN.w / 2 - 0.3; x += 0.2) stand(x, -ZEN.d / 2 + 0.6);
    const walked = Z.trodden;
    ok('the zen garden\'s sand is walked flat where she walks, and the stepping stones leave it alone',
      onStones === 0 && walked > 0.05 && walked < 0.25 && stoneY > 0.05, `stones ${onStones}, a walk across ${walked.toFixed(3)}, stones stand ${stoneY.toFixed(2)} over the sand`);
    // it outlives a rebuild of the yard (planting a tree rebuilds it all)
    addOutdoor(Hm, 'pine', at.x + 14, at.z, 0);
    I.setHome(Hm, null);
    const Z2 = I.fxSites.find((s) => s.kind === 'zen');
    ok('...the footprints are still there after the yard is rebuilt round it', Z2 !== Z && Z2.trodden === walked);
    // the rake
    const s = I.spots.find((q) => q.act === 'rake');
    const rw = W(ZEN_RAKE.x, ZEN_RAKE.z);
    const toastsWas = toasts.length;
    H.activities.start(kit, { ...s, isle: I, home: Hm });
    H.activities.held.delete(kit.index);
    kit.position.set(rw.x, Z2.at.y - ZEN.sandY, rw.z);
    let half = null;
    for (let k = 0, tt = 0; tt < RAKE_T + 0.3; k++, tt += 0.05) {
      I.pathFx.update(0.05, tt, [kit]);   // she stands at the rake, off the sand
      if (half == null && tt >= RAKE_T / 2) half = Z2.trodden;
    }
    ok('...and the RAKE beside it crosses the bed and leaves it smooth',
      Math.hypot(s.x - rw.x, s.z - rw.z) < 1e-6 && half > 0 && half < walked && Z2.trodden === 0 && Z2.rake === null && toasts.length > toastsWas,
      `${walked.toFixed(3)} → ${half?.toFixed(3)} half way → ${Z2.trodden}`);
    H.activities.start(kit, { ...s, isle: I, home: Hm });
    ok('...and raking smooth sand says so rather than doing nothing', /already raked smooth/.test(toasts.at(-1)?.[1] ?? ''), String(toasts.at(-1)?.[1]));
    ok('...and it is a floor: no path may run under it',
      !!yardWhy(Hm, ITEM_BY_ID.path_gravel, at.x, at.z, -1, I.radius));
    I.setHome(null, null);
  }

  /* THE TEAHOUSE WORKS LIKE A HOUSE. "a camera zoom on its front (smaller
     radius); a smaller, less aggressive x-ray; a tea ceremony with special
     music ... 20-30 seconds; remove the collider that keeps her out, and add
     colliders on the walls, floor and steps". Walked in by its step, walked at
     its three walls from inside and its platform from the open side, then two
     kittens kneel and the ceremony is timed through. */
  {
    const I = H.isles[0];
    const Hm = newHome(I.site.id, 'minka', ['Ember']);
    const rot = 0.5;
    const at = firstYardSpot(Hm, ITEM_BY_ID.teahouse, I.radius);
    addOutdoor(Hm, 'teahouse', at.x, at.z, rot);
    I.setHome(Hm, null);
    const T = I.teahouses?.[0];
    ok('a teahouse is built, and is no longer a SOLID disc she cannot enter',
      !!T && !I.obstacles.some((o) => Math.hypot(o.x - T.x, o.z - T.z) < 0.5), T ? `k ${T.k.toFixed(3)}` : 'none');
    const k = T.k;
    const c = Math.cos(T.a), s = Math.sin(T.a);
    const L = (p) => { const dx = p.x - T.x, dz = p.z - T.z; return { x: (dx * c - dz * s) / k, z: (dx * s + dz * c) / k }; };
    const W = (fx, fz) => I.local(...I._itemToHouse({ x: at.x, z: at.z, rot }, fx * k, fz * k));
    const walker = fakePlayer(0, 0, 0, 0);
    const stepTo = (fx, fz) => {
      const tw = W(fx, fz);
      for (let n = 0; n < 400; n++) {
        const dx = tw.x - walker.position.x, dz = tw.z - walker.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.12) return true;
        const wx = walker.position.x, wz = walker.position.z;
        walker.position.x += (dx / d) * Math.min(0.1, d);
        walker.position.z += (dz / d) * Math.min(0.1, d);
        const g = I.heightAt(walker.position.x, walker.position.z, walker.position.y);
        if (g) walker.position.y = g.y;
        H.wall(walker, wx, wz, null);
      }
      return false;
    };
    const putAt = (fx, fz) => { const w = W(fx, fz); walker.position.set(w.x, T.gy, w.z); };
    // in by the step
    putAt(0, TEA.step.z1 + 3);
    const inside = stepTo(0, TEA.step.z1 - 0.3) && stepTo(0, 0.4);
    const onFloor = walker.position.y - T.floorY;
    ok('...she walks up its step and onto the tatami',
      inside && Math.abs(onFloor) < 0.02, `reached ${inside}, ${onFloor.toFixed(3)} from the tatami's top`);
    // from the tatami at each of its three walls: she stops inside every one
    const r = walker.radius / k;
    putAt(0, 0.4); walker.position.y = T.floorY;
    stepTo(0, -5);
    const back = L(walker.position).z;
    putAt(0, 0.4); walker.position.y = T.floorY;
    stepTo(-6, 0.4);
    const left = L(walker.position).x;
    putAt(0, -1.2); walker.position.y = T.floorY;
    stepTo(6, -1.2);
    const right = L(walker.position).x;
    ok('...and its back, closed side and the back half of its open side are walls, from inside',
      back > -2.24 && left > -2.95 && right < 2.95 && back < -2.24 + r + 0.2,
      `back ${back.toFixed(2)}, left ${left.toFixed(2)}, right ${right.toFixed(2)} (walls at -2.24, ±2.95)`);
    // from the open side, on the ground: the platform's edge, not her walking under its floor
    // (a metre out, and her height against where she set off: the yard round it is the minka's, and not flat)
    putAt(4.5, 1.5);
    const y0 = walker.position.y;
    stepTo(0, 1.5);
    const edge = L(walker.position).x;
    const edgeY = walker.position.y - y0;
    putAt(-2.4, TEA.step.z1 + 1);
    const y1 = walker.position.y;
    stepTo(-2.4, 0);
    const front = L(walker.position).z;
    ok('...and the platform\'s open edges are risers: beside the step and from the open side, she is stopped, not under the floor',
      edge > TEA.floor.x1 && front > TEA.floor.z1 && edge < TEA.floor.x1 + r + 0.2 && front < TEA.floor.z1 + r + 0.2
      && Math.abs(edgeY) < 0.1 && Math.abs(walker.position.y - y1) < 0.1,
      `side ${edge.toFixed(2)} (edge ${TEA.floor.x1}) rose ${edgeY.toFixed(2)}, front ${front.toFixed(2)} (edge ${TEA.floor.z1}) rose ${(walker.position.y - y1).toFixed(2)}`);
    // the x-ray: its own material, a smaller cut than a house's
    const tg = I.itemMeshes.get('o' + Hm.outdoor.at(-1).uid);
    let onTea = 0;
    tg.traverse((o) => { if (o.isMesh && o.material === I.teaMat) onTea++; });
    const cr = (m) => m.userData.xray.uCutR.value;
    ok('...its x-ray is its own and smaller than a house\'s', onTea > 0 && cr(I.teaMat) < cr(I.wallMat) && I.xrayMats.includes(I.teaMat),
      `${onTea} meshes, cut ${cr(I.teaMat)} vs ${cr(I.wallMat)}`);
    // the camera: in front, on the step or inside → the teahouse's shot; behind it → her own
    putAt(0, TEA.step.z1 + 2);
    game.players = [walker];
    const shot = H.groupShot([0]);
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    putAt(0, -TEA.floor.z1 - 8);
    const behind = H.teaShotFor([0]);
    ok('...in front of it the camera frames its room from the street, at TEA_SHOT, square on to it',
      !!shot && shot.dist === TEA_SHOT.dist && Math.abs(wrap(shot.yaw - T.a)) < 1e-6 && Math.abs(shot.centre.y - T.floorY - TEA_SHOT.aimY) < 1e-6 && !behind,
      shot ? `dist ${shot.dist}, yaw off ${wrap(shot.yaw - T.a).toFixed(4)}, behind ${behind}` : 'no shot');
    /* ...AND THE WORDS OVER THEIR HEADS ARE IN IT. Richard, Oct 2026: "the
       camera zooms in too much and user can't read the text above the players
       head." Measured through her real lens (fov 38) in the worst pane, a
       tall half (aspect 0.9): the top of the callout over every seat - the
       highest it sits, with her health bar showing - must be inside the frame
       with a margin at TEA_SHOT, and must NOT have been at the old 10 / 1.0,
       which is the report. */
    {
      const kitH = new Player({ texture: new THREE.Texture(), index: 0, spawn: new THREE.Vector3(), cols: 8, rows: 4, mirror: false }).height;
      const topOf = (dist, aimY) => {
        const cam = new THREE.PerspectiveCamera(38, 0.9, 0.5, 4000);
        const c = shot.centre.clone().setY(T.floorY + aimY);
        cam.position.set(c.x + Math.sin(shot.yaw) * Math.cos(shot.pitch) * dist, c.y + Math.sin(shot.pitch) * dist, c.z + Math.cos(shot.yaw) * Math.cos(shot.pitch) * dist);
        cam.lookAt(c);
        cam.updateMatrixWorld();
        let worst = -Infinity;
        for (let k = 0; k < 4; k++) {
          const at = T.seat(k);
          const v = new THREE.Vector3(at.x, T.floorY + kitH * 1.98 + 0.6, at.z).project(cam);
          worst = Math.max(worst, v.y, Math.abs(v.x));
        }
        return worst;
      };
      const now = topOf(TEA_SHOT.dist, TEA_SHOT.aimY), was = topOf(10, 1.0);
      ok("...and the words over four kneeling kittens' heads are inside the frame now, and were not at the old 10 / 1.0",
        now < 0.9 && was > 0.9, `top of the words at ndc ${now.toFixed(2)} (was ${was.toFixed(2)}), her height ${kitH}`);
    }
    // THE CEREMONY
    const ps = [0, 1, 2].map((i) => fakePlayer(i));
    game.players = ps;
    const A = H.activities;
    const spots = I.spots.filter((q) => q.act === 'tea');
    A.start(ps[0], { ...spots[0], isle: I, home: Hm });
    H.musicSite = 'test';
    const music = H.musicTrack();
    A.update(1, ps);
    A.start(ps[1], { ...spots[1], isle: I, home: Hm });
    const seat0 = L(ps[0].position), seat1 = L(ps[1].position);
    ok('kneeling for tea seats her on the tatami in seiza, and her sister beside her; the ceremony\'s own music plays',
      A.holds(0) && A.holds(1) && ps[0].homePose === 'pray' && ps[1].homePose === 'pray'
      && Math.hypot(seat0.x - TEA.seats[0][0], seat0.z - TEA.seats[0][1]) < 1e-6 && Math.hypot(seat1.x - TEA.seats[1][0], seat1.z - TEA.seats[1][1]) < 1e-6
      && Math.abs(ps[0].position.y - T.floorY) < 1e-6 && music === 'teaCeremony' && !!MUSIC_FILES.teaCeremony,
      `music ${music}`);
    /* ps[0] has her tea drawing (all `_updateTea` asks is that there is one)
       and ps[1] does not, so both roads are walked in one ceremony. */
    ps[0].teaPose = {};
    let late = null, lifted = 0, endAt = null, ate = false, hidden0 = false, home1 = true;
    const frames = [[], []], mouth = [0, 0], wasMouth = [false, false];
    const poses = [new Set(), new Set()];
    const b0 = T.bowls[A.teaParty.seats[0].k], b1 = T.bowls[A.teaParty.seats[1].k];
    for (let t = 1; t < 32; t += 0.05) {
      const ct = A.teaParty?.t;
      A.update(0.05, ps);
      if (late == null && t > TEA_T.join + 0.5) { A.start(ps[2], { ...spots[0], isle: I, home: Hm }); late = !A.holds(2) && /already being served/.test(toasts.at(-1)?.[1] ?? ''); }
      ps.slice(0, 2).forEach((p, j) => {
        if (!A.holds(p.index)) return;
        if (p.homePose === 'eat') ate = true;
        poses[j].add(p.homePose);
        frames[j].push(p.teaFrame);
        const r = ct != null && teaFrameAt(ct + 0.05 - TEA_T.whisk - j * TEA_ANIM.stagger);
        if (r?.mouth && !wasMouth[j]) mouth[j]++;
        wasMouth[j] = !!r?.mouth;
      });
      if (A.teaParty && A.teaParty.t > TEA_T.whisk + TEA_ANIM.turn + TEA_ANIM.pick + 0.5 && A.teaParty.t < TEA_T.whisk + TEA_T.sip * 4 - 1) {
        hidden0 ||= !b0.visible;
        home1 &&= b1.visible;
      }
      lifted = Math.max(lifted, b1.position.y - b1.userData.home.y);
      if (endAt == null && !A.holds(0) && !A.holds(1)) endAt = t;
    }
    delete ps[0].teaPose;
    ok('...a kitten arriving after the tea is served is told so rather than ignored', late === true);
    /* CALM, IN SEIZA, AND SHE DRINKS FIVE TO TEN TIMES. Richard, Oct 2026:
       "little or no bouncing ... the player stays in seiza the whole time ...
       drinking from the cup 5 - 10x's". The bounce was the meal's pose. */
    ok('...nobody is ever put in the eating pose: in seiza, or in her tea drawing, the whole time',
      !ate && [...poses[0]].every((q) => q === 'tea' || q === 'pray') && [...poses[1]].every((q) => q === 'pray'),
      `with the drawing ${[...poses[0]]}, without ${[...poses[1]]}`);
    ok(`...they all drink together, ${teaSips()} slow sips each (5 to 10), and everybody stands together at the end`,
      teaSips() >= 5 && teaSips() <= 10 && mouth[0] === teaSips() && mouth[1] === teaSips()
      && Math.abs(endAt - TEA_LEN) < 0.25 && !ps[0].homePose && !A.teaParty,
      `sips ${mouth}, over at ${endAt?.toFixed(1)}s of ${TEA_LEN}`);
    const f0 = frames[0];
    const seg = TEA_SHEET.seg;
    ok('...her drawing plays the turn, the lift, the sips, the bowl going down, the prayer, and the turn back for the bow',
      Object.values(seg).every(([a, b]) => f0.some((f) => f >= a && f < b)) && f0.every((f) => f >= 0 && f < TEA_SHEET.cols * TEA_SHEET.rows)
      && f0.at(-1) === seg.turn[0],
      `frames ${[...new Set(f0)].join(' ')}`);
    ok('...with the drawing her bowl is in her paws (the 3D one hidden); without it the bowl rises to her',
      hidden0 && home1 && lifted > 0.8, `hidden ${hidden0}, the other bowl shown ${home1}, lifted ${lifted.toFixed(2)}`);
    {
      // the last of four to kneel finishes before the bow
      const last = teaFrameAt(TEA_T.sip * 4 - TEA_ANIM.stagger * 3 - 0.01);
      ok('...the fourth kitten to kneel has set her bowl down and prayed before everybody bows', last.beat === 'done', last.beat);
    }
    {
      /* THE SHEETS: 8 x 4 of TEA_SHEET.ship, for both kittens a sheet is
         drawn for (Storm and Blossom are them recoloured). */
      const dims = (s) => { try { const b = readFileSync(new URL(`../../public/sprites/kittens/${s}/tea.png`, import.meta.url)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; } catch { return null; } };
      const want = [TEA_SHEET.cols * TEA_SHEET.ship, TEA_SHEET.rows * TEA_SHEET.ship];
      ok('...and both tea sheets are on disk, 8 x 4 cells of TEA_SHEET.ship',
        ['ember', 'frost'].every((s) => dims(s)?.join() === want.join()), ['ember', 'frost'].map((s) => `${s} ${dims(s)}`).join(', '));
    }
    ok('...it runs 20 to 30 seconds, its bowls are back on the tray and its music has ended',
      TEA_LEN >= 20 && TEA_LEN <= 30 && T.bowls.every((b) => b.position.equals(b.userData.home)) && H.musicTrack() !== 'teaCeremony');
    H.musicSite = null;
    I.setHome(null, null);
  }

  /* JUMPING STONES SHE STANDS ON. "Jumping stones should be twice as big,
     more separated, with colliders". Each stone's top as DRAWN (the highest
     vertex over it) against the height the island answers there, with the
     row turned 0.7 so a frame mistake shows. */
  {
    const I = H.isles[0];
    const Hm = newHome(I.site.id, 'minka', ['Ember']);
    const at = firstYardSpot(Hm, ITEM_BY_ID.stones, I.radius);
    addOutdoor(Hm, 'stones', at.x, at.z, 0.7);
    I.setHome(Hm, null);
    const pos = drawItem('stones').geometry.attributes.position;
    const rows = STONES.map((s) => {
      let top = -1;
      for (let v = 0; v < pos.count; v++) if (Math.hypot(pos.getX(v) - s.x, pos.getZ(v) - s.z) < s.r - 0.1) top = Math.max(top, pos.getY(v));
      const [hx, hz] = I._itemToHouse({ x: at.x, z: at.z, rot: 0.7 }, s.x, s.z);
      const w = I.local(hx, hz);
      const gy = I.island.heightAt(w.x, w.z) ?? I.groundY;
      const stood = I.heightAt(w.x, w.z, gy + 0.05)?.y;   // walking up to it off the grass
      const gyc = I.island.heightAt(...[I.local(at.x, at.z)].map((c) => [c.x, c.z])[0]) ?? I.groundY;
      return { drawn: top, stood: stood - gyc, h: s.h };
    });
    const gaps = STONES.slice(1).map((s, k) => Math.hypot(s.x - STONES[k].x, s.z - STONES[k].z) - s.r - STONES[k].r);
    ok('jumping stones are twice the size they were (r 0.6) and a hop apart, not touching',
      STONES.every((s) => s.r >= 1.1) && Math.min(...gaps) > 0.8 && Math.max(...gaps) < 2.4, `radii ${STONES.map((s) => s.r.toFixed(2))}, gaps ${gaps.map((v) => v.toFixed(2))}`);
    ok('...and she stands ON every stone, at the top that is drawn, stepping up off the grass',
      rows.every((r) => Math.abs(r.drawn - r.h) < 1e-6 && Math.abs(r.stood - r.h) < 0.02),
      rows.map((r) => `${r.drawn.toFixed(2)}/${r.stood?.toFixed(2)}`).join(' '));
    I.setHome(null, null);
  }

  /* THE TREEHOUSE IS A LEVEL. "player can land on top of the treehouse and go
     inside it and run on branches". Every deck is sampled; a deck is
     reachable from another when some point of it is no more than a JUMP above
     and a short hop across. The roof must be reachable from the ground — that
     is the whole point of it — and the jump is measured off Player's own
     numbers, not assumed. */
  {
    const psrc = readFileSync(new URL('../../src/entities/player.js', import.meta.url), 'utf8');
    const g = +psrc.match(/const GRAVITY = ([\d.]+)/)[1];
    const v = +psrc.match(/const JUMP_V = ([\d.]+)/)[1];
    const JUMP = (v * v) / (2 * g) - 0.1;
    const I = H.isles[0];
    const Hm = newHome(I.site.id, 'minka', ['Ember']);
    const at = firstYardSpot(Hm, ITEM_BY_ID.treehouse, I.radius);
    addOutdoor(Hm, 'treehouse', at.x, at.z, 0.7);
    I.setHome(Hm, null);
    const tree = I.decks.filter((d) => d.frame);
    const pts = tree.map((d) => {
      const out = [];
      for (let u = 0; u <= 4; u++) {
        for (let w = 0; w <= 4; w++) {
          const fx = d.x0 + ((d.x1 - d.x0) * u) / 4;
          const fz = d.z0 + ((d.z1 - d.z0) * w) / 4;
          const c = Math.cos(d.frame.a), s = Math.sin(d.frame.a);
          out.push({ x: d.frame.x + fx * c + fz * s, z: d.frame.z - fx * s + fz * c, y: d.yAt ? d.yAt(fx, fz) : d.y });
        }
      }
      return out;
    });
    const ground = (I.island.heightAt(...[I.local(at.x, at.z)].map((q) => [q.x, q.z])[0]) ?? I.groundY) - I.groundY;
    const seen = new Set();
    const q = [];
    pts.forEach((P, k) => { if (P.some((p) => p.y <= ground + 0.8)) { seen.add(k); q.push(k); } });
    while (q.length) {
      const a = q.shift();
      pts.forEach((B, b) => {
        if (seen.has(b)) return;
        const hop = pts[a].some((p) => B.some((r) => r.y - p.y <= JUMP && Math.hypot(r.x - p.x, r.z - p.z) <= 2.6));
        if (hop) { seen.add(b); q.push(b); }
      });
    }
    const top = tree.reduce((m, d, k) => (d.y > tree[m].y ? k : m), 0);
    ok('the treehouse roof is reachable from the ground, every step no more than one jump',
      seen.has(top) && tree[top].y - ground > 14, `${seen.size}/${tree.length} decks, roof at ${(tree[top].y - ground).toFixed(1)}, jump ${JUMP.toFixed(2)}`);
    ok('...and so is every platform, branch and bridge in it', seen.size === tree.length, `${seen.size}/${tree.length}`);
    // a framed deck answers the island's own height query: stand over the roof
    const roof = tree[top];
    const c = I.local(roof.frame.x, roof.frame.z);
    const h = I.heightAt(c.x, c.z, Infinity);
    ok('...and the island stands her ON it: heightAt over the cabin is the roof', Math.abs(h.y - (I.groundY + roof.y)) < 0.01, `${h?.y} vs ${I.groundY + roof.y}`);
    ok('...with its four trunks as obstacles and the cabin as walls', I.obstacles.length >= 4 && I.walls.length > (I.houseWalls?.length ?? 0) + 4);

    /* THE STAIR, THE SLIDE, THE CRATES. Richard, Oct 2026: "Consider removing
       the ramp on the ground as it is intersecting with the bridges ... can
       build like a circular spiraling bridge instead ... or can make it a
       slide instead that players can ride down", and the crates were to have
       colliders. Each is checked for what it DOES: nothing of the stair or
       the slide has a rope bridge lower than a kitten's head over it; a
       kitten walks up the stair a tenth at a time onto A; one put on the
       slide is carried down it, never uphill, to the run at the bottom; and
       one walking at a crate stops outside it. */
    {
      const q = Hm.outdoor.find((o) => o.id === 'treehouse');
      const tc = Math.cos(q.rot), ts = Math.sin(q.rot);
      const th = (fx, fz) => [q.x + fx * tc + fz * ts, q.z - fx * ts + fz * tc];
      const part = (k) => tree.map((d, i) => [d, pts[i]]).filter(([d]) => d.part === k);
      const stair = part('stair'), chute = part('slide'), rope = part('rope');
      let worst = Infinity;
      /* OVER is "inside the rope deck's own rectangle, grown by her radius" —
         asked in the deck's frame. A distance between sampled edge points
         was the first try, and it called a stair 1.2 to the SIDE of a rope
         "under" it. A point where the two meet at the same height (the stair
         stepping onto A, the slide's lip at D) is a junction, not overhead. */
      for (const [, P] of [...stair, ...chute]) {
        for (const p of P) {
          for (const [r] of rope) {
            const c = Math.cos(r.frame.a), s = Math.sin(r.frame.a);
            const dx = p.x - r.frame.x, dz = p.z - r.frame.z;
            const lx = dx * c - dz * s, lz = dx * s + dz * c;
            if (lx < r.x0 - 0.6 || lx > r.x1 + 0.6 || lz < r.z0 - 0.6 || lz > r.z1 + 0.6) continue;
            const ry = r.yAt(Math.max(r.x0, Math.min(r.x1, lx)), Math.max(r.z0, Math.min(r.z1, lz)));
            if (ry - p.y < 0.5) continue;
            worst = Math.min(worst, ry - p.y);
          }
        }
      }
      ok('the treehouse stair and slide pass under no rope bridge lower than her head (the old ramp ran under A to B)',
        stair.length >= 10 && chute.length >= 8 && worst > 3.3, `${stair.length} stair, ${chute.length} slide decks; closest rope overhead ${worst === Infinity ? 'none' : worst.toFixed(2)}`);
      /* ...and the helter-skelter, which turns through the middle of all four
         trees, passes under NOTHING of the treehouse lower than her head — no
         platform, branch or bridge, and not its own upper turn. */
      let low = Infinity, lowWhat = '';
      /* ...but not the chord before or after: grown by her radius, its far
         end is 0.5 above this one's near end by construction, and that is a
         slope, not a roof. The upper TURN is 30+ chords away. */
      const ci = new Map(chute.map(([d], k) => [d, k]));
      for (const [k, [cd, P]] of chute.entries()) {
        for (const p of P) {
          tree.forEach((r, i) => {
            if (r === cd || (ci.has(r) && Math.abs(ci.get(r) - k) <= 2)) return;
            const c = Math.cos(r.frame.a), s = Math.sin(r.frame.a);
            const dx = p.x - r.frame.x, dz = p.z - r.frame.z;
            const lx = dx * c - dz * s, lz = dx * s + dz * c;
            if (lx < r.x0 - 0.6 || lx > r.x1 + 0.6 || lz < r.z0 - 0.6 || lz > r.z1 + 0.6) return;
            const ry = r.yAt ? r.yAt(Math.max(r.x0, Math.min(r.x1, lx)), Math.max(r.z0, Math.min(r.z1, lz))) : r.y;
            if (ry - p.y < 0.5) return;
            if (ry - p.y < low) { low = ry - p.y; lowWhat = r.part ?? `deck ${i}`; }
          });
        }
      }
      ok('...and nothing of the treehouse hangs lower than her head over the slide, its own upper turn included',
        low > 3.3, low === Infinity ? 'nothing over it' : `closest ${low.toFixed(2)} (${lowWhat})`);

      // walk it, as the doorway check above walks a house
      const walker = fakePlayer(0, 0, 0, 0);
      const stepTo = (tx, tz) => {
        const tw = I.local(tx, tz);
        for (let n = 0; n < 600; n++) {
          const dx = tw.x - walker.position.x, dz = tw.z - walker.position.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.15) return true;
          const wx = walker.position.x, wz = walker.position.z;
          walker.position.x += (dx / d) * 0.1;
          walker.position.z += (dz / d) * 0.1;
          const g = I.heightAt(walker.position.x, walker.position.z, walker.position.y);
          if (g) walker.position.y = g.y;
          H.wall(walker, wx, wz, null);
          walker.slide = null;
        }
        return false;
      };
      const S = TREEHOUSE_PLAN.SPIRAL;
      const end = Math.atan2(S.onto.x - S.x, S.onto.z - S.z);
      /* ...ON THE LINE A REAL KITTEN CAN STAND ON. The rail is a wall at
         r + w/2 - 0.1 = 2.45 from the newel, so her centre (PLAYER_RADIUS
         0.75 + the 0.18 skin) stays inside 1.52 — the stair's 1.8 centre line
         was only reachable by the old fake walker at 0.6. A real one climbs
         a hand's width inside it, which is still on the treads (1.05 out). */
      const walkR = S.r + S.w / 2 - 0.1 - (PLAYER_RADIUS + 0.18) - 0.05;
      const sp = (t) => { const a = end + Math.PI * 2 * S.turns * (1 - t); return th(S.x + Math.sin(a) * walkR, S.z + Math.cos(a) * walkR); };
      const b0 = I.local(...sp(-0.04));
      walker.position.set(b0.x, (I.heightAt(b0.x, b0.z, I.groundY + 1)?.y ?? I.groundY), b0.z);
      let walked = true;
      for (let k = 0; k <= 40 && walked; k++) walked = stepTo(...sp(k / 40));
      if (walked) walked = stepTo(...th(S.onto.x, S.onto.z));
      const onA = walker.position.y - I.groundY - ground;
      ok('...a kitten walks up the spiral stair a tenth at a time and steps off onto platform A',
        walked && Math.abs(onA - TREEHOUSE_PLAN.PLAT[0].y) < 0.15, `walked ${walked}, at ${onA.toFixed(2)} (A is ${TREEHOUSE_PLAN.PLAT[0].y})`);

      /* THE SLIDE IS ENTERED FROM THE TOP. Richard: "the player cant enter
         the slide from the top ... move the slide higher to the top". So she
         is stood on the cabin's ROOF, a little way back from the gap in its
         rail, and walks at the chute: she has to end up riding. */
      const SP = slidePath();
      const roofY = I.groundY + ground + SP.top;
      const m0 = SP.marks[0], m1 = SP.marks[1];
      const back = I.local(...th(m0.x - (m1.x - m0.x) * 1.5, m0.z - (m1.z - m0.z) * 1.5));
      walker.position.set(back.x, I.heightAt(back.x, back.z, roofY + 0.3).y, back.z);
      const onRoof = walker.position.y - roofY;
      let boarded = false;
      for (let n = 0; n < 80 && !boarded; n++) {
        const tw = I.local(...th(SP.marks[2].x, SP.marks[2].z));
        const dx = tw.x - walker.position.x, dz = tw.z - walker.position.z, d = Math.hypot(dx, dz) || 1;
        const wx = walker.position.x, wz = walker.position.z;
        walker.position.x += (dx / d) * 0.1;
        walker.position.z += (dz / d) * 0.1;
        const g = I.heightAt(walker.position.x, walker.position.z, walker.position.y + 0.2);
        if (g) walker.position.y = g.y;
        walker.slide = null;
        H.wall(walker, wx, wz, null);
        boarded = !!walker.slide;
      }
      ok('...a kitten on the cabin roof walks into the slide from the top and is riding it',
        Math.abs(onRoof) < 0.05 && boarded && walker.position.y > roofY - 1.2,
        `on the roof ${onRoof.toFixed(2)}, boarded ${boarded} at ${(walker.position.y - roofY).toFixed(2)}`);
      const ys = [walker.position.y];
      let rode = 0, uphill = 0;
      for (let n = 0; n < 400; n++) {
        walker.slide = null;
        H._slide(walker, I);
        if (!walker.slide) break;
        rode++;
        const wx = walker.position.x, wz = walker.position.z;
        walker.position.x += walker.slide.x * 0.1;
        walker.position.z += walker.slide.z * 0.1;
        const g = I.heightAt(walker.position.x, walker.position.z, walker.position.y + 0.2);
        if (g) walker.position.y = g.y;
        H.wall(walker, wx, wz, null);
        if (walker.position.y > ys[ys.length - 1] + 0.02) uphill++;
        ys.push(walker.position.y);
      }
      const drop = ys[0] - ys[ys.length - 1];
      ok('...and carries her from the roof round the pole to the run at the bottom, never uphill',
        rode > 200 && uphill === 0 && drop > SP.top - 1.5 && ys[ys.length - 1] - I.groundY - ground < 0.4,
        `${rode} steps, ${uphill} uphill, dropped ${drop.toFixed(2)}, ends ${(ys[ys.length - 1] - I.groundY - ground).toFixed(2)} up`);

      /* ...AND A REAL KITTEN, NOT A FAKE ONE. Richard, Oct 2026: "the player
         doesn't seem to be able to walk to the start of the ride ... is there
         a collider?" There was — the chute's lips stood 0.81 off its line and
         a real Player is 0.75 + the 0.18 skin, so she was pinched to a stop
         0.45 short of the mouth while the walker above, at radius 0.6, sailed
         in. So: a real Player, real physics, the stick held at the chute. */
      ok("...the chute's walls clear a real kitten: LIP_WALL >= PLAYER_RADIUS + the skin",
        LIP_WALL >= PLAYER_RADIUS + 0.18 + 0.05, `LIP_WALL ${LIP_WALL}, needs ${(PLAYER_RADIUS + 0.23).toFixed(2)}`);
      const wasPlayers = game.players;
      const SL = I.slides[0];
      const [s0, s1, s2] = SL.marks;
      const sl = Math.hypot(s1.x - s0.x, s1.z - s0.z);
      const ux = (s1.x - s0.x) / sl, uz = (s1.z - s0.z) / sl;
      const pad0 = { mx: 0, my: 0, down: () => false, pressed: () => false };
      const real = (x, z) => {
        const k = new Player({ texture: new THREE.Texture(), index: 0, spawn: new THREE.Vector3(x, SL.top + 0.3, z), cols: 8, rows: 4, mirror: false });
        k.style = PLAYER_STYLE[0]; k.name = k.style.name;
        game.players = [k];
        return k;
      };
      const hudS = { sfx() {}, toast() {} };
      const stepK = (k, pad, n = 1) => { for (let f = 0; f < n; f++) { k.update(1 / 60, pad, world, [], hudS); H.update(1 / 60); } };
      {
        const k = real(s0.x - ux * 2.1, s0.z - uz * 2.1);
        const push = { ...pad0, my: -1 };
        let boardedR = false;
        for (let f = 0; f < 180 && !boardedR; f++) {
          k.camYaw = Math.atan2(-(s2.x - k.position.x), -(s2.z - k.position.z));
          stepK(k, push);
          boardedR = k.slideT > 0;
        }
        ok('...a REAL kitten on the roof, stick held at the chute, walks in and is riding it',
          boardedR, `stopped ${Math.hypot(k.position.x - s0.x, k.position.z - s0.z).toFixed(2)} from the mouth`);
        H.slides.drop(0);
      }
      /* THE QUESTION AT THE TOP, AND BOTH ANSWERS. "a menu appears and the
         player can choose 'Ride down in normal view' and 'Ride down in First
         Person View'" — and either walks her to the mouth on her own. She is
         stood off to one side of it, so the walk has to line her up first. */
      for (const fpv of [false, true]) {
        const k = real(s0.x - ux * 1.6 - uz * 0.9, s0.z - uz * 1.6 + ux * 0.9);
        stepK(k, pad0, 10);
        const asked = game.housingCards._top(0)?.v === 'slide';
        const rows = asked ? game.housingCards._view(0).rows.map((r) => r.title) : [];
        const started = H.slides.start(k, fpv);
        let rodeR = false, minY = k.position.y, camW = 0, hidMine = false, hidHers = false, n = 0, steep = 0;
        while (H.slides.riding(k) && n++ < 60 * 14) {
          stepK(k, pad0);
          rodeR ||= k.slideT > 0;
          minY = Math.min(minY, k.position.y);
          camW = Math.max(camW, k.rideCamW ?? 0);
          hidMine ||= H.slides.hiddenFrom(k, [0]);
          hidHers ||= H.slides.hiddenFrom(k, [1]);
          if (fpv && k._rc && (k.rideCamW ?? 0) > 0.95) {
            const e = k._rc.pos, l = k._rc.look;
            steep = Math.max(steep, Math.atan2(e.y - l.y, Math.hypot(l.x - e.x, l.z - e.z)));
          }
        }
        /* HANDING BACK: the lens eases out of her head after the ride has
           ended, and she stays hidden from it until it is out (> 0.6 in),
           then is drawn again. She reappeared the frame the ride ended, round
           a lens still inside her: one frame of a giant kitten. */
        let outOk = true, seenAgain = false;
        for (let f = 0; f < 120; f++) {
          stepK(k, pad0);
          const inHead = (k.rideCamW ?? 0) > 0.6;
          if (fpv && inHead && !H.slides.hiddenFrom(k, [0])) outOk = false;
          if (!inHead && H.slides.hiddenFrom(k, [0])) outOk = false;
          seenAgain ||= !inHead && !H.slides.hiddenFrom(k, [0]);
        }
        if (fpv) {
          /* DOWN THE CHUTE, NOT INTO IT. "they walk to the top of the slide and
             slide down in first person view": the lens looks SLIDE_LOOK down
             the path. Along her heading it looked out over the rail (the
             tangent of a spiral); clamped at the path's end it looked
             straight down into the bed. Measured here as the steepest the lens
             ever pointed below level, fully in her head: 57.4 deg with the
             look POINT eased (it trailed under her), 55.5 eased as a direction
             but aimed a hand over the path, 42.4 aimed at eye height over it —
             on the tightest lap of the helix, where 4m of path is a 2.1m chord.
             Fixed-step, so the number does not wander. */
          ok('...first person looks down the chute, never steeper than 45 degrees, and hides her until the lens is out of her head',
            steep > 0.05 && steep < Math.PI / 4 && outOk && seenAgain, `steepest ${(steep * 180 / Math.PI).toFixed(1)} deg, hand-back ${outOk}, seen again ${seenAgain}`);
        }
        const bottom = minY - s2.y - (SL.top - s0.y);
        ok(`...the top of the slide asks, NO first, and "${fpv ? 'FIRST PERSON' : 'NORMAL VIEW'}" walks her in and rides her down`,
          asked && /^NO/.test(rows[0]) && rows.includes(fpv ? 'RIDE DOWN IN FIRST PERSON VIEW' : 'RIDE DOWN IN NORMAL VIEW')
          && started && rodeR && SL.top - minY > SLIDE_DROP_MIN && camW > 0.95 && !H.slides.riding(k) && k.rideCam == null && k.autoWalk == null,
          `asked ${asked} [${rows.join(' / ')}], rode ${rodeR}, dropped ${(SL.top - minY).toFixed(2)}, camera ${camW.toFixed(2)}, ${n} frames`);
        ok(`...${fpv ? "first person hides her from HER lens and from nobody else's" : 'normal view hides her from nobody'}`,
          fpv ? hidMine && !hidHers : !hidMine && !hidHers, `hers ${hidMine}, a sister's ${hidHers}`);
        game.inspector.closeOne?.(0);
        game.housingCards.st.delete(0);
        H.slides.drop(0);
        void bottom;
      }
      game.players = wasPlayers;
      {
        /* aheadOnPath only ever runs FORWARD from her last segment (the
           spiral lies over itself, so the nearest segment can be a lap
           below), is SLIDE_LOOK of path further on, and past the end carries
           on level along the run-out. */
        const M = SL.marks;
        const arc = (k, P) => { let s = 0; for (let j = 0; j < k; j++) s += Math.hypot(M[j + 1].x - M[j].x, M[j + 1].y - M[j].y, M[j + 1].z - M[j].z); return s + Math.hypot(P.x - M[k].x, P.y - M[k].y, P.z - M[k].z); };
        let fwd = true, len = true, prev = 0, worst = 0;
        for (let k = 0; k < M.length - 1; k++) {
          const a = M[k], b = M[k + 1];
          const A = aheadOnPath(M, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, SLIDE_LOOK, prev);
          if (A.seg < prev || A.seg !== k) fwd = false;
          prev = A.seg;
          const end = arc(M.length - 1, M[M.length - 1]);
          const want = arc(k, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }) + SLIDE_LOOK;
          // and the point is ON the path (its nearest segment, measured)
          let dist = Infinity;
          for (let j = 0; j < M.length - 1; j++) {
            const p0 = M[j], p1 = M[j + 1];
            const ex = p1.x - p0.x, ey = p1.y - p0.y, ez = p1.z - p0.z, L2 = ex * ex + ey * ey + ez * ez || 1;
            const u = Math.max(0, Math.min(1, ((A.x - p0.x) * ex + (A.y - p0.y) * ey + (A.z - p0.z) * ez) / L2));
            dist = Math.min(dist, Math.hypot(p0.x + ex * u - A.x, p0.y + ey * u - A.y, p0.z + ez * u - A.z));
          }
          if (want < end && dist > 1e-6) len = false;
          worst = Math.max(worst, want < end ? dist : 0);
        }
        const e = M[M.length - 1], e0 = M[M.length - 2];
        const P = aheadOnPath(M, e.x, e.y, e.z, SLIDE_LOOK, M.length - 2);
        const level = Math.abs(P.y - e.y) < 1e-9 && Math.abs(Math.hypot(P.x - e.x, P.z - e.z) - SLIDE_LOOK) < 1e-6
          && ((P.x - e.x) * (e.x - e0.x) + (P.z - e.z) * (e.z - e0.z)) > 0;
        ok('...the first-person look point walks the path forward only, lies ON it, and past the end runs on level',
          fwd && len && level, `forward ${fwd}, on the path ${len} (off by ${worst.toExponential(1)}), level past the end ${level}`);
      }

      /* ROUND THE MAST, INSIDE THE CABIN. "the tree trunk is going through it
         and the player cant get in or walk around it". She walks a ring round
         the cabin tree at 1.5 from its middle, inside the room; with the
         trunk's old collider (r 1.1 at every height) the ring was solid. */
      {
        const P = TREEHOUSE_PLAN;
        const T = P.TRUNKS[P.PLAT[2].t];
        const floor = I.groundY + ground + P.PLAT[2].y;
        const ringAt = (k) => th(T.x + Math.sin(k * 0.5) * 1.5, T.z + Math.cos(k * 0.5) * 1.5);
        const s0 = I.local(...ringAt(0));
        walker.position.set(s0.x, I.heightAt(s0.x, s0.z, floor + 0.3).y, s0.z);
        let round = true;
        for (let k = 1; k <= 13 && round; k++) round = stepTo(...ringAt(k));
        ok('...and inside the cabin a kitten walks right round the tree, which is a mast above the floor',
          round && Math.abs(walker.position.y - floor) < 0.1, `round ${round}, at ${(walker.position.y - floor).toFixed(2)} over the floor`);
        const tsrc = readFileSync(new URL('../../src/systems/housing/treehouse.js', import.meta.url), 'utf8');
        ok('...and the stair\'s rope rail is ONE rope end to end (a tube), staked into the ground at the bottom',
          /new THREE\.TubeGeometry\(curve/.test(tsrc) && /ropeRail\(rail, [\d.]+, \{ stakeStart: true \}\)/.test(tsrc));
      }
      const psrc2 = readFileSync(new URL('../../src/entities/player.js', import.meta.url), 'utf8');
      ok('...and Player rides what housing hands her: the stick is taken, and the slide sets her speed before she moves',
        /if \(this\.slide\) pad = FROZEN_PAD/.test(psrc2) && /const sl = this\.slide;[\s\S]{0,1800}\/\/ --- move \+ collide ---/.test(psrc2));

      // a crate: walk at it across the cabin's platform, from the -z side
      const crates = part('crate');
      const stops = crates.map(([d], i) => {
        const c = d.frame;
        // from the side away from the other crate: the gap between them is narrower than she is
        const o = crates[1 - i]?.[0].frame ?? { x: c.x - 1, z: c.z };
        const ul = Math.hypot(c.x - o.x, c.z - o.z) || 1;
        const from = [c.x + ((c.x - o.x) / ul) * 1.6, c.z + ((c.z - o.z) / ul) * 1.6];
        const f = I.local(...from);
        walker.position.set(f.x, I.heightAt(f.x, f.z, I.groundY + 13).y, f.z);
        stepTo(c.x, c.z);
        const w = I.toLocal(walker.position.x, walker.position.z);
        return Math.hypot(w.x - c.x, w.z - c.z);
      });
      ok('...and both crates on the cabin\'s platform are solid: walked at, she stops outside them',
        stops.length === 2 && stops.every((s) => s > 1.1), stops.map((s) => s.toFixed(2)).join(' / '));

      /* THE X-RAY. Every mesh of the treehouse is on a material the cutaway
         points (`xrayMats`), with an x-ray strength that is not zero — the
         cabin alone was, and the trunk through the room hid her. */
      const tg = I.itemMeshes.get('o' + q.uid);
      const meshes = [];
      tg.traverse((o) => { if (o.isMesh) meshes.push(o); });
      const cut = meshes.filter((m) => I.xrayMats.includes(m.material) && m.geometry.attributes.xrayK?.array.some((k) => k > 0));
      ok('...and every part of it takes the x-ray: trunks, crowns, platforms, slide and cabin',
        meshes.length >= 4 && cut.length === meshes.length, `${cut.length}/${meshes.length}`);
    }

    /* THE YARD'S COLLIDERS. Richard, Oct 2026: "Bamboo fence has no collider
       built in the yard of players island. Let's ensure that all objects
       built on the players island have collider if they should have a
       collider." Each yard thing is built in a sandbox (as build mode's ghost
       is) and must add an obstacle or a wall — unless it is on this list, of
       things she walks on or into, each with its reason. A new yard item
       that is neither fails here until somebody decides which it is. */
    {
      const WALK_ON = {
        koipond: 'fished from the rim', onsen: 'soaked in', volleyball: 'played on', bamboofarm: 'harvested in',
        pen: 'the animals are inside it', stones: 'stepping stones', paddy: 'a flat field', reeds: 'a clump to wade through',
        bladeforest: 'built elsewhere',
      };
      const missing = [];
      for (const it of ITEMS.filter((i) => i.where?.includes?.('yard') && !i.path && !i.later)) {
        if (WALK_ON[it.id]) continue;
        const keep = [I.places, I.spots, I.obstacles, I.decks, I.walls];
        I.places = new Map(); I.spots = []; I.obstacles = []; I.decks = []; I.walls = [];
        try {
          I._yardItem(it, { uid: -1, id: it.id, x: 0, z: 0, rot: 0 });
          if (!I.obstacles.length && !I.walls.length) missing.push(it.id);
        } finally {
          [I.places, I.spots, I.obstacles, I.decks, I.walls] = keep;
        }
      }
      ok('every yard thing she should bump into has a collider', missing.length === 0, missing.join(', ') || 'all');

      // the fence, for real: walked at it stops her, and she can stand on it
      const Hf = newHome(I.site.id, 'minka', ['Ember']);
      const sp = firstYardSpot(Hf, ITEM_BY_ID.fence, I.radius);
      addOutdoor(Hf, 'fence', sp.x, sp.z, 0.6);
      I.setHome(Hf, null);
      const fq = Hf.outdoor.find((o) => o.id === 'fence');
      const fr = fq.rot;
      const fw = (fx, fz) => I.local(fq.x + fx * Math.cos(fr) + fz * Math.sin(fr), fq.z - fx * Math.sin(fr) + fz * Math.cos(fr));
      const walker = fakePlayer(0);
      const s0 = fw(0.8, 3);
      walker.position.set(s0.x, I.heightAt(s0.x, s0.z, I.groundY + 5).y, s0.z);
      const tgt = fw(0.8, -3);
      for (let n = 0; n < 80; n++) {
        const dx = tgt.x - walker.position.x, dz = tgt.z - walker.position.z;
        const d = Math.hypot(dx, dz) || 1;
        const wx = walker.position.x, wz = walker.position.z;
        walker.position.x += (dx / d) * 0.1;
        walker.position.z += (dz / d) * 0.1;
        H.wall(walker, wx, wz, null);
      }
      const fl = I.toLocal(walker.position.x, walker.position.z);
      const side = (fl.x - fq.x) * Math.sin(fr) + (fl.z - fq.z) * Math.cos(fr);
      const top = fw(0, 0);
      const lid = I.heightAt(top.x, top.z, I.groundY + 10);
      ok('...the bamboo fence among them: walked straight at, she stops on her own side of it',
        side > 0.9, `stopped ${side.toFixed(2)} from its line`);
      ok('...and one who jumps onto it stands on top, rather than dropping inside it',
        lid?.deck && Math.abs(lid.y - (I.island.heightAt(top.x, top.z) + 3.52)) < 0.05, `${lid?.y?.toFixed(2)}`);
      // a BIGGER fence is solid along its new length
      fq.look = { s: 1.5 };
      I.setHome(Hf, null);
      const len = Math.max(...I.walls.filter((w) => w.item === fq.uid).map((w) => Math.hypot(w.bx - w.ax, w.bz - w.az)));
      ok('...and made BIGGER, its collider grows with it', Math.abs(len - 4.4 * 1.5) < 0.05, `${len.toFixed(2)} long`);

      /* The yard's trees and bushes are on the isle's plant x-ray, and a
         loaded model — whose geometry carries no `xrayK`, which the shader
         reads as ZERO — is given one. */
      const keep = [I.places, I.spots, I.obstacles, I.decks, I.walls];
      let mapleOk = false;
      try {
        const g = I._yardItem(ITEM_BY_ID.maple, { uid: -1, id: 'maple', x: 0, z: 0, rot: 0 });
        const ms = [];
        g.traverse((o) => { if (o.isMesh) ms.push(o); });
        mapleOk = ms.length > 0 && ms.every((m) => m.material === I.plantMat) && I.xrayMats.includes(I.plantMat)
          && typeof g.children[0]?.userData.onReal === 'function';
      } finally {
        [I.places, I.spots, I.obstacles, I.decks, I.walls] = keep;
      }
      const bare = new THREE.BufferGeometry();
      bare.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
      bare.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9), 3));
      const loaded = new THREE.Group().add(new THREE.Mesh(bare, new THREE.MeshBasicMaterial()));
      xrayModel(loaded, I.plantMat, 0.8);
      ok('the yard\'s trees and bushes take the x-ray, and a loaded model is given the strength the shader reads',
        mapleOk && Math.abs(bare.attributes.xrayK?.array[0] - 0.8) < 1e-6 && loaded.children[0].material === I.plantMat);
    }
    I.setHome(null);
  }

  /* HOME BOONS. Each one is checked for the BEHAVIOUR it promises — the green
     is the right size at the right moments, the red is live for exactly the
     first fifteen seconds, the wings come once a round and lift her clear of
     the stone — and that the tournament actually asks for each. */
  {
    ok('a meal pays 5/10/15% by how many sat down, and never more than 15',
      [1, 2, 3, 4].map(mealPct).join() === '5,10,15,15');
    const B = H.boons;
    const a = { ...fakePlayer(0), baseMaxHp: 100, maxHp: 100, hp: 100, jumpsLeft: 0 };
    const b = { ...fakePlayer(1), baseMaxHp: 120, maxHp: 120, hp: 120, jumpsLeft: 0 };
    H.store.boons = {};
    B.grant(a, 'meal', 10);
    B.grant(a, 'meal', 5);
    B.grant(a, 'onsen');
    B.grant(b, 'bless');
    ok('a smaller second meal does not take green away', H.store.boons[a.name].meal === 10);
    B.arm([a, b]);
    ok('a battle beginning puts each kitten\'s boons ON her and empties the store',
      a.homeBoon?.meal === 10 && a.homeBoon.onsen && b.homeBoon?.bless && Object.keys(H.store.boons).length === 0);
    ok('the meal\'s green is a share of her ORDINARY bar, and only when the arena heals her',
      B.mealHp(a, true) === 10 && B.mealHp(a, false) === 0 && B.mealHp(b, true) === 0);
    const T = { state: 'live', fighting: true, t: 5, round: 1 };
    game.tournament = T;
    const k5 = B.dmgK(a);
    T.t = 15.01;
    const k15 = B.dmgK(a);
    T.fighting = false; T.t = 1;
    const kOff = B.dmgK(a);
    T.fighting = true;
    ok('the onsen doubles her blows for the first 15 seconds of a live round, and not after, and not for her sister',
      k5 === 2 && k15 === 1 && kOff === 1 && B.dmgK(b) === 1, `${k5} ${k15} ${kOff}`);
    const ringY = 10;
    b.position.y = 0;
    const w1 = B.wings(b, ringY);
    const peak = b.position.y + (b.velocity.y ** 2) / (2 * 26 * BOON.wingGravity);
    const w2 = B.wings(b, ringY);
    T.round = 2;
    const w3 = B.wings(b, ringY);
    ok('the wings come once a ROUND, and only to the blessed',
      w1 && !w2 && w3 && !B.wings(a, ringY) && b.wingT === BOON.wingT);
    ok('...and lift her clear above the ring, from the floor below it', peak >= ringY + BOON.wingRise - 0.01, peak.toFixed(2));
    B.disarm([a, b]);
    ok('...and a finished battle takes every boon off again', !a.homeBoon && !b.homeBoon && !b.wingT);
    game.tournament = null;
    const tsrc = readFileSync(new URL('../../src/systems/tournament.js', import.meta.url), 'utf8');
    const ringOut = tsrc.slice(tsrc.indexOf('const price = p.blastT > 0 ? 0 : damage;'));
    ok('the tournament arms them at begin and disarms at finish',
      /this\.round = 0;[\s\S]{0,300}boons\?\.arm\?\.\(this\.game\.players\)/.test(tsrc)
      && /finish\(\) \{\s*this\.state = 'off';[\s\S]{0,200}boons\?\.disarm/.test(tsrc));
    ok('...adds the meal\'s green on top of the feast\'s, on round one and after a loss',
      /mealHp\?\.\(p, this\.round === 1 \|\| lost\)[\s\S]{0,120}setRoundBonus\?\.\(\(p\.bonusHp \?\? 0\) \+ meal\)/.test(tsrc));
    ok('...and asks for the wings BEFORE a ring-out is charged, never instead of a free return',
      ringOut.indexOf('boons?.wings?.(p') > 0 && ringOut.indexOf('boons?.wings?.(p') < ringOut.indexOf('p.hurt(')
      && /price > 0 && this\.game\.housing\?\.boons\?\.wings/.test(ringOut));
    const msrc = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
    ok('the red is a multiplier on the damage number, after the gate',
      /const dmg = base \* \(kind === 'tri' \? triDmgK\(attacker\) : 1\)\s*\* \(this\.housing\?\.boons\?\.dmgK\?\.\(attacker\) \?\? 1\)/.test(msrc));
    ok('a kitten held by a home activity is handed a dead pad', /inspector\?\.busy\(i\)\s*\|\| this\.housing\?\.activities\?\.holds\(i\)( \|\| this\.housing\?\.watching\(i\))?( \|\| this\.housing\?\.kendoHolds\?\.\(i\))?\)/.test(msrc));
  }

  /* THINGS TO DO AT HOME. Every hold ends by itself, and pays what it says. */
  {
    const A = H.activities;
    ok('the nap fades in, holds black, and fades out', napFade(0) === 0 && napFade(2) === 1 && Math.abs(napFade(3.5) - 0.5) < 1e-9 && napFade(4) === 0);
    const ps = [0, 1, 2].map((i) => ({ ...fakePlayer(i), hp: 50, maxHp: 100, baseMaxHp: 100 }));
    game.players = ps;
    H.store.boons = {};
    const isle = { spots: [{ act: 'sit', item: 'kotatsu', x: 0, z: 0, room: 'r', k: 0 }, { act: 'sit', item: 'kotatsu', x: 6, z: 0, room: 'r', k: 9 }], x: 0, z: 0 };
    const home = { site: 'test', owners: ps.map((p) => p.name) };
    A.start(ps[0], { act: 'nap', x: 0, z: 0, y: 0, isle, home });
    ok('a nap holds her still and puts her under the covers', A.holds(0) && ps[0].homePose === 'futon');
    A.start(ps[1], { act: 'pray', x: 0, z: 0, y: 0, isle, home });
    H.musicSite = 'test';
    ok('praying starts the shrine\'s song, and it outranks the boombox', !!A.prayer && H.musicTrack() === 'shrinePrayer');
    for (let k = 0; k < 60; k++) A.update(0.1, ps);
    ok('...the nap ends by itself and she wakes fully rested', !A.holds(0) && ps[0].hp === 100 && !ps[0].homePose);
    ok('...and the prayer ends by itself, BLESSED', !A.holds(1) && H.store.boons[ps[1].name]?.bless === true);
    for (let k = 0; k < 400; k++) A.update(0.1, ps);
    ok('...and the song gives way again once it is over', !A.prayer && H.musicTrack() !== 'shrinePrayer');
    H.musicSite = null;
    /* "When napping on the bed, the player sprite model is not facing in the
       correct direction." She lies on the futon's middle facing its PILLOW,
       measured off the drawn futon (the white box nearest an end), and the
       drawing is a mirroring billboard whose head is on the left. */
    {
      // the futon is one merged mesh: the pillow is its WHITE vertices (painted 0xffffff)
      const fut = drawItem('futon', 2);
      let pz = null, zs = 0, nz = 0;
      fut.updateMatrixWorld(true);
      fut.traverse((m) => {
        const col = m.isMesh && m.geometry.attributes.color;
        if (!col) return;
        const pos = m.geometry.attributes.position, v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          if (col.getX(i) < 0.99 || col.getY(i) < 0.99 || col.getZ(i) < 0.99) continue;
          v.fromBufferAttribute(pos, i);
          m.localToWorld(v);
          zs += v.z; nz++;
        }
      });
      if (nz) pz = zs / nz;
      const ry = 0.9;
      const head = { x: Math.sin(napFacing(ry)), z: Math.cos(napFacing(ry)) };
      const pil = pz != null && { x: Math.sin(ry) * pz, z: Math.cos(ry) * pz };   // the pillow, turned ry
      const sleeper = { ...fakePlayer(3), hp: 50, maxHp: 100 };
      sleeper.position.set(5, 0, 7);
      A.start(sleeper, { act: 'nap', x: 1, z: 2, y: 0, ry, isle, home });
      ok('a nap lies her on the futon\'s middle, facing its pillow',
        !!pil && sleeper.position.x === 1 && sleeper.position.z === 2 && head.x * pil.x + head.z * pil.z > 1 && Math.abs(sleeper.facing - napFacing(ry)) < 1e-9,
        `pillow at ${pz}`);
      for (let k = 0; k < 60; k++) A.update(0.1, [...ps, sleeper]);
      ok('...and she gets up where she lay down from', sleeper.position.x === 5 && sleeper.position.z === 7);
      const psrc2 = readFileSync(new URL('../../src/entities/player.js', import.meta.url), 'utf8');
      ok('...and the futon drawing is a mirroring billboard turned with her', /mirror: key !== 'bathPose'/.test(psrc2) && /else \{\s*pose\.facing = this\.facing;/.test(psrc2));
    }
    /* THE MEAL. "the message should say something like 'Set the table with
       the food' ... the plate of food appears on the table ... a plate of
       food for every player that will sit at the table ... 'Are you sure you
       want to eat with everyone at the table?' ... everyone sitting at or
       near the table sits down and does the 'itadakimasu' prayer". */
    const kitchen = { act: 'cook', x: 0, z: 0, y: 0, isle, home };
    const table = { act: 'sit', item: 'kotatsu', x: 0, z: 0, y: 0, isle, home, room: 'r', k: 0 };
    const key = A.tableKey(table);
    A.start(ps[0], kitchen);
    ok('cooking says a cooking mini-game is coming', /mini-game is coming/.test(toasts.at(-1)?.[1] ?? ''));
    /* "They should be able to return it to the cooking table" — INTERACT at
       the kitchen with a plate up puts it back, and says so. */
    A.start(ps[0], kitchen);
    ok('one plate each — the kitchen with a plate over her head takes it BACK, and says so',
      !A._plates.has(0) && /puts the plate back/.test(toasts.at(-1)?.[1] ?? ''));
    A.start(ps[0], kitchen);
    const hsrc2 = readFileSync(new URL('../../src/systems/housing/housing.js', import.meta.url), 'utf8');
    ok('...(its words: SET THE TABLE WITH THE FOOD, then EAT TOGETHER)', /SET THE TABLE WITH THE FOOD/.test(hsrc2) && /EAT TOGETHER/.test(hsrc2));
    A.start(ps[2], kitchen);
    A.start(ps[0], table);
    ok('a plate brought to the table is SET on it, not sat with', A.platesOn(key) === 1 && !A.holds(0) && !A._plates.has(0)
      && /sets the table/.test(toasts.at(-1)?.[1] ?? ''));
    A.start(ps[2], table);
    ok('...two plates, two places', A.platesOn(key) === 2 && !A.meals.size);
    A.start(ps[0], table);
    ok('...and INTERACT with food on the table asks first, on her card', game.housingCards.st.get(0)?.stack[0]?.v === 'meal');
    const MV = game.housingCards._view(0);
    ok('...NO first, and YES says what it does', /^NO/.test(MV.rows[0].title) && /EAT/.test(MV.rows[1].title) && /eat with everyone/i.test(MV.head + MV.body));
    ok('...three kittens and two plates: YES is greyed and says to cook one more',
      MV.rows[1].disabled && /3 of you and 2 plates — cook 1 more/.test(MV.rows[1].why));
    game.housingCards.st.delete(0);
    ps[1].position.set(30, 0, 0);
    ok('...a sister who walks off is not counted', A.dinersAt(key, 0).length === 2 && !A.mealWhy(key, 0));
    A.startMeal(key, 0);
    ok('YES: everybody at the table sits down, held', A.holds(0) && A.holds(2) && A.meals.size === 1 && !A.holds(1));
    for (let k = 0; k < 100; k++) A.update(0.1, ps);
    ok('...and the plates they ate from are gone', A.platesOn(key) === 0);
    /* A FULL TABLE AND A PLATE IN HER PAWS: she is not stuck with it. Four set,
       a fifth carried — INTERACT at the table asks about the meal like an
       empty-handed press, and the kitchen still takes the plate back. */
    {
      const t2 = { ...table, k: 9, x: 6 };
      const key2 = A.tableKey(t2);
      for (let k = 0; k < 4; k++) { A._plates.set(2, A._plateMesh()); A._setPlate(ps[2], t2); }
      A._plates.set(2, A._plateMesh());
      game.housingCards.st.delete(2);
      A.start(ps[2], t2);
      const asked = game.housingCards.st.get(2)?.stack[0]?.v === 'meal';
      ok('a plate brought to a FULL table: she is told, and asked to eat rather than refused for ever',
        A.platesOn(key2) === 4 && asked && toasts.some(([, t]) => /table is full .* back to the KITCHEN/.test(t)),
        `${A.platesOn(key2)} ${asked}`);
      game.housingCards.st.delete(2);
      A.start(ps[2], kitchen);
      ok('...and the kitchen takes it back', !A._plates.has(2));
      /* "When table is sold, or maybe moved, any plates on the table need to
         be removed so they are not floating in the air." Its spot gone from
         the isle (sold, or moved somewhere else): the plates leave the scene. */
      const plates = [...A.tables.get(key2).plates];
      const keep = isle.spots;
      isle.spots = keep.filter((q) => q.k !== 9);
      A.update(0.1, ps);
      ok('a SOLD table takes its plates with it â€” none left hanging in the scene',
        !A.tables.has(key2) && plates.every((m) => !m.parent), `${A.tables.has(key2)} ${plates.filter((m) => m.parent).length}`);
      // ...a lower item sold closes the list up: same place, new index â€” re-keyed, not cleared
      for (let k = 0; k < 2; k++) { A._plates.set(2, A._plateMesh()); A._setPlate(ps[2], { ...table, k: 5, x: -6 }); }
      isle.spots = [...keep, { act: 'sit', item: 'kotatsu', x: -6, z: 0, room: 'r', k: 4 }];
      A.update(0.1, ps);
      ok('...but a table that only changed its INDEX keeps its plates, under the new key',
        A.platesOn(A.tableKey({ ...table, k: 4 })) === 2 && !A.tables.has(A.tableKey({ ...table, k: 5 })));
      const moved = [...A.tables.get(A.tableKey({ ...table, k: 4 })).plates];
      isle.spots = [...keep, { act: 'sit', item: 'kotatsu', x: -3, z: 0, room: 'r', k: 4 }];
      A.update(0.1, ps);
      ok('...and a MOVED one leaves no plates where it stood', moved.every((m) => !m.parent) && !A.tables.has(A.tableKey({ ...table, k: 4 })));
      isle.spots = keep;
    }
    ps[1].position.set(0, 0, 0);
    ok('...pray ITADAKIMASU, eat, and each gets the two-diner green',
      !A.holds(0) && !A.holds(2) && H.store.boons[ps[0].name]?.meal === 10 && H.store.boons[ps[2].name]?.meal === 10
      && toasts.some(([, t]) => /ITADAKIMASU/.test(t)));
    const noTable = { act: 'cook', x: 0, z: 0, y: 0, isle: { spots: [] }, home };
    A.start(ps[1], noTable);
    ok('a kitchen with no kotatsu says what to buy rather than doing nothing', /KOTATSU/.test(toasts.at(-1)?.[1] ?? ''));
    game.tournament = { state: 'card' };
    A.start(ps[1], { act: 'soak', x: 0, z: 0, y: 0, isle, home });
    A.update(0.1, ps);
    ok('a battle starting lets go of every kitten held at home', !A.holds(1) && !ps[1].homePose);
    game.tournament = null;
    game.players = [];
    H.store.boons = {};
  }

  /* ROSHI'S TOUR: LOOK, THEN FLY. "The camera looks, then flies, 2–3 seconds,
     slower", and "the minimap zooms out and highlights the island". */
  {
    /* THE LENS, MEASURED IN THE FRAME. "Always keeping the island in the
       center of the screen regardless of the splitscreen the player is on":
       the island's centre is projected through the camera the lens posed and
       must land in the middle of the pane, wide or narrow. */
    const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 5000);
    const pose = (aspect = 16 / 9) => {
      cam.aspect = aspect;
      cam.position.set(0, 20, 60);
      cam.lookAt(0, 0, 0);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      H.tourLens(cam, [0]);
      cam.updateMatrixWorld();
    };
    const ndc = (I) => new THREE.Vector3(I.x, I.groundY + 6, I.z).project(cam);
    const centred = (I) => { const v = ndc(I); return Math.hypot(v.x, v.y) < 0.02 && v.z < 1; };
    H.browsing.clear();
    H.lens.clear();
    H.browse(0, HOME_SITES[0].id);
    pose();
    const L = H.lens.get(0);
    L.k = 1;
    const eyeStart = L.eye.clone();
    const b0 = H.browsing.get(0);
    b0.ft = TOUR.look * 0.5;
    H._updateLens(0);
    pose();
    ok('the first island is TURNED TO from where the camera already is: it does not move, it looks',
      L.eye.distanceTo(eyeStart) < 1e-6 && !centred(H.isles[0]));
    b0.ft = TOUR.look + TOUR.fly + 1;
    H._updateLens(0);
    pose();
    const I0 = H.isleOf(HOME_SITES[0].id);
    ok('...and once there, the island is in the middle of the frame', centred(I0), JSON.stringify(ndc(I0)));
    H.browse(0, HOME_SITES[1].id);
    const b = H.browsing.get(0);
    const I1 = H.isleOf(HOME_SITES[1].id);
    b.ft = 0;
    H._updateLens(0);
    const eye0 = L.eye.clone();
    b.ft = TOUR.look * 0.5;
    H._updateLens(0);
    pose();
    ok('a new island is LOOKED AT first: the eye stays put while the view turns',
      L.eye.distanceTo(eye0) < 1e-6 && !centred(I1) && !centred(I0));
    for (const u of [0.01, 0.25, 0.5, 0.75, 1]) {
      b.ft = TOUR.look + TOUR.fly * u;
      H._updateLens(0);
      pose();
      if (!centred(I1)) { ok(`...then FLIES with the island dead centre the whole way (u=${u})`, false, JSON.stringify(ndc(I1))); break; }
      if (u === 1) ok('...then FLIES with the island dead centre the whole way', true);
    }
    b.ft = TOUR.look + TOUR.fly * 0.5;
    H._updateLens(0);
    const midEye = L.eye.clone();
    ok('...travelling: halfway through, the eye is well away from where it set off',
      midEye.distanceTo(eye0) > 20);
    ok('...over two to three seconds', TOUR.fly >= 2 && TOUR.fly <= 3);
    b.ft = TOUR.look + TOUR.fly + 3;
    H._updateLens(0);
    pose(0.55);
    ok('...and in a narrow column of split screen it is centred too', centred(I1), JSON.stringify(ndc(I1)));
    /* A SISTER IN THE SAME PANE WATCHES. "Instead of going to splitscreen,
       the UI should take up the entire screen and all the players can see". */
    const wasGroups = game.groups;
    const two = [fakePlayer(0), fakePlayer(1)];
    game.players = two;
    game.groups = [[0, 1]];
    H.startWatch(0);
    ok('opening Roshi with a sister in the pane makes her a WATCHER, in the same lane',
      H.watching(1) && !H.watching(0) && H.watchLane(0) === H.watchLane(1) && H.watchLane(0) != null);
    ok('...and she is told how to get back to playing', toasts.some(([i, t]) => i === 1 && /INTERACT to go back/.test(t)));
    H.unwatch(1);
    ok('...and BACK lets her go: no lane, so the screen splits again', !H.watching(1) && H.watchLane(0) == null && H.watchLane(1) == null);
    H.startWatch(0);
    H.endWatch(0);
    ok('...and when the card closes nobody is left watching', !H.watching(1));
    const msrc2 = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
    ok('...wired: a watcher\'s pad is dead, the counter keeps her pane, and the lens is laid over every pane',
      /this\.housing\?\.watching\(i\)( \|\| this\.housing\?\.kendoHolds\?\.\(i\))?\)\s*\n?\s*\? DEAD_PAD/.test(msrc2)
      && /lanes: this\._snakeLanes\(\)\.map\(\(l, i\) => this\.housing\?\.watchLane\(i\) \?\? l\)/.test(msrc2)
      && /this\.housing\?\.tourLens\(camera, members\)/.test(msrc2));
    game.groups = wasGroups;
    game.players = [];
    b.t = 0;
    const m0 = H.tourMap([0]);
    b.t = TOUR.mapIn;
    const m1 = H.tourMap([0]);
    ok('the minimap zooms out over the tour, and rings only the island on the cursor',
      m0.k === 0 && m1.k === 1 && m1.sites.length === HOME_SITES.length
      && m1.sites.filter((s) => s.hl).map((s) => s.name).join() === HOME_SITES[1].name);
    ok('...and nobody touring is no tour', H.tourMap([1, 2]) === null);
    const msrc = readFileSync(new URL('../../src/systems/minimap.js', import.meta.url), 'utf8');
    ok('...and the map puts its own box and zoom back after drawing it',
      /finally \{\s*this\.bounds = keepB;\s*this\.zoom = keepZ;/.test(msrc));
    H.browsing.clear();
  }

  /* HER STATUE, SHIPPED. The raw Tripo takes were 14MB and 460k triangles and
     faced +x; what is in public/ must be the shrunk, turned, stone one. Read
     off the files, because "it was run once" is not the same as "it is what
     is on disk". */
  {
    const rows = ['ember', 'frost'].map((s) => {
      const f = new URL(`../../public/models/statues/${s}.glb`, import.meta.url);
      if (!existsSync(f)) return { s, missing: true };
      const b = readFileSync(f);
      const j = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'));
      const prim = j.meshes[0].primitives[0];
      return { s, mb: b.length / 1e6, tris: j.accessors[prim.indices].count / 3, gen: j.asset?.generator };
    }).filter((r) => !r.missing);
    ok('a generated statue on disk is the shrunk one: under 2MB, under 40k triangles, written by statue-shrink',
      rows.every((r) => r.mb < 2 && r.tris < 40000 && /statue-shrink/.test(r.gen ?? '')),
      rows.map((r) => `${r.s} ${r.mb.toFixed(2)}MB ${r.tris} tris`).join(', ') || 'none on disk (drawn statue)');
    const ssrc = readFileSync(new URL('../../tools/capture/statue-shrink.mjs', import.meta.url), 'utf8');
    ok('...turned by a MEASURED yaw per take', /STATUE_YAW = \{ ember: -90, frost: -90 \}/.test(ssrc));
    const stsrc = readFileSync(new URL('../../src/systems/housing/statue.js', import.meta.url), 'utf8');
    ok('...standing on its own plinth, since the drawn one is hidden when it arrives', /out\.add\(new THREE\.Mesh\(pl, toonVertexMat\(\)\)\)/.test(stsrc));
  }

  /* THE TROPHY SHELF counts arena wins by name, shared by a home's owners. */
  {
    const before = H.store.records.cups ? { ...H.store.records.cups } : null;
    H.store.records.cups = {};
    H.battleWon(['Ember']);
    H.battleWon(['Ember', 'Frost']);
    ok('an arena win is a cup on her shelf, and a castle shelf holds every owner\'s',
      H.cupsOf({ owners: ['Ember'] }) === 2 && H.cupsOf({ owners: ['Ember', 'Frost'] }) === 3);
    const tsrc = readFileSync(new URL('../../src/systems/tournament.js', import.meta.url), 'utf8');
    ok('...and the tournament hands its winners over', /housing\?\.battleWon\?\.\(this\.winners/.test(tsrc));
    H.store.records.cups = before ?? {};
  }

  /* THE BOOMBOX PREVIEWS. "the music should be playing so the player can
     preview the songs ... turn off once the player leaves the menu". */
  {
    H.musicSite = null;
    H.audition = { id: JUKEBOX[2].id, who: 0 };
    const heard = H.musicTrack();
    ok('browsing the boombox plays the row under the cursor, even off the bridge',
      heard === previewOf(JUKEBOX[2].id) || heard === JUKEBOX[2].fallback, heard);
    /* ...FROM WHERE THE MUSIC IS. "there is just silence at the beginning of
       the song, can we skip to further in the song". The same file, `first`
       seconds in, and only while it is being auditioned. */
    const pv = Object.entries(PREVIEW_AT).filter(([id]) => JUKEBOX_FILES[id]);
    ok('...a quiet-opening track previews from its measured start, the same file and loop',
      pv.length >= 2 && pv.every(([id, at]) => {
        const P = MUSIC_FILES[previewOf(id)];
        return previewOf(id) !== id && P.first === at && P.file === JUKEBOX_FILES[id].file && P.loop[1] === JUKEBOX_FILES[id].loop[1] && at < P.length;
      }));
    H.audition = null;
    H.musicSite = HOME_SITES[0].id;
    H.store.jukebox[HOME_SITES[0].id] = 'homeFestival';
    ok('...and choosing it plays it from the top on the island', H.musicTrack() === 'homeFestival' || H.musicTrack() === JUKEBOX_BY_ID.homeFestival.fallback);
    H.musicSite = null;
    delete H.store.jukebox[HOME_SITES[0].id];
    ok('...and nothing once the card is gone', H.musicTrack() === null);
  }

  /* MUSIC: the recording when it is in the build, and with it taken out
     the procedural stand-in, never silence. Taken out of the table the game
     reads, rather than asserted of whatever happens to be on disk, so this
     cannot pass by there being no recordings at all. */
  H.musicSite = 'sunrise';
  const t = H.musicTrack();
  const rec = JUKEBOX.find((j) => j.id === t || j.fallback === t);
  ok('the jukebox plays its recording when it is in the build', !!rec && (t === rec.id) === !!JUKEBOX_FILES[rec.id], t);
  const kept = JUKEBOX_FILES[rec?.id];
  delete JUKEBOX_FILES[rec?.id];
  const t2 = H.musicTrack();
  if (kept) JUKEBOX_FILES[rec.id] = kept;
  ok('...and a procedural piece when it is not', t2 === rec?.fallback, t2);
  ok('...and every recording in the table is a jukebox or an activity track with a loop', Object.entries(JUKEBOX_FILES).every(([id, F]) =>
    [...JUKEBOX, ...ACTIVITY_MUSIC].some((j) => j.id === id) && F.loop?.[1] > F.loop?.[0] && F.mix > 0), Object.keys(JUKEBOX_FILES).join(' '));
  /* WHAT SHE IS DOING HAS ITS OWN SONG. "Add music for the onsen, for
     fishing, and for any other activity the player can do for 15s or more."
     Each one set up for real on this island, then asked: its song while it
     is going on, the procedural stand-in with the mp3 gone, the boombox back
     once it stops, and the hop-along game left alone (its rhythm is hers to
     copy). Highest first: a kendo match over all of them. */
  {
    const site = 'sunrise';
    const Ia = H.isles.find((J) => J.site.id === site);
    /* An onsen's spot where the island's middle is, if this home has none
       built: it passed vacuously without one, which is no check at all. */
    let soak = Ia.spots.find((s) => s.act === 'soak');
    const added = !soak && { act: 'soak', x: Ia.x, z: Ia.z, y: Ia.groundY, r: 3 };
    if (added) { Ia.spots.push(added); soak = added; }
    const keep = { bouts: H.kendo.bouts, lineOf: H.angling.lineOf, playing: H.pets.playing, players: game.players, aud: game.audio };
    const kit = fakePlayer(0, Ia.x + Ia.radius * 3, Ia.z, 0);
    game.players = [kit];
    const none = H.activityNow(site);
    const asked = {};
    H.angling.lineOf = (i) => (i === 0 ? { site } : null);
    asked.fishing = H.activityNow(site)?.act;
    H.angling.lineOf = keep.lineOf;
    H.pets.playing = (i) => (i === 0 ? { site, kind: 'fetch' } : null);
    asked.pets = H.activityNow(site)?.act;
    H.pets.playing = (i) => (i === 0 ? { site, kind: 'hop' } : null);
    asked.hop = H.activityNow(site)?.act ?? null;
    H.pets.playing = keep.playing;
    if (soak) kit.position.set(soak.x, soak.y, soak.z);
    asked.onsen = H.activityNow(site)?.act ?? null;
    H.kendo.bouts = new Map([['k', { key: `${site}:room1` }]]);
    asked.kendo = H.activityNow(site)?.act;
    const songKendo = H.activityTrack(site);
    game.audio = { fileMissing: () => true };
    const standIn = H.activityTrack(site);
    game.audio = keep.aud;
    H.kendo.bouts = keep.bouts;
    kit.position.set(Ia.x + Ia.radius * 3, 0, Ia.z);
    const after = H.activityNow(site);
    game.players = keep.players;
    if (added) Ia.spots.splice(Ia.spots.indexOf(added), 1);
    ok('each activity has its song: fishing, pet play, the onsen, and a kendo match over all of them',
      !none && asked.fishing === 'fishing' && asked.pets === 'pets' && asked.hop === null
      && asked.onsen === 'onsen' && asked.kendo === 'kendo' && !after, JSON.stringify(asked));
    const K = ACTIVITY_MUSIC.find((T) => T.act === 'kendo');
    ok('...the recording when it is in the build, and its procedural stand-in when it is not, never silence',
      songKendo === (JUKEBOX_FILES[K.id] ? K.id : K.fallback) && standIn === K.fallback
      && ACTIVITY_MUSIC.every((T) => JUKEBOX.some((j) => j.fallback === T.fallback)), `${songKendo} / ${standIn}`);
    const hsrc9 = readFileSync(new URL('../../src/systems/housing/housing.js', import.meta.url), 'utf8');
    ok('...and it outranks the boombox but not the prayer, the tea, or a sister auditioning a song',
      /if \(prayer\) return prayer;[\s\S]{0,400}!this\.audition && this\.musicSite \? this\.activityTrack/.test(hsrc9));
  }
  /* ...AND IT LOOPS THE WHOLE ARRANGEMENT, ending and all. Richard: the takes
     loop "2 or 3 times before reaching the end and looping it all over
     again". A loop region inside the file never reaches the ending; this pins
     that the loop is the file, start (its priming) to finish. */
  ok('...and each one loops the WHOLE arranged file, so its ending is heard', Object.values(JUKEBOX_FILES).every((F) =>
    F.loop[0] < 0.1 && Math.abs(F.loop[1] - F.loop[0] - F.length) < 0.01),
  Object.entries(JUKEBOX_FILES).map(([id, F]) => `${id} ${F.loop.join('-')}/${F.length}`).join(' '));
  ok('...and every arranged take that was cut off plays its loop more than once', Object.values(JUKEBOX_FILES).every((F) =>
    F.arranged === 'whole' || F.length > 90), Object.values(JUKEBOX_FILES).map((F) => `${F.name}:${F.length}`).join(' '));

  /* FISHING: the deep end is where the big ones are. */
  let deep = 0;
  let shallow = 0;
  for (let k = 0; k < 400; k++) { deep += rollFish(1).lb; shallow += rollFish(0).lb; }
  ok('a long cast catches bigger fish than a short one, on average', deep > shallow * 2, `${(deep / 400).toFixed(1)} vs ${(shallow / 400).toFixed(1)}`);
  ok('a short cast can only catch the shallow kinds', Array.from({ length: 50 }, () => rollFish(0).fish).every((f) => f.depth <= 0.05));

  /* THE GATE. */
  const msrc = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
  ok('strikePlayers still asks Tournament.fighting first, and only kendo answers otherwise — with no damage',
    /strikePlayers\(attacker, kind, reach, dir, spent = null\) \{[\s\S]{0,700}?if \(!this\.tournament\?\.fighting\) \{\s*this\.housing\?\.kendo\?\.sparStrike\(attacker, kind, dir\);\s*return;\s*\}/.test(msrc));
  const ksrc = readFileSync(new URL('../../src/systems/housing/kendo.js', import.meta.url), 'utf8');
  ok('...and the kendo strike never calls hurt', !/\.hurt\(/.test(ksrc));

  /* FISHING IN THE WORLD. "Make it 3D and make it that you can see the fish
     in the pond ... player equips a fishing pole nearby, then when attacking
     with the fishing pole, then they cast and the longer they hold it, the
     further it goes. We can also make the pond bigger." Driven through the
     real Angling with a pad whose buttons the check holds. */
  {
    const near = castPoint(0, 0, 0, 0, 10).d;
    const mid = castPoint(0, 0, 0, 0.5, 10).d;
    const far = castPoint(0, 0, 0, 1, 10).d;
    ok('the longer she holds ATTACK, the further the cast goes — out past the middle of the pond',
      near < mid && mid < far && far > 10, `${near.toFixed(1)} < ${mid.toFixed(1)} < ${far.toFixed(1)}`);
    ok('...and the pond is bigger than it was (r 12, against 10)', ITEM_BY_ID.koipond.r >= 12);

    const I = H.isles[3];
    const Hm = newHome(I.site.id, 'minka', ['Ember']);
    const spot = firstYardSpot(Hm, ITEM_BY_ID.koipond, I.radius);
    addOutdoor(Hm, 'koipond', spot.x, spot.z, 0);
    I.setHome(Hm, null);
    const A = H.angling;
    A.sync();
    const v = A.ponds.get(I.site.id);
    const ids = new Set(FISH.map((f) => f.id));
    ok('the pond has its wild fish, IN the water, each a real roll of the fish table',
      v && v.fish.length === fishCount(I.site.id)
      && v.fish.every((f) => Math.hypot(f.x - v.P.x, f.z - v.P.z) < v.wr && ids.has(f.roll.fish.id) && f.mesh.parent === v.group),
      v ? `${v.fish.length} fish` : 'no pond');
    ok('...drawn bigger the heavier they are, so the big one can be SEEN and aimed at', fishLen(20) > fishLen(1) * 2);
    ok('...and the deep kinds only out in the deep middle',
      v.fish.every((f) => f.roll.fish.depth <= 1 - Math.hypot(f.x - v.P.x, f.z - v.P.z) / (v.wr * 0.85) + 0.05 + 0.15));
    ok('the rod stand is on her bank, on the island', Math.abs(Math.hypot(v.stand.x - v.P.x, v.stand.z - v.P.z) - (v.P.r - 0.2)) < 1e-6
      && I.over(v.stand.x, v.stand.z));

    const kit = fakePlayer(0);
    kit.facing = 0;
    game.players = [kit];
    kit.position.set(v.stand.x, v.stand.y, v.stand.z);
    ok('at the stand she is offered a rod', /PICK UP A FISHING ROD/.test(H.prompt(kit, 'E') ?? ''));
    H.interact(kit);
    ok('...and ACTION gives her one, and her callout is the rod\'s', A.holding(0) && /HOLD ATTACK TO CAST/.test(H.prompt(kit, 'E') ?? ''));
    const S = { down: false, prev: false, mx: 0 };
    const pad = {
      get mx() { return S.mx; }, my: 0,
      down: (a) => (a === 'attack' ? S.down : false),
      pressed: (a) => (a === 'attack' ? S.down && !S.prev : false),
    };
    const frame = () => { const out = A.padFor(0, pad); A.update(1 / 30, [kit]); S.prev = S.down; return out; };
    S.down = true;
    const held = frame();
    ok('with a rod, ATTACK is the rod\'s — the katana never sees it', held.pressed('attack') === false && held.down('attack') === false);
    // Aim at a fish: turn to it and wind up just far enough.
    const L = A.lineOf(0);
    const f = v.fish[0];
    kit.position.set(v.P.x + (v.wr + 1) , v.stand.y, v.P.z);
    f.x = v.P.x + 2; f.z = v.P.z; f.shyT = 0;
    kit.facing = Math.atan2(f.x - kit.position.x, f.z - kit.position.z);
    const want = (Math.hypot(f.x - kit.position.x, f.z - kit.position.z) - 1.6) / (v.wr * 1.5);
    let n = 0;
    while (L.k < want && n++ < 90) frame();
    ok('...holding it winds the cast up, and she stands still while it does', L.phase === 'charge' && frame().mx === 0);
    // Where she is aiming at the moment she lets go. Not the fish: it swims on
    // through the wind-up and the flight (0.82 off, measured), as fish do.
    const aim = castPoint(kit.position.x, kit.position.z, kit.facing, L.k, v.wr);
    S.down = false;
    for (let k = 0; k < 20; k++) frame();
    ok('let go, and the lure lands where she aimed — in the water, out by the fish',
      L.phase === 'wait' && Math.hypot(L.to.x - aim.x, L.to.z - aim.z) < 0.2 && Math.hypot(aim.x - f.x, aim.z - f.z) < 2.5,
      `${L.phase} ${Math.hypot(L.to.x - aim.x, L.to.z - aim.z).toFixed(2)} from the aim, ${Math.hypot(aim.x - f.x, aim.z - f.z).toFixed(2)} from the fish`);
    S.mx = 0.6;
    n = 0;
    while (L.phase === 'wait' && n++ < 600) frame();
    S.mx = 0;
    ok('a gentle twitch brings a fish to it, and it BITES', L.phase === 'bite' && !!L.fish, `${L.phase} after ${n}`);
    const caught = L.fish;
    const before = kit.score;
    S.down = true;
    frame();
    ok('...ATTACK in the window sets the hook', L.phase === 'reel' && caught.hooked);
    n = 0;
    while (L.phase === 'reel' && n++ < 1800) { S.down = L.tension < 0.7; frame(); }
    S.down = false;
    frame();
    const rec = H.store.records?.fish?.[caught.roll.fish.id];
    ok('reeled in carefully, she LANDS it: paid, and on the record board',
      L.phase === 'idle' && kit.score > before && rec?.who === 'Ember' && !v.fish.includes(caught), `${L.phase} +${kit.score - before}`);
    const count = v.fish.length;
    for (let k = 0; k < 30 * (ANGLE.respawn + 1); k++) A.update(1 / 30, [kit]);
    ok('...and another wild fish comes to take its place', v.fish.length === count + 1);
    // A snap loses nothing: the fish swims off and is still in the pond.
    const g2 = v.fish[1];
    g2.x = v.P.x + 2; g2.z = v.P.z; g2.shyT = 0;
    L.phase = 'reel'; L.fish = g2; g2.hooked = true; L.dist = 1; L.tension = 0.2; L.t = 0; L.to = { x: g2.x, z: g2.z };
    S.down = true;
    n = 0;
    while (L.phase === 'reel' && n++ < 600) frame();
    S.down = false;
    frame();
    ok('reeled against the pull, the line SNAPS — and the fish is still in the pond', L.phase === 'idle' && v.fish.includes(g2) && !g2.hooked);
    const n0 = toasts.length;
    kit.position.set(v.P.x + v.wr + ANGLE.leave + 2, v.stand.y, v.P.z);
    frame();
    ok('walking away from the pond puts the rod back, and says so',
      !A.holding(0) && toasts.slice(n0).some(([i, t]) => i === 0 && /rod goes back/.test(t)));
    const asrc = readFileSync(new URL('../../src/systems/housing/angling.js', import.meta.url), 'utf8');
    ok('...and nothing in the fishing can reach a blow: no strikePlayers, no hurt', !/strikePlayers\(|\.hurt\(/.test(asrc));
    game.players = [];
    I.setHome(null);
    A.sync();
  }

  /* PLAYING WITH THE ANIMALS. "More to do than just feed them": a mess to
     clean, a walk, fetch, catching the bird (higher as it grows, until it
     takes 3 or 4 jumps), hopping in time with the rabbit, growing up, and a
     boost she is TOLD about. Pure parts first, then the real PetPlay. */
  {
    ok('an animal grows a level every few happy times, to four, and never back',
      petLevel({}) === 1 && petLevel({ joy: PLAY.joyPerLevel }) === 2 && petLevel({ joy: 99 }) === 4);
    const none = petBoost(null);
    ok('no pen is no boost at all — a kitten with no home plays exactly as before', none.jump === 1 && none.air === 1 && none.speed === 1 && !none.lines.length);
    const grown = petBoost({ animals: [{ kind: 'chick', joy: 99 }, { kind: 'bunny', joy: 0 }, { kind: 'goat', joy: PLAY.joyPerLevel }] });
    ok('...a grown animal boosts its own ability, and the boost has a NAME',
      grown.jump > 1 && grown.air === 1 && grown.speed > 1 && grown.lines.join() === `JUMP HEIGHT +${Math.round(((1 + 3 * PLAY.boostPerLevel.chick) ** 2 - 1) * 100)}%,SPRINT +${Math.round(PLAY.boostPerLevel.goat * 100)}%`,
      grown.lines.join());
    const now0 = Date.now();
    ok('the pen makes a mess on the real clock: a pile per stretch of time, three at most', messesAt({ cleaned: now0 - PLAY.messEvery * 1.5 }, now0) === 1 && messesAt({ cleaned: now0 - PLAY.messEvery * 99 }, now0) === PLAY.messMax
      && messesAt({ cleaned: now0 }, now0) === 0);
    ok('the bunny game scores the RHYTHM, not when she started',
      rhythmError([0, 0.5, 0.8, 1.4], [2, 2.5, 2.8, 3.4]) < 1e-9 && rhythmError([0, 0.5, 0.8, 1.4], [0, 0.9, 1.0, 1.4]) > PLAY.hopTol
      && rhythmError([0, 0.5], [0]) === Infinity);
    const psrc = readFileSync(new URL('../../src/entities/player.js', import.meta.url), 'utf8');
    ok('...and the boosts reach her: sprint, air, jump', /sprinting \? this\.petBoost\?\.speed/.test(psrc) && /this\.onGround \? 1 : this\.petBoost\?\.air/.test(psrc)
      && /\* \(this\.petBoost\?\.jump \?\? 1\)/.test(psrc));

    const I = H.isles[1];
    const Hm = newHome(I.site.id, 'minka', ['Ember']);
    const at = firstYardSpot(Hm, ITEM_BY_ID.pen, I.radius);
    addOutdoor(Hm, 'pen', at.x, at.z, 0);
    I.setHome(Hm, null);
    /* Hers is the ONLY home while this runs: an earlier block leaves Ember a
       house on sunrise, and `homeOf` answers with the first one it finds, so
       her boost was read off a pen-less house and came out as nothing. */
    const keptHomes = { ...H.store.homes };
    for (const k of Object.keys(H.store.homes)) delete H.store.homes[k];
    H.store.homes[I.site.id] = Hm;
    H.farm.sync();
    H.pets.sync();
    const v0P = I.placeOf('pen');
    const P = H.pets;
    // Before a single frame: an animal grown mid-walk is redrawn by a sync,
    // and a game started in that frame took it from the origin.
    ok('a pen that has just been drawn has its animals IN it, not at the origin',
      H.farm.views.get(I.site.id).animals.every((g) => Math.hypot(g.position.x - v0P.x, g.position.z - v0P.z) < v0P.r));
    const v = P.views.get(I.site.id);
    const kit = fakePlayer(0);
    kit.facing = 0;
    kit.maxJumps = 2;
    game.players = [kit];
    const pen = Hm.pen;
    const joy = () => pen.animals.map((A) => A.joy ?? 0);
    // THE MESS
    pen.cleaned = Date.now() - PLAY.messEvery * 2.5;
    P.update(0.1, [kit]);
    ok('two piles show after two lots of real time', v.piles.filter((q) => q.m.visible).length === 2);
    kit.position.set(v.piles[0].x, v.piles[0].y, v.piles[0].z);
    ok('...standing at one, ACTION offers to clean it', /CLEAN UP THE MESS/.test(H.prompt(kit, 'E') ?? ''));
    const j0 = joy();
    H.interact(kit);
    P.update(0.1, [kit]);
    ok('...cleaning one leaves the other', messesAt(pen) === 1 && v.piles.filter((q) => q.m.visible).length === 1 && joy().join() === j0.join());
    H.interact(kit);
    ok('...and the last one makes every animal happier', messesAt(pen) === 0 && joy().every((n, k) => n === j0[k] + 1));
    // THE WALK
    const step = (n, dx = 1) => { for (let k = 0; k < n; k++) { kit.position.x += dx; P.update(1 / 30, [kit]); } };
    kit.position.set(v.P.x, v.P.y, v.P.z);
    ok('a walk takes the chick out of the pen', P.start(kit, Hm, 'walk', 'chick') && P.isOut(pen.animals.find((A) => A.kind === 'chick')));
    const jw = pen.animals.find((A) => A.kind === 'chick').joy ?? 0;
    for (let k = 0; k < PLAY.walk / 3 + 2; k++) { step(3, 0); kit.position.x += (k % 6 < 3 ? 3 : -3); P.update(1 / 30, [kit]); }
    const S = P.playing(0);
    ok('...it follows her, and a long enough walk makes it happier',
      (pen.animals.find((A) => A.kind === 'chick').joy ?? 0) === jw + 1 && Math.hypot(S.pos.x - kit.position.x, S.pos.z - kit.position.z) < 4,
      `joy ${jw} -> ${pen.animals.find((A) => A.kind === 'chick').joy}, ${Math.hypot(S.pos.x - kit.position.x, S.pos.z - kit.position.z).toFixed(1)} away, walked ${S.walked.toFixed(0)}`);
    const n0 = toasts.length;
    kit.position.set(I.x + I.radius + 30, v.P.y, I.z);
    P.update(1 / 30, [kit]);
    ok('...and off her island it trots home, and says so', !P.playing(0) && toasts.slice(n0).some(([i, t]) => i === 0 && /trotted home/.test(t)));
    // FETCH
    kit.position.set(v.P.x, v.P.y, v.P.z);
    // Throw toward the middle of the island, so a long throw stays on it.
    kit.facing = Math.atan2(I.x - kit.position.x, I.z - kit.position.z);
    P.start(kit, Hm, 'fetch', 'goat');
    const F = P.playing(0);
    const Sd = { down: false, prev: false };
    const pad = { mx: 0, my: 0, down: (a) => (a === 'attack' ? Sd.down : false), pressed: (a) => (a === 'attack' ? Sd.down && !Sd.prev : false) };
    const fr = () => { const m = P.padFor(0, pad); P.update(1 / 30, [kit]); Sd.prev = Sd.down; return m; };
    const throwFor = (frames) => {
      Sd.down = true;
      for (let k = 0; k < frames; k++) fr();
      Sd.down = false;
      for (let k = 0; k < 400 && F.phase !== 'idle'; k++) fr();
      for (let k = 0; k < 3; k++) fr();
    };
    Sd.down = true;
    ok('with the stick, ATTACK is the stick\'s and never the katana\'s', fr().pressed('attack') === false);
    Sd.down = false;
    fr(); fr();
    let n1 = toasts.length;
    throwFor(1);
    ok('a short throw does not count, and she is told how far it wants to run',
      F.wins === 0 && toasts.slice(n1).some(([i, t]) => i === 0 && /throw it further/.test(t)), `goat joy ${pen.animals.find((A) => A.kind === 'goat').joy ?? 0}, ${F.wins} wins, ${toasts.slice(n1).map((t) => t[1]).join(' | ')}`);
    const jg = pen.animals.find((A) => A.kind === 'goat').joy ?? 0;
    n1 = toasts.length;
    for (let k = 0; k < PLAY.wins; k++) throwFor(30);
    ok(`...${PLAY.wins} long throws the goat has to RUN for make it happier`,
      (pen.animals.find((A) => A.kind === 'goat').joy ?? 0) === jg + 1, `joy ${jg} -> ${pen.animals.find((A) => A.kind === 'goat').joy}, ${toasts.slice(n1).map((t) => t[1]).join(' | ')}`);
    ok('...and when that grows it, the toast says WHICH ability it boosts',
      toasts.slice(n1).some(([i, t]) => i === 0 && /grew up/.test(t) && /SPRINT \+\d+%/.test(t)) && kit.petBoost?.speed > 1,
      `${JSON.stringify(kit.petBoost ?? null)} ${toasts.slice(n1).map((t) => t[1]).join(' | ')}`);
    P.stop(0, null);
    // CATCH: too high for her jumps, and refused in words
    const chick = pen.animals.find((A) => A.kind === 'chick');
    chick.joy = PLAY.joyPerLevel * 2;
    n1 = toasts.length;
    ok('a level-3 chick flies too high for two jumps, and she is told how many it takes',
      !P.start(kit, Hm, 'catch', 'chick') && toasts.slice(n1).some(([i, t]) => i === 0 && /takes 3 jumps, and you have 2/.test(t)));
    chick.joy = 0;
    ok('...a young one is catchable', P.start(kit, Hm, 'catch', 'chick'));
    const C = P.playing(0);
    const jc = chick.joy;
    for (let k = 0; k < PLAY.wins; k++) {
      for (let f = 0; f < 60; f++) P.update(1 / 30, [kit]);
      kit.position.set(C.pos.x, C.pos.y - 0.9, C.pos.z);
      P.update(1 / 30, [kit]);
    }
    ok(`...touching it ${PLAY.wins} times makes it happier, and it flies higher than a kitten stands`,
      chick.joy === jc + 1 && PLAY.chickH[0] > 1.2 && PLAY.chickH[3] > PLAY.chickH[2], `joy ${jc} -> ${chick.joy}, ${C.wins} wins`);
    P.stop(0, null);
    // HOP
    kit.position.set(v.P.x, v.P.y, v.P.z);
    P.start(kit, Hm, 'hop', 'bunny');
    const B = P.playing(0);
    for (let k = 0; k < 200 && B.phase === 'show'; k++) P.update(1 / 30, [kit]);
    const bunny = pen.animals.find((A) => A.kind === 'bunny');
    const jb = bunny.joy ?? 0;
    const jp = { mx: 0, my: 0, down: () => false, pressed: () => false };
    const beats = B.beats.map((b) => b + 0.4);
    let bi = 0;
    for (let k = 0; k < 200 && B.phase === 'copy'; k++) {
      const hit = bi < beats.length && B.t + 1 / 30 >= beats[bi];
      if (hit) bi++;
      P.padFor(0, { ...jp, pressed: (a) => a === 'jump' && hit });
      P.update(1 / 30, [kit]);
    }
    ok('hopping in the bunny\'s rhythm — late, but in time — makes it happier', (bunny.joy ?? 0) === jb + 1, `${bunny.joy}`);
    const real = P.padFor(0, jp);
    ok('...and the bunny game never takes her JUMP away: the pad is only watched', real === jp);
    P.stop(0, null);
    game.players = [];
    delete H.store.homes[I.site.id];
    Object.assign(H.store.homes, keptHomes);
    I.setHome(null);
    H.farm.sync();
    H.pets.sync();
  }

  /* THE HOLODECK, AT HOME. "Grab all 3 items to poof into their VR gear, then
     walk to the tube and press interact ... if they leave their island, they
     automatically remove the gear ... their equipment is automatically
     respawned where they grabbed it from." Against a stand-in Dream Dojo that
     records what it was asked to do; the crossing itself is the real
     DreamDojo's, and its source is read below. */
  {
    const fits = [];
    for (const h of HOUSES) {
      for (const room of h.rooms) {
        const L = holoLayout(room);
        const inside = [L.tube, ...L.racks].every((q) => Math.abs(q.x) <= room.w / 2 - 0.8 && Math.abs(q.z) <= room.d / 2 - 0.8);
        let gap = Infinity;
        for (let a = 0; a < L.racks.length; a++) {
          for (let b = a + 1; b < L.racks.length; b++) gap = Math.min(gap, Math.hypot(L.racks[a].x - L.racks[b].x, L.racks[a].z - L.racks[b].z));
        }
        const toTube = Math.min(...L.racks.map((r) => Math.hypot(r.x - L.tube.x, r.z - L.tube.z)));
        fits.push({ n: `${h.id}/${room.id}`, ok: inside && gap >= 1.9 && toTube > HOLO_GRAB + 2.2, gap, toTube });
      }
    }
    ok('a holodeck fits in every room it can be bought for: inside the walls, racks apart, the tube clear of them',
      fits.every((f) => f.ok), fits.filter((f) => !f.ok).map((f) => `${f.n} gap ${f.gap.toFixed(2)} tube ${f.toTube.toFixed(2)}`).join('; ') || `${fits.length} rooms`);

    /* THE KIT IS FURNITURE SHE ARRANGES. Richard: "players should be able to
       place the VR Tubes and VR equipment where it fits best in the room ...
       the 3 pieces of VR equipment and 1 tube should be mandatory, but player
       can place up to 4. Placing Tubes and equipment should be free ... lower
       the price of the holodeck and the kendo dojo by half." */
    {
      const bad = [];
      for (const h of [...HOUSES, TINY_HOUSE]) {
        for (const room of h.rooms) {
          const rm = { ...room, house: h.id, hk: 'main' };
          const kit = holoKit(rm);
          const clear = kit.every((q, k) => fitsGrid(rm, kit, ITEM_BY_ID[q.id], q.gx, q.gz, q.rot, k));
          const racks = kit.filter((q) => ITEM_BY_ID[q.id].holo === 'rack').map((q) => ITEM_BY_ID[q.id].gear).sort().join();
          if (holoTubes({ items: kit }) !== 1 || racks !== GEAR_ITEMS.map((g) => g.id).sort().join() || !clear) bad.push(`${h.id}/${room.id}`);
        }
      }
      ok('a new holodeck is given one tube and a rack for each piece of the arcade\'s gear, all on clear tatami, in every room', !bad.length, bad.join(' ') || 'all rooms');
      ok('...the kit is free, and on a shelf no shop lists',
        ITEMS.filter((it) => it.holo).every((it) => H.itemPrice(it.id) === 0 && it.where.join() === 'holo'), ITEMS.filter((it) => it.holo).map((it) => H.itemPrice(it.id)).join());
      ok('the holodeck and the kendo dojo cost half what they did (6 and 5 orbs)',
        ROOM_TYPE_BY_ID.holodeck.mult === 3 && ROOM_TYPE_BY_ID.kendo.mult === 2.5);
      const minka = { ...HOUSE_BY_ID.minka.rooms[0], house: 'minka', hk: 'main' };
      const R0 = { type: 'holodeck', items: holoKit(minka) };
      const rk = R0.items.findIndex((q) => ITEM_BY_ID[q.id].holo === 'rack');
      const tk = R0.items.findIndex((q) => q.id === HOLO_TUBE_ID);
      ok('a rack, and the only tube, refuse to be taken out — and say to MOVE them instead',
        /MOVE it instead/.test(holoWhyRemove(R0, rk) ?? '') && /at least one tube/.test(holoWhyRemove(R0, tk) ?? ''));
      const spot = firstFit(minka, R0.items, ITEM_BY_ID[HOLO_TUBE_ID]);
      R0.items.push({ id: HOLO_TUBE_ID, ...spot });
      ok('...a second tube fits beside the kit in the small house, and then either tube may go',
        !!spot && holoWhyRemove(R0, tk) === null && holoWhyRemove(R0, R0.items.length - 1) === null);
      const csrc = readFileSync(new URL('../../src/systems/housing/cards.js', import.meta.url), 'utf8');
      ok('...the card stops at four tubes and says why, and the sale path asks holoWhyRemove first',
        HOLO_MAX_TUBES === 4 && /tubes >= HOLO_MAX_TUBES \? `A holodeck has room for/.test(csrc) && /holoWhyRemove\(this\._home\(top\)\.rooms/.test(csrc));
      const old = { type: 'holodeck', items: [] };
      ok("an old save's holodeck, which kept no rows for its kit, is given one where it always stood",
        ensureHoloKit(minka, old) && old.items.length === 4 && !ensureHoloKit(minka, old));
      const L0 = holoLayout(minka);
      const tc = holoCell(minka, old.items.find((q) => q.id === HOLO_TUBE_ID));
      ok('...the tube within one tatami of where the fixed layout stood it', Math.hypot(tc.x - L0.tube.x, tc.z - L0.tube.z) <= 1.01, `${tc.x},${tc.z} vs ${L0.tube.x},${L0.tube.z}`);
    }

    const I = H.isles[2];
    const Hm = newHome(I.site.id, 'minka', ['Ember']);
    Hm.rooms = { main: { type: 'holodeck', items: [] } };
    I.setHome(Hm, null);
    const R = I.holoRooms[0];
    const tube = I.spots.find((s) => s.act === 'holodeck');
    ok('a holodeck room has three racks and her tube, with a way out of it',
      I.holoRooms.length === 1 && R.racks.length === 3 && !!tube && Math.abs(Math.hypot(tube.out.x, tube.out.z) - 1) < 1e-6);
    {
      // a second tube is a second way in, each with its own glass and its own way out
      const I3 = H.isles[3];
      const was = I3.home;
      const H2 = newHome(I3.site.id, 'minka', ['Ember']);
      const rm = { ...HOUSE_BY_ID.minka.rooms[0], house: 'minka', hk: 'main' };
      const items = holoKit(rm);
      items.push({ id: HOLO_TUBE_ID, ...firstFit(rm, items, ITEM_BY_ID[HOLO_TUBE_ID]) });
      H2.rooms = { main: { type: 'holodeck', items } };
      I3.setHome(H2, null);
      const ts = I3.spots.filter((s) => s.act === 'holodeck');
      ok('two tubes are two ways into the simulator, each with its own glass and a way out',
        ts.length === 2 && I3.holoRooms[0].tubes.length === 2 && ts.every((t) => Math.abs(Math.hypot(t.out.x, t.out.z) - 1) < 1e-6)
        && Math.hypot(ts[0].x - ts[1].x, ts[0].z - ts[1].z) > 3);
      I3.setHome(was ?? null, null);
    }
    /* SHE IS INSIDE HER TUBE. Richard: "the sprite's head is sticking out of
       the tube and she is drawn in front of the tube". Her ears at the float
       height must be under the glass's top, the glass under the ceiling, and
       the glass drawn after her the way the arcade's is. */
    {
      const ears = HOME_FLOAT_H + 2.5;
      const pod = R.tubes?.[0]?.mesh;
      ok('her home tube is tall enough for her ears at the top of her float, and fits under the ceiling',
        ears < HOLO_TUBE.top - 0.3 && HOLO_TUBE.top + 0.3 < FLOOR_H - SLAB_T, `ears ${ears.toFixed(2)} glass ${HOLO_TUBE.top} lid ${(FLOOR_H - SLAB_T).toFixed(2)}`);
      ok("...and its glass is the arcade's, sorted AT the tube and drawn after her",
        !!pod && pod.material.fragmentShader === TUBE_FRAG && pod.renderOrder === 5 && pod.getWorldPosition(new THREE.Vector3()).distanceTo(I.group.getWorldPosition(new THREE.Vector3())) > 0.5 && pod.material.blending === THREE.AdditiveBlending);
    }
    const calls = [];
    const st = [];
    game.dream = {
      stateOf: (i) => st[i] ?? null,
      realmOf: (p) => (p.realm === 'sim' ? 'sim' : null),
      suitAt: (p) => { calls.push('suit'); p.simLook = true; return true; },
      unsuitAt: (p) => { calls.push('unsuit'); p.simLook = false; return true; },
      enterFrom: (p, spot) => { calls.push(spot); return true; },
    };
    const kit = fakePlayer(0);
    const sis = fakePlayer(1);
    const put = (p, q) => p.position.set(q.x, q.y ?? tube.y, q.z);
    const tick = (...ps) => H.holo.update(0.1, ps);
    put(kit, tube);
    let n0 = toasts.length;
    H.interact(kit);
    ok('her tube refuses her without the gear, and says what it wants',
      calls.length === 0 && toasts.slice(n0).some(([i, t]) => i === 0 && /all three pieces of VR gear first \(0 of 3\)/.test(t)));
    put(kit, R.racks[0]);
    tick(kit);
    ok('walking into a rack picks its piece up, and the rack is empty after',
      H.holo.bagOf(0)?.items.size === 1 && !R.racks[0].mesh.visible && R.racks[1].mesh.visible);
    put(sis, R.racks[0]);
    n0 = toasts.length;
    tick(kit, sis);
    ok('...and a sister at the empty rack is told who has it',
      !H.holo.bagOf(1) && toasts.slice(n0).some(([i, t]) => i === 1 && /Ember has the VR HEADSET/.test(t)));
    put(sis, { x: I.x + 400, z: I.z });
    put(kit, R.racks[1]);
    tick(kit);
    put(kit, R.racks[2]);
    tick(kit);
    ok('all three, and she poofs into the gear on the spot', calls.join() === 'suit' && kit.simLook && H.holo.bagOf(0)?.suited);
    put(kit, tube);
    ok('...her tube now offers the simulator', /INTO THE SIMULATOR/.test(H.prompt(kit, 'E') ?? ''));
    H.interact(kit);
    const sent = calls[1];
    ok('...and ACTION there sends her in from HER tube, with the way out of it',
      sent && Math.hypot(sent.x - tube.x, sent.z - tube.z) < 1e-6 && sent.out === tube.out);
    st[0] = { phase: 'sim' };
    kit.realm = 'sim';
    tick(kit);
    ok('...the racks stay empty while she is inside', R.racks.every((r) => !r.mesh.visible));
    st[0] = { phase: null };
    kit.realm = null;
    kit.simLook = false;
    tick(kit);
    ok('back out and un-suited, every piece is back on its rack', !H.holo.bagOf(0) && R.racks.every((r) => r.mesh.visible));
    for (const r of R.racks) { put(kit, r); tick(kit); }
    put(kit, { x: I.x + I.radius + 30, z: I.z });
    calls.length = 0;
    tick(kit);
    tick(kit);
    ok('suited and off her island, the gear comes off and goes back',
      calls.join() === 'unsuit' && !kit.simLook && !H.holo.bagOf(0) && R.racks.every((r) => r.mesh.visible));
    put(kit, R.racks[0]);
    tick(kit);
    put(kit, { x: I.x + I.radius + 30, z: I.z });
    tick(kit);
    ok('...and so does a half-gathered set', !H.holo.bagOf(0) && R.racks[0].mesh.visible);
    /* ONE STEP, ONE MESSAGE. "it is spamming the screen with messages ...
       should only appear once every time a player steps on it." A suit-up
       the Dream Dojo refuses puts the gear back on the rack she is standing
       on; that must not be picked up again until she steps off and on. */
    const suit0 = game.dream.suitAt;
    game.dream.suitAt = () => false;
    put(kit, R.racks[0]); tick(kit);
    put(kit, R.racks[1]); tick(kit);
    n0 = toasts.length;
    put(kit, R.racks[2]);
    for (let k = 0; k < 60; k++) tick(kit);
    const said = toasts.slice(n0).filter(([i]) => i === 0).length;
    ok('a refused suit-up on a rack says so ONCE while she stands there, not every frame', said === 2, `${said} toasts in 60 frames`);
    put(kit, { x: R.racks[2].x + 6, z: R.racks[2].z }); tick(kit);
    n0 = toasts.length;
    put(kit, R.racks[2]); tick(kit); tick(kit);
    ok('...and stepping off and back on is a new step', toasts.length > n0);
    game.dream.suitAt = suit0;
    put(kit, { x: I.x + I.radius + 30, z: I.z }); tick(kit);
    I.setHome(null);
    game.dream = null;
    const dsrc = readFileSync(new URL('../../src/systems/dreamdojo.js', import.meta.url), 'utf8');
    ok('the Dream Dojo rises, floats her puppet and lets her down in HER tube, and crosses through the arcade\'s',
      /const tube = s\.home \?\? this\.layout\.tubes\[p\.index\]/.test(dsrc)
      && /if \(s\.home\) this\._shift\(p, arc\.x - tube\.x/.test(dsrc)
      && /this\._cross\(p, false, true\);\s*if \(s\.home\) this\._shift\(p, tube\.x - arc\.x/.test(dsrc)
      && /const port = toSim\(arc\.x, arc\.z\)/.test(dsrc));
    ok('...and the arcade does not take off gear she put on at home', /!s\?\.homeSuit && \(h > ARCADE\.r \+ 2/.test(dsrc));
    ok('...and no longer stands her at the arcade to go in', !/enterFrom[\s\S]{0,900}p\.position\.set\(tube\.x, ARCADE\.y, tube\.z\)/.test(dsrc));
  }

  /* ROSHI'S VOICE: every clip is a render of a line he actually shows, and is
     on disk. A card and a recording that are two strings is the bug voices.md
     is about; a clip nobody can find is silence nobody reports. */
  {
    const shown = [...ROSHI_LINES.hello, ROSHI_LINES.bought, ROSHI_LINES.sold];
    ok('every Roshi clip is the exact text of one of his lines',
      Object.keys(ROSHI_VOICE).every((t) => shown.includes(t)) && shown.every((t) => ROSHI_VOICE[t]));
    ok('...filed in his own folder, and on disk', Object.values(ROSHI_VOICE).every((id) => voicePath(id) === `/voice/roshi/${id}.mp3`
      && existsSync(new URL(`../../public${voicePath(id)}`, import.meta.url))));
    const csrc = readFileSync(new URL('../../src/systems/housing/cards.js', import.meta.url), 'utf8');
    ok('...and the cards say his lines through him, not as a second copy', !/ROSHI: Ohoho|bridge is growing/.test(csrc));
  }

  /* KENDO'S DRAWINGS: a swing in the bogu shows the kiai whether or not it
     lands, an un-geared swing does not, and taking the gear off takes the
     guard pose off with it. Without art, the drawn men is the fallback. */
  {
    const K = new Kendo({ isles: [], game: { players: [], toast() {}, audio: null, scene: { add() {} } } });
    const a = fakePlayer(0);
    a.kendoPose = {};
    K.toggleGear(a);
    ok('putting the bogu on sets her guard pose', a.kendoGeared === true && K.geared(a));
    K.sparStrike(a, 'stand', { x: 1, y: 0 });
    ok('...a swing in it shows the kiai, landed or not', a.kiaiT === KIAI_T);
    const b = fakePlayer(1);
    K.sparStrike(b, 'stand', { x: 1, y: 0 });
    ok('...an un-geared swing shows nothing', !b.kiaiT);
    K._unwear(0);
    ok('...and hanging it up takes the pose off', a.kendoGeared === false && !K.geared(a));
    const ksrc = readFileSync(new URL('../../src/systems/housing/kendo.js', import.meta.url), 'utf8');
    ok('...with the drawn men kept for a build without the drawings', /menTexture\(\)/.test(ksrc) && /p\.kendoPose \|\| p\.kiaiPose/.test(ksrc));
  }

  /* NO BLINK ON A REBUILD. Richard: "All the 3D models blink as if respawning
     while customising an object or furniture." Every change rebuilds the
     island, and a model swapped in on a `.then` lands after the frame is
     drawn — one frame of every stand-in, per change. A loaded model is placed
     at once; `onReal` still comes, a beat later, for the callers that set it
     after `placeModel` returns. */
  {
    const real = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    real.name = 'real-model';
    primeModel('check/blink', new THREE.Group().add(real));
    const standIn = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const g = placeModel('check/blink', standIn, { h: 2 });
    let named = false;
    g.traverse((o) => { if (o.name === 'real-model') named = true; });
    let called = 0;
    g.userData.onReal = () => called++;
    ok('a model already loaded is in the group the moment it is placed, the stand-in never shown',
      g.userData.real === true && named && !g.getObjectById(standIn.id));
    await Promise.resolve();
    ok("...and its onReal still fires, though it was set after placeModel returned", called === 1);
    const g2 = placeModel('check/blink', null, { h: 2 });
    g2.userData.disposed = true;
    let late = 0;
    g2.userData.onReal = () => late++;
    await Promise.resolve();
    ok('...but not on one thrown away first', late === 0);
  }

  /* CLAIMING CASTLE ROOMS. Richard, Oct 2026: four rooms across the castle
     and its free dojo house — "If there are 2 co-owners, each person can get 1
     room in each building ... If a player claims a 1st floor of the castle or
     the dojo house, they can not claim the 1st floor of the other house." A
     fair share each, rounded down; the room left over is nobody's. */
  {
    const [e, f, b, x] = [0, 1, 2, 3].map((i) => fakePlayer(i));
    const names = [e, f, b].map((q) => q.style.name);
    const annex = () => [{ uid: 1, house: 'dojohouse', x: 30, z: 0, rot: 0, paid: 0, free: true }];
    const C = newHome('cloudpeak', 'castle', names.slice(0, 2));
    C.annex = annex();
    const said = [];
    const was = game.toast;
    game.toast = (t, i) => said.push([i, t]);
    const claimable = homeRooms(C).filter((r) => r.claim).map((r) => r.id).sort().join();
    ok('the castle has four rooms to claim: its two floors and the free dojo house\'s two, never the lookout',
      claimable === 'a1_hall,a1_upper,ground,middle', claimable);
    ok('...and a dojo house BOUGHT on top is everybody\'s', (() => {
      const C2 = newHome('cloudpeak', 'castle', names.slice(0, 2));
      C2.annex = [{ ...annex()[0], free: false }];
      return !homeRooms(C2).some((r) => r.claim && r.hk !== 'main');
    })());
    ok('two owners of the castle get two rooms each', H.claimShare(C) === 2);
    ok('she claims the castle\'s ground floor', H.setClaim(e, C, 'ground', true) && C.rooms.ground.claim === names[0]);
    ok('...but not its second floor too, and is told to pick in the other house',
      !H.setClaim(e, C, 'middle', true) && /in the other house/.test(said.at(-1)?.[1]));
    ok('...nor the dojo house\'s ground floor, since she has a ground floor',
      !H.setClaim(e, C, 'a1_hall', true) && /already have a ground floor/.test(said.at(-1)?.[1]));
    ok('...so she takes the dojo house\'s upstairs, one in each building', H.setClaim(e, C, 'a1_upper', true));
    ok("...nor her sister's", !H.setClaim(f, C, 'ground', true) && /That is .*'s room/.test(said.at(-1)?.[1]));
    ok('her sister gets the other two, one in each house, a ground floor each',
      H.setClaim(f, C, 'middle', true) && H.setClaim(f, C, 'a1_hall', true));
    ok('...nor can a visitor claim one at all', !H.setClaim(x, C, 'top', true) && /everybody/.test(said.at(-1)?.[1])
      && (delete C.rooms.middle.claim, !H.setClaim(x, C, 'middle', true)) && /owners/.test(said.at(-1)?.[1]));
    C.rooms.middle.claim = names[1];
    ok('letting one go makes it UNCLAIMED, and she may take it back', H.setClaim(e, C, 'a1_upper', false) && !C.rooms.a1_upper.claim && H.setClaim(e, C, 'a1_upper', true));
    ok("...and nobody lets go of a room that is not hers", !H.setClaim(f, C, 'ground', false) && C.rooms.ground.claim === names[0]);
    const C3 = newHome('cloudpeak', 'castle', names);
    C3.annex = annex();
    H.setClaim(e, C3, 'ground', true);
    H.setClaim(f, C3, 'middle', true);
    H.setClaim(b, C3, 'a1_hall', true);
    ok('three owners get one each, and the fourth room is left for everybody',
      H.claimShare(C3) === 1 && C3.rooms.a1_hall?.claim === names[2] && !H.setClaim(e, C3, 'a1_upper', true) && !H.setClaim(b, C3, 'a1_upper', true) && !C3.rooms.a1_upper?.claim);
    const C1 = newHome('cloudpeak', 'castle', names.slice(0, 1));
    C1.annex = annex();
    ok('one owner may have all four but the second ground floor',
      H.setClaim(e, C1, 'ground', true) && H.setClaim(e, C1, 'middle', true) && H.setClaim(e, C1, 'a1_upper', true) && !H.setClaim(e, C1, 'a1_hall', true));
    ok('a room everybody walks through is never a wall, claimed or not',
      homeRooms(C).filter((r) => r.through).map((r) => r.id).sort().join() === 'a1_hall,ground,middle'
      && /room\.through/.test(readFileSync(new URL('../../src/systems/housing/housing.js', import.meta.url), 'utf8').match(/_roomWall\(p, I, H\) \{[\s\S]{0,900}/)?.[0] ?? ''));
    game.toast = was;
  }

  /* WHERE A KENDO DOJO STANDS. Richard: "Do not build kendo where it hits the
     stairs ... on the East side", "the square beside the stairs, never under
     them", and "nothing may be built on stairs". Every kendo room's area sits
     inside its room and clear of every stairwell on its floor, and the two
     marks sit inside the area — the tape, the rule and the marks are one
     function each (`kendoArea`, `kendoMarks`). */
  {
    for (const hid of ['castle', 'dojohouse', 'minka', 'tiny']) {
      const def = HOUSE_BY_ID[hid];
      for (const room of def.rooms.filter((r) => r.kendo)) {
        const A = kendoArea(room);
        const inRoom = Math.abs(A.cx - room.cx) + A.w / 2 <= room.w / 2 + 1e-6 && Math.abs(A.cz - room.cz) + A.d / 2 <= room.d / 2 + 1e-6;
        const wells = stairBlocks(hid, room.floor);
        const hits = wells.filter((s) => A.cx - A.w / 2 < s.x1 && A.cx + A.w / 2 > s.x0 && A.cz - A.d / 2 < s.z1 && A.cz + A.d / 2 > s.z0);
        const M = kendoMarks(room);
        const marksIn = M.every((m) => Math.abs(m.x - A.cx) <= A.w / 2 - 1 && Math.abs(m.z - A.cz) <= A.d / 2 - 1);
        ok(`${hid}/${room.id}: the kendo square is inside the room, clear of the stairs, with both marks on it`,
          inRoom && !hits.length && marksIn && M.length === 2, JSON.stringify({ A, hits, M }));
      }
    }
  }

  /* A KENDO MATCH, end to end on a stub square: two kittens kneel in seiza on
     the two marks, the turns (grab, stand, kiai), the bow, HAJIME, a vertical
     cut down a narrow lane, a riposte, the plane turning, two ippons a round,
     best of three, and everything it took given back. Richard's spec is quoted
     over `BOUT`, `SEIZA`, `KENDO_HIT` and `KENDO_TURN` in kendo.js; each line
     here is one clause of it. */
  {
    const said = [];
    const sounds = [];
    const g2 = { players: [], toast: (t, i) => said.push([i, t]), audio: { play: (s) => sounds.push(s) }, scene: { add() {} } };
    const room = { id: 'r1', cx: 0, cz: 0, w: 12, d: 8, floor: 0 };
    const isle = {
      local: (x, z) => ({ x, z }), groundY: 0, shell: { floorY: [0] }, ry: 0, roomAt: () => room,
      floorY: () => 0, roomLocal: (r, x, z) => ({ x, z }), houseOf: () => ({ ry: 0, toLocal: (x, z) => ({ x, z }) }),
    };
    const zone = { isle, room, key: 'site:r1' };
    const K = new Kendo({ isles: [], game: g2 });
    // the area: the room less 1.4 of margin (`kendoArea`) — 9.2 x 5.2
    K.zoneOf = (p) => (Math.abs(p.position.x) < 4.6 && Math.abs(p.position.z) < 2.6 ? zone : null);
    const marks = K.marksOf(zone);
    ok('the two seiza marks are along the long side, either side of the middle',
      marks.length === 2 && Math.abs(marks[0].x + 2.6) < 1e-6 && Math.abs(marks[1].x - 2.6) < 1e-6 && marks.every((m) => m.z === 0));
    const a = fakePlayer(0, -1, 0);
    const b = fakePlayer(1, 1, 0);
    const c = fakePlayer(2, 0, 1);
    for (const p of [a, b, c]) { p.kendoPose = {}; p.power = { tag: 'orbs' }; p.powerOrbs = []; p.padStick = 0; K.toggleGear(p); }
    g2.players = [a, b];
    /* `update` less its gear sweep, which takes the bogu off anybody not
       standing in a real house — and the stub square is in none. */
    const run = (sec, dt = 0.05) => {
      for (let t = 0; t < sec; t += dt) {
        for (const [i, c] of K.cool) K.cool.set(i, c - dt);
        K._seiza(dt, g2.players);
        for (const B of [...K.bouts.values()]) K._step(B, dt);
      }
    };
    ok('...and `update` is exactly those, then the board and the gear', /update\(dt, players\) \{\s*for \(const \[i, c\] of this\.cool\) this\.cool\.set\(i, c - dt\);\s*this\._seiza\(dt, players\);\s*for \(const B of \[\.\.\.this\.bouts\.values\(\)\]\) this\._step\(B, dt\);/.test(readFileSync(new URL('../../src/systems/housing/kendo.js', import.meta.url), 'utf8')));
    // step until something is true, at most `max` seconds: the beats are asked by state, not by summed float time
    const until = (f, max = 10, dt = 0.05) => { for (let t = 0; t < max && !f(); t += dt) run(dt, dt); return f(); };
    const onMarks = () => { a.position.copy(marks[0]); b.position.copy(marks[1]); for (const p of [a, b]) { p.velocity.set(0, 0, 0); p.padStick = 0; } };
    run(SEIZA.t + 0.5);
    ok('two geared kittens on the square but off the marks never start a match', K.bouts.size === 0 && !K.kneel.size
      && said.some(([i, t]) => i === 0 && /WHITE CROSS/.test(t)));
    onMarks();
    b.padStick = 1;
    run(SEIZA.t * 0.5);
    ok('on a cross for less than its time, she is still standing', K.bouts.size === 0 && a.kendoStance !== 'kneel');
    until(() => K.kneel.get(0)?.down, SEIZA.t);
    ok('...keep still for it and she kneels in seiza, facing the other cross, held there',
      K.kneel.get(0)?.down && a.kendoStance === 'kneel' && !!a.pinnedAt && Math.abs(a.facing - Math.PI / 2) < 1e-6 && K.bouts.size === 0);
    ok('...but somebody fidgeting on the other cross never kneels', !K.kneel.get(1)?.down);
    a.padStick = 1;
    run(0.05);
    ok('a push of the stick stands her up again, and says so', !K.kneel.has(0) && !a.pinnedAt && a.kendoStance === null
      && said.some(([i, t]) => i === 0 && /stands up/.test(t)));
    onMarks();
    until(() => K.bouts.size > 0, SEIZA.t + 0.5);
    const B = K.boutOf(0);
    ok('both kneeling on the two crosses: the match begins', !!B && B === K.boutOf(1) && B.phase === 'kneel' && a.kendoStance === 'kneel' && !K.kneel.size);
    ok('...and their orbs do nothing in it, though they still wear them', a.kendoBout && b.kendoBout && a.power.tag === undefined && Array.isArray(a.powerOrbs));
    ok('...on the two marks, facing each other, held there',
      Math.abs(a.position.x - marks[0].x) < 1e-6 && Math.abs(b.position.x - marks[1].x) < 1e-6 && !!a.pinnedAt && Math.abs(a.facing - Math.PI / 2) < 1e-6);
    ok("...and the pad is the ceremony's", K.holds(0) && K.holds(1) && !K.holds(2));
    until(() => B.phase === 'rise', BOUT.kneel + 0.1);
    run(BOUT.grab * 0.5);
    ok('she reaches for her shinai first, her opponent still kneeling', B.phase === 'rise' && a.kendoStance === 'grab' && b.kendoStance === 'kneel');
    until(() => B.step === 'kiai', BOUT.grab + BOUT.stand + 0.1);
    ok('...stands, and shouts HER kiai', B.step === 'kiai' && a.kiaiT > 0 && !b.kiaiT && sounds.includes('kiai'));
    until(() => B.turn === 1, BOUT.kiai + 0.1);
    run(0.05);
    ok("...then it is her opponent's turn", B.turn === 1 && b.kendoStance === 'grab');
    until(() => B.phase === 'bow', BOUT.grab + BOUT.stand + BOUT.kiai + 0.2);
    run(0.05);
    ok('both up and shouted, they bow to each other', B.phase === 'bow' && a.kendoStance === 'bow' && b.kendoStance === 'bow');
    K.sparStrike(a, 'stand', { x: 1, y: 0 });
    ok('a swing during the ceremony is no opening', B.pts[0] === 0);
    until(() => B.phase === 'fight', BOUT.bow + BOUT.hajime + 0.2);
    ok('HAJIME: the pins come off and the pad is hers again', B.phase === 'fight' && !a.pinnedAt && !K.holds(0)
      && said.some(([, t]) => /HAJIME/.test(t)));
    run(0.05);
    ok('in a live round they face each other along the plane, and the riposte is live',
      a.kendoLive && b.kendoLive && Math.abs(a.kendoFace - Math.PI / 2) < 1e-6 && Math.abs(Math.abs(b.kendoFace) - Math.PI / 2) < 1e-6 && b.kendoFace < 0);
    // the marks are a room apart; close in to sword's reach
    a.position.set(-1, 0, 0);
    b.position.set(1, 0, 0);
    a.facing = Math.PI / 2;
    b.kendoDodgeT = 0.1;
    K.sparStrike(a, 'stand', { x: 1, y: 0 });
    ok('a kitten mid-dodge cannot be hit', B.pts[0] === 0);
    b.kendoDodgeT = 0;
    // THE LANE: a cut is vertical, so a sideways step is a miss
    b.position.set(1, 0, KENDO_HIT.lane + 0.3);
    K.sparStrike(a, 'stand', { x: 1, y: 0 });
    ok('a cut comes straight down: a kitten a step to the side of its line is missed', B.pts[0] === 0 && !K.cool.get(1));
    b.position.set(KENDO_HIT.reach + 0.6, 0, 0);
    K.sparStrike(a, 'stand', { x: 1, y: 0 });
    ok('...and so is one past its reach', B.pts[0] === 0 && !K.cool.get(1));
    b.position.set(1, 0, 0);
    // 返 RIPOSTE: her guard up on this side catches it, and she answers
    const answered = [];
    b.parries = () => true;
    b.riposte = (att) => answered.push(att);
    K.sparStrike(a, 'stand', { x: 1, y: 0 });
    ok('a riposte in the bogu catches the cut — no ippon — and answers it', B.pts[0] === 0 && answered[0] === a
      && said.some(([i, t]) => i === 0 && /parried/.test(t)));
    delete b.parries;
    delete b.riposte;
    c.position.set(-1.5, 0, 0.5);
    c.facing = Math.PI / 2;
    g2.players = [a, b, c];
    K.sparStrike(c, 'stand', { x: 1, y: 0 });
    ok('...nor can a sister from outside the match score on either fighter', B.pts[0] === 0 && B.pts[1] === 0 && !K.cool.get(0) && !K.cool.get(1));
    g2.players = [a, b];
    // THE PLANE TURNS: across it for longer than KENDO_TURN.t, and the lens goes round a quarter
    const yaw0 = B.wantYaw;
    a.position.set(0, 0, -2);
    b.position.set(0, 0, 2);
    run(KENDO_TURN.t * 0.5);
    ok('one above the other for a moment does not turn the camera', B.wantYaw === yaw0);
    run(KENDO_TURN.t * 0.5 + 0.1);
    ok('...but for longer, the plane turns a quarter and the lens with it',
      Math.abs(Math.abs(B.wantYaw - yaw0) - Math.PI / 2) < 1e-6 && Math.abs(B.axis.z) > 0.999 && a.kendoLandYaw === B.wantYaw
      && Math.abs(a.kendoFace) < 1e-6, `${yaw0} -> ${B.wantYaw}`);
    ok('...eased, not cut', Math.abs(B.camYaw - yaw0) > 1e-3 && Math.abs(B.camYaw - B.wantYaw) > 1e-3);
    // eased at 3.2/s a quarter turn is inside the 1e-3 snap after ln(1571)/3.2 = 2.3s
    run(3);
    ok('...and it lands where it was going', Math.abs(B.camYaw - B.wantYaw) < 1e-6 && K.shotFor([0]).yaw === B.camYaw && K.shotFor([0]).land === B.wantYaw);
    a.position.set(-1, 0, 0);
    b.position.set(1, 0, 0);
    K.sparStrike(a, 'stand', { x: 1, y: 0 });
    ok('a clean hit in a live round is IPPON, YAME stops it, and the shove keeps her on the floor',
      B.pts[0] === 1 && B.phase === 'yame' && K.holds(1) && b.velocity.y <= 2 + 1e-9);
    until(() => B.phase === 'hajime', BOUT.yame + 0.2);
    ok('...and YAME puts them back on their marks, the plane back along them', Math.abs(B.axis.x) > 0.999 && B.wantYaw === yaw0);
    until(() => B.phase === 'fight', BOUT.hajime + 0.2);
    const hit = () => { for (const p of [a, b]) p.velocity.set(0, 0, 0); a.position.set(-1, 0, 0); b.position.set(1, 0, 0); a.facing = Math.PI / 2; K.cool.clear(); K.sparStrike(a, 'stand', { x: 1, y: 0 }); };
    hit();
    ok('two ippons take the round', B.phase === 'roundEnd' && B.wins[0] === 1 && B.pts[0] === 2);
    until(() => B.phase === 'hajime', BOUT.roundEnd + 0.2);
    ok('...and the next starts at HAJIME, points cleared, a fresh clock', B.round === 2 && B.phase === 'hajime' && B.pts[0] === 0 && B.clock === BOUT.roundT);
    until(() => B.phase === 'fight', BOUT.hajime + 0.2);
    until(() => B.phase !== 'fight', BOUT.roundT + 0.5, 0.25);
    ok("a round that runs out level is a draw, and nobody's", B.round === 2 && B.phase === 'roundEnd' && B.wins.join() === '1,0');
    until(() => B.phase === 'fight', BOUT.roundEnd + BOUT.hajime + 0.2);
    hit();
    until(() => B.phase === 'fight', BOUT.yame + BOUT.hajime + 0.2);
    hit();
    until(() => B.phase === 'final', BOUT.roundEnd + 0.2);
    ok('best of three: the match is decided, and they bow', B.phase === 'final' && a.kendoStance === 'bow'
      && said.some(([, t]) => /WINS THE MATCH, 2-0/.test(t)));
    until(() => !K.bouts.size, BOUT.bow + 0.2);
    ok('...and when it is over, nobody is held and the orbs are hers again',
      !K.bouts.size && !a.kendoBout && !a.pinnedAt && !K.holds(0) && a.kendoStance === null && !a.kendoLive && a.kendoFace == null && a.kendoLandYaw == null
      && /p\.power = aggregate\(p\.powerOrbs \?\? \[\]\)/.test(readFileSync(new URL('../../src/systems/housing/kendo.js', import.meta.url), 'utf8')));
    // JOGAI
    onMarks();
    until(() => K.bouts.size > 0, SEIZA.t + 0.5);
    const B2 = K.boutOf(0);
    until(() => B2.phase === 'fight', 20);
    b.position.set(9, 0, 0);
    run(BOUT.jogai * 0.5);
    ok('a step off the square in a live round is only a warning', B2?.phase === 'fight' && K.bouts.size === 1);
    run(BOUT.jogai);
    ok('...but staying off it ends the match, and says so', !K.bouts.size && said.some(([i, t]) => i === 0 && /stepped off the square/.test(t)));
    onMarks();
    until(() => K.bouts.size > 0, SEIZA.t + 0.5);
    K._unwear(1);
    run(0.1);
    ok('hanging the gear up mid-match calls it off', !K.bouts.size && !b.kendoBout);
    K._unwear(0);
    K._unwear(2);

    // THE CAMERA and THE WALLS, for a pane that holds a fighter or a watcher
    K.toggleGear(a);
    K.toggleGear(b);
    onMarks();
    until(() => K.bouts.size > 0, SEIZA.t + 0.5);
    g2.players = [a, b, c];
    const shot = K.shotFor([0]);
    ok('a pane with a fighter in it gets the match camera, closer than the house shot, looking across the marks',
      !!shot && shot.dist < 25 && Math.abs(shot.centre.x) < 1e-6 && Math.abs(Math.sin(shot.yaw)) < 1e-6 && shot.pitch > 0.5);
    c.position.set(400, 0, 400);
    isle.roomAt = (x) => (x < 100 ? room : null);
    ok('...a pane with nobody near it does not', K.shotFor([2]) === null && K.halfWallFor(isle, [2]) === null);
    ok('...and its walls are cut to half height for one that does', Math.abs(K.halfWallFor(isle, [0]) - 2.1) < 1e-6);
    ok("...nobody else's house", K.halfWallFor({}, [0]) === null);
    for (const Bx of [...K.bouts.values()]) K._end(Bx, null);
    K._unwear(0);
    K._unwear(1);
    ok('yawAcross keeps the game\'s own side of the room: along x is the default lens, along z a quarter round',
      Math.abs(yawAcross({ x: 1, z: 0 })) < 1e-9 && Math.abs(yawAcross({ x: -1, z: 0 })) < 1e-9 && Math.abs(Math.abs(yawAcross({ x: 0, z: 1 })) - Math.PI / 2) < 1e-9);

    const psrc = readFileSync(new URL('../../src/entities/player.js', import.meta.url), 'utf8');
    /* "Too strong; it should move her only 1-2 steps and make her briefly
       immune." A kitten's step is about a metre: the dodge is `dist` over
       `t`, the last frame clipped so it is the same at any frame rate, and
       then she STOPS. Replayed here at three frame rates. */
    const dodged = (dt) => { let left = KENDO_DODGE.t; let x = 0; while (left > 0) { const s = Math.min(dt, left); left -= dt; x += (KENDO_DODGE.dist / KENDO_DODGE.t) * (s / dt) * dt; } return x; };
    ok('in a match JUMP is a dodge: held, and only once she picks a direction',
      /if \(this\.kendoBout\) \{[\s\S]{0,400}!pad\.down\('jump'\)[\s\S]{0,200}moving && !\(this\.kendoDodgeCool > 0\)/.test(psrc));
    ok('...one or two steps, the same at 30, 60 and 144 fps, and then she stops',
      KENDO_DODGE.dist >= 1.5 && KENDO_DODGE.dist <= 2.5 && [1 / 30, 1 / 60, 1 / 144].every((dt) => Math.abs(dodged(dt) - KENDO_DODGE.dist) < 1e-9)
      && /_kdStop = false;\s*this\.velocity\.x = 0;\s*this\.velocity\.z = 0;/.test(psrc), [1 / 30, 1 / 60, 1 / 144].map(dodged).join());
    ok('...immune a little longer than the step, briefly', KENDO_DODGE.immune > KENDO_DODGE.t && KENDO_DODGE.immune < 0.5 && KENDO_DODGE.cool > KENDO_DODGE.immune);
    ok('...and the gear is drawn at her own size', KENDO_SCALE === 1 && /height \* KENDO_SCALE/.test(psrc));
    ok('...the renderer clips, so the walls can be cut', /localClippingEnabled = true/.test(readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8')));
    ok('the riposte drawing is billboarded with the rest, and wins over the kiai while she guards',
      /kparryPose/.test(psrc.match(/faceCamera\(camera\) \{[\s\S]{0,2000}/)?.[0] ?? '') && /kparry[\s\S]{0,200}parryT > 0 \|\| \(this\.parryRecT > 0 && !\(this\.kiaiT > 0\)\)/.test(psrc));
    const ksrc2 = readFileSync(new URL('../../src/systems/housing/kendo.js', import.meta.url), 'utf8');
    ok('the match scoreboard sits UNDER the names, and the toasts under it',
      /#hud \.scoreboard/.test(ksrc2) && /names\.bottom/.test(ksrc2) && /toasts\.style\.top/.test(ksrc2));
  }

  /* FEET STAY PUT WHEN SHE TURNS. A drawing whose feet are off the middle of
     its cell, mirrored by flipping UVs, jumped sideways twice that offset on
     every turn. `footX` shifts the quad the other way per facing. */
  {
    const tex = new THREE.Texture();
    tex.image = { width: 64, height: 64 };
    const bb = new Billboard(tex, { width: 2, height: 2, cols: 1, rows: 1, mirror: true, footX: 0.3 });
    const cx = () => { bb.mesh.geometry.computeBoundingBox(); const q = bb.mesh.geometry.boundingBox; return (q.min.x + q.max.x) / 2; };
    bb._setCell(0, 0, false);
    const l = cx();
    bb._setCell(0, 0, true);
    const r = cx();
    ok('a drawing with its feet off-centre is shifted to put them under her, both ways', Math.abs(l + 0.3) < 1e-6 && Math.abs(r - 0.3) < 1e-6, `${l} / ${r}`);
  }

  /* ITEM SIZES AND ITEM CUSTOMIZATION. "The katana swords as furniture in the
     house are too big! They are going through the roof!" — the katana was
     `size: { w: 3.4 }` on a model that stands UP, which made it 35 tall. Every
     room thing is measured, model and stand-in alike, into the room. */
  {
    const roof = FLOOR_H - 0.35 - CEILING_GAP;
    const box = new THREE.Box3();
    const measure = (o) => { o.updateMatrixWorld(true); box.setFromObject(o); return box.getSize(new THREE.Vector3()); };
    // the bug, rebuilt: a 0.10 x 1.02 x 0.10 upright thing given a width of 3.4
    const sword = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.02, 0.1));
    fitTo(sword, { w: 3.4 }, roomLook({ cells: [2, 1] }, null));
    ok('a room thing can never come out taller than the room, whatever its catalogue size says',
      measure(sword).y <= roof + 1e-6, measure(sword).y.toFixed(2));
    const L = new GLTFLoader();
    const glb = async (id) => {
      const buf = readFileSync(new URL(`../../public/models/polyfork/${id}.glb`, import.meta.url));
      return (await new Promise((r, j) => L.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', r, j))).scene;
    };
    const tall = [];
    for (const it of ITEMS.filter((x) => x.where.includes('room'))) {
      const bodies = [['stand-in', drawItem(it.id, 2)]];
      if (it.model) bodies.push(['model', await glb(it.model)]);
      for (const [what, o] of bodies) {
        fitTo(o, it.size, roomLook(it, null));
        const v = measure(o);
        const [cx, cz] = it.cells ?? [1, 1];
        if (v.y > roof + 1e-6 || v.x > cx * 2 + 1e-6 || v.z > cz * 2 + 1e-6) tall.push(`${it.id} ${what} ${v.x.toFixed(1)}x${v.y.toFixed(1)}x${v.z.toFixed(1)}`);
        // ...and its OWN size is not being rescued by the cap: the catalogue is right
        if (it.size?.h && o.userData.maxMul < 1 - 1e-6 && what === 'model') tall.push(`${it.id}: the catalogue size is over the room's (max x${o.userData.maxMul.toFixed(2)})`);
      }
    }
    ok('every room thing, model and stand-in, measured: under the ceiling and inside its own tatami', !tall.length, tall.join('; '));
    const kat = await glb('katana-in-scabbard-4b6ffb');
    fitTo(kat, ITEM_BY_ID.katana.size, roomLook(ITEM_BY_ID.katana, null));
    const yor = await glb('yoroi-armour-stand-25f9a2');
    fitTo(yor, ITEM_BY_ID.yoroi.size, roomLook(ITEM_BY_ID.yoroi, null));
    ok('...the katana is smaller than a kitten (2.9), and so is the armour', measure(kat).y < 2.9 && measure(yor).y < 2.9,
      `${measure(kat).y.toFixed(2)} / ${measure(yor).y.toFixed(2)}`);
    fitTo(kat, ITEM_BY_ID.katana.size, roomLook(ITEM_BY_ID.katana, { look: { s: 99 } }));
    ok('...and BIGGER stops at half again', Math.abs(measure(kat).y - ITEM_BY_ID.katana.size.h * LOOK_MUL.max) < 1e-3);

    // COLOURWAYS: measured palette swaps, on a copy
    const all = Object.entries(MODEL_STYLES);
    ok('every vendored Polyfork model has its colourways, the default first and changing nothing',
      all.length >= 20 && all.every(([, S]) => S.styles.length >= 2 && !S.styles[0].swap.length));
    const cols = (o) => {
      const s = new Set();
      o.traverse((m) => { const c = m.isMesh && m.geometry.attributes.color; if (c) for (let i = 0; i < c.count; i++) s.add([c.getX(i), c.getY(i), c.getZ(i)].map((v) => v.toFixed(3)).join()); });
      return s;
    };
    const base = await glb('katana-in-scabbard-4b6ffb');
    const twin = base.clone(true);
    const before = cols(base);
    styleModel(twin, 'katana-in-scabbard-4b6ffb', 'black-and-gold');
    const after = cols(twin);
    // within a hair, as `styleModel` matches: the file's floats are not three-decimal round numbers
    const near = (set, h) => { const c = new THREE.Color(h); return [...set].some((k) => { const v = k.split(',').map(Number); return Math.abs(v[0] - c.r) + Math.abs(v[1] - c.g) + Math.abs(v[2] - c.b) < 0.006; }); };
    ok('a colourway repaints the zones it names: the black-and-gold katana has a black saya and no indigo wrap',
      near(after, '#2a2a2e') && !near(after, '#38506b'));
    ok('...and only THAT one — the model it was cloned from keeps its paint', [...before].every((k) => cols(base).has(k)) && near(cols(base), '#8c2f2a'));
    let unmatched = [];
    for (const [id, S] of all) {
      const o = await glb(id);
      const have = cols(o);
      for (const st of S.styles) for (const [f] of st.swap) if (!near(have, f)) unmatched.push(`${id}:${f}`);
    }
    // a zone can be absent from the default build (winter's snow), so the bar is "most", measured
    const zones = all.reduce((n, [, S]) => n + S.styles.reduce((m, st) => m + st.swap.length, 0), 0);
    ok('...the zones a colourway names are found in the file\'s own colours (measured, not assumed)',
      unmatched.length / zones < 0.25, `${unmatched.length} of ${zones} unmatched`);
    ok('a drawn thing gets lacquers instead, starting with how it came', stylesFor(null)[0].id === TINTS[0].id && !TINTS[0].c);

    // THE CARD: customise a katana in Ember's minka, saved with the house
    const I = H.isles[0];
    const Hm = newHome(I.site.id, 'minka', ['Ember']);
    Hm.rooms = { main: { type: 'living', items: [{ id: 'katana', gx: 0, gz: 0, rot: 0 }, { id: 'futon', gx: 2, gz: 0, rot: 0 }] } };
    H.store.homes[I.site.id] = Hm;
    I.setHome(Hm, null);
    const C = game.housingCards;
    const kit = fakePlayer(0);
    kit.score = 0;
    game.players = [kit];
    C.st.set(0, { kind: 'home', stack: [{ v: 'home', site: I.site.id }] });
    game.inspector.cards[0] = { i: 0 };
    C._push(0, { v: 'room', site: I.site.id, room: 'main' });
    const roomRows = C._view(0).rows;
    const ic = roomRows.find((r) => r.title === 'ITEM CUSTOMIZATION');
    ok('a room offers ITEM CUSTOMIZATION', !!ic && !ic.disabled);
    ic.go();
    ok('...which is the selector, in customise mode', C._top(0).v === 'pick' && C._top(0).mode === 'custom');
    C.customize(0, C._top(0));
    ok('...and JUMP on a thing opens its customisation', C._top(0).v === 'custom' && C._top(0).sel === 0);
    const F = H.builder.frameOf(0);
    const cam = H.builder.camera(kit);
    const at = I.itemMeshes.get('r:main:0').position;
    ok('...with the camera ON the thing, close', F?.item && cam && Math.hypot(cam.centre.x - at.x, cam.centre.z - at.z) < 0.01 && cam.dist < 20);
    const row = () => Hm.rooms.main.items[0];
    const press = (title) => { const r = C._view(0).rows.find((x) => x.title.startsWith(title)); if (!r.disabled) r.go(); return r; };
    press('BIGGER');
    ok('BIGGER makes it bigger, and writes it on the row', Math.abs(row().look?.s - 1.1) < 1e-9);
    const st0 = loadStore(localStorage, homeKey('check-A'));
    ok('...saved with the house, in this game\'s row', Math.abs(st0.homes[I.site.id]?.rooms?.main?.items?.[0]?.look?.s - 1.1) < 1e-9);
    ok('...and in the house\'s JSON', /"look":\{"s":1\.1\}/.test(JSON.stringify(H.store)));
    for (let k = 0; k < 10; k++) press('BIGGER');
    const big = press('BIGGER');
    const mesh = I.itemMeshes.get('r:main:0');
    ok('...up to a limit, then BIGGER is greyed and says why', big.disabled && /as big as it goes|ceiling/.test(big.why) && measure(mesh).y <= FLOOR_H - 0.35 - CEILING_GAP + 1e-6);
    const s1 = row().look.s;
    press('NEXT LOOK');
    ok('NEXT LOOK changes the look and keeps the size', row().look.style === 'black-and-gold' && row().look.s === s1);
    press('PUT IT BACK');
    ok('PUT IT BACK HOW IT CAME clears the row', !row().look);
    C._pop(0); C._pop(0);
    // a futon is drawn, not a model: lacquers
    C._push(0, { v: 'custom', site: I.site.id, room: 'main', kind: 'room', sel: 1 });
    press('NEXT LOOK');
    ok('a drawn thing takes a lacquer', Hm.rooms.main.items[1].look?.style === TINTS[1].id);
    C._pop(0);
    ok('a wall thing and a yard-built thing refuse customisation, saying why',
      !!C._noCustom('wall', 'scroll') && [...YARD_BUILT].every((id) => !!C._noCustom('yard', id)) && !C._noCustom('yard', 'lantern'));

    /* THE ROOM UNDER THE CURSOR IS FRAMED, ON ITS OWN FLOOR. "When choosing a
       room to furnish ... the camera should zoom and focus on the room ...
       it should show the proper floor". */
    const I2 = H.isles[1];
    const Hc = newHome(I2.site.id, 'castle', ['Ember']);
    H.store.homes[I2.site.id] = Hc;
    I2.setHome(Hc, null);
    C.st.set(0, { kind: 'home', stack: [{ v: 'home', site: I2.site.id }] });
    C._push(0, { v: 'rooms', site: I2.site.id });
    const castle = HOUSE_BY_ID.castle.rooms;
    const k = castle.findIndex((r) => r.floor === 2);
    game.inspector.cards[0].i = k;
    kit.position.set(I2.x, I2.groundY + 0.5, I2.z);
    const fr = H.builder.frameOf(0);
    ok('the room list frames the room under the cursor', fr?.room?.id === castle[k].id && !!H.builder.camera(kit));
    ok('...cut down to ITS floor, not the one she is standing on', H.builder.cutFloor(I2, [0])?.f === 2 && H.builder.cutFloor(I2, [0])?.hk === 'main');
    const hsrc = readFileSync(new URL('../../src/systems/housing/housing.js', import.meta.url), 'utf8');
    ok('...and the cutaway takes the framed floor over hers', /if \(bf\) cut\.set\(bf\.hk, bf\.f\);/.test(hsrc));
    I2.cutaway(0);
    const up = [...I2.itemGroup.children].filter((g) => g.userData.floor > 0);
    ok('...and a floor that is cut away takes its furniture with it', up.every((g) => !g.visible));
    /* "When player is not inside a house, and is building a bridge, or adding
       to the yard, the roofs of the house should be hidden" and "When
       building a bridge on the 2nd or 3rd floor, the house should show that
       floor". Her standing on the lawn, through the real cutaway. */
    {
      const cam = new THREE.PerspectiveCamera();
      const roofsShown = () => I2.houses.some((hs) => hs.roofMeshes.some((m) => m.visible));
      kit.position.set(I2.x + I2.radius * 0.8, I2.groundY + 0.5, I2.z);
      C._push(0, { v: 'build', site: I2.site.id, kind: 'yard', id: 'lantern', sel: -1, x: 20, z: 20, rot: 0 });
      H.builder.camera(kit);   // the frame's lens runs before the view is aimed, and leaves the ghost's spot
      H.aimView(cam, [0], false);
      /* YARD WORK: every floor above the first goes too. Richard: "The house,
         especially a castle, can block the camera ... hide every floor above
         the first while adjusting outdoor objects." */
      const yardOff = !roofsShown() && I2.houses.every((hs) => hs.floorMeshes.every((m, f) => m.visible === (f === 0)));
      /* ...and the ghost takes an x-ray bite of the ground floor's walls, as a
         kitten does: her slot first, the ghost's next. */
      const XU = I2.wallMat.userData.xray;
      const ghostAt = C._top(0)._at;
      const ghostCut = XU.uCutOn.value[1] === 1 && !!ghostAt && XU.uCutPos.value[1].distanceTo(ghostAt) < 1e-6
        && Math.hypot(ghostAt.x - I2.local(20, 20).x, ghostAt.z - I2.local(20, 20).z) < 1e-6;
      ok('placing a yard thing: the ground floor stands, the floors above it go, and the ghost gets an x-ray bite', yardOff && ghostCut,
        `${yardOff} ${ghostCut}`);
      C._pop(0);
      C._push(0, { v: 'build', site: I2.site.id, kind: 'link', style: 'plank', a: { hk: 'main', floor: 1, side: 1, at: 0 }, cur: null });
      H.aimView(cam, [0], false);
      const fm = I2.houseOf('main').floorMeshes;
      const linkCut = !roofsShown() && fm[0].visible && fm[1].visible && !fm[2].visible;
      C._pop(0);
      C.st.delete(0);   // no card at all: she is just standing on the lawn
      // ...with her camera where a camera is: out beyond her, up, looking back past nothing
      cam.position.set(kit.position.x + 18, kit.position.y + 12, kit.position.z);
      H.aimView(cam, [0], false);
      ok('building in the yard takes every roof off; a bridge cuts its house to the bridge\'s floor; done, the roofs are back',
        yardOff && linkCut && roofsShown(), `${yardOff} ${linkCut}`);
      /* BEHIND THE CASTLE, ON THE GROUND. Richard, Oct 2026: "When the player
         is on the ground outside ... and is directly behind the castle, show
         the castle's 1st floor with the roofs removed. Otherwise the roofs
         stay on." The same kitten, her camera on the far side of the castle;
         then the same kitten jumped up past BEHIND_HOP, where she is not. */
      const M = I2.houseOf('main');
      const back = M.local(0, -M.shell.half[0][1] - 6);
      const front = M.local(0, M.shell.half[0][1] + 30);
      kit.position.set(back.x, M.gy + 0.1, back.z);
      cam.position.set(front.x, M.gy + 14, front.z);
      H.aimView(cam, [0], false);
      const behindCut = !roofsShown() && M.floorMeshes.every((m, f) => m.visible === (f === 0));
      kit.position.y = M.gy + M.shell.floorY[0] + BEHIND_HOP + 1;
      H.aimView(cam, [0], false);
      const upWhole = roofsShown() && M.floorMeshes.every((m) => m.visible);
      const far = M.local(0, M.shell.half[0][1] + 50);
      kit.position.set(front.x, M.gy + 0.1, front.z);
      cam.position.set(far.x, M.gy + 14, far.z);
      H.aimView(cam, [0], false);
      const frontWhole = roofsShown();
      ok('behind the castle on the ground: its first floor with the roofs off; up off the ground, or in front of it, the castle stands whole',
        behindCut && upWhole && frontWhole, `${behindCut} ${upWhole} ${frontWhole}`);
      kit.position.set(I2.x + I2.radius * 0.8, I2.groundY + 0.5, I2.z);

      /* TWO SISTERS IN ONE PANE, ONE UPSTAIRS. Richard, Oct 2026: "Show the
         upper floor for the player who is upstairs. Make the lower player's
         x-ray 2-3x bigger. Upper-floor items must not be affected by the
         lower player's x-ray." The pane is cut to the HIGHER floor; the girl
         below gets LOWER_XRAY, stopped at the top of the slab over her. */
      const hs = I2.houseOf('main');
      const S = hs.shell;
      const down = fakePlayer(0);
      const upst = fakePlayer(1);
      const lo = hs.local(-2, 6);
      const hi = hs.local(-2, 3);
      down.position.set(lo.x, hs.gy + S.floorY[0] + 0.01, lo.z);
      upst.position.set(hi.x, hs.gy + S.floorY[1] + 0.01, hi.z);
      const wasP = game.players;
      game.players = [down, upst];
      const fa = [down, upst].map((q) => I2.houseAt(q.position.x, q.position.y, q.position.z)?.f);
      H.aimView(cam, [0, 1], false);
      const XU2 = I2.wallMat.userData.xray;
      const shown = hs.floorMeshes.map((m) => m.visible);
      ok('two sisters sharing a pane on floors 1 and 2: the upstairs floor is SHOWN, and the one over it is not',
        fa.join() === '0,1' && shown[0] && shown[1] && !shown[2], `${fa} ${shown}`);
      ok(`...the sister downstairs gets an x-ray ${LOWER_XRAY}x the size, stopped at the top of the floor over her head`,
        XU2.uCutScale.value[0] === LOWER_XRAY && Math.abs(XU2.uCutCeil.value[0] - (hs.gy + S.floorY[1] + 0.02)) < 1e-4
        && LOWER_XRAY >= 2 && LOWER_XRAY <= 3);
      ok('...and the sister upstairs the ordinary one, with no ceiling', XU2.uCutScale.value[1] === 1 && XU2.uCutCeil.value[1] === 1e9);
      upst.position.set(lo.x + 1, hs.gy + S.floorY[0] + 0.01, lo.z);
      H.aimView(cam, [0, 1], false);
      ok('...and on one floor together, both are ordinary, exactly as before', XU2.uCutScale.value[0] === 1 && XU2.uCutCeil.value[0] === 1e9
        && hs.floorMeshes.map((m) => m.visible).join() === 'true,false,false');
      game.players = wasP;
    }
    C.st.delete(0);
    delete H.store.homes[I2.site.id];
    I2.setHome(null, null);

    /* THE GHOST IS THE THING. "When placing items outdoor, like the volleyball,
       it is not showing the actual model and the direction it is facing". */
    const top = { v: 'build', site: I.site.id, kind: 'yard', sel: -1, id: 'volleyball', x: 0, z: -30, rot: 0 };
    const placesBefore = I.places.size;
    const spotsBefore = I.spots.length;
    const ghost = H.builder._ghostBody(I, Hm, top, ITEM_BY_ID.volleyball);
    const gsize = measure(ghost);
    ok('a yard-built thing\'s ghost is the real build — the court, full size — and building it touched nothing',
      gsize.x > 8 && I.places.size === placesBefore && I.spots.length === spotsBefore, `${gsize.x.toFixed(1)} wide`);
    let seeThrough = true;
    ghost.traverse((o) => { if (o.isMesh && !(o.material.transparent && o.userData.ghost)) seeThrough = false; });
    ok('...in see-through copies of its materials', seeThrough);

    /* THE NEW MENUS, DRIVEN FOR REAL: build a house and a bridge through the
       cards and the island, so a view or a ghost that throws is a FAIL here
       and not a blank card in her pane. */
    {
      let err = null;
      const kid = game.players[0] ?? { index: 0, name: 'EMBER', score: 1e9, style: { name: 'Ember' } };
      if (!game.players[0]) game.players = [kid];
      const score0 = kid.score;
      const touch0 = game.touchUI;
      game.touchUI = false; // no document.body in node
      kid.score = 1e9;
      try {
        C.st.set(0, { kind: 'home', stack: [{ v: 'home', site: I.site.id }] });
        for (const v of ['houses', 'houseshop', 'bridges', 'linkshop']) { C._push(0, { v, site: I.site.id }); C._view(0); C._pop(0); }
        const env = H.envOf(I);
        // beside the first house and facing the same way, so a side wall faces a side wall
        const spot = [24, -24, 26, -26].map((x) => ({ x, z: 0, rot: 0 })).find((q) => !houseWhy(Hm, { hk: null, house: 'tiny', ...q }, env));
        ok('the shop finds a free spot for a house on its own', !!C._houseSpot(Hm, 'tiny', env));
        const tH = { v: 'build', site: I.site.id, kind: 'house', sel: -1, id: 'tiny', ...spot };
        C._push(0, tH); C._view(0); H.builder._bigGhost(0, tH, 0, I, Hm); H.builder._drop(0); C._pop(0);
        ok('the free house is FREE, and building it costs nothing', H.annexPrice(Hm, 'tiny') === 0 && H.placeHouse(kid, Hm, { hk: null, house: 'tiny', ...spot }) && kid.score === 1e9);
        ok('...and the next one of it is not free', H.annexPrice(Hm, 'tiny') > 0);
        ok('...and it stands on the island, its own house with its own doors', I.houses.length === 2 && I.houses.flatMap((h) => h.doors).some((d) => d.key === `a${Hm.annex[0].uid}:front`));
        const ports = portSpots(Hm, 2.6, env.gyAt).filter((q) => q.floor === 0);
        let built = null;
        for (const A of ports.filter((q) => q.hk === 'main')) {
          for (const B of ports.filter((q) => q.hk !== 'main')) {
            const L = { a: A, b: B, style: 'plank' };
            if (!linkWhy(Hm, L, env) && !linkBlockers(Hm, L, env).length) { built = L; break; }
          }
          if (built) break;
        }
        const tL = { v: 'build', site: I.site.id, kind: 'link', sel: -1, style: 'plank', floor: 0, a: built?.a ?? null, cur: built?.b ?? ports[0] };
        C._push(0, tL); C._view(0); H.builder._bigGhost(0, tL, 0, I, Hm); H.builder._drop(0); C._pop(0);
        ok('a bridge can be built between the two houses, and it cuts a door at each end',
          !!built && H.buildLink(kid, Hm, built).ok && I.houses.flatMap((h) => h.doors).filter((d) => /^L/.test(d.key)).length === 2);
        ok('...and selling the extra house takes its bridge with it', H.sellHouse(kid, Hm, `a${Hm.annex[0].uid}`) > 0 && !(Hm.links ?? []).length && I.houses.length === 1);
      } catch (e) { err = e; }
      ok('the house and bridge menus and ghosts run without throwing', !err, err?.message);
      kid.score = score0;
      game.touchUI = touch0;
      C.st.delete(0);
    }
    delete H.store.homes[I.site.id];
    I.setHome(null, null);
    game.players = [];
  }

  /* BRIDGES WITH TURNS. "she sets the number of turns or parts, and places
     each turn's start and end; each extra turn adds 25% to the price;
     optional smooth 90° turns, each also +25%, flat and level at the
     junction; the segments take up the height difference." A dojo house and
     a small house side by side, joined from the dojo's upstairs back wall to
     the small house's back wall — which no straight bridge can do — then
     walked, sharp and smooth, through the real island. */
  {
    const I = H.isles[0];
    const Hm = newHome(I.site.id, 'dojohouse', ['Ember']);
    Hm.annex = [{ uid: 1, house: 'minka', x: 24, z: 0, rot: 0, paid: 0, free: true }];
    H.store.homes[I.site.id] = Hm;
    I.setHome(Hm, null);
    const env = H.envOf(I);
    // a straight bridge is the same bridge it was: one run, its numbers, its very triangles
    const Ls = { a: { hk: 'main', floor: 0, side: 1, at: 0 }, b: { hk: 'a1', floor: 0, side: 3, at: 0 }, style: 'sakura' };
    const Gs = linkGeom(Hm, Ls, env.gyAt);
    const A0 = endAt(Hm, Ls.a, env.gyAt), B0 = endAt(Hm, Ls.b, env.gyAt);
    const pos = (gs) => mergeParts(gs).attributes.position.array;
    const same = (p, q) => p.length === q.length && p.every((v, i) => Math.abs(v - q[i]) < 1e-9);
    ok('a bridge with no turns is one run, and draws exactly the triangles it always did',
      Gs.runs.length === 1 && !Gs.turns.length && Math.abs(Gs.len - Math.hypot(B0.x - A0.x, B0.z - A0.z)) < 1e-9
      && same(pos(linkAll(Gs, () => 0).solid), pos(linkParts(Gs, () => -Gs.A.y).solid)) && linkPriceK(Ls) === 1);
    // back to back: both doors face -z, so the straight rule refuses and two turns make a U
    const Lu = { a: { hk: 'main', floor: 1, side: 2, at: 0 }, b: { hk: 'a1', floor: 0, side: 2, at: 0 }, style: 'plank' };
    const viaU = defaultVia(Hm, Lu.a, Lu.b, 2, env.gyAt);
    const LU = { ...Lu, via: viaU };
    ok('two back walls cannot be joined straight, and can with two turns',
      !!linkWhy(Hm, Lu, env) && linkWhy(Hm, LU, env) === null, `${linkWhy(Hm, Lu, env)} / ${linkWhy(Hm, LU, env)}`);
    const G = linkGeom(Hm, LU, env.gyAt);
    const grades = G.runs.map((r) => r.rise / r.len);
    const level = G.turns.every((T, i) => Math.abs(G.runs[i].B.y - T.y) < 1e-9 && Math.abs(G.runs[i + 1].A.y - T.y) < 1e-9);
    ok('...its three runs share the climb at one grade, and every turn is level where they meet',
      G.runs.length === 3 && Math.max(...grades) - Math.min(...grades) < 1e-9 && grades[0] < 0 && level
      && Math.abs(G.runs.reduce((s, r) => s + r.rise, 0) - (G.B.y - G.A.y)) < 1e-9,
      `grades ${grades.map((g) => g.toFixed(4)).join(' ')}, turns at ${G.turns.map((T) => T.y.toFixed(2)).join(' ')}`);
    const smoothU = { ...Lu, via: viaU.map((v) => ({ ...v, smooth: true })) };
    const GS = linkGeom(Hm, smoothU, env.gyAt);
    ok('...a smooth turn is an arc of one bridge-width that cuts both runs back by exactly its tangent, and still builds',
      linkWhy(Hm, smoothU, env) === null && GS.turns.every((T) => Math.abs(T.theta - Math.PI / 2) < 0.1 && Math.abs(T.t - GS.w * Math.tan(T.theta / 2)) < 1e-9)
      && Math.abs(GS.runs[0].len + GS.turns[0].t - (G.runs[0].len + G.turns[0].t)) < 1e-9, `${GS.turns.map((T) => (T.theta * 180 / Math.PI).toFixed(1))}° ${linkWhy(Hm, smoothU, env)}`);
    /* Doubling back through the dojo, square-cornered — six turns, which the
       old cap of three could not even express. (The old test reversed 180°
       twice, and a turn that sharp now trims its runs back by hw * tan(θ/2)
       and is refused as too tight first, which is also true.) */
    const THROUGH = [{ x: 13, z: 0 }, { x: 13, z: 5 }, { x: -3, z: 5 }, { x: -3, z: 12 }, { x: 14, z: 12 }, { x: 14, z: 0 }];
    const base = H.linkPrice('plank');
    ok('each turn adds a quarter of the price, and each smooth one a quarter more',
      TURN_PRICE === 0.25 && H.linkPrice('plank', LU) === Math.round(base * 1.5) && H.linkPrice('plank', smoothU) === Math.round(base * 2)
      && H.linkPrice('plank', { via: [viaU[0]] }) === Math.round(base * 1.25), `${base} → ${H.linkPrice('plank', LU)} → ${H.linkPrice('plank', smoothU)}`);
    ok('...a turn too near its door, off the island, or doubling back through a house is refused out loud',
      /too tight/.test(linkWhy(Hm, { ...Lu, via: [{ x: viaU[0].x, z: endAt(Hm, Lu.a, env.gyAt).z - 0.4 }, viaU[1]] }, env) ?? '')
      && /off the edge/.test(linkWhy(Hm, { ...Lu, via: [viaU[0], { x: 0, z: -80 }] }, env) ?? '')
      && /straight through/.test(linkWhy(Hm, { ...Ls, via: THROUGH }, env) ?? ''),
      linkWhy(Hm, { ...Ls, via: THROUGH }, env));
    // the lowest deck over it is what a thing has to fit under; at a turn that is the level landing, or a run sloping away below it
    const under = overStrip(G, G.turns[1].x, G.turns[1].z, 0.5);
    ok('...and a thing under a turn is in its way the same as under a run, and one far off is not',
      under != null && under <= G.turns[1].y + 1e-9 && under > G.turns[1].y - 0.2 && overStrip(G, G.turns[1].x + 30, G.turns[1].z + 30, 0.5) == null,
      `${under?.toFixed(3)} at a turn ${G.turns[1].y.toFixed(3)}`);
    // WALK IT: the real island, the real walls, out of one back door, round both turns and in at the other
    const kid = fakePlayer(0);
    const walk = (L, label) => {
      Hm.links = [{ uid: 50, ...L, paid: 1 }];
      I.setHome(Hm, null);
      const g = linkGeom(Hm, L, env.gyAt);
      const C = linkColliders(g);
      const W = (x, z) => I.local(x, z);
      const a = W(g.A.x + g.A.nx * 0.9, g.A.z + g.A.nz * 0.9);
      kid.position.set(a.x, I.groundY + g.A.y, a.z);
      let jump = 0, worst = 0, reached = true;
      const to = (x, z) => {
        const t = W(x, z);
        for (let n = 0; n < 800; n++) {
          const dx = t.x - kid.position.x, dz = t.z - kid.position.z, d = Math.hypot(dx, dz);
          if (d < 0.15) return true;
          const wx = kid.position.x, wz = kid.position.z, wy = kid.position.y;
          kid.position.x += (dx / d) * Math.min(0.1, d);
          kid.position.z += (dz / d) * Math.min(0.1, d);
          const h = I.heightAt(kid.position.x, kid.position.z, kid.position.y);
          if (h) kid.position.y = h.y;
          H.wall(kid, wx, wz, null);
          jump = Math.max(jump, Math.abs(kid.position.y - wy));
        }
        return false;
      };
      // the middle of every run and the corner of every turn, then the far door
      const marks = [];
      for (const [k, r] of g.runs.entries()) {
        marks.push([r.A.x + r.ux * r.len / 2, r.A.z + r.uz * r.len / 2]);
        if (g.turns[k]) marks.push(g.turns[k].smooth ? [g.runs[k + 1].A.x, g.runs[k + 1].A.z] : [g.turns[k].x, g.turns[k].z]);
      }
      marks.push([g.B.x + g.B.nx * 0.9, g.B.z + g.B.nz * 0.9]);
      for (const [x, z] of marks) { if (!to(x, z)) { reached = false; break; } }
      const end = I.toLocal(kid.position.x, kid.position.z);
      const off = Math.hypot(end.x - (g.B.x + g.B.nx * 0.9), end.z - (g.B.z + g.B.nz * 0.9));
      // level at every junction: the floor round each corner is its height, a hand's width either way
      // (a sharp turn's whole landing out to its runs' ends; a smooth one's arc, end to end down its middle)
      for (const T of g.turns) {
        const probe = [];
        if (T.smooth) {
          const C = turnArc(T);
          for (let k = 0; k <= 8; k++) { const a = C.a0 + (C.sweep * k) / 8; probe.push([C.cx + Math.sin(a) * C.R, C.cz + Math.cos(a) * C.R]); }
        } else {
          for (let k = 0; k < 8; k++) for (const rr of [0, 0.5, g.w / 2 - 0.05]) probe.push([T.x + Math.sin(k * Math.PI / 4) * rr, T.z + Math.cos(k * Math.PI / 4) * rr]);
        }
        for (const [x, z] of probe) {
          const p = W(x, z);
          const h = I.heightAt(p.x, p.z, I.groundY + T.y + 0.3);
          worst = Math.max(worst, Math.abs((h?.y ?? -99) - I.groundY - T.y));
        }
      }
      // ...and the rail holds her: from the middle run, straight out sideways
      const m = g.runs[1];
      const mid = W(m.A.x + m.ux * m.len / 2, m.A.z + m.uz * m.len / 2);
      kid.position.set(mid.x, I.groundY + m.A.y + m.rise / 2, mid.z);
      to(m.A.x + m.ux * m.len / 2 + m.uz * 6, m.A.z + m.uz * m.len / 2 - m.ux * 6);
      const L2 = I.toLocal(kid.position.x, kid.position.z);
      const side = Math.abs((L2.x - m.A.x) * m.uz - (L2.z - m.A.z) * m.ux);
      ok(`a ${label} U-bridge is walked door to door round both turns, never a step over its deck's, level at its turns, and its rail holds her`,
        reached && off < 0.2 && jump < 0.35 && worst < 1e-6 && side < g.w / 2, `reached ${reached} (${off.toFixed(2)} off), biggest step ${jump.toFixed(2)}, turns level to ${worst.toFixed(3)}, ${side.toFixed(2)} out of ${(g.w / 2).toFixed(2)}, ${C.decks.length} decks`);
    };
    walk(LU, 'sharp-cornered');
    walk(smoothU, 'smooth');
    // THE CARD: the doors, RIGHT twice for two turns, each turn placed, "are you sure?", the price with them
    {
      const Cd = game.housingCards;
      const touch0 = game.touchUI;
      game.touchUI = false;
      game.players = [kid];
      kid.score = 1e9;
      Hm.links = [];
      I.setHome(Hm, null);
      const top = { v: 'build', site: I.site.id, kind: 'link', sel: -1, style: 'plank', floor: 1, a: null, cur: { ...Lu.a } };
      Cd.st.set(0, { kind: 'home', stack: [{ v: 'home', site: I.site.id }] });
      Cd._push(0, top);
      Cd.placeHere(0, top);           // the first door
      top.cur = { ...Lu.b }; top.floor = 0;
      Cd.placeHere(0, top);           // the other door: how many turns?
      const counting = top.counting === true;
      H.builder.linkCount(0, top, -1);    // already none: refused out loud, not wrapped round
      const floor = toasts.at(-1)?.[1] ?? '';
      H.builder.linkCount(0, top, 1); H.builder.linkCount(0, top, 1);
      const said = toasts.at(-1)?.[1] ?? '';
      const V1 = Cd._view(0);
      Cd.placeHere(0, top);           // now the turns
      const placing = top.vk === 0 && top.via?.length === 2;
      H.builder.turnSmooth(0, top);
      Cd.placeHere(0, top);           // turn 1 done
      const V2 = Cd._view(0);
      const before = kid.score;
      Cd.placeHere(0, top);           // turn 2: are you sure?
      const ask = Cd._top(0);
      const VA = Cd._view(0);
      const unbuilt = Hm.links.length === 0 && kid.score === before;
      VA.rows[0].go();                // NO: back to the bridge, nothing built
      const kept = Cd._top(0) === top && Hm.links.length === 0;
      Cd.placeHere(0, top);
      Cd._view(0).rows[1].go();       // YES
      const row = Hm.links.at(-1);
      ok('the bridge card: the doors, LEFT/RIGHT for the turns (stopping at none, out loud), JUMP hands her each corner, the last JUMP asks "are you sure?" with NO first, and YES builds it at the turned price',
        counting && /straight bridge/i.test(floor) && /2 turns/.test(said) && /PLACE THE TURNS/.test(V1.rows[0].title) && placing && /BUILD IT/.test(V2.rows[0].title)
        && ask?.v === 'linkconfirm' && /are you sure/i.test(VA.body) && /^NO/.test(VA.rows[0].title) && /^YES/.test(VA.rows[1].title) && unbuilt && kept
        && row?.via?.length === 2 && row.via[0].smooth === true && !row.via[1].smooth && before - kid.score === Math.round(base * 1.75) && row.paid === before - kid.score
        && Cd._top(0)?.v !== 'build',
        `${floor} | ${said} | ${V1.rows[0].title} | ${V2.rows[0].title} | ${ask?.v} | paid ${row?.paid}`);
      Cd.st.delete(0);
      game.touchUI = touch0;
      game.players = [];
    }
    Hm.links = [];
    delete H.store.homes[I.site.id];
    I.setHome(null, null);
  }

  /* THE PLACEHOLDERS THAT WERE REPLACED, Oct 2026. Every one of them is a FILE
     the game now reaches for, and every one degrades to what it replaced -
     so the checks are that the file is there, and that the fallback still
     answers when it is not. */
  {
    const pub = (f) => existsSync(new URL(`../../public/${f}`, import.meta.url));
    const poses = ['seiza', 'reach', 'rei', 'pray', 'bath', 'futon'];
    const missing = ['ember', 'frost'].flatMap((k) => poses.map((q) => `sprites/kittens/${k}/${q}.png`)).filter((f) => !pub(f));
    ok('every new kitten pose is baked, for both sheets', !missing.length, missing.join(' '));
    ok('...and the chick has its flutter frame', pub('sprites/farm/chick_fly.png'));
    const models = ['props/shoji-door', 'props/angel-wings', 'props/mess-pile', 'fallen-twig-4c64de', 'flower-planter-500ed2',
      'lantern-post-f47665', 'torii-gate-402f30', 'stone-lantern-d56d0a'];
    const gone = models.filter((m) => !pub(m.includes('/') ? `models/${m}.glb` : `models/polyfork/${m}.glb`));
    ok('every prop model the housing reaches for is in public/models', !gone.length, gone.join(' '));
    /* Every bridge style's decoration resolves to a file that exists. */
    const G = { len: 8, w: 2.6, rise: 0, models: true };
    const deco = LINK_STYLES.flatMap((st) => linkModels({ ...G, style: st }));
    ok('every fancy bridge decoration names a model that exists',
      deco.length > 0 && deco.every((m) => pub(m.id.includes('/') ? `models/${m.id}.glb` : `models/polyfork/${m.id}.glb`)),
      `${deco.length} pieces`);
    /* _homeAs: the drawn pose when there is one, the OLD pose when there is not. */
    const as = (hp, drawn) => {
      const f = { homePose: hp, prayPose: drawn ? {} : null, bathPose: drawn ? {} : null, futonPose: drawn ? {} : null };
      return ['bless', 'eat', 'hidden'].filter((n) => Player.prototype._homeAs.call(f, n));
    };
    ok('with no drawing, the prayer is the reach, the bath the crouch and the futon hides her',
      as('pray', false).join() === 'bless' && as('bath', false).join() === 'eat' && as('futon', false).join() === 'hidden',
      `${as('pray', false)}|${as('bath', false)}|${as('futon', false)}`);
    ok('...and with one, none of the old three is worn as well',
      !as('pray', true).length && !as('bath', true).length && !as('futon', true).length);
    ok('...and the old names still mean themselves (the meal, ITADAKIMASU)', as('eat', true).join() === 'eat' && as('bless', true).join() === 'bless');
    /* The ceremony kneels SHORTER than she stands, in order: measured on
       screen, seiza came out a head taller than the guard when sized by ink. */
    /* THE KOI POND ON A CASTLE ISLAND. It collides at its water, not its
       drawn rim, and the search starts in the middle in 1-unit rings: with
       every preset's yard laid round a castle, a pond still finds a place. */
    const koi = ITEM_BY_ID.koipond;
    ok('the koi pond collides at its water, not at its rim', koi.hit < koi.r && koi.hit >= koi.r - 1.5, `${koi.hit} of ${koi.r}`);
    const crowded = PRESETS.map((pr) => {
      const Hc = newHome('sunrise', 'castle', ['Ember']);
      Hc.at = { x: 0, z: HOME_FORWARD.castle, rot: 0 };
      autoLayout(Hc, pr, { radius: 50 });
      return [pr.id, firstYardSpot(Hc, koi, 50)];
    });
    ok('...and a castle with any preset\'s yard still has room for one', crowded.every(([, sp]) => !!sp), crowded.map(([id, sp]) => `${id}:${sp ? 'ok' : 'NONE'}`).join(' '));
    const csrc = readFileSync(new URL('../../src/systems/housing/cards.js', import.meta.url), 'utf8');
    ok('...and a yard thing with no spot found still goes into build mode, to be carried to one',
      /const loose = !spot && top\.kind === 'yard';/.test(csrc) && /disabled: it\.later \|\| !spot \|\|/.test(csrc));
    const C = KENDO_CEREMONY_H;
    ok('kneeling is shorter than reaching, reaching than bowing, bowing than standing',
      C.seizaPose < C.reachPose && C.reachPose < C.reiPose && C.reiPose < 1, JSON.stringify(C));
  }

  /* "SOME FIXES", Oct 2026 — the beds, the roofs, the knock, the sliding
     door, the doors the house hides, the pond that moves and the drill's
     lasers. Each through the real thing it is about: the bed bounce is a
     REAL Player falling under real gravity onto a real futon, because the
     first version of it was cancelled on the same frame by Player's own
     ground test and a fake kitten would have bounced beautifully. */
  {
    const I = H.isles[3];
    const hud = { sfx: (n) => hud.heard.push(n), heard: [] };
    const idle = { mx: 0, my: 0, down: () => false, pressed: () => false };
    const bounce = (kind, gx, gz) => {
      const Hb = newHome(I.site.id, kind, ['Ember']);
      const room = HOUSE_BY_ID[kind].rooms[0];
      Hb.rooms = { [room.id]: { type: 'living', items: [{ id: 'futon', gx, gz, rot: 0 }, { id: 'kotatsu', gx: 3, gz: 0, rot: 0 }] } };
      H.store.homes[I.site.id] = Hb;
      I.setHome(Hb, null);
      const m = I.itemMeshes.get(`r:${room.id}:0`);
      const p = new Player({ texture: new THREE.Texture(), index: 0, spawn: new THREE.Vector3(m.position.x, m.position.y + 2, m.position.z), cols: 8, rows: 4, mirror: false });
      hud.heard = [];
      const peaks = [];
      let last = p.position.y, rising = false;
      for (let f = 0; f < 60 * 12; f++) {
        p.update(1 / 60, idle, world, [], hud);
        if (p.position.y < last && rising) peaks.push(last - m.position.y);
        rising = p.position.y > last;
        last = p.position.y;
      }
      return { I, room, m, p, peaks, hs: I.houseOf('main'), count: (n) => hud.heard.filter((s) => s === n).length };
    };
    const decks = () => I.decks.filter((d) => d.furn);
    /* LOW FURNITURE IS A FLOOR. "Furniture that isn't too tall (bed,
       table) should be jumpable onto": the futon and the kotatsu get a deck
       on their measured tops, and only the futon is a bed. */
    const mk = bounce('minka', 0, 0);
    const fd = decks();
    ok('low furniture is stood on: the futon and the kotatsu each get a deck on their tops, and only the futon bounces',
      fd.length === 2 && fd.find((d) => d.furn === 'futon')?.bed === true && fd.find((d) => d.furn === 'kotatsu')?.bed === false
      && fd.every((d) => d.step <= 0.2 && d.y - mk.hs.shell.floorY[0] >= 0.3),
      fd.map((d) => `${d.furn}:${(d.y - mk.hs.shell.floorY[0]).toFixed(2)}${d.bed ? ' bed' : ''}`).join(' '));
    /* THE BED BOUNCES. "bounces her up and down quickly; she hits her head
       on the ceiling and falls back down. After more than 6 bounces she
       goes through the ceiling ... or through the roof and lands on top of
       it." Six bonks, then the seventh bounce stands her on the roof. */
    const roofUnder = I.heightAt(mk.p.position.x, mk.p.position.z, mk.p.position.y + 0.1);
    ok('a futon bounces her into the ceiling six times with a boing and a bonk, and the seventh puts her on the minka\'s roof',
      mk.count('boing') === 7 && mk.count('bonk') === 6 && mk.peaks.length >= 6
      && mk.peaks.slice(0, 6).every((y) => Math.abs(y - mk.peaks[0]) < 0.05)
      && mk.p.onGround && !!roofUnder?.deck?.roof && I.houseAt(mk.p.position.x, mk.p.position.y + 0.1, mk.p.position.z) == null,
      `boing ${mk.count('boing')} bonk ${mk.count('bonk')} peaks ${mk.peaks.slice(0, 7).map((y) => y.toFixed(2))} on ${roofUnder?.deck?.roof ?? 'not a roof'}`);
    ok('...a head that reaches the ceiling, not one that stops short of it',
      Math.abs(mk.peaks[0] + mk.m.position.y + HEAD_H - (mk.hs.gy + mk.hs.shell.floorY[0] + FLOOR_H - 0.12)) < 0.05,
      `head at ${(mk.peaks[0] + mk.m.position.y + HEAD_H - mk.hs.gy).toFixed(2)}, lid ${(mk.hs.shell.floorY[0] + FLOOR_H - 0.12).toFixed(2)}`);
    // the castle: through the ceiling onto the floor above, on its slab
    const cs = bounce('castle', 5, 4);
    const at = I.houseAt(cs.p.position.x, cs.p.position.y + 0.1, cs.p.position.z);
    ok('...and in a castle the seventh goes through the ceiling onto the floor above',
      cs.count('bonk') === 6 && cs.p.onGround && at?.f === 1
      && Math.abs(cs.p.position.y - (cs.hs.gy + cs.hs.shell.floorY[1])) < 0.05,
      `bonk ${cs.count('bonk')} floor ${at?.f} at ${(cs.p.position.y - cs.hs.gy).toFixed(2)}`);
    /* THE ROOF AND THE EAVES. "Roofs and eaves need collision, and her
       head should bonk on the eaves." `roofY` is the tiles' height at a
       point; a kitten under an eave has a ceiling there, one on it a floor. */
    const S = cs.hs.shell;
    const band = S.eaves.find((E) => E.band && E.f === 0);
    const [hw0] = S.half[0];
    const ex = hw0 + (band.ox - hw0) * 0.5;
    const ey = roofY(band, ex, 0);
    const ew = cs.hs.local(ex, 0);
    const under = I.ceilingAt(ew.x, cs.hs.gy + ey - 2.6, ew.z);
    const onTop = I.heightAt(ew.x, ew.z, cs.hs.gy + ey + 0.5);
    ok('an eave is a ceiling from under it and a floor from on top of it',
      ey != null && under != null && Math.abs(under - (cs.hs.gy + ey - 0.3)) < 1e-6
      && onTop != null && Math.abs(onTop.y - (cs.hs.gy + ey)) < 0.35,
      `eave at ${ey?.toFixed(2)}, ceiling ${under != null ? (under - cs.hs.gy).toFixed(2) : 'none'}, floor ${onTop ? (onTop.y - cs.hs.gy).toFixed(2) : 'none'}`);
    const c0 = cs.hs.local(0, 0);
    const lidTop = cs.hs.gy + S.floorY[S.floorY.length - 1] + FLOOR_H;
    ok('...and a kitten on a roof is not inside the storey under it, while one under its lid is',
      I.houseAt(c0.x, lidTop + 0.5, c0.z) == null && I.houseAt(c0.x, lidTop - 1, c0.z)?.f === S.floorY.length - 1);

    /* THE KNOCK. "A non-owner gets KNOCK in front of a closed door ... 3
       knocks send the owner a prompt; if she accepts, the door opens for the
       visitor ... once every 30s ... A player inside can always leave." */
    const owner = fakePlayer(0);
    const vis = fakePlayer(1);
    const vis2 = fakePlayer(2);
    game.players = [owner, vis, vis2];
    const home = I.home;
    home.open = { Ember: true };   // the island is open; the HOUSE is what she knocks at
    const hs = I.houseOf('main');
    const front = hs.doors.find((d) => d.front);
    const outside = hs.local(0, hs.shell.door.z + 1.5);
    for (const q of [vis, vis2]) q.position.set(outside.x, front.y + 0.05, outside.z);
    ok('a front door does not open for a visitor, and does for an owner',
      !H.opensFor(I, vis, hs, front) && H.opensFor(I, owner, hs, front));
    const C = game.housingCards;
    C.st.delete(0);
    H.time = 100;
    const n0 = toasts.length;
    H.knock(vis, I, hs);
    H.knock(vis, I, hs);
    const asked0 = C._top(0)?.v === 'knock';
    H.knock(vis, I, hs);
    const card = C._top(0);
    ok('two knocks are only knocks; the third puts a card in front of the owner',
      !asked0 && card?.v === 'knock' && card.visitor === 1 && toasts.slice(n0).some(([i, t]) => i === 0 && /knocking at your door/.test(t)),
      toasts.slice(n0).map((t) => t[1]).join(' | '));
    const v = C._view(0);
    ok('...and its first row is NO, and nothing on it is primary', /^NO/.test(v.rows[0].title) && /^YES, LET FROST IN/.test(v.rows[1].title)
      && !v.rows.some((r) => r.primary), v.rows.map((r) => r.title).join(' / '));
    v.rows[1].go();
    ok('...YES lets her in: the door opens for her this game, and she is told', H.opensFor(I, vis, hs, front)
      && toasts.some(([i, t]) => i === 1 && /let you in/.test(t)));
    C.st.delete(0);
    for (let k = 0; k < 3; k++) H.knock(vis2, I, hs);
    C.closed(0);   // the card shut unanswered
    const n1 = toasts.length;
    H.knock(vis2, I, hs);
    ok('...a card closed unanswered is a NO, and a NO means wait 30 seconds before the next knock counts',
      !H.opensFor(I, vis2, hs, front) && toasts.slice(n1).some(([i, t]) => i === 2 && /Wait 30 more seconds/.test(t)),
      toasts.slice(n1).map((t) => t[1]).join(' | '));
    H.time += KNOCK.wait + 1;
    C.st.delete(0);
    for (let k = 0; k < 3; k++) H.knock(vis2, I, hs);
    ok('...and after the wait she can ask again', C._top(0)?.v === 'knock' && C._top(0).visitor === 2);
    C._top(0).answered = true;
    H.answerKnock(owner, C._top(0), false);
    C.st.delete(0);
    // a shut door is a wall to her: walk into it from outside and be stopped, and told
    const inner = hs.local(0, hs.shell.door.z - 0.6);
    vis2.position.set(inner.x, front.y + 0.05, inner.z);
    front.k = 0;
    const seg = doorSeg(hs, front);
    const side = (q) => Math.sign((seg.bx - seg.ax) * (q.position.z - seg.az) - (seg.bz - seg.az) * (q.position.x - seg.ax));
    const outSide = side({ position: new THREE.Vector3(outside.x, 0, outside.z) });
    vis2.position.set((seg.ax + seg.bx) / 2, front.y + 0.05, (seg.az + seg.bz) / 2);
    const mid = vis2.position.clone();
    const towardOut = new THREE.Vector3(outside.x - mid.x, 0, outside.z - mid.z).normalize();
    vis2.position.addScaledVector(towardOut, 0.2);
    const n2 = toasts.length;
    H.wall(vis2, outside.x, outside.z, null);
    ok('...a SHUT door is a wall to a visitor: walking into the doorway she is pushed back out, and told to knock',
      side(vis2) === outSide && Math.hypot(vis2.position.x - mid.x, vis2.position.z - mid.z) >= vis2.radius - 0.05
      && toasts.slice(n2).some(([i, t]) => i === 2 && /KNOCK, and wait/.test(t)),
      `${Math.hypot(vis2.position.x - mid.x, vis2.position.z - mid.z).toFixed(2)} from the door`);
    // somebody inside (shut in when the door closed behind her) always gets out
    const deep = hs.local(0, 0);
    vis2.position.set(deep.x, hs.gy + S.floorY[0] + 0.05, deep.z);
    ok('...and a girl already INSIDE always gets out: the door opens for her', H.opensFor(I, vis2, hs, front));
    front.pinned = true;
    vis2.position.set(outside.x, front.y + 0.05, outside.z);
    ok('...and a door the owner left open lets anybody in', H.opensFor(I, vis2, hs, front));
    front.pinned = false;
    ok('the KNOCK prompt is the outside of a door, never the inside', /door: own \? 'MY HOME' : null/.test(readFileSync(new URL('../../src/systems/housing/housing.js', import.meta.url), 'utf8')));

    /* THE DOOR THE HOUSE HIDES. "A door the building hides from the camera
       gets an x-ray highlight at about 25% strength, no bigger than the door
       path." Her at the front door, the camera round the back. */
    const cam = new THREE.PerspectiveCamera();
    const back = hs.local(0, -S.half[0][1] - 30);
    cam.position.set(back.x, hs.gy + 14, back.z);
    owner.position.set(outside.x, front.y + 0.05, outside.z);
    game.players = [owner];
    H.aimView(cam, [0], false);
    const XU = I.wallMat.userData.xray;
    const slot = [...Array(XRAY_SLOTS).keys()].find((s) => XU.uCutOn.value[s] === 1 && XU.uCutK.value[s] < 1);
    ok('a door the house hides from the camera gets a faint x-ray of its own, door-sized',
      slot != null && Math.abs(XU.uCutK.value[slot] - DOOR_XRAY.k) < 1e-6 && XU.uCutScale.value[slot] <= (front.w / 2) / I.xrayR + 1e-6,
      slot != null ? `k ${XU.uCutK.value[slot]} scale ${XU.uCutScale.value[slot].toFixed(2)}` : 'no door slot');
    const frontCam = hs.local(0, S.half[0][1] + 40);
    cam.position.set(frontCam.x, hs.gy + 14, frontCam.z);
    H.aimView(cam, [0], false);
    ok('...and a door facing the camera gets none', ![...Array(XRAY_SLOTS).keys()].some((s) => XU.uCutOn.value[s] === 1 && XU.uCutK.value[s] < 1));

    /* THE SLIDING DOOR. "Sliding doors, buildable like windows, leading
       outside": a wall thing, on the ground floor only, that cuts a doorway
       and hangs a door in it that the knock rules keep. */
    /* (a castle's ground room stops short of its outer walls and has no wall
       slots at all — no windows either — so the door is tried on a minka's
       ground floor, and refused on a castle's first) */
    const sdHome = newHome(I.site.id, 'minka', ['Ember']);
    sdHome.open = { Ember: true };
    H.store.homes[I.site.id] = sdHome;
    const room0 = HOUSE_BY_ID.minka.rooms.find((r) => r.floor === 0);
    const roomUp = HOUSE_BY_ID.castle.rooms.find((r) => r.floor === 1 && (r.hk ?? 'main') === 'main');
    const sl0 = wallSlots('minka', room0);
    const slU = wallSlots('castle', roomUp);
    ok('a sliding door goes on a ground-floor wall, and upstairs is refused with a reason',
      buildWhy(sdHome, { kind: 'wall', room: room0.id, id: 'slidedoor', sel: -1, side: sl0[0].side, k: sl0[0].k }) === null
      && /ground floor/.test(buildWhy(home, { kind: 'wall', room: roomUp.id, id: 'slidedoor', sel: -1, side: slU[0].side, k: slU[0].k }) ?? ''));
    commitBuild(sdHome, { kind: 'wall', room: room0.id, id: 'slidedoor', sel: -1, side: sl0[0].side, k: sl0[0].k });
    I.setHome(sdHome, null);
    const hs2 = I.houseOf('main');
    const sd = hs2.doors.find((d) => d.key.startsWith('S'));
    ok('...it is a real doorway with a door in it, on that wall', !!sd && sd.floor === 0 && sd.side === sl0[0].side && !sd.front && sd.w <= SLIDE_W,
      sd ? `${sd.key} w ${sd.w}` : 'no door');
    ok('...and the knock rules keep it: shut to a stranger, open to the sister let in',
      !!sd && !H.opensFor(I, vis2, hs2, sd) && H.opensFor(I, vis, hs2, sd));

    /* THE POND THAT MOVES. "Moving the koi pond resets the fish waypoints
       to the new spot." */
    H.store.homes[I.site.id] = home;
    home.outdoor = (home.outdoor ?? []).filter((q) => q.id !== 'koipond');
    const spot = firstYardSpot(home, ITEM_BY_ID.koipond, 50);
    const pond = addOutdoor(home, 'koipond', spot.x, spot.z);
    I.setHome(home, null);
    H.angling.sync();
    const fish = H.angling.ponds.get(I.site.id)?.fish ?? [];
    for (const f of fish) f.to = { x: 999, z: 999 };
    const was = fish.map((f) => [f.x, f.z]);
    pond.x += 1.5;
    I.setHome(home, null);
    H.angling.sync();
    const now = H.angling.ponds.get(I.site.id)?.fish ?? [];
    const P = I.placeOf('koipond');
    ok('a moved koi pond takes its fish with it, and forgets where they were swimming to',
      fish.length > 0 && now.length === fish.length && now.every((f, k) => f === fish[k] && f.to?.x !== 999
        && Math.hypot(f.x - P.x, f.z - P.z) < ITEM_BY_ID.koipond.r) && was.length === now.length,
      now.map((f) => Math.hypot(f.x - P.x, f.z - P.z).toFixed(1)).join(','));
    home.outdoor = home.outdoor.filter((q) => q !== pond);
    I.setHome(home, null);
    H.angling.sync();
    game.players = [];
  }
  /* THE LASERS. "The lasers draw in front of the player UI ... too bright:
     make them more red, less pink or white, and dimmer ... give the lasers
     and the pickups shadows ... play a sound when a goal item is picked up." */
  {
    const r = (LASER_COLOUR >> 16) & 255, g = (LASER_COLOUR >> 8) & 255, b = LASER_COLOUR & 255;
    ok('the drill\'s lasers draw under her UI (20-25), and are red, not pink',
      LASER_ORDER < 20 && LASER_ORDER > 15 && r > 180 && g < 60 && b < 60, `order ${LASER_ORDER} rgb ${r},${g},${b}`);
    const parent = new THREE.Group();
    const star = new HoloStar({ parent, x: 0, y: 3, z: 0, floorY: 0 });
    const low = new HoloStar({ parent, x: 0, y: 0.5, z: 0, floorY: 0 });
    ok('...a star has a shadow on the floor under it, smaller and fainter the higher it floats',
      !!star.shadow && Math.abs(star.shadow.position.y - 0.04) < 1e-6 && star.shadow.scale.x < low.shadow.scale.x
      && star.shadow.material.opacity < low.shadow.material.opacity);
    star._take({ index: 0 });
    ok('...which goes when the star is taken', !star.shadow.visible);
    const dsrc = readFileSync(new URL('../../src/systems/dream/drill.js', import.meta.url), 'utf8');
    ok('...and taking one of hers plays a sound', /if \(who === this\.p\) this\.dream\.game\.sfx\?\.\('starfound'\)/.test(dsrc));
  }

  localStorage.removeItem(HOME_KEY);
  for (const s of ['check-A', 'check-B']) localStorage.removeItem(homeKey(s));
}
