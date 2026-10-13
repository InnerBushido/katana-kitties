import * as THREE from 'three';
import { paint, toonVertexMat } from '../../core/gfx.js';
import { mergeParts } from '../../world/build.js';
import { ANIMALS } from './farm.js';

/* ---------------------------------------------------------------------------
   PLAYING WITH THE ANIMALS — more than feeding them.

   Richard: "Can we have them making 'a mess' or needing to be cleaned ...
   Maybe the player needs to take them on a walk. We can have a selected
   animal follow the player. Or maybe the player can play with them ... throw
   them a frisbee or stick ... The bird can fly around and the player has to
   catch it a few times ... When it levels up or grows up ... make the bird fly
   higher so that it requires player to have 3 or 4 jump ability ... Can be
   something similar with rabbit, like a timed jumping minigame where player
   has to mimic jumping like the rabbit ... Making the animals happy with
   mini-games should have some benefits in the game as well ... jumping
   distance, sprint speed ... the player should be informed which ability is
   being boosted."

   What is here:
     MESS     the pen gets one pile per PLAY.messEvery of real time, up to
              three (`messesAt` — computed from a timestamp, like the
              bamboo, so nothing ticks while the tab is shut). Cleaning the
              last pile makes every animal a little happier.
     WALK     any animal leaves the pen and follows her. Every PLAY.walk
              units she walks it is happier. Off her island it trots home.
     FETCH    the goat. HOLD ATTACK to throw the stick, like the fishing cast
              (the rod's pad trick: ATTACK is the stick's, never the katana's).
              A throw counts if the goat has to RUN for it, and how far it has
              to run grows with the goat. PLAY.wins good throws make it happy.
     CATCH    the chick flutters about at a height her jumps have to reach.
              A grown chick flies higher: level 3 wants three jumps and level
              4 wants four, as Richard asked. A kitten who cannot jump that
              high is told so before she starts, and told what gets her there.
     HOP      the bunny hops a rhythm, and she copies it with JUMP. The
              closer the timing, the better. Her pad is only WATCHED here,
              never masked, so she really does jump.
     GROWTH   every PLAY.joyPerLevel happy times an animal grows a level, up
              to four, and is drawn bigger. Nothing ever goes back down.
     BOOST    each animal's level is a small, NAMED boost for its owners —
              chick: JUMP HEIGHT, bunny: JUMP DISTANCE, goat: SPRINT. A level-up
              says which one in the toast, and the pen card lists all three.

   PLACEHOLDERS (docs/notes/housing.md): the stick is a stick-shaped box; the
   chick "flying" is the pen drawing bobbing in the air, with no wing
   animation; a pile is a few brown blobs.
--------------------------------------------------------------------------- */

const HOUR = 3600 * 1000;

export const PLAY = {
  messEvery: 8 * HOUR,
  messMax: 3,
  walk: 90,                     // units walked for a happy walk
  fetchNeed: [5, 8, 11, 14],    // how far the goat must run, by level
  wins: 3,                      // good throws / catches for a happy goat or chick
  chickH: [1.4, 3.2, 4.6, 5.6], // how high the chick flutters, above the ground
  chickJumps: [1, 2, 3, 4],     // ...and the jumps that height takes
  hopBeats: 4,
  hopTol: 0.16,                 // mean timing error (s) that still counts
  joyPerLevel: 2,
  boostPerLevel: { chick: 0.02, bunny: 0.04, goat: 0.04 },
};

export const BOOST_NAME = { chick: 'JUMP HEIGHT', bunny: 'JUMP DISTANCE', goat: 'SPRINT' };

/** An animal's level, 1..4, from how often it has been made happy. Pure. */
export function petLevel(A) {
  return 1 + Math.min(3, Math.floor((A?.joy ?? 0) / PLAY.joyPerLevel));
}

/** What a pen is worth to its owners. Level 1 is nothing; each level after
 *  it adds a little. Pure, and 1s for no pen, so a kitten with no home plays
 *  bit-identically (non-negotiable 5). */
