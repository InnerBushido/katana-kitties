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

     THE PICTURE. Everything below the THE PICTURE banner is one
     figure drawn out of numbers the kitten is already publishing, and it is
     there because of the first non-negotiable: the maths is the point. The
     Flash Step picks a person, picks a radius and picks an angle, and until
     now it did all three in silence. Now it draws them — the ring of every
     landing that was available, a see-through her standing on the one she has
     chosen, and, when she has locked somebody, the right triangle that says
     how far round them she came. Every number printed is computed FROM the
     drawn vectors, so the figure cannot disagree with the move. See
     `_updateFigure`.

     AND WHEN SHE HAS LOCKED SOMEBODY, THE LANDING IS A SECRET UNTIL SHE
     TAKES IT. The ring of available landings still snaps down, because that
     is the warning; the ghost, the spoke and the triangle wait for the commit
     frame and then hold for the dissolve. With nobody locked — the move used
     as movement rather than as an attack — the preview is exactly what it
     always was. See `secret` in `_updateFigure` for the report behind it.

     THE RAIN IS BACK, AND SOMETHING WENT OUT FOR IT. Two columns of falling
     glyphs used to fall at both ends of the jump. They were cut as clutter,
     by name, and the rule left attached to that cut was "do not put it back
     without taking something else out" — so here is the something.

     WHAT WENT OUT IS THE SEE-THROUGH KITTEN. The preview used to be a whole
     second drawing of her, two units by three, standing on the landing. It is
     now a glowing orb the size of her head: her SPIRIT, before it has
     anywhere to be. Asked for in the same breath as the rain — "instead of
     showing the player character and where they will teleport before the
     teleport is complete, we can instead show a glowing orb version of them,
     almost as if it is their spirit form" — and it is about a fifth of the
     screen area the ghost was.

     AND WHAT CAME BACK IS NOT WHAT WAS CUT. That was two columns of five
     discrete glyphs plus a big 瞬 over each, at both ends: twelve objects
     drawn per jump. This is ONE scrolling sprite per end, and every rain in
     the game shares ONE texture and ONE scroll — see `rainTexture`. The
     density argument the cut was made on is honoured rather than argued with.

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
import { Label } from '../core/label.js';
import { DODGE, ORB_BY_ID } from '../entities/powerorb.js';

/** The orb's own jade, read from the table rather than restated — the shelf,
 *  the profile card and the orb itself are already this colour and a fourth
 *  copy of it is the one that ends up a different green. */
const JADE = ORB_BY_ID.blink?.color ?? 0x21d6a8;

/** How long the ring takes to snap shut, and to spring open again. */
const NARROW = 0.14;
const OPEN = 0.26;
/**
 * How long a decoy stands there before it puffs out.
 *
 * TWELVE SECONDS, AND IT USED TO BE 1.45. The old number was reasoned from the
 * move — "comfortably longer than 2 x `DODGE.invuln`, so the joke is still on
 * the floor when she lands" — which turned out to be the wrong thing to
 * measure against. The joke is not for the kitten who threw it, who is busy
 * and looking somewhere else; it is for her SISTER, on the other half of a
 * split screen, who looks over a few seconds later. Asked for directly: "stay
 * active longer before disappearing, like 10 more seconds at least".
 */
const DECOY = 12;
/**
 * How long it hangs in the air before it remembers gravity.
 *
 * A SECOND, ON PURPOSE, AND THEN IT FALLS. "It should fall with gravity after
 * floating without gravity for a second" — and the hang is what makes the
 * substitution read: the log is left standing exactly where she was, for long
 * enough to be seen standing there, and only then does it stop being a kitten
 * and become an object.
 */
const FLOAT = 1;
/** Its own gravity, so retuning the kittens cannot change how a log drops. */
const DECOY_G = 22;
/**
 * How many decoys may be on the ground at once. Never grown.
 *
 * TWELVE, BECAUSE THE LIFETIME WENT UP EIGHT-FOLD. Five was one per kitten
 * plus a spare, which was right when they lasted a second and a half; at
 * twelve seconds, four kittens dodging as fast as `DODGE.cool` allows can have
 * two dozen on the floor. Twelve is the compromise: past it the oldest is
 * recycled, which is a joke that ends early rather than a joke that never
 * appears, and the game is fill-bound (docs/notes/performance.md) so an
 * unbounded pool is not on the table.
 */
const DECOYS = 12;

/* ============================== THE PICTURE ===============================

   HOW LONG EACH END OF THE TELEPORT FADES.

   NOT A NUMBER — THE WINDOW ITSELF. `DODGE.commit` is the fraction of the
   vanish she spends winding up, so what is left after the commit is exactly
   how long she is gone before her own sprite comes back. Fading over that
   means the arriving ghost reaches full strength on the very frame the real
   drawing returns, and the hand-off is invisible. Typing 0.1 here instead
   would be right until somebody moved `commit` on the tuning page, and then
   it would be a ghost that lingered over the top of her or snapped off early.

   THE FADE HAS TO BE DRAWN BY SOMETHING ELSE, and that is not a choice. Her
   own material runs `alphaTest: 0.35` — every pixel under that threshold is
   discarded outright — so turning her opacity down is a hard cut wearing a
   fade's clothes. `entities/player.js` says so twice and refuses to pretend.
   These sprites carry no alpha test, so they really do fade. */
const FADE = DODGE.invuln * (1 - DODGE.commit);

/* `AIM_A` — how solid the "you will come out HERE" preview kitten stood — is
   gone with the kitten. The preview is a spirit orb now (see THE SPIRIT FORM),
   and its brightness is `SPIRIT_A`. Deleted rather than left at an unused 0.36,
   so nothing can be tuned back into a drawing that is not there. */
/** How long the whole figure takes to dissolve once the move is over. */
const FIG_OUT = 0.5;
/**
 * How far the kitten she locked has to have MOVED before the angle means
 * anything.
 *
 * AN ANGLE NEEDS TWO DIRECTIONS AND A STATIONARY TARGET ONLY GIVES ONE. The
 * second line of the figure is "where you were when she pressed, to where you
 * are now"; a sister who has not taken a step has no such direction, and
 * drawing theta against a zero-length line would be inventing a number and
 * printing it as if it had been measured. So under this, the triangle and its
 * three readouts are simply not drawn and the ring, the spoke and the ghost
 * carry on. Half a metre: at a walk she covers that in a fifth of a second, so
 * in practice the only time it hides is when somebody genuinely froze.
 */
const MOVED_MIN = 0.35;
/** Points in the theta arc. It is at most half a turn, so this is generous. */
const ARC_MAX = 28;
/** The Dojo's own leg colours, restated on purpose: a kitten who has walked
 *  the unit circle has already learnt that orange is the adjacent side and
 *  green is the opposite one, and this figure is the same lesson happening to
 *  her in a fight. Changing them here would throw that away. */
const COS_C = 0xffb347;
const SIN_C = 0x8bff9a;
const GOLD = 0xffd76a;
/** Segments in a landing circle. 96 is the Dojo's own count for its unit
 *  circle, and these two circles are meant to be read as the same object. */
const RING_SEG = 96;

