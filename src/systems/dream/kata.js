import * as THREE from 'three';
import { Billboard } from '../../core/gfx.js';
import { PLAYER_STYLE } from '../../core/palette.js';
import { SIM, HOLO } from '../../world/simworld.js';
import { Kiosk, idleIn, stars3, KIOSK_OFF } from './kiosk.js';
import { HoloPanel } from './holo.js';
import { POSE, SHADOW_H } from './shadow.js';
import * as BM from './beatmap.js';
import { customCharts } from './chartstore.js';

/* ---------------------------------------------------------------------------
   KATA TRACE — 型, a dance with Lionheart.

   Richard: "Kata Trace should be a DDR style training game with Lionheart.
   Lionheart is at the top of the pad and attacks with Shadow Lionheart's
   moves — a straight cut or slam, a sweep you jump to dodge, and the cross
   slash. He moves quickly between 5 spots, west, north-west, north,
   north-east and east, starting at north. The cross-slash patterns change
   with where he is. The player is locked to the middle and the 8 directions
   and has to go back to the middle before going another direction. No demo
   by Lionheart first. Before playing you choose a song, a difficulty, and a
   speed modifier for the song and the attacks. Songs are 30 seconds to a
   minute and a half at normal speed. Several hits means fail. Show a score at
   the end. Patterns depend on the song and the difficulty. Beat maps are
   human-readable JSON that can be viewed, saved and loaded. Any in-game song
   can be picked, and there's a custom beat-map editor."

   WHAT USED TO BE HERE was a ghost Lionheart dancing a daily kata on the nine
   marks and her copying it after; the marks and the four floors (one per
   seat, in her colour) are what survived. The rules of the new one — the
   marks, his five spots, what each attack lands on, the format, the
   generator, the solver — are all in dream/beatmap.js, which is pure, so the
   drill, the editor (dream/kataeditor.js), the tour and world-check read the
   same ones.

   ONE CLOCK. The run's beat is the song's beat: at GO the song restarts from
   its first step (`Audio.restartMusic`), the speed modifier divides both, and
   `_keepTime` nudges the music back into phase whenever something stalled
   one clock and not the other (the pause menu stops the game, not the song).
   Four kittens on four floors cannot each have their own song out of one
   pair of speakers, so the FIRST run to start owns the music and the others
   tick a metronome — the music follows the earliest, and says so.

   THE JUDGE. A blow is judged a moment after it lands (`LATE`), on the mark
   she is standing on — or, for a sweep, on whether she pressed JUMP in time
   to be in the air. Dodged, it is graded on how close to the beat her last
   step (or jump) was: PERFECT, GREAT, or GOOD — GOOD is also what standing
   somewhere already safe is worth, because stepping on the beat is the whole
   game. Hit, she loses a life and her combo; out of lives, the run is over
   and the card says why.
--------------------------------------------------------------------------- */

/** How far from the middle the ring of eight marks sits. */
export const MARK_R = 3.4;
export const FLOOR_R = 5.4;
/** His five spots, from the floor's middle: outside the floor, across the top. */
export const LION_D = FLOOR_R + 1.9;
/** A step or a jump this long AFTER the blow still counts — a nine-year-old's hand. */
export const LATE = 0.07;
/** A jump pressed this long before a sweep lands still has her in the air. */
export const AIR = 0.5;
/** PERFECT and GREAT, seconds off the beat. */
export const GRADE_T = [0.10, 0.18];
/** Accuracy (0-100) for one, two, three stars. */
export const KATA_BANDS = [50, 75, 90];
export const POINTS = [0, 100, 200, 300];

export const GRADE = [
  { word: 'OUCH!', color: 0xff5a6a, sfx: 'hit' },
  { word: 'GOOD', color: 0x9fefff, sfx: 'good' },
  { word: 'GREAT', color: 0x8bff9a, sfx: 'great' },
  { word: 'PERFECT', color: HOLO.gold, sfx: 'perfect' },
];
const RED = 0xff3b5c;

/* THE SCREEN, ON THE GROUND. The simulator's camera never turns (player.js
   `CAM_YAW`, -π/4; `_basis`), so screen-up and screen-right are two fixed
   directions on the floor and "NE" is the arrow she pushes. Copied, not
   imported: player.js is the whole kitten. world-check pins the two equal. */
export const CAM_YAW = -Math.PI / 4;
export const SCREEN = {
  up: { x: -Math.sin(CAM_YAW), z: -Math.cos(CAM_YAW) },
  right: { x: Math.cos(CAM_YAW), z: -Math.sin(CAM_YAW) },
};

/** A mark's — or his spot's — offset from a floor's middle, in the layer. */
export function markOffset(name, r = MARK_R) {
  if (name === 'C') return { x: 0, z: 0 };
  const v = BM.dirVec(name);
  return {
    x: (SCREEN.right.x * v.x + SCREEN.up.x * v.y) * r,
    z: (SCREEN.right.z * v.x + SCREEN.up.z * v.y) * r,
  };
}
export const MARK_NAMES = ['C', ...BM.DIRS];

/* --------------------------------- the hall ------------------------------- */

/* ONE FLOOR EACH, IN HER COLOUR. Richard: "For the daily/weekly kata, let's
   only show the kata area for active players. Let's section each area off
   with the players color and symbolism, so they know which area is for them,
   if the other players are not active and not in the simulation, then their
   area should be disabled or grayed out, and shouldn't become active until
   they enter the simulation area. The player can only use the area that is
   designated to them with their colors."

   Floor k is SEAT k's — the same rule the tubes keep — and it wears whoever
   sits there: her colour from her style, and her element as its kanji,
   炎 氷 雷 花. A cat this table does not know gets her seat's number. */
export const FLOOR_KANJI = { Ember: '炎', Frost: '氷', Storm: '雷', Blossom: '花' };
/** The name plate and the two kiosks stand BELOW the floor on the screen —
 *  across the top is his, and the run's camera looks up the floor at him. */
