/* ---------------------------------------------------------------------------
   WHO EACH PLAYER IS, in one table.

   Every field here used to be an `index === 0 ? a : b` somewhere — the marker
   ring, the health bar, the bar's low-health colour, the colour restored after
   an edge warning, the panda's name, the respawn spot, the minimap pip, the
   minimap arrow, the seek chevron, and the marker reset on restart. Ten copies
   of "there are exactly two of them", none of which mention each other, and the
   one that got forgotten would be a third kitten who is pink like the second.

   IT LIVES IN core/ RATHER THAN ON `Player` BECAUSE OF WHO READS IT. The
   entity, the panda, the minimap, the HUD and the game loop all want it, and
   `panda.js` importing it from `player.js` closes an import cycle — player.js
   already imports PANDA_SPEED from panda.js. That cycle happens to work today
   because both constants are read inside function bodies rather than at module
   scope, which is a fact about where two lines happen to sit and not a thing
   worth depending on.

   THE COLOURS ARE PICKED FOR A SPLIT SCREEN, NOT FOR A PALETTE. The marker
   ring is how a kid finds herself on a busy screen, so what matters is that the
   four are far apart in HUE at ring size — not that they look nice listed in a
   row. They are matched to the sprite recolours in `spritesheet.js`, which come
   out peaking at 180 and 270 degrees (measured, see HANDOFF), so a player's
   ring is the same hue as her cat and no two players sit within 60 degrees.

   `startX` is where she stands at the start of a game and `spawnX` is where she
   comes back after a fall — two different moments that already had two
   different numbers before any of this (3.5 and 3), so they stay two fields
   rather than being quietly unified into one and moving both.

   THE FIRST TWO KEEP THE VALUES THEY ALREADY HAD and the new pair goes OUTSIDE
   them rather than the four being spread evenly: the girls play two-player most
   of the time, and quietly moving where Ember respawns to make room for a
   kitten nobody has added yet is a change to the game they already know, made
   for a reason that does not apply to them. Interleaved is fine — these are
   points on a line and every pair is at least 3 apart.

   `panda` is here because two girls both shouting about "the panda" was the
   original reason those names exist, and four makes it worse.

   THE NAMES ARE PLACEHOLDERS FOR THE TWO NEW CATS. Ember and Frost were named
   by the girls; Storm and Blossom were not. They follow the dragon-breath set
   the first two already sit in (fire, frost, lightning, blossom), which is the
   best guess available, but they are one edit away from whatever the girls
   actually want and nothing outside this table hardcodes them.
--------------------------------------------------------------------------- */

export const PLAYER_STYLE = [
  {
    name: 'Ember', colour: 0xff8a3d, panda: 'Bao', startX: -3.5, spawnX: -3,
    /** Which sheet she is drawn from, and the recolour applied to it. */
    sheet: 'ember', recolour: null,
  },
  {
    name: 'Frost', colour: 0xff6fae, panda: 'Mochi', startX: 3.5, spawnX: 3,
    sheet: 'frost', recolour: null,
  },
  {
    name: 'Storm', colour: 0x35d7f0, panda: 'Kohaku', startX: -7, spawnX: -6,
    /* Ember is 63% saturated with 2.5% grey, so rotating every hue by a
       constant moves her whole palette and keeps the relationships inside it:
       teal fur, and the blue kimono comes round to orange. */
    sheet: 'ember', recolour: { hue: 170 },
  },
  {
    name: 'Blossom', colour: 0xa96bff, panda: 'Yuzu', startX: 7, spawnX: 6,
    /* Frost is a GREY CAT — 37% of her is under 0.12 saturation — and a
       rotation does nothing to a pixel with no saturation to rotate. Her greys
       are given a hue outright, and the cross-fade is widened (`greyS`) so her
       fur commits to it rather than landing between the two. Measured: this
       peaks at 270 against Storm's 180, which is the separation the split
       screen needs. See recolourPixels in core/spritesheet.js. */
    sheet: 'frost', recolour: { hue: 210, tint: 300, tintSat: 0.40, greyS: 0.50 },
  },
];

/** The most players the game will seat. Four fits the quadrant split, the
 *  ring's team modes, and the two keyboard sets plus a split Joy-Con pad. */
export const MAX_PLAYERS = PLAYER_STYLE.length;

/** Her style, or the first one — an out-of-range index must degrade to a
 *  visible kitten rather than to `undefined.colour` and a blank screen. */
export function styleFor(index) {
  return PLAYER_STYLE[index] ?? PLAYER_STYLE[0];
}

/** The same colour as a CSS string, for the canvas-2D minimap and the HUD.
 *  DERIVED rather than listed a second time: a table of hex numbers and a
 *  table of hex strings is two tables, and the one nobody remembers is the one
 *  that ends up a different orange. */
export function styleCss(index) {
  return `#${styleFor(index).colour.toString(16).padStart(6, '0')}`;
}
