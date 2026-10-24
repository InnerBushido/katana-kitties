/**
 * /sprites.html's brain — dev only, never built (see the comment in
 * sprites.html, and vite.config.js `spriteServer`).
 *
 * THE RULE THIS FILE KEEPS: it draws nothing with arithmetic of its own. A
 * pose on the stage is the billboard a real `Player` builds in
 * `setKendoArt` / `setHomeArt` with the draft in force (`setSpriteFix`), and a
 * sheet is re-dealt by the real `applySheetFix` and worn by a real Player's
 * own sprite. So what lines up here lines up in the game, and the day the
 * sizing code changes this page changes with it.
 *
 * Measurements (front foot, body centre, ink top) are read off the drawing's
 * own pixels mapped through the billboard's ACTUAL geometry — the quad it is
 * wearing this frame, mirrored or not — rather than worked out from the
 * numbers that built it. Non-negotiable 8: measure, don't reason.
 *
 * Snaps solve for the fix numerically (nudge, re-measure, step) instead of
 * inverting the sign conventions of `footX`, which differ between the kendo
 * set, the clinch's left-facing drawing and the home poses.
 */
import * as THREE from 'three';
import { Player } from './entities/player.js';
import { PLAYER_STYLE } from './core/palette.js';
import { loadSpriteAtlas, recolourAtlas } from './core/spritesheet.js';
import { setSpriteFix, poseFix, sheetFix, applySheetFix, SPRITE_FIX, KENDO_FILE, HOME_FILE } from './core/spritefix.js';
import { TEA_SHEET } from './systems/housing/teahouse.js';

const $ = (id) => document.getElementById(id);
const status = (t) => { $('status').textContent = t; };

/* ------------------------------------------------------------- the draft */

const draft = JSON.parse(JSON.stringify(SPRITE_FIX));
draft.poses ??= {};
draft.sheets ??= {};
setSpriteFix(draft);
let dirty = false;

/* Per-viewer conveniences only (the kitten, the pose, the view), so a save —
   which reloads every page the dev server is serving — lands back where it was. */
const UI_KEY = 'kk-sprites-ui';
let ui = {};
try { ui = JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {}; } catch { ui = {}; }
const keepUi = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch { /* private window */ } };

/* -------------------------------------------------------------- the art */

/** Everything a pose can be, in the order 1-9 picks them. `stand` is her idle
 *  side view off the turnaround — a yardstick, not something with a fix. */
const POSES = [
  ['kendo', 'kendoPose'], ['kiai', 'kiaiPose'], ['seiza', 'seizaPose'], ['reach', 'reachPose'],
  ['rei', 'reiPose'], ['kparry', 'kparryPose'], ['kbroke', 'kbrokePose'], ['kclinchR', 'kclinchRPose'],
  ['kclinchL', 'kclinchLPose'], ['stand', null], ['pray', 'prayPose'], ['bath', 'bathPose'],
  ['futon', 'futonPose'], ['tea', 'teaPose'],
];
const POSE_KEY = Object.fromEntries(POSES);
const HOME = new Set(Object.values(HOME_FILE));

const SEQS = {
  ceremony: 'seiza:1.4, reach:0.6, rei:1.1, kendo:1.2',
  strike: 'kendo:0.8, kiai:0.35, kendo:0.6',
  riposte: 'kendo:0.8, kparry:0.9, kendo:0.5',
  clinch: 'kclinchR:1, kclinchL:1',
  broken: 'kendo:0.7, kbroke:1.2',
  'stand vs kendo': 'stand:1, kendo:1',
};

/* The game's own loader options, so the cells and the pads are the game's. */
const poseOpts = { views: 1, rows: 1, cell: 256, maxAtlas: 768 };
const SHEETS = {
  'ember/grid_v2': { url: '/sprites/kittens/ember/grid_v2.png', height: 2.9 },
  'frost/grid': { url: '/sprites/kittens/frost/grid.png', height: 2.85 },
};
const SHEET_OF = { ember: 'ember/grid_v2', frost: 'frost/grid' };

const raw = {}; // `${sheet}_${file}` -> atlas, as main.js names them
const grids = {}; // sheet id -> atlas as loaded

async function loadArt() {
  const jobs = [];
  for (const s of ['ember', 'frost']) {
    for (const f of [...Object.values(KENDO_FILE), 'pray', 'bath', 'futon', 'bless']) {
      jobs.push(loadSpriteAtlas(`/sprites/kittens/${s}/${f}.png`, poseOpts)
        .then((a) => { raw[`${s}_${f}`] = a; }).catch(() => {}));
    }
    jobs.push(loadSpriteAtlas(`/sprites/kittens/${s}/tea.png`,
      { ...poseOpts, views: TEA_SHEET.cols, rows: TEA_SHEET.rows, uniform: true, maxAtlas: 2048 })
      .then((a) => { raw[`${s}_tea`] = a; }).catch(() => {}));
  }
  for (const [id, S] of Object.entries(SHEETS)) {
    jobs.push(loadSpriteAtlas(S.url, { views: 'auto', rows: 4, cell: 384, maxAtlas: 2048 })
      .then((a) => { grids[id] = a; }).catch(() => {}));
  }
  await Promise.all(jobs);
}

