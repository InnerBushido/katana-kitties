import * as THREE from 'three';
import { atlasClone } from '../../core/gfx.js';
import { PLAYER_STYLE } from '../../core/palette.js';
import { HOLO } from '../../world/simworld.js';
import { CRITTER_BY_ID } from '../../entities/critter.js';
import { ORB_BY_ID } from '../../entities/powerorb.js';
import { holoSolid, holoMat, HoloKitten } from './targets.js';
import { HoloCritter, PEN_AT, PEN_R, RING_AT } from './school.js';
import { Fruit, lob, G as STORM_G, FRUIT } from './storm.js';
import { FighterCard, RANKS } from './rank.js';
import { buildGhost, runGhost, makeKata, kataTimeline } from './kata.js';

/* ---------------------------------------------------------------------------
   THE TOUR'S CAST — what the islands are DOING while Lionheart names them.

   Richard, on Payne's tour: "When saying 'real sword skills' and showing the
   tameshigiri range, we should have some bamboo to cut shown and can maybe
   show some of them getting cut and playing the 'cut down' animation. In the
   Arena School, should have some animals running around and 4 players
   fighting each other and can show the [trading-card-style] Kenshi card here
   with some data on it (can be Lionhearts data, so can be very high values),
   can have it facing the camera so it can be seen and can be rotating ...
   Let's make sure to show gameplay for these islands during the cutscene.
   For Kata, we can stay on the Kata Trace longer so that we can actually show
   Lionheart doing a kata routine on there." Every island the lens stopped on
   was an empty floor: nobody plays in the simulator during a tour.

   THE SCENE'S OWN ACTORS, the game-cutscene-director's rule and the tour's
   Shadow's (dream/tourshadow.js): nothing here is on the training gate, so
   nothing can be hit, scored or counted. But each is built from the CLASS
   the island really uses — a `HoloKitten` for a kitten, `HoloCritter` for
   the pen, `Fruit` for the storm, the Kata floor's own ghost and its own
   routine, the Fighter Card — so the tour cannot show a thing the island
   does not have.

   ON THE CLIP'S CLOCK. Everything is a pure function of `t`, the second of
   the line the lens is cued on (`StoryScene.update` passes the same `cue`),
   so a cane falls on the word and a check can ask where anything is at any
   second. Bursts and flashes fire as `t` crosses their moment.

   BUILT ONCE, AT THE START OF THE TOUR, hidden — so the shader warm-up
   (`Game.primeSim`) puts every one of them on the GPU while Payne is still
   talking, and the cut into the simulator does not pay for them.
--------------------------------------------------------------------------- */

/** Where each island's scene stands, in the island's own frame (`isleSpot`:
 *  `a` out along the bridge's line, `b` across it). The lens reads these too
 *  (dream/storyscene.js), so a shot aims at what is happening. */
export const STAGE = {
  /** Five canes in a row across the range, cut toward the lens. */
  range: { canes: [[3, -5.6], [3, -2.8], [3, 0], [3, 2.8], [3, 5.6]], behind: 1.7, cutY: 1.7 },
  /** The card floats over the school, between the pen and the ring. */
  school: { card: [-4, 0, 7.4], cardW: 6, pairs: 3.2 },
  storm: { centre: [0, 0] },
  /** Which of the four Kata floors he dances on — one on the bridge side. */
  kata: { floor: 1 },
};

/** The Kata floors' ring (KataHall: four floors 11 out, at the corners). */
export const KATA_RING = 11;
export function kataFloorAt(k) {
  const a = Math.PI / 4 + (k * Math.PI) / 2;
  return [Math.cos(a) * KATA_RING, Math.sin(a) * KATA_RING];
}

/** A spot on an island, in the layer: `isleSpot` with a height. */
export function isleAt(isle, a, b, y = 0) {
  const f = isle.fwd ?? { x: 1, z: 0 };
  return { x: isle.x + f.x * a - f.z * b, y: isle.y + y, z: isle.z + f.z * a + f.x * b };
}