const PLATE_D = FLOOR_R + 2.6;
const KIOSK_D = 7.6;
/** Where her run's camera sits: centred a little up the floor, toward him.
 *  33.5, not 31: at 31 (1024x576, measured in NDC) her card's foot was at
 *  -0.84 under the controls strip at -0.82, with his sword at 0.75 against
 *  the HUD at ~0.82 — no room to aim up, so the lens backs off its own ray. */
export const KATA_CAM = { dist: 33.5, pitch: 0.78, up: 1.6, y: 1.2 };

export class KataHall {
  constructor(dream, isle) {
    this.dream = dream;
    this.isle = isle;
    this.floors = [];
    this.kiosks = [];
    /** The tour lights every floor in its seat's own colour (`showAll`). */
    this.showAll = false;
    const f = isle.fwd;
    for (let k = 0; k < 4; k++) {
      // Four floors round the middle, at the corners, so the bridge lands
      // between two of them rather than on one.
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      const ox = Math.cos(a) * 11;
      const oz = Math.sin(a) * 11;
      const fl = {
        k,
        x: isle.x + f.x * ox - f.z * oz,
        z: isle.z + f.z * ox + f.x * oz,
        y: isle.y,
      };
      fl.out = { x: (fl.x - isle.x) / 11, z: (fl.z - isle.z) / 11 };
      fl.kiosks = [];
      this._buildFloor(fl);
      this.floors.push(fl);
      const at = (dir) => { const o = markOffset(dir, KIOSK_D); return { x: fl.x + o.x, z: fl.z + o.z }; };
      const play = new Kiosk(dream, {
        ...at('SW'), y: isle.y, r: 1.6, colour: HOLO.cyan,
        kanji: '型', title: 'KATA TRACE', near: 5,
        card: (p) => (this.ownerOf(fl) === p ? this._card(p) : this._notYours(p, fl)),
        prompt: (p, key) => (this.ownerOf(fl) !== p ? this._yoursIs(p, fl).toUpperCase() : `[${key}]  PICK A SONG`),
        interact: (p) => this.openPicker(p, fl),
      });
      const edit = new Kiosk(dream, {
        ...at('SE'), y: isle.y, r: 1.6, colour: HOLO.magenta,
        kanji: '譜', title: 'BEAT MAPS', near: 5,
        card: (p) => (this.ownerOf(fl) === p ? this._editCard(p) : this._notYours(p, fl)),
        prompt: (p, key) => (this.ownerOf(fl) !== p ? this._yoursIs(p, fl).toUpperCase() : `[${key}]  OPEN THE BEAT-MAP EDITOR`),
        interact: (p) => this.openEditor(p, fl),
      });
      for (const kiosk of [play, edit]) { this.kiosks.push(kiosk); fl.kiosks.push(kiosk); }
    }
    this.stations = this.kiosks.map((k) => k.station);
    dream.sim.tickers.push((dt) => this.update(dt));
  }

