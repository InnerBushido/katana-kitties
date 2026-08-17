import * as THREE from 'three';
import './style.css';

import {
  InputManager, HALVES, MAP_FIELDS, VJOY_AXIS_NAMES, deviceId,
} from './core/input.js';
import { Audio, trackForIsland } from './core/audio.js';
import { loadSpriteAtlas, recolourAtlas } from './core/spritesheet.js';
import { placeholderCatAtlas, placeholderDragonTexture, placeholderPandaTexture } from './core/gfx.js';
import { detect as detectDevice } from './core/device.js';
import { World } from './world/world.js';
import { Player, ATTACKS, MAX_HP, KO_TIME } from './entities/player.js';
import { PLAYER_STYLE, MAX_PLAYERS, styleFor, styleCss } from './core/palette.js';
import { splitLayout } from './core/split.js';
import { clusterPlayers, MERGE_IN, MERGE_OUT } from './core/cluster.js';
import { Dragon, BREEDS } from './entities/dragon.js';
import { Panda, tierFor, toNextTier } from './entities/panda.js';
import { ClanLeader, LEADERS } from './entities/leader.js';
import { Orb, OrbPickup } from './entities/orb.js';
import { MathDojo } from './systems/mathdojo.js';
import { Minimap } from './systems/minimap.js';
import { MenuNav } from './systems/menunav.js';
import { Cutscene } from './systems/cutscene.js';
import { ShrineScene } from './systems/shrinescene.js';
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
import { loadBoard, BOARD_MODES } from './systems/leaderboard.js';
import { Kotodama, buildWornOrbs } from './systems/kotodama.js';
import { ProfileScreen } from './systems/profile.js';

/* ---------------------------------------------------------------------------
   Katana Kitties — main loop.

   Two players, two cameras, one scene. The split is dynamic: run apart and
   the screen splits; come back together and it joins into a single shared
   view. Everything billboarded has to be re-oriented per camera, which is why
   rendering goes through _renderView rather than a plain renderer.render.
--------------------------------------------------------------------------- */

const QUALITY = {
  high: { pixelRatio: 2, shadows: true, shadowSize: 2048 },
  medium: { pixelRatio: 1.5, shadows: true, shadowSize: 1536 },
  low: { pixelRatio: 1, shadows: false, shadowSize: 1024 },
};

const DOJO_VIEW_R = 52;  // inside this, the camera frames the unit circle
/** How long the found-a-star pose runs. Matches Player.holdAloft's default. */
const STAR_POSE = 2.0;
/** Seconds on an island before its theme takes over. See Game._islandTrack. */
const ISLAND_DWELL = 1.1;

/* THE ONLY KEYS THAT SKIP A STORY SCENE. On a pad it is `start` and nothing
   else (Game._skipPressed). Both are buttons you press to mean "get me out of
   this"; every other control is one a kid is already holding while she
   watches, which is how a 79-second intro with seven recorded voices was being
   thrown away by a thumb resting on jump. */
