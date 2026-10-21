import * as THREE from 'three';

/* ---------------------------------------------------------------------------
   WHAT A PATH DOES WHEN SHE WALKS ON IT. Richard, Oct 2026:

     "sakura petal path: petal particles disturbed by her feet"
     "red carpet: gold 'prideful steps'"
     "tiki torches flare blue, purple or her colour for 1-2 seconds as she
      passes, with a better fire effect"
     "lanterns change colour subtly as she passes"

   The poller trick again (crossfx, dodgefx, sweepfx): the yard registers
   SITES while it is built (`HomeIsle._yardItem` → `isle.fxSites`) and this
   reads them and the players every frame. Nothing here touches a collider, a
   save or a fact; delete the file's update and every path is exactly the
   path it was, flames standing still.

   The flames and lamp papers are meshes INSIDE the item's own group, so the
   build ghost, the carried house and the x-ray all treat them like the rest
   of the thing. Particles are one InstancedMesh per island, in world space.
--------------------------------------------------------------------------- */

/** A torch's flare, and what it flares to. Blue, purple, then HER colour. */
export const FLARE_T = 1.5;
export const FLARE_R = 2.2;
export const FLARE_COLOURS = [0x3a7bff, 0xa04aff];
/** A lamp leans this far toward her colour while she is beside it ("subtly"). */
export const LAMP_TINT = 0.35;
export const LAMP_R = 2.4;
/** A gold footprint every this many seconds she walks the carpet. */
export const STEP_T = 0.3;

const MAX = 220;
const FIRE = [0xff6a12, 0xffa63a, 0xfff2a0];

/** The three tongues of a torch's flame, drawn into `g` at (x, y, z). */
export function makeFlame(g, x, y, z, seed = 0) {
  const parts = FIRE.map((c, k) => {
    const geo = new THREE.ConeGeometry([0.2, 0.14, 0.08][k], [0.7, 0.52, 0.32][k], 7);
    geo.translate(0, [0.35, 0.26, 0.16][k], 0);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: [0.75, 0.88, 1][k], toneMapped: false, depthWrite: false }));
    m.position.set(x + [0, 0.03, -0.02][k], y, z + [0, -0.02, 0.03][k]);
    m.renderOrder = 6 + k;
    g.add(m);
    return m;
  });
  return { kind: 'torch', parts, base: parts.map((m) => m.position.clone()), ph: seed * 2.17 + x * 3.1 + z * 1.7, flare: 0, near: false, n: 0, col: new THREE.Color() };
}

