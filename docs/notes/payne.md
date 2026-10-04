# Payne, the quest-giver

**She is a real person.** Payne is a fighter from Belegarth Medieval Combat
Society, drawn here as a green cat-goblin. Richard asked her permission to put
her in the game and will send her the finished result **for her final
approval**. Until she has approved it, she has not approved it: a public release
that includes her waits for that answer, like the cackle in PROJECT.md §8. Her
photos went to Higgsfield as image references with Richard's OK, and to nowhere
else.

The brief, verbatim where it decides something:

> We should have a quest giver ... she is funny, confident, and goofy with a
> great personality, very charming, and willing to help players on their
> quest! ... She won this awesome 3D printed Gundam helmet at the last event we
> were at ... can either put this helmet on top of her face as a separate
> image/model or can generate an image with her wearing it.

> Payne can be in the town and can show the Character Profile screen and can
> tell the player the next quest they should do (along with optional tag along
> quests like: most dragonballs, most kotodama orbs, most mischief) and shows
> them which ones they have achieved so far.

> Payne can give hints if players have been stuck on the quest for more than 2
> minutes, this can be a global message sent to the player on their split
> screen with Payne's face. Players can opt-in to get hints when talking to
> Payne, once opted-in, she will highlight where the player needs to go next
> once a hint is revealed.

> Maybe even tease you, like goblins like to do, if you are taking too long or
> she notices you struggling with something funny (getting stuck in a maze,
> having a baby panda for too long, like, more than 2 minutes, unable to get the
> dragonball with triple jump while trying to jump up them ...)

> This is placed above or below "bamboo" warning message or any other warning
> message that appears.

> Have quests given in this order: 1. Panda Keeper 2. Six Oaths (... with Sense
> Mischief being the last one if not yet visited) 3. Student of the Circle
> 4. Dragon Pilot 5. Beam Gunner 6. The Very Last One.

Answers to the follow-up questions: a **separate helmet layer**, because "I
plan to reveal her face at the end of the game, in which point she can be
holding the helmet instead of wearing it"; her **whole body**, because she may
later be playable or a tournament opponent; the **Pixie** voice; one trick, the
**Goblin Sweep**.

Everything is in [`systems/payne.js`](../../src/systems/payne.js). The card
rows are in [`systems/inspector.js`](../../src/systems/inspector.js), the ring
in [`systems/sweepfx.js`](../../src/systems/sweepfx.js), and the move in
[`entities/player.js`](../../src/entities/player.js) as `ATTACKS.sweep`.

## Where she is and what she does

- **In the market at (-10, 24)**, west of Mr. Satan, on `findOpenSpot`. A
  solid r 1.25, a bouncing idle, and a bubble beside her head: an invitation
  for a kitten who has not met her, then "Stuck? Need a hint?".
- **Her bubble's tail comes out of its SIDE and points at her helmet.**
  Reported: *"Payne's speech bubble is not where she is standing, may be
  pointing to her old location before the resize."* It was: the bubble had
  moved beside her head, but its tail still came out of the bottom and pointed
  at the grass beside her. `bubbleTexture(..., { tail: 'left' })` puts the tail
  on the side (every other character keeps theirs underneath, byte for byte)
  and returns where its point is. Payne hangs the bubble by that point at
  `BUBBLE_TIP`, on her helmet just outside its edge. The point is near the
  bubble's TOP, so the box hangs down beside her shoulders. With the point two
  thirds down, the box ran under the scoreboard at 8 units, measured in the
  browser.
- **She is 6.0 tall, not 3.7.** *"Payne looks too small in the town, should be
  1.5x's bigger at least, her helmet should be as big as a regular players
  head at least."* Measured, not reasoned. A kitten's head is 1.42 wide (the
  atlas's head band at the 2.9 kitten height, read in the browser). Her helmet
  is 184 of her 753 px (`HELMET_FRAC`, re-read off `town.png` by world-check),
  so it is 1.47 wide at 6.0. 1.5 x 3.7 = 5.55 would have left the helmet at
  1.36, smaller than a head, so the helmet sets the size, not the 1.5x.
  `TALK_R` went 4.6 -> 5.2 and the shadow scales with her.
