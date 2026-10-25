import * as THREE from 'three';
import { SIM, HOLO } from '../../world/simworld.js';
import { PLAYER_STYLE } from '../../core/palette.js';
import { MUSIC_FILES } from '../../core/musicfiles.js';
import { BAMBOO_MUSIC } from './bamboomusic.js';
import { HoloPanel } from './holo.js';
import { Kiosk, idleIn, isleSpot, stars3 } from './kiosk.js';
import { SWIPE, BIRD, PICK, STRAY_T } from './sine.js';
import { ClipSprite, loadNinjaArt } from './ninjasprite.js';
import { Guard, Shots, isleDir, isleFacing } from './bambooguards.js';
import { GhostRecorder, GhostFigure, GMODE, ghostFor, offerGhost } from './ghost.js';
import { BAMBOO_BOARD, bambooBoardLines, bambooFilterRows } from './bambooboard.js';
import {
  COURSES, courseById, starsId, DIFFS, levelOf, guardsOn, lanternsOn, pickupsOn, houseWalls, ladderFoot,
  REGION, GATE, PLAZA, EYE, RADII, COVER, SNEAK, CAUGHT_COST, GRID, wrap, segDist,
  walkAt, inHouse, blocked, kittenRaster, HIDE_REACH, LADDER_REACH, HANG, SPRINT,
  ropeEnds, edgeRaster,
} from './bamboolevel.js';

// The courses' recordings (tools/capture/bamboo-music.mjs) join the game's
// file list here, the way the jukebox's do in jukebox.js.
Object.assign(MUSIC_FILES, BAMBOO_MUSIC);

/* ---------------------------------------------------------------------------
   忍 BAMBOO INFILTRATION — through a course to the scroll at its far end,
   past samurai who walk their rounds and archers on the towers, without
   being caught. Five courses (bamboocourses.js), three difficulties each.

   Richard: "Let's implement this all as a fully functional mini-game ... We
   can replace cones with actual opponents the player must avoid." So:

   THE NUMBERS ARE ELSEWHERE AND DRAW NOTHING. bamboolevel.js is the place
   (what is walkable, what the forest fences off, who sees whom: `canSee`),
   bambooguards.js is the people in it. This file lays the drawing on the
   place, owns the session, and turns her pad into a ninja: crawl, throw,
   hang, climb, hide.

   A SESSION IS EVERYBODY AT ONCE. Richard: "anyone on the island joins when
   someone starts; late arrivals are held behind a red barrier like Shadow
   Lionheart's; after a course, everyone can enter the next". GO takes every
   idle kitten on the island; each gets her own drill (her clock, her stars,
   her lanterns, her captures) and they all face ONE set of guards on ONE
   clock, so a sister crawling past a samurai is a samurai you can watch her
   get past. Their kits go on the rack like the Sine Gauntlet's
   (`DreamDojo.bench`): "disable kotodama orbs like Sine Gauntlet".

   SNEAKING IS THE WARD BUTTON — hold it, or double-tap to latch it and one
   more press to let go ("Sneaking toggle like Ward"). A crawl makes no sound
   and keeps her eyes at EYE.crawl, under a crate's top; walking and
   sprinting are heard within the difficulty's `noise` radius, and the ring
   that grows from her feet IS that radius, so the rule is the picture.

   SPOTTED IS CAUGHT, NEVER HURT (non-negotiable 3). Richard: "she loses input
   and raises her hands; the enemy walks over while the camera fades; she
   respawns at the start or the last lantern". It costs CAUGHT_COST seconds
   on the score and the clock keeps running — they are nine and younger, and
   a capture that ended the run would end the afternoon's interest in it.
   Nothing in this file calls `hurt` and world-check holds it to that.

   ONE PRESS NEVER LEAVES (non-negotiable 7). INTERACT mid-run is her ninja
   button — out of a barrel, into one, onto a rope or a ladder, drop the smoke
   bomb — and only when it has nothing else to do, and nothing to do it with
   anywhere near her, does it ASK whether to leave, cursor on "no". JUMP is the
   same button for the barrel, the rope and the ladder, and never asks.

   THE PARTY IS ONE PARTY (Oct 2026). Richard: "when a player gets caught, all
   players should respawn at the checkpoint and all game states should get
   reset (like have all the npc's start in their default spot, facing the
   default way)". One capture fades every pane, puts every kitten back at the
   party's lantern, and the guards back on the first step of their rounds — so
   they share one camera too (`groupShot`), which follows the first of them if
   they wander too far apart: "to force players to be close to each other".
--------------------------------------------------------------------------- */

/** Her camera on the course: high and behind the plaza, so the course runs up the screen. */
export const BAMBOO_CAM = { dist: 24, pitch: 0.95, lift: 1 };
/** The bird's eye while choosing: closer than the Gauntlet's, the course is smaller. */
export const BAMBOO_BIRD = { ...BIRD, dist: 92, pitch: 1.2, sway: 0.35 };
/** A throw: held ATTACK charges for `charge` s; it lands `min` to `max` ahead of her. */
export const THROW = { charge: 1.0, min: 2, max: 13, mineR: 1.6, flight: 0.65, arc: 2.6 };
/** Hanging from a rope: grabbed within `grab` flat with the rope `lo`..`hi` above her feet,
 *  on a PRESS (INTERACT or JUMP) — it used to take her as she jumped under it,
 *  which made a jump on a roof under a rope a thing she could not do. */
export const ROPE = { grab: 1.2, lo: HANG.lo, hi: HANG.hi, speed: 3.4, mount: 0.5, cd: 0.5, ink: 1.21 * 2.9 };
/** A ladder: climbed at `speed`; she steps `onto` units in onto the roof at the top. */
export const LADDER = { speed: 3.2, reach: LADDER_REACH, onto: 1.4, push: 0.75 };
/**
 * NOTHING TO DO HERE YET, SO DO NOTHING. Within NEAR_K times the reach of a
 * barrel, a rope or a ladder, on its level, a press that does not reach it
 * does nothing at all — Richard: "many times player presses the interact
 * button to do something (ex. jump in barrel) and instead the menu pops up
 * unexpectedly". The question to leave is for a press made in the open.
 */
export const NEAR_K = 3;
/** A smoke bomb: a cloud COVER.smoke tall, `r` wide, for `t` seconds. */
export const SMOKE = { r: RADII.smoke, t: 6 };
/** A walking step is heard this often; a picked-up thing comes back after `respawn`. */
export const NOISE_EVERY = 0.45;
export const PICKUP = { r: 1.1, respawn: 12 };
/** Hiding in a barrel: within this of its middle (bamboolevel.js HIDE_REACH says why 1.9). */
export const HIDE_R = HIDE_REACH;
/**
 * SEEN GOING IN. A samurai who saw her climb into a barrel walks to it and
 * tips her out — caught, there and then; an archer waits `wait` seconds and
 * puts an arrow in it, and it is a coin: `hit` of the time she is caught, the
 * rest she is spooked out of it. Richard's numbers. "Saw" is: in his cone and
 * unblocked in the last `memory` seconds before she went in.
 */
export const SPOTTED = { memory: 0.6, wait: 3, hit: 0.5 };
/**
 * THE PARTY'S CAMERA (`groupShot`): over the plaza's shoulder like hers, the
 * distance fitted to how far apart they are — and past `split` units apart it
 * follows the first kitten and stops trying, until they are within `rejoin`
 * again (the hysteresis keeps it from flapping at the line).
 */
export const PARTY_CAM = { split: 22, rejoin: 16, maxDist: 38, fov: 50, aspect: 16 / 9, margin: 3 };
/** The capture, in seconds: hands up, the fade starts, she is put back, the fade ends. */
export const ARREST = { fade0: 0.7, swap: 1.5, end: 2.1 };
/** Touching an awake guard is a capture too. */
export const TOUCH_R = 0.9;
/**
 * SANCTUARY: inside a lantern's gold ring, or on the start's, nobody sees her
 * and nobody catches her. MEASURED, not wished: world-check walked every
 * guard's rounds past every lantern, and 21 of them (and the village's start,
 * at NORMAL and HARD) were in somebody's view — so a capture would put her
 * back where the next one was waiting. Moving lanterns into hiding would
 * have made the checkpoints the places nobody walks; a ring you are safe in
 * is the rule a nine-year-old already knows from tag.
 */
export const SAFE = { lantern: 1.15, start: { a: -15.8, b: 0, r: 2.0 } };
/** Where the kittens start: two by two on the path inside the gate. */
export const SLOTS = [{ a: -16.5, b: -0.9 }, { a: -16.5, b: 0.9 }, { a: -15.1, b: -0.9 }, { a: -15.1, b: 0.9 }];
const BARRIER = { h: 3.6, w: GATE.w + 1.2, idle: HOLO.cyan, live: 0xff2a4a };
/** What a `crate` is drawn as, in turn (or `stack:` on the course's row). */
export const STACKS = ['boxes', 'wood', 'rice'];
const RING_COL = 0xf4f8ff;

const lerp = (a, b, u) => a + (b - a) * u;
/** How far back the party's camera sits for kittens `spread` apart from their middle. */
export function partyDist(spread) {
  const fit = (spread + PARTY_CAM.margin) / Math.tan(THREE.MathUtils.degToRad(PARTY_CAM.fov / 2));
  return Math.min(PARTY_CAM.maxDist, Math.max(BAMBOO_CAM.dist, fit));
}
const nameOf = (p) => p?.style?.name ?? p?.name;
const styleIdx = (p) => Math.max(0, PLAYER_STYLE.findIndex((s) => s.name === p?.style?.name));

/**
 * A ROOF YOU CAN STAND ON, as a deck `heightAt` understands: flat at the
 * house's height over its footprint, which is asked in ISLAND terms — the
 * house is a rectangle there and a turned one in the layer. A lid
 * (`ceiling`), so a kitten indoors bumps her head on it instead of jumping
 * through the roof.
 */
class RoofDeck {
  constructor(isle, H) {
    this.isle = isle;
    this.H = H;
    this.y = isle.y + H.h;
    this.step = 0.4;
    this.ceiling = true;
    this.thick = 0.3;
    this.name = `roof-${H.id}`;
  }

  yAt(lx, lz) {
    const f = this.isle.fwd;
    const dx = lx - this.isle.x; const dz = lz - this.isle.z;
    const a = dx * f.x + dz * f.z; const b = -dx * f.z + dz * f.x;
    const H = this.H;
    return a >= H.a0 && a <= H.a1 && b >= H.b0 && b <= H.b1 ? this.y : null;
  }
}

export class BambooInfiltration {
  constructor(dream, isle) {
    this.dream = dream;
    this.isle = isle;
    this.sim = dream.sim;
    this.root = new THREE.Group();
    this.root.name = 'bamboo';
    this.sim.root.add(this.root);
    /** The session: null, or { course, diff, live, t, runs: Map(index -> run) }. */
    this.session = null;
    this.last = null;
    this.lastAt = -Infinity;
    this.picking = null;
    this.swipe = null;
    this.art = null;
    this.diff = 0;
    this.courseId = COURSES[0].id;
    this.coneOn = true;
    this.boardFilter = { course: this.courseId, diff: 0, who: 'all' };
    this.view = this._buildCourse(courseById(this.courseId));
    this._buildPlaza();
    this.shots = new Shots(this, this.root);
    this.pebbles = [];
    this.rings = [];
    this.smokes = [];
    this.stations = this.kiosks.map((k) => k.station);
    dream.sim.tickers.push((dt) => this.update(dt));
  }

  /* ------------------------------ the frame ------------------------------- */

  get course() { return courseById(this.courseId); }
  get level() { return levelOf(this.course); }
  get D() { return DIFFS[this.session?.diff ?? this.diff]; }
  /** The guards' clock: the session's from GO, the island's otherwise. */
  get clock() { return this.session ? this.session.t : (this.dream.t ?? 0); }

  _w(a, b, y = 0) {
    const q = isleSpot(this.isle, a, b);
    return { x: q.x, y: this.isle.y + y, z: q.z };
  }

  /** Her place on the island: a, b, and her feet above its floor. */
  coords(p) {
    const f = this.isle.fwd;
    const x = p.position.x - SIM.dx - this.isle.x;
    const z = p.position.z - SIM.dz - this.isle.z;
    return { a: x * f.x + z * f.z, b: -x * f.z + z * f.x, y: p.position.y - this.isle.y };
  }

  /** A layer direction as an island bearing. */
  _isleAng(dx, dz) {
    const f = this.isle.fwd;
    return Math.atan2(-dx * f.z + dz * f.x, dx * f.x + dz * f.z);
  }

  /** Stand her on an island point, facing island bearing `th`. */
  _place(p, a, b, y = 0, th = 0) {
    const q = this._w(a, b, y);
    this.dream.shards?.burst?.(p.position.x - SIM.dx, p.position.y + 1, p.position.z - SIM.dz, p.style?.colour ?? HOLO.cyan, 14, 4, 5);
    p.position.set(q.x + SIM.dx, q.y + 0.05, q.z + SIM.dz);
    p.velocity?.set(0, 0, 0);
    p.facing = isleFacing(this.isle, th);
    this.dream.shards?.burst?.(q.x, q.y + 1, q.z, p.style?.colour ?? HOLO.cyan, 14, 4, 5);
  }

  _toPlaza(p) {
    const o = PLAZA.out[p.index % PLAZA.out.length];
    this._place(p, o.a, o.b, 0, Math.PI);
  }

  onIsland(p) {
    const x = p.position.x - SIM.dx - this.isle.x;
    const z = p.position.z - SIM.dz - this.isle.z;
    return Math.hypot(x, z) < this.isle.r + 1;
  }

  /** Inside the course (past the gate), not the plaza. */
  inCourse(p) {
    const q = this.coords(p);
    return q.a > GATE.a - 0.2 && Math.hypot(q.a, q.b) < REGION.r + 1 && q.y > -3;
  }

  inSession(p) { return !!(p && this.session?.runs.has(p.index)); }

