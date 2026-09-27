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
  solid r 0.85, a bouncing idle, and a bubble over her head: an invitation for
  a kitten who has not met her, then "Stuck? Need a hint?".
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
    Icewhisker's chevron already point at.

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
  - **75 s in a grotto** whose star is still there. The tease is the wall-hand
    trick.
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
  and a toast with the seconds left.
- **The spin is her facing turned twice around** over `SWEEP_SPIN`: the sprite
  sheet's eight directions make it read as a spin with no new art. Her own
  facing comes back at the end, and she is planted for it.
- **`sweepfx.js` is a poller** over `sweepSeq`, like crossfx and dodgefx. The
  ring grows to exactly the sweep's reach: the ring is the hitbox.
  *Found in the browser:* the rig was seeded with her current count on the
  frame of her first sweep, so that first sweep never drew. A check now pins
  it.

## The script

Pixie, `voice_id 0178ef57-ada4-43d9-992b-8d9221045bb4`. All 39 lines, in
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

## What is saved

`p.payne` = `{met, hints, sweep, rounds, told, teased}`, in the cast row like
everything else a kitten owns, so a girl who leaves and comes back still knows
the Sweep. `cleanPayne` gives a blank ledger rather than a NaN for anything
malformed. The timers are deliberately **not** saved: a load is a fresh two
minutes, and that is what "stuck" means.

## Open

- **Payne's approval** of her likeness and all 39 lines.
- **Nobody has played it.** The stuck timings (2 min, 75 s in a cave, four
  hops) are Richard's numbers or first guesses, not tuned by watching a kid.
- The alternative held pose (both hands on the helmet) is kept outside the repo
  in case Richard prefers it.
- More tricks. The chain is built so a second one is a row, not a system.
