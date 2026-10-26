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
 *   sheets  "kittens/ember/grid_v2": { order, flip } — a sheet's columns
 *           re-dealt: `order` lists, 0-based, which source column each new
 *           column is (so it reorders AND drops: "[1, 2, 4, 7, 6, 5, 8, 9]"
 *           is order [0, 1, 3, 6, 5, 4, 7, 8]), `flip` the NEW columns drawn
 *           mirrored. Every row the same, as asked ("of each row"). The key is
 *           the file's path under public/sprites without `.png` (`sheetIdOf`),
 *           and EVERY sheet loaded through `loadSpriteAtlas` honours it, so a
 *           sheet added next year needs no wiring. A Bamboo Infiltration clip
 *           is `ninja/ember:sneak`, and its `order` is FRAMES (ClipSprite).
 *           A clip's rows are FACINGS, and each has its own: `ninja/ember:
 *           mount@2` is the right profile's order alone (`clipKey`). Richard,
 *           Oct 2026: "changing the order and flip values seems to be applying
 *           it to all 'facing' animations in the clip, it should only apply it
 *           to each individual facing". The bare key is still read, for every
 *           facing that has none of its own — the file he saved before keeps
 *           working, and keeps meaning what it meant.
 *           A clip can carry a POSE fix too, `poses["ninja/ember:mount"]`:
 *           `{ s, y }` only (`clipPoseFix`), so the mount and the rope can be
 *           stood at the same height ("there should be way for me to edit
 *           these in the sprite editor").
 *   off     "housing/doormats": ["risingsun"] — cells a sheet's own consumer
 *           must not offer (`isOff`). Only sheets whose code asks honour it;
 *           the editor shows the switch only on those.
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

/** `/sprites/kittens/ember/grid_v2.png` -> `kittens/ember/grid_v2`: the key a sheet's fix is saved under. */
export function sheetIdOf(url) {
  const m = /\/sprites\/(.+?)\.(?:png|webp)$/i.exec(String(url ?? '').split('?')[0]);
  return m ? m[1] : null;
}

/** Is cell `id` of sheet `sheet` switched off in the game? */
export function isOff(sheet, id, fix = LIVE) {
  const list = fix?.off?.[sheet];
  return Array.isArray(list) && list.includes(id);
}

/** `all` without the ones switched off - or `all`, if that would leave none (a list must degrade, never empty). */
export function enabledOf(sheet, all, key = (c) => c.id, fix = LIVE) {
  const on = all.filter((c) => !isOff(sheet, key(c), fix));
  return on.length ? on : all;
}

/** The kendo drawings' files, by the Player key that wears them (player.js `setKendoArt`). */
export const KENDO_FILE = {
  kendoPose: 'kendo', kiaiPose: 'kiai', seizaPose: 'seiza', reachPose: 'reach', reiPose: 'rei',
  kparryPose: 'kparry', kbrokePose: 'kbroke', kclinchRPose: 'kclinchR', kclinchLPose: 'kclinchL',
};
/** ...and the home poses' (`setHomeArt`). */
export const HOME_FILE = { prayPose: 'pray', bathPose: 'bath', futonPose: 'futon', teaPose: 'tea' };
/** ...and the single drawings of the everyday and the arena (`Player._poseBoard`). The headset's
 *  are the same names with `vr_` in front (`setSimLook`), and take `s` and `y` only. */
export const SINGLE_FILE = {
  eatPose: 'eat', blessPose: 'bless', warpPose: 'warp', breathPose: 'inhale',
  scaredPose: 'scared', sweepPose: 'sweep', ripostePose: 'riposte',
};

/** The fix for one pose drawing: `{ s, x, y }`, 1/0/0 where nothing is set. `fix` is for the checks. */
export function poseFix(sheet, file, fix = LIVE) {
  const f = fix?.poses?.[`${sheet}/${file}`];
  const s = num(f?.s, 1);
  return { s: s > 0.05 && s < 20 ? s : 1, x: num(f?.x, 0), y: num(f?.y, 0) };
}

/* The first editor saved the two kitten grids as `ember/grid_v2` and `frost/grid`, before every sheet
   had a key: still read, so a file saved by it keeps working. The editor renames them on its next save. */
export const LEGACY_SHEET = { 'kittens/ember/grid_v2': 'ember/grid_v2', 'kittens/frost/grid': 'frost/grid' };

/**
 * The fix for a turnaround sheet with `cols` columns, or null. Null too when
 * `order` is not a list of whole columns the sheet has — the sheet is then
 * drawn as it came.
 */
export function sheetFix(id, cols, fix = LIVE, row = null) {
  const own = row == null ? null : fix?.sheets?.[clipKey(id, row)];
  const f = own ?? fix?.sheets?.[id] ?? fix?.sheets?.[LEGACY_SHEET[id]];
  const order = f?.order;
  if (!Array.isArray(order) || !order.length) return null;
  if (!order.every((c) => Number.isInteger(c) && c >= 0 && c < cols)) return null;
  const flip = (Array.isArray(f.flip) ? f.flip : []).filter((c) => Number.isInteger(c) && c >= 0 && c < order.length);
  return { order: [...order], flip };
}

/**
 * The flip box's IMAGE numbers -> the SLOTS the file mirrors. Each mention
 * claims the next slot showing that image that is not claimed yet, so with
 * order 1,2,3,6,5,6,7,8, "6" mirrors the first 6 alone and "6, 6" both.
 * Richard, Oct 2026: "When I put 6 for flip, it seems to flip both 6's in
 * the ordering". The file always held slots, so the game could draw this; it
 * was the box that read "6" as every 6. A mention with no slot left is
 * returned in `extra`, so the editor can say so instead of dropping it.
 * 0-based throughout.
 */
export function flipSlots(order, imgs) {
  const flip = []; const extra = [];
  for (const c of imgs) {
    const k = order.findIndex((o, i) => o === c && !flip.includes(i));
    if (k < 0) extra.push(c); else flip.push(k);
  }
  return { flip: flip.sort((a, b) => a - b), extra };
}

/** ...and back: the image in each mirrored slot, in slot order, repeats kept, so `flipSlots` reads it back to the same slots
 *  whenever the mirrored ones are each the earliest of their image. */
export const flipImages = (order, flip) => [...flip].sort((a, b) => a - b).map((k) => order[k]);

/** `ninja/ember:mount` + facing 2 -> `ninja/ember:mount@2`: one facing's own frame order. */
export const clipKey = (id, row) => `${id}@${row}`;

/** A clip's size and height: `{ s, y }` (her heights), 1/0 where nothing is set. Its `x` is never read —
 *  a clip is drawn from four or eight sides, and "forward" is a different way on every one of them. */
export function clipPoseFix(id, fix = LIVE) {
  const i = id.indexOf('/');
  const { s, y } = poseFix(id.slice(0, i), id.slice(i + 1), fix);
  return { s, y };
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
