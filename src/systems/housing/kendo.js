import * as THREE from 'three';
import { ATTACKS } from '../../entities/player.js';
import { aggregate } from '../../entities/powerorb.js';

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
  /** Both geared on one taped square this long, and the match begins. */
  gather: 1.2,
  kneel: 1.4,
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
    /** zone key → seconds two geared kittens have stood on it together. */
    this._gather = new Map();
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
      const c = I.roomLocal(room, room.cx, room.cz);
      const y = I.floorY(room);
      (B._cam ??= new THREE.Vector3()).set(c.x, y + 1.3, c.z);
      // the marks lie along the room's long axis; look across it
      let yaw = (I.houseOf(room)?.ry ?? I.ry) + (B.alongX ? 0 : Math.PI / 2);
      while (yaw - CAM_YAW > Math.PI) yaw -= Math.PI * 2;
      while (yaw - CAM_YAW < -Math.PI) yaw += Math.PI * 2;
      return { centre: B._cam, aim: true, dist: Math.max(room.w, room.d) * 0.85 + 7, pitch: 0.7, yaw };
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

  /** Two geared kittens on one square for BOUT.gather, and nobody fighting there. */
  _gatherUp(dt, players) {
    const on = new Map();
    for (const p of players) {
      if (!p || !this.geared(p) || this.boutOf(p.index)) continue;
      const z = this.zoneOf(p);
      if (!z || this.bouts.has(z.key)) continue;
      if (!on.has(z.key)) on.set(z.key, { zone: z, kits: [] });
      on.get(z.key).kits.push(p);
    }
    for (const key of [...this._gather.keys()]) if (!on.has(key) || on.get(key).kits.length < 2) this._gather.delete(key);
    for (const [key, { zone, kits }] of on) {
      if (kits.length < 2) continue;
      const t = (this._gather.get(key) ?? 0) + dt;
      this._gather.set(key, t);
      if (t >= BOUT.gather) {
        this._gather.delete(key);
        kits.sort((x, y) => x.index - y.index);
        this._begin(zone, kits[0], kits[1]);
        for (const q of kits.slice(2)) this.H.game.toast(`${q.name} — ${kits[0].name} and ${kits[1].name} are having a match. Yours is next!`, q.index);
      }
    }
  }

  _begin(zone, a, b) {
    const { isle: I, room } = zone;
    const alongX = room.w >= room.d;
    const off = Math.min((alongX ? room.w : room.d) / 2 - 2, 3.2);
    const y = I.floorY(room);
    const mark = (s) => {
      const w = I.roomLocal(room, room.cx + (alongX ? s * off : 0), room.cz + (alongX ? 0 : s * off));
      return new THREE.Vector3(w.x, y, w.z);
    };
    const B = {
      key: zone.key, zone, a, b, alongX,
      marks: [mark(-1), mark(1)],
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

  /** Both on their marks, facing each other, held there. */
  _place(B) {
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
    const next = (phase) => { B.phase = phase; B.t = 0; };
    // somebody gone, or out of the gear: the match is off
    const players = G.players ?? [];
    for (const p of [B.a, B.b]) {
      if (players[p.index] !== p || !this.geared(p)) { this._end(B, `${p.name} left — the match is over.`); return; }
    }
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

  /** The scoreboard over the screen while a match is on, like the arena's. */
  _board() {
    if (typeof document === 'undefined') return;
    const B = [...this.bouts.values()][0];
    if (!B) { if (this._boardEl) this._boardEl.style.display = 'none'; return; }
    if (!this._boardEl) {
      const el = document.createElement('div');
      el.id = 'kendo-board';
      el.style.cssText = 'position:fixed;left:50%;top:max(10px,1.6vh);transform:translateX(-50%);z-index:40;'
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
  }

  /** The kendo room she is standing in, on the tape, or null. */
  zoneOf(p) {
    for (const I of this.H.isles) {
      const Hm = I.home;
      if (!Hm || !I.over(p.position.x, p.position.z)) continue;
      const room = I.roomAt(p.position.x, p.position.y, p.position.z);
      if (!room || Hm.rooms?.[room.id]?.type !== 'kendo') continue;
      const L = I.houseOf(room).toLocal(p.position.x, p.position.z);
      if (Math.abs(L.x - room.cx) > room.w / 2 - 1.4 || Math.abs(L.z - room.cz) > room.d / 2 - 1.4) continue;
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
      G.toast(`${p.name} puts on the bogu! Spar on the red square — a clean hit is IPPON!`, p.index);
      return;
    }
    this._men ??= menTexture();
    const men = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._men, transparent: true, depthTest: true }));
    // 25% bigger, like the drawings (`KENDO_SCALE`)
    men.scale.set(1.875, 1.875, 1);
    const sg = new THREE.CylinderGeometry(0.05, 0.07, 2.4, 6);
    sg.rotateZ(Math.PI / 2.6);
    const shinai = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0xe8dcb0 }));
    G.scene.add(men);
    G.scene.add(shinai);
    this.gear.set(p.index, { men, shinai, p });
    G.audio?.play?.('wardup');
    G.toast(`${p.name} puts on the bogu! Spar on the red square — a clean hit is IPPON!`, p.index);
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
    const A = ATTACKS[kind] ?? ATTACKS.stand;
    const reach = (A.reach ?? 3) + 0.6;
    let landed = false;
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
      if (d > reach || Math.abs(t.position.y - attacker.position.y) > 2.2) continue;
      if (dir && d > 0.4 && (dx * dir.x + dz * dir.y) / d < (A.arc ?? -0.25)) continue;
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
        return true;
      }
      t.velocity.y = Math.max(t.velocity.y, 5);
      this._ippon(attacker, t, zone);
      landed = true;
    }
    return landed || true;
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
    this._gatherUp(dt, players);
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
