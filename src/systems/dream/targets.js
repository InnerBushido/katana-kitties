import * as THREE from 'three';
import { ATTACKS, BASE_REACH, COMBAT } from '../../entities/player.js';
import { triDmgK } from '../../entities/powerorb.js';
import { Billboard } from '../../core/gfx.js';
import { SIM, HOLO } from '../../world/simworld.js';
import { SimBar, holoFlicker } from './holo.js';

/* ---------------------------------------------------------------------------
   WHAT A KATANA CAN HIT IN THE SIMULATOR, AND WHAT CAN HIT HER BACK.

   NON-NEGOTIABLE 3, AND HOW THIS FILE KEEPS IT. `Game.strikePlayers` is the
   one gate on kittens hurting kittens and it answers no everywhere but a live
   round. In here there is never a live round — the tournament pulls everybody
   out of the simulator the moment it starts — so for a kitten in the sim that
   gate is replaced, through `simhud.js`, by `TrainingGate.strike`, which can
   only ever reach the holograms registered with it. It never sees a player
   and has no way to: it is handed `targets`, and a Player is never one.
   `world-check` asserts this file never says `hurt(` and never reads
   `players`.

   THE GEOMETRY IS THE REAL GATE'S, COPIED ON PURPOSE. Range is `A.reach`
   scaled by her clan and orbs exactly as `strikePlayers` scales it (claw and
   sweep excepted, as there), the height window is `COMBAT.strikeHeight`, the
   arc is `A.arc`. A dummy that answered to a different hitbox would teach a
   kitten a reach she does not have in the ring — and the Dream Dojo exists
   to teach her the one she does.

   NOTHING IN HERE IS MISCHIEF. Nothing is in `World.props`, nothing is
   `scored`, and every hologram stands itself back up — non-negotiable 4 is
   about the real town, and "Nothing you break in here is broken out there"
   is Lionheart's whole pitch.
--------------------------------------------------------------------------- */

export const toWorld = (x, y, z) => new THREE.Vector3(x + SIM.dx, y, z + SIM.dz);

/** Kinds of attack, grouped the way a drill asks about them. */
export const SLASH_KINDS = ['stand', 'dash', 'air', 'tri'];

/* ------------------------------- the gate -------------------------------- */

export class TrainingGate {
  constructor() {
    /** Every live hologram that can be struck. */
    this.targets = new Set();
    /** Every hologram that can be MARKED — `_arenaTargetFor`'s list in here. */
    this.fighters = [];
    /** One per call: "most cut in ONE swing" needs to know which blows were
     *  the same swing, and a Cross Slash is three calls, so three swings. */
    this.swing = 0;
  }

  add(t) {
    this.targets.add(t);
    if (t.fighter && !this.fighters.includes(t)) this.fighters.push(t);
    return t;
  }

  remove(t) {
    this.targets.delete(t);
    const i = this.fighters.indexOf(t);
    if (i >= 0) this.fighters.splice(i, 1);
  }

  /**
   * Her blade, dive, charge, breath or sweep, reaching the holograms.
   * Same signature as `Game.strikePlayers`, because it is called in its place.
   *
   * @returns {number} how many it reached
   */
  strike(attacker, kind, reach, dir, spent = null) {
    const A = ATTACKS[kind] ?? ATTACKS.stand;
    const clanK = (kind === 'claw' || kind === 'sweep') ? 1 : reach / BASE_REACH;
    const range = A.reach * clanK;
    const swing = ++this.swing;
    let n = 0;
    const dmg = (A.dmg ?? ATTACKS.stand.dmg) * (kind === 'tri' ? triDmgK(attacker) : 1);
    const one = (t, dx, dz, dist) => {
      const k = dist > 1e-3 ? 1 / dist : 0;
      if (!t.hit({ attacker, kind, dmg, dist, swing, dir: { x: dx * k, z: dz * k } })) return false;
      spent?.add?.(t);
      n++;
      return true;
    };
    const solo = [];
    for (const t of [...this.targets]) {
      if (!t.live) continue;
      if (t.owner != null && t.owner !== attacker.index) continue;
      if (spent?.has?.(t)) continue;
      const dx = t.position.x - attacker.position.x;
      const dz = t.position.z - attacker.position.z;
      const dy = t.position.y - attacker.position.y;
      const dist = Math.hypot(dx, dz);
      if (dist > range + t.pad) continue;
      if (dy > COMBAT.strikeHeight + t.hitUp || -dy > COMBAT.strikeHeight + t.hitDown) continue;
      const dot = dist > 1e-3 ? (dx * dir.x + dz * dir.y) / dist : 1;
      // A target may ask to be AIMED at, with a narrower cone than the blow's own.
      if (dot < (t.o.aimArc ?? A.arc)) continue;
      if (t.o.onePerSwing) { solo.push({ t, dx, dz, dist, dot }); continue; }
      one(t, dx, dz, dist);
    }
    /* ONE PER SWING, AND THE ONE SHE AIMED AT. Richard, Oct 2026, on the Cross
       Slash drill: "Let's make it that only 1 target can get hit per swing".
       Every target that asks (`onePerSwing`) is a candidate, and the cut lands
       on the one nearest the line it was thrown along — not on whichever was
       built first, which would make "which one broke" a fact about the drill's
       code rather than about her stick. A refusal (a tap on a post that wants
       the Cross Slash) still rocks it and says why, and the cut moves on. */
    solo.sort((a, b) => b.dot - a.dot);
    for (const s of solo) if (one(s.t, s.dx, s.dz, s.dist)) break;
    return n;
  }
}

