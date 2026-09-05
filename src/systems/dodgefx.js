/* ---------------------------------------------------------------------------
   瞬 FLASH STEP, made visible.

   Three things the move is otherwise silent about:

     THE LOCK. When she presses, the game picks whoever she is closest to
     looking at and pivots her landing around them (`Player._dodgeTargetFor`).
     That is an enormous thing to decide on somebody's behalf and never show
     them — so an eight-bit target ring in the ATTACKER'S colour snaps down onto
     whoever was chosen, holds for the whole move, and springs open again when
     it is over. The girl being circled gets the same half-second of warning
     the Cross Slash's wind-up gives her, and she can tell WHO from the colour.

     THE VANISH. She stops being drawn (see `Player._updateFeedback`), and a
     sprite that simply switches off reads as the game dropping a frame. So the
     spot she left gets a puff of smoke — soft, white, cartoon, nothing sharp,
     the same rule `Menagerie._poof` follows.

     AND THE THING LEFT BEHIND. A ninja vanish leaves a log. This one leaves a
     log, or her own bow tie, or a scarf, or a boiled sweet the size of her
     head, or — if she has sworn — her clan's emblem on a little post. It is
     drawn from a cycle so two dodges in a row are two different jokes, and
     every one of them is procedural geometry: no sheet to load, nothing to
     miss, nothing to degrade.

   ------------------------------------------------------------------ WHY HERE

   NOTHING IN THIS FILE IS DRIVEN BY A CALLBACK, and it is the same argument
   `systems/crossfx.js` makes at length. `update` reads the kitten's own clocks
   — `dodgeT`, `dodgeLockT`, `dodgePlaced`, `dodgeSeq` — and derives what should
   be on screen. A Flash Step can end in six ways (it runs out, she is knocked
   out mid-vanish, the round resets under her, she is dragged onto a dragon,
   `_clearSpecials` fires, the game restarts), a callback would be one path per
   ending, and the one that got missed would leave a target ring welded to
   somebody's head for the rest of the afternoon. Nothing may be stranded.

   `dodgeSeq` IS WHY IT CAN TELL TWO DODGES APART. A clock alone cannot: two of
   them a frame apart look identical to `dodgeT > 0`, and the decoy would be
   dropped once for both. It only ever counts up, and `Player._clearSpecials`
   deliberately does not reset it.

   ----------------------------------------------------------- WHY IT IS LEAN

   The game is fill-bound — frame time is a straight line in the size of the
   drawing buffer, see docs/notes/performance.md — so this is transparent
   overdraw, which is the expensive kind. One reticle per player, built the
   first time she locks somebody and reused for ever; a fixed pool of decoys
   that is never grown; everything `visible = false` the instant its clock runs
   out. A kitten who never buys the orb allocates none of it.
--------------------------------------------------------------------------- */

import * as THREE from 'three';
import { toonMat } from '../core/gfx.js';
import { ORB_BY_ID } from '../entities/powerorb.js';

/** The orb's own jade, read from the table rather than restated — the shelf,
 *  the profile card and the orb itself are already this colour and a fourth
 *  copy of it is the one that ends up a different green. */
const JADE = ORB_BY_ID.blink?.color ?? 0x21d6a8;

/** How long the ring takes to snap shut, and to spring open again. */
const NARROW = 0.14;
const OPEN = 0.26;
/** How long a decoy stands there before it puffs out. Comfortably longer than
 *  the move itself (2 x `DODGE.invuln` = 1s), so the joke is still on the floor
 *  when she lands and can be seen NEXT to her. */
const DECOY = 1.45;
/** How many decoys may be on the ground at once. Four kittens, one each, plus
 *  one for a fast second dodge. Never grown. */
const DECOYS = 5;

/* ------------------------------- the reticle ------------------------------ */

let _ring = null;

function canvas(w, h) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * An eight-bit target ring, drawn as SQUARES on a 32-square grid.
 *
 * IT IS PIXEL ART AND NOT A SMOOTH RING, and that is the whole brief — "an
 * 8-bit looking circular target". So it is built by asking, for every cell of a
 * 32x32 grid, whether that cell's centre falls inside the band; the result has
 * hard stair-stepped edges by construction rather than by filtering. Drawn
 * white so a single texture can be tinted to any player's colour by the
 * material, exactly like the marker ring under her feet.
 *
 * FOUR BRACKETS AND A GAP AT EACH DIAGONAL, because a closed ring is
 * rotationally symmetric and spinning one is a free frame that looks exactly
 * like a still one — the same reason `crossfx`'s aura rings are arcs.
 */
