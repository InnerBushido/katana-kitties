import * as THREE from 'three';
import { SIM, HOLO } from '../../world/simworld.js';
import { HoloPanel } from './holo.js';
import { Kiosk, idleIn, isleSpot, stars3 } from './kiosk.js';
import {
  LEVELS, LANES, LANE_HALF, WALLS, START, START_LINE, SECTIONS, SECTION, FINISH_B,
  beams, stones, groundAt, hitAt, pathS, CP_S, FINISH_S, checkpointFor,
  barWorking, waveText, sweepEnds, gapCentre, stoneHeight, COURSE_BANDS, COURSE_TIME,
} from './course.js';

export { LEVELS, COURSE_BANDS };

/* ---------------------------------------------------------------------------
   THE SINE GAUNTLET — 正弦. A course, one kitten at a time, for the best time.

   Richard: "Instead of having 4 separate lanes for each player, can just have
   1 course lane and have the 4 players queue up in competition, going one by
   one and competing for the best time to complete the course. Spectating
   players can watch and have similar camera view of the active player,
   non-competing players queued up can be in a cheering section while they
   watch so that, they are stuck in that area and cant fall out and therefore
   camera does not need to be centered on them or split screen and shared
   camera can focus on the player in the obstacle course. We should likely
   consider stripping the player temporarily of their equipped kotodama orbs
   and clan abilities if they do join the course, so it will just be a course
   testing their raw skills, and return back to them in their Holographic
   Character Profile."

   THE PIECES, and where each is:
     · the course's numbers — every beam, stone, gap and the route — are
       course.js, which draws nothing. This file lays the drawing on them.
     · A SESSION opens when somebody runs it, at HER level, and everybody who
       joins after races that level. One runner at a time; everybody else in
       it stands in 応援 THE STANDS, a walled bleacher on the plaza they cannot
       fall or wander out of, until the last run is done — then the board
       says who won and they are all let out together.
     · THEIR KITS GO ON THE RACK for as long as they are in it: holo orbs and
       holo clan off (`DreamDojo.bench`), back on, exactly as they were, on
       the way out — and the toast says to look in the (HOLO) PLAYER PROFILE.
     · ONE CAMERA, side-on like the television: the runner's, and everybody
       in the session SHARES it — `paneAnchor` puts them at the runner for
       the split screen, and `groupShot` is the shared rig's shot.
     · A ZAP OR A FALL is back to the last checkpoint with the clock still
       running, never the end of the run: they are nine and younger, and the
       time is the score.

   NOTHING HERE HURTS ANYBODY. A zap is `hitAt` (course.js) answered with a
   teleport; nothing here hurts anybody, and the SIM bar is not touched.
--------------------------------------------------------------------------- */

/** The plaza, behind the course (a < −17): where things stand. */
export const PLAZA = {
  kiosk: { a: -20, b: -4 },
  stands: { a: -21, b: 10, r: 4, lift: 2.2, wall: 3.75 },
  exit: { a: -21, b: 12.6 },
  board: { a: -20.5, b: -12, lift: 4.6 },
  out: [{ a: -20, b: 2 }, { a: -19, b: 4 }, { a: -20, b: 6 }, { a: -19, b: 0 }],
};

/** The shared camera: side-on to the lanes (from the +a side, looking back
 *  across them toward the plaza), pulled back far enough to see a lane's
 *  worth of obstacles either side of her, and low enough that a bar's height
 *  reads against her. The lanes run across the screen.
 *
 *  CENTRED ON HER, NO LEAD — MEASURED. Every point of the path, with her and
 *  the floor and bar-height 2 and 3 and 6 units ahead of her, projected through
 *  this lens against the real 300px minimap in its corner: 0 of 1944 off the
 *  frame or under the map at 1920x1080 and 1280x720 full screen, and at
 *  1920x1080 half screen. A lead of 1.5, 2.5 and 3.5 was no better anywhere
 *  and worse in a small window (88-310 against 176 under the map), because
 *  the map is a corner and a lead in a rightward lane walks her into it.
 *  Holding the centre on the MIDDLE lane instead of hers was worse again:
 *  the lanes are the depth of this shot, and the near one fell to NDC -0.97.
 *  The one case that collides is a 300px map in a 640px-wide half pane, which
 *  is the minimap's own size and every island's, not the course's. */
export const COURSE_CAM = { dist: 25, pitch: 0.42, lift: 1.6 };

/** Hold INTERACT this long to give a run up — one press is an elbow
 *  (non-negotiable 7). */
export const STOP_HOLD = 1.2;
/** After a zap, this long before anything can zap her again. */
const SAFE_T = 0.9;
/** Below the floor by this much is a fall. */
const FALL = 3;

const BAR_COL = 0xff3b6b;
const ARM_COL = 0xffa23b;
const CURTAIN_COL = 0xb35cff;

export class SineGauntlet {
  constructor(dream, isle) {
    this.dream = dream;
    this.isle = isle;
    this.sim = dream.sim;
    this.root = new THREE.Group();
    this.root.name = 'sine-course';
    this.sim.root.add(this.root);
    /** The session: null, or { level, runner, queue: [index], stands: Set,
     *  results: [{ i, name, colour, time, stars, cp, zaps }], gap }. */
    this.session = null;
    this.run = null;
    this.last = null;            // the last session's results, for the board
    this._buildWalls();
    this._buildFloor();
    this._buildStones();
    this._buildBeams();
    this._buildPlaza();
    this.stations = this.kiosks.map((k) => k.station);
    dream.sim.tickers.push((dt) => this.update(dt));
  }