/* Recolours are made once per kitten and kept: Storm and Blossom ARE Ember's
   and Frost's drawings, and wear their fixes (keyed by sheet). */
const packs = [];
function packFor(i) {
  if (packs[i]) return packs[i];
  const s = PLAYER_STYLE[i];
  const get = (f) => {
    const a = raw[`${s.sheet}_${f}`];
    return a && s.recolour ? recolourAtlas(a, s.recolour) : (a ?? null);
  };
  const kendo = {};
  for (const [k, f] of [['guard', 'kendo'], ...Object.values(KENDO_FILE).filter((f) => f !== 'kendo').map((f) => [f, f])]) kendo[k] = get(f);
  const home = { pray: get('pray'), bath: get('bath'), futon: get('futon'), tea: get('tea'), ref: get('bless') };
  const g = grids[SHEET_OF[s.sheet]];
  const grid = g && s.recolour ? recolourAtlas(g, s.recolour) : g;
  packs[i] = { kendo, home, grid };
  return packs[i];
}

/* --------------------------------------------------------------- stage */

const canvas = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2230);
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ color: 0x8a6a48 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.002;
scene.add(floor);
// the seiza mark: a white cross of tape, as kendo.js lays them
const crossMat = new THREE.MeshBasicMaterial({ color: 0xf6f1e4 });
for (const [w, d] of [[1.1, 0.14], [0.14, 1.1]]) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), crossMat);
  m.rotation.x = -Math.PI / 2;
  scene.add(m);
}
// her blob shadow, at the size it sits on the floor (Player: 0.62 x 1.2 at drop 0)
const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.62 * 1.2, 32),
  new THREE.MeshBasicMaterial({ color: 0x2a1830, transparent: true, opacity: 0.4, depthWrite: false }));
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = 0.004;
scene.add(shadow);

const lineMat = (c, dashed) => (dashed
  ? new THREE.LineDashedMaterial({ color: c, dashSize: 0.08, gapSize: 0.06, depthTest: false, transparent: true })
  : new THREE.LineBasicMaterial({ color: c, depthTest: false, transparent: true }));
function hline(color, dashed) {
  const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-7, 0, 0), new THREE.Vector3(7, 0, 0)]);
  const l = new THREE.Line(g, lineMat(color, dashed));
  if (dashed) l.computeLineDistances();
  l.renderOrder = 50;
  scene.add(l);
  return l;
}
function vline(color) {
  const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.6, 0)]);
  const l = new THREE.Line(g, lineMat(color));
  l.renderOrder = 50;
  scene.add(l);
  return l;
}
const guides = {
  aTop: hline(0xffb36b), bTop: hline(0x7fd8ff, true), user: hline(0xffffff, true),
  aFoot: vline(0xffb36b), bFoot: vline(0x7fd8ff), aBody: vline(0xff5a3d),
};

/* ------------------------------------------------------------ the layers */

/** One figure on the stage: a kitten, a pose, and the real Player that drew it. */
class Layer {
  constructor(name, kit, pose) {
    this.name = name;
    this.kit = kit;
    this.pose = pose;
    this.dx = 0; // side-by-side offset, B only
    this.opacity = 1;
    this.front = false;
    this.hidden = false;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.bb = null;
    this.player = null;
    this.frame = 0;
  }

  get sheet() { return PLAYER_STYLE[this.kit].sheet; }
  get file() { return this.pose === 'stand' ? null : this.pose; }

  /** Rebuild from scratch with the draft in force. Cheap: one Player, the atlases are shared. */
  build() {
    const P = packFor(this.kit);
    const g = P.grid;
    if (this.bb) this.root.remove(this.bb);
    // every nudge builds a new Player: hand the last one's clones back, or the GPU fills with them
    disposeAll(this.player?.group, this.bb);
    if (!g) { this.bb = null; return; }
    const p = new Player({
      texture: g.texture, cols: g.cols, rows: g.rows, contentScale: g.contentScale ?? 1, pad: g.pad ?? 0,
      mirror: g.cols <= 4 && g.rows === 1, index: this.kit, style: PLAYER_STYLE[this.kit],
      height: SHEETS[SHEET_OF[this.sheet]].height, dirSense: 1,
    });
    p.setKendoArt(P.kendo);
    p.setHomeArt(P.home);
    this.player = p;
    const key = POSE_KEY[this.pose];
    const bb = key ? p[key] : p.sprite;
    if (!bb) { this.bb = null; return; }
    bb.parent?.remove(bb);
    bb.visible = true;
    bb.row = 0;
    bb.position.set(0, 0, 0);
    this.root.add(bb);
    this.bb = bb;
    this.style();
  }

