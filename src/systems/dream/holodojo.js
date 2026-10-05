import * as THREE from 'three';
import { HOLO } from '../../world/simworld.js';
import { DOJO_VIEW_R } from '../mathdojo.js';
import { holoFlicker } from './holo.js';

/* ---------------------------------------------------------------------------
   THE TURNING CIRCLE, IN LIGHT — the simulator's copy of the Dojo dressed as a
   hologram, and nothing about it changed but how it is drawn.

   Richard: "Let's make it that, in the simulation, the Dojo of the Turning
   Circle in the middle looks like holograms as well, to fit the atmosphere of
   the simulation better. Right now the sphere is a solid blue color that
   doesn't look too good."

   It was the town's Dojo, built a second time with only its floor made glassy
   (dreamdojo.js): the point a solid blue ball, the arrowheads solid cream
   cones, the circle a flat gold line — the one opaque, lit-looking thing in a
   world where everything else is wireframe and glow.

   NOW, ON THE SAME OBJECTS:
     · the POINT is a wireframe globe — a faint fill, its edges in the radius
       vector's own blue, and two rings of latitude turning round it — so it is
       still the brightest thing on the floor and still unmistakably "you";
     · the arrowheads are wireframe too, and every line (the circle, the axes,
       the legs, the arc) is drawn additively, so it glows like the rest;
     · a rim of light at the floor's edge, and a scan ring that sweeps out from
       the origin every few seconds — the projector, drawing the diagram.

   THE MATHS IS NOT TOUCHED (non-negotiable 1). Every mesh keeps its place in
   the group and its place in `_liveBits`; `MathDojo.update` moves the point,
   the legs and the arc exactly as it does in town, from the same theta. Only
   materials are swapped and children added — never a position, never a
   colour that carries meaning (cos stays orange, sin green, the radius blue,
   the circle gold). `world-check` holds the two Dojos' diagrams equal.
--------------------------------------------------------------------------- */

const additive = (m) => {
  m.transparent = true;
  m.blending = THREE.AdditiveBlending;
  m.depthWrite = false;
  m.needsUpdate = true;
};

const edges = (geo, colour, opacity = 0.95) => new THREE.LineSegments(
  new THREE.EdgesGeometry(geo, 1),
  new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }),
);

/** How often the scan ring leaves the origin, and how long it takes to reach the rim. */
export const SCAN_EVERY = 4.5;
export const SCAN_T = 2.2;

/**
 * Dress a `MathDojo` as a hologram. Returns `{ update(t) }`, for the flicker,
 * the turning rings and the scan.
 */
export function holoDojo(dojo) {
  const parts = { rings: [], glows: [] };
  const point = dojo.point;
  const colour = point.material.color.getHex();

  // THE POINT: a faint fill, a wire globe, two rings of latitude.
  const fill = new THREE.MeshBasicMaterial({ color: colour, toneMapped: false, opacity: 0.22 });
  additive(fill);
  point.material = fill;
  const globe = new THREE.IcosahedronGeometry(1.2, 1);
  point.add(edges(globe, colour));
  for (const tilt of [0.35, -0.9]) {
    const r = new THREE.Mesh(
      new THREE.TorusGeometry(1.55, 0.05, 6, 48),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    r.rotation.x = Math.PI / 2 + tilt;
    point.add(r);
    parts.rings.push(r);
  }
  // The halo it already has, made a glow rather than a tinted shell.
  for (const c of point.children) if (c.isMesh && c.material?.side === THREE.BackSide) { additive(c.material); c.material.opacity = 0.16; }

  // EVERYTHING ELSE IN THE GROUP: lines glow, solid meshes go to wire.
  dojo.group.traverse((o) => {
    if (o === point || o.parent === point) return;
    if (o.isLine && o.material && !o.material.isSpriteMaterial) additive(o.material);
    if (o.isMesh && o.geometry?.type === 'ConeGeometry') {
      const c = o.material.color.getHex();
      o.material = new THREE.MeshBasicMaterial({ color: c, toneMapped: false, opacity: 0.25 });
      additive(o.material);
      o.add(edges(o.geometry, c));
    }
    if (o.isMesh && o.geometry?.type === 'RingGeometry') {
      additive(o.material);
      parts.glows.push({ m: o.material, base: o.material.opacity });
    }
  });

  // THE PROJECTOR: a rim of light, and a ring that sweeps out from the origin.
  const rim = new THREE.Mesh(
    new THREE.RingGeometry(DOJO_VIEW_R - 0.5, DOJO_VIEW_R, 128).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: HOLO.cyan, transparent: true, opacity: 0.5, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  rim.position.y = 0.01;
  dojo.group.add(rim);
  parts.glows.push({ m: rim.material, base: 0.5 });
  const scan = new THREE.Mesh(
    new THREE.RingGeometry(0.92, 1, 128).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: HOLO.cyan, transparent: true, opacity: 0, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  scan.position.y = 0.02;
  dojo.group.add(scan);

  return {
    parts, rim, scan,
    update(t) {
      for (const [k, r] of parts.rings.entries()) r.rotation.z = t * (k ? -0.9 : 0.6);
      const f = holoFlicker(t, 5, 1, 0.18);
      for (const g of parts.glows) g.m.opacity = g.base * f;
      fill.opacity = 0.22 * f;
      const k = (t % SCAN_EVERY) / SCAN_T;
      scan.visible = k < 1;
      if (k < 1) {
        scan.scale.setScalar(1 + k * (DOJO_VIEW_R - 1));
        scan.material.opacity = 0.45 * Math.sin(Math.PI * k);
      }
    },
  };
}
