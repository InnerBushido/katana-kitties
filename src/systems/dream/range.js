import * as THREE from 'three';
import { SIM, HOLO } from '../../world/simworld.js';
import { Kiosk, idleIn, isleSpot, stars3 } from './kiosk.js';
import { Cane, Post } from './targets.js';

/* ---------------------------------------------------------------------------
   THE TAMESHIGIRI RANGE — 試斬, test cutting. Three ways to be judged on the
   blade alone, no orb and no clan required, so it is open to every kitten
   from the first afternoon:

     一閃 ONE SWING   a grove of sixteen canes, thirty seconds, and the score is
                     the most she cut with ONE swing — which is a question
                     about where she stands, not how fast she presses.
     連撃 COMBO 60    makiwara appearing round her for a minute; the score is
                     the longest chain of cuts each inside COMBO_GAP of the last.
     角 CLEAN CUT     a cane, a unit circle in front of it, and a blade line
                     turning round that circle. Cut when the blade lies on the
                     gold line: the cut is drawn at (cos θ, sin θ).

   CLEAN CUT IS THE MATHS, AND IT IS THE FIRST NON-NEGOTIABLE. The gold line,
   the turning blade and the numbers on her card are all drawn from ONE call
   (`cutGeometry`) — the same two numbers put the end of the line where it is
   and print beside it, so the card cannot say (0.71, 0.71) about a line that
   is somewhere else. `world-check` reads the numbers back out of the text and
   compares them with the tip of the mesh.

   ONE SWING'S STARS ARE MEASURED. `world-check` stands a kitten at every spot
   on a quarter-unit grid, facing 32 ways, and swings: a standing slash gets 7
   of the sixteen at best, a dash 8, and the Goblin Sweep 14. Three stars is 6,
   so it does not need the one perfect spot; the sweep is there to be found.
--------------------------------------------------------------------------- */

/** One swing's grove: 4 x 4 canes, this far apart. */
/* `ahead` is set by the four groves, not the one: seat k's grove is seat 0's
   turned k quarters (`floor`), and at 7 two neighbours' corner canes stood
   0.28 apart — two sisters' canes in one clump. At 9.2 the corners are 2.8
   apart, a cane gap and change, and the far corner is still 9 inside the rim. */
export const GROVE = { n: 4, gap: 2.4, ahead: 9.2 };
/** One swing's stars, in canes. */
export const SWING_BANDS = [3, 5, 6];
/** Combo 60: the most seconds between two cuts that are still one chain. */
export const COMBO_GAP = 2.5;
/** Clean cut: how far off the gold line, in degrees, is still clean. */
export const CUT_TOL = 12;
/** Clean cut: the radius of the circle in front of the cane. */
export const CUT_R = 1.8;

/**
 * THE ONE PLACE A CUT'S NUMBERS COME FROM. Degrees in, and everything drawn
 * or printed about that angle out: the unit vector, the tip of the line on a
 * circle of radius `R`, and the sentence the card prints. Pure, so a check can
 * hold the picture and the words up against each other.
 */
export function cutGeometry(deg, R = CUT_R) {
  const t = THREE.MathUtils.degToRad(deg);
  const c = Math.cos(t);
  const s = Math.sin(t);
  const f = (v) => (Math.abs(v) < 0.005 ? 0 : v).toFixed(2);
  return {
    deg: ((Math.round(deg) % 360) + 360) % 360,
    c, s,
    tip: { x: c * R, y: s * R },
    text: `(cos θ, sin θ) = (${f(c)}, ${f(s)})`,
  };
}

/** Smallest difference between two angles in degrees, 0..180. */
export function angleGap(a, b) {
  const d = (((a - b) % 360) + 540) % 360 - 180;
  return Math.abs(d);
}

/* The targets a CLEAN CUT asks for: never on an axis (0, 90, 180, 270 make
   one of the two numbers zero, and the point is that BOTH mean something), and
   spread round all four quadrants so the signs change. */
