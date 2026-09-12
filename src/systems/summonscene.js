import * as THREE from 'three';
import { Billboard } from '../core/gfx.js';
import { beatOver, TAIL, drawPortrait } from './cutscene.js';
import { FinaleTide } from './finaletide.js';
import { FinaleShow } from './finaleshow.js';

/* ---------------------------------------------------------------------------
   The two story beats of the dragon hunt.

   FOUND   fires the moment the seventh star is picked up, wherever the girls
           are standing. Patchfur tells them what they have and where to take
           it, which is the only thing standing between "I collected seven
           shiny balls" and knowing there is a dragon at the end of it.

   SUMMON  fires when somebody walks up to Ryuuseki for the first time. The sky
           goes dark across it and stays dark while he is in the world.

   BOTH ARE SKIPPABLE AND BOTH FIRE ONCE. Same rule as the shrine scenes and
   for the same reason — the second time is an obstacle between a kid and a
   dragon she has already been introduced to.

   THE SKY IS THE SCENE'S JOB, NOT THE DRAGON'S. `dusk` is driven from here and
   handed to the world every frame, so the darkening is tied to the moment
   rather than to a flag somebody might forget to clear. Ryuuseki leaving the
   world puts it back.

   AND THE FINALE HAS ITS OWN CHANNEL, `dawn`, which does the opposite and does
   not go back. The ending is the one moment the world is allowed to change and
   stay changed — see `start` and `World.setSky`.
--------------------------------------------------------------------------- */

const FADE = 0.5;
const TYPE_SPEED = 34;

/** How dark the sky goes when he is out, 0..1. */
export const DUSK_DEEP = 0.86;
/** Seconds the sky takes to fall, and to come back. Falling is slower. */
export const DUSK_FALL = 3.2;
export const DUSK_LIFT = 1.6;

/**
 * Seconds the sky takes to clear at the ending, and how far it goes.
 *
 * TWELVE, WHICH IS LONGER THAN ANY OTHER SKY CHANGE IN THE GAME AND IS MEANT
 * TO BE. The dusk falls in 3.2 because a dragon arriving is an event; this is
 * a morning coming up, and the finale's first two beats run about sixteen
 * seconds between them — so the change lands entirely inside Patchfur's first
 * two lines, slowly enough that a nine-year-old notices it happening rather
 * than noticing that it has happened. Cutting it to four was tried and reads
 * as a light switch.
 *
 * DEEP IS 1 AND NOT LESS. Unlike `DUSK_DEEP` there is nothing to hold back
 * for: the storm stops short of black so Ryuuseki still has a sky to be
 * enormous against, and there is no equivalent thing for a clear morning to
 * leave room for.
 */
export const DAWN_RISE = 12;
export const DAWN_DEEP = 1;

/* --- WHERE THE SPEAKER STANDS ---------------------------------------------
   THE INTRO'S COMPOSITION, VERBATIM, AND ONE DERIVED NUMBER. The opening
   cutscene parks whoever is talking 17 units in front of a 42° camera, 3.4
   right of centre and 5.2 down. Those offsets are what the picture IS and they
   are copied here unchanged — but 17 is not, because this scene's lens is 54°
   and the same distance frames a box a third bigger. She came out at 52% of
   the frame's height instead of 69%, which reads as a figure standing on the
   horizon rather than as the person talking to you.

   So the invariant is the FRAME, not the distance: the intro composes against
   a box 2 x 17 x tan(21°) = 13.05 world units tall, and `_parkStage` solves
   for whatever distance gives this camera the same one. Everything else is the
   intro's own numbers, and neither lens can be touched without the framing
   following it — including the sprite's own size, which is `9 / contentScale`
   in both scenes and therefore cancels.

   IT IS THE INTRO'S FRAMING ON PURPOSE. She opened the story standing on the
   right of the screen and she closes it standing in the same place; a kid who
   has seen the first scene knows what an old calico appearing over there means
   before she has said a word. */
const STAGE_FRAME = 2 * 17 * Math.tan((42 * Math.PI) / 360);
const STAGE_X = 3.4;               // where she settles, right of centre
const STAGE_FROM = 9;              // ...and where she slides in from
const STAGE_Y = -5.2;              // ...and how far down, so her feet are out
/** Seconds she takes to slide in. ONCE PER SCENE, NOT ONCE PER BEAT — see
 *  `sceneT` in `update`. */
const STAGE_IN = 0.9;

/* --- HOW SHE PERFORMS, WITH ONE DRAWING -----------------------------------
   There is exactly one Patchfur: `leader_elder.png`, a single front-facing
   cell, and there is no second pose without generating art. So the acting is
   done with the quad she has — a lean, a push toward the lens, a settle — one
   pair of numbers per beat, eased in over the beat's own clock.

   IT IS ANCHORED TO THE LINE, not distributed for variety. She leans in on the
   beat where she is telling them what they actually did, draws back and up on
   the beat where the world opens out behind her, and comes forward on the last
   one, where she is sending them somewhere. A performance that moved on a
   timer would be a fidget.

   THE NUMBERS ARE SMALL ON PURPOSE. `lean` is radians of roll and `push` is a
   fraction of her own height toward the camera; a flat drawing yawed or rolled
   far enough to notice as a MOVE reads as the drawing being wrong rather than
   as the character moving. Same argument as `FACE_BIAS_MAX` on the leaders.

   @see docs/notes/story.md */
export const BEAT_ACTS = [
  { lean: 0.000, push: 0.00 },   // "every barrel, every lantern" — she states it
  { lean: 0.045, push: 0.09 },   // "I think it is simpler than that" — leans in
  { lean: -0.05, push: -0.06 },  // "an angle, a circle" — draws back, opens out
  { lean: 0.030, push: 0.12 },   // "so stay, fly" — comes forward, sends them
];
/** Seconds a gesture takes to arrive. Slower than a beat's opening words, so
 *  the move is under the line rather than punctuating it. */
const ACT_IN = 1.8;

export const SCRIPTS = {
  found: [
    {
      id: 'balls1', who: 'Patchfur', sub: 'Calico',
      voice: '/voice/balls1.mp3',
      text: 'Seven stars. You found all seven. Nobody has held them together since before the islands broke apart.',
    },
    {
      id: 'balls2', who: 'Patchfur', sub: 'Calico',
      voice: '/voice/balls2.mp3',
      text: 'Take them to the great torii, both of you. And when the sky goes dark, do not run.',
    },
  ],
  summon: [
    {
      id: 'summon1', who: 'Ryuuseki', sub: 'The Wish That Waits',
      voice: '/voice/summon1.mp3',
      text: 'I am Ryuuseki. The wish that waits. Seven stars have called me out of the storm.',
    },
    {
      id: 'summon2', who: 'Ryuuseki', sub: 'The Wish That Waits',
      voice: '/voice/summon2.mp3',
      text: 'One of you will steer. One of you will burn. Alone, you may ride me. Together, you will light the whole sky.',
    },
  ],

  /* --- 100% mischief: the one ending the game has ---
     Fires when the last knockable thing in the world has been scored. Patchfur
     again, because she opened the story and the person who tells you what a
     place is should be the one who tells you what you did to it.

     IT IS NOT A "YOU WIN" SCREEN, AND THAT IS THE POINT. Nothing is taken
     away, no credits roll, the world is not reset — the last beat exists to
     say out loud that she can keep playing, because a nine-year-old who sees a
     completion screen reasonably concludes the game is over and stops.

     THE LAST BEAT SENDS THEM TO THE ARENA, and it speaks about it as a place
     that is open. Richard asked for that deliberately: the arena is the next
     thing being built, and the finale is the natural door into it — a
     tournament where the two of them stop knocking over furniture and find out
     which of them is the stronger fighter. **Until it exists, this line is a
     promise the game has made out loud to a nine-year-old**, which is a
     sharper kind of TODO than the rest of the list. If the arena slips, soften
     this line back to "there is a ring being marked out" rather than leaving
     her looking for a place she cannot find.

     WHY IT TALKS ABOUT ENTROPY. The maths in this game is not decoration — it
     has a walkable unit circle in it — and the mischief counter is the one
     number the girls have been watching all afternoon. Order is one
     arrangement of a town; every other arrangement is the rest of them, and
     they have been working through the rest of them with a katana. It is a
     real idea, said in words a nine-year-old can hold, and it is the honest
     reading of what they actually did rather than a moral bolted on at the
     end.

     RECORDED, like every other scene. Patchfur's preset voice is Mabel, the
     same one she uses for the intro and for `found` — a narrator who is
     ElevenLabs for seven lines and synthesised blips for the ending would make
     the ending sound like the part nobody finished. `dur` is still authored as
     a floor; `load()` grows it to the real clip length plus TAIL. */
  finale: [
    {
      id: 'done1', who: 'Patchfur', sub: 'Calico', voice: '/voice/done1.mp3', dur: 7.5,
      text: 'Every barrel. Every lantern. Every last cane of bamboo. There is nothing left standing on any of these islands that you two have not put your paws through.',
    },
    {
      id: 'done2', who: 'Patchfur', sub: 'Calico', voice: '/voice/done2.mp3', dur: 8.5,
      text: 'The elders called it mischief. I think it is simpler than that. A tidy town is only one way for a town to be. Every other way is the rest of them — and you have been counting your way through the rest of them all afternoon.',
    },
    {
      id: 'done3', who: 'Patchfur', sub: 'Calico', voice: '/voice/done3.mp3', dur: 8.5,
      text: 'The islands did not drift apart because something broke. They drifted because nobody was crossing between them any more. You crossed. An angle, a circle, and the nerve to jump — that is all a bridge has ever been.',
    },
    {
      id: 'done4', who: 'Patchfur', sub: 'Calico', voice: '/voice/done4.mp3', dur: 9.0,
      text: 'So stay. Fly. Knock it all down again tomorrow. And when you would rather test what you have learned on each other than on the furniture — the arena is open. Go and find out which of you is the strongest fighter on this world.',
    },
  ],

  /* --- MR. SATAN ANNOUNCES THE TOURNAMENT ---
     Fires thirty seconds after Ryuuseki has been summoned AND ridden. Both
     halves of that gate matter: the seven stars are the achievement, but a
     kid who has collected them and not yet climbed on has not seen the payoff
     yet, and interrupting her walk toward a legendary dragon to advertise a
     different feature is the worst possible moment for this. The thirty
     seconds let the flight happen first.

     HE IS THE ONLY VOICE IN THE GAME THAT IS NOT SINCERE. Patchfur narrates,
     the six leaders introduce themselves, Ryuuseki pronounces — all of them
     mean it. He is a showman selling tickets, and the tonal gap is what makes
     the tournament feel like a different kind of thing from the story the
     rest of the game tells. It is also cover: a game for a nine-year-old
     about her and her sister hitting each other needs the person proposing it
     to be ridiculous. */
  satanAnnounce: [
    {
      id: 'sat_ann1', who: 'MR. SATAN', sub: 'World Champion',
      voice: '/voice/sat_ann1.mp3', dur: 7.0,
      text: 'AHEM! Is this thing on? Citizens of the floating islands — it is I, MISTER SATAN! Strongest cat in the world, and yes, this magnificent moustache is absolutely real.',
    },
    {
      id: 'sat_ann2', who: 'MR. SATAN', sub: 'World Champion',
      voice: '/voice/sat_ann2.mp3', dur: 6.5,
      text: 'I have seen a green dragon as long as a street. I have seen two kittens climb on and ride it. And I thought — hoo hoo hoo! — those two need a proper stage.',
    },
    {
      id: 'sat_ann3', who: 'MR. SATAN', sub: 'World Champion',
      voice: '/voice/sat_ann3.mp3', dur: 7.0,
      text: 'So I am building one! The World Martial Arts Tournament returns! Knock this town flat, prove to me you are ready, and I will fly you there myself. Ho ho HO!',
    },
  ],

  /* --- AND OPENS IT, at 80% mischief ---
     The one moment the arena island actually appears in the sky. Short on
     purpose: everything that needed saying was said in the announcement, and
     what a kid wants at 80% is to go, not to be told again. */
  satanOpen: [
    {
      id: 'sat_open1', who: 'MR. SATAN', sub: 'World Champion',
      voice: '/voice/sat_open1.mp3', dur: 6.0,
      text: 'IT IS DONE! Every barrel, every lantern, every last cane of bamboo — and the arena is OPEN!',
    },
    {
      id: 'sat_open2', who: 'MR. SATAN', sub: 'World Champion',
      voice: '/voice/sat_open2.mp3', dur: 7.0,
      text: 'Come and find me in the town, both of you, together. Say the word, and my griffin will carry you to the ring. Ho ho ho hooo!',
    },
  ],
};

