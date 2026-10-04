import * as THREE from 'three';
import { Billboard } from '../../core/gfx.js';
import { SIM, HOLO } from '../../world/simworld.js';
import { Kiosk, idleIn, isleSpot } from './kiosk.js';
import { HoloPanel, holoFlicker } from './holo.js';
import { Target, holoSolid, holoMat } from './targets.js';
import { starsFor } from './progress.js';
import { rankOf } from './rank.js';
import { VOICE_TAIL } from './lionvoice.js';

/* ---------------------------------------------------------------------------
   SHADOW LIONHEART — 影. The final exam, and the only one they sit together.

   Lionheart's line at the arcade has promised this since stage one: "Beat me
   in the simulator someday, and you'll earn a share of my HONOR!" Here he
   is, in shadow, nine units tall, with a blade to match — and the reward is
   the one thing the Dream Dojo pays into the real world: the TENTH QUEST
   (feats.js), a Powerup Kotodama at the award ceremony.

   CO-OP, NOT FOUR COPIES. Every other island gives each kitten her own drill;
   this one is ONE fight, a shared hologram (`owner: null`) that any sister's
   blade reaches. Whoever is on the island floor when it starts is in it; a
   sister who walks on later joins, and he grows a little to meet her. His bar
   is sized to the party, so two kittens are not a shortcut.

   EVERY BLOW IS TOLD, AND TOLD WHERE IT LANDS. Three attacks, and each one
   paints its shape on the floor in red before it comes down — and the shape is
   built from THE SAME NUMBERS the hit test reads (`inSlam`, `inSweep`,
   `inCross`), so "I was outside the red" is always the truth. `world-check`
   samples the drawn corners against the tests:

     · 斬 SLAM — a line from his feet, the way he is facing. Step out of it.
     · 薙 SWEEP — a disc round him at ankle height. JUMP: her jump clears it
       for three-quarters of a second (world-check measures it off player.js).
     · 十 CROSS SLASH, from half health — an X centred where she was standing.
       After it he is OPEN for a moment, glowing gold, and every blow counts
       twice. The lesson the ring teaches the hard way: punish the big move.

   NOBODY IS HURT (non-negotiable 3). His blows land on SIM bars through
   `simHit`, which knows the Flash Step and the Ward, and a kitten whose bar
   runs out is caught by the simulator and set back down at the arena's edge.
   A catch costs time on her score, never the fight.
--------------------------------------------------------------------------- */

export const ARENA_AT = [4, 0];
export const ARENA_R = 20;
export const KIOSK_AT = [-19, 7];
/** Where she walks on (and is set down after a catch) when there is no lens
 *  to measure; with one, it is the ring's DOWNSTAGE edge — see `_entry`. */
export const ENTRY_AT = [-14, 0];
/** How far from the ring's middle the downstage entry is. */
export const ENTRY_R = ARENA_R - 4;
/** How far he may walk: past the ring line, which is HER walk-off rule, not
 *  his. It was ARENA_R - 3, and with her on the rim that left him no floor
 *  upstage of her at all — measured 4.08 downstage of her in the browser. */
export const BOSS_ROAM = ARENA_R + 2;
/** Blows he takes for one kitten, and per sister beyond her. */
export const SHADOW_HITS = 24;
export const SHADOW_PER = 12;
export const SHADOW_T = 240;
/** Score is seconds + this per catch; lower is better. */
export const CATCH_COST = 15;
export const SHADOW_BANDS = [SHADOW_T + 60, 150, 100];
/** How tall he is drawn: LIONHEART'S OWN HEIGHT (`LION_HEIGHT` in
 *  dreamdojo.js, 6.2 — a literal here because that file imports this one).
 *  It was 9.3, half as tall again as the man himself, and Richard: "Lionheart
 *  is too big in the Dream Dojo simulation when doing the Lionhearts Shadow."
 *  A boss does not need to be a giant to be a boss: he is two and a half
 *  kittens tall either way, and at 9.3 his head and HONOR's tip were off the
 *  top of a half-width pane through every slam. `world-check` pins the two
 *  equal. */
export const SHADOW_H = 6.2;
export const BOSS_SPEED = 3.2;
export const BOSS_CLOSE = 4;
/** Below this fraction of his bar, phase two: the Cross Slash. */
export const PHASE2 = 0.5;

export const SLAM = { tell: 1.0, len: 11, half: 1.4, dmg: 18, recover: 0.8 };
export const SWEEP = { tell: 1.1, r: 6.5, dmg: 14, clear: 0.6, recover: 0.7 };
export const CROSS = { tell: 1.2, len: 14, half: 1.3, dmg: 22, open: 2.2 };

/**
 * HIS DRAWING, ONE CELL PER THING HE IS DOING — `lionheart/shadow.png`, one
 * row of four in this order. Wound up for the whole tell, so the pose IS the
 * telegraph as much as the red on the floor is, and held through the recover
 * after, so the blow reads as having landed rather than snapping back to
 * guard on the frame it does. The Cross Slash's cell is drawn with its X of
 * light already in it, which is why it is shown from the tell on: it says the
 * same thing as the X on the floor.
 */
export const POSE = { guard: 0, slam: 1, sweep: 2, cross: 3 };

/** Which cell `act` shows. Pure, so world-check can walk every act. */
export function poseCell(act) {
  if (!act || act.kind === 'idle') return POSE.guard;
  return POSE[act.what] ?? POSE.guard;
}