  style() {
    if (!this.bb) return;
    const m = this.bb.mat;
    m.opacity = this.opacity;
    // the same silhouette at any opacity: three tests alpha AFTER the opacity multiply
    m.alphaTest = 0.35 * this.opacity;
    // two drawings on one plane: which is on top is draw order, not depth
    m.depthWrite = false;
    m.depthTest = false;
    this.bb.renderOrder = this.name === 'A' ? 5 : this.front ? 20 : 1;
    this.root.visible = !this.hidden && !sheetMode;
    this.root.position.x = this.dx;
  }

  face(right) {
    if (!this.bb) return;
    this.bb.facing = right ? Math.PI / 2 : -Math.PI / 2;
    this.right = right;
  }

  /** The drawing's ink, in WORLD units, through the quad it is wearing this frame. */
  measure() {
    const bb = this.bb;
    if (!bb) return null;
    const img = bb.tex.image;
    const pix = pixelsOf(img);
    if (!pix) return null;
    const geo = bb.mesh.geometry;
    geo.computeBoundingBox();
    const box = geo.boundingBox;
    // which cell, and mirrored or not: read back off the texture transform `_setCell` wrote
    const rx = bb.tex.repeat.x;
    const flip = rx < 0;
    const u0 = flip ? bb.tex.offset.x + rx : bb.tex.offset.x;
    const u1 = u0 + Math.abs(rx);
    const v0 = 1 - (bb.tex.offset.y + bb.tex.repeat.y); // top of the cell, image-down
    const v1 = 1 - bb.tex.offset.y;
    const W = pix.w;
    const H = pix.h;
    const x0 = Math.floor(u0 * W), x1 = Math.ceil(u1 * W);
    const y0 = Math.floor(v0 * H), y1 = Math.ceil(v1 * H);
    const cw = x1 - x0, ch = y1 - y0;
    const wx = (px) => {
      let u = (px + 0.5 - x0) / cw;
      if (flip) u = 1 - u;
      return box.min.x + u * (box.max.x - box.min.x) + this.root.position.x;
    };
    const wy = (py) => box.max.y - ((py + 0.5 - y0) / ch) * (box.max.y - box.min.y);
    let top = Infinity, bot = -Infinity;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (pix.a[y * W + x] > 90) { if (y < top) top = y; if (y > bot) bot = y; break; }
      }
    }
    if (!Number.isFinite(top)) return null;
    const right = bb._pointsRight ?? this.right;
    const inkH = bot - top;
    // FRONT FOOT: the extreme ink toward the way she faces, in the bottom 7% of her ink
    let foot = right ? -Infinity : Infinity;
    for (let y = Math.max(top, Math.round(bot - inkH * 0.07)); y <= bot; y++) {
      for (let x = x0; x < x1; x++) {
        if (pix.a[y * W + x] <= 90) continue;
        const X = wx(x);
        foot = right ? Math.max(foot, X) : Math.min(foot, X);
      }
    }
    // BODY: the mean ink across the middle band, 35-70% down her - the torso, clear of the shinai's tip
    let sx = 0, n = 0;
    for (let y = Math.round(top + inkH * 0.35); y <= top + inkH * 0.7; y++) {
      for (let x = x0; x < x1; x++) if (pix.a[y * W + x] > 90) { sx += wx(x); n++; }
    }
    return { top: wy(top), bottom: wy(bot), foot, body: n ? sx / n : this.root.position.x, right };
  }
}

function disposeAll(...roots) {
  for (const r of roots) {
    r?.traverse?.((o) => {
      o.geometry?.dispose?.();
      for (const m of [o.material].flat()) { m?.map?.dispose?.(); m?.dispose?.(); }
    });
  }
}

const pixCache = new WeakMap();
function pixelsOf(img) {
  if (!img?.width) return null;
  if (pixCache.has(img)) return pixCache.get(img);
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const a = new Uint8Array(c.width * c.height);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
  const out = { a, w: c.width, h: c.height };
  pixCache.set(img, out);
  return out;
}

const A = new Layer('A', ui.aKit ?? 0, ui.aPose ?? 'kendo');
const B = new Layer('B', ui.bKit ?? 0, ui.bPose ?? 'stand');
B.opacity = ui.bOp ?? 0.45;
B.dx = ui.bDx ?? 0;
let faceRight = ui.faceRight ?? true;

/* ------------------------------------------------------------- the fixes */

