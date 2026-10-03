import * as THREE from 'three';
import { Billboard } from '../../core/gfx.js';
import { SIM, HOLO } from '../../world/simworld.js';
import { Kiosk, idleIn, stars3 } from './kiosk.js';
import { dayKey, weekKey } from './progress.js';

/* ---------------------------------------------------------------------------
   KATA TRACE — 型, the heart of the Dream Dojo.

   Richard's brief for the product this prototypes: a ghost Lionheart shows
   you a kata, then you do it back ON THE BEAT. So a kata is a little dance on
   nine marks — the middle of a floor and eight round it — where every step is
   a place, a beat and a move: STEP onto the mark, CUT, JUMP, or GUARD.

   A NEW ONE EVERY DAY AND EVERY WEEK, THE SAME FOR EVERYBODY. `makeKata` is a
   pure function of the date's key, so four sisters on four floors are doing
   the SAME kata today and can compare, and tomorrow's is a different one
   without anybody shipping anything. A random kata on every press was the
   obvious first shape and it is the wrong one: nobody can get better at a
   thing that changes every time they try it.

   EVERY KATA CAN BE DONE AT THE FASTEST TEMPO — measured, not hoped. Each
   step's mark is within `TRAVEL` walking-units-per-beat of the last at 120
   BPM, and `world-check` generates a year of dailies and a year of weeklies
   and walks every one of them.

   THE JUDGE IS FAIR TO A NINE-YEAR-OLD. A press is graded on how far it was
   from the beat (PERFECT / GREAT / GOOD), standing off the mark caps it at
   GOOD rather than throwing it away, and a miss is a dull thud rather than a
   buzzer (core/audio.js, `miss`). The window shrinks with the tempo so two
   beats' windows can never overlap — overlapping windows were how one press
   got counted twice on the first pass of a rhythm game everywhere.
--------------------------------------------------------------------------- */

/** The tempo tiers. Two stars on one opens the next. */
export const TEMPI = [80, 100, 120];
/** How far from the middle the ring of eight marks sits. */
export const MARK_R = 3.4;
/** How close to a mark counts as on it. */
export const ON_MARK = 1.2;
/** Units a kitten can be relied on to cover in one beat at 120 BPM. Walking
 *  is 10.5 u/s, so a beat (0.5s) is 5.25 — this leaves 30% of it for seeing
 *  the next mark and turning. */
export const TRAVEL = 3.7;
/** Grade bands, seconds off the beat. The last is capped by the window. */
export const GRADE_T = [0.10, 0.18, 0.35];
/** Accuracy (0-100) for one, two, three stars. */
export const KATA_BANDS = [50, 75, 90];

export const MOVES = {
  step: { kanji: '歩', word: 'STEP', action: null },
  cut: { kanji: '斬', word: 'CUT', action: 'attack' },
  jump: { kanji: '跳', word: 'JUMP', action: 'jump' },
  guard: { kanji: '守', word: 'GUARD', action: 'mount' },
};

/** The nine marks, as flat offsets from a floor's middle. 0 is the middle. */
export const MARKS = [{ x: 0, z: 0 }];
for (let k = 0; k < 8; k++) {
  const a = (k / 8) * Math.PI * 2;
  MARKS.push({ x: Math.cos(a) * MARK_R, z: Math.sin(a) * MARK_R });
}

const markGap = (i, j) => Math.hypot(MARKS[i].x - MARKS[j].x, MARKS[i].z - MARKS[j].z);

/* mulberry32 over an FNV-1a hash — small, fast, and the same in every
   browser, which Math.random seeded by nothing is not. */
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function rng32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * THE KATA FOR A DATE. Pure: the same `kind` and `key` give the same kata on
 * every machine. `kind` is 'daily' (8 steps: step, cut, jump) or 'weekly' (12,
 * and GUARD joins them).
 *
 * RULES THAT KEEP IT DOABLE, each one a way the first draft was not:
 *   · it starts on the middle mark with an action — she is standing there;
 *   · a STEP always goes somewhere (a "step" onto the mark she is on is a
 *     beat with nothing to do, which reads as the game skipping one);
 *   · a mark is never further than TRAVEL × gap from the last;
 *   · after a GUARD the next beat is two away — the ward roots her;
 *   · no move three times running.
 */
