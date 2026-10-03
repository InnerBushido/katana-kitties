import * as THREE from 'three';
import { Billboard, paint, toonVertexMat } from '../core/gfx.js';
import { bubbleTexture } from '../entities/leader.js';
import { mergeParts } from '../world/build.js';
import { SimWorld, SIM, HOLO, toSim } from '../world/simworld.js';
import { MathDojo } from './mathdojo.js';
import { aggregate, ORB_BY_ID } from '../entities/powerorb.js';
import { buildWornOrbs } from './kotodama.js';
import { TrainingGate, Shards } from './dream/targets.js';
import { makeSimHud } from './dream/simhud.js';
import { DreamProgress } from './dream/progress.js';
import { Drill } from './dream/drill.js';
import { Gallery } from './dream/gallery.js';
import { TrialHall } from './dream/hall.js';
import { TameshigiriRange } from './dream/range.js';
import { KataHall } from './dream/kata.js';
import { DataHighway } from './dream/highway.js';
import { KudamonoStorm } from './dream/storm.js';
import { SineGauntlet } from './dream/sine.js';
import { HoloSentries } from './dream/sentries.js';
import { BambooInfiltration } from './dream/bamboo.js';
import { Rundown } from './dream/rundown.js';
import { ISLANDS, islandCentre } from './dream/islands.js';
import { SimBar } from './dream/holo.js';

/* ---------------------------------------------------------------------------
   LIONHEART'S DREAM DOJO — the VR arcade north-east of the Turning Circle.

   Richard's own startup, prototyped inside his nieces' game: "start to build
   my 'Dream Dojo / Soldier Simulator' idea here in this game before going out
   and building for real". Lionheart is Richard; the arcade is his.

   THE SHAPE OF IT, as asked for:

     · his own little floating island beside the Dojo, that "dragons and
       pandas can't enter", so "players have to jump" — a dome keeps animals
       off, and two stepping stones are the way across;
     · four holographic tubes, one per kitten. She walks to hers, the visor
       goes on, she floats up, and "the view phases into VR";
     · VR is "a separate reality ... the same location, but on a different
       layer of existence" — see world/simworld.js for how, and why an offset;
     · while she is in, "the real-world body mirrors her attacks": a puppet
       of her floats in the tube doing whatever she is doing in there.

   WHAT IT MUST NOT BREAK. The arcade adds; it never changes the game at two
   players who are not using it (non-negotiable 5): every hook into `Game` is
   a no-op for a kitten with no `dream` state, and `world-check` pins that. It
   never fights (3): nothing in here calls `strikePlayers`. Nothing is lost
   (4): a kitten can never be stranded in the simulator — any scene, the
   tournament, the ending or a save pulls her out to her tube, and a save
   taken while she is in records her TUBE, not her sim coordinates.
--------------------------------------------------------------------------- */

/** Lionheart's island. North-east of the Dojo's centre, 96 units out along
 *  the diagonal, which leaves a 16-unit gap off the Dojo's rim (measured: the
 *  Dojo is walkable to r=66 at y=30 all round its north-east quarter). */
export const ARCADE = { x: -162, z: 2, r: 14, y: 33 };
/** The dome that keeps animals out. A little larger than the pad so a dragon
 *  is turned away before its wing is over the deck. */
export const DOME_R = 19;
/** How tall Lionheart stands — Payne's height, he is a grown-up too. */
export const LION_HEIGHT = 6.2;
export const LION_TALK_R = 5.6;
/** A kitten's own tube: how near counts as "in it". */
export const TUBE_R = 1.5;
export const TUBE_IN = 1.7;
/** How high she floats in the tube with the visor on. */
export const FLOAT_H = 1.6;

/** The sequence, in seconds. Named so a check can read them. */
export const SEQ = {
  walkMax: 7,      // auto-walk gives up and places her after this
  rise: 1.8,       // visor on, floating up, a little rain in her pane
  jack: 0.7,       // the rain fills the pane; she crosses at the end
  rez: 1.4,        // she is drawn in on the other side
  derez: 1.1,      // jacking out: drawn away, the rain fills
  descend: 1.6,    // back in the tube, floating down, visor off
};

/** Who stands where on the pad — pure, so `world-check` can measure it.
 *  `u` points from the Dojo to the arcade (into the screen from the game's
 *  fixed north-east-looking camera) and `v` is screen-right. */
export function arcadeLayout(dojoCentre) {
  const dx = ARCADE.x - dojoCentre.x;
  const dz = ARCADE.z - dojoCentre.z;
  const L = Math.hypot(dx, dz);
  const u = { x: dx / L, z: dz / L };
  const v = { x: -u.z, z: u.x };
  const at = (a, b) => ({ x: ARCADE.x + u.x * a + v.x * b, z: ARCADE.z + u.z * a + v.z * b });
  /* Two stones across the 16-unit gap, each a short hop up. A single jump at
     a walk clears about nine units and rises 2.4; the widest gap here is 3.8
     and the biggest step up is one unit, so a nine-year-old cannot miss it
     but she does have to JUMP, which is the whole of the brief. */
  const stones = [
    { d: 70.5, y: 31.0 },
    { d: 76.6, y: 32.0 },
  ].map(({ d, y }) => ({ x: dojoCentre.x + u.x * d, z: dojoCentre.z + u.z * d, y, r: 1.8 }));
  return {
    u, v, L,
    stones,
    /* The tubes along the back of the pad, left to right in player order, so
       Tube 1 is on the left where Ember's score is. */
    tubes: [-7.5, -2.5, 2.5, 7.5].map((b) => at(6, b)),
    /* Lionheart on the left, near the way in, so he is the first thing a
       kitten meets stepping off the stones. */
    lion: at(-2, -9),
    sign: at(12.6, 0),
  };
}

/* ------------------------------ the lines -------------------------------- */

/** What he says. `%n` is her name and `%t` her tube number. */
export const LION_LINES = {
  idle: 'The Dream Dojo — VR training!\nJump across the stones\nand come and try it!',
  honor: 'Like my sword? Her name is HONOR.\nBeat me in the simulator someday…\nand maybe I\'ll share my Honor with you.',
  send: '%n! Tube %t is yours.\nStep in — I\'ll do the rest!',
  sim: 'You\'re jacked in! This is my Dream Dojo.\nCross a bridge to an island to train.\nTo jack out, stand on your ring.',
  simIdle: 'Everything in here is light.\nNothing you break in here\nis broken out there.',
  /* Said once per visit to a kitten wearing orbs. `%k` is how many. */
  rundown: '%n — you\'re wearing %k Kotodama!\nTalk to me for a rundown\nof what each one does.',
  /* The spokes in the order she meets them walking round from the port
     (dream/islands.js): +38 and +78 are on her left, -38 and -78 her right. */
  islands: 'Left: GALLERY, RANGE, then KUDAMONO STORM.\nRight: TRIAL HALL, KATA, then the SINE GAUNTLET.\nThe far two? Take a LIGHT CYCLE!',
};

/* ------------------------------ shaders ---------------------------------- */

const SCREEN_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
/* THE PHASE. Digital rain in her pane only: columns of glyph cells falling at
   their own speeds, a scan band sweeping, and at full strength a white-cyan
   flash that is the moment she crosses. Procedural — the glyphs are a 3x5
   bit pattern picked per cell per tick — because there is no font texture in
   this game and a canvas of katakana for one effect is not worth its upload. */
const RAIN_FRAG = /* glsl */`
  uniform float uI;
  uniform float uTime;
  uniform vec2 uRes;
  varying vec2 vUv;
  float h(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 15731.743); }
  void main() {
    float cw = 14.0;
    vec2 px = vUv * uRes;
    vec2 cell = floor(px / vec2(cw, cw * 1.4));
    vec2 inCell = fract(px / vec2(cw, cw * 1.4));
    float speed = 6.0 + h(vec2(cell.x, 3.0)) * 14.0;
    float head = fract(h(vec2(cell.x, 7.0)) - uTime * speed / (uRes.y / (cw * 1.4)));
    float row = cell.y / (uRes.y / (cw * 1.4));
    float trail = fract(row - head);
    float lit = smoothstep(0.55, 0.0, trail);
    float tick = floor(uTime * 12.0 + h(cell) * 20.0);
    vec2 g = floor(inCell * vec2(3.0, 5.0));
    float bit = step(0.45, h(cell * 1.7 + g + tick * 0.13));
    float glyph = bit * step(0.12, inCell.x) * step(inCell.x, 0.88) * step(0.08, inCell.y) * step(inCell.y, 0.92);
    vec3 col = mix(vec3(0.1, 1.0, 0.6), vec3(0.6, 1.0, 1.0), step(0.97, 1.0 - trail));
    float a = glyph * lit * clamp(uI * 1.6, 0.0, 1.0);
    float scan = exp(-pow((vUv.y - fract(uTime * 0.7)) * 9.0, 2.0)) * uI;
    float veil = smoothstep(0.35, 1.0, uI);
    vec3 outc = col * a + vec3(0.4, 1.0, 0.95) * scan * 0.35;
    float flash = smoothstep(0.85, 1.0, uI);
    outc = mix(outc, vec3(0.85, 1.0, 1.0), flash * 0.75);
    float alpha = clamp(max(a, veil * 0.92) + scan * 0.2, 0.0, 1.0);
    vec3 bg = vec3(0.0, 0.05, 0.06);
    gl_FragColor = vec4(mix(bg, outc, clamp(a + flash + scan, 0.0, 1.0)) + outc * 0.2, alpha);
  }
`;