/**
 * WHAT HE SAYS WHEN HE LOSES, BEFORE ANYBODY IS PAID. Richard's line, an
 * homage he chose: the master handing over his sword and everything he meant
 * to do with it. It is SAID first and the stars and the quest toast follow
 * `secs` later — but only the SHOWING waits. The result, the flag and the
 * quest are all committed on the frame he breaks (non-negotiable 7: nothing
 * hangs off a line finishing), so a kitten who disconnects mid-sentence still
 * has everything she won.
 */
export const HANDOVER = { line: 'My honor, my dreams…\nthey\'re yours now.', secs: 4, voice: 'lion_handover' };

/**
 * EVERYTHING ELSE HE SAYS ALOUD IN HERE. One table, so the bubble and the
 * recording are the same string by construction — the bubble is handed the
 * text, and `LionVoice` looks the recording up BY that text. Two copies of a
 * line is how Mr. Satan's taunt ended up four words long over eight seconds
 * of speech (docs/notes/voices.md). The losing line is not here: it names
 * why she lost and how much of his bar was left, and no recording can.
 */
export const SHADOW_LINES = {
  hello: { line: 'So you have come to fight my SHADOW.\nShow me what the Dojo taught you!', voice: 'lion_shadow_hello' },
  cross: { line: 'Not bad! Now… the CROSS SLASH.\nWatch for the X!', voice: 'lion_shadow_cross' },
  prize: { line: 'You beat my SHADOW!\nAs promised — a share of my HONOR.', voice: 'lion_prize' },
};

/* ------------------------------ the shapes -------------------------------- */

/** Inside the slam's line? `o` his feet, `dir` his facing (unit, flat). */
export function inSlam(o, dir, x, z, A = SLAM) {
  const rx = x - o.x; const rz = z - o.z;
  const along = rx * dir.x + rz * dir.z;
  const perp = -rx * dir.z + rz * dir.x;
  return along >= 0 && along <= A.len && Math.abs(perp) <= A.half;
}

/** Caught by the sweep? Inside the disc AND too low to clear the blade. */
export function inSweep(o, x, z, lift, A = SWEEP) {
  return Math.hypot(x - o.x, z - o.z) <= A.r && lift < A.clear;
}

/** The two bars of the X, at ±45° to `yaw`. */
export function crossBars(yaw) {
  return [yaw + Math.PI / 4, yaw - Math.PI / 4].map((a) => ({ x: Math.sin(a), z: Math.cos(a) }));
}

/** Inside either bar of the X centred on `c`? */
export function inCross(c, yaw, x, z, A = CROSS) {
  const rx = x - c.x; const rz = z - c.z;
  return crossBars(yaw).some((d) => {
    const along = rx * d.x + rz * d.z;
    const perp = -rx * d.z + rz * d.x;
    return Math.abs(along) <= A.len / 2 && Math.abs(perp) <= A.half;
  });
}

/* STAGING. The game's camera never turns — it looks north-east from behind
   whoever it follows — so a 9.3-tall boss who closed on her from whichever
   side he happened to arrive at stood between her and the lens about half the
   time, and filled the pane with his back and his name. Found in the browser.
   He now closes on her from UPSTAGE (the far side of her, into the screen),
   which is the fighting-game answer: both of them always in the shot, and
   every telegraph drawn on the floor coming TOWARDS the camera where it can be
   read. `view` is measured off the real camera every frame, never assumed;
   with no camera yet (the check, a first frame) he walks straight at her. */

/* THE FIGHT'S SHOT. The walking camera (24 back, pitch 0.66, aimed at her
   chest) put his head at NDC y 1.23 — off the top of the pane — with him
   staged five behind her. Measured through her real camera:
     24 / 0.66, aim her chest           head  1.23
     30 / 0.52, lift 3.5, 40% to him    head  0.63, her feet -0.39
     34 / 0.50, lift 4,   40% to him    head  0.51, her feet -0.37   <- this
     38 / 0.46, lift 4.2, 45% to him    head  0.43, her feet -0.36
   34 keeps her readable and the whole ring in; the yaw is NEVER changed,
   because the staging above is measured off it. */
export const SHOT = { dist: 34, pitch: 0.5, lift: 4, mix: 0.4 };
/** His card, beside him: how big, and half its width plus a margin from his middle. */
/* 1.6 reached 0.96 of the way to a side-by-side pane's edge (world-check
   measures every pane shape); 1.4 keeps a margin and still reads. */
export const PANEL_SCALE = 1.4;
export const PANEL_SIDE = 4 * PANEL_SCALE + 2.5;

/** How far either side of her line of sight he is "in the way". */
export const VEIL_LAT = 3.4;
/** How see-through he and his card go when he is in the way anyway. */
export const VEIL = 0.45;

/** The spot he walks to: of the points `dist` from her that are on his floor,
 *  the furthest upstage. It was "beyond her along the view, clamped to the
 *  floor" — and with her on the rim the clamp dragged it back to a yard from
 *  her on the lens side, which is the shot it existed to prevent. Measured in
 *  the browser at 1.0 away and downstage; the check now stands her there. */
export function upstageSpot(tx, tz, view, centre, dist = BOSS_CLOSE) {
  const lim = BOSS_ROAM;
  let best = null;
  let bestUp = -Infinity;
  let near = null;
  let nearR = Infinity;
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    const x = tx + Math.cos(a) * dist;
    const z = tz + Math.sin(a) * dist;
    const r = Math.hypot(x - centre.x, z - centre.z);
    if (r < nearR) { nearR = r; near = { x, z }; }
    if (r > lim) continue;
    const up = (x - tx) * view.x + (z - tz) * view.z;
    if (up > bestUp) { bestUp = up; best = { x, z }; }
  }
  return best ?? near;
}