/* ============================ THE SPIRIT FORM =============================

   "Make it that, when using Flash Step, it shows a 'ghostly' version of the
   player, about 50% transparent or more, could have them looking unstable and
   flickering in and out, before they teleport."

   HALF OF THAT IS HERE AND HALF IS IN `Player._updateFeedback`, AND NEITHER
   HALF CAN DO THE JOB ALONE. Her own material runs `alphaTest: 0.35` — every
   pixel under the threshold is discarded outright — so her SOLID wind-up pose
   cannot be made 50% transparent at all; the only thing it can do is stop
   being drawn, which is a blink. So it blinks, faster and thinner as the
   commit comes, and this sprite stands on the same spot for the whole wind-up
   at half strength. The frames she is missing are therefore not empty: what
   reads is a kitten coming apart into her own spirit rather than a sprite
   dropping frames. Either half on its own reads as a bug. */
const WIND_A = 0.5;
/** How fast the wind-up ghost boils, and how far it slides off her while it
 *  does. Both small on purpose: this has to look UNSTABLE, not like a second
 *  kitten standing next to the first one. */
const WIND_HZ = 9;
const WIND_DRIFT = 0.12;

/**
 * The spirit orb: its radius as a fraction of her own height, and how bright.
 *
 * MEASURED OFF HER, NOT TYPED IN WORLD UNITS. A kitten's height is set from
 * her atlas (`contentScale`), so a number in units here would be right for
 * whichever sheet happened to be loaded the day it was tuned. House rule:
 * measure anything drawn.
 */
const SPIRIT_R = 0.21;
const SPIRIT_A = 0.85;
/** How far the manifestation throws itself open, against the orb's own size.
 *  "The orb can expand/explode/dissipate once the player appears in the new
 *  location, as if their spirit form manifested to physical form." */
const BURST_X = 5.5;
/**
 * How long that takes.
 *
 * LONGER THAN `FADE`, AND THAT IS NOT A MISTAKE. `FADE` is a tenth of a second
 * — it is the hand-off between two drawings of her and it is exactly as long
 * as the window she is gone for, which is right for a hand-off and far too
 * short to read as an EVENT. The figure is already on screen for `FIG_OUT`
 * after the move ends, so a burst that outlives the jump has somewhere to
 * finish; a burst pinned to `FADE` was three frames and looked like a flash.
 */
const BURST_T = 0.45;
/**
 * How far through the WHOLE MOVE her arriving self is solid.
 *
 * "Make their player avatar blink back into existence once they finish
 * teleporting and make fully opaque once about 95% complete with the entire
 * teleporting process."

 * THE ENTIRE PROCESS, AND NOT THE WINDOW SHE IS GONE FOR — measured, after
 * the first version was measured. `FADE` is a tenth of a second, so 95% of
 * THAT is its last five milliseconds: exactly one frame at 60Hz, which is not
 * an arrival, it is a rounding error, and on screen it was indistinguishable
 * from the old hand-off it replaced. 95% of the whole Flash Step is the last
 * twenty-five, which is two or three frames of her standing solid before her
 * own sprite comes back — the overlap the note is asking for.
 *
 * A FRACTION, NOT A NUMBER OF SECONDS, for the same reason `FADE` is one: the
 * tuning page can move `invuln` and `commit`, and a typed 0.075 would be right
 * until somebody did.
 */
const MANIFEST = 0.95;
/**
 * ...and the same moment expressed where it is actually used: how far through
 * `FADE` it falls.
 *
 * THE FLOOR IS NOT DECORATION. `commit` is editable, and a `commit` past
 * `MANIFEST` makes this negative — at which point she would be solid on the
 * commit frame itself and the whole arrival would vanish. 0.05 degrades to
 * "solid almost at once", which is wrong but visible, rather than gone.
 */
const MANIFEST_K = Math.max(0.05, Math.min(1,
  (DODGE.invuln * (MANIFEST - DODGE.commit)) / Math.max(1e-6, FADE)));
/** How fast she blinks on her way back in. Fast enough to read as a signal
 *  rather than as a frame rate, and it stops dead at `MANIFEST`. */
const BLINK_HZ = 20;

/* ============================== THE RAIN =================================

   TYPED GLYPHS, AND `systems/crossfx.js` SAYS TYPED GLYPHS LOOK WRONG. It does
   — at length, and it is right: the 十 on the Cross Slash's seal is drawn as
   two brush strokes because "the only Japanese faces on the machine are
   geometric sans with nothing to fall back to", and a typed one at size is two
   hairlines.

   THE CONDITION THAT ARGUMENT NAMES IS "HAS TO CARRY A FRAME ON ITS OWN", AND
   THIS DOES NOT. A rain column is texture: a stream of small, dim, moving
   marks nobody reads as language. Most of these are KATAKANA rather than
   kanji, which is also what the film everybody is thinking of actually used,
   and for the same reason — simple strokes survive being 30 pixels tall and
   falling, where a dense kanji turns to mush. The one hero glyph is 瞬, the
   move's own, which the orb and the shelf already print.
*/
const RAIN_GLYPHS = [
  '瞬', 'ア', 'カ', '影', 'サ', 'タ', '閃', 'ナ',
  '瞬', 'ハ', '疑', 'マ', 'ヤ', '空', 'ラ', 'ワ',
];
/** Rows in the strip. One per glyph above, and the window shows half of them. */
const RAIN_ROWS = 16;
/** The column, in world units: narrow and about twice a kitten tall. */
const RAIN_W = 1.0;
const RAIN_H = 6.0;
/** Strips per second. One scroll for the whole game — see `update`. */
const RAIN_SPEED = 1.35;

/** `0x21d6a8` as `#21d6a8`, for the label painter, which speaks CSS. */
function css(hex) {
  return `#${(hex >>> 0).toString(16).padStart(6, '0')}`;
}

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
 *
 * EXPORTED, BECAUSE "TARGETED" IS ONE WORD AND MUST BE ONE PICTURE. The steal's
 * mark (`systems/clanfx.js`) puts this same sight over the head of whoever is
 * being hunted, in the hunter's colour — asked for as "can be the same target
 * we use with the Sense Mischief". A second drawing of a target would be a
 * second thing a nine-year-old has to learn means the same as the first, and
 * the two would drift the first time either was tuned. Cached in `_ring`, so
 * the two systems share one texture as well as one shape.
 */