/* --- THE ENDING'S SHOT LIST ------------------------------------------------
   IT USED TO BE ONE MOVE, and then it was five. The finale opened wide on the
   archipelago and pulled further out, beat after beat, on the argument that
   separate zooms would read as separate cuts; the five-shot version fixed the
   scale but still gave each of Patchfur's four lines one place to look at.
   That is still not what the lines are. She names a barrel, a lantern and a
   cane of bamboo in one breath, and then an angle, a circle and the nerve to
   jump in another — six subjects in two sentences.

   SO IT IS A SHOT LIST, AND IT IS CUT TO THE WORDS. Each row is one shot: where
   the camera is, when it takes over, whether Patchfur is standing in front of
   it, whether it arrives through black, and what the STAGE is doing while it
   holds. Inside a shot the camera still turns and pushes in on its own clock,
   so no row here is a locked-off frame.

   `from` IS MEASURED OFF THE LINE, NOT TYPED. `say(beat, 'lantern')` is where
   that word falls in the sentence being spoken, as a fraction of it — so a shot
   meant to land on "bamboo" lands on "bamboo", and re-timing a line by
   rewriting it carries the cut along with the word instead of silently leaving
   it behind. It is not sample-accurate and does not need to be: the typewriter
   under the subtitle is paced the same way off the same text, so the cut and
   the word on screen agree with each other, and that agreement is the thing
   anybody watching can actually see.

   `at` IS A NAME, RESOLVED AGAINST THE WORLD at `start()` — never a literal.
   `dojoCentre`, `bridge` and `arenaRing` are published by `world/world.js` from
   the numbers those things are built from; `heap` is MEASURED as the tightest
   knot of knocked-over props, and `barrel`, `lantern` and `bamboo` are three
   specific objects found lying in the world by `_trio`. Every one of them falls
   back to the wide shot, so a scene built without a world still plays — ninth
   non-negotiable.

   `clear` MEANS THE ANGLE IS MEASURED, NOT TYPED. A barrel lying in a market
   square has stalls on three sides of it, and a camera 8 units out on a typed
   bearing spends a third of its takes looking at the back of a stall roof with
   the subject somewhere behind it. So a shot with `clear` set asks the world
   which way round the thing is actually visible from — `_clearAngle`, which
   measures against the same collision cylinders the players bump into — and
   `a` becomes an OFFSET from that bearing rather than a compass reading.
   Eighth non-negotiable in a new place: what you can see is the shot, and the
   only way to know what you can see is to measure it.

   `lift` IS HOW FAR UP THE FRAME THE SUBJECT SITS, as a fraction of the frame
   — and it is a fraction rather than a number of units because a number of
   units is only correct at one distance. The subtitle box owns the bottom
   two-fifths of the screen, so a subject on the optical centre is a subject
   resting on the box, and the lens is pointed BELOW the mark to raise it into
   the clear half. Written in units this was right for the shot it was tuned on
   and wrong three seconds later: `lift: 0.17` held the model of the
   archipelago beautifully at 40 units out and threw it off the top of the
   screen at 26. A fraction of the frame is the same picture at any distance,
   which is what the field is actually trying to say. Left out, a shot gets the
   old rule — a little above the ground on a close shot, so a heap has sky over
   it, and the world's own middle on a wide one.

   `cue` IS WHAT THE STAGE DOES, and `systems/finaleshow.js` owns almost all of
   it: the rings, the model of the archipelago on the Dojo floor, the little
   figures crossing it, the run over the real bridge, the ring at the end. The
   two exceptions are `heap-raise` and `heap-slam`, which are the WORLD moving
   and therefore belong to `FinaleTide`. A cue naming something that could not
   be built is a no-op, which is why the arena shot is safe on a world where
   the tournament has not opened yet.

   `fade` IS A CUT THROUGH BLACK, and there are exactly three: the crash to the
   Dojo, the Dojo to the real bridge, and the bridge to the arena. Each of those
   is a jump of hundreds of units to a place the previous shot could not see,
   which is the one case where a straight cut reads as a glitch. Everything else
   cuts hard on purpose. The black is DERIVED from this table rather than
   triggered — see `_cutBlack` — so it darkens on the way in as well as out.

   `stage` IS WHETHER PATCHFUR IS IN THE PICTURE, AND IT IS TRUE EXACTLY ONCE.
   She is a foreground cut-out nine units tall; parked in front of a close shot
   of a bridge she IS the bridge. The five-shot version had her walking on and
   off between subjects, which worked when a shot was a whole line long — the
   shortest one here is under a second, and a nine-foot calico sliding in and
   straight back out inside a second reads as a rendering fault rather than as
   a person. So she keeps the PORTRAIT BOX for the whole ending, which is the
   same argument Mr Satan's scenes already make, and takes the stage only for
   the last shot: the one line that is her talking to the two of them rather
   than pointing at something.

   @see docs/notes/story.md */

/**
 * Where a word falls in its own line, 0..1.
 *
 * READ OFF THE SCRIPT, so the shot list cannot drift away from the text it is
 * cut to. `tail` puts the cut at the END of the phrase instead of its start,
 * which is what a beat wants when the thing it is waiting for is the clause
 * finishing rather than beginning — the slam lands after "the rest of them",
 * not on "rest". A phrase that is not in the line comes back as 0 rather than
 * a negative: a cut in the wrong place is a blemish and a camera at a negative
 * fraction of a beat is a black screen.
 */
const say = (beat, phrase, tail = false) => {
  const t = SCRIPTS.finale[beat]?.text ?? '';
  const i = t.indexOf(phrase);
  if (i < 0) return 0;
  return Math.min(0.96, (i + (tail ? phrase.length : 0)) / t.length);
};