/** Does a figure at `b` stand between a lens at `cam` (looking along `view`) and her at `k`? */
export function blocks(cam, view, b, k) {
  const db = (b.x - cam.x) * view.x + (b.z - cam.z) * view.z;
  const dk = (k.x - cam.x) * view.x + (k.z - cam.z) * view.z;
  if (db >= dk) return false;
  return Math.abs((b.x - k.x) * view.z - (b.z - k.z) * view.x) < VEIL_LAT;
}

/** A flat red rectangle `w` × `l`, centred on (cx, cz), its length along `d`. */
function barMesh(cx, y, cz, w, l, d) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2), holoMat(0xff2050, 0.35));
  m.position.set(cx, y + 0.08, cz);
  m.rotation.y = Math.atan2(d.x, d.z);
  m.renderOrder = 5;
  return m;
}

/* ------------------------------- the boss --------------------------------- */

/** How long a hit's starburst lasts. */
export const SPARK_T = 0.28;
let _sparkTex = null;
/** The starburst: drawn once, on a CPU canvas, and shared by every spark. A
 *  material each, because each fades on its own clock. */
function sparkMat() {
  if (!_sparkTex && typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.translate(64, 64);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, 60);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,236,150,0.95)');
    grad.addColorStop(1, 'rgba(255,120,60,0)');
    g.fillStyle = grad;
    g.beginPath();
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const r = i % 2 ? 22 : 60 - (i % 4) * 9;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    _sparkTex = new THREE.CanvasTexture(c);
  }
  return new THREE.SpriteMaterial({
    map: _sparkTex, transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.AdditiveBlending, color: 0xffffff,
  });
}

export class ShadowBoss extends Target {
  constructor(o) {
    /* The hit volume scales with him: it was centre 3.0 and 4 up for 9.3. */
    super({ centre: SHADOW_H * 0.32, pad: 2.2, hitUp: SHADOW_H * 0.43, hitDown: 1, colour: 0x9b4dff, name: 'Shadow Lionheart', barY: SHADOW_H + 0.8, ...o });
    if (this.bar) this.bar.scale.setScalar(2.0);
    this.facing = { x: 0, z: 1 };
    this.figure = new THREE.Group();
    this.body.add(this.figure);
    const art = o.art;
    this.pose = POSE.guard;
    this.posed = false;
    if (art?.texture) {
      this.dress(art);
    } else {
      // No drawing loaded: a figure of light rather than nothing (prefer a rule that degrades).
      const g = new THREE.CapsuleGeometry(1.4, SHADOW_H - 3, 4, 12).translate(0, SHADOW_H / 2, 0);
      const s = holoSolid(g, 0x7a3cff, 0.35);
      this.figure.add(s);
      this.body.userData.mats = s.userData.mats;
      this.ghost = s;
    }
    // HONOR, held at his side — the blade the attacks swing.
    this.blade = holoSolid(new THREE.BoxGeometry(0.28, 7.2, 0.12).translate(0, 3.6, 0), 0xff3b8a, 0.5);
    this.blade.position.set(2.4, 0.6, 0);
    this.blade.rotation.z = -0.25;
    /* ITS OWN GROUP, turned to the lens about Y: the drawing is a billboard
       and turns itself, and a blade parented to it would have to agree with
       how. This way it stays at his side from wherever the camera is. */
    this.bladeGrp = new THREE.Group();
    this.bladeGrp.add(this.blade);
    this.body.add(this.bladeGrp);
    /* NOT ON HIS OWN SHEET, which has HONOR drawn in his hands in every pose:
       a second, glowing one at his side was two swords. */
    this.bladeGrp.visible = !this.posed;
    const aura = new THREE.Mesh(new THREE.CircleGeometry(3.2, 32).rotateX(-Math.PI / 2), holoMat(0x2a0a44, 0.55));
    aura.position.y = 0.04;
    this.group.add(aura);
    this.open = 0;
  }

  /**
   * Put a drawing on him: his own four-pose sheet, or Lionheart's town drawing
   * tinted into a shadow — the degrade, and how he first shipped. Called
   * again by the fight if his sheet lands AFTER he was spawned (`loadSimArt`
   * starts at the first tube and is not awaited), so a fight that began on
   * the fallback does not spend all four minutes in one pose.
   */
  dress(art) {
    if (!art?.texture) return;
    /* THE FIGURE OF LIGHT GOES WHEN A DRAWING ARRIVES. Dressed late, he kept
       the capsule he was spawned as standing inside the drawing — two of
       him, one a glowing pill — because only `sprite` was ever cleared. */
    if (this.ghost) {
      this.ghost.removeFromParent();
      this.ghost = null;
      this.body.userData.mats = [];
    }
    if (this.sprite) {
      this.sprite.removeFromParent();
      this.sprite.mat?.dispose?.();
    }
    /** His own sheet (true), or the tinted town drawing (false). */
    this.posed = (art.cols ?? 1) >= 4;
    /* THE TINT IS LIGHTER ON HIS OWN SHEET. The town drawing is a bright
       daytime figure and wants pushing a long way into purple; the shadow
       sheet is already black robes, and the same multiply would leave a
       silhouette with no pose left in it to read. */
    this.tint = this.posed ? 0xc8a8ff : 0x7a3cff;
    const quad = SHADOW_H / (art.contentScale || 1);
    this.sprite = new Billboard(art.texture, {
      cols: this.posed ? art.cols : 1, rows: 1, width: quad, height: quad,
      footOffset: (art.pad ?? 0) * quad, mirror: false,
    });
    this.sprite.mat.color.set(this.tint);
    this.sprite.mat.transparent = true;
    this.sprite.mat.opacity = 0.9;
    this.figure.add(this.sprite);
    if (this.bladeGrp) this.bladeGrp.visible = !this.posed;
  }

