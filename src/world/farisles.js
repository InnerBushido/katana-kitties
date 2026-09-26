import * as THREE from 'three';
import { paint, toonVertexMat } from '../core/gfx.js';
import {
  PALETTE, buildTorii, buildTree, buildHouse, mergeParts, transformParts, valueNoise,
} from './build.js';
import { cloudPuff, mergeSlotted, puffMaterial } from './snakeway.js';

/* ---------------------------------------------------------------------------
   THE FAR ISLANDS — new worlds on the horizon, and the ending conjures them.

   The reference frame (`out/trailer/shots/s01.png`) is floating islands with
   pagodas, torii, cherry trees and water pouring off their rims into the
   clouds. "Can also add new worlds and islands in the distance with the
   waterfalls ... mainly to build excitement and make the world look cool."
   They are backdrop and nothing else: never collided with, never ground, and
   440+ out, past any dragon flight.

   THEY USED TO RISE, ALL SEVEN AS ONE, WITH THE DAWN. Then: "When the distant
   islands appear on the screen during the cutscene, should make them appear
   and construct in a more cool way ... have them fade into existence through
   some clouds ... the clouds act as a masking portal". So each island now has
   its own clock and its own portal:

     1. a disc of cloud gathers where its waist will be;
     2. the island comes UP THROUGH IT — everything below the cloud's plane is
        not drawn, so the roof of the pagoda breaks the surface first, then the
        trees, then the grass — fading in as it comes;
     3. the plane drops away under cover of the cloud, so the keel is there;
     4. the cloud thins to a skirt round the waist, which is how an island
        floating in the sky ought to look anyway;
     5. and THEN the water: "have the waterfall appear as it is growing and
        forming from nothingness, into a realistic and raging waterfall."

   AND NOW EACH ONE IS PLACED FOR THE SHOT THAT SHOWS IT. They used to be
   scattered round the horizon on a seeded ring, and the ending started
   whichever its frustum happened to catch: "they are far away and in the
   corner of the screen and hard to notice". So `FAR_PLACES` is a list, not a
   ring, and every row says which pan it is for. The positions were SOLVED,
   not guessed — unprojected from the pans' own recorded lenses into the one
   strip of open sky each has (see `FAR_PLACES`) — and `world-check` projects
   them back through the same lenses to prove they are still there.

   AND THEY SHOOT THROUGH THEIR CLOUDS NOW, rather than rising: "formed out of
   very large clouds and they 'shoot through' the clouds to make it more
   abrupt and grandiose ... while the clouds that spawned them are fading
   away, then the waterfall starts forming". The ending drives each pan's
   islands off its own clock (`show`), so a skip or a scrub lands on the frame
   it should; the two behind the wide shot's lens never put on a show at all,
   and are simply put up by `revealAll` with the roads.

   FOUR DRAW CALLS FOR ALL SEVEN. Land, water, spray and portals are each one
   merged mesh, and each vertex knows which island it belongs to (`isle`); a
   uniform array per island is the whole animation. Seven islands animating
   independently as seven sets of meshes would have been twenty-eight draws for
   a thing on the horizon.
--------------------------------------------------------------------------- */

export const FAR = {
  /** Seconds, cloud to finished waterfall, for an island in the WIDE shot.
   *  Short because of where it has to fit: the pull-out is 3.1s and "the
   *  islands should be fully formed and the clouds faded at least 2 seconds
   *  before the ending of this scene", so everything an eye sees - the shot
   *  up, the cloud going, the water - is inside its first second and a bit. */
  show: 1.6,
  /** ...and for the one in the truck across the town, which has three
   *  seconds to itself and is the first new thing the ending shows. */
  showFirst: 2.4,
  /** The shape of a show, as fractions of it. The cloud gathers; the island
   *  SHOOTS up through it — an ease-out-back, so it overshoots and settles
   *  rather than drifting to a stop; the cut plane drops away under cover of
   *  the cloud so the keel is there; the cloud fades; and the water, which
   *  starts as the island lands, is full as the last of the cloud goes. */
  gather: [0, 0.38],
  shoot: [0.38, 0.58],
  unclip: [0.52, 0.62],
  clear: [0.58, 0.92],
  pour: [0.52, 1],
  /** Between two islands of the same pan starting. Small: four of them
   *  going up almost together is the "grandiose" in the note, and the
   *  whole pan's set has to be done 2s before the cut. */
  gap: 0.04,
  /** How far below its grass the portal's plane sits. */
  waist: 3,
  /** How far an island shoots up through its portal. Twice what it rose
   *  when it rose slowly; it covers it in a third of the time. */
  rise: 90,
};