export function petBoost(pen) {
  const B = { jump: 1, air: 1, speed: 1, lines: [] };
  for (const A of pen?.animals ?? []) {
    const L = petLevel(A);
    const k = 1 + (L - 1) * (PLAY.boostPerLevel[A.kind] ?? 0);
    if (A.kind === 'chick') B.jump = Math.max(B.jump, k);
    if (A.kind === 'bunny') B.air = Math.max(B.air, k);
    if (A.kind === 'goat') B.speed = Math.max(B.speed, k);
    /* The number she is TOLD is the one she gets. The chick's k scales her
       take-off speed, and height goes as speed squared, so +6% speed is +12%
       height — said as the height, because that is what she sees. (Reported
       as k-1 it also rounded 7.5 to 7 in floating point, which is how the
       check noticed.) */
    const gain = A.kind === 'chick' ? k * k - 1 : k - 1;
    if (L > 1) B.lines.push(`${BOOST_NAME[A.kind]} +${Math.round(gain * 100 + 1e-9)}%`);
  }
  return B;
}

/** How many piles are in the pen at `now`. Pure. */
export function messesAt(pen, now = Date.now()) {
  if (!pen) return 0;
  const since = now - (pen.cleaned ?? now);
  return Math.max(0, Math.min(PLAY.messMax, Math.floor(since / PLAY.messEvery)));
}

/** The mean timing error between two rhythms, as gaps (so starting late is
 *  not a mistake; only the rhythm is). Pure. */
export function rhythmError(want, got) {
  if (got.length < want.length) return Infinity;
  let e = 0;
  for (let k = 1; k < want.length; k++) e += Math.abs((got[k] - got[k - 1]) - (want[k] - want[k - 1]));
  return e / Math.max(1, want.length - 1);
}

const defOf = (kind) => ANIMALS.find((d) => d.id === kind) ?? ANIMALS[0];

export class PetPlay {
  constructor(housing) {
    this.H = housing;
    /** seat -> what she is doing with which animal */
    this.s = new Map();
    /** site -> { group, piles[] } */
    this.views = new Map();
    this.t = 0;
    this._dt = 1 / 60;
  }

  get game() { return this.H.game; }

  /** Is this animal out of the pen with somebody? Farm.update asks. */
  isOut(A) {
    for (const S of this.s.values()) if (S.A === A) return true;
    return false;
  }

  /* -------------------------------- mess -------------------------------- */

  sync() {
    for (const v of this.views.values()) v.group.parent?.remove(v.group);
    this.views.clear();
    for (const I of this.H.isles) {
      const H = I.home;
      if (!H?.pen || H.preview) continue;
      const P = I.placeOf('pen');
      if (!P) continue;
      H.pen.cleaned ??= Date.now();
      const group = new THREE.Group();
      I.itemGroup.add(group);
      const piles = [];
      for (let k = 0; k < PLAY.messMax; k++) {
        const a = 0.7 + k * 2.2;
        const x = P.x + Math.cos(a) * (P.r - 2.2);
        const z = P.z + Math.sin(a) * (P.r - 2.2);
        const m = this._pile();
        m.position.set(x, P.y, z);
        m.visible = false;
        group.add(m);
        piles.push({ x, z, y: P.y, m });
      }
      this.views.set(I.site.id, { I, H, P, group, piles });
    }
    for (const [i, S] of [...this.s]) if (!this.views.has(S.site)) this.stop(i, null);
  }

  _pile() {
    const parts = [];
    for (const [x, z, r] of [[0, 0, 0.32], [0.25, 0.1, 0.22], [-0.2, 0.15, 0.2], [0.05, -0.05, 0.16]]) {
      const b = new THREE.SphereGeometry(r, 7, 5);
      b.scale(1, 0.6, 1);
      b.translate(x, r * 0.5 + (r === 0.16 ? 0.25 : 0), z);
      paint(b, 0x6a4a2a);
      parts.push(b);
    }
    return new THREE.Mesh(mergeParts(parts), toonVertexMat());
  }

  /** The pile she is standing at, for `Housing._spotFor`. */
  pileNear(p) {
    for (const v of this.views.values()) {
      const n = messesAt(v.H.pen);
      for (let k = 0; k < n; k++) {
        const q = v.piles[k];
        if (Math.hypot(p.position.x - q.x, p.position.z - q.z) < 1.8 && Math.abs(p.position.y - q.y) < 3) return { v, k };
      }
    }
    return null;
  }

