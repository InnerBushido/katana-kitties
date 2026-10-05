import * as THREE from 'three';
import { paint } from '../core/gfx.js';
import { mergeParts } from './build.js';
import { SnakeRoad, resample } from './snakeway.js';

/* ---------------------------------------------------------------------------
   THE DREAM DOJO'S OTHER LAYER OF EXISTENCE.

   Lionheart's arcade sends a kitten INTO the simulator, and the brief for what
   that means was exact:

     "VR is a separate reality ... Ideally, it would be the same location, but
      on a different layer of existence."

   So the simulator is authored in THE REAL WORLD'S OWN COORDINATES — the holo-
   Dojo sits where the Dojo of the Turning Circle sits, the port pads stand
   where the tubes stand — and then the whole layer is lifted SIM.dx units
   east, past the far plane and the fog, where nothing in the archipelago can
   see it and it can see nothing of the archipelago. A kitten crossing over is
   moved by exactly that vector and her camera by the same one, so the frame
   she sees does not pan by a pixel: the world just changes under it.

   WHY AN OFFSET AND NOT A SECOND SCENE. Tried on paper first: a second
   THREE.Scene means her sprite, her worn orbs, her ward, her slash, her
   Cross Slash seal and every poller that spawns into `game.scene` would have
   to learn which scene she is in, and each one that forgot would draw her
   effects floating in the real town at her sim coordinates. With an offset,
   everything that already follows `p.position` follows her across for free,
   and every distance test in the game — pickups, dragons, Payne, the clan
   rings, the stall — is false by twelve thousand units without being told.
   What CANNOT follow is per-scene state: the sky sphere, the fog and the
   petals. Those are swapped per pane in `Game._renderView` and nowhere else.

   THE PHYSICS IS ITS OWN. A kitten in here is handed this object as her
   `world`; it answers the same five questions `World` does (`heightAt`,
   `resolveSolids`, `props`, `clanHallNear`, `respawn`), so `Player` has no
   idea which reality it is walking on. Nothing in here ever asks the real
   World anything, and the real World has no idea this exists — which is what
   "colliders are separate" means.
--------------------------------------------------------------------------- */

/** Where the layer lives, relative to the real world. 12000 east is three
 *  far planes clear of the furthest island, so no lens in either reality can
 *  reach the other even through a gap in the fog. */
export const SIM = { dx: 12000, dz: 0 };

/** Real-world point -> the same point in the sim layer, and back. */
export const toSim = (x, z) => ({ x: x + SIM.dx, z: z + SIM.dz });
export const toReal = (x, z) => ({ x: x - SIM.dx, z: z - SIM.dz });
/** Is a world-space point in the sim layer? Half the offset is the border. */
export const inSim = (pos) => !!pos && pos.x > SIM.dx * 0.5;

/** Below this a kitten has fallen out of the simulation. Much higher than the
 *  real world's -160: there is nothing down there to fall past, and a four-
 *  second plunge through empty void reads as the game having lost her. */
export const SIM_FALL_Y = 4;

/** The palette. Cyan is the system, magenta is the edge of things, and the
 *  green underneath is the lifestream the floating islands hang over. */
export const HOLO = {
  cyan: 0x5ff6ff,
  deep: 0x0a2a3c,
  magenta: 0xff4fd8,
  green: 0x3dffb0,
  gold: 0xffd56a,
  void: 0x040a18,
};

/* ------------------------------- shaders --------------------------------- */

const VOID_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
/* The void: deep navy over a green lifestream glow that drifts in bands
   underneath, the "floating islands in somebody's subconscious" look the
   arcade was asked to have. All of it is a function of direction, so the
   sphere can ride on the camera and never show a seam or a parallax. */
const VOID_FRAG = /* glsl */`
  uniform float uTime;
  varying vec3 vDir;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  void main() {
    vec3 d = normalize(vDir);
    float y = d.y;
    vec3 top = vec3(0.012, 0.025, 0.07);
    vec3 mid = vec3(0.02, 0.10, 0.16);
    vec3 low = vec3(0.03, 0.30, 0.24);
    vec3 col = mix(mid, top, smoothstep(0.0, 0.7, y));
    col = mix(col, low, smoothstep(0.05, -0.55, y));
    // lifestream bands under the horizon
    float a = atan(d.z, d.x);
    float band = noise(vec2(a * 3.0 + uTime * 0.05, y * 9.0 - uTime * 0.12));
    band = pow(band, 3.0) * smoothstep(0.1, -0.6, y);
    col += vec3(0.15, 0.95, 0.65) * band * 0.55;
    // a cold glow on the horizon all round
    col += vec3(0.25, 0.85, 1.0) * exp(-abs(y) * 14.0) * 0.18;
    // stars, sparse, above
    vec2 sp = vec2(a * 60.0, y * 60.0);
    float st = step(0.985, hash(floor(sp))) * smoothstep(0.05, 0.4, y);
    col += vec3(0.7, 0.95, 1.0) * st * (0.5 + 0.5 * sin(uTime * 2.0 + hash(floor(sp)) * 40.0));
    gl_FragColor = vec4(col, 1.0);
  }
`;

