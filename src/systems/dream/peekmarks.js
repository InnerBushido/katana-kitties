import * as THREE from 'three';
import { PEEK } from './peek.js';
import { HOLO } from '../../world/simworld.js';

/*
  WHERE THE CAMERA CHANGES, DRAWN ON THE FLOOR. Richard, Oct 2026: "can we
  draw a half circle, holographic laser line on the ground marking the
  boundary of where the player needs to walk past in order for the camera to
  switch to the 'look across the bridge' camera mode ... We can also mark at
  the entrance/exit of the bridge where the camera will switch to the
  'crossing the bridge' camera mode ... Can have different colors to indicate
  the two camera switching zones."

  TWO LINES PER MOUTH, both read off the rule they mark rather than typed:

  - THE LOOK ACROSS (`LOOK`, gold): a half circle of `PEEK.start` round the
    mouth, on the deck it opens from — `peekZone`'s own distance, on the side
    its `out` test allows. Walking at the mouth inside it, for `PEEK.dwell`,
    is what turns the lens round. Where the half circle runs off the island
    (a mouth sits near a disc's rim) the line simply stops: it is drawn only
    where there is floor at the mouth's height, so it never hangs in the void.
  - THE RIDE (`RIDE`, a hot orange): a bar across the
    deck where the RIDE begins — found by walking the centre line out of the
    mouth until `heightAt` hands back the bridge's road, because that is the
    only thing `Player._stepSnake` asks. It is NOT at the mouth: the walked
    deck runs a couple of units into each island (simworld.js), and measured
    in the running game the ride took her 2.4 past it. A bar at the mouth
    would have promised a camera change a step before it happened.

  Ground-hugging strips, not `THREE.Line` (one pixel wide on every GPU), with
  a bright core and a soft glow either side, added rather than painted so they
  read as light on the grid; a slow pulse runs along them so they look like a
  laser and not paint.
*/

export const PEEK_MARKS = {
  /** gold for "the camera looks across", orange for "the camera rides". NOT
   *  magenta, the first try: the hub's rim and every bridge's edges are
   *  magenta, and a magenta bar at a mouth vanished into both. */
  look: HOLO.gold,
  ride: 0xff5a2e,
  /** strip half-widths: the core, and the glow round it */
  core: 0.07,
  glow: 0.32,
  /** off the floor, so it never fights the deck's grid */
  lift: 0.06,
  /** how far past the mouth to look for the ride's first step */
  search: 10,
};

const VERT = /* glsl */`
attribute float aU;
varying float vU;
varying float vAcross;
void main() {
  vU = aU;
  vAcross = uv.y * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uTime;
uniform float uCore;
varying float vU;
varying float vAcross;
void main() {
  float x = abs(vAcross);
  float core = 1.0 - smoothstep(uCore * 0.6, uCore, x);
  float glow = pow(1.0 - x, 3.0) * 0.45;
  float pulse = 0.75 + 0.25 * sin(vU * 1.6 - uTime * 4.0);
  float a = clamp(core + glow, 0.0, 1.0) * pulse;
  gl_FragColor = vec4(uColor * (0.6 + core * 0.8), a);
}`;

/** A flat strip along a polyline of world points (each {x, y, z}), `half` either side. */
function strip(pts, half, colour, uTime) {
  const pos = [];
  const uv = [];
  const us = [];
  const idx = [];
  let run = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b.x - a.x;
    let tz = b.z - a.z;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    if (i > 0) run += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    const p = pts[i];
    pos.push(p.x - tz * half, p.y, p.z + tx * half, p.x + tz * half, p.y, p.z - tx * half);
    uv.push(0, 0, 0, 1);
    us.push(run, run);
    if (i > 0) {
      const k = i * 2;
      idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aU', new THREE.Float32BufferAttribute(us, 1));
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { uColor: { value: new THREE.Color(colour) }, uTime, uCore: { value: PEEK_MARKS.core / half } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 2;
  return m;
}

/**
 * Where on the mouth's centre line the ride starts: the first point, walking
 * out of the island, whose floor is the bridge's own road. Null if there is
 * none within `search` (a check asks for every mouth).
 */
export function rideStart(sim, E) {
  for (let s = -3; s <= PEEK_MARKS.search; s += 0.05) {
    const x = E.mouth.x + E.toward.x * s;
    const z = E.mouth.z + E.toward.z * s;
    const h = sim.heightAt(x, z, E.mouth.y + 1);
    if (h?.platform?.snake === E.road) return { s, x, z, y: h.y };
  }
  return null;
}

/**
 * The look-across half circle for one mouth, as runs of world points that
 * have floor under them at the mouth's height (a run breaks where the circle
 * leaves the island).
 */
export function lookArc(sim, E, n = 72) {
  const runs = [];
  let cur = [];
  // The deck side: from one side of the bridge, round the back, to the other.
  const base = Math.atan2(-E.toward.z, -E.toward.x);
  for (let i = 0; i <= n; i++) {
    const t = base - Math.PI / 2 + (Math.PI * i) / n;
    const x = E.mouth.x + Math.cos(t) * PEEK.start;
    const z = E.mouth.z + Math.sin(t) * PEEK.start;
    const h = sim.heightAt(x, z, E.mouth.y + 1);
    if (h && Math.abs(h.y - E.mouth.y) < 1.5) cur.push({ x, y: h.y + PEEK_MARKS.lift, z });
    else if (cur.length) { if (cur.length > 1) runs.push(cur); cur = []; }
  }
  if (cur.length > 1) runs.push(cur);
  return runs;
}

/** Every mouth's two lines, in one group; `tick(dt)` runs the pulse. */
export function buildPeekMarks(sim, ends) {
  const group = new THREE.Group();
  group.name = 'peek-marks';
  const uTime = { value: 0 };
  const drawn = { look: 0, ride: 0 };
  for (const E of ends) {
    for (const run of lookArc(sim, E)) {
      group.add(strip(run, PEEK_MARKS.glow, PEEK_MARKS.look, uTime));
      drawn.look++;
    }
    const R = rideStart(sim, E);
    if (!R) continue;
    const half = (E.road.halfW ?? 2.2) + 0.15;
    const px = -E.toward.z;
    const pz = E.toward.x;
    const bar = [];
    for (let k = -1; k <= 1.0001; k += 0.1) {
      bar.push({ x: R.x + px * half * k, y: R.y + PEEK_MARKS.lift, z: R.z + pz * half * k });
    }
    group.add(strip(bar, PEEK_MARKS.glow, PEEK_MARKS.ride, uTime));
    drawn.ride++;
  }
  return {
    group,
    drawn,
    tick(dt) { uTime.value += dt; },
    dispose() {
      group.parent?.remove(group);
      group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    },
  };
}