export const CUT_ANGLES = [30, 45, 60, 120, 135, 150, 210, 225, 240, 300, 315, 330];

export class TameshigiriRange {
  constructor(dream, isle) {
    this.dream = dream;
    this.isle = isle;
    this.kiosks = [];
    const best = (p, id) => this.dream.progress.best(p.style?.name ?? p.name, id);
    const st = (p, id) => this.dream.progress.stars(p.style?.name ?? p.name, id);
    const MODES = [
      {
        id: 'swing', kanji: '一閃', title: 'ONE SWING', at: [-17, -6],
        card: (p) => [
          { text: '一閃  ONE SWING', size: 2.0, color: HOLO.cyan, glow: true, jp: true },
          { text: 'Sixteen canes. Thirty seconds.', size: 1.2 },
          { text: 'How many can ONE swing cut?', size: 1.2, color: 0x9fefff },
          { text: `best ${best(p, 'range.swing') ?? '—'}   ${stars3(st(p, 'range.swing'))}`, size: 1.2, color: HOLO.gold },
        ],
        drill: () => SWING(this),
      },
      {
        id: 'combo', kanji: '連撃', title: 'COMBO 60', at: [-17.5, 0],
        card: (p) => [
          { text: '連撃  COMBO 60', size: 2.0, color: HOLO.cyan, glow: true, jp: true },
          { text: 'Posts appear around you for a minute.', size: 1.15 },
          { text: `Cut the next one within ${COMBO_GAP}s to keep the chain`, size: 1.1, color: 0x9fefff },
          { text: `best chain ${best(p, 'range.combo') ?? '—'}   ${stars3(st(p, 'range.combo'))}`, size: 1.2, color: HOLO.gold },
        ],
        drill: () => COMBO(this),
      },
      {
        id: 'cut', kanji: '角', title: 'CLEAN CUT', at: [-17, 6],
        card: (p) => {
          const b = best(p, 'range.cut');
          return [
            { text: '角  CLEAN CUT', size: 2.0, color: HOLO.cyan, glow: true, jp: true },
            { text: 'The blade line turns round the circle.', size: 1.15 },
            { text: 'Cut when it lies on the gold line — at (cos θ, sin θ)', size: 1.05, color: 0x9fefff },
            { text: `best ${b != null ? `${b.toFixed(1)}s` : '—'}   ${stars3(st(p, 'range.cut'))}`, size: 1.2, color: HOLO.gold },
          ];
        },
        drill: () => CLEAN(this),
      },
    ];
    for (const m of MODES) {
      const q = isleSpot(isle, m.at[0], m.at[1]);
      const k = new Kiosk(dream, {
        x: q.x, z: q.z, y: isle.y, kanji: m.kanji, title: m.title, colour: HOLO.cyan,
        card: m.card,
        prompt: (p, key) => `[${key}]  ${m.title}`,
        interact: (p) => dream.startDrill(p, { ...m.drill(), id: `range.${m.id}`, kanji: m.kanji }, this.floor(p)),
      });
      this.kiosks.push(k);
    }
    this.stations = this.kiosks.map((k) => k.station);
    dream.sim.tickers.push((dt) => this.update(dt));
  }

  /**
   * HER QUARTER OF THE ISLAND. The floor's middle is everybody's, but `fwd`
   * turns a quarter per seat, so four sisters on ONE SWING get four groves
   * round the middle instead of four sets of canes stacked on one spot — which
   * the gallery gets away with because its drills are paths, and a grove is
   * not. Seat 0 faces away from the bridge, as every other floor does.
   */
  floor(p = null) {
    const i = this.isle;
    const k = ((p?.index ?? 0) % 4) * (Math.PI / 2);
    const c = Math.cos(k);
    const s = Math.sin(k);
    const fwd = { x: i.fwd.x * c - i.fwd.z * s, z: i.fwd.x * s + i.fwd.z * c };
    return { x: i.x, y: i.y, z: i.z, r: i.r, fwd };
  }

