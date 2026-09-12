import * as THREE from 'three';
import { Billboard } from '../core/gfx.js';
import { PLAYER_STYLE } from '../core/palette.js';

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

   @see docs/notes/story.md, src/systems/summonscene.js (FINALE_SHOTS)
--------------------------------------------------------------------------- */

/** How big the model of the world is, across the Dojo floor. The painted
 *  circle is 24 units to the radius, so this sits comfortably inside it and
 *  the lesson's own lines stay readable underneath. */
const MINI_R = 16;
/** ...and how far above the floor it floats. High enough to read as a model
 *  rather than as paint, low enough that the circle is still behind it. */
const MINI_Y = 3.2;
/** How tightly the islands are huddled before they drift — a fraction of the
 *  way from where they belong toward the middle. "Next to each other." */
const HUDDLE = 0.17;
/** Seconds the drift takes, and how far past their marks they overshoot
 *  before settling. It is an explosion that calms down, not a slide. */
const DRIFT = 2.1;
const OVERSHOOT = 1.13;
/** A tiny kitten's drawn height in the model, and on the bridge. */
const MINI_H = 1.5;
const REAL_H = 2.9;

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

function lineGeo(n) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  return g;
}

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
    this._drivers = [];
    this._disposables = [];
    this.running = false;
    this.phase = null;
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
   * The model of the archipelago that assembles itself on the Dojo floor.
   *
   * IT IS THE REAL MAP, SHRUNK. Every disc is one of `world.islands` at its own
   * position and its own radius, scaled by one number — so the shape the girls
   * see turning on the floor is the shape of the place they spent the afternoon
   * in, and the one that has a bridge on it is the one they are about to be
   * standing on. A prettier invented constellation would have been easier and
   * would have been a lie in the middle of a lesson.
   */
  _buildModel() {
    this.model = new THREE.Group();
    this.model.visible = false;
    this.group.add(this.model);

    const isls = (this.world.islands ?? []).filter((i) => i.kind !== 'arena');
    if (!isls.length) return;
    const R = Math.max(1, ...isls.map(
      (i) => Math.hypot(i.x, i.z) + (i.radius ?? 10)
    ));
    this.scaleK = MINI_R / R;
    const c = this.world.dojoCentre ?? new THREE.Vector3();
    this.model.position.set(c.x, c.y + MINI_Y, c.z);

    const mat = this._keep(new THREE.MeshBasicMaterial({
      color: 0x8fd08a, transparent: true, opacity: 0, toneMapped: false,
    }));
    const rim = this._keep(new THREE.MeshBasicMaterial({
      color: 0x6a4a3a, transparent: true, opacity: 0, toneMapped: false,
    }));
    this.modelMats = [mat, rim];

    for (const isl of isls) {
      const r = Math.max(0.6, (isl.radius ?? 10) * this.scaleK);
      const g = new THREE.Group();
      const top = new THREE.Mesh(
        this._keep(new THREE.CylinderGeometry(r, r * 0.96, 0.16, 14)), mat
      );
      const under = new THREE.Mesh(
        this._keep(new THREE.ConeGeometry(r * 0.96, r * 1.1, 14)), rim
      );
      under.position.y = -r * 0.62;
      under.rotation.x = Math.PI;
      g.add(top);
      g.add(under);
      const home = new THREE.Vector3(isl.x * this.scaleK, 0, isl.z * this.scaleK);
      g.position.copy(home).multiplyScalar(HUDDLE);
      this.model.add(g);
      this.isles.push({ g, home, r, kind: isl.kind, seed: Math.random() * TAU });
    }

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

    /* --- the two pictures she names, drawn and nothing else ---------------
       "Can actually show representations of an angle... and also a circular
       image." They are the Dojo's own two shapes, in the Dojo's own thin line,
       hanging over the model while the word is being said. */
    this.angleFx = new THREE.Group();
    this.angleFx.visible = false;
    this.angleMat = this._lineMat(0xffd76a, 0);
    this.angleArm = new THREE.Line(this._keep(lineGeo(2)), this.angleMat);
    this.angleBase = new THREE.Line(this._keep(lineGeo(2)), this.angleMat);
    this.angleArc = new THREE.Line(this._keep(lineGeo(24)), this.angleMat);
    this.angleFx.add(this.angleArm, this.angleBase, this.angleArc);
    this.model.add(this.angleFx);

    this.circleMat = this._lineMat(0x8fe0ff, 0);
    this.circleFx = new THREE.LineLoop(this._keep(ringGeo(64)), this.circleMat);
    this.circleFx.visible = false;
    this.model.add(this.circleFx);
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
   * The little cast: one kitten per style, a dragon each, and Mr Satan.
   *
   * BY STYLE AND NOT BY SEAT, exactly as `Game.warpArt` and the rest are built.
   * The ending plays at two players as often as at four, and a model of the
   * world with two cats in it while she says "you crossed" to four of them
   * would be the scene disagreeing with the room.
   */
  _buildCast() {
    const sheets = this.cast?.kittens ?? [];
    for (let i = 0; i < PLAYER_STYLE.length; i++) {
      const a = sheets[i];
      if (!a?.texture) continue;
      const mini = this._mkFig(a, MINI_H);
      this.model?.add(mini.bb);
      const big = this._mkFig(a, REAL_H);
      this.group.add(big.bb);
      this.kits.push({
        mini, big, colour: PLAYER_STYLE[i].colour, i,
        seed: (i / PLAYER_STYLE.length) * TAU, from: null, to: null, k: 0, hop: 0,
      });
    }

    /* THE RUNNER IS ONE OF THEM, FULL SIZE, ON THE PAINTED CIRCLE — she is a
       kitten walking the rim of the Dojo, which is the thing the island is
       for. She also IS the lesson's driver; see `drivers()`. */
    const first = sheets.find((a) => a?.texture);
    if (first) {
      const fig = this._mkFig(first, REAL_H);
      this.group.add(fig.bb);
      const c = this.world.dojoCentre ?? new THREE.Vector3();
      this.runner = { ...fig, on: false, a: 0.4, centre: c.clone() };
      this._drivers = [{ position: new THREE.Vector3(), mount: null }];
    }

    const dragon = this.cast?.dragon;
    if (dragon?.texture) {
      for (let i = 0; i < 2; i++) {
        const d = this._mkFig(dragon, MINI_H * 1.8, { mirror: false });
        d.bb.visible = false;
        this.model?.add(d.bb);
        this.drags.push({ ...d, seed: i * Math.PI, riding: null });
      }
    }

    const satan = this.cast?.satan;
    if (satan?.texture) {
      const s = this._mkFig(satan, REAL_H * 2.1);
      s.bb.visible = false;
      this.group.add(s.bb);
      this.satan = s;
    }
  }

  _mkFig(art, height, over = {}) {
    const bb = new Billboard(art.texture, {
      cols: art.cols ?? 1,
      rows: art.rows ?? 1,
      width: height,
      height,
      mirror: (art.cols ?? 1) <= 4 && (art.rows ?? 1) === 1,
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
    return { bb, height };
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
    for (let i = 0; i < this.drags.length; i++) {
      const d = this.drags[i];
      d.riding = this.kits[this.kits.length - 1 - i] ?? null;
      d.bb.visible = true;
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
    for (const d of this.drags) d.bb.visible = false;
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

  /** Everybody, in the ring, with the champion. */
  _seedArena() {
    const R = this.world?.arenaRing;
    for (let i = 0; i < this.kits.length; i++) {
      const k = this.kits[i];
      const a = Math.PI + (i - (this.kits.length - 1) / 2) * 0.42;
      const rr = (R?.half ?? 14) * 0.5;
      k.stand = R
        ? new THREE.Vector3(R.x + Math.sin(a) * rr, R.y, R.z + Math.cos(a) * rr)
        : null;
      k.big.bb.visible = !!k.stand;
    }
    if (this.satan && R) {
      this.satan.bb.position.set(R.x, R.y, R.z - (R.half ?? 14) * 0.42);
      this.satan.bb.visible = true;
    }
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
    for (const k of this.kits) k.big.bb.visible = false;
    if (this.satan) this.satan.bb.visible = false;

    this._stepRings(dt);
    this._stepRunner(dt);
    this._stepModel(dt);
    this._stepBridge(dt);
    this._stepArena(dt);

    if (camera) {
      for (const k of this.kits) {
        if (k.mini.bb.visible) k.mini.bb.faceCamera(camera);
        if (k.big.bb.visible) k.big.bb.faceCamera(camera);
      }
      for (const d of this.drags) if (d.bb.visible) d.bb.faceCamera(camera);
      if (this.runner?.bb.visible) this.runner.bb.faceCamera(camera);
      if (this.satan?.bb.visible) this.satan.bb.faceCamera(camera);
    }
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
    const want = this.phase === 'dojo-run';
    /* SHE FADES OUT RATHER THAN CUTTING. "We can have the player and sin/cos
       fade away and then show in the Dojo... small virtual versions of the
       islands appear." The lesson under her fades with her all by itself: with
       no driver in range `MathDojo` falls back to its own slow idle turn, so
       the diagram keeps turning and simply stops being about anybody. */
    const fadeOut = Math.max(0, 1 - this.phaseT / 0.6);
    if (!want && fadeOut <= 0.02) { r.bb.visible = false; r.on = false; return; }

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
    const fade = want ? Math.min(1, this.phaseT / 0.5) : fadeOut;
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
    const showing = P.startsWith('isles-');
    const on = showing ? Math.min(1, this.phaseT / 0.6) : 0;
    for (const m of this.modelMats) m.opacity = on * 0.95;
    this.model.visible = on > 0.02;
    if (!this.model.visible) {
      for (const k of this.kits) k.mini.bb.visible = false;
      for (const d of this.drags) d.bb.visible = false;
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
       at once or the islands look like they are vibrating in flight. */
    const shake = P === 'isles-in'
      ? Math.min(1, this.phaseT / 1.1) * 0.16
      : (1 - dk) * 0.16;
    for (const isl of this.isles) {
      /* An overshoot that settles: out past the mark and back, on one curve,
         so nothing has to remember whether it is coming or going. */
      const e = 1 - (1 - dk) * (1 - dk) * (1 - dk);
      const over = 1 + (OVERSHOOT - 1) * Math.sin(Math.min(1, dk) * Math.PI);
      const f = HUDDLE + (over - HUDDLE) * e;
      const sx = Math.sin(this.t * 31 + isl.seed) * shake;
      const sz = Math.cos(this.t * 27 + isl.seed * 1.7) * shake;
      isl.g.position.set(
        isl.home.x * f + sx,
        Math.sin(this.t * 0.7 + isl.seed) * 0.12 * dk,
        isl.home.z * f + sz
      );
    }

    /* --- the little ones, crossing --------------------------------------- */
    const crossing = P === 'isles-cross' || P === 'isles-angle' || P === 'isles-circle';
    const leaping = P === 'isles-leap' || P === 'isles-bridge';
    for (const k of this.kits) {
      const bb = k.mini.bb;
      bb.visible = crossing || leaping;
      if (!bb.visible) continue;
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
      if (!d.bb.visible) continue;
      const r = d.riding;
      d.bb.row = 0;
      if (r?.mini.bb.visible) {
        d.bb.position.copy(r.mini.bb.position);
        d.bb.position.y -= 0.35;
        d.bb.facing = r.mini.bb.facing;
      }
    }

    this._stepShapes();
  }

  /** The angle and the circle, over the model, while the words are said. */
  _stepShapes() {
    const P = this.phase;
    const ang = P === 'isles-angle' ? Math.min(1, this.phaseT / 0.4) : 0;
    const cir = P === 'isles-circle' ? Math.min(1, this.phaseT / 0.4) : 0;
    if (this.angleFx) {
      this.angleFx.visible = ang > 0.02;
      this.angleMat.opacity = ang;
      if (this.angleFx.visible) {
        /* A REAL ANGLE, SWEPT — the same picture the Dojo paints on the floor
           below it: a base along +x, an arm out at theta, and the arc between
           them. It is the lesson's own shape, which is the only reason it is
           allowed to be in this scene at all. */
        const th = 0.35 + Math.sin(this.t * 0.8) * 0.55 + 0.9;
        const L = MINI_R * 0.75;
        const y = 2.6;
        this._setLine(this.angleBase, [0, y, 0, L, y, 0]);
        this._setLine(this.angleArm, [0, y, 0, Math.cos(th) * L, y, Math.sin(th) * L]);
        const pts = [];
        for (let i = 0; i < 24; i++) {
          const a = (i / 23) * th;
          pts.push(Math.cos(a) * L * 0.32, y, Math.sin(a) * L * 0.32);
        }
        this._setLine(this.angleArc, pts);
      }
    }
    if (this.circleFx) {
      this.circleFx.visible = cir > 0.02;
      this.circleMat.opacity = cir;
      const s = MINI_R * (0.55 + 0.35 * (1 - (1 - cir) * (1 - cir)));
      this.circleFx.position.y = 2.6;
      this.circleFx.scale.set(s, 1, s);
    }
  }

  _setLine(line, nums) {
    const p = line.geometry.attributes.position;
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
      k.k += dt * 0.30;
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
      k.big.bb.mesh.scale.setScalar(1);
    }
  }

  /** Everybody in the ring with the champion, which is where they are going. */
  _stepArena(dt) {
    if (this.phase !== 'arena-in') return;
    if (this.satan) this.satan.bb.visible = !!this.satan.bb.position.lengthSq();
    for (const k of this.kits) {
      if (!k.stand) continue;
      k.big.bb.visible = true;
      /* THEY ARRIVE RATHER THAN BEING THERE. A quarter of a second of drop and
         a bounce reads as "teleported near him", which is what was asked for,
         and it is also the only motion in a shot that is otherwise a group
         photograph. */
      const u = Math.min(1, this.phaseT / 0.55);
      const drop = (1 - u) * 9 + Math.abs(Math.sin(u * Math.PI * 2)) * (1 - u) * 2;
      k.big.bb.position.set(k.stand.x, k.stand.y + drop, k.stand.z);
      k.big.bb.facing = Math.PI;
      k.big.bb.row = u < 1 ? 2 : 0;
      k.big.bb.frame = Math.floor(this.t * 7 + k.seed) % Math.max(1, k.big.bb.cols);
      k.big.bb.mesh.scale.setScalar(1);
    }
    void dt;
  }
}
