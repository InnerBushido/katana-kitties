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

## Where a sheet lives

`public/sprites/` is grouped by subject, one folder per kind of thing:

```
sprites/
  kittens/ember/   grid_v2.png  bless.png  eat.png  inhale.png  scared.png  warp.png
  kittens/frost/   grid.png     (the same five poses)
  leaders/         thunderpaw  riverclaw  shadowtail  windwhisker  icewhisker
                   pandapaw  elder          — one front-facing cell each
  clans/           thunder  river  shadow  wind  ice  panda   (the emblems)
  satan/           satan.png  charge.png
  critters/        rat  rat_shock  rabbit  rabbit_run  rabbit_shock
                   bird  bird_shock  mantis
  beasts/          dragon_sheet  dragon_fly  griffin  ryuuseki
                   panda_adult  panda_cub
  fx/              angel_wings.png
  title_art.webp
```

**TWO FOLDERS FOR FOUR KITTENS, and that is the whole point of the shape.**
Storm draws from Ember's sheet and Blossom from Frost's, through
`recolourAtlas` — so `kittens/` having exactly two children is the file tree
saying out loud that a new pose is **two drawings**, and that nothing has to
remember the other two. A `kittens/storm/` folder appearing here would be the
first sign somebody has started drawing four.

**THE NAME INSIDE THE FOLDER DROPS WHAT THE FOLDER ALREADY SAYS.**
`leader_icewhisker.png` became `leaders/icewhisker.png` and `clan_ice.png`
became `clans/ice.png`, which is what lets `main.js` build both from the same
id it already had — `` `/sprites/leaders/${n}.png` ``. The two turnarounds keep
theirs: `ember/grid_v2.png` against `frost/grid.png` is the one difference
between the two sheets that a reader has to know about, because Frost's v2 is
the sheet that contradicts itself and is parked in `docs/unused-art/`.

**`title_art.webp` stays loose, because it is not a sprite.** It is the title
screen's background, read by `style.css` and by `steam-art.mjs`, and a folder
of one file is filing rather than organisation.

**The masters in `docs/art-masters/` are flat and stay flat** — there are three
of them. `sprite-bake.mjs` carries the shipped path on each job as `out`, so a
master is free to be named after the drawing while the shipped copy is named
after where it is used.

## Replacing the art

Drop a new sheet into `public/sprites/` over the same path and refresh.
The live turnarounds are `kittens/ember/grid_v2.png` and
`kittens/frost/grid.png`; the game logs
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

~~The loader needs no change for this and must not get one. `isBackgroundish`
requires r, g, b >= 218; a transparent pixel reads (0, 0, 0, 0) off the canvas,
so on an alpha sheet the border flood never seeds and `loadSpriteAtlas` passes
the drawing through untouched. The two conventions coexist with no flag.~~

**That paragraph was wrong, and it is struck through rather than deleted
because it is the most plausible wrong thing in this file and somebody will
reason their way back to it.** A transparent pixel does *not* read (0, 0, 0, 0)
off the canvas. `getImageData` returns whatever RGB is stored under the alpha,
and `remove_background` leaves the pixels it cleared at their **original**
colour — which, on art generated on white, is (255, 255, 255, 0). Transparent,
and backgroundish. The flood seeded on it happily, walked inward through
transparency it never needed to touch, arrived at the drawing, found drawn
white that is also backgroundish, and kept going.

Reported from play as *"the `satan_charge.png` image seems to have transparency
around the shoulders where it should be white… if the image has transparency
already, we shouldn't be finding/removing the white from the image, because
that means the white is part of the image."* Exactly right. Measured: of the
ten sheets that arrive keyed, the six with white under their transparency
(both dragons, `satan_charge`, both inhales, `ember_scared`) are precisely the
ones the flood could eat — 224 opaque pixels off Mr Satan's shoulders, 2,838
off Ember's inhale, 11,062 off Frost's. The other four were cleared to a
non-white RGB, which is the only reason `mantis` and the warps escaped.

The fix is `alreadyKeyed()`: **if 90% or more of a sheet's border is alpha 0,
the sheet has been keyed by somebody who had the whole image, and every pixel
on it — white included — is paint.** `keyOutBackground` returns it untouched,
skipping the flood, the pocket pass *and* the soften pass, which was the same
bug in miniature (it lowers the alpha of any pale pixel touching transparency,
which on a keyed sheet is every white pixel along a real drawn edge). The two
populations are not close: the sheets that arrive opaque have **0.0%** border
transparency and the keyed ones **97.5%** or more, and `world-check` asserts
both that gap and that the threshold sits inside it.

### Magenta, and why it ends this whole family of bugs

Asked as *"when we generate the images, can we generate them with a pink/bright
green background and then after generating them, we can make the bright color
transparent? Generating the images with white background is problematic and
makes it hard to remove the background when we need to."*

Yes — and it does not add a rule, it removes all of them. Every rule in
`spritesheet.js` exists for one reason: **on a white background a background
pixel and a drawn pixel can be the same colour**, so the only thing separating
them is whether the border can walk to it. The flood, `clearSealedPockets`, the
size floor, the depth bound, `fillHoles`, `alreadyKeyed` — all of it is a proxy
for a fact the image threw away.

On magenta they are never the same colour, so the test is per pixel and needs
no geometry:

- it reaches **sealed** pockets, because it never had to walk anywhere;
- it cannot eat a white eye, or punch a hole in one, because an eye is not
  magenta;
- a failure looks like **magenta left on screen**, which is the loudest thing
  in the world to miss.

**Magenta (255, 0, 255), not green.** Green is one prompt away from a leaf, a
bamboo cane or a jade orb; nothing in this game's palette is within 90 units of
magenta, and `world-check` asserts that against the real palette file.

