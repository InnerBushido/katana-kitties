import * as THREE from 'three';
import { paint } from '../core/gfx.js';
import { PALETTE, pagodaRoof, ARENA_DOOR_GAP } from './build.js';
import { buildSnakeHead } from './snakeway.js';

/* ---------------------------------------------------------------------------
   THE ARENA'S FRONT DOOR.

   "The arena entrance is a bit bland and boring with just a Torii gate. Let's
   improve it to have more of a decorative and exciting entrance, can have
   dragon snakes around the entrance of the arena with giant arena doors that
   are closed in front of the arena and can have Mr. Satan appear in front of
   the arena doors instead of in front of the torii gate. Can have a red carpet
   that leads to where the snake bridge is. Have some large elevated flaming
   lanterns stacked on the entrance to the arena."

   Everything here is in ARENA-LOCAL coordinates, the same frame `buildArena`
   works in: the ring's centre is the origin and +z runs out to the approach,
   where the torii (ring + ARENA_GATE = 62), the griffin's landing (72) and the
   arena road's end (76) already were. The gatehouse is cut into the +z stands
   rather than stood in front of them, because a gate that is not in the wall
   is a gate you walk round — `buildArena` leaves the gap (`ENTRANCE.gap`) and
   this fills it.

   A MODULE OF ITS OWN BECAUSE OF AN IMPORT CYCLE, not tidiness. The pillar
   snakes are the road's own heads (`buildSnakeHead`), and snakeway.js already
   imports build.js; build.js importing snakeway.js back would be a cycle that
   happens to work today and breaks the day either file grows a top-level
   constant the other reads.

   THE DOORS ARE THEIR OWN MESHES and everything else is merged, because they
   are the one part that moves: the arena exit scene opens them
   (systems/arenaexit.js), and a merged geometry cannot swing half of itself.
   They open INWARD, into the tunnel through the stands. Outward was the first
   plan and it put the right leaf's sweep straight through the place Mr Satan
   stands to meet them — a 6.5-unit door arcs over 6.5 units of carpet.
--------------------------------------------------------------------------- */

export const ENTRANCE = {
  /** Half-width of the gap left in the +z stands for the gatehouse. */
  gap: ARENA_DOOR_GAP,
  /** The pillars' centre line, their size, and the tunnel between them. */
  pillarX: 8.5, pillarW: 4, pillarD: 6, pillarH: 16, pillarZ: 46.5,
  /** The door leaves: hinge line, width, height, thickness. Two leaves meet on
   *  the axis, so each is half the opening between the pillars. */
  doorZ: 49.1, doorW: 6.5, doorH: 12, doorT: 0.8,
  /** How far each leaf swings in when open, radians. Flush with the pillar. */
  doorOpen: Math.PI / 2,
  /** Where Mr Satan stands to meet them: in front of the RIGHT leaf and off
   *  the carpet's middle, so the walk in and the walk out go past him and not
   *  through him. */
  stand: { x: 4.2, z: 54.5 },
  /** The carpet, from the foot of the ring's steps to the road. */
  carpet: { z0: 33.4, z1: 74, half: 3 },
  /** The two dragon columns, flanking the doors in front of the pillars. */
  columns: [[-10.5, 53.5], [10.5, 53.5]],
  columnH: 13,
  /** The four stacked fire lanterns, two either side of the carpet, between
   *  the dragon columns and the road — the torii stands between them. */
  lanterns: [[-10, 60.5], [10, 60.5], [-10, 70], [10, 70]],
};

const DOOR_RED = 0x7a1f24;
const DOOR_RED_B = 0x5c161b;
const CARPET = 0xb3202a;
const BRONZE = 0x6e4a2a;
const SNAKE = 0xf4c542;
const SNAKE_B = 0xc9862e;

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  paint(g, color);
  g.translate(x, y, z);
  return g;
}

