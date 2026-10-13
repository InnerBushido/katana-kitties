import * as THREE from 'three';
import { toonVertexMat, toonMat, paint } from '../../core/gfx.js';
import { mergeParts } from '../../world/build.js';

/* ---------------------------------------------------------------------------
   Her statue at the foot of her bridge.

   TWO VERSIONS, AND THE SECOND ONE IS THE REAL ONE. Richard asked for Tripo
   image-to-3D off each kitten's own sprite (`tools/statue-bake.mjs` writes
   `public/models/statues/<sheet>.glb` — ember and frost, the two drawn
   sheets; Storm and Blossom are recolours of them in the game and are here
   too). Until that file exists, and forever if it is deleted, the statue is
   this drawn one: a sitting cat in stone on a plinth, with a sash and a
   headband in her colour. PLACEHOLDER — see docs/notes/housing.md.

   THE COLOUR IS A MATERIAL, NOT A REPAINT, the house's rule: the stone is
   vertex-painted and never changes, and the sash, the headband and the
   plinth's band are white under `accentMat`, whose colour is hers. A
   generated statue is tinted the same way — its whole material is lerped
   toward her colour (`tintGenerated`) — which is how Storm gets a teal statue
   out of Ember's model without a third Tripo run.
--------------------------------------------------------------------------- */

const STONE = 0xb9b4ac;
const STONE_DARK = 0x8d877f;

function lathe(points, colour, seg = 18) {
  const g = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  paint(g, colour);
  return g;
}

/** The drawn statue: returns { group, accentMat }. About 4.2 tall. */
export function drawStatue() {
  const stone = [];
  const accent = [];
  // plinth
  const pl = new THREE.CylinderGeometry(1.7, 1.9, 1.2, 8);
  paint(pl, STONE_DARK);
  pl.translate(0, 0.6, 0);
  stone.push(pl);
  const band = new THREE.CylinderGeometry(1.75, 1.75, 0.25, 8);
  paint(band, 0xffffff);
  band.translate(0, 0.95, 0);
  accent.push(band);
  // sitting body
  const body = lathe([[0, 0], [1.05, 0.05], [1.15, 0.6], [0.95, 1.4], [0.6, 2.0], [0, 2.1]], STONE);
  body.translate(0, 1.2, 0);
  stone.push(body);
  // head
  const head = new THREE.SphereGeometry(0.78, 16, 12);
  head.scale(1.05, 0.92, 0.95);
  paint(head, STONE);
  head.translate(0, 3.55, 0.05);
  stone.push(head);
  for (const s of [-1, 1]) {
    const ear = new THREE.ConeGeometry(0.28, 0.6, 4);
    paint(ear, STONE);
    ear.rotateZ(-s * 0.35);
    ear.translate(s * 0.48, 4.25, 0);
    stone.push(ear);
    const paw = new THREE.SphereGeometry(0.28, 8, 6);
    paint(paw, STONE);
    paw.translate(s * 0.38, 1.35, 0.95);
    stone.push(paw);
  }
  /* A FACE. Without one the statue reads the same from both sides, and the
     purchase scene's first take could not tell which way she was looking. */
  for (const s of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.11, 8, 6);
    eye.scale(1, 1.3, 0.6);
    paint(eye, 0x2a2622);
    eye.translate(s * 0.28, 3.65, 0.76);
    stone.push(eye);
  }
  const nose = new THREE.ConeGeometry(0.09, 0.14, 3);
  nose.rotateX(Math.PI);
  paint(nose, 0x6a5f58);
  nose.translate(0, 3.42, 0.82);
  stone.push(nose);
  // tail curled round the front
  const tail = new THREE.TorusGeometry(0.9, 0.16, 6, 14, Math.PI * 1.2);
  paint(tail, STONE);
  tail.rotateX(Math.PI / 2);
  tail.translate(0, 1.35, 0.2);
  stone.push(tail);
  // her colours: a sash across the chest and a headband
  const sash = new THREE.TorusGeometry(0.98, 0.12, 6, 18);
  paint(sash, 0xffffff);
  sash.rotateX(Math.PI / 2);
  sash.rotateZ(0.5);
  sash.translate(0, 2.5, 0);
  accent.push(sash);
  const hb = new THREE.TorusGeometry(0.8, 0.1, 6, 18);
  paint(hb, 0xffffff);
  hb.rotateX(Math.PI / 2);
  hb.translate(0, 3.75, 0.04);
  accent.push(hb);
  // a katana resting across the paws
  const kat = new THREE.BoxGeometry(2.2, 0.08, 0.12);
  paint(kat, 0x3a3a3a);
  kat.translate(0, 1.6, 1.15);
  stone.push(kat);

  const group = new THREE.Group();
  group.add(new THREE.Mesh(mergeParts(stone), toonVertexMat()));
  const accentMat = toonVertexMat({ color: 0xffffff });
  group.add(new THREE.Mesh(mergeParts(accent), accentMat));
  return { group, accentMat };
}