const fixKey = () => (A.file ? `${A.sheet}/${A.file}` : null);
const curFix = () => (A.file ? poseFix(A.sheet, A.file, draft) : { s: 1, x: 0, y: 0 });
function setFix(patch) {
  const k = fixKey();
  if (!k) { status('The standing sprite is the turnaround sheet - it has no pose fix. Pick a pose for A.'); return; }
  const f = { ...curFix(), ...patch };
  for (const n of ['s', 'x', 'y']) f[n] = Math.round(f[n] * 10000) / 10000;
  draft.poses[k] = f;
  dirty = true;
  rebuild();
}

function rebuild() {
  setSpriteFix(draft);
  A.build();
  B.build();
  syncInputs();
}

/** Solve `measure()[what]` -> `target` by moving the fix's `field` (x or y): one probe, a few secant steps. */
function solve(field, what, target) {
  for (let i = 0; i < 4; i++) {
    tick(0);
    const m0 = A.measure();
    if (!m0) return false;
    const err = target - m0[what];
    if (Math.abs(err) < 0.002) return true;
    const base = curFix()[field];
    setFix({ [field]: base + 0.02 });
    tick(0);
    const m1 = A.measure();
    const slope = (m1[what] - m0[what]) / 0.02;
    if (!Number.isFinite(slope) || Math.abs(slope) < 1e-6) { setFix({ [field]: base }); return false; }
    setFix({ [field]: base + err / slope });
  }
  return true;
}

/* --------------------------------------------------------------- playing */

let playing = false;
let seq = [];
let seqI = 0;
let seqT = 0;
const speed = () => 2 ** Number($('speed').value);

function parseSeq(t) {
  return t.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const [p, d] = s.split(':').map((q) => q.trim());
    return { pose: p, t: Math.max(0.03, Number(d) || 0.5) };
  }).filter((r) => POSE_KEY[r.pose] !== undefined);
}
function showStep(i) {
  if (!seq.length) return;
  seqI = ((i % seq.length) + seq.length) % seq.length;
  seqT = 0;
  A.pose = seq[seqI].pose;
  if ($('both').checked) B.pose = seq[seqI].pose;
  rebuild();
}

/* ----------------------------------------------------------- the frame */

let zoom = Number(ui.zoom ?? 5);
let pitch = Number(ui.pitch ?? 22);
function placeCamera() {
  const r = canvas.clientWidth / Math.max(1, canvas.clientHeight);
  cam.left = -zoom * r * 0.5;
  cam.right = zoom * r * 0.5;
  cam.top = zoom * 0.5;
  cam.bottom = -zoom * 0.5;
  const ph = THREE.MathUtils.degToRad(pitch);
  /* The lens stays on x = 0 and the FRUSTUM slides to take B in: a camera moved
     sideways would turn every billboard a little toward it (faceCamera), and
     on a turnaround sheet that is a different cell. */
  const mid = sheetMode ? 0 : B.dx / 2;
  cam.left += mid;
  cam.right += mid;
  const look = new THREE.Vector3(0, 1.4, 0);
  cam.position.set(0, look.y + Math.sin(ph) * 40, Math.cos(ph) * 40);
  cam.lookAt(look);
  cam.updateProjectionMatrix();
}

let last = performance.now();
let teaClock = 0;
function tick(dt) {
  for (const L of [A, B]) {
    L.style();
    L.face(L === A ? faceRight : (ui.bFaceRight ?? faceRight));
    if (L.bb?.anim) L.bb.frame = Math.floor(teaClock * 8) % (L.bb.cols * L.bb.rows);
    L.bb?.faceCamera(cam);
  }
  teaClock += dt * speed();
  if (playing && seq.length) {
    seqT += dt * speed();
    if (seqT >= seq[seqI].t) {
      if (seqI + 1 >= seq.length && !$('loop').checked) playing = false;
      else showStep(seqI + 1);
    }
  }
  if (sheetMode) spinSheet(dt);
}

function render() {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
  }
  placeCamera();
  tick(dt);
  drawGuides();
  renderer.render(scene, cam);
  requestAnimationFrame(render);
}