/**
 * WHERE EACH ONE IS, AND FOR WHICH SHOT.
 *
 * `shot: 'A'` is the truck across the town on "There is nothing left
 * standing". Its only open sky is a strip at the top left — the right of that
 * frame is the arena and its island — so the one island it gets is put there,
 * 850 out, at about (-0.5, 0.7) in its frame: "one of the islands in the
 * background ... we can see it in this cutscene with this camera angle", and
 * the camera is not moved off the town to make room.
 *
 * `shot: 'B'` is the pull-out to the archipelago. The islands of the
 * archipelago itself fill that frame from its foot to about y = 0.45, and the
 * letterbox takes everything above 0.82, so the band between is the only sky
 * a new island can stand in without standing in front of an old one. They are
 * spread across it from -0.62 to 0.58 — the middle of the frame, not its
 * corners, which is where they were. The A island reappears in this shot
 * too, at about (0.33, 0.5), already standing.
 *
 * `shot: null` are behind the wide shot's lens: the horizon has them, the
 * ending never looks at them.
 *
 * `y` is the grass. Radii are about what the old seeded ring made, except
 * the truck's, which is half as big again: at 850 out and r = 60 it was
 * forty pixels of a 1280 frame. Nearer would have been bigger too, but on
 * this ray nearer puts it over the frost island in the wide shot.
 */
export const FAR_PLACES = [
  { x: -675, y: -74, z: -314, r: 88, shot: 'A' },
  { x: -244, y: 75, z: 333, r: 40, shot: 'B' },
  { x: -408, y: 62, z: 220, r: 44, shot: 'B' },
  { x: -385, y: 50, z: 29, r: 44, shot: 'B' },
  { x: -268, y: 63, z: -296, r: 40, shot: 'B' },
  { x: 445, y: 37, z: 121, r: 33, shot: null },
  { x: 211, y: 31, z: 415, r: 33, shot: null },
];

const MAX = 8;
const sm = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const win = (t, w) => sm((t - w[0]) / (w[1] - w[0]));
/** An ease-out-back: past 1 and back. The "abrupt" of a thing shot upward. */
const back = (t) => {
  t = Math.max(0, Math.min(1, t)) - 1;
  return 1 + 2.2 * t * t * t + 1.2 * t * t;
};

/** Where the islands are and what each is — `FAR_PLACES`, dressed. The
 *  dressing (house or pagoda, where the trees go) is seeded off the index, so
 *  the horizon is the same in every game. `avoid` is kept as a guard: an
 *  entry that would stand on something is dropped rather than drawn. */
function layout(avoid) {
  const isles = [];
  FAR_PLACES.forEach((p, i) => {
    if (avoid.some((a) => Math.hypot(p.x - a.x, p.z - a.z) < a.r)) return;
    isles.push({ ...p, i, n: (a) => valueNoise(i, a, 131) });
  });
  return isles;
}

/** Stamp an island index onto every vertex of a merged geometry. */
function tagged(parts, isle) {
  const g = mergeParts(parts);
  g.setAttribute('isle', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(isle), 1));
  return g;
}

/** Concatenate geometries that share position/normal/color/isle (+extras). */
function concat(geos, names) {
  let nv = 0;
  let ni = 0;
  for (const g of geos) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  const arrays = {};
  for (const name of names) {
    const size = geos[0].attributes[name].itemSize;
    arrays[name] = { a: new Float32Array(nv * size), size };
  }
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0;
  let io = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    for (const name of names) arrays[name].a.set(g.attributes[name].array, vo * arrays[name].size);
    if (g.index) {
      const gi = g.index.array;
      for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
      io += gi.length;
    } else {
      for (let i = 0; i < n; i++) idx[io + i] = i + vo;
      io += n;
    }
    vo += n;
  }
  for (const name of names) out.setAttribute(name, new THREE.BufferAttribute(arrays[name].a, arrays[name].size));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

