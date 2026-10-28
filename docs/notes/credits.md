# Pictures the game did not make — and the Picture credits page

**Every picture in the game is the game's own except the ones in
`public/help/japan/`**: eight photographs and woodblock prints in the deep dives
of Help's *Japanese words & culture* glossary (kendo armour, Hiroshige's carp,
the snow monkeys, Ryōan-ji, the tea ceremony, hanami, Fushimi Inari,
Itsukushima). Richard approved bringing outside pictures in on Oct 2026's
condition: **only if a game released to the world may carry them.**

## The licence rule

A picture comes in only if its licence lets a **commercial** game ship it with
no more than a credit line:

| licence | in? | why |
| --- | --- | --- |
| **Public domain** (old prints and photos, or a photographer who released it) | yes | no conditions at all |
| **CC0** | yes | no conditions at all |
| **CC BY** 2.0 / 3.0 / 4.0 | yes | the condition is a credit line, which the page already is. None is used yet |
| CC BY-**SA** | **no** | ShareAlike reaches the thing it is adapted into. A thumbnail in a game is arguably a collection rather than an adaptation, but "arguably" is not something to ship on, and a cropped or resized copy is an adaptation outright |
| CC BY-**NC** | **no** | a game on Steam is commercial |
| CC BY-**ND** | **no** | every picture here is resized |
| a photo with a **recognisable stranger** in it | **no**, whatever the licence | the licence covers the photographer's copyright, not the person's right in their own face for commercial use. This is why the hanami and tea ceremony are prints and not photos, and why the kendo picture is an 1860s portrait of a long-dead samurai |

All eight in the game today are public domain or CC0, so **none legally needs a
credit. Every one gets one anyway** — it is the honest thing on a children's
page, it costs a line, and it means a CC BY picture can be added later without
building anything.

`world-check` holds this: a credit whose `data-licence` is not in its `FREE`
list fails it, so an NC or SA picture cannot go in by somebody not reading this.

## How the credits work

- A picture from outside is a `figure.help-shot.jp-pic`. Its caption ends in
  `<a class="credit-ref" href="#credit-N">[N]</a>`, N in page order.
- **Picture credits** is the last sub-topic of *Japanese words & culture*,
  where the pictures are (Richard, Oct 2026: "put the picture credits at the
  bottom of Japanese words & culture as a sub-category"; it started as a
  top-level topic after *Saving your progress*). It sits between
  `<!-- doc-credits -->` markers, in the glossary's `name="help-words"` group,
  so opening it shuts the sub-topic the [n] was tapped in. Each `<li id="credit-N">` names the
  work, the artist, where the original is held, the licence, and links the
  Commons file page.
- **The [n] does not just follow its href.** The credits card is a closed
  `<details>`, and a hash jump into a closed one lands on nothing. `Game._showCredit`
  opens it, waits for its `toggle` (after `_helpToggled` has scrolled the card
  to the top — so this scroll wins), puts the line a third of the way down the
  panel, and lights it for 1.8s. **Not `requestAnimationFrame`**: in a hidden
  pane it never fires, and the card opened with nothing scrolled — measured.
- The URL hash is left alone, so BACK out of Help still means what it means.
- Pictures are capped at 360px tall on a desktop and centred; a portrait print
  at full panel width was a full screen of one carp. On a phone the general
  `.help-shot` 70vh rule already does it — the tallest print is 273px on an
  844x390 screen, all of it visible.

## Adding a picture

1. Find it on Wikimedia Commons and read its licence on the **file page**, not
   the search result — Commons lists BY-SA photos beside CC0 ones and the
   thumbnail does not say which.
2. Download a Commons thumbnail (500 or 960 wide — Commons snaps to steps)
   into `public/help/japan/`. Commons answers 429 to fast scripts: space the
   requests seconds apart.
3. Add the figure with its `width`/`height` (world-check makes every picture
   state its shape) and the next `[N]`, and the matching `<li id="credit-N"
   data-licence="…">`.
4. `node tools/world-check.mjs` — it fails on a picture with no credit, a credit
   with no picture, a missing source link, or a licence outside the list.
