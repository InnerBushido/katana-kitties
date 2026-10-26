/**
 * /sprites.html's brain — dev only, never built (see the comment in
 * sprites.html, and vite.config.js `spriteServer`).
 *
 * THE RULE THIS FILE KEEPS: it draws nothing with arithmetic of its own. A
 * kitten pose on the stage is the billboard a real `Player` builds in its real
 * setter with the draft in force (`setSpriteFix`); a sheet is re-dealt by the
 * real `applySheetFix`; a ninja clip is a real `ClipSprite` reading the draft's
 * frame order. So what lines up here lines up in the game, and the day the
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
 *
 * SECOND PASS, Richard, Oct 2026: every sheet in public/sprites (the list is
 * asked of the dev server, so a sheet added next year is here the day it
 * lands), the ninja atlases broken into their clips, the door mats as a set of
 * designs that can be switched off in the game, Lionheart and every kitten pose
 * in groups with a "Stand vs ..." each, undo/redo with a visible history, and
 * a save that says how many changes it is about to write and where.
 */
import * as THREE from 'three';
import { Player } from './entities/player.js';
import { Billboard } from './core/gfx.js';
import { PLAYER_STYLE } from './core/palette.js';
import { loadSpriteAtlas, recolourAtlas } from './core/spritesheet.js';
import {
  setSpriteFix, poseFix, sheetFix, applySheetFix, SPRITE_FIX, KENDO_FILE, HOME_FILE, SINGLE_FILE, LEGACY_SHEET, clipKey,
  flipSlots, flipImages, flipText, gridFix, rowOf,
} from './core/spritefix.js';
import { TEA_SHEET } from './systems/housing/teahouse.js';
import { DOOR_MATS, DOOR_MAT_SHEET } from './systems/housing/catalog.js';
import { ClipSprite, loadNinjaArt } from './systems/dream/ninjasprite.js';
import { NINJA_ATLAS } from './systems/dream/ninjaclips.js';

const $ = (id) => document.getElementById(id);
const status = (t, warn = false) => { $('status').textContent = t; $('status').classList.toggle('warn', warn); };

/* The sizes the game hands these drawings, copied because importing the systems that own them would boot
   half the game. world-check pins every one against its owner (main.js `sheets`, dreamdojo.js
   LION_HEIGHT, shadow.js SHADOW_H and its posed tint). */
const EDITOR_HEIGHT = { ember: 2.9, frost: 2.85 };
const EDITOR_LION_H = 6.2;
const SHADOW_TINT = 0xc8a8ff;

/* ------------------------------------------------------------- the draft */

const clone = (o) => JSON.parse(JSON.stringify(o ?? {}));
const shape = (o) => {
  o.poses ??= {}; o.sheets ??= {}; o.off ??= {};
  // the first editor's two keys, renamed to the path every sheet is keyed by now (spritefix.js LEGACY_SHEET)
  for (const [now, old] of Object.entries(LEGACY_SHEET)) {
    if (o.sheets[old]) { o.sheets[now] ??= o.sheets[old]; delete o.sheets[old]; }
  }
  return o;
};
const draft = shape(clone(SPRITE_FIX));
let saved = shape(clone(SPRITE_FIX));
setSpriteFix(draft);

/* Per-viewer conveniences only (the kitten, the pose, the view), so a save —
   which reloads every page the dev server is serving — lands back where it was. */
const UI_KEY = 'kk-sprites-ui';
let ui = {};
try { ui = JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {}; } catch { ui = {}; }
const keepUi = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch { /* private window */ } };

/* ---------------------------------------------------- what has changed */

/* A fix compared by what it DOES: a pose at 1/0/0 is no fix, an empty off-list is none, so typing a
   number and typing it back is not an unsaved change. */
const canon = {
  poses: (f) => { if (!f) return null; const s = f.s ?? 1, x = f.x ?? 0, y = f.y ?? 0; return s === 1 && !x && !y ? null : `${s}|${x}|${y}`; },
  sheets: (f) => (f?.order?.length ? `${f.order}|${[...(f.flip ?? [])].sort((a, b) => a - b)}` : null),
  off: (l) => (Array.isArray(l) && l.length ? [...l].map(String).sort().join('|') : null),
};
/** `{ poses: [keys], sheets: [keys], off: [keys] }` that differ from the file. */
function changes() {
  const out = {};
  for (const part of ['poses', 'sheets', 'off']) {
    const keys = new Set([...Object.keys(draft[part]), ...Object.keys(saved[part])]);
    out[part] = [...keys].filter((k) => canon[part](draft[part][k]) !== canon[part](saved[part][k])).sort();
  }
  return out;
}
const countOf = (c) => c.poses.length + c.sheets.length + c.off.length;

/* -------------------------------------------------------------- history */

/* Snapshots of the whole draft (it is a few hundred bytes). A run of the same edit - a drag, a held
   arrow key - is one entry, not sixty: the same `key` inside COALESCE replaces the top instead of
   pushing. Undo past the start is the file as it was opened. */
const COALESCE = 700;
const hist = [{ key: 'open', label: 'opened', state: JSON.stringify(draft), t: 0 }];
let hi = 0;

function commit(key, label) {
  const state = JSON.stringify(draft);
  if (state === hist[hi].state) return;
  const top = hist[hi];
  hist.length = hi + 1; // a new change from an earlier point drops the redo branch
  if (hi > 0 && top.key === key && performance.now() - top.t < COALESCE) {
    Object.assign(top, { label, state, t: performance.now() });
  } else {
    hist.push({ key, label, state, t: performance.now() });
    hi = hist.length - 1;
  }
  afterChange();
}
function goto(i) {
  if (i < 0 || i >= hist.length || i === hi) return;
  hi = i;
  const s = JSON.parse(hist[hi].state);
  for (const k of Object.keys(draft)) delete draft[k];
  Object.assign(draft, shape(s));
  hist[hi].t = 0; // never coalesce into a state reached by undo
  afterChange();
  status(`${i < hist.length - 1 ? 'Undone to' : 'At'}: ${hist[hi].label}`);
}
const undo = () => goto(hi - 1);
const redo = () => goto(hi + 1);

function afterChange() {
  setSpriteFix(draft);
  // a sheet's order moved: the recoloured, re-dealt atlases are rebuilt (not on a pose nudge - a recolour is a canvas pass)
  const sk = JSON.stringify(draft.sheets);
  if (sk !== packSheets) { packs.length = 0; packSheets = sk; }
  rebuild();
  if (sheetMode) buildSheet();
  drawChrome();
}

/** The undo list, the badges, the save button: everything that says what is not saved yet. */
function drawChrome() {
  const c = changes();
  const n = countOf(c);
  const pose = c.poses.length;
  const sheet = c.sheets.length + c.off.length;
  for (const [id, k] of [['badge-poses', pose], ['badge-sheets', sheet]]) {
    $(id).hidden = !k;
    $(id).textContent = k;
    $(id).title = `${k} unsaved change${k === 1 ? '' : 's'} on this tab`;
  }
  const save = $('save');
  save.disabled = n === 0;
  save.textContent = n
    ? `Save ${n} change${n === 1 ? '' : 's'} — poses ${c.poses.length} · sheets ${c.sheets.length} · in-game ${c.off.length}`
    : 'Nothing to save';
  save.title = n ? `Writes BOTH tabs' changes to src/spritefix.json:\n${[...c.poses, ...c.sheets, ...c.off.map((k) => `${k} (on/off)`)].join('\n')}` : '';
  $('discard').disabled = n === 0;
  if (!n) $('discard-ask').classList.remove('open');
  $('dirty').textContent = n ? `● ${n} unsaved` : 'all saved';
  $('undo').disabled = hi === 0;
  $('redo').disabled = hi >= hist.length - 1;
  // the last five, and whatever can be redone past them
  const list = $('hist-list');
  list.innerHTML = '';
  const from = Math.max(0, Math.min(hi - 4, hist.length - 6));
  for (let i = from; i < Math.min(hist.length, from + 6); i++) {
    const li = document.createElement('li');
    li.className = i === hi ? 'cur' : i > hi ? 'future' : '';
    li.innerHTML = `<span class="n">${i}</span><span></span>`;
    li.lastChild.textContent = hist[i].label;
    li.onclick = () => goto(i);
    list.append(li);
  }
  revertButtons();
}

/* -------------------------------------------------------------- the art */

const ROWS = ['idle', 'walk', 'jump', 'attack'];
const SETTER = {
  eatPose: 'setEatArt', blessPose: 'setBlessArt', warpPose: 'setWarpArt', breathPose: 'setBreathArt',
  scaredPose: 'setScaredArt', sweepPose: 'setSweepArt', ripostePose: 'setRiposteArt',
};
const keyOf = (table, file) => Object.keys(table).find((k) => table[k] === file);
const LION_CELLS = ['guard', 'slam', 'sweep', 'cross']; // shadow.js POSE

/** Every pose, grouped. `kind` says which real code builds it. */
const GROUPS = [
  ['everyday', 'Everyday', [
    { id: 'stand', kind: 'grid', row: 0 }, { id: 'walk', kind: 'grid', row: 1 }, { id: 'jump', kind: 'grid', row: 2 },
    { id: 'eat', kind: 'single' }, { id: 'bless', kind: 'single' },
  ]],
  ['arena', 'Arena', [
    { id: 'attack', kind: 'grid', row: 3 }, { id: 'riposte', kind: 'single' }, { id: 'sweep', kind: 'single' },
    { id: 'warp', kind: 'single' }, { id: 'inhale', kind: 'single' }, { id: 'scared', kind: 'single' },
  ]],
  ['kendo', 'Kendo', Object.values(KENDO_FILE).map((f) => ({ id: f, kind: 'kendo' }))],
  ['home', 'Home', Object.values(HOME_FILE).map((f) => ({ id: f, kind: 'home' }))],
  ['sim', 'Simulator (headset)', [
    ...ROWS.map((r, row) => ({ id: `vr:${r === 'idle' ? 'stand' : r}`, kind: 'vrgrid', row })),
    ...Object.values(SINGLE_FILE).map((f) => ({ id: `vr:${f}`, kind: 'vrsingle', file: f })),
  ]],
  ['ninja', 'Bamboo Infiltration', Object.keys(NINJA_ATLAS.ember.clips).map((c) => ({ id: `ninja:${c}`, kind: 'clip', clip: c }))],
  ['lion', 'Lionheart', [
    { id: 'lion:town', kind: 'lion', sheet: 'town', cell: 0 },
    ...LION_CELLS.map((c, cell) => ({ id: `lion:${c}`, kind: 'lion', sheet: 'shadow', cell })),
    { id: 'lion:down1', kind: 'lion', sheet: 'defeated', cell: 0 }, { id: 'lion:down2', kind: 'lion', sheet: 'defeated', cell: 1 },
  ]],
];
const POSES = {};
for (const [g, , list] of GROUPS) {
  for (const p of list) {
    p.group = g;
    p.file ??= ['single', 'kendo', 'home'].includes(p.kind) ? p.id : p.file;
    p.key = p.kind === 'kendo' ? keyOf(KENDO_FILE, p.file) : p.kind === 'home' ? keyOf(HOME_FILE, p.file)
      : p.kind === 'single' || p.kind === 'vrsingle' ? keyOf(SINGLE_FILE, p.file) : null;
    POSES[p.id] = p;
  }
}
const groupOf = (id) => GROUPS.find(([g]) => g === POSES[id]?.group);