const DECK_VERT = /* glsl */`
  varying vec2 vXZ;
  varying float vR;
  uniform float uRadius;
  #include <fog_pars_vertex>
  void main() {
    vXZ = position.xz;
    vR = length(position.xz) / uRadius;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
/* A floor of light: a dark glassy disc with a square grid, a bright rim and a
   slow scan ring travelling outward. The grid is in WORLD units (1 line per 2)
   so every deck in the layer agrees with every other about how big a step is. */
/* THE RIM OPENS WHERE A BRIDGE COMES IN. `uGaps` are (angle, half-width) in
   radians round the disc's own centre, measured as atan(z, x) — written by
   `SimWorld._openRim` once a bridge's mouth is known. Without them the
   magenta "this is where the floor stops" line was drawn straight across the
   bridge's mouth, which is what made every bridge read as a strip laid ON TOP
   of an island rather than a road running INTO one. */
const MAX_GAPS = 12;
const DECK_FRAG = /* glsl */`
  #define MAX_GAPS ${MAX_GAPS}
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uRim;
  uniform float uGrid;
  uniform vec2 uGaps[MAX_GAPS];
  uniform int uGapN;
  varying vec2 vXZ;
  varying float vR;
  #include <fog_pars_fragment>
  void main() {
    vec2 g = abs(fract(vXZ / uGrid - 0.5) - 0.5) / fwidth(vXZ / uGrid);
    float line = 1.0 - min(min(g.x, g.y), 1.0);
    float rim = smoothstep(0.93, 0.995, vR) * (1.0 - smoothstep(0.995, 1.0, vR));
    float ang = atan(vXZ.y, vXZ.x);
    for (int i = 0; i < MAX_GAPS; i++) {
      if (i >= uGapN) break;
      float d = abs(mod(ang - uGaps[i].x + 3.14159265, 6.2831853) - 3.14159265);
      rim *= smoothstep(uGaps[i].y, uGaps[i].y + 0.02, d);
    }
    float scan = exp(-pow((vR - fract(uTime * 0.18)) * 18.0, 2.0));
    vec3 base = vec3(0.02, 0.06, 0.10);
    vec3 col = base + uColor * line * 0.55 + uRim * rim * 1.6 + uColor * scan * 0.35;
    float alpha = 0.82 + line * 0.18;
    gl_FragColor = vec4(col, alpha);
    #include <fog_fragment>
  }
`;

const RIBBON_VERT = /* glsl */`
  attribute float aS;
  attribute float aU;
  attribute float aW;
  varying float vS;
  varying float vLat;
  varying float vW;
  #include <fog_pars_vertex>
  void main() {
    vS = aS; vLat = aU * aW; vW = aW;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
/* The data bridge: Snake Way remembered as light.

   THE CHEVRONS POINT THE WAY THEY MOVE, AND BOTH ARE HERS. Richard: "The
   shader on the bridges should change direction and move in the direction
   the arrows are pointing and take on the color of the player when they
   approach it. The arrows should point and move in the direction of the
   player and their direction of movement if they were to cross it." The
   first version drew each chevron's TIP trailing and streamed it the other
   way — `vS * 0.22 - |u| * 0.35` puts the edges ahead of the centre — so the
   arrows pointed home while they ran out. Now `uDir` (+1 from `from` to
   `to`, -1 back) turns pattern and motion together, the tip leads, and the
   sharp edge of each band is its FRONT. `uDir` and `uColor` are written per
   frame by `SimWorld.steerBridges` from the kitten nearest the bridge.

   Measured across in WORLD units (`vLat`, against `uHalf`), not as a
   fraction of the width, because the mouths flare (`ribbonGeometry`): a lane
   line at 45% of the width would bow out round every fillet. */
const RIBBON_FRAG = /* glsl */`
  uniform float uTime;
  uniform float uDir;
  uniform float uHalf;
  uniform vec3 uColor;
  uniform vec3 uEdge;
  varying float vS;
  varying float vLat;
  varying float vW;
  #include <fog_pars_fragment>
  void main() {
    float lat = abs(vLat);
    float edge = smoothstep(vW - 0.45, vW - 0.07, lat);
    float across = min(lat / uHalf, 1.0);
    float chev = fract(uTime * 0.9 - vS * uDir * 0.22 - across * 0.35);
    chev = smoothstep(0.0, 0.05, chev) * (1.0 - smoothstep(0.14, 0.30, chev)) * (1.0 - step(uHalf, lat));
    float lane = 1.0 - smoothstep(0.0, 0.06, abs(lat - uHalf * 0.45));
    vec3 col = vec3(0.02, 0.07, 0.11) + uColor * (chev * 0.55 + lane * 0.25) + uEdge * edge * 1.4;
    gl_FragColor = vec4(col, 0.9);
    #include <fog_fragment>
  }
`;

const MOTE_VERT = /* glsl */`
  uniform float uTime;
  uniform float uSize;
  attribute float aSeed;
  varying float vA;
  void main() {
    vec3 p = position;
    // rise and wrap through a 260-unit column, with a little sideways drift
    p.y = mod(p.y + uTime * (1.5 + aSeed * 2.5), 260.0) - 60.0;
    p.x += sin(uTime * 0.3 + aSeed * 30.0) * 3.0;
    p.z += cos(uTime * 0.27 + aSeed * 17.0) * 3.0;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize * (0.6 + aSeed) * (300.0 / max(1.0, -mv.z));
    vA = smoothstep(-60.0, -20.0, p.y) * (1.0 - smoothstep(150.0, 200.0, p.y));
    gl_Position = projectionMatrix * mv;
  }
`;
const MOTE_FRAG = /* glsl */`
  uniform vec3 uColor;
  varying float vA;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = smoothstep(0.5, 0.0, d) * vA;
    gl_FragColor = vec4(uColor * (1.2 - d), a);
  }
`;

const FLOOR_FRAG = /* glsl */`
  uniform float uTime;
  varying vec2 vXZ;
  varying float vR;
  void main() {
    vec2 uv = vXZ / 24.0;
    vec2 g = abs(fract(uv - 0.5) - 0.5) / fwidth(uv);
    float line = 1.0 - min(min(g.x, g.y), 1.0);
    float fade = 1.0 - smoothstep(0.15, 1.0, vR);
    float pulse = 0.6 + 0.4 * sin(uTime * 0.7 - vR * 20.0);
    vec3 col = vec3(0.15, 1.0, 0.75) * line * fade * pulse;
    gl_FragColor = vec4(col, line * fade * 0.55);
  }
`;

/* ---------------------------- small builders ----------------------------- */

/** How thick a deck's disc is. The islands are DISCS NOW, not rocks — see
 *  `addDisc` — and this is the whole of their body. */
export const DISC_T = 0.7;

/**
 * A shard of floor drifting in the void: a thin six-sided slab, tilted. The
 * debris used to be little ragged rocks — `rockUnder`'s cone, the same one
 * every island hung off — and once the islands lost theirs (Richard: "the
 * bottoms are broken looking ... maybe we can just remove the bottom portion
 * and have it that players are floating on the discs part"), a sky full of
 * rocks round a world of discs was two worlds. Seeded, so the same void is the
 * same void on every load.
 */
function shard(r, rnd) {
  const g = new THREE.CylinderGeometry(r, r * 0.92, 0.45, 6);
  g.rotateX((rnd() - 0.5) * 0.7);
  g.rotateZ((rnd() - 0.5) * 0.7);
  g.rotateY(rnd() * Math.PI);
  paint(g, rnd() < 0.3 ? 0x153a52 : 0x0c2234);
  return g;
}

/**
 * A deck you can stand on: a disc. Queried in the layer's own (real-world)
 * coordinates; `SimWorld.heightAt` does the shifting.
 */
class DiscDeck {
  constructor({ x, z, r, y, name = '', step = 0.4 }) {
    Object.assign(this, { x, z, r, y, name, step, kind: 'sim', biome: 'sim' });
  }
  yAt(x, z) {
    const dx = x - this.x;
    const dz = z - this.z;
    return dx * dx + dz * dz <= this.r * this.r ? this.y : null;
  }
}

/**
 * A ribbon deck along a polyline — a data bridge. `pts` are {x, z, y}; the
 * height under a point is interpolated along the nearest segment, so a bridge
 * may climb without a single riser to trip over (the lesson of the real
 * bridge's arch, which was ten flat planks and stopped kittens dead).
 */
class RibbonDeck {
  constructor(pts, halfW, name = '') {
    this.pts = pts;
    this.halfW = halfW;
    this.name = name;
    this.step = 0.5;
    this.kind = 'sim';
    this.biome = 'sim';
    const xs = pts.map((p) => p.x);
    const zs = pts.map((p) => p.z);
    this.box = [Math.min(...xs) - halfW, Math.max(...xs) + halfW, Math.min(...zs) - halfW, Math.max(...zs) + halfW];
  }
  yAt(x, z) {
    const b = this.box;
    if (x < b[0] || x > b[1] || z < b[2] || z > b[3]) return null;
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < this.pts.length - 1; i++) {
      const a = this.pts[i];
      const c = this.pts[i + 1];
      const ex = c.x - a.x;
      const ez = c.z - a.z;
      const L2 = ex * ex + ez * ez || 1;
      const t = THREE.MathUtils.clamp(((x - a.x) * ex + (z - a.z) * ez) / L2, 0, 1);
      const px = a.x + ex * t;
      const pz = a.z + ez * t;
      const d = Math.hypot(x - px, z - pz);
      if (d <= this.halfW && d < bestD) {
        bestD = d;
        best = a.y + (c.y - a.y) * t;
      }
    }
    return best;
  }
}

