import * as THREE from 'three';
import { loadBoard, BOARD_MODES } from './leaderboard.js';
import { MODE_BY_ID } from './tournament.js';
import { PLAYER_STYLE, cssFor } from '../core/palette.js';
import { recolourPixels } from '../core/spritesheet.js';

/* ---------------------------------------------------------------------------
   THE BIG SCREEN outside the arena: the record board as a thing in the world.

   Richard's brief, in the order it is built here:
   - "put the first place winning players face, front facing with a cool
     character pose ... name of character and player name added to the score
     board" — a CHAMPION slide per league (`champ`).
   - "We can have this cycle for every different winning player for every
     different category" — one per league, in `BOARD_MODES` order.
   - "By default, we should show some made up stats for Mr. Satan if there are
     no winning players in a category ... ridiculous (not possible points to
     get in a tournament) ... 'The Undefeatable Champ! Don't even try!'" — the
     SATAN slide stands in for an empty league (`SATAN_RECORDS`).
   - "different images of him flexing as 'advertisement' on the panel between
     tournament winner announcements" — an AD slide after every league.
   - "'Honorable Mentions' ... #2 and #3 with shortened information, just their
     names, and an image of their face, and have it on the screen for less
     time" — the HM slide, 4s against the champion's 8 (`SLIDE_DUR`).
   - "fireworks and sparks shoot off when players are viewing it, especially
     when it mentions Mr. Satan" — `see()` is called by every pane's render,
     and the effects run only while some pane can actually see the glass.
   - "If players walk near or around the board, have the camera zoom out so
     they can see the board clearly" — `boardZoneWeight` and `boardShot`,
     which both cameras (Player._updateCamera through `setFocus`, and the
     merged rig in main.js) blend toward.

   ONE CANVAS, REPAINTED ONLY WHEN THE SLIDE CHANGES. A 1280x720 upload every
   frame would be the most expensive thing on screen, and this game is
   fill-bound (docs/notes/performance.md). Everything that MOVES is 3D and
   costs no upload: the bulbs are one InstancedMesh, the ticker is a texture
   scrolled by its offset, the flash is a plane's opacity, the fireworks are
   one pooled THREE.Points. `willReadFrequently` on the canvas for the reason
   core/label.js gives: it keeps the canvas on the CPU, so the one upload a
   slide costs is not a GPU readback first.
--------------------------------------------------------------------------- */

/** How long each kind of slide stays up, in seconds. The honourable mentions
 *  are "on the screen for less time" than the champion — `world-check` pins
 *  that ordering, not the numbers. */
export const SLIDE_DUR = { champ: 8, hm: 4, satan: 7, ad: 4.5 };

/** A result this recent wears a NEW! badge. A day: the girls come back to a
 *  board with last night's win still flagged, and not last month's. */
export const NEW_FOR_MS = 24 * 3600 * 1000;

/**
 * The champion art, one per SHEET: Storm and Blossom are Ember and Frost with
 * their style's `recolour`, exactly as their walk sheets are.
 *
 * `face` IS MEASURED, NOT ASSUMED, on the 640px baked file: `[x, y, size]` of
 * a square round her head and ears. Both poses have a paw raised ABOVE the
 * head, so the top of the silhouette is her fist, not her ears, and a crop
 * taken from the top of the ink would have been a close-up of a paw. Measured
 * by cropping out/bake proofs and looking (the notes are in docs/notes/art.md).
 */
export const CHAMP_ART = {
  ember: { src: '/sprites/kittens/ember/champion.png', face: [190, 8, 276] },
  frost: { src: '/sprites/kittens/frost/champion.png', face: [164, 38, 290] },
};

/** Mr. Satan's four flexes, the board's "advertisements". */
export const SATAN_POSES = {
  zyzz: '/sprites/satan/flex_zyzz.png',
  biceps: '/sprites/satan/flex_biceps.png',
  trophy: '/sprites/satan/flex_trophy.png',
  kiss: '/sprites/satan/flex_kiss.png',
};

/**
 * What the board says for a league nobody has won yet. "The points for Mr.
 * Satan and information can be made up and ridiculous (not possible points to
 * get in a tournament) as part of the humor". So every score here is bigger
 * than a real one can be (`scoreOf` tops out in the low thousands) — `world-
 * check` pins that, so a joke can never be mistaken for a record.
 */
export const SATAN_RECORDS = {
  duel: {
    pose: 'biceps', score: 99999999,
    stats: '1,000,000 WINS · 0 TAKEN · 0.3 SECONDS',
    joke: 'Once won a staring contest against the sun.',
  },
  ffa: {
    pose: 'zyzz', score: 88888888,
    stats: 'EVERY WIN · DEALT: ALL OF IT · 0 TAKEN',
    joke: 'Fought everybody at once. Everybody lost. So did the referee.',
  },
  pairs: {
    pose: 'kiss', score: 77777777,
    stats: 'NO PARTNER NEEDED · 0 TAKEN',
    joke: 'His left arm and his right arm are a tag team.',
  },
  two_one: {
    pose: 'trophy', score: 66666666,
    stats: '2 AGAINST 1? HE ASKED FOR 20',
    joke: 'Told the other two to bring their friends.',
  },
  three_one: {
    pose: 'biceps', score: 55555555,
    stats: '3 AGAINST 1 IS HIS WARM-UP',
    joke: 'Four against one is his breakfast.',
  },
  two_one_one: {
    pose: 'zyzz', score: 44444444,
    stats: 'WON IT WHILE SIGNING AUTOGRAPHS',
    joke: 'With both paws. At the same time.',
  },
};