/** Which of s / x / y a pose's fix can carry, and why not when it is none. */
function fixFields(P) {
  if (!P) return '';
  if (['single', 'kendo', 'home'].includes(P.kind)) return 'sxy';
  /* A clip has a size and a height, never a "forward": it is drawn from four or eight sides. Richard,
     Oct 2026, of the mount drawn above the rope and the hang below it: "there is no way for me to edit
     the height of the two clips ... there should be way for me to edit these in the sprite editor". */
  if (P.kind === 'vrsingle' || P.kind === 'clip') return 'sy';
  return '';
}
const FIX_WHY = {
  grid: 'The turnaround is sized by its own sheet. Which drawing shows at which angle is in Sheets ▸ kittens.',
  vrgrid: 'The headset turnaround is sized as her home one (setSimLook). Its columns are in Sheets ▸ kittens/…/vr.',
  vrsingle: 'In the headset only size and height move: a look carries one quad, and "forward" is a pair of them.',
  clip: 'A clip takes size and height only (one fix for every facing; the game scales it about the rope for a hanging clip). Its frame order is in Sheets ▸ ninja clips, one per facing.',
  lion: 'Lionheart is here to measure against: LION_HEIGHT 6.2 (dreamdojo.js). His cells\' order is in Sheets ▸ lionheart.',
};

/* The game's own loader options, so the cells and the pads are the game's. Everything loads RAW
   (`sheetFix: false`) and the draft's fix is applied here, so an unsaved order shows. */
const ONE = { views: 1, rows: 1, cell: 256, maxAtlas: 768, sheetFix: false };
const TURN = { views: 'auto', rows: 4, cell: 384, maxAtlas: 2048, sheetFix: false };
const TEA = { views: TEA_SHEET.cols, rows: TEA_SHEET.rows, uniform: true, cell: 256, maxAtlas: 2048, sheetFix: false };
const GRID_OF = { ember: 'kittens/ember/grid_v2', frost: 'kittens/frost/grid' };

const raw = {}; // sheet id -> atlas as drawn
let ninja = null;

async function loadArt() {
  const jobs = [];
  const get = (id, opts) => jobs.push(loadSpriteAtlas(`/sprites/${id}.png`, opts).then((a) => { if (a?.texture?.image) raw[id] = a; }).catch(() => {}));
  for (const s of ['ember', 'frost']) {
    const files = new Set([...Object.values(KENDO_FILE), ...Object.values(HOME_FILE), ...Object.values(SINGLE_FILE), 'bless']);
    files.delete('tea');
    for (const f of files) get(`kittens/${s}/${f}`, ONE);
    for (const f of Object.values(SINGLE_FILE)) get(`kittens/${s}/vr_${f}`, ONE);
    get(`kittens/${s}/tea`, TEA);
    get(GRID_OF[s], TURN);
    get(`kittens/${s}/vr`, TURN);
  }
  get('lionheart/town', { ...ONE, cell: 384, maxAtlas: 2048 });
  get('lionheart/shadow', { views: 4, rows: 1, cell: 384, maxAtlas: 2048, sheetFix: false });
  get('lionheart/defeated', { views: 2, rows: 1, cell: 384, maxAtlas: 2048, sheetFix: false });
  jobs.push(loadNinjaArt().then((n) => { ninja = n; }).catch(() => {}));
  await Promise.all(jobs);
}

/** A sheet with the DRAFT's order on it, as `loadSpriteAtlas` deals the saved one in the game. */
const dealt = (id) => (raw[id] ? applySheetFix(raw[id], gridFix(id, raw[id].cols, raw[id].rows, draft), THREE) : null);

/* Recolours are made once per kitten and kept until a sheet fix changes: Storm and Blossom ARE Ember's
   and Frost's drawings, and wear their fixes (keyed by sheet). */
const packs = [];
let packSheets = JSON.stringify(draft.sheets);
function packFor(i) {
  if (packs[i]) return packs[i];
  const s = PLAYER_STYLE[i];
  const tint = (a) => (a && s.recolour ? recolourAtlas(a, s.recolour) : (a ?? null));
  const get = (f) => tint(dealt(`kittens/${s.sheet}/${f}`));
  const kendo = {};
  for (const f of Object.values(KENDO_FILE)) kendo[f === 'kendo' ? 'guard' : f] = get(f);
  const home = { pray: get('pray'), bath: get('bath'), futon: get('futon'), tea: get('tea'), ref: get('bless') };
  const single = Object.fromEntries(Object.values(SINGLE_FILE).map((f) => [f, get(f)]));
  const vrPose = Object.fromEntries(Object.values(SINGLE_FILE).map((f) => [f, get(`vr_${f}`)]));
  packs[i] = { kendo, home, single, vrPose, grid: tint(dealt(GRID_OF[s.sheet])), vr: get('vr'), ninja: ninja?.kittens?.[i] ?? null };
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

const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ color: 0x8a6a48 }));
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
  const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-10, 0, 0), new THREE.Vector3(10, 0, 0)]);
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

let clock = 0; // the shared animation clock: tea frames, ninja clips

/** One figure on the stage: a kitten, a pose, and the real code that drew it. */
class Layer {
  constructor(name, kit, pose) {
    this.name = name;
    this.kit = kit;
    this.pose = POSES[pose] ? pose : 'stand';
    this.dx = 0; // side-by-side offset, B only
    this.opacity = 1;
    this.hidden = false;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.bb = null;
    this.player = null;
  }

  get P() { return POSES[this.pose]; }
  get sheet() { return PLAYER_STYLE[this.kit].sheet; }
  /** The spritefix.json key this pose's fix is saved under, or null when it cannot carry one. */
  get fixKey() {
    const P = this.P;
    if (!fixFields(P)) return null;
    // a clip's is keyed as its frame order is: `ninja/ember:mount` (ClipSprite `clipId`)
    if (P.kind === 'clip') return `ninja/${this.sheet}:${P.clip}`;
    return `${this.sheet}/${P.kind === 'vrsingle' ? `vr_${P.file}` : P.file}`;
  }
  get height() { return this.P.kind === 'lion' ? EDITOR_LION_H : EDITOR_HEIGHT[this.sheet] ?? 2.9; }

  /** Rebuild from scratch with the draft in force. Cheap: one Player, the atlases are shared. */
  build() {
    if (this.bb) this.root.remove(this.bb);
    // every nudge builds a new Player: hand the last one's clones back, or the GPU fills with them
    disposeAll(this.player?.group, this.bb);
    this.bb = null;
    this.player = null;
    const P = this.P;
    let bb = null;
    if (P.kind === 'lion') {
      const a = dealt(`lionheart/${P.sheet}`);
      if (a) {
        // as dreamdojo.js and shadow.js build him: front-facing, never mirrored, LION_HEIGHT over the packing
        const q = EDITOR_LION_H / (a.contentScale || 1);
        bb = new Billboard(a.texture, { cols: a.cols, rows: 1, width: q, height: q, footOffset: (a.pad ?? 0) * q, mirror: false });
        bb.lionCell = P.cell;
        if (P.sheet === 'shadow') bb.mat.color.set(SHADOW_TINT);
      }
    } else {
      const K = packFor(this.kit);
      const g = K.grid;
      if (!g) return;
      const p = new Player({
        texture: g.texture, cols: g.cols, rows: g.rows, contentScale: g.contentScale ?? 1, pad: g.pad ?? 0,
        mirror: g.cols <= 4 && g.rows === 1, index: this.kit, style: PLAYER_STYLE[this.kit],
        height: this.height, dirSense: 1,
      });
      this.player = p;
      if (P.kind === 'grid') { bb = p.sprite; bb.row = P.row; }
      if (P.kind === 'kendo') { p.setKendoArt(K.kendo); bb = p[P.key]; }
      if (P.kind === 'home') { p.setHomeArt(K.home); bb = p[P.key]; }
      if (P.kind === 'single' && K.single[P.file]) { p[SETTER[P.key]](K.single[P.file]); bb = p[P.key]; }
      if (P.kind === 'vrgrid' || P.kind === 'vrsingle') {
        // the headset exactly as the game puts her in it: home art first, then the sim looks over it
        if (P.kind === 'vrsingle' && K.single[P.file]) p[SETTER[P.key]](K.single[P.file]);
        p.setSimArt(K.vr);
        p.setSimPoseArt(K.vrPose);
        p.setSimLook(true);
        bb = P.kind === 'vrgrid' ? p.sprite : p[P.key];
        if (P.kind === 'vrgrid') bb.row = P.row;
      }
      if (P.kind === 'clip' && K.ninja) {
        p.setClipArt(K.ninja, ClipSprite);
        bb = p.clipPose;
        bb?.setClip(P.clip, 0);
      }
    }
    if (!bb) return;
    bb.parent?.remove(bb);
    bb.visible = true;
    bb.position.set(0, 0, 0);
    this.root.add(bb);
    this.bb = bb;
    this.style();
  }

