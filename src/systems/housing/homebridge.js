import * as THREE from 'three';
import { toonVertexMat, paint } from '../../core/gfx.js';
import { buildTorii, mergeParts, transformParts, PALETTE } from '../../world/build.js';
import { makeLabelTexture } from '../../core/label.js';
import {
  SNAKE, SnakeRoad, findLandings, windRoadSteps, buildRoadMesh, toriiScale, cloudPuff, dissolveMat, buildLandingApron,
} from '../../world/snakeway.js';
import { DRAGON_SPOTS } from '../../entities/dragon.js';
import { SPEED_STRIP, ITEM_BY_ID } from './catalog.js';
import { drawStatue, loadGenerated, tintGenerated } from './statue.js';
import { drawItem, placeModel } from './models.js';

/** Seconds for the grand doors to swing all the way. */
export const DOOR_SWING = 1.6;

/* THE GATES ARE A WELCOME, THE FIELD IS THE LOCK. Richard, Oct 2026: "When an
   owner gets near the entrance door to the bridge ... have the front doors
   open up for them if they are closed and the force field will stay to
   prevent other non-owners from entering ... this is just a visual animation
   to allow the owner to walk through the doors." So the leaves swing open for
   an owner within `near` of them, and shut again behind her; the hologram
   (`field` across the doorway and `sides` along the deck's edges, "hologram
   barrier around the edges of the bridge (around the entrance)") is up for
   exactly as long as the island is locked, whoever is standing there. */
export const GATE = {
  /** An owner this close (and this far above or below) opens the leaves. */
  near: 9, nearY: 6,
  /** Seconds for the hologram to come up or go. */
  fade: 0.45,
  /** The side walls of the hologram: from `back` behind the gate to `len`
   *  out over the deck, `out` outside the deck's edge. */
  side: { back: 1.5, len: 11, out: 0.35 },
};

/* WHERE THE OWNERS STAND. Richard: "If multiple people buy an island
   together, then all the players statues with their colors should be
   appearing next to the entrance. Have them spread out, one on each side and
   if more than 2, have them next to the other statues." Slot k is
   [side, lateral off the deck's edge, out from the gate]: the first left of
   the road as you walk up to it, the second right, the third and fourth
   beside those, further out. The boombox stands right, in the second's place
   while there is no second, and behind her when there is. A plinth is 1.9
   across its corners (statue.js), so 4.2 apart leaves a gap a kitten walks
   through. */
export const STATUE_SLOTS = [[-1, 4.5, 4], [1, 4.5, 4], [-1, 8.9, 4], [1, 8.9, 4]];
export const JUKEBOX_SLOT = { alone: [1, 4.5, 4], behind: [1, 4.5, 9.5] };
/** Measured round what is drawn (lantern base 0.62·1.3, the barrel at 2.2× —
 *  3.4 across — and its surfboard, the drawn statue's plinth). */
export const ENTRANCE_R = { statue: 1.9, jukebox: 1.9, lantern: 0.8, pole: 0.25 };

/**
 * WHICH WAY HER THINGS FACE ON HER ISLAND. Richard: "ensure it is facing
 * either the direction of the bridge so that it is facing the camera (from
 * top-down view, so the statues face can be somewhat seen) or if it is not
 * facing the camera in that view, then lets flip it 180 degrees to face away
 * from the direction of the bridge". `toBridge` is the yaw that faces back
 * down the road; the answer is that or its half turn, whichever has the
 * front (local +z) toward the resting camera, which sits at
 * (sin CAM_YAW, cos CAM_YAW) from whatever it looks at (main.js's rig).
 */
export function faceCamera(toBridge, camYaw = -Math.PI / 4) {
  const d = Math.sin(toBridge) * Math.sin(camYaw) + Math.cos(toBridge) * Math.cos(camYaw);
  return d >= 0 ? toBridge : toBridge + Math.PI;
}

/**
 * A FLAT THING'S FACING: `yaw`, turned toward the camera just far enough that
 * its face is at least `minDot` onto it. A statue reads from any side; a
 * banner is a sheet, and on the first island measured the statue's way was
 * 85° off the camera, which put both banners edge-on — two dark sticks. Both
 * still turn by the same amount, so they still match each other.
 */
export function bannerYaw(yaw, camYaw = -Math.PI / 4, minDot = 0.5) {
  let d = yaw - camYaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const lim = Math.acos(minDot);
  return Math.abs(d) <= lim ? yaw : camYaw + Math.sign(d) * lim;
}

/** The hologram's look: scanlines in her colour, a bright rim, a shimmer. */
function holoFieldMat(colour) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(colour) }, uTime: { value: 0 }, uK: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vW;
      void main() {
        vUv = uv;
        vW = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uK;
      varying vec2 vUv;
      varying vec3 vW;
      void main() {
        float scan = 0.55 + 0.45 * step(0.5, fract(vW.y * 2.2 - uTime * 1.6));
        float hex = abs(sin(vW.x * 3.1 + vW.z * 3.1 + uTime * 0.7) * sin(vW.y * 3.6 - uTime * 0.4));
        float rim = max(smoothstep(0.86, 1.0, abs(vUv.x * 2.0 - 1.0)), smoothstep(0.9, 1.0, vUv.y));
        float a = (0.16 + 0.12 * scan + 0.1 * hex + 0.45 * rim) * uK;
        gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.25 + 0.4 * rim), a);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
  });
}

