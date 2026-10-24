import * as THREE from 'three';
import { HOLO } from '../../world/simworld.js';
import { makeLabelTexture } from '../../core/label.js';
import { ClipSprite } from './ninjasprite.js';
import { patrolAt, canSee, reach, walkPath, blocked, wrap, EYE } from './bamboolevel.js';

/* ---------------------------------------------------------------------------
   忍 THE GUARDS — samurai on the ground, archers on the towers — and what
   they throw. Richard: "We can replace cones with actual opponents the player
   must avoid." So the first version's sweeping cones are now somebody: a
   figure off his own packed atlas (ninjasprite.js — idle, walk, sprint,
   alert, attack, ko, four sides of each), walking the patrol bamboolevel.js
   says he walks, with the cone he sees by drawn on the floor in front of him.

   WHAT HE SEES IS `canSee` AND NOTHING ELSE. The cone on the floor is drawn
   from `reach`, which asks `blocked`, which `canSee` asks; world-check's
   solver asks the same. So the picture, the rule and the proof that a course
   can be crossed cannot disagree.

   A SAMURAI IS A METER, NOT A COIN. In his cone she fills it (in `seeT`
   seconds, twice as fast close up); out of it, it drains. Anything in it and
   he stops, says "?" and turns to look; on NORMAL and HARD, half full, he
   throws a shuriken at where she is — which she can step out of the way of.
   Full, and she is caught.

   AN ARCHER IS A SHOOTER. "! on spotting, then shoots with scatter; one hit =
   out". He sees through bamboo (the canes are no cover from a tower) and his
   arc is wider; what saves her from him is walls, crates, smoke, and not
   standing still — an arrow flies at where she WAS plus a scatter.

   A NOISE IS AN ERRAND. A samurai who hears a pebble, a sprint or a landing
   says "?", walks to it round the walls (`walkPath`), looks about, and walks
   back to where he left his patrol — which then carries on from where he left
   it, not from where the clock says he should have been, so he never teleports.

   NOTHING HERE HURTS ANYBODY (non-negotiable 3). A hit is a CAPTURE, handed
   to the island (`B.caught`), which walks her back to her lantern. Nothing
   here calls `hurt`, and world-check holds it to that.
--------------------------------------------------------------------------- */

export const GUARD = {
  /** World height of each, standing — the atlas is sized off it. */
  height: { samurai: 3.1, archer: 3.2 },
  /** Turning toward something he is suspicious of, radians a second. */
  turn: 4,
  /** How fast the meter drains out of his sight, per second. */
  decay: 0.7,
  /** Closer than this fraction of his range, the meter fills twice as fast. */
  near: 0.5,
  /** Seconds he stands and says "?" at a noise before he walks to it. */
  heard: 0.9,
  /** Seconds he looks round where the noise was. */
  search: 2.6,
  /** His pace walking to a noise, against his patrol pace. */
  investigateK: 1.2,
  /** Close enough to her to make the arrest. */
  arrestR: 1.5,
  /** Half full: a samurai on NORMAL and HARD throws, then not again for `throwCd`. */
  throwAt: 0.5,
  throwCd: 2.4,
  /** An archer who loses her keeps his "!" this long. */
  lose: 1.6,
  /** An archer's look at a noise, seconds. */
  glance: 3,
};

export const SHOT = { star: 15, arrow: 24, mine: 18, hitR: 0.7, life: 1.6 };
/** Rays in a drawn cone — and it is redrawn every other frame. */
export const CONE_RAYS = 20;
const CONE_COL = { samurai: 0xffb347, archer: 0xc77dff };
const SEEN_COL = 0xff3b3b;

const markTex = new Map();
function mark(text, color) {
  const key = `${text}|${color}`;
  if (!markTex.has(key)) markTex.set(key, makeLabelTexture(text, { size: 96, color, stroke: '#14080c', strokeWidth: 10 }));
  return markTex.get(key);
}

/** An (a, b) bearing on the island as a layer direction, and a Billboard's facing. */
export function isleDir(isle, th) {
  const f = isle.fwd;
  const ca = Math.cos(th); const sb = Math.sin(th);
  return { x: f.x * ca - f.z * sb, z: f.z * ca + f.x * sb };
}
export function isleFacing(isle, th) {
  const d = isleDir(isle, th);
  return Math.atan2(d.x, d.z);
}