/* ------------------------------ the schedules ----------------------------- */

/** THE RANGE, in seconds of `lion_tour_learn`: the lens swings onto it at
 *  4.2 ("real sword skills"), holds, and swings away at 6.1 ("how to
 *  fight"). Four of the five canes fall while it is there. */
export const RANGE_CUTS = [4.75, 5.2, 5.6, 6.0];
/** How a cut cane falls: it slides off the cut, tips over, lands, and then
 *  the hologram lets it go. Seconds after the cut. */
export const FELL = { slide: 0.12, tip: 0.62, lie: 1.1, fade: 0.5 };

/** Where a cut cane's top is, `s` seconds after the cut: how far it has
 *  tipped (radians), how far it has dropped, how far it has slid along the
 *  cut, and how solid it still is. Pure. */
export function caneFall(s, cutY) {
  if (s < 0) return { tip: 0, drop: 0, slide: 0, alpha: 1 };
  const slide = Math.min(1, s / FELL.slide) * 0.35;
  const k = Math.max(0, Math.min(1, (s - FELL.slide * 0.5) / FELL.tip));
  const tip = (Math.PI / 2) * k * k;
  const drop = (cutY - 0.22) * k * k;
  const gone = s - FELL.tip - FELL.lie;
  const alpha = gone < 0 ? 1 : Math.max(0, 1 - gone / FELL.fade);
  return { tip, drop, slide, alpha };
}

/** THE SCHOOL's fights, in seconds of `lion_tour_learn`: from the swing in
 *  ("how to fight", 6.1) to the end of the line. Two pairs, taking turns,
 *  every `gap`; each blow lands on the beat its index says. */
export const BOUTS = { from: 6.35, gap: 0.42, to: 11.2, hits: 5, lunge: 0.95 };
export function boutAt(k) {
  return { t: BOUTS.from + k * BOUTS.gap, pair: k % 2, attacker: (k >> 1) % 2 };
}
export const BOUT_N = Math.floor((BOUTS.to - BOUTS.from) / BOUTS.gap) + 1;

/** THE STORM, in seconds of `lion_tour_isles`: the lens pushes in from 1.75
 *  and lands on "aim", holds until the cut to the Kata at 4.4. The fruit is
 *  already in the air when it gets there, and she cuts one every ~0.4s from
 *  2.1 to 4.4: a 2.4s lob under the drill's own G climbs ~2m over its
 *  barrel, so it reads as thrown rather than slid (1.5s was ~0.6m). `land`
 *  is island-local; one purple virus is left to fall, the way the drill
 *  asks. */
export const STORM_T = 2.4;
export const STORM_FRUIT = [
  { t0: 0.3, kind: 'momo', launcher: 0, land: [1.6, -1.2] },
  { t0: 0.7, kind: 'mikan', launcher: 2, land: [-0.8, 1.8] },
  { t0: 1.05, kind: 'suika', launcher: 4, land: [1.2, 1.6] },
  { t0: 1.4, kind: 'nashi', launcher: 1, land: [-1.4, -1.4] },
  { t0: 1.6, kind: 'virus', launcher: 3, land: [2.6, 0.4], virus: true },
  { t0: 1.9, kind: 'momo', launcher: 5, land: [0.6, -2.0] },
  { t0: 2.25, kind: 'mikan', launcher: 0, land: [-1.6, 0.6] },
  { t0: 2.6, kind: 'nashi', launcher: 2, land: [1.0, 1.0] },
];
/** How far through its flight she cuts one: low, the way the drill wants. */
export const STORM_CUT_K = 0.74;

/** THE KATA, in seconds of `lion_tour_isles`: the lens cuts to his floor on
 *  "kata" (4.4), walks round it from "the maths of the circle" (5.7), and
 *  fades on "Earn stars" (8.27 -> 9.17). He keeps the floor's own tempo. */