/** A wobbling path from `a` to `b`, Snake-Way style: a sine laid sideways
 *  across the straight line, zero at both ends so it meets its decks square. */
export function snakePath(a, b, { wobble = 4, waves = 1.5, n = 40 } = {}) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const L = Math.hypot(dx, dz) || 1;
  const nx = -dz / L;
  const nz = dx / L;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const w = Math.sin(t * Math.PI * waves * 2) * wobble * Math.sin(t * Math.PI);
    pts.push({
      x: a.x + dx * t + nx * w,
      z: a.z + dz * t + nz * w,
      y: a.y + (b.y - a.y) * (t * t * (3 - 2 * t)),
    });
  }
  return pts;
}

/** The radius of the fillet where a bridge's edge turns into an island's rim. */
export const MOUTH_R = 2.8;
/** Spacing of the drawn ribbon's rows: fine enough that a 2.8 fillet is a
 *  curve and not three facets. The WALKED deck keeps its own 40 samples. */
const RIBBON_STEP = 0.4;

const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * The ribbon's mesh, with arc length `aS`, side `aU` (+1/-1) and half-width
 * `aW` — and where it opens into each island it joins (`mouths`).
 *
 * IT STARTS AND STOPS AT THE RIMS, AND FLARES INTO THEM. Richard: "The
 * bridges should connect more seamlessly to the floating disc islands, right
 * now it is overlapping and doesn't look too good, maybe we can merge the
 * vertices to look more smooth on the edges, as if the discs are connected
 * with the bridges." The walked deck still runs 2-3 units into each island
 * (so there is never a seam to fall through — `world-check` walks it), but
 * what is DRAWN is clipped at the circle: the strip of ribbon laid over the
 * deck's grid was the overlap. The last `MOUTH_R` of each end widens on a
 * quarter circle, the row on the rim is pulled onto the circle exactly — those
 * are the merged vertices — and any edge vertex of the flare that would cut
 * the corner into the deck is pushed back out to the rim. The deck's own rim
 * line is opened over the same angles (`uGaps`), so the bridge's magenta edge
 * runs round the fillet and straight on into the island's.
 *
 * @param ends {a, b}: the DiscDeck each end lands on, or null for a free end.
 */
