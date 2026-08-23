/* ---------------------------------------------------------------------------
   The Cross Slash, made visible.

   Two things that were only ever numbers and a toast:

     THE TELL. `CROSS.wind` is a quarter of a second in which she is planted,
     committed and has thrown nothing — it exists, in the words of the comment
     on `_startWind`, so that the announcement is "a tell they can act on, and
     a tell nobody can act on is decoration". It was a line of text at the top
     of a screen four people are sharing. Now she visibly winds up: rings of
     her own colour draw in and rise up her body, and the air around her
     cracks. A sister three panes away can see it happening to somebody and
     move.

     THE SEAL. Each cut draws a stroke in the air in front of her — two
     verticals, then two horizontals closing the box, then the orb's own 十 in
     the middle of it, pulsing. When the technique lets go, the whole thing
     blows apart along the direction everybody it caught was just thrown.

   Reference: out/trailer/shots/s10.png, which is the game's own trailer art —
   hot pink energy, white-hot cores, a ring around the fight. The colours here
   are that painting's, not a new palette.

   ------------------------------------------------------------------ WHY HERE

   NOTHING IN THIS FILE IS DRIVEN BY A CALLBACK, and that is the whole design.
   `update` reads the kitten's own clocks — `triWindT`, `triLeft`, `triT`,
   `triHangT` — and derives what should be on screen this frame. It is the same
   argument `Game._updateTripleHolds` makes for itself one screen further down
   main.js, and it is load-bearing for the same reason: the technique can end
   in five different ways (three cuts and the pause, a hit during the wind-up,
   a knockout, a ring-out, `_clearSpecials` dragging her onto a dragon), a
   callback would be one path per ending, and the one that got missed would
   leave a glowing seal hanging in the air over the arena for the rest of the
   afternoon. Nothing may be stranded.

   It also means `player.js` is untouched by this feature. The combat code is
   the most-reworked and most-checked code in the repo and none of it had to
   move to put a light show on top of it.

   ------------------------------------------------------- WHY IT LOOKS SOLID

   THE BOLTS ARE `THREE.Sprite`s AND THE RINGS LIE FLAT. Up to four cameras are
   looking at this at once, from four directions, and a hand-turned billboard
   is turned once per frame — toward whichever camera happened to ask last.
   three.js turns a Sprite during EACH pane's render, so the crackle faces all
   four at the same time. The rings are horizontal, so they have no bad angle.
   Same reason the clan emblem is a Sprite; see entities/player.js.

   THE SEAL IS NOT BILLBOARDED, ON PURPOSE. It is a thing hanging in the air
   where she cut it, so it faces the way she was facing — which is toward
   whoever she is cutting, so the victim and the attacker both get it square
   on, and a sister watching from the side correctly sees it edge-on. Turning
   it to the camera would make it a HUD element pretending to be scenery.

   ------------------------------------------------------------ WHY IT IS LEAN

   The game is fill-bound — frame time is a straight line in the size of the
   drawing buffer, see docs/notes/performance.md — so this is all transparent
   overdraw, which is the expensive kind. Two rules keep it cheap: one rig per
   player, built the first time she throws one and reused for ever after, and
   every mesh `visible = false` the instant its clock runs out. A kitten who
   never picks up the orb never allocates any of it.
--------------------------------------------------------------------------- */

import * as THREE from 'three';
import { CROSS, ORB_BY_ID } from '../entities/powerorb.js';

/** The orb's own pink. Read from the table rather than restated — the trailer
 *  card, the profile screen and the orb itself are all already this colour,
 *  and a fourth copy of it is the one that ends up a different pink. */
const PINK = ORB_BY_ID.tri?.color ?? 0xff6fae;
/** The outline under every stroke: black with a little plum in it, the same
 *  ink `tools/brush-kanji.mjs` uses. Without it a pale stroke over a bright
 *  sky is invisible, which is the same reason every label in this HUD is
 *  outlined. */
const INK = '#1b0f16';

/** How long a stroke takes to draw itself on. Deliberately well under
 *  `CROSS.gap` (0.3): the stroke has to finish and be READ before the next cut
 *  lands, or three cuts arrive as one smear. */
