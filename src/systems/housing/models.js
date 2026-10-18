import * as THREE from 'three';
import { toonVertexMat, toonMat, paint } from '../../core/gfx.js';
import { mergeParts, PALETTE } from '../../world/build.js';
import { MODEL_STYLES } from './modelstyles.js';

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
        /* `props/<id>` is a Tripo take (tools/prop-bake.mjs), not Polyfork:
           it lives in its own folder and carries a TEXTURE rather than vertex
           colours, which the toon material below must keep. */
        const gltf = await L.loadAsync(id.includes('/') ? `/models/${id}.glb` : `${BASE}${id}.glb`);
        const root = gltf.scene;
        const vmat = toonVertexMat();
        root.traverse((o) => {
          if (!o.isMesh) return;
          const g = o.geometry;
          if (g.attributes.color) o.material = vmat;
          else if (o.material?.map) o.material = toonMat({ map: o.material.map });
          else {
            const c = o.material?.color ?? new THREE.Color(0xcccccc);
            o.material = toonMat({ color: c });
          }
          o.castShadow = false;
          o.receiveShadow = false;
        });
        root.userData.clips = gltf.animations ?? [];
        READY.set(id, root);
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

/**
 * THE MODELS ALREADY LOADED, by id, for `placeModel` to use WITHOUT A PROMISE.
 * Richard, Oct 2026: "All the 3D models blink as if respawning while
 * customising an object or furniture." Every change to a home rebuilds its
 * island (`HomeIsle.rebuildItems`), and `placeModel` put the drawn stand-in
 * in and swapped the real model in on a `.then` — a microtask, which runs
 * AFTER the frame that did the rebuild has been drawn. So every slider step
 * drew one frame of every stand-in on the island: the whole garden turned
 * into boxes and back. A model that has loaded once is now placed at once.
 */
const READY = new Map();

/** For world-check, which has no fetch: as if `id` had loaded as `root`. */
export function primeModel(id, root) { READY.set(id, root); cache.set(id, Promise.resolve(root)); }

