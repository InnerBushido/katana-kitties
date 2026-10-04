import * as THREE from 'three';
import { paint, toonVertexMat } from '../../core/gfx.js';
import { mergeParts } from '../../world/build.js';

/* ---------------------------------------------------------------------------
   THE GEAR ROOM — what is standing on Lionheart's pad, and the suit-up.

   Richard: "Let's also add some props to the dojo so it looks more like a VR
   training dojo with VR gear, practice swords, shinai, VR Gloves + Full-body
   tracking equipment. Anything useful to prepare fighters on their journey.
   Can even have some laser tag looking equipment with large rifles/guns as a
   hint to future VR Training possibilities. Can have omni-directional
   treadmills and lasers/colored lights to look more like a VR Dojo and laser
   tag looking cool environment."

   And the reason three of those props are RACKS rather than scenery: "we can
   have them go to a few areas in the Dream Dojo island to gather all the VR
   gear, then have them turn to camera, and then have a special effect play,
   covering up their body while they magically appear with all the sprite/VR
   outfit on ... to start the Dojo simulation, the players need to talk to
   Lionheart first to gather their equipment to go into VR for the first time.
   After that, they can just go to Lionheart and they will poof into their
   equipment without needing to gather it again."

   So: three glowing racks — HEADSET, GLOVES, TRACKING SUIT — that a kitten on
   her first visit is sent round by Lionheart, picking each up by walking into
   it. The last one starts the suit-up on the spot (DreamDojo, phase 'suit').
   Whether she has done it is `geared` in the Dream Dojo's own progress store,
   so it is remembered across days like her stars are.

   EVERYTHING HERE IS GEOMETRY (ninth non-negotiable). No lights: the game is
   fill-bound (docs/notes/performance.md), so the "lasers and coloured lights"
   are additive beams that sweep, and nothing in here adds a draw call per
   frame beyond the few meshes it builds once.

   `gearLayout` is pure — it takes the pad's `at(a, b)` (a toward the sign,
   b screen-right) and returns where everything stands — so world-check can
   prove the racks are on the pad, clear of the tubes, Lionheart and the way
   in, and reachable.
--------------------------------------------------------------------------- */

export const GEAR_ITEMS = [
  { id: 'headset', name: 'VR HEADSET', colour: 0x5ff6ff },
  { id: 'gloves', name: 'VR GLOVES', colour: 0xff4fd8 },
  { id: 'suit', name: 'TRACKING SUIT', colour: 0xffd34a },
];
/** How close counts as having picked it up: the rack's own radius and an arm. */
export const GRAB_R = 2.3;
/** A rack's solid, so she walks UP to it rather than into it. */
export const RACK_R = 0.85;

/** The pad, laid out. `at(a, b)` -> {x, z}. */
export function gearLayout(at) {
  return {
    /* THE THREE RACKS, round the free side of the pad (screen-right and
       front), clear of the tubes along the back, Lionheart on the left and
       the way in from the stones at the near-left. */
    racks: {
      headset: at(-1.7, 9.8),
      gloves: at(-7.2, 7.4),
      suit: at(-9.6, 2.4),
    },
    /* Scenery. A practice-sword stand with bokken and shinai, a laser-tag
       rack ("a hint to future VR Training possibilities"), two omni-
       directional treadmills on the floor, and a full-body tracking frame. */
    swords: at(2.4, 11.9),
    rifles: at(-5.9, 11.4),
    treadmills: [at(-3.4, 3.6), at(-4.6, -3.2)],
    tracker: at(-11.2, -2.6),
  };
}

const glow = (colour, opacity = 1) => new THREE.MeshBasicMaterial({
  color: colour, transparent: opacity < 1, opacity, toneMapped: false, depthWrite: opacity >= 1,
});

