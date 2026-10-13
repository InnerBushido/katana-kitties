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
import { Housing, TOUR } from '../../src/systems/housing/housing.js';
import { HOME_SITES, HOUSES, HOUSE_BY_ID, PRESETS, ITEM_BY_ID, priceOf, HOME_SELL, SPEED_STRIP } from '../../src/systems/housing/catalog.js';
import { emptyStore, newHome, normalise, saveStore, loadStore, migrateYard, HOME_KEY } from '../../src/systems/housing/homestore.js';
import { careLevel, careBuff, stalksAt, BAMBOO_GROW, BAMBOO_MAX } from '../../src/systems/housing/farm.js';
import { fits, firstFit, gridOf, autoLayout, ITEM_SELL, yardWhy, firstYardSpot, addOutdoor, wallSlots } from '../../src/systems/housing/editor.js';
import { buildWhy, commitBuild, removeBuilt, pickList, stepToward, BUILD_KEYS } from '../../src/systems/housing/build.js';
import { houseRadius, houseShape } from '../../src/systems/housing/homehouse.js';
import { possessive, ownedCount, roomRefund, changeRoomType } from '../../src/systems/housing/cards.js';
import { JUKEBOX } from '../../src/systems/housing/jukebox.js';
import { JUKEBOX_FILES } from '../../src/systems/housing/jukeboxfiles.js';
import { rollFish, FISH } from '../../src/systems/housing/fishing.js';
import { PLAYER_STYLE } from '../../src/core/palette.js';
import { worldSig } from '../../src/systems/savegame.js';
import { ROSHI_LINES, ROSHI_VOICE } from '../../src/systems/housing/roshi.js';
import { Kendo, KIAI_T } from '../../src/systems/housing/kendo.js';
import { voicePath } from '../../src/core/audio.js';
import { existsSync } from 'node:fs';
import { mealPct, BOON } from '../../src/systems/housing/boons.js';
import { DOOR_SWING } from '../../src/systems/housing/homebridge.js';
import { napFade } from '../../src/systems/housing/activities.js';
import { holoLayout, HOLO_GRAB } from '../../src/systems/housing/holodeck.js';
import { castPoint, fishCount, fishLen, ANGLE } from '../../src/systems/housing/angling.js';
import { petLevel, petBoost, messesAt, rhythmError, PLAY } from '../../src/systems/housing/petplay.js';

const DAY = 24 * 3600 * 1000;

function fakePlayer(i, x = 0, z = 0, y = 0) {
  const style = PLAYER_STYLE[i];
  return {
    index: i, style, name: style.name, score: 0, radius: 0.6,
    position: new THREE.Vector3(x, y, z), velocity: new THREE.Vector3(),
  };
}