/**
 * THE DECK GOES TO HOLOGRAM UNDER A VISITOR. Richard: "if a player that is
 * not an owner tries to jump on the bridge while 'the gates are closed' then
 * they will pass-through it as if it doesn't exist, or make it turn into a
 * hologram for the player, where they fade/pass through it ... as if it is a
 * holographic cloud snake way bridge when they get near it or step on it but
 * is solid for the owner". The falling is `Housing.heightAt` (`ghostFor`);
 * this is the look: round each of up to four points in `uHolo` (x, y, z,
 * strength), the deck turns to scanlines in cyan and is dithered away, so
 * what she falls through is visibly not there for her. Everywhere else it is
 * the ordinary toon deck, so an owner walking it sees nothing change.
 */
export const HOLO_DECK = { r0: 3.5, r1: 7.5, max: 4, colour: 0x5ff6ff };
function holoDeckMat(U) {
  const mat = toonVertexMat();
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vHoloW;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vHoloW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vHoloW;
        uniform vec4 uHolo[${HOLO_DECK.max}];
        uniform float uHoloT;`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        float holoK = 0.0;
        for (int i = 0; i < ${HOLO_DECK.max}; i++) {
          vec4 h = uHolo[i];
          float d = length(vHoloW.xz - h.xz);
          holoK = max(holoK, h.w * (1.0 - smoothstep(${HOLO_DECK.r0.toFixed(1)}, ${HOLO_DECK.r1.toFixed(1)}, d))
            * (1.0 - smoothstep(4.0, 9.0, abs(vHoloW.y - h.y))));
        }
        if (holoK > 0.001) {
          float scan = step(0.5, fract((vHoloW.x + vHoloW.z) * 1.4 - uHoloT * 2.0));
          vec3 holo = vec3(0.37, 0.96, 1.0) * (0.55 + 0.45 * scan);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, holo, holoK * 0.85);
          float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          if (ign < holoK * 0.6) discard;
        }`);
  };
  mat.customProgramCacheKey = () => 'home-holo-deck';
  return mat;
}

/* ---------------------------------------------------------------------------
   The bridge to her island: a Snake Way road in her colours, a torii that
   comes out of a cloud, her statue and the jukebox at the foot of it, and a
   glass door across it that only she walks through when it is locked.

   THE ROADS ARE WOUND ONCE, ALL FOUR, IN `HOME_SITES` ORDER, AND THEN NEVER
   AGAIN. "Each purchase uses the nearest free slot whose road is
   collision-checked so bridges never interfere with each other" — the way
   that can be GUARANTEED, rather than hoped for, is to solve every slot
   against every other one up front: the four home-rim landings are the four
   slots, each site's nearest is its own, and because all four roads are
   wound around each other (and around Snake Way's seven) before anybody buys
   anything, no order of buying can produce a pair that touches. The probe in
   catalog.js found the four sites that make that true; `world-check` re-winds
   them and fails on any fault.

   WOUND AFTER SNAKE WAY, because they go round its roads. `Housing` pumps
   `world.prepareSnakeWay` itself in the background if it has to — that only
   SOLVES the seven roads (meshes hidden, nothing open), which the ending
   would otherwise do; homes persist across games, so a kitten who owns one
   in a game that has not reached its ending yet still has a way home.

   THE DECK IS A PLATFORM ONLY WHILE SHE OWNS IT, and it is a Snake Way deck
   in every other respect — `platform.snake` is the road, so the ride camera,
   the rails and the auto-run all just work on it. `home: true` is what lets
   it be ground before the ending opens the other seven (`World.heightAt`).
--------------------------------------------------------------------------- */

/** Recolour a vertex-painted geometry toward `colour`, keeping its shading:
 *  each vertex keeps its own brightness relative to `ref` and takes her hue. */
function tintGeometry(geo, colour, ref = 0xf4c542) {
  const c = new THREE.Color(colour);
  const r = new THREE.Color(ref);
  const refL = (r.r + r.g + r.b) / 3 || 1;
  const col = geo.attributes.color;
  if (!col) return;
  for (let i = 0; i < col.count; i++) {
    const l = (col.getX(i) + col.getY(i) + col.getZ(i)) / 3 / refL;
    col.setXYZ(i, Math.min(1, c.r * l), Math.min(1, c.g * l), Math.min(1, c.b * l));
  }
  col.needsUpdate = true;
}

/**
 * Wind all four home roads, a step at a time.
 *
 * @param {World} world   — `world.snakeWay` must exist (its roads are "others")
 * @param {HomeIsle[]} isles — in HOME_SITES order
 * @returns generator → [{ pts, faults, A, B } | null] per isle
 */
export function* solveHomeRoads(world, isles) {
  const home = world.islands[0];
  const islands = world.islands.concat(isles.map((h) => h.island));
  const roads = world.snakeWay?.roads ?? [];
  const others = roads.map((r) => r.pts);
  const avoid = DRAGON_SPOTS.map((d) => ({ x: d.x, z: d.z, r: 8 }))
    .concat(roads.map((r) => ({ x: r.pts[0].x, z: r.pts[0].z, r: 16 })));
  const out = [];
  for (const isle of isles) {
    const As = findLandings(world, home, isle.island, avoid, 4);
    /* ONE landing on her island, the first — which is the one facing home,
       and the one the house's front door faces (editor.js `yardWhy` keeps
       the path from the door out to it clear of anything she builds). */
    const Bs = findLandings(world, isle.island, home, [], 1);
    yield;
    if (!As.length || !Bs.length) { out.push(null); continue; }
    const w = yield* windRoadSteps(As, Bs, islands, others);
    if (!w) { out.push(null); continue; }
    others.push(w.pts);
    avoid.push({ x: w.A.x, z: w.A.z, r: 16 });
    out.push(w);
  }
  return out;
}

