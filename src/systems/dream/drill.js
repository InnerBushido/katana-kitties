import * as THREE from 'three';
import { SIM, HOLO } from '../../world/simworld.js';
import { HoloPanel } from './holo.js';
import { GateRing, HoloStar, Laser, Bolt, toWorld } from './targets.js';
import { starsFor } from './progress.js';

/* ---------------------------------------------------------------------------
   ONE KITTEN, ONE TRAINING RUN — the shape every mode in the simulator shares.

   A drill is a goal ("cut five posts"), a clock, and the holograms that make
   the goal possible, all OWNED BY HER: her targets answer only to her blade,
   her gates only to her body, her bolts only fly at her. That is what lets
   four sisters run four drills on the same floor at once without one of them
   finishing another's — and it is drawn in her colour, so on a shared floor
   she can see which posts are hers.

   HOW ONE ENDS, and every way says so (non-negotiable 6):
     · she makes the goal — stars, Lionheart's line, a gold flash;
     · the clock runs out — "Time! 3 of 5", no stars, the floor clears;
     · she walks off the floor — "stopped: you left the floor";
     · her SIM bar empties — the simulator catches her and it starts over;
     · she disconnects, or anything pulls everybody out — cleared silently,
       because the thing that pulled her out is already saying something.

   NOTHING HANGS OFF A DRILL ENDING but its own cleanup and the stars, which
   are written at the moment she earns them.

   `spec` is the whole drill, as data plus a `setup(d)`:
     { id, title, kanji, colour, time, goal, goalText, bands, lowerIsBetter,
       score: 'time' | 'count' | fn(d), grace, leaveR, setup(d), tick?(d, dt) }
--------------------------------------------------------------------------- */

export class Drill {
  /**
   * @param {object} dream   the DreamDojo
   * @param {object} p       the kitten
   * @param {object} spec    see the header
   * @param {{x:number,y:number,z:number}} at  the floor's centre, in the layer
   */
  constructor(dream, p, spec, at) {
    this.dream = dream;
    this.p = p;
    this.spec = spec;
    this.at = at;
    this.t = 0;
    this.count = 0;
    this.goal = spec.goal ?? 1;
    this.state = 'ready';
    this.readyT = spec.grace ?? 1.2;
    this.colour = p.style?.colour ?? HOLO.cyan;
    this.objs = [];
    this.targets = [];
    this.decks = [];
    this.lasers = [];
    this.bolts = [];
    this.rings = [];
    this.stars = [];
    this.root = new THREE.Group();
    this.root.name = `drill-${spec.id}-${p.index}`;
    dream.sim.root.add(this.root);
    this.panel = new HoloPanel({ w: 5.4, h: 1.7, px: 110, edge: this.colour });
    this.panel.position.y = (p.height ?? 2.6) + 2.3;
    p.group.add(this.panel);
    spec.setup?.(this);
    this._paint();
  }

  /* ------------------------------ building ------------------------------ */

  /** Layer point at an offset (a = along `fwd`, b = to its right). */
  spot(a, b, dy = 0) {
    const f = this.at.fwd ?? { x: 0, z: 1 };
    const r = { x: -f.z, z: f.x };
    return { x: this.at.x + f.x * a + r.x * b, y: this.at.y + dy, z: this.at.z + f.z * a + r.z * b };
  }

  /** A target of hers. `Cls` is one of targets.js's.
   *
   *  NOTHING COUNTS BEFORE GO — AND NOTHING BREAKS BEFORE IT EITHER. Richard:
   *  "sometimes you cut all the bamboo, but it shows there is still 1 or more
   *  left, this is happening because the player can hit the bamboo before the
   *  trial has started". The cane BROKE in the 1.2 s count-in (the gate only
   *  asked the target), but `progress()` refused it because the drill was not
   *  live yet — so the cane was gone and the count could never reach ten. The
   *  fix is at the gate, for every drill at once: a target refuses a blow
   *  until its drill is live, and the count-in says why. After the drill has
   *  ended it refuses quietly, because nothing is being asked of her then. */
  target(Cls, o) {
    const accept = o.accept;
    const refuse = o.onRefuse;
    const t = new Cls({
      parent: this.root, owner: this.p.index, colour: this.colour,
      shards: this.dream.shards, ...o,
      accept: (info, tt) => this.state === 'live' && (!accept || accept(info, tt)),
      onRefuse: (tt, info) => {
        if (this.state === 'ready') this.dream.hint?.(this.p, 'Not yet — wait for GO!');
        else if (this.state === 'live') refuse?.(tt, info);
      },
    });
    this.dream.gate.add(t);
    this.targets.push(t);
    return t;
  }