let mA = null, mB = null;
function drawGuides() {
  mA = sheetMode ? null : A.measure();
  mB = sheetMode || B.hidden ? null : B.measure();
  const put = (l, m, y) => { l.visible = !!m; if (m) l.position.y = y; };
  put(guides.aTop, mA, mA?.top);
  put(guides.bTop, mB, mB?.top);
  guides.user.visible = !sheetMode;
  guides.user.position.y = Number($('guide').value);
  for (const [l, m, k] of [[guides.aFoot, mA, 'foot'], [guides.bFoot, mB, 'foot'], [guides.aBody, mA, 'body']]) {
    l.visible = !!m && Number.isFinite(m[k]);
    if (l.visible) l.position.set(m[k], 0.01, 0.02);
  }
  const f = curFix();
  const H = A.player?.height ?? 1;
  const lines = sheetMode ? [`sheet ${$('sh-pick').value}`] : [
    `A ${PLAYER_STYLE[A.kit].name} ${A.pose}${A.file ? `  s ${f.s.toFixed(3)}  x ${f.x.toFixed(3)}  y ${f.y.toFixed(3)}` : ''}`,
    mA ? `  top ${mA.top.toFixed(3)} (${(mA.top / H).toFixed(3)} H)  foot ${mA.foot.toFixed(3)}  body ${mA.body.toFixed(3)}` : '',
    B.hidden ? 'B hidden' : `B ${PLAYER_STYLE[B.kit].name} ${B.pose}`,
    mB ? `  top ${mB.top.toFixed(3)}  foot ${(mB.foot - B.dx).toFixed(3)}  body ${(mB.body - B.dx).toFixed(3)}` : '',
    mA && mB ? `A/B height ${(mA.top / mB.top).toFixed(3)}` : '',
    playing ? `▶ ${seq[seqI]?.pose} ${seqI + 1}/${seq.length}  ×${speed().toFixed(2)}` : `×${speed().toFixed(2)}`,
    dirty ? '● unsaved' : '',
  ];
  $('readout').textContent = lines.filter(Boolean).join('\n');
}

/* ------------------------------------------------------------- the panel */

