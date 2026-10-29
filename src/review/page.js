/* ---------------------------------------------------------------------------
   THE CUTSCENE REVIEW PAGE'S BRAIN (review.html; dev only).

   A recording of a cutscene, synced to the scene's own voice lines
   (sync.js), with the scene's own cuts and cues drawn under it (scenes.js),
   and notes that know where they are: video time, which line and how far
   into it, the word being said, the cut on screen and what the actor was
   doing. They save to docs/reviews/<scene>/<video>.json, one note a line.

   WHY A NOTE CARRIES ALL OF THAT AND NOT JUST A TIME. The recording is fixed
   but the scene is not: a line gets re-recorded, a cut moves. "1:47.2" means
   nothing once line 12 is 1.5s longer; "line 12, on 'Somebody', the blast
   cut" still does. The voice's sha1 is saved with the review, so a later
   session can tell which lines changed under it.
--------------------------------------------------------------------------- */
import { SR, syncLines } from './sync.js';
import { SCENES, lineWords } from './scenes.js';
import WORDS from '../voicewords.json';

const $ = (id) => document.getElementById(id);
const video = $('video');
const tl = $('tl');
const overlay = $('overlay');

/* One frame of the recording. Screen recorders run at a variable rate (the
   first one averaged 27.3fps), so this is a step, not a frame index. */
const FRAME = 1 / 30;
const TAGS = [
  ['camera', '#7fb6ff'], ['acting', '#ff9ad5'], ['timing', '#ffd166'], ['set', '#8be28b'],
  ['audio', '#c6a0ff'], ['text', '#7fe0d8'], ['other', '#c9ced8'],
];
const TAG_COLOR = Object.fromEntries(TAGS);

const S = {
  scene: null,          // the scene definition, or null for "just the video"
  sceneId: 'payne-intro',
  video: null,          // { name, p, size, duration }
  rec: null,            // { pcm, peaks } the recording's soundtrack
  voices: {},           // id -> sha1 of the mp3 the page synced against
  anchors: [],          // per line: { id, t, score, found, placed, manual }
  notes: [],
  sel: null,            // selected note id
  inT: null, outT: null,
  view: { t0: 0, t1: 10 },
  drawBox: false,
  dirty: false,
  server: true,
};

/* ---------------------------------------------------------------- loading */

async function init() {
  const sel = $('scene');
  sel.innerHTML = Object.keys(SCENES).map((k) => `<option value="${k}">${k}</option>`).join('') + '<option value="">just the video (no scene)</option>';
  sel.value = S.sceneId;
  sel.onchange = async () => { S.sceneId = sel.value; await loadScene(); if (S.video) await afterVideo(); };
  await loadScene();
  try {
    const r = await fetch('/__review/videos');
    if (!r.ok) throw new Error();
    const list = await r.json();
    S.list = list;
    $('videos').innerHTML += list.map((v) => `<option value="${esc(v.p)}">${esc(v.p)} (${(v.size / 1e6).toFixed(0)}MB)</option>`).join('');
  } catch {
    S.server = false;
    status('saveStatus', 'No dev server: notes stay in this browser only. Run `npm run dev`.', 'warn');
  }
  $('videos').onchange = () => { const p = $('videos').value; if (p) openVideo({ p, name: p.split('/').pop(), size: S.list?.find((v) => v.p === p)?.size, url: `/__review/video?p=${encodeURIComponent(p)}` }); };
  $('open').onclick = () => $('file').click();
  $('file').onchange = () => { const f = $('file').files[0]; if (f) openFile(f); };
  const vw = $('vwrap');
  vw.addEventListener('dragover', (e) => { e.preventDefault(); vw.classList.add('over'); });
  vw.addEventListener('dragleave', () => vw.classList.remove('over'));
  vw.addEventListener('drop', (e) => {
    e.preventDefault(); vw.classList.remove('over');
    const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('video/') || /\.(mp4|webm|mov|mkv|m4v)$/i.test(x.name));
    if (f) openFile(f);
  });
  $('resync').onclick = () => sync(true);
  wireTransport();
  wireTimeline();
  wireEditor();
  wireOverlay();
  addEventListener('keydown', onKey);
  addEventListener('resize', () => { drawTimeline(); drawOverlay(); });
  addEventListener('beforeunload', (e) => { if (S.dirty) { save(); e.preventDefault(); } });
  requestAnimationFrame(tick);
}

async function loadScene() {
  S.scene = S.sceneId ? await SCENES[S.sceneId]() : null;
  S.anchors = [];
  S.voices = {};
}