export class Guard {
  /**
   * @param {object} B      the island (dream/bamboo.js): isle, level, art, `_w`, `caught`, `fire`
   * @param {object} g      the guard's row in the course
   * @param {THREE.Object3D} into  the course's view group (it swipes with the course)
   */
  constructor(B, g, into) {
    this.B = B;
    this.g = g;
    this.kind = g.kind;
    this.into = into;
    this.group = new THREE.Group();
    into.add(this.group);
    this.height = GUARD.height[this.kind] ?? 3;
    this.fig = null;
    this.setArt(B.art);
    // The cone: a fan on the floor, rebuilt from `reach`.
    const fan = new THREE.BufferGeometry();
    fan.setAttribute('position', new THREE.BufferAttribute(new Float32Array((CONE_RAYS + 2) * 3), 3));
    const idx = [];
    for (let j = 0; j < CONE_RAYS; j++) idx.push(0, j + 1, j + 2);
    fan.setIndex(idx);
    this.cone = new THREE.Mesh(fan, new THREE.MeshBasicMaterial({
      color: CONE_COL[this.kind], transparent: true, opacity: 0.2, toneMapped: false, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.cone.frustumCulled = false;
    this.cone.renderOrder = 2;
    into.add(this.cone);
    this.mark = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, toneMapped: false }));
    this.mark.renderOrder = 20;
    this.mark.visible = false;
    this.group.add(this.mark);
    this.reset(0);
  }