function fillSelect(sel, items, value) {
  sel.innerHTML = '';
  for (const [v, t] of items) sel.add(new Option(t, v));
  sel.value = value;
}
const kits = PLAYER_STYLE.map((s, i) => [String(i), `${s.name}${s.recolour ? ` (${s.sheet}'s)` : ''}`]);
const poseItems = POSES.map(([p], i) => [p, `${i < 9 ? `${i + 1} ` : ''}${p}${HOME.has(p) ? ' (home)' : ''}`]);

function syncInputs() {
  const f = curFix();
  $('fx-s').value = f.s;
  $('fx-x').value = f.x;
  $('fx-y').value = f.y;
  for (const id of ['fx-s', 'fx-x', 'fx-y']) $(id).disabled = !A.file;
  $('a-kit').value = String(A.kit);
  $('b-kit').value = String(B.kit);
  $('a-pose').value = A.pose;
  $('b-pose').value = B.pose;
  $('b-op').value = B.opacity;
  $('b-op-v').textContent = B.opacity.toFixed(2);
  $('b-dx').value = B.dx;
  $('b-dx-v').textContent = B.dx.toFixed(2);
  $('face').textContent = faceRight ? '→ right' : '← left';
  $('b-front').classList.toggle('on', B.front);
  $('b-hide').classList.toggle('on', B.hidden);
  $('speed-v').textContent = `×${speed().toFixed(2)}`;
  $('guide-v').textContent = Number($('guide').value).toFixed(2);
  $('play').textContent = playing ? '❚❚ pause' : '▶ play';
  Object.assign(ui, { aKit: A.kit, bKit: B.kit, aPose: A.pose, bPose: B.pose, bOp: B.opacity, bDx: B.dx, faceRight, zoom, pitch });
  keepUi();
}

function wire() {
  fillSelect($('a-kit'), kits, String(A.kit));
  fillSelect($('b-kit'), kits, String(B.kit));
  fillSelect($('a-pose'), poseItems, A.pose);
  fillSelect($('b-pose'), poseItems, B.pose);
  fillSelect($('seq-pick'), Object.keys(SEQS).map((k) => [k, k]), ui.seq ?? 'ceremony');
  $('seq').value = ui.seqText ?? SEQS[$('seq-pick').value];
  $('zoom').value = zoom;
  $('pitch').value = pitch;

  $('a-kit').onchange = (e) => { A.kit = +e.target.value; rebuild(); };
  $('b-kit').onchange = (e) => { B.kit = +e.target.value; rebuild(); };
  $('a-pose').onchange = (e) => { A.pose = e.target.value; rebuild(); };
  $('b-pose').onchange = (e) => { B.pose = e.target.value; rebuild(); };
  for (const n of ['s', 'x', 'y']) {
    $(`fx-${n}`).onchange = (e) => { const v = Number(e.target.value); if (Number.isFinite(v)) setFix({ [n]: v }); };
  }
  for (const b of document.querySelectorAll('[data-s]')) b.onclick = () => setFix({ s: curFix().s * Number(b.dataset.s) });
  $('fx-reset').onclick = () => { const k = fixKey(); if (k) { delete draft.poses[k]; dirty = true; rebuild(); } };
  $('snap-foot').onclick = () => {
    // measured NOW, not off the last frame: a hidden pane draws no frames, and B may have just changed
    tick(0);
    const mB = B.hidden ? null : B.measure();
    if (!mB) { status('Show B first - the snap puts A\'s front foot on B\'s.'); return; }
    const ok = solve('x', 'foot', mB.foot - B.dx);
    status(ok ? `A's front foot is on ${PLAYER_STYLE[B.kit].name} ${B.pose}'s (B's offset ignored).` : 'Could not solve the foot - is A a pose with a fix?');
  };
  $('snap-body').onclick = () => {
    const ok = solve('x', 'body', 0);
    status(ok ? 'A\'s body is centred over the shadow.' : 'Could not centre her - is A a pose with a fix?');
  };
  $('b-op').oninput = (e) => { B.opacity = Number(e.target.value); syncInputs(); };
  $('b-dx').oninput = (e) => { B.dx = Number(e.target.value); syncInputs(); };
  $('b-front').onclick = () => { B.front = !B.front; syncInputs(); };
  $('b-hide').onclick = () => { B.hidden = !B.hidden; syncInputs(); };
  $('swap').onclick = swap;
  $('face').onclick = () => { faceRight = !faceRight; syncInputs(); };
  $('pitch').oninput = (e) => { pitch = Number(e.target.value); syncInputs(); };
  $('zoom').oninput = (e) => { zoom = Number(e.target.value); syncInputs(); };
  $('guide').oninput = syncInputs;
  $('guide-snap').onclick = () => { tick(0); const mB = B.measure(); if (mB) { $('guide').value = mB.top; syncInputs(); } };
  $('seq-pick').onchange = (e) => { $('seq').value = SEQS[e.target.value]; ui.seq = e.target.value; ui.seqText = $('seq').value; keepUi(); };
  $('seq').onchange = () => { ui.seqText = $('seq').value; keepUi(); seq = parseSeq($('seq').value); };
  $('play').onclick = togglePlay;
  $('prev').onclick = () => step(-1);
  $('next').onclick = () => step(1);
  $('speed').oninput = syncInputs;
  $('save').onclick = save;
  $('tab-poses').onclick = () => setTab(false);
  $('tab-sheets').onclick = () => setTab(true);
  wireSheets();
  wireDrag();
  addEventListener('keydown', onKey);
  addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
}

function swap() {
  [A.kit, B.kit] = [B.kit, A.kit];
  [A.pose, B.pose] = [B.pose, A.pose];
  rebuild();
}
function togglePlay() {
  seq = parseSeq($('seq').value);
  if (!seq.length) { status('The sequence is empty - write it as pose:seconds, pose:seconds.'); return; }
  playing = !playing;
  if (playing) showStep(seq.findIndex((r) => r.pose === A.pose) >= 0 ? seqI : 0);
  syncInputs();
}
function step(d) {
  seq = parseSeq($('seq').value);
  playing = false;
  showStep(seqI + d);
}

function onKey(e) {
  if (e.target.matches?.('input[type=text], input[type=number], select')) {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  const fine = e.shiftKey ? 0.2 : 1;
  const k = e.key;
  if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 's') { e.preventDefault(); save(); return; }
  if (sheetMode) {
    if (k === ' ') { e.preventDefault(); $('sh-spin').click(); }
    return;
  }
  const f = curFix();
  const nudge = 0.01 * fine;
  const low = k.toLowerCase();
  const bump = (d) => { $('speed').value = Math.min(2, Math.max(-4.3, Number($('speed').value) + d)); syncInputs(); };
  if (k === ' ') { e.preventDefault(); togglePlay(); return; }
  if (k === ',' || k === '.') { step(k === ',' ? -1 : 1); return; }
  if (k === '[' || k === ']') { bump(k === '[' ? -0.25 : 0.25); return; }
  if (/^[1-9]$/.test(k)) { A.pose = POSES[Number(k) - 1][0]; rebuild(); return; }
  if (k === 'ArrowLeft' || k === 'ArrowRight') {
    e.preventDefault();
    if (!A.file) return;
    // "forward" is the way she faces: the arrow is the SCREEN direction, so it is turned into hers
    const screen = k === 'ArrowRight' ? 1 : -1;
    setFix({ x: f.x + nudge * screen * (mA?.right === false ? -1 : 1) * xSign() });
    return;
  }
  if (k === 'ArrowUp' || k === 'ArrowDown') { e.preventDefault(); setFix({ y: f.y + (k === 'ArrowUp' ? nudge : -nudge) }); return; }
  if (k === '=' || k === '+') { setFix({ s: f.s * (1 + 0.02 * fine) }); return; }
  if (k === '-' || k === '_') { setFix({ s: f.s / (1 + 0.02 * fine) }); return; }
  if (k === 'Tab') { e.preventDefault(); swap(); return; }
  if (low === 'f') { faceRight = !faceRight; syncInputs(); return; }
  if (low === 'o') { B.opacity = B.opacity >= 0.95 ? 0.15 : Math.min(1, B.opacity + 0.2); syncInputs(); return; }
  if (low === 'a' || low === 'd') { B.dx = Math.min(3, Math.max(-3, B.dx + (low === 'a' ? -0.1 : 0.1) * fine)); syncInputs(); }
}

/** +1 when a bigger `x` moves A forward on screen (as it should for every pose), measured rather than trusted. */
let xSignCache = { key: null, v: 1 };
function xSign() {
  const k = `${A.kit}/${A.pose}/${faceRight}`;
  if (xSignCache.key === k) return xSignCache.v;
  const m0 = A.measure();
  const base = curFix().x;
  setSpriteFix({ ...draft, poses: { ...draft.poses, [fixKey()]: { ...curFix(), x: base + 0.05 } } });
  A.build();
  tick(0);
  const m1 = A.measure();
  setSpriteFix(draft);
  A.build();
  tick(0);
  const d = (m1?.body ?? 0) - (m0?.body ?? 0);
  const v = (d >= 0) === (m0?.right !== false) ? 1 : -1;
  xSignCache = { key: k, v };
  return v;
}

/* Drag A on the canvas: across is forward/back, up and down is her y. */
function wireDrag() {
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (sheetMode || !A.file) return;
    drag = { x: e.clientX, y: e.clientY, f: curFix(), sign: xSign(), right: mA?.right !== false };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const perPx = zoom / canvas.clientHeight;
    const H = A.player?.height ?? 1;
    const dx = ((e.clientX - drag.x) * perPx) / H;
    const dy = (-(e.clientY - drag.y) * perPx / Math.cos(THREE.MathUtils.degToRad(pitch))) / H;
    setFix({ x: drag.f.x + dx * (drag.right ? 1 : -1) * drag.sign, y: drag.f.y + (e.shiftKey ? 0 : dy) });
  });
  const end = () => { drag = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoom = Math.min(10, Math.max(2, zoom * (e.deltaY > 0 ? 1.08 : 1 / 1.08)));
    $('zoom').value = zoom;
    syncInputs();
  }, { passive: false });
}

