import * as THREE from 'three';
import { Billboard, DIR_SENSE } from '../core/gfx.js';
import { RECOLOUR_BANDS } from '../core/spritesheet.js';
import { Label } from '../core/label.js';
import { PLAYER_STYLE } from '../core/palette.js';
import { BLESS_STRETCH } from '../entities/player.js';
import {
  BIOMES, FOLIAGE, buildBamboo, buildBridge, buildHouse, buildTorii, buildTree,
  mergeParts, pagodaRoof, transformParts,
} from '../world/build.js';
import { poseQuad } from '../entities/critter.js';

/* ---------------------------------------------------------------------------
   WHAT THE ENDING DRAWS THAT THE WORLD DOES NOT ALREADY HAVE.

   `finaletide.js` is the archipelago itself, standing up and going over; this
   is everything else in the last four lines — the rings that pick out the three
   things Patchfur names, the little model of the whole world that assembles
   itself on the floor of the Dojo while she explains why the islands drifted,
   the kittens who cross the bridge at the end, and Mr Satan waiting in the ring.

   IT IS A COMPOSITE, NOT THE CAST. Every figure in here is a billboard this
   module owns, drawn from the same atlases the real kittens use. It would have
   been possible to fly the actual `Player` objects along these paths, and it
   would have been a mistake twice over: the ending would then depend on where
   four girls happened to be standing when it fired, and the fourth
   non-negotiable would be resting on this file putting four players back where
   it found them. Nothing here touches anything that exists outside the scene.
   `finish()` deletes the lot.

   THE ONE EXCEPTION IS THE MATHS, AND THAT IS THE POINT. The runner in the
   Dojo does not draw her own sin and cos: she is handed to `MathDojo` as its
   driver (`drivers()`), and the real lesson — the same radius, the same legs,
   the same board — reads her position exactly as it reads a nine-year-old's.
   A second, prettier, cutscene-only copy of that diagram would be the first
   non-negotiable broken in the one scene that is about it.

   THE MODEL IS THE REAL MAP, AND IT IS READ AND NOT COPIED. Every island is at
   its own coordinates, at its own radius, in its own biome's colours, with the
   real town's real footprints standing on it — houses, roads, shrines, the
   torii, the lanterns, the bridge — all taken off `world` rather than typed in
   here. That is the eighth non-negotiable applied to a hologram: the shape the
   girls see turning on the Dojo floor has to be the shape of the place they
   spent the afternoon in, or the lesson it is illustrating is about somewhere
   else. See `_buildModel` and `_isleDetail`.

   @see docs/notes/story.md, src/systems/summonscene.js (FINALE_SHOTS)
--------------------------------------------------------------------------- */

/** How big the model of the world is, across the Dojo floor. The painted
 *  circle is 24 units to the radius, so this sits comfortably inside it and
 *  the lesson's own lines stay readable underneath. */
const MINI_R = 16;
/** ...and how far above the floor it floats. High enough to read as a model
 *  rather than as paint, low enough that the circle is still behind it. */
const MINI_Y = 3.2;
/**
 * How much clear air is left between two huddled islands' rims, as a fraction
 * of the model's radius.
 *
 * THE HUDDLE USED TO BE A SCALE FACTOR AND THAT IS WHY THEY OVERLAPPED.
 * Multiplying every island's position by 0.17 pulls the far ones in much
 * harder than the near ones in absolute terms, and the six of them ended up
 * inside each other: "they seem to be all ontop of each other, it would be
 * better if their rims were slightly touching or near to touching, rather than
 * be colliding with each other." A distance cannot be solved by a scale
 * factor — it has to be PACKED, which is what `_huddle` does.
 */
const RIM_GAP = 0.012;
/** Seconds the drift takes, and how far past their marks they overshoot
 *  before settling. It is an explosion that calms down, not a slide. */
const DRIFT = 2.1;
const OVERSHOOT = 1.13;
/**
 * How much of the archipelago's real height stagger the huddle keeps, and how
 * much it has once it has drifted apart.
 *
 * "Can also include the height stagger that the islands have when having them
 * break apart, but can have it that they start next to each other, with just
 * very slight height differences between them, to represent them being mostly
 * connected." The real spread is 74 units of `baseY` from the town to the dusk
 * island; a twelfth of it is a lip you notice and cannot trip over, which is
 * what "mostly connected" looks like.
 */
const STACK_NEAR = 0.085;
const STACK_FAR = 0.62;
/**
 * A tiny kitten's drawn height in the model, and on the bridge.
 *
 * MEASURED AGAINST THE MODEL'S OWN HOUSES, not chosen. The scale factor comes
 * out around 1/19, so a real 2.9-unit kitten is 0.15 in the model and a house
 * is about 0.34 — and the first version drew her at 1.5, which put a cat ten
 * feet taller than the town she was hopping through. She is still four times
 * life size, deliberately: the whole shot is about being able to see her. Four
 * times reads as a mascot on a map, and twenty times read as a monster movie.
 */
const MINI_H = 1.0;
const REAL_H = 2.9;
/**
 * How long the model takes to arrive, and the Dojo runner to leave.
 *
 * "When the text 'all afternoon.' ends, that's when we should have the islands
 * start to fade in... can have a few seconds of transition between the player
 * running around the dojo and the holograms appearing... It is about a 2
 * seconds transition between the two scenes fading out and fading in." It is
 * ONE number for both halves on purpose: a cross-fade in which the two sides
 * run at different rates has a moment that is either empty or crowded.
 */
const WAKE = 2.0;
/**
 * How long the model takes to ARRIVE, and how long the Dojo runner stands
 * there watching it before she goes.
 *
 * THE WHOLE CROSS-FADE HAS TO FIT IN THE TAIL. `isles-wake` fires on the end of
 * "all afternoon." and the next line begins 1.5 seconds later — that is the
 * beat's own `TAIL`, the held frame after she stops speaking, and it is the
 * only stretch of the ending with no words over it. Two seconds of dissolve
 * does not fit in a second and a half, which is why the runner was still half
 * there when "The islands did not drift apart" began.
 *
 * "Maybe the player should stay on screen while the islands fade in, until the
 * islands are done fading out and when the text starts 'The islands did not
 * drift apart', can have the player fade out completely before that part
 * begins."
 *
 * So she HOLDS while the world arrives — she is watching it, which is the whole
 * picture — and then goes, and both are finished inside the tail: 0.5 + 0.6 is
 * 1.1 seconds against 1.5 available, and the model is up at 1.2.
 */
const MODEL_IN = 1.2;
const RUN_HOLD = 0.5;
const RUN_OUT = 0.6;
/**
 * How many tiny people and animals live in the model's main town.
 *
 * "We can show tiny players and animals in the main town slightly moving about
 * while it is stationary, can have about 10 - 20 people and 10 - 20 animals,
 * can also have a few animals on the other islands but have the animals/people
 * not crossing into the other islands, which is why the islands drifted."
 *
 * THAT LAST CLAUSE IS THE WHOLE REASON THEY EXIST. The line under this shot is
 * "they drifted because nobody was crossing between them any more", and a
 * model in which everybody is milling about inside one island's rim and nobody
 * is on the bridges is that sentence drawn rather than said. So the wander is
 * CLAMPED to the island each figure was born on — see `_stepFolk` — and it is
 * a rule rather than a coincidence of the numbers.
 */
const FOLK = 16;
const BEASTS = 14;
/**
 * The mini-bridges' deck: how wide it is, how thick a plank is, how many
 * planks a span is cut into, and how far into the drift the last of them has
 * let go.
 *
 * THE WIDTH IS WHY THEY WERE INVISIBLE. The first version was a tube of radius
 * `MINI_R * 0.004` — six hundredths of a unit, which from twenty-six units out
 * through a 54 degree lens is one pixel, and one pixel of gold is a yellow
 * line. Six per cent of the model's radius is about the width of a house in
 * the same model, which is roughly what a bridge is.
 *
 * FOURTEEN PIECES IS ENOUGH TO BEND AND FEW ENOUGH TO BREAK. Below about ten
 * the bow reads as a chain of straight segments; above twenty the individual
 * pieces are too small to see fall, which is the whole point of breaking it.
 *
 * `BR_SNAP` IS A FRACTION OF THE DRIFT, NOT SECONDS. The islands take `DRIFT`
 * to separate and the bridges have to be gone well inside that; a sixth of it
 * puts the break in the first third of a second and leaves the rest of the
 * move to the islands, which is the thing the shot is actually about.
 */
/* AND THEN IT WAS A MOTORWAY. "The bridges connecting the islands are too big
 * and they seem to be upside-down or sideways." Six per cent of `MINI_R` is
 * 0.96 units of deck — MEASURED against the things standing beside it, that is
 * wider than the widest house in the model is wide (0.72) and twice as wide as
 * a street house (0.53), on an island 5.0 across. The comment that used to
 * stand here claimed it was "about the width of a house", which was the number
 * nobody checked.
 *
 * THE REAL CROSSING IS THE MEASUREMENT. `world.bridge` is 4.4 units wide, which
 * at `scaleK` (1/19.2 on this world) is 0.23 — so 1.6 per cent of `MINI_R` is
 * the honest answer plus a little, and it still comes out six pixels across at
 * the distance this shot is framed at rather than the one pixel the original
 * gold tube was. */
const BR_W = MINI_R * 0.016;
const BR_T = MINI_R * 0.004;
const BR_SLATS = 14;
const BR_SNAP = 0.16;
/** How high a span arches, as a fraction of its own length.
 *
 *  MEASURED OFF THE SLOPE IT PRODUCES, not chosen for a look. The arch is a
 *  half-sine over the span, so its steepest tangent is at the rim and its
 *  gradient there is exactly `PI * BR_ARCH`, whatever the span is — 0.12 is
 *  21 degrees, an arch you can read as an arch.
 *
 *  IT USED TO BE `span * 0.24 + 0.18`, and the two halves of that were wrong in
 *  different ways. 0.24 alone is 37 degrees; the +0.18 FLOOR is a fixed hump on
 *  a length that varies eight-fold, so on the shortest span in this archipelago
 *  — 0.76 units, town to the frost island — it was a third of the run again and
 *  the ends came out at **57 degrees**. That is not a bridge, it is a ramp into
 *  the sky with a torii leaning off the top of it, and it is half of "the
 *  bridges connecting the islands... seem to be upside-down or sideways". The
 *  roll was the other half and is `deckQuat`.
 *
 *  WHAT IS LEFT IS THE CLIMB, and the climb is honest: the islands do not float
 *  at one height, so a span between two of them has to go up. That term is the
 *  only reason the steepest plank is over 21 degrees. */
const BR_ARCH = 0.12;
/** How tall a townsperson is drawn in the model, and an animal.
 *
 *  A QUARTER OVER LIFE SIZE, AND THE RATIO IS THE POINT. A kitten is 2.9 units
 *  in the world and a one-floor house is about 5.1 with its roof on, so life
 *  size here is 0.15 against a house at 0.27. 0.19 keeps that reading — a cat
 *  comes up the height of a door — while being big enough to catch the eye.
 *
 *  IT WAS NEVER THE SIZE THAT MADE THEM BLOBS. They were 0.16 already; what
 *  they were was five-sided cylinders. See `_buildFolk`. */
const FOLK_H = 0.19;
const BEAST_H = 0.12;
/**
 * ...AND HOW MUCH BIGGER THAN THAT THEY ARE DRAWN, which is a different question.
 *
 * "It appears there are some animals and people in the main island moving
 * around, but it is very hard to see them... they need to be maybe two or three
 * times as large... The animals also need to billboard towards the camera and
 * be twice as big to be seen." `FOLK_H` is the true ratio against a house and
 * stays the true ratio; at the true ratio, from the Dojo lens, a villager is a
 * dozen pixels. So the town is drawn out of scale on purpose, the way a model
 * railway's figures are, and the wander bound (`FOLK`) is untouched by it.
 */
const FOLK_GROW = 2.5;
const BEAST_GROW = 2;
/** A third off the rabbit and the rat, and only those two. See the species
 *  list in `_buildFolk`. */
const RAT_RABBIT_SHRINK = 2 / 3;
/**
 * How tall the SCARED drawing is, against her standing height.
 *
 * THE SAME AS THE BLESSING POSE IT REPLACES, AND THAT IS MEASURED. Ear tips
 * will not do here: the fright has her fur standing up above them. So the
 * yardstick is the rope belt, the widest tan row in each drawing, which is the
 * same belt at the same size in every pose:
 *
 *   ember_bless   704px tall / 183px belt  ->  3.847
 *   ember_scared  714px tall / 181px belt  ->  3.945   (+2.6%)
 *   frost_bless   708px tall / 131px belt  ->  5.405
 *   frost_scared  724px tall / 139px belt  ->  5.209   (-3.6%)
 *
 * Opposite signs, half a percent apart on average, so one number for both. Its
 * own literal and not an alias, for the reason `BLESS_STRETCH` gives.
 */
const SCARED_STRETCH = 0.86;
/**
 * How hard the ground moves under the huddle, in model units.
 *
 * HALF WHAT IT WAS. "They shake too much and make the bridges look bad, we need
 * to make the bridges look more solidly intact before they break." It was 0.16,
 * and `_stepBridges` bows every deck by the same number, so this one constant is
 * both the islands and the spans.
 */
const QUAKE = 0.08;
/** How long the earthquake takes to reach full strength from the first word of
 *  "because something broke" — see `isles-quake` in the shot list. */
const QUAKE_IN = 1.0;
/** How long the four little ones take to fade up, standing still, before they
 *  move. See `isles-stand`. */
const KIT_IN = 1.4;
/** How far BEHIND its rider a dragon is drawn, along the line of sight. See
 *  "THE RIDER IS IN FRONT" in `_stepModel`. */
const RIDE_BACK = 0.3;
/**
 * The order the transparent things on the model are drawn in.
 *
 * NOT A NICETY — IT IS THE FLICKER. "When the islands are shaking, the player
 * sprites in the main island seem to flicker on/off." Three sorts transparent
 * objects back to front by the distance to each object's ORIGIN. The crowd is
 * one `InstancedMesh` whose origin is the model's middle, and the town — the
 * island the huddle packs around — has its origin exactly there too, so the two
 * tie. Still, the tie breaks the same way every frame; shaking, the town's
 * origin jitters either side of the crowd's and the order flips. When the town
 * drew second it drew its ground over a crowd that does not write depth, and
 * every villager vanished for that frame. Measured, not guessed: the tie is
 * `world-check`'s "the town is at the middle of the model".
 *
 * So the order is stated. Islands (0), then the crowd, then dragons, then the
 * kittens riding them — which is also the second half of the rider fix.
 */
const RO_FOLK = 2;
const RO_DRAGON = 3;
const RO_KIT = 4;
/** How dark the model's bamboo is drawn, per channel. "The bamboo is hard to
 *  see since they are green on a green grassy background, maybe can make them a
 *  different color darker green to stand out more." `buildBamboo`'s canes are
 *  0x7fae3f — the same lightness as meadow grass. Darker, and a little bluer. */
const BAMBOO_TINT = [0.36, 0.56, 0.44];
/** Where the town's dice start, so the town is the same town every time the
 *  ending plays. "Make sure the randomize is seeded so it is always the same
 *  when the cutscene is played." */
const FOLK_SEED = 0x6b6b7a31;

/**
 * mulberry32 — a seeded generator small enough to read in one go.
 *
 * `Math.random` in the crowd meant a different town every time, which nobody
 * had noticed while every villager was one of two cats with a faint wash.
 */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The axis every billboard in this file turns about. One vector, shared,
 *  because a per-frame `new Vector3(0, 1, 0)` inside a thirty-instance loop is
 *  thirty allocations a frame for a constant. */
const UP_AXIS = new THREE.Vector3(0, 1, 0);

/**
 * How far above the model's own ground plane the angle-and-circle overlay
 * floats, and how thick a "thick" line is.
 *
 * IT HAS TO CLEAR THE ISLANDS. Drawn at the height the kittens stand at, the
 * arms ran THROUGH the town and came out as scratches across a hillside; the
 * whole point of a projected overlay is that you can see it is projected.
 *
 * AND `linewidth` DOES NOT WORK. It is a documented dead end in WebGL — every
 * browser draws every `THREE.Line` one pixel wide whatever the material says —
 * so a heavy line here is N of them stacked a hair apart, and everything in
 * this file that wants weight says how many copies it wants instead of how
 * many pixels. At 26 units, one pixel of gold on a black floor is invisible
 * and three is a stroke.
 */
const HUD_Y = 2.4;
const HUD_FAT = 3;

/**
 * How long the angle and the circle stay up, and how they leave.
 *
 * THEY USED TO LAST ONE CUE EACH. "An angle" drew an angle for 0.9 seconds,
 * "a circle" replaced it with a circle, and by "the nerve to jump" the board
 * was empty — so the sentence that names the three things a bridge is made of
 * never once had two of them on screen together.
 *
 * "When stating 'an angle' we should draw the angle on the screen and keep it
 * on the screen until the end of the math section. Same with the 'a circle'
 * part, I think we can have both on screen at the same time... We can start to
 * fade out the angle and circles and can even have them scale to zero... or
 * expand out to infinity and disappear/fade out, can have it all faded out by
 * the time the 'that is all a bridge' part begins."
 *
 * SO EACH ONE LATCHES ON ITS OWN WORD AND BOTH LEAVE TOGETHER, on the last cue
 * before the bridge. The window is measured, not guessed: in `done3` "the
 * nerve to jump" starts at 11.45 s and "that is all a bridge" at 13.70, so
 * there are 2.25 seconds to hold and then get out of, and 0.5 + 1.35 fits with
 * room to spare. Change the recording and this is the number to re-check.
 *
 * OUTWARDS, NOT DOWN TO NOTHING. Both readings were offered; blowing them out
 * past the edge of the model is the one that leaves the shot on the islands —
 * a diagram shrinking to a point puts the eye in the middle of the frame at
 * exactly the moment the kittens are jumping the gap.
 */
const SHAPE_IN = 0.45;
const SHAPE_HOLD = 0.5;
const SHAPE_OUT = 1.35;
const SHAPE_BLOW = 2.4;

/**
 * The two heights the overlay is drawn at, and why they are not one.
 *
 * "I think we can have both on screen at the same time, just have the angle
 * part underneath the circle." Both of them were on `HUD_Y` because only one
 * of them was ever up; with both up they occupy the same plane and the arms
 * read as chords of the bottom ring.
 *
 * The angle drops nearly to the islands — it is a measurement OF the world, so
 * it belongs on it — and the cone of circles starts above head height and
 * climbs from there. From the ending's camera that is a floor plan with a
 * lantern of rings over it, which is the picture.
 */
/**
 * The bridge run: how fast they cross, where they start, and what each of them
 * does on the way over.
 *
 * THEY RUN AT IT BEFORE THEY RUN ACROSS IT. "Let's make them start further
 * back, give them a few seconds of running towards the bridge before they start
 * crossing it and jumping over it."
 *
 * `BR_RATE` IS A FRACTION OF THE WHOLE PATH PER SECOND, and the path is
 * `BR_UP + span + BR_OFF` = 50 units on this world. 0.142 of that is 7.1 units
 * a second — a kitten at a trot, which is what a cutscene wants where the game
 * wants a sprint — and 7.0 seconds end to end: 3.1 of approach, 2.5 of deck,
 * 1.4 to leave.
 *
 * AND ALL OF IT IS CUT TO THE SHOT, WHICH IS 10.28 SECONDS. That number had to
 * be measured twice, and the reason is worth writing down because it invalidated
 * a whole pass of tuning. A beat's `dur` is `voiceDur + TAIL`, and `voiceDur` is
 * read off the mp3 by `SummonScene.load`. Ask a beat how long it is in NODE —
 * where there is no `Audio` element and no file to decode — and it answers with
 * the authored floor, which on this line is 9 seconds against a real 17.1. The
 * previous pass paced this crossing against that floor: built to fit a shot 58%
 * of its actual length, so everybody was over and gone with two and a half
 * seconds of empty bridge still to run. `clip` is the RECORDING's measured
 * length and has been sitting in the script table beside every finale line all
 * along; `world-check` reads it now instead of `dur`, so the checker and the
 * game are timing the same shot.
 *
 * SO THE LAST OF THE FOUR STEPS ONTO THE DECK AT 6.1 SECONDS and is off the far
 * end at about 8.3, which leaves two seconds of empty crossing before the cut —
 * the road, the gate and the arch with nobody on it, which is the picture that
 * line wants under it, and no more of it than that.
 *
 * AND THE CHECK THAT PINS IT PLAYS THE SHOT RATHER THAN SOLVING IT. Working the
 * finish time out from the rate is wrong, and wrong in the flattering
 * direction: a Charge covers ground at 3.2x, a Flash Step skips eleven units of
 * it, and the falling half of a Power Dive nearly stops. The arithmetic answer
 * came out a third of a second early every time.
 *
 * THE HEAD START IS GONE AND `BR_GAP` REPLACED IT. The old `BR_HEAD` was a
 * random start each, which was written to solve "the shot opens on an empty
 * bridge" and solved it by opening on four cats already halfway over with no
 * approach at all. An index stagger is what was actually asked for.
 */
const BR_RATE = 0.142;

/**
 * The approach, the way out, and the second between them.
 *
 * 22 units is two and a half seconds of road with the crossing in front of
 * them; the path used to begin 7 units short of the deck, which is 0.8 seconds
 * and reads as a standing start. 10 past the far end takes them out through the
 * gate rather than stopping them on the tarmac — and the gate is really there
 * now: `World` builds the east torii at `BRIDGE.x + BRIDGE_RUN`, which is 16
 * units past the crest, so the last thing each of them does is run through it.
 * Both are in WORLD units and the deck between them comes off
 * `world.bridgeSpan`, so a re-sized crossing re-times its own run.
 *
 * `BR_GAP` is the stagger, in seconds — "roughly a second apart from each
 * other, so that they are not right on top of each other and you can see them
 * better as they cross."
 */
const BR_UP = 22;
const BR_OFF = 10;
const BR_GAP = 1.0;