/* The glsl both the water and the spray use: a value noise good enough for
   streaks. (No backticks in here — it is inside a JS template literal.) */
const NOISE = `
  float farHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float farNoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(farHash(i), farHash(i + vec2(1.0, 0.0)), f.x),
               mix(farHash(i + vec2(0.0, 1.0)), farHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }`;

export class FarIsles {
  /**
   * @param avoid {x, z, r}[] places they must keep away from — the arena, whose
   *              ring of backdrop is already cleared (see `_buildDistantScenery`)
   */
  constructor(scene, avoid = []) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.time = 0;
    const L = layout(avoid);
    this.isles = L.map((s, k) => ({
      x: s.x, y: s.y, z: s.z, r: s.r, slot: k, shot: s.shot,
      started: false, t: 0, dur: FAR.show, reveal: 0, fall: 0, driven: false,
    }));

    const landGeos = [];
    const fallGeos = [];
    const spray = [];
    const portals = [];
    L.forEach((s, k) => {
      const { x, y, z, r, n, i } = s;
      const land = [];
      // Grass top, a lip of rock, and a long keel of stone beneath.
      const top = new THREE.CylinderGeometry(r, r * 0.94, 4, 18);
      paint(top, PALETTE.grass);
      top.translate(x, y - 2, z);
      land.push(top);
      const keel = new THREE.ConeGeometry(r * 0.94, r * 2.1, 12);
      keel.rotateX(Math.PI);
      const pa = keel.attributes.position;
      const arr = new Float32Array(pa.count * 3);
      const cc = new THREE.Color();
      for (let v = 0; v < pa.count; v++) {
        const kk = pa.getY(v) / (r * 2.1) + 0.5;
        cc.set(PALETTE.rockDark).lerp(new THREE.Color(PALETTE.rock), kk);
        arr[v * 3] = cc.r; arr[v * 3 + 1] = cc.g; arr[v * 3 + 2] = cc.b;
      }
      keel.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      keel.translate(x, y - 4 - r * 1.05, z);
      land.push(keel);

      // A pagoda on every other one, a house on the rest — facing the middle.
      // Scaled with a big island, or the truck's reads as a lawn with a shed.
      const dk = Math.max(1, r / 50);
      const face = Math.atan2(-x, -z);
      const tall = i % 2 === 0;
      const house = buildHouse({
        w: 7, d: 6, floors: tall ? 3 : 2,
        tile: tall ? PALETTE.tileRed : PALETTE.tileIndigo,
      });
      land.push(...transformParts(house, x + Math.sin(face) * -r * 0.2, y, z + Math.cos(face) * -r * 0.2,
        face, 2.4 * dk));
      land.push(...transformParts(buildTorii(1), x + Math.sin(face) * r * 0.62, y,
        z + Math.cos(face) * r * 0.62, face + Math.PI / 2, 2.2 * dk));
      // A bigger island is not an emptier one: about a tree per 11 units.
      const trees = Math.max(3, Math.round(r / 11));
      for (let t = 0; t < trees; t++) {
        const ta = face + 1.2 + t * (5.2 / trees) + n(10 + t) * 0.6;
        const td = r * (0.45 + n(20 + t) * 0.35);
        land.push(...transformParts(buildTree(i * 7 + t, 1, 'blossom'),
          x + Math.sin(ta) * td, y, z + Math.cos(ta) * td, n(30 + t) * 6, 2.3 * dk));
      }

      /* The waterfall leaves the rim on the side facing the archipelago, so it
         is the side you see; a stream across the grass leads to it, and a
         notch of rock either side of the lip is where it spills from. */
      const fa = face + (n(40) - 0.5) * 0.9;
      const ox = Math.sin(fa);
      const oz = Math.cos(fa);
      const fx = x + ox * (r + 0.4);
      const fz = z + oz * (r + 0.4);
      const drop = 110 + n(41) * 70;
      const wide = 5 + n(42) * 4;
      const stream = new THREE.BoxGeometry(wide * 0.8, 0.3, r * 0.7);
      paint(stream, 0x7fc7e8);
      stream.translate(0, 0.1, r * 0.65);
      stream.rotateY(fa);
      stream.translate(x, y, z);
      land.push(stream);
      for (const sd of [-1, 1]) {
        const lip = new THREE.IcosahedronGeometry(2.2, 0);
        lip.scale(1, 1.3, 1);
        paint(lip, PALETTE.rockDark);
        lip.translate(fx + oz * sd * (wide * 0.62) - ox * 0.6, y + 0.4, fz - ox * sd * (wide * 0.62) - oz * 0.6);
        land.push(lip);
      }
      landGeos.push(tagged(land, k));

      /* THE SHEET: bowed outward as it falls, the way water leaves an edge, and
         a little wider at the bottom than the top, because a fall spreads.
         `fall` (0 at the lip, 1 at the bottom) and `across` (0..1) are what the
         shader draws from; `isle` says whose clock it runs on. */
      const SEG = 24;
      const pos = [];
      const fall = [];
      const across = [];
      const idx = [];
      for (let a = 0; a <= SEG; a++) {
        const f = a / SEG;
        const bow = f * f * 16 + f * 3;
        const hw = wide * (0.5 + f * 0.3);
        for (let c = 0; c <= 2; c++) {
          const u = c / 2;
          const lat = (u - 0.5) * 2 * hw;
          pos.push(fx + ox * bow + oz * lat, y - 0.3 - f * drop, fz + oz * bow - ox * lat);
          fall.push(f);
          across.push(u);
        }
      }
      for (let a = 0; a < SEG; a++) {
        for (let c = 0; c < 2; c++) {
          const i0 = a * 3 + c;
          idx.push(i0, i0 + 3, i0 + 1, i0 + 1, i0 + 3, i0 + 4);
        }
      }
      const sheet = new THREE.BufferGeometry();
      sheet.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      sheet.setAttribute('fall', new THREE.Float32BufferAttribute(fall, 1));
      sheet.setAttribute('across', new THREE.Float32BufferAttribute(across, 1));
      sheet.setAttribute('isle', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(k), 1));
      sheet.setAttribute('drop', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(drop), 1));
      sheet.setIndex(idx);
      fallGeos.push(sheet);

