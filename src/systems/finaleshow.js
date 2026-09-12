import * as THREE from 'three';
import { Billboard } from '../core/gfx.js';
import { PLAYER_STYLE } from '../core/palette.js';
import { BLESS_STRETCH } from '../entities/player.js';
import { BIOMES, mergeParts } from '../world/build.js';
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
/** How tall a townsperson is drawn in the model, and an animal. A shade over
 *  life size at this scale — see `MINI_H`, which is the same measurement and
 *  the same argument. Big enough to catch the eye against a house, small
 *  enough that the town does not look like it is being attacked. */
const FOLK_H = 0.16;
const BEAST_H = 0.1;

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

const coneAt = (r, h, colour, x, y, z, seg = 6) => {
  const g = new THREE.ConeGeometry(r, h, seg);
  paint(g, colour);
  g.translate(x, y, z);
  return g;
};

const cylAt = (rt, rb, h, colour, x, y, z, seg = 8) => {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  paint(g, colour);
  g.translate(x, y, z);
  return g;
};

export class FinaleShow {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.world = null;
    this.cast = null;
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
    /** How long the four of them have been dropping into the ring, and whether
     *  there is a ring for them to drop into. See `_seedArena`. */
    this.arenaT = 0;
    this.satanLit = false;
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
    if (name === 'isles-cross') this._seedCross();
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
    this.folk = null;
    this.beasts = null;
    this.model = null;
    this.bridges = null;
    this.shapes = null;
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
      const span = new THREE.Mesh(
        this._keep(new THREE.BoxGeometry(Math.max(0.7, 18 * this.scaleK), 0.12, 0.5)),
        this._keep(new THREE.MeshBasicMaterial({
          color: 0xe0512c, transparent: true, opacity: 0, toneMapped: false,
          depthWrite: false,
        }))
      );
      this.modelMats.push(span.material);
      span.position.set(
        b.x * this.scaleK - (host?.home.x ?? 0),
        0.3,
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

    /* --- the buildings and the trees ------------------------------------- */
    let trees = 0;
    for (const s of this.world.solids ?? []) {
      if (!inside(s.x, s.z)) continue;
      const rr = s.r * K;
      if (s.r >= 1.6) {
        /* A BUILDING: a plaster box with a dark pagoda cap, which is the
           silhouette of every structure in this game from twenty units up. */
        const h = s.r * 1.55 * K;
        parts.push(boxAt(rr * 1.5, h, rr * 1.5, pal.rock, lx(s.x), 0.08 + h / 2, lz(s.z)));
        parts.push(coneAt(rr * 1.25, h * 0.55, 0x6e3a33,
          lx(s.x), 0.08 + h + h * 0.26, lz(s.z), 4));
      } else {
        /* A TREE. Thinned, because the autumn and dusk islands carry 180
           each and a model of a forest is a green disc either way — every
           third one keeps the canopy legible and the merge cheap. */
        if ((trees++) % 3) continue;
        const h = Math.max(0.12, s.r * 3.4 * K);
        parts.push(coneAt(Math.max(0.05, rr * 2.6), h, pal.grassDark,
          lx(s.x), 0.08 + h / 2, lz(s.z), 5));
      }
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
        const h = 6 * (L.s ?? 1) * K;
        const w = 4.4 * (L.s ?? 1) * K;
        const post = Math.max(0.02, 0.34 * (L.s ?? 1) * K);
        parts.push(boxAt(post, h, post, 0xd8482f, lx(L.x) - w / 2, 0.08 + h / 2, lz(L.z)));
        parts.push(boxAt(post, h, post, 0xd8482f, lx(L.x) + w / 2, 0.08 + h / 2, lz(L.z)));
        parts.push(boxAt(w * 1.5, post * 1.3, post * 1.6, 0xd8482f, lx(L.x), 0.08 + h, lz(L.z)));
        parts.push(boxAt(w * 1.2, post * 0.9, post * 1.2, 0xd8482f, lx(L.x), 0.08 + h * 0.78, lz(L.z)));
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
      const dr = 24 * K;
      parts.push(cylAt(dr, dr, 0.02, 0xf4ecd8, lx(dc.x), 0.1, lz(dc.z), 22));
      parts.push(cylAt(dr * 0.9, dr * 0.9, 0.03, pal.grass, lx(dc.x), 0.11, lz(dc.z), 22));
    }

    return parts;
  }