  /** The nine marks, his five spots, the floor's edge, and its name plate —
   *  painted for its owner by `_paint`. */
  _buildFloor(fl) {
    const g = new THREE.Group();
    g.position.set(fl.x, fl.y + 0.04, fl.z);
    const mat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, toneMapped: false, depthWrite: false });
    fl.fill = new THREE.Mesh(new THREE.CircleGeometry(FLOOR_R, 64).rotateX(-Math.PI / 2), mat(HOLO.cyan, 0.1));
    fl.fill.position.y = -0.01;
    g.add(fl.fill);
    fl.edge = new THREE.Mesh(new THREE.RingGeometry(FLOOR_R - 0.35, FLOOR_R, 64).rotateX(-Math.PI / 2), mat(HOLO.cyan, 0.75));
    g.add(fl.edge);
    fl.marks = MARK_NAMES.map((name, i) => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.9, 32).rotateX(-Math.PI / 2), mat(i ? HOLO.cyan : HOLO.gold, 0.55));
      const o = markOffset(name);
      ring.position.set(o.x, 0.01, o.z);
      g.add(ring);
      return ring;
    });
    const pts = [];
    for (const d of BM.DIRS) {
      const o = markOffset(d, MARK_R * 0.74);
      pts.push(new THREE.Vector3(0, 0, 0), new THREE.Vector3(o.x, 0, o.z));
    }
    fl.spokes = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: HOLO.cyan, transparent: true, opacity: 0.25, toneMapped: false }));
    g.add(fl.spokes);
    // His five spots: where he can be standing, so a jump from one to the next reads as a move.
    fl.spots = BM.LION_SPOTS.map((s) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.1, 32).rotateX(-Math.PI / 2), mat(HOLO.gold, 0.3));
      const o = markOffset(s, LION_D);
      m.position.set(o.x, 0.01, o.z);
      g.add(m);
      return m;
    });
    this.dream.sim.root.add(g);
    fl.group = g;
    fl.plate = new HoloPanel({ w: 4.4, h: 1.7, px: 80 });
    const po = markOffset('S', PLATE_D);
    fl.plate.position.set(fl.x + po.x, fl.y + 1.6, fl.z + po.z);
    this.dream.sim.root.add(fl.plate);
    fl.paintKey = null;
  }

  /** Whose floor this is: the kitten in seat `fl.k`, if she is in the simulator. */
  ownerOf(fl) {
    const p = this.dream.game.players?.[fl.k];
    return p && this.dream.realmOf(p) === 'sim' ? p : null;
  }

  /** Her floor's look, in words: "the orange 炎 one". */
  _floorWords(p) {
    const name = p.style?.name ?? p.name;
    const kj = FLOOR_KANJI[name] ?? String(p.index + 1);
    return `the ${colourWord(p.style?.colour)} ${kj} one`;
  }

  /** The refusal, as an instruction (non-negotiable 6). */
  _yoursIs(p, fl) {
    const seat = this.dream.game.players?.[fl.k];
    const whose = seat ? `${seat.style?.name ?? seat.name}'s` : `player ${fl.k + 1}'s`;
    return `This is ${whose} floor — yours is ${this._floorWords(p)}`;
  }

  _notYours(p, fl) {
    const seat = this.dream.game.players?.[fl.k];
    return [
      { text: '型 KATA FLOOR', size: 1.8, color: KIOSK_OFF, jp: true },
      { text: `${seat ? (seat.style?.name ?? seat.name) : `PLAYER ${fl.k + 1}`}'S`, size: 1.4 },
      { text: `yours is ${this._floorWords(p)}`, size: 1.2, color: p.style?.colour ?? HOLO.cyan },
    ];
  }

  /** Paint a floor for its owner, or grey it out. Only on a change. */
  _paint(fl) {
    const p = this.ownerOf(fl);
    const seat = this.dream.game.players?.[fl.k];
    const show = this.showAll ? PLAYER_STYLE[fl.k] : null;
    const lit = !!(p || show);
    const colour = show ? show.colour : p ? (p.style?.colour ?? HOLO.cyan) : KIOSK_OFF;
    const name = show ? show.name : seat ? (seat.style?.name ?? seat.name) : null;
    const key = `${lit}|${colour}|${name}`;
    if (key === fl.paintKey) return;
    fl.paintKey = key;
    fl.lit = lit;
    fl.fill.material.color.set(colour);
    fl.fill.material.opacity = lit ? 0.12 : 0.05;
    fl.edge.material.color.set(colour);
    fl.edge.material.opacity = lit ? 0.85 : 0.3;
    fl.spokes.material.color.set(colour);
    fl.spokes.material.opacity = lit ? 0.3 : 0.12;
    fl.marks.forEach((m, i) => {
      m.material.color.set(lit ? (i ? colour : HOLO.gold) : KIOSK_OFF);
      m.material.opacity = lit ? 0.6 : 0.2;
    });
    for (const s of fl.spots) s.material.color.set(lit ? HOLO.gold : KIOSK_OFF);
    for (const k of fl.kiosks) k.setLit(lit);
    const kj = (name && FLOOR_KANJI[name]) ?? String(fl.k + 1);
    fl.plate.set(lit ? [
      { text: `${kj}  ${name.toUpperCase()}`, size: 2.0, color: colour, glow: true, jp: true },
      { text: `player ${fl.k + 1}'s kata floor`, size: 1.1 },
    ] : [
      { text: `${kj}  ${name ? name.toUpperCase() : `PLAYER ${fl.k + 1}`}`, size: 2.0, color: KIOSK_OFF, jp: true },
      { text: name ? 'opens when she comes in' : 'nobody in this seat', size: 1.1, color: KIOSK_OFF },
    ], colour);
    fl.plate.mat.opacity = lit ? 1 : 0.5;
  }

  /** A mark of a floor, in the layer. `i` is an index into MARK_NAMES or a name. */
  markAt(fl, i) {
    const o = markOffset(typeof i === 'number' ? MARK_NAMES[i] : i);
    return { x: fl.x + o.x, y: fl.y, z: fl.z + o.z };
  }

  _name(p) { return p.style?.name ?? p.name; }

  /* ------------------------------ the picker ------------------------------ */

  /** What she last chose — kept on her for the visit, so a second go is one press. */
  pickOf(p) {
    p._kataPick ??= { song: 'vr', diff: 'normal', speed: 1, custom: null };
    return p._kataPick;
  }

  _starsFor(p, song, diff) {
    return this.dream.progress.stars(this._name(p), BM.chartId({ song, difficulty: diff }));
  }

  _card(p) {
    const k = this.pickOf(p);
    const S = BM.songById(k.song);
    return [
      { text: '型 KATA TRACE', size: 1.9, color: HOLO.cyan, glow: true, jp: true },
      { text: 'Lionheart attacks on the beat — dodge him!', size: 1.1, color: 0x9fefff },
      { text: `last: ${S?.name ?? k.song} · ${BM.DIFFS[k.diff].name} · ${k.speed}×`, size: 1.05 },
      { text: stars3(this._starsFor(p, k.song, k.diff)), size: 1.4, color: HOLO.gold },
    ];
  }

  _editCard() {
    return [
      { text: '譜 BEAT MAPS', size: 1.9, color: HOLO.magenta, glow: true, jp: true },
      { text: 'write your own Lionheart routine', size: 1.1, color: 0x9fefff },
      { text: 'any song · save it · share it as JSON', size: 1.05 },
    ];
  }

  /**
   * THE SONG PICKER: a card beside her, driven by her own stick (HoloChoice).
   * ▲▼ picks a row, ◀▶ changes it. Nothing on it is irreversible, so it
   * opens on DANCE — what she walked up to press.
   */
  openPicker(p, fl) {
    if (this.ownerOf(fl) !== p) {
      this.dream.hint(p, this._yoursIs(p, fl));
      this.dream.game.sfx?.('deny');
      return false;
    }
    const k = this.pickOf(p);
    const songs = BM.SONGS;
    const cyc = (list, cur, s) => list[(list.indexOf(cur) + s + list.length) % list.length];
    const customs = () => customCharts().filter((c) => c.chart.song === k.song);
    const custom = () => customs().find((c) => c.id === k.custom) ?? null;
    const rows = [
      {
        text: () => { const S = BM.songById(k.song); return `SONG  ◀ ${S.name} · ${Math.round(S.bpm * k.speed)} BPM ▶`; },
        cycle: (s) => { k.song = cyc(songs.map((x) => x.id), k.song, s); k.custom = null; },
      },
      {
        text: () => {
          const c = custom();
          const d = c ? c.chart.difficulty : k.diff;
          return `LEVEL  ◀ ${BM.DIFFS[d].name} ${c ? '(its own)' : stars3(this._starsFor(p, k.song, d))} ▶`;
        },
        cycle: (s) => {
          // Refused in words: a custom chart was written for one level.
          if (custom()) { this.dream.hint(p, 'A custom chart has its own level — pick CHART: Lionheart\'s to change it'); this.dream.game.sfx?.('deny'); return; }
          k.diff = cyc(BM.DIFF_IDS, k.diff, s);
        },
      },
      {
        text: () => `SPEED  ◀ ${k.speed}× ▶`,
        cycle: (s) => { k.speed = cyc(BM.SPEEDS, k.speed, s); },
      },
      {
        text: () => { const c = custom(); return `CHART  ◀ ${c ? c.chart.title : "Lionheart's"} ▶`; },
        cycle: (s) => {
          const ids = [null, ...customs().map((c) => c.id)];
          if (ids.length === 1) { this.dream.hint(p, 'No custom charts for this song yet — make one at the 譜 BEAT MAPS kiosk'); this.dream.game.sfx?.('deny'); return; }
          k.custom = cyc(ids, k.custom, s);
        },
      },
      { text: '▶ DANCE!', act: () => this.begin(p, fl) },
      { text: 'not now', dim: true, act: () => this.dream.closeChoice(p) },
    ];
    this.dream.openChoice(p, { title: '型 KATA TRACE', rows, start: 4 });
    return true;
  }

  openEditor(p, fl) {
    if (this.ownerOf(fl) !== p) {
      this.dream.hint(p, this._yoursIs(p, fl));
      this.dream.game.sfx?.('deny');
      return false;
    }
    const ed = this.dream.game.kataEditor;
    if (!ed) { this.dream.hint(p, 'The beat-map editor is not in this build'); this.dream.game.sfx?.('deny'); return false; }
    const k = this.pickOf(p);
    ed.open(p, { song: k.song, difficulty: k.diff, custom: k.custom, speed: k.speed });
    return true;
  }

  /** DANCE: the chart she picked, at the speed she picked, on her floor. */
  begin(p, fl) {
    if (this.ownerOf(fl) !== p) {
      this.dream.hint(p, this._yoursIs(p, fl));
      this.dream.game.sfx?.('deny');
      return false;
    }
    const k = this.pickOf(p);
    const c = k.custom ? customCharts().find((x) => x.id === k.custom) : null;
    const chart = c ? c.chart : BM.generateChart(k.song, k.diff);
    const id = BM.chartId(chart, !!c);
    this.dream.startDrill(p, KATA(this, fl, chart, { speed: k.speed, id, custom: !!c }),
      { x: fl.x, y: fl.y, z: fl.z, r: KIOSK_D + 2.2, fwd: { x: 0, z: 1 } });
    return true;
  }

  /** Her run, if she has one on this hall. */
  runOf(p) {
    const d = this.dream.drills?.[p?.index];
    return d?.spec?.kataFloor ? d : null;
  }

  /** HER CAMERA DURING A RUN: the floor and him, from the usual angle. */
  cameraFocus(p) {
    const d = this.runOf(p);
    if (!d) return null;
    const fl = d.spec.kataFloor;
    const f = (d.camFocus ??= { centre: new THREE.Vector3(), aim: true, dist: KATA_CAM.dist, pitch: KATA_CAM.pitch });
    f.centre.set(fl.x + SIM.dx + SCREEN.up.x * KATA_CAM.up, fl.y + KATA_CAM.y, fl.z + SIM.dz + SCREEN.up.z * KATA_CAM.up);
    return f;
  }

  /** The song the music should be playing, or null: the run that owns it. */
  musicTrack() {
    const d = this.musicOwner;
    if (!d || (d.state !== 'ready' && d.state !== 'live')) return null;
    return d.chart.song;
  }

  update(dt) {
    for (const fl of this.floors) this._paint(fl);
    const inside = idleIn(this.dream);
    for (const k of this.kiosks) k.update(dt, inside);
  }

  faceCamera(camera) {
    for (const k of this.kiosks) k.faceCamera(camera);
    for (const fl of this.floors) fl.plate.faceCamera(camera);
  }
}