function openFile(f) {
  openVideo({ name: f.name, p: null, size: f.size, url: URL.createObjectURL(f), file: f });
}

async function openVideo(v) {
  if (S.dirty) await save();
  $('drop').hidden = true;
  S.video = { name: v.name, p: v.p, size: v.size ?? null, duration: null };
  S._src = v;
  S.notes = []; S.sel = null; S.inT = S.outT = null; S.rec = null;
  video.src = v.url;
  await new Promise((res) => { video.onloadedmetadata = res; video.onerror = res; });
  S.video.duration = +video.duration.toFixed(3);
  S.view = { t0: 0, t1: video.duration || 10 };
  document.title = `Review · ${v.name}`;
  await afterVideo();
}

/** Load the saved review (if any), then sync. */
async function afterVideo() {
  const saved = await loadSaved();
  if (saved) {
    S.notes = saved.notes ?? [];
    S.savedAnchors = saved.anchors ?? [];
    S.savedVoices = saved.voices ?? {};
  } else {
    S.savedAnchors = []; S.savedVoices = {};
  }
  renderNotes();
  await sync(false);
}

/* The repo's file is the review. The browser's copy is only for when there
   is no dev server to ask; read it otherwise and a review deleted from the
   repo would come back from the browser. */
async function loadSaved() {
  if (S.server) {
    try {
      const r = await fetch(`/__review/notes?scene=${encodeURIComponent(S.sceneId || 'video')}&video=${encodeURIComponent(S.video.name)}`);
      return r.ok ? r.json() : null;
    } catch { /* the server went away: fall through */ }
  }
  try { return JSON.parse(localStorage.getItem(lsKey()) || 'null'); } catch { return null; }
}

/* ---------------------------------------------------------------- sync */

async function decode(buf) {
  const ctx = new OfflineAudioContext(1, 1, SR);
  const ab = await ctx.decodeAudioData(buf);
  const out = new Float32Array(ab.length);
  for (let c = 0; c < ab.numberOfChannels; c++) {
    const d = ab.getChannelData(c);
    for (let i = 0; i < d.length; i++) out[i] += d[i] / ab.numberOfChannels;
  }
  return out;
}

