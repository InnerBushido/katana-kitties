# Hosting on Vercel

*Design notes, moved verbatim out of the old 4,400-line `HANDOFF.md`. This is
the WHY behind code that already exists — read it when you are about to change
something in this area, not before. Current state and open work live in
[HANDOFF.md](../../HANDOFF.md); the always-on summary is [CLAUDE.md](../../CLAUDE.md).*

*Cross-references saying "above" or "below" may now point at a sibling file in
this folder — see [the index](README.md).*

---

## It's hosted — katana-kitties.vercel.app

**https://katana-kitties.vercel.app**, public, no login. Static Vite build, no
backend, no database, no environment variables — Vercel runs `npm run build`
and serves `dist`. Redeploy with one command from the project root:

```bash
vercel --prod
```

**It is on the `dream-dojo` TEAM scope, not the personal account.** `--yes`
accepted the CLI's stored default scope. Nothing is wrong with it there and the
alias is the one we wanted, but `vercel` commands about this project need
`--scope dream-dojo` if the CLI's default ever changes. `.vercel/project.json`
holds the link and is gitignored.

**19MB OF DEAD SPRITE SHEETS ARE OUT OF `public/`, AND WHERE THEY WENT IS THE
POINT.** `ember_grid.png`, `frost_grid_v2.png` and the two `kitten_*_sheet.png`
are referenced only from comments, but `public/` is copied wholesale into
`dist`, so every player was downloading all four. They now live in
`docs/unused-art/` with a README explaining what each one is.

The first fix was a `.vercelignore` entry, and it would have quietly stopped
working the moment this project was connected to GitHub: **`.vercelignore` only
applies to CLI uploads.** A Git deployment clones the repo, so nothing in that
file is consulted and the exclusion evaporates without an error — the site just
gets 19MB heavier and nobody looks. Moving the files out of `public/` works for
both deploy paths, because Vite only ever copies `public/` into `dist`. If you
ever need to keep a big file in the repo and out of the game, that is the
mechanism — location, not an ignore list.

**A first load is 35MB across 39 files**, which is the price of AI-generated
sprite sheets at full resolution: `frost_grid` 6.1MB, `title_art` 5.5MB,
`ember_grid_v2` 5.2MB, `dragon_sheet` 4.5MB, `dragon_fly` 3.8MB. It caches, so
it's slow once. The obvious win if that ever matters is recompressing the PNGs
— they are flat-colour lineart on transparency, which quantises extremely well
— but it touches the art, and `loadSpriteAtlas` measures cells by
connected-component labelling on the alpha channel, so anything that softens
edges risks changing how a sheet slices. Verify with `node tools/world-check.mjs`
(the sprite-direction section reads the real files) before trusting it.

**The controller map does NOT follow you from localhost.** It lives in
`localStorage`, which is keyed by origin, so the hosted game starts from
`DEFAULT_VJOY_MAP` however carefully the local copy was calibrated. Everything
else about the input path is unchanged: Joy2Win and vJoy are local processes
and the browser reads the pad whatever page is open, so the Chrome axis bug
travels too and it is still Firefox. Gamepad API needs a secure context in
Chrome, which HTTPS satisfies.


---

## Where the code lives

**GitHub: https://github.com/InnerBushido/katana-kitties** (private).

The repo-local git identity is pinned to `InnerBushido <Innerbushido@gmail.com>`
on purpose, so a change to the global config can't attribute commits here to a
work account.

**Pushing goes through the `gh` CLI's credential helper, not GCM.** A headless
`git push` fails with "cannot prompt", and `credential.guiPrompt=true` no longer
rescues it: the agent shell sets `GCM_INTERACTIVE=never` and
`GIT_TERMINAL_PROMPT=0`, so Git Credential Manager refuses to open its window at
all. `gh` holds its own token in the keyring and never needs to prompt, so the
repo-local config now points github.com at it:

```
credential.https://github.com.helper = !"C:/Program Files/GitHub CLI/gh.exe" auth git-credential
```

That is set with `--local`, deliberately — the global config is left alone. A
plain `git push` works from a headless shell now. Two things that will look like
this broke: `gh auth status` reporting logged out (re-run `gh auth login`), and
the quoting — the path has a space in it, so setting this key from PowerShell
mangles it into `git: 'Files/GitHub' is not a git command`. Set it from bash.

`docs/screenshots/` holds the six README images. They were captured by rendering
the game to a canvas and POSTing the JPEG to a throwaway local HTTP server —
browser downloads don't reach disk from the preview pane, and piping ~25KB of
base64 per image back through the agent is wasteful. If you need new ones, that
trick is the way; remember `player.group.position` only follows
`player.position` inside `update()`, so staged shots need an explicit sync or
the kittens render at their old spot.