export function makeKata(kind, key) {
  const weekly = kind === 'weekly';
  const len = weekly ? 12 : 8;
  const pool = weekly ? ['step', 'cut', 'jump', 'guard'] : ['step', 'cut', 'jump'];
  const r = rng32(hash(`${kind}:${key}`));
  const pick = (a) => a[Math.floor(r() * a.length) % a.length];
  const steps = [{ mark: 0, move: pick(pool.filter((m) => m !== 'step')), beat: 0 }];
  for (let i = 1; i < len; i++) {
    const prev = steps[i - 1];
    const gap = prev.move === 'guard' ? 2 : (r() < 0.6 ? 1 : 2);
    const reach = MARKS.map((_, m) => m).filter((m) => markGap(prev.mark, m) <= TRAVEL * gap + 1e-6);
    // Prefer going somewhere: staying put is allowed one time in four.
    const away = reach.filter((m) => m !== prev.mark);
    const mark = r() < 0.25 ? prev.mark : pick(away);
    /* NEVER THE SAME MOVE THREE TIMES RUNNING. The first weekly drawn in the
       browser was six GUARDs out of twelve, four in a row — a kata that is
       one button held is not a kata. */
    const twice = i >= 2 && steps[i - 2].move === prev.move ? prev.move : null;
    const move = pick(pool.filter((m) => m !== twice && !(m === 'step' && mark === prev.mark)));
    steps.push({ mark, move, beat: prev.beat + gap });
  }
  // Every move the kata is made of appears at least once — a weekly with no
  // GUARD in it is a daily that took longer.
  for (const m of pool) {
    if (steps.some((s) => s.move === m)) continue;
    // Only a step whose move the kata has twice, so this cannot take away
    // the one thing the last pass of this loop made sure of.
    const mv = (j, i) => (j === i ? m : steps[j]?.move);
    const triple = (i) => [i - 2, i - 1, i].some((j) => j >= 0 && mv(j, i) === mv(j + 1, i) && mv(j, i) === mv(j + 2, i));
    const spare = steps.map((s, i) => i).filter((i) => i > 0 && !triple(i)
      && steps.filter((q) => q.move === steps[i].move).length > 1);
    const i = pick(spare);
    if (m === 'step' && steps[i].mark === steps[i - 1].mark) {
      /* A STEP THAT HAS TO GO SOMEWHERE NEW must still be reachable from the
         step before AND reach the step after. The first cut of this checked
         only the one before, and the year-of-katas check found the 7th of
         February asking for a 4.8-unit stride on one beat. One always
         exists: two marks within reach of each other share a neighbour. */
      const nx = steps[i + 1];
      steps[i].mark = pick(MARKS.map((_, k) => k).filter((k) => k !== steps[i - 1].mark
        && markGap(steps[i - 1].mark, k) <= TRAVEL * (steps[i].beat - steps[i - 1].beat)
        && (!nx || markGap(k, nx.mark) <= TRAVEL * (nx.beat - steps[i].beat))));
    }
    steps[i].move = m;
    // A guard just placed must still be followed by a two-beat gap.
    if (m === 'guard') for (let j = i + 1; j < len; j++) steps[j].beat += 1;
  }
  return { kind, key, steps };
}

/** The window either side of a beat a press can land in, at a tempo. */
export function windowFor(bpm) {
  return Math.min(GRADE_T[2], (60 / bpm) * 0.45);
}