  /** ACTION at a pile: it is gone. The last one makes everybody happier. */
  clean(p, at) {
    const G = this.game;
    const pen = at.v.H.pen;
    const n = messesAt(pen);
    if (!n) return;
    // One pile's worth of time is taken off the clock: the rest stay put.
    pen.cleaned = n <= 1 ? Date.now() : pen.cleaned + PLAY.messEvery;
    G.audio?.play?.('menu');
    if (n <= 1) {
      for (const A of pen.animals) this._joy(p, at.v.H, A, 1, null);
      G.toast?.(`${p.name} cleaned the pen — it is spotless! The animals are happy.`, p.index);
    } else {
      G.toast?.(`${p.name} cleaned up a mess. ${n - 1} more to go!`, p.index);
    }
    this.H.save();
  }

  /* ------------------------------- happiness ----------------------------- */

  /** An animal is happier; if that grows it, say so, and say what it boosts. */
  _joy(p, H, A, n, why) {
    const before = petLevel(A);
    A.joy = (A.joy ?? 0) + n;
    const after = petLevel(A);
    const def = defOf(A.kind);
    if (after > before) {
      const B = petBoost(H.pen);
      const line = B.lines.find((l) => l.startsWith(BOOST_NAME[A.kind])) ?? BOOST_NAME[A.kind];
      this.game.toast?.(`Your ${def.name} grew up — level ${after} of 4! ${line} for ${H.owners.join(' & ')}.`, p.index);
      this.game.audio?.play?.('perfect');
      this.H.farm.sync();
    } else if (why) {
      this.game.toast?.(why, p.index);
    }
    this.H.farm.applyCare();
    this.H.save();
  }

  /* -------------------------------- start ------------------------------- */

  /** From the pen card. `kind`: walk | fetch | catch | hop. */
  start(p, H, kind, animalKind) {
    const G = this.game;
    const v = this.views.get(H.site);
    if (!v) { G.toast?.('The pen is not ready yet.', p.index); return false; }
    const A = H.pen.animals.find((a) => a.kind === animalKind);
    if (!A) return false;
    const def = defOf(A.kind);
    for (const [i, S] of this.s) {
      if (S.A === A && i !== p.index) {
        G.toast?.(`${G.players?.[i]?.name ?? 'Somebody'} is already playing with the ${def.name}.`, p.index);
        return false;
      }
    }
    if (kind === 'catch') {
      const need = PLAY.chickJumps[petLevel(A) - 1];
      const has = p.maxJumps ?? 2;
      if (has < need) {
        G.audio?.play?.('deny');
        G.toast?.(`Your ${def.name} flies too high now — catching it takes ${need} jumps, and you have ${has}. Shadowtail and the Leap orbs add jumps.`, p.index);
        return false;
      }
    }
    this.stop(p.index, null);
    const S = { kind, site: H.site, H, A, v, t: 0, wins: 0, walked: 0, at: null, last: p.position.clone() };
    const g = this._animal(S);
    S.pos = g ? g.position.clone() : p.position.clone();
    if (kind === 'fetch') S.phase = 'idle';
    if (kind === 'catch') { S.spot = this._chickSpot(S, p, 3); }
    if (kind === 'hop') this._hopShow(S);
    this.s.set(p.index, S);
    G.audio?.play?.('menu');
    G.toast?.({
      walk: `${p.name} is taking the ${def.name} for a walk! It follows you — off your island, it trots home.`,
      fetch: `${p.name} has a stick! HOLD ATTACK to throw it — make the ${def.name} run for it.`,
      catch: `Catch the ${def.name}! Jump and touch it ${PLAY.wins} times.`,
      hop: `Watch the ${def.name} hop… then copy its rhythm with JUMP!`,
    }[kind], p.index);
    return true;
  }

  stop(i, why) {
    const S = this.s.get(i);
    if (!S) return;
    S.stick?.removeFromParent();
    this.s.delete(i);
    if (why) this.game.toast?.(why, i);
  }

  drop(i) { this.stop(i, null); }

  playing(i) { return this.s.get(i) ?? null; }

  /** The animal's drawn group, found again each time (a sync rebuilds them). */
  _animal(S) {
    return this.H.farm.views.get(S.site)?.animals.find((g) => g.userData.A === S.A) ?? null;
  }

