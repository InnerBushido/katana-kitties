# Playing across devices — the options, and which one to build

*This is the one file in this folder that is a **plan** rather than a record.
Everything else here is the WHY behind code that exists; this is the WHY behind
code that does not, written so the decision does not have to be re-made from
scratch in six months. **Nothing in it has been built.***

*Asked for after the solo-play pass: **can a phone be used as a controller for a
game running somewhere else, and can the game's picture be sent to the phone?***

---

## Four questions wearing one coat

The ask arrived as one question and it is four, with four different answers.
Separating them is most of the work, because three of them are already solved
and only one is worth building.

| # | the question | short answer |
| --- | --- | --- |
| 1 | Phone as a **controller**, screen stays on the host | **Build this.** Small, and this codebase is unusually well shaped for it. |
| 2 | Send the **picture** to the phone as well | Valve already does it better than a browser can. Don't build it. |
| 3 | Play together **over the internet**, one machine simulating | Steam Remote Play Together. Blocked by the *shortcut*, not by the game. |
| 4 | **Real** networked multiplayer, accounts, national boards | A project, not a feature. Stage it, and the backend goes first. |

The distinction that matters and is easy to miss: **1 and 2 solve different
problems.** A phone as a controller solves *"four kids are in this room and
there are two controllers"*. Streaming solves *"the cousin is in another
house"*. Only the first one is a thing this game currently cannot do at all.

---

## 1. The phone as a networked controller

### Why this codebase is already most of the way there

`core/touchpad.js` was written to a rule that turns out to be the whole feature:

> the touch pad produces **exactly what a gamepad profile's `read()` produces**,
> so `InputManager` seats it in a player slot next to a Pro Controller and
> nothing downstream learns a new word.

A phone on the other end of a wire produces the same object. `{ax, ay, jump,
attack, interact, mount, sprint, start}` is about forty bytes; sending it sixty
times a second is 2.4 kB/s per player, which is nothing. **`Player` already
cannot tell a thumb from a Joy-Con, and it would not be able to tell a thumb on
another device either.**

So the game-side change is *one more device class in the existing pool*, not a
new input path. The work is in the places `core/input.js` already warns must
agree about what a device is — `_devices`, `_assign`, `_freeKeysets`,
`seatable`, `joinHint`, `describe`, `promptFor`, `deviceId` — and that file's own
comments say what happens when they disagree, because they have disagreed twice
already. `pad-check` is where a net pad gets pinned, and it can be pinned
headlessly: a fake transport handing the binder frames is the same shape as the
`stub()` the touch tests already use.

### The transport, and the one number that decides it

The game runs at 60 fps: one frame is **16.7 ms**. That is the unit to think in.

| route | round trip, realistically | verdict |
| --- | --- | --- |
| **WebRTC DataChannel**, unreliable + unordered, same Wi-Fi | ~5–15 ms | **This one.** Under a frame. |
| WebSocket through a relay in the same region | ~40–80 ms | 3–5 frames. Survivable outside the ring, bad inside it. |
| WebSocket through a relay on another continent | 150 ms+ | No. |

Unreliable and unordered is deliberate: this is a **state stream, not a command
stream**. A dropped frame of stick position is corrected 16 ms later by the next
one, and retransmitting a stale stick position is worse than losing it. The only
thing that wants reliability is a button *edge*, and the fix for that is to send
a monotonically increasing press-counter per action rather than a boolean — the
receiver compares counters and synthesises the edge, so a lost packet costs
nothing and a duplicated one is idempotent. `PadState` already thinks in edges
(`pressed` / `consume`), so this lands in a shape the game speaks.

### Latency only actually costs an outcome in one place

The third non-negotiable — **no combat outside the ring** — turns out to be a
networking asset. Outside the ring every verb is forgiving: walking, jumping,
knocking a barrel over, mounting a dragon. 40 ms of lag on any of those is
invisible to a nine-year-old. **The tournament is the only place where a frame
changes who wins.**

That means a phone controller can ship *without solving the hard problem*, and
the honest thing to do about the ring is to measure the round trip and say so —
the sixth non-negotiable, a refusal that speaks. A *"your phone is 90 ms away —
about five frames"* line on the join card is more use than a silent
disadvantage.

