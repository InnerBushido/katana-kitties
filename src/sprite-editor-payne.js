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
 */
import { INTRO_CLIPS, INTRO_TAKES, INTRO_FPS, clipFrames, clipRun, pagePath, blitCell } from './systems/payneclips.js';
import { INTRO_GEO, INTRO_STAGE } from './systems/payneframes.js';
import { PAYNE_INTRO, INTRO_CUTS, actFrame } from './systems/payneintro.js';
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
    ({ clip: name, cell, held } = actFrame(r.act, play.t));
    const w = wordAt(r, play.t);
    line = `line ${PAYNE_INTRO.indexOf(r) + 1}  +${play.t.toFixed(2)}s${w ? `  "${w}"` : ''}`;
  }
  const from = drawCell(name, cell, box);
  shown = { name, cell, held: +held.toFixed(3), from };
  label(`${name}  cell ${cell}/${clipFrames(draft[name]).length - 1}${held > 0 ? '  (held)' : ''}  ${from === 'take' ? '· NOT CUT: off the take' : from === 'loading' ? '· loading…' : ''}`, box.x + 8, box.y + 20, from === 'take' ? '#ffb347' : '#fff6de');
  if (line) label(line, box.x + 8, box.y + 42);
  drawStrip(C, top, W);
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
  $('pn-save').disabled = !d.length;
  $('pn-save').textContent = d.length ? `Save ${d.length} clip change${d.length === 1 ? '' : 's'} to src/payneclips.json` : 'Nothing to save';
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
    used.length ? `used by line ${used.join(', ')} (src/systems/payneintro.js)` : 'no line uses it yet: name it in a line\'s act list in src/systems/payneintro.js',
    st === 'cut' ? 'its pages are cut' : st === 'stale' ? 'its pages are of OLD frames: cut it again' : 'not cut yet: the preview is off the take',
  ].join(' · ');
  $('pn-what').value = play.what;
}

function render() { renderList(); renderClip(); }

function pick(n) {
  if (!draft[n]) return;
  sel = n; ui.sel = n; keep();
  head = draft[n].from;
  play.t = 0;
  render();
  for (const f of clipFrames(draft[n])) grab(draft[n].take, f, Math.round(Math.min(720, ($('payne-stage').clientHeight - STRIP_H) * 1.5)));
}

function edit(patch) {
  const C = draft[sel];
  Object.assign(C, patch);
  if (!C.back) { delete C.back; delete C.apex; }
  play.t = 0;
  render();
}

/** Every line the clip changes play under, said before it is done. */
function refuseUsed(n, doing) {
  const used = usedBy(n);
  if (!used.length) return false;
  status(`Can't ${doing} "${n}": line ${used.join(', ')} plays it. Take it out of the act list in src/systems/payneintro.js first, or make a new clip and use that.`, true);
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
  $('pn-what').onchange = () => { play.what = $('pn-what').value; play.t = 0; stopAudio(); if (play.on) startAudio(); };
  $('pn-play').onclick = togglePlay;
  $('pn-save').onclick = saveClips;
  $('pn-cut').onclick = cutPages;
  cv.addEventListener('pointerdown', (e) => {
    const r = cv.getBoundingClientRect();
    const y = e.clientY - r.top;
    if (y < r.height - STRIP_H) return;
    const n = takeLen(draft[sel].take);
    const i = Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left) / r.width * n)));
    if (e.shiftKey) edit({ from: i, to: Math.max(i, draft[sel].to) });
    else if (e.ctrlKey || e.metaKey) edit({ to: i, from: Math.min(i, draft[sel].from) });
    head = i;
  });
  addEventListener('keydown', onKey);
  addEventListener('resize', draw);
}

function onKey(e) {
  if (!on) return;
  const typing = e.target.matches?.('input[type=text], input[type=number], select');
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveClips(); return; }
  if (typing) { if (e.key === 'Escape') e.target.blur(); return; }
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
  if (!d.length) { status('Nothing has changed since the last save.'); return; }
  try {
    const r = await fetch('/__payne/clips', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    saved = clone(draft);
    const msg = `Saved ${d.join(', ')} to src/payneclips.json.${Object.keys(draft).some((n) => cutState(n) !== 'cut') ? ' Cut their pages next, or the game draws her still.' : ''}`;
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
export const payneDirty = () => dirtyNames().length;

/** For a console or a check: draw `what` ('clip' or 'line:N') at `t` seconds, synchronously, and say
 *  what was drawn — a hidden tab draws no frames of its own. */
export function payneAt(what, t) {
  play.what = what; play.t = t;
  draw();
  return shown;
}

wire();
const q = new URLSearchParams(location.search).get('payne');
if (q && draft[q]) { sel = q; ui.sel = q; keep(); }
try { const f = sessionStorage.getItem(FLASH); if (f) { status(f); sessionStorage.removeItem(FLASH); } } catch { /* */ }
requestAnimationFrame(tick);

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
