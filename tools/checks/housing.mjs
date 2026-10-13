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
import { Housing } from '../../src/systems/housing/housing.js';
import { HOME_SITES, HOUSES, HOUSE_BY_ID, PRESETS, ITEM_BY_ID, priceOf, HOME_SELL, SPEED_STRIP } from '../../src/systems/housing/catalog.js';
import { emptyStore, newHome, normalise, saveStore, loadStore, HOME_KEY } from '../../src/systems/housing/homestore.js';
import { careLevel, careBuff, stalksAt, BAMBOO_GROW, BAMBOO_MAX } from '../../src/systems/housing/farm.js';
import { fits, firstFit, gridOf, autoLayout, ITEM_SELL } from '../../src/systems/housing/editor.js';
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
    const yard = Object.keys(Hm.yard).length;
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
    Hm.yard = { p1: 'koipond' };
    ok('the shop says how many of each thing she owns, 0 included', ownedCount(Hm, 'koipond') === 1 && ownedCount(Hm, 'futon') === 0
      && /YOU HAVE \$\{ownedCount\(H, it\.id\)\}/.test(src));
    ok('the home card has no music row and no file rows (the boombox and the debug panel have them)',
      !/PICK THE BRIDGE MUSIC|SAVE HOMES TO A FILE|LOAD HOMES FROM A FILE/.test(src));
    const msrc0 = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
    ok('...and the debug panel does, both asking first', /row\('HousingExport'/.test(msrc0) && /row\('HousingImport'/.test(msrc0)
      && /_debugHousingImport\(\) \{[\s\S]{0,300}confirm\.ask\(/.test(msrc0));
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