The route for any new sheet:

1. Prompt for the art **on a flat magenta (255, 0, 255) background**, and say
   so explicitly — "solid magenta #FF00FF background, no gradient, no shadow on
   the background".
2. Drop the master in `docs/art-masters/`.
3. Add it to `WORK` in `tools/sprite-bake.mjs` as `{ chroma: true }` and run
   `node tools/sprite-bake.mjs --proof`. The bake **hard-fails** if the key
   clears less than 5% of the sheet, which is what a master accidentally
   generated on white looks like.
4. The baked file lands in `public/sprites/` already keyed, so `alreadyKeyed`
   leaves it alone at runtime and none of the white-background machinery ever
   touches it.

No flood and no pocket pass run on a chroma master — running either afterwards
would put back exactly the guessing this route exists to avoid.

**This is for new art only.** The 42 sheets already in the game were generated
on white; regenerating one is a paid call that changes a drawing the kids have
already seen.

### When a sheet arrives with its eyes punched out

Reported from play: *"the `mantis.png` seems to have transparency in its eyes
when it should be white. Also, it has white in-between its insect arms where it
should be transparent."*

Two different problems in one sentence, and only one of them is fixable here.

**The eyes are holes in the file.** Whatever removed the mantis's background
took them with it, and it has been that way on disk ever since — nothing in
this codebase did it. `fillSealedHoles` paints them back, and it is the exact
mirror of `clearSealedPockets`: same depth metric, same constant, asked from
the other side. A transparent region that the border cannot reach, and that
sits deeper than `POCKET_DEPTH_FRAC` from the outdoors, is a hole punched
through the drawing; white is a restoration rather than a guess, because the
hole exists precisely because some remover decided those pixels were
background, and background on these sheets is white.

Measured on the sheet, every enclosed transparent region with its depth:

    1,148 px   depth 15   the gap between its back legs     REALLY transparent
       57 px   depth 36   an eye                            PUNCHED THROUGH
       15 px   depth  7   a nick in the antenna line        REALLY transparent
        1 px   depth 2,8  three single-pixel specks         REALLY transparent

The bound lands at 19 px on a 768 sheet, so the eye clears it by a factor of
two and nothing else is close. **No second constant was invented for this**, and
that is the point: a gap between two legs is outdoors pinched shut by a
hairline, an eye is indoors behind a whole head, and that is one geometric fact
seen from two sides. A number tuned to one file is how the first pocket rule
came to eat Mr Satan's face.

**It stays opt-in, and the reason is measurable.** Run over every sheet in the
game, the fill would repaint eight of them — including 32,944 px of sky
enclosed by a dragon's own wing and tail, which is a genuinely sealed hole that
is genuinely background. Two rules, opposite directions, the same unanswerable
question, and the answer is a human naming the one file. `mantis.png` is the
only sheet in the game with `fillHoles: true`, and `world-check` pins that it
is the only one.

**The white between its arms is upstream damage and cannot be fixed here.**
There is nothing to tell that white apart from the white of a knee — it is 265
px in thirteen scattered regions, the biggest 173 px. The only real fix is
regenerating the sheet, on magenta, per the section above.

**One correction the alpha route did need**, and it had been wrong the whole
time: `keyOutBackground`'s soften pass was `Math.max` on the alpha it wrote. On
an OPAQUE sheet every pixel reaching it already has alpha 255, so the pass has
never been able to do anything but lower it and every existing sheet keys byte
for byte the same. On a sheet that already carries alpha it was RAISING soft
edges — a pale fringe painted on by the pass whose entire job is removing one.
It is `Math.min` now.

## Baking the key offline — `tools/sprite-bake.mjs`

Reported as *"dragon images in public/sprites have some white between the wings
where they should be transparent — why is it white instead of transparent?"*,
which is two questions. The **why** is the paragraph above: text-to-image
returns RGB, matting is a second call, so every sheet in this game arrived
opaque and has been keyed at load time ever since.

The **white between the wings** is the structural blind spot, and no runtime
rule can close it. `clearSealedPockets` clears white regions the border flood
cannot reach, and it is bounded by **depth** — about 2.5% of the sheet's short
side — because size and purity alone ate Mr Satan's teeth and eyes. Both
dragons had a pocket far past that bound:

    dragon_sheet   133,549 px between the neck ruff and the far wing, depth 145
    dragon_fly       2,731 px between the hind legs,                  depth  54

From the inside, those are the same shape as an eye: big, pure, deeply
enclosed. **The difference is not in the pixels — it is that a human can look
at these two and could not look at every sheet a future session generates.** So
the depth bound stays on at runtime, and the bake, which runs offline on named
files and writes a proof image over a magenta checker that somebody is meant to
open, turns it off per file. Do not add a file to `WORK` with `deep` without
opening its proof. (What survives on the dragons is the lightning bolt's own
white core, which is drawn.)

The tool also **resizes**, which is the bigger win and costs nothing — see
[hosting.md](hosting.md) and [mobile.md](mobile.md) for the numbers. Note the
trap it documents: baking alpha at full size makes the file *bigger* (4.6MB →
4.7MB), because `png.mjs` writes filter 0 on every row and a fourth channel is
a fourth channel. Almost all of the saving is the resize.

**The masters live in `docs/art-masters/`, not in `public/`.** Vite copies
`public/` wholesale into `dist`, so a file in there is downloaded by every
player whether any code asks for it or not — the same mechanism as
`docs/unused-art/`, and the reason `.vercelignore` is not the answer. Anything
that measures coordinates on a master reads from there: `steam-art.mjs` does,
because every crop it makes was measured on `title_art.png` at full size.

