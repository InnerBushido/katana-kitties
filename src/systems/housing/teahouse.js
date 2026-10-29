import * as THREE from 'three';
import { paint, toonVertexMat } from '../../core/gfx.js';
import { mergeParts } from '../../world/build.js';

/* ---------------------------------------------------------------------------
   THE TEAHOUSE WORKS LIKE A HOUSE. Richard, Oct 2026: "a camera zoom on its
   front (smaller radius); a smaller, less aggressive x-ray; a tea ceremony
   with special music, where players sit in seiza and drink tea together for
   20-30 seconds; remove the collider that keeps her out, and add colliders on
   the walls, floor and steps; maybe make it bigger."

   It was a disc of SOLID 2.4 round a 6-tall model, so she could not go in.
   Now it is 8 tall (a third bigger: four kittens kneel on its tatami) and
   it is the model's own walls, floor and step, MEASURED off the GLB —
   `open-front-teahouse-c7dd18`, 4 x 3.83 x 4 m, its open street side on +z.
   Every number below is read off the file scaled to h 6 (the old catalogue
   size), by listing its up-facing and side-facing triangles; `teaK` scales
   them to the size it is drawn at. Reasoned numbers for a model have been
   wrong roughly every time in this project.
--------------------------------------------------------------------------- */

/** The catalogue height it is drawn at; the measurements are at MEASURED_H. */
export const TEA_H = 8;
const MEASURED_H = 6;
/** The measured numbers' scale at look size `s`. */
export const teaK = (s = 1) => (TEA_H * s) / MEASURED_H;

export const TEA = {
  /** The tatami platform: its top, and its extent. */
  floor: { y: 0.6, x0: -3.14, x1: 3.14, z0: -2.43, z1: 2.26 },
  /** The one step up to it, in front of the open side. */
  step: { y: 0.31, x0: -1.19, x1: 1.19, z0: 2.26, z1: 2.96 },
  /** The walls' inside faces, as segments: the plaster back, the closed
   *  left side, and the right side's back half (its front half is open). */
  walls: [[[-2.95, -2.24], [2.95, -2.24]], [[-2.95, -2.24], [-2.95, 2.26]], [[2.95, -2.24], [2.95, 0.30]]],
  wallTop: 3.67,
  /** The timber counter against the back wall, left. */
  counter: { x0: -2.95, x1: -0.14, z0: -1.52, z1: -0.86, y1: 1.32 },
  /** The sunken irori, back right — nobody kneels in the fire. */
  irori: { x: 1.72, z: -1.7, r: 0.6 },
  /** The two front posts on the open side. */
  posts: [[-2.98, 2.3], [2.98, 2.3]],
  /** Where four kittens kneel, and the tray between them they face. */
  seats: [[-1.75, 0.75], [-0.55, 1.3], [0.75, 1.3], [1.95, 0.55]],
  tray: [0.1, -0.25],
};

/**
 * HER TEA, DRAWN: 32 frames, 8 x 4, cut from one video of her by
 * tools/capture/tea-sheet.mjs. `seg` is which cells are which beat — the
 * turn from side-on seiza to facing you, the reach and lift, a sip that plays
 * forward and back, the bowl going down, and the prayer — and the only thing
 * the game knows about the sheet (activities.js `teaFrame`).
 */
export const TEA_SHEET = {
  cols: 8, rows: 4,
  /** The master's cell (docs/art-masters/<s>_tea.png) and the shipped one (sprite-bake `to`). */
  master: 512, ship: 192,
  seg: { turn: [0, 6], pick: [6, 14], sip: [14, 22], down: [22, 28], pray: [28, 32] },
};

/** How long the ceremony runs, and its beats (activities.js `_tea`). */
export const TEA_T = { join: 6, whisk: 6, sip: 4, bow: 4 };
/** The ceremony is 26s however many kneel: the sips share TEA_T.sip * 4 between them. */
export const TEA_LEN = TEA_T.whisk + TEA_T.sip * 4 + TEA_T.bow;
export const sipLen = (n) => (TEA_T.sip * 4) / Math.max(1, Math.min(4, n));

/**
 * THE DRINK, BEAT BY BEAT, for one kitten with the sheet (seconds). Richard:
 * "a repeated animation of her drinking from the cup 5 - 10x's". They all
 * drink TOGETHER now — the sips used to be taken in turns, 4 seconds each
 * with four kneeling, and four seconds holds one sip, not five. Each kitten
 * starts `stagger` after the one on her right, so four of them are four
 * people and not one drawing four times; `turnBack` is the bow's, the turn
 * played backwards while her bowl goes back to the tray.
 */