/** A lamp's paper, its own material so it can lean toward her colour. */
export function makeLamp(g, geo) {
  const mat = new THREE.MeshBasicMaterial({ vertexColors: false, color: 0xfff0c8, toneMapped: false });
  const m = new THREE.Mesh(geo, mat);
  g.add(m);
  return { kind: 'lamp', mesh: m, base: new THREE.Color(0xfff0c8), k: 0, to: new THREE.Color(0xfff0c8) };
}

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export class PathFX {
  constructor(isle) {
    this.isle = isle;
    const geo = new THREE.PlaneGeometry(1, 1);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false, transparent: true, depthWrite: false }), MAX);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    isle.group.add(this.mesh);
    /** { kind: 'petal'|'spark'|'print', p, v, rx, ry, spin, life, max, w, h, floor } */
    this.parts = [];
    /** per player: time since her last gold step, and which foot */
    this.step = new Map();
  }

  /** The strip's top at world (x, z): up a ramp or on a porch where it is bent over one (`yAt`). */
  static topAt(S, x, z) { return S.yAt?.(x, z) ?? S.y; }

  /** Is world (x, z) on the strip `S`? Its own frame, the group's turn. */
  static onStrip(S, x, z, y) {
    const dx = x - S.x, dz = z - S.z;
    const c = Math.cos(S.a), s = Math.sin(S.a);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) <= S.hw && Math.abs(lz) <= S.hl && Math.abs(y - PathFX.topAt(S, x, z)) < 0.6;
  }

  _emit(o) {
    if (this.parts.length >= MAX) this.parts.shift();
    this.parts.push(o);
  }

  update(dt, t, players = []) {
    const sites = this.isle.fxSites ?? [];
    for (const S of sites) {
      if (S.kind === 'torch') this._torch(S, dt, t, players);
      else if (S.kind === 'lamp') this._lamp(S, dt, players);
      else S.update?.(dt, t, players);   // a site that runs itself (the zen garden's sand)
    }
    for (const p of players) {
      if (!p?.position) continue;
      const P = p.position;
      const sp = Math.hypot(p.velocity?.x ?? 0, p.velocity?.z ?? 0);
      for (const S of sites) {
        if ((S.kind !== 'petal' && S.kind !== 'carpet') || !PathFX.onStrip(S, P.x, P.z, P.y)) continue;
        if (sp < 1.2) continue;
        if (S.kind === 'petal') this._petals(p, S, sp, dt);
        else this._carpet(p, S, sp, dt);
      }
    }
    this._particles(dt, t);
  }

  /* THE FIRE: three tongues, each flickering on its own two sines and leaning
     on a third, so no two torches beat together. It was two static cones. */
  _torch(S, dt, t, players) {
    const w = S.parts[0].getWorldPosition(_v);
    let who = null;
    for (const p of players) {
      if (p?.position && Math.hypot(p.position.x - w.x, p.position.z - w.z) < FLARE_R && Math.abs(p.position.y - (w.y - 2.6)) < 3) { who = p; break; }
    }
    // a flare is on her ARRIVAL, not every frame she stands there
    if (who && !S.near) {
      S.flare = FLARE_T;
      const pick = S.n++ % 3;
      S.col.set(pick < 2 ? FLARE_COLOURS[pick] : (who.style?.colour ?? 0xffffff));
    }
    S.near = !!who;
    S.flare = Math.max(0, S.flare - dt);
    const f = S.flare > 0 ? Math.min(1, S.flare / 0.4, (FLARE_T - S.flare) / 0.12 + 0.2) : 0;
    S.parts.forEach((m, k) => {
      const fl = 1 + 0.22 * Math.sin(t * (11 + k * 3) + S.ph + k) + 0.12 * Math.sin(t * (23 + k * 5) + S.ph * 2);
      const big = 1 + f * 0.7;
      m.scale.set(big * (1 - 0.08 * (fl - 1)), big * fl, big * (1 - 0.08 * (fl - 1)));
      m.rotation.z = Math.sin(t * 4.3 + S.ph + k) * 0.12;
      m.rotation.x = Math.sin(t * 3.7 + S.ph * 1.3 + k) * 0.1;
      _c.set(FIRE[k]);
      if (f > 0) _c.lerp(S.col, f * (k === 2 ? 0.5 : 0.9));   // the white core stays hot
      m.material.color.copy(_c);
    });
  }

  _lamp(S, dt, players) {
    const w = S.mesh.getWorldPosition(_v);
    let who = null;
    for (const p of players) {
      if (p?.position && Math.hypot(p.position.x - w.x, p.position.z - w.z) < LAMP_R && Math.abs(p.position.y - w.y) < 3) { who = p; break; }
    }
    if (who) S.to.set(who.style?.colour ?? 0xffffff);
    const want = who ? 1 : 0;
    S.k += Math.sign(want - S.k) * Math.min(Math.abs(want - S.k), dt * 2.5);
    S.mesh.material.color.copy(S.base).lerp(S.to, S.k * LAMP_TINT);
  }

  /** "petal particles disturbed by her feet": a handful kicked up per stride. */
  _petals(p, S, sp, dt) {
    const n = Math.min(4, sp * dt * 5 + Math.random());
    const y0 = PathFX.topAt(S, p.position.x, p.position.z);
    for (let k = 0; k < Math.floor(n); k++) {
      const a = Math.random() * Math.PI * 2;
      this._emit({
        kind: 'petal', life: 0, max: 1.4 + Math.random() * 0.8,
        p: new THREE.Vector3(p.position.x + Math.cos(a) * 0.35, y0 + 0.08, p.position.z + Math.sin(a) * 0.35),
        v: new THREE.Vector3(Math.cos(a) * (0.6 + Math.random()) + (p.velocity?.x ?? 0) * 0.25, 1.4 + Math.random() * 1.4, Math.sin(a) * (0.6 + Math.random()) + (p.velocity?.z ?? 0) * 0.25),
        rx: Math.random() * 6, ry: Math.random() * 6, spin: (Math.random() - 0.5) * 9,
        w: 0.17, h: 0.11, floor: y0 + 0.075, col: Math.random() < 0.6 ? 0xffb7cf : 0xffe0ea,
      });
    }
  }

  /** "gold prideful steps": a gold print where each foot lands, and a glint off it. */
  _carpet(p, S, sp, dt) {
    const st = this.step.get(p.index) ?? { t: 0, foot: 1 };
    st.t += dt;
    if (st.t >= STEP_T) {
      st.t = 0;
      st.foot = -st.foot;
      const vx = (p.velocity?.x ?? 0) / sp, vz = (p.velocity?.z ?? 0) / sp;
      const x = p.position.x - vz * 0.22 * st.foot, z = p.position.z + vx * 0.22 * st.foot;
      // on a slope a flat print is half under it: lift it clear by its own half-length's rise
      const y0 = PathFX.topAt(S, x, z) + (S.yAt && PathFX.topAt(S, x, z) !== S.y ? 0.07 : 0);
      this._emit({ kind: 'print', life: 0, max: 1.6, p: new THREE.Vector3(x, y0 + 0.012, z), v: new THREE.Vector3(), rx: -Math.PI / 2, ry: Math.atan2(vx, vz), spin: 0, w: 0.24, h: 0.36, floor: -Infinity, col: 0xffd34a });
      for (let k = 0; k < 3; k++) {
        this._emit({ kind: 'spark', life: 0, max: 0.7 + Math.random() * 0.4, p: new THREE.Vector3(x + (Math.random() - 0.5) * 0.3, y0 + 0.1, z + (Math.random() - 0.5) * 0.3), v: new THREE.Vector3((Math.random() - 0.5) * 0.6, 1.2 + Math.random(), (Math.random() - 0.5) * 0.6), rx: 0, ry: Math.random() * 6, spin: 6, w: 0.1, h: 0.1, floor: -Infinity, col: k ? 0xffe680 : 0xffffff });
      }
    }
    this.step.set(p.index, st);
  }

  _particles(dt, t) {
    const L = this.parts;
    for (let k = L.length - 1; k >= 0; k--) {
      const o = L[k];
      o.life += dt;
      if (o.life >= o.max) { L.splice(k, 1); continue; }
      if (o.kind === 'petal') {
        // falls like paper: slow, drifting, and it LANDS and lies there a moment
        o.v.y -= 3.2 * dt;
        o.v.x *= 1 - 1.5 * dt; o.v.z *= 1 - 1.5 * dt;
        o.v.y = Math.max(o.v.y, -1.1);
        o.p.addScaledVector(o.v, dt);
        o.p.x += Math.sin(t * 5 + o.ry) * 0.25 * dt;
        if (o.p.y <= o.floor) { o.p.y = o.floor; o.v.set(0, 0, 0); o.spin = 0; o.rx = -Math.PI / 2; }
        o.ry += o.spin * dt;
      } else if (o.kind === 'spark') {
        o.v.y -= 1.0 * dt;
        o.p.addScaledVector(o.v, dt);
        o.ry += o.spin * dt;
      }
    }
    const M = this.mesh;
    for (let k = 0; k < L.length; k++) {
      const o = L[k];
      const fade = Math.min(1, (o.max - o.life) / 0.35, o.life / 0.06 + 0.3);
      _e.set(o.rx, o.ry, o.kind === 'spark' ? o.ry : 0, 'YXZ');
      _q.setFromEuler(_e);
      _s.set(o.w * fade, o.h * fade, 1);
      _m.compose(o.p, _q, _s);
      M.setMatrixAt(k, _m);
      M.setColorAt(k, _c.set(o.col));
    }
    M.count = L.length;
    M.instanceMatrix.needsUpdate = true;
    if (M.instanceColor) M.instanceColor.needsUpdate = true;
  }
}