export const FINALE_SHOTS = [
  /* --- LINE 1: "Every barrel. Every lantern. Every last cane of bamboo." ---
     Asked for outright: "the camera should actually have a rotating shot on
     every one of those items and show them as it is being said, each one
     knocked over."

     THE ONE-FRAME VERSION WAS TRIED FIRST AND THE WORLD SAYS NO. "Would be
     good if all 3 of those items were close to each other... or find an area
     where there are the 3 items and have them in the framed shot." There is no
     such area. Measured, on a fully wrecked town: the tightest barrel-and-box
     pair in the world is 8 units apart and the nearest cane of bamboo to
     either of them is 32, because bamboo grows in a GROVE and furniture stands
     in a TOWN and the two are never in the same place. A shot wide enough to
     hold all three would be a shot in which none of them is bigger than a
     thumbnail, which is the exact failure this whole list exists to fix.

     SO IT IS THE OTHER THING THAT WAS ASKED FOR: "have the camera quick pan
     between each item as they are said". One close shot per word, each of them
     turning around its own object, with a ring closing on it as it is named.
     `_trio` still does the finding — it picks the tightest three it can, so
     the two that CAN be near each other are, and the cut between them is
     almost no move at all. */
  {
    beat: 0, from: 0, at: 'barrel', a: 0, dist: 8, high: 3.4, lift: 0.14,
    turn: 0.5, in: 0.12, clear: true, stage: false, cue: 'name-barrel',
  },
  {
    beat: 0, from: say(0, 'lantern'), at: 'lantern', a: 0, dist: 8, high: 3.4, lift: 0.14,
    turn: 0.5, in: 0.12, clear: true, stage: false, cue: 'name-lantern',
  },
  /* A CANE IS 8.5 UNITS LONG AND IT IS LYING DOWN, so this one stands further
     off and higher than the other two: framed like a barrel it would be a
     green line leaving the picture at both edges. */
  {
    beat: 0, from: say(0, 'bamboo'), at: 'bamboo', a: 0, dist: 14, high: 6, lift: 0.13,
    turn: 0.45, in: 0.1, clear: true, stage: false, cue: 'name-bamboo',
  },
  /* "...there is nothing left standing on any of these islands." Up and off the
     three of them, over the wreckage — and then out again, far enough that the
     archipelago is the frame. "Zoom out to show all the area and all the
     knocked over mischief, and also zoom out far enough at the end of the
     paragraph that we can see all or most of the islands in the shot." */
  {
    beat: 0, from: say(0, 'nothing left'), at: 'heap', a: 1.0, dist: 44, high: 25, turn: 0.5, in: -0.25,
    stage: false, cue: null,
  },
  {
    beat: 0, from: say(0, 'islands'), at: 'wide', a: 1.4, dist: 1.15, high: 0.66, turn: 0.3, in: -0.18,
    stage: false, cue: null,
  },

  /* --- LINE 2: "The elders called it mischief..." ------------------------
     "Before the line is spoken, we can just have the camera panning around and
     then ending by focusing on the area." So it opens still drifting over the
     world the last shot pulled out to, and comes down on ONE place. */
  {
    beat: 1, from: 0, at: 'wide', a: 2.2, dist: 1.1, high: 0.62, turn: 0.55, in: 0.1,
    stage: false, cue: null,
  },
  /* "I think it is simpler than that." — down on the heap, and it starts
     putting itself back together underneath the rest of the line. THE SAME
     PLACE EVERY TIME, which is what was asked for: by now every last thing in
     the world is over, so the deepest knot of it is wherever the deepest knot
     is, and it does not move between one playing and the next. */
  {
    beat: 1, from: say(1, 'simpler'), at: 'heap', a: 0.75, dist: 30, high: 15, turn: 0.45, in: 0.22,
    stage: false, cue: 'heap-raise',
  },
  /* "...every other way is the rest of them" — and over it all goes again, in
     a different direction this time. `tail` because the shove belongs at the
     END of that clause. */
  {
    beat: 1, from: say(1, 'Every other way is the rest of them', true), at: 'heap',
    a: 1.4, dist: 26, high: 12, turn: 0.5, in: 0.14,
    stage: false, cue: 'heap-slam',
  },
  /* "...you have been COUNTING your way through the rest of them." The word is
     the cut, exactly as asked — "we can transition the camera to be there when
     the word counting is said, to give time between the knocked over mischief
     and this new scene" — and the black over it is what covers the four hundred
     units between a town square and the Dojo. */
  {
    beat: 1, from: say(1, 'counting'), at: 'dojo', a: 2.1, dist: 46, high: 27, lift: 0.07,
    turn: 0.34, in: 0.12, stage: false, cue: 'dojo-run', fade: true,
  },

  /* --- LINE 3: the model of the world, on the floor of the Dojo -----------
     Every row here is one sentence of the ask, in its order, and the camera
     does not leave the Dojo for any of them: the MODEL is what acts. Cutting
     away from a thing that is itself moving would throw away the only shot in
     the game where the whole archipelago is small enough to watch at once. */
  /* THE MODEL FLOATS OVER THE PAINTED CIRCLE, so every one of these lifts it
     the same fraction of the frame — which is the whole reason `lift` is a
     fraction. These shots run from 40 units out to 26 as the camera pushes in,
     and one number of units would have been right for the first of them. */
  { beat: 2, from: 0, at: 'dojo', a: 2.4, dist: 40, high: 24, lift: 0.17, turn: 0.25, in: 0.14, stage: false, cue: 'isles-in' },
  { beat: 2, from: say(2, 'They drifted'), at: 'dojo', a: 2.75, dist: 38, high: 21, lift: 0.17, turn: 0.3, in: 0.12, stage: false, cue: 'isles-drift' },
  { beat: 2, from: say(2, 'You crossed'), at: 'dojo', a: 3.1, dist: 33, high: 17, lift: 0.17, turn: 0.3, in: 0.14, stage: false, cue: 'isles-cross' },
  { beat: 2, from: say(2, 'An angle'), at: 'dojo', a: 3.4, dist: 31, high: 16, lift: 0.17, turn: 0.22, in: 0.1, stage: false, cue: 'isles-angle' },
  { beat: 2, from: say(2, 'a circle'), at: 'dojo', a: 3.6, dist: 31, high: 16, lift: 0.17, turn: 0.22, in: 0.1, stage: false, cue: 'isles-circle' },
  { beat: 2, from: say(2, 'nerve to jump'), at: 'dojo', a: 3.8, dist: 28, high: 14, lift: 0.17, turn: 0.2, in: 0.12, stage: false, cue: 'isles-leap' },
  { beat: 2, from: say(2, 'all a bridge'), at: 'dojo', a: 4.0, dist: 26, high: 12, lift: 0.17, turn: 0.2, in: 0.12, stage: false, cue: 'isles-bridge' },

  /* --- LINE 4: the real bridge, then the ring ----------------------------
     "After they all jump to the bridge, can have a fade out and fade in from
     the Dojo to the actual bridge on the main world map... then when the lines
     'So stay. Fly.' we can have the camera fade in at the bridge and then show
     the players running together and jumping together."

     `a` IS ALONG THE DECK, not across it. The span is 18 units of arch on the
     x axis, so a camera at sin(a)=1 sits off its end and sees a bridge; one at
     right angles to that sees a red wall. */
  {
    beat: 3, from: 0, at: 'bridge', a: Math.PI / 2, dist: 22, high: 7, lift: 0.16,
    turn: 0.34, in: 0.12, stage: false, cue: 'bridge-run', fade: true,
  },
  /* "...the arena is open." */
  {
    beat: 3, from: say(3, 'arena is open'), at: 'arena', a: 0.7, dist: 40, high: 22, lift: 0.13,
    turn: 0.3, in: 0.3, stage: false, cue: 'arena-in', fade: true,
  },
  /* "...find out WHICH OF YOU is the strongest fighter ON THIS WORLD." — and
     out, off the ring, until the whole world is in the frame again. The line
     answers itself: the question is which of them, and the picture pulls back
     to the place they are going to settle it in.

     NOT ON "GO AND FIND OUT", WHICH IS THE OBVIOUS CUE AND IS TOO EARLY. It
     sits one clause after "the arena is open", which left the ring on screen
     for 1.2 seconds — and the ask for that shot was "fade in and zoom in on
     arena FOR A BIT and then on Mr. Satan with all the players teleported near
     him". A second and a bit is not a bit. Moving the cut one clause later
     gives the ring time to arrive and still leaves the pull-back four seconds,
     which is longer than the ending has ever held any other frame.

     THE ONE SHOT MEASURED IN ARCHIPELAGOS: `dist` and `high` are multiples of
     the world's own radius here and world units everywhere else, which is what
     lets one table hold a bridge 22 units away and a world 400 across. */
  {
    beat: 3, from: say(3, 'which of you'), at: 'wide', a: 0.95, dist: 1.34, high: 0.76, turn: 0.22, in: -0.12,
    stage: true, cue: 'out',
  },
];
/** Seconds she takes to walk out of the frame, and back into it. Slower than a
 *  cut, so the cut is the thing you notice and she is not. */
const STAGE_SWAP = 0.75;
/** How far out the mischief cluster is measured. A cart's width of a town
 *  square: big enough that a heap counts as one heap, small enough that the
 *  whole island is not one cluster. */
const HEAP_R = 9;
/** ...and how much of the world around that knot is allowed to join in when it
 *  stands back up. Wider than the knot itself, so the reconstruction fills a
 *  close shot instead of being six barrels in the middle of an empty square —
 *  and far narrower than the world, which is the whole point of it. */
const RAISE_R = 26;
/** Seconds of black on a cut that crosses the world, half of it either side.
 *  Short: it is a cut with a blink in it, not a scene change. */
const CUT_FADE = 0.34;


