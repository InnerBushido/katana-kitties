/**
 * The sprite editor's PAYNE tab — /sprites.html, dev only, never built.
 *
 * Richard, Oct 2026: "in the Sprite Editor, can we include all the Payne
 * animated sprites in there so I can review them and see all of them? It'd be
 * good if I could also section off and create my own sprite animations clips
 * in the Sprite Editor that I can save and can reference, by name or
 * what-not, so that it can be used in the cutscene editor ... There should be
 * parity between the sprite editor and the cutscene editor".
 *
 * PARITY IS BY CONSTRUCTION, NOT BY COPY:
 *  · the clips ARE src/payneclips.json, the table the game imports. The draft
 *    here is that same object, edited in place, so `actFrame` — the game's
 *    own function, imported, not re-written — plays a LINE with the draft in
 *    force. A clip changed here is the clip line 3 plays, before it is saved.
 *  · a clip's timing is `clipRun`, the game's; a cut cell is drawn by
 *    `blitCell`, the game's.
 *  · the names are the names the scene's act lists use, and the review page
 *    shows the same names under its timeline, linked back here.
 *
 * A CLIP IS FRAMES OF A TAKE: `take`, `from`..`to` by `step` (24fps frame
 * numbers of docs/art-masters/video/payne_<take>_*.mp4), optionally there and
 * `back`. The pages the game draws are cut from those frames by
 * tools/capture/payne-sheet.mjs; until a clip is cut this tab previews it off
 * the take itself, keyed here roughly, and says so.
 *
 * A CLIP A LINE USES CANNOT BE DELETED OR RENAMED HERE — the line would name
 * nothing. The refusal says which line (non-negotiable 6).
 *
 * A LINE'S CUES ARE EDITED HERE TOO. Richard, Oct 2026: "Is there a way to
 * modify the lines in the Sprite Editor to add or delete clips? ... I lack the
 * ability to delete clips from it." Preview a line and its cues are listed
 * under it, and drawn on a track over its words: add one at the playhead,
 * change its clip, drag it along the track (Shift snaps to a word), or take it
 * out. Taking a clip out of every line that uses it is what then lets the clip
 * itself be deleted. A cue's own `from`/`to` are FRAMES OF THE TAKE, like the
 * clip's (clipRun says why they stopped being cells), and ⇄ between them plays
 * it backwards — which is the only way a clip runs in reverse. Saved lines go to src/payneacts.json, OVERRIDES ONLY
 * (systems/payneacts.js says why): a line put back to the code's cues leaves
 * the file.
 */
import { INTRO_CLIPS, INTRO_TAKES, INTRO_FPS, clipFrames, clipRun, pagePath, blitCell } from './systems/payneclips.js';
import { INTRO_GEO, INTRO_STAGE } from './systems/payneframes.js';
import { PAYNE_INTRO, PAYNE_INTRO_CODE, INTRO_CUTS, actFrame } from './systems/payneintro.js';
import { voicePath } from './core/audio.js';

const $ = (id) => document.getElementById(id);
const TAKE_FPS = 24;
const UI_KEY = 'kk-payne-ui';
const FLASH = 'kk-payne-flash';

const clone = (o) => JSON.parse(JSON.stringify(o));
const sig = (c) => `${c.take}/${c.from}/${c.to}/${c.step}`;
let saved = clone(INTRO_CLIPS);
const draft = INTRO_CLIPS;            // the game's own table, edited in place (see the header)
let ui = {};
try { ui = JSON.parse(localStorage.getItem(UI_KEY) || '{}'); } catch { /* private window */ }
const keep = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch { /* */ } };

let on = false;
let sel = ui.sel && draft[ui.sel] ? ui.sel : Object.keys(draft)[0];
let head = 0;                         // the take frame under the playhead
let play = { on: false, t: 0, what: 'clip' };
let audio = null;

/* ------------------------------------------------------------ who uses what */

/** Which lines name a clip: `[3, 4]`. */
const usedBy = (name) => PAYNE_INTRO.map((r, i) => (r.act.some(([c]) => c === name) ? i + 1 : 0)).filter(Boolean);

/* ------------------------------------------------------------ the lines' cues */

/* EDITED IN PLACE, LIKE THE CLIPS: `PAYNE_INTRO` is the game's script with
   src/payneacts.json in force, in rows of its own (payneacts.js), so
   `actFrame` plays the draft, and `usedBy` sees a clip leave a line the
   moment its cue is taken out. `PAYNE_INTRO_CODE` is never written on: it is
   what "back to the code's cues" goes back to, and what decides which lines
   the file has to hold. */
const lineKey = (r) => JSON.stringify({ act: r.act, hold: r.hold ?? 0 });
const CODE = Object.fromEntries(PAYNE_INTRO_CODE.map((r) => [r.voice, lineKey(r)]));
const snapLines = () => Object.fromEntries(PAYNE_INTRO.map((r) => [r.voice, lineKey(r)]));
let savedLines = snapLines();
const dirtyLines = () => PAYNE_INTRO.filter((r) => lineKey(r) !== savedLines[r.voice]).map((r) => PAYNE_INTRO.indexOf(r) + 1);
const isOverride = (r) => lineKey(r) !== CODE[r.voice];
/** What src/payneacts.json holds: every line that is not the code's, whole. */
const overrides = () => Object.fromEntries(PAYNE_INTRO.filter(isOverride).map((r) => [r.voice, { act: r.act, hold: r.hold ?? 0 }]));
const lineNo = () => (play.what.startsWith('line:') ? Number(play.what.slice(5)) : 0);
const curLine = () => PAYNE_INTRO[lineNo() - 1] ?? null;
let selCue = -1;