/* ---------------------------------------------------------------- sheets */

let sheetMode = false;
let spinAngle = 0;
let pinnedCol = null;
let sheetLayer = null;

function setTab(sheets) {
  sheetMode = sheets;
  $('tab-poses').classList.toggle('on', !sheets);
  $('tab-sheets').classList.toggle('on', sheets);
  $('poses').hidden = sheets;
  $('sheets').hidden = !sheets;
  A.root.visible = !sheets;
  B.root.visible = !sheets && !B.hidden;
  if (sheets) buildSheet();
  else if (sheetLayer) { scene.remove(sheetLayer); sheetLayer = null; }
  $('cells').hidden = !sheets;
}

const sheetDraft = (id) => draft.sheets[id] ?? null;
function parseCols(t) {
  return t.split(/[\s,]+/).filter(Boolean).map((v) => Number(v) - 1).filter((v) => Number.isInteger(v) && v >= 0);
}
function currentSheet() { return $('sh-pick').value; }

function wireSheets() {
  fillSelect($('sh-pick'), Object.keys(SHEETS).map((k) => [k, k]), ui.sheet ?? 'ember/grid_v2');
  fillSelect($('sh-row'), [['0', 'idle'], ['1', 'walk'], ['2', 'jump'], ['3', 'attack']], '0');
  $('sh-pick').onchange = () => { ui.sheet = currentSheet(); keepUi(); pinnedCol = null; buildSheet(); };
  $('sh-row').onchange = buildSheet;
  $('sh-apply').onclick = () => {
    const id = currentSheet();
    const cols = grids[id]?.cols ?? 0;
    const order = parseCols($('sh-order').value);
    const flip = parseCols($('sh-flip').value);
    if (!order.length) { delete draft.sheets[id]; dirty = true; buildSheet(); status('No order - the sheet is drawn as it was loaded.'); return; }
    const bad = order.filter((c) => c >= cols);
    if (bad.length) { status(`This sheet has ${cols} columns; ${bad.map((c) => c + 1).join(', ')} is not one of them. Nothing applied.`); return; }
    draft.sheets[id] = { order, flip: flip.filter((c) => c < order.length) };
    dirty = true;
    buildSheet();
    status(`${id}: ${order.length} columns, ${flip.length} mirrored. Watch the turntable before saving.`);
  };
  $('sh-reset').onclick = () => { delete draft.sheets[currentSheet()]; dirty = true; buildSheet(); };
  $('sh-spin').onclick = () => { pinnedCol = null; $('sh-spin').classList.add('on'); };
  $('sh-speed').oninput = () => { $('sh-speed-v').textContent = `×${(2 ** Number($('sh-speed').value)).toFixed(2)}`; };
  $('sh-speed').oninput();
}

