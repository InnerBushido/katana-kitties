/**
 * THE SPRITE FIXES — what /sprites.html (src/sprite-editor.js) saves, read by
 * the game. Richard, Oct 2026: "Since we have so much trouble with getting the
 * correct scale of the sprites, let's build a sprite adjustment editor so I can
 * manually align the sprites placement and scale and we can save that ... Like
 * an entire atlas modification tool that lays out all the sprites and where I
 * can manually override any of the sprites functionality or change the
 * ordering."
 *
 * TWO KINDS OF FIX, both in src/spritefix.json:
 *
 *   poses   "ember/kiai": { s, x, y } — a one-drawing pose (the kendo set, the
 *           home poses) drawn `s` times the size the code gives it, moved `x`
 *           FORWARD (the way the drawing points, so it follows a mirror) and
 *           `y` up, both in units of her height. The code's own numbers
 *           (`KENDO_POSE_H`, `feetX`) stay the defaults; this is OVERRIDES
 *           ONLY, like tuning.json, and `{}` is the game as it was.
 *   sheets  "ember/grid_v2": { order, flip } — a turnaround sheet's columns
 *           re-dealt: `order` lists, 0-based, which source column each new
 *           column is (so it reorders AND drops: "[1, 2, 4, 7, 6, 5, 8, 9]"
 *           is order [0, 1, 3, 6, 5, 4, 7, 8]), `flip` the NEW columns drawn
 *           mirrored. Every row the same, as asked ("of each row").
 *
 * EVERY FIELD DEGRADES. A pose fix that is not a finite number is the code's
 * number; a sheet fix whose order names a column the sheet does not have is
 * no fix at all — a sprite that silently vanishes, or NaNs a quad, is worse
 * than one drawn the old size. Keyed by SHEET, not by kitten: Storm is Ember's
 * drawings recoloured, so she wears Ember's fixes.
 */
import FIX from '../spritefix.json' with { type: 'json' };

/* THE FIXES IN FORCE. The file, until the editor hands over a draft it is showing (`setSpriteFix`) —
   it builds real Players to draw with, so what it shows is the game's own arithmetic on the draft. */
let LIVE = FIX ?? {};
/** The editor's draft, in force for every pose built after it. Never called by the game. */
export function setSpriteFix(fix) { LIVE = fix ?? {}; }

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** The kendo drawings' files, by the Player key that wears them (player.js `setKendoArt`). */
export const KENDO_FILE = {
  kendoPose: 'kendo', kiaiPose: 'kiai', seizaPose: 'seiza', reachPose: 'reach', reiPose: 'rei',
  kparryPose: 'kparry', kbrokePose: 'kbroke', kclinchRPose: 'kclinchR', kclinchLPose: 'kclinchL',
};
/** ...and the home poses' (`setHomeArt`). */
export const HOME_FILE = { prayPose: 'pray', bathPose: 'bath', futonPose: 'futon', teaPose: 'tea' };

/** The fix for one pose drawing: `{ s, x, y }`, 1/0/0 where nothing is set. `fix` is for the checks. */
export function poseFix(sheet, file, fix = LIVE) {
  const f = fix?.poses?.[`${sheet}/${file}`];
  const s = num(f?.s, 1);
  return { s: s > 0.05 && s < 20 ? s : 1, x: num(f?.x, 0), y: num(f?.y, 0) };
}

/**
 * The fix for a turnaround sheet with `cols` columns, or null. Null too when
 * `order` is not a list of whole columns the sheet has — the sheet is then
 * drawn as it came.
 */
export function sheetFix(id, cols, fix = LIVE) {
  const f = fix?.sheets?.[id];
  const order = f?.order;
  if (!Array.isArray(order) || !order.length) return null;
  if (!order.every((c) => Number.isInteger(c) && c >= 0 && c < cols)) return null;
  const flip = (Array.isArray(f.flip) ? f.flip : []).filter((c) => Number.isInteger(c) && c >= 0 && c < order.length);
  return { order: [...order], flip };
}

/**
 * Re-deal an atlas's columns (`sheetFix`): a new canvas, `order.length` cells
 * wide, every row the same, the `flip` columns mirrored in place. The atlas
 * comes back with its texture and `cols` replaced and everything measured
 * (contentScale, pad, aspect) as it was — those are per cell, and a cell is
 * copied whole. Unchanged without a DOM or a fix.
 */
export function applySheetFix(atlas, fix, THREE) {
  const img = atlas?.texture?.image;
  if (!fix || !img?.width || typeof document === 'undefined') return atlas;
  const cell = img.width / atlas.cols;
  const ch = img.height / atlas.rows;
  const c = document.createElement('canvas');
  c.width = Math.round(cell * fix.order.length);
  c.height = img.height;
  const g = c.getContext('2d');
  for (let r = 0; r < atlas.rows; r++) {
    fix.order.forEach((src, k) => {
      g.save();
      if (fix.flip.includes(k)) {
        g.translate((k + 1) * cell, 0);
        g.scale(-1, 1);
        g.drawImage(img, src * cell, r * ch, cell, ch, 0, r * ch, cell, ch);
      } else {
        g.drawImage(img, src * cell, r * ch, cell, ch, k * cell, r * ch, cell, ch);
      }
      g.restore();
    });
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = atlas.texture.colorSpace;
  texture.anisotropy = atlas.texture.anisotropy;
  return { ...atlas, texture, cols: fix.order.length, fixed: fix };
}

/** The whole file, for the editor's starting point. */
export const SPRITE_FIX = FIX ?? {};