export const KATA_BPM = 100;
export const KATA_T0 = 3.4;   // beat 0; his first move (beat 2) lands as the lens arrives
export const KATA_UNTIL = 9.3;

/**
 * THE KATA HE DOES: the first weekly-shaped routine (`makeKata`, so every
 * rule a real one keeps) whose moves inside the lens's time have a CUT, a
 * JUMP and a GUARD in them — a demo that only stepped would be a walk.
 * Pure and fixed: the same tour on every machine.
 */
export function tourKata() {
  const spb = 60 / KATA_BPM;
  const last = (KATA_UNTIL - 0.3 - KATA_T0) / spb;
  for (let k = 0; k < 200; k++) {
    const kata = makeKata('weekly', `tour-${k}`);
    const T = kataTimeline(kata);
    const seen = kata.steps.filter((s) => T.demo(s) <= last).map((s) => s.move);
    if (['cut', 'jump', 'guard', 'step'].every((m) => seen.includes(m))) return kata;
  }
  return makeKata('weekly', 'tour-0');
}

/** LIONHEART'S CARD: "can be Lionhearts data, so can be very high values".
 *  The same facts a kitten's card carries (`cardFacts`), his own way up. */
export function lionFacts() {
  const orb = ORB_BY_ID.tri;
  return {
    name: 'Lionheart',
    // The ladder's own top rung, not one invented for him: the line is
    // "climb the ranks of KENSHI", and this is where they end.
    rank: RANKS[RANKS.length - 1],
    next: null,
    toNext: null,
    stars: 9999,
    signature: { id: 'tri', text: orb ? `${orb.kanji} ${orb.name}` : '十 Juuji', stars: 3 },
    streak: 3650,
    shadow: true,
  };
}

/* --------------------------------- pieces -------------------------------- */

/** A kitten's drawing for a holo-kitten to wear, BY STYLE: her headset sheet
 *  if the simulator's drawings have landed, else her home one — sized the way
 *  `Player` sizes her, so the four stand at their own heights. */
export function styleSpec(game, i) {
  const home = game?.kittenArt?.[i];
  const vr = game?.simArt?.[i];
  const a = vr?.texture && vr.rows === home?.rows ? vr : home;
  if (!a?.texture || !home) return null;
  const st = PLAYER_STYLE[i] ?? PLAYER_STYLE[0];
  const sheet = game.sheets?.[st.sheet];
  const quad = (sheet?.height ?? 2.9) / (a.contentScale || 1);
  return {
    texture: a.texture,
    opts: {
      cols: a.cols, rows: a.rows, width: quad, height: quad, footOffset: (a.pad ?? 0) * quad,
      // The HOME sheet decides the mirror, as `_seatPlayer` does: the
      // headset look is worn on the billboard that sheet built.
      mirror: home.cols <= 4 && home.rows === 1, dirSense: sheet?.dirSense ?? 1, artFacesRight: true,
    },
  };
}

/** The arc of a swing, lying flat round her: the Kata ghost's shape. */
function slashArc(colour) {
  const m = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.8, 28, 1, -Math.PI * 0.42, Math.PI * 0.84).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0, toneMapped: false, depthWrite: false, side: THREE.DoubleSide }));
  m.position.y = 1.5;
  m.renderOrder = 6;
  return m;
}

/** A holo-cane in two pieces — the stump and the top that falls — drawn the
 *  way a range `Cane` is (dream/targets.js): the same holo solid, colour and
 *  nodes. */