/* -------------------------------- shards --------------------------------- */

const SHARD_VERT = /* glsl */`
  attribute float aLife;
  attribute vec3 aColor;
  varying float vLife;
  varying vec3 vColor;
  void main() {
    vLife = aLife;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = (aLife > 0.0 ? 7.0 : 0.0) * (60.0 / max(1.0, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;
const SHARD_FRAG = /* glsl */`
  varying float vLife;
  varying vec3 vColor;
  void main() {
    if (vLife <= 0.0) discard;
    vec2 c = abs(gl_PointCoord - 0.5);
    if (max(c.x, c.y) > 0.42) discard;
    gl_FragColor = vec4(vColor * (0.6 + vLife), min(1.0, vLife * 1.6));
  }
`;

/**
 * The pixels a hologram breaks into. One pooled `Points`, so a drill full of
 * breaking targets is one draw call however many go at once.
 */
export class Shards {
  constructor(parent, max = 900) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.col = new Float32Array(max * 3);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      vertexShader: SHARD_VERT, fragmentShader: SHARD_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 12;
    parent.add(this.points);
    this.live = 0;
  }

  /** A burst at a LOCAL (layer) point. */
  burst(x, y, z, colour = HOLO.cyan, n = 40, speed = 7, up = 4) {
    const c = new THREE.Color(colour);
    for (let i = 0; i < n; i++) {
      const k = this.next;
      this.next = (this.next + 1) % this.max;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.pos[k * 3] = x + (Math.random() - 0.5) * 0.6;
      this.pos[k * 3 + 1] = y + Math.random() * 1.6;
      this.pos[k * 3 + 2] = z + (Math.random() - 0.5) * 0.6;
      this.vel[k * 3] = Math.cos(a) * s;
      this.vel[k * 3 + 1] = up * (0.4 + Math.random());
      this.vel[k * 3 + 2] = Math.sin(a) * s;
      this.life[k] = 0.7 + Math.random() * 0.5;
      this.col[k * 3] = c.r; this.col[k * 3 + 1] = c.g; this.col[k * 3 + 2] = c.b;
    }
    this.live = 2;
  }

  update(dt) {
    if (this.live <= 0) return;
    this.live -= dt;
    for (let k = 0; k < this.max; k++) {
      if (this.life[k] <= 0) continue;
      this.life[k] -= dt;
      this.vel[k * 3 + 1] -= 14 * dt;
      this.pos[k * 3] += this.vel[k * 3] * dt;
      this.pos[k * 3 + 1] += this.vel[k * 3 + 1] * dt;
      this.pos[k * 3 + 2] += this.vel[k * 3 + 2] * dt;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aLife.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
  }
}

/* ------------------------------- targets --------------------------------- */

export const holoMat = (colour, opacity = 0.55) => new THREE.MeshBasicMaterial({
  color: colour, transparent: true, opacity, depthWrite: false, toneMapped: false,
  blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});
const edgeMat = (colour) => new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: 0.95, toneMapped: false });

/** A wireframe shell plus a soft fill: the look of everything solid in here. */
export function holoSolid(geo, colour, fill = 0.22) {
  const grp = new THREE.Group();
  const m = new THREE.Mesh(geo, holoMat(colour, fill));
  m.material.userData.base = fill;
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), edgeMat(colour));
  grp.add(m, e);
  grp.userData.mats = [m.material, e.material];
  return grp;
}

/**
 * Anything a katana can find in here. Positioned in the layer's own (real-
 * world) coordinates; `position` is the world point the gate measures.
 */
export class Target {
  /**
   * @param {object} o
   * @param {THREE.Object3D} o.parent   usually `sim.root`
   * @param {number} o.x o.y o.z         layer coordinates of its FOOT
   * @param {number|null} [o.owner]       player index, or null for anybody
   * @param {number} [o.hits]             how many blows it takes
   * @param {string[]|null} [o.kinds]     the only attacks it answers to
   * @param {Function} [o.refuse]         (info) => toast text, when a kind is refused
   */
  constructor(o) {
    this.o = o;
    this.owner = o.owner ?? null;
    this.local = new THREE.Vector3(o.x, o.y, o.z);
    this.position = toWorld(o.x, o.y + (o.centre ?? 1.2), o.z);
    this.pad = o.pad ?? 0.6;
    this.hitUp = o.hitUp ?? 1;
    this.hitDown = o.hitDown ?? 1;
    this.maxHits = o.hits ?? 1;
    this.hp = this.maxHits;
    this.kinds = o.kinds ?? null;
    this.name = o.name ?? 'the hologram';
    this.colour = o.colour ?? HOLO.cyan;
    this.live = true;
    this.ko = false;
    this.angel = false;
    this.flash = 0;
    this.wob = 0;
    this.wobV = 0;
    this.wobDir = { x: 0, z: 1 };
    this.t = Math.random() * 6;
    this.group = new THREE.Group();
    this.group.position.copy(this.local);
    o.parent?.add(this.group);
    this.body = new THREE.Group();
    this.group.add(this.body);
    /* RICHARD'S RULE FOR BARS: "if weaker (3 hits or less to defeat) probably
       no health bar needed". So it is a fact about the target, not a flag a
       drill remembers to set. */
    if (this.maxHits > 3) {
      this.bar = new SimBar({ w: 2.0, h: 0.22, color: 0xff5a6a });
      this.bar.position.y = (o.barY ?? 3.4);
      this.group.add(this.bar);
    }
  }

  /** The gate found it. Returns whether the blow counted. */
  hit(info) {
    if (!this.live) return false;
    /* REFUSED, AND SHE IS TOLD WHY (non-negotiable 6). A tile rocking under
       a sword is the drill saying "not like that", and `onRefuse` is where
       the drill says how instead. */
    if ((this.kinds && !this.kinds.includes(info.kind)) || (this.o.accept && !this.o.accept(info, this))) {
      this.flash = 0.25;
      this.wobV += 2;
      this.o.onRefuse?.(this, info);
      return false;
    }
    this.hp -= 1;
    this.flash = 1;
    this.wobDir = info.dir;
    this.wobV += 7;
    this.o.onHit?.(this, info);
    if (this.hp <= 0) this.breakNow(info);
    return true;
  }

  breakNow(info = null) {
    if (!this.live) return;
    this.live = false;
    this.group.visible = false;
    this.o.shards?.burst(this.local.x, this.local.y, this.local.z, this.colour, 46);
    this.o.onBreak?.(this, info);
  }

  /** Move it, foot and all — the Cross Slash drill's circling posts. The
   *  gate measures `position`, so that moves with what is drawn. */
  moveTo(x, y, z) {
    this.local.set(x, y, z);
    this.group.position.copy(this.local);
    this.position.set(x + SIM.dx, y + (this.o.centre ?? 1.2), z + SIM.dz);
  }

  /** Stand it back up — everything in here does. */
  revive() {
    this.live = true;
    this.hp = this.maxHits;
    this.group.visible = true;
    this.o.shards?.burst(this.local.x, this.local.y, this.local.z, this.colour, 16, 2, 6);
  }

  dispose() {
    this.live = false;
    this.group.removeFromParent();
  }

  update(dt) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 3);
    // A spring, so a struck post rocks and settles instead of snapping.
    this.wobV += (-this.wob * 60 - this.wobV * 7) * dt;
    this.wob += this.wobV * dt;
    this.body.rotation.x = this.wobDir.z * this.wob * 0.08;
    this.body.rotation.z = -this.wobDir.x * this.wob * 0.08;
    /* `fade` is a target not here yet: the Cross Slash drill's next post,
       showing where it will be before it can be cut. 1 is all there. */
    const fade = this.fade ?? 1;
    for (const m of this.body.userData.mats ?? []) {
      m.opacity = ((m.isLineBasicMaterial ? 0.95 : (m.userData.base ?? 0.22)) + this.flash * 0.6) * fade;
    }
    if (this.bar) this.bar.setFrac(this.hp / this.maxHits, dt);
  }

  faceCamera(camera) {
    this.bar?.faceCamera(camera);
  }
}

/** A makiwara: a straw post on a peg, the thing a dojo cuts. */
export class Post extends Target {
  constructor(o) {
    super({ centre: 1.3, ...o });
    const g = new THREE.CylinderGeometry(0.42, 0.46, 2.6, 14, 4);
    g.translate(0, 1.3, 0);
    const solid = holoSolid(g, this.colour);
    this.body.add(solid);
    this.body.userData.mats = solid.userData.mats;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 6, 24), holoMat(HOLO.magenta, 0.8));
    band.rotation.x = Math.PI / 2;
    band.position.y = 1.7;
    this.body.add(band);
    const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.18, 18), holoMat(this.colour, 0.35));
    peg.position.y = 0.09;
    this.group.add(peg);
  }
}

/**
 * A cane of holo-bamboo. Answers to the BLADE and to nothing else — the same
 * rule the real grove keeps ("Bamboo answers to the katana and nothing else —
 * not a dive-bomb, not dragon breath", prop.js), because a simulator that let
 * a dive fell bamboo would be teaching a move that does not work outside.
 */
export const BLADE_KINDS = ['stand', 'dash', 'air', 'tri', 'charge', 'sweep'];
export class Cane extends Target {
  constructor(o) {
    super({ kinds: BLADE_KINDS, centre: 1.6, hitUp: 1.6, pad: 0.4, colour: 0x6dffb0, ...o });
    const h = o.height ?? 4.2;
    const g = new THREE.CylinderGeometry(0.2, 0.24, h, 8, 5);
    g.translate(0, h / 2, 0);
    const solid = holoSolid(g, this.colour, 0.3);
    this.body.add(solid);
    this.body.userData.mats = solid.userData.mats;
    for (let k = 1; k < 5; k++) {
      const node = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.04, 5, 14), holoMat(this.colour, 0.9));
      node.rotation.x = Math.PI / 2;
      node.position.y = (h * k) / 5;
      this.body.add(node);
    }
  }
}

/** A floor tile with a crack in it. Answers to a dive and to nothing else. */
export class Tile extends Target {
  constructor(o) {
    super({ kinds: ['dive'], centre: 0.2, hitUp: 3, hitDown: 3, pad: 1.0, ...o });
    const g = new THREE.CylinderGeometry(1.5, 1.5, 0.35, 6);
    g.translate(0, 0.18, 0);
    const solid = holoSolid(g, this.colour, 0.3);
    this.body.add(solid);
    this.body.userData.mats = solid.userData.mats;
    // The crack, so a kid knows which ones are the drill.
    const pts = [];
    let x = -1.1;
    let z = -0.2;
    for (let i = 0; i < 7; i++) {
      pts.push(new THREE.Vector3(x, 0.37, z));
      x += 0.36;
      z = (i % 2 ? -0.25 : 0.25) + Math.sin(i * 1.7) * 0.15;
    }
    this.body.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), edgeMat(HOLO.magenta)));
  }
}

/** An upright tatami panel. A charge goes through it; a swing only rocks it. */
export class Mat extends Target {
  constructor(o) {
    super({ kinds: ['charge'], centre: 1.3, pad: 0.9, ...o });
    const g = new THREE.BoxGeometry(2.4, 2.6, 0.3);
    g.translate(0, 1.3, 0);
    const solid = holoSolid(g, this.colour, 0.3);
    this.body.add(solid);
    this.body.userData.mats = solid.userData.mats;
    if (o.yaw != null) this.group.rotation.y = o.yaw;
  }
}

/**
 * A holo-kitten — a sparring partner made of light. The only target a mark
 * (盗) or a Flash Step lock can choose, because it is the only one shaped like
 * somebody: `fighter: true` puts it on `TrainingGate.fighters`, which is the
 * `players` list `simhud.js` hands the kitten's own targeting.
 */
export class HoloKitten extends Target {
  constructor(o) {
    super({ centre: 1.4, hitUp: 1.2, pad: 0.8, ...o });
    this.fighter = true;
    this.name = o.name ?? 'the holo-kitten';
    /** Something to steal — only ever holo-orbs, never one of hers. */
    this.powerOrbs = o.orbs ?? [];
    const spec = o.spec;
    if (spec?.texture) {
      this.sprite = new Billboard(spec.texture, spec.opts);
      this.sprite.mat.color.set(o.tint ?? 0x7ff4ff);
      this.sprite.mat.transparent = true;
      this.sprite.mat.opacity = 0.82;
      this.body.add(this.sprite);
    } else {
      const g = new THREE.CapsuleGeometry(0.6, 1.2, 4, 10);
      g.translate(0, 1.2, 0);
      const solid = holoSolid(g, this.colour);
      this.body.add(solid);
      this.body.userData.mats = solid.userData.mats;
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 32).rotateX(-Math.PI / 2), holoMat(this.colour, 0.7));
    ring.position.y = 0.05;
    this.group.add(ring);
    /* A BLADE, so a blow is something she SEES coming. Richard, Oct 2026:
       "For Riposte, let's have the enemy swing a sword once they get near the
       player." The sprite is a billboard and cannot turn toward her, so the
       sword is a 3-D thing of its own on a shoulder pivot: `aimAt` turns it,
       `swordPose` raises and swings it. Hidden until a drill asks. */
    this.swordPivot = new THREE.Group();
    this.swordPivot.position.y = 1.55;
    this.swordPivot.rotation.order = 'YXZ';
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.7, 0.03).translate(0, 0.95, 0), holoMat(0xffffff, 0.9));
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.8, 0.08).translate(0, 0.95, 0), holoMat(o.swordColour ?? 0xff5a6a, 0.45));
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.12), holoMat(HOLO.gold, 0.9));
    const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08).translate(0, -0.15, 0), holoMat(HOLO.gold, 0.7));
    this.swordBlade = new THREE.Group();
    this.swordBlade.position.x = 0.45;
    this.swordBlade.add(blade, glow, guard, hilt);
    this.swordPivot.add(this.swordBlade);
    this.swordPivot.visible = false;
    for (const m of [blade, glow, guard, hilt]) m.renderOrder = 24;
    this.group.add(this.swordPivot);
  }

  /** Turn the sword (and shield) toward a layer point. */
  aimAt(x, z) {
    const g = this.group.position;
    this.yaw = Math.atan2(x - g.x, z - g.z);
    this.swordPivot.rotation.y = this.yaw;
  }

  /**
   * The blade's pose. `raise` 0..1 lifts it back over the shoulder (the
   * tell); `swing` 0..1 brings it over and down in front (the blow). Rest is
   * held low and forward. Angles about the shoulder: +X tips the blade
   * toward where it faces.
   */
  swordPose(raise = 0, swing = 0) {
    this.swordPivot.visible = true;
    const REST = 1.9;
    const UP = -0.75;
    const DOWN = 2.3;
    const a = swing > 0 ? UP + (DOWN - UP) * Math.min(1, swing) : REST + (UP - REST) * Math.min(1, raise);
    this.swordPivot.rotation.x = a;
  }

  /**
   * A shield of light in front of it, facing `shieldYaw` — the Flash Step
   * drill's last level. Built on first ask. Returns the shield group.
   */
  shield(on = true) {
    if (!this.shieldGrp && on) {
      const g = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1.3, 32), holoMat(0x7ff4ff, 0.32));
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.07, 6, 40), holoMat(0xffffff, 0.9));
      // A round shield held up in front: its face looks along +Z, the way it faces.
      const arc = new THREE.Group();
      arc.add(disc, rim);
      arc.position.set(0, 1.4, 0.95);
      g.add(arc);
      for (const m of [disc, rim]) m.renderOrder = 25;
      this.shieldGrp = g;
      this.group.add(g);
    }
    if (this.shieldGrp) this.shieldGrp.visible = on;
    return this.shieldGrp;
  }

  update(dt) {
    super.update(dt);
    if (this.sprite) {
      // A gentle flicker, not a blink — see `holoFlicker`.
      this.sprite.mat.opacity = holoFlicker(this.t) + this.flash * 0.18;
      this.sprite.mat.color.setHex(this.flash > 0.3 ? 0xffffff : (this.o.tint ?? 0x7ff4ff));
    }
    // Its position follows its group, for the gate and for a mark's ring.
    this.position.set(this.group.position.x + SIM.dx, this.group.position.y + 1.4, this.group.position.z + SIM.dz);
  }

  faceCamera(camera) {
    super.faceCamera(camera);
    this.sprite?.faceCamera(camera);
  }
}

/* ------------------------- things she touches ---------------------------- */

/** A ring to run through. `onPass(p)` once per kitten it is armed for. */
export class GateRing {
  constructor({ parent, x, y, z, yaw = 0, r = 2.2, colour = HOLO.cyan, owner = null, onPass }) {
    this.local = new THREE.Vector3(x, y, z);
    this.owner = owner;
    this.r = r;
    this.onPass = onPass;
    this.armed = true;
    this.group = new THREE.Group();
    this.group.position.set(x, y + r, z);
    this.group.rotation.y = yaw;
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.12, 8, 40), holoMat(colour, 0.9));
    this.group.add(this.ring);
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(r * 0.95, 32), holoMat(colour, 0.08));
    this.group.add(this.disc);
    parent.add(this.group);
    this.t = 0;
  }

  setColour(c) {
    this.ring.material.color.set(c);
    this.disc.material.color.set(c);
  }

  /** Is she through it? Measured in the layer. */
  test(p) {
    if (!this.armed) return false;
    if (this.owner != null && p.index !== this.owner) return false;
    const x = p.position.x - SIM.dx;
    const z = p.position.z - SIM.dz;
    const d = Math.hypot(x - this.local.x, z - this.local.z);
    const dy = p.position.y - this.local.y;
    return d < this.r * 0.9 && dy > -1 && dy < this.r * 2;
  }

  update(dt, players) {
    this.t += dt;
    this.ring.rotation.z += dt * (this.armed ? 1.2 : 0.2);
    this.disc.material.opacity = this.armed ? 0.08 + 0.06 * Math.sin(this.t * 4) : 0.02;
    if (!this.armed) return;
    for (const p of players) {
      if (this.test(p)) { this.armed = false; this.onPass?.(p, this); break; }
    }
  }

  dispose() { this.group.removeFromParent(); }
}

/** A star to reach — on top of something, usually. */
export class HoloStar {
  /**
   * @param {number} [o.lock]  seconds it refuses EVERYBODY before it can be
   *   taken — a knocked-loose orb's `STEAL.lock`, the same four seconds the
   *   real ring keeps. A ring on the floor closes in as it runs out.
   * @param {object[]} [o.rivals]  holo-figures that may take it too (anything
   *   with a layer-space `group.position`). `onTake` is handed whichever got
   *   there first, so a drill can tell her from them.
   */
  constructor({ parent, x, y, z, owner = null, colour = HOLO.gold, onTake, lock = 0, rivals = [], reach = 1.5, floorY = null }) {
    this.local = new THREE.Vector3(x, y, z);
    /** How near (flat) she must come. 1.5 is a walk-up; a prize in the air
     *  that she reaches by a TELEPORT is passed over in no frames at all, so
     *  the Flash Step drill's floating one is wider. */
    this.reach = reach;
    this.owner = owner;
    this.onTake = onTake;
    this.taken = false;
    this.lockT = lock;
    this.lock0 = lock;
    this.rivals = rivals;
    this.group = new THREE.Group();
    this.group.position.set(x, y + 1.0, z);
    const g = new THREE.OctahedronGeometry(0.6, 0);
    const solid = holoSolid(g, colour, 0.5);
    this.solid = solid;
    this.group.add(solid);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.25, 14, 8, 1, true), holoMat(colour, 0.18));
    beam.position.y = 7;
    this.group.add(beam);
    parent.add(this.group);
    /* ITS SHADOW. Richard, Oct 2026: "Give the lasers and the pickups
       shadows or depth so their placement reads." A dark disc on the floor
       straight under it, smaller and fainter the higher it floats — so a
       star in the air reads as "over THERE, this high", like a beam's
       footprint does. `floorY` is the drill's floor; without one, its own foot. */
    const fy = floorY ?? y;
    const lift = Math.max(0, y + 1.0 - fy);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.75, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: Math.max(0.22, 0.55 - lift * 0.07), depthWrite: false, toneMapped: false }));
    this.shadow.position.set(x, fy + 0.04, z);
    this.shadow.scale.setScalar(Math.max(0.55, 1 - lift * 0.08));
    this.shadow.renderOrder = LASER_ORDER - 2;
    parent.add(this.shadow);
    /* THE LOCK, DRAWN. A grey ring on the floor that shrinks onto the orb as
       the seconds run out — "wait" said without a word, in the place both of
       them are looking. It is a sibling of the group, so it does not bob. */
    if (lock > 0) {
      this.lockRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 40).rotateX(-Math.PI / 2), holoMat(0x9aa4b4, 0.75));
      this.lockRing.position.set(x, y + 0.06, z);
      parent.add(this.lockRing);
    }
    this.t = 0;
  }

  /** Can anybody take it yet? */
  get locked() { return this.lockT > 0; }

  update(dt, players) {
    this.t += dt;
    this.group.rotation.y += dt * (this.locked ? 0.6 : 2);
    this.group.position.y = this.local.y + 1.0 + Math.sin(this.t * 2.2) * 0.2;
    if (this.taken) return;
    if (this.lockT > 0) {
      this.lockT = Math.max(0, this.lockT - dt);
      const k = this.lockT / Math.max(this.lock0, 1e-6);
      if (this.lockRing) {
        this.lockRing.scale.setScalar(0.6 + 2.4 * k);
        this.lockRing.visible = k > 0;
      }
      this.solid.scale.setScalar(this.locked ? 0.75 : 1);
      if (this.locked) return;
    }
    // HER FIRST, then the rivals: a dead heat on the same frame is hers.
    for (const p of players) {
      if (this.owner != null && p.index !== this.owner) continue;
      const x = p.position.x - SIM.dx;
      const z = p.position.z - SIM.dz;
      if (Math.hypot(x - this.local.x, z - this.local.z) < this.reach && Math.abs(p.position.y - this.local.y) < 2.2) {
        this._take(p);
        return;
      }
    }
    for (const r of this.rivals) {
      if (!r?.group || r.live === false) continue;
      const q = r.group.position;
      if (Math.hypot(q.x - this.local.x, q.z - this.local.z) < 1.5) { this._take(r); return; }
    }
  }

  _take(who) {
    this.taken = true;
    this.group.visible = false;
    if (this.shadow) this.shadow.visible = false;
    if (this.lockRing) this.lockRing.visible = false;
    this.onTake?.(who, this);
  }

  dispose() { this.group.removeFromParent(); this.lockRing?.removeFromParent(); this.shadow?.removeFromParent(); }
}

/* -------------------------------- hazards -------------------------------- */

/* WHERE A BEAM IS, MADE READABLE. Richard, Oct 2026: "it is very hard to see
   where the lazers are relative to where the player is. The lazers seem to
   not have any shadows and are shown, even when they are below the ground
   ... make it that they are faded when under the ground ... Seems that they
   lazers are appearing behind the yellow circle ... seems like a shader
   layering issue ... It looks like the lazer is behind the player, but should
   likely be infront of the player in terms of layering." Three things:
     · LASER_ORDER: drawn after the floor's circles and her sprite. A beam was
       a default-order transparent sorted by its MIDDLE, which for a beam
       from the circle's centre is further than the circle's rim and further
       than her — so both painted over it.
     · its FOOTPRINT: a dark band and a thin line of its colour straight under
       it on the floor (`floorY`), so a beam at shin height reads as "this
       far off the floor, here" from a lens that is looking down at it.
     · UNDER THE FLOOR, FAINT: the beam's own shader drops to UNDER_ALPHA of
       itself below `floorY` (per fragment, by world height) — still there, so
       a beam passing under a deck is not a beam that vanished. */
/* ...and UNDER HER UI. Richard, Oct 2026, on the Flash Step drill: "The
   lasers draw in front of the player UI and make text hard to read." Her
   name, health bar and marks are `depthTest: false` at 20-25 (player.js,
   label.js), and a beam at 30 was drawn over all of them. 16 is still after
   the floor's circles (12-15) and her sprite (0), which is what the first
   fix was for. */
export const LASER_ORDER = 16;
/* REDDER AND DIMMER. Richard: "too bright: make them more red, less pink or
   white, and dimmer." The glow was 0xff3b6b (pink) pulsing 0.30-0.60 over a
   WHITE core at 0.9 — additive, so where the beams crossed it burned to
   white. Now a red glow pulsing LASER_GLOW.lo-hi round a hot-red core. */
export const LASER_COLOUR = 0xd8261c;
export const LASER_CORE = { colour: 0xff6a4a, opacity: 0.5 };
export const LASER_GLOW = { mid: 0.3, swing: 0.08, warm: 0.12 };
export const UNDER_ALPHA = 0.22;
const BEAM_VERT = /* glsl */`
  varying float vY;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vY = w.y;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const BEAM_FRAG = /* glsl */`
  uniform vec3 uColour;
  uniform float uOpacity;
  uniform float uFloor;
  varying float vY;
  void main() {
    float under = vY < uFloor - 0.02 ? ${UNDER_ALPHA.toFixed(2)} : 1.0;
    gl_FragColor = vec4(uColour, uOpacity * under);
  }
`;
function beamMat(colour, opacity, floorY) {
  const m = new THREE.ShaderMaterial({
    vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG,
    uniforms: { uColour: { value: new THREE.Color(colour) }, uOpacity: { value: opacity }, uFloor: { value: floorY ?? -1e6 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
  return m;
}

/**
 * A beam of light that hurts — the SIM bar, never her. A segment from `a` to
 * `b` (layer coordinates, {x, y, z}), optionally moved every frame by
 * `move(t, seg)`, which may rewrite `seg.a` / `seg.b`.
 *
 * WHAT A HIT IS: the segment passes within `thick` of her body's vertical
 * span (feet to `p.height`), measured in 3-D. So a beam at shin height is
 * jumped, a beam at head height is ducked by... nothing — there is no duck —
 * which is why the gauntlets keep their beams low, and the beams that cannot
 * be jumped are the ones you are meant to block or Flash-Step.
 */
export class Laser {
  constructor({ parent, a, b, thick = 0.35, colour = LASER_COLOUR, dmg = 10, owner = null, move = null, warm = 0, onHit, floorY = null }) {
    this.a = new THREE.Vector3(a.x, a.y, a.z);
    this.b = new THREE.Vector3(b.x, b.y, b.z);
    this.thick = thick;
    this.dmg = dmg;
    this.owner = owner;
    this.move = move;
    this.onHit = onHit;
    this.t = 0;
    this.warm = warm;
    this.on = true;
    this.floorY = floorY;
    const geo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    geo.rotateX(Math.PI / 2);
    this.core = new THREE.Mesh(geo, beamMat(LASER_CORE.colour, LASER_CORE.opacity, floorY));
    this.glow = new THREE.Mesh(geo, beamMat(colour, LASER_GLOW.mid, floorY));
    this.core.renderOrder = LASER_ORDER + 1;
    this.glow.renderOrder = LASER_ORDER;
    this.group = new THREE.Group();
    this.group.add(this.core, this.glow);
    parent.add(this.group);
    /* The footprint: a unit quad along +Z, stretched under the beam each frame. */
    if (floorY != null) {
      const q = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
      this.shadow = new THREE.Mesh(q, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }));
      this.trace = new THREE.Mesh(q, new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
      this.shadow.renderOrder = LASER_ORDER - 2;
      this.trace.renderOrder = LASER_ORDER - 1;
      parent.add(this.shadow, this.trace);
    }
    this._place();
  }

  /** The beam's footprint on `floorY`: flat, under it, as wide as it reads. */
  _placeShadow(live) {
    if (!this.shadow) return;
    const fy = this.floorY;
    // Only the part of the beam that is ABOVE the floor casts anything.
    const show = this.on && (this.a.y > fy - 0.02 || this.b.y > fy - 0.02);
    this.shadow.visible = show;
    this.trace.visible = show;
    if (!show) return;
    const dx = this.b.x - this.a.x;
    const dz = this.b.z - this.a.z;
    const len = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    for (const [m, w, y] of [[this.shadow, Math.max(0.5, this.thick * 3.2), fy + 0.035], [this.trace, Math.max(0.12, this.thick * 0.7), fy + 0.045]]) {
      m.position.set((this.a.x + this.b.x) / 2, y, (this.a.z + this.b.z) / 2);
      m.rotation.set(0, yaw, 0);
      m.scale.set(w, 1, Math.max(0.01, len));
    }
    this.trace.material.opacity = live ? 0.55 : 0.2;
    this.shadow.material.opacity = live ? 0.55 : 0.3;
  }

  _place() {
    const mid = _v.addVectors(this.a, this.b).multiplyScalar(0.5);
    const len = this.a.distanceTo(this.b);
    this.group.position.copy(mid);
    /* Turned in the PARENT'S OWN FRAME, from a to b. This used to be
       `lookAt(b + parent.position)`, which is a world point only when the
       parent's parent sits at the origin. A drill's root is at the origin
       INSIDE the sim layer, and the layer is SIM.dx (12000) out, so every
       beam in a drill was drawn pointing at world -X: Long Guard's three
       came out parallel, Adamant's clock hands were two parallel bars, and
       the hits were judged on the true a-b segment the whole time. Found in
       the browser, Oct 2026, behind "the lasers are hard to see". */
    if (len > 1e-6) this.group.quaternion.setFromUnitVectors(_z.set(0, 0, 1), _w.subVectors(this.b, this.a).divideScalar(len));
    const live = this.on && this.t >= this.warm;
    const k = live ? 1 : 0.25;
    this.core.scale.set(this.thick * 0.25 * k, this.thick * 0.25 * k, len);
    this.glow.scale.set(this.thick * k, this.thick * k, len);
    this.glow.material.uniforms.uOpacity.value = live ? LASER_GLOW.mid + LASER_GLOW.swing * Math.sin(this.t * 30) : LASER_GLOW.warm;
    this._placeShadow(live);
  }

  /** Distance from her body (a vertical segment) to the beam, in the layer. */
  distTo(p) {
    const x = p.position.x - SIM.dx;
    const z = p.position.z - SIM.dz;
    const y0 = p.position.y + 0.2;
    const y1 = p.position.y + (p.height ?? 2.6) * 0.85;
    return segSegDist(this.a, this.b, _p0.set(x, y0, z), _p1.set(x, y1, z));
  }

  update(dt, players) {
    this.t += dt;
    if (this.move) this.move(this.t, this);
    this._place();
    if (!this.on || this.t < this.warm) return;
    for (const p of players) {
      if (this.owner != null && p.index !== this.owner) continue;
      if (this.distTo(p) < this.thick + LASER_PAD) this.onHit?.(p, this);
    }
  }

  dispose() { this.group.removeFromParent(); this.shadow?.removeFromParent(); this.trace?.removeFromParent(); }
}

/** How far past its own radius a beam reaches her body. 0.45 before Oct 2026:
 *  with the glow drawn at `thick`, a kitten whose sprite was visibly clear of
 *  a thin wall took the hit — "the player is taking damage before even
 *  stepping into the lazers". Her body segment is her middle; her sprite is
 *  about 0.5 either side of it, so 0.3 is touching what is drawn. */
export const LASER_PAD = 0.3;

/**
 * A bolt fired at her from a turret — the thing a Ward exists to stop. Flies
 * straight at where she WAS when it left the barrel, so a step aside dodges
 * it and standing still and blocking is the lesson.
 */
export class Bolt {
  constructor({ parent, from, to, speed = 14, colour = 0xff5a3a, dmg = 12, owner = null, onHit }) {
    this.pos = new THREE.Vector3(from.x, from.y, from.z);
    this.vel = new THREE.Vector3(to.x - from.x, to.y - from.y, to.z - from.z).normalize().multiplyScalar(speed);
    this.dmg = dmg;
    this.owner = owner;
    this.onHit = onHit;
    this.life = 4;
    this.dead = false;
    this.mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 1), holoMat(colour, 0.95));
    this.halo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), holoMat(colour, 0.3));
    this.mesh.add(this.halo);
    this.mesh.position.copy(this.pos);
    parent.add(this.mesh);
  }

  update(dt, players) {
    if (this.dead) return;
    this.life -= dt;
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    if (this.life <= 0) { this.dispose(); return; }
    for (const p of players) {
      if (this.owner != null && p.index !== this.owner) continue;
      const x = p.position.x - SIM.dx;
      const z = p.position.z - SIM.dz;
      const cy = p.position.y + (p.height ?? 2.6) * 0.5;
      if (Math.hypot(x - this.pos.x, z - this.pos.z) < 1.0 && Math.abs(cy - this.pos.y) < 1.6) {
        this.onHit?.(p, this);
        this.dispose();
        return;
      }
    }
  }

  dispose() {
    this.dead = true;
    this.mesh.removeFromParent();
  }
}

