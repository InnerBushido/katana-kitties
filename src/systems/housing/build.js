import * as THREE from 'three';
import { HOUSE_BY_ID, ITEM_BY_ID, LINK_BY_ID, houseSpecs, homeRooms, roomById, roomsListed, roomWith } from './catalog.js';
import { fits, footprint, gridOf, wallSlots, wallFree, yardWhy, yardR, addOutdoor, houseWhy, openingWhy } from './editor.js';
import { drawItem, placeModel } from './models.js';
import { WALL_Y, YARD_BUILT, roomLook } from './homeisle.js';
import { buildHouseShell, houseFoot, houseFoots, houseRadius, houseHeight } from './homehouse.js';
import { mergeParts } from '../../world/build.js';
import { toonVertexMat } from '../../core/gfx.js';
import { linkWhy, linkGeom, linkAll, portSpots, endAt, defaultVia, supportGround, LINK_MAX, LINK_TURNS_MAX } from './links.js';

/* ---------------------------------------------------------------------------
   BUILD MODE — placing a thing in the world, not on a chart.

   Richard, Oct 2026: "When placing furniture, the camera should go to a top
   down view of the house, and the player should be able to place the item in
   3D space with the UI mostly hidden. There can be a 2D minimap in the corner
   showing the position and rotation ... with a key legend", and "there should
   be a 3D selector for moving furniture around, can move and rotate the
   furniture", and "a 3D way of player being able to place things exactly
   where they want it rather than having predetermined locations".

   THREE KINDS OF PLACE, ONE MODE:
     room — the tatami grid; the stick steps a cell, ATTACK turns a quarter
     wall — the 2-unit spans of the outer walls; the stick hops to the next
            span in the direction it is pushed, across corners
     yard — anywhere on her island; the stick slides it, ATTACK turns 45°

   THE STATE IS THE CARD'S VIEW ROW (`top`, cards.js), and this module only
   reads and moves it — so the card, the ghost, the camera and the minimap
   cannot disagree about where the thing is, because there is one of it.

   THE BUTTONS. The old grid card moved the piece with the stick AND kept its
   SELL row under a cursor the stick could no longer reach — Richard: "Can't
   sell furniture as the up and down buttons are overridden by the placement
   controls". So in build mode NOTHING is a row the stick has to reach:
       JUMP     put it here          SPRINT   sell it back (asks first)
       ATTACK   turn it              INTERACT back out, nothing changed
   and on a phone the same four are buttons on the card.

   THE SELECTOR (`pick`) is the same camera with a ring on one of her things;
   the stick hops the ring to the nearest thing that way, JUMP picks it up
   into build mode, SPRINT sells it.
--------------------------------------------------------------------------- */

/** The usual camera yaw (Player's CAM_YAW), for the short way round. */
const CAM_YAW = -Math.PI * 0.25;
/** How fast a yard thing slides under a full stick, units a second. */
const YARD_SPEED = 13;
/** Repeat for the stepped kinds (grid cells, wall spans, the selector). */
const STEP_DELAY = 0.24;
const STEP_RATE = 0.13;

/**
 * Of `list` (each with house-local x, z), the one nearest in direction
 * (dx, dz) from `from`. A thing more than 60° off the push is not "that way".
 * Returns its index, or -1.
 */
export function stepToward(list, from, dx, dz) {
  const m = Math.hypot(dx, dz) || 1;
  const ux = dx / m, uz = dz / m;
  let best = -1, bs = Infinity;
  list.forEach((q, k) => {
    const vx = q.x - from.x, vz = q.z - from.z;
    const d = Math.hypot(vx, vz);
    if (d < 0.05) return;
    const cos = (vx * ux + vz * uz) / d;
    if (cos < 0.5) return;
    // nearer wins, and straighter wins: a thing dead ahead at 6 beats one 50° off at 4
    const s = d * (2 - cos);
    if (s < bs) { bs = s; best = k; }
  });
  return best;
}

/** House-local centre of a room-grid placement. 1 cell = 2 units. */
export function cellLocal(room, it, gx, gz, rot = 0) {
  const [cw, cd] = footprint(it, rot);
  return { x: room.cx - room.w / 2 + (gx + cw / 2) * 2, z: room.cz - room.d / 2 + (gz + cd / 2) * 2 };
}

/* THE FURNITURE RIDES WITH THE HOUSE BEING MOVED. Richard, Oct 2026: "When
   moving a house that has furniture inside it, either the furniture should
   be disabled while the house moves, or should be parented to the house and
   move with it ... parenting would be best." The ghost was the shell alone,
   and the real house hidden — so her futon and kotatsu stood on the empty
   lawn where the house had been. Every mesh that belongs to the house (its
   furniture, its windows, a dojo's floor) is carried by the ghost's move:
   ghost * inverse(where the house stood) * where the thing stood, which is
   what a child of the house group would get. `uncarry` puts each back on
   its own transform; if the house was put down, `rebuildItems` has already
   replaced them anyway. */
const _D = new THREE.Matrix4();
const _M = new THREE.Matrix4();

export function carry(G, I, hk, real) {
  if (G.carry && G.carry.hk !== hk) uncarry(G);
  if (!G.carry) {
    const list = [];
    for (const o of I.itemGroup.children) {
      if (o.userData.floor == null || (o.userData.hk ?? 'main') !== hk) continue;
      list.push({ o, m: new THREE.Matrix4().compose(o.position, o.quaternion, o.scale) });
    }
    G.carry = { hk, list };
  }
  G.group.updateMatrix();
  real.updateMatrix();
  _D.copy(real.matrix).invert().premultiply(G.group.matrix);
  for (const { o, m } of G.carry.list) _M.multiplyMatrices(_D, m).decompose(o.position, o.quaternion, o.scale);
}

export function uncarry(G) {
  for (const { o, m } of G?.carry?.list ?? []) m.decompose(o.position, o.quaternion, o.scale);
  if (G) G.carry = null;
}

/**
 * THE BRIDGE A LINK VIEW IS ABOUT: its two doors (the other one is the cursor
 * until it is chosen) and, with turns, their corners — the defaults while she
 * is still picking the door, so the ghost already bends, and hers once she is
 * placing them.
 */
export function linkOf(H, top) {
  const n = top.turns ?? 0;
  const b = top.b ?? top.cur;
  const via = !n ? undefined : top.vk != null ? top.via.slice(0, n) : defaultVia(H, top.a, b, n);
  return { a: top.a, b, style: top.style, via };
}

/**
 * Why `top` cannot go where it is, as a sentence; null when it can. Pure:
 * world-check asks it with hand-made homes.
 */
