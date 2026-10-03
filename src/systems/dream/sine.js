import * as THREE from 'three';
import { SIM, HOLO } from '../../world/simworld.js';
import { Kiosk, idleIn, isleSpot, stars3 } from './kiosk.js';

/* ---------------------------------------------------------------------------
   THE SINE GAUNTLET — 正弦. Richard's line for it: "y = A·sin(ωt+φ) shown
   live". So the obstacle IS the function.

   Four lanes, one kitten each, walled so the only way through is through.
   Every lane has six laser bars across it, and bar n stands at

        y = C + A · sin(ω t − k n)

   above the floor. A bar at the top of its swing she walks under; a bar at the
   bottom she jumps; a bar in between hits her. Three levels change ONE thing
   at a time, so each teaches one idea:
     L1  k = 0       every bar rises and falls together (a standing wave)
     L2  k > 0       the crest TRAVELS down the lane, slower than she walks —
                     find it and walk under it the whole way ("ride the wave")
     L3  k < 0, ω up the crest comes AT her, faster

   NON-NEGOTIABLE 1, FOR THE THIRD TIME. `barHeight` is the one function that
   puts a bar where it is, draws its trace on the wall, and prints the
   number on her card. The trace is an oscilloscope bolted to the lane's wall:
   its newest point is the bar's own end, and the line behind it is where that
   bar was, so the sine wave visibly flows OUT of the laser. `world-check`
   reads the printed y back and compares it with the bar and with the trace.

   STARS ARE MEASURED. `world-check` sends a patient kitten down each level
   who never jumps — she walks while the bar ahead will be high for as long
   as she is under it, and waits otherwise — and the three-star time is set
   above hers, so it can be beaten by somebody who also jumps or surfs.
--------------------------------------------------------------------------- */

/** The three levels. Units: A and C in world units, ω in radians a second,
 *  k in radians per gate. */
export const LEVELS = [
  { A: 1.6, C: 2.0, w: 1.6, k: 0 },
  { A: 1.6, C: 2.0, w: 1.8, k: 0.8 },
  { A: 1.7, C: 2.0, w: 2.4, k: -0.9 },
];
/** Where the six gates stand along a lane, and where the lane starts and ends. */
export const GATES = [-8, -4.4, -0.8, 2.8, 6.4, 10];
export const LANE = { from: -12, to: 12, half: 3, centres: [-9, -3, 3, 9] };
/** Seconds, per level: [one, two, three] stars. MEASURED: a search over
 *  (place, time) finds the fastest a kitten walking 7 u/s who never jumps can
 *  get from the kiosk to the far end untouched — L1 9.2s, L2 6.6s (riding the
 *  crest beats waiting for it, which is L2's lesson), L3 14.5s. Three stars
 *  is ~1.25x that, so it takes the wave AND a jump or two; world-check
 *  re-runs the search and holds the bands to it. */
export const SINE_BANDS = [[36, 18, 11.5], [26, 13, 8.2], [58, 29, 18]];
/** A bar is safe to walk under at or above this (her body plus the beam's
 *  reach, Laser.distTo); safe to jump at or below this. */
export const UNDER = 3.0;
export const JUMPABLE = 1.6;

/** Height of bar `n` above the floor at time `t`. THE ONE PLACE. */
export function barHeight(L, t, n) {
  return L.C + L.A * Math.sin(L.w * t - L.k * n);
}

const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);

/** The level's equation, with its own numbers in it. */
export function waveText(L) {
  const k = L.k === 0 ? '' : ` ${L.k > 0 ? '−' : '+'} ${f1(Math.abs(L.k))}n`;
  return `y = ${f1(L.C)} + ${f1(L.A)}·sin(${f1(L.w)}t${k})`;
}

/** Bar `n` now, worked: the angle in degrees and the height it makes. */
export function gateWorking(L, t, n) {
  const y = barHeight(L, t, n);
  const rad = L.w * t - L.k * n;
  const deg = ((Math.round((rad * 180) / Math.PI) % 360) + 360) % 360;
  const word = y >= UNDER ? 'WALK UNDER' : y <= JUMPABLE ? 'JUMP IT' : 'WAIT…';
  return { y, deg, word, text: `bar n=${n}: ${f1(L.C)} + ${f1(L.A)}·sin(${deg}°) = ${y.toFixed(2)}` };
}

/** A lane's walls, as circles a kitten cannot pass (layer coordinates). */
export function laneWallPosts(isle) {
  const out = [];
  const walls = [-12, -6, 0, 6, 12];
  for (const b of walls) {
    for (let a = LANE.from; a <= LANE.to + 1e-6; a += 0.8) {
      const q = isleSpot(isle, a, b);
      out.push({ x: q.x, z: q.z, r: 0.4, a, b });
    }
  }
  return out;
}