  update(dt) {
    const inside = idleIn(this.dream);
    for (const k of this.kiosks) k.update(dt, inside);
  }

  faceCamera(camera) {
    for (const k of this.kiosks) k.faceCamera(camera);
  }
}

/* ------------------------------- the drills ------------------------------ */

const TIME = 30;

/* 一閃 ONE SWING. Every swing is counted as it lands (`spec.swing`, one call
   of the gate per swing), the canes stand back up a second after they go, and
   the score is the best single swing. */
function SWING(range) {
  return {
    title: 'ONE SWING', goalText: 'Find the spot where one swing cuts the most',
    score: (d) => d.best, lowerIsBetter: false, bands: SWING_BANDS,
    setup(d) {
      d.best = 0;
      d.last = null;
      const { n, gap, ahead } = GROVE;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const q = d.spot(ahead + (i - (n - 1) / 2) * gap, (j - (n - 1) / 2) * gap);
          d.target(Cane, { x: q.x, y: q.y, z: q.z, respawn: 1.0 });
        }
      }
    },
    swing(d, kind, n) {
      if (!n) return;
      d.last = n;
      if (n > d.best) {
        d.best = n;
        d.dream.game.sfx?.(n >= SWING_BANDS[2] ? 'perfect' : 'great');
      }
    },
    tick(d) {
      if (d.t < TIME) return;
      if (d.best >= SWING_BANDS[0]) d.win();
      else d.fail(`Best swing: ${d.best} — cut ${SWING_BANDS[0]} at once for a star`);
    },
    paint(d) {
      if (d.state !== 'live') return null;
      return [
        { text: '一閃 ONE SWING', size: 2.0, color: d.colour, glow: true, jp: true },
        { text: `best ${d.best}${d.last != null ? `   ·   last ${d.last}` : ''}`, size: 1.8 },
        { text: `${Math.max(0, TIME - d.t).toFixed(1)}s`, size: 1.8, color: TIME - d.t < 5 ? 0xff6a6a : HOLO.cyan },
      ];
    },
  };
}

/* 連撃 COMBO 60. Two posts stand at a time, each 4-8 units from wherever she
   is, on the floor. A cut inside COMBO_GAP of the last one carries the chain;
   a slower one starts a new chain at 1. The score is the longest chain. */
function COMBO() {
  const T = 60;
  return {
    title: 'COMBO 60', goalText: `Cut, cut, cut — never more than ${COMBO_GAP}s apart`,
    score: (d) => d.bestChain, lowerIsBetter: false, bands: [8, 20, 32],
    setup(d) {
      d.chain = 0;
      d.bestChain = 0;
      d.lastCut = -99;
      d.spawn = () => {
        const p = d.p;
        const px = p.position.x - SIM.dx;
        const pz = p.position.z - SIM.dz;
        let q = null;
        for (let k = 0; k < 12 && !q; k++) {
          const a = Math.random() * Math.PI * 2;
          const r = 4 + Math.random() * 4;
          const x = px + Math.cos(a) * r;
          const z = pz + Math.sin(a) * r;
          if (Math.hypot(x - d.at.x, z - d.at.z) < d.at.r - 3) q = { x, z };
        }
        // Nowhere free round her (she is at the edge): toward the middle.
        q ??= { x: d.at.x + (px - d.at.x) * 0.3, z: d.at.z + (pz - d.at.z) * 0.3 };
        const t = d.target(Post, {
          x: q.x, y: d.at.y, z: q.z,
          onBreak: () => {
            const now = d.t;
            d.chain = now - d.lastCut <= COMBO_GAP ? d.chain + 1 : 1;
            d.lastCut = now;
            if (d.chain > d.bestChain) d.bestChain = d.chain;
            d.dream.game.sfx?.(d.chain >= 10 ? 'perfect' : 'great');
            // Gone for good: the list would otherwise grow by one per cut.
            d.dream.gate.remove(t);
            t.dispose();
            d.targets.splice(d.targets.indexOf(t), 1);
            if (d.state === 'live') d.spawn();
          },
        });
      };
    },
    start(d) { d.spawn(); d.spawn(); },
    tick(d) {
      if (d.chain && d.t - d.lastCut > COMBO_GAP) d.chain = 0;
      if (d.t < T) return;
      if (d.bestChain >= 8) d.win();
      else d.fail(`Longest chain ${d.bestChain} — keep 8 going for a star`);
    },
    paint(d) {
      if (d.state !== 'live') return null;
      const left = d.chain ? Math.max(0, COMBO_GAP - (d.t - d.lastCut)) : 0;
      return [
        { text: '連撃 COMBO 60', size: 2.0, color: d.colour, glow: true, jp: true },
        { text: `chain ${d.chain}   ·   best ${d.bestChain}`, size: 1.8, color: d.chain >= 10 ? HOLO.gold : 0xffffff },
        { text: `${Math.max(0, T - d.t).toFixed(1)}s${d.chain ? `   (next within ${left.toFixed(1)}s)` : ''}`, size: 1.5,
          color: T - d.t < 5 ? 0xff6a6a : HOLO.cyan },
      ];
    },
  };
}