async function sha1(buf) {
  const h = await crypto.subtle.digest('SHA-1', buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sync(force) {
  $('resync').disabled = !S.scene;
  if (!S.scene) { status('syncStatus', 'no scene: notes are on the video clock'); drawTimeline(); return; }
  try {
    if (!S.rec) {
      status('syncStatus', 'reading the recording\'s soundtrack…');
      const buf = S._src.file ? await S._src.file.arrayBuffer() : await (await fetch(S._src.url)).arrayBuffer();
      const pcm = await decode(buf);
      const peaks = new Float32Array(Math.ceil(pcm.length / 160));
      for (let i = 0; i < pcm.length; i++) { const k = (i / 160) | 0; const a = Math.abs(pcm[i]); if (a > peaks[k]) peaks[k] = a; }
      S.rec = { pcm, peaks };
    }
    status('syncStatus', 'reading the voice lines…');
    const lines = [];
    for (const L of S.scene.lines) {
      const buf = await (await fetch(L.voice)).arrayBuffer();
      S.voices[L.id] = await sha1(buf.slice(0));
      lines.push({ id: L.id, pcm: await decode(buf) });
    }
    const changed = S.scene.lines.filter((L) => S.savedVoices[L.id] && S.savedVoices[L.id] !== S.voices[L.id]).map((L) => L.id);
    const stale = S.scene.lines.filter((L) => WORDS[L.id] && WORDS[L.id].sha1 !== S.voices[L.id]).map((L) => L.id);
    status('syncStatus', 'finding each line in the recording…');
    await new Promise((r) => setTimeout(r, 0));
    const found = syncLines(S.rec.pcm, lines);
    // a line Richard nudged by hand keeps his placement unless he asks again
    S.anchors = found.map((a) => {
      const was = S.savedAnchors.find((x) => x.id === a.id);
      return !force && was?.manual ? { ...a, t: was.t, manual: true } : a;
    });
    const miss = S.anchors.filter((a) => !a.found).length;
    status('syncStatus', miss ? `synced ${S.anchors.length - miss}/${S.anchors.length} lines; ${miss} placed between neighbours` : `synced all ${S.anchors.length} lines to the voice`, miss ? 'warn' : 'ok');
    const msgs = [];
    if (changed.length) msgs.push(`Re-recorded since this review was saved: ${changed.join(', ')}. Their notes keep the word and time they were made on.`);
    if (stale.length) msgs.push(`src/voicewords.json is behind for ${stale.join(', ')}: run python tools/capture/voice-words.py ${stale[0].replace(/_\d+$/, '')}`);
    if (miss) msgs.push(`Not heard in the recording: ${S.anchors.filter((a) => !a.found).map((a) => a.id).join(', ')} (re-recorded, or cut). Drag its left edge on the timeline to place it.`);
    $('banner').textContent = msgs.join('  ·  ');
    $('banner').hidden = !msgs.length;
    if (force) touch();
  } catch (e) {
    console.error(e);
    status('syncStatus', `could not sync (${e.message}). Drag each line's left edge to place it.`, 'warn');
  }
  /* A saved note keeps the place it was MADE on (its word, its cut, the voice
     it heard), even if that line has been re-recorded since; only a note that
     never had one, or a forced re-sync, is placed again. */
  for (const n of S.notes) {
    if (!n.at || force) n.at = whereAt(n.t);
    if (n.t2 != null && (!n.at2 || force)) n.at2 = whereAt(n.t2);
  }
  renderNotes();
  drawTimeline();
}

/* ---------------------------------------------------------------- where */

/** Which line, word, cut and cue the recording is on at `t`. */
function whereAt(t) {
  if (!S.scene || !S.anchors.length) return null;
  let i = -1;
  for (let k = 0; k < S.anchors.length; k++) if (S.anchors[k].t != null && t >= S.anchors[k].t - 0.05) i = k;
  if (i < 0) return { line: 0, before: true, lt: +(t - S.anchors[0].t).toFixed(2) };
  const L = S.scene.lines[i];
  const lt = t - S.anchors[i].t;
  const words = lineWords(L.text, WORDS[L.id]);
  let wi = -1;
  for (let k = 0; k < words.length; k++) if (lt >= words[k].a - 0.05) wi = k;
  const inWord = wi >= 0 && lt <= words[wi].b + 0.25;
  let ci = 0;
  for (let k = 0; k < L.cuts.length; k++) if (lt >= L.cuts[k].t) ci = k;
  let act = null;
  for (const a of L.acts) if (lt >= a.t) act = a.name;
  const after = lt > (S.anchors[i].dur ?? L.len) + 0.1;
  return {
    line: i + 1, id: L.id, lt: +lt.toFixed(2),
    word: wi >= 0 ? words[wi].w : null, wi, inWord: inWord && !after, after,
    cut: ci, shot: L.cuts[ci]?.name ?? null, act,
    voice: S.voices[L.id] ?? null,
  };
}

const fmt = (t) => {
  if (t == null || !Number.isFinite(t)) return '--:--.--';
  const m = Math.floor(Math.max(0, t) / 60), s = Math.max(0, t) - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
};

function whereText(w, short = false) {
  if (!w) return '';
  if (w.before) return `before line 1 (${w.lt.toFixed(2)}s)`;
  const bits = [`line ${w.line} +${w.lt.toFixed(2)}s`];
  if (w.word) bits.push(`${w.inWord ? 'on' : 'after'} "${w.word}"`);
  if (!short) { bits.push(`cut ${w.cut + 1} ${w.shot}`); if (w.act) bits.push(`Payne: ${w.act}`); }
  return bits.join(' · ');
}

/* ---------------------------------------------------------------- notes */

let nid = 0;
const newId = () => `n${Date.now().toString(36)}${(nid++).toString(36)}`;

function addNote() {
  if (!S.video) return;
  video.pause();
  const t = +video.currentTime.toFixed(3);
  const n = { id: newId(), t, tag: 'camera', text: '' };
  if (S.inT != null) {
    const a = S.inT, b = S.outT ?? t;
    n.t = +Math.min(a, b).toFixed(3); n.t2 = +Math.max(a, b).toFixed(3);
    S.inT = S.outT = null;
  }
  n.at = whereAt(n.t);
  if (n.t2 != null) n.at2 = whereAt(n.t2);
  S.notes.push(n);
  select(n.id, true);
  touch();
}

function select(id, focus = false) {
  S.sel = id;
  S.drawBox = false;
  overlay.classList.remove('draw');
  renderNotes();
  renderEditor();
  if (focus) $('edText').focus();
  drawTimeline();
  drawOverlay();
}

const selNote = () => S.notes.find((n) => n.id === S.sel);

function renderNotes() {
  S.notes.sort((a, b) => a.t - b.t);
  $('count').textContent = S.notes.length ? `${S.notes.length}` : '';
  $('notes').innerHTML = S.notes.map((n) => `
    <div class="note ${n.id === S.sel ? 'sel' : ''}" data-id="${n.id}">
      <div class="when"><span class="tag" style="background:${TAG_COLOR[n.tag]}">${n.tag}</span>
        ${fmt(n.t)}${n.t2 != null ? `–${fmt(n.t2)}` : ''} ${n.box ? '▭' : ''}<br>${esc(whereText(n.at, true))}</div>
      <div class="txt ${n.text ? '' : 'empty'}">${esc(n.text || 'no words yet')}</div>
    </div>`).join('') || '<p class="status" style="padding:8px">No notes yet. Pause where something should change and press M.</p>';
}

function renderEditor() {
  const n = selNote();
  $('editor').hidden = !n;
  if (!n) return;
  $('edWhere').textContent = `${fmt(n.t)}${n.t2 != null ? ` – ${fmt(n.t2)}` : ''}  ${whereText(n.at)}`;
  $('edTags').innerHTML = TAGS.map(([t, c], i) => `<button type="button" data-tag="${t}" class="${n.tag === t ? 'on' : ''}" style="${n.tag === t ? `background:${c};border-color:${c};color:#10131a` : ''}" title="${i + 1}">${i + 1} ${t}</button>`).join('');
  if (document.activeElement !== $('edText')) $('edText').value = n.text;
  $('edBox').textContent = n.box ? '▭ Redraw the box' : '▭ Draw a box';
}

function wireEditor() {
  $('notes').addEventListener('click', (e) => {
    const el = e.target.closest('.note');
    if (!el) return;
    const n = S.notes.find((x) => x.id === el.dataset.id);
    video.pause();
    video.currentTime = n.t;
    select(n.id);
  });
  $('edTags').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    const n = selNote();
    if (!b || !n) return;
    n.tag = b.dataset.tag; touch(); renderNotes(); renderEditor(); drawTimeline();
  });
  $('edText').addEventListener('input', () => { const n = selNote(); if (n) { n.text = $('edText').value; touch(); renderNotes(); } });
  $('edText').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('edText').blur(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); $('edText').blur(); }
    e.stopPropagation();
  });
  $('edDel').onclick = () => {
    const n = selNote();
    if (!n) return;
    if (n.text && !confirm(`Delete this note?\n\n"${n.text.slice(0, 120)}"`)) return;
    S.notes = S.notes.filter((x) => x !== n);
    S.sel = null; touch(); renderNotes(); renderEditor(); drawTimeline(); drawOverlay();
  };
  $('edBox').onclick = () => startBox();
  $('edRange').onclick = () => {
    const n = selNote();
    if (!n) return;
    const t = +video.currentTime.toFixed(3);
    if (t > n.t) { n.t2 = t; n.at2 = whereAt(t); } else { n.t2 = n.t; n.at2 = n.at; n.t = t; n.at = whereAt(t); }
    touch(); renderNotes(); renderEditor(); drawTimeline();
  };
}

