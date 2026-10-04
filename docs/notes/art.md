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
  across the body with a glint. **They belong to the Riposte orb on
  `feature/rare-orbs-reach-parry`** and are wired there, not here.

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
  count is now twenty-three. Nothing fills them, because `_loadSimPoses` does
  not ask for it.