/**
 * A JUMP IS A JUMP NOW, AND NOT A SINE.
 *
 * It used to be `sin((1 - t/dur) * PI) * height` — an arc played out of a timer,
 * which is fine for one hop and cannot express any of what was asked for:
 *
 *   "Seems their animations are being interrupted... when doing the power dive
 *   ability, it is not being shown, maybe they need to double or triple jump
 *   before doing it, so that it can be seen... Some players can double jump or
 *   single jump while crossing the bridge or before. Also, the dash ability can
 *   happen in the air."
 *
 * Every one of those is a sentence about a SECOND impulse arriving partway
 * through the first one's arc, and a sine has nowhere to put it. So the
 * crossing runs on the same two numbers the game itself runs on: a height, a
 * vertical speed, and gravity pulling on it. A double jump is one more shove at
 * the top; a dive is a hang and then a shove downward; a dash in the air is a
 * change to the horizontal and nothing else. None of them can interrupt another
 * because none of them is a clock — they are all the same two variables.
 *
 * `BR_GRAV` and `BR_HOP` are solved together, not typed: `2 * v / g` is the
 * airtime and `v * v / (2 * g)` the apex, so 11 and 28 give 0.79 seconds and
 * 2.16 units — a jump you can read at nineteen units from a 54-degree lens, and
 * one that fits inside the two seconds of deck three times.
 */
const BR_GRAV = 28;
const BR_HOP = 11;
/** The second shove, a shade weaker than the first — the real one is too (see
 *  `Player._jump`), and the difference is what makes a double jump read as two
 *  jumps rather than as one tall one. */
const BR_HOP2 = 10;
/** 落 POWER DIVE: how long she hangs at the top, and how hard she comes down.
 *
 *  THE HANG IS THE WHOLE REASON IT IS VISIBLE. A dive from a single jump is 2.2
 *  units of drop at 24 units a second — nine hundredths of a second, which is
 *  five frames and reads as the sprite teleporting to the floor. Doubling up
 *  first puts her 4 units up, and a fifth of a second of stopped-dead-in-the-air
 *  before she drops is the frame the eye actually catches. "Maybe they need to
 *  double or triple jump before doing it, so that it can be seen" — she does. */
const BR_HANG = 0.22;
const BR_DIVE = 24;
/** ...and how much of her forward speed the dive costs. `Player._startDive`
 *  keeps 0.3 of it for exactly this reason: a power dive that sailed on down
 *  the deck would be a swan dive. */
const BR_DIVE_K = 0.32;
/** 突 CHARGE: how much faster, and for how long. */
const BR_DASH = 3.2;
const BR_DASH_DUR = 0.4;
/** 壁 WARD: how long the bubble is held. Longer than the other two on purpose —
 *  a shield up for a third of a second is a glitch, and this is the one of the
 *  three that was asked for by name. */
const BR_WARD_DUR = 1.25;
/**
 * 壁 WARD, FLOATED: how long she hangs in her bubble at the top of a jump, and
 * how slowly she drifts up while she does.
 *
 * "I'd also make one of the players at the ending bridge cutscene use the Ward
 * ability to jump and float in the air for a few seconds before falling." A
 * third move rather than a longer Ward, because the Ward on the approach is the
 * real ability and this one is showing off. It uses the Power Dive's `hang` and
 * lets gravity have her back afterwards, so the fall is an ordinary fall.
 * `BR_FLOAT_SPAN` is how much of the path that covers, so a filler hop is not
 * dropped on the moment she lands.
 */
const BR_FLOAT = 2.4;
const BR_FLOAT_RISE = 0.3;
const BR_FLOAT_SPAN = 0.45;
/** 瞬 FLASH STEP: how long she is gone, and how far down the road she comes
 *  back. `DODGE.invuln` is 0.5 seconds in the real move and this is the same
 *  half second; 11 units is a little over a second of running, which is far
 *  enough to read as a teleport and near enough that both ends are in frame.
 *  "Can also show someone doing the Flash Step to teleport from far away towards
 *  the bridge." */
const BR_BLINK_GONE = 0.5;
const BR_BLINK_FAR = 11;
/** How long the smoke she leaves behind lasts. Shorter than the vanish, so the
 *  puff she leaves and the puff she arrives in are never on screen together —
 *  one pool of four little spheres per kitten does both. */
const BR_PUFF = 0.38;
/** ...and how long the Smash's shockwave rings on the deck after she lands. */
const BR_RING = 0.45;

/**
 * What each of them does, and where on the path she does it.
 *
 * DEALT BY INDEX AND PINNED TO A PLACE, NOT ROLLED AGAINST A TIMER. The old
 * version had two random clocks per kitten — one for jumps, one for abilities —
 * and the trouble with a clock is that it does not know where she is. It fired
 * a Ward on the approach and a jump off the end of the deck, it dealt the same
 * move twice to the same kitten, and when the stagger meant she was not on
 * screen yet it spent her whole opening flourish in the dark. (That last one
 * was found by measurement: nine frames of visible bubble in a twelve-second
 * run.) A move keyed to a FRACTION OF THE PATH cannot do any of that: she is
 * where the number says she is, which is the definition of being on screen.
 *
 * ALL FOUR ABILITIES ARE ON SCREEN AT TWO PLAYERS, which is the fifth
 * non-negotiable pointed at a cutscene. The first two rows between them carry
 * 瞬 Flash Step, 突 Charge, 壁 Ward and 落 Power Dive, plus a double jump, so a
 * pair of sisters sees the same show four of them do.
 *
 * THE APPROACH IS 0..0.44 OF THE PATH AND THE DECK IS 0.44..0.80. The abilities
 * play on the road, the jumps play on the crossing — "running towards the bridge
 * before they start crossing it and jumping over it" is the order the sentence
 * puts them in — and the Flash Step is first of all, because it is the one that
 * comes from far away.
 */
const BR_SCRIPT = [
  [[0.02, 'blink'], [0.26, 'dash'], [0.52, 'jump'], [0.66, 'dive']],
  /* The second of them floats in her Ward from the start of the deck. It was
     a double jump and a Dash here; the float covers both their places, and the
     other two rows still carry double jumps. */
  [[0.14, 'ward'], [0.44, 'float']],
  [[0.10, 'dash'], [0.46, 'dive'], [0.72, 'double']],
  [[0.08, 'dive'], [0.30, 'ward'], [0.54, 'blink'], [0.70, 'double']],
];
/** ...and one or two more hops each, dropped on the deck at random, because
 *  four cats doing exactly what the table says is four cats on rails. They are
 *  only ever ordinary jumps: a filler that could deal an ability would put the
 *  guarantee above back at the mercy of a die. */
const BR_FILL = [0.44, 0.78];

/** How long after the champion throws his arms up the four of them join in.
 *  "Let's also make Mr. Satan go into cheering pose first, and then a moment
 *  after, the players can cheer with him, maybe 0.1s or 0.2s after." The middle
 *  of what was asked for, and it is a LAG rather than a second cue: one cue
 *  that two things answer at different times cannot get out of order with
 *  itself, and the fanfare is nailed to the same instant. */
const CHEER_LAG = 0.15;

const ANG_Y = 0.55;
const CIR_Y = HUD_Y * 1.15;

/** The order the Dojo's cues arrive in. The overlay needs to know whether a
 *  phase is BEFORE or AFTER the word that lit it, which is a question about
 *  sequence and not about the current cue's name. */
const ISLE_CUES = ['isles-wake', 'isles-in', 'isles-quake', 'isles-drift', 'isles-stand',
  'isles-cross', 'isles-angle', 'isles-circle', 'isles-leap', 'isles-bridge'];

const TAU = Math.PI * 2;

/** A thin unfilled circle, the Dojo's own vocabulary rather than a texture. */
function ringGeo(segments = 72) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * TAU;
    pts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

/** ...and an arc of one, for the reticles. */
function arcGeo(sweep, segments = 40) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * sweep;
    pts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

function lineGeo(n) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  return g;
}

/**
 * Give a geometry a flat vertex colour.
 *
 * `mergeParts` (world/build.js) requires one, because the whole world is drawn
 * through vertex-coloured materials and a part without colours would merge as
 * black. build.js has its own private copy of this; four lines are not worth
 * widening that module's surface for.
 */