export class SummonScene {
  constructor({ scene, world, audio }) {
    this.scene = scene;
    this.world = world;
    this.audio = audio;
    this.active = false;
    this.script = null;
    this.beat = 0;
    this.played = {
      found: false, summon: false, finale: false,
      satanAnnounce: false, satanOpen: false,
    };

    /* WHAT IS BEHIND HER AT THE ENDING IS THE WORLD, AND IT MOVES.
       Every knocked-over thing on every island stands back up while she
       talks, holds, and goes over again — see `systems/finaletide.js`, which
       also explains why this replaced the four white line figures that used to
       be drawn here. It allocates nothing until the scene starts: it holds
       props that already exist. */
    this.tide = new FinaleTide(world);
    /* ...AND EVERYTHING THE WORLD DOES NOT ALREADY HAVE. The rings that close
       on the three things she names, the model of the archipelago on the
       Dojo's floor, the little figures that cross it and then cross the real
       bridge. It allocates nothing until the ending starts and takes all of it
       down again on `finish` — including the skip path. */
    this.show = new FinaleShow(scene);
    /* THE CRASHES ARE THE PROPS' OWN SOUNDS. `slam()` reports each one's
       `kind` as it lands and the wave's stagger is what spreads them out, so
       "ten or more bamboo being knocked over" arrives as a ripple rather than
       as one wall of noise. The tide cannot reach the audio engine itself —
       same rule as `entities/panda.js`, and for the same reason. */
    this.tide.onCrash = (kind) => this.audio?.play?.(kind === 'bamboo' ? 'bamboo' : 'hit', 0.7);
    /** The shot on screen, by identity, so a cut can be noticed exactly once. */
    this._shot = null;

    /** 0..1, how dark the sky is right now. Owned here, applied by the game. */
    this.dusk = 0;
    this.duskWant = 0;
    /** 0..1, how far the sky has cleared for the ending. Owned here for the
     *  same reason the dusk is: the sky belongs to the moment, not to a flag
     *  on an object somebody might forget to clear. */
    this.dawn = 0;
    this.dawnWant = 0;

    this.camera = new THREE.PerspectiveCamera(54, 16 / 9, 0.1, 4000);
    this._look = new THREE.Vector3();
    this.focus = new THREE.Vector3();

    /* THE SPEAKER'S CLOSE-UP, and the ending had nobody in it. Reported as
       "Patchfur's sprite is not appearing in the final cutscene but you hear
       her voice" — and it was not a missing sheet or a failed load: this scene
       was written to show the WORLD with her in the little portrait box, and
       the opening cutscene's stage character was simply never built here. Four
       beats of a voice with an empty sky under it is the one part of the game
       where a kid could reasonably think something was broken.

       One quad in a group of its own, parked in front of the camera every
       frame — the same grammar `Cutscene._setStage` uses, and deliberately the
       same single quad rather than one billboard per speaker: only one thing
       is ever on this stage. Added to the GAME's scene because that is what
       `_renderView(summonScene.camera)` draws. */
    this.stage = new THREE.Group();
    this.stage.visible = false;
    this.stageSprite = null;
    this.stageArt = null;
    this.scene?.add(this.stage);

    this.el = document.getElementById('cutscene');
    this.boxEl = document.getElementById('cs-box');
    this.nameEl = document.getElementById('cs-name');
    this.textEl = document.getElementById('cs-text');
    this.portraitEl = document.getElementById('cs-portrait');
    this.fadeEl = document.getElementById('cs-fade');
    this.barEl = document.getElementById('cs-progress');
  }

  /**
   * Preload every line that HAS one. Same discipline as the intro.
   *
   * Beats with `voice: null` are skipped rather than fed a null src — an
   * `<audio>` pointed at nothing resolves against the page URL and fetches the
   * document itself, which then fails to decode several seconds later. The
   * finale is authored that way today, so this is not a hypothetical.
   */
  async load() {
    /* EVERY SCRIPT IN THE TABLE, derived rather than listed. This was a
       hand-written list of three, and adding Mr Satan's two would have made
       it a hand-written list of three that silently skipped them — the
       scenes would still play, on their authored durations, cutting every
       line off mid-word, and nothing anywhere would report a problem. */
    const all = Object.values(SCRIPTS).flat().filter((b) => b.voice);
    await Promise.all(all.map((b) => new Promise((resolve) => {
      const el = new window.Audio();
      el.preload = 'auto';
      const done = (ok) => {
        if (ok && Number.isFinite(el.duration) && el.duration > 0) {
          b.el = el;
          b.voiceDur = el.duration;
          b.dur = el.duration + TAIL;
          b.typeRate = b.text.length / Math.max(0.6, el.duration * 0.72);
        } else {
          b.el = null;
          b.voiceDur = 0;
          b.dur = 7;
        }
        resolve();
      };
      el.addEventListener('canplaythrough', () => done(true), { once: true });
      el.addEventListener('loadedmetadata', () => setTimeout(() => done(true), 1500), { once: true });
      el.addEventListener('error', () => done(false), { once: true });
      setTimeout(() => done(Number.isFinite(el.duration)), 4000);
      el.src = b.voice;
    })));
    const n = all.filter((b) => b.el).length;
    console.log(`[voice] ${n}/${all.length} dragon-hunt lines recorded`);
  }

  /**
   * @param {'found'|'summon'} which
   * @param {THREE.Vector3} focus what the camera should be looking at
   * @param {number} [radius] how big the subject is, in world units.
   *        The summon shot is FRAMED OFF THIS rather than off a fixed
   *        distance. Ryuuseki's quad is about 60 units across — a hardcoded
   *        46, which is a perfectly good distance for a 13-unit storm dragon,
   *        put the camera inside him and filled the screen with a green wall.
   *        A shot of something enormous has to know it is enormous.
   */
  start(which, focus, radius = 30, art = null, cast = null) {
    this.radius = radius;
    if (this.active || this.played[which]) return false;
    this.played[which] = true;
    this.active = true;
    this.script = SCRIPTS[which];
    this.which = which;
    this.focus.copy(focus);
    this.beat = -1;
    this.fadeIn = FADE;
    this.el.classList.remove('hidden');
    /* THE FINALE SHOWS PATCHFUR; THE OTHER TWO SHOW NOBODY, and the difference
       is who the camera is on. `found` and `summon` frame a place or a dragon
       and the speaker is elsewhere, so a portrait would be furniture for its
       own sake. The finale is Patchfur talking directly to them over a shot of
       the world — she is the one thing NOT on screen, which is exactly when
       the little box earns its place and what every other scene she speaks in
       already does. */
    /* THE PORTRAIT SHOWS WHEN THE SPEAKER IS NOT ON SCREEN, which is the same
       rule the finale established and the reason Mr Satan gets one too. His
       shots frame the TOWN and then the arena — the places he is talking
       about — so he is the one thing not in the picture, and that is exactly
       when the little box earns its space. `found` and `summon` still show
       nobody: those already frame their own subject. */
    const showPortrait = (which === 'finale' || which === 'satanAnnounce' || which === 'satanOpen')
      && !!art;
    this.portraitEl.style.display = showPortrait ? '' : 'none';
    if (showPortrait) {
      drawPortrait(this.portraitEl, art, which.startsWith('satan') ? '#ffd24a' : '#e8c98a');
    }
    /* ...AND SHE STANDS ON THE STAGE AS WELL, for the finale only.
       THE PORTRAIT AND THE STAGE ARE NOT THE SAME DECISION, which is why this
       is a second test and not a second use of `showPortrait`. Mr Satan keeps
       the box and only the box: his shots frame the town and then the arena —
       the places he is selling — and a flat drawing of him standing in front
       of them for three beats is furniture. Patchfur's four beats are her
       talking directly to two kittens about what they did, and the wide shot
       behind her is the subject of the sentence rather than a thing being
       pointed at. `found` and `summon` still show nobody: they frame a place
       and a dragon, and the speaker is genuinely elsewhere. */
    this.sceneT = 0;
    /* SHE IS ON TO BEGIN WITH, AND `ease` IS WHAT WALKS HER IN. `stageOn` is
       the shot list's on/off and it opens at 1 because the first shot has her
       in it; the arrival slide is `sceneT`'s job and has been since the scene
       was written. Starting this at 0 as well would fade her in twice, at two
       different speeds. */
    this.stageOn = 1;
    this.stageWant = 1;
    /* WHERE THE FIVE SHOTS POINT. Resolved here, once, because the world is
       not going to move during the scene and because `_heap` walks every prop
       in it against every other one. */
    if (which === 'finale') this._markFinale();
    this._shot = null;
    this._setStage(which === 'finale' ? art : null);
    /* ...AND THE TIDE, for the finale alone. `found` and `summon` happen in
       the middle of the afternoon, with the girls standing in a town they are
       still working on; rewinding it under them would be the game undoing
       their work in front of them. The ending is the one moment the world is
       allowed to move like this, and even then only as a picture — see
       `FinaleTide.finish`. */
    if (which === 'finale') this.tide.start();
    else this.tide.finish();
    /* ...AND THE STAGE THE WORLD DOES NOT PROVIDE. `marks` is handed over
       rather than recomputed: the rings have to close on the same three props
       the camera is framing, and two independent searches for "a barrel near a
       lantern" would agree right up until the day they did not. */
    if (which === 'finale') {
      this.show.marks = this.marks;
      this.show.start(this.world, cast);
    } else this.show.finish();
    if (which === 'summon') this.duskWant = DUSK_DEEP;
    /* THE ENDING TAKES THE STORM DOWN AND PUTS A MORNING UP, and both halves
       matter. The finale fires at 100% mischief, which in a real run happens
       long after the dragon has been summoned — so the sky it opens on is
       Ryuuseki's black one, and Patchfur's four lines about what the girls
       have made of this place were being spoken over a thunderstorm.
       IT IS NOT PUT BACK WHEN THE SCENE ENDS. Every other scene's sky is
       borrowed and returned; this one is the world having changed, and
       changing back the moment the box closes would say the opposite of what
       the scene just said. Only a restart clears it — see `resetSky`.
       `clearDusk` is still what Ryuuseki leaving calls, and it deliberately
       does not touch the dawn: the dragon can come and go afterwards without
       taking the morning with him. */
    if (which === 'finale') {
      this.duskWant = 0;
      this.dawnWant = DAWN_DEEP;
    }
    this._next();
    return true;
  }