/** His headline on every league nobody has won, in Richard's words. */
export const SATAN_TAGLINE = ['THE UNDEFEATABLE CHAMP!', 'DON\'T EVEN TRY!'];

/** The ads between leagues. Kid-friendly, and never about anybody but him. */
export const SATAN_ADS = [
  {
    pose: 'zyzz', head: 'BEHOLD: THE ANGEL PUMP!',
    line: 'Mr. Satan\'s wings are real. Please do not ask to touch them.',
    small: 'Wings sold separately. Wings not for sale.',
  },
  {
    pose: 'trophy', head: 'TROPHY OF THE DAY',
    line: 'He has a trophy for winning trophies.',
    small: 'It is also a very good cup.',
  },
  {
    pose: 'kiss', head: 'LOVE YOUR MUSCLES!',
    line: 'Mr. Satan kisses his biceps for luck. They say thank you.',
    small: 'Mwah.',
  },
  {
    pose: 'biceps', head: 'THE PYTHONS ARE AWAKE',
    line: 'Each of his arms has its own fan club.',
    small: 'Membership: everyone. Meetings: every day.',
  },
];

/** A league's name as the tournament shows it. */
export function leagueName(mode) {
  return MODE_BY_ID[mode]?.name ?? String(mode).toUpperCase();
}

/**
 * The cycle, as data. Pure, so `world-check` can read it without a canvas.
 *
 * PER LEAGUE: its champion then the honourable mentions (if there are any),
 * or Mr. Satan's made-up record if nobody has won it — and then an ad. The
 * ads walk `SATAN_ADS` in order so consecutive ones are never the same pose.
 *
 * @param {Record<string, object[]>} boards league id -> rows, best first
 */
export function buildSlides(boards = {}, now = Date.now()) {
  const out = [];
  let ad = 0;
  for (const mode of BOARD_MODES) {
    const rows = Array.isArray(boards[mode]) ? boards[mode] : [];
    if (rows.length) {
      const row = rows[0];
      out.push({
        kind: 'champ', mode, row, dur: SLIDE_DUR.champ,
        fresh: Number.isFinite(row.at) && row.at > 0 && now - row.at < NEW_FOR_MS,
      });
      if (rows.length > 1) out.push({ kind: 'hm', mode, rows: rows.slice(1, 3), dur: SLIDE_DUR.hm });
    } else {
      out.push({ kind: 'satan', mode, rec: SATAN_RECORDS[mode] ?? SATAN_RECORDS.duel, dur: SLIDE_DUR.satan });
    }
    out.push({ kind: 'ad', ad: ad % SATAN_ADS.length, dur: SLIDE_DUR.ad });
    ad++;
  }
  return out;
}

/** Every league's board, read fresh. */
export function readBoards() {
  return Object.fromEntries(BOARD_MODES.map((m) => [m, loadBoard(m)]));
}

/** The style a row's kitten was drawn from, or null for an old row. */
export function catStyle(name) {
  return PLAYER_STYLE.find((s) => s.name === name) ?? null;
}

/** How loud the board should be about itself on this slide, 0..1. Mr. Satan
 *  gets the most: "especially when it mentions Mr. Satan". */
export function slideHype(slide, t = 0) {
  if (!slide) return 0;
  if (slide.kind === 'satan' || slide.kind === 'ad') return 1;
  // A champion is celebrated as she comes up, then the board calms down.
  if (slide.kind === 'champ') return t < 2.5 ? 1 : 0.45;
  return 0.2;
}

/* ===========================================================================
   THE CAMERA NEAR THE BOARD.

   "If players walk near or around the board, have the camera zoom out so they
   can see the board clearly and watch it while being around it."

   A ZONE, NOT A TRIGGER: a weight that is 1 in front of the glass and falls
   to 0 over `fade` units, so walking in and out is a blend rather than a cut.
   Both cameras use it; the merged rig in main.js and the per-player one via
   `setFocus`. Away from the zone the weight is exactly 0 and neither camera
   runs a line of it, which is what keeps two players' game bit-identical
   everywhere else (non-negotiable 5).
=========================================================================== */
export const BOARD_VIEW = {
  /** How far out in front of the stands she can be and still get the shot. */
  reach: 28,
  /** ...and how far to either side of the board's middle. */
  side: 24,
  /** The blend band on both. */
  fade: 8,
  /** Looking straight at the glass, from the west. */
  yaw: -Math.PI / 2,
  /** Lower than the walking camera's 0.66, so the screen reads face-on. */
  pitch: 0.2,
  /** Frame margin on the fit. */
  margin: 1.1,
  /** Higher than this over the ground and she is flying, not visiting. */
  ceiling: 14,
};

const smooth01 = (x) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * How much of the board's shot a kitten at (x, y, z) should get, 0..1.
 * `board` is `World.arenaBoard`; `open` is `World.arenaOpen`.
 */
export function boardZoneWeight(board, open, x, y, z) {
  if (!board || !open || !Number.isFinite(x) || !Number.isFinite(z)) return 0;
  const V = BOARD_VIEW;
  const front = board.face - x;             // the board faces -x
  if (front < -1) return 0;                 // inside the stands, or behind them
  if (Number.isFinite(y) && y > board.ground + V.ceiling) return 0;
  const a = 1 - smooth01((front - V.reach) / V.fade);
  const b = 1 - smooth01((Math.abs(z - board.z) - V.side) / V.fade);
  return a * b;
}

