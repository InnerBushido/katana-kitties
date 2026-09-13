import * as THREE from 'three';
import { Billboard } from '../core/gfx.js';
import { Label } from '../core/label.js';
import { PLAYER_STYLE } from '../core/palette.js';
import { BLESS_STRETCH } from '../entities/player.js';
import { BIOMES, mergeParts, pagodaRoof } from '../world/build.js';
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
const BR_W = MINI_R * 0.06;
const BR_T = MINI_R * 0.012;
const BR_SLATS = 14;
const BR_SNAP = 0.16;
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
 * The bridge run: how fast they cross, where they start, and how often one of
 * them does something.
 *
 * THEY ARE ALREADY RUNNING WHEN THE LIGHTS COME UP. "We should already have
 * the animated characters spawned in before the camera starts fading in and
 * have them running towards the bridge already." The old seed put every kitten
 * at a NEGATIVE position along the deck — off the end and invisible — and let
 * them walk on one at a time, so the first thing the shot showed was an empty
 * bridge and then a queue. `BR_HEAD` is a random head start each, so the fade
 * lifts on four cats already mid-crossing.
 *
 * AND STAGGERED BY DICE, NOT BY INDEX. The old offset was `-i * 0.22`: four
 * cats in a perfectly even line, which is a parade. A random head start and a
 * random lane wobble is four kids who set off when they felt like it.
 *
 * THE RATE CAME DOWN WITH IT. `bridge-run` holds 9.4 seconds; the furthest
 * back starts at 0.02 and has 1.33 of deck to clear, which at 0.17 is 7.8
 * seconds and still leaves the lens a beat of empty bridge before the arena —
 * the picture that line wants under it, and the reason the old rate was what
 * it was.
 */
const BR_RATE = 0.17;
const BR_HEAD = [0.02, 0.34];

/** How long one flourish lasts, and the gap between them. Both ends random per
 *  kitten per go: "jumping randomly, multiple times, with random pauses between
 *  jumps, to show they are having random/chaotic fun." */
const HOP_DUR = [0.42, 0.34];
const HOP_GAP = [0.30, 1.30];
const ACT_DUR = [0.38, 0.30];
const ACT_GAP = [1.10, 2.40];

/** The four things a kitten might do on the way across, and they are the four
 *  the game actually has. "Can even have some swinging swords or using random
 *  abilities like the Orb or Smash, or Dash abilities, to show players what
 *  abilities they can unlock later." */
const BR_ACTS = ['swing', 'orb', 'smash', 'dash'];

const ANG_Y = 0.55;
const CIR_Y = HUD_Y * 1.15;

/** The order the Dojo's cues arrive in. The overlay needs to know whether a
 *  phase is BEFORE or AFTER the word that lit it, which is a question about
 *  sequence and not about the current cue's name. */
