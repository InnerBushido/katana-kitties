import * as THREE from 'three';
import { HOLO } from '../../world/simworld.js';
import { DOJO_VIEW_R, DOJO_RADIUS } from '../mathdojo.js';
import { Label } from '../../core/label.js';
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
       vector's own blue — so it is still the brightest thing on the floor and
       still unmistakably "you";
     · the arrowheads are wireframe too, and every line (the circle, the axes,
       the legs, the arc) is drawn additively, so it glows like the rest;
     · a rim of light at the floor's edge, and a scan ring that sweeps out from
       the origin every few seconds — the projector, drawing the diagram.

   AND THEN A VIDEO GAME'S DEBUG VIEW OF IT. Richard, on the second pass:
   "Let's have the hologram orb rotating in place with the gimbals around it
   as well. We should also put the player inside some sort of sphere around
   them as they move around, to make it look like a video game with vectors
   pointing at a point to find the position of the sphere on the unit circle.
   Can color the cone with X-axis red, Y-axis green, and Z-axis blue, to make
   look like an axis and gimbal. Let's have hologram bars going to the
   cylinders to make look like an axis. Can really make the Turning Circle
   look like a video game here and can show the vectors and normals and
   everything."
     · THE GIMBAL: the globe spins inside three nested rings, each turning
       about its own pivot — blue about the up axis, red about x inside it,
       green about y inside that — the order a real gimbal is built in, so a
       ring is always carried by the one outside it.
     · THE AXES: the two arrowheads go RED (x) and GREEN (y), and a third, BLUE
       (z), stands straight up out of the origin, one unit tall. Each has a bar
       of light from the origin out to its cone, with a pulse running out
       along it. It is a right-handed frame and that is not decoration: maths
       y is the world's −z here (mathdojo.js ZS), so x × y comes out UP. Green
       for y is also the sine leg's green — the sine IS the y.
     · A TRIAD ON THE ORB, the same three colours, so the point carries the
       frame it is measured in.
     · THE NORMAL AND THE TANGENT at the point: magenta straight out of the
       circle (cos θ, sin θ), white along it the way θ grows (−sin θ, cos θ).
       Read off `dojo.theta`, the same number that put the point there.
     · HER SPHERE: every kitten on the floor walks inside a wire globe, and the
       one steering gets a VECTOR from the origin out under her — through the
       point on the circle, because her angle is the point's angle. When she
       walks the rim the arrow's tip and the point meet; inside or outside it
       the arrow says how far off the circle she is.

   AND THE NUMBERS ON ALL OF IT. Richard, the third pass: "For the vectors
   shown, it would be nice to show the xyz values and magnitude for the
   vectors, if it is a normalized vector, can show that somehow as well ...
   With the lines formed for the x and y values of the unit circle, can draw
   and highlight the right triangle under it and show the 3 angle values
   changing for the triangle. Also list somewhere, or highlight the area in
   different neon colors, when the player or sphere on the unit circle
   changes to a different quadrant on the graph."
     · EVERY VECTOR SAYS WHAT IT IS: its (x, y, z) in units of the circle
       and its length. The radius to the point, the normal and the tangent
       are all length 1 by construction and say NORMALIZED; the vector to her
       says it only when she is standing on the circle, which is the lesson.
     · THE RIGHT TRIANGLE under the legs — origin, the foot of the sine leg,
       the point — filled, with its three angles at its three corners: the
       angle the radius makes with the x axis, 90°, and what is left. They
       add to 180 because they are read off one angle, not three.
     · THE QUADRANT she is in is lit in its own neon, and named — I, II, III,
       IV and the two signs that make it — and it flares when she crosses
       into the next.

   THE MATHS IS NOT TOUCHED (non-negotiable 1). Every mesh keeps its place in
   the group and its place in `_liveBits`; `MathDojo.update` moves the point,
   the legs and the arc exactly as it does in town, from the same theta. Only
   materials are swapped and children added — never a position, never a
   colour that carries meaning (cos stays orange, sin green, the radius blue,
   the circle gold; the arrowheads were cream, which meant nothing). Everything
   added here READS theta and her position and writes neither. `world-check`
   holds the two Dojos' diagrams equal, and the vector and the normal to the
   point they are drawn from.