/** A colour, in a word a nine-year-old would use for it: the hue's nearest name. */
export function colourWord(hex) {
  if (hex == null) return 'blue';
  const c = new THREE.Color(hex);
  const hsl = {};
  // In sRGB, the space the colour was picked in: the linear working space calls Ember red.
  c.getHSL(hsl, THREE.SRGBColorSpace);
  if (hsl.s < 0.15) return 'grey';
  const h = hsl.h * 360;
  const names = [[15, 'red'], [45, 'orange'], [70, 'yellow'], [160, 'green'], [200, 'teal'], [250, 'blue'], [290, 'purple'], [345, 'pink'], [360, 'red']];
  return names.find(([top]) => h < top)[1];
}

/* -------------------------------- the stage -------------------------------- */

/**
 * WHAT A RUN LOOKS LIKE ON ONE FLOOR, as a pure function of the song's time:
 * Lionheart on his spot and in his pose, the marks about to be struck going
 * red with a ring closing on each, the blow's flash, and the beat. The drill
 * and the tour's four floors both draw with this, so the tour shows exactly
 * what a run looks like — and since it is a function of time and not of
 * events, the tour's lens can scrub it.
 */
export class KataStage {
  constructor(dream, parent, fl) {
    this.dream = dream;
    this.fl = fl;
    this.group = new THREE.Group();
    this.group.position.set(fl.x, fl.y, fl.z);
    parent.add(this.group);
    const add = (geo, colour, o, y = 0.06) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: colour, transparent: true, opacity: o, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      m.position.y = y;
      m.renderOrder = 6;
      this.group.add(m);
      return m;
    };
    const disc = new THREE.CircleGeometry(0.88, 32).rotateX(-Math.PI / 2);
    const ring = new THREE.RingGeometry(0.9, 1.08, 40).rotateX(-Math.PI / 2);
    this.discs = MARK_NAMES.map((n) => { const m = add(disc, RED, 0); const o = markOffset(n); m.position.x = o.x; m.position.z = o.z; return m; });
    this.rings = MARK_NAMES.map((n) => { const m = add(ring, RED, 0, 0.08); const o = markOffset(n); m.position.x = o.x; m.position.z = o.z; return m; });
    this.sweepRing = add(new THREE.RingGeometry(FLOOR_R - 0.25, FLOOR_R + 0.15, 72).rotateX(-Math.PI / 2), RED, 0, 0.09);
    this.sweepFlash = add(new THREE.CircleGeometry(FLOOR_R, 64).rotateX(-Math.PI / 2), 0xffffff, 0, 0.05);
    const bar = (len) => new THREE.PlaneGeometry(1.1, len).rotateX(-Math.PI / 2);
    this.cutBar = add(bar(LION_D * 2), 0xffffff, 0, 0.1);
    this.crossBars = [add(bar(FLOOR_R * 2.3), 0xffffff, 0, 0.1), add(bar(FLOOR_R * 2.3), 0xffffff, 0, 0.11)];
    this.pulse = add(new THREE.RingGeometry(0.95, 1.2, 40).rotateX(-Math.PI / 2), HOLO.gold, 0, 0.07);
    this.lion = new THREE.Group();
    this.group.add(this.lion);
    this.posed = false;
    this.sprite = null;
    this.pose = POSE.guard;
    this._dress();
    this.chart = null;
  }

  /** His own four-pose sheet, as soon as it has loaded; a column of light before. */
  _dress() {
    const art = this.dream.game?.shadowArt ?? null;
    if (this.posed || (this.sprite && !art?.texture)) return;
    if (this.sprite) { this.sprite.removeFromParent(); this.sprite.mat?.dispose?.(); }
    if (art?.texture) {
      const quad = SHADOW_H / (art.contentScale || 1);
      this.sprite = new Billboard(art.texture, { cols: art.cols ?? 4, rows: 1, width: quad, height: quad, footOffset: (art.pad ?? 0) * quad, mirror: false });
      // Lionheart's gold, not the Shadow's purple: it is HIM, using the Shadow's moves.
      this.sprite.mat.color.set(0xffe2a0);
      this.sprite.mat.transparent = true;
      this.sprite.mat.opacity = 0.92;
      this.posed = (art.cols ?? 1) >= 4;
    } else {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, SHADOW_H * 0.8, 12).translate(0, SHADOW_H * 0.4, 0),
        new THREE.MeshBasicMaterial({ color: HOLO.gold, transparent: true, opacity: 0.45, toneMapped: false }));
      this.sprite = m;
    }
    this.lion.add(this.sprite);
  }

  /** The chart, and the seconds a beat lasts at this run's speed. */
  set(chart, spb) {
    this.chart = chart;
    this.spb = spb;
    this.attacks = BM.resolveChart(chart).map((a) => ({ ...a, hitT: a.beat * spb, tellT: (a.beat - a.tell) * spb }));
    this.lionMoves = BM.sortedEvents(chart.events).filter((e) => e.lion).map((e) => ({ t: e.beat * spb, spot: e.lion }));
  }

  /** Where he is at `t`: his spot, sliding from the last one over a quarter beat. */
  lionAt(t) {
    let from = BM.LION_START;
    let to = BM.LION_START;
    let t0 = -1;
    for (const m of this.lionMoves ?? []) {
      if (m.t > t) break;
      from = to;
      to = m.spot;
      t0 = m.t;
    }
    const a = markOffset(from, LION_D);
    const b = markOffset(to, LION_D);
    const k = t0 < 0 ? 1 : Math.min(1, (t - t0) / Math.max(0.08, this.spb * 0.25));
    const e = k * k * (3 - 2 * k);
    return { x: a.x + (b.x - a.x) * e, z: a.z + (b.z - a.z) * e, spot: to, moving: k < 1 };
  }

  /** Draw the floor at song time `t` (seconds; may be negative in the count-in). */
  update(t, live = true) {
    this._dress();
    const heat = new Array(9).fill(0);
    const close = new Array(9).fill(null);
    let sweep = 0;
    let sweepK = null;
    let pose = POSE.guard;
    let flashCut = null;
    let flashCross = null;
    let flashSweep = 0;
    for (const a of live ? this.attacks ?? [] : []) {
      if (t < a.tellT || t > a.hitT + 0.35) continue;
      const k = Math.min(1, (t - a.tellT) / Math.max(0.05, a.hitT - a.tellT));
      if (t <= a.hitT) {
        pose = POSE[a.attack === 'cut' ? 'slam' : a.attack] ?? POSE.guard;
        if (a.attack === 'sweep') {
          sweep = Math.max(sweep, k);
          if (sweepK == null || k > sweepK) sweepK = k;
        } else {
          for (const m of BM.hitMarks(a.attack, a.spot)) {
            const i = MARK_NAMES.indexOf(m);
            heat[i] = Math.max(heat[i], k);
            if (close[i] == null || k > close[i]) close[i] = k;
          }
        }
      } else {
        const f = 1 - (t - a.hitT) / 0.35;
        pose = POSE[a.attack === 'cut' ? 'slam' : a.attack] ?? POSE.guard;
        if (a.attack === 'cut') flashCut = { f, spot: a.spot };
        else if (a.attack === 'cross') flashCross = { f, spot: a.spot };
        else flashSweep = Math.max(flashSweep, f);
      }
    }
    this.discs.forEach((m, i) => { m.material.opacity = heat[i] > 0 ? 0.12 + 0.5 * heat[i] : 0; });
    this.rings.forEach((m, i) => {
      const k = close[i];
      m.visible = k != null;
      if (k == null) return;
      m.scale.setScalar(1 + (1 - k) * 1.8);
      m.material.opacity = 0.35 + 0.6 * k;
    });
    this.sweepRing.visible = sweep > 0;
    if (sweep > 0) {
      this.sweepRing.scale.setScalar(1 + (1 - sweepK) * 0.45);
      this.sweepRing.material.opacity = 0.3 + 0.65 * sweep;
      // Every mark warms a little too: a sweep is everywhere, and the floor says so.
      this.discs.forEach((m, i) => { m.material.opacity = Math.max(m.material.opacity, 0.25 * sweep); });
    }
    this.sweepFlash.material.opacity = flashSweep * 0.35;
    this.cutBar.visible = !!flashCut;
    if (flashCut) {
      const o = markOffset(flashCut.spot, 1);
      this.cutBar.rotation.y = Math.atan2(o.x, o.z);
      this.cutBar.material.opacity = flashCut.f * 0.9;
    }
    for (const [j, b] of this.crossBars.entries()) {
      b.visible = !!flashCross;
      if (!flashCross) continue;
      const o = markOffset(flashCross.spot, 1);
      b.rotation.y = Math.atan2(o.x, o.z) + (j ? -1 : 1) * Math.PI / 4;
      b.material.opacity = flashCross.f * 0.9;
    }
    // The beat: a gold ring off the middle mark on every one.
    const beat = this.spb ? t / this.spb : 0;
    const ph = beat - Math.floor(beat);
    this.pulse.visible = live && t >= 0;
    this.pulse.scale.setScalar(1 + ph * 0.6);
    this.pulse.material.opacity = (1 - ph) * 0.55;
    const L = this.lionAt(t);
    this.lion.position.set(L.x, 0, L.z);
    this.pose = pose;
    this.lionSpot = L.spot;
  }

  faceCamera(camera) {
    if (!this.sprite?.faceCamera) return;
    this.sprite.faceCamera(camera);
    if (this.posed) this.sprite._setCell(this.pose, 0, false);
  }

  dispose() {
    this.group.removeFromParent();
    this.sprite?.mat?.dispose?.();
  }
}