function tourCane(h, cutY) {
  const colour = 0x6dffb0;
  const g = new THREE.Group();
  const part = (y0, y1) => {
    const p = new THREE.Group();
    const geo = new THREE.CylinderGeometry(0.2, 0.24, y1 - y0, 8, 2).translate(0, (y1 - y0) / 2, 0);
    p.add(holoSolid(geo, colour, 0.3));
    for (let k = 1; k < 5; k++) {
      const y = (h * k) / 5;
      if (y <= y0 || y >= y1) continue;
      const node = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.04, 5, 14), holoMat(colour, 0.9));
      node.rotation.x = Math.PI / 2;
      node.position.y = y - y0;
      p.add(node);
    }
    return p;
  };
  const stump = part(0, cutY);
  const top = part(cutY, h);
  top.position.y = cutY;
  // Each material's own opacity, so the top fades from what it was drawn at.
  top.traverse((o) => { if (o.material) o.material.userData.tourBase = o.material.opacity; });
  g.add(stump, top);
  // The cut, a bright ring at the stump's face once it is made.
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.26, 12).rotateX(-Math.PI / 2), holoMat(0xffffff, 0));
  face.position.y = cutY + 0.01;
  g.add(face);
  return { group: g, top, face, mats: [] };
}

const _q = new THREE.Quaternion();
const _ax = new THREE.Vector3();
const _e = new THREE.Euler();

export class TourCast {
  /** @param {object} dream the DreamDojo */
  constructor(dream) {
    this.dream = dream;
    this.group = null;
    this.line = null;
  }

  /** Everything, once, hidden, under the simulator's layer. Null without a
   *  simulator (a check, a build with no islands): there is nowhere to stand. */
  build() {
    if (this.group) return this.group;
    const D = this.dream;
    const root = D.sim?.root;
    const I = D.isles;
    if (!root || !I?.range || !I.school || !I.storm || !I.kata) return null;
    const g = D.game;
    this.group = new THREE.Group();
    this.group.name = 'tour-cast';
    this.group.visible = false;
    root.add(this.group);
    const spec = (i) => styleSpec(g, i);
    const kitten = (i, x, y, z, o = {}) => {
      const st = PLAYER_STYLE[i] ?? PLAYER_STYLE[0];
      const k = new HoloKitten({ parent: this.group, x, y, z, spec: spec(i), name: `${st.name}'s holo-kitten`, colour: o.colour ?? HOLO.cyan, ...o });
      k.styleIndex = i;
      k.arc = slashArc(o.colour ?? HOLO.cyan);
      k.group.add(k.arc);
      return k;
    };
    this.kittens = [];

    /* --- the range: five canes, and a kitten cutting them down --- */
    const R = STAGE.range;
    const ri = I.range;
    this.canes = R.canes.map(([a, b]) => {
      const at = isleAt(ri, a, b);
      const c = tourCane(4.2, R.cutY);
      c.group.position.set(at.x, at.y, at.z);
      this.group.add(c.group);
      c.at = at;
      c.local = [a, b];
      return c;
    });
    const c0 = isleAt(ri, R.canes[0][0] + R.behind, R.canes[0][1] - 2.4);
    this.cutter = kitten(0, c0.x, c0.y, c0.z);
    this.kittens.push(this.cutter);

    /* --- the school: the pen's animals, four fighters, and his card --- */
    const si = I.school;
    this.pen = { ...isleAt(si, ...PEN_AT), r: PEN_R };
    this.ringC = isleAt(si, ...RING_AT);
    const kinds = ['rat', 'rabbit', 'bird', 'rat', 'rabbit', 'bird'];
    this.critters = kinds.map((id, n) => {
      const kind = CRITTER_BY_ID[id];
      const c = new HoloCritter({ parent: this.group, x: this.pen.x, y: this.pen.y, z: this.pen.z, kind, home: this.pen, colour: HOLO.green });
      c.seed = n;
      return c;
    });
    this.fighters = [0, 1, 2, 3].map((i) => {
      const colour = PLAYER_STYLE[i]?.colour ?? HOLO.cyan;
      const f = kitten(i, this.ringC.x, this.ringC.y, this.ringC.z, { hits: BOUTS.hits, tint: colour, colour, barY: 3.6 });
      return f;
    });
    this.kittens.push(...this.fighters);
    this.card = new FighterCard({ w: STAGE.school.cardW });
    const cs = isleAt(si, STAGE.school.card[0], STAGE.school.card[1], STAGE.school.card[2]);
    this.card.position.set(cs.x, cs.y, cs.z);
    this.cardAt = cs;
    this.group.add(this.card);
    this._paintCard();

    /* --- the storm: a kitten, and the fruit the real launchers throw --- */
    const ti = I.storm;
    const sc = isleAt(ti, ...STAGE.storm.centre);
    this.stormer = kitten(1, sc.x, sc.y, sc.z);
    this.kittens.push(this.stormer);
    const launchers = D.storm?.launchers?.length ? D.storm.launchers : [{ x: ti.x + 14, y: ti.y + 1.7, z: ti.z }];
    this.fruit = STORM_FRUIT.map((s) => {
      const from = launchers[s.launcher % launchers.length];
      const land = isleAt(ti, s.land[0], s.land[1], FRUIT[s.kind].r);
      const vel = lob(from, land, STORM_T);
      const f = new Fruit({ parent: this.group, x: from.x, y: from.y, z: from.z, kind: s.kind, vel, floorY: ti.y, aim: land, T: STORM_T });
      f.spec = s;
      f.from = from;
      f.land = land;
      f.group.visible = false;
      if (f.mark) f.mark.visible = false;
      return f;
    });

    /* --- the Kata: his ghost, on the floor's own marks --- */
    this.kata = tourKata();
    const fl = D.kata?.floors?.[STAGE.kata.floor];
    const [fa, fb] = kataFloorAt(STAGE.kata.floor);
    this.floor = fl ?? { ...isleAt(I.kata, fa, fb), k: STAGE.kata.floor };
    const markAt = (i) => (D.kata?.markAt ? D.kata.markAt(this.floor, i) : { x: this.floor.x, y: this.floor.y, z: this.floor.z });
    this.ghostD = {
      ghost: buildGhost(D, this.group),
      kata: this.kata,
      kataFloor: this.floor,
      marks: this.kata.steps.map((s) => markAt(s.mark)),
    };
    this.hall = { markAt: (f, i) => markAt(i) };
    this.lastT = -1;
    return this.group;
  }