--------------------------------------------------------------------------- */

const additive = (m) => {
  m.transparent = true;
  m.blending = THREE.AdditiveBlending;
  m.depthWrite = false;
  m.needsUpdate = true;
  return m;
};

const glow = (colour, opacity) => additive(new THREE.MeshBasicMaterial({ color: colour, toneMapped: false, opacity }));

const edges = (geo, colour, opacity = 0.95) => new THREE.LineSegments(
  new THREE.EdgesGeometry(geo, 1),
  new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }),
);

/** How often the scan ring leaves the origin, and how long it takes to reach the rim. */
export const SCAN_EVERY = 4.5;
export const SCAN_T = 2.2;
/** The axis colours, the way every 3D tool draws them. */
export const AXIS_C = { x: 0xff4d5e, y: 0x5dff7d, z: 0x4d8bff };
/** The normal and the tangent at the point. */
export const NORMAL_C = HOLO.magenta;
export const TANGENT_C = 0xffffff;
/** The axis bars: how thick, and how bright. */
const BAR_R = 0.45;
const BAR_A = 0.55;
/** The z axis stands one unit tall. */
export const Z_LEN = DOJO_RADIUS;
/** Her globe: its radius, and how high its centre rides over her feet. */
export const SPHERE_R = 2.6;
export const SPHERE_UP = 1.6;
/** The vector to her is drawn at the point's own height, so it passes through it. */
const VEC_Y = 0.9;
/** One neon per quadrant, I to IV — none of them the axis or leg colours. */
export const QUAD_C = [0x39ff14, 0xff2bd6, 0xffb300, 0x00e5ff];
export const QUAD_NAME = ['I', 'II', 'III', 'IV'];
/** How bright the lit quadrant sits, and how bright it flares on entry. */
export const QUAD_A = 0.13;
export const QUAD_FLASH = 0.42;
/** Which quadrant an angle is in, 0..3. On an axis it is the one it is
 *  turning INTO, the way θ grows. */