export function buildWhy(H, top, siteR = 50) {
  const env = typeof siteR === 'number' ? { r: siteR } : siteR;
  if (top.kind === 'house') {
    return houseWhy(H, { hk: top.sel === -1 ? null : top.sel, house: top.id, x: top.x, z: top.z, rot: top.rot ?? 0 }, env);
  }
  if (top.kind === 'link') {
    if (!top.a) return null;
    return linkWhy(H, linkOf(H, top), env);
  }
  const it = ITEM_BY_ID[top.id];
  if (!it) return 'Nothing to place.';
  if (top.kind === 'room') {
    const room = roomById(H, top.room);
    const R = H.rooms?.[top.room];
    if (!room) return 'That room is gone.';
    if (fits(roomWith(room, R), R?.items ?? [], it, top.gx, top.gz, top.rot, top.sel)) return null;
    // a mixed room's zones say which (catalog `mixed`)
    if (room.mixed && it.holo) return 'The holodeck gear stays on the holodeck — the dark floor.';
    if (room.mixed && fits(room, R?.items ?? [], it, top.gx, top.gz, top.rot, top.sel)) return "That is the dojo's or the holodeck's floor — put it on the tatami.";
    return "It doesn't fit there — move it to a clear spot.";
  }
  if (top.kind === 'wall') {
    const room = roomById(H, top.room);
    const S = room && wallSlots(room.house, room).find((s) => s.side === top.side && s.k === top.k);
    if (!S) return 'There is no wall there.';
    if (it.ground && room.floor !== 0) return 'A sliding door goes on the ground floor — it has to lead outside.';
    // a bridge's doorway is a hole: nothing hangs in it
    const at = S.side % 2 ? S.z : S.x;
    for (const L of H.links ?? []) {
      for (const e of [L.a, L.b]) {
        const w = (LINK_BY_ID[L.style] ?? LINK_BY_ID.plank).w;
        if (e.hk === room.hk && e.floor === room.floor && e.side === S.side && Math.abs(e.at - at) < w / 2 + 1.1) return 'A bridge door is there.';
      }
    }
    if (!wallFree(H.rooms?.[top.room], top.side, top.k, top.sel)) return 'Something already hangs there.';
    return openingWhy(room, H.rooms?.[top.room], S, it.id, top.sel);
  }
  return yardWhy(H, it, top.x, top.z, top.sel, { ...env, rot: top.rot ?? 0 });
}

/**
 * Write `top` into the home: a new thing (sel < 0) or a moved one. Spending
 * is the caller's; this is the bookkeeping, pure, so the check can run it.
 */
export function commitBuild(H, top) {
  if (top.kind === 'room') {
    const R = (H.rooms[top.room] ??= { type: 'living', items: [] });
    R.items ??= [];
    const row = { id: top.id, gx: top.gx, gz: top.gz, rot: top.rot ?? 0 };
    if (top.sel < 0) R.items.push(row); else Object.assign(R.items[top.sel], row);
  } else if (top.kind === 'wall') {
    const R = (H.rooms[top.room] ??= { type: 'living', items: [] });
    R.wall ??= [];
    const row = { id: top.id, side: top.side, k: top.k };
    if (top.sel < 0) R.wall.push(row); else Object.assign(R.wall[top.sel], row);
  } else if (top.sel < 0) {
    addOutdoor(H, top.id, +top.x.toFixed(2), +top.z.toFixed(2), top.rot ?? 0);
  } else {
    Object.assign(H.outdoor[top.sel], { x: +top.x.toFixed(2), z: +top.z.toFixed(2), rot: top.rot ?? 0 });
  }
  return H;
}

/** Take a placed thing out of the home (a sale). Returns the row, or null. */
export function removeBuilt(H, kind, room, sel) {
  const list = kind === 'yard' ? H.outdoor : kind === 'wall' ? H.rooms?.[room]?.wall : H.rooms?.[room]?.items;
  if (!list?.[sel]) return null;
  return list.splice(sel, 1)[0];
}

/** Her things of this kind, with house-local positions, for the selector. */
/** The ring under a small thing, and how far past a big thing's edge it shows (`ringR`). */
export const RING_R = 1.4;
export const RING_PAD = 0.45;
const _ringR = new Map();

/**
 * THE RING FITS THE THING. Richard, Oct 2026: "The yellow selection circle
 * below big items like the table is not visible, it should scale with the
 * size of the item and its collision area when placing/selecting, unless it
 * is a small item where it can stay its current size." Every furnishing had
 * the same 1.4 ring, and a kotatsu is 3.6 across, so its ring was under it.
 * Now: the drawn footprint's longer half, past it by RING_PAD, and never
 * smaller than RING_R. Measured off the same model the room draws
 * (`placeModel`, at her `look`), once per item and size.
 */
export function ringR(it, look = null) {
  if (!it) return RING_R;
  const key = `${it.id}:${look?.s ?? 1}:${look?.style ?? ''}`;
  let r = _ringR.get(key);
  if (r == null) {
    const b = new THREE.Box3().setFromObject(placeModel(it.model, drawItem(it.id, 2), it.size, look));
    const half = b.isEmpty() ? 0 : Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2;
    r = Math.max(RING_R, half + RING_PAD);
    _ringR.set(key, r);
  }
  return r;
}

/**
 * A YARD-BUILT THING, built for real in a sandbox: the island's own
 * `_yardItem`, with every list it would register into (colliders, decks,
 * walls, seats, effects) swapped out for the call and put back after, so the
 * mesh comes out and the island does not change. Build mode's ghost and the
 * shop's turntable (preview.js) both use it — so the koi pond on the card is
 * the koi pond in the yard, not a box. Null if the island cannot build it.
 */
export function yardBody(I, it) {
  if (!I?._yardItem || !it) return null;
  const keep = [I.places, I.spots, I.obstacles, I.decks, I.walls, I.fxSites];
  I.places = new Map(); I.spots = []; I.obstacles = []; I.decks = []; I.walls = []; I.fxSites = [];
  let body = null;
  try {
    body = I._yardItem(it, { uid: -1, id: it.id, x: 0, z: 0, rot: 0 });
    body.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
  } catch (e) {
    body = null;
  }
  [I.places, I.spots, I.obstacles, I.decks, I.walls, I.fxSites] = keep;
  return body;
}

export function pickList(H, kind, roomId) {
  if (kind === 'yard') return (H.outdoor ?? []).map((q, k) => ({ k, id: q.id, x: q.x, z: q.z }));
  if (kind === 'house') return houseSpecs(H).map((s, k) => ({ k, hk: s.hk, id: s.house, x: s.x, z: s.z, rot: s.rot }));
  if (kind === 'link') {
    return (H.links ?? []).map((L, k) => {
      const G = linkGeom(H, L);
      return G && { k, uid: L.uid, id: L.style, x: (G.A.x + G.B.x) / 2, z: (G.A.z + G.B.z) / 2 };
    }).filter(Boolean);
  }
  const room = roomById(H, roomId);
  const R = H.rooms?.[roomId];
  if (!room || !R) return [];
  if (kind === 'wall') {
    const slots = wallSlots(room.house, room);
    return (R.wall ?? []).map((q, k) => {
      const S = slots.find((s) => s.side === q.side && s.k === q.k);
      return S && { k, id: q.id, x: S.x, z: S.z };
    }).filter(Boolean);
  }
  return (R.items ?? []).map((q, k) => {
    const it = ITEM_BY_ID[q.id];
    return it && { k, id: q.id, ...cellLocal(room, it, q.gx, q.gz, q.rot) };
  }).filter(Boolean);
}

/** The key legend, said the same on the card and in the check. `step` is
 *  filled in with the turn step she has now ("RIDE  step 45°"). */
export const BUILD_KEYS = [
  ['STICK', 'move'], ['ATTACK', 'turn'], ['RIDE', 'step'], ['JUMP', 'put it here'], ['SPRINT', 'sell'], ['INTERACT', 'back'],
];

