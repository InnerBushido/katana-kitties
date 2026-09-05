import * as THREE from 'three';
import './style.css';

import {
  InputManager, HALVES, MAP_FIELDS, VJOY_AXIS_NAMES, deviceId, KEYSETS,
} from './core/input.js';
import { Audio, trackForIsland } from './core/audio.js';
import { loadSpriteAtlas, recolourAtlas } from './core/spritesheet.js';
import { placeholderCatAtlas, placeholderDragonTexture, placeholderPandaTexture } from './core/gfx.js';
import {
  detect as detectDevice, readOverride, writeOverride, QUALITY, effectivePixelRatio,
  autoQualityVerdict, AUTO_GRACE_MS,
} from './core/device.js';
import { TouchPad, wardLatchExpired } from './core/touchpad.js';
import { World, CLANS } from './world/world.js';
import { Player, ATTACKS, COMBAT, BASE_REACH, MAX_HP, KO_TIME } from './entities/player.js';
import { PLAYER_STYLE, MAX_PLAYERS, styleFor, styleCss, cssFor } from './core/palette.js';
import {
  splitLayout, mapWidth, mapSpot, assignMaps, nearestMap, keyMaps, fitDistance, stablePanes,
  paneSeats, outOfShot, framedMembers, paneWiden,
} from './core/split.js';
import { clusterPlayers, MERGE_IN, MERGE_OUT } from './core/cluster.js';
import { Dragon, BREEDS } from './entities/dragon.js';
import { Panda, tierFor, toNextTier } from './entities/panda.js';
import { ClanLeader, LEADERS } from './entities/leader.js';
import { Orb, OrbPickup } from './entities/orb.js';
import { MathDojo, DOJO_VIEW_R, inDojoView } from './systems/mathdojo.js';
import { Minimap, TOUCH_ZOOM } from './systems/minimap.js';
import { MenuNav } from './systems/menunav.js';
import { Cutscene } from './systems/cutscene.js';
import { Trailer } from './systems/trailer.js';
import { CrossFx } from './systems/crossfx.js';
import { Confirm } from './systems/confirm.js';
import { ShrineScene, SCENE_RADIUS } from './systems/shrinescene.js';
import { SummonScene } from './systems/summonscene.js';
import { DragonBall, BALL_COUNT, PICKUP_RADIUS } from './entities/dragonball.js';
import { Ryuuseki, HOVER, RYU_VIEW, RYU_SIZE } from './entities/ryuuseki.js';
import { MrSatan } from './entities/satan.js';
import { Griffin } from './entities/griffin.js';
import { Announcer } from './systems/announce.js';
import {
  Tournament, MODE_BY_ID, modesFor, teamColour, teamName, NO_SIDE,
} from './systems/tournament.js';
import { Menagerie } from './systems/menagerie.js';
import { AngelForm } from './entities/angel.js';
import { ArenaQuest, SATAN_TOWN, MILESTONES } from './systems/arenaquest.js';
import { SatanBlast } from './systems/satanblast.js';
import { loadBoard, BOARD_MODES } from './systems/leaderboard.js';
import { Kotodama, buildWornOrbs } from './systems/kotodama.js';
import { ORB_IDS, CROSS } from './entities/powerorb.js';
import { ProfileScreen } from './systems/profile.js';
import { Inspector } from './systems/inspector.js';

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
const SUB_PANELS = ['panel-board', 'panel-help', 'panel-settings',
  'panel-kittens', 'panel-watch', 'panel-ending'];