export class HomeBridge {
  /**
   * @param {object} wound  — one entry from `solveHomeRoads`
   * @param {HomeIsle} isle
   */
  constructor(wound, isle, world, id) {
    this.world = world;
    this.isle = isle;
    this.site = isle.site;
    this.wound = wound;
    this.road = new SnakeRoad(100 + id, wound.pts, world.islands[0], isle.island, world.islands);
    this.road.name = `home:${isle.site.id}`;
    this.road.home = true;
    this.road.faults = wound.faults;
    const plat = this.road.platform();
    this.platform = { ...plat, home: true, site: isle.site.id };
    this.group = new THREE.Group();
    this.group.visible = false;
    this.owned = false;
    this.colour = 0xf4c542;
    /** 0..1 how far the deck has grown — the purchase scene drives it. */
    this.grow = 1;
    this.gateReveal = 1;
    this._built = false;
    this.start = this.road.pts[0];
    this.end = this.road.pts[this.road.pts.length - 1];
    const hl = Math.hypot(this.start.tx, this.start.tz) || 1;
    /** Across the road at its start: right-hand normal. */
    this.rx = -this.start.tz / hl;
    this.rz = this.start.tx / hl;
    this.fx = this.start.tx / hl;
    this.fz = this.start.tz / hl;
  }

