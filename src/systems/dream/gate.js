import * as THREE from 'three';
import { paint, toonVertexMat } from '../../core/gfx.js';
import { mergeParts } from '../../world/build.js';
import { HOLO } from '../../world/simworld.js';

/* ---------------------------------------------------------------------------
   THE FRONT DOOR — the gate, the deck it stands on, and the railing.

   Richard: "Too many jumping platforms on the way to the Dream Dojo, let's
   just make it 3 platforms to make it a bit more challenging. Also, we need to
   make sure the entrance is bigger, more interesting looking, and placed in
   front of the last floating platform, and that it is the only way to enter
   the dojo, so we can put a railing all around the dojo that ends at the
   entrance to force players to enter from the entrance."

   Before this the "door" was an invisible 20° wedge of the dome between the
   third stone and the fourth — the fourth stood INSIDE the dome — and nothing
   on screen said where it was. Now the door is a THING:

   · a DECK runs out of the pad along one bearing, past the dome's skin, so
     its far end is a landing outside the bubble;
   · a holographic TORII stands on that deck exactly at the dome's skin, so
     walking through the gate and walking through the dome are one act;
   · the last stone sits on the gate's axis, one jump short of the landing —
     "placed in front of the last floating platform";
   · a RAILING runs round the pad's edge and along both sides of the deck,
     and ends at the gate's two pillars.

   The railing is real, not painted: `railCorrect` keeps a kitten on foot
   inside it, and only the gate's mouth lets her out. Coming IN is the dome's
   business (dream/approach.js), and its door is now exactly the deck's strip
   (`inGateway`).

   Pure where world-check needs it to be: `gateFrame`, `inRail` and
   `railCorrect` take numbers and return numbers.
--------------------------------------------------------------------------- */

/**
 * The gate, in the pad's own terms.
 * `bearing` — degrees from the pad's near side (-u) round toward screen-left
 *   (-v): the way the old door faced, so every prop already laid out clear of
 *   "the way in" (Lionheart, the racks, the treadmills) is still clear of it.
 * `decks` — how far out each of the deck's round platforms stands, and
 *   `deckR` their radius: World platforms are discs or axis-aligned boxes,
 *   and a deck on a diagonal has to be discs. Three at 2.4 spacing leave a
 *   walkable strip 2.75 either side of the axis at the narrowest (measured:
 *   √(3² − 1.2²)), which is `half`.
 * `pillar` — the torii's pillars, either side of the axis, just outside
 *   `half` so they frame the strip rather than stand in it.
 * `rail` — the railing's radius round the pad; the pad's rim is 14 and the
 *   furthest prop (the laser-tag rack) stands 12.8 out.
 */
export const GATE = {
  bearing: 55, decks: [14.4, 16.8, 19.2], deckR: 3.0, half: 2.75, pillar: 3.25, rail: 13.75,
  /** The torii's heights over the deck: the tie beam, the top beam. A double
   *  jump off the last stone peaks ~4.2 over the deck, so she goes UNDER it. */
  nuki: 8.4, kasagi: 10.8,
};

/**
 * The gate's frame: `dir` out of the pad along the deck, `lat` across it,
 * `ring` the dome's radius (where the torii stands), `tip` the deck's far end.
 * `at(along, side)` -> {x, z}.
 */
export function gateFrame(A, u, v, ring) {
  const a = (GATE.bearing * Math.PI) / 180;
  const dir = { x: -u.x * Math.cos(a) - v.x * Math.sin(a), z: -u.z * Math.cos(a) - v.z * Math.sin(a) };
  const lat = { x: -dir.z, z: dir.x };
  const at = (along, side = 0) => ({
    x: A.x + dir.x * along + lat.x * side, z: A.z + dir.z * along + lat.z * side,
  });
  return {
    dir, lat, ring, at,
    bearing: Math.atan2(dir.z, dir.x),
    tip: GATE.decks.at(-1) + GATE.deckR,
    decks: GATE.decks.map((d) => ({ ...at(d), r: GATE.deckR })),
  };
}

