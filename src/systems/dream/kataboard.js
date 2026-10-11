/* ---------------------------------------------------------------------------
   記 THE KATA BOARD — every kitten's best Kata Trace scores, on a platform of
   its own off the far rim of the Kata Trace island.

   Richard, 2026-10-10: "a separate platform with leaderboards, per player or
   all players. Organised mainly by song, with highest scores, and filters for
   difficulty and speed/time." So the board is ONE SONG at a time, highest
   score first, and the filters are the three things a run is: the level, the
   speed (the song AND his attacks, `BM.SPEEDS` — "speed/time" read as the
   one clock), and whose.

   WHAT GOES ON IT: a song she FINISHED, on Lionheart's chart. A custom chart
   is a sister's own routine — it can be eight blows long — so a score off one
   is not a score on the song, and a run that was caught or stopped did not
   reach the end of it. `boardRows` is pure over the progress ledger, which is
   where the scores live (`DreamProgress.kataRun`), so the board travels with
   the save row like the stars do and a new game's board is empty.

   ONE ROW PER KITTEN PER LEVEL AND SPEED — her best there, not every run, so a
   sister who plays the same song ten times does not fill the board with
   herself. With LEVEL and SPEED on "all" she can be on it more than once,
   each row saying which it was.

   ONE PLAYER DRIVES IT (non-negotiable 7): whoever opens the kiosk owns the
   menu, the menu says her name, and the filters she leaves are what the next
   kitten walks up to.
--------------------------------------------------------------------------- */

import { PLAYER_STYLE } from '../../core/palette.js';
import { HOLO } from '../../world/simworld.js';
import { Kiosk } from './kiosk.js';
import { HoloPanel } from './holo.js';
import * as BM from './beatmap.js';
// A cycle (kata.js builds the board), safe because it is only read in the constructor.
import { markOffset } from './kata.js';

/**
 * Where it floats, off the Kata island's far rim along its `fwd` (the line
 * from the hub across the island): `gap` of void and a short bridge, so it
 * reads as somewhere you go, not a corner of the floors. `r` is its own disc.
 */
export const BOARD = { r: 8, gap: 6, rows: 8, kioskOff: 5.6, panelOff: 3.2, panelY: 3.6, menuOff: 2 };

/** The key a score is filed under. Speed as written in `BM.SPEEDS`. */
export const runKey = (song, diff, speed) => `${song}|${diff}|${speed}`;

/** A kitten's colour, by her name; grey for a name that is not one of the four. */
export function nameColour(name) {
  return PLAYER_STYLE.find((s) => s.name === name)?.colour ?? 0xb8c8cc;
}

/**
 * THE BOARD, as rows: highest score first, then higher accuracy, then whoever
 * got there FIRST (`at`), so a tie never reorders itself on a repaint.
 * `filter` is `{ song, diff: id|'all', speed: n|'all', who: name|'all' }`.
 */
export function boardRows(progress, filter, limit = BOARD.rows) {
  const out = [];
  for (const [name, row] of Object.entries(progress?.data?.kittens ?? {})) {
    if (filter.who !== 'all' && filter.who !== name) continue;
    for (const [key, r] of Object.entries(row?.kata ?? {})) {
      const [song, diff, sp] = key.split('|');
      const speed = Number(sp);
      if (song !== filter.song) continue;
      if (filter.diff !== 'all' && diff !== filter.diff) continue;
      if (filter.speed !== 'all' && speed !== filter.speed) continue;
      if (!Number.isFinite(r?.score)) continue;
      out.push({ name, song, diff, speed, score: r.score, acc: r.acc ?? 0, stars: r.stars ?? 0, at: r.at ?? 0 });
    }
  }
  out.sort((a, b) => b.score - a.score || b.acc - a.acc || a.at - b.at);
  return out.slice(0, limit);
}

/** One row as text, columns padded for the board's monospace face. */
export function rowText(i, r, filter) {
  const pos = `${i + 1}.`.padEnd(3);
  const who = r.name.toUpperCase().slice(0, 8).padEnd(8);
  const pts = r.score.toLocaleString('en-US').padStart(7);
  const acc = `${r.acc}%`.padStart(4);
  const stars = '★'.repeat(r.stars) + '☆'.repeat(Math.max(0, 3 - r.stars));
  const lv = filter.diff === 'all' ? ` ${BM.DIFFS[r.diff]?.name ?? r.diff}`.padEnd(7) : '';
  const sp = filter.speed === 'all' ? ` ${r.speed}×`.padEnd(6) : '';
  return `${pos} ${who} ${pts} ${acc} ${stars}${lv}${sp}`;
}

const MONO = '"Consolas", "Courier New", ui-monospace, monospace';

