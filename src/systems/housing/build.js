import * as THREE from 'three';
import { HOUSE_BY_ID, ITEM_BY_ID } from './catalog.js';
import { fits, footprint, gridOf, wallSlots, wallFree, yardWhy, yardR, addOutdoor } from './editor.js';
import { drawItem, fitTo } from './models.js';
import { WALL_Y } from './homeisle.js';

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

/**
 * Why `top` cannot go where it is, as a sentence; null when it can. Pure:
 * world-check asks it with hand-made homes.
 */
export function buildWhy(H, top, siteR = 50) {
  const it = ITEM_BY_ID[top.id];
  if (!it) return 'Nothing to place.';
  if (top.kind === 'room') {
    const room = HOUSE_BY_ID[H.house]?.rooms.find((r) => r.id === top.room);
    const R = H.rooms?.[top.room];
    if (!room) return 'That room is gone.';
    return fits(room, R?.items ?? [], it, top.gx, top.gz, top.rot, top.sel) ? null
      : "It doesn't fit there — move it to a clear spot.";
  }
  if (top.kind === 'wall') {
    const room = HOUSE_BY_ID[H.house]?.rooms.find((r) => r.id === top.room);
    const ok = room && wallSlots(H.house, room).some((s) => s.side === top.side && s.k === top.k);
    if (!ok) return 'There is no wall there.';
    return wallFree(H.rooms?.[top.room], top.side, top.k, top.sel) ? null : 'Something already hangs there.';
  }
  return yardWhy(H, it, top.x, top.z, top.sel, siteR);
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
export function pickList(H, kind, roomId) {
  if (kind === 'yard') return (H.outdoor ?? []).map((q, k) => ({ k, id: q.id, x: q.x, z: q.z }));
  const room = HOUSE_BY_ID[H.house]?.rooms.find((r) => r.id === roomId);
  const R = H.rooms?.[roomId];
  if (!room || !R) return [];
  if (kind === 'wall') {
    const slots = wallSlots(H.house, room);
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

/** The key legend, said the same on the card and in the check. */
export const BUILD_KEYS = [
  ['STICK', 'move'], ['ATTACK', 'turn'], ['JUMP', 'put it here'], ['SPRINT', 'sell'], ['INTERACT', 'back'],
];
export const PICK_KEYS = [['STICK', 'choose'], ['JUMP', 'pick it up'], ['SPRINT', 'sell'], ['INTERACT', 'back']];

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
  roomOf(H, top) { return HOUSE_BY_ID[H.house]?.rooms.find((r) => r.id === top.room) ?? null; }

  /** House-local position of whatever the view is pointing at. */
  localOf(top) {
    const H = this.home(top);
    if (!H) return { x: 0, z: 0 };
    if (top.v === 'pick') {
      const L = pickList(H, top.kind, top.room);
      return L[Math.min(top.at ?? 0, L.length - 1)] ?? { x: 0, z: 0 };
    }
    if (top.kind === 'yard') return { x: top.x, z: top.z };
    const room = this.roomOf(H, top);
    if (!room) return { x: 0, z: 0 };
    if (top.kind === 'wall') {
      const S = wallSlots(H.house, room).find((s) => s.side === top.side && s.k === top.k);
      return S ?? { x: room.cx, z: room.cz };
    }
    return cellLocal(room, ITEM_BY_ID[top.id], top.gx, top.gz, top.rot);
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
      if (pad.pressed('jump')) { pad.consume?.('jump'); C.pickUp(index, top); return true; }
      if (pad.pressed('sprint')) { pad.consume?.('sprint'); C.askSell(index, top); return true; }
      return push;
    }
    // ---- build
    if (top.kind === 'yard') {
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
    if (pad.pressed('jump')) { pad.consume?.('jump'); C.placeHere(index, top); return true; }
    if (pad.pressed('sprint')) { pad.consume?.('sprint'); C.askSell(index, top); return true; }
    return true;
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

  rotate(top) {
    if (top.kind === 'wall') return; // a wall thing faces the room, always
    if (top.kind === 'yard') top.rot = ((top.rot ?? 0) + Math.PI / 4) % (Math.PI * 2);
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
    const top = this.topOf(p.index);
    if (!top) return null;
    const I = this.isle(top);
    const H = this.home(top);
    if (!I || !H) return null;
    const L = this.localOf(top);
    const lw = I.local(L.x, L.z);
    let c = L, dist = 34, y = I.island.heightAt(lw.x, lw.z) ?? I.groundY;
    if (top.kind !== 'yard') {
      const room = this.roomOf(H, top);
      if (room) {
        c = { x: room.cx, z: room.cz };
        dist = Math.max(room.w, room.d) * 1.5 + 9;
        y = I.groundY + (I.shell?.floorY[room.floor] ?? 0);
      }
    }
    if (top.kind === 'yard') {
      const it = ITEM_BY_ID[top.v === 'pick' ? pickList(H, 'yard')[top.at ?? 0]?.id : top.id];
      dist = Math.max(30, yardR(it) * 3.2 + 12);
    }
    /* The card sits over the bottom of the pane, so the thing is framed a
       little ABOVE the middle: aim a touch toward the front (screen-down). */
    const w = I.local(c.x, c.z + dist * 0.12);
    (top._cam ??= new THREE.Vector3()).set(w.x, y + 1, w.z);
    // the house's front, wrapped to within a half-turn of the usual yaw, so the
    // camera swings the short way round (the same as the door shot)
    let yaw = I.ry;
    while (yaw - CAM_YAW > Math.PI) yaw -= Math.PI * 2;
    while (yaw - CAM_YAW < -Math.PI) yaw += Math.PI * 2;
    return { centre: top._cam, aim: true, dist, pitch: 1.18, yaw };
  }

  /** The floor to cut the house to for a pane where somebody builds indoors, or -1. */
  cutFloor(I, members) {
    let f = -1;
    for (const i of members ?? []) {
      const top = this.topOf(i);
      if (!top || top.kind === 'yard' || this.isle(top) !== I) continue;
      const room = this.roomOf(this.home(top), top);
      if (room) f = f < 0 ? room.floor : Math.min(f, room.floor);
    }
    return f;
  }

  /* -------------------------------- ghosts ------------------------------ */

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
    if (G.hid) G.hid.visible = true;
    this.ghosts.delete(i);
  }

  _ghost(index, top, t) {
    const I = this.isle(top);
    const H = this.home(top);
    if (!I || !H) return;
    const id = top.v === 'pick' ? null : top.id;
    const key = `${top.v}:${id}:${top.kind}:${top.sel}`;
    let G = this.ghosts.get(index);
    if (G && G.key !== key) { this._drop(index); G = null; }
    if (!G) {
      const group = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: this._ok, transparent: true, opacity: 0.55, depthWrite: false });
      let mesh = null;
      if (id) {
        const it = ITEM_BY_ID[id];
        mesh = drawItem(id, 2, { cups: 3 });
        fitTo(mesh, it.size ?? (id === 'treehouse' ? { h: 16 } : null));
        mesh.traverse((o) => { if (o.isMesh) o.material = mat; });
        group.add(mesh);
      }
      const r = top.kind === 'yard' && id ? yardR(ITEM_BY_ID[id]) : 1.4;
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
    if (G.hid && G.hid !== real) G.hid.visible = true;
    if (real) real.visible = false;
    G.hid = real ?? null;

    const L = this.localOf(top);
    const w = I.local(L.x, L.z);
    let y, ry;
    if (top.v === 'pick') {
      y = top.kind === 'yard' ? (I.island.heightAt(w.x, w.z) ?? I.groundY)
        : I.groundY + (I.shell?.floorY[this.roomOf(H, top)?.floor ?? 0] ?? 0);
      ry = I.ry;
      G.ring.material.color.copy(this._sel);
      G.arrow.visible = false;
      const pulse = 1 + Math.sin(t * 6) * 0.08;
      G.group.scale.setScalar(pulse * (top.kind === 'yard' ? Math.max(1, yardR(ITEM_BY_ID[pickList(H, 'yard')[top.at ?? 0]?.id]) / 1.4) : 1));
    } else {
      const bad = buildWhy(H, top, I.radius);
      const c = bad ? this._bad : this._ok;
      G.mat.color.copy(c);
      G.ring.material.color.copy(c);
      G.arrow.visible = top.kind !== 'wall';
      G.group.scale.setScalar(1);
      if (top.kind === 'yard') {
        y = I.island.heightAt(w.x, w.z) ?? I.groundY;
        ry = I.ry + (top.rot ?? 0);
      } else if (top.kind === 'wall') {
        const room = this.roomOf(H, top);
        const S = wallSlots(H.house, room).find((s) => s.side === top.side && s.k === top.k);
        y = I.groundY + (I.shell?.floorY[room.floor] ?? 0) + (WALL_Y[top.id] ?? 1);
        ry = I.ry + (S?.ry ?? 0);
      } else {
        const room = this.roomOf(H, top);
        y = I.groundY + (I.shell?.floorY[room.floor] ?? 0);
        ry = I.ry + (top.rot ?? 0) * (Math.PI / 2);
      }
    }
    G.group.position.set(w.x, y, w.z);
    G.group.rotation.y = ry;
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
    const def = HOUSE_BY_ID[H.house];
    let scale, ox, oz;
    if (top.kind === 'yard') {
      const R = I.radius;
      scale = (Math.min(W, Ht) - 8) / (R * 2);
      ox = 0; oz = 0;
      g.fillStyle = '#5f9a4a';
      g.beginPath(); g.arc(W / 2, Ht / 2, R * scale, 0, Math.PI * 2); g.fill();
      // the path to the bridge
      g.fillStyle = 'rgba(232,214,160,0.7)';
      g.fillRect(W / 2 - 4.5 * scale, Ht / 2, 9 * scale, R * scale);
    } else {
      const room = this.roomOf(H, top);
      const span = Math.max(room.w, room.d) + 4;
      scale = (Math.min(W, Ht) - 8) / span;
      ox = room.cx; oz = room.cz;
    }
    const P = (x, z) => [W / 2 + (x - ox) * scale, Ht / 2 + (z - oz) * scale];
    // the house's rooms (the floor being built on, or the ground floor)
    const fl = top.kind === 'yard' ? 0 : this.roomOf(H, top)?.floor ?? 0;
    for (const room of def.rooms) {
      if (room.floor !== fl) continue;
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
    const [dx, dz] = P(0, (I.shell?.door.z ?? 6));
    g.fillStyle = '#b8322a';
    g.fillRect(dx - 6, dz - 2, 12, 4);
  }
}
