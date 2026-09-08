import * as THREE from 'three';
import { Label } from '../core/label.js';

/* ---------------------------------------------------------------------------
   THE LESSON BEHIND PATCHFUR AT THE ENDING.

   Reported as *"the cutscene is a little boring currently — maybe she can show
   some math type lessons here, as if she is going into a Magical Math lesson,
   combining what we learned from destroying everything and reuniting the
   worlds"*, with Bugenhagen's planetarium named as the reference. This is that
   scene's second half: four figures drawn behind her, one per beat, each one
   illustrating the line she is actually saying.

   IT DRAWS THE SCRIPT SHE ALREADY HAS. Deliberately — the script and the
   recording are unchanged, so this cost nothing to try and nothing to undo,
   and every figure is anchored to words she is already speaking:

     1. "Every barrel. Every lantern. Every last cane of bamboo."
            -> one stroke per knockable thing in the world, struck through as
               she names them. The count is the world's own count.
     2. "A tidy town is only one way for a town to be. Every other way is the
        rest of them."
            -> the same strokes snap into a lattice, hold for a beat, and
               scatter. One arrangement, then the rest of them.
     3. "An angle, a circle, and the nerve to jump — that is all a bridge has
        ever been."
            -> the unit circle, with the radius arm sweeping through theta, the
               cosine and sine legs drawn off it, and the chord it subtends
               spanning two islands. THE BRIDGE IS THE CHORD. Its length is
               2r*sin(theta/2) and it is drawn at that length, so the span
               grows as she talks and closes as the angle closes.
     4. "The arena is open."
            -> the circle tightens into the ring.

   NOTHING HERE IS DECORATIVE TRIG. Non-negotiable #1 is that the maths is the
   point and not a bolt-on, and the test that keeps this honest is the same one
   the Kotodama Orb passes: every position on screen is computed from the two
   numbers printed beside it. A figure that drew a pretty circle and printed an
   unrelated angle would be worse than no figure, and `world-check` measures the
   drawn points against `Math.cos`/`Math.sin` rather than checking the labels
   exist.

   THE MARKS ARE ONE `LineSegments`, REUSED. 216 strokes is 432 vertices, and
   they are rewritten in place every frame — one draw call, one buffer, no
   allocation. The alternative (a quad per mark) is 216 objects, and the reason
   this matters is `performance.md`: this scene runs on a phone with the whole
   archipelago in shot.

   IT IS PARKED IN FRONT OF THE LENS, like Patchfur herself. The finale's
   camera pulls back until the world is a detail, so anything standing in the
   world would be a speck. See `SummonScene._parkStage` — this uses the same
   solve, at a further distance so she reads as standing in front of it.
--------------------------------------------------------------------------- */

/** How much further out than the speaker the figure sits. She is a cut-out in
 *  front of it, so this is what makes the scene read as having depth at all. */
const FAR = 1.62;
/** Where it sits in the frame, as a fraction of the frame's own height —
 *  LEFT of centre, because she stands right of centre. Fractions and not units
 *  for the same reason `_parkStage` uses them: the lens may change. */
const AT_X = -0.21;
const AT_Y = 0.13;
/** The figure's radius, also a fraction of the frame height.
 *
 *  MEASURED AGAINST THE TWO THINGS THAT OWN THE SCREEN, not chosen. The scene
 *  is letterboxed — the top bar cuts in at about 0.42 of the half-frame — and
 *  the dialogue box owns everything below about -0.15 of it. `AT_Y + SIZE`
 *  has to clear the first and `AT_Y - SIZE` may only just cross the second,
 *  because the box is drawn over the top of it anyway. The first take had the
 *  circle's crown behind the letterbox. */
const SIZE = 0.23;

/** Seconds a beat's figure takes to become the next one. Long: the whole point
 *  is that a nine-year-old watches the strokes travel rather than seeing that
 *  they have arrived. */
const MORPH = 2.4;

/* --- what each beat's arrangement IS -------------------------------------- */
export const FIGURES = ['scatter', 'lattice', 'circle', 'ring'];

/** Where the arena ring sits, as a fraction of `SIZE`. */
const RING_R = 0.62;

/**
 * Half the length of one stroke, per figure.
 *
 * THE LATTICE NEEDS A SHORTER MARK THAN ANYTHING ELSE, and finding out why is
 * the only interesting thing in this constant. 216 marks is a 15x15 grid, so
 * the rows are 0.123 apart — and a stroke 0.075 long each way is 0.15 tall,
 * taller than the gap. Every column fused into one continuous vertical line
 * and the tidy town came out as a barcode. The strokes have to be shorter than
 * the lattice is fine, which is a statement about the count and would change
 * if the world grew, so it is derived below rather than typed here twice.
 */