function cyl(rt, rb, h, color, x = 0, y = 0, z = 0, seg = 10) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  paint(g, color);
  g.translate(x, y, z);
  return g;
}

function ball(r, color, x, y, z) {
  const g = new THREE.SphereGeometry(r, 8, 6);
  paint(g, color);
  g.translate(x, y, z);
  return g;
}

/**
 * One door leaf, built from its HINGE: the leaf runs from x = 0 to x = `dir` *
 * doorW, so rotating the mesh about y swings it on the hinge and nothing else.
 */
function doorLeaf(dir) {
  const E = ENTRANCE;
  const w = E.doorW;
  const parts = [];
  const cx = (dir * w) / 2;
  parts.push(box(w, E.doorH, E.doorT, DOOR_RED, cx, E.doorH / 2, 0));
  // Raised panels, so it reads as a door and not as a red wall.
  for (const y of [3.3, 8.7]) {
    parts.push(box(w - 1.4, 4.2, 0.18, DOOR_RED_B, cx, y, E.doorT / 2 + 0.05));
  }
  // Iron-gold bands and a grid of studs: the vocabulary of a castle gate.
  for (const y of [1.1, 6, 10.9]) {
    parts.push(box(w, 0.36, 0.14, PALETTE.gold, cx, y, E.doorT / 2 + 0.12));
  }
  for (let i = 0; i < 4; i++) {
    for (const y of [2.1, 4.5, 7.5, 9.9]) {
      parts.push(ball(0.2, PALETTE.gold, dir * (0.9 + i * ((w - 1.8) / 3)), y, E.doorT / 2 + 0.16));
    }
  }
  // The ring pull, near the meeting edge.
  const ring = new THREE.TorusGeometry(0.55, 0.12, 6, 14);
  paint(ring, PALETTE.gold);
  ring.translate(dir * (w - 1.0), 5.6, E.doorT / 2 + 0.25);
  parts.push(ring);
  return parts;
}

/**
 * A dragon column: a vermillion post with the road's gold snake spiralled up
 * it, two and a bit turns, and its head reared out over the carpet at the
 * top. Built round the origin; the caller moves it.
 *
 * NOT WOUND ROUND THE GATEHOUSE PILLARS, which was the first idea: the
 * pillars' inner faces ARE the doorway's sides, so the inner half of every
 * turn ran through the tunnel and through the open doors that fold flat
 * against them. A column of its own stands clear of both.
 */
function dragonColumn(side) {
  const E = ENTRANCE;
  const parts = [];
  const H = E.columnH;
  parts.push(box(3.2, 1.0, 3.2, PALETTE.stone, 0, 0.5, 0));
  parts.push(cyl(1.15, 1.3, H, PALETTE.vermillion, 0, H / 2 + 0.9, 0, 12));
  parts.push(cyl(1.55, 1.55, 0.6, PALETTE.gold, 0, H + 1.0, 0, 12));
  parts.push(cyl(1.3, 1.3, 0.45, PALETTE.gold, 0, 2.6, 0, 12));
  const r = 1.95;
  const turns = 2.25;
  const y0 = 1.3;
  const y1 = H - 1.4;
  /* Ends on the column's front, on the side toward the carpet, so the head
     leans over the way in. */
  const end = Math.atan2(0.85, -side * 0.5);
  const pts = [];
  const N = 64;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = end - side * (1 - t) * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * r, y0 + (y1 - y0) * t, Math.sin(a) * r));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.TubeGeometry(curve, 160, 0.72, 8, false);
  /* Banded, belly scales every few rings — one flat colour on a helix reads
     as a hose. */
  const n = tube.attributes.position.count;
  const col = new Float32Array(n * 3);
  const a = new THREE.Color(SNAKE);
  const b = new THREE.Color(SNAKE_B);
  for (let i = 0; i < n; i++) {
    const ring = Math.floor(i / 9);
    const c = ring % 7 < 2 ? b : a;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  tube.setAttribute('color', new THREE.BufferAttribute(col, 3));
  parts.push(tube);
  // The tail's tip, tapering off at the bottom, pointing back along it.
  const tip = new THREE.ConeGeometry(0.72, 2.0, 8);
  paint(tip, SNAKE);
  tip.rotateX(Math.PI / 2);
  const p0 = pts[0];
  const d0 = pts[1].clone().sub(pts[0]).normalize();
  tip.lookAt(d0.clone().multiplyScalar(-1));
  tip.translate(p0.x - d0.x * 0.9, p0.y - d0.y * 0.9, p0.z - d0.z * 0.9);
  parts.push(tip);
  /* The head: the road snakes' own, minus its coil and neck. It sits at y
     6.6-8.9 facing +z in its own frame; lift it onto the helix's end and turn
     it in toward the carpet. */
  const top = pts[N];
  const head = buildSnakeHead(side > 0 ? 7 : 3).slice(2);
  const m = new THREE.Matrix4()
    .makeTranslation(top.x, top.y + 2.4 - 7.0 * 1.15, top.z + 0.2)
    .multiply(new THREE.Matrix4().makeRotationY(-side * 0.45))
    .multiply(new THREE.Matrix4().makeScale(1.15, 1.15, 1.15));
  for (const g of head) g.applyMatrix4(m);
  parts.push(...head);
  // A short neck from the end of the body up into the head.
  parts.push(cyl(0.78, 0.8, 2.6, SNAKE, top.x, top.y + 1.1, top.z + 0.2));
  return parts;
}