  ring(o) {
    const r = new GateRing({ parent: this.root, owner: this.p.index, colour: this.colour, ...o });
    this.rings.push(r);
    return r;
  }

  star(o) {
    const s = new HoloStar({ parent: this.root, owner: this.p.index, ...o });
    this.stars.push(s);
    return s;
  }

  /** A beam that drains her SIM bar. `hold: true` is a beam a raised Ward
   *  stands in rather than a blow it takes (see the gallery's 守 drill). */
  laser(o) {
    const { onResult, hold, ...rest } = o;
    const L = new Laser({
      parent: this.root, owner: this.p.index,
      ...rest,
      onHit: (q) => {
        /* PUSHED AWAY FROM THE NEAREST POINT OF THE BEAM, flat. The first cut
           pushed away from the beam's END, which for a wall of light means
           sideways along it — and on an island, off the edge. A held beam
           pushes nobody: it is a thing she stands in. */
        const push = hold ? null : this._awayFromBeam(q, L);
        const r = this.dream.simHit(q, { dmg: o.dmg ?? 12, push, src: 'laser', hold: !!hold, drill: this });
        onResult?.(r, L);
      },
    });
    this.lasers.push(L);
    return L;
  }

  /** Fire a bolt from a layer point at her. */
  bolt(from, o = {}) {
    const p = this.p;
    return this.boltTo(from, {
      x: p.position.x - SIM.dx,
      y: p.position.y + (p.height ?? 2.6) * 0.5,
      z: p.position.z - SIM.dz,
    }, o);
  }

  /** Fire a bolt from a layer point at another — the sentries' core fans a
   *  burst of three, and only the middle one is aimed at her. */
  boltTo(from, to, o = {}) {
    const p = this.p;
    const b = new Bolt({
      parent: this.root, owner: p.index, from, to,
      onHit: (q, bolt) => {
        const v = bolt.vel;
        const n = Math.hypot(v.x, v.z) || 1;
        /* FROM one step back along its flight, not from where it is: the hit
           test fires within a unit of her, which can already be level with
           her or past her middle, and the half-plane a 返 guard covers is
           asked about where the bolt CAME from. */
        const from = { x: bolt.pos.x - v.x / n * 3, z: bolt.pos.z - v.z / n * 3 };
        const r = this.dream.simHit(q, { dmg: bolt.dmg, push: { x: v.x / n, z: v.z / n }, src: 'bolt', drill: this, from, foe: o.foe ?? null });
        o.onResult?.(r, bolt);
      },
      ...o,
    });
    this.bolts.push(b);
    return b;
  }