/* HOW FAR ONE PRESS OF ATTACK TURNS IT. Richard, Oct 2026: "rotation of
   walking paths should be in 15 degree increments ... the RIDE button toggles
   between 15, 30, and 45 degrees ... default should be 45 degrees except for
   walking paths which is 15". Only the free-standing kinds (the yard, and a
   house on its lawn) have an angle to step; a room thing sits on the tatami
   grid and turns a quarter at a time, and RIDE says so rather than doing
   nothing. The step lives on the build view, so it is hers for as long as
   she holds this thing and starts from the default for the next one. */
export const ROT_STEPS = [15, 30, 45];
export const freeTurn = (top) => top.kind === 'yard' || top.kind === 'house';
export const rotStepOf = (top) => top.rotStep ?? (ITEM_BY_ID[top.id]?.path ? 15 : 45);
export const PICK_KEYS = [['STICK', 'choose'], ['JUMP', 'pick it up'], ['ATTACK', 'customize'], ['SPRINT', 'sell'], ['INTERACT', 'back']];
export const CUSTOM_PICK_KEYS = [['STICK', 'choose'], ['JUMP', 'customize'], ['INTERACT', 'back']];


/** See-through copies of every material under `root`, so the original is untouched. */
function ghostly(root) {
  root.traverse((o) => {
    if (!o.isMesh || o.userData.ghost) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    const out = ms.map((m) => {
      const c = m.clone();
      c.transparent = true;
      c.opacity = 0.92;
      c.depthWrite = false;
      return c;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
    o.userData.ghost = true;
    o.renderOrder = 5;
  });
  return root;
}

const _fb = new THREE.Box3();

export class BuildMode {
  constructor(housing) {
    this.H = housing;
    /** index → { group, mesh, ring, key, hid } */
    this.ghosts = new Map();
    this._ok = new THREE.Color(0x5ad27a);
    this._bad = new THREE.Color(0xe84a4a);
    this._sel = new THREE.Color(0xffd34a);
  }

  /** The card's top row for this kitten if it is a build or a pick, else null. */
  topOf(index) {
    const C = this.H.game.housingCards;
    const top = C?._top?.(index);
    return top && (top.v === 'build' || top.v === 'pick') ? top : null;
  }

  isle(top) { return this.H.isleOf(top.site); }
  home(top) { return this.H.store.homes[top.site]; }
  roomOf(H, top) { return roomById(H, top.room); }

  /** House-local position of whatever the view is pointing at. */
  localOf(top) {
    const H = this.home(top);
    if (!H) return { x: 0, z: 0 };
    if (top.v === 'pick') {
      const L = pickList(H, top.kind, top.room);
      return L[Math.min(top.at ?? 0, L.length - 1)] ?? { x: 0, z: 0 };
    }
    if (top.kind === 'yard' || top.kind === 'house') return { x: top.x, z: top.z };
    if (top.kind === 'link') {
      if (top.vk != null && top.via?.[top.vk]) return top.via[top.vk];
      return top.cur ? (endAt(H, top.cur) ?? { x: 0, z: 0 }) : { x: 0, z: 0 };
    }
    const room = this.roomOf(H, top);
    if (!room) return { x: 0, z: 0 };
    if (top.kind === 'wall') {
      const S = wallSlots(room.house, room).find((s) => s.side === top.side && s.k === top.k);
      return S ?? { x: room.cx, z: room.cz };
    }
    return cellLocal(room, ITEM_BY_ID[top.id], top.gx, top.gz, top.rot);
  }

  /**
   * WHERE A THING IS, IN THE WORLD. A room or wall thing's position is in its
   * HOUSE's frame and a yard thing's (and a house's, and a bridge door's) in
   * the island's — the one place that knows which.
   */
  worldOf(I, H, top, L) {
    if (top.kind === 'room' || top.kind === 'wall') {
      const room = this.roomOf(H, top);
      if (room) return I.roomLocal(room, L.x, L.z);
    }
    return I.local(L.x, L.z);
  }

  /* -------------------------------- input ------------------------------- */

  /**
   * The pad, while a build or pick view is up. Returns true when the frame's
   * input was spent here. INTERACT is left to the card (it is BACK), and
   * START to the inspector (it is CLOSE).
   */
  drive(index, pad, dt) {
    const top = this.topOf(index);
    if (!top) return false;
    if (pad.pressed('interact')) return false;
    const C = this.H.game.housingCards;
    const mx = pad.mx ?? 0, my = pad.my ?? 0;
    const push = Math.hypot(mx, my) > 0.45;
    if (top.v === 'pick') {
      if (this._repeat(top, push, dt)) {
        const H = this.home(top);
        const L = pickList(H, top.kind, top.room);
        const cur = L[top.at ?? 0];
        const k = cur ? stepToward(L, cur, mx, my) : -1;
        if (k >= 0) { top.at = k; this.H.game.audio?.play?.('menu'); }
      }
      if (pad.pressed('jump')) { pad.consume?.('jump'); if (top.mode === 'custom') C.customize(index, top); else C.pickUp(index, top); return true; }
      if (pad.pressed('attack')) { pad.consume?.('attack'); C.customize(index, top); return true; }
      if (pad.pressed('sprint')) { pad.consume?.('sprint'); C.askSell(index, top); return true; }
      return push;
    }
    // ---- build
    if (top.kind === 'link') {
      if (top.vk != null) {
        // placing a turn: the stick slides it like a yard thing; ATTACK makes it a curve or a corner
        const v = top.via?.[top.vk];
        if (push && v) {
          v.x += mx * YARD_SPEED * dt;
          v.z += my * YARD_SPEED * dt;
          const r = Math.hypot(v.x, v.z), max = (this.isle(top)?.radius ?? 50) - 2;
          if (r > max) { v.x *= max / r; v.z *= max / r; }
        }
        if (pad.pressed('attack')) { pad.consume?.('attack'); this.turnSmooth(index, top); }
      } else if (top.counting) {
        // both doors chosen: LEFT and RIGHT say how many turns (`linkCount`)
        if (this._repeat(top, push && Math.abs(mx) > Math.abs(my), dt)) this.linkCount(index, top, Math.sign(mx));
      } else {
        // the stick hops between the doorways on this floor; ATTACK goes up a floor
        if (this._repeat(top, push, dt)) this.hopPort(top, mx, my);
        if (pad.pressed('attack')) { pad.consume?.('attack'); this.portFloor(top); }
      }
      if (pad.pressed('jump')) { pad.consume?.('jump'); C.placeHere(index, top); return true; }
      if (pad.pressed('sprint')) { pad.consume?.('sprint'); C.linkBack(index, top); return true; }
      return true;
    }
    if (top.kind === 'yard' || top.kind === 'house') {
      if (push) {
        const I = this.isle(top);
        top.x += mx * YARD_SPEED * dt;
        top.z += my * YARD_SPEED * dt;
        const r = Math.hypot(top.x, top.z);
        const max = (I?.radius ?? 50) - 2;
        if (r > max) { top.x *= max / r; top.z *= max / r; }
      }
    } else if (this._repeat(top, push, dt)) {
      if (top.kind === 'room') this.nudge(top, Math.abs(mx) > Math.abs(my) ? Math.sign(mx) : 0, Math.abs(mx) > Math.abs(my) ? 0 : Math.sign(my));
      else this.hop(top, mx, my);
    }
    if (pad.pressed('attack')) { pad.consume?.('attack'); this.rotate(top); }
    if (pad.pressed('mount')) { pad.consume?.('mount'); this.turnStep(index, top); }
    if (pad.pressed('jump')) { pad.consume?.('jump'); C.placeHere(index, top); return true; }
    if (pad.pressed('sprint')) { pad.consume?.('sprint'); C.askSell(index, top); return true; }
    return true;
  }

  /**
   * LEFT or RIGHT once both doors are chosen: one turn fewer or more, and
   * what that costs, out loud. Richard, Oct 2026: "Player should be able to
   * build as many bridge sections as they want instead of limiting it to
   * only 3 currently. This may require user to press left/right when
   * selecting to inc/dec the amount rather than pressing a button." It was
   * RIDE cycling 0-3 while she was still picking doors. At either end it
   * stops and says so rather than wrapping (non-negotiable 6).
   */
  linkCount(index, top, d) {
    const was = top.turns ?? 0;
    const n = Math.max(0, Math.min(LINK_TURNS_MAX, was + d));
    if (n === was) {
      this.H.game.toast(n ? `${n} turns is the most a bridge can have.` : 'No turns is a straight bridge — RIGHT adds one.', index);
      return;
    }
    top.turns = n;
    this.H.game.toast(n ? `${n} turn${n > 1 ? 's' : ''} — the bridge comes in ${n + 1} parts. Each turn adds a quarter to its price.`
      : 'A straight bridge, no turns.', index);
    this.H.game.audio?.play?.('menu');
  }

  /** The touch pad's TURNS button: one more, round to none after the most. */
  linkTurns(index, top) {
    const n = top.turns ?? 0;
    this.linkCount(index, top, n >= LINK_TURNS_MAX ? -n : 1);
  }

  /** ATTACK on a turn being placed: a sharp corner or a smooth curve (another quarter). */
  turnSmooth(index, top) {
    const v = top.via?.[top.vk];
    if (!v) return;
    v.smooth = !v.smooth;
    this.H.game.toast(v.smooth ? 'A smooth curve here — it adds a quarter to the price.' : 'A sharp corner here.', index);
    this.H.game.audio?.play?.('menu');
  }

  /** RIDE: 15 → 30 → 45 → 15 degrees a turn, said out loud each time. */
  turnStep(index, top) {
    if (!freeTurn(top)) {
      this.H.game.toast(top.kind === 'wall' ? 'Things on a wall always face the room.' : 'Inside, things turn a quarter at a time — press ATTACK.', index);
      return;
    }
    const k = ROT_STEPS.indexOf(rotStepOf(top));
    top.rotStep = ROT_STEPS[(k + 1) % ROT_STEPS.length];
    this.H.game.toast(`ATTACK now turns it ${top.rotStep}°.`, index);
    this.H.game.audio?.play?.('menu');
  }

  /** Held-stick repeat for the stepped kinds: true on the frames it steps. */
  _repeat(top, push, dt) {
    if (!push) { top._hold = 0; return false; }
    if (!top._hold) { top._hold = STEP_DELAY; return true; }
    top._hold -= dt;
    if (top._hold <= 0) { top._hold = STEP_RATE; return true; }
    return false;
  }

  nudge(top, dx, dz) {
    const H = this.home(top);
    const room = this.roomOf(H, top);
    if (!room) return;
    const { cols, rows } = gridOf(room);
    const [w, d] = footprint(ITEM_BY_ID[top.id], top.rot);
    top.gx = Math.max(0, Math.min(cols - w, top.gx + dx));
    top.gz = Math.max(0, Math.min(rows - d, top.gz + dz));
    this.H.game.audio?.play?.('menu');
  }

  /** A wall thing hops to the next span the stick points at, round corners too. */
  hop(top, dx, dz) {
    const H = this.home(top);
    const room = this.roomOf(H, top);
    if (!room) return;
    const slots = wallSlots(H.house, room);
    const cur = slots.find((s) => s.side === top.side && s.k === top.k) ?? slots[0];
    const k = stepToward(slots, cur, dx, dz);
    if (k < 0) return;
    top.side = slots[k].side;
    top.k = slots[k].k;
    this.H.game.audio?.play?.('menu');
  }

  /** The bridge-door spots she can pick from now: this floor, every house. */
  ports(top) {
    const H = this.home(top);
    const w = (LINK_BY_ID[top.style] ?? LINK_BY_ID.plank).w;
    const g = this.H.envOf?.(this.isle(top))?.gyAt;
    return portSpots(H, w, g).filter((s) => s.floor === top.floor && (!top.a || s.hk !== top.a.hk));
  }

  hopPort(top, dx, dz) {
    const list = this.ports(top);
    if (!list.length) return;
    const H = this.home(top);
    const cur = top.cur && endAt(H, top.cur);
    // the stick is screen-relative and the screen is the island's frame turned by `I.ry` (see `camera`)
    const k = cur ? stepToward(list, cur, dx, dz) : 0;
    if (k < 0) return;
    const s = list[k];
    top.cur = { hk: s.hk, floor: s.floor, side: s.side, at: s.at };
    this.H.game.audio?.play?.('menu');
  }

  /** Up a floor (and round to the ground again), landing on the nearest doorway there. */
  portFloor(top) {
    const H = this.home(top);
    const most = Math.max(...houseSpecs(H).map((s) => HOUSE_BY_ID[s.house].floors));
    const from = top.cur && endAt(H, top.cur);
    for (let i = 1; i <= most; i++) {
      top.floor = (top.floor + 1) % most;
      const list = this.ports(top);
      if (!list.length) continue;
      let best = list[0];
      if (from) for (const s of list) if (Math.hypot(s.x - from.x, s.z - from.z) < Math.hypot(best.x - from.x, best.z - from.z)) best = s;
      top.cur = { hk: best.hk, floor: best.floor, side: best.side, at: best.at };
      break;
    }
    this.H.game.audio?.play?.('menu');
  }

  rotate(top) {
    if (top.kind === 'wall') return; // a wall thing faces the room, always
    if (freeTurn(top)) {
      /* Stepped from the angle it is AT, snapped to the step: a thing put
         down at 45° and stepped by 15 goes to 60, and one at 15° stepped by
         30 goes up to the next 30 (30), not past it to 45. */
      const s = rotStepOf(top) * Math.PI / 180;
      top.rot = ((Math.floor((top.rot ?? 0) / s + 1e-6) + 1) * s) % (Math.PI * 2);
    }
    else { top.rot = ((top.rot ?? 0) + 1) % 4; this.nudge(top, 0, 0); }
    this.H.game.audio?.play?.('menu');
  }

  /* -------------------------------- camera ------------------------------ */

  /**
   * TOP-DOWN OVER WHAT SHE IS PLACING, with the house's front at the bottom
   * of the screen — so "down" on the stick is toward the door and the bridge
   * every time, whichever way the island happens to face. A room is framed
   * whole; the yard follows the ghost.
   */
  camera(p) {
    const F = this.frameOf(p.index);
    if (!F) return null;
    if (F.raising) return this._raiseCam(F);
    if (F.item || F.roomOnly) return this._frameCam(F);
    const { top, I, H } = F;
    const L = this.localOf(top);
    const lw = this.worldOf(I, H, top, L);
    let dist = 34, y = I.island.heightAt(lw.x, lw.z) ?? I.groundY;
    let w = I.local(L.x, L.z + dist * 0.12);
    const room = top.kind === 'room' || top.kind === 'wall' ? this.roomOf(H, top) : null;
    if (room) {
      dist = Math.max(room.w, room.d) * 1.5 + 9;
      y = I.floorY(room);
      const hs = I.houseOf(room);
      // toward the front of the SCREEN, which is the island's front, from inside her house's frame
      const c = I.roomLocal(room, room.cx, room.cz);
      w = { x: c.x + Math.sin(I.ry) * dist * 0.12, z: c.z + Math.cos(I.ry) * dist * 0.12 };
      void hs;
    } else {
      if (top.kind === 'yard') {
        const it = ITEM_BY_ID[top.v === 'pick' ? pickList(H, 'yard')[top.at ?? 0]?.id : top.id];
        dist = Math.max(30, yardR(it) * 3.2 + 12);
      } else if (top.kind === 'house') {
        const id = top.v === 'pick' ? pickList(H, 'house')[top.at ?? 0]?.id : top.id;
        dist = Math.max(40, houseRadius(id) * 3 + 14);
      } else if (top.kind === 'link') {
        dist = 40;
        const e = top.cur && endAt(H, top.cur, this.H.envOf?.(I)?.gyAt);
        if (e) y = I.groundY + e.y;
      }
      /* The card sits over the bottom of the pane, so the thing is framed a
         little ABOVE the middle: aim a touch toward the front (screen-down). */
      w = I.local(L.x, L.z + dist * 0.12);
    }
    (top._cam ??= new THREE.Vector3()).set(w.x, y + 1, w.z);
    if (top.kind === 'yard') {
      // where the ghost stands, for the x-ray (`xrayAt`) — not the framed centre, which leads it
      (top._at ??= new THREE.Vector3()).set(lw.x, y + 1.4, lw.z);
      top._atFloor = y + 0.35;
    }
    // the house's front, wrapped to within a half-turn of the usual yaw, so the
    // camera swings the short way round (the same as the door shot)
    let yaw = I.ry;
    while (yaw - CAM_YAW > Math.PI) yaw -= Math.PI * 2;
    while (yaw - CAM_YAW < -Math.PI) yaw += Math.PI * 2;
    return { centre: top._cam, aim: true, dist, pitch: 1.18, yaw };
  }

  /**
   * WHAT HER CARD IS ABOUT, for the camera and the cutaway: a build or pick
   * view, a thing being customised, or a ROOM she is choosing between. Richard:
   * "When choosing a room to furnish ... the camera should zoom and focus on
   * the room so the player knows which room it is ... regardless of where the
   * players are in the house, it should show the proper floor and the room
   * that is being selected. Currently, it only shows the floor the players are
   * on." So the room lists frame the room under the CURSOR, and every view
   * that is about one room (its menu, the shop for it, the are-you-sures)
   * frames that one, cut down to its floor. Null = the card is about nothing
   * in the house, and her camera is her own.
   */
  frameOf(index) {
    const C = this.H.game.housingCards;
    const top = C?._top?.(index);
    if (!top?.site) return null;
    const I = this.isle(top);
    const H = this.home(top);
    if (!I || !H) return null;
    const inRoom = top.kind === 'room' || top.kind === 'wall';
    if (top.v === 'build' || top.v === 'pick') return { top, I, H, room: inRoom ? this.roomOf(H, top) : null };
    if (top.v === 'custom') return { top, I, H, room: inRoom ? this.roomOf(H, top) : null, item: true };
    if (top.v === 'raising') return { top, I, H, raising: true };
    const rooms = homeRooms(H);
    const cur = this.H.game.inspector?.cards?.[index]?.i ?? 0;
    let id = null;
    if (top.v === 'rooms') id = roomsListed(H, top.here)[cur]?.id;
    else if (top.v === 'claims') id = rooms.filter((r) => r.claim)[cur]?.id;
    else if (['room', 'roomtype', 'shop', 'sellitem'].includes(top.v) && top.kind !== 'yard') id = top.room;
    const room = id ? rooms.find((r) => r.id === id) : null;
    return room ? { top, I, H, room, roomOnly: true } : null;
  }

  /**
   * A NEW HOUSE GOING UP, from in front of its door (cards.js `_v_raising`):
   * far enough back for the whole house at its full height — measured off
   * the shell, so a castle backs off further than a tiny house — and low,
   * looking up a little at the roof as it arrives.
   */
  _raiseCam(F) {
    const { top, I } = F;
    const hs = I.houseOf(top.hk);
    const S = hs?.shell;
    if (!S) return null;
    const h = houseHeight(top.id);
    const c = hs.local(0, S.door.z + 1);
    (top._cam ??= new THREE.Vector3()).set(c.x, hs.gy + h * 0.42, c.z);
    let yaw = hs.ry;
    while (yaw - CAM_YAW > Math.PI) yaw -= Math.PI * 2;
    while (yaw - CAM_YAW < -Math.PI) yaw += Math.PI * 2;
    return { centre: top._cam, aim: true, dist: Math.max(18, h * 1.6 + houseRadius(top.id) * 1.2), pitch: 0.3, yaw };
  }

  /** The camera for a framed room, or close on one thing she is customising. */
  _frameCam(F) {
    const { top, I, H, room } = F;
    let c, dist, y, pitch = 1.18;
    if (F.item) {
      const row = top.kind === 'yard' ? H.outdoor?.[top.sel] : H.rooms?.[top.room]?.items?.[top.sel];
      const it = ITEM_BY_ID[row?.id];
      if (!row || !it) return null;
      c = top.kind === 'yard' ? { x: row.x, z: row.z } : cellLocal(room, it, row.gx, row.gz, row.rot);
      const lw = top.kind === 'yard' ? I.local(c.x, c.z) : I.roomLocal(room, c.x, c.z);
      y = top.kind === 'yard' ? (I.island.heightAt(lw.x, lw.z) ?? I.groundY) : I.floorY(room);
      /* CLOSE, AND FROM THE SIDE ENOUGH TO SEE THE CEILING: "the camera
         should be focused on it ... so the player can see the final result".
         Framed on the thing's measured height, so a bigger one stays in. */
      const mesh = I.itemMeshes?.get(top.kind === 'yard' ? 'o' + row.uid : `r:${top.room}:${top.sel}`);
      let h = 3;
      if (mesh) { _fb.setFromObject(mesh); if (!_fb.isEmpty()) h = Math.max(1, _fb.max.y - _fb.min.y); }
      dist = Math.max(11, h * 3.2 + 6);
      pitch = top.kind === 'yard' ? 0.62 : 0.86;
      (top._cam ??= new THREE.Vector3()).set(lw.x, y + h * 0.45, lw.z);
      // the thing itself, for the x-ray (`xrayAt`)
      (top._at ??= new THREE.Vector3()).set(lw.x, y + h * 0.45, lw.z);
      top._atFloor = y + 0.35;
    } else {
      dist = Math.max(room.w, room.d) * 1.5 + 9;
      y = I.floorY(room);
      const rc = I.roomLocal(room, room.cx, room.cz);
      const w = { x: rc.x + Math.sin(I.ry) * dist * 0.12, z: rc.z + Math.cos(I.ry) * dist * 0.12 };
      (top._cam ??= new THREE.Vector3()).set(w.x, y + 1, w.z);
    }
    let yaw = I.ry;
    while (yaw - CAM_YAW > Math.PI) yaw -= Math.PI * 2;
    while (yaw - CAM_YAW < -Math.PI) yaw += Math.PI * 2;
    return { centre: top._cam, aim: true, dist, pitch, yaw };
  }

  /** The house and floor to cut to for a pane where somebody builds indoors: `{ hk, f }` or null. */
  cutFloor(I, members) {
    let out = null;
    for (const i of members ?? []) {
      const F = this.frameOf(i);
      if (!F?.room || F.I !== I) continue;
      if (!out || F.room.floor < out.f) out = { hk: F.room.hk ?? 'main', f: F.room.floor };
    }
    return out;
  }

  /**
   * THE ROOFS COME OFF FOR WORK OUTSIDE. Richard, Oct 2026: "When player is
   * not inside a house, and is building a bridge, or adding to the yard, the
   * roofs of the house should be hidden" — from the build camera's height a
   * roof is most of the picture and hides the lawn round the house. And "When
   * building a bridge on the 2nd or 3rd floor, the house should show that
   * floor so the player can see where the bridge is going": a house the
   * bridge starts or ends at is cut to that floor (the higher one, if both
   * ends are in it), so the doorway is on screen.
   *
   * `[{ hk, f, hard }]`: `hard` — the bridge's floor — wins over the floor a
   * kitten is standing on; the rest only take the roof off a house nobody in
   * the pane is inside.
   */
  outdoorCuts(I, members) {
    const out = [];
    for (const i of members ?? []) {
      const F = this.frameOf(i);
      if (!F || F.I !== I || F.room) continue;
      const { top } = F;
      if (top.kind !== 'yard' && top.kind !== 'house' && top.kind !== 'link') continue;
      for (const hs of I.houses ?? []) {
        /* YARD WORK SEES OVER THE HOUSES: every floor above the first goes.
           Richard, Oct 2026: "The house, especially a castle, can block the
           camera ... hide every floor above the first while adjusting outdoor
           objects." Only the roof came off, which left a castle's three
           storeys standing between the lens and the lawn behind it. */
        let f = top.kind === 'yard' ? 0 : hs.shell.floorY.length - 1;
        let hard = false;
        if (top.kind === 'link') {
          const ends = [top.a, top.cur].filter((e) => e?.hk === hs.hk);
          if (ends.length) { f = Math.max(...ends.map((e) => e.floor)); hard = true; }
        }
        out.push({ hk: hs.hk, f, hard });
      }
    }
    return out;
  }

  /**
   * WHAT THE X-RAY KEEPS IN VIEW for yard work: the thing she is placing or
   * customising, `{ p, floor }` like a kitten's (housing.js `aimView`). The
   * ground floor still stands after `outdoorCuts`, and from the usual side a
   * castle's is a wall six units high across the lawn behind it.
   */
  xrayAt(I, members) {
    const out = [];
    for (const i of members ?? []) {
      const F = this.frameOf(i);
      if (!F || F.I !== I || F.room || F.top.kind !== 'yard' || !F.top._at) continue;
      out.push({ p: F.top._at, floor: F.top._atFloor });
    }
    return out;
  }

  /* -------------------------------- ghosts ------------------------------ */

  /**
   * THE THING ITSELF, NOT A SILHOUETTE. Richard: "When placing items outdoor,
   * like the volleyball, it is not showing the actual model and the direction
   * it is facing before placing it, we should show the actual item they are
   * placing." The ghost was the drawn stand-in in one flat colour — and for
   * the things the yard BUILDS (the court, the ponds, the pen) the stand-in
   * is a token, not the thing. Now:
   *   a yard-built thing — the island builds it for real, in a sandbox, so
   *                        the ghost is the very mesh the yard will have;
   *   anything else      — the model in her colours and at her size (its
   *                        `look`, if she is moving one she customised).
   * Its materials are its own transparent copies; the ring and the arrow
   * still carry green-or-red.
   */
  _ghostBody(I, H, top, it) {
    let body;
    const row = top.sel >= 0
      ? (top.kind === 'yard' ? H.outdoor?.[top.sel] : top.kind === 'room' ? H.rooms?.[top.room]?.items?.[top.sel] : null)
      : null;
    if (top.kind === 'yard' && YARD_BUILT.has(it.id)) body = yardBody(I, it);
    if (!body) {
      const look = top.kind === 'room' ? roomLook(it, row) : row?.look ? { s: row.look.s, style: row.look.style } : null;
      body = placeModel(it.model, drawItem(it.id, 2, { cups: 3 }), it.size ?? (it.id === 'treehouse' ? { h: 16 } : null), look);
      body.userData.onReal = (g) => ghostly(g);
      // a drawn stand-in with models of its own inside (the window's shoji) ghosts them too when they land
      body.traverse((o) => { if (o !== body && o.userData.modelId && !o.userData.onReal) o.userData.onReal = (g) => ghostly(g); });
    }
    return ghostly(body);
  }

  /** The selector's ring for the thing it is on: the yard's own radius, a
   *  furnishing's footprint (`ringR`), or the plain one for a wall's. */
  pickRingR(H, top) {
    if (top.kind === 'yard') return Math.max(RING_R, yardR(ITEM_BY_ID[pickList(H, 'yard')[top.at ?? 0]?.id]));
    if (top.kind !== 'room') return RING_R;
    const q = pickList(H, 'room', top.room)[top.at ?? 0];
    const row = q ? H.rooms?.[top.room]?.items?.[q.k] : null;
    const it = row && ITEM_BY_ID[row.id];
    return it ? ringR(it, roomLook(it, row)) : RING_R;
  }

  update(dt, t) {
    const players = this.H.game.players ?? [];
    for (const [i, G] of this.ghosts) {
      if (!this.topOf(i) || !players[i]) this._drop(i);
    }
    for (const p of players) {
      if (!p) continue;
      const top = this.topOf(p.index);
      if (!top) continue;
      this._ghost(p.index, top, t);
    }
  }

  _drop(i) {
    const G = this.ghosts.get(i);
    if (!G) return;
    G.group.parent?.remove(G.group);
    for (const mk of G.marks ?? []) mk.parent?.remove(mk);
    if (G.hid) { G.hid.visible = true; G.hid.userData.held = false; }
    uncarry(G);
    this.ghosts.delete(i);
  }

  _ghost(index, top, t) {
    const I = this.isle(top);
    const H = this.home(top);
    if (!I || !H) return;
    if (top.kind === 'house' || top.kind === 'link') return this._bigGhost(index, top, t, I, H);
    const id = top.v === 'pick' ? null : top.id;
    const key = `${top.v}:${id}:${top.kind}:${top.sel}`;
    let G = this.ghosts.get(index);
    if (G && G.key !== key) { this._drop(index); G = null; }
    if (!G) {
      const group = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: this._ok, transparent: true, opacity: 0.55, depthWrite: false });
      let mesh = null;
      if (id) {
        mesh = this._ghostBody(I, H, top, ITEM_BY_ID[id]);
        group.add(mesh);
      }
      const row = top.kind === 'room' && top.sel >= 0 ? H.rooms?.[top.room]?.items?.[top.sel] : null;
      const r = !id ? RING_R
        : top.kind === 'yard' ? yardR(ITEM_BY_ID[id])
          : top.kind === 'room' ? ringR(ITEM_BY_ID[id], roomLook(ITEM_BY_ID[id], row)) : RING_R;
      const ring = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.3, r - 0.25), r, 48),
        new THREE.MeshBasicMaterial({ color: this._ok, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.12;
      ring.renderOrder = 6;
      group.add(ring);
      // an arrow on the ring for which way it faces — "position and rotation"
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 3), ring.material);
      arrow.rotation.x = Math.PI / 2;
      arrow.position.set(0, 0.2, r + 0.4);
      group.add(arrow);
      I.group.add(group);
      G = { group, mesh, ring, arrow, mat, key, hid: null };
      this.ghosts.set(index, G);
    }
    // hide the real one while it is being moved
    const realKey = top.v === 'build' && top.sel >= 0
      ? (top.kind === 'yard' ? 'o' + H.outdoor[top.sel]?.uid : `${top.kind === 'wall' ? 'w' : 'r'}:${top.room}:${top.sel}`)
      : null;
    const real = realKey ? I.itemMeshes?.get(realKey) : null;
    if (G.hid && G.hid !== real) { G.hid.visible = true; G.hid.userData.held = false; }
    // `held` so the cutaway, which shows a floor's things again, leaves it hidden
    if (real) { real.visible = false; real.userData.held = true; }
    G.hid = real ?? null;

    const L = this.localOf(top);
    const w = this.worldOf(I, H, top, L);
    const room = top.kind === 'yard' ? null : this.roomOf(H, top);
    const hry = room ? (I.houseOf(room)?.ry ?? I.ry) : I.ry;
    let y, ry;
    if (top.v === 'pick') {
      y = top.kind === 'yard' ? (I.island.heightAt(w.x, w.z) ?? I.groundY) : I.floorY(room);
      ry = hry;
      G.ring.material.color.copy(this._sel);
      G.arrow.visible = false;
      const pulse = 1 + Math.sin(t * 6) * 0.08;
      G.group.scale.setScalar(pulse * this.pickRingR(H, top) / RING_R);
    } else {
      const bad = buildWhy(H, top, I.radius);
      const c = bad ? this._bad : this._ok;
      G.mat.color.copy(c);
      // the thing itself fades when it will not go there; the ring says why in colour
      G.mesh?.traverse((o) => { if (o.isMesh && o.userData.ghost) o.material.opacity = bad ? 0.4 : 0.92; });
      G.ring.material.color.copy(c);
      G.arrow.visible = top.kind !== 'wall';
      G.group.scale.setScalar(1);
      if (top.kind === 'yard') {
        y = I.island.heightAt(w.x, w.z) ?? I.groundY;
        ry = I.ry + (top.rot ?? 0);
      } else if (top.kind === 'wall') {
        const S = wallSlots(room.house, room).find((s) => s.side === top.side && s.k === top.k);
        y = I.floorY(room) + (WALL_Y[top.id] ?? 1);
        ry = hry + (S?.ry ?? 0);
      } else {
        y = I.floorY(room);
        ry = hry + (top.rot ?? 0) * (Math.PI / 2);
      }
    }
    G.group.position.set(w.x, y, w.z);
    G.group.rotation.y = ry;
  }

  /**
   * A HOUSE OR A BRIDGE, ghosted. A house is its real shell, see-through, on
   * a footprint ring; a bridge is the real bridge from the first doorway to
   * the one under the cursor, or — before the first is picked — a marker on
   * the doorway. Rebuilt only when what it shows changes.
   */
  _bigGhost(index, top, t, I, H) {
    let key, make;
    if (top.kind === 'house') {
      const id = top.v === 'pick' ? pickList(H, 'house')[top.at ?? 0]?.id : top.id;
      key = `house:${top.v}:${id}`;
      make = () => {
        const g = new THREE.Group();
        if (top.v === 'build') {
          const S = buildHouseShell(id);
          const parts = [...S.floors.flat(), ...S.roof, ...S.tint];
          g.add(ghostly(new THREE.Mesh(mergeParts(parts), toonVertexMat())));
        }
        // the plinth and the ramp, each its own patch (`houseFoots`): the ground beside the ramp is the yard's
        const mat = new THREE.MeshBasicMaterial({ color: this._ok, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
        const rings = houseFoots(id).map((F) => {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(F.x1 - F.x0, F.z1 - F.z0), mat);
          m.rotation.x = -Math.PI / 2;
          m.position.set((F.x0 + F.x1) / 2, 0.15, (F.z0 + F.z1) / 2);
          m.renderOrder = 6;
          g.add(m);
          return m;
        });
        return { g, ring: rings[0] };
      };
    } else {
      const LT = linkOf(H, top);
      // the turns to a tenth, so a turn being slid does not rebuild the ghost every frame
      key = `link:${top.style}:${JSON.stringify(top.a)}:${JSON.stringify(LT.b)}:${(LT.via ?? []).map((v) => `${v.x.toFixed(1)},${v.z.toFixed(1)},${+!!v.smooth}`).join(';')}:${top.vk}`;
      make = () => {
        const g = new THREE.Group();
        const env = this.H.envOf?.(I) ?? {};
        const G = top.a && LT.b ? linkGeom(H, LT, env.gyAt) : null;
        if (G && G.len <= LINK_MAX * 1.5) {
          // the ghost is the bridge that will be built: its posts skip the houses and bridges the real one's will
          const P = linkAll(G, supportGround(H, LT, (x, z) => env.gyAt?.(x, z) ?? 0));
          const m = ghostly(new THREE.Mesh(mergeParts([...P.solid, ...P.glow]), toonVertexMat()));
          g.add(m);
          g.userData.at = { x: G.A.x, z: G.A.z, y: G.A.y, a: G.a };
        }
        const marks = [];
        const turnAt = top.vk != null && LT.via?.[top.vk];
        const ends = [top.a, top.b ?? top.cur, turnAt && { turn: turnAt }];
        for (const e of ends) {
          const E = e?.turn ? { x: e.turn.x, z: e.turn.z, y: G?.turns[top.vk]?.y ?? G?.A.y ?? 0 } : e && endAt(H, e, env.gyAt);
          if (!E) continue;
          const mk = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 3.2, 16, 1, true),
            new THREE.MeshBasicMaterial({ color: e === top.a ? this._sel : this._ok, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
          mk.userData.e = E;
          marks.push(mk);
        }
        return { g, marks };
      };
    }
    let G = this.ghosts.get(index);
    if (G && G.key !== key) { this._drop(index); G = null; }
    if (!G) {
      const m = make();
      G = { group: m.g, ring: m.ring, marks: m.marks ?? [], key, hid: null };
      I.group.add(m.g);
      for (const mk of G.marks) I.group.add(mk);
      this.ghosts.set(index, G);
    }
    const bad = top.v === 'build' ? buildWhy(H, top, this.H.envOf?.(I) ?? I.radius) : null;
    const col = top.v === 'pick' ? this._sel : bad ? this._bad : this._ok;
    if (top.kind === 'house') {
      const L = this.localOf(top);
      const w = I.local(L.x, L.z);
      const rot = top.v === 'pick' ? (pickList(H, 'house')[top.at ?? 0]?.rot ?? 0) : (top.rot ?? 0);
      G.group.position.set(w.x, I.island.heightAt(w.x, w.z) ?? I.groundY, w.z);
      G.group.rotation.y = I.ry + rot;
      G.ring.material.color.copy(col);
      G.ring.material.opacity = 0.25 + Math.sin(t * 5) * 0.08;
      // hide the real one while it is being moved
      const hk = top.v === 'build' ? top.sel : null;
      const real = hk && hk !== -1 ? I.houseOf(hk)?.group : null;
      if (G.hid && G.hid !== real) G.hid.visible = true;
      if (real) real.visible = false;
      G.hid = real ?? null;
      if (real) carry(G, I, hk, real); else uncarry(G);
    } else {
      const at = G.group.userData.at;
      if (at) {
        const w = I.local(at.x, at.z);
        G.group.position.set(w.x, I.groundY + at.y, w.z);
        G.group.rotation.y = I.ry + at.a;
        G.group.traverse((o) => { if (o.isMesh) o.material.opacity = bad ? 0.45 : 0.9; });
      }
      for (const mk of G.marks) {
        const E = mk.userData.e;
        const w = I.local(E.x, E.z);
        mk.position.set(w.x, I.groundY + E.y + 1.6 + Math.sin(t * 4) * 0.1, w.z);
        if (mk.material.color.getHex() !== this._sel.getHex()) mk.material.color.copy(col);
      }
    }
  }

  /* -------------------------------- minimap ----------------------------- */

  /**
   * THE CORNER MAP: the house's plan, her things, and the one being placed
   * with an arrow for which way it faces — drawn the same way up as the
   * camera (front at the bottom), so the map and the world never mirror.
   */
  drawMap(index, cv) {
    const top = this.topOf(index);
    if (!cv || !top) return;
    const H = this.home(top);
    const I = this.isle(top);
    if (!H || !I) return;
    const g = cv.getContext('2d');
    const W = cv.width, Ht = cv.height;
    g.clearRect(0, 0, W, Ht);
    let scale, ox, oz;
    const outdoors = top.kind === 'yard' || top.kind === 'house' || top.kind === 'link';
    if (outdoors) {
      const R = I.radius;
      scale = (Math.min(W, Ht) - 8) / (R * 2);
      ox = 0; oz = 0;
      g.fillStyle = '#5f9a4a';
      g.beginPath(); g.arc(W / 2, Ht / 2, R * scale, 0, Math.PI * 2); g.fill();
    } else {
      const room = this.roomOf(H, top);
      const span = Math.max(room.w, room.d) + 4;
      scale = (Math.min(W, Ht) - 8) / span;
      ox = room.cx; oz = room.cz;
    }
    const P = (x, z) => [W / 2 + (x - ox) * scale, Ht / 2 + (z - oz) * scale];
    if (outdoors) {
      // every house as its ground rectangle, every bridge as a line
      for (const s of houseSpecs(H)) {
        if (top.kind === 'house' && top.v === 'build' && s.hk === top.sel) continue;
        this._mapHouse(g, P, scale, s, s.hk === 'main' ? '#b89a6a' : '#a08a6a');
      }
      g.strokeStyle = '#7a4a2a'; g.lineWidth = 3;
      // a turned bridge as its corners, through every turn
      const line = (L) => {
        const pts = [L.a && endAt(H, L.a), ...(L.via ?? []), L.b && endAt(H, L.b)];
        if (pts.some((q) => !q)) return;
        g.beginPath();
        pts.forEach((q, k) => { const [x, z] = P(q.x, q.z); if (k) g.lineTo(x, z); else g.moveTo(x, z); });
        g.stroke();
      };
      for (const L of H.links ?? []) line(L);
      if (top.kind === 'link' && top.a && top.turns) {
        g.save(); g.strokeStyle = 'rgba(90,210,122,0.9)'; g.setLineDash([4, 3]);
        line(linkOf(H, top));
        g.restore();
      }
      if (top.kind === 'house' && top.v === 'build') {
        const bad = buildWhy(H, top, I.radius);
        this._mapHouse(g, P, scale, { house: top.id, x: top.x, z: top.z, rot: top.rot ?? 0 }, bad ? 'rgba(232,74,74,0.85)' : 'rgba(90,210,122,0.85)');
      }
      if (top.kind === 'link') {
        for (const e of [top.a, top.cur]) {
          const E = e && endAt(H, e);
          if (!E) continue;
          const [x, z] = P(E.x, E.z);
          g.fillStyle = e === top.a ? '#ffd34a' : '#5ad27a';
          g.beginPath(); g.arc(x, z, 4, 0, Math.PI * 2); g.fill();
        }
      }
      if (top.kind !== 'yard') return;
    }
    // the house's rooms (the floor being built on, or the ground floor)
    const fl = top.kind === 'yard' ? -1 : this.roomOf(H, top)?.floor ?? 0;
    const hk = top.kind === 'yard' ? null : this.roomOf(H, top)?.hk ?? 'main';
    for (const room of homeRooms(H)) {
      if (room.floor !== fl || room.hk !== hk) continue;
      const [x, z] = P(room.cx - room.w / 2, room.cz - room.d / 2);
      g.fillStyle = room.id === top.room ? '#d9c98a' : '#a89870';
      g.fillRect(x, z, room.w * scale, room.d * scale);
      g.strokeStyle = '#3a2418'; g.lineWidth = 1;
      g.strokeRect(x, z, room.w * scale, room.d * scale);
    }
    // her other things
    const list = pickList(H, top.kind, top.room);
    for (const q of list) {
      if (top.v === 'build' && q.k === top.sel) continue;
      const [x, z] = P(q.x, q.z);
      const r = top.kind === 'yard' ? yardR(ITEM_BY_ID[q.id]) * scale : 3;
      g.fillStyle = top.v === 'pick' && q.k === top.at ? '#ffd34a' : '#7a5a3a';
      g.beginPath(); g.arc(x, z, Math.max(2.5, r), 0, Math.PI * 2); g.fill();
    }
    // the one being placed, with its facing
    if (top.v === 'build') {
      const L = this.localOf(top);
      const [x, z] = P(L.x, L.z);
      const bad = buildWhy(H, top, I.radius);
      const r = Math.max(4, (top.kind === 'yard' ? yardR(ITEM_BY_ID[top.id]) : 1) * scale);
      g.fillStyle = bad ? 'rgba(232,74,74,0.85)' : 'rgba(90,210,122,0.85)';
      g.beginPath(); g.arc(x, z, r, 0, Math.PI * 2); g.fill();
      const a = top.kind === 'yard' ? (top.rot ?? 0) : top.kind === 'room' ? (top.rot ?? 0) * Math.PI / 2 : 0;
      g.strokeStyle = '#fff'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x, z); g.lineTo(x + Math.sin(a) * (r + 5), z + Math.cos(a) * (r + 5)); g.stroke();
    }
    // the door, so "down" is never a guess
    if (!outdoors) {
      const [dx, dz] = P(0, (I.houseOf(this.roomOf(H, top))?.shell?.door.z ?? 6));
      g.fillStyle = '#b8322a';
      g.fillRect(dx - 6, dz - 2, 12, 4);
    }
  }

  /** One house's ground on the corner map, turned as it stands. */
  _mapHouse(g, P, scale, s, fill) {
    const F = houseFoot(s.house);
    const [x, z] = P(s.x, s.z);
    g.save();
    g.translate(x, z);
    g.rotate(-(s.rot ?? 0));
    g.fillStyle = fill;
    for (const R of houseFoots(s.house)) g.fillRect(R.x0 * scale, R.z0 * scale, (R.x1 - R.x0) * scale, (R.z1 - R.z0) * scale);
    g.fillStyle = '#b8322a';
    g.fillRect(-3, (F.z1 - (F.z1 - F.z0) * 0.15) * scale - 1, 6, 3);
    g.restore();
  }
}