/** A clone of model `id` if it has already loaded, else null (and the caller waits). */
export function modelNow(id) {
  const root = id ? READY.get(id) : null;
  return root ? root.clone(true) : null;
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
 *
 * `look` is the player's customisation (ITEM CUSTOMIZATION, cards.js): `s`
 * multiplies the catalogue size, and `cap` is the box it must stay inside in
 * its own frame — for a room thing, under the ceiling and inside its own
 * tatami. THE CAP BINDS EVEN AT s = 1. The katana was `size: { w: 3.4 }`,
 * meant as its length lying down; the model stands UP (0.10 x 1.02 x 0.10
 * metres), so "3.4 across" made it 35 tall and it went through two roofs.
 * A wrong catalogue number can no longer do that: whatever it says, nothing
 * in a room comes out taller than the room. `userData.maxMul` is the largest
 * `s` the cap allows, which is what greys out BIGGER.
 */
export function fitTo(obj, size, look = null) {
  if (!obj || !size) return obj;
  if (size.box) return fitBox(obj, size);
  obj.scale.setScalar(1);
  obj.position.set(0, 0, 0);
  obj.updateMatrixWorld(true);
  _box.setFromObject(obj);
  if (_box.isEmpty()) return obj;
  _box.getSize(_v);
  const s = size.h ? size.h / _v.y : size.w / Math.max(_v.x, _v.z);
  if (!(s > 0) || !Number.isFinite(s)) return obj;
  let max = Infinity;
  const cap = look?.cap;
  if (cap) {
    if (cap.y) max = Math.min(max, cap.y / (_v.y * s));
    if (cap.x) max = Math.min(max, cap.x / (_v.x * s));
    if (cap.z) max = Math.min(max, cap.z / (_v.z * s));
  }
  const m = Math.min(clampMul(look?.s), max);
  obj.scale.setScalar(s * m);
  obj.position.y = -_box.min.y * s * m;
  obj.userData.fitScale = s * m;
  obj.userData.maxMul = max;
  return obj;
}

/**
 * STRETCH TO A BOX. A door panel or a window is whatever size its hole is,
 * not the model's own proportions: `size.box` = {x, y, z} in the parent's
 * frame, `size.ry` a quarter-turn applied first (a Tripo take faces where it
 * likes — the shoji came back facing +x). Returns a wrapper, so the turn and
 * the non-uniform scale do not fight; it stands on y = 0, centred in x and z.
 */
function fitBox(obj, size) {
  const wrap = new THREE.Group();
  obj.scale.setScalar(1);
  obj.position.set(0, 0, 0);
  obj.rotation.y = size.ry ?? 0;
  wrap.add(obj);
  wrap.updateMatrixWorld(true);
  _box.setFromObject(obj);
  if (_box.isEmpty()) return obj;
  _box.getSize(_v);
  const c = _box.getCenter(new THREE.Vector3());
  const k = new THREE.Vector3(size.box.x / (_v.x || 1), size.box.y / (_v.y || 1), size.box.z / (_v.z || 1));
  obj.position.set(-c.x, -_box.min.y, -c.z);
  wrap.scale.copy(k);
  return wrap;
}

/** How far a player may resize a thing: half to half again. */
export const LOOK_MUL = { min: 0.5, max: 1.5, step: 0.1 };
export const clampMul = (s) => (Number.isFinite(s) ? Math.max(LOOK_MUL.min, Math.min(LOOK_MUL.max, s)) : 1);

/**
 * PAINT FOR THE DRAWN THINGS. A Polyfork model has its own colourways
 * (MODEL_STYLES, read off its params by tools/polyfork-styles.mjs); a
 * stand-in drawn in this file has none, so it gets a lacquer: a multiply
 * over its vertex colours.
 */
export const TINTS = [
  { id: 'natural', name: 'AS IT CAME', c: null },
  { id: 'lacquer', name: 'RED LACQUER', c: 0xe0786a },
  { id: 'sumi', name: 'SUMI BLACK', c: 0x6a6a78 },
  { id: 'gold', name: 'GOLD LEAF', c: 0xffd98a },
  { id: 'sakura', name: 'SAKURA PINK', c: 0xffc2d4 },
  { id: 'hinoki', name: 'PALE HINOKI', c: 0xfff2dc },
];

/** The looks one thing can have: its model's colourways, or the tints. */
export function stylesFor(modelId) {
  const S = modelId && MODEL_STYLES[modelId];
  if (S) return S.styles.map((x) => ({ id: x.id, name: x.id.replace(/-/g, ' ').toUpperCase() }));
  return TINTS.map((t) => ({ id: t.id, name: t.name }));
}

/**
 * Repaint `root` (a loaded model) as colourway `style`. The default build's
 * zone colours are in COLOR_0 EXACTLY, in linear space — measured: all six of
 * the katana's, all seven of the yoroi's, all five of the stone lantern's —
 * so each vertex within a hair of a zone's default becomes that zone in the
 * preset. Geometry is cloned first: `loadModel` hands out clones that SHARE
 * buffers, and painting one would paint every katana in every house.
 */
export function styleModel(root, modelId, style) {
  const S = MODEL_STYLES[modelId]?.styles.find((x) => x.id === style);
  if (!root || !S || !S.swap.length) return root;
  const swaps = S.swap.map(([f, t]) => [new THREE.Color(f), new THREE.Color(t)]);
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry.attributes.color) return;
    o.geometry = o.geometry.clone();
    const c = o.geometry.attributes.color;
    for (let i = 0; i < c.count; i++) {
      const r = c.getX(i); const g = c.getY(i); const b = c.getZ(i);
      for (const [f, t] of swaps) {
        if (Math.abs(r - f.r) + Math.abs(g - f.g) + Math.abs(b - f.b) < 0.006) { c.setXYZ(i, t.r, t.g, t.b); break; }
      }
    }
    c.needsUpdate = true;
  });
  return root;
}

/** A lacquer over a drawn stand-in: its own material, so only this one changes. */
export function tintObject(root, style) {
  const T = TINTS.find((t) => t.id === style);
  if (!root || !T?.c) return root;
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    o.material = o.material.clone();
    o.material.color?.multiply?.(new THREE.Color(T.c));
  });
  return root;
}

/**
 * A group holding `standIn` now and the model later, both fitted to `size`
 * and dressed in `look` ({ s, style, cap } — see `fitTo`). The group's
 * `userData.maxMul` is the CURRENT body's, so it is the model's once it has
 * loaded: the stand-in and the model are not the same shape.
 */