/** Along and across the gate's axis, from the pad's centre. */
function local(x, z, A, f) {
  const dx = x - A.x;
  const dz = z - A.z;
  return { along: dx * f.dir.x + dz * f.dir.z, side: dx * f.lat.x + dz * f.lat.z, h: Math.hypot(dx, dz) };
}

/** Is (x, z) inside the railing — on the pad, or on the deck short of the gate? */
export function inRail(x, z, A, f) {
  const q = local(x, z, A, f);
  return q.h < GATE.rail || (q.along >= 0 && q.along <= f.ring && Math.abs(q.side) < GATE.half);
}

/** Is (x, z) in the gateway — anywhere on the deck's strip, from the pad out
 *  past the torii? The dome's door (dream/approach.js). */
export function inGateway(x, z, A, f) {
  const q = local(x, z, A, f);
  return q.along > 0 && Math.abs(q.side) < GATE.half;
}

/** Is (x, z) out through the gate's mouth — past the torii, between its pillars? */
export function throughGate(x, z, A, f) {
  const q = local(x, z, A, f);
  return q.along > f.ring && Math.abs(q.side) < GATE.half;
}

/**
 * Where the railing puts a kitten who is at (x, z) and is NOT inside it, as
 * the nearest point that is: back inside the ring, or back onto the deck's
 * strip. The nearer of the two, so she slides along a rail rather than
 * sticking to it. Returns {x, z, nx, nz} — the point, and the outward normal
 * of the rail she hit.
 */
export function railCorrect(x, z, A, f) {
  const q = local(x, z, A, f);
  const r = GATE.rail - 0.05;
  const ring = { x: A.x + ((x - A.x) / (q.h || 1)) * r, z: A.z + ((z - A.z) / (q.h || 1)) * r, nx: (x - A.x) / (q.h || 1), nz: (z - A.z) / (q.h || 1) };
  if (q.along < 0) return ring;
  const along = Math.min(q.along, f.ring);
  const s = Math.sign(q.side) || 1;
  const side = s * Math.min(Math.abs(q.side), GATE.half - 0.05);
  const strip = { ...f.at(along, side), nx: f.lat.x * s, nz: f.lat.z * s };
  const dRing = Math.hypot(x - ring.x, z - ring.z);
  const dStrip = Math.hypot(x - strip.x, z - strip.z);
  return dStrip < dRing ? strip : ring;
}

/* ------------------------------ the drawing ------------------------------ */

/** The plaque on the torii: 夢, the first character on the sign over the deck. */
function plaqueTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 192;
  const g = cv.getContext('2d');
  g.fillStyle = 'rgba(6, 18, 28, 0.92)';
  g.fillRect(6, 6, 116, 180);
  g.strokeStyle = '#5ff6ff';
  g.lineWidth = 6;
  g.strokeRect(9, 9, 110, 174);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 104px "Noto Serif JP", serif';
  g.fillStyle = '#ff4fd8';
  g.shadowColor = '#ff4fd8';
  g.shadowBlur = 18;
  g.fillText('夢', 64, 100);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* The light hanging in the gate's opening: rising scanlines and a soft edge.
   Faint on purpose — it is a doorway, and a doorway that reads as a pane of
   glass reads as shut. */
const PORTAL_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const PORTAL_FRAG = /* glsl */`
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
    float lines = pow(0.5 + 0.5 * sin(vUv.y * 70.0 - uTime * 5.0), 8.0);
    float sweep = exp(-pow((vUv.y - fract(uTime * 0.35)) * 6.0, 2.0));
    float a = (0.08 + lines * 0.14 + sweep * 0.3) * (1.0 - edge * 0.6) * smoothstep(1.0, 0.75, vUv.y);
    gl_FragColor = vec4(mix(vec3(0.37, 0.96, 1.0), vec3(1.0, 0.31, 0.85), vUv.y), a);
  }
`;

