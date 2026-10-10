import * as BM from './beatmap.js';
import { customCharts, saveChart, deleteChart } from './chartstore.js';

/* ---------------------------------------------------------------------------
   譜 THE BEAT-MAP EDITOR — "there's a custom beat-map editor".

   Opened from a Kata floor's 譜 kiosk, by the kitten whose floor it is, who
   then drives it (one player drives a menu, and the header says who). It is
   a full screen over a PAUSED game: a chart is written sitting down, and
   four sisters cannot keep playing behind a page that covers all of them.

   WHAT IS ON IT
     · the chart's words — title, song, level, length, author;
     · THE GRID: one row per beat, his five spots and the three attacks
       across it. A click puts him on a spot, or a blow on that beat; the
       same click again takes it away. Rows under a blow's warning are
       tinted, and a blow nobody could dodge is marked ⚠ (`BM.unfair`);
     · the floor as it looks on the row you last touched — his spot, the
       marks that blow lands on, and where a perfect kitten stands — and the
       same floor moving under the song when you press HEAR IT;
     · everything `BM.parseChart` says about it, in words;
     · the chart as JSON, which can be edited by hand and read back,
       copied, downloaded as a file and loaded from one — "human readable
       JSON that can be viewed, saved and loaded".
   SAVE keeps it in this browser (dream/chartstore.js), and the song picker
   at the 型 kiosk offers it under CHART for its song.

   NOTHING IRREVERSIBLE ON ONE PRESS (non-negotiable 7). Deleting a saved
   chart, starting over from Lionheart's, clearing the grid and closing with
   changes not saved all ask first, through the game's own Confirm — whose
   cursor opens on NO. Escape and a pad's back button come here too, as
   CLOSE, and so ask as well.
--------------------------------------------------------------------------- */