export function placeModel(id, standIn, size = null, look = null) {
  const g = new THREE.Group();
  const hasStyles = !!(id && MODEL_STYLES[id]);
  if (standIn) {
    g.add(fitTo(standIn, size, look));
    if (!hasStyles && look?.style) tintObject(standIn, look.style);
    g.userData.maxMul = standIn.userData.maxMul;
  }
  g.userData.modelId = id ?? null;
  const real = (m) => {
    if (standIn) g.remove(standIn.parent === g ? standIn : standIn.parent);
    if (look?.style) {
      if (hasStyles) styleModel(m, id, look.style);
      else tintObject(m, look.style);
    }
    g.add(fitTo(m, size, look));
    g.userData.maxMul = m.userData.maxMul;
    g.userData.real = true;
  };
  const now = modelNow(id);
  if (now) {
    // already loaded: real from the first frame (`READY`). `onReal` is set by
    // the caller AFTER this returns, so it is still called a beat later — every
    // one of them is also applied to the whole group at once, and is idempotent.
    real(now);
    queueMicrotask(() => { if (!g.userData.disposed) g.userData.onReal?.(g); });
  } else if (id) {
    loadModel(id).then((m) => {
      if (!m || g.userData.disposed) return;
      real(m);
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
 * THE JUMPING STONES, one row each: centre (x, z) in the item's own frame,
 * radius, and the height of the top. Richard, Oct 2026: "Jumping stones
 * should be twice as big, more separated, with colliders" — they were r 0.6,
 * 1.6 apart and 0.3 tall, so they were a picture of stones: she walked
 * through them at ground level. Now r ~1.2, 3.4 apart in a zigzag, and the
 * tops vary 0.45..0.85 so it is a hop from one to the next. The drawing
 * (`drawItem('stones')`) and the decks she stands on (`HomeIsle._yardItem`)
 * both read this, so the top she lands on is the top she sees.
 */
export const STONES = [0, 1, 2, 3, 4].map((k) => ({
  x: (k - 2) * 3.4,
  z: Math.sin(k * 1.7) * 1.3,
  r: 1.1 + ((k * 7) % 3) * 0.1,
  h: [0.45, 0.7, 0.55, 0.85, 0.6][k],
}));

/** The generated shoji leaf every door and window is made of. */
export const SHOJI = 'props/shoji-door';
/** Shoji panels that meet run in two grooves this far either side of the middle. */
export const PANEL_GAP = 0.045;

/**
 * A PAIR OF SHOJI, closed: two paper leaves `w` wide between them and `h`
 * tall, origin at the middle of their foot, one PANEL_GAP in front of the
 * middle and one behind (two grooves — at one depth their overlap flickers).
 * The window in a wall (`HomeIsle._windowPanels`) and the window in the shop
 * (`drawItem('window')`) are both this, so the thing she buys is the thing
 * she gets. Richard, Oct 2026: "Shoji in furniture view should be the same
 * model as the actual shoji being placed on the walls."
 */
export function shojiPair(w, h, mat = null) {
  const pw = w / 2 + 0.06;
  const parts = [];
  const b = (bw, bh, bd, c, x, y) => { const s = new THREE.BoxGeometry(bw, bh, bd); paint(s, c); s.translate(x, y, 0); parts.push(s); };
  b(pw, h, 0.04, PALETTE.paper, 0, h / 2);
  for (const x of [-pw / 2 + 0.04, 0, pw / 2 - 0.04]) b(0.06, h, 0.07, PALETTE.woodDark, x, h / 2);
  for (const y of [0.03, h / 3, (h * 2) / 3, h - 0.03]) b(pw, 0.06, 0.07, PALETTE.woodDark, 0, y);
  const geo = mergeParts(parts);
  SHARED ??= toonVertexMat();
  const group = new THREE.Group();
  const panels = [-1, 1].map((sgn) => {
    const m = placeModel(SHOJI, new THREE.Mesh(geo, mat ?? SHARED), { box: { x: pw, y: h, z: 0.06 }, ry: Math.PI / 2 });
    m.position.set(sgn * w / 4, 0, sgn * PANEL_GAP);
    group.add(m);
    return m;
  });
  return { group, panels };
}

/**
 * The procedural version of an item, in world units, origin on the ground.
 * `sz` is the footprint the catalogue gives it, so a stand-in fills the cells
 * it was sold as filling.
 */
export function drawItem(id, sz = 2, opts = {}) {
  const W = sz;
  // a path piece's stand-in (the real one is homeisle.js `pathParts`)
  if (id.startsWith('path_')) return mesh([box(1.6, 0.1, 3.2, id === 'path_carpet' ? 0xc0202a : 0xb8a888)]);
  switch (id) {
    case 'futon': return mesh([box(1.6, 0.25, 3.4, 0xf4efe2), box(1.6, 0.12, 2.2, 0x6f8fd8, 0, 0.25, 0.5), box(1.1, 0.2, 0.6, 0xffffff, 0, 0.25, -1.3)]);
    case 'kotatsu': return mesh([box(3, 0.12, 3, 0x7a4a2a, 0, 0.75), box(3.4, 0.6, 3.4, 0xc0504d), cyl(0.3, 0.3, 0.08, 0xffd27a, 0.6, 0.88, 0.4)]);
    case 'tansu': return mesh([box(1.6, 1.6, 1, 0x8a5a32), box(1.5, 0.05, 0.05, 0x2a1a10, 0, 0.55, 0.52), box(1.5, 0.05, 0.05, 0x2a1a10, 0, 1.1, 0.52)]);
    case 'kitchen': return mesh([box(3.6, 1.0, 1.4, 0x9a6a3a), box(3.6, 0.08, 1.4, 0xd8d0c0, 0, 1.0), cyl(0.4, 0.35, 0.3, 0x333333, -0.8, 1.08), cyl(0.35, 0.3, 0.25, 0x555555, 0.8, 1.08)]);
    case 'andon': return mesh([box(0.6, 1.2, 0.6, 0xfff2c8), box(0.7, 0.08, 0.7, 0x4a2a18, 0, 1.2)]);
    case 'yoroi': return mesh([box(0.9, 1.1, 0.6, 0xa02020, 0, 0.6), ball(0.35, 0x222222, 0, 1.95), box(1.2, 0.08, 0.1, 0x3a2a1a, 0, 1.5)]);
    // upright, like the model it stands in for (0.10 x 1.02 x 0.10)
    case 'katana': return mesh([box(0.5, 0.12, 0.5, 0x3a2416), box(0.1, 1.0, 0.1, 0x8c2f2a, 0, 0.12), box(0.22, 0.04, 0.22, 0x3b3128, 0, 0.8)]);
    case 'drum': return mesh([box(1.2, 0.8, 0.5, 0x5a3a20), cyl(0.7, 0.7, 0.8, 0xc84a2a, 0, 1.2, 0, 14)]);
    case 'bucket': return mesh([cyl(0.35, 0.3, 0.5, 0xb08850)]);
    // the holodeck's kit, for build mode's ghost (homeisle.js draws the real one)
    case 'holotube': return mesh([cyl(1.55, 1.55, 0.3, 0x2f3446, 0, 0, 0, 16), cyl(1.25, 1.25, 3.5, 0x35d7f0, 0, 0.3, 0, 16)]);
    case 'holorack_headset': return mesh([cyl(0.8, 0.8, 0.45, 0x2f3446, 0, 0, 0, 14), box(0.7, 0.4, 0.5, 0x5ff6ff, 0, 1.0)]);
    case 'holorack_gloves': return mesh([cyl(0.8, 0.8, 0.45, 0x2f3446, 0, 0, 0, 14), box(0.7, 0.4, 0.5, 0xff4fd8, 0, 1.0)]);
    case 'holorack_suit': return mesh([cyl(0.8, 0.8, 0.45, 0x2f3446, 0, 0, 0, 14), box(0.7, 0.4, 0.5, 0xffd34a, 0, 1.0)]);
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
    // the shop's pictures of them; the yard draws the real ones (homeisle `torchParts` / `lampParts`)
    case 'tiki': return mesh([cyl(0.08, 0.1, 2.4, 0xb08a4a), cyl(0.22, 0.13, 0.38, 0x6a4a2a, 0, 2.36), ball(0.2, 0xffa63a, 0, 2.95, 0, 1.6)]);
    case 'pathlamp': return mesh([box(0.35, 0.5, 0.35, 0x8a857c), box(0.3, 0.32, 0.3, 0xfff0c8, 0, 0.5), box(0.5, 0.1, 0.5, 0x7a756e, 0, 0.82)]);
    case 'firebasket': return mesh([cyl(0.05, 0.05, 1.0, 0x222222), cyl(0.35, 0.2, 0.35, 0x222222, 0, 1.0), ball(0.25, 0xffa040, 0, 1.45)]);
    case 'bench': return mesh([box(1.5, 0.1, 0.5, 0xc0302a, 0, 0.4), box(0.1, 0.4, 0.4, 0x5a3a20, -0.6), box(0.1, 0.4, 0.4, 0x5a3a20, 0.6)]);
    case 'banner': return mesh([cyl(0.05, 0.05, 3.2, 0x222222), box(0.8, 2.2, 0.04, 0xf0e8d0, 0.42, 0.8)]);
    case 'paddy': return mesh([box(2, 0.1, 2, 0x6aa04a), box(2.1, 0.15, 0.1, 0x7a5a3a, 0, 0, 1), box(2.1, 0.15, 0.1, 0x7a5a3a, 0, 0, -1)]);
    case 'reeds': return mesh([cyl(0.04, 0.04, 1.6, 0x6a9a3a, -0.2), cyl(0.04, 0.04, 1.4, 0x6a9a3a, 0.2, 0, 0.1), cyl(0.04, 0.04, 1.7, 0x6a9a3a, 0, 0, -0.2)]);
    case 'stones': return mesh(STONES.flatMap((s, k) => [
      cyl(s.r, s.r + 0.15, s.h - 0.06, k % 2 ? 0x8f8f87 : 0x9a9a92, s.x, 0, s.z, 9),
      cyl(s.r - 0.08, s.r, 0.06, 0xaeaea4, s.x, s.h - 0.06, s.z, 9)]));
    case 'toriigarden': return mesh([0, 1, 2].flatMap((k) => [
      box(0.2, 2.4, 0.2, 0xd8382a, -0.9, 0, (k - 1) * 2.4), box(0.2, 2.4, 0.2, 0xd8382a, 0.9, 0, (k - 1) * 2.4),
      box(2.6, 0.2, 0.3, 0x222222, 0, 2.4, (k - 1) * 2.4), box(2.2, 0.15, 0.2, 0xd8382a, 0, 1.9, (k - 1) * 2.4)]));
    case 'treehouse': return mesh([cyl(0.5, 0.7, 5, 0x5a3a20), ball(3.4, 0xf6b5cf, 0, 7.6, 0, 0.6), box(3, 0.2, 3, 0x8a6a40, 0, 4.6), box(2.4, 1.8, 2.4, 0xd8b880, 0, 4.8), box(2.8, 0.3, 2.8, 0x8a3a2a, 0, 6.6), box(0.6, 4.6, 0.1, 0x7a5a3a, 1.7, 0, 0)]);
    /* WALL THINGS — drawn facing +z, their back on z = 0 (the wall), their
       bottom at y = 0; homeisle.js lifts them to their height on the wall. */
    case 'window': {
      /* THE WALL'S WINDOW, in its frame: the shoji pair (`shojiPair`, 1.6 by
         1.6 — homehouse's WINDOW) and the dark timber the wall cuts round it,
         2.0 across like the catalogue says. It was a blue-glass sash. */
      const g = new THREE.Group();
      const W = 1.6, Hh = 1.6;
      g.add(mesh([
        box(0.2, Hh, 0.38, 0x3a2418, -(W / 2 + 0.1) + 0.04, 0, 0),
        box(0.2, Hh, 0.38, 0x3a2418, W / 2 + 0.1 - 0.04, 0, 0),
        box(W + 0.4, 0.16, 0.4, 0x3a2418, 0, Hh - 0.04, 0),
        box(W + 0.4, 0.16, 0.4, 0x3a2418, 0, -0.12, 0)]));
      g.add(shojiPair(W, Hh).group);
      return g;
    }
    case 'slidedoor': {
      // the doorway's shoji, door-high (homehouse PORT_H 3.1), in the same dark frame as a window
      const g = new THREE.Group();
      const W = 1.8, Hh = 3.04;
      g.add(mesh([
        box(0.2, Hh, 0.38, 0x3a2418, -(W / 2 + 0.1) + 0.04, 0, 0),
        box(0.2, Hh, 0.38, 0x3a2418, W / 2 + 0.1 - 0.04, 0, 0),
        box(W + 0.4, 0.16, 0.4, 0x3a2418, 0, Hh - 0.04, 0)]));
      g.add(shojiPair(W, Hh).group);
      return g;
    }
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
