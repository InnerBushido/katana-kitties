import * as THREE from 'three';
import { toonVertexMat, toonMat, paint } from '../../core/gfx.js';
import { mergeParts } from '../../world/build.js';

/* ---------------------------------------------------------------------------
   Vendored Polyfork models, with a drawn stand-in for every one.

   THE FILES LIVE IN public/models/polyfork/ AND NOWHERE ELSE. Polyfork's
   account CDN would hotlink them, and the game never does: Richard has the
   Lifetime plan, files downloaded under it stay licensed, and a game that
   needs somebody else's server to draw a lantern is a game that one day
   draws no lantern. Non-negotiable 9 the same way the voices and music
   honour it: delete the folder and every item still appears, as the
   procedural stand-in it was drawn as before the model arrived.

   A PLACED ITEM IS A GROUP THAT STARTS WITH ITS STAND-IN and swaps it for the
   model when (if) the model loads. Nothing that placed it has to wait, and
   nothing has to know which one it got — the footprint is the catalogue's,
   not the mesh's, so a slow network cannot move a collider.

   MATERIALS ARE REPLACED, NOT KEPT. Polyfork paints in COLOR_0 under a PBR
   material authored for a physically-lit scene; this game is toon-shaded with
   vertex colours everywhere (`toonVertexMat`), and a single PBR prop in a
   toon garden reads as a photograph pasted into a cartoon.

   Headless (world-check) there is no `fetch` for a relative URL, so `load`
   resolves null and the stand-in stays — which is exactly what the check
   should be measuring.
--------------------------------------------------------------------------- */

const BASE = '/models/polyfork/';
const cache = new Map();
let loader = null;

async function getLoader() {
  if (loader) return loader;
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  loader = new GLTFLoader();
  return loader;
}

/** The model as a fresh clone, or null if it is missing or cannot load. */
export function loadModel(id) {
  if (!id) return Promise.resolve(null);
  if (!cache.has(id)) {
    const p = (async () => {
      if (typeof window === 'undefined' || typeof fetch !== 'function' || !globalThis.location) return null;
      try {
        const L = await getLoader();
        const gltf = await L.loadAsync(`${BASE}${id}.glb`);
        const root = gltf.scene;
        const vmat = toonVertexMat();
        root.traverse((o) => {
          if (!o.isMesh) return;
          const g = o.geometry;
          if (g.attributes.color) o.material = vmat;
          else {
            const c = o.material?.color ?? new THREE.Color(0xcccccc);
            o.material = toonMat({ color: c });
          }
          o.castShadow = false;
          o.receiveShadow = false;
        });
        root.userData.clips = gltf.animations ?? [];
        return root;
      } catch (e) {
        console.warn(`[housing] model ${id} not loaded, keeping its stand-in`, e?.message ?? e);
        return null;
      }
    })();
    cache.set(id, p);
  }
  return cache.get(id).then((root) => (root ? root.clone(true) : null));
}

const _box = new THREE.Box3();
const _v = new THREE.Vector3();

/**
 * Scale `obj` uniformly so it is `size.h` tall or `size.w` across (its wider
 * of x and z), MEASURED off its own geometry, and sit it on the ground.
 * Neither a Polyfork file's metres nor a stand-in's units are this game's
 * scale (a kitten is 2.9 tall), and reasoned sizes have been wrong roughly
 * every time — CLAUDE.md, "measure, don't reason, about anything drawn".
 * No size = leave it as it is. A degenerate box leaves it alone too.
 */
export function fitTo(obj, size) {
  if (!obj || !size) return obj;
  obj.scale.setScalar(1);
  obj.position.set(0, 0, 0);
  obj.updateMatrixWorld(true);
  _box.setFromObject(obj);
  if (_box.isEmpty()) return obj;
  _box.getSize(_v);
  const s = size.h ? size.h / _v.y : size.w / Math.max(_v.x, _v.z);
  if (!(s > 0) || !Number.isFinite(s)) return obj;
  obj.scale.setScalar(s);
  obj.position.y = -_box.min.y * s;
  obj.userData.fitScale = s;
  return obj;
}