  style() {
    this.root.visible = !this.hidden && !sheetMode;
    this.root.position.x = this.dx;
    // a TOP-aligned clip (the rope) hangs from its origin: hung here at her height, so she is above the floor
    this.root.position.y = this.bb?.clip?.align === 'top' ? this.height : 0;
    if (!this.bb) return;
    const m = this.bb.mat;
    m.opacity = this.opacity;
    m.transparent = true;
    // the same silhouette at any opacity: three tests alpha AFTER the opacity multiply
    m.alphaTest = 0.35 * this.opacity;
    // two drawings on one plane: which is on top is draw order, not depth
    m.depthWrite = false;
    m.depthTest = false;
    /* ON THE MESH. It was set on the Billboard, which is an Object3D with nothing to draw - three sorts
       by the renderOrder of the thing it draws, so "B in front" did nothing at all. */
    const top = (this.name === 'B') === bOnTop;
    this.bb.mesh.renderOrder = top ? 20 : 5;
  }

  face(right) {
    if (!this.bb) return;
    this.bb.facing = right ? Math.PI / 2 : -Math.PI / 2;
    this.right = right;
  }

  /** Per frame: the clip's clock, the tea's frame, his cell - then the game's own faceCamera. */
  draw() {
    const bb = this.bb;
    if (!bb) return;
    if (bb instanceof ClipSprite) {
      // a one-shot clip replays with a beat of rest, so a throw can be watched more than once
      const len = bb.clipFrames / bb.clip.fps;
      bb.clipT = bb.clip.loop ? clock : clock % (len + 0.6);
    }
    if (bb.anim) bb.frame = Math.floor(clock * 8) % (bb.cols * bb.rows);
    if (bb.lionCell != null) {
      bb.getWorldPosition(_wp);
      bb.mesh.rotation.y = Math.atan2(cam.position.x - _wp.x, cam.position.z - _wp.z);
      bb._setCell(bb.lionCell, 0, false);
      return;
    }
    bb.faceCamera(cam);
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
    const lift = bb.mesh.position.y; // the rope clip hangs its quad from her paws
    const kx = bb.mesh.scale.x, ky = bb.mesh.scale.y; // a clip's fix scales the mesh, not the quad
    const wx = (px) => {
      let u = (px + 0.5 - x0) / cw;
      if (flip) u = 1 - u;
      return (box.min.x + u * (box.max.x - box.min.x)) * kx + this.root.position.x;
    };
    const wy = (py) => lift + this.root.position.y + (box.max.y - ((py + 0.5 - y0) / ch) * (box.max.y - box.min.y)) * ky;
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
const _wp = new THREE.Vector3();

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
let bOnTop = ui.bOnTop ?? false;

/* ------------------------------------------------------------- the fixes */

const curFix = () => {
  const k = A.fixKey;
  if (!k) return { s: 1, x: 0, y: 0 };
  const i = k.indexOf('/');
  return poseFix(k.slice(0, i), k.slice(i + 1), draft);
};
const kitName = (L) => PLAYER_STYLE[L.kit].name;
const poseName = (L) => (L.P.kind === 'lion' ? `Lionheart ${L.pose.slice(5)}` : `${kitName(L)} ${L.pose}`);

function setFix(patch, why) {
  const k = A.fixKey;
  if (!k) { status(FIX_WHY[A.P.kind] ?? 'This pose has no fix.', true); return; }
  const allowed = fixFields(A.P);
  const f = { ...curFix() };
  for (const [n, v] of Object.entries(patch)) if (allowed.includes(n)) f[n] = Math.round(v * 10000) / 10000;
  if (canon.poses(f) === null) delete draft.poses[k]; else draft.poses[k] = f;
  commit(`pose:${k}:${why ?? Object.keys(patch).join('')}`, `${k}: ${why ?? Object.entries(patch).map(([n]) => `${n} ${f[n]}`).join(' ')}`);
}

function rebuild() {
  setSpriteFix(draft);
  A.build();
  B.build();
  syncInputs();
}

/** Solve `measure()[what]` -> `target` by moving the fix's `field` (x or y): one probe, a few secant steps. */
function solve(field, what, target, label) {
  for (let i = 0; i < 4; i++) {
    tick(0);
    const m0 = A.measure();
    if (!m0) return false;
    const err = target - m0[what];
    if (Math.abs(err) < 0.002) return true;
    const base = curFix()[field];
    setFix({ [field]: base + 0.02 }, label);
    tick(0);
    const m1 = A.measure();
    const slope = (m1[what] - m0[what]) / 0.02;
    if (!Number.isFinite(slope) || Math.abs(slope) < 1e-6) { setFix({ [field]: base }, label); return false; }
    setFix({ [field]: base + err / slope }, label);
  }
  return true;
}

/* --------------------------------------------------------------- playing */

let playing = false;
let seq = [];
let seqI = 0;
let seqT = 0;
const speed = () => 2 ** Number($('speed').value);

/** "Stand vs <group>" for every group - B holds her default pose while A plays the lot - and the kendo set's own. */
const SEQS = {};
for (const [g, name, list] of GROUPS) {
  SEQS[`Stand vs ${name}`] = { text: list.filter((p) => p.id !== 'stand').map((p) => `${p.id}:1`).join(', '), b: 'stand', group: g };
}
Object.assign(SEQS, {
  'kendo: ceremony': { text: 'seiza:1.4, reach:0.6, rei:1.1, kendo:1.2' },
  'kendo: strike': { text: 'kendo:0.8, kiai:0.35, kendo:0.6' },
  'kendo: riposte': { text: 'kendo:0.8, kparry:0.9, kendo:0.5' },
  'kendo: clinch': { text: 'kclinchR:1, kclinchL:1' },
  'kendo: broken': { text: 'kendo:0.7, kbroke:1.2' },
});

/* `pose:seconds`, split on the LAST colon: pose names have colons of their own now (vr:eat). */
function parseSeq(t) {
  return t.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const i = s.lastIndexOf(':');
    const d = i > 0 ? Number(s.slice(i + 1)) : NaN;
    const pose = Number.isFinite(d) ? s.slice(0, i).trim() : s;
    return { pose, t: Math.max(0.03, Number.isFinite(d) ? d : 0.5) };
  }).filter((r) => POSES[r.pose]);
}
function showStep(i) {
  if (!seq.length) return;
  seqI = ((i % seq.length) + seq.length) % seq.length;
  seqT = 0;
  A.pose = seq[seqI].pose;
  if ($('both').checked) B.pose = seq[seqI].pose;
  if (A.P.kind === 'lion' && zoom < 8.5) { zoom = 8.5; $('zoom').value = zoom; }
  rebuild();
}

/* ----------------------------------------------------------- the frame */

let zoom = Number(ui.zoom ?? 5);
let pitch = Number(ui.pitch ?? 22);
/* PAN, in world units, as a slide of the FRUSTUM - not of the lens, for the reason below. Richard, Oct
   2026: "it seems I can only zoom now with mouse ... is there a way to tilt and pan the camera with
   mouse or some keyboard commands?" There is no orbit, and that is on purpose: every billboard turns
   to the lens's bearing and picks its drawing by it, so an orbit would change WHICH drawing is on
   show. Turning her is the facing button, and the Sheets tab's turntable. */
let panX = Number(ui.panX ?? 0);
let panY = Number(ui.panY ?? 0);
const PITCH = [0, 80];
function setView(v, why) {
  if (v.zoom != null) zoom = Math.min(14, Math.max(2, v.zoom));
  if (v.pitch != null) pitch = Math.min(PITCH[1], Math.max(PITCH[0], v.pitch));
  if (v.panX != null) panX = Math.min(20, Math.max(-20, v.panX));
  if (v.panY != null) panY = Math.min(20, Math.max(-20, v.panY));
  $('zoom').value = zoom;
  $('pitch').value = pitch;
  Object.assign(ui, { zoom, pitch, panX, panY });
  keepUi();
  if (why) status(why);
}
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
  const mid = (sheetMode ? 0 : B.dx / 2) + panX;
  cam.left += mid;
  cam.right += mid;
  cam.top += panY;
  cam.bottom += panY;
  const look = new THREE.Vector3(0, zoom * 0.28, 0);
  cam.position.set(0, look.y + Math.sin(ph) * 40, Math.cos(ph) * 40);
  cam.lookAt(look);
  cam.updateProjectionMatrix();
}

let last = performance.now();
function tick(dt) {
  for (const L of [A, B]) {
    L.style();
    L.face(L === A ? faceRight : (ui.bFaceRight ?? faceRight));
    L.draw();
  }
  clock += dt * speed();
  if (playing && seq.length) {
    seqT += dt * speed();
    if (seqT >= seq[seqI].t) {
      if (seqI + 1 >= seq.length && !$('loop').checked) { playing = false; syncInputs(); } else showStep(seqI + 1);
    }
  }
  if (sheetMode) sheetTick(dt);
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
  shadow.visible = !sheetMode;
  const f = curFix();
  const H = A.height;
  const n = countOf(changes());
  const lines = sheetMode ? sheetReadout() : [
    `A ${poseName(A)}${A.fixKey ? `  s ${f.s.toFixed(3)}  x ${f.x.toFixed(3)}  y ${f.y.toFixed(3)}` : ''}`,
    mA ? `  top ${mA.top.toFixed(3)} (${(mA.top / H).toFixed(3)} H)  foot ${mA.foot.toFixed(3)}  body ${mA.body.toFixed(3)}` : (A.bb ? '' : '  (no drawing for this pose)'),
    B.hidden ? 'B hidden' : `B ${poseName(B)}`,
    mB ? `  top ${mB.top.toFixed(3)}  foot ${(mB.foot - B.dx).toFixed(3)}  body ${(mB.body - B.dx).toFixed(3)}` : '',
    mA && mB ? `A/B height ${(mA.top / mB.top).toFixed(3)}` : '',
    playing ? `▶ ${seq[seqI]?.pose} ${seqI + 1}/${seq.length}  ×${speed().toFixed(2)}` : `×${speed().toFixed(2)}`,
    `${bOnTop ? 'B' : 'A'} on top`,
  ];
  if (n) lines.push(`● ${n} unsaved`);
  $('readout').textContent = lines.filter(Boolean).join('\n');
}

/* ------------------------------------------------------------- the panel */

