/* ---------------------------------------------------------------------------
   What kind of machine is this, and what may it spend?

   ONE PLACE, because the answer is asked by three unrelated systems — the
   renderer (antialias, pixel ratio, shadows), the art loader (how big an atlas
   may be) and later the input layer (is touch the primary device) — and three
   copies of "is this a phone" is how they drift apart. It is the same
   duplication `_padDevices` exists to prevent in `core/input.js`.

   `profileFor` IS PURE, so `tools/world-check.mjs` can assert the tiers without
   a browser, exactly like `splitLayout`. `detect()` is the only part that
   touches `window`, and it is a thin read of four capabilities.

   WHY THE ATLAS BUDGET IS `maxAtlas` AND NEVER `cell`.

   NOT because `cell` would resize the characters — that was the first answer
   written here and it is WRONG, which a world-check assertion caught. Work
   `packMetrics` through (see `core/spritesheet.js`) and `contentScale` comes out
   as `(1 - 2*pad) * tallest / max(tallest, widest)` in every branch: `cellPx`
   cancels out of all of them. That is the entire purpose of the field — a
   character ends up the world height it asked for however loosely the sheet
   packed — so quad size survives both knobs untouched.

   The real reason is what those sheets are MEASURED for. At `cell: 384` the two
   kitten sheets are floor-pinned, because `maxAtlas / 10` and `maxAtlas / 8` are
   both far below the floor:

     cellPx = max(cell, min(ideal, maxAtlas / max(cols, rows)))
            = max(384, min(437, 204))
            = 384                       <- the floor wins, whatever maxAtlas is

   so they repack BYTE-FOR-BYTE UNCHANGED, and the sprite-direction checks
   measure real cells out of them. Move `cell` and every number they assert
   moves. `maxAtlas` cannot reach a floor-pinned sheet at all, which is exactly
   what makes it the safe knob: it bites the big single-figure sheets that are
   over budget (both dragons at 2048x2048, Ryuuseki, the leaders) and nothing
   the checks look at.

   THE CRITTER SHEETS ARE EXEMPT TOO, for a different reason: `world-check`
   asserts the rabbit you chase is exactly `size` tall, measured at
   `cell: 256, maxAtlas: 768`. Those four numbers are shared with the loader on
   purpose. A budget applied to them would move an assertion, not a pixel.
--------------------------------------------------------------------------- */

/* THE THREE RENDER TIERS, and they live here rather than in `main.js` because
   they are half of an arithmetic this file owns the other half of. The effective
   pixel ratio is the MINIMUM of three numbers — the panel's, the tier's and the
   device cap — and keeping the tiers next door is what lets `world-check` assert
   the product instead of restating the factors. Restating them is how the mobile
   tier ended up rendering at 1.0 with nothing to catch it. */
export const QUALITY = {
  high: { pixelRatio: 2, shadows: true, shadowSize: 2048 },
  medium: { pixelRatio: 1.5, shadows: true, shadowSize: 1536 },
  /* 0.75, NOT 1, AND THAT NUMBER IS THE WHOLE OF THE LOW TIER.

     THIS GAME IS FILL-BOUND, MEASURED. Same scene, same 600 draw calls and
     287,776 triangles, only the buffer size moving:

       0.20 Mpx   6.1 ms      1.45 Mpx  11.6 ms
       0.36 Mpx   6.1 ms      2.27 Mpx  15.7 ms
       0.82 Mpx   8.4 ms      3.27 Mpx  22.9 ms

     which is a straight line in PIXELS with the CPU flat underneath it. Every
     other knob is noise beside it: turning shadows off saved 1.0 ms of 11.6,
     and hiding all 700 drifting petals saved nothing measurable at all.

     So the one thing a player who is dropping frames needs is fewer pixels —
     and until this line said 0.75, `low` COULD NOT GIVE THEM ANY. The effective
     ratio is `min(devicePixelRatio, tier, deviceCap)`, so on the commonest
     desktop there is — a 1:1 panel, `devicePixelRatio` exactly 1 — `high`,
     `medium` and `low` all came out at 1.0 and the setting bought nothing but
     the shadows. A monitor is what decides the cost, and the setting could not
     reach it.

     Below 1 the buffer is smaller than the panel and the browser scales it up,
     which is what every game's resolution slider does and is the only lever
     that works on hardware that is out of fill rate. 0.75 is 44% fewer
     fragments; it reads as soft rather than as broken, and the HUD, the menus
     and the maths board are all DOM and stay razor sharp through it.

     It also reaches the cautious phone tier, whose default quality is `low` —
     which is right: a four-core phone is exactly who this is for. */
  low: { pixelRatio: 0.75, shadows: false, shadowSize: 1024 },
};

/**
 * What this machine will ACTUALLY render at — the number that matters and the
 * one nobody was looking at.
 *
 * THREE CAPS MULTIPLY DOWN, and reading any one of them alone tells you nothing.
 * `maxPixelRatio: 1.5` looks generous until it is combined with
 * `defaultQuality: 'low'`, whose tier pins the ratio to 1; the product on a 3.0
 * panel was 1.0, and the game shipped to a phone at one ninth of its pixels.
 * Exposed so a check can assert the product.
 */