/** A cue as payneintro.js writes one: trailing empties dropped, so an untouched cue compares equal. */
function norm(e) {
  const o = [...e];
  while (o.length > 2 && o.at(-1) == null) o.pop();
  return o;
}
/** `t`, or the next hundredth no other cue of the line starts on (two at one moment would hide one). */
function freeAt(r, t, self) {
  let at = Math.round(t * 100) / 100;
  while (r.act.some((x) => x !== self && x[1] === at)) at = Math.round((at + 0.01) * 100) / 100;
  return at;
}
function sortCues(r, keep = r.act[selCue]) {
  r.act.sort((a, b) => a[1] - b[1]);
  selCue = keep ? r.act.indexOf(keep) : -1;
}
function editCue(i, patch) {
  const r = curLine();
  const e = r?.act[i];
  if (!e) return;
  const [clip, at, from = null, to = null, rate = null] = e;
  const v = { clip, at, from, to, rate, ...patch };
  // another clip's frames mean nothing on this one
  if (patch.clip && patch.clip !== clip) { v.from = null; v.to = null; }
  const n = norm([v.clip, v.at, v.from, v.to, v.rate]);
  n[1] = freeAt(r, n[1], e);
  r.act[i] = n;
  sortCues(r, n);
  render();
}
function addCue() {
  const r = curLine();
  if (!r) return;
  const e = [sel, freeAt(r, play.t)];
  r.act.push(e);
  sortCues(r, e);
  render();
  const w = wordAt(r, e[1] + 0.001);
  status(`Added ${sel} at ${e[1].toFixed(2)}s on line ${lineNo()}${w ? `, on "${w}"` : ''}. Save to keep it.`);
}
function delCue(i) {
  const r = curLine();
  if (!r?.act[i]) return;
  if (r.act.length === 1) { status(`Line ${lineNo()} has one cue left, and she has to be doing something: change its clip instead, or add another first.`, true); return; }
  const [gone] = r.act.splice(i, 1);
  selCue = Math.min(i, r.act.length - 1);
  render();
  status(`Took ${gone[0]} at ${gone[1]}s out of line ${lineNo()}.${usedBy(gone[0]).length ? '' : ` No line uses "${gone[0]}" now.`} Save to keep it; "revert line" puts it back.`);
}
/** Put a line's cues back to `key` (a lineKey), refusing if they name a clip that has since gone. */
function restoreLine(r, key, what) {
  const s = JSON.parse(key);
  const gone = s.act.map(([c]) => c).filter((c) => !draft[c]);
  if (gone.length) { status(`Can't go back to ${what}: it plays ${[...new Set(gone)].join(', ')}, which ${gone.length === 1 ? 'is' : 'are'} not a clip any more.`, true); return; }
  r.act = s.act;
  r.hold = s.hold;
  selCue = -1;
  render();
  status(`Line ${PAYNE_INTRO.indexOf(r) + 1} is back to ${what}.`);
}
function seek(t) {
  play.t = t;
  if (audio) audio.currentTime = Math.max(0, t);
}

/** cut (its pages are of this definition), stale (cut, but from other frames), or new. */
function cutState(name) {
  const G = INTRO_GEO[name];
  if (!G) return 'new';
  if (G.src) return G.src === sig(draft[name]) ? 'cut' : 'stale';
  return G.n === clipFrames(draft[name]).length ? 'cut' : 'stale';   // cut before rows carried `src`
}

/* ------------------------------------------------------------ take frames */

/* ONE <video> PER TAKE, SEEKED ONE FRAME AT A TIME. Frames come off it into
   small canvases, keyed on the way (a rough cut of payne-sheet's key: the
   proper one is what the pages get). Seeks are queued: a <video> answers one
   seek at a time and drops the rest. */
const vids = {};
const frames = new Map();             // `${take}:${n}:${h}` -> canvas
let queue = Promise.resolve();

function vidOf(take) {
  if (vids[take]) return vids[take];
  const v = document.createElement('video');
  v.muted = true; v.preload = 'auto'; v.playsInline = true;
  v.src = `/__payne/take?p=${encodeURIComponent(INTRO_TAKES[take])}`;
  vids[take] = { v, ready: new Promise((res) => { v.onloadeddata = res; v.onerror = res; }) };
  return vids[take];
}

const takeLen = (take) => Math.round((vids[take]?.v.duration || 5.04) * TAKE_FPS);

function keyMagenta(g, w, h) {
  const im = g.getImageData(0, 0, w, h);
  const d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const m = Math.min(d[i], d[i + 2]) - d[i + 1] - 3 * Math.max(0, d[i + 2] - d[i] - 12);
    if (m >= 175) d[i + 3] = 0;
    else if (m > 20) d[i + 3] = Math.round(255 * (175 - m) / 155);
  }
  g.putImageData(im, 0, 0);
}

/** Frame `n` of a take, `h` px tall, keyed. Resolves to a canvas; cached. */
const pending = new Map();            // a frame asked for again while it is queued is the same promise, not a second seek
function grab(take, n, h) {
  const k = `${take}:${n}:${h}`;
  if (frames.has(k)) return Promise.resolve(frames.get(k));
  if (pending.has(k)) return pending.get(k);
  const p = queue.then(async () => {
    if (frames.has(k)) return frames.get(k);
    const { v, ready } = vidOf(take);
    await ready;
    if (!v.videoWidth) return null;
    await new Promise((res) => { v.onseeked = res; v.currentTime = (n + 0.5) / TAKE_FPS; });
    const w = Math.round(v.videoWidth * h / v.videoHeight);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(v, 0, 0, w, h);
    keyMagenta(g, w, h);
    frames.set(k, c);
    return c;
  }).finally(() => pending.delete(k));
  pending.set(k, p);
  queue = p.catch(() => null);
  return p;
}
const ready = (take, n, h) => frames.get(`${take}:${n}:${h}`) ?? (grab(take, n, h), null);