/**
 * A stacked fire lantern: stone plinth, a tall post, three tiers of paper
 * lantern each under its own little roof, and a bronze fire bowl on top. The
 * flame is NOT here — it is additive, animated, and its own mesh (`flames`).
 * Returns the parts and the bowl's centre, which is where a flame goes.
 */
function stackedLantern(x, z) {
  const parts = [];
  parts.push(box(3.4, 0.9, 3.4, PALETTE.stone, x, 0.45, z));
  parts.push(box(2.6, 0.5, 2.6, PALETTE.rockDark, x, 1.15, z));
  parts.push(cyl(0.55, 0.7, 3.4, PALETTE.stone, x, 3.1, z, 8));
  let y = 4.8;
  for (let i = 0; i < 3; i++) {
    const w = 2.3 - i * 0.35;
    const h = 1.7 - i * 0.2;
    parts.push(box(w, h, w, PALETTE.paper, x, y + h / 2, z));
    // A vermillion frame at each corner, so the paper reads as a lantern.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        parts.push(box(0.2, h + 0.1, 0.2, PALETTE.vermillion, x + sx * w / 2, y + h / 2, z + sz * w / 2));
      }
    }
    const cap = pagodaRoof(w / 2 + 0.2, w / 2 + 0.2, 0.75, { overhang: 0.45, cornerLift: 0.3, rings: 3, perSide: 3 });
    paint(cap, i === 2 ? PALETTE.tileRed : PALETTE.tileIndigo);
    cap.translate(x, y + h - 0.05, z);
    parts.push(cap);
    y += h + 0.62;
  }
  // The fire bowl, on a short stem above the last roof.
  parts.push(cyl(0.3, 0.4, 0.8, BRONZE, x, y + 0.2, z, 8));
  const bowl = new THREE.CylinderGeometry(1.15, 0.55, 0.8, 12, 1, true);
  paint(bowl, BRONZE);
  bowl.translate(x, y + 0.9, z);
  parts.push(bowl);
  parts.push(cyl(0.6, 0.6, 0.12, 0x2a1a12, x, y + 0.72, z, 12));
  return { parts, fire: { x, y: y + 0.85, z } };
}

/**
 * Flames: stretched cones, merged into one additive mesh, and a vertex shader
 * that makes them lick. Each vertex carries its flame's foot and a phase, so
 * the whole set flickers with one uniform and no per-frame JavaScript.
 */
