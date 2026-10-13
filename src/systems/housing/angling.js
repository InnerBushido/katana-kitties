import * as THREE from 'three';
import { paint, toonVertexMat } from '../../core/gfx.js';
import { mergeParts } from '../../world/build.js';
import { rollFish, FISH_VALUE } from './fishing.js';

/* ---------------------------------------------------------------------------
   FISHING IN THE WORLD — Ocarina of Time's pond, at her koi pond.

   Richard: "The fishing mini-game is a bit boring, can we make it 3D and make
   it that you can see the fish in the pond? ... like in Zelda: OoT that
   player can see the fish in the pond and can try to catch it by casting near
   the fish. ... player equips a fishing pole nearby, then when attacking with
   the fishing pole, then they cast and the longer they hold it, the further
   it goes. We can also make the pond bigger."

   It was a card with a canvas in it (fishing.js still holds the fish table,
   `rollFish` and the value). Now:

     THE ROD     a stand of rods on the bank. ACTION takes one; ACTION at the
                 stand again puts it back, and so does walking away from the
                 pond. While she holds it, ATTACK is the rod's and never the
                 katana's (`padFor` masks it), which also keeps non-negotiable
                 3 obviously intact: nothing here can reach `strikePlayers`.
     CAST        HOLD ATTACK: the power climbs and a ring on the water shows
                 where the lure will land. Let go and it flies there.
     THE FISH    dark shapes under the surface, each a real roll of the fish
                 table, sized by its weight, so she can SEE the big one and aim
                 for it. The deep middle has the deep fish.
     WAIT        the stick twitches the lure. Fish near it come to look; a
                 gentle twitch makes them keener, thrashing sends the shy big
                 ones away (the card's rules, given a place to happen).
     BITE        the float dips: ATTACK inside the window sets the hook.
     REEL        HOLD ATTACK. The line tension climbs while she reels against a
                 surge and falls when she lets go; over the top and it snaps.

   NOTHING IS LOST BY FAILING: a fish that got away swims off and will look
   again later, and a caught one is replaced by a new visitor. The koi are
   pets and are never on the line — these are wild fish, as before.
--------------------------------------------------------------------------- */

export const ANGLE = {
  charge: 1.0,      // seconds of holding to a full cast
  near: 1.6,        // the shortest cast, from her feet
  farK: 1.5,        // the longest cast, in water radii
  flight: 0.45,     // the lure in the air
  notice: 4.5,      // how far a fish sees the lure from
  biteWin: 0.9,     // the window to set the hook
  respawn: 10,      // a caught fish's place is taken this long after
  leave: 10,        // past the water's edge by this much, the rod goes back
};

/** How many wild fish visit a pond. Moonwater has "the best fishing water". */
export const fishCount = (siteId) => (siteId === 'moonwater' ? 8 : 6);

/** The water a pond has, from its yard radius (homeisle draws it at r - 1.3). */
export const waterR = (P) => P.r - 1.3;

/** How long a fish of `lb` is drawn, in world units. 0.55 + 0.08/lb was
 *  measured too small to read from 16 units up: a 1lb ayu was a speck. */
export const fishLen = (lb) => 0.9 + lb * 0.12;

/** Where a cast of power `k` lands, from (x, z) facing `facing`. */
export function castPoint(x, z, facing, k, wr) {
  const d = ANGLE.near + k * wr * ANGLE.farK;
  return { x: x + Math.sin(facing) * d, z: z + Math.cos(facing) * d, d };
}

/** A bar of `n` squares. ■□ and not ▮▯: the label font draws those two as empty boxes. */
const bar = (k, n = 8) => { const f = Math.round(Math.max(0, Math.min(1, k)) * n); return '■'.repeat(f) + '□'.repeat(n - f); };

export class Angling {
  constructor(housing) {
    this.H = housing;
    /** site -> { P, wr, group, stand, fish[] } */
    this.ponds = new Map();
    /** seat -> her line */
    this.lines = new Map();
    this.t = 0;
    this._dt = 1 / 60;
  }

