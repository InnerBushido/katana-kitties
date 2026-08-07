import * as THREE from 'three';
import './style.css';

import { InputManager, HALVES, MAP_FIELDS, VJOY_AXIS_NAMES } from './core/input.js';
import { Audio } from './core/audio.js';
import { loadSpriteAtlas } from './core/spritesheet.js';
import { placeholderCatAtlas, placeholderDragonTexture, placeholderPandaTexture } from './core/gfx.js';
import { World } from './world/world.js';
import { Player } from './entities/player.js';
import { Dragon, BREEDS } from './entities/dragon.js';
import { Panda, tierFor, toNextTier } from './entities/panda.js';
import { ClanLeader, LEADERS } from './entities/leader.js';
import { Orb, OrbPickup } from './entities/orb.js';
import { MathDojo } from './systems/mathdojo.js';
import { Minimap } from './systems/minimap.js';
import { Cutscene } from './systems/cutscene.js';

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
    const spots = [
      { x: 26, z: 78, breed: 0 },     // home island, east of the plaza
      { x: -26, z: 74, breed: 1 },    // home island, west of the plaza
      { x: 150, z: -95, breed: 2 },
      { x: -120, z: 140, breed: 3 },
      { x: 235, z: 60, breed: 4 },
      { x: 60, z: 165, breed: 2 },
      { x: -230, z: 118, breed: 0 },
      // The snow island had no dragon of its own, which made the one island
      // with a matching breed the one place you couldn't meet it.
      { x: -140, z: -60, breed: 3 },   // Frost, on the frost island
    ];
    for (const s of spots) {
      // Never perch one inside a house or jammed against the clan hall — a
      // dragon you can't see is a dragon that doesn't exist.
      const open = this.world.findOpenSpot(s.x, s.z, 10) ?? s;
      const g = this.world.heightAt(open.x, open.z);
      if (!g) continue;
      s.x = open.x;
      s.z = open.z;
      const d = new Dragon(art.texture, s.x, g.y, s.z, {
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
      if (v > 0) this.audio.startMusic();
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
      // Any key at all skips the intro — including Escape, which must not
      // open the pause menu over the top of it instead.
      if (this.cutscene?.active) { this.cutscene.skip(); e.preventDefault(); return; }
      if (e.code === 'KeyM' && this.state === 'play') this._toggleMath();
      /* Z zooms both maps, X only player 2's — so in split screen each kid can
         set their own scale without fighting over one control. */
      if (e.code === 'KeyZ' && this.state === 'play') {
        const z = this.minimap.cycleZoom();
        if (this.merged) this.minimap2.zoom = z;
        this.audio.play('menu');
        this.toast(`Map zoom ${z === 1 ? 'whole world' : `${z}x`}`, 0);
      }
      if (e.code === 'KeyX' && this.state === 'play' && !this.merged) {
        const z = this.minimap2.cycleZoom();
        this.audio.play('menu');
        this.toast(`Map zoom ${z === 1 ? 'whole world' : `${z}x`}`, 1);
      }
      if (e.code === 'Escape') {
        // Back out of a sub-panel first, otherwise toggle the pause menu.
        const helpOpen = !document.getElementById('panel-help').classList.contains('hidden');
        const setOpen = !document.getElementById('panel-settings').classList.contains('hidden');
        if (helpOpen || setOpen) {
          this.input.cancelCapture();
          hide('panel-help');
          hide('panel-settings');
          if (this.state === 'title') this.paused = false;
        } else if (this.state === 'play') {
          this.setPaused(!this.paused);
        }
      }
    });
  }

  /** True while any overlay panel is on screen and should own the input. */
  _overlayOpen() {
    return ['panel-settings', 'panel-help', 'panel-pause'].some(
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
      // Drop the frame the pause ate, or everything lurches on resume.
      this.clock.getDelta();
    }
  }

  /** Put the world back to its opening state without a page reload. */
  restart() {
    for (const p of this.players) {
      for (const o of p.orbs ?? []) this.scene.remove(o.group);
      p.orbs = [];
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
    if (this.cutscene && !this.introPlayed) {
      this.introPlayed = true;
      this.cutscene.play();
    } else {
      this.audio.startMusic('play');
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

  onMischief(player, prop, breath = null) {
    const done = this.world.props.filter((p) => p.scored).length;
    document.getElementById('mtotal').textContent = `${done} / ${this.world.mischiefTotal}`;
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

    if (this.state === 'title') {
      // Any button starts the game — but not while a panel is up. The whole
      // point of the Controllers readout is pressing buttons at it.
      if (!this._overlayOpen() && this.input.anyPressed()) this.startPlay();
      this._renderTitleIdle(dt);
      return;
    }

    /* --- the opening cutscene owns the screen while it runs ---
       The world keeps ticking underneath it: petals drift, shrine crystals
       turn, dragons breathe on their perches. A frozen world behind a moving
       camera reads as a pre-rendered video, and the whole point of this one
       is that it is the real place. */
    if (this.cutscene?.active) {
      if (this.input.anyPressed() || this.input.players.some((p) => p.pressed('start'))) {
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

    // `start` on either pad toggles the pause menu.
    if (this.input.players.some((p) => p.pressed('start'))) this.setPaused(!this.paused);

    if (this.paused) {
      // Keep drawing the world behind the menu, but freeze it.
      this._render();
      return;
    }

    for (let i = 0; i < 2; i++) {
      this.players[i].update(dt, this.input.players[i], this.world, this.dragons, this);
    }

    // Orbs, pickups, dragons, dojo.
    for (const p of this.players) {
      for (const o of p.orbs ?? []) o.update(dt, p.position);
    }
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
    this._updateSeek(dt);

    // Standing in the dojo frames the whole diagram from above.
    const dc = this.world.dojoCentre;
    let anyInDojo = false;
    for (const p of this.players) {
      const near = Math.hypot(p.position.x - dc.x, p.position.z - dc.z) < DOJO_VIEW_R;
      anyInDojo = anyInDojo || near;
      // yaw 0 squares the world x/z axes up with the screen, so the diagram
      // reads exactly like the graph paper it's teaching.
      p.setFocus(near ? { centre: dc, dist: 104, pitch: 1.16, yaw: 0 } : null);
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
    this.minimap.draw(this.players, this.dragons);
    if (!this.merged) this.minimap2.draw(this.players, this.dragons);
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
    const anyFlying = this.players.some((p) => p.mount);

    // Both kitties inside the dojo always share one view — the whole point is
    // that they read the same diagram together.
    const dc0 = this.world.dojoCentre;
    const bothInDojo = this.players.every(
      (p) => !p.mount && Math.hypot(p.position.x - dc0.x, p.position.z - dc0.z) < DOJO_VIEW_R
    );

    if (this.settings.split === 'always') this.merged = false;
    else if (this.settings.split === 'never' || bothInDojo) this.merged = true;
    else {
      // hysteresis so it doesn't flicker at the boundary
      if (this.merged && (dist > MERGE_OUT || anyFlying)) this.merged = false;
      else if (!this.merged && dist < MERGE_IN && !anyFlying) this.merged = true;
    }

    if (this.merged) {
      const dc = this.world.dojoCentre;
      const inDojo = this.players.some(
        (p) => !p.mount && Math.hypot(p.position.x - dc.x, p.position.z - dc.z) < DOJO_VIEW_R
      );
      this.sharedFocusT = (this.sharedFocusT ?? 0);
      this.sharedFocusT += ((inDojo ? 1 : 0) - this.sharedFocusT) * Math.min(1, dt * 2.2);
      const ft = this.sharedFocusT;

      const want = mid.clone();
      want.y += 1.6;
      if (ft > 0.001) want.lerp(dc, ft);
      this.sharedTarget.lerp(want, Math.min(1, dt * 6));

      const wantDist = THREE.MathUtils.lerp(
        THREE.MathUtils.clamp(26 + dist * 0.85, 26, 52), 104, ft
      );
      this.sharedDist += (wantDist - this.sharedDist) * Math.min(1, dt * 4);

      const yaw = THREE.MathUtils.lerp(-Math.PI * 0.25, 0, ft);
      const pitch = THREE.MathUtils.lerp(0.66, 1.16, ft);
      this.sharedCamera.position.set(
        this.sharedTarget.x + Math.sin(yaw) * Math.cos(pitch) * this.sharedDist,
        this.sharedTarget.y + Math.sin(pitch) * this.sharedDist,
        this.sharedTarget.z + Math.cos(yaw) * Math.cos(pitch) * this.sharedDist
      );
      this.sharedCamera.lookAt(this.sharedTarget);
    }
  }

  /* ------------------------------ render -------------------------------- */

  /** Everything billboarded must be turned toward *this* camera first. */
  _faceAll(camera) {
    for (const p of this.players) {
      p.faceCamera(camera);
      p.panda?.faceCamera(camera);
      for (const o of p.orbs ?? []) o.faceCamera(camera);
    }
    for (const d of this.dragons) d.faceCamera(camera);
    for (const L of this.leaders ?? []) L.faceCamera(camera);
    this.cutscene?.faceCamera(camera);
    for (const s of this.world.shrines) s.faceCamera(camera);
    for (const pk of this.pickups) if (!pk.taken) pk.faceCamera(camera);
    this.dojo.faceCamera(camera);
  }

  _renderView(camera, x, y, w, h) {
    if (w < 2 || h < 2) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    this._faceAll(camera);
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