const ISLE_CUES = ['isles-wake', 'isles-in', 'isles-drift', 'isles-cross',
  'isles-angle', 'isles-circle', 'isles-leap', 'isles-bridge'];

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

         SAME VOCABULARY AS THE SPANS BETWEEN THE ISLANDS — arched deck,
         gold rails, a torii at each end — because it is the same kind of
         object, and because the eye has just spent ten seconds learning to
         read that shape as a crossing.

         AND IT RIDES `holo`, NOT `bridgeMat`. The connecting spans dim with
         `dk` as the islands separate, which is the whole point of them; this
         one must not, because the islands have already separated by the time
         anybody jumps at it. */
      const span = new THREE.Mesh(this._keep(this._miniSpanGeo()), this.holo);
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
        /* A BUILDING, AND IT IS THE GAME'S OWN ROOF. "The buildings on the
           holographic islands look like normal buildings. We should use the
           buildings with the cool oriental roofs that we have in the main
           island as they should look similar or be the same if possible. Can
           just use those 3D models and shrink them down."

           It was a plaster box with a four-sided cone on it, which from
           twenty-six units out is a hut with a party hat. `pagodaRoof` is the
           real one — the flared eaves and the kicked-up corners that
           `build.js` says do "most of the work of selling Japan" — and it takes
           its detail as arguments, so the same function that builds a house you
           can walk around builds this one at three rings and two segments a
           side. Thirty-three vertices, and it is unmistakably the same roof.

           SHRINKING THE ACTUAL MESH WAS THE OTHER READING AND IT IS WORSE.
           `buildHouse` returns eleven parts with a lantern and a door frame on
           it; four hundred of those merged is a quarter of a million triangles
           to draw a town the size of a saucer. The SHAPE is what has to be the
           same, and the shape is one call. */
        const h = s.r * 1.3 * K;
        const hw = rr * 0.72;
        parts.push(boxAt(hw * 2, h, hw * 2, pal.rock, lx(s.x), 0.08 + h / 2, lz(s.z)));
        /* The timber under the eaves, which is what stops a white box from
           reading as a white box. */
        parts.push(boxAt(hw * 2.1, h * 0.12, hw * 2.1, 0x6b4a34,
          lx(s.x), 0.08 + h * 0.94, lz(s.z)));
        const roof = pagodaRoof(hw, hw, h * 0.62,
          { overhang: 0.55, cornerLift: 0.5, rings: 3, perSide: 2 });
        paint(roof, 0x4a4a6e);
        roof.translate(lx(s.x), 0.08 + h * 0.96, lz(s.z));
        parts.push(roof);
      } else {
        /* A TREE, WITH A TRUNK UNDER IT. Thinned, because the autumn and dusk
           islands carry 180 each and a model of a forest is a green disc either
           way — every third one keeps the canopy legible and the merge cheap.
           The trunk is four more triangles and it is the difference between a
           tree and a green cone. */
        if ((trees++) % 3) continue;
        const h = Math.max(0.12, s.r * 3.4 * K);
        parts.push(cylAt(rr * 0.5, rr * 0.6, h * 0.4, 0x6b4a34,
          lx(s.x), 0.08 + h * 0.2, lz(s.z), 4));
        parts.push(coneAt(Math.max(0.05, rr * 2.4), h * 0.85, pal.grassDark,
          lx(s.x), 0.08 + h * 0.6, lz(s.z), 5));
      }
    }

    /* --- the bamboo, where the bamboo really is --------------------------
       "Can add some low poly bamboo or trees even to make replica look
       similar." `world.groves` is the list the canes are actually planted from
       — the same one the ending's camera uses to find the forest it opens on —
       so the two stands on the model are the two stands the girls walked to.
       Ten canes each rather than eighty: at this scale a cane is a hair, and
       what the eye is reading is that there is a green patch out past the
       crossing with something growing in it. */
    for (const grove of this.world.groves ?? []) {
      if (!inside(grove.x, grove.z)) continue;
      const n = 10;
      for (let i = 0; i < n; i++) {
        const a = i * 2.39996;
        const rr = Math.sqrt((i + 0.5) / n) * grove.r * K * 0.8;
        const h = 5.5 * K;
        parts.push(cylAt(0.16 * K, 0.2 * K, h, 0x7bb05a,
          lx(grove.x) + Math.cos(a) * rr, 0.08 + h / 2, lz(grove.z) + Math.sin(a) * rr, 4));
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
        const lift = Math.sin(u * Math.PI) * (span * 0.24 + 0.18)
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
    const FWD = new THREE.Vector3(0, 0, 1);
    const home = (isl) => new THREE.Vector3(isl.near.x, isl.nearY, isl.near.z);
    let gi = 0;
    for (const sp of spans) {
      const total = sp.curve.getLength();
      const seg = total / BR_SLATS;
      for (let i = 0; i < BR_SLATS; i++) {
        const u = (i + 0.5) / BR_SLATS;
        sp.curve.getPointAt(u, pos);
        sp.curve.getTangentAt(u, tan);
        q.setFromUnitVectors(FWD, tan.normalize());
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
        q.setFromUnitVectors(FWD, tan.normalize());
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

  /**
   * The red bridge, in the model, as one merged mesh.
   *
   * ITS LENGTH IS THE REAL ONE'S. `18 * scaleK` is the world's span through the
   * model's own scale, floored at two units so that a very large world cannot
   * shrink the one landmark the beat ends on down to nothing again.
   *
   * ALONG X, because `_stepBridge` already says the deck is the x axis and the
   * two have to agree — the kittens who run it full-size and the kittens who
   * land on it here are reading the same fact about the same bridge.
   */
  _miniSpanGeo() {
    const len = Math.max(2.0, 18 * this.scaleK);
    const W = BR_W * 1.3;
    const T = BR_T;
    const N = 11;
    const rise = Math.min(len * 0.17, W * 1.5);
    const parts = [];
    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N;
      const x = (u - 0.5) * len;
      /* THE ARCH, which is the silhouette that says taiko-bashi and not plank.
         Built as eleven flat slats stepped up a sine rather than as a curved
         surface: it is the same trick the spans use and it merges to 264
         triangles. */
      const y = Math.sin(u * Math.PI) * rise;
      parts.push(boxAt(len / N * 1.06, T, W, 0xd8482f, x, y, 0));
      parts.push(boxAt(len / N * 1.06, T * 2.4, T * 0.6, 0xf0c14b, x, y + T * 1.6, -W * 0.5));
      parts.push(boxAt(len / N * 1.06, T * 2.4, T * 0.6, 0xf0c14b, x, y + T * 1.6, W * 0.5));
    }
    /* A TORII AT EACH END, standing on the land the deck starts from. */
    for (const s of [-1, 1]) {
      const x = s * len * 0.5;
      const h = W * 1.6;
      parts.push(boxAt(T * 0.7, h, T * 0.7, 0xd8482f, x, h / 2, -W * 0.62));
      parts.push(boxAt(T * 0.7, h, T * 0.7, 0xd8482f, x, h / 2, W * 0.62));
      parts.push(boxAt(T * 1.0, T * 0.9, W * 2.0, 0xe8623f, x, h, 0));
      parts.push(boxAt(T * 0.8, T * 0.6, W * 1.6, 0xf0c14b, x, h * 0.82, 0));
    }
    const geo = mergeParts(parts);
    for (const g of parts) g.dispose();
    return geo;
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
      this.kits.push({
        mini, big, cheer, colour: PLAYER_STYLE[i].colour, i,
        seed: (i / PLAYER_STYLE.length) * TAU, from: null, to: null, k: 0, hop: 0,
        ring, ringMat,
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
    const rng = (r) => r[0] + Math.random() * r[1];
    for (let i = 0; i < this.kits.length; i++) {
      const k = this.kits[i];
      /* SPREAD ACROSS THE DECK, AND NOT IN A RULED LINE. Four cats abreast on
         a 4.4-unit bridge is a wall, so the lanes are still dealt out by index
         — that part has to stay spread or they overlap — but the wobble on top
         of it is what stops four evenly spaced cats reading as a formation. */
      k.lane = (i - (this.kits.length - 1) / 2) * 1.1 + (Math.random() - 0.5) * 0.55;
      k.k = rng(BR_HEAD);
      /* EVERY TIMER STARTS PART-USED. A kitten whose first jump is a full gap
         away spends the opening of the shot walking, and the opening of the
         shot is the only part of it the fade is coming up on. */
      k.hopT = 0;
      k.hopFor = 0;
      k.hopH = 0;
      k.hopWait = Math.random() * HOP_GAP[1] * 0.5;
      k.actT = 0;
      k.actFor = 0;
      k.act = null;
      k.actWait = Math.random() * ACT_GAP[1];
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
  _stepModel(dt, camera) {
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
    const shake = P === 'isles-in'
      ? Math.min(1, settled / 1.4) * 0.16 * on
      : (drifting ? (1 - dk) * 0.16 : 0);
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
    if (this.phase !== 'bridge-run' || !b) {
      for (const k of this.kits) if (k.ring) k.ring.visible = false;
      return;
    }
    const rng = (r) => r[0] + Math.random() * r[1];
    for (const k of this.kits) {
      /* --- the jumps, which are now a schedule and not a waveform --------
         It was `sin(u * 3.1 + seed)`: exactly three hops each, evenly spaced,
         at one height, for the whole crossing. Offset per kitten, so it did not
         read as a chorus line — but it did read as four metronomes, which is
         the same note the crash sounds got. "Jumping randomly, multiple times,
         with random pauses between jumps, to show they are having random/
         chaotic fun."

         A TIMER PER KITTEN, REROLLED AT EVERY LANDING. Height is rolled with the
         jump, so a run of hops is a small one, a big one and a middling one
         rather than three of the same. */
      if (k.hopT > 0) {
        k.hopT -= dt;
      } else {
        k.hopWait -= dt;
        if (k.hopWait <= 0) {
          k.hopFor = rng(HOP_DUR);
          k.hopT = k.hopFor;
          k.hopH = 1.1 + Math.random() * 1.5;
          k.hopWait = rng(HOP_GAP);
          /* A SMASH IS A JUMP THAT MEANT IT, so the two schedules agree: if she
             is mid-Smash when she takes off, she takes off higher. */
          if (k.act === 'smash') k.hopH *= 1.5;
        }
      }
      const hop = k.hopT > 0 && k.hopFor > 0
        ? Math.sin((1 - k.hopT / k.hopFor) * Math.PI) * k.hopH
        : 0;

      /* --- and what she is doing with her paws --------------------------- */
      if (k.actT > 0) {
        k.actT -= dt;
        if (k.actT <= 0) k.act = null;
      } else {
        k.actWait -= dt;
        if (k.actWait <= 0) {
          k.act = BR_ACTS[Math.floor(Math.random() * BR_ACTS.length)];
          k.actFor = rng(ACT_DUR);
          k.actT = k.actFor;
          k.actWait = rng(ACT_GAP);
        }
      }
      const ae = k.actFor > 0 ? 1 - Math.max(0, k.actT) / k.actFor : 1;

      /* THE DASH IS THE ONE THAT MOVES HER, so it is added to the rate rather
         than drawn: an ability that only changed the pose would be a costume,
         and this one is about covering ground. */
      k.k += dt * BR_RATE * (k.act === 'dash' ? 3.2 : 1);
      const u = k.k;
      if (u < 0 || u > 1.35) {
        k.big.bb.visible = false;
        /* AND SHE LEAVES THE SHOT THE SHAPE SHE ARRIVED IN. A kitten who ran
           off the end mid-Dash kept the squash, and the next thing that draws
           her is the arena. */
        k.big.bb.mesh.scale.set(1, 1, 1);
        if (k.ring) k.ring.visible = false;
        continue;
      }
      k.big.bb.visible = true;
      /* ALONG THE DECK, which is the x axis — the span is 18 units of arch on
         x and 4.4 wide on z, and `world.bridge` is its crest. */
      const x = b.x - 16 + u * 32;
      const arch = Math.cos(Math.max(-1, Math.min(1, (x - b.x) / 9)) * Math.PI / 2);
      const y = b.y - 2.2 + arch * 2.2;
      k.big.bb.position.set(x, y + hop, b.z + k.lane);
      k.big.bb.facing = Math.PI / 2;
      /* THE ATTACK ROW IS THE SWORD, and three of the four flourishes use it —
         a swing, a Smash and a Dash all look like a cat with a katana out, and
         the game has one drawing of that. A one-row atlas collapses every row
         to 0 and the shot still plays; see `Billboard._setCell`. */
      k.big.bb.row = k.act && k.act !== 'orb' ? 3 : (hop > 0.25 ? 2 : 1);
      k.big.bb.frame = Math.floor(this.t * 11 + k.seed) % Math.max(1, k.big.bb.cols);
      k.big.bb.mat.opacity = 1;
      /* STRETCHED INTO THE DASH. One number, and it is the only motion blur a
         billboard can afford. */
      k.big.bb.mesh.scale.set(k.act === 'dash' ? 1.22 : 1,
        k.act === 'dash' ? 0.86 : 1, 1);

      /* --- the ring, for the two abilities that throw one ---------------- */
      if (!k.ring) continue;
      const ringy = k.act === 'orb' || k.act === 'smash';
      k.ring.visible = ringy && k.actT > 0;
      if (k.ring.visible) {
        const grow = k.act === 'smash' ? 0.8 + ae * 3.4 : 0.5 + ae * 1.5;
        k.ring.scale.set(grow, 1, grow);
        /* THE SMASH'S RING IS ON THE DECK UNDER HER AND THE ORB'S RISES PAST
           HER HEAD, which is the difference between the two abilities in one
           coordinate. */
        k.ring.position.set(x, k.act === 'smash' ? y + 0.06 : y + 1.1 + ae * 1.6,
          b.z + k.lane);
        k.ringMat.opacity = (1 - ae) * 0.85;
      }
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