function fillSelect(sel, items, value) {
  sel.innerHTML = '';
  for (const [v, t] of items) sel.add(new Option(t, v));
  if (value != null) sel.value = value;
}
/** A <select> of `[group label, [[value, text], ...]]`, as <optgroup>s. */
function fillGrouped(sel, groups, value) {
  sel.innerHTML = '';
  for (const [label, items] of groups) {
    if (!items.length) continue;
    const og = document.createElement('optgroup');
    og.label = label;
    for (const [v, t] of items) og.append(new Option(t, v));
    sel.append(og);
  }
  if (value != null) sel.value = value;
  if (sel.selectedIndex < 0) sel.selectedIndex = 0;
}
const kits = PLAYER_STYLE.map((s, i) => [String(i), `${s.name}${s.recolour ? ` (${s.sheet}'s drawings)` : ''}`]);
const poseLabel = (p) => {
  const n = groupOf(p.id)[2].indexOf(p);
  const has = p.kind === 'lion' ? !!raw[`lionheart/${p.sheet}`] : p.kind === 'clip' ? !!ninja : true;
  return `${n < 9 ? `${n + 1}  ` : ''}${p.id}${has ? '' : '  (missing)'}`;
};
const poseGroups = () => GROUPS.map(([, name, list]) => [name, list.map((p) => [p.id, poseLabel(p)])]);

function syncInputs() {
  const f = curFix();
  const fields = fixFields(A.P);
  $('fx-s').value = f.s;
  $('fx-x').value = f.x;
  $('fx-y').value = f.y;
  for (const n of ['s', 'x', 'y']) $(`fx-${n}`).disabled = !fields.includes(n);
  for (const b of document.querySelectorAll('[data-s]')) b.disabled = !fields.includes('s');
  for (const id of ['snap-foot', 'snap-body']) $(id).disabled = !fields.includes('x');
  $('fx-note').textContent = fields === 'sxy' ? '' : FIX_WHY[A.P.kind] ?? '';
  $('a-kit').value = String(A.kit);
  $('b-kit').value = String(B.kit);
  $('a-kit').disabled = A.P.kind === 'lion';
  $('b-kit').disabled = B.P.kind === 'lion';
  $('a-pose').value = A.pose;
  $('b-pose').value = B.pose;
  $('b-op').value = B.opacity;
  $('b-op-v').textContent = B.opacity.toFixed(2);
  $('b-dx').value = B.dx;
  $('b-dx-v').textContent = B.dx.toFixed(2);
  $('face').textContent = faceRight ? '→ right' : '← left';
  $('b-front').textContent = bOnTop ? 'B on top' : 'A on top';
  $('b-front').classList.toggle('on', bOnTop);
  $('b-hide').classList.toggle('on', B.hidden);
  $('speed-v').textContent = `×${speed().toFixed(2)}`;
  $('guide-v').textContent = Number($('guide').value).toFixed(2);
  $('play').textContent = playing ? '❚❚ pause' : '▶ play';
  revertButtons();
  Object.assign(ui, { aKit: A.kit, bKit: B.kit, aPose: A.pose, bPose: B.pose, bOp: B.opacity, bDx: B.dx, faceRight, zoom, pitch, panX, panY, bOnTop });
  keepUi();
}

/** "Revert" and "clear" are live only when they would do something - so a lit button means a change. */
function revertButtons() {
  const k = A.fixKey;
  $('fx-revert').disabled = !k || canon.poses(draft.poses[k]) === canon.poses(saved.poses[k]);
  $('fx-clear').disabled = !k || canon.poses(draft.poses[k]) === null;
  const id = curSheet?.fixId;
  if (id) {
    // "as drawn" is live while what is DRAWN is not - for a facing, that can be the whole clip's order
    $('sh-reset').disabled = !curSheet.fix || isAsDrawn(curSheet.fix);
    $('sh-revert').disabled = canon.sheets(draft.sheets[id]) === canon.sheets(saved.sheets[id]);
  }
}
const isAsDrawn = (f) => !f.flip.length && f.order.every((c, k) => c === k) && f.order.length === curSheet?.drawn;

function wire() {
  fillSelect($('a-kit'), kits, String(A.kit));
  fillSelect($('b-kit'), kits, String(B.kit));
  fillGrouped($('a-pose'), poseGroups(), A.pose);
  fillGrouped($('b-pose'), poseGroups(), B.pose);
  fillGrouped($('seq-pick'), [
    ['Stand vs …', Object.keys(SEQS).filter((k) => SEQS[k].b).map((k) => [k, k])],
    ['Kendo', Object.keys(SEQS).filter((k) => !SEQS[k].b).map((k) => [k, k])],
  ], SEQS[ui.seq] ? ui.seq : 'Stand vs Kendo');
  $('seq').value = ui.seqText ?? SEQS[$('seq-pick').value].text;
  $('zoom').value = zoom;
  $('pitch').value = pitch;

  $('a-kit').onchange = (e) => { A.kit = +e.target.value; rebuild(); };
  $('b-kit').onchange = (e) => { B.kit = +e.target.value; rebuild(); };
  // Lionheart is 6.2 to her 2.9: a frame that holds her cuts him at the waist
  const roomFor = (L) => { if (L.P.kind === 'lion' && zoom < 8.5) { zoom = 8.5; $('zoom').value = zoom; } };
  $('a-pose').onchange = (e) => { A.pose = e.target.value; roomFor(A); rebuild(); };
  $('b-pose').onchange = (e) => { B.pose = e.target.value; roomFor(B); rebuild(); };
  for (const n of ['s', 'x', 'y']) {
    $(`fx-${n}`).onchange = (e) => { const v = Number(e.target.value); if (Number.isFinite(v)) setFix({ [n]: v }); };
  }
  for (const b of document.querySelectorAll('[data-s]')) b.onclick = () => setFix({ s: curFix().s * Number(b.dataset.s) }, 'scale step');
  $('fx-revert').onclick = () => {
    const k = A.fixKey;
    if (!k) return;
    if (saved.poses[k]) draft.poses[k] = clone(saved.poses[k]); else delete draft.poses[k];
    commit(`revert:${k}`, `${k}: reverted to saved`);
  };
  $('fx-clear').onclick = () => {
    const k = A.fixKey;
    if (!k) return;
    delete draft.poses[k];
    commit(`clear:${k}`, `${k}: fix cleared (code's size)`);
  };
  $('snap-foot').onclick = () => {
    // measured NOW, not off the last frame: a hidden pane draws no frames, and B may have just changed
    tick(0);
    const m = B.hidden ? null : B.measure();
    if (!m) { status('Show B first - the snap puts A\'s front foot on B\'s.', true); return; }
    const ok = solve('x', 'foot', m.foot - B.dx, 'front foot snapped');
    status(ok ? `A's front foot is on ${poseName(B)}'s (B's offset ignored).` : 'Could not solve the foot.', !ok);
  };
  $('snap-body').onclick = () => {
    const ok = solve('x', 'body', 0, 'body centred');
    status(ok ? 'A\'s body is centred over the shadow.' : 'Could not centre her.', !ok);
  };
  $('b-op').oninput = (e) => { B.opacity = Number(e.target.value); syncInputs(); };
  $('b-dx').oninput = (e) => { B.dx = Number(e.target.value); syncInputs(); };
  $('b-front').onclick = () => { bOnTop = !bOnTop; syncInputs(); };
  $('b-hide').onclick = () => { B.hidden = !B.hidden; syncInputs(); };
  $('swap').onclick = swap;
  $('face').onclick = () => { faceRight = !faceRight; syncInputs(); };
  $('pitch').oninput = (e) => { pitch = Number(e.target.value); syncInputs(); };
  $('zoom').oninput = (e) => { zoom = Number(e.target.value); syncInputs(); };
  $('view-reset').onclick = () => setView({ zoom: 5, pitch: 22, panX: 0, panY: 0 }, 'View back to the start: zoom 5, tilt 22°, centred.');
  $('guide').oninput = syncInputs;
  $('guide-snap').onclick = () => { tick(0); const m = B.measure(); if (m) { $('guide').value = m.top; syncInputs(); } };
  $('seq-pick').onchange = (e) => pickSeq(e.target.value);
  $('seq').onchange = () => { ui.seqText = $('seq').value; keepUi(); seq = parseSeq($('seq').value); };
  $('play').onclick = togglePlay;
  $('prev').onclick = () => step(-1);
  $('next').onclick = () => step(1);
  $('speed').oninput = syncInputs;
  $('save').onclick = save;
  $('undo').onclick = undo;
  $('redo').onclick = redo;
  $('discard').onclick = () => {
    const n = countOf(changes());
    $('discard-q').textContent = `Throw away ${n} unsaved change${n === 1 ? '' : 's'} on BOTH tabs?`;
    $('discard-ask').classList.add('open');
    $('discard-no').focus(); // the default answer is no (non-negotiable 7)
  };
  $('discard-no').onclick = () => $('discard-ask').classList.remove('open');
  $('discard-yes').onclick = () => {
    $('discard-ask').classList.remove('open');
    for (const k of Object.keys(draft)) delete draft[k];
    Object.assign(draft, shape(clone(saved)));
    commit('discard', 'discarded every unsaved change');
    status('Back to the saved file. Undo brings the changes back.');
  };
  $('tab-poses').onclick = () => setTab(false);
  $('tab-sheets').onclick = () => setTab(true);
  wireSheets();
  wireDrag();
  addEventListener('keydown', onKey);
  addEventListener('beforeunload', (e) => { if (countOf(changes())) { e.preventDefault(); e.returnValue = ''; } });
}

function pickSeq(name) {
  const S = SEQS[name];
  if (!S) return;
  $('seq').value = S.text;
  ui.seq = name;
  ui.seqText = S.text;
  keepUi();
  seq = parseSeq(S.text);
  if (S.b) {
    // "Stand vs ...": B is her standing self (the same kitten), A plays the group
    B.pose = S.b;
    B.hidden = false;
    $('both').checked = false;
  }
  playing = false;
  showStep(0);
}

function swap() {
  [A.kit, B.kit] = [B.kit, A.kit];
  [A.pose, B.pose] = [B.pose, A.pose];
  rebuild();
}
function togglePlay() {
  seq = parseSeq($('seq').value);
  if (!seq.length) { status('The sequence is empty - write it as pose:seconds, pose:seconds.', true); return; }
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
  const low = e.key.toLowerCase();
  const typing = e.target.matches?.('input[type=text], input[type=number], select');
  if ((e.ctrlKey || e.metaKey) && low === 's') { e.preventDefault(); save(); return; }
  // undo/redo are the page's, except inside a text box, where they are the box's own
  if ((e.ctrlKey || e.metaKey) && !typing && (low === 'z' || low === 'y')) {
    e.preventDefault();
    if (low === 'y' || e.shiftKey) redo(); else undo();
    return;
  }
  if (typing) {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const fine = e.shiftKey ? 0.2 : 1;
  const k = e.key;
  // THE VIEW, on both tabs: I J K L pan, T G tilt, R back to the start
  const pan = zoom * 0.05 * fine;
  if (low === 'j' || low === 'l') { setView({ panX: panX + (low === 'l' ? pan : -pan) }); return; }
  if (low === 'i' || low === 'k') { setView({ panY: panY + (low === 'i' ? pan : -pan) }); return; }
  if (low === 't' || low === 'g') { setView({ pitch: pitch + (low === 't' ? 2 : -2) * fine }); return; }
  if (low === 'r') { $('view-reset').click(); return; }
  if (sheetMode) {
    if (k === ' ') { e.preventDefault(); $('sh-play').click(); }
    if (k === ',' || k === '.') stepSheet(k === ',' ? -1 : 1);
    return;
  }
  const f = curFix();
  const nudge = 0.01 * fine;
  const bump = (d) => { $('speed').value = Math.min(2, Math.max(-4.3, Number($('speed').value) + d)); syncInputs(); };
  if (k === ' ') { e.preventDefault(); togglePlay(); return; }
  if (k === ',' || k === '.') { step(k === ',' ? -1 : 1); return; }
  if (k === '[' || k === ']') { bump(k === '[' ? -0.25 : 0.25); return; }
  if (/^[1-9]$/.test(k)) {
    const list = groupOf(A.pose)[2];
    if (list[Number(k) - 1]) { A.pose = list[Number(k) - 1].id; rebuild(); }
    return;
  }
  if (k === 'ArrowLeft' || k === 'ArrowRight') {
    e.preventDefault();
    if (!fixFields(A.P).includes('x')) return;
    // "forward" is the way she faces: the arrow is the SCREEN direction, so it is turned into hers
    const screen = k === 'ArrowRight' ? 1 : -1;
    setFix({ x: f.x + nudge * screen * (mA?.right === false ? -1 : 1) * xSign() }, 'nudge x');
    return;
  }
  if (k === 'ArrowUp' || k === 'ArrowDown') { e.preventDefault(); setFix({ y: f.y + (k === 'ArrowUp' ? nudge : -nudge) }, 'nudge y'); return; }
  if (k === '=' || k === '+') { setFix({ s: f.s * (1 + 0.02 * fine) }, 'scale'); return; }
  if (k === '-' || k === '_') { setFix({ s: f.s / (1 + 0.02 * fine) }, 'scale'); return; }
  if (k === 'Tab') { e.preventDefault(); swap(); return; }
  if (low === 'f') { faceRight = !faceRight; syncInputs(); return; }
  if (low === 'o') { B.opacity = B.opacity >= 0.95 ? 0.15 : Math.min(1, B.opacity + 0.2); syncInputs(); return; }
  if (low === 'a' || low === 'd') { B.dx = Math.min(4, Math.max(-4, B.dx + (low === 'a' ? -0.1 : 0.1) * fine)); syncInputs(); }
}

/** +1 when a bigger `x` moves A forward on screen (as it should for every pose), measured rather than trusted. */
let xSignCache = { key: null, v: 1 };
function xSign() {
  const k = `${A.kit}/${A.pose}/${faceRight}`;
  if (xSignCache.key === k) return xSignCache.v;
  const m0 = A.measure();
  const base = curFix().x;
  setSpriteFix({ ...draft, poses: { ...draft.poses, [A.fixKey]: { ...curFix(), x: base + 0.05 } } });
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

/* Drag A on the canvas: across is forward/back, up and down is her y. One drag is one undo step.
   The RIGHT or MIDDLE button drags the VIEW instead - pan, or with Shift held, tilt - and so does the
   left one wherever there is nothing of hers to drag (the Sheets tab, a pose with no fix). */
function wireDrag() {
  let drag = null;
  let view = null;
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button === 1 || e.button === 2 || sheetMode || !fixFields(A.P)) {
      e.preventDefault();
      view = { x: e.clientX, y: e.clientY, panX, panY, pitch };
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, f: curFix(), sign: xSign(), right: mA?.right !== false, id: performance.now() };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (view) {
      const perPx = zoom / canvas.clientHeight;
      if (e.shiftKey) setView({ pitch: view.pitch + (e.clientY - view.y) * 0.3 });
      // the picture follows the pointer: drag right and the world moves right, so the frustum moves left
      else setView({ panX: view.panX - (e.clientX - view.x) * perPx, panY: view.panY + (e.clientY - view.y) * perPx });
      return;
    }
    if (!drag) return;
    const perPx = zoom / canvas.clientHeight;
    const H = A.height;
    const dx = ((e.clientX - drag.x) * perPx) / H;
    const dy = (-(e.clientY - drag.y) * perPx / Math.cos(THREE.MathUtils.degToRad(pitch))) / H;
    setFix({ x: drag.f.x + dx * (drag.right ? 1 : -1) * drag.sign, y: drag.f.y + (e.shiftKey ? 0 : dy) }, `dragged ${drag.id}`);
  });
  const end = () => { drag = null; view = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    // Shift-wheel tilts; the wheel alone zooms, about the frame's centre
    if (e.shiftKey) setView({ pitch: pitch + (e.deltaY > 0 ? -2 : 2) });
    else setView({ zoom: zoom * (e.deltaY > 0 ? 1.08 : 1 / 1.08) });
    syncInputs();
  }, { passive: false });
}

/* ---------------------------------------------------------------- sheets */

/*
 * WHAT A SHEET IS decides what the tab can do with it:
 *   turn    a turnaround (the kittens' grids, the headset's): a real Player wearing it, turning.
 *   cells   several drawings the game picks between by name or angle (Lionheart's poses, the hospital
 *           cat): order and flip, honoured by `loadSpriteAtlas`, shown one cell at a time.
 *   clip    one Bamboo Infiltration animation out of a packed ninja atlas: its FRAME order, honoured
 *           by `ClipSprite`. Rows are directions, and each has its OWN order (`ninja/ember:sneak@2`,
 *           spritefix.js `clipKey`) - the facing picked is the one edited. A facing with none of its
 *           own plays the whole clip's (`ninja/ember:sneak`), which "every facing" writes.
 *   frames  the tea pour: an animation played straight through - shown, not re-dealt.
 *   set     the door mats: twenty designs on one sheet, each switchable off in the game.
 *   single  one drawing: nothing to order. Its size and place are fixed in Poses, where it has one.
 */
const KIND_NOTE = {
  turn: 'A turnaround: each column is one angle. The turntable is the game\'s own pick of column for every angle. Each row has its own order: the one picked below is the one you edit.',
  cells: 'Separate drawings the game picks between. A new order is honoured wherever the game loads this sheet. With more than one row, each row has its own.',
  clip: 'One Bamboo Infiltration clip: its frames, in the order they play. Each facing has its own order: the one picked below is the one you edit.',
  frames: 'An animation the game plays straight through. Shown here; nothing to re-deal.',
  set: 'A set of designs on one sheet. Each one can be switched off so the game stops offering it.',
  single: 'One drawing. Nothing to reorder here; if it is a kitten pose, its size and place are in Poses.',
};
const CELLS = { 'hospital/cat': { views: 10, rows: 2 }, 'lionheart/shadow': { views: 4, rows: 1 }, 'lionheart/defeated': { views: 2, rows: 1 } };
const DIRS = {
  4: ['front', 'right', 'back', 'left'],
  8: ['front', 'front-right', 'right', 'back-right', 'back', 'back-left', 'left', 'front-left'],
};

function kindOf(id) {
  if (id.includes(':')) return 'clip';
  if (/^kittens\/[^/]+\/(grid\w*|vr)$/.test(id)) return 'turn';
  if (CELLS[id]) return 'cells';
  if (/^kittens\/[^/]+\/tea$/.test(id)) return 'frames';
  if (id === 'housing/doormats') return 'set';
  return 'single';
}

let sheetMode = false;
let curSheet = null; // { id, kind, fixId, atlas (raw), n, ... }
let sheetList = [];
const sheetRaw = {}; // id -> atlas as drawn (Sheets tab), or an <img> for single/set
let shStep = 0; // the slot (turn/cells/clip/frames) or design (set) on show
let shT = 0; // time inside the current step, or the turntable's angle
let shPlay = true;
let spinAngle = 0;

function setTab(sheets) {
  if (sheets === sheetMode) return;
  sheetMode = sheets;
  $('tab-poses').classList.toggle('on', !sheets);
  $('tab-sheets').classList.toggle('on', sheets);
  $('poses').hidden = sheets;
  $('sheets').hidden = !sheets;
  $('cells').hidden = !sheets;
  if (sheets) buildSheet();
  else clearSheetStage();
  A.style();
  B.style();
  /* ONE SAVE FOR BOTH TABS, and it says so the moment you cross with something unsaved behind you. */
  const c = changes();
  const left = sheets ? c.poses.length : c.sheets.length + c.off.length;
  if (left) {
    status(`${left} unsaved change${left === 1 ? '' : 's'} on the ${sheets ? 'Poses' : 'Sheets'} tab. Save writes BOTH tabs at once (${countOf(c)} in all).`, true);
  }
}

async function loadSheetList() {
  try {
    const r = await fetch('/__spritefix/list');
    if (!r.ok) throw new Error(r.status);
    sheetList = (await r.json()).map((s) => s.id);
  } catch {
    // not the dev server: what this page already knows about
    sheetList = [...new Set([...Object.keys(raw), 'housing/doormats', 'hospital/cat'])].sort();
  }
  // the ninja atlases are offered as their clips, not as one 2040-square picture
  sheetList = sheetList.filter((id) => !/^ninja\//.test(id));
  for (const [who, man] of Object.entries(NINJA_ATLAS)) for (const c of Object.keys(man.clips)) sheetList.push(`ninja/${who}:${c}`);
}

function wireSheets() {
  const groups = {};
  for (const id of sheetList) {
    const g = id.includes(':') ? 'ninja clips' : id.split('/').slice(0, id.startsWith('kittens/') ? 2 : 1).join('/');
    (groups[g] ??= []).push([id, `${id}${kindOf(id) === 'single' ? '' : `  · ${kindOf(id)}`}`]);
  }
  fillGrouped($('sh-pick'), Object.entries(groups), ui.sheet ?? 'kittens/ember/grid_v2');
  $('sh-pick').onchange = () => { ui.sheet = $('sh-pick').value; keepUi(); shStep = 0; buildSheet(); };
  $('sh-row').onchange = () => { ui.shRow = Number($('sh-row').value); keepUi(); buildSheet(); };
  $('sh-apply').onclick = applyOrderText;
  for (const id of ['sh-order', 'sh-flip']) $(id).onkeydown = (e) => { if (e.key === 'Enter') applyOrderText(); };
  $('sh-reset').onclick = () => {
    const id = curSheet?.fixId;
    if (!id) return;
    asDrawn(curSheet);
    commit(`sheet:${id}:reset`, `${id}: as drawn`);
  };
  /* ONE FACING'S (OR ROW'S) ORDER FOR THE WHOLE CLIP OR SHEET: written to the bare key, and every
     facing's or row's own key goes, so they all play it. The undo is one step. This is also the way
     to change how MANY slots a sheet has: a row alone cannot (`rowLen`). */
  $('sh-every').onclick = () => {
    const S = curSheet;
    if (!S?.baseId) return;
    const what = S.kind === 'clip' ? 'facing' : 'row';
    if (S.fix && !isAsDrawn(S.fix)) draft.sheets[S.baseId] = clone({ order: S.fix.order, flip: S.fix.flip }); else delete draft.sheets[S.baseId];
    for (let r = 0; r < S.rows.length; r++) delete draft.sheets[clipKey(S.baseId, r)];
    commit(`sheet:${S.baseId}:every`, `${S.baseId}: ${S.rows[S.row]}'s order for every ${what}`);
    status(`Every ${what} of ${S.kind === 'clip' ? S.clipName : S.baseId} now plays the ${S.rows[S.row]} order.`);
  };
  $('sh-revert').onclick = () => {
    const id = curSheet?.fixId;
    if (!id) return;
    if (saved.sheets[id]) draft.sheets[id] = clone(saved.sheets[id]); else delete draft.sheets[id];
    commit(`sheet:${id}:revert`, `${id}: reverted to saved`);
  };
  $('set-all').onclick = () => {
    if (!draft.off['housing/doormats']?.length) return;
    delete draft.off['housing/doormats'];
    commit('off:all', 'door mats: every design on');
  };
  fillSelect($('sh-mode'), [
    ['spin', '⟳ turntable — the game\'s pick at every angle'],
    ['loop', 'loop through, in order'],
    ['pingpong', 'ping-pong (there and back)'],
    ['once', 'once, then stop'],
    ['hold', 'hold each, then loop'],
  ], ui.shMode ?? 'spin');
  $('sh-hold').value = ui.shHold ?? 1;
  $('sh-mode').onchange = () => { ui.shMode = $('sh-mode').value; keepUi(); shT = 0; shPlay = true; syncSheetPlay(); };
  $('sh-hold').onchange = () => { ui.shHold = Number($('sh-hold').value) || 1; keepUi(); };
  $('sh-play').onclick = () => {
    if (!shPlay && $('sh-mode').value === 'once' && shStep >= curSheet.n - 1) shStep = 0; // a finished "once" plays again
    shPlay = !shPlay;
    syncSheetPlay();
  };
  $('sh-prev').onclick = () => stepSheet(-1);
  $('sh-next').onclick = () => stepSheet(1);
  $('sh-speed').oninput = syncSheetPlay;
}

function syncSheetPlay() {
  const mode = $('sh-mode').value;
  $('sh-play').textContent = shPlay ? '❚❚ pause' : '▶ play';
  $('sh-speed-v').textContent = `×${(2 ** Number($('sh-speed').value)).toFixed(2)}`;
  $('sh-hold-row').hidden = mode !== 'hold';
  const spins = curSheet && (curSheet.kind === 'turn' || curSheet.kind === 'clip');
  $('sh-mode').options[0].disabled = !spins;
  if (!spins && mode === 'spin') { $('sh-mode').value = 'loop'; return syncSheetPlay(); }
  $('sh-mode-note').textContent = mode === 'spin'
    ? (curSheet?.kind === 'clip' ? 'She turns slowly while the clip plays: each direction row takes over where the game would.' : 'She turns through every angle; the highlighted tile is the column the game draws at that angle.')
    : mode === 'hold' ? 'Each one is held, then the next - a pause to look at every drawing.'
      : 'Click a tile to stop on it.';
}

function stepSheet(d) {
  if (!curSheet) return;
  shPlay = false;
  if ($('sh-mode').value === 'spin') $('sh-mode').value = 'loop';
  shStep = ((shStep + d) % curSheet.n + curSheet.n) % curSheet.n;
  shT = 0;
  syncSheetPlay();
  showSheetStep();
}

const parseNums = (t) => t.split(/[\s,]+/).filter(Boolean).map((v) => Number(v) - 1).filter((v) => Number.isInteger(v) && v >= 0);
// the flip box also takes "-4": skip the next 4, leaving it plain (`flipSlots`). A skip is `~c`, so `-1` is image 0.
const parseFlip = (t) => t.split(/[\s,]+/).filter(Boolean).map((v) => (v.startsWith('-') ? (Number(v.slice(1)) >= 1 ? ~(Number(v.slice(1)) - 1) : NaN) : Number(v) - 1))
  .filter((v) => Number.isInteger(v) && (v >= 0 || ~v >= 0));

/* "As drawn" for a facing that would otherwise fall back to the whole clip's order has to SAY as drawn
   (an order 1..n): deleting its key would show the clip's order again, which is what was asked away. */
function asDrawn(S) {
  if (S.kind === 'clip' && sheetFix(S.baseId, S.drawn, draft)) draft.sheets[S.fixId] = { order: [...Array(S.drawn).keys()], flip: [] };
  // A sheet's row the same - but only when "as drawn" is as many slots as every other row; else back to the sheet's.
  else if (S.byRow && sheetFix(S.baseId, S.drawn, draft) && rowLen(S) === S.drawn) draft.sheets[S.fixId] = { order: [...Array(S.drawn).keys()], flip: [] };
  else {
    delete draft.sheets[S.fixId];
    if (S.byRow && sheetFix(S.baseId, S.drawn, draft) && rowLen(S) !== S.drawn) {
      status(`${S.rows[S.row]} plays the sheet's order again: the sheet has ${rowLen(S)} slots and every row must too, so this row alone cannot go back to all ${S.drawn} drawings. "This order for every row" can.`, true);
    }
  }
}

/** How many slots each row of a sheet has: the sheet-wide order's, or the columns as drawn. A row's own order must
 *  match it, or the sheet would stop being a grid - `gridFix` ignores one that does not, so the editor refuses it. */
const rowLen = (S) => sheetFix(S.baseId, S.drawn, draft)?.order.length ?? S.drawn;
const rowLenBad = (S, n) => S.byRow && n !== rowLen(S)
  && (status(`Every row of ${S.baseId} has ${rowLen(S)} slots, so ${S.rows[S.row]}'s order needs ${rowLen(S)} too (this one has ${n}). To change how many the whole sheet has, set it on one row and press "this order for every row" first.`, true), true);

/** The order box is IMAGE numbers; so is the flip box - turned into slots here, which is what the file holds.
 *  One mention per slot: "6" is the first 6 in the order, "6, 6" the first two, "-6, 6" the second alone (`flipSlots`). */
function applyOrderText() {
  const S = curSheet;
  if (!S?.fixId) return;
  const order = parseNums($('sh-order').value);
  const flipImgs = parseFlip($('sh-flip').value);
  if (!order.length) {
    asDrawn(S);
    commit(`sheet:${S.fixId}:order`, `${S.fixId}: as drawn`);
    status('No order - the sheet is drawn as it was loaded.');
    return;
  }
  const bad = [...order, ...flipImgs.map((t) => (t < 0 ? ~t : t))].filter((c) => c >= S.drawn);
  if (!bad.length && rowLenBad(S, order.length)) return;
  if (bad.length) { status(`This ${S.kind === 'clip' ? 'clip has' : 'sheet has'} ${S.drawn} images; ${[...new Set(bad)].map((c) => c + 1).join(', ')} is not one of them. Nothing applied.`, true); return; }
  const { flip, extra } = flipSlots(order, flipImgs);
  draft.sheets[S.fixId] = { order, flip };
  commit(`sheet:${S.fixId}:order`, `${S.fixId}: order ${order.map((c) => c + 1).join(',')}${flip.length ? ` flip ${flipText(flipImages(order, flip))}` : ''}`);
  // A mention with no slot left is said, not dropped: "6, 6, 6" against two 6s is a typo she should see.
  const said = [...new Set(extra)].map((c) => `${c + 1} is in the order ${order.filter((o) => o === c).length || 'no'} time${order.filter((o) => o === c).length === 1 ? '' : 's'}`);
  status(`${S.fixId}: ${order.length} slots, ${flip.length} mirrored (slot${flip.length === 1 ? '' : 's'} ${flip.map((k) => k + 1).join(', ') || '-'}).${said.length ? ` Not flipped: ${said.join('; ')}.` : ''}`, said.length > 0);
}

async function rawFor(id, kind) {
  if (sheetRaw[id]) return sheetRaw[id];
  const url = `/sprites/${id.split(':')[0]}.png`;
  let a = null;
  if (kind === 'turn') a = raw[id] ?? await loadSpriteAtlas(url, TURN).catch(() => null);
  else if (kind === 'cells') a = raw[id] ?? await loadSpriteAtlas(url, { ...CELLS[id], cell: 384, maxAtlas: 2048, sheetFix: false }).catch(() => null);
  else if (kind === 'frames') a = raw[id] ?? await loadSpriteAtlas(url, TEA).catch(() => null);
  else if (kind === 'clip') a = null; // the ninja textures are loadNinjaArt's
  else a = await new Promise((res) => { const im = new Image(); im.onload = () => res({ image: im }); im.onerror = () => res(null); im.src = url; });
  if (a) sheetRaw[id] = a;
  return a;
}

let buildSeq = 0;
async function buildSheet() {
  const id = $('sh-pick').value;
  const kind = kindOf(id);
  const mySeq = ++buildSeq;
  const a = await rawFor(id, kind);
  if (mySeq !== buildSeq || !sheetMode) return;
  clearSheetStage();
  const S = { id, kind, fixId: ['turn', 'cells', 'clip'].includes(kind) ? id : null, atlas: a };
  if (kind === 'clip') {
    const [who, clip] = id.slice(6).split(':');
    S.man = NINJA_ATLAS[who];
    S.clip = S.man.clips[clip];
    S.clipName = clip;
    S.tex = who === 'samurai' || who === 'archer' ? ninja?.[who]?.texture : ninja?.kittens?.[PLAYER_STYLE.findIndex((s) => s.sheet === who && !s.recolour)]?.texture;
    S.drawn = S.clip.frames;
    S.rows = DIRS[S.clip.dirs] ?? [...Array(S.clip.dirs).keys()].map(String);
  } else if (kind === 'set') {
    S.drawn = DOOR_MATS.length;
    S.rows = null;
  } else if (a?.cols) {
    S.drawn = a.cols;
    S.rows = kind === 'turn' ? ROWS : kind === 'frames' ? null : a.rows > 1 ? [...Array(a.rows).keys()].map((r) => `row ${r + 1}`) : null;
  } else {
    S.drawn = 1;
    S.rows = null;
  }
  curSheet = S;
  $('sh-kind').textContent = a || S.tex ? KIND_NOTE[kind] : `${id} did not load.`;
  $('sh-edit').hidden = !S.fixId;
  $('sh-set').hidden = kind !== 'set';
  $('sh-row-l').textContent = kind === 'clip' ? 'facing' : 'row';
  $('sh-row').parentElement.hidden = !S.rows;
  if (S.rows) {
    const keep = Math.min(ui.shRow ?? 0, S.rows.length - 1);
    fillSelect($('sh-row'), S.rows.map((r, i) => [String(i), r]), String(Math.max(0, keep)));
  }
  S.row = S.rows ? Number($('sh-row').value) : 0;
  /* a clip is edited one FACING at a time: its key is the facing's, and it falls back to the clip's.
     A sheet with rows the same, one ROW at a time (Richard: "For kittensrostr and the Jump row ...") */
  S.byRow = (kind === 'turn' || kind === 'cells') && !!S.rows;
  if (kind === 'clip' || S.byRow) { S.baseId = id; S.fixId = clipKey(id, S.row); }
  $('sh-every').hidden = !S.baseId;
  $('sh-every').textContent = `this order for every ${kind === 'clip' ? 'facing' : 'row'}`;
  // the whole sheet, every row's own included - what the stage's Player and the cells plane are dealt
  S.grid = S.byRow && a ? gridFix(id, S.drawn, a.rows, draft) : null;
  const fix = kind === 'clip' ? sheetFix(S.baseId, S.drawn, draft, S.row) : S.byRow ? rowOf(S.grid, S.row) : S.fixId ? sheetFix(S.fixId, S.drawn, draft) : null;
  S.fix = fix;
  S.order = fix?.order ?? [...Array(S.drawn).keys()];
  S.n = kind === 'set' ? DOOR_MATS.length : kind === 'frames' && a ? a.cols * a.rows : S.order.length;
  if (S.fixId) {
    $('sh-order').value = fix ? fix.order.map((c) => c + 1).join(', ') : '';
    /* One token per slot up to the last mirrored one, repeats kept: "6, 6" when both are, "-4, 4" when only the later
       4 is. Every set of mirrored slots can be written this way, so Enter on an unchanged box changes nothing - the
       warning that used to say "Enter would move it" for a later-only mirror is gone with the case. */
    $('sh-flip').value = fix ? flipText(flipImages(fix.order, fix.flip)) : '';
  }
  shStep = Math.min(shStep, S.n - 1);
  buildStrip(S);
  buildSheetStage(S);
  syncSheetPlay();
  showSheetStep();
  revertButtons();
}

/** The tiles: every SOURCE image of the chosen row, by image number, marked with the slot it plays in. */
function buildStrip(S) {
  const strip = $('cells');
  strip.innerHTML = '';
  const tile = (draw, label, sub, cls, title, onclick) => {
    const d = document.createElement('div');
    d.className = `cell ${cls}`;
    const cv = document.createElement('canvas');
    cv.width = 96; cv.height = 96;
    draw(cv.getContext('2d'));
    const b = document.createElement('b');
    b.textContent = label;
    const i = document.createElement('i');
    i.textContent = sub;
    d.append(cv, b, i);
    d.title = title;
    d.onclick = onclick;
    strip.append(d);
    return d;
  };
  const fit = (g, img, sx, sy, sw, sh) => {
    const k = Math.min(96 / sw, 96 / sh);
    g.drawImage(img, sx, sy, sw, sh, (96 - sw * k) / 2, (96 - sh * k) / 2, sw * k, sh * k);
  };
  if (S.kind === 'set') {
    const img = S.atlas?.image;
    const off = draft.off['housing/doormats'] ?? [];
    const sx = img ? img.width / DOOR_MAT_SHEET.w : 1;
    DOOR_MATS.forEach((m, k) => {
      const isOff = off.includes(m.id);
      const [x, y, w, h] = m.rect;
      const d = tile((g) => img && fit(g, img, x * sx, y * sx, w * sx, h * sx), `${k + 1}`, m.name, isOff ? 'off' : '',
        `${m.name} (${m.id}) - ${isOff ? 'OFF: the game will not offer it' : 'on in the game'}. Tick the box to switch it.`, () => { shPlay = false; shStep = k; syncSheetPlay(); showSheetStep(); });
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !isOff;
      cb.title = isOff ? `switch ${m.name} back on in the game` : `switch ${m.name} off in the game`;
      cb.onclick = (e) => { e.stopPropagation(); toggleMat(m); };
      d.append(cb);
    });
    return;
  }
  if (S.kind === 'single') {
    const img = S.atlas?.image;
    tile((g) => img && fit(g, img, 0, 0, img.width, img.height), '1', S.id.split('/').pop(), 'sel', 'One drawing', () => {});
    return;
  }
  const src = S.kind === 'clip' ? S.tex?.image : S.atlas?.texture?.image;
  const cellAt = (c) => {
    if (S.kind === 'clip') { const z = S.man.cell; return [(S.clip.col + c) * z, (S.clip.row + S.row) * z, z, z]; }
    const a = S.atlas;
    const cw = src.width / a.cols, ch = src.height / a.rows;
    if (S.kind === 'frames') return [(c % a.cols) * cw, Math.floor(c / a.cols) * ch, cw, ch];
    return [c * cw, S.row * ch, cw, ch];
  };
  const count = S.kind === 'frames' ? S.n : S.drawn;
  for (let c = 0; c < count; c++) {
    const slots = S.order.map((s, k) => (s === c ? k : -1)).filter((k) => k >= 0);
    const flipped = slots.some((k) => S.fix?.flip.includes(k));
    const ord = (k) => `${k + 1}${['st', 'nd', 'rd'][k] ?? 'th'}`;
    const sub = S.kind === 'frames' ? `frame ${c + 1}` : slots.length ? `→ slot ${slots.map((k) => k + 1).join(', ')}${flipped ? ' ⇋' : ''}` : 'dropped';
    tile((g) => src && fit(g, src, ...cellAt(c)), `img ${c + 1}`, sub,
      `${slots.length || S.kind === 'frames' ? '' : 'out'} ${flipped ? 'flip' : ''}`,
      S.kind === 'frames' ? `frame ${c + 1}` : slots.length
        ? `Image ${c + 1} plays ${slots.map(ord).join(' and ')}${flipped ? ', mirrored' : ''}.\nClick: show it.  Shift-click: drop it.  Alt-click: mirror it.`
        : `Image ${c + 1} is dropped - the game never shows it.\nShift-click to add it back (at the end).`,
      (e) => tileClick(S, c, slots, e));
  }
}

function tileClick(S, c, slots, e) {
  if (S.kind === 'frames' || !S.fixId) { shPlay = false; shStep = c; syncSheetPlay(); showSheetStep(); return; }
  const f = clone(S.fix ?? { order: [...Array(S.drawn).keys()], flip: [] });
  if (e.shiftKey) {
    if (slots.length) {
      const i = slots[0];
      f.order.splice(i, 1);
      f.flip = f.flip.filter((q) => q !== i).map((q) => (q > i ? q - 1 : q));
      if (!f.order.length) { status('A sheet cannot drop every image. Use "as drawn" to start over.', true); return; }
    } else f.order.push(c);
    if (rowLenBad(S, f.order.length)) return;
    draft.sheets[S.fixId] = f;
    commit(`sheet:${S.fixId}:tile`, `${S.fixId}: ${slots.length ? 'dropped' : 'added back'} img ${c + 1}`);
    return;
  }
  if (e.altKey) {
    if (!slots.length) { status(`Image ${c + 1} is dropped - add it back (Shift-click) before mirroring it.`, true); return; }
    const on = slots.some((k) => f.flip.includes(k));
    f.flip = on ? f.flip.filter((q) => !slots.includes(q)) : [...f.flip, ...slots];
    draft.sheets[S.fixId] = f;
    commit(`sheet:${S.fixId}:flip${c}`, `${S.fixId}: img ${c + 1} ${on ? 'unmirrored' : 'mirrored'}`);
    return;
  }
  if (!slots.length) { status(`Image ${c + 1} is dropped, so the game never shows it. Shift-click adds it back.`, true); return; }
  shPlay = false;
  if ($('sh-mode').value === 'spin') $('sh-mode').value = 'loop';
  shStep = slots[0];
  syncSheetPlay();
  showSheetStep();
}

function toggleMat(m) {
  const list = [...(draft.off['housing/doormats'] ?? [])];
  const was = list.includes(m.id);
  if (!was && list.length >= DOOR_MATS.length - 1) { status('At least one design has to stay on - the game needs something to lay.', true); buildSheet(); return; }
  const next = was ? list.filter((q) => q !== m.id) : [...list, m.id];
  if (next.length) draft.off['housing/doormats'] = next; else delete draft.off['housing/doormats'];
  commit(`off:${m.id}`, `door mat ${m.name}: ${was ? 'on' : 'OFF'} in the game`);
}

/* ---- the stage for a sheet ---- */

let sheetLayer = null;
function clearSheetStage() {
  if (sheetLayer) { scene.remove(sheetLayer); disposeAll(sheetLayer); sheetLayer = null; }
}

/** A flat plane showing one cell, for kinds the game never turns (cells, frames, single, set). */
function cellPlane() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide }));
  m.userData.paint = (img, sx, sy, sw, sh, flip) => {
    const g = c.getContext('2d');
    g.clearRect(0, 0, 512, 512);
    const k = Math.min(512 / sw, 512 / sh);
    g.save();
    if (flip) { g.translate(512, 0); g.scale(-1, 1); }
    g.drawImage(img, sx, sy, sw, sh, (512 - sw * k) / 2, 512 - sh * k, sw * k, sh * k);
    g.restore();
    tex.needsUpdate = true;
    const H = 4.2;
    m.scale.set(H, H, 1);
    m.position.y = H / 2;
  };
  return m;
}

