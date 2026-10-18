import * as THREE from 'three';
import { ATTACKS, KENDO_SCALE } from '../../entities/player.js';
import { aggregate } from '../../entities/powerorb.js';
import { kendoArea, kendoMarks } from './catalog.js';

/* ---------------------------------------------------------------------------
   KENDO — the one floor outside the ring where a blow lands.

   NON-NEGOTIABLE 3, RELAXED, AND HOW FAR. Richard, Oct 2026: fighting is
   allowed "only in designated zones" — a kendo dojo room, on its taped
   square, between two kittens who are BOTH wearing the gear. Not the arena's
   fight: nobody loses health, nobody is knocked out, nothing is scored on the
   tournament. A clean hit is an IPPON — a point on the dojo's board, a
   shove, the kiai shout and her spirit animal over her head. That keeps
   `Game.strikePlayers` the only gate: it asks `Tournament.fighting` first,
   and only when that says no does it ask `Housing.sparStrike`, which says yes
   only on the tape.

   THE LOOK IS HER OWN DRAWING. `kittens/<sheet>/kendo.png` (the guard, worn
   while geared) and `kiai.png` (the men strike, worn for KIAI_T on every
   swing), recoloured for Storm and Blossom and drawn by `Player` — this
   file only sets `kendoGeared` and `kiaiT`. THE FALLBACK, for a build with
   neither file: a drawn men (helmet grille) over her head and a pale shinai
   riding with her, so the gear still reads and the feature still plays.
--------------------------------------------------------------------------- */

export const IPPON_COOL = 0.9;

/**
 * A MATCH, Oct 2026. Richard: "There should likely be rounds and timer and
 * scores counted, it should be like a battle at the arena. We can have
 * players start the fight from a kneeling position, then taking turns, they
 * grab their shinai next to them, stand up, kiai loudly with their specific
 * kiai, and then when both player have finished standing up and kiai'ing,
 * they both bow to each other before the round fight begins."
 *
 * Shiai rules, cut down for a nine-year-old: TWO IPPONS TAKE A ROUND (sanbon
 * shobu is first to two), a round is ROUND_T seconds and the one ahead when
 * it runs out takes it (level is a draw, hikiwake, and nobody's round), and
 * the match is the best of ROUNDS. Every number below is a beat of the
 * ceremony, in seconds.
 */
export const BOUT = {
  rounds: 3,
  toWin: 2,
  roundT: 60,
  /** The beat between the second kneeling and the first reaching for her
   *  shinai — short, since both have already knelt on their marks (`_seiza`). */
  kneel: 0.6,
  grab: 0.7,
  stand: 0.6,
  kiai: 1.1,
  bow: 1.5,
  hajime: 1.0,
  yame: 1.4,
  roundEnd: 2.6,
  /** Out of the square in a live round this long, and the match is off. */
  jogai: 1.5,
};

/** Each kitten's kiai, as a pitch on the shout (audio.js 'kiai'). PLACEHOLDER
 *  until each has a recorded one — see docs/notes/housing.md. */
export const KIAI_PITCH = { Ember: 1.0, Frost: 1.22, Storm: 0.86, Blossom: 1.12 };
/** How long the kiai drawing is held after a swing in the bogu. */
export const KIAI_T = 0.4;

/** Each kitten's spirit animal, for the kiai — her hex badge. */
export const SPIRITS = {
  Ember: { animal: 'TIGER', kanji: '虎', colour: '#ff8a3d' },
  Frost: { animal: 'CRANE', kanji: '鶴', colour: '#ff6fae' },
  Storm: { animal: 'DRAGON', kanji: '龍', colour: '#35d7f0' },
  Blossom: { animal: 'FOX', kanji: '狐', colour: '#a96bff' },
};

/**
 * THE START: KNEEL ON A MARK. Richard, Oct 2026: "Show players where to stand
 * to start. They start in seiza on specific spots ... After waiting on a spot
 * for more than 2 seconds, she sits in seiza. Pressing a move direction
 * stands her up, and she sits again after 2 seconds of inactivity. The battle
 * begins once both players are in seiza." It replaced "two geared kittens
 * anywhere on the square for 1.2s", which started a match on two kittens who
 * had walked in to look at the rack.
 *   `t`     still on a mark this long, and she kneels
 *   `r`     how near a mark counts as on it
 *   `still` the stick under this is "not pressing a direction"
 */
export const SEIZA = { t: 2, r: 0.9, still: 0.25 };

/**
 * A STRIKE IS VERTICAL, SO IT IS A LANE. Richard: "Attacks become vertical,
 * with a vertical swipe. The hit area is narrower, so fighters must line up
 * closely to hit." A men cut comes straight down in front of her: it lands
 * on a kitten up to `reach` ahead of her along her facing and no more than
 * `lane` to either side of that line. The old test was a round reach with a
 * wide arc — a sideways kitten a sword's length off was hit by a cut that,
 * drawn, missed her by a body.
 */