function ringTexture() {
  if (_ring) return _ring;
  const N = 32;
  const PX = 8;
  const c = canvas(N * PX, N * PX);
  if (!c) return null;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  const mid = (N - 1) / 2;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x - mid;
      const dy = y - mid;
      const r = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      /* The band, and the four bites out of it. `Math.cos(4a)` is +1 on the
         diagonals and -1 on the axes, so cutting where it is high leaves four
         brackets centred on up, down, left and right. */
      const band = r > 10.2 && r < 13.2 && Math.cos(4 * a) < 0.55;
      /* Four tick marks reaching inward from the middle of each bracket, and a
         two-by-two pip dead centre. The pip is what makes it read as a SIGHT
         rather than as a decorative circle at the size it is actually seen. */
      const tick = r > 6.4 && r <= 9.2
        && (Math.abs(dx) < 0.9 || Math.abs(dy) < 0.9);
      const pip = r < 1.6;
      if (band || tick || pip) g.fillRect(x * PX, y * PX, PX, PX);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  /* NEAREST, AND IT IS THE ONE SETTING THAT MAKES THIS EIGHT-BIT. Linear
     filtering on a stair-stepped edge is a blur, which is the exact opposite of
     the look — and mipmaps would do it again at every distance. */
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  _ring = t;
  return t;
}

/* -------------------------------- decoys ---------------------------------- */

/**
 * What she leaves behind, in the order the cycle walks them.
 *
 * FIVE JOKES AND THE FIRST ONE IS EVERYBODY'S. The log is the reference — it is
 * what a ninja vanish leaves, it is the one every kid watching will recognise,
 * and it is the reason the other four read as variations rather than as random
 * objects. The middle three are HERS: they take her own colour, so a decoy on
 * the far side of the ring says who vanished as well as that somebody did. The
 * last is her clan's, and it is the only one that can be unavailable — an
 * unsworn kitten simply never draws it, which is why the picker filters rather
 * than indexing.
 */
const KINDS = ['log', 'bow', 'scarf', 'candy', 'emblem'];

function buildDecoy(kind, colour, clanColour) {
  const g = new THREE.Group();
  /* THE HOUSE MATERIAL, so a bow tie lying on a beach is lit by the same
     four-step ramp the beach is. Every solid in this game is `toonMat`; a
     Lambert or a Basic here would be the one object in the world that does not
     belong to it, which at a decoy's size reads as a bug rather than as a
     style. `emissive` on the coloured pieces so her own colour survives being
     dropped in a shadow — the marker under her feet does the same. */
  const mat = (hex, glow = 0) => toonMat({
    color: hex, emissive: hex, emissiveIntensity: glow,
  });

  if (kind === 'log') {
    /* A LOG, LYING DOWN. Rotated onto its side rather than modelled that way,
       so the end caps line up with the barrel by construction. */
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.44, 1.7, 10), mat(0x8a5a33));
    body.rotation.z = Math.PI / 2;
    body.rotation.y = 0.2;
    g.add(body);
    for (const s of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.CircleGeometry(0.42, 10), mat(0xc59a63));
      cap.position.set(s * 0.86, 0, 0);
      cap.rotation.y = s * Math.PI / 2;
      g.add(cap);
    }
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mat(0x5c3a20));
    knot.position.set(0.1, 0.3, 0.22);
    g.add(knot);
    g.position.y = 0.44;
    return g;
  }

  if (kind === 'bow') {
    // Two cones point to point, and a knot where they meet.
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.72, 6), mat(colour, 0.25));
      wing.rotation.z = s * Math.PI / 2;
      wing.position.x = s * 0.36;
      g.add(wing);
    }
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), mat(colour, 0.4)));
    g.position.y = 0.8;
    return g;
  }

  if (kind === 'scarf') {
    // A ribbon in four segments, each one turned a little further than the
    // last, so it reads as cloth that fell rather than as a stack of boxes.
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.07, 0.24),
        mat(colour, 0.2)
      );
      seg.position.set(i * 0.5 - 0.75, Math.sin(i * 1.4) * 0.16, Math.cos(i * 1.1) * 0.12);
      seg.rotation.z = Math.sin(i * 2.1) * 0.5;
      seg.rotation.y = i * 0.5;
      g.add(seg);
    }
    g.position.y = 0.4;
    return g;
  }

  if (kind === 'candy') {
    // A boiled sweet the size of her head, wrapper twists and all.
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 10), mat(colour, 0.35)));
    for (const s of [-1, 1]) {
      const twist = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 7), mat(0xfff2d0, 0.15));
      twist.rotation.z = s * Math.PI / 2;
      twist.position.x = s * 0.66;
      g.add(twist);
    }
    g.position.y = 0.55;
    return g;
  }

  // emblem: her clan's colour on a little post.
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.0, 6), mat(0x6b4a2f));
  post.position.y = -0.4;
  g.add(post);
  const disc = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.11, 6, 12), mat(clanColour, 0.5));
  g.add(disc);
  const spike = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.36, 5), mat(clanColour, 0.5));
  spike.position.y = 0.44;
  g.add(spike);
  g.position.y = 0.9;
  return g;
}