export function ringTexture() {
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

let _glow = null;
let _burst = null;
let _rain = null;

/**
 * A soft ball of light: white, so one texture tints to any kitten's colour.
 *
 * THE FALL-OFF IS NOT LINEAR AND THAT IS THE WHOLE LOOK. A straight ramp from
 * white to nothing is a fuzzy disc; holding it near-white to a fifth of the
 * radius and then dropping it away fast is a LIT thing with a core, which is
 * what "glowing orb ... almost as if it is their spirit form" has to read as
 * from the far side of a split-screen pane.
 */
function glowTexture() {
  if (_glow) return _glow;
  const S = 128;
  const c = canvas(S, S);
  if (!c) return null;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.20, 'rgba(255,255,255,0.95)');
  grd.addColorStop(0.42, 'rgba(255,255,255,0.42)');
  grd.addColorStop(0.72, 'rgba(255,255,255,0.10)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  _glow = t;
  return t;
}

/**
 * The manifestation: a soft SHELL rather than a ball.
 *
 * A RING AND NOT A DISC, BECAUSE AN EXPANDING DISC IS A FLASH. Scaling a ball
 * of light up reads as the light getting brighter and nearer, which is what a
 * muzzle flash does; scaling a hollow shell up reads as something leaving from
 * the middle, which is what a spirit becoming a body does. Same texture at
 * both ends of the jump — one collapsing inward, one throwing itself open.
 */
function burstTexture() {
  if (_burst) return _burst;
  const S = 128;
  const c = canvas(S, S);
  if (!c) return null;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.40, 'rgba(255,255,255,0.06)');
  grd.addColorStop(0.62, 'rgba(255,255,255,1)');
  grd.addColorStop(0.74, 'rgba(255,255,255,0.30)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  _burst = t;
  return t;
}

/**
 * The falling glyphs, as ONE strip that every rain in the game shares.
 *
 * ONE TEXTURE, ONE SCROLL, EIGHT SPRITES. Four kittens with two ends each is
 * eight columns, and the obvious build gives each its own `CanvasTexture` so
 * each can scroll independently — eight uploads of a quarter of a megabyte,
 * for a thing that is on screen for half a second. They do not need to scroll
 * independently: the strip falls at a constant rate whether anybody is looking
 * or not, and which phase a column starts on is not a fact about the game. So
 * the offset is driven once, in `update`, and the sprites differ only in where
 * they stand and how bright they are.
 *
 * THE HEAD-TO-TAIL RAMP IS BAKED IN, and it has to be: a sprite's opacity is
 * one number for the whole quad, so a column whose every glyph was equally
 * bright would be a barcode. The ramp repeats every eight rows and the window
 * shows eight, so there is always exactly one bright head on screen with its
 * tail fading behind it.
 */
function rainTexture() {
  if (_rain) return _rain;
  const CELL = 64;
  const c = canvas(CELL, CELL * RAIN_ROWS);
  if (!c) return null;
  const g = c.getContext('2d');
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  /* A STACK AND NOT ONE FACE. There is no guarantee about which Japanese face
     a machine has — crossfx.js found that out the expensive way — so this
     names the four that cover Windows, macOS and a web font, and ends at
     `sans-serif` so a machine with none of them draws boxes rather than
     nothing. Boxes falling down a column still read as rain. */
  g.font = `${Math.round(CELL * 0.8)}px "Yu Gothic", "Hiragino Kaku Gothic ProN", `
    + `"Noto Sans JP", "MS Gothic", sans-serif`;
  for (let i = 0; i < RAIN_ROWS; i++) {
    const k = 1 - ((i % 8) / 8) * 0.86;
    g.globalAlpha = k;
    g.fillStyle = '#ffffff';
    g.shadowColor = '#ffffff';
    g.shadowBlur = i % 8 === 0 ? 20 : 6;
    g.fillText(RAIN_GLYPHS[i % RAIN_GLYPHS.length], CELL / 2, CELL * (i + 0.5));
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  /* HALF THE STRIP IS THE WINDOW — eight glyphs, which is one complete ramp.
     Set once here rather than per sprite, because it is shared. */
  t.repeat.set(1, 0.5);
  _rain = t;
  return t;
}

/**
 * One additive sprite. Used for the orb, its core, both shells and both rains.
 *
 * ADDITIVE, AND DEPTH-TESTED. Additive because a spirit adds light to what is
 * behind it and an alpha-blended one is a sticker; depth-tested because a
 * spirit shining through the hill in front of it would stop being in the world
 * at all. The reticle is the only thing in this file allowed through scenery,
 * and that is because it is a UI element about a PERSON.
 *
 * @param {?THREE.Texture} tex the map, or null when there is no document
 */
function glowSprite(tex, colour, order, center) {
  if (!tex) return null;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex,
    color: colour,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }));
  if (center) sp.center.copy(center);
  sp.renderOrder = order;
  sp.visible = false;
  return sp;
}

/** The column: bottom-anchored, so its position is where it STANDS. */
const RAIN_CENTRE = new THREE.Vector2(0.5, 0);

/**
 * The circle of everywhere she could come out: a thin DRAWN line, flat on the
 * ground, unit radius, scaled to whatever the reach is that frame.
 *
 * THE SAME OBJECT AS THE DOJO'S UNIT CIRCLE, and that is the whole reason it is
 * a line. It was a stair-stepped pixel-art band first, on the argument that it
 * should match the eight-bit target reticle — and that was matching the wrong
 * thing. The reticle is a SIGHT, drawn on a person, and it belongs to the
 * arcade half of the game. This is a circle of radius r drawn around a centre,
 * which is the Dojo of the Turning Circle's one and only idea, and a kitten who
 * has walked that circle has to be able to recognise this one as it. Reported
 * in exactly those terms: "similar to the line circle in the Dojo of the
 * Turning Circle, just a thin line, not a texture."
 *
 * It also deletes a lie. A texture paints its band at some fraction of the
 * quad, so the quad had to be scaled by the inverse of that fraction or the
 * drawn circle would have been a few per cent inside the reach it claimed to
 * be. A line at radius 1 scaled by r is at r, with nothing to get wrong.
 *
 * `dashed` is the inner circle — the closest she may land. Solid reads as a
 * wall, dashed as a boundary you are allowed to cross, which is exactly the
 * difference between the two.
 */
function groundRing(dashed, colour) {
  const pts = new Float32Array((RING_SEG + 1) * 3);
  const dist = new Float32Array(RING_SEG + 1);
  for (let i = 0; i <= RING_SEG; i++) {
    const a = (i / RING_SEG) * Math.PI * 2;
    pts[i * 3] = Math.cos(a);
    pts[i * 3 + 2] = Math.sin(a);
    dist[i] = a;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  /* THE DASH LENGTHS ARE IN RADIANS, on a circle of radius 1, and they are
     written once here rather than recomputed by `computeLineDistances()` every
     time the reach changes. The consequence is deliberate: the dashes are a
     fixed FRACTION of the circle, so a small circle and a big one have the same
     number of them and read as the same drawing at two sizes. Measuring them in
     world units instead would give a tight circle four dashes and a wide one
     forty. */
  geo.setAttribute('lineDistance', new THREE.BufferAttribute(dist, 1));
  const mat = dashed
    ? new THREE.LineDashedMaterial({
      color: colour, dashSize: 0.09, gapSize: 0.07,
      transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
    })
    : new THREE.LineBasicMaterial({
      color: colour, transparent: true, opacity: 0,
      depthWrite: false, toneMapped: false,
    });
  const l = new THREE.Line(geo, mat);
  /* DEPTH-TESTED, unlike the reticle. That one is a UI element about a PERSON
     and has to be visible through the scenery; this is a mark on the FLOOR, and
     a floor mark that shone through the hill in front of it would stop reading
     as being on the floor at all. */
  l.renderOrder = 25;
  l.frustumCulled = false;
  l.visible = false;
  return l;
}

/**
 * A see-through copy of her, for the preview and for the two fades.
 *
 * THE TEXTURE IS SHARED, NOT CLONED, AND THAT IS THE WHOLE REASON THIS TAKES
 * THE WIND-UP POSE. A kitten's atlas is megabytes; `texture.clone()` makes a
 * second GPU upload of every one of them, four times over, for a ghost that is
 * on screen for a tenth of a second. Sharing is only safe if nothing else
 * moves the map's offset and repeat — and her WALKING billboard moves both,
 * once per camera, every frame. `warpPose` is a single-cell sheet with no
 * mirroring, so its UV transform never changes and can be borrowed for free.
 * It is also, conveniently, exactly the right drawing: fingers to her
 * forehead, eyes shut, which is what a ghost of somebody mid-teleport should
 * be doing.
 *
 * A SPRITE, so it faces all four split-screen cameras at once — `Game._faceAll`
 * does not know this file exists and a hand-turned billboard would be edge-on
 * in three of the four panes.
 *
 * @param {?object} bb the `Billboard` to borrow from, or null — no warp art
 *        means no ghost and no fade, and the move still happens in full. Ninth
 *        non-negotiable, the same trade the pose itself makes.
 */
function ghostOf(bb, colour, tint) {
  if (!bb?.tex || !bb.mesh) return null;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: bb.tex,
    color: tint ? colour : 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
  }));
  /* THE FEET ARE MEASURED OFF THE GEOMETRY, not reasoned about. The Billboard
     shifts its quad up by the atlas's transparent padding so the drawn feet sit
     on the pivot; that shift is recoverable from the bounding box and nowhere
     else, and guessing it is how a ghost ends up hovering. House rule: measure
     anything drawn. */
  bb.mesh.geometry.computeBoundingBox();
  const foot = -(bb.mesh.geometry.boundingBox?.min.y ?? 0);
  sp.center.set(0.5, bb.height > 0 ? foot / bb.height : 0);
  sp.scale.set(bb.width, bb.height, 1);
  sp.renderOrder = 23;
  sp.visible = false;
  return sp;
}