function ribbonGeometry(pts, halfW, ends = {}) {
  // Densify, keeping heights.
  const D = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / RIBBON_STEP));
    for (let k = 0; k < n; k++) {
      const f = k / n;
      D.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f });
    }
  }
  D.push({ ...pts[pts.length - 1] });
  const inside = (q, d) => !!d && Math.hypot(q.x - d.x, q.z - d.z) < d.r;
  /* Where the centre line crosses a rim, by bisection between a sample in
     and the next one out. */
  const cross = (pin, pout, d) => {
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 24; k++) {
      const m = (lo + hi) / 2;
      const q = { x: pin.x + (pout.x - pin.x) * m, z: pin.z + (pout.z - pin.z) * m };
      if (inside(q, d)) lo = m; else hi = m;
    }
    const m = (lo + hi) / 2;
    return { x: pin.x + (pout.x - pin.x) * m, y: pin.y + (pout.y - pin.y) * m, z: pin.z + (pout.z - pin.z) * m };
  };
  let i0 = 0;
  let i1 = D.length - 1;
  while (i0 < D.length - 1 && inside(D[i0], ends.a)) i0++;
  while (i1 > i0 && inside(D[i1], ends.b)) i1--;
  const V = D.slice(i0, i1 + 1);
  if (i0 > 0) V.unshift(cross(D[i0 - 1], D[i0], ends.a));
  if (i1 < D.length - 1) V.push(cross(D[i1 + 1], D[i1], ends.b));
  const clipA = i0 > 0 ? ends.a : null;
  const clipB = i1 < D.length - 1 ? ends.b : null;

  const cum = [0];
  for (let i = 1; i < V.length; i++) cum.push(cum[i - 1] + Math.hypot(V[i].x - V[i - 1].x, V[i].z - V[i - 1].z));
  const total = cum[cum.length - 1];
  const fil = (t) => (t >= MOUTH_R ? 0 : MOUTH_R - Math.sqrt(Math.max(0, MOUTH_R * MOUTH_R - (MOUTH_R - t) ** 2)));
  // Out to the rim if a vertex would cut into the deck; ONTO it if `snap`.
  const toRim = (x, z, d, snap) => {
    const dx = x - d.x;
    const dz = z - d.z;
    const l = Math.hypot(dx, dz) || 1;
    if (!snap && l >= d.r) return [x, z];
    return [d.x + (dx / l) * d.r, d.z + (dz / l) * d.r];
  };

  const pos = [];
  const aS = [];
  const aU = [];
  const aW = [];
  const idx = [];
  const rimRows = { a: null, b: null };
  for (let i = 0; i < V.length; i++) {
    const p = V[i];
    const q = V[Math.min(V.length - 1, i + 1)];
    const o = V[Math.max(0, i - 1)];
    const tx = q.x - o.x;
    const tz = q.z - o.z;
    const tl = Math.hypot(tx, tz) || 1;
    const nx = -tz / tl;
    const nz = tx / tl;
    const tA = cum[i];
    const tB = total - cum[i];
    const w = halfW + (clipA ? fil(tA) : 0) + (clipB ? fil(tB) : 0);
    let L = [p.x + nx * w, p.z + nz * w];
    let R = [p.x - nx * w, p.z - nz * w];
    for (const [d, t, key, first] of [[clipA, tA, 'a', i === 0], [clipB, tB, 'b', i === V.length - 1]]) {
      if (!d || t > MOUTH_R + RIBBON_STEP) continue;
      L = toRim(L[0], L[1], d, first);
      R = toRim(R[0], R[1], d, first);
      if (first) rimRows[key] = { d, L, R };
    }
    pos.push(L[0], p.y + 0.05, L[1], R[0], p.y + 0.05, R[1]);
    aS.push(cum[i], cum[i]);
    aU.push(1, -1);
    aW.push(w, w);
    if (i > 0) {
      const k = i * 2;
      idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 1));
  g.setAttribute('aU', new THREE.Float32BufferAttribute(aU, 1));
  g.setAttribute('aW', new THREE.Float32BufferAttribute(aW, 1));
  g.setIndex(idx);
  // The angle each mouth spans round its island, atan(z, x) from the centre.
  const mouths = [];
  for (const row of [rimRows.a, rimRows.b]) {
    if (!row) continue;
    const { d, L, R } = row;
    const aL = Math.atan2(L[1] - d.z, L[0] - d.x);
    const aR = Math.atan2(R[1] - d.z, R[0] - d.x);
    const half = Math.abs(wrapA(aL - aR)) / 2;
    mouths.push({ deck: d, ang: wrapA(aR + wrapA(aL - aR) / 2), half, L, R });
  }
  return { geo: g, mouths, visible: V };
}

/**
 * An island's rim ring, flat in XZ, with an opening over each mouth
 * ({ang, half}: atan(z, x) round the centre, radians). Built as arcs rather
 * than masked, so the gap ends exactly where the bridge's edge meets it.
 */