function paint(geo, colour) {
  const c = new THREE.Color(colour);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

const boxAt = (w, h, d, colour, x, y, z, ry = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  paint(g, colour);
  g.applyMatrix4(new THREE.Matrix4().makeTranslation(x, y, z)
    .multiply(new THREE.Matrix4().makeRotationY(ry)));
  return g;
};

const cylAt = (rt, rb, h, colour, x, y, z, seg = 8) => {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  paint(g, colour);
  g.translate(x, y, z);
  return g;
};

/**
 * Point a piece of bridge along a tangent WITHOUT ROLLING IT OVER.
 *
 * THE BUG THIS FIXES WAS REPORTED AS "THEY SEEM TO BE UPSIDE-DOWN OR SIDEWAYS."
 * Every slat and every gate was oriented with
 * `Quaternion.setFromUnitVectors((0,0,1), tangent)`, which is the SHORTEST
 * rotation carrying +Z onto the tangent — and the shortest rotation is exactly
 * the one that does not care which way up the thing ends. On a span that lifts
 * (`lift` is a sine arch plus the height difference between two islands) the
 * deck rolls as it climbs; on a tangent pointing anywhere near -Z the minimal
 * rotation is a half-turn about a horizontal axis, which puts the planks on top
 * of the rails and stands the torii on its lintel.
 *
 * SO THE BASIS IS WRITTEN OUT INSTEAD, AND THE UP VECTOR IS IN IT. Forward is
 * the tangent, right is world-up crossed into it, and up is whatever is left —
 * which is the definition of "banked to the slope but never rolled". A tangent
 * that is exactly vertical has no such basis at all (right would be zero), so
 * that one case falls back to +X rather than producing NaNs and un-drawing the
 * span. Ninth non-negotiable.
 */
const _dqF = new THREE.Vector3();
const _dqR = new THREE.Vector3();
const _dqU = new THREE.Vector3();
const _dqM = new THREE.Matrix4();
const _dqWorldUp = new THREE.Vector3(0, 1, 0);
const deckQuat = (out, tangent) => {
  _dqF.copy(tangent).normalize();
  _dqR.crossVectors(_dqWorldUp, _dqF);
  if (_dqR.lengthSq() < 1e-8) _dqR.set(1, 0, 0);
  _dqR.normalize();
  _dqU.crossVectors(_dqF, _dqR).normalize();
  _dqM.makeBasis(_dqR, _dqU, _dqF);
  return out.setFromRotationMatrix(_dqM);
};

/**
 * `recolourPixels`, on the card.
 *
 * THE SAME RULE, NOT A LOOK-ALIKE: rotate the hue; cross-fade the rotated hue
 * toward a tint by how grey the pixel is (`GREY_S`); lift that grey pixel's
 * saturation, windowed off the lineart and the speculars. The bands are
 * `spritesheet.js`'s own, interpolated in. The only translation is units —
 * degrees become turns, so `mixHue`'s shortest way round is `fract(d + 0.5) -
 * 0.5` — and the colour space: the atlas is sRGB and decoded to linear before
 * this runs, and the rule was written for the pixels as drawn, so it is applied
 * in (approximately) sRGB and put back.
 *
 * A villager with `recol.x == 0 && recol.w == 0` is the drawing untouched, which
 * is every animal.
 */
const band = (v) => v.toFixed(4);
const FOLK_RECOLOUR_GLSL = `varying vec4 vRecol;
vec3 folkRgb2Hsl( vec3 c ) {
  float mx = max( max( c.r, c.g ), c.b );
  float mn = min( min( c.r, c.g ), c.b );
  float l = ( mx + mn ) * 0.5;
  float d = mx - mn;
  float h = 0.0;
  float s = 0.0;
  if ( d > 1e-5 ) {
    s = l > 0.5 ? d / ( 2.0 - mx - mn ) : d / ( mx + mn );
    if ( mx == c.r ) h = ( c.g - c.b ) / d + ( c.g < c.b ? 6.0 : 0.0 );
    else if ( mx == c.g ) h = ( c.b - c.r ) / d + 2.0;
    else h = ( c.r - c.g ) / d + 4.0;
    h /= 6.0;
  }
  return vec3( h, s, l );
}
float folkHue( float p, float q, float t ) {
  t = fract( t );
  if ( t < 1.0 / 6.0 ) return p + ( q - p ) * 6.0 * t;
  if ( t < 0.5 ) return q;
  if ( t < 2.0 / 3.0 ) return p + ( q - p ) * ( 2.0 / 3.0 - t ) * 6.0;
  return p;
}
vec3 folkHsl2Rgb( vec3 c ) {
  if ( c.y <= 0.0 ) return vec3( c.z );
  float q = c.z < 0.5 ? c.z * ( 1.0 + c.y ) : c.z + c.y - c.z * c.y;
  float p = 2.0 * c.z - q;
  return vec3( folkHue( p, q, c.x + 1.0 / 3.0 ), folkHue( p, q, c.x ), folkHue( p, q, c.x - 1.0 / 3.0 ) );
}
vec3 folkRecolour( vec3 lin, vec4 r ) {
  if ( r.x == 0.0 && r.w == 0.0 ) return lin;
  vec3 c = pow( max( lin, vec3( 0.0 ) ), vec3( 1.0 / 2.2 ) );
  vec3 hsl = folkRgb2Hsl( c );
  float g = r.w * ( 1.0 - min( 1.0, hsl.y / ${band(RECOLOUR_BANDS.GREY_S)} ) );
  float h = fract( hsl.x + r.x );
  if ( g > 0.0 ) h = fract( h + ( fract( r.y - h + 0.5 ) - 0.5 ) * g );
  float l = hsl.z;
  float win = ( l <= ${band(RECOLOUR_BANDS.LINE_L)} || l >= 1.0 ) ? 0.0
    : l < ${band(RECOLOUR_BANDS.LINE_FULL)}
      ? ( l - ${band(RECOLOUR_BANDS.LINE_L)} ) / ( ${band(RECOLOUR_BANDS.LINE_FULL)} - ${band(RECOLOUR_BANDS.LINE_L)} )
      : ( l > ${band(RECOLOUR_BANDS.SPEC_L)} ? max( 0.0, ( 1.0 - l ) / ( 1.0 - ${band(RECOLOUR_BANDS.SPEC_L)} ) ) : 1.0 );
  float s = min( 1.0, hsl.y + r.z * g * win );
  return pow( folkHsl2Rgb( vec3( h, s, l ) ), vec3( 2.2 ) );
}`;

export class FinaleShow {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.world = null;
    this.cast = null;
    /** One `InstancedMesh` per sprite sheet the crowd is drawn from, and the
     *  materials that carry their fade. See `_buildFolk`. */
    this.folkSets = [];
    this.folkMats = [];
    /** Scratch, for `_resolve`. Two of them because a crossing resolves both
     *  of its ends in the same expression. */
    this._pa = new THREE.Vector3();
    this._pb = new THREE.Vector3();
    this.running = false;
    /** The cue currently playing, and how long it has been playing. */
    this.phase = null;
    this.phaseT = 0;
    this.t = 0;
    /** Built on `start` and thrown away on `finish`. */
    this.group = null;
    this.rings = [];
    this.isles = [];
    this.kits = [];
    this.drags = [];
    this.runner = null;
    /**
     * How far in the model is, 0..1, and how far the Dojo runner still is.
     *
     * CHASED, NOT SOLVED OFF `phaseT`. It used to be `min(1, phaseT / 0.6)`,
     * and `phaseT` restarts on every cue — so the model dipped to nothing and
     * came back on each of the six `isles-*` lines, which reads as the
     * hologram flickering. Everything else in this file is solved from a phase
     * clock on purpose (it cannot drift, and it lands on the same frame at any
     * frame rate); these two are the exception because what they are following
     * is not a beat, it is a CROSS-FADE that has to survive the cuts inside it.
     */
    this.modelOn = 0;
    this.runnerOn = 0;
    /** How far the four little ones have faded up (see `isles-stand`), and
     *  the show clock at the moment the ground started moving, which is when
     *  the town stopped walking. */
    this.kitOn = 0;
    this.quakeT0 = 0;
    /** How long the four of them have been dropping into the ring, and whether
     *  there is a ring for them to drop into. See `_seedArena`. */
    this.arenaT = 0;
    this.satanLit = false;
    /**
     * What to play, when something on the bridge does something.
     *
     * A CALLBACK AND NOT AN AUDIO ENGINE, which is the same line `FinaleTide`
     * draws and `entities/panda.js` before it: this file knows what happened
     * and has no business knowing how loud the game is. `SummonScene` wires it
     * to `audio.play`; a show built without one is silent and complete, which
     * is the ninth non-negotiable — the ending must play with no sound at all.
     * @type {?(name: string, gain?: number) => void}
     */
    this.onSfx = null;
    this._drivers = [];
    this._disposables = [];
  }

  /* --------------------------------- life -------------------------------- */

  /**
   * Build everything, hidden, and hand back whether there is anything to show.
   *
   * ALL OF IT IS ALLOCATED HERE AND NONE OF IT EARLIER. This is thirty seconds
   * of a scene that plays once, at the end of an afternoon; a hundred little
   * meshes living in the scene graph from boot so that they can be revealed on
   * the last line would be a hundred things every other frame of the game pays
   * for.
   *
   * @param {object} world
   * @param {?object} cast { kittens: [{texture, cols, rows}], dragon, satan }
   */
  start(world, cast) {
    this.finish();
    this.world = world ?? null;
    this.cast = cast ?? null;
    this.folkSets = [];
    this.folkMats = [];
    if (!this.scene || !this.world) return false;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this._buildRings();
    this._buildModel();
    this._buildCast();

    this.running = true;
    this.phase = null;
    this.phaseT = 0;
    this.t = 0;
    this.modelOn = 0;
    this.runnerOn = 0;
    this.kitOn = 0;
    this.quakeT0 = 0;
    this.arenaT = 0;
    return true;
  }

  /**
   * A beat of the show has begun.
   *
   * ONE STRING, AND IT IS IGNORED IF IT IS NOT UNDERSTOOD. The shot list in
   * `summonscene.js` is the script and this is the stage; a cue that arrives
   * for something that could not be built (no arena in the sky yet, no dragon
   * art loaded) has to be a no-op rather than a crash, because the scene
   * viewer can open the ending on any world at all. Ninth non-negotiable.
   */
  cue(name) {
    if (!this.running || name === this.phase) return;
    const was = this.phase;
    this.phase = name;
    this.phaseT = 0;

    /* THE RINGS ARE ONE-SHOTS, so they are lit here rather than held by the
       phase: each runs its own three-quarters of a second and fades, which
       means two of them can overlap while she is still saying the second
       word. */
    if (name === 'name-barrel') this._light(0);
    if (name === 'name-lantern') this._light(1);
    if (name === 'name-bamboo') this._light(2);

    /* WHERE THE LITTLE ONES ARE STANDING WHEN A MOVE BEGINS. Each of these
       re-seeds the paths rather than letting the previous one run on, so a
       skipped or re-entered beat cannot leave a kitten drifting off the model
       for ever. */
    /* THE TOWN STOPS WHERE IT STANDS WHEN THE GROUND MOVES. See `_stepFolk`. */
    if (name === 'isles-quake') this.quakeT0 = this.t;
    /* SEEDED ON THE STAND, NOT ON THE CROSSING. "At the end of 'nobody was
       crossing between them anymore' we can have the players and the dragons
       they are riding fade in and stand still before... they start
       jumping/flying around." They appear where they will leave from, so the
       crossing must not re-seed them — that would teleport four cats who have
       just been seen standing still. Cued straight at `isles-cross` (the scene
       viewer, a check) it still seeds, so nobody crosses from nowhere. */
    if (name === 'isles-stand') this._seedCross();
    if (name === 'isles-cross' && was !== 'isles-stand') this._seedCross();
    if (name === 'isles-leap' || name === 'isles-bridge') this._seedLeap();
    if (name === 'bridge-run') this._seedBridge();
    if (name === 'arena-in') this._seedArena();
  }

  /** Take it all down. Safe to call twice, and called on the SKIP path. */
  finish() {
    if (this.group) {
      this.scene?.remove(this.group);
      for (const d of this._disposables) d.dispose?.();
    }
    this.group = null;
    this.rings = [];
    this.isles = [];
    this.kits = [];
    this.drags = [];
    this.runner = null;
    this.folkSets = [];
    this.folkMats = [];
    this.model = null;
    this.bridges = null;
    this.slats = null;
    this.gates = null;
    this.slatMesh = null;
    this.gateMesh = null;
    this.shapes = null;
    this._reach = null;
    this.arms = null;
    this.wedges = null;
    this.satan = null;
    this._drivers = [];
    this._disposables = [];
    this.running = false;
    this.phase = null;
    this.modelOn = 0;
    this.runnerOn = 0;
    this.arenaT = 0;
    this.satanLit = false;
  }

  /**
   * Who `MathDojo` should read its angle from this frame, or null for nobody.
   *
   * THE LESSON IS THE REAL ONE. `MathDojo.update` takes a list of things with a
   * `position` and steers theta from whichever of them is nearest the painted
   * circle — it has never cared whether that thing was a `Player`. So the
   * ending's runner is simply handed to it, and every line, leg, angle and
   * board reading on that island is computed from her the same way it is
   * computed from a girl walking the rim. Returning null lets the Dojo fall
   * back to its own slow idle turn, which is what it does when nobody is there.
   */
  drivers() {
    return this.runner?.on ? this._drivers : null;
  }

  /* ------------------------------- building ------------------------------ */

  _keep(obj) { this._disposables.push(obj); return obj; }

  _lineMat(colour, opacity = 1) {
    return this._keep(new THREE.LineBasicMaterial({
      color: colour, transparent: true, opacity, depthWrite: false,
    }));
  }

  /**
   * A flat, unlit, vertex-coloured material — which is what a hologram is.
   *
   * UNLIT ON PURPOSE. `toonVertexMat` is the world's own and is LIT; a model of
   * the islands lit by the sun would have a dark side, and a dark side is a
   * thing you cannot fade out.
   *
   * BUT IT STILL WRITES DEPTH. Everything else in this file is depth-free
   * because it is line work floating over a floor, and the model was built the
   * same way — which came out as an island's far rim, its keel and the houses
   * behind it all drawn over the houses in front, so the town read as a smear
   * of colour rather than as a town. A solid object has to occlude itself even
   * when it is fading: `transparent` gets the fade, `depthWrite` gets the
   * shape, and the two are not in conflict on a single merged mesh.
   */
  _holoMat() {
    return this._keep(new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0,
      toneMapped: false, depthWrite: true,
    }));
  }

  /** The three marks Patchfur names, drawn as the Dojo draws things: a thin
   *  line on the ground and nothing else. */
  _buildRings() {
    const geo = this._keep(ringGeo());
    for (let i = 0; i < 3; i++) {
      const mat = this._lineMat(0xffd76a, 0);
      const ring = new THREE.LineLoop(geo, mat);
      ring.visible = false;
      this.group.add(ring);
      this.rings.push({ mesh: ring, mat, t: -1, at: null, r: 2 });
    }
  }

  /**
   * Pack the islands into a huddle, rims nearly touching.
   *
   * IT KEEPS EVERY ISLAND'S BEARING AND THROWS AWAY ITS DISTANCE. Which
   * direction the frost island lies in from the town is a fact about the world
   * the girls know by heart; how far away it is, is the thing the whole beat is
   * about CHANGING. So the huddle is the same compass with the gaps closed —
   * walk out along each island's own bearing until its rim clears everything
   * already placed, and stop there.
   *
   * NEAREST FIRST, WHICH MAKES IT DETERMINISTIC. Placing in world order would
   * let a far island claim the space a near one needs and the pack would come
   * out differently for a world with its islands declared in another order.
   * Sorted by true distance, each island is placed against the ones that are
   * genuinely inside it, and the answer is the same every time the ending
   * plays — which matters, because the mini-bridges are built from the pairs
   * this produces.
   *
   * @returns {number} how many islands were placed
   */
  _huddle() {
    const gap = MINI_R * RIM_GAP;
    const order = this.isles.slice().sort(
      (a, b) => Math.hypot(a.home.x, a.home.z) - Math.hypot(b.home.x, b.home.z)
    );
    const done = [];
    for (const isl of order) {
      const d0 = Math.hypot(isl.home.x, isl.home.z);
      if (!done.length || d0 < 1e-6) {
        isl.near = new THREE.Vector3(0, 0, 0);
        isl.parent = null;
        done.push(isl);
        continue;
      }
      const ux = isl.home.x / d0;
      const uz = isl.home.z / d0;
      /* WALKED OUT IN SMALL STEPS RATHER THAN SOLVED. A closed form exists for
         one neighbour and not for five overlapping ones, and this runs once,
         on eight islands, on the frame a thirty-second scene opens. */
      let d = isl.r;
      let host = null;
      for (let step = 0; step < 4000; step++) {
        const x = ux * d;
        const z = uz * d;
        let clash = null;
        let tightest = Infinity;
        for (const o of done) {
          const need = isl.r + o.r + gap;
          const have = Math.hypot(x - o.near.x, z - o.near.z);
          if (have < need && need - have > 1e-9) { clash = o; break; }
          /* ...AND WHICHEVER IT ENDS UP LEANING AGAINST IS ITS PARENT. That is
             the pair a mini-bridge is drawn between, so it has to be the island
             this one is actually touching and not simply the nearest one in the
             real world — which, after the pack, may be on the other side. */
          if (have - need < tightest) { tightest = have - need; host = o; }
        }
        if (!clash) break;
        d += MINI_R * 0.004;
      }
      isl.near = new THREE.Vector3(ux * d, 0, uz * d);
      isl.parent = host;
      done.push(isl);
    }
    return done.length;
  }

  /**
   * The model of the archipelago that assembles itself on the Dojo floor.
   *
   * IT IS THE REAL MAP, SHRUNK. Every disc is one of `world.islands` at its own
   * position and its own radius, scaled by one number — so the shape the girls
   * see turning on the floor is the shape of the place they spent the afternoon
   * in, and the one that has a bridge on it is the one they are about to be
   * standing on. A prettier invented constellation would have been easier and
   * would have been a lie in the middle of a lesson.
   *
   * AND IT IS THE REAL TOWN ON IT. "Each island should have the correct
   * colors/material for the islands they represent... we need to have the main
   * structures like houses, roads, bridges, lanterns, torii, Clan shrines."
   * Every one of those comes off `world` — `BIOMES` for the colour,
   * `world.solids` for the footprints, `world.roadMask` for the streets,
   * `world.clanHalls` for the shrines, `world.landmarks` for the torii and the
   * lanterns. Nothing in here is a coordinate typed twice.
   */
  _buildModel() {
    this.model = new THREE.Group();
    this.model.visible = false;
    this.group.add(this.model);

    /* SET BEFORE THE BAIL-OUT. `_stepModel` walks `modelMats` every frame and
       a world with no islands — which is exactly the world `world-check`
       builds — would otherwise be a crash in the ninth non-negotiable's
       blind spot: not a missing model, an undefined one. */
    this.modelMats = [];
    this.scaleK = 1;
    const isls = (this.world.islands ?? []).filter((i) => i.kind !== 'arena');
    if (!isls.length) return;
    const R = Math.max(1, ...isls.map(
      (i) => Math.hypot(i.x, i.z) + (i.radius ?? 10)
    ));
    this.scaleK = MINI_R / R;
    const c = this.world.dojoCentre ?? new THREE.Vector3();
    this.model.position.set(c.x, c.y + MINI_Y, c.z);

    this.holo = this._holoMat();
    this.modelMats = [this.holo];

    for (const isl of isls) {
      const r = Math.max(0.6, (isl.radius ?? 10) * this.scaleK);
      const g = new THREE.Group();
      const home = new THREE.Vector3(isl.x * this.scaleK, 0, isl.z * this.scaleK);
      this.model.add(g);
      this.isles.push({
        g, home, r, kind: isl.kind, src: isl,
        /* WHERE IT SITS WHEN IT IS STILL PART OF ONE PLACE, and how high. Both
           filled in below, once every island is known: a pack cannot be solved
           one island at a time. */
        near: home.clone(), parent: null,
        nearY: (isl.baseY ?? 0) * this.scaleK * STACK_NEAR,
        farY: (isl.baseY ?? 0) * this.scaleK * STACK_FAR,
        seed: Math.random() * TAU,
      });
    }
    this._huddle();

    /* --- and now the land, and everything standing on it ----------------- */
    for (const isl of this.isles) {
      isl.g.position.set(isl.near.x, isl.nearY, isl.near.z);
      const parts = this._isleDetail(isl);
      const mesh = new THREE.Mesh(this._keep(mergeParts(parts)), this.holo);
      for (const p of parts) p.dispose();
      isl.g.add(mesh);
    }

    this._buildFolk();
    this._buildMiniBridges();

    /* THE BRIDGE IN THE MODEL IS THE BRIDGE IN THE WORLD, at the same scale and
       on the same island — it is what everybody jumps at on the last line of
       the beat, and a red mark in the wrong place would be the one detail a kid
       who has walked that road would catch. */
    if (this.world.bridge) {
      const b = this.world.bridge;
      const host = this._isleNearest(b.x, b.z);
      /* AND IT IS AN ACTUAL BRIDGE NOW, NOT A RED DASH. It was one box —
         0.7 x 0.12 x 0.5 — which at the distance this shot is framed at is a
         scratch, and it is the thing the whole last line of the beat is about:
         "make sure to keep the bridge on the hologram as it is currently
         disappearing before the scene is over." Four cats shrink onto it, so
         it has to be somewhere you can see them land.

         AND IT IS THE BRIDGE, NOT ONE LIKE IT. It was drawn in the
         vocabulary of the little spans between the islands — gold rails, a
         torii at each end — and the next shot cuts to the real one, which has
         neither. "Can we make it the same bridge and also make it line up with
         the torii gate, like it is in the next scene?" So it is `buildBridge`
         with the world's own numbers, turned the quarter the world turns it,
         and the gate the kittens run out through is the landmark torii further
         down the road, drawn where it stands.

         AND IT RIDES `holo`, NOT `bridgeMat`. The connecting spans dim with
         `dk` as the islands separate, which is the whole point of them; this
         one must not, because the islands have already separated by the time
         anybody jumps at it. */
      const span = new THREE.Mesh(this._keep(this._miniSpanGeo()), this.holo);
      /* ON THE GRASS, like everything else on the island — `put` lifts the
         real one a tenth above its ground and the land's top is 0.08. */
      span.position.set(
        b.x * this.scaleK - (host?.home.x ?? 0),
        0.08 + 0.1 * this.scaleK,
        b.z * this.scaleK - (host?.home.z ?? 0)
      );
      (host?.g ?? this.model).add(span);
      this.miniBridge = { host, local: span.position.clone() };
    }

    this._buildShapes();
  }

  /**
   * One island's worth of scenery, as geometry parts ready to merge.
   *
   * MERGED, BECAUSE THE ALTERNATIVE IS FIVE HUNDRED DRAW CALLS. `world.solids`
   * alone is 508 entries; one little mesh each would cost more per frame than
   * the entire rest of the ending. One merge per island is eight draw calls for
   * the whole archipelago, and it is also what lets the whole island fade as a
   * unit.
   *
   * WHAT A SOLID IS, IS READ OFF ITS RADIUS, and that is a measurement rather
   * than a guess: the world plants houses at r 7.0 and 4.2, market stalls at
   * 2.0, shrine gates at 0.7, trees at 0.66 and 0.9. Nothing here needs to know
   * WHICH house it is drawing — at this scale a house is a box with a roof on
   * it and the only question is how big.
   */
  _isleDetail(isl) {
    const src = isl.src;
    const pal = BIOMES[src.biome] ?? BIOMES.meadow;
    const K = this.scaleK;
    const r = isl.r;
    const parts = [];

    /* The land: a disc with a keel under it. The keel is the darker rock of
       the same biome, so a frost island is white on blue-grey and an ash one
       is violet on charcoal without a second palette existing anywhere. */
    parts.push(cylAt(r, r * 0.96, 0.16, pal.grass, 0, 0, 0, 16));
    /* THE KEEL IS A HINT AND NOT THE ISLAND. The real ones taper away under
       the grass; a cone as deep as the island is wide came out, from a camera
       ten units above the floor, as a bright orange traffic cone with a town
       balanced on it — the biggest thing in the shot and the only thing in it
       nobody has ever seen from below. */
    const keel = new THREE.ConeGeometry(r * 0.94, r * 0.5, 14);
    paint(keel, pal.rockDark);
    keel.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI));
    keel.translate(0, -r * 0.3, 0);
    parts.push(keel);

    const inside = (x, z) => Math.hypot(x - src.x, z - src.z) <= (src.radius ?? 10);
    const lx = (x) => (x - src.x) * K;
    const lz = (z) => (z - src.z) * K;

    /* --- the roads ------------------------------------------------------
       `roadMask` is the corridor the world keeps clear of grass, which means
       it is the street, measured. Drawn as flat discs just above the ground,
       in the biome's own dirt, so the town reads as having a shape. */
    for (const m of this.world.roadMask ?? []) {
      if (!inside(m.x, m.z)) continue;
      parts.push(cylAt(m.r * K, m.r * K, 0.02, pal.dirt, lx(m.x), 0.09, lz(m.z), 7));
    }

    /* --- the buildings and the trees -------------------------------------
       THEY ARE THE REAL MODELS NOW, SHRUNK — which is what was asked for twice
       and refused once. "The roofs of the houses are inverted. Can we just use
       the same house models that are in the main town island?" and "The trees
       can be the same trees we use on the main island, just miniature versions
       of them."

       THE REFUSAL WAS WRONG ON A NUMBER, AND THE NUMBER IS THE WHOLE STORY.
       The comment that used to stand here said `buildHouse` was too expensive
       because "four hundred of those merged is a quarter of a million
       triangles". Measured: this world has 508 solids and **41** of them are
       buildings — 467 are trees. Four hundred houses never existed. Forty-one
       real houses is about 35k triangles across seven merged meshes, which is
       less than one market stall's worth of the world standing behind them.

       AND THE ROOF WAS INVERTED FOR A REASON ANYBODY CAN CHECK. `cornerLift`
       is an ABSOLUTE distance in `pagodaRoof`, not a fraction: 0.5 of lift on a
       roof `h * 0.62 = 0.29` tall kicked the corners up to 172% of the roof's
       own height, which is a funnel. `buildHouse` passes 0.6 on a roof 1.9 tall
       — 32% — and that is the shape everybody recognises. A hand-tuned second
       copy of a shape will drift from the original; there is now only one copy.

       AND THE ARGUMENTS COME OFF THE SOLID, NOT OFF ITS RADIUS. `world.js`
       records the `house` / `tree` options it built each one from — see the
       note on `World.solids`. A radius cannot say which way a house faces or
       what colour its tiles are, and those were the two things this file used
       to guess. Anything with no spec still gets the old box, so a collider
       that was never a building degrades instead of vanishing. */
    for (const s of this.world.solids ?? []) {
      if (!inside(s.x, s.z)) continue;
      const rr = s.r * K;
      if (s.r >= 1.6) {
        const H = s.house;
        if (H) {
          const built = buildHouse({ w: H.w, d: H.d, floors: H.floors, tile: H.tile });
          transformParts(built, lx(s.x), 0.08, lz(s.z), H.ry ?? 0, K * (H.s ?? 1));
          parts.push(...built);
        } else {
          /* NOT A HOUSE, BUT STILL SOMETHING TALL — a market stall, a grotto
             wall, a shrine gate. A box in the biome's own rock, which is what
             this whole branch used to be. */
          const h = s.r * 1.3 * K;
          const hw = rr * 0.72;
          parts.push(boxAt(hw * 2, h, hw * 2, pal.rock, lx(s.x), 0.08 + h / 2, lz(s.z)));
          parts.push(boxAt(hw * 2.1, h * 0.12, hw * 2.1, 0x6b4a34,
            lx(s.x), 0.08 + h * 0.94, lz(s.z)));
          /* THE SAME ROOF THE REAL ONES WEAR, at the same PROPORTIONS — 32% of
             its own height of corner lift, not 172%. */
          const roof = pagodaRoof(hw, hw, h * 0.62,
            { overhang: 0.5, cornerLift: h * 0.2, rings: 3, perSide: 3 });
          paint(roof, 0x4a4a6e);
          roof.translate(lx(s.x), 0.08 + h * 0.96, lz(s.z));
          parts.push(roof);
        }
      } else if (s.tree) {
        /* A TREE, AND IT IS THE ISLAND'S OWN TREE — all of them, unthinned,
           because there are seventy trees in the entire archipelago and that
           is a merge nobody can feel.

           AND ONLY WHAT THE WORLD CALLS A TREE. This used to draw a cone for
           EVERY solid under r 1.6 and keep one in three, which read as a forest
           and was measured to be a lie: of the 467 small solids in this world,
           **348 are the two star grottos' maze walls** — rings of colliders
           sealed inside a stone dome, which nobody can see from the ground, let
           alone from a hologram in the sky. The autumn island's sixty-tree
           "forest" was one buried maze drawn end to end; that island really has
           ONE tree on it. The dome is drawn below instead, which is the thing a
           kitten standing there actually sees.

           SO AN UNTAGGED SMALL SOLID DRAWS NOTHING, and that is the rule rather
           than an oversight: a bare radius says something is in the way, and
           "in the way" is not a shape. Anything that should appear says so —
           `tree` here, `house` above, `landmarks` and `grottos` below.

           `buildTree` applies the scale itself, so `transformParts` only ever
           places and turns it — scaling twice is a forest of bonsai. */
        const T = s.tree;
        const built = buildTree(T.seed, T.scale * K, FOLIAGE[T.leaf] ? T.leaf : 'pine');
        transformParts(built, lx(s.x), 0.08, lz(s.z), T.ry ?? 0, 1);
        parts.push(...built);
      }
    }

    /* --- the bamboo, where the bamboo really is --------------------------
       "For bamboo island, and in general on the main island, there should be
       some small models of bamboo."

       AND IT IS `props` THAT KNOWS WHERE THE BAMBOO IS, NOT `groves`. This read
       `world.groves`, which is the list of the two stands on the HOME island
       and nothing else — so the bamboo island, which carries seventy canes and
       is named after them, had exactly zero drawn on the model. Every cane in
       this game is a knockable `Prop` (see `world.js`: "if it looks like bamboo
       it must cut"), and `p.home` is where it was planted, which is the honest
       answer on an archipelago where every one of them has been knocked over by
       the time this scene plays.

       THE OTHER HALF OF IT WAS THAT A CANE WAS 0.0084 UNITS WIDE — a sixth of
       a pixel at this framing, drawn as a four-sided tube with no joints and no
       leaves. `buildBamboo` is the real stand, and at this scale its own height
       rule gives it four segments, so a stand costs about a thousand triangles
       instead of nine hundred at full size.

       EVERY FOURTH ONE. 154 stands merged is 160k triangles for a green fuzz;
       thirty-eight is a grove you can see is a grove. */
    let canes = 0;
    for (const p of this.world.props ?? []) {
      if (p.kind !== 'bamboo') continue;
      const h = p.home ?? p.group?.position;
      if (!h || !inside(h.x, h.z)) continue;
      if ((canes++) % 4) continue;
      const built = buildBamboo(canes * 3 + 1, K * 1.15);
      transformParts(built, lx(h.x), 0.08, lz(h.z), (canes % 7) * 0.9, 1);
      /* DARKER THAN THE GRASS IT STANDS IN. See `BAMBOO_TINT`. */
      for (const g of built) {
        const c = g.getAttribute('color');
        if (!c) continue;
        for (let j = 0; j < c.count; j++) {
          c.setXYZ(j, c.getX(j) * BAMBOO_TINT[0], c.getY(j) * BAMBOO_TINT[1], c.getZ(j) * BAMBOO_TINT[2]);
        }
      }
      parts.push(...built);
    }

    /* --- the star grottos ------------------------------------------------
       THE THING THE MAZE WALLS WERE PRETENDING TO BE. Two of them — one on the
       autumn island, one on the dusk one — and each is a sealed stone dome with
       a single doorway and a maze of 174 colliders inside it. Those colliders
       are what the tree loop above used to draw as a small forest; what is
       actually visible from outside is the dome, so the dome is what is here.

       `World.grottos` publishes the centre, the radius AND the `yaw` the mouth
       faces, which is the only reason the doorway can be put on the right side
       of it rather than guessed.

       A HEMISPHERE, NOT THE REAL GEOMETRY. `buildGrotto` is a curved-wall maze
       with a ceiling over it, tens of thousands of triangles of rooms nobody
       can see into; the outside of it is a dome, and at 0.68 units across on
       this model a dome is fourteen segments. */
    for (const G of this.world.grottos ?? []) {
      if (!inside(G.x, G.z)) continue;
      const gr = Math.max(0.1, G.r * K);
      const dome = new THREE.SphereGeometry(gr, 14, 7, 0, Math.PI * 2, 0, Math.PI * 0.5);
      paint(dome, pal.rock);
      dome.translate(lx(G.x), 0.1, lz(G.z));
      parts.push(dome);
      /* The doorway: the one dark mark on it, and the reason it reads as a
         thing you can go inside rather than as a boulder. */
      const dw = gr * 0.36;
      const yaw = G.yaw ?? 0;
      parts.push(boxAt(dw, dw * 1.15, dw * 0.6, 0x171320,
        lx(G.x) + Math.sin(yaw) * gr * 0.94, 0.1 + dw * 0.58,
        lz(G.z) + Math.cos(yaw) * gr * 0.94));
    }

    /* --- the clan shrines, in their own clans' colours -------------------
       Six of them and one per island, which is why they are worth drawing
       individually: the shrine is the thing that makes an island THAT island
       to a kid who has sworn there. */
    for (const hall of this.world.clanHalls ?? []) {
      if (!inside(hall.x, hall.z)) continue;
      const colour = hall.clan?.color ?? 0xffd76a;
      const hr = Math.max(0.12, hall.r * K);
      parts.push(cylAt(hr, hr, 0.05, 0xcfc6b4, lx(hall.x), 0.11, lz(hall.z), 10));
      /* A gate over it, so it is a shrine and not a coin. */
      const gh = hr * 2.2;
      parts.push(boxAt(hr * 0.16, gh, hr * 0.16, colour, lx(hall.x) - hr * 0.6, 0.11 + gh / 2, lz(hall.z)));
      parts.push(boxAt(hr * 0.16, gh, hr * 0.16, colour, lx(hall.x) + hr * 0.6, 0.11 + gh / 2, lz(hall.z)));
      parts.push(boxAt(hr * 1.7, hr * 0.18, hr * 0.2, colour, lx(hall.x), 0.11 + gh, lz(hall.z)));
    }

    /* --- the torii and the stone lanterns --------------------------------
       THE ONLY TWO THINGS IN THE MODEL THAT THE WORLD HAD TO BE ASKED FOR.
       Everything above is derivable from a collision list; a torii is not a
       solid (you walk through it) and a stone lantern is decor, so neither of
       them existed anywhere a reader could find them. `World.landmarks` is
       that list — see `world.js`, where it is filled in at the same `put()`
       calls that build them, so it cannot drift from what is really there. */
    for (const L of this.world.landmarks ?? []) {
      if (!inside(L.x, L.z)) continue;
      if (L.kind === 'torii') {
        /* `buildTorii` ITSELF, TURNED BY `ry`. "The main bridge that they all
           jump to is not the same bridge we see in the next scene, can we make
           it the same bridge and also make it line up with the torii gate, like
           it is in the next scene?" Four boxes square to x put the gate at the
           end of the crossing ACROSS the road; the world turns it a quarter so
           the road runs through it. */
        const built = buildTorii((L.s ?? 1) * K);
        transformParts(built, lx(L.x), 0.08, lz(L.z), L.ry ?? 0, 1);
        parts.push(...built);
      } else if (L.kind === 'lantern') {
        const h = 3 * (L.s ?? 1) * K;
        const w = Math.max(0.02, 0.6 * (L.s ?? 1) * K);
        parts.push(boxAt(w * 0.7, h * 0.7, w * 0.7, 0xa8a294, lx(L.x), 0.08 + h * 0.35, lz(L.z)));
        /* The paper, and it is the one thing in the model that GLOWS. A town
           at dusk with lit lanterns down its main street is the picture a kid
           who has walked it remembers. */
        parts.push(boxAt(w * 1.5, h * 0.34, w * 1.5, 0xffe9a8, lx(L.x), 0.08 + h * 0.86, lz(L.z)));
      }
    }

    /* --- and the painted circle, if this is the island we are standing on ---
       THE ONE PIECE OF SCENERY IN THE MODEL THAT IS NOT A BUILDING. The Dojo
       has no solids on it at all — it is a flat disc with a ring painted on it
       — so everything above skips it and it came out as a bare rock. It is
       also the island the girls are standing on while they look at this, and
       the ring is the single most recognisable mark in the game. Drawn from
       `dojoCentre` and MathDojo's own radius rather than typed, so a lesson
       re-scaled cannot leave a circle here at the old size. */
    const dc = this.world.dojoCentre;
    if (dc && inside(dc.x, dc.z)) {
      /* AND IT IS DRAWN THE WAY THE DOJO IS DRAWN. "The dojo of the turning
         circle holographic island can also look more like the real thing with
         the black circle in the center with the line graph look." It was a pale
         ring on grass, which is the one thing on that island the ring is NOT
         painted on: the real floor is a dark plate with graph paper on it and a
         white circle over the top, and it is the most recognisable mark in the
         game to anybody who has stood in it. Every number here comes off
         `MathDojo`'s own — R is 24, the plate reaches R + 8, the paper is ruled
         at R/4 — so a lesson re-scaled cannot leave a diagram here at the old
         size.

         THE MODEL OF THE ISLAND THE AUDIENCE IS STANDING ON. That is why it is
         worth the eleven parts: the hologram is floating over the real one, and
         a kid who looks down and then looks up should see the same mark twice. */
      const dr = 24 * K;
      const plate = (24 + 8) * K;
      parts.push(cylAt(plate, plate, 0.02, 0x141026, lx(dc.x), 0.1, lz(dc.z), 24));
      /* The graph paper: the two axes, and four rules either side of them. */
      for (let i = -4; i <= 4; i++) {
        if (Math.abs(i) * 6 * K > plate) continue;
        const off = i * 6 * K;
        const c = i === 0 ? 0x9fc0ea : 0x4a6fa5;
        const w = i === 0 ? 0.035 * 24 * K : 0.018 * 24 * K;
        parts.push(boxAt(plate * 1.9, 0.006, w, c, lx(dc.x), 0.115, lz(dc.z) + off));
        parts.push(boxAt(w, 0.006, plate * 1.9, c, lx(dc.x) + off, 0.115, lz(dc.z)));
      }
      /* ...and the circle itself, as a ring rather than as a disc: a filled
         white plate would bury the paper it is supposed to be drawn on. */
      parts.push(cylAt(dr, dr, 0.014, 0xf4ecd8, lx(dc.x), 0.125, lz(dc.z), 32));
      parts.push(cylAt(dr * 0.94, dr * 0.94, 0.03, 0x141026, lx(dc.x), 0.128, lz(dc.z), 32));
    }

    return parts;
  }

  /**
   * The mini-bridges: red-lacquered causeways with a torii at each end, and
   * they come apart when the islands do.
   *
   * "Can even have mini-bridges between them that disappear when they start to
   * separate to symbolize the lost connection. Can have a DBZ reference art
   * style for the bridge, like a 'Snake Way' way of representing them being
   * connected if it looks nice." There is exactly one per island, running to
   * whichever neighbour the pack left it leaning against, which makes the set a
   * spanning tree: every island reachable from the town, nothing reachable two
   * ways. That is the shape the line is about.
   *
   * IT USED TO BE A HAIRLINE TUBE AND THAT IS WHAT IT LOOKED LIKE. "There are
   * the bridges between the holographic islands, but they are hard to see and
   * are too small. They look like just yellow lines. Maybe we can improve the
   * way those bridges look, to look more oriental and cool. Can look more
   * dragon bridges, connecting the islands together." Six hundredths of a unit
   * of gold tube at twenty-six units out is one pixel, and one pixel of
   * anything is a line. So it is a DECK now — vermillion planks with gold
   * rails, on the Snake Way curve, with a little red gate standing at each end
   * of it, which is the same vocabulary the real crossing on the home island
   * is built in.
   *
   * AND IT BENDS, AND THEN IT BREAKS. "When the islands are shaking, they can
   * have an animated bend or shader to show them bending with the islands
   * before snapping and breaking when the islands separate." That is why this
   * is a chain of SLATS rather than one tube: every piece rides the island its
   * own end is anchored to, so the earthquake bows the span for free and the
   * drift tears it in half without a line of code about either. See
   * `_stepBridges`, which is the whole of the animation and is thirty lines
   * because the geometry is doing the work.
   *
   * ONE DRAW CALL FOR ALL OF IT, which is the other reason for slats. Six
   * spans of fourteen pieces is eighty-four little meshes and would cost more
   * per frame than the model they are standing between; as two `InstancedMesh`
   * es it is two. Same argument as `_buildFolk`.
   */
  _buildMiniBridges() {
    this.bridges = new THREE.Group();
    this.bridgeMat = this._keep(new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0,
      toneMapped: false, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.model.add(this.bridges);
    this.slats = [];
    this.gates = [];
    this.slatMesh = null;
    this.gateMesh = null;

    /* --- where each span runs, and how its ends are anchored ------------- */
    const spans = [];
    for (const isl of this.isles) {
      const p = isl.parent;
      if (!p) continue;
      const dx = p.near.x - isl.near.x;
      const dz = p.near.z - isl.near.z;
      const len = Math.hypot(dx, dz) || 1;
      /* FROM RIM TO RIM, not centre to centre — a road that starts in the
         middle of an island is a road through a town. */
      const ux = dx / len;
      const uz = dz / len;
      const x0 = isl.near.x + ux * isl.r * 0.92;
      const z0 = isl.near.z + uz * isl.r * 0.92;
      const x1 = p.near.x - ux * p.r * 0.92;
      const z1 = p.near.z - uz * p.r * 0.92;
      const span = Math.hypot(x1 - x0, z1 - z0);
      /* THE SNAKE, FLATTENED. The old wobble was a fifth of the span either
         side, which on a ribbon reads as Snake Way and on a deck two hundredths
         wide reads as a road that has been dropped. An eighth keeps the gesture
         and lets the thing look like a bridge. */
      const pts = [];
      const px = -uz;
      const pz = ux;
      for (let i = 0; i <= 4; i++) {
        const u = i / 4;
        const wob = Math.sin(u * Math.PI * 2) * span * 0.12;
        const lift = Math.sin(u * Math.PI) * span * BR_ARCH
          + (p.nearY - isl.nearY) * u;
        pts.push(new THREE.Vector3(
          x0 + (x1 - x0) * u + px * wob,
          0.14 + lift,
          z0 + (z1 - z0) * u + pz * wob
        ));
      }
      spans.push({ curve: new THREE.CatmullRomCurve3(pts), a: isl, b: p });
    }
    if (!spans.length) return;

    /* --- one plank, one gate, and then eighty copies of each ------------- */
    const deck = [
      boxAt(BR_W, BR_T, 1, 0xd8482f, 0, BR_T * 0.5, 0),
      boxAt(BR_T * 0.5, BR_T * 2.1, 1, 0xf0c14b, -BR_W * 0.5, BR_T * 1.5, 0),
      boxAt(BR_T * 0.5, BR_T * 2.1, 1, 0xf0c14b, BR_W * 0.5, BR_T * 1.5, 0),
    ];
    const slatGeo = this._keep(mergeParts(deck));
    for (const g of deck) g.dispose();
    /* A TORII, ONE UNIT TALL, so one instance scale is its height. Two posts, a
       lintel over them and a gold tie under it — the same four shapes the real
       ones in the world are made of and the same four `_isleDetail` draws. */
    const gate = [
      boxAt(BR_T * 0.7, 1, BR_T * 0.7, 0xd8482f, -BR_W * 0.62, 0.5, 0),
      boxAt(BR_T * 0.7, 1, BR_T * 0.7, 0xd8482f, BR_W * 0.62, 0.5, 0),
      boxAt(BR_W * 2.0, BR_T * 0.9, BR_T * 1.0, 0xe8623f, 0, 1.0, 0),
      boxAt(BR_W * 1.6, BR_T * 0.6, BR_T * 0.8, 0xf0c14b, 0, 0.82, 0),
    ];
    const gateGeo = this._keep(mergeParts(gate));
    for (const g of gate) g.dispose();

    this.slatMesh = new THREE.InstancedMesh(
      slatGeo, this.bridgeMat, spans.length * BR_SLATS);
    this.gateMesh = new THREE.InstancedMesh(gateGeo, this.bridgeMat, spans.length * 2);
    this.bridges.add(this.slatMesh, this.gateMesh);

    const M = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const tan = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const home = (isl) => new THREE.Vector3(isl.near.x, isl.nearY, isl.near.z);
    let gi = 0;
    for (const sp of spans) {
      const total = sp.curve.getLength();
      const seg = total / BR_SLATS;
      for (let i = 0; i < BR_SLATS; i++) {
        const u = (i + 0.5) / BR_SLATS;
        sp.curve.getPointAt(u, pos);
        sp.curve.getTangentAt(u, tan);
        deckQuat(q, tan);
        /* WHICH ISLAND THIS PIECE BELONGS TO. The near half rides the child and
           the far half rides its parent, which is what makes the span tear in
           the middle when they separate rather than sliding off one end. */
        const isl = u < 0.5 ? sp.a : sp.b;
        const anchor = home(isl);
        this.slats.push({
          isl,
          rel: pos.clone().sub(anchor),
          quat: q.clone(),
          len: seg * 1.04,
          u,
          seed: Math.random() * TAU,
          /* WHICH WAY THE PIECE GOES WHEN IT LETS GO, and how it turns doing
             it. Random per piece and fixed at build, so a broken bridge falls
             the same way every time this scene plays and no two pieces fall
             alike. */
          axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5,
            Math.random() - 0.5).normalize(),
          away: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5)
            .normalize().multiplyScalar(0.4 + Math.random() * 0.6),
        });
      }
      /* ...and the gate at each end, standing on the land rather than on the
         deck: `0` and `1` of the curve are the rims themselves. */
      for (const [u, isl] of [[0, sp.a], [1, sp.b]]) {
        sp.curve.getPointAt(u, pos);
        sp.curve.getTangentAt(u, tan);
        /* AND IT STANDS UP, whatever the deck under it is doing. A plank may
           be pitched — it is a ramp, that is what a ramp is — but a torii is a
           gate, and a gate built on the deck's own tangent leans back by the
           whole gradient of the arch. `deckQuat` cannot fix that for it: it
           kills the ROLL and keeps the pitch, faithfully, which is right for a
           plank and wrong for a post. So the gate is turned by the crossing's
           BEARING and by nothing else. */
        tan.y = 0;
        if (tan.lengthSq() < 1e-8) tan.set(0, 0, 1);
        deckQuat(q, tan);
        const anchor = home(isl);
        M.compose(pos, q, scl.set(1, BR_W * 1.5, 1));
        this.gateMesh.setMatrixAt(gi, M);
        this.gates.push({ isl, rel: pos.clone().sub(anchor), quat: q.clone(), ix: gi });
        gi++;
      }
    }
    this.gateMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * The bridges bowing, and then coming apart.
   *
   * NOTHING HERE IS A SPECIAL CASE FOR EITHER. Every slat is positioned as
   * "wherever my island is, plus the offset I was built at", so an island that
   * shakes shakes its half of the span and an island that leaves takes its half
   * with it. The bow and the break are the two things added on top of that, and
   * both are solved from one number.
   *
   * THE MIDDLE GOES FIRST. `thresh` is smallest at `u = 0.5` and largest at the
   * ends, so the break travels outwards from the centre of the span toward the
   * two shores — which is what a rope bridge under tension does and is also the
   * picture the line wants: the connection fails in the middle, not at the
   * anchors.
   *
   * @param {number} on how far in the model is, 0..1
   * @param {number} dk how far apart the islands have drifted, 0..1
   * @param {number} shake how hard the ground is moving right now
   */
  _stepBridges(on, dk, shake) {
    if (!this.slatMesh) return;
    /* GONE BY THE TIME THEY ARE A THIRD OF THE WAY OUT, so the picture is "the
       roads break and then the islands go", which is the order the sentence
       puts them in — and slowly enough that the pieces are seen to fall.

       AND IT IS `BR_SNAP` THAT SAYS WHEN, not a second number beside it. The
       tear finishes at `BR_SNAP` and the light goes out at twice that, so the
       pieces are visibly loose before they are gone; a hand-typed 2.2 here
       drifted past a third the moment the snap was re-timed, which is exactly
       the check that caught it. */
    const linked = Math.max(0, 1 - dk / (BR_SNAP * 2));
    this.bridgeMat.opacity = on * linked * 0.95;
    const show = this.bridgeMat.opacity > 0.02;
    this.slatMesh.visible = show;
    this.gateMesh.visible = show;
    if (!show) return;

    const M = this._bm ?? (this._bm = new THREE.Matrix4());
    const pos = this._bp ?? (this._bp = new THREE.Vector3());
    const scl = this._bs ?? (this._bs = new THREE.Vector3());
    const q = this._bq ?? (this._bq = new THREE.Quaternion());
    const q2 = this._bq2 ?? (this._bq2 = new THREE.Quaternion());

    this.slats.forEach((s, i) => {
      const P = s.isl.g.position;
      pos.set(P.x + s.rel.x, P.y + s.rel.y, P.z + s.rel.z);
      q.copy(s.quat);
      let k = 1;
      if (shake > 0.001) {
        /* THE BOW. Deepest in the middle of the span and nothing at the shores,
           breathing at its own rate per bridge — a deck under strain, not a
           deck being shaken. */
        const bow = Math.sin(s.u * Math.PI);
        const w = shake * bow;
        pos.y -= w * (1.4 + Math.sin(this.t * 5.5 + s.seed));
        pos.x += Math.sin(this.t * 8 + s.seed) * w * 1.1;
        pos.z += Math.cos(this.t * 7 + s.seed * 1.3) * w * 1.1;
      }
      const br = dk / BR_SNAP - (0.15 + Math.abs(s.u - 0.5) * 1.7);
      if (br > 0) {
        pos.y -= br * br * 7;
        pos.x += s.away.x * br * 2.2;
        pos.z += s.away.z * br * 2.2;
        q.multiply(q2.setFromAxisAngle(s.axis, br * 4.5));
        k = Math.max(0, 1 - br * 1.1);
      }
      M.compose(pos, q, scl.set(k, k, s.len * k));
      this.slatMesh.setMatrixAt(i, M);
    });
    this.slatMesh.instanceMatrix.needsUpdate = true;

    for (const g of this.gates ?? []) {
      const P = g.isl.g.position;
      pos.set(P.x + g.rel.x, P.y + g.rel.y, P.z + g.rel.z);
      M.compose(pos, g.quat, scl.set(1, BR_W * 1.5, 1));
      this.gateMesh.setMatrixAt(g.ix, M);
    }
    this.gateMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * The people and the animals, and the fact that none of them ever leaves.
   *
   * THEY ARE CATS AND ANIMALS NOW, NOT PILLS. "The people, and likely animals
   * appear as just little colored blobs. Would be better if they were small
   * versions of randomly recolored versions of Ember and Frost and have them
   * moving around the world a little... Idea is to show a vibrant city with
   * inhabitants, rather than an empty one. The animals can be the same animals
   * we already have sprites for, but a miniature version of them."
   *
   * AND THE SIZE WAS NEVER THE PROBLEM — MEASURED. A townsperson is 0.19 model
   * units tall against a one-floor house at 0.27, which is very close to the
   * real ratio (a 2.9-unit kitten beside a 5.1-unit house). What made them
   * blobs was that they were five-sided cylinders. The silhouette is the fix,
   * so this draws the actual sheets.
   *
   * ONE DRAW CALL AND ONE TEXTURE PER SHEET, WHICH IS WHY THIS IS NOT SIX AND
   * THIRTY `Billboard`s. `Billboard` CLONES its atlas so it can drive the cell
   * through `texture.offset` — right for a dozen figures, ruinous for thirty,
   * because a cloned texture is a second upload of a sheet that is several
   * megabytes on the card. So the cell is a PER-INSTANCE ATTRIBUTE instead
   * (`cellOff`, `cellFlip`) and the sheet itself is shared with the rest of the
   * game: one `InstancedMesh` per sheet, one upload, thirty townspeople.
   * `_folkUV` is the four lines of shader that does it, and it computes exactly
   * what `Billboard._setCell` computes — same half-texel inset, same mirror,
   * same top-down row order — so a villager and a player read the same atlas
   * the same way.
   *
   * RECOLOURED WITH `instanceColor`, which `MeshBasicMaterial` multiplies into
   * the map for free. A wash rather than a stain: saturation is low and
   * lightness is high, so a tinted Ember is a different cat and not a stained
   * one.
   *
   * BORN ON AN ISLAND AND CLAMPED TO IT. See `FOLK` — the line this plays under
   * is about nobody crossing, so the wander is bounded by the island's own
   * radius and the bound is the point rather than a convenience. The town gets
   * the people and a share of the animals; every other island gets two or three
   * animals and nobody at all, which is what an emptying archipelago looks
   * like.
   */
  _buildFolk() {
    if (!this.isles.length) return;
    const town = this.isles.reduce((a, b) => (a.r >= b.r ? a : b));
    const outer = this.isles.filter((i) => i !== town && i.kind !== 'dojo');
    this.folkSets = [];
    this._m = new THREE.Matrix4();
    this._fq = new THREE.Quaternion();
    this._fp = new THREE.Vector3();
    this._fs = new THREE.Vector3();
    const rnd = seeded(FOLK_SEED);

    const spot = (host, spread) => {
      const a = rnd() * TAU;
      const rr = Math.sqrt(rnd()) * host.r * spread;
      return {
        host,
        hx: Math.cos(a) * rr,
        hz: Math.sin(a) * rr,
        /* ITS OWN LITTLE ORBIT, and it is small. "Slightly moving about" —
           a model village where everybody is sprinting reads as an ant farm,
           and the shot is meant to be STILL while the camera pushes in. */
        wr: host.r * (0.05 + rnd() * 0.06),
        sp: 0.25 + rnd() * 0.5,
        ph: rnd() * TAU,
        facing: 0,
        /* No recolour: an animal is the animal. See the townspeople below. */
        recol: [0, 0, 0, 0],
      };
    };

    /* --- the townspeople: Ember's sheet and Frost's, tinted ---------------
       THE FIRST TWO STYLES AND NOT ALL FOUR, because Storm and Blossom ARE
       Ember and Frost recoloured — a third and fourth sheet would be two more
       uploads to say something `instanceColor` already says. */
    const styles = (this.cast?.kittens ?? [])
      .map((a, i) => (a?.texture ? i : -1)).filter((i) => i >= 0).slice(0, 2);
    let who = 0;
    for (const si of styles) {
      const n = Math.round(FOLK / styles.length);
      const list = [];
      for (let j = 0; j < n; j++) {
        const f = spot(town, 0.45);
        /* A REAL RECOLOUR, ONE EACH, AND NEVER EMBER OR FROST. "We should
           recolorize all the people in the town so each one has a different and
           unique look and not just look exactly the same as Ember and Frost...
           we already do it for the other 2 extra players." It was an
           `instanceColor` wash — a pale multiply over the SAME cat, which from
           the Dojo lens read as Ember and Frost. This is Storm's and Blossom's
           rule (`recolourPixels`: rotate the hue, and tint what has no colour of
           its own) done per villager in the fragment shader, because thirty
           recoloured atlases would be thirty uploads of a sheet that is
           megabytes on the card. The hue walks the golden angle so no two
           neighbours in the list are near each other, and never comes within
           40 degrees of the drawing's own. */
        const hue = 40 + ((who * 0.618034 + rnd() * 0.12) % 1) * 280;
        f.recol = [hue / 360, rnd(), 0.28 + rnd() * 0.3, 1];
        who++;
        list.push(f);
      }
      const art = this.cast.kittens[si];
      const set = this._folkSet(art, list, FOLK_H * FOLK_GROW, 1);
      if (!set) continue;
      /* HER FRIGHT, for the earthquake — see `_stepFolk`. The scared sheet
         when there is one, and the blessing pose it replaced when there is
         not: that was the stand-in for a whole pass, and a missing file costs
         the face and nothing else. Sized with `SCARED_STRETCH`, measured
         against the blessing drawing, or `BLESS_STRETCH` for the fallback. */
      const fright = this.cast?.scared?.[si];
      const up = fright?.texture ? fright : this.cast?.bless?.[si];
      if (up?.texture) {
        set.alt = this._folkSet(up, list, 0, 0,
          this._quad(up, FOLK_H * FOLK_GROW * (up === fright ? SCARED_STRETCH : BLESS_STRETCH)), false);
      }
    }

    /* --- and the animals, which are the game's own animals -----------------
       ONE SET PER SPECIES, sized against a townsperson rather than typed: a
       bird is smaller than a rabbit is smaller than a panda, and the numbers
       here are ratios of `BEAST_H` so a change to the crowd's scale moves the
       whole menagerie with it.

       THE TOWN GETS MOST OF THEM AND EVERY OTHER ISLAND GETS ONE OR TWO, which
       is the shape the old list had and the reason for it has not changed. */
    const kinds = [];
    const C = this.cast?.critters ?? null;
    /* THE RABBIT AND THE RAT ARE A THIRD SMALLER THAN THEY WERE. "Some of the
       animals are too big, like the rat and the rabbit, so we can make them
       1/3rd smaller." They were 1.0 and 0.75, and `BEAST_GROW` doubled them,
       so a rabbit stood nearly as tall as a townsperson. The bird and the panda
       were not named and keep their sizes. */
    for (const [key, mul] of [['rabbit', 1.0 * RAT_RABBIT_SHRINK], ['rat', 0.75 * RAT_RABBIT_SHRINK], ['bird', 0.7]]) {
      const a = C?.[key]?.calm ?? C?.[key];
      const shock = C?.[key]?.shock;
      if (a?.texture) {
        kinds.push({ art: a, mul, air: key === 'bird', shock: shock?.texture && shock !== a ? shock : null });
      }
    }
    const panda = this.cast?.panda;
    if (panda?.texture) kinds.push({ art: panda, mul: 2.1, air: false, shock: null });
    if (kinds.length) {
      const homes = [];
      for (let i = 0; i < BEASTS; i++) homes.push(spot(town, 0.72));
      for (const isl of outer) {
        const n = 1 + (rnd() < 0.5 ? 1 : 0);
        for (let i = 0; i < n; i++) homes.push(spot(isl, 0.7));
      }
      for (let i = 0; i < kinds.length; i++) {
        const mine = homes.filter((_, j) => j % kinds.length === i);
        if (!mine.length) continue;
        const k = kinds[i];
        for (const f of mine) f.air = k.air ? BEAST_H * BEAST_GROW * 2.4 : 0;
        const set = this._folkSet(k.art, mine, BEAST_H * BEAST_GROW * k.mul, 0);
        /* ITS OWN FRIGHT, measured against its calm drawing by ink area — the
           way the tournament's critters swap the same two. */
        if (set && k.shock) {
          set.alt = this._folkSet(k.shock, mine, 0, 0,
            poseQuad(BEAST_H * BEAST_GROW * k.mul, k.art, k.shock), false);
        }
      }
    }
  }

  /**
   * One sprite sheet, N little copies of it, one draw call.
   *
   * `row` is which animation row these read — 1 is the walk row on a kitten
   * sheet and collapses to 0 on the one-cell animal sheets, which is what lets
   * the same function build both. See `Billboard._setCell` for why a one-row
   * atlas is not a special case anywhere in this game.
   */
  _folkSet(art, list, height, row, size = null, listed = true) {
    if (!art?.texture || !list.length || !this.model) return null;
    const cols = Math.max(1, art.cols ?? 1);
    const rows = Math.max(1, art.rows ?? 1);
    const quad = size ?? this._quad(art, height);
    const geo = this._keep(new THREE.PlaneGeometry(quad, quad));
    /* PIVOT AT THE DRAWN FEET, the same correction `Billboard` makes and for
       the same reason: the atlas pads under the art, so a quad sitting on the
       ground floats by exactly that margin. */
    geo.translate(0, quad / 2 - (art.pad ?? 0) * quad, 0);

    const n = list.length;
    const off = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2);
    const flip = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    off.setUsage(THREE.DynamicDrawUsage);
    flip.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('cellOff', off);
    geo.setAttribute('cellFlip', flip);
    /* (hue turn, tint hue, tint lift, tint on), all 0..1 — see `_folkMatFor`. */
    const recol = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    list.forEach((f, i) => {
      const r = f.recol ?? [0, 0, 0, 0];
      recol.setXYZW(i, r[0], r[1], r[2], r[3]);
    });
    geo.setAttribute('recol', recol);

    const iw = art.texture.image?.width || 1024;
    const ih = art.texture.image?.height || 1024;
    const mat = this._folkMatFor(art.texture, cols, rows, 0.5 / iw, 0.5 / ih);
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    /* NEVER CULLED. The instances are written every frame and the geometry's
       own bounding sphere describes one quad at the origin, so three would cull
       the whole crowd the moment the model turned away from it. */
    mesh.frustumCulled = false;
    mesh.renderOrder = RO_FOLK;
    this.model.add(mesh);

    const set = {
      mesh, mat, off, flip, list, cols, rows,
      iu: 0.5 / iw, iv: 0.5 / ih,
      /* THE SAME TEST `Billboard`'s constructor makes, and it has to be the
         same one: a four-column sheet is a half-turn mirrored atlas and
         anything wider is a full turn drawn out. */
      mirror: cols <= 4 && rows === 1,
      artFacesRight: art.facesRight !== false,
      row: Math.min(row, rows - 1),
      recol,
      alt: null,
    };
    /* A SECOND POSE IS NOT A SECOND CROWD. Its matrices are written alongside
       its owner's in `_stepFolk`, and it is kept off `folkSets` so nothing that
       counts villagers or sheets counts it twice; its material still fades with
       everybody else's. */
    if (listed) this.folkSets.push(set);
    return set;
  }

  /**
   * The four lines of shader that make a shared atlas instanceable.
   *
   * IT IS `Billboard._setCell`, MOVED ONTO THE CARD. Non-flipped:
   * `u = uv.x * (w - 2i) + (c * w + i)`. Flipped, three.js does it with a
   * NEGATIVE repeat, which is the same thing as mirroring `uv.x` first — so one
   * `mix` covers both and the arithmetic below is identical to the CPU's. The
   * row term is `1 - (r + 1) * h`, because three's UV origin is bottom-left and
   * every atlas in this game is authored top-down.
   *
   * `customProgramCacheKey` IS NOT OPTIONAL. Without it three caches the
   * compiled program by material type and defines, and the second sheet with
   * different `cols` would silently be handed the first sheet's program.
   */
  _folkMatFor(texture, cols, rows, insetU, insetV) {
    const scale = new THREE.Vector2(1 / cols - insetU * 2, 1 / rows - insetV * 2);
    const mat = this._keep(new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      /* LOW ENOUGH TO FADE THROUGH, for the reason `_mkFig` gives: three tests
         the FINAL alpha, so a crowd at 0.3 opacity with the shipped 0.35 would
         not dim, it would vanish on one frame. */
      alphaTest: 0.06,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      opacity: 0,
    }));
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.cellScale = { value: scale };
      sh.vertexShader = `attribute vec2 cellOff;
attribute float cellFlip;
attribute vec4 recol;
uniform vec2 cellScale;
varying vec4 vRecol;
${sh.vertexShader}`.replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
  vRecol = recol;
