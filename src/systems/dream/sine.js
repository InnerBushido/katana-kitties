import * as THREE from 'three';
import { SIM, HOLO } from '../../world/simworld.js';
import { HoloPanel } from './holo.js';
import { Kiosk, idleIn, isleSpot, stars3 } from './kiosk.js';
import { SINE_BOARD, sineBoardLines, sineFilterRows } from './sineboard.js';
import {
  LEVELS, LANES, HALVES, WALLS, START, START_LINE, SECTIONS, SECTION, FINISH_B, END_B, COURSE_A,
  ARMS, MATH_ARM, LEDGES, beams, stones, groundAt, hitAt, pathS, CP_S, FINISH_S, advance, laneOf,
  barWorking, waveText, sweepEnds, gapCentre, stoneHeight, stoneIsCos, COURSE_BANDS, COURSE_TIME,
  COURSES, COURSE_ID, courseById, useCourse, starsId, EXTRA_L, HARD_L,
} from './course.js';

export { LEVELS, COURSE_BANDS, COURSES };

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
       time is the score. AND NO GRACE AFTER IT. Richard: "the player has
       invulnerability for a short amount of time when respawning in the
       course, they should not have invulnerability as its like cheating."
       There was 0.9s of it (SAFE_T), and you could run straight through a
       beam on it. Every checkpoint is instead a spot no beam ever reaches,
       which world-check samples every 0.02s on every level.
     · NO CHECKPOINT CAN BE SKIPPED: `advance` (course.js) is how far she has
       got, and a step that would leap one puts her back at it.
     · THE SLIDING GAPS ARE FILMED FROM BEHIND HER. "we need the camera angle
       to change as players can't see where they need to go in the side view,
       should be over the shoulder front view at that point" — side-on, a gap
       sliding across her lane slides toward and away from the lens, which is
       the one direction a picture cannot show.

   NOTHING HERE HURTS ANYBODY. A zap is `hitAt` (course.js) answered with a
   teleport; nothing here hurts anybody, and the SIM bar is not touched.
--------------------------------------------------------------------------- */