export function effectivePixelRatio(profile, dpr, quality = profile.defaultQuality) {
  const q = QUALITY[quality] ?? QUALITY.medium;
  return Math.min(dpr, q.pixelRatio, profile.maxPixelRatio);
}

/** Atlas ceilings, in pixels, per tier. See the header for why this is the
 *  only art number that varies by device. */
const ATLAS = { full: 2048, reduced: 1024 };

const OVERRIDE_KEY = 'kk.device.override';

/** 'auto' | 'desktop' | 'mobile' — a hand-set answer about THE ON-SCREEN PAD.
 *
 *  THIS EXISTS FOR TESTING ON THE MACHINE THE GAME IS BUILT ON, which is the
 *  only way the touch controls get looked at more than once a week. It is
 *  persisted rather than held in memory because the two heaviest things it
 *  decides — `antialias` and `atlasMax` — are read once at boot and cannot
 *  change afterwards, so a test mode that did not survive a reload could only
 *  ever test half of itself.
 *
 *  IT NO LONGER DECIDES WHAT KIND OF MACHINE THIS IS. See `padOn` below: on a
 *  real phone, 'desktop' means "take the stick away", not "pretend this is a
 *  laptop". */
export function readOverride() {
  try {
    const v = localStorage.getItem(OVERRIDE_KEY);
    return v === 'desktop' || v === 'mobile' ? v : 'auto';
  } catch {
    return 'auto';   // private mode: detection is the only answer available
  }
}

export function writeOverride(mode) {
  try {
    if (mode === 'auto') localStorage.removeItem(OVERRIDE_KEY);
    else localStorage.setItem(OVERRIDE_KEY, mode);
  } catch {
    /* nothing persists this session; the live half of the switch still works */
  }
}

/**
 * Turn raw capabilities into what the game may spend. Pure — no `window`.
 *
 * @param {object} caps
 * @param {boolean} caps.coarse    the primary pointer is coarse (a finger)
 * @param {number}  caps.touchPoints  navigator.maxTouchPoints
 * @param {number}  caps.dpr       devicePixelRatio
 * @param {number}  caps.cores     navigator.hardwareConcurrency, 0 if unknown
 * @returns {{touchPrimary: boolean, padOn: boolean, tier: string,
 *            antialias: boolean,
 *            maxPixelRatio: number, atlasMax: number, defaultQuality: string,
 *            defaultParty: number, defaultSplit: string}}
 */