function buildSheetStage(S) {
  sheetLayer = new THREE.Group();
  scene.add(sheetLayer);
  if (S.kind === 'turn' && S.atlas) {
    // a real Player wearing the re-dealt sheet, as the game deals it
    const a = applySheetFix(S.atlas, S.grid ?? S.fix, THREE);
    const who = S.id.split('/')[1];
    const kit = Math.max(0, PLAYER_STYLE.findIndex((s) => s.sheet === who && !s.recolour));
    const p = new Player({
      texture: a.texture, cols: a.cols, rows: a.rows, contentScale: a.contentScale ?? 1, pad: a.pad ?? 0,
      mirror: a.cols <= 4 && a.rows === 1, index: kit, style: PLAYER_STYLE[kit], height: EDITOR_HEIGHT[who] ?? 2.9, dirSense: 1,
    });
    const bb = p.sprite;
    bb.parent?.remove(bb);
    bb.row = S.row;
    sheetLayer.add(bb);
    S.bb = bb;
  } else if (S.kind === 'clip' && S.tex) {
    // a real ClipSprite: it reads the draft's frame order itself (`clipFix`)
    const bb = new ClipSprite(S.tex, S.man, 2.9);
    bb.setClip(S.clipName, 0);
    sheetLayer.add(bb);
    S.bb = bb;
  } else {
    S.plane = cellPlane();
    sheetLayer.add(S.plane);
    if (S.kind === 'cells' && S.atlas) S.dealtAtlas = applySheetFix(S.atlas, S.grid ?? S.fix, THREE);
  }
}

