# Sprite sheets the game does not load

These four live here rather than in `public/sprites/` for one reason: **Vite
copies `public/` wholesale into `dist`, so anything sitting in there is
downloaded by every player whether the code asks for it or not.** They were
19MB of a 54MB first load, and nothing references them but comments.

They are kept rather than deleted because two of them are evidence.

| file | why it's out |
| --- | --- |
| `frost_grid_v2.png` | **Unusable, and worth looking at.** Its idle and walk rows turn one way; its jump and attack rows are drawn mirrored against them. No per-sheet `dirSense` can satisfy a sheet that contradicts itself — fixing the walk breaks the idle. This is the sheet the `dirSense` / `rowSense` split in `gfx.js` exists because of. Frost uses the older `frost_grid.png`. |
| `ember_grid.png` | Superseded by `ember_grid_v2.png` (10 directions, all four rows agreeing). |
| `kitten_ember_sheet.png` | First-generation art, superseded before the grid pipeline existed. |
| `kitten_frost_sheet.png` | Ditto. |

**Don't move anything back into `public/sprites/` unless the game loads it.**
If you want to compare a new sheet against `frost_grid_v2` to check for the
same contradiction, read it from here — the check in `README.md` is that column
N should be the same direction in all four rows, and one column should be a
plain back view in all four.