export function quadrantOf(theta) {
  const t = ((theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.min(3, Math.floor(t / (Math.PI / 2)));
}
/** The triangle's three angles, in degrees, from θ: at the origin (the
 *  radius against the x axis, between 0 and 90), at the foot, at the point. */
export function triangleAngles(theta) {
  const a = (Math.atan2(Math.abs(Math.sin(theta)), Math.abs(Math.cos(theta))) * 180) / Math.PI;
  return [a, 90, 90 - a];
}
/** A label's box on the floor, in the Dojo group's units: its centre and its
 *  half-sizes, read off the quad it actually draws (width × the scale
 *  `faceCamera` gave it last frame). A live label's box is its WIDEST string,
 *  so this errs wide, which is the safe way to err. */
export function labelBox(l, x = l.position.x, z = l.position.z) {
  const g = l.mesh.geometry.parameters;
  return { x, z, hw: (g.width * l.mesh.scale.x) / 2, hh: (g.height * l.mesh.scale.y) / 2 };
}

/** Do two boxes overlap, with `pad` of clear floor between them required? */
export function boxesOverlap(a, b, pad = 0.4) {
  return Math.abs(a.x - b.x) < a.hw + b.hw + pad && Math.abs(a.z - b.z) < a.hh + b.hh + pad;
}

/**
 * Put each readout on the first of ITS OWN candidate spots that is clear of
 * everything already down — the fixed labels first, then the readouts placed
 * before it, in order. A readout keeps the spot it had for as long as that
 * spot stays clear, so the labels do not hop between two spots as she walks;
 * when none is clear it takes the one it overlaps least.
 *
 * WHY THIS AND NOT FIXED OFFSETS. The first cut put each readout at one fixed
 * place relative to its arrow, and at θ = 46° in the browser four of them were
 * stacked on one another above the point: the normal's readout under the
 * quadrant's name, the tangent's running into the normal's. The readouts are
 * about 20 units wide on a 24-unit circle — no single offset is clear all the
 * way round. `items` are `{ box: {hw, hh}, spots: [{x, z}], prev }`; `prev`
 * comes back set to the spot chosen.
 */
export function placeReadouts(items, fixed) {
  const down = fixed.slice();
  for (const it of items) {
    const at = (s) => ({ x: s.x, z: s.z, hw: it.box.hw, hh: it.box.hh });
    const clear = (s) => !down.some((b) => boxesOverlap(at(s), b));
    let k = it.prev != null && it.spots[it.prev] && clear(it.spots[it.prev]) ? it.prev : it.spots.findIndex(clear);
    if (k < 0) {
      // Nothing clear: the least overlapped, by area.
      const area = (s) => down.reduce((sum, b) => {
        const a = at(s);
        const ox = Math.max(0, Math.min(a.x + a.hw, b.x + b.hw) - Math.max(a.x - a.hw, b.x - b.hw));
        const oz = Math.max(0, Math.min(a.z + a.hh, b.z + b.hh) - Math.max(a.z - a.hh, b.z - b.hh));
        return sum + ox * oz;
      }, 0);
      k = 0;
      for (let i = 1; i < it.spots.length; i++) if (area(it.spots[i]) < area(it.spots[k])) k = i;
    }
    it.prev = k;
    down.push(at(it.spots[k]));
  }
  return down.slice(fixed.length);
}

/** A vector's readout: (x, y, z) to two places, its length, and NORMALIZED
 *  when the length is 1 to those two places. */
export function vecText(name, x, y, z = 0) {
  const f = (v) => (Math.abs(v) < 0.005 ? 0 : v).toFixed(2);
  const m = Math.hypot(x, y, z);
  return `${name} (${f(x)}, ${f(y)}, ${f(z)})  |${name}| = ${m.toFixed(2)}${Math.abs(m - 1) < 0.005 ? '  ✓ NORMALIZED' : ''}`;
}
const UP = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3();

/** A shaft and a head, set from a tail and a tip. Meshes, not a 1px line:
 *  the Dojo is framed from 78 units back, where a line is a hairline. */
function holoArrow(colour, { r = 0.16, head = 1.1, opacity = 0.8 } = {}) {
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).translate(0, 0.5, 0), glow(colour, opacity * 0.6));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(head * 0.42, head, 10).translate(0, -head / 2, 0), glow(colour, opacity));
  group.add(shaft, tip);
  for (const m of [shaft, tip]) { m.renderOrder = 4; m.frustumCulled = false; }
  return {
    group, shaft, tip, colour,
    /** From `a` to `b`, both in the group's space. Hidden if they meet. */
    set(a, b) {
      _d.subVectors(b, a);
      const len = _d.length();
      group.visible = len > 1e-3;
      if (!group.visible) return;
      _d.multiplyScalar(1 / len);
      shaft.position.copy(a);
      shaft.quaternion.setFromUnitVectors(UP, _d);
      shaft.scale.set(r, Math.max(1e-3, len - head * 0.9), r);
      tip.position.copy(b);
      tip.quaternion.copy(shaft.quaternion);
    },
  };
}

/**
 * Dress a `MathDojo` as a hologram. Returns `{ update(t, players) }`, for the
 * flicker, the gimbal, the scan, her globe and the vectors.
 */