  /**
   * A BLOW HE CAN BE SEEN TO TAKE. Richard: "a 'hit' effect should be played
   * on Shadow when he is hit so that the player knows they are damaging him.
   * Currently, he just turns white which is hard to see or notice." A purple-
   * black figure going white for a fifth of a second, 34 back, was the whole
   * of it. Now each blow that counts throws:
   *   · a starburst of light ON THE SIDE SHE HIT FROM, at his chest, drawn
   *     over everything (it is a spark, not a thing in the room);
   *   · a spray of shards in her colour;
   *   · a knock — the figure jolts away from the blade and squashes, and
   *     settles over a quarter of a second;
   *   · the ring's own `hit` sound.
   * His bar dropping was already there; it is no longer the only sign.
   */
  hit(info) {
    const ok = super.hit(info);
    if (ok) this._struck(info);
    return ok;
  }

  _struck(info) {
    const d = info.dir ?? { x: 0, z: 1 };
    const y = this.local.y + SHADOW_H * 0.45;
    const sx = this.local.x - d.x * 1.4;
    const sz = this.local.z - d.z * 1.4;
    const s = new THREE.Sprite(sparkMat());
    s.position.set(sx, y, sz);
    s.renderOrder = 30;
    this.group.parent?.add(s);
    (this.sparks ??= []).push({ s, t: 0 });
    const colour = info.attacker?.style?.colour ?? HOLO.gold;
    this.o.shards?.burst(sx, y, sz, colour, 34, 8, 5);
    this.knock = 1;
    this.knockDir = d;
    this.o.sfx?.('hit');
  }

  update(dt) {
    super.update(dt);
    for (let i = (this.sparks?.length ?? 0) - 1; i >= 0; i--) {
      const k = this.sparks[i];
      k.t += dt;
      const e = Math.min(1, k.t / SPARK_T);
      k.s.scale.setScalar(1.5 + 3.5 * Math.sqrt(e));
      k.s.material.opacity = 1 - e * e;
      k.s.material.rotation = e * 0.6;
      if (e >= 1) { k.s.removeFromParent(); k.s.material.dispose(); this.sparks.splice(i, 1); }
    }
    if (this.knock > 0) {
      this.knock = Math.max(0, this.knock - dt / 0.25);
      const kn = this.knock * this.knock;
      const d = this.knockDir ?? { x: 0, z: 0 };
      this.figure.position.set(d.x * 0.7 * kn, 0, d.z * 0.7 * kn);
      this.figure.scale.set(1 + 0.08 * kn, 1 - 0.1 * kn, 1);
    }
    if (this.sprite) {
      const gold = this.open > 0;
      this.sprite.mat.color.setHex(this.flash > 0.3 ? 0xffffff : gold ? 0xffc93c : this.tint);
      // Soft, not a blink — see `holoFlicker` (it was 3.7 hard blinks a second).
      this.baseOp = holoFlicker(this.t, 3, 0.9, 0.3);
      this.sprite.mat.opacity = this.baseOp;
    }
    this.position.set(this.group.position.x + SIM.dx, this.group.position.y + this.o.centre, this.group.position.z + SIM.dz);
  }

  dispose() {
    for (const k of this.sparks ?? []) { k.s.removeFromParent(); k.s.material.dispose(); }
    this.sparks = [];
    super.dispose();
  }

  /** `veil` is per PANE: in the way of one kitten's lens is not in another's. */
  faceCamera(camera, veil = 1) {
    super.faceCamera(camera);
    this.sprite?.faceCamera(camera);
    /* faceCamera picks a cell from his FACING, which on a sheet of poses would
       be a guard from one side and a slam from the other. Overwrite it with
       what he is doing; facing still turns the quad to the lens. */
    if (this.posed) this.sprite._setCell(this.pose, 0, false);
    if (this.sprite) this.sprite.mat.opacity = (this.baseOp ?? 0.9) * veil;
    _e.setFromQuaternion(camera.quaternion, 'YXZ');
    this.bladeGrp.rotation.y = _e.y;
  }
}

/* -------------------------------- the fight ------------------------------- */

export class ShadowFight {
  constructor(dream, isle) {
    this.dream = dream;
    this.isle = isle;
    this.centre = { ...isleSpot(isle, ...ARENA_AT) };
    this.state = 'waiting';
    this.boss = null;
    this.who = new Map();     // index -> { p, catches }
    this.tells = [];
    this.flashes = [];
    this.t = 0;

    const ring = new THREE.Mesh(new THREE.RingGeometry(ARENA_R - 0.35, ARENA_R, 72).rotateX(-Math.PI / 2), holoMat(0x9b4dff, 0.7));
    ring.position.set(this.centre.x, isle.y + 0.06, this.centre.z);
    dream.sim.root.add(ring);

    const kq = isleSpot(isle, ...KIOSK_AT);
    this.kiosk = new Kiosk(dream, {
      x: kq.x, z: kq.z, y: isle.y, colour: 0x9b4dff, kanji: '影', title: 'SHADOW LIONHEART',
      card: (p) => this.card(p),
      prompt: (p, key) => (this.state === 'live' ? null : `[${key}]  FIGHT SHADOW LIONHEART`),
      interact: (p) => this.begin(p),
    });
    this.stations = [this.kiosk.station];

    // What he says, over his head, while he is up.
    this.panel = new HoloPanel({ w: 8, h: 2.4, px: 90, edge: 0x9b4dff });
    // Read from the fight's shot, 34 back: at 1x his lines were too small to read.
    this.panel.scale.setScalar(PANEL_SCALE);
    this.panel.visible = false;
    dream.sim.root.add(this.panel);
    this.say = null;
    this.sayT = 0;
    dream.sim.tickers.push((dt) => this.update(dt));
  }