  build(scene) {
    if (this._built) return;
    this._built = true;
    const built = buildRoadMesh(this.road);
    this.baseColours = built.geometry.attributes.color.array.slice();
    this.holoU = {
      uHolo: { value: Array.from({ length: HOLO_DECK.max }, () => new THREE.Vector4(0, -1e5, 0, 0)) },
      uHoloT: { value: 0 },
    };
    this.roadMesh = new THREE.Mesh(built.geometry, holoDeckMat(this.holoU));
    this.roadMesh.frustumCulled = false;
    this.perSeg = built.perSeg;
    this.segs = built.segs;
    this.caps = built.caps;
    this.group.add(this.roadMesh);

    /* NO SNAKE'S HEAD. Richard, Oct 2026: "Let's also remove the 'Snake Way'
       statue that is appearing on the players island." It was Snake Way's
       own head (`buildSnakeHead`), coiled beside the landing, which is the
       ending's monument and not hers; her island end has her statues. */
    const e = this.end;

    /* THE GROUND ROUND EACH END, the way Snake Way's own roads have it:
       Richard, "add some rocks/grass/shrubbery/ramp around the entrance, like
       we do for the other snake way bridges". The same `buildLandingApron`,
       so the ramp off the deck is a real surface (`aprons`, read by
       `Housing.heightAt`) and the skirt and stones hide the step. */
    const town = this.world?.islands?.[0];
    this.aprons = [];
    const ap0 = town ? buildLandingApron(this.road, 0, town, (x, z) => this.world._standAt?.(x, z, town) ?? town.heightAt(x, z)) : null;
    const ap1 = this.isle.island ? buildLandingApron(this.road, 1, this.isle.island) : null;
    if (ap0) { this.apron0 = new THREE.Mesh(mergeParts(ap0.parts), toonVertexMat()); this.group.add(this.apron0); this.aprons.push(ap0.platform); }
    this._apron1 = ap1;

    // the torii at the home end, through which the road leaves
    const s = this.start;
    const ry = Math.atan2(-s.tx, -s.tz);
    const ts = toriiScale(SNAKE.halfW);
    const gate = transformParts(buildTorii(ts), s.x, s.y - 0.45, s.z, ry);
    this.gateMat = dissolveMat();
    this.gate = new THREE.Mesh(mergeParts(gate), this.gateMat);
    this.group.add(this.gate);
    this.gateRy = ry;
    this.gateTop = s.y - 0.45 + 6 * ts;

    // the cloud it comes out of — faded by the purchase scene, gone after
    const puffs = [];
    for (let j = 0; j < 12; j++) {
      const a = (j / 12) * Math.PI * 2;
      const g = cloudPuff(3.4 + (j % 3) * 1.1, 500 + this.road.id * 13 + j, 0.7);
      g.translate(s.x + this.rx * Math.cos(a) * (SNAKE.halfW + 2.5) + this.fx * Math.sin(a) * 3,
        s.y + (j % 3) * 3.5, s.z + this.rz * Math.cos(a) * (SNAKE.halfW + 2.5) + this.fz * Math.sin(a) * 3);
      puffs.push(g);
    }
    this.cloudMat = new THREE.MeshToonMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false });
    this.cloud = new THREE.Mesh(mergeParts(puffs), this.cloudMat);
    this.cloud.visible = false;
    this.group.add(this.cloud);

    // the 2x strip: glowing chevrons painted on the deck between `from` and `to`
    const chev = [];
    const L = this.road.length;
    for (let d = L * SPEED_STRIP.from; d < L * SPEED_STRIP.to; d += 9) {
      const f = this.road.frameAt(d);
      for (const sgn of [-1, 1]) {
        const g = new THREE.PlaneGeometry(0.5, 2.2);
        g.rotateX(-Math.PI / 2);
        g.rotateY(Math.atan2(f.tx, f.tz) + sgn * 0.6);
        g.translate(f.x + (-f.tz) * sgn * 0.75, f.y + 0.06, f.z + f.tx * sgn * 0.75);
        chev.push(g);
      }
    }
    this.stripMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });
    if (chev.length) {
      this.strip = new THREE.Mesh(mergeStrip(chev), this.stripMat);
      this.group.add(this.strip);
    }

    /* THE GRAND DOORS, AT BOTH ENDS. Richard: "grand bridge doors with an
       open/close animation and a force field, toggled at the bridge
       entrance". Two tall timber leaves banded in her colour, swinging on the
       torii posts, and a shimmering field across the road that is up only
       while they are shut. The glass pane they replace was a door that
       appeared and vanished; these MOVE (`update`), so a lock reads as an
       event. */
    this.accentMats = [];
    this.holoMats = [];
    /** Everything at the two ends that a kitten bumps into: {x, z, r, y0, y1}. */
    this.solids = [];
    this.lockedNow = false;
    // the deck runs ON from the town gate, so the hologram's sides go +f
    this.gates = [this._grandGate(s, 1, 0.6, { fx: this.fx, fz: this.fz, rx: this.rx, rz: this.rz, ry, ix: this.fx, iz: this.fz })];
    this._toriiSolids(s.x, s.z, s.y - 0.45, this.rx, this.rz, ts);

    // the name over the gate, set by `setOwner`
    this.namePlate = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    this.namePlate.position.set(s.x, this.gateTop + 1.6, s.z);
    this.namePlate.rotation.y = ry;
    this.group.add(this.namePlate);

    /* THE TWO ENDS, AS FRAMES. `o` is OUT from the gate, away from the deck
       (back into town at this end, on into her island at the other), `r`
       across, `face` the way her statues, her boombox and her banners all
       look. FACING THE TOWN at this end, toward whoever walks up to her gate
       — Richard: "facing the correct way (towards the entrance direction of
       where the player would be entering the bridge), along with the players
       flag". MEASURED, not reasoned: the drawn statue's front (paws, katana)
       is local +z, and the boombox's speakers are its +z (`drawBoombox`);
       the boombox used to stand at `ry + PI`, its back to the town. */
    const gy0 = () => s.y - 0.45;
    this.ends = [{
      at: { x: s.x, y: s.y, z: s.z }, ox: -this.fx, oz: -this.fz, rx: this.rx, rz: this.rz,
      face: Math.atan2(-this.fx, -this.fz), gy: gy0, parent: this.group,
    }];

    // her statues, one per owner, in a group the purchase scene raises
    this.statue = new THREE.Group();
    this.group.add(this.statue);
    this.statueSpot = this._slot(this.ends[0], STATUE_SLOTS[0]);

    // the jukebox — a boombox on a barrel with a surfboard leaning on it, right of the gate
    const jb = makeJukebox();
    this.jukebox = jb;
    this.group.add(jb);
    this.jukeboxSpots = [];
    this._dress(s, -1, { fx: this.fx, fz: this.fz, rx: this.rx, rz: this.rz }, this.group, null, this.ends[0].face);

    /* THE ISLAND END, dressed the same: a torii and the doors over the road
       where it lands, her statue left and the jukebox right as she walks onto
       her island — "a jukebox and a door at both ends; the player's statue on
       her island". Everything here stands on her island past the landing
       (`+t`), because back along the road from the landing is sky. Hidden
       until the road has grown all the way (`setGrow`), so the purchase scene
       does not show the far end finished before the bridge reaches it. */
    this.endGroup = new THREE.Group();
    if (ap1) { this.endGroup.add(new THREE.Mesh(mergeParts(ap1.parts), toonVertexMat())); this.aprons.push(ap1.platform); }
    const eT = Math.hypot(e.tx, e.tz) || 1;
    const etx = e.tx / eT, etz = e.tz / eT;
    const erx = -etz, erz = etx;
    const ery = Math.atan2(-etx, -etz);
    const gy = (x, z) => this.isle.island?.heightAt?.(x, z) ?? (e.y - 0.45);
    const g1 = { x: e.x + etx * 1.5, y: e.y, z: e.z + etz * 1.5 };
    const endGate = transformParts(buildTorii(ts), g1.x, e.y - 0.45, g1.z, ery);
    this.endGate = new THREE.Mesh(mergeParts(endGate), toonVertexMat());
    this.endGroup.add(this.endGate);
    this._toriiSolids(g1.x, g1.z, e.y - 0.45, erx, erz, ts);
    // the deck runs BACK from the island gate, so its hologram's sides go -t
    this.gates.push(this._grandGate(g1, 1, 0.6, { fx: etx, fz: etz, rx: erx, rz: erz, ry: ery, ix: -etx, iz: -etz }, this.endGroup));
    this.ends.push({
      at: g1, ox: etx, oz: etz, rx: erx, rz: erz,
      /* `ery` faces back down the road; turned to the camera if that is its
         back (`faceCamera`), and then on toward it until it is no more than
         60° off (`bannerYaw`): on the first island measured, the road's way
         was 85° off the camera, so the statue showed its profile and the
         boombox its edge. */
      face: bannerYaw(faceCamera(ery)), gy: (x, z) => gy(x, z), parent: this.endGroup,
    });
    this.statue2 = new THREE.Group();
    this.endGroup.add(this.statue2);
    /* ITS OWN, not `jb.clone(true)`: a clone taken here is taken while the
       barrel's model is still loading, so it kept the drawn stand-in for good
       and the real barrel only ever landed in the first one. Richard: "The
       barrel under the boombox ... is missing or too low. It must look right
       on both the main island and her island." */
    const jb2 = makeJukebox();
    this.endGroup.add(jb2);
    this.jukebox2 = jb2;
    this._dress(g1, 1, { fx: etx, fz: etz, rx: erx, rz: erz }, this.endGroup, gy, this.ends[1].face);
    this.group.add(this.endGroup);
    this._placeOwners(1);

    scene.add(this.group);
    this.setGrow(this.grow);
  }

  /** World point for slot [side, lateral past the deck's edge, out] at end `E`. */
  _slot(E, [sg, lat, out]) {
    const L = SNAKE.halfW + lat;
    const x = E.at.x + E.rx * sg * L + E.ox * out;
    const z = E.at.z + E.rz * sg * L + E.oz * out;
    return { x, z, y: E.gy(x, z) };
  }

  /** The torii's two posts are solid (`buildTorii`: ±2.2·s across, 0.34·s round). */
  _toriiSolids(x, z, y, rx, rz, ts) {
    for (const sg of [-1, 1]) {
      this.solids.push({ x: x + rx * sg * 2.2 * ts, z: z + rz * sg * 2.2 * ts, r: 0.34 * ts + 0.05, y0: y - 1, y1: y + 6 * ts, kind: 'torii' });
    }
  }

  /**
   * One statue per owner at both ends, and each end's boombox where the
   * slots leave it (`STATUE_SLOTS`, `JUKEBOX_SLOT`). Re-run by `setOwners`,
   * because a castle bought by three has three. Only `n` matters here; the
   * colours and the generated takes are `setOwners`' business.
   */
  _placeOwners(n) {
    if (!this.ends) return;
    n = Math.max(1, Math.min(STATUE_SLOTS.length, n));
    this.solids = this.solids.filter((o) => o.kind !== 'statue' && o.kind !== 'jukebox');
    this.jukeboxSpots = [];
    for (const [k, E] of this.ends.entries()) {
      const holder = k ? this.statue2 : this.statue;
      while (holder.children.length > n) holder.remove(holder.children[holder.children.length - 1]);
      while (holder.children.length < n) {
        const st = drawStatue();
        st.group.userData.accent = st.accentMat;
        holder.add(st.group);
      }
      holder.children.forEach((g, j) => {
        const q = this._slot(E, STATUE_SLOTS[j]);
        // the town end's group is raised by the purchase scene, so it holds its children at their own heights
        g.position.set(q.x, q.y - (k ? 0.1 : 0.05), q.z);
        g.rotation.y = E.face;
        this.solids.push({ x: q.x, z: q.z, r: ENTRANCE_R.statue, y0: q.y - 1, y1: q.y + 5.4, kind: 'statue' });
      });
      const jb = k ? this.jukebox2 : this.jukebox;
      const J = this._slot(E, n > 1 ? JUKEBOX_SLOT.behind : JUKEBOX_SLOT.alone);
      jb.position.set(J.x, J.y, J.z);
      jb.rotation.y = E.face;
      this.jukeboxSpots.push(J);
      this.solids.push({ x: J.x, z: J.z, r: ENTRANCE_R.jukebox, y0: J.y - 1, y1: J.y + 3.2, kind: 'jukebox' });
    }
    this.jukeboxSpot = this.jukeboxSpots[0];
    this.statueSpot = this._slot(this.ends[0], STATUE_SLOTS[0]);
  }

  /**
   * One pair of grand doors and the field between them, across the road at
   * `at`. `F` is the road's frame there (forward, right, the torii's yaw).
   */
  _grandGate(at, _unused, ahead, F = null, parent = this.group) {
    const fx = F?.fx ?? this.fx, fz = F?.fz ?? this.fz, rx = F?.rx ?? this.rx, rz = F?.rz ?? this.rz;
    const ix = F?.ix ?? fx, iz = F?.iz ?? fz;
    const ry = F?.ry ?? this.gateRy;
    const doorW = SNAKE.halfW * 2 + 0.6;
    const H = 6.2;
    const cx = at.x + fx * ahead, cz = at.z + fz * ahead;
    const leaves = [];
    for (const sg of [-1, 1]) {
      const parts = [];
      const lg = new THREE.BoxGeometry(doorW / 2, H, 0.32);
      paint(lg, PALETTE.wood);
      lg.translate(sg * doorW / 4, H / 2, 0);
      parts.push(lg);
      // iron studs and a frame, dark
      for (const y of [0.5, H - 0.5]) {
        const rail = new THREE.BoxGeometry(doorW / 2, 0.28, 0.38);
        paint(rail, 0x2a2024);
        rail.translate(sg * doorW / 4, y, 0);
        parts.push(rail);
      }
      const leaf = new THREE.Mesh(mergeParts(parts), toonVertexMat());
      // a band in HER colour across the middle (`accentMats`, set by setOwner)
      const band = new THREE.BoxGeometry(doorW / 2 - 0.2, 0.7, 0.4);
      paint(band, 0xffffff);
      band.translate(sg * doorW / 4, H * 0.55, 0);
      const bandMat = toonVertexMat({ color: this.colour });
      this.accentMats.push(bandMat);
      const bandMesh = new THREE.Mesh(band, bandMat);
      const hinge = new THREE.Group();
      hinge.position.set(cx + rx * sg * (doorW / 2), at.y - 0.1, cz + rz * sg * (doorW / 2));
      leaf.position.x = -sg * doorW / 2;
      bandMesh.position.x = -sg * doorW / 2;
      hinge.add(leaf, bandMesh);
      hinge.userData = { ry, sg };
      parent.add(hinge);
      leaves.push(hinge);
    }
    /* The field: a hologram in her colour across the doorway, and two more
       along the deck's edges round it (GATE.side), up while she is locked. */
    const fieldMat = holoFieldMat(this.colour);
    this.holoMats.push(fieldMat);
    const field = new THREE.Mesh(new THREE.PlaneGeometry(doorW + 1.2, H + 1.4, 1, 6), fieldMat);
    field.position.set(cx + fx * 0.5, at.y + H / 2, cz + fz * 0.5);
    field.rotation.y = ry;
    field.visible = false;
    field.name = 'gate-field';
    parent.add(field);
    const S = GATE.side;
    const sides = [];
    const sideSegs = [];
    for (const sg of [-1, 1]) {
      const lat = SNAKE.halfW + S.out;
      const ax = cx + rx * sg * lat - ix * S.back, az = cz + rz * sg * lat - iz * S.back;
      const bx = cx + rx * sg * lat + ix * S.len, bz = cz + rz * sg * lat + iz * S.len;
      const len = Math.hypot(bx - ax, bz - az);
      const side = new THREE.Mesh(new THREE.PlaneGeometry(len, H * 0.6, 4, 3), fieldMat);
      /* Along the deck: the plane's width is its local x, so it is turned a
         quarter from the doorway's. Its height follows the deck, which climbs
         or falls away from the gate — a flat sheet at the gate's height is
         the visible part where a jump onto the deck would be made. */
      side.position.set((ax + bx) / 2, at.y + H * 0.3, (az + bz) / 2);
      side.rotation.y = Math.atan2(-(bz - az), bx - ax);
      side.visible = false;
      side.name = 'gate-side';
      parent.add(side);
      sides.push(side);
      sideSegs.push({ ax, az, bx, bz });
    }
    return { leaves, field, fieldMat, sides, sideSegs, cx, cz, rx, rz, fx, fz, ix, iz, y: at.y, doorW, openK: 1, want: 1, fieldK: 0 };
  }

  /**
   * DRESSED ENTRANCES: a stone lantern either side of the gate and a pair of
   * nobori banners in her colour. `side` -1 dresses toward town (behind the
   * start gate), 1 toward her island.
   */
  _dress(at, side, F = null, parent = this.group, gy = null, face = null) {
    const fx = F?.fx ?? this.fx, fz = F?.fz ?? this.fz, rx = F?.rx ?? this.rx, rz = F?.rz ?? this.rz;
    const off = SNAKE.halfW + 1.8;
    for (const sg of [-1, 1]) {
      const x = at.x + rx * sg * off + fx * side * 2.2;
      const z = at.z + rz * sg * off + fz * side * 2.2;
      const y = gy ? gy(x, z) : at.y - 0.45;
      /* THE YARD'S LANTERN, AT THE YARD'S SIZE. Richard, Oct 2026: "The stone
         lanterns at the entrance of the island gate are too small. They
         should be the same size as the stone lantern yard item." They were
         the model at whatever size it came in, times 1.3; now they are fitted
         to the catalogue's own size, the one the yard fits it to. */
      const lan = placeModel(ITEM_BY_ID.lantern.model, drawItem('lantern'), ITEM_BY_ID.lantern.size);
      lan.position.set(x, y, z);
      parent.add(lan);
      this.solids.push({ x, z, r: ENTRANCE_R.lantern, y0: y - 1, y1: y + 3, kind: 'lantern' });
      /* the banner: a pole and a tall cloth in her colour, in line with the
         lantern and further out, where it stays clear of the statues
         (STATUE_SLOTS). It stood 1.6 further across, inside the first
         statue's plinth and, once there was a boombox opposite, through the
         barrel. */
      const bx = at.x + rx * sg * off + fx * side * 5;
      const bz = at.z + rz * sg * off + fz * side * 5;
      const by = gy ? gy(bx, bz) : at.y - 0.45;
      const pole = new THREE.CylinderGeometry(0.08, 0.08, 5.6, 6);
      paint(pole, 0x3a2a22);
      pole.translate(0, 2.8, 0);
      const poleMesh = new THREE.Mesh(pole, toonVertexMat());
      poleMesh.position.set(bx, by, bz);
      parent.add(poleMesh);
      this.solids.push({ x: bx, z: bz, r: ENTRANCE_R.pole, y0: by - 1, y1: by + 5.6, kind: 'pole' });
      const cloth = new THREE.PlaneGeometry(0.9, 3.4);
      cloth.translate(0.5, 3.6, 0);
      const clothMat = new THREE.MeshLambertMaterial({ color: this.colour, side: THREE.DoubleSide });
      this.accentMats.push(clothMat);
      const clothMesh = new THREE.Mesh(cloth, clothMat);
      clothMesh.position.set(bx, by, bz);
      /* BOTH BANNERS THE SAME WAY, THE WAY HER STATUE LOOKS. Richard: "Both
         flags on the island at the bridge entrance should be facing in the
         same direction, usually the direction that the statue is facing."
         They used to face each other across the road (each turned to its own
         side), so from the camera one was a face and the other a sliver. */
      clothMesh.rotation.y = face ?? Math.atan2(rx * sg, rz * sg);
      clothMesh.name = 'banner';
      parent.add(clothMesh);
    }
  }

  /**
   * Each gate's leaves swing to their own `want` — open while the island is
   * open, or while an OWNER is near that gate (`near[i]`, from
   * `Housing.update`) — and the hologram fades to `lockedNow`.
   */
  update(dt, time = 0, near = null) {
    if (!this.gates) return;
    this.holoU && (this.holoU.uHoloT.value = time);
    for (const [i, G] of this.gates.entries()) {
      G.want = !this.lockedNow || near?.[i] ? 1 : 0;
      G.openK += Math.sign(G.want - G.openK) * Math.min(Math.abs(G.want - G.openK), dt / DOOR_SWING);
      const e = G.openK * G.openK * (3 - 2 * G.openK);
      for (const h of G.leaves) h.rotation.y = h.userData.ry + h.userData.sg * (Math.PI / 2 - 0.15) * e;
      // the purchase scene holds the town end's hologram up while it shows it (`setEntrance`)
      const f = i === 0 && this.sceneField != null ? this.sceneField : this.lockedNow ? 1 : 0;
      G.fieldK += Math.sign(f - G.fieldK) * Math.min(Math.abs(f - G.fieldK), dt / GATE.fade);
      const show = G.fieldK > 0.01;
      G.field.visible = show;
      for (const m of G.sides) m.visible = show;
      G.fieldMat.uniforms.uK.value = G.fieldK * (0.85 + 0.15 * Math.sin(time * 3.1 + i));
      G.fieldMat.uniforms.uTime.value = time;
    }
  }

  /** Gate 0's leaves, as the old single door read (0 shut .. 1 open). */
  get openK() { return this.gates?.[0]?.openK ?? 1; }

  /** Gate 0's swing target, likewise. */
  get openWant() { return this.gates?.[0]?.want ?? 1; }

  /**
   * The deck turned hologram round each of `pts` ([{x, y, z, k}], up to
   * HOLO_DECK.max) — the visitors near it while it is locked.
   */
  setHolo(pts) {
    if (!this.holoU) return;
    this.holoU.uHolo.value.forEach((v, i) => {
      const q = pts[i];
      if (q) v.set(q.x, q.y, q.z, q.k ?? 1); else v.set(0, -1e5, 0, 0);
    });
  }

  /** Put this bridge in `colour` with `name` over the gate — one owner. */
  setOwner(name, colour, sheet) {
    this.setOwners([{ name, colour, sheet }], name);
  }

  /**
   * Every owner: the road, the bands and the banners in the FIRST owner's
   * colour, `label` over the gate, and a statue per owner at both ends, each
   * in her own colour and her own generated take.
   */
  setOwners(owners, label = owners.map((o) => o.name).join(' & ')) {
    const colour = owners[0]?.colour ?? 0xf4c542;
    this.colour = colour;
    if (!this._built) return;
    const pos = this.roadMesh.geometry.attributes.color;
    pos.array.set(this.baseColours);
    tintGeometry(this.roadMesh.geometry, colour);
    this.stripMat.color.set(colour).lerp(new THREE.Color(0xffffff), 0.5);
    for (const m of this.accentMats ?? []) m.color.set(colour);
    for (const m of this.holoMats ?? []) m.uniforms.uColor.value.set(colour);
    this._placeOwners(owners.length);
    for (const holder of [this.statue, this.statue2]) {
      holder?.children.forEach((g, j) => this._dressStatue(g, owners[j]));
    }
    this._label(label, colour);
  }

  /** One statue in one owner's colour, with her generated take when there is one. */
  _dressStatue(g, o) {
    if (!o) return;
    g.userData.accent?.color.set(o.colour);
    if (g.userData.genMats) tintGenerated(g.userData.genMats, o.colour, 1);
    if (!o.sheet || g.userData.sheet === o.sheet) return;
    g.userData.sheet = o.sheet;
    loadGenerated(o.sheet).then((G) => {
      if (!G || g.userData.sheet !== o.sheet) return;
      if (g.userData.gen) g.remove(g.userData.gen);
      for (const c of g.children) c.visible = false;
      g.userData.gen = G.root;
      g.userData.genMats = G.mats;
      g.add(G.root);
      tintGenerated(G.mats, o.colour, 1);
    });
  }

  _label(name, colour) {
    const label = `${String(name).toUpperCase()}'S ISLAND`;
    const css = `#${new THREE.Color(colour).getHexString()}`;
    const { texture, aspect } = makeLabelTexture(label, { size: 72, color: css, stroke: '#1d1216', strokeWidth: 9 });
    this.namePlate.material.map = texture;
    this.namePlate.material.needsUpdate = true;
    this.namePlate.scale.set(1.5 * aspect, 1.5, 1);
  }

  /** How much of the road is drawn: the deck grows from the town out. */
  /**
   * THE TOWN END COMING UP, for the purchase scene: 0 none of it, 1 all of
   * it. Richard, Oct 2026: "the torii gate, hologram gate, door and the
   * main-island ramp/bridge start [should] appear together. Wait 1-2s, then
   * the bridge grows to the island." The torii dissolves in on its own
   * material (`gateMat.reveal`, the scene's); this is everything else at
   * that end — the doors rise out of the ground on their hinges, the ramp
   * and the first of the deck (`ENTRANCE_GROW` of it) are there, and the
   * hologram is up across the doorway (`sceneField`, which `update` obeys
   * over the lock until the scene lets go of it).
   */
  setEntrance(k) {
    const e = Math.max(0, Math.min(1, k));
    this.entranceK = e;
    for (const h of this.gates?.[0]?.leaves ?? []) { h.scale.y = Math.max(1e-3, e); h.visible = e > 0; }
    if (this.apron0) this.apron0.visible = e > 0;
    if (this.grow < 1) this.setGrow(Math.max(this.grow, this.entranceGrow() * e));
  }

  /** How much of the road is the ramp's start: about eight units of it. */
  entranceGrow() { return Math.min(0.15, 8 / Math.max(1, this.road?.length ?? 60)); }

  setGrow(k) {
    this.grow = k;
    if (this.endGroup) this.endGroup.visible = k >= 1;
    if (!this.roadMesh) return;
    const segs = Math.round(this.segs * Math.max(0, Math.min(1, k)));
    this.roadMesh.geometry.setDrawRange(0, k >= 1 ? Infinity : segs * this.perSeg);
    if (this.strip) this.strip.visible = k >= 1;
  }

  /** Locked: the grand doors swing shut and the field comes up (`update`).
   *  `snap` puts them there now — a load, not a press. */
  setLocked(locked, snap = false) {
    this.lockedNow = !!locked;
    if (snap) {
      for (const G of this.gates ?? []) { G.openK = locked ? 0 : 1; G.fieldK = locked ? 1 : 0; }
      this.update(0);
    }
  }

  /** Is the gate at either end within `r` of (x, z)? Which end, or -1. */
  gateNear(x, z, r = 4) {
    return (this.gates ?? []).findIndex((G) => Math.hypot(x - G.cx, z - G.cz) < r);
  }

  /** Where along the road (0..1) a point is, or null if not on it. */
  along(x, z, y) {
    const hit = this.road.locate(x, z, y + 0.6);
    return hit ? hit.s / this.road.length : null;
  }

  /** The door across the road, as a segment, in the world. */
  doorSegment() {
    return this.doorSegments()[0];
  }

  /** Both doors — the town end and her island's end. */
  doorSegments() {
    const h = SNAKE.halfW + 0.6;
    if (!this.gates) {
      const s = this.start;
      const cx = s.x + this.fx * 0.6, cz = s.z + this.fz * 0.6;
      return [{ ax: cx - this.rx * h, az: cz - this.rz * h, bx: cx + this.rx * h, bz: cz + this.rz * h, y0: s.y - 2, y1: s.y + 6 }];
    }
    return this.gates.map((G) => ({
      ax: G.cx - G.rx * h, az: G.cz - G.rz * h, bx: G.cx + G.rx * h, bz: G.cz + G.rz * h, y0: G.y - 2, y1: G.y + 7,
    }));
  }

  /** The doorways AND the hologram's sides along the deck (GATE.side). */
  barrierSegments() {
    const out = this.doorSegments();
    for (const G of this.gates ?? []) {
      for (const s of G.sideSegs ?? []) out.push({ ...s, y0: G.y - 2, y1: G.y + 7, side: true });
    }
    return out;
  }
}