/* ------------------------------------------------------------ cut pages */

const pages = new Map();              // clip -> [Image]
function pagesOf(name) {
  if (!pages.has(name)) {
    const G = INTRO_GEO[name];
    pages.set(name, Array.from({ length: G?.pages ?? 0 }, (_, k) => {
      const img = new Image();
      img.src = `${pagePath(name, k)}?v=${G.src ?? G.n}`;   // a re-cut is a new URL
      return img;
    }));
  }
  return pages.get(name);
}

/* ------------------------------------------------------------ drawing */

const cv = $('payne-stage');
const g = cv.getContext('2d');
const STRIP_H = 104;

/** Draw one cell of a clip into a box, standing on its feet: off its page when
 *  cut, off the take when not. Returns what it drew from. */
function drawCell(name, cell, box) {
  const C = draft[name];
  const G = INTRO_GEO[name];
  const S = INTRO_STAGE;
  // her units into this box: the whole stage fits, feet on the box's floor
  const px = Math.min(box.w / (S.x1 - S.x0), (box.h - 18) / (S.y1 - S.y0));
  const fx = box.x + box.w / 2, fy = box.y + box.h - 10;
  g.strokeStyle = 'rgba(255,255,255,.25)';
  g.beginPath(); g.moveTo(box.x + 8, fy); g.lineTo(box.x + box.w - 8, fy); g.stroke();
  if (cutState(name) === 'cut') {
    const page = pagesOf(name)[Math.floor(cell / G.perPage)];
    if (page?.complete && page.naturalWidth) {
      blitCell(g, page, G, cell, [fx + G.x0 * px, fy - G.y1 * px, (G.x1 - G.x0) * px, (G.y1 - G.y0) * px]);
      return 'pages';
    }
    return 'loading';
  }
  // NOT CUT: the take's frame, scaled so a standing pose is about one unit
  const n = clipFrames(C)[cell];
  const h = Math.round(Math.min(720, box.h * 1.5));
  const f = n == null ? null : ready(C.take, n, h);
  if (f) {
    const s = px * 1.3 / h;            // a take frame is ~1.3 of her heights tall (she is 60% of it)
    g.drawImage(f, fx - f.width * s / 2, fy - f.height * s * 0.95, f.width * s, f.height * s);
    return 'take';
  }
  return 'loading';
}

function layout() {
  const r = cv.getBoundingClientRect();
  const dpr = devicePixelRatio || 1;
  if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) {
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { W: r.width, H: r.height };
}

function label(text, x, y, color = '#fff6de') {
  g.font = '12px ui-monospace, Consolas, monospace';
  const w = g.measureText(text).width;
  g.fillStyle = 'rgba(20,16,26,.75)'; g.fillRect(x - 4, y - 13, w + 8, 18);
  g.fillStyle = color; g.fillText(text, x, y);
}

let shown = null;                     // what the right-hand side last drew, for `window.spriteEditor.payne`
function draw() {
  if (!on) return;
  const { W, H } = layout();
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#2a2230'; g.fillRect(0, 0, W, H);
  const C = draft[sel];
  if (!C) return;
  const top = H - STRIP_H;
  const half = W / 2;
  // LEFT: the take at the playhead, raw (keyed), with its frame number
  const fh = Math.round(Math.min(720, top - 30));
  const f = ready(C.take, head, fh);
  if (f) {
    const s = Math.min((half - 20) / f.width, (top - 30) / f.height);
    g.fillStyle = '#3a3040'; g.fillRect(10, 10, half - 20, top - 20);
    g.drawImage(f, 10 + (half - 20 - f.width * s) / 2, 20, f.width * s, f.height * s);
  }
  const inClip = head >= C.from && head <= C.to;
  const picked = inClip && (head - C.from) % C.step === 0;
  label(`${C.take}  frame ${head}  ${(head / TAKE_FPS).toFixed(2)}s${inClip ? `  · in ${sel}${picked ? `, cell ${(head - C.from) / C.step}` : ''}` : ''}`, 18, 30);
  // RIGHT: what plays, the game's way
  const box = { x: half + 10, y: 10, w: half - 20, h: top - 20 };
  g.fillStyle = '#332a3a'; g.fillRect(box.x, box.y, box.w, box.h);
  let line = '';
  let name = sel, cell, held = 0;
  if (play.what === 'clip') {
    ({ cell, held } = clipRun(C, play.t));
  } else {
    const r = PAYNE_INTRO[Number(play.what.slice(5)) - 1];
    let entry;
    ({ clip: name, cell, held, entry } = actFrame(r.act, play.t));
    const w = wordAt(r, play.t);
    line = `line ${PAYNE_INTRO.indexOf(r) + 1}  +${play.t.toFixed(2)}s${w ? `  "${w}"` : ''}`;
    drawTrack(r, box);
    box.h -= TRACK_H + 12;              // she stands above the track, not behind it
    document.querySelectorAll('#pn-cues .pn-cue').forEach((el, i) => el.classList.toggle('now', i === entry));
  }
  if (!lineNo()) trackR = null;
  const from = drawCell(name, cell, box);
  shown = { name, cell, held: +held.toFixed(3), from };
  label(`${name}  cell ${cell}/${clipFrames(draft[name]).length - 1}${held > 0 ? '  (held)' : ''}  ${from === 'take' ? '· NOT CUT: off the take' : from === 'loading' ? '· loading…' : ''}`, box.x + 8, box.y + 20, from === 'take' ? '#ffb347' : '#fff6de');
  if (line) label(line, box.x + 8, box.y + 42);
  drawStrip(C, top, W);
}