  /**
   * The mini-bridges, in the DBZ idiom, and they only exist while the islands
   * are one place.
   *
   * "Can even have mini-bridges between them that disappear when they start to
   * separate to symbolize the lost connection. Can have a DBZ reference art
   * style for the bridge, like a 'Snake Way' way of representing them being
   * connected if it looks nice." So each one is a winding gold ribbon that
   * humps over the gap rather than a straight plank — and there is exactly one
   * per island, running to whichever neighbour the pack left it leaning
   * against, which makes the set a spanning tree: every island reachable from
   * the town, nothing reachable two ways. That is the shape the line is about.
   *
   * BUILT ONCE, IN HUDDLE SPACE, AND NEVER MOVED. They have no meaning once
   * the islands are apart — that is the point of them — so animating their
   * ends across the drift would be work spent on a thing that is fading out.
   */
  _buildMiniBridges() {
    this.bridges = new THREE.Group();
    this.bridgeMat = this._keep(new THREE.MeshBasicMaterial({
      color: 0xf0c14b, transparent: true, opacity: 0,
      toneMapped: false, depthWrite: false,
    }));
    this.model.add(this.bridges);
    for (const isl of this.isles) {
      const p = isl.parent;
      if (!p) continue;
      const ax = isl.near.x;
      const az = isl.near.z;
      const bx = p.near.x;
      const bz = p.near.z;
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz) || 1;
      /* FROM RIM TO RIM, not centre to centre — a road that starts in the
         middle of an island is a road through a town. */
      const ux = dx / len;
      const uz = dz / len;
      const x0 = ax + ux * isl.r * 0.92;
      const z0 = az + uz * isl.r * 0.92;
      const x1 = bx - ux * p.r * 0.92;
      const z1 = bz - uz * p.r * 0.92;
      const span = Math.hypot(x1 - x0, z1 - z0);
      /* THE SNAKE. Four control points, alternating either side of the
         straight line and rising over the middle, which is Snake Way in the
         one gesture that reads at this size. */
      const pts = [];
      const px = -uz;
      const pz = ux;
      for (let i = 0; i <= 4; i++) {
        const u = i / 4;
        const wob = Math.sin(u * Math.PI * 2) * span * 0.22;
        const lift = Math.sin(u * Math.PI) * (span * 0.3 + 0.18)
          + (isl.nearY - p.nearY) * (1 - u) * 0 + (p.nearY - isl.nearY) * u;
        pts.push(new THREE.Vector3(
          x0 + (x1 - x0) * u + px * wob,
          0.14 + lift,
          z0 + (z1 - z0) * u + pz * wob
        ));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = this._keep(new THREE.TubeGeometry(
        curve, 20, Math.max(0.012, MINI_R * 0.004), 4, false
      ));
      this.bridges.add(new THREE.Mesh(geo, this.bridgeMat));
    }
  }