  _next() {
    this.beat++;
    if (this.beat >= this.script.length) { this.finish(); return; }
    const b = this.script[this.beat];
    /* THE LAST BEAT IS THE ONE THAT PUTS IT BACK, whichever number that is.
       Handed the script's own length rather than a constant, so a line added
       to the ending cannot leave the archipelago standing tidily at the end of
       a scene whose whole argument is that it does not stay that way. */
    /* THE TIDE IS NOT DRIVEN FROM HERE ANY MORE. It used to be: a middle beat
       meant the world stood up, the last beat meant it went over, and the last
       beat's index was handed in rather than typed so a line added to the
       ending could not leave the archipelago standing tidily. That was right
       for a scene whose picture was one continuous wave across four lines, and
       the ending is cut to words now — the reconstruction starts on "simpler",
       is finished by "the rest of them", and is a corner of one town rather
       than the whole sky. Beats are too coarse to say any of that, so the SHOT
       LIST says it instead and `_cue` is where it is said. `finish()` is still
       what puts the world back, on the skip path as much as the end. */
    this.t = 0;
    this.typed = 0;
    this.lineEndedAt = null;
    this.textEl.textContent = '';
    /* His gold, so the tournament reads as a different thread from the story
       the moment the box opens — the girls know a Patchfur scene from a
       Ryuuseki scene by its colour already. */
    const color = this.which === 'summon' ? '#ffe07a'
      : this.which.startsWith('satan') ? '#ffd24a' : '#e8c98a';
    this.nameEl.textContent = `${b.who}  ·  ${b.sub}`;
    this.nameEl.style.color = color;
    this.boxEl.style.setProperty('--cs-accent', color);
    this.voiceEl = this.audio?.speak(b.el ?? b.voice) ?? null;
  }

  /**
   * Point the one stage quad at an atlas, or take it off stage.
   *
   * The twin of `Cutscene._setStage`, down to `9 / contentScale`: that is the
   * figure's height in world units taken off the SHEET's own measurement of
   * how much of its cell the drawing fills, so a leader drawn small in her
   * cell is not silently shrunk on screen. Eighth non-negotiable — the size
   * comes off the loaded atlas, never off the file name.
   */
  _setStage(art) {
    if (!art) { this.stage.visible = false; return; }
    if (!this.stageSprite || this.stageArt !== art) {
      if (this.stageSprite) this.stage.remove(this.stageSprite);
      const quad = 9 / (art.contentScale || 1);
      this.stageSprite = new Billboard(art.texture, {
        cols: 1, rows: 1, width: quad, height: quad,
        footOffset: (art.pad ?? 0) * quad, mirror: false,
      });
      this.stageQuad = quad;
      this.stage.add(this.stageSprite);
      this.stageArt = art;
    }
    this.stage.visible = true;
  }

  /**
   * Resolve every shot's `at` into a world point, once, at the top of the scene.
   *
   * NOTHING HERE IS A LITERAL. `dojoCentre` and `bridge` are published by the
   * world from the numbers those things are built from; `mischief` is measured
   * off the props that are actually lying on their sides this afternoon. A
   * camera aimed at where the wreckage OUGHT to be is a shot of an empty field
   * the first time somebody rearranges the town.
   *
   * AND EVERY ONE OF THEM FALLS BACK TO THE WIDE SHOT. Ninth non-negotiable:
   * a scene built without a world (which is exactly how `world-check` builds
   * one) still plays, framed on the archipelago, rather than aiming a camera
   * at NaN and drawing the inside of somebody's head.
   */
  _markFinale() {
    const wide = this.focus.clone();
    const w = this.world;
    const trio = this._trio();
    const heap = this._heap();
    /* THE RING IS ONLY IN THE SKY IF THE TOURNAMENT IS OPEN. `arenaRing` is
       published whether or not the island has appeared, so the flag is what
       decides — and a finale played before Mr Satan has built anything gets the
       wide shot for that row instead of a camera pointed at empty air. It can
       happen: the scene viewer opens the ending on any world at all. */
    const ring = w?.arenaOpen && w?.arenaRing
      ? new THREE.Vector3(w.arenaRing.x, w.arenaRing.y, w.arenaRing.z)
      : null;
    this.marks = {
      wide,
      dojo: w?.dojoCentre?.clone?.() ?? wide.clone(),
      bridge: w?.bridge?.clone?.() ?? wide.clone(),
      /* ONE MARK PER WORD SHE SAYS, under the name of the word — so a reader
         of the shot list can see that the shot on "bamboo" is pointed at a
         cane of bamboo without going anywhere else to find out. `lantern` is
         whatever stood in for one; see `_trio`. */
      barrel: trio?.spots?.[0] ?? heap ?? wide.clone(),
      lantern: trio?.spots?.[1] ?? heap ?? wide.clone(),
      bamboo: trio?.spots?.[2] ?? heap ?? wide.clone(),
      /* ...AND THE SAME THREE AGAIN AS A LIST, which is what the rings in
         `FinaleShow` close on. The camera wants a place and the ring wants a
         size, and one Vector3 carrying both would have saved a line here and
         cost the next person an afternoon. */
      trioSpots: trio?.spots ?? null,
      heap: heap ?? wide.clone(),
      arena: ring ?? wide.clone(),
    };
    /* WHICH WAY ROUND EACH OF THEM IS VISIBLE FROM. Measured here, once, for
       the same reason the marks are: the world is not going to move during the
       scene, and `_clearAngle` walks every solid on the island for every
       bearing it tries. A mark with no measured bearing simply uses the shot's
       own `a`, which is what every shot did before this existed. */
    this.bearing = {};
    for (const sh of FINALE_SHOTS) {
      if (!sh.clear || this.bearing[sh.at] !== undefined) continue;
      /* MEASURED AGAINST THE SHOT'S OWN NUMBERS — its distance and the whole
         arc it is going to swing through — rather than against a typed pair
         here. The first version measured one bearing at one distance and the
         shot then turned 0.7 radians off it into the side of a house, which is
         a clear angle being measured correctly and then walked away from. */
      this.bearing[sh.at] = this._clearAngle(this.marks[sh.at], sh.dist, sh.turn);
    }
  }

  /**
   * Which way to stand to actually SEE something.
   *
   * THE EIGHTH NON-NEGOTIABLE, POINTED AT A CAMERA. A barrel in a market
   * square has stalls on three sides of it, and the first version of the
   * ending's opening shot typed a bearing and hoped — which came out, on a real
   * wrecked town, as eight seconds of the back of a stall roof with the thing
   * being named somewhere behind it. What you can see IS the shot, and the only
   * honest way to know what you can see is to go and measure it.
   *
   * IT MEASURES AGAINST THE SAME CYLINDERS THE PLAYERS BUMP INTO.
   * `world.solids` is every upright thing on the islands — houses, stalls,
   * trunks, shrine gates — as `{x, z, r}`, which is exactly the shape this
   * needs and is maintained by the world because the game already depends on
   * it. A second list of "things that block a camera" would be a second list
   * to forget to add to.
   *
   * SIXTEEN BEARINGS, BEST CLEARANCE WINS. Scored by how far the worst solid
   * sits off the line of sight, so a direction that merely grazes a stall
   * loses to one that is open — and if every direction is blocked (a barrel
   * inside a house, which the world does not build but a future one might) it
   * still returns the least bad one rather than nothing. Degrades rather than
   * vanishes.
   *
   * AND IT SCORES THE WHOLE SWING, NOT ONE BEARING. The shots that use this
   * turn while they hold, so the answer has to be a direction that is still
   * clear a quarter of a turn either side of itself. Measuring the middle
   * alone is how the first version came out pointing at an open barrel and
   * ended up inside the wall of a house three seconds later.
   *
   * @param {{x:number,z:number}} at the thing to be looked at
   * @param {number} dist how far back the camera will stand
   * @param {number} [sweep] how far the shot turns while it holds
   * @returns {?number} a bearing in the same convention the shot list uses
   *          (x = sin a, z = cos a), or null if there is nothing to measure.
   */
  _clearAngle(at, dist, sweep = 0) {
    const solids = this.world?.solids;
    if (!at || !solids?.length) return null;
    /* Only the ones that could possibly be in the way. The archipelago has
       hundreds and all but a handful are on other islands. */
    const near = solids.filter(
      (o) => Math.hypot(o.x - at.x, o.z - at.z) < dist + o.r + 2);
    if (!near.length) return null;
    /** How clear the view is from one bearing: the worst solid's gap. */
    const gapAt = (a) => {
      const cx = at.x + Math.sin(a) * dist;
      const cz = at.z + Math.cos(a) * dist;
      const dx = at.x - cx;
      const dz = at.z - cz;
      const len2 = dx * dx + dz * dz;
      let worst = Infinity;
      for (const o of near) {
        /* Distance from the solid's centre to the SEGMENT camera-to-subject,
           less its radius. Negative means the line goes through it. */
        const t = Math.max(0, Math.min(1, ((o.x - cx) * dx + (o.z - cz) * dz) / (len2 || 1)));
        const gap = Math.hypot(cx + dx * t - o.x, cz + dz * t - o.z) - o.r;
        if (gap < worst) worst = gap;
      }
      return worst;
    };
    let best = null;
    let bestScore = -Infinity;
    const STEPS = 16;
    for (let i = 0; i < STEPS; i++) {
      const a = (i / STEPS) * Math.PI * 2;
      const score = Math.min(
        gapAt(a - sweep / 2), gapAt(a), gapAt(a + sweep / 2)
      );
      if (score > bestScore) { bestScore = score; best = a; }
    }
    return best;
  }