  card(p) {
    const P = this.dream.progress;
    const n = p.style?.name ?? p.name;
    const r = rankOf(P, n);
    const best = P.best(n, 'shadow');
    return [
      { text: '影 SHADOW LIONHEART', size: 1.8, color: 0xc89bff, glow: true, jp: true },
      { text: 'The final exam. Fight him TOGETHER — everyone on the island joins in', size: 1.0 },
      { text: 'Red on the floor = where he will hit. SWEEP? JUMP! After the CROSS he is OPEN', size: 0.9, color: 0x9fefff },
      { text: r.shadow ? `beaten! best ${best != null ? `${Math.round(best)}s` : '—'}` : 'Anyone may try! Beat him for a SPECIAL Kotodama!', size: 1.1, color: HOLO.gold },
    ];
  }

  /** The kiosk's button. Refused in words, or the fight begins. */
  begin(p) {
    if (this.state === 'live') {
      this.dream.hint(p, 'the fight is ON — step into the purple ring to join!');
      return;
    }
    if (this.state !== 'waiting') return;
    this._spawn();
    for (const q of this._onFloor()) this._join(q, true);
    /* SHE IS STEPPED IN. The kiosk is outside the ring — 24.04 from its middle
       against a walk-off line of ARENA_R + 4 = 24 — so the kitten who pressed
       the button was the first to "leave", and the fight was lost to
       "Everybody left the arena!" on its first frame. Found in the browser;
       the check had stood her on the floor before pressing. Moving the kiosk
       in would only make the margin a coincidence again. */
    if (!this._onFloor().includes(p)) {
      const e = this._entry();
      p.position.set(e.x + SIM.dx, e.y + 0.1, e.z + SIM.dz);
      p.velocity?.set?.(0, 0, 0);
    }
    this._join(p, true);
    this._say(SHADOW_LINES.hello.line, 4);
    this.dream.game.sfx?.('gong');
  }

  /** Where she walks on: the ring's DOWNSTAGE edge, so the whole floor he
   *  stages on is beyond her from the lens. ENTRY_AT was the hub side, which
   *  the fixed camera happens to look OUT across, and he had nowhere to stand. */
  _entry() {
    const e = isleSpot(this.isle, ...ENTRY_AT);
    if (!this.view) return e;
    return { x: this.centre.x - this.view.x * ENTRY_R, y: e.y, z: this.centre.z - this.view.z * ENTRY_R };
  }

  /** Kittens on this island inside the ring, in the sim. */
  _onFloor() {
    return this.dream.simKittens().filter((q) => {
      const x = q.position.x - SIM.dx - this.centre.x;
      const z = q.position.z - SIM.dz - this.centre.z;
      return Math.hypot(x, z) <= ARENA_R && Math.abs(q.position.y - this.isle.y) < 6;
    });
  }

  _spawn() {
    let c = isleSpot(this.isle, ARENA_AT[0] + 9, 0);
    if (this.view) {
      // Across the ring from where she walks on, on the far side of the lens.
      const e = this._entry();
      const s = upstageSpot(e.x, e.z, this.view, this.centre, 12);
      c = { x: s.x, y: c.y, z: s.z };
    }
    this.boss = new ShadowBoss({
      parent: this.dream.sim.root, x: c.x, y: this.isle.y, z: c.z, owner: null,
      art: this.dream.game?.shadowArt ?? this.dream.lionArt, shards: this.dream.shards, hits: SHADOW_HITS,
      sfx: (n) => this.dream.game.sfx?.(n),
      onHit: (b) => {
        // OPEN: the blow counts twice — the punish window the Cross Slash leaves.
        if (b.open > 0 && b.hp > 0) b.hp -= 1;
      },
      onBreak: () => this._won(),
    });
    this.boss.maxHits = SHADOW_HITS;
    this.boss.hp = SHADOW_HITS;
    this.boss.facing = { x: -this.isle.fwd.x, z: -this.isle.fwd.z };
    this.dream.gate.add(this.boss);
    this.state = 'live';
    this.t = 0;
    this.act = { kind: 'idle', t: 1.6 };
    this.phase = 1;
    this.joined = 0;
  }

  _join(p, quiet = false) {
    if (this.who.has(p.index)) return;
    this.who.set(p.index, { p, catches: 0 });
    this.joined += 1;
    if (this.joined > 1 && this.joined <= 4) {
      // He grows to meet her: the bar is sized to the party.
      this.boss.maxHits += SHADOW_PER;
      this.boss.hp += SHADOW_PER;
    }
    this.dream.refillSim(p);
    if (!quiet) this.dream.game.toast?.(`${p.name} joined the fight against Shadow Lionheart!`, p.index);
  }

  /** The simulator caught one of his opponents. Back to the edge, and a cost. */
  onCatch(p) {
    const w = this.who.get(p.index);
    if (!w || this.state !== 'live') return false;
    w.catches += 1;
    const e = this._entry();
    p.position.set(e.x + SIM.dx, e.y + 0.1, e.z + SIM.dz);
    p.velocity?.set?.(0, 0, 0);
    this.dream.game.toast?.(`${p.name} was caught — back to the edge! (+${CATCH_COST}s on your time)`, p.index);
    return true;
  }

  /** Show a line over him, and say it if it is one of the recorded ones. The
   *  card stays up for as long as the recording runs, whichever is longer —
   *  Barrett takes his time, and a card that left before he finished was the
   *  bug this project keeps finding in announcers. */
  _say(text, secs = 3) {
    const d = this.dream.voice?.speak(text, this.dream.t) ?? 0;
    this.say = text;
    this.sayT = Math.max(secs, d > 0 ? d + VOICE_TAIL : 0);
  }