/**
 * WHERE A PERFECT KITTEN IS at song time `t`, dancing `BM.route`: the mark,
 * dashed to over a tenth of a second, and her lift off a jump pressed just
 * before each sweep. The tour's holo-kittens are put here every frame.
 * Returns a layer offset from the floor's middle, and `y`.
 */
export function routeAt(rt, t, spb) {
  let from = 'C';
  let to = 'C';
  let t0 = -1;
  for (const m of rt?.moves ?? []) {
    // Each move lands a hair before its beat, the way a PERFECT one does.
    const mt = m.beat * spb - 0.04;
    if (mt > t) break;
    from = to;
    to = m.to;
    t0 = mt;
  }
  const a = markOffset(from);
  const b = markOffset(to);
  const k = t0 < 0 ? 1 : Math.min(1, (t - t0) / 0.1);
  let y = 0;
  for (const j of rt?.jumps ?? []) {
    const s = t - (j.beat * spb - 0.18);
    if (s >= 0 && s <= 0.62) y = Math.max(y, Math.sin((s / 0.62) * Math.PI) * 2.2);
  }
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, y, at: to };
}

/* --------------------------------- the drill ------------------------------ */

/* ACCURACY IS OVER THE BLOWS SHE HAD TO DODGE. A blow that lands where she
   was already standing safe is GOOD on the card and in the score, but not in
   the percentage: the first cut graded those as a 1-in-3 in it, and a run that
   danced the solver's own route — every step on its beat, never touched —
   came out at 71% and two stars, because the charts have such blows in them
   and the right answer to one is to stand still. Hits always count. */