/* THE LINE'S TRACK, under her when a line is previewed: its words along the
   top, each cue a block from where it starts to where the next one does, the
   half second after the voice (and the line's hold) shaded. A cue's left edge
   drags; a click anywhere else puts the playhead there. */
const TRACK_H = 54;
let trackR = null;                    // where the track was last drawn, in CSS px, for the pointer
let drag = null;
const trackX = (t) => trackR.x + (t - trackR.t0) / (trackR.t1 - trackR.t0) * trackR.w;
const trackT = (x) => trackR.t0 + (x - trackR.x) / trackR.w * (trackR.t1 - trackR.t0);
const hue = (s, a) => { let k = 0; for (const ch of s) k = (k * 31 + ch.charCodeAt(0)) % 360; return `hsla(${k},60%,62%,${a})`; };
function drawTrack(r, box) {
  const end = lineLen(PAYNE_INTRO.indexOf(r) + 1);
  const voice = INTRO_CUTS[r.shot].len;
  trackR = { x: box.x + 8, y: box.y + box.h - TRACK_H - 6, w: box.w - 16, h: TRACK_H, t0: Math.min(0, ...r.act.map((e) => e[1])) - 0.1, t1: end + 0.1 };
  const { x, y, w, h } = trackR;
  g.fillStyle = 'rgba(20,16,26,.85)'; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(trackX(voice), y, trackX(end) - trackX(voice), h);
  g.font = '10px ui-monospace, Consolas, monospace';
  let lastX = -1e9;
  for (const [s, a] of WORDS?.[r.voice]?.words ?? []) {
    const X = trackX(a);
    g.fillStyle = 'rgba(255,246,222,.35)'; g.fillRect(X, y, 1, 13);
    if (X - lastX > g.measureText(s).width + 4) { g.fillStyle = '#c9b8a0'; g.fillText(s, X + 2, y + 10); lastX = X + g.measureText(s).width; }
  }
  r.act.forEach((e, i) => {
    const X = trackX(e[1]);
    const X2 = trackX(r.act[i + 1]?.[1] ?? end);
    g.fillStyle = hue(e[0], i === selCue ? 0.95 : 0.6); g.fillRect(X, y + 16, Math.max(2, X2 - X - 1), h - 20);
    g.fillStyle = i === selCue ? '#fff' : 'rgba(255,255,255,.7)'; g.fillRect(X - 1, y + 13, 3, h - 13);
    g.save(); g.beginPath(); g.rect(X + 3, y + 16, Math.max(0, X2 - X - 5), h - 20); g.clip();
    g.fillStyle = '#16121a'; g.font = '11px ui-monospace, Consolas, monospace'; g.fillText(e[0], X + 5, y + 33);
    g.restore();
  });
  g.fillStyle = '#ff5d5d'; g.fillRect(trackX(play.t) - 1, y, 2, h);
}

/* THE STRIP: every frame of the take, the clip's span lit, the frames it picks
   ticked. Click puts the playhead there; Shift-click sets `from`, Ctrl-click `to`. */
function drawStrip(C, top, W) {
  const n = takeLen(C.take);
  const th = STRIP_H - 26;
  // a thumbnail every `stride` frames, at its own aspect: 121 squeezed into a row would be 9px slivers
  const tw = th * 0.5625;
  const stride = Math.max(1, Math.ceil(tw / (W / n)));
  g.fillStyle = '#1d1720'; g.fillRect(0, top, W, STRIP_H);
  for (let i = 0; i < n; i += stride) {
    const f = ready(C.take, i, 96);
    if (f) g.drawImage(f, i * W / n, top + 4, th * f.width / f.height, th);
  }
  for (let i = 0; i < n; i++) {
    const x = i * W / n;
    if (i >= C.from && i <= C.to) {
      g.fillStyle = (i - C.from) % C.step === 0 ? 'rgba(217,72,43,.85)' : 'rgba(217,72,43,.25)';
      g.fillRect(x, top + th + 6, Math.max(1, W / n - 0.5), 8);
    }
  }
  g.fillStyle = '#ff5d5d'; g.fillRect(head * W / n + W / n / 2 - 1, top, 2, STRIP_H);
  g.fillStyle = '#c9b8a0'; g.font = '11px ui-monospace, monospace';
  g.fillText(`${C.take}: ${n} frames · ${C.from}–${C.to} every ${C.step} = ${clipFrames(C).length} cells, ${(clipFrames(C).length / INTRO_FPS).toFixed(2)}s at ${INTRO_FPS}fps${C.back ? ' and back' : ''}`, 6, top + STRIP_H - 4);
}

function wordAt(r, t) {
  /* the words are measured (src/voicewords.json, read by the review page);
     here only for the readout, so a missing file costs a label, nothing more */
  const ws = WORDS?.[r.voice]?.words ?? [];
  let w = null;
  for (const [s, a] of ws) if (t >= a) w = s;
  return w;
}
let WORDS = null;
import('./voicewords.json').then((m) => { WORDS = m.default; }).catch(() => {});

/* ------------------------------------------------------------ the panel */

function status(t, warn = false) { $('pn-status').textContent = t; $('pn-status').classList.toggle('warn', warn); }