export class SineGauntlet {
  constructor(dream, isle) {
    this.dream = dream;
    this.isle = isle;
    this.kiosks = [];
    // The walls: solid, and drawn as a row of short pillars with a rail.
    const posts = laneWallPosts(isle);
    for (const s of posts) dream.sim.solids.push({ x: s.x, z: s.z, r: s.r });
    const pillar = new THREE.CylinderGeometry(0.18, 0.22, 1.3, 6).translate(0, 0.65, 0);
    const inst = new THREE.InstancedMesh(pillar,
      new THREE.MeshBasicMaterial({ color: HOLO.magenta, transparent: true, opacity: 0.7, toneMapped: false }), posts.length);
    const m4 = new THREE.Matrix4();
    posts.forEach((s, i) => inst.setMatrixAt(i, m4.makeTranslation(s.x, isle.y, s.z)));
    dream.sim.root.add(inst);
    for (const b of [-12, -6, 0, 6, 12]) {
      const a0 = isleSpot(isle, LANE.from, b); const a1 = isleSpot(isle, LANE.to, b);
      dream.sim.root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(a0.x, isle.y + 1.3, a0.z), new THREE.Vector3(a1.x, isle.y + 1.3, a1.z)]),
      new THREE.LineBasicMaterial({ color: HOLO.magenta, transparent: true, opacity: 0.8, toneMapped: false })));
    }
    this.lanes = LANE.centres.map((c, k) => {
      const lane = { k, c };
      const q = isleSpot(isle, -16, c);
      const kiosk = new Kiosk(dream, {
        x: q.x, z: q.z, y: isle.y, r: 1.6, colour: HOLO.cyan, kanji: '正弦', title: `LANE ${k + 1}`, near: 4,
        card: (p) => this._card(p),
        prompt: (p, key) => {
          const who = this._busy(lane, p);
          if (who) return `${who.name.toUpperCase()} IS IN THIS LANE — TRY ANOTHER`;
          return `[${key}]  SINE GAUNTLET · L${this.tier(p) + 1}`;
        },
        interact: (p) => this.begin(p, lane),
      });
      this.kiosks.push(kiosk);
      return lane;
    });
    this.stations = this.kiosks.map((k) => k.station);
    dream.sim.tickers.push((dt) => this.update(dt));
  }

  _name(p) { return p.style?.name ?? p.name; }

  tier(p) {
    let n = 0;
    while (n < LEVELS.length - 1 && this.dream.progress.stars(this._name(p), `sine.L${n + 1}`) >= 2) n++;
    return n;
  }

  _busy(lane, p) {
    for (const q of this.dream.simKittens()) {
      if (q === p) continue;
      const d = this.dream.drills[q.index];
      if (d && d.spec.sineLane === lane && (d.state === 'ready' || d.state === 'live')) return q;
    }
    return null;
  }

  _card(p) {
    const n = this.tier(p);
    const L = LEVELS[n];
    const row = LEVELS.map((_, i) => (i > n ? `L${i + 1} locked`
      : `L${i + 1} ${stars3(this.dream.progress.stars(this._name(p), `sine.L${i + 1}`))}`)).join('   ');
    return [
      { text: '正弦 SINE GAUNTLET', size: 1.9, color: HOLO.cyan, glow: true, jp: true },
      { text: waveText(L), size: 1.4, color: HOLO.gold },
      { text: 'high bar: walk under · low bar: jump · in between: wait', size: 1.0, color: 0x9fefff },
      { text: row, size: 1.2, color: HOLO.gold },
    ];
  }

  begin(p, lane) {
    const who = this._busy(lane, p);
    if (who) {
      this.dream.hint(p, `${who.name} is in this lane — there are four, try another`);
      this.dream.game.sfx?.('deny');
      return false;
    }
    const n = this.tier(p);
    const isle = this.isle;
    this.dream.startDrill(p, GAUNTLET(this, lane, n),
      { x: isle.x, y: isle.y, z: isle.z, r: isle.r, fwd: isle.fwd });
    return true;
  }

  /** Her place on the island in lane terms: `a` along the lanes, `b` across. */
  laneCoords(p) {
    const f = this.isle.fwd;
    const x = p.position.x - SIM.dx - this.isle.x;
    const z = p.position.z - SIM.dz - this.isle.z;
    return { a: x * f.x + z * f.z, b: -x * f.z + z * f.x };
  }

  update(dt) {
    const inside = idleIn(this.dream);
    for (const k of this.kiosks) k.update(dt, inside);
  }

  faceCamera(camera) {
    for (const k of this.kiosks) k.faceCamera(camera);
  }
}