/** A group holding `standIn` now and the model later, both fitted to `size`. */
export function placeModel(id, standIn, size = null) {
  const g = new THREE.Group();
  if (standIn) g.add(fitTo(standIn, size));
  g.userData.modelId = id ?? null;
  if (id) {
    loadModel(id).then((m) => {
      if (!m || g.userData.disposed) return;
      if (standIn) g.remove(standIn);
      g.add(fitTo(m, size));
      g.userData.real = true;
      g.userData.onReal?.(g);
    });
  }
  return g;
}

/* --------------------------- drawn stand-ins ---------------------------- */

const box = (w, h, d, c, x = 0, y = 0, z = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  paint(g, c);
  g.translate(x, y + h / 2, z);
  return g;
};
const cyl = (rt, rb, h, c, x = 0, y = 0, z = 0, seg = 10) => {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  paint(g, c);
  g.translate(x, y + h / 2, z);
  return g;
};
const ball = (r, c, x = 0, y = 0, z = 0, sy = 1) => {
  const g = new THREE.SphereGeometry(r, 10, 8);
  g.scale(1, sy, 1);
  paint(g, c);
  g.translate(x, y, z);
  return g;
};

/* ONE material for every stand-in: they are all vertex-painted, and a garden
   of thirty props on thirty materials is thirty program switches. */
let SHARED = null;
function mesh(parts) {
  SHARED ??= toonVertexMat();
  return new THREE.Mesh(mergeParts(parts), SHARED);
}

/**
 * The procedural version of an item, in world units, origin on the ground.
 * `sz` is the footprint the catalogue gives it, so a stand-in fills the cells
 * it was sold as filling.
 */