/* ---------------------------------------------------------------- saving */

let saveTimer = 0;
function touch() {
  S.dirty = true;
  status('saveStatus', 'unsaved…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 700);
}

function payload() {
  return {
    scene: S.sceneId || 'video',
    sceneTitle: S.scene?.title ?? null,
    source: S.scene?.source ?? null,
    video: S.video,
    saved: new Date().toISOString(),
    voices: S.voices,
    anchors: S.anchors.map(({ id, t, score, found, placed, manual, dur }) => ({ id, t, score, found, ...(placed ? { placed } : {}), ...(manual ? { manual } : {}), dur: +dur.toFixed(2) })),
    notes: S.notes,
  };
}

async function save() {
  if (!S.video) return;
  clearTimeout(saveTimer);
  const body = payload();
  try { localStorage.setItem(lsKey(), JSON.stringify(body)); } catch { /* full or blocked */ }
  if (!S.server) { S.dirty = false; status('saveStatus', 'saved in this browser only', 'warn'); return; }
  try {
    const r = await fetch('/__review/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    S.dirty = false;
    status('saveStatus', `saved · ${j.path}`, 'ok');
  } catch (e) {
    status('saveStatus', `NOT saved to the repo (${e.message}); kept in this browser`, 'warn');
  }
}

const lsKey = () => `kk-review:${S.sceneId || 'video'}:${S.video?.name}`;

/* ---------------------------------------------------------------- transport */

function seek(t) {
  if (!S.video) return;
  video.currentTime = Math.max(0, Math.min(video.duration || 0, t));
}

function wireTransport() {
  $('play').onclick = togglePlay;
  document.querySelectorAll('[data-step]').forEach((b) => { b.onclick = () => { video.pause(); seek(video.currentTime + Number(b.dataset.step)); }; });
  document.querySelectorAll('[data-frame]').forEach((b) => { b.onclick = () => { video.pause(); seek(video.currentTime + FRAME * Number(b.dataset.frame)); }; });
  $('rate').onchange = () => { video.playbackRate = Number($('rate').value); };
  $('markIn').onclick = () => { S.inT = video.currentTime; S.outT = null; drawTimeline(); };
  $('markOut').onclick = () => { S.outT = video.currentTime; if (S.inT == null) S.inT = 0; drawTimeline(); };
  $('addNote').onclick = addNote;
  video.addEventListener('play', () => { $('play').textContent = '❚❚ Pause'; });
  video.addEventListener('pause', () => { $('play').textContent = '▶ Play'; });
}

function togglePlay() { if (!S.video) return; if (video.paused) video.play(); else video.pause(); }

function jumpLine(dir) {
  const t = video.currentTime;
  const starts = S.anchors.map((a) => a.t).filter((x) => x != null);
  const next = dir > 0 ? starts.find((x) => x > t + 0.05) : [...starts].reverse().find((x) => x < t - 0.3);
  if (next != null) seek(next);
}

function jumpCut(dir) {
  const t = video.currentTime;
  const cuts = [];
  S.scene?.lines.forEach((L, i) => { const a = S.anchors[i]; if (a?.t != null) for (const c of L.cuts) cuts.push(a.t + c.t); });
  cuts.sort((a, b) => a - b);
  const next = dir > 0 ? cuts.find((x) => x > t + 0.02) : [...cuts].reverse().find((x) => x < t - 0.2);
  if (next != null) seek(next);
}

function onKey(e) {
  const typing = /^(TEXTAREA|INPUT|SELECT)$/.test(e.target.tagName);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
  if (typing) return;
  const k = e.key;
  const n = selNote();
  if (k === ' ' || k === 'k') { e.preventDefault(); togglePlay(); }
  else if (k === ',' || k === '.') { video.pause(); seek(video.currentTime + (k === '.' ? FRAME : -FRAME)); }
  else if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); video.pause(); seek(video.currentTime + (k === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 1 : 0.1)); }
  else if (k === 'ArrowUp' || k === 'ArrowDown') { e.preventDefault(); jumpLine(k === 'ArrowDown' ? 1 : -1); }
  else if (k === '[' || k === ']') jumpCut(k === ']' ? 1 : -1);
  else if (k === 'm' || k === 'n') { e.preventDefault(); addNote(); }
  else if (k === 'i') { S.inT = video.currentTime; S.outT = null; drawTimeline(); }
  else if (k === 'o') { S.outT = video.currentTime; if (S.inT == null) S.inT = 0; drawTimeline(); }
  else if (k === 'b' && n) startBox();
  else if (k === 'Enter' && n) { e.preventDefault(); $('edText').focus(); }
  else if (/^[1-7]$/.test(k) && n) { n.tag = TAGS[Number(k) - 1][0]; touch(); renderNotes(); renderEditor(); drawTimeline(); }
  else if (k === 'Escape') { S.inT = S.outT = null; if (S.drawBox) { S.drawBox = false; overlay.classList.remove('draw'); } else select(null); }
}

