# Katana Kitties

**A split-screen co-op game about two samurai kittens causing trouble across a
chain of floating Japanese islands — and riding storm dragons between them.**

![Riding a storm dragon over the town](docs/screenshots/02-dragon.jpg)

Two players, one keyboard or two controllers. Run, double-jump, draw a katana,
knock over absolutely everything that isn't nailed down, then whistle up a
dragon and go and do it on the next island. It runs in a browser tab.

It was made for — and partly *by* — my nieces. The cat-head menu on the title
screen is a faithful reproduction of a drawing one of them made, buttons and
all, and the name was hers too. **The six clan leaders came off a page of her
character designs** — eight cats, each labelled with its breed. The rest grew
out of the things they like: *Warriors*, *Storm Dragons*, Minecraft, Wobbly
Life and Untitled Goose Game.

There's a second reason it exists. I'd been teaching one of them sine, cosine
and the unit circle on graph paper, and this is that lesson made walkable —
see [Teaching the maths](#teaching-the-maths).

## A look around

| | |
|---|---|
| ![The town](docs/screenshots/01-town.jpg) **The town** — a road, a market, a red bridge and 40-odd knockable props | ![A clan shrine](docs/screenshots/03-shrine.jpg) **A clan shrine** — find the beam, stand in the ring, get a power |
| ![The bamboo grove](docs/screenshots/05-bamboo.jpg) **The bamboo grove** — the one thing no dragon can burn, and what a panda eats | ![The snow island](docs/screenshots/06-snow.jpg) **The snow island** — icicles to smash and a frost dragon to ride |

![The Dojo of the Turning Circle](docs/screenshots/04-dojo.jpg)

*The Dojo of the Turning Circle: a whole island that is a walkable unit circle.
Stand on it and you become the point — the game reads your angle and draws sine,
cosine, the radius and your coordinates, live, from the same numbers that are
moving you.*

## Play it

**It's online: [katana-kitties.vercel.app](https://katana-kitties.vercel.app)** —
nothing to install, just open it. **Use Firefox if you're playing with
Joy-Cons**, same as locally; see
[Switch 2 controllers](#switch-2-controllers--use-firefox) for why.

The first load pulls about 35MB of sprite sheets and voice lines and then sits
in the browser cache, so it's slow once and instant afterwards.

To run it locally instead:

```bash
npm install
npm run dev
```

Then open the address it prints.

---

## Controls

|                  | Player 1 (Ember) | Player 2 (Frost) | Gamepad      |
| ---------------- | ---------------- | ---------------- | ------------ |
| Move             | `W A S D`        | Arrow keys           | Left stick   |
| Jump / fly up    | `Space`          | `Numpad 0` or `/`    | `A`          |
| Slash            | `F`              | `Numpad 1` or `.`    | `X`          |
| Interact / dive  | `E`              | `Numpad 2` or `,`    | `B`          |
| Mount / dismount | `Q`              | `Numpad 3` or `;`    | `Y`          |
| Sprint / boost   | `Left Shift`     | `Right Ctrl` / `RShift` | `ZL` / `ZR` |
| Zoom the map     | `Z`              | `X`                  | `R` / View   |
| Maths overlay    | `M`              | `M`                  | `L` / Home   |
| Pause            | `Esc`            | `Esc`                | `+` / Start  |

**Player 2 works on a laptop.** Her buttons used to be numpad-only, so on a
machine without one the second kitten could walk and nothing else — no slash,
no clan, no dragon. The keys next to the arrows (`, . / ;`) do the same jobs,
and the numpad still works if you have one.

Mount climbs onto whichever dragon is in reach, or onto your own panda if
there isn't one. **`Esc`**, or **`+`/Start on a controller**, opens the pause
menu — resume, settings, how-to-play, restart, or back to the title screen.

**You can play the whole game without touching the mouse.** The title screen,
the pause menu, settings and the help page all take a controller: the stick or
d-pad moves the highlight, `A` picks, `B` goes back, and left/right change a
setting in place without opening a dropdown you couldn't get out of. The
highlight starts on the button you probably wanted, so on the title screen
pressing anything still just starts the game.

**Cutscenes only skip on Start** (or `Space` / `Enter` on a keyboard). Any
button used to do it, which meant a thumb resting on jump threw away a
79-second story with seven recorded voices in it.

Jump twice for a double jump. Sprint and slash to send market stalls flying.
Fly low and fast on a dragon to scatter a whole street at once.

## The story

Press PLAY and an old calico called **Patchfur** tells you where you live, then
flies you past every clan in the sky. It runs about 70 seconds, any button
skips it, and **WATCH THE STORY AGAIN** in the pause menu plays it back.

There's no video file and no second canvas: the cutscene drives its own camera
through the *same 3D world you're about to play in*, and the leaders it flies
to are the same characters standing at those shrines when you walk up to them
afterwards. Islands slide past each other, and the beam of a shrine you haven't
reached yet stands up over the horizon behind whoever is talking.

| clan | leader | breed |
| --- | --- | --- |
| Thunderpaw | Sunstreak | Siamese |
| Riverclaw | Rippleclaw | Turkish Van |
| Shadowtail | Duskcoat | Tuxedo |
| Windwhisker | Galemane | Maine Coon |
| Icewhisker | Snowmantle | Himalayan |
| Pandapaw | Bambooheart | Ragdoll |

Every one of them is standing at her own shrine for the rest of the game. Walk
up and she'll tell you what her clan gives you before you commit to it.

## Meet the clan leaders

Walk up to a shrine and **stand there**. After a couple of seconds the leader
stops you, fills the screen and tells you who she is — out loud, in her own
voice. It happens once per leader, any button skips it, and **you can't swear
to a clan you haven't met**, so the introduction is the way in rather than
something in the way.

## Collect the seven dragon balls

**There is one star on every island — seven islands, seven stars.** The count is
shared between the two of you: you're hunting together.

**Only the first one is just lying there.** The other six are locked, and each
lock wants something different — so finishing the hunt means using nearly
everything the game has taught you, not just flying over seven islands and
looking down:

| star | where | how you get it |
| --- | --- | --- |
| 1★ | home | lying in the open, by the town |
| 2★ | autumn | in a **grotto** — land, find the glowing doorway, walk the maze |
| 3★ | frost | **sealed in ice**. Fly a dragon at it and breathe |
| 4★ | bamboo | **under a boulder**. Only a panda's claw will crack it |
| 5★ | ash | on top of a **stone spire** far too tall to jump. Fly up |
| 6★ | dusk | another **grotto** |
| 7★ | dojo | up three **floating shards**. You need Shadowtail's triple jump |

Each locked star tells you what it wants when you get close, and the colour of
its light says which kind it is from the air.

**The grottos are little mazes.** Inside the doorway there's a wall with its
gap on the far side and a spur that turns one way round into a dead end, so
you have to walk it rather than see the star from the entrance. Glowing
crystals on the walls light the way. You can't jump the walls, cut them, or
burn them — the mouth is the only way in.

**The 7★ really does need three jumps.** You have to be standing on the top
shard to take it, and you have to have climbed there yourself: flying up and
hopping off onto it doesn't count, and neither does grabbing it at the top of
a double jump on the way past.

**Knock over absolutely everything** — all of it, on every island — and
Patchfur has something to say about what you've done. Nothing stops when she's
finished; that's rather the point of what she says.

Find one and your kitten stops and **holds it over her head** while the camera
swings in. It only happens on her screen: if your sister is off cutting bamboo,
her half of the split carries on as normal.

Find all seven and Patchfur tells you where to take them. Then **the sky goes
dark**, and a very long green dragon called **Ryuuseki** is waiting over the
great torii.

He seats **both of you, and you do different jobs**:

| | |
|---|---|
| **First one on** | flies him — same controls as a storm dragon, and fires **one** beam |
| **Second one on** | works the beams — your stick aims, ATTACK fires **all seven** |

The fan belongs to the **second seat**. Whoever is flying gets one beam whether
she's alone up there or not; the seven — wide enough to flatten a whole market
street in one press — only ever come from the kitten in the gunner's seat. So
climbing on second isn't tagging along, it's the job.

Wherever she points, the beams leave **his mouth** and go where his head is
pointing: she can swing the fan a good way either side, but never back down his
own body.

He outreaches and outhits every storm dragon in the game, he has his own music,
and **once you're both aboard the screen joins into one shared view** — one
dragon on two half-screens is the worst way to look at him. With only one of
you on him the screen splits as usual, so whoever is still on the ground keeps
her own half.

## Raise a panda

Five of the six clans hand you a power the moment you stand in their ring.
**Pandapaw** hands you a job instead.

Its shrine is on the bamboo island. Swear the oath, then go and cut bamboo —
**20 canes** and a panda cub trots out and follows you everywhere. **20 more**
and it grows big enough to climb on. A grown panda runs twice as fast as you
do, jumps higher, and has a **claw swipe** on the attack button that hits far
wider and harder than the katana. Your clan badge counts the canes down for you.

The claw is also the only thing besides a katana that cuts bamboo, and it cuts
about four canes to the katana's one — so once you've raised a panda, clearing
a whole grove on its back is much faster than doing it on foot. A dragon still
can't touch bamboo from the air.

You each raise your own — Ember's is **Bao**, Frost's is **Mochi**. Bamboo you
cut before you ever found the shrine still counts toward **the cub**, so an
afternoon in the grove is never wasted — but the **20 that grow it up start
from the day the cub arrives.** You have to actually raise the animal; you
can't turn up with a full sack and skip straight to riding one. A cub can't be
lost: it follows you on foot, waits where it is while you're off on a dragon,
and meets you wherever you land.

Nothing you knock over comes back. Cut a cane and it's cut — if it topples off
the edge of the island it stays gone, so what's still standing in the grove is
exactly what's still left to score.

**Join a different clan and your grown panda stops following you.** It's still
yours and you can still ride it, but it waits where you left it — so it turns
up on the map, like a dragon on its perch. Swear to Pandapaw again and it comes
back to heel.

### Switch 2 controllers — use Firefox

> **Play this in Firefox.** With the Joy-Cons arriving through Joy2Win + vJoy,
> **Chrome cannot read the analog sticks.** Buttons work, the sticks report
> `0.00000` forever. Firefox reads the same controller on the same machine
> correctly. This is a Chrome bug in how it parses the device, not something the
> game can work around — if the sticks are dead, the title screen says so and
> tells you to switch.

Two sideways Joy-Con is the fastest route to two players. Both halves arrive as
a **single** vJoy device, so the game splits that one pad down the middle: P1
drives the left Joy-Con, P2 the right. There is no second controller to pair.

Pairing: hold the little **sync** button until the lights run, add the
controller from the computer's Bluetooth settings, then start Joy2Win. **Press a
button afterwards** — browsers hide a gamepad until it sends input.

**On the hosted version the controllers work exactly the same.** Joy2Win and
vJoy run on your machine and the browser reads the pad whatever page is open,
so hosting changes nothing about the input path — including the Chrome bug, so
it's still Firefox. One thing does change: **your saved calibration doesn't
come with you.** The button and stick map lives in `localStorage`, which
browsers key by site, so `katana-kitties.vercel.app` starts from the built-in
defaults no matter how carefully you tuned it on `localhost`. Wiggle both
sticks and press **DETECT STICKS** once on the new address and it's saved there
from then on.

In Joy2Win's `config.ini`, for two Joy-Cons: `controller = 0`, `orientation = 0`,
and **`mouse_mode = 0`** — with mouse mode on, a Joy-Con resting on a desk
switches to mouse control and stops sending its stick entirely.

**Settings → Controllers** is the calibration screen. It shows a live readout
per pad — which profile matched, which player reads which half, every axis with
the range it has travelled, the raw index of whatever you press, and which
action it lit. Nothing needs a code edit:

- **A button does the wrong thing** — click that action in the remap grid and
  press the button you want. Saved per browser.
- **A stick does nothing, or is rotated** — wiggle both sticks, then press
  **DETECT STICKS**. Or bind them by hand: *push RIGHT*, *push UP*.
- **Started fresh?** **RESET TO DEFAULTS.** A saved map beats the source
  defaults, so a stale calibration can look like a code change did nothing.

If the sticks look dead, `tools/gamepad-dump.html` opens straight from disk and
shows exactly what the browser reports, including whether it is receiving
reports from the device at all.

### PS4, Xbox and other controllers

**They work, and two of them at once is the easiest way to play.** Plug in or
pair two pads, press a button on each, and the first becomes Ember and the
second Frost — independent sticks, independent buttons, no settings to change.

| | PS4 / DualSense | Xbox |
| --- | --- | --- |
| Move | left stick / d-pad | left stick / d-pad |
| Jump | Cross | A |
| Slash | Square | X |
| Interact | Circle | B |
| Mount | Triangle | Y |
| Sprint | L2 / R2 / stick click | LT / RT / stick click |
| Pause | Options | Menu |

The right stick does nothing — the camera follows you, there's nothing to aim.

**The Firefox rule doesn't apply to these.** That's a vJoy problem, and a PS4
pad doesn't go through vJoy — Chrome reads it fine. Use whichever browser you
like unless you're on Joy-Cons.

Three things to know:

- **Don't mix a Joy-Con pair with another controller.** The two Joy-Cons arrive
  as one pad that gets split down the middle, and that only happens when it's
  the only controller connected. Add a PS4 pad and the right Joy-Con goes dead.
  Two Joy-Cons, or two other pads — not one of each.
- **Leave `padMode` on `auto`** in Settings → Controllers. It's there for the
  Joy-Cons and does nothing useful for anything else.
- **The remap grid is Joy-Con only.** A PS4 or Xbox pad can't be rebound in
  game, because it doesn't need to be — the browser already reports it in a
  standard layout. A no-name USB pad might land its face buttons in a different
  order, and there's no fix for that short of a code change.

`node tools/pad-check.mjs` checks all of this without any hardware attached.

---

## Sound

Every sound — the katana, the bamboo crack, the dragon's breath, the panda's
claw, the clan gong — is **synthesised at runtime** from oscillators and
filtered noise in `src/core/audio.js`, and the music is generated the same way:
a koto-style pluck wandering a Japanese pentatonic scale over a drone, so it
never loops exactly.

**Every island has its own music, and it changes when you walk onto it.** The
autumn island is warm and low, the snow island is high and almost all silence
with a bell over each note, the bamboo island is the fastest thing you can walk
around in, the ash island is the darkest scale in the game, and the Dojo is
deliberately the quietest — there's a lesson on screen there and a tune with an
opinion would compete with it. The home island keeps the theme you already know.

If the two of you are on different islands, the music follows **whoever most
recently arrived somewhere new** — so a kitten flying off alone still gets her
island's tune.

**Get on a dragon and it turns into a chase theme.** Storm dragons have their
own piece: the only one in the game with a proper bassline and a backbeat under
it, which is what makes it sound like a cartoon about flying rather than the
game theme played fast. Ryuuseki has a different one again — darker, higher, a
taiko instead of a drum kit. The intro has its own piece too: same synthesis,
darker scale, slower, an octave down.

The **only** audio files in the whole project are the eleven voice lines in the
opening cutscene (`public/voice/`, about a megabyte). If they're missing, the
cast falls back to pitched blips and the intro still runs.

That means nothing to download, nothing to licence and no asset pipeline. Two
sliders in **Settings** control effects and music independently.

Browsers won't start audio without a user gesture, so it comes up when you
press PLAY. If it's ever silent, that's the reason — click into the page first.

## The screen splits itself

Run apart and the view splits; come back together and it joins into one shared
camera. Configurable in Settings (`auto` / `always split` / `always shared`),
and side-by-side or top-and-bottom.

---

## Teaching the maths

Two places in the game show trigonometry actually running, with the numbers on
screen being the numbers moving things.

### The Kotodama Orb

Walk into a floating orb and it starts circling you. It draws its own working
as it goes: the radius vector, the swept angle, and the two legs of the right
triangle, labelled with live `cos θ` and `sin θ`. The orb's position is
literally

```js
orb.x = centre.x + Math.cos(theta) * r;
orb.z = centre.z + Math.sin(theta) * r;
```

(`src/entities/orb.js`) — the overlay is drawn from the same two numbers that
place the mesh, so it cannot drift out of sync with what she is watching.

### The Dojo of the Turning Circle

A whole island west of town is a walkable unit circle, 24 world units to the
radius, on graph paper. **Walk onto the circle and you become the point.** The
game reads your angle from the origin and draws, live:

- the radius vector from `(0, 0)` out to you — **a vector**
- the swept angle from the `+x` axis — **theta**
- the horizontal leg, length `cos θ` — **cosine**
- the vertical leg, length `sin θ` — **sine**
- your coordinates as `(cos θ, sin θ)` — **a point on the unit circle**
- axis ticks at ±0.5 and ±1, and `0° = 0`, `90° = π/2`, `180° = π`,
  `270° = 3π/2` — **degrees and radians side by side**

A HUD board plots both waves with a playhead locked to your angle, and prints
`cos²θ + sin²θ` so she can watch it sit at `1.000` no matter where she stands.

Two details worth knowing if you extend it:

- Maths `y` maps to world `−Z` (`ZS` in `src/systems/mathdojo.js`). The dojo
  camera looks down `+Z`, so without the flip the `y` axis would point *down*
  the screen and every diagram would be mirrored against her graph paper.
- Entering the dojo swings the camera to yaw `0` and near-top-down, so the
  world axes line up square with the screen.

---

## How the art works

The look is Super Mario RPG: **hand-drawn 2D characters billboarded inside a
real 3D world.** No character meshes anywhere.

- **Characters and dragons** are AI-generated anime sprite sheets
  (`public/sprites/`), turned into clean game atlases at load time by
  `src/core/spritesheet.js`.
- **Terrain, buildings and props** are procedural low-poly geometry generated
  in code (`src/world/build.js`), cel-shaded with a stepped toon ramp and
  inverted-hull outlines.

### The sprite pipeline

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

### Replacing the art

Drop a new sheet into `public/sprites/` with the same filename and refresh.
Live files are `ember_grid_v2.png` and `frost_grid.png`; the game logs
`[art] <file> → N directions x M poses` at boot so you can check what it found.

Ask for a grid of 4 rows (idle, walk, jump, attack) and 8+ columns rotating a
full turn, starting facing the viewer and turning toward the viewer's right, on
a white background. Whatever column count comes back is fine. Side-on art that
faces left (like the dragon) needs `artFacesRight: false`.

**Check that every row turns the same way before you use a sheet.** Image
models don't guarantee it — `frost_grid_v2.png` came back with its jump and
attack rows mirrored against its idle and walk rows, which no single setting
can correct, and it's kept out of the game for that reason. The quickest test:
column N should be the same direction in all four rows, and one column should
be a plain back view in all four.

---

## Layout

```
src/
  main.js               game loop, split-screen rendering, boot
  core/
    gfx.js              toon materials, outlines, Billboard
    input.js            two players, keyboard + gamepad, Switch 2 remap
    spritesheet.js      generated turnaround → clean game atlas
    label.js            world-space text
  world/
    build.js            noise, islands, pagodas, torii, trees, merging
    world.js            assembles the world, height queries, petals
  systems/
    mathdojo.js         the walkable unit circle
    cutscene.js         the opening story, flown through the real world
  entities/
    player.js           movement, slash, mounting, camera rig
    dragon.js           rideable storm dragon
    panda.js            the raisable, rideable Pandapaw panda
    leader.js           the six clan chiefs + Patchfur the storyteller
    orb.js              Kotodama Orb + pickups
    prop.js             knockable scenery
```

Every mesh in a category is merged into a single geometry (`mergeParts`), so
the whole town is a handful of draw calls even at split-screen.

---

## How it was built

**three.js, and nothing else at runtime.** No engine, no physics library, no
asset store. `npm install` pulls exactly two things: three.js and Vite.

Everything you can see is made by the code, at load time:

- **The islands are maths.** Each one is a rolling noise surface with a rim
  that falls away to a craggy underside, generated from a seed. The height is
  queryable analytically, so the kittens collide with the exact surface the
  mesh was built from rather than an approximation of it.
- **The town, too.** Houses, pagoda roofs, torii, lanterns, market stalls, the
  bridge, the bamboo, the shrines — all built from boxes and cylinders in
  `src/world/build.js`, painted with vertex colours and merged down into a
  handful of draw calls.
- **The look is cel-shading over real 3D**: hard-stepped toon ramps and
  inverted-hull outlines, which is the Super Mario RPG trick.
- **The characters are 2D drawings in a 3D world.** Each kitten is a sprite
  sheet of one full turn × four poses, billboarded to face whichever camera is
  drawing, picking the cell that matches the angle you're seen from. The art
  was AI-generated; `src/core/spritesheet.js` measures the sheet and slices it
  by connected-component labelling rather than trusting a grid.
- **Every sound is synthesised.** No audio files at all — see [Sound](#sound).

The whole thing is about 4,500 lines. `HANDOFF.md` is the companion document:
it records *why* things are the way they are, and the bugs that cost real time,
so none of them have to be rediscovered.

There's also `tools/world-check.mjs` — a headless smoke test that builds the
real world and pokes the real classes:

```bash
node tools/world-check.mjs
```

It catches the failures that still look fine in a screenshot: a grove that
generates zero canes, a dragon that never finishes flying home, a sprite sheet
read in mirror image, a clan buff that doesn't actually do anything.

## Ideas not built yet

- Enemies and real combat (deliberately left out — the slash currently exists
  to knock scenery over, which is where the fun is at this size)
- Clan camp building and kitten customisation
- More towns on the outer islands
- A second dragon type with different flight handling
- More pets to raise the way the panda is raised, each fed by a different
  material