  _chickSpot(S, p, d) {
    const P = S.v.P;
    const I = S.v.I;
    for (let k = 0; k < 12; k++) {
      const a = Math.random() * Math.PI * 2;
      const x = p.position.x + Math.cos(a) * d;
      const z = p.position.z + Math.sin(a) * d;
      // On her island, and not inside the house.
      if (!I.over(x, z, -4)) continue;
      const g = I.island.heightAt(x, z);
      if (g == null) continue;
      return { x, z, y: g + PLAY.chickH[petLevel(S.A) - 1] };
    }
    return { x: P.x, z: P.z, y: P.y + PLAY.chickH[petLevel(S.A) - 1] };
  }

  _hopShow(S) {
    S.phase = 'show';
    S.t = 0;
    const beats = [0];
    for (let k = 1; k < PLAY.hopBeats; k++) beats.push(beats[k - 1] + 0.35 + Math.round(Math.random() * 3) * 0.15);
    S.beats = beats;
    S.got = [];
    S.shown = 0;
  }

  /* -------------------------------- her pad ------------------------------ */

  /**
   * FETCH: ATTACK is the stick's (masked, like the fishing rod). HOP: JUMP is
   * only watched — she really jumps, which is the point.
   */
  padFor(i, pad) {
    const S = this.s.get(i);
    if (!S || !pad) return pad;
    const p = this.game.players?.[i];
    if (S.kind === 'hop' && S.phase === 'copy' && pad.pressed('jump')) S.got.push(S.t);
    if (S.kind !== 'fetch') return pad;
    if (p) this._fetchPad(p, S, pad, this._dt);
    const m = Object.create(pad);
    m.pressed = (a) => (a === 'attack' ? false : pad.pressed(a));
    m.down = (a) => (a === 'attack' ? false : pad.down(a));
    m.doubled = (a, w) => (a === 'attack' ? false : pad.doubled?.(a, w) ?? false);
    m.consume = (a) => pad.consume?.(a);
    // A pad's stick may be a getter; see angling.js.
    Object.defineProperty(m, 'mx', { value: pad.mx });
    Object.defineProperty(m, 'my', { value: pad.my });
    return m;
  }

  _fetchPad(p, S, pad, dt) {
    const atk = pad.down('attack');
    if (S.phase === 'idle' && pad.pressed('attack')) { S.phase = 'charge'; S.k = 0; }
    else if (S.phase === 'charge') {
      if (atk) S.k = Math.min(1, S.k + dt);
      else {
        const d = 3 + S.k * 16;
        const f = p.facing;
        S.from = new THREE.Vector3(p.position.x, p.position.y + 1.4, p.position.z);
        S.to = { x: p.position.x + Math.sin(f) * d, z: p.position.z + Math.cos(f) * d };
        S.phase = 'fly';
        S.t = 0;
        this.game.audio?.play?.('jump');
      }
    }
  }

  /* -------------------------------- a frame ------------------------------ */

  update(dt, players) {
    this._dt = dt;
    this.t += dt;
    const G = this.game;
    for (const v of this.views.values()) {
      const n = messesAt(v.H.pen);
      v.piles.forEach((q, k) => { q.m.visible = k < n; });
    }
    const pull = G.tournament?.active || G._sceneActive?.();
    for (const [i, S] of [...this.s]) {
      const p = players[i];
      if (!p || pull) { this.stop(i, null); continue; }
      const def = defOf(S.A.kind);
      if (!S.v.I.over(p.position.x, p.position.z, 2)) {
        this.stop(i, `The ${def.name} trotted home to its pen.`);
        continue;
      }
      S.t += dt;
      const g = this._animal(S);
      const ground = (x, z) => S.v.I.heightAt?.(x, z, p.position.y + 2)?.y ?? S.v.I.island.heightAt(x, z) ?? S.v.P.y;
      if (S.kind === 'walk' || (S.kind === 'fetch' && (S.phase === 'idle' || S.phase === 'charge'))) {
        this._follow(S, p, dt, ground);
        if (S.kind === 'walk') {
          S.walked += Math.hypot(p.position.x - S.last.x, p.position.z - S.last.z);
          if (S.walked >= PLAY.walk) {
            S.walked = 0;
            this._joy(p, S.H, S.A, 1, `The ${def.name} loved the walk! It is happier.`);
          }
        }
      } else if (S.kind === 'fetch') {
        this._fetchFrame(S, p, dt, ground, def);
      } else if (S.kind === 'catch') {
        this._catchFrame(S, p, dt, def);
      } else if (S.kind === 'hop') {
        this._hopFrame(S, p, dt, ground, def);
      }
      S.last.copy(p.position);
      if (g) {
        g.position.copy(S.pos);
        const bb = g.userData.bb;
        if (bb && S.vel && Math.hypot(S.vel.x, S.vel.z) > 0.2) bb.facing = Math.atan2(S.vel.x, S.vel.z);
      }
    }
  }