/* ---------------------------------------------------------------- per frame */

function tick() {
  if (S.video) {
    const t = video.currentTime;
    const w = whereAt(t);
    const r = [`<b class="big">${fmt(t)}</b>`];
    if (w && !w.before) {
      r.push(`<span>line</span> <b>${w.line}</b> <b>+${w.lt.toFixed(2)}s</b>`);
      if (w.word) r.push(`<span>${w.inWord ? 'on' : 'after'}</span> <b>"${esc(w.word)}"</b>`);
      r.push(`<span>cut</span> <b>${w.cut + 1} ${esc(w.shot)}</b>`);
      if (w.act) r.push(`<span>Payne</span> <b>${esc(w.act)}</b>`);
    } else if (w?.before) r.push('<span>before line 1</span>');
    if (S.inT != null) r.push(`<span>range</span> <b>${fmt(S.inT)} → ${S.outT != null ? fmt(S.outT) : 'playhead'}</b> <span>(M makes it a note)</span>`);
    const html = r.join('');
    if (html !== S._ro) { $('readout').innerHTML = html; S._ro = html; }
    const sub = subtitle(w);
    if (sub !== S._sub) { $('subtitle').innerHTML = sub; S._sub = sub; }
    if (!video.paused) {
      // keep the playhead on screen while it plays
      const span = S.view.t1 - S.view.t0;
      if (t > S.view.t1 - span * 0.1 || t < S.view.t0) { S.view.t0 = Math.max(0, t - span * 0.2); S.view.t1 = S.view.t0 + span; }
    }
    if (t !== S._lastT || !video.paused) { drawTimeline(); drawOverlay(); S._lastT = t; }
  }
  requestAnimationFrame(tick);
}

