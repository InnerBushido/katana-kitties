import * as THREE from 'three';
import './style.css';

import { InputManager, HALVES, MAP_FIELDS, VJOY_AXIS_NAMES } from './core/input.js';
import { Audio, trackForIsland } from './core/audio.js';
import { loadSpriteAtlas } from './core/spritesheet.js';
import { placeholderCatAtlas, placeholderDragonTexture, placeholderPandaTexture } from './core/gfx.js';
import { World } from './world/world.js';
import { Player, ATTACKS, MAX_HP, KO_TIME } from './entities/player.js';
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
import { Tournament } from './systems/tournament.js';
import { Menagerie } from './systems/menagerie.js';
import { AngelForm } from './entities/angel.js';
import { ArenaQuest, SATAN_TOWN, MILESTONES } from './systems/arenaquest.js';
import { loadBoard } from './systems/leaderboard.js';
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

const MERGE_IN = 30;     // join the screens when the kitties are this close
const MERGE_OUT = 46;    // split again beyond this
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
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
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
    this.settings = { split: 'auto', dir: 'vertical', quality: 'medium' };
    this.mathVisible = true;

    this.sharedCamera = new THREE.PerspectiveCamera(38, 1, 0.5, 4000);
    this.sharedTarget = new THREE.Vector3();
    this.sharedDist = 34;

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
    this.ryuArt = await loadSpriteAtlas('/sprites/ryuuseki.png', { views: 1, rows: 1, clearPockets: true })
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
      loadSpriteAtlas('/sprites/leader_satan.png', { views: 1, rows: 1, clearPockets: true })
        .catch(() => null),
      loadSpriteAtlas('/sprites/griffin.png', { views: 1, rows: 1, clearPockets: true })
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
    for (const p of this.players) {
      p.angelForm = new AngelForm(critterArt.angel_wings, p.height);
      p.group.add(p.angelForm.group);
      p.setEatArt(p.index === 0 ? critterArt.ember_eat : critterArt.frost_eat);
    }

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

    /* Two maps: `minimap` is the shared/P1 one, `minimap2` only appears when
       the screen splits. They keep their own zoom so each player can be looking
       at a different scale. */
    this.minimap = new Minimap(document.getElementById('minimap'), this.world, 0);
    this.minimap2 = new Minimap(document.getElementById('minimap2'), this.world, 1);
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
      const a = await loadSpriteAtlas(url, { views, rows, cell: 384 });
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

  _spawnPlayers(ember, frost) {
    const spawnFor = (dx) => {
      const g = this.world.heightAt(dx, 34);
      return new THREE.Vector3(dx, (g ? g.y : 8) + 0.1, 34);
    };

    // Multi-column sheets are a full turn with nothing mirrored, which is what
    // keeps Ember's tail and shoulder guard on the correct side when facing
    // right. Only the 4-cell fallback still mirrors.
    const cfg = (a) => ({
      texture: a.texture,
      cols: a.cols,
      rows: a.rows,
      contentScale: a.contentScale ?? 1,
      pad: a.pad ?? 0,
      mirror: a.cols <= 4 && a.rows === 1,
    });

    /* Both live sheets are internally consistent — every row turns the same
       way, increasing column toward screen-right — so both take dirSense 1 and
       neither needs a per-row override. Measured off the art, not guessed; the
       probe is in HANDOFF.md.

       If one ever looks wrong in play, flip it live from the console rather
       than guessing here:  game.setRowSense(1, 0, -1)   // Frost, idle row */
    this.players = [
      new Player({
        ...cfg(ember), index: 0, spawn: spawnFor(-3.5), name: 'Ember', height: 2.9,
        dirSense: 1,
      }),
      new Player({
        ...cfg(frost), index: 1, spawn: spawnFor(3.5), name: 'Frost', height: 2.85,
        dirSense: 1,
      }),
    ];
    for (const p of this.players) this.scene.add(p.group);
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
   * Player 2 only owns a map of her own while the screen is split — merged,
   * there is one map on screen and both controls drive it, which is why
   * player 1's path also copies the zoom onto `minimap2`: it is the map that
   * takes over the moment they run apart, and inheriting the zoom means the
   * split doesn't silently reset it under her.
   */
  _zoomMap(index) {
    if (this.state !== 'play') return;
    const target = (index === 1 && !this.merged) ? this.minimap2 : this.minimap;
    const z = target.cycleZoom();
    if (target === this.minimap && this.merged) this.minimap2.zoom = z;
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
      p.marker.material.color.set(p.index === 0 ? 0xff8a3d : 0xff6fae);
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
    for (const id of ['c1', 'c2']) {
      const el = document.getElementById(id);
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
    document.getElementById('s1').textContent = '0';
    document.getElementById('s2').textContent = '0';
    document.getElementById('mtotal').textContent = `0 / ${this.world.mischiefTotal}`;
    document.getElementById('toasts').replaceChildren();
    this.merged = true;
    this.sharedFocusT = 0;
    // Re-seed the shared rig: the kittens are back at the town and the camera
    // must be there with them, not lerping in from wherever the last run ended.
    this._sharedSeeded = false;
    /* Restart puts every prop back up, so the 100% is on the table again and
       its ending has to be too. `found` and `summon` are deliberately NOT
       reset: those are tied to Ryuuseki, who is still in the world. */
    this._finaleDue = false;
    if (this.summonScene) this.summonScene.played.finale = false;

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
   * The remap grid. Only shown for the merged Joy-Con pad, because that's the
   * one whose button numbers are decided by whatever is feeding vJoy — they
   * can't be known from here, so they get pressed in instead of guessed.
   */
  _refreshMapGrid(pads, mapEl) {
    if (!mapEl) return;
    const split = pads.some((p) => p.slots.length === 2);
    if (!split) {
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
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

  _updateHint() {
    const src = this.input.describe().join('   ·   ');
    document.getElementById('hint').textContent =
      `${src}   ·   M: math overlay   ·   cut the bamboo east of town`
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
          color: p.index === 0 ? 0xff8a3d : 0xff6fae,
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
    const el = document.getElementById(player.index === 0 ? 'c1' : 'c2');
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
    /* --- the endgame, in one key ---
       Same argument as `7` `8` `9`. The Powerup Kotodama only exist after 216
       props have been knocked over, which is most of an afternoon; without
       this, checking one colour on one orb means playing the whole game.
       `6` awakens them and hands both kittens the world's points, so the
       stall, the sixteen pickups, the profile screen and the trade are all
       one press away. */
    if (code === 'Digit6') {
      if (this.kotodama.awakened) {
        this.toast('[debug] already awakened — walk to the stall in the market', 0);
      } else {
        for (const p of this.players) p.score = Math.round(this.world.pointsTotal / 2);
        for (const p of this.players) this.onScoreChanged(p);
        this._announceAwakening(this.kotodama.awaken());
        this.toast('[debug] Kotodama awakened, purses filled', 0);
      }
    }
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
      const dx = target.position.x - attacker.position.x;
      const dz = target.position.z - attacker.position.z;
      const dy = target.position.y - attacker.position.y;
      const dist = Math.hypot(dx, dz);
      if (dist > range || Math.abs(dy) > 4.5) continue;
      // Same forward-arc test the props get, widened for the dash so a charge
      // that visibly connects is not refused on a half-degree of facing.
      const dot = (dx * dir.x + dz * dir.y) / (dist || 1);
      if (dot < A.arc) continue;

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
    const mid = this.players[0].position.clone()
      .add(this.players[1].position).multiplyScalar(0.5);
    this.griffin.fly(mid, to, this.players);
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
    this._sharedSeeded = false;
    this.clock.getDelta();

    if (going === 'out') {
      this.satan?.moveTo(this.world.arenaBooth.x, this.world.arenaBooth.y, this.world.arenaBooth.z);
      this.satan?.setLine('');
      this.tournament.begin();
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

  /** Paint the record board into the pause-menu panel. */
  _paintBoard() {
    const el = document.getElementById('board-body');
    if (!el) return;
    const rows = loadBoard();
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
    if (done >= this.world.mischiefTotal && !this.summonScene?.played.finale) {
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
    document.getElementById(player.index === 0 ? 's1' : 's2').textContent = player.score;
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

    // `start` on either pad toggles the pause menu.
    if (this.input.players.some((p) => p.pressed('start'))) this.setPaused(!this.paused);

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
       See onMischief for why it is queued rather than fired there. */
    if (this._finaleDue && !this._sceneActive()) {
      this._finaleDue = false;
      const B = this._worldBounds();
      if (this.summonScene.start('finale', B.centre, B.radius, this.leaderArt.elder)) {
        this.sfx('starfound');
        this.toast('100% MISCHIEF — every last thing, knocked over', 0);
        this.toast('100% MISCHIEF — nothing left standing', 1);
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
    const frozen = this.tournament?.frozen;
    for (let i = 0; i < 2; i++) {
      const pad = (frozen || this.menagerie?.eating(i)) ? DEAD_PAD : this.input.players[i];
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

    const mid = this.players[0].position.clone().add(this.players[1].position).multiplyScalar(0.5);
    this.world.update(dt, mid);
    this.world.focusShadows(mid.x, mid.z);

    this._updateSplit(dt, mid);
    this._render();

    // The map only needs to be right, not smooth — a third of the frames is
    // plenty and keeps the 2D context off the hot path.
    this._mapT = (this._mapT ?? 0) + dt;
    if (this._mapT > 1 / 20) {
      this._mapT = 0;
      this._drawMaps();
    }
  }

  /** One map when the view is shared, two when it's split. */
  _drawMaps() {
    const hud = document.getElementById('hud');
    hud.classList.toggle('hud-split', !this.merged);
    hud.classList.toggle('hud-horizontal', this.settings.dir === 'horizontal');
    // Lets the CSS move the map out from under the Dojo's sin/cos board.
    hud.classList.toggle('hud-math',
      !document.getElementById('math-board').classList.contains('hidden'));
    document.getElementById('minimap-wrap2').classList.toggle('hidden', this.merged);
    document.getElementById('map-tag').textContent = this.merged ? 'Z: ZOOM' : 'EMBER · Z';

    // Shared view: centre on the pair. Split: each map follows its own kitten.
    this.minimap.focusIndex = this.merged ? null : 0;
    this.minimap.draw(this.players, this.dragons, this.kotodama);
    if (!this.merged) this.minimap2.draw(this.players, this.dragons, this.kotodama);
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
    document.getElementById(player.index === 0 ? 's1' : 's2').textContent = player.score;
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
    const [a, b] = result.counts;
    for (const p of this.players) {
      this.toast(`THE KOTODAMA AWAKEN — ${this.players[0].name} ${a}, ${this.players[1].name} ${b}`, p.index);
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

  _updateSplit(dt, mid) {
    const dist = this.players[0].position.distanceTo(this.players[1].position);
    /* `rideAlong` counts as flying too. The gunner is thirty units up on a
       dragon; standing next to where her sister happens to be on the ground is
       not a reason to merge the view. */
    const anyFlying = this.players.some((p) => p.mount || p.rideAlong);

    // Both kitties inside the dojo always share one view — the whole point is
    // that they read the same diagram together.
    const dc0 = this.world.dojoCentre;
    const bothInDojo = this.players.every(
      (p) => !p.mount && Math.hypot(p.position.x - dc0.x, p.position.z - dc0.z) < DOJO_VIEW_R
    );

    /* BOTH girls on Ryuuseki force ONE camera, and it outranks even "always
       split". Two half-screens of the same animal is the worst possible view
       of him: the flyer's turns yank the gunner's camera around, the gunner
       cannot see what she is aiming at, and the one moment the game asks the
       two girls to be in the same seat is rendered as though they are not.
       Same rule as the dojo, and for the same reason — a shared thing gets a
       shared view.

       IT IS `duo`, NOT `ridden`, AND THE DIFFERENCE IS THE WHOLE BUG. The rule
       fired on anybody being aboard, so one kitten climbing on collapsed the
       screen to a single camera locked to the dragon — while her sister, who
       had done nothing, was still down in the town with no view of her own,
       following a dragon she was not on until she happened to walk back into
       frame. A shared view is only right when the thing is actually shared. */
    const onRyu = !!this.ryu?.duo;

    /* A ROUND IS ONE SCREEN, outranking "always split" exactly as the dojo
       and a crewed Ryuuseki do — and for the same reason both of those give:
       a shared subject gets a shared view. Two half-screens of one 56-unit
       ring is the worst possible way to watch a fight, because each girl gets
       half the width to judge a knockback across and neither can see how much
       ring is behind the other. It is the one moment in the game where both
       players are looking at exactly the same thing. */
    const inRing = !!this.tournament?.active;

    if (onRyu || inRing || this.settings.split === 'never' || bothInDojo) this.merged = true;
    else if (this.settings.split === 'always') this.merged = false;
    else {
      // hysteresis so it doesn't flicker at the boundary
      if (this.merged && (dist > MERGE_OUT || anyFlying)) this.merged = false;
      else if (!this.merged && dist < MERGE_IN && !anyFlying) this.merged = true;
    }

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
      const inDojo = this.players.some(
        (p) => !p.mount && Math.hypot(p.position.x - dc.x, p.position.z - dc.z) < DOJO_VIEW_R
      );
      this.sharedFocusT = (this.sharedFocusT ?? 0);
      this.sharedFocusT += ((inDojo ? 1 : 0) - this.sharedFocusT) * Math.min(1, dt * 2.2);
      const ft = this.sharedFocusT;

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
      const shot = this.starShot;
      if (shot && !ryuMid) {
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

      if (!this._sharedSeeded) {
        this.sharedTarget.copy(want);
        this.sharedDist = wantDist;
        this._sharedSeeded = true;
      }
      this.sharedTarget.lerp(want, Math.min(1, dt * 6));
      this.sharedDist += (wantDist - this.sharedDist) * Math.min(1, dt * 4);

      let yaw = THREE.MathUtils.lerp(-Math.PI * 0.25, 0, ft);
      let pitch = ring ? ring.pitch : THREE.MathUtils.lerp(0.66, 1.16, ft);

      /* THE GROTTO AGAIN, HERE, BECAUSE THIS IS THE CAMERA THAT DRAWS WHEN
         THEY ARE TOGETHER — and inside a 21-unit room they always are. The
         per-player `setFocus` above is the split-screen half of this rule and
         it does nothing at all while merged, which is the trap this file has
         fallen into three times now (Ryuuseki's framing, the star shot, and
         now this). Same numbers, so the view does not change as the screen
         joins and splits. */
      const cave = this.world.grottoAt(this.sharedTarget.x, this.sharedTarget.z);
      if (cave) {
        this.caveT = Math.min(1, (this.caveT ?? 0) + dt * 2.4);
      } else {
        this.caveT = Math.max(0, (this.caveT ?? 0) - dt * 2.4);
      }
      if (this.caveT > 0.001) {
        const ct = this.caveT;
        pitch = THREE.MathUtils.lerp(pitch, CAVE_PITCH, ct);
        this.sharedDist = THREE.MathUtils.lerp(this.sharedDist, CAVE_DIST, ct * Math.min(1, dt * 4));
      }
      this.sharedCamera.position.set(
        this.sharedTarget.x + Math.sin(yaw) * Math.cos(pitch) * this.sharedDist,
        this.sharedTarget.y + Math.sin(pitch) * this.sharedDist,
        this.sharedTarget.z + Math.cos(yaw) * Math.cos(pitch) * this.sharedDist
      );
      this.sharedCamera.lookAt(this.sharedTarget);
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

    if (this.merged) {
      this._renderView(this.sharedCamera, 0, 0, W, H);
      return;
    }

    const gap = 3;
    if (this.settings.dir === 'horizontal') {
      const h = Math.floor((H - gap) / 2);
      // WebGL viewport origin is bottom-left: player 1 goes on top.
      this._renderView(this.players[0].camera, 0, H - h, W, h);
      this._renderView(this.players[1].camera, 0, 0, W, h);
    } else {
      const w = Math.floor((W - gap) / 2);
      this._renderView(this.players[0].camera, 0, 0, w, H);
      this._renderView(this.players[1].camera, W - w, 0, w, H);
    }
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