/* 角 CLEAN CUT. Five canes, one at a time, each with its own gold line. The
   blade line turns at OMEGA[round] degrees a second, faster each round; a cut
   counts when the blade is within CUT_TOL of the gold line at the moment the
   katana reaches the cane. A cut off the line is refused and SAYS by how much.
   Score: seconds for all five. */
const OMEGA = [55, 70, 85, 100, 115];
function CLEAN() {
  const ROUNDS = 5;
  return {
    title: 'CLEAN CUT', goalText: 'Cut when the white line lies on the gold one',
    goal: ROUNDS, bands: [75, 40, 24], showCount: false, time: 150,
    face(d, camera) { faceDial(d.dial, camera); },
    setup(d) {
      d.round = 0;
      const pool = [...CUT_ANGLES];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      d.angles = pool.slice(0, ROUNDS);
      d.blade = 0;
      d.dial = buildDial(d.root, d.colour);
      d.flash = 0;
      d.place = () => {
        const q = d.spot(6, 0);
        d.cane = d.target(Cane, {
          x: q.x, y: q.y, z: q.z,
          accept: () => angleGap(d.blade, d.angles[d.round]) <= CUT_TOL,
          onRefuse: () => {
            d.flash = -1;
            d.dream.hint(d.p, `Blade at ${Math.round(d.blade)}° — the gold line is at ${d.angles[d.round]}°`);
          },
          onBreak: () => {
            d.flash = 1;
            d.cutAt = d.blade;
            d.dream.game.sfx?.('perfect');
            d.round++;
            d.progress();
            if (d.state === 'live' && d.round < ROUNDS) d.reviveT = 0.7;
          },
        });
        d.dial.group.position.set(q.x, q.y + 2.0, q.z);
        // The blade starts a quarter turn behind the target, every round.
        d.blade = (d.angles[d.round] + 270) % 360;
      };
      d.place();
    },
    tick(d, dt) {
      if (d.reviveT != null) {
        d.reviveT -= dt;
        if (d.reviveT <= 0) {
          d.reviveT = null;
          d.cane.revive();
          d.blade = (d.angles[d.round] + 270) % 360;
        }
        return;
      }
      d.blade = (d.blade + OMEGA[Math.min(d.round, OMEGA.length - 1)] * dt) % 360;
    },
    paint(d) {
      const target = cutGeometry(d.angles[Math.min(d.round, d.angles.length - 1)]);
      const blade = cutGeometry(d.blade);
      setDial(d.dial, target, blade, d.flash, d.cutAt != null ? cutGeometry(d.cutAt) : null);
      d.flash *= 0.94;
      if (d.state !== 'live') return null;
      return [
        { text: `角 CLEAN CUT   ${d.round + 1} / 5`, size: 1.9, color: d.colour, glow: true, jp: true },
        { text: `gold  θ = ${target.deg}°   ${target.text}`, size: 1.25, color: HOLO.gold },
        { text: `blade θ = ${blade.deg}°   ${blade.text}`, size: 1.25 },
        { text: `${d.t.toFixed(1)}s`, size: 1.5, color: HOLO.cyan },
      ];
    },
  };
}