  /* ------------------------------- building ------------------------------ */

  _w(a, b, y = 0) {
    const q = isleSpot(this.isle, a, b);
    return { x: q.x, y: this.isle.y + y, z: q.z };
  }

  /** Posts and a rail along every wall. Solid, and with no top, so a double
   *  jump cannot clear one either. */
  _buildWalls() {
    const posts = [];
    for (const [[a0, b0], [a1, b1]] of WALLS) {
      const len = Math.hypot(a1 - a0, b1 - b0);
      const n = Math.ceil(len / 0.8);
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const q = this._w(a0 + (a1 - a0) * u, b0 + (b1 - b0) * u);
        posts.push(q);
        this.sim.solids.push({ x: q.x, z: q.z, r: 0.4 });
      }
      const p0 = this._w(a0, b0, 1.3); const p1 = this._w(a1, b1, 1.3);
      this.root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(p0.x, p0.y, p0.z), new THREE.Vector3(p1.x, p1.y, p1.z)]),
      new THREE.LineBasicMaterial({ color: HOLO.magenta, transparent: true, opacity: 0.8, toneMapped: false })));
    }
    this.posts = posts;
    const pillar = new THREE.CylinderGeometry(0.18, 0.22, 1.3, 6).translate(0, 0.65, 0);
    const inst = new THREE.InstancedMesh(pillar,
      new THREE.MeshBasicMaterial({ color: HOLO.magenta, transparent: true, opacity: 0.7, toneMapped: false }), posts.length);
    const m4 = new THREE.Matrix4();
    posts.forEach((q, i) => inst.setMatrixAt(i, m4.makeTranslation(q.x, q.y, q.z)));
    this.root.add(inst);
  }

  /** A flat strip on the floor from (a0,b0) to (a1,b1), `w` wide. */
  _strip(a0, b0, a1, b1, w, colour, opacity, y = 0.04) {
    const p0 = this._w(a0, b0, y); const p1 = this._w(a1, b1, y);
    const len = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, toneMapped: false, depthWrite: false }));
    m.position.set((p0.x + p1.x) / 2, p0.y, (p0.z + p1.z) / 2);
    m.rotation.y = Math.atan2(p1.x - p0.x, p1.z - p0.z);
    this.root.add(m);
    return m;
  }

  /** The lines on the floor: start, checkpoints, finish, the zap floor, and
   *  the sweeper's circle with its two axes — the cos and the sin. */
  _buildFloor() {
    const lane = (k) => LANES[k];
    this._strip(lane(0) - LANE_HALF, START_LINE, lane(0) + LANE_HALF, START_LINE, 0.35, 0xffffff, 0.8);
    this._strip(lane(2) - LANE_HALF, FINISH_B, lane(2) + LANE_HALF, FINISH_B, 0.6, HOLO.gold, 0.9);
    SECTIONS.forEach((sec, i) => {
      if (i === 0) return;
      const c = lane(sec.lane);
      this._strip(c - LANE_HALF, sec.cp, c + LANE_HALF, sec.cp, 0.18, HOLO.cyan, 0.55);
    });
    // The floor that zaps: red, and it pulses while a run is live.
    const st = SECTION.stones;
    const c = lane(st.lane);
    this.zapFloor = this._strip(c, st.floor[0], c, st.floor[1], LANE_HALF * 2 - 0.3, 0xff2a4a, 0.22, 0.03);
    for (let b = st.floor[0] + 1; b < st.floor[1]; b += 1.5) this._strip(c - LANE_HALF + 0.2, b, c + LANE_HALF - 0.2, b, 0.06, 0xff6a80, 0.5, 0.035);
    // The sweeper: its circle, its two axes, and the two dots that are the
    // tip's cos and sin — they slide along the axes as the bar turns.
    const sw = SECTION.sweep;
    const pc = this._w(lane(sw.lane), sw.pivot, 0.05);
    const ring = new THREE.Mesh(new THREE.RingGeometry(sw.arm.R - 0.06, sw.arm.R + 0.06, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: ARM_COL, transparent: true, opacity: 0.6, toneMapped: false, depthWrite: false }));
    ring.position.set(pc.x, pc.y, pc.z);
    this.root.add(ring);
    const R = sw.arm.R;
    this._strip(lane(sw.lane) - R, sw.pivot, lane(sw.lane) + R, sw.pivot, 0.06, HOLO.cyan, 0.6, 0.06);
    this._strip(lane(sw.lane), sw.pivot - R, lane(sw.lane), sw.pivot + R, 0.06, HOLO.gold, 0.6, 0.06);
    const dot = (col) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: col, toneMapped: false }));
      this.root.add(m);
      return m;
    };
    this.cosDot = dot(HOLO.cyan);
    this.sinDot = dot(HOLO.gold);
    // The curtains' frames: two tall posts at the lane's edges.
    const gp = SECTION.gaps;
    for (const b of gp.curtains) {
      for (const s of [-1, 1]) {
        const q = this._w(lane(gp.lane) + s * LANE_HALF, b);
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 4.6, 6).translate(0, 2.3, 0),
          new THREE.MeshBasicMaterial({ color: CURTAIN_COL, toneMapped: false }));
        m.position.set(q.x, q.y, q.z);
        this.root.add(m);
      }
    }
  }

  /** The stones: decks like any other, moved every frame. */
  _buildStones() {
    this.stoneDecks = stones(LEVELS[0], 0).map((s) => {
      const q = this._w(s.a, s.b, s.y);
      const d = this.sim.addTempDisc({ x: q.x, z: q.z, r: s.r, y: q.y, colour: HOLO.cyan, name: 'sine-stone' });
      d._y0 = q.y;
      return d;
    });
  }

  /**
   * THE BEAMS, AND THEIR SHADOWS. "lack of shadows on the lasers, shape of
   * the lasers": the old bar was a 0.3 tube with nothing under it, and from
   * behind a kitten there was no telling how high it was. Each beam is now a
   * thicker glowing core with an emitter at each end, and a shadow on the
   * floor straight under it — sharp and dark when the bar is low, wide and
   * faint when it is high — which is the cue a runner reads its height by.
   *
   * A BLACK SHADOW ALONE DID NOT READ. Browser-checked at 1280x720: at 0.36 on
   * this near-black teal floor it was there and nobody could see it. So under
   * every beam there is also its FOOTPRINT, a strip of its own colour on the
   * floor (narrow and bright when the bar is low, wide and faint when high),
   * and the bars and the sweeper stand on DROP LINES, a thin line from each
   * emitter to the floor, so the height is read against its own post as well
   * as off the floor. The curtains get no drop lines: their posts already are.
   */
  _buildBeams() {
    const list = beams(LEVELS[0], 0);
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true).rotateX(Math.PI / 2);
    const cap = new THREE.SphereGeometry(1, 10, 8);
    const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    // Unit height, base at 0: scale.y IS the beam's height above the floor.
    const pole = new THREE.CylinderGeometry(0.05, 0.05, 1, 6, 1, true).translate(0, 0.5, 0);
    this.beamFx = list.map((q) => {
      const col = q.sec === 'sweep' ? ARM_COL : q.sec === 'gaps' ? CURTAIN_COL : BAR_COL;
      const g = new THREE.Group();
      const core = new THREE.Mesh(cyl, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, toneMapped: false }));
      const glow = new THREE.Mesh(cyl, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5, toneMapped: false, depthWrite: false }));
      g.add(core, glow);
      const ends = [0, 1].map(() => {
        const m = new THREE.Mesh(cap, new THREE.MeshBasicMaterial({ color: col, toneMapped: false }));
        m.scale.setScalar(0.24);
        this.root.add(m);
        return m;
      });
      const shadow = new THREE.Mesh(flat, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false }));
      shadow.renderOrder = 1;
      const foot = new THREE.Mesh(flat, new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      }));
      foot.renderOrder = 2;
      const drops = q.sec === 'gaps' ? [] : [0, 1].map(() => {
        const m = new THREE.Mesh(pole, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7, toneMapped: false, depthWrite: false }));
        this.root.add(m);
        return m;
      });
      this.root.add(g, shadow, foot);
      return { g, core, glow, ends, shadow, foot, drops, thick: q.thick };
    });
  }

  _buildPlaza() {
    const I = this.isle;
    this.kiosks = [];
    const kq = this._w(PLAZA.kiosk.a, PLAZA.kiosk.b);
    this.kiosk = new Kiosk(this.dream, {
      x: kq.x, z: kq.z, y: I.y, r: 1.6, colour: HOLO.cyan, kanji: '正弦', title: 'THE COURSE', near: 5,
      cardH: 3.8,
      card: (p) => this._card(p),
      prompt: (p, key) => this._prompt(p, key),
      interact: (p) => this.join(p),
    });
    this.kiosks.push(this.kiosk);
    // 応援 THE STANDS: a deck up off the plaza, walled all round. Nobody walks
    // on; you are put there by joining, and you leave by its exit pad.
    const S = PLAZA.stands;
    const sq = this._w(S.a, S.b, S.lift);
    this.standDeck = this.sim.addTempDisc({ x: sq.x, z: sq.z, r: S.r, y: sq.y, colour: HOLO.gold, name: 'sine-stands' });
    this.standPosts = [];
    for (let k = 0; k < 40; k++) {
      const th = (k / 40) * Math.PI * 2;
      const x = sq.x + Math.cos(th) * S.wall; const z = sq.z + Math.sin(th) * S.wall;
      this.sim.solids.push({ x, z, r: 0.35 });
      this.standPosts.push({ x, z });
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 5).translate(0, 0.6, 0),
        new THREE.MeshBasicMaterial({ color: HOLO.gold, transparent: true, opacity: 0.75, toneMapped: false }));
      m.position.set(x, sq.y, z);
      this.root.add(m);
    }
    this.standSign = new HoloPanel({ w: 3.8, h: 1.4, px: 80, edge: HOLO.gold });
    this.standSign.position.set(sq.x, sq.y + 3.6, sq.z);
    this.standSign.set([
      { text: '応援', size: 2.2, color: HOLO.gold, glow: true, jp: true },
      { text: 'THE STANDS', size: 1.2 },
    ], HOLO.gold);
    this.root.add(this.standSign);
    const eq = this._w(PLAZA.exit.a, PLAZA.exit.b, S.lift);
    this.exitKiosk = new Kiosk(this.dream, {
      x: eq.x, z: eq.z, y: eq.y, r: 0.9, colour: HOLO.gold, kanji: '出口', title: 'LEAVE', near: 1.6, cardH: 2.2,
      card: (p) => [
        { text: '出口 LEAVE THE STANDS', size: 1.5, color: HOLO.gold, jp: true },
        { text: this._ran(p) ? 'your time stays on the board' : 'you give up your place in the queue', size: 1.0 },
      ],
      prompt: (p, key) => (this.inStands(p) ? `[${key}]  LEAVE THE STANDS` : ''),
      interact: (p) => this.leave(p),
    });
    this.kiosks.push(this.exitKiosk);
    // The board: who has run, how fast, who is next.
    const bq = this._w(PLAZA.board.a, PLAZA.board.b, PLAZA.board.lift);
    this.board = new HoloPanel({ w: 7.2, h: 4.6, px: 90, edge: HOLO.cyan });
    this.board.position.set(bq.x, bq.y, bq.z);
    this.root.add(this.board);
    this._paintBoard();
  }

  /* ----------------------------- who is where ---------------------------- */

  _name(p) { return p.style?.name ?? p.name; }

  tier(p) {
    let n = 0;
    while (n < LEVELS.length - 1 && this.dream.progress.stars(this._name(p), `sine.L${n + 1}`) >= 2) n++;
    return n;
  }

  /** Is she in the session at all — running, queued, or done and watching? */
  inSession(p) {
    const S = this.session;
    return !!(S && p && (S.runner === p.index || S.stands.has(p.index)));
  }

  inStands(p) { return !!(this.session && p && this.session.stands.has(p.index)); }

  runner() {
    const i = this.session?.runner;
    return i == null ? null : this.dream.game.players?.[i] ?? null;
  }

  _ran(p) { return !!this.session?.results.some((r) => r.i === p.index); }

  /** Her place on the island: `a` along it, `b` across. */
  laneCoords(p) {
    const f = this.isle.fwd;
    const x = p.position.x - SIM.dx - this.isle.x;
    const z = p.position.z - SIM.dz - this.isle.z;
    return { a: x * f.x + z * f.z, b: -x * f.z + z * f.x };
  }

  /** Put her at an island point, facing +b (the way lane A runs) or `face`. */
  _place(p, a, b, lift = 0, face = 1) {
    const q = this._w(a, b, lift);
    this.dream.shards?.burst?.(p.position.x - SIM.dx, p.position.y + 1, p.position.z - SIM.dz, p.style?.colour ?? HOLO.cyan, 16, 4, 5);
    p.position.set(q.x + SIM.dx, q.y + 0.05, q.z + SIM.dz);
    p.velocity?.set(0, 0, 0);
    const f = this.isle.fwd;
    p.facing = Math.atan2(-f.z * face, f.x * face);
    this.dream.shards?.burst?.(q.x, q.y + 1, q.z, p.style?.colour ?? HOLO.cyan, 16, 4, 5);
  }

  _toStands(p) {
    const S = PLAZA.stands;
    const slot = [...this.session.stands].indexOf(p.index);
    const th = (Math.max(0, slot) / 4) * Math.PI * 2 + 0.6;
    this._place(p, S.a + Math.cos(th) * 1.6, S.b + Math.sin(th) * 1.6, S.lift);
  }

  _toPlaza(p) {
    const o = PLAZA.out[p.index % PLAZA.out.length];
    this._place(p, o.a, o.b, 0);
  }

  /* -------------------------------- joining ------------------------------- */

  _prompt(p, key) {
    const S = this.session;
    if (!S) return `[${key}]  RUN THE COURSE · L${this.tier(p) + 1}`;
    const ahead = (S.runner != null ? 1 : 0) + S.queue.length;
    return `[${key}]  JOIN THE QUEUE · L${S.level + 1} · ${ahead} ahead`;
  }

  _card(p) {
    const S = this.session;
    const n = S ? S.level : this.tier(p);
    const row = LEVELS.map((_, i) => {
      if (i > this.tier(p)) return `L${i + 1} locked`;
      const best = this.dream.progress.best(this._name(p), `sine.L${i + 1}`);
      return `L${i + 1} ${stars3(this.dream.progress.stars(this._name(p), `sine.L${i + 1}`))}${best != null ? ` ${best.toFixed(1)}s` : ''}`;
    }).join('   ');
    return [
      { text: '正弦 SINE GAUNTLET', size: 1.9, color: HOLO.cyan, glow: true, jp: true },
      { text: 'six obstacles, one runner at a time, best time wins', size: 1.0, color: 0x9fefff },
      { text: S ? `L${n + 1} · ${S.queue.length + (S.runner != null ? 1 : 0)} in the queue` : `your level: L${n + 1}`, size: 1.2, color: HOLO.gold },
      { text: 'no orbs, no clan in here: just you', size: 1.0, color: 0x9fefff },
      { text: row, size: 1.1, color: HOLO.gold },
    ];
  }

  /** Into the queue — or, if nobody is running it, straight to the start. */
  join(p) {
    if (this.inSession(p)) return false;
    const fresh = !this.session;
    if (fresh) {
      this.session = { level: this.tier(p), runner: null, queue: [], stands: new Set(), results: [], gap: 0 };
    }
    const S = this.session;
    this.dream.bench(p, 'the course');
    if (fresh) {
      this._startRun(p);
    } else {
      S.queue.push(p.index);
      S.stands.add(p.index);
      this._toStands(p);
      const ahead = (S.runner != null ? 1 : 0) + S.queue.length - 1;
      this.dream.game.toast?.(`${p.name} is in the queue — ${ahead} ahead. Cheer with ATTACK!`, p.index);
    }
    this.dream.game.sfx?.('rez');
    this._paintBoard();
    return true;
  }

  /** Out of the stands by its exit pad: her place in the queue goes, her time
   *  (if she ran) stays on the board. */
  leave(p) {
    const S = this.session;
    if (!S || !S.stands.has(p.index)) return false;
    S.stands.delete(p.index);
    S.queue = S.queue.filter((i) => i !== p.index);
    this._toPlaza(p);
    this.dream.unbench(p);
    this.dream.game.toast?.(`${p.name} left the stands`, p.index);
    this._paintBoard();
    this._maybeClose();
    return true;
  }

  /** She left the simulator, or the game: out of it, nothing kept but her
   *  time. Called by `DreamDojo._leaveSim` BEFORE it takes her kit apart, so
   *  the holo clan the rack was holding is back on her for it to undo. */
  forget(p) {
    const S = this.session;
    if (!S || !p) return;
    S.stands.delete(p.index);
    S.queue = S.queue.filter((i) => i !== p.index);
    if (S.runner === p.index) {
      const d = this.dream.drills[p.index];
      if (this.run?.drill === d) this._record(d);
      this.run = null;
      S.runner = null;
    }
    this.dream.unbench(p, true);
    this._next();
  }

  /** Everybody out at once (a scene, the tournament, a restart). */
  reset() {
    const S = this.session;
    if (!S) return;
    for (const p of this.dream.game.players ?? []) if (p && this.inSession(p)) this.dream.unbench(p, true);
    this.last = S.results.length ? { level: S.level, results: S.results } : this.last;
    this.session = null;
    this.run = null;
    this._paintBoard();
  }

  /* -------------------------------- running ------------------------------- */

  _startRun(p) {
    const S = this.session;
    S.runner = p.index;
    S.stands.delete(p.index);
    this._place(p, START.a, START.b, 0, 1);
    const isle = this.isle;
    const spec = COURSE(this, S.level);
    this.dream.startDrill(p, spec, { x: isle.x, y: isle.y, z: isle.z, r: isle.r, fwd: isle.fwd });
    this.run = { i: p.index, drill: this.dream.drills[p.index], sMax: 0, cp: 0, zaps: 0, safeT: 0, hold: 0, zapT: 0 };
    this.dream.game.toast?.(`${p.name} — on your mark! L${S.level + 1}`, p.index);
  }

  /** A zap or a fall: back to the checkpoint she has earned. */
  zap(p, why) {
    const r = this.run;
    if (!r || r.safeT > 0) return;
    const sec = SECTIONS[r.cp];
    r.zaps++;
    r.safeT = SAFE_T;
    r.zapT = 1.4;
    r.why = why;
    this.dream.game.sfx?.('zap');
    this._place(p, LANES[sec.lane], sec.cp, 0, sec.lane === 1 ? -1 : 1);
  }

  _record(d) {
    const S = this.session;
    if (!S || !d || S.results.some((x) => x.i === d.p.index)) return;
    const won = d.state === 'won';
    S.results.push({
      i: d.p.index, name: d.p.name, colour: d.p.style?.colour ?? HOLO.cyan,
      time: won ? d.t : null, stars: won ? (d.stars_ ?? 1) : 0,
      cp: this.run?.cp ?? 0, zaps: this.run?.zaps ?? 0,
    });
  }

  /** The run just ended (its drill has gone): who is next, or is it over? */
  _next() {
    const S = this.session;
    if (!S || S.runner != null) return;
    const players = this.dream.game.players ?? [];
    while (S.queue.length) {
      const i = S.queue.shift();
      const p = players[i];
      if (p && this.dream.realmOf(p) === 'sim') { this._startRun(p); this._paintBoard(); return; }
      S.stands.delete(i);
    }
    this._maybeClose();
  }

  /** Nobody running and nobody waiting: the board says who won, and the
   *  stands empty. */
  _maybeClose() {
    const S = this.session;
    if (!S || S.runner != null || S.queue.length) return;
    const players = this.dream.game.players ?? [];
    for (const i of [...S.stands]) {
      const p = players[i];
      if (p) { this._toPlaza(p); this.dream.unbench(p); }
    }
    S.stands.clear();
    const ranked = rank(S.results);
    if (ranked.length > 1 && ranked[0].time != null) {
      this.dream.holoSay?.(`${ranked[0].name} wins the Sine Gauntlet — ${ranked[0].time.toFixed(1)} seconds!`, 6);
      this.dream.game.sfx?.('firework');
    }
    this.last = { level: S.level, results: S.results };
    this.session = null;
    this.run = null;
    this._paintBoard();
  }

  /** Called every frame by the drill while she is live (see `COURSE`). */
  _tick(d, dt) {
    const r = this.run;
    if (!r || r.drill !== d) return;
    const p = d.p;
    const L = LEVELS[this.session.level];
    r.safeT = Math.max(0, r.safeT - dt);
    r.zapT = Math.max(0, r.zapT - dt);
    const q = this.laneCoords(p);
    const feet = p.position.y - this.isle.y;
    const s = pathS(q.a, q.b);
    if (s > r.sMax && Math.abs(s - r.sMax) < 6) r.sMax = s;
    r.cp = checkpointFor(r.sMax);
    if (feet < -FALL) { this.zap(p, 'fell'); return; }
    const hit = hitAt(L, q.a, q.b, Math.max(0, feet), d.t, { height: p.height ?? 2.6 });
    if (hit) { this.zap(p, hit); return; }
    if (r.sMax >= FINISH_S - 0.3 && Math.abs(q.a - LANES[2]) < LANE_HALF) d.progress();
    if (d.state === 'live' && d.t >= COURSE_TIME) d.fail(`Time! You reached ${SECTIONS[r.cp].name}`);
    if (r.holding) {
      r.hold += dt;
      if (r.hold >= STOP_HOLD && d.state === 'live') d.fail('You stopped your run');
    } else r.hold = 0;
    r.holding = false;
  }

  /* -------------------------------- a frame ------------------------------- */

  /** The run's own clock while one is live (so every runner faces the same
   *  course from GO), and the island's otherwise, so it moves from the bridge. */
  _clock() {
    const d = this.run?.drill;
    if (d && d.state === 'live') return { L: LEVELS[this.session.level], t: d.t };
    if (d && d.state === 'ready') return { L: LEVELS[this.session.level], t: 0 };
    return { L: LEVELS[this.session?.level ?? 0], t: this.dream.t ?? 0 };
  }

  update(dt) {
    const inside = idleIn(this.dream);
    for (const k of this.kiosks) k.update(dt, inside);
    const S = this.session;
    // The runner's drill has gone: write her down, and on to the next.
    if (S && this.run && this.dream.drills[this.run.i] !== this.run.drill) {
      this._record(this.run.drill);
      const p = this.dream.game.players?.[this.run.i];
      S.runner = null;
      this.run = null;
      if (p && this.dream.realmOf(p) === 'sim') {
        if (S.queue.length) { S.stands.add(p.index); this._toStands(p); } else S.stands.add(p.index);
      }
      this._next();
      this._paintBoard();
    }
    // Held at the start until GO — the line is a line.
    const d = this.run?.drill;
    if (d && d.state === 'ready') {
      const p = d.p;
      const q = this.laneCoords(p);
      if (q.b > START_LINE - 0.4) {
        const w = this._w(q.a, START_LINE - 0.4);
        p.position.x = w.x + SIM.dx;
        p.position.z = w.z + SIM.dz;
      }
    }
    const { L, t } = this._clock();
    this._paintCourse(L, t);
    this._boardT = (this._boardT ?? 0) - dt;
    if (this._boardT <= 0 && this.session) { this._boardT = 0.25; this._paintBoard(); }
  }

  /** Every beam, stone and dot, from course.js at `t`. The ONLY writer. */
  _paintCourse(L, t) {
    const list = beams(L, t);
    const I = this.isle;
    list.forEach((q, k) => {
      const fx = this.beamFx[k];
      const a = this._w(q.a0, q.b0, q.y0); const b = this._w(q.a1, q.b1, q.y1);
      const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      fx.g.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      fx.g.lookAt(b.x + this.sim.root.position.x, b.y + this.sim.root.position.y, b.z + this.sim.root.position.z);
      fx.core.scale.set(q.thick * 0.35, q.thick * 0.35, len);
      fx.glow.scale.set(q.thick * 1.15, q.thick * 1.15, len);
      fx.glow.material.opacity = 0.42 + 0.12 * Math.sin((this.dream.t ?? 0) * 24 + k);
      fx.ends[0].position.set(a.x, a.y, a.z);
      fx.ends[1].position.set(b.x, b.y, b.z);
      // The shadow: straight down, sharper and darker the lower the beam.
      const h = (q.y0 + q.y1) / 2;
      fx.shadow.position.set((a.x + b.x) / 2, I.y + 0.025, (a.z + b.z) / 2);
      fx.shadow.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      const flen = Math.hypot(b.x - a.x, b.z - a.z);
      fx.shadow.scale.set(0.35 + h * 0.22, 1, flen);
      fx.shadow.material.opacity = THREE.MathUtils.clamp(0.85 - h * 0.12, 0.3, 0.8);
      fx.foot.position.set(fx.shadow.position.x, I.y + 0.04, fx.shadow.position.z);
      fx.foot.rotation.y = fx.shadow.rotation.y;
      fx.foot.scale.set(0.12 + h * 0.07, 1, flen);
      fx.foot.material.opacity = THREE.MathUtils.clamp(0.95 - h * 0.15, 0.25, 0.9);
      fx.drops.forEach((m, n) => {
        const e = n ? b : a;
        const y = n ? q.y1 : q.y0;
        m.position.set(e.x, I.y, e.z);
        m.scale.set(1, Math.max(0.01, y), 1);
      });
    });
    stones(L, t).forEach((s, n) => {
      const d = this.stoneDecks[n];
      d.y = I.y + s.y;
      if (d._grp) d._grp.position.y = d.y - d._y0;
    });
    const sw = SECTION.sweep;
    const e = sweepEnds(sw, t, L.speed);
    const c = this._w(e.p.a, sw.pivot, 0.12);
    const s2 = this._w(LANES[sw.lane], e.p.b, 0.12);
    this.cosDot.position.set(c.x, c.y, c.z);
    this.sinDot.position.set(s2.x, s2.y, s2.z);
    const live = this.run?.drill?.state === 'live';
    this.zapFloor.material.opacity = live ? 0.22 + 0.1 * Math.sin((this.dream.t ?? 0) * 6) : 0.12;
  }

  /** The board's lines: this session, or the last one. */
  _paintBoard() {
    const S = this.session;
    const src = S ?? this.last;
    const lines = [{ text: '正弦 THE COURSE', size: 1.7, color: HOLO.cyan, glow: true, jp: true }];
    if (!src) {
      lines.push({ text: 'Nobody has run it yet.', size: 1.2 });
      lines.push({ text: 'Step on the kiosk to start.', size: 1.0, color: 0x9fefff });
    } else {
      lines.push({ text: `${S ? 'NOW' : 'LAST TIME'} · L${src.level + 1}`, size: 1.1, color: HOLO.gold });
      rank(src.results).slice(0, 4).forEach((r, k) => {
        const what = r.time != null ? `${r.time.toFixed(1)}s ${stars3(r.stars)}` : `reached ${SECTIONS[r.cp].name}`;
        lines.push({ text: `${k + 1}. ${r.name}  ${what}`, size: 1.05, color: r.colour });
      });
      if (S) {
        const rp = this.runner();
        const d = this.run?.drill;
        if (rp && d) lines.push({ text: `RUNNING: ${rp.name}  ${d.state === 'ready' ? 'ready…' : `${d.t.toFixed(1)}s`}`, size: 1.05, color: HOLO.gold });
        const players = this.dream.game.players ?? [];
        if (S.queue.length) lines.push({ text: `NEXT: ${S.queue.map((i) => players[i]?.name ?? '?').join(', ')}`, size: 1.0, color: 0x9fefff });
      }
    }
    const sig = lines.map((l) => l.text).join('|');
    if (sig === this._boardSig) return;
    this._boardSig = sig;
    this.board.set(lines, HOLO.cyan);
  }

  /* ------------------------------- cheering ------------------------------- */

  /** A kitten in the stands pressing ATTACK cheers: a burst in her colour
   *  over her head. Throttled, so mashing is a cheer and not a firehose. */
  cheerPad(p, pad) {
    if (!this.inStands(p) || !pad?.pressed?.('attack')) return;
    this._cheerAt ??= new Map();
    const last = this._cheerAt.get(p.index) ?? -9;
    const now = this.dream.t ?? 0;
    if (now - last < 0.5) return;
    this._cheerAt.set(p.index, now);
    this.dream.shards?.burst?.(p.position.x - SIM.dx, p.position.y + (p.height ?? 2.6) + 0.6, p.position.z - SIM.dz,
      p.style?.colour ?? HOLO.gold, 18, 5, 6);
    this.dream.game.sfx?.('star', 0.4);
  }

  /** The runner's pad, watched (never consumed): a held INTERACT stops it. */
  watchPad(d, pad) {
    if (this.run?.drill === d && pad?.down?.('interact')) this.run.holding = true;
  }

  /* -------------------------------- cameras ------------------------------- */

  /** Where the runner is — or the start, between runs — in the world. */
  _shotCentre() {
    const p = this.runner();
    const c = (this._centre ??= new THREE.Vector3());
    if (p && this.run?.drill) return c.set(p.position.x, p.position.y + COURSE_CAM.lift, p.position.z);
    const q = this._w(START.a, START.b, COURSE_CAM.lift);
    return c.set(q.x + SIM.dx, q.y, q.z + SIM.dz);
  }

  /** The yaw that puts the lens on the +a side of the lanes, looking back
   *  across them — kept within half a turn of the walking camera's, which is
   *  what `_updateCamera` lerps it from. */
  _yaw() {
    const f = this.isle.fwd;
    let y = Math.atan2(f.x, f.z);
    const home = -Math.PI * 0.25;
    while (y - home > Math.PI) y -= Math.PI * 2;
    while (y - home < -Math.PI) y += Math.PI * 2;
    return y;
  }

  /** Her camera while she is in the session, or null — a focus with `aim`,
   *  so it is the runner who is framed, not her. */
  cameraFocus(p) {
    if (!this.inSession(p)) return null;
    const f = (this._focus ??= { centre: new THREE.Vector3(), aim: true, dist: COURSE_CAM.dist, pitch: COURSE_CAM.pitch, yaw: 0 });
    f.centre.copy(this._shotCentre());
    f.yaw = this._yaw();
    return f;
  }

  /** For the split screen: a kitten in the session stands where the runner
   *  is, so the whole session is one group and shares one pane. */
  paneAnchor(p) {
    if (!this.inSession(p)) return null;
    return this._shotCentre();
  }

  /** The shared rig's shot for a group, or null: only when every kitten in
   *  it is in the session. */
  groupShot(members) {
    const players = this.dream.game.players ?? [];
    if (!this.session || !members?.length || !members.every((i) => this.inSession(players[i]))) return null;
    const g = (this._group ??= { centre: new THREE.Vector3(), dist: COURSE_CAM.dist, pitch: COURSE_CAM.pitch, yaw: 0 });
    g.centre.copy(this._shotCentre());
    g.yaw = this._yaw();
    return g;
  }

  faceCamera(camera) {
    for (const k of this.kiosks) k.faceCamera(camera);
    this.board.faceCamera(camera);
    this.standSign.faceCamera(camera);
  }
}