  get game() { return this.H.game; }

  /* ------------------------------ the ponds ------------------------------ */

  sync() {
    for (const v of this.ponds.values()) v.group.parent?.remove(v.group);
    const kept = this.ponds;
    this.ponds = new Map();
    for (const I of this.H.isles) {
      const H = I.home;
      if (!H || H.preview) continue;
      const P = I.placeOf('koipond');
      if (!P) continue;
      const wr = waterR(P);
      const group = new THREE.Group();
      I.itemGroup.add(group);
      // The rod stand on the bank, on the side toward the middle of her island.
      const toward = Math.atan2(I.x - P.x, I.z - P.z);
      const sx = P.x + Math.sin(toward) * (P.r - 0.2);
      const sz = P.z + Math.cos(toward) * (P.r - 0.2);
      const sy = I.island.heightAt(sx, sz) ?? P.y;
      group.add(this._standMesh(sx, sy, sz, toward));
      const old = kept.get(I.site.id);
      const fish = old?.P.uid === P.uid ? old.fish : [];
      const v = { site: I.site.id, I, P, wr, group, stand: { x: sx, y: sy, z: sz }, fish };
      while (v.fish.length < fishCount(I.site.id)) v.fish.push(this._newFish(v, false));
      for (const f of v.fish) { f.mesh.removeFromParent(); group.add(f.mesh); }
      this.ponds.set(I.site.id, v);
    }
    // A line on a pond that went away is put away with it; one on a pond that
    // was only redrawn (a home edited) moves into its new group.
    for (const [i, L] of [...this.lines]) {
      const v = this.ponds.get(L.site);
      if (!v) { this._stow(i, null); continue; }
      for (const m of [L.rod, L.line, L.lure, L.aim, L.held]) if (m) v.group.add(m);
    }
  }

  _standMesh(x, y, z, yaw) {
    const parts = [];
    const post = new THREE.BoxGeometry(0.18, 1.5, 0.18);
    paint(post, 0x6a4a36);
    for (const dx of [-0.7, 0.7]) parts.push(post.clone().translate(dx, 0.75, 0));
    const bar1 = new THREE.BoxGeometry(1.7, 0.14, 0.14);
    paint(bar1, 0x6a4a36);
    parts.push(bar1.translate(0, 1.4, 0));
    for (let k = 0; k < 3; k++) {
      const rod = new THREE.CylinderGeometry(0.03, 0.05, 2.6, 5);
      paint(rod, 0x9a6a40);
      rod.rotateX(-0.25);
      rod.translate(-0.45 + k * 0.45, 1.3, -0.25);
      parts.push(rod);
    }
    const m = new THREE.Mesh(mergeParts(parts), toonVertexMat());
    m.position.set(x, y, z);
    m.rotation.y = yaw;
    return m;
  }