/** One two-point line. `frustumCulled` off because the endpoints are written
 *  in world space into a geometry whose bounding sphere is never recomputed —
 *  the same trade `mathdojo` makes, and for the same reason. */
function lineOf(colour, dashed = false) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  if (dashed) {
    geo.setAttribute('lineDistance', new THREE.BufferAttribute(new Float32Array(2), 1));
  }
  const mat = dashed
    ? new THREE.LineDashedMaterial({
      color: colour, dashSize: 0.85, gapSize: 0.6,
      transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
    })
    : new THREE.LineBasicMaterial({
      color: colour, transparent: true, opacity: 0,
      depthWrite: false, toneMapped: false,
    });
  const l = new THREE.Line(geo, mat);
  l.frustumCulled = false;
  l.renderOrder = 26;
  l.visible = false;
  return l;
}

/* THE DASH DISTANCES ARE WRITTEN IN PLACE, never by `computeLineDistances()`.
   That call reallocates the attribute, and doing it every frame on a line
   whose ends move is a fresh buffer per frame per kitten. A two-point line's
   distances are 0 and its own length, which is one `hypot`. Same trick, same
   argument, as `mathdojo._setLine`. */
function setSeg(line, ax, ay, az, bx, by, bz) {
  const pos = line.geometry.attributes.position;
  pos.setXYZ(0, ax, ay, az);
  pos.setXYZ(1, bx, by, bz);
  pos.needsUpdate = true;
  const ld = line.geometry.attributes.lineDistance;
  if (ld) {
    ld.setX(0, 0);
    ld.setX(1, Math.hypot(bx - ax, by - ay, bz - az));
    ld.needsUpdate = true;
  }
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
    /** One FIGURE per player index — the rings, the ghosts, the triangle and
     *  the two rains. Built the first time she Flash Steps and never freed; a
     *  kitten who never buys 瞬 allocates none of it. */
    this.figs = new Map();
    /** A fixed ring buffer of decoys. Built lazily, never grown. */
    this.decoys = [];
    /**
     * Where the shared rain strip has got to, in strips.
     *
     * ONE NUMBER FOR EVERY COLUMN IN THE GAME. See `rainTexture`: the offset
     * lives on the texture, the texture is shared by all eight possible
     * columns, and none of them needs its own phase — the rain falls at a
     * constant rate whether anybody is Flash Stepping or not, and which glyph
     * happens to be at the top when a column appears is not a fact about the
     * game. Wrapped to [0,1) every frame so it cannot drift into the range
     * where a float stops resolving a sixtieth of a strip.
     */
    this.rainPhase = 0;
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
    for (const f of this.figs.values()) {
      f.group.visible = false;
      f.seq = -1;
      f.shown = false;
      f.out = 0;
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

  /**
   * Build one kitten's figure. Lazy, once, and never taken down.
   *
   * @param {object} p the player
   * @returns {?object} the rig, or null when there is no document to draw on
   */
  _fig(p) {
    let f = this.figs.get(p.index);
    if (f) return f;
    if (typeof document === 'undefined') return null;         // headless
    const colour = p.style?.colour ?? JADE;
    const hex = css(colour);
    const group = new THREE.Group();

    const add = (o) => { if (o) group.add(o); return o; };
    /* THE OUTER RING IS EVERY LANDING SHE CAN REACH and the inner one is the
       closest she is allowed to come. Without the two-orb aim upgrade there is
       exactly ONE distance — the move lands her on the far edge and nowhere
       else — so the inner ring is not merely hidden in that case, it does not
       exist, and `_updateFigure` refuses to draw a boundary that is not there.
       Drawing a faint "nearest" circle on a kitten who cannot choose her
       distance would be the picture promising a control she does not own. */
    const ringFar = add(groundRing(false, colour));
    const ringNear = add(groundRing(true, colour));

    /* Her, three times over, and all three borrow one texture.

       THE WALKING SPRITE IS NOT AN ACCEPTABLE FALLBACK, which is why this is
       `?? null` and not `?? p.sprite`. Her walk billboard rewrites the shared
       map's offset once per camera, per frame, to pick the cell that faces
       that pane — a sprite borrowing it would flick through the whole sheet
       four times a frame. No warp art, no ghost and no fade; the move still
       happens in full, exactly as it does without the pose. */
    const bb = p.warpPose ?? null;
    /* HER, COMING APART, ON THE SPOT SHE HAS NOT LEFT YET — see WIND_A. This
       is the sprite that used to be the LANDING preview; the landing is now an
       orb, and this drawing of her moved to the only place it can be honest
       about, which is where she is actually standing. */
    const windGhost = add(ghostOf(bb, colour, true));
    const echoOut = add(ghostOf(bb, colour, false));  // the place she leaves
    const echoIn = add(ghostOf(bb, colour, false));   // the place she arrives

    /* HER SPIRIT, AND ITS TWO SHELLS. The orb is a ball of her own colour with
       a white heart inside it, which is what stops four kittens' spirits all
       reading as "a bright dot": the heart says LIGHT and the halo says WHOSE.
       `burstOut` collapses inward on the spot she leaves and `burstIn` throws
       itself open on the spot she arrives — one texture, two directions, so
       the two ends of a teleport are visibly the same event twice. */
    const glow = glowTexture();
    const shell = burstTexture();
    const spirit = add(glowSprite(glow, colour, 24));
    const heart = add(glowSprite(glow, 0xffffff, 25));
    const burstOut = add(glowSprite(shell, colour, 24));
    const burstIn = add(glowSprite(shell, colour, 24));

    /* AND THE TWO RAINS. Behind everything else in the figure on purpose —
       renderOrder 22 against the ghosts' 23 — because it is the backdrop the
       event happens in front of, not a thing to read. */
    const rainTex = rainTexture();
    const rainOut = add(glowSprite(rainTex, colour, 22, RAIN_CENTRE));
    const rainIn = add(glowSprite(rainTex, colour, 22, RAIN_CENTRE));
    for (const r of [rainOut, rainIn]) if (r) r.scale.set(RAIN_W, RAIN_H, 1);

    /* HER COLOUR ON THE SPOKE, THE TARGET'S ON THE PATH, and that is the whole
       legend: the line in YOUR colour is the one you are steering, the line in
       your sister's colour is what she did about it. `moved` is dashed because
       it is history rather than a live measurement — the same grammar the Dojo
       uses for its dropped coordinates. The target's colour is written every
       frame rather than at build time, because the figure outlives any one
       opponent and the second Flash Step may be at somebody else. */
    const vec = add(lineOf(colour, false));
    const moved = add(lineOf(0xffffff, true));
    const cosLeg = add(lineOf(COS_C, true));
    const sinLeg = add(lineOf(SIN_C, true));

    const arcGeo = new THREE.BufferGeometry();
    arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARC_MAX * 3), 3));
    const arc = new THREE.Line(arcGeo, new THREE.LineBasicMaterial({
      color: GOLD, transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
    }));
    arc.frustumCulled = false;
    arc.renderOrder = 26;
    arc.visible = false;
    group.add(arc);

    /* LIVE LABELS, WITH THE WIDEST STRING DECLARED. A `setText` whose value
       moves every frame and does NOT say `live` mints a never-freed canvas per
       distinct value — the bug that used to kill a phone inside the Dojo, all
       of it written up in core/label.js. Three readouts changing at 60Hz on
       four kittens is precisely that shape. */
    const mk = (colr, live) => {
      const l = new Label(live, {
        live,
        height: 1.0,
        fixedScreenSize: true,
        refDistance: 44,
        size: 52,
        color: colr,
        stroke: '#0d1319',
        strokeWidth: 8,
        depthTest: false,
      });
      l.visible = false;
      group.add(l);
      return l;
    };
    const lblTheta = mk(css(GOLD), 'θ = 180°');
    const lblCos = mk(css(COS_C), 'r cos θ = -00.0');
    const lblSin = mk(css(SIN_C), 'r sin θ = -00.0');

    group.visible = false;
    this.scene.add(group);
    f = {
      group, ringFar, ringNear, echoOut, echoIn,
      windGhost, spirit, heart, burstOut, burstIn, rainOut, rainIn,
      vec, moved, cosLeg, sinLeg, arc,
      lblTheta, lblCos, lblSin,
      /** Which `dodgeSeq` is on screen, -1 for none. */
      seq: -1,
      /** Is that move still running? */
      shown: false,
      /** Seconds left of the dissolve. */
      out: 0,
      /** Seconds since the figure appeared, and since she committed. */
      age: 0,
      since: 0,
      placed: false,
      /* WHAT IS BEING DRAWN, held apart from the player on purpose. The circle
         follows the kitten it is drawn around until the instant she teleports
         and then STOPS — asked for in exactly those words — and the only way a
         poller can stop following something is to have kept its own copy. It is
         also what lets the numbers be readable: frozen for the half second the
         move takes to finish, rather than a blur nobody can read. */
      s: {
        hasT: false, ok: false, tcol: JADE,
        px: 0, py: 0, pz: 0,
        fx: 0, fy: 0, fz: 0,
        hx: 0, hy: 0, hz: 0,
        sx: 0, sy: 0, sz: 0,
        near: 0, far: 0,
      },
    };
    this.figs.set(p.index, f);
    return f;
  }

  _decoy(world) {
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
        this.decoys.push({
          group, puff, prop: null, t: 0,
          /* Falling state. `float` counts the hang down; `vy` only starts
             accumulating once it reaches zero. */
          vy: 0, float: 0, floor: -Infinity, world: null,
        });
      }
    }
    const d = this.decoys[this.decoyIx];
    this.decoyIx = (this.decoyIx + 1) % this.decoys.length;
    d.world = world ?? null;
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
  _drop(p, world) {
    const d = this._decoy(world);
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
    /* IT DOES NOT TURN. It used to spin slowly on the spot, which was fine for
       a second and a half of comedy and is wrong for twelve seconds of object:
       a log revolving in place reads as a collectable in a menu, not as
       something dropped. Reported as exactly that. The random yaw at the drop
       stays — that is what stops four of them lining up — it simply keeps it.
       `spin` is gone rather than set to zero, so nothing can put it back by
       accident. */
    d.vy = 0;
    d.float = FLOAT;
    /* WHERE IT WILL COME TO REST, measured ONCE, at the drop. `heightAt` from
       a falling object every frame would ask about a column it is halfway
       down; asking from the spot she vanished on gets the floor she was
       standing on, which is where a thing left in her place belongs. Null is
       the void — she flash-stepped off the edge of something — and a decoy
       with no floor simply falls out of sight and times out, which is the
       degrade-don't-vanish rule and also quite funny. */
    const g = d.world?.heightAt?.(p.dodgeFrom.x, p.dodgeFrom.z, p.dodgeFrom.y + 1);
    d.floor = g ? g.y : -Infinity;
    d.group.visible = true;
  }

  update(dt, players, world) {
    /* THE RAIN FALLS ON ITS OWN CLOCK, once, before anything asks for it.
       Increasing `offset.y` walks the sampling window UP the strip, which
       walks every glyph DOWN the sprite — so this sign is falling, and it is
       derived rather than picked: a glyph sitting at texture v is drawn at
       sprite v of (v - offset) / repeat, which shrinks as the offset grows. */
    if (_rain) {
      this.rainPhase = (this.rainPhase + dt * RAIN_SPEED) % 1;
      _rain.offset.y = this.rainPhase;
    }

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
        this._drop(p, world);
      }

      this._updateFigure(dt, p);

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

  /**
   * Draw one kitten's Flash Step as a figure.
   *
   * A POLLER, LIKE EVERYTHING ELSE IN THIS FILE. It reads `dodgeT`,
   * `dodgeLockT`, `dodgePlaced`, `dodgeSeq` and the landing numbers she
   * publishes every frame, and derives what should be on screen. Six ways for
   * the move to end, and none of them has to know this exists.
   *
   * THE ARITHMETIC IS HERS, NOT MINE. `dodgeSpot`, `dodgeRNear`, `dodgeRFar`
   * and `dodgePivot` all come out of `Player._dodgeSpotFor` — the single piece
   * of arithmetic that also decides where she actually goes. That is what
   * makes the ghost honest: it is not a guess at her landing drawn next to the
   * real one, it IS the real one, published a few frames early. If the two ever
   * disagreed it would be because the game had changed her mind, which it
   * cannot do without changing both.
   */
  _updateFigure(dt, p) {
    const live = p.dodgeT > 0 || p.dodgeLockT > 0;
    let f = this.figs.get(p.index);
    if (!f) {
      if (!live) return;
      f = this._fig(p);
      if (!f) return;
    }

    /* --- which move, and has it ended? ---
       `dodgeSeq` and not a clock, for the reason the decoy needs it: two Flash
       Steps a frame apart are indistinguishable to `dodgeT > 0`, and the second
       one would inherit the first one's frozen snapshot. */
    if (live && f.seq !== p.dodgeSeq) {
      f.seq = p.dodgeSeq;
      f.shown = true;
      f.placed = false;
      f.since = 0;
      f.age = 0;
      f.out = 0;
    }
    if (!live && f.shown) {
      f.shown = false;
      f.out = FIG_OUT;
    }
    if (!live) f.out = Math.max(0, f.out - dt);
    if (!live && f.out <= 0) {
      if (f.group.visible) f.group.visible = false;
      return;
    }
    f.age += dt;
    f.group.visible = true;

    /* --- sample, until she goes, and then never again ---
       "This should stop updating once the player teleports and can stay on
       screen until the technique is finished." The freeze is the whole point:
       up to the commit the ring chases whoever she locked, so she can watch it
       move and re-aim; from the commit it is a record of the move that was
       made, which is the only version of it anybody can actually read. */
    const s = f.s;
    if (live && !p.dodgePlaced) {
      const q = p.dodgeTarget && !p.dodgeTarget.ko ? p.dodgeTarget : null;
      s.hasT = !!q;
      s.tcol = q?.style?.colour ?? JADE;
      s.px = p.dodgePivot.x;
      s.pz = p.dodgePivot.z;
      s.py = q ? q.position.y : p.dodgeFrom.y;
      s.fx = p.dodgeTargetFrom.x;
      s.fy = p.dodgeTargetFrom.y;
      s.fz = p.dodgeTargetFrom.z;
      s.near = p.dodgeRNear;
      s.far = p.dodgeRFar;
      s.sx = p.dodgeFrom.x;
      s.sy = p.dodgeFrom.y;
      s.sz = p.dodgeFrom.z;
      s.ok = p.dodgeSpotOk;
      if (s.ok) {
        s.hx = p.dodgeSpot.x;
        s.hy = p.dodgeSpot.y;
        s.hz = p.dodgeSpot.z;
      }
    } else if (live && !f.placed) {
      /* THE ONE FRAME THE COMMIT HAPPENS. `dodgeTo` and not `dodgeSpot`,
         because the commit is allowed to refuse — a thumb that never moved
         leaves her standing where she was — and the figure has to show where
         she ENDED, including when that is nowhere. */
      f.placed = true;
      f.since = 0;
      s.ok = true;
      s.hx = p.dodgeTo.x;
      s.hy = p.dodgeTo.y;
      s.hz = p.dodgeTo.z;
    }
    if (f.placed) f.since += dt;

    /* One master alpha: in over a tenth of a second, out over the dissolve. */
    const inK = Math.min(1, f.age / 0.12);
    const outK = f.out > 0 ? f.out / FIG_OUT : 1;
    const A = inK * outK;
    const bloom = 1 + (1 - outK) * 0.5;

    /* --- the ring of everywhere she could come out --- */
    const y = s.py + 0.07;
    f.ringFar.visible = s.far > 0.01;
    if (f.ringFar.visible) {
      f.ringFar.position.set(s.px, y, s.pz);
      /* THE SCALE IS THE RADIUS, because the circle is drawn at radius 1. That
         is the whole benefit of a line over a painted band: there is no
         fraction-of-a-quad to divide back out and therefore no way for the
         drawn reach to quietly disagree with the real one. `bloom` is the
         dissolve opening outwards and is 1 for the whole live move. */
      const w = s.far * bloom;
      f.ringFar.scale.set(w, 1, w);
      f.ringFar.rotation.y = f.age * 0.5;
      f.ringFar.material.opacity = 0.8 * A;
    }
    /* Only when there really are two distances — see `_fig`. */
    f.ringNear.visible = s.near > 0.01 && s.far - s.near > 0.08;
    if (f.ringNear.visible) {
      f.ringNear.position.set(s.px, y + 0.01, s.pz);
      const w = s.near * bloom;
      f.ringNear.scale.set(w, 1, w);
      f.ringNear.rotation.y = -f.age * 0.85;
      f.ringNear.material.opacity = 0.55 * A;
    }

    /* --- IS SHE ALLOWED TO SEE IT COMING? ---
       Reported from play: "when using the teleport ability, should not be
       showing where the player is teleporting to before they teleport when a
       player target is selected, should be a secret. It should only show where
       the player is teleporting to, beforehand, when an enemy target is not
       selected."

       SO THE PREVIEW IS A FUNCTION OF WHETHER THERE IS A VICTIM. With nobody
       locked the Flash Step is a movement tool and the ghost is how she aims
       it — that case is untouched. With somebody locked it is an ATTACK, and
       showing her sister the exact square she is about to appear on hands the
       defender a half-second of free warning about the one thing that should
       cost her a read. The ring around the victim still snaps down, so the
       warning that matters — YOU are the one being circled, and here is the
       colour of who is doing it — is unchanged and is about to get louder.

       NOTHING IS DELETED, ONLY DELAYED. The spoke, the ghost and the whole
       sin/cos triangle all come back the instant she commits, because
       `f.placed` opens every one of them — and the figure is frozen at that
       moment and holds for `FIG_OUT`, so there is MORE time to read the
       working after the jump than there ever was before it. The first
       non-negotiable is about the maths being drawn honestly, not about when.
       A version of this that suppressed the triangle outright would be the
       report used as an excuse to delete a lesson. */
    const secret = s.hasT && !f.placed;

    /* --- her, coming apart, on the spot she has not left yet ---
       ON HER LIVE POSITION AND NOT ON THE SNAPSHOT, which is the one place in
       this file that wants the live number: the snapshot deliberately freezes
       at the commit so the maths can be read, and a ghost of her that froze
       with it would be standing behind her the moment she is nudged. */
    const winding = live && p.dodgeT > 0 && !f.placed;
    if (f.windGhost) {
      f.windGhost.visible = winding;
      if (winding) {
        /* IT BOILS. One sine drives the slide, the lift and the brightness
           together, so the whole thing breathes as one object rather than as
           three effects that happen to share a sprite — and the lift takes
           its MAGNITUDE, so she bobs twice per slide and never sinks into the
           floor. */
        const boil = Math.sin(f.age * WIND_HZ * Math.PI * 2);
        f.windGhost.position.set(
          p.position.x + boil * WIND_DRIFT,
          p.position.y + Math.abs(boil) * WIND_DRIFT * 0.6,
          p.position.z
        );
        f.windGhost.material.opacity = WIND_A * (0.7 + 0.3 * boil) * inK;
      }
    }

    /* --- her spirit: a glowing orb, where the preview kitten used to stand ---
       TWO PLACES IT CAN BE, AND THE SECRET PICKS WHICH. With nobody locked it
       hovers over the landing and IS the preview — that is the aim, and it is
       the case the whole ghost used to serve. With somebody locked the landing
       is a secret until she takes it (see `secret`, above), so the orb hovers
       over HER instead: her spirit gathered and not yet gone anywhere. Either
       way every Flash Step has one, which is what makes the shell at the far
       end read as the same object arriving rather than as a new effect. */
    const hgt = p.height ?? 2.9;
    const previewing = live && !f.placed && s.ok && !secret;
    const spiriting = live && p.dodgeT > 0 && !f.placed;
    const ox = previewing ? s.hx : p.position.x;
    const oy = (previewing ? s.hy : p.position.y) + hgt * 0.62;
    const oz = previewing ? s.hz : p.position.z;
    if (f.spirit && f.heart) {
      for (const sp of [f.spirit, f.heart]) sp.visible = spiriting;
      if (spiriting) {
        /* A HALO IN HER COLOUR ROUND A WHITE HEART, and the heart is what
           stops four kittens' spirits all reading as "a bright dot": the core
           says LIGHT and the halo says WHOSE. It swells as she gathers. */
        const pulse = 1 + Math.sin(f.age * 11) * 0.12;
        const r = hgt * SPIRIT_R * (0.55 + 0.45 * Math.min(1, f.age / 0.22)) * pulse;
        f.spirit.position.set(ox, oy, oz);
        f.heart.position.copy(f.spirit.position);
        f.spirit.scale.setScalar(r * 2.6);
        f.heart.scale.setScalar(r * 1.05);
        f.spirit.material.opacity = SPIRIT_A * inK;
        f.heart.material.opacity = 0.95 * inK;
      }
    }

    /* --- and the two shells: one closing on the spot she left, one opening on
       the spot she arrives ---
       ON `BURST_T` AND NOT ON `FADE`, for the reason written at `BURST_T`: the
       hand-off between two drawings of her is a tenth of a second, and an
       event that has to be READ is not. The figure holds for `FIG_OUT` after
       the move ends, which is where the rest of this happens. */
    const bk = f.placed ? Math.min(1, f.since / BURST_T) : 0;
    const shellR = hgt * SPIRIT_R * 2.6;
    if (f.burstIn) {
      f.burstIn.visible = f.placed && bk < 1;
      if (f.burstIn.visible) {
        f.burstIn.position.set(s.hx, s.hy + hgt * 0.5, s.hz);
        /* OUT FAST, THEN COASTING. The same ease the reticle's lock uses, and
           for the same reason: a shell that opens at a constant rate reads as
           a UI element resizing rather than as something happening. */
        const ease = 1 - (1 - bk) * (1 - bk);
        f.burstIn.scale.setScalar(shellR * (0.5 + ease * BURST_X));
        f.burstIn.material.opacity = (1 - bk) * (1 - bk) * 1.1;
      }
    }
    if (f.burstOut) {
      f.burstOut.visible = f.placed && bk < 1;
      if (f.burstOut.visible) {
        /* THE SAME SHELL, RUN BACKWARDS. She did not appear here, she left —
           so this one starts wide and closes on nothing, which is the only
           drawing that says "gone" rather than "happened". */
        f.burstOut.position.set(s.sx, s.sy + hgt * 0.5, s.sz);
        f.burstOut.scale.setScalar(shellR * (0.3 + (1 - bk) * BURST_X * 0.7));
        f.burstOut.material.opacity = (1 - bk) * 0.85;
      }
    }

    /* --- and the fade out of one place and into the other ---
       Two sprites and not one, because for the length of `FADE` she is
       genuinely in both: leaving is not finished before arriving starts, which
       is what makes it read as a teleport rather than as a cut. */
    if (f.echoOut) {
      const k = f.placed ? 1 - f.since / FADE : 0;
      f.echoOut.visible = k > 0;
      if (f.echoOut.visible) {
        f.echoOut.position.set(s.sx, s.sy, s.sz);
        f.echoOut.material.opacity = k;
      }
    }
    if (f.echoIn) {
      /* SOLID AT `MANIFEST` OF THE WINDOW, NOT AT THE END OF IT. Asked for:
         "make fully opaque once about 95% complete with the entire teleporting
         process". It used to reach 1 on the very frame her real sprite came
         back, which is a clean hand-off and therefore reads as nothing at all
         — she was simply there. Landing the ghost a hair EARLY leaves one
         frame where both drawings are solid, and that frame is what makes an
         arrival an arrival.

         AND SHE BLINKS ON HER WAY IN. "Make their player avatar blink back
         into existence" — a square wave whose duty cycle climbs with `k`, so
         she is mostly absent at the start of the window and continuous by the
         end of it, and it stops DEAD at `MANIFEST` rather than trailing off.
         A blink still running once she is supposed to be solid is the
         invulnerability flicker, which means something else entirely. */
      const k = Math.min(1, f.since / (FADE * MANIFEST_K));
      const solid = k >= 1;
      const strobe = solid
        || Math.sin(f.since * BLINK_HZ * Math.PI * 2) > 0.55 - k * 1.6;
      f.echoIn.visible = f.placed && f.since < FADE && strobe;
      if (f.echoIn.visible) {
        f.echoIn.position.set(s.hx, s.hy, s.hz);
        f.echoIn.material.opacity = k;
      }
    }

    /* --- the rain, at both ends of the jump ---
       "Can also show some kanji characters and matrix effect... can maybe have
       the main effects happen at where the teleport begins and then have it
       happen when the player teleports in the new location. So there are two
       main locations where the cool kanji/matrix/spiritual effects happen."

       THE ARRIVING COLUMN CANNOT EXIST BEFORE SHE ARRIVES, and that is not a
       taste call. A column of light standing on the square she is about to
       appear on gives the landing away exactly as completely as the ghost and
       the spoke did, and the whole `secret` rule above is about not handing a
       defender that half second for free. So `rainOut` runs from the press and
       `rainIn` only from the commit — which is also the truer picture, since
       she is not there yet.

       BOTTOM-ANCHORED (`RAIN_CENTRE`), so the position IS the ground it stands
       on and there is no half-height to get wrong. */
    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    if (f.rainOut) {
      const k = f.placed
        ? clamp01(1 - f.since / BURST_T)
        : clamp01(f.age / 0.18);
      f.rainOut.visible = k > 0.01;
      if (f.rainOut.visible) {
        f.rainOut.position.set(
          f.placed ? s.sx : p.position.x,
          f.placed ? s.sy : p.position.y,
          f.placed ? s.sz : p.position.z
        );
        f.rainOut.material.opacity = 0.7 * k * A;
      }
    }
    if (f.rainIn) {
      const k = f.placed
        ? clamp01(f.since / 0.08) * clamp01(1 - f.since / (BURST_T * 1.4))
        : 0;
      f.rainIn.visible = k > 0.01;
      if (f.rainIn.visible) {
        f.rainIn.position.set(s.hx, s.hy, s.hz);
        f.rainIn.material.opacity = 0.7 * k * A;
      }
    }

    /* --- the spoke, in her colour: the target, to where she comes out --- */
    const ly = 0.09;
    /* THE SPOKE IS THE LANDING, DRAWN AS A LINE. It points from the victim
       straight at the square she is about to stand on, so it gives the secret
       away just as completely as the ghost does. Same gate. */
    f.vec.visible = s.ok && !secret;
    if (f.vec.visible) {
      setSeg(f.vec, s.px, s.py + ly, s.pz, s.hx, s.hy + ly, s.hz);
      f.vec.material.opacity = 0.95 * A;
    }

    /* --- the path, in the target's colour: where she was, to where she is --- */
    const mvx = s.px - s.fx;
    const mvz = s.pz - s.fz;
    const moved = Math.hypot(mvx, mvz);
    const showB = s.hasT && moved > MOVED_MIN;
    f.moved.visible = showB;
    if (showB) {
      f.moved.material.color.set(s.tcol);
      setSeg(f.moved, s.fx, s.fy + ly, s.fz, s.px, s.py + ly, s.pz);
      f.moved.material.opacity = 0.9 * A;
    }

    /* --- and theta, which is the angle between those two lines ---
       BOTH LINES END AT THE PERSON SHE PICKED, so the angle between them is a
       real angle at a real vertex and not an abstraction: the rays leaving her
       sister are "towards where you came out" and "back the way you came".
       Everything printed below is computed from those two rays, so the triangle
       cannot draw one thing and say another — which is the entire rule the
       Kotodama Orb is built on. */
    /* AND THE TRIANGLE IS BUILT ON THE SPOKE, so it cannot be drawn while the
       spoke is a secret: `r cos θ` and `r sin θ` are the legs of the landing
       itself, and a right angle drawn at the victim's feet points at the
       answer as plainly as the line does. `showB` already required a locked
       target, so with nobody locked nothing here changes at all — and with one
       locked, the whole figure arrives together on the commit frame. */
    const tri = s.ok && showB && !secret;
    for (const o of [f.cosLeg, f.sinLeg, f.arc]) o.visible = tri;
    for (const l of [f.lblTheta, f.lblCos, f.lblSin]) l.visible = tri;
    if (tri) {
      const bx = -mvx / moved;                    // the ray back along her path
      const bz = -mvz / moved;
      const ax = s.hx - s.px;
      const az = s.hz - s.pz;
      const r = Math.max(1e-6, Math.hypot(ax, az));
      const ux = ax / r;
      const uz = az / r;
      const cos = Math.max(-1, Math.min(1, ux * bx + uz * bz));
      const th = Math.acos(cos);
      const sin = Math.sin(th);
      /* The adjacent leg, laid along her path, and the opposite one closing on
         the landing. `r * cos` goes NEGATIVE past a right angle and the foot
         lands on the far side of her — which is correct, is what the Dojo
         draws for an obtuse angle, and is the case a clamp would have hidden. */
      const fx = s.px + bx * (r * cos);
      const fz = s.pz + bz * (r * cos);
      const ty = s.py + ly * 0.8;
      setSeg(f.cosLeg, s.px, ty, s.pz, fx, ty, fz);
      setSeg(f.sinLeg, fx, ty, fz, s.hx, s.hy + ly * 0.8, s.hz);
      f.cosLeg.material.opacity = 0.85 * A;
      f.sinLeg.material.opacity = 0.85 * A;

      /* The swept arc, from the path round to the spoke, the short way. The
         2D cross product gives the sense of the turn; rotating `b` by a
         positive angle produces a positive cross with it, so the two agree by
         construction rather than by a sign somebody guessed. */
      const ar = Math.min(2.4, r * 0.42);
      const sgn = bx * uz - bz * ux >= 0 ? 1 : -1;
      const steps = Math.max(2, Math.min(ARC_MAX, Math.ceil(th / 0.12) + 1));
      const ap = f.arc.geometry.attributes.position;
      for (let i = 0; i < steps; i++) {
        const a = sgn * th * (i / (steps - 1));
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        ap.setXYZ(i, s.px + (bx * ca - bz * sa) * ar, ty + 0.02, s.pz + (bx * sa + bz * ca) * ar);
      }
      ap.needsUpdate = true;
      f.arc.geometry.setDrawRange(0, steps);
      f.arc.material.opacity = 0.9 * A;

      const ha = sgn * th * 0.5;
      const hc = Math.cos(ha);
      const hs = Math.sin(ha);
      f.lblTheta.position.set(
        s.px + (bx * hc - bz * hs) * ar * 1.5,
        ty + 1.15,
        s.pz + (bx * hs + bz * hc) * ar * 1.5
      );
      f.lblCos.position.set((s.px + fx) / 2, ty + 0.8, (s.pz + fz) / 2);
      f.lblSin.position.set((fx + s.hx) / 2, ty + 0.8, (fz + s.hz) / 2);
      f.lblTheta.setText(`θ = ${Math.round((th * 180) / Math.PI)}°`);
      f.lblCos.setText(`r cos θ = ${(r * cos).toFixed(1)}`);
      f.lblSin.setText(`r sin θ = ${(r * sin).toFixed(1)}`);
      for (const l of [f.lblTheta, f.lblCos, f.lblSin]) l.mat.opacity = A;
    }

    /* THE RAIN ABOVE IS THE SECOND VERSION OF ITSELF. The first was cut by
       name — "remove the kanji symbols appearing before/after teleporting, it
       is just extra unneeded screen clutter" — and the note left behind it
       read: do not put it back without taking something else out.

       THE DIRECTOR ASKED FOR IT BACK AND PAID THE PRICE IN THE SAME NOTE. The
       see-through KITTEN that used to stand on the landing is gone, replaced
       by an orb the size of her head — about a fifth of the screen area, and
       exactly the trade the rule demanded. What is above is also not what was
       cut: twelve discrete objects per jump became two sprites sharing one
       texture and one scroll. The header says all of this at length.

       THE RULE STILL STANDS FOR THE NEXT PERSON. This figure is dense — two
       rings, a boiling ghost, an orb, two shells, two rains, a spoke, a path,
       two coloured legs, a swept arc and three live readouts, in a quarter of
       a screen — and nothing else goes into it without something coming out. */
  }

  /**
   * Turn the figure's readouts toward THIS camera.
   *
   * THE ONLY THING IN THIS FILE THAT NEEDS A HOOK, and it is worth saying why
   * nothing else does: every other new piece is a `THREE.Sprite`, which three.js
   * turns during each pane's own render, so it faces all four at once by
   * itself. A `Label` is a quad on a mesh and has to be told. Called from
   * `Game._faceAll`.
   */
  faceCamera(camera) {
    for (const f of this.figs.values()) {
      if (!f.group.visible) continue;
      f.lblTheta.faceCamera(camera);
      f.lblCos.faceCamera(camera);
      f.lblSin.faceCamera(camera);
    }
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

      /* --- IT HANGS, AND THEN IT FALLS ---
         The hang is the trick: a log standing in mid-air exactly where a
         kitten was is what sells the substitution. Then gravity arrives and it
         is an object again. The fall is its own constant and its own integrator
         — three lines rather than a shared physics step, because there is no
         shared physics step in this game and inventing one for a joke would be
         the wrong trade. */
      if (d.float > 0) d.float = Math.max(0, d.float - dt);
      else if (d.group.position.y > d.floor) {
        d.vy -= DECOY_G * dt;
        d.group.position.y = Math.max(d.floor, d.group.position.y + d.vy * dt);
        if (d.group.position.y <= d.floor) d.vy = 0;
      }
    }
  }
}