function dirtyNames() {
  const names = new Set([...Object.keys(draft), ...Object.keys(saved)]);
  return [...names].filter((n) => JSON.stringify(draft[n] ?? null) !== JSON.stringify(saved[n] ?? null));
}

function renderList() {
  const dirty = new Set(dirtyNames());
  $('pn-count').textContent = `${Object.keys(draft).length} clips`;
  $('pn-list').innerHTML = Object.entries(draft).map(([n, c]) => {
    const st = cutState(n);
    const used = usedBy(n);
    return `<div class="pn-row ${n === sel ? 'on' : ''}" data-n="${n}" title="${esc(c.note)}">
      <b>${n}</b>${dirty.has(n) ? ' <span class="badge">•</span>' : ''}
      <span class="tiny">${c.take} ${c.from}–${c.to}/${c.step}${c.back ? ' ⇄' : ''}</span>
      <span class="pn-st ${st}">${st === 'cut' ? '✓ cut' : st === 'stale' ? '✂ re-cut' : '✂ not cut'}</span>
      <span class="tiny">${used.length ? `line ${used.join(', ')}` : 'unused'}</span></div>`;
  }).join('');
  const toCut = Object.keys(draft).filter((n) => cutState(n) !== 'cut');
  $('pn-cut').disabled = !toCut.length;
  $('pn-cut').textContent = toCut.length ? `✂ Cut pages for ${toCut.join(', ')}` : '✂ Every clip is cut';
  const d = dirtyNames();
  const L = dirtyLines();
  $('pn-save').disabled = !d.length && !L.length;
  $('pn-save').textContent = !d.length && !L.length ? 'Nothing to save'
    : `Save ${[d.length && `${d.length} clip${d.length === 1 ? '' : 's'}`, L.length && `line ${L.join(', ')}`].filter(Boolean).join(' and ')}`;
  $('pn-save').title = 'Clips to src/payneclips.json, lines to src/payneacts.json';
}

function renderLine() {
  const r = curLine();
  $('pn-line').hidden = !r;
  if (!r) return;
  const n = lineNo();
  $('pn-line-n').textContent = n;
  const dirty = dirtyLines().includes(n);
  $('pn-line-src').textContent = `${isOverride(r) ? 'edited here (src/payneacts.json)' : 'the code\'s cues (payneintro.js)'}${dirty ? ' · unsaved' : ''}`;
  $('pn-cue-add').textContent = `＋ ${sel} at the playhead`;
  const end = lineLen(n);
  const names = Object.keys(draft);
  $('pn-cues').innerHTML = r.act.map(([c, at, from, to, rate], i) => {
    const w = wordAt(r, at + 0.001);
    const C = draft[c];
    // a frame the clip's trim has cut off still plays, held at the clip's end; say so
    const fr = (k, v, dflt) => {
      const out = C && v != null && (v < C.from || v > C.to);
      return `<input data-k="${k}" type="number" min="0" placeholder="${dflt ?? ''}" value="${v ?? ''}"${out ? ` class="out" title="outside ${c}'s frames ${C.from}–${C.to}: held at its end"` : ` title="a frame of the ${C?.take ?? ''} take; blank is the clip's own ${k === 'from' ? 'first' : 'last'}"`}>`;
    };
    const where = at >= end ? '<b class="warn">after the line ends</b>' : w ? `on “${esc(w)}”` : 'before the first word';
    return `<div class="pn-cue ${i === selCue ? 'sel' : ''}" data-i="${i}" style="border-left-color:${hue(c, 1)}">
      <div class="row"><select data-k="clip">${names.map((x) => `<option value="${x}"${x === c ? ' selected' : ''}>${x}</option>`).join('')}${draft[c] ? '' : `<option value="${esc(c)}" selected>${esc(c)} (gone)</option>`}</select><input data-k="at" type="number" step="0.01" value="${at}" title="seconds into the line's voice"><span class="tiny">s</span><button data-do="here" title="move this cue to the playhead">⌖</button><button data-do="seek" title="put the playhead on this cue">▶</button><button data-do="del" title="take this cue out of the line (Delete)">✕</button></div>
      <div class="tiny">${where} · frames ${fr('from', from, C?.from)}<button data-do="rev" title="play it backwards (swap the two frames)">⇄</button>${fr('to', to, C?.to)} ×<input data-k="rate" type="number" step="0.05" min="0.05" max="4" placeholder="1" value="${rate ?? ''}" title="speed: 1 is as cut, 1.7 is 70% faster"></div>
    </div>`;
  }).join('');
  if (document.activeElement !== $('pn-hold')) $('pn-hold').value = r.hold ?? 0;
}

function renderClip() {
  const C = draft[sel];
  if (!C) return;
  const set = (id, v) => { if (document.activeElement !== $(id)) $(id).value = v; };
  set('pn-name', sel);
  set('pn-take', C.take);
  set('pn-from', C.from);
  set('pn-to', C.to);
  set('pn-step', C.step);
  $('pn-back').checked = !!C.back;
  set('pn-apex', C.apex ?? 0);
  $('pn-apex').disabled = !C.back;
  set('pn-note', C.note ?? '');
  const used = usedBy(sel);
  const st = cutState(sel);
  $('pn-info').textContent = [
    `${clipFrames(C).length} cells, ${(clipFrames(C).length / INTRO_FPS).toFixed(2)}s${C.back ? ` out, ${C.apex ?? 0}s held, and back` : ''}`,
    used.length ? `used by line ${used.join(', ')}` : 'no line uses it yet: preview a line and ＋ it in at the playhead',
    st === 'cut' ? 'its pages are cut' : st === 'stale' ? 'its pages are of OLD frames: cut it again' : 'not cut yet: the preview is off the take',
  ].join(' · ');
  $('pn-what').value = play.what;
}