**A new player pose is FOUR kittens, always.** There are two drawn sheets and
four playable cats: Storm is `recolourAtlas` of Ember's, Blossom of Frost's.
Every per-pose sheet therefore comes in a pair — `ember_eat`/`frost_eat`,
`ember_bless`/`frost_bless`, `ember_scared`/`frost_scared` (the first pair
generated with real alpha) — and the pair is expanded in `Game._loadArt` by a
loop over **`PLAYER_STYLE`, not over the roster slots**. Deriving by slot is one
copy-paste away and gives you Storm eating as a grey Frost. Never generate a
pose for Ember alone.

**Check that every row turns the same way before you use a sheet.** Image
models don't guarantee it — `frost_grid_v2.png` came back with its jump and
attack rows mirrored against its idle and walk rows, which no single setting
can correct, and it's kept out of the game for that reason. The quickest test:
column N should be the same direction in all four rows, and one column should
be a plain back view in all four.

**A second pose for a character is matched on INK AREA, not on height.** Mr
Satan has two drawings now — standing, and arms-up charging his blast — and the
one that swaps between them is `poseQuad(size, calm, pose)` in `critter.js`,
which normalises on how much of the sheet is actually drawn on. `contentScale`
is height-normalised and is the wrong yardstick the moment one creature has two
drawings: a pose that reaches higher is *drawn* smaller by the model, and
matching on height alone makes him jump size at the swap.

**Which is why his charging sprite has no aura.** It was generated with a golden
flame corona first, and the corona was several times the cat's own ink — so
`poseQuad` would have shrunk him to fit it, and he would have visibly *lost*
size on the frame he powered up. The glow is procedural instead
([systems/satanblast.js](../../src/systems/satanblast.js)), which is where it
belonged anyway: the ball has to grow, pulse and leave, and a painted one cannot.

The general rule: **generate the pose with the same silhouette budget as the
one it swaps against.** Anything a pose adds that the base drawing does not have
— an aura, a weapon trail, wings — is a thing the matcher will pay for out of
the character's own size.

## The hospital cats — ten views, and they are not even