  /**
   * A barrel, a lantern and a cane of bamboo — the tightest three in the world.
   *
   * THIS IS THE LINE'S OWN REQUIREMENT. "Every barrel. Every lantern. Every
   * last cane of bamboo" is three nouns in one breath and each of them gets a
   * shot, so each of them has to be a real object lying somewhere real. A
   * camera aimed at "where the barrels probably are" is a camera aimed at an
   * empty square the first time somebody rearranges the town.
   *
   * TIGHTEST, NOT NEAREST TO ANYTHING. Nothing depends on the three being
   * close any more — the grove settled that argument, see `FINALE_SHOTS` — but
   * picking the closest arrangement still costs nothing and buys the two cuts
   * that CAN be small. On a real wrecked town the barrel and the box come out
   * about eight units apart, so the first cut of the ending is a small move
   * and the second is a proper change of place.
   *
   * A LANTERN IS ALLOWED TO BE A BASKET OR A CRATE. Richard's own licence:
   * "if we dont have a lantern, we can find an item that is similar like a box
   * or fruit barrel". Lanterns are the rarest of the six kinds and a town can
   * genuinely have none within thirteen units of a grove; a shot that silently
   * became a shot of two things would be worse than a shot of a crate.
   *
   * THE RING SIZE IS MEASURED OFF THE PROP. A cane is 8.5 units long and lies
   * down; a lantern is 2.2 and does not. One typed radius would either lose the
   * bamboo inside its own ring or draw a hoop around a lantern big enough to
   * park a cart in.
   *
   * @returns {?{spots: Array}} null if the world has not got one of each,
   *          in which case all three shots fall back to the heap.
   */
  _trio() {
    const all = (this.world?.props ?? []).filter((p) => p?.knocked && !p.gone && p.group);
    if (all.length < 3) return null;
    const of = (kinds) => all.filter((p) => kinds.includes(p.kind));
    const want = [of(['barrel']), of(['lantern', 'basket', 'crate']), of(['bamboo'])];
    if (want.some((g) => !g.length)) return null;

    const far = (a, b) => Math.hypot(
      a.group.position.x - b.group.position.x, a.group.position.z - b.group.position.z
    );
    let best = null;
    /* WALKED FROM THE RAREST KIND OUTWARDS. Lanterns are the scarce one, so
       starting there is a few dozen comparisons rather than a few thousand —
       and this runs on the frame a scene opens that is about to hold for half a
       minute, so the cost is not the point; the bound is. */
    for (const mid of want[1]) {
      const pick = [want[0], want[2]].map((g) => {
        let near = null;
        for (const p of g) if (!near || far(mid, p) < far(mid, near)) near = p;
        return near;
      });
      if (pick.some((p) => !p)) continue;
      const spread = Math.max(far(mid, pick[0]), far(mid, pick[1]), far(pick[0], pick[1]));
      if (!best || spread < best.spread) best = { spread, props: [pick[0], mid, pick[1]] };
    }
    if (!best) return null;

    const spots = best.props.map((p) => {
      const at = new THREE.Vector3(p.group.position.x, (p.home?.y ?? 0) + 0.05, p.group.position.z);
      /* Half its longest side, and never smaller than the thing it is around.
         A knocked cane lies flat, so its 8.5 units of length are what the ring
         has to contain; an upright measurement would draw a hoop the width of
         a stick. */
      at.r = Math.min(4.5, Math.max(1.3, (p.height ?? 1) * 0.55, (p.radius ?? 0.6) * 2));
      return at;
    });
    return { spots };
  }

  /**
   * Where the mischief is piled deepest — the tightest knot of knocked-over
   * props in the world, and the centre of that knot.
   *
   * O(n²) OVER TWO HUNDRED THINGS, ONCE, on the frame a scene opens that is
   * about to run for half a minute. The obvious cheaper version — "use the
   * town centre" — is the thing this exists not to do: at 100% mischief the
   * deepest heap might be the bamboo grove, and the line being spoken over it
   * says "every last cane of bamboo".
   *
   * @returns {?THREE.Vector3} null if there is nothing down, which happens
   *          when the ending is opened from the scene viewer in a fresh world.
   */
  _heap() {
    const props = (this.world?.props ?? []).filter((p) => p?.knocked && !p.gone && p.home);
    if (props.length < 3) return null;
    let best = -1;
    let at = null;
    for (const a of props) {
      let n = 0;
      const c = new THREE.Vector3();
      for (const b of props) {
        if (Math.hypot(a.home.x - b.home.x, a.home.z - b.home.z) > HEAP_R) continue;
        n++;
        c.add(b.home);
      }
      if (n > best) { best = n; at = c.multiplyScalar(1 / Math.max(1, n)); }
    }
    return at;
  }

  /**
   * Which shot is on screen, and how far through its own clock it is.
   *
   * THE SHOT'S CLOCK, NOT THE BEAT'S. A line that carries two shots has to
   * give each of them a full push-in rather than handing the second one the
   * tail of the first's easing — otherwise the cut lands on a camera already
   * halfway through its move, which reads as a jump rather than as a cut.
   *
   * @param {number} beat zero-based
   * @param {number} k 0..1 through that beat
   */
  _shotFor(beat, k) {
    const mine = FINALE_SHOTS.filter((sh) => sh.beat === beat);
    /* THE WIDE SHOT IS THE FALLBACK, not an error. A script that grows a fifth
       line would otherwise have a beat with no shot at all; it gets the
       archipelago, which is the one framing that is right for any line. */
    if (!mine.length) return { shot: FINALE_SHOTS[FINALE_SHOTS.length - 1], s: k };
    let ix = 0;
    for (let i = 0; i < mine.length; i++) if (k >= mine[i].from) ix = i;
    const from = mine[ix].from;
    const to = ix + 1 < mine.length ? mine[ix + 1].from : 1;
    return { shot: mine[ix], s: Math.min(1, Math.max(0, (k - from) / Math.max(1e-4, to - from))) };
  }

  /**
   * Absolute seconds, from the top of the scene, at which a shot takes over.
   *
   * OFF THE SCRIPT'S OWN DURATIONS, so nothing in the cut plan is a second
   * typed twice. It is what `_cutBlack` darkens around and what tells the tide
   * how long the reconstruction has before the shove comes — "be standing by
   * the time she gets to `the rest of them`" is a sentence this can answer and
   * a constant cannot.
   */
  _at(sh) {
    const b = this.script?.[sh.beat];
    if (!b) return 0;
    let before = 0;
    for (let i = 0; i < sh.beat; i++) before += this.script[i].dur;
    return before + sh.from * b.dur;
  }

  /** ...and where we actually are, on the same clock. */
  _now() {
    let before = 0;
    for (let i = 0; i < this.beat; i++) before += this.script[i].dur;
    return before + this.t;
  }

  /**
   * How black the screen is for a cut that crosses the world.
   *
   * DERIVED FROM THE TABLE, NOT TRIGGERED BY THE CUT. A flag set when the shot
   * changes can only fade UP, because by the time it is set the new shot is
   * already on screen — and what was asked for is "a fade out and fade in from
   * the Dojo to the actual bridge". Measuring the distance to the nearest
   * fading cut gives both halves for free, and gives them whether the scene is
   * playing forward, has been nudged a beat on, or is being stepped a frame at
   * a time by `world-check`.
   */
  _cutBlack() {
    if (this.which !== 'finale' || !this.script) return 0;
    const now = this._now();
    let black = 0;
    for (const sh of FINALE_SHOTS) {
      if (!sh.fade || !this.script[sh.beat]) continue;
      black = Math.max(black, 1 - Math.abs(now - this._at(sh)) / (CUT_FADE * 0.5));
    }
    return Math.min(1, Math.max(0, black));
  }

  /**
   * A shot has taken over: tell the stage, and the world.
   *
   * ONE PLACE, CALLED ONCE PER CUT. `_shotFor` is asked on every frame and the
   * shots are stable objects out of the table, so identity is what says whether
   * this is a new one — a fraction compared against a fraction would fire twice
   * on the frame a beat rolls over.
   */
  _cue(shot) {
    this.show?.cue(shot.cue ?? null);
    if (shot.cue === 'heap-raise') {
      /* THE CORNER, AND ONLY THE CORNER. `only` narrows what MOVES and never
         what is HELD: every knocked prop in the world is still in the tide's
         list and still restored by `finish`, so the fourth non-negotiable does
         not notice this. What changes is that the reconstruction is a town
         square putting itself back together in front of you, which is a thing
         you can see from thirty units up, instead of two hundred objects
         spread over four hundred units, which is not. */
      this.tide.only(this.marks?.heap ?? null, RAISE_R);
      /* ...AND IT HAS EXACTLY UNTIL THE SHOVE. Measured between this shot and
         the one that knocks it all down again, rather than typed: re-time the
         line and the wave re-times itself. */
      const slam = FINALE_SHOTS.find((sh) => sh.cue === 'heap-slam');
      this.tide.raise(slam ? this._at(slam) - this._at(shot) : undefined);
    }
    if (shot.cue === 'heap-slam') this.tide.slam();
  }