/** The plaza, behind the course (a < −17): where things stand. */
export const PLAZA = {
  kiosk: { a: -20, b: -4 },
  stands: { a: -21, b: 10, r: 4, lift: 2.2, wall: 3.75 },
  exit: { a: -21, b: 12.6 },
  board: { a: -20.5, b: -12, lift: 4.6 },
  /* 記 the Sine Board's kiosk (dream/sineboard.js): past the board's far
     corner, 2 in from the first wall and 1 inside the rim. At (-19.6, -9.4),
     under the board, its sign was behind the board from the bridge. */
  boardKiosk: { a: -19, b: -14.5 },
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

/* (GONE) STOP_HOLD: holding INTERACT 1.2s gave a run up. Nobody was told,
   and it dropped her in the stands. A press now ASKS (COURSE.quit), default
   no — which is what non-negotiable 7 wants of one press — and yes takes her
   out of the Gauntlet altogether (leaveGauntlet). Two ways to stop, one of
   them hidden, was one too many. */
/** Below the floor by this much is a fall. */
const FALL = 3;
/** A kitten inside the course's walls who is not its runner is walked back
 *  out to the plaza after this long. Richard: "It is also possible to get
 *  into the course and get stuck in it, we should have a way for the player
 *  to get out if the trial hasn't started yet as a fail safe." The walls are
 *  posts pushed out one at a time, and a dash can carry a kitten past a post's
 *  middle before the push sees her, so the way in is not sealed; the way OUT
 *  is what is guaranteed. Long enough that a hop over the rail and straight
 *  back is not a teleport, short enough that she is never stuck. */
export const STRAY_T = 1.5;

const BAR_COL = 0xff3b6b;
/** A twin, and the sweeper in the air: the beams that are there for the
 *  double jump, in their own colour so a kitten can tell up from down. */
const AIR_COL = 0x4fd8ff;
const ARM_COL = 0xffa23b;
const CURTAIN_COL = 0xb35cff;
/* 登竜 THE DRAGON GATE'S TWO NEW THINGS, each a colour nothing else on any
   course wears: a beam that never moves is lime and does not pulse (every
   other beam's glow flickers), and a ledge — a floor that stands still at a
   height — is pale, against the gold and cyan of the stones that ride a sine. */
export const FIXED_COL = 0x9dff3b;
export const LEDGE_COL = 0xe8f4ff;
/**
 * WHICH BEAMS ARE HERS NOW. Richard: "it's a bit hard to see which lasers are
 * on the course section you are on ... future ones, not currently active in
 * the course, the greenish color and the ones already completed by getting
 * past a checkpoint can be the grayed out color." Five lanes side by side put
 * every section's beams in her eye line at once. So while a run is live, only
 * the section she has reached (`run.cp`) wears its own colour; the ones ahead
 * are a dark holo green, and the ones she has passed are grey. They still
 * move and they still zap — this is paint, never the rule (`hitAt`). With
 * nobody running, all of them wear their own colours, for the stands.
 *
 * SECOND PASS: "let's make the lazers in the course ahead also gray so that
 * it is easier for the player to see which lasers they need to worry about.
 * We should make all the 'upcoming' lasers their normal colors if they are in
 * the same row or section that the player is, so that the player knows what
 * to expect next and not have to wait to get past the checkpoint before
 * enabling their colors." So the dark green is gone — ahead is the same grey
 * as done — and what is lit is her section AND everything still to come in
 * the LANE SHE IS STANDING IN (`run.lane`, read off her feet every frame), so
 * turning into a lane lights it before its checkpoint line.
 */
export const BEAM_DONE = { col: 0x4a4f57, core: 0x80858c, glow: 0.18, core_o: 0.35, foot: 0.25 };
export const BEAM_AHEAD = BEAM_DONE;
/** Which section a beam belongs to: the sweeper in the air is the stones'. */
const secOf = (q) => SECTIONS.findIndex((s) => s.key === (q.sec === 'air' ? 'stones' : q.sec));

/** The over-the-shoulder shot for the Sliding Gaps: this far behind her,
 *  this pitch, and the look-at this far AHEAD of her down the lane, so the
 *  next curtain is in the frame rather than her back filling it.
 *  Framed in the browser at 800x418, three tries:
 *    9.5 / 0.3 / lift 1.8 / lead 3.5 — she sat big at the bottom-middle, over
 *      the very gap she was aiming for;
 *    12 / 0.5 / lift 3 / lead 5 — the drill card landed dead centre, on the lane;
 *    10 / 0.36 / lift 1.6 / lead 5 — right shape, but the card was cut off
 *      under the HUD.
 *  13 / 0.36 / lift 1.6 / lead 5: card at the top, the next three curtains
 *  and their gaps in the middle, her head at the bottom.
 *  ...and her FEET under the bottom edge: Richard, "With the Narrow Gaps
 *  camera, it is okay, but camera should be panned down a bit so we can see
 *  the players feet." Measured through the 38° lens at 1.9:1, her feet were
 *  at −1.07 in NDC — off the frame. 14 / 0.42 / lift 0.8 / lead 4 puts them
 *  at −0.64 and her head at 0.00, the curtain ahead at −0.08. */
export const SHOULDER_CAM = { dist: 14, pitch: 0.42, lift: 0.8, lead: 4 };
/**
 * THE STONES FROM BEHIND HER (the Riptide's, which slide). Richard: "the
 * camera is too high up and maybe a bit too zoomed in that we can't see the
 * players feet or shadow, making it very difficult to land on the platform
 * when jumping. This camera can be more zoomed out since we need to see the
 * players feet and shadow when they are jumping." It was the Gaps' shot, and
 * its look-at rode up with her jump, so at the top of a hop the stone she
 * was coming down on — and her shadow on it — were under the frame (−1.65).
 * So this one is further back and steeper, and its look-at is PINNED to the
 * stones' own height (`pin`) instead of her: she rises in the frame and the
 * stones stay put. Measured (38°, 1.9:1): standing, feet and shadow at
 * −0.44; at the top of a jump her feet −0.07, her head 0.40, her shadow still
 * −0.44; the next stone 0.01 and the one after 0.31.
 */
export const STONES_CAM = { dist: 18, pitch: 0.55, lift: 1.0, lead: 3 };
/** How fast the lens swings between the side-on shot and that one (1/s). */
const CAM_EASE = 2.5;
/** The card over her head with the lens behind her (see `_fitCard`): this
 *  big, this far over her head, this opaque. Side-on it is 1, 2.3 and 1. */
export const CARD_BEHIND = { scale: 0.5, lift: 1.2, opacity: 0.6 };
/** How far before a `behind` stretch's checkpoint the lens starts to turn (see `_shoulder`). */
export const SHOT_AHEAD = 5;

/**
 * THE SWIPE, when the course is changed at the kiosk. Richard: "We can make
 * the current course cycle as if being swiped away visually (could be in a
 * circular rotation swipe away pattern, as if the circular center of the
 * swipe away direction is the center of the dojo of the turning circle) ...
 * the old level being swiped away and fading away in a cool way while the new
 * course is being swiped into place". So each course is drawn in its own
 * group hung off a pivot at the HUB'S centre, and a swipe turns the old one
 * `ang` round that pivot and out, fading, while the new one turns in from
 * `ang` the other side. At the Gauntlet's 150 from the hub, 0.36 rad is 54
 * units of travel: clean off the island's 26. The beams stay LIT the whole
 * way ("The LED's should be on of the course like normal"): the old one is
 * frozen at its last frame and the new one is live from its first.
 */
export const SWIPE = { dur: 1.6, ang: 0.36 };
/**
 * THE BIRD'S EYE, while a kitten is choosing. "The camera should zoom out in
 * such a way that we get a decent birds eye view of the entire course. The
 * camera can be rotating around the center of the island". A sway, not a
 * spin — `sway` radians either side of the side-on yaw, once every
 * 2π/`rate` seconds — because the player camera eases its yaw back by a
 * straight lerp when the focus lets go, and a yaw that had wound round twice
 * would unwind twice on the way out.
 */
export const BIRD = { dist: 74, pitch: 1.0, sway: 0.7, rate: 0.22, lift: 0 };
/** The course picker on her lens (HoloChoice `lens`): 0.32 of the frame tall,
 *  its centre left of middle and a little low. Clear of the HUD on top, the
 *  minimap's corner on the right, and the speaker card along the bottom —
 *  at ny -0.42 Lionheart's welcome covered its RUN row (browser, 800x475). */
export const PICK = { d: 12, h: 0.32, nx: -0.46, ny: -0.12 };

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
    /** Who has the course picker open, by seat — one driver (non-negotiable 7). */
    this.picking = null;
    /** A swipe in progress: { t, dir, out } — `out` the old course's view. */
    this.swipe = null;
    /** 記 What the board shows while nobody is running (dream/sineboard.js). */
    this.boardFilter = { course: 'gauntlet', level: 0, who: 'all' };
    /** When the last session ended, on the dream's clock: LAST TIME holds for SINE_BOARD.lastHold. */
    this.lastAt = -Infinity;
    this._buildWalls();
    this._buildLines();
    this.view = this._buildCourse();
    this._buildPlaza();
    this.stations = this.kiosks.map((k) => k.station);
    dream.sim.tickers.push((dt) => this.update(dt));
  }

  /* ------------------------------- building ------------------------------ */

  /* THE COURSE'S OWN DRAWING lives in `view` — one per course on the island,
     two during a swipe. These keep the names everything already reads. */
  get beamFx() { return this.view.beamFx; }
  get stoneDecks() { return this.view.stoneDecks; }
  get zapFloor() { return this.view.zapFloor; }
  get ledgeDecks() { return this.view.ledgeDecks; }
  get cosDot() { return this.view.cosDot; }
  get sinDot() { return this.view.sinDot; }
  get course() { return courseById(COURSE_ID); }

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
  _strip(a0, b0, a1, b1, w, colour, opacity, y = 0.04, into = this._into ?? this.root) {
    const p0 = this._w(a0, b0, y); const p1 = this._w(a1, b1, y);
    const len = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, toneMapped: false, depthWrite: false }));
    m.position.set((p0.x + p1.x) / 2, p0.y, (p0.z + p1.z) / 2);
    m.rotation.y = Math.atan2(p1.x - p0.x, p1.z - p0.z);
    into.add(m);
    return m;
  }

  /** The start and the finish: every course's, so they never swipe. */
  _buildLines() {
    const last = LANES.length - 1;
    this._strip(LANES[0] - HALVES[0], START_LINE, LANES[0] + HALVES[0], START_LINE, 0.35, 0xffffff, 0.8, 0.04, this.root);
    this._strip(LANES[last] - HALVES[last], FINISH_B, LANES[last] + HALVES[last], FINISH_B, 0.6, HOLO.gold, 0.9, 0.04, this.root);
  }

  /**
   * ONE COURSE'S DRAWING — the course `useCourse` has laid — in a group of its
   * own off a pivot at the hub's centre (see SWIPE). At rest the pivot turns
   * nothing, so every position in it is the layer's, as everything else is.
   */
  _buildCourse() {
    const dc = this.dream.game?.world?.dojoCentre ?? { x: 0, z: 0 };
    const pivot = new THREE.Group();
    pivot.position.set(dc.x, 0, dc.z);
    const inner = new THREE.Group();
    inner.position.set(-dc.x, 0, -dc.z);
    pivot.add(inner);
    this.root.add(pivot);
    const view = { id: COURSE_ID, pivot, inner, fade: 1 };
    this._into = inner;
    this._buildFloor(view);
    this._buildStones(view);
    this._buildBeams(view);
    this._into = null;
    /* Every material's own opacity, for the fade — and which of them the
       paint writes every frame anyway (`painted`), which the fade multiplies
       instead of overwriting. */
    view.mats = [];
    inner.traverse((o) => {
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) if (!view.mats.some((x) => x.m === m)) view.mats.push({ m, o0: m.opacity, tr: m.transparent });
    });
    view.painted = new Set([...view.zapFloors.map((z) => z.material), ...view.beamFx.flatMap((fx) => [fx.glow.material, fx.shadow.material, fx.foot.material, fx.core.material])]);
    return view;
  }

  /** The lines on the floor: checkpoints, the zap floor, and the sweeper's
   *  circle with its two axes — the cos and the sin. */
  _buildFloor(view) {
    const lane = (k) => LANES[k];
    const into = this._into;
    SECTIONS.forEach((sec, i) => {
      if (i === 0) return;
      const c = lane(sec.lane); const h = HALVES[sec.lane];
      this._strip(c - h, sec.cp, c + h, sec.cp, 0.18, HOLO.cyan, 0.55);
    });
    // Every floor that zaps: red, and it pulses while a run is live. The
    // stones' always; any other stretch's that has one (the Dragon Gate's).
    view.zapFloors = SECTIONS.filter((st) => st.floor).map((st) => {
      const c = lane(st.lane); const sh = HALVES[st.lane];
      const z = this._strip(c, st.floor[0], c, st.floor[1], sh * 2 - 0.3, 0xff2a4a, 0.22, 0.03);
      for (let b = st.floor[0] + 1; b < st.floor[1]; b += 1.5) this._strip(c - sh + 0.2, b, c + sh - 0.2, b, 0.06, 0xff6a80, 0.5, 0.035);
      if (st === SECTION.stones) view.zapFloor = z;
      return z;
    });
    // Every arm's circle on the floor under it.
    for (const arm of ARMS) {
      const pc = this._w(arm.pa, arm.pb, 0.05);
      const ring = new THREE.Mesh(new THREE.RingGeometry(arm.R - 0.06, arm.R + 0.06, 64).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: arm === MATH_ARM ? AIR_COL : ARM_COL, transparent: true, opacity: 0.6, toneMapped: false, depthWrite: false }));
      ring.position.set(pc.x, pc.y, pc.z);
      into.add(ring);
    }
    // THE ONE IN THE AIR is the unit circle's: its two axes on the floor, and
    // the two dots that are the tip's cos and sin — they slide along the axes
    // as it turns, which is the arm's SHADOW read as two numbers.
    const R = MATH_ARM.R;
    this._strip(MATH_ARM.pa - R, MATH_ARM.pb, MATH_ARM.pa + R, MATH_ARM.pb, 0.06, HOLO.cyan, 0.6, 0.06);
    this._strip(MATH_ARM.pa, MATH_ARM.pb - R, MATH_ARM.pa, MATH_ARM.pb + R, 0.06, HOLO.gold, 0.6, 0.06);
    const dot = (col) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: col, toneMapped: false }));
      into.add(m);
      return m;
    };
    view.cosDot = dot(HOLO.cyan);
    view.sinDot = dot(HOLO.gold);
    // The curtains' frames: two posts at the lane's edges, as tall as the
    // curtain's top beam and then some.
    const gp = SECTION.gaps;
    const top = Math.max(...gp.beams) + 0.6;
    for (const b of gp.curtains) {
      for (const s of [-1, 1]) {
        const q = this._w(lane(gp.lane) + s * HALVES[gp.lane], b);
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, top, 6).translate(0, top / 2, 0),
          new THREE.MeshBasicMaterial({ color: CURTAIN_COL, toneMapped: false }));
        m.position.set(q.x, q.y, q.z);
        into.add(m);
      }
    }
  }

  /** The stones: decks like any other, moved every frame. */
  _buildStones(view) {
    /* A SINE stone is gold and a COSINE one cyan — the colours of the sin and
       cos axes under the air sweeper, so the floor says which is which.
       Their drawing is moved into the course's group, so it swipes with it;
       the deck (what she stands on) stays the sim's. */
    view.stoneDecks = stones(LEVELS[0], 0).map((s) => {
      const q = this._w(s.a, s.b, s.y);
      const d = this.sim.addTempDisc({ x: q.x, z: q.z, r: s.r, y: q.y, colour: s.cos ? HOLO.cyan : HOLO.gold, name: 'sine-stone' });
      d._x0 = q.x; d._y0 = q.y; d._z0 = q.z;
      if (d._grp) this._into.add(d._grp);
      return d;
    });
    /* The ledges: decks that never move (course.js LEDGES), drawn into the
       course's group the same way — each on a POST down to the floor. Seen
       in the browser without one, from the side-on lens, a ledge 4 up and a
       ledge 1 up were the same white ring and the climb did not read as a
       climb at all; a post as tall as the ledge is its height, read against
       the next one's, which is what a jungle gym looks like. */
    const post = new THREE.CylinderGeometry(0.16, 0.16, 1, 8, 1, true).translate(0, -0.5, 0);
    view.ledgePosts = [];
    view.ledgeDecks = LEDGES.map((s) => {
      const q = this._w(s.a, s.b, s.y);
      const d = this.sim.addTempDisc({ x: q.x, z: q.z, r: s.r, y: q.y, colour: LEDGE_COL, name: 'sine-ledge' });
      if (d._grp) this._into.add(d._grp);
      const m = new THREE.Mesh(post, new THREE.MeshBasicMaterial({ color: LEDGE_COL, transparent: true, opacity: 0.55, toneMapped: false, depthWrite: false }));
      m.position.set(q.x, q.y - 0.05, q.z);
      m.scale.y = Math.max(0.01, s.y - 0.05);
      this._into.add(m);
      view.ledgePosts.push(m);
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
  _buildBeams(view) {
    const into = this._into;
    const list = beams(LEVELS[0], 0);
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true).rotateX(Math.PI / 2);
    const cap = new THREE.SphereGeometry(1, 10, 8);
    const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    // Unit height, base at 0: scale.y IS the beam's height above the floor.
    const pole = new THREE.CylinderGeometry(0.05, 0.05, 1, 6, 1, true).translate(0, 0.5, 0);
    view.beamFx = list.map((q) => {
      const col = q.fixed ? FIXED_COL : q.high ? AIR_COL : q.sec === 'sweep' ? ARM_COL : q.sec === 'gaps' ? CURTAIN_COL : BAR_COL;
      const g = new THREE.Group();
      const core = new THREE.Mesh(cyl, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, toneMapped: false }));
      const glow = new THREE.Mesh(cyl, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5, toneMapped: false, depthWrite: false }));
      g.add(core, glow);
      const ends = [0, 1].map(() => {
        const m = new THREE.Mesh(cap, new THREE.MeshBasicMaterial({ color: col, toneMapped: false }));
        m.scale.setScalar(0.24);
        into.add(m);
        return m;
      });
      const shadow = new THREE.Mesh(flat, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false }));
      shadow.renderOrder = 1;
      const foot = new THREE.Mesh(flat, new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      }));
      foot.renderOrder = 2;
      // No drop lines on a curtain or a wall of light: their posts (or their rows) already say how high.
      const drops = q.sec === 'gaps' || q.wall ? [] : [0, 1].map(() => {
        const m = new THREE.Mesh(pole, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7, toneMapped: false, depthWrite: false }));
        into.add(m);
        return m;
      });
      into.add(g, shadow, foot);
      return { g, core, glow, ends, shadow, foot, drops, thick: q.thick, col, secI: secOf(q), look: 'live', fixed: !!q.fixed };
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
      interact: (p) => this.interact(p),
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
        { text: !this.inStands(p) ? 'back down to the plaza' : this._ran(p) ? 'your time stays on the board' : 'you give up your place in the queue', size: 1.0 },
      ],
      // ANYBODY ON THE DECK, not only the session's. Richard: "it is possible
      // to jump into The Stands area when the trial hasn't started and then
      // the player gets stuck there because the Leave area isn't working" -
      // it asked `inStands`, which is false with no session, so a kitten who
      // got up there any other way had a pad that said nothing.
      prompt: (p, key) => (this.inStands(p) || this.onDeck(p) ? `[${key}]  LEAVE THE STANDS` : ''),
      interact: (p) => this.leave(p),
    });
    this.kiosks.push(this.exitKiosk);
    // The board: who has run, how fast, who is next.
    const bq = this._w(PLAZA.board.a, PLAZA.board.b, PLAZA.board.lift);
    this.board = new HoloPanel({ w: 7.2, h: 4.6, px: 90, edge: HOLO.cyan });
    this.board.position.set(bq.x, bq.y, bq.z);
    this.root.add(this.board);
    // 記 The leaderboard's filters (dream/sineboard.js) — the board above IS the leaderboard when idle.
    const bk = this._w(PLAZA.boardKiosk.a, PLAZA.boardKiosk.b);
    this.boardKiosk = new Kiosk(this.dream, {
      x: bk.x, z: bk.z, y: I.y, r: 1.2, colour: HOLO.gold, kanji: '記', title: 'SINE BOARD', near: 3.5,
      card: null,
      prompt: (p, key) => `[${key}]  CHANGE WHAT THE BOARD SHOWS`,
      interact: (p) => this.openBoardFilters(p),
    });
    this.kiosks.push(this.boardKiosk);
    this._paintBoard();
  }

  /** 記 One driver, whoever pressed; the page she leaves is what the next kitten sees. */
  openBoardFilters(p) {
    const name = p.style?.name ?? p.name;
    // Whatever the board was saying, it shows the page she is changing.
    this.lastAt = -Infinity;
    const rows = sineFilterRows(this, p, this.boardFilter, () => this._paintBoard());
    const k = this.boardKiosk;
    this.dream.openChoice(p, { title: `記 SINE BOARD — ${name}`, rows, start: 0, anchor: { x: k.x, y: k.y, z: k.z } });
    this._paintBoard();
    return true;
  }

  /* ----------------------------- who is where ---------------------------- */

  _name(p) { return p.style?.name ?? p.name; }

  /** The highest of L1-L3 she has opened on this course: two stars on one
   *  opens the next. 秘 EXTRA HARD is never a tier — it is picked (`extraOpen`). */
  tier(p, course = COURSE_ID) {
    let n = 0;
    while (n < HARD_L && this.dream.progress.stars(this._name(p), starsId(course, n)) >= 2) n++;
    return n;
  }

  /** 秘 EXTRA HARD on this course: three stars on its L3, or the debug panel's
   *  *open 秘 EXTRA HARD in the Sine Gauntlet* (`game._debugSineExtra`). */
  extraOpen(p, course = COURSE_ID) {
    return !!this.dream.game?._debugSineExtra || this.dream.progress.stars(this._name(p), starsId(course, HARD_L)) >= 3;
  }

  /** Can she pick level `n` here? An instruction if not (non-negotiable 6). */
  levelLock(p, n, course = COURSE_ID) {
    if (n === EXTRA_L) return this.extraOpen(p, course) ? null : `Get ★★★ on L${HARD_L + 1} of ${courseById(course).name} to open 秘 EXTRA HARD`;
    return n <= this.tier(p, course) ? null : `Get ★★ on L${n} of ${courseById(course).name} to open L${n + 1}`;
  }

  /** Is she in the session at all — running, queued, or done and watching? */
  inSession(p) {
    const S = this.session;
    return !!(S && p && (S.runner === p.index || S.stands.has(p.index)));
  }

  inStands(p) { return !!(this.session && p && this.session.stands.has(p.index)); }

  /** Standing up on the stands' deck, whoever put her there. */
  onDeck(p) {
    if (!p) return false;
    const S = PLAZA.stands;
    const q = this.laneCoords(p);
    const feet = p.position.y - this.isle.y;
    return Math.hypot(q.a - S.a, q.b - S.b) < S.wall + 0.5 && feet > S.lift - 0.8;
  }

  /** Inside the course's outer walls (the plaza is everything behind them). */
  inCourse(p) {
    if (!p) return false;
    const q = this.laneCoords(p);
    const feet = p.position.y - this.isle.y;
    return q.a > COURSE_A[0] && q.a < COURSE_A[1] && Math.abs(q.b) < END_B && feet > -FALL;
  }

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
    if (!S) {
      if (this.picking != null && this.picking !== p.index) return `${this._pickerName()} IS CHOOSING THE COURSE`;
      return `[${key}]  CHOOSE A COURSE`;
    }
    const ahead = (S.runner != null ? 1 : 0) + S.queue.length;
    return `[${key}]  JOIN THE QUEUE · ${levelName(S.level)} · ${ahead} ahead`;
  }

  _card(p) {
    const S = this.session;
    const C = this.course;
    const n = S ? S.level : this.tier(p);
    const row = LEVELS.map((_, i) => {
      if (this.levelLock(p, i)) return i === EXTRA_L ? '' : `L${i + 1} locked`;
      const best = this.dream.progress.best(this._name(p), starsId(C.id, i));
      return `${i === EXTRA_L ? '秘' : `L${i + 1}`} ${stars3(this.dream.progress.stars(this._name(p), starsId(C.id, i)))}${best != null ? ` ${best.toFixed(1)}s` : ''}`;
    }).filter(Boolean).join('   ');
    return [
      { text: `${C.kanji} ${C.name}`, size: 1.9, color: HOLO.cyan, glow: true, jp: true },
      { text: C.blurb, size: 1.0, color: 0x9fefff },
      { text: S ? `${levelName(S.level)} · ${S.queue.length + (S.runner != null ? 1 : 0)} in the queue` : `your level: ${levelName(n)}`, size: 1.2, color: HOLO.gold },
      { text: 'no orbs, no clan in here: just you', size: 1.0, color: 0x9fefff },
      { text: row, size: 1.1, color: HOLO.gold },
    ];
  }

  _pickerName() {
    const p = this.dream.game.players?.[this.picking];
    return (p?.name ?? `PLAYER ${(this.picking ?? 0) + 1}`).toUpperCase();
  }

  /**
   * THE KIOSK, PRESSED: into the queue if somebody is running, and otherwise
   * THE COURSE PICKER — course, level, RUN. Richard: "These levels/courses can
   * be cycled/appear on top of the current location of the current course."
   * Changing COURSE swipes it on the island there and then (`setCourse`),
   * under the bird's eye (`cameraFocus`), so she sees what she is choosing.
   * One kitten drives it; anybody else pressing is told who.
   */
  interact(p) {
    if (this.session) return this.join(p);
    if (this.picking != null && this.picking !== p.index) {
      this.dream.hint?.(p, `${this._pickerName()} is choosing the course — wait for her to pick`);
      this.dream.game.sfx?.('deny');
      return false;
    }
    return this.openPicker(p);
  }

  openPicker(p) {
    const D = this.dream;
    const pick = (this._pick ??= {});
    pick.level = Math.min(pick.level ?? this.tier(p), this.tier(p));
    const cyc = (list, cur, sgn) => list[(list.indexOf(cur) + sgn + list.length) % list.length];
    const rows = [
      {
        text: () => `COURSE  ◀ ${this.course.kanji} ${this.course.name} ▶`,
        cycle: (sgn) => {
          if (this.setCourse(cyc(COURSES.map((c) => c.id), COURSE_ID, sgn), sgn)) {
            // Her level on the new course: kept if it is open there, else her tier there.
            if (this.levelLock(p, pick.level)) pick.level = this.tier(p);
          }
        },
      },
      {
        text: () => {
          const lock = this.levelLock(p, pick.level);
          return `LEVEL  ◀ ${lock ? '🔒 ' : ''}${levelName(pick.level)} ${stars3(D.progress.stars(this._name(p), starsId(COURSE_ID, pick.level)))} ▶`;
        },
        cycle: (sgn) => {
          // Locked levels are passed over unless it is the secret: that one
          // shows its lock, in words, so she knows it is there to be won.
          const open = LEVELS.map((_, i) => i).filter((i) => !this.levelLock(p, i) || i === EXTRA_L);
          pick.level = cyc(open, open.includes(pick.level) ? pick.level : 0, sgn);
          const why = this.levelLock(p, pick.level);
          if (why) { D.hint?.(p, why); D.game.sfx?.('deny'); }
        },
      },
      { text: '▶ RUN!', act: () => this.begin(p, pick.level) },
      { text: 'not now', dim: true, act: () => D.closeChoice(p) },
    ];
    /* ON HER LENS, low and to the left: read from the bird's eye, 74 back, a
       menu beside the kiosk was a smudge, and one hung big over the far rim
       sat under the HUD (both seen in the browser, 800x475). See PICK. */
    D.openChoice(p, { title: `正弦 SINE GAUNTLET — ${p.name}`, rows, start: 2, lens: PICK });
    this.picking = p.index;
    this._pickChoice = D.choices?.[p.index] ?? null;
    return true;
  }

  /** RUN: refused in words if the level is locked, or a swipe is still moving. */
  begin(p, level) {
    const why = this.levelLock(p, level);
    if (why || this.swipe) {
      this.dream.hint?.(p, why ?? 'Wait for the course to land!');
      this.dream.game.sfx?.('deny');
      return false;
    }
    this.dream.closeChoice(p);
    this.picking = null;
    return this.join(p, level);
  }

  /**
   * LAY ANOTHER COURSE ON THE ISLAND, with the swipe. Refused while anybody
   * is in a session — four sisters racing for a time all race one course.
   * `dir` is the way the picker was pushed, so ◀ and ▶ swipe opposite ways.
   */
  setCourse(id, dir = 1, { instant = false } = {}) {
    if (id === COURSE_ID || !courseById(id)) return false;
    if (this.session) return false;
    // A swipe still going: the old one is gone at once, and this one starts fresh.
    if (this.swipe) this._endSwipe();
    const out = this.view;
    /* LIT on the way out, whatever the last run left grey: "The LED's
       should be on of the course like normal when courses are being
       selected". It is frozen from here, so what it wears now it wears out. */
    for (const fx of out.beamFx) if (fx.look !== 'live') this._wear(fx, 'live');
    for (const m of out.mats) { m.o0 = m.m.opacity; m.m.transparent = true; }
    // Its stones and ledges are no longer anything to stand on; their drawing goes with it.
    for (const d of [...out.stoneDecks, ...out.ledgeDecks]) {
      const i = this.sim.decks.indexOf(d);
      if (i >= 0) this.sim.decks.splice(i, 1);
    }
    useCourse(id);
    this.view = this._buildCourse();
    for (const m of this.view.mats) m.m.transparent = true;
    this.swipe = { t: 0, dir: dir < 0 ? -1 : 1, out };
    this._stepSwipe(0);
    if (instant) this._endSwipe();
    this.dream.game.sfx?.('rez');
    this._paintBoard();
    return true;
  }

  /** One frame of the swipe: the old course out round the hub, the new one in. */
  _stepSwipe(dt) {
    const W = this.swipe;
    if (!W) return;
    W.t = Math.min(SWIPE.dur, W.t + dt);
    const k = W.t / SWIPE.dur;
    const e = k * k * (3 - 2 * k);
    W.out.pivot.rotation.y = W.dir * SWIPE.ang * e;
    this.view.pivot.rotation.y = -W.dir * SWIPE.ang * (1 - e);
    W.out.fade = 1 - e;
    this.view.fade = e;
    for (const v of [W.out, this.view]) {
      for (const m of v.mats) if (v === W.out || !v.painted.has(m.m)) m.m.opacity = (m.o0 ?? 1) * v.fade;
    }
    if (W.t >= SWIPE.dur) this._endSwipe();
  }

  _endSwipe() {
    const W = this.swipe;
    if (!W) return;
    this.swipe = null;
    for (const d of [...W.out.stoneDecks, ...W.out.ledgeDecks]) d._grp?.removeFromParent();
    W.out.pivot.traverse((o) => { o.geometry?.dispose?.(); });
    W.out.pivot.removeFromParent();
    this.view.pivot.rotation.y = 0;
    this.view.fade = 1;
    for (const m of this.view.mats) { m.m.opacity = m.o0; m.m.transparent = m.tr; }
  }

  /** Into the queue — or, if nobody is running it, straight to the start. */
  join(p, level = null) {
    if (this.inSession(p)) return false;
    const fresh = !this.session;
    if (fresh) {
      this.session = { course: COURSE_ID, level: level ?? this.tier(p), runner: null, queue: [], stands: new Set(), results: [], gap: 0 };
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
    if (!S || !S.stands.has(p.index)) {
      // Not in a session, and up there anyway: just down to the plaza.
      if (!this.onDeck(p)) return false;
      this._toPlaza(p);
      this.dream.game.toast?.(`${p.name} climbed down from the stands`, p.index);
      return true;
    }
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

  /**
   * OUT OF THE GAUNTLET ALTOGETHER, from wherever she is in it. Richard: "now
   * that it is harder, we need a way for the player to be able to leave the
   * gauntlet if it is too difficult". Before this the only way out of a run
   * was to hold INTERACT for 1.2s, which nobody was told, and it dropped
   * her in the stands rather than out. Mid-run she is marked `left` and the
   * run fails; `update`, which writes her down when the drill goes, then puts
   * her on the plaza rather than in the stands. Her line on the board stays —
   * how far she got is still true. Asked by INTERACT mid-run (`COURSE.quit`)
   * and by the pause menu's LEAVE THE SINE GAUNTLET (main.js); both ask first.
   */
  leaveGauntlet(p) {
    const S = this.session;
    if (!S || !p || !this.inSession(p)) return false;
    if (S.runner === p.index && this.run?.i === p.index) {
      const d = this.run.drill;
      this.run.left = true;
      if (d && (d.state === 'live' || d.state === 'ready')) d.fail(`${p.name} left the Sine Gauntlet`);
      return true;
    }
    return this.leave(p);
  }

  /** Everybody out at once (a scene, the tournament, a restart). */
  reset() {
    const S = this.session;
    if (!S) return;
    for (const p of this.dream.game.players ?? []) if (p && this.inSession(p)) this.dream.unbench(p, true);
    this.last = S.results.length ? { course: S.course, level: S.level, results: S.results } : this.last;
    if (S.results.length) this.lastAt = this.dream.t ?? 0;
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
    this.run = { i: p.index, drill: this.dream.drills[p.index], sMax: 0, cp: 0, zaps: 0, zapT: 0 };
    this.dream.game.toast?.(`${p.name} — on your mark! ${this.course.name} · ${levelName(S.level)}`, p.index);
  }

  /** A zap or a fall: back to the checkpoint she has earned — and nothing
   *  after it but her own legs (see the header: no grace). */
  zap(p, why) {
    const r = this.run;
    if (!r) return;
    r.zaps++;
    r.zapT = 1.4;
    r.why = why;
    this.dream.game.sfx?.('zap');
    /* 秘 EXTRA HARD: back to the START. "near impossible to beat unless the
       player does everything perfectly" — the clock is still running, so a
       zap late on is most of a run gone. */
    if (LEVELS[this.session?.level]?.restart) { r.cp = 0; r.sMax = 0; r.restarted = true; }
    this._toCheckpoint(p, r.cp);
  }

  /** Put her on checkpoint `k`, facing the way her lane runs. */
  _toCheckpoint(p, k) {
    const sec = SECTIONS[k];
    this._place(p, LANES[sec.lane], sec.cp, 0, sec.lane % 2 ? -1 : 1);
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
    this.last = { course: S.course, level: S.level, results: S.results };
    this.lastAt = this.dream.t ?? 0;
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
    r.zapT = Math.max(0, r.zapT - dt);
    const q = this.laneCoords(p);
    const feet = p.position.y - this.isle.y;
    const go = advance(r.sMax, pathS(q.a, q.b));
    if (go.skip != null) {
      // She is past a checkpoint she never crossed: back to it, in words.
      r.cp = go.skip;
      r.sMax = Math.max(r.sMax, CP_S[go.skip]);
      this._toCheckpoint(p, go.skip);
      this.dream.game.sfx?.('deny');
      this.dream.game.toast?.(`${p.name}: you missed the ${SECTIONS[go.skip].name} line — back to it!`, p.index);
      return;
    }
    r.sMax = go.sMax;
    r.cp = go.cp;
    r.lane = laneOf(q.a);
    if (feet < -FALL) { this.zap(p, 'fell'); return; }
    const hit = hitAt(L, q.a, q.b, Math.max(0, feet), d.t, { height: p.height ?? 2.6 });
    if (hit) { this.zap(p, hit); return; }
    const last = LANES.length - 1;
    if (r.sMax >= FINISH_S - 0.3 && Math.abs(q.a - LANES[last]) < HALVES[last]) d.progress();
    if (d.state === 'live' && d.t >= COURSE_TIME) d.fail(`Time! You reached ${SECTIONS[r.cp].name}`);
  }

  /* -------------------------------- a frame ------------------------------- */

  /** Anybody in the course who is not running it is put back on the plaza
   *  after STRAY_T, and told why in words. The runner is never touched, and
   *  neither is a kitten mid-drill somewhere else. */
  _strays(dt) {
    this._stray ??= new Map();
    for (const p of idleIn(this.dream)) {
      if (this.session?.runner === p.index || !this.inCourse(p)) { this._stray.delete(p.index); continue; }
      const t = (this._stray.get(p.index) ?? 0) + dt;
      if (t < STRAY_T) { this._stray.set(p.index, t); continue; }
      this._stray.delete(p.index);
      if (this.inStands(p)) this._toStands(p); else this._toPlaza(p);
      this.dream.game.toast?.(this.session
        ? `${p.name}: the course is ${this.runner()?.name ?? 'the runner'}'s now — back you go`
        : `${p.name}: the course starts at 正弦 THE COURSE — step on it to run`, p.index);
    }
  }

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
    // The picker closed, however it closed: nobody is choosing.
    if (this.picking != null && this.dream.choices?.[this.picking] !== this._pickChoice) {
      this.picking = null;
      this._pickChoice = null;
    }
    this._stepSwipe(dt);
    const S = this.session;
    // The runner's drill has gone: write her down, and on to the next.
    if (S && this.run && this.dream.drills[this.run.i] !== this.run.drill) {
      this._record(this.run.drill);
      const p = this.dream.game.players?.[this.run.i];
      const left = this.run.left;
      S.runner = null;
      this.run = null;
      if (p && left) {
        // She asked to leave (leaveGauntlet): out, not up into the stands.
        this._toPlaza(p);
        this.dream.unbench(p);
        this.dream.game.toast?.(`${p.name} left the Sine Gauntlet`, p.index);
      } else if (p && this.dream.realmOf(p) === 'sim') {
        if (S.queue.length) { S.stands.add(p.index); this._toStands(p); } else S.stands.add(p.index);
      }
      this._next();
      this._paintBoard();
    }
    this._strays(dt);
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
    this._easeCamera(dt);
    this._fitCard();
    const { L, t } = this._clock();
    this._paintCourse(L, t);
    this._carry();
    this._boardT = (this._boardT ?? 0) - dt;
    /* Idle, once a second: the leaderboard's page can change under it (a
       loaded save, LAST TIME running out) without anybody telling it. */
    if (this._boardT <= 0) { this._boardT = this.session ? 0.25 : 1; this._paintBoard(); }
  }

  /** 'live', 'ahead' or 'done' for section `i` — see BEAM_AHEAD. Live: her
   *  section, and every one still ahead of her in the lane she is in. */
  beamLook(i) {
    const r = this.run;
    if (!r || r.drill?.state === 'done') return 'live';
    const lane = r.lane ?? SECTIONS[r.cp]?.lane;
    if (i === r.cp || (i > r.cp && SECTIONS[i]?.lane === lane)) return 'live';
    return i < r.cp ? 'done' : 'ahead';
  }

  /** Repaint one beam's materials for a look. Only on a change of look. */
  _wear(fx, look) {
    fx.look = look;
    const B = look === 'ahead' ? BEAM_AHEAD : look === 'done' ? BEAM_DONE : null;
    const col = B ? B.col : fx.col;
    fx.glow.material.color.setHex(col);
    fx.foot.material.color.setHex(col);
    for (const m of fx.ends) m.material.color.setHex(col);
    for (const m of fx.drops) m.material.color.setHex(col);
    fx.core.material.color.setHex(B ? B.core : 0xffffff);
    fx.core.material.opacity = B ? B.core_o : 0.95;
  }

  /** Every beam, stone and dot, from course.js at `t`. The ONLY writer. */
  _paintCourse(L, t) {
    const V = this.view;
    const fade = V.fade;
    const list = beams(L, t);
    const I = this.isle;
    list.forEach((q, k) => {
      const fx = V.beamFx[k];
      const a = this._w(q.a0, q.b0, q.y0); const b = this._w(q.a1, q.b1, q.y1);
      const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      fx.g.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      /* In the group's own frame, not `lookAt`: that aims at a WORLD point,
         and while the course is swiping its group is turned under it. */
      _dir.set(b.x - a.x, b.y - a.y, b.z - a.z).normalize();
      fx.g.quaternion.setFromUnitVectors(_Z, _dir);
      fx.core.scale.set(q.thick * 0.35, q.thick * 0.35, len);
      fx.glow.scale.set(q.thick * 1.15, q.thick * 1.15, len);
      const look = this.beamLook(fx.secI);
      if (look !== fx.look) this._wear(fx, look);
      const B = look === 'ahead' ? BEAM_AHEAD : look === 'done' ? BEAM_DONE : null;
      fx.glow.material.opacity = (B ? B.glow : fx.fixed ? 0.5 : 0.42 + 0.12 * Math.sin((this.dream.t ?? 0) * 24 + k)) * fade;
      fx.core.material.opacity = (B ? B.core_o : 0.95) * fade;
      fx.ends[0].position.set(a.x, a.y, a.z);
      fx.ends[1].position.set(b.x, b.y, b.z);
      // The shadow: straight down, sharper and darker the lower the beam.
      const h = (q.y0 + q.y1) / 2;
      fx.shadow.position.set((a.x + b.x) / 2, I.y + 0.025, (a.z + b.z) / 2);
      fx.shadow.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      const flen = Math.hypot(b.x - a.x, b.z - a.z);
      fx.shadow.scale.set(0.35 + h * 0.22, 1, flen);
      fx.shadow.material.opacity = THREE.MathUtils.clamp(0.85 - h * 0.12, 0.3, 0.8) * fade;
      fx.foot.position.set(fx.shadow.position.x, I.y + 0.04, fx.shadow.position.z);
      fx.foot.rotation.y = fx.shadow.rotation.y;
      fx.foot.scale.set(0.12 + h * 0.07, 1, flen);
      fx.foot.material.opacity = THREE.MathUtils.clamp(0.95 - h * 0.15, 0.25, 0.9) * (B ? B.foot : 1) * fade;
      fx.drops.forEach((m, n) => {
        const e = n ? b : a;
        const y = n ? q.y1 : q.y0;
        m.position.set(e.x, I.y, e.z);
        m.scale.set(1, Math.max(0.01, y), 1);
      });
    });
    stones(L, t).forEach((s, n) => {
      const d = V.stoneDecks[n];
      const q = this._w(s.a, s.b, s.y);
      // Where it was, for `_carry`: a stone that slides takes her with it.
      d._px = d.x; d._pz = d.z;
      d.x = q.x; d.z = q.z;
      d.y = I.y + s.y;
      if (d._grp) d._grp.position.set(d.x - d._x0, d.y - d._y0, d.z - d._z0);
    });
    const e = sweepEnds(MATH_ARM, t, L.speed);
    const c = this._w(e.p.a, MATH_ARM.pb, 0.12);
    const s2 = this._w(MATH_ARM.pa, e.p.b, 0.12);
    V.cosDot.position.set(c.x, c.y, c.z);
    V.sinDot.position.set(s2.x, s2.y, s2.z);
    const live = this.run?.drill?.state === 'live';
    for (const z of V.zapFloors) z.material.opacity = (live ? 0.22 + 0.1 * Math.sin((this.dream.t ?? 0) * 6) : 0.12) * fade;
  }

  /**
   * A STONE THAT SLIDES TAKES HER WITH IT. The sim's decks only ever had a
   * height, so a kitten stood on a Riptide stone would have stayed where she
   * was while it slid out from under her into the lava — which is a stone
   * that drops you, not a stone that moves. Anybody whose feet are on a
   * stone's top is moved by however far it moved this frame.
   */
  _carry() {
    if (!SECTION.stones.stone.slide) return;
    for (const p of this.dream.game.players ?? []) {
      if (!p || this.dream.realmOf(p) !== 'sim') continue;
      const x = p.position.x - SIM.dx; const z = p.position.z - SIM.dz;
      for (const d of this.view.stoneDecks) {
        if (d._px == null) continue;
        if (Math.abs(p.position.y - d.y) > 0.3 || Math.hypot(x - d._px, z - d._pz) > d.r) continue;
        p.position.x += d.x - d._px;
        p.position.z += d.z - d._pz;
        break;
      }
    }
  }

  /** What the board is showing: the race on now, the last one for a while
   *  after it ends, and otherwise the 記 leaderboard (dream/sineboard.js). */
  boardMode() {
    if (this.session) return 'now';
    if (this.last && (this.dream.t ?? 0) - this.lastAt < SINE_BOARD.lastHold) return 'last';
    return 'board';
  }

  /** The board's lines: this session, the last one, or the leaderboard. */
  _paintBoard() {
    const S = this.session;
    const src = S ?? this.last;
    if (this.boardMode() === 'board') {
      const lines = sineBoardLines(this.dream.progress, this.boardFilter);
      const sig = `board|${lines.map((l) => l.text).join('|')}`;
      if (sig === this._boardSig) return;
      this._boardSig = sig;
      this.board.set(lines, HOLO.gold);
      return;
    }
    const lines = [{ text: `${this.course.kanji} ${this.course.name}`, size: 1.7, color: HOLO.cyan, glow: true, jp: true }];
    lines.push({ text: `${S ? 'NOW' : 'LAST TIME'} · ${courseById(src.course ?? 'gauntlet')?.name ?? ''} · ${levelName(src.level)}`, size: 1.1, color: HOLO.gold });
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
  /* -------------------------------- cameras ------------------------------- */

  /** Is the runner in the Sliding Gaps? Read off how far she has got, so the
   *  shot changes when she crosses that checkpoint and changes back on the
   *  next one — not off where she stands, which a zap moves. */
  _shoulder() {
    const r = this.run;
    const d = r?.drill;
    if (!r || !d || (d.state !== 'live' && d.state !== 'ready')) return null;
    const k = nextSection(r.sMax);
    const sec = SECTIONS[k];
    // The Riptide's stones slide ACROSS her lane — toward and away from a side-on lens —
    // and the Dragon Gate's corridor walls run AWAY from it (`behind`).
    const behind = (s) => s.key === 'gaps' || s.behind || (s.key === 'stones' && s.stone.slide);
    if (behind(sec)) return sec;
    /* ...AND A `behind` STRETCH TURNS THE LENS BEFORE SHE IS IN IT. Richard:
       "before the lava lazer area with the platforms, the camera should go
       behind the player". The High Steps' checkpoint is 1.6 short of its lava,
       which a sprinter covers in a tenth of a second, and the lens eases in
       over about 0.4 (CAM_EASE) — on the checkpoint alone she would be on
       the first ledge, or in the floor, before it had turned. So it turns
       from SHOT_AHEAD before the line: half way across the U-turn into it. */
    const next = SECTIONS[k + 1];
    return next?.behind && CP_S[k + 1] - r.sMax < SHOT_AHEAD ? next : null;
  }

  /** The side-on yaw (see COURSE_CAM), or, behind her, the yaw that looks
   *  down her lane the way it runs. */
  _wantShot() {
    const sec = this._shoulder();
    if (!sec) return { yaw: this._yaw(), dist: COURSE_CAM.dist, pitch: COURSE_CAM.pitch, lead: 0, lift: COURSE_CAM.lift, pin: 0, behind: 0 };
    const f = this.isle.fwd;
    const sg = sec.lane % 2 ? -1 : 1;     // the way her lane runs, in b
    const S = sec.key === 'stones' ? STONES_CAM : SHOULDER_CAM;
    return { yaw: Math.atan2(sg * f.z, -sg * f.x), dist: S.dist, pitch: S.pitch, lead: S.lead, lift: S.lift, pin: S === STONES_CAM ? 1 : 0, behind: 1 };
  }

  /** The shot, eased: a cut from side-on to behind her would be a quarter
   *  turn in one frame, and `setFocus` hands yaw straight to the lens. */
  _easeCamera(dt) {
    const w = this._wantShot();
    const c = (this._cam ??= { ...w });
    let dy = w.yaw - c.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    const k = 1 - Math.exp(-dt * CAM_EASE);
    c.yaw += dy * k;
    for (const key of ['dist', 'pitch', 'lead', 'lift', 'pin', 'behind']) c[key] = (c[key] ?? 0) + (w[key] - (c[key] ?? 0)) * k;
    return c;
  }

  /**
   * THE CARD OVER HER HEAD, SMALLER AND FAINTER WHILE THE LENS IS BEHIND HER.
   * Richard: "When the camera is pulling behind the player on the Sine
   * Gauntlet course, the text UI appearing above their heads is too big and
   * taking up too much of the top half of the screen real-estate ... best to
   * make it smaller and more transparent so player can still read it if they
   * want". Side-on, the card is beside the course; from behind it sits ON the
   * course ahead of her, which is the one thing that shot is for. It eases
   * with the lens (`behind`, 0 side-on to 1 behind) rather than snapping, so
   * the card shrinks as the camera turns and grows back as it turns away.
   * Not moved to the bottom of the screen: the card belongs to HER — in a
   * shared pane her sister in the stands reads whose run it is off it.
   */
  _fitCard() {
    const d = this.run?.drill;
    if (!d?.panel) return;
    const k = this._cam?.behind ?? 0;
    d.panel.scale.setScalar(1 - (1 - CARD_BEHIND.scale) * k);
    d.panel.position.y = (d.p.height ?? 2.6) + 2.3 - (2.3 - CARD_BEHIND.lift) * k;
    d.panel.mat.opacity = 1 - (1 - CARD_BEHIND.opacity) * k;
  }

  /** Where the runner is — or the start, between runs — in the world: her,
   *  lifted, and pushed `lead` down her lane. */
  _shotCentre() {
    const p = this.runner();
    const cam = this._cam ?? this._wantShot();
    const c = (this._centre ??= new THREE.Vector3());
    if (p && this.run?.drill) {
      const f = this.isle.fwd;
      const sg = laneOf(this.laneCoords(p).a) % 2 ? -1 : 1;
      // Pinned (STONES_CAM): the look-at's height is the stones' middle, not her — she rises in the frame.
      const pinY = this.isle.y + (SECTION.stones.stone.H ?? 0);
      const y = p.position.y + ((pinY - p.position.y) * (cam.pin ?? 0));
      return c.set(p.position.x - f.z * sg * cam.lead, y + cam.lift, p.position.z + f.x * sg * cam.lead);
    }
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
    if (this.picking === p?.index && !this.session) return this._birdsEye();
    if (!this.inSession(p)) return null;
    const f = (this._focus ??= { centre: new THREE.Vector3(), aim: true, dist: COURSE_CAM.dist, pitch: COURSE_CAM.pitch, yaw: 0 });
    const cam = this._cam ?? this._wantShot();
    f.centre.copy(this._shotCentre());
    f.yaw = cam.yaw;
    f.dist = cam.dist;
    f.pitch = cam.pitch;
    return f;
  }

  /** The bird's eye over the whole course while she chooses (BIRD): on the
   *  island's middle, swaying round it. */
  _birdsEye() {
    const f = (this._bird ??= { centre: new THREE.Vector3(), aim: true, dist: BIRD.dist, pitch: BIRD.pitch, yaw: 0 });
    const c = this._w((COURSE_A[0] + COURSE_A[1]) / 2, 0, BIRD.lift);
    f.centre.set(c.x + SIM.dx, c.y, c.z + SIM.dz);
    f.yaw = this._yaw() + BIRD.sway * Math.sin((this.dream.t ?? 0) * BIRD.rate);
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
    const cam = this._cam ?? this._wantShot();
    g.centre.copy(this._shotCentre());
    g.yaw = cam.yaw;
    g.dist = cam.dist;
    g.pitch = cam.pitch;
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
  const C = G.course;
  return {
    id: starsId(C.id, n), title: `${C.name} · ${levelName(n)}`, kanji: C.kanji,
    goalText: L.restart ? 'one zap and it is back to the START' : `${SECTIONS.length} obstacles to the gold line`,
    goal: 1, showCount: false, bands: COURSE_BANDS[n], lowerIsBetter: true,
    grace: 3, leaveR: 60, noBar: true,
    caught: () => true,
    /** INTERACT mid-run: leave? Default no, both buttons say what they do (6, 7). */
    quit(d) {
      const D = G.dream;
      if (D.choices?.[d.p.index]) return;
      D.openChoice(d.p, {
        title: 'LEAVE THE GAUNTLET?',
        rows: [
          { text: 'no, keep running', act: () => D.closeChoice(d.p) },
          { text: 'yes, leave the Gauntlet', act: () => { D.closeChoice(d.p); G.leaveGauntlet(d.p); } },
        ],
      });
    },
    tick: (d, dt) => G._tick(d, dt),
    paint(d) {
      const r = G.run?.drill === d ? G.run : null;
      if (d.state === 'ready') {
        return [
          { text: `${C.kanji} ${C.name} · ${levelName(n)}`, size: 1.6, color: d.colour, glow: true, jp: true },
          { text: L.restart ? 'zapped or fallen: back to the START' : 'zapped or fallen: back to the last line', size: 1.1 },
          { text: d.readyT > 2 ? '3' : d.readyT > 1 ? '2' : '1', size: 2.4, color: HOLO.gold, glow: true },
        ];
      }
      if (d.state !== 'live' || !r) return null;
      const sec = SECTIONS[Math.min(SECTIONS.length - 1, nextSection(r.sMax))];
      const lines = [{ text: `${sec.name}`, size: 1.5, color: d.colour, glow: true }];
      if (r.zapT > 0) lines.push({ text: r.restarted && r.cp === 0 ? 'ZAP! back to the START' : `ZAP! back to ${SECTIONS[r.cp].name}`, size: 1.4, color: 0xff8a8a });
      else lines.push(working(sec, L, d.t, r));
      lines.push({ text: `${d.t.toFixed(1)}s   zaps ${r.zaps}`, size: 1.3, color: HOLO.cyan });
      lines.push({ text: `[${G.dream.key?.(d.p, 'interact') ?? 'E'}] to leave`, size: 0.8, color: 0x7f9fa8 });
      return lines;
    },
  };
}

/** A level as a kitten reads it: L1-L3, and the secret one by its name. */
export function levelName(n) { return n === EXTRA_L ? '秘 EXTRA HARD' : `L${n + 1}`; }

const _Z = new THREE.Vector3(0, 0, 1);
const _dir = new THREE.Vector3();

/** The section she is in or about to reach. */
function nextSection(sMax) {
  let k = 0;
  for (let i = 0; i < CP_S.length; i++) if (sMax >= CP_S[i] - 0.25) k = i;
  return k;
}

/** The working for the section she is in — the same numbers as the beams. */
function working(sec, L, t, r) {
  const sp = L.speed;
  const lane = LANES[sec.lane];
  // A stretch with ledges AND bars (the Dragon's Tail) reads the ledges until the last is behind her.
  const climbing = sec.ledges && sec.ledges.some((l) => pathS(lane, l.b) > r.sMax);
  if (sec.bars && !climbing) {
    // The first bar of this section she has not passed yet.
    const q = sec.bars.findIndex((b) => pathS(lane, b) > r.sMax);
    const n = q < 0 ? sec.bars.length - 1 : q;
    const w = barWorking(sec.wave, t, n, sp, sec.twin ?? 0);
    return { text: `${w.text} → ${w.word}`, size: 1.1, color: w.word === 'WAIT…' ? 0xff8a8a : 0x8bff9a };
  }
  if (sec.stones) {
    // The next two stones ahead of her: one sine, one cosine.
    const q = sec.stones.findIndex((b) => pathS(lane, b) > r.sMax);
    const n = Math.max(0, Math.min(sec.stones.length - 2, q < 0 ? sec.stones.length - 2 : q));
    const part = (m) => `${stoneIsCos(m) ? 'cos' : 'sin'} → ${stoneHeight(sec, t, m, sp).toFixed(1)}`;
    return { text: `stones: ${sec.stone.H} + ${sec.stone.A}·${part(n)}   ${sec.stone.H} + ${sec.stone.A}·${part(n + 1)}`, size: 1.05, color: HOLO.gold };
  }
  if (sec.arms) {
    // The nearest arm ahead of her.
    const arms = ARMS.filter((m) => m.sec === 'sweep');
    const m = arms.find((x) => pathS(lane, x.pb) > r.sMax) ?? arms.at(-1);
    const e = sweepEnds(m, t, sp);
    const deg = ((Math.round((e.th * 180) / Math.PI) % 360) + 360) % 360;
    return { text: `θ ${deg}°   cos ${Math.cos(e.th).toFixed(2)}   sin ${Math.sin(e.th).toFixed(2)}`, size: 1.15, color: HOLO.gold };
  }
  if (sec.curtains) {
    const q = sec.curtains.findIndex((b) => pathS(lane, b) > r.sMax);
    const i = q < 0 ? sec.curtains.length - 1 : q;
    const off = gapCentre(sec, t, i, sp) - lane;
    return { text: `gap ${i + 1} at ${sec.gap.A}·sin(…) = ${off >= 0 ? '+' : ''}${off.toFixed(1)}`, size: 1.15, color: HOLO.gold };
  }
  if (sec.ledges) {
    // The next ledge, how far up it is from the one she is on, and what a hop reaches.
    const q = sec.ledges.findIndex((l) => pathS(lane, l.b) > r.sMax);
    const i = q < 0 ? sec.ledges.length - 1 : q;
    const from = i > 0 ? sec.ledges[i - 1].y : 0;
    const up = sec.ledges[i].y - from;
    return { text: `ledge ${i + 1}: ${up >= 0 ? 'up' : 'down'} ${Math.abs(up).toFixed(1)} · a hop reaches 2.4 · ${(sec.ledges[i].r * 2).toFixed(1)} across`, size: 1.1, color: HOLO.gold };
  }
  return { text: waveText(SECTIONS[0].wave, sp), size: 1.1 };
}

export { groundAt };