export async function housingChecks({ ok, world }) {
  console.log('\n--- custom housing: roads, floors, money, locks ---');
  localStorage.removeItem(HOME_KEY);
  const toasts = [];
  const game = {
    world, scene: new THREE.Scene(), players: [],
    kotodama: { price: 650 }, sessionCast: new Map(),
    toast: (t, i) => toasts.push([i, t]),
    onScoreChanged: () => {}, audio: null,
    inspector: { openExt: () => true, cards: [], closeOne() {}, extOf: () => null },
  };
  const sigBefore = worldSig(world);
  const H = new Housing(game);
  H.build();
  ok('housing builds four islands, one per site, none of them in world.islands',
    H.isles.length === HOME_SITES.length && H.isles.every((I) => !world.islands.includes(I.island)));

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
  ok('...and is written down that frame, not when the scene ends', !!JSON.parse(localStorage.getItem(HOME_KEY)).homes.sunrise);
  ok('...priced at 8 orbs, rounded to a ten', minka === 5200, minka);
  ok('one home each: a second purchase is refused, with a reason',
    !H.buy('cloudpeak', 'minka', [{ p: p0, share: 0 }]).ok);
  ok('the world\'s signature does not move because somebody bought a house', worldSig(world) === sigBefore);
  ok('a bought bridge is ground, from the town to her island',
    H.heightAt(mid.x ?? mid.pos?.x, mid.z ?? mid.pos?.z, (mid.y ?? mid.pos?.y) + 0.3)?.platform?.home === true);
  ok('...and World.heightAt finds it', world.heightAt(mid.x ?? mid.pos?.x, mid.z ?? mid.pos?.z, (mid.y ?? mid.pos?.y) + 0.3)?.platform?.home === true);

  /* FLOORS: every floor of every house is walkable from its door. */
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
      ok(`${h.name}: every ramp climbs smoothly from one floor to the next`, climbs.every((w) => w < 0.6), climbs.map((w) => w.toFixed(2)).join(','));
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
      B.gates?.length === 2 && B.doorSegments().length === 2 && B.jukeboxSpots?.length === 2 && !!B.statue2);
    const [G0, G1] = B.gates;
    const gyEnd = I0.island.heightAt(B.statue2.position.x, B.statue2.position.z) ?? I0.groundY;
    ok('...and the far end stands on HER island, not out over the sky',
      Math.abs(B.statue2.position.y - gyEnd) < 0.5 && Math.hypot(G1.cx - B.end.x, G1.cz - B.end.z) < 3,
      `${B.statue2.position.y.toFixed(2)} vs ${gyEnd.toFixed(2)}`);
    const at = (pl, Gt) => { pl.position.set(Gt.cx + Gt.fx * 1.5, Gt.y, Gt.cz + Gt.fz * 1.5); };
    const own = fakePlayer(0);
    at(own, G0);
    ok('an owner at the gate is offered it', H._spotFor(own)?.act === 'gates' && /CLOSE THE GATES/.test(H.prompt(own, 'E') ?? ''));
    B.update(DOOR_SWING * 2, 0);   // the unlock above has swung them open by now
    const wasLocked = H.locked(Hs);
    H.interact(own);
    ok('...and pressing it SHUTS them', !wasLocked && H.locked(Hs) && B.openWant === 0);
    B.update(DOOR_SWING / 2, 0);
    const halfK = B.openK;
    const halfRot = G0.leaves[0].rotation.y;
    B.update(DOOR_SWING, 0);
    ok('...swinging, not snapping: halfway through the swing they are halfway shut',
      Math.abs(halfK - 0.5) < 0.01 && Math.abs(halfRot - G0.leaves[0].userData.ry) > 0.1 && B.openK === 0
      && Math.abs(G0.leaves[0].rotation.y - G0.leaves[0].userData.ry) < 1e-9,
      `k ${halfK} rot ${halfRot} ry ${G0.leaves[0].userData.ry} final ${B.openK} ${G0.leaves[0].rotation.y}`);
    ok('...and the force field is up across BOTH ends while they are shut', B.gates.every((Gt) => Gt.field.visible && Gt.fieldMat.opacity > 0.05));
    const n0 = toasts.length;
    const visitor = fakePlayer(1);
    at(visitor, G1);
    H.interact(visitor);
    ok('a visitor at the gate is told whose gates they are, and they stay shut',
      H.locked(Hs) && toasts.slice(n0).some(([i, t]) => i === 1 && /only she can open them/.test(t)));
    at(own, G1);
    H.interact(own);
    B.update(DOOR_SWING * 2, 0);
    ok('...and the owner opens them again from her own end', !H.locked(Hs) && B.openK === 1 && B.gates.every((Gt) => !Gt.field.visible));
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
      yardWhy(Hm, it, 0, -48), yardWhy(Hm, it, 0, -(hr + 1)), yardWhy(Hm, it, 0, 20), null,
    ];
    addOutdoor(Hm, 'koipond', -25, -20, 0);
    why[3] = yardWhy(Hm, it, -25, -14);
    ok('the yard refuses the rim, the house, the path to the bridge and another thing — each with its reason',
      /edge/.test(why[0]) && /house/.test(why[1]) && /path/.test(why[2]) && /overlaps the KOI POND/.test(why[3]), why.join(' | '));
    ok('...and takes a clear spot', yardWhy(Hm, it, 25, -20) === null);
    const spot = firstYardSpot(Hm, ITEM_BY_ID.treehouse, 50);
    ok('...and finds room for the treehouse on an island with a pond on it', !!spot && yardWhy(Hm, ITEM_BY_ID.treehouse, spot.x, spot.z) === null);
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
    ok('...and selling asks first, NO on top', /_v_sellitem[\s\S]{0,900}title: `NO, KEEP THE[\s\S]{0,200}title: `YES, SELL IT FOR/.test(csrc));
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
    ok('a kitten held by a home activity is handed a dead pad', /inspector\?\.busy\(i\)\s*\|\| this\.housing\?\.activities\?\.holds\(i\)\)/.test(msrc));
  }

  /* THINGS TO DO AT HOME. Every hold ends by itself, and pays what it says. */
  {
    const A = H.activities;
    ok('the nap fades in, holds black, and fades out', napFade(0) === 0 && napFade(2) === 1 && Math.abs(napFade(3.5) - 0.5) < 1e-9 && napFade(4) === 0);
    const ps = [0, 1, 2].map((i) => ({ ...fakePlayer(i), hp: 50, maxHp: 100, baseMaxHp: 100 }));
    game.players = ps;
    H.store.boons = {};
    const isle = { spots: [{ act: 'sit', item: 'kotatsu' }], x: 0, z: 0 };
    const home = { site: 'test', owners: ps.map((p) => p.name) };
    A.start(ps[0], { act: 'nap', x: 0, z: 0, y: 0, isle, home });
    ok('a nap holds her still and hides her under the covers', A.holds(0) && ps[0].homePose === 'hidden');
    A.start(ps[1], { act: 'pray', x: 0, z: 0, y: 0, isle, home });
    H.musicSite = 'test';
    ok('praying starts the shrine\'s song, and it outranks the boombox', !!A.prayer && H.musicTrack() === 'shrinePrayer');
    for (let k = 0; k < 60; k++) A.update(0.1, ps);
    ok('...the nap ends by itself and she wakes fully rested', !A.holds(0) && ps[0].hp === 100 && !ps[0].homePose);
    ok('...and the prayer ends by itself, BLESSED', !A.holds(1) && H.store.boons[ps[1].name]?.bless === true);
    for (let k = 0; k < 400; k++) A.update(0.1, ps);
    ok('...and the song gives way again once it is over', !A.prayer && H.musicTrack() !== 'shrinePrayer');
    H.musicSite = null;
    // the meal: two cook, both sit at the same kotatsu
    const kitchen = { act: 'cook', x: 0, z: 0, y: 0, isle, home };
    const table = { act: 'sit', item: 'kotatsu', x: 0, z: 0, y: 0, isle, home, room: 'r', k: 0 };
    A.start(ps[0], kitchen);
    A.start(ps[0], kitchen);
    ok('one plate each — cooking a second says why it will not', /already carrying/.test(toasts.at(-1)?.[1] ?? ''));
    A.start(ps[2], kitchen);
    A.start(ps[0], table);
    A.start(ps[2], table);
    ok('two kittens with plates sit at one table, held', A.holds(0) && A.holds(2) && A.meals.size === 1);
    for (let k = 0; k < 100; k++) A.update(0.1, ps);
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
    const p = fakePlayer(0);
    H.browsing.clear();
    H.browse(0, HOME_SITES[0].id);
    const f0 = H.cameraFocus(p);
    const at0 = f0.centre.clone();
    H.browse(0, HOME_SITES[1].id);
    const b = H.browsing.get(0);
    b.ft = TOUR.look * 0.5;
    const look = H.cameraFocus(p);
    const I1 = H.isleOf(HOME_SITES[1].id);
    const toward = Math.atan2(at0.x - I1.x, at0.z - I1.z);
    ok('a new island is LOOKED AT first: the centre stays, the camera turns to face it',
      look.centre.distanceTo(at0) < 1e-6 && Math.abs(look.yaw - toward) < 1e-6);
    b.ft = TOUR.look + TOUR.fly * 0.5;
    const mid = H.cameraFocus(p).centre.clone();
    const d0 = Math.hypot(mid.x - at0.x, mid.z - at0.z);
    const d1 = Math.hypot(mid.x - I1.x, mid.z - I1.z);
    ok('...then FLIES, and is halfway there halfway through', d0 > 10 && d1 > 10 && Math.abs(d0 - d1) < 1, `${d0.toFixed(1)} / ${d1.toFixed(1)}`);
    ok('...over two to three seconds', TOUR.fly >= 2 && TOUR.fly <= 3);
    b.ft = TOUR.look + TOUR.fly + 0.01;
    const end = H.cameraFocus(p).centre;
    ok('...and arrives', Math.hypot(end.x - I1.x, end.z - I1.z) < 1e-6);
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
    ok('browsing the boombox plays the row under the cursor, even off the bridge', heard === JUKEBOX[2].id || heard === JUKEBOX[2].fallback, heard);
    H.audition = null;
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
  ok('...and every recording in the table is a jukebox track with a loop', Object.entries(JUKEBOX_FILES).every(([id, F]) =>
    JUKEBOX.some((j) => j.id === id) && F.loop?.[1] > F.loop?.[0] && F.mix > 0), Object.keys(JUKEBOX_FILES).join(' '));
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
      F.wins === 0 && toasts.slice(n1).some(([i, t]) => i === 0 && /throw it further/.test(t)), `${F.wins} wins, ${toasts.slice(n1).map((t) => t[1]).join(' | ')}`);
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

    const I = H.isles[2];
    const Hm = newHome(I.site.id, 'minka', ['Ember']);
    Hm.rooms = { main: { type: 'holodeck', items: [] } };
    I.setHome(Hm, null);
    const R = I.holoRooms[0];
    const tube = I.spots.find((s) => s.act === 'holodeck');
    ok('a holodeck room has three racks and her tube, with a way out of it',
      I.holoRooms.length === 1 && R.racks.length === 3 && !!tube && Math.abs(Math.hypot(tube.out.x, tube.out.z) - 1) < 1e-6);
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

  localStorage.removeItem(HOME_KEY);
}