`public/sprites/hospital/cat.png`, baked from `docs/art-masters/hospital_cat.png`
(Higgsfield, on magenta, `chroma: true` in `sprite-bake`'s WORK). The sheet is
10 columns (views round the turn) by 2 rows (stand, walk). The cat wears a
nurse's cap and holds its arms down, so a pair reads as carrying a stretcher.

**The views are not 36° apart.** Measured off the drawings, by where the eyes
sit on the head: the right profile is column 3 and the left is column 7, and the
back is 5. An even grid drew the bearers three-quarter at exactly the angle a
stretcher is carried past a lens. `CAT_VIEWS` in `systems/arenaexit.js` is the
measured angle of each column: 0, 28, 55, 90, 135, 180, 225, 270, 310, 345.
`_faceBearer` picks the nearest one, instead of `Billboard`'s even grid. The
eyes were the measure: 0.00, 0.10, 0.14, 0.24 of a head off centre across
columns 0–3, none at all on 4–6, and −0.21, −0.11, 0.00 across 7–9.

## The big screen's art — champion poses and Mr. Satan's flexes

Six masters in `docs/art-masters/`, all Higgsfield `gpt_image_2_5` on flat
magenta, baked by `sprite-bake` with `chroma: true` to 640x640. The board's
canvas is 1280x720, so a pose is never drawn bigger than about 600.

- `ember_champion.png`, `frost_champion.png` → `kittens/<sheet>/champion.png`.
  One per SHEET: Storm and Blossom are these through their style's `recolour`
  at runtime, like their walk sheets. Each was prompted with that kitten's
  `bless.png` as the image reference, so they are on-model.
- `satan_flex_zyzz/biceps/trophy/kiss.png` → `satan/flex_*.png`. Prompted
  with his own `satan.png` as the ONLY image reference. Richard sent photos of a
  real bodybuilder for the pose; those were described in words and never
  uploaded anywhere.

**The face crop for the honourable mentions is measured**:
`CHAMP_ART[sheet].face` in `systems/arenaboard.js`, `[x, y, size]` on the 640
file. Ember is `[190, 8, 276]` and Frost `[164, 38, 290]`. Both poses have a
fist raised above the head, so the top of the ink is a paw, and a crop taken
from there would have framed the paw, not the face. Found by cropping the
proof and looking, twice. world-check asserts the box is mostly ink and its
muzzle entirely.

**Two of them have sealed holes** (Frost's paw on her hip, the trophy's
handles), which is why `fillSealedHoles` over every sheet now touches ten
rather than eight. It never runs on them: the board draws them straight onto
its canvas and they never pass through `loadSpriteAtlas`.

## Payne — five masters, and why there are two of her

All Higgsfield `gpt_image_2_5` on flat magenta, with **her own photos as image
references** (a real person; see [payne.md](payne.md)). They are baked by
`sprite-bake` with `chroma: true`.

| master | ships as | size | what it is |
| --- | --- | --- | --- |
| `payne_town.png` | `payne/town.png` | 768 | **In town:** wearing the Gundam helmet. Generated *wearing* it, because the separate helmet layer did not sit well on her head ("it seems to not fit well on her head, we may want to generate a photo with her wearing it") |
| `payne_held.png` | `payne/held.png` | 768 | **After the Awakening:** her face, the helmet under one arm. There was a second take with both hands on the helmet; it was kept outside the repo in case Richard prefers it |
| `payne_base.png` | `payne/base.png` | 768 | her whole body, no helmet. Nothing draws it yet. Richard asked for it so she can be made playable or an opponent later |
| `payne_helmet.png` | `payne/helmet.png` | 512 | the helmet alone, as a separate layer, for the same reason |
| `payne_sweep.png` | `payne/sweep.png` | 640 | the Goblin Sweep, drawn on her trick card |

**The portrait crops are measured**, as `[x, y, size]` in `PAYNE_ART`: the
town pose at `[258, 6, 230]` (the helmet) and the held pose at `[283, 14, 210]`
(her face). The hint card uses one or the other depending on
`kotodama.awakened`, so her face stays hidden until the ending, in the card as
well as in the world.

**Three of them have sealed holes** (an arm against her body), which is why
the fill-everything count in world-check is thirteen. None is ever filled:
she is a billboard off `_loadSprite` and a crop on a canvas, and neither asks
for `fillHoles`.

## The Goblin Sweep pose, and the Riposte stance

Higgsfield `gpt_image_2_5` on flat magenta, one per sheet, each prompted with
that kitten's own `bless.png` as the only reference. Storm and Blossom are
recoloured by `Game` like every other single pose. Payne's sweep was
described in words and never used as a reference; her likeness is hers.

- `ember_sweep.png` / `frost_sweep.png` → `kittens/<sheet>/sweep.png`, 768.
  She wears it while `sweepT` runs (0.34 s) and not a frame longer, since she
  is free to move the frame it ends. The spin is the quad's width following
  the cosine of the turn. It is floored at a third so it never goes edge-on
  to nothing, because this material alpha-tests. world-check measures four
  flips per sweep.
- `ember_riposte.png` / `frost_riposte.png` are the counter stance, katana
  across the body with a glint, `kittens/<sheet>/riposte.png` at 768. They
  belong to the Riposte orb (`feature/rare-orbs-reach-parry`, merged)
  ([endgame.md](endgame.md) has when she wears it). **This is the one single
  pose that MIRRORS**: the blade sticks out to one side, and which side she is
  guarding is the move. So its Billboard is `mirror: true` and
  `artFacesRight: true`. The facing is measured off the baked sheets by
  world-check: in the top 35% of the rows the blade reaches 0.45 (Ember) and
  0.44 (Frost) of the width right of centre, against 0.22 and 0.26 to the left. Frost's
  closes a sealed pocket (both paws on the hilt against her robe). It is
  recorded in the fill inventory and not filled.

## Custom Housing — Roshi, kendo and the pen

Higgsfield `gpt_image_2_5` on flat magenta, baked `chroma: true` like the
rest. The kittens' were each prompted with their own `bless.png`; Roshi and
the animals were described in words. [housing.md](housing.md) says what each
replaced.

- `roshi.png` → `roshi/roshi.png`, 768. One pose, facing camera, so it does
  not mirror. His height and foot are read off the baked sheet as constants
  in `roshi.js` (ink rows 14–752 of 768).
- `ember_kendo.png` / `frost_kendo.png` → `kittens/<sheet>/kendo.png`,
  `ember_kiai.png` / `frost_kiai.png` → `kiai.png`, and `ember_kparry.png` /
  `frost_kparry.png` → `kparry.png` (返 in the bogu), all 768. Bogu with the men
  hiding the face, and a shinai. **These MIRROR**, like the Riposte stance
  and for the same reason. world-check measures the shinai reaching right:
  0.254 / 0.199 for the guards, 0.092 / 0.095 for the riposte guards and
  0.116 for Frost's kiai. **Oct 2026, Richard**: "Ember's 'kiai' art becomes
  the riposte stance. Generate a new attack sprite for Ember based on Frost's
  'kiai' art. Frost gets Ember's 'kiai' art for her riposte." So
  `ember_kparry` IS the first Ember kiai master, kept; the new `ember_kiai`
  and `frost_kparry` were each prompted with both old kiai drawings as
  references (gpt_image_2_5, 0.25 credits each). Ember's new kiai is a
  wind-up with the blade pointing BACK, so its reach measures -0.044 — the
  drawing, not a mirror — and it is asked where its tail is instead (0.160 of
  the width further left than right in the middle band). Ember's kiai and her
  kparry close a sealed pocket; Frost's kparry does not.
- `<sheet>_kbroke.png` → `kbroke.png`, the guard knocked aside (shinai
  trailing in one paw, the other flung out), and `<sheet>_kclinchR.png` /
  `<sheet>_kclinchL.png` → the clinch, shinai crossed high, ONE DRAWING FOR
  EACH SIDE OF THE CROSS. Richard, Oct 2026: "generate a clench sprite ...
  two per character, one from each side of the crisscross." gpt_image_2_5 on
  magenta off each sheet's `kendo` master, 6 × 0.25 = 1.5 credits. **Named
  by what they show, not what was asked**: two of the four clinches came back
  facing the other way from their prompt. R faces right, L faces LEFT and is
  the only kendo drawing built `artFacesRight: false`. Measured reach: R
  +0.285 / +0.271, L −0.194 / −0.203; kbroke's top band reaches +0.052 /
  +0.087 (the flung paw — the shinai is below the band). Ember's kclinchR
  closes a pocket.
- `chick.png` `bunny.png` `goat.png` → `farm/<id>.png`, 512, side-on facing
  LEFT. Measured by where the head is rather than a reach, since an animal
  has no blade. The chick and the goat close pockets.

`sprite-bake` now makes a job's output folder when it is new (`roshi/` and
`farm/` were the first). Before that it threw ENOENT.

## The simulator's drawings — headset turnarounds and the Shadow