/* ------------------------------- the drill ------------------------------- */

const TRACE_W = 2.4;      // the oscilloscope's width along the wall
const TRACE_N = 40;

function GAUNTLET(G, lane, n) {
  const L = LEVELS[n];
  const isle = G.isle;
  return {
    id: `sine.L${n + 1}`, title: `SINE GAUNTLET · L${n + 1}`, kanji: '正弦',
    goalText: 'Through all six bars to the far end',
    goal: GATES.length + 1, showCount: false, bands: SINE_BANDS[n], time: 90,
    sineLane: lane, level: L,
    setup(d) {
      d.passed = GATES.map(() => false);
      d.bars = GATES.map((a, i) => {
        const p0 = isleSpot(isle, a, lane.c - LANE.half + 0.05);
        const p1 = isleSpot(isle, a, lane.c + LANE.half - 0.05);
        const y = isle.y + barHeight(L, 0, i);
        return d.laser({ a: { x: p0.x, y, z: p0.z }, b: { x: p1.x, y, z: p1.z }, thick: 0.3, dmg: 10, colour: 0xff3b6b });
      });
      // The oscilloscopes, one per bar, on the lane's right-hand wall.
      d.traces = GATES.map((a, i) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRACE_N * 3), 3));
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: HOLO.gold, transparent: true, opacity: 0.95, toneMapped: false }));
        line.frustumCulled = false;
        d.root.add(line);
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8),
          new THREE.MeshBasicMaterial({ color: HOLO.gold, toneMapped: false }));
        d.root.add(dot);
        // The midline, y = C, so the swing reads as a swing about something.
        const m0 = isleSpot(isle, a - TRACE_W, lane.c + LANE.half - 0.2);
        const m1 = isleSpot(isle, a, lane.c + LANE.half - 0.2);
        d.root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(m0.x, isle.y + L.C, m0.z), new THREE.Vector3(m1.x, isle.y + L.C, m1.z)]),
        new THREE.LineBasicMaterial({ color: HOLO.cyan, transparent: true, opacity: 0.35, toneMapped: false })));
        return { line, dot, a, i };
      });
      paintBars(d, L, isle, lane, 0);
    },
    tick(d) {
      paintBars(d, L, isle, lane, d.t);
      const q = G.laneCoords(d.p);
      const inLane = Math.abs(q.b - lane.c) < LANE.half;
      GATES.forEach((a, i) => {
        if (!d.passed[i] && inLane && q.a > a + 0.6 && (i === 0 || d.passed[i - 1])) {
          d.passed[i] = true;
          d.progress();
        }
      });
      if (d.passed.every(Boolean) && q.a > LANE.to + 0.5 && inLane) d.progress();
    },
    paint(d) {
      if (d.state !== 'live') return null;
      const next = d.passed.indexOf(false);
      const lines = [
        { text: `正弦 L${n + 1}   ${waveText(L)}`, size: 1.45, color: d.colour, glow: true, jp: true },
      ];
      if (next >= 0) {
        const w = gateWorking(L, d.t, next);
        lines.push({ text: w.text, size: 1.3, color: HOLO.gold });
        lines.push({ text: `→ ${w.word}`, size: 1.6, color: w.word === 'WAIT…' ? 0xff8a8a : 0x8bff9a });
      } else {
        lines.push({ text: 'all six — run for the end!', size: 1.5, color: HOLO.gold });
      }
      lines.push({ text: `${d.t.toFixed(1)}s`, size: 1.3, color: HOLO.cyan });
      return lines;
    },
  };
}

/** Every bar and every trace from `barHeight`, at `t`. The ONLY writer. */
function paintBars(d, L, isle, lane, t) {
  d.bars.forEach((B, i) => {
    const y = isle.y + barHeight(L, t, i);
    B.a.y = y;
    B.b.y = y;
  });
  const P = (2 * Math.PI) / L.w;
  for (const tr of d.traces) {
    const pos = tr.line.geometry.attributes.position;
    for (let j = 0; j < TRACE_N; j++) {
      const tau = (j / (TRACE_N - 1)) * P;                 // seconds ago
      const q = isleSpot(isle, tr.a - (tau / P) * TRACE_W, lane.c + LANE.half - 0.2);
      pos.setXYZ(j, q.x, isle.y + barHeight(L, t - tau, tr.i), q.z);
    }
    pos.needsUpdate = true;
    tr.dot.position.set(pos.getX(0), pos.getY(0), pos.getZ(0));
  }
}