### The pairing gesture, for a nine-year-old

She should not type an IP address. The sequence:

1. The host shows a **QR code** in a corner of the pause menu, encoding
   `https://katana-kitties.vercel.app/pad#<room>`.
2. She points the phone camera at it. iOS and Android both open URLs straight
   from the camera app, with no app to install.
3. That page is the touch pad and **nothing else** — no world, no three.js, no
   atlas. A few kilobytes, booting instantly, which matters because this is the
   one screen a visitor's phone loads.
4. It joins the existing seat flow: the host treats the arrival exactly as
   `_autoSeat` treats a controller being picked up, character picker and all.

A four-letter room code should exist as well, for the phone whose camera is
being difficult. As well as, not instead — a code is a thing to read out and
mistype.

### The one piece of new infrastructure, and how to avoid needing it to prototype

WebRTC needs a **signalling channel**: a short conversation swapping connection
descriptions before the peer-to-peer link exists. It is a handful of messages
and then it is idle forever, but it has to live somewhere — and the current
hosting story is *"static Vite build, no backend, no database, no environment
variables"* ([hosting.md](hosting.md)). Vercel's functions are not built to hold
a long-lived socket open.

**Do not solve that first.** The whole feature can be prototyped and proven with
no hosting decision at all, because this repo already has the precedent: the
balance page's save endpoint is a `configureServer` hook in `vite.config.js`,
dev-server only, and it never exists in a build. A signalling socket in the same
hook, reachable over `npm run dev -- --host`, covers **the entire local-Wi-Fi
case** — which is the case the feature is actually for. If it turns out to be
fun, *then* pick a host for the shipped version (Cloudflare Durable Objects,
PartyKit, a small always-on box), and only then.

That ordering is the thing to insist on: it makes the expensive, hard-to-reverse
decision the **last** one instead of the first.

### The failure modes, which are all about phones and none about networking

These are what will decide whether it is fun, and each wants an answer before it
is built rather than after:

- **The screen sleeps mid-game.** The Screen Wake Lock API is the fix, and it
  needs a user gesture — the pad page's first tap is that gesture.
- **She takes a call, or swipes home.** The page is backgrounded, `rAF` stops,
  and the stick freezes wherever it was: a kitten walking off a cliff by
  herself. The host must read *"no frame for 250 ms"* as **neutral sticks**, not
  as the last stick held.
- **The Wi-Fi roams, or the link drops.** Her kitten must not vanish. The
  existing rule is already right — `_leavePlayer` returns her orbs to the world
  and says out loud that she has gone — but a drop should hold the seat for a
  few seconds first, and the screen should say which of the two is happening.
- **iOS Safari.** No fullscreen on iPhone, no orientation lock; already known
  ([mobile.md](mobile.md)). A pad page cares far less than the game does, but
  the URL bar will eat a strip of it, so the layout must not need that strip.
- **Two phones on one room code.** Two seats, or a refusal that says why.

### Size

Roughly **one to two sessions to a working LAN prototype** (dev-server
signalling, one phone, one seat), and **three to four to something the girls
could use** — the seat flow, the QR, the drop handling, the `pad-check`
coverage and a Help topic. That assumes the input layer is *extended* rather
than worked around; going around it would be faster and would recreate the bug
`_freeKeysets` exists to prevent.

---

## 2. Sending the picture to the phone: don't

Technically it works. `canvas.captureStream()` into an `RTCPeerConnection` track
is a real thing browsers do, and the phone would play it in a `<video>`.

**It is the wrong trade here, for a reason this repo has already measured.**
[performance.md](performance.md) establishes that the game is **fill-bound** —
frame time is a straight line in the size of the drawing buffer and everything
else is rounding. Streaming a player's view means rendering an *extra* full view
that nobody in the room is looking at and then video-encoding it, on the same
machine already drawing up to four panes. The cost lands squarely on the one
axis this game is known to be limited by.

The latency adds the wrong way round too: controller-up **plus** video-down, so
the phone player gets the worst of both while everyone in the room gets a slower
game. Glass-to-glass on a browser-encoded stream is realistically 60–150 ms.