/**
 * The shot that frames the whole board AND the kittens in front of it.
 *
 * FITTED, NOT TUNED: fixed yaw and pitch, and the distance is the smallest one
 * at which every point (the four corners of the glass, each kitten's feet and
 * head) is inside the frame at this pane's aspect. A distance tuned at 16:9
 * would crop the board in the 62/38 column — the lesson `fitDistance` already
 * paid for. The camera looks at the middle of the points' extent, so a kitten
 * wandering along the wall stays in the shot with the board.
 *
 * @param kittens [{x, y, z}]  whoever this camera is for
 * @returns {{ centre: THREE.Vector3, dist: number, yaw: number, pitch: number }}
 */
export function boardShot(board, kittens, fovDeg, aspect) {
  const V = BOARD_VIEW;
  const cp = Math.cos(V.pitch);
  const sp = Math.sin(V.pitch);
  // Camera basis for yaw -PI/2: it sits at -x looking +x (and a little down).
  const f = { x: cp, y: -sp, z: 0 };        // forward
  const r = { x: 0, y: 0, z: 1 };           // screen right
  const u = { x: sp, y: cp, z: 0 };         // screen up (r x f)
  const pts = [];
  for (const sy of [0, 1]) {
    for (const sz of [-1, 1]) {
      pts.push({ x: board.face, y: board.bottom + sy * board.h, z: board.z + sz * board.w / 2 });
    }
  }
  for (const k of kittens ?? []) {
    if (!k || !Number.isFinite(k.x)) continue;
    pts.push({ x: k.x, y: k.y, z: k.z });
    pts.push({ x: k.x, y: k.y + 3.2, z: k.z });
  }
  const dot = (p, a) => p.x * a.x + p.y * a.y + p.z * a.z;
  let r0 = Infinity; let r1 = -Infinity; let u0 = Infinity; let u1 = -Infinity;
  let f0 = Infinity; let f1 = -Infinity;
  for (const p of pts) {
    const pr = dot(p, r); const pu = dot(p, u); const pf = dot(p, f);
    r0 = Math.min(r0, pr); r1 = Math.max(r1, pr);
    u0 = Math.min(u0, pu); u1 = Math.max(u1, pu);
    f0 = Math.min(f0, pf); f1 = Math.max(f1, pf);
  }
  const cr = (r0 + r1) / 2; const cu = (u0 + u1) / 2; const cf = (f0 + f1) / 2;
  const centre = new THREE.Vector3(
    r.x * cr + u.x * cu + f.x * cf,
    r.y * cr + u.y * cu + f.y * cf,
    r.z * cr + u.z * cu + f.z * cf,
  );
  const tanV = Math.tan((fovDeg * Math.PI) / 360);
  const tanH = tanV * (aspect > 0 ? aspect : 16 / 9);
  let dist = 0;
  for (const p of pts) {
    const d = { x: p.x - centre.x, y: p.y - centre.y, z: p.z - centre.z };
    const depthOff = dot(d, f);             // how much nearer/further than the centre
    dist = Math.max(dist,
      Math.abs(dot(d, r)) * V.margin / tanH - depthOff,
      Math.abs(dot(d, u)) * V.margin / tanV - depthOff);
  }
  return { centre, dist, yaw: V.yaw, pitch: V.pitch };
}

/* ===========================================================================
   THE RUNTIME.
=========================================================================== */

const CW = 1280;
const CH = 720;
/** The ticker's strip at the bottom of the glass, in canvas px. */
const TICK_H = 58;
const MAX_SPARKS = 900;

