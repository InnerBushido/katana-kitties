import * as THREE from 'three';
import { toonVertexMat, xrayVertexMat, paint } from '../core/gfx.js';
import {
  Island, PALETTE, BIOMES, buildHouse, buildTorii, buildLantern, buildTree, buildStall,
  buildBridge, buildBamboo, buildRoad, buildShrine, mergeParts, transformParts,
  valueNoise, fbm,
  buildGrotto, buildSpire, buildShards, SPIRE_H,
  buildArena, ARENA_RING, ARENA_RISE, ARENA_OUT, ARENA_POSTS, postsFor,
  ARENA_BOOTH, ARENA_BOARD, ARENA_GATE,
} from './build.js';
import { Prop } from '../entities/prop.js';
import { ClanShrine } from '../entities/shrine.js';
import { DragonBall, ISLAND_LOCKS } from '../entities/dragonball.js';
import { DRAGON_SPOTS } from '../entities/dragon.js';

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
/*
 * `oath` IS THE CALL TO ACTION, AND IT IS PER CLAN ON PURPOSE.
 *
 * Four adults played this and nobody joined a clan, because nothing ever said
 * they could. The shrine scene introduces the leader and then the game goes
 * quiet: standing in the ring with the power one button press away looks
 * exactly like standing anywhere else. So a kitten who CAN swear here now gets
 * a line over her head with the button on it — see `Game._updateClanPrompt`.
 *
 * SIX LINES AND NOT ONE TEMPLATE. "Press E to join the Thunderpaw clan" six
 * times is a form to fill in; this is meant to be an oath. Each one names what
 * the clan actually GIVES — run, blade, shadow, breath, eyes, patience — so the
 * prompt is also the answer to "why would I", which is the question the
 * silence was really failing to answer. The clan's own `buff.label` says it
 * plainly straight afterwards, when she has sworn.
 */
