import * as THREE from 'three';
import { toonVertexMat, paint } from '../core/gfx.js';
import {
  Island, PALETTE, BIOMES, buildHouse, buildTorii, buildLantern, buildTree, buildStall,
  buildBridge, buildBamboo, buildRoad, buildShrine, mergeParts, transformParts,
  valueNoise, fbm,
} from './build.js';
import { Prop } from '../entities/prop.js';
import { ClanShrine } from '../entities/shrine.js';

/* ---------------------------------------------------------------------------
   The world: a cluster of floating islands under a sunset sky, with one
   fully built town. Sized so the horizon reads as "there is a lot more out
   there" — the Dragon Ball Z brief — without actually paying for it.
--------------------------------------------------------------------------- */

const SKY_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */`
  varying vec3 vDir;
  uniform vec3 top;
  uniform vec3 mid;
  uniform vec3 horizon;
  uniform vec3 ground;
  uniform vec3 sunDir;
  uniform vec3 sunColor;

  void main() {
    float h = vDir.y;
    vec3 c;
    if (h > 0.28) {
      c = mix(mid, top, smoothstep(0.28, 0.85, h));
    } else if (h > 0.0) {
      c = mix(horizon, mid, smoothstep(0.0, 0.28, h));
    } else {
      // Keep gradating well below the horizon. Flattening out at -0.35 turns
      // the whole lower sky into one slab of colour, which is very obvious
      // once the player is high enough to look down at it.
      c = mix(horizon, ground, smoothstep(0.0, -0.9, h));
    }

    // Sun bloom, then a couple of hard cel-shaded cloud bands so the sky
    // matches the flat-colour look of everything else.
    float sun = max(dot(vDir, normalize(sunDir)), 0.0);
    c += sunColor * pow(sun, 220.0) * 1.6;
    c += sunColor * pow(sun, 6.0) * 0.30;

    float band = sin(vDir.y * 22.0 + vDir.x * 3.0) * 0.5 + 0.5;
    float mask = smoothstep(0.42, 0.02, abs(h - 0.16)) * step(0.62, band);
    c = mix(c, c * 1.14 + vec3(0.06, 0.03, 0.0), mask * 0.55);

    float band2 = sin(vDir.y * 13.0 - vDir.z * 2.2 + 1.7) * 0.5 + 0.5;
    float mask2 = smoothstep(0.30, 0.02, abs(h - 0.34)) * step(0.70, band2);
    c = mix(c, c * 0.90, mask2 * 0.4);

    gl_FragColor = vec4(c, 1.0);
  }
`;

/**
 * The clans. Straight out of the Warriors books she's reading, filed down to
 * four you can swear to by walking into their hall and pressing interact.
 */
/**
 * The clans. Each one lives at a shrine on a DIFFERENT island, so choosing a
 * clan means going and finding it — that's the whole reason to fly somewhere.
 *
 * Every clan grants exactly one buff, and each buff changes a different verb
 * (running, slashing, jumping, breathing fire) so swapping clans visibly
 * changes how the game plays rather than just recolouring a badge. You can
 * re-swear at any other shrine, and the two kittens can belong to different
 * clans — arguing about who picked the best one is the point.
 */
export const CLANS = [
  {
    id: 'thunder',
    name: 'Thunderpaw',
    color: 0xf5c341,
    tile: 0x8f3038,
    motto: 'loudest paws in the sky',
    buff: { id: 'speed', label: 'Run faster', speed: 1.35 },
  },
  {
    id: 'river',
    name: 'Riverclaw',
    color: 0x6fd0f0,
    tile: 0x37477d,
    motto: 'never walks around a puddle',
    buff: { id: 'reach', label: 'Longer katana', reach: 1.8 },
  },
  {
    id: 'shadow',
    name: 'Shadowtail',
    color: 0xb98ce0,
    tile: 0x3d3050,
    motto: 'you never hear them coming',
    buff: { id: 'leap', label: 'Triple jump', jumps: 3, jump: 1.15 },
  },
  {
    id: 'wind',
    name: 'Windwhisker',
    color: 0x8fe0a0,
    tile: 0x3d6b57,
    motto: 'fastest kittens on any island',
    buff: { id: 'breath', label: 'Huge dragon breath', breath: 1.9 },
  },
  {
    id: 'ice',
    name: 'Icewhisker',
    color: 0xdff4ff,
    tile: 0x4e6f86,
    motto: 'finds what everyone else walked past',
    /* The finder. Hunting the last three unbroken barrels across six islands
       is the part of a 100% run that stops being a game and starts being a
       chore — this points at the nearest one you haven't knocked over yet. */
    buff: { id: 'seek', label: 'Sense mischief', seek: true },
  },
  {
    id: 'panda',
    name: 'Pandapaw',
    color: 0xbfe36a,
    tile: 0x2f3a24,
    motto: 'never hurries, always arrives',
    /* The only buff you have to EARN after swearing. Every other clan hands
       you its power the moment you stand in the ring; this one hands you a
       job — go and cut bamboo — and pays it out twice, as a cub that follows
       you and then as an animal big enough to ride. It lives on the bamboo
       island because the reward and the work are the same place. */
    buff: { id: 'panda', label: 'Raise a panda', panda: true },
  },
];