  _paintCard() {
    const art = this.dream.lionArt;
    this.card.paint(lionFacts(), '#ffd34a', art?.texture ? { texture: art.texture, opts: { cols: art.cols ?? 1, rows: art.rows ?? 1 } } : null);
  }

  /** The simulator's drawings landed after the cast was built: put the four
   *  kittens into their headset sheets, as `Player.setSimArt` does hers. */
  dress() {
    if (!this.group) return;
    for (const k of this.kittens) {
      const s = styleSpec(this.dream.game, k.styleIndex);
      if (!k.sprite || !s || k.sprite.tex?.image === s.texture.image) continue;
      k.sprite.setLook(k.sprite.makeLook(s.texture, s.opts));
    }
  }

  /** Every mesh the cast will draw, for the warm-up. */
  get roots() { return this.group ? [this.group] : []; }

  /** The textures it will draw with once dressed, for the warm-up — each
   *  billboard's own clone, which is what the GPU is asked for (a clone with
   *  other parameters than its sheet is its own upload). The Shadow's line
   *  builds his billboard as it starts, so his is a clone made the same way. */
  textures() {
    const out = this.kittens?.map((k) => k.sprite?.tex) ?? [];
    const sh = this.dream.game?.shadowArt;
    if (sh?.texture) out.push(atlasClone(sh.texture, sh.cols ?? 4, 1));
    return out.filter(Boolean);
  }

  start(ctx, shotPos, shot) {
    if (!this.build()) return;
    this.line = shot;
    this.group.visible = true;
    this.lastT = -1;
    const hub = shot === 'simHub';
    for (const c of this.canes) c.group.visible = hub;
    this.cutter.group.visible = hub;
    for (const c of this.critters) c.group.visible = hub;
    for (const f of this.fighters) f.group.visible = hub;
    this.stormer.group.visible = !hub;
    this.ghostD.ghost.group.visible = !hub;
    // His card is in both: over the school, and the last thing the isles line shows.
    this.card.visible = true;
    this.update(0, null);
  }