export const KENDO_HIT = { reach: 3.2, lane: 0.9 };

/**
 * THE FIGHTING PLANE TURNS WITH THEM. Richard: "If the players move above or
 * below each other so the vertical strikes no longer line up with the
 * artwork, the camera rotates 90° after some time so they fight on the
 * correct plane. There are two camera directions to switch between." The
 * plane is one of the room's two axes; when the gap ACROSS it is bigger than
 * `gap` and bigger than the gap along it for `t` seconds, it becomes the
 * other one, and the lens turns to look across it (eased at `ease`).
 */
export const KENDO_TURN = { gap: 1.3, t: 1.0, ease: 3.2 };

/** The shortest signed turn from angle a to angle b. */
function turnTo(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * The lens yaw that looks ACROSS `axis` (a unit vector on the floor), so the
 * axis runs left-right on screen: of the two, the one nearest the game's own
 * -45° so the room is seen from the side it is always seen from. Pure.
 */
export function yawAcross(axis) {
  const y = Math.atan2(-axis.z, axis.x);
  const a = CAM_YAW + turnTo(CAM_YAW, y);
  const b = CAM_YAW + turnTo(CAM_YAW, y + Math.PI);
  return Math.abs(a - CAM_YAW) <= Math.abs(b - CAM_YAW) ? a : b;
}

/** How high the walls of a house stand while a match is watched in it. */
const HALF_WALL = 2.1;
const CAM_YAW = -Math.PI * 0.25;

function hexTexture(sp) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 6 + (k * Math.PI) / 3;
    g[k ? 'lineTo' : 'moveTo'](64 + Math.cos(a) * 58, 64 + Math.sin(a) * 58);
  }
  g.closePath();
  g.fillStyle = sp.colour;
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = '#fff';
  g.stroke();
  g.fillStyle = '#fff';
  g.font = 'bold 64px serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(sp.kanji, 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function menTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#1f2a44';
  g.beginPath(); g.ellipse(64, 66, 56, 58, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#c9ccd6';
  g.beginPath(); g.ellipse(64, 62, 38, 42, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#3a3f4a';
  g.lineWidth = 4;
  for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(26, 62 + k * 10); g.lineTo(102, 62 + k * 10); g.stroke(); }
  g.beginPath(); g.moveTo(64, 20); g.lineTo(64, 104); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Kendo {
  constructor(housing) {
    this.H = housing;
    this.gear = new Map(); // index → { men, shinai }
    this.kiai = [];
    this.cool = new Map();
    this.board = new Map(); // site → { name: ippons }
    this._men = null;
    this._hex = new Map();
    /** zone key → the match on that square (`_begin`). */
    this.bouts = new Map();
    /** seat → { key, mark, t, down } — on a seiza mark, kneeling or about to (`_seiza`). */
    this.kneel = new Map();
    this._boardEl = null;
  }

  /** The match she is FIGHTING in, or null. */
  boutOf(i) {
    for (const B of this.bouts.values()) if (B.a.index === i || B.b.index === i) return B;
    return null;
  }

  /** Her pad is the ceremony's, not hers: every beat but a live round. */
  holds(i) {
    const B = this.boutOf(i);
    return !!B && B.phase !== 'fight';
  }

  /**
   * THE MATCH'S CAMERA, for a pane: anybody in it fighting, or standing in a
   * room where a match is on. Closer than the house's own, and square to the
   * line between the two marks, so the fighters are left and right of the
   * screen. Richard: "maybe the camera should change or zoom in closer to the
   * players." Asked per pane, like the door shot, so the shared rig and every
   * stick in it turn together (housing.js `groupShot`).
   */
  shotFor(members) {
    const players = this.H.game.players ?? [];
    for (const B of this.bouts.values()) {
      const near = members.some((i) => {
        const q = players[i];
        if (!q) return false;
        if (q === B.a || q === B.b) return true;
        const z = this.zoneOf(q);
        return z?.key === B.key || B.zone.isle.roomAt?.(q.position.x, q.position.y, q.position.z)?.id === B.zone.room.id;
      });
      if (!near) continue;
      const { isle: I, room } = B.zone;
      const A = kendoArea(room);
      const c = I.roomLocal(room, A.cx, A.cz);
      const y = I.floorY(room);
      (B._cam ??= new THREE.Vector3()).set(c.x, y + 1.3, c.z);
      /* Looking ACROSS the fighting plane (`B.camYaw`, eased toward
         `B.wantYaw` in `_step`), so the two are left and right of the screen
         whichever of the room's two axes they are fighting along. `land` is
         where the turn ENDS — `Player._moveBasis` reads a fresh push through
         it, so a push started mid-turn is already a cardinal direction on the
         lens she is about to have. */
      return { centre: B._cam, aim: true, dist: Math.max(A.w, A.d) * 0.85 + 7, pitch: 0.7, yaw: B.camYaw, land: B.wantYaw };
    }
    return null;
  }

  /**
   * HALF-HEIGHT WALLS for a pane that is watching a match: the height to cut
   * that house's walls at, or null. Richard: "The walls of the dojo can be
   * faded to be half as high so the players can be seen better when they are
   * fighting." Read by `Housing.aimView`, which owns the cut.
   */
  halfWallFor(I, members) {
    const players = this.H.game.players ?? [];
    for (const B of this.bouts.values()) {
      if (B.zone.isle !== I) continue;
      const watching = members.some((i) => {
        const q = players[i];
        return q && (q === B.a || q === B.b || I.roomAt?.(q.position.x, q.position.y, q.position.z)?.id === B.zone.room.id);
      });
      if (watching) return I.floorY(B.zone.room) + HALF_WALL;
    }
    return null;
  }

  /* ------------------------------ the match ------------------------------ */

  /** The zone's two seiza marks, in the world (`kendoMarks`, house-local). */
  marksOf(zone) {
    const { isle: I, room } = zone;
    const y = I.floorY(room);
    return kendoMarks(room).map((m) => {
      const w = I.roomLocal(room, m.x, m.z);
      return new THREE.Vector3(w.x, y, w.z);
    });
  }

  /**
   * KNEELING TO START (`SEIZA`). A geared kitten standing still on a free
   * mark for `SEIZA.t` kneels on it, facing the other mark, and is held
   * there (`pinnedAt`) — a push of the stick stands her up again. The stick
   * is read off `padStick`, written by `Player.update` BEFORE a pin freezes
   * her pad, or a kneeling kitten could never ask to get up. Two kneeling on
   * one square's two marks: the match begins.
   */
  _seiza(dt, players) {
    const G = this.H.game;
    const byZone = new Map();
    for (const p of players) {
      if (!p) continue;
      const S = this.kneel.get(p.index);
      if (!this.geared(p) || this.boutOf(p.index)) { if (S) this._standUp(p, false); continue; }
      const z = this.zoneOf(p) ?? (S?.down ? S.zone : null);
      if (!z || this.bouts.has(z.key)) { if (S) this._standUp(p, false); continue; }
      const marks = this.marksOf(z);
      if (S?.down) {
        if ((p.padStick ?? 0) > SEIZA.still) { this._standUp(p, true); continue; }
        if (!byZone.has(z.key)) byZone.set(z.key, { zone: z, on: [] });
        byZone.get(z.key).on[S.mark] = p;
        continue;
      }
      // the free mark she is on, if any
      let k = -1;
      for (const [j, m] of marks.entries()) {
        if (Math.hypot(p.position.x - m.x, p.position.z - m.z) > SEIZA.r) continue;
        if ([...this.kneel.entries()].some(([i, o]) => i !== p.index && o.down && o.key === z.key && o.mark === j)) continue;
        k = j;
      }
      if (k < 0) {
        if (S) this.kneel.delete(p.index);
        if (!this._told?.has(p.index)) {
          (this._told ??= new Set()).add(p.index);
          G.toast(`${p.name}: stand on a WHITE CROSS and keep still to kneel in seiza — the match starts when both crosses are taken.`, p.index);
        }
        continue;
      }
      const still = (p.padStick ?? 0) <= SEIZA.still && Math.hypot(p.velocity?.x ?? 0, p.velocity?.z ?? 0) < 0.6;
      const t = still && S && S.key === z.key && S.mark === k ? S.t + dt : 0;
      this.kneel.set(p.index, { key: z.key, zone: z, mark: k, t, down: false });
      if (t >= SEIZA.t) {
        const m = marks[k];
        const o = marks[1 - k];
        this.kneel.set(p.index, { key: z.key, zone: z, mark: k, t, down: true });
        p.pinnedAt = (p.pinnedAt ?? new THREE.Vector3()).copy(m);
        p.position.copy(m);
        p.facing = Math.atan2(o.x - m.x, o.z - m.z);
        p.kendoStance = 'kneel';
        G.audio?.play?.('land');
        G.toast(`${p.name} kneels in seiza. Waiting for an opponent on the other cross… (push the stick to stand up)`, p.index);
        if (!byZone.has(z.key)) byZone.set(z.key, { zone: z, on: [] });
        byZone.get(z.key).on[k] = p;
      }
    }
    for (const { zone, on } of byZone.values()) {
      if (on[0] && on[1]) {
        for (const p of [on[0], on[1]]) this.kneel.delete(p.index);
        this._begin(zone, on[0], on[1]);
      }
    }
  }

  /** Up off her mark. `say` when it was her own push, so she knows how it went. */
  _standUp(p, say) {
    const S = this.kneel.get(p.index);
    this.kneel.delete(p.index);
    if (!S?.down) return;
    p.pinnedAt = null;
    p.kendoStance = null;
    if (say) this.H.game.toast(`${p.name} stands up. (Keep still on a cross to kneel again.)`, p.index);
  }

  _begin(zone, a, b) {
    const marks = this.marksOf(zone);
    const axis = new THREE.Vector3(marks[1].x - marks[0].x, 0, marks[1].z - marks[0].z).normalize();
    const B = {
      key: zone.key, zone, a, b, alongX: kendoMarks(zone.room)[0].alongX,
      marks,
      /* THE FIGHTING PLANE: the line the cuts land along, and the lens that
         looks across it. `axis0` is the marks' own, put back on every
         `_place`; `turnT` counts the time the two have stood across it. */
      axis, axis0: axis.clone(), turnT: 0,
      wantYaw: yawAcross(axis), camYaw: yawAcross(axis),
      phase: 'kneel', t: 0, turn: 0, step: 'grab',
      round: 1, clock: BOUT.roundT, pts: [0, 0], wins: [0, 0], out: [0, 0],
    };
    this.bouts.set(zone.key, B);
    /* NO KOTODAMA IN THE DOJO. "When kendo fighting, the players kotodama
       orbs should not be applied or used." Her orbs stay on her — this only
       takes away what they DO, and `_end` gives it back. */
    for (const p of [a, b]) {
      p.kendoBout = true;
      p.power = aggregate([]);
      p.kendoDodgeT = 0;
      p.kendoDodgeCool = 0;
    }
    this._place(B);
    this._stance(B, 'kneel');
    this._say(B, `${a.name} and ${b.name} kneel for a match — best of ${BOUT.rounds} rounds, ${BOUT.toWin} IPPONS take a round!`);
    this.H.game.audio?.play?.('gong');
  }

  /** Both on their marks, facing each other, held there — and the plane back to the marks'. */
  _place(B) {
    if (B.axis0) {
      B.axis.copy(B.axis0);
      B.turnT = 0;
      B.wantYaw = yawAcross(B.axis);
    }
    [B.a, B.b].forEach((p, k) => {
      const m = B.marks[k];
      const o = B.marks[1 - k];
      p.pinnedAt = (p.pinnedAt ?? new THREE.Vector3()).copy(m);
      p.position.copy(m);
      p.velocity?.set?.(0, 0, 0);
      p.facing = Math.atan2(o.x - m.x, o.z - m.z);
    });
  }

  _stance(B, s) { B.a.kendoStance = s; B.b.kendoStance = s; }

  /** To both fighters, and to anybody else standing in the room. */
  _say(B, text) {
    const G = this.H.game;
    const told = new Set([B.a.index, B.b.index]);
    for (const q of G.players ?? []) {
      if (q && !told.has(q.index) && B.zone.isle.roomAt?.(q.position.x, q.position.y, q.position.z)?.id === B.zone.room.id) told.add(q.index);
    }
    for (const i of told) G.toast(text, i);
  }

  _kiai(p) {
    const G = this.H.game;
    p.kiaiT = BOUT.kiai;
    G.audio?.play?.('kiai', 1, KIAI_PITCH[p.style?.name] ?? 1);
    this._showKiai(p, SPIRITS[p.style?.name] ?? SPIRITS.Ember);
  }

  _step(B, dt) {
    const G = this.H.game;
    B.t += dt;
    // the lens eases round to the plane (`KENDO_TURN.ease`); a still plane is a still lens
    if (Number.isFinite(B.wantYaw)) {
      B.camYaw += turnTo(B.camYaw, B.wantYaw) * (1 - Math.exp(-dt * KENDO_TURN.ease));
      if (Math.abs(turnTo(B.camYaw, B.wantYaw)) < 1e-3) B.camYaw = B.wantYaw;
      for (const p of [B.a, B.b]) p.kendoLandYaw = B.wantYaw;
    }
    const next = (phase) => { B.phase = phase; B.t = 0; };
    // somebody gone, or out of the gear: the match is off
    const players = G.players ?? [];
    for (const p of [B.a, B.b]) {
      if (players[p.index] !== p || !this.geared(p)) { this._end(B, `${p.name} left — the match is over.`); return; }
    }
    // the riposte and the facing are a live round's; every other beat, neither
    if (B.phase !== 'fight') for (const p of [B.a, B.b]) { p.kendoLive = false; p.kendoFace = null; }
    switch (B.phase) {
      case 'kneel':
        if (B.t >= BOUT.kneel) { next('rise'); B.turn = 0; B.step = 'grab'; }
        break;
      case 'rise': {
        /* TAKING TURNS: she reaches for the shinai beside her, stands, and
           shouts her kiai; then her opponent does. */
        const p = B.turn === 0 ? B.a : B.b;
        if (B.step === 'grab') {
          p.kendoStance = 'grab';
          if (B.t >= BOUT.grab) { B.step = 'stand'; B.t = 0; }
        } else if (B.step === 'stand') {
          p.kendoStance = null;
          if (B.t >= BOUT.stand) { B.step = 'kiai'; B.t = 0; this._kiai(p); }
        } else if (B.t >= BOUT.kiai) {
          if (B.turn === 0) { B.turn = 1; B.step = 'grab'; B.t = 0; } else next('bow');
        }
        break;
      }
      case 'bow':
        this._stance(B, 'bow');
        if (B.t >= BOUT.bow) {
          this._stance(B, null);
          next('hajime');
          this._say(B, `ROUND ${B.round} — HAJIME! (JUMP + a direction to dodge)`);
          G.audio?.play?.('count');
        }
        break;
      case 'hajime':
        if (B.t >= BOUT.hajime) {
          next('fight');
          for (const p of [B.a, B.b]) p.pinnedAt = null;
        }
        break;
      case 'fight': {
        B.clock = Math.max(0, B.clock - dt);
        this._plane(B, dt);
        // JOGAI: off the square for a moment is a warning; for long, the end
        for (const [k, p] of [B.a, B.b].entries()) {
          const z = this.zoneOf(p);
          B.out[k] = z?.key === B.key ? 0 : B.out[k] + dt;
          if (B.out[k] >= BOUT.jogai) { this._end(B, `${p.name} stepped off the square — the match is over.`); return; }
        }
        if (B.clock <= 0) this._roundOver(B, 'TIME!');
        break;
      }
      case 'yame':
        if (B.t >= BOUT.yame) {
          this._place(B);
          next('hajime');
          this._say(B, 'HAJIME!');
          G.audio?.play?.('count');
        }
        break;
      case 'roundEnd':
        if (B.t >= BOUT.roundEnd) {
          const need = Math.floor(BOUT.rounds / 2) + 1;
          if (B.wins[0] >= need || B.wins[1] >= need || B.round >= BOUT.rounds) {
            next('final');
            this._place(B);
            this._stance(B, 'bow');
            const [w0, w1] = B.wins;
            this._say(B, w0 === w1
              ? `A DRAW, ${w0}-${w1}! ${B.a.name} and ${B.b.name} bow to each other.`
              : `${(w0 > w1 ? B.a : B.b).name} WINS THE MATCH, ${Math.max(w0, w1)}-${Math.min(w0, w1)}! They bow to each other.`);
            G.audio?.play?.('victory');
          } else {
            B.round++;
            B.pts = [0, 0];
            B.clock = BOUT.roundT;
            this._place(B);
            next('hajime');
            this._say(B, `ROUND ${B.round} — HAJIME!`);
            G.audio?.play?.('count');
          }
        }
        break;
      case 'final':
        if (B.t >= BOUT.bow) this._end(B, null);
        break;
    }
  }

  /** A round is decided: two ippons, or the clock. */
  _roundOver(B, why) {
    const [p0, p1] = B.pts;
    if (p0 !== p1) B.wins[p0 > p1 ? 0 : 1]++;
    B.phase = 'roundEnd';
    B.t = 0;
    this._place(B);
    this._say(B, p0 === p1
      ? `${why} Round ${B.round} is a draw, ${p0}-${p1}. (Rounds: ${B.a.name} ${B.wins[0]} · ${B.b.name} ${B.wins[1]})`
      : `${why} ${(p0 > p1 ? B.a : B.b).name} takes round ${B.round}, ${Math.max(p0, p1)}-${Math.min(p0, p1)}! (Rounds: ${B.a.name} ${B.wins[0]} · ${B.b.name} ${B.wins[1]})`);
    this.H.game.audio?.play?.('endgong');
  }

  /** The match is over (or off): everything it took, given back. */
  _end(B, why) {
    for (const p of [B.a, B.b]) {
      p.kendoBout = false;
      p.kendoLive = false;
      p.kendoFace = null;
      p.kendoLandYaw = null;
      p.kendoStance = null;
      p.kendoDodgeT = 0;
      p.pinnedAt = null;
      p.power = aggregate(p.powerOrbs ?? []);
    }
    this.bouts.delete(B.key);
    if (why) this._say(B, why);
  }

  /** A clean hit in a live round: a point, and the referee stops it. */
  _boutIppon(B, a, t) {
    const k = B.a === a ? 0 : 1;
    B.pts[k]++;
    const G = this.H.game;
    G.audio?.play?.('perfect');
    const sp = SPIRITS[a.style?.name] ?? SPIRITS.Ember;
    this._showKiai(a, sp);
    if (B.pts[k] >= BOUT.toWin) { this._roundOver(B, `IPPON! ${a.name}'s ${sp.animal}!`); return; }
    B.phase = 'yame';
    B.t = 0;
    for (const p of [B.a, B.b]) p.pinnedAt = (p.pinnedAt ?? new THREE.Vector3()).copy(p.position);
    this._say(B, `IPPON! ${a.name}'s ${sp.animal}! YAME! (${B.a.name} ${B.pts[0]} · ${B.b.name} ${B.pts[1]})`);
  }

  /**
   * The scoreboard while a match is on, like the arena's — UNDER THE NAMES.
   * Richard, Oct 2026: "the dojo UI is above the players names, it should go
   * under it or somewhere else." It sat at a fixed top:10px with z-index 40,
   * which is exactly where `#hud .scoreboard` (the girls' name badges) lives,
   * and painted over them. Now its top is READ off the scoreboard's measured
   * bottom every frame — the badges grow a row with clan labels and on a
   * phone, so no fixed number is right — and the toasts, which hang from the
   * same edge, are pushed down under the board while it is up and handed back
   * to the stylesheet (`top = ''`) when it goes.
   */
  _board() {
    if (typeof document === 'undefined') return;
    const B = [...this.bouts.values()][0];
    const toasts = document.getElementById('toasts');
    if (!B) {
      if (this._boardEl && this._boardEl.style.display !== 'none') {
        this._boardEl.style.display = 'none';
        if (toasts) toasts.style.top = '';
      }
      return;
    }
    if (!this._boardEl) {
      const el = document.createElement('div');
      el.id = 'kendo-board';
      el.style.cssText = 'position:fixed;left:50%;top:64px;transform:translateX(-50%);z-index:4;'
        + 'pointer-events:none;background:rgba(20,18,28,.82);color:#fff6de;border:2px solid #e9c46a;border-radius:12px;'
        + 'padding:.35em .9em;font:700 clamp(12px,2.3vh,22px)/1.25 system-ui,sans-serif;text-align:center;white-space:nowrap;'
        + 'letter-spacing:.04em;text-shadow:0 1px 0 #000';
      document.body.appendChild(el);
      this._boardEl = el;
    }
    const dots = (n) => '●'.repeat(n) + '○'.repeat(Math.max(0, BOUT.toWin - n));
    const m = Math.floor(B.clock / 60);
    const s = String(Math.floor(B.clock % 60)).padStart(2, '0');
    const sig = [B.round, B.pts, B.wins, m, s, B.phase].join('|');
    if (sig !== this._boardSig) {
      this._boardSig = sig;
      this._boardEl.innerHTML = `剣道 ROUND ${B.round} of ${BOUT.rounds} · ${m}:${s}<br>`
        + `${B.a.name} ${dots(B.pts[0])} <span style="opacity:.7">(${B.wins[0]})</span> — `
        + `<span style="opacity:.7">(${B.wins[1]})</span> ${dots(B.pts[1])} ${B.b.name}`;
    }
    this._boardEl.style.display = '';
    const names = document.querySelector('#hud .scoreboard')?.getBoundingClientRect?.();
    const top = Math.round((names && names.height ? names.bottom : 54) + 6);
    if (this._boardEl.style.top !== `${top}px`) this._boardEl.style.top = `${top}px`;
    const below = this._boardEl.getBoundingClientRect().bottom + 8;
    if (toasts && below > 8) toasts.style.top = `${Math.round(below)}px`;
  }

  /**
   * The kendo room she is standing in, ON ITS AREA, or null. The area is the
   * whole fighting floor (catalog `kendoArea`): "The kendo match can use that
   * whole square. Going past the stairs or out the door ends the match" —
   * off it is JOGAI, and the area stops short of every stairwell.
   */
  zoneOf(p) {
    for (const I of this.H.isles) {
      const Hm = I.home;
      if (!Hm || !I.over(p.position.x, p.position.z)) continue;
      const room = I.roomAt(p.position.x, p.position.y, p.position.z);
      if (!room || Hm.rooms?.[room.id]?.type !== 'kendo') continue;
      const A = kendoArea(room);
      const L = I.houseOf(room).toLocal(p.position.x, p.position.z);
      if (Math.abs(L.x - A.cx) > A.w / 2 || Math.abs(L.z - A.cz) > A.d / 2) continue;
      return { isle: I, room, key: `${I.site.id}:${room.id}` };
    }
    return null;
  }

  geared(p) { return this.gear.has(p.index); }

  toggleGear(p) {
    const G = this.H.game;
    if (this.gear.has(p.index)) {
      this._unwear(p.index);
      G.toast(`${p.name} hangs the bogu back on the rack.`, p.index);
      return;
    }
    p.kendoGeared = true;
    if (p.kendoPose || p.kiaiPose || typeof document === 'undefined') {
      this.gear.set(p.index, { men: null, shinai: null, p });
      G.audio?.play?.('wardup');
      G.toast(`${p.name} puts on the bogu! Kneel on a WHITE CROSS for a match — a clean hit is IPPON!`, p.index);
      return;
    }
    this._men ??= menTexture();
    const men = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._men, transparent: true, depthTest: true }));
    // her own head's size, like the drawings (`KENDO_SCALE`)
    men.scale.set(1.5 * KENDO_SCALE, 1.5 * KENDO_SCALE, 1);
    const sg = new THREE.CylinderGeometry(0.05, 0.07, 2.4, 6);
    sg.rotateZ(Math.PI / 2.6);
    const shinai = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0xe8dcb0 }));
    G.scene.add(men);
    G.scene.add(shinai);
    this.gear.set(p.index, { men, shinai, p });
    G.audio?.play?.('wardup');
    G.toast(`${p.name} puts on the bogu! Kneel on a WHITE CROSS for a match — a clean hit is IPPON!`, p.index);
  }

  _unwear(i) {
    const g = this.gear.get(i);
    if (!g) return;
    g.p.kendoGeared = false;
    g.men?.parent?.remove(g.men);
    g.shinai?.parent?.remove(g.shinai);
    this.gear.delete(i);
  }

  kiaiBusy() { return false; }

  /**
   * ASKED BY `Game.strikePlayers` WHEN NO ROUND IS LIVE. True means "this
   * swing was a sparring swing and I have answered it". Both kittens geared,
   * both on the same taped square — anywhere else the answer is no and the
   * swing hits scenery as it always did.
   */
  sparStrike(attacker, kind, dir) {
    if (!this.geared(attacker)) return false;
    /* IN A MATCH, only a live round counts, and only against her opponent —
       the ceremony, the YAME and the bows are not openings. */
    const B = this.boutOf(attacker.index);
    if (B && B.phase !== 'fight') return true;
    // The kiai is drawn on every swing in the bogu, a hit or not.
    attacker.kiaiT = KIAI_T;
    const zone = this.zoneOf(attacker);
    if (!zone) return false;
    /* THE CUT IS VERTICAL: a lane straight out along her facing
       (`KENDO_HIT`), whatever the attack's own reach and arc are in the
       ring. `dir` is the swing's, which is her facing anyway; facing is read
       so a riposte, which turns her first, cuts where she now looks. */
    const fx = Math.sin(attacker.facing ?? Math.atan2(dir?.x ?? 0, dir?.y ?? 1));
    const fz = Math.cos(attacker.facing ?? Math.atan2(dir?.x ?? 0, dir?.y ?? 1));
    let landed = false;
    const answers = [];
    for (const t of this.H.game.players ?? []) {
      if (t === attacker || !this.geared(t)) continue;
      if (B && t !== B.a && t !== B.b) continue;
      // ...nor does a kitten in the middle of a match get hit from outside it
      if (!B && this.boutOf(t.index)) continue;
      // dodging: "immune to attacks during dodging"
      if (t.kendoDodgeT > 0) continue;
      const tz = this.zoneOf(t);
      if (!tz || tz.key !== zone.key) continue;
      const dx = t.position.x - attacker.position.x;
      const dz = t.position.z - attacker.position.z;
      const d = Math.hypot(dx, dz);
      const along = dx * fx + dz * fz;
      const lane = Math.abs(dx * fz - dz * fx);
      if (along < -0.3 || along > KENDO_HIT.reach || lane > KENDO_HIT.lane || Math.abs(t.position.y - attacker.position.y) > 2.2) continue;
      /* 返 RIPOSTE IN THE BOGU. Richard: "Riposte works on the opponent's
         attacks, with the same timing as the default riposte." Her guard up
         on this side catches the cut — no ippon — and she answers it, AFTER
         this loop, as `Game.strikePlayers` answers in the ring. */
      if (t.parries?.(attacker.position)) { answers.push(t); continue; }
      if ((this.cool.get(t.index) ?? 0) > 0) continue;
      this.cool.set(t.index, IPPON_COOL);
      // a shove, never damage
      const k = 9 / Math.max(0.5, d);
      t.velocity.x += dx * k * 0.6;
      t.velocity.z += dz * k * 0.6;
      if (B) {
        // a shove along the floor, never up — nobody leaves the square for it
        t.velocity.y = Math.max(t.velocity.y, 2);
        this._boutIppon(B, attacker, t);
        landed = true;
        break;
      }
      t.velocity.y = Math.max(t.velocity.y, 5);
      this._ippon(attacker, t, zone);
      landed = true;
    }
    const G = this.H.game;
    for (const t of answers) {
      G.toast?.(`${t.name} parried you — get round her guard!`, attacker.index);
      t.riposte?.(attacker, G);
    }
    return landed || true;
  }

  /**
   * THE PLANE, in a live round: who faces which way, and when the lens turns.
   * Both face along the plane, toward each other — "the two opponents face
   * each other" — whatever the stick says (`Player` reads `kendoFace` after
   * its own turn, and not while a parry has her). Across the plane for
   * `KENDO_TURN.t`, and the plane becomes the room's other axis.
   */
  _plane(B, dt) {
    const dx = B.b.position.x - B.a.position.x;
    const dz = B.b.position.z - B.a.position.z;
    const ax = B.axis;
    const along = dx * ax.x + dz * ax.z;
    const across = -dx * ax.z + dz * ax.x;
    if (Math.abs(across) > KENDO_TURN.gap && Math.abs(across) > Math.abs(along)) B.turnT += dt;
    else B.turnT = 0;
    if (B.turnT >= KENDO_TURN.t) {
      // a quarter turn: the room's other axis, pointing from a to b
      const s = Math.sign(across) || 1;
      B.axis.set(-ax.z * s, 0, ax.x * s);
      B.turnT = 0;
      B.wantYaw = yawAcross(B.axis);
    }
    const ax2 = B.axis;
    for (const [k, p] of [B.a, B.b].entries()) {
      const o = k ? B.a : B.b;
      const s = Math.sign((o.position.x - p.position.x) * ax2.x + (o.position.z - p.position.z) * ax2.z) || (k ? -1 : 1);
      p.kendoFace = Math.atan2(ax2.x * s, ax2.z * s);
      p.kendoLive = true;
    }
  }

  _ippon(a, t, zone) {
    const G = this.H.game;
    const b = (this.board.get(zone.key) ?? {});
    b[a.style.name] = (b[a.style.name] ?? 0) + 1;
    this.board.set(zone.key, b);
    G.audio?.play?.('perfect');
    const sp = SPIRITS[a.style.name] ?? SPIRITS.Ember;
    for (const q of [a, t]) G.toast(`IPPON! ${a.name}'s ${sp.animal} KIAI! (${a.name} ${b[a.style.name]} · ${t.name} ${b[t.style.name] ?? 0})`, q.index);
    this._showKiai(a, sp);
  }

  _showKiai(p, sp) {
    if (typeof document === 'undefined') return;
    let tex = this._hex.get(sp.kanji);
    if (!tex) { tex = hexTexture(sp); this._hex.set(sp.kanji, tex); }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    s.renderOrder = 20;
    this.H.game.scene.add(s);
    this.kiai.push({ s, p, t: 0 });
  }

  update(dt, players) {
    for (const [i, c] of this.cool) this.cool.set(i, c - dt);
    this._seiza(dt, players);
    for (const B of [...this.bouts.values()]) this._step(B, dt);
    this._board();
    for (const [i, g] of this.gear) {
      const p = players[i];
      // Leaving the house takes the gear off: it lives on the rack.
      if (!p || p !== g.p || !this.H.isles.some((I) => I.home && I.floorAt(p.position.x, p.position.y, p.position.z) >= 0)) {
        this._unwear(i);
        continue;
      }
      if (!g.men) continue;
      g.men.position.set(p.position.x, p.position.y + 2.2, p.position.z);
      const f = p.facing ?? 0;
      g.shinai.position.set(p.position.x + Math.sin(f) * 0.9, p.position.y + 1.3, p.position.z + Math.cos(f) * 0.9);
      g.shinai.rotation.y = f;
    }
    this.kiai = this.kiai.filter((k) => {
      k.t += dt;
      const s = Math.min(1, k.t * 6) * 1.6;
      k.s.scale.set(s, s, 1);
      k.s.position.set(k.p.position.x, k.p.position.y + 3.6 + k.t * 1.2, k.p.position.z);
      k.s.material.opacity = Math.max(0, 1 - Math.max(0, k.t - 0.7) * 2);
      if (k.t > 1.3) { k.s.parent?.remove(k.s); return false; }
      return true;
    });
  }
}