  _won() {
    if (this.state !== 'live') return;
    this.state = 'won';
    this.endT = HANDOVER.secs + 7;
    this._clearTells();
    const g = this.dream.game;
    g.sfx?.('victory');
    this._say(HANDOVER.line, HANDOVER.secs);
    /* EVERYTHING IS DECIDED NOW; only the telling of it waits for his line.
       See HANDOVER. The quest is earned with the same delay, which is the
       payout queue's own — its card comes up after the line, not over it. */
    this.payT = HANDOVER.secs;
    this.paid = [];
    for (const { p, catches } of this.who.values()) {
      if (!g.players?.includes(p)) continue;
      const n = p.style?.name ?? p.name;
      const score = this.t + CATCH_COST * catches;
      const stars = starsFor(score, SHADOW_BANDS, true);
      this.dream.award(p, 'shadow', stars, score, true);
      this.dream.progress.setFlag(n, 'shadow');
      const earned = g.feats?.earn?.(p, 'shadow', { delay: HANDOVER.secs });
      this.paid.push({ p, text: `${p.name} beat Shadow Lionheart! ${'★'.repeat(stars)}`
        + (earned ? (g.feats.open ? ' A Powerup Kotodama waits for you at the award ceremony!' : ' A Powerup Kotodama is on its way!') : '') });
    }
    this.dream.shards.burst(this.boss.local.x, this.boss.local.y + 4, this.boss.local.z, HOLO.gold, 160, 9, 10);
  }

  /** The stars, after the hand-over line. The facts were settled in `_won`. */
  _tellPrize() {
    const g = this.dream.game;
    this._say(SHADOW_LINES.prize.line, 7);
    for (const { p, text } of this.paid) if (g.players?.includes(p)) g.toast?.(text, p.index);
    this.paid = [];
  }

  _lost(why) {
    if (this.state !== 'live') return;
    this.state = 'lost';
    this.endT = 5;
    this._clearTells();
    const left = Math.round((this.boss.hp / this.boss.maxHits) * 100);
    this._say(`${why}\nI had ${left}% left. Come back stronger!`, 5);
    this.dream.game.sfx?.('deny');
    for (const { p } of this.who.values()) this.dream.game.toast?.(`${p.name} — ${why} Shadow Lionheart had ${left}% left.`, p.index);
  }

  _reset() {
    this._clearTells();
    if (this.boss) {
      this.dream.gate.remove(this.boss);
      this.boss.dispose();
      this.boss = null;
    }
    this.who.clear();
    this.state = 'waiting';
  }

  _clearTells() {
    for (const t of this.tells) t.mesh.removeFromParent();
    this.tells.length = 0;
  }

  /* ------------------------------ per frame ------------------------------- */

  update(dt) {
    this.kiosk.update(dt, idleIn(this.dream));
    /* The island's own sign is drawn at renderOrder 8, over everything at any
       depth, and from the fight's camera it hangs straight across his body. */
    if (this.isle.sign) this.isle.sign.visible = this.state === 'waiting';
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t -= dt;
      f.mesh.material.opacity = Math.max(0, f.t / 0.35) * 0.9;
      if (f.t <= 0) { f.mesh.removeFromParent(); this.flashes.splice(i, 1); }
    }
    this.sayT -= dt;
    if (this.state === 'waiting') { this.panel.visible = false; return; }
    const b = this.boss;
    // His own sheet arrived after he was spawned on the fallback: wear it.
    const own = this.dream.game?.shadowArt;
    if (!b.posed && own?.texture) b.dress(own);
    b.update(dt);
    b.open = Math.max(0, b.open - dt);
    b.pose = this.state === 'live' ? poseCell(this.act) : POSE.guard;
    this._paint();
    if (this.state === 'won' && this.paid?.length && (this.payT -= dt) <= 0) this._tellPrize();
    if (this.state === 'won' || this.state === 'lost') {
      this.endT -= dt;
      if (this.endT <= 0) this._reset();
      return;
    }
    this.t += dt;