const SPRITE_VERT = /* glsl */`
  uniform mat3 uvTransform;
  varying vec2 vUv;
  varying vec2 vRaw;
  void main() {
    vRaw = uv;
    vUv = (uvTransform * vec3(uv, 1.0)).xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
/* HER, BEING DRAWN IN — OR OUT. `uRez` runs 0 to 1 as she arrives: rows of
   her pixels resolve from the top down out of a noise threshold, each with a
   bright cyan leading edge, and what has not resolved yet is a scatter of
   glyph-light where she will be. The same shader played backwards is her
   leaving. It samples HER sheet through HER sprite's own UV transform, so it
   is whichever cell she is actually showing — never a stand-in. */
const REZ_FRAG = /* glsl */`
  uniform sampler2D map;
  uniform vec3 uTint;
  uniform float uRez;
  uniform float uTime;
  varying vec2 vUv;
  varying vec2 vRaw;
  float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec4 t = texture2D(map, vUv);
    if (t.a < 0.35) discard;
    vec2 blk = floor(vRaw * vec2(28.0, 56.0));
    float n = h(blk) * 0.35 + (1.0 - vRaw.y) * 0.65;
    float edge = uRez * 1.25 - n;
    if (edge < -0.12) {
      float sp = step(0.86, h(blk + floor(uTime * 14.0)));
      if (sp < 0.5) discard;
      gl_FragColor = vec4(0.4, 1.0, 0.9, 0.85);
      return;
    }
    vec3 col = t.rgb * uTint;
    float glow = 1.0 - smoothstep(0.0, 0.12, edge);
    col = mix(col, vec3(0.55, 1.0, 1.0), glow);
    gl_FragColor = vec4(col, 1.0);
  }
`;
/* AND ONCE SHE IS IN: a faint scanline glint over her, additive, so she reads
   as made of light like everything else in there without losing a single
   pixel of who she is. */
const GLINT_FRAG = /* glsl */`
  uniform sampler2D map;
  uniform float uTime;
  varying vec2 vUv;
  varying vec2 vRaw;
  void main() {
    vec4 t = texture2D(map, vUv);
    if (t.a < 0.35) discard;
    float lines = 0.5 + 0.5 * sin(vRaw.y * 160.0 - uTime * 6.0);
    float sweep = exp(-pow((vRaw.y - fract(uTime * 0.45)) * 7.0, 2.0));
    vec3 c = vec3(0.2, 0.9, 1.0) * (lines * 0.10 + sweep * 0.35);
    gl_FragColor = vec4(c, 1.0);
  }
`;

const DOME_VERT = /* glsl */`
  varying vec3 vN;
  varying vec3 vView;
  varying vec3 vP;
  varying float vDist;
  void main() {
    vP = position;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - wp.xyz);
    vDist = distance(cameraPosition, wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
/* A hex lattice that is only really there edge-on, plus a slow ripple from
   the top. Barely visible from inside, unmistakable from a dragon.
   FIRST CUT, REJECTED ON SIGHT: a square lattice with every other row
   shunted half a cell — which is a brick wall, and at full fresnel, with the
   follow camera sitting about on the shell (r 19 against a camera 15-20 back),
   the near side came out as an opaque orange wall across a third of the
   pane. So: a real hex cell, half the strength, and the shell fades to
   nothing within a few units of the lens, so the side you are looking
   THROUGH is never the side you see. */
const DOME_FRAG = /* glsl */`
  uniform float uTime;
  uniform float uHit;
  varying vec3 vN;
  varying vec3 vView;
  varying vec3 vP;
  varying float vDist;
  float hexEdge(vec2 q) {
    const vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r * 0.5;
    vec2 a = mod(q, r) - h;
    vec2 b = mod(q - h, r) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    vec2 p = abs(gv);
    float d = max(dot(p, vec2(0.5, 0.8660254)), p.x);
    return smoothstep(0.44, 0.5, d);
  }
  void main() {
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 2.6);
    float hex = hexEdge(vec2(atan(vP.z, vP.x) * 9.0, vP.y * 0.9));
    float ripple = exp(-pow((vP.y / 19.0) - fract(uTime * 0.25), 2.0) * 60.0);
    float near = smoothstep(3.0, 14.0, vDist);
    float a = (f * 0.16 + hex * f * 0.3 + ripple * hex * 0.18) * near
      + uHit * 0.45 * (0.3 + hex);
    gl_FragColor = vec4(vec3(0.35, 0.95, 1.0) * (0.6 + hex * 0.6 + uHit), a);
  }
`;

const TUBE_FRAG = /* glsl */`
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uGlow;
  varying vec2 vUv;
  void main() {
    float streak = pow(0.5 + 0.5 * sin(vUv.x * 62.0 + sin(vUv.x * 9.0) * 2.0), 6.0);
    float rise = fract(vUv.y * 1.5 - uTime * (0.4 + uGlow * 1.2));
    float band = smoothstep(0.0, 0.05, rise) * (1.0 - smoothstep(0.08, 0.3, rise));
    float edge = smoothstep(0.85, 1.0, vUv.y) + smoothstep(0.12, 0.0, vUv.y);
    float a = 0.10 + streak * 0.12 * (0.4 + uGlow) + band * (0.15 + uGlow * 0.5) + edge * 0.35;
    gl_FragColor = vec4(uColor * (0.6 + uGlow), a);
  }
`;
const TUBE_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

/* ------------------------------ canvases --------------------------------- */

function canvasTexture(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: false });
  draw(g, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The headset: a black band with a cyan strip, the same visor drawn on
 *  Lionheart's own forehead, so a kitten in a tube is wearing HIS kit. */
function visorTexture() {
  return canvasTexture(256, 96, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const r = 30;
    g.fillStyle = '#121418';
    g.beginPath();
    g.moveTo(r, 8); g.lineTo(w - r, 8); g.quadraticCurveTo(w - 4, 8, w - 4, h / 2);
    g.quadraticCurveTo(w - 4, h - 8, w - r, h - 8); g.lineTo(r, h - 8);
    g.quadraticCurveTo(4, h - 8, 4, h / 2); g.quadraticCurveTo(4, 8, r, 8);
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = '#000';
    g.stroke();
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, '#2ad8ff');
    grd.addColorStop(0.5, '#b8fbff');
    grd.addColorStop(1, '#2ad8ff');
    g.fillStyle = grd;
    g.fillRect(36, h / 2 - 7, w - 72, 14);
  });
}

function signTexture() {
  return canvasTexture(1024, 384, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(6, 18, 28, 0.82)';
    g.fillRect(10, 10, w - 20, h - 20);
    g.strokeStyle = '#5ff6ff';
    g.lineWidth = 8;
    g.strokeRect(14, 14, w - 28, h - 28);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '700 150px "Noto Serif JP", serif';
    g.fillStyle = '#ff4fd8';
    g.shadowColor = '#ff4fd8';
    g.shadowBlur = 24;
    g.fillText('夢道場', w / 2, 140);
    g.shadowColor = '#5ff6ff';
    g.font = '900 64px Nunito, sans-serif';
    g.fillStyle = '#c8fdff';
    g.fillText('THE DREAM DOJO', w / 2, 262);
    g.shadowBlur = 0;
    g.font = '700 34px Nunito, sans-serif';
    g.fillStyle = '#7fe9ff';
    g.fillText("LIONHEART'S VR ARCADE", w / 2, 324);
  });
}

function numberTexture(n, colour) {
  return canvasTexture(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '900 96px Nunito, sans-serif';
    g.shadowColor = colour;
    g.shadowBlur = 18;
    g.fillStyle = colour;
    g.fillText(String(n), w / 2, h / 2 + 4);
  });
}

const css = (hex) => `#${new THREE.Color(hex).getHexString()}`;

/* ------------------------------- system ---------------------------------- */

export class DreamDojo {
  constructor(game) {
    this.game = game;
    /** Player index -> her sequence state, or nothing at all if she has
     *  never been near a tube. The ABSENCE is the two-player guarantee. */
    this.st = [];
    this.t = 0;
    this.sim = null;
    this.simDojo = null;
    this.built = false;
    this._said = new Map();
    this._domeHit = 0;
    this._toastAt = new Map();
    /** The holograms a kitten's blade can find in here — see dream/targets.js. */
    this.gate = new TrainingGate();
    /** Stars, bests and flags, per kitten, for good. `localStorage` may throw
     *  just being READ in a locked-down frame, so it is asked inside a try. */
    let store = null;
    try { store = globalThis.localStorage ?? null; } catch { store = null; }
    this.progress = new DreamProgress(store);
    /** Player index -> her live drill, or nothing. */
    this.drills = [];
    /** Player index -> her open rundown, or nothing. */
    this.rundowns = [];
    /** Every pad in the simulator that answers INTERACT (pedestals, shrines). */
    this.stations = [];
    this._hintAt = new Map();
  }

  /* ----------------------------- the island ------------------------------- */