function render() { renderList(); renderClip(); renderLine(); }

function pick(n, keepT = false) {
  if (!draft[n]) return;
  sel = n; ui.sel = n; keep();
  head = draft[n].from;
  if (!keepT) play.t = 0;
  render();
  for (const f of clipFrames(draft[n])) grab(draft[n].take, f, Math.round(Math.min(720, ($('payne-stage').clientHeight - STRIP_H) * 1.5)));
}

function edit(patch) {
  const C = draft[sel];
  Object.assign(C, patch);
  if (!C.back) { delete C.back; delete C.apex; }
  if (!lineNo()) play.t = 0;            // a line being watched keeps its place while its clip is changed
  render();
}

/** Every line the clip changes play under, said before it is done. */
function refuseUsed(n, doing) {
  const used = usedBy(n);
  if (!used.length) return false;
  status(`Can't ${doing} "${n}": line ${used.join(', ')} plays it. Preview ${used.length === 1 ? 'that line' : 'each of those lines'} and take its ${n} cue out (✕) first, or make a new clip and use that.`, true);
  return true;
}

function freeName(base) {
  let n = base, k = 2;
  while (draft[n]) n = `${base}${k++}`;
  return n;
}

function wire() {
  $('pn-take').innerHTML = Object.keys(INTRO_TAKES).map((t) => `<option>${t}</option>`).join('');
  $('pn-what').innerHTML = '<option value="clip">this clip, on its own</option>' +
    PAYNE_INTRO.map((r, i) => `<option value="line:${i + 1}">line ${i + 1}: ${esc(r.text.slice(0, 38))}…</option>`).join('');
  $('pn-list').addEventListener('click', (e) => { const r = e.target.closest('.pn-row'); if (r) pick(r.dataset.n); });
  $('pn-take').onchange = () => edit({ take: $('pn-take').value });
  const num = (id, key, min = 0) => { $(id).onchange = () => { const v = Math.max(min, Math.round(Number($(id).value))); if (Number.isFinite(v)) edit({ [key]: v }); }; };
  num('pn-from', 'from'); num('pn-to', 'to'); num('pn-step', 'step', 1);
  $('pn-back').onchange = () => edit($('pn-back').checked ? { back: true, apex: draft[sel].apex ?? 0.25 } : { back: false });
  $('pn-apex').onchange = () => edit({ apex: Math.max(0, Math.min(5, Number($('pn-apex').value) || 0)) });
  $('pn-note').oninput = () => { draft[sel].note = $('pn-note').value; renderList(); };
  $('pn-name').onchange = () => {
    const to = $('pn-name').value.trim();
    if (to === sel) return;
    if (!/^[a-z][A-Za-z0-9]{0,31}$/.test(to)) { status(`"${to}" is not a clip name: a small letter, then letters or digits, like pointPose.`, true); $('pn-name').value = sel; return; }
    if (draft[to]) { status(`There is already a clip called "${to}".`, true); $('pn-name').value = sel; return; }
    if (refuseUsed(sel, 'rename')) { $('pn-name').value = sel; return; }
    // rebuilt in the same order, so the file's order does not jump about
    const rows = Object.entries(draft);
    for (const k of Object.keys(draft)) delete draft[k];
    for (const [k, v] of rows) draft[k === sel ? to : k] = v;
    sel = to; ui.sel = to; keep();
    render();
  };
  $('pn-set-from').onclick = () => edit({ from: head, to: Math.max(head, draft[sel].to) });
  $('pn-set-to').onclick = () => edit({ to: head, from: Math.min(head, draft[sel].from) });
  $('pn-new').onclick = () => {
    const C = draft[sel];
    const n = freeName(`${C.take}Clip`);
    draft[n] = { take: C.take, from: head, to: Math.min(head + 24, takeLen(C.take) - 1), step: 3, note: '' };
    pick(n);
    status(`Made "${n}" from frame ${head}: set its frames, give it a name, then save.`);
  };
  $('pn-dup').onclick = () => {
    const n = freeName(`${sel}Copy`);
    draft[n] = clone(draft[sel]);
    pick(n);
    status(`"${n}" is a copy of the clip before it: change it without touching what the scene plays.`);
  };
  $('pn-revert').onclick = () => {
    if (!saved[sel]) { status(`"${sel}" has never been saved: delete it instead.`, true); return; }
    draft[sel] = clone(saved[sel]);
    render();
    status(`"${sel}" is back to what src/payneclips.json has.`);
  };
  $('pn-del').onclick = () => {
    if (refuseUsed(sel, 'delete')) return;
    $('pn-del-q').textContent = `Delete "${sel}"?`;
    $('pn-del-ask').hidden = false;
    $('pn-del-no').focus();             // the default answer is no (non-negotiable 7)
  };
  $('pn-del-no').onclick = () => { $('pn-del-ask').hidden = true; };
  $('pn-del-yes').onclick = () => {
    $('pn-del-ask').hidden = true;
    const gone = sel;
    delete draft[gone];
    pick(Object.keys(draft)[0]);
    status(`Deleted "${gone}" from the draft. Save to write it; its pages go at the next cut.`);
  };
  $('pn-what').onchange = () => {
    play.what = $('pn-what').value; play.t = 0; selCue = -1;
    ui.what = play.what; keep();          // a save reloads the page: come back to the same line
    stopAudio(); if (play.on) startAudio();
    render();
  };
  $('pn-cue-add').onclick = addCue;
  $('pn-hold').onchange = () => {
    const r = curLine();
    const v = Number($('pn-hold').value);
    if (!r || !Number.isFinite(v)) return;
    r.hold = Math.max(0, Math.min(10, Math.round(v * 100) / 100));
    render();
  };
  $('pn-line-revert').onclick = () => { const r = curLine(); if (r) restoreLine(r, savedLines[r.voice], 'what was saved'); };
  $('pn-line-code').onclick = () => { const r = curLine(); if (r) restoreLine(r, CODE[r.voice], 'the code\'s cues'); };
  $('pn-cues').addEventListener('change', (e) => {
    const k = e.target.dataset.k;
    const i = Number(e.target.closest('.pn-cue')?.dataset.i);
    if (!k || !Number.isInteger(i)) return;
    const raw = e.target.value.trim();
    if (k === 'clip') return editCue(i, { clip: raw });
    if (k === 'at') {
      const v = Number(raw);
      if (raw === '' || !Number.isFinite(v) || v < -2 || v > 60) { status('A cue\'s time is seconds into the voice, from -2 to 60.', true); return render(); }
      return editCue(i, { at: v });
    }
    if (k === 'rate') {
      const v = Number(raw);
      if (raw !== '' && !(v > 0 && v <= 4)) { status('Speed is above 0 and up to 4 (1 is as cut; blank is 1).', true); return render(); }
      return editCue(i, { rate: raw === '' || v === 1 ? null : v });
    }
    const v = Math.round(Number(raw));
    const C = draft[curLine().act[i][0]];
    const n = C ? takeLen(C.take) : 1000;
    if (raw !== '' && !(v >= 0 && v < n)) { status(`Frames are 0 to ${n - 1} of the ${C?.take} take (blank is the clip's own end).`, true); return render(); }
    editCue(i, { [k]: raw === '' ? null : v });
  });
  $('pn-cues').addEventListener('click', (e) => {
    const row = e.target.closest('.pn-cue');
    if (!row) return;
    const i = Number(row.dataset.i);
    const r = curLine();
    const act = e.target.dataset.do;
    if (act === 'del') return delCue(i);
    if (act === 'rev') {
      const [c, , f, t] = r.act[i];
      const C = draft[c];
      if (!C) { status(`"${c}" is not a clip any more: pick one for this cue first.`, true); return; }
      // into the clip's own frames as it turns round, so a frame the trim cut off is not carried along
      const inside = (x) => Math.max(C.from, Math.min(C.to, x));
      const nf = inside(t ?? C.to), nt = inside(f ?? C.from);
      // forwards over the whole clip is what blank already says
      const whole = nf === C.from && nt === C.to;
      selCue = i;
      status(nt < nf ? `${c} now plays backwards, frame ${nf} to ${nt}.` : `${c} plays forwards again.`);
      return editCue(i, { from: whole ? null : nf, to: whole ? null : nt });
    }
    if (act === 'here') return editCue(i, { at: play.t });
    if (act === 'seek') { selCue = i; seek(r.act[i][1]); return render(); }
    if (e.target.matches('input, select')) { selCue = i; return; }
    // the row itself: select the cue and show its clip above, without losing the line's place
    selCue = i;
    if (draft[r.act[i][0]]) pick(r.act[i][0], true); else render();
  });
  $('pn-play').onclick = togglePlay;
  $('pn-save').onclick = saveClips;
  $('pn-cut').onclick = cutPages;
  cv.addEventListener('pointerdown', (e) => {
    const r = cv.getBoundingClientRect();
    const y = e.clientY - r.top;
    const x = e.clientX - r.left;
    if (trackR && lineNo() && y >= trackR.y - 4 && y <= trackR.y + trackR.h + 4 && x >= trackR.x - 6 && x <= trackR.x + trackR.w + 6) {
      const L = curLine();
      const i = L.act.findIndex((c) => Math.abs(trackX(c[1]) - x) <= 6);
      if (i >= 0) { drag = L.act[i]; selCue = i; cv.setPointerCapture(e.pointerId); render(); }
      else seek(trackT(x));
      return;
    }
    if (y < r.height - STRIP_H) return;
    const n = takeLen(draft[sel].take);
    const i = Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left) / r.width * n)));
    if (e.shiftKey) edit({ from: i, to: Math.max(i, draft[sel].to) });
    else if (e.ctrlKey || e.metaKey) edit({ to: i, from: Math.min(i, draft[sel].from) });
    head = i;
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const L = curLine();
    let t = trackT(e.clientX - cv.getBoundingClientRect().left);
    if (e.shiftKey) {
      // snap to the nearest word's start
      let best = null;
      for (const [, a] of WORDS?.[L.voice]?.words ?? []) if (best == null || Math.abs(a - t) < Math.abs(best - t)) best = a;
      if (best != null) t = best;
    }
    drag[1] = freeAt(L, Math.max(-2, Math.min(60, t)), drag);
    sortCues(L, drag);
    seek(drag[1]);                      // show the frame she starts the cue on
  });
  const drop = () => { if (drag) { drag = null; render(); } };
  cv.addEventListener('pointerup', drop);
  cv.addEventListener('pointercancel', drop);
  addEventListener('keydown', onKey);
  addEventListener('resize', draw);
}