/** The key each debug action is bound to, for the panel's own labels. */
const DEBUG_KEY_LABEL = {
  /* `1` IS THE FRAME COST AND IT USED TO BE `P`. `P` was also player 2's mount
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
     are safe for the same reason `1` is — `pad-check` asserts that nothing in
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
const TOAST_MIN = 1700;
const TOAST_BASE = 600;
const TOAST_PER_CHAR = 55;
const TOAST_MAX = 7000;
const TOAST_FADE = 500;



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
    /* AUTO-DOWNGRADE, ON UNTIL A HUMAN HAS AN OPINION. The moment somebody
       picks a quality in Settings this goes false and stays false for the
       session: a setting that argues back with the person using it is worse
       than no setting. See `_autoQualityCheck`. */
    this._autoQuality = true;
    this._autoBadSince = 0;
    this._autoNextAt = 0;

    this.scene = new THREE.Scene();
    this.input = new InputManager();
    this.audio = new Audio();
    this.clock = new THREE.Clock();

    this.state = 'loading';
    this.paused = false;
    /* WHICH PLAYER IS DRIVING THE MENU, as a slot index, or null for "anybody".
       See `_claimMenu` — this is the whole of the one-cursor rule. */
    this.menuOwner = null;
    this.merged = true;
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
    };
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
    });
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
      this._autoSeated?.clear();
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
      const hall = this.world?.clanHallNear(p.position.x, p.position.z);
      if (!hall || p.clan?.id === hall.clan.id || !this.leaderFor(hall.clan)?.met) {
        p.setCallout(null);
        continue;
      }
      const key = this.input.promptFor(p.index, 'interact');
      /* NO BUTTON, NO PROMPT. A slot with nothing bound to it cannot be told
         what to press, and "press ? to swear" is worse than the silence this
         whole function exists to fix. */
      if (!key) { p.setCallout(null); continue; }
      p.setCallout(`[${key}]  ${hall.clan.oath.toUpperCase()}`);
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

  async boot() {
    const setLoad = (t) => {
      const el = document.getElementById('load-text');
      if (el) el.textContent = t;
    };

    setLoad('Waking the storm dragons…');
    /* The kitten sheets are a full 360-degree rotation across the columns and
       one animation pose per row. The column count is detected rather than
       assumed — see loadSpriteAtlas. */
    const [ember, frost, dragonTex, dragonFlyTex, pandaCub, pandaAdult] = await Promise.all([
      this._loadSprite('/sprites/ember_grid_v2.png', 'auto', 4,
        () => placeholderCatAtlas('#f2683c', '#c33a22', '#33408c')),
      /* frost_grid.png, NOT the v2 sheet. v2's four rows disagree with each
         other about which way the character turns — its jump and attack rows
         are drawn mirrored against its idle and walk rows — so no single
         mapping can be right for all of them. This older sheet is internally
         consistent: column 4 is a back view in every row. */
      this._loadSprite('/sprites/frost_grid.png', 'auto', 4,
        () => placeholderCatAtlas('#b9b6c4', '#7d7a8c', '#d86a9e')),
      this._loadSprite('/sprites/dragon_sheet.png', 1, 1,
        () => ({ texture: placeholderDragonTexture(), cols: 1, rows: 1, aspect: 1.9 })),
      this._loadSprite('/sprites/dragon_fly.png', 1, 1,
        () => ({ texture: placeholderDragonTexture(), cols: 1, rows: 1, aspect: 1.9 })),
      /* The two panda tiers. Single side-on cells like the dragon, not
         turnarounds — the billboard mirrors them and the heading is locked
         broadside, so one drawing per tier is all there is to read. */
      this._loadSprite('/sprites/panda_cub.png', 1, 1,
        () => ({ texture: placeholderPandaTexture(true), cols: 1, rows: 1, aspect: 1 })),
      this._loadSprite('/sprites/panda_adult.png', 1, 1,
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
      `/sprites/leader_${n}.png`, 1, 1,
      () => ({ texture: placeholderCatAtlas(), cols: 4, rows: 1, aspect: 1 }),
    )));
    this.leaderArt = Object.fromEntries(leaderNames.map((n, i) => [n, leaderArt[i]]));

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
    this._spawnPickups();
    this._spawnLeaders();

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
    this.ryuArt = await loadSpriteAtlas('/sprites/ryuuseki.png',
      { views: 1, rows: 1, clearPockets: true, maxAtlas: this.device.atlasMax })
      .catch(() => null);
    this.summonScene = new SummonScene({ world: this.world, audio: this.audio });
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
      loadSpriteAtlas('/sprites/leader_satan.png',
        { views: 1, rows: 1, clearPockets: true, maxAtlas: this.device.atlasMax })
        .catch(() => null),
      loadSpriteAtlas('/sprites/griffin.png',
        { views: 1, rows: 1, clearPockets: true, maxAtlas: this.device.atlasMax })
        .catch(() => null),
      /* His arms-up pose, for the one second before he detonates. Loaded with
         the same options as his idle sheet — the two are measured against each
         other (see `MrSatan.setChargeArt`), and a different `clearPockets` or
         `maxAtlas` between them would mean comparing two numbers taken with
         two different rulers. Missing costs the pose and nothing else. */
      loadSpriteAtlas('/sprites/satan_charge.png',
        { views: 1, rows: 1, clearPockets: true, maxAtlas: this.device.atlasMax })
        .catch(() => null),
    ]);

    this.announcer = new Announcer({ audio: this.audio });
    this.announcer.art = satanArt;
    /* Every line he says outside a full-screen scene, buffered at boot. These
       fire mid-play with nothing waiting on them, so a clip fetched at the
       moment he opens his mouth arrives over a game that has moved on. */
    await this.announcer.load({
      ...Object.fromEntries(MILESTONES.map((m) => [m.id, `/voice/${m.id}.mp3`])),
      sat_board: '/voice/sat_board.mp3',
      sat_r1: '/voice/sat_r1.mp3',
      sat_r2: '/voice/sat_r2.mp3',
      sat_r3: '/voice/sat_r3.mp3',
      sat_fight: '/voice/sat_fight.mp3',
      sat_feast: '/voice/sat_feast.mp3',
      sat_ko: '/voice/sat_ko.mp3',
      /* THE CLOCK, IN FOUR CUES AND NOT ONE CLIP. Thirty, fifteen, ten, and
         then the count — which is the odd one out twice over: it is the only
         thing in this list PLAYED rather than said (no card; the number it is
         counting is already on the screen) and the only one where arriving
         late means arriving WRONG, because each number inside it is nailed to
         the second it names. `sat_zero` is the shout the round ends on.
         All four are cut by tools/capture/satan-countdown.mjs. */
      sat_t30: '/voice/sat_t30.mp3',
      sat_last1: '/voice/sat_last1.mp3',
      sat_last2: '/voice/sat_last2.mp3',
      sat_count: '/voice/sat_count.mp3',
      sat_zero: '/voice/sat_zero.mp3',
      sat_draw: '/voice/sat_draw.mp3',
      sat_win1: '/voice/sat_win1.mp3',
      sat_win2: '/voice/sat_win2.mp3',
      /* His tantrum, both halves. Buffered here with the rest and not lazily,
         for the reason `load` gives at length: these fire mid-play with
         nothing waiting on them, and the second one is the cue for an
         explosion one second later — a clip that arrives late arrives after
         the bang it was supposed to announce. */
      sat_taunt: '/voice/sat_taunt.mp3',
      sat_blast: '/voice/sat_blast.mp3',
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
      ['rat', 'rat.png', false],
      ['rat_shock', 'rat_shock.png', false],
      /* TWO RABBIT BODIES: one scampering along the floor and one mid-leap.
         It shipped with only the leap, so the animal was frozen in a jumping
         pose while running along the ground — which reads as a broken sprite
         rather than as a rabbit, and it also threw away the one visual cue
         that says whether it can be pinned right now. */
      ['rabbit_run', 'rabbit_run.png', false],
      ['rabbit_air', 'rabbit.png', false],
      ['rabbit_shock', 'rabbit_shock.png', true],
      ['bird', 'bird.png', false],
      ['bird_shock', 'bird_shock.png', false],
      ['angel_wings', 'angel_wings.png', false],
      /* The kittens' own crouched eating pose. Loaded here rather than with
         the turnaround sheets because it is the same KIND of thing as the rest
         of this block — a single front-facing cell that never mirrors — and
         because a missing one costs the pose and nothing else. */
      ['ember_eat', 'ember_eat.png', false],
      ['frost_eat', 'frost_eat.png', false],
      /* THE RECEIVING POSE — both paws to the sky, taking the thing above her
         head. Worn for a dragon ball and for a first clan oath, which are the
         same moment twice: see `Player.setBlessArt`.
         TWO FILES FOR FOUR KITTENS, exactly like the eating pose. Storm draws
         from Ember's sheet and Blossom from Frost's, and both go through
         `recolourAtlas` below — so "generate a new player sprite" is two
         drawings and four cats, and the two recolours cannot be forgotten
         because nothing has to remember them. */
      ['ember_bless', 'ember_bless.png', false],
      ['frost_bless', 'frost_bless.png', false],
    ];
    const critterArt = {};
    await Promise.all(CRITTER_ART.map(async ([key, file, facesRight]) => {
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
        views: 1, rows: 1, cell: 256, maxAtlas: 768,
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
      const a = await loadSpriteAtlas(`/sprites/clan_${c.id}.png`, {
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
    /* The Powerup Kotodama, and the screen the girls swap them on. Both are
       built at boot and inert until 100% mischief — `Kotodama.awakened` is the
       one flag that says whether any of it exists, and the update loop, the
       minimap and the stall prompt all read that rather than each keeping
       their own idea of whether the endgame has started. */
    this.kotodama = new Kotodama(this);
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
    this._applyQuality();

    document.getElementById('loading').classList.add('hidden');
    document.getElementById('title').classList.remove('hidden');
    this.state = 'title';

    this.renderer.setAnimationLoop(() => this._tick());
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
    if (old) this.scene.remove(old.group);
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
    this._dressPlayer(p);
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
        /* The three groups the pause menu was cut into. They carry no state of
           their own — every row inside is the same `data-action` it was when
           it sat in the pause menu — so opening one is only a `show`. */
        if (a === 'kittens') show('panel-kittens');
        if (a === 'watch') show('panel-watch');
        if (a === 'ending') show('panel-ending');
        if (a === 'profile') this.profile.open('profile', { fromPause: true });
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
          this.confirm.ask({
            title: 'QUIT THE GAME?',
            body: 'This closes the window. Nothing is saved except the record '
              + 'board, which is always kept.',
            no: 'NO, KEEP PLAYING',
            yes: 'YES, QUIT',
            onYes: () => this.quitGame(),
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
        after?.();
      });
    };
    bind('set-split', 'split');
    bind('set-dir', 'dir');
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
    jc.addEventListener('change', () => { this.input.joyconRotation = jc.value; });

    /* Volume sliders. Both preview themselves as you drag — a volume control
       you can't hear while setting is a guessing game, especially for a kid. */
    const vol = (id, apply, preview) => {
      const el = document.getElementById(id);
      el.addEventListener('input', () => {
        this.audio.resume();
        apply(el.value / 100);
        preview?.();
      });
    };
    vol('set-sfx', (v) => this.audio.setSfxVolume(v), () => this.audio.play('menu'));
    vol('set-music', (v) => {
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
          const opening = !this.paused;
          this.setPaused(opening);
          /* ESC BELONGS TO WHOEVER IS AT THE KEYBOARD, so the menu goes to the
             lowest slot playing on one. If nobody is on a keyboard at all,
             `_claimMenu(null)` leaves it shared: the person who pressed Esc has
             a mouse and no slot, and handing her cursor to an arbitrary pad
             would lock out the only player who asked for the menu. */
          if (opening) {
            const kb = this.input.players.findIndex(
              (p, i) => i < this.players.length && p.source === 'keyboard',
            );
            this._claimMenu(kb >= 0 ? kb : null);
          }
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
   * to be told she had none. There are two maps at most (see `_buildHud`), so
   * with three or four panes somebody's corner is empty — and the old answer,
   * a toast reading "No map in your window", was honest and no use: the
   * information she wants IS on screen, she simply had no way to change how
   * much of it she could see. Two maps, four kittens, two drivers each is what
   * Richard asked for, and `nearestMap` decides which pair share which.
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
   * two maps, half of them are turning a dial in somebody else's corner — and
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
      || this.shrineScene?.active || this.finaleScene?.active);
  }

  /** Skip whichever scene is up. Harmless if none is. */
  _skipScene() {
    if (this.cutscene?.active) this.cutscene.skip();
    if (this.summonScene?.active) this.summonScene.skip();
    if (this.shrineScene?.active) this.shrineScene.skip();
    if (this.finaleScene?.active) this.finaleScene.skip();
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
  quitGame() {
    window.close();
    setTimeout(() => {
      if (window.closed) return;
      this.toTitle();
      const key = navigator.platform?.startsWith('Mac') ? '⌘W' : 'Ctrl+W';
      this.toast(`Your browser will not let the game close its own window — press ${key} to close the tab.`);
    }, 350);
  }

  /** Put the world back to its opening state without a page reload. */
  restart() {
    for (const p of this.players) {
      for (const o of p.orbs ?? []) this.scene.remove(o.group);
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
    /* Un-meet every leader. A restart is the world put back to its opening
       state, and six introductions already spent is exactly the sort of
       leftover that makes a "restart" feel like it only half worked. */
    this.shrineScene?.finish();
    this.shrineScene?.dwell.clear();
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
    if (this.summonScene) this.summonScene.played.finale = false;
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

    this.setPaused(false);
    this.toast('Adventure restarted!', 0);
  }

  toTitle() {
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

  /** Push one answer out to every orb that draws its own working. */
  _applyMath(on) {
    this.mathVisible = on;
    for (const p of this.players) {
      for (const o of p.orbs ?? []) o.setMathVisible(on);
      /* Only the LEAD worn orb prints its working. Eight copies of the same
         two figures orbiting one cat is noise, and the reason the plain orb's
         overlay was legible in the first place was that there was one of it. */
      (p.wornOrbs ?? []).forEach((o, i) => o.setMathVisible(on && i === 0));
    }
  }

  _toggleMath() {
    this._applyMath(!this.mathVisible);
    this.toast(this.mathVisible ? 'Math overlay ON' : 'Math overlay OFF', 0);
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

    document.getElementById('title').classList.add('hidden');
    for (const id of SUB_PANELS) document.getElementById(id)?.classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    this.state = 'play';
    this.clock.getDelta();
    this._updateHint();
    // Browsers won't let audio start without a gesture, and pressing PLAY is
    // the first one we're guaranteed to get.
    this.audio.resume();

    /* The story, once per session. It plays here rather than on the title
       screen because this is the first guaranteed user gesture — the intro
       has music and voices, and starting it a moment earlier would mean
       starting it silently. Restarting the world doesn't replay it; the
       pause menu has a button for people who want it again. */
    /* Seed each kitten's island claim as already SETTLED, so the first frame
       of play picks her island's theme instead of 1.1 seconds of silence while
       the dwell counts up. It matters on restart too, which can drop them
       somewhere other than home. */
    for (const p of this.players) {
      p._musicIsland = this._islandUnder(p);
      p._musicSince = ISLAND_DWELL;
    }

    if (this.cutscene && !this.introPlayed) {
      this.introPlayed = true;
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

      if (!p.clan?.buff?.seek) {
        p.seekMark.visible = false;
        continue;
      }

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
      if (!t || t.scored) { p.seekMark.visible = false; continue; }
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
   * Pandapaw's payout: give this kitten the panda her bamboo tally has earned.
   *
   * Called on swearing the oath and on every cane cut, so it is the single
   * place that decides whether a panda exists and how big it is.
   *
   * `bambooCut` is a LIFETIME tally, so banked canes still buy the cub the
   * moment she swears. Growing that cub UP is charged from `pandaFedFrom`, the
   * tally at the instant the panda was last granted, so those same banked
   * canes cannot also pay for the adult — see tierFor. One consequence worth
   * knowing: a fresh panda can only ever be a cub, because tierFor with no
   * panda yet returns tier 0 or nothing.
   */
  _updatePanda(player) {
    if (!player.raisedPanda) return;
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
      if (player.panda && !left) text = `${player.pandaName} is fully grown`;
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
  }

  /** The leader standing at a clan's shrine. Used to gate joining on `met`. */
  leaderFor(clan) {
    return this.leaders.find((L) => L.clan.id === clan.id) ?? null;
  }

  /* ---------------------------- debug keys ------------------------------- */

  /**
   * Shortcuts for testing the dragon, which is otherwise about ten minutes of
   * flying away and needs two players to see at its best.
   *
   * `7` collects all seven stars, `8` seats both kittens, `9` fires. They are
   * deliberately unbound from anything a player would press by accident and
   * they toast loudly, so nobody can trip one and wonder what happened.
   *
   * `9` exists because the DUO attack is the whole point of the feature and
   * the hardest thing in the game to reach: it needs the second kitten's
   * attack button while both are aboard. On a laptop that button was on a
   * numpad that isn't there — the same gap the `alt` keys in `KEYSETS` close
   * properly. This is the version that needs no hands on the other side of the
   * keyboard at all.
   */
  _debugKey(code) {
    /* --- the two fast-forwards, `4` and `5` ---
       `4` ENDS THE BEAT AND `5` NUDGES IT. One call each into `Tournament`,
       which owns the transitions, so a key cannot disagree with the game about
       what comes next — the same rule that made `4` stop hitting a kitten.

       `4` USED TO ONLY KNOW ABOUT A LIVE ROUND, and a key called "end the
       round" that does nothing for the fifteen seconds afterwards is a key you
       press, watch do nothing, and press again. Asked for as: "make the 4
       command to end the round work for the current battle round, and feast,
       it is like a fast forward button to move along the script to the next
       part." See `Tournament.endBeat`, where every state answers it.

       `5` IS THE FINER ONE and it exists because of the last thirty seconds:
       Mr. Satan says a different line at 30, at 15 and at 10, and each of them
       used to cost two minutes of a live round to hear. See `Tournament.nudge`
       for why it steps onto each mark rather than jumping past them.

       IT CALLS THE ROUND, IT DOES NOT KILL ANYBODY. `4` used to hit
       `this.players[1]` for her whole health bar — which read as ending the
       round only in a duel. At four players it killed Frost and left the other
       two standing; in a 2v2 it did not end the round at all, because a side
       is not out until everybody on it is. Reported from play as "it doesn't
       end the round, it just kills Frost". `callOnDamage` underneath both of
       these is the same decision the clock makes at `ROUND_LIMIT`, so the key
       cannot disagree with the game about who won, at any league size, and
       nobody is hurt to get it: whoever was ahead on damage takes the round
       with the score she had actually earned, and an untouched round is a
       draw.

       BOTH REFUSE OUT LOUD AND NAME THE KEY THAT FIXES IT. Sixth
       non-negotiable, and it earns its keep here: "no tournament is running"
       and "this key is broken" look identical from a chair. */
    if (code === 'Digit4' || code === 'Digit5') {
      const nudge = code === 'Digit5';
      /* A STORY BEAT IS ONE OF THE THINGS `5` STEPS THROUGH, and `4`'s answer
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
        this.toast('[debug] no tournament running — press 7 to go to the arena', 0);
        return;
      }
      const did = nudge ? this.tournament.nudge() : this.tournament.endBeat();
      this.toast(did ? `[debug] ${did}` : '[debug] nothing to skip in this bit', 0);
    }

    /* --- Mr. Satan's tantrum, without the ten seconds ---
       Same argument as `4`. The gag is a FUSE: walk up to him, get taunted,
       and then wait ten seconds before anything moves — which is what makes it
       land in play and what made it unlookable-at while it was being written.
       `2` jumps to the shout, the frame the charge and the explosion both hang
       off, through `provoke` and therefore through the real `_shout`.

       IT REFUSES OUT LOUD AND SAYS WHAT TO PRESS. Sixth non-negotiable: the
       key does nothing at all unless the arena is open and he is standing in
       his box, and a debug key that silently ignored you is one you would spend
       ten minutes deciding was broken. */
    if (code === 'Digit2') {
      if (!this.tournament?.active || !this.satan?.group.visible || this.travel) {
        this.toast('[debug] no Mr. Satan to annoy — press 6, then fly to the arena', 0);
        return;
      }
      this.satanBlast?.provoke();
      this.toast('[debug] Mr. Satan has had enough of your kitty shenanigans', 0);
    }

    /* --- THE WHOLE ENDGAME, IN ONE KEY ---
       Everything this unlocks sits behind 216 props knocked over — most of an
       afternoon — so checking one colour on one orb, or one word of the ending,
       or whether a round card is centred, meant playing the whole game first.
       See `_debugEndgame`. */
    if (code === 'Digit6') this._debugEndgame();
    /* --- AND THEN THE ARENA, WHICH IS WHERE YOU WERE GOING ---
       `7` follows `6` because that is the order they are pressed in: unlock the
       endgame, then fly out to the ring. It used to be the last row of the
       SCENE VIEWER, labelled "not a scene, but it belongs in the same list" —
       which was true of why it was hard to reach and false about what it is,
       and it meant two keys and a cursor to do the thing `6` sets up. Asked
       for as: "let's add the 'Go to the arena' to be a number key press."
       Through `_goToArena`, the same path the scene viewer's row called, so
       nothing about what it does has moved. */
    if (code === 'Digit7') this._goToArena();
    /* --- EVERY ABILITY ON EVERY KITTEN, IN ONE KEY ---
       The eight orbs are the endgame collectible, so trying one of them meant
       either playing to 100% mischief or pressing `6` and then trading orbs
       around the profile screen one at a time — and the abilities are exactly
       the thing that needs trying repeatedly, because they change verbs rather
       than numbers. Wearing all eight at once is also the stack case every
       `1 + k*n` rule in powerorb.js is written for and the hardest one to reach
       by hand. */
    if (code === 'Digit3') this._debugAllOrbs();
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

       IT IS `1` AND IT USED TO BE `P` — see DEBUG_KEY_LABEL for why. */
    if (code === 'Digit1') this._togglePerf();
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
   * IT DOES NOT UNLOCK THE ENDGAME AND MUST NOT. `6` is that key, and the two
   * do different jobs: this one is for testing what the abilities DO, and
   * hanging the world state off it would mean anybody who wanted a triple slash
   * also got the ending played at them. They compose — press 6 then 3 — which
   * is the point of keeping them apart.
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

  _debugEndgame() {
    const { share, orbs } = this._unlockEndgame();

    // And the ending, on the first frame nothing else owns the screen.
    this.summonScene.played.finale = false;
    this._finaleDue = true;

    this.toast(
      `[debug] endgame: ${share} pts each, ${orbs} orbs out, arena open`, 0
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
      this._announceAwakening(this.kotodama.awaken());
    }

    // The tournament, open and waiting in the town.
    if (this.quest) {
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
    }

    return { share, orbs: this.pickups.filter((k) => !k.taken).length };
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
   * it; it is `7` now. See `_goToArena`.
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
    const B = this._worldBounds();
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
      case 'found':
      case 'summon':
        this.summonScene.played[pick.id] = false;
        this.summonScene.start(pick.id, this.ryu?.position ?? B.centre,
          this.ryu ? RYU_SIZE : 30);
        break;
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
        this.summonScene.start('finale', B.centre, B.radius, this.leaderArt.elder);
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
   * GO TO THE ARENA NOW — debug `7`, and the whole unlock skipped.
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
   * The frame cost, in the corner, on `1`.
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
  _autoQualityCheck(now) {
    if (!this._autoQuality) return;
    const { verdict, next } = autoQualityVerdict({
      quality: this.settings.quality,
      medianMs: this._frameMedian(),
      /* A HIDDEN TAB IS NOT A SLOW MACHINE. See the note on `autoQualityVerdict`
         — this is the gate that was missing, and `_discardPerf` is its other
         half. */
      visible: document.visibilityState === 'visible',
      playable: this.state === 'play' && !this.paused && !this._sceneActive(),
      now,
      badSince: this._autoBadSince,
      notBefore: this._autoNextAt,
    });
    if (verdict === 'reset') { this._autoBadSince = 0; return; }
    if (verdict === 'start') { this._autoBadSince = now; return; }
    if (verdict === 'wait') return;

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
      ${row('Digit6', 'THE ENDGAME — ending, arena, orbs, purses')}
      ${row('Digit7', 'go to the arena NOW (skips the whole unlock)')}
      ${row('Digit3', 'give EVERY kitten all 8 kotodama')}
      ${row('Digit4', 'END this bit — round, ceremony or feast')}
      ${row('Digit5', 'NUDGE it on — 30s, 15s, 5s, next line')}
      ${row('Digit2', 'Mr. Satan loses his temper (skip the fuse)')}
      ${row('Digit1', 'frame cost — fps, draws, pixels, GPU', this._perfOn)}
      <div class="dbg-sep">FOUR PLAYERS, ONE KEYBOARD</div>
      ${row('Backslash', 'force-spawn — ENTER seats 3 &amp; 4 on the keyboard',
    this.input.forceSeats)}
      ${row('KeyR', `WASD &#8594; ${this._keyboardHeldBy(0)}`)}
      ${row('KeyU', `${KEYSETS[1].name} &#8594; ${this._keyboardHeldBy(1)}`)}
      ${TUNING_ROW}
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
        this._updateBallHud();
        /* The Zelda beat. She stops, lifts it, the camera comes in — and the
           star she holds up is this star's own face, so a kid can see which
           one she just got without reading the toast. */
        p.holdAloft(b.ball.material.map);
        this.starShot = { player: p, t: STAR_POSE };
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
    if (this.starShot) {
      this.starShot.t -= dt;
      if (this.starShot.t <= 0) this.starShot = null;
    }
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
  strikePlayers(attacker, kind, reach, dir) {
    if (!this.tournament?.fighting) return;
    const A = ATTACKS[kind] ?? ATTACKS.stand;
    /* The clan buff still multiplies, and the round card shows both badges so
       the asymmetry is visible rather than mysterious. Riverclaw really does
       out-reach an unsworn kitten in here — that is the payoff for having
       flown out and sworn, and the answer to it is to go and get one. What
       must not happen is a girl losing to a reach she cannot see. */
    const clanK = reach / BASE_REACH;
    const range = A.reach * clanK;
    /* Juuji stacks make each of the three cuts hit harder rather than adding
       a fourth. Four cuts is a different move; the same three landing for more
       is the same move, better — which is what a stack should always be. */
    const dmg = A.dmg * (kind === 'tri' ? (attacker.power?.tri?.dmgK ?? 1) : 1);

    for (const target of this.players) {
      if (target === attacker || target.ko) continue;
      /* NO FRIENDLY FIRE, and it is one more clause on the SINGLE gate rather
         than a rule of its own — the whole reason `strikePlayers` exists is
         that there is exactly one place asking whether two kittens may hurt
         each other. A tag-team partner you can cut down is not a partner, and
         with two sisters on a side the first accident becomes an argument about
         whether it was an accident. Free-for-all and duel are unaffected:
         nobody shares a side in either. */
      const dx = target.position.x - attacker.position.x;
      const dz = target.position.z - attacker.position.z;
      const dy = target.position.y - attacker.position.y;
      const dist = Math.hypot(dx, dz);
      /* TWO SEPARATE QUESTIONS: how far away on the ground, and how far apart
         in height. `COMBAT.strikeHeight` was the literal 4.5 here, which is a
         column NINE METRES tall — a kitten on the arena floor cutting one who
         had double-jumped over her head, with no way for the girl in the air to
         read it as anything but being hit from nowhere. It is halved and it is
         on the balance page now; the note on it in player.js has the rest.
         NOT scaled by `clanK`. Riverclaw's blade is LONGER, not taller: a reach
         buff is a statement about how far in front of her the arc goes, and
         letting it grow the vertical window as well would hand the one clan
         that out-reaches you the ability to reach up as well as out. */
      if (dist > range || Math.abs(dy) > COMBAT.strikeHeight) continue;
      // Same forward-arc test the props get, widened for the dash so a charge
      // that visibly connects is not refused on a half-degree of facing.
      const dot = (dx * dir.x + dz * dir.y) / (dist || 1);
      if (dot < A.arc) continue;

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
        if (target.daze()) {
          this.sfx('hit');
          this.toast(`${attacker.name} dazed ${target.name} — watch your team!`, attacker.index);
        }
        continue;
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
        }
        /* THE BLOCKED CASE MAKES ITS OWN NOISE NOW, inside `triCapture`.
           It used to be an `else if (target.warded)` here playing `wardhit`,
           and that stopped being one sound the moment a blocked cut started
           costing her half the bubble: absorbed, expired and smashed are
           three different things to tell her. `Player._wardTakeHit` picks,
           because it is the thing that knows which happened. */
        continue;
      }

      const dealt = target.hurt(dmg, attacker.position, A, this);
      if (!dealt) continue;
      attacker.dmgDealt += dealt;
      this.tournament.onHit(attacker, target, dealt, kind);
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
    const up = !(this.ballsHeld === 0 && !this.ryu);
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

  /** The seventh star: Patchfur speaks, and the dragon appears over the town. */
  _onAllBalls() {
    const torii = { x: 0, z: -46 };
    const g = this.world.heightAt(torii.x, torii.z);
    const y = (g ? g.y : 6) + HOVER;
    if (this.ryuArt) {
      this.ryu = new Ryuuseki(this.ryuArt, torii.x, y, torii.z);
      this.scene.add(this.ryu.group);
    }
    this._updateBallHud();
    this.sfx('ryuroar');
    const focus = new THREE.Vector3(torii.x, g ? g.y : 6, torii.z);
    /* The scene is a bonus, not the mechanism. If the voices never loaded the
       dragon is still there and still rideable — a missing mp3 must not be the
       difference between a summoned dragon and none. */
    this.summonScene.start('found', focus);
  }

  /** Walking up to him the first time. The sky is already on its way down. */
  _checkSummonScene() {
    if (!this.ryu || this.summonScene.played.summon) return;
    for (const p of this.players) {
      if (this.ryu.position.distanceTo(p.position) < 46) {
        /* Framed off his own quad — see SummonScene.start. 0.85 rather than
           the obvious 0.5, because he is a WORM: the drawn creature is only
           about a third of the cell tall but nearly all of it wide, so a
           radius taken from his height puts the camera close enough to crop
           the head off, and the head is the whole shot. */
        this.summonScene.start('summon', this.ryu.position.clone(), this.ryu.quad * 0.85);
        return;
      }
    }
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
    for (const p of this.players) {
      if (p.pandaMount) { p.pandaMount.rider = null; p.pandaMount = null; }
      if (p.mount) {
        if (p.mount === this.ryu) this.ryu.pilot = null;
        else { p.mount.rider = null; p.mount.returnHome(); }
        p.mount = null;
      }
      if (p.rideAlong) { this.ryu.gunner = null; p.rideAlong = null; }
    }

    const L = this.world.arenaLanding;
    this._ride('out', new THREE.Vector3(L.x, L.y, L.z));
  }

  /** The tournament is over. Fly them home. */
  leaveArena() {
    if (this.travel) return;
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
  quitMatch() {
    if (!this.inMatch || this.travel) return;
    this.setPaused(false);
    document.getElementById('panel-league')?.classList.add('hidden');
    document.getElementById('panel-teams')?.classList.add('hidden');
    this.leaguePicking = false;
    this.teamPicking = false;
    this.teamPick = null;
    this._goHome();
    this.toast('Match called off — the griffin is taking you back to town', 0);
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
    for (const [i, p] of this.players.entries()) {
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
      by.dmgDealt += dealt;
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
   * Which league are we fighting? Shown only when the party can run more
   * than one.
   *
   * IT GOES THROUGH `MenuNav` LIKE EVERY OTHER MENU, so a stick moves the
   * highlight and any player may choose — the same rule the pause menu follows,
   * and for the same reason: there is one screen and one cursor, and making
   * player 1 the only one who can pick the league locks three other kids out of
   * the decision about what they are all about to play.
   */
  _openLeaguePicker(leagues) {
    const panel = document.getElementById('panel-league');
    const list = document.getElementById('league-list');
    if (!panel || !list) { this.tournament.begin(leagues[0]?.id); return; }
    list.textContent = '';
    leagues.forEach((m, i) => {
      const b = document.createElement('button');
      b.className = `menu-btn${i === 0 ? ' primary' : ''}`;
      b.innerHTML = `${m.name}<span class="lg-blurb">${m.blurb}</span>`;
      b.addEventListener('click', () => {
        panel.classList.add('hidden');
        this.leaguePicking = false;
        this._afterLeague(m);
      });
      list.appendChild(b);
    });
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
    this._paintTeamPicker();
  }

  _paintTeamPicker() {
    const T = this.teamPick;
    if (!T) return;
    const body = document.getElementById('tp-body');
    const help = document.getElementById('tp-help');
    document.getElementById('tp-title').textContent = `${T.mode.name} — PICK YOUR SIDE`;
    const ok = this.tournament._validSeats(T.seats, this.players.length, T.mode);

    const cat = (p) => `
      <div class="tp-cat" style="--me:${styleCss(this.roster[p.index])}">
        <span class="tp-pip"></span><span class="tp-name">${escapeHtml(p.name)}</span>
        <span class="tp-keys">◀ ▶</span>
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
      ? 'Push your own stick LEFT and RIGHT to change sides · JUMP to fight'
      : waiting.length
        ? `Everybody has to pick — push your own stick LEFT or RIGHT (${waiting.length} still to choose)`
        : `${T.mode.name} needs ${this._shapeWords(T.mode)} — move somebody across`;
    help.classList.toggle('tp-bad', !ok);
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

    if (!this.tournament._validSeats(T.seats, this.players.length, T.mode)) return;
    if (!this.players.some((_, i) => (
      T.jumpArmed[i] && this.input.players[i]?.pressed('jump')
    ))) return;
    document.getElementById('panel-teams')?.classList.add('hidden');
    this.teamPicking = false;
    const { mode, seats } = T;
    this.teamPick = null;
    this.tournament.begin(mode.id, seats);
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
  }

  /** What should be playing right now, or null for "leave it alone". */
  _wantedTrack(dt = 0) {
    if (!this.players?.length) return null;
    if (this.ryu?.ridden
      && this.players.some((p) => p.mount === this.ryu || p.rideAlong === this.ryu)) {
      return 'ryu';
    }
    if (this.players.some((p) => p.mount)) return 'flight';
    return this._islandTrack(dt);
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
  toast(text, playerIndex = 0) {
    const wrap = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = `toast p${playerIndex}`;
    el.textContent = text;
    wrap.appendChild(el);
    const hold = Math.min(
      TOAST_MAX,
      Math.max(TOAST_MIN, TOAST_BASE + String(text).length * TOAST_PER_CHAR)
    );
    setTimeout(() => el.classList.add('fade'), hold);
    setTimeout(() => el.remove(), hold + TOAST_FADE);
    /* THE STACK CAP STAYS AT FOUR even though toasts now live longer. It is
       about how much of the picture a pile of them may cover, which has not
       changed; dropping the OLDEST is right for the same reason it always was. */
    while (wrap.children.length > 4) wrap.firstChild.remove();
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

  onMischief(player, prop, breath = null) {
    const done = this.world.props.filter((p) => p.scored).length;
    document.getElementById('mtotal').textContent = `${done} / ${this.world.mischiefTotal}`;
    /* 100%. QUEUED, NOT STARTED HERE — this runs from inside a prop being hit,
       which can perfectly well happen while a shrine introduction or the
       summon scene already owns the screen. `SummonScene.start` refuses when
       one is running, and refusing here would lose the ending outright: there
       are no props left to hit, so nothing would ever ask again. The loop
       picks it up on the first frame the screen is free. */
    /* THE REAL 100% OWNS ITS ENDING, AND A DEBUG PREVIEW MUST NOT EAT IT.
       The queue guard used to be `!played.finale` — the scene's own once-latch
       — which is right for "don't fire twice" and wrong for who set it. The
       scene viewer sets it every time somebody previews the ending, so
       previewing it once meant the girls could knock over all 216 props and be
       shown nothing at all: the flag said the ending had happened, and from
       here that is indistinguishable from it having happened for real.

       `_endingShown` is the honest guard — it is about THIS 100%, and nothing
       but a restart clears it — and the latch is cleared on the way past so
       `start` cannot refuse. Everything ELSE already survived this (the
       Awakening fires below, not with the scene), which is exactly why it went
       unnoticed: the world unlocked correctly and only the ending was missing. */
    if (done >= this.world.mischiefTotal && !this._endingShown) {
      this._endingShown = true;
      if (this.summonScene) this.summonScene.played.finale = false;
      this._finaleDue = true;
    }
    /* THE AWAKENING FIRES HERE, NOT WITH THE SCENE. `_finaleDue` is queued
       because a cutscene cannot start over another one; this cannot wait for
       the same reason it cannot be queued — the finale is 63 seconds and can
       be skipped on its first frame, so hanging the world's biggest state
       change off the end of it hands a kid who presses Start no orbs at all.
       `awaken()` is idempotent, so the guard is belt and braces. */
    if (done >= this.world.mischiefTotal && !this.kotodama.awakened) {
      this._announceAwakening(this.kotodama.awaken());
    }
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
      if (player.raisedPanda && left > 0 && left % 5 === 0) {
        // Only every fifth cane: a countdown that fires on every swing buries
        // everything else in the toast stack.
        this.toast(`${left} more bamboo for ${player.pandaName}…`, player.index);
        return;
      }
      this.toast(`${player.name} cut a bamboo cane clean through!  +${pts}`, player.index);
      return;
    }
    const verbs = ['knocked over', 'scattered', 'pounced on', 'sent flying'];
    const verb = breath === 'a panda claw' ? `clawed a ${prop.kind} to bits`
      : breath ? `hit a ${prop.kind} with ${breath}`
        : `${verbs[done % verbs.length]} a ${prop.kind}`;
    this.toast(`${player.name} ${verb}!  +${pts}`, player.index);
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
        ...this.renderer.getSize(new THREE.Vector2()).toArray());
      return;
    }

    /* --- the dragon-hunt scenes own the screen the same way --- */
    if (this.summonScene?.active) {
      if (this._skipPressed()) {
        this.summonScene.skip();
      }
      this.summonScene.update(dt);
      this.summonScene.updateSky(dt);
      this.world.update(dt, this.players[0].position);
      for (const d of this.dragons) d.update(dt, this.world, []);
      this.ryu?.update(dt, this.world);
      for (const s of this.world.shrines) s.update(dt, []);
      for (const L of this.leaders) L.update(dt, []);
      this._renderView(this.summonScene.camera, 0, 0,
        ...this.renderer.getSize(new THREE.Vector2()).toArray());
      return;
    }

    /* --- a shrine scene owns the screen the same way ---
       Same furniture, same rule about the world underneath: she is really
       standing on that dais with her own beam behind her, and freezing it
       would turn a place into a slideshow. The kittens are NOT ticked, which
       is the one difference from a paused game — a stick still pushed when the
       scene opened must not walk somebody off the island while nobody is
       looking at her. */
    if (this.shrineScene?.active) {
      if (this._skipPressed()) {
        this.shrineScene.skip();
      }
      this.shrineScene.update(dt);
      this.world.update(dt, this.players[0].position);
      for (const d of this.dragons) d.update(dt, this.world, []);
      for (const s of this.world.shrines) s.update(dt, this.players);
      for (const L of this.leaders) L.update(dt, []);
      this._renderView(this.shrineScene.camera, 0, 0,
        ...this.renderer.getSize(new THREE.Vector2()).toArray());
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
      this._renderView(this.griffin.camera, 0, 0,
        ...this.renderer.getSize(new THREE.Vector2()).toArray());
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

    /* The ending, cashed in on the first frame nothing else owns the screen.
       See onMischief for why it is queued rather than fired there.

       THE FLAG IS CLEARED ON SUCCESS, NOT BEFORE THE ATTEMPT — the shape
       `arenaquest` already uses at its own `satanOpen` call ("the scene was
       refused; try again next frame rather than losing the stage change").
       With the queue above clearing `played.finale`, a refusal is currently
       unreachable; this is the ordering being right rather than a bug being
       fixed, and the `played` branch is what stops a future refusal turning
       into a retry every frame forever. */
    if (this._finaleDue && !this._sceneActive()) {
      const B = this._worldBounds();
      if (this.summonScene.start('finale', B.centre, B.radius, this.leaderArt.elder)) {
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
      const pad = (frozen || picking || this.leaguePicking || this.teamPicking
        || this.menagerie?.eating(i) || this.inspector?.busy(i))
        ? DEAD_PAD : this.input.players[i];
      this.players[i].update(dt, pad, this.world, this.dragons, this);
    }

    // Orbs, pickups, dragons, dojo.
    for (const p of this.players) {
      for (const o of p.orbs ?? []) o.update(dt, p.position);
      for (const o of p.wornOrbs ?? []) o.update(dt, p.position);
    }
    this.kotodama.update(dt);
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
    for (const p of this.players) p.panda?.update(dt, this.world, p);
    this.dojo.update(dt, this.players);
    for (const s of this.world.shrines) s.update(dt, this.players);
    for (const L of this.leaders) L.update(dt, this.players);
    /* Loitering at an unmet shrine starts her introduction. Checked after the
       players have moved, so the dwell is measured against where they actually
       ended the frame. */
    this.shrineScene?.watch(dt, this.leaders, this.players);
    this._updateBalls(dt);
    /* After the players have moved and after the mounts are resolved, so the
       track is decided from where everybody actually IS this frame. */
    this._updateMusic(dt);
    /* Ryuuseki is carried by his PILOT, so he ticks after the players for the
       same reason the pandas do: a ridden animal is slaved to where its rider
       actually ended the frame, not to where she started it. */
    if (this.ryu) {
      if (this.ryu.pilot) this.ryu.carry(this.ryu.pilot);
      this.ryu.update(dt, this.world);
      this._checkSummonScene();
    }
    this.summonScene.updateSky(dt);
    this._updateSeek(dt);
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
    this._updateBooms(dt);
    this._updateShake(dt);
    /* One flag, set where the fact becomes true. `ArenaQuest` needs to know
       Ryuuseki has been RIDDEN, not merely summoned, and there are two seats
       and four ways into them — asking here, every frame, is cheaper than
       finding all four. */
    if (this.ryu?.ridden) this.quest.rodeRyu = true;

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
      if (near) {
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

    const mid = this._centroid();
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
   * IT WAITS FOR REAL INPUT, NOT FOR CONNECTION. A pad charging on the side, or
   * one left on the sofa, has sent nothing and seats nobody — see
   * `InputManager.sparePad`. Picking it up is the gesture, and the character
   * picker still runs, so nothing is decided for her.
   *
   * ONCE PER DEVICE, LATCHED HERE. `hasSentInput` never goes back to false, so
   * without the latch a player who drops out would be re-seated on the next
   * frame by the controller still in her hands and could never leave. Dropping
   * out is a decision; the latch is what makes it stick.
   */
  _autoSeat() {
    if (this._sceneActive() || this.tournament?.fighting) return;
    /* ONE AT A TIME. `this.picking` is a single card, so seating a second
       player while the first is still choosing her cat would overwrite it and
       leave a kitten nobody picked. Three spare controllers queue up instead:
       each card appears as the one before it is confirmed. */
    if (this.picking) return;
    if (this.partySize >= MAX_PLAYERS || this.partySize >= this.input.seatable) return;
    this._autoSeated ??= new Set();
    const device = this.input.sparePad(this._autoSeated);
    if (!device) return;
    this._autoSeated.add(deviceId(device));
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
    const mid = this._centroid();
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
      p.score = this._debugPurse;
      this.onScoreChanged(p);
    }
    this.picking = { index, style: this.roster[index] };
    this.sfx('orb');
    return p;
  }

  /**
   * A player drops out. The game must not notice beyond her being gone.
   *
   * HER ORBS GO BACK INTO THE WORLD rather than vanishing with her, which is
   * the dealer's own rule — a sold orb goes back on the shelf so the two of
   * them cannot destroy the world's supply between them. Only twenty-six exist;
   * a kitten leaving with eight of them would delete a third of the endgame for
   * everybody still playing.
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

    /* SCATTERED, NOT STACKED. Every orb went to `p.position` and
       `findOpenSpot` is deterministic, so a kitten leaving with eight of them
       dropped eight pickups into one point — one orb's worth of geometry on
       screen, z-fighting with itself, and a pile you cannot tell the size of.
       They are her whole neck's worth going back into a world where only
       twenty-six exist; they have to look like eight things. */
    (p.powerOrbs ?? []).forEach((id, i) => this._dropOrbInWorld(id, p.position, i));
    if (p.mount) { p.mount.returnHome?.(); p.mount = null; }
    if (p.rideAlong) p.rideAlong = null;
    if (p.panda) p.panda.follows = false;
    if (this.ryu?.pilot === p) this.ryu.pilot = null;
    if (this.ryu?.gunner === p) this.ryu.gunner = null;
    /* TWO CONSTELLATIONS ORBIT A KITTEN AND ONLY ONE WAS BEING TAKEN DOWN.
       `orbs` is the PLAIN Kotodama she has collected; `wornOrbs` is the power
       orbs she is wearing — the ones the line above has just thrown on the
       floor. This removed the first and not the second, so the moment anybody
       with a power orb dropped out, her worn shells stayed in the scene for
       the rest of the game, frozen at wherever they last were: the thing that
       moves them walks `this.players`, and she is about to be spliced out of
       that. Up to eight icosahedrons parked in the town square, on top of the
       pickups they had just become. Reported as "the rotating visual orbs stay
       on screen and are buggy".

       THE `?? []` IS WHY NOBODY SAW IT. Both fields are optional on purpose —
       a kitten who has never picked anything up has neither — so a name that
       is simply absent reads exactly like a kitten with nothing to remove.

       EMPTIED AS WELL AS REMOVED. `p` outlives this function; it is captured
       by the toast below and by anything else still holding her. A list of
       orbs that are no longer in any scene is a trap for whoever adds the next
       thing that walks one. */
    for (const o of p.orbs ?? []) this.scene.remove(o.group);
    for (const o of p.wornOrbs ?? []) this.scene.remove(o.group);
    p.orbs = [];
    p.wornOrbs = [];
    this.scene.remove(p.group);

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
   */
  _buildLeaveButtons() {
    const wrap = document.getElementById('leave-buttons');
    const note = document.getElementById('join-note');
    if (!wrap) return;
    wrap.textContent = '';
    if (this.partySize > 1) {
      for (let i = 1; i < this.partySize; i++) {
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
            body: `${this.players[i].name}'s kitten goes away and `
              + (this.partySize > 2
                ? 'the screen splits between the ones who are left. '
                : 'you carry on by yourself. ')
              + 'Her points and her orbs go with her.',
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

  /** Re-price and re-stock the dealer for the party as it is now. One call, so
   *  joining and leaving cannot each grow their own copy of the rule. */
  _updateEconomyForParty() {
    this.kotodama?.forParty(this.partySize);
  }

  /** An orb belonging to a player who has left, put back where she was. */
  _dropOrbInWorld(id, at, spread = 0) {
    this.kotodama?.dropInWorld(id, at, spread);
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

    /* AT MOST TWO MAPS, AND WHICH PANES GET THEM IS DECIDED EVERY FRAME.
       One map per kitten is the obvious rule and it is the wrong one at four.
       A quadrant is a quarter of the screen; a map sized to stay legible eats a
       real fraction of it, and four of them means four corners of the game
       covered up at exactly the moment there is most to look at. It also stops
       being a map and starts being furniture: nobody reads four.

       THEY USED TO BE PANE 0 AND PANE 1 AND NOW THEY GO WHERE THEY ARE WORTH
       MOST — see `_mapPanes`. The old rule was "the maps belong to Ember and
       Frost", chosen so that a map never moves house when a sister joins, and
       it had one bad case that four-player play walks into constantly: two
       kittens exploring together on the far side of the archipelago, in a pane
       of their own, with no map between them, while a map sat in a pane
       holding one girl standing in the market. A pane with two kittens in it
       needs the map MORE, not less.

       Everybody is drawn ON both maps regardless; what is capped is how many
       copies of the archipelago are on screen, not who appears on them. The
       badges above are still one per player: a score badge is a line of text,
       four of them fit, and a kid with no badge has no way to know what she
       has scored. */
    const nMaps = Math.min(n, 2);
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
   * WHICH PANES THE TWO MAPS ARE IN, this frame.
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
    return nearestMap(panes, owner, pane);
  }

  /**
   * Up to two maps, each positioned ON THE SEAM OF THE PANE THAT OWNS IT.
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

    for (let i = 0; i < this.maps.length; i++) {
      const box = document.getElementById(`map-box-${i}`);
      const tag = document.getElementById(`map-tag-${i}`);
      if (!box) continue;
      const pane = owner[i] ?? -1;
      const shown = pane >= 0 && !!panes[pane] && !!groups[pane]?.length;
      box.classList.toggle('hidden', !shown);
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
        touch: this.device.touchPrimary,
        merged: this.merged,
        mathUp,
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
        const spot = mapSpot({ v, W, H, size, pad: 14, hint: HINT_CLEAR });
        box.style.right = 'auto';
        box.style.bottom = 'auto';
        box.style.left = `${spot.left}px`;
        box.style.top = `${spot.top}px`;
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
      this.maps[i].draw(this.players, this.dragons, this.kotodama, this.satan);
    }

    this._drawMathBoard(panes, groups, W, H, mathUp);
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
    if (!mathUp || this.merged || panes.length < 2) { toSheet(); return; }

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
       claims — the scoreboard is centred — and it is what was asked for. */
    const shared = (groups[best]?.length ?? 0) > 1;
    let w = shared
      ? Math.max(1, Math.min(540, v.w - 28))
      : Math.min(540, Math.round(v.w * 0.42));
    st.width = `${w}px`;
    let h = el.getBoundingClientRect().height || Math.round(w * 0.78);
    const spot = mapSpot({ v, W, H, w, h, pad: 14, hint: HINT_CLEAR, inner: false, top: shared });
    /* HOW FAR DOWN THE SCOREBOARD REACHES IS MEASURED, NOT ASSUMED, and only
       asked when the two would actually meet across the screen. It is a
       centred row of badges whose count and whose NAMES change with the party,
       so its width is not something this file can know — and the ask was "as
       close to the corner as we can", which means the drop has to be nothing
       at all when the corner is free. Degrades to the bare corner if the
       scoreboard is missing, which is the pause menu's own case. */
    let top = spot.top;
    if (shared) {
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
         IT RESERVES THE SPACE WHETHER OR NOT THIS PANE HAS A MAP. At four
         players there are two maps and up to four panes, so some panes have
         none — and the cost of reserving anyway is a slightly narrower board
         on a window short enough to be shrinking it already, against a
         collision if `_mapPanes` moves a map in here on a later frame. */
      const mapAt = mapSpot({
        v,
        W,
        H,
        size: mapWidth({
          paneW: v.w, paneH: v.h, screenH: H, touch: this.device.touchPrimary,
          merged: false, mathUp: true,
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
        w = Math.max(180, Math.round(w * (room / h)));
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
    for (const o of player.wornOrbs ?? []) this.scene.remove(o.group);
    player.wornOrbs = buildWornOrbs(player.powerOrbs);
    player.wornOrbs.forEach((o, i) => {
      // Only the lead orb prints the numbers — see PowerOrb._buildRain.
      o.setMathVisible(this.mathVisible && i === 0);
      this.scene.add(o.group);
    });
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
    for (const { player, spec } of result.prizes) {
      this.toast(
        `${player.name} is given ${spec.name} ${spec.kanji} — ${spec.blurb}`, player.index
      );
    }
    this.toast('Powerup Kotodama are scattered across the islands', 0);
    this.toast('A dealer has opened a stall in the market', 1);
  }

  _giveOrb(player) {
    player.orbs = player.orbs ?? [];
    const n = player.orbs.length;
    const orb = new Orb({
      radius: 3.2 + n * 0.9,
      speed: 1.15 - n * 0.18,
      phase: (n * Math.PI * 2) / 3,
      color: player.index === 0 ? 0x7fe3ff : 0xffa8dc,
      height: 1.7 + n * 0.5,
    });
    orb.setMathVisible(this.mathVisible && n === 0);
    this.scene.add(orb.group);
    player.orbs.push(orb);
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

    if (onRyu || inRing || this.settings.split === 'never' || allInDojo) {
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
        (p) => !!(p.mount || p.rideAlong || this.inspector?.busy(p.index))
      ),
      prev: this._clusterOf,
      mergeIn: MERGE_IN,
      mergeOut: MERGE_OUT,
    });
    this._clusterOf = of;
    return groups;
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

  _updateSplit(dt) {
    /* WHO IS SHARING A VIEW WITH WHOM. With two kittens this is exactly the
       boolean it replaced — one group or two — and nothing about the game the
       girls know changes. With three or four it is the feature: a pair standing
       together get a pane between them and the kitten two islands away gets one
       of her own, instead of the screen being all-or-nothing for everybody. */
    this.groups = this._clusters();
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
      const shot = this.starShot;
      if (shot && !ryuMid && members.includes(shot.player.index)) {
        const k = Math.sin(Math.min(1, (STAR_POSE - shot.t) / 0.3) * Math.PI * 0.5)
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
      rig.target.lerp(want, Math.min(1, dt * 6));
      rig.dist += (wantDist - rig.dist) * Math.min(1, dt * 4);

      let yaw = THREE.MathUtils.lerp(-Math.PI * 0.25, 0, ft);
      let pitch = ring ? ring.pitch : THREE.MathUtils.lerp(0.66, DOJO_PITCH, ft);

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
  _aimXray(camera) {
    this._aimArenaXray(camera);
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
    if (!mesh?.visible) return;
    const seen = [];
    if (this.satan?.group.visible) {
      seen.push(new THREE.Vector3(
        this.satan.position.x, this.satan.position.y + 2.2, this.satan.position.z,
      ));
    }
    const R = this.world.arenaRing;
    for (const p of this.players) {
      if (seen.length >= 4) break;
      /* GENEROUS, AND MEASURED ON THE SAME SQUARE THE RING IS. `arenaOutBy`
         is negative inside the deck and grows as she leaves it; +40 reaches
         the stands and the announcer's box behind them, which is where the
         two things this exists for actually are. A kitten who has fallen off
         the island entirely is past it and stops carving. */
      if (R && this.world.arenaOutBy(p.position.x, p.position.z) > 40) continue;
      seen.push(new THREE.Vector3(p.position.x, p.position.y + 1.4, p.position.z));
    }
    mesh.material.setCuts?.(camera.position, seen);
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
  _syncSatanSolid() {
    const s = this.satanSolid;
    if (!s) return;
    /* HIS DRAWING IS THE AUTHORITY. Everything else that asks whether he is
       really here asks the same question — the blast's arming test, the x-ray,
       debug `2` — and a second opinion kept somewhere else is a second thing
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
    this.cutscene?.faceCamera(camera);
    for (const s of this.world.shrines) s.faceCamera(camera);
    for (const pk of this.pickups) if (!pk.taken) pk.faceCamera(camera);
    for (const b of this.balls ?? []) b.faceCamera(camera);
    this.menagerie?.faceCamera(camera);
    this.ryu?.faceCamera(camera);
    this.satan?.faceCamera(camera);
    this.griffin?.faceCamera(camera);
    this.dojo.faceCamera(camera);
  }

  _renderView(camera, x, y, w, h) {
    if (w < 2 || h < 2) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    this._faceAll(camera);
    this._aimXray(camera);
    this.renderer.setViewport(x, y, w, h);
    this.renderer.setScissor(x, y, w, h);
    this.renderer.setScissorTest(true);
    this.renderer.render(this.scene, camera);
  }

  _render() {
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
      if (cam) this._renderView(cam, v.x, v.y, v.w, v.h);
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
    return stablePanes(panes, groups, this._paneSeats, W, H);
  }

  /** Slow drifting fly-over behind the title screen. */
  _renderTitleIdle(dt) {
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
    this._renderView(cam, 0, 0, size.x, size.y);
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
