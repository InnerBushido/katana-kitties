/* ---------------------------------------------------------------------------
   WHAT PAYNE'S INTRODUCTION PUTS IN THE WORLD FOR ITSELF, and takes away.

   Two things, both owned by the scene and both gone in `stop` — which the
   skip runs too (seventh non-negotiable: nothing hangs off it finishing).

   (Three, strictly: `_arena` draws the arena island for "win the arena"
   too, and puts it back as it was.)

   A FURNISHED SKY ISLAND. "Buy a home in the sky" was said over empty sky.
   Richard, Oct 2026: "if we want to show the 'castles you can build' during
   the cutscene, we can temporarily spawn one of the islands and furnish it
   with a castle and a few buildings with bridges connecting on 2nd or 3rd
   floor and some outdoor Japanese themed decorations like shrine, zen
   garden, onsen, tea house, farm and animals ... we can use the farm
   animals for when we mention animals". So one of Roshi's islands NOBODY
   OWNS gets a castle, a dojo house and a minka, a rope bridge between upper
   floors, and a yard — laid out by the editor's own rules (`houseWhy`,
   `linkWhy`, `autoLayout`), so it is a home a kitten could really build and
   never one that clips. It is drawn by the real `HomeIsle.setHome`, and the
   pen's animals are the real farm's. IT NEVER TOUCHES THE STORE: the row is
   handed to the isle and nowhere else, so nothing is saved, nothing is
   owned, and `stop` hands the isle back what the store says it holds.
   An island somebody owns is never borrowed — her home is hers — and with
   all four owned the shot looks at the first of them as it is.

   A SKY ABOVE THE SKY, for the blast-off at the end. The world's sky is a
   sphere of 2600 round the origin and its fog is gone by 1900, so a lens
   2600 up sees a flat orange nothing. The scene's own dome rides on the
   lens, darkens to space with its altitude and lights stars, and the fog is
   pushed out by the same altitude so the town shrinks rather than whiting
   out. Both are read off the camera's height EVERY frame, so the cut back
   down to the market undoes them by itself; `stop` puts the fog back exactly.
--------------------------------------------------------------------------- */
import * as THREE from 'three';
import { newHome } from './housing/homestore.js';
import { houseWhy, autoLayout, defaultWindows } from './housing/editor.js';
import { portSpots, linkWhy, linkBlockers } from './housing/links.js';

/** The yard, in the order the editor gets to place it (big things first). */
const YARD = ['pen', 'onsen', 'zengarden', 'shrine', 'teahouse', 'bamboofarm', 'koipond',
  'cherry', 'cherry', 'cherry', 'lantern', 'lantern', 'lantern', 'lantern', 'belltower'];
const ROOM = ['futon', 'kotatsu', 'andon', 'tansu'];
/** The colours the borrowed castle is painted in: the game's warm red. */
const PAINT = [0xff7a3c];

/** Which of Roshi's islands the scene furnishes: the first nobody owns. */
export function showcaseIsle(game) {
  const Hs = game.housing;
  const isles = Hs?.isles ?? [];
  const I = isles.find((J) => !Hs.store?.homes?.[J.site.id]) ?? isles[0] ?? null;
  return I ? { isle: I, x: I.x, y: I.groundY, z: I.z, owned: !!Hs.store?.homes?.[I.site.id] } : null;
}