const DRAW = 0.13;
/** ...and how long the pieces fly for once it lets go. */
const BURST = 0.55;
/** The seal's side, in world units, and how far in front of her it hangs.
 *  2.6 is just outside `ATTACKS.stand.reach` (3.4) at the near edge, so it
 *  frames the space the cuts actually sweep rather than sitting on her nose. */
const SEAL = 2.4;
const AHEAD = 2.6;

/* ============================================================== the canvases

   Built once, lazily, and shared by every player. THE GUARD IS NOT DEFENSIVE
   PROGRAMMING: `tools/world-check.mjs` imports this module in node to test the
   pure half, and `document` does not exist there. Returning null rather than
   throwing is what lets the stage logic below be checked headlessly.
=========================================================================== */

let _bar = null;
let _bolt = null;
let _kanji = null;

function canvas(w, h) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function texture(c) {
  if (!c) return null;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  /* No mipmaps and linear filtering: these are drawn at one size on screen and
     never minified far, and a mip chain on three canvases is memory this game
     has already been careful about elsewhere (see core/device.js). */
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  return t;
}

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

/**
 * One brush stroke, tapered at both ends, lying along the canvas.
 *
 * WHY A TEXTURE AND NOT A THIN BOX. A box has square ends, and four boxes make
 * a picture frame rather than four sword cuts. The taper is the entire
 * difference between "somebody drew a box here" and "somebody cut one".
 */
function barTexture() {
  if (_bar) return _bar;
  const W = 256;
  const H = 32;
  const c = canvas(W, H);
  if (!c) return null;
  const g = c.getContext('2d');
  /* The profile: pressed in near the start, thinnest across the middle,
     swelling before it lifts. Same shape as the horizontal in
     tools/brush-kanji.mjs, which is where the argument for it is written down
     — a stroke of constant width reads as a ruled line. */
  const half = (t) => {
    const stops = [[0, 2], [0.08, 11], [0.55, 8], [0.92, 12], [1, 1.5]];
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const [t0, w0] = stops[i - 1];
        const [t1, w1] = stops[i];
        return w0 + (w1 - w0) * ((t - t0) / (t1 - t0 || 1));
      }
    }
    return 1.5;
  };
  const pass = (grow, style, blur = 0) => {
    g.save();
    g.strokeStyle = style;
    g.lineCap = 'round';
    g.shadowColor = style;
    g.shadowBlur = blur;
    const steps = 96;
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      /* CLAMPED, because the core pass subtracts more than the taper is wide.
         A negative lineWidth is not an error in Canvas2D — it is IGNORED, so
         the stroke silently keeps the width of the previous segment and the
         spine ends in a blob instead of a point. */
      g.lineWidth = Math.max(0.4, (half((t0 + t1) / 2) + grow) * 2);
      g.beginPath();
      g.moveTo(4 + t0 * (W - 8), H / 2);
      g.lineTo(4 + t1 * (W - 8), H / 2);
      g.stroke();
    }
    g.restore();
  };
  /* THE CORE IS A SPINE, NOT A FILL, and the first version got this wrong in a
     way only a measurement caught. `-4` off a stroke whose half-width peaks at
     12 leaves a white core two thirds as wide as the stroke: sampled off the
     canvas it came out ~30% solid white rows, and on screen over a bright
     green field the whole seal read as a plain white picture frame with a pink
     rim. The technique's colour has to be the colour of the thing. */
  pass(3.5, INK);                  // the outline
  pass(0, hex(PINK), 7);           // the colour, and the bloom the trailer has
  pass(-8.5, '#ffffff');           // a thin white-hot spine down the middle
  _bar = texture(c);
  return _bar;
}

/**
 * A crackle of lightning, for the wind-up.
 *
 * DRAWN RATHER THAN RANDOMISED PER FRAME. One jagged shape reused at random
 * positions, rotations and mirrorings reads as crackle; regenerating the
 * geometry every frame costs a texture upload sixty times a second for a
 * difference nobody can see at this size and this speed.
 */