export const CLANS = [
  {
    id: 'thunder',
    oath: 'Swear to run with Thunderpaw',
    name: 'Thunderpaw',
    color: 0xf5c341,
    tile: 0x8f3038,
    motto: 'loudest paws in the sky',
    buff: { id: 'speed', label: 'Run faster', speed: 1.35 },
  },
  {
    id: 'river',
    oath: 'Bow beneath the long blade of Riverclaw',
    name: 'Riverclaw',
    color: 0x6fd0f0,
    tile: 0x37477d,
    motto: 'never walks around a puddle',
    buff: { id: 'reach', label: 'Longer katana', reach: 1.8 },
  },
  {
    id: 'shadow',
    oath: 'Vanish into the Shadowtail clan',
    name: 'Shadowtail',
    color: 0xb98ce0,
    tile: 0x3d3050,
    motto: 'you never hear them coming',
    buff: { id: 'leap', label: 'Triple jump', jumps: 3, jump: 1.15 },
  },
  {
    id: 'wind',
    oath: 'Pledge your breath to Windwhisker',
    name: 'Windwhisker',
    color: 0x8fe0a0,
    tile: 0x3d6b57,
    motto: 'fastest kittens on any island',
    buff: { id: 'breath', label: 'Huge dragon breath', breath: 1.9 },
  },
  {
    id: 'ice',
    oath: 'Open your eyes with Icewhisker',
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
    oath: 'Promise your patience to Pandapaw',
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
    /** [{x, z, y, r, roof, walls, yaw}] — the star grottos. The game hides
     *  `roof` while somebody is inside and points the x-ray cut on `walls`
     *  at whoever is in there. */
    this.grottos = [];
    /** Road corridors: no grass, flowers or rocks grow through paving. */
    this.roadMask = [];
    this.mischiefTotal = 0;
    this.time = 0;
    /** True once Mr Satan has opened the tournament. See openArena. */
    this.arenaOpen = false;

    this._buildSky();
    this._buildLights();
    this._buildIslands();
    this._buildTown();
    this._buildArena();
    this._buildShrines();
    /* BEFORE the ground detail, and that ordering is the whole point.
       The stars' locks build real furniture — a grotto, a spire, a stack of
       shards — and each registers `keepClear` so nothing is scattered on top
       of it. Called from main.js after the world was finished, as it used to
       be, those entries arrived too late to mean anything: the dusk island had
       already grown a field of boulders, and the grotto came up in the middle
       of them with its doorway completely walled in. Same class of bug as the
       dragon perches, and the fix is the same one — do it while the world is
       still being built, so everything downstream can see it. */
    this.placeDragonBalls();
    /* AFTER the stars, because the grotto mouths reserve ground and this is
       what was burying them. See _scatterOutlying. */
    this._scatterOutlying();
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

  /**
   * Trees and lanterns on the outlying islands.
   *
   * IT RUNS AFTER `placeDragonBalls`, AND IT CHECKS `keepClear`. It used to do
   * neither, and both grottos shipped with their doorways behind trees. Two
   * separate mistakes stacking into one bug: this scatter lived inside
   * `_buildTown`, which runs BEFORE the stars are placed, so the grotto's
   * exclusion zone did not exist yet to be checked — and the loop did not
   * consult `keepClear` in the first place, unlike the home-island loop right
   * above it, so it would not have mattered if it had.
   *
   * This is the fourth time the same shape of bug has bitten this file (see
   * the four ordering bugs in HANDOFF): anything that decides WHERE something
   * goes has to run after everything that reserves ground.
   *
   * The dojo island (last) stays clear so the circle painted on it is
   * readable, and each island dresses itself from its biome so flying
   * somewhere new looks like somewhere new rather than the same island moved.
   */
  _scatterOutlying() {
    const FLORA = {
      meadow: 'blossom', bamboo: 'pine', autumn: 'autumn',
      frost: 'frost', ash: 'ash', dusk: 'dusk',
    };
    const decor = [];
    for (let k = 1; k < this.islands.length; k++) {
      const isl = this.islands[k];
      // The dojo keeps its circle readable and the arena is dressed stone —
      // neither wants a forest. See World.playIslands for why this is a `kind`
      // test rather than a `length - 1`.
      if (isl.kind) continue;
      const leaf = FLORA[isl.biome] ?? 'blossom';

      /* ONE LITTLE HOUSE per odd island, and it moved here for two reasons —
         both of which had already gone wrong.

         It used to sit at the island's exact CENTRE, built during `_buildTown`
         and therefore before the stars were placed, and it registered NO
         SOLID. So nothing downstream knew it was there: `findOpenSpot` walked
         straight over it, and the dusk grotto came up with a house planted
         directly across its doorway. A building nobody can see in the collision
         model is worse than no building — it is a wall the game does not
         believe in.

         Now: after the stars, off centre, `keepClear`-checked, and it leaves a
         solid behind like every other structure in the game. */
      if (k % 2 === 1) {
        const ha = valueNoise(k, 5, 41) * Math.PI * 2;
        const hd = isl.radius * 0.42;
        const hx = isl.x + Math.cos(ha) * hd;
        const hz = isl.z + Math.sin(ha) * hd;
        const hg = isl.heightAt(hx, hz);
        /* ...and it has to dodge the PROPS as well, which nothing else in this
           file needs to do. Props are not solids, so they are invisible to
           every placement test — but the bamboo grove is props, it is planted
           before this runs, and a house dropped on it puts a building around
           forty canes a kid then cannot reach. */
        const blocked = this.keepClear.some((c) => Math.hypot(hx - c.x, hz - c.z) < c.r + 6)
          || this.solids.some((s) => Math.hypot(hx - s.x, hz - s.z) < s.r + 7)
          || this.props.some((pr) => Math.hypot(hx - pr.home.x, hz - pr.home.z) < 7);
        if (hg != null && !blocked) {
          const parts = buildHouse({
            w: 6, d: 5, floors: 1,
            tile: k % 4 === 1 ? PALETTE.tileIndigo : PALETTE.tileRed,
          });
          transformParts(parts, hx, hg, hz, valueNoise(k, 1, 1) * 6);
          decor.push(...parts);
          this.solids.push({ x: hx, z: hz, r: 4.2 });
        }
      }

      for (let i = 0; i < 18; i++) {
        const a = valueNoise(i, k, 13) * Math.PI * 2;
        const r = Math.sqrt(valueNoise(i, k, 29)) * isl.radius * 0.72;
        const x = isl.x + Math.cos(a) * r;
        const z = isl.z + Math.sin(a) * r;
        const g = isl.heightAt(x, z);
        if (g == null) continue;
        // The grotto mouth, the shrines, the stars — everything that reserved
        // ground before this ran.
        if (this.keepClear.some((c) => Math.hypot(x - c.x, z - c.z) < c.r)) continue;
        if (this.solids.some((s) => Math.hypot(x - s.x, z - s.z) < s.r + 2.5)) continue;
        // No decorative bamboo anywhere: if it looks like bamboo it must cut,
        // so every cane in the game is a prop. Trees and lanterns only here.
        const parts = i % 6 === 0
          ? buildLantern(0.8)
          : buildTree(i * 7 + k, 0.8 + valueNoise(i, k, 3) * 0.5, leaf);
        transformParts(parts, x, g, z, valueNoise(i, k, 9) * 6);
        decor.push(...parts);
        this.solids.push({ x, z, r: isl.biome === 'bamboo' ? 0.7 : 0.9 });
      }
    }
    if (!decor.length) return;
    const mesh = new THREE.Mesh(mergeParts(decor), toonVertexMat());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  /**
   * The grotto a kitten is standing in, or null.
   *
   * Slightly INSIDE the wall ring (0.94), so the roof does not blink off while
   * she is still walking up the outside of it — the mouth is a gap in that
   * ring, so a flat radius test is true a step before she is actually through.
   */
  grottoAt(x, z) {
    for (const G of this.grottos) {
      if (Math.hypot(x - G.x, z - G.z) < G.r * 0.94) return G;
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
    /* FOUR OF THESE USED TO BE THE ISLAND'S OWN CENTRE, written out as world
       coordinates — `{x: 150, z: -95}` IS island 1. A shrine in the dead
       middle of an island is somewhere you trip over rather than somewhere you
       walk to, and it breaks `leaderSpot`, which stands the leader 3.4 further
       out along the axis from the centre and has no axis at zero.

       It never showed because the outlying TREES were planted before this ran,
       so `findOpenSpot` was shoved off centre by whichever trunk it happened
       to land on. Moving them after the stars took the accident away.

       `out` is a BEARING and a fraction of the island's radius, so a shrine is
       always somewhere on its island whatever the island's size or position
       becomes. The two that were already placed by hand keep their exact
       coordinates — those were deliberate and they read well. */
    const wanted = [
      { clan: CLANS[0], island: 0, x: -62, z: 40 },     // home, west meadow
      { clan: CLANS[1], island: 1, out: 0.55, a: 0.6 },  // autumn
      { clan: CLANS[2], island: 4, out: 0.52, a: 2.4 },  // ash
      { clan: CLANS[3], island: 5, out: 0.55, a: 3.7 },  // dusk
      { clan: CLANS[4], island: 2, out: 0.55, a: 5.0 },  // frost
      { clan: CLANS[5], island: 3, x: 78, z: 150 },     // bamboo
    ];

    const parts = [];
    for (const w of wanted) {
      /* A WANTED POSITION THAT IS OFF ITS ISLAND LANDS THE SHRINE DEAD CENTRE,
         and four of these six were. `findOpenSpot` spirals outward from where
         it is asked and takes the first valid ground — asked from out over
         open sky, the nearest valid ground is the middle of the island, so
         Riverclaw, Shadowtail, Windwhisker and Icewhisker all sat at exactly
         (isl.x, isl.z). That is bad on its own (a shrine you walk to should be
         somewhere, not in the middle) and it breaks `leaderSpot`, which puts
         the leader 3.4 further out along the axis from the island's centre and
         has no axis at all at zero.

         It went unnoticed because the outlying TREES used to be planted before
         this ran and shoved the search off centre by accident. Moving them
         after the stars (see _scatterOutlying) took the accident away and this
         surfaced — the coordinates had been wrong the whole time.

         So: keep the BEARING, which is the part that carries intent (which
         side of the island the shrine is on), and pull the radius back onto
         the island. Only when the wanted point really is off it — the two that
         were already on their island are left exactly where they were. */
      const isl = this.islands[w.island];
      const wx = w.out != null
        ? isl.x + Math.cos(w.a) * isl.radius * w.out
        : w.x;
      const wz = w.out != null
        ? isl.z + Math.sin(w.a) * isl.radius * w.out
        : w.z;
      // Same clearance search the dragons use, so a shrine never lands inside
      // a house or half off the rim of an island.
      const spot = this.findOpenSpot(wx, wz, 9) ?? { x: wx, z: wz };
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

  /* ------------------------------ the arena ------------------------------ */

  /**
   * Raise the World Martial Arts Tournament grounds.
   *
   * Built at boot with everything else — it is 330 units away and merged into
   * one mesh, so building it eagerly costs a draw call nobody sees, and the
   * alternative (assembling an island the first time somebody opens the
   * tournament) is a frame-long hitch at the exact moment a cutscene is
   * playing. What is deferred is not the geometry, it is the VISIBILITY and
   * the ground under it — see `heightAt` and `openArena`.
   */
  _buildArena() {
    const isl = this.arenaIsland;
    const g = isl.heightAt(isl.x, isl.z) ?? isl.baseY;
    const { parts, solids, platforms } = buildArena();
    transformParts(parts, isl.x, g, isl.z, 0, 1);

    const mesh = new THREE.Mesh(mergeParts(parts), toonVertexMat());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.visible = false;
    this.scene.add(mesh);
    this.arenaProps = mesh;

    /* The builder works in ARENA-LOCAL coordinates, because every number in
       it is measured against the ring's own centre and half-width. The world
       wants absolute ones, so the offset is applied here, once, in the same
       place the geometry is moved — two separate translations of the same
       pile of numbers is how a collider ends up 330 units from the wall it
       describes. */
    for (const s of solids) {
      this.solids.push({
        x: isl.x + s.x, z: isl.z + s.z, r: s.r,
        top: s.top == null ? undefined : g + s.top,
        arena: true,
      });
    }
    /* Tagged `arena`, and `heightAt` skips them while the tournament is shut.
       Hiding the ISLAND is not enough on its own: platforms are a separate
       list that never consulted an island at all, so the ring deck and the
       announcer's box stayed perfectly solid 2.4 units above nothing. A
       kitten flown to the coordinates would have landed on an invisible
       stone square in open sky — which is a far worse bug than an arena you
       can reach early, because it looks like the world is broken. */
    for (const p of platforms) {
      this.platforms.push({
        x0: isl.x + p.x0, x1: isl.x + p.x1,
        z0: isl.z + p.z0, z1: isl.z + p.z1,
        y: g + p.y, arena: true,
      });
    }

    /** The fighting deck, in world coordinates. The tournament reads this. */
    this.arenaRing = {
      x: isl.x, z: isl.z, y: g + ARENA_RISE, half: ARENA_RING, out: ARENA_OUT,
    };
    /** Where a fighter is posted at the top of a round, and who announces it. */
    this.arenaPosts = ARENA_POSTS.map((p) => ({
      x: isl.x + p.x, z: isl.z + p.z, y: g + ARENA_RISE,
    }));
    /** Where a fighter stands at the top of a round, given the teams. Two
     *  fighters fall through to `arenaPosts` unchanged — see build.postsFor. */
    this.postsForSides = (sides) => postsFor(sides).map((p) => ({
      x: isl.x + p.x, z: isl.z + p.z, y: g + ARENA_RISE,
    }));
    this.arenaBooth = { x: isl.x + ARENA_BOOTH.x, y: g + 6.7, z: isl.z + ARENA_BOOTH.z };
    this.arenaBoard = { x: isl.x + ARENA_BOARD.x, y: g + 4.2, z: isl.z + ARENA_BOARD.z };
    /* Where the griffin sets both kittens down: IN FRONT OF THE TORII, on the
       side it is approached from, so the walk in goes THROUGH the gate.

       IT USED TO BE + 30, WHICH IS FOUR UNITS PAST THE GATE AT + 34. The town
       is north of the arena, so the flight comes in down the +z axis and the
       last thing it did before touching down was fly through the torii —
       reported as looking bad, and it is: the gate is the one piece of
       architecture out here that means something, and passing through it at
       speed, sideways, on an animal, is the opposite of the ceremony it is for.

       + 44 is on the near side of it with room to land. The comment this
       replaces already said the walk in was the shot; it just had the kittens
       on the wrong side of the gate to take it. Still clear of the outermost
       seating, which reaches ARENA_RING + 24.4, and still on the island —
       radius 90 against 28 + 44 = 72 from its centre. */
    this.arenaGate = { x: isl.x, y: g, z: isl.z + ARENA_RING + ARENA_GATE };
    this.arenaLanding = { x: isl.x, y: g, z: isl.z + ARENA_RING + 44 };
  }

  /**
   * Open the tournament grounds, or shut them again.
   *
   * One call, because "the arena exists" is three separate facts — the island
   * mesh, the furniture, and whether `heightAt` answers out there — and three
   * facts set from three places is how you get an island you can stand on and
   * cannot see.
   */
  openArena(on = true) {
    this.arenaOpen = on;
    if (this.arenaMesh) this.arenaMesh.visible = on;
    if (this.arenaProps) this.arenaProps.visible = on;
  }

  /**
   * How far OUTSIDE the fighting deck a point is, in world units.
   *
   * Negative inside, zero on the painted line, positive once she is out. It
   * returns a distance rather than a boolean so the tournament can warn at
   * the edge and only rule at the line — a ring-out that fires with no
   * build-up reads as the game taking the round away from you.
   *
   * Measured on the SQUARE (a Chebyshev distance), because the ring is a
   * square and a radial test would call the corners out while she is still
   * standing on stone — the corners are where a knockback puts you.
   */
  arenaOutBy(x, z) {
    const R = this.arenaRing;
    if (!R) return Infinity;
    const d = Math.max(Math.abs(x - R.x), Math.abs(z - R.z));
    return d - (R.half - R.out);
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

    for (let k = 0; k < this.islands.length; k++) {
      const isl = this.islands[k];
      /* Not on the dojo, and not on the arena. Grass tufts and boulders would
         push straight up through a dressed stone ring — this loop tests the
         road mask but nothing else, so a scattered rock has no idea the deck
         is above it. Bare is also correct: the arena is the one place in the
         world somebody swept. */
      if (isl.kind) continue;
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

    /* Keep the sunset as the thing to come BACK to. `setDusk` lerps toward the
       storm palette from these, so the day is never lost to rounding after a
       few summonings — a sky that drifts a shade darker every time the dragon
       comes and goes is the sort of bug nobody can point at. */
    this._daySky = {
      top: this.skyMat.uniforms.top.value.clone(),
      mid: this.skyMat.uniforms.mid.value.clone(),
      horizon: this.skyMat.uniforms.horizon.value.clone(),
      sun: this.skyMat.uniforms.sunColor.value.clone(),
      fog: this.scene.fog.color.clone(),
      fogNear: this.scene.fog.near,
    };
    this._duskSky = {
      top: new THREE.Color(0x05060f),
      mid: new THREE.Color(0x0d1430),
      horizon: new THREE.Color(0x2a1c4a),
      sun: new THREE.Color(0x6a5aa0),
      fog: new THREE.Color(0x140f28),
      fogNear: 260,
    };
    this.dusk = 0;
  }

  /**
   * Darken the sky for Ryuuseki, 0 = sunset, 1 = storm.
   *
   * The lights come down with it. Leaving them alone made the islands sit in
   * bright afternoon sunshine under a black sky, which reads as a broken
   * shader rather than as nightfall — the give-away is that everything keeps
   * its warm rim light while the sky behind it says midnight.
   */
  setDusk(k) {
    if (k === this.dusk) return;
    this.dusk = k;
    const U = this.skyMat.uniforms;
    const D = this._daySky;
    const N = this._duskSky;
    U.top.value.copy(D.top).lerp(N.top, k);
    U.mid.value.copy(D.mid).lerp(N.mid, k);
    U.horizon.value.copy(D.horizon).lerp(N.horizon, k);
    U.sunColor.value.copy(D.sun).lerp(N.sun, k);
    this.scene.fog.color.copy(D.fog).lerp(N.fog, k);
    this.scene.fog.near = THREE.MathUtils.lerp(D.fogNear, N.fogNear, k);
    for (const L of this.lights ?? []) {
      L.intensity = L.userData.dayIntensity * (1 - k * 0.62);
    }
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
    /* 0.05 was fine while every shadow-receiving surface in the game was a
       small flat-shaded box or a hillside. The grotto dome is the first big
       SMOOTH curved thing in the world, and a smooth surface at a grazing
       angle to the sun is the classic shadow-acne case: the whole roof came
       out banded with dark crawling arcs that read exactly like z-fighting and
       are not. `normalBias` pushes the shadow lookup along the surface normal,
       which is the fix that costs nothing on flat geometry and everything on
       curved — hence why it was never needed before. */
    sun.shadow.normalBias = 0.9;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    // Warm bounce from below (the sunset) + cool sky fill.
    const hemi = new THREE.HemisphereLight(0x86bfe8, 0xe8834a, 0.72);
    this.scene.add(hemi);
    const rim = new THREE.DirectionalLight(0x7fc4ff, 0.38);
    rim.position.set(-1, 0.35, 1).multiplyScalar(100);
    this.scene.add(rim);

    /* Remembered so setDusk can bring them down together. Storing the day
       value on the light rather than recomputing means the dusk ramp can be
       driven to any point and back without accumulating error. */
    this.lights = [sun, hemi, rim];
    for (const L of this.lights) L.userData.dayIntensity = L.intensity;
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
        kind: 'dojo',
        flatten: [{ x: -230, z: 70, r: 46, falloff: 14, y: 0.9 }],
      },
      /* The tournament grounds — and the distance is the feature.
         It sits 330 units from the town and 259 from the nearest island,
         which is well past anything a kid reaches by wandering: every other
         island in the game is a visible hop from one you are already on, and
         this one is not on the way to anywhere. That is what lets the arena be
         a place you are TAKEN to rather than a place you find, and it is why
         the griffin exists — see `World.arenaReachable`, which keeps a dragon
         off it until Mr Satan opens the tournament.
         Flatter than the dojo (hill 0.9) because a fighting ring laid on a
         rolling surface is a fighting ring with a lip you trip over, and the
         one thing a knockback must never do is snag. */
      {
        x: 40, z: -330, baseY: 46, radius: 90, seed: 89, hill: 0.9, plateau: 0.86,
        kind: 'arena', biome: 'arena',
        flatten: [{ x: 40, z: -330, r: 74, falloff: 13, y: 0.6 }],
      },
    ];

    const parts = [];
    /* THE ARENA ISLAND IS ITS OWN MESH, and that is the whole locking
       mechanism. Everything else in the archipelago is merged into one
       geometry for the draw-call budget, which is right — and it is also why
       an island cannot be hidden once it is in there. The tournament grounds
       have to not exist until Mr Satan opens them: "blocked" enforced as a
       barrier you bounce off is a wall a kid can see and be baffled by,
       whereas an island that simply is not in the sky yet asks no questions.
       `heightAt` skips it too while it is shut, so a dragon flown out to the
       coordinates finds open air rather than an invisible floor. */
    const arenaParts = [];
    for (const d of defs) {
      const isl = new Island(d);
      (isl.kind === 'arena' ? arenaParts : parts).push(isl.buildMesh());
      this.islands.push(isl);
    }

    const geo = mergeParts(parts);
    const mesh = new THREE.Mesh(geo, toonVertexMat());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.terrainMesh = mesh;

    const arenaMesh = new THREE.Mesh(mergeParts(arenaParts), toonVertexMat());
    arenaMesh.castShadow = true;
    arenaMesh.receiveShadow = true;
    arenaMesh.visible = false;
    this.scene.add(arenaMesh);
    this.arenaMesh = arenaMesh;

    /* BY KIND, NOT BY INDEX. This read `islands[islands.length - 1]`, which
       was true for exactly as long as the dojo was the last thing in the
       list — appending the arena after it silently handed every dojo query
       the tournament grounds instead, and the maths island is the one place
       in the game where being quietly wrong is worst. Same lesson as
       `trackForIsland`: a special case has to be asked for by name. */
    this.dojoIsland = this.islands.find((i) => i.kind === 'dojo');
    const dy = this.dojoIsland.heightAt(this.dojoIsland.x, this.dojoIsland.z);
    this.dojoCentre = new THREE.Vector3(this.dojoIsland.x, dy ?? 30, this.dojoIsland.z);

    this.arenaIsland = this.islands.find((i) => i.kind === 'arena');
    const ay = this.arenaIsland.heightAt(this.arenaIsland.x, this.arenaIsland.z);
    this.arenaCentre = new THREE.Vector3(this.arenaIsland.x, ay ?? 46, this.arenaIsland.z);
  }

  /**
   * The islands the seven-star hunt covers — everything but the arena.
   *
   * THE DOJO IS IN HERE. It is a built place like the arena and it is skipped
   * by the tree and prop scatters for that reason, but it carries the 7★ and
   * is very much part of the adventure — so "is this island special" and "does
   * this island hold a star" are two different questions and must not share
   * one list. Writing this filter as `!i.kind` looked tidy and quietly moved
   * the 7★ off the maths island.
   *
   * The scatters ask `isl.kind` at their own call sites instead, because what
   * they actually mean is "nothing grows on dressed stone" — a different rule
   * again, and one a ninth island should inherit by default.
   */
  get questIslands() {
    return this.islands.filter((i) => i.kind !== 'arena');
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
      /* A SHUT ARENA HAS NO GROUND. This is what stops a kid flying a dragon
         out to the tournament before it opens: not a barrier, not a refusal —
         there is simply nothing under her out there, exactly as if the island
         had not been raised yet, which is the story the game is telling. It
         has to be here rather than only on the mesh, or the place would be
         invisible and still perfectly walkable. */
      if (isl.kind === 'arena' && !this.arenaOpen) continue;
      const h = isl.heightAt(x, z);
      if (h != null && (best == null || h > best.y)) best = { y: h, island: isl };
    }
    for (const p of this.platforms) {
      if (p.arena && !this.arenaOpen) continue;
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
      /* PUSH, not assign. This used to replace the array outright, which is a
         landmine rather than a bug today only because nothing happens to add
         to it before the town is built. Anything that ever does would be
         silently discarded here, and the symptom — one cherry tree grown
         somewhere it shouldn't be — is not something you would trace back. */
      this.keepClear.push(
        { x: BRIDGE.x, z: BRIDGE.z, r: 16 },
        { x: 58, z: 44, r: 17 },
        { x: -72, z: -30, r: 16 },
      );
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
    for (let k = 1; k < this.islands.length; k++) {
      const isl = this.islands[k];
      /* NO KNOCKABLE PROPS IN THE ARENA, and this one is not cosmetic.
         `mischiefTotal` counts every prop in the world, and the tournament
         unlocks at 80% of it — so a crate that can only be reached by going
         to the arena would be a crate you need in order to open the place it
         is standing in. The 100% ending has the same circular problem. The
         dojo is excluded for the older reason: a clean floor to draw on. */
      if (isl.kind) continue;
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
    /* EVERY POINT EITHER KITTEN WILL EVER HAVE. The whole game's currency is
       knocking things over, so this is not a statistic — it is the size of the
       economy, and the Kotodama stall's prices are computed from it rather
       than picked (see `orbPrice`). Summed from the props themselves so
       retuning what a barrel is worth moves the shop with it instead of
       silently making orbs cheap. */
    this.pointsTotal = this.props.reduce((n, p) => n + (p.points ?? 10), 0);
  }

  /* ---------------------------- dragon balls ----------------------------- */

  /**
   * One star on every island — which is why there are seven of each.
   *
   * Placed through `findOpenSpot`, the same check the dragon perches use: it
   * wants solid level ground all the way round at the object's own radius, not
   * merely under the centre point. A ball on a rim looks fine in a screenshot
   * and cannot be walked up to, and unlike a dragon there is no flying to it.
   *
   * They avoid the shrines deliberately. A star sitting in a clan's join ring
   * would be picked up by accident by a kitten going to swear an oath, and the
   * one thing this hunt has going for it is that finding each one is a
   * decision.
   */
  /**
   * IT BUILDS THE BALLS ITSELF. This used to take a `make` callback, and the
   * callback was written out twice — once in main.js and once in the smoke
   * test. When the locks were added, only the test's copy learned to forward
   * the new `lock` argument, so `world-check` reported seven correctly locked
   * stars while the actual game handed out seven unlocked ones. Every check
   * passed. The bug was the duplication, not either copy of it, and there is
   * no principle being upheld by the indirection — world.js already imports
   * Prop and ClanShrine and builds those directly.
   */
  /**
   * Where every dragon actually ends up, resolved once and shared.
   *
   * Two callers need the same answer and for opposite reasons: `_spawnDragons`
   * puts an animal there, and `placeDragonBalls` must not build a grotto on
   * top of it. Dragons are not `solids`, so without this the world has no
   * record that anything is standing there at all — and the first grotto went
   * up around one, wings out through the roof.
   */
  dragonPerches() {
    if (this._perches) return this._perches;
    this._perches = DRAGON_SPOTS.map((s) => {
      const open = this.findOpenSpot(s.x, s.z, 10) ?? s;
      const g = this.heightAt(open.x, open.z);
      return g ? { ...s, x: open.x, z: open.z, y: g.y } : null;
    }).filter(Boolean);
    return this._perches;
  }

  placeDragonBalls() {
    this.dragonBalls = [];
    /** Rock built for the locks, merged in one go at the end. */
    const rock = [];

    this.islands.forEach((isl, i) => {
      /* SEVEN STARS, SEVEN ISLANDS — the arena is the eighth and gets none.
         `ISLAND_LOCKS[7]` is undefined and the `?? 'none'` below would have
         turned that into a free eighth star lying in the open on a ring
         nobody can reach yet: the hunt would read 7/7 with one still on the
         ground, and Ryuuseki — who is what OPENS the arena — could never be
         summoned. The `?? 'none'` fallback is exactly the kind of quiet
         default that makes a new island look like it works. */
      if (isl.kind === 'arena') return;
      const lock = ISLAND_LOCKS[i] ?? 'none';
      /* A BALL needs only to stay out of a join ring. A BUILDING needs to stay
         out of the whole scene: the first dusk grotto went up eight units
         behind the Windwhisker gate, so the shrine, its leader, its beam and a
         rock dome the size of the shrine itself were all one heap — and the
         shrine advertises itself at three distances precisely so it reads from
         a long way off, which a dome parked behind it wrecks.
         The furniture also has to dodge the DRAGON PERCHES. Dragons are not
         solids, so nothing in `findOpenSpot` knows one is standing there; the
         same grotto enclosed a perched dragon, wings out through the roof. */
      /* Sized per lock from how much room the thing actually takes up, not
         picked. A grotto is 10.5 of dome with outlying boulders to ~15.9, and
         a shrine is about 7 across, so they need roughly 27 between centres
         before they stop being one heap; the spire and the shards are much
         smaller. A flat generous number is what broke it the other way — 30
         units of exclusion deletes the whole ash island, which is 28 across.
         The cave number went 24 -> 27 when the dome went 8.2 -> 10.5 to make
         room for the maze inside it; it is derived from the dome, so it has to
         move when the dome does. `placeDragonBalls` relaxes it in four passes
         before giving up, and `world-check` fails outright on a lock that
         falls back to a plain star, so an over-tight number here is loud
         rather than silent. */
      /* The BREAKABLE wards get a separation too, smaller. They build nothing,
         but they are things you have to see and then hit — and a perched
         dragon is a 24-unit sprite that will happily stand in front of one.
         The bamboo island put its boulder directly under one. */
      const SEP = { cave: 30, perch: 17, sky: 15, ice: 13, boulder: 13 };
      const sep0 = SEP[lock] ?? 0;
      const perches = sep0 ? this.dragonPerches() : [];
      /* THE DOJO'S CIRCLE IS NOT A BUILDING SITE. Its flattened disc is the
         maths lesson — a grotto standing on the graph paper would be a rock in
         the middle of the diagram the whole island exists to draw, and the
         dojo camera frames that disc. Clear of `dojoRadius` and it is out on
         the rim where the island has nothing else to do. */
      const dc = this.dojoCentre;
      const offCircle = (x, z) => isl !== this.dojoIsland
        || Math.hypot(x - dc.x, z - dc.z) > 52;

      /* The locks that build furniture need more room than a ball does, and
         they need it CLEAR — a grotto half inside a hillside has a doorway you
         cannot walk through, and the star is then unreachable with no visible
         reason why. */
      /* 6 for a plain star, not 2.2. `findOpenSpot` measures against a tree's
         SOLID, which is its trunk at radius 0.9 — but what hides a star is the
         canopy, and those are about four across. At 2.2 the frost island put
         snow trees 3.5 units from the ice ward and buried the thing you are
         meant to spot from a dragon and burn. The trees are planted before the
         stars are placed (see the World constructor), so the star is the one
         that has to move. */
      const clearance = lock === 'cave' ? 15 : lock === 'perch' ? 6 : lock === 'sky' ? 5 : 6;

      /* RELAXING BEATS FALLING BACK. The first version made one pass at the
         full clearance and, failing that, dropped the lock and placed a plain
         star — which is how the dojo island silently ended up with a second
         free star and the game shipped one cave instead of two. A grotto
         squeezed into nine units of level ground is still a grotto; a lock
         that quietly isn't there is a hole in the design nobody sees.
         So: try the ideal, then tighter, then tighter again. */
      let spot = null;
      for (const squeeze of [1, 0.82, 0.66, 0.5]) {
        const need = Math.max(4, clearance * squeeze);
        // The separation relaxes with the clearance. On a small island already
        // carrying a shrine and a dragon there may be no spot that satisfies
        // the ideal, and a slightly crowded grotto beats no grotto at all.
        const sep = sep0 * squeeze;
        const away = (x, z) => !this.clanHalls.some(
          (h) => Math.hypot(x - h.x, z - h.z) < h.r + Math.max(8, sep)
        ) && !perches.some((p) => Math.hypot(x - p.x, z - p.z) < sep * 0.82);

        for (let k = 0; k < 72 && !spot; k++) {
          const a = k * 2.39996 + i;
          const r = 6 + (k / 72) * isl.radius * 0.82;
          const x = isl.x + Math.cos(a) * r;
          const z = isl.z + Math.sin(a) * r;
          if (!away(x, z) || !offCircle(x, z)) continue;
          const open = this.findOpenSpot(x, z, need);
          if (open && away(open.x, open.z) && offCircle(open.x, open.z)) spot = open;
        }
        if (spot) break;
      }
      /* And only if all three passes failed. The old fallback was the island's
         own centre, which on the home island is the middle of the market —
         a grotto in the town square is the kind of thing that ships. */
      let kind = lock;
      if (!spot) {
        spot = this.findOpenSpot(isl.x, isl.z, 3) ?? { x: isl.x, z: isl.z };
        if (clearance > 6) kind = 'none';
      }

      const ground = this.heightAt(spot.x, spot.z);
      const gy = ground ? ground.y : 0;
      // Where the star itself ends up. Most locks leave it on the ground; the
      // spire and the shards lift it.
      let bx = spot.x;
      let by = gy;
      let bz = spot.z;
      // Which way the furniture faces: in toward the island, so a staircase
      // climbs over grass rather than out over open sky, and a grotto's mouth
      // faces the way a kitten walks up to it.
      const inward = Math.atan2(isl.x - spot.x, isl.z - spot.z);

      if (kind === 'cave') {
        const G = buildGrotto(i * 7 + 3);
        rock.push(...transformParts(G.parts, spot.x, gy, spot.z, inward));
        /* TWO EXTRA MESHES PER GROTTO, doing two different jobs.

           `roof` is the dome and the ceiling, and it is simply HIDDEN while
           somebody is inside. There is no shader trick for a roof: you cannot
           look down into a room through one, and an x-ray hole in the middle
           of a dome is a hole in the sky.

           `walls` are the outer ring and the maze, and they STAY DRAWN — with
           the x-ray material, so a wall standing between the camera and a
           kitten opens a soft porthole around her instead of the whole
           building disappearing. That is the difference between a room you
           can see into and a room that stops existing when you enter it. */
        /* BOTH GET THE X-RAY MATERIAL, and each gets its OWN instance because
           the cut lives in that material's uniforms — one shared material
           would mean both grottos opening the same hole in the same place.
           The roof needs it as much as the walls do: it is the widest part of
           the building, so walking PAST a grotto is what the dome hides you
           behind, and that happens far more often than being inside one. */
        const roof = new THREE.Mesh(
          mergeParts(transformParts(G.roofParts, spot.x, gy, spot.z, inward)),
          xrayVertexMat()
        );
        roof.castShadow = true;
        roof.receiveShadow = true;
        this.scene.add(roof);

        const walls = new THREE.Mesh(
          mergeParts(transformParts(G.wallParts, spot.x, gy, spot.z, inward)),
          xrayVertexMat()
        );
        walls.castShadow = true;
        walls.receiveShadow = true;
        this.scene.add(walls);

        this.grottos.push({
          x: spot.x, z: spot.z, y: gy, r: G.r, roof, walls,
          /* Which way the doorway faces, so the camera inside can look along
             the axis a player walked in on rather than at the back wall. */
          yaw: inward,
        });
        /* NOTHING GROWS ACROSS THE MOUTH. `mouth` is `r + 4.5` out along the
           doorway axis, so a keepClear centred on the dome has to reach past
           it — and the trees that were burying both entrances are planted from
           `_scatterOutlying`, which now runs AFTER this. */
        const mx = spot.x + Math.sin(inward) * G.mouth.z;
        const mz = spot.z + Math.cos(inward) * G.mouth.z;
        this.keepClear.push({ x: mx, z: mz, r: 9 });
        for (const s of G.solids) {
          const c = Math.cos(inward);
          const sn = Math.sin(inward);
          this.solids.push({
            x: spot.x + s.x * c + s.z * sn,
            z: spot.z - s.x * sn + s.z * c,
            r: s.r,
          });
        }
        /* LIGHT TO EXPLORE BY. The grotto is a sealed dome, so the sun is
           shadowed out of it and the only thing reaching the inside is the
           hemisphere fill — about a third of the light outside, on rock
           painted to read in daylight. Before the maze that was survivable,
           because the star was the one bright thing in an otherwise empty room
           and you walked straight at it. A maze you cannot see is not a maze,
           it is a wall you bump along, so each grotto now carries its own
           light.

           A POINT LIGHT AND A VISIBLE SOURCE, TOGETHER. Either alone is worse
           than neither: light with nothing making it looks like a shader bug,
           and glowing crystals that light nothing look like stickers on a dark
           wall. The crystals are unlit meshes (their own material, outside the
           merged toon mesh) and the lamp is a real light hung at the same
           spot.

           DELIBERATELY NOT IN `this.lights`, which is what `setDusk` dims. A
           crystal burning inside a cave has nothing to do with the sky over
           the island, and dimming it when Ryuuseki turns up would put the
           interior back where it started at exactly the point in the game
           somebody is most likely to be in one. */
        for (const L of G.lamps ?? []) {
          const c = Math.cos(inward);
          const sn = Math.sin(inward);
          const lx = spot.x + L.x * c + L.z * sn;
          const lz = spot.z - L.x * sn + L.z * c;
          const lamp = new THREE.PointLight(0xffc98a, 26, 26, 2);
          lamp.position.set(lx, gy + L.y, lz);
          this.scene.add(lamp);
          const crystal = new THREE.Mesh(
            new THREE.IcosahedronGeometry(0.5, 0),
            new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false })
          );
          crystal.position.copy(lamp.position);
          this.scene.add(crystal);
        }
        /* Nothing grows in the doorway or inside the dome. A cherry tree
           across the mouth is a star you can see the glow of and cannot reach,
           and it would look like level design rather than like a bug.
           Sized off the dome (13) plus its outlying boulders (to ~18.4),
           not a round number — it grew when the grotto did. */
        this.keepClear.push({ x: spot.x, z: spot.z, r: 21 });
      } else if (kind === 'perch') {
        const S = buildSpire(i * 11 + 5);
        rock.push(...transformParts(S.parts, spot.x, gy, spot.z, 0));
        by = gy + SPIRE_H + 1.05;
        /* `top` so it stops pushing once you are up there. A solid this wide
           with a deck on it is the case World.resolveSolids grew a height for:
           without it, landing on the spire shoves you straight back off. */
        for (const s of S.solids) {
          this.solids.push({ x: spot.x + s.x, z: spot.z + s.z, r: s.r, top: by });
        }
        /* The spire IS a platform — without this the top is decoration and a
           dragon hovering over it has nothing to put the kitten down on. */
        this.platforms.push({
          x0: spot.x - 2.1, x1: spot.x + 2.1,
          z0: spot.z - 2.1, z1: spot.z + 2.1,
          y: by,
        });
        this.keepClear.push({ x: spot.x, z: spot.z, r: 9 });
      } else if (kind === 'sky') {
        const S = buildShards(i * 13 + 9);
        rock.push(...transformParts(S.parts, spot.x, gy, spot.z, inward));
        const c = Math.cos(inward);
        const sn = Math.sin(inward);
        for (const p of S.pads) {
          const px = spot.x + p.x * c;
          const pz = spot.z - p.x * sn;
          /* Square platforms inscribed in a round pad. `platforms` are
             axis-aligned boxes and the pads are discs, so the deck is the
             biggest square that fits inside one — erring small, because a
             corner of walkable air off the edge of a visible platform is far
             more confusing than a rim you cannot quite stand on. */
          const half = p.r * 0.62;
          this.platforms.push({
            x0: px - half, x1: px + half, z0: pz - half, z1: pz + half,
            y: gy + p.y,
          });
          this.keepClear.push({ x: px, z: pz, r: p.r + 2 });
        }
        const top = S.pads[S.pads.length - 1];
        bx = spot.x + top.x * c;
        bz = spot.z - top.x * sn;
        by = gy + top.y;
        this.keepClear.push({ x: spot.x, z: spot.z, r: 10 });
      }

      const ball = new DragonBall(i + 1, bx, by, bz, isl, kind);
      this.scene.add(ball.group);
      this.dragonBalls.push(ball);
      /* A CLEARING, not just "nothing on the exact spot". At 4 the frost
         island planted snow trees five units away whose canopies are four
         across, and the ice ward — a thing you are supposed to spot from a
         dragon and then burn — was completely hidden underneath them. The
         clearing is also the tell: a bare circle with something glowing in
         the middle of it reads as deliberate from a long way off. */
      this.keepClear.push({ x: bx, z: bz, r: 9 });
    });

    if (rock.length) {
      const mesh = new THREE.Mesh(mergeParts(rock), toonVertexMat());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.lockMesh = mesh;
    }
    return this.dragonBalls;
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

      /* THIS RING IS CENTRED ON THE ORIGIN, AND THE ARENA IS NOT.
         These silhouettes exist to sell distance, which works while the only
         place you stand is the archipelago in the middle of them — the
         nearest is 620 units from the town. The tournament grounds are 330
         units north, so the same "far away" island can be 290 units from a
         fighter, and 90 units of it is a solid cone: from the ring one of
         them hung over the announcer's box looking like a piece of the venue
         that had come loose. Dropping the few that crowd the arena is
         invisible — they are procedural scenery, and there are 22 of them. */
      if (Math.hypot(x - this.arenaCentre.x, z - this.arenaCentre.z) < 560 + s * 2) continue;

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
  /**
   * Push a body out of anything solid it has walked into.
   *
   * `fromY` IS NOT OPTIONAL FOR ANYTHING THAT CAN GET ON TOP OF A SOLID.
   * These are infinite cylinders — that was fine while every solid was a tree
   * or a house you can only ever walk around, and it broke the moment
   * something in the world became both solid AND climbable. The spire holding
   * the ash island's star is a 4.4-radius column with a 2.1-radius deck on
   * top: a kitten who flies up and lands on it is, in plan view, deep inside
   * the solid, so the old version shoved her straight off the thing she had
   * just landed on. It looked like the platform was rejecting her.
   *
   * A solid with a `top` stops pushing once you are standing above it. Solids
   * without one are unchanged and still infinite, which is right for a tree.
   */
  resolveSolids(x, z, radius, fromY = Infinity) {
    for (const s of this.solids) {
      /* The arena's stonework does not exist while the tournament is shut,
         for the same reason its ground does not. A solid with no `top` is an
         INFINITE cylinder — the record board is one — so leaving these live
         would let a kitten flying past the empty coordinates be shoved
         sideways by a building that has not been built. */
      if (s.arena && !this.arenaOpen) continue;
      if (s.top != null && fromY >= s.top - 0.35) continue;
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
