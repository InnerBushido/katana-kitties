import * as THREE from 'three';
import { ATTACKS } from '../../entities/player.js';

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
/** How long the kiai drawing is held after a swing in the bogu. */
export const KIAI_T = 0.4;

/** Each kitten's spirit animal, for the kiai — her hex badge. */
export const SPIRITS = {
  Ember: { animal: 'TIGER', kanji: '虎', colour: '#ff8a3d' },
  Frost: { animal: 'CRANE', kanji: '鶴', colour: '#ff6fae' },
  Storm: { animal: 'DRAGON', kanji: '龍', colour: '#35d7f0' },
  Blossom: { animal: 'FOX', kanji: '狐', colour: '#a96bff' },
};

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
  }

  /** The kendo room she is standing in, on the tape, or null. */
  zoneOf(p) {
    for (const I of this.H.isles) {
      const Hm = I.home;
      if (!Hm || !I.over(p.position.x, p.position.z)) continue;
      const room = I.roomAt(p.position.x, p.position.y, p.position.z);
      if (!room || Hm.rooms?.[room.id]?.type !== 'kendo') continue;
      const L = I.toLocal(p.position.x, p.position.z);
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
    men.scale.set(1.5, 1.5, 1);
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
    // The kiai is drawn on every swing in the bogu, a hit or not.
    attacker.kiaiT = KIAI_T;
    const zone = this.zoneOf(attacker);
    if (!zone) return false;
    const A = ATTACKS[kind] ?? ATTACKS.stand;
    const reach = (A.reach ?? 3) + 0.6;
    let landed = false;
    for (const t of this.H.game.players ?? []) {
      if (t === attacker || !this.geared(t)) continue;
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
    for (const [i, g] of this.gear) {
      const p = players[i];
      // Leaving the house takes the gear off: it lives on the rack.
      if (!p || p !== g.p || !this.H.isles.some((I) => I.home && I.floorAt(p.position.x, p.position.y, p.position.z) >= 0)) {
        this._unwear(i);
        continue;
      }
      if (!g.men) continue;
      g.men.position.set(p.position.x, p.position.y + 2.05, p.position.z);
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
