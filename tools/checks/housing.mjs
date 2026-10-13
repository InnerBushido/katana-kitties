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
import { napFade } from '../../src/systems/housing/activities.js';

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

  /* THE HOLODECK'S WAY HOME, against a stand-in Dream Dojo that walks her
     through the real phase names. Home only once she has BEEN in, and only
     once the walk-out and the un-suit are done; a kitten who walked off
     before the rise is left at the arcade, and a tournament forgets the way. */
  {
    const fake = { realm: null, phase: null };
    game.dream = { realmOf: () => fake.realm, stateOf: () => ({ phase: fake.phase }) };
    const kit = { name: 'Ember', index: 0, position: new THREE.Vector3(500, 0, 500), velocity: new THREE.Vector3() };
    const at = () => Math.round(kit.position.x);
    const step = (realm, phase) => { fake.realm = realm; fake.phase = phase; H._holoHome([kit]); return at(); };
    kit.homeReturn = { x: 7, y: 0, z: 9, seen: false };
    const trail = [step(null, 'suit'), step(null, 'rise'), step('sim', 'sim'), step(null, 'walkout'), step(null, 'unsuit'), step(null, null)];
    ok('the holodeck sends her home only after the sim AND the un-suit', trail.join() === '500,500,500,500,500,7' && !kit.homeReturn,
      trail.join());
    kit.position.set(500, 0, 500);
    kit.homeReturn = { x: 7, y: 0, z: 9, seen: false };
    step(null, null);
    ok('...and leaves her at the arcade if she walked off before going in', at() === 500 && !kit.homeReturn);
    kit.homeReturn = { x: 7, y: 0, z: 9, seen: true };
    game.tournament = { active: true };
    step(null, null);
    ok('...and a tournament forgets the way home rather than taking it', at() === 500 && !kit.homeReturn);
    game.tournament = null;
    game.dream = null;
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
