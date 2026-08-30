# Katana Kitties — the whole project on one page

**Last updated: 29 August 2026.** Anything below with a cost or an account
attached was true on that date; check the dashboard before quoting a number.

This is the **one-stop sheet**: what the project is, how to run it, how to test
it, how every asset in it was made and how to make another one, what it costs,
and where it is going. It is deliberately a reference card rather than an essay —
almost every line points somewhere deeper.

| audience | start here |
| --- | --- |
| **a person, wanting to understand the project** | this file, top to bottom — or the [published version](https://claude.ai/code/artifact/1b2c8ccd-c05d-488c-b080-e76dfb71f0ad), which is a link you can send somebody |
| a person, wanting to *play* | [README.md](README.md) |
| an AI agent starting a session | [CLAUDE.md](CLAUDE.md), then the one note it points at |
| anyone, wanting current state and open work | [HANDOFF.md](HANDOFF.md) |

**Keep this file current.** A new tool, a new document, a new account, a new
future idea — it gets a line here. That is the whole point of it, and
`world-check` enforces the register: every design note linked, every runnable
tool named, every check total agreeing with the one the script prints. **This
file is the version to edit** — the published page is generated from it, so
re-publish after a change rather than editing the page.

---

## 1. What it is

A **split-screen co-op browser game for up to four players**: samurai kittens
knocking over a chain of floating Japanese islands, riding storm dragons between
them, and eventually fighting each other in a tournament ring in the sky.
**three.js and nothing else at runtime** — no engine, no physics library, no
asset store, no character meshes. Everything is procedural or generated.

Made for, and partly by, Richard's nieces (9 and younger). The cat-head title
menu is a faithful redraw of one of their drawings; the six clan leaders came off
a page of her character designs. **Two of its features exist to teach sine and
cosine** — the Kotodama Orb draws its own working from the same two numbers that
position it, and the Dojo of the Turning Circle is a walkable unit circle. Those
are not decoration; see the non-negotiables in [CLAUDE.md](CLAUDE.md).

| | |
| --- | --- |
| **Play it** | **https://katana-kitties.vercel.app** — public, no login, nothing to install |
| **Code** | **https://github.com/InnerBushido/katana-kitties** — private |
| **Stack** | Vite 8 + three.js 0.185. Static build, no backend, no database, no env vars |
| **First load** | ~35MB across 39 files, then cached. Sprites 42MB in repo, help clips 21MB, voices 5.8MB |
| **Size** | ~216 props, 6 clans, 7 dragon balls, 8 Powerup Kotodama, 15 Help clips, 49 voice files |

---

## 2. Run it, check it

```bash
npm install
npm run dev        # http://localhost:5173 — then open it in FIREFOX
npm run build      # must stay clean; Vercel builds this on push to main
```

```bash
node tools/world-check.mjs    # 1884 checks: world, dragons, clans, sprites, tournament, consent, balance
node tools/pad-check.mjs      # 286 checks: controllers, keyboard sets, button prompts, the stuck-vJoy latch
```

**PLAY IT IN FIREFOX.** Chrome cannot read Joy-Con sticks through vJoy — the
buttons work and the axes report `0.00000` forever. Chrome's bug, unfixable from
here, and it affects the Joy2Win/vJoy route only. Every other pad is fine
anywhere. → [input.md](docs/notes/input.md)

**Run `world-check` after touching the world, dragons, clans, the tournament or
sprite directions.** It catches what still looks fine on screen: a grove that
generates zero canes, a clan buff that changes nothing, a sheet read in mirror
image, a trade that quietly destroys an orb. Almost none of its assertions are
about whether a number is *set* — they are about whether behaviour *changed*.

---

## 3. Test it

### On this machine

`npm run dev`, Firefox, `localhost:5173`. `.claude/launch.json` carries the
config an agent's preview pane uses.

### On a phone, over Wi-Fi — the local build

```bash
npm run dev -- --host
```

**The `--` is not decorative** — it is what makes npm hand the flag to Vite
instead of eating it. Vite then prints a second address:

```
➜  Network: http://192.168.1.14:5173/  Wi-Fi
```

**Type that into the phone.** Same Wi-Fi as the laptop, same SSID, not the guest
network, not mobile data. The IP changes when the router hands out a new lease,
so read it off the terminal each time. `.claude/launch.json` has this as
**`katana-kitties-lan`**.

Three things break it, all with the same symptom (a timeout and no error
anywhere): **no `--host`** (Vite binds `127.0.0.1` only), **Windows Firewall
blocking inbound Node** (verified allowed on this machine, on the Public
profile, which is what the house Wi-Fi is classified as), and **router client
isolation** (usually only on a guest network). Note that `--host` also exposes
`/tuning.html`, whose save endpoint writes a file into the source tree with no
authentication — fine at home, not fine in a café. Stop the server after.

On the phone: **landscape** (portrait is gated with a message), the on-screen
pad, and the debug panel — **five taps in the top-left corner** within 600ms,
because a phone has no `` ` `` key. → [mobile.md](docs/notes/mobile.md)

### On a phone — the hosted build

Just open the URL. Vercel deploys `main` on push.

### On a phone that is NOT on your Wi-Fi — push a branch

**Every branch pushed to GitHub gets its own Vercel deployment**, at a stable
alias that always points at that branch's tip:

```
https://katana-kitties-git-<branch>-dream-dojo.vercel.app
```

No laptop has to be awake, it is real HTTPS, and **it never takes the production
alias** — so the game the girls play is untouched by any amount of branch
pushing. **Preview URLs are public**: SSO protection was deliberately turned off
on 29 Aug 2026 so a branch build can be **installed to a phone's home screen and
played fullscreen**, which needs the manifest and the icons fetchable and not
merely the page. `vercel project protection` shows it and puts it back.
→ [hosting.md](docs/notes/hosting.md)

**Fullscreen on a phone IS "add to home screen"** — there is no fullscreen
button and no `requestFullscreen` anywhere in `src/`. It is
[public/manifest.webmanifest](public/manifest.webmanifest) doing it:
`"display": "fullscreen"`, `"orientation": "landscape"`. Each origin installs as
its own app with its own icon and its own `localStorage`, so a preview install
sits next to the real game and does **not** share the record board with it.

**Do not tunnel `npm run dev`** to solve this. Its balance-page save endpoint
POSTs a file into the source tree with no authentication, which behind a public
tunnel is an unauthenticated write into the repo from anywhere. Tunnel
`npm run preview` if you must — and note Vite refuses an unknown hostname until
`server.allowedHosts` names it.

### On a TV, or another PC

The Steam non-Steam shortcut plus **Steam Link** works today, one remote player.
**Remote Play Together — the four-friends one — is not available for non-Steam
shortcuts**, and that is Valve's limit, not the game's.
→ [steam.md](docs/notes/steam.md), [networking.md](docs/notes/networking.md)

---

## 4. Debug it, in play

Press **`` ` ``** to open the panel; it lists everything and **every row is
tappable**, so the whole debug set works on a phone.

| key | does |
| --- | --- |
| **`1`** | **frame cost** — fps, stutter, draw calls, buffer size, quality, dev-or-built, GPU string |
| `2` | Mr. Satan loses his temper (skips the ten-second fuse) |
| `3` | give every kitten all 8 kotodama |
| `4` | end the live round (feast) |
| `5` | open the trade / profile screen |
| `6` | **the endgame** — ending, arena, orbs, purses |
| `7` `8` `9` | Ryuuseki: take all seven stars & summon · seat both kittens · fire his beams |
| `M` `Z` | maths overlay · map zoom |
| `-` `=` `0` | scene viewer: previous · next · play this scene |

**If somebody says it lags, press `1` before changing anything.** The game is
**fill-bound** — frame time is a straight line in the size of the drawing buffer
and everything else is rounding.

- **Read the last line first.** Windows Firefox will happily render this on the
  integrated GPU with a discrete card idle in the machine. That is what "it
  lags" turned out to mean, and the readout now says `⚠ INTEGRATED GPU`.
- Then read **`js` vs `gap`**: small `js`, large `gap` is the GPU, not the code.
- **"Lag" is two different bugs.** *Slow* is a long median. *Stutter* is a normal
  median with frames arriving unevenly — the fps counter reads healthy the whole
  time it happens. Believe a player who says the frame rate is fine and the game
  still chugs; the `stutter` figure is what sees it.
- The maths overlay, the drifting petals and the tournament's critters have all
  been accused and all **measured innocent**. → [performance.md](docs/notes/performance.md)

---

## 5. Change the balance — without touching code

`npm run dev`, then open **`/tuning.html`**. Every ability's timings and damage,
a sentence each on what they do, a live timeline of the Cross Slash, and a save
that writes `src/tuning.json` and hot-reloads the running game.

**`src/tuning.json` holds overrides only.** `{}` is the shipped balance; the
literals in the code stay the defaults; `tune()` ignores anything that is not a
finite number on a key the defaults already have. **Neither the page nor the
save endpoint exists in a build** — the endpoint is a `configureServer` hook in
`vite.config.js`, which the production build never calls.
→ [endgame.md](docs/notes/endgame.md)

### The numbers, at a glance

Defaults from `src/entities/player.js`. Everything marked ✎ is on the page.

| | value | |
| --- | --- | --- |
| walk / sprint | **10.5** / **17** | units per second |
| jump / gravity | **11.2** / **26** | double-jump; 0.12s coyote time |
| fly / boost / lift | **34** / **62** / **20** | on a dragon |
| max HP ✎ | **100** | |
| hit stun / invulnerable ✎ | **0.26s** / **0.55s** | |
| KO / partner daze ✎ | **1.8s** / **1.5s** | friendly fire dazes *your partner*, costs *you* the swing |
| rage ✎ | **×1.6** at zero health | Smash's percent rule — knockback grows as she loses HP |
| strike height ✎ | **2.25** | how far above/below a blade reaches. Was 4.5 and read as "hits from nowhere" |
| base reach | **3.4** | every other reach is a multiple of this |
| **stand** ✎ | dmg 10 · knock 9 · lift 3.5 · reach 3.4 | a standing slash |
| **dash** ✎ | dmg 15 · knock 19 · lift 5.0 · reach 3.9 | slash while sprinting |
| **air** ✎ | dmg 14 · knock 13 · lift 7.5 · reach 3.7 | slash in the air |
| **tri / dive / charge** ✎ | the three power-orb moves | entries in the same table, so they cannot leak out of the ring |

**MISCHIEF is the spine**: 80% opens the tournament, 100% wakes the Powerup
Kotodama and gets the ending. **Nothing regrows and nothing is lost**, so the
counter is honest.

---

## 6. The controls, summarised

**Just pick up a controller.** Pads are dealt in connection order and always
outrank the keyboard. On the keyboard, **`Enter`** joins — both sets answer to
it, and `_findJoin` hands out the lowest set still free. **`Esc`, or Start on a
pad, is the way out of anything.**

| action | WASD | O K L ; / arrows | Xbox | PlayStation |
| --- | --- | --- | --- | --- |
| move | `W A S D` | arrows, or `O K L ;` | left stick | left stick |
| jump | `Space` | `Numpad0` `RAlt` `RCtrl` | **A** | **✕** |
| attack | `F` | `Numpad1` `/` `J` | **X** | **□** |
| interact | `E` | `Numpad2` `,` `I` | **B** | **○** |
| mount | `Q` | `Numpad3` `.` **`P`** | **Y** | **△** |
| sprint | `LShift` | `RShift` `'` | **RT** | **R2** |
| start / pause | `Enter` | `Enter` | START | OPTIONS |
| map · maths | — | — | RB · LB | R1 · L1 |

Every action in the second set has **three** keys because laptops have no
numpad, and player 2 once had her whole action set on it. `P` is mount and
**nothing else on the keyboard may answer to `P`** — `pad-check` asserts it, of
the whole debug set, because that collision flipped the frame readout every time
she climbed a dragon. → [input.md](docs/notes/input.md)

**On a phone**: an on-screen pad drawn by `core/touchpad.js`, producing *exactly*
what a gamepad profile's `read()` produces, so `InputManager` seats it next to a
Pro Controller and nothing downstream learns a new word. **Double-tap RUN or RIDE
to lock it on.** → [mobile.md](docs/notes/mobile.md)

---

## 7. How every asset was made — and how to make another

**Everything is generated. There is no asset store in this project.**

| what | how | run it |
| --- | --- | --- |
| **The 15 Help clips** | The game, playing itself, recorded. A script drives it, grabs one frame per tick off the WebGL back buffer, and `tools/gif.mjs` encodes. Nothing in the pipeline can invent a frame. | [tools/capture/README.md](tools/capture/README.md) — **the director's guide** |
| **GIF encoding** | `tools/gif.mjs`, dependency-free GIF89a: median-cut palette, interframe differencing. `dither: false` is required or the diff bites on nothing. `gif-selftest.mjs` reads its own output back. | `node tools/gif-selftest.mjs` |
| **Looping two clips together** | `tools/gif-sync.mjs` rewrites delay bytes only, no re-encode. It pads the **last frame**; it used to spread the difference across every frame, which stretched the clip. | `node tools/gif-sync.mjs` |
| **Sprite sheets** | Higgsfield image models. **Two rules**: a new player pose is *four* poses (all four kittens, never two), and everything goes through `remove_background` — do not trust the runtime white-keyer. | → [art.md](docs/notes/art.md) |
| **Voices** | ElevenLabs **preset** voices, reached through Higgsfield's `text2speech_v2` (`variant: 'elevenlabs'`, `voice_type: 'preset'`). ~0.15 credits a line. **Every character is pinned to one preset with an id** — read the registry before generating any line. | → [voices.md](docs/notes/voices.md) |
| **Sound & music** | Fully synthesised in `core/audio.js` — a sound set and a piece of music per island. `public/voice/*.mp3` are the only audio *files*, and the game falls back to synthesised blips without them. | → [audio.md](docs/notes/audio.md) |
| **The demon cackle** | `tools/kitten-cackle.mjs` — one meow at nine speeds. `--game` cuts bursts 1/4/6/9 into the Cross Slash's four graded purrs. **Carries a licensing decision**; see below. | `node tools/kitten-cackle.mjs --game` |
| **The 1:08 trailer** | Twelve five-second Higgsfield shots (`grok_video`) + an 8s title card, a synthesised orchestra over the game's own music, a drawn 十, and ffmpeg. 20MB, and **opt-in** — the `<video>` carries no `src` until a player asks. | `trailer-vo.mjs` (the narration), `trailer-score.mjs` (the orchestra), `trailer-cut.sh` (the edit) → [trailer.md](docs/notes/trailer.md) |
| **Casting a voice by measurement** | `tools/voice-measure.mjs` — pitch and range off a clip, which is how Ryuuseki is defined at all: his preset was never written down and five auditions did not find it. | `node tools/voice-measure.mjs` |
| **Brush kanji** | `tools/brush-kanji.mjs` — drawn, not typed, because ffmpeg's `drawtext` gives hairlines. | |
| **PNG, with no dependencies** | `tools/png.mjs` — the codec everything else encodes through, same rule as `gif.mjs`. | |
| **Steam shelf art & icons** | `tools/steam-art.mjs` crops and composites `public/sprites/title_art.png`. **Nothing here is a new drawing** — a prompt to an image model would put art on the box that is nowhere inside the game. | `node tools/steam-art.mjs` → `out/steam/` |
| **Steam store capsules** | `tools/steam-capsules.sh` | → [trailer.md](docs/notes/trailer.md) |
| **Clan leader portraits (Help)** | `tools/help-portraits.mjs` | |
| **README screenshots** | Rendered to a canvas and POSTed to a throwaway local HTTP server — browser downloads don't reach disk from a preview pane. | → [hosting.md](docs/notes/hosting.md) |

**Rules that apply to all of it:** measure, never reason, about anything drawn —
sizes, seat heights, mouth positions and facings are read off the loaded atlas,
and reasoned numbers have been wrong roughly every time. Sprite sheets are
**measured, not assumed**: column counts, cell sizes, baselines and facing all
come off the image, and a generated sheet's rows do not have to agree with each
other.

---

## 8. Accounts, services and costs

*Checked 29 August 2026. Verify anything financial in the dashboard.*

| service | what for | account | cost |
| --- | --- | --- | --- |
| **Vercel** | hosting `katana-kitties.vercel.app`. Git-connected: push to `main` deploys. Static build, no backend, no env vars. | **`dream-dojo` team scope**, not personal. `vercel --scope dream-dojo` if the CLI default moves. `.vercel/project.json` is gitignored. | Static hosting; no paid feature in use |
| **GitHub** | the private repo | `InnerBushido` — **pinned repo-locally** so a global config change cannot attribute commits here to a work account. Pushes go through the `gh` CLI credential helper (a headless `git push` fails without it). **`gh` may be signed in as a work account — run `gh auth status` before pushing.** | Free for private repos |
| **Higgsfield** | all generated art, video and voice | **No unlim allowance** — every generation spends credits, so `use_unlim` stays false unless asked for by name. `get_cost: true` preflights free. **Failed jobs are refunded.** `grok_video` is the reliable model (7.5 credits, ~5s); several others fail or rate-limit. | per-credit |
| **ElevenLabs** | the voice cast | **No separate account** — reached *through* Higgsfield. ~0.15 credits a line. | via Higgsfield |
| **Steam** | a non-Steam shortcut on Richard's own machine, for controller support and Steam Link | no Steamworks account | **$0** — a non-Steam shortcut is free. A real store page needs the Steam Direct fee (~$100 USD per title) and a review |

### Two things to know before shipping anything publicly

**The cackle is somebody else's recording.** `out/trailer/ref/cackle.wav` came
off a social post, has always been gitignored, and **must never leave the
machine**. Until recently the only thing derived from it in the repo was three
seconds inside the trailer MP4; now `public/voice/cross0–3.mp3` ship with the
game. **A Steam release has to either license the source or delete those four
files** — and deleting them is real and cheap, because `kitten-cackle.mjs` with
no reference synthesises its own ladder, and `Audio.play` falls through to
synthesised stand-ins after that. Three levels of degradation, on purpose.

**`out/` is a local-only repo with no remote, deliberately.** It holds generated
artwork and trailer working files, 9MB+ of PNG that Vite would never ship. The
*tools* are what is versioned, not their output.

---

## 9. The rules that must not break

Full text and the reasoning in [CLAUDE.md](CLAUDE.md); each is enforced by
`world-check` wherever a check can express it.

1. **The maths is the point, not a bolt-on.** A prettier orb that lied about its
   own position would be worse than no orb.
2. **The art is the kids'.** Don't redesign the cat-head menu or the six leaders.
3. **No combat outside the ring.** `Game.strikePlayers` is the only gate and it
   asks one question. Enemies in the world have been rejected repeatedly.
4. **Nothing regrows and nothing is lost.** A dragon can never be stranded, a pet
   can never be lost, and the MISCHIEF counter stays honest.
5. **Two players must keep the game they know.** Everything four-player is
   additive; the two-player answer comes out bit-identical.
6. **A refusal must say so, and so must a confirmation.** Every dialog's buttons
   say what they DO — "no, keep playing" against "yes, start over".
7. **Nothing irreversible happens on one press, and the default answer is no.** A
   scene is skipped by **Escape or a pad's Start, and nothing else** — never
   Space: four kids hold sticks and mash. Confirm dialogs have no `.primary`, so
   the cursor opens on cancel.
8. **Sprite sheets are measured, not assumed.**
9. **Everything is procedural or generated.** No engine, no physics library, no
   asset store, no character meshes, no new dependencies.

**House style:** comments explain *why* and **name the thing that was tried and
failed** — this codebase's comments are its main defence against a fix being
undone by somebody who could not see the reason. **When you fix something, add
the check that would have caught it.** That is why `world-check` is 1884
assertions.

**Git:** typed branches (`feature/`, `bugfix/`, `mixed/`), a `commit-msg` hook
that stamps `[branch]` on non-main commits, merged locally, and **never pushed to
`origin/main` until Richard has played it**. Branches are kept until pushed, then
`git branch -d` (never `-D`).

---

## 10. Every document in the project

| file | what it is |
| --- | --- |
| [README.md](README.md) | **the player's guide.** How it plays, the story, the leaders, the tournament, the controllers |
| [CLAUDE.md](CLAUDE.md) | **loaded into every AI session.** Deliberately short: how to run it, what must not break, where to look |
| [HANDOFF.md](HANDOFF.md) | **current state and open work.** What is played-and-live, what is untested-by-players, what is next |
| **PROJECT.md** | this file — the one-stop sheet |
| [docs/notes/README.md](docs/notes/README.md) | the index to the design notes, with a "read it before you touch" column |
| [tools/capture/README.md](tools/capture/README.md) | **the director's guide** to filming the game to teach the game |

**The design notes** — *the WHY behind code that already exists.* Read one when
you are about to change that area, and not before.

| | |
| --- | --- |
| [four-players.md](docs/notes/four-players.md) | seating, the split screen, panes, leagues |
| [input.md](docs/notes/input.md) | controllers, the vJoy/Joy-Con route, the Chrome stick bug, keyboard sets |
| [help.md](docs/notes/help.md) | the Help panel and the rig that films it |
| [tournament.md](docs/notes/tournament.md) | the ring, rounds, attacks, ring-outs, the feast |
| [dragon-hunt.md](docs/notes/dragon-hunt.md) | the seven stars, the grottos, the spire, Ryuuseki |
| [endgame.md](docs/notes/endgame.md) | the 100% ending, the eight Kotodama, the economy, **the balance page** |
| [story.md](docs/notes/story.md) | the opening cutscene, the six leaders, the shrine scenes |
| [world.md](docs/notes/world.md) | the six clans and what each buff changes; the panda |
| [art.md](docs/notes/art.md) | atlas cells, and the two rules for generating new sprites |
| [mobile.md](docs/notes/mobile.md) | **the LAN test steps**, what a phone may spend, the on-screen pad |
| [performance.md](docs/notes/performance.md) | why frame time is a straight line in pixels, and what is measured *not* to be a cause |
| [audio.md](docs/notes/audio.md) | the synthesised sound set and a piece of music per island |
| [voices.md](docs/notes/voices.md) | **the voice registry** — which preset is which character, with ids |
| [consent.md](docs/notes/consent.md) | why nothing irreversible happens on one press |
| [rules.md](docs/notes/rules.md) | the gameplay invariants in full, with the measurements behind them |
| [gotchas.md](docs/notes/gotchas.md) | the traps that cost real time and are not obvious from the code |
| [hosting.md](docs/notes/hosting.md) | Vercel, the Git deploy, and what does and does not travel with it |
| [steam.md](docs/notes/steam.md) | the non-Steam shortcut, every launch flag, the shelf artwork |
| [trailer.md](docs/notes/trailer.md) | the 1:08 trailer, end to end |
| [networking.md](docs/notes/networking.md) | **the one plan in the folder, not a record** — see below |

Plus `git log`: **the commit messages are the session log.**

---

## 11. Where it is going

### Decided, not built — playing across devices

[networking.md](docs/notes/networking.md) is the one document in the project that
describes code that does *not* exist. Also published as an artifact:
**[Four Ways to Play Apart](https://claude.ai/code/artifact/18bc9e73-7529-4b88-a28f-12dece97bc3b)**.

One question turned out to be four:

| | verdict |
| --- | --- |
| **Phone as a controller**, screen stays on the host | **Build this.** `touchpad.js` already produces exactly what a gamepad `read()` produces, so it is one more device class, not a new input path. WebRTC DataChannel, unreliable + unordered, ~5–15ms on the same Wi-Fi — under one frame. A QR code in the pause menu, a four-letter room code as backup. **1–2 sessions to a LAN prototype.** |
| **Stream the picture to the phone too** | **Don't.** The game is fill-bound: an extra full view plus a video encode lands on the one axis it is known to be limited by — and a private screen removes the thing that makes four kids sit on one sofa. |
| **Four friends over the internet** | Steam Remote Play Together does it with **zero netcode** — and is blocked by the *shortcut*, not the game. The cheapest route is publishing on Steam properly, which is a distribution decision, not an engineering one. |
| **Real networked multiplayer** | A project, not a feature. The obstacle is not the wire — it is that there is no seam between simulation and presentation. Host-authoritative with prediction is the realistic model; deterministic lockstep is the tempting wrong answer. |

**The ordering to insist on**: prototype the phone controller against a
dev-server signalling socket (a `configureServer` hook, exactly like the balance
page's save endpoint), so the expensive hosting decision is the **last** one
rather than the first.

### The backend that should come first anyway

**The game currently saves nothing between sessions** — only the record board,
the controller calibration and the stick setting survive a reload, all in
`localStorage`, and the Help panel apologises for it in a warning box. Accounts
and saved progress are a much easier project than netcode, independently useful,
and the half players would actually notice. `systems/leaderboard.js` already has
the shape; pointing it at a real table is a small change behind the same
interface. Then national boards (and the moderation question a public board with
kid-entered names always brings). **Then**, if it still looks worth it, netcode —
by which point there is an identity system to hang a session on.

### Tools and services that would be needed, and are not signed up for

Nothing on this list has an account yet. For signalling and shared state:
**Cloudflare Durable Objects**, **PartyKit**, or a small always-on box. For
accounts and progress: any hosted Postgres. For a Steam release: a **Steamworks**
account and the Steam Direct fee. All of these are deliberately deferred —
see the ordering above.

### Smaller things on the list

- The touch overlay's glyphs read `Y / ZR / X / A / B` on a screen where no such
  buttons exist. **Looked at and left alone on purpose** — `ZR` reads acceptably
  as a mobile RUN button. Recorded so it is not re-opened as a bug.
- Five Help clips (`ability-ward`, `ability-charge`, `ability-dive`,
  `ability-cross`, `feast-eat`) were filmed before the capture rig existed and
  have no shot script. The other ten can be re-cut today.
- A **director skill.** Asked whether one already exists that teaches an agent
  to direct in-game shots; **searched on 29 Aug 2026 and there is none** — not
  in the enabled set, not in the org or shared catalogues, nothing about
  in-engine cinematography, capture pacing or tutorial-clip authoring. So it
  would be a thing to write, and the material is already sitting in
  [tools/capture/README.md](tools/capture/README.md): a caption needs longer on
  screen than the action under it, a pause is *played* at a lower frame rate
  rather than frozen (a held frame reads as the picture having broken, and was
  reported exactly that way), one idea per beat, pin the camera and pin the
  *right* one, hand the shot back to the game where the game already directs,
  trigger off state rather than frame numbers, and film big to publish small.
  Plus the byte budget, which is the part nobody guesses: **frame CHANGE is the
  cost, not frame count.** Most of that is game-agnostic.