/** A press `dt` seconds off its beat: 3 PERFECT, 2 GREAT, 1 GOOD, 0 MISS. */
export function gradeFor(dt, onMark, bpm) {
  const w = windowFor(bpm);
  const a = Math.abs(dt);
  let g = a <= GRADE_T[0] ? 3 : a <= GRADE_T[1] ? 2 : a <= w ? 1 : 0;
  if (!onMark && g > 1) g = 1;
  return g;
}

const GRADE = [
  { word: 'MISS', color: 0xff7a8a, sfx: 'miss' },
  { word: 'GOOD', color: 0x9fefff, sfx: 'good' },
  { word: 'GREAT', color: 0x8bff9a, sfx: 'great' },
  { word: 'PERFECT', color: HOLO.gold, sfx: 'perfect' },
];

/* --------------------------------- the hall ------------------------------- */

const FLOOR_R = 5.4;
/** How far a floor's two kiosks stand from its middle. */
const KIOSK_D = 7.2;
const LION_H = 6.2;   // dreamdojo.js's LION_HEIGHT; imported it would be a cycle

export class KataHall {
  constructor(dream, isle) {
    this.dream = dream;
    this.isle = isle;
    this.floors = [];
    this.kiosks = [];
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
      this._buildFloor(fl);
      this.floors.push(fl);
      for (const [kind, side] of [['daily', -1], ['weekly', 1]]) {
        // On the floor's outer side, either side of the line out to the edge.
        const s = side * 0.62;
        const dx = fl.out.x * Math.cos(s) - fl.out.z * Math.sin(s);
        const dz = fl.out.x * Math.sin(s) + fl.out.z * Math.cos(s);
        const kiosk = new Kiosk(dream, {
          x: fl.x + dx * KIOSK_D, z: fl.z + dz * KIOSK_D, y: isle.y, r: 1.6,
          colour: kind === 'daily' ? HOLO.cyan : HOLO.magenta,
          kanji: '型', title: kind === 'daily' ? 'DAILY KATA' : 'WEEKLY KATA',
          near: 5,
          card: (p) => this._card(p, kind),
          prompt: (p, key) => {
            const who = this._busy(fl, p);
            if (who) return `${who.name.toUpperCase()} IS ON THIS FLOOR — TRY ANOTHER`;
            const n = this.tier(p, kind);
            return `[${key}]  ${kind.toUpperCase()} KATA · ${TEMPI[n]} BPM`;
          },
          interact: (p) => this.begin(p, kind, fl),
        });
        this.kiosks.push(kiosk);
      }
    }
    this.stations = this.kiosks.map((k) => k.station);
    dream.sim.tickers.push((dt) => this.update(dt));
  }

  /** The nine marks, the floor's edge, and the lines between the marks. */
  _buildFloor(fl) {
    const g = new THREE.Group();
    g.position.set(fl.x, fl.y + 0.04, fl.z);
    const mat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, toneMapped: false, depthWrite: false });
    const edge = new THREE.Mesh(new THREE.RingGeometry(FLOOR_R - 0.12, FLOOR_R, 64).rotateX(-Math.PI / 2), mat(HOLO.cyan, 0.5));
    g.add(edge);
    fl.marks = MARKS.map((m, i) => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.9, 32).rotateX(-Math.PI / 2), mat(i ? HOLO.cyan : HOLO.gold, 0.55));
      ring.position.set(m.x, 0.01, m.z);
      g.add(ring);
      return ring;
    });
    const pts = [];
    for (let i = 1; i <= 8; i++) {
      pts.push(new THREE.Vector3(0, 0, 0), new THREE.Vector3(MARKS[i].x * 0.74, 0, MARKS[i].z * 0.74));
    }
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: HOLO.cyan, transparent: true, opacity: 0.25, toneMapped: false })));
    this.dream.sim.root.add(g);
    fl.group = g;
  }

  /** A mark of a floor, in the layer. */
  markAt(fl, i) {
    return { x: fl.x + MARKS[i].x, y: fl.y, z: fl.z + MARKS[i].z };
  }

  /** Whoever else is mid-kata on this floor. */
  _busy(fl, p) {
    for (const q of this.dream.simKittens()) {
      if (q === p) continue;
      const d = this.dream.drills[q.index];
      if (d && d.spec.kataFloor === fl && (d.state === 'ready' || d.state === 'live')) return q;
    }
    return null;
  }

  _key(kind) { return kind === 'weekly' ? weekKey() : dayKey(); }
  _id(kind, n) { return `kata.${kind}.${this._key(kind)}.L${n + 1}`; }
  _name(p) { return p.style?.name ?? p.name; }

  /** The fastest tier open to her today: two stars on one opens the next. */
  tier(p, kind) {
    let n = 0;
    while (n < TEMPI.length - 1 && this.dream.progress.stars(this._name(p), this._id(kind, n)) >= 2) n++;
    return n;
  }

  _card(p, kind) {
    const n = this.tier(p, kind);
    const row = TEMPI.map((bpm, i) => {
      if (i > n) return `L${i + 1} locked`;
      return `L${i + 1} ${stars3(this.dream.progress.stars(this._name(p), this._id(kind, i)))}`;
    }).join('   ');
    const kata = makeKata(kind, this._key(kind));
    const moves = [...new Set(kata.steps.map((s) => MOVES[s.move].word))].join(' · ');
    return [
      { text: `型 ${kind === 'daily' ? 'DAILY' : 'WEEKLY'} KATA`, size: 1.9, color: kind === 'daily' ? HOLO.cyan : HOLO.magenta, glow: true, jp: true },
      { text: `${this._key(kind)} · ${kata.steps.length} steps · ${moves}`, size: 1.05 },
      { text: 'Lionheart shows you — then you, on the beat', size: 1.1, color: 0x9fefff },
      { text: row, size: 1.2, color: HOLO.gold },
    ];
  }

  begin(p, kind, fl) {
    const who = this._busy(fl, p);
    if (who) {
      // Refused, and told where to go instead (non-negotiable 6).
      this.dream.hint(p, `${who.name} is using this floor — there are four, try another`);
      this.dream.game.sfx?.('deny');
      return false;
    }
    const n = this.tier(p, kind);
    const kata = makeKata(kind, this._key(kind));
    if (kind === 'weekly') this.dream.lend(p, ['ward']);
    /* THE FLOOR REACHES TO THE KIOSKS. She starts the kata standing on one
       and watches the demo from there — the best seat, and out of his way:
       the first cut told her to stand in the middle, which is exactly where
       Lionheart dances first, so she watched the back of her own head. */
    this.dream.startDrill(p, KATA(this, fl, kata, TEMPI[n], this._id(kind, n)),
      { x: fl.x, y: fl.y, z: fl.z, r: KIOSK_D + 1.6 + 0.6, fwd: { x: 0, z: 1 } });
    return true;
  }

  update(dt) {
    const inside = idleIn(this.dream);
    for (const k of this.kiosks) k.update(dt, inside);
  }

  faceCamera(camera) {
    for (const k of this.kiosks) k.faceCamera(camera);
  }
}