function boltTexture() {
  if (_bolt) return _bolt;
  const S = 128;
  const c = canvas(S, S);
  if (!c) return null;
  const g = c.getContext('2d');
  const zig = [[0.52, 0.02], [0.36, 0.34], [0.56, 0.40], [0.34, 0.72], [0.60, 0.62], [0.44, 0.98]];
  const branch = [[0.44, 0.55], [0.20, 0.66], [0.30, 0.78]];
  const draw = (pts, w, style, blur) => {
    g.save();
    g.shadowColor = style;
    g.shadowBlur = blur;
    g.strokeStyle = style;
    g.lineWidth = w;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x * S, y * S) : g.moveTo(x * S, y * S)));
    g.stroke();
    g.restore();
  };
  draw(zig, 13, hex(PINK), 18);
  draw(branch, 8, hex(PINK), 14);
  draw(zig, 5, '#ffffff', 6);
  draw(branch, 3, '#ffffff', 5);
  _bolt = texture(c);
  return _bolt;
}

/* 十 — the orb's kanji, as two brush strokes rather than as type.
 *
 * PORTED FROM tools/brush-kanji.mjs, WHICH EXISTS BECAUSE TYPING IT LOOKS
 * WRONG. That file's header is the argument in full: a typed 十 at size is two
 * hairlines, fattening them gives a bolder PLUS SIGN, and the only Japanese
 * faces on the machine are geometric sans with nothing to fall back to. The
 * horizontal rising five degrees, and the vertical tapering to a dew-drop
 * foot, are the whole difference between a kanji and arithmetic — and this is
 * the second place the glyph "has to carry a frame on its own", which is the
 * exact condition that file says it was written for.
 *
 * IT IS RE-DRAWN HERE RATHER THAN LOADED AS A PNG. Ninth non-negotiable:
 * everything is procedural. A 20KB image in `public/` would also be a file the
 * game could be deployed without, and a Cross Slash with a hole where its
 * kanji should be is worse than one that draws it every boot. Canvas2D strokes
 * short round-capped segments along the same beziers with the same width
 * profiles, which is the union of the same disks the tool rasterises by hand —
 * the browser just does the coverage maths instead of us. */
/* THE GLYPH IS DRAWN BOLDER HERE THAN THE TOOL DRAWS IT, and the number came
   off a measurement rather than a preference. `brush-kanji.mjs` sizes its
   strokes to stand alone on a blank card; here the 十 hangs inside a box whose
   four bars are 0.35 world units thick, and at the tool's weight the glyph's
   own strokes come out 0.15 — less than half — so from the far side of the
   garden the box read as a box with nothing in it. Multiplying the WHOLE width
   profile, grows included, keeps the taper and the ink outline and the white
   spine all in the proportions the measurement above settled. */
const KANJI_BOLD = 1.85;

const KANJI_STROKES = [
  {                         // 一, rising slightly to the right
    p: [[36, 238], [160, 216], [300, 204], [438, 196]],
    w: [[0, 19], [0.08, 22], [0.6, 15], [0.93, 22], [1, 9]],
  },
  {                         // 丨, widest under the shoulder, tapering to a point
    p: [[248, 44], [242, 176], [236, 316], [228, 470]],
    w: [[0, 17], [0.1, 25], [0.55, 21], [0.85, 17], [1, 5]],
  },
];