function buildSheet() {
  const id = currentSheet();
  const g = grids[id];
  const fix = sheetDraft(id);
  $('sh-order').value = fix ? fix.order.map((c) => c + 1).join(', ') : '';
  $('sh-flip').value = fix ? fix.flip.map((c) => c + 1).join(', ') : '';
  if (!g) { status(`${id} did not load.`); return; }
  // the strip: every SOURCE column of the chosen row, 1-based, marked by what the draft does with it
  const row = Number($('sh-row').value);
  const img = g.texture.image;
  const cw = img.width / g.cols, ch = img.height / g.rows;
  const strip = $('cells');
  strip.innerHTML = '';
  const order = fix?.order ?? [...Array(g.cols).keys()];
  for (let c = 0; c < g.cols; c++) {
    const d = document.createElement('div');
    d.className = 'cell';
    const at = order.indexOf(c);
    if (at < 0) d.classList.add('out');
    if (at >= 0 && fix?.flip.includes(at)) d.classList.add('flip');
    const cv = document.createElement('canvas');
    cv.width = 96; cv.height = 96;
    cv.getContext('2d').drawImage(img, c * cw, row * ch, cw, ch, 0, 0, 96, 96);
    const b = document.createElement('b');
    b.textContent = at >= 0 ? `${c + 1} → ${at + 1}` : `${c + 1} ✕`;
    d.append(cv, b);
    d.title = 'click: show it; shift-click: in / out; alt-click: mirror it';
    d.onclick = (e) => {
      const f = sheetDraft(id) ?? { order: [...Array(g.cols).keys()], flip: [] };
      if (e.shiftKey) {
        const i = f.order.indexOf(c);
        if (i >= 0) { f.order.splice(i, 1); f.flip = f.flip.filter((q) => q !== i).map((q) => (q > i ? q - 1 : q)); } else f.order.push(c);
        draft.sheets[id] = f; dirty = true; buildSheet(); return;
      }
      if (e.altKey) {
        const i = f.order.indexOf(c);
        if (i < 0) return;
        f.flip = f.flip.includes(i) ? f.flip.filter((q) => q !== i) : [...f.flip, i];
        draft.sheets[id] = f; dirty = true; buildSheet(); return;
      }
      pinnedCol = at >= 0 ? at : null;
      $('sh-spin').classList.toggle('on', pinnedCol === null);
    };
    strip.append(d);
  }
  // the turntable: a real Player wearing the re-dealt sheet
  if (sheetLayer) { scene.remove(sheetLayer); disposeAll(sheetLayer); }
  const a = applySheetFix(g, sheetFix(id, g.cols, draft), THREE);
  const kit = id.startsWith('ember') ? 0 : 1;
  const p = new Player({
    texture: a.texture, cols: a.cols, rows: a.rows, contentScale: a.contentScale ?? 1, pad: a.pad ?? 0,
    mirror: a.cols <= 4 && a.rows === 1, index: kit, style: PLAYER_STYLE[kit], height: SHEETS[id].height, dirSense: 1,
  });
  const bb = p.sprite;
  bb.parent?.remove(bb);
  bb.row = row;
  sheetLayer = new THREE.Group();
  sheetLayer.add(bb);
  sheetLayer.userData.bb = bb;
  scene.add(sheetLayer);
}

function spinSheet(dt) {
  const bb = sheetLayer?.userData.bb;
  if (!bb) return;
  const n = bb.cols;
  if (pinnedCol !== null) {
    // the facing that lands exactly on that cell (full-turn: cell k is k steps round from facing the lens)
    spinAngle = (pinnedCol / n) * Math.PI * 2;
  } else {
    spinAngle += dt * (2 ** Number($('sh-speed').value)) * 1.6;
  }
  bb.facing = spinAngle;
  bb.faceCamera(cam);
  const cells = $('cells').children;
  const fix = sheetDraft(currentSheet());
  const order = fix?.order ?? [...Array(n).keys()];
  const shown = Math.round(((((spinAngle / (Math.PI * 2)) * n) % n) + n) % n) % n;
  for (let c = 0; c < cells.length; c++) cells[c].classList.toggle('sel', order[shown] === c);
}

/* ------------------------------------------------------------------ save */

async function save() {
  try {
    const r = await fetch('/__spritefix', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft),
    });
    if (!r.ok) throw new Error(await r.text());
    dirty = false;
    status('Saved to src/spritefix.json - the game reloads with it.');
  } catch (err) {
    status(`NOT SAVED: there is no save endpoint here. It exists only under npm run dev (${err.message || err}).`);
  }
}

/* ------------------------------------------------------------------ boot */

status('Loading the drawings…');
await loadArt();
wire();
rebuild();
setTab(false);
fetch('/__spritefix').then((r) => {
  status(r.ok ? 'Ready. Nothing changes in the game until you save.' : 'This is not the dev server - you can look, but Save has nowhere to write.');
}).catch(() => status('This is not the dev server - you can look, but Save has nowhere to write.'));
requestAnimationFrame(render);