/** Put slot `shStep` on the stage, and light its tile. */
function showSheetStep() {
  const S = curSheet;
  if (!S) return;
  const k = shStep;
  if (S.kind === 'turn' && S.bb && $('sh-mode').value !== 'spin') {
    // the facing that lands exactly on that column (full turn: column k is k steps round from facing the lens)
    spinAngle = (k / S.n) * Math.PI * 2;
  }
  if (S.kind === 'clip' && S.bb && $('sh-mode').value !== 'spin') {
    // the facing being edited, square to the lens (which sits on x = 0, bearing 0)
    S.bb.facing = (S.row / S.clip.dirs) * Math.PI * 2;
    S.bb.clipT = (k + 0.5) / S.clip.fps;
  }
  if (S.plane) {
    if (S.kind === 'set' && S.atlas?.image) {
      const img = S.atlas.image, sx = img.width / DOOR_MAT_SHEET.w;
      const [x, y, w, h] = DOOR_MATS[k].rect;
      S.plane.userData.paint(img, x * sx, y * sx, w * sx, h * sx, false);
    } else if (S.kind === 'single' && S.atlas?.image) {
      const img = S.atlas.image;
      S.plane.userData.paint(img, 0, 0, img.width, img.height, false);
    } else if (S.kind === 'frames' && S.atlas) {
      const a = S.atlas, img = a.texture.image, cw = img.width / a.cols, ch = img.height / a.rows;
      S.plane.userData.paint(img, (k % a.cols) * cw, Math.floor(k / a.cols) * ch, cw, ch, false);
    } else if (S.kind === 'cells' && S.dealtAtlas) {
      // the DEALT sheet: slot k of what the game would load, mirror and all
      const a = S.dealtAtlas, img = a.texture.image, cw = img.width / a.cols, ch = img.height / a.rows;
      S.plane.userData.paint(img, k * cw, S.row * ch, cw, ch, false);
    }
  }
  lightTile();
}