export class DodgeFx {
  constructor(scene) {
    this.scene = scene;
    /** One reticle per player index, built the first time she locks somebody. */
    this.rigs = new Map();
    /** A fixed ring buffer of decoys. Built lazily, never grown. */
    this.decoys = [];
    this.decoyIx = 0;
    /** Which `dodgeSeq` each seat was last seen dropping a decoy for. */
    this.seen = new Map();
    /** Which decoy kind each seat gets next. Per player rather than global, so
     *  two kittens dodging at once do not both get the log. */
    this.turn = new Map();
  }

  /** Everything back to nothing — a restart must not leave a target ring on
   *  somebody who is about to be a different player. */
  reset() {
    for (const r of this.rigs.values()) {
      r.sprite.visible = false;
      r.on = false;
      r.outT = 0;
    }
    for (const d of this.decoys) {
      d.group.visible = false;
      d.t = 0;
    }
    this.seen.clear();
  }

  _rig(p) {
    let r = this.rigs.get(p.index);
    if (r) return r;
    const tex = ringTexture();
    if (!tex) return null;                       // headless; nothing to draw
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex,
      color: p.style?.colour ?? JADE,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    }));
    /* A SPRITE, NOT A HAND-TURNED BILLBOARD, and up to four cameras is the
       reason: three.js turns a Sprite during EACH pane's render, so the ring
       faces all four at once. A billboard turned once per frame faces whichever
       camera asked last, which in split screen means it is edge-on in three of
       the four panes. Same argument as `crossfx`'s crackle. */
    sprite.renderOrder = 26;
    sprite.visible = false;
    this.scene.add(sprite);
    r = { sprite, on: false, t: 0, outT: 0, at: new THREE.Vector3() };
    this.rigs.set(p.index, r);
    return r;
  }

  _decoy() {
    if (!this.decoys.length) {
      for (let i = 0; i < DECOYS; i++) {
        const group = new THREE.Group();
        group.visible = false;
        this.scene.add(group);
        /* THE PUFF IS PART OF THE DECOY AND NOT A SECOND POOL. They are one
           event — she is gone and this is here — and two pools would be two
           clocks that can disagree about how long that event lasted. */
        const puff = [0, 1, 2, 3].map(() => {
          const m = new THREE.Mesh(
            new THREE.SphereGeometry(0.5, 10, 8),
            new THREE.MeshBasicMaterial({
              color: 0xfff6e0, transparent: true, opacity: 0,
              depthWrite: false, toneMapped: false,
            })
          );
          m.renderOrder = 24;
          group.add(m);
          return m;
        });
        this.decoys.push({ group, puff, prop: null, t: 0, spin: 0 });
      }
    }
    const d = this.decoys[this.decoyIx];
    this.decoyIx = (this.decoyIx + 1) % this.decoys.length;
    return d;
  }

  /**
   * Drop the smoke and the joke on the spot she left.
   *
   * THE PROP IS REBUILT EVERY TIME AND THE OLD ONE IS DISPOSED. Five shapes
   * across four kittens with two colour schemes each is twenty rigs to cache
   * for something that appears for a second and a half; building one is a
   * handful of small buffers, and the pool bounds how many can exist at once.
   * Caching would be the optimisation that costs more memory than it saves.
   */
  _drop(p) {
    const d = this._decoy();
    /* AN UNSWORN KITTEN NEVER DRAWS THE EMBLEM, which is why this filters the
       list instead of rolling an index into it and re-rolling on a miss: a
       re-roll makes the OTHER four rarer for her than for her sister, for no
       reason a player could ever work out.

       THE CYCLE IS PER SEAT AND WALKS BY A RANDOM STRIDE. A plain rotation is
       predictable after five dodges; a plain random draw repeats itself
       immediately about a fifth of the time, which reads as the feature being
       broken rather than as luck. Stepping one or two places on each use is
       neither: no immediate repeats, no learnable order. The first one she
       ever throws starts wherever the dice fell. */
    const kinds = KINDS.filter((k) => k !== 'emblem' || p.clan);
    const ix = (this.turn.get(p.index) ?? Math.floor(Math.random() * kinds.length)) % kinds.length;
    this.turn.set(p.index, (ix + 1 + Math.floor(Math.random() * 2)) % kinds.length);
    const kind = kinds[ix];

    if (d.prop) {
      d.group.remove(d.prop);
      d.prop.traverse?.((o) => {
        o.geometry?.dispose?.();
        o.material?.dispose?.();
      });
    }
    d.prop = buildDecoy(kind, p.style?.colour ?? JADE, p.clan?.color ?? 0xffffff);
    d.group.add(d.prop);
    d.group.position.copy(p.dodgeFrom);
    d.group.rotation.y = p.facing + (Math.random() - 0.5) * 1.2;
    d.t = DECOY;
    d.spin = (Math.random() - 0.5) * 2.4;
    d.group.visible = true;
  }

  update(dt, players) {
    for (const p of players ?? []) {
      if (!p) continue;

      /* --- the decoy, dropped on the frame she actually leaves ---
         `dodgePlaced` is the commit, which is four fifths of the way through
         the vanish and the moment her sprite stops being drawn — so the smoke
         and the log arrive exactly as she does not. Guarded on `dodgeSeq` so
         that a second Flash Step gets its own, and the same one never fires
         twice on the frames after the commit. */
      if (p.dodgeT > 0 && p.dodgePlaced && this.seen.get(p.index) !== p.dodgeSeq) {
        this.seen.set(p.index, p.dodgeSeq);
        this._drop(p);
      }

      const locked = p.dodgePlanted && p.dodgeTarget && !p.dodgeTarget.ko;
      const r = locked ? this._rig(p) : this.rigs.get(p.index);
      if (!r) continue;

      if (locked) {
        if (!r.on) { r.on = true; r.t = 0; r.outT = 0; }
        r.t += dt;
        const q = p.dodgeTarget;
        /* ON HER HEAD, NOT ON HER FEET. A ring on the floor is read as a thing
           on the floor — the marker under every kitten already is one — and
           this has to be read as a thing ON HER. */
        r.at.set(q.position.x, q.position.y + (q.height ?? 2.9) * 0.62, q.position.z);
        r.sprite.position.copy(r.at);
        /* NARROWS IN. Starts three and a bit times too big and snaps down over
           `NARROW`, eased so it decelerates into the lock rather than arriving
           at a constant rate — a ring that closes linearly reads as a UI
           element resizing, one that slams and settles reads as a lock. */
        const k = Math.min(1, r.t / NARROW);
        const ease = 1 - (1 - k) * (1 - k) * (1 - k);
        const size = (q.height ?? 2.9) * (1.05 + (1 - ease) * 2.4);
        /* ...AND THEN BREATHES. Held perfectly still it stops reading as live
           after about a third of a second, which is most of the time it is on
           screen. */
        const beat = 1 + Math.sin(r.t * 18) * 0.035 * ease;
        r.sprite.scale.setScalar(size * beat);
        r.sprite.material.rotation = r.t * 1.6;
        r.sprite.material.opacity = 0.45 + 0.5 * ease;
        r.sprite.visible = true;
      } else if (r.on) {
        /* --- and it springs open when the move ends ---
           EXPANDING, NOT FADING IN PLACE. "The target will unlock and expand
           out" — and it is also the only shape that cannot be confused with
           the ring narrowing, which matters when two kittens are dodging past
           each other. */
        r.on = false;
        r.outT = OPEN;
      }

      if (!r.on && r.outT > 0) {
        r.outT = Math.max(0, r.outT - dt);
        const k = 1 - r.outT / OPEN;
        const base = (p.dodgeTarget?.height ?? 2.9) * 1.05;
        r.sprite.position.copy(r.at);
        r.sprite.scale.setScalar(base * (1 + k * 1.6));
        r.sprite.material.rotation += dt * 3.2;
        r.sprite.material.opacity = (1 - k) * 0.8;
        if (r.outT === 0) r.sprite.visible = false;
      }
    }

    this._updateDecoys(dt);
  }

  _updateDecoys(dt) {
    for (const d of this.decoys) {
      if (d.t <= 0) continue;
      d.t -= dt;
      if (d.t <= 0) { d.group.visible = false; continue; }
      const age = DECOY - d.t;

      /* The puff: four soft balls out and up, over the first fifth of a second,
         and then gone. Soft white and nothing sharp — this is a cartoon
         disappearing, the same rule `Menagerie._poof` states. */
      const s = Math.min(1, age / 0.24);
      d.puff.forEach((m, i) => {
        const a = (i / d.puff.length) * Math.PI * 2 + 0.4;
        const rr = s * 1.5;
        m.position.set(Math.cos(a) * rr, 0.5 + s * 1.2, Math.sin(a) * rr);
        m.scale.setScalar(0.55 + s * 1.35);
        m.material.opacity = (1 - s) * 0.9;
      });

      if (!d.prop) continue;
      /* The joke pops up out of the smoke, sits, and shrinks away. `pop` is a
         single overshoot rather than a spring: one bounce is funny, three is
         a physics demo. */
      const pop = age < 0.18 ? Math.sin((age / 0.18) * Math.PI * 0.72) * 1.28 : 1;
      const outK = d.t < 0.3 ? d.t / 0.3 : 1;
      d.prop.scale.setScalar(Math.max(0.001, pop * outK));
      d.prop.rotation.y += dt * d.spin;
    }
  }
}