  /** Trot after her, a couple of units behind, with a little hop. */
  _follow(S, p, dt, ground, sp = 7) {
    const f = p.facing;
    const tx = p.position.x - Math.sin(f) * 2.2;
    const tz = p.position.z - Math.cos(f) * 2.2;
    this._run(S, tx, tz, sp, dt, ground);
  }

  _run(S, tx, tz, sp, dt, ground) {
    const dx = tx - S.pos.x;
    const dz = tz - S.pos.z;
    const d = Math.hypot(dx, dz);
    const step = Math.min(d, sp * dt);
    S.vel = { x: d > 0.01 ? (dx / d) * sp : 0, z: d > 0.01 ? (dz / d) * sp : 0 };
    if (d > 0.01) { S.pos.x += (dx / d) * step; S.pos.z += (dz / d) * step; }
    S.pos.y = ground(S.pos.x, S.pos.z) + (d > 0.3 ? Math.abs(Math.sin(this.t * 9)) * 0.25 : 0);
    return d;
  }

  _fetchFrame(S, p, dt, ground, def) {
    const G = this.game;
    if (S.phase === 'fly') {
      const k = Math.min(1, S.t / 0.6);
      if (!S.stick) {
        const geo = new THREE.BoxGeometry(0.9, 0.1, 0.1);
        paint(geo, 0x8a5a30);
        S.stick = new THREE.Mesh(geo, toonVertexMat());
        S.v.group.add(S.stick);
      }
      S.stick.visible = true;
      const gy = ground(S.to.x, S.to.z);
      S.stick.position.set(
        THREE.MathUtils.lerp(S.from.x, S.to.x, k),
        THREE.MathUtils.lerp(S.from.y, gy + 0.1, k) + Math.sin(k * Math.PI) * 3,
        THREE.MathUtils.lerp(S.from.z, S.to.z, k));
      S.stick.rotation.z += dt * 14;
      if (k >= 1) {
        S.stick.rotation.set(0, Math.random() * 3, 0);
        const onIsle = S.v.I.over(S.to.x, S.to.z, -1);
        S.run = Math.hypot(S.to.x - S.pos.x, S.to.z - S.pos.z);
        S.good = onIsle && S.run >= PLAY.fetchNeed[petLevel(S.A) - 1];
        S.phase = onIsle ? 'chase' : 'back';
        if (!onIsle) G.toast?.(`Whoops — over the edge! The ${def.name} fetches you another stick.`, p.index);
      }
      this._follow(S, p, dt, ground, 4);
    } else if (S.phase === 'chase') {
      // The goat runs faster the further it was thrown: a long throw is a sprint.
      if (this._run(S, S.to.x, S.to.z, 10, dt, ground) < 0.5) S.phase = 'back';
    } else if (S.phase === 'back') {
      if (S.stick) S.stick.position.set(S.pos.x, S.pos.y + 0.8, S.pos.z);
      if (this._run(S, p.position.x, p.position.z, 9, dt, ground) < 1.6) {
        if (S.stick) S.stick.visible = false;
        S.phase = 'idle';
        const need = PLAY.fetchNeed[petLevel(S.A) - 1];
        if (S.good) {
          S.wins += 1;
          G.audio?.play?.('great');
          if (S.wins >= PLAY.wins) {
            S.wins = 0;
            this._joy(p, S.H, S.A, 1, `The ${def.name} had SO much fun! It is happier.`);
          } else {
            G.toast?.(`Good throw! (${S.wins} of ${PLAY.wins})`, p.index);
          }
        } else if (S.run != null && S.run < need) {
          G.toast?.(`Too close — throw it further! The ${def.name} wants to run at least ${need}.`, p.index);
        }
        S.run = null;
      }
    }
  }