const STROKE = { scatter: 0.075, lattice: 0.040, circle: 0.075, ring: 0.075 };

const TAU = Math.PI * 2;

/**
 * A deterministic 0..1 from an integer. The strokes must land in the same
 * places every time the scene plays — a scatter that is different on every run
 * is a scatter nobody can film, and the Help clips are filmed out of the
 * running game.
 */
function rnd(i, salt = 0) {
  let h = (i * 374761393 + salt * 668265263) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177 >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class FinaleLesson {
  /**
   * @param {THREE.Scene} scene the GAME's scene — this is drawn by
   *   `_renderView(summonScene.camera)`, exactly like the speaker's quad, and a
   *   lesson added to a scene nobody renders is a scene where every check
   *   passes and nothing is on screen. Null is allowed and the figure is still
   *   BUILT: `world-check` measures the real geometry without a renderer, and
   *   a class that threw on a missing scene could only ever be checked by
   *   reading its source.
   * @param {number} marks how many knockable things the world has. The world's
   *   own number, not 216 written down twice.
   */
  constructor(scene, marks = 216) {
    this.scene = scene;
    this.n = Math.max(8, Math.min(400, marks | 0));
    this.group = new THREE.Group();
    this.group.visible = false;
    this.group.renderOrder = 12;
    scene?.add(this.group);

    this.beat = 0;
    this.morph = 1;      // 0 = still leaving the last figure, 1 = arrived
    this.theta = 0;
    this.t = 0;

    /* --- the marks ---------------------------------------------------------
       One short stroke each. `frustumCulled` off on everything here: the
       bounding spheres are computed once and the group is moved in front of a
       camera that is somewhere else entirely, so three.js would cull the whole
       figure on the frame it is needed. Same reason the orb's arc does it. */
    const seg = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.n * 6);
    seg.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    /* DEPTH-TESTED, WHICH IS WHAT PUTS IT BEHIND HER. Everything else parked
       in front of a lens in this game turns depth testing OFF, because it is
       drawn over a world it is not part of — and doing that here draws the
       diagram over PATCHFUR, who is the person the scene is about. She is
       parked at 12.8 units and writes depth; this sits at 20.7 and the world
       is two hundred further, so one flag gets both answers: she occludes it,
       and it occludes nothing. `depthWrite` stays off — these are transparent
       lines and they must not hide each other. */
    this.marks = new THREE.LineSegments(seg, new THREE.LineBasicMaterial({
      color: 0xf5c341, transparent: true, opacity: 0.9,
      depthTest: true, depthWrite: false, toneMapped: false,
    }));
    this.marks.renderOrder = 13;
    this.marks.frustumCulled = false;
    this.group.add(this.marks);

    /* --- the diagram, which only beat 3 shows ------------------------------
       The same three colours the plain Kotodama Orb uses, on purpose: a kid who
       has spent the afternoon with an orb orbiting her knows which line is the
       cosine before anybody says so. */
    this.diagram = new THREE.Group();
    this.diagram.visible = false;
    this.group.add(this.diagram);

    const line = (c, n = 2, opacity = 0.95) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({
        color: c, transparent: true, opacity,
        depthTest: true, depthWrite: false, toneMapped: false,
      }));
      l.renderOrder = 14;
      l.frustumCulled = false;
      this.diagram.add(l);
      return l;
    };
    this.lineR = line(0x7fe3ff);            // the radius arm
    this.lineCos = line(0xffb347);          // adjacent  -> cos
    this.lineSin = line(0x8bff9a);          // opposite  -> sin
    /* THE BRIDGE IS A QUAD AND NOT A LINE, and that is a WebGL fact rather
       than a style choice: `linewidth` on `LineBasicMaterial` is ignored by
       every desktop WebGL implementation, so every line in this figure is one
       pixel wide whatever it asks for. The chord is the thing the beat is
       about — "that is all a bridge has ever been" — and one pale pixel is not
       it. A unit-long plane along +X, then positioned, turned and scaled to
       the chord it is drawing, so the geometry is still the maths. */
    this.span = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0),
      new THREE.MeshBasicMaterial({
        color: 0xe0512c, transparent: true, opacity: 1,
        depthTest: true, depthWrite: false, toneMapped: false,
        side: THREE.DoubleSide,
      })
    );
    this.span.renderOrder = 14;
    this.span.frustumCulled = false;
    this.diagram.add(this.span);
    /* The swept arc, allocated full length and drawn short — the orb's trick,
       and for the same reason: the arc grows every frame and rebuilding its
       buffer is a create/destroy cycle per frame. */
    this.arc = line(0xffe27a, 65);
    this.arc.geometry.setDrawRange(0, 2);

    /* The two islands the chord spans. Rings rather than discs, so the strokes
       behind them stay visible — a solid island would hide the circle that is
       the whole point of the figure. */
    const isle = () => {
      const pts = [];
      for (let i = 0; i <= 40; i++) {
        pts.push(Math.cos((i / 40) * TAU), Math.sin((i / 40) * TAU), 0);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({
        color: 0xe0512c, transparent: true, opacity: 0.9,
        depthTest: true, depthWrite: false, toneMapped: false,
      }));
      l.renderOrder = 14;
      l.frustumCulled = false;
      this.diagram.add(l);
      return l;
    };
    this.isleA = isle();
    this.isleB = isle();

    /* `live` on all four, because all four are rewritten from theta every
       frame. Through the shared cache that is one never-freed canvas per
       distinct value — the leak that crashed the Dojo, and the reserve is the
       widest string each can reach. See `Label`'s `_live`. */
    const lbl = (text, live, color) => {
      /* HEIGHT IS IN FIGURE UNITS, and the figure is scaled to about a third
         of the frame — so 0.9 here was five world units of text, more than half
         the screen, and the first take had SIN θ = 0.87 written across
         Patchfur's face. 0.14 is roughly 3% of the frame's height, which is the
         same share the orb's own readout takes beside a kitten. */
      const l = new Label(text, {
        height: 0.22, size: 72, color, stroke: '#2a1c06', strokeWidth: 8,
        live,
      });
      l.renderOrder = 20;
      this.diagram.add(l);
      return l;
    };
    this.lblTheta = lbl('θ', 'θ 360°', '#ffe27a');
    this.lblCos = lbl('cos', 'cos θ = -0.00', '#ffb347');
    this.lblSin = lbl('sin', 'sin θ = -0.00', '#8bff9a');
    this.lblSpan = lbl('span', 'the bridge is 2.00 wide', '#ffd8c6');

    this._from = new Float32Array(this.n * 3);   // x, y, angle
    this._to = new Float32Array(this.n * 3);
    this._fill(this._to, FIGURES[0]);
    this._from.set(this._to);
    this._lenFrom = STROKE[FIGURES[0]];
    this._lenTo = this._lenFrom;

    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  /**
   * Where one mark stands in a named figure, in figure-local units (the
   * figure's radius is 1).
   *
   * ALL FOUR ARE PLACED BY THE SAME TWO FUNCTIONS the orb uses. That is the
   * whole design: `circle` is literally `(cos φ, sin φ)`, `ring` is the same at
   * a smaller radius, `lattice` is a square grid, and `scatter` is a hash. A
   * figure whose points did not come out of cos and sin would be the decorative
   * version of this scene, which is the version that is not allowed.
   */
  _fill(out, figure) {
    const n = this.n;
    const cols = Math.ceil(Math.sqrt(n));
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      if (figure === 'circle' || figure === 'ring') {
        const r = figure === 'ring' ? RING_R : 1;
        const phi = (i / n) * TAU;
        out[k] = Math.cos(phi) * r;
        out[k + 1] = Math.sin(phi) * r;
        // Tangent, so the strokes read as a rim rather than as a hedgehog.
        out[k + 2] = phi + Math.PI / 2;
      } else if (figure === 'lattice') {
        const gx = i % cols;
        const gy = (i / cols) | 0;
        out[k] = ((gx / (cols - 1)) - 0.5) * 1.72;
        out[k + 1] = ((gy / (cols - 1)) - 0.5) * 1.72;
        out[k + 2] = Math.PI / 2;                    // every stroke upright
      } else {
        /* Scattered over a disc, evenly: sqrt on the radius, or everything
           bunches in the middle. Deterministic, so the scene is filmable. */
        const a = rnd(i, 1) * TAU;
        const r = Math.sqrt(rnd(i, 2)) * 1.05;
        out[k] = Math.cos(a) * r;
        out[k + 1] = Math.sin(a) * r * 0.72;         // a town is wider than tall
        out[k + 2] = rnd(i, 3) * TAU;
      }
    }
  }

  /** Open it. `marks` is the world's count and may have changed since boot. */
  start(marks) {
    if (marks) this.n = Math.max(8, Math.min(this.n, marks | 0));
    this.group.visible = true;
    this.beat = 0;
    this.morph = 1;
    this.t = 0;
    this.theta = 0;
    this._fill(this._to, FIGURES[0]);
    this._from.set(this._to);
    this._lenFrom = this._lenTo = this._stroke(FIGURES[0]);
    this.diagram.visible = false;
  }

  /**
   * Half a stroke, in figure units, for a named figure.
   *
   * THE LATTICE'S IS CAPPED BY ITS OWN ROW SPACING, not by the table. `STROKE`
   * is tuned for 216 marks; a world with 400 of them packs the rows closer and
   * the barcode comes back. Two fifths of the gap leaves three fifths of it
   * showing, which is what makes a grid of marks read as marks.
   */
  _stroke(figure) {
    const base = STROKE[figure] ?? 0.075;
    if (figure !== 'lattice') return base;
    const cols = Math.ceil(Math.sqrt(this.n));
    return Math.min(base, (1.72 / (cols - 1)) * 0.4);
  }

  /**
   * Move to the figure for beat `i`.
   *
   * THE MORPH RUNS FROM WHERE THE STROKES ACTUALLY ARE, not from the previous
   * figure's ideal — a beat skipped with the debug key would otherwise snap.
   */
  setBeat(i) {
    const want = Math.max(0, Math.min(FIGURES.length - 1, i | 0));
    if (want === this.beat && this.morph >= 1) return;
    this._from.set(this._live ?? this._from);
    this._lenFrom = this._lenLive ?? this._lenFrom;
    this.beat = want;
    this.morph = 0;
    this._fill(this._to, FIGURES[want]);
    this._lenTo = this._stroke(FIGURES[want]);
  }

  finish() {
    this.group.visible = false;
    this.diagram.visible = false;
  }

  dispose() {
    this.scene?.remove(this.group);
  }

  /**
   * @param dt seconds
   * @param camera the scene's own camera — this is parked in front of it
   * @param sceneT seconds since the scene opened, for the fade-in
   */
  update(dt, camera, sceneT = 0) {
    if (!this.group.visible || !camera) return;
    this.t += dt;
    this.morph = Math.min(1, this.morph + dt / MORPH);
    /* Ease both ends. A linear morph of 216 strokes reads as a machine moving
       them; this reads as them settling. */
    const m = this.morph < 0.5
      ? 2 * this.morph * this.morph
      : 1 - ((-2 * this.morph + 2) ** 2) / 2;

    // --- park it, in the speaker's own solve, further out ------------------
    const frame = 2 * Math.tan((camera.fov * Math.PI) / 360);
    const d = (13.05 / frame) * FAR;
    const h = frame * d;                       // the frame's height out there
    camera.getWorldDirection(this._fwd);
    this._right.crossVectors(this._fwd, this._up).normalize();
    this.group.position.copy(camera.position)
      .addScaledVector(this._fwd, d)
      .addScaledVector(this._right, AT_X * h)
      .addScaledVector(this._up, AT_Y * h);
    this.group.quaternion.copy(camera.quaternion);
    const R = SIZE * h;
    this.group.scale.setScalar(R);

    /* Fade in with her, and never at full strength: this is BEHIND the person
       talking and a diagram as bright as she is competes with her face. */
    const inK = Math.min(1, sceneT / 1.4);
    this.marks.material.opacity = 0.85 * inK;

    // --- the strokes -------------------------------------------------------
    this._live = this._live ?? new Float32Array(this.n * 3);
    const stroke = this._lenFrom + (this._lenTo - this._lenFrom) * m;
    this._lenLive = stroke;
    for (let i = 0; i < this.n; i++) {
      const k = i * 3;
      const x = this._from[k] + (this._to[k] - this._from[k]) * m;
      const y = this._from[k + 1] + (this._to[k + 1] - this._from[k + 1]) * m;
      /* THE SHORT WAY ROUND. Lerping raw angles sends a stroke at 350° all the
         way back through 180 to reach 10, so a third of the marks spin the
         wrong way across every morph — visible, and exactly the kind of thing
         that looks like a physics bug rather than an arithmetic one. */
      let da = this._to[k + 2] - this._from[k + 2];
      da = Math.atan2(Math.sin(da), Math.cos(da));
      const a = this._from[k + 2] + da * m;
      this._live[k] = x; this._live[k + 1] = y; this._live[k + 2] = a;

      const cx = Math.cos(a) * stroke;
      const cy = Math.sin(a) * stroke;
      const p = i * 6;
      this.pos[p] = x - cx; this.pos[p + 1] = y - cy; this.pos[p + 2] = 0;
      this.pos[p + 3] = x + cx; this.pos[p + 4] = y + cy; this.pos[p + 5] = 0;
    }
    this.marks.geometry.attributes.position.needsUpdate = true;

    // --- the diagram, on the bridge beat only ------------------------------
    const on = FIGURES[this.beat] === 'circle';
    this.diagram.visible = on && m > 0.35;
    if (!this.diagram.visible) return;
    this._drawCircle(dt, (m - 0.35) / 0.65);
  }

  /**
   * The unit circle, and the chord that is the bridge.
   *
   * EVERY NUMBER ON SCREEN PLACES SOMETHING ON SCREEN. `theta` sweeps; the arm
   * ends at `(cos, sin)`; the cosine leg runs along the axis to `cos` and the
   * sine leg rises from there to the point, which is the right triangle drawn
   * rather than asserted. The chord from `(1, 0)` to the point is the span, and
   * its length — printed — is `2 sin(theta/2)`, which is where the beat's
   * "an angle, a circle, and the nerve to jump" lands.
   */
  _drawCircle(dt, k) {
    /* It stops at three quarters of a turn rather than closing. A closed circle
       puts the far island back on top of the near one and the bridge vanishes
       at the moment the line is talking about crossing. */
    this.theta = Math.min(TAU * 0.75, this.theta + dt * 0.42);
    const th = this.theta;
    const c = Math.cos(th);
    const s = Math.sin(th);

    const set = (l, pts) => {
      const a = l.geometry.attributes.position.array;
      for (let i = 0; i < pts.length; i++) a[i] = pts[i];
      l.geometry.attributes.position.needsUpdate = true;
      l.material.opacity = k;
    };
    set(this.lineR, [0, 0, 0, c, s, 0]);
    set(this.lineCos, [0, 0, 0, c, 0, 0]);
    set(this.lineSin, [c, 0, 0, c, s, 0]);

    /* THE SPAN, FROM (1,0) TO THE POINT. Scaled to the chord's own length, so
       what is drawn and what is printed are the same number rather than two
       numbers that happen to agree. */
    const chordLen = Math.hypot(c - 1, s);
    this.span.position.set(1, 0, 0);
    this.span.rotation.z = Math.atan2(s, c - 1);
    this.span.scale.set(chordLen || 1e-4, 0.045, 1);
    this.span.material.opacity = k;

    // The swept arc, at a radius inside the circle so it does not sit on it.
    const arr = this.arc.geometry.attributes.position.array;
    const steps = Math.max(2, Math.min(65, 2 + Math.round((th / TAU) * 64)));
    for (let i = 0; i < steps; i++) {
      const a = (i / (steps - 1)) * th;
      arr[i * 3] = Math.cos(a) * 0.26;
      arr[i * 3 + 1] = Math.sin(a) * 0.26;
      arr[i * 3 + 2] = 0;
    }
    this.arc.geometry.attributes.position.needsUpdate = true;
    this.arc.geometry.setDrawRange(0, steps);
    this.arc.material.opacity = k * 0.95;

    /* The two islands sit on the ENDS OF THE CHORD, which is what makes the
       figure an argument rather than an illustration: they are not placed, they
       are where the circle put them. */
    const isleR = 0.16;
    this.isleA.position.set(1, 0, 0);
    this.isleA.scale.setScalar(isleR);
    this.isleB.position.set(c, s, 0);
    this.isleB.scale.setScalar(isleR);
    this.isleA.material.opacity = k * 0.9;
    this.isleB.material.opacity = k * 0.9;

    const half = th / 2;
    this.lblTheta.position.set(Math.cos(half) * 0.42, Math.sin(half) * 0.42, 0.01);
    this.lblTheta.setText(`θ ${Math.round((th * 180) / Math.PI)}°`);
    this.lblCos.position.set(c / 2, -0.17, 0.01);
    this.lblCos.setText(`cos θ = ${c.toFixed(2)}`);
    this.lblSin.position.set(c + 0.30 * Math.sign(c || 1), s / 2, 0.01);
    this.lblSin.setText(`sin θ = ${s.toFixed(2)}`);
    /* THE SPAN IS THE CHORD, AND THE PRINTED NUMBER IS THE DRAWN LENGTH.
       `2 sin(θ/2)` is the chord of a unit circle; it is written that way rather
       than as a distance between two points precisely so the identity is what
       is on screen. `world-check` measures the line and compares. */
    const chord = 2 * Math.sin(half);
    this.lblSpan.position.set((1 + c) / 2, s / 2 - 0.34, 0.01);
    this.lblSpan.setText(`the bridge is ${chord.toFixed(2)} wide`);
    for (const l of [this.lblTheta, this.lblCos, this.lblSin, this.lblSpan]) {
      l.mat.opacity = k;
      l.mat.transparent = true;
    }
  }
}