export const TEA_ANIM = { stagger: 0.35, turn: 1.2, pick: 2.0, sip: 1.4, down: 1.5, pray: 1.0, turnBack: 1.2, sips: [5, 10] };
const DRINK_FIXED = TEA_ANIM.turn + TEA_ANIM.pick + TEA_ANIM.down + TEA_ANIM.pray;
/** How many sips fit in the drinking time, for the last of four to kneel. */
export const teaSips = () => {
  const room = TEA_T.sip * 4 - TEA_ANIM.stagger * 3 - DRINK_FIXED;
  return Math.max(TEA_ANIM.sips[0], Math.min(TEA_ANIM.sips[1], Math.floor(room / TEA_ANIM.sip)));
};

/**
 * Her frame `u` seconds into her drink (`TEA_SHEET.seg`), and which beat it
 * is: `wait` (seiza, side-on), `turn`, `pick`, `sip` (with `k`, which sip, and
 * `mouth`, true on the frames the bowl is at her lips), `down`, `pray` and
 * `done`. `back` > 0 is seconds into the bow, which turns her back side-on.
 * Pure, so the check walks every beat without a game.
 */
export function teaFrameAt(u, sips = teaSips(), back = -1) {
  const S = TEA_SHEET.seg, A = TEA_ANIM;
  const run = ([a, b], f) => a + Math.min(b - a - 1, Math.floor(f * (b - a)));
  if (back >= 0) {
    const f = Math.min(1, back / A.turnBack);
    return { frame: S.turn[1] - 1 - Math.min(S.turn[1] - 1, Math.floor(f * (S.turn[1] - S.turn[0]))), beat: f >= 1 ? 'seiza' : 'turnBack' };
  }
  if (u < 0) return { frame: S.turn[0], beat: 'wait' };
  let t = u;
  if (t < A.turn) return { frame: run(S.turn, t / A.turn), beat: 'turn' };
  t -= A.turn;
  if (t < A.pick) return { frame: run(S.pick, t / A.pick), beat: 'pick' };
  t -= A.pick;
  if (t < sips * A.sip) {
    const k = Math.floor(t / A.sip), p = (t - k * A.sip) / A.sip;
    // up to her lips in the first 40%, held 20%, and down again
    const f = p < 0.4 ? p / 0.4 : p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
    return { frame: run(S.sip, f), beat: 'sip', k, mouth: p >= 0.4 && p < 0.6 };
  }
  t -= sips * A.sip;
  if (t < A.down) return { frame: run(S.down, t / A.down), beat: 'down' };
  t -= A.down;
  if (t < A.pray) return { frame: run(S.pray, t / A.pray), beat: 'pray' };
  return { frame: S.pray[1] - 1, beat: 'done' };
}

/** The tray, the kettle and a bowl per seat, at the measured spots; origin at the house's. */
export function teaSet(k) {
  const parts = [];
  const at = (x, z) => [x * k, TEA.floor.y * k, z * k];
  const [tx, ty, tz] = at(...TEA.tray);
  const tray = new THREE.BoxGeometry(1.0, 0.05, 0.7);
  paint(tray, 0x3a2418);
  tray.translate(tx, ty + 0.03, tz);
  const kettle = new THREE.SphereGeometry(0.2, 10, 8);
  kettle.scale(1, 0.8, 1);
  paint(kettle, 0x2a2a2e);
  kettle.translate(tx, ty + 0.2, tz - 0.2);
  parts.push(tray, kettle);
  // a bowl for each guest, in a row on the tray; the one she drinks from is hers by seat
  const bowls = TEA.seats.map((_, i) => {
    const g = new THREE.CylinderGeometry(0.13, 0.09, 0.12, 10);
    g.translate(0, 0.06, 0);
    paint(g, 0x8fbf6a);
    const m = new THREE.Mesh(g, toonVertexMat());
    m.position.set(tx + (i - 1.5) * 0.24, ty + 0.055, tz + 0.15);
    m.userData.home = m.position.clone();
    return m;
  });
  return { set: new THREE.Mesh(mergeParts(parts), toonVertexMat()), bowls };
}