const ID = 'panel-kata-editor';
const hex = (c) => (Number.isFinite(c) ? `#${c.toString(16).padStart(6, '0')}` : '');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class KataEditor {
  constructor(game) {
    this.game = game;
    this.el = null;
    this.chart = null;
    this.dirty = false;
    this.savedId = null;
    this.row = 0;
    this.speed = 1;
    this.preview = null;
    this._onKey = (e) => this._key(e);
  }

  get active() { return !!this.el && !this.el.classList.contains('hidden'); }

  /* --------------------------------- build -------------------------------- */

  _build() {
    if (this.el) return;
    const el = document.createElement('div');
    el.id = ID;
    el.className = 'screen overlay hidden';
    el.innerHTML = `
      <div class="panel ke-panel">
        <div class="ke-head"><h2>譜 BEAT MAPS</h2><span class="ke-who" id="ke-who"></span></div>
        <div class="ke-meta">
          <label>title <input id="ke-title" maxlength="60" spellcheck="false"></label>
          <label>song <select id="ke-song">${BM.SONGS.map((s) => `<option value="${s.id}">${esc(s.name)} · ${s.bpm} BPM</option>`).join('')}</select></label>
          <label>level <select id="ke-diff">${BM.DIFF_IDS.map((d) => `<option value="${d}">${BM.DIFFS[d].name} · ${BM.DIFFS[d].lives} lives · ${BM.DIFFS[d].tell}-beat warning</option>`).join('')}</select></label>
          <label>beats <input id="ke-beats" type="number" min="4" max="400" step="4"></label>
          <label>by <input id="ke-author" maxlength="40" spellcheck="false"></label>
        </div>
        <div class="ke-body">
          <div class="ke-grid-wrap" id="ke-grid-wrap">
            <div class="ke-grid-head"><span>beat</span>${BM.LION_SPOTS.map((s) => `<span class="ke-l">${s}</span>`).join('')}${BM.ATTACKS.map((a) => `<span class="ke-a">${a.toUpperCase()}</span>`).join('')}</div>
            <div class="ke-grid" id="ke-grid"></div>
          </div>
          <div class="ke-side">
            <canvas id="ke-floor" width="240" height="240" aria-label="the floor on the chosen beat"></canvas>
            <div class="ke-say" id="ke-say"></div>
            <div class="ke-row">
              <button class="menu-btn" id="ke-play">▶ HEAR IT</button>
              <select id="ke-speed">${BM.SPEEDS.map((v) => `<option value="${v}">${v}×</option>`).join('')}</select>
            </div>
            <ul class="ke-check" id="ke-check"></ul>
            <details class="ke-json" id="ke-json">
              <summary class="help-topic">THE CHART AS JSON</summary>
              <textarea id="ke-text" spellcheck="false" aria-label="the chart as JSON"></textarea>
              <div class="ke-row">
                <button class="menu-btn" id="ke-apply">USE THIS TEXT</button>
                <button class="menu-btn" id="ke-copy">COPY</button>
                <button class="menu-btn" id="ke-download">SAVE AS A FILE</button>
                <button class="menu-btn" id="ke-upload">LOAD A FILE</button>
                <input type="file" id="ke-file" accept=".json,application/json" hidden>
              </div>
            </details>
          </div>
        </div>
        <div class="ke-foot">
          <button class="menu-btn" id="ke-new">START FROM LIONHEART'S</button>
          <button class="menu-btn" id="ke-clear">CLEAR IT</button>
          <select id="ke-saved" aria-label="saved charts"></select>
          <button class="menu-btn" id="ke-load">LOAD SAVED</button>
          <button class="menu-btn" id="ke-delete">DELETE SAVED</button>
          <button class="menu-btn primary" id="ke-save">SAVE</button>
          <button class="menu-btn back" id="ke-close">CLOSE</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    const $ = (id) => el.querySelector(`#${id}`);
    this.$ = $;
    $('ke-grid').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-b]');
      if (b) this._toggle(Number(b.dataset.b), b.dataset.k, b.dataset.v);
    });
    $('ke-title').addEventListener('input', () => { this.chart.title = $('ke-title').value; this._changed(false); });
    $('ke-author').addEventListener('input', () => { this.chart.author = $('ke-author').value; this._changed(false); });
    $('ke-beats').addEventListener('change', () => {
      const n = Math.max(4, Math.min(400, Math.round(Number($('ke-beats').value) || this.chart.beats)));
      const cut = this.chart.events.filter((e) => e.beat > n).length;
      const apply = () => {
        this.chart.beats = n;
        this.chart.events = this.chart.events.filter((e) => e.beat <= n);
        this._changed();
      };
      /* Shortening past what is written throws those away: asked first, with
         the box put back meanwhile — a "no" leaves it as it was, and a "yes"
         repaints it. */
      if (cut) {
        $('ke-beats').value = this.chart.beats;
        this._ask(`Shorten it to ${n} beats?`, `${cut} event${cut === 1 ? '' : 's'} after beat ${n} will be thrown away.`, `yes, cut ${cut}`, 'no, keep the length', apply);
      } else apply();
    });
    for (const [id, key] of [['ke-song', 'song'], ['ke-diff', 'difficulty']]) {
      $(id).addEventListener('change', () => { this.chart[key] = $(id).value; this._changed(); });
    }
    $('ke-speed').addEventListener('change', () => { this.speed = Number($('ke-speed').value) || 1; if (this.preview) this._play(); });
    $('ke-play').addEventListener('click', () => (this.preview ? this._stop() : this._play()));
    $('ke-apply').addEventListener('click', () => this._applyText());
    $('ke-copy').addEventListener('click', () => this._copy());
    $('ke-download').addEventListener('click', () => this._download());
    $('ke-upload').addEventListener('click', () => $('ke-file').click());
    $('ke-file').addEventListener('change', () => this._upload());
    $('ke-new').addEventListener('click', () => this._ask('Start from Lionheart\'s chart?',
      `Everything on the grid is replaced with his ${BM.DIFFS[this.chart.difficulty].name} chart for this song.`,
      'yes, replace it', 'no, keep mine', () => this._load(BM.generateChart(this.chart.song, this.chart.difficulty), null, true)));
    $('ke-clear').addEventListener('click', () => this._ask('Clear the grid?', 'Every move and every attack on it goes.',
      'yes, clear it', 'no, keep it', () => { this.chart.events = []; this._changed(); }));
    $('ke-load').addEventListener('click', () => this._loadSaved());
    $('ke-delete').addEventListener('click', () => this._deleteSaved());
    $('ke-save').addEventListener('click', () => this._save());
    $('ke-close').addEventListener('click', () => this.close());
  }

  /* --------------------------------- open --------------------------------- */

  /** Open for kitten `p`, on a song and level (and a saved chart, if one was picked). */
  open(p, { song = 'vr', difficulty = 'normal', custom = null, speed = 1 } = {}) {
    this._build();
    this.p = p;
    this.speed = speed;
    const saved = custom ? customCharts().find((c) => c.id === custom) : null;
    this._load(saved ? saved.chart : BM.generateChart(song, difficulty), saved ? saved.id : null, false);
    const g = this.game;
    // Paused without the pause menu: this page IS the menu, and it is hers.
    this.pausedHere = !g.paused;
    if (this.pausedHere) { g.paused = true; g.audio?.duck(true); }
    g._claimMenu?.(p?.index ?? null);
    const who = this.$('ke-who');
    who.textContent = p ? `${p.name} is writing` : '';
    who.style.color = hex(p?.style?.colour);
    this.el.classList.remove('hidden');
    window.addEventListener('keydown', this._onKey, true);
    g.sfx?.('menu');
  }

  /**
   * CLOSE — asks first if there is anything unsaved. `force` skips the ask
   * (the game tearing down underneath it).
   */
  close(force = false) {
    if (!this.active) return;
    if (this.dirty && !force) {
      this._ask('Close without saving?', 'Your changes to this chart will be lost.', 'yes, close it', 'no, keep writing', () => this.close(true));
      return;
    }
    this._stop();
    this.el.classList.add('hidden');
    window.removeEventListener('keydown', this._onKey, true);
    const g = this.game;
    // Only the pause this page made is undone: opened over the pause menu, it goes back to it.
    if (this.pausedHere && g.paused) {
      g.paused = false;
      g.audio?.duck(false);
      // Drop the frame the page ate, as `setPaused` does, or everything lurches.
      g.clock?.getDelta?.();
    }
    g._claimMenu?.(null);
    this.pausedHere = false;
  }

  /** ESCAPE IS CLOSE — and so it asks. A question already up answers itself (`Confirm`). */
  _key(e) {
    if (!this.active || e.code !== 'Escape' || this.game.confirm?.active) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.close();
  }

  /** The game's own are-you-sure, whose cursor opens on NO. Without one (a
   *  build with no Confirm) the answer is no: nothing irreversible happens. */
  _ask(title, body, yes, no, onYes) {
    const c = this.game.confirm;
    if (!c?.ask({ title, body, yes, no, onYes })) this._say('Answer the question that is already up first', true);
  }

  /* -------------------------------- the chart ------------------------------- */

  _load(chart, savedId, dirty) {
    this.chart = JSON.parse(JSON.stringify(chart));
    this.savedId = savedId;
    this.row = 0;
    /* SET, not only raised: `_changed` can only make it dirty, so a "yes,
       close it" left the flag up and the NEXT visit asked "close without
       saving?" over a chart nobody had touched — a false alarm, which is how
       a kitten learns to click through the real one. */
    this.dirty = !!dirty;
    this._changed(dirty);
  }

  /** Anything changed: redraw everything from the chart. */
  _changed(dirty = true) {
    if (dirty) this.dirty = true;
    const c = this.chart;
    const $ = this.$;
    $('ke-title').value = c.title ?? '';
    $('ke-author').value = c.author ?? '';
    $('ke-song').value = c.song;
    $('ke-diff').value = c.difficulty;
    $('ke-beats').value = c.beats;
    $('ke-speed').value = String(this.speed);
    this._paintSaved();
    this._paintGrid();
    this._paintCheck();
    if (document.activeElement !== $('ke-text')) $('ke-text').value = BM.chartToText(c);
    this._paintFloor(this.row * this._spb());
  }

  _spb() { return BM.spbAt(this.chart.song, this.speed); }

  /** One click on the grid. */
  _toggle(beat, kind, value) {
    const ev = this.chart.events;
    this.row = beat;
    if (kind === 'lion') {
      // A move written on the half-beat (Lionheart's own charts) lives on this row too.
      const i = ev.findIndex((e) => e.lion && Math.floor(e.beat) === beat);
      if (i >= 0 && ev[i].lion === value) ev.splice(i, 1);
      else if (i >= 0) ev[i].lion = value;
      else ev.push({ beat, lion: value });
    } else {
      const i = ev.findIndex((e) => e.attack && e.beat === beat);
      if (i >= 0 && ev[i].attack === value) ev.splice(i, 1);
      else if (i >= 0) ev[i].attack = value;
      else ev.push({ beat, attack: value });
    }
    this.chart.events = BM.sortedEvents(ev);
    this.game.sfx?.('menu');
    this._changed();
  }

  _paintGrid() {
    const c = this.chart;
    const as = BM.resolveChart(c);
    const bad = new Set(BM.unfair(c));
    const warned = new Set();
    for (const a of as) for (let b = Math.ceil(a.beat - a.tell); b < a.beat; b++) warned.add(b);
    const rows = [];
    const spb = BM.songById(c.song)?.spb ?? 0.5;
    for (let b = 0; b <= c.beats; b++) {
      const lion = c.events.find((e) => e.lion && Math.floor(e.beat) === b);
      const atk = c.events.find((e) => e.attack && e.beat === b);
      const cls = ['ke-r', b % 4 === 0 ? 'bar' : '', warned.has(b) ? 'warn' : '', bad.has(b) ? 'bad' : '', b === this.row ? 'cur' : ''].join(' ');
      const cells = BM.LION_SPOTS.map((s) => `<button class="menu-btn ke-c ke-l${lion?.lion === s ? ' on' : ''}" data-b="${b}" data-k="lion" data-v="${s}" title="he moves to ${s} on beat ${b}">${lion?.lion === s ? `${s}${lion.beat % 1 ? '½' : ''}` : '·'}</button>`).join('')
        + BM.ATTACKS.map((a) => `<button class="menu-btn ke-c ke-a${atk?.attack === a ? ' on' : ''}" data-b="${b}" data-k="attack" data-v="${a}" title="a ${a} lands on beat ${b}">${atk?.attack === a ? a.toUpperCase() : '·'}</button>`).join('');
      rows.push(`<div class="${cls}" data-row="${b}"><span class="ke-n">${bad.has(b) ? '⚠ ' : ''}${b}<i>${(b * spb).toFixed(1)}s</i></span>${cells}</div>`);
    }
    this.$('ke-grid').innerHTML = rows.join('');
  }

  _paintCheck() {
    const { errors, warnings } = BM.parseChart(this.chart);
    const as = BM.resolveChart(this.chart);
    const secs = this.chart.beats * this._spb();
    const lines = [
      ...errors.map((e) => `<li class="err">✕ ${esc(e)}</li>`),
      ...warnings.map((w) => `<li class="warn">⚠ ${esc(w)}</li>`),
    ];
    if (!lines.length) lines.push(`<li class="ok">✓ fair: every blow can be dodged — ${as.length} blows, ${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, '0')} at ${this.speed}×</li>`);
    this.$('ke-check').innerHTML = lines.join('');
  }

  _paintSaved() {
    const list = customCharts();
    this.$('ke-saved').innerHTML = list.length
      ? list.map((c) => `<option value="${c.id}"${c.id === this.savedId ? ' selected' : ''}>${esc(c.chart.title)} — ${esc(BM.songById(c.chart.song)?.name ?? c.chart.song)}</option>`).join('')
      : '<option value="">no saved charts yet</option>';
  }

  /** The floor at song time `t`: his spot, the marks being warned, where a perfect kitten is. */
  _paintFloor(t) {
    const cv = this.$('ke-floor');
    const g = cv.getContext('2d');
    const W = cv.width;
    const C = W / 2;
    const R = W * 0.26;
    const LR = W * 0.42;
    g.clearRect(0, 0, W, W);
    g.fillStyle = 'rgba(10, 30, 44, 0.92)';
    g.beginPath(); g.arc(C, C + W * 0.06, W * 0.36, 0, Math.PI * 2); g.fill();
    const spb = this._spb();
    const as = BM.resolveChart(this.chart).map((a) => ({ ...a, hitT: a.beat * spb, tellT: (a.beat - a.tell) * spb }));
    const heat = {};
    let sweep = 0;
    for (const a of as) {
      if (t < a.tellT || t > a.hitT + 0.2) continue;
      const k = Math.min(1, (t - a.tellT) / Math.max(0.05, a.hitT - a.tellT));
      if (a.attack === 'sweep') sweep = Math.max(sweep, k);
      else for (const m of BM.hitMarks(a.attack, a.spot)) heat[m] = Math.max(heat[m] ?? 0, k);
    }
    const at = (name, r) => { const v = BM.dirVec(name); return [C + v.x * r, C + W * 0.06 - v.y * r]; };
    for (const m of ['C', ...BM.DIRS]) {
      const [x, y] = m === 'C' ? [C, C + W * 0.06] : at(m, R);
      const h = Math.max(heat[m] ?? 0, sweep * 0.5);
      g.fillStyle = h ? `rgba(255, 59, 92, ${0.25 + 0.65 * h})` : 'rgba(127, 244, 255, 0.12)';
      g.strokeStyle = m === 'C' ? '#ffd34a' : '#7ff4ff';
      g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, W * 0.055, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    if (sweep) {
      g.strokeStyle = `rgba(255, 59, 92, ${0.4 + 0.6 * sweep})`;
      g.lineWidth = 4;
      g.beginPath(); g.arc(C, C + W * 0.06, W * 0.36, 0, Math.PI * 2); g.stroke();
    }
    // Him: the last spot he moved to by `t`.
    let spot = BM.LION_START;
    for (const e of BM.sortedEvents(this.chart.events)) if (e.lion && e.beat * spb <= t) spot = e.lion;
    for (const s of BM.LION_SPOTS) {
      const [x, y] = at(s, LR);
      g.fillStyle = s === spot ? '#ffd34a' : 'rgba(255, 211, 74, 0.2)';
      g.beginPath(); g.arc(x, y, W * (s === spot ? 0.05 : 0.03), 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#ffd34a';
    g.font = `bold ${Math.round(W * 0.07)}px Nunito, sans-serif`;
    g.textAlign = 'center';
    const [lx, ly] = at(spot, LR);
    g.fillText('獅', lx, ly - W * 0.07);
    // Where a perfect kitten stands.
    const rt = BM.route(this.chart);
    if (rt) {
      let pos = 'C';
      for (const m of rt.moves) if (m.beat * spb - 0.04 <= t) pos = m.to;
      const [x, y] = pos === 'C' ? [C, C + W * 0.06] : at(pos, R);
      g.fillStyle = hex(this.p?.style?.colour) || '#7ff4ff';
      g.beginPath(); g.arc(x, y, W * 0.03, 0, Math.PI * 2); g.fill();
    }
    const live = as.filter((a) => t >= a.tellT && t <= a.hitT);
    this.$('ke-say').textContent = live.length
      ? live.map((a) => `${a.attack.toUpperCase()} from ${a.spot} on beat ${a.beat}`).join(' · ')
      : `beat ${(t / spb).toFixed(1)} — he is on ${spot}`;
  }

  /* -------------------------------- hearing it -------------------------------- */

  /** HEAR IT: the song from its first step at the chosen speed, the grid's cursor riding it. */
  _play() {
    const audio = this.game.audio;
    this._stop();
    const at = audio?.restartMusic?.(this.chart.song, this.speed);
    const now = () => (audio?.ctx ? audio.ctx.currentTime : performance.now() / 1000);
    const t0 = at ?? now();
    audio?.duck?.(false);
    // Unducked under a paused game: `duck` refuses with no schedule running, so it is asked after the restart.
    this.preview = { t0, now };
    this.$('ke-play').textContent = '■ STOP';
    const step = () => {
      if (!this.preview) return;
      const t = now() - this.preview.t0;
      const spb = this._spb();
      const b = Math.max(0, Math.floor(t / spb));
      if (b !== this._lastRow) {
        this._lastRow = b;
        const old = this.$('ke-grid').querySelector('.ke-r.play');
        old?.classList.remove('play');
        const r = this.$('ke-grid').querySelector(`.ke-r[data-row="${b}"]`);
        r?.classList.add('play');
        r?.scrollIntoView({ block: 'center' });
      }
      this._paintFloor(t);
      if (t > this.chart.beats * spb + 1) { this._stop(); return; }
      this.preview.raf = requestAnimationFrame(step);
    };
    step();
  }

  _stop() {
    if (!this.preview) return;
    cancelAnimationFrame(this.preview.raf);
    this.preview = null;
    this._lastRow = null;
    this.$('ke-grid').querySelector('.ke-r.play')?.classList.remove('play');
    this.$('ke-play').textContent = '▶ HEAR IT';
    const audio = this.game.audio;
    if (audio) {
      audio.stopMusic();
      audio.musicRate = 1;
    }
    this._paintFloor(this.row * this._spb());
  }

  /* --------------------------------- text --------------------------------- */

  _applyText() {
    const text = this.$('ke-text').value;
    const { chart, errors } = BM.parseChart(text);
    if (!chart) { this._say(`Not used — ${errors[0]}`, true); return; }
    this.chart = chart;
    this._changed();
    this._say('Read it — the grid is the text now');
  }

  async _copy() {
    try {
      await navigator.clipboard.writeText(BM.chartToText(this.chart));
      this._say('Copied — paste it anywhere to share it');
    } catch {
      // Refused (no permission, or not a secure page): select it so Ctrl+C works.
      this.$('ke-json').open = true;
      this.$('ke-text').select();
      this._say('Your browser would not copy it — it is selected: press Ctrl+C', true);
    }
  }

  _download() {
    const text = BM.chartToText(this.chart);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const slug = (this.chart.title || 'chart').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'chart';
    a.download = `${slug}.kata.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    this._say(`Saved as ${a.download}`);
  }

  _upload() {
    const f = this.$('ke-file').files?.[0];
    if (!f) return;
    f.text().then((text) => {
      const { chart, errors } = BM.parseChart(text);
      this.$('ke-file').value = '';
      if (!chart) { this._say(`${f.name} is not a chart this game can read — ${errors[0]}`, true); return; }
      this._load(chart, null, true);
      this._say(`Loaded ${f.name} — SAVE to keep it here`);
    });
  }

  _save() {
    const r = saveChart(BM.chartToText(this.chart), this.savedId);
    if (r.error) { this._say(`Not saved — ${r.error}`, true); return; }
    this.savedId = r.id;
    this.dirty = false;
    this._paintSaved();
    this.game.sfx?.('score');
    this._say(`Saved — pick it at the 型 kiosk under CHART, on ${BM.songById(this.chart.song)?.name}`);
  }

  _loadSaved() {
    const id = this.$('ke-saved').value;
    const c = customCharts().find((x) => x.id === id);
    if (!c) { this._say('There is no saved chart to load yet — SAVE one first', true); return; }
    const go = () => { this._load(c.chart, c.id, false); this._say(`Loaded ${c.chart.title}`); };
    if (this.dirty) this._ask('Load another chart?', 'Your changes to this one are not saved.', 'yes, load it', 'no, keep writing', go);
    else go();
  }

  _deleteSaved() {
    const id = this.$('ke-saved').value;
    const c = customCharts().find((x) => x.id === id);
    if (!c) { this._say('There is no saved chart to delete', true); return; }
    this._ask(`Delete ${c.chart.title}?`, 'It is gone from this browser for good. Save it as a file first to keep a copy.',
      'yes, delete it', 'no, keep it', () => {
        deleteChart(id);
        if (this.savedId === id) { this.savedId = null; this.dirty = true; }
        this._paintSaved();
        this._say(`Deleted ${c.chart.title}`);
      });
  }

  /** A line under the floor that says what just happened — every button answers (6). */
  _say(text, bad = false) {
    const el = this.$('ke-say');
    el.textContent = text;
    el.classList.toggle('bad', bad);
    if (!bad) this.game.sfx?.('menu'); else this.game.sfx?.('deny');
  }
}