      /* THE SPRAY, as three emitters: a fan of droplets thrown off the lip,
         clumps of water falling with the sheet, and mist billowing up where it
         meets the cloud sea. Each particle is a seed and a kind; the shader
         works out where it is from the time, so nothing is uploaded per frame. */
      const emit = (kind, count) => {
        for (let j = 0; j < count; j++) {
          const q = (a) => valueNoise(k * 997 + kind * 131 + j, a, 71);
          spray.push({ k, kind, sx: q(1), sy: q(2), sz: q(3), fx, fy: y - 0.3, fz, ox, oz, drop, wide });
        }
      };
      emit(0, 30);
      emit(1, 60);
      emit(2, 26);

      /* THE PORTAL: a VERY LARGE bank of cloud where the island's waist
         will be — "formed out of very large clouds" — built round its own
         origin so the slot can grow it from nothing. It was a disc of
         sixteen puffs a third of the island across, and it read as a ring
         of cotton wool round something rising; this is a cloud the island
         is hidden IN, twice its width and piled up above its grass, so what
         comes out of it has come from somewhere. */
      const puffs = [];
      for (let j = 0; j < 22; j++) {
        const q = (a) => valueNoise(k * 53 + j, a, 29);
        const a = (j / 22) * Math.PI * 2 * 3 + q(1) * 0.8;
        const d = r * (j < 6 ? q(2) * 0.5 : 0.55 + q(2) * 0.85);
        const rad = r * (0.45 + q(3) * 0.4);
        const g = cloudPuff(rad, k * 71 + j, 0.58);
        g.translate(Math.cos(a) * d, (q(4) - 0.35) * r * 0.55, Math.sin(a) * d);
        puffs.push(g);
      }
      portals.push({ parts: puffs, slot: k });
    });

    /* --- the land --- */
    const landMat = toonVertexMat({ fog: true });
    const U = {
      /* per island: x = how far it has still to rise, y = the portal's plane
         (nothing below it is drawn), z = how far it has faded in */
      uIsle: { value: Array.from({ length: MAX }, () => new THREE.Vector4(0, -1e9, 0, 0)) },
    };
    landMat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, U);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute float isle;
          uniform vec4 uIsle[${MAX}];
          varying vec3 vFarW;
          varying vec2 vFarClip;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          int farI = int(isle + 0.5);
          transformed.y -= uIsle[farI].x;
          vFarClip = uIsle[farI].yz;`)
        .replace('#include <project_vertex>', `#include <project_vertex>
          vFarW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vFarW;
          varying vec2 vFarClip;`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          /* Below the portal is not there yet, and the plane is soft for a
             few units so it breaks up like cloud rather than being sliced. */
          float farDn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          if (vFarW.y < vFarClip.x - farDn * 5.0) discard;
          if (farDn > vFarClip.y) discard;`);
    };
    landMat.customProgramCacheKey = () => 'far-isle-land';
    const land = new THREE.Mesh(concat(landGeos, ['position', 'normal', 'color', 'isle']), landMat);
    land.frustumCulled = false;
    this.group.add(land);

    /* --- the water --- */
    const W = {
      uTime: { value: 0 },
      uGrow: { value: new Float32Array(MAX) },
    };
    const waterMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
      vertexShader: `
        attribute float fall;
        attribute float across;
        attribute float isle;
        attribute float drop;
        uniform float uGrow[${MAX}];
        varying float vFall;
        varying float vAcross;
        varying float vGrow;
        varying float vDrop;
        #include <fog_pars_vertex>
        void main() {
          vFall = fall;
          vAcross = across;
          vGrow = uGrow[int(isle + 0.5)];
          vDrop = drop;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform float uTime;
        varying float vFall;
        varying float vAcross;
        varying float vGrow;
        varying float vDrop;
        #include <fog_pars_fragment>
        ${NOISE}
        void main() {
          if (vGrow <= 0.001) discard;
          /* THE FRONT: water has got as far as it has, falling faster the
             further it goes, with a ragged leading edge. */
          float front = vGrow * vGrow * 1.06;
          float rag = (farNoise(vec2(vAcross * 7.0, uTime * 3.0)) - 0.5) * 0.05;
          if (vFall > front + rag) discard;
          // A trickle first, then the whole width.
          float hw = mix(0.12, 0.5, smoothstep(0.0, 0.55, vGrow));
          float ax = abs(vAcross - 0.5);
          float side = 1.0 - smoothstep(hw * 0.72, hw, ax);
          if (side <= 0.0) discard;
          /* STREAKS THAT ACCELERATE: two layers of noise stretched down the
             fall and scrolled faster the lower they are, the way water leaving
             a lip speeds up. */
          float along = vFall * vDrop;
          float s = along * 0.05 - uTime * (0.8 + vFall * 2.2);
          float n1 = farNoise(vec2(vAcross * 12.0, s * 2.0));
          float n2 = farNoise(vec2(vAcross * 29.0 + 3.1, s * 5.0));
          vec3 deep = vec3(0.42, 0.68, 0.88);
          vec3 light = vec3(0.86, 0.95, 1.0);
          vec3 col = mix(deep, light, n1 * 0.65 + n2 * 0.35);
          float foam = max(1.0 - smoothstep(0.0, 0.07, vFall), smoothstep(0.62, 1.0, vFall) * 0.85);
          foam = max(foam, (1.0 - smoothstep(0.0, 0.04, front - vFall)) * 0.9);
          col = mix(col, vec3(1.0), clamp(foam + smoothstep(0.72, 0.95, n2) * 0.45, 0.0, 1.0));
          // Solid at the lip, breaking into strands as it falls, gone into the cloud.
          float body = mix(0.92, 0.3 + 0.7 * smoothstep(0.25, 0.75, n1), smoothstep(0.35, 1.0, vFall));
          float a = side * body * (1.0 - smoothstep(0.86, 1.0, vFall));
          gl_FragColor = vec4(col, a);
          #include <fog_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    });
    Object.assign(waterMat.uniforms, W);
    const water = new THREE.Mesh(concat(fallGeos, ['position', 'fall', 'across', 'isle', 'drop']), waterMat);
    water.frustumCulled = false;
    water.renderOrder = 2;
    this.group.add(water);

    /* --- the spray --- */
    const S = spray.length;
    const a0 = new Float32Array(S * 3);
    const aKind = new Float32Array(S * 4);
    const aLip = new Float32Array(S * 3);
    const aOut = new Float32Array(S * 4);
    spray.forEach((p, j) => {
      a0.set([p.fx, p.fy, p.fz], j * 3);
      aKind.set([p.kind, p.sx, p.sy, p.sz], j * 4);
      aLip.set([p.fx, p.fy, p.fz], j * 3);
      aOut.set([p.ox, p.oz, p.drop, p.wide], j * 4);
    });
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(a0, 3));
    sg.setAttribute('kind', new THREE.BufferAttribute(aKind, 4));
    sg.setAttribute('lip', new THREE.BufferAttribute(aLip, 3));
    sg.setAttribute('outd', new THREE.BufferAttribute(aOut, 4));
    sg.setAttribute('isle', new THREE.BufferAttribute(new Float32Array(spray.map((p) => p.k)), 1));
    const sprayMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
      vertexShader: `
        attribute vec4 kind;
        attribute vec3 lip;
        attribute vec4 outd;
        attribute float isle;
        uniform float uTime;
        uniform float uGrow[${MAX}];
        varying float vAlpha;
        varying float vKind;
        #include <fog_pars_vertex>
        void main() {
          float k = kind.x;
          float grow = uGrow[int(isle + 0.5)];
          vec3 o = vec3(outd.x, 0.0, outd.y);
          vec3 lat = vec3(outd.y, 0.0, -outd.x);
          float drop = outd.z;
          float wide = outd.w;
          float life = k < 0.5 ? 1.3 : (k < 1.5 ? 2.4 : 4.5);
          float age = fract(uTime / life + kind.y);
          vec3 p;
          float size;
          float a;
          if (k < 0.5) {
            // Thrown off the lip in a fan, arcing out and down.
            p = lip + o * (1.5 + age * 7.0) + lat * (kind.z - 0.5) * wide * 1.5
              + vec3(0.0, age * 3.0 - age * age * 9.0, 0.0);
            size = 1.6 + kind.w * 2.0;
            a = (1.0 - age) * 0.85 * smoothstep(0.1, 0.3, grow);
          } else if (k < 1.5) {
            // Clumps riding the sheet down, spreading as they go.
            float f = age;
            float bow = f * f * 16.0 + f * 3.0;
            p = lip + o * (bow + 1.0 + kind.w * 3.5) + lat * (kind.z - 0.5) * wide * (1.2 + f * 1.4)
              - vec3(0.0, f * drop, 0.0);
            size = 2.5 + f * 6.0 + kind.w * 2.0;
            a = 0.5 * (1.0 - f * 0.6) * step(f, grow * grow * 1.06);
          } else {
            // Mist boiling up out of the cloud sea at the foot.
            p = lip + o * (19.0 + kind.w * 12.0) + lat * (kind.z - 0.5) * wide * 4.0
              - vec3(0.0, drop * 0.92, 0.0) + vec3(0.0, age * 22.0, 0.0);
            size = 12.0 + age * 26.0 + kind.w * 8.0;
            a = 0.34 * sin(3.14159 * age) * smoothstep(0.85, 1.0, grow);
          }
          vAlpha = a;
          vKind = k;
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = a > 0.0 ? size * projectionMatrix[1][1] * 300.0 / max(1.0, -mvPosition.z) : 0.0;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        varying float vAlpha;
        varying float vKind;
        #include <fog_pars_fragment>
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.08, d) * vAlpha;
          if (a < 0.01) discard;
          vec3 col = vKind > 1.5 ? vec3(1.0, 0.99, 0.97) : vec3(0.9, 0.97, 1.0);
          gl_FragColor = vec4(col, a);
          #include <fog_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    sprayMat.uniforms.uTime = W.uTime;
    sprayMat.uniforms.uGrow = W.uGrow;
    const points = new THREE.Points(sg, sprayMat);
    points.frustumCulled = false;
    points.renderOrder = 3;
    this.group.add(points);

    /* --- the portals --- */
    this.portalMat = puffMaterial({ billow: 3.2, wave: 0.045 });
    const portal = new THREE.Mesh(mergeSlotted(portals), this.portalMat);
    portal.frustumCulled = false;
    portal.renderOrder = 4;
    this.group.add(portal);

    this.U = U;
    this.W = W;
    this.meshes = { land, water, points, portal };
    this._apply();
  }

  /** Are any of them there at all? Nothing is drawn until one is. */
  get anyShown() { return this.isles.some((s) => s.started); }

  /** The islands one pan of the ending is for — see `FAR_PLACES`. */
  of(shot) { return this.isles.filter((s) => s.shot === shot); }

  /**
   * Put a pan's islands where `t` seconds into their show says they are.
   *
   * ON THE SCENE'S CLOCK, NOT THEIR OWN. The ending hands in its own time
   * every frame, so a scrub, a stall or a skip lands on the frame it should;
   * they used to run free off `update(dt)` from whenever the frustum first
   * caught them, which is two clocks that could only drift apart. Negative
   * `t` is not yet. One island after another, `FAR.gap` apart.
   *
   * @param shot 'A' or 'B' — see `FAR_PLACES`
   * @param t    seconds since the first of them started
   * @param dur  seconds one island's show lasts
   */
  show(shot, t, dur = FAR.show) {
    this.of(shot).forEach((s, i) => {
      const u = t - i * FAR.gap;
      if (u < 0 && !s.driven) return;
      s.driven = true;
      s.started = true;
      s.dur = dur;
      s.t = Math.max(0, Math.max(s.t, u));
    });
    if (this.anyShown) this.group.visible = true;
    this._step(0);
  }

  /** When the last of a pan's islands is finished, `t` seconds after its
   *  first began — what the ending solves its start against. */
  static span(n, dur = FAR.show) { return dur + Math.max(0, n - 1) * FAR.gap; }

  /**
   * Every island not yet started is simply there, water and all — no show for
   * a thing nobody is looking at. One already on its way finishes its own.
   */
  revealAll() {
    for (const s of this.isles) {
      // One the ending was driving is let go of, and finishes its own show.
      s.driven = false;
      if (s.started) continue;
      s.started = true;
      s.t = s.dur;
    }
    this.group.visible = true;
    this._step(0);
  }

  /** None of them: a restart. */
  hideAll() {
    for (const s of this.isles) { s.started = false; s.t = 0; s.driven = false; s.dur = FAR.show; }
    this.group.visible = false;
    this._step(0);
  }

  update(dt) {
    this.time += dt;
    if (!this.group.visible) return;
    this.W.uTime.value = this.time % 1000;
    this._step(dt);
  }

  _step(dt) {
    for (const s of this.isles) {
      if (!s.started) { s.reveal = 0; s.fall = 0; continue; }
      /* One the ending is driving is moved by the ending; one it let go of
         (the ending over, or skipped) finishes on its own time. */
      if (!s.driven) s.t = Math.min(s.dur, s.t + dt);
      s.reveal = Math.min(1, s.t / s.dur);
      s.fall = s.reveal >= 1 ? 1 : win(s.reveal, FAR.pour);
    }
    this._apply();
  }

  _apply() {
    for (const s of this.isles) {
      const r = s.reveal;
      const plane = s.y - FAR.waist;
      /* SHOT UP THROUGH THE CLOUD, not floated: the whole rise in a fifth of
         the show, overshooting and settling. Everything below the cloud's
         plane is not drawn until the plane drops away under cover of it. */
      const u = (r - FAR.shoot[0]) / (FAR.shoot[1] - FAR.shoot[0]);
      const rise = !s.started ? 1e5 : r >= 1 ? 0 : FAR.rise * (1 - back(u));
      const drop = win(r, FAR.unclip);
      const clip = r >= 1 ? -1e9 : plane - drop * (s.r * 2.4 + 12);
      // Solid the moment it breaks the surface - the cloud is the fade.
      const fade = s.started && u > 0 ? 1 : 0;
      this.U.uIsle.value[s.slot].set(rise, clip, r >= 1 ? 1.01 : fade, 0);
      this.W.uGrow.value[s.slot] = s.fall;
      /* The cloud gathers, swelling as it comes, holds while the island goes
         through it, and is GONE — not a skirt left round the waist: "then
         the clouds would fade out". */
      const gather = win(r, FAR.gather);
      const pf = s.started && r < 1 ? gather * (1 - win(r, FAR.clear)) : 0;
      this.portalMat.slot(s.slot, s.x, plane, s.z, pf, 0.6 + 0.4 * gather);
    }
  }
}