  /**
   * Raise the island. Called once, after the World, with Lionheart's atlas.
   * Every collider it adds goes into the real World's own lists, so the real
   * World needs to know nothing about the arcade to be walked on.
   */
  build(lionArt) {
    const g = this.game;
    const W = g.world;
    if (!W || this.built) return;
    this.built = true;
    this.layout = arcadeLayout(W.dojoCentre);
    const L = this.layout;
    this.group = new THREE.Group();
    this.group.name = 'dream-dojo';
    g.scene.add(this.group);

    /* The pad and the stones are PLATFORMS with a round deck — the shrine
       dais's shape — so `World.heightAt` already knows how to stand a kitten
       on them, one-way from below, and a dragon finds no island under them
       (`island: null`), which is half of why it never lands here. */
    const plat = (x, z, r, y, extra = {}) => {
      const p = { x0: x - r, x1: x + r, z0: z - r, z1: z + r, y, cx: x, cz: z, r, arcade: true, ...extra };
      W.platforms.push(p);
      return p;
    };
    this.padDeck = plat(ARCADE.x, ARCADE.z, ARCADE.r, ARCADE.y, { step: 0.6 });
    for (const s of L.stones) plat(s.x, s.z, s.r, s.y, { step: 0.6 });

    const parts = [];
    // The pad: a steel drum with a darker inset, on a ragged rock.
    const drum = new THREE.CylinderGeometry(ARCADE.r, ARCADE.r * 0.96, 1.4, 48);
    drum.translate(ARCADE.x, ARCADE.y - 0.7, ARCADE.z);
    parts.push(paint(drum, 0x4a5068));
    const inset = new THREE.CylinderGeometry(ARCADE.r - 1.2, ARCADE.r - 1.2, 0.08, 48);
    inset.translate(ARCADE.x, ARCADE.y + 0.01, ARCADE.z);
    // Not darker than this: at 0x1a1c26 the deck read as a hole in the world.
    parts.push(paint(inset, 0x323a52));
    const rock = new THREE.ConeGeometry(ARCADE.r * 0.95, 16, 10, 2);
    rock.rotateX(Math.PI);
    rock.translate(ARCADE.x, ARCADE.y - 1.4 - 8, ARCADE.z);
    parts.push(paint(rock, 0x5a4a52));
    for (const s of L.stones) {
      const top = new THREE.CylinderGeometry(s.r, s.r * 0.9, 0.6, 14);
      top.translate(s.x, s.y - 0.3, s.z);
      parts.push(paint(top, 0x3a3f52));
      const under = new THREE.ConeGeometry(s.r * 0.9, 3.4, 7);
      under.rotateX(Math.PI);
      under.translate(s.x, s.y - 0.6 - 1.7, s.z);
      parts.push(paint(under, 0x5a4a52));
    }
    // Tube bases and caps, the hard parts of the four tubes.
    for (const t of L.tubes) {
      const base = new THREE.CylinderGeometry(TUBE_R + 0.35, TUBE_R + 0.5, 0.3, 28);
      base.translate(t.x, ARCADE.y + 0.15, t.z);
      parts.push(paint(base, 0x3b4152));
      const cap = new THREE.CylinderGeometry(TUBE_R + 0.45, TUBE_R + 0.3, 0.5, 28);
      cap.translate(t.x, ARCADE.y + 5.4, t.z);
      parts.push(paint(cap, 0x3b4152));
    }
    const hard = new THREE.Mesh(mergeParts(parts), toonVertexMat());
    hard.castShadow = true;
    hard.receiveShadow = true;
    this.group.add(hard);

    // The pad's neon rim, and a rim on each stone, so the way across glows.
    const neon = (x, y, z, r, w, colour) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, w, 6, 64), new THREE.MeshBasicMaterial({ color: colour, toneMapped: false }));
      m.rotation.x = Math.PI / 2;
      m.position.set(x, y, z);
      this.group.add(m);
      return m;
    };
    neon(ARCADE.x, ARCADE.y + 0.04, ARCADE.z, ARCADE.r - 0.15, 0.12, HOLO.cyan);
    neon(ARCADE.x, ARCADE.y + 0.04, ARCADE.z, ARCADE.r - 1.25, 0.06, HOLO.magenta);
    for (const s of L.stones) neon(s.x, s.y + 0.02, s.z, s.r - 0.1, 0.07, HOLO.cyan);

    /* THE DOME. Drawn from both sides and never written to depth, so a
       kitten inside it sees the island and not a wall. */
    this.domeU = { uTime: { value: 0 }, uHit: { value: 0 } };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(DOME_R, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.ShaderMaterial({
        vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, uniforms: this.domeU,
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      })
    );
    dome.position.set(ARCADE.x, ARCADE.y - 0.5, ARCADE.z);
    dome.renderOrder = 6;
    this.group.add(dome);
    this.dome = dome;

    /* THE TUBES. Glass that streams light upward, faster and brighter while
       somebody is in it, in HER colour once she is. */
    this.tubeU = [];
    this.tubeMats = L.tubes.map((t, i) => {
      const u = {
        uTime: { value: 0 }, uGlow: { value: 0 },
        uColor: { value: new THREE.Color(HOLO.cyan) },
      };
      this.tubeU.push(u);
      const glass = new THREE.Mesh(
        new THREE.CylinderGeometry(TUBE_R, TUBE_R, 5.0, 32, 1, true),
        new THREE.ShaderMaterial({
          vertexShader: TUBE_VERT, fragmentShader: TUBE_FRAG, uniforms: u,
          transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        })
      );
      glass.position.set(t.x, ARCADE.y + 2.8, t.z);
      glass.renderOrder = 5;
      this.group.add(glass);
      const col = g.players?.[i]?.style?.colour ?? [0xff8a3d, 0xff6fae, 0x35d7f0, 0xa96bff][i];
      const num = new THREE.Mesh(
        new THREE.PlaneGeometry(1.3, 1.3),
        new THREE.MeshBasicMaterial({ map: numberTexture(i + 1, css(col)), transparent: true, depthWrite: false, toneMapped: false })
      );
      num.position.set(t.x, ARCADE.y + 6.5, t.z);
      num.renderOrder = 7;
      this.group.add(num);
      return { glass, num };
    });

    // The sign over the back of the pad.
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 4.5),
      new THREE.MeshBasicMaterial({ map: signTexture(), transparent: true, side: THREE.DoubleSide, toneMapped: false })
    );
    sign.position.set(L.sign.x, ARCADE.y + 9.5, L.sign.z);
    this.sign = sign;
    this.group.add(sign);
    const posts = [];
    for (const k of [-5.2, 5.2]) {
      const pg = new THREE.CylinderGeometry(0.22, 0.28, 9.6, 8);
      pg.translate(L.sign.x + L.v.x * k, ARCADE.y + 4.8, L.sign.z + L.v.z * k);
      posts.push(paint(pg, 0x22252f));
    }
    this.group.add(new THREE.Mesh(mergeParts(posts), toonVertexMat()));

    this._buildLion(lionArt);
    this.visorTex = visorTexture();
  }

  /** Lionheart: Payne's billboard pattern, with his own bubble. */
  _buildLion(art) {
    const g = this.game;
    const L = this.layout;
    this.lion = new THREE.Group();
    this.lion.position.set(L.lion.x, ARCADE.y, L.lion.z);
    this.lionArt = art?.texture ? art : null;
    if (art?.texture) {
      const quad = LION_HEIGHT / (art.contentScale || 1);
      /* FRONT-FACING, NEVER MIRRORED: one drawing with a sword over ONE
         shoulder must not swap shoulders as the camera walks round him. */
      this.lionSprite = new Billboard(art.texture, {
        cols: 1, rows: 1, width: quad, height: quad, footOffset: (art.pad ?? 0) * quad, mirror: false,
      });
      this.lion.add(this.lionSprite);
    }
    const sg = new THREE.CircleGeometry(1.5, 18);
    sg.rotateX(-Math.PI / 2);
    const shadow = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0x0a0c14, transparent: true, opacity: 0.4, depthWrite: false }));
    shadow.position.y = 0.05;
    this.lion.add(shadow);
    this.group.add(this.lion);
    g.world?.solids?.push({ x: L.lion.x, z: L.lion.z, r: 1.25 });
    this.bubbles = new Map();
    this.bubbleKey = null;
    this.bubbleShow = 0;
  }

  _bubble(text, holo = false) {
    const map = holo ? this.holoBubbles : this.bubbles;
    let m = map.get(text);
    if (m) return m;
    const { texture, aspect, tip } = bubbleTexture(text, '#ff3b3b', { tail: 'left' });
    const BH = 3.0;
    m = new THREE.Mesh(new THREE.PlaneGeometry(BH * aspect, BH), new THREE.MeshBasicMaterial({
      map: texture, transparent: true, opacity: 0, depthWrite: false, depthTest: false,
      toneMapped: false, side: THREE.DoubleSide,
    }));
    m.userData.w = BH * aspect;
    m.userData.tipY = BH * (0.5 - tip.v);
    m.renderOrder = 24;
    m.visible = false;
    (holo ? this.holoLion : this.lion).add(m);
    map.set(text, m);
    return m;
  }

  /** Have the HOLOGRAM say something — the one a kitten in the sim can see. */
  holoSay(text, secs = 6) {
    this.holoText = text;
    this.holoUntil = this.t + secs;
  }

  /** Have him say something for a while. Text only until his voice exists. */
  say(text, secs = 6) {
    this.sayText = text;
    this.sayUntil = this.t + secs;
  }

  /* ------------------------------- queries -------------------------------- */

  /** Which reality is she in? `'sim'` or `null`. */
  realmOf(p) { return p?.realm === 'sim' ? 'sim' : null; }

  /** The world she walks on. */
  worldFor(p) { return this.realmOf(p) === 'sim' && this.sim ? this.sim : this.game.world; }

  /** Is anybody in, or on the way in or out? */
  get busy() { return this.st.some((s) => s && s.phase); }

  /** Her state, if she has any. */
  stateOf(i) { return this.st[i] ?? null; }

  /** Is a pane full of sim? A group's realm is its first member's — a group
   *  never mixes realms, `Game._clusters` sees to that. */
  paneIsSim(members) {
    const p = this.game.players?.[members?.[0]];
    return !!p && this.realmOf(p) === 'sim';
  }

  /** Does she want a pane of her own? From the moment she sets off for her
   *  tube, so the phase never washes over a sister's view. */
  wantsSolo(p) {
    const s = this.st[p?.index];
    return !!(s && s.phase) || this.realmOf(p) === 'sim';
  }

  /**
   * Who her panda follows while she is in: HER, standing on the Dojo's rim
   * at the foot of the stones. The dome keeps it off the pad, so the honest
   * place for it to wait is the last bit of ground before the jump — which is
   * also exactly where she will see it when she comes out.
   *
   * A REAL `Proxy`, NOT `Object.create`. The panda writes to its owner (a
   * lick heals her, a mount sets her seat), and a prototype copy would take
   * every one of those writes on itself and quietly lose them. Only
   * `position` is answered differently; everything else is her.
   */
  ownerFor(p) {
    if (this.realmOf(p) !== 'sim' || !this.layout) return p;
    const s = this.st[p.index];
    if (!s) return p;
    if (!s.proxy) {
      const dc = this.game.world.dojoCentre;
      const u = this.layout.u;
      const wait = new THREE.Vector3(dc.x + u.x * 61, dc.y, dc.z + u.z * 61);
      s.proxy = new Proxy(p, {
        get: (t, k) => (k === 'position' ? wait : Reflect.get(t, k)),
      });
    }
    return s.proxy;
  }

  /** The pad she is driven by: her own, a dead one, or the walk to her tube. */
  padFor(i, pad, dead) {
    const s = this.st[i];
    if (!s?.phase) return pad;
    if (s.phase === 'walk') return s.walkPad ?? dead;
    if (s.phase === 'sim') {
      // On a light cycle she is cargo: a stick still pushed must not steer
      // her off the highway (highway.js).
      if (this.highway?.riding(i)) return dead;
      /* A DRILL MAY WATCH HER BUTTONS — Kata Trace has to know the moment
         she pressed jump, not the moment her feet left the floor. Watching
         only: `pressed` is a pure edge test, and this never consumes one. */
      const d = this.drills[i];
      if (d?.state === 'live') d.spec.pad?.(d, pad);
      return pad;
    }
    return dead;
  }

  /** Is she standing at Lionheart? */
  canTalk(p) {
    if (!this.lion || !p) return false;
    if (p.mount || p.rideAlong || p.pandaMount || p.angel || p.carried || p.ko) return false;
    if (this.st[p.index]?.phase && this.st[p.index].phase !== 'sim') return false;
    const pos = this._flatPos(p);
    return Math.hypot(pos.x - this.lion.position.x, pos.z - this.lion.position.z) < LION_TALK_R;
  }

  /** In the sim, positions are compared in the layer's own coordinates, so
   *  holo-Lionheart answers at the same spot the real one stands on. */
  _flatPos(p) {
    if (this.realmOf(p) !== 'sim') return p.position;
    return { x: p.position.x - SIM.dx, z: p.position.z - SIM.dz };
  }

  /** Index of the tube she is standing in (real world, on foot), or -1. */
  tubeAt(p) {
    if (!this.layout || this.realmOf(p) === 'sim') return -1;
    for (let i = 0; i < this.layout.tubes.length; i++) {
      const t = this.layout.tubes[i];
      if (Math.hypot(p.position.x - t.x, p.position.z - t.z) < TUBE_IN
        && Math.abs(p.position.y - ARCADE.y) < 1.2) return i;
    }
    return -1;
  }

  /** In the sim, is she on her own port ring? */
  onPort(p) {
    if (this.realmOf(p) !== 'sim' || !this.layout) return false;
    const t = this.layout.tubes[p.index];
    const q = this._flatPos(p);
    return !!t && Math.hypot(q.x - t.x, q.z - t.z) < TUBE_IN && Math.abs(p.position.y - ARCADE.y) < 1.2;
  }

  /** Why she cannot go in right now, as an instruction — or null. */
  _refusal(p) {
    const g = this.game;
    if (g.tournament?.active) return 'the tournament is on — come back after the round';
    if (g._sceneActive?.() || g._finaleDue) return 'wait for the story to finish';
    if (p.mount || p.rideAlong || p.pandaMount) return 'hop off first';
    return null;
  }

  /** What her prompt should say, or null. Read by `Game._updateClanPrompt`. */
  prompt(p, key) {
    if (!this.layout || !key) return null;
    const s = this.st[p.index];
    if (s?.phase && s.phase !== 'sim') return null;
    if (this.realmOf(p) === 'sim') {
      if (this.highway?.riding(p.index)) return null;
      if (this.onPort(p)) return `[${key}]  JACK OUT`;
      // The card says which button turns it; a callout under it is the same
      // words a second time, drawn on top of its last line.
      if (this.rundowns[p.index]) return null;
      if (this.canTalk(p)) {
        return p.powerOrbs?.length ? `[${key}]  RUNDOWN OF YOUR KOTODAMA` : `[${key}]  TALK TO LIONHEART`;
      }
      const st = this.stationAt(p);
      return st ? st.prompt(p, key) : null;
    }
    if (this.canTalk(p)) return `[${key}]  TRAIN WITH LIONHEART`;
    const k = this.tubeAt(p);
    if (k < 0) return null;
    if (k !== p.index) {
      const owner = this.game.players?.[k];
      return owner ? `TUBE ${k + 1} IS ${owner.name.toUpperCase()}'S — YOURS IS ${p.index + 1}`
        : `YOUR TUBE IS NUMBER ${p.index + 1}`;
    }
    return `[${key}]  JACK IN`;
  }

  /**
   * She pressed INTERACT. Returns true when the arcade answered it — and it
   * always answers in words when it says no (non-negotiable 6).
   */
  interact(p) {
    if (!this.layout || !p) return false;
    const g = this.game;
    const s = this.st[p.index];
    if (s?.phase && s.phase !== 'sim') return false;
    if (this.realmOf(p) === 'sim') {
      // Swallowed, not refused: a press mid-ride is her hand still on the
      // button she rode off with, and it must not reach anything else.
      if (this.highway?.riding(p.index)) return true;
      if (this.onPort(p)) { this._begin(p, 'derez'); return true; }
      const rd = this.rundowns[p.index];
      if (rd) {
        if (!rd.next()) this._closeRundown(p);
        return true;
      }
      if (this.canTalk(p)) {
        if (p.powerOrbs?.length) this._openRundown(p);
        else this.holoSay(LION_LINES.islands, 8);
        g.sfx?.('menu');
        return true;
      }
      const st = this.stationAt(p);
      if (st) {
        st.interact(p);
        g.sfx?.('menu');
        return true;
      }
      return false;
    }
    const talk = this.canTalk(p);
    const k = this.tubeAt(p);
    if (!talk && k < 0) return false;
    const why = this._refusal(p);
    if (why) {
      g.sfx?.('deny');
      g.toast?.(`${p.name} — ${why}`, p.index);
      return true;
    }
    if (talk) {
      this.say(LION_LINES.send.replace('%n', p.name).replace('%t', String(p.index + 1)), 5);
      g.sfx?.('menu');
      this._begin(p, 'walk');
      return true;
    }
    if (k !== p.index) {
      g.sfx?.('deny');
      g.toast?.(`${p.name} — your tube is number ${p.index + 1}`, p.index);
      return true;
    }
    this._begin(p, 'rise');
    return true;
  }

  /* ----------------------------- the sequence ----------------------------- */

  _begin(p, phase) {
    const i = p.index;
    const s = (this.st[i] ??= { phase: null, t: 0 });
    s.phase = phase;
    s.t = 0;
    const tube = this.layout.tubes[i];
    s.base = new THREE.Vector3(tube.x, ARCADE.y, tube.z);
    if (phase === 'rise') {
      this._ensureSim();
      p.pinnedAt = p.position.clone();
      s.from = p.position.clone();
      this.game.sfx?.('visor');
      this._wearVisor(p, true);
    }
    if (phase === 'derez') {
      const port = toSim(tube.x, tube.z);
      s.from = p.position.clone();
      s.to = new THREE.Vector3(port.x, ARCADE.y + FLOAT_H, port.z);
      p.pinnedAt = p.position.clone();
      this.game.sfx?.('jackout');
    }
  }

  /** Build the simulator the first time anybody goes in, under the rain. */
  _ensureSim() {
    if (this.sim) return;
    const g = this.game;
    const dc = g.world.dojoCentre;
    this.sim = new SimWorld(g.scene, {
      dojo: { x: dc.x, y: dc.y, z: dc.z },
      arcade: ARCADE,
      ports: this.layout.tubes,
    });
    this.sim.onFall = (p) => this._onFall(p);
    /* THE REAL MATHDOJO, a second time, on the holo-Dojo's floor. Its own
       instance so the two circles each follow their own kittens — a sister
       walking the real circle must not steer the angle in here. */
    const c = new THREE.Vector3(dc.x + SIM.dx, dc.y, dc.z + SIM.dz);
    this.simDojo = new MathDojo(g.scene, c, { compact: !!g.device?.touchPrimary });
    // Holographic: the dark floor goes glassy so the grid deck shows through.
    this.simDojo.group.traverse((o) => {
      if (o.isMesh && o.material?.color && o.material.opacity === 0.88) {
        o.material.color.set(0x05202c);
        o.material.opacity = 0.55;
      }
    });
    this._buildHoloLion();
    this.shards = new Shards(this.sim.root);
    this.simHud = makeSimHud(g, this);
    /* THE TRAINING ISLANDS, raised with the layer — under the rain, on the
       first jack-in, like the rest of it. */
    this.isles = {};
    this.highway = new DataHighway(this);
    for (const key of ['gallery', 'hall', 'range', 'kata', 'storm', 'sine', 'sentries', 'bamboo']) {
      this.isles[key] = this._raiseIsland(key);
    }
    this.gallery = new Gallery(this, this.isles.gallery);
    this.hall = new TrialHall(this, this.isles.hall);
    this.range = new TameshigiriRange(this, this.isles.range);
    this.kata = new KataHall(this, this.isles.kata);
    this.storm = new KudamonoStorm(this, this.isles.storm);
    this.sine = new SineGauntlet(this, this.isles.sine);
    this.sentries = new HoloSentries(this, this.isles.sentries);
    this.bamboo = new BambooInfiltration(this, this.isles.bamboo);
    this.stations = [...this.gallery.stations, ...this.hall.stations,
      ...this.range.stations, ...this.kata.stations,
      ...this.storm.stations, ...this.sine.stations,
      ...this.sentries.stations, ...this.bamboo.stations, ...this.highway.stations];
  }

  /**
   * One island off the holo-Dojo: its deck, a data bridge from the Dojo's
   * rim, and its name over it. Returns where it is, in the layer, with `fwd`
   * pointing from the bridge across the island.
   */
  _raiseIsland(key) {
    const spec = ISLANDS[key];
    const dc = this.game.world.dojoCentre;
    const c = islandCentre(dc, this.layout.u, spec);
    const seed = [...key].reduce((a, ch) => a + ch.charCodeAt(0), 0);
    this.sim.addDisc({ x: c.x, z: c.z, r: spec.r, y: c.y, name: key, grid: 2, seed });
    const from = { x: dc.x + c.dir.x * 47, z: dc.z + c.dir.z * 47, y: dc.y };
    const to = { x: c.x - c.dir.x * (spec.r - 2), z: c.z - c.dir.z * (spec.r - 2), y: c.y };
    // The far islands are a DATA HIGHWAY instead — still a walkable bridge,
    // with a light cycle at each end (highway.js).
    if (spec.cycle) this.highway.add(key, spec.name, from, to);
    else this.sim.addBridge(from, to, { wobble: 3, waves: 1, name: `${key} bridge` });
    this.sim.addSign(c.x + c.dir.x * (spec.r - 2), c.y + 12, c.z + c.dir.z * (spec.r - 2), spec.kanji, spec.name);
    return { key, x: c.x, y: c.y, z: c.z, r: spec.r, fwd: c.dir };
  }

  /** Lionheart, in light, at his own spot on the port. */
  _buildHoloLion() {
    const art = this.lionArt;
    if (!art) return;
    const L = this.layout;
    const p = toSim(L.lion.x, L.lion.z);
    const quad = LION_HEIGHT / (art.contentScale || 1);
    const b = new Billboard(art.texture, {
      cols: 1, rows: 1, width: quad, height: quad, footOffset: (art.pad ?? 0) * quad, mirror: false,
    });
    b.mat.color.set(0x9ff6ff);
    b.mat.transparent = true;
    b.mat.opacity = 0.85;
    this.holoLion = new THREE.Group();
    this.holoLion.position.set(p.x, ARCADE.y, p.z);
    this.holoLion.add(b);
    this.holoLionSprite = b;
    /* HIS OWN BUBBLES. The real Lionheart's hang off the real Lionheart, in a
       reality nobody in here can see — so everything he says in the sim is
       said by the hologram. Stage one said its welcome to the wrong one. */
    this.holoBubbles = new Map();
    this.holoShow = 0;
    this.game.scene.add(this.holoLion);
    this.sim.solids.push({ x: L.lion.x, z: L.lion.z, r: 1.25 });
  }

  /** Move her (and her camera) across the boundary, by exactly the offset. */
  _cross(p, toSimNow) {
    if (!toSimNow) this._leaveSim(p);
    const k = toSimNow ? 1 : -1;
    const dx = SIM.dx * k;
    const dz = SIM.dz * k;
    p.position.x += dx; p.position.z += dz;
    p.camTarget.x += dx; p.camTarget.z += dz;
    p.camera.position.x += dx; p.camera.position.z += dz;
    if (p.pinnedAt) { p.pinnedAt.x += dx; p.pinnedAt.z += dz; }
    p.group.position.copy(p.position);
    p.realm = toSimNow ? 'sim' : null;
    /* AND A SAVE TAKEN NOW SAYS SHE IS IN HER TUBE. `castRow` reads this
       before `position`, so nobody ever loads a game standing in the void. */
    const s = this.st[p.index];
    p.dreamAnchor = toSimNow ? s.anchor.clone() : null;
    s.proxy = null;
    if (toSimNow) {
      this.refillSim(p);
      /* THE INVITATION, ONCE A VISIT. A kitten wearing orbs is told there is
         a rundown; she is never put through one she did not ask for. */
      if (p.powerOrbs?.length) {
        this.holoSay(LION_LINES.rundown.replace('%n', p.name).replace('%k', String(p.powerOrbs.length)), 8);
      }
    }
  }

  _onFall(p) {
    const s = this.st[p.index];
    if (!s) return;
    // A short re-rez on her ring, so falling off reads as the sim catching her.
    s.rezT = 0;
    this.game.sfx?.('rez');
    this.game.toast?.(`${p.name} fell out of the simulation — back to your ring!`, p.index);
  }

  /** Pull everybody out at once — a scene, the tournament, the ending. */
  exitAll() {
    for (const p of this.game.players ?? []) {
      if (!p) continue;
      const s = this.st[p.index];
      if (!s?.phase) continue;
      if (this.realmOf(p) === 'sim') {
        const tube = this.layout.tubes[p.index];
        p.position.set(tube.x + SIM.dx, ARCADE.y, tube.z + SIM.dz);
        this._cross(p, false);
        p.camTarget.copy(p.position);
      }
      p.pinnedAt = null;
      this._wearVisor(p, false);
      this._hidePuppet(p);
      this._rezOff(p);
      s.phase = null;
      s.fx = 0;
    }
  }

  /** A new afternoon: everybody out, and nothing remembered. */
  reset() {
    this.exitAll();
    for (let i = 0; i < this.st.length; i++) this.drop(i);
    this.st = [];
    this._welcomed = false;
    this.sayText = null;
  }

  /** Forget a kitten who has left the game. */
  drop(i) {
    const s = this.st[i];
    if (!s) return;
    const p = this.game.players?.[i];
    if (p && this.realmOf(p) === 'sim') this._leaveSim(p);
    s.puppet?.removeFromParent();
    s.visor?.removeFromParent();
    this.st[i] = null;
  }

  update(dt) {
    if (!this.built) return;
    const g = this.game;
    this.t += dt;
    const ease = (x) => x * x * (3 - 2 * x);

    /* FIRST: is anything taking the whole screen? Then nobody stays inside —
       a scene that frames "the kittens" must find them in the real world,
       and the tournament must find every fighter on its own island. */
    const pull = g._sceneActive?.() || g.tournament?.active || g.travel || g._finaleDue;
    if (pull && this.busy) this.exitAll();

    for (const p of g.players ?? []) {
      if (!p) continue;
      const s = this.st[p.index];
      if (!s?.phase) continue;
      s.t += dt;
      const tube = this.layout.tubes[p.index];
      s.anchor ??= new THREE.Vector3();
      s.anchor.set(tube.x, ARCADE.y + FLOAT_H, tube.z);
      switch (s.phase) {
        case 'walk': {
          /* THE WALK IS HER OWN LEGS on a pad that points at her tube. A
             kitten driven to a spot by setting her position would slide; this
             way she walks, turns and climbs the step like she always does. */
          const dx = tube.x - p.position.x;
          const dz = tube.z - p.position.z;
          const d = Math.hypot(dx, dz);
          const own = g.input?.players?.[p.index];
          if (own && Math.hypot(own.mx ?? 0, own.my ?? 0) > 0.6 && s.t > 0.4) {
            // She took the stick back. Fine — the tube will wait.
            s.phase = null;
            s.walkPad = null;
            break;
          }
          if (d < 0.35 || s.t > SEQ.walkMax) {
            if (s.t > SEQ.walkMax) p.position.set(tube.x, ARCADE.y, tube.z);
            s.walkPad = null;
            this._begin(p, 'rise');
            break;
          }
          const { fwd, right } = p._basis();
          const wx = dx / d;
          const wz = dz / d;
          const slow = Math.min(1, d / 1.2);
          s.walkPad = {
            mx: (wx * right.x + wz * right.z) * slow,
            my: -(wx * fwd.x + wz * fwd.z) * slow,
            down: () => false, pressed: () => false,
          };
          break;
        }
        case 'rise': {
          const k = ease(Math.min(1, s.t / SEQ.rise));
          // Drawn into the middle of the tube as she rises.
          p.pinnedAt.set(
            THREE.MathUtils.lerp(s.from.x, tube.x, Math.min(1, s.t / 0.5)),
            ARCADE.y + FLOAT_H * k,
            THREE.MathUtils.lerp(s.from.z, tube.z, Math.min(1, s.t / 0.5))
          );
          p.facing = THREE.MathUtils.lerp(p.facing, Math.atan2(-this.layout.u.x, -this.layout.u.z), Math.min(1, dt * 4));
          s.fx = 0.3 * k;
          if (s.t >= SEQ.rise) {
            s.phase = 'jack';
            s.t = 0;
            g.sfx?.('jackin');
          }
          break;
        }
        case 'jack': {
          s.fx = 0.3 + 0.7 * ease(Math.min(1, s.t / SEQ.jack));
          if (s.t >= SEQ.jack) {
            /* THE CROSSING, at the top of the rain. Her puppet takes her place
               in the tube on this same frame, so the real world never shows an
               empty tube with a kitten-shaped gap in the story. */
            this._showPuppet(p);
            this._wearVisor(p, false);
            this._cross(p, true);
            s.phase = 'rez';
            s.t = 0;
            s.rezT = 0;
            g.sfx?.('rez');
            if (!this._welcomed) {
              this._welcomed = true;
              this.holoSay(LION_LINES.sim, 7);
            }
          }
          break;
        }
        case 'rez': {
          s.fx = 1 - ease(Math.min(1, s.t / 0.8));
          // Float down onto the ring as she resolves.
          const port = toSim(tube.x, tube.z);
          p.pinnedAt.set(port.x, ARCADE.y + FLOAT_H * (1 - ease(Math.min(1, s.t / SEQ.rez))), port.z);
          if (s.t >= SEQ.rez) {
            p.pinnedAt = null;
            s.phase = 'sim';
            s.t = 0;
            s.fx = 0;
          }
          break;
        }
        case 'sim':
          s.fx = 0;
          break;
        case 'derez': {
          const k = ease(Math.min(1, s.t / 0.5));
          p.pinnedAt.lerpVectors(s.from, s.to, k);
          s.rezT = 1 - Math.min(1, s.t / SEQ.derez);
          s.fx = ease(Math.min(1, s.t / SEQ.derez));
          if (s.t >= SEQ.derez) {
            p.position.copy(s.to);
            this._cross(p, false);
            p.pinnedAt = p.position.clone();
            this._hidePuppet(p);
            this._wearVisor(p, true);
            s.phase = 'descend';
            s.t = 0;
            s.rezT = null;
          }
          break;
        }
        case 'descend': {
          const k = ease(Math.min(1, s.t / SEQ.descend));
          p.pinnedAt.set(tube.x, ARCADE.y + FLOAT_H * (1 - k), tube.z);
          s.fx = 1 - ease(Math.min(1, s.t / 0.7));
          if (s.t >= SEQ.descend) {
            p.pinnedAt = null;
            this._wearVisor(p, false);
            g.sfx?.('visor');
            s.phase = null;
            s.fx = 0;
          }
          break;
        }
        default: break;
      }
    }

    this._updateTraining(dt);
    this._updateRez(dt);
    this._updatePuppets(dt);
    this._updateTubes(dt);
    this._updateDome(dt);
    this._updateLion(dt);
    if (this.sim) {
      this.sim.update(dt);
      const inside = (g.players ?? []).filter((p) => p && this.realmOf(p) === 'sim');
      this.simDojo?.update(dt, inside);
    }
  }

  /* ----------------------------- training -------------------------------- */

  /** The Game as a kitten in here sees it — see dream/simhud.js. */
  hudFor(p) {
    return this.realmOf(p) === 'sim' && this.simHud ? this.simHud : this.game;
  }

  /** `Game.strikePlayers`, for a kitten in the sim: holograms only. */
  onStrike(attacker, kind, reach, dir, spent = null) {
    const n = this.gate.strike(attacker, kind, reach, dir, spent);
    /* EVERY SWING, EVEN ONE THAT FOUND NOTHING — a kata's CUT is the swing
       on the beat, and the range's ONE SWING counts what one call reached. */
    const d = this.drills[attacker.index];
    if (d?.state === 'live') d.spec.swing?.(d, kind, n, this.gate.swing);
    return n;
  }

  simKittens() {
    return (this.game.players ?? []).filter((p) => p && this.realmOf(p) === 'sim');
  }

  /** Her button for an action, the way her callout prints it. */
  key(p, action) {
    return this.game.input?.promptFor?.(p.index, action) ?? action.toUpperCase();
  }

  /** A kitten's drawing for a holo-kitten to wear — anybody's will do. */
  kittenSpec() {
    for (const p of this.game.players ?? []) if (p?.spriteSpec?.texture) return p.spriteSpec;
    return null;
  }

  /** A drill telling her how — throttled, so a held button is one toast. */
  hint(p, text) {
    const last = this._hintAt.get(p.index) ?? -99;
    if (this.t - last < 1.8) return;
    this._hintAt.set(p.index, this.t);
    this.game.toast?.(`${p.name} — ${text}`, p.index);
  }

  /** Her station, if she is standing on one.
   *
   *  NONE WHILE HER DRILL IS RUNNING. INTERACT is the drill's button then —
   *  it is the clan power, the dive, the Flash Step — and the Windwhisker
   *  trial's holo-kittens stand a breath away from the shrine she started it
   *  at, so a station that still answered would restart the trial on the
   *  very press it was teaching. Once the drill has ended, she can go again. */
  stationAt(p) {
    if (this.realmOf(p) !== 'sim') return null;
    const dr = this.drills[p.index];
    if (dr && (dr.state === 'ready' || dr.state === 'live')) return null;
    const q = this._flatPos(p);
    for (const st of this.stations) {
      if (Math.hypot(q.x - st.x, q.z - st.z) < st.r && Math.abs(p.position.y - st.y) < 2) return st;
    }
    return null;
  }

  /**
   * LEND HER ORBS, for as long as she is in here.
   *
   * THE LOAN NEVER TOUCHES `powerOrbs`. It is folded into `p.power` (every
   * buff reads that) and into the worn ring (so she can SEE it), and
   * `powerOrbs` — what the save, the trade screen, the dealer and a 盗 steal
   * all read — is exactly what it was. `_leaveSim` puts `power` back from it.
   *
   * IT TOPS UP BY COUNT. `ids` says how many of each kind the drill wants her
   * to have; what she wears counts toward it and only the shortfall is lent.
   * Long Guard asks for a PAIR, and a kitten who owns one Nagamori is lent the
   * second — the first cut skipped any kind she owned at all, so she ran the
   * beam on one and could not pass it.
   */
  lend(p, ids) {
    const s = this.st[p.index];
    if (!s) return;
    s.loans ??= [];
    const fresh = [];
    for (const id of new Set(ids)) {
      const want = ids.filter((x) => x === id).length;
      const own = (p.powerOrbs ?? []).filter((x) => x === id).length;
      let have = own + s.loans.filter((x) => x === id).length;
      while (have < want) { s.loans.push(id); have++; fresh.push(id); }
    }
    this._applyKit(p, true);
    if (fresh.length) {
      const names = [...new Set(fresh)].map((id) => ORB_BY_ID[id]?.name ?? id).join(', ');
      this.game.toast?.(`${p.name} borrowed ${names} — only in the simulator`, p.index);
      this.game.sfx?.('powerorb');
    }
  }

  /** `p.power` and the worn ring, from her real orbs plus her loans. */
  _applyKit(p, force = false) {
    const s = this.st[p.index];
    const ids = [...(p.powerOrbs ?? []), ...(s?.loans ?? [])];
    const sig = ids.join(',');
    if (!force && s?.kitSig === sig) return;
    if (s) s.kitSig = sig;
    p.power = aggregate(ids);
    this._syncMeshes(p, ids);
  }

  /** `Game.syncOrbMeshes`, but for a list that is not `powerOrbs`. */
  _syncMeshes(p, ids) {
    if (!p.orbRoot) return;
    for (const o of p.wornOrbs ?? []) p.orbRoot.remove(o.group);
    p.wornOrbs = buildWornOrbs(ids);
    for (const o of p.wornOrbs) {
      o.setMathVisible?.(this.game.mathVisible);
      p.orbRoot.add(o.group);
    }
  }

  /**
   * SWEAR TO A CLAN, FOR AS LONG AS SHE IS IN HERE.
   *
   * Her real clan is kept on `p.dreamOath.was` — the first time only, so two
   * trial oaths in a row still remember the REAL one — and `castRow` saves
   * that, never this. Nothing the real game hangs off an oath runs: no
   * `onJoinClan`, no cheer, no panda, no quest.
   */
  swearFor(p, clan) {
    p.dreamOath ??= { was: p.clan ?? null };
    if (p.clan?.id !== clan.id) {
      p.clan = clan;
      p.clanRing?.material.color.set(clan.color);
      this.game.toast?.(`${p.name} swore to ${clan.name} — only in the simulator`, p.index);
      this.game.sfx?.('clan');
    }
  }

  /** Everything sim-only comes off her: drill, rundown, loans, oath, bar. */
  _leaveSim(p) {
    const s = this.st[p.index];
    this.highway?.stop(p);
    const d = this.drills[p.index];
    if (d) { d.dispose(); this.drills[p.index] = null; }
    this._closeRundown(p);
    if (s) { s.loans = []; s.kitSig = null; }
    p.power = aggregate(p.powerOrbs ?? []);
    if (this.game.syncOrbMeshes) this.game.syncOrbMeshes(p);
    else this._syncMeshes(p, p.powerOrbs ?? []);
    if (p.dreamOath) {
      p.clan = p.dreamOath.was;
      p.dreamOath = null;
      p.clanRing?.material.color.set(p.clan?.color ?? p.style?.colour ?? 0xffffff);
    }
    // A mark on a hologram means nothing out there.
    if (p.stealTarget && !this.game.players?.includes(p.stealTarget)) p._endMark?.(null);
    s?.bar?.removeFromParent();
  }

  startDrill(p, spec, at) {
    this._closeRundown(p);
    const old = this.drills[p.index];
    if (old) old.dispose();
    this.drills[p.index] = new Drill(this, p, spec, at);
  }

  /** Write a result down — returns what changed, for the card. */
  award(p, id, stars, score, lowerIsBetter) {
    return this.progress.award(p.style?.name ?? p.name, id, stars, score, { lowerIsBetter });
  }

  _openRundown(p) {
    this._closeRundown(p);
    this.rundowns[p.index] = new Rundown(this, p);
  }

  _closeRundown(p) {
    const r = this.rundowns[p.index];
    if (!r) return;
    r.dispose();
    this.rundowns[p.index] = null;
    this.progress.setFlag(p.style?.name ?? p.name, 'rundown');
  }

  /* --- the SIM bar --- */

  simMax(p) { return p.power?.hp ?? 100; }

  simFrac(p) {
    const s = this.st[p.index];
    return s ? Math.max(0, s.simHp ?? this.simMax(p)) / this.simMax(p) : 1;
  }

  refillSim(p) {
    const s = this.st[p.index];
    if (!s) return;
    s.simHp = this.simMax(p);
    s.iframes = 0;
  }

  /**
   * A hologram hit her. NOT `hurt` — her health is the ring's and this is not
   * the ring. Same order of questions `hurt` asks, though, so the lesson is
   * the real one: a Flash Step is untouchable, a Ward blocks (and a blow
   * costs the Ward exactly what it costs in the arena, through her own
   * `_wardTakeHit`), and a fresh hit is followed by a moment of grace.
   *
   * @returns {'none'|'dodged'|'blocked'|'immune'|'hit'}
   */
  simHit(p, { dmg = 10, push = null, src = 'laser', hold = false } = {}) {
    const s = this.st[p.index];
    if (!s || this.realmOf(p) !== 'sim') return 'none';
    if (p.dodgeAt) return 'dodged';
    if (p.warded) {
      // A held beam is blocked by the bubble being UP; it does not break it.
      if (hold) p.wardFlash = 0.25;
      else p._wardTakeHit?.(this.simHud);
      return 'blocked';
    }
    if ((s.iframes ?? 0) > 0) return 'immune';
    s.simHp = (s.simHp ?? this.simMax(p)) - dmg;
    s.iframes = 0.6;
    p.flashT = 0.3;
    /* A NUDGE, NOT A THROW. Six units a second and a hop: enough that walking
       into a wall of light reads as being stopped by it, and far short of
       what would carry a kitten off an island from anywhere on its floor. */
    if (push) {
      p.velocity.x = push.x * 6;
      p.velocity.z = push.z * 6;
      p.velocity.y = Math.max(p.velocity.y, 3);
    }
    this.game.sfx?.('hit');
    if (s.simHp <= 0) this._simCatch(p);
    return 'hit';
  }

  /** Her bar ran out: the simulator catches her, and what she was doing stops. */
  _simCatch(p) {
    const d = this.drills[p.index];
    if (d && (d.state === 'live' || d.state === 'ready')) d.fail('SIM bar empty — the simulator caught you');
    this.refillSim(p);
    const s = this.st[p.index];
    s.rezT = 0;
    this.game.sfx?.('rez');
  }

  _updateTraining(dt) {
    this.shards?.update(dt);
    for (const p of this.game.players ?? []) {
      if (!p) continue;
      const s = this.st[p.index];
      const inside = this.realmOf(p) === 'sim';
      if (!s || !inside) continue;
      s.iframes = Math.max(0, (s.iframes ?? 0) - dt);
      // Her real orbs can change in here (the profile's INVENTORY tab).
      this._applyKit(p);
      const d = this.drills[p.index];
      if (d && !d.update(dt)) { d.dispose(); this.drills[p.index] = null; }
      const r = this.rundowns[p.index];
      if (r && !this.canTalk(p)) this._closeRundown(p);
      // The bar shows when it is not full, or while a drill could take it.
      const max = this.simMax(p);
      s.simHp = Math.min(s.simHp ?? max, max);
      const show = s.simHp < max - 0.5 || !!this.drills[p.index]?.lasers.length || !!this.drills[p.index]?.bolts.length;
      if (show && !s.bar) {
        s.bar = new SimBar({ w: 2.4, h: 0.24 });
        s.bar.position.y = (p.height ?? 2.6) + 1.2;
      }
      if (s.bar) {
        if (show && !s.bar.parent) p.group.add(s.bar);
        if (!show && s.bar.parent) s.bar.removeFromParent();
        s.bar.setFrac(s.simHp / max, dt);
      }
      // A slow refill when nothing is trying to hit her.
      if (!this.drills[p.index] && s.simHp < max) s.simHp = Math.min(max, s.simHp + dt * 12);
    }
  }

  /* --------------------------- the look of her ---------------------------- */

  /** The headset on her own head, for the rise and the descent. */
  _wearVisor(p, on) {
    const s = this.st[p.index];
    if (!s) return;
    if (on && !s.visor) {
      s.visor = new THREE.Mesh(
        new THREE.PlaneGeometry(1.25, 0.47),
        new THREE.MeshBasicMaterial({ map: this.visorTex, transparent: true, depthWrite: false, toneMapped: false })
      );
      s.visor.renderOrder = 9;
    }
    if (!s.visor) return;
    if (on) p.group.add(s.visor);
    else s.visor.removeFromParent();
  }

  /** The kitten in the tube while she is in there: her own sheet, her own
   *  pose, a frame behind her. */
  _showPuppet(p) {
    const s = this.st[p.index];
    if (!s.puppet) {
      const spec = p.spriteSpec;
      if (!spec) return;
      const b = new Billboard(spec.texture, spec.opts);
      b.mat.color.copy(p.sprite.mat.color);
      const grp = new THREE.Group();
      grp.add(b);
      const visor = new THREE.Mesh(
        new THREE.PlaneGeometry(1.25, 0.47),
        new THREE.MeshBasicMaterial({ map: this.visorTex, transparent: true, depthWrite: false, toneMapped: false })
      );
      visor.renderOrder = 9;
      grp.add(visor);
      s.puppet = grp;
      s.puppetSprite = b;
      s.puppetVisor = visor;
    }
    this.game.scene.add(s.puppet);
    s.puppet.visible = true;
  }

  _hidePuppet(p) {
    const s = this.st[p.index];
    if (s?.puppet) s.puppet.visible = false;
  }

  _updatePuppets() {
    for (const p of this.game.players ?? []) {
      const s = p && this.st[p.index];
      if (!s?.puppet?.visible) continue;
      /* SHE MIRRORS WHAT SHE IS DOING IN THERE. Row and facing are the whole
         of a pose in this game (see `Billboard`), so copying the two is the
         real-world body doing her moves, a frame behind, in the tube. */
      const b = s.puppetSprite;
      b.row = p.sprite.row;
      b.facing = p.sprite.facing;
      b.mesh.scale.copy(p.sprite.mesh.scale);
      const a = s.anchor;
      s.puppet.position.set(a.x, a.y + Math.sin(this.t * 1.7 + p.index) * 0.12, a.z);
    }
  }

  /** The rez shader and the glint, laid over her own sprite mesh. */
  _rezOn(p) {
    const s = this.st[p.index];
    if (s.rez) return;
    const mesh = p.sprite.mesh;
    const tex = p.sprite.tex;
    const u = {
      map: { value: tex },
      uvTransform: { value: tex.matrix },
      uTint: { value: p.sprite.mat.color },
      uRez: { value: 0 },
      uTime: { value: 0 },
    };
    const rez = new THREE.Mesh(mesh.geometry, new THREE.ShaderMaterial({
      vertexShader: SPRITE_VERT, fragmentShader: REZ_FRAG, uniforms: u,
      transparent: false, side: THREE.DoubleSide,
    }));
    const glint = new THREE.Mesh(mesh.geometry, new THREE.ShaderMaterial({
      vertexShader: SPRITE_VERT, fragmentShader: GLINT_FRAG, uniforms: u,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    glint.renderOrder = 3;
    mesh.add(rez);
    mesh.add(glint);
    s.rez = { rez, glint, u };
  }

  _rezOff(p) {
    const s = this.st[p.index];
    if (!s?.rez) return;
    s.rez.rez.removeFromParent();
    s.rez.glint.removeFromParent();
    s.rez = null;
    p.sprite.mat.visible = true;
  }

  _updateRez(dt) {
    for (const p of this.game.players ?? []) {
      const s = p && this.st[p.index];
      if (!s) continue;
      const inside = this.realmOf(p) === 'sim';
      if (!inside) { if (s.rez) this._rezOff(p); continue; }
      this._rezOn(p);
      if (s.rezT != null) s.rezT = s.phase === 'derez' ? s.rezT : Math.min(1, s.rezT + dt / SEQ.rez);
      const r = s.rezT ?? 1;
      s.rez.u.uRez.value = r;
      s.rez.u.uTime.value = this.t;
      /* WHILE SHE IS RESOLVING, the shader IS her: her own material steps
         aside so the half of her not yet drawn is genuinely not there. */
      const resolving = r < 0.999;
      s.rez.rez.visible = resolving;
      p.sprite.mat.visible = !resolving;
      s.rez.glint.visible = !resolving;
      if (!resolving && s.phase === 'sim') s.rezT = null;
    }
  }

  /* -------------------------------- props --------------------------------- */

  _updateTubes() {
    if (!this.tubeU) return;
    this.tubeU.forEach((u, i) => {
      u.uTime.value = this.t;
      const s = this.st[i];
      const busy = !!(s?.phase && s.phase !== 'walk');
      const p = this.game.players?.[i];
      u.uGlow.value += ((busy ? 1 : (p && s?.phase === 'walk' ? 0.5 : 0)) - u.uGlow.value) * 0.08;
      if (p?.style?.colour != null) u.uColor.value.set(busy || s?.phase === 'walk' ? p.style.colour : HOLO.cyan);
    });
  }

  /**
   * THE DOME KEEPS ANIMALS OUT. Every dragon, every panda and Ryuuseki is
   * pushed back outside it, every frame, after they have all moved. A kitten
   * riding one is turned away with them and told what to do instead — "a
   * refusal must say so" — and her panda, if it was following her in, waits
   * at the edge, which is a pet that cannot be lost because it is right there.
   */
  _updateDome(dt) {
    const g = this.game;
    this.domeU.uTime.value = this.t;
    this._domeHit = Math.max(0, this._domeHit - dt * 1.5);
    const R = DOME_R + 1.5;
    const push = (body, rider) => {
      const pos = body?.position;
      if (!pos) return;
      if (pos.y > ARCADE.y + DOME_R + 4 || pos.y < ARCADE.y - 12) return;
      const dx = pos.x - ARCADE.x;
      const dz = pos.z - ARCADE.z;
      const d = Math.hypot(dx, dz);
      if (d >= R) return;
      const k = d > 1e-3 ? R / d : 0;
      pos.x = ARCADE.x + (k ? dx * k : R);
      pos.z = ARCADE.z + (k ? dz * k : 0);
      body.group?.position.copy?.(pos);
      this._domeHit = 1;
      if (rider) {
        const last = this._toastAt.get(rider) ?? -99;
        if (this.t - last > 4) {
          this._toastAt.set(rider, this.t);
          g.sfx?.('deny');
          g.toast?.(`${rider.name} — Lionheart's dome keeps animals out. Land on the Dojo and hop across the stones!`, rider.index);
        }
      }
    };
    for (const d of g.dragons ?? []) push(d, d.rider ?? null);
    if (g.ryu) push(g.ryu, (g.players ?? []).find((p) => p && (p.mount === g.ryu || p.rideAlong === g.ryu)) ?? null);
    for (const p of g.players ?? []) {
      if (!p?.panda) continue;
      push(p.panda, p.pandaMount ? p : null);
      // ...and a kitten riding it is carried with it.
      if (p.pandaMount) { p.position.x = p.panda.position.x; p.position.z = p.panda.position.z; }
    }
    this.domeU.uHit.value = this._domeHit;
  }

  _updateLion(dt) {
    if (!this.lion) return;
    const g = this.game;
    const s = this.lionSprite;
    if (s) {
      s.mesh.scale.set(1 - Math.sin(this.t * 1.6) * 0.012, 1 + Math.sin(this.t * 1.6) * 0.016, 1);
    }
    if (this.holoLionSprite) {
      const flick = Math.sin(this.t * 37) > 0.93 ? 0.4 : 0.85;
      this.holoLionSprite.mat.opacity = flick;
      this.holoLionSprite.mesh.scale.copy(s?.mesh.scale ?? this.holoLionSprite.mesh.scale);
    }
    /* WHAT HE SAYS: whatever he was last asked, for a while; otherwise his
       invitation to anybody close enough to read it — and the HONOR teaser
       once a kitten has been in, because it means something only then. */
    let near = false;
    for (const p of g.players ?? []) {
      if (!p || this.realmOf(p) === 'sim') continue;
      if (Math.hypot(p.position.x - this.lion.position.x, p.position.z - this.lion.position.z) < 26) near = true;
    }
    let text = null;
    if (this.sayText && this.t < this.sayUntil) text = this.sayText;
    else if (near) text = this._welcomed && Math.floor(this.t / 9) % 2 ? LION_LINES.honor : LION_LINES.idle;
    const want = text ? this._bubble(text) : null;
    this.bubbleShow += ((want ? 1 : 0) - this.bubbleShow) * Math.min(1, dt * 5);
    for (const [, m] of this.bubbles) {
      const on = m === want || (m === this._lastBubble && !want);
      m.visible = on && this.bubbleShow > 0.02;
      m.material.opacity = this.bubbleShow;
      m.position.y = LION_HEIGHT * 0.9 - (m.userData.tipY ?? 0) + Math.sin(this.t * 1.5) * 0.15;
    }
    if (want) this._lastBubble = want;

    /* THE HOLOGRAM'S OWN LINES: whatever it was last asked to say, else the
       pitch to anybody standing near it in here. */
    if (this.holoLion) {
      let nearSim = false;
      for (const p of this.simKittens()) {
        const q = this._flatPos(p);
        if (Math.hypot(q.x - this.layout.lion.x, q.z - this.layout.lion.z) < 20) nearSim = true;
      }
      let ht = null;
      if (this.holoText && this.t < this.holoUntil) ht = this.holoText;
      // Quiet while he is giving a rundown: the card IS him talking, and a
      // bubble beside it lands on top of it in a quarter pane.
      else if (nearSim && !this.rundowns.some(Boolean)) ht = Math.floor(this.t / 9) % 2 ? LION_LINES.simIdle : LION_LINES.islands;
      const hw = ht ? this._bubble(ht, true) : null;
      this.holoShow += ((hw ? 1 : 0) - this.holoShow) * Math.min(1, dt * 5);
      for (const [, m] of this.holoBubbles) {
        const on = m === hw || (m === this._lastHolo && !hw);
        m.visible = on && this.holoShow > 0.02;
        m.material.opacity = this.holoShow * 0.92;
        m.position.y = LION_HEIGHT * 0.9 - (m.userData.tipY ?? 0) + Math.sin(this.t * 1.5) * 0.15;
      }
      if (hw) this._lastHolo = hw;
    }
  }

  /* ------------------------------ rendering ------------------------------- */

  /** Every billboard the arcade owns, turned to this lens. */
  faceCamera(camera) {
    if (!this.built) return;
    this.lionSprite?.faceCamera(camera);
    this.holoLionSprite?.faceCamera(camera);
    _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    _right.y = 0;
    if (_right.lengthSq() > 1e-6) _right.normalize();
    for (const [, b] of this.bubbles ?? []) {
      if (!b.visible) continue;
      b.quaternion.copy(camera.quaternion);
      const off = 1.4 + (b.userData.w ?? 4) * 0.5;
      b.position.x = _right.x * off;
      b.position.z = _right.z * off;
    }
    this.sign?.quaternion.copy(camera.quaternion);
    if (this.sign) {
      // Only ever turn about Y — a sign that tips back is a sign on a hinge.
      _e.setFromQuaternion(camera.quaternion, 'YXZ');
      this.sign.rotation.set(0, _e.y, 0);
    }
    for (const t of this.tubeMats ?? []) t.num.quaternion.copy(camera.quaternion);
    const head = (p, grp, visor) => {
      // In front of her face, toward this lens, at her eyes.
      _toCam.set(camera.position.x - grp.position.x, 0, camera.position.z - grp.position.z);
      if (_toCam.lengthSq() > 1e-6) _toCam.normalize();
      visor.position.set(_toCam.x * 0.35, (p.height ?? 3) * VISOR_Y, _toCam.z * 0.35);
      visor.quaternion.copy(camera.quaternion);
    };
    for (const p of this.game.players ?? []) {
      const s = p && this.st[p.index];
      if (!s) continue;
      if (s.puppet?.visible) {
        s.puppetSprite.faceCamera(camera);
        head(p, s.puppet, s.puppetVisor);
      }
      if (s.visor?.parent) head(p, p.group, s.visor);
    }
    this.simDojo?.faceCamera?.(camera);
    if (this.sim && camera.position.x > SIM.dx * 0.5) {
      this.sim.faceCamera(camera);
      this.gallery?.faceCamera(camera);
      this.hall?.faceCamera(camera);
      this.range?.faceCamera(camera);
      this.kata?.faceCamera(camera);
      this.storm?.faceCamera(camera);
      this.sine?.faceCamera(camera);
      this.sentries?.faceCamera(camera);
      this.bamboo?.faceCamera(camera);
      this.highway?.faceCamera(camera);
      for (const d of this.drills) d?.faceCamera(camera);
      for (const r of this.rundowns) r?.faceCamera(camera);
      for (const s of this.st) s?.bar?.faceCamera(camera);
      for (const [, m] of this.holoBubbles ?? []) {
        if (!m.visible) continue;
        m.quaternion.copy(camera.quaternion);
        const off = 1.4 + (m.userData.w ?? 4) * 0.5;
        m.position.x = _right.x * off;
        m.position.z = _right.z * off;
      }
    }
  }

  /** How strong the phase is in a pane — the strongest of its kittens. */
  fxFor(members) {
    let f = 0;
    for (const i of members ?? []) f = Math.max(f, this.st[i]?.fx ?? 0);
    return f;
  }

  /** Lay the phase over a pane that has just been drawn. */
  drawPaneFx(renderer, members, w, h) {
    const f = this.fxFor(members);
    if (f <= 0.001) return;
    if (!this._fx) {
      this._fxU = { uI: { value: 0 }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2() } };
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
        vertexShader: SCREEN_VERT, fragmentShader: RAIN_FRAG, uniforms: this._fxU,
        transparent: true, depthTest: false, depthWrite: false,
      }));
      quad.frustumCulled = false;
      this._fx = new THREE.Scene();
      this._fx.add(quad);
      this._fxCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    }
    this._fxU.uI.value = f;
    this._fxU.uTime.value = this.t;
    this._fxU.uRes.value.set(w, h);
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this._fx, this._fxCam);
    renderer.autoClear = ac;
  }
}

/** Where on her the visor sits, as a fraction of her height. Measured off the
 *  loaded atlas in the browser — see docs/notes/dreamdojo.md. */
export const VISOR_Y = 0.80;

const _right = new THREE.Vector3();
const _toCam = new THREE.Vector3();
const _e = new THREE.Euler();
