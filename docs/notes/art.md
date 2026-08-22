# Art and the sprite pipeline

*Design notes, moved verbatim out of the old 4,400-line `HANDOFF.md`. This is
the WHY behind code that already exists — read it when you are about to change
something in this area, not before. Current state and open work live in
[HANDOFF.md](../../HANDOFF.md); the always-on summary is [CLAUDE.md](../../CLAUDE.md).*

*Cross-references saying "above" or "below" may now point at a sibling file in
this folder — see [the index](README.md).*

---

## The dragons looked low-res because of the CELL, not the art

`loadSpriteAtlas` packed every sheet into a fixed cell — 384 through
`_loadSprite`. That is honest for a kitten, where ten directions across four
poses fill the atlas. It is badly wrong for a dragon, and the reason is the
**shape** of the drawing rather than its size: the dragon is one long horizontal
creature squeezed into a **square** cell, so the fit is decided by its width and
its height gets whatever falls out.

```
dragon_sheet.png    2752x1536 on disk, one figure
packed into 384     338 px wide  ->  193 px TALL
```

193 pixels, stretched over an animal that fills a third of the screen when you
are riding it — which is exactly why it looks sharp opened in a viewer and soft
in the game. The art was never the problem.

`cell` is a **floor** now and the real size is derived: big enough not to
downscale the source at all, clamped by `maxAtlas` (2048), never below what the
caller asked for. Measured after:

```
dragon perched   384x384  ->  2048x2048 atlas,  drawn 1798 x 1027 px
ryuuseki         512x512  ->  1387x1387,        drawn 1220 x  596 px
panda adult      384      ->  1046
ember / frost    3840x1536 and 3072x1536  —  BYTE-FOR-BYTE UNCHANGED
```

**The kitten sheets landing on the floor is not luck, it is the design.** Ten
columns hit `maxAtlas / cols` well below 384, so they take the floor — which
matters, because the sprite-direction checks measure real cells out of those
sheets and a repack would move every number they assert. `scale` is also capped
at 1: upscaling into a bigger cell invents detail that isn't there and pays
memory for the pretence.

Cost: roughly 85MB more texture memory across the single-figure sheets.
`maxAtlas` is the knob if that ever matters on a weak laptop.


---

## The sprite pipeline

The kitten sheets are a grid: **columns are a full 360° rotation, rows are
animation poses** (idle, walk, jump, attack). `loadSpriteAtlas()` turns a raw
generated sheet into a clean game atlas, and four things in it matter:

1. **Background removal floods inward from the image borders** rather than
   thresholding on white. The cats have cream chests, white paws and white
   eyes — a global threshold punches holes straight through them. Flooding
   from the edges stops at the black lineart, so interior whites survive.

2. **Cells are found by connected-component labelling**, rows first then
   columns within each row. Column projection fails: a swept tail overlaps its
   neighbour's columns and ten views read as four. Rows must be clustered
   before columns, or a jumping figure (drawn higher) gets grouped with the
   walking figure beside it.

3. **The column count is measured, not assumed.** Image models do not reliably
   honour "exactly 8 columns" — asking for 8 repeatedly returns 10. The loader
   counts what was actually drawn and the game maps however many cells it gets
   evenly around the circle, so a sheet with 10 directions just works. The gap
   threshold for splitting is deliberately small (12% of a figure's width);
   sheets are packed tightly and a generous threshold silently merges
   neighbours.

4. **Everything is re-packed** at one scale shared across the whole sheet — not
   per row, or the character would change size the moment it started walking.
   Each row is bottom-aligned to *its own* ground line. Baselines are compared
   within a row and never across rows: rows sit at different absolute heights
   in the source image, so a sheet-wide baseline lifts the top row clean out of
   its cell.

The output is a square-celled atlas with transparent padding around each cell.
Two consequences:

- **Billboard quads must be square** — giving a quad the art's own aspect ratio
  stretches it a second time.
- The padding, plus a half-texel UV inset in `Billboard._setCell`, is what stops
  atlas **bleeding** — without both, mipmaps and bilinear filtering reach across
  the cell boundary and drag a ghost of the neighbouring frame down one edge.

**Full-turn sheets are not mirrored.** Mirroring a half-turn to cover the other
side is cheaper, but it flips asymmetric details — Ember's tail and shoulder
guard swap sides when facing right. `mirror: false` on the `Billboard` uses the
drawn cell for every direction instead.

## Replacing the art

Drop a new sheet into `public/sprites/` with the same filename and refresh.
Live files are `ember_grid_v2.png` and `frost_grid.png`; the game logs
`[art] <file> → N directions x M poses` at boot so you can check what it found.

Ask for a grid of 4 rows (idle, walk, jump, attack) and 8+ columns rotating a
full turn, starting facing the viewer and turning toward the viewer's right.
Whatever column count comes back is fine. Side-on art that faces left (like the
dragon) needs `artFacesRight: false`.

### Two rules for generating new sprites

**Ask for a transparent background, not a white one.** Everything already in
`public/sprites/` is a white-background PNG that the loader keys at load time,
and that keeps working. New art should not be. The flood fill in point 1 above
is structurally unable to reach background the lineart has sealed shut — the
inside of a ring, the gap between an arm and a body — and `clearSealedPockets`
is an opt-in patch over that rather than a fix, tuned against one sheet and
nearly wrong about Mr. Satan's teeth. Higgsfield's image models return opaque
PNGs, so the route is: generate on white, then run the result through the
Higgsfield `remove_background` tool before it lands in `public/sprites/`.

The loader needs no change for this and must not get one. `isBackgroundish`
requires r, g, b >= 218; a transparent pixel reads (0, 0, 0, 0) off the canvas,
so on an alpha sheet the border flood never seeds and `loadSpriteAtlas` passes
the drawing through untouched. The two conventions coexist with no flag.

**A new player pose is FOUR kittens, always.** There are two drawn sheets and
four playable cats: Storm is `recolourAtlas` of Ember's, Blossom of Frost's.
Every per-pose sheet therefore comes in a pair — `ember_eat`/`frost_eat`,
`ember_bless`/`frost_bless` — and the pair is expanded in `Game._loadArt` by a
loop over **`PLAYER_STYLE`, not over the roster slots**. Deriving by slot is one
copy-paste away and gives you Storm eating as a grey Frost. Never generate a
pose for Ember alone.

**Check that every row turns the same way before you use a sheet.** Image
models don't guarantee it — `frost_grid_v2.png` came back with its jump and
attack rows mirrored against its idle and walk rows, which no single setting
can correct, and it's kept out of the game for that reason. The quickest test:
column N should be the same direction in all four rows, and one column should
be a plain back view in all four.