  stop() {
    if (!this.group) return;
    this.group.visible = false;
    this.line = null;
  }

  /** `t` is the line's clock — the one the lens is cued on. */
  update(t, camera) {
    if (!this.group?.visible) return;
    const dt = this.lastT < 0 ? 0 : Math.max(0, Math.min(0.1, t - this.lastT));
    const crossed = (at) => this.lastT < at && t >= at;
    if (this.line === 'simHub') {
      this._range(t, crossed);
      this._school(t, crossed, dt);
    } else {
      this._storm(t, crossed, dt);
      this._kata(t);
    }
    this._cardTick(t, camera);
    for (const k of this.kittens) if (k.group.visible) k.update(dt);
    if (camera) {
      for (const k of this.kittens) if (k.group.visible) k.faceCamera(camera);
      this.ghostD.ghost.sprite?.faceCamera(camera);
    }
    this.lastT = t;
  }

  /** The canes, the "cut down", and the kitten walking the row. */
  _range(t, crossed) {
    const R = STAGE.range;
    const ri = this.dream.isles.range;
    const toLens = { x: -ri.fwd.x, z: -ri.fwd.z };
    this.canes.forEach((c, i) => {
      const at = RANGE_CUTS[i];
      const s = at == null ? -1 : t - at;
      const f = caneFall(s, R.cutY);
      // Away from her, which is toward the lens: she cuts from behind the row.
      _ax.set(toLens.z, 0, -toLens.x).normalize();
      _q.setFromAxisAngle(_ax, f.tip);
      c.top.quaternion.copy(_q);
      c.top.position.set(toLens.x * f.slide, R.cutY - f.drop, toLens.z * f.slide);
      c.top.visible = f.alpha > 0.01;
      c.top.traverse((o) => { if (o.material) o.material.opacity = o.material.userData.tourBase * f.alpha; });
      c.face.material.opacity = s >= 0 ? Math.max(0.15, 0.9 - s * 0.6) : 0;
      if (at != null && crossed(at)) {
        this.dream.shards?.burst(c.at.x, c.at.y + R.cutY, c.at.z, 0x6dffb0, 28, 4, 4);
      }
    });
    // She stands behind the cane she is about to cut, and walks to the next.
    const spot = (i) => isleAt(ri, R.canes[i][0] + R.behind, R.canes[i][1] - 0.3);
    let i = RANGE_CUTS.findIndex((x) => x > t - 0.15);
    if (i < 0) i = RANGE_CUTS.length - 1;
    const prev = i > 0 ? spot(i - 1) : isleAt(ri, R.canes[0][0] + R.behind, R.canes[0][1] - 2.4);
    const t0 = i > 0 ? RANGE_CUTS[i - 1] + 0.12 : RANGE_CUTS[0] - 0.6;
    const t1 = RANGE_CUTS[i] - 0.12;
    const k = Math.max(0, Math.min(1, (t - t0) / Math.max(0.05, t1 - t0)));
    const e = k * k * (3 - 2 * k);
    const to = spot(i);
    const k9 = this.cutter;
    k9.group.position.set(prev.x + (to.x - prev.x) * e, ri.y + (k > 0 && k < 1 ? Math.abs(Math.sin(t * 14)) * 0.12 : 0), prev.z + (to.z - prev.z) * e);
    if (k9.sprite) k9.sprite.facing = Math.atan2(toLens.x, toLens.z);
    this._swing(k9, t, RANGE_CUTS, Math.atan2(toLens.x, toLens.z));
  }