/**
 * Build the deck, the torii and the railing into `group`. `plat(x, z, r, y)`
 * registers a walkable disc with the World. Returns what animates.
 */
export function buildGate(group, f, A, plat) {
  for (const d of f.decks) plat(d.x, d.z, d.r, A.y, { step: 0.6 });

  const yaw = Math.atan2(f.dir.x, f.dir.z);
  const parts = [];
  /* (across, tall, along): BoxGeometry's x is turned onto the deck's
     lateral and its z onto `dir` by the one rotateY. */
  const box = (w, h, d, along, side, y, colour, tilt = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (tilt) g.rotateZ(tilt);
    g.rotateY(yaw);
    const p = f.at(along, side);
    g.translate(p.x, y, p.z);
    parts.push(paint(g, colour));
  };
  /* THE DECK: a slab from the pad's rim to the landing, widening into a
     plinth under the pillars, and a round landing past the dome. Drawn a
     touch wider than its walkable strip so the rails sit ON it. */
  const run = f.ring - 12;
  box(GATE.half * 2 + 0.5, 0.9, run, 12 + run / 2, 0, A.y - 0.45, 0x4a5068);
  box(GATE.pillar * 2 + 1.6, 1.0, 2.4, f.ring, 0, A.y - 0.5, 0x3b4152);
  const land = new THREE.CylinderGeometry(GATE.deckR, GATE.deckR * 0.9, 0.9, 24);
  const lp = f.decks.at(-1);
  land.translate(lp.x, A.y - 0.45, lp.z);
  parts.push(paint(land, 0x4a5068));
  const under = new THREE.ConeGeometry(GATE.deckR * 0.9, 4, 8);
  under.rotateX(Math.PI);
  under.translate(lp.x, A.y - 0.9 - 2, lp.z);
  parts.push(paint(under, 0x5a4a52));

  /* THE TORII. Two pillars, the tie beam (nuki) through them, the top beam
     (kasagi) in two layers with its ends lifted, and a plaque between the
     beams. VERMILION, black-capped, as a torii is: the first cut was
     steel-dark like the rest of the pad and read, from the stones, as two
     more posts of the railing — "bigger, more interesting looking" is a
     thing you can name from across the gap. The neon outlines it, and two
     lanterns hang off the kasagi's overhang. */
  const P = GATE.pillar;
  const RED = 0xd6343f;
  const CAP = 0x1c1a24;
  for (const s of [-1, 1]) {
    const col = new THREE.CylinderGeometry(0.55, 0.66, GATE.kasagi, 14);
    const p = f.at(f.ring, s * P);
    col.translate(p.x, A.y + GATE.kasagi / 2, p.z);
    parts.push(paint(col, RED));
    const foot = new THREE.CylinderGeometry(0.9, 1.0, 0.8, 14);
    foot.translate(p.x, A.y + 0.4, p.z);
    parts.push(paint(foot, CAP));
    // The kasagi's lifted ends, and the lanterns' cords.
    box(2.2, 0.62, 0.86, f.ring, s * (P + 2.75), A.y + GATE.kasagi + 0.95, CAP, -s * 0.18);
    const cord = new THREE.CylinderGeometry(0.04, 0.04, 1.2, 4);
    const cp = f.at(f.ring, s * (P + 2.3));
    cord.translate(cp.x, A.y + GATE.kasagi - 0.1, cp.z);
    parts.push(paint(cord, CAP));
  }
  box(P * 2 + 3.2, 0.6, 0.6, f.ring, 0, A.y + GATE.nuki, RED);
  box(P * 2 + 4.8, 0.62, 0.9, f.ring, 0, A.y + GATE.kasagi + 0.62, CAP);
  box(P * 2 + 4.2, 0.62, 0.76, f.ring, 0, A.y + GATE.kasagi, RED);
  // The short strut (gakuzuka) the plaque hangs on.
  box(0.5, GATE.kasagi - GATE.nuki, 0.4, f.ring, 0, A.y + (GATE.kasagi + GATE.nuki) / 2, RED);
  // The deck's railing posts are drawn below, with the rail itself.

  /* THE RAILING: posts, and a neon rail along their tops — round the pad's
     edge from one side of the deck to the other the long way, then out along
     both sides of the deck to the pillars. */
  const railH = 1.25;
  const gapA = Math.asin((GATE.half + 0.1) / GATE.rail);
  const span = Math.PI * 2 - gapA * 2;
  const posts = Math.round((span * GATE.rail) / 2.4);
  for (let i = 0; i <= posts; i++) {
    const a = f.bearing + gapA + (span * i) / posts;
    const post = new THREE.CylinderGeometry(0.12, 0.14, railH, 6);
    post.translate(A.x + Math.cos(a) * GATE.rail, A.y + railH / 2, A.z + Math.sin(a) * GATE.rail);
    parts.push(paint(post, 0x2a3042));
  }
  const deckFrom = Math.sqrt(GATE.rail ** 2 - (GATE.half + 0.1) ** 2);
  for (const s of [-1, 1]) {
    for (let d = deckFrom; d < f.ring - 0.4; d += 1.8) {
      const post = new THREE.CylinderGeometry(0.12, 0.14, railH, 6);
      const p = f.at(d, s * (GATE.half + 0.1));
      post.translate(p.x, A.y + railH / 2, p.z);
      parts.push(paint(post, 0x2a3042));
    }
  }
  const hard = new THREE.Mesh(mergeParts(parts), toonVertexMat());
  hard.castShadow = true;
  hard.receiveShadow = true;
  group.add(hard);

  const neonMat = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
  const cyan = neonMat(HOLO.cyan);
  const magenta = neonMat(HOLO.magenta);
  // The ring rail, the long way round, at post height.
  /* A torus's arc starts at +x and runs toward +y. Laid flat with +π/2 on x
     (Euler XYZ applies z first), +y goes to +z, so an arc point at angle φ
     ends at bearing atan2(z, x) = φ + rotation.z — the posts' own convention.
     world-check reads the rail's vertices back and finds none over the deck. */
  const ringRail = new THREE.Mesh(new THREE.TorusGeometry(GATE.rail, 0.08, 6, 160, span), cyan);
  ringRail.rotation.x = Math.PI / 2;
  ringRail.rotation.z = f.bearing + gapA;
  ringRail.position.set(A.x, A.y + railH, A.z);
  group.add(ringRail);
  const ringLow = new THREE.Mesh(new THREE.TorusGeometry(GATE.rail, 0.05, 6, 160, span), magenta);
  ringLow.rotation.copy(ringRail.rotation);
  ringLow.position.set(A.x, A.y + railH * 0.5, A.z);
  group.add(ringLow);
  // The deck's two rails.
  const deckLen = f.ring - deckFrom;
  for (const s of [-1, 1]) {
    for (const [y, mat, w] of [[railH, cyan, 0.08], [railH * 0.5, magenta, 0.05]]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(w, w, deckLen, 6), mat);
      rail.rotation.x = Math.PI / 2;
      const holder = new THREE.Group();
      holder.add(rail);
      holder.rotation.y = yaw;
      const p = f.at(deckFrom + deckLen / 2, s * (GATE.half + 0.1));
      holder.position.set(p.x, A.y + y, p.z);
      group.add(holder);
    }
  }
  // The torii's outline: up each pillar's outer edge and along both beams.
  const glowBox = (w, h, d, along, side, y, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    const p = f.at(along, side);
    m.position.set(p.x, y, p.z);
    m.rotation.y = yaw;
    group.add(m);
  };
  for (const s of [-1, 1]) {
    for (const e of [-0.6, 0.6]) {
      glowBox(0.12, GATE.kasagi - 1.0, 0.12, f.ring + e, s * (P + 0.42), A.y + (GATE.kasagi - 1.0) / 2 + 0.6, cyan);
    }
  }
  glowBox(P * 2 + 4.2, 0.1, 0.1, f.ring - 0.42, 0, A.y + GATE.kasagi - 0.33, magenta);
  glowBox(P * 2 + 4.2, 0.1, 0.1, f.ring + 0.42, 0, A.y + GATE.kasagi - 0.33, magenta);
  glowBox(P * 2 + 3.2, 0.08, 0.08, f.ring - 0.34, 0, A.y + GATE.nuki - 0.32, cyan);
  glowBox(P * 2 + 3.2, 0.08, 0.08, f.ring + 0.34, 0, A.y + GATE.nuki - 0.32, cyan);
  // The lanterns: a warm core in a paper shade, swaying a little (`update`).
  const lanterns = [];
  for (const s of [-1, 1]) {
    const lan = new THREE.Group();
    const shade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 1.1, 12),
      new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.85, toneMapped: false })
    );
    const capT = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.52, 0.18, 12), new THREE.MeshBasicMaterial({ color: CAP }));
    capT.position.y = 0.64;
    const capB = capT.clone();
    capB.position.y = -0.64;
    capB.rotation.x = Math.PI;
    lan.add(shade, capT, capB);
    const lp = f.at(f.ring, s * (P + 2.3));
    lan.position.set(lp.x, A.y + GATE.kasagi - 1.4, lp.z);
    group.add(lan);
    lanterns.push(lan);
  }

  // The plaque, both faces, between the beams.
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(1.35, 2.0),
    new THREE.MeshBasicMaterial({ map: plaqueTexture(), side: THREE.DoubleSide, toneMapped: false })
  );
  const pp = f.at(f.ring, 0);
  plaque.position.set(pp.x, A.y + (GATE.nuki + GATE.kasagi) / 2, pp.z);
  plaque.rotation.y = yaw;
  group.add(plaque);
  const back = plaque.clone();
  plaque.position.x += f.dir.x * 0.22;
  plaque.position.z += f.dir.z * 0.22;
  back.position.x -= f.dir.x * 0.22;
  back.position.z -= f.dir.z * 0.22;
  group.add(back);

  // The light in the opening.
  const uniforms = { uTime: { value: 0 } };
  const portal = new THREE.Mesh(
    new THREE.PlaneGeometry(P * 2 - 1.1, GATE.nuki - 0.3),
    new THREE.ShaderMaterial({
      vertexShader: PORTAL_VERT, fragmentShader: PORTAL_FRAG, uniforms,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    })
  );
  portal.position.set(pp.x, A.y + (GATE.nuki - 0.3) / 2, pp.z);
  portal.rotation.y = yaw;
  portal.renderOrder = 6;
  group.add(portal);

  /* CHEVRONS on the deck, pointing in, so a kitten on the landing reads the
     way before she reads anything else. They pulse in turn (`update`). */
  const chev = [];
  for (const d of [f.ring + 1.6, f.ring - 1.8, f.ring - 4.2]) {
    const shape = new THREE.Shape();
    shape.moveTo(-1.3, 0.55);
    shape.lineTo(0, -0.55);
    shape.lineTo(1.3, 0.55);
    shape.lineTo(1.3, 1.05);
    shape.lineTo(0, -0.05);
    shape.lineTo(-1.3, 1.05);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: HOLO.magenta, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false });
    const m = new THREE.Mesh(geo, mat);
    const p = f.at(d, 0);
    m.position.set(p.x, A.y + 0.04, p.z);
    // Laid flat, the shape's point is at +z; turn that onto -dir, at the pad.
    m.rotation.y = Math.atan2(-f.dir.x, -f.dir.z);
    group.add(m);
    chev.push(mat);
  }

  return {
    portal, plaque, ringRail,
    update(t) {
      uniforms.uTime.value = t;
      chev.forEach((m, i) => { m.opacity = 0.35 + 0.55 * Math.max(0, Math.sin(t * 3 - i * 0.9)); });
      lanterns.forEach((l, i) => { l.rotation.z = Math.sin(t * 1.3 + i * 2) * 0.06; });
    },
  };
}