/* --------------------------------- the drill ------------------------------ */

/**
 * The timeline, in beats from the moment the drill goes live:
 *   0, 1          the demo's count-in
 *   2 + s.beat    Lionheart does step s
 *   D .. D+3      her count-in, four beats ("YOUR TURN")
 *   D+4 + s.beat  she does step s
 * where D = 2 + last beat + 3.
 */
export function kataTimeline(kata) {
  const last = kata.steps[kata.steps.length - 1].beat;
  const D = 2 + last + 3;
  return { D, demo: (s) => 2 + s.beat, hers: (s) => D + 4 + s.beat, end: D + 4 + last + 2 };
}

function KATA(hall, fl, kata, bpm, id) {
  const spb = 60 / bpm;
  const T = kataTimeline(kata);
  const win = windowFor(bpm);
  return {
    id, title: `${kata.kind === 'weekly' ? 'WEEKLY' : 'DAILY'} KATA · ${bpm} BPM`, kanji: '型',
    goalText: 'Watch Lionheart, then do it back on the beat',
    score: (d) => d.acc, lowerIsBetter: false, bands: KATA_BANDS,
    kataFloor: fl, grace: 1.6,
    setup(d) {
      d.kata = kata;
      d.bpm = bpm;
      d.hall = hall;
      d.kataFloor = fl;
      d.marks = kata.steps.map((s) => hall.markAt(fl, s.mark));
      d.grades = [];          // one per step, in order, once judged
      d.cur = 0;              // her next unjudged step
      d.lastBeat = -1;
      d.flashG = null;
      d.flashT = 0;
      d.pressT = {};
      d.ghost = buildGhost(hall.dream, d.root);
      const c = hall.markAt(fl, 0);
      d.ghost.group.position.set(c.x, c.y, c.z);
      d.ghost.from = { ...c };
      /* WHERE: a ring closing on the mark. WHAT: on the card over her head.
         The move had its own panel over its mark, and it lost both ways —
         3.2 up, a far mark's panel rose into the toast band at the top of the
         pane; 1.4 up, it stood in front of HER, because every action is
         done standing on the mark. Her card is the one thing always in view. */
      d.approach = new THREE.Mesh(new THREE.RingGeometry(0.88, 1.0, 40).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: HOLO.gold, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false }));
      d.approach.visible = false;
      d.root.add(d.approach);
      d.nextRing = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.95, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: d.colour, transparent: true, opacity: 0.4, toneMapped: false, depthWrite: false }));
      d.nextRing.visible = false;
      d.root.add(d.nextRing);
      hall.dream.hint(d.p, 'watch Lionheart from here — then it is your turn, from the gold mark in the middle');
    },
    // Her presses — read, never consumed.
    pad(d, pad) {
      for (const a of ['jump', 'mount']) {
        if (pad.pressed(a) && d.pressT[a] !== d.t) {
          d.pressT[a] = d.t;
          press(d, a === 'jump' ? 'jump' : 'guard');
        }
      }
    },
    swing(d, kind) {
      if (d.pressT.cut === d.t) return;   // a Cross Slash is three calls in one frame
      d.pressT.cut = d.t;
      press(d, 'cut');
    },
    tick(d, dt) {
      const beat = d.t / spb;
      const whole = Math.floor(beat);
      if (whole > d.lastBeat) {
        d.lastBeat = whole;
        if (whole < T.end) {
          hall.dream.game.sfx?.(whole === 0 || whole === T.D ? 'beatup' : 'beat');
        }
      }
      runGhost(d, beat, T, spb, hall);
      // A STEP is judged at its beat by where she is; an action that never
      // came is a MISS once its window shuts.
      while (d.cur < kata.steps.length) {
        const s = kata.steps[d.cur];
        const at = T.hers(s) * spb;
        if (s.move === 'step' && d.t >= at) {
          const dist = flatTo(d.p, d.marks[d.cur]);
          const g = dist <= 0.6 ? 3 : dist <= 0.9 ? 2 : dist <= ON_MARK ? 1 : 0;
          judge(d, g, hall);
          continue;
        }
        if (s.move !== 'step' && d.t > at + win) { judge(d, 0, hall); continue; }
        break;
      }
      paintCue(d, T, spb, hall);
      d.flashT = Math.max(0, d.flashT - dt);
      if (beat >= T.end) {
        d.acc = accuracy(d.grades);
        if (d.acc >= KATA_BANDS[0]) d.win();
        else d.fail(`${d.acc}% — ${KATA_BANDS[0]}% for a star. Watch him again!`);
      }
    },
    paint(d) {
      if (d.state === 'won' || d.state === 'failed' || d.state === 'ready') return null;
      const beat = d.t / spb;
      const lines = [{ text: `型 ${kata.kind === 'weekly' ? 'WEEKLY' : 'DAILY'} · ${bpm} BPM`, size: 1.8, color: d.colour, glow: true, jp: true }];
      if (beat < T.D) {
        lines.push({ text: 'WATCH LIONHEART', size: 1.7, color: HOLO.gold });
        lines.push({ text: kata.steps.map((s) => MOVES[s.move].kanji).join(' '), size: 1.5, jp: true });
      } else if (beat < T.D + 4) {
        lines.push({ text: 'YOUR TURN', size: 1.8, color: HOLO.gold, glow: true });
        lines.push({ text: `to the gold middle mark · ${T.D + 4 - Math.floor(beat)}…`, size: 1.6 });
      } else {
        const g = d.flashT > 0 ? GRADE[d.flashG] : null;
        const s = kata.steps[d.cur];
        const mv = s ? MOVES[s.move] : null;
        const key = mv?.action ? ` [${hall.dream.key(d.p, mv.action)}]` : '';
        lines.push(g ? { text: g.word, size: 2.2, color: g.color, glow: true }
          : { text: mv ? `${mv.kanji} ${mv.word}${key}` : '', size: 2.2, color: HOLO.gold, glow: true, jp: true });
        lines.push({ text: `${Math.min(d.cur + 1, kata.steps.length)} / ${kata.steps.length}  ·  ${accuracy(d.grades)}%`, size: 1.4, color: HOLO.cyan });
      }
      return lines;
    },
    doneText: (d) => `${d.acc}% · ${count(d.grades, 3)} perfect`,
    face(d, camera) {
      d.ghost.sprite?.faceCamera(camera);
    },
  };
}