function kanjiTexture() {
  if (_kanji) return _kanji;
  const S = 256;
  const c = canvas(S, S);
  if (!c) return null;
  const g = c.getContext('2d');
  const bez = (p, t) => {
    const u = 1 - t;
    return [
      u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0],
      u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1],
    ];
  };
  const at = (stops, t) => {
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const [t0, w0] = stops[i - 1];
        const [t1, w1] = stops[i];
        return w0 + (w1 - w0) * ((t - t0) / (t1 - t0 || 1));
      }
    }
    return stops[stops.length - 1][1];
  };
  const pass = (grow, style, blur = 0) => {
    g.save();
    g.strokeStyle = style;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.shadowColor = style;
    g.shadowBlur = blur;
    for (const s of KANJI_STROKES) {
      const steps = 120;
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps;
        const t1 = (i + 1) / steps;
        const a = bez(s.p, t0);
        const b = bez(s.p, t1);
        /* No `* k` here: the fitting transform below carries the scale, and
           Canvas2D scales lineWidth with it. Doing both would square it. */
        g.lineWidth = Math.max(0.5, (at(s.w, (t0 + t1) / 2) + grow) * KANJI_BOLD * 2);
        g.beginPath();
        g.moveTo(a[0], a[1]);
        g.lineTo(b[0], b[1]);
        g.stroke();
      }
    }
    g.restore();
  };
  /* Same spine-not-fill correction as the bar, and the same measurement behind
     it: the strokes are 15-25 wide, so -7 was a core two thirds of the glyph
     and the 十 came out white. */
  const paint = () => {
    pass(6, INK);
    pass(0, hex(PINK), 9);
    pass(-15, '#ffffff');
  };

  /* DRAWN TWICE, AND THE FIRST ONE IS A MEASUREMENT.
     House rule: measure, don't reason, about anything drawn. The 520-box
     coordinates say where the strokes' CENTRELINES go and say nothing about
     where the ink ends up, and the ink is what has to fit — it is the widths
     that decide that, and `KANJI_BOLD` had just changed all of them. Reasoned
     from the coordinates, the glyph looked centred; drawn, it pushed off the
     left edge of its own texture and sat high in the box, because the
     horizontal's brush is fattest at 8% and 93% along and hangs outside the
     end points by that much again.
     So: paint it once at the nominal scale, read the alpha bounds off the
     canvas, and paint it again with a transform that puts THOSE in the middle.
     Costs one canvas draw at boot, once, and it stays right if anybody
     re-weights a stroke. */
  const k0 = S / 520;                      // the strokes are laid out in a 520 box
  g.setTransform(k0, 0, 0, k0, 0, 0);
  paint();
  const box = inkBounds(g, S, S);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, S, S);
  if (box) {
    /* A margin, so the glyph's glow is not clipped by its own edge and so it
       does not touch the box drawn around it. */
    const fit = (S * 0.88) / Math.max(box.w, box.h);
    const sc = k0 * fit;
    g.setTransform(sc, 0, 0, sc,
      S / 2 - (box.x + box.w / 2) * fit,
      S / 2 - (box.y + box.h / 2) * fit);
  } else {
    g.setTransform(k0, 0, 0, k0, 0, 0);    // headless-ish: no pixels to read
  }
  paint();
  g.setTransform(1, 0, 0, 1, 0, 0);
  _kanji = texture(c);
  return _kanji;
}

/**
 * The bounding box of everything that is not transparent, in canvas pixels.
 *
 * Returns null rather than throwing if the pixels cannot be read — a tainted
 * or zero-sized canvas has to leave the caller with a glyph, not an exception
 * halfway through boot.
 */