export class World {
  constructor(scene) {
    this.scene = scene;
    this.islands = [];
    this.props = [];
    this.solids = [];        // upright cylinders players collide with
    /** Flat-topped boxes you can stand and jump on (bridge decks, terraces). */
    this.platforms = [];
    /** [{x, z, r, clan, shrine}] — stand in it, press interact, swear. */
    this.clanHalls = [];
    /** The animated ClanShrine entities, updated and faced each frame. */
    this.shrines = [];
    /** Places nothing may be planted — bridge feet, grove mouth. */
    this.keepClear = [];
    /** Road corridors: no grass, flowers or rocks grow through paving. */
    this.roadMask = [];
    this.mischiefTotal = 0;
    this.time = 0;

    this._buildSky();
    this._buildLights();
    this._buildIslands();
    this._buildTown();
    this._buildShrines();
    this._buildGroundDetail();
    this._buildDistantScenery();
    this._buildPetals();
  }

  /**
   * Find open ground near a wanted spot — nothing solid on top of it, not on
   * a steep slope, and not tucked behind a building.
   *
   * Dragons placed by hand ended up inside houses and behind the clan hall,
   * where a kid can neither see them nor reach them. Spiralling out to the
   * first genuinely clear spot is more reliable than nudging coordinates by
   * hand every time the town changes.
   */
  findOpenSpot(wx, wz, clearance = 9) {
    const ok = (x, z) => {
      const g = this.heightAt(x, z);
      if (g == null) return false;
      // Room around it, counting the thing's own footprint.
      for (const s of this.solids) {
        if (Math.hypot(x - s.x, z - s.z) < s.r + clearance) return false;
      }
      /* Well INSIDE the island, not perched on the lip of it. Testing only the
         centre point put dragons right on the rim, where the ground falls away
         under a sprite far wider than its footprint and the whole animal reads
         as hovering off the edge. Require solid, level ground all the way
         around at the sprite's own radius. */
      const reach = clearance + 4;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const n = this.heightAt(x + Math.cos(a) * reach, z + Math.sin(a) * reach);
        if (n == null || Math.abs(n.y - g.y) > 3.5) return false;
      }
      // And flat enough underfoot to sit on.
      for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) {
        const n = this.heightAt(x + dx, z + dz);
        if (n == null || Math.abs(n.y - g.y) > 2.2) return false;
      }
      return true;
    };
    if (ok(wx, wz)) return { x: wx, z: wz };
    for (let ring = 1; ring <= 10; ring++) {
      const r = ring * 5;
      const steps = 8 + ring * 4;
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2 + ring;
        const x = wx + Math.cos(a) * r;
        const z = wz + Math.sin(a) * r;
        if (ok(x, z)) return { x, z };
      }
    }
    return null;
  }

  /** The clan hall a kitten is standing in, if any. */
  clanHallNear(x, z) {
    for (const h of this.clanHalls) {
      if (Math.hypot(x - h.x, z - h.z) < h.r) return h;
    }
    return null;
  }

  /**
   * One clan shrine per island, on SIX DIFFERENT islands.
   *
   * Thunderpaw is on the home island, well out of town, so a pair who never
   * work out the dragons can still find a clan and get a buff. The rest are a
   * flight away, which is the point: the beam is visible from the air, so
   * "what's that green light over there?" is the thing that makes them go.
   */
  _buildShrines() {
    const wanted = [
      { clan: CLANS[0], island: 0, x: -62, z: 40 },   // home, west meadow
      { clan: CLANS[1], island: 1, x: 150, z: -95 },  // autumn
      { clan: CLANS[2], island: 4, x: -120, z: 140 }, // ash
      { clan: CLANS[3], island: 5, x: 235, z: 60 },   // dusk
      { clan: CLANS[4], island: 2, x: -140, z: -60 }, // frost
      { clan: CLANS[5], island: 3, x: 78, z: 150 },   // bamboo
    ];

    const parts = [];
    for (const w of wanted) {
      // Same clearance search the dragons use, so a shrine never lands inside
      // a house or half off the rim of an island.
      const spot = this.findOpenSpot(w.x, w.z, 9) ?? { x: w.x, z: w.z };
      const g = this.heightAt(spot.x, spot.z);
      if (g == null) continue;

      const geo = buildShrine(w.clan.color, w.clan.id.length);
      transformParts(geo, spot.x, g.y, spot.z, 0, 1);
      parts.push(...geo);

      const shrine = new ClanShrine(w.clan, spot.x, g.y, spot.z);
      this.scene.add(shrine.group);
      this.shrines.push(shrine);

      /* The pillars are solid so you can't stand inside the stonework, but the
         trigger ring is the whole dais — you join by standing at the shrine,
         not by finding one exact pixel. */
      for (const sx of [-1, 1]) this.solids.push({ x: spot.x + sx * 2.6, z: spot.z, r: 0.7 });
      this.clanHalls.push({ x: spot.x, z: spot.z, r: shrine.radius, clan: w.clan, shrine });
      // Nothing grows on a shrine.
      this.keepClear.push({ x: spot.x, z: spot.z, r: 12 });
    }

    if (!parts.length) return;
    const mesh = new THREE.Mesh(mergeParts(parts), toonVertexMat());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  /* Grass tufts, boulders and flowers. Scattered over every walkable island
     and merged into a single mesh — without them the terrain reads as a bare
     coloured plane no matter how good the vertex shading is. */
  _buildGroundDetail() {
    const parts = [];
    // Short and stubby: at anything approaching a third of the kitten's
    // height these stop reading as grass and start reading as pine trees.
    const tuftGeo = new THREE.ConeGeometry(0.13, 0.42, 3);
    tuftGeo.translate(0, 0.21, 0);
    const rockGeo = new THREE.IcosahedronGeometry(0.5, 0);
    const petalGeo = new THREE.IcosahedronGeometry(0.16, 0);

    const clone = (geo, color, x, y, z, s, ry, sy = 1) => {
      const g = geo.clone();
      paint(g, color);
      g.applyMatrix4(
        new THREE.Matrix4().makeTranslation(x, y, z)
          .multiply(new THREE.Matrix4().makeRotationY(ry))
          .multiply(new THREE.Matrix4().makeScale(s, s * sy, s))
      );
      parts.push(g);
    };

    for (let k = 0; k < this.islands.length - 1; k++) {
      const isl = this.islands[k];
      const n = Math.round(isl.radius * isl.radius * 0.16);
      for (let i = 0; i < n; i++) {
        const a = valueNoise(i, k * 13 + 1, 101) * Math.PI * 2;
        const r = Math.sqrt(valueNoise(i, k * 13 + 2, 211)) * isl.radius * 0.94;
        const x = isl.x + Math.cos(a) * r;
        const z = isl.z + Math.sin(a) * r;
        const g = isl.heightAt(x, z);
        if (g == null) continue;
        if (this.roadMask.some((m) => Math.hypot(x - m.x, z - m.z) < m.r)) continue;
        const pick = valueNoise(i, k, 307);
        const ry = valueNoise(i, k, 401) * 6.28;

        // Detail is tinted from the island's own biome — frost islands get
        // pale tufts and grey rock, ash islands get charcoal, and so on.
        const B = isl.palette;
        if (pick > 0.90) {
          const s = 0.5 + valueNoise(i, k, 503) * 1.5;
          clone(rockGeo, valueNoise(i, k, 601) > 0.5 ? B.rock : B.rockDark,
            x, g - 0.15 * s, z, s, ry, 0.7);
        } else if (pick > 0.84) {
          const c = [0xff8fb0, 0xffd85e, 0xe8ecff][Math.floor(valueNoise(i, k, 701) * 3) % 3];
          clone(petalGeo, c, x, g + 0.34, z, 0.9 + valueNoise(i, k, 809) * 0.6, ry);
          clone(tuftGeo, B.grass, x, g, z, 0.8, ry);
        } else {
          // little three-blade clump, tinted close to the ground it sits on so
          // it adds texture rather than speckling the island with dark dots
          const s = 0.6 + valueNoise(i, k, 907) * 0.6;
          const col = valueNoise(i, k, 1009) > 0.5 ? B.grassWarm : B.grass;
          for (let b = 0; b < 3; b++) {
            const ba = ry + b * 2.1;
            clone(tuftGeo, col,
              x + Math.cos(ba) * 0.15 * s, g, z + Math.sin(ba) * 0.15 * s,
              s * (0.75 + b * 0.14), ba, 1);
          }
        }
      }
    }

    const mesh = new THREE.Mesh(mergeParts(parts), toonVertexMat());
    mesh.castShadow = false;   // thousands of tiny shadow casters isn't worth it
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  /* ------------------------------- sky ---------------------------------- */

  _buildSky() {
    // Kept low for a sunset read, but not so low that every object drags a
    // shadow halfway across the island.
    this.sunDir = new THREE.Vector3(0.40, 0.62, -0.72).normalize();
    const geo = new THREE.SphereGeometry(2600, 32, 20);
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x1d4f6b) },
        mid: { value: new THREE.Color(0x3f8fa8) },
        horizon: { value: new THREE.Color(0xffc785) },
        ground: { value: new THREE.Color(0x9c6c5e) },
        sunDir: { value: this.sunDir },
        sunColor: { value: new THREE.Color(0xffd98a) },
      },
    });
    const sky = new THREE.Mesh(geo, this.skyMat);
    sky.frustumCulled = false;
    sky.renderOrder = -100;
    this.scene.add(sky);

    this.scene.fog = new THREE.Fog(0xe8a878, 420, 1900);
  }

  _buildLights() {
    // Total intensity is kept deliberately modest. Toon shading has no
    // specular falloff to absorb over-lighting, so piling on lights just
    // pushes every flat colour toward white and flattens the palette.
    const sun = new THREE.DirectionalLight(0xffe9bd, 2.1);
    sun.position.copy(this.sunDir).multiplyScalar(220);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -95; c.right = 95; c.top = 95; c.bottom = -95;
    c.near = 20; c.far = 520;
    sun.shadow.bias = -0.0012;
    sun.shadow.normalBias = 0.05;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    // Warm bounce from below (the sunset) + cool sky fill.
    this.scene.add(new THREE.HemisphereLight(0x86bfe8, 0xe8834a, 0.72));
    const rim = new THREE.DirectionalLight(0x7fc4ff, 0.38);
    rim.position.set(-1, 0.35, 1).multiplyScalar(100);
    this.scene.add(rim);
  }

  /** Keeps the shadow frustum wrapped around wherever the players are. */
  focusShadows(x, z) {
    this.sun.target.position.set(x, 0, z);
    this.sun.position.copy(this.sunDir).multiplyScalar(220).add(new THREE.Vector3(x, 0, z));
    this.sun.target.updateMatrixWorld();
  }

  /* ----------------------------- islands -------------------------------- */

  _buildIslands() {
    const defs = [
      // The home island: big, with a flattened plaza for the town.
      {
        x: 0, z: 0, baseY: 0, radius: 96, seed: 3, hill: 7, plateau: 0.42,
        biome: 'meadow',
        flatten: [
          { x: 0, z: 10, r: 30, falloff: 22, y: 3.2 },
          { x: -34, z: -30, r: 12, falloff: 16, y: 4.6 },
          // The east road out of town, the crossing, and the bamboo grove it
          // leads to. Without these the road ribbon rides over rolling hills
          // and the grove has nowhere level to stand and swing a katana.
          { x: 34, z: 46, r: 9, falloff: 12, y: 2.6 },
          { x: 58, z: 44, r: 20, falloff: 15, y: 2.2 },
          // The west grove. Level ground matters here for the same reason it
          // does at the east one: you cannot line a katana up on a cane while
          // sliding down a hillside.
          { x: -72, z: -30, r: 15, falloff: 16, y: 3.4 },
        ],
      },
      { x: 150, z: -95, baseY: 26, radius: 40, seed: 11, hill: 5, plateau: 0.5, biome: 'autumn' },
      { x: -140, z: -60, baseY: 42, radius: 33, seed: 19, hill: 4, plateau: 0.5, biome: 'frost' },
      { x: 60, z: 165, baseY: 16, radius: 48, seed: 27, hill: 6, plateau: 0.45, biome: 'bamboo' },
      { x: -120, z: 140, baseY: 58, radius: 28, seed: 41, hill: 4, plateau: 0.55, biome: 'ash' },
      { x: 235, z: 60, baseY: 74, radius: 36, seed: 53, hill: 5, plateau: 0.5, biome: 'dusk' },
      // The Dojo of the Turning Circle: deliberately flat, so the unit circle
      // painted on it is a true plane you can walk.
      {
        x: -230, z: 70, baseY: 30, radius: 66, seed: 71, hill: 1.2, plateau: 0.82,
        flatten: [{ x: -230, z: 70, r: 46, falloff: 14, y: 0.9 }],
      },
    ];

    const parts = [];
    for (const d of defs) {
      const isl = new Island(d);
      parts.push(isl.buildMesh());
      this.islands.push(isl);
    }

    const geo = mergeParts(parts);
    const mesh = new THREE.Mesh(geo, toonVertexMat());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.terrainMesh = mesh;

    // Where the maths lesson lives. Last island in the list.
    this.dojoIsland = this.islands[this.islands.length - 1];
    const dy = this.dojoIsland.heightAt(this.dojoIsland.x, this.dojoIsland.z);
    this.dojoCentre = new THREE.Vector3(this.dojoIsland.x, dy ?? 30, this.dojoIsland.z);
  }

  /**
   * Highest walkable surface under a point, or null over open sky.
   *
   * `fromY` is the querying body's own height. Platforms only count once you
   * are at or above their deck, which makes them one-way: you jump up onto a
   * bridge, and you pass underneath it from below instead of being snapped up
   * through it. Callers that don't care (shadows, props) can omit it.
   */
  heightAt(x, z, fromY = Infinity) {
    let best = null;
    for (const isl of this.islands) {
      const h = isl.heightAt(x, z);
      if (h != null && (best == null || h > best.y)) best = { y: h, island: isl };
    }
    for (const p of this.platforms) {
      if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
      if (fromY + 0.4 < p.y) continue;
      if (best == null || p.y > best.y) best = { y: p.y, platform: p };
    }
    return best;
  }

  /* ------------------------------- town --------------------------------- */

  _buildTown() {
    const home = this.islands[0];
    const structural = [];
    const decor = [];

    const put = (parts, x, z, ry = 0, scale = 1, yOff = 0, bucket = structural) => {
      const g = home.heightAt(x, z);
      transformParts(parts, x, (g ?? 0) + yOff, z, ry, scale);
      bucket.push(...parts);
    };

    /* --- the roads ---
       Laid before the buildings so nothing is buried. A town without a road
       is just houses in a field: the yellow street is what tells you where to
       walk and, more importantly, that there IS somewhere to walk to. */
    const H = (x, z) => home.heightAt(x, z);
    const roadDefs = [
      // the great approach: torii, up the main street, into the plaza
      {
        color: PALETTE.sand,
        pts: [
          { x: 0, z: -50, w: 9 }, { x: 0, z: -30, w: 9 }, { x: 0, z: 0, w: 10 },
          { x: 0, z: 26, w: 10 }, { x: 0, z: 46, w: 16 }, { x: 0, z: 60, w: 22 },
          { x: 0, z: 72, w: 14 },
        ],
      },
      // west spur to the clan halls
      {
        color: PALETTE.dirt,
        pts: [{ x: -2, z: -14, w: 7 }, { x: -16, z: -20, w: 6 }, { x: -30, z: -27, w: 7 }],
      },
      // east spur out to the crossing and the bamboo grove
      {
        color: PALETTE.dirt,
        pts: [
          { x: 4, z: 52, w: 7 }, { x: 18, z: 50, w: 6 }, { x: 34, z: 47, w: 6 },
          { x: 48, z: 45, w: 6 }, { x: 60, z: 44, w: 8 },
        ],
      },
    ];
    for (const def of roadDefs) {
      decor.push(...buildRoad(def.pts, H, { color: def.color }));
      /* Remember the corridor so nothing grows through the paving. Grass
         tufts and flowers sprouting out of a packed sand road is the sort of
         detail that quietly makes a town look unfinished. */
      for (let i = 0; i < def.pts.length - 1; i++) {
        const a = def.pts[i];
        const b = def.pts[i + 1];
        const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 3);
        for (let s = 0; s <= n; s++) {
          const t = s / n;
          this.roadMask.push({
            x: a.x + (b.x - a.x) * t,
            z: a.z + (b.z - a.z) * t,
            r: (a.w + (b.w - a.w) * t) / 2 + 0.6,
          });
        }
      }
    }

    /* --- the great houses of the town ---
       These used to be the clan halls, but a clan you join by walking into a
       building in your own home town isn't worth crossing an island for. The
       clans live at shrines now (see _buildShrines); these are just the big
       houses that make the town look like a town. */
    const hallSpots = [
      { x: -34, z: -30, ry: 0.2, s: 1.25, floors: 3, tile: PALETTE.tileRed },
      { x: -58, z: 14, ry: -0.6, s: 1.0, floors: 2, tile: PALETTE.tileIndigo },
      { x: -46, z: -62, ry: 0.9, s: 1.0, floors: 2, tile: PALETTE.tileGreen },
      { x: 40, z: -40, ry: -1.1, s: 1.05, floors: 2, tile: PALETTE.tileIndigo },
    ];
    hallSpots.forEach((h) => {
      put(buildHouse({ w: 11, d: 9, floors: h.floors, tile: h.tile }), h.x, h.z, h.ry, h.s);
      this.solids.push({ x: h.x, z: h.z, r: 7.0 * h.s });
      for (const sx of [-1, 1]) {
        const bx = h.x + Math.cos(h.ry) * sx * 7;
        const bz = h.z + Math.sin(h.ry) * sx * 7 + 7;
        put(buildLantern(1.1), bx, bz, 0, 1, 0, decor);
      }
    });

    // --- main street, houses either side ---
    const street = [
      [-19, 4, 0.08, PALETTE.tileIndigo, 1.0], [-21, 20, -0.15, PALETTE.tileGreen, 0.9],
      [-17, 35, 0.1, PALETTE.tileIndigo, 1.05], [18, 2, -0.06, PALETTE.tileRed, 1.0],
      [21, 18, 0.2, PALETTE.tileIndigo, 0.95], [16, 33, -0.12, PALETTE.tileGreen, 1.1],
      [-30, 48, 0.5, PALETTE.tileIndigo, 0.9], [30, 62, -0.5, PALETTE.tileRed, 0.95],
      // Second row set back off the street, so the town has depth rather than
      // one line of houses either side of a corridor.
      [-32, 12, 0.35, PALETTE.tileGreen, 0.85], [33, 10, -0.4, PALETTE.tileIndigo, 0.9],
      [-31, 30, -0.25, PALETTE.tileRed, 0.8], [32, 28, 0.3, PALETTE.tileGreen, 0.85],
      [-14, -22, 3.0, PALETTE.tileGreen, 1.0], [15, -24, 3.3, PALETTE.tileIndigo, 0.9],
      [-24, 66, 0.7, PALETTE.tileGreen, 0.8], [22, 74, -0.8, PALETTE.tileIndigo, 0.85],
    ];
    for (const [x, z, ry, tile, s] of street) {
      const floors = valueNoise(x, z, 5) > 0.62 ? 2 : 1;
      put(buildHouse({ w: 6.5, d: 5.5, floors, tile }), x, z, ry, s);
      this.solids.push({ x, z, r: 4.2 * s });
    }

    // --- the great torii at the head of the street ---
    put(buildTorii(1.6), 0, -46, 0);
    this.solids.push({ x: -5.6, z: -46, r: 0.9 }, { x: 5.6, z: -46, r: 0.9 });
    put(buildTorii(0.8), 0, 62, 0);

    // --- stone lanterns lining the approach ---
    for (let i = 0; i < 9; i++) {
      const z = -40 + i * 11;
      for (const sx of [-1, 1]) {
        put(buildLantern(0.85), sx * 9.5, z, 0, 1, 0, decor);
      }
    }

    // --- market stalls in the plaza ---
    const stalls = [[-7, 52, 0.3], [7, 55, -0.35], [-9, 66, 0.1], [8, 68, 0.4]];
    stalls.forEach(([x, z, ry], i) => {
      put(buildStall(i), x, z, ry, 1, 0, decor);
      this.solids.push({ x, z, r: 2.0 });
    });

    /* --- the red bridge, now actually on the way to somewhere ---
       It used to sit off the side of the map spanning nothing. It's on the
       east road to the bamboo grove, its deck is a real platform you stand on,
       and its railings are solid so you can't walk out through the sides. */
    const BRIDGE = { x: 34, z: 46, len: 18, wide: 4.4, rise: 2.2 };
    put(buildBridge(BRIDGE.len, BRIDGE.wide), BRIDGE.x, BRIDGE.z, Math.PI / 2, 1, 0.1, decor);
    {
      /* The deck is an ARCH, not a plank — buildBridge lifts each segment by
         sin(t*PI)*rise. One flat platform at the base height meant walking
         straight through the hump. Stepping the platforms along the same curve
         turns it into stairs you can run up, jump off, and stand on top of. */
      const base = (home.heightAt(BRIDGE.x, BRIDGE.z) ?? 0) + 0.52;
      const segs = 10;
      for (let i = 0; i < segs; i++) {
        const t = (i + 0.5) / segs;
        const y = base + Math.sin(t * Math.PI) * BRIDGE.rise;
        const cx = BRIDGE.x + (t - 0.5) * BRIDGE.len;
        const half = BRIDGE.len / segs / 2;
        this.platforms.push({
          x0: cx - half, x1: cx + half,
          z0: BRIDGE.z - BRIDGE.wide / 2, z1: BRIDGE.z + BRIDGE.wide / 2,
          y,
        });
      }
      // Railings, so you can't stroll off the side of the arch.
      for (const sz of [-1, 1]) {
        for (let i = -4; i <= 4; i++) {
          this.solids.push({ x: BRIDGE.x + i * 2.2, z: BRIDGE.z + sz * 2.5, r: 0.55 });
        }
      }
      /* Keep the approaches clear. A cherry tree grown across the foot of the
         bridge blocks the only road to the grove, and from a low camera you
         cannot even see what you're stuck on. */
      this.keepClear = [
        { x: BRIDGE.x, z: BRIDGE.z, r: 16 },
        { x: 58, z: 44, r: 17 },
        { x: -72, z: -30, r: 16 },
      ];
    }

    /* --- the bamboo grove the road leads to ---
       EVERY cane here is a cuttable prop. There used to be a merged scenery
       ring around the outside to save draw calls, but a grove where some canes
       fall and others shrug off a katana just reads as broken — and to a kid
       it reads as "I'm doing it wrong". Consistency beats the draw calls. */
    /* TWO groves on the home island, not one.
       Raising a panda costs forty canes per kitten, and with a single grove
       the two girls end up swinging katanas at the same three plants and
       taking each other's. A second stand on the west slope means they can
       each go and work on their own — and it gives the quiet half of the
       island something to walk to, which it never had. */
    this.groves = [
      { x: 58, z: 44, r: 20, n: 48 },
      { x: -72, z: -30, r: 15, n: 36 },
    ];
    // A little torii at each grove mouth so they read as destinations.
    put(buildTorii(0.7), 46, 44, Math.PI / 2, 1, 0, decor);
    put(buildTorii(0.7), -72, -47, 0, 1, 0, decor);

    // --- cherry trees scattered over the whole island ---
    let planted = 0;
    for (let i = 0; i < 260 && planted < 46; i++) {
      const a = valueNoise(i, 1, 77) * Math.PI * 2;
      const r = 18 + Math.sqrt(valueNoise(i, 2, 91)) * (home.radius - 26);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      // keep the street clear
      if (Math.abs(x) < 14 && z > -50 && z < 72) continue;
      if (Math.hypot(x + 34, z + 30) < 16) continue;
      // and the bridge and grove approaches — see keepClear
      if (this.keepClear.some((k) => Math.hypot(x - k.x, z - k.z) < k.r)) continue;
      // and out of every building, hall and stall already placed
      if (this.solids.some((s) => Math.hypot(x - s.x, z - s.z) < s.r + 2.5)) continue;
      if (home.heightAt(x, z) == null) continue;
      put(buildTree(i, 0.9 + valueNoise(i, 3, 5) * 0.5), x, z, valueNoise(i, 4, 2) * 6, 1, 0, decor);
      this.solids.push({ x, z, r: 0.9 });
      planted++;
    }

    // Trees and lanterns on the outlying islands too. The dojo island (last)
    // stays clear so the circle painted on it is readable.
    /* Each island dresses itself from its biome, so flying somewhere new
       actually looks like somewhere new rather than the same island moved. */
    const FLORA = {
      meadow: 'blossom', bamboo: 'pine', autumn: 'autumn',
      frost: 'frost', ash: 'ash', dusk: 'dusk',
    };
    const scatterEnd = this.islands.length - 1;
    for (let k = 1; k < scatterEnd; k++) {
      const isl = this.islands[k];
      const leaf = FLORA[isl.biome] ?? 'blossom';
      for (let i = 0; i < 18; i++) {
        const a = valueNoise(i, k, 13) * Math.PI * 2;
        const r = Math.sqrt(valueNoise(i, k, 29)) * isl.radius * 0.72;
        const x = isl.x + Math.cos(a) * r;
        const z = isl.z + Math.sin(a) * r;
        const g = isl.heightAt(x, z);
        if (g == null) continue;
        // No decorative bamboo anywhere: if it looks like bamboo it must cut,
        // so every cane in the game is a prop. Trees and lanterns only here.
        const parts = i % 6 === 0
          ? buildLantern(0.8)
          : buildTree(i * 7 + k, 0.8 + valueNoise(i, k, 3) * 0.5, leaf);
        transformParts(parts, x, g, z, valueNoise(i, k, 9) * 6);
        decor.push(...parts);
        this.solids.push({ x, z, r: isl.biome === 'bamboo' ? 0.7 : 0.9 });
      }
      if (k % 2 === 1) {
        const g = isl.heightAt(isl.x, isl.z) ?? 0;
        const parts = buildHouse({ w: 6, d: 5, floors: 1, tile: k % 4 === 1 ? PALETTE.tileIndigo : PALETTE.tileRed });
        transformParts(parts, isl.x, g, isl.z, valueNoise(k, 1, 1) * 6);
        structural.push(...parts);
      }
    }

    const sMesh = new THREE.Mesh(mergeParts(structural), toonVertexMat());
    sMesh.castShadow = true;
    sMesh.receiveShadow = true;
    this.scene.add(sMesh);

    const dMesh = new THREE.Mesh(mergeParts(decor), toonVertexMat());
    dMesh.castShadow = true;
    dMesh.receiveShadow = true;
    this.scene.add(dMesh);

    this._buildProps();
  }

  /* ------------------------- mischief props ------------------------------ */

  _buildProps() {
    const home = this.islands[0];
    const spots = [
      // the plaza market — the densest chaos zone
      [-6, 49], [-4, 53], [-9, 56], [6, 52], [9, 57], [4, 60], [-8, 63],
      [10, 65], [-11, 69], [6, 71], [0, 58], [-2, 66],
      // main street
      [-12, 8], [12, 6], [-13, 24], [13, 22], [-11, 38], [11, 36],
      [-14, -8], [14, -6], [0, -30], [-6, -40], [6, -38],
      // by the clan hall
      [-27, -24], [-40, -22], [-30, -38], [-42, -36],
    ];

    const kinds = ['barrel', 'basket', 'crate', 'lantern', 'melon'];
    spots.forEach(([x, z], i) => {
      const g = home.heightAt(x, z);
      if (g == null) return;
      const kind = kinds[Math.floor(valueNoise(i, 3, 17) * kinds.length) % kinds.length];
      const p = new Prop(kind, x, g, z, i);
      this.scene.add(p.group);
      this.props.push(p);
    });

    /* Cuttable bamboo. Only the katana fells these — no dive-bombing, no
       dragon breath — so the grove is where you have to land, and they're
       worth more for the trouble. */
    /* Bamboo is planted with a solid check now that groves reach past the
       flattened clearings they started in. A cane grown inside a house or
       through a tree trunk is a prop you can see and cannot walk up to, and
       when forty of them are the price of a panda, one unreachable cane is a
       kid convinced the counter is broken. */
    const clearOfSolids = (x, z) => !this.solids.some(
      (s) => Math.hypot(x - s.x, z - s.z) < s.r + 1.2
    );
    for (const grove of this.groves) {
      const N = grove.n ?? 34;
      for (let i = 0; i < N; i++) {
        // Golden-angle spiral: even spacing without clumps or a visible ring.
        const a = i * 2.39996 + valueNoise(i, 2, 431) * 0.5;
        const r = 3.2 + Math.sqrt(i / N) * (grove.r - 3.2);
        const x = grove.x + Math.cos(a) * r;
        const z = grove.z + Math.sin(a) * r;
        const g = home.heightAt(x, z);
        if (g == null) continue;
        if (!clearOfSolids(x, z)) continue;
        const p = new Prop('bamboo', x, g, z, i * 13 + 7);
        this.scene.add(p.group);
        this.props.push(p);
      }
    }

    // A few crates on the outer islands so exploring pays off, plus a stand of
    // bamboo on the bamboo island for anyone who flies out that far.
    for (let k = 1; k < this.islands.length - 1; k++) {
      const isl = this.islands[k];
      for (let i = 0; i < 3; i++) {
        const a = valueNoise(i, k, 61) * Math.PI * 2;
        const r = Math.sqrt(valueNoise(i, k, 67)) * isl.radius * 0.5;
        const x = isl.x + Math.cos(a) * r;
        const z = isl.z + Math.sin(a) * r;
        const g = isl.heightAt(x, z);
        if (g == null) continue;
        const p = new Prop('crate', x, g, z, i + k * 31);
        this.scene.add(p.group);
        this.props.push(p);
      }
      /* Each biome gets its own thing to break, so an island is worth flying
         to for more than the view. The frost island was the emptiest place in
         the game — a handful of trees and three crates on a white disc. */
      const themed = isl.biome === 'bamboo' ? 'bamboo'
        : isl.biome === 'frost' ? 'icicle' : null;
      if (!themed) continue;
      /* The bamboo island is now a bamboo FOREST. It carries the Pandapaw
         shrine, so it's where a kitten who has just sworn the oath is
         standing when she's told to go and cut forty canes — a dozen plants
         would send her straight back to the mainland to do it, which makes
         the flight out here pointless. */
      const n = themed === 'icicle' ? 22 : 70;
      for (let i = 0; i < n; i++) {
        // Golden-angle spiral so they fill the island instead of clumping.
        const a = i * 2.39996 + valueNoise(i, k, 71) * 0.6;
        const r = 4 + Math.sqrt(i / n) * isl.radius * 0.74;
        const x = isl.x + Math.cos(a) * r;
        const z = isl.z + Math.sin(a) * r;
        const g = isl.heightAt(x, z);
        if (g == null) continue;
        if (this.clanHalls.some((h) => Math.hypot(x - h.x, z - h.z) < h.r + 3)) continue;
        if (!clearOfSolids(x, z)) continue;
        const p = new Prop(themed, x, g, z, i * 5 + k);
        this.scene.add(p.group);
        this.props.push(p);
      }
    }

    this.mischiefTotal = this.props.length;
  }

  /* --------------------------- distant scenery --------------------------- */

  _buildDistantScenery() {
    // Silhouette islands far out, purely to sell scale. Flat-shaded, fogged,
    // never collided with.
    const parts = [];
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + valueNoise(i, 1, 3) * 0.5;
      const dist = 620 + valueNoise(i, 2, 9) * 700;
      const x = Math.cos(a) * dist;
      const z = Math.sin(a) * dist;
      const y = -60 + valueNoise(i, 3, 21) * 320;
      const s = 22 + valueNoise(i, 4, 33) * 70;

      const top = new THREE.SphereGeometry(s, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.5);
      top.scale(1, 0.42, 1);
      paint(top, 0x6d8f6a);
      top.translate(x, y, z);
      parts.push(top);

      const bottom = new THREE.ConeGeometry(s * 0.98, s * 1.9, 8);
      bottom.rotateX(Math.PI);
      paint(bottom, 0x6a5f66);
      bottom.translate(x, y - s * 0.95, z);
      parts.push(bottom);

      if (valueNoise(i, 5, 44) > 0.5) {
        const spire = new THREE.ConeGeometry(s * 0.22, s * 0.9, 6);
        paint(spire, 0x5c4f5c);
        spire.translate(x + s * 0.3, y + s * 0.5, z - s * 0.2);
        parts.push(spire);
      }
    }
    const mesh = new THREE.Mesh(mergeParts(parts), toonVertexMat({ fog: true }));
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  /* ----------------------------- petals ---------------------------------- */

  _buildPetals() {
    // Drifting cherry petals. One instanced mesh, 700 of them, ~free.
    const COUNT = 700;
    const geo = new THREE.PlaneGeometry(0.22, 0.16);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffc2dc, side: THREE.DoubleSide, transparent: true, opacity: 0.95,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    this.scene.add(mesh);

    this.petals = { mesh, count: COUNT, data: [] };
    for (let i = 0; i < COUNT; i++) {
      this.petals.data.push({
        x: (Math.random() - 0.5) * 220,
        y: Math.random() * 60,
        z: (Math.random() - 0.5) * 220,
        spin: Math.random() * Math.PI * 2,
        spinRate: (Math.random() - 0.5) * 3,
        fall: 1.1 + Math.random() * 1.6,
        sway: Math.random() * Math.PI * 2,
      });
    }
    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
  }

  update(dt, focus) {
    this.time += dt;

    for (const p of this.props) p.update(dt, this);

    const P = this.petals;
    for (let i = 0; i < P.count; i++) {
      const d = P.data[i];
      d.y -= d.fall * dt;
      d.sway += dt * 1.4;
      d.spin += d.spinRate * dt;
      // Recycle petals around whichever player we're following.
      if (d.y < -20) {
        d.y = 62 + Math.random() * 14;
        d.x = focus.x + (Math.random() - 0.5) * 190;
        d.z = focus.z + (Math.random() - 0.5) * 190;
      }
      this._v.set(d.x + Math.sin(d.sway) * 1.6, d.y, d.z + Math.cos(d.sway * 0.7) * 1.2);
      this._e.set(d.spin * 0.8, d.spin, d.spin * 0.5);
      this._q.setFromEuler(this._e);
      this._m4.compose(this._v, this._q, this._s);
      P.mesh.setMatrixAt(i, this._m4);
    }
    P.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Push a position out of any solid it's inside. Returns the corrected xz. */
  resolveSolids(x, z, radius) {
    for (const s of this.solids) {
      const dx = x - s.x;
      const dz = z - s.z;
      const d = Math.hypot(dx, dz);
      const min = s.r + radius;
      if (d < min && d > 0.0001) {
        const push = (min - d) / d;
        x += dx * push;
        z += dz * push;
      }
    }
    return { x, z };
  }
}

export { fbm };