export function drawItem(id, sz = 2, opts = {}) {
  const W = sz;
  switch (id) {
    case 'futon': return mesh([box(1.6, 0.25, 3.4, 0xf4efe2), box(1.6, 0.12, 2.2, 0x6f8fd8, 0, 0.25, 0.5), box(1.1, 0.2, 0.6, 0xffffff, 0, 0.25, -1.3)]);
    case 'kotatsu': return mesh([box(3, 0.12, 3, 0x7a4a2a, 0, 0.75), box(3.4, 0.6, 3.4, 0xc0504d), cyl(0.3, 0.3, 0.08, 0xffd27a, 0.6, 0.88, 0.4)]);
    case 'tansu': return mesh([box(1.6, 1.6, 1, 0x8a5a32), box(1.5, 0.05, 0.05, 0x2a1a10, 0, 0.55, 0.52), box(1.5, 0.05, 0.05, 0x2a1a10, 0, 1.1, 0.52)]);
    case 'kitchen': return mesh([box(3.6, 1.0, 1.4, 0x9a6a3a), box(3.6, 0.08, 1.4, 0xd8d0c0, 0, 1.0), cyl(0.4, 0.35, 0.3, 0x333333, -0.8, 1.08), cyl(0.35, 0.3, 0.25, 0x555555, 0.8, 1.08)]);
    case 'andon': return mesh([box(0.6, 1.2, 0.6, 0xfff2c8), box(0.7, 0.08, 0.7, 0x4a2a18, 0, 1.2)]);
    case 'yoroi': return mesh([box(0.9, 1.1, 0.6, 0xa02020, 0, 0.6), ball(0.35, 0x222222, 0, 1.95), box(1.2, 0.08, 0.1, 0x3a2a1a, 0, 1.5)]);
    case 'katana': return mesh([box(1.2, 0.5, 0.4, 0x3a2416), box(1.4, 0.06, 0.08, 0x111111, 0, 0.62)]);
    case 'drum': return mesh([box(1.2, 0.8, 0.5, 0x5a3a20), cyl(0.7, 0.7, 0.8, 0xc84a2a, 0, 1.2, 0, 14)]);
    case 'bucket': return mesh([cyl(0.35, 0.3, 0.5, 0xb08850)]);
    case 'sake': return mesh([cyl(0.55, 0.5, 1.0, 0xe8dcc0, 0, 0, 0, 12)]);
    case 'shrine': return mesh([box(2.4, 0.4, 2.4, 0x9a9a92), box(1.6, 1.6, 1.6, 0xc8302a, 0, 0.4), box(2.6, 0.3, 2.6, 0x2a2a3a, 0, 2.0), box(1.6, 0.25, 1.6, 0x2a2a3a, 0, 2.6)]);
    case 'well': return mesh([cyl(1, 1, 0.9, 0x8a8a84, 0, 0, 0, 12), box(0.15, 2.4, 0.15, 0x5a3a20, -0.9), box(0.15, 2.4, 0.15, 0x5a3a20, 0.9), box(2.4, 0.2, 1.6, 0x3a3a4a, 0, 2.4)]);
    case 'waterwheel': return mesh([cyl(1.6, 1.6, 0.4, 0x7a5030, 0, 0, 0, 16).rotateX(Math.PI / 2).translate(0, 1.6, 0)]);
    case 'belltower': return mesh([box(3, 0.4, 3, 0x8a8a84), box(0.25, 4, 0.25, 0x5a3a20, -1.2, 0.4, -1.2), box(0.25, 4, 0.25, 0x5a3a20, 1.2, 0.4, 1.2), box(0.25, 4, 0.25, 0x5a3a20, -1.2, 0.4, 1.2), box(0.25, 4, 0.25, 0x5a3a20, 1.2, 0.4, -1.2), box(3.6, 0.4, 3.6, 0x2a2a3a, 0, 4.4), cyl(0.5, 0.7, 1.2, 0x7a6a30, 0, 3)]);
    case 'teahouse': return mesh([box(4, 0.3, 4, 0x8a6a40), box(0.2, 2.6, 0.2, 0x5a3a20, -1.8, 0.3, -1.8), box(0.2, 2.6, 0.2, 0x5a3a20, 1.8, 0.3, -1.8), box(4, 2.2, 0.2, 0xf0e6cc, 0, 0.3, -1.9), box(4.6, 0.4, 4.6, 0x3a3a4a, 0, 2.9)]);
    case 'basin': return mesh([cyl(0.6, 0.7, 0.6, 0x8a8a84, 0, 0, 0, 10), cyl(0.45, 0.45, 0.05, 0x5aa0d0, 0, 0.6)]);
    case 'lantern': return mesh([box(0.5, 0.2, 0.5, 0xa0a098), box(0.2, 0.7, 0.2, 0xa0a098, 0, 0.2), box(0.6, 0.45, 0.6, 0xfff0b0, 0, 0.9), box(0.8, 0.15, 0.8, 0xa0a098, 0, 1.35)]);
    case 'maple': return mesh([cyl(0.18, 0.25, 1.8, 0x5a3a20), ball(1.6, 0xd04a2a, 0, 2.6, 0, 0.7)]);
    case 'cherry': return mesh([cyl(0.2, 0.3, 2.2, 0x5a3a20), ball(2.1, 0xf6b5cf, 0, 3.2, 0, 0.7)]);
    case 'pine': return mesh([cyl(0.18, 0.25, 2, 0x5a3a20), ball(1.2, 0x2f6a3a, 0.6, 2.3, 0, 0.45), ball(1.0, 0x2f6a3a, -0.6, 2.8, 0.2, 0.45)]);
    case 'azalea': return mesh([ball(0.55, 0xe05a9a, 0, 0.4, 0, 0.8)]);
    case 'fence': return mesh([box(2, 1.5, 0.15, 0xc8b070), box(2, 0.08, 0.22, 0x3a6a2a, 0, 0.5), box(2, 0.08, 0.22, 0x3a6a2a, 0, 1.1)]);
    case 'firebasket': return mesh([cyl(0.05, 0.05, 1.0, 0x222222), cyl(0.35, 0.2, 0.35, 0x222222, 0, 1.0), ball(0.25, 0xffa040, 0, 1.45)]);
    case 'bench': return mesh([box(1.5, 0.1, 0.5, 0xc0302a, 0, 0.4), box(0.1, 0.4, 0.4, 0x5a3a20, -0.6), box(0.1, 0.4, 0.4, 0x5a3a20, 0.6)]);
    case 'banner': return mesh([cyl(0.05, 0.05, 3.2, 0x222222), box(0.8, 2.2, 0.04, 0xf0e8d0, 0.42, 0.8)]);
    case 'paddy': return mesh([box(2, 0.1, 2, 0x6aa04a), box(2.1, 0.15, 0.1, 0x7a5a3a, 0, 0, 1), box(2.1, 0.15, 0.1, 0x7a5a3a, 0, 0, -1)]);
    case 'reeds': return mesh([cyl(0.04, 0.04, 1.6, 0x6a9a3a, -0.2), cyl(0.04, 0.04, 1.4, 0x6a9a3a, 0.2, 0, 0.1), cyl(0.04, 0.04, 1.7, 0x6a9a3a, 0, 0, -0.2)]);
    case 'stones': return mesh([0, 1, 2, 3, 4].map((k) => cyl(0.6, 0.7, 0.3, 0x9a9a92, (k - 2) * 1.6, 0, Math.sin(k * 1.7) * 0.8, 9)));
    case 'toriigarden': return mesh([0, 1, 2].flatMap((k) => [
      box(0.2, 2.4, 0.2, 0xd8382a, -0.9, 0, (k - 1) * 2.4), box(0.2, 2.4, 0.2, 0xd8382a, 0.9, 0, (k - 1) * 2.4),
      box(2.6, 0.2, 0.3, 0x222222, 0, 2.4, (k - 1) * 2.4), box(2.2, 0.15, 0.2, 0xd8382a, 0, 1.9, (k - 1) * 2.4)]));
    case 'treehouse': return mesh([cyl(0.5, 0.7, 5, 0x5a3a20), ball(3.4, 0xf6b5cf, 0, 7.6, 0, 0.6), box(3, 0.2, 3, 0x8a6a40, 0, 4.6), box(2.4, 1.8, 2.4, 0xd8b880, 0, 4.8), box(2.8, 0.3, 2.8, 0x8a3a2a, 0, 6.6), box(0.6, 4.6, 0.1, 0x7a5a3a, 1.7, 0, 0)]);
    /* WALL THINGS — drawn facing +z, their back on z = 0 (the wall), their
       bottom at y = 0; homeisle.js lifts them to their height on the wall. */
    case 'window': return mesh([
      box(2.0, 1.7, 0.1, 0x3a2418, 0, 0, 0.05),
      box(1.7, 1.4, 0.06, 0xbfe3f2, 0, 0.15, 0.1),
      ...[0, 1, 2].map((k) => box(0.06, 1.4, 0.1, 0x5a3a20, -0.57 + k * 0.57, 0.15, 0.14)),
      box(1.7, 0.06, 0.1, 0x5a3a20, 0, 0.82, 0.14),
      box(2.2, 0.12, 0.3, 0x5a3a20, 0, -0.06, 0.15)]);
    case 'scroll': return mesh([
      box(1.0, 2.4, 0.03, 0xf3ead2, 0, 0, 0.03), box(0.9, 1.8, 0.035, 0xfffaee, 0, 0.3, 0.04),
      box(1.2, 0.1, 0.1, 0x3a2418, 0, 2.38, 0.06),
      box(1.2, 0.12, 0.12, 0x3a2418, 0, -0.04, 0.06),
      box(0.42, 0.42, 0.04, 0x1a1a1a, 0, 1.2, 0.06), box(0.3, 0.3, 0.05, 0xfffaee, 0.05, 1.27, 0.06)]);
    case 'picture': return mesh([
      box(1.8, 1.3, 0.1, 0x8a5a32, 0, 0, 0.05), box(1.55, 1.05, 0.04, 0x7fc0e0, 0, 0.12, 0.1),
      box(1.55, 0.35, 0.05, 0x3a7a9a, 0, 0.12, 0.11), cyl(0.18, 0.18, 0.04, 0xffffff, 0.4, 0.75, 0.12)]);
    case 'trophy': {
      const n = Math.max(0, Math.min(8, opts.cups ?? 0));
      const parts = [box(2.0, 0.12, 0.6, 0x5a3a20, 0, 0, 0.3), box(2.0, 0.8, 0.06, 0x3a2418, 0, -0.75, 0.03)];
      for (let k = 0; k < Math.max(1, n); k++) {
        const x = -0.8 + (n > 1 ? (1.6 * k) / (n - 1) : 0.8);
        const c = n ? 0xffcf3a : 0x8a8a84; // an empty shelf holds a grey stand-in cup
        parts.push(cyl(0.08, 0.12, 0.12, c, x, 0.12, 0.32), cyl(0.04, 0.04, 0.16, c, x, 0.24, 0.32), cyl(0.17, 0.07, 0.28, c, x, 0.4, 0.32));
      }
      return mesh(parts);
    }
    default: return mesh([box(W * 0.8, 0.8, W * 0.8, 0xc8b8a0)]);
  }
}