function onKey(e) {
  if (!on) return;
  const typing = e.target.matches?.('input[type=text], input[type=number], select');
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveClips(); return; }
  if (typing) { if (e.key === 'Escape') e.target.blur(); return; }
  if (e.key === 'Delete' && lineNo() && selCue >= 0) { delCue(selCue); return; }
  const n = takeLen(draft[sel].take);
  if (e.key === ' ') { e.preventDefault(); togglePlay(); }
  else if (e.key === ',' || e.key === '.') head = Math.max(0, Math.min(n - 1, head + (e.key === '.' ? 1 : -1) * (e.shiftKey ? draft[sel].step : 1)));
  else if (e.key === '[') $('pn-set-from').click();
  else if (e.key === ']') $('pn-set-to').click();
}

/* ------------------------------------------------------------ playing */

function lineLen(i) {
  const r = PAYNE_INTRO[i - 1];
  return INTRO_CUTS[r.shot].len + 0.5 + (r.hold ?? 0);
}

function startAudio() {
  if (!play.what.startsWith('line:')) return;
  const r = PAYNE_INTRO[Number(play.what.slice(5)) - 1];
  audio = new Audio(voicePath(r.voice));
  audio.playbackRate = Number($('pn-rate').value);
  audio.currentTime = Math.max(0, play.t);
  audio.play().catch(() => {});
}
function stopAudio() { audio?.pause(); audio = null; }

