# Running it through Steam

*Design notes. This is the WHY behind code that already exists — read it when
you are about to change something in this area, not before. Current state and
open work live in [HANDOFF.md](../../HANDOFF.md); the always-on summary is
[CLAUDE.md](../../CLAUDE.md). The controller reasoning that led here is in
[input.md](input.md).*

---

## Why there is a Steam shortcut at all

It started as a workaround and turned into a feature. The 2026 **Steam
Controller** ships in lizard mode — it emulates a keyboard and a mouse in
firmware, has no XInput mode, no DirectInput mode and no standard HID gamepad
descriptor, and its real input rides a *vendor* HID collection only Steam knows
how to read. `navigator.getGamepads()` never sees it. See
[input.md](input.md#the-steam-controller-is-not-a-gamepad-until-steam-says-so)
for the full diagnosis.

The route that works is to make **Steam** emit a virtual Xbox pad *at the
browser*: add Firefox as a non-Steam game, turn Steam Input on for that
shortcut, give it a Gamepad layout, and launch Firefox from Steam. The browser
then reports an Xbox 360 pad with `mapping: "standard"`, and the game's existing
`standard` profile is already right for it. **No game code was needed and none
was written.**

Having done that, the same shortcut turns out to be the answer for the Switch 2
pads too, and it comes with a library entry, a launcher and a desktop icon —
which is why the rest of this file exists.

---

## The launch options, argument by argument

Steam **appends** the Launch Options string to the target, so the box holds the
ARGUMENTS ONLY. It must not repeat `firefox.exe` and must not be wrapped in
quotes as a whole; quotes go around individual arguments that contain spaces.

```
-no-remote -P steam -kiosk "https://katana-kitties.vercel.app"
```

**`-no-remote` — start a new process instead of talking to an existing one.**
Firefox is single-instance by default: a second launch hands its URL to the
copy already running and then *exits*. Steam sees the process it started
disappear a second later, marks the game as stopped, and drops the Gamepad
layout back to Desktop — with nothing on screen to say why, because the game
carries on running in the window that is already open. `-no-remote` refuses the
handoff, so Steam has a process to hold on to.

**`-P steam` — its own profile.** This one caused a bug worth recording.

> **A `-P` that names a profile which does not exist opens the Profile
> Manager, every single launch.** It is not a warning and the "don't ask at
> startup" checkbox does not suppress it — that preference is about having no
> `-P` at all. Reported as "I get Firefox choose user profile every time".

The profile has to be created once, and Firefox will do it without opening a
window:

```
"C:\Program Files\Mozilla Firefox\firefox.exe" -CreateProfile "steam"
```

**Or skip the registry entirely** and point at a directory instead —
`--profile "D:\somewhere\kk-profile"` creates it on first use and never appears
in the Profile Manager at all. Verified: a fresh directory loads straight into
the game with no dialog.

**A separate profile means separate `localStorage`, and this game keeps
everything there** — the leaderboard (`systems/leaderboard.js`), the vJoy
button map (`core/input.js`), the device override (`core/device.js`). Scores set
before the Steam shortcut existed stay in `default-release` and do not follow.
Nothing is lost; it is just a second save file. The alternative is worse:
`-no-remote` with the everyday profile fails outright with "Firefox is already
running" the moment a normal Firefox is open.

**`-kiosk` — fullscreen with no browser furniture.** No URL bar, no tabs, no
context menu. Mozilla's own enterprise documentation is the reference. `-kiosk`
and `--kiosk` are both accepted; `-private-window` can be added if the profile
should forget everything between sessions, but **do not** — private browsing
gets its own `localStorage` that is thrown away on exit, which throws away the
leaderboard with it. Quit with **Alt+F4**; F11 and Ctrl+W are disabled.

**The URL is the deployed game, not the dev server.** `http://localhost:5173` is
Vite, so a shortcut pointing at it is a shortcut that only works when somebody
remembered to run `npm run dev` first, and shows a connection error otherwise.
The Vercel URL always works and needs no terminal — it does need the internet.
`npm run preview` on `:4173` is the offline middle ground.

---

## The artwork

`tools/steam-art.mjs` builds all of it from `public/sprites/title_art.png`:

```bash
node tools/steam-art.mjs        # writes out/steam/
```

| file | size | where Steam shows it |
| --- | --- | --- |
| `background.png` | 3840x1240 | behind the game's detail page |
| `logo.png` | 1280 wide, alpha | composited **on top of** the background |
| `cover.png` | 600x900 | the library shelf |
| `wide-cover.png` | 920x430 | Recent Games, Big Picture |
| `icon.png` | 256x256, alpha | source for the .ico |
| `katana-kitties.ico` | 16–256 | the desktop shortcut and the taskbar |

**Nothing here is a new drawing, and that is the point.** The title art is the
piece the whole UI's palette was taken from; a prompt to an image model would
have put art on the box that is nowhere inside the game. The tool crops, scales
and composites, and `check()` at the top of it re-derives every measurement from
the file and throws if the art is replaced with something those numbers no
longer describe.

Four things in it are not obvious.

**The background must not contain the wordmark.** Steam draws the Logo on top of
the Background, and a page carrying the wordmark twice — once sharp, once scaled
and offset behind it — is the single most common way a hand-made shelf looks
broken. The crop therefore starts below the claw marks, which is also where the
widest clean band of the painting begins.

**There is a hole in the middle of the source art, on purpose.** The title
screen puts the cat-head menu panel over the bottom centre of the picture, so
the picture has a big blank tan board sitting there waiting for it. Every
landscape crop wide enough for Steam reaches into it, and out of context it
reads as a missing texture. `healSign()` paints it out by continuing each column
downward — the right repair rather than the lazy one, because what the board
covers is a flat amber sky between two *columnar* cliffs, so the streaks a
downward smear leaves are the same shape as the rock drawn either side. The blur
radius **grows as it descends**: sharp at the top so each cliff carries on as
the rock it is, dissolved a hundred rows lower, because that is what the eye
expects of anything that far below a cliff edge. A constant blur gave either a
visible seam or six vertical bars reaching the bottom of a 3840px picture.

**The wordmark is cut off its sky by a flood fill, not a colour test.** A colour
test cannot tell the orange in the sunset from the orange in a claw mark.
Reachability can: everything the banner *encloses* is kept by construction,
which is what saves the claws where they cross it. Two refinements were needed
on top:

- **The paper's edge is measured per COLUMN.** The banner is torn, so its edge
  rises and falls by sixty pixels across the picture — and where it rises, a
  pagoda roof from the scene behind rises with it and comes up *inside* the
  band. Dark enough for the ink test, touching the cream so it survives the
  island filter, and the result was a smudge in the bottom-right corner of an
  otherwise clean logo.
- **Only the biggest island survives.** Reachability answers "is this outside
  the banner"; it cannot answer "is this part of the banner".

**The icon is the claw, and it is the only element in the painting that survives
sixteen pixels.** Everything else was tried on a taskbar first: the kittens are
two dark specks, the dragon is a smudge, and the cat-head menu panel — the
obvious choice, since it is the kids' own drawing — is 600x270, which inside a
square is a 16x7 sliver with nothing readable in it. The three slashes are
already the game's mark: they are in the wordmark, and `.load-claw` in
`style.css` is the same three bars.

The crop is square over the claws' **top half**, for two reasons that are both
about 16 pixels. It fills the frame, so the slashes run corner to corner instead
of floating in the middle of it. And it keeps them on the teal sky and the cream
paper, where they are at maximum contrast — below the banner they cross the
sunset, and there the bright edge of a slash (255,174,82) and the sky behind it
(220,154,76) converge to within a few values. Framing that low left sandy crumbs
hanging off the bottom of each claw where the two could not be told apart.
**Green is what separates a slash from a sunset, not red.**

### Steam will not make the icon for you

It never has, and it does not for real appids either — publishers upload one.
The `.ico` has to be set by hand on the Windows shortcut: right-click →
Properties → Change Icon → browse to `katana-kitties.ico`. Steam's own library
artwork (right-click the game → Manage → Set custom artwork) is a separate set
of images and does not touch the desktop.

The `.ico` is **PNG-in-ICO**, which is the only form that can carry a 256px
entry — the directory's width field is literally one byte, and 0 means 256.
Supported since Vista.

---

## Remote Play, and the two things it is not

**Remote Play to your own devices works with a non-Steam shortcut.** Steam Link
on a phone, a tablet or another PC streams the host's window and forwards input
back, including a paired controller or Steam Link's own on-screen pad. That is
the honest answer to "can the phone play with the PC version": it can *watch and
drive* the PC version. Nothing needs writing.

**Remote Play TOGETHER — the four-friends-over-the-internet one — is not
officially available for non-Steam shortcuts.** Steam exposes no option to turn
it on for them; the community routes involve borrowing a real game's appid or a
third-party helper. This is worth knowing because Remote Play Together is
otherwise a *perfect* fit for this game: it exists precisely for local
split-screen multiplayer, forwards up to four controllers, and would need zero
netcode. The blocker is the shortcut, not the game.

**Neither of them is networking.** Both are one machine simulating everything
and shipping pixels. Real four-player-over-the-internet would mean WebRTC, a
signalling server, and an authoritative view of a world that currently only
exists inside one tab — a project, not a setting. Worth saying out loud because
"Steam has multiplayer built in" is easy to believe and untrue in this shape.