  /** His figure, off the packed atlas — or a holo stand-in until (unless) it loads. */
  setArt(art) {
    const A = art?.[this.kind];
    if (this.fig && this.fig.userData.tex === (A?.texture ?? null)) return;
    if (this.fig) this.group.remove(this.fig);
    if (A) {
      this.fig = new ClipSprite(A.texture, A.man, this.height);
      this.fig.userData.tex = A.texture;
    } else {
      // EVERY FILE DEGRADES: a tinted holo figure, so the course still plays.
      const m = new THREE.MeshBasicMaterial({ color: this.kind === 'archer' ? 0xc77dff : 0xff7a5a, transparent: true, opacity: 0.85, toneMapped: false });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, this.height * 0.7, 10).translate(0, this.height * 0.35, 0), m);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), m);
      head.position.y = this.height * 0.82;
      this.fig = new THREE.Group();
      this.fig.add(body, head);
      this.fig.userData.tex = null;
      this.fig.setClip = () => true;
      this.fig.faceCamera = () => {};
    }
    this.group.add(this.fig);
  }

  /** Back on his patrol at time T, everything forgotten — a new run, or a new course. */
  reset(T) {
    this.mode = 'patrol';
    this.off = 0;
    this.meter = new Map();
    this.path = null;
    this.koT = 0;
    this.cd = 0;
    this.lostT = 0;
    this.alert = false;
    this.anim = { clip: 'idle', t: 0 };
    this.target = null;
    this.home = null;
    this.arresting = null;
    this.at = { ...patrolAt(this.g, this.B.D, T), y: this.g.y ?? 0, y0: 0 };
    this._place();
  }

  get awake() { return this.mode !== 'ko'; }

  /** The meter he holds on kitten `i`, 0..1. */
  meterOf(i) { return this.meter.get(i) ?? 0; }

  _clip(name) {
    if (this.anim.clip !== name) this.anim = { clip: name, t: 0 };
  }

  /** Walk somewhere round the walls: `then` is what he does on arriving. */
  _walk(to, speed, then) {
    const p = walkPath(this.B.level, this.at, to);
    if (!p) return false;
    this.path = p;
    this.pathI = 0;
    this.speed = speed;
    this.then = then;
    this.mode = 'go';
    return true;
  }

  /** Leaving his patrol: remember where, and at which point of it. */
  _leave(T) {
    if (this.mode === 'patrol' || this.mode === 'hold') this.home = { a: this.at.a, b: this.at.b, T: T + this.off };
  }

  /** Back to where he left it; the patrol then carries on from there. */
  _goHome() {
    if (!this.home) { this.mode = 'patrol'; return; }
    if (!this._walk(this.home, this.B.D.walk, 'home')) this.mode = 'patrol';
  }

  /** HEARD SOMETHING at (a, b). */
  hear(a, b, T) {
    if (!this.awake || this.mode === 'arrest' || this.arresting) return false;
    if (this.kind === 'archer') {
      if (this.alert) return false;
      this.mode = 'hold';
      this.target = { a, b, until: GUARD.glance };
      this._mark('?', '#ffd36a');
      return true;
    }
    this._leave(T);
    this.mode = 'heard';
    this.heardT = GUARD.heard;
    this.target = { a, b };
    this._mark('?', '#ffd36a');
    this.B.dream.game.sfx?.('deny', 0.35);
    return true;
  }

  /** A shuriken of hers landed: down for `ko` seconds, and he forgets everything. */
  knockOut(T) {
    if (!this.awake) return;
    this._leave(T);
    this.mode = 'ko';
    this.koT = this.B.D.ko;
    this.meter.clear();
    this.alert = false;
    this.path = null;
    this.arresting = null;
    this._clip('ko');
    this._mark('Zz', '#9fefff');
  }

  /** He has her: sprint over to where she stands. */
  arrest(i, to) {
    this._leave(this.B.clock);
    this.arresting = i;
    this.meter.clear();
    if (this.kind === 'archer' || !this._walk(to, this.B.D.run, 'arrest')) this.mode = 'hold';
    this._mark('!', '#ff5a5a');
  }

  /** The arrest is over (she is back at her lantern): back to his rounds. */
  release() {
    this.arresting = null;
    this.alert = false;
    this.mark.visible = false;
    if (this.mode !== 'ko') this._goHome();
  }

  _mark(text, color) {
    this.mark.material.map = mark(text, color).texture;
    this.mark.material.needsUpdate = true;
    const asp = mark(text, color).aspect;
    this.mark.scale.set(1.1 * asp, 1.1, 1);
    this.mark.position.y = this.height + 0.9;
    this.mark.visible = true;
    this.markT = 0;
  }

  /**
   * One frame. `ctx`: { T (the session clock), D, live (a run is on), kittens:
   * [{ i, a, b, y (her eyes), hidden }], smokes }.
   */
  update(dt, ctx) {
    const { T, D } = ctx;
    this.anim.t += dt;
    this.cd = Math.max(0, this.cd - dt);
    this.markT = (this.markT ?? 0) + dt;
    switch (this.mode) {
      case 'ko':
        this.koT -= dt;
        if (this.koT <= 0) { this.mark.visible = false; this._clip('idle'); this._goHome(); }
        break;
      case 'patrol': {
        const P = patrolAt(this.g, D, T + this.off);
        this.at.a = P.a; this.at.b = P.b; this.at.look = P.look;
        this._clip(P.moving ? 'walk' : 'idle');
        break;
      }
      case 'heard':
        // Stopped, looking at the noise, before he goes.
        this.off -= dt;
        this._turn(Math.atan2(this.target.b - this.at.b, this.target.a - this.at.a), dt);
        this._clip('alert');
        this.heardT -= dt;
        if (this.heardT <= 0 && !this._walk(this.target, D.walk * GUARD.investigateK, 'search')) this._goHome();
        break;
      case 'go': {
        this._step(dt);
        break;
      }
      case 'search':
        this.searchT -= dt;
        this.at.look = this.searchLook + 1.1 * Math.sin((GUARD.search - this.searchT) * 2.2);
        this._clip('idle');
        if (this.searchT <= 0) { this.mark.visible = false; this._goHome(); }
        break;
      case 'hold':
        // Suspicious, or an archer looking at a noise: stopped, turning to it.
        this.off -= dt;
        if (this.target) this._turn(Math.atan2(this.target.b - this.at.b, this.target.a - this.at.a), dt);
        if (this.target?.until != null) {
          this.target.until -= dt;
          if (this.target.until <= 0) { this.target = null; this.mode = 'patrol'; this.mark.visible = false; }
        }
        if (this.anim.clip === 'attack' && this.anim.t > 0.7) this._clip('idle');
        else if (this.anim.clip !== 'attack') this._clip(this.alert ? 'alert' : 'idle');
        break;
      default:
        break;
    }
    if (ctx.live && this.awake && this.arresting == null) this._look(dt, ctx);
    this._place();
  }

  /** Turn toward a bearing at GUARD.turn. */
  _turn(th, dt) {
    const d = wrap(th - (this.at.look ?? 0));
    const s = Math.min(Math.abs(d), GUARD.turn * dt);
    this.at.look = (this.at.look ?? 0) + Math.sign(d) * s;
  }

  /** Along his path; on the last point, whatever he walked there for. */
  _step(dt) {
    const p = this.path?.[this.pathI];
    if (!p) { this._arrive(); return; }
    const da = p.a - this.at.a; const db = p.b - this.at.b;
    const d = Math.hypot(da, db);
    const v = this.speed * dt;
    if (d <= v) {
      this.at.a = p.a; this.at.b = p.b;
      this.pathI++;
      if (this.pathI >= this.path.length) this._arrive();
    } else {
      this.at.a += (da / d) * v;
      this.at.b += (db / d) * v;
      this._turn(Math.atan2(db, da), dt * 3);
    }
    this._clip(this.speed > this.B.D.walk * 1.5 ? 'sprint' : 'walk');
  }

  _arrive() {
    const then = this.then;
    this.path = null;
    if (then === 'search') {
      this.mode = 'search';
      this.searchT = GUARD.search;
      this.searchLook = this.at.look ?? 0;
    } else if (then === 'home') {
      // The patrol resumes from the point he left it at.
      this.off = this.home.T - this.B.clock;
      this.home = null;
      this.mode = 'patrol';
      this.mark.visible = false;
    } else if (then === 'arrest') {
      this.mode = 'hold';
    } else this.mode = 'patrol';
  }

  /** What he sees this frame, and what he does about it. */
  _look(dt, ctx) {
    const { D } = ctx;
    const L = this.B.level;
    const range = D.range * (this.kind === 'archer' ? D.archer.range : 1);
    let best = null;
    for (const k of ctx.kittens) {
      const seen = !k.hidden && canSee(L, this.g, this.at, D, k, ctx.smokes);
      k.seenBy ??= [];
      if (seen) k.seenBy.push(this);
      if (this.kind === 'archer') {
        // The nearest he sees. (The first cut compared `k.d` before it was measured.)
        const d = Math.hypot(k.a - this.at.a, k.b - this.at.b);
        if (seen && (!best || d < best.d)) best = { ...k, d };
        continue;
      }
      let m = this.meter.get(k.i) ?? 0;
      if (seen) {
        const d = Math.hypot(k.a - this.at.a, k.b - this.at.b);
        m += (dt / D.seeT) * (d < range * GUARD.near ? 2 : 1);
      } else m = Math.max(0, m - dt * GUARD.decay);
      this.meter.set(k.i, m);
      if (m > 0 && (!best || m > best.m)) best = { ...k, m };
    }
    if (this.kind === 'archer') return this._archer(dt, ctx, best);
    if (!best) {
      if (this.mode === 'hold' && !this.target?.until) { this.mode = 'patrol'; this.mark.visible = false; this.target = null; }
      return;
    }
    // Something in his eye: stop, "?", turn to it.
    if (this.mode === 'patrol' || this.mode === 'search' || (this.mode === 'go' && this.then !== 'arrest') || this.mode === 'heard') {
      this._leave(ctx.T);
      this.path = null;
      this.mode = 'hold';
      this._mark('?', '#ffd36a');
    }
    this.target = { a: best.a, b: best.b };
    if (best.m >= 1) {
      this.B.caught(best.i, this);
      return;
    }
    if (D.throws && best.m >= GUARD.throwAt && this.cd <= 0 && this.seesNow(best.i, ctx)) {
      this.cd = GUARD.throwCd;
      this._clip('attack');
      this.B.fire('star', { a: this.at.a, b: this.at.b, y: this.at.y + 1.7 }, { a: best.a, b: best.b, y: best.feet + 1.0 }, this);
    }
  }

  seesNow(i, ctx) { return ctx.kittens.find((k) => k.i === i)?.seenBy?.includes(this); }

  _archer(dt, ctx, best) {
    const { D } = ctx;
    if (best) {
      if (!this.alert) {
        this.alert = true;
        this.cd = Math.max(this.cd, 0.6);       // the "!" before the first arrow
        this._mark('!', '#ff5a5a');
        this._clip('alert');
        this.B.dream.game.sfx?.('spotted');
      }
      this.lostT = 0;
      this.mode = 'hold';
      this.target = { a: best.a, b: best.b };
      if (this.cd <= 0) {
        this.cd = D.arrow.cd;
        this._clip('attack');
        // At where she is, a little ahead of where she is going, and scattered.
        const lead = 0.25;
        const th = Math.atan2(best.b - this.at.b, best.a - this.at.a) + (Math.random() * 2 - 1) * D.arrow.spread;
        const d = Math.hypot(best.a - this.at.a, best.b - this.at.b) + (best.va ?? 0) * lead;
        this.B.fire('arrow', { a: this.at.a, b: this.at.b, y: this.at.y + 2.2 },
          { a: this.at.a + Math.cos(th) * d + (best.va ?? 0) * lead, b: this.at.b + Math.sin(th) * d + (best.vb ?? 0) * lead, y: best.feet + 1.0 }, this);
      }
    } else if (this.alert) {
      this.lostT += dt;
      if (this.lostT > GUARD.lose) {
        this.alert = false;
        this.mark.visible = false;
        if (this.mode === 'hold' && !this.target?.until) { this.mode = 'patrol'; this.target = null; }
      }
    }
  }

  /** Figure, mark and cone where the numbers say. */
  _place() {
    const q = this.B._w(this.at.a, this.at.b, this.at.y);
    this.group.position.set(q.x, q.y, q.z);
    if (this.fig) {
      this.fig.facing = isleFacing(this.B.isle, this.at.look ?? 0);
      this.fig.setClip?.(this.anim.clip, this.anim.t);
    }
  }

  /** The cone, from `reach` — the shadow behind every crate is where `blocked` puts it. */
  paintCone(D, smokes, live) {
    const show = this.awake && this.B.coneOn;
    this.cone.visible = show;
    if (!show) return;
    const half = D.half * (this.kind === 'archer' ? D.archer.half : 1);
    const pos = this.cone.geometry.attributes.position;
    const c = this.B._w(this.at.a, this.at.b, 0.06);
    pos.setXYZ(0, c.x, c.y, c.z);
    for (let j = 0; j <= CONE_RAYS; j++) {
      const th = (this.at.look ?? 0) - half + (2 * half * j) / CONE_RAYS;
      const r = reach(this.B.level, this.g, this.at, D, th, EYE.crawl, smokes);
      const q = this.B._w(this.at.a + Math.cos(th) * r, this.at.b + Math.sin(th) * r, 0.06);
      pos.setXYZ(j + 1, q.x, q.y, q.z);
    }
    pos.needsUpdate = true;
    this.cone.geometry.computeBoundingSphere();
    let m = 0;
    for (const v of this.meter.values()) m = Math.max(m, v);
    const hot = this.alert || this.arresting != null || m > 0;
    this.cone.material.color.setHex(hot ? SEEN_COL : CONE_COL[this.kind]);
    this.cone.material.opacity = (live ? 0.2 : 0.12) + (hot ? 0.2 + 0.25 * m : 0);
  }

  faceCamera(camera) { this.fig?.faceCamera?.(camera); }

  dispose() {
    this.group.removeFromParent();
    this.cone.removeFromParent();
    this.cone.geometry.dispose();
  }
}

