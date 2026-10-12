import { HOUSE_BY_ID, ITEM_BY_ID } from './catalog.js';

/* ---------------------------------------------------------------------------
   FURNISHING — the tatami grid and the yard plots, as data.

   A room is a grid of 2-unit tatami cells (`room.w / 2` by `room.d / 2`);
   a placed item is `{ id, gx, gz, rot }` and covers `cells` (swapped on a
   quarter turn). The rules live here, pure, so the card and world-check ask
   the same questions:
     fits(room, items, it, gx, gz, rot) — inside the grid, overlapping nothing
     yardFits(plot, it)                 — the plot's kind is one it names
   "Valid, theme-matching area": a koi pond can only go on a water plot, a
   kendo dojo only in a room flagged kendo, and so on.
--------------------------------------------------------------------------- */

export function gridOf(room) {
  return { cols: Math.max(1, Math.floor(room.w / 2)), rows: Math.max(1, Math.floor(room.d / 2)) };
}

export function footprint(it, rot = 0) {
  const [a, b] = it.cells ?? [1, 1];
  return rot % 2 ? [b, a] : [a, b];
}

export function fits(room, items, it, gx, gz, rot = 0, skip = -1) {
  const { cols, rows } = gridOf(room);
  const [w, d] = footprint(it, rot);
  if (gx < 0 || gz < 0 || gx + w > cols || gz + d > rows) return false;
  for (const [k, q] of (items ?? []).entries()) {
    if (k === skip) continue;
    const qi = ITEM_BY_ID[q.id];
    if (!qi) continue;
    const [qw, qd] = footprint(qi, q.rot);
    if (gx < q.gx + qw && gx + w > q.gx && gz < q.gz + qd && gz + d > q.gz) return false;
  }
  return true;
}

/** The first free spot for `it` in a room, scanning rows; or null. */
export function firstFit(room, items, it) {
  const { cols, rows } = gridOf(room);
  for (let rot = 0; rot < 2; rot++) {
    for (let gz = 0; gz < rows; gz++) {
      for (let gx = 0; gx < cols; gx++) {
        if (fits(room, items, it, gx, gz, rot)) return { gx, gz, rot };
      }
    }
  }
  return null;
}

export function yardFits(plot, it) {
  return !!it && !it.later && (it.where ?? []).includes(plot.kind);
}

/**
 * A preset, furnished: its room things into the first rooms that take them
 * and its yard things onto the first plots of the right kind. Whatever does
 * not fit is skipped — a preset is a head start, not a promise.
 */
export function autoLayout(H, preset, isle) {
  const def = HOUSE_BY_ID[H.house];
  const rooms = (def?.rooms ?? []).filter((r) => !H.rooms?.[r.id]?.type || H.rooms[r.id].type === 'living');
  H.rooms ??= {};
  for (const id of preset.room ?? []) {
    const it = ITEM_BY_ID[id];
    if (!it) continue;
    for (const room of rooms) {
      const R = (H.rooms[room.id] ??= { type: 'living', items: [] });
      R.items ??= [];
      const at = firstFit(room, R.items, it);
      if (at) { R.items.push({ id, ...at }); break; }
    }
  }
  H.yard ??= {};
  for (const id of preset.yard ?? []) {
    const it = ITEM_BY_ID[id];
    const plot = isle?.plots.find((P) => !H.yard[P.id] && yardFits(P, it));
    if (plot) H.yard[plot.id] = id;
  }
  return H;
}

/** Sell-back for one item: the same 75% as a house. */
export const ITEM_SELL = 0.75;