/** The chevrons are plain geometry with no colour attribute; merge by hand. */
function mergeStrip(parts) {
  let n = 0;
  let ni = 0;
  for (const g of parts) { n += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(n * 3);
  const idx = new Uint32Array(ni);
  let v = 0;
  let k = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, v * 3);
    for (let i = 0; i < g.index.count; i++) idx[k++] = g.index.getX(i) + v;
    v += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/** How tall the barrel under the boombox stands, and so where the boombox
 *  sits. It was a 2.2x SCALE on the Polyfork model (which measured 1.0 tall,
 *  so 2.2) — but a scale is only right for the model it was measured on, and
 *  the drawn stand-in the island end was stuck with came out a fraction of
 *  that, the boombox floating over a squat bottle. Now the barrel is FITTED
 *  to this height (`fitTo`), model or stand-in, and the boombox sits on it. */
export const BARREL_H = 2.2;

/** One jukebox: the barrel, the boombox on its lid, the surfboard. */
export function makeJukebox() {
  const jb = new THREE.Group();
  const barrel = placeModel('komodaru-sake-barrel-c5199a', drawItem('sake'), { h: BARREL_H });
  barrel.name = 'barrel';
  jb.add(barrel);
  jb.add(drawBoombox(BARREL_H));
  jb.add(drawSurfboard());
  jb.name = 'jukebox';
  return jb;
}

/** Roshi's 90s boombox, sitting on the barrel. PLACEHOLDER art (drawn).
 *  ON the barrel: it sat at 0.47 of the scale, which is half way down inside
 *  it, so the boombox Richard reported "facing the wrong way" was a barrel
 *  with a surfboard and no boombox to be seen at all. */
function drawBoombox(top) {
  const parts = [];
  const b = (w, h, d, c, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); paint(g, c); g.translate(x, y, z); parts.push(g); };
  b(1.9, 1.0, 0.6, 0x2b2b33, 0, top + 0.5, 0);
  b(1.95, 0.12, 0.62, 0xf05aa0, 0, top + 0.06, 0);
  b(1.2, 0.1, 0.1, 0x999999, 0, top + 1.2, 0);
  b(0.08, 0.3, 0.08, 0x999999, -0.6, top + 1.05, 0);
  b(0.08, 0.3, 0.08, 0x999999, 0.6, top + 1.05, 0);
  b(0.5, 0.25, 0.05, 0x7fe6ff, 0, top + 0.72, 0.31);
  for (const s of [-1, 1]) {
    const sp = new THREE.CylinderGeometry(0.3, 0.3, 0.06, 16);
    sp.rotateX(Math.PI / 2);
    paint(sp, 0x111111);
    sp.translate(s * 0.6, top + 0.48, 0.31);
    parts.push(sp);
    const cone = new THREE.CylinderGeometry(0.12, 0.12, 0.07, 12);
    cone.rotateX(Math.PI / 2);
    paint(cone, 0xffd23f);
    cone.translate(s * 0.6, top + 0.48, 0.33);
    parts.push(cone);
  }
  const m = new THREE.Mesh(mergeParts(parts), toonVertexMat());
  m.name = 'boombox';
  return m;
}

/** A surfboard leaning on the barrel — Roshi's holiday. PLACEHOLDER art. */
function drawSurfboard() {
  const g = new THREE.SphereGeometry(1, 16, 8);
  g.scale(0.55, 2.1, 0.09);
  const col = [];
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const c = new THREE.Color(Math.abs(y) < 0.25 ? 0xffd23f : y > 0 ? 0x35c4c4 : 0xff7a3d);
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.rotateZ(0.32);
  // against the barrel's side: it is 3.4 across at 2.2x (measured), so 1.6 was inside it
  g.translate(2.0, 2.0, -0.3);
  return new THREE.Mesh(g, toonVertexMat());
}