#ifdef USE_MAP
  vMapUv = vec2( mix( vMapUv.x, 1.0 - vMapUv.x, cellFlip ), vMapUv.y ) * cellScale + cellOff;
#endif`
      );
      sh.fragmentShader = `${FOLK_RECOLOUR_GLSL}
${sh.fragmentShader}`.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
  diffuseColor.rgb = folkRecolour( diffuseColor.rgb, vRecol );`
      );
    };
    mat.customProgramCacheKey = () => `folk-cell-${cols}-${rows}`;
    this.folkMats.push(mat);
    return mat;
  }

  /**
   * The red bridge, in the model, as one merged mesh.
   *
   * ITS LENGTH AND ITS WIDTH ARE THE REAL ONE'S, AT THE MODEL'S SCALE, AND
   * NOTHING HERE IS TYPED. `world.bridgeSpan` publishes the three numbers the
   * full-size deck is built from; `scaleK` is the only thing this multiplies
   * them by.
   *
   * "THE BRIDGE IS TOO BIG COMPARED TO EVERYTHING ELSE." It was
   * `Math.max(2.0, 18 * scaleK)` — a FLOOR of two units under a true length of
   * 0.94, so on this world the bridge was drawn at 2.1x size, on an island 5.0
   * across, beside houses 0.53 wide. The floor was there to stop a very large
   * world shrinking the landmark away; what it actually did was guarantee the
   * landmark was wrong on the only world that exists. A minimum is expressed
   * against the ISLAND it sits on now, not against a constant, so it can no
   * longer be bigger than its own town.
   *
   * ALONG X, because `_stepBridge` already says the deck is the x axis and the
   * two have to agree — the kittens who run it full-size and the kittens who
   * land on it here are reading the same fact about the same bridge.
   */
  _miniSpanGeo() {
    const sp = this.world?.bridgeSpan;
    const parts = buildBridge(sp?.len ?? 18, sp?.wide ?? 4.4);
    transformParts(parts, 0, 0, 0, Math.PI / 2, this.scaleK);
    const geo = mergeParts(parts);
    for (const g of parts) g.dispose();
    return geo;
  }

  /**
   * Where the i-th of n kittens lands on the model's bridge: ON the deck, up
   * its arch.
   *
   * THE HUDDLE WAS A CIRCLE AND THE BRIDGE IS NOT. A ring a third of the span's
   * LENGTH across put two of the four a length and a half of the deck's WIDTH
   * off each side of it, standing in the air. So they land in a line along it,
   * spread over the middle seven-tenths, a half-step either side of the rail
   * line so they do not stand inside each other, and at the height of the arch
   * where each one lands — `buildBridge`'s own sine, times the model's scale.
   */
  _deckSpot(i, n) {
    const b = this.miniBridge;
    const sp = this.world?.bridgeSpan;
    const K = this.scaleK;
    const len = (sp?.len ?? 18) * K;
    const wide = (sp?.wide ?? 4.4) * K;
    const u = 0.5 + ((i + 0.5) / Math.max(1, n) - 0.5) * 0.7;
    const top = Math.sin(u * Math.PI) * (sp?.rise ?? 2.2) * K + 0.15 * K;
    return this._spot(b.host ?? null, b.local.x + (u - 0.5) * len, b.local.y + top,
      b.local.z + (i % 2 ? 1 : -1) * wide * 0.12);
  }

  /** One unit circle, shared by every kitten's flourish ring. Built on first
   *  ask because `_buildCast` runs before `_buildShapes`, and there is exactly
   *  one of it either way. */
  _bridgeRing() {
    if (!this._ringGeo) this._ringGeo = this._keep(ringGeo(40));
    return this._ringGeo;
  }

  _isleNearest(x, z) {
    let best = null;
    let bd = Infinity;
    for (const i of this.isles) {
      const d = Math.hypot(i.home.x - x * this.scaleK, i.home.z - z * this.scaleK);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  /**
   * The angle and the circles she names, in the one visual language the whole
   * shot is already speaking.
   *
   * "Would be good if we can show 'angles' between all the players and the
   * islands and circle connecting the players with the islands, show them
   * expanding the circle while navigating between the islands. We can show
   * multiple circles and can try to make them look more 3D... starting thicker
   * from base and narrowing as moving more vertically upwards to create a cool,
   * holographic effect... Use Iron Man holographic UI design."
   *
   * THE ANGLES ARE BETWEEN THE KITTENS AND THE ISLANDS, AND THEY ARE REAL. Each
   * arm runs from the middle of the model to a kitten who is actually standing
   * on an actual island, and each arc closes the angle between two of them — so
   * when Patchfur says "an angle" the picture is the angle the four of them are
   * making, live, not a diagram parked over the top of them. Same rule the
   * Kotodama orb follows: it draws its working from the numbers that position
   * it.
   *
   * "THICKER AT THE BASE" IS SEVERAL LINES, BECAUSE WEBGL HAS ONE WIDTH.
   * `LineBasicMaterial.linewidth` is ignored by every browser — it is a
   * documented dead end, not an oversight — so a thick ring is a stack of thin
   * ones a hair apart, and a ring that thins as it climbs is a stack that gets
   * shorter. Four loops at the bottom tier down to one at the top, sharing one
   * geometry and one material: fourteen line loops, one draw call each, and no
   * texture anywhere in it.
   */
  _buildShapes() {
    this.shapes = new THREE.Group();
    this.shapes.visible = false;
    this.model.add(this.shapes);

    /* --- the angle: an arm per kitten, and an arc between neighbours ----- */
    this.angleMat = this._lineMat(0xffd76a, 0);
    this.angleFx = new THREE.Group();
    this.arms = [];
    this.wedges = [];
    /* ONE GEOMETRY, SEVERAL MESHES, OFFSET IN Y. See `HUD_FAT`: this is the
       whole of "thicker" in a renderer that only draws hairlines. The copies
       share a buffer, so writing the line once updates all of them. */
    const fat = (geo) => {
      const g = this._keep(geo);
      const skin = [];
      for (let j = 0; j < HUD_FAT; j++) {
        const l = new THREE.Line(g, this.angleMat);
        l.position.y = j * 0.055;
        this.angleFx.add(l);
        skin.push(l);
      }
      return g;
    };
    for (let i = 0; i < PLAYER_STYLE.length; i++) {
      this.arms.push({ geo: fat(lineGeo(2)) });
      /* AND EVERY WEDGE SAYS WHAT IT IS WORTH. "With the 'angle' part can show
         the theta signa and value for the values of the angle being made by the
         connecting parts." Same glyph, same colour and the same `live` reserve
         as the Dojo's own readout — this is the same measurement in a smaller
         world, and a kid who has stood in the circle should recognise it.

         `live` IS NOT OPTIONAL HERE. The number moves every frame while the
         four of them walk, and a `setText` that mints a texture per distinct
         string is the bug that used to kill the Dojo on a phone: four labels
         cycling 0-360 is 1440 supersampled canvases that are never freed. See
         `CACHE` in label.js. The reserve is the widest string it can ever
         show. */
      /* AND IT IS THE ONE PIECE OF THIS FILE THAT NEEDS A DOM. `Label` paints
         its glyphs onto a canvas, and `world-check` builds this whole show in
         Node to assert against it — so a label built unconditionally turns
         every finale assertion in the suite into a `document is not defined`.

         NOT SHIMMED, SKIPPED. A fake canvas in the checker would be a second
         implementation of text measurement that nothing else in the game uses,
         and the honest statement is the ninth non-negotiable's: the angle is
         still drawn, still measured and still correct without its readout, in
         exactly the way a missing sprite sheet costs a gesture and not a
         character. Everything downstream tests for the label. */
      const lbl = typeof document === 'undefined' ? null : new Label('', {
        height: 2.0, size: 62, color: '#ffd76a', stroke: '#2a1c06', strokeWidth: 9,
        fixedScreenSize: true, live: 'θ = 360°',
      });
      if (lbl) lbl.visible = false;
      /* A LIVE LABEL OWNS ITS CANVAS AND NOTHING ELSE WILL FREE IT. `Label` has
         no `dispose` — the static ones are shared out of a cache that never
         evicts, so there is nothing to free — but a `live` one mints its own
         texture, and the ending can be played more than once in an afternoon.
         Three pieces, handed to the same list that frees every geometry and
         material in this file. */
      if (lbl) {
        this._keep(lbl.mat);
        this._keep(lbl.mat.map);
        this._keep(lbl.mesh.geometry);
        this.angleFx.add(lbl);
      }
      this.wedges.push({
        geo: fat(lineGeo(18)), tick: { geo: fat(lineGeo(2)) }, lbl,
      });
    }
    this.shapes.add(this.angleFx);

    /* --- the circles: a tapering stack, and two counter-spun reticles ---- */
    this.circleMat = this._lineMat(0x8fe0ff, 0);
    this.circleFx = new THREE.Group();
    this.tiers = [];
    const loop = this._keep(ringGeo(96));
    const TIERS = 5;
    for (let i = 0; i < TIERS; i++) {
      const dup = Math.max(1, 4 - i);
      const skin = [];
      for (let j = 0; j < dup; j++) {
        const l = new THREE.LineLoop(loop, this.circleMat);
        this.circleFx.add(l);
        skin.push(l);
      }
      this.tiers.push({ skin, k: i / (TIERS - 1) });
    }
    this.shapes.add(this.circleFx);

    this.reticleMat = this._lineMat(0xffd76a, 0);
    this.reticles = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      /* TWO ARCS FACING EACH OTHER, TURNING OPPOSITE WAYS to the tier under
         them. It is the one gesture that separates a holographic readout from
         a set of concentric circles, and it costs four lines and no texture. */
      const ga = this._keep(arcGeo(1.1 + i * 0.5));
      const gb = this._keep(arcGeo(0.7 + i * 0.3));
      for (let j = 0; j < HUD_FAT; j++) {
        const a = new THREE.Line(ga, this.reticleMat);
        const b = new THREE.Line(gb, this.reticleMat);
        a.position.y = j * 0.05;
        b.position.y = j * 0.05;
        b.rotation.y = Math.PI;
        g.add(a, b);
      }
      this.shapes.add(g);
      this.reticles.push({
        g, spin: (i % 2 ? -1 : 1) * (0.5 + i * 0.22),
        r: 0.5 + i * 0.2, y: i * (MINI_R * 0.2),
      });
    }
  }

  /**
   * The little cast: one kitten per style, a dragon each, and Mr Satan.
   *
   * BY STYLE AND NOT BY SEAT, exactly as `Game.warpArt` and the rest are built.
   * The ending plays at two players as often as at four, and a model of the
   * world with two cats in it while she says "you crossed" to four of them
   * would be the scene disagreeing with the room.
   */
  _buildCast() {
    const sheets = this.cast?.kittens ?? [];
    const bless = this.cast?.bless ?? [];
    for (let i = 0; i < PLAYER_STYLE.length; i++) {
      const a = sheets[i];
      if (!a?.texture) continue;
      const mini = this._mkFig(a, this._quad(a, MINI_H));
      mini.bb.mesh.renderOrder = RO_KIT;
      this.model?.add(mini.bb);
      const big = this._mkFig(a, this._quad(a, REAL_H));
      this.group.add(big.bb);
      /* HER CHEER, WHICH IS A SECOND DRAWING AND NOT A ROW. The blessing pose
         is its own one-cell sheet per style — `Game.blessArt` — so it is a
         second quad parked at the same spot with one of them visible, exactly
         the way Mr Satan's charge pose works. SIZED WITH `BLESS_STRETCH`,
         which is `player.js`'s own measurement of this exact drawing against
         this exact kitten — an ear span, counted in pixels off both sheets —
         and not with `poseQuad`: the champion's two poses need ink area
         because nobody ever measured them against each other, and this pair
         has been. Missing art costs the cheer and nothing else. */
      let cheer = null;
      if (bless[i]?.texture) {
        cheer = this._mkFig(bless[i], this._quad(bless[i], REAL_H * BLESS_STRETCH),
          { cols: 1, rows: 1, mirror: false });
        this.group.add(cheer.bb);
      }
      /* ONE RING EACH, FOR WHATEVER SHE DOES WITH IT. The Smash lands inside
         it and the Orb rises out of it — one `LineLoop` per kitten, its own
         material so its own opacity, sharing one geometry. Four draw calls for
         nine seconds, and no texture: the same answer `_buildShapes` gives. */
      const ringMat = this._lineMat(PLAYER_STYLE[i].colour, 0);
      const ring = new THREE.LineLoop(this._bridgeRing(), ringMat);
      ring.visible = false;
      this.group.add(ring);
      /* AND ONE WARD BUBBLE EACH — the same two BackSide shells `Player` pops,
         in the same blue, because a kid who has worn 壁 has already learned
         what that drawing means and the last ten seconds of the game is not
         where to teach her a second one. Built once and hidden: this pops three
         or four times across nine seconds and a sphere allocated per press is
         how a cutscene hitches. */
      const ward = new THREE.Group();
      for (const [rr, col, op] of [[1.0, 0x9fd8ff, 0.22], [0.82, 0xe8f6ff, 0.10]]) {
        ward.add(new THREE.Mesh(
          this._keep(new THREE.IcosahedronGeometry(REAL_H * 0.62 * rr, 2)),
          this._keep(new THREE.MeshBasicMaterial({
            color: col, transparent: true, opacity: op, side: THREE.BackSide,
            depthWrite: false, toneMapped: false,
          }))
        ));
      }
      ward.visible = false;
      this.group.add(ward);
      /* ...AND THE SMOKE SHE VANISHES IN. 瞬 Flash Step takes her off the screen
         for half a second and a sprite that simply switches off reads as the
         game dropping a frame — `systems/dodgefx.js` says so at length and this
         is the same rule in a cutscene. Four soft balls, one material each so
         each can fade on its own, allocated once: the alternative is minting
         geometry in the middle of the ending. */
      const puff = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        puff.add(new THREE.Mesh(
          this._keep(new THREE.IcosahedronGeometry(0.5, 1)),
          this._keep(new THREE.MeshBasicMaterial({
            color: 0xf6f2ea, transparent: true, opacity: 0,
            depthWrite: false, toneMapped: false,
          }))
        ));
      }
      puff.visible = false;
      this.group.add(puff);
      this.kits.push({
        mini, big, cheer, colour: PLAYER_STYLE[i].colour, i,
        seed: (i / PLAYER_STYLE.length) * TAU, from: null, to: null, k: 0, hop: 0,
        ring, ringMat, ward, puff,
      });
    }

    /* THE RUNNER IS ONE OF THEM, FULL SIZE, ON THE PAINTED CIRCLE — she is a
       kitten walking the rim of the Dojo, which is the thing the island is
       for. She also IS the lesson's driver; see `drivers()`. */
    const first = sheets.find((a) => a?.texture);
    if (first) {
      const fig = this._mkFig(first, this._quad(first, REAL_H));
      /* SHE FADES IN FRONT OF THE HOLOGRAM, NOT UNDERNEATH IT.
         "When the player is fading out as holographic islands are fading in,
         they are fading to a weird green color."

         She was, and nothing was tinting her — `#cs-fade` is `#000` and there
         is no green light in this scene. What was green was THE MODEL, which is
         sixteen units of meadow and bamboo island hanging at `MINI_Y` over the
         floor she is running on, fading UP over the same second she is fading
         DOWN. She orbits at R 24 and the model reaches 16 plus its overshoot,
         so from the Dojo camera a good part of her circle passes behind it.
         Two transparent objects sort back to front, so the hologram was drawn
         OVER her: at a model on 0.7 and a kitten on 0.5 the pixel is 82% green
         and 15% cat, which is a green smear of the right shape.

         Drawn last instead, the same frame is 50% cat over 35% green — she
         reads as herself dissolving, which is the cross-fade this was always
         meant to be. `depthTest` has to go with the render order: `_holoMat`
         writes depth, so a figure drawn after it and behind it would not be
         tinted, it would be gone. Nothing else in this scene stands where she
         does, so there is nothing for her to wrongly cover. */
      fig.bb.mat.depthTest = false;
      fig.bb.mesh.renderOrder = 20;
      this.group.add(fig.bb);
      const c = this.world.dojoCentre ?? new THREE.Vector3();
      this.runner = { ...fig, on: false, done: false, a: 0.4, centre: c.clone() };
      this._drivers = [{ position: new THREE.Vector3(), mount: null }];
    }

    const dragon = this.cast?.dragon;
    if (dragon?.texture) {
      /* ONE PER ISLAND, UP TO SIX, AND THEY LIVE THERE. "Can have tiny dragons
         on the islands to make it look like the islands and to look cool as a
         tiny miniature version of them." Two of them are still the ones the
         kittens ride when they cross; the rest sit on their own island and
         bob, which is what a dragon on a perch does all afternoon. */
      for (let i = 0; i < 6; i++) {
        const d = this._mkFig(dragon, this._quad(dragon, MINI_H * 1.5), { mirror: false });
        d.bb.visible = false;
        d.bb.mesh.renderOrder = RO_DRAGON;
        this.model?.add(d.bb);
        const host = this.isles[i % Math.max(1, this.isles.length)] ?? null;
        this.drags.push({ ...d, seed: i * 1.7, riding: null, host, perch: null });
      }
      for (let i = 0; i < 2; i++) {
        const d = this._mkFig(dragon, this._quad(dragon, MINI_H * 1.5), { mirror: false });
        d.bb.visible = false;
        d.bb.mesh.renderOrder = RO_DRAGON;
        this.model?.add(d.bb);
        this.drags.push({ ...d, seed: 11 + i, riding: null, host: null, perch: null, mount: true });
      }
      for (const d of this.drags) {
        if (!d.host) continue;
        const a = Math.random() * TAU;
        d.perch = { x: Math.cos(a) * d.host.r * 0.6, z: Math.sin(a) * d.host.r * 0.6 };
      }
    }

    const satan = this.cast?.satan;
    if (satan?.texture) {
      const s = this._mkFig(satan, poseQuad(REAL_H * 2.1, satan, satan));
      s.bb.visible = false;
      this.group.add(s.bb);
      this.satan = s;
      const charge = this.cast?.satanCharge;
      if (charge?.texture) {
        const q = poseQuad(REAL_H * 2.1, satan, charge);
        this.satanUp = this._mkFig(charge, q, { cols: 1, rows: 1, mirror: false });
        this.group.add(this.satanUp.bb);
      }
    }
  }

  /**
   * How big a quad has to be for a drawing to come out the height asked for.
   *
   * THE SAME ONE LINE THE REST OF THE GAME USES, and leaving it out is why the
   * four of them cheered with their feet through the floor of the ring: the art
   * only fills part of its square cell, `contentScale` is the measured fraction
   * it fills, and a quad sized to the requested height draws a character short
   * by exactly that factor with the pivot in the wrong place to match. Eighth
   * non-negotiable — the number comes off the loaded atlas.
   */
  _quad(art, height) { return height / (art?.contentScale || 1); }

  _mkFig(art, quad, over = {}) {
    const bb = new Billboard(art.texture, {
      cols: art.cols ?? 1,
      rows: art.rows ?? 1,
      width: quad,
      height: quad,
      mirror: (art.cols ?? 1) <= 4 && (art.rows ?? 1) === 1,
      footOffset: (art.pad ?? 0) * quad,
      ...over,
    });
    bb.visible = false;
    /* LOW ENOUGH TO FADE THROUGH. `Billboard` ships `alphaTest: 0.35`, which is
       right for a kitten standing in the world — it is what keeps her quad from
       sorting against the grass — and wrong for anybody in this scene, because
       three.js tests the FINAL alpha: a figure faded to 0.3 opacity would not
       dim, it would vanish on one frame. */
    bb.mat.alphaTest = 0.08;
    this._disposables.push(bb.mat, bb.tex);
    return { bb, quad };
  }

  /**
   * Square a billboard to the lens when it is standing on something that turns.
   *
   * THE BUG THIS FIXES WAS REPORTED AS "THE PLAYERS ARE RIGHT NOW 2D CUTOUT
   * LOOKING AND ARE NOT FACING THE CAMERA PROPERLY WHILE NAVIGATING THE
   * ISLAND." `Billboard.faceCamera` writes a LOCAL yaw (`mesh.rotation.y`) and
   * picks its atlas cell from `facing - camAngle`, and both of those are only
   * correct when the billboard's parent has no rotation of its own. The minis
   * are parented to `this.model`, which turns at `t * 0.12` for the whole beat
   * — so every one of them was yawed by the model's rotation ON TOP of the
   * camera angle and spent most of the shot edge-on, which is exactly what a
   * cardboard cut-out looks like.
   *
   * SO THE PARENT'S YAW IS ADDED GOING IN AND TAKEN OFF COMING OUT. `facing`
   * is written in model-local space by the steps below (it is derived from
   * positions inside the model), so it is lifted to world space for the cell
   * choice; `mesh.rotation.y` comes back as a world angle and is dropped into
   * local space so the mesh ends up square to the lens. Doing it here rather
   * than inside `Billboard` on purpose: every other billboard in the game is
   * parented to something that does not turn, and a general fix would make the
   * common case pay for the rare one.
   */
  _face(bb, camera, yaw) {
    if (!yaw) { bb.faceCamera(camera); return; }
    const f = bb.facing;
    bb.facing = f + yaw;
    bb.faceCamera(camera);
    bb.facing = f;
    bb.mesh.rotation.y -= yaw;
  }

  /* -------------------------------- cueing ------------------------------- */

  /** Put a ring on one of the three things she is naming. */
  _light(which) {
    const at = this.marks?.trioSpots?.[which];
    const r = this.rings[which];
    if (!at || !r) return;
    r.at = at;
    r.r = at.r ?? 2.2;
    r.t = 0;
  }

  /** Everybody picks an island to run to. */
  _seedCross() {
    if (!this.isles.length) return;
    for (const k of this.kits) {
      k.from = this._pickIsle(null);
      k.to = this._pickIsle(k.from?.isl ?? null);
      /* BEHIND THE LINE, NOT PART WAY DOWN IT. `k.k` was 0-0.4, so every cat
         appeared mid-leap; below zero is standing on `from` (the step clamps
         the path at 0), which is what the stand before this shows — and they
         still leave a beat apart rather than as a chorus line. */
      k.k = -Math.random() * 0.4;
      k.hop = 0;
    }
    /* THE MOUNTS ARE THEIR OWN TWO DRAGONS. They used to be the first two of the
       six perched ones, which then vanished off their islands the moment the
       ride began — a dragon leaving its perch by blinking out. */
    this.drags.filter((d) => d.mount).forEach((d, i) => {
      d.riding = this.kits[this.kits.length - 1 - i] ?? null;
    });
  }

  /**
   * ...and then everybody goes to the same place at the same time.
   *
   * TO THE SAME PLACE, NOT TO THE SAME POINT. Sent to one coordinate all four
   * of them land inside each other and the shot reads as one kitten — which is
   * the opposite of the line it plays under, "show all the virtual versions of
   * players all jumping together at the same time". So they close on a ring
   * around the mark instead, spaced by index: four cats landing in a huddle,
   * which is a thing four cats do and one cat cannot.
   *
   * THE RING IS TIGHTER FOR THE BRIDGE. That leap ends on a span two units
   * wide; a huddle the size of the one they make in open ground would have
   * half of them standing in the air beside it.
   */
  _seedLeap() {
    const bridge = this.phase === 'isles-bridge' && this.miniBridge;
    const target = bridge ? this._bridgeSpot() : this._spot(null, 0, 1.6, 0);
    /* THE RING IS THE BRIDGE'S OWN LENGTH NOW. It was 0.55 against a deck that
       was 2.0 units long because of a floor nobody had measured; the deck is
       0.94 now, so a huddle spaced off a constant would have had two of them
       standing in the sea beside it. Solved off `bridgeSpan` through `scaleK`,
       like everything else about that crossing. */
    const deck = (this.world?.bridgeSpan?.len ?? 18) * this.scaleK;
    const ring = bridge ? deck * 0.34 : 1.15;
    const n = Math.max(1, this.kits.length);
    for (let i = 0; i < this.kits.length; i++) {
      const k = this.kits[i];
      const a = (i / n) * TAU;
      k.from = this._here(k.mini.bb);
      k.to = bridge
        ? this._deckSpot(i, n)
        : this._spot(target.isl,
          target.ox + Math.cos(a) * ring, target.oy, target.oz + Math.sin(a) * ring);
      k.k = 0;
    }
    for (const d of this.drags) d.riding = null;
  }

  /**
   * A place on the model, said in a way that is still true next frame.
   *
   * THE BUG THIS SHAPE FIXES WAS REPORTED AS "THERE ARE SOME ISSUES WITH THE
   * WAY THE PLAYERS AND THE DRAGONS ARE TRAVERSING BETWEEN THE ISLANDS. SEEMS
   * THEY MAY BE MOVING TO OLD LOCATIONS THAT NO LONGER MATCH WITH WHERE THE
   * ISLANDS ACTUALLY ARE." They were, and the model's rotation was NOT why —
   * every mini kitten and every mini dragon is parented to `this.model`, so
   * they turn with it (see `_buildCast`, and `_face`, which exists because of
   * it). What they were not parented to was the ISLAND.
   *
   * `_pickIsle` used to snapshot `isl.g.position` into an absolute
   * `Vector3` at the moment the cue fired. Every island then moved: out from
   * the huddle to its home over `DRIFT` seconds, overshooting by `OVERSHOOT`,
   * bobbing by 0.12, and — this is the one that made it obvious — RISING, from
   * `nearY` to `farY`, which on this world is a spread of 0.00 to 2.40. So a
   * kitten spent the whole drift running at the coordinates her island had
   * been standing at before it left, and landed under it.
   *
   * AND THE HEIGHT WAS TYPED. `y: 0.25` was an absolute height in model space
   * for a target on an island whose own deck is at `isl.g.position.y + 0.08`.
   * On the town, which sits at zero, that is very nearly right; on the dusk
   * island at 2.40 it is two whole island-thicknesses underground.
   *
   * SO A SPOT IS AN OFFSET AND THE ISLAND IT IS AN OFFSET FROM, and `_resolve`
   * adds them up every frame — the same "rides the island it is anchored to"
   * idiom the bridge slats have always used, which is why the spans bend and
   * tear for free. A spot with no island is a free point in model space (the
   * middle of the world, or wherever a kitten happened to be standing when a
   * leap began) and resolves to itself.
   */
  _spot(isl, ox, oy, oz) { return { isl, ox, oy, oz }; }

  _resolve(sp, out) {
    if (!sp) return out.set(0, 0, 0);
    const p = sp.isl?.g?.position;
    return p
      ? out.set(p.x + sp.ox, p.y + sp.oy, p.z + sp.oz)
      : out.set(sp.ox, sp.oy, sp.oz);
  }

  /** Where a kitten is standing right now, as a free spot. */
  _here(bb) { return this._spot(null, bb.position.x, bb.position.y, bb.position.z); }

  _bridgeSpot() {
    const b = this.miniBridge;
    if (!b) return this._spot(null, 0, 1.6, 0);
    /* ANCHORED TO THE ISLAND THE BRIDGE IS BUILT ON, which is the whole point:
       `isles-bridge` plays while the islands are fully drifted and still
       bobbing, and four cats aimed at where the crossing USED to be is the
       last shot of the model. */
    return this._spot(b.host ?? null, b.local.x, b.local.y + 0.6, b.local.z);
  }

  /**
   * Somewhere to stand on an island that is not the one you are leaving.
   *
   * `not` IS AN ISLAND NOW, NOT A POINT. It was being handed a `Vector3`, which
   * never matched anything in `this.isles`, so the filter never excluded
   * anything and a kitten's next crossing could be to the island she was
   * already standing on — a jump in place, on the line about crossing.
   */
  _pickIsle(not) {
    const pool = this.isles.filter((i) => i !== not);
    if (!pool.length) return null;
    const isl = pool[Math.floor(Math.random() * pool.length)];
    const a = Math.random() * TAU;
    const rr = isl.r * 0.55;
    /* 0.1 IS THE TOP OF THE ISLAND. The land disc is 0.16 thick and centred on
       the island's own origin, so its surface is at +0.08 — everything
       `_isleDetail` plants stands on 0.08 too. */
    return this._spot(isl, Math.cos(a) * rr, 0.1, Math.sin(a) * rr);
  }

  /**
   * Line them up on the road, a second apart, and start them running at the
   * bridge with a move list each.
   *
   * THE STAGGER IS NEGATIVE `k` AND NOT A TIMER. `_stepBridge` already hides
   * anybody outside 0..1 of the path, so a kitten dealt `-2 * BR_GAP * BR_RATE`
   * is simply two seconds of path behind the start line and walks into
   * existence when she gets there — no second clock, and nothing to get out of
   * step with the one that moves her.
   *
   * AND THE MOVE LIST IS PLACES, NOT TIMES. See `BR_SCRIPT`. Each row is dealt
   * whole, the fillers are dropped in where they do not crowd anything already
   * on the list, and the lot is sorted so `_stepBridge` only ever has to look at
   * the next one.
   */
  _seedBridge() {
    const b = this.world?.bridge;
    if (!b) return;
    /* THE CROSSING'S OWN NUMBERS, once, so every use below is the same bridge.
       See `World.bridgeSpan` — these were three literals in this file and three
       more in `_miniSpanGeo`. */
    const sp = this.world?.bridgeSpan;
    this.brLen = sp?.len ?? 18;
    this.brRise = sp?.rise ?? 2.2;
    this.brWide = sp?.wide ?? 4.4;
    this.brPath = BR_UP + this.brLen + BR_OFF;
    /* PUBLISHED, because `world-check` has to be able to ask where the road
       starts without a second copy of these two numbers to drift from them. */
    this.brUp = BR_UP;
    this.brOff = BR_OFF;
    this.brRate = BR_RATE;
    for (let i = 0; i < this.kits.length; i++) {
      const k = this.kits[i];
      /* SPREAD ACROSS THE DECK, AND NOT IN A RULED LINE. Four cats abreast on
         a 4.4-unit bridge is a wall, so the lanes are still dealt out by index
         — that part has to stay spread or they overlap — but the wobble on top
         of it is what stops four evenly spaced cats reading as a formation.
         Measured off the deck rather than typed, so the lanes cannot end up
         hanging over the rails of a narrower bridge. */
      k.lane = (i - (this.kits.length - 1) / 2) * (this.brWide * 0.25)
        + (Math.random() - 0.5) * this.brWide * 0.12;
      k.k = -i * BR_GAP * BR_RATE;

      /* HER OWN ROW OF THE SCRIPT, PLUS A COUPLE OF HOPS. A filler within 0.07
         of something already on the list is dropped rather than moved: two
         moves on top of each other is the one thing this structure cannot
         express, because the second would cut the first off at the knees, and
         that is the fault this whole rewrite exists to answer. */
      const list = (BR_SCRIPT[i % BR_SCRIPT.length] ?? [])
        .map(([at, kind]) => ({ at, kind }));
      for (const at of BR_FILL) {
        const jitter = at + (Math.random() - 0.5) * 0.06;
        if (list.some((m) => Math.abs(m.at - jitter) < 0.07)) continue;
        if (list.some((m) => m.kind === 'float' && jitter > m.at && jitter < m.at + BR_FLOAT_SPAN)) continue;
        list.push({ at: jitter, kind: 'jump' });
      }
      list.sort((x, y) => x.at - y.at);
      k.moves = list;
      k.next = 0;

      /* WHERE SHE IS IN THE AIR, AND WHAT SHE IS DOING WITH IT. `air` is height
         above whatever she is standing on — road or deck, the arch is solved
         separately — and `vy` is the only thing that changes it. `jumps` is how
         many shoves she has spent since she last had her feet down, which is
         what makes a double jump a double jump and not two singles. */
      k.air = 0;
      k.vy = 0;
      k.jumps = 0;
      k.mv = null;
      k.mvT = 0;
      k.hang = 0;
      k.ringT = 0;
      k.puffT = 0;
      k.gone = false;
      k.big.bb.visible = true;
      k.big.bb.mesh.scale.set(1, 1, 1);
      if (k.ward) k.ward.visible = false;
      if (k.ring) k.ring.visible = false;
      if (k.puff) k.puff.visible = false;
    }
  }

  /**
   * Everybody in the ring, around the champion, looking at him.
   *
   * "Can have Mr. Satan standing in the center of the 4 players and have all
   * the players facing him." He used to stand off to one side with the four of
   * them in an arc facing the camera, which is a team photograph; this is a
   * challenge. The circle is solved from the ring's own half-width, so it is
   * the right size for the ring that is actually there.
   */
  _seedArena() {
    const R = this.world?.arenaRing;
    const n = Math.max(1, this.kits.length);
    for (let i = 0; i < this.kits.length; i++) {
      const k = this.kits[i];
      /* A QUARTER TURN OFF THE AXIS, so that at two players they flank him
         rather than standing one in front and one behind — which from any
         camera is one kitten hidden by a cat twice her size. */
      const a = Math.PI / 2 + (i / n) * TAU;
      const rr = (R?.half ?? 14) * 0.46;
      k.stand = R
        ? new THREE.Vector3(R.x + Math.sin(a) * rr, R.y, R.z + Math.cos(a) * rr)
        : null;
      k.big.bb.visible = !!k.stand;
    }
    /* HE IS ONLY IN THIS SHOT IF THERE IS A RING TO STAND IN. Held as a flag
       rather than inferred from his coordinates: a champion parked at the
       origin and a champion who was never placed are the same three numbers,
       and the difference is whether the last shot of the game has a man
       standing in the middle of the sea. */
    this.satanLit = !!(this.satan && R);
    if (this.satanLit) {
      /* THE MIDDLE OF THE RING, which is where a champion stands. */
      this.satan.bb.position.set(R.x, R.y, R.z);
      this.satanUp?.bb.position.set(R.x, R.y, R.z);
    }
    /* AND THEY ARRIVE ON THIS CUE, not on whichever one happens to be running.
       The drop is measured on the arena's own clock so that `arena-raise`
       landing a second later — it is a `keep` row, it does not cut — cannot
       restart the bounce under a man who has just thrown his arms up. */
    this.arenaT = 0;
  }

  /* -------------------------------- drawing ------------------------------ */

  update(dt, camera) {
    if (!this.running) return;
    this.t += dt;
    this.phaseT += dt;

    /* ONE OWNER FOR EVERY FIGURE'S VISIBILITY, and it is the step that is
       using it. Hiding the whole full-size cast here first means a phase that
       forgets to put somebody away cannot leave a kitten standing in the sky
       for the rest of the ending — which is the failure this scene is least
       able to survive, since the last shot is the whole archipelago. */
    for (const k of this.kits) {
      k.big.bb.visible = false;
      if (k.cheer) k.cheer.bb.visible = false;
      if (k.ward) k.ward.visible = false;
    }
    if (this.satan) this.satan.bb.visible = false;
    if (this.satanUp) this.satanUp.bb.visible = false;

    this._stepFade(dt);
    this._stepRings(dt);
    this._stepRunner(dt);
    this._stepModel(dt, camera);
    this._stepBridge(dt);
    this._stepArena(dt);

    if (camera) {
      /* THE MODEL'S OWN TURN, handed to every billboard standing on it. See
         `_face` — this is the number that was missing. */
      const yaw = this.model?.rotation.y ?? 0;
      for (const k of this.kits) {
        if (k.mini.bb.visible) this._face(k.mini.bb, camera, yaw);
        if (k.big.bb.visible) k.big.bb.faceCamera(camera);
        if (k.cheer?.bb.visible) k.cheer.bb.faceCamera(camera);
      }
      for (const d of this.drags) if (d.bb.visible) this._face(d.bb, camera, yaw);
      if (this.runner?.bb.visible) this.runner.bb.faceCamera(camera);
      if (this.satan?.bb.visible) this.satan.bb.faceCamera(camera);
      if (this.satanUp?.bb.visible) this.satanUp.bb.faceCamera(camera);
    }
  }

  /**
   * The cross-fade between a kitten running the Dojo and a world arriving on
   * its floor.
   *
   * ITS OWN CLOCK, AND THAT IS THE WHOLE FIX. `isles-wake` fires while the
   * Dojo shot is still on screen — a `keep` row in `FINALE_SHOTS`, on the end
   * of "all afternoon." — and then six `isles-*` cues arrive over the next
   * fifteen seconds. Solving the fade from `phaseT` meant every one of those
   * cues restarted it, so the model blinked out and back on each line she
   * spoke. Chasing a target instead survives the cuts, which is the one thing
   * a cross-fade has to do.
   *
   * AND THE RUNNER DOES NOT COME BACK. "When the player fades out, let's also
   * remove them as currently, they are fading in/out with the other players in
   * the cutscene which looks bad and we no longer need the player shown running
   * around the dojo." Once she is gone she is `done`, and nothing can show her
   * again for the rest of the scene.
   */
  _stepFade(dt) {
    const P = this.phase ?? '';
    const wantModel = P.startsWith('isles-') ? 1 : 0;
    this.modelOn = Math.max(0, Math.min(1,
      this.modelOn + (wantModel ? dt / MODEL_IN : -dt / WAKE)));

    /* SHE HOLDS, THEN SHE GOES, AND THE HOLD IS ON THE WAKE'S OWN CLOCK.
       Everything else about this pair is chased rather than solved, for the
       reason above — six cues arrive during the model's life and a solved fade
       would restart on each of them. The runner is the exception to the
       exception: she is only ever leaving, she leaves during exactly one cue,
       and what was asked for is a HOLD followed by a fade, which a chase toward
       a constant target cannot express. `Math.min` is what makes it one-way —
       nothing can bring her back up once the wake has begun, and `done` below
       is what makes that true for the rest of the scene. */
    const want = P === 'dojo-run'
      ? 1
      : (P === 'isles-wake'
        ? 1 - Math.max(0, Math.min(1, (this.phaseT - RUN_HOLD) / RUN_OUT))
        : 0);
    this.runnerOn = P === 'dojo-run'
      ? Math.max(0, Math.min(1, this.runnerOn + dt / (RUN_OUT * 0.5)))
      : Math.min(this.runnerOn, want);
    if (this.runner && this.runnerOn <= 0.001 && this.runner.a > 0.4) this.runner.done = true;
  }

  /**
   * Whether the Dojo's own live diagram should still be drawn.
   *
   * "When player completely fades out, the dojo sin/cos can stop following them
   * and can be removed moving forward, so that we can focus on the hologram
   * being shown."
   *
   * IT IS NOT THE SAME QUESTION AS `drivers()`. That one asks who steers theta,
   * and its answer went to null the moment she started fading — at which point
   * `MathDojo` did what it does on an empty island and began turning the point
   * by itself, at its own rate, in what reads from this camera as the opposite
   * direction to everything else on screen. "The sin/cos orb is rotating around
   * in the opposite direction which seems strange." A lesson with nobody in it
   * idling under a model of the world is two diagrams competing, and only one
   * of them is the one she is talking about.
   *
   * THE PAINTED CIRCLE STAYS. What goes is the LIVE layer — the radius vector,
   * the legs, the swept arc, the point and its four readouts. The circle and
   * the graph paper are the island, and the model is floating over them on
   * purpose.
   */
  lessonLive() {
    return !this.running || !this.runner?.done;
  }

  _stepRings(dt) {
    for (const r of this.rings) {
      if (r.t < 0) { r.mesh.visible = false; continue; }
      r.t += dt;
      const k = Math.min(1, r.t / 1.1);
      /* IT ARRIVES BIG AND CLOSES ON THE THING. A ring that simply appeared at
         the right size is a decoration; one that shuts around a barrel is a
         camera pointing at it, and it reads at any distance. */
      const s = r.r * (2.6 - 1.6 * (1 - (1 - k) * (1 - k)));
      r.mesh.position.set(r.at.x, r.at.y + 0.12, r.at.z);
      r.mesh.scale.set(s, 1, s);
      r.mat.opacity = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
      r.mesh.visible = k < 1;
      if (k >= 1) r.t = -1;
    }
  }

  /**
   * The kitten walking the rim of the unit circle, and the lesson reading her.
   *
   * SHE WALKS THE LINE, not a path of her own: `MathDojo`'s R is 24 and it
   * steers from whoever is closest to that radius, so putting her anywhere else
   * would have the diagram quietly showing `playerRadius` other than 1 in the
   * one shot that is about the unit circle.
   */
  _stepRunner(dt) {
    const r = this.runner;
    if (!r) return;
    if (r.done) { r.bb.visible = false; r.on = false; return; }
    const want = this.phase === 'dojo-run';
    const fade = this.runnerOn;
    if (!want && fade <= 0.02) { r.bb.visible = false; r.on = false; return; }

    r.a += dt * 0.5;
    const R = 24;
    const x = r.centre.x + Math.cos(r.a) * R;
    const z = r.centre.z + Math.sin(r.a) * R;
    r.bb.position.set(x, r.centre.y, z);
    /* FACING THE WAY SHE IS GOING — the tangent, which for a circle is the
       angle plus a quarter turn. A runner sliding round a circle facing the
       same way the whole time is a cardboard cut-out on a turntable. */
    r.bb.facing = Math.atan2(-Math.sin(r.a), -Math.cos(r.a)) + Math.PI / 2;
    r.bb.row = 1;
    r.bb.frame = Math.floor(this.t * 9) % Math.max(1, r.bb.cols);
    r.bb.mat.opacity = fade;
    r.bb.visible = fade > 0.02;
    /* `on` MEANS "STILL ON THE CIRCLE", NOT "STILL IN HER OWN SHOT."
       "The dojo rotating circle stops following them for some reason and
       rotates in the other direction, it should continue following them until
       they disappear and then should disable for consistency."

       `drivers()` returns null the instant this goes false, and `MathDojo` does
       what it does on an empty island: it turns theta by itself, at its own
       rate, which from this camera is the opposite direction to everything else
       on screen. It went false the frame the phase left `dojo-run` — with a
       second and a bit of her fade still to play — so the point let go of a
       kitten who was visibly still walking.

       The fade is the honest test: she is on the circle while she is drawn on
       it, and `lessonLive()` (which reads `done`, set once the fade reaches
       zero) is what switches the live layer off afterwards. One question each,
       and neither of them is the phase. */
    r.on = want || fade > 0.02;
    if (this._drivers[0]) this._drivers[0].position.set(x, r.centre.y, z);
  }

  /**
   * The world, in a box, doing what she says it did.
   *
   * ONE CLOCK PER PHASE AND NO HIDDEN STATE. Every position below is solved
   * from `phaseT` rather than integrated, so the model cannot drift, cannot
   * accumulate error over thirty seconds, and lands on exactly the same frame
   * whether it is watched at 30fps or 144.
   */
  _stepModel(dt, camera) {
    if (!this.model) return;
    const P = this.phase ?? '';
    const on = this.modelOn;
    for (const m of this.modelMats) m.opacity = on * 0.95;
    for (const m of this.folkMats) m.opacity = 0;
    this.model.visible = on > 0.02;
    if (!this.model.visible) {
      for (const k of this.kits) k.mini.bb.visible = false;
      for (const d of this.drags) d.bb.visible = false;
      if (this.shapes) this.shapes.visible = false;
      return;
    }

    /* THE WHOLE MODEL TURNS, SLOWLY, ALWAYS. It is a thing on a table and the
       camera is not moving much during these lines; without this it reads as a
       painting of islands rather than as a model of them. */
    this.model.rotation.y = this.t * 0.12;

    /* --- huddled, then shaking, then flung apart ------------------------- */
    const drifting = P === 'isles-drift' || P === 'isles-stand' || P === 'isles-cross'
      || P === 'isles-angle' || P === 'isles-circle'
      || P === 'isles-leap' || P === 'isles-bridge';
    const dk = P === 'isles-drift' ? Math.min(1, this.phaseT / DRIFT) : (drifting ? 1 : 0);
    /* THE EARTHQUAKE IS BEFORE THE MOVE, not during it. "Show them being next
       to each other, then shaking a bit (as if a global earthquake is
       happening) and then have them shoot apart." So the shake belongs to the
       huddle and dies as the drift takes over — the two must not be on screen
       at once or the islands look like they are vibrating in flight.

       AND IT DOES NOT START UNTIL THE MODEL HAS ARRIVED. "While fading in, the
       islands should be connected and should look stable and be stationary."
       The shake used to run off `isles-in`'s own clock, which begins the
       moment the line does — under a hologram that is still fading up. */
    /* AND `isles-wake` IS NOT `isles-in`. "When switching to the Dojo of the
       Turning Circle, when the hologram islands appear, they appear to be
       shaking when they should be stationary and should appear orderly."

       The guard above was written for the shot the shake belongs to and the
       fall-through caught the one it does not: during the wake `drifting` is
       false, so `dk` is 0, so `(1 - dk) * 0.16` is the FULL earthquake — under
       a hologram that is still arriving. The comment two lines up already said
       this was wrong ("it does not start until the model has arrived") and was
       only half enforced. A cue that is not about the islands moving gets no
       shake at all now, which is stated rather than arrived at. */
    /* AND NOW IT HAS ITS OWN WORD. "The islands shouldn't start shaking and
       separating until the words 'because something broke' is started to be
       said... That way, we can see the town in a 'stabilized' state longer."
       `isles-in` was a clock (0.4s settle, 1.4s ramp) under a line that had not
       said anything was wrong yet; `isles-quake` is cut to "because", measured
       off the recording (a tenth-of-a-second pause at 1.49s, the word at 1.59).
       So `isles-in` is the town, still, with people in it — which is also the
       shot the camera has just pushed in to look at. */
    const shake = P === 'isles-quake'
      ? Math.min(1, this.phaseT / QUAKE_IN) * QUAKE * on
      : (drifting ? (1 - dk) * QUAKE : 0);
    for (const isl of this.isles) {
      /* An overshoot that settles: out past the mark and back, on one curve,
         so nothing has to remember whether it is coming or going. */
      const e = 1 - (1 - dk) * (1 - dk) * (1 - dk);
      const over = 1 + (OVERSHOOT - 1) * Math.sin(Math.min(1, dk) * Math.PI);
      const sx = Math.sin(this.t * 31 + isl.seed) * shake;
      const sz = Math.cos(this.t * 27 + isl.seed * 1.7) * shake;
      /* FROM WHERE IT IS PACKED TO WHERE IT BELONGS, which is a lerp between
         two POSITIONS and not a scale on one. See `RIM_GAP`. */
      isl.g.position.set(
        isl.near.x + (isl.home.x * over - isl.near.x) * e + sx,
        isl.nearY + (isl.farY - isl.nearY) * e
          + Math.sin(this.t * 0.7 + isl.seed) * 0.12 * dk,
        isl.near.z + (isl.home.z * over - isl.near.z) * e + sz
      );
    }

    /* --- the connections, bending, and losing them ----------------------- */
    this._stepBridges(on, dk, shake);

    /* --- and the people who stopped using them --------------------------- */
    this._stepFolk(on, dk, camera);

    /* --- the little ones, crossing --------------------------------------- */
    const standing = P === 'isles-stand';
    const crossing = P === 'isles-cross' || P === 'isles-angle' || P === 'isles-circle';
    const leaping = P === 'isles-leap' || P === 'isles-bridge';
    /* CHASED, FOR THE REASON `modelOn` IS: the fade begins on one cue and has to
       survive the next one arriving part way through it. */
    this.kitOn = standing || crossing || leaping ? Math.min(1, this.kitOn + dt / KIT_IN) : 0;
    for (const k of this.kits) {
      const bb = k.mini.bb;
      bb.visible = standing || crossing || leaping;
      if (!bb.visible) continue;
      /* THEY FADE WITH THE GROUND THEY ARE ON. A billboard's opacity is its
         own material's and nothing propagates down a group, so without this
         the kittens and the dragons snapped in at full strength over an island
         that was still arriving — which is the same blink the model itself
         used to have, one layer up. */
      bb.mat.opacity = on * this.kitOn;
      bb.row = 2;
      bb.frame = Math.floor(this.t * 10 + k.seed) % Math.max(1, bb.cols);
      if (standing) {
        /* STANDING ON THE SPOT SHE WILL LEAVE FROM, on the idle row, looking
           where she is going. Resolved every frame like everything else here,
           because the islands are still settling out of the drift under her. */
        const a = this._resolve(k.from, this._pa);
        const b = this._resolve(k.to, this._pb);
        bb.position.copy(a);
        bb.row = 0;
        bb.facing = Math.atan2(b.x - a.x, b.z - a.z);
        bb.mesh.scale.setScalar(1);
      } else if (crossing) {
        k.k += dt * 0.55;
        if (k.k >= 1) { k.from = k.to; k.to = this._pickIsle(k.from?.isl ?? null); k.k = 0; }
        /* RESOLVED THIS FRAME, BOTH ENDS. See `_spot` — the islands are moving
           under these two points for the whole of this shot. */
        const a = this._resolve(k.from, this._pa);
        const b = this._resolve(k.to, this._pb);
        const u = Math.max(0, k.k);
        /* THE ARC IS THE JUMP. Every crossing in this game is a jump — that is
           the whole of "the nerve to jump" — so nobody walks between islands
           here either. */
        bb.position.set(
          a.x + (b.x - a.x) * u,
          a.y + (b.y - a.y) * u + Math.sin(u * Math.PI) * 1.5,
          a.z + (b.z - a.z) * u
        );
        bb.facing = Math.atan2(b.x - a.x, b.z - a.z);
        /* PUT BACK, because the leap before it swelled her to 1.8 and a scale
           is the one thing on a billboard nothing else resets. Re-entering
           `isles-cross` after a leap — which the scene viewer's beat step does
           every time — used to leave four giant kittens strolling the model. */
        bb.mesh.scale.setScalar(1);
      } else {
        /* ...AND THEY GO TOGETHER. One clock for all four, because the line is
           "you crossed" and not "each of you crossed". */
        const u = Math.min(1, this.phaseT / 1.5);
        const a = this._resolve(k.from, this._pa);
        const b = this._resolve(k.to, this._pb);
        const e = 1 - (1 - u) * (1 - u);
        bb.position.set(
          a.x + (b.x - a.x) * e,
          a.y + (b.y - a.y) * e + Math.sin(e * Math.PI) * 2.4,
          a.z + (b.z - a.z) * e
        );
        /* BIG ON THE NERVE, SMALL ON THE BRIDGE. "Can have them even scale up
           from being tiny and then growing big... and then have them jump
           together to the center and become tiny again while jumping. Can have
           them all jump and get small together when the line is said that is
           all a bridge has ever been." So the leap swells at its apex — four
           cats at full stretch over a model of their own world — and the last
           one shrinks the whole way down onto a span two units wide, which is
           also the only way four of them fit on it. */
        const s = P === 'isles-bridge' ? 1 - e * 0.6 : 1 + Math.sin(e * Math.PI) * 0.8;
        bb.mesh.scale.setScalar(s);
        /* AND THEY FACE WHERE THEY ARE GOING. Without this they keep whatever
           bearing the crossing left them on, so a huddle converging from four
           sides has one cat arriving backwards. */
        bb.facing = Math.atan2(b.x - a.x, b.z - a.z);
      }
    }

    /* THE LENS IN THE MODEL'S OWN SPACE, for the riders below. */
    let camL = null;
    if (camera) {
      this.model.updateMatrixWorld(true);
      camL = this.model.worldToLocal((this._camL ?? (this._camL = new THREE.Vector3()))
        .copy(camera.position));
    }
    const back = this._rideDir ?? (this._rideDir = new THREE.Vector3());
    for (const d of this.drags) {
      const r = d.riding;
      d.bb.mat.opacity = on;
      if (r?.mini.bb.visible) {
        d.bb.visible = true;
        d.bb.row = 0;
        d.bb.position.copy(r.mini.bb.position);
        /* THE RIDER IS IN FRONT. "It appears there is some Z-fighting happening
           where the player is not always appearing in front of the dragon."
           There was: the dragon was copied onto her position and moved DOWN,
           and both quads are turned square to the lens — so they stood in one
           plane at one depth, and which one won each pixel was the depth
           buffer's rounding. Pushed back along the sight line instead, a third
           of a unit, which moves nothing on screen and settles every pixel;
           `RO_KIT` over `RO_DRAGON` settles the sort. */
        if (camL) {
          back.subVectors(r.mini.bb.position, camL);
          const len = back.length();
          if (len > 1e-6) d.bb.position.addScaledVector(back, RIDE_BACK / len);
        }
        d.bb.position.y -= 0.35;
        d.bb.mat.opacity = r.mini.bb.mat.opacity;
        d.bb.facing = r.mini.bb.facing;
        d.bb.mesh.scale.setScalar(1);
      } else if (d.host && d.perch) {
        /* AT HOME ON ITS OWN ISLAND, and small. Six specks of dragon sitting
           out on six rocks is what makes the model read as this archipelago
           rather than as six discs. */
        d.bb.visible = true;
        d.bb.row = 0;
        d.bb.position.set(
          d.host.g.position.x + d.perch.x,
          d.host.g.position.y + 0.35 + Math.sin(this.t * 1.1 + d.seed) * 0.06,
          d.host.g.position.z + d.perch.z
        );
        d.bb.facing = d.seed;
        d.bb.mesh.scale.setScalar(0.55);
      } else {
        d.bb.visible = false;
      }
    }

    this._stepShapes(camera);
  }

  /**
   * The town, moving about, and nobody leaving it.
   *
   * WRITTEN STRAIGHT INTO THE INSTANCE MATRICES, because that is what an
   * `InstancedMesh` is: thirty little transforms in one buffer and one draw
   * call. The wander is a circle around a fixed home point rather than a walk,
   * which is both cheaper and — see `FOLK` — the entire argument: a figure that
   * integrates a velocity can wander off its island, and this one provably
   * cannot.
   *
   * AND THEY WALK THE WAY THEY ARE GOING. The orbit's own tangent is the
   * bearing, which is free and is also the only bearing that can never
   * disagree with the motion; the walk row's frame runs off the clock, offset
   * per villager so the town is not a chorus line. "Have them moving around the
   * world a little, to show movement in the world, using their moving
   * animations."
   *
   * SQUARE TO THE LENS, OUT OF THE MODEL'S TURN. Same correction `_face`
   * makes for every other billboard standing on this table, and for the same
   * reason: the model yaws at `t * 0.12`, so a figure yawed only by the camera
   * angle spends most of the shot edge-on.
   */
  _stepFolk(on, dk, camera) {
    if (!this.folkSets?.length) return;
    /* THEY GO AS THE ISLANDS GO. "When the islands drift apart, the people/
       animals fade away." Faster than the islands move, so the model is empty
       by the time it is scattered rather than carrying a crowd through it. */
    const live = Math.max(0, 1 - dk * 2.5);
    const op = on * live;
    const show = op > 0.02;
    /* FROM THE FIRST WORD OF "BECAUSE SOMETHING BROKE", EVERYBODY STOPS AND
       LOOKS UP. "We can also make all the people stop and do a new 'shocked' or
       'scared' sprite animation where they are looking up with their arms in
       the air." The people swap to the one drawing in the game of a kitten with
       her paws in the air — her blessing pose, the same second quad `_buildCast`
       parks under the cheer — and the animals to their own `shock` sheets, the
       ones they already bolt with in the tournament. A species with no second
       drawing just freezes. */
    const pi = ISLE_CUES.indexOf(this.phase ?? '');
    const scared = pi >= ISLE_CUES.indexOf('isles-quake');
    for (const m of this.folkMats) m.opacity = op;
    for (const set of this.folkSets) {
      set.mesh.visible = show && !(scared && set.alt);
      if (set.alt) set.alt.mesh.visible = show && scared;
    }
    if (!show) return;

    const yaw = this.model?.rotation.y ?? 0;
    /* THE LENS, IN THE MODEL'S OWN SPACE. Taking the camera angle in world
       space and then subtracting the yaw is two chances to be wrong about a
       sign; converting the camera once is one. */
    let camA = 0;
    const M = this._m;
    const q = this._fq;
    if (camera) {
      this.model.worldToLocal(this._fp.copy(camera.position));
      this._fcx = this._fp.x;
      this._fcz = this._fp.z;
      /* SQUARE TO THE LENS, PITCH AND ALL. "They need to be billboarding
         towards the camera so we can see them better." They were turned about
         UP only, which is right for a figure standing in the world at eye
         height and wrong under a lens thirty-five degrees above a table: every
         villager was foreshortened to two-thirds of her height. The camera's
         own orientation, taken into the model's frame, is the full billboard. */
      this.model.getWorldQuaternion(q).invert()
        .multiply(camera.getWorldQuaternion(this._fq2 ?? (this._fq2 = new THREE.Quaternion())));
    }
    const P = this._fp;
    const S = this._fs.set(1, 1, 1);
    /* ...AND THEY STAND WHERE THE GROUND MOVED UNDER THEM. */
    const clock = scared ? this.quakeT0 : this.t;
    for (const set of this.folkSets) {
      set.list.forEach((f, i) => {
        const a = f.ph + clock * f.sp;
        const x = f.host.g.position.x + f.hx + Math.cos(a) * f.wr;
        const z = f.host.g.position.z + f.hz + Math.sin(a) * f.wr;
        const y = f.host.g.position.y + 0.09 + (f.air ?? 0);
        camA = Math.atan2((this._fcx ?? 0) - x, (this._fcz ?? 0) - z);
        if (!camera) q.setFromAxisAngle(UP_AXIS, camA - yaw);
        M.compose(P.set(x, y, z), q, S);
        set.mesh.setMatrixAt(i, M);
        if (set.alt) set.alt.mesh.setMatrixAt(i, M);
        /* FACING THE TANGENT of its own little circle. */
        this._folkCell(set, i, a + Math.PI / 2, camA);
      });
      set.mesh.instanceMatrix.needsUpdate = true;
      set.off.needsUpdate = true;
      set.flip.needsUpdate = true;
      if (set.alt) set.alt.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * Which cell of the sheet one villager is showing, written into the two
   * instance attributes.
   *
   * THE DIRECTION RULE IS `Billboard.faceCamera`'S, CUT TO THE HALF-TURN CASE
   * — which is the only case these sheets are: `mirror` is true for a
   * four-column kitten sheet and a one-cell animal is one cell whatever it is
   * asked for. Deliberately NOT the hysteresis `Billboard` carries (it holds
   * the last side until a subject is decisively turned): that exists to stop a
   * player strobing at the exact moment she faces the lens, and a villager
   * walking a fixed circle passes through that moment at a known, slow rate.
   */
  _folkCell(set, i, facing, camA) {
    let idx = 0;
    let flip = false;
    if (set.cols > 1) {
      let rel = facing - camA;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      if (set.mirror) {
        const abs = Math.abs(rel);
        idx = abs < Math.PI * 0.25 ? 0
          : abs < Math.PI * 0.55 ? 1
            : abs < Math.PI * 0.8 ? 2 : 3;
        const right = Math.sin(rel) > 0;
        flip = set.artFacesRight ? !right : right;
      } else {
        /* A FULL-TURN SHEET RUNS ITS COLUMNS ROUND THE CIRCLE and its ROWS are
           the poses, which is what the kitten sheets are: there is no frame
           cycle to run: the "moving animation" IS the walk row, plus the fact
           that she is actually crossing ground. `DIR_SENSE` is `Billboard`'s
           and is not re-derived here — it is one sheet-wide constant and a
           second copy of it is a second thing to get wrong. */
        let r = (rel * DIR_SENSE) % TAU;
        if (r < 0) r += TAU;
        idx = (-Math.round(-r / (TAU / set.cols))) % set.cols;
      }
    }
    const c = Math.min(idx, set.cols - 1);
    const r = Math.min(set.row, set.rows - 1);
    set.off.setXY(i, c / set.cols + set.iu, 1 - (r + 1) / set.rows + set.iv);
    set.flip.setX(i, flip ? 1 : 0);
  }

  /**
   * The angle and the circles, over the model, while the words are said.
   *
   * BOTH OF THEM ARE READ OFF THE KITTENS. See `_buildShapes` for why that
   * matters and for the "thicker at the base" trick. What is solved here is
   * only the live half: where the four of them are this frame, what angle that
   * makes at the middle of the world, and how far out the circles have grown.
   */
  _stepShapes(camera) {
    if (!this.shapes) return;
    const lv = this._shapeLevel('isles-angle');
    const lc = this._shapeLevel('isles-circle');
    const ang = lv.on;
    const cir = lc.on;
    /* ONE BLOW-OUT FOR BOTH OF THEM, because they leave on the same cue and a
       diagram that expands at two rates is two diagrams. */
    const out = Math.max(lv.out, lc.out);
    const blow = 1 + out * SHAPE_BLOW;
    const any = Math.max(ang, cir) * (1 - out);
    this.shapes.visible = any > 0.02;
    if (!this.shapes.visible) {
      for (const w of this.wedges) if (w.lbl) w.lbl.visible = false;
      return;
    }

    /* THE HUD DOES NOT TURN WITH THE TABLE. Counter-rotated out of the model's
       own spin, so it reads as a thing projected OVER the islands rather than
       as a decal stuck to them — which is the single strongest cue in the
       reference, and it costs one line. */
    this.shapes.rotation.y = -this.model.rotation.y;

    const live = this.kits.filter((k) => k.mini.bb.visible);
    const at = [];
    for (const k of live) {
      /* LIFTED OUT OF THE MODEL'S ROTATION, so an arm drawn to a kitten points
         at the kitten and not at where she was a second ago. */
      const p = k.mini.bb.position;
      const c = Math.cos(this.model.rotation.y);
      const s = Math.sin(this.model.rotation.y);
      at.push(new THREE.Vector3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c));
    }

    /* --- the angles ------------------------------------------------------ */
    /* THE BLOW-OUT IS THE FADE. `out` widens the geometry and takes the light
       out of it on one number, so a diagram that is still growing is always
       also still going — the two cannot come apart and leave a huge bright
       ring parked over the islands. */
    this.angleMat.opacity = ang * (1 - out) * 0.95;
    /* NOBODY TO MEASURE BETWEEN IS NOT A SMALL ANGLE, IT IS NO ANGLE. Without
       this the group stays lit holding whatever geometry the last frame with
       kittens in it left behind — a diagram of four cats who are not there. */
    this.angleFx.visible = ang > 0.02 && at.length > 0;
    for (const w of this.wedges) if (w.lbl) w.lbl.visible = false;
    if (this.angleFx.visible) {
      const y = ANG_Y;
      for (let i = 0; i < this.arms.length; i++) {
        const p = at[i % at.length];
        const grow = Math.min(1, ang * 1.4);
        this._setLine(this.arms[i].geo, [0, y, 0, p.x * grow, y + (p.y - y) * grow, p.z * grow]);
        /* THE WEDGE BETWEEN HER AND THE NEXT ONE ROUND — the angle the four of
           them are standing at, closed with an arc at a fixed radius so the
           several of them nest instead of overlapping. */
        const q = at[(i + 1) % at.length];
        const a0 = Math.atan2(p.z, p.x);
        let a1 = Math.atan2(q.z, q.x);
        while (a1 < a0) a1 += TAU;
        const rr = ((MINI_R * 0.2) + i * (MINI_R * 0.055)) * blow;
        const pts = [];
        for (let j = 0; j < 18; j++) {
          const a = a0 + (a1 - a0) * (j / 17) * grow;
          pts.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
        }
        this._setLine(this.wedges[i].geo, pts);
        /* ...and a tick out along her own bearing, which is what turns a pair
           of lines into a reading. */
        this._setLine(this.wedges[i].tick.geo, [
          Math.cos(a0) * rr * 0.86, y, Math.sin(a0) * rr * 0.86,
          Math.cos(a0) * rr * 1.16, y, Math.sin(a0) * rr * 1.16,
        ]);

        /* θ, WHERE THE WEDGE IS WIDEST, and reading the wedge's own two
           bearings rather than anything stored. Only lit where there is a
           wedge to label: at two players `at.length` is 2, so the same pair of
           cats generates the same angle twice round and the second copy is a
           duplicate sitting on top of the first. */
        const lbl = this.wedges[i].lbl;
        const deg = ((a1 - a0) * 180 / Math.PI) % 360;
        /* AND A WEDGE OF NOTHING GETS NO READING. Two kittens standing on the
           same bearing — which is every one of them for the frame before the
           crossing seeds, and any pair who happen to line up during it — make
           an angle of zero, and four gold `0 deg` labels fanned out along one
           line is the diagram announcing that it has nothing to say. Three
           degrees is below what the arc can draw at this scale anyway. */
        if (lbl && i < at.length && at.length > 1 && grow > 0.5 && Math.abs(deg) >= 3) {
          const half = a0 + (a1 - a0) * 0.5;
          lbl.setText(`θ = ${deg.toFixed(0)}°`);
          lbl.position.set(Math.cos(half) * rr * 1.3, y + 0.5, Math.sin(half) * rr * 1.3);
          lbl.mat.opacity = this.angleMat.opacity;
          lbl.visible = true;
          if (camera) lbl.faceCamera(camera);
        }
      }
    }

    /* --- and the circles ------------------------------------------------- */
    this.circleMat.opacity = cir * (1 - out) * 0.9;
    this.reticleMat.opacity = cir * (1 - out) * 0.75;
    this.circleFx.visible = cir * (1 - out) > 0.02;
    if (this.circleFx.visible) {
      /* EXPANDING, AND OUT PAST THE FURTHEST OF THEM. "Show them expanding the
         circle while navigating between the islands" — so the radius is solved
         from how far out the kittens have actually got, which means the circle
         grows because they did. */
      /* AND THE REACH IS HELD ONCE IT STARTS LEAVING. The four of them converge
         on the bridge during `isles-leap`, so a radius still solved from where
         they are would SHRINK while the blow-out is trying to push it out —
         measured, the two almost cancelled and the circle sat still while it
         dimmed. The circle grew because they did, which was the whole argument
         for solving it from them; once they have stopped spreading, the last
         thing they said is the honest number to leave on screen. */
      const live = at.reduce((m, p) => Math.max(m, Math.hypot(p.x, p.z)), MINI_R * 0.35);
      if (out <= 0) this._reach = live;
      const reach = out > 0 ? (this._reach ?? live) : live;
      const e = 1 - (1 - cir) * (1 - cir);
      for (const tier of this.tiers) {
        /* NARROWING AS IT CLIMBS — a cone of rings rather than a cylinder of
           them, which is the shape in the reference and the reason it reads as
           3D at all from a camera that is nearly level with it. */
        const rr = (reach * 1.06) * (1 - tier.k * 0.6) * e * blow;
        const y = CIR_Y + tier.k * (MINI_R * 0.55);
        tier.skin.forEach((l, j) => {
          l.position.y = y + j * 0.05;
          l.scale.set(rr, 1, rr);
          l.rotation.y = this.t * (0.1 + tier.k * 0.12);
        });
      }
      for (const R of this.reticles) {
        R.g.position.y = CIR_Y + R.y;
        R.g.scale.setScalar(reach * R.r * e * blow);
        R.g.rotation.y = this.t * R.spin;
      }
    }
    for (const R of this.reticles) R.g.visible = this.circleFx.visible;
  }

  /**
   * How lit one half of the overlay is this frame, and how far it has blown
   * out: `{ on, out }` for the cue that lights it.
   *
   * IT IS A QUESTION ABOUT SEQUENCE, which is the whole reason it is not two
   * lines in `_stepShapes`. "Is the angle up?" cannot be answered from the
   * current cue's name — by "the nerve to jump" the answer is yes and the cue
   * is not `isles-angle` — so the phases are put in order once, at the top of
   * this file, and this walks that order.
   *
   * AND IT IS SOLVED, NOT CHASED, unlike the model and the runner above. Those
   * two survive six cuts between them, so a target they run toward is the only
   * thing that does not restart on every cue. This one is the opposite case:
   * it is lit by one named word, held across a known stretch, and taken away on
   * another named word, so it can be read straight off the clock — and being
   * solved, a seek into the middle of the section shows the right thing rather
   * than fading up from wherever it was left.
   */
  _shapeLevel(from) {
    const i = ISLE_CUES.indexOf(this.phase);
    const k = ISLE_CUES.indexOf(from);
    if (i < 0 || i < k) return { on: 0, out: 0 };
    if (i === k) return { on: Math.min(1, this.phaseT / SHAPE_IN), out: 0 };
    if (this.phase === 'isles-leap') {
      return {
        on: 1,
        out: Math.max(0, Math.min(1, (this.phaseT - SHAPE_HOLD) / SHAPE_OUT)),
      };
    }
    /* PAST THE LEAP IS PAST THE MATHS. `isles-bridge` is "that is all a bridge
       has ever been", and what has to be on screen under that line is the
       bridge — which is the thing the blow-out above has already cleared the
       way for. */
    if (i > ISLE_CUES.indexOf('isles-leap')) return { on: 0, out: 1 };
    return { on: 1, out: 0 };
  }

  /** Rewrite a line's points in place. Takes the GEOMETRY, not the mesh,
   *  because several stacked meshes share one — see `HUD_FAT`. */
  _setLine(geo, nums) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const j = Math.min(nums.length - 3, i * 3);
      p.setXYZ(i, nums[j], nums[j + 1], nums[j + 2]);
    }
    p.needsUpdate = true;
  }

  /**
   * Four kittens running the real bridge, with the four things they can do.
   *
   * THEY RUN PAST THE LENS AND OUT OF THE SHOT. "Can have them all pass over
   * and through the bridge and past the camera while the camera is just focused
   * on the bridge." So the path runs the whole length of the deck and keeps
   * going, out through the gate on the far side: the last thing the shot holds
   * is an empty bridge, which is the picture that line wants under it.
   *
   * EVERY MOVE IS THE SAME TWO VARIABLES. `air` and `vy`, with `BR_GRAV`
   * pulling on them — see the note there. A jump is one shove, a double jump is
   * a second one at the top, a Power Dive is a hang and then a shove downward, a
   * Charge is a multiplier on the horizontal, a Flash Step takes the horizontal
   * away and gives it back eleven units later. Because they are all the same two
   * variables, there is no state in which one of them can cut another off —
   * which is the whole of "their animations are being interrupted".
   *
   * AND THEY ARE AUDIBLE. "When these abilities are being played, they should
   * make some sounds, including jumping sounds." Every one of them fires the
   * sound the REAL move fires, off the same names in `core/audio.js`: `jump`
   * and `doubleJump` off `Player._jump`, `land` off the ground snap, `slash`
   * and `rockbreak` off `_startDive` and `_diveImpact`, `wardup` / `warddown`
   * off the bubble, `dodgeout` / `dodgein` off the Flash Step. Nothing new was
   * invented for the cutscene: a kid who has played the game has heard all of
   * this mean exactly this. Quietly, because Patchfur is talking over it, and
   * through `onSfx` rather than by reaching for the audio engine — the same
   * rule `FinaleTide.onCrash` follows and for the same reason.
   */
  _stepBridge(dt) {
    const b = this.world?.bridge;
    if (this.phase !== 'bridge-run' || !b) {
      for (const k of this.kits) {
        if (k.ring) k.ring.visible = false;
        if (k.ward) k.ward.visible = false;
        if (k.puff) k.puff.visible = false;
      }
      return;
    }
    const len = this.brLen ?? 18;
    const rise = this.brRise ?? 2.2;
    const path = this.brPath ?? (BR_UP + len + BR_OFF);
    const half = len / 2;
    const sfx = (name, gain) => this.onSfx?.(name, gain);
    for (const k of this.kits) {
      /* --- IS SHE IN THE SHOT AT ALL -------------------------------------
         SHE MOVES, AND THEN EVERYTHING ELSE DECIDES. Her move list is keyed to
         places on the path rather than to a clock (see `BR_SCRIPT`), so nothing
         below can fire for somebody who has not arrived — but the rings, the
         bubble and the smoke are all still hers to take down when she leaves. */
      if (k.k < 0 || k.k > 1) {
        k.big.bb.visible = false;
        /* AND SHE LEAVES THE SHOT THE SHAPE SHE ARRIVED IN. A kitten who ran
           off the end mid-Dash kept the squash, and the next thing that draws
           her is the arena. */
        k.big.bb.mesh.scale.set(1, 1, 1);
        if (k.ring) k.ring.visible = false;
        if (k.ward) k.ward.visible = false;
        if (k.puff) k.puff.visible = false;
        k.k += dt * BR_RATE;
        continue;
      }

      /* --- has she reached the next thing she is going to do -------------- */
      if (!k.mv && k.next < (k.moves?.length ?? 0)
          && k.k >= k.moves[k.next].at) {
        const m = k.moves[k.next++];
        k.mv = m.kind;
        k.mvT = 0;
        /* A JUMP-SHAPED MOVE ONLY STARTS WITH HER FEET DOWN. The alternative —
           letting one fire in mid-air — is a kitten who leaves the deck twice
           from the same jump, which is exactly the "interrupted" look. She is on
           the ground here in every authored case; the guard is for the day
           somebody re-times the table. */
        if (m.kind === 'jump' || m.kind === 'double' || m.kind === 'dive' || m.kind === 'float') {
          if (k.air > 0.01) { k.mv = null; } else {
            if (m.kind === 'float') { k.fell = false; sfx('wardup', 0.30); }
            /* AND NOT ALL THE SAME HEIGHT. "Jumping randomly, multiple times,
               with random pauses between jumps" — the pauses come off the move
               list, which is the half of it a clock could never get right, and
               this is the other half. One sine per kitten gave four identical
               hops and read as four metronomes; a shove that varies by a fifth
               is four kids. On the SHOVE and not on the height, because
               gravity is doing the rest and a height that was rolled would be
               a height she does not fall from. */
            k.vy = BR_HOP * (0.86 + Math.random() * 0.30);
            k.air = 0.001;
            k.jumps = 1;
            sfx('jump', 0.30);
          }
        } else if (m.kind === 'dash') {
          sfx('slash', 0.26);
        } else if (m.kind === 'ward') {
          sfx('wardup', 0.30);
        } else if (m.kind === 'blink') {
          sfx('dodgeout', 0.34);
          k.gone = true;
          this._puff(k);
        }
      }
      if (k.mv) k.mvT += dt;

      /* --- the second shove, and the hang above it ------------------------
         A DOUBLE JUMP AND A DIVE START THE SAME WAY, and they have to: the dive
         is only visible because she is four units up when it begins rather than
         two. The one line of difference is what happens at the second apex. */
      if ((k.mv === 'double' || k.mv === 'dive') && k.jumps === 1 && k.vy <= 0) {
        k.vy = BR_HOP2 * (0.9 + Math.random() * 0.2);
        k.jumps = 2;
        sfx('doubleJump', 0.28);
      }
      if (k.mv === 'dive' && k.jumps === 2 && k.vy <= 0 && k.hang === 0
          && !k.dropping) {
        k.hang = BR_HANG;
        k.vy = 0;
        k.dropping = true;
        sfx('slash', 0.34);
      }
      /* THE FLOAT IS THE SAME HANG AT THE TOP OF ONE JUMP, only long, rising
         a little, and let go of rather than thrown down. */
      if (k.mv === 'float' && k.vy <= 0 && k.hang === 0 && !k.fell) {
        k.hang = BR_FLOAT;
      }
      if (k.hang > 0) {
        const floating = k.mv === 'float';
        k.hang = Math.max(0, k.hang - dt);
        k.vy = floating ? BR_FLOAT_RISE : 0;
        if (k.hang === 0) {
          if (floating) {
            k.vy = 0;
            k.fell = true;
            sfx('warddown', 0.22);
          } else {
            k.vy = -BR_DIVE;
          }
        }
      }

      /* --- gravity, and the ground under it ------------------------------- */
      let landed = false;
      if (k.air > 0 || k.vy > 0) {
        if (k.hang === 0) k.vy -= BR_GRAV * dt;
        k.air += k.vy * dt;
        if (k.air <= 0) {
          landed = true;
          k.air = 0;
          k.vy = 0;
          k.jumps = 0;
        }
      }
      if (landed) {
        if (k.mv === 'dive') {
          /* THE SHOCKWAVE IS THE LANDING AND NOT THE MOVE. It used to be lit
             for as long as the ability's timer said, which meant a ring
             expanding around a cat who was still in the air.

             AND IT BELONGS TO THE PLANK SHE HIT, not to her. She is off again
             inside the half second it takes to fade — that is what the move
             list is for — and a ring that followed her was a cat dragging a
             puddle of light down the bridge. `world-check` caught this by
             asking why a shockwave was in the air; the answer was that it was
             wherever she was. Pinned on the frame it is struck, in world
             units, so nothing below has to know it exists. */
          k.ringT = BR_RING;
          k.ringX = k.big.bb.position.x;
          k.ringY = k.big.bb.position.y;
          k.ringZ = k.big.bb.position.z;
          sfx('rockbreak', 0.36);
        } else {
          sfx('land', 0.22);
        }
        if (k.mv === 'jump' || k.mv === 'double' || k.mv === 'dive' || k.mv === 'float') {
          k.mv = null;
          k.dropping = false;
        }
      }

      /* --- the ones that end on their own clock --------------------------- */
      if (k.mv === 'dash' && k.mvT >= BR_DASH_DUR) k.mv = null;
      if (k.mv === 'ward' && k.mvT >= BR_WARD_DUR) { k.mv = null; sfx('warddown', 0.22); }
      if (k.mv === 'blink' && k.mvT >= BR_BLINK_GONE) {
        /* ...AND ELEVEN UNITS FURTHER DOWN THE ROAD. Moved in PATH units and
           not in `k`, so a longer bridge does not turn this into a longer
           teleport: the distance she covers is the distance, whatever fraction
           of the crossing it happens to be. */
        k.k = Math.min(0.999, k.k + BR_BLINK_FAR / path);
        k.mv = null;
        k.gone = false;
        /* THE ARRIVAL PUFF WAITS FOR THE POSITION IT IS ARRIVING AT. Dropped
           here it would mark the spot she left, which is where the OTHER puff
           already is — two clouds of smoke at one end of a teleport and none at
           the other. See the flag below the position write. */
        k.puffDue = true;
        sfx('dodgein', 0.34);
      }

      /* --- and forward, at whatever speed she is owed --------------------- */
      let rush = 1;
      if (k.mv === 'dash') rush = BR_DASH;
      else if (k.mv === 'blink') rush = 0;
      else if (k.mv === 'dive' && k.jumps >= 2) rush = BR_DIVE_K;
      k.k += dt * BR_RATE * rush;

      /* ALONG THE DECK, which is the x axis — the span is `len` units of arch
         on x and `wide` across z, and `world.bridge` is its CREST, which is why
         the road either side sits `rise` below it. Off the deck the clamp puts
         `arch` at zero, so the approach is flat ground and the crossing is the
         only thing that climbs. */
      const x = b.x - half - BR_UP + k.k * path;
      const arch = Math.cos(Math.max(-1, Math.min(1, (x - b.x) / half)) * Math.PI / 2);
      const floor = b.y - rise + arch * rise;
      const y = floor + k.air;
      const z = b.z + k.lane;
      k.big.bb.position.set(x, y, z);
      if (k.puffDue) { k.puffDue = false; this._puff(k); }
      k.big.bb.facing = Math.PI / 2;
      /* GONE MEANS GONE. `Player._updateFeedback` stops drawing her for the
         half second of a Flash Step and so does this; the smoke below is the
         whole of what says where she went. */
      k.big.bb.visible = !k.gone;
      /* THE ATTACK ROW IS THE SWORD, and the two moves that have one out use
         it — a Charge and the falling half of a Power Dive. The Ward does not:
         she is standing behind a shield, not cutting. A one-row atlas collapses
         every row to 0 and the shot still plays; see `Billboard._setCell`. */
      const cutting = k.mv === 'dash' || (k.mv === 'dive' && k.jumps >= 2);
      k.big.bb.row = cutting ? 3 : (k.air > 0.25 ? 2 : 1);
      k.big.bb.frame = Math.floor(this.t * 11 + k.seed) % Math.max(1, k.big.bb.cols);
      k.big.bb.mat.opacity = 1;
      /* STRETCHED INTO THE CHARGE AND SQUASHED INTO THE DIVE. One number each,
         and it is the only motion blur a billboard can afford. */
      const diving = k.mv === 'dive' && k.vy < -1;
      k.big.bb.mesh.scale.set(
        k.mv === 'dash' ? 1.22 : (diving ? 0.86 : 1),
        k.mv === 'dash' ? 0.86 : (diving ? 1.2 : 1), 1);

      /* --- the Power Dive's shockwave, on the deck under her -------------- */
      if (k.ring) {
        k.ringT = Math.max(0, k.ringT - dt);
        k.ring.visible = k.ringT > 0;
        if (k.ring.visible) {
          const ae = 1 - k.ringT / BR_RING;
          const grow = 0.8 + ae * 3.4;
          k.ring.scale.set(grow, 1, grow);
          k.ring.position.set(k.ringX ?? x, (k.ringY ?? floor) + 0.06, k.ringZ ?? z);
          k.ringMat.opacity = (1 - ae) * 0.85;
        }
      }

      /* --- and the Ward, which is a bubble and not a ring ----------------
         SAME TWO SHELLS `Player` POPS, in the same blue. A kid who has worn 壁
         has seen exactly this, and the ending is not the place to teach her a
         second drawing of it. It grows in over the first fifth of the hold and
         is held the rest of the way, rather than expanding for its whole life
         like the shockwave does: a shield that keeps growing is a blast. */
      if (k.ward) {
        /* ...and for the float, until she lets go of it. */
        k.ward.visible = k.mv === 'ward' || (k.mv === 'float' && !k.fell);
        if (k.ward.visible) {
          const born = Math.min(1, (k.mvT / BR_WARD_DUR) * 5);
          k.ward.position.set(x, y + REAL_H * 0.55, z);
          k.ward.scale.setScalar(born * (1 + Math.sin(this.t * 3.1) * 0.04));
        }
      }

      /* --- the smoke she left, or arrived in ----------------------------- */
      this._stepPuff(k, dt);
    }
  }

  /**
   * Drop a puff of smoke where she is standing.
   *
   * SOFT, WHITE, CARTOON, NOTHING SHARP — `systems/dodgefx.js` states the rule
   * and `Menagerie._poof` follows it too, and this is the third place that
   * wants it. It is NOT dodgefx: that file is driven off a real `Player`'s
   * clocks and draws a target ring, a decoy and a whole right-triangle figure
   * round a girl who has locked somebody, none of which exists here. Four
   * spheres and a clock is the whole of what a cutscene needs.
   */
  _puff(k) {
    if (!k.puff) return;
    k.puffT = BR_PUFF;
    k.puff.position.copy(k.big.bb.position);
    k.puff.visible = true;
  }

  /** ...and take it away again, over `BR_PUFF`: out, up, and thinner. */
  _stepPuff(k, dt) {
    if (!k.puff || k.puffT <= 0) return;
    k.puffT = Math.max(0, k.puffT - dt);
    const u = 1 - k.puffT / BR_PUFF;
    k.puff.visible = k.puffT > 0;
    k.puff.children.forEach((m, i) => {
      const a = (i / k.puff.children.length) * TAU + 0.4;
      m.position.set(Math.cos(a) * u * 1.5, 0.5 + u * 1.5, Math.sin(a) * u * 1.5);
      m.scale.setScalar(0.5 + u * 0.9);
      m.material.opacity = (1 - u) * 0.75;
    });
  }

  /**
   * Everybody in the ring with the champion, which is where they are going.
   *
   * HE FOLDS HIS ARMS AND THEN THROWS THEM UP, on the word. "Can show Mr. Satan
   * standing with arms crossed for a few seconds and then with his arms raised
   * upwards for the last few seconds, when the words 'arena is open' can have
   * his arms raised up using the sprite 'satan_charge.png'. Can also have the
   * players do their 'bless' sprite, to make it look like they are cheering."
   * The swap is a SECOND QUAD at the same spot rather than a row of a sheet,
   * for the reason `MrSatan.setChargeArt` gives: his two drawings are measured
   * against each other by ink area, so he does not change size when he moves.
   *
   * THE CUE IS `arena-raise`, WHICH IS A `keep` ROW. It fires on the word and
   * the camera does not cut, so what the audience sees is him raising his arms
   * — not a new shot of a man with his arms already up.
   */
  _stepArena(dt) {
    const P = this.phase;
    if (P !== 'arena-in' && P !== 'arena-raise') return;
    const up = P === 'arena-raise';
    /* HIM FIRST, AND THEN THEM. See `CHEER_LAG` — the cue is his, and hers is
       the same cue read a sixth of a second later. */
    const cheerUp = up && this.phaseT >= CHEER_LAG;
    const R = this.world?.arenaRing;
    if (this.satan) {
      const lit = !!this.satanLit;
      /* ONE OF THE TWO, NEVER BOTH AND NEVER NEITHER. With no charge art the
         idle pose stays up, which is the ninth non-negotiable: a missing sheet
         costs the gesture and not the character. */
      const pose = up && this.satanUp ? this.satanUp : this.satan;
      pose.bb.visible = lit;
      pose.bb.position.copy(this.satan.bb.position);
    }
    for (const k of this.kits) {
      if (!k.stand) continue;
      /* THEY ARRIVE RATHER THAN BEING THERE. A quarter of a second of drop and
         a bounce reads as "teleported near him", which is what was asked for,
         and it is also the only motion in a shot that is otherwise a group
         photograph. The clock is the ARENA's, not the phase's, so the raise
         cue landing mid-drop cannot make them bounce twice. */
      this.arenaT += P === 'arena-in' ? dt : 0;
      const u = Math.min(1, this.arenaT / 0.55);
      const drop = (1 - u) * 9 + Math.abs(Math.sin(u * Math.PI * 2)) * (1 - u) * 2;
      const pos = new THREE.Vector3(k.stand.x, k.stand.y + drop, k.stand.z);
      /* FACING HIM. He is in the middle of the ring, so "look at the champion"
         is a bearing from her to him and nothing else — and at two players or
         at four it is right without a special case. */
      const face = R ? Math.atan2(R.x - k.stand.x, R.z - k.stand.z) : Math.PI;
      /* HER CHEER ONCE HIS ARMS ARE UP, and her ordinary self before that. */
      const cheering = cheerUp && k.cheer;
      const bb = cheering ? k.cheer.bb : k.big.bb;
      bb.visible = true;
      bb.position.copy(pos);
      bb.facing = face;
      bb.mat.opacity = 1;
      bb.mesh.scale.setScalar(1);
      if (!cheering) {
        k.big.bb.row = u < 1 ? 2 : 0;
        k.big.bb.frame = Math.floor(this.t * 7 + k.seed) % Math.max(1, k.big.bb.cols);
      }
    }
  }
}