export function holoDojo(dojo) {
  const parts = { rings: [], glows: [], gimbal: [], bars: {}, cones: {} };
  const point = dojo.point;
  const colour = point.material.color.getHex();

  // THE POINT: a faint fill and a wire globe that spins.
  const fill = glow(colour, 0.22);
  point.material = fill;
  const globe = edges(new THREE.IcosahedronGeometry(1.2, 1), colour);
  point.add(globe);
  // The halo it already has, made a glow rather than a tinted shell.
  for (const c of point.children) if (c.isMesh && c.material?.side === THREE.BackSide) { additive(c.material); c.material.opacity = 0.16; }

  /* THE GIMBAL. Each pivot carries the next; each ring lies in a plane that
     contains its own pivot axis, which is what makes it swing rather than
     spin invisibly in place. Torus is born in the xy plane. */
  const ring = (rad, hex) => new THREE.Mesh(new THREE.TorusGeometry(rad, 0.06, 6, 56), glow(hex, 0.75));
  const yaw = new THREE.Group();   // about up (maths z): blue
  const roll = new THREE.Group();  // about x: red
  const tilt = new THREE.Group();  // about the world z, which is maths y: green
  const rZ = ring(2.25, AXIS_C.z);
  // At rest the three are square to each other: xy, xz, yz.
  const rX = ring(1.95, AXIS_C.x); rX.geometry.rotateX(Math.PI / 2);
  const rY = ring(1.65, AXIS_C.y); rY.geometry.rotateY(Math.PI / 2);
  yaw.add(rZ, roll);
  roll.add(rX, tilt);
  tilt.add(rY);
  point.add(yaw);
  parts.gimbal.push(yaw, roll, tilt);
  parts.rings.push(rZ, rX, rY);

  // EVERYTHING ELSE IN THE GROUP: lines glow, solid meshes go to wire.
  dojo.group.traverse((o) => {
    if (o === point || o.parent === point) return;
    if (o.isLine && o.material && !o.material.isSpriteMaterial) additive(o.material);
    if (o.isMesh && o.geometry?.type === 'ConeGeometry') {
      // The arrowheads: whichever axis this one ends.
      const axis = Math.abs(o.position.x) > Math.abs(o.position.z) ? 'x' : 'y';
      const c = AXIS_C[axis];
      o.material = glow(c, 0.25);
      o.add(edges(o.geometry, c));
      parts.cones[axis] = o;
    }
    if (o.isMesh && o.geometry?.type === 'RingGeometry') {
      additive(o.material);
      parts.glows.push({ m: o.material, base: o.material.opacity });
    }
  });

  /* THE THIRD AXIS: z, straight up, one unit, its cone pointing at the sky.
     The cones in town stand 0.3 over the floor, so the bars do too. */
  const ARROW_Y = parts.cones.x?.position.y ?? 0.3;
  const zCone = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.4, 12), glow(AXIS_C.z, 0.25));
  zCone.position.set(0, ARROW_Y + Z_LEN, 0);
  zCone.add(edges(zCone.geometry, AXIS_C.z));
  dojo.group.add(zCone);
  parts.cones.z = zCone;
  const zLabel = new Label('z', {
    height: 2.6, size: 76, color: '#bcd4ff', stroke: '#1d1216', strokeWidth: 9, fixedScreenSize: true,
  });
  zLabel.position.set(0, ARROW_Y + Z_LEN + 3.4, 0);
  dojo.group.add(zLabel);
  dojo.labels?.push(zLabel);

  /* THE BARS, origin to cone, and a pulse running out along each. The cone's
     own centre is where its bar ends, so the two can never drift apart. */
  const origin = new THREE.Vector3(0, ARROW_Y, 0);
  for (const k of ['x', 'y', 'z']) {
    const cone = parts.cones[k];
    if (!cone) continue;
    const end = cone.position.clone();
    const len = end.distanceTo(origin);
    const dir = end.clone().sub(origin).normalize();
    /* 0.45 thick, and it was 0.2: from the Dojo shot's 78 units back that
       was two pixels, and the cream axis line over it drowned the colour. */
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(BAR_R, BAR_R, 1, 8, 1, true).translate(0, 0.5, 0), glow(AXIS_C[k], BAR_A));
    bar.position.copy(origin);
    bar.quaternion.setFromUnitVectors(UP, dir);
    bar.scale.set(1, len, 1);
    const pulse = new THREE.Mesh(new THREE.TorusGeometry(BAR_R * 2.2, 0.14, 6, 20).rotateX(Math.PI / 2), glow(AXIS_C[k], 0));
    pulse.quaternion.copy(bar.quaternion);
    dojo.group.add(bar, pulse);
    parts.bars[k] = { bar, pulse, dir, len };
    parts.glows.push({ m: bar.material, base: BAR_A });
  }

  // THE TRIAD ON THE ORB: the frame the point is measured in, riding with it.
  const triad = new THREE.Group();
  const yDir = parts.bars.y?.dir ?? new THREE.Vector3(0, 0, -1);
  for (const [k, d] of [['x', new THREE.Vector3(1, 0, 0)], ['y', yDir], ['z', UP]]) {
    const a = holoArrow(AXIS_C[k], { r: 0.07, head: 0.55, opacity: 0.95 });
    a.set(new THREE.Vector3(), d.clone().multiplyScalar(3));
    triad.add(a.group);
  }
  point.add(triad);
  parts.triad = triad;

  // THE NORMAL AND THE TANGENT at the point (see the header).
  const normal = holoArrow(NORMAL_C, { r: 0.14, head: 1.2, opacity: 0.85 });
  const tangent = holoArrow(TANGENT_C, { r: 0.14, head: 1.2, opacity: 0.75 });
  dojo.group.add(normal.group, tangent.group);
  parts.normal = normal;
  parts.tangent = tangent;

  // HER SPHERES — one per kitten on the floor, pooled — and the vector to her.
  const spheres = [];
  const sphere = () => {
    const g = new THREE.Group();
    const wire = edges(new THREE.IcosahedronGeometry(SPHERE_R, 1), HOLO.cyan, 0.55);
    const shell = new THREE.Mesh(new THREE.SphereGeometry(SPHERE_R * 0.98, 16, 12), glow(HOLO.cyan, 0.06));
    const belt = new THREE.Mesh(new THREE.TorusGeometry(SPHERE_R * 1.04, 0.05, 6, 48).rotateX(Math.PI / 2), glow(HOLO.cyan, 0.6));
    g.add(wire, shell, belt);
    g.visible = false;
    dojo.group.add(g);
    const s = { group: g, wire, shell, belt, who: null };
    spheres.push(s);
    return s;
  };
  const toHer = holoArrow(0xffffff, { r: 0.22, head: 1.6, opacity: 0.85 });
  dojo.group.add(toHer.group);
  parts.toHer = toHer;
  parts.spheres = spheres;

  // THE NUMBERS (see the header). Live labels: one canvas each, repainted.
  const readout = (colour, widest, height = 2.1) => {
    const l = new Label('', {
      height, size: 60, color: colour, stroke: '#0b0f1a', strokeWidth: 8, fixedScreenSize: true, live: widest,
    });
    dojo.group.add(l);
    dojo.labels?.push(l);
    return l;
  };
  const WIDE = 'n (−0.00, −0.00, 0.00)  |n| = 1.00  ✓ NORMALIZED';
  const hexCss = (h) => `#${h.toString(16).padStart(6, '0')}`;
  parts.read = {
    r: readout('#bfeaff', WIDE),
    n: readout(hexCss(NORMAL_C), WIDE),
    t: readout('#ffffff', WIDE),
    v: readout('#ffffff', WIDE.replace(/n/g, 'v')),
  };

  // THE RIGHT TRIANGLE: a fill under the legs, a square at the right angle,
  // and its three angles.
  const triGeo = new THREE.BufferGeometry();
  triGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  const triMat = additive(new THREE.MeshBasicMaterial({ color: QUAD_C[0], toneMapped: false, opacity: 0.2, side: THREE.DoubleSide }));
  const tri = new THREE.Mesh(triGeo, triMat);
  tri.frustumCulled = false;
  tri.renderOrder = 2;
  const sqGeo = new THREE.BufferGeometry();
  sqGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  const square = new THREE.Line(sqGeo, new THREE.LineBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.9, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  square.frustumCulled = false;
  dojo.group.add(tri, square);
  const angles = [0, 1, 2].map(() => readout('#fff6c8', '90°', 2.4));
  parts.tri = { mesh: tri, square, angles };

  // THE QUADRANTS: four quarter-discs on the floor, one lit; and its name.
  /* CircleGeometry is born in the xy plane and rotateX(−π/2) carries its +y to
     the world's −z — which is the maths y here (ZS = −1), so a quarter-disc
     from `thetaStart` k·π/2 lies over maths quadrant k with no further turn. */
  const quads = QUAD_C.map((c, k) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(DOJO_RADIUS, 24, (k * Math.PI) / 2, Math.PI / 2).rotateX(-Math.PI / 2),
      additive(new THREE.MeshBasicMaterial({ color: c, toneMapped: false, opacity: 0, side: THREE.DoubleSide })));
    m.position.y = 0.015;
    m.renderOrder = 1;
    dojo.group.add(m);
    return m;
  });
  const quadLabel = readout('#ffffff', 'QUADRANT III · cos − · sin −', 2.8);
  parts.quad = { meshes: quads, label: quadLabel, now: -1, flash: 0, at: -1 };
  /** Where each readout went last frame (see placeReadouts). */
  parts.spots = {};

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

  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  /** Her feet in the group's space: the group sits on the Dojo's centre, a
   *  hair above it, unrotated and unparented (MathDojo's constructor). */
  const local = (p, out) => out.set(
    p.position.x - dojo.group.position.x,
    p.position.y - dojo.group.position.y,
    p.position.z - dojo.group.position.z);

  return {
    parts, rim, scan, zCone, zLabel,
    update(t, players = []) {
      // THE GIMBAL AND THE GLOBE, turning in place.
      yaw.rotation.y = t * 0.7;
      roll.rotation.x = t * 1.1;
      tilt.rotation.z = t * 1.6;
      globe.rotation.set(t * 0.35, t * 0.9, 0);

      const f = holoFlicker(t, 5, 1, 0.18);
      for (const g of parts.glows) g.m.opacity = g.base * f;
      fill.opacity = 0.22 * f;
      const k = (t % SCAN_EVERY) / SCAN_T;
      scan.visible = k < 1;
      if (k < 1) {
        scan.scale.setScalar(1 + k * (DOJO_VIEW_R - 1));
        scan.material.opacity = 0.45 * Math.sin(Math.PI * k);
      }
      // The pulses out along the axes, one after another.
      for (const [i, key] of ['x', 'y', 'z'].entries()) {
        const B = parts.bars[key];
        if (!B) continue;
        const u = (((t * 0.6 - i / 3) % 1) + 1) % 1;
        B.pulse.position.copy(origin).addScaledVector(B.dir, u * B.len);
        B.pulse.material.opacity = 0.8 * Math.sin(Math.PI * u) * f;
      }

      /* THE NORMAL AND THE TANGENT, from the point's own position: the
         direction from the origin to it IS (cos θ, sin θ) in this group's
         space, so nothing here re-derives the angle. */
      const P = point.position;
      const rr = Math.hypot(P.x, P.z) || 1;
      const nx = P.x / rr;
      const nz = P.z / rr;
      const show = point.visible !== false && dojo._liveBits?.[0]?.visible !== false;
      normal.group.visible = tangent.group.visible = show;
      if (show) {
        _a.set(P.x + nx * 1.4, P.y, P.z + nz * 1.4);
        _b.set(P.x + nx * 7, P.y, P.z + nz * 7);
        normal.set(_a, _b);
        /* θ grows anticlockwise in the maths, which in this group's space is
           (−sin θ, cos θ) carried through ZS — rotate the normal by +90° about
           maths z, which is world up: (nx, nz) → (nz, −nx). */
        _a.set(P.x + nz * 1.4, P.y, P.z - nx * 1.4);
        _b.set(P.x + nz * 7, P.y, P.z - nx * 7);
        tangent.set(_a, _b);
      }

      /* THE NUMBERS. All of it from the point's own position and θ — the same
         two numbers that put the point there. Positions every frame; text
         only while somebody can read it (MathDojo's `readable`). */
      const R = DOJO_RADIUS;
      const th = dojo.theta ?? 0;
      const cx = P.x / R;
      const sy = -P.z / R;          // maths y is the world's −z (ZS)
      const sx = Math.sign(cx) || 1;
      const sgy = Math.sign(sy) || 1;
      const readable = dojo.readable !== false;
      const RD = parts.read;
      for (const l of Object.values(RD)) l.visible = show;
      // Where they go is decided at the bottom, once everything else is down.
      if (show) {
        if (readable) {
          RD.r.setText(vecText('r', cx, sy));
          RD.n.setText(vecText('n', cx, sy));
          RD.t.setText(vecText('t', -sy, cx));
        }
      }

      // The triangle: origin, the foot of the sine leg, the point.
      const T = parts.tri;
      T.mesh.visible = T.square.visible = show;
      const tp = triGeo.attributes.position;
      tp.setXYZ(0, 0, 0.05, 0);
      tp.setXYZ(1, P.x, 0.05, 0);
      tp.setXYZ(2, P.x, 0.05, P.z);
      tp.needsUpdate = true;
      const m = Math.min(1.8, Math.abs(P.x) * 0.3, Math.abs(P.z) * 0.3);
      const qp = sqGeo.attributes.position;
      qp.setXYZ(0, P.x - sx * m, 0.08, 0);
      qp.setXYZ(1, P.x - sx * m, 0.08, -sgy * m);
      qp.setXYZ(2, P.x, 0.08, -sgy * m);
      qp.needsUpdate = true;
      const ang = triangleAngles(th);
      const gx = (0 + P.x + P.x) / 3; const gz = (0 + 0 + P.z) / 3;
      [[0, 0], [P.x, 0], [P.x, P.z]].forEach(([vx, vz], i) => {
        const l = T.angles[i];
        l.visible = show;
        l.position.set(vx + (gx - vx) * 0.42, 1.6, vz + (gz - vz) * 0.42);
        if (readable && show) l.setText(`${ang[i].toFixed(0)}°`);
      });

      // The quadrant: lit in its own colour, flaring on the way in.
      const Q = parts.quad;
      const q = quadrantOf(th);
      if (q !== Q.now) { Q.now = q; Q.flash = 1; }
      Q.flash = Math.max(0, Q.flash - (Q.at < 0 ? 0 : Math.max(0, t - Q.at)) * 1.6);
      Q.at = t;
      Q.meshes.forEach((mm, k) => { mm.material.opacity = k === q ? (QUAD_A + (QUAD_FLASH - QUAD_A) * Q.flash) * f : 0; });
      triMat.color.setHex(QUAD_C[q]);
      Q.label.visible = show;
      if (readable && show) {
        Q.label.setText(`QUADRANT ${QUAD_NAME[q]} · cos ${q === 1 || q === 2 ? '−' : '+'} · sin ${q >= 2 ? '−' : '+'}`);
      }

      // HER SPHERES: every kitten standing on the floor, in pool order.
      let n = 0;
      for (const p of players) {
        if (!p?.position || p.mount) continue;
        local(p, _a);
        if (Math.hypot(_a.x, _a.z) > DOJO_VIEW_R) continue;
        const s = spheres[n] ?? sphere();
        n++;
        s.who = p;
        s.group.visible = true;
        s.group.position.set(_a.x, _a.y + SPHERE_UP, _a.z);
        s.wire.rotation.y = t * 0.5 + n;
        const driving = dojo.driver === p;
        s.wire.material.opacity = (driving ? 0.75 : 0.35) * f;
        s.belt.material.opacity = (driving ? 0.7 : 0.3) * f;
      }
      for (let i = n; i < spheres.length; i++) { spheres[i].group.visible = false; spheres[i].who = null; }

      /* AND THE VECTOR TO THE ONE STEERING, along the floor at the point's
         height, so it runs through the point on its way to her. */
      const D = dojo.driver;
      toHer.group.visible = !!D && show && spheres.some((s) => s.who === D);
      RD.v.visible = toHer.group.visible;
      if (toHer.group.visible) {
        local(D, _b);
        _a.set(0, VEC_Y, 0);
        _b.y = VEC_Y;
        toHer.set(_a, _b);
        /* Her vector in units of the circle: her radius, at her angle — the
           two numbers MathDojo read off her. On the circle it is a unit. */
        const pr = dojo.playerRadius ?? 1;
        if (readable) RD.v.setText(vecText('v', pr * Math.cos(th), pr * Math.sin(th)));
      }

      /* WHERE THE READOUTS GO (see placeReadouts). Each one's spots are in the
         order it would rather have them: beside its own arrow first. The
         fixed things are every other visible label on the floor, the point,
         and her. */
      if (show) {
        const mine = new Set([...Object.values(RD), Q.label]);
        const fixed = dojo.labels.filter((l) => l.visible && !mine.has(l)).map((l) => labelBox(l));
        fixed.push({ x: P.x, z: P.z, hw: 1.6, hh: 1.6 });
        if (RD.v.visible) fixed.push({ x: _b.x, z: _b.z, hw: 1.6, hh: 1.6 });
        const tip = (dx, dz, l) => {
          // Beside an arrow's head, running AWAY from the circle along the screen.
          const x = P.x + dx * 7.8;
          const z = P.z + dz * 7.8;
          const hw = labelBox(l).hw;
          const lean = Math.abs(dx) < 0.25 ? 0 : Math.sign(dx) * (hw - 1);
          const up = (Math.sign(dz) || -1) * 2.8;
          const side = hw + 1.5;
          return [{ x: x + lean, z }, { x: x + lean, z: z + up }, { x, z: z + up }, { x: x + lean, z: z - up },
            // ...and, where an axis name is standing on the tip, either side of it.
            { x: x + side, z }, { x: x - side, z }, { x, z: z + up * 2 }];
        };
        const items = [];
        const add = (key, l, spots) => items.push({ key, l, box: labelBox(l), spots, prev: parts.spots[key] });
        add('r', RD.r, [0.55, 0.4, 0.7].flatMap((k) => [0, 2.6, -2.6].map((dz) => ({ x: P.x * k, z: P.z * k + dz }))));
        add('n', RD.n, tip(nx, nz, RD.n));
        add('t', RD.t, tip(nz, -nx, RD.t));
        if (RD.v.visible) {
          const side = labelBox(RD.v).hw + 2;
          add('v', RD.v, [...[3.2, -3.2, 6, -6].map((dz) => ({ x: _b.x, z: _b.z + dz })),
            { x: _b.x + side, z: _b.z }, { x: _b.x - side, z: _b.z }]);
        }
        // The quadrant's name: somewhere inside the lit quarter.
        add('quad', Q.label, [0.62, 0.85, 0.4].flatMap((rk) => [0.5, 0.25, 0.75].map((fk) => {
          const a = (q + fk) * (Math.PI / 2);
          return { x: Math.cos(a) * R * rk, z: -Math.sin(a) * R * rk };
        })));
        placeReadouts(items, fixed);
        const lift = { r: 4.2, n: 2.4, t: 2.4, v: 5.2, quad: 3.2 };
        for (const it of items) {
          parts.spots[it.key] = it.prev;
          const s = it.spots[it.prev];
          it.l.position.set(s.x, lift[it.key], s.z);
        }
      }
    },
  };
}
