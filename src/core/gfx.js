import * as THREE from 'three';

/* ---------------------------------------------------------------------------
   Toon / cel-shading helpers.
   The whole game reads as "Super Mario RPG": hard-stepped lighting on real 3D
   geometry, inverted-hull outlines on anything with a silhouette that matters.
--------------------------------------------------------------------------- */

/** N-step gradient ramp used by every MeshToonMaterial in the game. */
export function makeToonRamp(steps = 4) {
  const data = new Uint8Array(steps);
  for (let i = 0; i < steps; i++) {
    // Bias the ramp bright — cel art wants a big lit area and a small dark one.
    const t = (i + 1) / steps;
    data[i] = Math.round(Math.pow(t, 0.65) * 255);
  }
  const tex = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const RAMP = makeToonRamp(4);

export function toonMat(opts = {}) {
  return new THREE.MeshToonMaterial({ gradientMap: RAMP, ...opts });
}

/** Vertex-coloured toon material — most world geometry uses this. */
export function toonVertexMat(opts = {}) {
  return new THREE.MeshToonMaterial({
    gradientMap: RAMP,
    vertexColors: true,
    ...opts,
  });
}

/* ------------------------------ x-ray walls ------------------------------- */

/**
 * A toon material that cuts a hole around whoever it is standing in front of.
 *
 * THE PROBLEM IT SOLVES. Interior walls hide the player. The cheap answer is
 * to hide the whole building while somebody is inside, which the grotto did
 * for one round and which reads exactly as badly as it sounds — the room stops
 * being a room. The next cheapest is to tilt the camera over the wall, and
 * that fails here for a reason specific to this game: the characters are
 * BILLBOARDS, vertical quads that turn on Y only, so any pitch steep enough to
 * clear a wall renders both kittens as flat streaks on the floor. Measured at
 * 1.16 and 1.32; both unusable.
 *
 * So this is the third answer, and it is the one Super Mario RPG's descendants
 * use: leave the wall standing and take a bite out of the bit that is in the
 * way. Every fragment inside a capsule running from the camera to the player
 * is discarded, so a soft-edged porthole follows her along the wall and the
 * rest of the building is untouched.
 *
 * IT IS A DISCARD, NOT ALPHA. Transparency here would need this mesh sorted
 * against the world it is embedded in, and a half-transparent wall in front of
 * a half-transparent wall is a mess of blending order. `discard` is
 * order-independent, and the ragged edge that would otherwise give it away is
 * hidden by dithering the boundary against a 4x4 Bayer matrix — at the width
 * this fades over, that reads as a soft edge rather than as a pattern.
 *
 * WORLD SPACE, NOT SCREEN SPACE. The obvious version projects the player to
 * pixels and works in `gl_FragCoord`, which then has to know about the split
 * screen's viewport offsets — one more thing to get wrong per view. Distance
 * from a fragment to the camera→player SEGMENT needs only two positions and is
 * automatically correct for whichever camera is drawing.
 *
 * @returns {THREE.MeshToonMaterial} with `setCuts(camPos, points)` attached.
 */
export function xrayVertexMat(opts = {}) {
  const MAX = 2;                       // two kittens, and never more
  const mat = new THREE.MeshToonMaterial({
    gradientMap: RAMP,
    vertexColors: true,
    ...opts,
  });

  const u = {
    uCamPos: { value: new THREE.Vector3() },
    uCutPos: { value: Array.from({ length: MAX }, () => new THREE.Vector3()) },
    uCutOn: { value: new Float32Array(MAX) },
    /* The hole is a cone, not a tube: `uCutR` is its radius AT THE PLAYER, and
       it widens toward the camera. A constant radius punches a neat circle out
       of a wall two units from her face and a tiny pinprick out of one twenty
       units away, because the same world radius covers wildly different
       amounts of screen at different depths. */
    uCutR: { value: 2.6 },
    uCutFlare: { value: 0.55 },
    uCutSoft: { value: 1.1 },
  };

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vXrayWorld;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vXrayWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vXrayWorld;
        uniform vec3 uCamPos;
        uniform vec3 uCutPos[${MAX}];
        uniform float uCutOn[${MAX}];
        uniform float uCutR;
        uniform float uCutFlare;
        uniform float uCutSoft;

        // 4x4 Bayer, so the cut edge dissolves instead of stair-stepping.
        float xrayDither(vec2 p) {
          int x = int(mod(p.x, 4.0));
          int y = int(mod(p.y, 4.0));
          int i = x + y * 4;
          float m[16];
          m[0]=0.0;   m[1]=8.0;  m[2]=2.0;  m[3]=10.0;
          m[4]=12.0;  m[5]=4.0;  m[6]=14.0; m[7]=6.0;
          m[8]=3.0;   m[9]=11.0; m[10]=1.0; m[11]=9.0;
          m[12]=15.0; m[13]=7.0; m[14]=13.0; m[15]=5.0;
          for (int k = 0; k < 16; k++) { if (k == i) return (m[k] + 0.5) / 16.0; }
          return 0.5;
        }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        {
          float cut = 0.0;
          for (int i = 0; i < ${MAX}; i++) {
            if (uCutOn[i] < 0.5) continue;
            vec3 a = uCamPos;
            vec3 b = uCutPos[i];
            vec3 ab = b - a;
            float len2 = max(dot(ab, ab), 1e-4);
            // How far along the camera->player segment this fragment sits.
            float t = dot(vXrayWorld - a, ab) / len2;
            // Only geometry IN FRONT of her is in the way; t > 1 is behind
            // her and must keep drawing or the far wall vanishes too.
            if (t <= 0.0 || t >= 1.0) continue;
            float d = length(vXrayWorld - (a + ab * clamp(t, 0.0, 1.0)));
            // Widen toward the camera so the hole is a steady size on screen.
            float rad = uCutR * mix(uCutFlare, 1.0, t);
            cut = max(cut, 1.0 - smoothstep(rad, rad + uCutSoft, d));
          }
          if (cut > 0.001 && cut > xrayDither(gl_FragCoord.xy)) discard;
        }`);
    mat.userData.shader = shader;
  };
  // three keys its program cache on this; without it every material sharing
  // the same source would collide with the plain toon one.
  mat.customProgramCacheKey = () => 'xray-toon';

  /**
   * Point the cut at whoever is on screen. Call once per view, before drawing.
   * @param {THREE.Vector3} camPos
   * @param {THREE.Vector3[]} points world positions to keep visible
   */
  mat.setCuts = (camPos, points) => {
    u.uCamPos.value.copy(camPos);
    for (let i = 0; i < MAX; i++) {
      const p = points[i];
      u.uCutOn.value[i] = p ? 1 : 0;
      if (p) u.uCutPos.value[i].copy(p);
    }
  };
  return mat;
}

/* --------------------------------- outlines ------------------------------ */

const OUTLINE_MAT = new THREE.MeshBasicMaterial({
  color: 0x1a1016,
  side: THREE.BackSide,
});

/**
 * Inverted-hull outline. Cheap, and the thickness is in *world* units so it
 * stays consistent as the camera pulls back during dragon flight.
 */
export function addOutline(mesh, thickness = 0.045) {
  const shell = new THREE.Mesh(mesh.geometry, OUTLINE_MAT);
  shell.userData.isOutline = true;
  const g = mesh.geometry;
  if (!g.boundingSphere) g.computeBoundingSphere();
  const r = g.boundingSphere.radius || 1;
  const s = 1 + thickness / r;
  shell.scale.setScalar(s);
  shell.renderOrder = -1;
  mesh.add(shell);
  return shell;
}

/** Outline every mesh in a subtree (used for props / structures). */
export function outlineGroup(root, thickness = 0.05) {
  const targets = [];
  root.traverse((o) => {
    if (o.isMesh && !o.userData.isOutline && !o.userData.noOutline) targets.push(o);
  });
  targets.forEach((m) => addOutline(m, thickness));
  return root;
}

/* -------------------------------- geometry ------------------------------- */

/** Paint a geometry with a flat colour (so it can share a vertexColors material). */
export function paint(geo, color) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/**
 * Paint per-vertex using a callback — used for terrain (grass on top,
 * rock on the cliffs) and for gradient-shaded roofs.
 */
export function paintBy(geo, fn) {
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const n = pos.count;
  const arr = new Float32Array(n * 3);
  const c = new THREE.Color();
  const p = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    if (nrm) v.fromBufferAttribute(nrm, i);
    fn(p, v, c, i);
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/* ------------------------------- billboards ------------------------------ */

const _wp = new THREE.Vector3();

/**
 * Which way the drawn cells of a full-turn sheet walk around the circle.
 * +1 = increasing column turns the subject toward screen-RIGHT.
 *
 * THIS IS PER SHEET, and `rowSense` can override it per row. Generated sheets
 * do not have to agree with each other, or even internally — assuming one
 * global answer is why this bug kept moving between the two cats instead of
 * going away. Both LIVE sheets happen to agree:
 *
 *   ember_grid_v2 (10 wide):  0 front, 2 RIGHT, 5 away, 7 LEFT  -> +1
 *   frost_grid    (8 wide):   0 front, 2 RIGHT, 4 away, 6 LEFT  -> +1
 *
 * frost_grid_v2 does NOT and is deliberately unused: its jump and attack rows
 * are drawn mirrored against its idle and walk rows, so no single mapping can
 * be right for all four.
 *
 * Never change one from reasoning alone. Getting it backwards is a left-right
 * REFLECTION, so facing-camera and facing-away still look perfect while every
 * other direction plays its mirror image — it reads as a subtle animation bug
 * rather than an index bug. Check it by drawing the cells enlarged onto a
 * canvas and looking at which way the muzzle points; see the recipe in
 * HANDOFF.md.
 */
const DIR_SENSE = 1;

/**
 * A sprite that lives in the 3D world: always upright, rotates around Y to
 * face whichever camera is currently rendering, and picks its animation frame
 * from the angle between its facing and that camera. This is the exact trick
 * Super Mario RPG / Octopath use, and it's why the art can be hand-drawn 2D
 * while the world stays real 3D.
 */
export class Billboard extends THREE.Object3D {
  /**
   * @param {THREE.Texture} texture atlas
   * @param {object} opts { cols, rows, width, height, dirs }
   */
  constructor(texture, opts = {}) {
    super();
    const {
      cols = 4, rows = 1, width = 1.6, height = 1.6,
      artFacesRight = true, mirror = true, footOffset = 0,
      dirSense = DIR_SENSE, rowSense = null,
    } = opts;

    /** Per-sheet override for the cell ordering — see DIR_SENSE. */
    this.dirSense = dirSense;
    /**
     * Per-ROW override, because a generated sheet's rows do not have to agree
     * with each other and these ones don't: Frost's jump row is drawn mirrored
     * against her idle row. Measured, not guessed — see the muzzle/eye probe
     * in HANDOFF.md. `null` entries fall back to dirSense.
     */
    this.rowSense = rowSense;

    this.cols = cols;
    this.rows = rows;
    /** Half-turn atlas mirrored to cover the other half (true), or a full
     *  360-degree set of drawn cells (false). */
    this.mirror = mirror;
    /** Which way the source art points. Side-on art drawn facing left (the
     *  dragon) needs the mirror test inverted. */
    this.artFacesRight = artFacesRight;
    this.frame = 0;
    /** world-space facing angle, radians, 0 = +Z */
    this.facing = 0;
    /** row of the atlas to sample (animation state) */
    this.row = 0;

    this.tex = texture.clone();
    this.tex.needsUpdate = true;
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.tex.wrapS = this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.tex.repeat.set(1 / cols, 1 / rows);

    // Half a source texel, expressed in UV space.
    const iw = this.tex.image?.width || 1024;
    const ih = this.tex.image?.height || 1024;
    this._insetU = 0.5 / iw;
    this._insetV = 0.5 / ih;

    this.mat = new THREE.MeshBasicMaterial({
      map: this.tex,
      transparent: true,
      alphaTest: 0.35,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    const geo = new THREE.PlaneGeometry(width, height);
    // Pivot at the drawn feet, not at the bottom of the quad: the atlas leaves
    // transparent padding below the art, so without this the character floats
    // by exactly that margin.
    geo.translate(0, height / 2 - footOffset, 0);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.castShadow = false;
    this.add(this.mesh);

    this.width = width;
    this.height = height;
    this._flip = false;
  }

  /** Called once per camera, before that viewport renders. */
  faceCamera(camera) {
    // Must be the sprite's WORLD position. A Billboard is parented to its
    // entity's group, so `this.position` is a local offset — usually (0,0,0) —
    // and using it measures the camera angle from the world origin instead of
    // from the sprite. The error grows with distance from origin, so sprites
    // visibly swing around as the player walks away from the middle of the map.
    this.getWorldPosition(_wp);
    const dx = camera.position.x - _wp.x;
    const dz = camera.position.z - _wp.z;
    const camAngle = Math.atan2(dx, dz);
    this.mesh.rotation.y = camAngle;

    // Which of the N drawn directions best matches "facing, seen from here"?
    let rel = this.facing - camAngle;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel)); // wrap to [-PI, PI]

    let idx;
    let flip = false;

    if (this.mirror) {
      /* Half-turn atlas: cells cover facing-toward-camera round to
         facing-away, and the other half of the turn is the mirror image.
         Cheap, but mirroring flips asymmetric details — Ember's tail swaps
         sides — so full-turn sheets are preferred where they exist. */
      const a = Math.abs(rel);
      if (this.cols === 1) idx = 0;
      else if (a < Math.PI * 0.25) idx = 0;
      else if (a < Math.PI * 0.55) idx = 1;
      else if (a < Math.PI * 0.8) idx = 2;
      else idx = 3;

      /* sin(rel) > 0 means the subject points toward screen-right — but near
         dead-on and dead-away that crosses zero constantly, and the sprite
         strobes between its own mirror images. Hold the last side until the
         subject is decisively turned, so it flips once per actual turn. */
      const s = Math.sin(rel);
      if (Math.abs(s) > 0.12 || this._pointsRight === undefined) {
        this._pointsRight = s > 0;
      }
      flip = this.artFacesRight ? !this._pointsRight : this._pointsRight;
    } else {
      /* Full-turn atlas: one drawn cell per `cols` steps around the whole
         circle, cell 0 facing the camera and stepping around by DIR_SENSE. */
      const step = (Math.PI * 2) / this.cols;
      const sense = this.rowSense?.[this.row] ?? this.dirSense;
      let r = (rel * sense) % (Math.PI * 2);
      if (r < 0) r += Math.PI * 2;
      /* Nearest cell, breaking exact ties DOWNWARD (`-Math.round(-x)`).
         On a 10-cell sheet, screen-left and screen-right land exactly halfway
         between two drawn cells; Math.round breaks every tie upward, which
         nudged BOTH profiles one cell round the circle and left the cat
         walking sideways in a three-quarter pose. Rounding ties down picks the
         clean profile for the two directions players use most. */
      idx = (-Math.round(-r / step)) % this.cols;
    }

    this._setCell(idx, this.row, flip);
  }

  _setCell(col, row, flip) {
    const c = Math.min(col, this.cols - 1);
    const r = Math.min(row, this.rows - 1);

    /* Sample a hair inside the cell. Without the inset, bilinear filtering and
       mipmaps reach across the cell boundary and drag in the neighbouring
       frame's pixels — a faint ghost limb down one edge of the sprite. The
       atlas also leaves transparent padding around each cell's art, so this
       inset never eats into the drawing itself. */
    const iu = this._insetU;
    const iv = this._insetV;
    const w = 1 / this.cols;
    const h = 1 / this.rows;

    if (flip) {
      this.tex.repeat.x = -(w - iu * 2);
      this.tex.offset.x = (c + 1) * w - iu;
    } else {
      this.tex.repeat.x = w - iu * 2;
      this.tex.offset.x = c * w + iu;
    }
    // three's UV origin is bottom-left; atlases are authored top-down.
    this.tex.repeat.y = h - iv * 2;
    this.tex.offset.y = 1 - (r + 1) * h + iv;
  }
}

/* --------------------------- placeholder textures ------------------------- */

/**
 * Draws a stand-in 4-direction cat atlas on a canvas so the whole game is
 * playable before (or without) the generated art. Swapped out for the real
 * sprite sheet at load time when one is present.
 */
export function placeholderCatAtlas(furA = '#f2683c', furB = '#c33a22', cloth = '#33408c') {
  const CELL = 256;
  const cv = document.createElement('canvas');
  cv.width = CELL * 4;
  cv.height = CELL;
  const g = cv.getContext('2d');

  const drawCat = (ox, view) => {
    g.save();
    g.translate(ox + CELL / 2, CELL);
    g.lineWidth = 7;
    g.lineJoin = 'round';
    g.strokeStyle = '#241017';

    const body = new Path2D();
    body.ellipse(0, -60, 42, 58, 0, 0, Math.PI * 2);
    g.fillStyle = furA;
    g.fill(body);
    g.stroke(body);

    // haori
    const coat = new Path2D();
    coat.moveTo(-42, -78);
    coat.lineTo(42, -78);
    coat.lineTo(34, -14);
    coat.lineTo(-34, -14);
    coat.closePath();
    g.fillStyle = cloth;
    g.fill(coat);
    g.stroke(coat);

    // legs
    g.fillStyle = furA;
    [-20, 20].forEach((x) => {
      const l = new Path2D();
      l.roundRect(x - 11, -18, 22, 22, 8);
      g.fill(l);
      g.stroke(l);
    });

    // tail
    const tail = new Path2D();
    tail.moveTo(view === 3 ? 0 : 34, -60);
    tail.quadraticCurveTo(78, -70, 66, -122);
    g.strokeStyle = '#241017';
    g.lineWidth = 20;
    g.stroke(tail);
    g.strokeStyle = furB;
    g.lineWidth = 12;
    g.stroke(tail);
    g.lineWidth = 7;
    g.strokeStyle = '#241017';

    // head
    const head = new Path2D();
    head.ellipse(0, -136, 52, 46, 0, 0, Math.PI * 2);
    g.fillStyle = furA;
    g.fill(head);
    g.stroke(head);

    // ears
    [-34, 34].forEach((x) => {
      const e = new Path2D();
      e.moveTo(x - 20, -160);
      e.lineTo(x, -212);
      e.lineTo(x + 20, -160);
      e.closePath();
      g.fillStyle = furB;
      g.fill(e);
      g.stroke(e);
    });

    // muzzle
    const mz = new Path2D();
    mz.ellipse(0, -118, 26, 18, 0, 0, Math.PI * 2);
    g.fillStyle = '#ffd9ad';
    g.fill(mz);
    g.stroke(mz);

    if (view !== 3) {
      // eyes — squint toward the side views
      const squint = view === 2 ? 0.45 : view === 1 ? 0.75 : 1;
      const ex = view === 0 ? [-20, 20] : view === 1 ? [-8, 26] : [10, 30];
      ex.forEach((x) => {
        g.fillStyle = '#fff';
        const e = new Path2D();
        e.ellipse(x, -148, 13 * squint, 15, 0, 0, Math.PI * 2);
        g.fill(e);
        g.stroke(e);
        g.fillStyle = '#2fbf6a';
        const p = new Path2D();
        p.ellipse(x + 2, -148, 7 * squint, 10, 0, 0, Math.PI * 2);
        g.fill(p);
      });
      // nose
      g.fillStyle = '#e0698a';
      const n = new Path2D();
      n.moveTo(-6, -126);
      n.lineTo(6, -126);
      n.lineTo(0, -118);
      g.fill(n);
      g.stroke(n);
    }

    // katana on the back
    const sw = new Path2D();
    sw.moveTo(-52, -40);
    sw.lineTo(30, -128);
    g.strokeStyle = '#241017';
    g.lineWidth = 15;
    g.stroke(sw);
    g.strokeStyle = '#5d4a7a';
    g.lineWidth = 9;
    g.stroke(sw);

    g.restore();
  };

  for (let i = 0; i < 4; i++) drawCat(i * CELL, i);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Stand-in storm dragon, drawn side-on. */
export function placeholderDragonTexture(body = '#3d5a9e', belly = '#f0e6c8') {
  const W = 1024;
  const H = 512;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  g.translate(W / 2, H / 2);
  g.lineWidth = 9;
  g.lineJoin = 'round';
  g.strokeStyle = '#1b1426';

  // far wing
  const wing = (dir, fill) => {
    const w = new Path2D();
    w.moveTo(-20, -20);
    w.quadraticCurveTo(-140 * dir, -190, -300 * dir, -150);
    w.quadraticCurveTo(-210 * dir, -60, -230 * dir, 30);
    w.quadraticCurveTo(-120 * dir, -10, -20, -20);
    g.fillStyle = fill;
    g.fill(w);
    g.stroke(w);
  };
  wing(-1, '#2b3f73');

  // tail + body
  const b = new Path2D();
  b.moveTo(300, 120);
  b.quadraticCurveTo(150, 60, 60, 40);
  b.quadraticCurveTo(-40, 20, -90, -30);
  b.quadraticCurveTo(-120, -110, -60, -150);
  b.quadraticCurveTo(0, -180, 40, -150);
  b.quadraticCurveTo(70, -120, 30, -80);
  b.quadraticCurveTo(-20, -40, 40, 0);
  b.quadraticCurveTo(160, 40, 310, 100);
  b.closePath();
  g.fillStyle = body;
  g.fill(b);
  g.stroke(b);

  // belly
  const bl = new Path2D();
  bl.moveTo(280, 110);
  bl.quadraticCurveTo(140, 50, 50, 20);
  bl.quadraticCurveTo(0, -10, -40, -50);
  g.strokeStyle = belly;
  g.lineWidth = 26;
  g.stroke(bl);
  g.strokeStyle = '#1b1426';
  g.lineWidth = 9;

  // mane
  const mane = new Path2D();
  mane.moveTo(-70, -140);
  mane.quadraticCurveTo(-30, -190, 30, -170);
  g.strokeStyle = belly;
  g.lineWidth = 30;
  g.stroke(mane);
  g.strokeStyle = '#1b1426';
  g.lineWidth = 9;

  // horns
  [[-30, -160], [-10, -170]].forEach(([x, y]) => {
    const hn = new Path2D();
    hn.moveTo(x, y);
    hn.quadraticCurveTo(x - 40, y - 40, x - 80, y - 30);
    g.lineWidth = 14;
    g.stroke(hn);
  });
  g.lineWidth = 9;

  // eye
  g.fillStyle = '#ffb63d';
  const ey = new Path2D();
  ey.ellipse(6, -142, 12, 9, 0, 0, Math.PI * 2);
  g.fill(ey);
  g.stroke(ey);

  // near wing
  wing(1, '#4b6bb5');

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Stand-in panda, drawn side-on facing LEFT to match the generated art.
 *
 * `cub` swaps to baby proportions — a huge head on a small body — because the
 * whole point of the two tiers is that you can tell at a glance which one is
 * trotting after you.
 */
export function placeholderPandaTexture(cub = false) {
  const S = 768;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const g = cv.getContext('2d');
  g.translate(S / 2, S / 2 + (cub ? 40 : 20));
  const k = cub ? 0.78 : 1;
  g.scale(k, k);
  g.lineWidth = 13 / k;
  g.lineJoin = 'round';
  g.strokeStyle = '#161018';

  const FUR = '#f6f3ec';
  const INK = '#23202a';
  const shape = (path, fill) => { g.fillStyle = fill; g.fill(path); g.stroke(path); };

  // back legs, then body, then front legs — so the near pair reads in front
  const leg = (x, w, h) => {
    const l = new Path2D();
    l.roundRect(x - w / 2, 40, w, h, 14);
    return l;
  };
  shape(leg(150, 62, 130), INK);
  shape(leg(-90, 62, 130), INK);

  const body = new Path2D();
  body.ellipse(30, -30, cub ? 170 : 210, cub ? 118 : 130, 0, 0, Math.PI * 2);
  shape(body, INK);

  // white saddle band across the middle, the panda's own marking
  const band = new Path2D();
  band.ellipse(90, -34, cub ? 92 : 110, cub ? 104 : 116, 0, 0, Math.PI * 2);
  shape(band, FUR);

  shape(leg(120, 60, 128), INK);
  shape(leg(-58, 60, 128), INK);

  // head, facing left
  const headX = cub ? -170 : -190;
  const headY = cub ? -110 : -80;
  const hr = cub ? 128 : 110;
  const ear = new Path2D();
  ear.ellipse(headX + 22, headY - hr * 0.82, 42, 42, 0, 0, Math.PI * 2);
  shape(ear, INK);
  const head = new Path2D();
  head.ellipse(headX, headY, hr, hr * 0.92, 0, 0, Math.PI * 2);
  shape(head, FUR);

  // eye patch, eye, muzzle
  const patch = new Path2D();
  patch.ellipse(headX - hr * 0.24, headY - hr * 0.12, hr * 0.34, hr * 0.40, -0.3, 0, Math.PI * 2);
  shape(patch, INK);
  g.fillStyle = '#ffffff';
  const eye = new Path2D();
  eye.ellipse(headX - hr * 0.28, headY - hr * 0.14, hr * 0.10, hr * 0.12, 0, 0, Math.PI * 2);
  g.fill(eye);
  const nose = new Path2D();
  nose.ellipse(headX - hr * 0.86, headY + hr * 0.20, 20, 15, 0, 0, Math.PI * 2);
  shape(nose, INK);

  // Grown pandas wear the saddle; cubs wear the collar and bell.
  if (cub) {
    g.strokeStyle = '#c8324a';
    g.lineWidth = 22;
    const collar = new Path2D();
    collar.moveTo(headX + 70, headY + hr * 0.72);
    collar.quadraticCurveTo(headX + 96, headY + hr * 1.02, headX + 128, headY + hr * 0.74);
    g.stroke(collar);
    g.strokeStyle = '#161018';
    g.lineWidth = 13 / k;
    const bell = new Path2D();
    bell.ellipse(headX + 98, headY + hr * 1.02, 24, 24, 0, 0, Math.PI * 2);
    shape(bell, '#f0b93c');
  } else {
    const blanket = new Path2D();
    blanket.moveTo(0, -140);
    blanket.lineTo(160, -132);
    blanket.lineTo(148, -8);
    blanket.lineTo(8, -20);
    blanket.closePath();
    shape(blanket, '#a8283c');
    g.strokeStyle = '#f0b93c';
    g.lineWidth = 12;
    g.stroke(blanket);
    g.strokeStyle = '#161018';
    g.lineWidth = 13;
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