export class ArenaBoard {
  /**
   * @param {{ world, scene, audio? }} o
   */
  constructor({ world, scene, audio = null }) {
    this.world = world;
    this.audio = audio;
    this.slides = [];
    this.index = -1;
    this.t = 0;
    /** How much attention the board is asking for, eased: 0 unseen, 1 loud. */
    this.hype = 0;
    this._seen = 0;
    this._seenDist = Infinity;
    this._rocketT = 0;
    this._fountT = 0;
    this._clock = 0;
    this.art = { cats: {}, satan: {} };

    const B = world.arenaBoard;
    this.B = B;
    const g = new THREE.Group();
    g.visible = false;
    g.name = 'arenaBoard';
    this.group = g;
    scene.add(g);

    // --- the glass ---
    const cv = document.createElement('canvas');
    cv.width = CW; cv.height = CH;
    this.canvas = cv;
    this.ctx = cv.getContext('2d', { willReadFrequently: true });
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.tex = tex;
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(B.w, B.h),
      new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, fog: false })
    );
    // A plane faces +z; turned -90 degrees about y it faces -x, out of the stands.
    face.rotation.y = -Math.PI / 2;
    face.position.set(B.x, B.y, B.z);
    g.add(face);
    this.face = face;

    // --- the ticker, scrolled by its texture offset, never repainted per frame ---
    const tc = document.createElement('canvas');
    tc.width = 4096; tc.height = 64;
    this.tickCanvas = tc;
    this.tickCtx = tc.getContext('2d', { willReadFrequently: true });
    const tt = new THREE.CanvasTexture(tc);
    tt.colorSpace = THREE.SRGBColorSpace;
    tt.wrapS = THREE.RepeatWrapping;
    tt.repeat.x = 0.42;
    this.tickTex = tt;
    const tickH = B.h * (TICK_H / CH);
    const tick = new THREE.Mesh(
      new THREE.PlaneGeometry(B.w, tickH),
      new THREE.MeshBasicMaterial({ map: tt, toneMapped: false, fog: false })
    );
    tick.rotation.y = -Math.PI / 2;
    tick.position.set(B.x - 0.02, B.bottom + tickH / 2, B.z);
    g.add(tick);

    // --- the flash a new slide arrives under ---
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(B.w, B.h),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
      })
    );
    this.flash.rotation.y = -Math.PI / 2;
    this.flash.position.set(B.x - 0.04, B.y, B.z);
    this.flash.renderOrder = 7;
    g.add(this.flash);

    // --- the marquee: bulbs round the gold trim ---
    const bulbs = [];
    const W2 = B.w / 2 + 0.21;
    const H2 = B.h / 2 + 0.21;
    const per = 2 * (2 * W2 + 2 * H2);
    const n = Math.round(per / 0.95);
    for (let i = 0; i < n; i++) {
      let s = (i / n) * per;
      let y; let z;
      if (s < 2 * W2) { z = -W2 + s; y = H2; }
      else if ((s -= 2 * W2) < 2 * H2) { z = W2; y = H2 - s; }
      else if ((s -= 2 * H2) < 2 * W2) { z = W2 - s; y = -H2; }
      else { s -= 2 * W2; z = -W2; y = -H2 + s; }
      bulbs.push({ y: B.y + y, z: B.z + z });
    }
    const bulbMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.17, 8, 6),
      new THREE.MeshBasicMaterial({ toneMapped: false, fog: false }),
      bulbs.length
    );
    const m4 = new THREE.Matrix4();
    bulbs.forEach((b, i) => {
      bulbMesh.setMatrixAt(i, m4.makeTranslation(B.face - 0.74, b.y, b.z));
      bulbMesh.setColorAt(i, new THREE.Color(0xffd66b));
    });
    bulbMesh.frustumCulled = false;
    g.add(bulbMesh);
    this.bulbs = bulbMesh;
    this.bulbCount = bulbs.length;

    // --- the glow round the frame, additive, hollow in the middle ---
    this.glow = new THREE.Mesh(
      new THREE.PlaneGeometry(B.w + 12, B.h + 12),
      new THREE.MeshBasicMaterial({
        map: ringGlowTexture(B.w, B.h), transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, toneMapped: false, fog: false, opacity: 0.5,
      })
    );
    this.glow.rotation.y = -Math.PI / 2;
    this.glow.position.set(B.face - 0.9, B.y, B.z);
    this.glow.renderOrder = 6;
    g.add(this.glow);

    // --- two searchlights off the posts, so it can be found from the road ---
    this.beams = [];
    const beamTex = beamTexture();
    for (const sz of [-1, 1]) {
      const geo = new THREE.CylinderGeometry(4.2, 0.5, 70, 18, 1, true);
      geo.translate(0, 35, 0);
      const mat = new THREE.MeshBasicMaterial({
        map: beamTex, color: sz < 0 ? 0xffe39a : 0xff9ad6, transparent: true,
        depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        toneMapped: false, opacity: 0.35,
      });
      const beam = new THREE.Mesh(geo, mat);
      beam.position.set(B.face - 0.45, B.top, B.z + sz * (B.w / 2 + 1.3));
      beam.renderOrder = 6;
      beam.frustumCulled = false;
      g.add(beam);
      this.beams.push({ mesh: beam, side: sz });
    }

    // --- the fireworks: one pooled Points, recycled forever ---
    const pos = new Float32Array(MAX_SPARKS * 3);
    const col = new Float32Array(MAX_SPARKS * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.sparkGeo = geo;
    this.sparks = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 3.2, map: dotTexture(), vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      sizeAttenuation: true, fog: false,
    }));
    this.sparks.frustumCulled = false;
    this.sparks.renderOrder = 8;
    g.add(this.sparks);
    /** Live particles: {x,y,z, vx,vy,vz, life, max, r,g,b, rocket?, drag} */
    this.parts = [];

    this._loadArt();
    this.refresh();
    // Repaint once the web fonts are in: a canvas drawn before Bangers loads
    // is drawn in the fallback and stays that way until the next slide.
    document.fonts?.ready?.then(() => this._paint());
  }

  /* ------------------------------ the data ------------------------------ */

  /**
   * Re-read the boards. Called on every commit and at the top of each cycle.
   * `mode` jumps straight to that league's champion — a win the girls have
   * just signed should be the next thing on the screen, not two minutes away.
   */
  refresh(mode = null) {
    this.slides = buildSlides(readBoards());
    this._paintTicker();
    const at = mode ? this.slides.findIndex((s) => s.kind === 'champ' && s.mode === mode) : -1;
    this._show(at >= 0 ? at : 0);
  }

  get slide() {
    return this.slides[this.index] ?? null;
  }

  _show(i) {
    this.index = i;
    this.t = 0;
    this.flash.material.opacity = 0.55;
    this._paint();
    // A champion comes up to a volley.
    if (this.slide?.kind === 'champ' && this.hype > 0.1) {
      for (let k = 0; k < 3; k++) this._rocket(k * 0.18);
    }
  }

  /* ------------------------------ the art ------------------------------- */

  _loadArt() {
    if (typeof Image === 'undefined') return;
    const load = (src, done) => {
      const img = new Image();
      img.onload = () => { done(img); this._paint(); };
      img.onerror = () => {};  // a missing file is a slide without a picture
      img.src = src;
    };
    for (const s of PLAYER_STYLE) {
      const art = CHAMP_ART[s.sheet];
      if (!art) continue;
      load(art.src, (img) => {
        this.art.cats[s.name] = s.recolour ? recoloured(img, s.recolour) : img;
      });
    }
    for (const [k, src] of Object.entries(SATAN_POSES)) {
      load(src, (img) => { this.art.satan[k] = img; });
    }
  }

  /* ----------------------------- the frame ------------------------------ */

  /**
   * Called by `Game._renderView` for every lens that draws. "Fireworks and
   * sparks ... when players are viewing it": this is what "viewing" means —
   * the glass's middle is inside that lens's frustum, the lens is on the front
   * side of it, and close enough to make it out.
   */
  see(camera) {
    if (!this.group.visible || !camera) return;
    const B = this.B;
    if (camera.position.x > B.face - 1) return;           // behind the stands
    const d = camera.position.distanceTo(_v.set(B.x, B.y, B.z));
    if (d > 320) return;
    camera.updateMatrixWorld();
    _v.project(camera);
    if (Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1 || _v.z > 1) return;
    this._seen = 1;
    this._seenDist = Math.min(this._seenDist, d);
  }

  update(dt) {
    const open = !!this.world.arenaOpen;
    this.group.visible = open;
    if (!open) { this.hype = 0; this.parts.length = 0; this.sparkGeo.setDrawRange(0, 0); return; }
    this._clock += dt;

    // Last frame's renders said whether anyone could see it.
    const seen = this._seen;
    const dist = this._seenDist;
    this._seen = 0;
    this._seenDist = Infinity;
    this.hype += ((seen ? 1 : 0) - this.hype) * Math.min(1, dt * 2.5);

    // The cycle.
    this.t += dt;
    const S = this.slide;
    if (!S || this.t >= S.dur) {
      const next = this.index + 1;
      if (next >= this.slides.length) this.refresh();
      else this._show(next);
    }
    /* A SLIDE PAINTED BEFORE ITS ART ARRIVED IS PAINTED AGAIN WHEN IT DOES.
       `onload` repaints too, and the first render in the browser still showed
       Mr. Satan's record with no Mr. Satan in it, so this does not trust it:
       it counts what has loaded, which costs nothing, and repaints once when
       the count moves. */
    if (this._artCount() !== this._paintedWith) this._paint();
    const slide = this.slide;
    const loud = slideHype(slide, this.t) * this.hype;

    this.flash.material.opacity = Math.max(0, this.flash.material.opacity - dt * 1.6);
    this.tickTex.offset.x = (this.tickTex.offset.x + dt * 0.035) % 1;

    this._bulbs(slide, loud);
    const pulse = 0.5 + 0.5 * Math.sin(this._clock * 3.1);
    this.glow.material.opacity = 0.28 + 0.2 * pulse + 0.35 * loud;
    for (const b of this.beams) {
      const a = Math.sin(this._clock * 0.6 + (b.side > 0 ? 1.7 : 0));
      // Leaning out over the road (-x), sweeping along the wall away from each other.
      b.mesh.rotation.set(b.side * (0.3 + 0.25 * a), 0, 0.35 + 0.15 * Math.cos(this._clock * 0.45 + b.side));
      b.mesh.material.opacity = 0.12 + 0.3 * Math.max(this.hype, 0.25) + 0.2 * loud;
    }

    // Fireworks while somebody is watching. "Especially when it mentions Mr.
    // Satan": the rocket rate follows the slide's hype.
    if (loud > 0.05) {
      this._rocketT -= dt * (0.35 + 1.4 * loud);
      if (this._rocketT <= 0) { this._rocketT = 0.6 + Math.random() * 0.5; this._rocket(0); }
      this._fountT += dt * 55 * loud;
      while (this._fountT >= 1) { this._fountT -= 1; this._fountain(); }
    }
    this._sparks(dt, dist);
  }

  _bulbs(slide, loud) {
    const satan = slide && (slide.kind === 'satan' || slide.kind === 'ad');
    const speed = 5 + 14 * loud;
    const head = this._clock * speed;
    for (let i = 0; i < this.bulbCount; i++) {
      const on = ((i - head) % 6 + 6) % 6 < 2;
      if (satan) _c.setHSL(((i / this.bulbCount) + this._clock * 0.25) % 1, 1, on ? 0.62 : 0.2);
      else _c.setRGB(on ? 1 : 0.35, on ? 0.84 : 0.22, on ? 0.42 : 0.08);
      this.bulbs.setColorAt(i, _c);
    }
    this.bulbs.instanceColor.needsUpdate = true;
  }

  /* ---------------------------- the fireworks --------------------------- */

  _rocket(delay = 0) {
    const B = this.B;
    const sz = Math.random() < 0.5 ? -1 : 1;
    this.parts.push({
      x: B.face - 1.2, y: B.top, z: B.z + sz * (B.w / 2 - 2 + Math.random() * 3),
      vx: -2 - Math.random() * 3, vy: 22 + Math.random() * 8, vz: -sz * (1 + Math.random() * 3),
      life: 0.9 + Math.random() * 0.35 + delay, max: 2, r: 1, g: 0.9, b: 0.6, rocket: true, wait: delay,
    });
  }

  _burst(p) {
    const hue = Math.random();
    const n = 70;
    for (let i = 0; i < n && this.parts.length < MAX_SPARKS; i++) {
      // Points on a sphere, a shell rather than a blob.
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const v = 11 + Math.random() * 3;
      _c.setHSL((hue + (i % 3) * 0.08) % 1, 1, 0.6);
      this.parts.push({
        x: p.x, y: p.y, z: p.z, vx: s * Math.cos(a) * v, vy: u * v, vz: s * Math.sin(a) * v,
        life: 1.2 + Math.random() * 0.5, max: 1.7, r: _c.r, g: _c.g, b: _c.b, drag: 1.6,
      });
    }
    this._boom(p);
  }

  _fountain() {
    if (this.parts.length >= MAX_SPARKS) return;
    const B = this.B;
    const sz = Math.random() < 0.5 ? -1 : 1;
    this.parts.push({
      x: B.face - 1, y: B.bottom + 0.2, z: B.z + sz * (B.w / 2 + 1.3),
      vx: -3 - Math.random() * 4, vy: 9 + Math.random() * 6, vz: sz * (Math.random() * 3),
      life: 0.7 + Math.random() * 0.5, max: 1.2, r: 1, g: 0.75 + Math.random() * 0.2, b: 0.3, drag: 0.6,
    });
  }

  _boom(p) {
    if (!this.audio || !this._lastSeenDist) return;
    const d = this._lastSeenDist;
    const vol = Math.max(0, 1 - d / 240) * 0.55;
    if (vol > 0.03) this.audio.play('firework', vol);
  }

  _sparks(dt, dist) {
    if (Number.isFinite(dist)) this._lastSeenDist = dist;
    const out = [];
    for (const p of this.parts) {
      if (p.wait > 0) { p.wait -= dt; p.life -= dt; out.push(p); continue; }
      p.life -= dt;
      if (p.rocket) {
        if (p.life <= 0) { this._burst(p); continue; }
        // A trail, so the rocket reads as going up rather than as a dot.
        if (this.parts.length + out.length < MAX_SPARKS) {
          out.push({ x: p.x, y: p.y, z: p.z, vx: 0, vy: -1, vz: 0, life: 0.35, max: 0.35, r: 1, g: 0.7, b: 0.3 });
        }
      } else if (p.life <= 0) continue;
      const k = p.drag ? Math.exp(-p.drag * dt) : 1;
      p.vx *= k; p.vz *= k; p.vy = p.vy * k - 9.8 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      out.push(p);
    }
    this.parts = out;
    const pos = this.sparkGeo.attributes.position.array;
    const col = this.sparkGeo.attributes.color.array;
    let n = 0;
    for (const p of out) {
      if (n >= MAX_SPARKS) break;
      if (p.wait > 0) continue;
      const f = Math.max(0, Math.min(1, p.life / p.max));
      pos[n * 3] = p.x; pos[n * 3 + 1] = p.y; pos[n * 3 + 2] = p.z;
      col[n * 3] = p.r * f; col[n * 3 + 1] = p.g * f; col[n * 3 + 2] = p.b * f;
      n++;
    }
    this.sparkGeo.setDrawRange(0, n);
    // No upload for an empty sky, which is most frames.
    if (n || this._sparkN) {
      this.sparkGeo.attributes.position.needsUpdate = true;
      this.sparkGeo.attributes.color.needsUpdate = true;
    }
    this._sparkN = n;
  }

  /* ----------------------------- the canvas ----------------------------- */

  _artCount() {
    return Object.keys(this.art.cats).length + Object.keys(this.art.satan).length;
  }

  _paint() {
    const slide = this.slide;
    if (!slide) return;
    this._paintedWith = this._artCount();
    const c = this.ctx;
    c.save();
    c.clearRect(0, 0, CW, CH);
    if (slide.kind === 'champ') this._paintChamp(c, slide);
    else if (slide.kind === 'hm') this._paintHM(c, slide);
    else if (slide.kind === 'satan') this._paintSatan(c, slide);
    else this._paintAd(c, slide);
    c.restore();
    this.tex.needsUpdate = true;
  }

  _paintChamp(c, s) {
    const style = catStyle(s.row.cat);
    const colour = style ? cssFor(style) : '#ffd66b';
    sunburst(c, '#5a0f1c', '#8f1f2c', '#ffcf4a', 0.18);
    header(c, `${leagueName(s.mode)} CHAMPION`, '#ffd66b');
    const img = style ? this.art.cats[style.name] : null;
    if (img) c.drawImage(img, 10, 70, 590, 590);
    else mystery(c, this.art.cats.Ember, 10, 70, 590);
    const x = 640;
    text(c, s.row.name, x, 250, 190, '#ffffff', colour, 14, 600);
    text(c, style ? `as ${style.name.toUpperCase()}` : 'a mystery kitten', x, 318, 52, colour, '#1a0508', 8);
    text(c, `${fmt(s.row.score)} PTS`, x, 430, 104, '#ffd66b', '#3a0a10', 12, 600);
    const mins = Math.floor(s.row.seconds / 60);
    const secs = String(s.row.seconds % 60).padStart(2, '0');
    body(c, `${s.row.wins} WINS · ${s.row.dealt} DEALT · ${s.row.taken} TAKEN · ${mins}:${secs}`, x, 492, 30, '#ffe9c2');
    if (s.row.mates?.length) {
      body(c, `with ${s.row.mates.map((m) => m.toUpperCase()).join(' & ')}`, x, 540, 34, '#ffffff');
    }
    body(c, 'Beat this score to take the board!', x, 612, 30, '#ffd66b');
    if (s.fresh) badge(c, 1150, 128, 'NEW!');
  }

  _paintHM(c, s) {
    sunburst(c, '#141a44', '#28306e', '#9fb4ff', 0.12);
    header(c, `HONORABLE MENTIONS · ${leagueName(s.mode)}`, '#cfd9ff');
    const n = s.rows.length;
    s.rows.forEach((row, i) => {
      const cx = n === 1 ? CW / 2 : CW / 2 + (i === 0 ? -300 : 300);
      const style = catStyle(row.cat);
      const colour = style ? cssFor(style) : '#9aa0b8';
      const medal = i === 0 ? '#d9e2f0' : '#e0a060';
      faceCoin(c, style ? this.art.cats[style.name] : null, style, cx, 290, 150, colour, this.art.cats.Ember);
      disc(c, cx - 118, 170, 44, medal, `#${i + 2}`);
      text(c, row.name, cx, 530, 104, '#ffffff', colour, 10, 520, 'center');
      body(c, `${style ? style.name.toUpperCase() : '???'} · ${fmt(row.score)} PTS`, cx, 590, 34, '#dfe6ff', 'center');
    });
  }

  _paintSatan(c, s) {
    const R = s.rec;
    sunburst(c, '#7a1206', '#c8261a', '#ffd23a', 0.26);
    header(c, `${leagueName(s.mode)} CHAMPION`, '#fff2b0');
    const img = this.art.satan[R.pose];
    if (img) c.drawImage(img, 0, 60, 600, 600);
    const x = 620;
    text(c, 'MR. SATAN', x, 200, 150, '#ffffff', '#b00d0d', 14, 640);
    text(c, SATAN_TAGLINE[0], x, 262, 50, '#ffd23a', '#3a0000', 8, 640);
    text(c, SATAN_TAGLINE[1], x, 316, 50, '#ffffff', '#3a0000', 8, 640);
    text(c, `${fmt(R.score)} PTS`, x, 420, 96, '#ffd23a', '#3a0000', 12, 640);
    body(c, R.stats, x, 474, 28, '#fff2d0');
    body(c, R.joke, x, 524, 30, '#ffffff', 'left', true);
    body(c, 'Nobody has won this league yet. Will YOU be first?', x, 604, 28, '#ffe08a');
  }

  _paintAd(c, s) {
    const A = SATAN_ADS[s.ad] ?? SATAN_ADS[0];
    // An infomercial: loud diagonal stripes, nothing like the records.
    c.fillStyle = '#ff3fa4';
    c.fillRect(0, 0, CW, CH);
    c.save();
    c.translate(CW / 2, CH / 2);
    c.rotate(-0.35);
    c.fillStyle = '#ffd400';
    for (let i = -20; i < 20; i++) c.fillRect(i * 110, -900, 55, 1800);
    c.restore();
    c.fillStyle = 'rgba(40,0,40,0.35)';
    c.fillRect(0, 0, CW, CH);
    const img = this.art.satan[A.pose];
    if (img) c.drawImage(img, 690, 40, 620, 620);
    text(c, 'A MESSAGE FROM THE CHAMP', 50, 90, 44, '#ffffff', '#5a0033', 8);
    text(c, A.head, 50, 250, 96, '#fff45c', '#5a0033', 14, 630);
    body(c, A.line, 50, 330, 38, '#ffffff', 'left', false, 660);
    body(c, `*${A.small}`, 50, 625, 26, '#ffe6f4', 'left', true, 660);
    burst(c, 330, 490, 'HOO HOO HOO!');
  }

  _paintTicker() {
    const c = this.tickCtx;
    const W = this.tickCanvas.width;
    const H = this.tickCanvas.height;
    c.fillStyle = '#12060a';
    c.fillRect(0, 0, W, H);
    const bits = ['WORLD MARTIAL ARTS TOURNAMENT'];
    for (const s of this.slides) {
      if (s.kind === 'champ') bits.push(`${leagueName(s.mode)}: ${s.row.name} (${s.row.cat ?? '?'}) ${fmt(s.row.score)}`);
      if (s.kind === 'satan') bits.push(`${leagueName(s.mode)}: MR. SATAN, OBVIOUSLY`);
    }
    bits.push('TODAY\'S FORECAST: 100% CHANCE OF MR. SATAN', 'PLEASE DO NOT FEED THE CHAMPION');
    c.font = '40px Bangers, sans-serif';
    c.textBaseline = 'middle';
    let x = 20;
    let i = 0;
    // Fill the whole strip, round and round, so the wrap has no gap in it.
    while (x < W) {
      const t = `★ ${bits[i % bits.length]}  `;
      c.fillStyle = i % 2 ? '#ffd66b' : '#ffffff';
      c.fillText(t, x, H / 2 + 2);
      x += c.measureText(t).width;
      i++;
    }
    this.tickTex.needsUpdate = true;
  }
}