/** A press of hers: the step it belongs to, if any, is graded now. */
function press(d, move) {
  if (d.state !== 'live' || d.cur >= d.kata.steps.length) return;
  const s = d.kata.steps[d.cur];
  if (s.move !== move) return;               // the wrong button is just a button
  const spb = 60 / d.bpm;
  const T = kataTimeline(d.kata);
  const dt = d.t - T.hers(s) * spb;
  if (dt < -windowFor(d.bpm)) return;        // early enough to be a press for nothing
  const on = flatTo(d.p, d.marks[d.cur]) <= ON_MARK;
  judge(d, gradeFor(dt, on, d.bpm), d.hall);
}

function judge(d, g, hall) {
  d.grades.push(g);
  d.flashG = g;
  d.flashT = 0.5;
  hall.dream.game.sfx?.(GRADE[g].sfx);
  if (g === 3) {
    const m = d.marks[d.cur];
    hall.dream.shards.burst(m.x, m.y + 0.3, m.z, HOLO.gold, 24, 3, 5);
  }
  d.cur++;
}

const accuracy = (gs) => (gs.length ? Math.round((100 * gs.reduce((a, b) => a + b, 0)) / (3 * gs.length)) : 0);
const count = (gs, g) => gs.filter((x) => x === g).length;

function flatTo(p, m) {
  return Math.hypot(p.position.x - SIM.dx - m.x, p.position.z - SIM.dz - m.z);
}