/** Whether a generated statue is on disk, per sheet; filled by `probe`. */
const GENERATED = new Map();

/**
 * The Tripo statue for a sheet, or null. Cached per sheet; every call hands
 * back a fresh clone with its own materials so two statues can wear two
 * colours.
 */
export async function loadGenerated(sheet) {
  if (typeof window === 'undefined' || !globalThis.location) return null;
  if (!GENERATED.has(sheet)) {
    GENERATED.set(sheet, (async () => {
      try {
        const head = await fetch(`/models/statues/${sheet}.glb`, { method: 'HEAD' });
        if (!head.ok) return null;
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const gltf = await new GLTFLoader().loadAsync(`/models/statues/${sheet}.glb`);
        return gltf.scene;
      } catch {
        return null;
      }
    })());
  }
  const root = await GENERATED.get(sheet);
  if (!root) return null;
  const c = root.clone(true);
  /* Measured, not assumed: a generated mesh comes in at whatever scale and
     origin the generator chose. Stand it on the ground and make it 4.2 tall,
     the drawn statue's height, so the plinth and the bridge do not care which
     one they got. */
  const b = new THREE.Box3().setFromObject(c);
  const h = b.max.y - b.min.y || 1;
  const s = 4.2 / h;
  c.scale.setScalar(s);
  c.position.set(-(b.min.x + b.max.x) / 2 * s, -b.min.y * s + 1.2, -(b.min.z + b.max.z) / 2 * s);
  const mats = [];
  c.traverse((o) => {
    if (!o.isMesh) return;
    const tex = o.material?.map ?? null;
    o.material = tex ? toonMat({ map: tex }) : toonVertexMat();
    mats.push(o.material);
  });
  /* ITS OWN PLINTH. The bridge hides every drawn part when this arrives —
     plinth included — and the `+ 1.2` above is the plinth's height, so for a
     while the generated statue stood on nothing, 1.2 in the air. The same
     plinth as the drawn one, and the same band, whose colour is hers outright
     (`userData.accent`) where the stone above only takes a wash. */
  const out = new THREE.Group();
  const pl = new THREE.CylinderGeometry(1.7, 1.9, 1.2, 8);
  paint(pl, STONE_DARK);
  pl.translate(0, 0.6, 0);
  out.add(new THREE.Mesh(pl, toonVertexMat()));
  const band = new THREE.CylinderGeometry(1.75, 1.75, 0.25, 8);
  paint(band, 0xffffff);
  band.translate(0, 0.95, 0);
  const bandMat = toonVertexMat({ color: 0xffffff });
  bandMat.userData.accent = true;
  out.add(new THREE.Mesh(band, bandMat));
  mats.push(bandMat);
  out.add(c);
  return { root: out, mats };
}

/**
 * Lerp a generated statue's materials toward her colour by `k` (0..1).
 *
 * A WASH, NOT A PAINT: 0.3 of the way. The take's texture is stone now (baked
 * to warm grey by tools/capture/statue-shrink.mjs — Richard: "they don't match
 * the lighting or shaders"; it was her full-colour drawing, lit twice, pulled
 * 55% toward one colour), so this only has to say WHOSE statue it is, the way
 * the drawn one's sash does. At 0.55 the stone went the colour of the paint.
 */
export function tintGenerated(mats, colour, k) {
  const c = new THREE.Color(0xffffff).lerp(new THREE.Color(colour), k * 0.3);
  for (const m of mats) m.color.copy(m.userData.accent ? new THREE.Color(colour) : c);
}