function subtitle(w) {
  if (!w || w.before || w.after || !S.scene) return '';
  const L = S.scene.lines[w.line - 1];
  const words = lineWords(L.text, WORDS[L.id]);
  if (!words.length) return esc(L.text);
  return `<span class="status">${w.line}</span> ` + words.map((x, i) => `<span class="w ${i < w.wi ? 'said' : i === w.wi ? (w.inWord ? 'now' : 'said') : ''}">${esc(x.w)}</span>`).join(' ');
}

/* ---------------------------------------------------------------- timeline */

const ROWS = { ruler: [0, 18], lines: [20, 28], cuts: [50, 22], acts: [74, 18], words: [94, 18], wave: [114, 50], notes: [168, 34] };

function tx(t) { return (t - S.view.t0) / (S.view.t1 - S.view.t0) * tl.clientWidth; }
function xt(x) { return S.view.t0 + x / tl.clientWidth * (S.view.t1 - S.view.t0); }

function drawTimeline() {
  const dpr = devicePixelRatio || 1;
  const W = tl.clientWidth, H = tl.clientHeight;
  if (tl.width !== Math.round(W * dpr) || tl.height !== Math.round(H * dpr)) { tl.width = Math.round(W * dpr); tl.height = Math.round(H * dpr); }
  const g = tl.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  g.font = '11px ui-monospace, Consolas, monospace';
  g.textBaseline = 'middle';
  const css = getComputedStyle(document.documentElement);
  const muted = css.getPropertyValue('--muted'), line = css.getPropertyValue('--line'), ink = css.getPropertyValue('--ink');
  if (!S.video) return;
  const span = S.view.t1 - S.view.t0;
  const pps = W / span;
  // ruler
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60];
  const step = steps.find((s) => s * pps >= 70) ?? 60;
  g.fillStyle = muted; g.strokeStyle = line;
  for (let t = Math.ceil(S.view.t0 / step) * step; t <= S.view.t1; t += step) {
    const x = tx(t);
    g.beginPath(); g.moveTo(x, 12); g.lineTo(x, H); g.stroke();
    g.fillText(step < 1 ? fmt(t).slice(3) : fmt(t).slice(0, 5), x + 3, 8);
  }
  // range being marked
  if (S.inT != null) {
    const a = tx(S.inT), b = tx(S.outT ?? video.currentTime);
    g.fillStyle = 'rgba(255,179,71,.15)'; g.fillRect(Math.min(a, b), 12, Math.abs(b - a), H - 12);
  }
  // lines, cuts, acts, words
  S.scene?.lines.forEach((L, i) => {
    const A = S.anchors[i];
    if (A?.t == null) return;
    const x0 = tx(A.t), x1 = tx(A.t + (A.dur ?? L.len));
    if (x1 < 0 || x0 > W) return;
    const [ly, lh] = ROWS.lines;
    g.fillStyle = A.found ? (i % 2 ? '#2f3a55' : '#283249') : '#4a3416';
    g.fillRect(x0, ly, Math.max(1, x1 - x0), lh);
    g.fillStyle = A.manual ? '#ffb347' : A.found ? '#7fb6ff' : '#f0b350';
    g.fillRect(x0 - 1, ly, 3, lh);   // the drag handle
    g.save(); g.beginPath(); g.rect(x0, ly, Math.max(0, x1 - x0), lh); g.clip();
    g.fillStyle = ink;
    g.fillText(`${i + 1}${A.found ? '' : ' ?'}  ${L.text}`, x0 + 6, ly + lh / 2);
    g.restore();
    const [cy, ch] = ROWS.cuts;
    L.cuts.forEach((c, k) => {
      const x = tx(A.t + c.t);
      const nx = k + 1 < L.cuts.length ? tx(A.t + L.cuts[k + 1].t) : x1;
      g.fillStyle = k % 2 ? '#24303f' : '#1f2a36'; g.fillRect(x, cy, Math.max(1, nx - x), ch);
      g.fillStyle = '#9fd0ff'; g.fillRect(x, cy, 2, ch);
      g.save(); g.beginPath(); g.rect(x, cy, Math.max(0, nx - x - 2), ch); g.clip();
      g.fillStyle = ink; g.fillText(c.name, x + 5, cy + ch / 2); g.restore();
    });
    const [ay, ah] = ROWS.acts;
    for (const a of L.acts) {
      const x = tx(A.t + a.t);
      g.fillStyle = '#ff9ad5'; g.beginPath(); g.moveTo(x, ay + 2); g.lineTo(x + 5, ay + ah / 2); g.lineTo(x, ay + ah - 2); g.fill();
      g.fillStyle = '#e8b9d4'; g.fillText(a.name, x + 8, ay + ah / 2);
    }
    if (pps > 45) {
      const [wy, wh] = ROWS.words;
      g.fillStyle = muted;
      for (const w of lineWords(L.text, WORDS[L.id])) {
        const x = tx(A.t + w.a);
        g.fillStyle = '#3a4560'; g.fillRect(x, wy + 2, Math.max(1, tx(A.t + w.b) - x), wh - 4);
        g.fillStyle = ink; g.fillText(w.w, x + 2, wy + wh / 2);
      }
    }
  });
  // the recording's waveform
  if (S.rec) {
    const [wy, wh] = ROWS.wave;
    g.fillStyle = '#4d5b78';
    const per = 0.01;
    for (let x = 0; x < W; x++) {
      const a = Math.max(0, Math.floor(xt(x) / per)), b = Math.max(a + 1, Math.floor(xt(x + 1) / per));
      let m = 0;
      for (let k = a; k < b && k < S.rec.peaks.length; k++) m = Math.max(m, S.rec.peaks[k]);
      const h = Math.min(1, m * 1.6) * wh;
      g.fillRect(x, wy + (wh - h) / 2, 1, Math.max(1, h));
    }
  } else {
    g.fillStyle = muted; g.fillText(S.scene ? 'soundtrack loading…' : '', 8, ROWS.wave[0] + ROWS.wave[1] / 2);
  }
  // notes
  const [ny, nh] = ROWS.notes;
  for (const n of S.notes) {
    const x = tx(n.t);
    const c = TAG_COLOR[n.tag];
    if (n.t2 != null) { g.fillStyle = c + '55'; g.fillRect(x, ny + 6, tx(n.t2) - x, nh - 12); }
    g.fillStyle = c;
    g.beginPath(); g.moveTo(x, ny + nh); g.lineTo(x - 6, ny + 8); g.lineTo(x + 6, ny + 8); g.fill();
    if (n.id === S.sel) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); g.lineWidth = 1; }
    g.fillRect(x - 0.5, ROWS.lines[0], 1, ny + 8 - ROWS.lines[0]);
  }
  // playhead
  const px = tx(video.currentTime);
  g.fillStyle = '#ff5d5d'; g.fillRect(px - 1, 0, 2, H);
}