const accuracy = (gs) => (gs.length ? Math.round((100 * gs.reduce((a, b) => a + b, 0)) / (3 * gs.length)) : 100);
const count = (gs, g) => gs.filter((x) => x === g).length;
/** The multiplier a combo is worth: x2 at 10, x3 at 20, x4 at 30. */
export const comboMult = (c) => 1 + Math.min(3, Math.floor(c / 10));

/**
 * A blow, judged. Pure, so world-check can ask it directly.
 *   a      the attack (resolveChart's, with hitT)
 *   at     the mark she is on
 *   moveT  when she last stepped (song seconds), or null
 *   jumpT  when she last pressed jump, or null
 * Returns 0 (hit) to 3 (PERFECT).
 */
export function judgeBlow(a, at, moveT, jumpT, spb) {
  const sweep = a.attack === 'sweep';
  const safe = sweep
    ? jumpT != null && jumpT >= a.hitT - AIR && jumpT <= a.hitT + LATE
    : !BM.hitMarks(a.attack, a.spot).has(at);
  if (!safe) return 0;
  const ta = sweep ? jumpT : moveT;
  // Standing somewhere already safe since before the warning: GOOD, and only that.
  if (ta == null || ta < a.hitT - a.tell * spb - 0.05) return 1;
  const off = Math.abs(ta - a.hitT);
  return off <= GRADE_T[0] ? 3 : off <= GRADE_T[1] ? 2 : 1;
}

/** A blow she never had to move for: not a sweep, and no step since before its warning. */
export function freeBlow(a, moveT, spb) {
  return a.attack !== 'sweep' && (moveT == null || moveT < a.hitT - a.tell * spb - 0.05);
}

