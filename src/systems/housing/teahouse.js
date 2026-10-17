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

/** How long the ceremony runs, and its beats (activities.js `_tea`). */
export const TEA_T = { join: 6, whisk: 6, sip: 4, bow: 4 };
/** The ceremony is 26s however many kneel: the sips share TEA_T.sip * 4 between them. */
export const TEA_LEN = TEA_T.whisk + TEA_T.sip * 4 + TEA_T.bow;
export const sipLen = (n) => (TEA_T.sip * 4) / Math.max(1, Math.min(4, n));

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
