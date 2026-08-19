import * as THREE from 'three';

/* ---------------------------------------------------------------------------
   Crisp world-space text. Canvas textures on camera-facing quads — used for
   the axis numbers, angle labels and live readouts in the Unit Circle Dojo.

   TWO KINDS OF LABEL, and picking the wrong one is how the Dojo used to kill a
   phone. See `CACHE` and `live` below; the short version is that text written
   once shares a cached texture, and text that changes every frame owns one.
--------------------------------------------------------------------------- */

/* CONTENT-KEYED AND DELIBERATELY NEVER EVICTED.

   Every entry here is text that is written once and read for the rest of the
   session — axis numbers, clan names, the gate sign, the falling kana. Those
   are shared by reference across materials, so disposing one to make room
   would blank whatever else still had it mapped. "Never evict" is the price of
   "share freely", and it is the right trade *for static text*.

   It is catastrophic for text that changes every frame, which is why `live`
   labels exist and why the budget guard below exists to catch the next one. */
const CACHE = new Map();

/* THE GUARD THAT WOULD HAVE CAUGHT THE DOJO.

   A volatile `setText` does not throw, does not slow down at first, and does
   not look like anything at all until the tab dies — so the only useful defence
   is to say so out loud the moment the cache stops looking like static text.
   48 MB is far above anything the real static set reaches (a few dozen labels,
   comfortably under 10 MB) and far below the ~1 GB a single volatile readout
   reached in ten seconds. */
const CACHE_WARN_BYTES = 48 * 1024 * 1024;
let cacheBytes = 0;
let warned = false;

/* HOW MANY TEXTURE PIXELS PER AUTHORED PIXEL.

   THE GLYPHS WERE DRAWN 1:1 AND THAT IS WHY EVERY PIECE OF WORLD TEXT LOOKED
   SOFT. `size` is an authored height in canvas pixels, and the quad it lands on
   is sized in WORLD units — so how many screen pixels a label actually covers
   depends on the camera, not on `size`. Standing next to a clan leader, or
   reading the Dojo's axis numbers on a phone at devicePixelRatio 3, the texture
   is magnified well past 1:1 and the browser has nothing left to sample.

   Supersampling is the whole fix: draw at SS times the size, keep the mesh
   exactly as big, and let the mipmap chain handle the minified case. Nothing
   about the quad's world size changes, so no caller moves.

   3 rather than 2, because 2 is still visibly soft against a 3x panel — and
   these textures are small. A long label at size 88 is roughly 700x150, so 3x is
   about 1.2MB before mipmaps, and there are a few dozen of them at most. That is
   a rounding error next to one dragon sheet at 16MB. */
const SS = 3;

/* A LIVE LABEL IS SUPERSAMPLED LESS, AND THE REASON IS THE CLAMP.

   SS = 3 buys headroom for MAGNIFICATION — a label the camera has come close to,
   drawn far past 1:1. A live label is `fixedScreenSize`, and `faceCamera` clamps
   that scale to 1.75, so it is the one kind of label that is *structurally
   prevented* from being magnified much. Paying 3x for headroom it cannot use
   costs 2.25x the pixels on every single re-upload, which for text that changes
   every frame is the whole cost.

   Checked on screen against the axis numbers beside them, which are still SS 3:
   at 2 there is no readable difference on these readouts. */
const LIVE_SS = 2;

/* HOW OFTEN A LIVE LABEL MAY ACTUALLY REPAINT, in milliseconds.

   THE REGRESSION THIS FIXES: making labels repaint in place stopped the texture
   LEAK and replaced it with a texture UPLOAD, once per changed label per frame.
   Measured with three orbs each and the Dojo on screen — 7.3 repaints a frame
   across 33 MB of live canvas, about 1.3 ms of pure upload every frame, on a
   desktop GPU. It made the orbs and the Dojo island lag badly.

   A NUMBER A CHILD IS READING DOES NOT NEED SIXTY UPDATES A SECOND. At 80 ms it
   is still visibly live — it tracks her as she walks — and it is 5x less upload.
   This is the knob that matters; the size reduction above is the multiplier on
   top of it.

   Deliberately NOT driven by the game's `dt`: every caller would have to thread
   it through, and a label that is updated from two places (the Dojo's readouts
   are, once per pane) would then advance its own clock twice as fast. Wall time
   is the thing actually being rationed. */
const LIVE_MS = 80;

/** The authored (pre-supersample) box a string needs.
 *
 *  THE HEIGHT IGNORES THE TEXT ENTIRELY, which is not an accident and is what
 *  makes a `live` label possible at all: only the width moves with the string,
 *  so reserving the widest string reserves every string. */