function togglePlay() {
  play.on = !play.on;
  $('pn-play').textContent = play.on ? '❚❚ pause' : '▶ play';
  if (play.on) startAudio(); else stopAudio();
}

let last = performance.now();
function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (on && play.on) {
    const rate = Number($('pn-rate').value);
    // a LINE runs on its voice's clock when there is one, so the mouth cannot drift off the words
    play.t = audio && !audio.paused && play.t >= 0 ? audio.currentTime : play.t + dt * rate;
    const C = draft[sel];
    const end = play.what === 'clip'
      ? (C.back ? 2 * (clipFrames(C).length - 1) / INTRO_FPS + (C.apex ?? 0) : clipFrames(C).length / INTRO_FPS) + 0.6
      : lineLen(Number(play.what.slice(5)));
    if (play.t > end) {
      if ($('pn-loop').checked) { play.t = 0; stopAudio(); startAudio(); } else togglePlay();
    }
  }
  draw();
  requestAnimationFrame(tick);
}

/* ------------------------------------------------------------ saving */

async function saveClips() {
  const d = dirtyNames();
  const L = dirtyLines();
  if (!d.length && !L.length) { status('Nothing has changed since the last save.'); return; }
  try {
    // clips and lines in ONE request: either file written reloads the page (vite.config.js says more)
    const r = await fetch('/__payne/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clips: draft, acts: overrides() }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    saved = clone(draft);
    savedLines = snapLines();
    const msg = `Saved ${[d.length && `${d.join(', ')} to src/payneclips.json`, L.length && `line ${L.join(', ')} to src/payneacts.json`].filter(Boolean).join(', and ')}.${Object.keys(draft).some((n) => cutState(n) !== 'cut') ? ' Cut the new clips\' pages next, or the game draws her still.' : ''}`;
    try { sessionStorage.setItem(FLASH, msg); } catch { /* */ }   // the save reloads the page: say it after
    status(msg);
    render();
  } catch (err) {
    status(`NOT SAVED: ${err.message || err}`, true);
  }
}

async function cutPages() {
  if (dirtyNames().length) { status('Save the clips first: the cut reads src/payneclips.json, not this page.', true); return; }
  const only = Object.keys(draft).filter((n) => cutState(n) !== 'cut');
  if (!only.length) return;
  $('pn-cut').disabled = true;
  status(`Cutting ${only.join(', ')}… about 20-40s a clip. The page reloads when the new pages land.`);
  try { sessionStorage.setItem(FLASH, `Cut ${only.join(', ')}.`); } catch { /* */ }
  try {
    const r = await fetch(`/__payne/cut?only=${encodeURIComponent(only.join(','))}`, { method: 'POST' });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || j.log?.split('\n').slice(-4).join(' '));
    status(`Cut ${only.join(', ')}.`);
  } catch (err) {
    try { sessionStorage.removeItem(FLASH); } catch { /* */ }
    status(`NOT CUT: ${err.message || err}`, true);
    $('pn-cut').disabled = false;
  }
}

/* ------------------------------------------------------------ the tab */

export function showPayne(show) {
  on = show;
  $('payne').hidden = !show;
  cv.hidden = !show;
  if (show) { render(); pick(sel); } else { play.on = false; stopAudio(); $('pn-play').textContent = '▶ play'; }
}

/** Anything unsaved, for the page's own "you are leaving with changes" guard. */
export const payneDirty = () => dirtyNames().length + dirtyLines().length;

/** For a console or a check: draw `what` ('clip' or 'line:N') at `t` seconds, synchronously, and say
 *  what was drawn — a hidden tab draws no frames of its own. */
export function payneAt(what, t) {
  if (what !== play.what) { play.what = what; render(); }
  play.t = t;
  draw();
  return shown;
}
/** The line editor, for a check: the cue list as it is drawn, and its actions. */
export const payneLines = { addCue, delCue, editCue, seek, overrides, dirtyLines, cues: () => curLine()?.act.map((e) => [...e]) ?? null };

wire();
if (/^line:\d+$/.test(ui.what ?? '') && PAYNE_INTRO[Number(ui.what.slice(5)) - 1]) play.what = ui.what;
const q = new URLSearchParams(location.search).get('payne');
if (q && draft[q]) { sel = q; ui.sel = q; keep(); }
try { const f = sessionStorage.getItem(FLASH); if (f) { status(f); sessionStorage.removeItem(FLASH); } } catch { /* */ }
requestAnimationFrame(tick);

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