export class KataBoard {
  /**
   * @param {object} hall  the KataHall (for its song list: hidden songs stay hidden)
   * @param {object} isle  the Kata island, `{ x, y, z, r, fwd }` in the layer
   */
  constructor(hall, isle) {
    this.hall = hall;
    this.dream = hall.dream;
    const f = isle.fwd;
    const d = isle.r + BOARD.gap + BOARD.r;
    this.x = isle.x + f.x * d;
    this.z = isle.z + f.z * d;
    this.y = isle.y;
    this.r = BOARD.r;
    this.isle = isle;
    const sim = this.dream.sim;
    sim.addDisc({ x: this.x, z: this.z, r: BOARD.r, y: this.y, name: 'kataboard', grid: 2, colour: HOLO.cyan, rim: HOLO.gold });
    this.link = {
      a: { x: isle.x + f.x * (isle.r - 2), z: isle.z + f.z * (isle.r - 2), y: isle.y },
      b: { x: this.x - f.x * (BOARD.r - 2), z: this.z - f.z * (BOARD.r - 2), y: this.y },
    };
    sim.addBridge(this.link.a, this.link.b, { wobble: 0.6, waves: 1, name: 'kataboard bridge' });
    this.filter = { song: 'vr', diff: 'all', speed: 'all', who: 'all' };
    /* PLACED BY THE SCREEN, NOT BY THE ISLAND: the simulator's camera never
       turns (kata.js `SCREEN`), so the board stands on the platform's far
       side as she sees it and the kiosk out to its RIGHT. Laid out along the
       bridge instead, the kiosk's sign sat square across the foot of the
       board in the first render; at 5.0 up and 6.6 tall the board's title
       was off the top of her pane, standing on the platform. */
    const po = markOffset('N', BOARD.panelOff);
    const ko = markOffset('E', BOARD.kioskOff);
    this.panel = new HoloPanel({ w: 9.4, h: 5.6, px: 76, edge: HOLO.gold });
    this.panel.fullFace = true;
    this.panel.position.set(this.x + po.x, this.y + BOARD.panelY, this.z + po.z);
    sim.root.add(this.panel);
    this.kiosk = new Kiosk(this.dream, {
      x: this.x + ko.x, z: this.z + ko.z, y: this.y,
      /* NO CARD: the board beside it says everything a card would, and the
         card popped up over the board's right half, wherever the kiosk stood. */
      r: 1.6, colour: HOLO.gold, kanji: '記', title: 'KATA BOARD', near: 5,
      card: null,
      prompt: (p, key) => `[${key}]  CHANGE WHAT THE BOARD SHOWS`,
      interact: (p) => this.openFilters(p),
    });
    this._paint();
  }

  /** Songs a kitten can see listed: the hall's own list, so the secret song stays secret. */
  _songs(p) {
    return this.hall.songChoices(p).map((c) => c.S.id);
  }

  /** What the board says. Pure of THREE: `world-check` reads it. */
  lines() {
    const f = this.filter;
    const S = BM.songById(f.song);
    const rows = boardRows(this.dream.progress, f);
    const out = [
      { text: `記 ${S?.name ?? f.song}`, size: 1.5, color: HOLO.gold, glow: true, jp: true },
      { text: `${f.diff === 'all' ? 'EVERY LEVEL' : BM.DIFFS[f.diff].name} · ${f.speed === 'all' ? 'EVERY SPEED' : `${f.speed}×`} · ${f.who === 'all' ? 'EVERYBODY' : f.who.toUpperCase()}`, size: 0.85, color: 0x9fefff },
    ];
    if (!rows.length) {
      out.push({ text: 'no scores here yet', size: 1.0, color: 0x7f9fa8 });
      out.push({ text: 'finish this song at a 型 floor to be first!', size: 0.8, color: 0x7f9fa8 });
    } else {
      rows.forEach((r, i) => out.push({ text: rowText(i, r, f), size: 0.78, color: nameColour(r.name), font: MONO, weight: 700 }));
    }
    return out;
  }

  _paint() { this.panel.set(this.lines(), HOLO.gold); }

  /**
   * THE FILTERS: a HoloChoice over her head, ◀▶ on each row. Nothing on it is
   * irreversible, so it opens on SONG — the thing she came to change.
   */
  openFilters(p) {
    const f = this.filter;
    const songs = this._songs(p);
    if (!songs.includes(f.song)) f.song = songs[0] ?? 'vr';
    const cyc = (list, cur, s) => list[(list.indexOf(cur) + s + list.length) % list.length];
    const name = p.style?.name ?? p.name;
    const rows = [
      { text: () => `SONG  ◀ ${BM.songById(f.song)?.name ?? f.song} ▶`, cycle: (s) => { f.song = cyc(songs, f.song, s); this._paint(); } },
      { text: () => `LEVEL  ◀ ${f.diff === 'all' ? 'every level' : BM.DIFFS[f.diff].name} ▶`, cycle: (s) => { f.diff = cyc(['all', ...BM.DIFF_IDS], f.diff, s); this._paint(); } },
      { text: () => `SPEED  ◀ ${f.speed === 'all' ? 'every speed' : `${f.speed}×`} ▶`, cycle: (s) => { f.speed = cyc(['all', ...BM.SPEEDS], f.speed, s); this._paint(); } },
      // Per player or all players: everybody, or just the kitten driving.
      { text: () => `WHO  ◀ ${f.who === 'all' ? 'everybody' : `just ${f.who}`} ▶`, cycle: () => { f.who = f.who === 'all' ? name : 'all'; this._paint(); } },
      { text: 'done', dim: true, act: () => this.dream.closeChoice(p) },
    ];
    /* Off the platform's near middle, not the kiosk: the kiosk is out on the
       right, and a menu hung off it opened under the corner minimap. */
    const m = markOffset('S', BOARD.menuOff);
    this.dream.openChoice(p, { title: `記 KATA BOARD — ${name}`, rows, start: 0, anchor: { x: this.x + m.x, y: this.y, z: this.z + m.z } });
    return true;
  }

  /** Is this spot on the board's platform or the bridge to it (in the layer)? */
  covers(x, z, pad = 0.5) {
    if (Math.hypot(x - this.x, z - this.z) <= this.r + pad) return true;
    const { a, b } = this.link;
    const vx = b.x - a.x; const vz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz)));
    return Math.hypot(x - (a.x + vx * t), z - (a.z + vz * t)) <= 2.2 + 1 + pad;
  }

  /** Repainted on a filter change, on a new score, and once a second besides —
   *  a loaded save puts a whole other board in the ledger without telling anyone. */
  update(dt) {
    this._t = (this._t ?? 0) + dt;
    if (this._t < 1) return;
    this._t = 0;
    this._paint();
  }

  faceCamera(camera) { this.panel.faceCamera(camera); }
}