/* ------------------------------ the ghost --------------------------------- */

function buildGhost(dream, parent) {
  const group = new THREE.Group();
  const art = dream.lionArt;
  let sprite = null;
  if (art?.texture) {
    const quad = LION_H / (art.contentScale || 1);
    sprite = new Billboard(art.texture, {
      cols: 1, rows: 1, width: quad, height: quad, footOffset: (art.pad ?? 0) * quad, mirror: false,
    });
    sprite.mat.color.set(HOLO.gold);
    sprite.mat.transparent = true;
    sprite.mat.opacity = 0.75;
    group.add(sprite);
  } else {
    // No drawing loaded (a check, a stripped build): a gold column stands in,
    // because a demo with nobody doing it would still have to be followed.
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, LION_H * 0.8, 12).translate(0, LION_H * 0.4, 0),
      new THREE.MeshBasicMaterial({ color: HOLO.gold, transparent: true, opacity: 0.5, toneMapped: false }));
    group.add(m);
  }
  // What he does, drawn: the arc of a cut, and the ring of a guard.
  const arc = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.0, 32, 1, -Math.PI * 0.4, Math.PI * 0.8).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: HOLO.gold, transparent: true, opacity: 0, toneMapped: false, depthWrite: false, side: THREE.DoubleSide }));
  arc.position.y = 2.2;
  group.add(arc);
  const ward = new THREE.Mesh(new THREE.SphereGeometry(2.2, 18, 10),
    new THREE.MeshBasicMaterial({ color: HOLO.cyan, transparent: true, opacity: 0, wireframe: true, toneMapped: false, depthWrite: false }));
  ward.position.y = 2.4;
  group.add(ward);
  parent.add(group);
  return { group, sprite, arc, ward };
}