export class GearRoom {
  /**
   * @param {object} dream the DreamDojo
   * @param {THREE.Group} group where the meshes go
   * @param {(a: number, b: number) => {x: number, z: number}} at the pad's frame
   * @param {{x: number, y: number, z: number, r: number}} pad
   */
  constructor(dream, group, at, pad) {
    this.dream = dream;
    this.pad = pad;
    this.at = at;
    this.layout = gearLayout(at);
    this.t = 0;
    this.racks = [];
    this.beams = [];
    this.poofs = [];
    this.root = new THREE.Group();
    this.root.name = 'gear-room';
    group.add(this.root);
    this._build();
  }

  /** Face from a spot toward the pad's centre — racks and stands turn in. */
  _yawIn(p) { return Math.atan2(this.pad.x - p.x, this.pad.z - p.z); }

  _build() {
    const y = this.pad.y;
    const parts = [];
    const W = this.dream.game.world;
    const box = (w, h, d, x, yy, z, yaw, colour) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.rotateY(yaw);
      g.translate(x, yy, z);
      parts.push(paint(g, colour));
    };
    const cyl = (r0, r1, h, x, yy, z, colour, seg = 12) => {
      const g = new THREE.CylinderGeometry(r0, r1, h, seg);
      g.translate(x, yy, z);
      parts.push(paint(g, colour));
    };
    const rel = (p, yaw, dx, dz) => ({
      x: p.x + Math.cos(yaw) * dx + Math.sin(yaw) * dz,
      z: p.z - Math.sin(yaw) * dx + Math.cos(yaw) * dz,
    });