function inkBounds(g, w, h) {
  let d;
  try {
    d = g.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  }
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      /* 24 of 255, not zero: the glow pass lays down a wide skirt of almost
         nothing, and fitting to THAT would shrink the glyph to nothing. */
      if (d[(y * w + x) * 4 + 3] < 24) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < x0 || y1 < y0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/* ================================================================ pure logic

   Split out and exported so `world-check` can assert the sequencing without a
   canvas, a GPU or a Game. Everything below this line that matters is a
   function of the kitten's own clocks.
=========================================================================== */

/**
 * How much of the seal should be on screen for this kitten, right now.
 *
 *   -1  nothing — she is not in a technique
 *    0  winding up: the aura, and not one stroke yet
 *  1..3 that many cuts have been thrown
 *
 * THE WIND-UP HAS TO BE TESTED FIRST. `triLeft` is zero before `_startTriple`
 * runs as well as after the last cut, so the subtraction below reads 3 during
 * the wind-up — the whole seal drawn before a single cut, which is the tell
 * telling the wrong story.
 */
export function sealStage(p) {
  if (!p?.triAt) return -1;
  if (p.triWindT > 0) return 0;
  return Math.max(0, Math.min(CROSS.cuts, CROSS.cuts - (p.triLeft ?? 0)));
}

/** Which of the four box sides are drawn by cut `n`. Cut 3 draws no side — it
 *  draws the kanji. Two sides per cut so that one katana stroke closes a
 *  readable half of the box; one side per cut would need four cuts. */
export const SIDES_BY_CUT = [[0, 1], [2, 3], []];

/* ================================================================= the rig */

export class CrossFx {
  constructor(scene) {
    this.scene = scene;
    /** One rig per player index, built on her first Cross Slash. */
    this.rigs = new Map();
  }

  /** Everything back to nothing. Called from restart, for the same reason the
   *  aloft pose and the clan ring are: a technique interrupted by a reset must
   *  not leave a seal hanging over the new game. */
  reset() {
    for (const r of this.rigs.values()) this._hide(r);
  }

  _rig(p) {
    let r = this.rigs.get(p.index);
    if (r) return r;

    const bar = barTexture();
    const bolt = boltTexture();
    const kan = kanjiTexture();
    if (!bar || !bolt || !kan) return null;      // headless; nothing to draw

    /* --- the aura: two flat rings and four sprites of crackle ---
       HER OWN COLOUR, and the seal's is the orb's. The two answer different
       questions and it is worth keeping them apart: the thing round her feet
       is "WHO is about to do this, and where is she", which in a four-player
       scrap is the question the warning exists for and the one her colour has
       always answered. The thing in the air is the TECHNIQUE, which has had
       its own pink since the orb did. */
    const rings = [0, 1].map((i) => {
      /* AN ARC, NOT A CLOSED RING, and that is not decoration: a full ring is
         rotationally symmetric, so spinning one is a free frame that looks
         exactly like a still one. Two broken arcs turning opposite ways are
         the whole reason the aura reads as SPINNING UP rather than as a
         target reticle sitting on the floor. */
      /* WIDE. The first pass used 0.9->1.05, a band 0.15 units across, and at
         the distance the camera actually sits it was a hairline nobody would
         see mid-fight — which for the one element whose whole job is to be
         seen from across the garden is the same as not drawing it. */
      const geo = new THREE.RingGeometry(0.74, 1.06 + i * 0.1, 30, 1, 0, Math.PI * 1.45);
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: p.style?.colour ?? 0xffffff,
        transparent: true, opacity: 0, depthWrite: false,
        side: THREE.DoubleSide, toneMapped: false,
      }));
      /* TILTED, AND THAT IS THE THIRD ANSWER TO THE SAME QUESTION. Flat on the
         floor these read from the world camera, which looks down, and vanish
         in the arena, which is where the technique is legal at all: a
         ground-parallel ring seen from an eye-height camera is a line, and a
         line drawn over her chest is not a warning, it is a glitch. Lifting
         them did not help — it moved the line up her body. Tilting the two
         discs opposite ways and precessing them about Y is a shape with no
         degenerate view: from above it is two ellipses turning, from the side
         it is two arcs orbiting her. */
      m.rotation.x = (i ? -1 : 1) * 0.62;
      /* DEPTH-TESTED, unlike the crackle. The sprites are meant to be in front
         of her — that is what makes them read as lightning between the camera
         and the cat. These are meant to be AROUND her, so her own body has to
         hide the far half; without that they paint bands across her and the
         eye reads a broken sprite rather than an effect. */
      m.renderOrder = 22;
      m.visible = false;
      this.scene.add(m);
      return m;
    });

    const bolts = [0, 1, 2, 3].map(() => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: bolt, transparent: true, opacity: 0, depthWrite: false,
        depthTest: false, toneMapped: false,
      }));
      s.renderOrder = 23;
      s.visible = false;
      this.scene.add(s);
      return s;
    });

    /* --- the seal ---
       A group whose +z is the direction she was facing, so `rotation.y =
       facing` aims it: a plane's normal is +z, and turning that by `facing`
       about Y gives (sin f, 0, cos f), which is exactly the vector `_doSlash`
       swings along. */
    const group = new THREE.Group();
    group.visible = false;
    this.scene.add(group);

    /* Each side's geometry is shifted so its LEFT END sits at the origin, and
       the draw-on is `scale.x`. That way a stroke grows out of the corner it
       starts at instead of swelling out of its own middle, which is what makes
       it read as a cut rather than as a bar fading in. */
    const barGeo = new THREE.PlaneGeometry(1, 0.44);
    barGeo.translate(0.5, 0, 0);
    const h = SEAL / 2;
    /* [x, y, rotation.z] — the two verticals fall from the top corners, the
       two horizontals run left to right. A katana cuts downward and across;
       strokes that grew upward would be the animation contradicting the pose. */
    const place = [
      [-h, h, -Math.PI / 2],
      [h, h, -Math.PI / 2],
      [-h, h, 0],
      [-h, -h, 0],
    ];
    const sides = place.map(([x, y, rz]) => {
      const m = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({
        map: bar, transparent: true, opacity: 0, depthWrite: false,
        side: THREE.DoubleSide, toneMapped: false,
      }));
      m.position.set(x, y, 0);
      m.rotation.z = rz;
      m.scale.set(SEAL, 1, 1);
      m.visible = false;
      group.add(m);
      return m;
    });

    const kanji = new THREE.Mesh(
      new THREE.PlaneGeometry(SEAL * 0.78, SEAL * 0.78),
      new THREE.MeshBasicMaterial({
        map: kan, transparent: true, opacity: 0, depthWrite: false,
        side: THREE.DoubleSide, toneMapped: false,
      })
    );
    kanji.visible = false;
    group.add(kanji);

    r = {
      rings, bolts, group, sides, kanji,
      stage: -1,
      /** Seconds since the current stroke started drawing. */
      drawT: 0,
      /** Seconds the completed seal has been pulsing. */
      pulseT: 0,
      /** Counts down while the pieces fly. */
      burstT: 0,
      boltT: 0,
      /** Where each piece is going, in the group's local frame. Local +z is
       *  world forward, which is why the burst needs no world maths at all. */
      vel: [...sides, kanji].map(() => new THREE.Vector3()),
      spin: [...sides, kanji].map(() => 0),
      home: [...sides, kanji].map((m) => m.position.clone()),
      homeRot: [...sides, kanji].map((m) => m.rotation.z),
    };
    this.rigs.set(p.index, r);
    return r;
  }

  _hide(r) {
    for (const m of r.rings) m.visible = false;
    for (const s of r.bolts) s.visible = false;
    r.group.visible = false;
    for (const m of r.sides) m.visible = false;
    r.kanji.visible = false;
    r.stage = -1;
    r.drawT = 0;
    r.pulseT = 0;
    r.burstT = 0;
  }

  /**
   * @param dt      seconds
   * @param players every kitten in the game
   */
  update(dt, players) {
    for (const p of players ?? []) {
      if (!p) continue;
      const stage = sealStage(p);
      const r = stage >= 0 ? this._rig(p) : this.rigs.get(p.index);
      if (!r) continue;
      if (stage >= 0) this._live(dt, p, r, stage);
      else this._fly(dt, r);
    }
  }

  /* --------------------------- while it runs ----------------------------- */

  _live(dt, p, r, stage) {
    /* A NEW TECHNIQUE OVER A BURST THAT HAS NOT FINISHED. The recovery is 0.75s
       and the pieces fly for 0.55, so this cannot happen from the same kitten
       — but a round reset can put her straight back into one, and pieces from
       the last life still drifting would be reassembled mid-flight. */
    if (r.burstT > 0) { r.burstT = 0; this._reassemble(r); }

    const grew = stage !== r.stage;
    if (grew) {
      r.drawT = 0;
      /* THE SEAL IS PLACED ONCE PER CUT, AND THEN HANGS UNTIL THE NEXT ONE. It
         is a thing she cut into the air, not a badge pinned to her chest — a
         seal that FOLLOWED her would slide sideways under her own knockback
         and read as a UI element, which is why this is not done every frame.

         IT USED TO BE PLACED ONLY ON CUT 1, and that was wrong for the move it
         is drawing. A kitten who turns between cuts is cutting somewhere else,
         and the strokes were still being added to a box hanging in the air
         behind her — so the second and third cuts landed nowhere near the seal
         that was supposed to be recording them. Re-placed on each cut it
         TELEPORTS to wherever the last stroke was thrown, which is exactly
         what a player who spins on the spot sees herself doing, and a player
         who stands still sees nothing move at all because the position she
         computes is the same one.

         Not during the wind-up, because the wind-up can be released, and a box
         drawn around nothing is a promise the game did not keep. */
      if (stage >= 1) {
        const f = new THREE.Vector3(Math.sin(p.facing), 0, Math.cos(p.facing));
        r.group.position.set(
          p.position.x + f.x * AHEAD,
          p.position.y + (p.height ?? 2) * 0.62,
          p.position.z + f.z * AHEAD
        );
        r.group.rotation.set(0, p.facing, 0);
        r.group.scale.setScalar(1);
        r.group.visible = true;
        /* ONLY THE FIRST CUT REBUILDS IT. `_reassemble` puts every piece back
           on its home offset, which is right for a rig reused from the last
           technique and wrong in the middle of this one — run on cut 2 it
           would undo nothing visible today, but it is the line that would
           quietly erase a burst or a stroke offset the moment either learns to
           persist. Placed on every cut, rebuilt on the first. */
        if (stage === 1) this._reassemble(r);
      }
      if (stage === CROSS.cuts) r.pulseT = 0;
      r.stage = stage;
    }
    r.drawT += dt;

    /* --- the wind-up, and it keeps going once the cuts start ---
       The rings do not stop at the first cut. She is still planted, still
       committed, and a warning that switched off the moment the danger
       actually arrived would be the wrong way round. They only tighten. */
    const winding = stage === 0;
    const k = winding
      ? Math.min(1, 1 - (p.triWindT / (CROSS.wind || 1)))
      : 1;
    r.rings.forEach((m, i) => {
      m.visible = true;
      /* Drawn IN as it charges, around her middle. The shrinking is what
         carries "gathered into her"; the two discs turning opposite ways is
         what stops it reading as a target reticle. */
      const s = (2.4 - k * 1.25) * (1 - i * 0.13);
      m.scale.setScalar(s);
      m.position.set(
        p.position.x,
        p.position.y + (p.height ?? 2) * (0.34 + i * 0.14),
        p.position.z
      );
      m.rotation.y += dt * (i ? -3.4 : 2.6);
      m.material.opacity = (0.25 + k * 0.6) * (winding ? 1 : 0.55);
    });

    /* --- the crackle ---
       Jumped to a new spot on a timer rather than eased, because lightning
       does not travel — it is somewhere else. */
    r.boltT -= dt;
    if (r.boltT <= 0) {
      r.boltT = 0.045;
      for (const s of r.bolts) {
        const a = Math.random() * Math.PI * 2;
        const rad = 0.55 + Math.random() * 0.75;
        s.position.set(
          p.position.x + Math.cos(a) * rad,
          p.position.y + 0.3 + Math.random() * ((p.height ?? 2) * 0.95),
          p.position.z + Math.sin(a) * rad
        );
        s.scale.setScalar(0.75 + Math.random() * 0.65);
        s.material.rotation = Math.random() * Math.PI * 2;
        /* A quarter of them off each time, so the ring of four never reads as
           four fixed lamps blinking together. */
        s.visible = Math.random() > 0.25;
        s.material.opacity = (0.5 + Math.random() * 0.5) * (winding ? 0.35 + k * 0.65 : 0.7);
      }
    }

    /* --- the strokes ---
       Every side up to and including this cut's pair is drawn; the pair for
       THIS cut is drawn partway. Recomputed from `stage` every frame rather
       than switched on as it happens, so a technique that skips a frame — or
       one whose stage is read late — still comes out with the right strokes
       up rather than one short for ever. */
    const drawn = Math.min(1, r.drawT / DRAW);
    for (let cut = 0; cut < CROSS.cuts; cut++) {
      const live = stage > cut;
      const prog = stage === cut + 1 ? drawn : 1;
      /* `?? []` because `CROSS.cuts` is on the tuning page and a kid with a
         slider can ask for five. The extra cuts then draw no new side and the
         kanji still lands on the last one — a seal short of a stroke, rather
         than a crash halfway through a technique. */
      for (const i of SIDES_BY_CUT[cut] ?? []) {
        const m = r.sides[i];
        m.visible = live;
        if (!live) continue;
        m.scale.x = SEAL * prog;
        m.material.opacity = 0.85 + 0.15 * prog;
      }
    }

    /* --- and the kanji, on the third ---
       It arrives with a scale overshoot rather than a fade: the box was CUT
       into the air and the glyph is what the cut was for, so it should land
       like a stamp. */
    const full = stage >= CROSS.cuts;
    r.kanji.visible = full;
    if (full) {
      r.pulseT += dt;
      const pop = Math.min(1, r.drawT / (DRAW * 1.4));
      const over = 1 + Math.sin(Math.min(1, pop) * Math.PI) * 0.22;
      r.kanji.scale.setScalar(pop * over);
      r.kanji.material.opacity = pop;
      /* THE PULSE IS ON THE WHOLE SEAL, not on the kanji alone. The box and
         the glyph are one object now; breathing only the middle of it would
         read as the glyph being loose inside its frame. */
      const beat = 1 + Math.sin(r.pulseT * 15) * 0.035;
      r.group.scale.setScalar(beat);
      for (const m of r.sides) m.material.opacity = 0.85 + Math.sin(r.pulseT * 15) * 0.15;
    } else {
      r.group.scale.setScalar(1);
    }
  }

  /* --------------------------- and when it lets go ----------------------- */

  _fly(dt, r) {
    if (r.stage >= 0) {
      /* IT ONLY BLOWS UP IF IT WAS EVER DRAWN. A wind-up she let go of ends at
         stage 0 with no strokes on screen, and an explosion of nothing would
         announce a technique that never happened — which is worse than
         nothing, because the sister who backed off would learn that the
         warning lies. */
      const drew = r.stage >= 1;
      this._hideAura(r);
      r.stage = -1;
      if (!drew) { r.group.visible = false; return; }
      this._burst(r);
      return;
    }
    if (r.burstT <= 0) return;

    r.burstT -= dt;
    if (r.burstT <= 0) { this._hide(r); return; }
    const k = 1 - r.burstT / BURST;
    const pieces = [...r.sides, r.kanji];
    pieces.forEach((m, i) => {
      if (!m.visible) return;
      m.position.addScaledVector(r.vel[i], dt);
      /* Gravity on the pieces, so they arc away rather than sliding off in a
         straight line — the same reason the knocked-back kitten they are
         chasing does. */
      r.vel[i].y -= dt * 5.5;
      m.rotation.z += r.spin[i] * dt;
      m.material.opacity = (1 - k) * (1 - k);
    });
  }

  _hideAura(r) {
    for (const m of r.rings) m.visible = false;
    for (const s of r.bolts) s.visible = false;
  }

  /**
   * Blow the seal apart, along the way everybody it caught was just thrown.
   *
   * THE DIRECTION IS FREE. Local +z of the group IS the attack direction — it
   * was set from her `facing` when the seal was placed, and `Game.hurt` throws
   * the victims along the same vector — so "away from the kitten who threw it"
   * is just a positive local z on every piece. No world maths, and nothing
   * that can disagree with where the bodies went.
   */
  _burst(r) {
    r.burstT = BURST;
    const pieces = [...r.sides, r.kanji];
    pieces.forEach((m, i) => {
      if (!m.visible) return;
      /* Pushed outward from the middle of the seal as well as forward, so it
         comes apart rather than sliding away as one sheet. */
      const out = new THREE.Vector3(r.home[i].x, r.home[i].y, 0);
      if (out.lengthSq() < 1e-6) out.set(0, 0.2, 0);
      out.normalize().multiplyScalar(2.2 + Math.random() * 1.6);
      r.vel[i].set(out.x, out.y + 1.8, 5.5 + Math.random() * 3.5);
      r.spin[i] = (Math.random() - 0.5) * 9;
    });
    r.group.scale.setScalar(1);
  }

  /** Put every piece back where the seal says it lives. Called before a new
   *  seal is drawn, so a rig reused from last time starts whole. */
  _reassemble(r) {
    const pieces = [...r.sides, r.kanji];
    pieces.forEach((m, i) => {
      m.position.copy(r.home[i]);
      m.rotation.z = r.homeRot[i];
      m.material.opacity = 0;
      r.vel[i].set(0, 0, 0);
      r.spin[i] = 0;
    });
    r.kanji.scale.setScalar(1);
  }
}