  /** Flat unit vector from the beam's nearest point to her, in the layer. */
  _awayFromBeam(q, L) {
    const x = q.position.x - SIM.dx;
    const z = q.position.z - SIM.dz;
    const ax = L.a.x; const az = L.a.z;
    const bx = L.b.x - ax; const bz = L.b.z - az;
    const len2 = bx * bx + bz * bz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / len2));
    let dx = x - (ax + bx * t);
    let dz = z - (az + bz * t);
    let n = Math.hypot(dx, dz);
    // Dead on the line: back the way she was facing.
    if (n < 1e-3) { dx = -Math.sin(q.facing ?? 0); dz = -Math.cos(q.facing ?? 0); n = 1; }
    return { x: dx / n, z: dz / n };
  }

  /** A temporary floor — a step, a ledge, a floating platform. */
  deck(spec) {
    const d = this.dream.sim.addTempDisc({ colour: this.colour, ...spec });
    this.decks.push(d);
    return d;
  }

  /* ------------------------------- running ------------------------------- */

  /** One more toward the goal. */
  progress(n = 1) {
    if (this.state !== 'live') return;
    this.count += n;
    this.dream.game.sfx?.('score');
    if (this.count >= this.goal) this.win();
  }

  win() {
    if (this.state !== 'live') return;
    this.state = 'won';
    const s = this.spec;
    const score = typeof s.score === 'function' ? s.score(this)
      : s.score === 'count' ? this.count : this.t;
    const lower = s.lowerIsBetter ?? (s.score !== 'count');
    const stars = s.bands ? starsFor(score, s.bands, lower) : 1;
    this.result = this.dream.award(this.p, s.id, stars, score, lower);
    this.stars_ = stars;
    this.dream.game.sfx?.('victory');
    this.dream.shards.burst(
      this.p.position.x - SIM.dx, this.p.position.y, this.p.position.z - SIM.dz,
      HOLO.gold, 60, 6, 8
    );
    this.endT = 3.2;
    this.dream.onDrillEnd?.(this, 'won');
  }

  fail(why) {
    if (this.state !== 'live' && this.state !== 'ready') return;
    this.state = 'failed';
    this.why = why;
    this.dream.game.sfx?.('deny');
    this.endT = 2.6;
    this.dream.onDrillEnd?.(this, 'failed');
  }

  /** Off the floor? Measured flat, in the layer. */
  _left() {
    const R = this.spec.leaveR ?? this.at.r ?? 30;
    const x = this.p.position.x - SIM.dx;
    const z = this.p.position.z - SIM.dz;
    return Math.hypot(x - this.at.x, z - this.at.z) > R + 1.5;
  }

  update(dt) {
    const players = [this.p];
    if (this.state === 'ready') {
      this.readyT -= dt;
      if (this.readyT <= 0) {
        this.state = 'live';
        this.dream.game.sfx?.('count');
        this.spec.start?.(this);
      }
    } else if (this.state === 'live') {
      this.t += dt;
      this.spec.tick?.(this, dt);
      if (this.state === 'live' && this.spec.time && this.t >= this.spec.time) {
        if (this.spec.timeWins) this.win();
        else this.fail(`Time! ${this.count} of ${this.goal}`);
      }
      if (this.state === 'live' && this._left()) this.fail('Stopped — you left the floor');
    } else {
      this.endT -= dt;
    }
    for (const t of this.targets) {
      t.update(dt);
      // `respawn: secs` — a target the drill needs standing comes back.
      if (!t.live && t.o.respawn != null && this.state === 'live') {
        t.deadT = (t.deadT ?? 0) + dt;
        if (t.deadT >= t.o.respawn) { t.deadT = 0; t.revive(); }
      }
    }
    for (const r of this.rings) r.update(dt, this.state === 'live' ? players : []);
    for (const s of this.stars) s.update(dt, this.state === 'live' ? players : []);
    for (const L of this.lasers) L.update(dt, this.state === 'live' ? players : []);
    for (const b of this.bolts) b.update(dt, this.state === 'live' ? players : []);
    this.bolts = this.bolts.filter((b) => !b.dead);
    this._paint();
    return !(this.state === 'won' || this.state === 'failed') || this.endT > 0;
  }

  /** The card over her head: what, how far, how long. A drill whose card is
   *  not "count of goal, seconds left" (a kata, the clean cut's angles) hands
   *  back its own lines from `spec.paint`, or nothing for the usual card. */
  _paint() {
    const s = this.spec;
    const own = s.paint?.(this);
    if (own) {
      this.panel.set(own, this.state === 'won' ? HOLO.gold : this.colour);
      return;
    }
    const lines = [{ text: `${s.kanji ?? ''} ${s.title}`.trim(), size: 2.1, color: this.colour, glow: true }];
    if (this.state === 'ready') {
      lines.push({ text: s.goalText, size: 1.5 });
      lines.push({ text: 'READY…', size: 1.9, color: HOLO.gold });
    } else if (this.state === 'live') {
      const left = s.time ? Math.max(0, s.time - this.t) : this.t;
      const prog = s.showCount === false ? s.goalText : `${s.countLabel ?? ''}${Math.min(this.count, this.goal)} / ${this.goal}`;
      lines.push({ text: prog, size: 1.7 });
      lines.push({ text: `${left.toFixed(1)}s`, size: 1.9, color: left < 4 && s.time ? 0xff6a6a : HOLO.cyan });
    } else if (this.state === 'won') {
      lines.push({ text: '★'.repeat(this.stars_ ?? 1) + '☆'.repeat(3 - (this.stars_ ?? 1)), size: 2.4, color: HOLO.gold, glow: true });
      lines.push({ text: this.result?.gained ? `+${this.result.gained} ★  NEW BEST` : (s.doneText?.(this) ?? 'CLEAR!'), size: 1.5 });
    } else {
      lines.push({ text: this.why ?? 'Stopped', size: 1.6, color: 0xff8a8a });
      lines.push({ text: 'Try again any time', size: 1.3 });
    }
    this.panel.set(lines, this.state === 'won' ? HOLO.gold : this.colour);
  }

  faceCamera(camera) {
    this.panel.faceCamera(camera);
    for (const t of this.targets) t.faceCamera(camera);
    this.spec.face?.(this, camera);
  }

  /** Everything she was given goes away; nothing of hers is touched. */
  dispose() {
    for (const t of this.targets) { this.dream.gate.remove(t); t.dispose(); }
    for (const d of this.decks) this.dream.sim.removeTempDisc(d);
    for (const L of this.lasers) L.dispose();
    for (const b of this.bolts) b.dispose();
    for (const r of this.rings) r.dispose();
    for (const s of this.stars) s.dispose();
    this.root.removeFromParent();
    this.panel.removeFromParent();
    this.spec.dispose?.(this);
  }
}

export { toWorld };
