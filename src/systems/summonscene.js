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
     a floor; `load()` grows it to the real clip length plus TAIL.

     `runs` IS WHERE SHE ACTUALLY SPEAKS, MEASURED OFF THE RECORDING. Each row
     is one unbroken run of speech: the first few words of it, the second it
     starts and the second it ends, read off the clip with
     `ffmpeg -af silencedetect=noise=-32dB:d=0.09` and nothing typed by ear.

     IT IS HERE BECAUSE COUNTING CHARACTERS IS A LIE, and the ending was cut on
     that lie for its whole first version. `say()` used to divide the index of
     a word by the length of the line, which assumes a narrator who speaks at
     one rate and never breathes. Patchfur does neither. Measured against the
     clips: "You crossed" sits at character fraction 0.568 of its line and is
     spoken at 7.94s of a 15.68s recording — 0.51 — so the cut arrived a full
     second after the words, and the padding below put another second on top of
     that. "It is as if this whole section is delayed by almost 2 seconds", and
     it was: 1.8s, measured, on that one cue.

     SO A WORD IS FOUND BY INTERPOLATING INSIDE ITS OWN RUN. Within a run she
     really does speak at a steady rate — that is what a run IS — so characters
     are a good ruler over two seconds of continuous speech and a terrible one
     over a sentence with three pauses in it. Every pause in every clip has a
     row here, which is what makes the ruler short enough to be honest.

     RE-RECORD A LINE AND THESE GO STALE. They degrade rather than vanish: with
     no `runs` at all `say()` falls straight back to the old uniform reading,
     which is roughly right and never NaN. `tools/world-check.mjs` pins every
     phrase in here against the text it claims to be quoting, so a typo in one
     of them is a failed check rather than a cut in the wrong place. */
  finale: [
    {
      id: 'done1', who: 'Patchfur', sub: 'Calico', voice: '/voice/done1.mp3', dur: 7.5,
      text: 'Every barrel. Every lantern. Every last cane of bamboo. There is nothing left standing on any of these islands that you two have not put your paws through.',
      clip: 10.16,
      runs: [
        ['Every barrel', 0, 1.00],
        ['Every lantern', 1.19, 2.14],
        ['Every last cane', 2.41, 4.35],
        ['There is nothing left', 4.92, 10.16],
      ],
    },
    {
      id: 'done2', who: 'Patchfur', sub: 'Calico', voice: '/voice/done2.mp3', dur: 8.5,
      text: 'The elders called it mischief. I think it is simpler than that. A tidy town is only one way for a town to be. Every other way is the rest of them — and you have been counting your way through the rest of them all afternoon.',
      clip: 15.28,
      runs: [
        ['The elders', 0, 1.52],
        ['I think it is simpler', 2.39, 4.01],
        ['A tidy town', 4.85, 7.92],
        ['Every other way', 8.27, 10.33],
        ['and you have been', 10.97, 13.89],
        ['all afternoon', 14.05, 15.28],
      ],
    },
    {
      id: 'done3', who: 'Patchfur', sub: 'Calico', voice: '/voice/done3.mp3', dur: 8.5,
      text: 'The islands did not drift apart because something broke. They drifted because nobody was crossing between them any more. You crossed. An angle, a circle, and the nerve to jump — that is all a bridge has ever been.',
      clip: 15.68,
      runs: [
        ['The islands did not', 0, 3.06],
        ['They drifted', 3.83, 7.00],
        ['You crossed', 7.94, 8.86],
        ['An angle', 9.61, 10.28],
        ['a circle', 10.49, 11.11],
        ['and the nerve to jump', 11.45, 12.87],
        ['that is all a bridge', 13.70, 15.68],
      ],
    },
    {
      id: 'done4', who: 'Patchfur', sub: 'Calico', voice: '/voice/done4.mp3', dur: 9.0,
      text: 'So stay. Fly. Knock it all down again tomorrow. And when you would rather test what you have learned on each other than on the furniture — the arena is open. Go and find out which of you is the strongest fighter on this world.',
      clip: 15.60,
      runs: [
        ['So stay', 0, 0.81],
        ['Fly', 1.22, 1.85],
        ['Knock it all', 2.30, 4.13],
        ['And when you', 4.75, 8.77],
        ['the arena is open', 9.38, 10.61],
        ['Go and find out', 11.50, 15.60],
      ],
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

   `from` IS MEASURED OFF THE LINE AND OFF THE RECORDING, NOT TYPED.
   `say(beat, 'lantern')` is where that word is SPOKEN, as a fraction of the
   clip — so a shot meant to land on "bamboo" lands on "bamboo", and re-timing
   a line by rewriting it carries the cut along with the word instead of
   silently leaving it behind. See `say`, and `beat.runs`, for why it is a
   fraction of the recording rather than of the text: counting characters put
   every cut in the second half of a line up to 1.8 seconds late.

   `from` IS A FRACTION OF THE SPOKEN CLIP AND `_from` PUTS IT ON THE BEAT.
   A beat is `voiceDur + TAIL` long — a second and a half of held frame after
   she stops talking, so the last words are not cut off by the next line
   arriving — and a fraction of THAT is not a fraction of the speech. It is the
   other half of the "delayed by almost two seconds" report, and it is worth a
   number: `TAIL` is 1.5s on a 15.3s clip, so a cue written at 0.65 of the line
   fired 0.98 seconds after the word it names. Everything in this table is
   written against the speech; `_from` is the one place that knows about the
   padding.

   `off` IS SECONDS, AND IT IS FOR TASTE AND NOT FOR TIMING. A cut that wants
   to land a little before or after the word it is cut to — the shove that
   Richard asked to come "about a second sooner" — says so in seconds here,
   rather than by having its `say()` quietly point at a different word. It
   survives a re-recording because it is relative to a cue that re-measures
   itself.

   `dolly` IS A PUSH THAT KEEPS ITS ANGLE. `dist` is the camera's distance out
   across the ground and `high` is how far above the mark it stands, and `in`
   only ever shrank the first of them — so every push-in in this table was
   really a CRANE, sliding down the hypotenuse and getting steeper the whole
   way. Nobody noticed while the pushes were small. On the one shot that closes
   by a third on a flat model of the world it came out as the map tipping into
   a plan view halfway through the line, which is what "zooming in somewhat
   strangely on the islands" was. With `dolly` set, `high` closes by the same
   fraction `dist` does, which is the definition of moving toward a thing
   rather than over it.

   `pan` IS A TRUCK AND NOT A SWING, and it is the one shot in this table that
   holds a fixed direction. `turn` moves the camera along an ARC around the
   mark, which at any distance also rotates what it is looking at — and that
   rotation is what "the camera is still moving too fast and rotating around a
   point, it would be better if the camera just pans slowly from left to right
   in a linear movement" is about. With `pan`, the camera AND its look-at slide
   together along the camera's own right vector, so the bearing never changes
   and the wreckage travels across the frame instead of swinging past it. The
   number is a fraction of the frame HEIGHT at the subject, like `lift` is, so
   it means the same composition at any distance; it is centred on the mark, so
   the shot starts left of it and ends right of it.

   `lin` IS A CAMERA THAT DOES NOT EASE. Every shot in here runs on
   `1 - (1 - s)²`, which arrives fast and settles — right for a cut that has to
   establish something in under a second, and wrong for a shot whose whole job
   is to be a steady move. "It should do a slower, smoother pan rather than a
   bigger movement with an ease-out, should be more linear movement."

   `keep` IS A CUE WITH NO CUT. A row with it fires its cue at the second it is
   written to and leaves the camera exactly where the previous row put it,
   still running that row's own clock — so the model of the world can begin
   fading in while the Dojo shot is still pushing in, and Mr Satan can raise his
   arms without the frame jumping. Without it, cueing anything mid-shot meant
   adding a row, and a row restarts the easing at zero: a duplicate of the shot
   it interrupts still reads as a jump, because the push-in snaps back.

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

   `face`, `span` AND `self` ARE WHAT THE MEASUREMENT IS TOLD. They only mean
   anything beside `clear`, and each of them exists because the crossing broke
   the plain version of it.

   `self` is how much of what is around the mark IS the mark. The bridge has
   eighteen railing posts standing on its own deck and every one of them lies on
   the sight line of every side-on view of it, so the honest answer to "which
   way round is this visible from" came back as "none of them, here is the
   least bad". Ten units of bridge is not an obstacle to a shot of the bridge.

   `face` and `span` are an arc to search instead of the whole compass. The
   clearest view of a bridge is from directly over its side, and from there a
   bridge is a red wall with nothing on it — the shot is ALONG the deck or it is
   not a shot of a crossing. `face` says which way the shot is about and `span`
   how far either side of it the measurement may go looking for air. Leave both
   out and it searches the circle, which is what the three naming shots want.
   NO ROW USES THEM TODAY: the crossing that taught the measurement all three
   went back to a typed bearing (see its row, and why). They are kept because
   what they fix is still true of any shot that names a thing to look at.

   `sky` IS WHERE THE MORNING STARTS. The ending takes Ryuuseki's storm down
   and puts a dawn up, and both used to begin on the scene's first frame — under
   three close shots of a barrel, a lantern and a cane, so most of the change
   was over before the camera was ever on a shot with sky in it. "Can we also
   have the 'sky changing' happening starting around this time, so that the
   players can see the sky changing from the previous sky to the new sky?" The
   row carrying `sky` releases the hold `start` puts on both channels, and
   `finish` releases it too, so an ending skipped before that line still ends
   in the morning. WHAT the sky will be is still decided when the scene is
   accepted — the seventh non-negotiable — and only WHEN it starts to show is
   cued.

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

   `fade` IS A CUT THROUGH BLACK, and there are exactly four: the two halves of
   the town square putting itself back together, the crash to the Dojo, the
   Dojo to the real bridge, and the bridge to the arena. Each of the last three
   is a jump of hundreds of units to a place the previous shot could not see,
   which is the one case where a straight cut reads as a glitch; the first is
   the one place the ending SKIPS time rather than distance, and it is a cut
   through black for the same reason a film cuts through black — what happens
   behind it is a stagehand's job. Everything else cuts hard on purpose. The
   black is DERIVED from this table rather than triggered — see `_cutBlack` —
   so it darkens on the way in as well as out.

   `fade` IS ALSO A LENGTH. `true` is the old blink, `CUT_FADE` end to end; a
   number is that many seconds of black, half of it either side of the cut. A
   blink is right for a jump the audience is not meant to dwell on and too fast
   for one that is covering a scene change.

   `dark` IS WHERE THE WAY DOWN STARTS, and it is a fraction of the line like
   `from` is. "At the end of 'I think it is simpler than that.' is where we
   should have the camera fade out. Then on the start of the words 'A tidy
   town', we can have the camera fade in." That is not a symmetrical blink —
   it is a long fade out on the end of one clause and a quick fade in on the
   start of another — and the only honest way to write it is as the two words
   it is pinned to. Left out, the fade is symmetrical and nothing changes.

   `stage` IS WHETHER PATCHFUR IS IN THE PICTURE, AND IT IS TRUE TWICE.
   She is a foreground cut-out nine units tall; parked in front of a close shot
   of a bridge she IS the bridge. The five-shot version had her walking on and
   off between subjects, which worked when a shot was a whole line long — the
   shortest one here is under a second, and a nine-foot calico sliding in and
   straight back out inside a second reads as a rendering fault rather than as
   a person. So she keeps the PORTRAIT BOX for the whole ending, which is the
   same argument Mr Satan's scenes already make.

   THE TWO SHOTS SHE STANDS UP FOR ARE BOTH LONGER THAN FOUR SECONDS, which is
   the rule that argument actually produces — it was never "once", it was "not
   inside a second". They are the slow push toward the heap that opens her
   second line ("we can have Patchfur appear temporarily before disappearing
   for the next part") and the last shot of all, the one line that is her
   talking to the two of them rather than pointing at something. Both end on a
   cut she is walked out of under cover of: the first into black, the last into
   the credits.

   @see docs/notes/story.md */

/**
 * Where a word is SPOKEN in its own line, as a fraction of the recording.
 *
 * READ OFF THE SCRIPT AND OFF THE RECORDING, so the shot list cannot drift
 * away from either the text it is cut to or the performance of it. `tail` puts
 * the cut at the END of the phrase instead of its start, which is what a beat
 * wants when the thing it is waiting for is the clause finishing rather than
 * beginning — the slam lands after "the rest of them", not on "rest". A phrase
 * that is not in the line comes back as 0 rather than a negative: a cut in the
 * wrong place is a blemish and a camera at a negative fraction of a beat is a
 * black screen.
 *
 * CHARACTERS ARE THE RULER AND THE PAUSES ARE THE MARKS ON IT. Dividing the
 * index of a word by the length of the line — which is what this used to do —
 * assumes a narrator who never breathes, and every pause in a clip pushes
 * every later cut earlier than the words. Measured, that error reached 1.8
 * seconds on "You crossed", which is the whole of the "this section is delayed
 * by almost two seconds" report. So the line is cut into the RUNS of speech
 * the recording actually contains (`beat.runs`, measured with ffmpeg) and a
 * character index is interpolated inside its own run, where a steady rate is
 * a fair assumption because an unbroken run of speech is exactly the thing
 * that has one.
 *
 * A BEAT WITH NO `runs` GETS THE OLD UNIFORM READING. Ninth non-negotiable: a
 * line that has not been measured yet must still be cuttable, roughly, rather
 * than throwing the whole ending at 0.
 */
export const say = (beat, phrase, tail = false) => {
  const b = SCRIPTS.finale[beat];
  const t = b?.text ?? '';
  const i = t.indexOf(phrase);
  if (i < 0) return 0;
  const c = i + (tail ? phrase.length : 0);
  const runs = b?.runs;
  const clip = b?.clip;
  if (!runs?.length || !(clip > 0)) return Math.min(0.96, c / Math.max(1, t.length));
  /* THE RUN THIS CHARACTER IS IN — the last one that starts at or before it.
     A character in a PAUSE (past the end of its run's text) belongs to the run
     before it and lands on that run's end, which is where the pause begins:
     `say(1, '...simpler than that.', true)` is the moment she stops talking,
     which is exactly what a fade-out wants. */
  let r = 0;
  for (let j = 1; j < runs.length; j++) {
    if (t.indexOf(runs[j][0]) <= c) r = j; else break;
  }
  const c0 = t.indexOf(runs[r][0]);
  const c1 = r + 1 < runs.length ? t.indexOf(runs[r + 1][0]) : t.length;
  const [, t0, t1] = runs[r];
  const f = Math.min(1, Math.max(0, (c - c0) / Math.max(1, c1 - c0)));
  return Math.min(0.999, Math.max(0, (t0 + f * (t1 - t0)) / clip));
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
  /* "...EVERY LAST CANE OF BAMBOO" IS A FOREST, NOT A CANE. "After the words
     'every lantern' then we should switch to the bamboo forest for when she
     says 'every last cane of bamboo'. Can show multiple of the bamboo for that
     part instead of just 1 bamboo, but can still be mostly zoomed in."

     The word is a plural and the first two are not: a barrel and a lantern are
     single objects and the third is a stand of forty. So this one is aimed at
     the GROVE — `world.groves`, the real ones the road leads to — and stands
     off far enough to hold a dozen canes lying across each other while staying
     close enough to read as bamboo rather than as a green patch. The ring
     still closes on one cane inside it, so the naming gesture is the same
     three times; see `_grove`, which is what picks the cane.

     AND IT RESTS AFTERWARDS. "Can have a slight pause at the end of the bamboo
     for rest time after the list of 3 items is finished." The recording
     already leaves 0.57s between "bamboo" and "There is nothing left"; the
     `off` on the next row adds not quite half a second more, so the third of
     three quick shots is the one that is allowed to breathe. */
  {
    beat: 0, from: say(0, 'bamboo'), at: 'grove', a: 0.4, dist: 21, high: 8.5, lift: 0.13,
    turn: 0.3, in: 0.16, clear: true, stage: false, cue: 'name-bamboo',
  },
  /* "...there is nothing left standing..." — ONE STEADY MOVE ACROSS THE
     WRECKAGE, and the only shot in the ending that does not ease.

     IT WAS A PULL-BACK AND THAT WAS THE WRONG SHAPE. "It should do a slower,
     smoother pan rather than a bigger movement with an ease-out, should be
     more linear movement and should just pan from left to right, showing the
     destruction on the island." An eased half-turn with `in: -0.25` on top of
     it does two things at once — it swings AND it retreats — and the eye reads
     the retreat, so the wreckage it is meant to be showing slides away instead
     of past. What is left is a truck: `lin`, a slow swing at a fixed distance,
     and barely any dolly at all, which at 82 units is the camera moving about
     twenty-five units sideways over the wreck of a town.

     AND IT IS THE TOWN IT TRUCKS ACROSS, NOT THE DEEPEST HEAP. "Can have the
     camera pan sideways slightly maybe starting by where the bridge or town
     center is, showing as much of the knocked over mischief in the frame,
     showing the entire destruction of the main island, does not need to be
     centered around the bamboo forest or anything."

     `heap` is MEASURED as the tightest knot of knocked-over props in the
     world, and on a fully wrecked archipelago that knot is the west bamboo
     grove every single time — forty canes inside fifteen units beats a market
     square hands down. It is the right answer to the question `_heap` asks and
     the wrong subject for this line, which is about a town. So this row asks a
     different question: `town` is the deepest knot of mischief IN THE TOWN,
     measured around `world.townCentre`, which is published off the same
     numbers the market is built on. The shot stands far enough back to hold
     the plaza and the roofs behind it rather than one corner of it.

     AND IT IS A TRUCK NOW, NOT A SLOW SWING. "For the part 'there is nothing
     left standing', the camera is still moving too fast and rotating around a
     point, it would be better if the camera just pans slowly from left to right
     in a linear movement." A `turn` of 0.3 at 82 units IS about 25 units of
     sideways travel — which is what the note under this row used to claim was
     "a truck" — but it is 17 degrees of rotation on top of it, and the eye
     reads the rotation. `turn` is zero here and `pan` does the move instead:
     the bearing is locked, the distance is locked, and the camera slides a
     third of a frame width across the wreck of a town. Nothing about the shot
     turns, which is what was asked for twice.

     AND THEN AT HALF THE SPEED. "For the part 'there is nothing left standing'
     let's have the camera move at half the speed, it moves too fast now." Half
     the `pan` across the same stretch of line is half the speed, and it is
     still centred on the mark, so the shot starts and ends a twelfth of a frame
     either side of the town instead of a sixth.

     `sky` — THE MORNING STARTS HERE. This is the first shot of the ending with
     any sky in it, so the storm is seen going rather than found gone. See `sky`
     on the table. */
  {
    beat: 0, from: say(0, 'There is nothing left'), off: 0.45, at: 'town', a: 0.62, dist: 82, high: 34,
    lift: 0.11, turn: 0, pan: 0.17, in: 0, lin: true, stage: false, cue: null, sky: true,
  },
  /* ...AND OUT, far enough that the archipelago is the frame. "Zoom out to show
     all the area and all the knocked over mischief, and also zoom out far
     enough at the end of the paragraph that we can see all or most of the
     islands in the shot."

     ON "ON ANY", NOT ON "ISLANDS". "It needs to show that part like a second
     earlier, around when the 'on any' words are spoken." Measured off the
     clip, those two words are 1.05 seconds apart in the reading — "on any of
     these islands" is a slow phrase — so this is exactly the second that was
     asked for, taken off the line rather than off a stopwatch.

     AND IT TAKES ITS TIME. "For the 'on any of these islands' can be a slower
     pan movement as right now, it feels a bit fast." It was an EASED pull-back
     - 1 - (1 - s) squared, which spends most of its travel in the first third
     - and that is what "fast" was: the same move, front-loaded. `lin` spreads
     it evenly and the swing and the dolly are both cut by about half, so the
     archipelago arrives rather than being flung at you. */
  {
    beat: 0, from: say(0, 'on any'), at: 'wide', a: 1.4, dist: 1.15, high: 0.66, turn: 0.16, in: -0.1,
    lin: true, stage: false, cue: null,
  },

  /* --- LINE 2: "The elders called it mischief..." ------------------------
     A SLOW PUSH TOWARD THE PLACE THE NEXT SHOT IS ALREADY IN. "For the 'The
     elders called it mischief' part, we can have the camera zoom in slowly
     towards the new section that will be in the next scene... For this zoom in
     part we can have Patchfur appear temporarily before disappearing for the
     next part."

     AND IT IS THE TOWN IT PUSHES OVER. "For the 'The elders called it
     mischief' part, we can focus on a more interesting part than just the
     bamboo forest, can show the town center and more of the destruction
     again." It was aimed at `heap`, and `heap` is the west grove on any world
     where everything is down — so the line about what the elders called this
     played over forty canes lying in a field. The town is the place with
     elders in it.

     SHE IS IN IT. Four and a half seconds is long enough for a foreground
     figure to arrive, be a person, and go; it is the length the argument
     against her walking on and off was always really about.

     AND SHE FADES OUT RATHER THAN LEAVING THROUGH BLACK. "We should have
     Patchfur fade out at the end of the scene, but let's remove the fade to
     black and then fade in on that part, it is not needed." There used to be
     most of a second of black over this cut, and what it was covering was the
     reconstruction being SET UP — `only()` and `raise()`, neither of which
     moves anything on the frame it is called. A curtain over a stagehand who
     is not carrying anything. `stageWant` drops to 0 on the next row, which is
     what walks her out; see `_parkStage`, where her opacity and her parked
     position ride the same scalar. */
  {
    beat: 1, from: 0, at: 'town', a: 0.3, dist: 118, high: 52, lift: 0.1,
    turn: 0.14, in: 0.42, lin: true, stage: true, cue: null,
  },
  /* "A TIDY TOWN IS ONLY ONE WAY FOR A TOWN TO BE." — and it is, again, in
     front of you: the reconstruction starts HERE rather than four seconds
     earlier under "simpler than that", because that is the sentence it
     illustrates. "Then on the start of the words 'A tidy town', we can have the
     camera fade in and show the mischief being put back in order."

     THE SAME PLACE EVERY TIME, which is what was asked for — and the place is
     now NAMED rather than measured. "For the part 'A tidy town is only' we
     should have a better section than just the bamboo forest with the blue sky
     background... I think the bamboo forest near the red bridge would work
     better, let's give that a try, as the big castle near the other bamboo
     forest is blocking the camera."

     Both of those are the same bug wearing two hats. `heap` finds the tightest
     knot of knocked-over props in the world and that is ALWAYS the west grove
     — thirty-six canes inside fifteen units — which is the one with the hall
     standing between it and every camera that can reach it, and which has
     nothing but sky behind it because it is on the island's western lip. So
     this row asks for the grove by the CROSSING instead: `grove` is the one
     nearest `world.bridge`, which has the road, the torii and the red arch in
     the background and a whole island behind that.

     THE CANES ARE ALSO THE BETTER RECONSTRUCTION. Forty of them going up in a
     ripple is a wave you can read from thirty units; six barrels in a square
     is six barrels. */
  {
    beat: 1, from: say(1, 'A tidy town'), at: 'grove', a: 0.75, dist: 34, high: 15, lift: 0.1,
    turn: 0.4, in: 0.22, stage: false, cue: 'heap-raise',
  },
  /* "...every other way is the rest of them" — and over it all goes again, in
     a different direction this time. `tail` because the shove belongs at the
     END of that clause.

     A SECOND SOONER, AND THEN IT RESTS. "We should have the mischief being
     knocked over at the end of the sentence 'every other way is the rest of
     them.' which should occur about a second sooner than it currently does.
     There needs to be a second or two camera rest and fade out before
     transitioning." Measuring the clause against the recording instead of
     against the character count took 0.74s off it on its own; `off` takes the
     last quarter. And the camera almost stops — a sixth of a turn and no dolly
     worth the name — because a shot that is still swinging while a town falls
     over is a shot about the camera. */
  {
    beat: 1, from: say(1, 'Every other way is the rest of them', true), off: -0.25, at: 'grove',
    a: 1.35, dist: 30, high: 13, lift: 0.1, turn: 0.16, in: 0.04, lin: true,
    stage: false, cue: 'heap-slam',
  },
  /* "...you have been COUNTING your way through the rest of them." The word is
     the cut, exactly as asked — "we can transition the camera to be there when
     the word counting is said, to give time between the knocked over mischief
     and this new scene" — and the black over it is what covers the four hundred
     units between a town square and the Dojo.

     AND IT GOES DARK BEFORE THE WORD, NOT AROUND IT. "Currently it just
     transitions right away and feels abrupt." A 0.34s blink centred on a cut
     gives the shot it is leaving about a sixth of a second of dimming, which
     is not a fade, it is a flicker. `dark` starts the way down where she picks
     the sentence back up after the shove — nearly a second of it — so the town
     lies still, darkens, and is gone. */
  {
    beat: 1, from: say(1, 'counting'), at: 'dojo', a: 2.1, dist: 46, high: 27, lift: 0.07,
    turn: 0.34, in: 0.12, stage: false, cue: 'dojo-run',
    fade: 1.1, dark: say(1, 'and you have been'),
  },
  /* ...AND THE WORLD BEGINS ARRIVING ON THE FLOOR BEFORE THE LINE IS OVER.
     "When the text 'all afternoon.' ends, that's when we should have the
     islands start to fade in and appear on the dojo as the player is still
     running around and slowly fading out, can have a few seconds of transition
     between the player running around the dojo and the holograms appearing."

     A `keep` ROW, so the Dojo shot keeps pushing in through it. The whole
     transition lives inside the beat's own TAIL — the second and a half of
     held frame after she stops talking — which is the one stretch of the
     ending with no words over it and is exactly where a two-second dissolve
     belongs. */
  {
    beat: 1, from: say(1, 'all afternoon', true), keep: true, cue: 'isles-wake',
  },

  /* --- LINE 3: the model of the world, on the floor of the Dojo -----------
     ONE SHOT. It was seven, one per clause, and every one of them re-seated the
     camera and restarted the push — which is a cut, however small the move is.

     "When stating 'The islands did not drift apart' and after that until the
     end of the Dojo section, there are about 7 camera cuts in this entire
     section, I think these camera cuts are unnecessary and very distracting. I
     think we can reduce this into just 1 smooth camera cut, rotating all the
     way around while the hologram is rotating."

     He is right, and the reason is that this beat is the one place in the
     ending where the SUBJECT moves. Everywhere else the world is lying still
     and the camera has to do the acting; here the model huddles, shakes, flies
     apart and is crossed, and cutting around a thing that is already moving
     throws the movement away. So the seven rows are now one camera and six
     `keep` rows — cues with no cut, which is exactly what that field is for.

     ALL THE WAY AROUND, AGAINST THE SPIN. `turn` is NEGATIVE here and it is the
     only row in the table that is. The model turns at 0.12 rad/s for the whole
     beat (`FinaleShow._stepModel`), so a camera orbiting the same way subtracts
     from its own movement and seventeen seconds of orbit come out as a third of
     a revolution. Counter-orbiting adds: 3.6 radians of camera against 2.0 of
     table is 5.6 relative, which is all the way around with a little to spare,
     and it is also the shot in which the near side of the model is always the
     side coming toward you.

     AND IT IS A DOLLY, NOT A CRANE. `dolly` closes `high` by the same fraction
     as `dist`, which is the difference between moving toward a thing and
     climbing over it; see the field's note in the header. Without it a push
     from 34 units to 22 at a fixed height tips a map into a plan view halfway
     through, which is what "zooming in somewhat strangely" was.

     BIG, AND IN THE MIDDLE. "The islands should be more at the center of the
     camera... they should take up at least 1/3 of the screen and be at least
     1/2 the screen when fully zoomed in on it. The camera angle is too above
     them all, should be rotated downward a bit more to see them better." The
     lift was 0.17 — seventeen per cent of the frame ABOVE the optical centre,
     which is how a subject ends up in the top third with its own shadow under
     it. Most of that existed to clear the subtitle box and the model is big
     enough now to be over the box rather than behind it, so 0.07 is the whole
     of what it needs.

     AND THEN A THIRD OF THE WAY IN AGAIN. "Why is the camera so zoomed out? I
     think we can be 25% or more zoomed in more, even if parts of the island are
     cut off after they are separated. Maybe have the camera a bit higher and
     more angled towards the action so that when the 'angle' and 'circle'
     section happens, we can still see the circle animation lines, even when we
     are zoomed in."

     MEASURED IN THE FRAME AND NOT IN UNITS. The model was projected into
     normalised device coordinates at seven points across the beat and asked how
     much of the picture it covered: at 34 units out it was 40 per cent of the
     frame's width through the middle of the shot, which is a map of an
     archipelago sitting in a large black room. At 23 it is between 56 and 70,
     which is a thing you are looking AT. The two other numbers move with it —
     23 and 18 is 38 degrees above the floor against 31, and `dolly` holds that
     angle for the whole push, so the steeper look is the shot rather than
     something that happens to it on the way in.

     AND STEEPER IS WHAT KEEPS THE WORKING IN FRAME. The circle is a cone of
     rings standing ON the model, so a shallow camera squashes it into a band of
     ellipses and a steep one draws it as circles — which is what the FIRST
     non-negotiable asks of it, and the reason that half of the ask is not a
     contradiction of the other half.

     AND THEN IT WAS AIMED AT THE ACTION, NOT AT THE MODEL. "Much of the action
     happens on the top 1/4th of the screen... the bottom 3/4th of the screen
     has not much action going on, so we should aim the camera mostly where the
     action is taking place." Measured, every drawn corner of the show had its
     median at 0.37 in NDC across the beat — well up the top half — and the
     circle's cone reached 1.57, off the top of the picture. That is the
     structure of the thing and not a bad number: the model is the FLOOR the
     action stands on, and the kittens, the angle and the cone all rise above
     it, so a lens aimed at the model's own middle puts the action at the top of
     the frame by construction. `lift` is NEGATIVE here, the only row where it
     is: the look point is above the mark rather than below it.

     CHOSEN BY SCORING A RECORDING, NOT BY EYE. One real playthrough of the beat
     was recorded — every drawn corner, sixty-nine moments — and a grid of rows
     was solved against it in the frame. This one puts the median at 0.08 on
     average, keeps the cone inside the frame to its 98th percentile, and starts
     the lens three units closer than it was. A fixed `in` of a quarter could
     not keep the cone in frame at the end of a closer push, so the push is
     smaller and starts nearer: closer for the whole beat, not just the end of
     it. */
  {
    beat: 2, from: 0, at: 'dojo', a: 2.4, dist: 20, high: 14, lift: -0.18,
    turn: -3.6, in: 0.16, dolly: true, lin: true, stage: false, cue: 'isles-in',
  },
  { beat: 2, from: say(2, 'They drifted'), keep: true, cue: 'isles-drift' },
  { beat: 2, from: say(2, 'You crossed'), keep: true, cue: 'isles-cross' },
  { beat: 2, from: say(2, 'An angle'), keep: true, cue: 'isles-angle' },
  { beat: 2, from: say(2, 'a circle'), keep: true, cue: 'isles-circle' },
  { beat: 2, from: say(2, 'nerve to jump'), keep: true, cue: 'isles-leap' },
  { beat: 2, from: say(2, 'all a bridge'), keep: true, cue: 'isles-bridge' },

  /* --- LINE 4: the real bridge, then the ring ----------------------------
     "After they all jump to the bridge, can have a fade out and fade in from
     the Dojo to the actual bridge on the main world map... then when the lines
     'So stay. Fly.' we can have the camera fade in at the bridge and then show
     the players running together and jumping together."

     IT LOOKS DOWN THE ROAD AGAIN, FROM BEHIND THE GATE. The pass before this
     one swung it square across the deck, on the argument that the side of a
     bridge is its arch. Wrong call, and said so twice: "can we have the camera
     angle like it was before? Just need to make sure it works well with the
     torii gate in the view", and then "should have the players running towards
     the camera like in the previous camera shot, but just have the camera
     zoomed out a bit to show the bridge and the torii gate."

     WHAT WAS WRONG WITH "BEFORE" WAS NEVER THE BEARING. The canes it looked
     past stood at every angle between upright and flat, because
     `FinaleTide.slam` never actually laid them down (see `FLAT_SLACK`). And
     22 units out at 7 up put the lens six units behind a gate four units tall:
     the top beam was a bar across the bottom of the frame with the gate's feet
     a third of a frame below the edge, and the swing of 0.34 carried it out of
     the left of the picture before the shot was half over.

     SO: EIGHT BACK, TWO UP, SAME ROAD. Solved in the frame rather than typed,
     with the top edge of the subtitle box as the floor of the picture: -0.22 in
     NDC in a small window, the worst case, because the box is a fixed height in
     pixels. At the cut the gate's feet stand on that edge, its top beam is at
     0.26 just under the near end of the deck (0.19), the crest is at 0.60, the
     far railing 0.70, and a kitten at the top of a double jump on the crest
     0.92. The gate frames the road onto the bridge and the four of them run
     down it at the lens and out underneath it — the old shot, with room.

     THE SWING IS SMALL. -0.1 rather than +0.34: a gate fourteen units from the
     lens crosses the frame three times faster than a bridge thirty units off,
     so the big swing that read as movement on the old shot is what walks the
     gate out of this one. `world-check` holds all eight of its corners in frame
     for the whole push.

     AND THE SEARCH THAT FOUND "BETTER" IS WRITTEN DOWN HERE ON PURPOSE. A grid
     of some twenty thousand rows scored only on what was in the frame chose,
     first, a three-quarter view half a radian off the deck, and then a lens a
     metre and a half up with the bridge pinned to the top edge. Both ticked
     every box and neither was the shot. The numbers can say what is in frame;
     which frame it is was the brief.

     AND THE WAY IN IS LONGER THAN A BLINK. "It should end at 'all a bridge has
     ever been.' with a slightly longer fade out and fade in on the next part."
     `CUT_FADE` is a third of a second end to end, which is right for a jump the
     audience is not meant to dwell on and too quick for the one place the
     ending changes subject: the model of the world goes out and the real one
     comes back. A second of it, and the four of them are already running when
     it lifts — see `FinaleShow._seedBridge`. */
  {
    beat: 3, from: 0, at: 'bridge', a: Math.PI / 2, dist: 30, high: 9, lift: 0.36,
    turn: -0.1, in: 0.08, stage: false, cue: 'bridge-run', fade: 1.0,
  },
  /* "...THE arena is open." — in on the first word of the clause, not on the
     third. "For the 'the arena is open' section, let's have camera fade into
     the arena sooner, as soon as 'the' is said." Measured, that is 1.44
     seconds earlier than where this cut was landing, and most of that was the
     padding rather than the choice of word.

     AND LOWER, AND CLOSER. "The camera angle can be better here, to show Mr.
     Satan and his standing area, or just a more dynamic 3D angle to show all
     the players and the arena." Forty units up at twenty-two high is a
     surveillance photograph of a ring; thirty at twelve stands in the ring with
     them, and half a radian of swing across three seconds makes it an angle
     rather than a diagram. */
  {
    beat: 3, from: say(3, 'the arena'), at: 'arena', a: 0.7, dist: 30, high: 12, lift: 0.15,
    turn: 0.5, in: 0.22, stage: false, cue: 'arena-in', fade: true,
  },
  /* "...is OPEN." — and his arms go up on the word, without the camera
     noticing. "Can show Mr. Satan standing with arms crossed for a few seconds
     and then with his arms raised upwards for the last few seconds, when the
     words 'arena is open' can have his arms raised up using the sprite
     'satan_charge.png'."

     ON "IS OPEN" RATHER THAN ON "ARENA", because "arena" is 0.27s after the
     fade-in starts and the crossed-arms pose would never be seen. This way he
     is standing there with his arms folded while the picture arrives, and the
     champion's pose lands on the word that means the thing.

     ON THE END OF IT, NOT THE START. "When in the Arena, the players and Mr.
     Satan should not do their excited animation until after the words 'the
     arena is open' is spoken, currently they are doing it about 2 seconds too
     early." `tail` moves the cue to where the clause FINISHES — 0.6s later on
     the recording — and `_seedArena` takes the rest of it off the other end by
     no longer dropping the four of them in on a jump frame; see
     `FinaleShow._stepArena`, where the arrival is now an arrival and the
     celebration is the celebration. */
  /* ...AND THE CHEER LANDS AFTER THE WORD, NOT ON IT. "For the Arena, we
     should delay everyone going into the cheering pose and playing the unlock
     sound by 0.5s or more as right now, it happens before the words 'the arena
     is open' is finished being said, it is okay if there is a slight delay
     before saying 'open' and then them cheering."

     `tail` already puts this at the end of the clause AS MEASURED OFF THE
     CLIP, and the clause it measures is "the arena is open" — but `say`'s map
     from characters to seconds is an even one, and "open" is the slowest word
     in the line. `off` is seconds, and seconds is what was asked for. It moves
     the fanfare with it: `_cue` plays `starfound` on this row, so one number
     delays the pose and the sound together rather than the two drifting apart.

     MR SATAN GOES FIRST AND THEY FOLLOW. "Let's also make Mr. Satan go into
     cheering pose first, and then a moment after, the players can cheer with
     him, maybe 0.1s or 0.2s after." That part is not a second cue — it is a
     lag inside this one, on the arena's own clock. See
     `FinaleShow._stepArena`. */
  {
    beat: 3, from: say(3, 'is open', true), off: 0.55, keep: true, cue: 'arena-raise',
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
     lets one table hold a bridge 22 units away and a world 400 across.

     AND THE RING GOES OUT THROUGH BLACK. "We should have a fade out and fade in
     at the end before the next section 'go and find out'." The way down is
     pinned to that phrase and the cut itself stays a clause later, which is
     what `dark` is for: a long leave on the end of one thought, a quick arrival
     on the start of the next. */
  {
    beat: 3, from: say(3, 'which of you'), at: 'wide', a: 0.95, dist: 1.34, high: 0.76, turn: 0.22, in: -0.12,
    stage: true, cue: 'out', fade: 0.8, dark: say(3, 'Go and find out'),
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
/** How far out of the town centre still counts as the town, when the ending
 *  goes looking for the deepest heap of mischief in it. Wide enough to hold the
 *  market, the main street and the houses either side of it; narrow enough that
 *  the bamboo grove out past the crossing cannot win. See `_town`. */
const TOWN_R = 44;
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
    /* QUIETER, AND NO TWO THE SAME. "It is a bit loud and robotic sounding (too
       metronomic)." Half the bangs and a jittered pick are `FinaleTide`'s half
       of that; this is the other half — 0.7 was loud enough to sit on top of
       the line she is speaking over it, and six identical hits at one level
       read as a sample being retriggered rather than as things falling over.
       A fifth either way is the difference between a barrel across the square
       and one at your feet. */
    this.tide.onCrash = (kind) => this.audio?.play?.(
      kind === 'bamboo' ? 'bamboo' : 'hit', 0.34 + Math.random() * 0.14);
    /* ...AND THE SAME DOOR FOR THE BRIDGE RUN. "When these abilities are being
       played, they should make some sounds, including jumping sounds." Every
       one of those names is a sound the GAME already makes for that exact move
       — see `FinaleShow._stepBridge` — so this is one line and no new library.
       The gain each one asks for is its own, because a landing and a Power Dive
       are not the same size of event; what this end owns is that they all go
       through `audio` and nothing in `finaleshow.js` ever holds it. */
    this.show.onSfx = (name, gain) => this.audio?.play?.(name, gain);
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
      /* ...AND HOLDS IT THERE UNTIL THE LINE THAT SHOWS IT. See `sky` on the
         shot table: the targets are set now, on acceptance, and the easing
         toward them waits for the row that carries `sky`. */
      this.skyHold = true;
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
    const grove = this._grove();
    const town = this._town();
    /* THE RING ON "BAMBOO" FOLLOWS THE CAMERA. The naming shots are three close
       shots with a ring of light dropped around the subject, and the third one
       is pointed at a GROVE now rather than at whichever cane `_trio` happened
       to find nearest a crate — which on a real world is thirty units away from
       the stand the camera is looking at, so the ring would have closed on
       nothing at all. `_grove` hands back a cane INSIDE its own knot, measured
       the same way `_trio` measures its three, so the gesture is identical and
       the thing it lands on is in shot. */
    if (grove?.spot && trio?.spots) trio.spots[2] = grove.spot;
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
      /* A FOREST, AND A TOWN — the two marks that exist because `heap` kept
         giving the honest answer to a question nobody was asking. See
         `_grove` and `_town`. */
      grove: grove?.at ?? trio?.spots?.[2] ?? heap ?? wide.clone(),
      town: town ?? heap ?? wide.clone(),
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
      if (!sh.clear) continue;
      /* KEYED BY THE MARK AND BY WHAT THE SHOT ASKED OF IT. Two rows can want
         the same place from deliberately different sides — the crossing wants
         to look ALONG its own deck and nothing else does — and a cache keyed by
         the mark alone would hand the second one the first one's answer. */
      const key = sh.face != null ? `${sh.at}@${sh.face.toFixed(3)}` : sh.at;
      if (this.bearing[key] !== undefined) continue;
      /* MEASURED AGAINST THE SHOT'S OWN NUMBERS — its distance and the whole
         arc it is going to swing through — rather than against a typed pair
         here. The first version measured one bearing at one distance and the
         shot then turned 0.7 radians off it into the side of a house, which is
         a clear angle being measured correctly and then walked away from. */
      this.bearing[key] = this._clearAngle(this.marks[sh.at], sh.dist, sh.turn, {
        self: sh.self, face: sh.face, span: sh.span,
      });
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
   * A SUBJECT IS NOT ITS OWN OBSTACLE — `self`. A barrel is a point and every
   * solid near it is in the way; a BRIDGE is eighteen units of deck with
   * eighteen railing posts standing on it, and every one of those posts lies on
   * the sight line of every side-on view of the thing they belong to. This
   * scored the whole compass negative and handed back the least bad of a set of
   * equally impossible answers. Anything inside `self` of the mark is the shot.
   *
   * AND A GROVE IS NOT FORTY SEPARATE MISSES — `world.groves`. The nearest cane
   * to a sight line can be nine units off it while the line still runs the
   * whole length of a twenty-unit stand of bamboo, because the gap this scores
   * is to the nearest CANE and a thicket is not made of its nearest cane. So a
   * grove is measured the way it is actually in the way: as a disc, by the
   * chord the sight line cuts through it. That is the bug the ending was
   * reported with — the crossing's camera stood 2.8 units inside a grove of 48
   * and the shot was a wall of bamboo — and it is invisible to a per-solid test.
   *
   * AND IT CAN BE TOLD WHICH WAY ROUND TO LOOK — `face` and `span`. Some shots
   * do not want the clearest bearing on the compass, they want the clearest one
   * WITHIN an arc: the crossing is a shot ACROSS the deck, a little off square,
   * because that is the angle the arch and four kittens strung out along it are
   * both readable from. `face` is the direction the shot is about and `span` is
   * how far either side of it the measurement may wander to find air. Without
   * them this searches the whole circle, which is what every shot that came
   * before wanted.
   *
   * AND WHERE A SHOT SAYS WHICH WAY IT WANTS TO LOOK, ENOUGH IS ENOUGH. The
   * plain rule is "most daylight wins", and with an arc to search that turns
   * into "go to whichever end of the arc is most open" every single time —
   * measured on the crossing, the clearance climbs steadily from 2 units at
   * 0.2 radians to 7.5 at 0.6 and then falls off a cliff into the grove, so
   * every arc containing 0.6 came back as 0.6 and the shot slid round until
   * the deck ran corner to corner through the subtitle box. Three units of air
   * either side of the sight line is the difference between a clear shot and a
   * shot with something in the corner of it; past that, more of it buys
   * nothing and the composition should decide. So clearance is capped at
   * `need` and the tie is broken by staying near `face` — clear enough, and
   * then as close to the angle the shot was written for as that allows. A shot
   * that named no `face` keeps the old rule exactly, which is the three naming
   * shots and every one of them wants the whole compass searched.
   *
   * @param {{x:number,z:number}} at the thing to be looked at
   * @param {number} dist how far back the camera will stand
   * @param {number} [sweep] how far the shot turns while it holds
   * @param {{self?:number, face?:number, span?:number, need?:number}} [opt]
   * @returns {?number} a bearing in the same convention the shot list uses
   *          (x = sin a, z = cos a), or null if there is nothing to measure.
   */
  _clearAngle(at, dist, sweep = 0, opt = {}) {
    const solids = this.world?.solids;
    if (!at) return null;
    const self = opt.self ?? 0;
    /* Only the ones that could possibly be in the way. The archipelago has
       hundreds and all but a handful are on other islands — and the ones
       standing ON the subject are the subject. */
    const near = (solids ?? []).filter(
      (o) => {
        const d = Math.hypot(o.x - at.x, o.z - at.z);
        return d > self && d < dist + o.r + 2;
      });
    /* THE THICKETS, separately, because they are scored differently. Only the
       ones a camera at this distance could stand in or shoot through. */
    const groves = (this.world?.groves ?? []).filter(
      (g) => Math.hypot(g.x - at.x, g.z - at.z) < dist + g.r + 4);
    if (!near.length && !groves.length) return null;
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
      /* AND HOW MUCH BAMBOO THE LINE GOES THROUGH. The chord of a disc, in
         units, charged one for one against the clearance — a sight line that
         crosses twelve units of grove is twelve units worse than one that
         crosses none, which is enough to lose to any open bearing anywhere on
         the compass. Half that was tried and lost: a clearance of 12 units on
         the open side of the crossing still beat a 25-unit penalty halved. */
      for (const g of groves) {
        const t = Math.max(0, Math.min(1, ((g.x - cx) * dx + (g.z - cz) * dz) / (len2 || 1)));
        const off = Math.hypot(cx + dx * t - g.x, cz + dz * t - g.z);
        if (off >= g.r) continue;
        worst -= 2 * Math.sqrt(g.r * g.r - off * off);
      }
      return worst;
    };
    let best = null;
    let bestScore = -Infinity;
    const STEPS = 48;
    /* SWEPT ACROSS THE ARC THE SHOT ASKED FOR, or the whole circle if it asked
       for nothing. Forty-eight steps rather than sixteen because an arc can be
       narrow: a quarter turn at sixteen-steps-to-the-circle is four samples. */
    const facing = opt.face != null;
    const face = opt.face ?? 0;
    const span = opt.span != null ? opt.span : Math.PI * 2;
    const need = opt.need ?? 3;
    for (let i = 0; i < STEPS; i++) {
      const a = face + (i / STEPS - 0.5) * span;
      const raw = Math.min(
        gapAt(a - sweep / 2), gapAt(a), gapAt(a + sweep / 2)
      );
      /* THE TIE-BREAK IS A THOUSANDTH OF A UNIT PER RADIAN, which is far too
         small to buy a bearing anything real and is exactly enough to settle a
         draw between two that are both clear enough. */
      const score = facing
        ? Math.min(raw, need) - Math.abs(a - face) * 1e-3
        : raw;
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
   * @param {?{x:number,z:number}} [near] only count what is within `r` of here,
   *        which is what `_town` uses to ask the same question about one place.
   * @param {number} [r] how far out that fence stands.
   * @returns {?THREE.Vector3} null if there is nothing down, which happens
   *          when the ending is opened from the scene viewer in a fresh world.
   */
  _heap(near = null, r = Infinity) {
    const props = (this.world?.props ?? []).filter(
      (p) => p?.knocked && !p.gone && p.home
        && (!near || Math.hypot(p.home.x - near.x, p.home.z - near.z) <= r)
    );
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
   * The bamboo grove by the crossing — where the camera goes for "every last
   * cane of bamboo", and where the town stands itself back up.
   *
   * NAMED OFF THE WORLD, NOT MEASURED. `world.groves` is the list the canes are
   * actually planted from, so this cannot drift from where the bamboo is; the
   * only choice made here is WHICH of them, and the answer is the one nearest
   * the red bridge. Asked for by eye and true for a reason: the west grove sits
   * on the island's lip with a clan hall between it and any camera that can
   * reach it, so its close shots are a wall with sky behind them. The east one
   * has the road, its own torii, the arch and a whole island behind it.
   *
   * AND IT HANDS BACK A CANE AS WELL AS A CENTRE. The shot wants the middle of
   * the stand; the ring of light wants one object to close on, sized off that
   * object. Those are two different things and a single Vector3 carrying both
   * would save a line here and cost the next reader an afternoon — the same
   * argument `trioSpots` already makes.
   *
   * @returns {?{at: THREE.Vector3, r: number, spot: ?THREE.Vector3}} null when
   *          the world has no groves, in which case the shots fall back to the
   *          single cane `_trio` found and then to the heap.
   */
  _grove() {
    const groves = this.world?.groves;
    if (!groves?.length) return null;
    const b = this.world?.bridge;
    const pick = b
      ? groves.reduce((a, g) => (
        Math.hypot(g.x - b.x, g.z - b.z) < Math.hypot(a.x - b.x, a.z - b.z) ? g : a))
      : groves[0];
    const ground = this.world?.heightAt?.(pick.x, pick.z);
    const at = new THREE.Vector3(pick.x, ground?.y ?? 0, pick.z);
    /* THE NEAREST CANE TO THE MIDDLE OF IT, which is the one guaranteed to be
       in frame however the clear-angle solve turns the camera. Knocked over
       and not retired, like every other subject in this scene: a cane still
       standing at the ending is a cane that cannot exist. */
    let spot = null;
    let best = Infinity;
    for (const p of this.world?.props ?? []) {
      if (p.kind !== 'bamboo' || !p.knocked || p.gone || !p.group) continue;
      const d = Math.hypot(p.group.position.x - pick.x, p.group.position.z - pick.z);
      if (d >= best) continue;
      best = d;
      spot = new THREE.Vector3(p.group.position.x, (p.home?.y ?? at.y) + 0.05, p.group.position.z);
      spot.r = Math.min(4.5, Math.max(1.3, (p.height ?? 1) * 0.55, (p.radius ?? 0.6) * 2));
    }
    return { at, r: pick.r ?? 16, spot };
  }

  /**
   * Where the mischief is piled deepest IN THE TOWN.
   *
   * THE SAME MEASUREMENT AS `_heap`, ASKED INSIDE A FENCE. `_heap` answers
   * "where is the deepest knot in the world" and on a fully wrecked
   * archipelago the answer is always a bamboo grove, because forty canes inside
   * fifteen units beats a market square and always will. That is the right
   * answer to that question and the wrong subject for two lines that are about
   * a town — "there is nothing left standing" and "the elders called it
   * mischief" both want roofs in the frame.
   *
   * `world.townCentre` IS THE FENCE, and it is published off the same numbers
   * the market stalls are built on rather than typed here. A town moved and a
   * camera left behind is exactly the failure `_markFinale` exists to prevent.
   *
   * @returns {?THREE.Vector3} null when there is no town or nothing down in it.
   */
  _town() {
    const c = this.world?.townCentre;
    if (!c) return null;
    return this._heap(c, TOWN_R) ?? c.clone();
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
    const last = FINALE_SHOTS[FINALE_SHOTS.length - 1];
    if (!mine.length) return { shot: last, s: k, cue: last };
    let ix = 0;
    for (let i = 0; i < mine.length; i++) if (k >= this._from(mine[i])) ix = i;
    /* A `keep` ROW IS A CUE AND NOT A CAMERA. It is the row whose CUE is live —
       so the stage hears it on the frame it is written to — while the framing,
       and the shot clock the framing is eased on, both walk back to the last
       row that actually cut. Sharing the previous row's object instead would
       have been simpler and would have meant the cue never fired: `_cue` knows
       a new shot by identity. */
    let ci = ix;
    while (ci > 0 && mine[ci].keep) ci--;
    let ni = ci + 1;
    while (ni < mine.length && mine[ni].keep) ni++;
    const from = this._from(mine[ci]);
    const to = ni < mine.length ? this._from(mine[ni]) : 1;
    return {
      shot: mine[ci],
      s: Math.min(1, Math.max(0, (k - from) / Math.max(1e-4, to - from))),
      cue: mine[ix],
    };
  }

  /**
   * A shot's `from`, as a fraction of its BEAT rather than of the speech.
   *
   * THE ONE PLACE THAT KNOWS ABOUT `TAIL`. Every `from` in the table is
   * measured against the recording — `say()` returns a fraction of the clip —
   * and a beat is the clip plus a second and a half of held frame. Multiplying
   * a fraction of the speech by the length of the beat is how every cue in the
   * back half of a line ended up around a second late, on top of the second
   * that counting characters was already costing.
   *
   * IT DEGRADES TO THE OLD BEHAVIOUR. A beat whose audio never loaded has
   * `voiceDur` 0 and a typed `dur` with no padding in it, so the spoken span
   * IS the beat and this returns exactly what it was handed.
   */
  _from(sh) {
    const b = this.script?.[sh.beat];
    if (!b) return sh.from ?? 0;
    const dur = Math.max(0.001, b.dur);
    const spoken = b.voiceDur > 0 ? b.voiceDur : dur;
    return Math.min(0.999, Math.max(0, ((sh.from ?? 0) * spoken + (sh.off ?? 0)) / dur));
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
    return this._atF(sh.beat, this._from(sh));
  }

  /** ...and the same thing for a bare fraction of a beat, which is what `dark`
   *  is. Split out so `_cutBlack` can ask "when does she stop saying THIS" of
   *  a phrase that has no shot of its own. */
  _atF(beat, f) {
    const b = this.script?.[beat];
    if (!b) return 0;
    let before = 0;
    for (let i = 0; i < beat; i++) before += this.script[i].dur;
    return before + Math.min(1, Math.max(0, f)) * b.dur;
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
      const at = this._at(sh);
      /* HALF EITHER SIDE, unless the table says otherwise. `fade: true` is the
         blink this started as; a number is a length in seconds. */
      const half = (sh.fade === true ? CUT_FADE : sh.fade) * 0.5;
      /* ...AND THE WAY DOWN CAN BE ITS OWN LENGTH, pinned to a word. A cut
         that is covering a scene change wants to leave slowly and arrive
         quickly, which is not a shape a single number can describe. */
      const down = sh.dark != null
        ? Math.max(0.08, at - this._atF(sh.beat, this._fromF(sh.beat, sh.dark)))
        : half;
      black = Math.max(black, 1 - Math.abs(now - at) / Math.max(0.01, now < at ? down : half));
    }
    return Math.min(1, Math.max(0, black));
  }

  /** `_from` for a bare fraction — the same map off the speech and onto the
   *  beat, without a shot row to read `off` from. */
  _fromF(beat, f) {
    const b = this.script?.[beat];
    if (!b) return f;
    const dur = Math.max(0.001, b.dur);
    const spoken = b.voiceDur > 0 ? b.voiceDur : dur;
    return Math.min(0.999, Math.max(0, (f * spoken) / dur));
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
    if (shot.sky) this.skyHold = false;
    if (shot.cue === 'heap-raise') {
      /* THE CORNER, AND ONLY THE CORNER. `only` narrows what MOVES and never
         what is HELD: every knocked prop in the world is still in the tide's
         list and still restored by `finish`, so the fourth non-negotiable does
         not notice this. What changes is that the reconstruction is a town
         square putting itself back together in front of you, which is a thing
         you can see from thirty units up, instead of two hundred objects
         spread over four hundred units, which is not. */
      /* AND IT IS THE SHOT'S OWN MARK, not a second name that has to be kept in
         step with it. This read `marks.heap` while the row it fires on was
         pointed at `heap` too, which was one edit away from a town rebuilding
         itself somewhere off screen — and that edit has now happened: the row
         is aimed at the grove by the crossing. A cue that reconstructs
         WHEREVER THE CAMERA IS cannot be pointed at the wrong place. */
      this.tide.only(this.marks?.[shot.at] ?? null, RAISE_R);
      /* ...AND IT HAS EXACTLY UNTIL THE SHOVE. Measured between this shot and
         the one that knocks it all down again, rather than typed: re-time the
         line and the wave re-times itself. */
      const slam = FINALE_SHOTS.find((sh) => sh.cue === 'heap-slam');
      this.tide.raise(slam ? this._at(slam) - this._at(shot) : undefined);
    }
    if (shot.cue === 'heap-slam') this.tide.slam();
    if (shot.cue === 'arena-raise') {
      /* THE SOUND OF A THING BEING UNLOCKED, on the word that unlocks it. "Can
         also play an 'unlocked' sound after it is said that it is open and the
         players rejoice."

         `starfound` IS ALREADY THAT SOUND IN THIS GAME. It is what plays when
         one of the seven stars is picked up — the full fanfare, arpeggio over
         a held fifth with a bell on top — so a kid hearing it here has heard it
         mean exactly this before, and the ending does not have to teach her a
         new noise in its last ten seconds. Inventing a ninth fanfare would have
         been a second vocabulary for one line.

         HALF VOLUME, BECAUSE SHE IS STILL TALKING. The cue lands on the END of
         "the arena is open" and "Go and find out" begins 0.89 seconds later,
         while the fanfare rings for about two; at full gain the bell sits on
         top of the last line of the game. */
      this.audio?.play?.('starfound', 0.45);
    }
  }

  /** Who the Dojo's lesson is reading its angle from, or null for nobody.
   *  THE LESSON IS THE REAL ONE — see `FinaleShow.drivers`. The game asks this
   *  every frame and falls back to its players, so nothing changes outside the
   *  ending. First non-negotiable: the maths in the cutscene is the maths. */
  dojoDrivers() {
    return this.active && this.which === 'finale' ? this.show?.drivers?.() ?? null : null;
  }

  /** Whether the Dojo should still draw its LIVE triangle, or only its island.
   *  A SECOND QUESTION FROM `dojoDrivers`, and the difference is the bug it
   *  fixes: no driver means the lesson turns itself, which under the model of
   *  the world is a diagram spinning the other way for no reason. Once the
   *  ending's runner is gone the diagram goes with her.
   *  @see FinaleShow.lessonLive */
  dojoLesson() {
    if (!this.active || this.which !== 'finale') return true;
    return this.show?.lessonLive?.() ?? true;
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
    /* ...AND THE SKY IS LET GO, so an ending skipped before its `sky` row still
       turns into the morning it promised rather than holding the storm. */
    this.skyHold = false;
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
    this.skyHold = false;
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
    /* HELD, NOT FROZEN AT A VALUE. The targets are already the morning; this
       only stops the sky moving toward them until the ending says so. */
    if (this.skyHold) {
      this.world?.setSky(this.dusk, this.dawn);
      return this.dusk;
    }
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
      const { shot, s: sk, cue } = this._shotFor(this.beat, k);
      /* A CUT IS NOTICED HERE AND NOWHERE ELSE. Doing it on the frame the shot
         actually changes — rather than in `_next`, a beat at a time — is what
         lets one line carry seven of them. It is the CUE row that is watched,
         not the camera row, so a `keep` row fires without moving the lens. */
      if (cue !== this._shot) { this._shot = cue; this._cue(cue); }
      /* EASED, OR NOT. `lin` is for the one shot whose job is to be a steady
         move rather than to arrive somewhere; see the note on the table. */
      const se = shot.lin ? sk : 1 - (1 - sk) * (1 - sk);
      const P = this.marks?.[shot.at] ?? F;
      const wide = shot.at === 'wide';
      /* MEASURED BEARING PLUS THE SHOT'S OWN OFFSET, where there is one — so
         the three naming shots each look at their thing from a different side
         of the one direction it can be seen from at all. A mark with nothing
         measured falls straight through to the typed angle. */
      const bkey = shot.face != null ? `${shot.at}@${shot.face.toFixed(3)}` : shot.at;
      const measured = shot.clear && this.bearing?.[bkey] != null;
      const base = measured ? this.bearing[bkey] : 0;
      /* A MEASURED SHOT TURNS AROUND ITS BEARING RATHER THAN AWAY FROM IT.
         `_clearAngle` scored the whole arc as centred on what it returned, so
         starting the swing there and running a half-turn off one side would
         spend the back half of the shot in ground it never checked. Every
         other shot keeps the old behaviour: `a` is where it starts and `turn`
         is how far it goes. */
      const a = base + shot.a + shot.turn * (measured ? se - 0.5 : se);
      const close = 1 - shot.in * se;
      const dist = (wide ? this.radius * shot.dist : shot.dist) * close;
      /* A DOLLY CLOSES BOTH, A CRANE CLOSES ONE. `in` only ever shrank `dist`,
         so every push in this table slid down the hypotenuse and got steeper as
         it went — invisible on a shot that closes by a tenth and, on the one
         that closes by a third onto a flat model of the world, the difference
         between moving toward the islands and climbing over them. */
      const high = (wide ? this.radius * shot.high : shot.high) * (shot.dolly ? close : 1);
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
      /* ...AND THEN THE WHOLE SHOT SLIDES SIDEWAYS, if the row asked for it.
         Applied to the camera AND the look-at, which is the difference between
         a truck and a pan-and-scan: move only the camera and it is an arc with
         extra steps. The right vector of a camera on bearing `a` looking at the
         mark is `(cos a, 0, -sin a)`; centred on `se - 0.5` so the mark passes
         through the middle of the frame at the middle of the shot. See `pan` on
         the table. */
      if (shot.pan) {
        const slide = (se - 0.5) * shot.pan * frameH;
        const rx = Math.cos(a) * slide;
        const rz = -Math.sin(a) * slide;
        this.camera.position.x += rx;
        this.camera.position.z += rz;
        this._look.x += rx;
        this._look.z += rz;
      }
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