  /** A wild fish: a roll of the table for where it is, drawn as a shadow. */
  _newFish(v, edge) {
    const a = Math.random() * Math.PI * 2;
    const rr = edge ? v.wr * 0.85 : Math.sqrt(Math.random()) * v.wr * 0.85;
    const x = v.P.x + Math.cos(a) * rr;
    const z = v.P.z + Math.sin(a) * rr;
    const depth = 1 - rr / v.wr;
    const roll = rollFish(depth);
    const L = fishLen(roll.lb);
    // One outline: round the body from the back, past the head (+x), and out to the tail.
    const pts = [];
    for (let k = 0; k <= 16; k++) {
      const th = -(Math.PI - 0.4) + (k / 16) * 2 * (Math.PI - 0.4);
      pts.push(new THREE.Vector2(Math.cos(th) * L * 0.5, Math.sin(th) * L * 0.2));
    }
    pts.push(new THREE.Vector2(-L * 0.75, L * 0.17), new THREE.Vector2(-L * 0.75, -L * 0.17));
    const geo = new THREE.ShapeGeometry(new THREE.Shape(pts));
    geo.rotateX(-Math.PI / 2);
    // A shadow with a hint of its colour, so a rare one GLINTS.
    const col = new THREE.Color(0x0e2433).lerp(new THREE.Color(roll.fish.colour), roll.fish.rare ? 0.55 : 0.18);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }));
    mesh.renderOrder = 2;
    const f = { roll, x, z, h: Math.random() * Math.PI * 2, sp: 0.5 + Math.random() * 0.4 - Math.min(0.3, roll.lb * 0.012), to: null, shyT: 0, interest: 0, mesh, gone: 0 };
    this._place(v, f);
    return f;
  }

  _place(v, f) {
    f.mesh.position.set(f.x, v.P.y + 0.31, f.z);
    f.mesh.rotation.y = f.h;
  }

  _wander(v, f) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random()) * v.wr * 0.85;
    f.to = { x: v.P.x + Math.cos(a) * rr, z: v.P.z + Math.sin(a) * rr };
  }

  /** Swim toward (tx, tz) at `sp`, turning like a fish rather than snapping. */
  _swim(v, f, tx, tz, sp, dt) {
    const dx = tx - f.x;
    const dz = tz - f.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return d;
    const want = Math.atan2(dx, dz) - Math.PI / 2;
    let dh = want - f.h;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    f.h += dh * Math.min(1, dt * 3);
    const step = Math.min(d, sp * dt);
    f.x += (dx / d) * step;
    f.z += (dz / d) * step;
    // never out of the water
    const ox = f.x - v.P.x;
    const oz = f.z - v.P.z;
    const o = Math.hypot(ox, oz);
    const lim = v.wr * 0.9;
    if (o > lim) { f.x = v.P.x + (ox / o) * lim; f.z = v.P.z + (oz / o) * lim; }
    return d;
  }

  /* ------------------------------- the rod ------------------------------- */

  /** The stand she is at, or null — for `Housing._spotFor`. */
  standNear(p) {
    for (const v of this.ponds.values()) {
      if (Math.hypot(p.position.x - v.stand.x, p.position.z - v.stand.z) < 2.4 && Math.abs(p.position.y - v.stand.y) < 3) return v;
    }
    return null;
  }

  holding(i) { return this.lines.has(i); }

  lineOf(i) { return this.lines.get(i) ?? null; }

  /** ACTION at the stand: take a rod, or put hers back. */
  toggle(p, v) {
    if (this.lines.has(p.index)) { this._stow(p.index, `${p.name} put the rod back.`); return; }
    const L = { site: v.site, phase: 'idle', t: 0, k: 0, msg: null, msgT: 0 };
    L.rod = this._rodMesh();
    L.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xf2f2f2 }));
    L.line.visible = false;
    L.lure = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff5a3a }));
    L.lure.visible = false;
    L.aim = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd34a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    L.aim.rotation.x = -Math.PI / 2;
    L.aim.visible = false;
    L.held = null;
    v.group.add(L.rod, L.line, L.lure, L.aim);
    this.lines.set(p.index, L);
    this.game.audio?.play?.('menu');
    this.game.toast?.(`${p.name} has a fishing rod! HOLD ATTACK to cast — the longer you hold, the further it goes.`, p.index);
  }

  _rodMesh() {
    const g = new THREE.CylinderGeometry(0.03, 0.06, 2.4, 6);
    paint(g, 0x9a6a40);
    g.translate(0, 1.2, 0);
    const reel = new THREE.CylinderGeometry(0.12, 0.12, 0.12, 8);
    paint(reel, 0x3a3a44);
    reel.rotateZ(Math.PI / 2);
    reel.translate(0, 0.35, 0.08);
    return new THREE.Mesh(mergeParts([g, reel]), toonVertexMat());
  }

  _stow(i, why) {
    const L = this.lines.get(i);
    if (!L) return;
    for (const m of [L.rod, L.line, L.lure, L.aim, L.held]) m?.removeFromParent();
    if (L.fish) this._letGo(L.fish, 4);
    this.lines.delete(i);
    if (why) this.game.toast?.(why, i);
  }

  drop(i) { this._stow(i, null); }

  _letGo(f, shy) {
    f.hooked = false;
    f.shyT = shy;
    f.interest = 0;
    f.to = null;
  }

  /* ------------------------------ her pad ------------------------------- */

  /**
   * Her pad, while she holds a rod: ATTACK is the rod's, always. While the
   * line is out (or she is winding up) she stands still and the stick is the
   * lure's, and only INTERACT and START get through to the game.
   */
  padFor(i, pad) {
    const L = this.lines.get(i);
    if (!L || !pad) return pad;
    const p = this.game.players?.[i];
    if (p) this._step(p, L, pad, this._dt);
    const still = L.phase !== 'idle';
    const through = (a) => a === 'interact' || a === 'start' || a === 'pause';
    const m = Object.create(pad);
    m.pressed = (a) => (a === 'attack' || (still && !through(a)) ? false : pad.pressed(a));
    m.down = (a) => (a === 'attack' || (still && !through(a)) ? false : pad.down(a));
    m.doubled = (a, w) => (a === 'attack' || still ? false : pad.doubled?.(a, w) ?? false);
    m.consume = (a) => pad.consume?.(a);
    // defineProperty, not `=`: a pad's stick may be a getter, and an inherited
    // getter cannot be shadowed by assignment (it throws).
    Object.defineProperty(m, 'mx', { value: still ? 0 : pad.mx });
    Object.defineProperty(m, 'my', { value: still ? 0 : pad.my });
    return m;
  }

  _say(L, msg, t = 2.5) { L.msg = msg; L.msgT = t; }

  /** One frame of her rod, from her real pad. */
  _step(p, L, pad, dt) {
    const v = this.ponds.get(L.site);
    if (!v) return;
    const G = this.game;
    L.t += dt;
    const atk = pad.down('attack');
    const atkP = pad.pressed('attack');
    switch (L.phase) {
      case 'idle':
        if (atkP) { L.phase = 'charge'; L.k = 0; L.t = 0; }
        break;
      case 'charge': {
        // The stick turns her while she winds up, so she can aim at a fish.
        p.facing -= (pad.mx ?? 0) * dt * 2.2;
        // Only while held: the release frame casts what the ring showed, not a frame more.
        if (atk) L.k = Math.min(1, L.k + dt / ANGLE.charge);
        else {
          const c = castPoint(p.position.x, p.position.z, p.facing, L.k, v.wr);
          L.to = c;
          L.from = this._tip(p, L);
          L.phase = 'fly';
          L.t = 0;
          G.audio?.play?.('jump');
        }
        break;
      }
      case 'fly':
        if (L.t >= ANGLE.flight) {
          const wet = Math.hypot(L.to.x - v.P.x, L.to.z - v.P.z) < v.wr - 0.2;
          if (!wet) {
            this._say(L, 'Plop — that landed on the bank! Cast into the water.');
            L.phase = 'idle';
            G.audio?.play?.('miss');
          } else {
            L.phase = 'wait';
            L.t = 0;
            L.tw = 0;
            G.audio?.play?.('menu');
          }
        }
        break;
      case 'wait': {
        const tw = Math.abs(pad.mx ?? 0) + Math.abs(pad.my ?? 0);
        L.tw = tw;
        if (atkP && L.t > 0.3) { L.phase = 'idle'; this._say(L, 'Reeled in empty. Hold ATTACK to cast again.'); break; }
        break;
      }
      case 'bite':
        if (atkP) {
          L.phase = 'reel';
          L.dist = 1;
          L.tension = 0.2;
          L.t = 0;
          L.fish.hooked = true;
          G.audio?.play?.('great');
        } else if (L.t > ANGLE.biteWin) {
          this._letGo(L.fish, 3);
          L.fish = null;
          L.phase = 'wait';
          L.t = 0;
          this._say(L, 'Too slow — it let go. Keep twitching…');
        }
        break;
      case 'reel': {
        const f = L.fish;
        const lb = f.roll.lb;
        const pull = 0.25 + (lb / 25) * 0.9;
        const surge = Math.max(0, Math.sin(L.t * (2 + lb * 0.1))) * pull;
        if (atk) {
          L.dist -= dt * (0.22 - surge * 0.1);
          L.tension += dt * (0.25 + surge * 0.9);
        } else {
          L.dist += dt * surge * 0.12;
          L.tension -= dt * 0.7;
        }
        L.tension = Math.max(0, L.tension);
        if (L.tension >= 1) {
          this._say(L, `SNAP! The ${f.roll.fish.name} got away.`, 3);
          this._letGo(f, 6);
          L.fish = null;
          L.phase = 'idle';
          G.audio?.play?.('miss');
        } else if (L.dist <= 0) {
          this._land(p, L, v, f);
        } else if (L.dist >= 1.2) {
          this._say(L, 'It swam off with plenty of line.', 3);
          this._letGo(f, 6);
          L.fish = null;
          L.phase = 'idle';
        }
        L.dist = Math.min(1.2, L.dist);
        break;
      }
      default: break;
    }
  }

  _land(p, L, v, f) {
    const G = this.game;
    const S = this.H.store;
    S.records ??= {};
    S.records.fish ??= {};
    const rec = S.records.fish[f.roll.fish.id];
    const best = !rec || f.roll.lb > rec.lb;
    if (best) S.records.fish[f.roll.fish.id] = { lb: f.roll.lb, who: p.style.name, at: Date.now() };
    const pts = Math.max(5, Math.round(this.H.price(FISH_VALUE) * f.roll.lb));
    p.score += pts;
    G.onScoreChanged?.(p);
    this.H.save();
    G.audio?.play?.('perfect');
    G.toast?.(`${p.name} caught a ${f.roll.fish.rare ? 'RARE ' : ''}${f.roll.fish.name}, ${f.roll.lb} lb${best ? ' — A NEW RECORD!' : ''} Roshi pays ${pts}.`, p.index);
    // Held up for a moment, in its own colour, and its place in the pond refilled later.
    f.mesh.removeFromParent();
    const shown = new THREE.Mesh(f.mesh.geometry, new THREE.MeshBasicMaterial({ color: f.roll.fish.colour, side: THREE.DoubleSide }));
    shown.rotation.set(0, 0, Math.PI / 2);
    L.held?.removeFromParent();
    L.held = shown;
    L.heldT = 2.2;
    v.group.add(shown);
    v.fish.splice(v.fish.indexOf(f), 1);
    v.due = (v.due ?? 0) + 1;
    v.dueT = ANGLE.respawn;
    L.fish = null;
    L.phase = 'idle';
    this._say(L, 'Hold ATTACK to cast again.', 3);
  }

  /** The tip of her rod, in the world. */
  _tip(p, L) {
    const f = p.facing;
    const back = L.phase === 'charge' ? -0.9 * L.k : 1.2;
    const up = L.phase === 'charge' ? 2.6 : 2.2;
    return new THREE.Vector3(p.position.x + Math.sin(f) * back + Math.cos(f) * 0.35, p.position.y + up, p.position.z + Math.cos(f) * back - Math.sin(f) * 0.35);
  }

  /* ------------------------------- a frame ------------------------------- */

  update(dt, players) {
    this._dt = dt;
    this.t += dt;
    const G = this.game;
    const pull = G.tournament?.active || G._sceneActive?.();
    for (const [i, L] of [...this.lines]) {
      const p = players[i];
      const v = this.ponds.get(L.site);
      if (!p || !v) { this._stow(i, null); continue; }
      if (pull || p.mount || p.rideAlong) { this._stow(i, null); continue; }
      if (Math.hypot(p.position.x - v.P.x, p.position.z - v.P.z) > v.wr + ANGLE.leave) {
        this._stow(i, `${p.name} — the rod goes back on its stand when you walk away from the pond.`);
        continue;
      }
      if (L.msgT > 0) L.msgT -= dt;
      this._draw(p, L, v, dt);
    }
    for (const v of this.ponds.values()) this._fishFrame(v, dt);
  }

  _fishFrame(v, dt) {
    if (v.due > 0 && (v.dueT -= dt) <= 0) {
      const f = this._newFish(v, true);
      v.fish.push(f);
      v.group.add(f.mesh);
      v.due -= 1;
      v.dueT = ANGLE.respawn;
    }
    // Which lures are in THIS pond's water, waiting.
    const lures = [];
    for (const L of this.lines.values()) if (L.site === v.site && L.at && (L.phase === 'wait' || L.phase === 'bite' || L.phase === 'reel')) lures.push(L);
    for (const f of v.fish) {
      f.shyT = Math.max(0, f.shyT - dt);
      if (f.hooked) {
        const L = lures.find((q) => q.fish === f);
        if (!L) { this._letGo(f, 4); continue; }
        // On the line: dragged where the lure is, thrashing side to side.
        const wob = Math.sin(this.t * 14) * 0.4;
        f.h = Math.atan2(L.at.x - f.x, L.at.z - f.z) - Math.PI / 2 + wob;
        f.x = L.at.x; f.z = L.at.z;
        this._place(v, f);
        continue;
      }
      // The nearest waiting lure it can see, unless it has been scared.
      let seen = null;
      if (!f.shyT) {
        let best = ANGLE.notice;
        for (const L of lures) {
          if (L.phase !== 'wait') continue;
          const d = Math.hypot(L.at.x - f.x, L.at.z - f.z);
          if (d < best) { best = d; seen = L; }
        }
      }
      if (seen) {
        const shy = f.roll.fish.depth;
        const tw = seen.tw ?? 0;
        // Thrashing sends the shy ones off; a gentle twitch draws them in.
        if (tw >= 1.3 && shy >= 0.4) { this._letGo(f, 5); this._wander(v, f); continue; }
        const d = this._swim(v, f, seen.at.x, seen.at.z, f.sp * 0.7, dt);
        if (d < 0.9) {
          if (tw > 0.3 && tw < 1.3) f.interest += dt * (0.55 - shy * 0.2);
          else f.interest += dt * 0.12;
          if (f.interest >= 1 && !seen.fish) {
            seen.fish = f;
            seen.phase = 'bite';
            seen.t = 0;
            this.game.audio?.play?.('beat');
          }
        }
      } else {
        f.interest = Math.max(0, f.interest - dt * 0.2);
        if (!f.to || this._swim(v, f, f.to.x, f.to.z, f.sp * (f.shyT ? 2.2 : 1), dt) < 0.3) this._wander(v, f);
      }
      this._place(v, f);
    }
  }

  _draw(p, L, v, dt) {
    const wy = v.P.y + 0.33;
    const f = p.facing;
    // The rod in her hand: from her side up to the tip, leaning out over the water.
    const base = new THREE.Vector3(p.position.x + Math.cos(f) * 0.35, p.position.y + 0.9, p.position.z - Math.sin(f) * 0.35);
    const tip = this._tip(p, L);
    const dir = tip.clone().sub(base);
    const len = dir.length();
    L.rod.position.copy(base);
    L.rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    L.rod.scale.set(1, len / 2.4, 1);
    // The aim ring while she winds up.
    L.aim.visible = L.phase === 'charge';
    if (L.aim.visible) {
      const c = castPoint(p.position.x, p.position.z, p.facing, L.k, v.wr);
      const wet = Math.hypot(c.x - v.P.x, c.z - v.P.z) < v.wr - 0.2;
      L.aim.position.set(c.x, (wet ? wy : (v.I.island.heightAt(c.x, c.z) ?? wy)) + 0.05, c.z);
      L.aim.material.color.set(wet ? 0xffd34a : 0xff5a3a);
    }
    // The lure: flying, bobbing, dipping, or coming in on the reel.
    let at = null;
    if (L.phase === 'fly') {
      const k = Math.min(1, L.t / ANGLE.flight);
      at = new THREE.Vector3(
        THREE.MathUtils.lerp(L.from.x, L.to.x, k),
        THREE.MathUtils.lerp(L.from.y, wy, k) + Math.sin(k * Math.PI) * 2.2,
        THREE.MathUtils.lerp(L.from.z, L.to.z, k));
    } else if (L.phase === 'wait' || L.phase === 'bite') {
      const dip = L.phase === 'bite' ? -0.18 - Math.abs(Math.sin(L.t * 24)) * 0.12 : Math.sin(this.t * 3) * 0.03 - (L.tw > 0.3 ? 0.05 : 0);
      at = new THREE.Vector3(L.to.x, wy + 0.05 + dip, L.to.z);
    } else if (L.phase === 'reel') {
      const k = Math.max(0, L.dist);
      const bank = new THREE.Vector3(p.position.x + Math.sin(f) * 1.2, wy, p.position.z + Math.cos(f) * 1.2);
      const side = Math.sin(L.t * 3.1) * 0.8 * k;
      at = new THREE.Vector3(
        THREE.MathUtils.lerp(bank.x, L.to.x, k) + Math.cos(f) * side,
        wy + 0.02,
        THREE.MathUtils.lerp(bank.z, L.to.z, k) - Math.sin(f) * side);
      // Never through the bank: the water's edge is as far in as it comes.
      const ox = at.x - v.P.x;
      const oz = at.z - v.P.z;
      const o = Math.hypot(ox, oz);
      if (o > v.wr - 0.3) { at.x = v.P.x + (ox / o) * (v.wr - 0.3); at.z = v.P.z + (oz / o) * (v.wr - 0.3); }
    }
    L.at = at ?? L.at;
    L.lure.visible = !!at;
    L.line.visible = !!at;
    if (at) {
      L.lure.position.copy(at);
      const pos = L.line.geometry.attributes.position;
      pos.setXYZ(0, tip.x, tip.y, tip.z);
      pos.setXYZ(1, at.x, at.y, at.z);
      pos.needsUpdate = true;
      L.line.geometry.computeBoundingSphere();
      L.line.material.color.set(L.phase === 'reel' && L.tension > 0.75 ? 0xff4040 : 0xf2f2f2);
    }
    // The catch, held up over her head.
    if (L.held) {
      L.heldT -= dt;
      L.held.position.set(p.position.x, p.position.y + 3.2 + Math.sin(this.t * 6) * 0.1, p.position.z);
      L.held.rotation.y += dt * 3;
      if (L.heldT <= 0) { L.held.removeFromParent(); L.held = null; }
    }
  }

  /** What her callout says while she holds the rod, or null. */
  prompt(p, key) {
    const L = this.lines.get(p.index);
    if (!L) return null;
    if (L.msgT > 0 && L.phase === 'idle') return L.msg;
    switch (L.phase) {
      case 'idle': return this.standNear(p) ? `HOLD ATTACK TO CAST · [${key}]  PUT THE ROD BACK` : 'HOLD ATTACK TO CAST';
      case 'charge': return `CAST ${bar(L.k)}`;
      case 'fly': return null;
      case 'wait': return L.msgT > 0 ? L.msg : 'TWITCH THE STICK… ATTACK REELS IN';
      case 'bite': return 'BITE! PRESS ATTACK!';
      case 'reel': return `HOLD ATTACK TO REEL · LINE ${bar(L.tension)}`;
      default: return null;
    }
  }
}