  _catchFrame(S, p, dt, def) {
    const G = this.game;
    const sp = S.spot;
    // Fluttering: a figure of eight round its spot, bobbing.
    const tx = sp.x + Math.sin(this.t * 1.3) * 1.2;
    const tz = sp.z + Math.sin(this.t * 2.6) * 0.6;
    const ty = sp.y + Math.sin(this.t * 5) * 0.2;
    const dx = tx - S.pos.x;
    const dz = tz - S.pos.z;
    const d = Math.hypot(dx, dz);
    const step = Math.min(d, 8 * dt);
    if (d > 0.01) { S.pos.x += (dx / d) * step; S.pos.z += (dz / d) * step; }
    S.pos.y += (ty - S.pos.y) * Math.min(1, dt * 4);
    S.vel = { x: dx, z: dz };
    // Caught: her body reaches it (her middle is about 0.9 up).
    const near = Math.hypot(p.position.x - S.pos.x, p.position.z - S.pos.z) < 1.2
      && Math.abs(p.position.y + 0.9 - S.pos.y) < 1.1;
    if (near && (S.cool ?? 0) <= 0) {
      S.wins += 1;
      S.cool = 0.8;
      G.audio?.play?.('great');
      if (S.wins >= PLAY.wins) {
        S.wins = 0;
        this._joy(p, S.H, S.A, 1, `You caught the ${def.name} ${PLAY.wins} times — it is happier!`);
      } else {
        G.toast?.(`Caught it! (${S.wins} of ${PLAY.wins}) — off it flies again…`, p.index);
      }
      // Further every time.
      S.spot = this._chickSpot(S, p, 4 + S.wins * 2.5);
    }
    S.cool = (S.cool ?? 0) - dt;
  }

  _hopFrame(S, p, dt, ground, def) {
    const G = this.game;
    // The bunny sits in front of her, facing her.
    const f = p.facing;
    const bx = p.position.x + Math.sin(f) * 3;
    const bz = p.position.z + Math.cos(f) * 3;
    this._run(S, bx, bz, 5, dt, ground);
    const gy = ground(S.pos.x, S.pos.z);
    if (S.phase === 'show') {
      const k = S.beats.findIndex((b) => S.t >= b && S.t < b + 0.3);
      S.pos.y = gy + (k >= 0 ? Math.sin(((S.t - S.beats[k]) / 0.3) * Math.PI) * 0.9 : 0);
      if (S.shown < S.beats.length && S.t >= S.beats[S.shown]) { S.shown += 1; G.audio?.play?.('beat'); }
      if (S.t > S.beats[S.beats.length - 1] + 0.9) { S.phase = 'copy'; S.t = 0; S.got = []; }
    } else if (S.phase === 'copy') {
      S.pos.y = gy;
      if (S.got.length >= S.beats.length || S.t > S.beats[S.beats.length - 1] + 3) {
        const err = rhythmError(S.beats, S.got);
        if (err <= PLAY.hopTol) {
          this._joy(p, S.H, S.A, 1, `Perfect hopping! The ${def.name} is happier.`);
        } else {
          G.toast?.(err === Infinity
            ? `The ${def.name} hopped ${S.beats.length} times — you hopped ${S.got.length}. Watch again!`
            : `Close! You were ${Math.round(err * 1000)}ms off the rhythm. Watch again!`, p.index);
        }
        this._hopShow(S);
      }
    }
  }

  /** Her callout while she is playing, or null. */
  prompt(p) {
    const S = this.s.get(p.index);
    if (!S) return null;
    const name = defOf(S.A.kind).name;
    switch (S.kind) {
      case 'walk': return `WALKING THE ${name} · ${Math.round((S.walked / PLAY.walk) * 100)}%`;
      case 'fetch':
        if (S.phase === 'charge') { const k = Math.round(S.k * 8); return `THROW ${'■'.repeat(k)}${'□'.repeat(8 - k)}`; }
        return S.phase === 'idle' ? `HOLD ATTACK TO THROW · ${S.wins}/${PLAY.wins}` : null;
      case 'catch': return `CATCH THE ${name} · ${S.wins}/${PLAY.wins}`;
      case 'hop': return S.phase === 'show' ? `WATCH THE ${name}…` : 'NOW YOU — JUMP IN TIME!';
      default: return null;
    }
  }
}
