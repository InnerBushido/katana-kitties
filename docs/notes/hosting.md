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

## Testing a branch from anywhere: push it, and Vercel builds a preview

**Every branch pushed to GitHub gets its own deployment, automatically.** Asked
for when Richard was away from home and wanted the unmerged work on his phone;
`alpha` was pushed and a **Preview** deployment was Ready inside a minute, at a
stable alias that does not move when the branch is pushed again:

```
https://katana-kitties-git-<branch>-dream-dojo.vercel.app
```

That is `<project>-git-<branch>-<scope>`, and it always points at the tip of
that branch. It is strictly better than any tunnel for this: no laptop has to be
awake, it is real HTTPS, and it is the same build path production uses.

**THE GIT CONNECTION IS EASY TO TALK YOURSELF OUT OF BELIEVING, AND IT COST
TIME.** `vercel ls` showed every deployment as `Production`, made by a *user*
rather than by `github`, which reads exactly like a project that is only ever
deployed by hand — and this session concluded, out loud and wrongly, that the
integration was not connected. It is. The list looked that way for the boring
reason that **`main` was the only branch that had ever existed on the remote**,
and CLI production deploys are how it gets released. The lesson is the same one
[help.md](help.md) records about a lost script: *the shape of the evidence is
not the evidence.* One push settled in sixty seconds what an hour of inference
had got backwards.

### Previews are behind Vercel SSO, and production is not

A preview URL answers **`302` to `vercel.com/sso-api`**, so a phone opening it
gets a login wall. Production answers `200` to anybody. That asymmetry is
Vercel's default Deployment Protection and it is a sensible one — an unreleased
build should not be a public link — but it is a surprise on a phone in a café.
Three ways through, in increasing order of how much they give away:

1. **Sign in to Vercel once on the device.** Nothing to change; the cookie
   sticks. Right answer when the tester is Richard.
2. **Turn Vercel Authentication off for Preview** in the project settings, which
   makes every branch URL public and shareable. Right answer only if a preview
   link is something you would be happy posting.
3. **A second project** (`katana-kitties-alpha`) deployed to *its own*
   production, which is public by default and leaves this project alone.

**Nothing here changes production.** A preview never takes the
`katana-kitties.vercel.app` alias, so the game the girls play is untouched by
any amount of branch pushing — which is the property that makes this the safe
way to test.

### SSO also breaks "add to home screen", which is the only fullscreen there is

**There is no fullscreen button in this game and there never was.** `grep` finds
no `requestFullscreen` anywhere in `src/`. The whole screen on a phone comes
from installing to the home screen and letting
[public/manifest.webmanifest](../../public/manifest.webmanifest) do it —
`"display": "fullscreen"` with a `standalone` fallback, and
`"orientation": "landscape"`. On an iPhone that is the *only* route, because
Safari there supports neither the Fullscreen API nor orientation lock; Android
honours both (see [mobile.md](mobile.md)).

**Which means protection costs more than a login prompt.** Measured on the
`alpha` preview against production:

| | production | preview |
| --- | --- | --- |
| `/` | `200` | `302` → `vercel.com/sso-api` |
| `/manifest.webmanifest` | `200 application/manifest+json` | `302 text/plain` |

A browser that cannot fetch the manifest cannot apply `display: fullscreen`, so
an install done before signing in produces **a plain bookmark with the URL bar
still there** — which looks like the manifest is broken and is not.

**The order of operations is the fix, on Android.** Sign in to Vercel in Chrome
*first*, hard-reload so the failed manifest fetch is not the cached one, and
install after that: Chrome shares its cookie jar with installed PWAs, so the
manifest request authenticates and the install is a real fullscreen one. iOS is
less reliable here — home-screen web apps have historically had their own cookie
store, so a standalone launch can land on a login page with no browser UI to log
in through. **If it is going on an iPhone, make the preview public instead.**

**An installed preview is a SEPARATE ORIGIN, and that is mostly a feature.** It
gets its own home-screen icon next to the live game, and its own
`localStorage` — so the record board, the controller calibration and the stick
setting do **not** carry across from the real game, exactly as they already do
not carry from `localhost`. Worth knowing before wondering where the scores
went.

## Why NOT to tunnel the dev server, and what to tunnel instead

`cloudflared tunnel --url http://localhost:5173` gives a public HTTPS address
with no account, and it is the obvious-looking answer to *"can I reach my laptop
from the internet"*. Two things make it the wrong one here.

**`npm run dev` exposes a write endpoint.** The balance page's save is a
`configureServer` hook that POSTs a file into the source tree **with no
authentication** — deliberately, because it was only ever meant to be reachable
from `localhost`. Behind a public tunnel that is an unauthenticated write into
the repo from anywhere on the internet. If you tunnel anything, tunnel
**`npm run preview`**: it serves the built `dist`, the hook does not exist in a
build, and there is nothing to POST to.

**Vite refuses a hostname it does not know**, answering *"Blocked request. This
host is not allowed"* — so a tunnel also needs `server.allowedHosts` in
`vite.config.js` before it will serve anything at all.

Both are surmountable, and neither is worth it when a branch push does the job
without the laptop being awake. **Tunnel only when you need HMR against a real
phone**; use a preview deployment for everything else.

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