/* --------------------------- canvas helpers ----------------------------- */

const _v = new THREE.Vector3();
const _c = new THREE.Color();

const fmt = (n) => Math.round(n).toLocaleString('en-US');

function sunburst(c, inner, outer, ray, rayA) {
  const g = c.createRadialGradient(CW * 0.3, CH * 0.5, 40, CW * 0.3, CH * 0.5, CW * 0.9);
  g.addColorStop(0, outer);
  g.addColorStop(1, inner);
  c.fillStyle = g;
  c.fillRect(0, 0, CW, CH);
  c.save();
  c.translate(CW * 0.25, CH * 0.55);
  c.globalAlpha = rayA;
  c.fillStyle = ray;
  for (let i = 0; i < 24; i++) {
    c.rotate((Math.PI * 2) / 24);
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(1600, -90);
    c.lineTo(1600, 90);
    c.closePath();
    c.fill();
  }
  c.restore();
}

function header(c, s, colour) {
  c.fillStyle = 'rgba(0,0,0,0.45)';
  c.fillRect(0, 0, CW, 64);
  c.fillStyle = colour;
  c.fillRect(0, 62, CW, 4);
  text(c, s, CW / 2, 50, 50, colour, '#000000', 6, CW - 40, 'center');
}

function text(c, s, x, y, size, fill, stroke, lw, maxW = CW, align = 'left') {
  c.font = `${size}px Bangers, sans-serif`;
  c.textAlign = align;
  c.textBaseline = 'alphabetic';
  c.lineJoin = 'round';
  c.lineWidth = lw;
  c.strokeStyle = stroke;
  c.strokeText(s, x, y, maxW);
  c.fillStyle = fill;
  c.fillText(s, x, y, maxW);
}