export function buildFlames(fires) {
  const geos = [];
  for (let f = 0; f < fires.length; f++) {
    const { x, y, z } = fires[f];
    const layers = [
      [1.0, 3.4, 0xff5a1a, 0], [0.72, 2.7, 0xff9a2a, 0.9], [0.42, 1.9, 0xffe07a, 1.7],
    ];
    for (const [r, h, c, ph] of layers) {
      for (let k = 0; k < 3; k++) {
        const g = new THREE.ConeGeometry(r * (1 - k * 0.18), h * (1 - k * 0.12), 8, 3, true);
        g.translate(Math.cos(k * 2.1 + f) * r * 0.35, h / 2 * (1 - k * 0.12), Math.sin(k * 2.1 + f) * r * 0.35);
        paint(g, c);
        const n = g.attributes.position.count;
        const base = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) {
          base[i * 4] = x; base[i * 4 + 1] = y; base[i * 4 + 2] = z;
          base[i * 4 + 3] = f * 1.7 + ph + k * 2.3;
        }
        g.setAttribute('flame', new THREE.BufferAttribute(base, 4));
        g.translate(x, y, z);
        geos.push(g);
      }
    }
  }
  let count = 0;
  for (const g of geos) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const fl = new Float32Array(count * 4);
  const idx = [];
  let vo = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, vo * 3);
    col.set(g.attributes.color.array, vo * 3);
    fl.set(g.attributes.flame.array, vo * 4);
    for (const i of g.index.array) idx.push(i + vo);
    vo += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('flame', new THREE.BufferAttribute(fl, 4));
  out.setIndex(idx);
  return out;
}