  /** The arc of a cut, flashing on each of her `times`, turned to `yaw`. */
  _swing(k, t, times, yaw) {
    let since = 99;
    for (const x of times) if (t >= x && t - x < since) since = t - x;
    k.arc.material.opacity = since < 0.32 ? (1 - since / 0.32) * 0.95 : 0;
    k.arc.rotation.y = yaw + since * 5;
  }

  /** The pen's animals, and two bouts in the ring. */
  _school(t, crossed, dt) {
    const P = this.pen;
    const rr = P.r - 1.6;
    for (const c of this.critters) {
      const n = c.seed;
      const w1 = 0.9 + n * 0.17;
      const w2 = 1.3 + n * 0.11;
      const p1 = n * 1.7;
      const p2 = n * 2.3;
      const px = (u) => P.x + Math.sin(w1 * u + p1) * rr * 0.85;
      const pz = (u) => P.z + Math.sin(w2 * u + p2) * rr * 0.55;
      const x = px(t);
      const z = pz(t);
      c.group.position.set(x, P.y, z);
      const hx = px(t + 0.05) - x;
      const hz = pz(t + 0.05) - z;
      c.body.rotation.y = Math.atan2(hx, hz);
      c.body.position.y = c.kind.kind === 'ground' ? 0 : Math.abs(Math.sin(t * 7 + n)) * 0.35;
      c.update(dt);
    }
    // Two pairs, either side of the ring's middle, circling and trading blows.
    const si = this.dream.isles.school;
    const across = { x: -si.fwd.z, z: si.fwd.x };
    const hitsOn = [0, 0, 0, 0];
    const last = [null, null];
    for (let k = 0; k < BOUT_N; k++) {
      const b = boutAt(k);
      if (b.t > t + 0.2) break;
      const victim = b.pair * 2 + (1 - b.attacker);
      if (b.t <= t) { hitsOn[victim]++; last[b.pair] = b; }
      else last[b.pair] = last[b.pair] ?? null;
      if (crossed(b.t)) {
        const f = this.fighters[victim];
        f.flash = 1;
        f.wobV += 7;
        this.dream.shards?.burst(f.group.position.x, f.group.position.y + 1.6, f.group.position.z, f.colour, 14, 3, 3);
      }
    }
    for (let pair = 0; pair < 2; pair++) {
      const c = {
        x: this.ringC.x + across.x * (pair ? 1 : -1) * STAGE.school.pairs,
        z: this.ringC.z + across.z * (pair ? 1 : -1) * STAGE.school.pairs,
      };
      const phi = pair * 1.3 + t * 0.55;
      const ux = Math.sin(phi);
      const uz = Math.cos(phi);
      // The blow nearest now, in this pair: who lunges, and how far.
      let lunge = [0, 0];
      for (let k = 0; k < BOUT_N; k++) {
        const b = boutAt(k);
        if (b.pair !== pair) continue;
        const s = t - b.t;
        if (s < -0.18 || s > 0.25) continue;
        const amt = s < 0 ? -0.25 * (1 - Math.abs(s + 0.09) / 0.09) : BOUTS.lunge * Math.max(0, 1 - s / 0.25);
        lunge[b.attacker] = amt;
      }
      for (let side = 0; side < 2; side++) {
        const f = this.fighters[pair * 2 + side];
        const sg = side ? 1 : -1;
        const r = 1.8 - lunge[side];
        f.group.position.set(c.x + ux * r * sg, this.ringC.y, c.z + uz * r * sg);
        f.hp = Math.max(1, BOUTS.hits - hitsOn[pair * 2 + side]);
        if (f.sprite) f.sprite.facing = Math.atan2(-ux * sg, -uz * sg);
        const mine = [];
        for (let k = 0; k < BOUT_N; k++) { const b = boutAt(k); if (b.pair === pair && b.attacker === side) mine.push(b.t); }
        this._swing(f, t, mine, Math.atan2(-ux * sg, -uz * sg));
      }
    }
  }