**And it fights the design.** The split screen is not a workaround for having
one monitor; it is what makes four kids sit on one sofa. Handing one of them a
private screen removes the thing.

If somebody wants it anyway, it already exists — see below — and Valve's
implementation uses the machine's hardware encoder, which a browser will not
reach.

---

## 3. Steam Remote Play — already answered, and already written down

[steam.md](steam.md) has the verified version. The short form:

- **Steam Link works today**, with the non-Steam shortcut the game already has.
  A phone, tablet or another PC streams the host's window and forwards input
  back, including its own on-screen pad. *"Can the phone play the PC version"* —
  yes, right now, nothing needs writing. One remote player.
- **Remote Play Together — the four-friends-over-the-internet one — is not
  available for non-Steam shortcuts.** Valve exposes no way to enable it for
  them. This is the frustrating one, because Remote Play Together is otherwise a
  *perfect* fit: it exists precisely for local split-screen games, forwards up
  to four controllers, and would need **zero netcode**. The blocker is the
  shortcut, not the game.

So the cheapest route to four friends playing over the internet is not a
networking project at all — it is **publishing on Steam properly**, which the
store artwork and the trailer already exist for. That is a distribution decision
(a Steamworks fee, a review process, and a public store page for a game built
for two children), not an engineering one, and it should be made on those terms
rather than dodged by writing netcode.

---

## 4. Real networked multiplayer, and why it is a different project

Worth stating plainly so it is not embarked on by accident.

**The obstacle is not the wire; it is that this game has no seam between
simulation and presentation.** There is one authoritative world inside one tab:
216 props whose knocked-over state is permanent and honest (fourth
non-negotiable), dragons that belong to perches, pandas that follow one owner, a
tournament state machine, and an orb economy with global stock that trading must
not destroy. Entities are object graphs holding `THREE.Object3D`s. None of it
has an id, a snapshot, or a delta.

**Deterministic lockstep is the tempting answer and it is the wrong one.** It
needs bit-identical floating point across two browsers, every `Math.random`
seeded and ordered, and three.js internals never touching the simulation. One
divergence and the two worlds silently disagree — the worst failure mode there
is, because nothing reports it.

**Host-authoritative with prediction for your own kitten only** is the realistic
model, the Quake/Source shape: you predict yourself, everything else
interpolates from the host's snapshots, and the host is right. The world is
small enough that interest management is a non-problem — the whole state is
kilobytes.

**The ring is the hard part, as ever.** A four-player fighting game where a
frame decides a ring-out is where rollback lives, and rollback is a serious
undertaking on top of everything above.

### If it is going to happen, the backend goes first and separately

Accounts, unlocks, saved progress and national boards are a **much easier**
project than netcode, they are independently useful, and they are the half the
players would actually notice. The game currently saves *nothing* between
sessions — the Help panel says so in a warning box — and only the record board,
the controller calibration and the stick setting survive a reload, all in
`localStorage`. `systems/leaderboard.js` already has the shape (`BOARD_MODES`,
rows, a load and a save); pointing it at a real table is a small change behind
the same interface.

A sensible order:

1. **Accounts and saved progress.** The thing every player asks for, and the
   thing the Help panel currently apologises for.
2. **National boards** — `leaderboard.js`'s existing load/save moved behind a
   fetch, plus the moderation question that a public board with kid-entered
   names always brings.
3. **Only then** netcode, if it still looks worth it — by which point there is
   an identity system to hang a session on, which netcode needs anyway.

---

## The recommendation, in order

1. **Try Steam Link tonight.** It costs nothing, it already works, and it may
   turn out to be the whole answer to the question that was actually being
   asked. Nothing below is worth starting before that is known.
2. **Build the phone-as-a-controller, LAN-first, dev-server signalling.** It is
   the only one of the four this game cannot already do, it is small because
   `touchpad.js` was written well, and it fits the design instead of fighting
   it: more kids around one screen, which is what this game is.
3. **Decide Steam publication on its own merits.** It unlocks Remote Play
   Together — four players over the internet, zero netcode — and that is a
   better deal than any amount of engineering.
4. **Leave real netcode alone until there is a backend**, and build the backend
   for saved progress first, because that is worth having whether or not the
   netcode ever happens.