export function KATA(hall, fl, chart, { speed = 1, id, custom = false } = {}) {
  const D = BM.DIFFS[chart.difficulty] ?? BM.DIFFS.normal;
  const S = BM.songById(chart.song) ?? BM.songById('play');
  const spb = S.spb / speed;
  const endT = chart.beats * spb;
  const dream = hall.dream;
  const sfx = (n) => dream.game.sfx?.(n);
  return {
    id,
    title: `${chart.title} · ${speed}×`,
    kanji: '型',
    goalText: 'Dodge Lionheart — step on the beat!',
    score: (d) => d.acc,
    lowerIsBetter: false,
    bands: KATA_BANDS,
    kataFloor: fl,
    grace: 2.0,
    leaveR: KIOSK_D + 2.2,
    setup(d) {
      d.chart = chart;
      d.speed = speed;
      d.custom = custom;
      d.at = 'C';
      d.moveT = null;
      d.jumpT = null;
      d.songT = 0;
      d.armed = false;
      d.lives = D.lives;
      d.score = 0;
      d.combo = 0;
      d.maxCombo = 0;
      d.grades = [];
      d.judged = [];
      d.next = 0;
      d.flashG = null;
      d.flashT = 0;
      d.lastBeat = -1;
      d.stage = new KataStage(dream, d.root, fl);
      d.stage.set(chart, spb);
      d.attacks = d.stage.attacks;
      d.acc = 0;
      /* HER CARD STANDS WHERE HER NAME PLATE DOES, larger. Over her head (the
         drill's usual place) it was a postage stamp at KATA_CAM's distance —
         SCORE unreadable at 1024x576 — and scaled up there it would have
         covered the marks above her, the ones his blows come from. Under the
         floor nothing she has to watch is behind it. */
      const po = markOffset('S', PLATE_D);
      d.panel.removeFromParent();
      d.panel.position.set(fl.x + po.x, fl.y + 1.9, fl.z + po.z);
      d.panel.scale.setScalar(1.45);
      dream.sim.root.add(d.panel);
      fl.plate.visible = false;
      dream.hint(d.p, 'Lionheart turns the floor red where he will strike — step off it ON the beat. Back through the middle to change side!');
    },
    /* GO: the song from its first step, at her speed — if nobody else's run
       has the music. The first beat of the song is the first beat of the run. */
    start(d) {
      const audio = dream.game.audio;
      const owner = hall.musicOwner;
      // Music turned off means off (`Game._updateMusic`): the metronome keeps her beat instead.
      const muted = !(audio?.musicVolume > 0);
      if (muted) return;
      if (!owner || (owner.state !== 'live' && owner.state !== 'ready') || owner === d) {
        const at = audio?.restartMusic?.(chart.song, speed);
        if (at != null) {
          hall.musicOwner = d;
          d.ownsMusic = true;
          d.songT = audio.ctx.currentTime - at;
        }
      } else {
        dream.hint(d.p, `The music is following ${owner.p.name}'s run — yours keeps its own beat: listen for the tick`);
      }
    },
    /* HER STICK MOVES HER BETWEEN MARKS, and nothing else does: she gets a
       pad with the stick let go and only JUMP still connected. A push is an
       EDGE — it has to come back under 0.35 before it can step again, so a
       stick held over does not walk her across the floor and back. */
    steer(d, pad) {
      if (d.state !== 'live' && d.state !== 'ready') return null;
      const mx = pad.mx ?? 0;
      const my = pad.my ?? 0;
      const mag = Math.hypot(mx, my);
      if (mag < 0.35) d.armed = true;
      else if (mag > 0.6 && d.armed) {
        d.armed = false;
        if (d.state === 'live') {
          const to = BM.stepFrom(d.at, BM.stickDir(mx, my));
          if (to) { d.at = to; d.moveT = d.songT; }
        }
      }
      if (d.state === 'live' && pad.pressed?.('jump')) d.jumpT = d.songT;
      // Read through `d.pad`, so the still pad is always this frame's.
      d.pad = pad;
      return d.stillPad ??= {
        mx: 0, my: 0,
        down: (a) => a === 'jump' && !!d.pad?.down?.(a),
        pressed: (a) => a === 'jump' && !!d.pad?.pressed?.(a),
        consume: (a) => d.pad?.consume?.(a),
      };
    },
    /* Every frame, in every state: where she stands, and the floor drawn. */
    always(d, dt) {
      const p = d.p;
      const o = markOffset(d.at);
      const tx = fl.x + o.x + SIM.dx;
      const tz = fl.z + o.z + SIM.dz;
      // Glide on in the count-in; snap between marks in the run — a step is a dash.
      const k = 1 - Math.exp(-dt * (d.state === 'live' ? 26 : 5));
      if (d.state === 'ready' || d.state === 'live') {
        p.position.x += (tx - p.position.x) * k;
        p.position.z += (tz - p.position.z) * k;
        if (p.velocity) { p.velocity.x = 0; p.velocity.z = 0; }
        const L = d.stage.lionAt(d.songT);
        p.facing = Math.atan2(fl.x + L.x + SIM.dx - p.position.x, fl.z + L.z + SIM.dz - p.position.z);
      }
      d.stage.update(d.state === 'live' ? d.songT : 0, d.state === 'live');
      if (d.ownsMusic && d.state !== 'live' && d.state !== 'ready') release(d);
    },
    tick(d, dt) {
      d.songT += dt;
      if (d.ownsMusic) keepTime(d, dream, S, spb, dt);
      const beat = Math.floor(d.songT / spb);
      if (beat > d.lastBeat) {
        d.lastBeat = beat;
        // Without the music under her, a tick on every beat to step to.
        if (!d.ownsMusic && d.songT < endT) sfx(beat % 4 ? 'beat' : 'beatup');
      }
      while (d.next < d.attacks.length && d.songT >= d.attacks[d.next].hitT + LATE) {
        const a = d.attacks[d.next++];
        judge(d, a, judgeBlow(a, d.at, d.moveT, d.jumpT, spb), freeBlow(a, d.moveT, spb), hall, fl);
        if (d.state !== 'live') return;
      }
      d.flashT = Math.max(0, d.flashT - dt);
      if (d.songT >= endT && d.next >= d.attacks.length) {
        d.acc = accuracy(d.judged);
        d.win();
        d.endT = 7;
      }
    },
    paint(d) {
      const hearts = '♥'.repeat(Math.max(0, d.lives)) + '♡'.repeat(Math.max(0, D.lives - d.lives));
      if (d.state === 'won' || d.state === 'failed') {
        const won = d.state === 'won';
        return [
          { text: won ? `${stars3(d.stars_ ?? 1)}  ${d.result?.gained ? 'NEW BEST!' : 'CLEAR!'}` : 'CAUGHT!', size: 1.9, color: won ? HOLO.gold : 0xff8a8a, glow: true },
          { text: `SCORE ${d.score.toLocaleString('en-US')}`, size: 1.7, color: HOLO.gold },
          { text: `${d.acc}% · best combo ${d.maxCombo} · ${count(d.grades, 3)} perfect · ${count(d.grades, 0)} hit`, size: 1.0 },
          { text: won ? `${chart.title} · ${speed}×` : (d.why ?? ''), size: 0.95, color: won ? 0x9fefff : 0xff8a8a },
        ];
      }
      if (d.state === 'ready') {
        return [
          { text: `型 ${chart.title}`, size: 1.6, color: d.colour, glow: true, jp: true },
          { text: `${D.name} · ${speed}× · ${hearts}`, size: 1.3 },
          { text: 'GET READY — to the middle…', size: 1.5, color: HOLO.gold },
        ];
      }
      const g = d.flashT > 0 ? GRADE[d.flashG] : null;
      const live = d.attacks.filter((a) => d.songT >= a.tellT && d.songT <= a.hitT);
      const jump = live.some((a) => a.attack === 'sweep');
      const key = `[${dream.key?.(d.p, 'interact') ?? 'E'}]`;
      return [
        g ? { text: g.word, size: 2.0, color: g.color, glow: true }
          : jump ? { text: 'JUMP!', size: 2.0, color: RED, glow: true }
            : { text: d.combo >= 3 ? `${d.combo} COMBO` : '型', size: 2.0, color: d.combo >= 10 ? HOLO.gold : d.colour, glow: true, jp: true },
        { text: `${hearts}   ${d.score.toLocaleString('en-US')}${comboMult(d.combo) > 1 ? `  ×${comboMult(d.combo)}` : ''}`, size: 1.4, color: HOLO.cyan },
        { text: `${key} to stop`, size: 0.8, color: 0x7f9fa8 },
      ];
    },
    doneText: (d) => `${d.score} · ${d.acc}%`,
    /** INTERACT mid-run: are you sure? Default no, and both buttons say what they do (6, 7). */
    quit(d) {
      if (dream.choices?.[d.p.index]) return;
      dream.openChoice(d.p, {
        title: 'STOP DANCING?',
        rows: [
          { text: 'no, keep dancing', act: () => dream.closeChoice(d.p) },
          { text: 'yes, stop — no score', act: () => { dream.closeChoice(d.p); d.fail('Stopped — no score this time'); } },
        ],
      });
    },
    face(d, camera) {
      d.stage.faceCamera(camera);
    },
    dispose(d) {
      release(d);
      fl.plate.visible = true;
      d.stage.dispose();
    },
  };

  function release(d) {
    if (!d.ownsMusic) return;
    d.ownsMusic = false;
    if (hall.musicOwner === d) hall.musicOwner = null;
    // The next piece starts at its own tempo; the same piece must slow back down too.
    if (dream.game.audio) dream.game.audio.musicRate = 1;
  }
}