/** Finished first, fastest first; then the rest, furthest first. */
export function rank(results) {
  return [...results].sort((x, y) => {
    if ((x.time != null) !== (y.time != null)) return x.time != null ? -1 : 1;
    if (x.time != null) return x.time - y.time;
    return (y.cp - x.cp) || (x.zaps - y.zaps);
  });
}

/* ------------------------------- the drill ------------------------------- */

/** The run as a drill: GO, a clock, and the card over her head. Hits, the
 *  checkpoints and the finish are `SineGauntlet._tick`. */
function COURSE(G, n) {
  const L = LEVELS[n];
  return {
    id: `sine.L${n + 1}`, title: `THE COURSE · L${n + 1}`, kanji: '正弦',
    goalText: 'Six obstacles to the gold line',
    goal: 1, showCount: false, bands: COURSE_BANDS[n], lowerIsBetter: true,
    grace: 3, leaveR: 60, noBar: true,
    caught: () => true,
    pad: (d, pad) => G.watchPad(d, pad),
    tick: (d, dt) => G._tick(d, dt),
    paint(d) {
      const r = G.run?.drill === d ? G.run : null;
      if (d.state === 'ready') {
        return [
          { text: `正弦 THE COURSE · L${n + 1}`, size: 1.6, color: d.colour, glow: true, jp: true },
          { text: 'zapped or fallen: back to the last line', size: 1.1 },
          { text: d.readyT > 2 ? '3' : d.readyT > 1 ? '2' : '1', size: 2.4, color: HOLO.gold, glow: true },
        ];
      }
      if (d.state !== 'live' || !r) return null;
      const sec = SECTIONS[Math.min(SECTIONS.length - 1, nextSection(r.sMax))];
      const lines = [{ text: `${sec.name}`, size: 1.5, color: d.colour, glow: true }];
      if (r.zapT > 0) lines.push({ text: `ZAP! back to ${SECTIONS[r.cp].name}`, size: 1.4, color: 0xff8a8a });
      else lines.push(working(sec, L, d.t, r));
      const hold = r.hold > 0 ? `  ·  stopping… ${Math.max(0, STOP_HOLD - r.hold).toFixed(1)}` : '';
      lines.push({ text: `${d.t.toFixed(1)}s   zaps ${r.zaps}${hold}`, size: 1.3, color: HOLO.cyan });
      return lines;
    },
  };
}