/* --------------------------- the dial in the air -------------------------- */

const DIAL_UP = new THREE.Vector3();

/** The unit circle in front of a cane: ring, axes, gold line, blade line. */
function buildDial(parent, colour) {
  const R = CUT_R;
  const group = new THREE.Group();
  const line = (pts, c, o = 1) => {
    const g = new THREE.BufferGeometry().setFromPoints(pts.map(([x, y]) => new THREE.Vector3(x, y, 0)));
    const m = new THREE.Line(g, new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: o, toneMapped: false, depthTest: false }));
    m.renderOrder = 30;
    group.add(m);
    return m;
  };
  const ring = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    ring.push([Math.cos(a) * R, Math.sin(a) * R]);
  }
  line(ring, colour, 0.8);
  line([[-R - 0.4, 0], [R + 0.4, 0]], 0xffb347, 0.7);   // x: cos, the Turning Circle's colour
  line([[0, -R - 0.4], [0, R + 0.4]], 0x8bff9a, 0.7);   // y: sin
  const gold = line([[0, 0], [R, 0]], HOLO.gold);
  const blade = line([[0, 0], [R, 0]], 0xffffff);
  const dot = (c, r) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 18),
      new THREE.MeshBasicMaterial({ color: c, transparent: true, toneMapped: false, depthTest: false }));
    m.renderOrder = 31;
    group.add(m);
    return m;
  };
  const goldDot = dot(HOLO.gold, 0.16);
  const bladeDot = dot(0xffffff, 0.12);
  /* THE CUT ITSELF: a gold line right through the cane, from -(cos, sin) to
     +(cos, sin), at the angle she cut at. It is the answer drawn — the same
     two numbers the card printed, now as the slice. */
  const slash = line([[-R, 0], [R, 0]], HOLO.gold, 0);
  parent.add(group);
  return { group, gold, blade, goldDot, bladeDot, slash, ring: group.children[0] };
}

/** Put the lines where the numbers say. The ONLY writer of their tips. */
function setDial(dial, target, blade, flash, cut = null) {
  if (cut) {
    const a = dial.slash.geometry.attributes.position;
    const k = 1.35;
    a.setXYZ(0, -cut.tip.x * k, -cut.tip.y * k, 0);
    a.setXYZ(1, cut.tip.x * k, cut.tip.y * k, 0);
    a.needsUpdate = true;
  }
  dial.slash.material.opacity = cut ? Math.max(0, flash) : 0;
  const put = (ln, dotM, g) => {
    const a = ln.geometry.attributes.position;
    a.setXYZ(1, g.tip.x, g.tip.y, 0);
    a.needsUpdate = true;
    dotM.position.set(g.tip.x, g.tip.y, 0.01);
  };
  put(dial.gold, dial.goldDot, target);
  put(dial.blade, dial.bladeDot, blade);
  dial.target = target;
  dial.bladeAt = blade;
  const ringMat = dial.ring.material;
  ringMat.color.set(flash > 0.05 ? HOLO.gold : flash < -0.05 ? 0xff5a6a : HOLO.cyan);
}

/** Turn the dial to the lens about Y only, so its "up" is the world's up. */
export function faceDial(dial, camera) {
  if (!dial) return;
  DIAL_UP.set(camera.position.x - SIM.dx, 0, camera.position.z - SIM.dz);
  const g = dial.group;
  dial.group.rotation.set(0, Math.atan2(DIAL_UP.x - g.position.x, DIAL_UP.z - g.position.z), 0);
}

export { setDial, buildDial };