function measureBox(text, opts = {}) {
  const { size = 88, font = 'Bangers', italic = false, pad = 18 } = opts;
  /* Measured at the AUTHORED size and then scaled, rather than measured at the
     supersampled size. Both give the same aspect, but measuring small and
     multiplying keeps `aspect` bit-identical to what it was before
     supersampling existed — and `aspect` is what sizes the quad, so a drift here
     would silently resize every label in the game. */
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = `${italic ? 'italic ' : ''}${size}px ${font}, sans-serif`;
  return {
    w: Math.ceil(measure.measureText(text).width) + pad * 2,
    h: Math.ceil(size * 1.4) + pad * 2,
  };
}

/* ONE PAINTER FOR BOTH PATHS. A cached label and a live label have to come out
   pixel-identical, or the Dojo's readouts would visibly differ from the axis
   numbers standing next to them — and two copies of this is how that happens. */
function paint(g, text, w, h, opts, ss) {
  const {
    size = 88, color = '#fff6de', stroke = '#1d1216', strokeWidth = 8,
    font = 'Bangers', italic = false,
  } = opts;
  /* `setTransform` before `clearRect`, because a live canvas is repainted and
     the previous pass left `scale(ss, ss)` on the context — clearing under that
     scale would wipe the top-left corner and leave the rest of the last string
     on screen, behind the new one. */
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w * ss, h * ss);
  /* One scale on the context and every coordinate below stays in authored
     units — so the drawing code is untouched and cannot disagree with the
     measurement above. `ss` differs between the two paths (see LIVE_SS) and
     nothing else in here has to know that. */
  g.scale(ss, ss);
  g.font = `${italic ? 'italic ' : ''}${size}px ${font}, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.miterLimit = 2;
  if (strokeWidth > 0) {
    g.strokeStyle = stroke;
    g.lineWidth = strokeWidth;
    g.strokeText(text, w / 2, h / 2);
  }
  g.fillStyle = color;
  g.fillText(text, w / 2, h / 2);
}

function newTexture(cv) {
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  /* 8, not 4: these quads are read at a slant whenever the camera is not square
     to them, which for a label standing in the world is most of the time. */
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export function makeLabelTexture(text, opts = {}) {
  const {
    size = 88, color = '#fff6de', stroke = '#1d1216', strokeWidth = 8,
    font = 'Bangers', italic = false,
  } = opts;

  const key = `${text}|${size}|${color}|${stroke}|${strokeWidth}|${font}|${italic}`;
  if (CACHE.has(key)) return CACHE.get(key);

  const { w, h } = measureBox(text, opts);
  const cv = document.createElement('canvas');
  cv.width = w * SS;
  cv.height = h * SS;
  paint(cv.getContext('2d'), text, w, h, opts, SS);

  /* `aspect` is deliberately the AUTHORED ratio, not the canvas ratio. They are
     equal — SS scales both axes — and saying so here is what stops somebody
     "fixing" it to `cv.width / cv.height` and getting the same number by luck. */
  const out = { texture: newTexture(cv), aspect: w / h };
  CACHE.set(key, out);

  cacheBytes += cv.width * cv.height * 4;
  if (cacheBytes > CACHE_WARN_BYTES && !warned) {
    warned = true;
    console.warn(
      `[label] static texture cache passed ${(cacheBytes / 1048576) | 0} MB across `
      + `${CACHE.size} entries, most recently "${text}". Cached labels are never `
      + 'freed, so this means something is calling setText with text that moves — '
      + 'pass `live: "<widest string>"` to Label instead.'
    );
  }
  return out;
}

/** What the shared cache is holding. Exists for `tools/world-check.mjs`, which
 *  asserts that walking the Dojo does not grow it. */
export function labelCacheStats() {
  return { entries: CACHE.size, bytes: cacheBytes };
}

/**
 * A label that always faces the camera and keeps a constant on-screen size
 * regardless of distance — so it stays readable when the camera pulls back.
 *
 * Pass `live: '<the widest string this will ever show>'` for text that changes
 * while the game runs. That is not an optimisation; see `_live` below.
 */
export class Label extends THREE.Object3D {
  constructor(text, opts = {}) {
    super();
    const { height = 1.6, fixedScreenSize = false, refDistance = 70, live = null } = opts;
    this.fixedScreenSize = fixedScreenSize;
    /** Camera distance at which the label draws at its authored size. */
    this.refDistance = refDistance;
    this.baseHeight = height;

    let texture;
    let aspect;
    if (live) {
      /* WHY A CHANGING LABEL OWNS ITS CANVAS.

         `CACHE` is keyed by the string and never evicts (see the note on it),
         so a `setText` whose text moves every frame mints a texture per distinct
         value and holds every one of them forever. The Dojo's point readout is
         the worst case in the game: `( 0.71 , 0.71 )` has 201 x 201 possible
         values, so one lap of the circle — about ten seconds of walking — minted
         568 supersampled canvases at 1.71 MB each. Measured: 972 MB per lap,
         from a single label. A phone is dead in about four seconds, which is
         precisely the "it lags and then the tab crashes" the Dojo shipped with.

         So: size the canvas ONCE from `live`, which the caller promises is the
         widest string it will ever draw, and repaint it in place. The quad's
         aspect is then fixed, so no geometry is rebuilt; and the material keeps
         the SAME texture object, so `mat.needsUpdate` is never set and three.js
         never re-resolves the shader program. That program churn was the other
         half of the stall and it cost frames well before memory did.

         Shorter text just leaves more transparent margin — nothing shifts. The
         glyphs are painted centred and the quad is centred on its origin, so a
         label is anchored by its middle either way. */
      const box = measureBox(live, opts);
      this._live = { w: box.w, h: box.h, opts };
      /** Last text ASKED for. `_text` is the last text actually PAINTED, and the
       *  throttle is the gap between them. */
      this._want = text;
      /* Negative, not 0. `performance.now()` is small for the first moments of a
         page, so a zero here would make the throttle swallow the first change on
         any label built during boot — briefly, and only once, which is exactly
         the kind of thing that gets diagnosed as something else. */
      this._paintedAt = -LIVE_MS;
      const cv = document.createElement('canvas');
      cv.width = box.w * LIVE_SS;
      cv.height = box.h * LIVE_SS;
      this._liveCtx = cv.getContext('2d');
      paint(this._liveCtx, text, box.w, box.h, opts, LIVE_SS);
      texture = newTexture(cv);
      aspect = box.w / box.h;
    } else {
      ({ texture, aspect } = makeLabelTexture(text, opts));
    }

    this.mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: opts.depthTest !== false,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(height * aspect, height), this.mat);
    this.add(this.mesh);
    this.renderOrder = 20;
    this.mesh.renderOrder = 20;
    this._text = text;
    this._opts = opts;
    this._aspect = aspect;
  }

  setText(text) {
    if (this._live) {
      /* THROTTLED, AND COMPARED AGAINST `_want` RATHER THAN `_text`.

         The naive version compares against the last PAINTED text and returns
         early when they match — which, once the throttle drops a frame, means a
         label that stops changing never paints its final value and sits showing
         a stale number forever. `_want` is what the game asked for; `_text` is
         what is on the canvas; the repaint happens when they differ and enough
         time has passed. Callers keep calling this every frame with the same
         value when the player stands still, so the last value always lands —
         within LIVE_MS of being asked for. */
      this._want = text;
      if (text === this._text) return;
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (now - this._paintedAt < LIVE_MS) return;
      this._paintedAt = now;
      this._text = text;
      const { w, h, opts } = this._live;
      paint(this._liveCtx, text, w, h, opts, LIVE_SS);
      /* The texture object is unchanged — only its pixels are — so this is a
         re-upload and nothing else. Touching `mat.needsUpdate` here would throw
         away half the reason a live label exists. */
      this.mat.map.needsUpdate = true;
      return;
    }
    if (text === this._text) return;
    this._text = text;
    const { texture, aspect } = makeLabelTexture(text, this._opts);
    this.mat.map = texture;
    this.mat.needsUpdate = true;
    if (Math.abs(aspect - this._aspect) > 0.001) {
      this._aspect = aspect;
      this.mesh.geometry.dispose();
      this.mesh.geometry = new THREE.PlaneGeometry(this.baseHeight * aspect, this.baseHeight);
    }
  }

  faceCamera(camera) {
    this.mesh.quaternion.copy(camera.quaternion);
    if (this.fixedScreenSize) {
      // Grow with distance so on-screen size stays roughly constant, but
      // clamped: unclamped, a pulled-back camera makes labels swallow the
      // diagram they are annotating.
      const d = camera.position.distanceTo(this.getWorldPosition(_tmp));
      const s = THREE.MathUtils.clamp(d / this.refDistance, 0.45, 1.75);
      this.mesh.scale.setScalar(s);
    }
  }
}

const _tmp = new THREE.Vector3();