export function flameMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */`
      attribute vec4 flame;
      attribute vec3 color;
      uniform float uTime;
      varying vec3 vCol;
      varying float vUp;
      void main() {
        vec3 p = position - flame.xyz;
        float up = clamp(p.y / 3.4, 0.0, 1.0);
        float t = uTime * 7.0 + flame.w;
        // Taller and shorter, and the tip wandering: the lick.
        p.y *= 0.85 + 0.25 * sin(t) + 0.1 * sin(t * 2.7);
        p.x += up * up * 0.55 * sin(t * 1.3 + p.y);
        p.z += up * up * 0.45 * cos(t * 1.1 + p.y);
        vCol = color;
        vUp = up;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p + flame.xyz, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol;
      varying float vUp;
      void main() {
        gl_FragColor = vec4(vCol * (1.0 - vUp * 0.65), 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

/**
 * Everything at the front door, in arena-local coordinates.
 *
 * @returns {{
 *   parts: THREE.BufferGeometry[],      // merged into the arena's solid mesh
 *   seeThrough: THREE.BufferGeometry[], // the gatehouse: tall and in front of
 *                                       // the +z cameras, so it gets cut
 *   solids: object[],                   // the pillars and lanterns
 *   doors: {parts, hinge, dir}[],       // two leaves, built from their hinges
 *   doorSolids: object[],               // the doorway while it is shut
 *   fires: {x,y,z}[],                   // where a flame goes
 * }}
 */
export function buildArenaEntrance() {
  const E = ENTRANCE;
  const parts = [];
  const seeThrough = [];
  const solids = [];

  /* --- the carpet ---
     From the foot of the ring's steps, through the gatehouse, under the torii
     and out to the road. A gold border either side, and a hem at each end. */
  const { z0, z1, half } = E.carpet;
  const len = z1 - z0;
  const zc = (z0 + z1) / 2;
  parts.push(box(half * 2, 0.08, len, CARPET, 0, 0.05, zc));
  for (const s of [-1, 1]) parts.push(box(0.34, 0.1, len, PALETTE.gold, s * (half - 0.3), 0.07, zc));
  for (const z of [z0 + 0.3, z1 - 0.3]) parts.push(box(half * 2, 0.1, 0.34, PALETTE.gold, 0, 0.07, z));

  /* --- the gatehouse ---
     Two vermillion pillars with gold bands, a lintel with a plaque on it, a
     plaster panel over the doors and a red pagoda roof. */
  for (const s of [-1, 1]) {
    const x = s * E.pillarX;
    seeThrough.push(box(E.pillarW, E.pillarH, E.pillarD, PALETTE.vermillion, x, E.pillarH / 2, E.pillarZ));
    seeThrough.push(box(E.pillarW + 0.6, 1.2, E.pillarD + 0.6, PALETTE.stone, x, 0.6, E.pillarZ));
    for (const y of [3.2, 11.5]) {
      seeThrough.push(box(E.pillarW + 0.3, 0.5, E.pillarD + 0.3, PALETTE.gold, x, y, E.pillarZ));
    }
    solids.push({ x, z: E.pillarZ, r: 3.3, top: E.pillarH + 1 });
  }
  const spanW = (E.pillarX + E.pillarW / 2) * 2 + 1.2;
  seeThrough.push(box(spanW, 3, E.pillarD + 0.8, PALETTE.vermillion, 0, E.pillarH - 0.5, E.pillarZ));
  seeThrough.push(box(spanW + 1.6, 0.6, E.pillarD + 1.6, 0x2a1a1e, 0, E.pillarH + 1.2, E.pillarZ));
  seeThrough.push(box(E.doorW * 2, E.pillarH - 2 - E.doorH, 0.6, PALETTE.plaster,
    0, E.doorH + (E.pillarH - 2 - E.doorH) / 2, E.doorZ - 0.1));
  // The plaque, gold on black, on the lintel's face.
  seeThrough.push(box(7.2, 2.3, 0.4, PALETTE.gold, 0, E.pillarH - 0.5, E.pillarZ + E.pillarD / 2 + 0.55));
  seeThrough.push(box(6.4, 1.6, 0.2, 0x1a1210, 0, E.pillarH - 0.5, E.pillarZ + E.pillarD / 2 + 0.8));
  const roof = pagodaRoof(spanW / 2 + 0.6, E.pillarD / 2 + 1.2, 4.2, { overhang: 1.1, cornerLift: 1.0 });
  paint(roof, PALETTE.tileRed);
  roof.translate(0, E.pillarH + 1.4, E.pillarZ);
  seeThrough.push(roof);
  // The sill the doors close onto.
  parts.push(box(E.doorW * 2, 0.3, 1.2, PALETTE.stone, 0, 0.15, E.doorZ));

  /* --- the doors --- */
  const doors = [-1, 1].map((s) => ({
    parts: doorLeaf(-s),
    hinge: { x: s * E.doorW, z: E.doorZ },
    /* Which way this leaf turns to open INWARD (toward -z). The left leaf
       runs +x from its hinge, and a positive yaw takes +x to -z. */
    dir: s < 0 ? 1 : -1,
  }));
  /* The doorway, while it is shut: two cylinders across it. `off` while it is
     open — `resolveSolids` honours the flag already. */
  const doorSolids = [-1, 1].map((s) => ({ x: s * E.doorW / 2, z: E.doorZ, r: E.doorW / 2, top: E.doorH }));

  /* --- the dragon-snakes, one up each column --- */
  for (const [x, z] of E.columns) {
    const snake = dragonColumn(Math.sign(x));
    for (const g of snake) g.translate(x, 0, z);
    seeThrough.push(...snake);
    solids.push({ x, z, r: 2.8, top: E.columnH + 1.3 });
  }

  /* --- the lanterns --- */
  const fires = [];
  for (const [x, z] of E.lanterns) {
    const L = stackedLantern(x, z);
    parts.push(...L.parts);
    fires.push(L.fire);
    solids.push({ x, z, r: 2.0, top: L.fire.y });
  }

  return { parts, seeThrough, solids, doors, doorSolids, fires };
}
