import * as THREE from 'three';
import './style.css';

import {
  InputManager, HALVES, MAP_FIELDS, VJOY_AXIS_NAMES, KEYSETS,
} from './core/input.js';
import { Audio, trackForIsland, voicePath } from './core/audio.js';
import { loadSpriteAtlas, recolourAtlas } from './core/spritesheet.js';
import { placeholderCatAtlas, placeholderDragonTexture, placeholderPandaTexture } from './core/gfx.js';
import {
  detect as detectDevice, readOverride, writeOverride, QUALITY, effectivePixelRatio,
  autoQualityVerdict, AUTO_GRACE_MS,
} from './core/device.js';
import { readPrefs, writePref } from './core/prefs.js';

import { TouchPad, wardLatchExpired } from './core/touchpad.js';
import { World, CLANS } from './world/world.js';
import { Player, ATTACKS, COMBAT, BASE_REACH, MAX_HP, KO_TIME, SWEEP_UP } from './entities/player.js';
import { PLAYER_STYLE, MAX_PLAYERS, styleFor, styleCss, cssFor } from './core/palette.js';
import {
  splitLayout, mapWidth, mapSpot, mathSharedWidth, assignMaps, nearestMap, keyMaps,
  fitDistance, stablePanes, paneSeats, outOfShot, framedMembers, paneWiden, cornerSpot,
  fitShot, RIG_AIM_RATE, RIG_DIST_RATE,
  warnSpot, warnWidth, WARN_FIT,
} from './core/split.js';
import { clusterPlayers, MERGE_IN, MERGE_OUT } from './core/cluster.js';
import { SNAKE, COIN_CANES } from './world/snakeway.js';
import { BAMBOO_POINTS } from './entities/prop.js';
import { SnakeCam } from './systems/snakecam.js';
import { BridgePeek } from './systems/dream/peek.js';
import { Dragon, BREEDS } from './entities/dragon.js';
import { Panda, PANDA, PANDA_TIERS, tierFor, toNextTier } from './entities/panda.js';
import { ClanLeader, LEADERS } from './entities/leader.js';
import { Orb, OrbPickup } from './entities/orb.js';
import { MathDojo, DOJO_VIEW_R, inDojoView } from './systems/mathdojo.js';
import { Minimap, TOUCH_ZOOM } from './systems/minimap.js';
import { MenuNav } from './systems/menunav.js';
import { Cutscene } from './systems/cutscene.js';
import { Trailer } from './systems/trailer.js';
import { CrossFx } from './systems/crossfx.js';
import { SweepFx } from './systems/sweepfx.js';
import { ParryFx } from './systems/parryfx.js';
import { DodgeFx } from './systems/dodgefx.js';
import { ClanFx } from './systems/clanfx.js';
import { Confirm } from './systems/confirm.js';
import { onTap } from './core/tap.js';
import { ShrineScene, SCENE_RADIUS } from './systems/shrinescene.js';
import { StoryScene } from './systems/dream/storyscene.js';
import { ArenaExit } from './systems/arenaexit.js';
import { SummonScene } from './systems/summonscene.js';
import { DragonBall, BALL_COUNT, PICKUP_RADIUS } from './entities/dragonball.js';
import { Ryuuseki, HOVER, RYU_VIEW } from './entities/ryuuseki.js';
import { MrSatan } from './entities/satan.js';
import { Griffin } from './entities/griffin.js';
import { Announcer } from './systems/announce.js';
import { LastHunt, HUNT_LINES } from './systems/lasthunt.js';
import {
  Tournament, MODE_BY_ID, modesFor, teamColour, teamName, NO_SIDE, ROLL_WORDS,
} from './systems/tournament.js';
import { Menagerie } from './systems/menagerie.js';
import { AngelForm } from './entities/angel.js';
import { ArenaQuest, SATAN_TOWN, MILESTONES } from './systems/arenaquest.js';
import { SatanBlast } from './systems/satanblast.js';
import { ArenaBoard, boardZoneWeight, boardShot, BOARD_VIEW } from './systems/arenaboard.js';
import { loadBoard, clearBoard, BOARD_MODES } from './systems/leaderboard.js';
import {
  listSaves, putSave, dropSave, clearSaves, snapshot, describe, restore,
  castRow, applyCast, meaningful, newSessionId,
  AUTOSAVE_EVERY, AUTOSAVE_AFTER, MAX_SAVES, MAX_LIST, saveCap, saveByHand,
} from './systems/savegame.js';
import { POWER_ORBS } from './entities/powerorb.js';
import { Kotodama, buildWornOrbs } from './systems/kotodama.js';
import { ORB_IDS, CROSS, triDmgK } from './entities/powerorb.js';
import { ProfileScreen } from './systems/profile.js';
import { Feats } from './systems/feats.js';
import { Inspector } from './systems/inspector.js';
import { Payne, PAYNE_CLIPS, PAYNE_TOWN } from './systems/payne.js';
import { DreamDojo } from './systems/dreamdojo.js';
import { SIM } from './world/simworld.js';

/* ---------------------------------------------------------------------------
   Katana Kitties — main loop.

   Two players, two cameras, one scene. The split is dynamic: run apart and
   the screen splits; come back together and it joins into a single shared
   view. Everything billboarded has to be re-oriented per camera, which is why
   rendering goes through _renderView rather than a plain renderer.render.
--------------------------------------------------------------------------- */

/**
 * How much of the bottom of the screen belongs to the hint line, in CSS px.
 *
 * `.hint` is one centred sentence at `bottom: 16px`, about 14px tall. It is the
 * only thing living at the bottom of the SCREEN rather than of a pane, and the
 * maps hug the seam now — so on a side-by-side split two of them close in on it
 * from both sides and the sentence telling a kid what her button does ends up
 * between two boxes. Everything anchored to a full-height pane's bottom edge
 * clears this; a box sitting on a seam has a seam under it and does not.
 */
const HINT_CLEAR = 30;

/**
 * EVERY PANEL THAT OPENS OVER THE PAUSE MENU AND BACKS OUT TO IT.
 *
 * ONE LIST, BECAUSE THERE WERE FOUR. "Which panels sit over the pause menu"
 * was written out separately in the `data-close` handler, in the Escape
 * handler, in `_overlayOpen` and — in a different order, for a different
 * reason — in MenuNav's own `PANELS`. Three of them agreed; the fourth had
 * never heard of `panel-board`, so a pad driving the record board was actually
 * driving the pause menu behind it. Cutting the pause menu into groups added
 * three more panels, which is three more chances to update three lists out of
 * four, so the lists became one.
 *
 * MENUNAV'S `PANELS` IS STILL ITS OWN, and deliberately: this list is a SET
 * (does Escape close it) and that one is an ORDER (who gets the presses when
 * several are up). Merging them would make the answer to one question depend
 * on the other, which is how `panel-board` got lost in the first place.
 *
 * INNERMOST FIRST, because Escape closes ONE. The record board opens from
 * KITTENS & SCORES with that group still up behind it, so Escape there has to
 * put her back on the group she was reading rather than three steps out to the
 * pause menu — a back button that skips a level reads as the game losing her
 * place. Everything else in here can only ever be the innermost thing open.
 */
/* PLAY SETTINGS IS LAST OF THE GROUPS for the same innermost-first reason:
 * WATCH AGAIN, LOAD A SAVED GAME and END THE GAME all open from it with it
 * still up, so Escape has to close them before it. */
const SUB_PANELS = ['panel-board', 'panel-help', 'panel-settings',
  'panel-kittens', 'panel-watch', 'panel-saves', 'panel-ending', 'panel-play'];

/**
 * The debug panel's mischief batch: how many a press knocks over, and where it
 * changes gear. See `Game._knockBatch` for the argument.
 */
const BULK_STEP = 50;
const BULK_FINE = 5;
const BULK_FINE_AT = 200;

/** The key each debug action is bound to, for the panel's own labels. */
const DEBUG_KEY_LABEL = {
  /* `8` IS THE FRAME COST; IT WAS `1`, AND BEFORE THAT `P`. `P` was also player 2's mount
     (`KEYSETS[1]` in core/input.js), so one press did both: she climbed onto a
     dragon and the readout flickered. Every other debug key is a digit or
     punctuation precisely because nothing in `BOUND_KEYS` is, and `P` was the
     one that broke the pattern. Moved rather than removed — the readout is the
     first thing to reach for when somebody says it lags, and a tool you have
     to open a panel to reach is a tool nobody reaches for. */
  Digit1: '1', Digit2: '2',
  Digit3: '3', Digit4: '4', Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9',
  Digit0: '0', Minus: '-', Equal: '=',
  Backquote: '`',
  /* FORCE-SPAWN AND ITS TWO HAND-OVER KEYS. `\` was freed when both keyboard
     sets moved onto ENTER to join (see `_findJoin` in core/input.js — it used
     to be the arrow set's own way in), and nothing binds it now.
     `R` AND `U` BREAK THE DIGITS-AND-PUNCTUATION RULE ON PURPOSE, because for
     these two the position IS the feature: `R` sits above WASD and `U` beside
     O K L ;, so each hand passes its own keyboard along without moving. They
     are safe for the same reason the digits are — `pad-check` asserts that nothing in
     any keyset answers to a key this file dispatches on — and they do nothing
     at all unless force-spawn is on. */
  Backslash: '\\', KeyR: 'R', KeyU: 'U',
};

/**
 * The debug panel's one row that leads OUT of the game, and the reason it can
 * only ever be seen on a laptop.
 *
 * `/tuning.html` writes `src/tuning.json` through a dev-server hook, so it is
 * already unreachable on Vercel twice over — `vite build` takes its inputs
 * from `index.html` alone, and the POST endpoint is a `configureServer` hook a
 * production build never runs. This is the third and cheapest guard, and the
 * only one a PLAYER would ever notice: `import.meta.env.DEV` is replaced by
 * the literal `false` at build time, so the row is not hidden by CSS or
 * skipped by a branch — the string is constant-folded away and the markup for
 * it is not in the bundle at all. Nobody can find a link that was never built.
 *
 * It exists because the page had no way in. It was documented in CLAUDE.md and
 * in endgame.md and reported, reasonably, as "I don't see any information
 * about that" — a tool you have to remember the URL of is a tool nobody opens.
 */
const TUNING_ROW = import.meta.env?.DEV
  ? '<div class="dbg-sep">DEV ONLY — not built, not on the web</div>'
    + '<div class="dbg-row" data-open="/tuning.html">'
    + '<span class="k">&#8599;</span> BALANCE PAGE &mdash; every ability\'s '
    + 'numbers, on sliders</div>'
  : '';

/* HOW MANY FRAMES THE COST READOUT AVERAGES OVER. Two seconds at 60fps, which
   is long enough that the median is not chasing a single hitch and short enough
   that walking into a heavy room changes the number while you are still
   standing in it. */
const PERF_WINDOW = 120;

/* HOW LONG A TOAST STAYS UP. See `Game.toast` — the hold is a function of how
   much there is to read, and TOAST_MIN is the flat 1700ms every toast used to
   get, kept as the floor so short ones are bit-identical. */
/** Seconds a Snake Way coin is held up for — the clan pose's length, which
 *  is the blessing a kid already knows the rhythm of. */
const COIN_BLESS = 2.2;
/** `_primeFinale`: meshes drawn into its pixel a frame, and the layer nothing
 *  else uses. */
const PRIME_BATCH = 12;
const PRIME_LAYER = 31;
const TOAST_MIN = 1700;
const TOAST_BASE = 600;
const TOAST_PER_CHAR = 55;
const TOAST_MAX = 7000;
const TOAST_FADE = 500;

/* ...AND HOW LONG A WARNING DOES. See `Game.warn`: the same per-character
   curve, with a floor of four seconds rather than 1.7 and a ceiling of nine.
   A warning is about something that cannot be undone, it is addressed to the
   room rather than to one kitten, and the player it is for is nine — so the
   shortest one it can print still has to survive somebody looking up. */
const WARN_HOLD_MIN = 4000;
const WARN_HOLD_MAX = 9000;

/* BAMBOO THAT NOBODY CAN EAT — see `Game._warnBamboo`.
   Ten canes between repeats is what was asked for, and it is also roughly a
   quarter of the forty a cub costs: often enough that a kid who is flattening
   a grove hears it again, rare enough that it is not a line per swing. */
const BAMBOO_WARN_EVERY = 10;
/* ...and the two fractions of the whole sky's bamboo that warn the party,
   HIGHEST FIRST. `_warnBamboo` walks them in order and keeps the last one it
   crosses, so a swing that somehow takes the grove past both says the lower
   number — the one that is actually true. */
const BAMBOO_WARN_MARKS = [0.5, 0.25];

/* HOW ALARMING A WARNING LOOKS, AND WHAT DECIDES IT.

   Reported from play: "The more bamboo is cut and the more scarcity is lost in
   the world, the messages should become more alarming, for instance, can start
   with yellow border, then progress to orange warning, and then red alert,
   should become progressively more overt to make sure players get the message."

   IT IS THE WORLD'S BAMBOO THAT SETS THE LEVEL, NOT HER OWN TALLY, which is
   what "the more scarcity is lost in the world" says and is also the only
   reading that makes one rule out of two warnings: a kitten's tenth cane is a
   small matter in a full grove and a serious one when there are forty canes
   left in the sky, and the sentence she is shown is the same sentence either
   way. So the level is a function of what is standing, and both warnings ask
   for it through the same function.

   AND IT IS THE MARKS THAT DECIDE, rather than three thresholds of its own.
   `BAMBOO_WARN_MARKS` already names the fractions this game thinks are worth
   shouting about, so keying the colours off the same list means the 50% shout
   is ORANGE and the 25% shout is RED by construction — not because somebody
   typed 0.5 twice and kept them in step. One more level than there are marks,
   because the top of the scale is "nothing has been crossed yet"; `world-check`
   pins that relationship so adding a third mark cannot silently leave the
   lowest one un-coloured.

   THE WORDS ARE THE OTHER HALF OF "PROGRESSIVELY MORE OVERT". The colour is
   most of it, and the colour is the one thing a kid who is colour-blind cannot
   read — so every level also says what it is, in a word, on a chip. The rest of
   the escalation (how many times it blinks, how thick the border is, how big
   the words are) is in style.css beside the colours. */
const WARN_LEVELS = [
  { cls: 'lv-care', word: 'CAREFUL' },
  { cls: 'lv-warn', word: 'WARNING' },
  { cls: 'lv-alert', word: 'RED ALERT' },
];

/** How alarming a warning printed with `frac` of the world's bamboo still
 *  standing is. */
function warnLevel(frac) {
  let lv = 0;
  for (const mark of BAMBOO_WARN_MARKS) if (frac <= mark) lv += 1;
  return Math.min(lv, WARN_LEVELS.length - 1);
}

/* TWO LINES PER PANE AT MOST — the cap that was on the single strip, kept, and
   for the reason it was: the one case that stacks is a cane that both crosses a
   kitten's tenth AND takes the grove past a mark, which is two true sentences
   about one swing. A third would be a paragraph over the picture, and it is a
   paragraph in every pane now. */
const WARN_STACK = 2;

/** THE LEAST ROOM BETWEEN THE SCOREBOARD AND WHAT HANGS UNDER IT, in CSS px.
 *  A floor, not a position: `_stackUnderScores` only ever pushes the tally and
 *  the toasts DOWN to clear it, and where the stylesheet already leaves more
 *  than this — every two-player layout it was measured against — nothing is
 *  written at all. */
const HUD_STACK_GAP = 6;

/** How far below the top of the Help box an opened topic lands, in CSS px:
 *  enough for the pad's focus ring, which is drawn outside the summary. See
 *  `_helpToTop`. */
const HELP_TOP_GAP = 10;



/* HOW FAR BACK THE DOJO CAMERA SITS, and it is a different answer on a phone.

   104 frames the whole unit circle on a desktop, which is the shot the room was
   designed around: you stand ON the circle and read the diagram around you. The
   same 104 on a 6-inch screen makes the axis labels a few pixels tall and the
   kitten a smudge — the lesson is a DIAGRAM, and a diagram you cannot read is
   not a smaller version of the lesson, it is none of it.

   58 is about 44% closer. It loses the outer edge of the circle at the extremes
   and keeps every number legible, which is the right trade on a screen held at
   arm's length. */
const DOJO_DIST = { desktop: 78, touch: 44 };

/* HOW STEEPLY THE DOJO CAMERA LOOKS DOWN, and it is a compromise between two
   things that genuinely fight.

   Steep is what the diagram wants. This is graph paper drawn on the floor, and
   the closer the camera is to straight down the closer the painted circle is to
   a circle rather than an ellipse.

   Steep is also what makes the kitten look like a sheet of paper. She is a
   BILLBOARD — a flat quad standing up in the world — so how tall she reads on
   screen is `cos(pitch)`, and at the old 1.16 that is 0.40: she was drawn at two
   fifths of her height, seen almost edge-on, which is exactly the "piece of
   paper" in the report.

   1.00 is where the trade sits. `cos` goes 0.40 -> 0.54, so she is about a third
   taller on screen; `sin` goes 0.92 -> 0.84, so the circle's squash goes from 8%
   to 16% and still reads as a circle. Both numbers are why this is one named
   constant and not two literals in two files — the per-player camera and the
   merged rig each set it, and they were already drifting: one said `dist: 104`
   inline while the other read DOJO_DIST. */
const DOJO_PITCH = 1.0;

/* HOW MUCH THE DOJO SHOT GIVES UP ON FOLLOWING THE PLAYER. On a desktop the
   camera goes all the way to the circle's centre (1) because the whole circle is
   in frame anyway. Closer in, that would leave her walking out of shot, so on a
   phone it only goes most of the way and keeps tracking her. */
const DOJO_CENTRE_BIAS = { desktop: 1, touch: 0.72 };
/** How long the found-a-star pose runs. Matches Player.holdAloft's default. */
const STAR_POSE = 2.0;
/**
 * How long the joined-a-clan celebration runs.
 *
 * LONGER THAN A STAR, because there is more to look at: a star is one object
 * over her head and this is an object, a change of pose, a camera move AND a
 * leader dancing behind her. It is still deliberately short — she is standing
 * in a shrine with her sisters playing on, and the celebration must be over
 * before it becomes a thing she is waiting out. Same clock drives the kitten's
 * pose, the emblem, the camera and the leader, so they cannot drift apart.
 */
const CLAN_POSE = 2.4;
/** Seconds on an island before its theme takes over. See Game._islandTrack. */
const ISLAND_DWELL = 1.1;

/* THE ONLY KEY THAT SKIPS A STORY SCENE. On a pad it is `start` and nothing
   else (Game._skipPressed). Both are buttons you press to mean "get me out of
   this"; every other control is one a kid is already holding while she
   watches, which is how a 79-second intro with seven recorded voices was being
   thrown away by a thumb resting on jump.

   IT USED TO BE SPACE AND ENTER TOO, AND FOUR PLAYERS IS WHY IT ISN'T. Space
   is player 1's JUMP and Enter is how a player joins — both are keys somebody
   at this keyboard has a finger on for reasons that have nothing to do with
   the scene. With two girls that was survivable; with four people round one
   machine, one of whom is not watching, the scene belongs to whoever twitches
   first. Escape is the only key on a keyboard that means "get me out of this"
   and nothing else, which is exactly the property `start` has on a pad.

   NOTE `_skipPressed` HAS TO AGREE, and it does not do it by reading this set:
   a keyboard slot's `start` action IS Enter (see KEYSETS), so a keyboard
   player would have gone on skipping with Enter through the pad path however
   this line were written. It filters by device instead. */
const SKIP_KEYS = new Set(['Escape']);

/* A pad that reports nothing, shaped exactly like a real one so nothing
   downstream has to check. Used for the tournament's frozen states — the
   round card, the countdown, the knockout, the results screen. `Player` has
   its own copy for hit-stun and the star pose; this is the same idea applied
   from the outside, and keeping it here rather than exporting theirs is
   deliberate: the two freeze for unrelated reasons and merging them would tie
   a change in one to the other. */
const DEAD_PAD = { mx: 0, my: 0, down: () => false, pressed: () => false };

/* The camera inside a grotto.
   IT DOES NOT TURN. Two earlier versions swung the yaw to face along the
   doorway axis, and both were worse than leaving it alone: the camera whips
   round as you cross the threshold, and inside a round room "along the door"
   stops meaning anything after the first corner. The x-ray cut is what makes
   the walls stop mattering, so the view can simply stay the one the rest of
   the game uses.
   The pitch lifts a little so you look DOWN into the room rather than across
   it, and the distance opens up so a corridor is not framed nose-first. Both
   are gentle on purpose — these characters are billboards, and steep pitches
   flatten them (see xrayVertexMat for the measurements). */
const CAVE_DIST = 30;
const CAVE_PITCH = 0.82;

/**
 * How far from a pane's camera a kitten may be and still open a hole in the
 * town. See `Game._aimTownXray`.
 *
 * MEASURED AGAINST THE CAMERA, NOT AGAINST A BUILDING, because the cut is a
 * capsule from the lens to her and what it costs is what it swallows on the
 * way. The walking camera sits about 30 units out and a dragon pulls it to
 * around 90; past that she is a few pixels tall and the hole would be smaller
 * than she is, while the capsule would be long enough to take the whole market
 * square with it on the way past. 120 keeps every on-foot camera and the low
 * end of flight, and drops the high tour.
 */
const TOWN_XRAY_FAR = 120;
/**
 * How far out past the ring's deck (`World.arenaOutBy`) a kitten is still cut
 * for by the arena's x-ray. It was 40, which reached the stands and his booth
 * and the dragon columns (27 out) and stopped there. Measured: the lanterns
 * are 34 and 43 out, the road's torii 49 and its lions 51, so a kitten among
 * them was never cut for, and one just past them on the road, which is where
 * they stand between her and a lens, even less. 60 reaches the first few
 * units of the road, and the island's rim is 63 out, so a kitten who has
 * fallen off still stops carving.
 */
const ARENA_XRAY_OUT = 60;

/** How long the triple slash's burst lives. Longer than `hitSpark`'s 0.26 by
 *  design: this one has to cover a kitten switching from frozen to flying, and
 *  an effect shorter than the change it is hiding does not hide it. */
const BOOM_TIME = 0.5;

/**
 * How far apart two kittens have to be for a join spot to count as free.
 *
 * A kitten is about two units across and 2.9 tall, so three units is "you can
 * see there are two of us" and not much more. Bigger and a join in a busy
 * town square walks a long way out of it to find room; smaller and two cats
 * still read as one drawing. See `_joinSpot`.
 */
const JOIN_APART = 3;

/**
 * How far a kitten's starting mark may wander from her lane.
 *
 * ONE UNIT, WHICH IS DELIBERATELY SMALL. The four marks are 3.5 apart
 * (`palette.js` `startX`), so a full unit of wobble each way still leaves a
 * clear gap and — the part that matters — leaves the four of them in the same
 * left-to-right ORDER every single game. Ember is always the leftmost cat.
 * Randomising far enough to shuffle that would make "go left, that's yours"
 * stop being true, which is a worse thing to lose than sameness.
 *
 * The z wobble is the same number. The mark is at z 34 on open ground, so
 * there is nothing within a unit of it to be pushed into.
 */
const START_JITTER = 1;

/** Scratch for `_render`'s per-pane heading (see `Player._viewBasis`). */
const _viewDir = new THREE.Vector3();

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    /* WHAT THIS MACHINE MAY SPEND, decided once and read by the renderer, the
       art loader and the quality setting. `antialias` is a CONSTRUCTOR option
       and cannot be changed afterwards, which is why this is the first line of
       the constructor rather than part of `_applyQuality`. See core/device.js
       for why the art budget moves `maxAtlas` and never `cell`. */
    this.device = detectDevice();
    /* WHAT THE GAME ACTUALLY BOOTED AS, kept because `this.device.touchPrimary`
       is PATCHED LIVE when the setting changes and is therefore useless for
       answering "does this need a reload". Comparing the setting against a value
       the setting had just written made the reload note dead code — it could
       never disagree with itself. The renderer, the atlas budget and the party
       size were all decided from this snapshot and cannot move under a running
       game, so this is the thing to compare against. */
    this._bootPhone = this.device.touchPrimary;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.device.antialias,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0x1b1426);

    /* THE FRAME TIMES BEHIND THE `P` READOUT, WRITTEN WHETHER OR NOT IT IS UP.

       One store into a preallocated array per frame, which is nothing, and it
       buys the thing that matters when somebody says "it just stuttered": the
       readout opens showing the two seconds that have ALREADY happened rather
       than starting a fresh sample from the moment you asked for it. A profiler
       you have to turn on before the problem is a profiler that never sees the
       problem. */
    this._perfRing = new Float64Array(PERF_WINDOW);
    /* AND THE SAME WINDOW OF JS TIME, WHICH IS THE HALF THAT NAMES THE CULPRIT.
       A frame time on its own cannot tell "our update loop is slow" from "the
       GPU is a frame behind" from "the garbage collector stopped the world",
       and those three want three completely different fixes. `_tick` measures
       itself; the GAP between that and the frame is everything the browser did
       — compositing, GC, waiting on the driver. See `_paintPerf`. */
    this._perfJs = new Float64Array(PERF_WINDOW);
    this._perfIx = 0;
    this._perfLast = 0;
    this._perfPaint = 0;
    this._perfOn = false;
    /** Debug: print the health numbers under every arena bar. Read by
     *  `Tournament._paintHud`, toggled by the panel's own row. */
    this._overflowDbg = false;
    /* AUTO-DOWNGRADE, ON UNTIL A HUMAN HAS AN OPINION. The moment somebody
       picks a quality in Settings this goes false and stays false for the
       session: a setting that argues back with the person using it is worse
       than no setting. See `_autoQualityCheck`. */
    this._autoQuality = true;
    this._autoBadSince = 0;
    this._autoNextAt = 0;
    /** ...and whether the game has already told a player who is steering it
     *  herself that it is struggling. Once per session — see
     *  `_autoQualityCheck`. */
    this._autoSaidSlow = false;

    this.scene = new THREE.Scene();
    this.input = new InputManager();
    this.audio = new Audio();
    this.clock = new THREE.Clock();

    this.state = 'loading';
    this.paused = false;
    /* THE ENDING'S TWO HOLDS, DECLARED RATHER THAN DISCOVERED. Both are edge
       latches — `_updateFinaleHold` acts only when the answer CHANGES — and an
       edge measured against `undefined` fires on the first frame of the game:
       the very first pass would have told the announcer to un-hush before
       anybody had said anything. Harmless, and the kind of harmless that makes
       a check of the edge impossible to write. */
    this._finaleHush = false;
    this._castHidden = false;
    /**
     * SECONDS OF ACTUAL PLAY in this run, and the only thing the autosave is
     * gated on.
     *
     * NOT WALL CLOCK AND NOT FRAMES. Asked for as "shouldn't start auto-saving
     * until after the player has played for more than 5 minutes", and a tab
     * left open on the pause menu over lunch is not five minutes of play — it
     * would fill all five slots with the same untouched town and push the
     * afternoon somebody cared about off the end of the list. So it ticks in
     * `_tickBody` AFTER the pause check and only while `state === 'play'`: a
     * frozen world does not age, and neither does the title screen.
     *
     * A LOAD SETS IT rather than resetting it (see savegame.js `restore`), so
     * the afternoon you carried on from keeps counting up from where it was.
     */
    this.playT = 0;
    /** When the next autosave is due, on the same clock. */
    this._saveAt = AUTOSAVE_AFTER + AUTOSAVE_EVERY;
    /**
     * WHICH AFTERNOON THIS IS, and everyone who has been part of it.
     *
     * ONE SAVE SLOT PER PLAY SESSION. Reported: the autosave was writing a NEW
     * slot every thirty seconds, so within two and a half minutes all five held
     * the same afternoon at thirty-second intervals and every other game
     * anybody had played was gone. `sessionId` is stamped into each snapshot
     * and `putSave` replaces the row carrying it — so one afternoon is one row
     * that keeps getting more recent, and five rows are five afternoons.
     *
     * AND THE CAST IS EVERYBODY WHO PLAYED, NOT EVERYBODY IN A SEAT. Keyed by
     * the KITTEN's name, because that is what a girl comes back to: "even if a
     * player drops out, when they return with that player, they will return
     * with all their data from where they left off." A kitten who put her
     * controller down twenty minutes ago is still in the save and still in the
     * count, and picking her back up hands her everything.
     * @type {Map<string, object>}
     */
    this.sessionId = newSessionId();
    this.sessionCast = new Map();
    /**
     * THE PANDAS OF KITTENS NOBODY IS PLAYING, keyed by the kitten's name.
     *
     * A PET CAN NEVER BE LOST — fourth non-negotiable — and a swap in the
     * character picker used to lose one quietly. `_seatPlayer` drops the old
     * `Player` object on the floor, and her panda was only ever referenced by
     * it, so the animal stayed in the scene, unowned and unticked, forever; and
     * swapping BACK to her built a second one beside it. Two pandas is the same
     * bug as none, from the other side.
     *
     * PARKED RATHER THAN DESTROYED, because the alternative is destroying an
     * animal that cost twenty canes of bamboo in a world where bamboo does not
     * regrow. `_rememberPlayer` parks; `_recallPanda` adopts. It is a live
     * `Panda`, so it never goes anywhere near a save file — the SAVE carries
     * the tier as a fact (see `castRow`), and these two paths meet in
     * `_recallPanda`, which builds one only when there is nothing to adopt.
     * @type {Map<string, object>}
     */
    this._parkedPandas = new Map();
    /* WHICH PLAYER IS DRIVING THE MENU, as a slot index, or null for "anybody".
       See `_claimMenu` — this is the whole of the one-cursor rule. */
    this.menuOwner = null;
    this.merged = true;
    /* ON A PHONE THE WORLD IS NOT BUILT UNTIL PLAY — see `boot`. Decided once,
       off the device the page loaded on, because it decides what `boot` does
       and a boot only happens once. */
    this._lazyWorld = !!this.device.touchPrimary;
    /** Set at the very end of `_buildWorld`. `this.world` is not the same
     *  question: it is assigned a third of the way through the build. */
    this._worldReady = false;
    /* An empty party until `_spawnPlayers`, so the title screen's own
       helpers (`_checkMenuOwner`, `_applyMath`) have a list to read. On a
       desktop that took the length of `boot`; on a phone the title screen can
       be up for as long as she likes with no world under it. */
    this.players = [];
    /* The defaults come from the device, not from a literal, so a phone opens
       on the low tier and unsplit without a kid having to find Settings. Every
       one of them is still a setting she can change. On a desktop `profileFor`
       returns exactly the values that were hard-coded here. */
    this.settings = {
      split: this.device.defaultSplit,
      dir: 'vertical',
      quality: this.device.defaultQuality,
      /* 'auto' | 'on' | 'off' — see `_mathDefault`. It is a setting rather
         than only a button because "we may remove those from the controllers
         in the future", and because a kid on a phone has no `M` to press. */
      math: 'auto',
      /* 'each' | 'two' — how many minimaps are on screen. See `_buildHud` and
         the row in index.html. 'each' is the shipped answer: a map in every
         window is what makes a zoom button turn the box its own player is
         looking at, and at two players the two answers are the same screen. */
      maps: 'each',
    };
    /* ...AND THEN WHATEVER SHE CHOSE LAST TIME, OVER THE TOP. Reported from a
       phone: "when switching settings like 'Split screen' or 'On screen stick'
       these should be saved for the game, so that player doesn't need to keep
       changing this whenever they play the game." Every row here used to be
       re-seeded from the device at each boot, and on a phone the main menu is
       now a reload (see `toTitle`), so a row that did not survive one did not
       survive the title screen either. Only the rows she has TOUCHED are
       stored — see core/prefs.js — so the rest keep following the device.

       A STORED QUALITY IS A HUMAN'S OPINION, so it turns the auto-downgrade
       off exactly as picking it in the panel does: "a setting that argues
       back with the person using it is worse than no setting."

       The stick is not here because it was never lost: it has its own key in
       core/device.js, read at boot because the render tier depends on it. */
    this._prefs = readPrefs();
    for (const k of ['split', 'dir', 'quality', 'math', 'maps']) {
      if (this._prefs[k] !== undefined) this.settings[k] = this._prefs[k];
    }
    if (this._prefs.quality !== undefined) this._autoQuality = false;
    if (this._prefs.padmode !== undefined) this.input.padMode = this._prefs.padmode;
    if (this._prefs.joycon !== undefined) this.input.joyconRotation = this._prefs.joycon;
    if (this._prefs.sfx !== undefined) this.audio.setSfxVolume(this._prefs.sfx / 100);
    if (this._prefs.music !== undefined) this.audio.setMusicVolume(this._prefs.music / 100);
    /* THE MATHS OVERLAY IS OFF BY DEFAULT ON A PHONE, and it turns itself on
       when she walks into the Dojo — see `_updateMathForDojo`. It is not a
       demotion of the feature: on a 6-inch screen the orb's working sits on top
       of the kitten drawing it, and the thing it is teaching is a diagram you
       have to be ABLE TO SEE. The Dojo is where that lesson happens, so that is
       where it appears; the tap on the board still overrides either way.
       ...UNLESS SHE HAS SAID OTHERWISE IN SETTINGS, which is what 'auto' means
       and the whole of what the new row adds. See `_mathDefault`. */
    this.mathVisible = this._mathDefault();

    /* HOW MANY KITTENS ARE IN THE WORLD. Two on a desktop unless somebody
       claims a third slot, which is the whole of the compatibility story: the
       girls press PLAY and get Ember and Frost exactly as they always have, and
       everything that scales with the party — the split screen, the dealer's
       shelf, the orbs scattered at the Awakening, the ring's team modes — reads
       this rather than assuming a number. It moves when a player joins or
       leaves.

       ONE ON A PHONE, and it costs almost nothing because the four-player pass
       already made every one of those things read the number instead of
       assuming it. `_leavePlayer` has always guarded at 1, so one kitten is the
       floor this code stops at rather than a state it cannot hold. The single
       exception is the tournament, which needs two fighters and says so — see
       `systems/arenaquest.js`. */
    this.partySize = this.device.defaultParty;
    /* AND THE INPUT LAYER HAS TO BE TOLD, at boot and not only on join/leave.
       These two numbers must always agree — `input.js` is explicit that a slot
       past the party size reads NOTHING, or a keyboard set silently drives the
       controller state of a kitten nobody has seated, and `seatable` /
       `joinHint` are both computed against it.

       They used to agree BY ACCIDENT: both were the literal 2, so nothing had to
       assign it and nothing did. The moment the party came from the device that
       accident broke — a phone booted with one kitten and an input layer still
       tracking two, which handed the arrow keys to a phantom player 2 and made
       `joinHint` report that nobody could join. */
    this.input.slots = this.partySize;

    /* ONE CAMERA RIG PER PLAYER SLOT, AND THE RIG IS NAMED BY A PLAYER RATHER
       THAN BY A GROUP. Rig `i` draws whichever group of kittens has player `i`
       as its lowest member, which is how a group can gain or lose somebody
       without the view being handed to a camera that was somewhere else — see
       `core/cluster.js` for why that naming is the whole design and not a
       detail. Rig 0 IS the old `sharedCamera`, byte for byte, and it is still
       what draws the title screen's fly-over and the one-view cases; the other
       three did not exist until there was something for them to draw.

       EVERY RIG IS UPDATED EVERY FRAME, DRAWING OR NOT. This file has learned
       that lesson once already, expensively: a lerped camera left un-updated is
       not stale by a little, it is frozen wherever the world was when it
       stopped, and taking the screen from there flies across the archipelago.
       Four rigs is four vector lerps a frame. */
    this.rigs = Array.from({ length: MAX_PLAYERS }, () => ({
      camera: new THREE.PerspectiveCamera(38, 1, 0.5, 4000),
      target: new THREE.Vector3(),
      dist: 34,
      /** Per rig, not per game: two groups can be in two different places, and
       *  one of them inside a grotto while the other is on a hillside. */
      focusT: 0,
      caveT: 0,
      seeded: false,
      /** The ride camera, for when every kitten this rig frames is on the same
       *  road — see `_snakeGroup`. */
      snakeCam: new SnakeCam(),
      /** The look across a sim bridge, for a group walking up to one
       *  together — see `_peekGroup`. */
      bridgePeek: new BridgePeek(),
    }));
    this.sharedCamera = this.rigs[0].camera;
    /** Player index -> her group's lowest member, last frame. The hysteresis
     *  reads it; nothing else should. */
    this._clusterOf = null;
    /** Where every player's pane was last frame, as frame fractions. Fed to
     *  `stablePanes` so a pane that could stay put does. Empty on the first
     *  frame and after a resize, which simply means nobody has an opinion yet
     *  and `splitLayout`'s own order stands. */
    this._paneSeats = {};
    /** This frame's groups, as arrays of player indices. One per pane.
     *  Seeded from the party rather than written as `[[0, 1]]`, or a one-kitten
     *  game spends its first frame claiming to hold a player 1 who does not
     *  exist — and `_drawMaps` and `_buildHud` both size themselves off this. */
    this.groups = [Array.from({ length: this.partySize }, (_, i) => i)];

    this.pickups = [];
    this.dragons = [];
    /* Menus on a controller. Built before _bindUI so nothing can reference a
       half-made one from a listener that fires during setup. */
    this.menuNav = new MenuNav(this);
    /* Built here rather than with the world systems because it owns no world:
       it is a `<video>` and four listeners, and it has to exist before the
       title screen's buttons are bound below. */
    this.trailer = new Trailer(this);
    /* Same reasoning as Trailer: no world, and it has to exist before the
       buttons below are bound. */
    this.confirm = new Confirm(this);

    /* THE CROSS SLASH'S WIND-UP AND ITS SEAL. It wants the scene and nothing
       else — it reads the kittens' own clocks every frame and never asks the
       game anything, which is why it takes no `this`. See systems/crossfx.js
       for why it is a poller and not a set of callbacks. */
    this.crossFx = new CrossFx(this.scene);

    /* THE FLASH STEP'S RETICLE, SMOKE AND DECOY. Same shape and the same
       argument: a poller over the kittens' own clocks, so no way of the move
       ending has to remember to tell it. See systems/dodgefx.js. */
    this.dodgeFx = new DodgeFx(this.scene);
    /* ...and Payne's Goblin Sweep, the same poller shape over `sweepSeq`. */
    this.sweepFx = new SweepFx(this.scene);
    this.parryFx = new ParryFx(this.scene);

    /* THE TWO CLAN POWERS THE RING GAVE BACK TO ICEWHISKER AND WINDWHISKER:
       the mark 盗 Steal Mischief puts on somebody, and the inhale and cone of
       息 Dragon Breath. A poller again, over `stealMarkT` and `breathChargeT`,
       for the third time and the third identical reason — see
       systems/clanfx.js. */
    this.clanFx = new ClanFx(this.scene);

    /* THE ON-SCREEN PAD EXISTS ON EVERY MACHINE AND IS SHOWN ON SOME. Building
       it always — rather than only when `touchPrimary` — is what makes the test
       mode a visibility toggle instead of a construction path that only ever
       runs on hardware nobody is developing on. It costs a handful of divs.

       `attachTouch` is what actually seats it: the input layer deals it a player
       slot only while it is attached, so "force off" is genuinely no device
       rather than a hidden one still reporting. */
    this.touchPad = new TouchPad(document.getElementById('touch-pad'));
    this._applyTouchMode();

    this._bindUI();
    this._bindTouchHud();
    this._bindDebugCorner();
    this._bindContextLoss();
    window.addEventListener('resize', () => this._resize());
    /* The rotate gate is a function of orientation, and `resize` is the event
       that fires for a rotation on every browser — `orientationchange` is
       unreliable and deprecated in places. The pad's resting stick position is
       measured off the zone, so it has to be re-measured for the same reason. */
    window.addEventListener('resize', () => {
      this._updateRotateGate();
      this.touchPad?.reflow();
      /* The scoreboard's SIZE is watched below; its `top` is a media query
         and a safe-area inset, and only a resize moves those. */
      this._stackUnderScores();
    });
    /* WATCHED, NOT POLLED. What moves the scoreboard's bottom edge is a
       clan badge wrapping onto a second line, a fifth kitten's badge, the
       touch-ui class going on or off and a font arriving late — four events in
       four places, and a ResizeObserver hears every one of them without being
       told about any. `#balls` is watched as well because showing it, hiding it
       and changing its words all change how far down the toasts have to go.
       Optional, because a browser without it still has the stylesheet's own
       numbers, which is where this was before. */
    if (typeof ResizeObserver === 'function') {
      this._stackObs = new ResizeObserver(() => this._stackUnderScores());
      for (const sel of ['.scoreboard', '#balls']) {
        const el = document.querySelector(sel);
        if (el) this._stackObs.observe(el);
      }
    }
    /* COMING BACK FROM ANOTHER TAB IS NOT A PERFORMANCE EVENT. A hidden tab has
       its animation frames throttled to about half a hertz; every one of those
       is recorded as a two-second frame, and the auto-downgrade read a ring
       full of them as a machine that could not cope. Alt-tab away, come back,
       and the game had quietly turned itself down. Discard the history instead
       of trying to interpret it. */
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this._discardPerf(performance.now());
    });
  }

  /**
   * Show or hide the touch pad, and attach or detach it as a device.
   *
   * ONE FUNCTION FOR BOTH, because they must never disagree: a visible pad that
   * is not attached is a control that does nothing (which reads as broken), and
   * an attached pad that is not visible is a slot held by a device nobody can
   * see — which on a desktop would silently take player 1's seat away from the
   * keyboard.
   *
   * TWO FLAGS, NOT ONE, AND THE SPLIT IS THE WHOLE POINT OF THIS FUNCTION NOW.
   * `touchPrimary` is "this is a phone" and drives the LAYOUT; `padOn` is "the
   * stick is on screen" and drives the CONTROL. They used to be one boolean, so
   * hiding the stick to play on a controller also threw away the phone-sized
   * HUD — see `profileFor` in core/device.js for the report that found it.
   */
  _applyTouchMode() {
    const phone = this.device.touchPrimary;
    const pad = this.device.padOn;
    /* THE CLASS GOES ON BEFORE THE PAD IS SHOWN, and the order is load-bearing
       now that `setVisible` MEASURES. `body.touch-ui` is what selects the phone
       button size (`--tp-unit`), so toggling it afterwards meant the cluster was
       measured at the tablet size, placed for a box 184px tall, and then shrank
       to 148 underneath its own position — it sat 18px low with nothing to say
       why. Class first, then show and measure. */
    document.body.classList.toggle('touch-ui', phone);
    /* NO SECOND CLASS FOR "PHONE WITH THE STICK OFF", AND IT WAS TRIED.
       A `body.no-pad` looked obviously right — with no thumbs on the glass, the
       bottom corners and the full width are free again — and every rule written
       for it turned out to be styling something already hidden or already moved
       for a different reason. The bottom hint is `display: none` on touch
       because it names KEYBOARD KEYS, not because a thumb was over it; the map
       is top-left because that is where it was asked to be. A class the
       stylesheet does not read is a comment that lies about where the layout
       lives, so there isn't one. */
    this.touchPad.setVisible(pad);
    /* THE PAD ALWAYS CARRIES WASD AS ITS SECOND SURFACE — see `_freeKeysets` in
       core/input.js. On a phone there is no keyboard and that costs nothing; on
       a tablet with one attached it is player 1's other hand, and on this desktop
       it is how the pad gets tested at all. Player 2 joins on the arrows. */
    this.input.attachTouch(pad ? this.touchPad : null);
    /* --- FLIPPING THIS SETTING RE-DEALS EVERY DEVICE, AND IT HAS TO ---
       A claim is a slot saying "this device is mine", and it beats the dealer.
       That is exactly right for a player who pressed START on the controller she
       is holding, and exactly wrong here, because this setting is a statement
       about WHICH DEVICE PLAYER 1 IS — so honouring the old claims is honouring
       an answer to the question that has just been asked again.

       The case it breaks is the one somebody on a phone actually walks into:
       thumb on the screen as player 1, a Bluetooth pad joined as player 2 (and
       therefore CLAIMED by slot 1). Turn the stick off, and slot 1 keeps the
       only controller in the room while slot 0 — now padless — is dealt WASD on
       a device with no keyboard. Player 1 becomes a kitten nobody can move,
       which is the setting appearing to break the game rather than to do what
       it says.

       Cleared only when `padOn` actually MOVES, not on every call: the
       constructor calls this too, and re-dealing a party mid-session for a
       setting that did not change is churn nobody asked for. */
    if (this._padOnLast !== undefined && this._padOnLast !== pad) {
      this.input.claims = {};
      /* The auto-seat latch was cleared here too, and there is no longer one
         to clear: `_autoSeat` asks for a press of A or START and an edge does
         not need forgiving. See `InputManager.sparePad`. */
      this._trimPartyToDevices();
    }
    this._padOnLast = pad;
    this._updateRotateGate();
  }

  /**
   * Send home any kitten this machine can no longer drive.
   *
   * TURNING THE STICK OFF TAKES A DEVICE OUT OF THE POOL, and the party does not
   * shrink on its own. On a phone with one Bluetooth pad and two players — thumb
   * as player 1, pad as player 2 — that leaves two kittens and one controller,
   * and the second one is a cat standing in the world that nothing on the
   * machine can move. A kid reads that as the game breaking, not as the setting
   * doing what she asked.
   *
   * SHE LEAVES PROPERLY RATHER THAN BEING ABANDONED. `_leavePlayer` is the one
   * path that puts her orbs back in the world, sends her panda and her dragon
   * home, re-indexes the seats and says so in a toast — every one of which is a
   * rule that exists because dropping a player wrong loses something. Doing it
   * by hand here would be a second, worse copy of it.
   *
   * FROM THE BACK, so the girl who has been playing longest keeps her seat.
   * `_leavePlayer` guards at one, so this cannot empty the world.
   */
  _trimPartyToDevices() {
    if (!this.players?.length) return;      // still booting; nothing to trim
    while (this.partySize > 1 && this.partySize > this.input.seatable) {
      this._leavePlayer(this.partySize - 1);
    }
  }

  /**
   * `map` and `math` on a touch device, tapped on the thing they control.
   *
   * NO BUTTONS FOR THESE, and that is a decision rather than an omission — see
   * `core/touchpad.js`. Eight actions do not fit under two thumbs, and these two
   * are already drawn on screen: the minimap cycles its own zoom when tapped and
   * the sin/cos board toggles itself. A control that IS the thing it controls
   * needs no second copy.
   *
   * Delegated from the HUD, because `_buildHud` rebuilds the maps whenever the
   * party changes and per-element listeners would be lost with them.
   */
  /**
   * Which seat the on-screen pad is sitting in.
   *
   * Asked of the input layer rather than assumed to be 0: the touch pad is
   * seated in a slot like any other device, and on a tablet with a keyboard
   * player 1 can be the keyboard. Falls back to 0, because a toast in the
   * wrong lane is better than no toast. Same question, same answer and the
   * same reasoning as `ProfileScreen._touchSide`.
   */
  _touchSeat() {
    const b = this.input?.bindings ?? [];
    const i = b.findIndex((x) => x?.touch);
    return i >= 0 ? i : 0;
  }
  /**
   * Re-word Settings' touch row for a machine that really is a phone.
   *
   * WHAT THE PLAYER IS CHOOSING ON A PHONE IS WHO PLAYER ONE IS, not whether a
   * stick is drawn. Touch is dealt ahead of every controller — see `_devices` in
   * core/input.js, where the ordering is argued for at length — so the two
   * states of this one setting are:
   *
   *   Mobile input   the thumb is player 1; a paired gamepad seats player 2
   *   Gamepad        gamepad 1 is player 1, gamepad 2 is player 2, and on down
   *
   * Both were already true. What was missing was any way to find that out: the
   * row said "On-screen stick / Always OFF — controller or keyboard", which
   * describes the visible half of a change whose important half is a seat
   * moving. A kid with a controller and a phone had to guess.
   *
   * ONE SELECT, ONE STORED VALUE, TWO SPELLINGS — deliberately not a second
   * setting. Two widgets over one boolean is two things to keep in step, and
   * the first time they disagreed there would be no way to tell which one the
   * game believed. The phone labels live in the markup as `data-phone`
   * attributes so both wordings of a row sit next to each other.
   *
   * KEYED OFF `detected`, NOT `touchPrimary`, and that distinction is the whole
   * reason this is a method rather than three lines inline. `touchPrimary` is
   * true in the desktop test mode as well, so keying off it would relabel the
   * test mode's own escape hatch as "Mobile input" — the row you use to get
   * back to a keyboard, re-worded as though you were holding a phone. `detected`
   * is what the hardware said and does not move when the override does, so this
   * runs ONCE and never has to be undone.
   */
  _shapeTouchSetting(sel) {
    if (!sel || !this.device?.detected) return;
    const label = document.getElementById('set-touch-label');
    if (label?.dataset.phone) label.textContent = label.dataset.phone;
    for (const opt of sel.options) {
      if (opt.dataset.phoneHide !== undefined) {
        /* IDENTICAL STATE, DIFFERENT LABEL. On a detected phone `auto` and
           `mobile` both give `padOn: true`, so moving a stored `mobile` onto
           `auto` for display changes nothing about how the game reads — and it
           has to happen before the option is hidden, or the select would be
           left showing a blank row. */
        if (sel.value === opt.value) sel.value = 'auto';
        opt.hidden = true;
        continue;
      }
      if (opt.dataset.phone) opt.textContent = opt.dataset.phone;
    }
  }


  _bindTouchHud() {
    document.getElementById('maps').addEventListener('click', (e) => {
      if (!this.device.touchPrimary) return;
      const box = e.target.closest('.map-box');
      if (!box) return;
      /* `_cycleMapAt`, NOT `_zoomMap`. The id carries the MAP's index and
         `_zoomMap` wants a PLAYER's; they were the same number until a map
         could move between panes, and after that a tap on the second box was
         being read as player 2 asking for hers. */
      const i = Number(box.id.slice('map-box-'.length));
      if (Number.isInteger(i)) this._cycleMapAt(i, this._touchSeat?.() ?? 0);
    });
    document.getElementById('math-board').addEventListener('click', () => {
      if (!this.device.touchPrimary) return;
      this._toggleMath();
    });
  }

  /**
   * Rename the touch buttons for what they would actually do this frame, and
   * tell the corner button whether it is a menu or a skip.
   *
   * WHY THE LABELS MOVE AT ALL: `interact` is "join a clan" for about ten
   * seconds of a whole playthrough and "go down" for every minute spent on a
   * dragon. A fixed CLAN is a label that is wrong more often than it is right,
   * and a kid reads it, presses it, drops off her dragon and concludes the
   * button is broken. The GLYPHS never move — those are the pad's letters, and
   * they are how the HELP page and a real controller stay true.
   *
   * READ OFF PLAYER 1, because she is the touch player: `_devices` deals touch
   * to slot 0 ahead of every pad, so the buttons on screen are hers. In a
   * two-player game on a tablet, player 2 is on a pad or the arrows and has no
   * on-screen labels to be wrong about.
   *
   * CHEAP ENOUGH TO RUN EVERY FRAME: `setLabels` compares before it writes, so a
   * frame in which nothing changed touches no DOM at all.
   */
  _updateTouchContext() {
    if (!this.touchPad?.visible) return;

    const scene = this._sceneActive();
    this.touchPad.setPauseMode(scene ? 'skip' : 'menu');
    this.touchPad.setSceneMode(scene);
    if (scene) return;

    const p = this.players[0];
    if (!p) return;

    /* ON A DRAGON THE WHOLE CLUSTER CHANGES JOB. Jump is climb, interact is
       dive, and slash is the breath weapon — three buttons whose ground names
       are all wrong at once, which is why this case is first. */
    if (p.mount || p.rideAlong) {
      this.touchPad.setLabels({
        jump: 'UP', interact: 'DOWN', attack: 'FIRE', mount: 'OFF', sprint: 'BOOST',
      });
      return;
    }

    if (p.pandaMount) {
      this.touchPad.setLabels({ attack: 'CLAW', mount: 'OFF' });
      return;
    }

    /* IN THE RING. `mount` is the feast's EAT during the break and nothing at
       all during a round — and a button labelled RIDE in an arena with nothing
       to ride is the clearest case of a label lying. */
    if (this.tournament?.active) {
      this.touchPad.setLabels({
        mount: this.menagerie?.feasting ? 'EAT' : '—',
        interact: p.power?.dive ? 'DIVE' : 'ACTION',
      });
      return;
    }

    /* STANDING IN A SHRINE RING is the one moment CLAN is the right word, so it
       is the one moment it is used. Asked with the shrine's OWN radius, the same
       number the oath itself tests, rather than a second copy of it here. */
    const labels = {};
    if (this._shrineUnderfoot(p)) labels.interact = 'CLAN';
    else if (p.power?.dive) labels.interact = 'DIVE';
    if (p.power?.ward) labels.mount = 'SHIELD';
    this.touchPad.setLabels(labels);

    /* THE WARD IS LOCKABLE ONLY WHILE THE ORB IS WORN. A double tap that latches
       a button which does nothing is worse than no latch at all: she has no way
       to tell a held control from a broken one. `sprint` is always lockable
       because sprinting is always a thing you can do. */
    this.touchPad.setLockable(p.power?.ward ? ['sprint', 'mount'] : ['sprint']);

    /* AND IT UNLATCHES ITSELF WHEN IT RUNS OUT. The rule lives in
       `wardLatchExpired` rather than here, and that is not tidying: it has been
       got wrong twice, both times by testing something that is momentarily true
       on the frame the gesture is still being made, and as a pure function
       `pad-check` can put that exact frame through it. Read its comment before
       touching this. */
    if (wardLatchExpired({
      wardCool: p.wardCool, wardRegrab: p.wardRegrab, hasOrb: !!p.power?.ward,
    })) this.touchPad.release('mount');
  }

  /**
   * On a phone, the maths overlay follows the Dojo.
   *
   * ON THE PHONE ONLY, AND THAT IS THE POINT. On a desktop the overlay is a
   * toggle a kid leaves on, because there is room for it; on a phone it draws
   * two live numbers over the character she is steering. The Dojo of the Turning
   * Circle is where the lesson is, so that is where it appears — walking in
   * turns it on and walking out turns it off, which is also the clearest
   * possible statement of what the room is FOR.
   *
   * IT YIELDS TO A DELIBERATE TAP. `_mathAuto` remembers whether the last change
   * was this function's doing; once she taps the board herself, that choice
   * stands until she leaves the Dojo. A rule that overrode her every frame would
   * make the board look broken.
   */
  _updateMathForDojo() {
    if (!this.device.touchPrimary || !this.world) return;
    /* AND NOT WHEN SHE HAS ANSWERED THE QUESTION HERSELF. This room turning
       the board on is the automatic answer being helpful; doing it over an
       explicit ON or OFF in Settings is the room overruling her, which is a
       setting that silently does nothing — the sixth non-negotiable. */
    if (this.settings.math !== 'auto') return;
    const dc = this.world.dojoCentre;
    const p = this.players[0];
    if (!p) return;
    const inside = inDojoView(p, dc);
    if (inside === this._mathWasInDojo) return;
    this._mathWasInDojo = inside;
    /* Silent: `_toggleMath` toasts, and a toast every time she crosses the Dojo
       boundary is noise about something she can already see happen. */
    this._applyMath(inside);
  }

  /**
   * "You can join this clan. Press this." Over each kitten's own head.
   *
   * THE BUG WAS SILENCE. Four adults played a whole session and nobody joined
   * a clan. Not because it is hard — you stand in the ring and press one
   * button — but because nothing ever said so. The shrine scene introduces the
   * leader and then the game goes quiet, and standing in a shrine ring with a
   * power one press away looks exactly like standing anywhere else.
   *
   * OVER HER HEAD, NOT IN THE CORNER. A toast is one line at the top of a
   * screen four people are sharing, addressed to whoever happens to look. This
   * is addressed to one kitten and drawn on her, which means it is right in
   * every pane at once: her own, and her sisters', who can now see what she is
   * standing on and go and find their own. The touch labels change too (see
   * `_updateTouchContext`), but only for player one, who is the only one
   * holding the screen.
   *
   * THE BUTTON IS NAMED PER DEVICE. `InputManager.promptFor` answers for the
   * device that slot is actually bound to this frame, so the girl on WASD is
   * told E, her sister on the arrows is told I, a sideways left Joy-Con is told
   * RIGHT and the right half is told A. A prompt that names the wrong button is
   * worse than none: she presses what it says, nothing happens, and the
   * conclusion is that the game is broken.
   *
   * THREE CONDITIONS, AND THE MIDDLE ONE IS THE INTERESTING ONE. She must be in
   * range, the leader must have introduced herself, and she must not already be
   * in this clan. The `met` test is the same gate the oath itself uses in
   * `Player.update` — asked here rather than copied, so the prompt cannot offer
   * something the button will refuse. Standing in a ring you have just walked
   * into shows nothing for two seconds while the scene fires, which is correct:
   * there is nothing to press yet.
   *
   * SILENT WHILE ANYTHING ELSE OWNS THE SCREEN. A scene, the tournament, or a
   * kitten on a dragon — `interact` means DIVE up there, and a caption telling
   * her to press it to swear an oath is the label lying again.
   */
  _updateClanPrompt() {
    const busy = this._sceneActive() || this.tournament?.active;
    for (const p of this.players) {
      if (!p) continue;
      if (busy || p.mount || p.rideAlong || p.pandaMount || p.angel
        || this.inspector?.busy(p.index)) { p.setCallout(null); continue; }
      /* PAYNE FIRST. She is in the market and no shrine is, so the two can
         never both be true — but if a future layout ever put her by one, the
         person standing in front of you is the thing the button reaches. */
      /* THE ARCADE FIRST. Its island is nowhere near Payne or a shrine, so
         this only ever answers on the pad, in a tube, or in the simulator,
         where nothing else in this function could have anything to say. */
      const dp = this.dream?.prompt(p, this.input.promptFor(p.index, 'interact'));
      if (dp) { p.setCallout(dp); continue; }
      if (this.dream?.realmOf(p) === 'sim') { p.setCallout(null); continue; }
      if (this.payne?.canTalk(p)) {
        const pk = this.input.promptFor(p.index, 'interact');
        p.setCallout(pk ? `[${pk}]  TALK TO PAYNE` : null);
        continue;
      }
      const hall = this.world?.clanHallNear(p.position.x, p.position.z);
      if (!hall || p.clan?.id === hall.clan.id) { p.setCallout(null); continue; }
      const key = this.input.promptFor(p.index, 'interact');
      /* NO BUTTON, NO PROMPT. A slot with nothing bound to it cannot be told
         what to press, and "press ? to swear" is worse than the silence this
         whole function exists to fix. */
      if (!key) { p.setCallout(null); continue; }
      /* AND BEFORE THE INTRODUCTION IT OFFERS THE INTRODUCTION.
         This used to go silent on `!met` — "standing in a ring you have just
         walked into shows nothing for two seconds while the scene fires,
         which is correct: there is nothing to press yet". There is now: the
         same button starts her scene (see the oath branch in
         `entities/player.js`), so the two seconds are hers to skip and the
         prompt has to say so or the door is invisible.
         HER NAME, NOT THE OATH. The oath is what the button does AFTERWARDS,
         and offering SWEAR TO ICEWHISKER for a press that plays a cutscene
         would be the label lying about what the button does — the exact
         failure the `met` test in here was added to prevent, facing the other
         way. */
      const leader = this.leaderFor(hall.clan);
      p.setCallout(leader?.met
        ? `[${key}]  ${hall.clan.oath.toUpperCase()}`
        : `[${key}]  MEET ${(leader?.spec?.name ?? hall.clan.name).toUpperCase()}`);
    }
  }

  /** The shrine whose ring this player is standing in, or null. */
  _shrineUnderfoot(p) {
    for (const sh of this.world?.shrines ?? []) {
      const d = Math.hypot(p.position.x - sh.position.x, p.position.z - sh.position.z);
      if (d < sh.radius) return sh;
    }
    return null;
  }

  /**
   * The GPU taking its context back, which on Android is what "the game
   * restarted when I switched apps" actually is.
   *
   * IT IS NOT A CRASH AND HTTPS DOES NOT FIX IT. Android reclaims the WebGL
   * context of a backgrounded tab whenever it wants the memory, and this game
   * holds well over a hundred megabytes of texture — exactly the kind of tab it
   * looks for. Being served over HTTPS changes nothing. Being INSTALLED as a PWA
   * helps, because an installed app is a worse eviction candidate than a browser
   * tab, but that is a reduced likelihood and not a guarantee.
   *
   * WITHOUT A HANDLER THE PAGE SIMPLY DIES. `preventDefault` on the loss event
   * is what tells the browser we intend to recover; without it, restoration is
   * never offered and the canvas stays blank until something reloads the page.
   * That silent reload is the bug as reported.
   *
   * WHAT THIS DOES NOT DO IS RESTORE THE GAME. Every texture in the scene is a
   * CanvasTexture built at boot from art that was decoded, keyed and repacked —
   * re-uploading all of it is a real piece of work, and doing it badly gives a
   * world with white boxes where the kittens were, which is worse than an honest
   * restart. So this SAYS what happened and offers the reload rather than
   * pretending to recover. Prefer a rule that degrades over one that vanishes.
   */
  _bindContextLoss() {
    this.canvas.addEventListener('webglcontextlost', (e) => {
      // Tells the browser we want a restore event. Without it there is no way back.
      e.preventDefault();
      this.renderer.setAnimationLoop(null);
      const el = document.getElementById('load-text');
      if (el) {
        el.innerHTML = 'The phone took the graphics back while you were away.'
          + '<br><b>Tap to start again.</b>';
      }
      const screen = document.getElementById('loading');
      screen?.classList.remove('hidden');
      screen?.addEventListener('pointerdown', () => window.location.reload(), { once: true });
      console.warn('[gfx] WebGL context lost — the OS reclaimed it');
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      /* Logged rather than acted on — see above. If this ever becomes a real
         restore path, this is where it starts. */
      console.warn('[gfx] WebGL context restored — a reload is still needed');
    });
  }

  /**
   * Five taps in the top-left corner opens the debug panel.
   *
   * A PHONE HAS NO BACKTICK KEY, so every debug tool in the game — the endgame
   * unlock, the scene viewer, ending a live round — was unreachable on the one
   * platform where they are most wanted, because it is the platform that cannot
   * be poked at from a console.
   *
   * FIVE TAPS RATHER THAN A BUTTON, in the corner the HUD leaves empty: this
   * must be impossible to reach by accident during play. It is the same gesture
   * Android itself uses for developer options, so it is a shape a grown-up
   * already knows and a nine-year-old will not stumble into.
   *
   * The run resets after a pause, so four stray taps spread over a minute never
   * add up to a fifth.
   */
  _bindDebugCorner() {
    const el = document.createElement('div');
    el.id = 'debug-corner';
    document.body.appendChild(el);
    let n = 0;
    let last = 0;
    el.addEventListener('pointerdown', () => {
      const now = performance.now();
      n = now - last > 600 ? 1 : n + 1;
      last = now;
      if (n < 5) return;
      n = 0;
      this._toggleDebugPanel();
      this.toast(this._debugOpen ? 'debug panel' : 'debug closed', 0);
    });
  }

  /**
   * Portrait on a touch device is unplayable, so say so.
   *
   * IT NAMES THE RIGHT ACTION FOR THE MACHINE IT IS ON, which is the whole
   * reason this is not two lines of static markup. In the desktop test mode the
   * gate still has to fire — otherwise the one thing it does could never be
   * checked before shipping it to a kid — but "turn your phone sideways" is
   * nonsense in front of somebody holding a mouse, and a prompt that names an
   * action you cannot take is the same failure as a refusal that says nothing.
   * On a desktop the fix is the window, so that is what it asks for.
   */
  _updateRotateGate() {
    const gate = document.getElementById('rotate-gate');
    if (!gate) return;
    const portrait = window.innerHeight > window.innerWidth;
    const show = !!this.device?.touchPrimary && portrait;
    gate.classList.toggle('hidden', !show);
    if (!show) return;

    const real = this.device.detected;
    gate.querySelector('.rg-main').textContent = real
      ? 'Turn your phone sideways'
      : 'Make this window wider';
    gate.querySelector('.rg-sub').textContent = real
      ? 'Katana Kitties needs a wide screen.'
      : 'Touch test mode — the game wants a landscape shape.';
    gate.classList.toggle('faux', !real);
  }

  /* ------------------------------- boot --------------------------------- */

  /**
   * The title screen — and, EXCEPT ON A PHONE, the world behind it.
   *
   * "On Mobile, seems the main menu is infront of the started game while the
   * game is idling on the main menu screen. Ideally, the game should not be
   * started and not in cache until the player presses the Play button and
   * gameplay is started. This way, when player returns to the Main Menu
   * again, then the game cache is reset and reloaded. The background should
   * be black behind the Main Menu instead of seeing the gameplay in the
   * background."
   *
   * WHAT HE SAW: the title art is letterboxed, and on a 2.16 phone the bars
   * either side of it are the fly-over (`_renderTitleIdle`) — the whole
   * archipelago built, lit and drawn every frame behind a menu, on the device
   * that can least afford it.
   *
   * SO ON A PHONE `boot` STOPS AT THE TITLE. Nothing is loaded, nothing is
   * built and nothing is drawn; `#title` is black (`body.touch-ui #title`).
   * The world is built by `_worldThen` the first time something needs it —
   * PLAY, or LOAD A SAVED GAME — behind the same loading screen a desktop
   * shows at boot. And going back to the main menu is a real page reload
   * (see `toTitle`), which is the only way to hand a phone its memory back:
   * a world "reset" in place is still a world held.
   *
   * A DESKTOP IS UNCHANGED, fly-over and all. The kids' title art over the
   * living world is the game's front door there, and nothing was reported.
   */
  async boot() {
    this._resize();
    this._applyQuality();
    if (!this._lazyWorld) await this._buildWorld();
    this._showTitle();
  }

  /** Loading screen down, title up, and the loop running. */
  _showTitle() {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('title').classList.remove('hidden');
    this.state = 'title';
    /* ...AND LOAD A SAVED GAME APPEARS ON IT, but only on a machine that has
       one. See `_refreshTitleLoad`. */
    this._refreshTitleLoad();
    this.renderer.setAnimationLoop(() => this._tick());
  }

  /**
   * Run `fn` with the world built — building it first, behind the loading
   * screen, if this is a phone that has not needed it yet.
   *
   * THE LOOP STOPS WHILE IT BUILDS. `_buildWorld` hands out frames to repaint
   * the loading text, and a tick landing in one of them would find a world
   * with islands and no kittens. Nothing on the title needs a frame while the
   * loading screen covers it.
   *
   * A SECOND PRESS WHILE IT BUILDS IS DROPPED, not queued: PLAY mashed four
   * times is one game, and the loading screen is over the button anyway.
   */
  _worldThen(fn) {
    if (this._worldReady) { fn(); return; }
    if (this._building) return;
    this._building = true;
    this.renderer.setAnimationLoop(null);
    document.getElementById('loading').classList.remove('hidden');
    this._buildWorld().then(() => {
      this._building = false;
      document.getElementById('loading').classList.add('hidden');
      this.clock.getDelta();   // the build's seconds are not a frame
      this.renderer.setAnimationLoop(() => this._tick());
      fn();
    }, (err) => {
      console.error(err);
      const el = document.getElementById('load-text');
      if (el) el.textContent = `Something broke: ${err.message}`;
    });
  }

  /** Every sprite, the world, and everybody in it. What `boot` used to be. */
  async _buildWorld() {
    const setLoad = (t) => {
      const el = document.getElementById('load-text');
      if (el) el.textContent = t;
    };

    setLoad('Waking the storm dragons…');
    /* The kitten sheets are a full 360-degree rotation across the columns and
       one animation pose per row. The column count is detected rather than
       assumed — see loadSpriteAtlas. */
    const [ember, frost, dragonTex, dragonFlyTex, pandaCub, pandaAdult] = await Promise.all([
      this._loadSprite('/sprites/kittens/ember/grid_v2.png', 'auto', 4,
        () => placeholderCatAtlas('#f2683c', '#c33a22', '#33408c')),
      /* frost/grid.png, NOT the v2 sheet. v2's four rows disagree with each
         other about which way the character turns — its jump and attack rows
         are drawn mirrored against its idle and walk rows — so no single
         mapping can be right for all of them. This older sheet is internally
         consistent: column 4 is a back view in every row. */
      this._loadSprite('/sprites/kittens/frost/grid.png', 'auto', 4,
        () => placeholderCatAtlas('#b9b6c4', '#7d7a8c', '#d86a9e')),
      this._loadSprite('/sprites/beasts/dragon_sheet.png', 1, 1,
        () => ({ texture: placeholderDragonTexture(), cols: 1, rows: 1, aspect: 1.9 })),
      this._loadSprite('/sprites/beasts/dragon_fly.png', 1, 1,
        () => ({ texture: placeholderDragonTexture(), cols: 1, rows: 1, aspect: 1.9 })),
      /* The two panda tiers. Single side-on cells like the dragon, not
         turnarounds — the billboard mirrors them and the heading is locked
         broadside, so one drawing per tier is all there is to read. */
      this._loadSprite('/sprites/beasts/panda_cub.png', 1, 1,
        () => ({ texture: placeholderPandaTexture(true), cols: 1, rows: 1, aspect: 1 })),
      this._loadSprite('/sprites/beasts/panda_adult.png', 1, 1,
        () => ({ texture: placeholderPandaTexture(false), cols: 1, rows: 1, aspect: 1 })),
    ]);
    this.pandaArt = { cub: pandaCub, adult: pandaAdult };

    setLoad('Waking the clan leaders…');
    /* The six chiefs and the storyteller. Front-facing single cells — one
       drawing each, never mirrored. A missing one falls back to the kitten
       placeholder rather than taking the whole boot down with it: a shrine
       with no leader is a smaller loss than a game that won't start. */
    const leaderNames = ['thunderpaw', 'riverclaw', 'shadowtail', 'windwhisker',
      'icewhisker', 'pandapaw', 'elder'];
    const leaderArt = await Promise.all(leaderNames.map((n) => this._loadSprite(
      `/sprites/leaders/${n}.png`, 1, 1,
      () => ({ texture: placeholderCatAtlas(), cols: 4, rows: 1, aspect: 1 }),
    )));
    this.leaderArt = Object.fromEntries(leaderNames.map((n, i) => [n, leaderArt[i]]));
    /* PAYNE, THE QUEST GIVER — two drawings, the helmet on (all afternoon) and
       the helmet under her arm (from the Awakening, the face reveal). A
       missing drawing leaves her out of the market rather than taking the boot
       down; her messages still work without her standing anywhere. */
    const [payneTown, payneHeld] = await Promise.all(['town', 'held'].map((n) => this._loadSprite(
      `/sprites/payne/${n}.png`, 1, 1, () => ({ texture: null }),
    )));
    this.payneArt = { town: payneTown?.texture?.image ? payneTown : null,
      held: payneHeld?.texture?.image ? payneHeld : null };
    /* LIONHEART — the Dream Dojo's arcade owner. Same degrade as Payne: no
       drawing, no man on the pad, and the tubes still work. */
    const lionTown = await this._loadSprite('/sprites/lionheart/town.png', 1, 1, () => ({ texture: null }));
    this.lionArt = lionTown?.texture?.image ? lionTown : null;
    this.dream = new DreamDojo(this);
    this.payne = new Payne(this);
    await this.payne.loadArt();

    setLoad('Raising the floating islands…');
    await frame();
    this.world = new World(this.scene);

    setLoad('Painting the unit circle…');
    await frame();
    this.dojo = new MathDojo(this.scene, this.world.dojoCentre, {
      compact: this.device.touchPrimary,
    });
    this.mathBoard = document.getElementById('math-board');
    this.mathBoard.appendChild(this.dojo.boardCanvas);

    setLoad('Sharpening claws…');
    await frame();
    this._spawnPlayers(ember, frost);
    this._spawnDragons(dragonTex, dragonFlyTex);
    /* KEPT FOR THE ENDING, and for nothing else. `FinaleShow` draws two little
       dragons carrying two little kittens between the islands on the Dojo
       floor, and the only honest source for what a dragon looks like is the
       sheet the real ones are drawn from. */
    this.dragonArt = dragonTex ?? null;
    this._spawnPickups();
    this._spawnLeaders();
    this._spawnPayne();
    this.dream.build(this.lionArt);

    setLoad('Writing the story…');
    await frame();
    this.cutscene = new Cutscene({
      scene: this.scene,
      world: this.world,
      audio: this.audio,
      leaders: this.leaders,
      elderArt: this.leaderArt.elder,
    });
    // Fits each beat to the length of its recorded line — see loadVoices.
    await this.cutscene.loadVoices();

    /* The shrine scenes: each leader introducing herself, once, before her
       clan can be joined. Same preload discipline as the intro — the clips are
       buffered here at boot, not fetched at the moment she opens her mouth. */
    this.shrineScene = new ShrineScene({ world: this.world, audio: this.audio });
    await this.shrineScene.load(this.leaders);
    /* The Dream Dojo's three scenes — Payne's tour and Lionheart's two talks
       (systems/dream/storyscene.js). Its clips are buffered when a scene is
       first asked for, not here: two of the three are earned, and most
       afternoons will never play them. */
    this.storyScene = new StoryScene(this);

    /* The walk out of the arena's front door, and its stretcher-bearers. The
       bearers fall back to a drawn placeholder rather than to nothing: a
       stretcher carried by nobody is a stranger picture than one carried by
       two blobs. See systems/arenaexit.js. */
    this.arenaExit = new ArenaExit({ world: this.world, audio: this.audio });
    /* TEN VIEWS, SAID, NOT 'auto'. The ten cats stand 6-35px apart on the
       baked sheet, and at the loader's working scale the narrow gaps close:
       'auto' found six columns and sliced cats in half. Measured off the
       alpha — see docs/notes/art.md. */
    this.arenaExit.catArt = await this._loadSprite('/sprites/hospital/cat.png', 10, 2,
      () => placeholderCatAtlas('#f4f1ea', '#c9c4bb', '#8fb6e0'));

    /* The dragon hunt: seven stars, one per island, and the animal they call.
       The art is loaded here rather than with the other sprites because a
       missing Ryuuseki must not take the boot down — the hunt simply has no
       payoff, which is a far smaller loss than a game that won't start. */
    setLoad('Scattering the seven stars…');
    await frame();
    /* Built with the world, not after it — see the World constructor. The
       locks register keepClear, and those have to exist before anything is
       scattered on the ground. */
    this.balls = this.world.dragonBalls;
    this.ballsHeld = 0;
    this.ryu = null;
    this.ryuArt = await loadSpriteAtlas('/sprites/beasts/ryuuseki.png',
      { views: 1, rows: 1, clearPockets: true, maxAtlas: this.device.atlasMax })
      .catch(() => null);
    this.summonScene = new SummonScene({
      scene: this.scene, world: this.world, audio: this.audio,
    });
    await this.summonScene.load();
    /* Bigger than any storm dragon's because he IS bigger — a mount radius
       scaled to a 13-unit animal is unreachable on a 26-unit one, since the
       drawn creature extends well past the point you have to stand at. */
    this.ryuMountRadius = 16;

    /* --- the tournament ---
       Loaded after the dragon hunt because it is gated behind it. Both new
       sheets fall back the same way every other one does: a missing griffin
       or a missing champion costs the tournament, not the boot. */
    setLoad('Building the arena…');
    await frame();
    const [satanArt, griffinArt, satanChargeArt] = await Promise.all([
      loadSpriteAtlas('/sprites/satan/satan.png',
        { views: 1, rows: 1, clearPockets: true, maxAtlas: this.device.atlasMax })
        .catch(() => null),
      loadSpriteAtlas('/sprites/beasts/griffin.png',
        { views: 1, rows: 1, clearPockets: true, maxAtlas: this.device.atlasMax })
        .catch(() => null),
      /* His arms-up pose, for the one second before he detonates. Loaded with
         the same options as his idle sheet — the two are measured against each
         other (see `MrSatan.setChargeArt`), and a different `clearPockets` or
         `maxAtlas` between them would mean comparing two numbers taken with
         two different rulers. Missing costs the pose and nothing else. */
      loadSpriteAtlas('/sprites/satan/charge.png',
        { views: 1, rows: 1, clearPockets: true, maxAtlas: this.device.atlasMax })
        .catch(() => null),
    ]);

    /* `touch` IS A GETTER, not a value: the card reads it per line, and the
       on-screen-stick setting can change what this device is mid-game. */
    this.announcer = new Announcer({ audio: this.audio, touch: () => !!this.device?.touchPrimary });
    this.announcer.art = satanArt;
    /* PATCHFUR SHARES HIS CARD. She counts the last five pieces of mischief
       down over it — see `systems/lasthunt.js`, and the note at the top of
       `announce.js` for why one card with a speaker per line rather than two
       cards. She is built here, with him, because the thing she needs is this
       announcer and her portrait, and both exist by this line. */
    this.lastHunt = new LastHunt({
      announcer: this.announcer,
      art: this.leaderArt?.elder ?? null,
    });
    /* Every line he says outside a full-screen scene, buffered at boot. These
       fire mid-play with nothing waiting on them, so a clip fetched at the
       moment he opens his mouth arrives over a game that has moved on. */
    await this.announcer.load({
      ...Object.fromEntries(MILESTONES.map((m) => [m.id, voicePath(m.id)])),
      /* HER LINES, IN HIS BUFFER. Same card, same queue, so the same map of
         preloaded clips — and the same reason for preloading them: these fire
         the instant a barrel goes over, with nothing waiting on them, so a
         clip fetched at the moment she opens her mouth arrives over a hunt
         that has already found the next one. Ids come from `HUNT_LINES` so
         the list cannot drift from the lines it is buffering. */
      ...Object.fromEntries(Object.keys(HUNT_LINES).map((id) => [id, voicePath(id)])),
      sat_board: voicePath('sat_board'),
      /* PAYNE'S, IN THE SAME BUFFER. Her card is her own, but her voice is
         the one voice this game has — `Audio.speak` — and a hint fetched at
         the moment she opens her mouth is two minutes of waiting spoiled by a
         second of silence. Ids from `PAYNE_LINES`, so the list cannot drift. */
      ...PAYNE_CLIPS,
      /* His yes AT HIS DOORS, where there is no griffin to climb on. Recorded
         in Harrison's preset on the exact card string; it played silent as a
         card for a pass, which is what the check beside `popIn` now forbids. */
      sat_doors: voicePath('sat_doors'),
      /* The exit parade's two, PLAYED rather than said: they are in his own
         bubble over the procession, not on the card (`ArenaExit.update`). */
      sat_parade1: voicePath('sat_parade1'),
      sat_parade2: voicePath('sat_parade2'),
      sat_r1: voicePath('sat_r1'),
      sat_r2: voicePath('sat_r2'),
      /* THE ROLL CALL'S PIECES — "Storm! VERSUS! Blossom!" — for every match
         `sat_r1` is not true of. Ids from `ROLL_WORDS`, so the list cannot
         drift from the card it is said on. See `rollCall`. */
      ...Object.fromEntries(Object.keys(ROLL_WORDS).map((id) => [id, voicePath(id)])),
      sat_r3: voicePath('sat_r3'),
      sat_fight: voicePath('sat_fight'),
      sat_feast: voicePath('sat_feast'),
      sat_ko: voicePath('sat_ko'),
      /* THE OTHER WAY A ROUND ENDS. `sat_ko` is "DOWN!", which is a claim
         about somebody's body and is only true when a side was actually wiped
         out; the clock running out leaves both fighters standing. See
         `Tournament._roundOver`. */
      sat_over: voicePath('sat_over'),
      /* THE CLOCK, IN FOUR CUES AND NOT ONE CLIP. Thirty, fifteen, ten, and
         then the count — which is the odd one out twice over: it is the only
         thing in this list PLAYED rather than said (no card; the number it is
         counting is already on the screen) and the only one where arriving
         late means arriving WRONG, because each number inside it is nailed to
         the second it names. `sat_zero` is the shout the round ends on.
         All four are cut by tools/capture/satan-countdown.mjs. */
      sat_t30: voicePath('sat_t30'),
      sat_last1: voicePath('sat_last1'),
      sat_last2: voicePath('sat_last2'),
      sat_count: voicePath('sat_count'),
      sat_zero: voicePath('sat_zero'),
      sat_draw: voicePath('sat_draw'),
      sat_win1: voicePath('sat_win1'),
      sat_win2: voicePath('sat_win2'),
      /* His tantrum, both halves. Buffered here with the rest and not lazily,
         for the reason `load` gives at length: these fire mid-play with
         nothing waiting on them, and the second one is the cue for an
         explosion one second later — a clip that arrives late arrives after
         the bang it was supposed to announce. */
      sat_taunt: voicePath('sat_taunt'),
      sat_blast: voicePath('sat_blast'),
    });

    if (satanArt) {
      const sg = this.world.heightAt(SATAN_TOWN.x, SATAN_TOWN.z);
      const spot = this.world.findOpenSpot(SATAN_TOWN.x, SATAN_TOWN.z, 4)
        ?? { x: SATAN_TOWN.x, z: SATAN_TOWN.z };
      const g2 = this.world.heightAt(spot.x, spot.z) ?? sg;
      this.satan = new MrSatan(satanArt, { x: spot.x, y: g2 ? g2.y : 4, z: spot.z });
      this.satan.art = satanArt;
      /* Unconditional — `setChargeArt` takes null and does nothing with it, so
         there is no second place that has to remember whether the drawing
         exists. See it for why the two sheets are measured against each other
         rather than each sized on its own. */
      this.satan.setChargeArt(satanChargeArt);
      /* AND KEPT, because the ENDING wants it too and the ending happens long
         after this closure has gone. It is his arms-up pose, and the last shot
         of the game is him throwing them up on the word "open" — see
         `FinaleShow._stepArena`. Held on the game rather than dug back out of
         `this.satan`, so a champion who never loaded costs the gesture and not
         the lookup. */
      this.satanChargeArt = satanChargeArt;
      /* Remembered, because he MOVES: he stands in the town to invite them
         and in his box at the arena to call the rounds, and `reset` has to be
         able to put him back without recomputing a spot that depends on a
         world search. */
      this.satan.homeAt = { x: spot.x, y: g2 ? g2.y : 4, z: spot.z };
      this.satan.group.visible = false;
      this.scene.add(this.satan.group);
      /* HE IS SOLID, LIKE A CLAN LEADER — you cannot stand inside him. But he
         is not a clan leader in the two ways that matter to a collider, and
         this line got both of them wrong for as long as it existed: a leader
         is ALWAYS on his dais, and Mr. Satan is invisible until the arena is
         announced and then WALKS — town square, announcer's box, back again.
         Pushed as a bare literal, the cylinder stayed at the coordinates he
         happened to be standing on at boot, so the town square had an
         invisible man in it from the first frame of the game (reported from
         play: "his collider is still there and players can run into it") and
         a second one after he left for the arena.
         Kept as a REFERENCE and re-pointed every frame by `_syncSatanSolid`,
         which is the only place either fact is read. */
      this.satanSolid = { x: spot.x, z: spot.z, r: 0.95, off: true };
      this.world.solids.push(this.satanSolid);
    }

    if (griffinArt) {
      this.griffin = new Griffin(griffinArt);
      this.scene.add(this.griffin.group);
    }

    /* --- the ring's wildlife, and the wings you get when you lose a round ---

       EIGHT SINGLE-CELL SHEETS, NOT ONE GRID, and that is the same call every
       animal in this project has made. A multi-cell sheet has to be measured by
       connected-component labelling and the count has to come back right; that
       machinery exists for the kitten turnarounds because they genuinely need
       ten directions, and one of the two kitten sheets in this project is
       already unusable because a generated grid disagreed with itself. A rat is
       one drawing. Two drawings, counting the startled one. There is nothing to
       measure and therefore nothing to get wrong.

       `maxAtlas: 768` IS DELIBERATE AND IT IS NOT THE DEFAULT. `cell` is a
       floor and the real size is derived from the source, so a 2048 sheet packs
       into a 2048 atlas — 16MB of texture for an animal drawn 0.9 units tall
       next to a 2.9-unit kitten. The dragons needed that headroom because you
       ride one and it fills a third of the screen. A rat never will.

       `facesRight` is per FILE. Six came back drawn facing left as the prompt
       asked and the startled rabbit came back facing right; see Critter. */
    setLoad('Letting the rats in…');
    await frame();
    const CRITTER_ART = [
      ['rat', 'critters/rat.png', false],
      ['rat_shock', 'critters/rat_shock.png', false],
      /* TWO RABBIT BODIES: one scampering along the floor and one mid-leap.
         It shipped with only the leap, so the animal was frozen in a jumping
         pose while running along the ground — which reads as a broken sprite
         rather than as a rabbit, and it also threw away the one visual cue
         that says whether it can be pinned right now. */
      ['rabbit_run', 'critters/rabbit_run.png', false],
      ['rabbit_air', 'critters/rabbit.png', false],
      ['rabbit_shock', 'critters/rabbit_shock.png', true],
      ['bird', 'critters/bird.png', false],
      ['bird_shock', 'critters/bird_shock.png', false],
      ['angel_wings', 'fx/angel_wings.png', false],
      /* The kittens' own crouched eating pose. Loaded here rather than with
         the turnaround sheets because it is the same KIND of thing as the rest
         of this block — a single front-facing cell that never mirrors — and
         because a missing one costs the pose and nothing else. */
      ['ember_eat', 'kittens/ember/eat.png', false],
      ['frost_eat', 'kittens/frost/eat.png', false],
      /* THE RECEIVING POSE — both paws to the sky, taking the thing above her
         head. Worn for a dragon ball and for a first clan oath, which are the
         same moment twice: see `Player.setBlessArt`.
         TWO FILES FOR FOUR KITTENS, exactly like the eating pose. Storm draws
         from Ember's sheet and Blossom from Frost's, and both go through
         `recolourAtlas` below — so "generate a new player sprite" is two
         drawings and four cats, and the two recolours cannot be forgotten
         because nothing has to remember them. */
      ['ember_bless', 'kittens/ember/bless.png', false],
      ['frost_bless', 'kittens/frost/bless.png', false],
      /* THE CONCENTRATING POSE — two fingers to her forehead, eyes shut, the
         beat before a 瞬 Flash Step takes her. Two files and four kittens
         again; the recolour loop below is what makes that true, and it is why
         "generate a new player sprite" is two drawings rather than four. */
      ['ember_warp', 'kittens/ember/warp.png', false],
      ['frost_warp', 'kittens/frost/warp.png', false],
      /* THE REAR-BACK — head thrown up, mouth open, cheeks full of air, with
         the intake drawn around her. It is the second and a half between 息
         Dragon Breath's press and its flame, and it exists because that pause
         is the other kitten's whole warning: "we need more indicators that the
         attack is happening". A pose is the indicator that survives her being
         behind a market stall, which none of the effects in `systems/clanfx.js`
         do. Two files and four kittens, the same as the two above. */
      ['ember_inhale', 'kittens/ember/inhale.png', false],
      ['frost_inhale', 'kittens/frost/inhale.png', false],
      /* THE FRIGHT — looking straight up, eyes wide, mouth open, fur on end,
         both paws thrown up beside her head. Drawn for the ending's earthquake
         ("stop and do a new 'shocked' or 'scared' sprite animation where they
         are looking up with their arms in the air"), which borrowed the
         blessing pose until it existed, and loaded here with the other single
         poses because "these may be useful later for when we need a scared
         pose for future abilities or cutscenes". Two files, four kittens. The
         first sheets generated with real alpha rather than keyed off white. */
      ['ember_scared', 'kittens/ember/scared.png', false],
      ['frost_scared', 'kittens/frost/scared.png', false],
      /* THE GOBLIN SWEEP — crouched, a leg out, the swoosh round her ankles,
         worn for the spin of the trick Payne teaches. "generate a 'sweep trip'
         image/animation for the players ... and have that play when the player
         does the sweep ability". Two files, four kittens, like every pose
         above; generated on magenta and keyed by `sprite-bake`. */
      ['ember_sweep', 'kittens/ember/sweep.png', false],
      ['frost_sweep', 'kittens/frost/sweep.png', false],
      /* 返 RIPOSTE'S STANCE — planted wide, the katana level across her,
         worn while her guard is up. "the player will go into a 'charging'
         stance with their katana and if they are attacked while in the
         stance, then they will do the counter attack". */
      ['ember_riposte', 'kittens/ember/riposte.png', false],
      ['frost_riposte', 'kittens/frost/riposte.png', false],
      /* THE CONJURED INSECT. Loaded with the other animals because it is one,
         and kept out of the ordinary lottery by a flag on its spec rather than
         by anything here — see `Menagerie.species`. No `_shock` sheet: a
         stunned mantis falls back to its calm drawing, exactly as the rat and
         the bird do when theirs is missing. */
      /* `fillHoles` BECAUSE ITS EYES ARRIVED PUNCHED OUT: "the mantis.png seems
         to have transparency in its eyes when it should be white." Whatever
         removed its background took the eyes with them, and the file has been
         that way on disk ever since — nothing in this codebase did it and
         nothing here could undo it without being asked. The fill is bounded by
         depth, so the 57-pixel eye 36 pixels in gets painted and the 1148-pixel
         gap between its back legs, 15 pixels in, does not. See
         `fillSealedHoles`. It is the only sheet in the game that needs it. */
      ['mantis', 'critters/mantis.png', false, { fillHoles: true }],
    ];
    const critterArt = {};
    await Promise.all(CRITTER_ART.map(async ([key, file, facesRight, extra]) => {
      /* NO `clearPockets` ON ANY OF THESE, and the startled sheets are exactly
         why. Every one of them is drawn with big white cartoon eyes sealed
         inside the lineart — which is the shape `clearSealedPockets` was built
         to remove, and the shape it wrongly removed from Mr Satan's face until
         the depth test was added. The rule is safe now, but these sheets have
         no sealed background to clear in the first place, so switching it on
         would be risk with no upside. */
      /* NO DEVICE ATLAS BUDGET ON THESE FOUR NUMBERS, and that is deliberate
         rather than an oversight. `world-check` measures the real sheets at
         exactly `cell: 256, maxAtlas: 768` to assert the rabbit you chase is
         still exactly `size` tall — the options are shared with the loader so
         only the numbers are repeated, not the arithmetic. Budgeting them would
         move an assertion rather than save a pixel: at 768 these sheets are
         already smaller than the reduced ceiling. */
      const a = await loadSpriteAtlas(`/sprites/${file}`, {
        views: 1, rows: 1, cell: 256, maxAtlas: 768, ...extra,
      }).catch(() => null);
      if (a) critterArt[key] = { ...a, facesRight };
    }));
    /* Logged like every other sheet, because "drop a new PNG in and refresh"
       is only a workflow if the game says what it found. */
    console.log(`[art] critters → ${Object.keys(critterArt).length}/${CRITTER_ART.length} sheets`);

    /* A species with no art simply never spawns (see Menagerie.species), and a
       missing wings sheet costs the wings and not the angel — the halo, the
       glow and the flight are all geometry and code. Same rule as everywhere
       else here: a lost PNG must degrade, never take the boot down. */
    /* `calm` is the only required pose; `shock` and `air` fall back to it.
       That is what lets a rat have no air pose (it never leaves the ground)
       and a bird have no ground pose (it never touches it) without either
       becoming a special case in `Critter`. */
    this.critterArt = {
      rat: critterArt.rat && { calm: critterArt.rat, shock: critterArt.rat_shock ?? critterArt.rat },
      rabbit: critterArt.rabbit_run && {
        calm: critterArt.rabbit_run,
        air: critterArt.rabbit_air ?? critterArt.rabbit_run,
        shock: critterArt.rabbit_shock ?? critterArt.rabbit_run,
      },
      bird: critterArt.bird && { calm: critterArt.bird, shock: critterArt.bird_shock ?? critterArt.bird },
      /* NO ART, NO MANTIS, AND NOTHING ELSE CHANGES. `Menagerie.rareSpecies`
         filters on exactly this, so a build with no `mantis.png` runs the whole
         Flash Step feature — the vanish, the smoke, the decoy, the reticle —
         and simply never produces the animal. Ninth non-negotiable. */
      mantis: critterArt.mantis && { calm: critterArt.mantis, shock: critterArt.mantis },
    };
    this.critterArt.wings = critterArt.angel_wings;

    /* THE EATING POSE IS PER STYLE, RECOLOURED, AND IT USED TO BE PER SLOT.
       `p.index === 0 ? ember_eat : frost_eat` is the same mistake `palette.js`
       already has a heading about — A SLOT IS NOT A STYLE — and here it was
       wrong twice over. Storm is drawn from Ember's sheet in slot 2, so she ate
       as a GREY FROST; Blossom got Frost's sheet with none of her violet. And
       because the eat sheet is a separate single-cell file rather than a row on
       the turnaround, it never went through `recolourAtlas` with the rest of
       her, so even the right sheet would have been the wrong colour.

       Derived once, here, for the same reason the turnarounds are: a canvas
       pass per style is nothing at boot and is not something to do on the frame
       a third player presses START. Ember and Frost share the loaded atlas
       outright rather than copying it, so their pose is byte-for-byte what it
       always was. */
    this.eatArt = PLAYER_STYLE.map((s) => {
      const base = s.sheet === 'ember' ? critterArt.ember_eat : critterArt.frost_eat;
      if (!base) return null;
      if (!s.recolour) return base;
      const a = recolourAtlas(base, s.recolour);
      console.log(`[art] ${s.name} eat pose ← ${s.sheet}_eat recoloured`);
      return a;
    });
    /* THE SAME DERIVATION, BY STYLE AND NOT BY SLOT. The comment above is the
       argument in full; it is repeated as a loop rather than as prose because
       the failure it describes — Storm eating as a grey Frost — is one line of
       copy-paste away from happening again to any pose added after it. */
    this.blessArt = PLAYER_STYLE.map((s) => {
      const base = s.sheet === 'ember' ? critterArt.ember_bless : critterArt.frost_bless;
      if (!base) return null;
      if (!s.recolour) return base;
      const a = recolourAtlas(base, s.recolour);
      console.log(`[art] ${s.name} blessing pose ← ${s.sheet}_bless recoloured`);
      return a;
    });
    /* THE SAME DERIVATION A THIRD TIME. Written out rather than folded into a
       helper because the failure it guards against is copy-paste, and a helper
       with a `sheet` argument is exactly the shape somebody copies wrong: the
       three loops are identical on purpose, so a fourth pose is an obvious
       addition and a fourth pose keyed by SLOT instead of by STYLE stands out
       as different from its three neighbours. */
    this.warpArt = PLAYER_STYLE.map((s) => {
      const base = s.sheet === 'ember' ? critterArt.ember_warp : critterArt.frost_warp;
      if (!base) return null;
      if (!s.recolour) return base;
      const a = recolourAtlas(base, s.recolour);
      console.log(`[art] ${s.name} flash-step pose ← ${s.sheet}_warp recoloured`);
      return a;
    });
    /* AND A FOURTH TIME, FOR THE REAR-BACK. Same shape, same reason, same
       warning: by STYLE and never by slot. */
    this.breathArt = PLAYER_STYLE.map((s) => {
      const base = s.sheet === 'ember' ? critterArt.ember_inhale : critterArt.frost_inhale;
      if (!base) return null;
      if (!s.recolour) return base;
      const a = recolourAtlas(base, s.recolour);
      console.log(`[art] ${s.name} dragon-breath pose ← ${s.sheet}_inhale recoloured`);
      return a;
    });
    /* AND A FIFTH, FOR THE FRIGHT. By STYLE, never by slot. */
    this.scaredArt = PLAYER_STYLE.map((s) => {
      const base = s.sheet === 'ember' ? critterArt.ember_scared : critterArt.frost_scared;
      if (!base) return null;
      if (!s.recolour) return base;
      const a = recolourAtlas(base, s.recolour);
      console.log(`[art] ${s.name} scared pose ← ${s.sheet}_scared recoloured`);
      return a;
    });
    /* AND A SIXTH, FOR THE GOBLIN SWEEP. By STYLE, never by slot. */
    this.sweepArt = PLAYER_STYLE.map((s) => {
      const base = s.sheet === 'ember' ? critterArt.ember_sweep : critterArt.frost_sweep;
      if (!base) return null;
      if (!s.recolour) return base;
      const a = recolourAtlas(base, s.recolour);
      console.log(`[art] ${s.name} sweep pose ← ${s.sheet}_sweep recoloured`);
      return a;
    });
    /* AND A SEVENTH, FOR 返 RIPOSTE'S GUARD. By STYLE, never by slot. */
    this.riposteArt = PLAYER_STYLE.map((s) => {
      const base = s.sheet === 'ember' ? critterArt.ember_riposte : critterArt.frost_riposte;
      if (!base) return null;
      if (!s.recolour) return base;
      const a = recolourAtlas(base, s.recolour);
      console.log(`[art] ${s.name} riposte pose ← ${s.sheet}_riposte recoloured`);
      return a;
    });

    /* --- one emblem per clan, shown over her head when she swears ---
       A MISSING SHEET COSTS A PICTURE AND NOTHING ELSE. `holdAloft(null)`
       already draws a sphere and `_celebrateClan` tints it in the clan's own
       colour, so an absent file leaves a Thunderpaw kitten holding a gold orb
       rather than nothing at all. Ninth non-negotiable, same rule as the
       voices and the trailer.
       Loaded with the critters rather than with the leaders because they are
       the same KIND of thing — one square cell, no rows, no facing to get
       wrong — and the leaders' loader measures turnarounds. */
    this.clanArt = {};
    await Promise.all(CLANS.map(async (c) => {
      const a = await loadSpriteAtlas(`/sprites/clans/${c.id}.png`, {
        views: 1, rows: 1, cell: 256, maxAtlas: 768,
      }).catch(() => null);
      if (a) this.clanArt[c.id] = a;
    }));
    console.log(`[art] clan emblems → ${Object.keys(this.clanArt).length}/${CLANS.length}`);

    for (const p of this.players) this._dressPlayer(p);

    this.menagerie = new Menagerie({
      game: this, world: this.world, art: this.critterArt,
    });

    this.tournament = new Tournament({
      game: this, world: this.world, audio: this.audio, announcer: this.announcer,
    });
    this.quest = new ArenaQuest({
      game: this, world: this.world, satan: this.satan, announcer: this.announcer,
    });
    /* Mr Satan's tantrum. Built beside the quest because it is the same shape
       of thing — a little state machine that owns him for a few seconds — and
       because the quest is what puts him in his box for it to trigger from. */
    this.satanBlast = new SatanBlast({
      game: this, world: this.world, satan: this.satan, announcer: this.announcer,
    });
    this.scene.add(this.satanBlast.fx);
    /* The big screen on the arena's west wall: the record board as a thing in
       the world, cycling every league's champion, Mr. Satan's made-up records
       and his adverts. Inert (hidden, no fireworks) while the arena is shut. */
    this.arenaBoard = new ArenaBoard({ world: this.world, scene: this.scene, audio: this.audio });
    /* The Powerup Kotodama, and the screen the girls swap them on. Both are
       built at boot and inert until 100% mischief — `Kotodama.awakened` is the
       one flag that says whether any of it exists, and the update loop, the
       minimap and the stall prompt all read that rather than each keeping
       their own idea of whether the endgame has started. */
    this.kotodama = new Kotodama(this);
    this.world.onSnakeBuilt = () => this._clearRoads();
    /* The quests — the other ways to earn a Powerup Kotodama. After the
       Kotodama, because every quest is paid through `kotodama.give`. */
    this.feats = new Feats(this);
    this.profile = new ProfileScreen(this);
    /* The personal, pane-sized half of the dealer. Built after the profile
       screen because choosing TRADE hands straight over to it. */
    this.inspector = new Inspector(this);
    /** 'out' | 'home' while the griffin is carrying them, else null. */
    this.travel = null;

    /* One map per seated kitten. `maps[0]` doubles as the SHARED map when the
       view is merged — it just drops its focus and centres on the party, which
       is what the single map has always done. Each keeps its own zoom so two
       players can be looking at different scales. */
    this.maps = [];
    this._buildHud();
    // Show the real target from the start — it read "0 / 0" until the first
    // prop was knocked over, which makes the whole scoreboard look broken.
    document.getElementById('mtotal').textContent = `0 / ${this.world.mischiefTotal}`;

    this._resize();
    /* AGAIN, NOW THERE IS A SUN: the call in `boot` ran before the world
       existed on a phone, so the shadow map was never sized. */
    this._applyQuality();
    this._worldReady = true;
  }

  async _loadSprite(url, views, rows, fallback) {
    try {
      /* `cell` IS FIXED AT 384 ON EVERY DEVICE and only `maxAtlas` moves. Not
         because `cell` would resize anybody — `contentScale` is packing-
         invariant, so it would not — but because the two kitten sheets are
         floor-pinned at this cell and therefore repack byte-for-byte unchanged,
         and the sprite-direction checks measure real cells out of them. A
         reduced `maxAtlas` cannot reach a floor-pinned sheet, which is what
         makes it the safe knob. See core/device.js; the checks are in
         world-check under "THE DEVICE ATLAS BUDGET". */
      const a = await loadSpriteAtlas(url, {
        views, rows, cell: 384, maxAtlas: this.device.atlasMax,
      });
      if (a.cols < 1) throw new Error('no views found');
      if (rows > 1 && a.rows !== rows) {
        throw new Error(`found ${a.rows}/${rows} animation rows`);
      }
      if (views !== 'auto' && a.cols < views) {
        throw new Error(`only found ${a.cols}/${views} views`);
      }
      console.log(`[art] ${url} → ${a.cols} directions x ${a.rows} poses`);
      return a;
    } catch (err) {
      console.warn(`[art] ${url} → falling back to drawn placeholder:`, err.message);
      const f = fallback();
      return f.texture ? f : { texture: f, cols: 4, rows: 1, aspect: 0.6 };
    }
  }

  /**
   * Load the two drawn sheets, derive the recoloured ones, and seat the party.
   *
   * THE RECOLOURS ARE DERIVED ONCE, HERE. `recolourAtlas` is a full pass over a
   * 2048-square canvas, which is nothing at boot and is not something to do on
   * the frame a third player presses START to join — so every kitten in
   * `PLAYER_STYLE` gets her atlas built now whether or not anybody is playing
   * her. Two extra canvases is a cheap price for a join that cannot stutter.
   */
  _spawnPlayers(ember, frost) {
    /* Height and direction sense are facts about the SHEET, not about the
       player, so a recolour inherits them by naming its source rather than
       repeating them. Both live sheets are internally consistent — every row
       turns the same way, increasing column toward screen-right — so both take
       dirSense 1 and neither needs a per-row override. Measured off the art,
       not guessed; the probe is in HANDOFF.md.

       If one ever looks wrong in play, flip it live from the console rather
       than guessing here:  game.setRowSense(1, 0, -1)   // Frost, idle row */
    this.sheets = {
      ember: { art: ember, height: 2.9, dirSense: 1 },
      frost: { art: frost, height: 2.85, dirSense: 1 },
    };

    /* One atlas per roster entry. A null recolour shares the loaded atlas
       object outright rather than copying it — Ember and Frost must come out
       byte-for-byte the sheet that was loaded, and the cheapest way to
       guarantee that is not to touch them. */
    this.kittenArt = PLAYER_STYLE.map((s) => {
      const base = this.sheets[s.sheet].art;
      if (!s.recolour) return base;
      const a = recolourAtlas(base, s.recolour);
      console.log(`[art] ${s.name} ← ${s.sheet} recoloured `
        + `${JSON.stringify(s.recolour)}`);
      return a;
    });

    /** Which kitten each slot is playing. Slot n starts as style n, but the
     *  character picker breaks that: a third player choosing Blossom gives
     *  `[0, 1, 3]` and leaves Storm unplayed. */
    this.roster = [];
    this.players = [];
    for (let i = 0; i < this.partySize; i++) this._seatPlayer(i);
  }

  /**
   * THE SIMULATOR'S DRAWINGS: every kitten in the arcade's headset, and his
   * Shadow's four fighting poses. Loaded ONCE, on the first walk to a tube
   * (`DreamDojo._begin`), never at boot — about six megabytes that an
   * afternoon which never goes near the arcade has no reason to download.
   *
   * The recolours are derived here for the same reason `_spawnPlayers`
   * derives the home ones up front: so a kitten who joins later, or is
   * swapped in by the picker, is handed a finished atlas by `_seatPlayer`
   * rather than costing a 2048-square pass on the frame she arrives.
   *
   * EVERYTHING DEGRADES. A missing sheet leaves that kitten in her home
   * drawing (`Player.setSimArt` refuses it) and a missing Shadow sheet leaves
   * him tinted out of Lionheart's own town drawing, which is how he shipped.
   * The views are measured, as everywhere: the kittens' column counts are
   * auto-detected, and the Shadow is asked for exactly four, because 'auto'
   * reads his sheet as TWO — his headband tails and the X of light reach far
   * enough across the gaps that the 12% threshold merges neighbours.
   */
  loadSimArt() {
    if (this._simArtLoad) return this._simArtLoad;
    const none = () => ({ texture: null });
    const real = (a) => (a?.texture?.image ? a : null);
    this._simArtLoad = Promise.all([
      this._loadSprite('/sprites/kittens/ember/vr.png', 'auto', 4, none),
      this._loadSprite('/sprites/kittens/frost/vr.png', 'auto', 4, none),
      this._loadSprite('/sprites/lionheart/shadow.png', 4, 1, none),
    ]).then(([ember, frost, shadow]) => {
      const base = { ember: real(ember), frost: real(frost) };
      this.simArt = PLAYER_STYLE.map((s) => {
        const b = base[s.sheet];
        return b && s.recolour ? recolourAtlas(b, s.recolour) : b;
      });
      this.shadowArt = real(shadow);
      this.players.forEach((p, i) => p?.setSimArt(this.simArt[this.roster[i]] ?? null));
      return this._loadSimPoses().then(() => this.simArt);
    });
    return this._simArtLoad;
  }

  /**
   * THE SIX SPECIAL POSES IN THE HEADSET — `kittens/<sheet>/vr_<pose>.png`,
   * loaded exactly as the home ones are (one cell, `cell: 256, maxAtlas: 768`)
   * and recoloured BY STYLE, never by slot, like every pose in `_loadArt`.
   * Behind the turnaround, so a kitten connecting is never kept waiting for a
   * Goblin Sweep she may never do in there. A missing file costs that one pose
   * its headset and nothing else (`Player.setSimLook` keeps her home drawing).
   */
  _loadSimPoses() {
    const FILES = ['eat', 'bless', 'warp', 'inhale', 'scared', 'sweep', 'riposte'];
    const load = (sheet, f) => loadSpriteAtlas(`/sprites/kittens/${sheet}/vr_${f}.png`, {
      views: 1, rows: 1, cell: 256, maxAtlas: 768,
    }).then((a) => (a?.texture?.image ? a : null)).catch(() => null);
    return Promise.all(['ember', 'frost'].map((sheet) =>
      Promise.all(FILES.map((f) => load(sheet, f))).then((arr) =>
        [sheet, Object.fromEntries(FILES.map((f, i) => [f, arr[i]]))])
    )).then((pairs) => {
      const base = Object.fromEntries(pairs);
      this.simPoseArt = PLAYER_STYLE.map((s) => {
        const b = base[s.sheet];
        if (!s.recolour) return b;
        return Object.fromEntries(FILES.map((f) => [f, b[f] ? recolourAtlas(b[f], s.recolour) : null]));
      });
      const n = pairs.reduce((k, [, m]) => k + Object.values(m).filter(Boolean).length, 0);
      console.log(`[art] VR poses → ${n}/${FILES.length * 2} sheets`);
      this.players.forEach((p, i) => p?.setSimPoseArt(this.simPoseArt[this.roster[i]] ?? null));
    });
  }

  /**
   * Build player `index` and put her in the scene.
   *
   * Split out from `_spawnPlayers` because joining mid-game runs exactly this
   * and nothing else — a join that went through a second construction path is
   * a join that drifts out of step with the one boot uses.
   */
  _seatPlayer(index, styleIndex = index) {
    const style = styleFor(styleIndex);
    const sheet = this.sheets[style.sheet];
    const a = this.kittenArt[styleIndex];
    /* HER MARK, WOBBLED. Four fixed marks meant every game started with the
       same photograph, and — the reported half — a kitten who joined, left and
       rejoined landed back on a mark somebody else might now be standing on.
       Drawn ONCE, here, rather than every respawn: `spawn` is also where she
       comes back after a fall, and a respawn point that moved under her would
       be the game losing her mark rather than scattering it.
       See `START_JITTER` for why it is only a unit. */
    const jx = (Math.random() * 2 - 1) * START_JITTER;
    const jz = (Math.random() * 2 - 1) * START_JITTER;
    const g = this.world.heightAt(style.startX + jx, 34 + jz);

    // Replacing a kitten already in the scene — the character picker swapping
    // her for a different cat. Take the old one out or both are drawn.
    const old = this.players[index];
    if (old) {
      /* AND REMEMBER WHAT SHE HAD. Swapping cat used to be the quietest way in
         the game to lose an afternoon: the old Player is simply dropped here,
         so her points, her clan, her oaths, her panda AND her orbs went with
         her — and unlike dropping out, nothing even put the orbs back in the
         world. Now she goes into the session's cast whole, so swapping back to
         her returns every one of them. Quests she has won but not yet been
         handed are settled first, for the same reason and in the same order as
         in `_leavePlayer`: a row is written once. */
      this.feats?.settleOnLeave(old);
      this._rememberPlayer(old);
      this._undressPlayer(old);
    }
    this.roster[index] = styleIndex;

    const p = new Player({
      texture: a.texture,
      cols: a.cols,
      rows: a.rows,
      contentScale: a.contentScale ?? 1,
      pad: a.pad ?? 0,
      // Multi-column sheets are a full turn with nothing mirrored, which keeps
      // Ember's tail and shoulder guard on the correct side facing right. Only
      // the 4-cell fallback still mirrors.
      mirror: a.cols <= 4 && a.rows === 1,
      index,
      style,
      spawn: new THREE.Vector3(style.startX + jx, (g ? g.y : 8) + 0.1, 34 + jz),
      name: style.name,
      height: sheet.height,
      dirSense: sheet.dirSense,
    });
    // A swap keeps where she was standing — the picker runs in the world with
    // everyone else still playing, so the new cat has to appear where the old
    // one was rather than teleporting back to the start.
    if (old) {
      p.position.copy(old.position);
      p.group.position.copy(old.group.position);
      p.facing = old.facing;
    }
    this.players[index] = p;
    this.scene.add(p.group);
    /* AND THE BAG HER ORBS HANG IN — see `Player.orbRoot`. Added here, beside
       her own group, because these are the two things that make a kitten
       visible and they have to arrive and leave together. */
    this.scene.add(p.orbRoot);
    this._dressPlayer(p);
    /* Her headset drawing, if the sim's sheets have landed (`loadSimArt`); if
       not, `loadSimArt` hands it to her when they do. */
    p.setSimArt(this.simArt?.[styleIndex] ?? null);
    p.setSimPoseArt(this.simPoseArt?.[styleIndex] ?? null);
    /* IF THIS CAT HAS ALREADY PLAYED TODAY, SHE PICKS UP WHERE SHE LEFT OFF.
       HERE RATHER THAN IN THE THREE CALLERS, for exactly the reason
       `_dressPlayer` is here: a player is seated in three places — boot, a
       controller joining, and the picker swapping cat — and a rule written
       into one of them is a rule the other two quietly do not have. At boot
       the cast is empty and this does nothing. */
    this._recallPlayer(p);
    return p;
  }

  /**
   * The wings and the eating pose — the two pieces of a kitten that are not on
   * her turnaround sheet.
   *
   * IT LIVES HERE BECAUSE A PLAYER IS SEATED IN THREE PLACES, NOT ONE. Boot
   * seats two; a third and fourth are seated when somebody presses START; and
   * the character picker RE-SEATS one, building a whole new `Player` for the
   * cat she switched to. Only the first of those three ever dressed anybody, so
   * a kitten who joined had no wings and no eating pose at all, and swapping
   * cat in the picker silently threw away the ones Ember and Frost were born
   * with. Three ways in and one of them doing the work is the same shape as
   * every other bug in this file.
   *
   * A no-op before the critter sheets have loaded. Boot seats its two players
   * long before those exist, so the loader dresses them itself once they land;
   * everybody seated afterwards is dressed here, on the spot.
   */
  _dressPlayer(p) {
    if (!p || !this.critterArt) return;
    if (!p.angelForm) {
      p.angelForm = new AngelForm(this.critterArt.wings, p.height);
      p.group.add(p.angelForm.group);
    }
    // By STYLE, not by slot — see the note where `eatArt` is built.
    p.setEatArt(this.eatArt?.[this.roster[p.index]] ?? null);
    p.setBlessArt(this.blessArt?.[this.roster[p.index]] ?? null);
    p.setWarpArt(this.warpArt?.[this.roster[p.index]] ?? null);
    p.setBreathArt(this.breathArt?.[this.roster[p.index]] ?? null);
    /* The fright, for a Cross Slash's victim. `scaredArt` was built for the
       ending's crowd and is per STYLE like the other three — `this.roster[i]`
       and not `i`, because a seat is not a cat. */
    p.setScaredArt(this.scaredArt?.[this.roster[p.index]] ?? null);
    p.setSweepArt(this.sweepArt?.[this.roster[p.index]] ?? null);
    p.setRiposteArt(this.riposteArt?.[this.roster[p.index]] ?? null);
  }

  /**
   * Perch the dragons.
   *
   * TWO on the home island, deliberately: with one, the second kitten could
   * never follow the first into the sky, and the pair would spend the game
   * taking turns. Flying together is the whole point of a co-op game about
   * dragons. They perch apart so both girls aren't grabbing at one prompt.
   *
   * Every other island gets its own breed, which is the reason to fly out to
   * one — you can see the colour from a long way off.
   */
  /**
   * Who is in the ending, by sheet.
   *
   * BUILT AT THE MOMENT IT IS ASKED FOR, not kept as a field. The finale can
   * fire an hour into a session, by which time the roster has been recoloured,
   * a champion may or may not have loaded and the girls may have joined in any
   * order — so the cast is read off the game as it stands rather than off a
   * snapshot taken during boot. Every entry is allowed to be null: the show
   * builds what it can and skips what it cannot. Ninth non-negotiable.
   */
  _finaleCast() {
    return {
      kittens: this.kittenArt ?? [],
      /* HER CHEER, BY STYLE. The four of them applaud the champion in the last
         shot, and the blessing pose is the one drawing in the game of a kitten
         with her paws in the air. Indexed the same way `kittens` is — by
         STYLE, never by seat — for the reason the three derivation loops that
         build these sheets each repeat at length: Storm cheering as a grey
         Frost is one slot-vs-style slip away and has happened before. */
      bless: this.blessArt ?? [],
      /* HER FRIGHT, BY STYLE, for the townspeople when the ground moves. A
         missing sheet falls back to `bless` in `_buildFolk`. */
      scared: this.scaredArt ?? [],
      dragon: this.dragonArt ?? null,
      satan: this.satan?.art ?? null,
      /* His arms up. Measured against his idle sheet by ink area at the moment
         it is used, not here — see `poseQuad`. */
      satanCharge: this.satanChargeArt ?? null,
      /* THE MENAGERIE, FOR THE MODEL OF THE TOWN. "The animals can be the same
         animals we already have sprites for, but a miniature version of them."
         Handed over as the whole map rather than as a chosen three, because the
         ending picks what it can draw and a missing species costs one kind of
         animal and nothing else — `mantis` is already allowed to be absent from
         a whole build, which is exactly the case this must not special-case.
         Ninth non-negotiable. */
      critters: this.critterArt ?? null,
      /* And a panda, which is the one animal in the game a kitten RAISED. It
         belongs on the model of the island she raised it on. */
      panda: this.pandaArt?.adult ?? this.pandaArt?.cub ?? null,
    };
  }

  _spawnDragons(art, flyArt) {
    /* The perches come from `world.dragonPerches()`, not from a list here.
       The spots and the "never inside a house" tidy-up used to live in this
       function, which meant the WORLD had no idea where any dragon was — and
       dragons are not solids, so anything built afterwards could not avoid
       them. The dragon-ball grotto proved it by going up around one. Same
       resolved list, both callers. */
    for (const s of this.world.dragonPerches()) {
      const d = new Dragon(art.texture, s.x, s.y, s.z, {
        size: 13,
        breed: BREEDS[s.breed % BREEDS.length],
        flyTexture: flyArt?.texture ?? null,
        contentScale: art.contentScale ?? 1,
        pad: art.pad ?? 0,
      });
      this.scene.add(d.group);
      this.dragons.push(d);
    }
  }

  /**
   * Stand a leader at every shrine.
   *
   * They go on the FAR side of the dais, on the axis running out from the
   * island's centre, so a kitten walking up from the island meets her across
   * the ring with the gate and the beam behind her — rather than arriving
   * behind her back, which is what putting her on the near side does. The
   * cutscene camera frames the same axis, so the shot composes itself.
   */
  _spawnLeaders() {
    this.leaders = [];
    for (const hall of this.world.clanHalls) {
      const spec = LEADERS[hall.clan.id];
      const art = spec && this.leaderArt[spec.art];
      if (!art) continue;
      const L = new ClanLeader(hall.clan, art, hall, this.world);
      L.art = art;
      this.scene.add(L.group);
      this.leaders.push(L);
      // Solid, so you can't stand inside her — but small, and well clear of
      // the trigger ring, which is the whole 6.4-unit dais.
      this.world.solids.push({ x: L.position.x, z: L.position.z, r: 0.85 });
    }
  }

  /**
   * Stand Payne in the market — see systems/payne.js. Across the road from
   * where Mr. Satan will stand, so the two grown-ups who want something from
   * you are both on the way into town, and in front of the kittens from their
   * very first frame (they start at z 34, facing it).
   */
  _spawnPayne() {
    if (!this.payne || !this.payneArt?.town) return;
    const spot = this.world.findOpenSpot(PAYNE_TOWN.x, PAYNE_TOWN.z, 3)
      ?? { x: PAYNE_TOWN.x, z: PAYNE_TOWN.z };
    this.payne.spawn(this.payneArt.town, this.payneArt.held, spot);
  }

  _spawnPickups() {
    // Kotodama Orbs — walk into one and it starts orbiting you, showing its
    // own sin/cos working as it goes.
    const spots = [[-14, 62], [16, -26], [-44, 12], [40, 40], [60, 165], [-230, 118]];
    for (const [x, z] of spots) {
      const g = this.world.heightAt(x, z);
      if (!g) continue;
      const p = new OrbPickup(x, g.y, z);
      this.scene.add(p.group);
      this.pickups.push(p);
    }
  }

  /* -------------------------------- UI ---------------------------------- */

  /**
   * Warm the Help clips once Help is open — never before.
   *
   * The GIFs are 1–2MB each and there are several of them; a kid mid-game has
   * no use for them, so they carry NO `src` at all (only `data-help-gif`) and
   * not one byte is fetched while she plays. This is the bargain the trailer
   * strikes — media that stays off the wire until asked for — made bulletproof:
   * a bare `loading="lazy"` still leaves the fetch to the browser's guess, and
   * some browsers preload the lot the moment the display:none panel is parsed.
   *
   * On the FIRST Help open we stream them in, one at a time and in reading
   * order, so the topics she is most likely to open first are ready first and
   * the network is never hit with every large file at once. Opening a topic
   * jumps its own clip to the front of the queue, so a section she goes
   * straight to never sits blank waiting for the ones above it.
   */
  /**
   * A Help topic that has just opened is scrolled to the top of the box.
   *
   * REPORTED: "Whenever opening a category in the Help menu, it should scroll
   * so that the new category is at the top of the screen."
   *
   * WHAT IT WAS DOING INSTEAD: nothing. The page stayed where it was. Open a
   * topic near the bottom and its header sat on the bottom edge with everything
   * it opened below the fold. Open one BELOW a topic that was already open, and
   * the `name` accordion shut the one above, so the page collapsed under her
   * thumb and the header she had just pressed jumped up to wherever the
   * collapse left it. Both are fixed by the same move, and sub-topics
   * (`help-sub`) get it too: a sub-topic is the category she opened as well.
   *
   * ON `toggle`, WHICH IS WHY IT IS RIGHT ABOUT THE ACCORDION. `toggle` is
   * queued and fires after BOTH cards have changed state, so the collapse
   * above is already in the layout this measures. A `click` handler would
   * measure the page before the other card shut.
   *
   * INSTANT, NOT SMOOTH. `MenuNav` tells its own scrolling apart from a wheel
   * or a finger by where it last left the page, and a smooth scroll is sixty
   * positions it did not leave. So this hands the finished position to
   * `MenuNav.keep`, with the header as the selection. Otherwise the next frame
   * would read the jump as a wheel and move the ring off the topic she just
   * pressed, onto whatever landed in the middle.
   *
   * `HELP_TOP_GAP` above the card, so the pad's focus ring still shows: it is
   * drawn OUTSIDE the summary. As high as the page allows: the last topic on
   * a short page cannot reach the top, and `scrollTop` clamps rather than
   * leaving blank space under it.
   */
  /**
   * A Help topic opened OR closed: the page goes where it should, and the
   * selection stays on the topic.
   *
   * REPORTED: "after opening or closing a category, the selection should be on
   * that category and pushing up/down will move up down to the next category
   * or scroll."
   *
   * OPENING already did (`_helpToTop`). CLOSING DID NOT, measured at 1280x720.
   * Close *Saving* or *The arena* and the page collapses, so its scroll clamps
   * to the new bottom. `MenuNav` reads a page that moved without it as a wheel
   * and hands the ring to the middle of the page, which at the bottom is pinned
   * to BACK. The next stick press then walked on from BACK, not from the topic
   * she had just shut.
   *
   * THE ACCORDION'S OWN CLOSE IS NOT HERS. Opening a topic shuts the open one
   * with the same `name`, and that fires a close `toggle` too. In either order,
   * it must not take the ring off the topic she opened. It is recognised by a
   * card with the same name being open now, which is only ever true for the
   * accordion's side of the pair: a close she made herself leaves none open.
   */
  _helpToggled(card) {
    if (card.open) { this._helpToTop(card); return; }
    if (card.name && document.querySelector(
      `#panel-help details[name="${card.name}"][open]`)) return;
    const box = card.closest('.panel');
    const head = card.querySelector(':scope > summary');
    if (!box || !head) return;
    /* STILL ON SCREEN, THEN LEAVE THE PAGE ALONE. A close near the top changes
       nothing above the header, so the page not moving is the right answer;
       only a collapse that clamped the scroll past it has to bring it back. */
    const b = head.getBoundingClientRect();
    const r = box.getBoundingClientRect();
    if (b.top < r.top || b.bottom > r.bottom) box.scrollTop += b.top - r.top - HELP_TOP_GAP;
    this.menuNav?.keep(document.getElementById('panel-help'), head);
  }

  _helpToTop(card) {
    const box = card.closest('.panel');
    if (!box || box.scrollHeight <= box.clientHeight) return;
    const at = card.getBoundingClientRect().top - box.getBoundingClientRect().top;
    box.scrollTop += at - HELP_TOP_GAP;
    const head = card.querySelector(':scope > summary');
    this.menuNav?.keep(document.getElementById('panel-help'), head);
  }

  _warmHelpClips() {
    if (this._helpClipsWired) return;   // once is enough; a second open is a cache hit anyway
    this._helpClipsWired = true;
    // A help <img> is one of two kinds and "loading" it differs by kind:
    //   - a deferred CLIP carries `data-help-gif` and no `src` yet -> give it the src;
    //   - a static SCREENSHOT carries `src` + `loading="lazy"` -> flip it to eager so
    //     it fetches NOW instead of waiting to be scrolled into view.
    // Both live inside collapsed <details> (display:none), and an eager/src'd image
    // fetches even while hidden, which is exactly what lets us pre-warm them there.
    // The screenshots used to lag a section-open behind the clips because only the
    // clips were on this queue; now they share it, so a topic is fully painted the
    // instant it opens.
    const load = (img) => {
      if (img.dataset.helpGif) { if (!img.getAttribute('src')) img.src = img.dataset.helpGif; }
      else if (img.loading === 'lazy') img.loading = 'eager';
    };
    const done = (img) => img.complete && img.naturalWidth > 0;
    /* A CLIP STARTS OVER EVERY TIME ITS TOPIC IS OPENED, WITHOUT FETCHING IT
       AGAIN. A GIF keeps animating inside a collapsed <details> — nothing stops
       it — so by the time a child opens the dragon topic for the second time
       she is joining a twenty-second clip halfway through, in the middle of a
       beat, with a caption bar talking about a button that was pressed before
       she got there. Every clip in this panel is a lesson with a beginning, and
       arriving late loses the beginning.
       THE FRAGMENT IS THE TRICK, AND IT IS NOT A HACK FOR ITS OWN SAKE. An
       `<img>` only restarts a GIF when its `src` STRING changes, and the two
       obvious ways to change it are both worse: clearing it and setting it back
       flashes a broken image, and a cache-busting QUERY is a different resource
       — that one really would pull two megabytes down a phone every time a
       child opened a topic. A fragment changes the string and is stripped
       before the request is made, so it is the same resource and the body
       comes out of cache. Measured on the dev server it is still a request, at
       most a revalidation with no body; on the deployed build it is a memory
       cache hit. Either way nothing is re-downloaded.
       Both edges on purpose: closing restarts it too, so the clip is at frame
       one and paused-in-effect behind a shut card rather than running unwatched
       for as long as Help is open. */
    let restarts = 0;
    document.querySelectorAll('#panel-help details.help-card').forEach((card) => {
      card.addEventListener('toggle', () => {
        this._helpToggled(card);
        if (card.open) card.querySelectorAll('img[data-help-gif], img[loading]').forEach(load);
        restarts++;
        card.querySelectorAll('img[data-help-gif]').forEach((img) => {
          /* Only one that has actually arrived. Rewinding an image that is
             still downloading would cancel it and put it back on the queue. */
          if (done(img)) img.src = `${img.dataset.helpGif}#r${restarts}`;
        });
      });
    });
    // Background: warm every image in document order, each only once the last has
    // landed, so one slow file cannot stall the rest and nothing floods the
    // connection. The comma selector yields clips and screenshots interleaved in
    // document order — the order a reader meets them.
    const imgs = [...document.querySelectorAll('#panel-help img[data-help-gif], #panel-help img[loading]')];
    const next = (i) => {
      if (i >= imgs.length) return;
      const img = imgs[i];
      if (done(img)) return next(i + 1);   // a toggle already claimed it, or it is cached
      const go = () => next(i + 1);
      img.addEventListener('load', go, { once: true });
      img.addEventListener('error', go, { once: true });   // a missing file must not stall the queue
      load(img);
    };
    next(0);
  }

  _bindUI() {
    const show = (id) => document.getElementById(id).classList.remove('hidden');
    const hide = (id) => document.getElementById(id).classList.add('hidden');

    /* AUDIO NEEDS A REAL GESTURE, AND ON A PHONE THE FIRST ONE IS A TAP. Every
       existing unlock hangs off a click or a menu press, which covers a mouse
       and a keyboard and misses the case where the first thing that ever happens
       is a thumb on the touch pad — the pad is not a `<button>` the menus know
       about, so nothing else here would fire. Registered on the window, once,
       and `resume()` is documented as safe to call repeatedly. */
    window.addEventListener('pointerdown', () => this.audio.resume(), { passive: true });

    document.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const a = btn.dataset.action;
        if (a === 'play') this.startPlay();
        if (a === 'help') { show('panel-help'); this._warmHelpClips(); }
        if (a === 'settings') { this._refreshPads(); show('panel-settings'); }
        if (a === 'board') { this._paintBoard(); show('panel-board'); }
        /* THE LIST NEEDS THE WORLD — every row is scored against it (how far
           through, and whether it was saved from a different build) — so on a
           phone the list is where the build happens when LOAD comes first. */
        if (a === 'saves') this._worldThen(() => { this._paintSaves(); show('panel-saves'); });
        /* The three groups the pause menu was cut into. They carry no state of
           their own — every row inside is the same `data-action` it was when
           it sat in the pause menu — so opening one is only a `show`. */
        if (a === 'kittens') show('panel-kittens');
        if (a === 'playset') show('panel-play');
        /* WATCH AGAIN IS PAINTED ON THE WAY IN, because one of its rows only
           exists once the ending has played — see `_paintWatch`. */
        if (a === 'watch') { this._paintWatch(); show('panel-watch'); }
        if (a === 'ending') show('panel-ending');
        if (a === 'ending-again') this.replayEnding();
        if (a === 'profile') this.profile.open('profile', { fromPause: true });
        if (a === 'holo-profile') this.profile.open('holo', { fromPause: true });
        if (a === 'resume') this.setPaused(false);
        /* EVERY IRREVERSIBLE BUTTON IN THIS MENU ASKS FIRST, and each of them
           asks in words that say what happens rather than "are you sure?" —
           the person answering is nine and is answering while excited. The
           dialog's cancel button is the one under the cursor when it opens;
           see systems/confirm.js. */
        if (a === 'restart') {
          this.confirm.ask({
            title: 'START THE WHOLE GAME OVER?',
            body: 'Every prop stands back up, and the clans, stars, orbs, '
              + 'points and dragons you have found all go back to the '
              + 'beginning. The record board is kept.',
            no: 'NO, KEEP PLAYING',
            yes: 'YES, START OVER',
            onYes: () => this.restart(),
          });
        }
        if (a === 'quit-match') {
          this.confirm.ask({
            title: 'LEAVE THIS MATCH?',
            body: 'The round ends with no winner and nothing goes on the '
              + 'record board. Everything outside the ring is kept.',
            no: 'NO, KEEP FIGHTING',
            yes: 'YES, LEAVE THE RING',
            onYes: () => this.quitMatch(),
          });
        }
        if (a === 'quit') {
          /* THE QUESTION SAYS WHICH OF THE TWO SAVES SHE IS ABOUT TO GET. A
             game past the five minutes is kept for good and one short of it is
             saved but can still be pushed off the list — and a player who
             finds her three-minute game gone next week has to have been told
             that could happen, in the sentence she answered. */
          const keeps = this.playT >= AUTOSAVE_AFTER;
          const mins = Math.round(AUTOSAVE_AFTER / 60);
          /* AND UNDER THE FIVE MINUTES IT IS NOT A SAVE AT ALL ANY MORE — see
             `saveByHand`. The question has to change with it, title and button
             both: "YES, SAVE AND QUIT" over a game that is about to be thrown
             away is the silent failure the sixth non-negotiable is about, and
             it is the one dialog in the game where the words are the only
             warning anybody gets. The row behind it says the same thing —
             `_buildLeaveButtons` retitles it — so she has been told twice
             before she is asked. */
          this.confirm.ask({
            title: keeps ? 'SAVE AND QUIT?' : 'QUIT WITHOUT SAVING?',
            body: keeps
              ? 'Your game is saved and KEPT — newer games will not push it off '
                + 'the list — and then the window closes. Find it again in '
                + 'PLAY SETTINGS → LOAD A SAVED GAME.'
              : `This game is shorter than ${mins} minutes, so it is NOT saved `
                + '— nothing about it is written down, and it is gone when the '
                + `window closes. Play for ${mins} minutes and this button `
                + 'saves and keeps it instead.',
            no: 'NO, KEEP PLAYING',
            yes: keeps ? 'YES, SAVE AND QUIT' : 'YES, QUIT WITHOUT SAVING',
            onYes: () => this.saveAndQuit(),
          });
        }
        if (a === 'story') this.replayIntro();
        if (a === 'trailer') this.openTrailer();
        if (a === 'trailer-close') this.trailer.close();
        if (a === 'trailer-download') this.trailer.download();
        if (a === 'offer-watch') this._answerTrailerOffer('watch');
        if (a === 'offer-skip') this._answerTrailerOffer('skip');
        if (a === 'offer-download') this._answerTrailerOffer('download');
        if (a === 'title') {
          this.confirm.ask({
            title: 'GO BACK TO THE TITLE SCREEN?',
            body: 'This ends the game and puts the world back to the '
              + 'beginning, exactly like RESTART. The record board is kept.',
            no: 'NO, KEEP PLAYING',
            yes: 'YES, END THE GAME',
            onYes: () => this.toTitle(),
          });
        }
      });
    });
    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.input.cancelCapture();
        /* THE PANEL THIS BUTTON IS IN, and only it. It used to hide all three
           by name, which was the same answer while only one could be open —
           the record board opens from KITTENS & SCORES now, with that group
           still up behind it, and BACK has to land on the group rather than
           skip past it to the pause menu. */
        btn.closest('.screen.overlay')?.classList.add('hidden');
      });
    });

    const bind = (id, key, after) => {
      const el = document.getElementById(id);
      el.value = this.settings[key];
      el.addEventListener('change', () => {
        this.settings[key] = el.value;
        /* Remembered for next time — see core/prefs.js. The row's id and the
           setting's key are the same word for all five, which is what lets
           this be one line rather than five. */
        writePref(key, el.value);
        after?.();
      });
    };
    bind('set-split', 'split');
    /* THE MAPS MOVE WHEN THE DIRECTION DOES, AND NOT AT THE NEXT UNPAUSE.
       Reported from play alongside the stacked-split bug: "maybe something in
       the code needs to get triggered to calculate this when the player
       changes the Split Direction in the settings."

       It did need to. `_drawMaps` is what repositions the boxes AND what
       records where they ended up for `nearestMap`, and it is called from the
       tail of `_tickBody` — which the pause branch returns before reaching.
       So with the settings menu open the world behind it kept the old
       arrangement, and the first bumper press after closing the menu was
       answered from a layout that no longer existed. Same argument as the
       maths row below: the menu is over a frozen world you can see. */
    bind('set-dir', 'dir', () => {
      /* Stored either way; with no world there are no boxes to move. */
      if (!this._worldReady) return;
      this._mapT = 1;        // ...and un-throttle it, so it lands this frame
      this._drawMaps();
    });
    /* HOW MANY MAPS, APPLIED ON THE SPOT — and it is a REBUILD, not a redraw.
       The boxes are DOM elements made in `_buildHud`, so there is no version
       of this that `_drawMaps` alone could do: going from two to four has to
       create two canvases and two `Minimap`s. Same argument as the direction
       row above about why it cannot wait for the next unpause — the pause menu
       is over a frozen world with the maps still on screen behind it. */
    bind('set-maps', 'maps', () => {
      if (!this._worldReady) return;
      this._buildHud();
      this._mapT = 1;
      this._drawMaps();
    });
    /* APPLIED ON THE SPOT, not at the next boot. The pause menu is over a
       frozen world with the orbs still on screen behind it, so a row that took
       effect "next time" would look like a row that did nothing. */
    bind('set-math', 'math', () => {
      this._applyMath(this._mathDefault());
      /* And forget which side of the Dojo boundary she was on, so switching
         back to Automatic re-decides from where she is standing rather than
         from a stale answer. */
      this._mathWasInDojo = null;
    });
    /* CHOOSING A QUALITY TURNS THE AUTOMATION OFF, for the session and for good.
       Somebody who has just set this to `high` on a machine the watcher thinks
       is struggling means it — they may be about to plug the monitor into the
       right card, or they may simply prefer the picture to the frame rate. A
       setting that gets overruled four seconds after you touch it is broken.
       Note this fires on ANY change, including one back down to `low`: the
       point is that a human is now steering, not which way they steered. */
    bind('set-quality', 'quality', () => {
      this._autoQuality = false;
      this._applyQuality();
    });

    /* TOUCH CONTROLS. The pad appears or disappears immediately — that is the
       half of this that matters for testing and it needs no reload. The render
       tier, the atlas budget and the party size are read once at boot and cannot
       move under a running game, so the note says which parts are waiting. A
       setting that silently does half of what its label claims is the thing
       invariant 6 exists to prevent. */
    const tc = document.getElementById('set-touch');
    const note = document.getElementById('touch-note');
    /* THIS SETTING IS ABOUT THE STICK, NOT ABOUT WHAT KIND OF MACHINE THIS IS,
       and the note has to say so or the phone case reads as a bug. Turning the
       pad off on a phone leaves the phone-sized HUD exactly where it was — that
       is the fix, and a kid who has just hidden the stick to use a controller
       needs to be told the rest of the screen is meant to stay. */
    const describeTouch = () => {
      const phone = this.device.touchPrimary;
      const pad = this.device.padOn;
      /* HOW MANY CONTROLLERS ARE ACTUALLY IN THE ROOM. Only the phone wording
         below reads it, and it reads it for one sentence that has to be true:
         turning the stick off with nothing else connected leaves a kitten
         nobody can move. That is the silent refusal the sixth non-negotiable
         forbids, and the fix is to SAY SO — as an instruction, naming the thing
         to go and do — rather than to refuse the setting. Refusing it would be
         worse: pairing a Bluetooth pad is a thing you do WITH the phone, and a
         switch that will not flip until the pad is already paired is a switch
         you cannot find when you need it. */
      const padsHere = (navigator.getGamepads?.() ?? []).filter(Boolean).length;
      /* ONLY A DESKTOP CAN CHANGE TIER FROM HERE. A real phone is a phone
         whichever way this is set, so the reload warning is now reachable in
         exactly one case: claiming to be a phone on a machine that is not one,
         or dropping that claim. Compared against the BOOT value — see
         `_bootPhone` — because `this.device` has already been patched. */
      if (phone !== this._bootPhone) {
        note.textContent = 'Reload the page to finish switching — the render '
          + 'quality and the number of kittens are set when the game starts.';
        note.classList.add('warn');
        return;
      }
      note.classList.remove('warn');
      /* THE PHONE'S OWN SENTENCES, and they are about SEATING rather than about
         a stick being drawn — because that is what the choice does. Touch is
         dealt ahead of every controller (`_devices` in core/input.js), so
         whether the stick is up decides who player 1 IS:

           on   the thumb is player 1, and a paired gamepad seats player 2
           off  gamepad 1 is player 1, gamepad 2 is player 2, and so on down

         Both halves are spelled out in both states. A setting that only
         describes the state you are already in makes you flip it to find out
         what the other one does, which on this one costs you your seat. */
      if (this.device.detected) {
        if (pad) {
          note.textContent = 'Player 1 is the on-screen stick — left thumb to '
            + 'move, buttons on the right. A gamepad paired to this phone joins '
            + 'as Player 2.';
          return;
        }
        note.textContent = padsHere
          ? 'Player 1 is gamepad 1, and a second gamepad joins as Player 2. The '
            + 'on-screen stick is hidden; the map, the sin/cos board and every '
            + 'menu still answer to a tap.'
          : 'Player 1 is a gamepad — but no controller is connected, so nothing '
            + 'can move her. Pair one over Bluetooth, or switch this back to '
            + 'Mobile input.';
        if (!padsHere) note.classList.add('warn');
        return;
      }
      if (pad) {
        note.textContent = 'Touch pad is ON — tap and drag to play, or drag the '
          + 'stick with the mouse and work the buttons from WASD / Q E F / '
          + 'Space. A second player joins on the ARROW keys.';
        return;
      }
      /* NO `phone ?` HERE ANY MORE, and it is not a case that went missing.
         "A phone with the stick off" is the branch above, guarded by
         `detected`; the only way to reach THIS line is a machine detection
         called a desktop, and `touchPrimary` cannot be true there with `padOn`
         false — work it through `profileFor` and the combination has no
         override that produces it. A branch for it was a branch that never ran
         and a sentence nobody could ever be shown. */
      note.textContent = 'Touch pad is OFF — keyboard and controllers.';
    };
    tc.value = readOverride();
    /* ONE STATE, TWO SPELLINGS — see the markup, and `_shapeTouchSetting`, for
       why this is not a second setting.

       AFTER `tc.value` IS WRITTEN, NOT BEFORE, and the ordering is load-bearing:
       shaping can move a stored `mobile` onto `auto` (identical state on a
       detected phone, and the `mobile` label names a machine the player is not
       holding), and doing that first would simply be overwritten by the line
       above — leaving the select showing a hidden option, which renders blank. */
    this._shapeTouchSetting(tc);
    tc.addEventListener('change', () => {
      writeOverride(tc.value);
      /* Re-detect rather than patching the profile by hand, so the override goes
         through exactly the path a reload would take and the two cannot
         disagree about what "mobile" means. */
      const next = detectDevice();
      this.device.touchPrimary = next.touchPrimary;
      this.device.padOn = next.padOn;
      this.device.override = next.override;
      this.device.detected = next.detected;
      this._applyTouchMode();
      describeTouch();
      this.audio.resume();
    });
    describeTouch();

    const jc = document.getElementById('set-joycon');
    jc.value = this.input.joyconRotation;
    jc.addEventListener('change', () => {
      this.input.joyconRotation = jc.value;
      writePref('joycon', jc.value);
    });

    /* Volume sliders. Both preview themselves as you drag — a volume control
       you can't hear while setting is a guessing game, especially for a kid. */
    const vol = (id, key, apply, preview) => {
      const el = document.getElementById(id);
      /* THE SLIDER STARTS WHERE THE SOUND IS. It used to start at the
         markup's 75 and 40 because the sound always did too; with the level
         remembered (see core/prefs.js) a slider at 75 over a game playing at
         20 would be the panel lying about the one thing it shows. */
      if (this._prefs[key] !== undefined) el.value = String(this._prefs[key]);
      el.addEventListener('input', () => {
        this.audio.resume();
        apply(el.value / 100);
        preview?.();
      });
      /* On `change`, the release, and not on every `input` step of a drag:
         one write per decision rather than forty. */
      el.addEventListener('change', () => writePref(key, Number(el.value)));
    };
    vol('set-sfx', 'sfx', (v) => this.audio.setSfxVolume(v), () => this.audio.play('menu'));
    vol('set-music', 'music', (v) => {
      this.audio.setMusicVolume(v);
      /* Turning it back up must resume THIS island's piece, not the home
         theme. `startMusic()` defaults to 'play', which was harmless when that
         was the only track and would now silently move you back to the meadow
         from wherever you actually are. */
      if (v > 0) this.audio.startMusic(this._wantedTrack() ?? 'play');
      else this.audio.stopMusic();
    });

    const pm = document.getElementById('set-padmode');
    pm.value = this.input.padMode;
    pm.addEventListener('change', () => {
      this.input.padMode = pm.value;
      writePref('padmode', pm.value);
      this._refreshPads();
    });

    // Remap grid. Delegated, because _refreshPads rewrites it every frame the
    // settings panel is open — per-button listeners would be re-bound at 60Hz.
    document.getElementById('pad-map').addEventListener('click', (e) => {
      const cell = e.target.closest('[data-map-half]');
      if (cell) {
        const { mapHalf, mapField } = cell.dataset;
        if (this.input.capturing?.field === mapField
            && this.input.capturing?.half === mapHalf) {
          this.input.cancelCapture();
        } else {
          this.input.beginCapture(mapHalf, mapField);
        }
        this._refreshPads();
        return;
      }
      if (e.target.closest('[data-map-wiggle]')) {
        this.input.resetAxisWatch();
        this._refreshPads();
        return;
      }
      if (e.target.closest('[data-map-detect]')) {
        this.input.cancelCapture();
        this.input.autoDetectSticks();
        this._refreshPads();
        return;
      }
      if (e.target.closest('[data-map-reset]')) {
        this.input.cancelCapture();
        this.input.resetMap();
        this._refreshPads();
      }
    });

    window.addEventListener('keydown', (e) => {
      /* A SCENE IS SKIPPED BY A DELIBERATE KEY, NOT BY ANY KEY.
         It used to be any key at all, which sounds forgiving and isn't: the
         girls hold a stick and mash buttons the whole time a scene is playing,
         so the seventy-nine-second story their uncle recorded seven voices for
         was being thrown away by a thumb resting on jump. A skip has to be
         something you can only do on purpose — which is now Escape and nothing
         else; see SKIP_KEYS. Escape lands HERE rather than opening the pause
         menu over the top of a scene, which is what the early return is for. */
      /* The griffin ride skips on the same key and the same button as
         every scene does. It is not a scene — no dialogue box, no `played`
         latch — but from a player's side it is the same kind of thing: a
         thing playing at you that you might have seen already. Routing it
         through `SKIP_KEYS` rather than "any key" matters for exactly the
         reason it does everywhere else: both girls are holding sticks. */
      /* THE TRAILER IS CHECKED FIRST, and it is checked separately from
         `_sceneActive()` on purpose. It is not a story scene — there is no 3D
         camera, no dialogue box, nothing ticking underneath — and half a dozen
         places in this file ask `_sceneActive()` to mean "a scene is running in
         the world", which would start being false the moment a video counted.
         What it DOES share is the skip rule, so it shares `SKIP_KEYS` and
         nothing else. Escape is now the whole of that set, and it must land
         here rather than at the pause toggle below: the trailer can be opened
         from the pause menu, and Escape must not close that menu underneath a
         video that is still playing. */
      if (this.trailer?.active) {
        if (SKIP_KEYS.has(e.code)) this.trailer.skip();
        e.preventDefault();
        return;
      }
      if (this._sceneActive() || this.travel) {
        if (SKIP_KEYS.has(e.code)) this._skipScene();
        e.preventDefault();
        return;
      }
      /* The name entry owns the keyboard while it is up, so a champion can
         type her name instead of scrolling to it. Before the debug keys, or
         spelling "E" would open the scene viewer. */
      if (this.tournament?.modal && this.tournament.key(e.code)) {
        e.preventDefault();
        return;
      }
      if (e.code === 'KeyM' && this.state === 'play') this._toggleMath();
      /* Z AND X ARE THE TWO BOXES, NOT THE TWO PLAYERS. See `_keyMaps`: they
         used to be `_zoomMap(0)` and `_zoomMap(1)`, which asks "which map does
         player one drive" — and the moment those two kittens share a pane the
         answer is the same map twice, so X did what Z did and the OTHER box on
         screen had no key at all. */
      if (e.code === 'KeyZ' && this.state === 'play') this._zoomMapKey(0);
      if (e.code === 'KeyX' && this.state === 'play' && !this.merged) this._zoomMapKey(1);
      if (this.state === 'play') this._debugKey(e.code);
      /* ESCAPE CUTS MR. SATAN'S ROUND LINE SHORT, and does nothing else while
         it does — see `Tournament.skipCall`. Outside the round card it answers
         false and Escape is the pause key as always. */
      if (e.code === 'Escape' && this.state === 'play' && !this.paused
        && !this._overlayOpen() && this.tournament?.skipCall?.()) {
        e.preventDefault();
        return;
      }
      /* ...AND IT BACKS OUT OF THE ARENA'S PICKERS — see `_pickerBack`. Only
         with no question up: with one, the branch below answers it NO. */
      if (e.code === 'Escape' && this.state === 'play' && !this.paused
        && !this.confirm.active && (this.leaguePicking || this.teamPicking)) {
        this._pickerBack();
        e.preventDefault();
        return;
      }
      if (e.code === 'Escape') {
        /* THE QUESTION IS ANSWERED BEFORE ANYTHING ELSE READS ESCAPE, and it
           is answered NO. It is the most modal thing on screen, it is sitting
           over the menu that Escape would otherwise close, and Escape on a
           dialog means cancel in every program a nine-year-old will ever use.
           Falling through would close the pause menu with the question still
           on top of it. */
        if (this.confirm.active) { this.confirm.close(); e.preventDefault(); return; }
        /* The Character Profile is checked before the other sub-panels
           because it can be open WITHOUT the pause menu behind it — it is
           reachable from the world at the dealer's stall — so closing it has
           to hand the game back rather than fall through to a pause toggle. */
        if (this.profile.active) { this.profile.close(); e.preventDefault(); return; }
        /* Back out of ONE sub-panel first, otherwise toggle the pause menu.
           One and not all of them: `SUB_PANELS` is ordered innermost-first for
           exactly this, so Escape in the record board lands on the group that
           opened it rather than out at the pause menu. */
        if (this._closeSubPanel()) {
          this.input.cancelCapture();
          if (this.state === 'title') this.paused = false;
        } else if (this.state === 'play') {
          /* ...and not over the name entry — see `_menuRefused`. It sits under
             `_closeSubPanel` rather than above it so a panel the winner opened
             from the results screen still closes on Escape; the refusal is
             only for the press that would open the pause menu itself. */
          if (this._menuRefused()) { e.preventDefault(); return; }
          const opening = !this.paused;
          this.setPaused(opening);
          /* ESC BELONGS TO PLAYER ONE. Asked for by name: "Player1 should
             always drive the Menu on keyboard, when pressing Esc."

             IT USED TO BE THE LOWEST SLOT ON A KEYBOARD, which sounds like the
             same rule and is not. Put a pad in player one's hands and a
             keyboard in player two's — which is the ordinary way a controller
             is dealt, pads outrank keyboards — and Esc handed the cursor to
             player TWO. From the sofa that is the menu opening under somebody
             else's name for no reason anybody can see, and the elder sister
             pressing the key that opened it cannot move the cursor in it.

             SHE IS ALWAYS THERE. Slot 0 is the first kitten seated and the
             last to leave, and there is no arrangement of four players in
             which the game is running and she is not one of them — so unlike
             the pad path below, this needs no "if nobody" answer. The guard is
             still written, because a menu nobody can drive is the one failure
             this whole function exists to prevent, and `null` is the shared
             cursor rather than a dead one. */
          if (opening) this._claimMenu(this.players[0] ? 0 : null);
        }
      }
    });
  }

  /**
   * Cycle THE MAP THIS PLAYER DRIVES. Keyboard (Z / X) and the pad's `map`
   * action both land here, and both pass a PLAYER index.
   *
   * IT USED TO INDEX `this.maps` WITH THAT PLAYER NUMBER, and the two stopped
   * being the same thing the moment a map could belong to a pane rather than
   * to a seat: player 2's bumper cycled map 1, which is whatever pane map 1
   * happens to be in, which is not necessarily hers. `_mapForPlayer` asks the
   * one question that is actually being asked, off the same assignment
   * `_drawMaps` positioned the boxes with.
   *
   * Only one map is on screen while the view is MERGED, and every player's
   * control drives it — which is why the merged path copies the zoom onto all
   * the others: they are the maps that take over the moment the party runs
   * apart, and inheriting the zoom means the split does not silently reset it
   * under somebody.
   *
   * A KITTEN WITH NO MAP IN HER OWN PANE NOW DRIVES THE NEAREST ONE, and used
   * to be told she had none. THAT CASE IS UNREACHABLE AT THE SHIPPED SETTING:
   * there is a map in every window now (see `_buildHud`), so `nearestMap`
   * finds her own and never looks further. It is still here, and still exactly
   * right, for `Minimaps: Only two, shared` — with three or four panes and two
   * boxes somebody's corner is empty, and the old answer, a toast reading "No
   * map in your window", was honest and no use: the information she wants IS
   * on screen, she simply had no way to change how much of it she could see.
   * Two maps, four kittens, two drivers each is what Richard asked for then,
   * and `nearestMap` decides which pair share which.
   *
   * SHE IS STILL TOLD WHICH BOX MOVED, because a button whose effect is in
   * somebody else's corner reads as a button that did nothing — the same rule
   * the old toast was following, answered properly. See `_cycleMapAt`.
   */
  _zoomMap(index) {
    if (this.state !== 'play') return;
    const m = this._mapForPlayer(index);
    /* Unreachable while any map exists — `nearestMap` always finds one — and
       kept because "there are no maps at all" is a state `_buildHud` could
       produce again (a tier with none, a pane count of zero), and a silent
       button is the one thing this must never become. */
    if (m < 0 || !this.maps[m]) {
      this.toast('No map on screen right now', index);
      return;
    }
    this._cycleMapAt(m, index, this._paneOf(index) !== (this._mapPane ?? [])[m]);
  }

  /**
   * WHICH BOX Z TURNS AND WHICH BOX X TURNS, this frame.
   *
   * `keyMaps` in core/split.js owns the rule and the argument for it — pure,
   * next door to `nearestMap`, which is the question it is deliberately NOT
   * asking twice — and this is the plumbing: player one's answer, player two's
   * answer, and which boxes are actually on screen.
   *
   * MERGED IS NOT PASSED THROUGH IT. There is one map, X is guarded by
   * `!merged` in the keydown listener and has never done anything there, so the
   * pair goes back untouched and the two-player merged view is bit-identical.
   *
   * @returns {number[]} [the map Z turns, the map X turns], either may be -1
   */
  _keyMaps() {
    const z = this._mapForPlayer(0);
    const x = this._mapForPlayer(1);
    if (this.merged) return [z, x];
    /* ON SCREEN MEANS `assignMaps` FOUND IT A PANE. `_drawMaps` hides the rest,
       and it reads the same `_mapPane` to decide. */
    const live = this.maps
      .map((_, i) => i)
      .filter((i) => (this._mapPane ?? [])[i] >= 0);
    return keyMaps(z, x, live);
  }

  /** Z or X: turn the box that key owns. `which` is 0 for Z, 1 for X — a KEY,
   *  not a player, which is the whole distinction `_keyMaps` exists to draw. */
  _zoomMapKey(which) {
    if (this.state !== 'play') return;
    const m = this._keyMaps()[which];
    if (m < 0 || !this.maps[m]) {
      this.toast('No map on screen right now', which);
      return;
    }
    /* NEVER "the map nearest you". The kitten on this keyboard can see both
       boxes — she is looking at one screen — and the toast that names a corner
       is for a bumper held by somebody whose own corner did not move. */
    this._cycleMapAt(m, which);
  }

  /**
   * Turn one map's dial, by MAP index.
   *
   * Split out because a tap on a map is genuinely "cycle THIS box" — the thing
   * under the thumb — while a bumper press is "cycle MY map", and routing the
   * tap through `_zoomMap` meant a map index being read as a player index. Two
   * questions, one answer each, one implementation of the actual turn.
   *
   * `elsewhere` MAKES THE TOAST NAME THE BOX THAT MOVED. With four kittens and
   * only two maps — `Minimaps: Only two, shared`, which is no longer the
   * shipped answer — half of them are turning a dial in somebody else's
   * corner, and
   * "Map zoom 2.2x" printed over a pane whose map did not change is the game
   * telling her something happened where she cannot see it happen. Only ever
   * true for the bumper: a TAP is on the box itself, so there is nothing to
   * point at.
   */
  _cycleMapAt(m, index = 0, elsewhere = false) {
    const target = this.maps[m];
    if (!target) return;
    const z = target.cycleZoom();
    if (this.merged) for (const map of this.maps) map.zoom = z;
    this.audio.play('menu');
    const level = z === 1 ? 'whole world' : `${z}x`;
    this.toast(
      elsewhere ? `Map zoom ${level} — the map nearest you` : `Map zoom ${level}`,
      index,
    );
  }

  /** True while any full-screen story scene owns the screen. */
  _sceneActive() {
    return !!(this.cutscene?.active || this.summonScene?.active
      || this.shrineScene?.active || this.finaleScene?.active || this.arenaExit?.active
      || this.storyScene?.active);
  }

  /** Skip whichever scene is up. Harmless if none is. */
  _skipScene() {
    if (this.cutscene?.active) this.cutscene.skip();
    if (this.summonScene?.active) this.summonScene.skip();
    if (this.shrineScene?.active) this.shrineScene.skip();
    if (this.finaleScene?.active) this.finaleScene.skip();
    if (this.arenaExit?.active) this.arenaExit.skip();
    if (this.storyScene?.active) this.storyScene.skip();
    if (this.travel) this.griffin?.skip();
  }

  /**
   * True on the frame a player asks to skip a scene ON A CONTROLLER.
   *
   * `start` only — the pause button, the one button on a pad that already
   * means "I want out of what is on screen". Every other action is something
   * she is holding while she watches.
   *
   * KEYBOARD SLOTS ARE EXCLUDED, and that is not a tidy-up — it is half of the
   * rule in `SKIP_KEYS`. A keyboard set's `start` action is ENTER, so without
   * this filter Enter would still skip every scene in the game through here,
   * and removing it from `SKIP_KEYS` would have looked like it worked while
   * changing nothing. The keyboard's way out is Escape, handled in the keydown
   * listener. Touch keeps its `start`: the on-screen pad has a real button
   * with that name on it and no Escape key anywhere.
   */
  _skipPressed() {
    return this.input.players.some(
      (p) => p.source !== 'keyboard' && p.pressed('start'),
    );
  }

  /** Close the innermost open sub-panel. False if none was open. */
  _closeSubPanel() {
    for (const id of SUB_PANELS) {
      const el = document.getElementById(id);
      if (el && !el.classList.contains('hidden')) {
        el.classList.add('hidden');
        return true;
      }
    }
    return false;
  }

  /** True while any overlay panel is on screen and should own the input. */
  _overlayOpen() {
    /* `panel-trailer` is in here for the title screen's any-button shortcut:
       without it, a kid mashing a pad through the trailer starts the game
       behind the video she is watching. */
    return [...SUB_PANELS, 'panel-pause', 'panel-profile',
      'panel-trailer', 'panel-trailer-offer', 'panel-confirm'].some(
      (id) => !document.getElementById(id).classList.contains('hidden'),
    );
  }

  /* --------------------------- pause / restart --------------------------- */

  /**
   * THE PLAYER WHO OPENS THE MENU IS THE PLAYER WHO DRIVES IT.
   *
   * Menus used to merge every pad into one cursor — deliberately, so that the
   * girl holding the other Joy-Con was not locked out of her own pause menu.
   * That is the right answer for two sisters sitting together and the wrong
   * one for four people: with four sticks feeding one cursor, the person who
   * pressed Start cannot get through a three-item list, because somebody who
   * is not looking at the screen is resting a thumb on an axis. It is not even
   * a fight — one idle stick beats one deliberate one, every time, because
   * `_read` takes the LARGEST input rather than the newest.
   *
   * `null` means shared, and it is the right answer in two cases that are not
   * oversights: the TITLE SCREEN, where nobody is playing yet and "press any
   * button to start" has to keep meaning that, and a menu opened from a
   * keyboard nobody is seated on — picking an arbitrary pad to hand it to
   * would be worse than sharing, and would strand whoever actually pressed
   * Esc. Prefer a rule that degrades over one that vanishes.
   *
   * @param slot  the player who asked, or null for shared
   */
  _claimMenu(slot) {
    this.menuOwner = slot;
    this._paintMenuOwner();
  }

  /**
   * Say whose menu it is, because a cursor that ignores you is a refusal.
   *
   * Sixth non-negotiable. Without this line, three of the four players push a
   * stick, nothing moves, and the only available conclusion is that the game
   * has frozen — which is exactly what a silent lock always reads as. It only
   * appears when there is more than one player to be confused about it.
   */
  _paintMenuOwner() {
    const el = document.getElementById('menu-owner');
    if (!el) return;
    const show = this.menuOwner != null && this.players.length > 1;
    el.classList.toggle('hidden', !show);
    if (!show) return;
    const style = styleFor(this.menuOwner);
    el.textContent = `${style.name} is driving this menu`;
    el.style.color = styleCss(this._styleAt(this.menuOwner));
  }

  /**
   * The owner's controller went away mid-menu. Hand it on rather than leaving
   * a menu nobody can drive — a pad running out of battery on the pause screen
   * must not be able to lock four people out of RESUME.
   *
   * Lowest seated slot wins: Ember, then Frost, then whoever else is here.
   * There is no cleverer answer — "who pressed most recently" needs a history
   * nobody is keeping, and any order at all beats a dead cursor.
   */
  _checkMenuOwner() {
    if (this.menuOwner == null) return;
    const owner = this.input.players[this.menuOwner];
    if (owner && owner.source !== 'none') return;
    const next = this.input.players.findIndex(
      (p, i) => i < this.players.length && p.source !== 'none',
    );
    this._claimMenu(next >= 0 ? next : null);
  }

  setPaused(on) {
    /* Opened by a mouse, or by any route that did not name a player: shared.
       `_claimMenu` is called again by the pad and Esc paths below with the
       slot that actually asked, so this is the floor rather than the answer.
       Closing always gives it back, or the next person to open the menu
       inherits a cursor that belongs to somebody who has stopped playing. */
    if (!on) this._claimMenu(null);
    this.paused = on;
    this.audio.duck(on);
    this.audio.play('menu');
    // Rebuilt on the way IN, so the rows match the party as it is right now
    // rather than as it was the last time somebody joined.
    if (on) this._buildLeaveButtons();
    /* THE WAY OUT OF A MATCH, and it only exists while there is one. Before
       this the ring had exactly two exits — win it, or RESTART the entire world
       — so a pair who got into a 2v2 they did not mean to pick, or who simply
       wanted their afternoon back, had to throw away every clan, star and orb
       to leave. RESTART sitting right underneath is precisely the button they
       would have reached for. */
    document.getElementById('btn-quit-match')
      ?.classList.toggle('hidden', !(on && this.inMatch && !this.travel));
    /* THE HOLO PROFILE ONLY EXISTS WHILE SOMEBODY IS IN THE SIMULATOR — a
       button for a kit nobody is wearing is a button that opens four cards
       saying "not in here". Rebuilt on the way in, like the rows above. */
    document.getElementById('btn-holo-profile')
      ?.classList.toggle('hidden', !(on && this.dream?.built && this.players.some((p) => this.dream.st[p.index]?.holoWorn)));
    document.getElementById('panel-pause').classList.toggle('hidden', !on);
    /* THE PAUSE MENU TAKES EVERY PERSONAL CARD DOWN WITH IT. It is a global
       modal over a frozen world, and a card is the opposite of that — hers,
       over a world that is running. Leaving one up would put a menu she can
       still see behind a menu she can no longer reach it through, with the
       pad it needs claimed by `_claimMenu`. */
    if (on) this.inspector.closeAll();
    if (!on) {
      /* ALL OF THEM HERE, unlike Escape's one-at-a-time: the pause menu going
         away takes everything that was standing on top of it, or a group would
         be left over a running game with nothing behind it. */
      for (const id of SUB_PANELS) document.getElementById(id)?.classList.add('hidden');
      if (this.profile.active) this.profile.close();
      // Drop the frame the pause ate, or everything lurches on resume.
      this.clock.getDelta();
    }
  }

  /**
   * QUIT — as far as a web page is allowed to.
   *
   * `window.close()` only works on a window a SCRIPT opened. Firefox and
   * Chrome both refuse it for a tab a person opened themselves, silently, with
   * no exception to catch — so a QUIT button that calls it and stops there is
   * a button that does nothing at all, which is the exact failure the sixth
   * non-negotiable exists to forbid. It IS worth calling: launched from the
   * Steam shortcut, or from any window the game opened, it genuinely closes.
   *
   * So: try, wait a beat, and if we are still running, say so and do the
   * closest honest thing — put her back on the title screen and name the
   * keystroke that actually closes a tab. Prefer a rule that degrades over one
   * that vanishes.
   */
  quitGame(said = '') {
    window.close();
    setTimeout(() => {
      if (window.closed) return;
      this.toTitle();
      const key = navigator.platform?.startsWith('Mac') ? '⌘W' : 'Ctrl+W';
      this.toast(`${said}Your browser will not let the game close its own window — press ${key} to close the tab.`);
    }, 350);
  }

  /**
   * SAVE & QUIT GAME — the save a player makes on purpose.
   *
   * Asked for as "if players Quit Game (we can rename it to 'Save & Quit
   * Game'), it will save the current play session. This is the 'Save' feature
   * other than auto-save." The writing, and whether it is kept, is
   * `saveByHand`; this is the order of events around it.
   *
   * THE SAVE HAPPENS FIRST AND SYNCHRONOUSLY, because `window.close` can
   * succeed: launched from the Steam shortcut the window really does go, and
   * anything queued after it would never run.
   *
   * A SAVE THAT FAILED DOES NOT QUIT. Private browsing refuses localStorage,
   * and a button called SAVE & QUIT that closes the window on an unsaved game
   * has done the one thing its name promised it would not. So it stays open
   * and says why — sixth non-negotiable — and QUIT is still one press away for
   * somebody who reads that and wants to go anyway: TITLE SCREEN is the row
   * above it.
   */
  saveAndQuit() {
    let out = null;
    try {
      out = saveByHand(this);
    } catch (err) {
      console.warn('[saves] could not write', err);
    }
    if (!out) {
      this.toast('Your game could NOT be saved — this browser is not letting the '
        + 'game store anything — so the game is still open.', 0);
      return false;
    }
    /* TOO SHORT TO BE WORTH A ROW, AND SHE WAS TOLD SO BEFORE SHE ANSWERED —
       the dialog this came through says QUIT WITHOUT SAVING in those words when
       the clock is under the five minutes, and the pause row says it too. So
       this closes the window: the refusal is the SAVE, not the QUIT, and a
       button that refused both would be a second thing to argue with. See
       `saveByHand`, which owns the gate. */
    if (out.short) {
      this.quitGame('Your game was too short to save. ');
      return true;
    }
    this._saveAt = this.playT + AUTOSAVE_EVERY;
    this.quitGame(out.kept ? 'Your game is saved and kept. ' : 'Your game is saved. ');
    return true;
  }

  /** Put the world back to its opening state without a page reload. */
  restart() {
    for (const p of this.players) {
      /* HER BAG, NOT THE SCENE — `Player.orbRoot` is what these hang off now,
         and `scene.remove` on a child of something else does nothing at all.
         She is NOT undressed here: a restart keeps every Player object and
         every seat, so her group and her bag both stay in the scene and only
         what is IN the bag goes. */
      for (const o of p.orbs ?? []) p.orbRoot.remove(o.group);
      p.orbs = [];
      /* The Powerup Kotodama go back too. A restart puts the world back to
         its opening state, and the opening state is one where they do not
         exist yet — leaving eight buffs on a kitten standing in a world with
         216 props back up is the same class of bug as an un-raised panda
         surviving one. `syncOrbMeshes` after the list is emptied is what
         takes the geometry out of the scene with it. */
      p.setPowerOrbs([]);
      this.syncOrbMeshes(p);
      p._clearSpecials();
      p.score = 0;
      p.mount = null;
      // The panda goes back in the bamboo it came from — a restart puts the
      // world back to its opening state, and an un-raised panda is part of it.
      p.pandaMount = null;
      if (p.panda) this.scene.remove(p.panda.group);
      p.panda = null;
      p.raisedPanda = false;
      // Lionheart's racks are a first-visit thing, and this is a first visit.
      p.dreamGeared = false;
      // His Shadow's three levels, and so 凶, are earned in a game too.
      p.shadowBeat = { easy: false, medium: false, hard: false };
      // ...and so are the orbs she earned in the simulator (dream/holokit.js).
      p.holoOrbs = [];
      /* AND THE ONES BELONGING TO KITTENS NOBODY IS PLAYING, which live in
         `_parkedPandas` and are in the scene exactly like these. Missed, a
         restart would leave a grown panda standing in a town that has just
         put every barrel back up — and `_recallPanda` would then adopt it
         into the NEXT game. Cleared with the cast it belongs to, below. */
      p.bambooCut = 0;
      p.pandaFedFrom = null;
      p.velocity.set(0, 0, 0);
      p.setFocus(null);
      p.focusT = 0;
      p._respawn(this.world);
      p.camTarget.copy(p.position);
    }
    /* Every personal card down. A restart is the world put back to its opening
       state, and there is no dealer in it — the stall does not exist until
       100% mischief. */
    this.inspector.closeAll();
    /* ...AND THIS IS THE LINE THAT MAKES THE SENTENCE ABOVE TRUE. It was never
       written. `Kotodama.clear` has said "used to by Game.restart" in its own
       doc comment since the day it was added and NOTHING HAS EVER CALLED IT —
       dead code that read as the rule being in place. Reported from play:
       "restarting the game does not actually restart the state of the game
       correctly. For instance, if the End Cutscene was played, then all the
       kotodama and dealer stall are still in the game on restart. Same with
       going to Title Screen."

       IT IS ALSO WHAT MAKES A LOAD CORRECT, which is the half nobody could
       see. `restore` begins with `restart()` and then says
       `if (snap.awakened && !game.kotodama.awakened) game.kotodama.awaken()` —
       a test that could never pass once anything had awakened, because nothing
       ever put `awakened` back. So loading a pre-100% save into a finished
       world left the stall standing in it, and loading a finished save into a
       fresh one re-seeded nothing.

       ORDER: AFTER the players have had `setPowerOrbs([])` and their meshes
       synced, above, so nobody is left wearing an orb the dealer has just
       taken back off the shelf; and `clear` ends with `forParty(..., restock)`,
       which is what puts the full twenty-six back in the box. Fourth
       non-negotiable — nothing is lost, and equally nothing is minted. */
    this.kotodama?.clear();
    for (const d of this.dragons) {
      d.rider = null;
      d.state = 'perched';
      d.home.copy(d.spawn);
      d.perch.copy(d.spawn);
      d.position.copy(d.spawn);
      d.breathTimer = 0;
    }
    for (const p of this.players) {
      p.clan = null;
      /* AND SHE HAS NEVER SWORN TO ANY OF THEM. A restart is the world put back
         to its opening state, and "already celebrated" is exactly the sort of
         quiet leftover that would make a second playthrough feel flatter than
         the first for no reason anybody could name. The pose and the thing
         over her head go with it, or a restart mid-ceremony leaves a kitten
         standing with her paws up holding an orb nobody gave her. */
      p.clansSworn.clear();
      p.aloftT = 0;
      if (p.aloft) p.aloft.visible = false;
      if (p.aloftFlat) p.aloftFlat.visible = false;
      if (p.aloftGlow) p.aloftGlow.visible = false;
      if (p.blessPose) p.blessPose.visible = false;
      if (p.warpPose) p.warpPose.visible = false;
      if (p.breathPose) p.breathPose.visible = false;
      /* `marker` is her own colour and is no longer repainted by swearing, so
         this restore is now only undoing the ring-edge flash. Kept for exactly
         that: a restart during a ring-out would otherwise leave somebody red.
         The CLAN ring is a separate mesh and simply goes away. */
      p.marker.material.color.set(p.style.colour);
      p.clanRing.visible = false;
      p.setCallout(null);
      p.calloutT = 0;
      p.callout.visible = false;
    }
    /* AND NO SEAL LEFT HANGING OVER THE NEW GAME. `_clearSpecials` above has
       already stopped every technique, so crossfx would drop its own rigs on
       the next frame anyway — but "on the next frame" is one frame of a pink
       box floating over a world that has just been rebuilt, and a restart is
       supposed to look like nothing happened here. */
    this.crossFx?.reset();
    /* And no target ring welded to somebody who is about to be a different
       kitten, for exactly the reason above. */
    this.dodgeFx?.reset();
    this.sweepFx?.reset();
    this.parryFx?.reset();
    /* ...and no mark on a kitten nobody is hunting, and no flame hanging in
       the air over a deck with no fight on it. */
    this.clanFx?.reset();
    /* Un-meet every leader. A restart is the world put back to its opening
       state, and six introductions already spent is exactly the sort of
       leftover that makes a "restart" feel like it only half worked. */
    this.shrineScene?.finish();
    this.shrineScene?.dwell.clear();
    this.storyScene?.finish();
    for (const L of this.leaders) { L.met = false; L.lookAt(null); }

    /* The dragon hunt goes back in its box too: stars back on their islands,
       Ryuuseki gone, sky back to sunset, both story scenes unspent. Leaving
       the dragon parked over a restarted town would be the loudest possible
       leftover. */
    for (const b of this.balls) b.reset();
    this.ballsHeld = 0;
    if (this.ryu) {
      this.ryu.pilot = null;
      this.ryu.gunner = null;
      this.scene.remove(this.ryu.group);
      this.ryu = null;
    }
    for (const p of this.players) p.rideAlong = null;
    this.summonScene?.finish();
    /* EVERY KEY, not the two the dragon hunt started with. The three that
       arrived later — the ending and Mr Satan's two — were never listed here,
       and only worked by accident: a missing key reads `undefined`, which is
       falsy, so `start` allowed them again. Written out, so the next scene
       added to `SCRIPTS` is one line away from being restartable rather than
       one silent lookup away. */
    this.summonScene.played = {
      found: false, summon: false, finale: false,
      satanAnnounce: false, satanOpen: false,
    };
    /* `resetSky`, NOT `clearDusk`. A restart puts the world back to its
       opening state, and by the time somebody presses it the ending may have
       happened — the dawn is deliberately permanent within a run (see
       `SummonScene.start`), so the one thing that unmakes it has to be here,
       next to the leaders being un-met and the stars going back on their
       islands. `clearDusk` alone would restart the game under the morning it
       was finished in. */
    this.summonScene.resetSky();
    /* ...and every coin back on its road, for the next afternoon's ending. */
    this.world.setCoinsTaken([]);
    this._updateBallHud();
    for (const p of this.players) {
      const el = document.getElementById(`clan-${p.index}`);
      if (el) { el.textContent = ''; el.style.background = ''; }
    }
    for (const p of this.world.props) {
      p._reset();
      p.scored = false;
    }
    for (const pk of this.pickups) {
      if (!pk.taken) continue;
      pk.taken = false;
      this.scene.add(pk.group);
    }
    for (const p of this.players) {
      const el = document.getElementById(`score-${p.index}`);
      if (el) el.textContent = '0';
    }
    document.getElementById('mtotal').textContent = `0 / ${this.world.mischiefTotal}`;
    document.getElementById('toasts').replaceChildren();
    this.merged = true;
    // Re-seed EVERY rig: the kittens are back at the town and the cameras must
    // be there with them, not lerping in from wherever the last run ended. All
    // four, not just the one that happens to be drawing — an unseeded rig that
    // takes the screen later flies in from the origin, which is the same bug
    // one pane further along.
    this._reseedRigs();
    /* Restart puts every prop back up, so the 100% is on the table again and
       its ending has to be too. `found` and `summon` are deliberately NOT
       reset: those are tied to Ryuuseki, who is still in the world. */
    this._finaleDue = false;
    this._endingShown = false;
    /* ...and WATCH THE ENDING AGAIN goes back off the menu with it. This is a
       new game: an ending row offering to replay the last game's finale is the
       one thing on that panel that could spoil this one. See `_endingSeen`. */
    this._endingWatched = false;
    if (this.summonScene) this.summonScene.played.finale = false;
    /* And the elder forgets she was counting. Every prop is standing again, so
       "three left" is a fact about a world that no longer exists — and without
       this she would never say it again either, since she only ever announces
       a number she has not said yet. */
    this.lastHunt?.reset();
    /* And every quest un-done, with its gold token. A restart is a new game,
       and a promise of an orb carried over from the old one is a free orb. */
    this.feats?.reset();
    /* And nobody has met Payne. Her marks, timers and trick go with the
       quests they were about. */
    this.payne?.reset();
    /* ...and nobody is left in a tube or in the simulator. A new afternoon
       starts with every kitten on her own feet in the real world. */
    this.dream?.reset();
    /* And the debug purse, or a restart would hand the world's money to the
       next kitten who joins a game where nothing has been knocked over yet. */
    this._debugPurse = null;

    /* The tournament goes back in its box too — and the ARENA CLOSES with it.
       A restart is the world put back to its opening state, and an eighth
       island still hanging in the sky over a town with 216 props standing
       again is the loudest possible leftover: the girls would fly straight
       to a ring Mr Satan has not offered them yet. `quest.reset` is what puts
       him back in the town, hides him, and shuts the ground off out there.
       The RECORD BOARD is deliberately NOT cleared. It is the one thing in
       the game that survives a reload on purpose, and wiping it because
       somebody pressed RESTART would throw away every tournament they have
       ever won to put some barrels back up. */
    this.tournament?.finish();
    this.quest?.reset();
    /* HIS TEMPER RESETS WITH EVERYTHING ELSE, and it must be explicit rather
       than left to the `armed` test in `update`. That test does end the state
       machine on the next frame — but RESTART also teleports him back to the
       town on this one, and a half-drawn explosion is a group of meshes parked
       at whatever position it was last given. `reset` puts the drawing away
       and his arms down in the same call. */
    this.satanBlast?.reset();
    this.travel = null;
    this.griffin?.skip();
    if (this.summonScene) {
      this.summonScene.played.satanAnnounce = false;
      this.summonScene.played.satanOpen = false;
    }

    /* THE PLAY CLOCK GOES BACK TOO, and the next save is five minutes away
       again. A restart is a new afternoon: carrying the old clock over would
       have the fresh world photographed thirty seconds later and pushing the
       run somebody actually wanted off the bottom of a five-slot list.
       `restore` sets both explicitly afterwards, so a LOAD is unaffected. */
    this.playT = 0;
    this._saveAt = AUTOSAVE_AFTER + AUTOSAVE_EVERY;
    /* A NEW AFTERNOON GETS A NEW SLOT, and the old one keeps its row. That is
       the whole reason the id is minted here rather than at boot only: pressing
       RESTART is starting a different game, and writing it over the row for the
       game you just abandoned would lose the one thing somebody might have
       pressed RESTART by accident and wanted back.

       AND THE CAST GOES WITH IT. It is a list of what people did in a world
       that no longer exists; carrying it would hand a joining kitten a clan she
       swore to in a town that has just stood itself back up. */
    this.sessionId = newSessionId();
    this.sessionCast = new Map();
    /* THE PARKED PANDAS GO WITH THE CAST THEY BELONG TO. Same argument, one
       object further down: a live animal kept for a kitten who played in a
       world that no longer exists. Their meshes come out of the scene here,
       because nothing else holds them any more. */
    for (const panda of this._parkedPandas.values()) this.scene.remove(panda.group);
    this._parkedPandas.clear();

    this.setPaused(false);
    this.toast('Adventure restarted!', 0);
  }

  toTitle() {
    /* ON A PHONE, A RELOAD. "when player returns to the Main Menu again, then
       the game cache is reset and reloaded." `restart` puts every prop back
       and keeps every mesh, texture and sound in memory for a world nobody is
       looking at; a reload is the one reset that gives them back, and the
       title it lands on builds nothing until PLAY (see `boot`). Nothing is
       lost that the in-place path keeps: the record board, the saves and the
       settings are all in localStorage, and the PLAY that follows is a new
       game, which opens with the intro like any other (see `startPlay`). The
       dialog in front of this already says the game ends. */
    if (this._lazyWorld) {
      window.location.reload();
      return;
    }
    this.restart();
    this.setPaused(false);
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('title').classList.remove('hidden');
    this.state = 'title';
    this._titleT = 0;
    /* BACK AT THE MAIN MENU IS WHEN THE TRAILER OFFER COMES BACK. See
       `_trailerOfferDue`: this one line is the whole difference between
       "offered once ever" and "offered whenever you start a new game". */
    this._offerAnswered = false;
    /* AND THE LOAD ROW IS RE-ASKED, because the game she just left may be the
       first save this machine has ever held. See `_refreshTitleLoad`. */
    this._refreshTitleLoad();
  }

  /** Redraws the live controller readout while the settings panel is open. */
  _refreshPads() {
    const el = document.getElementById('pad-list');
    const mapEl = document.getElementById('pad-map');
    if (!el) return;
    const pads = this.input.diagnostics();

    if (!pads.length) {
      /* THE STEAM CONTROLLER LINE IS HERE BECAUSE "PRESS ANY BUTTON" IS A DEAD
         END FOR IT, and a screen that gives an instruction which cannot work is
         worse than one that says nothing. It is not a gamepad until Steam makes
         it one: out of the box it ships in `lizard mode`, where the firmware
         itself types on a keyboard and moves the mouse, so nothing ever reaches
         `getGamepads` however long you mash it. In THIS game that reads as a
         possessed controller — lizard mode sends ARROW KEYS and SPACE, which
         are player 2's stick and player 1's jump, so one pad walks Frost and
         jumps Ember. See docs/notes/input.md. */
      el.innerHTML = '<div class="pad-empty">No controllers detected — '
        + 'keyboard is ready to go.<br>Pair one, then <b>press any button on '
        + 'it</b> — browsers hide a gamepad until it sends input.'
        + '<br><b>Steam Controller?</b> It types on a keyboard until Steam tells '
        + 'it otherwise. Add this browser to Steam as a non-Steam game, give that '
        + 'shortcut a <b>Gamepad</b> layout, and launch the browser from Steam.'
        + '</div>';
      if (mapEl) mapEl.innerHTML = '';
      return;
    }

    el.innerHTML = pads.map((p) => {
      // A merged Joy-Con pad feeds both slots, so a pad can own several rows.
      const owners = p.slots.length
        ? p.slots.map((s) => `<span class="pad-slot live">P${s.slot + 1}${
          s.half ? ` ${s.half}` : ''}</span>`).join('')
        : '<span class="pad-slot">—</span>';

      const halves = p.slots.length ? p.slots : [null];
      const rows = halves.map((s) => {
        if (!s) {
          /* A vJoy device with nothing feeding it is the commonest thing on
             this screen and the most confusing, because it looks exactly like a
             connected controller that has stopped working. vJoy is a driver:
             Windows reports it whether or not Joy2Win is running and whether or
             not a Joy-Con is paired. Saying "no player is reading this pad"
             about it is true and useless — this says what to do. */
          /* A LATCHED DEVICE IS NOT AN ASLEEP ONE AND MUST NOT SAY IT IS.
             "Press a button" is the wrong instruction for a pad that is
             already holding one down — pressing more buttons will not clear
             it, and the player would keep doing it. */
          if (p.latched?.length) {
            return '<div class="pad-row"><b>stuck</b> this vJoy device arrived '
              + `holding button ${p.latched.join(', ')} down and has never `
              + 'released it, so the game is ignoring that button — otherwise '
              + 'it would swing the katana forever and start the game by '
              + 'itself. Close Joy2Win and reopen it, or reset the vJoy device; '
              + 'the button starts working the instant it reports up.</div>';
          }
          if (p.asleep) {
            return '<div class="pad-row"><b>asleep</b> the vJoy driver is '
              + 'reporting this, but nothing is feeding it. Pair the Joy-Cons, '
              + 'start Joy2Win, then <b>press a button</b> — it takes a seat as '
              + 'soon as it sends anything.</div>';
          }
          return '<div class="pad-row"><b>unused</b> no player is reading this pad</div>';
        }
        const acts = Object.entries(s.actions)
          .map(([k, on]) => `<span class="act${on ? ' on' : ''}">${k}</span>`)
          .join('');
        const eaten = (s.stick.x === 0 && s.raw.x !== 0) || (s.stick.y === 0 && s.raw.y !== 0);
        return `
          <div class="pad-row">
            <b>P${s.slot + 1}${s.half ? ` ${s.half}` : ''}</b>
            stick x ${s.stick.x.toFixed(2)} &nbsp; y ${s.stick.y.toFixed(2)}
            <b>raw</b> ${s.raw.x.toFixed(2)} , ${s.raw.y.toFixed(2)}
            ${eaten ? '<span class="warn">← inside deadzone</span>' : ''}
          </div>
          <div class="pad-acts">${acts}</div>`;
      }).join('');

      return `
        <div class="pad">
          <div class="pad-head">
            ${owners}
            <span class="pad-id">${escapeHtml(p.id)}</span>
          </div>
          <div class="pad-row">
            <b>profile</b> ${p.profile}
            <b>buttons</b> ${p.buttonCount}
            <b>raw down</b> ${p.raw.length ? p.raw.join(', ') : '–'}
          </div>
          <div class="pad-row"><b>axes</b> ${this._axesReadout(p)}</div>
          ${rows}
        </div>`;
    }).join('');

    this._refreshMapGrid(pads, mapEl);
  }

  /**
   * Every axis, live, tagged with the vJoy name, a "~" once it has ever moved,
   * and whichever player/direction reads it. Wiggle a stick: every axis that
   * picks up a "~" should also carry a tag. A "~" with no tag is an axis the
   * game isn't reading — which is exactly what a dead-feeling stick looks like.
   */
  _axesReadout(p) {
    const vjoy = p.profile === 'vjoyDual';
    const map = this.input.vjoyMap;
    const tagFor = (i) => {
      if (!vjoy) return '';
      const t = [];
      p.slots.forEach((s) => {
        if (!s.half) return;
        const m = map[s.half];
        if (m.axX === i) t.push(`P${s.slot + 1}x`);
        if (m.axY === i) t.push(`P${s.slot + 1}y`);
      });
      return t.length ? `<i>${t.join('/')}</i>` : '';
    };
    return p.axes.map((v, i) => {
      const name = vjoy && VJOY_AXIS_NAMES[i] ? `${VJOY_AXIS_NAMES[i]} ` : '';
      // The range is the tell. A released stick and a dead channel both read
      // 0.00 right now; only "how far has this ever travelled" separates them.
      const r = p.axesRange[i];
      const span = r.max - r.min;
      const range = span > 0.02
        ? `<u>[${r.min.toFixed(2)}..${r.max.toFixed(2)}]</u>`
        : '<s>[flat]</s>';
      return `<span class="ax">${name}${i}:${v.toFixed(2)} ${range}${tagFor(i)}</span>`;
    }).join(' ');
  }

  /**
   * The remap grid. Only shown for the vJoy Joy-Con pad, because that's the
   * one whose button numbers are decided by whatever is feeding vJoy — they
   * can't be known from here, so they get pressed in instead of guessed.
   *
   * IT ASKS FOR THE DEVICE BY NAME RATHER THAN COUNTING SLOTS. The test used to
   * be "some pad holds two player slots", which was a proxy for "is the vJoy
   * pad" that held only while `auto` always split it. It no longer splits, so a
   * vJoy pad holds ONE slot and the grid vanished — taking the whole Joy-Con
   * calibration screen with it, for the one device that cannot be played
   * without it. A pad nothing is feeding is still excluded: there is nothing
   * to press.
   */
  _refreshMapGrid(pads, mapEl) {
    if (!mapEl) return;
    const hasVjoy = pads.some((p) => p.profile === 'vjoyDual' && !p.asleep);
    if (!hasVjoy) {
      if (mapEl.innerHTML) { mapEl.innerHTML = ''; this._mapSig = null; }
      return;
    }

    const cap = this.input.capturing;
    const map = this.input.vjoyMap;

    // _refreshPads runs every frame the panel is open. Rewriting this grid at
    // 60Hz would swap the button out from under a click between mousedown and
    // mouseup, so only rebuild when something actually changed.
    const sig = JSON.stringify([map, cap, this.input.autoAxesResult]);
    if (sig === this._mapSig) return;
    this._mapSig = sig;

    const col = (half, slot) => {
      const m = map[half];
      const cells = MAP_FIELDS.map((f) => {
        const armed = cap && cap.half === half && cap.field === f.key;
        let val;
        if (f.kind === 'button') val = (m[f.key] ?? []).join(' / ') || '—';
        else if (f.kind === 'axisX') val = `axis ${m.axX}${m.invX ? ' inv' : ''}`;
        else val = `axis ${m.axY}${m.invY ? ' inv' : ''}`;
        return `
          <button class="map-cell${armed ? ' armed' : ''}"
                  data-map-half="${half}" data-map-field="${f.key}">
            <span class="map-name">${f.label}</span>
            <span class="map-val">${armed ? 'press it…' : val}</span>
          </button>`;
      }).join('');
      return `
        <div class="map-col">
          <h4>P${slot} — ${half} Joy-Con</h4>
          ${cells}
        </div>`;
    };

    const auto = this.input.autoAxesResult;
    const autoNote = !auto ? ''
      : auto.ok
        ? `<span class="map-note ok">sticks detected by ${auto.source} — P1 on axes
           ${auto.left.join('/')}, P2 on ${auto.right.join('/')}</span>`
        : `<span class="map-note bad">couldn't detect sticks — ${auto.moved.length}
           of ${auto.axisCount} axes have moved${auto.ambiguous
             ? ', and too many rest at centre to guess' : ''}.
           Wiggle BOTH sticks fully, then press DETECT STICKS again.</span>`;

    mapEl.innerHTML = `
      <div class="map-head">
        <b>REMAP</b>
        <span class="tiny">Click a row, then press that button (or push the
        stick that way) on the matching Joy-Con.</span>
      </div>
      <div class="map-grid">${HALVES.map((h, i) => col(h, i + 1)).join('')}</div>
      <div class="map-foot">
        <button class="map-reset" data-map-detect>DETECT STICKS</button>
        <button class="map-reset" data-map-wiggle>CLEAR AXIS RANGES</button>
        <button class="map-reset" data-map-reset>RESET TO DEFAULTS</button>
        ${autoNote}
      </div>`;
  }

  _applyQuality() {
    const q = QUALITY[this.settings.quality] ?? QUALITY.medium;
    /* THREE CAPS, LOWEST WINS: what the panel actually has, what the player
       asked for, and what this class of machine may spend.

       THROUGH `effectivePixelRatio`, NOT RESTATED HERE. It used to be spelled
       out inline — the identical `Math.min` of the identical three numbers —
       which is the exact duplication `core/device.js` says at the top of itself
       that it exists to prevent, and the reason it exports this function at
       all: "Restating them is how the mobile tier ended up rendering at 1.0
       with nothing to catch it." world-check asserts the PRODUCT this returns,
       so a copy over here is a copy no check can see. */
    this.renderer.setPixelRatio(
      effectivePixelRatio(this.device, window.devicePixelRatio, this.settings.quality)
    );
    this.renderer.shadowMap.enabled = q.shadows;
    if (this.world?.sun) {
      this.world.sun.castShadow = q.shadows;
      this.world.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      this.world.sun.shadow.map?.dispose();
      this.world.sun.shadow.map = null;
    }
    this._resize();
  }

  /**
   * Where the maths overlay STARTS — the Settings row, folded over the device.
   *
   * 'auto' IS NOT THE SAME AS 'on', and that is the reason the row has three
   * values rather than being a checkbox. On a phone the board lands on top of
   * the thumb driving the kitten, so automatic means off out there and on
   * everywhere else, with `_updateMathForDojo` turning it on when she walks
   * into the room the lesson is in. Picking ON or OFF means it on every device
   * and stops the Dojo overriding her — a setting the room silently undoes is
   * the silent refusal the sixth non-negotiable forbids.
   *
   * IT IS A STARTING POINT, NOT A LOCK. `M` and the pad's own button still
   * toggle it from wherever this put it, which is why the row's wording is
   * about where it starts rather than about what it allows.
   */
  _mathDefault() {
    const m = this.settings.math;
    if (m === 'on') return true;
    if (m === 'off') return false;
    return !this.device.touchPrimary;
  }

  /**
   * Push one answer out to every orb the overlay owns.
   *
   * TWO KINDS OF ORB AND ONE SWITCH, doing two different things. A PLAIN
   * Kotodama Orb draws its whole diagram — radius, arc, the two legs of the
   * triangle, theta in degrees and radians — and that is the lesson, so all of
   * hers light up. A WORN orb rains katakana in its own colour and prints no
   * numbers at all: there can be eight of them at half the size inside a
   * 2.6-unit shell, and a second copy of the working, too small to read, would
   * make the first copy harder to find rather than teaching it twice. See
   * `PowerOrb._buildRain`.
   *
   * IT USED TO BE THE LEAD WORN ORB ONLY, and that hid the glyphs along with
   * the numbers — reported as the overlay "only appearing on 1 orb", which is
   * exactly what it was doing and exactly what it should not have been.
   */
  _applyMath(on) {
    this.mathVisible = on;
    for (const p of this.players) {
      for (const o of p.orbs ?? []) o.setMathVisible(on);
      for (const o of p.wornOrbs ?? []) o.setMathVisible(on);
    }
  }

  _toggleMath() {
    this._applyMath(!this.mathVisible);
    this.toast(this.mathVisible ? 'Math overlay ON' : 'Math overlay OFF', 0);
  }

  /**
   * Is there anything on this machine to load? Show or hide the title's row.
   *
   * ASKED FOR WITH ITS OWN CONDITION ON IT — "a Load Game button before
   * Starting the game, FOR WHEN THERE IS A SAVED GAME on the machine" — and the
   * condition is the interesting half. A button that is always there and can
   * only ever open an empty list is a button that teaches a nine-year-old the
   * game lost her afternoon; a button that appears the first time there IS one
   * is the game telling her it kept it.
   *
   * CALLED AT BOOT AND ON EVERY RETURN TO THE TITLE, because both are moments
   * the answer can have changed — the first save of an afternoon is written
   * thirty seconds after the five minutes, and TITLE SCREEN is reached from a
   * game that may just have written one.
   *
   * IT NEVER THROWS. `listSaves` reads localStorage, which private browsing
   * refuses outright; no list is the same answer as an empty one here, and a
   * title screen that failed to draw because of a storage permission would be
   * the whole game gone over a button. House rule: degrade, don't vanish.
   */
  _refreshTitleLoad() {
    const b = document.getElementById('btn-title-load');
    if (!b) return;
    let n = 0;
    try { n = listSaves().length; } catch { n = 0; }
    b.classList.toggle('hidden', n === 0);
  }

  /**
   * The title screen goes away and the world is live — WITHOUT starting a new
   * story.
   *
   * SPLIT OUT OF `startPlay` FOR THE LOAD BUTTON, and it is deliberately not
   * all of it: a loaded game must not play the intro (she is resuming an
   * afternoon, not beginning one), must not ask about the trailer (she has
   * already chosen what she is doing), and must not be handed a fresh session
   * id — `restore` sets that from the row. What it DOES share is every line
   * that makes the world drawable and audible, which is why those live here and
   * `startPlay` calls this rather than keeping a second copy: the two used to
   * drift the moment anybody added a line to one of them.
   */
  _enterPlay() {
    document.getElementById('title').classList.add('hidden');
    for (const id of SUB_PANELS) document.getElementById(id)?.classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    this.state = 'play';
    this.clock.getDelta();
    this._updateHint();
    // Browsers won't let audio start without a gesture, and pressing PLAY (or
    // LOAD) is the first one we're guaranteed to get.
    this.audio.resume();
    /* Seed each kitten's island claim as already SETTLED, so the first frame
       of play picks her island's theme instead of 1.1 seconds of silence while
       the dwell counts up. It matters on restart too, which can drop them
       somewhere other than home. */
    for (const p of this.players) {
      p._musicIsland = this._islandUnder(p);
      p._musicSince = ISLAND_DWELL;
    }
  }

  startPlay() {
    /* THE OFFER GOES BEFORE ANY OF THIS, and returns without touching the
       state. The title screen stays up behind the panel, the HUD stays hidden,
       and nothing has been half-started if she takes ten seconds to choose.
       `audio.resume()` still happens here because the PLAY click is the first
       guaranteed gesture and the trailer wants the context alive. */
    if (this._trailerOfferDue()) {
      this.audio.resume();
      document.getElementById('panel-trailer-offer').classList.remove('hidden');
      return;
    }

    /* A PHONE BUILDS THE WORLD HERE — after the trailer question, so the
       question is asked over the black title rather than after a wait. */
    if (!this._worldReady) { this._worldThen(() => this.startPlay()); return; }

    this._enterPlay();

    /* THE STORY, EVERY NEW GAME. It plays here rather than on the title
       screen because this is the first guaranteed user gesture — the intro
       has music and voices, and starting it a moment earlier would mean
       starting it silently.
       IT USED TO BE ONCE PER TAB, carried in sessionStorage so a phone's
       reload to the title would not replay it — and a refresh keeps
       sessionStorage, so a refreshed tab never saw it again. Richard:
       "Refreshing the browser isn't playing the intro cutscene ... Are these
       states being saved independently of a new game?" PLAY is a new game,
       and a new game opens on the story; LOAD is not, and does not (it calls
       `_enterPlay`, never this). Esc or Start skips it, as ever. */
    if (this.cutscene) {
      this.cutscene.play();
    } else {
      // _updateMusic takes it from here; this just avoids a silent first frame.
      this.audio.startMusic(this._wantedTrack(0) ?? 'play');
    }
  }

  /**
   * Open the trailer. From the title screen, and from the pause menu.
   *
   * From the pause menu the game STAYS PAUSED — closing the trailer puts you
   * back on the pause menu rather than into a live world you stopped watching
   * a minute ago. That is the opposite of `replayIntro`, which unpauses,
   * because the intro is a thing that happens in the world and this is not.
   */
  openTrailer() {
    this.audio.resume();
    this.trailer.open();
  }

  /**
   * Is the "watch the trailer first?" offer due?
   *
   * ONCE PER VISIT TO THE TITLE SCREEN. It used to be once per BROWSER, in a
   * localStorage flag, and that was wrong in the way that is hardest to spot:
   * it worked perfectly the first time and then the offer was gone forever —
   * not after a refresh, not after clearing the game, never. Somebody who
   * pressed STRAIGHT TO THE GAME by accident on their first ever launch had
   * permanently lost a screen they never saw. A thing you can only be shown
   * once had better be worth being sure about, and this isn't; it is a
   * question with three answers, and asking it again costs one button press.
   *
   * `_offerAnswered` is cleared in `toTitle()`, so the rule is exactly "coming
   * back to the main menu and starting a new game asks again". Within one
   * press it stays true, which is what stops `_answerTrailerOffer`'s second
   * call to `startPlay` from reopening the panel it just closed.
   *
   * `state === 'title'` keeps `restart()` from asking at all: restart goes
   * through `startPlay` too and is not somebody arriving at the game.
   */
  _trailerOfferDue() {
    return this.state === 'title' && !this._offerAnswered;
  }

  /** NO, START THE GAME / YES, WATCH IT / DOWNLOAD IT INSTEAD. */
  _answerTrailerOffer(choice) {
    /* THE ANSWER IS RECORDED NOW, NOT WHEN THE TRAILER FINISHES. Nothing may
       hang off a scene ending — seventh non-negotiable — and this is the same
       trap in a new place: hung off the video's `ended` event, a girl who
       skipped it or whose connection dropped would be asked the question again
       the moment the trailer she was already watching went away. The choice is
       the event. */
    this._offerAnswered = true;
    document.getElementById('panel-trailer-offer').classList.add('hidden');

    if (choice === 'download') this.trailer.download();
    /* `startPlay` runs either way, and runs again from the top — the flag
       above is what makes the second pass fall straight through the gate. */
    if (choice === 'watch') this.trailer.open(() => this.startPlay());
    else this.startPlay();
  }

  /** Watch it again — from the pause menu. */
  replayIntro() {
    this.setPaused(false);
    this.audio.resume();
    this.cutscene?.play();
  }

  /**
   * Has the ending really played?
   *
   * IT IS ONE FACT AND IT USED TO BE TWO ANDed TOGETHER — `_endingShown` ("this
   * afternoon reached 100%") and `played.finale` ("the scene started"). The
   * pair was reaching for "the girls got there and were shown it", and it got
   * the second half of that sentence wrong in the one direction that matters:
   * a preview through the debug scene viewer, or the endgame key, shows you the
   * whole ending and never touches `_endingShown` — so the row that offers to
   * play it again stayed hidden for the only person who had actually just
   * watched it. Reported as a missing feature rather than as a bug ("at the
   * end of the Ending Cutscene, let's add in Play Settings ▸ Watch Again the
   * option to watch the Ending Cutscene again"), because from a chair those
   * two things look identical.
   *
   * `_endingWatched` is set by `_startFinale` on the frame the scene really
   * starts, whichever door opened it, which is exactly the question this row
   * is asking: you cannot spoil an ending you have just been shown. A restart
   * clears it and a save carries it.
   *
   * `_endingShown` IS UNTOUCHED AND STILL MEANS WHAT IT MEANT. It is the guard
   * that stops a preview eating the REAL 100% — see `_mischiefComplete`, where
   * getting these two confused means a girl knocking over the last barrel in
   * the world and being shown nothing at all.
   */
  _endingSeen() {
    return !!this._endingWatched;
  }

  /**
   * START THE ENDING — the one door, whichever key or menu row asked for it.
   *
   * There are three ways into this scene (the counter reaching 100%, the debug
   * scene viewer, and WATCH THE ENDING AGAIN) and they used to be three copies
   * of the same four arguments to `summonScene.start`. That was survivable
   * while the ending was only a scene; it is not now that starting one has to
   * open the arena and take the announcer's card off the screen first, because
   * three copies of THAT is two ways to watch an ending with somebody talking
   * over it.
   *
   * BOTH OF THOSE HAPPEN BEFORE `start`, NOT ON THE SCENE FINISHING —
   * seventh non-negotiable, and the reason the whole file keeps giving: the
   * finale is a minute long and can be skipped on its first frame, so anything
   * hung off the end of it is a thing a thumb on Start can throw away.
   *
   * @returns {boolean} whether the scene really started.
   */
  _startFinale() {
    const B = this._worldBounds();
    /* THE DOOR IT IS ABOUT TO TELL THEM TO WALK THROUGH. See
       `_openTournament` for why 100% mischief does not guarantee it is open. */
    this._openTournament();
    /* AND SILENCE, BEFORE THE FIRST WORD. `_updateFinaleHold` will hush the
       card on its next pass anyway; doing it here as well means the queue is
       empty before `start` calls `audio.speak`, so a line that was half said
       cannot be stopped by the same `stopSpeaking` that would take Patchfur's
       first sentence with it. */
    this._updateFinaleHold(true);
    /* AND THE CUBS STOP GETTING A FREE PASS. `Panda.follows` lets a cub follow
       whoever raised it whatever shrine she has since sworn at, because a
       stranded baby is worse than an inconsistent rule; that trade stops
       paying at 100%, when there is no afternoon left to strand it in and the
       arena is the only thing the animal is still worth anything in. Asked
       for as "the player needs to be pledged at Pandapaw to get the benefits
       of having the panda in the arena". See the long note on `follows`.

       HERE, WITH THE HUSH, AND NOT ON THE SCENE FINISHING — the rule this
       whole method is built on. A minute-long cutscene can be skipped on its
       first frame, and a panda that only stopped following if you watched the
       credits would be a buff you keep by pressing Start.

       EVERY PANDA, NOT ONLY THE UNSWORN ONES. The flag says what time it is;
       `follows` asks the oath question. Two flags for one state is how they
       come apart. */
    for (const p of this.players) if (p?.panda) p.panda.endgame = true;
    const ok = this.summonScene.start('finale', B.centre, B.radius, this.leaderArt.elder,
      this._finaleCast());
    if (ok) {
      this._warmFinale();
      this._primeAdd(this.scene);
    }
    /* ...AND WATCH AGAIN CAN OFFER IT FROM HERE ON. Only if it really started:
       `start` refuses over another scene, and a row that appeared because a
       refusal happened would offer to replay something nobody has seen. See
       `_endingSeen`. */
    if (ok) this._endingWatched = true;
    /* AND THE CAST GOES ON THIS FRAME, NOT THE NEXT ONE. The call above runs
       before `start`, so `active` is still false there and only the hush
       happens; without this the first frame of the ending is drawn with four
       kittens standing in the middle of the town it opens on. */
    if (ok) this._updateFinaleHold();
    return ok;
  }

  /**
   * Put the world on hold for the ending: no other voice, and no cast.
   *
   * TWO DIFFERENT GATES AND THEY ARE NOT THE SAME MOMENT, which is why this is
   * one method with two flags rather than one flag used twice.
   *
   * THE VOICE IS HUSHED FROM THE MOMENT THE ENDING IS DUE. Reported from play:
   * "when playing the ending cutscene, if there is any dialog happening (like
   * by Patchfur counting down the final mischief) the dialog should be
   * cancelled and removed and not queued up if the ending cutscene is being
   * played or about to be played." It is not a rare collision, it is the
   * COMMON one: `lasthunt` says "One! One last thing standing in the whole
   * sky!" when the counter reaches one, and the very next prop is the
   * hundredth percent — so the elder is reliably mid-sentence on her own card
   * in the corner of the screen while the elder starts talking in the
   * dialogue box. Two Patchfurs. `_finaleDue` is the honest edge of "about to
   * be played": it is set the frame the counter lands, and the scene itself
   * may wait several seconds for whatever owns the screen to finish.
   *
   * THE CAST IS HIDDEN ONLY WHILE IT ACTUALLY PLAYS, and that difference
   * matters: `_finaleDue` can sit true through another scene, and a kitten who
   * blinked out of the world during the tail of a shrine introduction would be
   * a bug rather than a cut. Asked for as "when the ending cutscene is being
   * played, we should temporarily remove or hide the players and their
   * orbs/effects around them as they should not be appearing in the cutscene,
   * they should reappear once the ending cutscene is complete."
   *
   * IT IS ALSO THE DIRECTOR'S RULE: a cutscene's figures are the cutscene's
   * own actors. `FinaleShow` already builds its own kittens for the shot on
   * the bridge — the real ones standing in the town square in the middle of a
   * wide shot of the wreckage are four cats nobody cast.
   *
   * HELD EVERY FRAME, RESTORED ONCE. `syncOrbMeshes` rebuilds a kitten's worn
   * orbs wholesale and hands back groups that are visible by default, so
   * hiding them on the transition alone is one Awakening away from eight
   * icosahedrons orbiting an invisible cat. Coming back is the other way
   * round: put everything back once, on the frame the scene ends, and never
   * touch it again — anything else is this method arguing every frame with
   * whatever else has an opinion about whether a kitten is drawn.
   *
   * @param {boolean} [force] hush now, before the scene has started — used by
   *        `_startFinale` so the card is gone before the first line.
   */
  _updateFinaleHold(force = false) {
    const playing = !!(this.summonScene?.active && this.summonScene.which === 'finale');
    const hush = force || playing || !!this._finaleDue;
    if (hush !== this._finaleHush) {
      this._finaleHush = hush;
      this.announcer?.hush(hush);
    }
    if (playing) {
      for (const p of this.players) {
        p.group.visible = false;
        for (const o of p.wornOrbs ?? []) o.group.visible = false;
      }
      this._castHidden = true;
    } else if (this._castHidden) {
      this._castHidden = false;
      for (const p of this.players) {
        p.group.visible = true;
        for (const o of p.wornOrbs ?? []) o.group.visible = true;
      }
    }
  }

  /** WATCH AGAIN's rows, painted as it opens. See the markup. */
  _paintWatch() {
    document.getElementById('btn-ending-again')
      ?.classList.toggle('hidden', !this._endingSeen());
  }

  /**
   * WATCH THE ENDING AGAIN — from Play Settings → Watch Again.
   *
   * THE SAME DOOR THE SCENE VIEWER USES: clear the scene's once-latch and
   * start it. Nothing else is needed and nothing else is done, because the
   * finale is already built to change nothing it does not put back — its
   * `finish` stands every prop back on its own transform and takes the stage
   * down (skip path included), and the dawn it raises is already up in a world
   * that has had its ending. What is deliberately NOT here is anything the
   * real 100% does beside the scene: the Awakening, the toasts, `_finaleDue`.
   * Watching it again is watching, not finishing the game a second time.
   *
   * IT REFUSES OUT LOUD in the two places it cannot start. In a live match
   * the ring's clock would run under a minute of cutscene; over another scene
   * `start` would say no and the button would look dead.
   */
  replayEnding() {
    if (!this._endingSeen()) return false;
    if (this.tournament?.active) {
      this.toast('Finish or leave the match first — then the ending can play.', 0);
      return false;
    }
    if (this._sceneActive()) {
      this.toast('Something is already playing — watch the ending when it is done.', 0);
      return false;
    }
    this.setPaused(false);
    this.audio.resume();
    this.summonScene.played.finale = false;
    const ok = this._startFinale();
    /* PUT THE LATCH BACK IF IT DID NOT START, or a refusal would quietly turn
       the "has she seen it" answer to no and hide this row next time. */
    if (!ok) this.summonScene.played.finale = true;
    return ok;
  }

  /**
   * The bottom strip: who is on what, and how the next player gets in.
   *
   * IT USED TO BE WRITTEN ONCE, AT `startPlay`, AND NEVER AGAIN. That was
   * survivable while it only listed the devices — plug a pad in mid-game and
   * the line was merely out of date. It is not survivable now that it names the
   * JOIN KEY, because a stale line does not go vague, it goes wrong: it goes on
   * offering `\` to seat player 3 after player 3 has already sat down, and that
   * is worse than the silence it replaced.
   *
   * Rebuilt against a SIGNATURE rather than every frame. `textContent` on a
   * long string is layout work, and the answer changes only when a device or a
   * player appears or leaves — so the common case is a cheap compare and no
   * DOM write at all.
   */
  _updateHint() {
    const src = this.input.describe().join('   ·   ');
    /* NAME THE KEY THAT JOINS, because it moves. A keyboard set's start key
       means "pause" while somebody is on it and "join" while nobody is, so
       which key seats the next kitten depends on which sets are already taken —
       and that depends on how many controllers are plugged in. With one
       controller player 2 is on WASD, so ENTER is her PAUSE key and the join
       key is the arrow set's `\`; pressing the obvious ENTER opens the pause
       menu instead, which is exactly what happened to a real player. This strip
       already lists who is on what, so it is the right place to finish the
       sentence. */
    const join = this.input.joinHint();
    const sig = `${src}|${join}|${this.partySize}`;
    if (sig === this._hintSig) return;
    this._hintSig = sig;

    document.getElementById('hint').textContent =
      `${src}${join ? `   ·   press ${join} to join as P${this.partySize + 1}` : ''}`
      + `   ·   M: math overlay   ·   cut the bamboo east of town`
      + `   ·   fly south-east to Pandapaw and raise a panda`
      + `   ·   fly west to the Dojo of the Turning Circle`;
    /* AND NOTHING SITS ABOVE IT ANY MORE. This used to re-place the warning
       strip, because the strip was parked a measured distance over this line
       and this is the only thing that changes how tall it is. The warnings are
       two thirds of the way up their own panes now, so the hint's height is
       nothing to do with them and `_drawMaps` — which knows where the panes
       are — moves them instead. */
  }

  /**
   * Flip one animation row's direction ordering live, from the console:
   *   game.setRowSense(1, 0, -1)   // Frost, idle row, other way round
   *
   * The generated sheets don't all turn the same way and the rows within a
   * sheet don't either, so this is the fast way to settle one by eye instead
   * of a code round-trip. Row order is idle, walk, jump, attack.
   */
  setRowSense(playerIndex, row, sense) {
    const bb = this.players[playerIndex]?.sprite;
    if (!bb) return null;
    bb.rowSense = bb.rowSense ? bb.rowSense.slice() : [1, 1, 1, 1];
    bb.rowSense[row] = sense;
    console.log(`[art] ${this.players[playerIndex].name} rowSense =`, bb.rowSense);
    return bb.rowSense;
  }

  /**
   * Icewhisker's "Sense mischief": hang a bobbing arrow over the nearest prop
   * this player hasn't scored yet.
   *
   * Chasing the last few unbroken barrels across six islands is where a 100%
   * run stops being a game, so this exists to end that hunt. It's a world
   * object rather than a HUD arrow because the answer is usually "over there,
   * behind that house", which a compass on the edge of the screen can't say.
   */
  _updateSeek(dt) {
    for (const p of this.players) {
      if (!p.seekMark) {
        // A downward chevron: cone pointing down, in the player's colour.
        const geo = new THREE.ConeGeometry(0.85, 1.8, 5);
        geo.rotateX(Math.PI);
        p.seekMark = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          color: p.style.colour,
          transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false,
        }));
        p.seekMark.visible = false;
        this.scene.add(p.seekMark);
      }

      /* THE TARGET IS SOLVED FOR EVERYBODY; ONLY THE CHEVRON IS THE BUFF'S.
         It used to `continue` here, which meant `p.seekTarget` existed only
         for a kitten who had sworn to Icewhisker — and the minimap's mark for
         the last three (`systems/lasthunt.js`) has to point somewhere for a
         party who never went to the ice island, which is precisely the party
         the countdown is talking to. The search is a distance test over 216
         props four times a second; measured against everything else in a
         frame it does not appear.

         THE ARROW IN THE WORLD IS STILL HERS ALONE. That is the buff, it is
         what the shrine promised, and giving it away here would be paying for
         an oath nobody swore. */
      const sworn = !!p.clan?.buff?.seek;

      // Re-target a few times a second, not every frame: it only has to be
      // right, and a marker that twitches between two equidistant barrels is
      // worse than one that lags a little.
      p._seekT = (p._seekT ?? 0) + dt;
      if (p._seekT > 0.25 || !p.seekTarget || p.seekTarget.scored) {
        p._seekT = 0;
        let best = null;
        let bestD = Infinity;
        for (const prop of this.world.props) {
          if (prop.scored) continue;
          const d = prop.group.position.distanceToSquared(p.position);
          if (d < bestD) { bestD = d; best = prop; }
        }
        p.seekTarget = best;
      }

      const t = p.seekTarget;
      if (!t || t.scored || !sworn) { p.seekMark.visible = false; continue; }
      p.seekMark.visible = true;
      p.seekMark.position.set(
        t.group.position.x,
        t.group.position.y + (t.height ?? 1) + 2.4 + Math.sin(this.clock.elapsedTime * 3) * 0.35,
        t.group.position.z
      );
      p.seekMark.rotation.y += dt * 2.2;
    }
  }

  /**
   * Which piece of mischief THIS PANE should be pointed at, or null.
   *
   * THE COUNT DECIDES, AND NOTHING ELSE DOES. Reported from play: "on the
   * minimap, the Sense Mischief ability should only work on the minimap when
   * there are 3 or less mischief left."
   *
   * IT USED TO BE `mapOn || she has the buff`, so a kitten who swore to
   * Icewhisker had the crosshair on her map from the moment she swore —
   * with two hundred props still standing, which is a sight that points at
   * whatever happens to be nearest and never stops moving. That is not help,
   * it is a compass spinning; and it gives away the ISLAND for every barrel
   * in the game, which is the one thing `MAP_FROM` exists to hold back (see
   * `systems/lasthunt.js`: "between five and four the hunt is still a hunt
   * and being told where to go would take the last discovery in the game away
   * from them").
   *
   * WHAT THE BUFF STILL BUYS IS THE WORLD CHEVRON, unchanged — the arrow over
   * the barrel in `_updateSeek` above, which answers "which way" from the
   * first prop of the afternoon. The map answers "which island", and that
   * question only becomes worth answering at three.
   *
   * PER PANE, FROM THAT PANE'S OWN KITTENS. Two sisters on one screen looking
   * at two different islands are two different answers to "the nearest one",
   * and a shared pane takes the first of its members who has an answer rather
   * than averaging two positions into a point neither of them is standing on.
   */
  _seekMarkFor(members) {
    if (!this.lastHunt?.mapOn) return null;
    for (const i of members) {
      const p = this.players[i];
      if (!p) continue;
      const t = p.seekTarget;
      if (t && !t.scored) return t;
    }
    return null;
  }

  /**
   * Where Payne has told THIS PANE to go, or null — the first of its kittens
   * who has a mark. Same shape as `_seekMarkFor`, and for the same reason: two
   * sisters sharing a pane get the first answer, not an average of two.
   */
  _payneGoalFor(members) {
    if (!this.payne) return null;
    for (const i of members) {
      const p = this.players[i];
      const goal = p && this.payne.goalFor(p);
      if (goal) return { ...goal, colour: cssFor(p.style) };
    }
    return null;
  }

  /**
   * Pandapaw's payout: give this kitten the panda her bamboo tally has earned.
   *
   * Called on swearing the oath and on every cane cut, so it is the single
   * place that decides whether a panda exists and how big it is.
   *
   * `bambooCut` is a LIFETIME tally, so banked canes still buy the cub the
   * moment she swears — and, past `FULL_PANDA_COST`, the adult with it: forty
   * canes cut before the oath is a grown panda on the frame she swears. See
   * `tierFor`, which carries the argument, and which is the ONLY place the
   * ladder is priced. Growing an animal that already exists is charged from
   * `pandaFedFrom`, the tally at the instant it last grew, so banked canes
   * cannot be spent twice on the same rung.
   *
   * WHICH MEANS A FRESH PANDA CAN NOW ARRIVE FULLY GROWN, and the two things
   * below that used to rely on it not being able to are fine: the constructor
   * takes a tier and `setTier` fills the bar for a rideable one, and the toast
   * reads its name and blurb off `panda.spec` rather than assuming a cub.
   */
  _updatePanda(player) {
    if (!player.raisedPanda) return;
    /* A KNOCKED-DOWN PANDA IS NOT A HUNGRY ONE, and this line is the whole of
       "stays baby panda for the rest of the game". `pandaFedFrom` is a tally
       taken when the animal last grew, so a collapsed panda is standing there
       with twenty-odd canes of credit against it — without this guard the very
       next cane she cuts would call `tierFor`, find the debt long paid, and
       silently grow it back. The shrine is the only way up. */
    if (player.panda?.knockedDown) return;
    const has = player.panda ? player.panda.tier : -1;
    const want = tierFor(player.bambooCut, player.pandaFedFrom, has);
    if (want < 0) return;

    if (!player.panda) {
      const panda = new Panda(this.pandaArt, { owner: player, tier: want });
      // Beside her, on ground it can actually stand on — not inside the house
      // she happens to be leaning against.
      const spot = this.world.findOpenSpot(player.position.x, player.position.z, 3)
        ?? { x: player.position.x, z: player.position.z };
      const g = this.world.heightAt(spot.x, spot.z);
      panda.position.set(spot.x, g ? g.y : player.position.y, spot.z);
      this.scene.add(panda.group);
      player.panda = panda;
      // The clock for growing it up starts HERE, not at zero.
      player.pandaFedFrom = player.bambooCut;
      this.sfx('orb');
      this.toast(
        `${player.name} raised ${player.pandaName} the panda ${panda.spec.name}! `
        + panda.spec.blurb,
        player.index
      );
      this._updateClanBadge(player);
      return;
    }

    if (want > player.panda.tier) {
      const spec = player.panda.setTier(want);
      // ...and restarts on every growth, so each rung is paid for separately.
      player.pandaFedFrom = player.bambooCut;
      this.sfx('clan');
      this.toast(`${player.pandaName} grew into a ${spec.name}! ${spec.blurb}`, player.index);
      this._updateClanBadge(player);
    }
  }

  /**
   * The clan badge, which for Pandapaw doubles as the bamboo counter.
   *
   * Every other clan's badge can be written once, at the shrine: the buff
   * never changes. Pandapaw's is a job in progress, and "go and cut bamboo"
   * with no visible count is the sort of instruction a nine-year-old follows
   * for six canes and then abandons.
   */
  _updateClanBadge(player) {
    const el = document.getElementById(`clan-${player.index}`);
    if (!el) return;
    const clan = player.clan;
    /* IN THE SIMULATOR, THE BADGE IS HER HOLO-CLAN AND SAYS SO. Richard: "The
       Clans they join in the simulator will also be shown ... next to their
       name with (Holo) next to it, with that being returned to the players
       actual Clan pledge when they leave". `dreamOath` is the costume
       (dream/holokit.js); `_leaveSim` takes it off and repaints this. The
       bamboo counter is about her REAL panda and is not shown over a holo
       oath — it would be counting toward an animal she cannot have in here. */
    if (player.dreamOath) {
      el.textContent = clan ? `${clan.name} (Holo) · ${clan.buff.label}` : 'No clan (Holo)';
      el.style.background = clan ? `#${clan.color.toString(16).padStart(6, '0')}` : '#2a7f9a';
      return;
    }
    if (!clan) { el.textContent = ''; el.style.background = ''; return; }
    let text = `${clan.name} · ${clan.buff.label}`;
    if (clan.buff.panda) {
      const left = toNextTier(player.bambooCut, player.pandaFedFrom, player.panda?.tier ?? -1);
      /* Name the panda as soon as there IS one. "20 more bamboo" under a cub
         that has just appeared reads as though the cub still hasn't arrived —
         the counter has to say what it is counting toward. */
      /* The `player.panda` guard matters now that the second count is relative:
         a sworn player with 20+ banked canes and no panda yet also reports 0
         left, and "Bao is fully grown" under a kitten who has never seen a
         panda is the worst thing this badge could say. _updatePanda hands her
         the cub in the same breath, so it is a single frame — but it is the
         frame she is looking at when she swears. */
      /* AND WHILE IT IS DOWN, THE BADGE IS AN INSTRUCTION. Sixth
         non-negotiable: a lock has to say what it wants, as a thing to DO. The
         toast that announced the collapse has faded by the time she has walked
         back across the island, and this is the only line still on screen when
         she gets there. It is checked FIRST because the bamboo counter would
         otherwise be telling her the animal is fully grown while it is a cub
         at her feet. */
      if (player.panda?.knockedDown) text = `${player.pandaName} is a cub · INTERACT at the shrine`;
      else if (player.panda && !left) text = `${player.pandaName} is fully grown`;
      else if (player.panda) text = `${player.pandaName} the ${player.panda.spec.name} · ${left} more bamboo`;
      else text = `${clan.name} · ${left} bamboo for a cub`;
    }
    el.textContent = text;
    el.style.background = `#${clan.color.toString(16).padStart(6, '0')}`;
  }

  /**
   * Hide the playing HUD while any scene owns the screen.
   *
   * The minimap, the scores and the zoom tag all sat on top of the opening
   * cutscene too — a bordered dialogue box with a live minimap poking out from
   * behind it is the difference between a story and a pause menu. Driven from
   * one place because there are three scenes now and they all want it.
   */
  /**
   * The HUD — scoreboard, both minimaps, the maths board — is hidden whenever
   * a scene owns the screen.
   *
   * It asks `_sceneActive()` rather than listing the scenes itself. The list
   * here used to be its own copy, and a fourth scene (the finale) would have
   * been added to one and not the other — which is exactly the class of bug
   * `trackForIsland` exists to prevent elsewhere in this codebase: two copies
   * of a rule, and the copy nobody remembers.
   */
  _hudDuringScenes() {
    /* ...and for the tournament, and for the griffin ride. Same one call and
       the same one class, because this is the rule that has already been
       written twice in this file once: `_sceneActive()` exists precisely so
       the list of things that take the screen lives in one place. Mischief
       points and a minimap mean nothing in a ring, and two scoreboards on one
       screen is the kind of clutter that gets neither of them read. */
    /* AND THE PANE FRAMES AND THE PANE CARDS GO WITH IT. They are not inside
       `#hud` — they are fixed layers of their own, because one is decoration
       that must never take a tap and the other is a menu that must — but they
       are split-screen furniture just the same, and a full-screen scene has no
       split to furnish. Four coloured quarter-frames over a shared cutscene
       are dividing a picture that is not divided.

       THEY NEEDED A SEPARATE HIDE RATHER THAN A CONDITION. `_paintPaneEdges`
       already refuses to show them outside `state === 'play'`, but it only
       runs from `_render`, and every scene block in `_tickBody` returns before
       reaching it — so the frames were not painted wrong, they were simply
       left exactly as the last playing frame drew them. A rule that has to be
       re-run to take effect cannot be the rule for a case where nothing runs.
       Hence a class, toggled from here, that costs nothing and cannot go
       stale. */
    const away = this._sceneActive() || !!this.travel || !!this.tournament?.active
      || !!this.trailer?.active;
    for (const id of ['hud', 'pane-edges', 'pane-cards']) {
      document.getElementById(id)?.classList.toggle('scene-hidden', away);
    }
    /* AND THE CLAN CALLOUT, WHICH IS THE SAME BUG ONE MORE TIME — this one in
       the world rather than in the DOM. `_updateClanPrompt` already refuses to
       show "[E] SWEAR TO RUN WITH THUNDERPAW" while a scene owns the screen,
       and exactly like `_paintPaneEdges` above it runs at the END of
       `_tickBody`, which every scene block returns before reaching. So the
       caption the last playing frame drew hangs over the whole cutscene.

       It never showed until the shrine scene started standing the kitten ON
       the dais for her close-up: she is inside the clan's own ring now, which
       is precisely where that caption is drawn. */
    if (away) for (const p of this.players ?? []) p.setCallout(null);
  }

  /** The leader standing at a clan's shrine. Used to gate joining on `met`. */
  leaderFor(clan) {
    return this.leaders.find((L) => L.clan.id === clan.id) ?? null;
  }

  /**
   * SHE PRESSED THE BUTTON INSTEAD OF WAITING — start the introduction now.
   *
   * Asked for as: "when going to a clan leader and if they haven't had their
   * cutscene yet, if the user presses interact then they should just start the
   * cutscene without needing to wait the specific amount of time to see it."
   *
   * IT IS THE SAME DOOR `ShrineScene.watch` USES, not a second one. `start`
   * latches `leader.met`, stands the kitten on her mark and picks the swing —
   * so a scene begun this way is the scene, and the dwell timer that was
   * halfway through simply never gets to fire (`watch` returns immediately on
   * `L.met`). There is no version of this that plays it twice.
   *
   * THE DWELL IS CLEARED TOO. A kitten who skips the scene on its first frame
   * is standing right back on the dais with a two-second clock that has been
   * running the whole time, and `watch` would not restart it — but a SISTER
   * standing there would, with a leader who is now `met`, which is a no-op.
   * Clearing it is about the honest thing rather than a bug: the timer is
   * measuring a wait that has been answered.
   *
   * IT ANSWERS FALSE RATHER THAN QUEUEING. A refusal here becomes the toast
   * the oath branch already had, which is the sixth non-negotiable: a press
   * that cannot do the thing says what it is waiting for. The cases are a
   * scene or the ring already owning the screen, and a kitten in the air —
   * `watch` skips a mounted player because "taking the screen off her
   * mid-flight is theft", and a button press from the saddle is no different.
   *
   * @returns {boolean} whether the introduction really started.
   */
  onMeetLeader(player, clan) {
    const L = this.leaderFor(clan);
    if (!L || L.met) return false;
    if (this._sceneActive() || this.tournament?.active) return false;
    if (player.mount || player.rideAlong || player.pandaMount || player.angel) return false;
    this.shrineScene.start(L, player);
    this.shrineScene.dwell.set(clan.id, 0);
    return !!this.shrineScene.active;
  }

  /* ---------------------------- debug keys ------------------------------- */

  /**
   * Every debug shortcut, and the one place a panel row and a keypress meet.
   *
   * THIS DOC USED TO DESCRIBE THREE KEYS THAT NO LONGER EXIST — "`7` collects
   * all seven stars, `8` seats both kittens, `9` fires", the dragon shortcuts,
   * gone for long enough that the same sentence had also gone stale in
   * CLAUDE.md and was found there first. The lesson is below the fix: a prose
   * list of what the keys are will rot, and the panel is the list that cannot,
   * because `_refreshDebugPanel` builds its rows out of the same codes this
   * method switches on. So this comment says what the SHAPE is and the
   * individual keys document themselves at the branch that runs them.
   *
   * Every one of them is deliberately a digit or punctuation — nothing in
   * `BOUND_KEYS` is, and `pad-check` asserts that no keyset answers to a key
   * this method dispatches on — and every one of them toasts, so nobody can
   * trip one and wonder what happened.
   */
  _debugKey(code) {
    /* --- NOTHING HERE WORKS UNTIL THE PANEL HAS BEEN OPENED ONCE ---
       Asked for in these words: "let's make it, that the debug keys don't do
       anything until after the Debug menu is opened, at least once. This
       prevents people from accidentally enabling debug input unknowingly."

       AND IT IS THE RIGHT SHAPE OF GUARD BECAUSE OF WHO PLAYS THIS. Four kids
       hold sticks and mash, and the row of digits above the letters is exactly
       where a hand lands reaching for WASD — `1` alone knocks fifty props over
       and cannot be undone (fourth non-negotiable: nothing regrows). The
       backtick is not: it is a key nobody presses by accident, and it is the
       one that both arms these and prints the list of them, so the gesture
       that turns the tools on is the same gesture that explains them.

       PER PAGE LOAD, NOT PERSISTED. A flag in localStorage would arm the keys
       for good on the first curious press, which is the state this is here to
       prevent; and a session is one afternoon, which is the unit everything
       else about this game is measured in. It costs a developer one backtick.

       `_debugArmed` IS SET BY `_toggleDebugPanel` AND NEVER CLEARED. Closing
       the panel does not disarm — the ask was "opened at least once", and a
       toggle that also took the keys away would make the panel a thing you had
       to leave open to use the keys it documents. */
    if (!this._debugArmed && code !== 'Backquote') return;
    /* A PHONE'S TITLE HAS NO WORLD (see `boot`), and every row below reaches
       into one. The panel says so in its own first line, since a toast is part
       of the HUD and the HUD is not up on the title. `8` is the exception: the
       frame cost is a fact about the page, and a black title is exactly the
       baseline worth reading. */
    if (!this._worldReady && code !== 'Backquote' && code !== 'Digit8') return;

    /* --- THE DIGITS RUN IN THE ORDER AN AFTERNOON DOES ---
       Asked for as: "let's organize the Debug Menu items so they are in
       chronological order with chronological numbers to trigger them in order
       ... Knock over 50 happens before the Endgame which happens before Give
       every kitten all 8 kotodama orbs."
       So `1` to `7` are now the game's own running order — wreck the town,
       unlock the endgame, hand out the orbs, fly to the arena, annoy Mr Satan,
       then the two keys that fast-forward a round — and `8` is the one row
       that is a TOOL rather than a beat, the frame-cost readout, which is why
       it sits after them rather than in the middle of them.
       THE PANEL IS STILL THE LIST. Every one of these is a row you can also
       tap, the rows are in this same order, and `_refreshDebugPanel` builds
       them from the same codes this method switches on — so the numbers on
       screen cannot drift from the numbers that work. What CAN drift is prose
       about them, which is why CLAUDE.md's debug sentence is written to point
       at the panel.
       `1` WAS THE FRAME COST AND IS NOW THE MISCHIEF. If a session reaches for
       `1` expecting fps, the readout moved to `8`; nothing else about it
       changed. */

    /* --- the two fast-forwards, `6` and `7` ---
       `6` ENDS THE BEAT AND `7` NUDGES IT. One call each into `Tournament`,
       which owns the transitions, so a key cannot disagree with the game about
       what comes next — the same rule that made END stop hitting a kitten.
       (Both were `4` and `5` before the digits were put in the game's own
       running order; the user quotes below are from then and say so.)

       IT USED TO ONLY KNOW ABOUT A LIVE ROUND, and a key called "end the
       round" that does nothing for the fifteen seconds afterwards is a key you
       press, watch do nothing, and press again. Asked for as: "make the 4
       command to end the round work for the current battle round, and feast,
       it is like a fast forward button to move along the script to the next
       part." See `Tournament.endBeat`, where every state answers it.

       NUDGE IS THE FINER ONE and it exists because of the last thirty seconds:
       Mr. Satan says a different line at 30, at 15 and at 10, and each of them
       used to cost two minutes of a live round to hear. See `Tournament.nudge`
       for why it steps onto each mark rather than jumping past them.

       IT CALLS THE ROUND, IT DOES NOT KILL ANYBODY. END used to hit
       `this.players[1]` for her whole health bar — which read as ending the
       round only in a duel. At four players it killed Frost and left the other
       two standing; in a 2v2 it did not end the round at all, because a side
       is not out until everybody on it is. Reported from play as "it doesn't
       end the round, it just kills Frost". `callRound` underneath both of
       these is the same decision the clock makes at `ROUND_LIMIT`, so the key
       cannot disagree with the game about who won, at any league size, and
       nobody is hurt to get it: whoever was ahead on damage takes the round
       with the score she had actually earned, and an untouched round is a
       draw.

       BOTH REFUSE OUT LOUD AND NAME THE KEY THAT FIXES IT. Sixth
       non-negotiable, and it earns its keep here: "no tournament is running"
       and "this key is broken" look identical from a chair. */
    if (code === 'Digit6' || code === 'Digit7') {
      const nudge = code === 'Digit7';
      /* A STORY BEAT IS ONE OF THE THINGS NUDGE STEPS THROUGH, and END's answer
         for a scene is Escape, which already exists and throws the whole thing
         away. Asked for as "skip forward in the current scene/match rather
         than skip it like the 4 command does" — so the scene is checked first,
         and only for the nudge. */
      if (nudge && this._sceneActive()) {
        const moved = this.cutscene?.nextBeat() || this.summonScene?.nextBeat();
        this.toast(moved ? '[debug] next line' : '[debug] this scene has no beats to step', 0);
        return;
      }
      if (!this.tournament?.active) {
        this.toast('[debug] no tournament running — press 4 to go to the arena', 0);
        return;
      }
      const did = nudge ? this.tournament.nudge() : this.tournament.endBeat();
      this.toast(did ? `[debug] ${did}` : '[debug] nothing to skip in this bit', 0);
    }

    /* --- `1`: THE MISCHIEF, IN BATCHES — and it is FIRST because it is first.
       `2` wrecks the whole town in one press and leaves nothing to knock over;
       this is the same journey in steps you can watch, which is what makes it
       the key that comes before it rather than after. See `_knockBatch`. */
    if (code === 'Digit1') this._knockBatch();

    /* --- `2`: THE WHOLE ENDGAME, IN ONE KEY ---
       Everything this unlocks sits behind 216 props knocked over — most of an
       afternoon — so checking one colour on one orb, or one word of the ending,
       or whether a round card is centred, meant playing the whole game first.
       See `_debugEndgame`. */
    if (code === 'Digit2') this._debugEndgame();

    /* --- `3`: EVERY ABILITY ON EVERY KITTEN, IN ONE KEY ---
       The eight orbs are the endgame collectible, so trying one of them meant
       either playing to 100% mischief or pressing the endgame key and then
       trading orbs around the profile screen one at a time — and the abilities
       are exactly the thing that needs trying repeatedly, because they change
       verbs rather than numbers. Wearing all eight at once is also the stack
       case every `1 + k*n` rule in powerorb.js is written for and the hardest
       one to reach by hand.
       THE ONE DIGIT THAT DID NOT MOVE when these were put in the game's
       running order, which is luck rather than design: the orbs really are
       handed out third. */
    if (code === 'Digit3') this._debugAllOrbs();

    /* --- `4`: AND THEN THE ARENA, WHICH IS WHERE YOU WERE GOING ---
       It follows the endgame key because that is the order they are pressed
       in: unlock the endgame, then fly out to the ring. It used to be the last
       row of the SCENE VIEWER, labelled "not a scene, but it belongs in the
       same list" — which was true of why it was hard to reach and false about
       what it is, and it meant two keys and a cursor to do the thing the
       endgame key sets up. Asked for as: "let's add the 'Go to the arena' to
       be a number key press." Through `_goToArena`, the same path the scene
       viewer's row called, so nothing about what it does has moved. */
    if (code === 'Digit4') this._goToArena();

    /* --- `5`: Mr. Satan's tantrum, without the ten seconds ---
       Same argument as the fast-forwards. The gag is a FUSE: walk up to him,
       get taunted, and then wait ten seconds before anything moves — which is
       what makes it land in play and what made it unlookable-at while it was
       being written. This jumps to the shout, the frame the charge and the
       explosion both hang off, through `provoke` and therefore through the
       real `_shout`.

       IT REFUSES OUT LOUD AND SAYS WHAT TO PRESS. Sixth non-negotiable: the
       key does nothing at all unless the arena is open and he is standing in
       his box, and a debug key that silently ignored you is one you would spend
       ten minutes deciding was broken. */
    if (code === 'Digit5') {
      if (!this.tournament?.active || !this.satan?.group.visible || this.travel) {
        this.toast('[debug] no Mr. Satan to annoy — press 2, then fly to the arena', 0);
        return;
      }
      this.satanBlast?.provoke();
      this.toast('[debug] Mr. Satan has had enough of your kitty shenanigans', 0);
    }
    /* --- THE ONE THING IN THE GAME THAT OUTLIVES THE TAB ---
       `BoardWipe` IS NOT A KEY AND DELIBERATELY HAS NO LABEL. Every other row
       in the panel is a keyboard shortcut that also happens to be tappable;
       this one is a panel row and nothing else, because a single keystroke
       that deletes the only persistent thing in the project is exactly the
       kind of thing an elbow finds. `DEBUG_KEY_LABEL` has no entry for it, so
       the key column renders empty, and no `code` a keyboard can produce
       matches it.

       Asked for as "for now, we can add a setting in the Debug menu to clear
       out the leaderboard" — there was no way to do it from inside the game at
       all. `clearBoard()` had existed since the board was written, with a
       comment claiming it was reachable from the pause menu; nothing had ever
       called it. */
    if (code === 'BoardWipe') this._debugClearBoard();
    /* AND ITS SIBLING, ADDED WITH THE SAVES AND FOR THE SAME REASONS. The
       separator above these two rows used to say "the only thing that outlives
       the tab" and it was true; the autosaves made it false, and a debug panel
       that could wipe one persistent thing and not the other would send a
       tester to the dev tools for the other half. No key, for the same reason
       `BoardWipe` has none. */
    if (code === 'SaveWipe') this._debugClearSaves();
    /* AND THE THIRD: the simulator's stars, which are kept per kitten for
       good ("per kitten, forever" was Richard's answer). No key, same reason. */
    if (code === 'DreamWipe') this._debugClearDream();
    /* THE HEALTH NUMBERS BEHIND THE ARENA'S BARS. No key, because it is only
       ever wanted while a tournament is running and a keyboard in that room
       already has four kittens' worth of hands on it. See
       `Tournament._paintHud`, which is the only thing that reads the flag. */
    if (code === 'OverflowDbg') this._toggleOverflowDbg();
    /* --- the scene viewer ---
       Every cutscene in the game is gated behind hours of play and fires ONCE
       per session, which makes the last thing anybody writes also the hardest
       thing to look at: the finale needs all 213 props knocked over, and
       checking one word of it meant a fresh run. `0` replays whichever scene
       is selected and `-`/`=` walk the list. */
    if (code === 'Digit0') this._playScene();
    if (code === 'Minus') this._pickScene(-1);
    if (code === 'Equal') this._pickScene(1);
    /* IN HERE RATHER THAN NEXT TO `M` AND `Z` IN THE KEY LISTENER, and the
       difference is that those two are also real player controls bound to the
       pad. This one is not: it is a debug tool like the rest of this method, so
       it goes through the one entry point the panel's rows call and cannot
       drift from the row that is labelled with it.

       IT IS `8` NOW AND IT WAS `1`, WHICH WAS `P` — see DEBUG_KEY_LABEL for
       the first move and the digits note at the top of this method for the
       second. It sits after the seven story keys because it is the only row in
       that block that is not a thing the game DOES; CLAUDE.md's "if somebody
       says it lags, press this before changing anything" points at `8`. */
    if (code === 'Digit8') this._togglePerf();
    if (code === 'Backslash') this._toggleForceSeats();
    if (code === 'KeyR') this._passKeyboard(0);
    if (code === 'KeyU') this._passKeyboard(1);
    if (code === 'Backquote') this._toggleDebugPanel();
  }

  /**
   * FORCE-SPAWN: let ENTER seat a third and fourth kitten on the keyboard
   * alone, by sharing the two keyboard sets between two players each.
   *
   * WHY THE FEATURE EXISTS AT ALL. Four kittens takes four devices, so
   * everything that only happens at three and four — the quadrant split, the
   * two-map rule, the leagues, the way the shelf and the orb count scale with
   * the party — was tested by borrowing controllers, which in practice meant
   * tested at two. `input.forceSeats` is the whole of the mechanism; see
   * `_shadowPass` in core/input.js for how a set is shared and why sharing
   * turns itself off the moment a real second controller arrives.
   *
   * IT SAYS WHAT TO PRESS NEXT rather than just reporting a flag. The toggle
   * on its own does nothing visible — the party is still two — so a message
   * reading "force-spawn: on" is a switch that appears not to work. Rule 6:
   * a lock says what it wants, as an instruction.
   *
   * TURNING IT OFF SENDS THE EXTRA KITTENS HOME, through `_leavePlayer` like
   * every other way of losing a seat, so their orbs go back into the world and
   * their animals go home. Without it the party stays at four with two cats
   * nobody can move, which is the exact "the game is broken" reading that
   * `_trimPartyToDevices` was written for.
   */
  _toggleForceSeats() {
    const on = !this.input.forceSeats;
    this.input.forceSeats = on;
    if (!on) {
      const before = this.partySize;
      this._trimPartyToDevices();
      this.toast(`[debug] force-spawn off${
        this.partySize < before ? ` — back to ${this.partySize}` : ''}`, 0);
      this._markKeyboardOwners();
      return;
    }
    this.toast('[debug] force-spawn ON — press ENTER to seat another kitten', 0);
  }

  /**
   * Step a shared keyboard set round its ring: `R` for WASD, `U` for the
   * arrows / O K L ; set. Two kittens on a set means three stops — her, the
   * other one, then BOTH AT ONCE.
   *
   * THE KEY SITS BY THE HAND IT SWITCHES. `R` is the next key up from WASD and
   * `U` is the next key left of the O K L ; cluster, so each hand passes its
   * own keyboard along without reaching across the desk — which is the same
   * argument the two keysets are laid out on in the first place.
   *
   * THE "BOTH" STOP HAS TO NAME BOTH KITTENS. It is the one stop you can be on
   * without noticing — two cats in different panes walking identically looks
   * exactly like the split screen having desynced, which is a bug this project
   * has actually had — so the toast says `P1 + P3 together` rather than
   * anything that could be read as one of them.
   *
   * A REFUSAL SAYS SO, but only while the feature is on. With force-spawn off
   * nothing is ever shared and these two keys do not exist: toasting at every
   * stray `R` in an ordinary game would be noise about a feature nobody has
   * turned on, and four kids resting hands on a keyboard press a lot of keys.
   */
  _passKeyboard(keyset) {
    if (!this.input.forceSeats) return;
    const to = this.input.swapKeyset(keyset);
    const name = KEYSETS[keyset]?.name ?? `set ${keyset}`;
    if (!to) {
      this.toast(`[debug] nobody is sharing ${name} — press ENTER to seat her`, 0);
      return;
    }
    this._markKeyboardOwners();
    const who = to.map((i) => `P${i + 1}`).join(' + ');
    const both = to.length > 1 ? ' together' : '';
    this.toast(`[debug] ${name} → ${who}${both}`, to[0]);
  }

  /**
   * What the panel's two hand-over rows say to the right of the arrow: who
   * holds this keyboard set, or why the key would refuse.
   *
   * THE ROW IS THE ONLY DOCUMENTATION EITHER KEY HAS — the panel exists because
   * a debug key nobody can find is a debug key nobody presses — so it has to
   * read as an answer in all three states, not just the interesting one. On
   * the "both" stop every name on it is bold, which is the row saying the ring
   * has a stop where the answer is more than one kitten without spending a
   * sentence on it.
   */
  _keyboardHeldBy(keyset) {
    const share = this.input.keysetShare(keyset);
    if (share.length < 2) {
      return share.length ? `P${share[0] + 1} only` : 'nobody';
    }
    return share.map((i) => (
      this.input.keysetDrives(keyset, i) ? `<b>P${i + 1}</b>` : `P${i + 1}`
    )).join(' / ');
  }

  /**
   * Dim the badge of any kitten who is waiting her turn at a shared keyboard.
   *
   * ON A REBUILD AND ON A SWAP, NOT EVERY FRAME. The HUD badges are DOM and
   * `_buildHud` already only runs when the party changes, so the two moments
   * this can go stale are exactly the two that call it. A per-frame write here
   * would be the live-label mistake again — see label.js and performance.md.
   *
   * IT IS THE ONE THING THE TOAST CANNOT DO. The toast says who took the
   * keyboard and then goes away; halfway through a four-player test what you
   * need to know is which of the four cats your hands are on RIGHT NOW, and the
   * badge is already the thing you look at to find your own colour. On the
   * "both" stop nothing is dimmed and both titles read "playing" — the badges
   * agreeing is how you tell that stop from the two single ones at a glance.
   *
   * Inline rather than a stylesheet rule, because the whole of it is one debug
   * affordance that cannot be reached without the toggle: `keysetShare` is of
   * length one in every ordinary game, so the loop below reverts every badge
   * and leaves the HUD the girls know untouched.
   */
  _markKeyboardOwners() {
    for (let i = 0; i < this.partySize; i++) {
      const badge = document.querySelector(`#hud .score.p${i + 1}`);
      if (!badge) continue;
      const k = this.input.bindings[i]?.keyset;
      const shared = k != null && this.input.keysetShare(k).length > 1;
      const waiting = shared && !this.input.keysetDrives(k, i);
      badge.style.opacity = waiting ? '0.4' : '';
      badge.title = shared
        ? `${KEYSETS[k].name} — ${waiting ? 'waiting' : 'playing'}` : '';
    }
  }

  /**
   * Everything 100% mischief unlocks, without knocking anything over.
   *
   * THE WORLD'S MISCHIEF IS LEFT ALONE, AND THAT IS THE POINT. Marking 216
   * props `scored` would be the one-line version and it destroys the thing you
   * usually want to look at next: the props are the world, the counter is the
   * number the whole game asks a kid to trust, and `Prop.scored` latches — so a
   * debug key that spent them would leave nothing to knock over and no way back
   * short of a restart. This drives the four things the 100% moment *causes*
   * and touches none of its cause.
   *
   * It follows the real code paths rather than reproducing them:
   *
   *   1. PURSES — an equal share of `world.pointsTotal` each. Not `/ 2`, which
   *      is what this key used to do: at four players that handed out twice the
   *      world's money, and the shop's prices are derived from the pot
   *      (`pointsTotal / players / 3.5`), so it quietly made everything half
   *      price for everybody.
   *   2. THE AWAKENING — `kotodama.awaken()`, which is the same call the real
   *      100% makes. It dissolves every plain orb (worn and lying about),
   *      hands each leader a random Powerup, scatters
   *      `worldSpawnCount(partySize)` orbs — sixteen at four players, eight at
   *      two — and raises the dealer's stall.
   *   3. THE TOURNAMENT — unlocked, not entered. `stage = 'open'` is where the
   *      quest lands after Mr Satan's second scene, so from here the game is a
   *      walk to him in the town, both kittens together, exactly as it would be
   *      on a real run. Every milestone is marked SPENT, or he would call out
   *      progress the girls have not made on a world that is still standing.
   *   4. THE ENDING — queued through `_finaleDue`, not started here, for the
   *      reason `onMischief` gives: a scene cannot start over another one, and
   *      the loop picks it up on the first frame the screen is free.
   *
   * IT IS SAFE TO PRESS TWICE. `awaken()` is idempotent and would refuse a
   * second time anyway; the parts that are not idempotent (the purses, the
   * finale latch) are the parts you press it again *for*.
   */
  /**
   * Put all eight kotodama on everybody who is playing.
   *
   * IT DOES NOT UNLOCK THE ENDGAME AND MUST NOT. `2` is that key, and the two
   * do different jobs: this one is for testing what the abilities DO, and
   * hanging the world state off it would mean anybody who wanted a triple slash
   * also got the ending played at them. They compose — press 2 then 3 — which
   * is the point of keeping them apart, and which is also why they sit next to
   * each other in the panel's running order.
   *
   * Every player, not just player 1: half of what these do only shows up
   * against somebody else, and a stun that cannot be tested on a second kitten
   * is a stun nobody can see working.
   */
  _debugAllOrbs() {
    if (!this.players.length) return;
    for (const p of this.players) {
      p.setPowerOrbs([...ORB_IDS]);
      /* THE MESHES DO NOT FOLLOW BY THEMSELVES. `setPowerOrbs` is the truth
         about what she is WEARING; the constellation around her is rebuilt
         from it, and skipping this leaves eight abilities working on a kitten
         with nothing orbiting her — which reads as the key having failed. */
      this.syncOrbMeshes(p);
    }
    /* If the trade screen is open it is now showing a stale set of slots.
       `_paint` is what redraws it — there is no public refresh, and leaving it
       stale is the kind of thing that reads as the key not having worked. */
    if (this.profile?.active) this.profile._paint();
    this.toast(`[debug] every kitten wearing all ${ORB_IDS.length} kotodama`, 0);
  }

  /** How many results are on this device, across every league. Read fresh
   *  rather than cached: the panel is rebuilt on every interaction and a count
   *  that lags by one tournament is a count nobody can trust. */
  _boardRows() {
    return BOARD_MODES.reduce((n, m) => n + loadBoard(m).length, 0);
  }

  /**
   * Throw away every tournament result on this device.
   *
   * IT ASKS FIRST, AND IT IS NOT BEING POLITE. Seventh non-negotiable: nothing
   * irreversible happens on one press and the default answer is no. This is the
   * single most irreversible button in the game — the record board is the ONLY
   * thing in Katana Kitties that survives closing the tab, which is the whole
   * argument `systems/leaderboard.js` opens with — and there is no backend to
   * recover it from. The dialog has no `.primary`, like every other one, so the
   * cursor opens on "no".
   *
   * THE BUTTONS SAY WHAT THEY DO AND THE NUMBER IS IN THEM. "Yes" on a dialog
   * a child has stopped reading is a coin toss; "YES, WIPE ALL 7" is a
   * sentence she has to disagree with on purpose. Sixth non-negotiable.
   *
   * EVERY LEAGUE, because that is what "clear out the leaderboard" means to
   * somebody looking at a device — a duel board wiped and a 3v1 board left
   * standing would read as the button having half worked.
   */
  _debugClearBoard() {
    const rows = this._boardRows();
    if (!rows) {
      this.toast('[debug] the record board is already empty', 0);
      return;
    }
    this.confirm.ask({
      title: 'WIPE THE RECORD BOARD?',
      body: `Every tournament result saved on this device goes — all ${rows} of `
        + 'them, in every league. It is the one thing in the game that survives '
        + 'closing the tab, and there is no way to get it back.',
      no: 'NO, KEEP THE RECORDS',
      yes: `YES, WIPE ALL ${rows}`,
      onYes: () => {
        clearBoard();
        this.toast(`[debug] record board wiped — ${rows} results gone`, 0);
        /* The row prints the count, so it is now wrong until the panel is
           rebuilt — and "the button did nothing" is what a stale row reads as. */
        this._refreshDebugPanel();
      },
    });
  }

  /**
   * Throw away every saved afternoon on this device.
   *
   * THE SAME SHAPE AS THE BOARD WIPE NEXT TO IT, and deliberately so: a number
   * in the button, words that say what goes, and no `.primary` so the cursor
   * opens on "no". What differs is what it is FOR — the board is a trophy
   * cabinet and this is a filing cabinet, and a tester who wants to watch the
   * five-slot cap fill from empty has no other way to empty it.
   */
  _debugClearSaves() {
    const n = listSaves().length;
    if (!n) {
      this.toast('[debug] there are no saved games on this device', 0);
      return;
    }
    this.confirm.ask({
      title: 'WIPE EVERY SAVED GAME?',
      body: `All ${n} saved ${n === 1 ? 'afternoon' : 'afternoons'} on this `
        + 'device go, and there is no way to get them back. The record board '
        + 'is kept.',
      no: 'NO, KEEP THEM',
      yes: `YES, WIPE ALL ${n}`,
      onYes: () => {
        clearSaves();
        this.toast(`[debug] saved games wiped — ${n} gone`, 0);
        /* The row prints the count, so it is wrong until the panel is rebuilt,
           and a stale row reads as a button that did nothing. */
        this._refreshDebugPanel();
      },
    });
  }

  /**
   * Throw away every star the Dream Dojo has given out on this device.
   *
   * THE SAME SHAPE AS THE TWO WIPES ABOVE IT: the count in the button, words
   * that say what goes and what stays, no `.primary`. Counted in KITTENS
   * because that is what the stars are filed under — "3 kittens" is a number a
   * tester can check against who has played.
   */
  _debugClearDream() {
    const n = this.dream?.progress.count() ?? 0;
    if (!n) {
      this.toast('[debug] nobody has any Dream Dojo stars yet', 0);
      return;
    }
    this.confirm.ask({
      title: 'WIPE THE DREAM DOJO STARS?',
      body: `Every star and best time from Lionheart's simulator goes, for all `
        + `${n} ${n === 1 ? 'kitten' : 'kittens'}, and there is no way to get them `
        + 'back. Saved games and the record board are kept.',
      no: 'NO, KEEP THE STARS',
      yes: `YES, WIPE ALL ${n}`,
      onYes: () => {
        this.dream.progress.wipe();
        this.toast(`[debug] Dream Dojo stars wiped — ${n} ${n === 1 ? 'kitten' : 'kittens'}`, 0);
        this._refreshDebugPanel();
      },
    });
  }

  _debugEndgame() {
    const standing = this.world.props.filter((p) => !p.knocked && !p.gone).length;
    const { share, orbs } = this._unlockEndgame();

    // And the ending, on the first frame nothing else owns the screen.
    this.summonScene.played.finale = false;
    this._finaleDue = true;

    this.toast(
      `[debug] endgame: ${standing} knocked over, ${share} pts each, `
      + `${orbs} orbs out, arena open`, 0
    );
  }

  /**
   * The four things 100% mischief CAUSES, without the mischief.
   *
   * SPLIT OUT OF `_debugEndgame` SO THE ENDING CAN CARRY IT TOO, and that is
   * the bug this fixes. The scene viewer's "100% mischief — the ending" played
   * the words and nothing else: no purses, no Awakening, no orbs in the world,
   * no stall, no arena. Patchfur said what they had done, told them where to
   * take it next, and handed them a world in which none of it had happened —
   * which is the one failure mode this game has been careful about everywhere
   * else (a promise made out loud with nothing behind it). Watching the whole
   * 63 seconds made no difference either, because nothing was ever hung off the
   * scene FINISHING; there was simply nothing hung off it at all.
   *
   * So the unlock belongs to the ending being SHOWN, not to the counter that
   * usually shows it: whichever way that scene is reached, the world it
   * describes is the world you get back.
   *
   * IT IS IDEMPOTENT, which is what makes that safe on the real path too. On a
   * genuine 100% run `onMischief` has already awakened the Kotodama and the
   * quest has already opened the arena, so calling this from the ending is a
   * handful of assignments that change nothing.
   *
   * @returns {{share: number, orbs: number}} for the debug toast
   */
  _unlockEndgame() {
    /* THE MISCHIEF ITSELF, FIRST. See `_wreckWorld` — the ending is a scene
       ABOUT a wrecked town and half of it does not exist over a standing one.
       Before the purses and the arena, because the purses are a share of a
       total this does not change and the ending's own `_heap()` is measured
       off the props the moment the scene starts. */
    this._wreckWorld();
    /* AN EQUAL SHARE EACH, AT WHATEVER THE PARTY SIZE IS NOW. `Math.floor`
       rather than `round`, so four shares can never add up to more than the
       world actually contains. */
    const share = Math.floor(this.world.pointsTotal / Math.max(1, this.partySize));
    /* Remembered, so a kitten who joins after this was pressed is not the one
       player at the stall who cannot afford anything — see `_joinPlayer`. */
    this._debugPurse = share;
    for (const p of this.players) {
      /* NEVER DOWNWARD. It is a floor under everybody's purse, not a reset:
         now that the ending can call this, a kitten who has genuinely earned
         more than an even share — in the ring, which pays — must not be handed
         a smaller number by the scene that congratulates her. */
      p.score = Math.max(p.score ?? 0, share);
      this.onScoreChanged(p);
    }

    if (!this.kotodama.awakened) {
      this._awaken(null);
    }

    // The tournament, open and waiting in the town.
    this._openTournament();

    return { share, orbs: this.pickups.filter((k) => !k.taken).length };
  }

  /**
   * Open the arena and stand Mr Satan in the town, wherever the party got to.
   *
   * LIFTED OUT OF `_unlockEndgame` SO THE ENDING ITSELF CAN CALL IT, and that
   * is the whole of the bug. Asked for as: "the Arena should be unlocked with
   * the Ending Cutscene if it is not currently unlocked yet."
   *
   * It reads like it cannot happen — `arenaquest` opens the arena at 80%
   * mischief and the ending is 100%, so surely the 80% has been and gone. It
   * has not, necessarily. `OPEN_AT` is a percentage of a counter, and the
   * stage it moves to is gated behind Mr Satan's second SCENE: a girl who
   * skipped him, or who crossed 80% while a shrine introduction owned the
   * screen (the refusal `arenaquest` retries), or who simply never walked back
   * into the town, can reach the last barrel in the world with the tournament
   * still shut. And then Patchfur's last line — "the arena is open, go and
   * find out" — is a promise with nothing behind it, which is the one failure
   * mode this game has been careful about everywhere.
   *
   * THE REST OF `_unlockEndgame` IS DELIBERATELY NOT IN HERE. The ending calls
   * THIS, not that: the purses are an even share of the world's points and
   * handing them out on a real 100% run would overwrite what four kittens
   * spent an afternoon earning, and the Awakening is already done by
   * `_mischiefComplete` at the moment the counter lands. The only thing the
   * scene has to guarantee is the door it tells them to walk through.
   *
   * IDEMPOTENT, which is what makes that safe: on the ordinary path every
   * assignment in here is already true and `openArena(true)` is a visibility
   * flag being set to the value it holds.
   */
  _openTournament() {
    if (!this.quest) return false;
    const was = this.quest.stage;
    this.quest.rodeRyu = true;
    this.quest.stage = 'open';
    for (const ms of MILESTONES) this.quest.spent.add(ms.id);
    this.summonScene.played.satanAnnounce = true;
    this.summonScene.played.satanOpen = true;
    this.world.openArena(true);
    if (this.satan) {
      this.satan.group.visible = true;
      this.satan.moveTo(this.satan.homeAt.x, this.satan.homeAt.y, this.satan.homeAt.z);
      this.satan.setLine('');
    }
    return was !== 'open';
  }

  /**
   * Put the whole world on its side, quietly, the way an afternoon would have.
   *
   * REPORTED FROM PLAY: "having no mischief knocked over and starting the
   * cutscene in debug currently causes major issues during the cutscene
   * playback, so let's just knock it all over before starting the cutscene."
   * It is not a cosmetic mismatch. `FinaleTide.start` takes hold of exactly the
   * props that are `knocked`, so over a standing town it holds NOTHING: the
   * reconstruction beat never runs, the shove has nothing to shove, and
   * `_heap()` — which measures the tightest knot of KNOCKED props — comes back
   * null, so all four of the shots framed on it fall through to the wide shot.
   * Patchfur then says "there is nothing left standing" over a town that is
   * entirely standing, which is the one line in the game it is least possible
   * to get away with.
   *
   * IT LIVES IN `_unlockEndgame` AND NOT IN THE ENDGAME KEY'S HANDLER, for the reason
   * that method already gives about everything else in it: the scene viewer can
   * open the ending too, and an ending that unlocks the endgame but leaves the
   * town upright is the same bug by the other door.
   *
   * SILENTLY. No toast per prop, no `onMischief`, no score storm — 216 props
   * going through the normal path would be 216 toasts and a soundtrack of
   * splintering bamboo. The points are handled above, as an even share of
   * `pointsTotal`, which is what a full clear is worth however it was reached.
   *
   * A POSE EACH, AND IT IS THE SAME RECIPE THE SHOVE USES. `FinaleTide.slam`
   * invents a direction, a tilt and a scatter per prop, and this wants the
   * identical picture for the identical reason — a town where every barrel is
   * lying along the same axis reads as a bug, and the tide SNAPSHOTS whatever
   * pose it finds as the one it will put back. What it must NOT do is look
   * like the pose `Prop.update` settles to (flat on x, square on z), because
   * that is what a prop converges to over about a second and every one of them
   * arriving there at once is the tell.
   *
   * NOTHING IS LOST. `gone` props stay gone and stay hidden — the retirement
   * rule is the whole reason the mischief counter can be trusted — and they are
   * still counted as scored, which they were, on their way over the edge.
   *
   * @returns {number} how many were still standing.
   */
  _wreckWorld(limit = Infinity) {
    const W = this.world;
    const props = W?.props ?? [];
    let standing = 0;
    for (const prop of props) {
      /* STOP BEFORE SCORING, NOT AFTER. `limit` is how many still-standing
         props this call may knock over — the debug panel's batch row asks for
         fifty, and everything else asks for all of them. It defaults to
         Infinity, which is never reached, so the key-6 path through here is
         the same loop it always was, character for character.

         The break is ABOVE `scored` because a prop this call is not going to
         knock over must not be paid for either; the counter and the props have
         to agree, and that agreement is what the whole MISCHIEF number rests
         on. */
      if (standing >= limit) break;
      /* SCORED EITHER WAY. The counter reads `scored`, not `knocked`, and a
         prop that fell off the world was paid for on the way down. */
      prop.scored = true;
      if (prop.gone || prop.knocked || !prop.group) continue;
      standing++;
      prop.knocked = true;
      prop.settleTimer = 9;
      prop.vel.set(0, 0, 0);
      prop.spin.set(0, 0, 0);
      const a = Math.random() * Math.PI * 2;
      const tip = 1.15 + Math.random() * 0.5;
      const away = 0.5 + Math.random() * 1.3;
      const x = prop.home.x + Math.cos(a) * away;
      const z = prop.home.z + Math.sin(a) * away;
      /* ON THE GROUND WHERE IT LANDED, not at the height it was built at. A
         cane that rolled off a step and is hanging in the air is the sort of
         thing that only shows up in the one shot that is eight units from it.
         `heightAt` is null over a gap, which is a prop that would have fallen
         off the world; it keeps its own height rather than being retired,
         because retiring things is `Prop._retire`'s job and not this one's. */
      const g = W.heightAt(x, z);
      prop.group.position.set(x, g ? g.y : prop.home.y, z);
      prop.group.rotation.set(
        Math.cos(a) * tip,
        prop.group.rotation.y + (Math.random() - 0.5) * 0.9,
        Math.sin(a) * tip
      );
    }
    /* AND THE ONE NUMBER THE GIRLS HAVE BEEN WATCHING ALL AFTERNOON. Written
       here rather than through `onMischief`, which is a per-prop path with a
       toast and a scene queue hanging off it. */
    const done = props.filter((p) => p.scored).length;
    const el = document.getElementById('mtotal');
    if (el) el.textContent = `${done} / ${W.mischiefTotal}`;
    /* SHE ADOPTS THE COUNT WITHOUT REMARKING ON IT. `sync`, not `tick`: a save
       taken at three remaining is loaded at three remaining, and shouting
       "Three!" over the load is the elder reacting to something that happened
       yesterday. The map still points, because the map is about where the
       player is now. */
    this.lastHunt?.sync(W.mischiefTotal - done);
    return standing;
  }

  /**
   * Knock over a batch of mischief, coarse at first and fine near the end.
   *
   * Asked for by name: "add to the Debug menu, a way to knock over 50 mischief
   * at a time by pressing a button, once 200 are knocked down, then it will
   * knock down in 5 mischief increments until all of them are knocked down."
   *
   * WHY IT CHANGES GEAR, which is the half of that sentence worth writing
   * down: everything interesting in this game is in the last stretch. The
   * arena opens at 80% (`OPEN_AT`), the elder starts counting at five
   * remaining (`systems/lasthunt.js`) and marks the nearest one at three, and
   * the ending is at 100%. Fifty at a time walks a standing town down to the
   * edge of all that in four presses; five at a time then steps THROUGH it,
   * which is the only way to watch a threshold land rather than jump it.
   *
   * THE COARSE STEP NEVER CARRIES YOU PAST THE SWITCH. 216 props divide into
   * 50s to land on exactly 200, but that is an accident of this world's prop
   * count and the rule has to hold for any of them — so a press from 180 does
   * 20 and stops on the mark rather than 50 and lands at 230, past the fine
   * stretch it exists to reach.
   *
   * IT IS NOT A SECOND WAY TO KNOCK A PROP OVER. `_wreckWorld` is the one
   * implementation, given a ceiling; `_mischiefComplete` is the real 100%
   * trigger, the same one a kitten's katana reaches. This function is a
   * batch size and a toast.
   */
  /**
   * What the batch row says it will do, counted before you press it.
   *
   * THE ROW SAYS THE NUMBER, because the whole feature is that the number
   * changes under you: a row reading "knock over 50" that quietly knocks over
   * 5 is the panel lying about what its own button does, and the panel is the
   * one place in this game where a nine-year-old is being told what a control
   * is for. `_refreshDebugPanel` runs after every row press, so this is
   * re-read on the way out of each one.
   */
  _batchLabel() {
    const props = this.world?.props ?? [];
    const total = this.world?.mischiefTotal ?? 0;
    if (!props.length || total <= 0) return `${BULK_STEP}`;
    const done = props.filter((p) => p.scored).length;
    if (done >= total) return 'the last 0';
    const step = done >= BULK_FINE_AT
      ? BULK_FINE
      : Math.min(BULK_STEP, BULK_FINE_AT - done);
    return `${Math.min(step, total - done)} more`;
  }

  _knockBatch() {
    const W = this.world;
    const props = W?.props ?? [];
    const total = W?.mischiefTotal ?? 0;
    /* A REFUSAL SAYS SO — sixth non-negotiable, and it earns its keep on this
       row more than most: at 216 of 216 the row still looks pressable, and a
       button that does nothing reads as broken rather than as finished. */
    if (!props.length || total <= 0) {
      this.toast('[debug] no world to knock over yet', 0);
      return;
    }
    const done = props.filter((p) => p.scored).length;
    if (done >= total) {
      this.toast(`[debug] all ${total} are already down`, 0);
      return;
    }
    const step = done >= BULK_FINE_AT
      ? BULK_FINE
      : Math.min(BULK_STEP, BULK_FINE_AT - done);
    const did = this._wreckWorld(Math.min(step, total - done));
    const now = props.filter((p) => p.scored).length;
    /* THE SAME 100% EVERY OTHER PATH USES. Player one is credited because the
       Awakening wants a kitten for its toast and this press has none; nothing
       about the world event depends on which one it is. */
    this._mischiefComplete(now, this.players[0]);
    this.toast(`[debug] knocked over ${did} — ${now} / ${total}`, 0);
  }

  /** The scenes the viewer can replay, in the order they happen in a playthrough. */
  /**
   * IN THE ORDER A GIRL ACTUALLY MEETS THEM, which is not the order they were
   * written in and is not what this list used to be.
   *
   * The ending sat fifth, between Ryuuseki and the two Mr. Satan scenes — and
   * it is the LAST thing in the game. Mr. Satan announces the tournament from
   * 50% mischief and opens the arena at 80% (`OPEN_AT` in arenaquest.js); the
   * finale is 100%. So the two of them come BEFORE the ending, and a viewer
   * whose list disagrees with the game teaches its order to whoever reads it.
   * Asked for as "re-organize the remaining scenes to more sensible order";
   * the order the story happens in is the only one that is a fact rather than
   * a preference.
   *
   * AND "GO TO THE ARENA" IS NOT IN HERE ANY MORE. It carried a comment saying
   * it was not a scene, which was the honest half of the argument for keeping
   * it; it is `4` now. See `_goToArena`.
   */
  get _scenes() {
    return [
      { id: 'intro', label: 'opening story' },
      { id: 'shrine', label: 'a clan leader introduces herself' },
      { id: 'found', label: 'all seven stars found' },
      { id: 'summon', label: 'Ryuuseki arrives' },
      { id: 'satanAnnounce', label: 'Mr. Satan announces the tournament (50%)' },
      { id: 'satanOpen', label: 'Mr. Satan opens the arena (80%)' },
      { id: 'finale', label: '100% mischief — the ending' },
    ];
  }

  _pickScene(dir) {
    const list = this._scenes;
    this._sceneIx = ((this._sceneIx ?? list.length - 1) + dir + list.length) % list.length;
    this.toast(`[debug] scene: ${list[this._sceneIx].label}  —  0 to play`, 0);
    this._refreshDebugPanel();
  }

  /**
   * Replay the selected scene, right now, from wherever the game is.
   *
   * EVERY SCENE HERE LATCHES "PLAYED" so it can only happen once — which is
   * correct in a game and useless in a viewer, so this clears the latch first.
   * That is the whole reason this cannot just call the same entry points the
   * game does.
   */
  _playScene() {
    if (this._sceneActive()) { this.toast('[debug] a scene is already running', 0); return; }
    const pick = this._scenes[this._sceneIx ?? this._scenes.length - 1];
    switch (pick.id) {
      case 'intro':
        // `play()` already clears `done` and refuses if it is running.
        this.cutscene.play();
        break;
      case 'shrine': {
        /* The nearest leader to player 1, so the shot has a real subject —
           and `met` is cleared for her only, because that flag is also what
           gates joining her clan and clearing all six would silently undo the
           player's progress through the introductions. */
        const p = this.players[0].position;
        const L = this.leaders
          .filter((x) => x.clan)
          .sort((a, b) => a.position.distanceTo(p) - b.position.distanceTo(p))[0];
        if (!L) { this.toast('[debug] no leader found', 0); return; }
        L.met = false;
        this.shrineScene.start(L, this.players[0]);
        break;
      }
      /* --- THE TWO DRAGON SCENES, WHICH THE VIEWER USED TO GET WRONG BOTH WAYS
         Reported: "The Ryuuseki cutscenes seem to be broken in the Debug viewer
         as, Ryuuseki does not seem to appear when he should and the camera is
         under the ground in the island, instead of by the Torii above the
         ground and showing Ryuuseki."

         BOTH HALVES CAME FROM ONE LINE. The two cases shared a body that aimed
         at `this.ryu?.position ?? B.centre` — and in a debug session there is
         almost never a dragon, so the fallback was `_worldBounds().centre`:
         the middle of the whole archipelago, which is open water between the
         islands and, with a y averaged over the bounding box, BELOW the
         ground. A preview whose subject is a landmark must aim at the landmark.

         SO THEY ARE TWO CASES NOW, because they are two different shots — and
         that is the honest split rather than a tidy-up: `found` is the torii
         with NOTHING above it (see `_onAllBalls`), and `summon` is the dragon,
         who has to exist before there is anything to point at.

         AND THE `summon` PREVIEW REALLY SUMMONS HIM. Same argument as the
         finale preview unlocking the endgame two cases down: the scene is the
         moment he arrives, so a preview that left the world without him would
         be previewing a thing that cannot happen. It toasts, because a debug
         key that changes the world has to say so. */
      case 'found': {
        this.summonScene.played.found = false;
        const at = this._toriiSpot();
        this.summonScene.start('found', new THREE.Vector3(at.x, at.y, at.z));
        break;
      }
      case 'summon': {
        this.summonScene.played.summon = false;
        const had = !!this.ryu;
        if (!this._spawnRyuuseki()) {
          this.toast('[debug] no dragon art loaded — nothing to show', 0);
          return;
        }
        if (!had) this.toast('[debug] Ryuuseki summoned at the torii', 0);
        /* `quad * 0.85`, THE SAME FRAMING THE GAME USES — see
           `_checkSummonScene`, which explains why a worm is not framed off its
           height. It said `RYU_SIZE` here, which is a different number, so the
           preview was never the shot. */
        this.summonScene.start('summon', this.ryu.position.clone(), this.ryu.quad * 0.85);
        break;
      }
      case 'finale':
        /* THE ENDING UNLOCKS THE ENDGAME, WHOEVER STARTED IT. Previewing it
           used to play the words over a world where none of it had happened —
           see `_unlockEndgame`. Done BEFORE `start`, and not on the scene
           finishing, for the reason the whole file keeps giving: the scene is
           skippable on its first frame, so anything hung off the end of it is a
           thing a thumb on Start can throw away. */
        this._unlockEndgame();
        /* And the queue is cleared, or the loop starts a second copy of this
           scene the moment this one closes. */
        this._finaleDue = false;
        this.summonScene.played.finale = false;
        /* THE SAME DOOR THE REAL 100% USES — see `_startFinale`. Previewing
           the ending used to reach `summonScene.start` directly, which is how
           a preview ends up being the one showing of this scene that talks
           over itself. */
        this._startFinale();
        break;
      case 'satanAnnounce':
        this.summonScene.played.satanAnnounce = false;
        if (this.satan) this.satan.group.visible = true;
        this.summonScene.start('satanAnnounce', this.townCentre(), 74, this.satan?.art);
        break;
      case 'satanOpen':
        this.summonScene.played.satanOpen = false;
        this.world.openArena(true);
        this.summonScene.start('satanOpen', this.world.arenaCentre, 96, this.satan?.art);
        break;
      default:
        return;
    }
    this.toast(`[debug] playing: ${pick.label}`, 0);
    this._refreshDebugPanel();
  }

  /**
   * GO TO THE ARENA NOW — debug `4`, and the whole unlock skipped.
   *
   * Reaching the tournament honestly needs seven stars, a ride on Ryuuseki and
   * 80% of a world knocked over — which is right for a player and impossible
   * for anybody checking whether a round card is centred.
   *
   * IT FAST-FORWARDS THE QUEST RATHER THAN CALLING `enterArena` DIRECTLY, so
   * what gets tested is the real path: the griffin, the landing,
   * `Tournament.begin`, all of it.
   *
   * IT WAS THE LAST ROW OF THE SCENE VIEWER and carried a comment admitting it
   * was not a scene. It is a key of its own now — asked for — and the body has
   * not changed a line, so the two ways of reaching it cannot have drifted.
   */
  _goToArena() {
    if (this.tournament?.active) {
      this.toast('[debug] already at the arena', 0);
      return;
    }
    this.world.openArena(true);
    if (this.satan) this.satan.group.visible = true;
    this.quest.stage = 'open';
    this.quest.rodeRyu = true;
    this.enterArena();
    this.toast('[debug] off to the arena', 0);
  }

  /* ------------------------ what the frame costs ------------------------ */

  /**
   * The frame cost, in the corner, on `8`.
   *
   * BECAUSE "IT LAGS" IS NOT A MEASUREMENT AND THIS GAME IS FILL-BOUND.
   * A report of lag on a machine nobody here can see used to leave exactly two
   * moves: guess at a recent change, or ask the player to open a devtools
   * profiler. The first is how a session gets spent reverting work that was
   * never the cause — the maths overlay and the drifting petals were both
   * accused, and both measured innocent — and the second is not a thing to ask
   * of somebody who just wants to play.
   *
   * SO IT PRINTS THE FIVE NUMBERS THAT ACTUALLY DECIDE THE ANSWER, and they are
   * chosen so that one look separates the causes rather than confirming a
   * suspicion:
   *
   *   fps / ms / worst   the complaint, as a number, plus the long frame the
   *                      median hides. A bad median is a budget problem; a good
   *                      median with an ugly worst is a stall.
   *   stutter            whether the frames are EVENLY spaced, which is a
   *                      separate question from whether they are quick, and the
   *                      only one of these numbers that catches a game the fps
   *                      counter is calling healthy while it grinds.
   *   draws / triangles  what the scene is asking for. Flat while the frame
   *                      time climbs means the scene is not what changed.
   *   the buffer         WIDTH x HEIGHT and megapixels — the number that has
   *                      actually moved every time this has been chased. A
   *                      fullscreen 4K panel is four times a 1080p window for
   *                      the same game, and nothing on screen said so.
   *   quality / tier     which is the lever, and whether it is being pulled.
   *   the GPU string     the one that catches a browser that has quietly fallen
   *                      back to software rendering, where every other number
   *                      looks completely normal.
   *   dev or built       a Vite dev server is unminified with a hot-reload
   *                      client attached; a shortcut left pointing at
   *                      `localhost:5173` is a real and invisible cause.
   *
   * It repaints four times a second, not sixty. A readout that measures the
   * frame has to be far too cheap to appear in its own numbers.
   */
  /** @returns the ring slot this frame was written to, so `_tick` can put the
   *  JS cost of the same frame beside it. -1 on the very first frame, which has
   *  no previous timestamp to subtract and therefore no frame time at all. */
  _samplePerf(now) {
    let slot = -1;
    if (this._perfLast) {
      slot = this._perfIx;
      this._perfRing[slot] = now - this._perfLast;
      this._perfIx = (slot + 1) % PERF_WINDOW;
    }
    this._perfLast = now;
    this._autoQualityCheck(now);
    if (this._perfOn && now - this._perfPaint >= 250) {
      this._perfPaint = now;
      this._paintPerf();
    }
    return slot;
  }

  /** The middle frame time in the window, in ms, or 0 before there is one.
   *
   *  Shared by the readout and the auto-downgrade so they can never disagree
   *  about how fast the game is running — a panel saying 58fps while the game
   *  turns itself down would read as the game being broken, and it would be
   *  right to. */
  _frameMedian() {
    /* Unwritten slots are 0 in a preallocated ring and would sort to the front
       and be reported as an infinite frame rate. */
    const s = Array.from(this._perfRing).filter((v) => v > 0).sort((a, b) => a - b);
    return s.length ? s[s.length >> 1] : 0;
  }

  /**
   * Notice that this machine cannot afford the picture it was given, and take
   * it down one step.
   *
   * WHY THIS EXISTS AT ALL: the desktop default went from `medium` to `high` on
   * the strength of one machine getting its GPU sorted out. That is a real fix
   * and it belongs in the default — but it cannot be checked from in here, and
   * a browser on the wrong adapter renders this game at a third of the speed
   * with every other number looking perfectly normal. So the default is
   * optimistic and this is the thing that pays for the optimism.
   *
   * It steps DOWN only, one rung at a time, and never climbs back. Climbing
   * needs hysteresis or the game oscillates between two settings forever, and a
   * picture that changes sharpness every eight seconds is worse than one that
   * is a bit soft — which is the same reason nothing in this game regrows.
   *
   * It refuses to judge a frame it cannot fairly judge: the title screen, a
   * scene that owns the display, a pause menu, or the three seconds after it
   * last changed something. `_sceneActive()` rather than listing the scenes,
   * for the reason that helper exists.
   */
  /**
   * Is this a frame the watcher is allowed to judge at all?
   *
   * LIFTED OUT OF `_autoQualityCheck` SO A CHECK CAN REACH IT, which is the
   * half of this feature no check could see: `autoQualityVerdict` is pure and
   * has a dozen assertions on it, and every one of them is handed
   * `playable: true` or `false` by hand. Whether the ARENA — the heaviest
   * thing the game draws, and the place the downgrade was reported as not
   * happening — answers true was a question nothing had ever asked.
   *
   * It does. A live tournament is `state === 'play'`, is not paused and is not
   * a scene; so are the league and team pickers, and so is the feast.
   * `world-check` pins that now, so nothing can quietly gate the arena out of
   * the one mechanism that makes it playable on a weak machine.
   */
  _autoJudgeable() {
    return this.state === 'play' && !this.paused && !this._sceneActive();
  }

  _autoQualityCheck(now) {
    const { verdict, next } = autoQualityVerdict({
      quality: this.settings.quality,
      medianMs: this._frameMedian(),
      /* A HIDDEN TAB IS NOT A SLOW MACHINE. See the note on `autoQualityVerdict`
         — this is the gate that was missing, and `_discardPerf` is its other
         half. */
      visible: document.visibilityState === 'visible',
      playable: this._autoJudgeable(),
      now,
      badSince: this._autoBadSince,
      notBefore: this._autoNextAt,
    });
    if (verdict === 'reset') { this._autoBadSince = 0; return; }
    if (verdict === 'start') { this._autoBadSince = now; return; }
    if (verdict === 'wait') return;

    /* A HUMAN IS STEERING — SO SAY IT ONCE AND LEAVE IT ALONE.
       Picking a quality in Settings turns this watcher off for the session and
       that rule is right (see the `set-quality` binding: "a setting that gets
       overruled four seconds after you touch it is broken"). What was wrong is
       that it also turned off the game's ability to NOTICE, so a machine that
       cannot afford the picture somebody chose says nothing at all and reads
       as a game that is simply bad — the sixth non-negotiable's case exactly,
       one step removed: a refusal that does not say so.
       The verdict is computed above either way, so this fires on precisely the
       evidence a downgrade would have fired on. Once, ever: a toast that
       repeated every four seconds is the notification a player learns to stop
       reading, and this one is asking her to go and do something. */
    if (!this._autoQuality) {
      this._autoBadSince = 0;
      this._autoNextAt = now + AUTO_GRACE_MS;
      if (this._autoSaidSlow) return;
      this._autoSaidSlow = true;
      this.toast('This is running slowly — Settings ▸ Graphics can turn the picture down', 0);
      return;
    }

    this.settings.quality = next;
    this._applyQuality();
    /* Settings has to agree with the game. A dropdown still reading "High"
       while the game renders `medium` is a lie the next person to open that
       menu will act on. */
    const sel = document.getElementById('set-quality');
    if (sel) sel.value = next;
    this._autoNextAt = now + AUTO_GRACE_MS;
    this._autoBadSince = 0;
    /* SAYS SO, like every other thing this game does on a player's behalf. A
       picture that quietly gets softer reads as the game breaking; the same
       change announced reads as the game helping, and it names where to undo
       it. Invariant 6, applied to something that is not a refusal.

       Capitalised from the value, not from a list of two: a fourth tier added
       to QUALITY_ORDER should appear in this sentence without anyone
       remembering that this sentence exists. */
    const shown = next[0].toUpperCase() + next.slice(1);
    this.toast(`Graphics set to ${shown} so it plays smoothly — change in Settings`, 0);
  }

  /** Throw the frame history away and stand down for a moment.
   *
   *  CALLED WHEN THE TAB COMES BACK, and it is the other half of the visibility
   *  gate. While hidden, `requestAnimationFrame` is throttled to roughly half a
   *  hertz, so the ring fills with 2000 ms samples that describe the browser's
   *  power saving and nothing about this machine. Judging those on the first
   *  visible frame is exactly the bug the gate exists to stop, one frame later.
   *
   *  `_perfLast = 0` makes the next frame write no delta at all, which discards
   *  the enormous gap spanning the hidden period rather than recording it as
   *  one monstrous frame. It also keeps the `P` readout honest after an
   *  alt-tab. */
  _discardPerf(now) {
    this._perfRing.fill(0);
    this._perfJs.fill(0);
    this._perfIx = 0;
    this._perfLast = 0;
    this._autoBadSince = 0;
    this._autoNextAt = now + AUTO_GRACE_MS;
  }

  /** Mean absolute change between CONSECUTIVE frame times, in ms.
   *
   *  Has to walk the ring in the order the frames happened, which is why it is
   *  not computed from the sorted array the other numbers come from — sorting
   *  is exactly what destroys the thing being measured. Oldest sample is the
   *  next slot due to be overwritten; wrap from there.
   *
   *  Pairs where either sample is 0 are skipped rather than counted as a huge
   *  swing: 0 means "not written yet" in a preallocated ring, and the seam
   *  between written and unwritten slots would otherwise report one enormous
   *  jitter spike for the first two seconds after the panel opens. */
  _frameJitter() {
    let sum = 0;
    let n = 0;
    for (let i = 1; i < PERF_WINDOW; i++) {
      const a = this._perfRing[(this._perfIx + i - 1) % PERF_WINDOW];
      const b = this._perfRing[(this._perfIx + i) % PERF_WINDOW];
      if (a > 0 && b > 0) { sum += Math.abs(b - a); n++; }
    }
    return n ? sum / n : 0;
  }

  /**
   * Show the health numbers under every bar in the arena HUD — debug only.
   *
   * WHAT IT IS FOR is the one case the bar physically cannot show: a kitten
   * overflowing at the feast is standing on 110 of a 100 bar, and the bar is
   * as long as it is. It prints what she has, what her ordinary maximum is,
   * how much of it is green, where the mark is, and — the number a round is
   * decided by — her percentage of her OWN bar, capped at 100. Asked for as
   * "a way to debug and make sure this is working correctly".
   *
   * IT SAYS SO WHEN THERE IS NOTHING TO LOOK AT. The HUD only exists during a
   * tournament, so switching this on in the town square is a toggle that
   * appears to do nothing — sixth non-negotiable, and the toast is cheaper
   * than the confusion.
   */
  _toggleOverflowDbg() {
    this._overflowDbg = !this._overflowDbg;
    this.toast(this._overflowDbg
      ? (this.tournament?.state && this.tournament.state !== 'off'
        ? '[debug] health overflow numbers ON — under each bar'
        : '[debug] health overflow numbers ON — they show in the arena HUD')
      : '[debug] health overflow numbers off', 0);
  }

  _togglePerf() {
    this._perfOn = !this._perfOn;
    document.getElementById('perf')?.remove();
    if (!this._perfOn) { this.toast('[debug] frame cost off', 0); return; }
    const el = document.createElement('div');
    el.id = 'perf';
    document.body.appendChild(el);
    /* Zeroed so the first paint is immediate rather than up to 250ms later —
       a readout that takes a moment to appear reads as a key that did nothing,
       which is the one thing every refusal in this game is careful not to do. */
    this._perfPaint = 0;
    this._paintPerf();
  }

  _paintPerf() {
    const el = document.getElementById('perf');
    if (!el) return;
    /* The ring is preallocated, so unwritten slots are 0 and are dropped rather
       than sorted to the front and reported as an infinite frame rate. */
    const s = Array.from(this._perfRing).filter((v) => v > 0).sort((a, b) => a - b);
    if (!s.length) return;
    const mid = this._frameMedian();
    const worst = s[s.length - 1];
    /* HOW UNEVEN THE PACING IS — which is a different complaint from how fast
       it is, and the one that gets described as "the fps is fine but it chugs".

       THIS USED TO COUNT FRAMES OVER 33 ms AND THAT MEASURED THE WRONG THING.
       A hitch is one long frame; stutter is persistent uneven pacing. Frames
       alternating 12/21/12/21 read as a 60 fps median, a 21 ms worst and ZERO
       frames over 33 — a completely healthy readout for a game that is
       grinding every second you watch it. The Dojo's overlay did exactly this:
       identical median with it on and off, and the counter said nothing.

       Mean |dt(n) - dt(n-1)| sees it, because it asks whether each frame
       matched the one before instead of whether any frame was long. Reported
       against the median as well as in ms, since 3 ms of unevenness is
       invisible at 60 fps and ruinous at 144. Measured on this game: about 30%
       is its ordinary noise floor, and the overlay bug ran at 107%. */
    const jitter = this._frameJitter();
    const jpct = Math.round((jitter / mid) * 100);
    /* 40, above the 30% the game idles at, so the ordinary floor is not
       permanently lit up — a warning that is always on is not a warning. */
    const rough = jpct >= 40;
    /* THE JS HALF, AND THE GAP, WHICH IS EVERYTHING ELSE.

       `js` is our update loop and our `renderer.render` calls — the part this
       codebase can fix by writing different code. The GAP is the browser:
       compositing, garbage collection, and above all WAITING FOR THE GPU, since
       `render` only queues commands and the driver blocks at the swap.

         js small,  gap large   -> the GPU or the driver. Fewer pixels, or a
                                   browser that has picked the wrong adapter.
         js large               -> the update loop. Profile it, do not guess.
         both fine, stutter high -> stalls: GC, a texture upload, a shader
                                   compiling on first use. None of these move
                                   a median; all of them wreck the pacing. */
    const js = Array.from(this._perfJs).filter((v) => v > 0).sort((a, b) => a - b);
    const jsMid = js.length ? js[js.length >> 1] : 0;
    const R = this.renderer.info.render;
    const cv = this.renderer.domElement;
    const q = QUALITY[this.settings.quality] ?? QUALITY.medium;
    /* HOW MANY PANES THE SCENE IS DRAWN INTO, because every one of them is
       another full pass over the world and it is the one multiplier a player
       controls without knowing it — two kittens who walk apart cost twice the
       draw calls of two who stay together. */
    const panes = this.groups?.length || 1;
    const dev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;
    el.innerHTML = [
      `<b>${(1000 / mid).toFixed(0)} fps</b> &nbsp; ${mid.toFixed(1)} ms`
        + ` &nbsp; worst ${worst.toFixed(1)} ms`
        + ` &nbsp; <span class="${rough ? 'pf-warn' : ''}">stutter`
        + ` ${rough ? '<b>' : ''}${jitter.toFixed(1)} ms (${jpct}%)${rough ? '</b>' : ''}</span>`,
      `js ${jsMid.toFixed(1)} ms &nbsp; gap ${Math.max(0, mid - jsMid).toFixed(1)} ms`
        + ` &nbsp; <span class="pf-dim">(gap = GPU + browser)</span>`,
      `${R.calls} draws &nbsp; ${Math.round(R.triangles / 1000)}k tris`
        + ` &nbsp; ${panes} pane${panes === 1 ? '' : 's'}`,
      `${cv.width}&times;${cv.height} &nbsp; <b>${((cv.width * cv.height) / 1e6).toFixed(2)}`
        + ` Mpx</b> &nbsp; ratio ${this.renderer.getPixelRatio()}`,
      `${this.settings.quality} &middot; ${this.device.tier}`
        + ` &middot; AA ${this.device.antialias ? 'on' : 'off'}`
        + ` &middot; shadows ${q.shadows ? 'on' : 'off'}`,
      `<span class="pf-dim">${dev ? 'DEV SERVER (unminified)' : 'built'}`
        + ` &middot; ${window.location.host || 'file'}</span>`,
      `<span class="${this._gpuClass() ? 'pf-warn' : 'pf-dim'}">`
        + `${this._gpuClass() ? `&#9888; ${this._gpuClass()} &mdash; ` : ''}`
        + `${this._gpuName()}</span>`,
    ].join('<br>');
  }

  /**
   * Is this the adapter the machine's owner thinks it is?
   *
   * THE QUESTION THAT COST THIS PROJECT TWO SESSIONS. A desktop with an RTX
   * 4060 in it was rendering the game on the CPU's Intel UHD 770, because on
   * Windows a browser gets whichever GPU the OS hands it and Firefox has no
   * preference of its own — `powerPreference: 'high-performance'` is set on the
   * renderer and Firefox does not act on it. Every number on this readout looked
   * ordinary; the only clue was in the driver string, and nobody reads a driver
   * string unless something points at it.
   *
   * So it points at it. Matched against NAMED patterns rather than guessed at,
   * and the worst a false positive can do is put one extra word on a debug
   * overlay, which is the right way round for a check that would otherwise never
   * fire. See docs/notes/performance.md for what to do about it.
   */
  _gpuClass() {
    if (this._gpuCls != null) return this._gpuCls;
    const n = this._gpuName().toLowerCase();
    /* Software first: llvmpipe and SwiftShader are what a browser falls back to
       when it cannot talk to any GPU at all, and they are far slower than the
       weakest real one. */
    this._gpuCls = /swiftshader|llvmpipe|softwarerasterizer|basic render|microsoft basic/.test(n)
      ? 'SOFTWARE RENDERER'
      /* Integrated: Intel's HD/UHD/Iris line, and AMD's iGPUs, which name
         themselves "Radeon(TM) Graphics" or "Vega N Graphics" with no model
         number where a discrete card would put one. */
      : /intel.*(uhd|hd graphics|iris)|radeon\(tm\) graphics|vega \d+ graphics/.test(n)
        ? 'INTEGRATED GPU'
        : '';
    return this._gpuCls;
  }

  /** The GPU as the driver names it. Read once — it cannot change, and the
   *  extension that carries it is a fingerprinting surface a browser is allowed
   *  to refuse, so this degrades to the generic string and then to a word. */
  _gpuName() {
    if (this._gpu) return this._gpu;
    let name = '';
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      name = (ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
        || gl.getParameter(gl.RENDERER) || '';
    } catch { /* refused: the other five numbers are still worth having */ }
    this._gpu = String(name || 'GPU unknown');
    return this._gpu;
  }

  /* ---- the on-screen list, so the keys don't have to be memorised ---- */

  /** What each debug row prints as its key. Separate from the row list so the
   *  panel reads the same on a phone, where the letter is decoration. */
  _toggleDebugPanel() {
    this._debugOpen = !this._debugOpen;
    /* AND OPENING IT IS WHAT ARMS EVERY OTHER DEBUG KEY — see `_debugKey`,
       which refuses them all until this has happened once. Set on the way in
       and never cleared: "opened at least once" is the whole of the rule. */
    if (this._debugOpen) this._debugArmed = true;
    this._refreshDebugPanel();
  }

  _refreshDebugPanel() {
    let el = document.getElementById('debug-panel');
    if (!this._debugOpen) { el?.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'debug-panel';
      document.body.appendChild(el);
    }
    const ix = this._sceneIx ?? this._scenes.length - 1;
    /* EVERY ROW CARRIES ITS OWN KEY CODE, and that is what makes this usable on
       a phone. The panel used to be a printed list of keyboard shortcuts, which
       is exactly as useful as a printed list of keyboard shortcuts is on a
       device with no keyboard — the debug tools were desktop-only by accident
       rather than by decision. A row is now a control: tapping it runs the same
       `_debugKey` the key runs, so there is one implementation and the two can
       never drift. */
    const row = (code, label, on = false) =>
      `<div class="dbg-row${on ? ' on' : ''}" data-debug="${code}">`
      + `<span class="k">${DEBUG_KEY_LABEL[code] ?? ''}</span> ${label}</div>`;

    el.innerHTML = `
      <b>DEBUG</b> <span class="k">\`</span> closes
      ${this._worldReady ? '' : '<div class="dbg-sep">NO WORLD YET — a phone builds it on PLAY. '
        + 'Only 8 works until then.</div>'}
      <div class="dbg-sep">THE AFTERNOON, IN ORDER — 1 to 7</div>
      ${row('Digit1', `knock over ${this._batchLabel()} of the mischief`)}
      ${row('Digit2', 'THE ENDGAME — ending, arena, orbs, purses')}
      ${row('Digit3', 'give EVERY kitten all 8 kotodama')}
      ${row('Digit4', 'go to the arena NOW (skips the whole unlock)')}
      ${row('Digit5', 'Mr. Satan loses his temper (skip the fuse)')}
      ${row('Digit6', 'END this bit — round, ceremony or feast')}
      ${row('Digit7', 'NUDGE it on — 30s, 15s, 5s, next line')}
      <div class="dbg-sep">TOOLS — not a beat of the game</div>
      ${row('Digit8', 'frame cost — fps, draws, pixels, GPU', this._perfOn)}
      ${row('OverflowDbg', 'health overflow numbers under the arena bars',
    this._overflowDbg)}
      <div class="dbg-sep">FOUR PLAYERS, ONE KEYBOARD</div>
      ${row('Backslash', 'force-spawn — ENTER seats 3 &amp; 4 on the keyboard',
    this.input.forceSeats)}
      ${row('KeyR', `WASD &#8594; ${this._keyboardHeldBy(0)}`)}
      ${row('KeyU', `${KEYSETS[1].name} &#8594; ${this._keyboardHeldBy(1)}`)}
      ${TUNING_ROW}
      <div class="dbg-sep">THIS DEVICE — what outlives the tab</div>
      ${row('BoardWipe', `wipe the RECORD BOARD (${this._boardRows()} results)`)}
      ${row('SaveWipe', `wipe the SAVED GAMES (${listSaves().length} of ${saveCap()})`)}
      ${row('DreamWipe', `wipe the DREAM DOJO stars (${this.dream?.progress.count() ?? 0} kittens)`)}
      <div class="dbg-sep">SCENE VIEWER — choose, then play</div>
      ${row('Minus', '&#9664; previous scene')}
      ${row('Equal', 'next scene &#9654;')}
      ${row('Digit0', '&#9654; PLAY THIS SCENE')}
      ${this._scenes.map((sc, i) => `
        <div class="dbg-row dbg-scene${i === ix ? ' on' : ''}" data-scene="${i}">${
          i === ix ? '&#9656;' : '&nbsp;'} ${sc.label}</div>`).join('')}
      <div class="dbg-row dbg-close" data-debug="Backquote">CLOSE</div>`;

    /* Delegated once, on the panel, because `innerHTML` above replaces every row
       each time this runs — per-row listeners would be rebound constantly and
       leak. Guarded so it is attached only once. */
    if (!el._bound) {
      el._bound = true;
      el.addEventListener('click', (e) => {
        const scene = e.target.closest('[data-scene]');
        if (scene) {
          this._sceneIx = Number(scene.dataset.scene);
          this._refreshDebugPanel();
          return;
        }
        /* THE ONE ROW THAT IS NOT A KEY. Everything else in this panel does
           something to the running game; the balance page is a separate
           document you read with both hands, so the row opens a tab and that
           is all it does. Checked before `[data-debug]` because it carries
           neither attribute. */
        const open = e.target.closest('[data-open]');
        if (open) { window.open(open.dataset.open, '_blank', 'noopener'); return; }

        const hit = e.target.closest('[data-debug]');
        if (!hit) return;
        const code = hit.dataset.debug;
        if (code === 'Backquote') { this._toggleDebugPanel(); return; }
        /* EVERY ROW IS A `_debugKey` ACTION NOW, and that is what the two
           exceptions here used to be. `M` and `Z` had rows because they were
           the only way to reach the maths overlay and the map zoom from a
           keyboard — which made two real player controls look like debug
           tools, and forced this handler to call them directly rather than
           through `_debugKey`, since the keydown listener calls both and a row
           routed through it would have toggled twice. They are documented
           keyboard controls now (`npm run docs` writes them into the table),
           so the rows are gone and so is the exception. */
        this._debugKey(code);
        this._refreshDebugPanel();
      });
    }
  }

  /* ------------------------- the dragon hunt ----------------------------- */

  /**
   * Stars picked up, the seventh one calling Patchfur, and the dragon.
   *
   * The counter is SHARED between the two kittens rather than one each. Seven
   * split two ways is three and a half, and a hunt where your sister finding
   * one sets you back is a hunt that ends in an argument — this is the one
   * thing in the game they are explicitly doing together, and the payoff needs
   * both of them on it.
   */
  _updateBalls(dt) {
    for (const b of this.balls) {
      b.update(dt, this.players);
      if (b.taken) continue;
      for (const p of this.players) {
        // Reachable from a dragon too: a star on a rim you can only hover over
        // would be a star you can see and never collect. The locks that DO
        // require two feet on the ground say so themselves, in `canTake`.
        const d = Math.hypot(p.position.x - b.position.x, p.position.z - b.position.z);
        if (d > PICKUP_RADIUS + (p.mount ? 4 : 0)) continue;
        if (Math.abs(p.position.y - b.position.y) > 14) continue;

        /* A REFUSAL HAS TO SAY SOMETHING. Reaching a star and having nothing
           happen is indistinguishable from a broken star, and this hunt now
           has five different ways to be refused — the same rule the shrine
           join button follows. Rate-limited per ball rather than per frame,
           or standing next to a boulder is a toast forty times a second. */
        const verdict = b.canTake(p);
        if (!verdict.ok) {
          if (verdict.why && (this._wardNagT ?? 0) <= 0) {
            this._wardNagT = 3.0;
            this.toast(`${b.stars}★ — ${verdict.why}`, p.index);
          }
          continue;
        }

        b.take();
        this.ballsHeld++;
        this.feats?.onBall(p);
        this._updateBallHud();
        /* The Zelda beat. She stops, lifts it, the camera comes in — and the
           star she holds up is this star's own face, so a kid can see which
           one she just got without reading the toast. */
        p.holdAloft(b.ball.material.map);
        this.aloftShot = { player: p, t: STAR_POSE, dur: STAR_POSE };
        this.sfx('starfound');
        const left = BALL_COUNT - this.ballsHeld;
        this.toast(
          left ? `${p.name} found the ${b.stars}★ dragon ball!  ${left} to go`
            : `${p.name} found the last dragon ball!`,
          p.index
        );
        if (this.ballsHeld >= BALL_COUNT) this._onAllBalls();
        break;
      }
    }
    this._wardNagT = Math.max(0, (this._wardNagT ?? 0) - dt);
  }

  /**
   * Run down the "somebody is holding something up" shot.
   *
   * LIFTED OUT OF THE DRAGON BALL HUNT, where it lived while a star was the
   * only thing that set it. The clan ceremony sets it too now, and a clock
   * ticking at the bottom of `_updateBalls` is a clock the next caller has to
   * go and FIND before they can trust it — the kind of coupling that only
   * shows up as "the camera stayed pulled in forever" long after the change
   * that caused it. Same frame, same order; only the address is different.
   */
  _tickAloftShot(dt) {
    if (!this.aloftShot) return;
    this.aloftShot.t -= dt;
    if (this.aloftShot.t <= 0) this.aloftShot = null;
  }

  /**
   * An attack went off — see whether it broke the ward over a star.
   *
   * Called from `Player._doBreath` and `Player._doClaw` rather than from the
   * ball, because the attack knows its own reach and the ball does not. The
   * kind is matched inside `DragonBall.strike`, so a katana sweeping past an
   * ice shell does nothing at all: there is exactly one answer per lock and
   * finding it is the puzzle.
   */
  strikeWards(player, kind, range) {
    for (const b of this.balls) {
      if (b.taken || b.open) continue;
      const d = Math.hypot(player.position.x - b.position.x, player.position.z - b.position.z);
      if (d > range + 2.5 || Math.abs(player.position.y - b.position.y) > 16) continue;
      if (!b.strike(kind)) continue;
      this.sfx(kind === 'claw' ? 'rockbreak' : 'icecrack');
      this.toast(`${player.name} broke the ${b.stars}★ free!`, player.index);
    }
  }

  /**
   * May this kitten use her clan's arena power right now?
   *
   * A SECOND GATE ALONGSIDE `strikePlayers`, AND IT ASKS THE SAME QUESTION OF
   * THE SAME OBJECT. It exists because a clan power has to be refused BEFORE
   * it starts — the mark, the wait and the rear-back all happen in front of
   * any damage — and `strikePlayers` can only refuse a blow that has already
   * been thrown. What it must never become is a SECOND ANSWER: it reads
   * `Tournament.fighting`, exactly as the strike gate does, so there is no
   * arrangement of the two in which one says yes and the other says no.
   *
   * AND IT IS SILENT OUTSIDE A ROUND ON PURPOSE. ACTION means four other
   * things in the world (`Player._startClanPower` lists them), so this is the
   * one refusal in the clan powers that says nothing at all.
   */
  arenaLive(player) {
    if (!this.tournament?.fighting) return false;
    return !!player && !player.ko && !player.angel;
  }

  /**
   * A marked kitten has just been hit: knock a Kotodama off her.
   *
   * CALLED FROM INSIDE THE STRIKE GATE, on the two paths where a blow is known
   * to have LANDED — the ordinary hit and a Cross Slash's catch. Not from
   * `Player.hurt`, which cannot tell an arena blow from a ring-out, and not
   * from a callback on the mark, which would have to be told about every way a
   * hit can fail to land (a bubble, invulnerability, a partner, a dodge).
   *
   * THE MARK IS SPENT EITHER WAY. She marked, she landed the hit, the promise
   * is kept — and if her sister was wearing nothing by then, that is the
   * gamble, not a refund. `knockLoose` says so out loud rather than leaving
   * the press unexplained.
   */
  _clanStealHit(attacker, target) {
    if (!attacker?.stealMarked || attacker.stealTarget !== target) return;
    attacker._endMark(this);
    const spec = this.kotodama?.knockLoose?.(attacker, target);
    if (!spec) {
      this.toast(`${target.name} had no Kotodama left to lose`, attacker.index);
      return;
    }
    this.toast(
      `${attacker.name} knocked ${spec.kanji} ${spec.name} off ${target.name} — `
      + 'anybody can take it in a moment',
      attacker.index
    );
  }

  /**
   * One kitten's blade reaching the other.
   *
   * THE SINGLE GATE ON PLAYER-VERSUS-PLAYER DAMAGE. `Player._doSlash` calls
   * this on every swing in the game — in the market square, in the bamboo
   * grove, on a mountainside — and this is the only thing standing between
   * that and two sisters able to knock each other down anywhere. It is one
   * `if`, in one function, on purpose: the rule "you may only fight in the
   * ring, during a round" is the sort of thing that gets checked in four
   * places and then quietly missed in a fifth.
   *
   * `Tournament.fighting` is true only while a round is actually LIVE — not
   * during the countdown, not between rounds, not while a scene is up, and
   * not merely because both kittens happen to be standing on the arena
   * island. See Tournament.fighting.
   */
  strikePlayers(attacker, kind, reach, dir, spent = null) {
    if (!this.tournament?.fighting) return;
    const A = ATTACKS[kind] ?? ATTACKS.stand;
    /* The clan buff still multiplies, and the round card shows both badges so
       the asymmetry is visible rather than mysterious. Riverclaw really does
       out-reach an unsworn kitten in here — that is the payoff for having
       flown out and sworn, and the answer to it is to go and get one. What
       must not happen is a girl losing to a reach she cannot see.

       IT DOES NOT REACH THE PANDA'S CLAW. Asked for as "if player has longer
       katana buff, it does not apply to big panda", and it is forced HERE
       rather than by having `_doClaw` hand this a different number, so the
       rule has one owner and cannot be undone by a future caller passing her
       real reach. It is right on its own terms as well: Riverclaw's oath is
       about the blade she is holding, and while she is on a panda she is not
       holding it. */
    /* ...NOR PAYNE'S GOBLIN SWEEP, for a reason of its own: "the attack should
       not scale in length with longer katana abilities or kotodama
       powerups." It is a circle round her feet, not a blade, and a circle that
       grew with every Long Cut orb would stop being the short answer to being
       surrounded and become the best swing in the game. Forced here, like the
       claw, so no caller can hand it a buffed reach by accident. */
    const clanK = (kind === 'claw' || kind === 'sweep') ? 1 : reach / BASE_REACH;
    const range = A.reach * clanK;
    /* Juuji stacks make each of the three cuts hit harder rather than adding
       a fourth. Four cuts is a different move; the same three landing for more
       is the same move, better — which is what a stack should always be.

       AND THE CLAW IS A MULTIPLE OF THE STANDING SLASH rather than a number of
       its own — see `ATTACKS.claw`, which has no `dmg`, and `PANDA.dmgK`. This
       is the one place that can do that multiplication, because it is the one
       place holding both tables. */
    const base = kind === 'claw' ? ATTACKS.stand.dmg * PANDA.dmgK : A.dmg;
    const dmg = base * (kind === 'tri' ? triDmgK(attacker) : 1);

    /* --- DOES THIS SWING REACH THAT BODY? ---------------------------------
       Pulled out of the loop because there are now TWO bodies to ask it about
       and the answer for one decides what happens to the other: a kitten on a
       panda is thrown off only when the blade found HER and missed the animal.
       Both answers therefore have to exist before either is acted on.

       `pad` IS THE ONLY THING A BIGGER BODY GETS. A kitten is a POINT here —
       the range test is against her centre and nothing else — so "much bigger
       hit box" cannot be a scale on anything; it is a radius added to whatever
       the attacker's reach already was. The forward-arc test is NOT padded:
       an animal whose centre is behind you is behind you, and widening that
       would let a swing land on something visibly at her back.

       TWO SEPARATE QUESTIONS: how far away on the ground, and how far apart
       in height. `COMBAT.strikeHeight` was the literal 4.5 here, which is a
       column NINE METRES tall — a kitten on the arena floor cutting one who
       had double-jumped over her head, with no way for the girl in the air to
       read it as anything but being hit from nowhere. It is halved and it is
       on the balance page now; the note on it in player.js has the rest.
       NOT scaled by `clanK`. Riverclaw's blade is LONGER, not taller: a reach
       buff is a statement about how far in front of her the arc goes, and
       letting it grow the vertical window as well would hand the one clan
       that out-reaches you the ability to reach up as well as out. */
    /* `ceiling` IS HOW FAR THE ATTACKER MAY BE *ABOVE* `at` AND STILL CONNECT,
       and it exists for exactly one situation: a kitten sitting on a panda.
       The two of them are one column otherwise — she is physically at the
       animal's feet, inside a hitbox padded wider and taller than she is — so
       no swing could ever find her without also finding it, and the blow that
       knocks a rider off is by definition the one that missed the animal. See
       `PANDA.saddle`, which is where the column is cut. Infinity everywhere
       else, so every other body keeps the symmetric window it had. */
    const reaches = (at, pad = 0, padUp = 0, ceiling = Infinity) => {
      const dx = at.x - attacker.position.x;
      const dz = at.z - attacker.position.z;
      const dy = at.y - attacker.position.y;
      const dist = Math.hypot(dx, dz);
      if (dist > range + pad || Math.abs(dy) > COMBAT.strikeHeight + padUp) return null;
      if (-dy > ceiling) return null;
      // Same forward-arc test the props get, widened for the dash so a charge
      // that visibly connects is not refused on a half-degree of facing.
      const dot = (dx * dir.x + dz * dir.y) / (dist || 1);
      if (dot < A.arc) return null;
      return { dx, dz, dist };
    };
    /* 返 RIPOSTE'S ANSWERS, thrown AFTER this loop and never inside it. An
       answer is a swing, and a swing is a pass through this function; making
       it from in here would nest a second loop over `this.players` inside the
       first, with the first one's `spent` and half-finished panda arithmetic
       still live around it. Queued, it is simply the next swing. */
    const answers = [];

    for (const target of this.players) {
      if (target === attacker || target.ko) continue;
      /* --- ALREADY BITTEN BY THIS ONE, AND NOT YET OFF THE HOOK -------------
         `spent` is passed by exactly one caller: 息 Dragon Breath, whose cone
         is a live hitbox for the whole second it is on screen and may be swung
         round by the girl breathing it. It is the difference between "she can
         turn and catch two of them" and "she can hold a flame on one of them
         and delete her at whatever frame rate the machine manages" — see
         `entities/clanpower.js`, where `BreathTally` owns the whole rule, and
         `Player._sweepArenaBreath`, which opens one and throws it away with the
         flame.

         THIS GATE ASKS IT TWO QUESTIONS AND KNOWS NOTHING ELSE ABOUT IT:
         `has` before a blow, `add` after one that landed. It was a `Set` and is
         now a stamp per body — a flame held on somebody bites her again every
         `DBREATH.tick` — and nothing here had to change for that, which is the
         point of it being a parameter rather than a rule written out in here.

         HER AND HER ANIMAL ARE SPENT SEPARATELY, because they are two bodies
         with two range tests and the cone can genuinely reach one and not the
         other. Folding them into one mark would mean a flame that grazed a
         panda could never afterwards touch the kitten riding it. */
      const doneHer = !!spent?.has(target);
      const doneBeast = !!spent?.has(target.panda);
      /* NO FRIENDLY FIRE, and it is one more clause on the SINGLE gate rather
         than a rule of its own — the whole reason `strikePlayers` exists is
         that there is exactly one place asking whether two kittens may hurt
         each other. A tag-team partner you can cut down is not a partner, and
         with two sisters on a side the first accident becomes an argument about
         whether it was an accident. Free-for-all and duel are unaffected:
         nobody shares a side in either. */
      /* --- WHERE SHE ACTUALLY IS TO A BLADE ------------------------------
         ON A PANDA SHE IS UP ON IT, and that is the whole of the rider fix.
         Riding is ground movement, so `Panda.seatHeight` LIFTS THE DRAWING
         ONLY — her entity stays on the ground where gravity, slope snapping
         and collision expect it, and it says so at length in panda.js. This
         gate is the one place that difference is a lie worth correcting: a
         sister aiming at the girl she can see is aiming four units above the
         point this used to test, and the point this used to test was buried
         inside the animal's own hitbox. `PANDA.saddle` has the arithmetic and
         the report it came from.

         AN OBJECT AND NOT A MUTATION of `target.position`, because that vector
         is the live one the whole game steers by; writing a seat height into
         it for the length of a range test is the kind of borrowed mutation
         that survives until something reads it one frame later. */
      const riding = !!target.panda && target.pandaMount === target.panda;
      const at = riding
        ? {
          x: target.position.x,
          y: target.position.y + target.panda.seatHeight,
          z: target.position.z,
        }
        : target.position;
      /* THE GOBLIN SWEEP ONLY FINDS FEET ON THE GROUND. "The sweep attack
         should only work on players that are touching the ground next to the
         player, if they jump and are in the air, it should not work." It is a
         sweep at ankle height, so jumping it is the counter — and that is what
         makes a full circle fair. A rider is up on her animal, not on the
         ground, so she is out of it too (the animal itself is not). `SWEEP_UP`
         is "next to": a kitten standing on a ledge above her is on the ground
         but not on HER ground. */
      const swept = kind !== 'sweep'
        || (target.onGround && !riding && Math.abs(target.position.y - attacker.position.y) <= SWEEP_UP);
      let found = (doneHer || !swept) ? null : reaches(at);
      /* HER PANDA IS A SECOND BODY IN THE RING, and `fighter` is the whole of
         the question of whether it may be hit: grown, standing, and not
         already knocked down. A cub is never a target — it is the size of a
         house cat and it is the thing a losing kitten runs to, so letting a
         sister cut it down would make the consolation prize the next thing to
         take away.
         A KNOCKED-OUT OWNER'S PANDA IS SKIPPED with her, by the `target.ko`
         line above. Her round is finished; there is nothing to win by hitting
         an animal belonging to somebody already flat on her back. */
      /* ...AND THE ANIMAL STOPS AT ITS OWN SADDLE WHILE SOMEBODY IS ON IT.
         Only while ridden: an animal by itself is one body and keeps the
         generous column it always had, or a jump-slash that visibly lands on a
         panda would start missing it for the sake of a rider who is not
         there. */
      const beast = (target.panda?.fighter && !doneBeast)
        ? reaches(target.panda.position, target.panda.hitRadius, target.panda.hitUp,
          riding ? target.panda.saddleLine : Infinity)
        : null;
      if (!found && !beast) continue;
      const { dx, dz, dist } = found ?? beast;

      /* --- HELD IN SOMEBODY'S CROSS SLASH: NOTHING ELSE TOUCHES HER ---
         She is frozen in the air with three cuts landing on her and a payment
         due at the end of them, and a third kitten wandering past and knocking
         her out of it would delete the whole technique — including the damage
         already banked, which would simply be lost. So while `heldBy` is set
         she is out of everybody's reach except the kitten holding her, and
         even that one only through the cuts themselves.
         The test sits BELOW the range and arc checks for the same reason the
         friendly-fire test does: a swing that misses her must not be told
         anything about her, or a future rule hung off "the swing that hit a
         held kitten" fires on swings that never connected. */
      if (target.heldBy && (target.heldBy !== attacker || kind !== 'tri')) continue;

      /* A PARTNER IS DAZED, NOT SKIPPED — and the test moved DOWN here to make
         that possible. It used to sit above the range and arc checks, which was
         right while the answer was "nothing happens" and is wrong now that
         something does: a swing that misses your partner must not daze her, so
         the hit has to be established first and only then asked who it landed
         on.

         The rule it replaces had no teeth. "No friendly fire" meant the safest
         thing in a tag-team round was to hold attack down and swing through
         everybody, because the swing that hit your partner was free — and it
         made the protection invisible, since you learned it by watching your
         attack do nothing, which reads as the attack being broken. Now it costs
         her half a second of control and it costs you the swing, which is the
         teamwork the league was supposed to be about. */
      if (this.tournament.allies(attacker, target)) {
        /* AND A SWING THAT ONLY BRUSHED HER PANDA IS NOT A SWING AT HER. The
           daze is a cost for hitting your partner; charging it for passing
           within reach of an animal three times her width would make a 2v2
           with a Pandapaw kitten on your side unplayable. */
        if (found && target.daze()) {
          this.sfx('hit');
          this.toast(`${attacker.name} dazed ${target.name} — watch your team!`, attacker.index);
        }
        /* A SWEEPING FLAME DAZES HER PARTNER ONCE, not sixty times a second.
           Without this the one thing a Windwhisker kitten could reliably do
           with her clan power in a tag round is hold her own sister in a
           half-second daze for the length of the cone. */
        if (found) spent?.add(target);
        continue;
      }
      /* --- 返 RIPOSTE: CAUGHT, AND ANSWERED ---
         "If an attack happens during the riposte, within a 180 degree of the
         riposte angle direction (infront of the player doing the riposte and
         not behind them), then the block and automatic attack are executed."
         `Player.parries` is the whole of that question — her window, and the
         half-plane in front of her — and this is the one place it is asked,
         because this is the one place a blow is ever about to be spent.

         BELOW THE PARTNER TEST, ON PURPOSE. A partner's swing is a daze, not
         an attack, and a 2v2 where parrying your own sister answered her with
         a sword would turn the one rule that protects partners into a way to
         hit one.

         ONLY HER BODY IS PARRIED. A kitten in her stance is never riding
         (`_parryFree`), but her grown panda can be standing beside her and be
         inside the same swing; it takes its share as it always did. Every
         KIND of blow is caught — the Cross Slash's catch included, which is
         why this is above that branch: a parried cut holds nobody.

         SPENT, so a Dragon Breath held on her is stopped by the parry for this
         bite and not re-tried on the same frame; the window shuts in
         `riposte`, so the next bite finds her in her answer swing and lands. */
      if (found && target.parries?.(attacker.position)) {
        spent?.add(target);
        answers.push([target, attacker]);
        found = null;
        if (!beast) continue;
      }

      /* --- A CUT OF THE CROSS SLASH CATCHES HER, IT DOES NOT HIT HER ---
         The whole rework is this branch. `hurt` throws her clear, which is
         exactly right for every other attack in the game and exactly wrong for
         this one: the first of three cuts landing meant the other two swung at
         a body that had already gone, and the technique was strictly worse
         than the single slash it cost more to throw. `triCapture` freezes her
         instead and banks the number; `_freeTripleHold` pays all of it at once
         when the last cut has landed and the pause after it has run out. */
      if (kind === 'tri') {
        /* THE CROSS SLASH CATCHES KITTENS AND NOTHING ELSE. It freezes what it
           catches and pays out at the end (`triCapture`), and there is no
           version of that a five-and-a-half-metre animal can be part of: a
           held panda would either be an animal hanging in the air or a rider
           frozen while her mount walked away. So a swipe that found only the
           panda is simply a miss for this one attack. */
        if (!found) continue;
        const nx = dist > 0.001 ? dx / dist : Math.sin(attacker.facing);
        const nz = dist > 0.001 ? dz / dist : Math.cos(attacker.facing);
        if (target.triCapture(attacker, dmg, nx, nz, this)) {
          this.hitSpark(target, 'tri');
          this.sfx('hit');
          /* THIS CUT CONNECTED. Read and cleared by the sequencer around each
             `_doSlash`, and set rather than counted so that one cut catching
             two sisters still counts as one of the three — see
             `Player.triHits`, which decides which cackle she gets. */
          attacker._triLanded = true;
          /* A CAUGHT KITTEN IS A HIT KITTEN. The technique banks its damage
             and pays out later, but the CATCH is the moment the blade found
             her, and a mark that ignored it would make Steal Mischief useless
             to the one kitten in the game who can hold somebody still. */
          this._clanStealHit(attacker, target);
        }
        /* THE BLOCKED CASE MAKES ITS OWN NOISE NOW, inside `triCapture`.
           It used to be an `else if (target.warded)` here playing `wardhit`,
           and that stopped being one sound the moment a blocked cut started
           costing her half the bubble: absorbed, expired and smashed are
           three different things to tell her. `Player._wardTakeHit` picks,
           because it is the thing that knows which happened. */
        continue;
      }

      /* --- THE ANIMAL FIRST, AND THEN HER -------------------------------
         The three outcomes, exactly as they were asked for:

           panda only   the animal takes it and she is untouched.
           BOTH         both take damage, she stays on, and the pair is pushed
                        a third as far as she alone would have flown.
           her only     she takes it in full AND comes off the animal.

         Which one it is has to be decided from `found` and `beast` BEFORE
         anything is spent, because knocking the panda's bar out puts her on
         the ground and would otherwise change the answer half way through.

         AND ALL THREE ARE REACHABLE NOW. The third was not: the rider's body
         sat inside the animal's, so `found` without `beast` could not happen
         and "her only" was unreachable prose. `riding`, above, is the same
         test this line used to make for itself — it is asked once, up where
         the two hitboxes are built, because those are what it decides. */
      const onIt = riding;
      const both = onIt && !!found && !!beast;

      if (beast) {
        spent?.add(target.panda);
        const bit = target.panda.hurt(dmg, attacker.position);
        if (bit) {
          this.hitSpark({ position: target.panda.position, height: target.panda.spec.size }, kind);
          /* ONE NOISE PER BLOW. `Player.hurt` makes its own, so a swing that
             caught both of them would otherwise arrive as two impacts and read
             as a double hit rather than as one landing on something big. */
          if (!found) this.sfx('hit');
          /* UNRIDDEN, THE PUSH GOES ON THE ANIMAL. Ridden it cannot: `carry`
             rewrites the panda's velocity from the rider every frame, so it
             goes on HER instead, below, and the animal shows the blow as a
             flinch (`Panda.recoil`). */
          if (!onIt) {
            const k = A.knock * PANDA.knockK;
            const len = Math.hypot(beast.dx, beast.dz) || 1;
            target.panda.velocity.x += (beast.dx / len) * k;
            target.panda.velocity.z += (beast.dz / len) * k;
          }
        }
      }

      if (found) {
        /* A THIRD OF THE PUSH WHILE SHE IS ON IT, and it is a copy of the
           attack rather than a flag on `hurt`: the knockback rule belongs to
           this gate, which is the thing that knows she is mounted, and `hurt`
           stays a function that spends a number and throws a body. */
        const force = both
          ? { ...A, knock: A.knock * PANDA.knockK, lift: A.lift * PANDA.knockK }
          : A;
        /* READ BEFORE THE BLOW, because the blow is what takes it down. A
           cone eaten by a bubble has still been spent on her — "it can only
           hurt a player once, OR damage their shield once" — and `hurt`
           returns 0 for a blocked hit and for half a second of invulnerability
           alike, which are not the same thing to this tally: the first is the
           flame doing its job and the second is the flame arriving while she
           is still somewhere else. */
        const blocked = target.warded && !force?.pierce;
        const dealt = target.hurt(dmg, attacker.position, force, this);
        if (dealt || blocked) spent?.add(target);
        if (dealt) {
          /* 盗 AND HERE IS WHERE A MARK IS PAID. Inside `if (dealt)` and not
             above it: a swing eaten by a bubble or by half a second of
             invulnerability is not a hit, and taking a Kotodama for one would
             mean the shield she bought stopped the damage and not the theft. */
          this._clanStealHit(attacker, target);
          /* AND THE BLOW THAT FOUND HER AND MISSED THE ANIMAL TAKES HER OFF
             IT. Only that one: a blade that hit both is a blade the panda
             took most of, which is what riding one is for. */
          if (onIt && !beast && target.pandaMount) {
            const mount = target.pandaMount;
            target.pandaMount = null;
            mount.rider = null;
            this.sfx('dismount');
            this.toast(`${target.name} was knocked off ${target.pandaName}!`, target.index);
          }
          /* TWO TALLIES, ONE BLOW. `dmgDealt` is the match, for the record
             board; `roundDmg` is this round, for the tiebreak a round that
             ends level on health falls through to. Incremented together and
             in one place, so they cannot disagree about a hit. */
          attacker.dmgDealt += dealt;
          attacker.roundDmg += dealt;
          this.tournament.onHit(attacker, target, dealt, kind);
        }
      }

      /* LAST, so the collapse cannot change any of the answers above. */
      if (beast && target.panda.hp <= 0) this._pandaDown(target);
    }
    /* THE ANSWERS, and the words. A blow that did nothing reads as broken
       (sixth non-negotiable), so the kitten whose blow was caught is told, as
       an instruction: the parry has a back, and that is the way round it.
       The parrying kitten's own "返 RIPOSTE!" is over her head, where all
       four panes can see it. */
    for (const [who, foe] of answers) {
      this.toast(`${who.name} parried you — get round behind her!`, foe.index);
      who.riposte(foe, this);
    }
  }

  /**
   * A grown panda's bar is empty: it is a cub again, and it stays one.
   *
   * NOT A DEATH AND NOT A LOSS — fourth non-negotiable. `Panda.collapse` puts
   * the rider down and shrinks the animal; this owns the noise, the words and
   * the instruction, which is the sixth: a state a player cannot get out of is
   * a bug, and one she can get out of but is not told how to is the same bug
   * wearing a hat. Three places say it — a toast, a line over her own head,
   * and the clan badge, which then keeps saying it until she does something
   * about it.
   */
  _pandaDown(player) {
    const panda = player.panda;
    if (!panda?.collapse()) return;
    this._pandaPoof(panda);
    this.sfx('pandadown');
    this.toast(
      `${player.pandaName} is a cub again! INTERACT at the Pandapaw shrine to bring it back`,
      player.index
    );
    player.setCallout(`${player.pandaName.toUpperCase()} IS A CUB — PANDAPAW SHRINE`, 6);
    this._updateClanBadge(player);
  }

  /**
   * INTERACT at the Pandapaw hall with a knocked-down panda: it gets up.
   *
   * IT COSTS NOTHING, and that is the ask in its own words — "since we already
   * harvested the 20 bamboo to make it a big panda and no need to do it
   * again". The canes were cut; charging for them twice would be taking away
   * the WORK rather than the animal.
   *
   * IT SAYS NO OUT LOUD ONLY WHEN SHE ASKED FOR SOMETHING. Standing in your own
   * hall pressing interact has always done nothing at all, and turning that
   * into a refusal toast would put a message on screen every time a kitten
   * walks through her own shrine mashing buttons. There is nothing to refuse
   * here: she has not asked for anything the game can identify.
   */
  onPandaShrine(player) {
    if (!player?.panda?.knockedDown) return false;
    this._restorePanda(player);
    return true;
  }

  /** The poof, the noise and the words. Shared by the shrine and by swearing
   *  back to Pandapaw, which are one event with two ways in. */
  _restorePanda(player) {
    const panda = player.panda;
    if (!panda?.restore()) return false;
    this._pandaPoof(panda);
    this.sfx('pandapoof');
    this.toast(`${player.pandaName} is a grown panda again!`, player.index);
    player.setCallout(`${player.pandaName.toUpperCase()} IS BACK`, 4);
    this._updateClanBadge(player);
    return true;
  }

  /** Three rings at once, at three heights. The panda changing size is the
   *  only thing in this game that happens in one frame, so it needs something
   *  in front of it or it reads as the animal being swapped out. */
  _pandaPoof(panda) {
    const h = panda.spec?.size ?? 3;
    for (const k of [0.2, 0.55, 0.95]) {
      this.hitSpark({ position: panda.position, height: h * k * 1.8 }, 'dash');
    }
  }

  /**
   * The same swing, reaching for a snack.
   *
   * A SECOND GATE ALONGSIDE `strikePlayers`, NOT INSIDE IT. The two answer
   * genuinely different questions — "may these two hurt each other" and "is
   * there an animal in reach" — and the first is allowed only during a LIVE
   * round while the second is allowed through the whole tournament, including
   * the feast between rounds, which is the entire point of the feast. Folding
   * them together would mean one of the two rules quietly acquiring the
   * other's timing.
   *
   * It is called from `Player._doSlash` on every swing in the game, exactly
   * like its neighbour, and `Menagerie` answers no everywhere but the ring.
   *
   * `seen` IS ONE ATTACK'S MEMORY, and only the moving hitboxes pass one. The
   * charge tests itself every frame it is live, so without it a rat charged
   * through was struck twenty times by one press — see `Menagerie.strike`. An
   * ordinary swing is one call and passes nothing.
   */
  strikeCritters(attacker, reach, seen = null) {
    if (!this.tournament?.active) return;
    this.menagerie?.strike(attacker, reach, seen);
  }

  /**
   * Is this press the EAT gesture? Asked by the attack button, not by a swing
   * — see `Menagerie.wouldHold` for the two bugs that shaped it.
   *
   * GATED ON THE SAME `tournament.active` AS `strikeCritters`, deliberately:
   * the two answers have to agree, or the button would decline to arm the
   * technique for an animal the swing then refuses to catch.
   *
   * NO `reach` ANY MORE, AND THAT IS THE FIX RATHER THAN A TIDY-UP. It used to
   * take her real reach and hand it to the whole target search, so the radius
   * over which an animal could take her Cross Slash away grew every time she
   * bought a Long Cut orb. The eat gesture is a fixed 3.4 and a standstill;
   * there is nothing left for a reach to mean here.
   */
  critterHold(attacker) {
    if (!this.tournament?.active) return false;
    return !!this.menagerie?.wouldHold(attacker);
  }

  _updateBallHud() {
    const el = document.getElementById('balls');
    if (!el) return;
    /* AND IT GOES AWAY ONCE HE HAS BEEN RIDDEN. "After players talk to and ride
       Ryuuseki, this message should stop appearing." RYUUSEKI IS HERE is an
       errand — go to the torii — and an errand that has been run is a line of
       HUD saying something nobody needs any more, for the rest of the game,
       in the strip under the scoreboard. `rodeRyu` rather than `ryu.ridden`
       because it is the latch: set once, saved, and true after she has climbed
       off again. There is no talking to him without the summoning scene that
       puts him there, so "talked to and ridden" is `rodeRyu` alone.
       Remembered in `_ballsRode` so the frame loop can ask whether it changed
       without repainting the tally sixty times a second. */
    const rode = !!this.quest?.rodeRyu;
    this._ballsRode = rode;
    const up = !(this.ballsHeld === 0 && !this.ryu) && !rode;
    el.classList.toggle('hidden', !up);
    /* TOASTS HAVE TO GET OUT FROM UNDER IT. On a phone both live in the strip
       under the scoreboard, and the tally is the one that APPEARS — so the
       moment a first star was picked up, the toast saying so was drawn behind
       the counter that had just arrived to cover it. The class is on `#hud`
       rather than solved with a sibling selector because `#toasts` comes BEFORE
       `#balls` in the markup, so no sibling combinator can reach backwards. */
    document.getElementById('hud')?.classList.toggle('has-balls', up);
    el.textContent = this.ryu
      ? 'RYUUSEKI IS HERE'
      : `★ ${this.ballsHeld} / ${BALL_COUNT}`;
  }

  /**
   * Hang the dragon-ball tally and the toasts under the scoreboard's REAL
   * bottom edge.
   *
   * REPORTED: "Sometimes, the 'Ryuuseki is here' text is overlaying on top of
   * the top UI for names/score, should be placed where the dragon balls
   * counter was, since that was correct placement of that for the UI."
   *
   * IT IS THE SAME ELEMENT IN THE SAME PLACE — `#balls` has only ever had one
   * `top` — and that is the bug. Every number under the scoreboard in
   * style.css (46, 64, 88, 112, the phone's 44 / 62 / 72) was measured against
   * ONE scoreboard: a single row of badges at a known party size. Measured at
   * 713x422 with four kittens, the row is 38px tall and ends at 52; the tally
   * starts at 46. And a clan WRAPS a badge's label onto a second line, which
   * is the "sometimes": the star counter was on screen before anybody swore
   * anywhere, and RYUUSEKI IS HERE is on screen after — so the counter always
   * looked right and the banner, in the same spot, did not.
   *
   * SO THE STYLESHEET'S NUMBER IS A FLOOR AND THE SCOREBOARD IS MEASURED. Each
   * box is put back on its stylesheet `top`, and pushed down only if that is
   * above the scoreboard's bottom plus `HUD_STACK_GAP` — so a taller row moves
   * everything under it rather than being drawn through. The tally sets the
   * floor for the toasts in turn.
   *
   * TWO PLAYERS ON A DESKTOP ARE BYTE-IDENTICAL (1280x720: nothing written,
   * tally 64, toasts 112). TWO ON A PHONE ARE NOT, AND WERE WRONG: the phone's
   * toasts-under-tally number, 72, assumed a tally about 19px tall; it measures
   * 28 (44..72), so the first toast sat touching its bottom edge. They now
   * start at 78. That is the only two-player number that moves.
   *
   * ON EVENTS, NOT PER FRAME: a ResizeObserver over the scoreboard and the
   * tally, plus the window's resize. See the constructor.
   */
  _stackUnderScores() {
    const sb = document.querySelector('.scoreboard')?.getBoundingClientRect();
    const boxes = ['balls', 'toasts'].map((id) => document.getElementById(id));
    /* NO SCOREBOARD ON SCREEN, NO OPINION. While `#hud` is hidden everything
       measures zero, and a floor of six pixels would pin both boxes to the
       top of the screen for the moment the HUD comes back. */
    if (!sb || !(sb.height > 0)) {
      for (const el of boxes) if (el) el.style.top = '';
      return;
    }
    let floor = sb.bottom + HUD_STACK_GAP;
    for (const el of boxes) {
      if (!el) continue;
      el.style.top = '';
      if (el.classList.contains('hidden')) continue;
      const at = el.getBoundingClientRect();
      if (at.top < floor) el.style.top = `${Math.ceil(floor)}px`;
      floor = Math.max(floor, el.getBoundingClientRect().bottom + HUD_STACK_GAP);
    }
  }

  /**
   * WHERE THE GREAT TORII IS, in one place.
   *
   * It was a literal `{ x: 0, z: -46 }` inside `_onAllBalls`, which was fine
   * while exactly one thing needed it. Three do now — the seventh star's
   * camera, the walk-up that summons him, and the debug scene viewer — and two
   * copies of a landmark's coordinates is how a preview ends up pointing at a
   * different place from the game.
   */
  _toriiSpot() {
    const x = 0;
    const z = -46;
    const g = this.world.heightAt(x, z);
    const y = g ? g.y : 6;
    return { x, y, z, hover: y + HOVER };
  }

  /**
   * Build the dragon and put him at the torii.
   *
   * ONE PLACE, because he is now summoned from two — the walk-up in a real
   * game, and the debug viewer previewing either of his scenes. He cannot be
   * respawned by the game once he exists (there is no second seventh star), so
   * this is also the function a LOAD comes through.
   */
  _spawnRyuuseki() {
    if (this.ryu || !this.ryuArt) return this.ryu;
    const at = this._toriiSpot();
    this.ryu = new Ryuuseki(this.ryuArt, at.x, at.hover, at.z);
    this.scene.add(this.ryu.group);
    this._updateBallHud();
    return this.ryu;
  }

  /**
   * The seventh star: Patchfur speaks. THE DRAGON IS NOT HERE YET.
   *
   * HE USED TO APPEAR ON THIS FRAME, and it made the scene contradict its own
   * words. Reported: "When All Seven Stars cutscene happens, Ryuuseki should
   * not appear, he shouldn't appear until the Ryuuseki Arrives cutscene." The
   * lines are Patchfur saying "Take them to the great torii, both of you. And
   * when the sky goes dark, do not run" — over a shot of the torii with a
   * forty-metre dragon already hanging above it, which answers the errand
   * before she has finished setting it.
   *
   * AND THE ROAR HAS GONE WITH HIM — see `_checkSummonScene`. It used to fire
   * here, on the argument that a noise from somewhere else is the half of the
   * sentence about the sky going dark. Reported from play, and the report is
   * the stronger argument: "when the 7 stars are found, the cutscene plays and
   * there is a big Summon sound, that sound should play when Ryuuseki is
   * summoned in the next cutscene when the player goes to the great torii."
   * `ryuroar` is a second and a half of very low sawtooth and it is the only
   * cue in the game allowed to be that long, because it happens once — and
   * spending it on a scene where the dragon is deliberately NOT on screen is
   * spending the arrival before the arrival. Nothing else moves: this scene
   * still fires on the seventh star and still gives the errand.
   */
  _onAllBalls() {
    const at = this._toriiSpot();
    this._updateBallHud();
    /* The scene is a bonus, not the mechanism. If the voices never loaded the
       walk-up still summons him and he is still rideable — a missing mp3 must
       not be the difference between a summoned dragon and none. */
    this.summonScene.start('found', new THREE.Vector3(at.x, at.y, at.z));
  }

  /**
   * Walking up to the torii with all seven: HE ARRIVES, and then he speaks.
   *
   * THIS IS WHAT MAKES HIM EXIST NOW. It used to ask "has anybody come within
   * 46 of the dragon", which could only be asked because `_onAllBalls` had
   * already built him; the distance is measured to the TORII instead, which is
   * the same number against the same point — he was built standing on it — so
   * nothing about WHEN this fires has moved. Only what is on screen before it.
   *
   * THE SEVEN STARS ARE THE GATE. `played.found` rather than a count: it is set
   * by the scene the seventh star starts, so it cannot be true before the
   * errand has been given, and it survives a load (the save carries `scenes`).
   */
  _checkSummonScene() {
    if (this.summonScene.played.summon || !this.summonScene.played.found) return;
    if (!this.ryuArt) return;
    const at = this._toriiSpot();
    for (const p of this.players) {
      if (!this._canSummonRyu(p, at)) continue;
      if (!this._spawnRyuuseki()) return;
      /* AND HERE IS THE ROAR, on the frame he is built and one line before the
         camera cuts to him. Moved off `_onAllBalls` on the report quoted up
         there; the order matters and is why it sits above `start` rather than
         after it — the sound is the sky going dark, so it wants to be under
         the first frame of the shot rather than arriving behind it. */
      this.sfx('ryuroar');
      /* Framed off his own quad — see SummonScene.start. 0.85 rather than
         the obvious 0.5, because he is a WORM: the drawn creature is only
         about a third of the cell tall but nearly all of it wide, so a
         radius taken from his height puts the camera close enough to crop
         the head off, and the head is the whole shot. */
      this.summonScene.start('summon', this.ryu.position.clone(), this.ryu.quad * 0.85);
      return;
    }
  }

  /**
   * Is this kitten summoning him? Near the torii, ON THE HOME ISLAND, ON HER
   * OWN FEET.
   *
   * Reported: "Ryuuseki shouldn't be summoned unless the player summoning
   * them is on the main island on the ground, not flying." It was a flat
   * 46-unit circle round the torii and nothing else, so a kitten flying a
   * dragon anywhere over it - at any height - called him down from the air.
   * MEASURED: every point in that circle is home ground, so the flying half
   * is the one that was biting; the island half is kept because the rule as
   * Richard said it has both, and a later change to the circle or the island
   * must not quietly bring back a summons from somewhere else. The ritual is
   * walking up to the gate: `onGround` and not carried by anything that flies, and the
   * ground under her is `islands[0]`, which `heightAt` reports even with a
   * bridge deck on top.
   */
  _canSummonRyu(p, at = this._toriiSpot()) {
    if (!p || Math.hypot(p.position.x - at.x, p.position.z - at.z) >= 46) return false;
    if (!p.onGround || p.mount || p.rideAlong || p.carried || p.angel || p.snakeRide) return false;
    const under = this.world.heightAt(p.position.x, p.position.z);
    return !!under && under.island === this.world.islands[0];
  }

  onRyuMount(player, seat) {
    this.toast(
      seat === 'pilot'
        ? `${player.name} takes the reins of Ryuuseki — steer! (one beam)`
        : `${player.name} mans the beams — press ATTACK for all seven!`,
      player.index
    );
    /* Name who has the fan, not just that it exists. The count belongs to the
       SEAT now, so "both aboard, seven beams" would tell the pilot she had
       something she hasn't got. */
    if (this.ryu.duo) {
      this.toast(`Both aboard — ${this.ryu.gunner.name} works the seven beams!`, 0);
    }
  }

  onRyuDismount(player) {
    this.toast(`${player.name} let go of Ryuuseki`, player.index);
    /* No startMusic call here, and none in onRyuMount either. `_updateMusic`
       is the single authority now and it re-decides every frame — a mount
       handler that also sets the track is a second opinion that gets it wrong
       exactly when the two disagree, which is the frame you dismount over a
       different island than the one you took off from. */
  }

  /* ---------------------------- the tournament ---------------------------- */

  /** The middle of the town, for shots that are about the place. */
  townCentre() {
    /* THE WORLD KNOWS. `World.townCentre` is the middle of the market stalls,
       published at the `put()` calls that build them — see world.js. This used
       to be the literal pair (0, 20), which is up the main street rather than
       in the square, and which nothing else in the game could see: the ending
       needed the same answer and had no way to ask for it. */
    const c = this.world.townCentre;
    if (c) return c.clone();
    const g = this.world.heightAt(0, 20);
    return new THREE.Vector3(0, g ? g.y : 4, 20);
  }

  /**
   * Both kittens accept: the griffin picks them up and flies them north.
   *
   * IT TAKES THEM OFF WHATEVER THEY WERE ON FIRST. A kitten who accepts while
   * sitting on her panda would otherwise arrive at the arena still mounted,
   * with a panda standing in the ring and a claw attack instead of a katana —
   * and the round would post her on her mark and leave the animal wherever
   * the ride dropped it. The tournament is fought on foot by both of them,
   * and that has to be true from the moment they board rather than checked
   * again at every place it could go wrong.
   */
  enterArena() {
    if (this.travel) return;
    /* NOT WHILE THE KOTODAMA ARE STILL BEING HANDED OUT. "The players must all
       receive their awards before they can enter the Arena": a griffin taking
       off mid-ceremony would carry the party away from the turns that have not
       happened yet, and the kitten frozen in her blessing pose would be flown
       north holding it. The prompt at Mr Satan says the same thing in his own
       words BEFORE anybody presses anything (see `arenaquest.js`); this is the
       door itself, because the debug key reaches it without passing him. */
    if (this.feats?.ceremonyBusy) {
      this.toast('The Kotodama are still being given out — wait for the ceremony.', 0);
      return;
    }
    for (const p of this.players) {
      if (p.pandaMount) { p.pandaMount.rider = null; p.pandaMount = null; }
      if (p.mount) {
        if (p.mount === this.ryu) this.ryu.pilot = null;
        else { p.mount.rider = null; p.mount.returnHome(); }
        p.mount = null;
      }
      if (p.rideAlong) { this.ryu.gunner = null; p.rideAlong = null; }
    }

    /* ALREADY THERE, SO NO GRIFFIN. "When players are at the arena and Mr.
       Satan is there, he says 'Jump on my griffin' ... then they are on a
       griffin that just flies up and back down because it is flying to the
       arena, but they are already there." A party that walked up Snake Way
       and met him at the doors goes straight in — `_arrive` exactly as the
       ride would have ended, minus the ride, so the league picker and the
       tournament cannot tell the two apart. And it is REMEMBERED, because it
       decides how they leave: out through the doors (`leaveArena`). */
    this.arenaFrom = this.partyAtArena ? 'gate' : 'town';
    if (this.arenaFrom === 'gate') {
      this.travel = 'out';
      this._arrive();
      return;
    }
    const L = this.world.arenaLanding;
    this._ride('out', new THREE.Vector3(L.x, L.y, L.z));
  }

  /**
   * True when every kitten is standing on the arena island — which is what
   * "they are already there" means, and the only party that can meet Mr Satan
   * at the arena's doors.
   */
  get partyAtArena() {
    const isl = this.world?.arenaIsland;
    if (!isl || !this.world.arenaOpen || !this.players.length) return false;
    return this.players.every((p) => !p.mount && !p.rideAlong
      && Math.hypot(p.position.x - isl.x, p.position.z - isl.z) < isl.radius);
  }

  /**
   * The tournament is over. Fly them home — or, if they came in through the
   * front door, walk them back out of it.
   *
   * `cheer` is false when the match was called off rather than finished: a
   * party that quit is put back on the carpet without a parade for a result
   * nobody got. Either way the tournament is torn down HERE, before any scene
   * starts, so skipping the scene cannot leave half of it standing.
   */
  leaveArena({ cheer = true } = {}) {
    if (this.travel) return;
    if (this.arenaFrom === 'gate' && this.world.arenaDoors && this.arenaExit) {
      this.arenaFrom = null;
      const T = this.tournament;
      const winners = new Set(T?.winners ?? []);
      const won = this.players.map((p) => winners.has(p));
      T?.finish();
      this.satanBlast?.reset();
      this.quest.onReturn();
      const on = this.arenaExit.start({
        players: this.players, won, satan: this.satan, scene: this.scene,
        announcer: this.announcer,
      });
      if (on && cheer) return;
      /* No parade: the same marks the parade ends on, now — `finish` is the
         one place those are decided, so a quit cannot land anywhere else. */
      if (on) this.arenaExit.finish();
      this.toast('Back at the arena doors — Mr. Satan will run it again whenever you like', 0);
      return;
    }
    this.arenaFrom = null;
    const t = this.townCentre();
    this._ride('home', new THREE.Vector3(t.x, t.y, t.z + 14));
  }

  /**
   * Called off — put everything back and fly them home.
   *
   * `Tournament.onPartyChanged` has always ended the match this way when
   * somebody joins or drops out mid-tournament, and it called `_goHome`, which
   * DID NOT EXIST. Optional chaining meant it failed silently: the tournament
   * was torn down correctly and the girls were left standing on the deck of an
   * arena three hundred units north with no ring, no announcer and no ride —
   * exactly the "stranded" case `_ride`'s missing-griffin fallback exists to
   * prevent, arrived at from the other direction.
   */
  _goHome() {
    /* Before `finish` forgets who won — a called-off match is no parade. */
    if (this.arenaFrom === 'gate') { this.leaveArena({ cheer: false }); return; }
    this.tournament?.finish();
    this.leaveArena();
  }

  /** True while there is a match to quit — including the two screens that pick
   *  one, which run before `Tournament.begin` and so before `active`. */
  get inMatch() {
    return !!(this.tournament?.active || this.leaguePicking || this.teamPicking);
  }

  /**
   * QUIT THE MATCH — the way out of the ring that was not there.
   *
   * The tournament had exactly two exits: win it, or RESTART, which throws away
   * the whole afternoon's clans, stars, orbs and points. So a pair who picked
   * the wrong league, or whose third player had to go and eat dinner, had to
   * choose between finishing a match they did not want and losing the game.
   *
   * IT CANCELS THE PICKERS TOO. They run before `Tournament.begin`, so a party
   * that paused on the CHOOSE THE LEAGUE screen is in the arena with no
   * tournament to end — and leaving those flags set would fly everybody home
   * and go on feeding all four kittens a dead pad in the town.
   *
   * NOT DURING THE RIDE. The griffin is eight seconds and skippable, and
   * `_ride` refuses a second journey while one is in the air; turning the
   * animal round mid-flight is a state nothing else in this file has to handle.
   */
  quitMatch(to = null) {
    if (!this.inMatch || this.travel) return;
    this.setPaused(false);
    document.getElementById('panel-league')?.classList.add('hidden');
    document.getElementById('panel-teams')?.classList.add('hidden');
    this.leaguePicking = false;
    this.teamPicking = false;
    this.teamPick = null;
    /* WHERE THEY ASKED TO GO, which need not be where they came from: the
       league picker offers both (see `_openLeaguePicker`). `arenaFrom` is
       what `leaveArena` reads to choose the doors or the griffin, so the
       choice is made by setting it. */
    if (to === 'town') this.arenaFrom = 'town';
    else if (to === 'gate' && this._waysOut().includes('gate')) this.arenaFrom = 'gate';
    /* Asked before `_goHome`, which forgets it. The doors say their own. */
    const fromGate = this.arenaFrom === 'gate';
    this._goHome();
    if (!fromGate) this.toast('Match called off — the griffin is taking you back to town', 0);
  }

  /**
   * Put both kittens on the griffin and send it somewhere.
   *
   * A MISSING GRIFFIN MUST NOT STRAND THEM. Every sheet in this game falls
   * back rather than taking the boot down with it, and this one has a sharper
   * failure than most: the arena is 330 units from anywhere and the ride is
   * the only way in or out of it. With no griffin and an early `return`, a
   * pair who reached the tournament could never leave — the results screen
   * would send them home and nothing would happen, forever. So a lost sprite
   * costs the fly-through and nothing else: they simply arrive.
   */
  _ride(dir, to) {
    this.travel = dir;
    if (!this.griffin) { this._arrive(); return; }
    this.griffin.fly(this._centroid(), to, this.players);
    this.sfx('mount');
  }

  /** The griffin has landed. Put them down and hand over. */
  _arrive() {
    const going = this.travel;
    this.travel = null;
    /* Set down side by side rather than both on one point. Two billboards at
       the same coordinates fight the depth sort and read as one flickering
       cat, and the very first thing either girl does on landing is look for
       herself. */
    const spread = 4;
    /* NOT MOVED WHEN THEY WALKED IN. A party that came through the doors is
       standing in front of them, and the tournament posts its fighters itself;
       teleporting them to the griffin's landing first would be a jump cut to
       a place eighteen units behind where they were. */
    const walkedIn = going === 'out' && this.arenaFrom === 'gate';
    for (const [i, p] of this.players.entries()) {
      if (walkedIn) break;
      const at = going === 'out' ? this.world.arenaLanding : this.townCentre();
      const x = at.x + (i === 0 ? -spread : spread);
      const g = this.world.heightAt(x, at.z);
      p.position.set(x, (g ? g.y : at.y) + 0.1, at.z);
      p.group.position.copy(p.position);
      p.velocity.set(0, 0, 0);
      p.camTarget.copy(p.position);
      p.onGround = true;
      p.footClimb = true;
    }
    this._reseedRigs();
    this.clock.getDelta();

    if (going === 'out') {
      this.satan?.moveTo(this.world.arenaBooth.x, this.world.arenaBooth.y, this.world.arenaBooth.z);
      this.satan?.setLine('');
      /* WITH MORE THAN TWO FIGHTERS THERE IS A CHOICE TO MAKE, so it is made
         HERE — standing in the ring, after the griffin, rather than back in the
         town. The ride is eight seconds long and skippable, so a league picked
         before it would be a decision made and then sat on; picked here, the
         answer is one press away from the round card.
         Two players get no picker at all: there is exactly one league they can
         run, and a menu with one item on it is a menu that teaches a kid the
         game has stopped working. */
      const leagues = modesFor(this.players.length);
      if (leagues.length > 1) this._openLeaguePicker(leagues);
      else this.tournament.begin(leagues[0]?.id);
    } else {
      this.tournament.finish();
      /* BEFORE HE MOVES. `reset` reads his position to put the effect away
         over him; run after the teleport it would tidy up in the town square,
         three hundred units from the explosion it is tidying. */
      this.satanBlast?.reset();
      this.satan?.moveTo(this.satan.homeAt.x, this.satan.homeAt.y, this.satan.homeAt.z);
      this.quest.onReturn();
      this.toast('Back in town — Mr. Satan will run it again whenever you like', 0);
    }
  }

  /**
   * A blow landed: throw a spark where it connected.
   *
   * Purely feedback, and it is the third of the three things that say "that
   * hit" — the sound, the flash on the sprite, and this. Any one alone is
   * missable in a scrap where both kittens are moving; a hit that a kid is
   * not sure landed is a control she stops trusting.
   */
  hitSpark(target, kind) {
    if (!this._sparks) {
      this._sparks = [];
      for (let i = 0; i < 6; i++) {
        const m = new THREE.Mesh(
          new THREE.RingGeometry(0.5, 1.5, 12, 1, 0, Math.PI * 1.4),
          new THREE.MeshBasicMaterial({
            color: 0xfff0b0, transparent: true, opacity: 0,
            depthWrite: false, depthTest: false, side: THREE.DoubleSide,
            toneMapped: false,
          })
        );
        m.renderOrder = 26;
        m.visible = false;
        this.scene.add(m);
        this._sparks.push({ mesh: m, t: 0 });
      }
      this._sparkIx = 0;
    }
    const s = this._sparks[this._sparkIx];
    this._sparkIx = (this._sparkIx + 1) % this._sparks.length;
    s.t = 0.26;
    s.big = kind === 'dash' ? 1.5 : kind === 'air' ? 1.3 : 1;
    s.mesh.visible = true;
    s.mesh.position.set(target.position.x, target.position.y + target.height * 0.55, target.position.z);
  }

  _updateSparks(dt) {
    if (!this._sparks) return;
    for (const s of this._sparks) {
      if (s.t <= 0) continue;
      s.t -= dt;
      if (s.t <= 0) { s.mesh.visible = false; continue; }
      const k = 1 - s.t / 0.26;
      s.mesh.scale.setScalar((0.5 + k * 1.5) * (s.big ?? 1));
      s.mesh.material.opacity = (1 - k) * 0.9;
      s.mesh.rotation.z += dt * 6;
    }
  }

  /* ------------------- the triple slash lets go -------------------------- */

  /**
   * Everybody caught in a triple slash, and whether it is over yet.
   *
   * THE RELEASE IS DRIVEN BY THE HOLDER'S STATE, NOT BY A CALLBACK. The
   * sequencer in `Player._stepSpecials` never hands anybody back; this asks
   * every frame whether the kitten holding her is still running the technique,
   * and lets go the moment she is not. That covers the ending everybody thinks
   * of — three cuts and the pause — and, for free, every ending nobody does: a
   * holder knocked out between two cuts, rung out, turned into an angel, or
   * dragged onto a dragon by `_clearSpecials`. A callback would have been one
   * path per ending and one of them would have been missed, and the cost of
   * missing one is a kitten frozen in mid-air with gravity off for the rest of
   * the afternoon. NOTHING MAY BE STRANDED — the watchdog on `heldT` is the
   * floor under even this.
   */
  _updateTripleHolds(dt) {
    let landed = false;
    let freed = 0;
    for (const t of this.players) {
      if (!t?.heldBy) continue;
      t.heldT -= dt;
      const by = t.heldBy;
      const over = !by.triAt || by.ko || by.angel;
      if (!over && t.heldT > 0) continue;
      if (this._freeTripleHold(t)) landed = true;
      freed++;
    }
    if (!freed) return;
    /* ALL THREE, OR IT IS JUST A HIT. The bang and the shake are the reward
       for landing the whole technique — a kid who caught her sister on the
       last cut only gets the throw. Fired ONCE however many kittens went
       flying: four booms on top of each other is mush, and the screen cannot
       shake four times as hard. */
    if (landed) {
      this.sfx('smash');
      this.shakeCameras(0.85, 0.5);
    }
  }

  /**
   * One held kitten, thrown.
   *
   * THE LAUNCH IS AN ORDINARY `hurt`, and reusing it is the point: the percent
   * rule, the knockout test, the white flash, the sound, the damage credit and
   * the invulnerability that follows are all already right in there and none
   * of them wants a second implementation that can drift. The only sleight of
   * hand is the direction — `hurt` computes the push as (target - from), so it
   * is handed a point one unit BEHIND her along the direction the cuts came
   * from, and throws her exactly that way.
   *
   * @returns {boolean} true if she took all three cuts.
   */
  _freeTripleHold(target) {
    const by = target.heldBy;
    const hits = target.heldHits;
    const dmg = target.heldDmg;
    const dx = target.heldDx;
    const dz = target.heldDz;
    /* THE EXPLOSION GOES WHERE SHE WAS, NOT WHERE SHE LANDS. It is the last
       frame of the freeze and the first of the throw at the same time, which
       is what covers the switch: without it a kitten who has hung motionless
       for most of a second simply teleports into a knockback, and the eye
       reads that as a dropped frame rather than as a hit. */
    this._boom(
      target.position.x, target.position.y + target.height * 0.55, target.position.z,
      hits >= CROSS.cuts
    );
    target.releaseHold();
    const from = { x: target.position.x - dx, z: target.position.z - dz };
    const dealt = target.hurt(dmg, from, { knock: CROSS.knock, lift: CROSS.lift }, this);
    if (dealt && by) {
      // Both tallies, for the reason `strikePlayers` gives.
      by.dmgDealt += dealt;
      by.roundDmg += dealt;
      this.tournament?.onHit(by, target, dealt, 'tri');
    }
    return hits >= CROSS.cuts;
  }

  /**
   * A procedural burst: three shells on three axes, blooming outward.
   *
   * THREE AXES BECAUSE THERE IS NO BILLBOARD HERE. Up to four cameras are
   * looking at this from four directions and a flat ring — which is all
   * `hitSpark` is — would be edge-on to at least one of them. A shell on each
   * axis has the same silhouette from everywhere, which is cheaper than
   * turning the thing per view and looks more like a bang than a disc does.
   *
   * Everything is generated. There is no explosion sprite and there is not
   * going to be one: nine rings of `RingGeometry` and a colour ramp is the
   * whole effect.
   */
  _boom(x, y, z, full = false) {
    if (!this._booms) {
      this._booms = [];
      const COL = [0xffffff, 0xffd166, 0xff6b2c];
      for (let i = 0; i < 4; i++) {
        const g = new THREE.Group();
        const rings = [];
        for (let r = 0; r < 3; r++) {
          const m = new THREE.Mesh(
            new THREE.RingGeometry(0.6, 1, 22),
            new THREE.MeshBasicMaterial({
              color: COL[r], transparent: true, opacity: 0,
              depthWrite: false, depthTest: false, side: THREE.DoubleSide,
              toneMapped: false,
            })
          );
          if (r === 1) m.rotation.y = Math.PI / 2;
          if (r === 2) m.rotation.x = Math.PI / 2;
          m.renderOrder = 27 + r;
          g.add(m);
          rings.push(m);
        }
        g.visible = false;
        this.scene.add(g);
        this._booms.push({ group: g, rings, t: 0, big: 1 });
      }
      this._boomIx = 0;
    }
    const b = this._booms[this._boomIx];
    this._boomIx = (this._boomIx + 1) % this._booms.length;
    b.t = BOOM_TIME;
    b.big = full ? 1 : 0.62;
    b.group.visible = true;
    b.group.position.set(x, y, z);
  }

  _updateBooms(dt) {
    if (!this._booms) return;
    for (const b of this._booms) {
      if (b.t <= 0) continue;
      b.t -= dt;
      if (b.t <= 0) { b.group.visible = false; continue; }
      const k = 1 - b.t / BOOM_TIME;
      b.group.rotation.y += dt * 1.7;
      b.rings.forEach((m, i) => {
        /* STAGGERED SO IT BLOOMS RATHER THAN POPS. Three shells starting
           together at three sizes is one thick ring; each starting a beat
           after the one inside it is an explosion, and the difference is
           entirely in these two lines. */
        const lead = i * 0.14;
        const kk = k <= lead ? 0 : (k - lead) / (1 - lead);
        m.scale.setScalar((0.4 + kk * (3.6 + i * 1.2)) * b.big);
        m.material.opacity = kk <= 0 ? 0 : (1 - kk) * (0.95 - i * 0.15);
      });
    }
  }

  /**
   * Shake every camera for a moment.
   *
   * EVERY camera, and that is deliberate rather than lazy. This only ever
   * fires from a live tournament round, where all four kittens are inside a
   * 56-unit ring and every pane is looking at the same fight — so a shake on
   * one screen and not the others would read as one player's game glitching.
   *
   * It is applied as a POSITION offset after `lookAt`, so the whole world
   * translates and the framing is untouched. Rotating the camera instead
   * swings the horizon, which on a fixed isometric view looks like the ground
   * tilting rather than like an impact.
   */
  shakeCameras(amp = 0.8, secs = 0.45) {
    this._shakeAmp = Math.max(this._shakeAmp ?? 0, amp);
    this._shakeMax = Math.max(this._shakeMax ?? 0.001, secs);
    this._shakeT = Math.max(this._shakeT ?? 0, secs);
  }

  _updateShake(dt) {
    if (!(this._shakeT > 0)) return;
    this._shakeT = Math.max(0, this._shakeT - dt);
    this._shakeClock = (this._shakeClock ?? 0) + dt;
  }

  /** The offset for this frame, or null. Read once per rig — see `_updateRig`. */
  _shakeOffset() {
    if (!(this._shakeT > 0)) return null;
    /* Three incommensurate sine rates rather than `Math.random()`. A random
       offset per frame is white noise, which at 60fps reads as the picture
       buzzing; sines at prime-ish rates read as something heavy landing and,
       being continuous, survive a frame rate that is not 60. */
    const t = this._shakeClock ?? 0;
    const k = this._shakeAmp * (this._shakeT / this._shakeMax);
    return {
      x: Math.sin(t * 61) * k,
      y: Math.sin(t * 83 + 1.7) * k * 0.7,
      z: Math.sin(t * 47 + 3.1) * k,
    };
  }

  /**
   * Paint the record board into the pause-menu panel.
   *
   * ONE TABLE PER LEAGUE THAT HAS ANYTHING IN IT. An empty league is left out
   * rather than shown as an empty table: five headed tables with nothing under
   * four of them is a screen that looks broken, and a pair who have only ever
   * fought duels should see the board they have always seen.
   */
  _paintBoard() {
    const el = document.getElementById('board-body');
    if (!el) return;
    const leagues = BOARD_MODES
      .map((m) => ({ mode: m, rows: loadBoard(m) }))
      .filter((L) => L.rows.length);
    if (leagues.length > 1) { this._paintLeagues(el, leagues); return; }
    const rows = leagues[0]?.rows ?? [];
    el.innerHTML = rows.length
      ? `<table class="lb">${rows.map((r, i) => `
          <tr>
            <td class="lb-rank">${i + 1}</td>
            <td class="lb-name">${escapeHtml(r.name)}</td>
            <td class="lb-score">${r.score}</td>
            <td class="lb-detail">${r.wins}W · ${r.dealt} dealt · ${r.taken} taken · ${r.seconds}s</td>
          </tr>`).join('')}</table>`
      : '<p class="lb-empty">Nobody has won the tournament yet.<br>'
        + 'Collect the seven stars, ride Ryuuseki, and knock over 80% of the world.</p>';
  }

  /**
   * Write the afternoon down, if there is one worth writing.
   *
   * IT FAILS QUIETLY AND CARRIES ON. `putSave` writes to localStorage, which
   * throws on a full quota and on a browser in private mode with site data
   * off — and a game that stops dead every thirty seconds because it cannot
   * keep a diary is worse than a game with no diary. Ninth non-negotiable:
   * degrade rather than vanish. The failure shows up where it can be acted
   * on, which is the list saying it is empty.
   */
  /**
   * Write down what this kitten had, against her NAME, for the rest of the
   * afternoon.
   *
   * CALLED WHEN SHE STOPS BEING PLAYED, never on a timer: dropping out, and
   * being swapped away from in the character picker. Those are the two ways a
   * cat leaves the screen while the game carries on, and before this they were
   * also the two ways an afternoon's worth of clan, points and panda went
   * quietly in the bin — the picker one silently, since nothing even dropped
   * her orbs.
   *
   * NOTHING IS REMEMBERED ABOUT A KITTEN WHO DID NOTHING. See `meaningful`:
   * somebody who joined, ran three steps and left again is not part of the
   * afternoon, and putting her on the save row would give a girl reading the
   * list a fourth name she does not recognise.
   *
   * HER ORBS ARE PART OF IT. They were not, once: `_leavePlayer` tipped them
   * onto the ground on the way past and passed `{ orbs: [] }` here, so a girl
   * who came back found her neck empty and eight orbs shared out among
   * whoever had been standing nearest. They now travel with her row, and the
   * way to leave them behind is the DROP HER ORBS button — a decision, made by
   * her, before she goes.
   *
   * @param over fields to write over the top. Nothing in the game passes any
   *   at the moment; it stays because the two callers are two DIFFERENT ways
   *   of stopping being played and the next one may not be like these.
   */
  /**
   * Take a kitten out of the scene — her, and everything orbiting her.
   *
   * ONE FUNCTION, BECAUSE THERE ARE THREE WAYS TO STOP BEING PLAYED and they
   * each used to carry their own copy of the same four lines: dropping out,
   * being swapped for another cat in the character picker, and a restart. The
   * copies had already drifted once — `_leavePlayer` says so at length, about
   * a kitten's worn shells staying in the town after she left — and the second
   * time it drifted it was the picker, reported as orbs "not being deleted
   * while toggling the player and just left hanging in the air".
   *
   * AND THE ORBS GO BY THEIR PARENT, NOT BY THEIR LISTS. `Player.orbRoot` is
   * the bag all three kinds hang in, so this cannot miss one — not the plain
   * Kotodama, not the Powerup constellation, not the gold quest tokens, and
   * not whatever is added next. That is the difference between a fix and a
   * fourth copy of the same four lines.
   *
   * IT DOES NOT REMEMBER HER AND IT DOES NOT SETTLE ANYTHING. Callers do that
   * first, in their own order, because what a leaver is owed is not the same
   * question as what is drawn — see `_rememberPlayer` and `feats.settleOnLeave`.
   */
  _undressPlayer(p) {
    if (!p) return;
    /* Out of a tube first: a kitten leaving the game from inside the
       simulator leaves from her TUBE — her row was already written there by
       `castRow`, via `dreamAnchor` — and takes her puppet with her. */
    if (this.dream?.stateOf(p.index)) this.dream.drop(p.index);
    this.scene.remove(p.group);
    if (p.orbRoot) this.scene.remove(p.orbRoot);
  }

  _rememberPlayer(p, over = {}) {
    if (!p?.style?.name) return false;
    const row = { ...castRow(p, false), ...over };
    /* A CAT PASSED OVER IN THE PICKER HAS NOT BEEN PLAYED YET. Scrolling
       through the cats seats each in turn and writes each back as she goes,
       from the join spot she was shown at — which would spend a loaded
       kitten's saved place on a girl who only looked at her. Until the pick
       is confirmed, her row keeps the save's own spot. */
    const prev = this.sessionCast.get(p.style.name);
    if (prev?.fromSave && this.picking?.index === p.index) {
      row.fromSave = true;
      row.at = prev.at;
      row.facing = prev.facing;
    }
    if (!meaningful(row)) return false;
    this.sessionCast.set(p.style.name, row);
    /* AND HER ANIMAL IS PARKED, NOT DROPPED. See `_parkedPandas`: the row above
       is data and a panda is a live object with meshes in the scene, so the two
       halves of "she is remembered" live in two places and both have to happen
       here — this is the one function both ways of stopping being played go
       through. `_recallPanda` is the other end. */
    if (p.panda) {
      p.panda.rider = null;
      p.pandaMount = null;
      this._parkedPandas.set(p.style.name, p.panda);
    }
    return true;
  }

  /**
   * Put her panda back: adopt the one that was waiting, or build the one the
   * save described.
   *
   * TWO CALLERS AND THEY ARE GENUINELY DIFFERENT. A REJOIN (or a swap back in
   * the character picker) finds the real animal parked in `_parkedPandas` and
   * simply hands it over — same meshes, same tier, standing where it was. A
   * LOAD has nothing parked, because `restore` runs `restart()` first and that
   * takes every panda in the world out of the scene, so there the save's own
   * record is all there is.
   *
   * WHY THE SAVE IS BELIEVED ABOUT THE TIER. `_updatePanda` cannot re-derive
   * it: growth is charged from `pandaFedFrom`, which a grown panda has already
   * spent, so replaying the rule over a restored tally yields a CUB every time.
   * That is the bug this whole function exists for — see `castRow`'s `panda`.
   *
   * AND IT DEGRADES RATHER THAN VANISHING. A v1 row, or any row written before
   * `panda` existed, has `saved === null` — and then the old rule runs after
   * all (`_updatePanda`), which gives her a cub rather than nothing. A cub is
   * wrong; no animal at all, in a world where bamboo does not regrow, is
   * unrecoverable.
   *
   * @param saved the row's `panda` record, or null
   */
  _recallPanda(player, saved = null) {
    if (!player) return false;

    const parked = this._parkedPandas.get(player.style?.name);
    if (parked) {
      this._parkedPandas.delete(player.style.name);
      /* THE ANIMAL FOLLOWS THE KITTEN AND NOT THE SEAT. `owner` is read every
         frame for `follows`, for the badge and for the lick, and it is pointing
         at a `Player` that was spliced out of the game — leaving it would be an
         animal trotting after somebody who is not there. */
      parked.owner = player;
      parked.rider = null;
      player.panda = parked;
      player.pandaMount = null;
    }

    if (!player.raisedPanda) {
      /* SHE HAS NO PANDA IN THIS WORLD. Only reachable when a row says so —
         a restart clears `raisedPanda` and the row is what puts it back — and
         it has to take the meshes with it, or a load into an un-sworn kitten
         leaves an animal standing in the town with nobody it belongs to. */
      if (player.panda) {
        this.scene.remove(player.panda.group);
        player.panda = null;
      }
      this._updateClanBadge(player);
      return false;
    }

    if (!player.panda) {
      if (!saved) {
        // No record of the animal: the old rule, which gives her a cub.
        this._updatePanda(player);
        return !!player.panda;
      }
      const tier = Math.max(0, Math.min(PANDA_TIERS.length - 1,
        Math.floor(saved.tier ?? 0)));
      const panda = new Panda(this.pandaArt, { owner: player, tier });
      /* A PANDA BUILT AFTER THE ENDING STILL KNOWS THE ENDING HAPPENED.
         `_startFinale` stamps the party it can see, and this is the one path
         it cannot: a sister recalled from `sessionCast`, or a save loaded in
         the minutes after 100%, builds a fresh animal whose `endgame` would
         be the constructor's `false`. The scene's own `played` flag is the
         honest source — it survives a load, which is exactly the case this
         line is for. */
      panda.endgame = !!this.summonScene?.played?.finale;
      this.scene.add(panda.group);
      player.panda = panda;
    } else if (saved && Number.isFinite(saved.tier)) {
      player.panda.setTier(Math.max(0, Math.min(PANDA_TIERS.length - 1,
        Math.floor(saved.tier))));
    }

    /* KNOCKED DOWN IS A FACT AND NOT A SIZE. A collapsed panda is a cub that
       must STAY one until the shrine, and `_updatePanda` only knows that
       because of this flag — without it the next cane she cuts would find the
       debt long paid and silently grow the animal back, which is the one thing
       "stays baby panda for the rest of the game" was written to stop. */
    if (saved) player.panda.knockedDown = !!saved.down;

    /* WHERE IT WAS STANDING, ON GROUND THAT IS ACTUALLY THERE. The recorded
       point is trusted for x/z and the height is re-asked of the world, which
       is the same trade the props make: a save describes what the PLAYERS did,
       never the terrain, and a y from a build with different ground would bury
       the animal or hang it in the air. Degrades: no `at`, and it simply stands
       where it was built, beside her. */
    const at = saved?.at;
    if (Array.isArray(at) && at.every(Number.isFinite)) {
      const g = this.world.heightAt(at[0], at[2]);
      player.panda.position.set(at[0], g ? g.y : at[1], at[2]);
      player.panda.group.position.copy(player.panda.position);
    }
    this._updateClanBadge(player);
    return true;
  }

  /**
   * ...and hand it all back when somebody plays her again.
   *
   * THE ROW IS NOT CONSUMED. She may drop out and rejoin four times in an
   * afternoon, and each leave writes a fresh row over this one — so keeping it
   * costs nothing and removing it would mean a girl who rejoined, did nothing
   * and left again came back to an empty kitten.
   *
   * SHE GETS HER ORBS BACK TOO, and that is the whole of the change. What she
   * had on when she stopped being played is what she is wearing again a
   * heartbeat after somebody picks her up: "if they rejoin, they will have
   * their kotodama orbs". They were never in the world while she was away —
   * `_leavePlayer` no longer drops them — so this is handing back a reservation
   * rather than minting a copy, and twenty-six stays twenty-six.
   *
   * UNLESS SHE PUT THEM DOWN HERSELF. The DROP HER ORBS row takes them off her
   * BEFORE `_rememberPlayer` runs, so a row written after it honestly says she
   * had none, and the orbs are pickups in the town that a save records by
   * position. Either way there is exactly one copy of each orb and exactly one
   * place it is.
   */
  _recallPlayer(p) {
    const row = this.sessionCast.get(p?.style?.name);
    if (!row) return false;
    applyCast(this, p, row);
    return true;
  }

  /**
   * A kitten sitting down out of a loaded save goes back where the save had
   * her — ONCE. See `fromSave` in `restore`: the rows still waiting for a
   * seat when a save was loaded carry it, and a girl who dropped out and came
   * back later does not, so she still lands beside the party.
   *
   * AT THE PICKER'S CONFIRM, not at the seat. A join seats a cat and then
   * lets her scroll to another, and every cat on the way is a re-seat; the
   * place belongs to the one she chose.
   *
   * THE LOAD'S OWN NUMBERS, exactly as `restore` places the seated ones, so a
   * kitten loaded now and one loaded a minute later stand where one save says.
   */
  _placeFromSave(p) {
    const row = this.sessionCast.get(p?.style?.name);
    if (!row?.fromSave) return false;
    row.fromSave = false;
    const at = row.at;
    if (!Array.isArray(at) || at.length !== 3 || !at.every(Number.isFinite)) return false;
    p.position.set(at[0], at[1], at[2]);
    p.group?.position.copy(p.position);
    p.camTarget?.copy(p.position);
    p.velocity?.set(0, 0, 0);
    if (Number.isFinite(row.facing)) p.facing = row.facing;
    return true;
  }

  /**
   * Write the afternoon down NOW, because something happened that the
   * thirty-second timer would otherwise round away.
   *
   * ASKED FOR ABOUT DROPPING OUT — "we can do an autosave when the player drops
   * out to save the state of the amount of players and where the kotodama orbs
   * are" — and that is exactly the shape of change the clock is bad at. A
   * kitten leaving changes two things a save is made of at once: who is in the
   * party, and where twenty-six orbs are. Up to twenty-nine seconds of that
   * sitting unwritten is up to twenty-nine seconds in which closing the tab
   * loses a girl's whole neck, or brings back a kitten who left.
   *
   * IT STILL RESPECTS THE FIVE-MINUTE GATE. A game two minutes old has no row
   * in the list yet, deliberately — "shouldn't start auto-saving until after
   * the player has played for more than 5 minutes" — and a drop-out is not a
   * reason to go behind that. Somebody joining and leaving in the first minute
   * is the single most likely way to get a row full of nothing.
   *
   * AND IT PUSHES THE NEXT ONE OUT. Without this, a drop-out at t+299 is
   * followed by the ordinary autosave a second later: two writes for one state,
   * and the interval quietly becoming "whenever" rather than thirty seconds.
   */
  _saveOnPartyChange() {
    if (this.state !== 'play' || this.playT < AUTOSAVE_AFTER) return false;
    this._saveAt = this.playT + AUTOSAVE_EVERY;
    this._autoSave();
    return true;
  }

  _autoSave(opts = {}) {
    try {
      const snap = snapshot(this);
      if (snap) putSave(snap, opts);
    } catch (err) {
      /* ONCE, NOT EVERY THIRTY SECONDS. A console filling with the same line
         for four hours hides everything else in it. */
      if (!this._saveBroke) console.warn('[saves] could not write', err);
      this._saveBroke = true;
    }
  }

  /**
   * THE LIST, AND WHAT A ROW HAS TO SAY.
   *
   * "People should be able to find the save they want based on some of the
   * information shown in the save list (like how many players, whether arena
   * is unlocked, each players kotodama orbs equipped etc.)" — so a row leads
   * with WHO, in their own colours, wearing the kanji of the orbs they had on,
   * and then says how far the town had come down and what was open. The
   * timestamp is last. A slot number appears nowhere: it is the one fact about
   * a save that nobody can recognise.
   *
   * A STALE ROW IS SHOWN AND SAYS WHY. It is still a `.menu-btn` and MenuNav
   * still walks onto it, because a row a cursor skips over is a row that has
   * silently disappeared — pressing it toasts the reason instead of loading.
   * Sixth non-negotiable.
   */
  _paintSaves() {
    const el = document.getElementById('saves-body');
    const note = document.getElementById('saves-note');
    if (!el) return;
    el.textContent = '';
    let rows = [];
    try {
      rows = listSaves().map((snap) => describe(snap, this.world));
    } catch { rows = []; }

    if (!rows.length) {
      const p = document.createElement('p');
      p.className = 'lb-empty';
      /* THE FIVE MINUTES IS THE WHOLE SENTENCE NOW. It used to end "and SAVE &
         QUIT GAME saves one whenever you leave", which stopped being true the
         day that button started refusing short games — and this is the screen
         somebody reads when they are wondering where their save went. */
      p.textContent = 'No saved games yet. The game starts keeping one by '
        + `itself every ${AUTOSAVE_EVERY} seconds, once you have been playing `
        + `for ${Math.round(AUTOSAVE_AFTER / 60)} minutes — and SAVE & QUIT GAME `
        + 'saves one when you leave, once you are past those same minutes.';
      el.appendChild(p);
      if (note) note.textContent = '';
      return;
    }

    const kanji = (ids) => {
      /* THE SAME GLYPH THE ORB ITSELF WEARS. Eight orbs and four kittens is
         thirty-two words on a row nobody would read; it is four characters per
         kitten in the colours she saw them in, which is how she recognises her
         own setup from across the room. Stacks count, so three 疾 means three. */
      const seen = ids.map((id) => POWER_ORBS.find((o) => o.id === id))
        .filter(Boolean);
      if (!seen.length) return '<span class="sv-none">no orbs</span>';
      return seen.map((o) =>
        `<span class="sv-orb" style="color:#${o.color.toString(16).padStart(6, '0')}"`
        + ` title="${escapeHtml(o.label)}">${o.kanji}</span>`).join('');
    };

    rows.forEach((r) => {
      const b = document.createElement('button');
      b.className = `menu-btn sv-row${r.stale ? ' sv-stale' : ''}${r.kept ? ' sv-kept' : ''}`;
      b.dataset.save = r.id;
      const who = r.players.map((p) => {
        const st = PLAYER_STYLE.find((x) => x.name === p.style);
        const col = st ? cssFor(st) : '#fff';
        /* A KITTEN WHO HAD GONE HOME IS STILL ON THE ROW, dimmed and marked.
           She is part of the afternoon — that is the whole point of keeping
           her — but a row that listed her identically to the two girls holding
           controllers would be answering the wrong question. `title` carries
           the long form for a mouse; the dot is what reads at a glance. */
        return `<span class="sv-kit${p.here ? '' : ' sv-away'}" style="color:${col}"`
          + `${p.here ? '' : ' title="played earlier — rejoin as her to pick it up"'}>`
          + `<b>${escapeHtml(p.style)}</b>`
          + (p.here ? '' : '<i class="sv-off">·away</i>')
          + (p.clan ? `<i class="sv-clan">${escapeHtml(p.clan)}</i>` : '')
          + `<span class="sv-orbs">${kanji(p.orbs)}</span></span>`;
      }).join('');
      /* TWO NUMBERS WHEN THEY DIFFER, ONE WHEN THEY DO NOT. Asked for as "how
         many players have logged in and played in that play session, versus
         just how many are currently logged in" — but "4 kittens, 4 playing" on
         every row of a list five rows long is noise that hides the one row
         where it matters. */
      const bits = [
        r.seated === r.party
          ? `${r.party} kitten${r.party === 1 ? '' : 's'}`
          : `${r.party} kittens, ${r.seated} playing`,
        r.mischief == null ? null : `${r.mischief}% mischief`,
        r.balls ? `${r.balls}/7 stars` : null,
        r.arena ? 'arena open' : null,
      ].filter(Boolean);
      b.innerHTML = `<span class="sv-who">${who}</span>`
        + `<span class="sv-what">${bits.join(' · ')}</span>`
        + `<span class="sv-when">${escapeHtml(r.when)} · ${escapeHtml(r.played)} played`
        /* KEPT SAYS SO ON THE ROW — see `MAX_KEPT`. A list that deletes some
           games and not others has to show which are which, or it reads as
           random. */
        /* THE STAR AND THE WORDS ARE TWO ELEMENTS, because they are two
           colours now — gold star, black-on-gold words. See `.sv-keep`. */
        + (r.kept
          ? ' · <span class="sv-star">★</span>'
            + '<b class="sv-keep">kept — you saved it</b>'
          : '')
        + (r.stale ? ' · <b>from a different version of the game</b>' : '')
        + '</span>';
      b.addEventListener('click', () => this._askLoadSave(r));
      el.appendChild(b);
    });

    if (note) {
      /* THE CAP, NOT THE COUNT. It said "the last 4 of these" while four were
         showing, which is a sentence that teaches somebody the wrong rule the
         moment a fifth appears — and the fact worth knowing here is precisely
         the one the list cannot show you: that the oldest is about to go. */
      /* "ONE ROW PER GAME" IS THE FACT THE LIST CANNOT SHOW YOU, and it is
         the one that was wrong: the first version wrote a new slot every
         thirty seconds, so all five filled with the same afternoon inside
         three minutes. Saying it here is how somebody knows their Tuesday is
         safe while they play on Thursday. */
      /* AND THE KEEP RULE, because it is the other thing the list cannot
         show: why one old row survives while a newer one went. */
      const mins = Math.round(AUTOSAVE_AFTER / 60);
      note.textContent = `One row per game, kept up to date every`
        + ` ${AUTOSAVE_EVERY} seconds once you have played for ${mins} minutes.`
        + ` The list holds ${MAX_SAVES} and the oldest drops off the bottom —`
        + ` except a ★ kept game, which SAVE & QUIT GAME makes of any game`
        + ` ${mins} minutes long. Keep more than ${MAX_SAVES - 1} and the list`
        + ` grows, up to ${MAX_LIST}. Loading one ends the game you are playing`
        + ` now, saving it first if it is ${mins} minutes long.`;
    }
  }

  /**
   * Load it — after asking, because it throws the current afternoon away.
   *
   * SEVENTH NON-NEGOTIABLE, and this is the strongest case for it in the
   * game: the thing on the other side of this button is four hours of
   * somebody else's work, and the button is in a menu four children are
   * pushing at. The dialog has no `.primary`, so the cursor opens on "no".
   */
  _askLoadSave(row) {
    if (row.stale) {
      this.toast('That save was made by a different version of the game.', 0);
      return;
    }
    /* SAYS WHETHER THE GAME BEING LEFT IS SAVED FIRST — see `_loadSave`. */
    const savesFirst = this._saveBeforeLoad(row.session);
    /* AND FROM THE TITLE SCREEN THERE IS NO GAME TO END. The two sentences
       above both open "the game you are playing now", which is the one thing
       that is not true on the route this button arrived by — a dialog that
       describes the wrong outcome is worse than one that describes none (the
       same rule the DROP OUT dialog states). It is still a question, and the
       cursor still opens on no: a girl who meant PLAY and hit LOAD is one
       press from being back where she was. */
    const playing = this.state === 'play';
    this.confirm.ask({
      title: 'LOAD THIS SAVED GAME?',
      body: (playing
        ? (savesFirst
          ? 'The game you are playing now is saved first, and then it ends — '
          : 'The game you are playing now ends — ')
        : 'The game starts from this save instead of from the beginning — ')
        + 'every prop, orb, clan and star goes back to how it was in the save. '
        + 'The record board is kept.',
      no: 'NO, KEEP PLAYING',
      yes: 'YES, LOAD IT',
      onYes: () => this._loadSave(row.id),
    });
  }

  /**
   * Is the game being left worth writing down before a load throws it away?
   *
   * Asked for as "the current play session should auto-save when Loading a new
   * play session, that is, if past the 5 minutes of play requirement for
   * auto-saving." So: the same five-minute gate as every autosave, and —
   *
   * NOT WHEN SHE IS LOADING THIS VERY GAME. Loading the row for the afternoon
   * she is playing is "take me back thirty seconds", and saving first would
   * write the present over the row she chose and then load the present back.
   */
  _saveBeforeLoad(session) {
    return this.state === 'play' && this.playT >= AUTOSAVE_AFTER
      && session !== this.sessionId;
  }

  _loadSave(id) {
    const snap = listSaves().find((r) => r.id === id);
    if (!snap) { this.toast('That save is gone.', 0); return; }
    /* THE GAME BEING LEFT, WRITTEN DOWN FIRST — sparing the row being loaded,
       so that write cannot push the chosen afternoon off the list under the
       load. `snap` is already in hand, so the load itself is safe either way;
       sparing it is about the list still showing it afterwards. */
    if (this._saveBeforeLoad(snap.session)) this._autoSave({ spare: snap.id });
    let out;
    try {
      out = restore(this, snap);
    } catch (err) {
      /* A HALF-LOADED WORLD IS THE ONE OUTCOME WORSE THAN A REFUSED LOAD, and
         `restore` starts with `restart()`, so what is standing after a throw is
         a clean opening world rather than a mixture. Say so and drop the save:
         a row that crashes the game every time it is pressed is a row that has
         to stop being offered. */
      console.warn('[saves] could not load', err);
      dropSave(id);
      this.toast('That save could not be loaded, so it has been removed.', 0);
      this._paintSaves();
      return;
    }
    this._saveAt = this.playT + AUTOSAVE_EVERY;
    for (const pid of [...SUB_PANELS, 'panel-pause']) {
      document.getElementById(pid)?.classList.add('hidden');
    }
    this.setPaused(false);
    /* LOADED FROM THE TITLE SCREEN, WHICH IS A SECOND WAY IN. The pause menu's
       route arrives here with the world already live and this does nothing; the
       title's route arrives with the HUD hidden, no audio context and
       `state === 'title'`, and without this the save would load perfectly into
       a game nobody could see. `_enterPlay` and NOT `startPlay`: a loaded
       afternoon must not replay the intro over the top of itself, and must not
       stop to ask about the trailer.

       AND NO INTRO: this is an afternoon somebody was already halfway
       through — the save itself carries which scenes have played
       (`snap.scenes`), and the opening narration is not one a girl resuming
       her afternoon should sit through. `startPlay` is the only door to it. */
    if (this.state !== 'play') {
      this._enterPlay();
      this.audio.startMusic(this._wantedTrack(0) ?? 'play');
    }
    /* HOW MANY KITTENS DID NOT GET A SEAT, SAID OUT LOUD — and said as
       WAITING rather than as lost, because that is now what it is. Every
       unseated row sits in the session's cast, so a third controller or a swap
       in the character picker hands that kitten her whole afternoon back. A
       load that quietly seated two of four would read as a save that had only
       kept two, which is the silent failure invariant 6 is about. */
    this.toast(out.waiting
      ? `Loaded — ${out.seated} back. ${out.waiting} more waiting: join or `
        + 'switch to that kitten to pick her up.'
      : 'Saved game loaded!', 0);
  }

  /**
   * Which league are we fighting? Shown only when the party can run more
   * than one.
   *
   * IT GOES THROUGH `MenuNav` LIKE EVERY OTHER MENU, so a stick moves the
   * highlight and any player may choose — the same rule the pause menu follows,
   * and for the same reason: there is one screen and one cursor, and making
   * player 1 the only one who can pick the league locks three other kids out of
   * the decision about what they are all about to play.
   */
  _openLeaguePicker(leagues, was = null) {
    const panel = document.getElementById('panel-league');
    const list = document.getElementById('league-list');
    if (!panel || !list) { this.tournament.begin(leagues[0]?.id); return; }
    list.textContent = '';
    /* BACK FROM THE SIDES LANDS ON THE LEAGUE SHE CAME FROM — `was` — rather
       than at the top of the list, so "I meant 2v2, not three-against-one" is
       one step of the stick and not a hunt. */
    const on = Math.max(0, leagues.findIndex((m) => m.id === was));
    leagues.forEach((m, i) => {
      const b = document.createElement('button');
      b.className = `menu-btn${i === on ? ' primary' : ''}`;
      b.innerHTML = `${m.name}<span class="lg-blurb">${m.blurb}</span>`;
      b.addEventListener('click', () => {
        panel.classList.add('hidden');
        this.leaguePicking = false;
        this._afterLeague(m);
      });
      list.appendChild(b);
    });
    /* AND A WAY BACK OUT OF IT — TWO, AND THE ONE THEY CAME BY IS THE BACK.
       Richard: "Talking to Mr. Satan at the arena front gate, it says 'Fly
       home' when should say 'Return to Entrance' or something like that.
       Maybe let's have option for both, but default to the one that initiated
       the conversation. That way players can choose where they go back to."

       It said FLY HOME and then walked them out of the doors: a party that
       met him at the gate leaves through it (`leaveArena`), so the button was
       wrong about what it did. Now there is a row for each way, and the one
       that matches how they arrived (`arenaFrom`) comes first and is the
       `.back` - what MenuNav's B presses, and what Escape and Start reach
       through `_pickerBack`. The other is an ordinary row. Each ASKS, with the
       default answer no (seventh non-negotiable). No doors in the world, no
       door row: a button that cannot go where it says is worse than none. */
    for (const [i, to] of this._waysOut().entries()) {
      const back = document.createElement('button');
      back.className = i === 0 ? 'menu-btn back' : 'menu-btn';
      back.textContent = to === 'gate' ? '◀ BACK — RETURN TO THE ENTRANCE' : '◀ BACK — FLY HOME TO TOWN';
      back.addEventListener('click', () => this._pickerBack(to));
      list.appendChild(back);
    }
    panel.classList.remove('hidden');
    /* The fighters are frozen while it is up — `Tournament.frozen` is false
       here because no tournament has started yet, so this is the flag that
       stops four kittens wandering off the deck during the choice. */
    this.leaguePicking = true;
  }

  /**
   * The league is chosen. Do the teams need choosing too?
   *
   * ONLY WHEN A SIDE HOLDS MORE THAN ONE FIGHTER. A duel and a free-for-all
   * have nothing to arrange — everybody is her own side — and putting a screen
   * in front of them would be a menu with one legal answer, which teaches a kid
   * that the game has stopped working.
   */
  _afterLeague(mode) {
    const n = this.players.length;
    const sides = mode.sides(n);
    const teamed = sides.some((s, i, all) => all.some((t, j) => j !== i && t === s));
    if (!teamed) { this.tournament.begin(mode.id); return; }
    this._openTeamPicker(mode, sides);
  }

  /**
   * WHO IS ON WHOSE SIDE — chosen by the girls, not by the order they joined in.
   *
   * `mode.sides(n)` is the default arrangement and it used to be the only one:
   * the first two kittens were always the pair and the last one was always the
   * fighter on her own. Which meant the answer to "who is my partner" was
   * decided by who picked up a controller first, three menus ago, and the only
   * way to change it was for somebody to drop out and rejoin.
   *
   * EACH KITTEN MOVES HERSELF, WITH HER OWN STICK. There is no shared cursor
   * here — this is the second screen in the game that needs one cursor per
   * player rather than one for the room, and for the same reason the trade
   * screen does: the thing being chosen is personal. Left and right walk her
   * between the sides; anybody may press JUMP once the sides are legal.
   *
   * THE SHAPE IS VALIDATED, NOT THE SEATING. A 2v2 needs two sides of two and
   * does not care which two — see `Tournament._validSeats`. Until the shape is
   * right, JUMP is refused and the screen says what is wrong, because a confirm
   * that silently does nothing is the failure this codebase keeps naming.
   *
   * EVERYBODY STARTS ON NO TEAM, AND THAT IS THE FIX FOR THE SCREEN NOBODY
   * EVER SAW. It opened on `mode.sides(n)` — the default arrangement — which is
   * a LEGAL one, so `_validSeats` was true on the very first frame and the only
   * thing left between four kittens and the round card was somebody pressing
   * JUMP. The press that chose the league is a JUMP: `MenuNav` confirms on it,
   * this panel opens inside that same frame, and `_updateTeamPicker` runs later
   * in it and reads the very same press. So picking a 2v2 skipped straight past
   * the sides and into the match, with whoever joined first paired up — the one
   * thing this screen exists to stop.
   *
   * Two independent locks, because either alone is a coincidence away from
   * failing again:
   *
   *   1. NO SIDE (`NO_SIDE`) is not a legal seat, so the shape cannot be valid
   *      until every kitten has walked herself onto a team. The screen has to
   *      be USED, not merely passed through, which is also what makes "pick a
   *      side" true rather than "confirm the side we picked for you".
   *   2. JUMP MUST BE PRESSED FRESH — `_jumpArmed` per player, see
   *      `_updateTeamPicker`. A press that was already down when this opened
   *      belongs to the screen before it.
   */
  _openTeamPicker(mode, defaults) {
    const panel = document.getElementById('panel-teams');
    if (!panel) { this.tournament.begin(mode.id); return; }
    this.teamPick = {
      mode,
      /* Nobody on a side. `defaults` is still what says how many sides there
         are — the picker never invents one the league does not have. */
      seats: this.players.map(() => NO_SIDE),
      // How many sides this league has — the picker never invents a new one.
      sides: Math.max(...defaults) + 1,
      prev: this.players.map(() => 0),
      /* Armed only once a player has let JUMP go. Anybody still holding the
         button that opened this screen is not confirming this one. */
      jumpArmed: this.players.map((_, i) => !this.input.players[i]?.down?.('jump')),
    };
    this.teamPicking = true;
    panel.classList.remove('hidden');
    /* Bound once, on the first open, rather than per open — a listener added
       every time would go back once per visit on a single tap. */
    const back = document.getElementById('tp-back');
    if (back && !back.dataset.bound) {
      back.dataset.bound = '1';
      back.addEventListener('click', () => this._pickerBack());
    }
    /* AND A FINGER CAN DO WHAT A STICK DOES. "On mobile, at the arena, for
       2v2 battle, there is no way to push the player onto the team with mobile
       input as the joystick and buttons are covered up by the UI ... the touch
       input can just push the player to the next category, every time the
       name is touched on input and it will cycle between teams when clicked."

       BOUND ONCE, ON THE TWO THINGS THAT OUTLIVE A PAINT. `#tp-body` is
       rebuilt by `innerHTML` on every move, so the names are found by
       delegation, off `data-i`, and never hold a listener of their own.

       `onTap`, NOT `click`, AND THE ROWS ARE NOT BUTTONS. A button she tapped
       keeps the focus, and the next Space on the keyboard — which is a
       kitten's JUMP — would click it again as well as jumping: one press read
       twice, the first shape of the fall-through in gotchas.md. A pointer
       down and up in the same place is the only thing that moves anybody from
       here, and a drag across the columns to scroll them moves nobody. */
    const body = document.getElementById('tp-body');
    if (body && !body.dataset.bound) {
      body.dataset.bound = '1';
      onTap(body, (t) => {
        const row = t?.closest?.('.tp-cat');
        if (row) this._teamTap(+row.dataset.i);
      });
    }
    const fight = document.getElementById('tp-fight');
    if (fight && !fight.dataset.bound) {
      fight.dataset.bound = '1';
      onTap(fight, () => this._teamFight());
    }
    /* THE COLUMNS HOLD THE HEIGHT THEY OPEN AT, so a tap cannot slide the
       screen under the finger that made it. Measured at 844x390 before: the
       panel is centred, so taking Ember out of NO TEAM made the tallest column
       one row shorter and moved every row on the screen down 28px — the next
       tap on "the top name" landed on the NO TEAM heading, and could as easily
       have landed on a sister (gotchas.md, UI FALL-THROUGH, the third shape).
       Everybody opens in NO TEAM, which is the tallest the columns can ever
       be (four sides wrapping onto two lines still hold n rows between them),
       so the height it opens at is the most it will ever need. */
    if (body) body.style.minHeight = '';
    this._paintTeamPicker();
    if (body && body.offsetHeight) body.style.minHeight = `${body.offsetHeight}px`;
  }

  /**
   * A name was tapped: SHE moves one side along, exactly as her stick moving
   * right would move her — NO TEAM, RED, BLUE (and GOLD), and round to NO TEAM
   * again. One rule for both, so the row a finger walks is the row a stick
   * walks. Anybody's name, by anybody: a phone is one screen with the whole
   * sofa round it, and this is the only way the sisters on pads that are also
   * covered could be moved at all.
   */
  _teamTap(i) {
    const T = this.teamPick;
    if (!T || !Number.isInteger(i) || i < 0 || i >= T.seats.length) return false;
    const span = T.sides + 1;
    T.seats[i] = ((T.seats[i] + 2 + span) % span) - 1;
    this.sfx('menu');
    this._paintTeamPicker();
    return true;
  }

  /**
   * FIGHT! from a finger — what anybody's JUMP does, for the phone whose JUMP
   * is under this panel. A refusal says so, and says what would fix it, in
   * the words the help line uses (sixth non-negotiable): a button that did
   * nothing would read as a broken screen to a kid who has just sorted four
   * sisters into two teams.
   *
   * THE PANEL SAYS IT, NOT A TOAST. Measured at 844x390: a toast is made, at
   * y 79-99, and drawn BEHIND this panel — `#toasts` has no stacking of its
   * own and the panel is an `.overlay` — so the first cut of this refused in
   * silence. Lifting every toast in the game over every panel would be a
   * change to a hundred screens for one button; the red line under the
   * columns already says exactly this, so the refusal brings it into view and
   * makes it jump.
   */
  _teamFight() {
    const T = this.teamPick;
    if (!T) return false;
    if (!this.tournament._validSeats(T.seats, this.players.length, T.mode)) {
      const help = document.getElementById('tp-help');
      if (help) {
        help.scrollIntoView?.({ block: 'nearest' });
        help.classList.remove('tp-flash');
        void help.offsetWidth;   // restart the animation on a second tap
        help.classList.add('tp-flash');
      }
      this.sfx('menu');
      return false;
    }
    this._startTeams();
    return true;
  }

  /** Close the picker and start the league on the sides it holds. */
  _startTeams() {
    const T = this.teamPick;
    document.getElementById('panel-teams')?.classList.add('hidden');
    this.teamPicking = false;
    const { mode, seats } = T;
    this.teamPick = null;
    this.tournament.begin(mode.id, seats);
  }

  /** What is keeping the sides from being legal, as an instruction. */
  _teamPickWhy(T) {
    const touch = !!this.device?.touchPrimary;
    const waiting = T.seats.filter((s) => s === NO_SIDE).length;
    if (waiting) {
      return touch
        ? `Everybody has to pick — tap each name to put her on a side (${waiting} still to choose)`
        : `Everybody has to pick — push your own stick LEFT or RIGHT (${waiting} still to choose)`;
    }
    return `${T.mode.name} needs ${this._shapeWords(T.mode)} — `
      + (touch ? 'tap a name to move somebody across' : 'move somebody across');
  }

  _paintTeamPicker() {
    const T = this.teamPick;
    if (!T) return;
    const body = document.getElementById('tp-body');
    const help = document.getElementById('tp-help');
    document.getElementById('tp-title').textContent = `${T.mode.name} — PICK YOUR SIDE`;
    const ok = this.tournament._validSeats(T.seats, this.players.length, T.mode);

    /* `data-i` IS HER SEAT, which is what `_teamTap` moves. On a phone the
       prompt on her row is the gesture that works there — the stick's arrows
       are drawn under this panel. */
    const touch = !!this.device?.touchPrimary;
    const cat = (p) => `
      <div class="tp-cat" data-i="${this.players.indexOf(p)}" style="--me:${styleCss(this.roster[p.index])}">
        <span class="tp-pip"></span><span class="tp-name">${escapeHtml(p.name)}</span>
        <span class="tp-keys">${touch ? 'TAP ▶' : '◀ ▶'}</span>
      </div>`;
    /* THE UNDECIDED COLUMN IS FIRST, and it is a column rather than an absence.
       Everybody starts in it (see `_openTeamPicker`), so it is where a kid
       looks to find herself on the frame this opens — a name that is simply
       missing from all three teams reads as a player the game has lost. It
       empties as they pick, and an empty one is the picture that says the sides
       are settled. */
    const waiting = this.players.filter((_, i) => T.seats[i] === NO_SIDE);
    const undecided = `<div class="tp-side tp-none">
        <div class="tp-head">NO TEAM</div>
        ${waiting.map(cat).join('') || '<div class="tp-empty">everyone has picked</div>'}</div>`;

    body.innerHTML = undecided + Array.from({ length: T.sides }, (_, s) => {
      const mates = this.players.filter((_, i) => T.seats[i] === s);
      const rows = mates.map(cat).join('') || '<div class="tp-empty">nobody</div>';
      return `<div class="tp-side" style="--team:${teamColour(s)}">
          <div class="tp-head">${teamName(s)}</div>${rows}</div>`;
    }).join('');

    /* WHAT IS WRONG, IN THE ORDER IT CAN BE FIXED. "Needs two against two" is
       unhelpful while three kittens are still standing in NO TEAM — the thing
       to do first is pick at all, and only once everybody has is the shape the
       real problem. Two different failures wearing one sentence is how a
       refusal stops being read. */
    help.textContent = ok
      ? (touch ? 'Tap a name to move her to the next side · FIGHT! to start'
        : 'Push your own stick LEFT and RIGHT to change sides · JUMP to fight')
      : this._teamPickWhy(T);
    help.classList.toggle('tp-bad', !ok);
    /* THE BUTTON SAYS WHETHER IT WILL GO. Dimmed while the sides are wrong —
       and still tappable, because a tap on it is how a kid asks why. */
    document.getElementById('tp-fight')?.classList.toggle('off', !ok);
  }

  /**
   * One step back out of the arena's pickers. True if it did something.
   *
   * Asked for: "at the arena and before a fight, during the menu selection,
   * there is no way to 'back out' to the previous screen after choosing a
   * fight type, at least not on mobile, there should be a way to back out, by
   * either pressing esc/start buttons or by selecting a 'back' button." There
   * was none at all: the sides screen had no button, Escape and Start opened
   * the pause menu UNDERNEATH it (MenuNav gives `panel-league` precedence, so
   * that menu could not even be driven), and the only way out of a league
   * chosen by mistake was to leave the ring from the pause menu and fly back.
   *
   * FROM THE SIDES, BACK IS THE LEAGUES — nothing has been decided that
   * cannot be decided again, so it simply goes; no question. FROM THE LEAGUES
   * THE SCREEN BEFORE IS THE TOWN, eight seconds of griffin away, so that one
   * asks, with the cursor on NO. It is reached from Escape, a pad's or the
   * touch pad's Start, B on either screen, and the button on each.
   */
  _pickerBack(to = null) {
    if (this.confirm?.active) return false;
    if (this.teamPicking) {
      const was = this.teamPick?.mode?.id ?? null;
      document.getElementById('panel-teams')?.classList.add('hidden');
      this.teamPicking = false;
      this.teamPick = null;
      this.sfx('menu');
      this._openLeaguePicker(modesFor(this.players.length), was);
      return true;
    }
    if (this.leaguePicking) {
      const ways = this._waysOut();
      const way = ways.includes(to) ? to : ways[0];
      this.confirm.ask(way === 'gate' ? {
        title: 'BACK OUT TO THE ENTRANCE?',
        body: 'Nobody has fought yet, so nothing is lost. Mr. Satan will '
          + 'run it again whenever you talk to him at the doors.',
        no: 'NO, PICK A FIGHT',
        yes: 'YES, BACK TO THE ENTRANCE',
        onYes: () => this.quitMatch(way),
      } : {
        title: 'FLY BACK TO TOWN?',
        body: 'Nobody has fought yet, so nothing is lost. Mr. Satan will '
          + 'run it again whenever you come back.',
        no: 'NO, PICK A FIGHT',
        yes: 'YES, FLY HOME',
        onYes: () => this.quitMatch(way),
      });
      return true;
    }
    return false;
  }

  /** The ways out of the league picker, the one they came in by first: out
   *  of the doors ('gate') only when the world has doors to walk out of. */
  _waysOut() {
    const doors = !!(this.world?.arenaDoors && this.arenaExit);
    if (!doors) return ['town'];
    return this.arenaFrom === 'gate' ? ['gate', 'town'] : ['town', 'gate'];
  }

  /** "two against two", in words, for the line that says why JUMP is refused. */
  _shapeWords(mode) {
    const counts = {};
    for (const s of mode.sides(this.players.length)) counts[s] = (counts[s] ?? 0) + 1;
    return Object.values(counts).sort((a, b) => b - a).join(' against ');
  }

  /**
   * One frame of the team picker. Each kitten reads HER OWN pad.
   *
   * The edge is latched per player (`prev`), not globally: two girls pushing
   * their sticks on the same frame must both move, and a held stick must move
   * its owner one side rather than sprinting her round the ring.
   */
  _updateTeamPicker() {
    const T = this.teamPick;
    if (!T) return;
    let moved = false;
    this.players.forEach((p, i) => {
      const pad = this.input.players[i];
      if (!pad) return;
      /* JUMP IS ARMED BY BEING RELEASED, not by time. See `_openTeamPicker`:
         the press that chose the league is still down on this frame, and it
         must not be allowed to confirm the screen it opened. */
      if (!pad.down?.('jump')) T.jumpArmed[i] = true;
      const dir = pad.mx > 0.55 ? 1 : pad.mx < -0.55 ? -1 : 0;
      if (dir && dir !== T.prev[i]) {
        /* NO TEAM IS A POSITION IN THE ROW, not a state outside it. Sides run
           [NO TEAM, RED, BLUE, (GOLD)] and the stick walks the whole row, so
           stepping back off a team is the same gesture as joining one — a kid
           who lands on the wrong colour does not have to work out how to undo
           it. `NO_SIDE` is -1, so +1 puts her on RED. */
        const span = T.sides + 1;
        T.seats[i] = ((T.seats[i] + 1 + dir + span) % span) - 1;
        moved = true;
        this.sfx('menu');
      }
      T.prev[i] = dir;
    });
    if (moved) this._paintTeamPicker();

    /* B IS BACK, as it is on every screen MenuNav drives — this one is not
       driven by MenuNav (one cursor per kitten, see `_openTeamPicker`), so it
       has to say so itself. Anybody's B, like anybody's JUMP. SPENT, so the
       league list that opens under it this frame cannot read the same press
       as its own BACK row and ask to fly everybody home. */
    const back = this.players.findIndex((_, i) => this.input.players[i]?.pressed?.('interact'));
    if (back >= 0) {
      this.input.players[back].consume?.('interact');
      this._pickerBack();
      return;
    }

    if (!this.tournament._validSeats(T.seats, this.players.length, T.mode)) return;
    if (!this.players.some((_, i) => (
      T.jumpArmed[i] && this.input.players[i]?.pressed('jump')
    ))) return;
    this._startTeams();
  }

  /** More than one league has been won: a headed table each. */
  _paintLeagues(el, leagues) {
    el.innerHTML = leagues.map((L) => `
      <h4 class="lb-league">${escapeHtml(MODE_BY_ID[L.mode]?.name ?? L.mode)}</h4>
      <table class="lb">${L.rows.map((r, i) => `
        <tr>
          <td class="lb-rank">${i + 1}</td>
          <td class="lb-name">${escapeHtml(r.name)}</td>
          <td class="lb-score">${r.score}</td>
          <td class="lb-detail">${r.wins}W · ${r.dealt} dealt · ${r.taken} taken · ${r.seconds}s</td>
        </tr>`).join('')}</table>`).join('');
  }

  /* ------------------------------- music --------------------------------- */

  /**
   * Decide what should be playing, and change it only when the answer changes.
   *
   * ONE PLACE DECIDES. This used to be four scattered `startMusic` calls in
   * mount and dismount handlers, which was survivable while there were two
   * tracks and is not now that there are ten: a handler fires on an event and
   * the right track is a function of STATE, and the two come apart the moment
   * anything changes without an event to announce it — landing on a new
   * island, say, which is the entire feature below.
   *
   * The order is a priority list, and riding outranks standing because a
   * dragon crosses four islands in twenty seconds and a theme that changed
   * under you each time would be unlistenable.
   */
  _updateMusic(dt) {
    if (!this.audio?.ready || this.state !== 'play') return;
    // The intro owns the music while it runs, and hands back on its own.
    if (this.cutscene?.active) return;
    /* Music turned off means OFF. Without this, deciding a track every frame
       quietly undoes the slider: `startMusic` is happy to run a full schedule
       into a bus at zero gain, so the setting looks respected and the engine
       is scheduling oscillators forever for nobody. The slider restarts it. */
    if (this.audio.musicVolume <= 0) return;
    const want = this._wantedTrack(dt);
    if (want && want !== this.audio.mode) this.audio.startMusic(want);
    /* THE DREAM DOJO SWELLS; everything else plays at the slider's level.
       Set every frame, but `setMusicLevel` only touches the bus on a change. */
    this.audio.setMusicLevel?.(want === 'vr' ? this._vrLevel ?? 1 : 1);
  }

  /**
   * Step anything lying loose off the roads that have just been built.
   *
   * THE ROADS DO NOT MOVE FOR THE ORBS; THE ORBS MOVE FOR THE ROADS. The
   * Powerup Kotodama are seeded at 100% and the roads are solved by the ending,
   * after — and a road that had to route round them is how the frost island
   * lost its road altogether (see `blocked` in world/snakeway.js). So the roads
   * are solved against the world as it was BUILT, and anything play has put
   * down since is moved to the nearest clear ground here.
   *
   * @returns {number} how many moved
   */
  _clearRoads() {
    let n = 0;
    const loose = [
      ...(this.kotodama?.pickups ?? []), ...(this.pickups ?? []), ...(this.balls ?? []),
    ];
    for (const pk of loose) {
      if (!pk?.group || pk.taken) continue;
      const at = pk.position ?? pk.group.position;
      const to = this.world.offRoads(at.x, at.z);
      if (!to) continue;
      pk.position?.set(to.x, to.y, to.z);
      pk.group.position.set(to.x, to.y, to.z);
      n++;
    }
    if (n) console.log(`[snake] ${n} loose thing(s) stepped off the new roads`);
    return n;
  }

  /**
   * A kitten running Snake Way has reached its coin.
   *
   * "Some gold coins in the center of the bridges that, if the player collides
   * with it, it plays a 'bless' cutscene/zoom in with the coin above their head
   * and they get the equivalent of '5x bamboo cut' added to their score... The
   * one for the arena can have a Mr. Satan emblem and it will play the bless
   * for all active players and they all get the points... any coin on bridge
   * can only be grabbed if the player is on the bridge (not on a dragon)."
   *
   * ON THE ROAD MEANS `snakeRide`, which is null on a dragon, on a passenger
   * seat and in a griffin's claws by construction — and still set in the air
   * over the deck, so a jump for it counts. The blessing is `holdAloft`, the
   * pose every other prize in the game uses, with the coin's own face on the
   * card. Five canes is SCORE, not panda food: it is "added to their score".
   */
  _checkCoins() {
    const W = this.world;
    if (!W.snakeOpen || !W.snakeWay?.coins?.length) return;
    for (const p of this.players) {
      if (!p?.snakeRide || p.mount || p.rideAlong || p.carried || p.ko) continue;
      const c = W.coinAt(p.position.x, p.position.y, p.position.z);
      if (!c || !W.takeCoin(c)) continue;
      const pts = COIN_CANES * BAMBOO_POINTS;
      const who = c.kind === 'satan' ? this.players.filter(Boolean) : [p];
      for (const q of who) {
        q.score += pts;
        const el = document.getElementById(`score-${q.index}`);
        if (el) el.textContent = q.score;
        q.holdAloft(c.face ?? null, COIN_BLESS, {
          flat: true, tint: c.kind === 'satan' ? 0xff5a3c : 0xffd34a,
        });
      }
      this.sfx('starfound');
      if (c.kind === 'satan') {
        this.toast(`${p.name} found MR. SATAN'S COIN! +${pts} for everybody!`, p.index);
      } else {
        this.toast(`A Snake Way coin! +${pts} — five canes' worth`, p.index);
      }
    }
  }

  /** What should be playing right now, or null for "leave it alone". */
  _wantedTrack(dt = 0) {
    /* THE ENDING OUTRANKS EVERYTHING, INCLUDING THE DRAGONS. Its camera is
       nowhere near the kittens and neither is its subject, so every rule below
       this line is answering a question the scene is not asking — and the
       answer it used to give was "whichever island somebody was standing in
       when the last barrel went over". See `SummonScene.musicTrack` and
       `MUSIC_CUES`; it is null for every other scene and for all of play, so
       nothing outside the ending can reach this branch.
       Before the `players.length` guard as well, because the ending is still
       the ending in a world that is being torn down around it. */
    const ending = this.summonScene?.musicTrack;
    if (ending) return ending;
    /* THE GRIFFIN OWNS THE MUSIC WHILE IT IS CARRYING THEM, and it outranks
       every rule below for the reason the ending does: the kittens are cargo,
       the animal is writing their positions, and "which island is she standing
       on" is a question about somebody being flown across four of them. Left
       to `_islandTrack` the eight-second ride would change key under itself.

       OUT AND HOME ARE DIFFERENT PIECES BECAUSE THEY ARE DIFFERENT ERRANDS.
       Out is the one the report is about — see `MUSIC.griffin`, which is the
       arena's key arriving from a long way off. Home is a flight and nothing
       else, so it takes the flight theme every other ride in this game takes;
       playing the arena fanfare at somebody being carried AWAY from the arena
       would read as the game not knowing which way round it is. */
    if (this.travel) return this.travel === 'out' ? 'griffin' : 'flight';
    if (!this.players?.length) return null;
    if (this.ryu?.ridden
      && this.players.some((p) => p.mount === this.ryu || p.rideAlong === this.ryu)) {
      return 'ryu';
    }
    if (this.players.some((p) => p.mount)) return 'flight';
    /* SNAKE WAY HAS ITS OWN, and Mr Satan's road has HIS. "Some specific
       music is playing while on the bridges heading to the islands", and
       "a special song play that is his preferred song". A road is a ride in
       the sense the flight theme is — a kitten on it is between islands, and
       `_islandTrack` would hand her whichever one her feet last settled on.
       His outranks the plain one: a road with four kittens on two of them
       plays the funnier song. */
    if (this.players.some((p) => p.snakeRide?.road.arena)) return 'satan';
    /* NOT THE DREAM DOJO'S BRIDGES, which ride like Snake Way (simworld.js
       `addBridge`) but are not it: nothing in the simulator picks a track,
       so the song a bridge started would play on after she stepped off. */
    if (this.players.some((p) => p.snakeRide && !p.snakeRide.road.sim)) return 'snake';
    /* THE ARENA ISLAND PLAYS THE FUNFAIR UNTIL THERE IS A MATCH. "Have that
       Gold Saucer music play when the player gets off the snake bridge and
       onto the arena, before they join the arena and the arena music plays."
       `inMatch` is true from the league picker on, so the fight's own piece
       still starts where it always did; the parade back out of the doors is
       after `Tournament.finish`, so it gets the fanfare too. The griffin's
       party never hears it — they land straight into the picker. */
    /* THE DREAM DOJO — across the stones, under the dome, and in the
       simulator. Below the rides, so a dragon flying past it keeps the flight
       theme; above the islands, because the crossing starts ON the Dojo of
       the Turning Circle and "starts playing quietly, from a distance" means
       before she has left it. `musicLevel` is the swell, applied in
       `_updateMusic`. */
    this._vrLevel = this.dream?.musicLevel?.(this.players) ?? 0;
    if (this._vrLevel > 0) return 'vr';
    const isl = this._islandTrack(dt);
    if (isl === 'arena' && !this.inMatch) return 'saucer';
    return isl;
  }

  /**
   * Which island's theme, with two kittens who can be on two islands.
   *
   * THE MUSIC FOLLOWS WHOEVER MOST RECENTLY ARRIVED SOMEWHERE NEW. Every other
   * rule I tried is worse: "player 1's island" means the second girl can fly to
   * the snow island and nothing happens, which reads as the feature being
   * broken for her; "whichever island holds both" means nothing changes at all
   * while they are apart, which is most of the time. Arriving is an event
   * either of them can cause, and the answer is stable between arrivals — it
   * cannot oscillate, because the tiebreak only moves when somebody's island
   * actually changes.
   *
   * DWELL exists for the rims. Kittens cross island boundaries constantly on
   * the way somewhere, and a track that restarted every time a toe crossed a
   * line would be a stutter rather than a soundtrack.
   */
  _islandTrack(dt) {
    let best = null;
    for (const p of this.players) {
      // A kitten in the air belongs to no island; the flight theme has her.
      const isl = (p.mount || p.rideAlong) ? null : this._islandUnder(p);
      if (isl !== p._musicIsland) {
        p._musicIsland = isl;
        p._musicSince = 0;
      } else {
        p._musicSince = (p._musicSince ?? 0) + dt;
      }
      if (!isl || p._musicSince < ISLAND_DWELL) continue;
      // Smaller `_musicSince` is the more recent arrival, and it wins.
      if (!best || p._musicSince < best.since) best = { isl, since: p._musicSince };
    }
    // Nobody settled anywhere: keep playing whatever is playing.
    if (!best) return null;
    return trackForIsland(best.isl, this.world.dojoIsland);
  }

  /** The island a kitten is standing on, or null out over open sky. */
  _islandUnder(p) {
    for (const isl of this.world.islands) {
      if (Math.hypot(p.position.x - isl.x, p.position.z - isl.z) < isl.radius) return isl;
    }
    return null;
  }

  /** Entities call this rather than reaching into the audio engine. */
  sfx(name, vol = 1) {
    this.audio.play(name, vol);
  }

  /**
   * A recorded sound effect — the same door as `sfx`, one shelf along.
   *
   * SEPARATE FROM `sfx` BECAUSE THE FALLBACK RUNS THE OTHER WAY. `sfx` is a
   * name that is always synthesised; this is a name that is a file, and
   * becomes synthesised only when the file is missing. Every entity reaches
   * the audio through `hud`, so this exists for the same reason `sfx` does:
   * one door, so a Player never holds an Audio.
   */
  sample(name, vol = 1) {
    this.audio.sample(name, vol);
  }

  /**
   * A line of text at the top of the screen, for however long it takes to READ.
   *
   * IT USED TO HOLD FOR 1700ms WHATEVER IT SAID, which is fine for "Math
   * overlay ON" and much too short for the panda's growth blurb or a clan's
   * description — the long ones were gone before a nine-year-old had finished
   * them, which is the whole complaint. The messages that most need reading are
   * the longest ones, so a fixed hold is backwards.
   *
   * TOAST_MIN IS THE OLD NUMBER AND SHORT TOASTS STILL GET EXACTLY IT. The
   * curve only starts biting past about twenty characters, so every one-liner
   * the girls already know the rhythm of is unchanged; only the ones that were
   * unreadable move. 55ms a character is around 200 words a minute, which is
   * brisk for an adult and about right for a kid who is also playing a game at
   * the time — the cap stops a paragraph parking itself over the picture.
   */
  /**
   * May the pause menu open right now? Reported from play: "pressing Start in
   * the name input screen can be problematic as it brings up the main menu
   * behind the name input menu. Should not be possible to bring up the Main
   * Menu when in the name input screen."
   *
   * ONE PLACE, BECAUSE THERE ARE TWO DOORS. Escape on a keyboard and `start`
   * on a pad are handled hundreds of lines apart, and the inspector's own
   * exemption right beside the pad one is the proof that fixing one door is
   * not fixing the problem — it went in for the card and left this open.
   *
   * IT REFUSES OUT LOUD. A Start that silently does nothing reads as the pad
   * having died, which is the sixth non-negotiable, and the message is an
   * INSTRUCTION naming the way out rather than a description of the lock.
   *
   * @returns {boolean} true if the press was refused and consumed.
   */
  _menuRefused(playerIndex = 0) {
    /* THE NAME ENTRY OWNS THE SCREEN. It is the one thing in the game holding
       letters somebody is halfway through spelling, and there is no way back
       into it once a menu has taken the keyboard off it. The rest of the
       result screen goes with it, rather than only the typing, because from a
       player's side it is one screen — and `modal` is the flag every other
       reader of this state already uses. */
    if (this.tournament?.modal) {
      this.toast('Sign the board first — then fly home', playerIndex);
      return true;
    }
    return false;
  }

  /**
   * ...AND `combo` MAKES REPEATS OF THE SAME NEWS ONE LINE THAT COUNTS UP.
   *
   * "On split screen, the UI messages appearing at the top of the screen are a
   * bit overbearing and take up too much of the UI real estate... instead of
   * spawning a single message per item, can just be 1 message for all the
   * items cut recently, like a combo."
   *
   * A CANE IS NOT NEWS; TEN CANES ARE. The strip is four lines deep and a kid
   * swinging at a grove filled all four in about two seconds, so the toasts
   * that actually matter — she joined a clan, her panda grew, the match is
   * being called off — were pushed off the top by the sound of her own katana.
   * That is the report, and it is the same on a desktop with four panes; the
   * phone is only where it is unmissable, so this is not a touch-only path.
   * One behaviour beats two that drift.
   *
   * IT DOES NOT MOVE. The note offered "get deleted and respawned as a new
   * message with the new number", and the count in place is the same thing
   * minus the jumping: a line that re-enters the stack at the bottom on every
   * swing is a card teleporting under a number nobody can finish reading.
   * It re-arms its own hold instead, so a combo that is still growing is never
   * the one the four-line cap drops.
   *
   * THE FIRST ONE KEEPS ITS OWN SENTENCE, `text`, with the verb variety and
   * the exclamation mark. Only the second and later collapse. A kid who cuts
   * one cane and walks off should not be told "1x bamboo".
   *
   * A FADING TOAST IS NOT FOLDED INTO. Once `.fade` is on it the animation is
   * running to `opacity: 0` and there is no way back that is not a flicker, so
   * a cane after the lull starts a fresh line — which is also what a player
   * means by a new combo.
   *
   * @param combo `{key, add, text(n, total)}` — `key` is per player, `add` is
   *   this event's points, and `text` renders the folded line. Omit it and
   *   this is the toast it always was.
   */
  toast(text, playerIndex = 0, combo = null) {
    const wrap = document.getElementById('toasts');
    /* Lazy rather than a constructor field: `toast` is called from the very
       first frames of boot, before anything that would own a Map. */
    this._combos ||= new Map();
    const key = combo && `${playerIndex}:${combo.key}`;
    let live = key ? this._combos.get(key) : null;
    /* `isConnected` because the four-line cap removes elements behind this
       map's back — an evicted combo has to start again, which is right. */
    if (live && (!live.el.isConnected || live.el.classList.contains('fade'))) {
      this._combos.delete(key);
      live = null;
    }
    let el;
    if (live) {
      live.n += 1;
      live.total += combo.add ?? 1;
      clearTimeout(live.fadeAt);
      clearTimeout(live.gone);
      el = live.el;
      text = combo.text(live.n, live.total);
      el.textContent = text;
      /* Restart the pop so the new number is SEEN. Removing the class is not
         enough on its own — the animation only replays after a reflow, which
         is what reading `offsetWidth` forces. */
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    } else {
      el = document.createElement('div');
      el.className = `toast p${playerIndex}`;
      el.textContent = text;
      wrap.appendChild(el);
      if (key) {
        live = { el, n: 1, total: combo.add ?? 1, fadeAt: 0, gone: 0 };
        this._combos.set(key, live);
      }
    }
    const hold = Math.min(
      TOAST_MAX,
      Math.max(TOAST_MIN, TOAST_BASE + String(text).length * TOAST_PER_CHAR)
    );
    const fadeAt = setTimeout(() => el.classList.add('fade'), hold);
    const gone = setTimeout(() => {
      el.remove();
      if (key && this._combos.get(key)?.el === el) this._combos.delete(key);
    }, hold + TOAST_FADE);
    if (live) { live.fadeAt = fadeAt; live.gone = gone; }
    /* THE STACK CAP STAYS AT FOUR even though toasts now live longer. It is
       about how much of the picture a pile of them may cover, which has not
       changed; dropping the OLDEST is right for the same reason it always was.
       It is also the number the phone note asked for — "make it so that it
       shows a maximum of 4 of the last messages" — so it is now pinned by a
       check rather than only by this comment. */
    while (wrap.children.length > 4) wrap.firstChild.remove();
  }

  /**
   * A WARNING, AT THE BOTTOM, ADDRESSED TO EVERYBODY.
   *
   * NOT A TOAST, AND THE DIFFERENCE IS THE PROMISE EACH ONE MAKES. A toast is
   * news about something that has happened and is addressed to ONE kitten —
   * it carries her colour and it is one of four stacked at the top, where a
   * kid learns to let things scroll past. This is a consequence that has not
   * happened yet and is addressed to the room, so it is one line, centred, at
   * the bottom, in warning colours. Mixing them would mean the sentence that
   * most needs reading arrives in the shape of the ones that do not.
   *
   * IT HOLDS LONGER THAN A TOAST BY THE SAME RULE A LONG TOAST DOES — see
   * `toast` — because the thing it is warning about is irreversible and the
   * player it is for is nine. `WARN_HOLD_MIN` is deliberately above
   * `TOAST_MIN`: there is no case where a warning worth printing is worth
   * reading in a second and a half.
   *
   * TWO AT MOST. The one case that stacks is a cane that both crosses a
   * kitten's tenth AND takes the grove past a mark, which is two true
   * sentences about the same swing; a third would be a paragraph over the
   * picture.
   *
   * AND IT IS SAID ONCE IN EVERY PANE, not once on the screen. Reported from
   * PC play: "maybe should also consider having it on a 'per split screen
   * quadrant' so that all the players get the message and can see it". The
   * strip belonged to the whole frame, so at four players three of them were
   * being shown a consequence in somebody else's window — and it is the one
   * piece of text in this game that is addressed to all of them at once, which
   * is exactly why it read as belonging to nobody.
   *
   * @param text   the sentence
   * @param level  0, 1 or 2 — see `WARN_LEVELS` and `warnLevel`
   */
  warn(text, level = 0) {
    /* THE LATCH BELONGS TO WHAT IS ON SCREEN, so it is cleared here rather than
       on a timer: with nothing live, a pane that gave up on the last warning
       gets to try again on this one. Without this a single long message on a
       small window would collapse the strips for the rest of the afternoon. */
    if (!this._warnLive()) this._warnWide = false;
    const strips = this._placeWarnings(true);
    if (!strips.length) return;
    const lv = WARN_LEVELS[Math.max(0, Math.min(level | 0, WARN_LEVELS.length - 1))];
    /* ONE ELEMENT PER PANE AND NOT ONE CLONED FOUR TIMES. `cloneNode` would
       copy an element whose entry animation has already started, so the second
       pane's card would arrive mid-blink. */
    const made = strips.map((strip) => {
      const el = document.createElement('div');
      el.className = `warn-line ${lv.cls}`;
      /* THE HAZARD TRIANGLE IS AN EMPTY SPAN AND IS DRAWN IN CSS — see
         `.warn-icon`. Ninth non-negotiable: no icon font, no image, and not a
         `⚠` either, which on most of these machines is an emoji and arrives in
         somebody else's colours. */
      const icon = document.createElement('span');
      icon.className = 'warn-icon';
      const body = document.createElement('span');
      body.className = 'warn-body';
      const word = document.createElement('b');
      word.className = 'warn-lv';
      word.textContent = lv.word;
      /* A TEXT NODE, NOT `innerHTML`. A player's name is in this sentence and a
         name is typed in by a nine-year-old on the profile screen. */
      body.append(word, ` ${text}`);
      el.append(icon, body);
      strip.appendChild(el);
      while (strip.children.length > WARN_STACK) strip.firstChild.remove();
      return el;
    });
    const hold = Math.min(
      WARN_HOLD_MAX,
      Math.max(WARN_HOLD_MIN, TOAST_BASE + String(text).length * TOAST_PER_CHAR)
    );
    setTimeout(() => { for (const el of made) el.classList.add('fade'); }, hold);
    setTimeout(() => { for (const el of made) el.remove(); }, hold + TOAST_FADE);
    /* AND THE FIT IS ASKED NOW THE WORDS ARE IN IT, which is the only moment
       there is anything to measure. See `_fitWarnings`. */
    this._fitWarnings();
  }

  /** Is any warning on screen? Strip 0 is the one every arrangement uses. */
  _warnLive() {
    const wrap = document.getElementById('warnings');
    return !!wrap && [...wrap.children].some((s) => s.children.length > 0);
  }

  /**
   * The strip elements, made on demand. One per pane the game can ever lay out.
   *
   * NOT IN `index.html` and not built with the HUD, because the markup has no
   * business knowing the party size and `_buildHud` is re-run when it changes —
   * these four never change, they are just not all visible at once. Same shape
   * as the two minimaps: made once, shown and hidden.
   */
  _warnStrips() {
    const wrap = document.getElementById('warnings');
    if (!wrap) return [];
    while (wrap.children.length < MAX_PLAYERS) {
      const s = document.createElement('div');
      s.className = 'warn-strip hidden';
      wrap.appendChild(s);
    }
    return [...wrap.children];
  }

  /**
   * Put one warning strip in every pane, and say which of them are live.
   *
   * IT USED TO PARK ONE STRIP ABOVE `.hint` AND MEASURE THE HINT TO DO IT, and
   * that whole problem is gone: the strip is two thirds of the way up its own
   * pane now (`warnSpot`), nowhere near the sentence at the bottom of the
   * screen. The lesson that put it there is kept in the file it moved to —
   * layout arithmetic over a pane goes in core/split.js where it can be
   * asserted, because a reasoned number about anything drawn has been wrong
   * roughly every time.
   *
   * THE PANES COME FROM `_panes`, THE SAME CALL THE RENDERER AND THE MINIMAPS
   * MAKE. The merged view needs no branch: everybody together is one group and
   * `splitLayout(1)` is the whole frame, which is what the single strip always
   * was. That is also the fallback shape — see `_fitWarnings` — so there is one
   * code path and not two.
   *
   * CALLED FROM `_drawMaps` AS WELL, at its 20Hz, so a window resized or a
   * sister joining while a warning is up moves the strips with the panes
   * instead of leaving them over the wrong quarter of the screen. It costs
   * nothing when nothing is up: without `force` it returns before it asks the
   * layout anything.
   *
   * @param force place the strips even with no line in them — `warn` is about
   *              to put one in and needs to know where they are first
   * @returns the strips that should be filled, in pane order
   */
  _placeWarnings(force = false) {
    const strips = this._warnStrips();
    if (!strips.length) return [];
    if (!force && !this._warnLive()) return [];
    /* A PHONE IS ONE PANE BY DEFINITION — there is one pair of hands — so there
       is nothing here to place, and the stylesheet's own rule puts the strip
       under the toasts at the TOP because the bottom of a phone is thumbs. The
       inline styles are CLEARED rather than merely not written: the desktop
       test mode turns `touch-ui` on and off in a running game, and a `left` in
       pixels left behind from before the switch beats the rule that centres
       it. */
    if (document.body.classList.contains('touch-ui')) {
      strips.forEach((s, i) => {
        s.style.cssText = '';
        s.classList.toggle('hidden', i > 0);
      });
      return [strips[0]];
    }
    const W = window.innerWidth;
    const H = window.innerHeight;
    const groups = this.groups?.length ? this.groups : [this.players.map((_, i) => i)];
    const frame = [{ x: 0, y: 0, w: W, h: H }];
    const rects = this._warnWide || !groups.length ? frame : this._panes(W, H, groups);
    /* REMEMBERED FOR THE FIT TEST, which has to compare each strip's height
       with the pane it is in and must not re-ask `_panes` to find out — the
       panes it measured against have to be the panes it was drawn in. */
    this._warnRects = rects;
    const live = [];
    strips.forEach((s, i) => {
      const v = rects[i];
      s.classList.toggle('hidden', !v);
      if (!v) {
        /* A STRIP WITH NO PANE LOSES ITS LINES. Four kittens going down to two
           mid-warning takes two panes away with them, and a hidden strip still
           holding a card would bring a stale message back the next time that
           pane existed. */
        s.replaceChildren();
        return;
      }
      const w = warnWidth(v.w);
      const spot = warnSpot({ v, H, w });
      s.style.width = `${w}px`;
      s.style.left = `${spot.left}px`;
      s.style.top = `${spot.top}px`;
      live.push(s);
    });
    return live;
  }

  /**
   * Does the message actually FIT the panes it has just been put in?
   *
   * "IF THE SCREEN RESOLUTION IS BIG ENOUGH TO FIT THE MESSAGE ON THE SCREEN" —
   * the condition the report attached to the per-pane idea, and the only honest
   * way to answer it is to look. How tall a sentence and a half comes out is a
   * function of the font, the wrap and the strip's width; every version of this
   * that reasons about characters per line is wrong on the first window nobody
   * tried. So the words go in, the height comes back off the DOM, and a pane
   * whose strip is over `WARN_FIT` of its height has lost the argument.
   *
   * ALL OF THEM GIVE UP TOGETHER, and it is the whole party that reads one
   * strip across the frame instead. Per-pane warnings in the two big panes of a
   * 3v1 and nothing in the small one would be worse than either answer: the
   * girl on her own is the one who would be shown nothing at all.
   *
   * IT IS SYNCHRONOUS AND IT IS ONE-WAY. Reading `getBoundingClientRect` forces
   * the layout, and the strips are then re-placed in the same task — so the
   * browser never paints the version that did not fit and there is nothing to
   * see. One way, because `_warnWide` is only ever set here and only ever
   * cleared when the screen is empty of warnings: a rule that could switch back
   * mid-message could switch back and forth.
   *
   * THE CARDS ALREADY IN STRIP 0 ARE NOT TOUCHED. Strip 0 is live in both
   * arrangements, so collapsing widens and moves the box a card is already
   * sitting in rather than building a new one — moving an element restarts its
   * animations, and a warning that blinks its entrance twice looks like two
   * warnings.
   */
  _fitWarnings() {
    if (this._warnWide) return;
    const rects = this._warnRects ?? [];
    if (rects.length < 2) return;
    const strips = this._warnStrips();
    const over = rects.some((v, i) => {
      const h = strips[i]?.getBoundingClientRect?.().height ?? 0;
      return h > v.h * WARN_FIT;
    });
    if (!over) return;
    this._warnWide = true;
    this._placeWarnings(true);
  }

  /**
   * BAMBOO THAT NOBODY CAN EAT — the two warnings, on every cane cut.
   *
   * Asked for as: "once a player that has not pledged yet at Pandapaw cuts
   * down 10 bamboo before pledging, we should display a small warning at the
   * bottom of the screen that any more bamboo they cut down is wasted and will
   * not regrow until they go to Pandapaw and pledge to obtain a baby panda. If
   * they cut 10 more down before pledging, the warning should pop up again...
   * We should have a similar warning appear to warn all the players when there
   * is only 50% bamboo left and also at 25% bamboo left, if there are still
   * players that have not yet pledged to Pandapaw yet."
   *
   * WHY IT NEEDS SAYING AT ALL. `bambooCut` is a LIFETIME tally, so canes cut
   * before the oath are NOT wasted for the kitten who cuts them — they are
   * banked, and `_updatePanda` spends them the moment she swears. What is
   * wasted is the GROVE: nothing regrows (fourth non-negotiable), there are a
   * fixed number of canes in the sky, and a panda costs forty of them. Four
   * kittens who have not sworn can flatten every grove in the game in ten
   * minutes and leave the party with no way to raise a second panda. That is
   * the thing there is no way back from, and the thing the girls could not
   * possibly know.
   *
   * TWO SENTENCES, TWO SCOPES, AND THEY ARE NOT THE SAME WARNING. Hers is
   * about HER and repeats every ten canes because she is the one swinging;
   * the grove's is about EVERYBODY and fires once per mark, because a
   * threshold crossed twice has not been crossed twice.
   *
   * THE MARKS ARE LATCHED BY VALUE, NOT BY TIME. A set of the marks already
   * announced, so no arrangement of dragon breath knocking three canes over in
   * one frame can say "half the bamboo is gone" twice.
   *
   * THE GROVE'S WARNING IS SILENT ONCE EVERYBODY HAS SWORN, which is what
   * "if there are still players that have not yet pledged" asks for — and it
   * is also the honest rule: with every kitten sworn, every cane cut is
   * feeding an animal that exists, and the counter is a shopping list rather
   * than a waste.
   */
  _warnBamboo(cutter) {
    /* THE GROVE IS COUNTED FIRST, because how much is standing is what decides
       how ALARMING both of these are — see `warnLevel`. It used to be counted
       after her own warning had already been printed, which was fine while
       every warning looked the same.

       COUNTED OFF THE PROPS, NOT KEPT. Same argument `lasthunt` is written on:
       `prop.scored` is the only thing in the game that knows what is down, and
       a second tally of it is a second thing that can be wrong about it —
       dragon breath and a panda's claw both knock canes over without going
       anywhere near the katana. The total is cached because it cannot change;
       the remainder is a filter over ~216 props on the frame a cane goes over,
       which does not appear next to anything else in that frame. */
    this._bambooTotal ??= this.world.props.filter((p) => p.kind === 'bamboo').length;
    const left = this._bambooTotal > 0
      ? this.world.props.filter((p) => p.kind === 'bamboo' && !p.scored).length : 0;
    /* A WORLD WITH NO BAMBOO IN IT READS AS FULL rather than as empty. There is
       no such world — `world-check` will not let one be built — but the level
       of a division by zero is the sort of thing that reaches the screen as a
       RED ALERT on the title island. */
    const frac = this._bambooTotal > 0 ? left / this._bambooTotal : 1;
    const level = warnLevel(frac);

    /* HER OWN TALLY, and only while she is unsworn. `bambooCut` counts up
       forever, so `% 10` is the tenth, twentieth, thirtieth... which is
       exactly "if they cut 10 more down before pledging, the warning should
       pop up again". */
    if (cutter && !cutter.raisedPanda && cutter.bambooCut > 0
      && cutter.bambooCut % BAMBOO_WARN_EVERY === 0) {
      const hers = `${cutter.name.toUpperCase()} has cut ${cutter.bambooCut} bamboo `
        + 'and has no panda to eat it. Swear at PANDAPAW first — bamboo never grows back.';
      this.warn(hers, level);
    }

    if (this._bambooTotal <= 0) return;

    /* THE MARK IS LATCHED WHETHER OR NOT IT IS SPOKEN, and that ordering is
       the whole of this block being right. Latching only on the sentence
       would leave 50% unspent through a stretch where everybody had sworn —
       and a kitten joining later, or one leaving Pandapaw for another clan,
       would then be told "only 50% of the bamboo is left" standing in a grove
       with a fifth of it standing. A threshold is a fact about the WORLD; who
       it is worth telling is a separate question, asked after. */
    this._bambooMarked ??= new Set();
    let say = null;
    for (const mark of BAMBOO_WARN_MARKS) {
      if (frac > mark || this._bambooMarked.has(mark)) continue;
      this._bambooMarked.add(mark);
      say = mark;               // the LOWEST crossed this swing, since the
    }                           // list runs high to low and this keeps writing
    if (say == null) return;
    const unsworn = (this.players ?? []).filter((p) => p && !p.raisedPanda);
    if (!unsworn.length) return;
    const who = unsworn.map((p) => p.name.toUpperCase()).join(', ');
    const all = `Only ${Math.round(say * 100)}% of the bamboo is left — ${left} canes in the whole sky. `
      + `${who} ${unsworn.length > 1 ? 'have' : 'has'} not sworn at PANDAPAW yet, and it never grows back.`;
    /* ASKED OF THE MARK BEING ANNOUNCED, not of what is standing this instant.
       The two cannot currently disagree — the colour bands ARE the marks, and
       the loop above keeps the lowest one crossed, so what is standing is
       always inside the band of the mark it is announcing. This is the right
       one of the two to ask anyway: the sentence is about the mark, and if the
       bands are ever unpicked from the marks it should stay about the mark. */
    this.warn(all, warnLevel(say));
  }

  /**
   * The whole archipelago: its middle, and how big it is.
   *
   * The finale frames every island at once, and the numbers for that have to
   * come off the world rather than be typed in — adding an eighth island must
   * not quietly crop the one shot in the game whose entire job is showing all
   * of them.
   */
  _worldBounds() {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    /* THE ARENA IS NOT PART OF THE ARCHIPELAGO THIS SHOT IS ABOUT.
       The finale pulls back until every island is in frame while Patchfur
       talks about islands that drifted apart and two kittens who crossed
       between them — and the tournament grounds are 330 units north of all of
       it, so including them nearly doubles the pull-back and shrinks the town
       the girls just flattened into four pixels. Excluding it is not a fudge
       to protect a hardcoded number: the arena is somewhere else, built by
       somebody else, and it is not open when this scene plays. */
    for (const isl of this.world.islands) {
      if (isl.kind === 'arena') continue;
      minX = Math.min(minX, isl.x - isl.radius);
      maxX = Math.max(maxX, isl.x + isl.radius);
      minZ = Math.min(minZ, isl.z - isl.radius);
      maxZ = Math.max(maxZ, isl.z + isl.radius);
    }
    return {
      centre: new THREE.Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2),
      radius: Math.max(maxX - minX, maxZ - minZ) * 0.5,
    };
  }

  /**
   * What 100% does, wherever the hundredth percent came from.
   *
   * LIFTED OUT OF `onMischief` SO A SECOND DOOR COULD USE IT. It was two
   * blocks inline there, which was right while a prop being hit was the only
   * way the counter ever moved — and stopped being right the moment the debug
   * panel grew a row that knocks fifty over at once. Two copies of the ending's
   * trigger is the one duplication this game cannot afford: the symptom of
   * them drifting is a girl knocking over the last barrel and being shown
   * nothing, which is also the symptom of the bug the `_endingShown` note
   * below was written for.
   *
   * QUEUED, NOT STARTED. On the real path this runs from inside a prop being
   * hit, which can perfectly well happen while a shrine introduction or the
   * summon scene already owns the screen. `SummonScene.start` refuses when one
   * is running, and refusing here would lose the ending outright: there are no
   * props left to hit, so nothing would ever ask again. The loop picks it up
   * on the first frame the screen is free.
   *
   * THE REAL 100% OWNS ITS ENDING, AND A DEBUG PREVIEW MUST NOT EAT IT. The
   * queue guard used to be `!played.finale` — the scene's own once-latch —
   * which is right for "don't fire twice" and wrong for who set it. The scene
   * viewer sets it every time somebody previews the ending, so previewing it
   * once meant the girls could knock over all 216 props and be shown nothing
   * at all: the flag said the ending had happened, and from here that is
   * indistinguishable from it having happened for real. `_endingShown` is the
   * honest guard — it is about THIS 100%, and nothing but a restart clears it.
   *
   * THE AWAKENING FIRES NOW, NOT WITH THE SCENE. `_finaleDue` is queued
   * because a cutscene cannot start over another one; this cannot wait for the
   * same reason it cannot be queued — the finale is 63 seconds and can be
   * skipped on its first frame, so hanging the world's biggest state change
   * off the end of it hands a kid who presses Start no orbs at all. `awaken()`
   * is idempotent, so the guard is belt and braces.
   *
   * @param done    how many props are scored, counted by the caller
   * @param player  who to credit the Awakening to. The debug row has no such
   *                kitten and passes player one; the Awakening is a world
   *                event and only the toast reads this.
   */
  _mischiefComplete(done, player) {
    if (done < this.world.mischiefTotal) return;
    if (!this._endingShown) {
      this._endingShown = true;
      if (this.summonScene) this.summonScene.played.finale = false;
      this._finaleDue = true;
    }
    if (!this.kotodama.awakened) this._awaken(player);
  }

  onMischief(player, prop, breath = null) {
    /* HER OWN TALLY, for the Most mischief quest. Counted BEFORE the 100%
       check below, so the last prop counts for the kitten who hit it. */
    this.feats?.onMischief(player);
    const done = this.world.props.filter((p) => p.scored).length;
    document.getElementById('mtotal').textContent = `${done} / ${this.world.mischiefTotal}`;
    /* THE LAST FIVE, COUNTED OFF THE SAME NUMBER THE HUD IS. Handed the count
       rather than allowed to keep one: this line is the only place in the game
       that knows how many are down, and a countdown able to be wrong about it
       would be worse than no countdown. See `systems/lasthunt.js`. */
    this.lastHunt?.tick(this.world.mischiefTotal - done);
    this._mischiefComplete(done, player);
    const el = document.getElementById(`score-${player.index}`);
    if (el) el.textContent = player.score;
    const pts = prop.points ?? 10;
    if (prop.kind === 'bamboo') {
      /* Bamboo is panda food. The tally runs whether or not she has sworn to
         Pandapaw yet — _updatePanda is what decides if any of it hatches. */
      player.bambooCut += 1;
      /* Read BEFORE _updatePanda: growing the panda moves pandaFedFrom, so
         asking afterwards reports the countdown to the rung after the one this
         very cane just bought. */
      const left = toNextTier(player.bambooCut, player.pandaFedFrom, player.panda?.tier ?? -1);
      this._updatePanda(player);
      this._updateClanBadge(player);
      /* AFTER `_updatePanda`, so a cane that BUYS her the cub does not also
         warn her she has no cub. `raisedPanda` is set at the oath rather than
         here, so in practice this only matters for the grove's own marks —
         but the ordering is the thing that makes the sentence true, and it
         cost nothing to get right. */
      this._warnBamboo(player);
      if (player.raisedPanda && left > 0 && left % 5 === 0) {
        // Only every fifth cane: a countdown that fires on every swing buries
        // everything else in the toast stack.
        this.toast(`${left} more bamboo for ${player.pandaName}…`, player.index);
        return;
      }
      /* NOT COMBOED WITH THE COUNTDOWN ABOVE, which returns before this. They
         are different news — one is "you scored", the other is "you are five
         canes from a cub" — and the countdown already throttles itself to
         every fifth cane for exactly the reason the combo exists. */
      this.toast(`${player.name} cut a bamboo cane clean through!  +${pts}`, player.index, {
        key: 'bamboo',
        add: pts,
        text: (n, sum) => `${n}× bamboo cut by ${player.name}!  +${sum}`,
      });
      return;
    }
    const verbs = ['knocked over', 'scattered', 'pounced on', 'sent flying'];
    const verb = breath === 'a panda claw' ? `clawed a ${prop.kind} to bits`
      : breath ? `hit a ${prop.kind} with ${breath}`
        : `${verbs[done % verbs.length]} a ${prop.kind}`;
    /* ONE KEY FOR EVERY KIND OF PROP, not one per kind. A girl running down a
       market row hits a barrel, a crate and a stall in three seconds; keyed by
       `prop.kind` that is three lines counting to one each, which is the bug
       with extra steps. The varied verb is what the FIRST line is for. */
    this.toast(`${player.name} ${verb}!  +${pts}`, player.index, {
      key: 'mischief',
      add: pts,
      text: (n, sum) => `${n}× knocked over by ${player.name}!  +${sum}`,
    });
  }

  /* ------------------------------- loop --------------------------------- */

  /**
   * The frame, wrapped in its own stopwatch.
   *
   * A WRAPPER RATHER THAN A TIMER INSIDE `_tickBody`, because that method has
   * seven early `return`s in it — the title screen, each scene that owns the
   * screen, the pause menu — and a stop-the-clock line before each of them is
   * a line somebody will forget to add to the eighth. Wrapping cannot miss a
   * path.
   *
   * The number it produces is the half that names the culprit: the JS cost of
   * the whole update loop, against the wall-clock frame measured in
   * `_samplePerf`. See `_paintPerf` for what the gap between them means.
   */
  _tick() {
    /* FROM ITS OWN CLOCK AND NOT FROM `dt`, WHICH IS CLAMPED BELOW. The clamp
       exists so a long stall cannot teleport anybody through a wall, and that
       makes `dt` exactly the wrong number to measure stalls with — it would cap
       the readout at 50 ms and report 20 fps for a frame that took a second. */
    const t0 = performance.now();
    const slot = this._samplePerf(t0);
    this._tickBody();
    if (slot >= 0) this._perfJs[slot] = performance.now() - t0;
  }

  _tickBody() {
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.input.update();

    /* LIGHT THE ON-SCREEN BUTTONS FROM THE RESOLVED PAD, not from the touch
       pad's own held state. They are the same thing under a thumb and they are
       NOT the same thing in test mode — pressing `F` on a keyboard has to light
       SLASH, or the readout is only telling you about half the inputs it
       accepted. Painting the resolved state also means what lights up is what
       the game actually acted on, so a suppressed frame (a remap capture) shows
       as nothing pressed rather than lying. */
    if (this.touchPad?.visible) {
      const slot = this.input.bindings.findIndex((b) => b.touch);
      if (slot >= 0) this.touchPad.paint(this.input.players[slot]);
      this._updateTouchContext();
      this._updateMathForDojo();
    }

    // Keep the controller readout live while it's on screen — it's only
    // useful if you can press a button and watch it react.
    const settings = document.getElementById('panel-settings');
    if (settings && !settings.classList.contains('hidden')) this._refreshPads();

    // Buttons working while no axis has ever moved means this browser can't
    // read the sticks (Chrome does this with the vJoy pad). Say so rather than
    // letting a kid conclude the game is broken.
    const warn = document.getElementById('browser-warn');
    if (warn) warn.classList.toggle('hidden', !this.input.sticksUnreadable());

    /* MENUS OWN THE PAD WHILE THEY ARE UP. Runs before everything else and
       before the title's any-button shortcut, because the alternative is a
       press that both moves the cursor and does whatever the game underneath
       thinks that button means. Returns true while it is holding the input. */
    /* Before MenuNav, and before the title screen's early return below it:
       the trailer can be up while the state is still `title`, and a skip that
       only got polled in the play state would be a video you cannot leave. */
    this.trailer.update();
    /* Also before MenuNav, and for the same shape of reason: the cursor has to
       have an owner that still exists before anybody reads it this frame. */
    this._checkMenuOwner();

    const inMenu = this.menuNav.update(dt);

    if (this.state === 'title') {
      /* Any button still starts the game, because the cursor starts on PLAY
         and `confirm` activates whatever is under it — a kid who mashes gets
         exactly the old behaviour. The one exception is the Controllers
         readout, whose entire purpose is pressing buttons at it. */
      if (!this._overlayOpen() && this.input.anyPressed() && !inMenu) this.startPlay();
      this._renderTitleIdle(dt);
      return;
    }

    /* BEFORE the scene blocks, not between two of them. It used to sit after
       the opening cutscene's early `return`, so the intro was the one scene it
       never ran for — the HUD happened to be hidden there for an unrelated
       reason, which is why that went unnoticed. Every scene hides the HUD now,
       from one call, and the minimap goes with it because the minimap lives
       inside `#hud`. */
    this._hudDuringScenes();

    /* --- the opening cutscene owns the screen while it runs ---
       The world keeps ticking underneath it: petals drift, shrine crystals
       turn, dragons breathe on their perches. A frozen world behind a moving
       camera reads as a pre-rendered video, and the whole point of this one
       is that it is the real place. */
    if (this.cutscene?.active) {
      if (this._skipPressed()) {
        this.cutscene.skip();
      }
      this.cutscene.update(dt);
      this.world.update(dt, { x: 0, z: 40 });
      for (const d of this.dragons) d.update(dt, this.world, []);
      for (const s of this.world.shrines) s.update(dt, []);
      for (const L of this.leaders) L.update(dt, []);
      this._renderView(this.cutscene.camera, 0, 0,
        ...this.renderer.getSize(new THREE.Vector2()).toArray(), null, true);
      return;
    }

    /* --- the dragon-hunt scenes own the screen the same way --- */
    if (this.summonScene?.active) {
      /* THE ENDING'S HOLD, HERE AS WELL AS AT THE BOTTOM OF THIS METHOD, and
         it has to be: this branch RETURNS, so the call down there never runs
         on a single frame of the scene it is for. Measured in the running
         game — the announcer was hushed (that one is forced at `_startFinale`)
         and all four kittens were still standing in the shot, because hiding
         them is the half that can only be done once `summonScene.active` is
         true and the only thing that asks is this method.
         The RESTORE stays at the bottom, where `active` is false again. */
      this._updateFinaleHold();
      if (this._skipPressed()) {
        this.summonScene.skip();
      }
      this.summonScene.update(dt);
      /* ...AND THE MUSIC, FOR EXACTLY THE SAME REASON THE HOLD IS UP THERE.
         Reported from play: "no music playing for the ending cutscene when
         rewatching it. Should play the same music as when watching it
         normally."

         THE BRANCH RETURNS, AND `_updateMusic` IS AT THE BOTTOM OF THIS
         METHOD. So during the ending the one thing allowed to start a track
         never ran on a single frame — the first watch only had music by
         accident of WHERE it starts: `_finaleDue` is cashed in near the end
         of the ordinary path, so `active` is still false on that frame and
         the frame carries on down to `_updateMusic` and starts `finale`.
         WATCH THE ENDING AGAIN is a menu click, so by the next frame `active`
         is already true, this branch returns, and the ending plays in silence.
         Nothing about the scene was wrong; it was never asked.

         AND IT IS WHAT MAKES THE CUES REAL. `MUSIC_CUES` moves `musicTrack`
         to `finaleCross` on the isles and `finaleOpen` on the arena — see
         `systems/summonscene.js` — and neither could ever have been heard,
         first watch included, because both happen mid-scene. AFTER
         `update(dt)`, so a cue set by this frame's beat is heard on this
         frame rather than one late.

         `_updateMusic` is the single authority and stays it; this is the call
         site it was missing, not a second one. See `_wantedTrack`, whose very
         first line is the ending. */
      this._updateMusic(dt);
      this.summonScene.updateSky(dt);
      this.world.update(dt, this.players[0].position);
      for (const d of this.dragons) d.update(dt, this.world, []);
      this.ryu?.update(dt, this.world);
      for (const s of this.world.shrines) s.update(dt, []);
      for (const L of this.leaders) L.update(dt, []);
      /* --- AND THE LESSON, WHICH THE ENDING IS ABOUT ------------------------
         Reported from play: "for the Dojo of the Turning Circle part, it seems
         that the game is paused and the text, spheres and graphics are not
         moving with the player that is moving around on the dojo screen." They
         were not: this branch returns before the frame ever reaches the one
         call that ticks the Dojo, so the ending spent its whole third line
         looking at a diagram frozen on whatever angle the world happened to be
         holding when the last barrel went over. The runner ran the rim of a
         still picture.

         NOBODY, RATHER THAN FOUR FROZEN KITTENS. Every scene stops ticking the
         players, so handing the lesson their positions pins theta to wherever
         they were standing — which is the same frozen diagram by a different
         route, and worse, because it looks deliberate. With an empty list
         `MathDojo` falls back to its own slow idle turn, which is exactly what
         it does when the island is empty. When the ending's runner IS on the
         circle, `dojoDrivers` hands her over and the legs follow her: the real
         lesson, read off the cutscene's own kitten. First non-negotiable.

         AND WITHOUT THE ONE LINE THAT IS TALKING TO A PLAYER. See the doc on
         `MathDojo.update` — "nobody on the circle" is an invitation, and there
         is nobody to invite in the middle of a cutscene. */
      this.dojo.update(dt, this.summonScene.dojoDrivers?.() ?? [], {
        hint: false, live: this.summonScene.dojoLesson?.() ?? true,
      });
      /* THE ENDING IS WHERE SNAKE WAY IS BUILT, AND IT NEVER CALLS `_render`.
         Both of these sat only at the top of `_render`, so on the frames that
         needed them they did not run at all: the stepped profile showed the
         program count flat through the whole ending and the wide shot paying
         for every road's upload on its first frame. */
      this._warmSnake();
      this._primeFinale();
      this._renderView(this.summonScene.camera, 0, 0,
        ...this.renderer.getSize(new THREE.Vector2()).toArray(), null, true);
      return;
    }

    /* --- a shrine scene owns the screen the same way ---
       Same furniture, same rule about the world underneath: she is really
       standing on that dais with her own beam behind her, and freezing it
       would turn a place into a slideshow. The kittens are NOT ticked, which
       is the one difference from a paused game — a stick still pushed when the
       scene opened must not walk somebody off the island while nobody is
       looking at her. */
    /* --- the walk out of the arena's front door ---
       The shrine scene's furniture again, and its rule: the kittens are not
       ticked (the scene has its own copies of them, and the real ones are
       hidden), but the world, the dragons and Mr Satan — who is the real one
       — go on living. `_updateMusic` because this branch returns before the
       bottom of `_updatePlay`, where it otherwise lives. */
    if (this.arenaExit?.active) {
      if (this._skipPressed()) this.arenaExit.skip();
      this.arenaExit.update(dt);
      this.world.update(dt, this.world.arenaDoors ?? this.players[0].position);
      for (const d of this.dragons) d.update(dt, this.world, []);
      this.announcer?.update(dt);
      this._updateMusic(dt);
      this._renderView(this.arenaExit.camera, 0, 0,
        ...this.renderer.getSize(new THREE.Vector2()).toArray(), null, true);
      return;
    }

    /* --- the Dream Dojo's tour and Lionheart's talks ---
       The shrine scene's rules: kittens not ticked (a talk stands them on
       marks, and a stick still pushed must not walk one off the pad), the
       world, the dragons and the Dream Dojo itself go on living — the sign
       floats, the lasers sweep, the racks glow, his bubbles stay quiet. */
    if (this.storyScene?.active) {
      if (this._skipPressed()) this.storyScene.skip();
      this.storyScene.update(dt);
      this.world.update(dt, this.dream?.arcadePos ?? this.players[0].position);
      for (const d of this.dragons) d.update(dt, this.world, []);
      this.dream?.update(dt);
      for (const p of this.players) {
        for (const o of p.orbs ?? []) o.update(dt, p.position);
        for (const o of p.wornOrbs ?? []) o.update(dt, p.position);
        for (const o of p.featOrbs ?? []) o.update(dt, p.position);
      }
      this._updateMusic(dt);
      // The simulator going up a slice a frame, before the tour cuts into it.
      this._primeSim(this.storyScene.camera);
      // Its lens says which world it is in: see StoryScene.update.
      this._renderView(this.storyScene.camera, 0, 0,
        ...this.renderer.getSize(new THREE.Vector2()).toArray(), null, true, this.storyScene.loc);
      return;
    }

    if (this.shrineScene?.active) {
      if (this._skipPressed()) {
        this.shrineScene.skip();
      }
      this.shrineScene.update(dt);
      this.world.update(dt, this.players[0].position);
      for (const d of this.dragons) d.update(dt, this.world, []);
      for (const s of this.world.shrines) s.update(dt, this.players);
      for (const L of this.leaders) L.update(dt, []);
      /* HER ORBS KEEP TURNING, AND SO DOES THEIR WORKING. Reported from play:
         "when in cutscene with Clan Leader, the kotodama orbs stop spinning
         around the player and everything pauses, including the kana, should
         still continue during the cutscene."

         NOT THE SAME THING AS NOT TICKING THE PLAYER. The kitten is frozen on
         purpose — she is stood on a mark by `_stand` and a stick still pushed
         when the scene opened must not walk her off the dais — but her orbs
         are not her: they are the one object in this game that draws its own
         sine and cosine off its own angle, and an orb stopped dead beside a
         talking leader is the first non-negotiable failing in the one scene
         that is entirely about a clan. `Orb.update` advances theta AND
         redraws the working from it, so the kana come back with the motion;
         there is nothing separate to tick.

         IT IS SAFE HERE BECAUSE IT MOVES NOTHING BUT ITSELF. `update` reads
         the centre and writes only the orb's own transform — no world query,
         no collision, no input — which is why this is three lines rather than
         an exception carved out of `_tickPlayers`. */
      for (const p of this.players) {
        for (const o of p.orbs ?? []) o.update(dt, p.position);
        for (const o of p.wornOrbs ?? []) o.update(dt, p.position);
        for (const o of p.featOrbs ?? []) o.update(dt, p.position);
      }
      this._renderView(this.shrineScene.camera, 0, 0,
        ...this.renderer.getSize(new THREE.Vector2()).toArray(), null, true);
      return;
    }

    /* --- the griffin ride ---
       A scripted flight rather than a scene, so it lives here rather than in
       the scene block above: `_sceneActive` is about the dialogue furniture
       and the skip rules, and this has neither. What it shares with a scene
       is that the kittens are NOT ticked — they are cargo, the griffin owns
       their positions, and a stick still pushed when the ride started must
       not walk somebody off its back. */
    if (this.travel) {
      if (this._skipPressed()) this.griffin.skip();
      const flying = this.griffin.update(dt);
      this.world.update(dt, this.griffin.position);
      this.announcer?.update(dt);
      if (!flying) this._arrive();
      /* AND THE RIDE IS SCORED, which needed this line and not a new tune.
         `_updateMusic` is at the BOTTOM of `_updatePlay` and this branch
         returns, so during the flight the one thing allowed to start a track
         never ran on a single frame — the same shape of bug the ending had,
         and it is written up at that call site. Whatever was playing when Mr.
         Satan finished talking simply kept playing over the flight.

         AFTER `_arrive`, NOT BEFORE IT. That call is what clears `this.travel`,
         so asking here means the frame they are put down on asks for the arena
         and not for one more frame of the ride — the two pieces are in the same
         key (see `MUSIC.griffin`) and a cut on the landing is the point of
         that. */
      this._updateMusic(dt);
      this._renderView(this.griffin.camera, 0, 0,
        ...this.renderer.getSize(new THREE.Vector2()).toArray(), null, true);
      return;
    }

    /* --- the Character Profile owns the input while it is up ---
       Before the `start` handler below, or the same press that closes the
       screen also opens the pause menu behind it. It is not a scene and not a
       pause: the world is frozen the way a paused game is, but the two pads
       are read SEPARATELY rather than merged, which is the whole reason it
       does not go through MenuNav. See systems/profile.js. */
    if (this.profile.active) {
      this.profile.update(dt);
      this._render();
      return;
    }

    /* WALK UP TO PAYNE AND PRESS INTERACT — the dealer's pattern exactly,
       below, and every reason it gives holds here: the kitten who PRESSED is
       the one who talks, somebody with a card up is closing it rather than
       opening another, and the press is spent where it was answered so it
       cannot also swear an oath or swing a katana further down the frame.
       Not during a fight: `tournament.active` is the arena, and Payne is in
       the market. */
    /* THE DREAM DOJO, BEFORE PAYNE — the same pattern again. A kitten at
       Lionheart, in her tube or on her ring in the simulator is answered
       here and her press is spent; the arcade refuses in words when it says
       no (the tournament, a scene, sitting on a dragon). */
    if (!this.paused && this.dream?.built) {
      for (const p of this.players) {
        const pad = this.input.players[p.index];
        if (!pad?.pressed('interact') || this.inspector.busy(p.index)) continue;
        if (this.dream.interact(p)) pad.consume('interact');
      }
    }
    if (!this.paused && this.payne && !this.tournament?.active && !this._sceneActive()) {
      const talker = this.players.find(
        (p) => this.input.players[p.index]?.pressed('interact')
          && !this.inspector.busy(p.index)
          && this.payne.canTalk(p)
      );
      if (talker) {
        this.inspector.openPayne(talker.index);
        this.input.players[talker.index]?.consume('interact');
      }
    }

    /* Walk up to the dealer and press interact. Guarded on `paused` so the
       prompt cannot fire through the pause menu, and on the ground state
       inside `shopperNear` so you cannot shop from a dragon. */
    if (!this.paused && this.kotodama.stall) {
      /* THE KITTEN WHO PRESSED IS THE ONE WHO SHOPS, not whichever of them the
         proximity test happened to find first. Both girls stand at the same
         stall; opening her sister's purse because she was closer to the
         counter is the sort of thing that ends an afternoon. */
      const shopper = this.players.find(
        (p) => this.input.players[p.index]?.pressed('interact')
          /* NOT SOMEBODY WHO ALREADY HAS A CARD UP. Her interact means CLOSE
             IT, and that press belongs to `Inspector._drive` further down the
             frame. Without this the stall would answer it first, find her
             already open, do nothing — and then spend it below, so the card
             she was trying to put away would never close. */
          && !this.inspector.busy(p.index)
          && this.kotodama.canShop(p)
      );
      if (shopper) {
        /* THE STALL ASKS A QUESTION NOW RATHER THAN OPENING A SHOP.
           Reported from four-player play: one kitten wanting to look at her
           own orbs threw all four onto a full-screen modal and froze the
           world. The chooser is drawn in HER pane, takes only HER pad, and the
           other three never see it — and if she does pick TRADE, the shared
           counter opens exactly as it always did. See systems/inspector.js.

           NO `return` AND NO `_render` HERE, unlike the profile branch above:
           this does not freeze anything, so the rest of the frame must run.
           `Inspector.busy` is what takes her stick, further down. */
        this.inspector.open(shopper.index);
        /* AND THE PRESS IS SPENT, WHICH IS THE WHOLE REASON THE CARD IS
           VISIBLE AT ALL. Reported as "pressing Interact at the store makes a
           clicking sound and nothing appears", and that is exactly what it
           did: `pressed()` is a pure test that nobody spends, the card's own
           driver runs later in the SAME frame (`Inspector.update`, below), and
           there INTERACT means back out — so the press opened the chooser,
           played the menu blip, and closed it again before a single frame was
           drawn. Same bug the trailer's Start had; same fix, at the place that
           ANSWERED the press.

           It also stops the press reaching `Player.update` at the bottom of
           the frame, where interact means mount or swear an oath. Nothing at
           the stall happens to be mountable, which is the only reason that
           half was never seen. */
        this.input.players[shopper.index]?.consume('interact');
      }
    }

    /* `start` ON A PAD toggles the pause menu — and only on a pad.
       ESC IS THE KEYBOARD'S ONLY MENU KEY, which is what frees ENTER to mean
       one thing everywhere: join. A keyboard set's start key used to do both
       jobs, so which key seated the next player moved about depending on which
       set was already taken, and with one controller connected the obvious
       Enter was player 2's PAUSE key — pressing it opened the menu instead of
       seating player 3. A pad has a real Start button that is not a letter on
       a keyboard somebody else is also using, so it keeps both jobs. */
    /* TOUCH COUNTS AS A PAD HERE, and on a phone it is the ONLY way in. There
       is no Esc key on a touchscreen, so before this the menu — settings,
       restart, the record board, the character profile, the whole of it — was
       simply unreachable once the game had started. The reason `start` is
       gated to a pad at all is that a KEYBOARD's start key had to be freed to
       mean "join"; a touch pad has a dedicated corner button that is nothing
       else, exactly like a real Start button, so it keeps both jobs. */
    /* WHICH pad, not whether any pad — see `_claimMenu`. `findIndex` rather
       than `some` is the entire difference between a menu one player drives
       and a menu four players wrestle over. */
    const asked = this.input.players.findIndex(
      (p) => (p.source === 'gamepad' || p.source === 'touch') && p.pressed('start'),
    );
    /* HER OWN START CLOSES HER OWN CARD, and does not also open the pause menu
       behind it. The card is read later in the frame (`Inspector.update`), so
       without this the press would be taken twice — the card would close and
       four kittens would be looking at a pause menu one of them opened by
       putting a screen away. Only the OWNER is exempt: a sister with no card
       up still pauses the game with her own Start, which is the rule
       everywhere else. */
    if (asked >= 0 && this.inspector.busy(asked)) {
      // fall through to Inspector.update, which reads the same press
    } else if (asked >= 0 && this._menuRefused(asked)) {
      /* The name entry owns the screen — see `_menuRefused`. The press is
         eaten here rather than left to fall through, because the result
         screen's own pads read `jump` and not `start`: letting it through
         would toast AND do nothing, twice a frame. */
    } else if (asked >= 0 && !this.paused && (this.leaguePicking || this.teamPicking)) {
      /* START BACKS OUT OF THE ARENA'S PICKERS rather than pausing under them
         — see `_pickerBack`. On a phone the touch pad's corner button is the
         only Start there is, and it was the one press that could never leave.
         With the question up it is eaten: the dialog is answered with B or a
         tap, and Start toggling a pause behind it would be a second screen. */
      if (!this.confirm.active) this._pickerBack();
      this.input.players[asked].consume?.('start');
    } else if (asked >= 0) {
      const opening = !this.paused;
      this.setPaused(opening);
      if (opening) this._claimMenu(asked);
    }

    /* The two controls that used to exist only on the keyboard. Each kitten
       zooms HER OWN map — the whole reason there are two of them in split
       screen — while the maths overlay is one global thing on screen, so
       either pad toggles it. Read before the pause check so they are inert
       behind the menu, like every other in-world control. */
    if (!this.paused) {
      /* THE MATHS ASK IS COLLECTED AND FIRED ONCE, and that is load-bearing.
         The two Joy-Con halves read ONE physical pad, and the feeder reports
         ZL and ZR as the same button index — so both PadStates see the same
         press on the same frame. Toggling inside the loop turned the overlay
         on and straight back off, which reads as a dead button. Any future map
         that puts `math` on a shared index has the same problem, so the fix
         belongs here rather than in the map. */
      let mathAsked = false;
      this.input.players.forEach((p, i) => {
        if (p.pressed('map')) this._zoomMap(i);
        if (p.pressed('math')) mathAsked = true;
      });
      if (mathAsked) this._toggleMath();
    }

    if (this.paused) {
      // Keep drawing the world behind the menu, but freeze it.
      this._render();
      return;
    }

    /* THE AFTERNOON, WRITTEN DOWN. Below the pause return and above everything
       that moves, so a paused game does not age and a frozen one is never
       photographed mid-freeze. See systems/savegame.js for what a save is and
       why it is a list of what the girls have DONE rather than a description
       of the world.

       IT NEVER ASKS AND NEVER SAYS. A toast here would fire every thirty
       seconds for the rest of the game, which is the kind of notification a
       player learns to stop reading — and the list is in the menu whenever
       anybody wants to look at it. */
    if (this.state === 'play') {
      this.playT += dt;
      if (this.playT >= this._saveAt) {
        this._saveAt = this.playT + AUTOSAVE_EVERY;
        this._autoSave();
      }
    }

    /* The ending, cashed in on the first frame nothing else owns the screen.
       See onMischief for why it is queued rather than fired there.

       THE FLAG IS CLEARED ON SUCCESS, NOT BEFORE THE ATTEMPT — the shape
       `arenaquest` already uses at its own `satanOpen` call ("the scene was
       refused; try again next frame rather than losing the stage change").
       With the queue above clearing `played.finale`, a refusal is currently
       unreachable; this is the ordering being right rather than a bug being
       fixed, and the `played` branch is what stops a future refusal turning
       into a retry every frame forever. */
    /* WHAT THE ENDING TAKES AWAY FROM THE WORLD WHILE IT RUNS. Before the
       block below, so the corner card is already gone on the frame the scene
       opens rather than one frame into it. See `_updateFinaleHold`. */
    this._updateFinaleHold();

    if (this._finaleDue && !this._sceneActive()) {
      if (this._startFinale()) {
        this._finaleDue = false;
        this.sfx('starfound');
        this.toast('100% MISCHIEF — every last thing, knocked over', 0);
        this.toast('100% MISCHIEF — nothing left standing', 1);
      } else if (this.summonScene.played.finale) {
        this._finaleDue = false;
      }
    }

    /* THE FIGHTERS ARE FROZEN FOR THE ROUND CARD AND THE COUNTDOWN, and it is
       the same dead-pad trick the star pose and hit-stun use: hand the
       controller a pad that reports nothing and none of the three movement
       modes has to learn that a tournament exists. The countdown is the one
       that really matters — without it a kitten mashing attack through
       "3 … 2 … 1" opens the round with a free hit on a sister who cannot
       move, which is not a tactic, it is a bug she will find in ten seconds. */
    /* EATING FREEZES HER TOO, THROUGH THE SAME ONE LINE. Holding an animal
       down roots her for two seconds, which is what makes doing it in a live
       round a gamble rather than a free top-up — and it is the dead pad again
       rather than a fifth thing the movement code has to know about.
       `Menagerie` reads the REAL pad (`this.input.players[i]`) for the hold,
       precisely because the pad handed over here reports nothing: a
       hold-detector on this side would see the button come up on the frame the
       freeze started and cancel itself instantly, every single time. */
    /* A NEW PLAYER JOINS HERE, before anybody is updated, so her first frame
       is a real one rather than half a frame behind everyone else's. Refused
       while a scene owns the screen or a round is live — a kitten appearing in
       the middle of a knockout is a fighter nobody agreed to. */
    /* ONE AT A TIME, WHICH `_autoSeat` HAS ALWAYS SAID AND THIS PATH DID NOT.
       `this.picking` is a SINGLE card, so seating somebody while the kitten
       before her is still choosing her cat overwrites it — she never picks, and
       the card vanishes from under her hands. `_autoSeat` refuses for exactly
       this reason and says so in its own comment; the ENTER path was missing
       the same guard, and it was reachable before force-spawn (two pads, two
       quick presses) but only just. It is the NORMAL way in now — "press ENTER
       twice" is the whole instruction — so a hole that used to need bad luck
       became the first thing that happens.
       IT REFUSES OUT LOUD. A press that does nothing reads as the key being
       broken, and she is about to press it again. */
    const join = this.input.pendingJoin();
    if (join && !this._sceneActive() && !this.tournament?.fighting) {
      if (this.picking) this.toast('Wait — someone is still choosing her cat', this.picking.index);
      else this._joinPlayer(join);
    } else this._autoSeat();
    this._updatePicker();
    /* The team picker reads the raw pads too, for the same reason the character
       picker does: everybody's stick is dead while it is up (see the dead-pad
       line below), so a screen that asked the seated player state would be
       reading four sticks it has just switched off. */
    if (this.teamPicking) this._updateTeamPicker();

    /* BEFORE THE PLAYERS, because the pads it reads are the pads blanked in
       the loop below — one press must not both choose a menu row and swing a
       katana. Same ordering, and the same reason, as `_updatePicker`. */
    this.inspector.update(dt);

    /* BEFORE THE PLAYERS, because a collider is only true on the frame the
       thing that owns it is asked about. `Player.update` is what calls
       `resolveSolids`, so syncing after the loop would shove a kitten out of
       where he was LAST frame — which for a man who teleports between the
       town and the arena is three hundred units away. */
    this._syncSatanSolid();

    const frozen = this.tournament?.frozen;
    for (let i = 0; i < this.players.length; i++) {
      /* The picker hands HER a dead pad and nobody else one — the stick that
         is choosing a cat must not also walk her off a rim, and the other
         three are still playing. */
      const picking = this.picking?.index === i;
      /* `inspector.busy` is the personal card: her stick is driving a menu in
         her own pane and must not also walk her into the stall. Only hers —
         that is the whole point of the thing. */
      let pad = (frozen || picking || this.leaguePicking || this.teamPicking
        || this.menagerie?.eating(i) || this.inspector?.busy(i))
        ? DEAD_PAD : this.input.players[i];
      /* THE DREAM DOJO MAY DRIVE HER — walking her to her tube, holding her
         still in it — and hands a kitten in the simulator the simulator to
         walk on, with no dragons in it. For anybody it has never touched,
         both of these are the identity.
         AND THE GAME SHE SEES IS THE SIMULATOR'S: every blow she swings in
         there goes to `TrainingGate` instead of `strikePlayers`, so her blade
         can find a hologram and nothing else (dream/simhud.js). */
      const p = this.players[i];
      pad = this.dream?.padFor(i, pad, DEAD_PAD) ?? pad;
      const sim = this.dream?.realmOf(p) === 'sim';
      p.update(dt, pad, sim ? this.dream.worldFor(p) : this.world, sim ? [] : this.dragons,
        sim ? this.dream.hudFor(p) : this);
    }

    // Orbs, pickups, dragons, dojo.
    for (const p of this.players) {
      for (const o of p.orbs ?? []) o.update(dt, p.position);
      for (const o of p.wornOrbs ?? []) o.update(dt, p.position);
      for (const o of p.featOrbs ?? []) o.update(dt, p.position);
    }
    this.kotodama.update(dt);
    this.feats.update(dt);
    /* After the quests, so a quest earned this frame has already moved her
       next step on before she looks at whether anybody is stuck. */
    this.payne?.update(dt);
    /* After the players, the arcade: it reads where they ended up, and it is
       the thing that pins a kitten in her tube for the NEXT frame. */
    this.dream?.update(dt);
    for (const pk of this.pickups) {
      if (pk.taken) continue;
      pk.update(dt);
      for (const p of this.players) {
        if (p.position.distanceTo(pk.position) < 2.6) {
          this._giveOrb(p);
          pk.taken = true;
          this.scene.remove(pk.group);
          break;
        }
      }
    }
    /* A dragon left somewhere other than its own perch stays put while a
       kitten is still on foot on that island — that's the whole point of
       landing next to it. It flies home once the island is empty of walkers,
       which covers all three cases: they flew off on another dragon, they
       fell and respawned, or they wandered to a different island. */
    for (const d of this.dragons) {
      if (!d.rider && d.state === 'perched' && d.strayed) {
        const here = this.world.heightAt(d.position.x, d.position.z)?.island;
        const kept = this.players.some((p) => !p.mount
          && this.world.heightAt(p.position.x, p.position.z)?.island === here);
        if (!kept) d.returnHome();
      }
      d.update(dt, this.world, this.players);
    }
    /* Pandas run AFTER the players, because a ridden one is slaved to its
       rider's final position for the frame (Player.carry) and a following one
       is chasing where she actually ended up, not where she started. */
    for (const p of this.players) {
      /* A kitten in the simulator is followed to the foot of the stones —
         see `DreamDojo.ownerFor`. Everybody else is herself. */
      p.panda?.update(dt, this.world, this.dream?.ownerFor(p) ?? p);
      /* THE CUB'S CHIRP IS PLAYED HERE, not by the panda, because nothing in
         `entities/panda.js` may reach the audio system — `player.js` already
         imports from it and the reverse edge would close a cycle (the note on
         that is in palette.js). The animal raises a one-frame flag and this
         spends it, which also means a panda drawn on a screen with the sound
         off costs nothing at all. */
      if (p.panda?.lickSfx) { p.panda.lickSfx = false; this.sfx('lick'); }
      /* AND THE BOW AT THE END OF IT. Same one-frame-flag trick, same reason —
         see `Panda._stepLick` for why the cub only celebrates when she is
         actually better, and `audio.js` `'lickdone'` for why the sound is the
         rising figure this game uses for every yes. */
      if (p.panda?.danceSfx) { p.panda.danceSfx = false; this.sfx('lickdone'); }
    }
    /* THE ENDING BORROWS THE LESSON RATHER THAN DRAWING ITS OWN COPY. During
       the finale's Dojo shot a kitten runs the painted circle and the sine and
       cosine legs follow her — and they follow her because `MathDojo` is
       handed HER as its driver, not because a second diagram was animated to
       look like this one. First non-negotiable: the maths is the point, and a
       cutscene that faked it would be the exact thing that rule forbids.
       `dojoDrivers` is null in every other frame of the game, including every
       other frame of the ending, so the players drive it as they always did. */
    this.dojo.update(dt, this.summonScene?.dojoDrivers?.() ?? this.players);
    for (const s of this.world.shrines) s.update(dt, this.players);
    for (const L of this.leaders) L.update(dt, this.players);
    /* Loitering at an unmet shrine starts her introduction. Checked after the
       players have moved, so the dwell is measured against where they actually
       ended the frame. */
    this.shrineScene?.watch(dt, this.leaders, this.players);
    this._updateBalls(dt);
    this._checkCoins();
    this._tickAloftShot(dt);
    /* After the players have moved and after the mounts are resolved, so the
       track is decided from where everybody actually IS this frame. */
    this._updateMusic(dt);
    /* Ryuuseki is carried by his PILOT, so he ticks after the players for the
       same reason the pandas do: a ridden animal is slaved to where its rider
       actually ended the frame, not to where she started it. */
    if (this.ryu) {
      if (this.ryu.pilot) this.ryu.carry(this.ryu.pilot);
      this.ryu.update(dt, this.world);
    }
    /* OUTSIDE THE `if`, BECAUSE IT IS NOW WHAT MAKES HIM EXIST. It used to sit
       inside — a dragon already standing at the torii was the thing that asked
       "has anybody walked up to him yet" — and he does not arrive until this
       fires any more. See `_checkSummonScene`. */
    this._checkSummonScene();
    this.summonScene.updateSky(dt);
    this._updateSeek(dt);
    /* ...AND THE MINUTE SHE WAITS BEFORE MENTIONING ICEWHISKER. Right after
       the seek, because the question it asks is the one the seek answers: does
       anybody in the party already have Sense Mischief? "If they don't already
       have it enabled" — a hint telling you to go and fetch a thing you are
       holding is the game not looking at you. ANYBODY, not the nearest kitten:
       four girls share one screen and one of them pointing at the barrel is the
       hunt solved for all of them. */
    this.lastHunt?.update(dt, this.players.some((p) => !!p.clan?.buff?.seek));
    this._updateClanPrompt();

    /* --- the tournament ---
       AFTER the players have moved, like the music and the pandas, so the
       ring-out test and the camera both read where everybody actually ended
       the frame rather than where they started it. The quest runs whatever
       the tournament is doing (it is what opens the arena in the first
       place); the announcer runs always, because his card is allowed to sit
       over anything that is not a full-screen scene. */
    this.quest?.update(dt, this.players, this.input.players, this);
    /* BEFORE the tournament, and it matters at exactly one moment: eating is
       what tops a health bar up, and `Tournament._startFeast` reads those bars
       to decide what each kitten carries into the next round. Run the other way
       round, a rat swallowed on the last frame of the feast is a rat she
       watched vanish for nothing. */
    this.menagerie?.update(dt, this.players);
    this.tournament?.update(dt, this.input.players);
    this._arenaDoorman();
    /* AFTER the tournament, so the blast reads the positions the round has
       already finished moving — a kitten thrown onto the box on this frame is
       up there for this frame's notice test, not next frame's.
       ARMED ONLY WHILE HE IS IN HIS BOX AND THE ARENA IS OPEN. Both, because
       they can disagree: he is visible in the TOWN before the arena opens,
       where the blast must never fire, and the arena stays open while the
       girls fly home, where he is not. */
    this.satanBlast?.update(
      dt,
      !!this.tournament?.active && !!this.satan?.group.visible && !this.travel,
    );
    this.announcer?.update(dt);
    /* AFTER every camera has been drawn once more, which is when `see` has
       said whether anybody can look at the board. */
    /* THE FIREWORKS NEED AN AUDIENCE, NOT JUST A LENS. Reported: "The
       fireworks are also going off on the billboard when it shouldn't be,
       that should only happen if players are on the snake way bridge or
       infront of the billboard." They used to fire whenever any pane could
       see the glass, and a ring camera looking west over the stands can. Now
       a kitten has to be riding the arena's road or standing in the board's
       zone, and `see` still asks that a lens is actually showing it. */
    if (this.arenaBoard) {
      this.arenaBoard.audience = !this.tournament?.active
        && this.players.some((p) => !!p?.snakeRide?.road?.arena || this._boardWeight(p) > 0);
    }
    this.arenaBoard?.update(dt);
    this._updateSparks(dt);
    /* AFTER the tournament, because the tournament is what ends a round, and a
       round ending is one of the ways a triple slash stops being run. Asking
       first would hold everybody it caught for one extra frame past the gong. */
    this._updateTripleHolds(dt);
    /* AFTER the holds, and the ordering is the whole reason the seal explodes
       on the right frame. `_updateTripleHolds` frees everybody the technique
       caught on the frame `triAt` goes false; this reads the same flag, so
       running it second puts the seal coming apart and the bodies going
       flying in the SAME frame rather than one apart. Reversed, the seal
       bursts a frame early and the eye reads two events. */
    this.crossFx?.update(dt, this.players);
    /* AFTER crossfx and for the same class of reason: this reads positions
       that `Player.update` has already settled this frame, so the ring lands
       on where her sister IS rather than on where she was. */
    /* THE WORLD, because the thing she leaves behind FALLS now — it hangs for
       a second in the smoke and then drops, and a drop needs a floor to find.
       See `systems/dodgefx.js`. */
    this.dodgeFx?.update(dt, this.players, this.world);
    this.sweepFx?.update(dt, this.players, this.payne?.sweeper);
    this.parryFx?.update(dt, this.players);
    /* AND THE CLAN POWERS LAST OF THE THREE, for the same reason dodgefx runs
       after crossfx: the mark is drawn on the kitten it is following, and by
       here every position this frame is settled. */
    this.clanFx?.update(dt, this.players);
    this._updateBooms(dt);
    this._updateShake(dt);
    /* One flag, set where the fact becomes true. `ArenaQuest` needs to know
       Ryuuseki has been RIDDEN, not merely summoned, and there are two seats
       and four ways into them — asking here, every frame, is cheaper than
       finding all four. */
    if (this.ryu?.ridden) this.quest.rodeRyu = true;
    /* ...AND THE MOMENT IT BECOMES TRUE, BY ANY OF THE FOUR WAYS, THE BANNER
       SAYING HE IS HERE COMES DOWN. Asked here rather than at each of them for
       the reason the line above gives. */
    if (!!this.quest.rodeRyu !== !!this._ballsRode) this._updateBallHud();

    /* --- inside a grotto: take the roof off and look down into it ---

       A grotto is a sealed dome 21 units across and the follow camera sits ~19
       out and ~18 up, which is OUTSIDE it. Walking in put the kitten under an
       opaque grey lump: you could not see her, the maze, the crystals or the
       star — just rock. Two things fix it and it needs both.

       THE ROOF COMES OFF. Its own mesh (see World.placeDragonBalls) so it can
       simply stop drawing. Nothing about collision changes: the walls are
       solids and the `foot` rule still keeps dragons out, so this is purely
       what you can SEE.

       AND THE CAMERA STEEPENS, because taking the roof off is not enough on
       its own — at the normal pitch the sight line from the camera to a kitten
       inside passes through the outer wall on the near side at about 5 units
       up, and those blocks are 5 to 8.5 tall. Measured: at pitch 1.32 the same
       line clears the wall tops by a comfortable margin. The dojo does exactly
       this, for exactly this reason. */
    for (const G of this.world.grottos) {
      const inside = this.players.some(
        (p) => !p.mount && Math.hypot(p.position.x - G.x, p.position.z - G.z) < G.r * 0.94
      );
      G.roof.visible = !inside;
      /* The star's indoor marker: on only while somebody is in THIS grotto.
         It draws through the maze walls, so leaving it on outside would put a
         column of light up through the roof and hand the star away from the
         air — which is the whole reason a cave star has no ordinary beam. */
      for (const b of this.balls) {
        if (b.lock !== 'cave' || !b.indoorMark) continue;
        if (Math.hypot(b.position.x - G.x, b.position.z - G.z) < G.r) {
          b.indoorMark.visible = inside && !b.taken;
        }
      }
    }

    // Standing in the dojo frames the whole diagram from above.
    const dc = this.world.dojoCentre;
    let anyInDojo = false;
    for (const p of this.players) {
      const near = inDojoView(p, dc);
      anyInDojo = anyInDojo || near;
      /* The dojo wins if somehow both apply — there is no grotto on the maths
         island, so this can only ever be one of the two. yaw 0 squares the
         world x/z axes up with the screen, so the diagram reads exactly like
         the graph paper it's teaching. */
      const cave = near ? null : this.world.grottoAt(p.position.x, p.position.z);
      // Shadow Lionheart's two-shot (dream/shadow.js): only in the sim, so it
      // can never meet the Dojo, the grotto or the big screen.
      const shadowShot = near || p.mount ? null : this.dream?.shadow?.cameraFocus?.(p) ?? null;
      /* THE WAY ACROSS AND THE DOME (DreamDojo.cameraFocus): in close behind
         her for the stones, pulled back over the whole island inside the
         bubble. Never on the Dojo floor itself — `near` wins, so the maths
         camera is exactly what it was. */
      const dreamShot = near || shadowShot ? null : this.dream?.cameraFocus?.(p) ?? null;
      if (shadowShot) p.setFocus(shadowShot);
      else if (dreamShot) p.setFocus(dreamShot);
      else if (near) {
        p.setFocus({
          centre: dc,
          /* Was a hard-coded 104 while the merged rig read DOJO_DIST — so a
             solo kitten and a pair standing in the same room were framed by two
             different numbers, and changing "the Dojo distance" moved only one
             of them. */
          dist: this.device.touchPrimary ? DOJO_DIST.touch : DOJO_DIST.desktop,
          pitch: DOJO_PITCH,
          yaw: 0,
        });
      }
      else if (cave && !p.mount) {
        /* Centred on HER, not on the room. Framing the whole grotto would put
           the star on screen from the doorway and hand her the maze for
           nothing; this is an ordinary follow camera that has been tilted over
           far enough to see past the wall. */
        p.setFocus({ centre: p.position, dist: CAVE_DIST, pitch: CAVE_PITCH });
      } else if (!p.mount && this._boardWeight(p) > 0) {
        /* THE BIG SCREEN. "If players walk near or around the board, have the
           camera zoom out so they can see the board clearly and watch it while
           being around it." The weight is the zone's (1 in front of the glass,
           easing to 0 over its edge), so walking in is a blend; focusT then
           eases on top of it, as it does for the Dojo.
           THE SHOT IS ALREADY FITTED TO HER PANE'S ASPECT, so the pane-widen
           that `_updateCamera` multiplies every distance by is divided back
           out here — paying it twice would frame a narrow pane further back
           than it needs. */
        const w = this._boardWeight(p);
        const shot = boardShot(this.world.arenaBoard, [p.position], p.camera.fov, p.camera.aspect);
        const pw = Number.isFinite(p.paneWiden) ? Math.max(1, p.paneWiden) : 1;
        (p._boardCentre ??= new THREE.Vector3())
          .set(p.position.x, p.position.y + 1.4, p.position.z).lerp(shot.centre, w);
        p.setFocus({
          centre: p._boardCentre,
          aim: true,
          dist: THREE.MathUtils.lerp(26, shot.dist / pw, w),
          pitch: THREE.MathUtils.lerp(0.66, shot.pitch, w),
          yaw: THREE.MathUtils.lerp(-Math.PI * 0.25, shot.yaw, w),
        });
      } else p.setFocus(null);
    }
    /* AND THE BOARD IS PLACED ON THE FRAME IT APPEARS, not up to 50ms later.
       `_drawMaps` is throttled to 20Hz on purpose — it is the only 2D canvas
       work in the loop — but it is also the only thing that positions the
       board, so a kitten walking onto the unit circle got one tick of it in
       whatever corner the last split left it in before it jumped to hers.
       Costs one extra `_drawMaps` per Dojo entry and exit. */
    const boardWas = this._boardUp === true;
    this._boardUp = anyInDojo;
    if (boardWas !== anyInDojo) this._mapT = 1;
    this.mathBoard.classList.toggle('hidden', !anyInDojo);

    /* THE REAL WORLD FOLLOWS THE KITTENS WHO ARE IN IT. A party with one
       girl in the simulator has a centroid six thousand units out in the
       void, and the petals and the shadow frustum would go with it. */
    const mid = this._centroid(this._realMembers());
    this.world.update(dt, mid);
    this.world.focusShadows(mid.x, mid.z);

    /* No midpoint passed in any more: each rig works out its OWN group's
       centroid, and the party-wide one above is the world's, not the camera's. */
    this._updateSplit(dt);
    this._render();

    // The map only needs to be right, not smooth — a third of the frames is
    // plenty and keeps the 2D context off the hot path.
    this._mapT = (this._mapT ?? 0) + dt;
    if (this._mapT > 1 / 20) {
      this._mapT = 0;
      this._drawMaps();
      /* Riding the map's throttle rather than growing a second one. Both
         answer "what has changed on screen since a moment ago", neither is
         wanted per frame, and `_updateHint` no-ops unless its signature moved. */
      this._updateHint();
    }
  }

  /* --------------------------- joining and leaving ---------------------- */

  /**
   * Seat a new player on `device`, and put her straight into the picker.
   *
   * NOBODY ELSE IS INTERRUPTED, which is the whole requirement. The picker is a
   * card in the joining player's own corner and the world keeps running for
   * everyone already in it — the opposite of every other full-screen moment in
   * this game, and right for the same reason the star pose is per-player: this
   * is one kid's moment and stopping three other people's game for it is the
   * interruption the split screen exists to avoid.
   *
   * She is seated BEFORE she has chosen, on the first free cat, so the picker
   * can run through her real slot and her real pad rather than needing a second
   * path that reads a device with no slot.
   */
  /**
   * Seat a player on a controller somebody has picked up but nobody is playing.
   *
   * A CONNECTED CONTROLLER SHOULD BE A PLAYER, which is the whole of it. Three
   * pads plugged in used to give two kittens and one controller that did
   * nothing — it was dealt a device slot correctly and then sat unbound because
   * the party was two, so it read as broken hardware rather than as a party
   * that had not been grown. START still works and is still the explicit way
   * in; this is the same thing happening without anybody having to know that.
   *
   * IT WAITS FOR A PRESS OF A OR START, NOT FOR CONNECTION AND NO LONGER FOR
   * "this pad has sent something" — see `InputManager.sparePad`, which carries
   * the reasoning. The short version is that the old gesture was a flag that
   * never went back to false, so THIS method needed a permanent per-device
   * latch to stop the controller in a departing girl's hands re-seating her on
   * the next frame — and that latch is what "Joycon player is unable to join
   * after dropping out" was. A press edge needs no latch: it is true on one
   * frame, and asking again is a button she can press again.
   *
   * The character picker still runs, so nothing is decided for her.
   */
  _autoSeat() {
    if (this._sceneActive() || this.tournament?.fighting) return;
    /* ONE AT A TIME. `this.picking` is a single card, so seating a second
       player while the first is still choosing her cat would overwrite it and
       leave a kitten nobody picked. Three spare controllers queue up instead:
       each card appears as the one before it is confirmed.
       IT REFUSES OUT LOUD NOW, because it is a PRESS being refused rather than
       a pad sitting there waiting to be noticed: under the old gesture the
       offer was still on the table next frame, so saying nothing cost nothing.
       An edge is gone the moment it is dropped, and a button that does nothing
       reads as a broken controller — non-negotiable 6. */
    const device = this.input.sparePad();
    if (this.picking) {
      if (device) this.toast('Wait — someone is still choosing her cat', this.picking.index);
      return;
    }
    if (this.partySize >= MAX_PLAYERS || this.partySize >= this.input.seatable) return;
    if (!device) return;
    this._joinPlayer(device);
  }

  /**
   * Where a kitten who has just joined comes into the world.
   *
   * IT USED TO BE THE PARTY'S CENTROID PLUS THREE UNITS, and the reasoning
   * behind that was sound — "she is joining a game in progress, and a kitten
   * who appears two islands from her sisters has to walk before she can play".
   * What it missed is that the centroid of a party is not a PLACE. It is a
   * point in space that may be over open sky between two islands, inside a
   * house, or — reported from play, and the reason this exists — standing on
   * top of a clan leader, where two seconds of not moving opens her
   * introduction on a nine-year-old who has not yet worked out which cat she
   * is. A cutscene as the first thing that happens to you is indistinguishable
   * from the game having broken.
   *
   * SO THE TOWN SQUARE IS THE ANSWER, which is what Richard asked for: it is
   * the one place in the game every kid already knows, it is flat, it is
   * empty, and it is where the game itself sends people when it wants them
   * somewhere (`leaveArena` lands the griffin there). Arriving somewhere named
   * beats arriving somewhere merely near.
   *
   * ...UNLESS THE PARTY IS NOT ON THE HOME ISLAND AT ALL, and that half is not
   * a hedge. The town is unwalkable-to from the frost island and three hundred
   * units from the arena; putting her there while her sisters are at the
   * tournament is the fourth non-negotiable's stranding case arrived at from
   * the other direction — nobody is lost, but she cannot get to anybody and
   * has no way of knowing why. So the rule is: the town when the town is where
   * everyone is, and beside the party when it is not. Both then go through the
   * same search, so the leader case is closed either way.
   *
   * IT DEGRADES RATHER THAN VANISHING. Every failure returns the town centre
   * rather than a NaN or a point in the sky — a joining kitten who falls out
   * of the world is worse than one who has a walk ahead of her.
   */
  _joinSpot() {
    const home = this.world.islands[0];
    const mid = this._centroid(this._realMembers());
    const T = this.townCentre();
    const onHome = Math.hypot(mid.x - home.x, mid.z - home.z) <= home.radius;
    const want = onHome ? { x: T.x, z: T.z } : { x: mid.x, z: mid.z };

    const ok = (x, z) => {
      const g = this.world.heightAt(x, z);
      if (!g) return null;                    // open sky
      /* AND NOT IN SOMEBODY ELSE'S LAP. This function has no memory, so two
         kittens joining a second apart both asked the same question about the
         same town centre, both got yes, and both landed on the same point —
         two cats drawn exactly on top of each other, which reads as one cat
         and a join that did nothing. Force-spawn made it the normal case:
         ENTER, ENTER seats a third and fourth in the time it takes to press a
         key twice. Reported as "have some randomness when players spawn in the
         town, so they don't spawn right on top of each other."
         Asked of the LIVE positions rather than of a list of spots handed out,
         so it is also true of a kitten who was simply standing there. */
      for (const q of this.players) {
        if (!q) continue;
        if (Math.hypot(x - q.position.x, z - q.position.z) < JOIN_APART) return null;
      }
      /* NOT INSIDE ANYTHING, asked of the world's own solids rather than of a
         list kept here. `resolveSolids` pushes a body out of whatever it is
         standing in, so a point it declines to move is a point that is clear —
         which is the same question the walking code asks every frame, rather
         than a second opinion about it. */
      const s = this.world.resolveSolids(x, z, 0.9, g.y);
      if (Math.hypot(s.x - x, s.z - z) > 0.01) return null;
      /* AND OUT OF EVERY UNMET LEADER'S CIRCLE, with a couple of units over.
         `SCENE_RADIUS` is the distance `ShrineScene.watch` measures, so this
         cannot drift away from the rule it is avoiding. */
      for (const L of this.leaders ?? []) {
        if (L.met) continue;
        if (Math.hypot(x - L.position.x, z - L.position.z) < SCENE_RADIUS + 2) return null;
      }
      return { x, y: g.y, z };
    };

    /* A DIFFERENT BEARING EVERY TIME THIS IS ASKED. Without it the rings are
       walked in the same order for everybody, so the second kitten to join
       takes the first free spoke, the third takes the same one the second
       vacated, and four joins come out in a neat line pointing north-east.
       The rule above stops them overlapping; this is what stops them queueing.
       One draw for the whole search, not one per candidate, so the rings stay
       rings and the search stays exhaustive. */
    const spin = Math.random() * Math.PI * 2;
    let hit = ok(want.x, want.z);
    for (let ring = 1; ring <= 8 && !hit; ring++) {
      const r = ring * 3;
      const steps = 6 + ring * 3;
      for (let i = 0; i < steps && !hit; i++) {
        // The `+ ring` turns each ring off the last one's spokes, so eight
        // rings sample eight different bearings rather than one line outward.
        const a = (i / steps) * Math.PI * 2 + ring + spin;
        hit = ok(want.x + Math.cos(a) * r, want.z + Math.sin(a) * r);
      }
    }
    /* THE LAST RESORT IS STILL THE TOWN CENTRE, AND IT STILL MAY OVERLAP.
       Every rule above is a preference; this is the ninth non-negotiable's
       "degrade rather than vanish" applied to a join. A kitten standing on her
       sister is recoverable in one step of the stick. A kitten in the sky is
       not. */
    return hit ?? { x: T.x, y: T.y, z: T.z };
  }

  _joinPlayer(device) {
    if (this.partySize >= MAX_PLAYERS) return null;
    if (this.partySize >= this.input.seatable) {
      this.toast('No controller free for another player', 0);
      return null;
    }
    const index = this.partySize;
    this.partySize += 1;
    this.input.slots = this.partySize;
    // Bind the joining device to the new slot before anything reads it, or she
    // spends her first frames on whatever `_assign` would have given her.
    /* EXCEPT A FORCE-SPAWN SHADOW, WHICH IS DELIBERATELY NOT CLAIMED. She has
       no device of her own — she is sharing a keyboard set — and a claim is
       keyed to a slot, so claiming one would freeze the arrangement she joined
       under: plug a controller in afterwards and her set's primary moves while
       her claim does not, leaving her sharing with nobody. Unclaimed, the whole
       keyboard is re-dealt every frame by `_shadowPass`, which is what makes
       "one pad: WASD drives P2 and P4, the arrows drive P3" come out right
       without a rule saying so. */
    /* AND SHE TAKES THE KEYBOARD SHE LANDED ON, or the card this join is about
       to put up is one she cannot answer — see `handKeyboardTo`. */
    if (device?.shadow) this.input.handKeyboardTo(index);
    else this.input.claim(index, device);

    const p = this._seatPlayer(index, this._freeStyles()[0] ?? index);
    const at = this._joinSpot();
    p.position.set(at.x, at.y + 1, at.z);
    p.group.position.copy(p.position);

    this._buildHud();
    this._updateEconomyForParty();
    /* A KITTEN WHO JOINS AFTER THE DEBUG ENDGAME GETS THE SAME PURSE. Without
       this she is the one player standing at the stall who cannot afford
       anything, which is exactly the confusion that key exists to remove — and
       it looks like the shop being broken rather than like her being late.
       Only ever set by `_debugEndgame`; a real run leaves it undefined and this
       does nothing. */
    if (this._debugPurse != null) {
      /* NEVER DOWNWARD, the same rule `_unlockEndgame` states at length. It
         mattered the moment a rejoining kitten could arrive carrying the four
         hundred points she had earned before she put the controller down. */
      p.score = Math.max(p.score ?? 0, this._debugPurse);
      this.onScoreChanged(p);
    }
    this.picking = { index, style: this.roster[index] };
    this.sfx('orb');
    return p;
  }

  /**
   * A player drops out. The game must not notice beyond her being gone.
   *
   * HER ORBS GO WITH HER, AND COME BACK WITH HER. They used to be thrown on
   * the floor here — the dealer's supply rule read across from selling, where
   * a sold orb goes back on the shelf so the shop and a kitten cannot destroy
   * the world's twenty-six between them. Selling is not leaving. A girl who
   * puts the controller down for twenty minutes and picks it up again found
   * her whole neck gone and eight orbs distributed among whoever had been
   * standing nearest, which reads as the game taking them off her, and asked
   * for directly: "when a player leaves, they do not drop the kotodama orbs
   * now, but instead keep it, so if they rejoin, they will have their kotodama
   * orbs."
   *
   * NOTHING IS LOST AND NOTHING IS DUPLICATED, which is the half of the fourth
   * non-negotiable that actually binds. Her orbs are RESERVED, not destroyed:
   * `_rememberPlayer` writes the ids into the session's cast under her kitten's
   * name and `_recallPlayer` hands exactly those back. Twenty-six is still
   * twenty-six; some of them are simply in a pocket rather than on a hillside,
   * the same as if she were standing in the town square hoarding.
   *
   * AND IT IS HER CHOICE, NOT THE GAME'S. `_buildLeaveButtons` puts a DROP HER
   * ORBS row beside her DROP OUT row whenever she is wearing any, so a girl who
   * wants to leave them for her sister can — deliberately, before she goes,
   * and having been asked. The old behaviour was that decision made for her
   * every time.
   *
   * HER PANDA WAITS and her dragon goes home, which are the rules those animals
   * already have for an owner who is no longer there.
   *
   * SLOTS SHUFFLE DOWN, so the party is always slots 0..n-1 and nothing
   * downstream has to cope with a hole. That means the players after her change
   * index, and every index-keyed thing — her claim, her HUD badge, her map —
   * is rebuilt from the new order rather than patched.
   */
  _leavePlayer(index) {
    if (this.partySize <= 1 || !this.players[index]) return;
    const p = this.players[index];

    /* BUT NOT ANYTHING SHE ONLY BORROWED. 盗 Steal Mischief is a loan for the
       length of the fight, and leaving is not a way to end the fight still
       holding one. This used to be covered by accident: leaving tipped her neck
       on the floor, so `settleLoans` found the orb lying there. See
       `Kotodama.reclaimFrom` — it runs BEFORE the line below, so what gets
       written into her row is what is actually hers. */
    this.kotodama?.reclaimFrom(p);

    /* AND ANYTHING THE AWARD CEREMONY STILL OWES HER, PAID ON THE SPOT. A
       kitten who leaves between the Awakening and her turn would otherwise
       carry unpaid quests into her row and be handed a promise instead of the
       orbs she won. No card, no pose, no sound: she is not here to watch it.
       BEFORE `_rememberPlayer` below, so her row is written with the orbs. */
    this.feats?.settleOnLeave(p);

    /* WHAT SHE HAD, WRITTEN DOWN BEFORE ANY OF IT IS TAKEN OFF HER — ORBS AND
       ALL now. `p.powerOrbs` is the list of ids and nothing below clears it;
       what the lines further down remove is `wornOrbs`, which is the MESHES
       orbiting her shoulder and has to go because she is leaving the scene.
       The two have been confused here before, in the other direction, and cost
       a bug where her shells stayed spinning in the town after she left. */
    this._rememberPlayer(p);
    if (p.mount) { p.mount.returnHome?.(); p.mount = null; }
    if (p.rideAlong) p.rideAlong = null;
    /* HER PANDA IS NOT TOLD ANYTHING, and that line used to THROW. It read
       `p.panda.follows = false`, and `follows` is a getter with no setter on a
       class in a module — which is strict mode — so assigning to it raises a
       TypeError and took the whole of DROP OUT with it for any kitten who had
       ever raised a panda. Found while adding the panda to the save file.

       AND THE LINE WAS NEVER NEEDED. The animal only moves because something
       walks `this.players` and ticks it, and she is about to be spliced out of
       that list two lines down — so "her panda waits" is what happens by
       itself. It keeps its meshes, it keeps its tier, and `_recallPlayer` puts
       her back on it when somebody picks her up again. */
    if (p.pandaMount) { p.pandaMount.rider = null; p.pandaMount = null; }
    if (this.ryu?.pilot === p) this.ryu.pilot = null;
    if (this.ryu?.gunner === p) this.ryu.gunner = null;
    /* HER, AND EVERYTHING ORBITING HER, IN ONE CALL — `_undressPlayer`.
       This used to be three removals written out here, and the comment on them
       was a paragraph about the second one having been missing: "the rotating
       visual orbs stay on screen and are buggy", a kitten's worn shells parked
       in the town square for the rest of the game. Then the gold quest tokens
       became a third list, and the character picker became a third caller, and
       the same bug came back somewhere else. Every orb she owns hangs off
       `Player.orbRoot` now and one remove takes the lot.

       EMPTIED AS WELL AS REMOVED. `p` outlives this function; it is captured
       by the toast below and by anything else still holding her. A list of
       orbs that are no longer in any scene is a trap for whoever adds the next
       thing that walks one. */
    this.feats?.dropTokens(p);
    p.orbs = [];
    p.wornOrbs = [];
    this._undressPlayer(p);

    this.players.splice(index, 1);
    this.roster.splice(index, 1);
    this.partySize -= 1;
    this.input.slots = this.partySize;

    /* Re-index everyone after her AND re-deal the claims, in that order. A
       claim is keyed by slot, so leaving slot 1 of three would otherwise leave
       slot 2's controller pointing at a player who is now slot 1. */
    const claims = [];
    for (let i = 0; i < this.partySize + 1; i++) {
      if (i !== index) claims.push(this.input.claims[i]);
    }
    this.input.claims = {};
    claims.forEach((c, i) => { if (c) this.input.claim(i, c); });
    this.players.forEach((q, i) => { q.index = i; });

    if (this.picking?.index === index) this.picking = null;
    else if (this.picking && this.picking.index > index) this.picking.index -= 1;

    /* THE GROUPING IS KEYED BY SLOT, SO IT CANNOT SURVIVE A RE-INDEX. Every
       player after her just moved down one, and the hysteresis map still says
       what was true of the OLD numbering — so a stale entry would hold two
       kittens in one pane on the strength of a pairing that belonged to
       somebody who has left. Thrown away rather than patched, for the same
       reason the badges and the maps are rebuilt: one frame of first-principles
       grouping is invisible, and a wrong one is not. */
    this._clusterOf = null;
    this._reseedRigs();

    this._buildHud();
    this._updateEconomyForParty();
    this.tournament?.onPartyChanged?.();
    this.toast(`${p.name} left the game`, 0);
    /* AND WRITTEN DOWN IMMEDIATELY. The party is one smaller and her orbs have
       moved — either into the cast with her, or onto the ground if she used the
       row above first — and both are facts a save is made of. See
       `_saveOnPartyChange` for why this is not simply `_autoSave`. */
    this._saveOnPartyChange();
  }

  /**
   * The pause menu's DROP OUT rows, and the line telling a spare controller
   * how to get in.
   *
   * BUILT RATHER THAN WRITTEN OUT, and absent for a solo kitten. `MenuNav`
   * finds its items by querying `.menu-btn` inside the open panel, so buttons
   * appearing and disappearing here are picked up for free.
   *
   * PLAYER 2 CAN LEAVE NOW, AND SHE COULD NOT BEFORE. The old rule was
   * `partySize > 2`, written when one kitten was a state this game could not
   * represent: the only thing DROP OUT could do at two was leave somebody alone
   * in a co-op game, so it was not offered. Solo is a real game on both tiers
   * now — it is what PLAY opens on — so the row that was protecting her is
   * instead a sister who joined by leaning on ENTER and can never get out
   * again, which is the silent refusal the sixth non-negotiable forbids.
   *
   * PLAYER 1 IS STILL NOT OFFERED ONE, and that is not the same rule wearing a
   * smaller number. Slot 0 is the seat every scene, every camera and every menu
   * owner falls back to; "drop out" for her means ending the game, and the
   * button for ending the game is RESTART, two rows down and already guarded.
   *
   * AND A DROP-HER-ORBS ROW BESIDE HER, WHEN SHE IS WEARING ANY. Leaving used
   * to empty her neck into the town automatically; now she keeps them, so the
   * generous thing — leaving eight orbs where her sister can find them — has to
   * be a thing somebody can actually DO. It is offered next to the button it
   * belongs to, and only to the kittens who have a DROP OUT row at all: player
   * 1 is not leaving, and she has had a drop pile on the Character Profile
   * since trading was written.
   *
   * IT IS NOT THE SAME AS DROPPING OUT AND IT DOES NOT IMPLY IT. She can drop
   * her orbs and carry on playing. Pressing it rebuilds these rows, so the row
   * disappears once she has nothing left to put down — a button that stays
   * after it has run out of work reads as broken the second time it is pressed.
   */
  _buildLeaveButtons() {
    const wrap = document.getElementById('leave-buttons');
    const note = document.getElementById('join-note');
    /* THE QUIT ROW SAYS WHICH OF THE TWO THINGS IT DOES. Under the five
       minutes nothing is written down (see `saveByHand`), and a row that still
       read SAVE & QUIT GAME would be promising a save that is not coming —
       the sixth non-negotiable, on the one button whose whole name is a
       promise. Retitled here rather than in the markup because it depends on a
       clock: `setPaused(true)` rebuilds these rows on the way in, so the words
       are right for the afternoon as it is at the moment she looks at them. */
    const quit = document.querySelector('[data-action="quit"]');
    if (quit) {
      quit.textContent = this.playT >= AUTOSAVE_AFTER
        ? 'SAVE & QUIT GAME'
        : 'QUIT GAME — TOO SHORT TO SAVE';
    }
    if (!wrap) return;
    wrap.textContent = '';
    if (this.partySize > 1) {
      for (let i = 1; i < this.partySize; i++) {
        /* HER ORBS FIRST, BECAUSE IT IS THE STEP THAT COMES FIRST. Asked for
           as "they can decide to drop the orbs before dropping out" — so the
           row that is a precondition sits above the row it is a precondition
           for, and a thumbstick going down the list meets them in that order.
           It is also the safer of the two to land on by accident. */
        /* WORN AND BAGGED: "drop her orbs" means every orb she has, and an
           orb left in her bag would be the one her sister came for. */
        const worn = (this.players[i].powerOrbs?.length ?? 0) + (this.players[i].orbBag?.length ?? 0);
        if (worn) wrap.appendChild(this._orbDropButton(i, worn));

        const b = document.createElement('button');
        b.className = 'menu-btn';
        b.textContent = `${this.players[i].name.toUpperCase()} — DROP OUT`;
        /* No cursor fix-up needed after this: `MenuNav.update` re-queries the
           panel's items every frame and clamps its remembered index, so a row
           vanishing under the highlight is already handled. */
        b.addEventListener('click', () => {
          /* Asked for the same reason as RESTART, and it matters MORE here:
             this row sits directly above RESTART in the list, it is the only
             button whose words change depending on who joined, and what it
             throws away belongs to one specific child. */
          this.confirm.ask({
            title: `${this.players[i].name.toUpperCase()} LEAVES THE GAME?`,
            /* THE SENTENCE HAS TO SURVIVE GOING DOWN TO ONE. "The screen
               splits between the ones who are left" is a lie when the one left
               is player 1 on a full-screen view, and a dialog that describes
               the wrong outcome is worse than one that describes none. */
            /* AND THE SENTENCE HAS TO SURVIVE HER KEEPING HER ORBS, which
               is the thing that just changed. "Her points and her orbs go with
               her" was TRUE of the points and a lie about the orbs — they were
               tipped onto the ground as she went — and it is now true of both.
               Saying she gets them back if she returns is the whole reason the
               row above exists: without that sentence, a girl who wants to
               leave them for her sister has no reason to look for the button
               that does it. */
            body: `${this.players[i].name}'s kitten goes away and `
              + (this.partySize > 2
                ? 'the screen splits between the ones who are left. '
                : 'you carry on by yourself. ')
              + 'She keeps her points and her orbs, and gets them all back if '
              + 'she joins again later.'
              + (worn ? ' To leave her orbs behind instead, say no and use'
                + ' the row above first.' : ''),
            no: 'NO, SHE STAYS',
            yes: `YES, ${this.players[i].name.toUpperCase()} DROPS OUT`,
            onYes: () => {
              this._leavePlayer(i);
              this._buildLeaveButtons();
            },
          });
        });
        wrap.appendChild(b);
      }
    }
    if (note) {
      /* NAME THE KEY rather than describing the mechanism. "A spare controller
         or keyboard set can press START" is a sentence that assumes you already
         know which set is spare — and which one that is moves with the number
         of controllers plugged in. See `InputManager.joinHint`. */
      const join = this.input.joinHint();
      note.textContent = join
        ? ` Press ${join} in game to join as player ${this.partySize + 1}.`
        : '';
    }
  }

  /**
   * `NAME — DROP HER 3 ORBS`, for the pause menu.
   *
   * IT GOES THROUGH `Kotodama.drop`, which is the same call the Character
   * Profile's drop pile makes, so there is one rule for putting an orb on the
   * ground and not two. That matters for three things this would otherwise
   * have to re-invent and get subtly wrong: the orbs are FANNED rather than
   * stacked on one point (eight pickups at one coordinate is one orb's worth
   * of geometry z-fighting with itself), each one is marked `shyOf` her so her
   * own pickup radius does not hand them straight back on the next frame, and
   * an orb that cannot find ground is DECLINED rather than deleted.
   *
   * WHICH IS WHY THE COUNT COMES BACK AND IS SAID OUT LOUD. "Dropped 3 of 8 —
   * no room for the rest" is a real outcome on a slope, and a button that said
   * "dropped them" would be the menu lying about where her orbs are. Sixth
   * non-negotiable.
   *
   * IT ASKS FIRST, and the question is not a formality: they land inside her
   * own circle and stay hers until she walks away, but the moment she does
   * they are anyone's — and this is a menu four children are pushing at.
   */
  _orbDropButton(i, worn) {
    const b = document.createElement('button');
    b.className = 'menu-btn';
    b.textContent = `${this.players[i].name.toUpperCase()} — DROP HER `
      + `${worn} ORB${worn === 1 ? '' : 'S'}`;
    b.addEventListener('click', () => {
      const p = this.players[i];
      if (!p) return;
      this.confirm.ask({
        title: `${p.name.toUpperCase()} PUTS HER ORBS DOWN?`,
        body: `${p.name}'s ${worn} Kotodama go on the ground where she is`
          + ' standing. They stay hers until she walks away from them — after'
          + ' that anybody can pick them up. She does not leave the game.',
        no: 'NO, SHE KEEPS THEM',
        yes: `YES, PUT ${worn === 1 ? 'IT' : 'THEM'} DOWN`,
        onYes: () => {
          /* THE LIST IS COPIED. `drop` takes them off her as it goes, so
             handing it the live array is iterating a thing while emptying it. */
          const n = this.kotodama?.drop(p, [...(p.powerOrbs ?? []), ...(p.orbBag ?? [])]) ?? 0;
          if (!n) {
            this.toast('Nowhere to put them down here — try somewhere flatter',
              p.index);
            this.audio?.play('deny');
          } else {
            this.toast(`${p.name} dropped ${n} orb${n === 1 ? '' : 's'}`, p.index);
            /* AND THE WORLD HAS CHANGED IN A WAY A SAVE CARES ABOUT: three
               orbs that were on a kitten are now lying in the town at three
               particular places. See `_leavePlayer` for why that is worth a
               save of its own. */
            this._saveOnPartyChange();
          }
          /* REBUILT EITHER WAY. On success the row has no work left and must
             go; on failure the count on it is still right and rebuilding is
             how the cursor gets re-seated on a list that may have changed
             under it. */
          this._buildLeaveButtons();
        },
      });
    });
    return b;
  }

  /** Re-price and re-stock the dealer for the party as it is now. One call, so
   *  joining and leaving cannot each grow their own copy of the rule. */
  _updateEconomyForParty() {
    this.kotodama?.forParty(this.partySize);
  }

  /**
   * WHICH CAT IS IN SEAT `index`.
   *
   * A SEAT IS NOT A CAT. `this.roster` exists precisely because the two come
   * apart — the character picker lets player 3 choose Blossom, which makes the
   * roster `[0, 1, 3, 2]` — and nine places in this file and its systems were
   * passing a seat number to `styleCss`/`styleFor` as though it were a style
   * index. Every one of them was right for the girls' usual game and wrong the
   * first time a third player picked a cat that was not her seat's default.
   *
   * Reported from four-player play as "Storm and Blossom have the wrong border
   * colours", which is what two seats' worth of that looks like: her frame,
   * her score's ring, her wedge on the map, her panda's pip and the name on
   * the map tag all belonging to the sister who took her default.
   *
   * Anything holding the PLAYER should read `player.style` through `cssFor`
   * instead; this is for the callers that only have a seat — a score badge for
   * a slot, a menu owner, a pane's group members.
   */
  _styleAt(index) {
    return this.roster?.[index] ?? index;
  }

  /** Style indices nobody is playing, in roster order. */
  _freeStyles() {
    const used = new Set(this.roster.slice(0, this.partySize));
    return PLAYER_STYLE.map((_, i) => i).filter((i) => !used.has(i));
  }

  /**
   * Drive the join card: left/right change the cat, JUMP confirms.
   *
   * SHE IS FROZEN WHILE IT IS UP, through the game's existing dead-pad trick,
   * so the stick that is choosing a cat is not also walking her off a cliff.
   * Everyone else's pad is untouched.
   */
  _updatePicker() {
    const card = document.getElementById('join-card');
    if (!this.picking) { card?.classList.add('hidden'); return; }

    const { index } = this.picking;
    const pad = this.input.players[index];
    const free = [...this._freeStyles(), this.roster[index]].sort((a, b) => a - b);

    let moved = 0;
    if (pad?.pressed?.('map') || (pad && pad.mx > 0.6 && !this._pickHeld)) moved = 1;
    if (pad && pad.mx < -0.6 && !this._pickHeld) moved = -1;
    this._pickHeld = !!pad && Math.abs(pad.mx) > 0.6;

    if (moved) {
      const at = free.indexOf(this.roster[index]);
      const next = free[(at + moved + free.length) % free.length];
      this._seatPlayer(index, next);
      this.picking.style = next;
      this._buildHud();
      this.sfx('menu');
    }
    if (pad?.pressed?.('jump')) {
      const p = this.players[index];
      this._placeFromSave(p);
      this.picking = null;
      card?.classList.add('hidden');
      this.sfx('clan');
      this.toast(`${p.name} joined the game!`, index);
      return;
    }

    const p = this.players[index];
    card.classList.remove('hidden');
    card.style.borderColor = styleCss(this.roster[index]);
    card.innerHTML = `<b>PLAYER ${index + 1}</b>`
      + `<span class="jc-name" style="color:${styleCss(this.roster[index])}">`
      + `${p.name.toUpperCase()}</span>`
      + `<span class="jc-hint">◀ STICK ▶ to change · JUMP to start</span>`;
  }

  /**
   * Rebuild the score badges and the minimaps for the CURRENT party.
   *
   * Called at boot and again whenever somebody joins or leaves, which is why
   * none of this is written out in index.html: a scoreboard with two names
   * hardcoded into the markup cannot grow a third.
   *
   * THE BADGES MIRROR WHICH SIDE OF THE SCREEN EACH PANE IS ON, asked of
   * `splitLayout` rather than assumed, so a kid in a left-hand pane looks left
   * for her score. With two players that puts P1 left and P2 right, which is
   * exactly where they already were.
   *
   * AND WITH THREE OR FOUR IT IS NOW A SIDE PER PLAYER RATHER THAN PER PANE,
   * which is a real thing proximity grouping took away and is worth being
   * honest about. A player's pane is no longer her slot number — it depends on
   * who she is standing next to, and it changes as she walks — so a badge that
   * tracked the pane would slide from one side of the screen to the other every
   * time two kittens met. A badge you cannot find is worse than a badge on the
   * wrong side, so the badges are laid out by PLAYER and stay put: the two-
   * player rule above still holds exactly, and above two the badges read as one
   * scoreboard along the top with a coloured pip and a name on each.
   */
  _buildHud() {
    const left = document.getElementById('scores-left');
    const right = document.getElementById('scores-right');
    const maps = document.getElementById('maps');
    left.textContent = '';
    right.textContent = '';
    maps.textContent = '';
    this.maps = [];

    const n = this.partySize;
    // Four badges plus the counter overflow a narrow window at the two-player
    // size, and it is the rightmost kitten's score that falls off the edge.
    document.getElementById('hud').classList.toggle('hud-four', n > 2);
    // Ask the layout which half of the screen each pane sits in. The merged
    // view has one pane, so fall back to the split layout for the ordering.
    const panes = splitLayout(n, 1000, 1000, 0, this.settings.dir);

    for (let i = 0; i < n; i++) {
      /* HER cat, not her seat — `styleFor(i)` printed the name of whoever
         normally sits in slot `i`, so two players who swapped cats in the
         picker swapped names on the scoreboard as well. See `_styleAt`. */
      const style = styleFor(this._styleAt(i));
      const css = styleCss(this._styleAt(i));

      const badge = document.createElement('div');
      badge.className = `score p${i + 1}`;
      badge.innerHTML = `<span class="pip"></span><span class="nm"></span>`
        + `<b id="score-${i}">0</b><span class="clan" id="clan-${i}"></span>`;
      badge.querySelector('.pip').style.background = css;
      /* THE SAME COLOUR THE PANE IS FRAMED IN — that pairing is the whole
         point, so it is written from `styleCss` here rather than restated in
         the stylesheet, exactly as the pip already was. `--seat` is what the
         inset ring in `.score` reads. */
      badge.style.setProperty('--seat', css);
      badge.querySelector('.nm').textContent = style.name.toUpperCase();
      ((panes[i]?.x ?? 0) > 0 ? right : left).appendChild(badge);
    }

    /* NOW PUT BACK WHAT THE REBUILD JUST ERASED.
       The badges above are built from a template that hard-codes `0` and an
       empty clan, which is right exactly once — at boot, when that is also the
       truth. Every other caller rebuilds a HUD for a game already in progress,
       and this method is called on JOIN and on LEAVE.
       Reported as "everybody's clan and points get wiped when a player joins",
       and the thing that makes it nasty is that it is only ever the HUD that
       is wrong: `p.score` and `p.clan` are untouched, and the badge silently
       repaired itself the next time she happened to knock something over. So
       three sisters watched their scores go to zero and their clans vanish,
       and then come back one at a time, which reads as the game losing their
       progress and grudgingly refunding it.
       Painted from the players rather than remembered across the rebuild,
       because the DOM is the copy here and the player is the original. */
    for (const p of this.players ?? []) {
      if (p.index >= n) continue;              // mid-leave, before the splice settles
      const el = document.getElementById(`score-${p.index}`);
      if (el) el.textContent = p.score ?? 0;
      this._updateClanBadge(p);
    }

    /* ONE MAP PER WINDOW NOW, AND WHICH PANE GETS WHICH IS STILL DECIDED EVERY
       FRAME.

       IT USED TO BE TWO, WHATEVER THE PARTY. The argument was that a quadrant
       is a quarter of the screen, a map sized to stay legible eats a real
       fraction of it, and four of them means four corners of the game covered
       up at exactly the moment there is most to look at. That is true and it
       was the wrong trade, because of what it cost at the other end: players 3
       and 4 had no map in their own window, and `nearestMap` had to hand them
       a share of somebody else's — which is where every "it zoomed the wrong
       minimap" report came from. Asked for directly: "let's add 2 more
       optional mini-maps so that there is 1 mini-map per screen, so that
       players 3 and 4 have a minimap. Whenever a player presses the zoom
       button, it will zoom the minimap that is in the split screen they are
       on. This should solve some of the issues we are having with players
       zooming in/out the wrong minimaps."

       IT SOLVES THEM BY CONSTRUCTION RATHER THAN BY A NEW RULE. `nearestMap`
       answers "the map in my own pane, or failing that the nearest box" — with
       one in every pane the second half is simply unreachable, and there is
       nothing left to disagree about. `assignMaps` and `keyMaps` are untouched
       and come out right on their own: every pane is its own incumbent, so
       nothing ever moves house.

       AND THE OLD ANSWER IS A SETTING, because the argument for it was never
       wrong on a small window — see the `Minimaps` row in index.html.

       TWO PLAYERS ARE BIT-IDENTICAL EITHER WAY. Two panes and two maps is the
       same screen whichever row is picked, and one shared screen hides the
       second map under both. Fifth non-negotiable, for free.

       THE COUNT IS THE PARTY SIZE AND NOT THE PANE COUNT, because the panes
       are re-clustered every frame and these boxes are DOM elements built on
       join and leave. A map with nowhere to be comes back -1 from `assignMaps`
       and `_drawMaps` hides it, which is the same path the second map has
       always taken on a merged screen.

       Everybody is drawn ON every map regardless; what this decides is how
       many copies of the archipelago are on screen, not who appears on them. */
    const nMaps = this.settings.maps === 'two' ? Math.min(n, 2) : n;
    for (let i = 0; i < nMaps; i++) {
      const box = document.createElement('div');
      box.className = 'map-box';
      box.id = `map-box-${i}`;
      const canvas = document.createElement('canvas');
      canvas.id = `minimap-${i}`;
      const tag = document.createElement('span');
      tag.className = 'map-tag';
      tag.id = `map-tag-${i}`;
      /* NO COLOUR HERE. A map belongs to a PANE, not to a player — see
         `_drawMaps` — so the one thing this tag's colour cannot be derived
         from is `i`, which is why it is written there, next to the name it
         has to agree with. */
      box.append(canvas, tag);
      maps.appendChild(box);
      /* A phone opens zoomed IN — see TOUCH_ZOOM. Tapping the map still cycles
         all the way out to world zoom; this is only where it starts. */
      this.maps.push(new Minimap(canvas, this.world, i,
        { zoom: this.device.touchPrimary ? TOUCH_ZOOM : 1 }));
    }
    /* THE BADGES WERE JUST REPLACED, so the force-spawn dimming has to be put
       back with everything else the rebuild erased — see the note above about
       scores and clans, which is the same failure arrived at from a different
       direction. No-op unless a keyboard set is actually shared. */
    this._markKeyboardOwners();
    this._resize?.();
  }

  /**
   * Which pane a player's own view is being drawn in, or -1.
   *
   * The HUD needs this and the renderer needs it and they must not work it out
   * separately — the pane index is `groups`' index, and a second opinion about
   * it is how a map ends up drawn across somebody else's half of the screen.
   */
  _paneOf(index) {
    return (this.groups ?? []).findIndex((m) => m.includes(index));
  }

  /**
   * WHICH PANE EACH MAP IS IN, this frame.
   *
   * `assignMaps` in core/split.js owns the rule and the argument for it —
   * pure, next door to the pane geometry it is a function of, and therefore
   * assertable. This remembers the answer, because the rule needs last
   * frame's to be stable.
   */
  _mapPanes(groups) {
    this._mapPane = assignMaps(
      groups.map((m) => m.length), this._mapPane, this.maps.length
    );
    return this._mapPane;
  }

  /**
   * Which map player `index` drives — hers if her pane has one, otherwise the
   * one nearest her corner of the screen.
   *
   * IT USED TO BE HER OWN PANE'S MAP OR NOTHING, and at three and four players
   * that means somebody has no zoom button. `nearestMap` in core/split.js owns
   * the rule and the argument for it; this is the plumbing.
   *
   * THE PANES ARE RECOMPUTED HERE RATHER THAN REMEMBERED. `_panes` is pure and
   * already runs three times a frame for exactly this reason — renderer, HUD
   * and minimaps all have to agree — so a fourth call on a bumper press is
   * both free and the only way to be certain this answer is the same one
   * `_drawMaps` used to place the boxes. Caching it here would be a second
   * opinion about where the panes are, which is how a map ends up being driven
   * from the wrong side of the screen.
   */
  _mapForPlayer(index) {
    if (this.merged) return this.maps.length ? 0 : -1;
    /* THE FALLBACK IS DECIDED FIRST AND THEN USED FOR BOTH QUESTIONS. It used
       to ask `_paneOf` — which reads `this.groups` and nothing else — before
       working out the fallback two lines down, so on the one frame before the
       first `_clusters()` the pane came back -1 and the button toasted "no map
       on screen" while two of them were being drawn. Half a fallback is worse
       than none: it looks like it covers the case and does not. */
    const groups = this.groups?.length ? this.groups : [this.players.map((_, i) => i)];
    const pane = groups.findIndex((m) => m.includes(index));
    if (pane < 0) return -1;
    const panes = this._panes(window.innerWidth, window.innerHeight, groups);
    /* THE ASSIGNMENT IS READ, NOT RE-DECIDED. `_mapPanes` remembers last
       frame's answer BECAUSE the rule needs it — so calling it here would be
       this press taking part in a decision that belongs to the drawing. The
       fallback covers the one frame before `_drawMaps` has ever run. */
    const owner = this._mapPane ?? this._mapPanes(groups);
    /* AND WHERE THE BOXES REALLY ARE — see `nearestMap`. Read, never derived,
       for the same reason `owner` is: a second copy of the layout arithmetic
       is a second thing that can disagree with the screen. On the one frame
       before `_drawMaps` has ever run there is nothing to read and the
       fallback is the old pane-centre rule, which is the right failure. */
    return nearestMap(panes, owner, pane, this._mapSpot, window.innerHeight);
  }

  /**
   * Every map, positioned ON THE SEAM OF THE PANE THAT OWNS IT.
   *
   * The corner is computed from the same `splitLayout` the renderer uses. It
   * used to be four CSS rules keyed off `hud-split` / `hud-horizontal`, which
   * was survivable while there were exactly two panes in one of two
   * arrangements and is not with quadrants: the HUD would have needed its own
   * idea of where pane 3 is, and two copies of that rule is how a map ends up
   * drawn over somebody else's half of the screen.
   *
   * THE MAPS MOVED TO THE INSIDE OF THE SPLIT. Every one used to sit in the
   * bottom-LEFT of its own pane, which is an OUTSIDE corner for half of them —
   * so on a side-by-side split the two maps were as far apart as two boxes on
   * one screen can be, and neither girl could read her sister's. They hug the
   * seam now, so the panes' maps meet in the middle and either kitten either
   * side of it can glance at whichever is nearer. `mapSpot` in core/split.js
   * owns the arithmetic and is pure, so `world-check` can assert it.
   *
   * WHICH PANE OWNS WHICH MAP IS `_mapPanes`, not the map's index. That used
   * to be the same thing, and it is what put a map in Storm's pane with
   * Blossom's name on it once the panes could be shuffled underneath them.
   *
   * AND THE MATHS BOARD IS PLACED FROM THE SAME PANES — see `_drawMathBoard`,
   * called from the bottom of this. Two boxes that have to stay out of each
   * other's way must be positioned by one function or they will not.
   */
  _drawMaps() {
    const hud = document.getElementById('hud');
    hud.classList.toggle('hud-split', !this.merged);
    hud.classList.toggle('hud-horizontal', this.settings.dir === 'horizontal');
    /* Is the Dojo's sin/cos board up? `mapWidth` shrinks a phone's map while it
       is, and `_drawMathBoard` needs the same answer. It used to also set a
       `hud-math` class on `#hud` "so the CSS can move the map" — no rule ever
       consumed it, and a class nobody reads is a comment that lies about where
       the layout lives. */
    const mathUp = !document.getElementById('math-board').classList.contains('hidden');

    const W = window.innerWidth;
    const H = window.innerHeight;
    const groups = this.groups?.length ? this.groups : [this.players.map((_, i) => i)];
    const panes = this._panes(W, H, groups);
    const owner = this._mapPanes(groups);
    /* What already sits in a top corner, measured once per draw and only if a
       phone's split map asks — see `cornerSpot`. */
    let cornerBlocks = null;

    for (let i = 0; i < this.maps.length; i++) {
      const box = document.getElementById(`map-box-${i}`);
      const tag = document.getElementById(`map-tag-${i}`);
      if (!box) continue;
      const pane = owner[i] ?? -1;
      /* ...and NOT in a pane that is in the Dream Dojo's simulator: a map of
         the archipelago, with her arrow twelve thousand units off its edge, is
         a map of a place she is not in. The pane is all hers there anyway. */
      const shown = pane >= 0 && !!panes[pane] && !!groups[pane]?.length
        && !this.dream?.paneIsSim(groups[pane]);
      box.classList.toggle('hidden', !shown);
      /* A HIDDEN BOX HAS NO PLACE ON SCREEN, and leaving last frame's would
         let `nearestMap` measure to where a map used to be. It is cleared here
         and in the merged branch below — the two paths that do not set one —
         rather than only where it is written, so there is no arrangement that
         can carry a stale answer. */
      (this._mapSpot ??= [])[i] = null;
      if (!shown) continue;

      const v = panes[pane];
      /* The map's size is `mapWidth` in core/split.js — pure, next door to the
         pane geometry it is a function of, and therefore assertable. It used to
         be forty lines of comment and one expression inline here, which is why
         nothing checked it.

         THE WIDTH IS SET INLINE, so no stylesheet rule can override it — a
         `body.touch-ui .map-box` width in style.css is silently dead. */
      const size = mapWidth({
        paneW: v.w,
        paneH: v.h,
        screenH: H,
        /* AND THE SCREEN'S WIDTH, which is half of "is this pane a quadrant"
           — the other half of what `MAP_QUAD_DOWN` asks. Without it a pane
           that is half the screen across cannot be told from one that is all
           of it, which is exactly how a girl playing on her own ended up with
           the quadrant's map. */
        screenW: W,
        touch: this.device.touchPrimary,
        merged: this.merged,
        mathUp,
        /* HOW MANY KITTENS ARE IN THIS PANE — see `MAP_QUAD_DOWN`. `groups`
           and not `this.players`: a pane is a cluster, and two sisters who
           have walked back together share one whether the setting says side
           by side or not. */
        solo: (groups[pane]?.length ?? 1) <= 1,
      });
      box.style.width = `${size}px`;

      if (this.merged) {
        /* THE SHARED MAP KEEPS THE BOTTOM RIGHT. The Dojo's sin/cos board owns
           bottom-left and runs to 42vw, so the one map on screen has always
           gone the other side and never collided with it.

           EXCEPT ON A TOUCH DEVICE, WHERE BOTH BOTTOM CORNERS BELONG TO THUMBS.
           The stick's catchment is the bottom-left and the face cluster is the
           bottom-right, so a map in either one is under a hand — and worse, it
           is under a hand that is trying to press something. Top-left is the
           only corner left: the scoreboard is top-centre and pause is top-right.
           This is also why it does not simply shrink and stay put; a smaller map
           in the wrong place is still in the wrong place. */
        const thumbs = this.device.touchPrimary;
        if (thumbs && mathUp) {
          /* IN THE DOJO THE MAP GIVES UP THE CORNER. The board is now top-left
             (see style.css) because bottom-centre put it over the diagram the
             island exists to teach, so the map crosses to top-right — the last
             free edge, since both bottom corners are thumbs and top-centre is
             the scoreboard. Below the pause button, which is 42px tall at the
             top of that side, rather than beside it: a map tucked under pause
             is still tappable, a map overlapping it steals the tap that leaves
             the game. */
          box.style.left = 'auto';
          box.style.right = '10px';
          box.style.top = '58px';
          box.style.bottom = 'auto';
        } else {
          /* HARD INTO THE CORNER ON A PHONE. It sat at 46px to stay under the
             scoreboard — but the scoreboard is CENTRED and the map is at the
             left edge, so at any party size the two only meet if a name grows
             far enough to reach across, and a name clipping the corner of a map
             is a better trade than giving up the corner permanently. */
          box.style.left = thumbs ? '8px' : 'auto';
          box.style.right = thumbs ? 'auto' : '14px';
          box.style.top = thumbs ? `${Math.round(v.h * 0.02) + 8}px` : 'auto';
          box.style.bottom = thumbs ? 'auto' : '14px';
        }
      } else {
        /* ONE CALL, AND NO BRANCHES LEFT IN HERE. `mapSpot` decides the corner
           from the pane and the frame; every arrangement — side by side,
           stacked, quadrants, the uneven pair — falls out of the same two
           questions, and the Dojo no longer needs a case of its own because
           the board is at the far end of the same pane rather than under the
           map. `top`/`left` only, so a stale `bottom` or `right` from the
           merged branch above cannot pin the box to two edges at once. */
        /* ON A PHONE, THE TOP OUTER CORNER — see `cornerSpot`. "the minimaps
           are not in the corners of the screen ... lets move it there or make
           it work somehow to use the limited screen space better." Null for a
           pane that does not reach the top of the screen, and in the Dojo,
           where `_drawMathBoard` can take a pane's top outer corner for the
           board; both keep the seam rule below. */
        const spot = (this.device.touchPrimary && !mathUp
          && cornerSpot({ v, W, H, size, avoid: cornerBlocks ??= this._cornerBlocks() }))
          || mapSpot({ v, W, H, size, pad: 14, hint: HINT_CLEAR });
        box.style.right = 'auto';
        box.style.bottom = 'auto';
        box.style.left = `${spot.left}px`;
        box.style.top = `${spot.top}px`;
        /* WHERE IT REALLY ENDED UP, REMEMBERED FOR THE BUMPER. `nearestMap`
           used to measure pane centre to pane centre and got a stacked split
           wrong: a map lives in the corner of its pane NEAREST THE SEAM, so
           two maps in panes directly above one another can be drawn at
           opposite ends of the screen, and the near one by pane centre is the
           far one by eye. Recorded here rather than re-derived there for the
           reason `_mapPane` is: this is the drawing, and a second copy of the
           arithmetic is a second thing that can disagree with the screen. */
        (this._mapSpot ??= [])[i] = {
          x: spot.left + size / 2, y: spot.top + size / 2,
        };
      }

      /* THE TAG NAMES WHOEVER IS IN THE PANE, read off the group rather than
         off the map's index. A map shared by a whole pane cannot fly one
         kitten's name — labelling it EMBER while Frost is standing in the same
         shot invites the obvious question — and a map that has moved to a pane
         its index does not own must not claim to be somebody else's, which is
         precisely what "it says STORM and Blossom is standing in it" was.
         `_mapPanes` can put either map in any pane now, so there is no index
         left to guess from and the group is the only true answer. */
      const members = groups[pane];
      const shared = members.length > 1;
      if (tag) {
        /* THE KEY IS THE ONE THAT ACTUALLY DRIVES THIS MAP, ASKED OF THE ONE
           FUNCTION THAT DECIDES IT. This used to ask `_mapForPlayer(0)` and
           `_mapForPlayer(1)` itself — the same two questions the keydown
           listener asked — so when those two came back with the same map the
           label agreed with the bug rather than exposing it: one box read
           "· Z" and the other read nothing, while X quietly turned the first
           one. `_keyMaps` is now the only place that answer exists, and this
           reads it, so a label that names a key is a label that key really
           turns.
           A pane holding neither key's box is driven by a pad and says
           nothing; naming a key nobody in that pane can press is the label
           lying, which is what the whole tag is here to stop. */
        const [zMap, xMap] = this._keyMaps();
        const key = zMap === i ? ' · Z' : xMap === i ? ' · X' : '';
        /* THE KITTENS STANDING THERE, not the cats who normally have those
           seats. `styleFor(members[0])` is a seat number read as a style index
           and labelled the pane STORM while Blossom was standing in it. Two
           names fit in a badge and four do not, so past two it counts them. */
        const names = members.map((m) => (this.players[m]?.name ?? '').toUpperCase());
        const who = names.length > 2 ? `${names.length} KITTENS` : names.join(' + ');
        tag.textContent = this.merged ? 'Z: ZOOM' : `${who}${key}`;
        /* ...and the same rule for its colour, which used to be written once
           at build time from the MAP's index. A shared pane has no one owner,
           so it goes back to the stylesheet's cream. */
        tag.style.color = shared || this.merged
          ? '' : cssFor(this.players[members[0]]?.style);
      }

      /* Centre on the group, not on one kitten, whenever the pane holds more
         than one — the same rule the merged view has always followed, now asked
         per pane instead of once for the whole screen. */
      this.maps[i].focusIndex = shared ? null : members[0];
      this.maps[i].focusOn = members;
      this.maps[i].draw(this.players, this.dragons, this.kotodama, this.satan,
        this.ryu, this._seekMarkFor(members), this._payneGoalFor(members), this.payne);
    }

    this._drawMathBoard(panes, groups, W, H, mathUp);
    /* AND ANY WARNING ON SCREEN MOVES WITH THE PANES. Riding this throttle
       rather than growing one of its own, exactly as `_updateHint` does: both
       are "something about the shape of the screen has changed", neither is
       wanted per frame, and this returns before it asks the layout anything
       unless a warning is actually up. */
    this._placeWarnings();
    /* ...and Payne's card, which sits on top of the warning and so moves with
       exactly the same things. */
    this.payne?.layout();
  }

  /**
   * The page rects a phone's corner map must not land on: the pause button
   * and the scoreboard. MEASURED, for the reason `mapSpot`'s `clear` is — the
   * scoreboard is a row of badges whose width moves with the party, and the
   * pause button's size is the stylesheet's to decide. A hidden element has a
   * zero rect and is dropped, so a phone with the stick switched off (no pad,
   * no pause button) gets the true corner.
   */
  _cornerBlocks() {
    const out = [];
    for (const sel of ['#touch-pad .tp-pause', '.scoreboard']) {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      if (r && r.width > 0 && r.height > 0) {
        out.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
      }
    }
    return out;
  }

  /**
   * The Dojo's sin/cos board, IN THE PANE OF WHOEVER IS ACTUALLY IN THE DOJO.
   *
   * IT USED TO BE ONE FIXED CORNER OF THE WHOLE SCREEN — `left: 16px; bottom:
   * 46px; width: min(540px, 42vw)` in the stylesheet — and every part of that
   * is wrong once the screen is split four ways. 42vw is 806px of a 960px
   * quadrant, so the board was wider than most of the pane it landed in; it
   * landed in the bottom-left pane whoever was standing on the unit circle;
   * and it was drawn under the minimap, which carries a `z-index` while the
   * board carried none. Reported as all three at once: covering the player,
   * behind the map, and in somebody else's window.
   *
   * SO IT IS PLACED LIKE A MAP, FROM THE SAME PANES, at the corner of its pane
   * FURTHEST from the middle of the screen — `mapSpot`'s `inner: false`. The
   * map has the seam corner, the board has the outside corner, and the kitten
   * drawing the diagram is between them instead of under either.
   *
   * THE PANE IS THE ONE WITH THE MOST KITTENS IN THE DOJO, not the first one
   * found. Two sisters on the circle and one girl who wandered in on her own
   * are two panes with a claim, and the board belongs with the pair — that is
   * the same "worth most" rule `_mapPanes` uses, and it has to be, or the two
   * would answer the same question differently and cross over.
   *
   * IT MEASURES ITS OWN HEIGHT rather than deriving one. The board is a title
   * and a canvas whose height comes from the canvas's aspect and the width it
   * is given, and this file has no business knowing either — `world-check`
   * cannot run a layout engine, and a reasoned number here would be wrong the
   * first time the canvas changed shape. One frame of a stale height on a
   * resize is invisible; a wrong constant is not.
   */
  _drawMathBoard(panes, groups, W, H, mathUp) {
    const el = this.mathBoard;
    if (!el) return;
    const st = el.style;
    /* BACK TO THE STYLESHEET WHEN THERE IS NOTHING TO PLACE IT AGAINST. An
       empty string removes the inline rule rather than overriding it with a
       guess, so the unsplit desktop keeps its bottom-left corner and a phone
       keeps the top-left one `body.touch-ui #math-board` gives it. */
    const toSheet = () => {
      st.left = ''; st.right = ''; st.top = ''; st.bottom = ''; st.width = '';
    };
    /* A HIDDEN BOARD IS PUT BACK ON THE STYLESHEET RATHER THAN LEFT WHERE IT
       WAS. This used to return early on `!mathUp` and keep its inline corner,
       so the next time it appeared it appeared in the pane of whoever was in
       the Dojo LAST TIME — for one tick, in somebody else's window. Nothing is
       on screen while this runs, so it costs nothing. */
    /* A MERGED SCREEN IS NOT A REASON TO GIVE UP ANY MORE, and that early
       return is the whole of the next report. See `shared` below — the
       one-pane case is now refused down there, on whether the pane is really
       one kitten's, rather than up here on whether the screen is split. */
    if (!mathUp) { toSheet(); return; }

    const dc = this.world?.dojoCentre;
    if (!dc) { toSheet(); return; }
    let best = -1;
    let bestN = 0;
    groups.forEach((members, g) => {
      /* A KITTEN ON A DRAGON IS STILL OVER THE DOJO, and this used to say
         `!p.mount`, which is where the second half of the bug was. `anyInDojo`
         one screen up has never cared how she got there, so flying in turned
         the board ON — and then this found nobody standing on the circle, fell
         through to `toSheet()`, and dropped the board into the bottom-left
         corner of the WHOLE SCREEN, in whoever's pane happened to be there.
         Reported as exactly that: the overlay appearing in a pane belonging to
         somebody who is not at the Dojo.

         The two have to agree about who counts, and the answer that makes
         sense of the room is that she does: she is looking straight down at
         the unit circle from thirty units up, which is the best view of it in
         the game. The one thing that must not happen is the board appearing
         over a sister who is somewhere else entirely. */
      const n = members.filter((i) => inDojoView(this.players[i], dc)).length;
      if (n > bestN) { bestN = n; best = g; }
    });
    const v = best >= 0 ? panes[best] : null;
    if (!v) { toSheet(); return; }

    /* SIZED AGAINST THE PANE, not against the window. 42% is the fraction the
       stylesheet has always used and the only thing that changes is what it is
       42% OF — which is the whole of "the board covers the player" in a
       quadrant. The 540px ceiling is the stylesheet's and is kept so a shared
       screen and a big pane come out the same.

       EXCEPT IN A PANE HOLDING MORE THAN ONE KITTEN, WHERE IT TAKES ITS FULL
       SIZE AND THE TOP CORNER. The 42% is a rule about not covering the player
       whose window this is, and it stops being that rule when the window
       belongs to two or three of them: side by side, a pair sharing a pane got
       42% of 960 — a 403px board, against the 540 the same board gets on an
       unsplit screen — and the Dojo's whole reason to exist came out too small
       to read. Reported from play as exactly that, with the remedy named:
       "make it the full size it would normally be, and move it to the top-left
       of the screen, as close to the corner as we can without overlaying the
       players UI elements on the top."

       WHY THE TOP RATHER THAN A BIGGER BOARD IN THE SAME PLACE. `mapSpot` puts
       the board in the outer BOTTOM corner and the pane's map in the inner one,
       which is an arrangement that only works while the board is small enough
       to leave a corner over. At 540 in a 960-wide pane it is most of the
       bottom edge, and the two kittens the board is FOR are standing on the
       circle underneath it. The top-outer corner is the only one nothing else
       claims — the scoreboard is centred — and it is what was asked for.

       AND THE SAME IS TRUE OF A PANE THAT IS TALLER THAN IT IS WIDE, however
       many kittens are in it. Three sisters together and one on her own is a
       62/38 split SIDE BY SIDE (see `splitLayout`), so the girl on her own
       plays in a column — 730 by 1080 on a 1080p screen — and 42% of that is a
       307px board with a thousand pixels of empty height beside it. Reported
       as exactly that: "the Sin/Cos screen is too small. Should take up nearly
       the entirety of the width of the screen, as it is a smaller screen with
       the entire height of the window screen."

       SO THE RULE IS ABOUT THE PANE'S SHAPE, NOT THE PARTY'S SIZE. In a
       portrait pane the width is the scarce axis and the height is the
       plentiful one: the board takes the width and the top, and the kitten
       below it still has most of a tall window to be seen in. In a landscape
       pane nothing changes, which is every quadrant, every stacked half and
       the unsplit screen — the two-player game a player has not deliberately
       set side by side is bit-identical, and so is four-player quadrants.

       THE PORTRAIT LIFT IS GONE AND 540 IS THE CEILING EVERYWHERE. It used to
       be lifted in a portrait pane, on the argument that capping a 730-wide
       column at 540 leaves the board 26% narrower than the space it was asked
       to fill. Reported from play, and the report is about the shape that
       argument never considered: "when there is 1 player in the dojo and in
       the Sin/Cos UI screen, when there are 2 players in the game, the UI is
       too big. Should be the same size as when there are 3 players and 2
       players are in the Sin/Cos dojo together."

       TWO PLAYERS SIDE BY SIDE IS A 958-WIDE COLUMN, which is portrait, so the
       lift fired and handed a girl on her own a 930px board — nearly the whole
       pane, drawn over the circle she is standing on. The lift was tuned
       against the 62/38 four-player split, where the lone column is 730 wide
       and 702 is defensible; nothing told it the same branch also covers a
       half-screen that is 30% wider.

       SO THE CEILING IS ONE NUMBER AGAIN AND IT IS `mathSharedWidth`'S. Which
       is exactly what the report asks for: the three-player pane is landscape,
       so 540 is what the pair sharing it already gets, and "the same size as"
       is satisfied by using the same function. WHAT IT COSTS is the case the
       lift was put in for — that 730-wide column drops 702 to 540. Said out
       loud because it is a partial walk-back of an earlier ask; what made that
       ask reasonable was the 307px board it replaced, and 540 is still most of
       the way there and is the size the board has on a screen nobody split. */
    const shared = (groups[best]?.length ?? 0) > 1;

    /* AND TWO KITTENS ON ONE SCREEN IS A SHARED PANE TOO — WHICH IS THE ONE
       CASE THE RULE ABOVE COULD NEVER REACH. Reported from play: "if
       split-screen is set to Top and Bottom and two players are in the Dojo of
       the Turning Circle together, the Sin-Cos UI is very small for some
       reason. It gets bigger when there are 3 players."

       IT GETS BIGGER AT THREE BECAUSE THREE IS WHERE THE SCREEN SPLITS. Two
       kittens standing on the circle together is `allInDojo` in `_clusters`,
       which forces ONE view — and this function used to return on
       `this.merged` before it had looked at anything, dropping the board back
       on the stylesheet's `min(540px, 42vw)`. On any window under about
       1290px that 42vw is the binding term, so the board came out a few
       hundred pixels narrower than the 540 a shared PANE is given. Put a
       third sister somewhere else and the screen splits, the pair's pane goes
       down the `shared` branch, and the board jumps to full size — the exact
       "it gets bigger with three" in the report, and the tell that the merge
       was what did it.

       THE SPLIT DIRECTION IS A RED HERRING HERE, and worth saying so: two
       kittens in the Dojo are merged whichever way the setting points, so
       Top/Bottom was what was on rather than what was wrong.

       ONE PANE AND ONE KITTEN IN IT IS STILL THE STYLESHEET'S, UNTOUCHED.
       That is the solo desktop game and a phone, both of which have a hand-
       tuned corner in `style.css` that this function has no business
       overriding — and `toSheet` here rather than a computed 42% is what
       keeps them byte for byte. The fifth non-negotiable is about the game at
       two not moving under a four-player rule; this moves it at two ON
       PURPOSE, because the report is a two-player report. */
    if (panes.length < 2 && !shared) { toSheet(); return; }

    const tall = v.h > v.w;
    const full = shared || tall;
    /* AND ONE PANE IS NOT A SHARED PANE FOR THE PURPOSE OF MOVING HOUSE.
       Measured, after the version that did move it: on a 1280x720 window two
       kittens in the Dojo got a 481px board, DOWN from the stylesheet's 537,
       because the top corner drags the whole scoreboard-and-map dodge below
       in with it — and on an unsplit screen the map is in the other bottom
       corner, so that dodge is paying for a collision that cannot happen.
       The bottom-outer corner is where this board has always lived on a
       screen nobody has split, and there is nothing up there it needs to
       escape. So `full` still means "take the full width" and `toTop` is the
       separate question "is there something in the bottom corner". */
    const toTop = full && panes.length > 1;
    /* A SHARED PANE GETS ONE WIDTH, AND IT IS BOTH THE FLOOR AND THE CEILING.
       `mathSharedWidth` in core/split.js owns the number and the whole
       argument for it — pure, next door to the pane geometry, assertable.

       IT IS TESTED BEFORE `tall` ON PURPOSE. The portrait branch below lifts
       the 540 cap so a kitten playing ALONE in a column gets a board that
       fills her width, and a side-by-side split makes every pane portrait —
       so two sisters sharing one were handed a 930px board drawn over the
       pair of them. Reported as "too big when there are 2 people in one split
       screen... make it the same size as when there are 3 people in one split
       screen", and the three-player pane is landscape, so 540 is exactly what
       it was already getting. One kitten in a column keeps the lift. */
    /* ONE EXPRESSION FOR BOTH HALVES OF `full`, and that is not a tidy-up —
       it is the fix. `shared` and `tall` used to take two different branches
       that happened to write the same arithmetic with one term different, and
       the term was the ceiling. `mathSharedWidth(v.w)` IS
       `max(1, min(540, v.w - 28))`, so a shared pane and a portrait pane now
       cannot disagree about how wide the board is, whatever the window does. */
    let w = full
      ? mathSharedWidth(v.w)
      : Math.min(540, Math.round(v.w * 0.42));
    /* HOW SMALL THE TWO COLLISION DODGES BELOW MAY MAKE IT. 180 is the old
       floor and the argument for it stands — under that the board is
       unreadable and a map-sized hole is the better trade. A SHARED pane's
       floor is its one width, because "always at least the 3 people size when
       more than 1 person in the same split screen" is half of what was asked
       for, and a dodge that undercut it would be the too-small report coming
       back by a different route. What it costs is a few pixels of board over
       the corner of a map on a window narrow enough to need both, which the
       board's new transparency (see `#math-board` in style.css) lets you read
       straight through. Measured at 858x477: ten pixels. */
    const floorW = shared ? mathSharedWidth(v.w) : 180;
    /* AND ON ONE SCREEN IT STOPS BEFORE THE MAP SIDEWAYS, not downwards.
       The two boxes share the bottom edge there — board on the left, map on
       the right, which `mapSpot` calls the "unsplit arrangement" and has
       always produced — so the axis they can collide on is x, and the
       `toTop` branch's vertical shrink below would be measuring the wrong
       one. Measured at 858x477: a full-size board reaches x=554 and the map
       starts at x=544, ten pixels of overlap, which is the kind of thing that
       only shows up on somebody's laptop. Asking the same two functions that
       place the map is exact by construction, the same argument the vertical
       version makes. The 180 floor is that branch's too: below it the board
       is unreadable and a map-sized hole is the better trade. */
    if (full && !toTop) {
      const mapAt = mapSpot({
        v,
        W,
        H,
        size: mapWidth({
          paneW: v.w, paneH: v.h, screenH: H, screenW: W,
          touch: this.device.touchPrimary,
          merged: this.merged, mathUp: true,
          /* The same pane's own occupancy the map itself is sized with, or
             this dodge would be measuring to a map that is not the one on
             screen. `best` is the pane holding the Dojo, chosen above. */
          solo: (groups[best]?.length ?? 1) <= 1,
        }),
        pad: 14,
        hint: HINT_CLEAR,
      });
      const room = mapAt.left - 28;          // her own 14 of pad, and 14 of gap
      if (room > floorW) w = Math.min(w, Math.round(room));
    }
    st.width = `${w}px`;
    let h = el.getBoundingClientRect().height || Math.round(w * 0.78);
    const spot = mapSpot({ v, W, H, w, h, pad: 14, hint: HINT_CLEAR, inner: false, top: toTop });
    /* HOW FAR DOWN THE SCOREBOARD REACHES IS MEASURED, NOT ASSUMED, and only
       asked when the two would actually meet across the screen. It is a
       centred row of badges whose count and whose NAMES change with the party,
       so its width is not something this file can know — and the ask was "as
       close to the corner as we can", which means the drop has to be nothing
       at all when the corner is free. Degrades to the bare corner if the
       scoreboard is missing, which is the pause menu's own case. */
    let top = spot.top;
    if (toTop) {
      const sb = document.querySelector('.scoreboard')?.getBoundingClientRect();
      if (sb?.height && spot.left < sb.right && spot.left + w > sb.left) {
        top = Math.max(top, sb.bottom + 8);
      }
      /* AND IT STOPS BEFORE THE MAP. The board owns the top of the pane now
         and the map still owns the bottom, which is only an arrangement while
         there is a gap between them — on a short window a 540-wide board is
         tall enough to reach down into the map, and this whole function exists
         so that two boxes in one pane cannot collide.
         `mapWidth` is the same pure call `_drawMaps` makes a few lines up, so
         the reservation cannot disagree with the map that actually gets drawn.
         SHRINK RATHER THAN CLIP: the board is a diagram whose height follows
         its width, so narrowing it is the one adjustment that keeps all of it
         on screen. It is measured again afterwards because the canvas's aspect
         is the canvas's business, not this file's.

         WHERE THE MAP IS IS ASKED, NOT ARITHMETIC. The first version added up
         the map's size, its padding and the hint line by hand and came out
         sixteen pixels short — because `mapSpot` lifts a box off the bottom of
         the SCREEN by `HINT_CLEAR` and that term was missing. Asking the two
         functions that actually place the map is exact by construction and
         cannot drift from them.
         IT RESERVES THE SPACE WHETHER OR NOT THIS PANE HAS A MAP. Under
         `Minimaps: Only two, shared` there are two maps and up to four panes,
         so some panes have none — and the cost of reserving anyway is a
         slightly narrower board
         on a window short enough to be shrinking it already, against a
         collision if `_mapPanes` moves a map in here on a later frame. */
      const mapAt = mapSpot({
        v,
        W,
        H,
        size: mapWidth({
          paneW: v.w, paneH: v.h, screenH: H, screenW: W,
          touch: this.device.touchPrimary,
          /* `this.merged` AND NOT A HARD `false`, now that this branch can be
             reached on an unsplit screen. It was false because it could only
             ever run on a split one; on a merged screen `mapWidth` sizes the
             map differently, and a reservation made for the wrong map is a
             reservation that can leave the board sitting on it. */
          merged: this.merged, mathUp: true,
          /* NO `solo`, DELIBERATELY: this reserves the space a map MIGHT take
             and the full-size answer is the safe direction to be wrong in. */
        }),
        pad: 14,
        hint: HINT_CLEAR,
      });
      const room = mapAt.top - 14 - top;
      /* A FEW PASSES, BECAUSE THE HEIGHT IS NOT PROPORTIONAL TO THE WIDTH.
         The board is a title and a padded box around a canvas: `h = a·w + c`,
         and scaling by `room / h` therefore always lands a little tall by the
         fixed part — measured, eight pixels of overlap left on the first try,
         which is a board still touching the map. Each pass removes the same
         fraction of what is left, so two is normally enough and three is the
         cap. It only runs on a window short enough to need it; every real
         screen leaves the board its full size and never enters this branch. */
      for (let pass = 0; pass < 3 && h > room && room > 60; pass++) {
        w = Math.max(floorW, Math.round(w * (room / h)));
        st.width = `${w}px`;
        h = el.getBoundingClientRect().height || h;
      }
    }
    st.right = 'auto';
    st.bottom = 'auto';
    st.left = `${spot.left}px`;
    st.top = `${top}px`;
  }

  /** Swearing to a clan: a toast, a coloured badge, and a recoloured ring. */
  onJoinClan(player, clan) {
    /* Pandapaw is sticky. Every other clan's buff switches off the moment you
       swear somewhere else, but a panda you fed forty canes to is not a stat —
       taking it away for changing your mind about a shrine is the kind of
       punishment that makes a kid stop experimenting. She keeps it. */
    if (clan.buff.panda) player.raisedPanda = true;
    /* Leaving Pandapaw with a grown panda: say so. It stops heeling the
       instant she swears somewhere else, and a pet that silently isn't behind
       you any more is the kind of thing a kid notices two islands later and
       concludes she has lost. */
    if (!clan.buff.panda && player.panda?.rideable) {
      this.toast(
        `${player.pandaName} won't follow you now — it's waiting where you left it`,
        player.index
      );
    }
    // Name the BUFF, not just the clan — the whole reason to cross an island
    // is what you get, and a nine-year-old shouldn't have to infer it.
    this._updateClanBadge(player);
    this.toast(`${player.name} joined ${clan.name} — ${clan.buff.label}!`, player.index);
    /* AND SAY IT AGAIN OVER HER HEAD, because the toast is at the top of a
       screen she is not looking at: she is looking at her kitten, in her own
       quarter, having just pressed a button. Six seconds and then it fades —
       long enough to read twice, short enough that it is gone before she has
       walked out of the ring. Ten would be too long; a caption parked over the
       picture stops being read and starts being in the way, which is the whole
       risk of putting text on a character. */
    player.setCallout(`${clan.name.toUpperCase()} — ${clan.buff.label.toUpperCase()}`, 6);
    if (clan.buff.panda) {
      /* COMING HOME GETS IT UP, on the same press that swears her in. A kitten
         who wandered off to Riverclaw and has come back should not have to
         press interact twice in the same square metre for two halves of one
         thing — see the other half in `Player`'s interact branch, which is the
         case where she was already sworn here. BEFORE `_updatePanda`, because
         that one now refuses to touch a knocked-down panda at all. */
      this._restorePanda(player);
      this._updatePanda(player);
      const left = toNextTier(player.bambooCut, player.pandaFedFrom, player.panda?.tier ?? -1);
      if (left && !player.panda) {
        this.toast(
          `Cut ${left} bamboo and a panda cub will follow ${player.name}!`,
          player.index
        );
      }
    }
    this._celebrateClan(player, clan);
  }

  /**
   * The two and a half seconds after a kitten swears to a clan for the first
   * time: she takes the blessing, her leader dances, and her own camera pulls
   * in to watch.
   *
   * IT IS PER PLAYER AND NOT A CUTSCENE, which is the same decision — and the
   * same paragraph — as the found-a-star pose it is built on. `holdAloft`
   * already owns the camera move (see `Player._updateCamera`), so in split
   * screen the other three panes never notice: they are playing, and the girl
   * who did the thing is the only one being shown it. Stopping four kittens'
   * game to congratulate one of them is exactly the interruption the split
   * screen exists to avoid.
   *
   * ONCE PER CLAN PER KITTEN. Swearing somewhere you have sworn before is a
   * correction — you wandered into the wrong hall, or you are swapping back —
   * and the oath still works every time. Only the ceremony is spent once.
   * `clansSworn` lives on the player so a restart clears it with everything
   * else.
   *
   * IT REFUSES OFF THE FLOOR. A kitten mounted, carried or knocked out cannot
   * reach a hall anyway; the guard is here so that if one ever can, the pose
   * degrades to nothing rather than drawing a cat standing in mid-air with her
   * paws up. Prefer a rule that degrades over one that vanishes.
   */
  _celebrateClan(player, clan) {
    if (!player || !clan) return;
    if (player.clansSworn.has(clan.id)) return;
    /* THE GUARD COMES BEFORE THE SPEND, so a ceremony she could not watch is
       not counted as one she has had. She cannot reach a hall mounted or
       knocked out today; if she ever can, the right outcome is that the
       moment waits for her rather than being burned in a frame she was a
       ghost for. */
    if (player.mount || player.rideAlong || player.ko || player.angel) return;
    player.clansSworn.add(clan.id);

    /* THE EMBLEM IS THE CLAN'S OWN, AND A COLOURED ORB IF IT IS MISSING.
       `holdAloft(null)` already draws a warm sphere, so a clan with no emblem
       sheet loses a picture and keeps the moment — ninth non-negotiable, same
       rule as the voices. The halo carries the clan's colour either way, so
       even the fallback is Thunderpaw gold rather than a generic prize.

       `flat` BECAUSE AN EMBLEM IS A DRAWING AND NOT A PRIZE. The dragon ball
       route paints its stars round the sphere, which is right for a sphere and
       wrong for a logo — see the note in `holdAloft`.

       AND THE ORB IS TINTED ONLY WHEN THERE IS NO EMBLEM. A texture goes
       through the same `color` as a multiply, so tinting a gold bolt gold
       burns it to brown and tinting the panda's cream face green ruins the
       one emblem that is deliberately not its clan's colour. The fallback
       sphere has no texture to spoil, so it takes the colour and reads as
       "this clan" without a picture at all. */
    const emblem = this.clanArt?.[clan.id]?.texture ?? null;
    player.holdAloft(emblem, CLAN_POSE, { flat: true, tint: clan.color });
    if (!emblem && player.aloft) player.aloft.material.color.set(clan.color);
    /* AND THE SHARED RIG IS TOLD, which is the whole of the "it zooms for a
       dragon ball but not for a clan" report. `holdAloft` moves HER camera,
       and hers is not the one drawing when she is sharing a pane with a
       sister. See `aloftShot` in `_updateRig`. */
    this.aloftShot = { player, t: CLAN_POSE, dur: CLAN_POSE };

    /* HER LEADER, NOT EVERY LEADER. Four kittens can be in four different
       halls, and six cats bouncing because one of them swore somewhere else is
       the tell that this is a global flag rather than a reaction. */
    this.leaderFor(clan)?.cheer(CLAN_POSE);
    this.sfx('clanJoin');
  }

  /**
   * Rebuild the worn geometry from `player.powerOrbs`.
   *
   * THE MESHES ARE REBUILT WHOLESALE, NOT PATCHED, and that is not laziness:
   * each orb's shell radius, orbit speed and starting phase are derived from
   * its SLOT and from how many she is wearing (see `PowerOrb`), so adding a
   * fifth orb changes where the other four should be. Patching one in leaves
   * eight orbs bunched into the three phases the first three were given.
   * Eight icosahedrons is nothing; a wrong-looking constellation is not.
   */
  syncOrbMeshes(player) {
    for (const o of player.wornOrbs ?? []) player.orbRoot.remove(o.group);
    player.wornOrbs = buildWornOrbs(player.powerOrbs);
    for (const o of player.wornOrbs) {
      // Every worn orb rains, and none of them print numbers — _applyMath.
      o.setMathVisible(this.mathVisible);
      /* HER BAG, NOT THE SCENE — see `Player.orbRoot`. Every orb she owns has
         one parent, so one remove takes the lot and no teardown can forget a
         list. */
      player.orbRoot.add(o.group);
    }
  }

  /** The scoreboard, after anything that moves a purse rather than earns it. */
  onScoreChanged(player) {
    const el = document.getElementById(`score-${player.index}`);
    if (el) el.textContent = player.score;
  }

  /**
   * Say out loud what the Awakening just did.
   *
   * IT NAMES THE COUNT EVEN WHEN IT WAS 0-0. The prize is handed out on a tie
   * and a tie includes neither of them having collected anything, so without
   * this the two girls get an orb each for no stated reason and learn nothing
   * about where it came from. Two toasts, one per half of the screen, because
   * in split screen a single toast is a message half the players never see.
   */
  /**
   * The Awakening, and everything that has to happen on its frame.
   *
   * ONE DOOR, BECAUSE THERE ARE TWO WAYS IN — the real last prop and the debug
   * unlock — and the quests have to be settled by both. `feats.onAwaken` runs
   * AFTER `awaken`, so it can record the plain-orb prize `awaken` just paid.
   *
   * @param lastPlayer whoever hit the last prop; null from the debug unlock,
   *   which has nobody to hand "The very last one" to
   */
  _awaken(lastPlayer = null) {
    const result = this.kotodama.awaken();
    this._announceAwakening(result);
    if (result) this.feats?.onAwaken(lastPlayer, result);
    return result;
  }

  _announceAwakening(result) {
    if (!result) return;
    this.sfx('powerorb');
    // Every kitten's tally, not the first two — the comparison is what decides
    // who is given a prize, so it has to name everybody it compared.
    const tally = this.players
      .map((p, i) => `${p.name} ${result.counts[i] ?? 0}`).join(', ');
    for (const p of this.players) {
      this.toast(`THE KOTODAMA AWAKEN — ${tally}`, p.index);
    }
    /* WHO WON THE COUNT, NOT WHAT SHE GOT FOR IT. The orb itself is drawn at
       her turn in the award ceremony now, like every other quest's — saying
       "Ember is given 疾 Hayate" here and again on her card thirty seconds
       later would be the same prize announced twice, and the first of the two
       would land under the ending. */
    for (const p of result.winners) {
      this.toast(`${p.name} collected the most — an orb is waiting for her at the ending`,
        p.index);
    }
    this.toast('Powerup Kotodama are scattered across the islands', 0);
    this.toast('A dealer has opened a stall in the market', 1);
  }

  _giveOrb(player, { quiet = false } = {}) {
    player.orbs = player.orbs ?? [];
    const n = player.orbs.length;
    const orb = new Orb({
      radius: 3.2 + n * 0.9,
      speed: 1.15 - n * 0.18,
      phase: (n * Math.PI * 2) / 3,
      color: player.index === 0 ? 0x7fe3ff : 0xffa8dc,
      height: 1.7 + n * 0.5,
    });
    /* EVERY plain orb draws its working, which is what `_applyMath` has always
       done to the ones already out — this line said `&& n === 0` and was the
       only place the two disagreed, so the second orb she picked up came up
       blank and then lit itself the next time anybody pressed M. */
    orb.setMathVisible(this.mathVisible);
    player.orbRoot.add(orb.group);      // her bag — see `Player.orbRoot`
    player.orbs.push(orb);
    if (quiet) return;
    this.sfx('orb');
    this.toast(`${player.name} found a Kotodama Orb!`, player.index);
  }

  /**
   * The distance between the two kittens furthest apart, within `members`.
   *
   * With two players sharing a view this is exactly
   * `players[0].distanceTo(players[1])`, which is what every number tuned
   * against it — MERGE_IN, MERGE_OUT, the shared camera's pull-back — was tuned
   * on. With more, the widest pair is the one the camera has to cope with, and
   * a rig framed on the closest pair crops the rest of its own group out.
   */
  _spread(members = this.players.map((_, i) => i)) {
    /* THE SAME SET `_centroid` USES, and they have to be the same set or the
       camera aims at one group and sizes itself for another. See `_camIgnores`
       for the knocked-out kitten lying outside the ring that this drops. */
    const live = this._framed(members);
    let d = 0;
    for (let a = 0; a < live.length; a++) {
      for (let b = a + 1; b < live.length; b++) {
        const p = this.players[live[a]];
        const q = this.players[live[b]];
        if (p && q) d = Math.max(d, p.position.distanceTo(q.position));
      }
    }
    return d;
  }

  /**
   * The biggest island, corner to corner, in world units. 192, as it happens.
   *
   * Measured off `world.islands` rather than written down, for the same reason
   * the minimap measures its own bounds: the islands are generated, so a
   * constant here would be a number that used to be true. Cached because they
   * do not move — the arena is among them from the start, hidden or not.
   */
  _islandSpan() {
    if (this._islandSpanCache != null) return this._islandSpanCache;
    const isl = this.world?.islands ?? [];
    if (!isl.length) return 0;    // no world yet; the caller falls back
    this._islandSpanCache = Math.max(...isl.map((i) => i.radius)) * 2;
    return this._islandSpanCache;
  }

  /** How far back a camera may EVER sit: the distance that fits one whole
   *  island across this pane. See the note at its one call site. */
  /** How much of the big screen's shot this kitten gets, 0..1. See
   *  `boardZoneWeight`; one place asks it so the two cameras cannot disagree. */
  _boardWeight(p) {
    if (!p?.position) return 0;
    /* NOT WHILE A MATCH IS ON, AND NEVER FOR AN ANGEL. Reported: "Camera is
       zooming out weirdly during the arena battle during feast, it may be
       affected by the billboard next to the arena we added." It was. The
       zone is outside the west stands and a kitten on the deck can never be
       in it, which is why the first pass called it safe; but in the FEAST the
       kitten who lost the round is an angel who can fly "anywhere you like
       over the arena", out over the wall and into the zone, and the merged
       rig takes the STRONGEST weight in the group, so her sister's fight
       zoomed out with her. The board is for visiting, and during a match
       nobody is visiting it. */
    if (this.tournament?.active || p.angel) return 0;
    return boardZoneWeight(this.world.arenaBoard, this.world.arenaOpen,
      p.position.x, p.position.y, p.position.z);
  }

  _maxViewDist(fovDeg, aspect) {
    const span = this._islandSpan();
    if (!(span > 0)) return Infinity;   // degrade to the old behaviour
    return fitDistance({ spread: span, fovDeg, aspect });
  }

  /** Where a set of kittens is, on average. The two-player midpoint
   *  generalised — same answer for two, and the right one for three or four. */
  /**
   * A kitten the camera should STOP FOLLOWING: knocked out, off the deck, and
   * come to rest.
   *
   * The rule, the reason for it, and the 3 units live on `outOfShot` in
   * core/split.js — pure, next door to the pane geometry it exists to protect,
   * and therefore assertable without a Game or a GPU. This is the adapter that
   * hands it the four facts it wants.
   */
  _camIgnores(p) {
    if (!p) return false;
    const R = this.world?.arenaRing;
    if (!R) return false;
    return outOfShot(
      { ko: p.ko, onGround: p.onGround, y: p.position.y },
      this.world.arenaOutBy(p.position.x, p.position.z),
      R.y,
      !!this.tournament?.active
    );
  }

  /** The members of a group the camera is actually framing. See `outOfShot`. */
  _framed(members) {
    return framedMembers(members, (i) => this._camIgnores(this.players[i]));
  }

  /** Everybody standing in the real world — or everybody, if nobody is,
   *  which is a party entirely inside the Dream Dojo's simulator. */
  _realMembers() {
    const all = this.players.map((_, i) => i);
    if (!this.dream) return all;
    const real = all.filter((i) => this.dream.realmOf(this.players[i]) !== 'sim');
    return real.length ? real : all;
  }

  _centroid(members = this.players.map((_, i) => i)) {
    const c = new THREE.Vector3();
    let n = 0;
    for (const i of this._framed(members)) {
      const p = this.players[i];
      if (!p) continue;
      c.add(p.position);
      n += 1;
    }
    return n ? c.divideScalar(n) : c;
  }

  /** Put every rig back on the next frame it is asked to draw, rather than
   *  letting it lerp in from wherever the last run left it. */
  _reseedRigs() {
    for (const r of this.rigs) r.seeded = false;
  }

  /**
   * WHO SHARES A PANE WITH WHOM, this frame.
   *
   * The forced rules come first and every one of them is the rule that was
   * already there, unchanged in meaning: they are the moments where the thing
   * on screen is SHARED, and a shared subject gets a shared view. What is new
   * is only what happens when none of them applies.
   *
   * `core/cluster.js` owns the arithmetic and the argument for it. This
   * function owns which questions get asked.
   */
  _clusters() {
    const all = this.players.map((_, i) => i);
    if (all.length <= 1) {
      this._clusterOf = all.map(() => 0);
      return [all];
    }

    /* BOTH girls on Ryuuseki force ONE view, and it outranks even "always
       split". Two half-screens of the same animal is the worst possible view of
       him: the flyer's turns yank the gunner's camera around, the gunner cannot
       see what she is aiming at, and the one moment the game asks two girls to
       be in the same seat is rendered as though they are not.

       IT IS `duo`, NOT `ridden`, AND THE DIFFERENCE IS THE WHOLE BUG. The rule
       fired on anybody being aboard, so one kitten climbing on collapsed the
       screen to a single camera locked to the dragon — while her sister, who
       had done nothing, was still down in the town with no view of her own. A
       shared view is only right when the thing is actually shared. */
    const onRyu = !!this.ryu?.duo;

    /* A ROUND IS ONE SCREEN, for the same reason: two half-screens of one
       56-unit ring is the worst way to watch a fight, because each girl gets
       half the width to judge a knockback across and neither can see how much
       ring is behind the other. */
    const inRing = !!this.tournament?.active;

    // Everybody inside the dojo shares one view — the whole point is that they
    // read the same diagram together. Both of them or neither, at any party size.
    const dc = this.world.dojoCentre;
    const allInDojo = this.players.every(
      /* `!p.mount` STAYS HERE AND NOWHERE ELSE, and the difference is what
         this rule is for. The board asks "whose pane does the diagram belong
         in", and a girl looking down at the circle from a dragon has as good a
         claim as anybody. This asks "should everybody share ONE view", and a
         kitten in the air is already forced into a pane of her own by `solo`
         below — so counting her here would claim a merge that the very next
         rule takes apart again. */
      (p) => !p.mount && inDojoView(p, dc)
    );

    /* TWO REALITIES NEVER SHARE A PANE. A kitten in the Dream Dojo's
       simulator is twelve thousand units east and in another sky; one lens
       cannot draw both, so every "everybody in one view" rule above stands
       aside while the party is split between the two — even "never split",
       which is a preference about one world and has nothing to say about two.
       Nobody in the simulator: `mixed` is false and this is the old line. */
    const realms = this.players.map((p) => this.dream?.realmOf(p) ?? null);
    const mixed = realms.some((r) => r !== realms[0]);
    if (!mixed && (onRyu || inRing || this.settings.split === 'never' || allInDojo)) {
      this._clusterOf = all.map(() => 0);
      return [all];
    }
    if (this.settings.split === 'always') {
      this._clusterOf = all.slice();
      return all.map((i) => [i]);
    }

    /* `rideAlong` counts as flying too. The gunner is thirty units up on a
       dragon; standing over where her sister happens to be on the ground is not
       a reason to share a camera with her.

       AT FOUR PLAYERS THIS COSTS ONE PANE INSTEAD OF THE WHOLE SCREEN, which is
       the entire point of doing it per group. The old rule was global — one
       kitten taking off split every view in the game, including the two
       sisters still standing next to each other in the market who had not
       moved. */
    const { groups, of } = clusterPlayers({
      pts: this.players.map((p) => p.position),
      /* A GIRL READING HER OWN CARD GETS HER OWN PANE, for the same reason a
         girl on a dragon does: she is not sharing a view with her sister right
         now, and a card drawn over a shared pane covers half of somebody
         else's game. `stablePanes` is what makes this bearable — the other
         panes do not shuffle when hers appears. */
      solo: this.players.map(
        (p) => !!(p.mount || p.rideAlong || this.inspector?.busy(p.index)
          /* ...and a kitten on her way into a tube, in it, or out of it: the
             phase is laid over HER pane, and must not wash over a sister's. */
          || this.dream?.wantsSolo(p))
      ),
      prev: this._clusterOf,
      mergeIn: MERGE_IN,
      mergeOut: MERGE_OUT,
      lanes: this._snakeLanes(),
    });
    this._clusterOf = of;
    return groups;
  }

  /**
   * Which road's ride camera each kitten belongs to, or null.
   *
   * "If all players are running up together, they all share the same animated
   * camera (like normal) but if just 1 player is running up, then they get
   * their own camera (like normal). But if all players are nearby each other,
   * and only 1 is climbing up, then after 2 - 3 seconds of climbing up, they
   * get their own camera with the camera sequence, others can join that
   * camera sequence if they also join and are close enough to the player with
   * the camera sequence playing."
   *
   * So a lane is earned by `SNAKE.splitT` seconds on a road — before that she
   * is still in whatever pane she set off from, and a group who all set off
   * together are still one group when they all earn it at once. And it is
   * JOINED at once: a kitten who boards the same road within `MERGE_OUT` of
   * somebody already in its lane is in it straight away, which is "join that
   * camera sequence", rather than a second wait in a pane of her own.
   *
   * ALL NULL OFF THE ROADS, which is every frame of the game before the
   * ending — and `clusterPlayers` with all-null lanes is the function it
   * always was. Fifth non-negotiable.
   */
  _snakeLanes() {
    const P = this.players;
    const lanes = P.map((p) => {
      const R = p?.snakeRide;
      return R && R.t >= SNAKE.splitT ? R.road.id : null;
    });
    P.forEach((p, i) => {
      const R = p?.snakeRide;
      if (!R || lanes[i] != null) return;
      const joins = P.some((q, j) => q && lanes[j] === R.road.id
        && Math.hypot(q.position.x - p.position.x, q.position.z - p.position.z) < MERGE_OUT);
      if (joins) lanes[i] = R.road.id;
    });
    return lanes;
  }

  /**
   * What a group's look across a sim bridge frames: only when EVERY one of
   * them is walking up to the same mouth (the same `far`), from their middle,
   * as much as the least of them wants. Otherwise null — one sister at a
   * mouth does not swing the camera the others are drawn by.
   */
  _peekGroup(members) {
    let far = null;
    let w = 1;
    for (const i of members) {
      const at = this.players[i]?.peekAt;
      if (!at || (far && at.far !== far)) return null;
      far = at.far;
      w = Math.min(w, at.w);
    }
    if (!far) return null;
    const mid = this._centroid(members);
    return { x: mid.x, y: mid.y, z: mid.z, far, w, spread: this._spread(members) };
  }

  /**
   * What a group's ride camera frames, or null if not every one of them is on
   * the same road. A group that is half on a road and half off is framed the
   * ordinary way — that is the two-to-three seconds before the lane splits it.
   */
  _snakeGroup(members) {
    let road = null;
    let s = 0;
    let n = 0;
    let dir = 1;
    for (const i of members) {
      /* A kitten holding a coin up is having her moment; the group rides on
         past her rather than dropping to the ordinary camera for two seconds. */
      if (this.players[i]?.aloftT > 0 && this.players[i]?.snakeRide) continue;
      const sub = this.players[i]?.snakeSubject?.();
      if (!sub) return null;
      if (road && sub.road !== road) return null;
      if (!road) dir = sub.dir;
      road = sub.road;
      s += sub.s;
      n++;
    }
    if (!n) return null;
    const mid = this._centroid(members);
    return { road, s: s / n, dir, x: mid.x, y: mid.y, z: mid.z, spread: this._spread(members) };
  }

  /**
   * Which camera draws a group.
   *
   * A GROUP OF ONE USES HER OWN FOLLOW CAMERA, not a rig framed on a single
   * point. That is not a shortcut — `Player._updateCamera` and `setFocus` carry
   * the grotto tilt, the dojo framing, the star pose and the mount pull-back,
   * and a shared rig re-deriving all of that for a group of one would be a
   * second copy of every one of those rules. It is also exactly what a lone
   * kitten's pane has always been.
   */
  _cameraFor(members) {
    if (!members?.length) return null;
    if (members.length === 1) return this.players[members[0]]?.camera ?? null;
    return this.rigs[members[0]]?.camera ?? null;
  }

  /**
   * Where each group is on the screen it is being drawn on, 0..1 from the
   * bottom-left — the tie-break `stablePanes` asks for.
   *
   * MEASURED THROUGH THE LENS SHE WAS SEEN THROUGH, not through a fresh one.
   * `_paneCamOf` is last frame's, and last frame is the frame that matters:
   * the two halves of a splitting group were both in it, so their x's are
   * comparable. A camera picked per group this frame would compare a kitten
   * against herself and always answer "centre".
   *
   * A GROUP WITH NO CAMERA YET GETS NULL, NOT A GUESS — the first frame, a
   * kitten who just joined, a pane that has never been drawn. `stablePanes`
   * treats a null as no opinion and falls back to the identity, so the worst
   * this can do is the behaviour it replaced. A guessed 0.5 would instead be a
   * confident vote for the middle, which is a vote for whichever pane happens
   * to be nearest the middle — the exact kind of quiet wrong answer the fourth
   * house rule is about.
   *
   * BEHIND THE CAMERA IS ALSO NULL. `Vector3.project` mirrors a point behind
   * the lens to the far side of the screen, so a kitten who has just walked
   * out through the bottom of the frame would vote for the wrong side with
   * full confidence. `w <= 0` is the test, and it is why this does the
   * projection by hand instead of calling `project`.
   */
  _groupHints(groups) {
    if (!groups?.length) return null;
    const v = (this._hintV ??= new THREE.Vector3());
    const mat = (this._hintM ??= new THREE.Matrix4());
    return groups.map((members) => {
      let sx = 0;
      let sy = 0;
      let seen = 0;
      for (const i of members ?? []) {
        const cam = this._paneCamOf?.[i];
        const at = this.players[i]?.position;
        if (!cam || !at) continue;
        mat.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
        v.copy(at).applyMatrix4(mat);
        /* `applyMatrix4` divides by w and then THROWS W AWAY, and its sign was
           the only thing that said the point is behind the lens — a negative w
           divides both coordinates through and lands the kitten, mirrored, on
           the far side of the screen. So recompute it: same four multiplies
           three.js just did, kept this time. */
        const e = mat.elements;
        const w = e[3] * at.x + e[7] * at.y + e[11] * at.z + e[15];
        if (!(w > 0) || !Number.isFinite(v.x) || !Number.isFinite(v.y)) continue;
        sx += (v.x + 1) / 2;
        sy += (v.y + 1) / 2;   // NDC counts up, and so do the pane fractions
        seen++;
      }
      if (!seen) return null;
      return { cx: sx / seen, cy: sy / seen };
    });
  }

  _updateSplit(dt) {
    /* WHO IS SHARING A VIEW WITH WHOM. With two kittens this is exactly the
       boolean it replaced — one group or two — and nothing about the game the
       girls know changes. With three or four it is the feature: a pair standing
       together get a pane between them and the kitten two islands away gets one
       of her own, instead of the screen being all-or-nothing for everybody. */
    this.groups = this._clusters();
    /* ...AND WHEREABOUTS ON THE SCREEN EACH OF THEM IS, which is what decides
       the sides when the split is brand new. See `stablePanes` in
       core/split.js for the report; the short version is that on the frame a
       pane divides, `_paneSeats` says both halves want the same place, so
       without this the tie fell to the lower player index.

       PROJECTED HERE BECAUSE ONLY HERE HAS THE CAMERA. `stablePanes` is pure
       geometry and gets to stay that way. Written ONCE a frame, for the same
       reason `_paneSeats` is: `_panes` is asked the same question three times
       a frame by the renderer, the HUD and the minimaps, and they must not be
       answering from different states. */
    this._paneHint = this._groupHints(this.groups);
    /* AND WHOSE GROUPING IT WAS FOR. `_panes` has a fallback grouping for the
       frames before `this.groups` exists, and a hint array lined up with a
       DIFFERENT grouping is worse than none: index g would mean one set of
       kittens to `stablePanes` and another to this. Identity, not length —
       two groupings of the same size are exactly the case that has to fail. */
    this._paneHintFor = this.groups;
    /* `merged` STILL MEANS "ONE VIEW FOR EVERYBODY", which is what the HUD, the
       minimaps and the map-zoom key all read it for. It is now a consequence of
       the grouping rather than a thing decided separately — two answers to one
       question is how a map ends up drawn across somebody else's half. */
    this.merged = this.groups.length === 1;

    /* EVERY RIG IS UPDATED EVERY FRAME, DRAWING OR NOT — including the ones
       whose player is not currently leading a group, which track her alone so
       that the instant a group splits and she becomes the lowest member of a
       new one, her rig is ALREADY framed on her.

       That is the whole reason HANDOFF listed this feature as not-built: a rig
       picked up cold at the moment membership changes is the frozen-camera bug
       one pane further along. It is answered by construction here rather than
       by smoothing a transition, exactly as the shared rig's own version of it
       was. */
    /* THE PANES ARE WORKED OUT HERE TOO, BECAUSE A RIG HAS TO KNOW HOW WIDE ITS
       OWN PANE IS. `_panes` is the same call the renderer makes a few lines
       later — one function, so the two can never disagree about who got which
       rectangle. See `_updateRig` for what the aspect is FOR. */
    const size = this.renderer.getSize(new THREE.Vector2());
    const panes = this._panes(size.x, size.y, this.groups);
    /* CLEARED FIRST, FOR EVERYBODY, so the value below is only ever this
       frame's. A player who was alone in the narrow column and has just walked
       back to her sisters is no longer the leader of any group — the loop
       cannot reach her to reset it — and she would carry a 2.6x pull-back into
       a pane she is not in, for the rest of the game. */
    for (const p of this.players) if (p) p.paneWiden = 1;
    for (let i = 0; i < this.rigs.length; i++) {
      if (!this.players[i]) continue;
      const g = this.groups.findIndex((m) => m[0] === i);
      const pane = g >= 0 ? panes[g] : null;
      /* A rig that is not leading a group has no pane. It is framing one
         kitten, so the spread is zero and the aspect cannot change its answer;
         the full frame is the honest neutral value. */
      const aspect = pane && pane.h > 0 ? pane.w / pane.h : size.x / Math.max(1, size.y);
      /* AND HOW NARROW THAT PANE IS COMPARED TO A QUADRANT. Same argument as
         the aspect and one step further: the aspect only reaches `fitDistance`,
         which has nothing to say about a pane holding ONE kitten. See
         `paneWiden`. A rig with no pane is framing one kitten off screen, so
         there is no shape to answer for. */
      const widen = pane ? paneWiden(panes, g, size.x, size.y) : 1;
      this._updateRig(this.rigs[i], this.groups[g] ?? [i], dt, aspect, widen);
      /* AND THE SAME NUMBER GOES TO HER OWN FOLLOW CAMERA, which is the one
         that DRAWS when she is alone in a pane — see `_cameraFor`.

         This is the case `paneWiden` was written for and the case it never
         reached. Its docblock quotes the report word for word ("one kitten on
         her own, in the 62/38 split's narrow column"), the function is right,
         and the only caller was the shared rig — which by definition is
         framing two or more. So the kitten the fix was for was the one player
         in the game who never got it, and she is the one in the narrowest
         pane on the screen: 730x1080, showing 38% of the world across that a
         quadrant would. Reported a second time, in the same words.

         SET RATHER THAN PASSED, because `_updateCamera` is called from
         `Player.update` — which runs from the game loop, not from here, and
         has no idea the screen is split. A field is also what lets it survive
         the frames where a rig has no pane at all. */
      const solo = this.groups[g]?.length === 1 ? this.players[this.groups[g][0]] : null;
      if (solo) solo.paneWiden = widen;
    }
  }

  /**
   * Frame one group of kittens with one rig.
   *
   * This is the old shared-camera block, unchanged in what it does and asked a
   * narrower question: it used to frame THE PARTY and now frames A GROUP. With
   * two players in one group those are the same set, which is why the
   * two-player game comes out of it byte for byte.
   *
   * @param rig      one of `this.rigs` — its own target, distance and lerp state
   * @param members  player indices this rig is framing
   * @param aspect   the width/height of the PANE this rig draws into. See
   *                 `_fitDistance` — a camera that does not know this frames
   *                 for a screen it does not have.
   * @param widen    how much further back the pane's SHAPE says to sit, from
   *                 `paneWiden` — 1 everywhere except an uneven split.
   */
  _updateRig(rig, members, dt, aspect = 16 / 9, widen = 1) {
    const mid = this._centroid(members);
    /* THE SPREAD IS THE WIDEST PAIR IN THE GROUP, NOT THE FIRST TWO. It sizes
       the pull-back, and a camera framed on the closest pair crops the rest of
       its own group out of the shot. */
    const dist = this._spread(members);

    /* THE SHARED RIG IS UPDATED EVERY FRAME, SPLIT OR NOT, AND THAT IS THE
       WHOLE FIX FOR THE JARRING REJOIN.

       This block used to sit inside `if (this.merged)`. `sharedTarget` and
       `sharedDist` are lerped toward their targets rather than set, so while
       the screen was split they were not stale by a little — they were frozen
       at wherever the girls happened to be standing at the *moment the screen
       split*, however long ago and however many islands away that was. Coming
       back together then started the lerp from that abandoned spot and flew
       the camera across the archipelago to catch up, which is the "teleport"
       — it is really the tail of a lerp that should have finished minutes ago.
       Worse, the rejoin is the one moment the camera must be trustworthy: it
       happens exactly when two kittens have just run back to each other.

       Running it always costs two vector lerps a frame on a camera that isn't
       drawing, and means the shared rig is ALREADY framed correctly at the
       instant it takes the screen. There is no transition to smooth, because
       there is no longer a discontinuity to hide. */
    {
      const dc = this.world.dojoCentre;
      /* THIS GROUP'S OWN KITTENS, not the whole party. A pair reading the
         diagram in the Dojo gets the Dojo framing; a third player who is
         nowhere near it does not have her camera swung to an island she is not
         standing on, which is exactly what asking `this.players` here would
         do once there is more than one view. */
      /* AND `!p.mount` STAYS HERE TOO, for a third reason: this is the
         CAMERA, and a kitten on a dragon already has one — the dragon's. Swing
         her pane to the overhead framing and she would be flying by a view of
         the ground she is not on. The board still comes up in her pane (see
         `inDojoView`); it is only the camera that stays with the animal. */
      const inDojo = members.some((i) => {
        const p = this.players[i];
        return !p?.mount && inDojoView(p, dc);
      });
      rig.focusT += ((inDojo ? 1 : 0) - rig.focusT) * Math.min(1, dt * 2.2);
      const ft = rig.focusT;

      /* Riding Ryuuseki forces this view, and this rig sizes its distance from
         how far APART the two kittens are — on him they share one point, so it
         read a separation of zero and clamped to its 26-unit minimum, framing
         a 28-unit dragon from 26 units away. It also aimed at their positions,
         which are his origin (their seats are draw offsets), so the animal ran
         off the side of the screen.
         Both are fixed here rather than in Player._updateCamera, because that
         camera is not the one drawing while merged.

         `duo` again, not `ridden`: with one girl aboard and one on the ground
         this rig can still be reached (split = never, or the two of them close
         together), and framing on the dragon there loses the kitten who isn't
         on him. One rider is not a shared subject — the ordinary midpoint is
         the right frame, exactly as it is for a storm dragon. */
      const onRyu = this.ryu?.duo ? this.ryu : null;
      const ryuMid = onRyu?.ridersMidpoint();

      const want = ryuMid ? ryuMid.clone() : mid.clone().setY(mid.y + 1.6);
      /* Closer in on a phone, and still following her — see DOJO_CENTRE_BIAS. */
      const bias = this.device.touchPrimary
        ? DOJO_CENTRE_BIAS.touch : DOJO_CENTRE_BIAS.desktop;
      if (ft > 0.001) want.lerp(dc, ft * bias);

      let wantDist = ryuMid
        ? onRyu.quad * RYU_VIEW
        : THREE.MathUtils.lerp(
          THREE.MathUtils.clamp(26 + dist * 0.85, 26, 52),
          this.device.touchPrimary ? DOJO_DIST.touch : DOJO_DIST.desktop,
          ft
        );

      /* THE TUNED DISTANCES ARE ALL TUNED ON A FULL-WIDTH SCREEN, so a pane
         the layout has narrowed pays for it here. `widen` is 1 for every even
         split — including the two-player one, which is why that game is
         untouched — and only the 62/38 branch and the three-pane column ever
         hand out anything else. See `paneWiden` for the measured numbers and
         for why `fitDistance` below does not already cover this: it cannot,
         because a pane with one kitten in it has no spread to fit. */
      wantDist *= widen;

      /* AND THEN FAR ENOUGH BACK THAT THE GROUP ACTUALLY FITS THE PANE.
         Everything above sizes the shot from world distances and knows nothing
         about the rectangle it is drawn into; the clamp at 52 in particular is
         a number tuned on a full-width screen. `fitDistance` asks the only
         question those constants cannot: at THIS pane's aspect, how far back
         does the widest pair have to be to both be on screen?

         A MAX, NEVER A REPLACEMENT. On a wide pane it comes out well under the
         tuned distance and changes nothing at all, which is what keeps the
         two-player game bit-identical — it can only ever pull further out, and
         only when somebody would otherwise be cropped. */
      wantDist = Math.max(wantDist, fitDistance({
        spread: dist, fovDeg: rig.camera.fov, aspect,
      }));

      /* THE BIG SCREEN AGAIN, HERE, because when they are together this is
         the camera that draws — the trap this file has fallen into four
         times. The strongest weight in the group decides: one girl walking up
         to the board is the pair getting the view, and the fit includes every
         kitten in the group, so her sister is not cropped for it. Exactly 0
         everywhere but in front of the board, and nothing below runs then. */
      let boardW = 0;
      for (const i of members) {
        const p = this.players[i];
        if (p && !p.mount) boardW = Math.max(boardW, this._boardWeight(p));
      }
      rig.boardT = (rig.boardT ?? 0) + (boardW - (rig.boardT ?? 0)) * Math.min(1, dt * 2.2);
      if (rig.boardT < 0.001) rig.boardT = 0;
      if (rig.boardT > 0) {
        const shot = boardShot(
          this.world.arenaBoard,
          members.map((i) => this.players[i]?.position).filter(Boolean),
          rig.camera.fov, aspect
        );
        want.lerp(shot.centre, rig.boardT);
        wantDist = THREE.MathUtils.lerp(wantDist, shot.dist, rig.boardT);
      }

      /* THE STAR SHOT AGAIN, BECAUSE THIS IS THE CAMERA THAT DRAWS WHEN
         MERGED. `Player.holdAloft` pulls the per-player camera in, and when
         the girls are together — which is most of the time, and is exactly
         when they are hunting a star as a pair — that camera is not on screen.
         Same trap as Ryuuseki's framing: if a camera change appears to do
         nothing, check which camera is actually drawing.
         It swings to the finder rather than to the midpoint, because the shot
         is about her holding it up; her sister slides off frame for two
         seconds and comes back. */
      /* AND IT ONLY SWINGS THE GROUP SHE IS IN. The pose is per player and
         always has been — "stopping that sister's game to show her a cutscene
         about something she did not do is the exact interruption the split
         screen exists to avoid" — but the merged rig had no way to say that
         while it was the only shared camera in the game. Now it can: a pair
         hunting together still get the shot, because the finder is in their
         group, and a kitten across the archipelago does not. */
      /* AND IT IS EVERY HELD-UP THING NOW, NOT JUST A STAR. Reported from
         play: "when multiple players are on the same screen, if one of the
         players pledges to a Clan, the camera is not zooming in or doing the
         cutscene animation. It seems to do it with the Dragonballs though."

         THE DRAGON BALL WAS THE ONLY CALLER THAT TOLD THIS RIG. Both routes
         go through `Player.holdAloft`, which pulls HER camera in — and when
         she is sharing a pane, her camera is not the one drawing. The ball
         route happened to set this field as well; the clan ceremony did not,
         so a kitten who swore next to her sister got the pose, the emblem and
         the dancing leader with the camera sitting exactly where it was. It
         was named `starShot` while it was a star's, and it is named for what
         it actually is now, so the third caller does not have to guess.

         "EVEN IF IT IS SOMEWHAT DISRUPTIVE FOR THE OTHER PLAYERS, THAT IS
         OKAY" — the director's ruling, and it is why the pull-in is not
         softened for a shared pane. It still only swings the group SHE is in.

         `dur` RATHER THAN A CONSTANT, because a clan oath is 2.4s and a star
         is 2.0s; reading `STAR_POSE` here made the longer pose ease in as
         though it were already 0.4s further along. */
      const shot = this.aloftShot;
      if (shot && !ryuMid && members.includes(shot.player.index)) {
        const sdur = shot.dur || STAR_POSE;
        const k = Math.sin(Math.min(1, (sdur - shot.t) / 0.3) * Math.PI * 0.5)
          * Math.min(1, shot.t / 0.45);
        want.lerp(
          new THREE.Vector3(shot.player.position.x, shot.player.position.y + 2.2, shot.player.position.z),
          k
        );
        wantDist = THREE.MathUtils.lerp(wantDist, 15, k);
      }

      /* The lerp needs a seed. `sharedTarget` starts at the origin and
         `sharedDist` at a constant, so the first frame of a new game — or of a
         restart, which puts the kittens back at the town — would otherwise fly
         in from (0,0,0) exactly the way the rejoin used to. Snap once, then
         lerp forever after. */
      /* THE RING HAS ITS OWN RIG, and it has to, because this one cannot
         frame it. `wantDist` above clamps at 52 — a bound written for two
         kittens running around a town — and the deck is 56 across, so at full
         separation the ordinary camera frames rather less than half of it and
         one of the two fighters is simply off screen. Exactly the trap
         Ryuuseki fell into (a 28-unit dragon framed from a 26-unit minimum),
         and the same fix: a rig that knows how big its own subject is.
         It is applied here rather than through `setFocus` for the reason this
         file has now learned three times — when the girls are together the
         per-player camera is NOT the one drawing, and in a ring they are
         always together. */
      const ring = this.tournament?.cameraWant();
      if (ring) {
        want.set(ring.x, ring.y, ring.z);
        /* THE RING KNOWS HOW BIG THE DECK IS AND STILL NOT HOW WIDE THE PANE
           IS. Its 56-unit deck is exactly the subject that gets cropped first
           in a narrow pane, so it takes the same floor as everything else.
           UNLESS THE SHOT IS NOT OF THE KITTENS. `fitPlayers: false` is the
           close-up on Mr. Satan while he shouts the clock out — see
           `SATAN_SHOT` — and the floor below is a function of how far apart the
           PLAYERS are, so applying it there would pull the camera back off him
           by however far two fighters happened to end the round from each
           other. A shot with nobody in it that widens to fit them is not a
           close-up. The pane floor still applies: `widen` is about the shape of
           the window, which is true of any subject. */
        wantDist = ring.fitPlayers === false ? ring.dist * widen
          : Math.max(ring.dist * widen, fitDistance({
            spread: dist, fovDeg: rig.camera.fov, aspect,
          }));
        /* A PHONE'S RING SHOT IS FITTED THROUGH THE LENS — see `fitShot` and
           `RING_DIST` in tournament.js. It REPLACES the floor above rather
           than joining it: that floor is a width fitted to the whole screen,
           and the fit already holds every fighter inside the part of the screen
           the HUD and the thumbs leave. The yaw is the one drawn below, asked
           here so the two cannot disagree. */
        if (ring.fit) {
          const s = fitShot({
            pts: ring.fit.pts,
            target: ring,
            yaw: THREE.MathUtils.lerp(-Math.PI * 0.25, 0, ft),
            pitch: ring.pitch,
            fovDeg: rig.camera.fov,
            aspect,
            box: ring.fit.box,
            air: ring.fit.air,
            minDist: ring.dist * widen,
            maxDist: ring.fit.max,
            extra: ring.fit.extra,
            extraMax: ring.fit.extraMax,
          });
          want.set(s.x, s.y, s.z);
          wantDist = s.dist;
        }
      }

      /* AND NEVER FURTHER BACK THAN THE WHOLE WORLD.
         Reported from four-player play: "sometimes players get knocked so far
         they fall off the island entirely and then the camera zooms out
         infinitely far away."

         IT IS `fitDistance` THAT RUNS AWAY, and it is not a bug in it — it is
         doing exactly what it is asked. Every other term above is bounded:
         `clamp(26 + dist * 0.85, 26, 52)` has a ceiling in it, the Dojo and
         Ryuuseki distances are constants, and the ring's is the size of its
         own deck. `fitDistance` is the only one that is a function of an
         UNBOUNDED input — the spread between the furthest two kittens — and a
         kitten falling out of the world puts a hundred and sixty units into
         it before `Player._respawn` catches her at y = -160.

         The ceiling is the one Richard named: "from both opposite ends of the
         entire island to be covered, if camera zooms out that far, it cant
         zoom out any further". One whole island — 192 units, the home one —
         asked of the same `fitDistance` at the same aspect, so a narrow pane
         still gets a bigger ceiling than a wide one and the two answers cannot
         drift apart.

         BE HONEST ABOUT WHAT IT BOUNDS. Measured, at 16:9:

           the widest legitimate group (four single-linked at MERGE_OUT)  152
           THIS CEILING                                                   212
           a kitten falling the 160 units to `Player._respawn`            176
           respawned in the town while the others are at the arena        375

         So it clamps the cross-map case and NOT the long fall, which is
         genuinely under it. THIS IS A FAILSAFE, NOT THE FIX — the fix is
         `Tournament._catchFallers`, which stops the fall happening at all.
         Both are wanted: that one removes the way we know about, this one
         bounds the damage of every way nobody has thought of yet. */
      wantDist = Math.min(wantDist, this._maxViewDist(rig.camera.fov, aspect));

      if (!rig.seeded) {
        rig.target.copy(want);
        rig.dist = wantDist;
        rig.seeded = true;
      }
      /* A GROUP THAT HAS CROSSED INTO THE OTHER REALITY TAKES ITS RIG WITH
         IT, by exactly the offset, so the frame does not pan twelve thousand
         units across the void to catch up. The lesson of the frozen shared
         rig again: a lerped camera must never be left to chase a jump. */
      const realm = this.dream?.realmOf(this.players[members[0]]) ?? null;
      if ((rig.realm ?? null) !== realm) {
        const k = realm === 'sim' ? 1 : -1;
        rig.target.x += SIM.dx * k;
        rig.target.z += SIM.dz * k;
        rig.realm = realm;
      }
      rig.target.lerp(want, Math.min(1, dt * RIG_AIM_RATE));
      rig.dist += (wantDist - rig.dist) * Math.min(1, dt * RIG_DIST_RATE);

      let yaw = THREE.MathUtils.lerp(-Math.PI * 0.25, 0, ft);
      let pitch = ring ? ring.pitch : THREE.MathUtils.lerp(0.66, DOJO_PITCH, ft);
      if (rig.boardT > 0) {
        yaw = THREE.MathUtils.lerp(yaw, BOARD_VIEW.yaw, rig.boardT);
        pitch = THREE.MathUtils.lerp(pitch, BOARD_VIEW.pitch, rig.boardT);
      }

      /* THE GROTTO AGAIN, HERE, BECAUSE THIS IS THE CAMERA THAT DRAWS WHEN
         THEY ARE TOGETHER — and inside a 21-unit room they always are. The
         per-player `setFocus` above is the split-screen half of this rule and
         it does nothing at all while merged, which is the trap this file has
         fallen into three times now (Ryuuseki's framing, the star shot, and
         now this). Same numbers, so the view does not change as the screen
         joins and splits. */
      const cave = this.world.grottoAt(rig.target.x, rig.target.z);
      rig.caveT = cave
        ? Math.min(1, rig.caveT + dt * 2.4)
        : Math.max(0, rig.caveT - dt * 2.4);
      if (rig.caveT > 0.001) {
        const ct = rig.caveT;
        pitch = THREE.MathUtils.lerp(pitch, CAVE_PITCH, ct);
        rig.dist = THREE.MathUtils.lerp(rig.dist, CAVE_DIST, ct * Math.min(1, dt * 4));
      }
      rig.camera.position.set(
        rig.target.x + Math.sin(yaw) * Math.cos(pitch) * rig.dist,
        rig.target.y + Math.sin(pitch) * rig.dist,
        rig.target.z + Math.cos(yaw) * Math.cos(pitch) * rig.dist
      );
      rig.camera.lookAt(rig.target);
      /* THE RIDE CAMERA, when everybody this rig frames is on one road. A
         group of one draws with her own camera instead (`_cameraFor`), and
         hers carries the same layer — see `Player._updateCamera`. */
      rig.bridgePeek.apply(dt, members.length > 1 ? this._peekGroup(members) : null, rig.camera, rig.target);
      rig.snakeCam.apply(dt, members.length > 1 ? this._snakeGroup(members) : null,
        rig.camera, rig.target, this.world.islands);
      /* AFTER `lookAt`, so the shake moves the camera without re-aiming it.
         Offsetting before would have `lookAt` cancel most of it out — the
         camera would swing back onto the same target and only the parallax
         would survive, which is a tenth of the effect for the same work. */
      const shake = this._shakeOffset();
      if (shake) {
        rig.camera.position.x += shake.x;
        rig.camera.position.y += shake.y;
        rig.camera.position.z += shake.z;
      }
    }
  }

  /* ------------------------------ render -------------------------------- */

  /**
   * Point every x-ray material at the players, for THIS camera.
   *
   * Per view, exactly like `_faceAll`, and for the same reason: the cut is
   * defined by the line from the camera to the player, so in split screen the
   * two halves want two different cuts. Setting it once per frame would mean
   * player 2's wall opened a hole around player 1.
   *
   * A kitten who is not inside this grotto is left OUT of the cut. Without
   * that, the sister standing outside the mouth carves a tunnel through the
   * wall from every angle, and the building looks perforated for no reason
   * anybody watching can see.
   */
  _aimXray(camera, members = null, scene = false) {
    /* A SCENE'S LENS CUTS FOR NOBODY. Richard, of the parade out of the
       arena: "in the background of the cutscene, we can usually see the xray
       effect from the players that are hidden during the cutscene ... it is
       distracting and shouldn't be shown during the cutscene, only during
       gameplay." Every aimer below cuts for `this.players` wherever they
       are, and a scene hides them (`p.group.visible = false`) and draws its
       own actors — so the arena's stands and the town's roofs had holes
       bored in them for kittens nobody could see. The x-ray exists so she
       can find HERSELF behind a wall, and in a scene there is no her to
       find: the director framed the shot. Every scene and the griffin's
       flight pass `scene`, and so does the title's fly-over. */
    if (scene) {
      this._clearXray(camera);
      return;
    }
    this._aimArenaXray(camera);
    this._aimTownXray(camera, members);
    this._aimCloudXray(camera, members);
    const list = this.world.grottos;
    if (!list?.length) return;
    for (const G of list) {
      /* PER GROTTO, AND IT INCLUDES KITTENS STANDING OUTSIDE IT.
         The first version cut only for players who were INSIDE, which fixed
         the room and left the actual common case broken: a grotto is a
         25-unit dome sitting on a small island, so walking PAST one puts it
         between the camera and you and swallows you whole. You do not have to
         be in a building for it to hide you.
         The bound is generous but not unlimited — a kitten on the far side of
         the island does not get a tunnel bored through a grotto she is nowhere
         near, because the hole would be a hole in a wall for somebody who is a
         few pixels tall. */
      const reach = G.r * 2.8;
      const seen = [];
      for (const p of this.players) {
        if (Math.hypot(p.position.x - G.x, p.position.z - G.z) > reach) continue;
        seen.push(new THREE.Vector3(p.position.x, p.position.y + 1.4, p.position.z));
      }
      G.walls.material.setCuts(camera.position, seen);
      G.roof.material.setCuts?.(camera.position, seen);
    }
  }

  /**
   * Every x-ray material in the world, with no cut open in it. The lists are
   * the ones the aimers below walk, so a material one of them cuts is a
   * material this closes.
   */
  _clearXray(camera) {
    const w = this.world;
    const mats = [
      w.arenaSeeThrough?.material,
      ...(w.arenaEntranceXray ?? []).map((m) => m.material),
      w.snakeWay?.puffMat,
      ...(w.townXray ?? []).map((m) => m.material),
      ...(w.outlyingXray ?? []).map((m) => m.material),
      ...(w.grottos ?? []).flatMap((G) => [G.walls.material, G.roof.material]),
    ];
    for (const m of mats) m?.setCuts?.(camera.position, []);
  }

  /**
   * Snake Way's clouds, for THIS camera and THIS pane's kittens.
   *
   * "Let's use the xray shader when player is running through the clouds,
   * shouldn't be too aggressive, so maybe 50% and about as big as the player."
   * The roads run through banks of cloud on purpose, and a kitten inside one
   * was a kitten you could not see. The puffs are one merged mesh on one
   * material (`puffMaterial`), and the cut is a cone from the lens to her,
   * `uCutR` wide at her end — about her own size — taking HALF the cloud
   * away, not all of it: she is in a cloud, and it should still look like
   * one. The same `setCuts(camPos, points)` shape every other x-ray here has.
   */
  _aimCloudXray(camera, members) {
    const mat = this.world.snakeWay?.puffMat;
    if (!mat?.setCuts || !this.world.snakeWay.puffs.visible) return;
    const seen = [];
    for (const i of members ?? this.players.map((_, k) => k)) {
      const p = this.players[i];
      if (!p || seen.length >= 4) continue;
      seen.push(new THREE.Vector3(p.position.x, p.position.y + 1.2, p.position.z));
    }
    mat.setCuts(camera.position, seen);
  }

  /**
   * The town's buildings and cherry trees, for THIS camera and THIS pane.
   *
   * Asked for after play: "enable the x-ray shader when the player goes behind
   * buildings or trees so that they can see mischief hiding behind the
   * buildings/trees." `World._buildTown` owns the material; this owns who the
   * hole is for.
   *
   * IT CUTS FOR THIS PANE'S KITTENS AND NOBODY ELSE'S, which the grotto rule
   * gets for free and this one does not. A grotto is a dome on an island, so
   * "near it" is a real filter; the town is one place and everybody is in it,
   * so cutting for all four would mean the kitten in the top-left pane bores a
   * tunnel through the tea house in the bottom-right one. `members` is the
   * group the pane was drawn for — `_render` knows it and nothing downstream
   * did, which is why it is threaded through `_renderView`.
   *
   * AND ONLY ON THE HOME ISLAND'S SIDE OF THE WORLD. A kitten on a dragon two
   * hundred units up is still "in this pane", and a capsule drawn from that
   * camera to her passes through half the town on its way — so the whole
   * market square would dissolve while she flew over it. The bound is her
   * distance to the camera rather than to any building: past it the hole would
   * be smaller than the kitten it is for.
   */
  _aimTownXray(camera, members) {
    /* THE TOWN'S TWO MESHES AND EVERY OTHER ISLAND'S. Reported from play:
       "trees on other islands do not have the x-ray shader applied like on the
       main island, this should apply to everything in the game." They are
       aimed from here rather than from a second method because the RULE is
       identical — cut for this pane's kittens, within `TOWN_XRAY_FAR` of the
       camera — and a second copy of that rule is a second thing to drift. The
       grottos have their own method precisely because their reach rule is
       different; these do not. */
    const meshes = this.world.outlyingXray?.length
      ? [...this.world.townXray ?? [], ...this.world.outlyingXray]
      : this.world.townXray;
    if (!meshes?.length) return;
    const seen = [];
    const floors = [];
    const who = members ?? this.players.map((_, i) => i);
    for (const i of who) {
      const p = this.players[i];
      if (!p) continue;
      if (seen.length >= 4) break;
      if (camera.position.distanceTo(p.position) > TOWN_XRAY_FAR) continue;
      seen.push(new THREE.Vector3(p.position.x, p.position.y + 1.4, p.position.z));
      /* HER OWN FEET. A kitten standing on a stall's roof, or on the bridge,
         is standing on town geometry — the same case Mr. Satan's box is, and
         the same guard. See `gfx.xrayVertexMat`. */
      floors.push(p.position.y - 0.05);
    }
    for (const m of meshes) m.material.setCuts?.(camera.position, seen, floors);
  }

  /**
   * The arena's corner posts and the announcer's box, for THIS camera.
   *
   * SEPARATE FROM THE GROTTOS BECAUSE THE REACH RULE IS DIFFERENT, not because
   * the material is. A grotto is a dome on an island somebody may be walking
   * past, so it cuts only for kittens near it — otherwise a sister on the far
   * side of the island bores a tunnel through a building nobody can see her
   * from. The arena is one room that every fighter is inside for the whole
   * time it is open, and the posts are AT ITS CORNERS: a kitten thrown at a
   * corner is as far from the opposite post as anyone ever gets and still very
   * much wants it to open. So the test is "is she in the arena", not "is she
   * near this pillar".
   *
   * MR SATAN IS CUT FOR TOO, and he is the reason the booth is in this mesh at
   * all. He stands ON the box; without him in the list the roof opens for
   * whoever climbed up beside him and closes again over him, which is worse
   * than not opening at all — it says the game knows he is there and has
   * chosen to hide him.
   *
   * THE CAP IS FOUR AND SO IS THE PARTY, which is not a coincidence but is
   * also not quite enough: four kittens plus Mr Satan is five. He is added
   * FIRST and the loop stops at four, so with a full party the furthest kitten
   * loses her cut rather than the man everybody is looking at. A better answer
   * would sort by distance, and the honest reason not to is that it would cost
   * a sort per view per frame to change which of two adjacent kittens keeps a
   * hole in a pillar neither of them is behind.
   */
  _aimArenaXray(camera) {
    const mesh = this.world.arenaSeeThrough;
    /* AND THE FRONT DOOR'S OTHER HALF: the road's torii and lions there, one
       material each. Their lanterns share `mesh`'s material. */
    const gates = this.world.arenaEntranceXray ?? [];
    if (!mesh?.visible && !gates.some((m) => m.visible)) return;
    const seen = [];
    /* EVERY CUT CARRIES THE FLOOR ITS SUBJECT IS STANDING ON. Reported from
       play: "fix the x-ray issue where we can see through the ground (ceiling
       of the platform) that Mr. Satan is standing on in the arena." His own
       feet ARE that lid, and the lid is geometrically between the camera and
       his chest, so the cut was correctly opening a hole in the one thing
       holding him up. `gfx.xrayVertexMat` owns the guard; this is the only
       place that knows how high off the deck anybody is standing. */
    const floors = [];
    if (this.satan?.group.visible) {
      seen.push(new THREE.Vector3(
        this.satan.position.x, this.satan.position.y + 2.2, this.satan.position.z,
      ));
      /* HIS FEET, LESS A HAIR. Exactly his own Y leaves the lid's top face ON
         the boundary, where a fragment either side of a rounding error is cut
         or not - which is a floor that flickers rather than one that is
         there. */
      floors.push(this.satan.position.y - 0.05);
    }
    const R = this.world.arenaRing;
    for (const p of this.players) {
      if (seen.length >= 4) break;
      /* GENEROUS, AND MEASURED ON THE SAME SQUARE THE RING IS. `arenaOutBy`
         is negative inside the deck and grows as she leaves it; the stands
         and his box are inside 30 of it, and the front door's lanterns,
         torii and lions out to 51 — `ARENA_XRAY_OUT` is 60, a little way
         down the road past them. A kitten who has
         fallen off the island entirely is past it and stops carving. */
      if (R && this.world.arenaOutBy(p.position.x, p.position.z) > ARENA_XRAY_OUT) continue;
      seen.push(new THREE.Vector3(p.position.x, p.position.y + 1.4, p.position.z));
      /* AND A KITTEN WHO CLIMBS ONTO HIS BOX GETS THE SAME PROTECTION, which
         is not hypothetical - getting up there is half of what debug `5` and
         the temper gag are about. Her feet are wherever she is standing. */
      floors.push(p.position.y - 0.05);
    }
    mesh?.material.setCuts?.(camera.position, seen, floors);
    for (const m of gates) m.material.setCuts?.(camera.position, seen, floors);
  }

  /**
   * Mr. Satan's collider follows Mr. Satan, and stops existing when he does.
   *
   * TWO FACTS, ONE PLACE. He is invisible until the tournament is announced,
   * and he MOVES — `moveTo` is a teleport and there are four callers. Writing
   * this at each of them would be eight lines that all have to be remembered
   * together, and the one that was forgotten is the bug: the solid was pushed
   * once at boot and never touched again.
   *
   * `off` RATHER THAN SPLICING HIM OUT OF `world.solids`. The array is walked
   * by every kitten every frame and by `findOpenSpot`, and a solid that comes
   * and goes changes its length underneath both. The flag is the same shape as
   * `s.arena`, which turns the arena's stonework off while the arena is shut —
   * one idea, one skip, one line in `resolveSolids`.
   */
  /**
   * THE ARENA'S DOORS LET A KITTEN OUT, AND NOBODY IN.
   *
   * "If a player somehow gets stuck in the arena outside of combat, then maybe
   * we make it that if they get near the front doors (if they are behind the
   * doors) they open to let them pass through before closing and not allowing
   * them to enter again." The stands are a wall now (World.arenaWallAt), so a
   * kitten left inside with no tournament to end — a match called off at the
   * wrong moment, a sister seated after the rest were walked out — would
   * otherwise be in a box.
   *
   * OUTSIDE OF COMBAT ONLY: never while a tournament, its pickers, a ride or
   * the exit parade is running, because between rounds the fighters are
   * inside on purpose. It opens for a kitten on the INSIDE within `LET_OUT`
   * of the doors, and shuts once nobody is inside that stretch or in the
   * doorway itself — and only doors it opened, so the parade's are its own.
   * The doorway is one-way the whole time it is open (World.arenaWallAt), and
   * a kitten who walks into that from outside is TOLD so, once, rather than
   * stopped by nothing she can see.
   */
  _arenaDoorman() {
    const W = this.world;
    const A = W?.arenaWall;
    if (!A || !W.arenaOpen || !W.setArenaDoors) return;
    const LET_OUT = 8;
    const busy = !!(this.inMatch || this.travel || this.arenaExit?.active);
    let want = false;
    let doorway = false;
    for (const [i, p] of this.players.entries()) {
      const lx = p.position.x - A.x;
      const lz = p.position.z - A.z;
      const column = Math.abs(lx) < A.gap && lz > 0;
      /* INSIDE THE DOORS' LINE, as well as on the inside by her record: the
         record is only kept near the wall, and the exit parade set kittens
         down fifty-seven units out still carrying the fight's 'in'. */
      if (column && p.arenaSide === 'in' && lz < A.doorZ && lz > A.doorZ - LET_OUT) want = true;
      if (column && lz > A.inner && lz < A.doorZ + 4) doorway = true;
      if (p.doorRefused) {
        p.doorRefused = false;
        if (W.arenaDoorT > 0.08 && !this._toldDoor?.has(i)) {
          (this._toldDoor ??= new Set()).add(i);
          this.toast('These doors only open to let kittens OUT — ask Mr. Satan for a tournament to go in', i);
        }
      } else if (!column || lz > A.doorZ + 8) this._toldDoor?.delete(i);
    }
    if (!busy && want && !this._lettingOut) {
      this._lettingOut = true;
      W.setArenaDoors(true);
      // The parade's own door sound — the same doors, so the same noise.
      this.audio?.play?.('doors');
    } else if (this._lettingOut && !want && !doorway) {
      this._lettingOut = false;
      W.setArenaDoors(false);
      this.audio?.play?.('doors');
    }
  }

  _syncSatanSolid() {
    const s = this.satanSolid;
    if (!s) return;
    /* HIS DRAWING IS THE AUTHORITY. Everything else that asks whether he is
       really here asks the same question — the blast's arming test, the x-ray,
       debug `5` — and a second opinion kept somewhere else is a second thing
       that can disagree with what is on the screen. */
    const on = !!this.satan?.group.visible;
    s.off = !on;
    if (!on) return;
    s.x = this.satan.position.x;
    s.z = this.satan.position.z;
  }

  /** Everything billboarded must be turned toward *this* camera first. */
  _faceAll(camera) {
    for (const p of this.players) {
      p.faceCamera(camera);
      p.panda?.faceCamera(camera);
      for (const o of p.orbs ?? []) o.faceCamera(camera);
      for (const o of p.wornOrbs ?? []) o.faceCamera(camera);
    }
    this.kotodama.faceCamera(camera);
    for (const d of this.dragons) d.faceCamera(camera);
    for (const L of this.leaders ?? []) L.faceCamera(camera);
    this.payne?.faceCamera(camera);
    this.dream?.faceCamera(camera);
    this.cutscene?.faceCamera(camera);
    for (const s of this.world.shrines) s.faceCamera(camera);
    for (const pk of this.pickups) if (!pk.taken) pk.faceCamera(camera);
    for (const b of this.balls ?? []) b.faceCamera(camera);
    this.menagerie?.faceCamera(camera);
    this.ryu?.faceCamera(camera);
    this.satan?.faceCamera(camera);
    this.griffin?.faceCamera(camera);
    this.arenaExit?.faceCamera(camera);
    /* THE FLASH STEP'S FIGURE, and only its three readouts: everything else it
       draws is a `THREE.Sprite`, which three.js turns during each pane's own
       render and so needs nothing from here. A `Label` is a quad on a mesh and
       does. See `DodgeFx.faceCamera`. */
    this.dodgeFx?.faceCamera(camera);
    this.dojo.faceCamera(camera);
  }

  /**
   * Compile Snake Way's shaders the moment it exists, before anything shows.
   *
   * THE OTHER HALF OF THE LAG SPIKE. With the winding spread over frames
   * (`World.prepareSnakeWay`) the frame the first gate appeared on still
   * hitched, because it was also the first frame anything drew with the
   * dissolve, the cloud or the far islands' water — and a program is linked on
   * the draw that first needs it. `compileAsync` links them now, off the
   * critical path where the driver can (KHR_parallel_shader_compile), against
   * the real scene so the lights match. It walks every mesh visible or not.
   */
  _warmSnake() {
    const W = this.world.snakeWay;
    if (!W || this._snakeWarm === W || !this.renderer.compileAsync) return;
    this._snakeWarm = W;
    const cam = this.players[0]?.camera ?? this.summonScene?.camera;
    if (!cam) return;
    const linked = () => { this._snakeLinked = W; };
    try {
      Promise.all([
        this.renderer.compileAsync(W.group, cam, this.scene),
        this.world.farIsles && this.renderer.compileAsync(this.world.farIsles.group, cam, this.scene),
      ]).then(linked, linked);
    } catch (e) {
      console.warn('[snake] shader warm-up skipped', e);
      linked();
    }
  }

  /**
   * Link every shader the ending will need, the moment it is accepted.
   *
   * MEASURED, NOT GUESSED. Stepping the ending a frame at a time in the pane's
   * Firefox, every cut to a shot that looks somewhere new hitched on its first
   * frame — 285ms at "bamboo", 186ms at "There is nothing left" — and it was
   * the same before Snake Way existed. Part of each was a program being linked
   * on the draw that first needed it. `compileAsync` over the whole scene
   * issues them all now, where the driver can link them in parallel
   * (KHR_parallel_shader_compile), against the scene's own lights so they are
   * the variants that will be drawn. The rest of each hitch is geometry and
   * textures reaching the GPU, which only a draw can do.
   */
  _warmFinale() {
    if (!this.renderer.compileAsync) return;
    try {
      this.renderer.compileAsync(this.scene, this.summonScene.camera).catch(() => {});
    } catch (e) {
      console.warn('[finale] shader warm-up skipped', e);
    }
  }

  /**
   * Put the ending's world on the GPU a slice a frame, in the seconds before
   * the shots that first show it.
   *
   * `_warmFinale` and `_warmSnake` link the shaders; this is the other half. A
   * mesh's buffers and textures only go up on the first draw that includes it,
   * and stepped frame by frame the ending paid for them on the frame of a cut:
   * 127ms the moment the first far isle rose, and on the cut to the wide shot
   * 352 meshes drawn for the first time at once — most of them the town and the
   * other islands, which that shot is the first to see, and the rest Snake Way.
   * So everything that exists when the ending is accepted is queued then, the
   * roads and the far isles join the queue when they are built, and each frame
   * draws the next slice into ONE PIXEL of the real canvas before the panes
   * draw over it.
   *
   * ONLY WHAT IS SHOWING, from the scene. The first version lifted every hidden
   * thing into view for its one-pixel draw too, and uploaded 200 geometries the
   * ending never shows — the shut arena among them — with one frame of it
   * taking a second. The roads and the far isles are the exception: they are
   * hidden now BECAUSE they are about to be revealed, so they are lifted.
   *
   * A FIXED SLICE, NOT A TIMED ONE. The slice grew while `render` returned
   * fast and shrank when it did not, and it grew to 256 and took a whole
   * second: the call returns long before the GPU has done the upload, so the
   * JavaScript clock cannot see what it is being asked to budget.
   *
   * THE REAL CANVAS, NOT A RENDER TARGET, and the real scene on a layer of its
   * own. Both were the obvious thing and both would have compiled a second
   * copy of every shader: a program's key includes the output colour space and
   * tone mapping, which three drops for a render target, and the lights it was
   * compiled against, which a scene of its own would not have had. On layer 31
   * with the lights enabled on it too, every program here is the one the
   * ending will use. Shadow maps are not re-rendered for it.
   */
  _primeAdd(root, lift = false) {
    if (!root) return;
    this._primeQueue ??= [];
    this._primeHad ??= new WeakSet();
    /* THE ROOT ITSELF IS ALWAYS WALKED: a root handed in hidden is hidden
       because it is about to be shown — the simulator's layer, off until a
       lens in it draws (`primeSim`) — and the draw lifts it. Below the root,
       hidden still means hidden unless `lift` says otherwise. */
    const walk = (o, top = false) => {
      if (!lift && !top && !o.visible) return;
      if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && !this._primeHad.has(o)) {
        this._primeHad.add(o);
        this._primeQueue.push(o);
      }
      for (const c of o.children) walk(c);
    };
    walk(root, true);
  }

  /**
   * THE SIMULATOR, ON THE GPU BEFORE THE TOUR CUTS INTO IT.
   *
   * Richard: "If we are playing the Payne cutscene introduction to the Dream
   * Dojo for the first time, we should pre-load the assets for the simulator
   * so that, during the cutscene, when we transition to the simulator, there
   * is no lag spike like there currently is during the cutscene, which
   * doesn't look good." Measured in the pane before this: the tour's first
   * frame in the simulator took 1304ms against 30-50ms either side, and the
   * program count went 29 -> 43 on that one frame — every holo material
   * linked on the draw that first needed it, and every island's buffers
   * uploaded with it. The tour has ~45 seconds of the real world before that
   * cut, which is far more than the warm-up needs.
   *
   * The ending's two halves again (`_warmFinale`, `_primeFinale`): every
   * program is issued through `compileAsync` UNDER THE SIMULATOR'S OWN STATE
   * (`_simState` — its fog, the sky and petals out, the layer on), because a
   * program's key includes the fog and the lights it is drawn with and a
   * warm-up in the real world's state would link the wrong variants; and once
   * they have linked, a slice of meshes a frame is drawn into one pixel to
   * put the buffers up. `extra` is what the tour adds to the layer for its
   * own scenes (dream/tourcast.js), built hidden for exactly this.
   *
   * ONCE A SESSION: what is on the GPU stays there.
   */
  primeSim(extra = []) {
    const D = this.dream;
    if (!D?.sim || this._simPrimed) return;
    this._simPrimed = true;
    const cam = this.storyScene?.camera ?? this.camera;
    this._primeAdd(D.sim.root);
    this._primeAdd(D.simDojo?.group);
    this.primeMore(extra);
    // The draws wait for the link: drawn early, a mesh links its program itself.
    const done = () => { this._simLinked = true; };
    if (!this.renderer.compileAsync) { done(); return; }
    try {
      const back = this._simState(true);
      let p;
      try {
        p = this.renderer.compileAsync(this.scene, cam);
      } finally {
        back();
      }
      p.then(done, done);
    } catch (e) {
      console.warn('[sim] shader warm-up skipped', e);
      done();
    }
  }

  /** More for the warm-up, after it has started: things built for the
   *  simulator once their drawings landed (the tour's cast). Lifted, because
   *  they are hidden until their line. */
  primeMore(roots = []) {
    for (const r of roots) this._primeAdd(r, true);
    /* THEIR TEXTURES FIRST, ONE A FRAME, AND STRAIGHT AWAY. The first cut of
       this drew twelve meshes a frame and let each one's texture go up with
       it, and three frames of it ran 86, 202 and 95ms in the middle of
       Payne's lines — the layer's geometry is 1.7MB in all, but its labels
       are dozens of canvases and the kittens' sheets are 3840 and 3072 wide.
       An upload needs no program, so these do not wait for the link: they
       start on the tour's first frames, which are under its fade from black. */
    for (const m of this._primeQueue ?? []) {
      for (const mat of [].concat(m.material ?? [])) {
        this.primeTextures([mat.map, mat.alphaMap, mat.uniforms?.map?.value]);
      }
    }
  }

  /** Textures to put up one a frame before anything draws with them —
   *  `first` to the front of the line: the biggest ones, so they are the
   *  frames under the tour's fade from black. */
  primeTextures(texs, first = false) {
    this._primeTexHad ??= new WeakSet();
    const add = [];
    for (const t of texs) {
      if (!t?.isTexture || this._primeTexHad.has(t)) continue;
      this._primeTexHad.add(t);
      add.push(t);
    }
    this._primeTex ??= [];
    if (first) this._primeTex.unshift(...add); else this._primeTex.push(...add);
  }

  /** The simulator's look switched on (or back off): the swap `_renderView`
   *  makes for a pane in the sim. Returns the undo. */
  _simState(on) {
    const D = this.dream;
    if (!D?.sim) return () => {};
    const W = this.world;
    const kept = [this.scene.fog, W.skyMesh?.visible, W.petals?.mesh.visible, D.sim.root.visible];
    D.sim.root.visible = on;
    if (on) {
      this.scene.fog = D.sim.fog;
      if (W.skyMesh) W.skyMesh.visible = false;
      if (W.petals) W.petals.mesh.visible = false;
    }
    return () => {
      [this.scene.fog] = kept;
      if (W.skyMesh) W.skyMesh.visible = kept[1];
      if (W.petals) W.petals.mesh.visible = kept[2];
      D.sim.root.visible = kept[3];
    };
  }

  /** `primeSim`'s second half, a slice a frame while the tour plays. */
  _primeSim(cam) {
    if (!this._simPrimed) return;
    // A texture is a frame's whole budget: the big sheets cost one alone.
    const t = this._primeTex?.shift();
    if (t) {
      try { this.renderer.initTexture(t); } catch (e) { /* drawn the slow way, then */ }
      return;
    }
    if (this._simLinked) this._primeDraw(cam, true);
  }

  _primeFinale() {
    if (!this.summonScene?.active) return;
    const W = this.world.snakeWay;
    /* NOT UNTIL `_warmSnake`'s programs have linked. Drawn on the frame they
       were issued, the first road's draw waited for them, and that was a
       185ms frame at 3.37s — the thing `compileAsync` is there to avoid. */
    if (W && this._primeFor !== W && (this._snakeLinked === W || !this.renderer.compileAsync)) {
      this._primeFor = W;
      this._primeAdd(W.group, true);
      this._primeAdd(this.world.farIsles?.group, true);
    }
    this._primeDraw(this.summonScene.camera);
  }

  /** Draw the next slice of the prime queue into one pixel through `cam` —
   *  in the simulator's state when `sim` says so. */
  _primeDraw(cam, sim = false) {
    const q = this._primeQueue;
    if (!q?.length) return;
    const batch = q.splice(0, PRIME_BATCH).filter((m) => m.parent);
    const saved = [];
    const lift = (o) => {
      for (let a = o; a; a = a.parent) {
        if (!a.visible) { saved.push([a, 'visible', false]); a.visible = true; }
      }
    };
    for (const m of batch) {
      saved.push([m.layers, 'mask', m.layers.mask], [m, 'frustumCulled', m.frustumCulled]);
      m.layers.set(PRIME_LAYER);
      m.frustumCulled = false;
      lift(m);
    }
    this.scene.traverse((o) => { if (o.isLight) o.layers.enable(PRIME_LAYER); });
    const R = this.renderer;
    const sm = [R.shadowMap.autoUpdate, R.shadowMap.needsUpdate];
    R.shadowMap.autoUpdate = false;
    R.shadowMap.needsUpdate = false;
    const mask = cam.layers.mask;
    cam.layers.set(PRIME_LAYER);
    const back = sim ? this._simState(true) : null;
    try {
      R.setViewport(0, 0, 1, 1);
      R.setScissor(0, 0, 1, 1);
      R.setScissorTest(true);
      R.render(this.scene, cam);
    } catch (e) {
      console.warn('[finale] prime skipped', e);
      q.length = 0;
    } finally {
      back?.();
      cam.layers.mask = mask;
      [R.shadowMap.autoUpdate, R.shadowMap.needsUpdate] = sm;
      for (let i = saved.length - 1; i >= 0; i--) {
        const [o, k, v] = saved[i];
        o[k] = v;
      }
    }
  }

  /** `realm` — 'sim' or 'real' — is for a lens with no kittens to ask: a
   *  scene's camera that knows which world its shot is in (StoryScene). */
  _renderView(camera, x, y, w, h, members = null, scene = false, realm = null) {
    if (w < 2 || h < 2) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    this._faceAll(camera);
    this._aimXray(camera, members, scene);
    // Can this lens see the big screen? Its fireworks only go off if one can.
    this.arenaBoard?.see(camera);
    this.renderer.setViewport(x, y, w, h);
    this.renderer.setScissor(x, y, w, h);
    this.renderer.setScissorTest(true);
    /* A PANE IN THE SIMULATOR gets the simulator's sky and fog, and the real
       world's petals and sky sphere step out of it; a real pane does not draw
       the simulator at all. Swapped and put back around ONE render call, so
       no other pane, and no other part of the frame, ever sees the swap. */
    const D = this.dream;
    const sim = !!(D?.sim && (realm ? realm === 'sim' : members && D.paneIsSim(members)));
    const back = this._simState(sim);
    this.renderer.render(this.scene, camera);
    back();
    /* ...and the phase over the top, in this pane only. */
    if (members && D) D.drawPaneFx(this.renderer, members, w, h);
  }

  _render() {
    this._warmSnake();
    const size = this.renderer.getSize(new THREE.Vector2());
    const W = size.x;
    const H = size.y;

    /* ONE PANE PER GROUP, NOT PER PLAYER — which is the whole feature, and it
       reads as one line because the two hard parts live somewhere else.
       `_clusters` decided who is with whom and `splitLayout` decides how many
       panes tile a screen; neither knows about the other. The merged case is
       not special-cased any more: everybody together is one group, so it comes
       out of `splitLayout(1)` as the full frame, which is exactly what the
       hand-written branch used to do. */
    const groups = this.groups?.length ? this.groups : [this.players.map((_, i) => i)];
    const panes = this._panes(W, H, groups);
    panes.forEach((v, i) => {
      const cam = this._cameraFor(groups[i]);
      if (cam) this._renderView(cam, v.x, v.y, v.w, v.h, groups[i]);
      /* WHICH LENS EACH KITTEN WAS LAST SEEN THROUGH. `_paneHint` needs to
         compare two groups' screen positions, and that only means anything if
         both are measured through the SAME camera — which, on the frame a pane
         splits in two, is the camera that drew the pane they were sharing. It
         is recorded here because here is the only place that knows it, and
         next to `_paneSeats` because the two are read together. */
      for (const m of groups[i] ?? []) (this._paneCamOf ??= [])[m] = cam ?? null;
      /* AND WHICH WAY THAT LENS FACES, for the one control that has to be
         read through it rather than through her own `camYaw`: Snake Way,
         where the ride camera is laid over this one after it was placed. See
         `Player._viewBasis`. A lens looking straight down has no heading and
         leaves the last one. */
      if (cam) {
        cam.getWorldDirection(_viewDir);
        if (Math.hypot(_viewDir.x, _viewDir.z) > 1e-3) {
          for (const m of groups[i] ?? []) {
            const p = this.players[m];
            if (p) p.viewYaw = Math.atan2(-_viewDir.x, -_viewDir.z);
          }
        }
      }
    });
    /* WRITTEN ONCE, HERE, AT THE END OF THE FRAME. `_panes` is asked the same
       question by the HUD and the minimaps as well, and if any of them updated
       the seats then the three callers would be answering from different
       states and could disagree about where a pane is. */
    this._paneSeats = paneSeats(panes, groups, W, H);
    this._paintPaneEdges(panes, groups, W, H);
    /* THE SAME RECTANGLES, so a card and the frame around it can never
       disagree about where a pane is. */
    this.inspector.layout(panes, groups, W, H);
  }

  /**
   * Frame every pane in the colour of whoever is in it.
   *
   * FOUR SMALL PANES AND A 13px PIP IS NOT ENOUGH TO FIND YOURSELF BY. Reported
   * from four-player play on a PC: nobody could reliably tell which quarter of
   * the screen was theirs, or which of the four scores along the top was
   * theirs. Both are the same question — "which one am I" — and one answer
   * fixes both, as long as the answer is the same in both places. So the pane
   * gets a band of her colour and the score badge gets an inset ring of the
   * same colour, and neither is subtle.
   *
   * NOT WHEN THERE IS ONLY ONE PANE. A single frame around the whole screen
   * answers a question nobody is asking and puts a coloured box round the game.
   *
   * A SHARED PANE IS A GRADIENT ACROSS ITS MEMBERS, not one member's colour and
   * not a neutral grey. Two kittens standing together are both in there, and
   * picking one of them to name the pane after would be wrong for the other
   * exactly half the time — which is worse than no answer, because it is a
   * confident wrong one.
   *
   * THE COORDINATES COME IN WEBGL-SIDE-UP. `splitLayout` works in the
   * renderer's bottom-left origin because that is what `setViewport` wants;
   * CSS counts from the top. Getting that inversion wrong does not look
   * broken — it looks like the frames belong to the wrong players, which is
   * the one failure this whole feature exists to prevent.
   */
  _paintPaneEdges(panes, groups, W, H) {
    const host = document.getElementById('pane-edges');
    if (!host) return;
    const show = panes.length > 1 && this.state === 'play' && !this.paused;
    host.classList.toggle('hidden', !show);
    if (!show) { if (host.childElementCount) host.textContent = ''; return; }

    while (host.childElementCount < panes.length) {
      const d = document.createElement('div');
      d.className = 'pane-edge';
      host.appendChild(d);
    }
    while (host.childElementCount > panes.length) host.lastElementChild.remove();

    panes.forEach((v, i) => {
      const el = host.children[i];
      el.style.left = `${v.x}px`;
      el.style.top = `${H - v.y - v.h}px`;      // WebGL bottom-left -> CSS top-left
      el.style.width = `${v.w}px`;
      el.style.height = `${v.h}px`;
      const members = groups[i] ?? [];
      /* HER colour, off the kitten. This line said `styleCss(m)` — a seat
         number where a style index belongs — which is the whole of the
         "Storm and Blossom have each other's border" report. See `_styleAt`. */
      const cols = members.map((m) => cssFor(this.players[m]?.style));
      /* One member still goes through the gradient, with the same colour at
         both ends. A separate solid-colour path would be a second way of
         saying the same thing and a second place for it to go wrong. */
      const stops = cols.length > 1 ? cols.join(', ') : `${cols[0]}, ${cols[0]}`;
      el.style.borderImageSource = `linear-gradient(135deg, ${stops})`;
    });
  }

  /**
   * The pane rectangles for a set of groups.
   *
   * ONE CALL, BECAUSE THE RENDERER AND THE HUD MUST NOT DISAGREE. `splitLayout`
   * now takes the group SIZES as well as the count — a pane holding two kittens
   * is worth half the screen rather than a quarter — and two callers each
   * assembling that argument themselves is how a minimap ends up positioned for
   * a pane the renderer drew somewhere else.
   */
  _panes(W, H, groups) {
    const panes = splitLayout(
      groups.length, W, H, 3, this.settings.dir, groups.map((m) => m.length)
    );
    /* ...AND THEN GIVEN TO WHOEVER WAS ALREADY STANDING THERE. `splitLayout`
       decides the shapes; `stablePanes` decides who gets which, so a player
       does not get thrown across the screen because two OTHER kittens walked
       towards each other. See core/split.js for the worked example.

       IT IS PURE AND DETERMINISTIC, WHICH IS WHY IT CAN LIVE IN HERE. This is
       called three times a frame — renderer, HUD, minimaps — and all three
       must agree; a function of (panes, groups, seats) gives the same answer
       every time, and `_paneSeats` is only rewritten once, at the end of the
       frame, by `_render`. */
    const hint = this._paneHintFor === groups ? this._paneHint : null;
    return stablePanes(panes, groups, this._paneSeats, W, H, hint);
  }

  /** Slow drifting fly-over behind the title screen. */
  _renderTitleIdle(dt) {
    /* NO WORLD, NO FLY-OVER — a phone's title is black (see `boot`). */
    if (!this._worldReady) return;
    this._titleT = (this._titleT ?? 0) + dt;
    const t = this._titleT * 0.06;
    const cam = this.sharedCamera;
    const r = 190;
    cam.position.set(Math.cos(t) * r, 78 + Math.sin(t * 0.7) * 22, Math.sin(t) * r);
    cam.lookAt(0, 6, 20);
    this.world?.update(dt, { x: 0, z: 0 });
    for (const d of this.dragons) d.update(dt, this.world, []);
    this.dojo?.update(dt, []);
    const size = this.renderer.getSize(new THREE.Vector2());
    this._renderView(cam, 0, 0, size.x, size.y, null, true);
  }

  _resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
  }
}

/**
 * Yield a frame so the loading screen can repaint between build steps.
 *
 * requestAnimationFrame does NOT fire in a hidden or background tab, so an
 * rAF-only wait hangs boot forever on the loading screen — open the game in a
 * background tab and it simply never starts. The timeout is the escape hatch:
 * whichever comes first wins.
 */
function frame() {
  return new Promise((resolve) => {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(() => setTimeout(go, 0));
    setTimeout(go, 60);
  });
}

/** Gamepad ids come from the device, so they're escaped before going in HTML. */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const game = new Game();
game.boot().catch((err) => {
  console.error(err);
  const el = document.getElementById('load-text');
  if (el) el.textContent = `Something broke: ${err.message}`;
});
window.game = game;