  /** Is island point q in a sanctuary — the start's ring, or an out lantern's? On the ground only. */
  safeAt(q) {
    if (q.y > 1) return false;
    const st = SAFE.start;
    if (Math.hypot(q.a - st.a, q.b - st.b) < st.r) return true;
    return this.view.lanterns.some((l) => l.on && Math.hypot(q.a - l.a, q.b - l.b) < SAFE.lantern);
  }
  runOf(p) { return p ? this.session?.runs.get(p.index) ?? null : null; }

  /* ------------------------------ building -------------------------------- */

  /** A box from island (a0,b0) to (a1,b1), `t` thick, `h` tall, standing at `y`. */
  _slab(a0, b0, a1, b1, t, h, y, mat, into) {
    const p0 = this._w(a0, b0, y); const p1 = this._w(a1, b1, y);
    const len = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    const m = new THREE.Mesh(new THREE.BoxGeometry(t, h, Math.max(0.05, len)).translate(0, h / 2, 0), mat);
    m.position.set((p0.x + p1.x) / 2, p0.y, (p0.z + p1.z) / 2);
    m.rotation.y = Math.atan2(p1.x - p0.x, p1.z - p0.z);
    into.add(m);
    return m;
  }

  /**
   * A STACK — what a `crate` is now. Richard: "replace with something more
   * interesting that looks like an obstacle, like stacked wood or stacked
   * barrels of rice or stacked boxes". Every kind is COVER.crate tall and
   * inside RADII.crate, so the drawing is the size of the solid and the sight
   * rule (`blocked`) is the size of both.
   */
  _stack(kind) {
    const g = new THREE.Group();
    const H = COVER.crate;
    const mat = (color, o = 0.92) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: o });
    if (kind === 'wood') {
      // Firewood, three rows of logs end-on, and the cut ends lit.
      const wood = mat(0x6b4526); const cut = mat(0xd9a866);
      const r = H / 6;
      [[3, 0], [2, 1], [1, 2]].forEach(([n, row]) => {
        for (let k = 0; k < n; k++) {
          const log = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1.2, 8).rotateX(Math.PI / 2), [wood, cut, cut]);
          log.position.set((k - (n - 1) / 2) * r * 2.05, r + row * r * 1.75, 0);
          g.add(log);
        }
      });
    } else if (kind === 'rice') {
      // Rice bales: two straw bales and one on top, each with a rope round its waist.
      const straw = mat(0xd8c070); const band = mat(0x7a5426);
      const r = 0.38; const h = H / 2;
      for (const [x, z, y] of [[-0.36, 0, 0], [0.36, 0, 0], [0, 0, h]]) {
        const bale = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, h * 0.98, 12).translate(0, h / 2, 0), straw);
        bale.position.set(x, y, z);
        const rope = new THREE.Mesh(new THREE.TorusGeometry(r * 1.04, 0.035, 4, 16).rotateX(Math.PI / 2), band);
        rope.position.y = h * 0.5;
        bale.add(rope);
        g.add(bale);
      }
    } else {
      // Boxes: two side by side and one on top, turned a little, with their lids marked.
      const box = mat(0x8a6a3a); const edge = mat(0xc9a46a);
      const s = H / 2;
      for (const [x, y, z, t] of [[-0.33, 0, 0.05, 0.08], [0.36, 0, -0.06, -0.1], [0.02, s, 0, 0.32]]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(s * 0.9, s * 0.96, s * 0.9).translate(0, s * 0.48, 0), box);
        b.position.set(x, y, z);
        b.rotation.y = t;
        const lid = new THREE.Mesh(new THREE.BoxGeometry(s * 0.94, 0.05, 0.08), edge);
        lid.position.y = s * 0.96;
        b.add(lid);
        g.add(b);
      }
    }
    g.userData.stack = kind;
    return g;
  }

  /**
   * ONE COURSE'S DRAWING, AND ITS SOLIDS, in a group off a pivot at the hub's
   * centre — the Sine Gauntlet's swipe (`SWIPE`), so ◀▶ in the picker turns
   * one course off the island and the next one on.
   */
  _buildCourse(C) {
    const L = levelOf(C);
    const I = this.isle;
    const dc = this.dream.game?.world?.dojoCentre ?? { x: 0, z: 0 };
    const pivot = new THREE.Group();
    pivot.position.set(dc.x, 0, dc.z);
    const inner = new THREE.Group();
    inner.position.set(-dc.x, 0, -dc.z);
    pivot.add(inner);
    this.root.add(pivot);
    const view = { id: C.id, C, L, pivot, inner, fade: 1, solids: [], decks: [], ropes: [], ladders: [], barrels: [] };
    const solid = (a, b, r, top) => {
      const q = this._w(a, b);
      const s = { x: q.x, z: q.z, r };
      if (top != null) s.top = I.y + top;
      this.sim.solids.push(s);
      view.solids.push(s);
    };
    // THE GROUND YOU MAY WALK ON, faintly lit: every walkable cell of the raster, one mesh.
    {
      const pos = [];
      const h = GRID / 2;
      for (let i = 0; i < L.nA; i++) for (let j = 0; j < L.nB; j++) {
        if (!L.walk[i * L.nB + j]) continue;
        const a = L.ca(i); const b = L.cb(j);
        const c = [[a - h, b - h], [a + h, b - h], [a + h, b + h], [a - h, b + h]].map(([u, v]) => this._w(u, v, 0.03));
        for (const k of [0, 1, 2, 0, 2, 3]) pos.push(c[k].x, c[k].y, c[k].z);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x3dffb0, transparent: true, opacity: 0.2, toneMapped: false, depthWrite: false, side: THREE.DoubleSide }));
      m.renderOrder = -2;
      inner.add(m);
    }
    /* THE FOREST: canes on a jittered lattice over every forest cell, taller
       further from the path, and the FENCE — the canes along its edge. None of
       them is solid: the edge is `edgeRaster`, held in `_bounds`.
       X-RAYED (`sim.xray`) round every kitten, because a 6-high wall of canes
       on the camera's side of a 2.4-wide corridor is otherwise the whole
       picture. */
    {
      const canes = [];
      let s = 0x51ce ^ C.id.length * 977;
      const R = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
      for (let a = REGION.a0 + 0.3; a <= REGION.a1; a += 1.05) {
        for (let b = REGION.b0; b <= REGION.b1; b += 1.05) {
          const ca = a + (R() - 0.5) * 0.7; const cb = b + (R() - 0.5) * 0.7;
          const c = L.cell(ca, cb);
          if (c < 0 || !L.forest[c]) continue;
          canes.push({ a: ca, b: cb, h: 3.6 + R() * 3.2, lean: (R() - 0.5) * 0.14 });
        }
      }
      /* THE FENCE IS DRAWN, NOT PUSHED. Its canes were solids 0.7 apart, and
         each shoved her out along its own radius while `_bounds` pulled her
         back — "it is teleporting the player around the bamboo area because of
         the colliders, instead it should just prevent the player from going
         there". The edge is `edgeRaster` now, held in `_bounds`. */
      for (const f of L.fence) canes.push({ a: f.a, b: f.b, h: 3.2 + R() * 1.6, lean: (R() - 0.5) * 0.1 });
      /* THE DENSE BAND behind the fence, on a lattice nearly twice as tight as
         the forest's: Richard, "increase the solidity of the 'out of bounds'
         area ... should be a solid thick bamboo forest player can't get to or
         through". What HOLDS her is `walkAt` (`_bounds`); this is what says so. */
      for (let a = REGION.a0 + 0.1; a <= REGION.a1; a += 0.6) {
        for (let b = REGION.b0; b <= REGION.b1; b += 0.6) {
          const ca = a + (R() - 0.5) * 0.4; const cb = b + (R() - 0.5) * 0.4;
          const c = L.cell(ca, cb);
          if (c < 0 || !L.band[c]) continue;
          canes.push({ a: ca, b: cb, h: 4.4 + R() * 2.6, lean: (R() - 0.5) * 0.12 });
        }
      }
      /* THE TRAIL'S CANES: a way through the woods she weaves along, "not as
         dense as the normal 'out of bounds' area". Held the way the fence is
         (`edgeRaster` keeps her KITTEN_R off each), not pushed. */
      for (const t of L.trailCanes) canes.push({ a: t.a, b: t.b, h: t.h, lean: (R() - 0.5) * 0.12 });
      for (const c of L.cover.filter((x) => x.kind === 'clump')) {
        for (let k = 0; k < 6; k++) {
          const t = R() * Math.PI * 2; const r = R() * c.r * 0.8;
          canes.push({ a: c.a + Math.cos(t) * r, b: c.b + Math.sin(t) * r, h: 4.4 + R() * 2, lean: (R() - 0.5) * 0.12 });
        }
      }
      const geo = new THREE.CylinderGeometry(0.11, 0.15, 1, 5).translate(0, 0.5, 0);
      const mat = this.sim.xray(new THREE.MeshBasicMaterial({ color: 0x5ce8a0, transparent: true, opacity: 0.55, toneMapped: false, depthWrite: false }));
      const inst = new THREE.InstancedMesh(geo, mat, canes.length);
      const m4 = new THREE.Matrix4(); const qt = new THREE.Quaternion(); const e = new THREE.Euler();
      canes.forEach((c, i) => {
        const q = this._w(c.a, c.b);
        e.set(c.lean, 0, -c.lean);
        inst.setMatrixAt(i, m4.compose(new THREE.Vector3(q.x, q.y, q.z), qt.setFromEuler(e), new THREE.Vector3(1, c.h, 1)));
      });
      inst.frustumCulled = false;
      inner.add(inst);
    }
    // COVER: barrels and stacks you can crouch behind, long grass you crawl in.
    let stackN = C.id.length;
    for (const c of L.cover) {
      if (c.kind === 'clump') { solid(c.a, c.b, c.r); continue; }
      const q = this._w(c.a, c.b);
      let m;
      if (c.kind === 'barrel') {
        m = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.5, COVER.barrel, 12).translate(0, COVER.barrel / 2, 0),
          new THREE.MeshBasicMaterial({ color: 0x7a4a26, transparent: true, opacity: 0.9 }));
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.04, 4, 20).rotateX(Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: HOLO.gold, toneMapped: false, transparent: true, opacity: 0.8 }));
        hoop.position.y = COVER.barrel * 0.7;
        m.add(hoop);
        view.barrels.push({ a: c.a, b: c.b, mesh: m });
        solid(c.a, c.b, c.r, COVER.barrel);
      } else if (c.kind === 'crate') {
        m = this._stack(c.stack ?? STACKS[stackN++ % STACKS.length]);
        m.rotation.y = Math.atan2(this.isle.fwd.x, this.isle.fwd.z) + (c.turn ?? 0);
        solid(c.a, c.b, c.r, COVER.crate);
      } else {
        // A thicket: tufts, not solid — she crawls into it.
        m = new THREE.Group();
        for (let k = 0; k < 9; k++) {
          const t = (k / 9) * Math.PI * 2; const r = c.r * (k % 3 ? 0.65 : 0.25);
          const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.32, COVER.thicket * 1.15, 5).translate(0, COVER.thicket * 0.57, 0),
            new THREE.MeshBasicMaterial({ color: 0x47c47a, transparent: true, opacity: 0.7, toneMapped: false, depthWrite: false }));
          tuft.position.set(Math.cos(t) * r, 0, Math.sin(t) * r);
          m.add(tuft);
        }
      }
      m.position.set(q.x, q.y, q.z);
      inner.add(m);
    }
    /* HOUSES: walls she cannot pass (a post every 0.45, topped at the roof, so
       on the roof she walks over them), a roof she can stand on and bumps her
       head on from inside, a ladder if it has one. Walls and roof x-ray, so
       the kitten indoors is still on the screen: "x-ray on buildings". */
    for (const H of C.houses ?? []) {
      const wallMat = this.sim.xray(new THREE.MeshBasicMaterial({ color: 0x2a4a5c, transparent: true, opacity: 0.85 }));
      const edgeMat = new THREE.MeshBasicMaterial({ color: HOLO.cyan, transparent: true, opacity: 0.7, toneMapped: false });
      for (const w of houseWalls(H)) {
        this._slab(w.a0, w.b0, w.a1, w.b1, 0.25, H.h, 0, wallMat, inner);
        this._slab(w.a0, w.b0, w.a1, w.b1, 0.3, 0.08, H.h - 0.04, edgeMat, inner);
        const len = Math.hypot(w.a1 - w.a0, w.b1 - w.b0);
        const n = Math.max(1, Math.ceil(len / 0.45));
        for (let k = 0; k <= n; k++) solid(lerp(w.a0, w.a1, k / n), lerp(w.b0, w.b1, k / n), 0.3, H.h);
      }
      const deck = new RoofDeck(I, H);
      this.sim.decks.push(deck);
      view.decks.push(deck);
      const c = this._w((H.a0 + H.a1) / 2, (H.b0 + H.b1) / 2, H.h);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(H.b1 - H.b0, 0.3, H.a1 - H.a0).translate(0, -0.15, 0),
        this.sim.xray(new THREE.MeshBasicMaterial({ color: 0x1b3444, transparent: true, opacity: 0.8 })));
      roof.position.set(c.x, c.y, c.z);
      roof.rotation.y = Math.atan2(this.isle.fwd.x, this.isle.fwd.z);
      inner.add(roof);
      if (H.ladder) {
        const ft = ladderFoot(H);
        const into = { a: Math.cos(ft.face), b: Math.sin(ft.face) };
        const side = { a: -into.b, b: into.a };
        const railMat = new THREE.MeshBasicMaterial({ color: HOLO.gold, transparent: true, opacity: 0.85, toneMapped: false });
        const fa = ft.a + into.a * 0.25; const fb = ft.b + into.b * 0.25;
        for (const s of [-0.35, 0.35]) {
          const q = this._w(fa + side.a * s, fb + side.b * s);
          const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, H.h + 0.6, 5).translate(0, (H.h + 0.6) / 2, 0), railMat);
          rail.position.set(q.x, q.y, q.z);
          inner.add(rail);
        }
        for (let y = 0.45; y < H.h + 0.4; y += 0.5) this._slab(fa - side.a * 0.35, fb - side.b * 0.35, fa + side.a * 0.35, fb + side.b * 0.35, 0.05, 0.05, y, railMat, inner);
        view.ladders.push({ H, foot: ft, into, top: H.h });
      }
    }
    // TOWERS: a post, a floor, a rail. The archer stands on it.
    for (const T of C.towers ?? []) {
      const q = this._w(T.a, T.b);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, T.h, 8).translate(0, T.h / 2, 0),
        new THREE.MeshBasicMaterial({ color: 0x24384a, transparent: true, opacity: 0.9 }));
      post.position.set(q.x, q.y, q.z);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(T.r, T.r * 0.9, 0.3, 16).translate(0, T.h - 0.15, 0),
        new THREE.MeshBasicMaterial({ color: 0x1b3444, transparent: true, opacity: 0.9 }));
      top.position.copy(post.position);
      const rail = new THREE.Mesh(new THREE.TorusGeometry(T.r, 0.05, 4, 24).rotateX(Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xc77dff, transparent: true, opacity: 0.8, toneMapped: false }));
      rail.position.set(q.x, q.y + T.h + 0.7, q.z);
      inner.add(post, top, rail);
      solid(T.a, T.b, T.r);
    }
    /* ROPES: a line between two roofs, hung from — and ITS SHADOW on whatever
       is under it, roof or street, with a ring on each roof where she stands
       to grab it. Richard: "the rope has no shadow, so it's hard to see where
       it is placed". From the plaza's camera a thin line seven units up reads
       as being anywhere along the lens's ray; the shadow pins it to the floor. */
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x03070c, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const grabMat = new THREE.MeshBasicMaterial({ color: 0xe8d3a0, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false });
    for (const R of C.ropes ?? []) {
      // tied ROPE_RISE over the roof under each end, so it slopes from a low roof to a high one (`ropeEnds`)
      const E = ropeEnds(C, R);
      const p0 = this._w(R.from[0], R.from[1], E.y0); const p1 = this._w(R.to[0], R.to[1], E.y1);
      const path = new THREE.LineCurve3(new THREE.Vector3(p0.x, p0.y, p0.z), new THREE.Vector3(p1.x, p1.y, p1.z));
      inner.add(new THREE.Mesh(new THREE.TubeGeometry(path, 1, 0.08, 6, false),
        new THREE.MeshBasicMaterial({ color: 0xf2dfae, toneMapped: false })));
      const len = Math.hypot(R.to[0] - R.from[0], R.to[1] - R.from[1]);
      const ua = (R.to[0] - R.from[0]) / len; const ub = (R.to[1] - R.from[1]) / len;
      const pos = [];
      const floor = (a, b) => (C.houses ?? []).find((H) => inHouse(H, a, b))?.h ?? 0;
      for (let t = 0; t < len; t += 0.25) {
        const t1 = Math.min(len, t + 0.25);
        const a0 = R.from[0] + ua * t; const b0 = R.from[1] + ub * t;
        const a1 = R.from[0] + ua * t1; const b1 = R.from[1] + ub * t1;
        const y = floor((a0 + a1) / 2, (b0 + b1) / 2) + 0.05;
        const c = [[a0 - ub * 0.16, b0 + ua * 0.16], [a1 - ub * 0.16, b1 + ua * 0.16], [a1 + ub * 0.16, b1 - ua * 0.16], [a0 + ub * 0.16, b0 - ua * 0.16]]
          .map(([u, v]) => this._w(u, v, y));
        for (const k of [0, 1, 2, 0, 2, 3]) pos.push(c[k].x, c[k].y, c[k].z);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const sh = new THREE.Mesh(g, shadowMat);
      sh.renderOrder = 1;
      inner.add(sh);
      for (const [a, b] of [R.from, R.to]) {
        const H = (C.houses ?? []).find((h) => inHouse(h, a, b));
        if (!H) continue;
        const q = this._w(a, b, H.h + 0.06);
        const ring = new THREE.Mesh(new THREE.RingGeometry(ROPE.grab - 0.12, ROPE.grab, 28).rotateX(-Math.PI / 2), grabMat);
        ring.position.set(q.x, q.y, q.z);
        inner.add(ring);
      }
      view.ropes.push({ a0: R.from[0], b0: R.from[1], a1: R.to[0], b1: R.to[1], y0: E.y0, y1: E.y1, h0: E.H0?.h ?? 0, h1: E.H1?.h ?? 0 });
    }
    // LANTERNS (checkpoints) — all of them built; which are out is the difficulty's.
    view.lanterns = (C.lanterns ?? []).map((l) => {
      const q = this._w(l.a, l.b);
      const g = new THREE.Group();
      g.position.set(q.x, q.y, q.z);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.5, 6).translate(0, 0.75, 0),
        new THREE.MeshBasicMaterial({ color: 0x2a3a40 }));
      const light = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.6, 8).translate(0, 1.85, 0),
        new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.9, toneMapped: false }));
      const pad = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.15, 28).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: HOLO.gold, transparent: true, opacity: 0.35, toneMapped: false, depthWrite: false }));
      pad.position.y = 0.05;
      g.add(post, light, pad);
      inner.add(g);
      return { ...l, g, light };
    });
    // PICKUPS: a shuriken (gold star) or a smoke bomb (a dark ball with a fuse).
    view.pickups = (C.pickups ?? []).map((k) => {
      const q = this._w(k.a, k.b);
      const g = new THREE.Group();
      g.position.set(q.x, q.y + 1.0, q.z);
      if (k.kind === 'shuriken') {
        const star = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 4),
          new THREE.MeshBasicMaterial({ color: 0xdfe8ff, toneMapped: false }));
        star.rotation.x = Math.PI / 2;
        g.add(star);
      } else {
        g.add(new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), new THREE.MeshBasicMaterial({ color: 0x3a3f4a })));
        const fuse = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffa23b, toneMapped: false }));
        fuse.position.y = 0.4;
        g.add(fuse);
      }
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.85, 24).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: k.kind === 'shuriken' ? HOLO.cyan : 0xb35cff, transparent: true, opacity: 0.6, toneMapped: false, depthWrite: false }));
      ring.position.y = -0.95;
      g.add(ring);
      inner.add(g);
      return { ...k, g, gone: 0 };
    });
    // THE SCROLL: an altar and a turning gold scroll, with its name over it.
    {
      const q = this._w(C.scroll.a, C.scroll.b);
      const g = new THREE.Group();
      g.position.set(q.x, q.y, q.z);
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.7, 16).translate(0, 0.35, 0), new THREE.MeshBasicMaterial({ color: 0x1a3040 })));
      const scroll = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.4, 12), new THREE.MeshBasicMaterial({ color: HOLO.gold, toneMapped: false }));
      scroll.rotation.z = Math.PI / 2;
      scroll.position.y = 1.4;
      g.add(scroll);
      const pad = new THREE.Mesh(new THREE.RingGeometry(1.45, 1.6, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: HOLO.gold, transparent: true, opacity: 0.6, toneMapped: false, depthWrite: false }));
      pad.position.y = 0.05;
      g.add(pad);
      inner.add(g);
      view.scroll = scroll;
    }
    // THE GUARDS — every one the course has; `active` is who is out at this difficulty.
    view.guards = (C.guards ?? []).map((g) => new Guard(this, g, inner));
    this._activate(view);
    view.mats = [];
    inner.traverse((o) => {
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) if (!view.mats.some((x) => x.m === m)) view.mats.push({ m, o0: m.opacity, tr: m.transparent });
    });
    return view;
  }

  /** Who is out, and which lanterns and pickups, at the difficulty in hand. */
  _activate(view = this.view) {
    const n = this.session?.diff ?? this.diff;
    const on = new Set(guardsOn(view.C, n));
    for (const g of view.guards) {
      g.active = on.has(g.g);
      g.group.visible = g.active;
      g.cone.visible = g.active;
      g.reset(this.clock);
    }
    const lit = new Set(lanternsOn(view.C, n));
    for (const l of view.lanterns) { l.on = lit.has((view.C.lanterns ?? []).find((x) => x.a === l.a && x.b === l.b)); l.g.visible = l.on; l.light.material.color.set(0x555555); }
    const pk = new Set(pickupsOn(view.C, n).map((x) => `${x.a},${x.b}`));
    for (const k of view.pickups) { k.on = pk.has(`${k.a},${k.b}`); k.gone = 0; k.g.visible = k.on; }
  }

  /** Take a course's solids and decks out of the world (it is swiping off). */
  _unsolid(view) {
    for (const s of view.solids) { const i = this.sim.solids.indexOf(s); if (i >= 0) this.sim.solids.splice(i, 1); }
    for (const d of view.decks) { const i = this.sim.decks.indexOf(d); if (i >= 0) this.sim.decks.splice(i, 1); }
    view.solids = [];
    view.decks = [];
  }

  _buildPlaza() {
    const I = this.isle;
    this.kiosks = [];
    const kq = this._w(PLAZA.kiosk.a, PLAZA.kiosk.b);
    this.kiosk = new Kiosk(this.dream, {
      x: kq.x, z: kq.z, y: I.y, r: 1.6, colour: 0x6dffb0, kanji: '忍', title: 'INFILTRATION', near: 5, cardH: 4.2,
      card: (p) => this._card(p),
      prompt: (p, key) => this._prompt(p, key),
      interact: (p) => this.interact(p),
    });
    this.kiosks.push(this.kiosk);
    const bq = this._w(PLAZA.board.a, PLAZA.board.b, PLAZA.board.lift);
    this.board = new HoloPanel({ w: 7.2, h: 4.6, px: 90, edge: 0x6dffb0 });
    this.board.position.set(bq.x, bq.y, bq.z);
    this.root.add(this.board);
    const bk = this._w(PLAZA.boardKiosk.a, PLAZA.boardKiosk.b);
    this.boardKiosk = new Kiosk(this.dream, {
      x: bk.x, z: bk.z, y: I.y, r: 1.2, colour: HOLO.gold, kanji: '記', title: 'BAMBOO BOARD', near: 3.5,
      card: null,
      prompt: (p, key) => `[${key}]  CHANGE WHAT THE BOARD SHOWS`,
      interact: (p) => this.openBoardFilters(p),
    });
    this.kiosks.push(this.boardKiosk);
    // THE GATE'S BARRIER: cyan while the course is shut, red while a session is in it.
    const g0 = this._w(GATE.a, -BARRIER.w / 2); const g1 = this._w(GATE.a, BARRIER.w / 2);
    const len = Math.hypot(g1.x - g0.x, g1.z - g0.z);
    this.barrier = new THREE.Mesh(new THREE.PlaneGeometry(len, BARRIER.h).translate(0, BARRIER.h / 2, 0),
      new THREE.MeshBasicMaterial({ color: BARRIER.idle, transparent: true, opacity: 0.3, toneMapped: false, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    this.barrier.position.set((g0.x + g1.x) / 2, I.y, (g0.z + g1.z) / 2);
    this.barrier.rotation.y = Math.atan2(g1.x - g0.x, g1.z - g0.z) - Math.PI / 2;
    this.root.add(this.barrier);
    this.barrierBands = [];
    for (let k = 0; k < 4; k++) {
      const band = this._slab(GATE.a, -BARRIER.w / 2, GATE.a, BARRIER.w / 2, 0.04, 0.06, 0.4 + k * 0.9,
        new THREE.MeshBasicMaterial({ color: BARRIER.idle, transparent: true, opacity: 0.8, toneMapped: false }), this.root);
      this.barrierBands.push(band);
    }
    // The start's sanctuary, drawn like a lantern's.
    const sq = this._w(SAFE.start.a, SAFE.start.b, 0.05);
    const startRing = new THREE.Mesh(new THREE.RingGeometry(SAFE.start.r - 0.15, SAFE.start.r, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: HOLO.gold, transparent: true, opacity: 0.35, toneMapped: false, depthWrite: false }));
    startRing.position.set(sq.x, sq.y, sq.z);
    this.root.add(startRing);
    /* The gate's name, on the PLAZA side and low: her run camera looks up the
       course over the gate, and a sign on the gate at 5.2 high sat exactly on
       her at the start (screenshot, Oct 2026). Lower and nearer the lens, it
       projects below her. */
    const gs = this._w(GATE.a - 2.5, 0);
    this.sim.addSign?.(gs.x, I.y + 3.6, gs.z, '門', 'THE GATE', 0x6dffb0, { scale: 0.7 });
    this._paintBoard();
  }

  /* ------------------------------ the kiosk ------------------------------- */

  /** A course is open with any star on the one before it (or the debug row). */
  courseLock(p, id) {
    const k = COURSES.findIndex((c) => c.id === id);
    if (k <= 0 || this.dream.game?._debugBambooAll) return null;
    const prev = COURSES[k - 1];
    const name = nameOf(p);
    const any = DIFFS.some((_, n) => this.dream.progress.stars(name, starsId(prev.id, n)) > 0);
    return any ? null : `Reach the scroll in ${prev.name} to open ${COURSES[k].name}`;
  }

  _prompt(p, key) {
    if (this.session) return this.inSession(p) ? '' : `${this._names()} ARE SNEAKING — WAIT FOR THEM`;
    if (this.picking != null && this.picking !== p.index) return `${this._pickerName()} IS CHOOSING THE COURSE`;
    return `[${key}]  CHOOSE A COURSE`;
  }

  _names() {
    return [...(this.session?.runs.values() ?? [])].map((r) => r.p.name).join(' & ').toUpperCase() || 'THEY';
  }

  _pickerName() {
    return (this.dream.game.players?.[this.picking]?.name ?? 'SOMEBODY').toUpperCase();
  }

  _card(p) {
    const C = this.course;
    const name = nameOf(p);
    const row = DIFFS.map((D, n) => {
      const best = this.dream.progress.best(name, starsId(C.id, n));
      return `${D.name} ${stars3(this.dream.progress.stars(name, starsId(C.id, n)))}${best != null ? ` ${best.toFixed(1)}s` : ''}`;
    }).join('   ');
    const lock = this.courseLock(p, C.id);
    return [
      { text: `忍 ${C.kanji} ${C.name}`, size: 1.8, color: 0x6dffb0, glow: true, jp: true },
      { text: C.blurb, size: 1.0, color: 0x9fefff },
      { text: lock ? `🔒 ${lock}` : C.teach, size: 1.0, color: lock ? 0xff8a8a : HOLO.gold },
      { text: `[${this.dream.key(p, 'mount')}] crawl (hold, or tap twice)  ·  [${this.dream.key(p, 'attack')}] hold to throw`, size: 0.85 },
      { text: row, size: 1.0, color: HOLO.gold },
      { text: 'no orbs, no clan in here: everybody on the island goes in', size: 0.85, color: 0x9fefff },
    ];
  }

  interact(p) {
    if (this.session) {
      if (!this.inSession(p)) {
        this.dream.hint?.(p, `${this._names()} are on the course — you can go in with them next time`);
        this.dream.game.sfx?.('deny');
      }
      return false;
    }
    if (this.picking != null && this.picking !== p.index) {
      this.dream.hint?.(p, `${this._pickerName()} is choosing the course — wait for her to pick`);
      this.dream.game.sfx?.('deny');
      return false;
    }
    return this.openPicker(p);
  }

  /**
   * THE PICKER: course ◀▶ (the course on the island swipes as it changes —
   * "a level select like Sine, with a circular swipe about the Dojo of the
   * Turning Circle"), difficulty ◀▶, and GO, which takes everybody.
   */
  openPicker(p) {
    const D = this.dream;
    const cyc = (list, cur, s) => list[(list.indexOf(cur) + s + list.length) % list.length];
    const rows = [
      {
        text: () => `COURSE  ◀ ${this.courseLock(p, this.courseId) ? '🔒 ' : ''}${this.course.kanji} ${this.course.name} ▶`,
        cycle: (s) => {
          this.setCourse(cyc(COURSES.map((c) => c.id), this.courseId, s), s);
          const why = this.courseLock(p, this.courseId);
          if (why) { D.hint?.(p, why); D.game.sfx?.('deny'); }
        },
      },
      {
        text: () => `DIFFICULTY  ◀ ${DIFFS[this.diff].name} ${stars3(D.progress.stars(nameOf(p), starsId(this.courseId, this.diff)))} ▶`,
        cycle: (s) => { this.diff = (this.diff + s + DIFFS.length) % DIFFS.length; this._activate(); this._paintBoard(); },
      },
      { text: () => `GO! (${this._joiners(p).length} on the island)`, act: () => this.begin(p) },
      { text: 'not now', dim: true, act: () => D.closeChoice(p) },
    ];
    D.openChoice(p, { title: `忍 BAMBOO INFILTRATION — ${p.name}`, rows, start: 2, lens: PICK });
    this.picking = p.index;
    this._pickChoice = D.choices?.[p.index] ?? null;
    return true;
  }

  /** Everybody idle on the island goes in with her. */
  _joiners(p) {
    const out = idleIn(this.dream).filter((q) => this.onIsland(q) && !this.dream.choices?.[q.index]);
    if (p && !out.includes(p)) out.unshift(p);
    return out.slice(0, SLOTS.length);
  }

  begin(p) {
    const why = this.courseLock(p, this.courseId);
    if (why || this.swipe) {
      this.dream.hint?.(p, why ?? 'Wait for the course to land!');
      this.dream.game.sfx?.('deny');
      return false;
    }
    this.dream.closeChoice(p);
    this.picking = null;
    this._start(this._joiners(p));
    return true;
  }

  /** ◀▶ on COURSE: the old one swipes off round the hub, the new one on. */
  setCourse(id, dir = 1) {
    if (id === this.courseId || !courseById(id) || this.session) return false;
    if (this.swipe) this._endSwipe();
    const out = this.view;
    for (const m of out.mats) { m.o0 = m.m.opacity; m.m.transparent = true; }
    this._unsolid(out);
    this.courseId = id;
    this.boardFilter.course = id;
    this.view = this._buildCourse(courseById(id));
    for (const m of this.view.mats) m.m.transparent = true;
    this.swipe = { t: 0, dir: dir < 0 ? -1 : 1, out };
    this._stepSwipe(0);
    this.dream.game.sfx?.('rez');
    this._paintBoard();
    return true;
  }

  _stepSwipe(dt) {
    const W = this.swipe;
    if (!W) return;
    W.t = Math.min(SWIPE.dur, W.t + dt);
    const k = W.t / SWIPE.dur;
    const e = k * k * (3 - 2 * k);
    W.out.pivot.rotation.y = W.dir * SWIPE.ang * e;
    this.view.pivot.rotation.y = -W.dir * SWIPE.ang * (1 - e);
    for (const m of W.out.mats) m.m.opacity = (m.o0 ?? 1) * (1 - e);
    for (const m of this.view.mats) m.m.opacity = (m.o0 ?? 1) * e;
    if (W.t >= SWIPE.dur) this._endSwipe();
  }

  _endSwipe() {
    const W = this.swipe;
    if (!W) return;
    this.swipe = null;
    for (const g of W.out.guards) g.dispose();
    W.out.pivot.traverse((o) => { o.geometry?.dispose?.(); });
    W.out.pivot.removeFromParent();
    this.view.pivot.rotation.y = 0;
    for (const m of this.view.mats) { m.m.opacity = m.o0; m.m.transparent = m.tr; }
  }

  openBoardFilters(p) {
    this.lastAt = -Infinity;
    const rows = bambooFilterRows(this, p, this.boardFilter, () => this._paintBoard());
    const k = this.boardKiosk;
    this.dream.openChoice(p, { title: `記 BAMBOO BOARD — ${nameOf(p)}`, rows, start: 0, anchor: { x: k.x, y: k.y, z: k.z } });
    this._paintBoard();
    return true;
  }

  /* ------------------------------ a session ------------------------------- */

  _start(list) {
    const C = this.course;
    const n = this.diff;
    /* `cp` is the PARTY's checkpoint — the lantern lit last, by anybody — and
       `capture` the one capture everybody is being put back for. */
    this.session = { course: C.id, diff: n, live: false, t: 0, runs: new Map(), results: [], cp: null, lit: new Set(), capture: null };
    const S = this.session;
    this._activate();
    this.shots.clear();
    this.pebbles.forEach((q) => q.mesh.removeFromParent());
    this.pebbles = [];
    for (const s of this.smokes) s.mesh.removeFromParent();
    this.smokes = [];
    // The best run there has been: its ghost runs beside them (ghost.js).
    const ghost = ghostFor(starsId(C.id, n));
    this.ghost = null;
    if (ghost && this.art) {
      const art = this.art.kittens[ghost.style] ?? this.art.kittens[0];
      if (art) {
        const h = list[0]?.height ?? 2.6;
        this.ghost = new GhostFigure(this.root, ghost, art, h, (a, b, y) => this._w(a, b, y), (th) => isleFacing(this.isle, th));
        this.ghostName = ghost.name;
      }
    }
    list.forEach((p, k) => {
      const slot = SLOTS[k];
      this.dream.bench(p, 'Bamboo Infiltration');
      this._place(p, slot.a, slot.b, 0, 0);
      const run = {
        i: p.index, p, slot, caught: 0, lit: new Set(), cp: { a: slot.a, b: slot.b, th: 0 },
        carry: { shuriken: 0, smoke: 0 }, latch: false, sneak: false, charge: null, hidden: null,
        capture: null, noiseT: 0, ropeCd: 0, wasGround: true, peakY: 0, crawlT: 0, throwT: -9,
        last: this.coords(p), rec: new GhostRecorder(),
        // The last walkable ground she stood over (`_bounds`), and who has had her in his eye, when.
        ok: { a: slot.a, b: slot.b }, sawBy: new Map(), sprinting: false,
      };
      if (this.art) p.setClipArt?.(this.art.kittens[styleIdx(p)], ClipSprite);
      run.aim = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 28).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: RING_COL, transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false }));
      run.aim.visible = false;
      run.smokeRing = new THREE.Mesh(new THREE.RingGeometry(SMOKE.r - 0.12, SMOKE.r, 48).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xb35cff, transparent: true, opacity: 0.35, toneMapped: false, depthWrite: false }));
      run.smokeRing.visible = false;
      this.root.add(run.aim, run.smokeRing);
      S.runs.set(p.index, run);
      this.dream.startDrill(p, this._spec(run, C, n), { x: this.isle.x, y: this.isle.y, z: this.isle.z, r: this.isle.r, fwd: this.isle.fwd });
      run.drill = this.dream.drills[p.index];
    });
    const who = list.map((p) => p.name).join(', ');
    this.dream.holoSay?.(`${C.kanji} ${C.name} · ${DIFFS[n].name} — ${who}: crawl to the scroll! Nobody sees a kitten who crawls.`, 6);
    this.dream.game.sfx?.('rez');
    this._paintBoard();
  }

  /** Her run is over (its drill has gone): written down, out to the plaza, kit back on. */
  _finish(run) {
    const S = this.session;
    if (!S || !S.runs.has(run.i)) return;
    S.runs.delete(run.i);
    const d = run.drill;
    const won = d?.state === 'won';
    S.results.push({
      i: run.i, name: run.p.name, colour: run.p.style?.colour ?? HOLO.cyan,
      time: won ? d.result?.score ?? (d.t + run.caught * CAUGHT_COST) : null, stars: won ? d.stars_ ?? 1 : 0,
      caught: run.caught, lit: run.lit.size,
    });
    this._cleanup(run);
    const p = run.p;
    if (this.dream.realmOf(p) === 'sim') {
      this._toPlaza(p);
      this.dream.unbench(p);
    }
    if (!S.runs.size) this._close();
    this._paintBoard();
  }

  /** Everything the run put on her comes off. Safe to call twice. */
  _cleanup(run) {
    const p = run.p;
    if (p.rig?.bamboo) p.rig = null;
    p.clipAs = null;
    p.gaitK = 1;
    p.group.visible = true;
    run.aim?.removeFromParent();
    run.smokeRing?.removeFromParent();
    for (const g of this.view.guards) { g.meter.delete(run.i); if (g.arresting === run.i) g.release(); }
  }

  _close() {
    const S = this.session;
    if (!S) return;
    const ranked = [...S.results].sort((x, y) => (x.time == null) - (y.time == null) || (x.time ?? 0) - (y.time ?? 0));
    if (ranked.length > 1 && ranked[0].time != null) {
      this.dream.holoSay?.(`${ranked[0].name} reached the scroll first — ${ranked[0].time.toFixed(1)}!`, 6);
      this.dream.game.sfx?.('firework');
    }
    // "After a course, everyone can enter the next": the picker opens on it.
    if (S.results.some((r) => r.time != null)) {
      const k = COURSES.findIndex((c) => c.id === S.course);
      if (k >= 0 && k < COURSES.length - 1) this._nextUp = COURSES[k + 1].id;
    }
    this.last = { course: S.course, diff: S.diff, results: S.results };
    this.lastAt = this.dream.t ?? 0;
    this.session = null;
    this.ghost?.dispose();
    this.ghost = null;
    this.shots.clear();
    this._activate();
    if (this._nextUp) { const id = this._nextUp; this._nextUp = null; this.setCourse(id, 1); }
    this._paintBoard();
  }

  /** She left the simulator (`DreamDojo._leaveSim`), before it takes her kit apart. */
  forget(p) {
    const run = this.runOf(p);
    if (!run) return;
    if (run.drill && (run.drill.state === 'live' || run.drill.state === 'ready')) run.drill.state = 'failed';
    this._finish(run);
    this.dream.unbench(p, true);
  }

  /** Out of the course, from wherever she is in it (the pause menu, or INTERACT's question). */
  leaveCourse(p) {
    const run = this.runOf(p);
    if (!run) return false;
    run.left = true;
    const d = run.drill;
    if (d && (d.state === 'live' || d.state === 'ready')) d.fail(`${p.name} left the course`);
    return true;
  }

  /** Everybody out at once (a scene, the tournament, a restart). */
  reset() {
    const S = this.session;
    if (!S) return;
    for (const run of [...S.runs.values()]) {
      this._cleanup(run);
      this.dream.unbench(run.p, true);
    }
    S.runs.clear();
    this._close();
  }

  /* -------------------------- the drill, per kitten ----------------------- */

  _spec(run, C, n) {
    const B = this;
    return {
      id: starsId(C.id, n), title: `${C.name} · ${DIFFS[n].name}`, kanji: C.kanji,
      goalText: 'reach the scroll — unseen', goal: 1, showCount: false, bands: C.bands[n], lowerIsBetter: true,
      score: (d) => d.t + run.caught * CAUGHT_COST,
      grace: 3, leaveR: this.isle.r + 6, noBar: true,
      /* THE CARD SQUARE ON TO THE LENS, pitch and all: "it is hard to read the UI above the player, should
         probably be billboarded towards the camera". BAMBOO_CAM looks down at 0.95 rad, so a card turned
         about Y alone was read 54° foreshortened - the Kata Trace's card had the same note and the same fix. */
      setup: (d) => { d.panel.fullFace = true; },
      start: () => { if (B.session) B.session.live = true; },
      steer: (d, pad) => B._steer(run, d, pad),
      quit: () => B._ninjaButton(run),
      tick: (d, dt) => B._tickRun(run, d, dt),
      always: (d) => B._always(run, d),
      camera: () => B._camera(run),
      paint: (d) => B._paint(run, d, C, n),
      dispose: () => B._cleanup(run),
    };
  }

  /**
   * HER PAD, AS A NINJA'S. The Ward is the crawl and ATTACK is the throw, so
   * neither reaches the player as itself (no Ward, no katana in here);
   * sprinting is not a crawl's; and a kitten with her hands up, in a barrel,
   * or counting in has no legs at all.
   */
  _steer(run, d, pad) {
    const p = run.p;
    const live = d.state === 'live';
    /* JUMP IS THE NINJA BUTTON TOO, for a barrel, a rope or a ladder in reach
       — Richard: "let's make the jump button work like the interact button,
       but let's not have the jump button pull up the 'leave the course' menu".
       A press it spends is eaten for the frame, so she does not also jump
       (and a rope just grabbed does not read it as "let go"). With nothing in
       reach it is her jump. */
    run.eat = null;
    if (live && !run.capture && pad.pressed?.('jump') && this._ninjaPress(run, 'jump')) run.eat = 'jump';
    if (live && pad.pressed?.('mount')) {
      if (pad.doubled?.('mount')) run.latch = true;
      else if (run.latch) run.latch = false;
    }
    run.sneak = run.latch || !!pad.down?.('mount');
    const frozen = d.state !== 'live' || !!run.capture || !!run.hidden;
    // THE THROW: held ATTACK winds it up, she plants and aims with the stick; letting go throws.
    if (live && !frozen && !p.rig && pad.down?.('attack')) run.charge = Math.min(THROW.charge, (run.charge ?? 0) + (this._dt ?? 1 / 60));
    else if (run.charge != null) {
      if (live && !frozen) this._throw(run);
      run.charge = null;
    }
    /* Her sprint here is SPRINT.k of her walk (bamboolevel.js) — set as a gait
       under the game's sprint, so the button still reads as SPRINT to her
       legs and her noise, and nothing outside the island moves. */
    const sprint = !run.sneak && !!pad.down?.('sprint');
    run.sprinting = sprint && !frozen;
    p.gaitK = run.charge != null ? 0 : run.sneak ? SNEAK.gait : sprint ? SPRINT.gait : 1;
    run.padIn = pad;
    /* EVERYTHING IN HERE IS READ LIVE, off `run` and `d`, never off this
       call's locals. The proxy is built ONCE, on the first steer — which is
       the count-in — so a `masked` that closed over this call's `frozen` kept
       the count-in's answer for the whole run: every button but START, MAP
       and INTERACT masked from her legs forever. Richard: "seems player is
       walking faster than they are sprinting" — her gait was set to the
       sprint's 0.71 (from the real pad, above) while her legs, asking the
       proxy, never heard SPRINT, so she walked at 0.71 of a walk: 7.46
       against 10.5, measured in the running game. */
    const masked = (a) => a === 'mount' || a === 'attack' || (a === 'sprint' && run.sneak) || (a === run.eat)
      || ((d.state !== 'live' || !!run.capture || !!run.hidden) && a !== 'start' && a !== 'map' && a !== 'interact');
    return (run.pad ??= new Proxy({}, {
      get: (_, k) => {
        const P = run.padIn;
        const still = d.state !== 'live' || !!run.capture || !!run.hidden;
        if (k === 'mx' || k === 'my' || k === 'rx' || k === 'ry') return still ? 0 : P[k];
        if (k === 'nudge') return () => (still ? 0 : P.nudge?.() ?? 1);
        if (k === 'down' || k === 'pressed' || k === 'doubled') return (a, w) => !masked(a) && !!P[k]?.(a, w);
        const v = P[k];
        return typeof v === 'function' ? v.bind(P) : v;
      },
    }));
  }

  /** INTERACT mid-run: whatever is in reach — or, with nothing in reach or near, ask. */
  _ninjaButton(run) {
    const D = this.dream;
    const p = run.p;
    if (this._ninjaPress(run, 'interact')) return;
    if (D.choices?.[p.index]) return;
    D.openChoice(p, {
      title: 'LEAVE THE COURSE?',
      rows: [
        { text: 'no, keep sneaking', act: () => D.closeChoice(p) },
        { text: 'yes, leave the course', act: () => { D.closeChoice(p); this.leaveCourse(p); } },
      ],
    });
  }

  /**
   * ONE PRESS OF THE NINJA BUTTON, by INTERACT (`via` 'interact') or JUMP
   * ('jump'). Out of a barrel; onto a rope; up or down a ladder; into a
   * barrel; and for INTERACT only, the smoke bomb. True when the press was
   * spent — and, for INTERACT, also when something is NEAR but not in reach
   * (`_reach`, NEAR_K), so that press does nothing instead of asking to leave.
   * False means: JUMP is a jump, INTERACT may ask.
   */
  _ninjaPress(run, via) {
    const p = run.p;
    const live = run.drill?.state === 'live';
    if (run.capture) return via === 'interact';
    if (run.hidden) { this._unhide(run); return true; }
    /* On a rope or a ladder JUMP is the rig's ("JUMP lets go"), and INTERACT lets go too — Richard: "the
       player can dismount the rope by pressing the jump/interact button while on it". Never asks up there. */
    if (p.rig) {
      if (via === 'interact') p.rig.letGo?.();
      return via === 'interact';
    }
    if (!live) return false;
    const R = this._reach(run);
    if (R.rope) { this._ropeRig(run, R.rope.R, R.rope.u); return true; }
    if (R.ladder) { this._ladderRig(run, R.ladder.Ld, R.ladder.y0, R.ladder.dir); return true; }
    if (R.barrel) { this._hide(run, R.barrel); return true; }
    if (via === 'jump') return false;
    if (R.near) return true;
    if (run.carry.smoke > 0) { this._smoke(run, this.coords(p)); return true; }
    return false;
  }

  /**
   * WHAT IS IN HER REACH: the rope over her head (her feet on a roof under it,
   * or in the air), the ladder at her feet or at the roof's edge, the nearest
   * barrel — and `near`: any of them within NEAR_K of its reach, on her level.
   */
  _reach(run) {
    const p = run.p;
    const q = this.coords(p);
    const out = { rope: null, ladder: null, barrel: null, near: false };
    for (const R of this.view.ropes) {
      const ea = R.a1 - R.a0; const eb = R.b1 - R.b0;
      const u = Math.max(0.02, Math.min(0.98, ((q.a - R.a0) * ea + (q.b - R.b0) * eb) / (ea * ea + eb * eb)));
      // a sloping rope: its height over where she stands
      const dy = lerp(R.y0, R.y1, u) - q.y;
      const d = segDist(q.a, q.b, R.a0, R.b0, R.a1, R.b1);
      if (!out.rope && run.ropeCd <= 0 && dy >= ROPE.lo && dy <= ROPE.hi && d <= ROPE.grab) out.rope = { R, u };
      if (dy >= ROPE.lo - 1 && dy <= ROPE.hi + 1.5 && d <= ROPE.grab * NEAR_K) out.near = true;
    }
    for (const Ld of this.view.ladders) {
      const f = Ld.foot;
      const top = { a: f.a + Ld.into.a * LADDER.onto, b: f.b + Ld.into.b * LADDER.onto };
      if (q.y < 0.6) {
        const d = Math.hypot(q.a - f.a, q.b - f.b);
        if (d < LADDER.reach && p.onGround) out.ladder ??= { Ld, y0: 0, dir: 1 };
        if (d < LADDER.reach * NEAR_K) out.near = true;
      } else if (Math.abs(q.y - Ld.top) < 0.4) {
        const d = Math.hypot(q.a - top.a, q.b - top.b);
        if (d < LADDER.onto && p.onGround) out.ladder ??= { Ld, y0: Ld.top, dir: -1 };
        if (d < LADDER.onto * NEAR_K) out.near = true;
      }
    }
    if (q.y < 1) {
      let bd = HIDE_R;
      for (const b of this.view.barrels) {
        const d = Math.hypot(b.a - q.a, b.b - q.b);
        if (d < bd && p.onGround) { bd = d; out.barrel = b; }
        if (d < HIDE_R * NEAR_K) out.near = true;
      }
    }
    return out;
  }

  _hide(run, barrel) {
    const p = run.p;
    run.hidden = barrel;
    /* WHO SAW HER GET IN. Richard: "if an npc spots a player go into a barrel
       or hiding obstacle, then they should be able to go up to it and force
       the player out and instantly arrest them". Seen = in his eye in the
       last SPOTTED.memory s (`sawBy`, filled every frame by `_stepWorld`). */
    const T = this.clock;
    const saw = [...run.sawBy].filter(([g, t]) => g.active && g.awake && g.arresting == null && T - t <= SPOTTED.memory).map(([g]) => g);
    const sam = saw.filter((g) => g.kind === 'samurai').sort((x, y) => Math.hypot(x.at.a - barrel.a, x.at.b - barrel.b) - Math.hypot(y.at.a - barrel.a, y.at.b - barrel.b))[0];
    if (sam) sam.fetch(run.i, barrel);
    for (const g of saw) if (g.kind === 'archer') g.watchBarrel(run.i, barrel, SPOTTED.wait);
    run.spottedIn = saw.length > 0;
    const at = this._w(barrel.a, barrel.b);
    p.position.set(at.x + SIM.dx, at.y + 0.05, at.z + SIM.dz);
    p.velocity?.set(0, 0, 0);
    p.rig = { bamboo: true, step: () => p.velocity?.set(0, 0, 0) };
    p.group.visible = false;
    run.charge = null;
    this.dream.game.sfx?.('knock', 0.5);
    this.dream.hint(p, run.spottedIn
      ? `${saw.map((g) => g.kind === 'archer' ? 'the ARCHER' : 'a SAMURAI').join(' and ')} SAW you get in! [${this.dream.key(p, 'interact')}] climbs out`
      : `in the barrel — nobody can see you. [${this.dream.key(p, 'interact')}] climbs out`);
  }

  _unhide(run) {
    const p = run.p;
    const b = run.hidden;
    run.hidden = null;
    if (p.rig?.bamboo) p.rig = null;
    p.group.visible = true;
    const at = this._exitSpot(b, this._facingAng(p));
    this._place(p, at.a, at.b, 0, at.th);
    run.ok = { a: at.a, b: at.b };
    run.last = this.coords(p);
    this.dream.game.sfx?.('knock', 0.5);
  }

  /**
   * OUT OF A BARREL ONTO GROUND SHE FITS ON: the way she faces if it is clear,
   * else the nearest clear bearing to it, a step clear of the barrel. The old
   * exit — 1.2 the way she faced, unchecked — is how she came out of the
   * alley's barrel behind the fence (Richard: "player can appear behind bamboo
   * brush after jumping out of barrel").
   */
  _exitSpot(b, th0) {
    const kit = kittenRaster(this.level);
    for (const r of [HIDE_R - 0.3, HIDE_R, HIDE_R + 0.5]) {
      for (let k = 0; k < 16; k++) {
        const th = th0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
        const a = b.a + Math.cos(th) * r; const bb = b.b + Math.sin(th) * r;
        const c = kit.cell(a, bb);
        if (c >= 0 && kit[c]) return { a, b: bb, th };
      }
    }
    return { a: b.a, b: b.b, th: th0 };
  }

  /** A samurai who saw her get in has walked to the barrel (bambooguards.js `fetch`): out, and caught. */
  tipOut(i, barrel, g) {
    const run = this.session?.runs.get(i);
    if (!run || run.hidden !== barrel) return false;
    this.dream.hint(run.p, 'he SAW you get in — tipped out of the barrel!');
    this.caught(i, g, { force: true });
    return true;
  }

  /** An archer's arrow, into a barrel he saw her get into: a coin — caught, or spooked out of it. */
  arrowInBarrel(s) {
    const w = s.barrel;
    const run = this.session?.runs.get(w?.i);
    if (!run || run.hidden !== w.barrel) return false;
    if ((this.rng ?? Math.random)() < SPOTTED.hit) {
      this.dream.hint(run.p, 'the ARROW found you in the barrel!');
      this.caught(run.i, s.by, { force: true });
    } else {
      this._unhide(run);
      this.dream.game.sfx?.('deny');
      this.dream.hint(run.p, 'THUNK! an arrow in the barrel — you jumped out. RUN!');
    }
    return true;
  }

  /** Her facing as an island bearing. */
  _facingAng(p) { return this._isleAng(Math.sin(p.facing ?? 0), Math.cos(p.facing ?? 0)); }

  /** The smoke bomb: a cloud at her feet nobody sees into or out of. */
  _smoke(run, q) {
    run.carry.smoke--;
    const at = this._w(q.a, q.b);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12),
      new THREE.MeshBasicMaterial({ color: 0x8a8fa0, transparent: true, opacity: 0.55, depthWrite: false }));
    mesh.position.set(at.x, at.y + 1.2, at.z);
    mesh.scale.set(SMOKE.r, 1.8, SMOKE.r);
    this.root.add(mesh);
    const ring = new THREE.Mesh(new THREE.RingGeometry(SMOKE.r - 0.15, SMOKE.r, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xb35cff, transparent: true, opacity: 0.7, toneMapped: false, depthWrite: false }));
    ring.position.set(at.x, at.y + 0.06, at.z);
    this.root.add(ring);
    this.smokes.push({ a: q.a, b: q.b, r: SMOKE.r, t: SMOKE.t, mesh, ring });
    this.dream.game.sfx?.('ko', 0.6);
    this.dream.shards?.burst?.(at.x, at.y + 1, at.z, 0xb0b4c0, 40, 5, 6);
  }

  /** Where the throw lands, from her facing and how long she has held it. */
  _aimPoint(run) {
    const q = this.coords(run.p);
    const th = this._facingAng(run.p);
    const k = Math.min(1, (run.charge ?? 0) / THROW.charge);
    const r = THROW.min + (THROW.max - THROW.min) * k;
    return { a: q.a + Math.cos(th) * r, b: q.b + Math.sin(th) * r, th, from: q };
  }

  /**
   * The awake guard her shuriken would put down, if it were thrown now — and
   * only one she has a clear line to: the ring does not go red for a guard
   * behind a wall (Richard: "Can't throw rocks or shurikens through walls or
   * obstacles"). It flies at chest height, so a crate she stands behind is in
   * the way of it.
   */
  _mineTarget(run, at) {
    if (run.carry.shuriken <= 0) return null;
    const L = this.level;
    let best = null; let bd = THROW.mineR;
    for (const g of this.view.guards) {
      if (!g.active || !g.awake) continue;
      const d = Math.hypot(g.at.a - at.a, g.at.b - at.b);
      if (d >= bd) continue;
      if (blocked(L, { a: at.from.a, b: at.from.b, y: at.from.y + 1.4 }, { a: g.at.a, b: g.at.b, y: (g.at.y ?? 0) + 1.4 }, 'samurai')) continue;
      bd = d; best = g;
    }
    return best;
  }

  /**
   * THE THROW. With a shuriken and a guard under the ring (it turns red), the
   * shuriken, at him: it flies straight and what stops a sight line stops it.
   * Otherwise a pebble, lobbed over everything, whose clatter where it lands
   * is a noise every guard in the difficulty's `pebble` radius walks to.
   */
  _throw(run) {
    const p = run.p;
    if ((run.charge ?? 0) < 0.12) return;
    const at = this._aimPoint(run);
    run.throwT = this.dream.t ?? 0;
    const g = this._mineTarget(run, at);
    if (g) {
      run.carry.shuriken--;
      const s = this.shots.fire('mine', { a: at.from.a, b: at.from.b, y: at.from.y + 1.4 }, { a: g.at.a, b: g.at.b, y: (g.at.y ?? 0) + 1.4 }, { colour: p.style?.colour });
      s.guard = g;
      return;
    }
    const from = this._w(at.from.a, at.from.b, at.from.y + 1.4);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xcfd6dc }));
    mesh.position.set(from.x, from.y, from.z);
    this.root.add(mesh);
    // Thrown from a roof, it lands on the floor it was aimed at — unless that is a roof too.
    const y1 = this._floorAt(at.a, at.b, at.from.y);
    this.pebbles.push({ a0: at.from.a, b0: at.from.b, y0: at.from.y + 1.4, a1: at.a, b1: at.b, y1, t: 0, mesh, by: run, pa: at.from.a, pb: at.from.b, py: at.from.y + 1.4 });
    this.dream.game.sfx?.('slash', 0.35);
  }

  /** A sound at (a, b) carrying `r`: every guard inside it is told, and the ring shows how far. */
  _noise(a, b, r, colour = RING_COL, y = 0) {
    for (const g of this.view.guards) {
      if (!g.active || !g.awake) continue;
      if (Math.hypot(g.at.a - a, g.at.b - b) <= r) g.hear(a, b, this.clock);
    }
    const q = this._w(a, b, y + 0.06);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.7, toneMapped: false, depthWrite: false }));
    ring.position.set(q.x, q.y, q.z);
    ring.scale.setScalar(0.3);
    this.root.add(ring);
    this.rings.push({ mesh: ring, r, t: 0 });
  }

  /** A guard's shuriken or arrow (bambooguards.js asks the island to throw it). */
  fire(kind, from, to, by) { return this.shots.fire(kind, from, to, by); }

  /** The height of the floor at (a, b) for something coming down from `y`: a roof under it, or the ground. */
  _floorAt(a, b, y) {
    for (const H of this.course.houses ?? []) if (inHouse(H, a, b) && y >= H.h - 0.3) return H.h;
    return 0;
  }

  /**
   * CAUGHT — AND SO IS EVERYBODY. Richard: "when a player gets caught, all
   * players should respawn at the checkpoint and all game states should get
   * reset (like have all the npc's start in their default spot, facing the
   * default way)". Her hands go up and a samurai walks over; every pane in
   * the session fades; at the swap (`_partyReset`) every kitten is put at the
   * party's lantern and every guard on the first step of his rounds. Only the
   * kitten caught pays CAUGHT_COST. `force` is a capture out of a barrel (a
   * guard who saw her get in): hidden is not safe from that.
   */
  caught(i, by, { force = false } = {}) {
    const S = this.session;
    const run = S?.runs.get(i);
    if (!run || S.capture || run.capture || (run.hidden && !force) || run.drill?.state !== 'live') return;
    const p = run.p;
    if (run.hidden) {
      // Tipped out where everybody can see her: beside the barrel, hands up.
      const b = run.hidden;
      run.hidden = null;
      if (p.rig?.bamboo) p.rig = null;
      p.group.visible = true;
      const at = this._exitSpot(b, this._facingAng(p));
      this._place(p, at.a, at.b, 0, at.th);
    }
    S.capture = { i, by };
    run.caught++;
    for (const r of S.runs.values()) {
      if (r.drill?.state !== 'live') continue;
      r.capture = { t: 0, by, me: r === run };
      r.charge = null;
      r.latch = false;
      if (r.p.rig?.bamboo && !r.hidden) r.p.rig = null;
      if (!r.hidden) r.p.rig = { bamboo: true, step: () => r.p.velocity?.set(0, 0, 0) };
      for (const g of this.view.guards) g.meter.delete(r.i);
    }
    // The nearest awake samurai comes for her; an archer who shot her keeps his "!".
    const q = this.coords(p);
    let walker = by?.kind === 'samurai' && by.awake ? by : null;
    if (!walker) {
      let bd = Infinity;
      for (const g of this.view.guards) {
        if (!g.active || !g.awake || g.kind !== 'samurai' || g.arresting != null) continue;
        const d = Math.hypot(g.at.a - q.a, g.at.b - q.b);
        if (d < bd) { bd = d; walker = g; }
      }
    }
    walker?.arrest(i, { a: q.a, b: q.b });
    if (by && by !== walker && by.awake) by.arrest(i, { a: q.a, b: q.b });
    run.capture.walker = walker;
    this.dream.game.sfx?.('spotted');
    const back = S.cp ? 'the lantern' : 'the start';
    this.dream.hint(p, `CAUGHT! +${CAUGHT_COST}s, everybody back to ${back}. Crawl with [${this.dream.key(p, 'mount')}] — nobody hears a crawl`);
    for (const r of S.runs.values()) if (r !== run && r.capture) this.dream.hint(r.p, `${p.name} was CAUGHT — everybody back to ${back}!`);
  }

  /**
   * THE SWAP, under the fade: every kitten at the party's lantern (or her own
   * place at the start), every guard where the course first stands him —
   * `patrolAt(…, 0)`, his first step and his first facing — and nothing left
   * in the air. The lanterns stay lit: a checkpoint is a checkpoint.
   */
  _partyReset() {
    const S = this.session;
    if (!S) return;
    const kit = kittenRaster(this.level);
    const fits = (a, b) => { const c = kit.cell(a, b); return c >= 0 && !!kit[c]; };
    // Round the lantern, inside its ring (SAFE.lantern), each on ground she fits on.
    const ROUND = [[-0.6, -0.75], [-0.6, 0.75], [0.6, -0.75], [0.6, 0.75]];
    let k = 0;
    for (const r of S.runs.values()) {
      if (r.drill?.state !== 'live') continue;
      const p = r.p;
      if (r.hidden) { r.hidden = null; p.group.visible = true; }
      let at = { a: r.slot.a, b: r.slot.b, th: 0 };
      if (S.cp) {
        const o = ROUND[k++ % ROUND.length];
        at = fits(S.cp.a + o[0], S.cp.b + o[1]) ? { a: S.cp.a + o[0], b: S.cp.b + o[1], th: S.cp.th } : { ...S.cp };
      }
      if (p.rig?.bamboo) p.rig = null;
      this._place(p, at.a, at.b, 0, at.th);
      p.rig = { bamboo: true, step: () => p.velocity?.set(0, 0, 0) };
      r.cp = at;
      r.ok = { a: at.a, b: at.b };
      r.last = this.coords(p);
      r.carry = { shuriken: 0, smoke: 0 };
      r.sawBy.clear();
      r.ropeCd = 0;
    }
    for (const g of this.view.guards) if (g.active) g.reset(this.clock, 0);
    this.shots.clear();
    for (const pb of this.pebbles) pb.mesh.removeFromParent();
    this.pebbles = [];
    for (const s of this.smokes) { s.mesh.removeFromParent(); s.ring.removeFromParent(); }
    this.smokes = [];
    for (const r of this.rings) r.mesh.removeFromParent();
    this.rings = [];
    for (const pk of this.view.pickups) { if (!pk.on) continue; pk.gone = 0; pk.g.visible = true; }
  }

  /** How dark her pane is (the capture's fade), for `DreamDojo.drawPaneFx`. */
  fadeOf(i) {
    const c = this.session?.runs.get(i)?.capture;
    if (!c) return 0;
    if (c.t < ARREST.fade0) return 0;
    if (c.t < ARREST.swap) return (c.t - ARREST.fade0) / (ARREST.swap - ARREST.fade0);
    return Math.max(0, 1 - (c.t - ARREST.swap) / (ARREST.end - ARREST.swap));
  }

  _stepCapture(run, dt) {
    const c = run.capture;
    const p = run.p;
    const t0 = c.t;
    c.t += dt;
    if (c.me && t0 < ARREST.swap && c.t >= ARREST.swap) this._partyReset();
    if (c.t >= ARREST.end) {
      run.capture = null;
      if (p.rig?.bamboo && !run.hidden) p.rig = null;
      if (this.session) this.session.capture = null;
    }
  }

  /* ------------------------------ her frame ------------------------------- */

  /** Every state: what she looks like, and nobody past the gate before GO. */
  _always(run, d) {
    const p = run.p;
    const now = this.dream.t ?? 0;
    const q = this.coords(p);
    // The aim ring while she winds up; the smoke bomb's reach while she carries one.
    if (run.aim) {
      run.aim.visible = run.charge != null;
      if (run.aim.visible) {
        const at = this._aimPoint(run);
        const w = this._w(at.a, at.b, 0.07);
        run.aim.position.set(w.x, w.y, w.z);
        run.aim.material.color.set(this._mineTarget(run, at) ? 0xff3b3b : RING_COL);
      }
      run.smokeRing.visible = run.carry.smoke > 0 && !run.hidden;
      if (run.smokeRing.visible) {
        const w = this._w(q.a, q.b, Math.max(0, q.y) + 0.07);
        run.smokeRing.position.set(w.x, w.y, w.z);
      }
    }
    // Her drawing: hands up, the throw, the rope, the ladder, the crawl — or herself.
    const rk = p.rig?.kind;
    if (run.capture) p.clipAs = { name: 'handsup', t: run.capture.t };
    else if (now - run.throwT < 0.45) p.clipAs = { name: 'throw', t: now - run.throwT };
    else if (rk === 'rope') p.clipAs = p.rig.mountT < ROPE.mount ? { name: 'mount', t: p.rig.mountT } : { name: 'rope', t: p.rig.walkT };
    else if (rk === 'ladder') p.clipAs = { name: 'climb', t: p.rig.walkT };
    else if (run.sneak && p.onGround && d.state === 'live') p.clipAs = { name: 'sneak', t: run.crawlT };
    else p.clipAs = null;
  }

  _tickRun(run, d, dt) {
    const p = run.p;
    const D = this.D;
    const q = this.coords(p);
    const moved = Math.hypot(q.a - run.last.a, q.b - run.last.b);
    run.va = (q.a - run.last.a) / Math.max(dt, 1e-3);
    run.vb = (q.b - run.last.b) / Math.max(dt, 1e-3);
    run.last = q;
    run.crawlT += moved / Math.max(0.5, SNEAK.speed) * 1.6;
    run.ropeCd = Math.max(0, run.ropeCd - dt);
    if (run.capture) { this._stepCapture(run, dt); return; }
    // The ghost recorder: where she is, what she is doing.
    run.rec.tick(dt, () => [q.a, q.b, Math.max(0, q.y), this._facingAng(p),
      p.rig?.kind === 'rope' ? GMODE.rope : p.rig?.kind === 'ladder' ? GMODE.climb : !p.onGround ? GMODE.air : run.sneak && moved > 1e-3 ? GMODE.sneak : GMODE.stand]);
    if (run.hidden) return;
    // NOISE: walking and sprinting are heard; a crawl is not, and nor is a kitten on a rope.
    const speed = moved / Math.max(dt, 1e-3);
    run.noiseT -= dt;
    if (p.onGround && !p.rig && !run.sneak && speed > 1.2 && run.noiseT <= 0) {
      run.noiseT = NOISE_EVERY;
      const sprint = !!run.padIn?.down?.('sprint');
      this._noise(q.a, q.b, sprint ? D.noise.run : D.noise.walk, p.style?.colour ?? RING_COL, q.y);
    }
    // ...and a landing, unless she lands crawling.
    if (!p.onGround) run.peakY = Math.max(run.peakY, q.y);
    if (p.onGround && !run.wasGround && !p.rig && !run.sneak && run.peakY - q.y > 0.6) this._noise(q.a, q.b, D.noise.land, p.style?.colour ?? RING_COL, q.y);
    if (p.onGround) run.peakY = q.y;
    run.wasGround = p.onGround;
    // THE GATE IS SHUT BEHIND HER: "a defined path she can't leave".
    if (q.a < GATE.a + 0.5 && !p.rig) {
      const w = this._w(GATE.a + 0.5, q.b);
      p.position.x = w.x + SIM.dx;
      p.position.z = w.z + SIM.dz;
    }
    this._bounds(run, q);
    // A rope is taken on a PRESS now (`_ninjaPress`); a ladder by a press, or by walking into it.
    if (!p.rig) this._startLadder(run, q);
    // LANTERNS: walked past is lit — the newest lit by ANYBODY is where a capture puts the party.
    const S = this.session;
    for (const l of this.view.lanterns) {
      if (!l.on || run.lit.has(l)) continue;
      if (Math.hypot(q.a - l.a, q.b - l.b) < 1.4 && q.y < 1) {
        run.lit.add(l);
        run.cp = { a: l.a, b: l.b, th: this._facingAng(p) };
        if (S && !S.lit.has(l)) { S.lit.add(l); S.cp = { ...run.cp }; }
        l.light.material.color.set(p.style?.colour ?? HOLO.gold);
        this.dream.game.sfx?.('star');
        this.dream.hint(p, S?.runs.size > 1
          ? 'lantern lit — nobody sees you in its ring, and if anybody is caught you ALL come back here'
          : 'lantern lit — nobody sees you in its ring, and if you are caught you come back here');
      }
    }
    // PICKUPS: one of each kind carried at a time; the card says what it does.
    for (const k of this.view.pickups) {
      if (!k.on || k.gone > 0) continue;
      if (Math.hypot(q.a - k.a, q.b - k.b) > PICKUP.r || q.y > 1.5) continue;
      if (run.carry[k.kind] > 0) continue;
      run.carry[k.kind] = 1;
      k.gone = PICKUP.respawn;
      k.g.visible = false;
      this.dream.game.sfx?.('starfound');
      this.dream.game.toast?.(k.kind === 'shuriken'
        ? `${p.name} found a SHURIKEN! Hold [${this.dream.key(p, 'attack')}] and aim the ring at a guard — it turns RED — and let go: he sleeps for ${D.ko}s`
        : `${p.name} found a SMOKE BOMB! [${this.dream.key(p, 'interact')}] drops it: nobody sees into the purple ring for ${SMOKE.t}s`, p.index);
    }
    // TOUCHING A GUARD is a capture too — but not in a sanctuary.
    for (const g of this.safeAt(q) ? [] : this.view.guards) {
      if (!g.active || !g.awake) continue;
      if (Math.hypot(g.at.a - q.a, g.at.b - q.b) < TOUCH_R && Math.abs((g.at.y ?? 0) - q.y) < 1.5) { this.caught(run.i, g); return; }
    }
    // THE SCROLL.
    const C = this.course;
    if (Math.hypot(q.a - C.scroll.a, q.b - C.scroll.b) < 1.6 && q.y < 1.5) {
      d.progress();
      if (d.state === 'won') {
        offerGhost(starsId(C.id, this.session.diff), { name: p.name, style: styleIdx(p), time: d.t + run.caught * CAUGHT_COST, samples: run.rec.samples });
        this.dream.shards?.burst?.(p.position.x - SIM.dx, p.position.y + 1, p.position.z - SIM.dz, HOLO.gold, 50, 6, 8);
      }
    }
  }

  /**
   * SHE STAYS ON THE COURSE. Richard: "player can appear behind bamboo brush
   * after jumping out of barrel". The fence's canes are only drawn (a thick
   * band of them, `FENCE.thick`); THIS is what stops her — at the bamboo on
   * the ground, and over unwalkable ground in a jump, a push, a barrel, and
   * every way nobody has thought of yet. Not on a rope or a ladder (they
   * hang over the street, which is walkable anyway) and not in a barrel.
   */
  _bounds(run, q) {
    const p = run.p;
    if (p.rig || run.hidden || run.capture) return;
    /* SHE SLIDES ALONG THE EDGE. On the ground the edge is the bamboo
       (`edgeRaster`: walkable, and her radius off every fence and trail cane);
       off it — a roof, a jump — her middle over walkable ground. A step that
       does not fit keeps whichever half of it does, so pushing at the edge on
       a slant walks her along it; only a step with no part that fits puts her
       back. Where she is now does not fit either (just put down by a barrel
       or a capture on the edge of a cell), the old rule stands, or she could
       never move off it. */
    const L = this.level;
    const E = edgeRaster(L);
    const fits = (a, b) => (q.y > 0.6 ? walkAt(L, a, b) : E.at(a, b));
    if (fits(q.a, q.b) || !fits(run.ok.a, run.ok.b) && walkAt(L, q.a, q.b)) { run.ok = { a: q.a, b: q.b }; return; }
    const o = run.ok;
    const to = fits(o.a, q.b) ? { a: o.a, b: q.b } : fits(q.a, o.b) ? { a: q.a, b: o.b } : o;
    const w = this._w(to.a, to.b);
    p.position.x = w.x + SIM.dx;
    p.position.z = w.z + SIM.dz;
    if (to === o && p.velocity) { p.velocity.x = 0; p.velocity.z = 0; }
    run.ok = { a: to.a, b: to.b };
    run.last = { ...run.last, a: to.a, b: to.b };
  }

  /**
   * HANGING UNDER A ROPE: the stick, projected on the rope, moves her along
   * it; JUMP or INTERACT lets go, and so does either end — onto the roof it
   * is tied to.
   *
   * FIRST THE MOUNT, FROM WHERE SHE STANDS. Richard: "the ninja mount
   * animation is playing above the rope rather than below it ... Maybe,
   * before attaching the player to the rope, we first play the mount
   * animation and then can attach player and play the rope animation". The
   * mount is drawn standing (feet-aligned) and the hang hanging (paw-
   * aligned), so playing the mount AT the rope stood her on it. Now she is
   * stood under the rope, on her own floor, for `ROPE.mount` while her paws
   * go up to it — ROPE_RISE is measured so they arrive at it — and only then
   * hangs from it.
   */
  _ropeRig(run, R, u) {
    const B = this;
    const p = run.p;
    const len = Math.hypot(R.a1 - R.a0, R.b1 - R.b0);
    const dirL = isleDir(this.isle, Math.atan2(R.b1 - R.b0, R.a1 - R.a0));
    const foot = { a: lerp(R.a0, R.a1, u), b: lerp(R.b0, R.b1, u), y: this.coords(p).y };
    this.dream.game.sfx?.('land', 0.5);
    const drop = (vy) => { p.rig = null; run.ropeCd = ROPE.cd; p.velocity.set(0, vy, 0); };
    p.rig = {
      bamboo: true, kind: 'rope', R, u, t0: this.dream.t ?? 0, walkT: 0, mountT: 0,
      /* LETTING GO MID-ROPE: her feet where the hang drew them, so she does not
         pop up to the rope and fall the whole way. During the mount she is
         still standing, and simply stops. */
      letGo() {
        if (this.mountT < ROPE.mount) { drop(0); return; }
        const y = lerp(R.y0, R.y1, this.u) - ROPE.ink;
        const w = B._w(lerp(R.a0, R.a1, this.u), lerp(R.b0, R.b1, this.u), Math.max(0, y));
        p.position.set(w.x + SIM.dx, w.y, w.z + SIM.dz);
        drop(0);
      },
      step(dt, pad) {
        p.velocity.set(0, 0, 0);
        p.onGround = false;
        if (pad.pressed?.('jump')) { this.letGo(); return; }
        if (this.mountT < ROPE.mount) {
          this.mountT += dt;
          const w = B._w(foot.a, foot.b, foot.y);
          p.position.set(w.x + SIM.dx, w.y, w.z + SIM.dz);
          return;
        }
        const { fwd, right } = p._moveBasis(pad);
        const wx = right.x * pad.mx - fwd.x * pad.my;
        const wz = right.z * pad.mx - fwd.z * pad.my;
        const along = wx * dirL.x + wz * dirL.z;
        if (Math.abs(along) > 0.2) {
          this.u += (along * ROPE.speed * dt) / len;
          this.walkT += dt;
          p.facing = Math.atan2(dirL.x * Math.sign(along), dirL.z * Math.sign(along));
        }
        if (this.u <= 0 || this.u >= 1) {
          // Off the end, onto the roof it is tied to.
          const k = this.u <= 0 ? 0 : 1;
          const a = k ? R.a1 : R.a0; const b = k ? R.b1 : R.b0;
          /* ON TOP OF the roof it is tied to. It asked `_floorAt(R.y - HANG.hi)`,
             which is "a roof under her, if she is already up at it" — 7.4 - 3.8
             is under a 4.4 roof's threshold, so it answered the GROUND, and she
             was put down inside the house: "falling through the building below
             the roof line". The roof under the end is known; it is that one. */
          const w = B._w(a, b, (k ? R.h1 : R.h0) + 0.05);
          p.position.set(w.x + SIM.dx, w.y, w.z + SIM.dz);
          drop(0);
          return;
        }
        const w = B._w(lerp(R.a0, R.a1, this.u), lerp(R.b0, R.b1, this.u), lerp(R.y0, R.y1, this.u));
        p.position.set(w.x + SIM.dx, w.y, w.z + SIM.dz);
      },
    };
  }

  /** At a ladder's foot pushing into the wall: up. On the roof at its top pushing out: down. */
  _startLadder(run, q) {
    const p = run.p;
    const pad = run.padIn;
    if (!pad || !p.onGround) return;
    const push = Math.hypot(pad.mx ?? 0, pad.my ?? 0);
    if (push < 0.5) return;
    const { fwd, right } = p._moveBasis(pad);
    const wish = this._isleAng(right.x * pad.mx - fwd.x * pad.my, right.z * pad.mx - fwd.z * pad.my);
    for (const Ld of this.view.ladders) {
      const f = Ld.foot;
      const top = { a: f.a + Ld.into.a * LADDER.onto, b: f.b + Ld.into.b * LADDER.onto };
      if (q.y < 0.6 && Math.hypot(q.a - f.a, q.b - f.b) < LADDER.reach && Math.abs(wrap(wish - f.face)) < LADDER.push) {
        this._ladderRig(run, Ld, 0, 1);
        return;
      }
      if (Math.abs(q.y - Ld.top) < 0.4 && Math.hypot(q.a - top.a, q.b - top.b) < LADDER.onto && Math.abs(wrap(wish - f.face - Math.PI)) < LADDER.push) {
        this._ladderRig(run, Ld, Ld.top, -1);
        return;
      }
    }
  }

  /** ON THE LADDER: up or down it at LADDER.speed, facing the wall; JUMP lets go. */
  _ladderRig(run, Ld, y0, dir) {
    const B = this;
    const p = run.p;
    const f = Ld.foot;
    const at = { a: f.a + Ld.into.a * 0.05, b: f.b + Ld.into.b * 0.05 };
    p.facing = isleFacing(this.isle, f.face);
    p.rig = {
      bamboo: true, kind: 'ladder', y: y0, walkT: 0,
      letGo() { p.rig = null; },
      step(dt, pad) {
        p.velocity.set(0, 0, 0);
        p.onGround = false;
        p.facing = isleFacing(B.isle, f.face);
        if (pad.pressed?.('jump')) { this.letGo(); return; }
        this.y += dir * LADDER.speed * dt;
        this.walkT += dt;
        if (dir > 0 && this.y >= Ld.top) {
          const w = B._w(f.a + Ld.into.a * LADDER.onto, f.b + Ld.into.b * LADDER.onto, Ld.top);
          p.position.set(w.x + SIM.dx, w.y + 0.05, w.z + SIM.dz);
          p.rig = null;
          return;
        }
        if (dir < 0 && this.y <= 0) {
          const w = B._w(f.a - Ld.into.a * 0.3, f.b - Ld.into.b * 0.3, 0);
          p.position.set(w.x + SIM.dx, w.y + 0.05, w.z + SIM.dz);
          p.facing = isleFacing(B.isle, f.face + Math.PI);
          p.rig = null;
          return;
        }
        const w = B._w(at.a, at.b, this.y);
        p.position.set(w.x + SIM.dx, w.y, w.z + SIM.dz);
      },
    };
  }

  /** Her camera: over the plaza's shoulder, the course running up the screen. */
  _camera(run) {
    const f = (run.focus ??= { centre: new THREE.Vector3(), aim: true, dist: BAMBOO_CAM.dist, pitch: BAMBOO_CAM.pitch, yaw: 0 });
    const p = run.p;
    f.centre.set(p.position.x, p.position.y + BAMBOO_CAM.lift, p.position.z);
    f.yaw = this._yaw();
    return f;
  }

  _yaw() {
    const F = this.isle.fwd;
    return Math.atan2(-F.x, -F.z);
  }

  _paint(run, d, C, n) {
    const p = run.p;
    if (d.state === 'ready') {
      return [
        { text: `${C.kanji} ${C.name} · ${DIFFS[n].name}`, size: 1.5, color: d.colour, glow: true, jp: true },
        { text: `[${this.dream.key(p, 'mount')}] crawl — tap twice to keep crawling`, size: 1.0 },
        { text: d.readyT > 2 ? '3' : d.readyT > 1 ? '2' : '1', size: 2.4, color: HOLO.gold, glow: true },
      ];
    }
    if (d.state !== 'live') return null;
    const D = this.D;
    const state = run.capture ? ['CAUGHT!', 0xff6a6a]
      : run.hidden ? ['HIDDEN in the barrel', 0x9fefff]
        : p.rig?.kind === 'rope' ? ['on the rope — JUMP lets go', 0x9fefff]
          : p.rig?.kind === 'ladder' ? ['climbing', 0x9fefff]
            : run.charge != null ? [this._mineTarget(run, this._aimPoint(run)) ? 'let go: SHURIKEN!' : 'let go: pebble', HOLO.gold]
              : run.sneak ? [run.latch ? 'CRAWLING (latched) — silent' : 'CRAWLING — silent', 0x6dffb0]
                : this.safeAt(this.coords(p)) ? ['SAFE in the ring — nobody sees you here', HOLO.gold]
                  : [`WALKING — heard ${D.noise.walk}m away`, 0xffb347];
    const carry = [run.carry.shuriken ? '手裏剣' : '', run.carry.smoke ? '煙' : ''].filter(Boolean).join(' ');
    return [
      { text: state[0], size: 1.45, color: state[1], glow: !!run.capture },
      { text: `${d.t.toFixed(1)}s${run.caught ? `  + ${run.caught * CAUGHT_COST}s` : ''}   lanterns ${run.lit.size}${carry ? `   ${carry}` : ''}`, size: 1.25, color: HOLO.cyan, jp: !!carry },
      { text: this._promptLine(run), size: 0.8, color: 0x7f9fa8 },
    ];
  }

  /** What her two ninja buttons would do right now, in words — the card's last line. */
  _promptLine(run) {
    const p = run.p;
    const I = this.dream.key(p, 'interact');
    const J = this.dream.key(p, 'jump');
    if (run.capture) return '';
    if (run.hidden) return `[${I}] or [${J}] climb out`;
    if (p.rig) return `[${J}] let go`;
    const R = this._reach(run);
    if (R.rope) return `[${I}] or [${J}] grab the rope`;
    if (R.ladder) return `[${I}] or [${J}] ${R.ladder.dir > 0 ? 'climb the ladder' : 'climb down'}`;
    if (R.barrel) return `[${I}] or [${J}] hide in the barrel`;
    if (R.near) return 'get closer…';
    return `[${I}] ${run.carry.smoke ? 'smoke bomb' : 'leave the course?'}`;
  }

  /* -------------------------------- a frame ------------------------------- */

  update(dt) {
    this._dt = dt;
    const D = this.dream;
    const inside = idleIn(D);
    for (const k of this.kiosks) k.update(dt, inside);
    if (this.picking != null && D.choices?.[this.picking] !== this._pickChoice) { this.picking = null; this._pickChoice = null; }
    this._stepSwipe(dt);
    this._loadArt();
    const S = this.session;
    if (S) {
      // A run whose drill has gone is over.
      for (const run of [...S.runs.values()]) if (D.drills[run.i] !== run.drill) this._finish(run);
    }
    if (this.session?.live) this.session.t += dt;
    this._strays(dt);
    this._stepWorld(dt);
    // The barrier: red while a session is in, cyan while the course is shut.
    const col = this.session ? BARRIER.live : BARRIER.idle;
    this.barrier.material.color.set(col);
    this.barrier.material.opacity = 0.22 + 0.1 * Math.sin((D.t ?? 0) * 4);
    for (const b of this.barrierBands) b.material.color.set(col);
    this.view.scroll.rotation.x += dt;
    this._boardT = (this._boardT ?? 0) - dt;
    if (this._boardT <= 0) { this._boardT = this.session ? 0.25 : 1; this._paintBoard(); }
  }

  /** The ninja atlases, fetched the first time anybody comes near the island. */
  _loadArt() {
    if (this._artAsked) return;
    const near = this.dream.simKittens().some((p) => {
      const x = p.position.x - SIM.dx - this.isle.x; const z = p.position.z - SIM.dz - this.isle.z;
      return Math.hypot(x, z) < this.isle.r + 40;
    });
    if (!near) return;
    this._artAsked = true;
    loadNinjaArt().then((art) => {
      this.art = art;
      for (const g of this.view.guards) g.setArt(art);
      for (const run of this.session?.runs.values() ?? []) run.p.setClipArt?.(art.kittens[styleIdx(run.p)], ClipSprite);
    }).catch(() => {});
  }

  /**
   * NOBODY IN THE COURSE BUT ITS RUNNERS. At the gate, a kitten who is not in
   * the session is pushed back off the barrier; one who got in any other way
   * is walked out after STRAY_T, in words. Shut, it says how to open it.
   */
  _strays(dt) {
    this._stray ??= new Map();
    for (const p of this.dream.simKittens()) {
      if (this.inSession(p)) { this._stray.delete(p.index); continue; }
      const q = this.coords(p);
      if (Math.abs(q.b) < BARRIER.w / 2 + 0.5 && q.a > GATE.a - 0.6 && q.a < GATE.a + 1.2 && q.y < 3) {
        const w = this._w(GATE.a - 0.6, q.b);
        p.position.x = w.x + SIM.dx;
        p.position.z = w.z + SIM.dz;
        this.dream.hint(p, this.session ? `${this._names()} are on the course — next time, you go in with them` : 'the course opens from the 忍 kiosk — CHOOSE A COURSE there');
        continue;
      }
      if (!this.inCourse(p) || this.dream.drills[p.index]?.running) { this._stray.delete(p.index); continue; }
      const t = (this._stray.get(p.index) ?? 0) + dt;
      if (t < STRAY_T) { this._stray.set(p.index, t); continue; }
      this._stray.delete(p.index);
      this._toPlaza(p);
      this.dream.game.toast?.(`${p.name}: the course starts at 忍 INFILTRATION — choose one there`, p.index);
    }
  }

  /** Guards, shots, pebbles, smoke, rings, pickups and the ghost. */
  _stepWorld(dt) {
    const S = this.session;
    const D = this.D;
    const T = this.clock;
    const live = !!S?.live;
    const kittens = [];
    for (const run of S?.runs.values() ?? []) {
      if (run.drill?.state !== 'live') continue;
      const p = run.p;
      const q = this.coords(p);
      const crawl = run.sneak && p.onGround && !p.rig;
      const eye = p.rig?.kind === 'rope' ? q.y - 1.0 : q.y + (crawl ? EYE.crawl : EYE.stand);
      const hidden = !!run.hidden || !!run.capture || this.safeAt(q);
      kittens.push({ i: run.i, a: q.a, b: q.b, y: eye, feet: p.rig?.kind === 'rope' ? q.y - 2.4 : q.y, hidden, va: run.va ?? 0, vb: run.vb ?? 0,
        sprint: !!run.sprinting && p.onGround && !p.rig, run });
    }
    for (const s of this.smokes) {
      s.t -= dt;
      const k = Math.max(0, Math.min(1, s.t / 1.2));
      s.mesh.material.opacity = 0.55 * k;
      s.ring.material.opacity = 0.7 * k;
    }
    for (const s of this.smokes.filter((x) => x.t <= 0)) { s.mesh.removeFromParent(); s.ring.removeFromParent(); }
    this.smokes = this.smokes.filter((x) => x.t > 0);
    const ctx = { T, D, live, kittens, smokes: this.smokes };
    this._paintFlip = !this._paintFlip;
    for (const g of this.view.guards) {
      if (!g.active) continue;
      g.update(dt, ctx);
      if (this._paintFlip) g.paintCone(D, this.smokes, live);
    }
    // Who had whom in his eye, and when — what `_hide` asks ("did anybody SEE her get in?").
    for (const k of kittens) for (const g of k.seenBy ?? []) k.run.sawBy.set(g, T);
    this.shots.update(dt, ctx, (k, s) => this.caught(k.i, s.by), (s) => {
      // An arrow at a barrel lands IN it — unless something on the way stopped it first.
      if (s.barrel) { if (!s.blocked) this.arrowInBarrel(s); return; }
      if (s.kind !== 'mine') return;
      // A shuriken that hit a wall on the way put nobody to sleep, however near him it stopped.
      const g = s.guard;
      if (!s.blocked && g?.awake && Math.hypot(g.at.a - s.a, g.at.b - s.b) < THROW.mineR) {
        g.knockOut(T);
        this.dream.game.sfx?.('bonk');
      }
    });
    /* PEBBLES: a lob, and a clatter where they land — or where they hit. A
       lob goes over a crate if it is high enough there, and into a wall or a
       house if it is not: "Can't throw rocks or shurikens through walls". */
    for (const pb of this.pebbles) {
      pb.t += dt;
      const u = Math.min(1, pb.t / THROW.flight);
      const na = lerp(pb.a0, pb.a1, u); const nb = lerp(pb.b0, pb.b1, u);
      const ny = lerp(pb.y0, (pb.y1 ?? 0) + 0.15, u) + THROW.arc * 4 * u * (1 - u);
      if (!pb.done && blocked(this.level, { a: pb.pa, b: pb.pb, y: pb.py }, { a: na, b: nb, y: ny }, 'samurai')) {
        pb.done = true;
        this._noise(pb.pa, pb.pb, D.pebble, 0xdfe8ff, this._floorAt(pb.pa, pb.pb, pb.py));
        this.dream.game.sfx?.('knock', 0.6);
        continue;
      }
      pb.pa = na; pb.pb = nb; pb.py = ny;
      const w = this._w(na, nb, ny);
      pb.mesh.position.set(w.x, w.y, w.z);
      if (u >= 1 && !pb.done) {
        pb.done = true;
        this._noise(pb.a1, pb.b1, D.pebble, 0xdfe8ff, pb.y1 ?? 0);
        this.dream.game.sfx?.('knock', 0.6);
      }
    }
    for (const pb of this.pebbles.filter((x) => x.done)) pb.mesh.removeFromParent();
    this.pebbles = this.pebbles.filter((x) => !x.done);
    for (const r of this.rings) {
      r.t += dt;
      const k = Math.min(1, r.t / 0.5);
      r.mesh.scale.setScalar(Math.max(0.3, r.r * k));
      r.mesh.material.opacity = 0.7 * (1 - Math.max(0, (r.t - 0.35) / 0.4));
    }
    for (const r of this.rings.filter((x) => x.t > 0.75)) r.mesh.removeFromParent();
    this.rings = this.rings.filter((x) => x.t <= 0.75);
    for (const k of this.view.pickups) {
      if (!k.on) continue;
      if (k.gone > 0) { k.gone -= dt; if (k.gone <= 0) k.g.visible = true; }
      k.g.rotation.y += dt * 1.6;
    }
    if (this.ghost) this.ghost.update(S?.live ? S.t : 0);
    this._stepParty(dt);
  }

  /* ------------------------------ the party camera -------------------------- */

  /** The kittens of the session in seat order, the first of them "player 1". */
  _partyRuns() {
    return [...(this.session?.runs.values() ?? [])].sort((x, y) => x.i - y.i);
  }

  /**
   * ONE CAMERA FOR THE PARTY. Richard: "use a shared camera for multiple
   * players on one screen for this mini game ... have the camera keep all
   * players in view, and if they get too far apart, have the camera follow
   * player 1 to force players to be close to each other." Past PARTY_CAM.split
   * from player 1 the camera is hers alone, and whoever is out of it is told
   * so; back within `rejoin`, it takes them all in again.
   */
  _stepParty(dt) {
    const runs = this._partyRuns();
    const P = (this._party ??= { split: false, hintT: 0, centre: new THREE.Vector3(), spread: 0 });
    if (!runs.length) { P.split = false; return; }
    const lead = runs[0].p.position;
    let far = 0;
    for (const r of runs) far = Math.max(far, Math.hypot(r.p.position.x - lead.x, r.p.position.z - lead.z));
    if (!P.split && far > PARTY_CAM.split) P.split = true;
    else if (P.split && far < PARTY_CAM.rejoin) P.split = false;
    P.hintT -= dt;
    if (P.split && P.hintT <= 0) {
      P.hintT = 4;
      for (const r of runs.slice(1)) {
        const d = Math.hypot(r.p.position.x - lead.x, r.p.position.z - lead.z);
        if (d > PARTY_CAM.rejoin) this.dream.hint(r.p, `too far from ${runs[0].p.name} — the camera follows ${runs[0].p.name}. Catch up!`);
      }
    }
    // The middle of who is framed: player 1 alone while split, all of them otherwise.
    const framed = P.split ? runs.slice(0, 1) : runs;
    P.centre.set(0, 0, 0);
    for (const r of framed) P.centre.add(r.p.position);
    P.centre.multiplyScalar(1 / framed.length);
    P.spread = 0;
    for (const r of framed) P.spread = Math.max(P.spread, Math.hypot(r.p.position.x - P.centre.x, r.p.position.z - P.centre.z));
    P.centre.y += BAMBOO_CAM.lift;
  }

  /** For the split screen: every kitten in the session stands at the party's middle, so they share one pane. */
  paneAnchor(p) {
    if (!this.inSession(p) || !this._party) return null;
    return this._party.centre;
  }

  /**
   * The shared rig's shot for a group in the session, or null: her own
   * shot's angle (BAMBOO_CAM), back far enough that everybody framed fits —
   * the spread over the half-angle of the lens, with a margin, never nearer
   * than her own shot and never further than PARTY_CAM.maxDist.
   */
  groupShot(members) {
    const players = this.dream.game.players ?? [];
    if (!this.session || !this._party || !members?.length || !members.every((i) => this.inSession(players[i]))) return null;
    const g = (this._groupShot ??= { centre: new THREE.Vector3(), dist: BAMBOO_CAM.dist, pitch: BAMBOO_CAM.pitch, yaw: 0 });
    g.centre.copy(this._party.centre);
    g.yaw = this._yaw();
    g.pitch = BAMBOO_CAM.pitch;
    g.dist = partyDist(this._party.spread);
    return g;
  }

  /* -------------------------------- the board ------------------------------ */

  boardMode() {
    if (this.session) return 'now';
    if (this.last && (this.dream.t ?? 0) - this.lastAt < BAMBOO_BOARD.lastHold) return 'last';
    return 'board';
  }

  _paintBoard() {
    if (!this.board) return;
    let lines;
    let edge = 0x6dffb0;
    if (this.boardMode() === 'board') {
      lines = bambooBoardLines(this.dream.progress, this.boardFilter);
      edge = HOLO.gold;
    } else {
      const S = this.session;
      const src = S ?? this.last;
      const C = courseById(src.course);
      lines = [
        { text: `忍 ${C.kanji} ${C.name}`, size: 1.6, color: 0x6dffb0, glow: true, jp: true },
        { text: `${S ? 'NOW' : 'LAST TIME'} · ${DIFFS[src.diff].name}${S && this.ghost ? ` · ghost: ${this.ghostName}` : ''}`, size: 1.0, color: HOLO.gold },
      ];
      const rows = [...src.results];
      for (const run of S?.runs.values() ?? []) {
        const d = run.drill;
        rows.push({ name: run.p.name, colour: run.p.style?.colour, live: true, t: d?.t ?? 0, caught: run.caught, lit: run.lit.size, state: d?.state });
      }
      rows.forEach((r) => {
        const what = r.live ? (r.state === 'ready' ? 'ready…' : `${r.t.toFixed(1)}s · caught ${r.caught} · lanterns ${r.lit}`)
          : r.time != null ? `${r.time.toFixed(1)} ${stars3(r.stars)}` : `left · caught ${r.caught}`;
        lines.push({ text: `${r.name}  ${what}`, size: 1.0, color: r.colour ?? HOLO.cyan });
      });
    }
    const sig = lines.map((l) => l.text).join('|');
    if (sig === this._boardSig) return;
    this._boardSig = sig;
    this.board.set(lines, edge);
  }

  /* --------------------------- cameras and music ---------------------------- */

  /** The bird's eye while she chooses — the main.js camera chain asks this. */
  cameraFocus(p) {
    if (this.picking !== p?.index || this.session) return null;
    const f = (this._bird ??= { centre: new THREE.Vector3(), aim: true, dist: BAMBOO_BIRD.dist, pitch: BAMBOO_BIRD.pitch, yaw: 0 });
    const c = this._w((REGION.a0 + REGION.a1) / 2, 0, BAMBOO_BIRD.lift);
    f.centre.set(c.x + SIM.dx, c.y, c.z + SIM.dz);
    f.yaw = this._yaw() + BAMBOO_BIRD.sway * Math.sin((this.dream.t ?? 0) * BAMBOO_BIRD.rate);
    return f;
  }

  /**
   * THE COURSE'S SONG while a session is on — one per kind of place
   * (`course.music`: forest, village, castle, shadow), a recording each
   * (tools/capture/bamboo-music.mjs). Null if it is not there, and the
   * simulator's own music plays: every file degrades.
   */
  musicTrack() {
    if (!this.session) return null;
    const C = courseById(this.session.course);
    const id = `bamboo${C.music[0].toUpperCase()}${C.music.slice(1)}`;
    return MUSIC_FILES[id] ? id : null;
  }

  faceCamera(camera) {
    for (const k of this.kiosks) k.faceCamera(camera);
    this.board.faceCamera(camera);
    for (const v of [this.view, this.swipe?.out].filter(Boolean)) for (const g of v.guards) if (g.active) g.faceCamera(camera);
    this.ghost?.faceCamera(camera);
  }
}