    /* --- the three gear racks: a dark plinth, an upright, and the item ---- */
    for (const item of GEAR_ITEMS) {
      const p = this.layout.racks[item.id];
      const yaw = this._yawIn(p);
      cyl(RACK_R, RACK_R + 0.1, 0.5, p.x, y + 0.25, p.z, 0x2f3446, 16);
      const back = rel(p, yaw, 0, -0.45);
      box(1.5, 2.6, 0.18, back.x, y + 1.3, back.z, yaw, 0x3b4152);
      const g = new THREE.Group();
      g.position.set(p.x, y + 1.6, p.z);
      g.rotation.y = yaw;
      const mat = glow(item.colour);
      if (item.id === 'headset') {
        // A visor and its strap.
        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.38, 0.32), mat);
        const strap = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 20, Math.PI), glow(0x223040));
        strap.rotation.x = Math.PI / 2;
        strap.position.z = -0.2;
        g.add(visor, strap);
      } else if (item.id === 'gloves') {
        for (const s of [-1, 1]) {
          const palm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.14), mat);
          palm.position.x = s * 0.26;
          for (let f = 0; f < 4; f++) {
            const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.08), mat);
            fin.position.set((f - 1.5) * 0.08, 0.3, 0);
            palm.add(fin);
          }
          g.add(palm);
        }
      } else {
        // The tracking suit: a hanging bodysuit with glowing tracker dots.
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.85, 0.16), glow(0x1c2230));
        const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.14), glow(0x1c2230));
        legs.position.y = -0.75;
        g.add(body, legs);
        for (const [dx, dy] of [[-0.3, 0.3], [0.3, 0.3], [0, 0.05], [-0.2, -0.55], [0.2, -0.55], [-0.2, -1.05], [0.2, -1.05]]) {
          const dot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat);
          dot.position.set(dx, dy, 0.1);
          g.add(dot);
        }
      }
      this.root.add(g);
      /* THE BEACON: a ring on the floor and a column, lit only for a kitten
         who still needs this piece. Off for everybody else, so the pad is not
         a forest of pillars on every visit. */
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.35, 1.6, 40), glow(item.colour, 0.85));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(p.x, y + 0.06, p.z);
      ring.material.side = THREE.DoubleSide;
      ring.material.blending = THREE.AdditiveBlending;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 9, 14, 1, true), glow(item.colour, 0.22));
      col.material.side = THREE.DoubleSide;
      col.material.blending = THREE.AdditiveBlending;
      col.position.set(p.x, y + 4.5, p.z);
      ring.visible = false;
      col.visible = false;
      this.root.add(ring, col);
      W?.solids?.push({ x: p.x, z: p.z, r: RACK_R });
      this.racks.push({ item, at: p, mesh: g, ring, col, baseY: y + 1.6 });
    }

    /* --- the practice swords: a stand of bokken and shinai --------------- */
    {
      const p = this.layout.swords;
      const yaw = this._yawIn(p);
      for (const dz of [-0.5, 0.5]) {
        const q = rel(p, yaw, 0, dz);
        box(2.4, 0.16, 0.16, q.x, y + 0.6, q.z, yaw, 0x6a4a36);
        box(2.4, 0.16, 0.16, q.x, y + 1.6, q.z, yaw, 0x6a4a36);
      }
      for (const dx of [-1.2, 1.2]) {
        const q = rel(p, yaw, dx, 0);
        box(0.16, 1.9, 1.2, q.x, y + 0.95, q.z, yaw, 0x5a3e2e);
      }
      // Six blades leaning in the stand: three bokken (wood), three shinai
      // (bamboo slats, a pale stripe and a dark tsuka).
      for (let i = 0; i < 6; i++) {
        const q = rel(p, yaw, -0.9 + i * 0.36, 0);
        const shinai = i % 2 === 1;
        const g = new THREE.CylinderGeometry(shinai ? 0.07 : 0.055, shinai ? 0.08 : 0.06, 2.6, 6);
        g.rotateX(0.18);
        g.rotateY(yaw);
        g.translate(q.x, y + 1.35, q.z);
        parts.push(paint(g, shinai ? 0xd8c48a : 0x9a6a40));
        const h = new THREE.CylinderGeometry(0.075, 0.075, 0.55, 6);
        h.rotateX(0.18);
        h.rotateY(yaw);
        h.translate(q.x, y + 0.42, q.z);
        parts.push(paint(h, shinai ? 0xe9e2d0 : 0x2a1a14));
      }
      W?.solids?.push({ x: p.x, z: p.z, r: 1.3 });
    }

    /* --- laser tag: a rack of big rifles ------------------------------- */
    {
      const p = this.layout.rifles;
      const yaw = this._yawIn(p);
      const back = rel(p, yaw, 0, -0.35);
      box(2.8, 2.4, 0.2, back.x, y + 1.2, back.z, yaw, 0x30364a);
      for (let i = 0; i < 3; i++) {
        const q = rel(p, yaw, -0.9 + i * 0.9, 0);
        const body = new THREE.Group();
        body.position.set(q.x, y + 1.3, q.z);
        body.rotation.y = yaw;
        body.rotation.z = Math.PI / 2 - 0.12;
        const barrel = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.22, 0.22), glow(0x262c3c));
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.24), glow(0x262c3c));
        stock.position.x = -0.95;
        const strip = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.26), glow(i === 1 ? 0xff4fd8 : 0x5ff6ff));
        strip.position.y = 0.1;
        const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), glow(0xff3b3b));
        muzzle.position.x = 0.9;
        body.add(barrel, stock, strip, muzzle);
        this.root.add(body);
      }
      W?.solids?.push({ x: p.x, z: p.z, r: 1.4 });
    }

    /* --- omni-directional treadmills: low discs, ringed, with a frame ---- */
    this.treadmills = [];
    for (const p of this.layout.treadmills) {
      cyl(1.7, 1.85, 0.22, p.x, y + 0.11, p.z, 0x2a2f3e, 28);
      const yaw = this._yawIn(p);
      // The waist hoop on two posts.
      for (const s of [-1, 1]) {
        const q = rel(p, yaw, s * 1.55, 0);
        cyl(0.07, 0.07, 1.9, q.x, y + 0.95, q.z, 0x8a93a8, 6);
      }
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.06, 6, 36), glow(0x8a93a8));
      hoop.rotation.x = Math.PI / 2;
      hoop.position.set(p.x, y + 1.8, p.z);
      // The belt: rings that run inward, so the floor reads as moving under you.
      const belt = new THREE.Mesh(new THREE.RingGeometry(0.3, 1.6, 36, 3), new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: 'uniform float uTime; varying vec2 vP; void main(){ float r = length(vP); float b = fract(r*2.2 + uTime*1.4); float a = smoothstep(0.0,0.12,b)*smoothstep(0.5,0.3,b)*0.55; gl_FragColor = vec4(0.37,0.96,1.0,a); }',
      }));
      belt.rotation.x = -Math.PI / 2;
      belt.position.set(p.x, y + 0.24, p.z);
      this.root.add(hoop, belt);
      this.treadmills.push(belt);
    }

    /* --- the full-body tracking frame: a stand with sensor bars ---------- */
    {
      const p = this.layout.tracker;
      const yaw = this._yawIn(p);
      for (const s of [-1, 1]) {
        const q = rel(p, yaw, s * 1.4, 0);
        cyl(0.09, 0.09, 4.2, q.x, y + 2.1, q.z, 0x8a93a8, 6);
        for (let k = 0; k < 4; k++) {
          const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.22), glow(k % 2 ? 0xff4fd8 : 0x5ff6ff));
          lamp.position.set(q.x, y + 0.7 + k * 1.05, q.z);
          this.root.add(lamp);
        }
      }
      const top = rel(p, yaw, 0, 0);
      box(3.0, 0.16, 0.16, top.x, y + 4.2, top.z, yaw, 0x8a93a8);
      W?.solids?.push({ x: p.x, z: p.z, r: 1.0 });
    }

    if (parts.length) {
      const m = new THREE.Mesh(mergeParts(parts), toonVertexMat());
      m.castShadow = true;
      m.receiveShadow = true;
      this.root.add(m);
    }

    /* --- the lasers: beams that sweep over the pad from the rim ---------- */
    const beamGeo = new THREE.CylinderGeometry(0.05, 0.22, 26, 6, 1, true);
    beamGeo.translate(0, 13, 0);
    const colours = [0x5ff6ff, 0xff4fd8, 0x7dff6a, 0xffd34a, 0xff4fd8, 0x5ff6ff];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const pivot = new THREE.Group();
      pivot.position.set(this.pad.x + Math.cos(a) * (this.pad.r - 0.6), y + 0.1, this.pad.z + Math.sin(a) * (this.pad.r - 0.6));
      const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
        color: colours[i], transparent: true, opacity: 0.32, depthWrite: false,
        blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
      }));
      pivot.add(m);
      this.root.add(pivot);
      this.beams.push({ pivot, a, phase: i * 1.7 });
    }
  }

  /**
   * Is this kitten close enough to a rack to take its piece? Returns the
   * item id, or null.
   */
  rackAt(p) {
    for (const r of this.racks) {
      if (Math.hypot(p.position.x - r.at.x, p.position.z - r.at.z) < GRAB_R
        && Math.abs(p.position.y - this.pad.y) < 1.5) return r.item.id;
    }
    return null;
  }

  /** Light the racks a kitten still needs; `need` is a Set of item ids
   *  across everybody who is gathering. */
  light(need) {
    for (const r of this.racks) {
      const on = need.has(r.item.id);
      r.ring.visible = on;
      r.col.visible = on;
    }
  }

  /**
   * A puff that hides her while she changes. Holographic, in her colour:
   * a cloud, voxels flying off it and rings running up her height — "a
   * special effect play, covering up their body while they magically appear".
   * `size` 'small' is the shorter version a fall-and-respawn uses.
   */
  poof(pos, colour = 0x5ff6ff, size = 'full', height = 3) {
    const big = size !== 'small';
    const g = new THREE.Group();
    g.position.set(pos.x, pos.y, pos.z);
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false,
    });
    const cloud = [];
    const n = big ? 9 : 5;
    for (let i = 0; i < n; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), cloudMat);
      const a = (i / n) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.7, (i % 3) * height * 0.33 + 0.4, Math.sin(a) * 0.7);
      s.userData.base = (big ? 1.1 : 0.8) + (i % 2) * 0.3;
      s.scale.setScalar(0.01);
      g.add(s);
      cloud.push(s);
    }
    const voxMat = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 1, toneMapped: false, depthWrite: false });
    const vox = [];
    for (let i = 0; i < (big ? 28 : 12); i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), voxMat);
      const a = Math.random() * Math.PI * 2;
      m.position.set(0, Math.random() * height, 0);
      m.userData.v = new THREE.Vector3(Math.cos(a) * (2 + Math.random() * 3), 1 + Math.random() * 4, Math.sin(a) * (2 + Math.random() * 3));
      g.add(m);
      vox.push(m);
    }
    const ringMat = new THREE.MeshBasicMaterial({
      color: colour, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    const rings = [];
    for (let i = 0; i < (big ? 3 : 2); i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.06, 6, 40), ringMat);
      r.rotation.x = Math.PI / 2;
      g.add(r);
      rings.push(r);
    }
    g.renderOrder = 30;
    this.root.parent?.add(g);
    this.poofs.push({ g, cloud, vox, rings, t: 0, dur: big ? 1.3 : 0.8, height, cloudMat, voxMat, ringMat });
  }

  update(dt) {
    this.t += dt;
    const t = this.t;
    for (const r of this.racks) {
      r.mesh.position.y = r.baseY + Math.sin(t * 2 + r.at.x) * 0.08;
      r.mesh.rotation.y += dt * 0.6;
      if (r.ring.visible) {
        const k = 0.6 + 0.4 * Math.sin(t * 5);
        r.ring.material.opacity = k;
        r.col.material.opacity = 0.14 + 0.1 * k;
      }
    }
    for (const b of this.treadmills ?? []) b.material.uniforms.uTime.value = t;
    for (const b of this.beams) {
      // Each beam leans out and sweeps on its own slow figure, like a show.
      b.pivot.rotation.set(0.55 + Math.sin(t * 0.7 + b.phase) * 0.35, b.a + Math.sin(t * 0.45 + b.phase) * 0.9, 0, 'YXZ');
      b.pivot.children[0].material.opacity = 0.22 + 0.12 * (0.5 + 0.5 * Math.sin(t * 3.1 + b.phase));
    }
    for (let i = this.poofs.length - 1; i >= 0; i--) {
      const P = this.poofs[i];
      P.t += dt;
      const k = P.t / P.dur;
      // The cloud swells fast, holds while she changes, and thins away.
      const swell = Math.min(1, P.t / 0.18);
      const thin = Math.max(0, (k - 0.55) / 0.45);
      for (const s of P.cloud) s.scale.setScalar(s.userData.base * swell * (1 + thin * 0.4));
      P.cloudMat.opacity = 0.92 * (1 - thin);
      for (const m of P.vox) {
        m.position.addScaledVector(m.userData.v, dt);
        m.userData.v.y -= 6 * dt;
        m.rotation.x += dt * 6;
        m.rotation.y += dt * 4;
      }
      P.voxMat.opacity = Math.max(0, 1 - k);
      P.rings.forEach((r, j) => {
        const rk = Math.max(0, Math.min(1, (P.t - j * 0.12) / (P.dur * 0.7)));
        r.position.y = rk * P.height * 1.2;
        r.scale.setScalar(1 + rk * 0.6);
      });
      P.ringMat.opacity = 0.9 * (1 - k);
      if (P.t >= P.dur) {
        P.g.removeFromParent();
        P.g.traverse((o) => o.geometry?.dispose?.());
        P.cloudMat.dispose(); P.voxMat.dispose(); P.ringMat.dispose();
        this.poofs.splice(i, 1);
      }
    }
  }
}