  /** The fruit in the air, and Frost cutting it out of the air. */
  _storm(t, crossed, dt) {
    const ti = this.dream.isles.storm;
    const cuts = [];
    for (const f of this.fruit) {
      const s = f.spec;
      const tau = t - s.t0;
      const cutAt = s.t0 + STORM_T * STORM_CUT_K;
      const ends = s.virus ? s.t0 + STORM_T : cutAt;
      const up = tau >= 0 && t < ends;
      f.group.visible = up;
      if (f.mark) {
        f.mark.visible = up;
        f.mark.scale.setScalar(1.6 - Math.min(1, Math.max(0, tau) / STORM_T));
      }
      if (!s.virus) cuts.push(cutAt);
      if (up) {
        f.local.set(f.from.x + f.o.vel.x * tau, f.from.y + f.o.vel.y * tau - 0.5 * STORM_G * tau * tau, f.from.z + f.o.vel.z * tau);
        f.group.position.copy(f.local);
        f.body.rotation.y = t * 3;
      }
      if (crossed(ends)) {
        const p = f.local;
        if (s.virus) this.dream.shards?.burst(p.x, ti.y + 0.1, p.z, f.kind.colour, 10, 1, 3);
        else this.dream.shards?.burst(p.x, p.y, p.z, f.kind.colour, 30, 5, 4);
      }
    }
    // She steps toward whatever she cuts next, and swings when it is low.
    const next = this.fruit.filter((f) => !f.spec.virus);
    let i = next.findIndex((f) => f.spec.t0 + STORM_T * STORM_CUT_K > t - 0.1);
    if (i < 0) i = next.length - 1;
    const spot = (f) => ({ x: f.land.x + (ti.x - f.land.x) * 0.25, z: f.land.z + (ti.z - f.land.z) * 0.25 });
    const to = spot(next[i]);
    const from = i > 0 ? spot(next[i - 1]) : { x: ti.x, z: ti.z };
    const t0 = i > 0 ? next[i - 1].spec.t0 + STORM_T * STORM_CUT_K : next[0].spec.t0;
    const t1 = next[i].spec.t0 + STORM_T * STORM_CUT_K - 0.1;
    const k = Math.max(0, Math.min(1, (t - t0) / Math.max(0.05, t1 - t0)));
    const e = k * k * (3 - 2 * k);
    const st = this.stormer;
    st.group.position.set(from.x + (to.x - from.x) * e, ti.y, from.z + (to.z - from.z) * e);
    const fx = next[i].local.x - st.group.position.x;
    const fz = next[i].local.z - st.group.position.z;
    if (st.sprite) st.sprite.facing = Math.atan2(fx, fz);
    this._swing(st, t, cuts, Math.atan2(fx, fz));
  }

  /** His routine on the floor, on the floor's own beat. */
  _kata(t) {
    const spb = 60 / KATA_BPM;
    const T = kataTimeline(this.kata);
    const beat = Math.min(T.D - 0.01, Math.max(0, (Math.min(t, KATA_UNTIL) - KATA_T0) / spb));
    runGhost(this.ghostD, beat, T, spb, this.hall);
  }

  /** Over the school, turned to the lens about Y and swaying on it, so the
   *  foil catches the light — "facing the camera so it can be seen and can
   *  be rotating". */
  _cardTick(t, camera) {
    const c = this.card;
    c.mat.uniforms.t.value = t;
    c.mat.uniforms.show.value = 1;
    c.position.y = this.cardAt.y + Math.sin(t * 1.3) * 0.15;
    if (camera) {
      _e.setFromQuaternion(camera.quaternion, 'YXZ');
      c.rotation.set(0, _e.y, 0);
    }
    c.mesh.rotation.y = Math.sin(t * 1.15) * CARD_SWAY;
  }
}

/** How far the card turns either way on its sway, radians. Past ~0.6 its
 *  text starts to fore-shorten out of reading. */
export const CARD_SWAY = 0.5;