function wireTimeline() {
  let drag = null;
  tl.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (!S.video) return;
    const dur = video.duration || 10;
    const span = S.view.t1 - S.view.t0;
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      const d = (e.deltaX || e.deltaY) / tl.clientWidth * span;
      S.view.t0 = Math.max(0, Math.min(dur - span, S.view.t0 + d)); S.view.t1 = S.view.t0 + span;
    } else {
      const at = xt(e.offsetX);
      const k = e.deltaY > 0 ? 1.18 : 1 / 1.18;
      const ns = Math.max(0.5, Math.min(dur, span * k));
      S.view.t0 = Math.max(0, at - (at - S.view.t0) * ns / span); S.view.t1 = Math.min(dur, S.view.t0 + ns);
      S.view.t0 = Math.max(0, S.view.t1 - ns);
    }
    drawTimeline();
  }, { passive: false });
  tl.addEventListener('pointerdown', (e) => {
    if (!S.video) return;
    tl.setPointerCapture(e.pointerId);
    const y = e.offsetY, x = e.offsetX;
    // a line's left edge: nudge its sync by hand
    if (y >= ROWS.lines[0] && y < ROWS.lines[0] + ROWS.lines[1]) {
      const i = S.anchors.findIndex((a) => a.t != null && Math.abs(tx(a.t) - x) < 6);
      if (i >= 0) { drag = { kind: 'anchor', i, dx: x - tx(S.anchors[i].t) }; return; }
    }
    // a note's pin
    if (y >= ROWS.notes[0]) {
      const n = S.notes.find((q) => Math.abs(tx(q.t) - x) < 7);
      if (n) { video.pause(); seek(n.t); select(n.id); return; }
    }
    drag = { kind: 'scrub', wasPlaying: !video.paused };
    video.pause();
    seek(xt(x));
  });
  tl.addEventListener('pointermove', (e) => {
    const onEdge = e.offsetY >= ROWS.lines[0] && e.offsetY < ROWS.lines[0] + ROWS.lines[1] && S.anchors.some((a) => a.t != null && Math.abs(tx(a.t) - e.offsetX) < 6);
    tl.style.cursor = drag?.kind === 'anchor' || onEdge ? 'ew-resize' : 'text';
    if (!drag) return;
    if (drag.kind === 'scrub') seek(xt(e.offsetX));
    else {
      const a = S.anchors[drag.i];
      a.t = +Math.max(0, xt(e.offsetX - drag.dx)).toFixed(3);
      a.manual = true;
      seek(a.t);
      drawTimeline();
    }
  });
  const end = () => {
    if (drag?.kind === 'anchor') { for (const n of S.notes) { n.at = whereAt(n.t); if (n.t2 != null) n.at2 = whereAt(n.t2); } renderNotes(); touch(); }
    drag = null;
  };
  tl.addEventListener('pointerup', end);
  tl.addEventListener('pointercancel', end);
}