function body(c, s, x, y, size, fill, align = 'left', italic = false, maxW = 620) {
  c.font = `${italic ? 'italic ' : ''}800 ${size}px Nunito, system-ui, sans-serif`;
  c.textAlign = align;
  c.textBaseline = 'alphabetic';
  c.lineWidth = 5;
  c.lineJoin = 'round';
  c.strokeStyle = 'rgba(0,0,0,0.55)';
  // Wrap on words rather than squash: a joke squashed to fit is unreadable.
  const words = s.split(' ');
  let line = '';
  let yy = y;
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (c.measureText(t).width > maxW && line) {
      c.strokeText(line, x, yy); c.fillStyle = fill; c.fillText(line, x, yy);
      line = w; yy += size * 1.2;
    } else line = t;
  }
  c.strokeText(line, x, yy);
  c.fillStyle = fill;
  c.fillText(line, x, yy);
}

function badge(c, x, y, s) {
  c.save();
  c.translate(x, y);
  c.rotate(0.2);
  c.fillStyle = '#ffe600';
  c.beginPath();
  for (let i = 0; i < 24; i++) {
    const r = i % 2 ? 58 : 84;
    const a = (i / 24) * Math.PI * 2;
    c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  c.closePath();
  c.fill();
  c.lineWidth = 5;
  c.strokeStyle = '#b00d0d';
  c.stroke();
  text(c, s, 0, 16, 50, '#b00d0d', '#ffffff', 4, 140, 'center');
  c.restore();
}

function burst(c, x, y, s) {
  c.save();
  c.translate(x, y);
  c.rotate(-0.12);
  c.fillStyle = '#ffffff';
  c.beginPath();
  for (let i = 0; i < 28; i++) {
    const r = i % 2 ? 90 : 128;
    const a = (i / 28) * Math.PI * 2;
    c.lineTo(Math.cos(a) * r * 1.3, Math.sin(a) * r * 0.65);
  }
  c.closePath();
  c.fill();
  text(c, s, 0, 14, 46, '#ff2f8e', '#5a0033', 3, 300, 'center');
  c.restore();
}

function disc(c, x, y, r, fill, s) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = 5;
  c.strokeStyle = '#1a1a2a';
  c.stroke();
  text(c, s, x, y + 16, 46, '#1a1a2a', '#ffffff', 3, 90, 'center');
}