/** Lionheart's demo, and his place during hers: a beat ahead, faint. */
function runGhost(d, beat, T, spb, hall) {
  const G = d.ghost;
  const steps = d.kata.steps;
  const hers = beat >= T.D;
  const at = (s) => (hers ? T.hers(s) : T.demo(s));
  // The step he is heading for (during hers, the one after hers — he leads).
  let i = steps.findIndex((s) => at(s) + (hers ? -1 : 0) > beat - 0.0001);
  if (i < 0) i = steps.length - 1;
  const s = steps[i];
  const prevBeat = i ? at(steps[i - 1]) : (hers ? T.D : 0);
  const k = Math.max(0, Math.min(1, (beat - prevBeat) / Math.max(0.5, at(s) - prevBeat - (hers ? 1 : 0))));
  const from = i ? hall.markAt(d.kataFloor, steps[i - 1].mark) : hall.markAt(d.kataFloor, 0);
  const to = d.marks[i];
  const e = k * k * (3 - 2 * k);
  G.group.position.x = from.x + (to.x - from.x) * e;
  G.group.position.z = from.z + (to.z - from.z) * e;
  // How long since his last move landed, in beats — the move is drawn then.
  let since = 99;
  let last = null;
  for (const q of steps) {
    const b = beat - at(q);
    if (b >= 0 && b < since) { since = b; last = q; }
  }
  const hop = last?.move === 'jump' && since < 0.8 ? Math.sin((since / 0.8) * Math.PI) * 2.0 : 0;
  G.group.position.y = d.kataFloor.y + hop;
  G.arc.material.opacity = last?.move === 'cut' && since < 0.5 ? (1 - since / 0.5) * 0.9 : 0;
  G.arc.rotation.y = since * 6;
  G.ward.material.opacity = last?.move === 'guard' && since < 1 ? (1 - since) * 0.6 : 0;
  if (G.sprite) G.sprite.mat.opacity = hers ? 0.28 : 0.75;
}

/** The approach ring closing on her next mark, and the move to make there. */
function paintCue(d, T, spb, hall) {
  const beat = d.t / spb;
  const s = d.kata.steps[d.cur];
  const show = s && beat >= T.D;
  d.approach.visible = !!show;
  d.nextRing.visible = false;
  if (!show) return;
  const m = d.marks[d.cur];
  const left = T.hers(s) - beat;              // beats until it lands
  const sc = 1 + Math.max(0, Math.min(2, left)) * 1.6;
  d.approach.position.set(m.x, m.y + 0.06, m.z);
  d.approach.scale.setScalar(sc);
  d.approach.material.opacity = left < 2.5 ? 0.95 : 0.35;
  const n = d.kata.steps[d.cur + 1];
  if (n) {
    const q = d.marks[d.cur + 1];
    d.nextRing.visible = true;
    d.nextRing.position.set(q.x, q.y + 0.05, q.z);
  }
}