These are three Higgsfield `gpt_image_2_5` masters on flat magenta. Each was
prompted off the sheet it has to match: the kittens off their own `grid`, and
the Shadow off `lionheart_town.png`. The reasons are in the comments on their
`sprite-bake` rows.

| master | ships as | grid | worn |
| --- | --- | --- | --- |
| `ember_vr.png` | `kittens/ember/vr.png`, 2048×1189 | 10 × 4 | in the sim, by Ember and (recoloured) Storm |
| `frost_vr.png` | `kittens/frost/vr.png`, 2048×1189 | 8 × 4 | in the sim, by Frost and (recoloured) Blossom |
| `lionheart_shadow.png` | `lionheart/shadow.png`, 1925×768 | 4 × 1 | Shadow Lionheart: guard, slam, sweep, cross |

- **The attack rows are spliced in.** In the first generation they did not turn.
  Ember's row had no right-facing cell, and Frost's had a face where the back
  three-quarter goes. Each row was regenerated as one strip. It was scaled by
  crown-to-foot against the idle row (Ember 0.88, Frost 0.77) and **placed
  figure by figure on the column centres measured from rows 0–2**. A row merely
  centred under the others gets sliced through its figures, because the loader
  cuts every row with the majority grid.
- **world-check proves each row turns.** It finds the visor (the cyan run nearest
  the head) in every cell, and the sign of its offset must follow a full turn:
  front, then right, back, left. The rejected attack row fails this rule at
  −0.20. Frost's attack row is excused from the "clearly right" clause only,
  because her cyan blade sits beside her visor.
- **The Shadow loads with `views` 4.** `auto` reads it as 2. The master's fourth
  pose was moved 200px right by connected component, because the sweep's blade
  tip overlapped the X. **`Billboard.faceCamera` would pick a cell from his
  facing**, so `ShadowBoss` overwrites it with `poseCell(act)` every frame. He
  is tinted lighter (`0xc8a8ff`) than the town fallback (`0x7a3cff`), and the
  glowing blade mesh is hidden: the sheet has HONOR in his hands already.
- **All three load lazily**, once, on the first walk into a tube
  (`Game.loadSimArt`). A missing file falls back to the home sheet or the tinted
  town Lionheart. Frost's sheet and the Shadow have sealed holes, so the
  fill-everything count in world-check is now sixteen. Neither is ever filled.

## The six special poses in the headset

Richard: "we should generate the sprite for their other abilities, so that if
they do them while in the simulation, it will show them do it in the main world
as well while in the tube." There are twelve masters
(`docs/art-masters/{ember,frost}_vr_{eat,bless,warp,inhale,scared,sweep}.png`,
1024², `gpt_image_2_5` on magenta), baked to `kittens/<sheet>/vr_<pose>.png` at
768. Storm and Blossom are these recoloured by `Game`, like every pose.

- **Two references per prompt.** The first is that kitten's own home pose, so
  the pose, framing and scale are the same drawing. The second is the front
  idle cell of her `vr` sheet, so the headset and trim match.
- **Loaded exactly as the home poses are** (`Game._loadSimPoses`, one cell
  each). `Player.setSimLook` gives each pose billboard a second look sized by
  the same rule as its home one. A pose with no VR drawing keeps her home one:
  it degrades, it never vanishes.
- **world-check measures each against its home pose**, for warp, inhale, scared
  and sweep: crown-to-foot within ±5% and foot line within ±16px (measured
  at generation: 1.00–1.02, feet within 8px). Eat and bless are not measured.
  Their home poses are on the old white route, whose alpha is the whole frame
  until the loader keys it, so the file has nothing to read.
- **Seven of the twelve close a hole** (an arm against the body, a paw against
  the face), as their home poses mostly already did. So the fill-everything
  count is now twenty-three (twenty-four with Frost's Riposte stance, merged
  after). Nothing fills them, because `_loadSimPoses` does not ask for it.
- **A seventh, 返 Riposte** (`vr_riposte`). Richard: "Need to generate VR
  sprites for the Riposte ability for the players and use that in the
  simulation." It was made the same way: her home Riposte stance and her `vr`
  front cell as the two references, plus one more sentence in the prompt to
  keep the katana held across her body where it is. world-check measures it
  against the home stance like the others (ten measured now). It also checks
  that its blade sticks out to the RIGHT (ember 0.22/0.45, frost 0.26/0.44),
  because the billboard mirrors on `artFacesRight`. Frost's closes a pocket,
  so the fill count is twenty-five, and the kitten-pose count is fifteen.

## An animation cut from a video — the tea ceremony, Oct 2026

Richard: "a new animated sprite sheet that shows the player drinking the tea
... 24 or more sprites, 32 would be good. Get creative, show me what can be
done with animated sprites." An image model cannot draw 32 frames of one cat
that agree with each other; a video model can, because they are one
performance.

- **The take.** Each kitten's PRAYER master (already her seiza, side-on) went
  to Higgsfield `grok_video` as the start frame: 9 credits, 6 seconds, flat
  magenta, locked-off camera. The mp4s are kept in
  `docs/art-masters/video/` (not shipped) — they are the real masters.
- **The cut** (`tools/capture/tea-sheet.mjs`). 32 of 145 frames, picked BY
  HAND per kitten off a contact sheet (the two takes keep different time) into
  the five segments `TEA_SHEET.seg` names. Ember's 22–32 are skipped: the bowl
  fades in out of nothing there, and the game covers it with the 3D bowl
  arriving at her knees.
- **One crop for all 32.** The union of her ink over every pick, squared, feet
  on the bottom. The loader is told `uniform: true` and takes each cell WHOLE
  (`uniformBoxes`); its usual per-cell centring on the ink would slide her
  sideways every time she leans for the bowl.