/** Lay the showcase row: pure over the editor's rules, so world-check can run it. */
export function showcaseHome(I, env) {
  const H = newHome(I.site.id, 'castle', []);
  // spiral out from the middle for the annexes, so they sit close and a bridge can reach
  const spots = [];
  for (let x = -36; x <= 36; x += 4) for (let z = -36; z <= 36; z += 4) spots.push({ x, z });
  spots.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  const place = (house) => {
    for (const s of spots) {
      if (houseWhy(H, { hk: null, house, x: s.x, z: s.z, rot: 0 }, env)) continue;
      H.uid = (H.uid ?? 0) + 1;
      (H.annex ??= []).push({ uid: H.uid, house, x: s.x, z: s.z, rot: 0, paid: 0, free: true });
      return 'a' + H.uid;
    }
    return null;
  };
  const link = (hkA, fa, hkB, fb, style) => {
    if (!hkA || !hkB) return false;
    const ports = portSpots(H, 2.6, env.gyAt);
    for (const A of ports.filter((q) => q.hk === hkA && q.floor === fa)) {
      for (const B of ports.filter((q) => q.hk === hkB && q.floor === fb)) {
        const L = { a: A, b: B, style };
        if (linkWhy(H, L, env) || linkBlockers(H, L, env).length) continue;
        H.uid++;
        (H.links ??= []).push({ uid: H.uid, a: { ...A }, b: { ...B }, style, paid: 0 });
        return true;
      }
    }
    return false;
  };
  const dojo = place('dojohouse');
  const minka = place('minka');
  // the bridge Richard asked for is between UPPER floors; the second is a bonus
  const high = link('main', 1, dojo, 1, 'rope') || link('main', 2, dojo, 1, 'rope');
  link('main', 0, minka, 0, 'plank');
  defaultWindows(H);
  autoLayout(H, { room: ROOM, yard: YARD }, I, env);
  return { H, high };
}

/** A gradient from deep blue at the horizon to black overhead, faded by `a`. */
const DOME_VERT = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const DOME_FRAG = `uniform float a; varying vec3 vDir;
void main(){ float u = clamp(vDir.y * 1.4 + 0.25, 0.0, 1.0);
  vec3 c = mix(vec3(0.06, 0.10, 0.26), vec3(0.0, 0.0, 0.02), u);
  gl_FragColor = vec4(c, a); }`;
/** Altitude above her at which space starts to show, and is all there is. */
export const SPACE = { from: 250, to: 1500, stars: 900 };

export class IntroSet {
  constructor(game) {
    this.game = game;
    this.isle = null;
    this.home = null;
    this.pen = null;
    this.facing = 0;
  }

  start() {
    this._furnish();
    this._arena(true);
    this._space();
  }

  /**
   * THE ARENA, DRAWN AND NOT OPENED. "Win the arena" was said over an empty
   * patch of sky: it rises at 80%, and the first meeting is long before
   * that. `World.openArena` is four facts — the island, its furniture, the
   * ground answering out there, and its road — and a scene that never lets
   * anybody walk wants only the first two, so only their meshes go on, and
   * `stop` puts back exactly what each one was.
   */
  _arena(on) {
    const W = this.game.world;
    if (!W) return;
    if (on) {
      if (W.arenaOpen) return;
      const parts = [W.arenaMesh, W.arenaProps, W.arenaSeeThrough, W.arenaLanterns,
        ...(W.arenaDoorLeaves ?? []).map((L) => L.mesh)].filter(Boolean);
      this.arenaWas = parts.map((m) => [m, m.visible]);
      for (const m of parts) m.visible = true;
    } else {
      for (const [m, v] of this.arenaWas ?? []) m.visible = v;
      this.arenaWas = null;
    }
  }

  /** Per line: nothing yet — the island is up for the whole scene. */
  line() {}

  _furnish() {
    const g = this.game;
    const Hs = g.housing;
    const S = showcaseIsle(g);
    if (!S) return;
    const I = S.isle;
    this.isle = I;
    // which way the shot looks at it: from outside, back toward the home island
    this.facing = Math.atan2(-I.z, -I.x);
    this.home = { x: I.x, y: I.groundY, z: I.z };
    if (!S.owned) {
      try {
        const { H } = showcaseHome(I, Hs.envOf(I));
        I.setHome(H, PAINT);
        this.borrowed = true;
        Hs.farm?.sync?.();
        Hs.koi?.sync?.();
      } catch (e) {
        // a yard the editor refuses is a scene with an empty island, never a stopped one
        console.warn('payne intro: showcase island not furnished', e);
        this._unfurnish();
      }
    }
    /* KEPT UP WHILE IT PLAYS. `Housing._showIsles` hides every island until
       the ending raises them, and it runs every frame; this is what it asks. */
    Hs.showcase = I;
    I.group.visible = true;
    I.group.position.y = 0;
    const P = I.placeOf?.('pen');
    this.pen = P ? { x: P.x, y: P.y, z: P.z } : null;
  }