/** The section she is in or about to reach. */
function nextSection(sMax) {
  let k = 0;
  for (let i = 0; i < CP_S.length; i++) if (sMax >= CP_S[i] - 0.25) k = i;
  return k;
}

/** The working for the section she is in — the same numbers as the beams. */
function working(sec, L, t, r) {
  const sp = L.speed;
  if (sec.bars) {
    // The first bar of this section she has not passed yet.
    const q = sec.bars.findIndex((b) => pathS(LANES[sec.lane], b) > r.sMax);
    const n = q < 0 ? sec.bars.length - 1 : q;
    const w = barWorking(sec.wave, t, n, sp);
    return { text: `${w.text} → ${w.word}`, size: 1.1, color: w.word === 'WAIT…' ? 0xff8a8a : 0x8bff9a };
  }
  if (sec.stones) {
    const ys = sec.stones.map((_, n) => stoneHeight(sec, t, n, sp).toFixed(1)).join('  ');
    return { text: `stones: y = ${sec.stone.H} + ${sec.stone.A}·sin(…)   ${ys}`, size: 1.05, color: HOLO.gold };
  }
  if (sec.arm) {
    const e = sweepEnds(sec, t, sp);
    const deg = ((Math.round((e.th * 180) / Math.PI) % 360) + 360) % 360;
    return { text: `θ ${deg}°   cos ${Math.cos(e.th).toFixed(2)}   sin ${Math.sin(e.th).toFixed(2)}`, size: 1.15, color: HOLO.gold };
  }
  if (sec.curtains) {
    const q = sec.curtains.findIndex((b) => pathS(LANES[sec.lane], b) > r.sMax);
    const i = q < 0 ? sec.curtains.length - 1 : q;
    const off = gapCentre(sec, t, i, sp) - LANES[sec.lane];
    return { text: `gap ${i + 1} at ${sec.gap.A}·sin(…) = ${off >= 0 ? '+' : ''}${off.toFixed(1)}`, size: 1.15, color: HOLO.gold };
  }
  return { text: waveText(SECTIONS[0].wave, sp), size: 1.1 };
}

export { groundAt };
