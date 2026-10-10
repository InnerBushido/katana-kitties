import * as THREE from 'three';
import { Billboard, paint, toonVertexMat } from '../../core/gfx.js';
import { PLAYER_STYLE } from '../../core/palette.js';
import { mergeParts } from '../../world/build.js';
import { holoFlicker } from './holo.js';

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
   Whether she has done it is `p.dreamGeared`, saved in her row like her
   orbs are — a fact about THIS game. It was once in the Dream Dojo's own
   store beside her stars, which outlives every game, and a brand-new game
   then suited her up at a word (see DreamDojo.interact).

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
    /* The second treadmill was at (-4.6, -3.2) — 1.9 off the gate's axis
       (dream/gate.js), with its waist hoop across the lane a kitten walks in
       by. It stands beside the lane now, 6 off it. */
    treadmills: [at(-3.4, 3.6), at(-6.3, 1.4)],
    tracker: at(-11.2, -2.6),
  };
}

const glow = (colour, opacity = 1) => new THREE.MeshBasicMaterial({
  color: colour, transparent: opacity < 1, opacity, toneMapped: false, depthWrite: opacity >= 1,
});

/* ---------------------------------------------------------------------------
   THE THREE PIECES, SHAPED LIKE WHAT THEY ARE. Richard: "the 3 gear pickups
   should look like what they are": a body tracking suit "with tracking
   points"; VR gloves like the Noitom Hi5 ("I worked with that company", so
   the Hi5 mark is on the gloves' rack, behind them); and a headset like the
   VR goggles in FF7 Remake — "a large visor/glasses". They were a glowing
   box, two glowing mittens and a dark slab with dots.

   References: Design Ideas/Lionheart - Dream Dojo/VR Gloves (black and grey
   glove, the red wrist patch and trim, the battery box on the back of the
   wrist) and .../VR Goggles for players (a dark, angular wrap-around visor
   with a row of small cyan lights).

   Each is TWO meshes however many fingers it has — the lit shell and the
   unlit lights, each merged — so a rack is two draw calls (the game is
   fill-bound and counts them, docs/notes/performance.md). Built facing +Z, the
   way a rack turns its front to the pad. `userData.parts` is what world-check
   counts, so a "glove" with no fingers fails a check rather than a look.
--------------------------------------------------------------------------- */
const GEAR_RED = 0xd9262c;
export function gearModel(id, colour) {
  const shell = [];
  const lights = [];
  const put = (list, geo, c, [x, y, z] = [0, 0, 0], [rx, ry, rz] = [0, 0, 0]) => {
    if (rz) geo.rotateZ(rz);
    if (rx) geo.rotateX(rx);
    if (ry) geo.rotateY(ry);
    geo.translate(x, y, z);
    list.push(paint(geo, c));
  };
  const parts = {};
  if (id === 'headset') {
    /* A wide, shallow V of visor, brow over it, pods at the temples, a strap
       round the back and one over the top; a lens line and three lights a
       side along its lower edge. */
    const A = 0.32;
    for (const s of [-1, 1]) {
      const cx = s * 0.29 * Math.cos(A);
      const cz = -0.29 * Math.sin(A);
      // Swept up at the temples, so it is a visor and not a bar.
      const W = s * 0.14;
      put(shell, new THREE.BoxGeometry(0.62, 0.34, 0.14), 0x1d2130, [cx, 0.04, cz], [0, s * A, W]);
      put(lights, new THREE.BoxGeometry(0.5, 0.06, 0.02), colour, [cx, 0.07, cz + 0.075], [0, s * A, W]);
      for (let k = 0; k < 3; k++) {
        const d = 0.1 + k * 0.14;
        put(lights, new THREE.BoxGeometry(0.045, 0.045, 0.02), colour,
          [s * d * Math.cos(A), -0.07 + d * 0.14, -d * Math.sin(A) + 0.075], [0, s * A, W]);
      }
      put(shell, new THREE.BoxGeometry(0.12, 0.26, 0.32), 0x2b3142, [s * 0.6, 0, -0.3]);
    }
    put(shell, new THREE.BoxGeometry(1.1, 0.06, 0.2), 0x3a4258, [0, 0.25, -0.1], [-0.2, 0, 0]);
    put(shell, new THREE.TorusGeometry(0.5, 0.045, 6, 20, Math.PI), 0x262b38, [0, 0, -0.32], [-Math.PI / 2, 0, 0]);
    put(shell, new THREE.TorusGeometry(0.42, 0.04, 6, 16, Math.PI), 0x262b38, [0, 0.12, -0.34], [0, Math.PI / 2, 0]);
    parts.lights = 6;
  } else if (id === 'gloves') {
    /* The pair, backs to the pad: dark back of hand, grey finger segments,
       the red band at the knuckles and the red wrist cuff, and the battery
       box on the back of the wrist with its light. */
    let digits = 0;
    for (const s of [-1, 1]) {
      const hx = s * 0.33;
      put(shell, new THREE.BoxGeometry(0.34, 0.36, 0.12), 0x2b2e36, [hx, 0, 0]);
      put(shell, new THREE.BoxGeometry(0.35, 0.035, 0.13), GEAR_RED, [hx, 0.17, 0]);
      [-0.12, -0.04, 0.04, 0.12].forEach((dx, i) => {
        const up = [0.0, 0.03, 0.02, -0.03][i];
        put(shell, new THREE.BoxGeometry(0.07, 0.17, 0.085), 0x575c67, [hx + dx, 0.27 + up, 0], [0, 0, -dx * 0.6]);
        put(shell, new THREE.BoxGeometry(0.064, 0.13, 0.078), 0x2b2e36, [hx + dx * 1.08, 0.42 + up, 0], [0, 0, -dx * 0.6]);
        digits++;
      });
      // The thumb, on the inside of each hand.
      put(shell, new THREE.BoxGeometry(0.08, 0.22, 0.085), 0x575c67, [hx - s * 0.22, 0.1, 0.01], [0, 0, s * 0.5]);
      digits++;
      put(shell, new THREE.BoxGeometry(0.32, 0.16, 0.14), GEAR_RED, [hx, -0.27, 0]);
      put(shell, new THREE.BoxGeometry(0.2, 0.13, 0.08), 0x1a1c22, [hx, -0.27, 0.1]);
      put(lights, new THREE.BoxGeometry(0.05, 0.05, 0.02), colour, [hx + 0.06, -0.25, 0.145]);
    }
    parts.digits = digits;
  } else {
    /* The bodysuit, hanging in an A: dark, with grey panels, and on every
       joint a puck with a light in it — chest, belt, shoulders, elbows,
       wrists, hips, knees, ankles. */
    const lift = 0.2;
    const trk = [];
    const limb = (from, len, ang, r0, r1, c) => {
      const dir = [Math.sin(ang), -Math.cos(ang)];
      put(shell, new THREE.CylinderGeometry(r0, r1, len, 8), c,
        [from[0] + dir[0] * len / 2, from[1] + dir[1] * len / 2 + lift, 0], [0, 0, ang]);
      return [from[0] + dir[0] * len, from[1] + dir[1] * len];
    };
    const torso = new THREE.CylinderGeometry(0.26, 0.2, 0.62, 10);
    torso.scale(1, 1, 0.55);
    put(shell, torso, 0x1b2030, [0, 0.15 + lift, 0]);
    put(shell, new THREE.BoxGeometry(0.26, 0.5, 0.02), 0x2e3548, [0, 0.15 + lift, 0.115]);
    put(shell, new THREE.BoxGeometry(0.42, 0.16, 0.18), 0x1b2030, [0, -0.22 + lift, 0]);
    put(shell, new THREE.CylinderGeometry(0.1, 0.12, 0.08, 10), 0x2e3548, [0, 0.5 + lift, 0]);
    put(shell, new THREE.TorusGeometry(0.08, 0.02, 5, 12), 0x8a93a8, [0, 0.62 + lift, 0]);
    trk.push([0, 0.3], [0, -0.17]);
    for (const s of [-1, 1]) {
      const sh = [s * 0.28, 0.4];
      const el = limb(sh, 0.36, s * 0.35, 0.08, 0.07, 0x1b2030);
      const wr = limb(el, 0.34, s * 0.3, 0.07, 0.06, 0x2e3548);
      put(shell, new THREE.BoxGeometry(0.1, 0.13, 0.06), 0x1b2030, [wr[0] + s * 0.03, wr[1] - 0.07 + lift, 0]);
      const hip = [s * 0.12, -0.28];
      const kn = limb(hip, 0.42, s * 0.08, 0.1, 0.085, 0x1b2030);
      const an = limb(kn, 0.42, s * 0.04, 0.08, 0.065, 0x2e3548);
      put(shell, new THREE.BoxGeometry(0.13, 0.06, 0.22), 0x1b2030, [an[0], an[1] - 0.03 + lift, 0.04]);
      trk.push([sh[0], sh[1] - 0.02], el, wr, [hip[0], hip[1] - 0.04], kn, [an[0], an[1] + 0.05]);
    }
    for (const [x, y] of trk) {
      put(shell, new THREE.CylinderGeometry(0.06, 0.06, 0.03, 10), 0x0e1118, [x, y + lift, 0.11], [Math.PI / 2, 0, 0]);
      put(lights, new THREE.SphereGeometry(0.035, 8, 6), colour, [x, y + lift, 0.13]);
    }
    parts.trackers = trk.length;
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(mergeParts(shell), toonVertexMat()));
  g.add(new THREE.Mesh(mergeParts(lights), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
  g.userData.parts = parts;
  return g;
}

/** THE Hi5 MARK, drawn — a red hand with the U and its circuit lines cut
 *  into it, and the name. On the back panel of the gloves' rack. Null with no
 *  document (a check). */
function hi5Logo() {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 256;
  const g = cv.getContext('2d');
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
  g.fillStyle = '#14161c';
  rr(0, 0, 512, 256, 28);
  g.fillStyle = '#e3262b';
  rr(38, 104, 136, 124, 28);
  [14, 0, 6, 24].forEach((dy, i) => rr(44 + i * 32, 34 + dy, 27, 104, 13));
  g.save();
  g.translate(44, 160);
  g.rotate(-0.6);
  rr(-14, -70, 28, 84, 14);
  g.restore();
  g.strokeStyle = '#14161c';
  g.lineWidth = 11;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(82, 118);
  g.lineTo(82, 164);
  g.arc(108, 164, 26, Math.PI, 0, true);
  g.lineTo(134, 118);
  g.stroke();
  g.lineWidth = 5;
  for (const [x, y0, y1] of [[82, 118, 84], [134, 118, 76]]) {
    g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke();
    g.beginPath(); g.arc(x, y1 - 7, 7, 0, Math.PI * 2); g.stroke();
  }
  g.fillStyle = '#9aa0ad';
  g.font = 'bold 34px sans-serif';
  g.fillText('N O I T O M', 214, 78);
  g.fillStyle = '#f2f2f2';
  g.font = 'bold 132px sans-serif';
  g.fillText('Hi5', 206, 204);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------------------------------------------------------------------------
   THE TREADMILL GHOSTS. Richard: "Can add holograms on top of the treadmills
   of Ember and Frost's VR sprite sheets, very faded, walking in random
   directions, but with unique VR arcade colors that aren't being used yet,
   and don't look like any of the 4 players."

   The four kittens are orange, pink, cyan and purple, and the arcade already
   spends cyan, magenta, gold, yellow and two greens (HOLO, GEAR_ITEMS, the
   lasers). Left over: CHARTREUSE and COBALT — measured as hue in three's
   own (linear) HSL, 29 and 31 degrees from the nearest thing already here;
   an ultramarine (0x4a5cff) was 20 from Blossom. The drawing is worn as
   brightness only (its luminance times the colour, `_holoMat`), because a
   tint MULTIPLIES — Frost's pink under a blue came out Blossom's purple.
--------------------------------------------------------------------------- */
export const TREAD_HOLO = [
  { style: 0, colour: 0xc6ff2a },
  { style: 1, colour: 0x2e86ff },
];
/** How faded: "very". Additive, so this is how much light she adds. */
export const TREAD_ALPHA = 0.24;
/** The treadmill's own collider — the drum, so she walks round it. */
export const TREAD_R = 1.85;

/** A billboard's own material, worn as a ghost: luminance times `colour`,
 *  added to what is behind it, nothing written to depth. */
export function treadHoloMat(m, colour) {
  m.color.set(colour);
  m.transparent = true;
  m.opacity = TREAD_ALPHA;
  m.alphaTest = 0.02;
  m.depthWrite = false;
  m.blending = THREE.AdditiveBlending;
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
#ifdef USE_MAP
  diffuseColor.rgb = diffuse * (0.25 + 0.95 * dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114)));
#endif`);
  };
  m.customProgramCacheKey = () => 'tread-holo';
  return m;
}

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
      // The gloves' panel is taller: the Hi5 mark hangs over the pair, not behind it.
      const tall = item.id === 'gloves' ? 3.4 : 2.6;
      box(1.5, tall, 0.18, back.x, y + tall / 2, back.z, yaw, 0x3b4152);
      const g = gearModel(item.id, item.colour);
      g.position.set(p.x, y + 1.6, p.z);
      g.rotation.y = yaw;
      g.scale.setScalar(item.id === 'suit' ? 1.15 : 1.5);
      this.root.add(g);
      if (item.id === 'gloves') {
        const tex = hi5Logo();
        if (tex) {
          const logo = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.65),
            new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
          const lp = rel(p, yaw, 0, -0.35);
          logo.position.set(lp.x, y + 2.92, lp.z);
          logo.rotation.y = yaw;
          this.root.add(logo);
          this.logo = logo;
        }
      }
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

    /* --- omni-directional treadmills: low discs, ringed, with a frame ----
       THE POSTS MEET THE HOOP. Richard: "the poles on top of the VR
       treadmill model don't connect well to the ring". They were 1.9 tall
       from the floor through a drum 0.22 deep, so each ran 0.1 up past a hoop
       at 1.8, and the hoop was an unlit glow beside two lit posts — two
       different greys meeting in a stub. Now each post stands ON the drum,
       ends AT the hoop's centre line, with a collar over the joint and a foot
       on the drum, and hoop, collars and posts are one lit part. And it is
       solid (`TREAD_R`): "add colliders so players can't walk through". */
    this.treadmills = [];
    this.treadPosts = [];
    const HOOP_Y = 1.8;
    const DRUM = 0.22;
    for (const p of this.layout.treadmills) {
      cyl(1.7, TREAD_R, DRUM, p.x, y + DRUM / 2, p.z, 0x2a2f3e, 28);
      const yaw = this._yawIn(p);
      for (const s of [-1, 1]) {
        const q = rel(p, yaw, s * 1.55, 0);
        cyl(0.075, 0.075, HOOP_Y - DRUM, q.x, y + DRUM + (HOOP_Y - DRUM) / 2, q.z, 0x8a93a8, 8);
        cyl(0.13, 0.15, 0.08, q.x, y + DRUM + 0.04, q.z, 0x5a6378, 10);
        cyl(0.11, 0.11, 0.2, q.x, y + HOOP_Y, q.z, 0x5a6378, 10);
        this.treadPosts.push({ x: q.x, z: q.z, base: y + DRUM, top: y + HOOP_Y });
      }
      const hg = new THREE.TorusGeometry(1.55, 0.06, 6, 40);
      hg.rotateX(Math.PI / 2);
      hg.translate(p.x, y + HOOP_Y, p.z);
      parts.push(paint(hg, 0x8a93a8));
      W?.solids?.push({ x: p.x, z: p.z, r: TREAD_R });
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
      this.root.add(belt);
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
   * The ghosts on the treadmills, once the headset drawings exist. They are
   * NOT what makes those drawings load (`_updateGear` asks for them when a
   * kitten sets foot on the pad, rather than at boot — see `_begin`).
   * Sized the way `Player` sizes her, off the home sheet's height.
   */
  _buildWalkers() {
    const g = this.dream.game;
    if (this.walkers || !g?.simArt) return;
    const out = [];
    TREAD_HOLO.forEach((h, i) => {
      const a = g.simArt[h.style];
      const p = this.layout.treadmills[i];
      if (!a?.texture || !p) return;
      const st = PLAYER_STYLE[h.style];
      const quad = (g.sheets?.[st.sheet]?.height ?? 2.9) / (a.contentScale || 1);
      const b = new Billboard(a.texture, {
        cols: a.cols, rows: a.rows, width: quad, height: quad, footOffset: (a.pad ?? 0) * quad,
        mirror: a.cols <= 4 && a.rows === 1, dirSense: g.sheets?.[st.sheet]?.dirSense ?? 1, artFacesRight: true,
      });
      treadHoloMat(b.mat, h.colour);
      b.mesh.renderOrder = 7;
      b.row = Math.min(1, a.rows - 1);
      b.position.set(p.x, this.pad.y + 0.24, p.z);
      b.facing = (i * 2.3) % (Math.PI * 2);
      this.root.add(b);
      out.push({ b, base: this.pad.y + 0.24, want: b.facing, next: 1 + i, seed: i * 3.1, colour: h.colour, style: h.style, rng: 0x9e3779b9 ^ (i + 1) });
    });
    this.walkers = out.length ? out : null;
  }

  /** Turn every billboard the room owns to this lens. */
  faceCamera(camera) {
    for (const w of this.walkers ?? []) w.b.faceCamera(camera);
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
    if (!this.walkers) this._buildWalkers();
    for (const w of this.walkers ?? []) {
      /* "Walking in random directions": a new heading every 1.6-3.6s, turned
         to at a walker's pace rather than snapped, and a step's bob. */
      w.next -= dt;
      if (w.next <= 0) {
        // Seeded, so the room looks the same twice and a check can ask about it.
        const r = () => { w.rng = (Math.imul(w.rng, 1664525) + 1013904223) >>> 0; return w.rng / 4294967296; };
        w.want = w.b.facing + (r() < 0.5 ? -1 : 1) * (0.6 + r() * 2.2);
        w.next = 1.6 + r() * 2;
      }
      const d = Math.atan2(Math.sin(w.want - w.b.facing), Math.cos(w.want - w.b.facing));
      w.b.facing += d * Math.min(1, dt * 3);
      w.b.position.y = w.base + Math.abs(Math.sin(t * 5.5 + w.seed)) * 0.07;
      w.b.mat.opacity = TREAD_ALPHA * (holoFlicker(t, w.seed) / 0.82);
    }
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