    // Who is in it: joiners walk on, leavers walk off, the gone are dropped.
    const floor = this._onFloor();
    for (const q of floor) this._join(q);
    for (const [i, w] of [...this.who]) {
      const gone = !this.dream.game.players?.includes(w.p) || this.dream.realmOf(w.p) !== 'sim';
      const far = !floor.includes(w.p) && Math.hypot(w.p.position.x - SIM.dx - this.centre.x, w.p.position.z - SIM.dz - this.centre.z) > ARENA_R + 4;
      if (gone || far) {
        this.who.delete(i);
        if (!gone) this.dream.game.toast?.(`${w.p.name} left the fight`, w.p.index);
      }
    }
    if (!this.who.size) { this._lost('Everybody left the arena!'); return; }
    if (this.t >= SHADOW_T) { this._lost('Time!'); return; }
    if (this.phase === 1 && b.hp / b.maxHits <= PHASE2) {
      this.phase = 2;
      this._say(SHADOW_LINES.cross.line, 3.5);
    }
    this._think(dt);
  }

  /** The nearest kitten he is fighting, flat, in the layer. */
  _target() {
    let best = null;
    let bd = Infinity;
    for (const { p } of this.who.values()) {
      const d = Math.hypot(p.position.x - SIM.dx - this.boss.local.x, p.position.z - SIM.dz - this.boss.local.z);
      if (d < bd) { bd = d; best = p; }
    }
    return { p: best, d: bd };
  }

  _think(dt) {
    const b = this.boss;
    const a = this.act;
    a.t -= dt;
    const { p: tgt, d } = this._target();
    if (!tgt) return;
    const tx = tgt.position.x - SIM.dx; const tz = tgt.position.z - SIM.dz;
    const o = b.local;

    if (a.kind === 'idle') {
      // Walk at her, and turn to her: the facing is what the next slam uses.
      const n = d || 1;
      b.facing = { x: (tx - o.x) / n, z: (tz - o.z) / n };
      let nx = o.x; let nz = o.z;
      const goal = this.view ? upstageSpot(tx, tz, this.view, this.centre) : null;
      const gr = goal ? Math.hypot(goal.x - tx, goal.z - tz) : 0;
      // Her back to the far rim leaves no upstage: then he just stops short.
      const staged = goal && gr > 0.5;
      if (staged && d < BOSS_CLOSE + 2) {
        /* Close to her: walk ROUND her to the upstage side, never through
           her. The angle closes at walking pace, the radius eases to
           BOSS_CLOSE — so he circles like a fighter, not a ghost. */
        const phi = Math.atan2(o.z - tz, o.x - tx);
        let dPhi = Math.atan2(goal.z - tz, goal.x - tx) - phi;
        dPhi = Math.atan2(Math.sin(dPhi), Math.cos(dPhi));
        const r = Math.max(d, 0.5);
        const turn = Math.sign(dPhi) * Math.min(Math.abs(dPhi), (BOSS_SPEED * dt) / r);
        const r2 = r + Math.max(-BOSS_SPEED * dt * 0.5, Math.min(BOSS_SPEED * dt * 0.5, Math.min(gr, BOSS_CLOSE) - r));
        nx = tx + Math.cos(phi + turn) * r2;
        nz = tz + Math.sin(phi + turn) * r2;
      } else {
        // Far: straight at her (or at the spot beyond her, when there is a lens).
        const gx = staged ? goal.x : tx; const gz = staged ? goal.z : tz;
        const gd = Math.hypot(gx - o.x, gz - o.z);
        const stop = staged ? 0 : BOSS_CLOSE;
        if (gd > stop + 1e-6) {
          const step = Math.min(BOSS_SPEED * dt, gd - stop);
          nx = o.x + ((gx - o.x) / gd) * step;
          nz = o.z + ((gz - o.z) / gd) * step;
        }
      }
      const ox = nx - this.centre.x; const oz = nz - this.centre.z;
      const od = Math.hypot(ox, oz);
      if (od > BOSS_ROAM) { nx = this.centre.x + (ox / od) * BOSS_ROAM; nz = this.centre.z + (oz / od) * BOSS_ROAM; }
      o.x = nx; o.z = nz;
      b.group.position.x = nx; b.group.position.z = nz;
      /* IN REACH FIRST. He used to telegraph on a timer from wherever he was,
         and a slam whose red line stopped 11 short of her taught nothing.
         Phase two's Cross Slash lands on HER, so it needs no reach. */
      if (a.t <= 0 && (d <= SLAM.len || this.phase === 2)) this._choose(tgt, d, d > SLAM.len ? 'cross' : null);
      return;
    }
    if (a.kind === 'tell') {
      const k = 1 - a.t / a.tell;
      for (const m of a.meshes) m.material.opacity = 0.18 + 0.45 * k + 0.1 * Math.sin(this.t * 30);
      // The blade, raised as the tell runs.
      b.blade.rotation.z = -0.25 - k * 2.2;
      if (a.t <= 0) this._strike(a);
      return;
    }
    if (a.kind === 'recover' && a.t <= 0) {
      b.blade.rotation.z = -0.25;
      this.act = { kind: 'idle', t: this.phase === 2 ? 0.7 : 1.1 };
    }
  }

  /** `force` names the attack — for world-check, which draws each shape on
   *  demand and measures it against its own hit test. */
  _choose(tgt, d, force = null) {
    const b = this.boss;
    const o = b.local;
    const y = this.isle.y;
    const order = this.phase === 2 ? ['slam', 'cross', 'sweep', 'slam', 'cross'] : ['slam', 'sweep'];
    this.n = (this.n ?? -1) + 1;
    let kind = force ?? order[this.n % order.length];
    // A sweep with nobody near it is a wasted lesson: slam instead.
    if (!force && kind === 'sweep' && d > SWEEP.r + 1) kind = 'slam';
    const meshes = [];
    let tell;
    let say;
    if (kind === 'slam') {
      const f = { ...b.facing };
      meshes.push(barMesh(o.x + f.x * SLAM.len / 2, y, o.z + f.z * SLAM.len / 2, SLAM.half * 2, SLAM.len, f));
      tell = SLAM.tell * (this.phase === 2 ? 0.85 : 1);
      this.act = { kind: 'tell', what: 'slam', t: tell, tell, meshes, o: { x: o.x, z: o.z }, dir: f };
      say = 'SLAM! Get out of the red line!';
    } else if (kind === 'sweep') {
      const m = new THREE.Mesh(new THREE.CircleGeometry(SWEEP.r, 48).rotateX(-Math.PI / 2), holoMat(0xff2050, 0.3));
      m.position.set(o.x, y + 0.08, o.z);
      m.renderOrder = 5;
      meshes.push(m);
      tell = SWEEP.tell;
      this.act = { kind: 'tell', what: 'sweep', t: tell, tell, meshes, o: { x: o.x, z: o.z } };
      say = 'SWEEP! JUMP!';
    } else {
      const c = { x: tgt.position.x - SIM.dx, z: tgt.position.z - SIM.dz };
      const yaw = Math.atan2(b.facing.x, b.facing.z);
      for (const dir of crossBars(yaw)) meshes.push(barMesh(c.x, y, c.z, CROSS.half * 2, CROSS.len, dir));
      tell = CROSS.tell;
      this.act = { kind: 'tell', what: 'cross', t: tell, tell, meshes, c, yaw };
      say = 'CROSS SLASH! Get out of the X!';
    }
    for (const m of meshes) this.dream.sim.root.add(m);
    this.tells.push(...meshes.map((mesh) => ({ mesh })));
    for (const { p } of this.who.values()) this.dream.hint(p, say);
  }

  /** The blow lands — on exactly the shape that was drawn. */
  _strike(a) {
    const b = this.boss;
    const y = this.isle.y;
    for (const { p } of this.who.values()) {
      const x = p.position.x - SIM.dx; const z = p.position.z - SIM.dz;
      let hit = false;
      let A = SLAM;
      if (a.what === 'slam') hit = inSlam(a.o, a.dir, x, z);
      else if (a.what === 'sweep') { A = SWEEP; hit = inSweep(a.o, x, z, p.position.y - y); }
      else { A = CROSS; hit = inCross(a.c, a.yaw, x, z); }
      if (!hit) continue;
      const from = a.what === 'cross' ? a.c : a.o;
      const dx = x - from.x; const dz = z - from.z;
      const n = Math.hypot(dx, dz) || 1;
      // `from` and `foe`: a 返 Riposte guard toward him catches it and answers him.
      this.dream.simHit(p, { dmg: A.dmg, push: { x: dx / n, z: dz / n }, src: 'shadow', from, foe: b });
    }
    // The tell turns white for a blink, then goes: the blade came down HERE.
    for (const m of a.meshes) {
      m.material.color.set(0xffffff);
      this.flashes.push({ mesh: m, t: 0.35 });
    }
    this.tells = this.tells.filter((t) => !a.meshes.includes(t.mesh));
    this.dream.game.sfx?.(a.what === 'sweep' ? 'sweep' : 'smash');
    b.blade.rotation.z = -0.25;
    if (a.what === 'cross') {
      b.open = CROSS.open;
      this.act = { kind: 'recover', what: 'cross', t: CROSS.open };
      for (const { p } of this.who.values()) this.dream.hint(p, 'he is OPEN — hit him now, every blow counts TWICE!');
    } else {
      this.act = { kind: 'recover', what: a.what, t: a.what === 'slam' ? SLAM.recover : SWEEP.recover };
    }
  }

  _paint() {
    const b = this.boss;
    this.panel.visible = true;
    if (this.view) {
      /* AT HIS SIDE, not over his head: from the fight's shot the space over
         his head is under the HUD's pills and toasts. Screen-right of a lens
         looking along `view` is view x up = (-view.z, view.x). */
      this.panel.position.set(
        b.local.x - this.view.z * PANEL_SIDE, b.local.y + SHADOW_H * 0.62, b.local.z + this.view.x * PANEL_SIDE
      );
    } else this.panel.position.set(b.local.x, b.local.y + SHADOW_H + 2.6, b.local.z);
    const lines = [{ text: '影 SHADOW LIONHEART', size: 1.9, color: 0xc89bff, glow: true, jp: true }];
    if (this.say && (this.sayT > 0 || this.dream.voice?.saying(this.say))) {
      for (const l of this.say.split('\n')) lines.push({ text: l, size: 1.4 });
    } else if (this.state === 'live') {
      const left = Math.max(0, SHADOW_T - this.t);
      lines.push({ text: `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}  ·  ${this.who.size} fighting${this.phase === 2 ? '  ·  PHASE 2' : ''}`, size: 1.4 });
      if (b.open > 0) lines.push({ text: 'OPEN! ×2', size: 1.5, color: HOLO.gold, glow: true });
    }
    this.panel.set(lines, b.open > 0 ? HOLO.gold : 0x9b4dff);
  }

  /** Her camera while she is in the fight (and while it is being called), or
   *  null. A FOCUS, like the Dojo's: main.js hands it to `setFocus` and the
   *  player's camera eases in and out of it on its own focusT. */
  cameraFocus(p) {
    const b = this.boss;
    if (!b || this.state === 'waiting' || !this.who.has(p.index)) return null;
    const c = (this._shots ??= new Map()).get(p.index) ?? new THREE.Vector3();
    this._shots.set(p.index, c);
    c.set(
      p.position.x + (b.local.x + SIM.dx - p.position.x) * SHOT.mix,
      p.position.y + SHOT.lift,
      p.position.z + (b.local.z + SIM.dz - p.position.z) * SHOT.mix
    );
    const f = (this._focus ??= new Map()).get(p.index) ?? { centre: c, aim: true, dist: SHOT.dist, pitch: SHOT.pitch };
    this._focus.set(p.index, f);
    return f;
  }

  faceCamera(camera) {
    this.kiosk.faceCamera(camera);
    camera.getWorldDirection(_v);
    const n = Math.hypot(_v.x, _v.z);
    if (n > 1e-6) this.view = { x: _v.x / n, z: _v.z / n };
    let veil = 1;
    if (this.boss && this.view) {
      const cam = { x: camera.position.x - SIM.dx, z: camera.position.z - SIM.dz };
      for (const { p } of this.who.values()) {
        if (blocks(cam, this.view, this.boss.local, { x: p.position.x - SIM.dx, z: p.position.z - SIM.dz })) veil = VEIL;
      }
    }
    if (this.panel.visible) {
      this.panel.faceCamera(camera);
      this.panel.mat.opacity = veil;
    }
    this.boss?.faceCamera(camera, veil);
  }

  /** Everybody out (a reset, the last one disconnecting): no fight left half-run. */
  dispose() { this._reset(); }
}

const _e = new THREE.Euler();
const _v = new THREE.Vector3();
