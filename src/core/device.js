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

/** Atlas ceilings, in pixels, per tier. See the header for why this is the
 *  only art number that varies by device. */
const ATLAS = { full: 2048, reduced: 1024 };

/**
 * Turn raw capabilities into what the game may spend. Pure — no `window`.
 *
 * @param {object} caps
 * @param {boolean} caps.coarse    the primary pointer is coarse (a finger)
 * @param {number}  caps.touchPoints  navigator.maxTouchPoints
 * @param {number}  caps.dpr       devicePixelRatio
 * @param {number}  caps.cores     navigator.hardwareConcurrency, 0 if unknown
 * @returns {{touchPrimary: boolean, tier: string, antialias: boolean,
 *            maxPixelRatio: number, atlasMax: number, defaultQuality: string,
 *            defaultParty: number, defaultSplit: string}}
 */
export function profileFor({ coarse = false, touchPoints = 0, dpr = 1, cores = 0 } = {}) {
  /* BOTH SIGNALS, NOT EITHER. `maxTouchPoints > 0` alone calls every
     touchscreen laptop a phone and would take antialiasing off a desktop; a
     coarse primary pointer alone misses nothing in practice but costs nothing
     to pair. A machine is touch-primary when the finger is the main pointer AND
     there is a digitiser behind it. */
  const touchPrimary = coarse && touchPoints > 0;

  if (!touchPrimary) {
    return {
      touchPrimary: false,
      tier: 'desktop',
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

  /* A phone with plenty of cores is still a phone: the thermal budget, not the
     core count, is what a 20-minute play session runs into. `cores` only
     separates "reduced" from "reduced and do not push it" — it never buys a
     touch device the desktop tier. */
  const weak = cores > 0 && cores <= 4;
  return {
    touchPrimary: true,
    tier: weak ? 'mobile-low' : 'mobile',
    /* MSAA on a phone costs bandwidth, which is the one thing a mobile GPU has
       least of, and it is invisible at 400+ ppi. It is a WebGLRenderer
       CONSTRUCTOR option — it cannot be changed later — so this has to be
       decided before the renderer exists. */
    antialias: false,
    /* 1.5 rather than the panel's own ratio. An S24 Ultra reports 3.0; at four
       viewports that is nine times the fragments of a 1.0 buffer for a screen
       you hold at arm's length. Capped rather than pinned to 1 so the HUD text
       and the minimap stay crisp. */
    maxPixelRatio: weak ? 1.0 : 1.5,
    atlasMax: ATLAS.reduced,
    defaultQuality: 'low',
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
  });
}