  /** Who the Dojo's lesson is reading its angle from, or null for nobody.
   *  THE LESSON IS THE REAL ONE — see `FinaleShow.drivers`. The game asks this
   *  every frame and falls back to its players, so nothing changes outside the
   *  ending. First non-negotiable: the maths in the cutscene is the maths. */
  dojoDrivers() {
    return this.active && this.which === 'finale' ? this.show?.drivers?.() ?? null : null;
  }

  skip() { if (this.active) this.finish(); }

  /** ONE BEAT ON — the debug nudge. See `Cutscene.nextBeat`, which this is the
   *  twin of: same argument, same cut of the voice before the next line opens
   *  over the top of it. The finale is three beats and about a minute, so this
   *  is the difference between checking its last line in twenty seconds and
   *  checking it in one. */
  nextBeat() {
    if (!this.active) return false;
    this.audio?.stopSpeaking();
    this._next();
    return true;
  }

  finish() {
    this.active = false;
    this.script = null;
    /* SHE GOES WITH THE SCENE. The stage lives in the game's own scene graph,
       so a quad left visible is a nine-foot calico standing in mid-air over
       the archipelago for the rest of the session — and `skip` comes through
       here too, which is the path a kid who has seen it once actually takes. */
    this.stage.visible = false;
    /* ...and she is on again for whatever opens next. Every other scene leaves
       `stageWant` alone, so a finale that ended on a shot she was not in would
       otherwise hand the next scene a speaker who is already off the side of
       the frame. */
    this.stageOn = 1;
    this.stageWant = 1;
    /* AND THE WORLD GOES BACK EXACTLY AS IT WAS. `finish` is the skip path
       too, which is the one that matters: a kid who has seen this once presses
       Escape four seconds in, and what she gets back has to be the town she
       wrecked, on its side, to the last decimal. */
    this.tide.finish();
    /* ...AND THE STAGE COMES DOWN WITH IT, on the skip path as much as the
       end. Everything `FinaleShow` builds lives in the game's own scene graph:
       a model of the archipelago left behind on the Dojo floor would be there
       for the rest of the session. */
    this.show.finish();
    this._shot = null;
    this.el.classList.add('hidden');
    this.portraitEl.style.display = '';
    /* Clear the black. `#cs-fade` is SHARED with the opening cutscene and the
       shrine scenes, and this one ends on a fade-out — leaving it at full
       means the next scene to use the element opens on a black frame before
       its own first update overwrites it. Hidden is not the same as reset. */
    this.fadeEl.style.opacity = 0;
    this.barEl.style.width = '0%';
    this.audio?.stopSpeaking();
    this.voiceEl = null;
  }

  /** Sky back to sunset — called when Ryuuseki leaves the world.
   *  IT DOES NOT TOUCH THE DAWN. The dragon leaving is not the ending being
   *  undone; see the note in `start`. */
  clearDusk() { this.duskWant = 0; }

  /** Everything about the sky back to the opening state. RESTART ONLY — the
   *  dawn is permanent within a run and this is the one thing that unmakes it,
   *  for the same reason `_restart` un-meets every clan leader. */
  resetSky() {
    this.duskWant = 0;
    this.dusk = 0;
    this.dawnWant = 0;
    this.dawn = 0;
  }

  /**
   * Ease both sky channels toward their targets and hand them to the world.
   * Runs every frame, scene or no scene.
   *
   * IT APPLIES THEM ITSELF rather than returning a number for the game to
   * apply. It used to be `world.setDusk(scene.updateDusk(dt))` at two call
   * sites, which was fine while the sky had one channel and is a trap with
   * two: the finale drops the dusk and raises the dawn on the same frame, and
   * anything that forwards only one of them draws a storm-lit morning. One
   * call, both numbers, in the order `World.setSky` blends them.
   */
  updateSky(dt) {
    const rate = this.duskWant > this.dusk ? dt / DUSK_FALL : dt / DUSK_LIFT;
    if (this.dusk < this.duskWant) this.dusk = Math.min(this.duskWant, this.dusk + rate);
    else this.dusk = Math.max(this.duskWant, this.dusk - rate);
    /* One rate, both directions. Nothing in the game lowers the dawn — only
       `resetSky` does, and a restart wants it gone that frame, not eased. */
    const dRate = dt / DAWN_RISE;
    if (this.dawn < this.dawnWant) this.dawn = Math.min(this.dawnWant, this.dawn + dRate);
    else this.dawn = Math.max(this.dawnWant, this.dawn - dRate);
    this.world?.setSky(this.dusk, this.dawn);
    return this.dusk;
  }

  /**
   * Stand the speaker in front of the camera, in the intro's own composition.
   *
   * THE OFFSETS ARE DERIVED FROM THE LENS, NOT COPIED. The opening cutscene's
   * numbers (17 units out, 3.4 right, 5.2 down) were composed against a 42°
   * camera; this one is 54° and the same numbers put her a third smaller and
   * further from the edge. So they are carried as fractions of the frame
   * (`STAGE_FILL` and friends) and multiplied back up by the frame this camera
   * actually has, which also means neither FOV can be touched without the
   * framing following it.
   *
   * SHE IS PARKED, NOT PLACED IN THE WORLD. The finale's camera pulls back
   * until the whole archipelago is in shot — she would be a speck if she stood
   * anywhere in it — so she rides in front of the lens like a foreground
   * cut-out, which is exactly what the opening does and what makes both scenes
   * read as somebody talking to you over a view.
   */
  _parkStage(dt = 0) {
    if (!this.stage.visible || !this.stageSprite) return;
    const inT = Math.min(1, this.sceneT / STAGE_IN);
    const ease = 1 - (1 - inT) * (1 - inT);

    /* The distance that gives this lens the intro's frame. Solved rather than
       tuned: frame height at distance d is 2*d*tan(fov/2), so
       d = STAGE_FRAME / (2*tan(fov/2)). At 54° that is 12.8 units where the
       intro uses 17, and the drawing comes out the same size on screen. */
    const d = STAGE_FRAME / (2 * Math.tan((this.camera.fov * Math.PI) / 360));

    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    const right = new THREE.Vector3()
      .crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    /* ...AND SHE IS NOT IN EVERY SHOT. Three of the ending's five are ABOUT
       somewhere — a heap of barrels, the Dojo's circle, the red bridge — and a
       nine-unit cut-out parked in front of a close shot of a bridge IS the
       bridge. So `stageWant` is the shot's own flag and `stageOn` chases it,
       carrying her off the side of the frame and back on rather than blinking
       her out: she walks out of shot, which is a thing a person does, and the
       cut is left as the only thing the eye has to notice.
       IT MOVES HER ALONG THE SAME AXIS SHE ARRIVED ON — out to `STAGE_FROM`,
       the off-screen mark the whole composition is already written in terms
       of — so "off" is the same place for every shot and cannot drift. */
    const want = this.which === 'finale' ? (this.stageWant ?? 1) : 1;
    const rate = dt / STAGE_SWAP;
    this.stageOn = want > (this.stageOn ?? 1)
      ? Math.min(want, (this.stageOn ?? 1) + rate)
      : Math.max(want, (this.stageOn ?? 1) - rate);
    const onE = this.stageOn * this.stageOn * (3 - 2 * this.stageOn);
    const parked = STAGE_FROM + (STAGE_X - STAGE_FROM) * ease;
    const side = STAGE_FROM + (parked - STAGE_FROM) * onE;
    /* A slow breath, so a still drawing is not a still frame. The same trick
       and the same reason as the intro's — and slower, because this scene is
       four beats long and anything with a period a kid can count becomes the
       thing she is watching instead of the sky. */
    const bob = Math.sin(this.sceneT * 1.15) * 0.14;

    /* HER ACTING FOR THIS BEAT. Eased on the beat's own clock so it arrives
       under the line rather than on its first syllable, and applied to the
       PARKED distance rather than to `scale` — pushing her toward the lens is
       a step forward, and scaling her up is a drawing getting bigger. The two
       look different and only one of them reads as a person. */
    const act = (this.which === 'finale' && BEAT_ACTS[this.beat]) || null;
    const actK = act ? 1 - (1 - Math.min(1, this.t / ACT_IN)) ** 3 : 0;
    const near = act ? -act.push * (this.stageQuad ?? 9) * 0.5 * actK : 0;

    this.stage.position.copy(this.camera.position)
      .addScaledVector(fwd, d + near)
      .addScaledVector(right, side)
      .add(new THREE.Vector3(0, STAGE_Y + bob, 0));
    /* SQUARE TO THE LENS, AND THEN LEANED. It used to be neither: this
       scene's `faceCamera` is a no-op — "nothing on stage" was true when it
       was written — so the quad kept world orientation while the finale's
       camera climbed and turned through about sixty degrees across four
       beats. She was quietly foreshortening for the whole ending, worst on
       the last line, and it reads as her getting thinner rather than as a
       camera move. The intro yaws its speaker toward the camera; that is
       right for a level camera and not for one that ends up looking down.
       The lean is applied AFTER, so it is a roll in the picture rather than
       around a world axis that is no longer the one the viewer sees. */
    this.stage.quaternion.copy(this.camera.quaternion);
    if (act && actK > 0) this.stage.rotateZ(act.lean * actK);
    this.stageSprite.mat.transparent = true;
    /* SHE FADES AS SHE GOES, and the two are multiplied rather than chosen
       between: the arrival fade is the scene opening and the swap fade is her
       stepping out of a shot, and a scene that opened on a beat she is not in
       would otherwise pop her to full strength on the way out. */
    this.stageSprite.mat.opacity = ease * onE;
    this.stageSprite.mesh.visible = onE > 0.01;
  }