function lightTile() {
  const S = curSheet;
  const cells = $('cells').children;
  const src = S.kind === 'set' || S.kind === 'frames' || S.kind === 'single' ? shStep : S.order[shStep];
  for (let c = 0; c < cells.length; c++) cells[c].classList.toggle('sel', c === src);
}

/** Per frame on the Sheets tab: advance whichever playback is on. */
function sheetTick(dt) {
  const S = curSheet;
  if (!S) return;
  const mode = $('sh-mode').value;
  const sp = 2 ** Number($('sh-speed').value);
  if (S.bb) {
    if (mode === 'spin') {
      if (shPlay) spinAngle += dt * sp * 0.8;
      S.bb.facing = spinAngle;
      if (S.kind === 'clip') {
        if (shPlay) S.bb.clipT += dt * sp;
        if (!S.clip.loop && S.bb.clipDone) S.bb.clipT = 0;
      }
    } else if (S.kind === 'turn') S.bb.facing = spinAngle;
    S.bb.faceCamera(cam);
  }
  if (mode === 'spin') {
    if (S.kind === 'turn' && S.bb) {
      // which column the game drew at this angle: read back off the texture, as `measure` does
      const rx = S.bb.tex.repeat.x;
      const u0 = rx < 0 ? S.bb.tex.offset.x + rx : S.bb.tex.offset.x;
      shStep = Math.min(S.n - 1, Math.floor((u0 + Math.abs(rx) / 2) * S.bb.cols));
      lightTile();
    }
    if (S.kind === 'clip' && S.bb) { shStep = S.bb.clipFrame; lightTile(); }
    return;
  }
  if (!shPlay || S.n < 2) return;
  const hold = mode === 'hold' ? Math.max(0.1, Number($('sh-hold').value) || 1) : 1 / (S.kind === 'clip' ? S.clip.fps : S.kind === 'frames' ? 8 : 3);
  shT += dt * sp;
  if (shT < hold) return;
  shT = 0;
  if (mode === 'once') {
    if (shStep >= S.n - 1) { shPlay = false; syncSheetPlay(); return; }
    shStep++;
  } else if (mode === 'pingpong') {
    S.dir = S.dir ?? 1;
    if (shStep + S.dir < 0 || shStep + S.dir >= S.n) S.dir = -S.dir;
    shStep += S.dir;
  } else shStep = (shStep + 1) % S.n;
  showSheetStep();
}