  /**
   * The people and the animals, and the fact that none of them ever leaves.
   *
   * INSTANCED, BECAUSE THIRTY BILLBOARDS IS THIRTY DRAW CALLS. At this scale a
   * townsperson is a coloured pill four pixels tall; the cost of drawing them
   * as sprites would be several times the cost of the entire model they are
   * standing on, for a picture nobody could tell apart from this one.
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

    const mk = (n, geo, base) => {
      const mesh = new THREE.InstancedMesh(this._keep(geo), base, n);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      this.model.add(mesh);
      return mesh;
    };

    this.folkMat = this._keep(new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0, toneMapped: false, depthWrite: false,
      vertexColors: true,
    }));

    const seed = (n, host, h, spread) => {
      const out = [];
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const rr = Math.sqrt(Math.random()) * host.r * spread;
        out.push({
          host,
          hx: Math.cos(a) * rr,
          hz: Math.sin(a) * rr,
          /* ITS OWN LITTLE ORBIT, and it is small. "Slightly moving about" —
             a model village where everybody is sprinting reads as an ant farm,
             and the shot is meant to be STILL while the camera pushes in. */
          wr: host.r * (0.04 + Math.random() * 0.05),
          sp: 0.25 + Math.random() * 0.5,
          ph: Math.random() * TAU,
          h,
        });
      }
      return out;
    };

    this.folk = { list: seed(FOLK, town, FOLK_H, 0.45) };
    this.beasts = { list: seed(BEASTS, town, BEAST_H, 0.72) };
    /* A FEW ON THE OTHERS, so the archipelago is inhabited and not a town with
       six empty rocks around it. One or two each, and never a person: the
       islands are where nobody goes any more. They are ON TOP of the town's
       own count rather than carved out of it — "about 10 - 20 people and
       10 - 20 animals" is a description of the TOWN, and splitting fourteen
       animals across seven islands would have put two in it. */
    for (const isl of outer) {
      this.beasts.list.push(...seed(1 + (Math.random() < 0.5 ? 1 : 0), isl, BEAST_H, 0.7));
    }

    const pillar = new THREE.CylinderGeometry(FOLK_H * 0.3, FOLK_H * 0.34, FOLK_H, 5);
    paint(pillar, 0xffffff);
    const critter = new THREE.BoxGeometry(BEAST_H * 1.5, BEAST_H, BEAST_H * 0.8);
    paint(critter, 0xffffff);
    this.folk.mesh = mk(this.folk.list.length, pillar, this.folkMat);
    this.beasts.mesh = mk(this.beasts.list.length, critter, this.folkMat);

    /* THE PEOPLE ARE THE PLAYERS' OWN COLOURS. Four kittens live in that town
       and the model is of their town; a crowd in the four palette colours is a
       crowd that belongs to them rather than a generic one. */
    const C = new THREE.Color();
    this.folk.list.forEach((f, i) => {
      C.set(PLAYER_STYLE[i % PLAYER_STYLE.length].colour);
      this.folk.mesh.setColorAt(i, C);
    });
    const FUR = [0xd8b071, 0x8e7357, 0xe6e0d2, 0x5d5a52, 0xc08a5a];
    this.beasts.list.forEach((f, i) => {
      C.set(FUR[i % FUR.length]);
      this.beasts.mesh.setColorAt(i, C);
    });
    if (this.folk.mesh.instanceColor) this.folk.mesh.instanceColor.needsUpdate = true;
    if (this.beasts.mesh.instanceColor) this.beasts.mesh.instanceColor.needsUpdate = true;
    this._m = new THREE.Matrix4();
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
      this.wedges.push({ geo: fat(lineGeo(18)), tick: { geo: fat(lineGeo(2)) } });
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
      this.kits.push({
        mini, big, cheer, colour: PLAYER_STYLE[i].colour, i,
        seed: (i / PLAYER_STYLE.length) * TAU, from: null, to: null, k: 0, hop: 0,
      });
    }

    /* THE RUNNER IS ONE OF THEM, FULL SIZE, ON THE PAINTED CIRCLE — she is a
       kitten walking the rim of the Dojo, which is the thing the island is
       for. She also IS the lesson's driver; see `drivers()`. */
    const first = sheets.find((a) => a?.texture);
    if (first) {
      const fig = this._mkFig(first, this._quad(first, REAL_H));
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
        this.model?.add(d.bb);
        const host = this.isles[i % Math.max(1, this.isles.length)] ?? null;
        this.drags.push({ ...d, seed: i * 1.7, riding: null, host, perch: null });
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
      k.to = this._pickIsle(k.from);
      k.k = Math.random() * 0.4;
      k.hop = 0;
    }
    for (let i = 0; i < this.drags.length && i < 2; i++) {
      const d = this.drags[i];
      d.riding = this.kits[this.kits.length - 1 - i] ?? null;
    }
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
    const target = bridge ? this._bridgeSpot() : new THREE.Vector3(0, 1.6, 0);
    const ring = bridge ? 0.55 : 1.15;
    const n = Math.max(1, this.kits.length);
    for (let i = 0; i < this.kits.length; i++) {
      const k = this.kits[i];
      const a = (i / n) * TAU;
      k.from = k.mini.bb.position.clone();
      k.to = target.clone().add(
        new THREE.Vector3(Math.cos(a) * ring, 0, Math.sin(a) * ring)
      );
      k.k = 0;
    }
    for (const d of this.drags) d.riding = null;
  }

  _bridgeSpot() {
    const b = this.miniBridge;
    if (!b) return new THREE.Vector3(0, 1.6, 0);
    const host = b.host?.g?.position ?? new THREE.Vector3();
    return new THREE.Vector3(host.x + b.local.x, 0.9, host.z + b.local.z);
  }

  _pickIsle(not) {
    const pool = this.isles.filter((i) => i !== not);
    if (!pool.length) return new THREE.Vector3();
    const isl = pool[Math.floor(Math.random() * pool.length)];
    const a = Math.random() * TAU;
    const rr = isl.r * 0.55;
    return new THREE.Vector3(
      isl.g.position.x + Math.cos(a) * rr, 0.25, isl.g.position.z + Math.sin(a) * rr
    );
  }

  /** Line the four of them up at one end of the real bridge. */
  _seedBridge() {
    const b = this.world?.bridge;
    if (!b) return;
    for (let i = 0; i < this.kits.length; i++) {
      const k = this.kits[i];
      /* SPREAD ACROSS THE DECK AND STAGGERED ALONG IT. Four cats abreast on a
         4.4-unit bridge is a wall; four cats at four different points of the
         run reads as four kids racing. */
      k.lane = (i - (this.kits.length - 1) / 2) * 1.1;
      k.k = -i * 0.22 - Math.random() * 0.1;
      k.big.bb.visible = true;
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
    }
    if (this.satan) this.satan.bb.visible = false;
    if (this.satanUp) this.satanUp.bb.visible = false;

    this._stepFade(dt);
    this._stepRings(dt);
    this._stepRunner(dt);
    this._stepModel(dt);
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
    const wantModel = P === 'isles-wake' || P.startsWith('isles-') ? 1 : 0;
    const wantRun = P === 'dojo-run' ? 1 : 0;
    const rate = dt / WAKE;
    this.modelOn = Math.max(0, Math.min(1, this.modelOn + (wantModel ? rate : -rate * 2)));
    this.runnerOn = Math.max(0, Math.min(1, this.runnerOn + (wantRun ? rate * 4 : -rate)));
    if (this.runner && this.runnerOn <= 0.001 && this.runner.a > 0.4) this.runner.done = true;
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
    r.on = want;
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
  _stepModel(dt) {
    if (!this.model) return;
    const P = this.phase ?? '';
    const on = this.modelOn;
    for (const m of this.modelMats) m.opacity = on * 0.95;
    if (this.folkMat) this.folkMat.opacity = 0;
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
    const drifting = P === 'isles-drift' || P === 'isles-cross'
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
    const settled = P === 'isles-in' ? Math.max(0, this.phaseT - 0.4) : 0;
    const shake = P === 'isles-in'
      ? Math.min(1, settled / 1.4) * 0.16 * on
      : (1 - dk) * 0.16;
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

    /* --- the connections, and losing them -------------------------------- */
    if (this.bridgeMat) {
      /* GONE BY THE TIME THEY HAVE MOVED A QUARTER OF THE WAY, so the picture
         is "the roads break and then the islands go", which is the order the
         sentence puts them in. */
      const linked = Math.max(0, 1 - dk * 4);
      this.bridgeMat.opacity = on * linked * 0.9;
      if (this.bridges) this.bridges.visible = this.bridgeMat.opacity > 0.02;
    }

    /* --- and the people who stopped using them --------------------------- */
    this._stepFolk(on, dk);

    /* --- the little ones, crossing --------------------------------------- */
    const crossing = P === 'isles-cross' || P === 'isles-angle' || P === 'isles-circle';
    const leaping = P === 'isles-leap' || P === 'isles-bridge';
    for (const k of this.kits) {
      const bb = k.mini.bb;
      bb.visible = crossing || leaping;
      if (!bb.visible) continue;
      /* THEY FADE WITH THE GROUND THEY ARE ON. A billboard's opacity is its
         own material's and nothing propagates down a group, so without this
         the kittens and the dragons snapped in at full strength over an island
         that was still arriving — which is the same blink the model itself
         used to have, one layer up. */
      bb.mat.opacity = on;
      bb.row = 2;
      bb.frame = Math.floor(this.t * 10 + k.seed) % Math.max(1, bb.cols);
      if (crossing) {
        k.k += dt * 0.55;
        if (k.k >= 1) { k.from = k.to; k.to = this._pickIsle(null); k.k = 0; }
        const a = k.from ?? new THREE.Vector3();
        const b = k.to ?? new THREE.Vector3();
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
        const a = k.from ?? bb.position;
        const b = k.to ?? bb.position;
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

    for (const d of this.drags) {
      const r = d.riding;
      d.bb.mat.opacity = on;
      if (r?.mini.bb.visible) {
        d.bb.visible = true;
        d.bb.row = 0;
        d.bb.position.copy(r.mini.bb.position);
        d.bb.position.y -= 0.35;
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

    this._stepShapes();
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
   */
  _stepFolk(on, dk) {
    if (!this.folk || !this.beasts || !this.folkMat) return;
    /* THEY GO AS THE ISLANDS GO. "When the islands drift apart, the people/
       animals fade away." Faster than the islands move, so the model is empty
       by the time it is scattered rather than carrying a crowd through it. */
    const live = Math.max(0, 1 - dk * 2.5);
    this.folkMat.opacity = on * live;
    const show = this.folkMat.opacity > 0.02;
    this.folk.mesh.visible = show;
    this.beasts.mesh.visible = show;
    if (!show) return;
    const M = this._m;
    for (const set of [this.folk, this.beasts]) {
      set.list.forEach((f, i) => {
        const a = f.ph + this.t * f.sp;
        M.makeTranslation(
          f.host.g.position.x + f.hx + Math.cos(a) * f.wr,
          f.host.g.position.y + 0.09 + f.h / 2,
          f.host.g.position.z + f.hz + Math.sin(a) * f.wr
        );
        set.mesh.setMatrixAt(i, M);
      });
      set.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * The angle and the circles, over the model, while the words are said.
   *
   * BOTH OF THEM ARE READ OFF THE KITTENS. See `_buildShapes` for why that
   * matters and for the "thicker at the base" trick. What is solved here is
   * only the live half: where the four of them are this frame, what angle that
   * makes at the middle of the world, and how far out the circles have grown.
   */
  _stepShapes() {
    if (!this.shapes) return;
    const P = this.phase;
    const ang = P === 'isles-angle' ? Math.min(1, this.phaseT / 0.45) : 0;
    const cir = P === 'isles-circle' ? Math.min(1, this.phaseT / 0.45) : 0;
    const any = Math.max(ang, cir);
    this.shapes.visible = any > 0.02;
    if (!this.shapes.visible) return;

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
    this.angleMat.opacity = ang * 0.95;
    /* NOBODY TO MEASURE BETWEEN IS NOT A SMALL ANGLE, IT IS NO ANGLE. Without
       this the group stays lit holding whatever geometry the last frame with
       kittens in it left behind — a diagram of four cats who are not there. */
    this.angleFx.visible = ang > 0.02 && at.length > 0;
    if (this.angleFx.visible) {
      const y = HUD_Y;
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
        const rr = (MINI_R * 0.2) + i * (MINI_R * 0.055);
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
      }
    }

    /* --- and the circles ------------------------------------------------- */
    this.circleMat.opacity = cir * 0.9;
    this.reticleMat.opacity = cir * 0.75;
    this.circleFx.visible = cir > 0.02;
    if (this.circleFx.visible) {
      /* EXPANDING, AND OUT PAST THE FURTHEST OF THEM. "Show them expanding the
         circle while navigating between the islands" — so the radius is solved
         from how far out the kittens have actually got, which means the circle
         grows because they did. */
      const reach = at.reduce((m, p) => Math.max(m, Math.hypot(p.x, p.z)), MINI_R * 0.35);
      const e = 1 - (1 - cir) * (1 - cir);
      for (const tier of this.tiers) {
        /* NARROWING AS IT CLIMBS — a cone of rings rather than a cylinder of
           them, which is the shape in the reference and the reason it reads as
           3D at all from a camera that is nearly level with it. */
        const rr = (reach * 1.06) * (1 - tier.k * 0.6) * e;
        const y = HUD_Y * 0.5 + tier.k * (MINI_R * 0.55);
        tier.skin.forEach((l, j) => {
          l.position.y = y + j * 0.05;
          l.scale.set(rr, 1, rr);
          l.rotation.y = this.t * (0.1 + tier.k * 0.12);
        });
      }
      for (const R of this.reticles) {
        R.g.position.y = HUD_Y + R.y;
        R.g.scale.setScalar(reach * R.r * e);
        R.g.rotation.y = this.t * R.spin;
      }
    }
    for (const R of this.reticles) R.g.visible = this.circleFx.visible;
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
   * Four kittens running the real bridge, and over the camera.
   *
   * THEY RUN PAST THE LENS AND OUT OF THE SHOT. "Can have them all pass over
   * and through the bridge and past the camera while the camera is just focused
   * on the bridge." So the path runs the whole length of the deck and keeps
   * going: the last thing the shot holds is an empty bridge, which is the
   * picture that line wants under it.
   */
  _stepBridge(dt) {
    const b = this.world?.bridge;
    if (this.phase !== 'bridge-run' || !b) return;
    for (const k of this.kits) {
      /* TIMED TO CLEAR THE SHOT. `bridge-run` holds for 9.4 seconds and the
         last kitten starts two thirds of a second late, so this is the fastest
         rate that still leaves the lens looking at an empty bridge for a beat
         before the arena — which is the picture the line wants under it. */
      k.k += dt * 0.22;
      const u = k.k;
      if (u < 0 || u > 1.35) { k.big.bb.visible = false; continue; }
      k.big.bb.visible = true;
      /* ALONG THE DECK, which is the x axis — the span is 18 units of arch on
         x and 4.4 wide on z, and `world.bridge` is its crest. */
      const x = b.x - 16 + u * 32;
      const arch = Math.cos(Math.max(-1, Math.min(1, (x - b.x) / 9)) * Math.PI / 2);
      /* AND THEY JUMP. Not once, and not in step: three hops each over the
         crossing, offset per kitten, because four cats jumping on the same
         frame is a chorus line. */
      const hop = Math.max(0, Math.sin((u * 3.1 + k.seed) * Math.PI)) * 1.9;
      k.big.bb.position.set(x, b.y - 2.2 + arch * 2.2 + hop, b.z + k.lane);
      k.big.bb.facing = Math.PI / 2;
      k.big.bb.row = hop > 0.3 ? 2 : 1;
      k.big.bb.frame = Math.floor(this.t * 11 + k.seed) % Math.max(1, k.big.bb.cols);
      k.big.bb.mat.opacity = 1;
      k.big.bb.mesh.scale.setScalar(1);
    }
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
      const cheering = up && k.cheer;
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
