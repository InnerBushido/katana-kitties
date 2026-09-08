# The full-resolution originals

Three files the game does **not** load. `public/sprites/` holds a smaller,
cleaner copy of each, built from these by:

```bash
node tools/sprite-bake.mjs --proof
```

They live here rather than in `public/sprites/` for the reason
[hosting.md](../notes/hosting.md) gives: **Vite copies `public/` wholesale into
`dist`, so anything sitting in there is downloaded by every player whether the
code asks for it or not** — and `.vercelignore` does not help, because it is
consulted for CLI uploads and silently ignored by a Git deployment. Location is
the mechanism, not an ignore list. `docs/unused-art/` is the same trick for the
sheets nothing loads at all; the difference is that **these three are used** —
just not in this form.

| master | what ships | why the shipped one is different |
| --- | --- | --- |
| `dragon_sheet.png` 2752x1536, 4.5MB | `dragon_sheet.png` 1376x768, 1.0MB | Alpha baked in, and resized to the point where it packs into the atlas at scale **1.000** instead of 0.698. |
| `dragon_fly.png` 2752x1536, 3.8MB | `dragon_fly.png` 1376x768, 0.6MB | Same. |
| `title_art.png` 2752x1536, 5.5MB | `title_art.webp` 2752x1536, 0.46MB | **Same size, same picture** — WebP q92. Nothing is keyed; it is full bleed. |

## Why the dragons needed baking and not just shrinking

The runtime keyer floods transparency in from the border, which cannot reach
background the lineart has sealed shut. `clearSealedPockets` handles those and
is bounded by **depth**, because a rule based on size and purity alone ate Mr.
Satan's teeth and eyes — the whole story is in
[`src/core/spritesheet.js`](../../src/core/spritesheet.js) and is worth reading
before touching any of it. Both dragons have a pocket far deeper than that
bound:

```
  dragon_sheet   133,549 px between the neck ruff and the far wing   depth 145
  dragon_fly       2,731 px between the hind legs                    depth  54
```

No runtime rule can clear those and still keep a grinning champion's face. What
the offline tool has and the loader does not is **a human who can look**, which
is what `--proof` is for: it writes `out/bake/*.png`, the same sprites over a
magenta checker. Open them. If a dragon has a hole in its eye, that is where you
will see it.

## Don't

- **Don't point a tool at the shipped copies.** `tools/steam-art.mjs` measures
  crops in this file's pixel coordinates (`BANNER`, `SIGN`, `CLAW`) and
  re-derives them on every run; `tools/trailer-cut.sh` cuts the title card at
  full resolution. Both read from here.
- **Don't move anything back into `public/sprites/`.**
- **Don't re-bake from `public/sprites/`.** A bake is one-way: it throws away
  three quarters of the pixels and it is lossy for the painting. These are the
  only copies of the input.

## And for new art, this is now the wrong shape of problem

All of this exists because text-to-image returns an **opaque** picture. New
sheets should come back already cut out — run them through Higgsfield
`remove_background` before they ever reach `public/sprites/` — and then none of
the above applies to them. `tools/world-check.mjs` already tells the two
conventions apart by asking whether a sheet's own border is transparent.