/* --------------------------------- shots --------------------------------- */

const STAR_GEO = (() => {
  const g = new THREE.BufferGeometry();
  const v = [];
  for (let k = 0; k < 4; k++) {
    const a0 = (k / 4) * Math.PI * 2; const a1 = a0 + Math.PI / 4; const a2 = a0 - Math.PI / 4;
    v.push(0, 0, 0, Math.cos(a1) * 0.12, 0, Math.sin(a1) * 0.12, Math.cos(a0) * 0.4, 0, Math.sin(a0) * 0.4);
    v.push(0, 0, 0, Math.cos(a0) * 0.4, 0, Math.sin(a0) * 0.4, Math.cos(a2) * 0.12, 0, Math.sin(a2) * 0.12);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  return g;
})();
const ARROW_GEO = new THREE.CylinderGeometry(0.035, 0.035, 1.1, 5).rotateX(Math.PI / 2);

/**
 * EVERYTHING IN FLIGHT: his shuriken and arrows at her, and hers at him. A
 * shot flies in island terms (a, b, y) in a straight line, is stopped by what
 * stops a sight line (`blocked` — so a crate she ducks behind takes the
 * arrow), and a hit is the island's to decide (`onHit`). Hers is aimed at a
 * guard and lands where he stood when it left her hand.
 */
export class Shots {
  constructor(B, into) {
    this.B = B;
    this.into = into;
    this.list = [];
  }

  fire(kind, from, to, by) {
    const v = SHOT[kind] ?? 15;
    const da = to.a - from.a; const db = to.b - from.b; const dy = to.y - from.y;
    const d = Math.hypot(da, db, dy) || 1;
    const col = kind === 'arrow' ? 0xff6a6a : kind === 'mine' ? (by?.colour ?? HOLO.cyan) : 0xdfe8ff;
    const mesh = new THREE.Mesh(kind === 'arrow' ? ARROW_GEO : STAR_GEO,
      new THREE.MeshBasicMaterial({ color: col, toneMapped: false, side: THREE.DoubleSide }));
    this.into.add(mesh);
    const s = { kind, a: from.a, b: from.b, y: from.y, va: (da / d) * v, vb: (db / d) * v, vy: (dy / d) * v, t: 0, life: Math.min(SHOT.life, d / v + 0.4), by, to, mesh };
    this.list.push(s);
    this._place(s);
    this.B.dream.game.sfx?.(kind === 'arrow' ? 'zap' : 'slash', 0.5);
    return s;
  }

  /** `ctx.kittens` as the guards get it; `onHit(k, shot)`, `onLand(shot)`. */
  update(dt, ctx, onHit, onLand) {
    const L = this.B.level;
    for (const s of this.list) {
      if (s.dead) continue;
      const na = s.a + s.va * dt; const nb = s.b + s.vb * dt; const ny = s.y + s.vy * dt;
      s.t += dt;
      // Stopped by what stops a sight line — bamboo stops a shuriken, not an arrow from a tower.
      if (blocked(L, { a: s.a, b: s.b, y: s.y }, { a: na, b: nb, y: ny }, s.kind === 'arrow' ? 'archer' : 'samurai')) {
        s.dead = true; onLand?.(s); continue;
      }
      s.a = na; s.b = nb; s.y = ny;
      if (s.kind === 'mine') {
        if (s.t >= s.life - 0.4) { s.dead = true; onLand?.(s); }
      } else {
        for (const k of ctx.kittens) {
          if (k.hidden) continue;
          if (Math.hypot(k.a - s.a, k.b - s.b) < SHOT.hitR && s.y > k.feet - 0.2 && s.y < k.feet + 2.6) {
            s.dead = true; onHit(k, s); break;
          }
        }
        if (!s.dead && (s.t >= s.life || s.y < -0.5)) { s.dead = true; onLand?.(s); }
      }
      this._place(s);
    }
    for (const s of this.list) if (s.dead) s.mesh.removeFromParent();
    this.list = this.list.filter((s) => !s.dead);
  }

  _place(s) {
    const q = this.B._w(s.a, s.b, s.y);
    s.mesh.position.set(q.x, q.y, q.z);
    if (s.kind === 'arrow') {
      const d = isleDir(this.B.isle, Math.atan2(s.vb, s.va));
      s.mesh.lookAt(q.x + d.x, q.y + s.vy / (SHOT.arrow || 1), q.z + d.z);
    } else s.mesh.rotation.y += 0.6;
  }

  clear() {
    for (const s of this.list) s.mesh.removeFromParent();
    this.list = [];
  }
}

export { EYE };