- **Sized off the prayer**, since frame 0 IS that drawing animated: the
  billboard's quad is the prayer's ink height over the cell's ink fraction
  (`TEA_INK`, 0.973, measured). The cut between the two does not change her.
- **Played by `Billboard`'s `anim` mode**, which picks the cell from `frame`
  and mirrors on facing like any one-cell pose. 512 a cell in the master, 192
  shipped (1536×768, ~1MB each): at 256 they were 1.6MB, over world-check's
  1.5MB first-load line, for a kitten ~150px tall on screen. Storm and
  Blossom are recoloured.

## Payne's introduction — six takes, 243 cells, Oct 2026

Richard: make it the tea ceremony's way, "at least 3 or 4x's higher quality ...
as that looked low resolution". The tea ceremony ships 192px a cell. These
ship at **760px to a unit of her standing height**, with a **380** set for the
cautious tier.

- **Six Kling 3.0 takes**, 960×960 at 24fps, on flat magenta, locked off. The
  first three cost about 50 credits; the second pass's four cost 35 (8.75 a
  take), and one of the first three was then dropped:
  - MASK starts from her approved `held` drawing and puts the helmet ON.
    **The unmask is MASK played backwards**, so her face is always the
    approved one.
  - TALK starts from `held` too: unmasked, pointing, counting, waving,
    laughing.
  - HALT and SHRUG start from her masked `town` drawing: "Halt, traveller!",
    the laugh and the beckon; then "Stuck?" and the salute.
  - POINT and WAG start from `held`: the "Ta-daa!", the point at the sky, the
    peace sign and the thumb at herself.
  - **MASKED (`payne_masked_289ff712.mp4`) is not used.** It started from
    MASK's last frame, and Kling drew her face through the helmet's visor
    ("it shows her with the helmet on but you can see her face"). HALT and
    SHRUG replace it, and they start from the masked DRAWING, not from a frame
    of another video.
  - **POINT was prompted with headroom**: the first point at the sky had her
    fingertip off the top of the frame, so the new take was asked for zoomed
    out, and the cut keeps all of the hand (world-check asks that the stage
    is as tall as the pointing cells, 1.33 of her height).

  The masters are in `docs/art-masters/video/` and never ship.
- **The cut** (`tools/capture/payne-sheet.mjs`) reads `INTRO_CLIPS` in
  `src/systems/payneclips.js`, the same table the game plays from: sixteen
  clips at every third frame, eight a second, "on threes". **No clip loops or
  pingpongs** (Richard: "it looks strange"); each plays once and holds.
- **One scale per take, one crop per clip.** Each take's first frame is the
  approved drawing it started from, so its ink height is one unit of her
  height and its feet are the origin. Every clip is then cropped to its own
  ink in those units and written to `src/systems/payneframes.js`. The first
  cut used one crop for the union of every frame of every take, which was
  right for three takes of her standing; with a hand above her head and an arm
  flung out, the union was mostly air, and every cell paid for it.
- **It has its own key, not `chromaKey`**, because of two problems:
  - A video's edges are blends. A black line half over magenta is about
    (110,10,105), which the distance key calls paint, so every outline came
    out with a purple rim.
  - Kling drew a darker-magenta ground shadow under her in the masked takes.

  How the key works:
  - It measures `min(r,b) - g`: how much magenta is in the pixel.
  - Across the ramp from paint to background, it un-mixes the frame's own
    background colour out of the pixel.
  - It clears anything magenta in the bottom 9% of the frame (her sneakers are
    black and white).
  - It adds a penalty when blue is more than 12 above red, because her belt is
    violet (100,37,134) and the first cut turned it blue. The penalty is
    one-sided: an olive sleeve's edge has red over blue, and the two-sided
    version left those edges a pink fringe.
- **WebP pages with alpha**, up to 4 cells across and no page past 4096px:
  19 pages a set, about 16MB full size and 6MB half size for all 243 cells.
  - The cleared pixels are black underneath, because yuv420 bleeds that colour
    a pixel into her edge, and her edge is a black line.
  - Pages are fetched when the scene starts and released when it ends.
- **They are played by `PayneActor`** into one small STAGE canvas, the
  texture of a quad standing on her market spot (payne.md, *She stands in the
  world*). The cell size is measured off each page. A change of clip is a
  0.22s crossfade, since two takes never meet on the same pose, unless it is
  one performance carried on within 6 source frames of the same take (the halt
  into its laugh), which cuts straight.

## Bamboo Infiltration's ninjas — every action, one atlas, Oct 2026

Richard asked for sprite sheets and atlasing "to the fullest". The scheme is
4 directions with more frames for the NPCs, 8 directions where it makes
sense for the player, and 4 directions for longer animations. It became:

- **Guards** (samurai, archer): 4 directions × 6 frames per action.
- **Kittens**: the crawl in 8 directions × 4 frames. The rope, ladder,
  throw and hands-up are 4 directions × 6 frames. Ember's and Frost's sheets
  only; Storm and Blossom are the usual recolour (`PLAYER_STYLE`).
- **One `gpt_image_2_5` sheet per action**, on magenta, at 2k medium. That
  cost **1 credit a sheet**, not the 0.25 that was quoted, for about 25
  sheets. One action per page is what the model holds to a grid; a page of
  six actions was not.
- **`tools/ninja-atlas.mjs` measures and packs.** It keys the magenta,
  takes the `rows × cols` largest blobs as the figures, and refuses a sheet
  that does not come out as the grid it asked for. It hands stray ink
  (shuriken, sweat drops) to the nearest figure and scales by **ink area**,
  not height, so a crawl is not drawn half again as long as a stand. It
  writes one 2040-square atlas per character, plus `ninjaclips.js`. Check the
  proof in `out/bake/ninja_*.png` by eye: the row order is front, right,
  back, left, and for 8 directions clockwise from the front.