  update(dt) {
    if (!this.active) return false;
    this.t += dt;
    /* A SECOND CLOCK, AND IT IS THE WHOLE DIFFERENCE FROM THE INTRO. `t` is
       beat-local and resets four times; the opening cutscene slides its
       speaker in off that, which is right when every beat is a different
       character arriving. Four beats of the SAME calico sliding in from the
       right four times reads as a stutter. She arrives once. */
    this.sceneT = (this.sceneT ?? 0) + dt;
    this.fadeIn = Math.max(0, this.fadeIn - dt);
    const b = this.script[this.beat];

    /* The shot. FOUND looks down on the town from high and slides sideways —
       it is about a place you are being sent to. SUMMON is a low angle circling
       him, because the one thing the camera has to say is that he is enormous.
     */
    const k = Math.min(1, this.t / Math.max(0.001, b.dur));
    const ease = 1 - (1 - k) * (1 - k);
    const F = this.focus;
    if (this.which === 'summon') {
      /* Circling, from below. 1.55x his own size fits the whole creature with
         air around it; the dolly-in is a fraction of that rather than a fixed
         number of units, so the shot holds whatever he is scaled to. */
      const a = -0.6 + ease * 0.7 + this.beat * 0.9;
      const dist = this.radius * (1.55 - ease * 0.13);
      this.camera.position.set(
        F.x + Math.sin(a) * dist,
        F.y - this.radius * 0.22 + ease * this.radius * 0.1,
        F.z + Math.cos(a) * dist
      );
      this._look.set(F.x, F.y + this.radius * 0.06, F.z);
    } else if (this.which === 'finale') {
      /* THE SHOT IS THE ARGUMENT, AND THERE ARE FIVE OF THEM. It was one
         continuous pull-back; see the note on `FINALE_SHOTS` for why that was
         the wrong move for a scene in which she names four specific things and
         none of them was bigger than a few pixels. Inside a shot the camera
         still turns and pushes in on the shot's OWN clock, so nothing here is
         a locked-off frame; between shots it cuts, because the subject of the
         sentence has changed.

         THE LAST SHOT IS THE OLD ONE, and it is the only one measured in
         archipelagos: `dist` and `high` are multiples of `radius` there and
         world units everywhere else, which is what lets the same table hold a
         bridge 24 units away and a world 400 across. */
      const { shot, s: sk } = this._shotFor(this.beat, k);
      /* A CUT IS NOTICED HERE AND NOWHERE ELSE. Doing it on the frame the shot
         actually changes — rather than in `_next`, a beat at a time — is what
         lets one line carry seven of them. */
      if (shot !== this._shot) { this._shot = shot; this._cue(shot); }
      const se = 1 - (1 - sk) * (1 - sk);
      const P = this.marks?.[shot.at] ?? F;
      const wide = shot.at === 'wide';
      /* MEASURED BEARING PLUS THE SHOT'S OWN OFFSET, where there is one — so
         the three naming shots each look at their thing from a different side
         of the one direction it can be seen from at all. A mark with nothing
         measured falls straight through to the typed angle. */
      const measured = shot.clear && this.bearing?.[shot.at] != null;
      const base = measured ? this.bearing[shot.at] : 0;
      /* A MEASURED SHOT TURNS AROUND ITS BEARING RATHER THAN AWAY FROM IT.
         `_clearAngle` scored the whole arc as centred on what it returned, so
         starting the swing there and running a half-turn off one side would
         spend the back half of the shot in ground it never checked. Every
         other shot keeps the old behaviour: `a` is where it starts and `turn`
         is how far it goes. */
      const a = base + shot.a + shot.turn * (measured ? se - 0.5 : se);
      const dist = (wide ? this.radius * shot.dist : shot.dist) * (1 - shot.in * se);
      const high = wide ? this.radius * shot.high : shot.high;
      this.camera.position.set(
        P.x + Math.sin(a) * dist,
        P.y + high,
        P.z + Math.cos(a) * dist
      );
      /* WHERE IN THE FRAME THE SUBJECT SITS, and the subtitle box is why this
         is not simply "at it". The box owns the bottom two-fifths of the
         screen, so a barrel on the optical centre is a barrel resting on the
         box; a close shot therefore looks BELOW its subject to lift it into the
         clear half.

         SOLVED OFF THE LENS, LIKE THE STAGE'S DISTANCE IS. The frame is
         `2 * d * tan(fov/2)` units tall at the subject, so a lift of 0.17
         means 17% of whatever the camera can see from where it is standing —
         the same composition at 40 units and at 26, which a number of units is
         not. Where a shot says nothing, the old rule stands: a little above the
         ground on a close shot, so a heap has sky over it, and the world's own
         middle on a wide one. */
      const frameH = 2 * dist * Math.tan((this.camera.fov * Math.PI) / 360);
      const aim = shot.lift != null
        ? -shot.lift * frameH
        : (wide ? 0 : Math.min(4, high * 0.25));
      this._look.set(P.x, P.y + aim, P.z);
      this.stageWant = shot.stage ? 1 : 0;
    } else if (this.which === 'satanAnnounce' || this.which === 'satanOpen') {
      /* HIS SHOTS ARE ABOUT THE PLACE, NOT ABOUT HIM. He is a billboard
         standing in a town square and there is no framing of a flat drawing
         that carries three beats — so the camera does what he is actually
         doing: showing you somewhere. The announcement circles the town he is
         telling them to flatten; the opening circles the arena, which has
         just appeared in the sky and is the only thing either girl wants to
         look at. He speaks from the portrait box over the top of it.
         Slow and steady, continuous across beats, so three beats read as one
         move rather than three cuts. */
      const span = this.beat + ease;
      const a = 0.6 + span * 0.30;
      const dist = this.radius * (1.5 - span * 0.10);
      this.camera.position.set(
        F.x + Math.sin(a) * dist,
        F.y + this.radius * (0.52 - span * 0.05),
        F.z + Math.cos(a) * dist
      );
      this._look.set(F.x, F.y + this.radius * 0.06, F.z);
    } else {
      const a = 0.5 + ease * 0.35 + this.beat * 0.5;
      this.camera.position.set(
        F.x + Math.sin(a) * 66,
        F.y + 42 - ease * 6,
        F.z + Math.cos(a) * 66
      );
      this._look.set(F.x, F.y + 4, F.z);
    }
    this.camera.lookAt(this._look);
    this.camera.updateMatrixWorld(true);
    this._parkStage(dt);
    /* THE TIDE RUNS ON THE WORLD, SO IT DOES NOT CARE WHERE THE CAMERA IS —
       but it runs here, inside the scene's own update, because it is part of
       the scene and must not tick for a single frame outside it. The props it
       moves are drawn by the ordinary render, like everything else out there. */
    if (this.which === 'finale') {
      this.tide.update(dt);
      /* AND THE STAGE AFTER THE CAMERA, because every billboard in it squares
         itself to the lens and the lens moved this frame. A show updated before
         the camera is a scene of figures facing where the camera used to be —
         one frame behind, all the way through, and most visible on exactly the
         shots that swing fastest. */
      this.show.update(dt, this.camera);
    }

    // --- typewriter on the audio's playhead. See Cutscene.update.
    const clock = (this.voiceEl && b.voiceDur && this.voiceEl.currentTime > 0)
      ? this.voiceEl.currentTime
      : this.t;
    const want = Math.floor(clock * (b.typeRate ?? TYPE_SPEED));
    if (want > this.typed && this.typed < b.text.length) {
      this.typed = Math.min(b.text.length, want);
      this.textEl.textContent = b.text.slice(0, this.typed);
    }

    const before = this.script.slice(0, this.beat).reduce((s, x) => s + x.dur, 0);
    const total = this.script.reduce((s, x) => s + x.dur, 0);
    this.barEl.style.width = `${((before + this.t) / total) * 100}%`;
    const last = this.beat === this.script.length - 1;
    const fadeOut = Math.max(0, FADE - (b.dur - this.t)) / FADE;
    /* THREE BLACKS, AND THE DARKEST WINS: the scene opening, a cut that
       crosses the world, and the scene closing. Taking the maximum rather than
       choosing between them means a cut that lands near the end of the last
       line cannot brighten the screen on its way out. */
    this.fadeEl.style.opacity = Math.max(
      this.fadeIn / FADE,
      this._cutBlack(),
      last ? Math.min(1, fadeOut) : 0
    );

    if (this.lineEndedAt == null && this._lineFinished(b)) this.lineEndedAt = this.t;
    const started = !!this.voiceEl && this.voiceEl.currentTime > 0;
    if (beatOver(this.t, b.dur, this.lineEndedAt, started)) this._next();
    return this.active;
  }

  _lineFinished(b) {
    const el = this.voiceEl;
    if (!el || !b.voiceDur) return true;
    if (el.ended) return true;
    return el.currentTime > 0 && el.currentTime >= b.voiceDur - 0.06;
  }

  faceCamera() { /* nothing on stage */ }
}