export function profileFor({
  coarse = false, touchPoints = 0, dpr = 1, cores = 0, override = 'auto',
} = {}) {
  /* BOTH SIGNALS, NOT EITHER. `maxTouchPoints > 0` alone calls every
     touchscreen laptop a phone and would take antialiasing off a desktop; a
     coarse primary pointer alone misses nothing in practice but costs nothing
     to pair. A machine is touch-primary when the finger is the main pointer AND
     there is a digitiser behind it. */
  const detected = coarse && touchPoints > 0;

  /* TWO QUESTIONS, NOT ONE, AND CONFLATING THEM IS THE BUG THIS SPLIT FIXES.
     They were a single boolean, and it did double duty:

       WHAT KIND OF MACHINE IS THIS?  -> `touchPrimary`. Everything about SIZE
         and LAYOUT reads this: `body.touch-ui`, the minimap's cap, the Dojo's
         camera distance, the render tier, the atlas budget, the split default.

       IS THE STICK ON SCREEN?        -> `padOn`. Only two things read this:
         whether the pad is drawn, and whether the input layer deals it a slot.

     Turning the pad OFF on a phone — which is what you do the moment you pick
     up a real controller, because the stick and the face cluster are then just
     clutter over the game — took the whole PHONE UI with it. Desktop-sized
     minimap eating a quarter of a 390px-tall screen, desktop panels, desktop
     camera. Reported from a Galaxy S24 Ultra with a pad in hand.

     A phone with the stick hidden is still a phone. `touchPrimary` therefore
     asks about the HARDWARE (plus the desktop test mode, which has to be able
     to claim to be one), and `padOn` asks about the CONTROL.

     Every other combination is bit-identical to what it was: a desktop on
     'auto' is false/false, the desktop test mode is true/true, a phone on
     'auto' is true/true. Only "phone + force off" moves, and it moves from
     false/false to true/false — which is what it always should have been. */
  const touchPrimary = detected || override === 'mobile';
  const padOn = override === 'auto' ? detected : override === 'mobile';

  if (!touchPrimary) {
    return {
      touchPrimary: false,
      padOn: false,
      tier: 'desktop',
      override,
      detected,
      antialias: true,
      /* FINITE, NOT `Infinity`, AND THAT IS NOT FUSSINESS. This means "the
         quality setting is the only cap" — 4 is above any panel that exists, so
         `Math.min` never picks it. `Infinity` did the same job right up until
         something serialised it: `JSON.stringify` turns it into `null` and
         `Math.min(dpr, q, null)` is 0, which is a black screen. Prefer a rule
         that degrades over one that vanishes. */
      maxPixelRatio: 4,
      atlasMax: ATLAS.full,
      defaultQuality: 'medium',
      /* TWO KITTENS, UNCHANGED. This is the number the girls press PLAY and
         get, and every check that pins the two-player game reads it. */
      defaultParty: 2,
      defaultSplit: 'auto',
    };
  }

  /* A PHONE WITH FEW CORES IS THE ONLY ONE THAT GETS THE CAUTIOUS TIER, and
     that split exists because the first version applied the cautious tier to
     EVERYTHING with a touchscreen. On a Galaxy S24 Ultra that game ran without
     dropping a frame and looked terrible, which is the wrong trade in both
     directions — see the numbers on `maxPixelRatio` below. */
  /* `detected`, NOT `override === 'auto'`, AND THE DIFFERENCE NOW MATTERS.
     Both spellings kept the desktop test mode off the cautious tier — which is
     the point, since the machine being tested on has twenty cores and would
     otherwise quietly exercise the FASTER path. But `override === 'auto'` also
     said a real four-core phone stops being weak the moment its owner hides the
     stick, which is nonsense: the override is about a control, and this is
     about silicon. `detected` asks the hardware question directly. */
  const weak = detected && cores > 0 && cores <= 4;
  return {
    touchPrimary: true,
    /* SEPARATE FROM THE TIER ON PURPOSE — see the note above. A phone whose
       owner has plugged a controller in still wants every phone-sized answer
       below; it just does not want a thumbstick drawn over the game. */
    padOn,
    tier: weak ? 'mobile-low' : 'mobile',
    override,
    detected,
    /* MSAA off only on the cautious tier. It costs bandwidth, which is what a
       mobile GPU has least of — but a modern phone has plenty, and the thing it
       fixes is the crunchy edge on every white drifting particle. It is a
       WebGLRenderer CONSTRUCTOR option and cannot be changed later, which is why
       this is decided before the renderer exists. */
    antialias: !weak,
    /* THIS NUMBER WAS 1.5 AND IT WAS THE SINGLE BIGGEST MISTAKE IN THE MOBILE
       PASS. Read it together with the quality tier, because they MULTIPLY down:
       `_applyQuality` takes `Math.min(devicePixelRatio, quality, this)`. At
       `defaultQuality: 'low'` — which was also set here — `QUALITY.low.pixelRatio`
       is 1, so the effective ratio on an S24 Ultra was:

         Math.min(3.0, 1.0, 1.5) = 1.0

       One third of the panel's linear resolution, one ninth of its pixels, on a
       device that turned out to have so much headroom it never dropped a frame.
       Every "it looks low-res" complaint traced back to this line and to the two
       below it.

       2.5 rather than 3.0 so a phone that IS struggling has somewhere to fall
       back to, and because the difference between 2.5 and 3.0 is invisible at
       arm's length while costing 44% more fragments. `high` caps it at 2.0
       anyway; this is the ceiling, not the setting. */
    maxPixelRatio: weak ? 1.25 : 2.5,
    /* FULL-SIZE SHEETS ON A CAPABLE PHONE. The reduced ceiling halves every
       single-figure sheet — both dragons, Ryuuseki, the six leaders — and that
       is exactly the art that gets drawn biggest: a dragon fills a third of the
       screen when you are riding it. 147MB of texture is nothing to a phone with
       8GB of RAM, and the saving was never the point on hardware like that. The
       cautious tier keeps it. */
    atlasMax: weak ? ATLAS.reduced : ATLAS.full,
    /* NOT `low`. `low` also turns shadows off, which is most of what makes the
       world look flat, and pins the pixel ratio to 1. A capable phone should
       open on the same tier a laptop does and be turned DOWN if it struggles —
       the setting is right there, and a kid is far more likely to notice a soft
       picture than a frame rate. */
    defaultQuality: weak ? 'low' : 'high',
    /* ONE KITTEN ON A PHONE. A second player needs a second device — see
       `defaultSplit`. Additive by construction: nothing reads this on a
       desktop, where `defaultParty` is still 2. */
    defaultParty: 1,
    /* NEVER SPLIT BY DEFAULT, EVEN IF A SECOND PLAYER JOINS ON A PAD. Half a
       6-inch screen each is not a playable pane; a tablet is, so this is a
       default and not a lock — Settings can still choose to split. */
    defaultSplit: 'never',
  };
}

/** Read this machine's capabilities. The only part that touches `window`. */
export function detect() {
  if (typeof window === 'undefined') return profileFor({});
  return profileFor({
    coarse: window.matchMedia?.('(pointer: coarse)')?.matches ?? false,
    touchPoints: navigator.maxTouchPoints ?? 0,
    dpr: window.devicePixelRatio ?? 1,
    cores: navigator.hardwareConcurrency ?? 0,
    override: readOverride(),
  });
}