- **Nothing is mirrored at draw time.** A mirror swaps Ember's tail and the
  archer's bow hand. The single exception is baked into the atlas: the model
  drew the archer's left shooting row standing still twice, so that row is
  his right row mirrored, and the tool's header says so.
- **Facing is measured, not reasoned** (non-negotiable 8). `dirIndex` in
  `ninjasprite.js` is the function the sprite uses, and `world-check` asks it
  directly.
- **Size.** The four atlases total about 10MB (the archer alone is 3.9MB).
  They are lazy-loaded, so `world-check`'s 1.5MB grid limit exempts them.
  Quantizing them or moving to WebP is the follow-up.

## The sprite editor — `/sprites.html`, Oct 2026

Richard: "Since we have so much trouble with getting the correct scale of the
sprites, let's build a sprite adjustment editor so I can manually align the
sprites placement and scale and we can save that ... we will re-use this sprite
scale alignment tool later." Three passes of measured fractions in
`KENDO_POSE_H` had each been right by its own measure and wrong on screen.

**What it is.** `sprites.html` + `src/sprite-editor.js`, dev only (not a build
input; the save is `/__spritefix`, a `configureServer` hook). It saves
`src/spritefix.json`, read by `src/core/spritefix.js`:

- `poses["ember/kiai"] = { s, x, y }`. `s` multiplies the size the code already
  gives the pose (`KENDO_POSE_H`, `KENDO_CEREMONY_H`, the home sizes). `x` moves
  the pose FORWARD, the way the drawing points, so it follows the mirror. `y`
  moves it up. Both are in her heights. These are overrides only; the code's
  numbers stay the defaults.