  _unfurnish() {
    const Hs = this.game.housing;
    const I = this.isle;
    if (Hs && Hs.showcase === I) Hs.showcase = null;
    if (I && this.borrowed) {
      const H = Hs.store?.homes?.[I.site.id] ?? null;
      I.setHome(H, H ? Hs.coloursOf(H) : null);
      Hs.farm?.sync?.();
      Hs.koi?.sync?.();
      Hs.angling?.sync?.();
    }
    Hs?._showIsles?.();
    this.borrowed = false;
    this.isle = null;
    this.pen = null;
  }

  _space() {
    if (this.dome || typeof document === 'undefined') return;
    /* DRAWN BEFORE THE WORLD AND OVER THE SKY: in the opaque list (so it is
       not sorted after the town, which a transparent dome with no depth test
       would cover), right after the sky's -100, and blended by hand — three
       turns blending off for an opaque NormalBlending material. */
    const blend = { blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor };
    this.domeMat = new THREE.ShaderMaterial({
      vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, uniforms: { a: { value: 0 } },
      side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false, ...blend,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1200, 24, 12), this.domeMat);
    this.dome.renderOrder = -99;
    this.dome.frustumCulled = false;
    const n = 900;
    const pos = new Float32Array(n * 3);
    // seeded, so every showing has the same sky (the skill's rule for crowds)
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const y = 0.05 + rnd() * 0.95;
      const t = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(t) * r * 1100, y * 1100, Math.sin(t) * r * 1100], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({
      color: 0xfff6e0, size: 2.5, sizeAttenuation: false, depthTest: false, depthWrite: false,
      fog: false, transparent: false, opacity: 0, ...blend,
    });
    this.stars = new THREE.Points(geo, this.starMat);
    this.stars.renderOrder = -98;
    this.stars.frustumCulled = false;
    this.dome.visible = this.stars.visible = false;
    this.game.scene?.add(this.dome, this.stars);
    const F = this.game.scene?.fog;
    this.fog = F ? { near: F.near, far: F.far } : null;
  }

  /** Off the lens's height above her: the dome, the stars and the fog. */
  update(dt, cam) {
    if (!this.dome || !cam) return;
    const base = this.game.payne?.position?.y ?? 0;
    const alt = Math.max(0, cam.position.y - base);
    const a = Math.max(0, Math.min(1, (alt - SPACE.from) / (SPACE.to - SPACE.from)));
    const on = a > 0;
    this.dome.visible = this.stars.visible = on;
    this.dome.position.copy(cam.position);
    this.stars.position.copy(cam.position);
    this.domeMat.uniforms.a.value = a;
    this.starMat.opacity = Math.max(0, Math.min(1, (alt - SPACE.stars) / (SPACE.to - SPACE.stars)));
    const F = this.game.scene?.fog;
    if (F && this.fog) {
      const up = alt > 40 ? alt : 0;
      F.near = this.fog.near + up;
      F.far = this.fog.far + up * 1.4;
    }
  }

  stop() {
    this._unfurnish();
    this._arena(false);
    if (this.dome) {
      this.dome.parent?.remove(this.dome);
      this.stars.parent?.remove(this.stars);
      this.dome.geometry.dispose();
      this.stars.geometry.dispose();
      this.domeMat.dispose();
      this.starMat.dispose();
      this.dome = this.stars = null;
    }
    const F = this.game.scene?.fog;
    if (F && this.fog) { F.near = this.fog.near; F.far = this.fog.far; }
    this.fog = null;
  }
}