/** Shortest distance between segments p1-q1 and p2-q2 (Ericson, RTCD 5.1.9). */
export function segSegDist(p1, q1, p2, q2) {
  const d1 = _a.subVectors(q1, p1);
  const d2 = _b.subVectors(q2, p2);
  const r = _c.subVectors(p1, p2);
  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r);
  let s;
  let t;
  if (a <= 1e-9 && e <= 1e-9) return p1.distanceTo(p2);
  if (a <= 1e-9) { s = 0; t = THREE.MathUtils.clamp(f / e, 0, 1); }
  else {
    const c = d1.dot(r);
    if (e <= 1e-9) { t = 0; s = THREE.MathUtils.clamp(-c / a, 0, 1); }
    else {
      const b = d1.dot(d2);
      const den = a * e - b * b;
      s = den > 1e-9 ? THREE.MathUtils.clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = THREE.MathUtils.clamp(-c / a, 0, 1); }
      else if (t > 1) { t = 1; s = THREE.MathUtils.clamp((b - c) / a, 0, 1); }
    }
  }
  _c1.copy(p1).addScaledVector(d1, s);
  _c2.copy(p2).addScaledVector(d2, t);
  return _c1.distanceTo(_c2);
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _z = new THREE.Vector3();
const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _c1 = new THREE.Vector3();
const _c2 = new THREE.Vector3();