/** A face in a coin, cropped by the MEASURED box in `CHAMP_ART`. */
function faceCoin(c, img, style, cx, cy, r, ring, fallback) {
  c.save();
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.fillStyle = '#0b0e24';
  c.fill();
  c.clip();
  const art = style ? CHAMP_ART[style.sheet] : CHAMP_ART.ember;
  const src = img ?? fallback;
  if (src && art) {
    // The art may have been recoloured onto a canvas the same size, or loaded
    // at a size other than the 640 it was measured at: scale the box with it.
    const k = (src.width || 640) / 640;
    const [fx, fy, fs] = art.face;
    if (!img) c.filter = 'brightness(0)';
    c.drawImage(src, fx * k, fy * k, fs * k, fs * k, cx - r, cy - r, r * 2, r * 2);
    c.filter = 'none';
  }
  c.restore();
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.lineWidth = 12;
  c.strokeStyle = ring;
  c.stroke();
  if (!img) text(c, '?', cx, cy + 50, 150, '#ffffff', '#000000', 8, 200, 'center');
}

/** A row from before the board kept kittens: a silhouette and a question. */
function mystery(c, img, x, y, s) {
  if (img) {
    c.save();
    c.filter = 'brightness(0)';
    c.globalAlpha = 0.8;
    c.drawImage(img, x, y, s, s);
    c.restore();
  }
  text(c, '?', x + s / 2, y + s * 0.62, 260, '#ffffff', '#000000', 10, s, 'center');
}

/** Storm's and Blossom's champion: the base sheet through their recolour. */
function recoloured(img, opts) {
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth || img.width;
  cv.height = img.naturalHeight || img.height;
  const x = cv.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, cv.width, cv.height);
  recolourPixels(d.data, opts);
  x.putImageData(d, 0, 0);
  return cv;
}

function dotTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A glow that is bright at the frame and empty over the glass. */
function ringGlowTexture(w, h) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = Math.round(512 * (h + 12) / (w + 12));
  const c = cv.getContext('2d');
  const sx = cv.width / (w + 12);
  const ix = 6 * sx; const iy = 6 * sx;
  for (let i = 0; i < 24; i++) {
    const k = i / 24;
    c.strokeStyle = `rgba(255,214,120,${(1 - k) * 0.16})`;
    c.lineWidth = 2 * sx;
    const p = k * 5.8 * sx;
    c.strokeRect(ix - p, iy - p, cv.width - 2 * (ix - p), cv.height - 2 * (iy - p));
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Bright at the lamp, gone by the top of the beam. */
function beamTexture() {
  const cv = document.createElement('canvas');
  cv.width = 4; cv.height = 128;
  const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 128, 0, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