/* ---------------------------------------------------------------- boxes */

/** Where the picture actually is inside the <video> element (object-fit: contain). */
function contentRect() {
  const W = video.clientWidth, H = video.clientHeight;
  const vw = video.videoWidth || 16, vh = video.videoHeight || 9;
  const s = Math.min(W / vw, H / vh);
  return { x: (W - vw * s) / 2, y: (H - vh * s) / 2, w: vw * s, h: vh * s };
}

function startBox() {
  if (!selNote()) return;
  video.pause();
  S.drawBox = true;
  overlay.classList.add('draw');
  status('saveStatus', 'drag a box on the picture (Esc to stop)');
}

function wireOverlay() {
  let start = null;
  overlay.addEventListener('pointerdown', (e) => {
    if (!S.drawBox) return;
    overlay.setPointerCapture(e.pointerId);
    start = [e.offsetX, e.offsetY];
  });
  overlay.addEventListener('pointermove', (e) => {
    if (!start) return;
    S._live = [start[0], start[1], e.offsetX, e.offsetY];
    drawOverlay();
  });
  overlay.addEventListener('pointerup', (e) => {
    if (!start) return;
    const r = contentRect();
    const n = selNote();
    const x0 = Math.min(start[0], e.offsetX), y0 = Math.min(start[1], e.offsetY);
    const x1 = Math.max(start[0], e.offsetX), y1 = Math.max(start[1], e.offsetY);
    if (n && x1 - x0 > 4 && y1 - y0 > 4) {
      // stored as fractions of the PICTURE, so it means the same thing at any window size
      const f = (v, o, s) => +Math.min(1, Math.max(0, (v - o) / s)).toFixed(4);
      n.box = [f(x0, r.x, r.w), f(y0, r.y, r.h), f(x1, r.x, r.w), f(y1, r.y, r.h)];
      touch(); renderNotes(); renderEditor();
    }
    start = null; S._live = null; S.drawBox = false; overlay.classList.remove('draw');
    drawOverlay();
  });
}

function drawOverlay() {
  const dpr = devicePixelRatio || 1;
  const W = overlay.clientWidth, H = overlay.clientHeight;
  if (overlay.width !== Math.round(W * dpr) || overlay.height !== Math.round(H * dpr)) { overlay.width = Math.round(W * dpr); overlay.height = Math.round(H * dpr); }
  const g = overlay.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  if (!S.video) return;
  const r = contentRect();
  const t = video.currentTime;
  for (const n of S.notes) {
    if (!n.box) continue;
    const near = n.id === S.sel || (t >= n.t - 0.3 && t <= (n.t2 ?? n.t) + 0.3);
    if (!near) continue;
    const [a, b, c, d] = n.box;
    g.strokeStyle = TAG_COLOR[n.tag]; g.lineWidth = n.id === S.sel ? 3 : 2;
    g.strokeRect(r.x + a * r.w, r.y + b * r.h, (c - a) * r.w, (d - b) * r.h);
    if (n.text) {
      g.font = '13px system-ui, sans-serif';
      const label = n.text.split('\n')[0].slice(0, 60);
      const lx = r.x + a * r.w, ly = r.y + b * r.h - 6;
      g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(lx, ly - 15, g.measureText(label).width + 10, 19);
      g.fillStyle = '#fff'; g.fillText(label, lx + 5, ly - 1);
    }
  }
  if (S._live) {
    const [x0, y0, x1, y1] = S._live;
    g.strokeStyle = '#ffb347'; g.lineWidth = 2; g.setLineDash([6, 4]);
    g.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    g.setLineDash([]);
  }
}

/* ---------------------------------------------------------------- bits */

function status(id, text, kind = '') { const el = $(id); el.textContent = text; el.className = `status ${kind}`; }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

init();