function sheetReadout() {
  const S = curSheet;
  if (!S) return ['(loading)'];
  const mode = $('sh-mode').value;
  const src = S.kind === 'set' ? DOOR_MATS[shStep]?.name : S.kind === 'frames' || S.kind === 'single' ? `frame ${shStep + 1}` : `slot ${shStep + 1} = img ${S.order[shStep] + 1}${S.fix?.flip.includes(shStep) ? ' (mirrored)' : ''}`;
  return [
    `${S.id}  [${S.kind}]`,
    S.rows ? `${S.kind === 'clip' ? 'facing' : 'row'} ${S.rows[S.row]}` : '',
    `${src}   ${S.n} in all`,
    `${mode}${shPlay ? '' : ' (paused)'}  ×${(2 ** Number($('sh-speed').value)).toFixed(2)}`,
    S.kind === 'set' ? `${(draft.off['housing/doormats'] ?? []).length} of ${DOOR_MATS.length} switched off` : '',
  ];
}

/* ------------------------------------------------------------------ save */

async function save() {
  const c = changes();
  const n = countOf(c);
  if (!n) { status('Nothing has changed since the last save.'); return; }
  try {
    const r = await fetch('/__spritefix', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft),
    });
    if (!r.ok) throw new Error(await r.text());
    saved = shape(clone(draft));
    drawChrome();
    status(`Saved ${n} change${n === 1 ? '' : 's'} (poses ${c.poses.length}, sheets ${c.sheets.length}, in-game ${c.off.length}) to src/spritefix.json - the game reloads with them.`);
  } catch (err) {
    status(`NOT SAVED: there is no save endpoint here. It exists only under npm run dev (${err.message || err}).`, true);
  }
}

/* ------------------------------------------------------------------ boot */

status('Loading the drawings…');
await loadArt();
await loadSheetList();
wire();
rebuild();
$('cells').hidden = true;
drawChrome();
if (ui.tab === 'sheets') setTab(true);
$('tab-poses').addEventListener('click', () => { ui.tab = 'poses'; keepUi(); });
$('tab-sheets').addEventListener('click', () => { ui.tab = 'sheets'; keepUi(); });
fetch('/__spritefix').then((r) => {
  status(r.ok ? 'Ready. Nothing changes in the game until you save.' : 'This is not the dev server - you can look, but Save has nowhere to write.', !r.ok);
}).catch(() => status('This is not the dev server - you can look, but Save has nowhere to write.', true));
requestAnimationFrame(render);
/* For a console, and for a check driven from outside: one synchronous frame (a hidden tab draws none). */
window.spriteEditor = {
  A, B, draft, hist, changes, undo, redo, get sheet() { return curSheet; },
  frame() { placeCamera(); tick(0); drawGuides(); renderer.render(scene, cam); return $('readout').textContent; },
};