- `sheets["kittens/ember/grid_v2"] = { order, flip }` re-deals a turnaround's
  columns (keyed by the file's path since the second pass, below). The values
  are 0-based in the file and 1-based on the page. Every row is treated the
  same.

**Keyed by sheet, not kitten.** Storm and Blossom are recolours, so they wear
Ember's and Frost's fixes. Building the editor exposed the same bug in
`KENDO_POSE_H`, which was keyed by name: Storm had been drawing every kendo pose
at the shared fractions, with a kiai two-thirds the size of Ember's. It now
looks the table up by the sheet's kitten.

**It draws with the game's code.** Every pose on the stage is the billboard a
real `Player` builds in `setKendoArt` / `setHomeArt` with the draft in force
(`setSpriteFix`). The turntable is a real Player wearing `applySheetFix`'s
output. The guides (front foot, body centre, ink top) are read off the
drawing's pixels, mapped through the quad the billboard is wearing that frame.
The snaps solve numerically (nudge, re-measure, step) instead of inverting
`footX`'s sign conventions, which differ for the clinch's left-facing drawing
and the home poses.

**The first values, set with it.** Each was snapped, then checked by eye:

- Ember seiza: body over the cross, `x -0.0055`.
- Ember riposte (`kparry`): front foot on the guard's front foot, `x 0.1756`.
- Frost riposte: front foot on the guard's, `x 0.1371`.
- Frost strike (`kiai`): front foot on the guard's, `x 0.1184`. That also put
  her torso over the shadow.

The scales are Richard's percentages from the same message.

**A trap it already sprang.** The snap first read B's position off the last
*rendered* frame. A hidden browser pane renders nothing, so a snap made right
after changing B's kitten aimed at the previous kitten's foot: Frost's riposte
went to Ember's foot, 0.778 against 0.638. Snaps now measure on the spot.

**Not applied: the grid_v2 column order in the request.** Richard's example was
`[1,2,4,7,6,5,8,9]`, dropping columns 3 and 10. Column 3 (0-based 2) is the
sheet's RIGHT profile, measured in gfx.js `faceCamera`'s tie-breaking comment;
dropping it leaves the most-used facing on a three-quarter view. The Sheets tab
previews it on the turntable, so that is his call to make, looking at it.
**He made it.** His saved `spritefix.json` carries exactly that order,
`[0,1,3,6,5,4,7,8]`, so the right profile is gone from the in-game turnaround and
a kitten walking right shows the nearest three-quarter view. It is his file and
stays as he saved it; the Sheets tab puts it back with *as drawn*.

### The second pass

Richard: "let's add more Sheets to it ... and any future sprite sheets that get
added to the game", plus undo, a history, unsaved marks, Lionheart, and every
kitten pose grouped by activity with a "Stand vs ..." each.

- **Sheets are keyed by path** under `public/sprites` (`kittens/ember/grid_v2`,
  `hospital/cat`), and a clip by `ninja/<id>:<clip>`. The dev server lists every
  png by reading its IHDR (`listSprites` in vite.config.js), so a new sheet is on
  the page the day it lands. `LEGACY_SHEET` still reads the two old keys
  (`ember/grid_v2`, `frost/grid`) and the page renames them on load; world-check
  fails if the shipped file still uses one.
- **The fix is applied where sheets load, not per caller.** `loadSpriteAtlas`
  applies `sheetFix(sheetIdOf(url))` itself, so a future sheet honours its saved
  order with no wiring. `main.js`'s `_loadSprite` opts out and applies it after
  its column-count checks, because those count the columns AS DRAWN.
- **Clips.** `ClipSprite` reads `ninja/<id>:<clip>`: `order` re-deals the
  frames, `flip` mirrors a step, and a one-shot ends after the frames it PLAYS.
- **Single-file poses** (eat, bless, warp, breath, scared, sweep, riposte) go
  through `Player._poseBoard`, which reads `poses[...]` like the kendo ones, and
  the simulator's `vr_*` poses take `s` and `y`.
- **`off`** switches cells off in the game. Today only the door mats read it
  (`enabledOf('housing/doormats', DOOR_MATS)`), and it can never empty a set: the
  last one on stays on. A mat already laid in a switched-off design draws the
  default instead; nothing is deleted from a save.
- **Flip takes IMAGE numbers.** Order lists images; flip used to list SLOTS, so
  "1,2,4,7" with flip "3" mirrored image 4. The page now takes the image number
  and stores the slot, with a tooltip on both fields.
- **"B in front" did nothing** because `renderOrder` was set on the Billboard's
  Object3D, which three.js does not sort by; it has to be on `bb.mesh`. It is now
  an "A on top / B on top" toggle, and world-check pins the mesh line.
- **The turntable button did work**, but only to stop the preview following the
  slot she was clicking, which is invisible. It is now one of five preview
  modes: turntable, loop, ping-pong, once, and hold N seconds on each.
- **Undo/redo** keeps the whole draft per step (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z),
  coalescing drags within 700 ms. The last changes are listed and clickable,
  each tab carries a count of what is unsaved, *revert* buttons are disabled
  when there is nothing to revert, Save says how many changes on which tab it
  writes, and switching tabs with changes on the one being left says that Save
  writes both.
- **Lionheart** is drawn off his own sheet at `EDITOR_LION_H`, and the page
  zooms out for him; world-check pins the editor's sizes to the game's.

### Third pass: one facing at a time, a clip's height, and a camera that moves

Richard, Oct 2026: "changing the order and flip values seems to be applying it
to all 'facing' animations in the clip, it should only apply it to each
individual facing animations"; "there is no way for me to edit the height of
the two clips, mount and rope"; "is there a way to tilt and pan the camera with
mouse or some keyboard commands?"

- **A clip's order is per FACING.** The Sheets tab now writes
  `ninja/ember:mount@2` (`clipKey`) for the facing picked. `sheetFix(id, n,
  fix, row)` tries that key first, then the bare `ninja/ember:mount`, so the
  file saved before keeps meaning what it meant for every facing that has none
  of its own. *As drawn* on a facing that would fall back writes an explicit
  1..n; deleting the key would bring the clip's order straight back. *This order
  for every facing* writes the bare key and removes the per-facing ones.
  `ClipSprite.faceCamera` picks the facing row FIRST, because the facing decides
  whose order counts the steps. The vite cleaner's `KEY` takes the `@n`, or the
  save would have silently dropped every one.
- **A clip takes `{ s, y }`** under `poses["ninja/ember:mount"]` (`clipPoseFix`),
  on the Poses tab like any pose: scale and height, never forward (it is drawn
  from four or eight sides). It is applied to the MESH in `ClipSprite._hang`,
  every draw: `y` in her heights, `s` about the origin. The origin is her feet
  for a standing clip and the rope for a hanging one, so a bigger rope clip still
  hangs from the rope. world-check measures the paw line staying on 0.
- **The view pans and tilts.** Right- or middle-drag pans (so does a left drag
  wherever there is nothing of hers to drag), Shift+right-drag or Shift+wheel
  tilts, `I J K L` pan, `T G` tilt, `R` resets. Pan slides the FRUSTUM. **There
  is no orbit, on purpose:** every billboard picks its drawing from the lens's
  bearing, so a lens moved round her would change which drawing is on show.
  Turning her is the facing button and the Sheets tab's turntable.

### Fourth pass: a flip names one slot, and a sheet's rows have their own order

Richard, Oct 2026, on `kittens/frost/vr`'s Jump row: "I want the ordering to be
1, 2, 3, 6, 5, 6, 7, 8 ... flip the first occurrence of 6 but not the 2nd ...
if we have "6, 6" for flip, then it would flip both".

- **Each image number in the flip box is ONE slot**: the first slot showing it
  that is not already mirrored (`flipSlots`). "6" mirrors the first 6, "6, 6"
  both, and a third 6 is reported rather than dropped. The box reads back with
  the repeats (`flipImages`), so Enter on an unchanged box changes nothing.
- **A minus SKIPS one.** Richard, on the attack row 1,4,3,6,5,6,7,4: "not flip
  the first occurrence of 4 but ... flip the 2nd ... mark the first occurrence
  as "-4" so it gets skipped". `-4` claims the next 4 and leaves it plain, so
  `-4, 4` mirrors the second 4 alone. Internally a skip is `~c` (image 0 has no
  `-0`). The read-back writes a skip for every plain slot before an image's last
  mirrored one, so any set of mirrored slots can be shown and re-entered; the
  old "Enter would move it" warning is gone with the case. The tooltip says it.
- **A sheet's rows each take their own order**, the way a clip's facings do:
  `kittens/frost/vr@2` is the jump row (`clipKey`), and the bare key stays every
  other row's. `gridFix(id, cols, rows)` gathers them and `applySheetFix` deals
  each row by its own. Before this, a turnaround's order re-dealt all four rows.
- **Every row must have as many slots** as the sheet's order (or its columns as
  drawn): the atlas is a grid. `gridFix` ignores a row that does not, and the
  editor refuses it with a status saying how many it needs. To change the count
  for the whole sheet, set it on one row and press *this order for every row*,
  which writes the bare key and removes every row's own.

**Trap: the hidden pane.** A hidden browser pane renders no rAF frames, so the
readout stayed `undefined` and an `img.decode()` never resolved. The page has
`spriteEditor.frame()` for a synchronous frame when it is being driven.