- **The bubble is BESIDE her head, level with her face (`BUBBLE_Y` = 0.84 of
  her height), and slides along each lens's own right vector.** Kept over her
  head at 6.0, its top was at NDC y 1.07-1.13 at every talking distance: off
  the screen. Moved beside her, it then covered the kitten's TALK TO PAYNE
  prompt at 3.5 units. So it **hides inside `TALK_R`**, where the prompt says
  the same thing. After: top at NDC 0.64-0.78. world-check runs the shipped
  `_updateNpc` for both halves.
- **No invitation once the quests are over.** *"Payne is calling for players
  that just spawned to see her, even though the Quests are over."* A kitten
  seated after the Awakening had never met her, and the invite branch asked
  only `met`. Now it also needs a next step (`nextStep` is null once
  `feats.open` shuts). Checked with a late kitten over the whole invite window.
- **She is in Help** as a sub-card, **Ask Payne**, inside *Quests &
  achievements*, in its own accordion group `help-quests`. It is a sub-card
  rather than more prose because the parent card has a reading budget
  world-check holds it to. The picture is her town pose, helmet on (her face is
  the ending's reveal), cut by `tools/help-portraits.mjs` from the
  already-keyed `town.png` with no flood fill.
- **INTERACT near her opens her card**, through the Inspector's per-pane card
  machinery, so one player drives it and the screen says who
  (non-negotiable 7). Rows:
  - **WHAT'S MY NEXT QUEST?** shows the six, the three tag-alongs, and NEXT:
    one sentence saying where to go. From here, **MARK IT ON MY MAP**.
  - **HINTS: ON/OFF.** This is the opt-in.
  - **CHARACTER PROFILE** opens the real profile screen, and BACK comes back
    to her card.
  - **SECRET GOBLIN TRICK.** While locked, it states what it wants as an
    instruction, with both counts (non-negotiable 6).
- **The chain is `CHAIN`**, in Richard's order. A quest is *settled* when it is
  done, TAKEN (the Beam Gunner goes to one kitten) or CLOSED (the Awakening
  shuts every door). She always points at the first quest still open.
- **`nextStep` is pure.** It reads the game and returns
  `{quest, key, line, target, where, sig}`, so world-check can put a kitten in
  any state and ask:
  - **Panda Keeper:** the Pandapaw hall, then the nearest bamboo still
    standing. The count comes from `toNextTier`, the same number the badge
    uses.
  - **Six Oaths:** the nearest unsworn hall, with **Icewhisker held back until
    she is the only one left**, even if the kitten is standing in her doorway.
  - **Dojo:** `dojoCentre`.
  - **Pilot / Gunner:** Ryuuseki's front or back seat if he is up; the torii
    once all seven stars are held; otherwise the nearest star, with its lock's
    own hint.
  - **The Very Last One:** `seekTarget`, the same prop the minimap and
    Icewhisker's chevron already point at. **Its mark is pinned and its
    MARK IT is a conversation** (below).

## The Very Last One, asked again and again

Richard: *"it should only show the 'next' closest mischief if they ask to
'mark it on my map', but once knocked over, it should wait for the player to
'mark it on my map' again before showing it again."* Then the Icewhisker
detour, a temper, and a sweep. `askLast` runs it:

| ask | she | her map |
| --- | --- | --- |
| 1st | `h_last` | the nearest standing prop, **pinned** (`_pinLast`). It does not hop to the next one; it goes when that prop goes over, and the map waits for the next ask |
| after that, **without** Sense Mischief | `last_ice`, then `last_ice2` | Icewhisker's hall, **until she holds the oath** |
| after that, **with** it | `last_mad1`: *"Are you serious with me? You already have the Sense Mischief ability!"* plus goblin | nothing: she has the arrow |
| and again | `last_mad2` (then `last_mad3` every time after) | her card is closed and she is swept |

- **Every other step's mark FOLLOWS the step** (the next cane, the next star).
  On this one that made her mark a second Sense Mischief, hopping to the next
  prop on every knock. So it is an `override` pinned to one prop.
- **"Has Sense Mischief" is `clan.buff.seek`, the oath she holds NOW.** Every
  kitten on this quest has sworn to Icewhisker once already, because the clans
  quest comes first. The arrow belongs to whoever is sworn to her today.
- **The stuck hint (hints on) pins one prop too**, as a single ask would, and
  does not advance the conversation. So does turning hints on.
- **The sweep lands on her last word.** `say(..., { after })` fires when the
  clip ends ("...Goblin... SWEEEEP!", 22.6 s into `last_mad2`, measured in the
  browser), not when the card's hold does. With no voice it fires after the
  text's own time.
- **It is a gag, not combat.** She calls `Player.blast`, Mr. Satan's door, with
  `PAYNE_SHOVE` (knock 15, lift 9 against his 34 / 16): no damage, no
  knockout, no score, and nothing in the town goes over. The MISCHIEF counter
  is the kittens', and the Very Last One is a race a goblin must never be able
  to win for somebody. Non-negotiable 3 is untouched.
- **Out of reach (`PAYNE_SHOVE.reach` 6.4), nobody flies**, and never a kitten
  on a dragon. The card still comes down, because the conversation is over.
- **Her ring is a kitten's ring.** `SweepFx` takes `payne.sweeper` as one more
  sweeper, with its own `sweepReach`. She spins by her billboard narrowing and
  mirroring twice (`PAYNE_SPIN`). Afterwards she is in a huff (`PAYNE_HUFF`,
  10 s) and her bubble does not offer anybody a hint. The first time it ran,
  the frame after the sweep said "Stuck? Need a hint? Come and talk to me!"
- **Her voice finishes even when the dialog ends.** The rants are `keep`, so
  nothing the kitten presses, BYE included, can cut them off. What she says
  after the sweep (`last_swept`) goes to the kitten's pane as a card.

## Who she is talking to wins

Reported: *"If Payne is talking to another player, and someone closes dialog
box with Payne, it cancels the speech for the other player. It shouldn't do
that and the other players dialog that appears should take preference over
Payne's exit voice."* `say(..., { now })` used to end whatever was current,
whoever it was for. Now:

- **`now` cuts only this kitten's own words**, and never a `keep` rant.
  Otherwise it waits at the head of the queue.
- **BYE is `low`.** It is dropped outright if anybody else is being talked to
  or waiting, and anybody's next line cuts one that is playing.
- *Found on the way:* `_play` read `g.announcer?.clip?.(ids[k++])`. Optional
  chaining skips the arguments too, so with no announcer `k` never moved and
  the loop never ended. The game always has an announcer, so only world-check's
  first voice-less run could find it. That is exactly the fallback
  non-negotiable 9 promises.

## Hints, teases, and why they are opt-in

- **Stuck** means `sig` has not changed for `STUCK_FIRST` (120 s): no step
  finished, and no progress inside it either. One more cane cut starts the two
  minutes again.
- **The second hint teases first** ("Hellooo? Did you fall asleep?") and still
  helps. There are **three hints at most** per step.
- **Every hint puts the step on her map** (the minimap draws a pulsing green
  ring with a dot in the kitten's colour) and raises a green beacon in the
  world.
- **The three teases Richard named**, and the other two are opt-in as well:
  - **A cub carried for 120 s** without growing.
  - **35 s in a grotto** whose star is still there (`MAZE_TEASE`; it was 75,
    and Richard: *"Lets change the 'Lost in a cave' timing to be 35secs."*).
    The tease is the wall-hand trick.
  - **Four hops near the sky star with only two jumps.** Her mark then points
    at **Shadowtail's hall** rather than the star, because what the kitten
    cannot find is the reason she cannot reach it. The mark holds until she has
    the third jump, or for four minutes.
- **All of these are opt-in.** A kitten who never asked for hints hears none of
  them. What does reach everyone: **two invitations at most** (at 90 s and
  360 s) to come and meet her, and the two trick lines, which fire only after
  she has met her.
- **Her voice waits for Mr. Satan's.** The announcer's card and Payne's share
  one speaker (`audio.speak`), and his lines are the tournament's, so hers
  queue. A message she was cut off from is dropped rather than repeated late.

## The hint card

It is per pane, in `#payne-hints`, **directly above the warning strip**:
`payneSpot` anchors its bottom edge at the warning's top (`WARN_UP`) minus a
gap, and caps its height so it cannot leave the pane. world-check proves this at
one, two and four panes. On a touch screen the warnings move to the top, so
Payne goes to the top and the warnings drop by `--payne-h`. It has
`pointer-events: none`, because it sits over the minimap corner and the minimap
takes taps.

**Her name first, if it is really her name.** "Heyyy, Ember!" plays only when
the kitten's name is still her style's name. A kitten renamed "Sparkles" gets
her real name in the text and no name in the voice, because the voice would be
wrong about who she is talking to.

## The helmet, and her face

There are two billboards. **In town she wears the helmet** (`payne/town.png`,
a generated picture of her wearing it, since the separate layer did not sit
well on her head). **After the Awakening** (`kotodama.awakened`) the billboard
swaps to `payne/held.png`: her face, with the helmet under her arm. The hint
card's portrait follows the same switch. Its crops are measured, `[x, y,
size]` on each file, in `PAYNE_ART`.

`payne/base.png` (her whole body, no helmet) and `payne/helmet.png` (the helmet
alone) ship as well. Nothing draws them yet. They are the layers for making her
playable or an opponent later, as Richard asked.

## The Goblin Sweep

- **Earned when all six quests are settled AND she has fought three arena
  rounds** (`TRICK_ROUNDS`, counted in `onRound`). The Very Last One settles
  only at the Awakening, so this is an after-the-ending reward. That is also
  when her face comes out, which is why the drawing on the trick card shows
  it.
- **Hold SPRINT, keep the stick still, press ATTACK.** That input did nothing
  before: a standing slash with sprint held was just a standing slash. It is
  tested below the charge, which needs the stick pushed, and above the Cross
  Slash's hold-detector, which would otherwise swallow the press.
- **`ATTACKS.sweep` is `{dmg 8, knock 8, lift 7.5, reach 4.4, arc -1}`: a full
  circle.** Every prop in reach goes over. A kitten in reach is hit **only
  through `Game.strikePlayers`**, which answers no outside a live round
  (non-negotiable 3). world-check swings one at her sister in the market and
  asserts zero damage, then swings one in the ring and asserts it reaches the
  kitten *behind* her.
- **4 s wait (`SWEEP_COOL`).** A press during the wait gets the refusal blip
  and ONE line that says the seconds left. *"...should stack the message or
  delete the previous message so it does not spam the screen."* It goes through
  `toast`'s combo slot (key `sweepwait`), which rewrites one live line per
  kitten in place. The refusal still says so (non-negotiable 6); mashing it
  eleven times in the browser left one toast.
- **Feet on the ground, next to her, or it misses.** *"The sweep attack should
  only work on players that are touching the ground next to the player, if
  they jump and are in the air, it should not work."* `strikePlayers` asks, for
  `sweep` only: the target is `onGround`, not riding, and within `SWEEP_UP`
  (0.6) of the sweeper's height. The ordinary strike band is 3.4, which lets a
  slash catch a kitten mid-hop; that is right for a slash and wrong for a
  sweep. **Jumping is the counter**, and the tuning page says so.
- **Its reach never grows.** *"...the attack should not scale in length with
  longer katana abilities or kotodama powerups."* `_doSweep` uses
  `ATTACKS.sweep.reach` rather than her buffed `_reach()`, passes `BASE_REACH`
  to the gate, and the gate treats `sweep` like `claw` (clan multiplier 1). The
  ring in `sweepfx` is the same unbuffed number, so the ring is still the
  hitbox. world-check tests a Long Cut kitten at 1.6x, with a control proving
  the same buff does lengthen a standing slash.
- **The spin is her facing turned twice around** over `SWEEP_SPIN`: the sprite
  sheet's eight directions make it read as a spin with no new art. Her own
  facing comes back at the end, and she is planted for it.
- **`sweepfx.js` is a poller** over `sweepSeq`, like crossfx and dodgefx. The
  ring grows to exactly the sweep's reach: the ring is the hitbox.
  *Found in the browser:* the rig was seeded with her current count on the
  frame of her first sweep, so that first sweep never drew. A check now pins
  it.

## The script

Pixie, `voice_id 0178ef57-ada4-43d9-992b-8d9221045bb4`. All 54 lines, in
`public/voice/payne/`, are **for Payne's approval** along with her likeness.
The text is `PAYNE_LINES`, and the text is the line: the voice falls back
(non-negotiable 9), and world-check requires every line to have a file and
every file to have a line.

| id | line |
| --- | --- |
| `hey_*` / `oi_*` | "Heyyy, Ember!" / "Oi! Ember!", for all four kittens |
| `hello` | I'm Payne! Goblin, fighter, and the best quest-giver in the whole sky. Stick with me, kitten — we're gonna make SO much mischief. |
| `back` | You're back! Missed me? Course you did. |
| `invite` | Psst! Come and find me in the town. I've got quests for you! |
| `bye` | Go make some mischief! |
| `q_panda` | First job: get yourself a panda! Swear to Pandapaw on the bamboo island, then cut bamboo until your little cub is all grown up. |
| `q_clans` | Six clans, six oaths! Go and swear to every single one. I'll tell you who's still waiting. |
| `q_dojo` | School time! Stand in the Dojo of the Turning Circle and watch the numbers go round. Forty-five seconds. No wiggling. Okay, a little wiggling. |
| `q_pilot` | Wanna fly a real dragon? Find all seven dragon balls, call Ryuuseki, and hop in the front seat! |
| `q_rider` | Climb into Ryuuseki's back seat and blast that beam! Forty-five seconds — and you have to be first! |
| `q_last` | Last one, and it's a race! Whoever knocks over the very last thing in the whole sky wins it. Go, go, go! |
| `q_done` | You did every single one of my quests?! Okay. Okay, I'm impressed. Don't tell anyone. |
| `q_closed` | That door's shut now, kitten. But look at everything you DID do! |
| `h_pandapaw` | The Pandapaw shrine is on the bamboo island. I put a mark on your map — go on! |
| `h_bamboo` | Your cub's hungry! There's bamboo on your map. Chop chop! Get it? Chop chop. |
| `h_shrine` | There's a clan you haven't met yet! It's on your map — go and say hi. |
| `h_ice` | Just Icewhisker left! Snowmantle's out on the frozen island. She's on your map. |
| `h_dojo` | The Dojo's on your map! Go and stand in the circle, and be the point. |
| `h_ball` | There's a dragon ball out there with your name on it. I marked it for you! |
| `h_torii` | Seven balls! Go to the big red gate and call the dragon. It's on your map! |
| `h_ryu_front` | Ryuuseki's waiting for you! Hop in the front seat. I marked him. |
| `h_ryu_back` | The back seat's free! Climb on behind the pilot and fire that beam! |
| `h_last` | Something's still standing! I put the nearest one on your map. Smash it! |
| `t_cub` | Still carrying a baby panda around? Aww, it's cute. It's also HUNGRY! There's bamboo on your map. |
| `t_maze` | Lost in the cave? Ha! Keep one paw on the wall and just follow it. Works every time. Mostly. |
| `t_jump` | Ha! You can't jump that high with only two jumps, silly! Shadowtail teaches the triple jump, over on the ash island. I marked it! |
| `t_slow` | Hellooo? Did you fall asleep? That quest isn't gonna do itself! |
| `trick_tease` | Finish my quests, then fight three rounds in the arena... and I'll teach you a secret goblin move. |
| `trick_ready` | You're ready! Come and find me in the town. I've got something sneaky to teach you. |
| `trick_teach` | Okay. Secret goblin move. Hold run, stand really still... and swing! That's the Goblin Sweep. Everything around you goes flying! |
| `hints_on` | Hints on! If you get stuck, I'll find you. Goblins always find you. |
| `hints_off` | Hints off! Big kitten. I'll be right here if you need me. |
| `last_ice` | Psst. Goblin secret! Icewhisker has a trick called Sense Mischief. It points right at the nearest thing still standing! Go and swear to her, out on the frozen island. I marked her on your map. |
| `last_ice2` | Icewhisker! Frozen island! She's STILL on your map. Go, go, go! |
| `last_mad1` | Are you serious with me? You already have the Sense Mischief ability! You know where you need to go! ... Snargle-blarg! Fizzwick-GRUNKLE-bonk! ... Hmph. That's goblin. Don't repeat it. |
| `last_mad2` | AGAIN?! Okay. Look. See the arrow? The big, pointy, floaty ARROW? It points at the mischief. That is its WHOLE JOB! ... Grrrrr... Blorka-snazz-FRAZZLE-flumph! ... Right. That's it. Goblin... SWEEEEP! |
| `last_mad3` | You AGAIN?! Nope. Nope, nope, nope! Zibble-GRONK! Goblin... SWEEEEP! |
| `last_swept` | And STAY swept! Follow the ARROW! ... Kittens. Honestly. I have a helmet to polish, you know. |

**The goblin is nonsense on purpose.** Richard asked for her to *"swear in
goblin speak (whatever that sounds like!)"*, and the audience is nine and
younger, so every "swear" is a made-up word that means nothing in any language.
The six `last_*` lines are the second batch. They were cast on the same Pixie
preset, and are as pending her approval as the first 39.

## What is saved

`p.payne` = `{met, hints, sweep, rounds, told, teased, lastAsks, iceTold, mad}`, in the cast row like
everything else a kitten owns, so a girl who leaves and comes back still knows
the Sweep. `cleanPayne` gives a blank ledger rather than a NaN for anything
malformed. The timers are deliberately **not** saved: a load is a fresh two
minutes, and that is what "stuck" means.

## The Dream Dojo section

Richard: "Let's update Payne's Quest List to show the Lionheart's Honor quest.
We can even add some voice lines from Payne about the Dream Dojo that she can
share with players. Maybe we should add a new section in Payne's navigation UI
specifically introducing the players to the Dream Dojo. Within that UI, there
can be an option to "view" the Dream Dojo where it shows the dojo and maybe
does a little introduction cutscene."

- **Her quest list** has a row for Lionheart's Honor (`DOJO_QUESTS`, marked
  `dojo: true`). It is outside her chain, because the chain is the afternoon in
  order and this quest is open to anybody at any time. It is not a tag-along
  either, because everybody can win it. **A late quest never shows as
  closed**: `questState` skips the 'closed' answer for `late` feats, so her
  list does not tell a kitten the door is shut after 100%, when it is not.
  Once her chain is settled, the open Dojo quest is the next thing she names
  (`payne_q_shadow`).
- **A new section on her card, THE DREAM DOJO.** It opens with `payne_dd_intro`
  and has three buttons that say what they do (`DOJO_ACTS`): **VIEW THE DREAM
  DOJO**, **MARK IT ON MY MAP** (`payne_dd_mark`) and **◀ BACK**. On a phone,
  the card uses the two-column `.pn-dd` grid and fits at 844×390.
- **VIEW** starts the tour (`DreamDojo.startTour`, the `TOUR` rows in
  `dream/stories.js`). Payne opens it and closes it, and Lionheart does the
  middle. Her five tour lines are spread into `PAYNE_LINES` from `TOUR`, so her
  card and the scene cannot say two different things. If somebody is in the
  simulator, the tour would disconnect them, so it refuses in words
  (`payne_dd_busy`) and the card stays open.

**A bug the browser found:** VIEW started the tour, *and* toasted "Can't show
you right now", *and* left her card open under it. The cause was
`g.dream.startTour?.() ?? 'not ready'`: success returns `null`, and `??` turned
that into a refusal. The check calls `choose(her, 'view')` both ways: a start
returns 'scene' with no toast, and a refusal returns 'payneDojo' with one.

All nine new lines are **pending Payne's approval**, like the rest.

## Open

- **Payne's approval** of her likeness and all 54 lines.
- **Nobody has played it.** The stuck timings (2 min, 35 s in a cave, four
  hops) are Richard's numbers or first guesses, not tuned by watching a kid.
- The alternative held pose (both hands on the helmet) is kept outside the repo
  in case Richard prefers it.
- More tricks. The chain is built so a second one is a row, not a system.

## After the ending, and the sweep while it recharges

- **The hints row goes away after the Awakening.** *"does having hint on/off
  do anything? If not, we should turn hints off and disable this option or
  remove it from Payne's menu."* It did nothing: every hint is a step of
  `nextStep`, and after the ending there is no next step. The row is removed
  rather than greyed out, because a row that does nothing reads as broken.
  `_watch` also writes the switch off, so a save taken after the ending does
  not carry a switch that is on and can never be reached.
- **A sweep still recharging is an ordinary swing.** *"the player should just
  do a normal slash as if they didn't have the ability."* It used to refuse
  with a blip and a "back in Ns" line, which in a fight is a press that throws
  nothing. `sweepCool` is now in the condition, so the press falls through to
  whatever it would otherwise have been.

## She lets go of a kitten who walks off, and does not say a thing twice

Richard: *"Payne is queuing up menu selection voices even though the player
already exited the menu, we should not queue up voice like that. We can queue
up voice between multiple people talking to her, but if the player stops
talking to her, should cancel that queue for the player that left. She should
not repeat herself, if she just said something to someone, she shouldn't
repeat the same thing again for the other player. If she says players
specific name, then that counts as a new voice speech and doesn't count as
being repeated."*

- **How the queue leaked.** A press at her card waits behind a sister's answer
  (`now` never cuts another kitten off). BYE is dropped outright while
  somebody else is being talked to, and it was dropped *before* it cleared the
  kitten's own waiting answers. START and the trade window never went through
  BYE at all. So an answer she had walked away from was said to nobody, after
  her sister's.
- **`Payne.leave(p)`** drops her waiting menu answers and stops one she is
  part-way through. Every way off the card calls it: `Inspector.closeOne` and
  `closeAll` both go through `_leftPayne`. What survives is a goodbye
  (`low`), a rant (`keep`, because her voice and complaints should finish),
  and a hint for her pane (`card`, which is about the world and not this
  menu).
- **"Just said" is `SAID_RECENTLY`, 30 seconds per clip.** A repeat at her
  card is shown on the asker's card for its reading time (`caption`) and never
  queued, so it cannot hold up a sister's answer that is not a repeat. A
  queued message that has become a repeat by the time its turn comes is
  filtered then. Her name clips (`payne_hey_*`, `payne_oi_*`) are never a
  repeat, so "Heyyy, Frost!" is said and the line after it is read. Lines with
  a cue (`after`, the sweep) are never filtered: the sweep lands on a word
  that has to be heard.