function rimGeometry(r, mouths) {
  const TAU = Math.PI * 2;
  const inner = r - 0.25;
  const outer = r + 0.05;
  let arcs;
  if (!mouths.length) arcs = [[0, TAU]];
  else {
    const gaps = mouths.map((m) => {
      const s = (((m.ang - m.half) % TAU) + TAU) % TAU;
      return [s, s + 2 * m.half];
    }).sort((a, b) => a[0] - b[0]);
    const merged = [gaps[0].slice()];
    for (const g of gaps.slice(1)) {
      const last = merged[merged.length - 1];
      if (g[0] <= last[1]) last[1] = Math.max(last[1], g[1]);
      else merged.push(g.slice());
    }
    arcs = merged.map((g, i) => [g[1], i + 1 < merged.length ? merged[i + 1][0] : merged[0][0] + TAU])
      .filter(([s, e]) => e - s > 1e-3);
  }
  const pos = [];
  const idx = [];
  for (const [s, e] of arcs) {
    const n = Math.max(2, Math.ceil((e - s) / (TAU / 128)));
    const base = pos.length / 3;
    for (let k = 0; k <= n; k++) {
      const a = s + ((e - s) * k) / n;
      const c = Math.cos(a);
      const si = Math.sin(a);
      pos.push(c * inner, 0, si * inner, c * outer, 0, si * outer);
      if (k > 0) {
        const j = base + k * 2;
        idx.push(j - 2, j, j - 1, j - 1, j, j + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/* ------------------------------ the layer -------------------------------- */

export class SimWorld {
  /**
   * @param {THREE.Scene} scene  the game's one scene — see the header for why
   * @param {object} spec  { dojo: {x, y, z}, arcade: {x, z, y, r}, ports: [{x, z}] }
   */
  constructor(scene, spec) {
    this.scene = scene;
    this.spec = spec;
    /** Everything walkable, in the layer's own (real-world) coordinates. */
    this.decks = [];
    /** Circular colliders, same coordinates: {x, z, r, top?}. */
    this.solids = [];
    /** Things a katana can knock over in here. The modes fill it; the hub is
     *  bare on purpose — nothing in the simulator counts toward MISCHIEF,
     *  because nothing regrows and a training dummy must. */
    this.props = [];
    this.arenaRing = null;
    this.t = 0;
    /** Per-frame hooks the mode islands register, so the layer stays the one
     *  thing `DreamDojo.update` has to tick. */
    this.tickers = [];
    /** Every data bridge and highway: its deck, its road and its material,
     *  steered per frame by `steerBridges`. */
    this.bridges = [];

    this.root = new THREE.Group();
    this.root.name = 'sim-layer';
    this.root.position.set(SIM.dx, 0, SIM.dz);
    scene.add(this.root);

    this.fog = new THREE.Fog(0x071c28, 150, 1050);
    this._uniforms = [];
    this._buildVoid();
    this._buildHub();
  }

  /* -------------------------- the World interface ------------------------- */

  heightAt(x, z, fromY = Infinity) {
    const lx = x - SIM.dx;
    const lz = z - SIM.dz;
    let best = null;
    for (const d of this.decks) {
      const y = d.yAt(lx, lz);
      if (y == null) continue;
      if (fromY + (d.step ?? 0.4) < y) continue;
      if (!best || y > best.y) best = { y, island: d, platform: d, sim: true };
    }
    return best;
  }

  resolveSolids(x, z, radius, fromY = -Infinity) {
    let lx = x - SIM.dx;
    let lz = z - SIM.dz;
    for (const s of this.solids) {
      if (s.top != null && fromY >= s.top - 0.05) continue;
      const dx = lx - s.x;
      const dz = lz - s.z;
      const min = s.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 1e-4;
      lx = s.x + (dx / d) * min;
      lz = s.z + (dz / d) * min;
    }
    return { x: lx + SIM.dx, z: lz + SIM.dz };
  }

  clanHallNear() { return null; }

  get fallY() { return SIM_FALL_Y; }

  /**
   * Fell off the simulation. She is put back on her own port pad, which is
   * where a kitten who has lost her footing in here would expect to start —
   * and `onFall` lets the arcade dress it as a de-rez rather than a teleport.
   */
  respawn(p) {
    const port = this.spec.ports[p.index] ?? this.spec.ports[0];
    const s = toSim(port.x, port.z);
    p.position.set(s.x, this.spec.arcade.y + 0.5, s.z);
    p.velocity.set(0, 0, 0);
    this.onFall?.(p);
  }

  /* ------------------------------ the void -------------------------------- */

  _buildVoid() {
    const uTime = { value: 0 };
    this._uTime = uTime;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(2200, 32, 20),
      new THREE.ShaderMaterial({
        vertexShader: VOID_VERT, fragmentShader: VOID_FRAG,
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: { uTime },
      })
    );
    sky.frustumCulled = false;
    sky.renderOrder = -100;
    /* THE SKY RIDES THE CAMERA, not the layer origin: `faceCamera` moves it to
       each lens before that pane draws. A sky sphere left at the origin is a
       sky with an edge somewhere, and a kitten who runs far enough finds it. */
    this.sky = sky;
    this.root.add(sky);

    // The Tron floor, far below, fading out before its edge can be seen.
    const floorU = { uTime, uRadius: { value: 1400 } };
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1400, 64).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        vertexShader: DECK_VERT, fragmentShader: FLOOR_FRAG,
        transparent: true, depthWrite: false, fog: false,
        uniforms: floorU,
      })
    );
    floor.position.set(this.spec.dojo.x, -70, this.spec.dojo.z);
    this.root.add(floor);

    /* Motes: rising data, a thousand points, animated entirely on the GPU. A
       column around the hub; they wrap at the top, so there is never a moment
       where the air empties. */
    const N = 1400;
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    let s = 7;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const cx = (this.spec.dojo.x + this.spec.arcade.x) / 2;
    const cz = (this.spec.dojo.z + this.spec.arcade.z) / 2;
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 20 + Math.sqrt(rnd()) * 320;
      pos[i * 3] = cx + Math.cos(a) * r;
      pos[i * 3 + 1] = rnd() * 260;
      pos[i * 3 + 2] = cz + Math.sin(a) * r;
      seed[i] = rnd();
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    mg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const motes = new THREE.Points(mg, new THREE.ShaderMaterial({
      vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime, uSize: { value: 2.2 }, uColor: { value: new THREE.Color(0x6effd8) } },
    }));
    motes.frustumCulled = false;
    this.root.add(motes);

    /* The data moon — a wireframe icosahedron hanging in the void beyond the
       Dojo, turning slowly. Something enormous and far away is what tells the
       eye the void is a SPACE and not a backdrop. */
    const moon = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(170, 2)),
      new THREE.LineBasicMaterial({ color: HOLO.magenta, transparent: true, opacity: 0.35, fog: false })
    );
    moon.position.set(this.spec.dojo.x - 520, 260, this.spec.dojo.z - 700);
    this.moon = moon;
    this.root.add(moon);
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(120, 3),
      new THREE.MeshBasicMaterial({ color: 0x3a0f3a, transparent: true, opacity: 0.55, fog: false })
    );
    moon.add(core);

    /* Debris: a scatter of small floating shards round the hub at all heights,
       thin slabs of floor like the islands themselves (`shard`). One merged
       mesh; the bob is a whole-group sway, which is plenty at this distance. */
    const parts = [];
    for (let i = 0; i < 46; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 110 + rnd() * 260;
      const g = shard(1.5 + rnd() * 5, rnd);
      g.translate(cx + Math.cos(a) * r, 10 + rnd() * 70, cz + Math.sin(a) * r);
      parts.push(g);
    }
    this.debris = new THREE.Mesh(mergeParts(parts), new THREE.MeshBasicMaterial({ vertexColors: true }));
    this.root.add(this.debris);
  }

  /* ------------------------------- the hub -------------------------------- */

  /**
   * A walkable disc: its glowing floor, a thin slab under it, and its rim.
   *
   * NO ROCK UNDER IT ANY MORE. Every island hung off a ragged seeded cone
   * (`rockUnder`, now gone) as deep as 1.6 of its radius — 70 under the
   * hub. Richard: "The floating islands in the Dream Dojo simulation don't
   * look very good, the bottoms are broken looking ... Maybe we can just
   * remove the bottom portion and have it that players are floating on the
   * discs part." So an island is the disc: `DISC_T` of dark glass with a
   * second, dimmer rim round its lower edge, which is what makes it read as a
   * floating plate from below rather than as a floor with nothing under it.
   * The physics never knew about the rock — the deck is `DiscDeck`, a circle
   * at a height — so nothing a kitten can do changed.
   */
  addDisc({ x, z, r, y, name = '', grid = 2, colour = HOLO.cyan, rim = HOLO.magenta }) {
    const deck = new DiscDeck({ x, z, r, y, name });
    this.decks.push(deck);
    const u = {
      uTime: this._uTime,
      uRadius: { value: r },
      uColor: { value: new THREE.Color(colour) },
      uRim: { value: new THREE.Color(rim) },
      uGrid: { value: grid },
      uGaps: { value: Array.from({ length: MAX_GAPS }, () => new THREE.Vector2()) },
      uGapN: { value: 0 },
    };
    const top = new THREE.Mesh(
      new THREE.CircleGeometry(r, 72).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        vertexShader: DECK_VERT, fragmentShader: DECK_FRAG,
        transparent: true, fog: true, depthWrite: true,
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
      })
    );
    Object.assign(top.material.uniforms, u);
    top.position.set(x, y + 0.02, z);
    top.renderOrder = -2;
    this.root.add(top);
    // The slab: an open band round the edge and a face underneath.
    const side = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, DISC_T, 96, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x0b2638, fog: true, side: THREE.DoubleSide })
    );
    side.position.set(x, y - DISC_T / 2, z);
    const under = new THREE.Mesh(
      new THREE.CircleGeometry(r, 72).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x06121e, fog: true })
    );
    under.position.set(x, y - DISC_T, z);
    const low = new THREE.Mesh(
      new THREE.RingGeometry(r - 0.6, r, 96).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    low.position.set(x, y - DISC_T - 0.02, z);
    this.root.add(side, under, low);
    // An edge ring that floats a hair above the deck, the bright line a kid
    // reads as "this is where the floor stops". Rebuilt with an opening for
    // each bridge that arrives (`_openRim`).
    const ring = new THREE.Mesh(
      rimGeometry(r, []),
      new THREE.MeshBasicMaterial({ color: rim, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    ring.position.set(x, y + 0.06, z);
    this.root.add(ring);
    deck._top = top;
    deck._ring = ring;
    deck.mouths = [];
    return deck;
  }

  /**
   * Open an island's rim where a bridge's mouth meets it — the deck's glow
   * (`uGaps`) and the ring both. Called by `addBridge` with the angles
   * `ribbonGeometry` measured off the vertices it put on the circle.
   */
  _openRim(deck, ang, half) {
    if (!deck?._ring) return;
    deck.mouths.push({ ang, half });
    const u = deck._top.material.uniforms;
    const n = Math.min(MAX_GAPS, deck.mouths.length);
    for (let i = 0; i < n; i++) u.uGaps.value[i].set(deck.mouths[i].ang, deck.mouths[i].half);
    u.uGapN.value = n;
    deck._ring.geometry.dispose();
    deck._ring.geometry = rimGeometry(deck.r, deck.mouths);
  }

  /** The disc a bridge end at `p` lands on: the one it is just inside, at its height. */
  _discAt(p) {
    let best = null;
    for (const d of this.decks) {
      if (!(d instanceof DiscDeck) || d.temp || Math.abs(d.y - p.y) > 0.6) continue;
      const k = Math.hypot(p.x - d.x, p.z - d.z);
      if (k < d.r && (!best || k - d.r > best.k)) best = { d, k: k - d.r };
    }
    return best?.d ?? null;
  }

  /**
   * A floor a drill puts up and takes down again — a ledge, a floating step.
   * A disc deck like any other while it stands, so `heightAt` needs no idea
   * that it is temporary; `removeTempDisc` takes the deck AND its drawing
   * away together, so a kitten can never stand on something she cannot see.
   */
  addTempDisc({ x, z, r, y, colour = HOLO.cyan, name = 'step' }) {
    const deck = new DiscDeck({ x, z, r, y, name });
    deck.temp = true;
    this.decks.push(deck);
    const grp = new THREE.Group();
    const slab = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r * 0.9, 0.5, 32),
      new THREE.MeshBasicMaterial({ color: 0x0a2230, transparent: true, opacity: 0.8 })
    );
    slab.position.set(x, y - 0.25, z);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(r - 0.08, 0.08, 6, 48),
      new THREE.MeshBasicMaterial({ color: colour, toneMapped: false })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(x, y + 0.03, z);
    // A thin stalk of light down to nothing, so it reads as hanging there.
    const stalk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 6, 6),
      new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.35, toneMapped: false })
    );
    stalk.position.set(x, y - 3.5, z);
    grp.add(slab, rim, stalk);
    this.root.add(grp);
    deck._grp = grp;
    return deck;
  }

  removeTempDisc(deck) {
    const i = this.decks.indexOf(deck);
    if (i >= 0) this.decks.splice(i, 1);
    deck._grp?.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
    deck._grp?.removeFromParent();
  }

  /**
   * An island's name hanging over it: kanji and English, turned to the lens.
   * Every island has one, because in a void every island looks like every
   * other until something says which this is.
   */
  addSign(x, y, z, kanji, name, colour = HOLO.cyan, { scale = 1, sub = '' } = {}) {
    const cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = sub ? 400 : 320;
    const g = cv.getContext('2d');
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '700 150px "Noto Serif JP", serif';
    g.shadowColor = '#ff4fd8';
    g.shadowBlur = 26;
    g.fillStyle = '#ff7fe4';
    g.fillText(kanji, 512, 120);
    g.font = '900 72px Nunito, sans-serif';
    g.shadowColor = `#${new THREE.Color(colour).getHexString()}`;
    g.fillStyle = '#d6feff';
    g.fillText(name, 512, 258);
    if (sub) {
      g.font = '800 46px Nunito, sans-serif';
      g.fillStyle = '#9fefff';
      g.fillText(sub, 512, 350);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const w = 13 * scale;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * cv.height / 1024), new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    }));
    m.position.set(x, y, z);
    m.renderOrder = 8;
    m.userData.sign = { kanji, name, sub };
    this.root.add(m);
    (this.signs ??= []).push(m);
    return m;
  }

  /**
   * A data bridge between two points ({x, z, y}), wobbling like Snake Way —
   * and RIDDEN like it.
   *
   * Richard: "The bridges in the Dream Dojo should work and operate like the
   * snake way bridges in the real world, with the cool camera movements when
   * crossing and inputs being overridden in the same way." So the deck
   * carries a real `SnakeRoad` (`deck.snake`), built from the same path in
   * WORLD coordinates (the layer's own plus `SIM`). `Player._stepSnake`
   * already asks `heightAt(...).platform.snake` and nothing else, so a
   * kitten stepping on is boarded, her stick is locked to the way she set
   * off (`_snakeWish`), the rails hold her on while she is standing, the ride
   * camera (`SnakeCam`) orbits her, and a group splits into lanes after
   * `SNAKE.splitT` — all of it the Snake Way's own code, not a copy. It is
   * marked `sim` so the Snake Way's SONG stays the real roads' (`Game.
   * _wantedTrack`): nothing in the sim picks music, so a song started on a
   * bridge would have played on for the rest of the visit.
   *
   * `islands` is empty: the ride camera's "never inside an island" lift was
   * for the real islands' rock keels, and the discs in here have none.
   */
  addBridge(a, b, { halfW = 2.2, wobble = 3.5, waves = 1, name = '' } = {}) {
    const pts = snakePath(a, b, { wobble, waves });
    const deck = new RibbonDeck(pts, halfW, name);
    this.decks.push(deck);
    const world = resample(pts.map((p) => ({ x: p.x + SIM.dx, y: p.y, z: p.z + SIM.dz })));
    const road = new SnakeRoad(`sim:${name || this.bridges.length}`, world, a, b, [],
      { halfW, lock: Math.max(0.8, halfW - 0.7) });
    road.sim = true;
    deck.snake = road;
    const mat = new THREE.ShaderMaterial({
      vertexShader: RIBBON_VERT, fragmentShader: RIBBON_FRAG,
      transparent: true, fog: true, side: THREE.DoubleSide,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
    });
    Object.assign(mat.uniforms, {
      uTime: this._uTime,
      uDir: { value: 1 },
      uHalf: { value: halfW },
      uColor: { value: new THREE.Color(HOLO.cyan) },
      uEdge: { value: new THREE.Color(HOLO.magenta) },
    });
    const ends = { a: this._discAt(a), b: this._discAt(b) };
    const { geo, mouths, visible } = ribbonGeometry(pts, halfW, ends);
    for (const mo of mouths) this._openRim(mo.deck, mo.ang, mo.half);
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = -1;
    this.root.add(m);
    // A thin keel of light underneath, so the bridge has a body from below —
    // rim to rim, like the drawn deck.
    const keel = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(visible.map((p) => new THREE.Vector3(p.x, p.y - 0.6, p.z))),
      new THREE.LineBasicMaterial({ color: HOLO.cyan, transparent: true, opacity: 0.6 })
    );
    this.root.add(keel);
    this.bridges.push({ deck, road, mat, mesh: m, mouths, dir: 1, tint: 0, colour: new THREE.Color(HOLO.cyan) });
    return deck;
  }

  /**
   * Point every bridge's chevrons, and colour it, for the kitten it belongs
   * to this frame — see RIBBON_FRAG for the request.
   *
   * WHOSE BRIDGE: whoever is ON it (her ride's own `dir` is the way she is
   * going), else whoever is nearest within `APPROACH` of it. Approaching, the
   * arrows run away from her — from her end to the other — because that is
   * the way she would go if she crossed it. Nobody near: they run outward
   * from the hub, the way they always did, in the system's cyan.
   * The colour eases in over distance (on it: all hers), so walking up to a
   * bridge is the bridge noticing her.
   */
  steerBridges(dt, kittens) {
    const APPROACH = 14;
    for (const B of this.bridges) {
      const R = B.road;
      let who = null;
      let best = Infinity;
      let dir = 1;
      const A = R.pts[0];
      const Z = R.pts[R.pts.length - 1];
      for (const p of kittens) {
        if (p.snakeRide?.road === R) {
          who = p; best = 0; dir = p.snakeRide.dir;
          break;
        }
        /* Off the ends (on an island, walking up), distance to the nearer
           end — `locate` refuses anything past an end, by design. Alongside
           (in the air beside it, or just stepped off), distance to its edge. */
        const { x, y, z } = p.position;
        const da = Math.abs(y - A.y) < 6 ? Math.hypot(x - A.x, z - A.z) : Infinity;
        const dz = Math.abs(y - Z.y) < 6 ? Math.hypot(x - Z.x, z - Z.z) : Infinity;
        let k = Math.min(da, dz);
        let d = da <= dz ? 1 : -1;
        const hit = R.locate(x, z, Infinity, R.halfW + APPROACH);
        if (hit && Math.abs(y - hit.y) < 6) {
          const side = Math.max(0, Math.abs(hit.lat) - R.halfW);
          if (side < k) { k = side; d = hit.s < R.length / 2 ? 1 : -1; }
        }
        if (k < best) { best = k; who = p; dir = d; }
      }
      const want = who ? THREE.MathUtils.clamp(1 - (best - 2) / (APPROACH - 2), 0, 1) : 0;
      B.tint += (want - B.tint) * Math.min(1, dt * 6);
      if (who) B.dir = dir;
      else if (B.tint < 0.02) B.dir = 1;
      B.colour.set(who?.style?.colour ?? HOLO.cyan);
      B.mat.uniforms.uDir.value = B.dir;
      B.mat.uniforms.uColor.value.set(HOLO.cyan).lerp(B.colour, B.tint);
    }
  }

  _buildHub() {
    const { dojo, arcade, ports } = this.spec;
    /* THE PORT: Lionheart's island, mirrored where it stands. A kitten arrives
       on the pad at the spot her tube stands on in the real world. */
    this.portDeck = this.addDisc({ x: arcade.x, z: arcade.z, r: arcade.r, y: arcade.y, name: 'port', grid: 2 });
    this.portRings = ports.map((pt, i) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.1, 1.6, 48).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: HOLO.cyan, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      ring.position.set(pt.x, arcade.y + 0.08, pt.z);
      ring.userData.i = i;
      this.root.add(ring);
      return ring;
    });

    /* THE HOLO-DOJO: the Dojo of the Turning Circle's own floor, at its own
       height, in light. The live diagram on it is the REAL `MathDojo` — built
       by the arcade on first use and handed the kittens in here — because the
       first non-negotiable says the circle may not be decoration, and a copy
       that only looked like the maths would be exactly that. */
    this.dojoDeck = this.addDisc({ x: dojo.x, z: dojo.z, r: 50, y: dojo.y, name: 'dojo', grid: 6 });

    /* The bridge from the port to the Dojo, over the same gap the stepping
       stones cross in the real world — the one place the two layers are
       deliberately different, because in here there is nothing to jump for. */
    const ux = (arcade.x - dojo.x);
    const uz = (arcade.z - dojo.z);
    const L = Math.hypot(ux, uz);
    const u = { x: ux / L, z: uz / L };
    const from = { x: dojo.x + u.x * 47, z: dojo.z + u.z * 47, y: dojo.y };
    const to = { x: arcade.x - u.x * (arcade.r - 2), z: arcade.z - u.z * (arcade.r - 2), y: arcade.y };
    this.addBridge(from, to, { wobble: 2.5, waves: 1, name: 'port bridge' });
  }

  /* ------------------------------ per frame ------------------------------- */

  update(dt) {
    this.t += dt;
    this._uTime.value = this.t;
    if (this.moon) {
      this.moon.rotation.y += dt * 0.03;
      this.moon.rotation.x = Math.sin(this.t * 0.05) * 0.2;
    }
    if (this.debris) this.debris.position.y = Math.sin(this.t * 0.4) * 1.2;
    for (const r of this.portRings ?? []) {
      r.material.opacity = 0.55 + 0.35 * Math.sin(this.t * 2.4 + r.userData.i);
    }
    for (const f of this.tickers) f(dt, this.t);
  }

  /** Before a sim pane draws: put the sky on this lens. */
  faceCamera(camera) {
    this.sky.position.set(camera.position.x - SIM.dx, camera.position.y, camera.position.z - SIM.dz);
    // Signs turn about Y only — one that tips back is a sign on a hinge.
    _se.setFromQuaternion(camera.quaternion, 'YXZ');
    for (const s of this.signs ?? []) s.rotation.set(0, _se.y, 0);
  }
}

const _se = new THREE.Euler();