const SKIP_KEYS = new Set(['Space', 'Enter', 'NumpadEnter']);

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

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    /* WHAT THIS MACHINE MAY SPEND, decided once and read by the renderer, the
       art loader and the quality setting. `antialias` is a CONSTRUCTOR option
       and cannot be changed afterwards, which is why this is the first line of
       the constructor rather than part of `_applyQuality`. See core/device.js
       for why the art budget moves `maxAtlas` and never `cell`. */
    this.device = detectDevice();
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

    this.scene = new THREE.Scene();
    this.input = new InputManager();
    this.audio = new Audio();
    this.clock = new THREE.Clock();

    this.state = 'loading';
    this.paused = false;
    this.merged = true;
    /* The defaults come from the device, not from a literal, so a phone opens
       on the low tier and unsplit without a kid having to find Settings. Every
       one of them is still a setting she can change. On a desktop `profileFor`
       returns exactly the values that were hard-coded here. */
    this.settings = {
      split: this.device.defaultSplit,
      dir: 'vertical',
      quality: this.device.defaultQuality,
    };
    this.mathVisible = true;

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

    this._bindUI();
    window.addEventListener('resize', () => this._resize());
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
    this.dojo = new MathDojo(this.scene, this.world.dojoCentre);
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
    const [satanArt, griffinArt] = await Promise.all([
      loadSpriteAtlas('/sprites/leader_satan.png',
        { views: 1, rows: 1, clearPockets: true, maxAtlas: this.device.atlasMax })
        .catch(() => null),
      loadSpriteAtlas('/sprites/griffin.png',
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
      sat_win1: '/voice/sat_win1.mp3',
      sat_win2: '/voice/sat_win2.mp3',
    });

    if (satanArt) {
      const sg = this.world.heightAt(SATAN_TOWN.x, SATAN_TOWN.z);
      const spot = this.world.findOpenSpot(SATAN_TOWN.x, SATAN_TOWN.z, 4)
        ?? { x: SATAN_TOWN.x, z: SATAN_TOWN.z };
      const g2 = this.world.heightAt(spot.x, spot.z) ?? sg;
      this.satan = new MrSatan(satanArt, { x: spot.x, y: g2 ? g2.y : 4, z: spot.z });
      this.satan.art = satanArt;
      /* Remembered, because he MOVES: he stands in the town to invite them
         and in his box at the arena to call the rounds, and `reset` has to be
         able to put him back without recomputing a spot that depends on a
         world search. */
      this.satan.homeAt = { x: spot.x, y: g2 ? g2.y : 4, z: spot.z };
      this.satan.group.visible = false;
      this.scene.add(this.satan.group);
      // He is solid, like a clan leader — you cannot stand inside him.
      this.world.solids.push({ x: spot.x, z: spot.z, r: 0.95 });
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
    /* The Powerup Kotodama, and the screen the girls swap them on. Both are
       built at boot and inert until 100% mischief — `Kotodama.awakened` is the
       one flag that says whether any of it exists, and the update loop, the
       minimap and the stall prompt all read that rather than each keeping
       their own idea of whether the endgame has started. */
    this.kotodama = new Kotodama(this);
    this.profile = new ProfileScreen(this);
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
    const g = this.world.heightAt(style.startX, 34);

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
      spawn: new THREE.Vector3(style.startX, (g ? g.y : 8) + 0.1, 34),
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

  _bindUI() {
    const show = (id) => document.getElementById(id).classList.remove('hidden');
    const hide = (id) => document.getElementById(id).classList.add('hidden');

    document.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const a = btn.dataset.action;
        if (a === 'play') this.startPlay();
        if (a === 'help') show('panel-help');
        if (a === 'settings') { this._refreshPads(); show('panel-settings'); }
        if (a === 'board') { this._paintBoard(); show('panel-board'); }
        if (a === 'profile') this.profile.open('profile', { fromPause: true });
        if (a === 'resume') this.setPaused(false);
        if (a === 'restart') this.restart();
        if (a === 'quit-match') this.quitMatch();
        if (a === 'story') this.replayIntro();
        if (a === 'title') this.toTitle();
      });
    });
    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.input.cancelCapture();
        hide('panel-help');
        hide('panel-settings');
        hide('panel-board');
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
    bind('set-quality', 'quality', () => this._applyQuality());

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
         something you can only do on purpose. Escape still lands here rather
         than opening the pause menu over the top of a scene. */
      /* The griffin ride skips on the same three keys and the same button as
         every scene does. It is not a scene — no dialogue box, no `played`
         latch — but from a player's side it is the same kind of thing: a
         thing playing at you that you might have seen already. Routing it
         through `SKIP_KEYS` rather than "any key" matters for exactly the
         reason it does everywhere else: both girls are holding sticks. */
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
      /* Z zooms both maps, X only player 2's — so in split screen each kid can
         set their own scale without fighting over one control. Both go through
         _zoomMap, which is also what the pad's `map` action calls. */
      if (e.code === 'KeyZ' && this.state === 'play') this._zoomMap(0);
      if (e.code === 'KeyX' && this.state === 'play' && !this.merged) this._zoomMap(1);
      if (this.state === 'play') this._debugKey(e.code);
      if (e.code === 'Escape') {
        /* The Character Profile is checked before the other sub-panels
           because it can be open WITHOUT the pause menu behind it — it is
           reachable from the world at the dealer's stall — so closing it has
           to hand the game back rather than fall through to a pause toggle. */
        if (this.profile.active) { this.profile.close(); e.preventDefault(); return; }
        // Back out of a sub-panel first, otherwise toggle the pause menu.
        const sub = ['panel-help', 'panel-settings', 'panel-board'];
        const subOpen = sub.some((id) => !document.getElementById(id).classList.contains('hidden'));
        if (subOpen) {
          this.input.cancelCapture();
          hide('panel-help');
          hide('panel-settings');
          hide('panel-board');
          if (this.state === 'title') this.paused = false;
        } else if (this.state === 'play') {
          this.setPaused(!this.paused);
        }
      }
    });
  }

  /**
   * Cycle one player's minimap zoom. Keyboard (Z / X) and the pad's `map`
   * action both land here.
   *
   * Only player 1 owns a map while the view is MERGED — there is one map on
   * screen and every player's control drives it, which is why the merged path
   * copies the zoom onto all the others: they are the maps that take over the
   * moment the party runs apart, and inheriting the zoom means the split does
   * not silently reset it under somebody.
   *
   * PLAYERS 3 AND 4 HAVE NO MAP OF THEIR OWN, and pressing the button has to
   * SAY so. There are two maps at most now (see `_buildHud`), so the third
   * kitten's bumper indexes past the end of the array — and a button that
   * silently does nothing is indistinguishable from a broken one, which is the
   * same rule the shrine join prompt and the star locks already follow. She is
   * told once, on her own toast, and told what to look at instead: everybody is
   * drawn on both maps, so the information is on screen, it is just not in her
   * corner.
   */
  _zoomMap(index) {
    if (this.state !== 'play') return;
    const target = this.merged ? this.maps[0] : this.maps[index];
    if (!target) {
      this.toast('The map follows Ember and Frost — you\'re on it too', index);
      return;
    }
    const z = target.cycleZoom();
    if (this.merged) for (const m of this.maps) m.zoom = z;
    this.audio.play('menu');
    this.toast(`Map zoom ${z === 1 ? 'whole world' : `${z}x`}`, index);
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
   */
  _skipPressed() {
    return this.input.players.some((p) => p.pressed('start'));
  }

  /** True while any overlay panel is on screen and should own the input. */
  _overlayOpen() {
    return ['panel-settings', 'panel-help', 'panel-pause', 'panel-board', 'panel-profile'].some(
      (id) => !document.getElementById(id).classList.contains('hidden'),
    );
  }

  /* --------------------------- pause / restart --------------------------- */

  setPaused(on) {
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
    if (!on) {
      document.getElementById('panel-help').classList.add('hidden');
      document.getElementById('panel-settings').classList.add('hidden');
      document.getElementById('panel-board').classList.add('hidden');
      if (this.profile.active) this.profile.close();
      // Drop the frame the pause ate, or everything lurches on resume.
      this.clock.getDelta();
    }
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
      p.marker.material.color.set(p.style.colour);
    }
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
    this.summonScene.played = { found: false, summon: false };
    this.summonScene.clearDusk();
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
  }

  /** Redraws the live controller readout while the settings panel is open. */
  _refreshPads() {
    const el = document.getElementById('pad-list');
    const mapEl = document.getElementById('pad-map');
    if (!el) return;
    const pads = this.input.diagnostics();

    if (!pads.length) {
      el.innerHTML = '<div class="pad-empty">No controllers detected — '
        + 'keyboard is ready to go.<br>Pair one, then <b>press any button on '
        + 'it</b> — browsers hide a gamepad until it sends input.</div>';
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
       asked for, and what this class of machine may spend. The device cap is
       Infinity on a desktop, so this is the same arithmetic it has always been
       there — it only bites on a phone, where a 3.0 panel ratio across four
       viewports is nine times the fragments of a 1.0 buffer. */
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, q.pixelRatio, this.device.maxPixelRatio)
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

  _toggleMath() {
    this.mathVisible = !this.mathVisible;
    for (const p of this.players) {
      for (const o of p.orbs ?? []) o.setMathVisible(this.mathVisible);
      /* Only the LEAD worn orb prints its working. Eight copies of the same
         two figures orbiting one cat is noise, and the reason the plain orb's
         overlay was legible in the first place was that there was one of it. */
      (p.wornOrbs ?? []).forEach((o, i) => o.setMathVisible(this.mathVisible && i === 0));
    }
    this.toast(this.mathVisible ? 'Math overlay ON' : 'Math overlay OFF', 0);
  }

  startPlay() {
    document.getElementById('title').classList.add('hidden');
    document.getElementById('panel-help').classList.add('hidden');
    document.getElementById('panel-settings').classList.add('hidden');
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
    const away = this._sceneActive() || !!this.travel || !!this.tournament?.active;
    document.getElementById('hud')?.classList.toggle('scene-hidden', away);
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
    if (code === 'Digit7') {
      let n = 0;
      for (const b of this.balls) {
        if (b.taken) continue;
        b.take();
        this.ballsHeld++;
        n++;
      }
      this._updateBallHud();
      if (n && this.ballsHeld >= BALL_COUNT && !this.ryu) this._onAllBalls();
      this.toast(`[debug] took ${n} star${n === 1 ? '' : 's'} — Ryuuseki summoned`, 0);
    }

    if (code === 'Digit8') {
      if (!this.ryu) { this.toast('[debug] no dragon yet — press 7', 0); return; }
      const R = this.ryu;
      // Put him somewhere with room, then drop both kittens into their seats.
      for (const p of this.players) {
        if (p.mount === R || p.rideAlong === R) continue;
        p.mount = null;
        p.rideAlong = null;
        p.pandaMount = null;
        const seat = R.freeSeat();
        if (!seat) break;
        p.velocity.set(0, 0, 0);
        if (seat === 'pilot') { R.pilot = p; p.mount = R; p.flySide = 1; }
        else { R.gunner = p; p.rideAlong = R; }
        const o = R.seatOffset(seat);
        p.position.set(R.position.x + o.x, R.position.y + o.y, R.position.z + o.z);
        p.group.position.copy(p.position);
      }
      this.toast('[debug] both kittens aboard — press 9 to fire', 0);
    }

    if (code === 'Digit9') {
      if (!this.ryu?.ridden) { this.toast('[debug] nobody is riding — press 8', 0); return; }
      const shooter = this.ryu.gunner ?? this.ryu.pilot;
      const n = this.ryu.fire(this.world, this, shooter);
      this.toast(`[debug] fired ${n} beam${n === 1 ? '' : 's'}`, shooter.index);
    }

    /* --- the feast, in one key ---
       Same argument as `7` `8` `9` and `6`. The fifteen seconds between rounds
       are behind the whole unlock AND a round somebody has to actually win, and
       they are where the snacks and the angel both live — so the two newest
       things in the game were also the two hardest to look at. `4` ends the
       live round on the spot by knocking player 2 down, which drops straight
       into `_startFeast` through the real path rather than around it. */
    if (code === 'Digit4') {
      if (!this.tournament?.fighting) {
        this.toast('[debug] not in a live round — pick "arena" with -/= and press 0', 0);
        return;
      }
      const [a, b] = this.players;
      b.hurt(b.hp, a.position, ATTACKS.dash, this);
      this.tournament.onHit(a, b, 1, 'dash');
      this.toast('[debug] round ended — feast in a moment', 0);
    }

    /* --- the scene viewer ---
       Every cutscene in the game is gated behind hours of play and fires ONCE
       per session, which makes the last thing anybody writes also the hardest
       thing to look at: the finale needs all 213 props knocked over, and
       checking one word of it meant a fresh run. `0` replays whichever scene
       is selected and `-`/`=` walk the list. */
    /* --- THE WHOLE ENDGAME, IN ONE KEY ---
       Same argument as `7` `8` `9`. Everything this unlocks sits behind 216
       props knocked over — most of an afternoon — so checking one colour on
       one orb, or one word of the ending, or whether a round card is centred,
       meant playing the whole game first. See `_debugEndgame`. */
    if (code === 'Digit6') this._debugEndgame();
    if (code === 'Digit5') {
      /* And the screen they are traded on, which is otherwise behind the
         pause menu and only interesting when both girls have orbs. */
      if (!this.kotodama.awakened) { this.toast('[debug] press 6 first', 0); return; }
      this.profile.open('profile');
    }
    if (code === 'Digit0') this._playScene();
    if (code === 'Minus') this._pickScene(-1);
    if (code === 'Equal') this._pickScene(1);
    if (code === 'Backquote') this._toggleDebugPanel();
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
  get _scenes() {
    return [
      { id: 'intro', label: 'opening story' },
      { id: 'shrine', label: 'a clan leader introduces herself' },
      { id: 'found', label: 'all seven stars found' },
      { id: 'summon', label: 'Ryuuseki arrives' },
      { id: 'finale', label: '100% mischief — the ending' },
      { id: 'satanAnnounce', label: 'Mr. Satan announces the tournament' },
      { id: 'satanOpen', label: 'Mr. Satan opens the arena' },
      /* Not a scene, but it belongs in the same list for the same reason the
         others do: it is gated behind the entire game and fires once, which
         makes it the hardest thing in the feature to look at twice. */
      { id: 'arena', label: 'go to the arena NOW (skips the whole unlock)' },
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
      case 'arena':
        /* THE WHOLE UNLOCK, SKIPPED. Reaching the tournament honestly needs
           seven stars, a ride on Ryuuseki and 80% of a world knocked over —
           which is right for a player and impossible for anybody checking
           whether a round card is centred. It fast-forwards the quest rather
           than calling `enterArena` directly, so what gets tested is the real
           path: the griffin, the landing, `Tournament.begin`, all of it. */
        this.world.openArena(true);
        if (this.satan) this.satan.group.visible = true;
        this.quest.stage = 'open';
        this.quest.rodeRyu = true;
        this.enterArena();
        break;
      default:
        return;
    }
    this.toast(`[debug] playing: ${pick.label}`, 0);
    this._refreshDebugPanel();
  }

  /* ---- the on-screen list, so the keys don't have to be memorised ---- */

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
    el.innerHTML = `
      <b>DEBUG</b> <span class="k">\`</span> closes
      <div class="dbg-row"><span class="k">7</span> take all seven stars &amp; summon Ryuuseki</div>
      <div class="dbg-row"><span class="k">8</span> seat both kittens on him</div>
      <div class="dbg-row"><span class="k">9</span> fire his beams</div>
      <div class="dbg-row"><span class="k">6</span> THE ENDGAME — ending, arena, orbs, purses</div>
      <div class="dbg-row"><span class="k">5</span> open the trade / profile screen</div>
      <div class="dbg-row"><span class="k">4</span> end the live round (feast)</div>
      <div class="dbg-row"><span class="k">M</span> maths overlay &nbsp; <span class="k">Z</span>/<span class="k">X</span> map zoom</div>
      <div class="dbg-sep">SCENE VIEWER — <span class="k">-</span>/<span class="k">=</span> choose, <span class="k">0</span> play</div>
      ${this._scenes.map((s, i) => `
        <div class="dbg-row${i === ix ? ' on' : ''}">${i === ix ? '&#9656;' : '&nbsp;'} ${s.label}</div>`).join('')}`;
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
    const clanK = reach / 3.4;
    const range = A.reach * clanK;
    /* Sanzan stacks make each of the three cuts hit harder rather than adding
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
      if (dist > range || Math.abs(dy) > 4.5) continue;
      // Same forward-arc test the props get, widened for the dash so a charge
      // that visibly connects is not refused on a half-degree of facing.
      const dot = (dx * dir.x + dz * dir.y) / (dist || 1);
      if (dot < A.arc) continue;

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
   */
  strikeCritters(attacker, reach) {
    if (!this.tournament?.active) return;
    this.menagerie?.strike(attacker, reach);
  }

  _updateBallHud() {
    const el = document.getElementById('balls');
    if (!el) return;
    el.classList.toggle('hidden', this.ballsHeld === 0 && !this.ryu);
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
        <span class="tp-pip"></span>${escapeHtml(p.name)}
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

  toast(text, playerIndex = 0) {
    const wrap = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = `toast p${playerIndex}`;
    el.textContent = text;
    wrap.appendChild(el);
    setTimeout(() => el.classList.add('fade'), 1700);
    setTimeout(() => el.remove(), 2200);
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

  _tick() {
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.input.update();

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
      this.world.setDusk(this.summonScene.updateDusk(dt));
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
          && this.kotodama.canShop(p)
      );
      if (shopper) {
        this.profile.open('shop', { shopper });
        this._render();
        return;
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
    if (this.input.players.some((p) => p.source === 'gamepad' && p.pressed('start'))) {
      this.setPaused(!this.paused);
    }

    /* The two controls that used to exist only on the keyboard. Each kitten
       zooms HER OWN map — the whole reason there are two of them in split
       screen — while the maths overlay is one global thing on screen, so
       either pad toggles it. Read before the pause check so they are inert
       behind the menu, like every other in-world control. */
    if (!this.paused) {
      this.input.players.forEach((p, i) => {
        if (p.pressed('map')) this._zoomMap(i);
        if (p.pressed('math')) this._toggleMath();
      });
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
    const join = this.input.pendingJoin();
    if (join && !this._sceneActive() && !this.tournament?.fighting) this._joinPlayer(join);
    else this._autoSeat();
    this._updatePicker();
    /* The team picker reads the raw pads too, for the same reason the character
       picker does: everybody's stick is dead while it is up (see the dead-pad
       line below), so a screen that asked the seated player state would be
       reading four sticks it has just switched off. */
    if (this.teamPicking) this._updateTeamPicker();

    const frozen = this.tournament?.frozen;
    for (let i = 0; i < this.players.length; i++) {
      /* The picker hands HER a dead pad and nobody else one — the stick that
         is choosing a cat must not also walk her off a rim, and the other
         three are still playing. */
      const picking = this.picking?.index === i;
      const pad = (frozen || picking || this.leaguePicking || this.teamPicking
        || this.menagerie?.eating(i))
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
    this.world.setDusk(this.summonScene.updateDusk(dt));
    this._updateSeek(dt);

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
    this.announcer?.update(dt);
    this._updateSparks(dt);
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
      const near = Math.hypot(p.position.x - dc.x, p.position.z - dc.z) < DOJO_VIEW_R;
      anyInDojo = anyInDojo || near;
      /* The dojo wins if somehow both apply — there is no grotto on the maths
         island, so this can only ever be one of the two. yaw 0 squares the
         world x/z axes up with the screen, so the diagram reads exactly like
         the graph paper it's teaching. */
      const cave = near ? null : this.world.grottoAt(p.position.x, p.position.z);
      if (near) p.setFocus({ centre: dc, dist: 104, pitch: 1.16, yaw: 0 });
      else if (cave && !p.mount) {
        /* Centred on HER, not on the room. Framing the whole grotto would put
           the star on screen from the doorway and hand her the maze for
           nothing; this is an ordinary follow camera that has been tilted over
           far enough to see past the wall. */
        p.setFocus({ centre: p.position, dist: CAVE_DIST, pitch: CAVE_PITCH });
      } else p.setFocus(null);
    }
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
    this.input.claim(index, device);

    const p = this._seatPlayer(index, this._freeStyles()[0] ?? index);
    // Land her next to the party rather than back at the town: she is joining
    // a game in progress, and a kitten who appears two islands from her sisters
    // has to walk before she can play.
    const at = this._centroid();
    const g = this.world.heightAt(at.x + 3, at.z + 3);
    p.position.set(at.x + 3, (g ? g.y : 10) + 1, at.z + 3);
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

    for (const id of p.powerOrbs ?? []) this._dropOrbInWorld(id, p.position);
    if (p.mount) { p.mount.returnHome?.(); p.mount = null; }
    if (p.rideAlong) p.rideAlong = null;
    if (p.panda) p.panda.follows = false;
    if (this.ryu?.pilot === p) this.ryu.pilot = null;
    if (this.ryu?.gunner === p) this.ryu.gunner = null;
    for (const o of p.orbs ?? []) this.scene.remove(o.group);
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
   * BUILT RATHER THAN WRITTEN OUT, and absent below three players. `MenuNav`
   * finds its items by querying `.menu-btn` inside the open panel, so buttons
   * appearing and disappearing here are picked up for free — but a two-player
   * game must not show any, because the only thing DROP OUT could do there is
   * leave one kitten alone in a co-op game.
   */
  _buildLeaveButtons() {
    const wrap = document.getElementById('leave-buttons');
    const note = document.getElementById('join-note');
    if (!wrap) return;
    wrap.textContent = '';
    if (this.partySize > 2) {
      for (let i = 2; i < this.partySize; i++) {
        const b = document.createElement('button');
        b.className = 'menu-btn';
        b.textContent = `${this.players[i].name.toUpperCase()} — DROP OUT`;
        /* No cursor fix-up needed after this: `MenuNav.update` re-queries the
           panel's items every frame and clamps its remembered index, so a row
           vanishing under the highlight is already handled. */
        b.addEventListener('click', () => {
          this._leavePlayer(i);
          this._buildLeaveButtons();
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
  _dropOrbInWorld(id, at) {
    this.kotodama?.dropInWorld(id, at);
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
      const style = styleFor(i);
      const css = styleCss(i);

      const badge = document.createElement('div');
      badge.className = `score p${i + 1}`;
      badge.innerHTML = `<span class="pip"></span><span class="nm"></span>`
        + `<b id="score-${i}">0</b><span class="clan" id="clan-${i}"></span>`;
      badge.querySelector('.pip').style.background = css;
      badge.querySelector('.nm').textContent = style.name.toUpperCase();
      ((panes[i]?.x ?? 0) > 0 ? right : left).appendChild(badge);
    }

    /* AT MOST TWO MAPS, AND THEY BELONG TO PLAYERS 1 AND 2.
       One map per kitten is the obvious rule and it is the wrong one at four.
       A quadrant is a quarter of the screen; a map sized to stay legible eats a
       real fraction of it, and four of them means four corners of the game
       covered up at exactly the moment there is most to look at. It also stops
       being a map and starts being furniture: nobody reads four.

       PLAYERS 1 AND 2 RATHER THAN "WHOEVER IS FURTHEST APART" or any other
       clever rule, because the map has to be somewhere a kid can rely on
       finding it. Ember and Frost are the two who are always in the game — the
       party is 2 unless somebody joins, and slots 3 and 4 come and go
       mid-session — so keying the maps to the two permanent seats is the only
       version where the map does not move house when a sister joins or drops
       out. Everybody is drawn ON both maps regardless; what is capped is how
       many copies of the archipelago are on screen, not who appears on them.

       The badges above are still one per player: a score badge is a line of
       text, four of them fit, and a kid with no badge has no way to know what
       she has scored. */
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
      tag.style.color = styleCss(i);
      box.append(canvas, tag);
      maps.appendChild(box);
      this.maps.push(new Minimap(canvas, this.world, i));
    }
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
   * Up to two maps, each positioned INSIDE THE PANE ITS OWNER IS LOOKING AT.
   *
   * The corner is computed from the same `splitLayout` the renderer uses. It
   * used to be four CSS rules keyed off `hud-split` / `hud-horizontal`, which
   * was survivable while there were exactly two panes in one of two
   * arrangements and is not with quadrants: the HUD would have needed its own
   * idea of where pane 3 is, and two copies of that rule is how a map ends up
   * drawn over somebody else's half of the screen.
   *
   * MAP `i` IS PANE `i`'S MAP, and that is the whole rule. The pane index used
   * to be the player index — true while there was exactly one pane per kitten,
   * and false the moment two of them can share one.
   *
   * IT IS STILL "PLAYERS 1 AND 2" IN EVERY CASE WHERE THAT MEANS ANYTHING, and
   * that falls out of `_clusters` rather than being asserted here: groups are
   * ordered by their lowest member, so pane 0 always holds Ember and pane 1
   * always holds the lowest-numbered kitten who is NOT with her — which is
   * Frost whenever the two of them are apart. What the rule adds is the case
   * where they are together, and it is the case that matters: keying the second
   * map to Frost personally would hide it the instant she walked over to her
   * sister, and leave the OTHER pane — two kittens on the far side of the
   * archipelago — with no map at all. Two kids with no map is the failure the
   * minimap exists to prevent, and it would happen precisely when they are
   * furthest from everybody else.
   *
   * SO A MAP CAN END UP BELONGING TO A PANE RATHER THAN TO A GIRL, and it says
   * so — see the tag below. Panes 3 and 4 still get nothing, which is the cap
   * doing its job: four maps on four quadrants is four corners of the game
   * covered up at the moment there is most to look at.
   */
  _drawMaps() {
    const hud = document.getElementById('hud');
    hud.classList.toggle('hud-split', !this.merged);
    hud.classList.toggle('hud-horizontal', this.settings.dir === 'horizontal');
    // Lets the CSS move the map out from under the Dojo's sin/cos board.
    const mathUp = !document.getElementById('math-board').classList.contains('hidden');
    hud.classList.toggle('hud-math', mathUp);

    const W = window.innerWidth;
    const H = window.innerHeight;
    const groups = this.groups?.length ? this.groups : [this.players.map((_, i) => i)];
    const panes = this._panes(W, H, groups);

    for (let i = 0; i < this.maps.length; i++) {
      const box = document.getElementById(`map-box-${i}`);
      const tag = document.getElementById(`map-tag-${i}`);
      if (!box) continue;
      const pane = i;
      const shown = !!panes[pane] && !!groups[pane]?.length;
      box.classList.toggle('hidden', !shown);
      if (!shown) continue;

      const v = panes[pane];
      /* A map must fit the pane it is in. At a flat 32vw a quadrant's map ate
         most of a quarter-screen; sized against the PANE it stays the same
         fraction of what its owner can actually see. */
      box.style.width = `${Math.min(300, v.w * 0.42)}px`;

      if (this.merged) {
        /* THE SHARED MAP KEEPS THE BOTTOM RIGHT. The Dojo's sin/cos board owns
           bottom-left and runs to 42vw, so the one map on screen has always
           gone the other side and never collided with it. */
        box.style.left = 'auto';
        box.style.right = '14px';
        box.style.top = 'auto';
        box.style.bottom = '14px';
      } else {
        /* Viewport coords are bottom-left origin and CSS is top-left, so the
           pane's top edge is `H - v.y - v.h` from the top of the page. The map
           sits in its pane's bottom-left corner — except while the Dojo's
           board is up, which owns that corner and is the lesson somebody came
           to the Dojo for, so the map lifts to the top of its own pane. */
        box.style.left = `${v.x + 14}px`;
        box.style.right = 'auto';
        if (mathUp) {
          box.style.top = `${H - v.y - v.h + 78}px`;
          box.style.bottom = 'auto';
        } else {
          box.style.top = 'auto';
          box.style.bottom = `${v.y + 14}px`;
        }
      }

      /* THE TAG NAMES WHOEVER IS IN THE PANE, read off the group rather than
         off the map's index. A map shared by a whole pane cannot fly one
         kitten's name — labelling it EMBER while Frost is standing in the same
         shot invites the obvious question — and a map that has moved to a pane
         its index does not own must not claim to be somebody else's. */
      const members = groups[pane];
      const shared = members.length > 1;
      if (tag) {
        const key = i === 0 ? ' · Z' : ' · X';
        tag.textContent = this.merged ? 'Z: ZOOM'
          : `${shared ? 'SHARED' : styleFor(members[0]).name.toUpperCase()}${key}`;
      }

      /* Centre on the group, not on one kitten, whenever the pane holds more
         than one — the same rule the merged view has always followed, now asked
         per pane instead of once for the whole screen. */
      this.maps[i].focusIndex = shared ? null : members[0];
      this.maps[i].focusOn = members;
      this.maps[i].draw(this.players, this.dragons, this.kotodama);
    }
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
    let d = 0;
    for (let a = 0; a < members.length; a++) {
      for (let b = a + 1; b < members.length; b++) {
        const p = this.players[members[a]];
        const q = this.players[members[b]];
        if (p && q) d = Math.max(d, p.position.distanceTo(q.position));
      }
    }
    return d;
  }

  /** Where a set of kittens is, on average. The two-player midpoint
   *  generalised — same answer for two, and the right one for three or four. */
  _centroid(members = this.players.map((_, i) => i)) {
    const c = new THREE.Vector3();
    let n = 0;
    for (const i of members) {
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
      (p) => !p.mount && Math.hypot(p.position.x - dc.x, p.position.z - dc.z) < DOJO_VIEW_R
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
      solo: this.players.map((p) => !!(p.mount || p.rideAlong)),
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
    for (let i = 0; i < this.rigs.length; i++) {
      if (!this.players[i]) continue;
      const led = this.groups.find((m) => m[0] === i);
      this._updateRig(this.rigs[i], led ?? [i], dt);
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
   */
  _updateRig(rig, members, dt) {
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
      const inDojo = members.some((i) => {
        const p = this.players[i];
        return p && !p.mount
          && Math.hypot(p.position.x - dc.x, p.position.z - dc.z) < DOJO_VIEW_R;
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
      if (ft > 0.001) want.lerp(dc, ft);

      let wantDist = ryuMid
        ? onRyu.quad * RYU_VIEW
        : THREE.MathUtils.lerp(
          THREE.MathUtils.clamp(26 + dist * 0.85, 26, 52), 104, ft
        );

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
        wantDist = ring.dist;
      }

      if (!rig.seeded) {
        rig.target.copy(want);
        rig.dist = wantDist;
        rig.seeded = true;
      }
      rig.target.lerp(want, Math.min(1, dt * 6));
      rig.dist += (wantDist - rig.dist) * Math.min(1, dt * 4);

      let yaw = THREE.MathUtils.lerp(-Math.PI * 0.25, 0, ft);
      let pitch = ring ? ring.pitch : THREE.MathUtils.lerp(0.66, 1.16, ft);

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
    return splitLayout(
      groups.length, W, H, 3, this.settings.dir, groups.map((m) => m.length)
    );
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