/**
 * KEEP THE SONG ON THE RUN'S BEAT. The song's steps are on the audio clock
 * and the run is on the game's; anything that stops one and not the other —
 * the pause menu, a hidden tab — leaves them out of step. Every quarter of a
 * second this measures where the song's next chart-beat falls against where
 * the run thinks it should, and if they are more than 50ms apart pushes the
 * song LATER until they agree (`shiftMusic`: never earlier — a note in the
 * past is played at once). At worst, after a pause, a beat's silence.
 */
function keepTime(d, dream, S, spb, dt) {
  const audio = dream.game.audio;
  d.syncT = (d.syncT ?? 0) - dt;
  if (d.syncT > 0) return;
  d.syncT = 0.25;
  const grid = audio?.musicGrid?.();
  if (!grid || audio.mode !== d.chart.song) return;
  const k = S.steps;
  const onBeat = grid.next - (grid.step % k) * grid.beat;
  const g0 = grid.now - d.songT;
  const phase = (((onBeat - g0) % spb) + spb) % spb;
  const err = Math.min(phase, spb - phase);
  if (err > 0.05) audio.shiftMusic((spb - phase) % spb);
}

function judge(d, a, g, free, hall, fl) {
  const dream = hall.dream;
  d.grades.push(g);
  if (g === 0 || !free) d.judged.push(g);
  d.flashG = g;
  d.flashT = 0.5;
  dream.game.sfx?.(GRADE[g].sfx);
  const o = markOffset(d.at);
  const x = fl.x + o.x;
  const z = fl.z + o.z;
  if (g === 0) {
    d.lives--;
    d.combo = 0;
    d.p.flashT = 0.3;
    dream.shards?.burst(x, fl.y + 1.2, z, RED, 30, 4, 5);
    if (d.lives <= 0) {
      d.acc = accuracy(d.judged);
      d.fail(`Lionheart caught you ${count(d.grades, 0)} times — practise on EASY or at 0.75×`);
      d.endT = 7;
    }
    return;
  }
  d.combo++;
  d.maxCombo = Math.max(d.maxCombo, d.combo);
  d.score += Math.round(POINTS[g] * comboMult(d.combo) * d.speed);
  if (g === 3) dream.shards?.burst(x, fl.y + 0.3, z, HOLO.gold, 24, 3, 5);
}
