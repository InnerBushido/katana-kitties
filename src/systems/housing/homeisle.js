import * as THREE from 'three';
import { toonVertexMat, xrayVertexMat, paint } from '../../core/gfx.js';
import { Island, mergeParts, PALETTE } from '../../world/build.js';
import { makeLabelTexture } from '../../core/label.js';
import { buildHouseShell, houseHeight, houseRadius, floorOf, FLOOR_H, SLAB_T, WINDOW, PORT_H } from './homehouse.js';
import { ITEMS, ITEM_BY_ID, LINK_BY_ID, houseSpecs, homeRooms, pathPosts } from './catalog.js';
import { PathFX, makeFlame, makeLamp } from './pathfx.js';
import { ZenGarden, zenParts, ZEN, ZEN_ROCKS, ZEN_STONES, ZEN_STONE_R, ZEN_RAKE } from './zengarden.js';
import { linkGeom, linkParts, linkModels } from './links.js';
import { placeModel, drawItem, clampMul, SHOJI, shojiPair, PANEL_GAP, STONES } from './models.js';
import { wallSlots, yardR } from './editor.js';
import { buildTreehouse } from './treehouse.js';
import { HOLO_GEAR_SCALE, HOLO_TUBE, ensureHoloKit, holoCell, holoOut } from './holodeck.js';
import { GEAR_ITEMS, GEAR_SCALE, GEAR_LIFT, gearModel, TUBE_VERT, TUBE_FRAG } from '../dream/gear.js';

/* ---------------------------------------------------------------------------
   One sky site: its island, the house on it, the yard, the doors and the
   bubble.

   THE ISLAND IS NOT IN `world.islands`, AND THAT IS ON PURPOSE. That list is
   the adventure: props are scattered over it, quests count it, the minimap
   draws it, `worldSig` hashes what is on it, and a dozen checks pin how many
   there are. A home is none of those things, so it answers `heightAt`
   through `world.homeGround` (one extra loop, after the islands and decks)
   and is otherwise invisible to the rest of the game — which is what makes
   it possible to add four islands without moving a single existing number.

   ALL FOUR ISLANDS ARE ALWAYS IN THE SKY. An unowned one is bare grass with
   a FOR SALE board; owning one builds the house on it. Roshi's tour flies the
   camera to them, so they have to be there to be looked at — and a kitten
   who flies a dragon out to one can walk round it, which is fine: an empty
   island has nothing to protect.

   THE HOUSE FACES HOME. Its front door is on its local +z, and the island
   turns it so that +z points back down the bridge — the first thing you see
   arriving is the door, with your statue behind you at the other end.
--------------------------------------------------------------------------- */

/** Neutral colours, for an island nobody owns and the start of a preview. */
const NEUTRAL_ACCENT = 0xd9cfbd;
const NEUTRAL_ROOF = 0x56627a;

/** How high a wall thing's BOTTOM hangs above its floor. A window sits where
 *  a kitten's eyes are (she is 2.9 tall); a trophy shelf is up out of reach. */
export const WALL_Y = { window: 1.0, scroll: 0.5, picture: 1.2, trophy: 1.9 };

/** The outdoor things that stand in the way, as a radius off their centre.
 *  The rest (a pond, a court, a paddy) are walked on or over. */
const SOLID = {
  teahouse: 2.4, belltower: 1.8, well: 1.1, shrine: 2.2, maple: 0.5, cherry: 0.5, pine: 0.5, waterwheel: 1.2, lantern: 0.5, firebasket: 0.3, sake: 0.8, drum: 1.0,
  /* Measured off the loaded models (fitted to their catalogue size), not
     guessed: the basin is 1.52 across, the azalea's stems 0.9, the bucket
     0.92 by 0.72, and the banner stands on a weighted foot 1.72 across. */
  basin: 0.75, azalea: 0.6, bucket: 0.4, banner: 0.6,
};
/* THE LONG THIN THINGS ARE BOXES OF WALL, not circles. Richard, Oct 2026:
   "Bamboo fence has no collider built in the yard of players island. Let's
   ensure that all objects built on the players island have collider if they
   should have a collider." A circle round a fence is either a pinprick in
   the middle of it or a disc four wide that blocks the path beside it.
   [half-length along its own x, half-depth along z, height], all measured:
   the fence model is 4.40 x 0.66 x 3.52 and runs along x, the bench
   3.20 x 1.06 x 0.98. */
const SOLID_BOX = { fence: [2.2, 0.33, 3.52], bench: [1.6, 0.53, 0.98] };
/* Things that are solid in more than one place: the torii walk's six posts
   (models.js `drawItem`, which draws it, puts them at x ±0.9, z -2.4/0/2.4)
   and nothing between them, since walking UNDER the gates is the point. */
const SOLID_POSTS = { toriigarden: { r: 0.22, at: [[-0.9, -2.4], [0.9, -2.4], [-0.9, 0], [0.9, 0], [-0.9, 2.4], [0.9, 2.4]] } };
/* The yard's trees and bushes take the x-ray, weaker than a wall: Richard on
   the town's, "the shader effect should be smaller and weaker, so as not to
   make them disappear when player is near it". */
const XRAY_PLANT = { maple: 0.8, cherry: 0.8, pine: 0.8, azalea: 0.6 };

/**
 * Put a placed model's vertex-coloured meshes on an x-ray material at
 * strength `k`. A loaded model's geometry has no `xrayK` (only mergeParts
 * writes it) and a missing attribute reads as ZERO in the shader — "never
 * cut" — so the material swap alone would do nothing at all. Geometry is
 * shared between clones of one cached model, which is fine: every clone of a
 * yard tree wants the same answer. A mesh with a texture instead of colours
 * is left as it is.
 */
export function xrayModel(root, mat, k) {
  root?.traverse?.((o) => {
    const g = o.isMesh ? o.geometry : null;
    if (!g?.attributes?.color) return;
    if (!g.attributes.xrayK) g.setAttribute('xrayK', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(k), 1));
    o.material = mat;
  });
  return root;
}

/** How far out the bubble stands past the island's rim. */
const BUBBLE_PAD = 7;

export class HomeIsle {
  constructor(site, world) {
    this.site = site;
    this.world = world;
    this.island = new Island({
      x: site.x, z: site.z, baseY: site.y, radius: site.r, seed: site.seed,
      hill: 2.2, plateau: 0.84, biome: site.biome, kind: 'home',
    });
    this.x = site.x;
    this.z = site.z;
    this.radius = site.r;
    this.groundY = this.island.heightAt(site.x, site.z);
    /** Bearing of the front: toward the home island. */
    this.ry = Math.atan2(-site.x, -site.z);
    this.cos = Math.cos(this.ry);
    this.sin = Math.sin(this.ry);
    this.home = null;
    this.shell = null;
    this.group = new THREE.Group();
    this.houseGroup = new THREE.Group();
    this.itemGroup = new THREE.Group();
    this.group.add(this.houseGroup, this.itemGroup);
    /* EVERY PART OF THE HOUSE IS X-RAY NOW, THE ROOF INCLUDED. Richard: "When
       player is outside and around the house, the xray shader is not being
       enabled ... Let's make sure xray is happening to player when they are
       outside the house on the roof, so that if the roof blocks them, they
       are still visible." The walls always were; but from outside, behind
       the house, the thing in the way is the ROOF and its eaves, which were
       plain toon. The cut is narrower than the town's (1.6 against 2.1) and
       only bites what is a good step NEARER the camera than she is
       (`cutNear`), so the side walls of the room she is in are left alone. */
    const XR = { cutR: 1.6, cutSoft: 0.7, cutNear: 1.4 };
    this.accentMats = [0, 1, 2, 3].map(() => xrayVertexMat({ color: NEUTRAL_ACCENT, ...XR }));
    this.roofMat = xrayVertexMat({ color: NEUTRAL_ROOF, ...XR });
    this.soffitMat = xrayVertexMat(XR);
    this.wallMat = xrayVertexMat(XR);
    /* The treehouse's trunks, platforms and crowns, and the yard's trees and
       bushes — their own two, since the walls' carries the kendo clip. */
    this.treeMat = xrayVertexMat(XR);
    this.plantMat = xrayVertexMat(XR);
    this.xrayMats = [this.wallMat, this.roofMat, this.soffitMat, ...this.accentMats, this.treeMat, this.plantMat];
    /** Floor groups and the roof, for the per-pane cutaway. */
    this.floorMeshes = [];
    this.roofMeshes = [];
    /** World-space colliders the walls hook reads: rebuilt with the house. */
    this.walls = [];
    this.obstacles = [];
    /** What INTERACT means where: rebuilt with the house and the yard. */
    this.spots = [];
    /** The holodeck rooms' racks (`holodeck.js` reads them). */
    this.holoRooms = [];
    /** Outdoor things by place id ('o' + uid): world centre, ground, radius. */
    this.places = new Map();
    /** The torches, lamps and strips pathfx.js animates — rebuilt with the yard. */
    this.fxSites = [];
    /** Who has won how many arena battles — Housing hands this in, for the
     *  trophy shelf. Null draws an empty shelf. */
    this.cupsFor = null;
  }

  /* ------------------------------ building ----------------------------- */

  build(scene) {
    const geo = this.island.buildMesh(20, 48);
    this.islandMesh = new THREE.Mesh(geo, toonVertexMat());
    this.group.add(this.islandMesh);
    this.pathFx = new PathFX(this);
    this._buildSaleSign();
    this._buildBubble();
    scene.add(this.group);
  }

  _buildSaleSign() {
    const g = new THREE.Group();
    const post = new THREE.Mesh(mergeParts([
      (() => { const b = new THREE.BoxGeometry(0.3, 3.2, 0.3); paint(b, PALETTE.woodDark); b.translate(-1.6, 1.6, 0); return b; })(),
      (() => { const b = new THREE.BoxGeometry(0.3, 3.2, 0.3); paint(b, PALETTE.woodDark); b.translate(1.6, 1.6, 0); return b; })(),
      (() => { const b = new THREE.BoxGeometry(4, 1.6, 0.15); paint(b, PALETTE.paper); b.translate(0, 2.6, 0); return b; })(),
    ]), toonVertexMat());
    g.add(post);
    const { texture, aspect } = makeLabelTexture('FOR SALE', { size: 72, color: '#c0302a', stroke: '#fff6de', strokeWidth: 6 });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.3 * aspect, 1.3),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide }));
    plate.position.set(0, 2.6, 0.1);
    g.add(plate);
    const front = this.local(0, 16);
    g.position.set(front.x, this.island.heightAt(front.x, front.z) ?? this.groundY, front.z);
    g.rotation.y = this.ry;
    this.saleSign = g;
    this.group.add(g);
  }

  /**
   * The lock's bubble: cloud-glass, not the Dream Dojo's hologram.
   *
   * Richard: "like the Dream Dojo one but cloudy or glass". The simulator's
   * barrier is scanlines and a grid — it says COMPUTER — so this one says
   * WEATHER: a soft white fresnel rim, slow drifting cloud in the glass, and
   * a ripple where somebody bumps it. Visible only while the island is shut
   * to somebody in the party.
   */
  _buildBubble() {
    const R = this.radius + BUBBLE_PAD;
    const geo = new THREE.SphereGeometry(R, 48, 24);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uTint: { value: new THREE.Color(0xffffff) },
        uHit: { value: new THREE.Vector3(0, -9999, 0) },
        uHitT: { value: 9 },
        uAlpha: { value: 1 },
      },
      vertexShader: `
        varying vec3 vN; varying vec3 vW; varying vec3 vV;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          vN = normalize(mat3(modelMatrix) * normal);
          vV = normalize(cameraPosition - w.xyz);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `
        uniform float uTime; uniform vec3 uTint; uniform vec3 uHit; uniform float uHitT; uniform float uAlpha;
        varying vec3 vN; varying vec3 vW; varying vec3 vV;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main() {
          float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
          vec2 q = vW.xz * 0.045 + vec2(uTime * 0.03, vW.y * 0.06);
          float cl = n(q) * 0.6 + n(q * 2.3 + 7.0) * 0.4;
          float ripple = 0.0;
          float d = distance(vW, uHit);
          if (uHitT < 1.5) ripple = smoothstep(1.2, 0.0, abs(d - uHitT * 14.0)) * (1.5 - uHitT);
          vec3 c = mix(vec3(0.92, 0.95, 1.0), uTint, 0.25);
          float a = (0.06 + fr * 0.55 + smoothstep(0.55, 0.85, cl) * 0.22 + ripple * 0.6) * uAlpha;
          gl_FragColor = vec4(c + ripple * 0.3, a);
        }`,
    });
    this.bubble = new THREE.Mesh(geo, mat);
    this.bubble.position.set(this.x, this.groundY + 4, this.z);
    this.bubble.scale.set(1, 0.62, 1);
    this.bubble.visible = false;
    this.bubble.renderOrder = 5;
    this.group.add(this.bubble);
  }

  /** House-local (lx, lz) to world. */
  local(lx, lz) {
    return { x: this.x + lx * this.cos + lz * this.sin, z: this.z - lx * this.sin + lz * this.cos };
  }

  /** World (x, z) to house-local. */
  toLocal(x, z) {
    const dx = x - this.x;
    const dz = z - this.z;
    return { x: dx * this.cos - dz * this.sin, z: dx * this.sin + dz * this.cos };
  }

  /**
   * Put a house up (or take it down, `home` null), with its owners' colours.
   * Called on purchase, on load, on a sale, and with a PREVIEW row while
   * Roshi's tour is showing her what it would look like.
   */
  setHome(home, colours = null) {
    this.home = home;
    this._colours = colours;
    for (const hs of this.houses ?? []) this.houseGroup.remove(hs.group);
    this.houses = [];
    this.saleSign.visible = !home;
    this.setColours(colours, 1);
    this.rebuildItems();
  }

  /**
   * EVERY HOUSE ON THE ISLAND, each in its own frame (Oct 2026: "buy and
   * place more houses on the island ... move around all the houses on their
   * property (including all the furniture inside if they do), including the
   * main house"). `this.local` is the ISLAND's frame and the yard is in it; a
   * house is `{ hk, x, z, rot }` in that frame and its own `local` maps its
   * rooms out of it, so moving a house moves what is in it and nothing else.
   * A house is rebuilt only when what it is made of changed — where it stands,
   * or a hole in its walls (a window, a bridge door).
   */
  _syncHouses() {
    const H = this.home;
    const next = [];
    for (const s of H ? houseSpecs(H) : []) {
      const op = this._openings(H, s.hk);
      const sig = JSON.stringify([s.house, s.x, s.z, s.rot, op, s.hk === 'main' ? H.owners : 0]);
      const hs = (this.houses ?? []).find((h) => h.hk === s.hk);
      if (hs && hs.sig === sig) { next.push(hs); continue; }
      if (hs) this.houseGroup.remove(hs.group);
      next.push(this._makeHouse(s, op, sig));
    }
    for (const h of this.houses ?? []) if (!next.includes(h)) this.houseGroup.remove(h.group);
    this.houses = next;
    this.main = next[0] ?? null;
    this.shell = this.main?.shell ?? null;
    this.floorMeshes = next.flatMap((h) => h.floorMeshes);
    this.roofMeshes = next.flatMap((h) => h.roofMeshes);
    this.houseWalls = next.flatMap((h) => h.walls);
    this.houseDecks = next.flatMap((h) => h.decks);
    this.doorWorld = this.main ? this.main.local(0, this.shell.door.z) : null;
    this.doorLocal = this.shell?.door ?? null;
  }

  /** The holes house `hk` needs: its windows, and a door for each bridge. */
  _openings(H, hk) {
    const out = [];
    for (const room of homeRooms(H)) {
      if (room.hk !== hk) continue;
      const R = H.rooms?.[room.id];
      if (!R?.wall?.some((q) => q.id === 'window')) continue;
      const slots = wallSlots(room.house, room);
      for (const q of R.wall) {
        if (q.id !== 'window') continue;
        const S = slots.find((x) => x.side === q.side && x.k === q.k);
        if (S) out.push({ floor: room.floor, side: S.side, at: S.side % 2 ? S.z : S.x, ...WINDOW });
      }
    }
    for (const L of H.links ?? []) {
      for (const [e, end] of [[L.a, 'a'], [L.b, 'b']]) {
        if (e.hk !== hk) continue;
        const w = (LINK_BY_ID[L.style] ?? LINK_BY_ID.plank).w + 0.4;
        out.push({ floor: e.floor, side: e.side, at: e.at, w, sill: 0, h: PORT_H, key: `L${L.uid}${end}` });
      }
    }
    return out;
  }

  /** A house's frame: where it stands in the world, and its ground. */
  _frame(hs) {
    const w = this.local(hs.x, hs.z);
    hs.wx = w.x;
    hs.wz = w.z;
    hs.ry = this.ry + hs.rot;
    hs.cos = Math.cos(hs.ry);
    hs.sin = Math.sin(hs.ry);
    hs.gy = this.island.heightAt(w.x, w.z) ?? this.groundY;
    hs.local = (lx, lz) => ({ x: hs.wx + lx * hs.cos + lz * hs.sin, z: hs.wz - lx * hs.sin + lz * hs.cos });
    hs.toLocal = (x, z) => {
      const dx = x - hs.wx, dz = z - hs.wz;
      return { x: dx * hs.cos - dz * hs.sin, z: dx * hs.sin + dz * hs.cos };
    };
    return hs;
  }

  _makeHouse(s, openings, sig) {
    const S = buildHouseShell(s.house, openings);
    const hs = this._frame({ hk: s.hk, house: s.house, x: s.x, z: s.z, rot: s.rot, sig, shell: S, floorMeshes: [], roofMeshes: [], doors: [] });
    {
      const hg = new THREE.Group();
      hg.position.set(hs.wx, hs.gy, hs.wz);
      hg.rotation.y = hs.ry;
      hs.group = hg;
      for (const parts of S.floors) {
        const m = new THREE.Mesh(mergeParts(parts), this.wallMat);
        hg.add(m);
        hs.floorMeshes.push(m);
      }
      if (S.roof.length) {
        const m = new THREE.Mesh(mergeParts(S.roof), this.soffitMat);
        hg.add(m);
        hs.roofMeshes.push(m);
      }
      if (S.tint.length) {
        /* The roof is the last floor's tint and the skirts belong to the
           floors they hang off — but one mesh is one draw call, and the
           cutaway only needs to know "is anyone inside below the top", so
           the whole tinted set goes with the roof. */
        const m = new THREE.Mesh(mergeParts(S.tint), this.roofMat);
        hg.add(m);
        hs.roofMeshes.push(m);
      }
      S.accent.forEach((parts, k) => {
        if (!parts.length) return;
        hg.add(new THREE.Mesh(mergeParts(parts), this.accentMats[k]));
      });
      /* The ridge, the eave bands and the castle's fins go with the roof —
         by WHERE they are, not by which colour slot they are in. Keyed on the
         slot was how the ridge cap (slot 0, with the noren) stayed floating
         over the room with the roof gone. */
      (S.ridge ?? []).forEach((parts, k) => {
        if (!parts.length) return;
        const m = new THREE.Mesh(mergeParts(parts), this.accentMats[k]);
        hg.add(m);
        hs.roofMeshes.push(m);
      });
      /* THE NAME BOARD IS THE FIRST HOUSE'S ONLY — and so is the camera that
         comes round to read it (`Housing.doorShotFor` asks `this.main`).
         Richard: "Only this original first house with the name plate will
         have this camera zooming function". */
      if (S.sign && s.hk === 'main') hg.add(this._nameBoard(S.sign, this.home, this._colours));
      this.houseGroup.add(hg);
    }
    // colliders and decks into the world frame
    hs.walls = S.walls.map((w) => {
      const a = hs.local(w.ax, w.az);
      const b = hs.local(w.bx, w.bz);
      return { ...w, ax: a.x, az: a.z, bx: b.x, bz: b.z, y0: w.y0 + hs.gy, y1: w.y1 + hs.gy, hk: s.hk };
    });
    // a deck reads (x, z) in its own frame — the house's, turned on the island
    hs.decks = S.decks.map((d) => ({ ...d, frame: { x: s.x, z: s.z, a: s.rot }, dy: hs.gy - this.groundY, hk: s.hk }));
    // the doors: the front one, and one in every bridge's doorway
    this._door(hs, `${s.hk}:front`, 0, 0, 0, S.door.w, true);
    for (const o of openings) if (o.key) this._door(hs, o.key, o.floor, o.side, o.at, o.w - 0.4, false);
    return hs;
  }

  /**
   * A SLIDING DOOR in a doorway: two panels that part into the wall. Richard:
   * "The front doors can be closed by default, but if so, should open up if a
   * player comes close to it. Player can open/close the door with interact, if
   * open, it always stays open, if closed, then stays closed when no one is
   * near the door." So a door is `pinned` open (saved, `H.doors[key]`) or not,
   * and a door that is not opens for whoever walks up and shuts behind her.
   * NO COLLIDER: a closed door opens before she reaches it, and a LOCKED house
   * is still the lock's job (`Housing.wall`), as it always was.
   */
  _door(hs, key, floor, side, at, w, front) {
    const F = floorOf(hs.house, floor);
    if (!F) return;
    const [lx, lz] = [[at, F.hd], [F.hw, at], [at, -F.hd], [-F.hw, at]][side];
    const g = new THREE.Group();
    g.position.set(lx, F.y, lz);
    g.rotation.y = side % 2 ? Math.PI / 2 : 0;
    const pw = w / 2 + 0.06;
    const geo = () => {
      const parts = [];
      const b = (bw, bh, bd, c, x, y) => { const q = new THREE.BoxGeometry(bw, bh, bd); paint(q, c); q.translate(x, y, 0); parts.push(q); };
      b(pw, PORT_H - 0.06, 0.05, PALETTE.paper, 0, (PORT_H - 0.06) / 2);
      for (const x of [-pw / 2 + 0.05, pw / 2 - 0.05]) b(0.1, PORT_H - 0.06, 0.09, PALETTE.woodDark, x, (PORT_H - 0.06) / 2);
      for (const y of [0.05, 0.9, 1.7, 2.5, PORT_H - 0.11]) b(pw, 0.08, 0.09, PALETTE.woodDark, 0, y);
      b(0.05, PORT_H - 0.9, 0.08, PALETTE.woodDark, 0, (PORT_H + 0.8) / 2);
      return mergeParts(parts);
    };
    // Tripo's shoji leaf (tools/prop-bake.mjs) stretched to the hole; the drawn panel until it loads, or for good
    /* ONE PANEL BEHIND THE OTHER, the way shoji run in two grooves. They
       overlap by 0.12 where they meet, and at one depth that strip
       flickered between the two (Richard: "avoid z-fighting at all costs").
       PANEL_GAP apart, both inside the wall's thickness. */
    const panels = [-1, 1].map((sgn) => {
      const m = placeModel(SHOJI, new THREE.Mesh(geo(), this.wallMat), { box: { x: pw, y: PORT_H - 0.06, z: 0.08 }, ry: Math.PI / 2 });
      m.position.x = sgn * w / 4;
      m.position.z = sgn * PANEL_GAP;
      g.add(m);
      return m;
    });
    (hs.floorMeshes[floor] ?? hs.group).add(g);
    const c = hs.local(lx, lz);
    hs.doors.push({ key, hs, floor, w, panels, k: 0, front, wx: c.x, wz: c.z, y: hs.gy + F.y, side, at });
  }

  /**
   * THE HYŌSATSU — the name board over the door. Richard: "Does the placard
   * say or do anything? We should have the players name and colors or
   * something like that there, so people know whose house it is." Her name in
   * the house's wood, and a stripe of each owner's colour under it, so a
   * castle shared by three reads as three.
   */
  _nameBoard(sign, home, colours) {
    this._boardTex?.dispose();
    const g = new THREE.Group();
    g.position.set(sign.x, sign.y, sign.z);
    const owners = home.owners ?? [];
    const cols = owners.map((_, k) => colours?.[k % (colours?.length || 1)] ?? NEUTRAL_ACCENT);
    const parts = [];
    const board = new THREE.BoxGeometry(sign.w, sign.h, 0.12);
    paint(board, 0x3a2418);
    parts.push(board);
    const rim = new THREE.BoxGeometry(sign.w + 0.16, sign.h + 0.16, 0.06);
    paint(rim, PALETTE.wood);
    rim.translate(0, 0, -0.045);
    parts.push(rim);
    const sw = (sign.w - 0.3) / Math.max(1, cols.length);
    cols.forEach((c, k) => {
      const s = new THREE.BoxGeometry(sw - 0.06, 0.14, 0.05);
      paint(s, c);
      s.translate(-sign.w / 2 + 0.15 + sw * (k + 0.5), -sign.h / 2 + 0.13, 0.075);
      parts.push(s);
    });
    g.add(new THREE.Mesh(mergeParts(parts), toonVertexMat()));
    const text = owners.length ? `${owners.join(' & ').toUpperCase()}'S` : 'HOME';
    const { texture, aspect } = makeLabelTexture(text, { size: 72, color: '#fff3d6', stroke: '#1d1216', strokeWidth: 8 });
    this._boardTex = texture;
    const h = Math.min(sign.h * 0.62, (sign.w * 0.9) / aspect);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(h * aspect, h),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
    plate.position.set(0, 0.06, 0.08);
    g.add(plate);
    return g;
  }

  /** Tint the house toward these owner colours by k (0 neutral, 1 hers). */
  setColours(colours, k = 1) {
    const list = colours?.length ? colours : null;
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Color(NEUTRAL_ACCENT);
      if (list) c.lerp(new THREE.Color(list[i % list.length]), k);
      this.accentMats[i].color.copy(c);
    }
    const r = new THREE.Color(NEUTRAL_ROOF);
    if (list) r.lerp(new THREE.Color(list[0]).lerp(new THREE.Color(NEUTRAL_ROOF), 0.35), k);
    this.roofMat.color.copy(r);
    if (this.bubble) this.bubble.material.uniforms.uTint.value.set(list ? list[0] : 0xffffff);
  }

  /** Lay the yard, the walls and the rooms out again from `this.home`. */
  rebuildItems() {
    for (const c of this.itemGroup.children) c.userData.disposed = true;
    this.itemGroup.clear();
    this.obstacles = [];
    this.spots = [];
    this.holoRooms = [];
    this.places = new Map();
    this.fxSites = [];
    /* The house's colliders and decks, then whatever the yard adds (the
       treehouse is a level of its own). Two lists joined, so moving a tree
       never has to rebuild the house. */
    this.windows = [];
    this._syncHouses();
    this.walls = [...(this.houseWalls ?? [])];
    this.decks = [...(this.houseDecks ?? [])];
    this.itemMeshes = new Map();
    const H = this.home;
    if (!H) return;
    for (const hs of this.houses) for (const d of hs.doors) d.pinned = !!H.doors?.[d.key];
    this._buildLinks(H);
    // ---- outdoors
    for (const q of H.outdoor ?? []) {
      const it = ITEM_BY_ID[q.id];
      if (!it || it.later) continue;
      const g = this._yardItem(it, q);
      this.itemGroup.add(g);
      this.itemMeshes.set('o' + q.uid, g);
    }
    // ---- the rooms, and their walls, in whichever house each one is
    for (const room of homeRooms(H)) {
      const hs = this.houseOf(room);
      if (!hs) continue;
      const R = H.rooms?.[room.id];
      // an old save's holodeck kept no rows for its kit: give it one, where it always stood
      if (R?.type === 'holodeck') ensureHoloKit(room, R);
      if (R?.type === 'kendo' || R?.type === 'holodeck') {
        const dz = this._roomDressing(room, R.type, R);
        dz.userData.floor = room.floor;
        dz.userData.hk = room.hk;
        this.itemGroup.add(dz);
      }
      const y = hs.gy + (hs.shell.floorY[room.floor] ?? 0);
      for (const [k, placed] of (R?.items ?? []).entries()) {
        const it = ITEM_BY_ID[placed.id];
        // the holodeck's kit is drawn, and its meshes registered, by `_roomDressing`
        if (!it || it.holo) continue;
        const L = this.cellCentre(room, placed.gx, placed.gz, it, placed.rot);
        const w = hs.local(L.x, L.z);
        const g = placeModel(it.model, drawItem(it.id, 2), it.size, roomLook(it, placed));
        // measured while it is still at the origin, unturned (`_furnWalls`)
        const box = new THREE.Box3().setFromObject(g);
        g.position.set(w.x, y, w.z);
        g.rotation.y = hs.ry + (placed.rot ?? 0) * (Math.PI / 2);
        this._furnWalls(g, box, placed, y, room.hk ?? 'main');
        g.userData.floor = room.floor;
        g.userData.hk = room.hk;
        this.itemGroup.add(g);
        this.itemMeshes.set(`r:${room.id}:${k}`, g);
        if (it.act) this.spots.push({ x: w.x, z: w.z, y, r: 2.6, act: it.act, item: it.id, room: room.id, k, ry: g.rotation.y });
      }
      const slots = (R?.wall?.length) ? wallSlots(room.house, room) : [];
      for (const [k, q] of (R?.wall ?? []).entries()) {
        const it = ITEM_BY_ID[q.id];
        const S = slots.find((s) => s.side === q.side && s.k === q.k);
        if (!it || !S) continue;
        const w = hs.local(S.x, S.z);
        let g;
        if (q.id === 'window') {
          g = this._windowPanels(q);
          g.position.set(w.x, y + WINDOW.sill, w.z);
        } else {
          const cups = q.id === 'trophy' ? (this.cupsFor?.(H) ?? 0) : 0;
          g = placeModel(null, drawItem(it.id, 2, { cups }), it.size);
          g.position.set(w.x, y + (WALL_Y[q.id] ?? 1), w.z);
        }
        g.rotation.y = hs.ry + S.ry;
        g.userData.floor = room.floor;
        g.userData.hk = room.hk;
        this.itemGroup.add(g);
        this.itemMeshes.set(`w:${room.id}:${k}`, g);
        if (it.act) {
          // the spot is a step into the room from the wall, where she stands
          const f = hs.local(S.x - Math.sin(S.ry) * -1.4, S.z - Math.cos(S.ry) * -1.4);
          const act = q.id === 'window' ? 'window' : it.act;
          // `face`: the world turn of the wall thing, whose own +z points into the room
          this.spots.push({ x: f.x, z: f.z, y, r: 1.8, act, item: it.id, room: room.id, side: q.side, slot: S, wk: k, face: hs.ry + S.ry, wx: w.x, wz: w.z });
        }
      }
    }
    /* THE DOORS' SPOTS. Outside a front door, INTERACT opens or shuts it
       (and a visitor to a locked house knocks); a step INSIDE it is "MY HOME",
       the card — every house has one, and they all open the island's card.
       A bridge's door is opened and shut from inside its room. */
    for (const hs of this.houses) {
      const S = hs.shell;
      const y = hs.gy + S.base;
      const o = hs.local(0, S.door.z + 1.4);
      this.spots.push({ x: o.x, z: o.z, y, r: 2.0, act: 'frontdoor', door: hs.doors.find((d) => d.front), hk: hs.hk });
      const i = hs.local(0, S.door.z - 1.6);
      this.spots.push({ x: i.x, z: i.z, y, r: 1.7, act: 'door', hk: hs.hk });
      for (const d of hs.doors) {
        if (d.front) continue;
        const F = floorOf(hs.house, d.floor);
        const [lx, lz] = [[d.at, F.hd - 1.3], [F.hw - 1.3, d.at], [d.at, -F.hd + 1.3], [-F.hw + 1.3, d.at]][d.side];
        const p = hs.local(lx, lz);
        this.spots.push({ x: p.x, z: p.z, y: hs.gy + F.y, r: 1.6, act: 'portdoor', door: d, hk: hs.hk });
      }
    }
  }

  /**
   * A WINDOW IS A HOLE WITH SHOJI IN IT. Richard: windows "should be the same
   * as the shoji window furniture, except that there needs to be a hole in the
   * wall where the window is, and when opened can show the outside through
   * the window. By default windows are closed". The hole is the shell's
   * (`_openings`); these are the two paper panels in it, which slide apart
   * into the wall when it is open (`q.open`, saved with the room).
   */
  _windowPanels(q) {
    const g = new THREE.Group();
    /* IN THE WALL, NOT IN FRONT OF IT, and one panel behind the other. The
       window's slot is the wall's inner line less 0.22 (`wallSlots`), so the
       wall's middle is WINDOW_IN behind this group; the panels sit there, in
       the hole, and slide into the plaster either side when it opens. They
       were 0.02 into the room, both at one depth — the overlap flickered,
       and an open window was two paper panels standing in the room. */
    const P = shojiPair(WINDOW.w, WINDOW.h, this.wallMat);
    P.group.position.z = -WINDOW_IN;
    g.add(P.group);
    const panels = P.panels;
    this.windows.push({ q, panels, k: q.open ? 1 : 0 });
    return g;
  }

  /**
   * THE BRIDGES BETWEEN HOUSES (links.js decides; this draws and makes them
   * walkable). The deck is one more deck in the island's list, read in the
   * bridge's own frame; the rails are walls; the supports are drawn and
   * nothing else, so a lantern can stand under one.
   */
  _buildLinks(H) {
    this.linkMeshes = new Map();
    const gyAt = (x, z) => {
      const w = this.local(x, z);
      return (this.island.heightAt(w.x, w.z) ?? this.groundY) - this.groundY;
    };
    for (const L of H.links ?? []) {
      const G = linkGeom(H, L, gyAt);
      if (!G) continue;
      const ground = (d) => gyAt(G.A.x + G.ux * d, G.A.z + G.uz * d) - G.A.y;
      G.models = true;
      const P = linkParts(G, ground);
      const g = new THREE.Group();
      const w0 = this.local(G.A.x, G.A.z);
      g.position.set(w0.x, this.groundY + G.A.y, w0.z);
      g.rotation.y = this.ry + G.a;
      if (P.solid.length) g.add(new THREE.Mesh(mergeParts(P.solid), toonVertexMat()));
      if (P.glow.length) g.add(new THREE.Mesh(mergeParts(P.glow), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
      for (const m of linkModels(G)) {
        const mg = placeModel(m.id, m.stand ? planterStandIn() : null, { h: m.h });
        mg.position.set(m.x, m.y, m.z);
        mg.rotation.y = m.ry;
        g.add(mg);
      }
      g.userData.link = L.uid;
      this.itemGroup.add(g);
      this.linkMeshes.set(L.uid, g);
      const hw = G.w / 2;
      this.decks.push({
        x0: -hw, x1: hw, z0: -0.4, z1: G.len + 0.4, y: Math.max(G.A.y, G.B.y), step: 0.6, link: L.uid,
        frame: { x: G.A.x, z: G.A.z, a: G.a },
        yAt: (x, z) => G.A.y + G.rise * Math.min(1, Math.max(0, z / G.len)),
      });
      const lo = Math.min(G.A.y, G.B.y), hi = Math.max(G.A.y, G.B.y);
      for (const s of [-1, 1]) {
        const a = this.local(G.A.x + G.uz * s * (hw - 0.05), G.A.z - G.ux * s * (hw - 0.05));
        const b = this.local(G.B.x + G.uz * s * (hw - 0.05), G.B.z - G.ux * s * (hw - 0.05));
        this.walls.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, y0: this.groundY + lo + 0.2, y1: this.groundY + hi + 1.3, rail: true, link: L.uid });
      }
    }
  }

  /** The house a room (or a key) is in, or null. */
  houseOf(roomOrKey) {
    const hk = typeof roomOrKey === 'string' ? roomOrKey : roomOrKey?.hk ?? 'main';
    return (this.houses ?? []).find((h) => h.hk === hk) ?? null;
  }

  /** World height of a room's floor. */
  floorY(room) {
    const hs = this.houseOf(room);
    return hs ? hs.gy + (hs.shell.floorY[room.floor] ?? 0) : this.groundY;
  }

  /** A room's house-local (lx, lz) to world. */
  roomLocal(room, lx, lz) {
    return (this.houseOf(room) ?? this.main)?.local(lx, lz) ?? this.local(lx, lz);
  }

  /** The first outdoor place holding item `id`, or null — the koi and the farm ask. */
  placeOf(id) {
    for (const P of this.places.values()) if (P.item === id) return P;
    return null;
  }

  /** An outdoor row's own (fx, fz) to house-local [x, z]: the turn the
   *  group is drawn with (`rotation.y` = its rot) — the treehouse's too. */
  _itemToHouse(q, fx, fz) {
    const a = q.rot ?? 0;
    return [q.x + fx * Math.cos(a) + fz * Math.sin(a), q.z - fx * Math.sin(a) + fz * Math.cos(a)];
  }

  /** Four walls round a rectangle in an outdoor row's own frame, world heights. */
  _boxWalls(q, hx, hz, y0, y1) {
    const c = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([fx, fz]) => this.local(...this._itemToHouse(q, fx, fz)));
    for (let k = 0; k < 4; k++) {
      const a = c[k], b = c[(k + 1) % 4];
      this.walls.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, y0, y1, item: q.uid });
    }
  }

  /**
   * FURNITURE IS SOLID — NEARLY TO ITS EDGE. Richard, Oct 2026: "Players
   * should not be able to walk through furniture like the table, futon,
   * kitchen ... but can get close to it (collision at half the radius of the
   * player) ... Players should always be able to walk around the edges of
   * the room, and through gaps in between objects. The collider should scale
   * with the object, but scaling above 100% should only count half the extra
   * size: an object at 150% gets a 125% collider, at 50% a 50% one."
   *
   * The rectangle is the thing's MEASURED box (`box`, taken at the origin
   * before it was turned), never its grid cells: a cell is 2 units and most
   * furniture fills less of it, so cells would wall off the gaps she is meant
   * to walk through. Shrunk by FURN_INSET, so her middle stops FURN_REACH
   * from the edge — half her radius — instead of a whole radius plus the
   * wall pad. A holodeck's tube is stepped INTO and has none.
   */
  _furnWalls(g, box, placed, y, hk) {
    const it = ITEM_BY_ID[placed.id];
    if (!it || it.holo || box.isEmpty()) return;
    const s = placed.look?.s ?? 1;
    const k = furnScale(s) / s;   // the box already has `s` in it
    const hx = ((box.max.x - box.min.x) / 2) * k - FURN_INSET;
    const hz = ((box.max.z - box.min.z) / 2) * k - FURN_INSET;
    if (hx < 0.05 || hz < 0.05) return;   // too slight to stand in her way
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    const c = Math.cos(g.rotation.y), sn = Math.sin(g.rotation.y);
    const at = (lx, lz) => ({ x: g.position.x + lx * c + lz * sn, z: g.position.z - lx * sn + lz * c });
    const P = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([fx, fz]) => at(cx + fx, cz + fz));
    for (let q = 0; q < 4; q++) {
      const a = P[q], b = P[(q + 1) % 4];
      this.walls.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, y0: y, y1: y + Math.max(1, box.max.y), furn: placed.id, hk });
    }
  }

  /** Centre of a grid placement in house-local units. 1 cell = 2 units. */
  cellCentre(room, gx, gz, it, rot = 0) {
    const [cw, cd] = (rot % 2) ? [it.cells?.[1] ?? 1, it.cells?.[0] ?? 1] : [it.cells?.[0] ?? 1, it.cells?.[1] ?? 1];
    return {
      x: room.cx - room.w / 2 + (gx + cw / 2) * 2,
      z: room.cz - room.d / 2 + (gz + cd / 2) * 2,
    };
  }

  /**
   * One outdoor thing, at its row's (x, z, rot) in the house's frame. The
   * place it records (`this.places`) is what the koi, the farm and the
   * build mode find it by — by uid, so moving a pond keeps its fish.
   */
  _yardItem(it, q) {
    const w = this.local(q.x, q.z);
    const gy = this.island.heightAt(w.x, w.z) ?? this.groundY;
    const r = yardR(it);
    const P = { id: 'o' + q.uid, uid: q.uid, item: it.id, x: w.x, y: gy, z: w.z, r, a: q.rot ?? 0 };
    this.places.set(P.id, P);
    const g = new THREE.Group();
    g.position.set(w.x, gy, w.z);
    g.rotation.y = this.ry + (q.rot ?? 0);
    const add = (o) => { g.add(o); return o; };
    const mat = toonVertexMat();
    const flat = (parts) => add(new THREE.Mesh(mergeParts(parts), mat));
    const disc = (rr, h, c, y = 0, seg = 32) => {
      const d = new THREE.CylinderGeometry(rr, rr, h, seg);
      paint(d, c);
      d.translate(0, y + h / 2, 0);
      return d;
    };
    const spot = (act, rr = r) => this.spots.push({ x: w.x, z: w.z, y: gy, r: rr, act, item: it.id, place: P.id });
    switch (it.path ? 'path' : it.id) {
      case 'path': {
        /* Two paths may cross, and two of one kind have their tops at one
           height: each piece sits its own few thousandths up (by uid), so
           where they cross one is simply on top. */
        const lift = 0.004 + ((q.uid ?? 0) % 6) * 0.006;
        g.position.y += lift;
        const P = pathParts(it);
        flat(P.solid);
        if (P.glow.length) add(new THREE.Mesh(mergeParts(P.glow), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
        P.torches.forEach(([x, y, z], k) => this.fxSites.push(makeFlame(g, x, y, z, (q.uid ?? 0) * 4 + k)));
        for (const geo of P.lamps) this.fxSites.push(makeLamp(g, geo));
        const frame = { x: q.x, z: q.z, a: q.rot ?? 0 };
        for (const d of P.decks) this.decks.push({ ...d, y: gy - this.groundY + lift + d.y, step: 0.3, frame, path: it.id });
        const posts = pathPosts(it);
        for (const [px, pz] of posts?.at ?? []) {
          const o = this.local(...this._itemToHouse(q, px, pz));
          this.obstacles.push({ x: o.x, z: o.z, r: posts.r });
        }
        // the two that answer her feet (pathfx.js): where the strip is, in the world
        if (it.id === 'path_petal' || it.id === 'path_carpet') {
          this.fxSites.push({ kind: it.id === 'path_petal' ? 'petal' : 'carpet', x: w.x, z: w.z, a: this.ry + (q.rot ?? 0), hw: it.pw / 2, hl: it.len / 2, y: gy + lift + P.decks[0].y });
        }
        break;
      }
      case 'zengarden': {
        add(new THREE.Mesh(zenParts(), mat));
        const frame = { x: q.x, z: q.z, a: q.rot ?? 0 };
        const base = gy - this.groundY;
        /* The sand is kept by uid across a rebuild (zengarden.js), but never
           for the build ghost, which is uid -1 and must not walk on hers. */
        this.zenGrids ??= new Map();
        const Z = new ZenGarden(q.uid, { x: w.x, z: w.z, a: this.ry + (q.rot ?? 0), y: gy + ZEN.sandY }, q.uid >= 0 ? this.zenGrids.get(q.uid) : null);
        if (q.uid >= 0) this.zenGrids.set(q.uid, Z.grid);
        add(Z.mesh);
        this.fxSites.push(Z);
        g.userData.zen = Z;
        const k = ZEN.kerb;
        this.decks.push({ x0: -ZEN.w / 2 - k, x1: ZEN.w / 2 + k, z0: -ZEN.d / 2 - k, z1: ZEN.d / 2 + k, y: base + ZEN.sandY, step: 0.3, frame });
        ZEN_STONES.forEach(([x, z], i) => {
          const h = ZEN_STONE_R * 0.75;
          this.decks.push({ x0: x - h, x1: x + h, z0: z - h, z1: z + h, y: base + ZEN.stoneY + i * 0.004, step: 0.3, frame, stone: true });
        });
        for (const [x, z, r] of ZEN_ROCKS) {
          const o = this.local(...this._itemToHouse(q, x, z));
          this.obstacles.push({ x: o.x, z: o.z, r: r * 0.9 });
        }
        const rk = this.local(...this._itemToHouse(q, ZEN_RAKE.x, ZEN_RAKE.z));
        this.spots.push({ x: rk.x, z: rk.z, y: gy, r: 1.8, act: 'rake', item: it.id, place: P.id, zen: Z });
        break;
      }
      case 'tiki': {
        const parts = [];
        const [x, y, z] = torchParts(parts, 0, 0);
        flat(parts);
        this.fxSites.push(makeFlame(g, x, y, z, q.uid ?? 0));
        this.obstacles.push({ x: w.x, z: w.z, r: 0.3 });
        break;
      }
      case 'pathlamp': {
        const parts = [];
        const paper = lampParts(parts, 0, 0);
        flat(parts);
        this.fxSites.push(makeLamp(g, paper));
        this.obstacles.push({ x: w.x, z: w.z, r: 0.35 });
        break;
      }
      case 'koipond': {
        /* "Pond is way too small, can make it bigger" — r 10, against 7; and
           12 once it was fished in the world ("We can also make the pond bigger").
           The rim is stones, so it reads as a pond from above in build mode. */
        flat([disc(r - 0.6, 0.25, 0x9a948a), disc(r - 1.3, 0.28, 0x2f6f9a, 0.02)]);
        const rim = [];
        for (let k = 0; k < 28; k++) {
          const a = (k / 28) * Math.PI * 2;
          const s = new THREE.DodecahedronGeometry(0.55 + (k % 3) * 0.12, 0);
          paint(s, k % 2 ? 0x8a857c : 0x9a948a);
          s.translate(Math.cos(a) * (r - 0.8), 0.3, Math.sin(a) * (r - 0.8));
          rim.push(s);
        }
        flat(rim);
        const pads = [];
        for (let k = 0; k < 8; k++) pads.push(disc(0.7, 0.06, 0x4a8a3a, 0.31, 8).translate(Math.cos(k * 2.1) * (r - 3), 0, Math.sin(k * 2.1) * (r - 3)));
        flat(pads);
        g.userData.pond = { r: r - 1.3 };
        spot('koi', r + 1);
        break;
      }
      case 'onsen': {
        flat([disc(r - 0.5, 0.6, 0x7d7870), disc(r - 1.2, 0.62, 0x8fd0d8, 0.02)]);
        const rocks = [];
        for (let k = 0; k < 14; k++) {
          const s = new THREE.DodecahedronGeometry(0.8 + (k % 3) * 0.2, 0);
          paint(s, 0x6a655e);
          s.translate(Math.cos(k * 0.45) * (r - 0.4), 0.5, Math.sin(k * 0.45) * (r - 0.4));
          rocks.push(s);
        }
        flat(rocks);
        spot('soak');
        break;
      }
      case 'volleyball': {
        const sand = new THREE.BoxGeometry(r * 1.6, 0.12, r * 1.0);
        paint(sand, 0xead7a0);
        sand.translate(0, 0.06, 0);
        const net = new THREE.BoxGeometry(0.08, 1.4, r);
        paint(net, 0xffffff);
        net.translate(0, 2.6, 0);
        const p1 = new THREE.BoxGeometry(0.25, 3.4, 0.25); paint(p1, 0x444444); p1.translate(0, 1.7, r / 2);
        const p2 = new THREE.BoxGeometry(0.25, 3.4, 0.25); paint(p2, 0x444444); p2.translate(0, 1.7, -r / 2);
        flat([sand, net, p1, p2]);
        spot('volley');
        break;
      }
      case 'bamboofarm': {
        const soil = new THREE.CylinderGeometry(r - 0.6, r - 0.6, 0.15, 24);
        paint(soil, 0x6a4a2a);
        soil.translate(0, 0.08, 0);
        flat([soil]);
        g.userData.farm = { r: r - 1 };
        spot('harvest');
        break;
      }
      case 'pen': {
        const posts = [];
        const n = Math.round(r * 2.2);
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          const b = new THREE.BoxGeometry(0.25, 1.4, 0.25);
          paint(b, PALETTE.wood);
          b.translate(Math.cos(a) * (r - 0.6), 0.7, Math.sin(a) * (r - 0.6));
          posts.push(b);
        }
        const rail = new THREE.TorusGeometry(r - 0.6, 0.09, 4, 48);
        paint(rail, PALETTE.woodDark);
        rail.rotateX(Math.PI / 2);
        rail.translate(0, 1.15, 0);
        const trough = new THREE.BoxGeometry(2.4, 0.6, 0.9);
        paint(trough, PALETTE.woodDark);
        trough.translate(0, 0.3, r - 2.2);
        flat([...posts, rail, trough]);
        g.userData.pen = { r: r - 1.5 };
        spot('animals');
        break;
      }
      case 'treehouse': {
        /* A LEVEL, not a prop (treehouse.js). Its geometry is in its own frame
           and goes in this group; its decks, walls and trunks come back in
           the house's frame and join the island's. */
        const T = buildTreehouse(
          (fx, fz) => ({
            x: q.x + fx * Math.cos(q.rot ?? 0) + fz * Math.sin(q.rot ?? 0),
            z: q.z - fx * Math.sin(q.rot ?? 0) + fz * Math.cos(q.rot ?? 0),
          }),
          q.rot ?? 0, gy - this.groundY, { wall: this.wallMat, tree: this.treeMat },
        );
        add(T.group);
        this.decks.push(...T.decks);
        for (const wl of T.walls) {
          const a = this.local(wl.ax, wl.az);
          const b = this.local(wl.bx, wl.bz);
          this.walls.push({ ...wl, ax: a.x, az: a.z, bx: b.x, bz: b.z, y0: wl.y0 + this.groundY, y1: wl.y1 + this.groundY });
        }
        for (const t of T.trunks) {
          const o = this.local(t.x, t.z);
          // a trunk with a height range keeps it (the cabin's tree thins to a mast)
          this.obstacles.push({
            x: o.x, z: o.z, r: t.r,
            ...(t.y0 != null ? { y0: t.y0 + this.groundY } : {}), ...(t.y1 != null ? { y1: t.y1 + this.groundY } : {}),
          });
        }
        g.userData.treehouse = T;
        break;
      }
      case 'stones': {
        /* Each stone is a deck — a square inside its circle, so her feet
           never hang in the air off a corner — and she can step up from the
           grass (step 0.9 clears the tallest, 0.85). STONES has the why. */
        add(drawItem('stones'));
        for (const s of STONES) {
          const h = s.r * 0.8;
          this.decks.push({ x0: s.x - h, x1: s.x + h, z0: s.z - h, z1: s.z + h, y: gy - this.groundY + s.h, step: 0.9, frame: { x: q.x, z: q.z, a: q.rot ?? 0 }, stone: true });
        }
        break;
      }
      case 'bladeforest': break;
      default: {
        const body = add(placeModel(it.model, drawItem(it.id, 2), it.size, q.look ? { s: q.look.s, style: q.look.style } : null));
        if (it.act) spot(it.act, Math.max(2.4, r + 0.8));
        /* Her BIGGER/SMALLER (`look.s`) scales the collider with the thing:
           a fence made twice as long was solid along its old length. Only
           where there is a size for it to multiply — fitTo ignores it
           otherwise. */
        const mul = it.size ? clampMul(q.look?.s) : 1;
        const solid = SOLID[it.id];
        if (solid) this.obstacles.push({ x: w.x, z: w.z, r: solid * Math.max(1, r / 2.5) * mul });
        const B = SOLID_BOX[it.id];
        if (B) {
          this._boxWalls(q, B[0] * mul, B[1] * mul, gy, gy + B[2] * mul);
          /* ...WITH A LID. The walls stop at the top, so a kitten who jumps
             on was dropped INSIDE the box and the four walls shoved her back
             and forth between them for good (measured: she never left). Now
             she stands on it — and walking along the top of a fence is a
             thing a kid will want to do anyway. */
          this.decks.push({ x0: -B[0] * mul, x1: B[0] * mul, z0: -B[1] * mul, z1: B[1] * mul, y: gy - this.groundY + B[2] * mul, step: 0.3, frame: { x: q.x, z: q.z, a: q.rot ?? 0 } });
        }
        for (const [px, pz] of SOLID_POSTS[it.id]?.at ?? []) {
          const o = this.local(...this._itemToHouse(q, px * mul, pz * mul));
          this.obstacles.push({ x: o.x, z: o.z, r: SOLID_POSTS[it.id].r * mul });
        }
        const k = XRAY_PLANT[it.id];
        if (k) {
          xrayModel(body, this.plantMat, k);
          body.userData.onReal = (gm) => xrayModel(gm, this.plantMat, k);
        }
      }
    }
    g.userData.place = P.id;
    g.userData.item = it.id;
    return g;
  }

  /** What a kendo dojo or a holodeck adds to a room: the floor and the kit. */
  _roomDressing(room, type, Rrow = null) {
    const g = new THREE.Group();
    const hs = this.houseOf(room);
    const y = this.floorY(room);
    const c = hs.local(room.cx, room.cz);
    g.position.set(c.x, y, c.z);
    g.rotation.y = hs.ry;
    if (type === 'kendo') {
      const floor = new THREE.BoxGeometry(room.w - 1, 0.08, room.d - 1);
      paint(floor, 0xc89a5a);
      floor.translate(0, 0.1, 0);
      // the sparring square, in red tape — the ONLY floor outside the ring where a blow lands
      const tape = [];
      const hw = room.w / 2 - 1.6;
      const hd = room.d / 2 - 1.6;
      for (const [w, d, x, z] of [[hw * 2, 0.18, 0, hd], [hw * 2, 0.18, 0, -hd], [0.18, hd * 2, hw, 0], [0.18, hd * 2, -hw, 0]]) {
        const b = new THREE.BoxGeometry(w, 0.1, d);
        paint(b, 0xc0302a);
        b.translate(x, 0.16, z);
        tape.push(b);
      }
      const rack = new THREE.BoxGeometry(2.4, 1.6, 0.3);
      paint(rack, PALETTE.woodDark);
      rack.translate(-room.w / 2 + 1.6, 0.8, -room.d / 2 + 0.5);
      g.add(new THREE.Mesh(mergeParts([floor, ...tape, rack]), toonVertexMat()));
      const rackW = hs.local(room.cx - room.w / 2 + 1.6, room.cz - room.d / 2 + 1.4);
      this.spots.push({ x: rackW.x, z: rackW.z, y, r: 2.4, act: 'kendo', room: room.id });
    } else if (type === 'holodeck') {
      /* HER TUBES AND THE THREE RACKS (holodeck.js): the arcade's, smaller.
         The floor is a dark plate the size of the room; a tube is the
         arcade's glass, with a base and a cap; each rack is a plinth with
         its piece floating over it and a ring on the floor while it is there.
         WHERE they stand is the room's rows (catalog `holo`), and each piece
         is its own group under `itemMeshes`, so build mode can hide the one
         she is carrying exactly as it hides a futon. */
      const rows = (Rrow?.items ?? []).map((q, k) => ({ q, k, it: ITEM_BY_ID[q.id] })).filter((x) => x.it?.holo);
      const floor = new THREE.BoxGeometry(room.w - 1, 0.08, room.d - 1);
      paint(floor, 0x1a2a3a);
      floor.translate(0, 0.1, 0);
      g.add(new THREE.Mesh(floor, toonVertexMat()));
      const R = { room: room.id, racks: [], tubes: [] };
      const piece = (k, at) => {
        const pg = new THREE.Group();
        pg.position.set(at.x, 0, at.z);
        pg.userData.floor = room.floor;
        pg.userData.hk = room.hk;
        g.add(pg);
        this.itemMeshes.set(`r:${room.id}:${k}`, pg);
        return pg;
      };
      for (const { q, k } of rows.filter((x) => x.it.holo === 'tube')) {
        const at = holoCell(room, q);
        const pg = piece(k, at);
        const base = new THREE.CylinderGeometry(1.45, 1.55, 0.3, 16);
        paint(base, 0x2f3446);
        base.translate(0, 0.25, 0);
        /* The cap is a RING, open in the middle: a house is seen from above,
           and the arcade's solid cap, from up here, was a lid over her. */
        const cap = new THREE.TorusGeometry(HOLO_TUBE.r + 0.05, 0.17, 8, 28);
        cap.rotateX(Math.PI / 2);
        paint(cap, 0x2f3446);
        cap.translate(0, HOLO_TUBE.top + 0.1, 0);
        pg.add(new THREE.Mesh(mergeParts([base, cap]), toonVertexMat()));
        /* THE ARCADE'S GLASS, not a tinted cylinder. Richard: "the sprite's
           head is sticking out of the tube and she is drawn in front of it ...
           make it work like the Dream Dojo". Two bugs: the pod was 3.3 tall and
           she floated the arcade's 1.6 in it, so her ears cleared the cap (she
           floats HOME_FLOAT_H here, and HOLO_TUBE is sized off her 2.5); and
           the pod's geometry was translated into the ROOM's frame, so three.js
           sorted it by the room's centre and drew it before her. Now it is the
           arcade's additive shader, POSITIONED at the tube, drawn after her
           (renderOrder 5, as the arcade's) — she is seen through it. */
        const u = { uTime: { value: 0 }, uGlow: { value: 0 }, uColor: { value: new THREE.Color(0x35d7f0) } };
        const glassH = HOLO_TUBE.top - HOLO_TUBE.bottom;
        const pod = new THREE.Mesh(new THREE.CylinderGeometry(HOLO_TUBE.r, HOLO_TUBE.r, glassH, 32, 1, true),
          new THREE.ShaderMaterial({
            vertexShader: TUBE_VERT, fragmentShader: TUBE_FRAG, uniforms: u,
            transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
          }));
        pod.position.set(0, HOLO_TUBE.bottom + glassH / 2, 0);
        pod.renderOrder = 5;
        pg.add(pod);
        R.tubes.push({ u, mesh: pod });
        const t = hs.local(room.cx + at.x, room.cz + at.z);
        // The way out of the tube, in the world: toward the room's middle, turned like the house.
        const out = holoOut(room, at);
        const o = hs.local(room.cx + at.x + out.x, room.cz + at.z + out.z);
        this.spots.push({ x: t.x, z: t.z, y, r: 2.2, act: 'holodeck', room: room.id, out: { x: o.x - t.x, z: o.z - t.z } });
      }
      for (const [n, { q, k, it }] of rows.filter((x) => x.it.holo === 'rack').entries()) {
        const at = holoCell(room, q);
        const pg = piece(k, at);
        const pl = new THREE.CylinderGeometry(0.7, 0.8, 0.45, 14);
        paint(pl, 0x2f3446);
        pl.translate(0, 0.32, 0);
        pg.add(new THREE.Mesh(pl, toonVertexMat()));
        const item = GEAR_ITEMS.find((x) => x.id === it.gear);
        const m = gearModel(it.gear, item.colour);
        m.scale.setScalar((GEAR_SCALE[it.gear] ?? 1) * HOLO_GEAR_SCALE);
        const lift = 0.55 + 0.6 * (GEAR_LIFT[it.gear] ?? 1.6) * HOLO_GEAR_SCALE;
        m.position.set(0, lift, 0);
        pg.add(m);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 32),
          new THREE.MeshBasicMaterial({ color: item.colour, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(0, 0.16, 0);
        pg.add(ring);
        const w = hs.local(room.cx + at.x, room.cz + at.z);
        // No collider: walking INTO the rack is how she picks the piece up.
        R.racks.push({ id: it.gear, x: w.x, z: w.z, y, mesh: m, ring, baseY: lift, yaw: 0, phase: n * 2.1 });
      }
      this.holoRooms.push(R);
    }
    return g;
  }

  /**
   * The house's walls cut off at world height `y`, or whole (null) — for a
   * kendo match being watched (kendo.js `halfWallFor`). A clipping plane on
   * the walls' one material: everything of the house's own above it on that
   * storey goes (walls, posts, beams, a scroll hung high) and the furniture,
   * which is not this material, stays. The plane is made once and parked out
   * of the way after, so toggling it never recompiles the shader.
   */
  halfWalls(y) {
    if (y == null && !this._clip) return;
    if (!this._clip) {
      this._clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e9);
      this.wallMat.clippingPlanes = [this._clip];
    }
    this._clip.constant = y ?? 1e9;
  }

  /* ------------------------------ queries ------------------------------ */

  /** Ground under (x, z): the island, or a floor/ramp of the house. */
  heightAt(x, z, fromY = Infinity) {
    const dx = x - this.x;
    const dz = z - this.z;
    if (dx * dx + dz * dz > this.radius * this.radius) return null;
    const h = this.island.heightAt(x, z);
    let best = h == null ? null : { y: h, island: this.island, home: this };
    if (this.decks?.length) {
      const L = this.toLocal(x, z);
      for (const d of this.decks) {
        /* A deck with a `frame` sits at an angle (the treehouse's bridges and
           branches): (x, z) is read in ITS frame, the same turn `local` uses. */
        let lx = L.x, lz = L.z;
        if (d.frame) {
          const c = Math.cos(d.frame.a), s = Math.sin(d.frame.a);
          const dx = L.x - d.frame.x, dz = L.z - d.frame.z;
          lx = dx * c - dz * s;
          lz = dx * s + dz * c;
        }
        if (lx < d.x0 || lx > d.x1 || lz < d.z0 || lz > d.z1) continue;
        const py = this.groundY + (d.dy ?? 0) + (d.yAt ? d.yAt(lx, lz) : d.y);
        if (fromY + (d.step ?? 0.4) < py) continue;
        if (!best || py > best.y) best = { y: py, island: this.island, home: this, deck: d };
      }
    }
    return best;
  }

  /**
   * THE CEILING over a kitten's feet at (x, y, z), in world height, or null.
   * Richard: "if they double or triple jump, they can jump to the floor above
   * them, we should make it that they hit the ceiling". Inside floor k's
   * walls the lid is the underside of the slab above (or the roof's, on the
   * top floor) — except over a stairwell, which is the one place a kitten
   * may go up through a floor. Only from BELOW: feet already above the lid
   * (somebody on the roof) are not under it.
   */
  ceilingAt(x, y, z) {
    for (const hs of this.houses ?? []) {
      const S = hs.shell;
      const L = hs.toLocal(x, z);
      const ly = y - hs.gy;
      const n = S.floorY.length;
      for (let k = 0; k < n; k++) {
        const [hw, hd] = S.half[k];
        if (Math.abs(L.x) > hw || Math.abs(L.z) > hd) continue;
        const lid = S.floorY[k] + FLOOR_H - (k + 1 < n ? SLAB_T : 0.12);
        if (ly < S.floorY[k] - 0.6 || ly >= lid) continue;
        const W = k + 1 < n ? S.wells?.[k] : null;
        if (W && L.x > W.x0 && L.x < W.x1 && L.z > W.z0 && L.z < W.z1) return null;
        return hs.gy + lid;
      }
    }
    return null;
  }

  /** Which house a point is inside, and on which floor: `{ hs, f }` or null. */
  houseAt(x, y, z) {
    for (const hs of this.houses ?? []) {
      const S = hs.shell;
      const L = hs.toLocal(x, z);
      let f = -1;
      for (let k = 0; k < S.floorY.length; k++) {
        const [hw, hd] = S.half[k];
        if (Math.abs(L.x) > hw + 0.2 || Math.abs(L.z) > hd + 0.2) continue;
        if (y >= hs.gy + S.floorY[k] - 0.6) f = k;
      }
      if (f >= 0) return { hs, f };
    }
    return null;
  }

  /** Which floor of a house a point is on, or -1 if not inside one. */
  floorAt(x, y, z) {
    return this.houseAt(x, y, z)?.f ?? -1;
  }

  /** The room a point is in, or null. */
  roomAt(x, y, z) {
    const at = this.houseAt(x, y, z);
    if (!at || !this.home) return null;
    const L = at.hs.toLocal(x, z);
    return homeRooms(this.home).find((r) => r.hk === at.hs.hk && r.floor === at.f
      && Math.abs(L.x - r.cx) <= r.w / 2 && Math.abs(L.z - r.cz) <= r.d / 2) ?? null;
  }

  /** Over the island at all (for the bubble and the music). */
  over(x, z, pad = 0) {
    return Math.hypot(x - this.x, z - this.z) < this.radius + pad;
  }

  bubbleRadius() { return this.radius + BUBBLE_PAD; }

  update(dt, t, players = []) {
    const U = this.bubble.material.uniforms;
    U.uTime.value = t;
    U.uHitT.value += dt;
    // the doors: pinned open, or open while somebody stands at them
    for (const hs of this.houses ?? []) {
      for (const d of hs.doors) {
        const near = players.some((p) => p && Math.hypot(p.position.x - d.wx, p.position.z - d.wz) < 3.6
          && Math.abs(p.position.y - d.y) < 3);
        const want = d.pinned || near ? 1 : 0;
        d.k += Math.sign(want - d.k) * Math.min(Math.abs(want - d.k), dt * 3.5);
        d.panels.forEach((m, i) => { m.position.x = (i ? 1 : -1) * (d.w / 4 + d.k * (d.w / 2 + 0.05)); });
      }
    }
    for (const [hk, R] of this.raising ?? []) {
      R.t += dt;
      const u = Math.min(1, R.t / R.dur);
      // the purchase scene's ease, and a little overshoot so it lands
      const e = u >= 1 ? 1 : u * u * (3 - 2 * u) * (1 + Math.sin(u * Math.PI) * 0.08);
      this.rise(hk, e);
      if (u >= 1) this.raising.delete(hk);
    }
    this.pathFx?.update(dt, t, players);
    for (const W of this.windows ?? []) {
      const want = W.q.open ? 1 : 0;
      W.k += Math.sign(want - W.k) * Math.min(Math.abs(want - W.k), dt * 3);
      W.panels.forEach((m, i) => { m.position.x = (i ? 1 : -1) * (WINDOW.w / 4 + W.k * (WINDOW.w / 2 + 0.06)); });
    }
  }

  /**
   * A HOUSE RISING OUT OF ITS GROUND, and everything in it with it: `e` 0..1.
   * Richard, Oct 2026: "Furniture and windows aren't scaled with the build
   * animation. Can we parent them to the house". They are not children of the
   * house group (the cutaway and the build ghost each need them on their own),
   * so this scales them about the same ground the house group stands on,
   * which is the same thing a parent would do. `e` at 1 puts back exactly
   * what was there, so a skipped scene leaves no half-risen chair.
   */
  rise(hk, e) {
    const hs = this.houseOf(hk);
    if (!hs) return;
    const k = Math.max(0.02, Math.min(1, e));
    hs.group.scale.set(1, k, 1);
    for (const g of this.itemGroup.children) {
      if (g.userData.floor == null || (g.userData.hk ?? 'main') !== hs.hk) continue;
      const r = (g.userData.rise ??= { y: g.position.y, s: g.scale.y });
      g.position.y = hs.gy + (r.y - hs.gy) * k;
      g.scale.y = r.s * k;
      if (e >= 1) delete g.userData.rise;
    }
  }

  /** Raise house `hk` over `dur` seconds from now (`update` drives it). */
  raise(hk, dur = RAISE_T) {
    (this.raising ??= new Map()).set(hk, { t: 0, dur });
    this.rise(hk, 0);
  }

  bump(x, y, z) {
    const U = this.bubble.material.uniforms;
    U.uHit.value.set(x, y, z);
    U.uHitT.value = 0;
  }

  /**
   * Cutaway: hide every floor above `floor` and the roof, or show all. One
   * number cuts every house; a Map (hk → floor) cuts each house to its own,
   * and a house not in it stands whole — "she is inside the dojo" says
   * nothing about the tiny house across the lawn.
   */
  cutaway(floor) {
    const fOf = (hk) => (floor instanceof Map ? (floor.get(hk) ?? -1) : floor);
    for (const hs of this.houses ?? []) {
      const f = fOf(hs.hk);
      hs.floorMeshes.forEach((m, k) => { m.visible = f < 0 || k <= f; });
      for (const m of hs.roofMeshes) m.visible = f < 0;
    }
    // ...and the things standing on a floor that is cut away go with it
    for (const g of this.itemGroup.children) {
      if (g.userData.floor == null) continue;
      const f = fOf(g.userData.hk ?? 'main');
      g.visible = !g.userData.held && (f < 0 || g.userData.floor <= f);
    }
  }

  /** Height of the whole thing, for the camera. */
  get height() {
    return this.home ? houseHeight(this.home.house) : 4;
  }

  get houseR() {
    return this.home ? houseRadius(this.home.house) : 6;
  }
}

export { FLOOR_H };

export { PANEL_GAP };
/** From a window's slot back to the middle of its wall (`wallSlots`: hw - 0.22). */
export const WINDOW_IN = 0.22;

/** A furnishing's collider at scale `s`: as big as it, but past 100% only half the extra counts. */
export const furnScale = (s) => (s <= 1 ? s : 1 + (s - 1) * 0.5);
/** How close her middle comes to a furnishing's edge: half her radius (Player 0.75). */
export const FURN_REACH = 0.375;
/** ...so the rectangle is drawn in from the edge by her push distance (radius + `_segPush`'s 0.18) less that. */
export const FURN_INSET = 0.75 + 0.18 - FURN_REACH;

/** How long a newly built house takes to rise out of the lawn. */
export const RAISE_T = 2.4;


/** The drawn flower box a blossom bridge's planter stands in as (links.js `linkModels`). */
function planterStandIn() {
  const parts = [];
  const b = new THREE.BoxGeometry(1.2, 0.3, 0.4);
  paint(b, 0x7a5236);
  b.translate(0, 0.15, 0);
  parts.push(b);
  for (let k = 0; k < 3; k++) {
    const f = new THREE.DodecahedronGeometry(0.16, 0);
    paint(f, [0xff8fb8, 0xffd0e0, 0xffffff][k]);
    f.translate(-0.4 + k * 0.4, 0.38, 0);
    parts.push(f);
  }
  return new THREE.Mesh(mergeParts(parts), toonVertexMat());
}

/**
 * A PATH PIECE, flat on the grass, `pw` wide and `len` long along its own z.
 * Richard: "walking paths in the yard on the ground, these can be narrow or
 * wide. Some of it should be fancy like 'red carpet' paths ... tiki torches".
 * Thin (a tenth of a unit or so), so a kitten walks over it without a step.
 *
 *   solid   — the toon parts, one merged mesh
 *   glow    — unlit parts that never change
 *   torches — [x, y, z] of each flame (pathfx.js `makeFlame` draws it, alive)
 *   lamps   — each lantern's paper, its own geometry (pathfx.js `makeLamp`)
 *   decks   — what she STANDS on: "she stands on top of path meshes". It was
 *             walked through at grass level, so her feet sank into a boardwalk
 *             0.17 tall. Rectangles in the piece's own frame, at their tops.
 */
export function pathParts(it) {
  const solid = [];
  const glow = [];
  const torches = [];
  const lamps = [];
  const decks = [];
  const hw = it.pw / 2, hl = it.len / 2;
  const B = (w, h, d, c, x, y, z, list = solid) => { const g = new THREE.BoxGeometry(w, h, d); paint(g, c); g.translate(x, y, z); list.push(g); return g; };
  const flat = (y) => decks.push({ x0: -hw, x1: hw, z0: -hl, z1: hl, y });
  let seed = it.id.length * 7.13;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  switch (it.id) {
    case 'path_stone': {
      for (const s of steppingStones(it, rnd)) {
        const sh = new THREE.Shape(s.poly.map(([x, z]) => new THREE.Vector2(x, -z)));
        const geo = new THREE.ExtrudeGeometry(sh, { depth: s.h, bevelEnabled: false });
        geo.rotateX(-Math.PI / 2);
        paint(geo, s.c);
        solid.push(geo);
        decks.push({ ...s.deck, y: s.h });
      }
      break;
    }
    case 'path_wood':
      for (const x of [-hw + 0.25, hw - 0.25]) B(0.18, 0.1, it.len, 0x5a3e26, x, 0.05, 0);
      for (let z = -hl + 0.3; z < hl; z += 0.6) B(it.pw, 0.08, 0.5, rnd() < 0.5 ? PALETTE.wood : 0xb98a52, 0, 0.13, z);
      flat(0.17);
      break;
    case 'path_gravel':
      B(it.pw, 0.06, it.len, 0xd8d2c4, 0, 0.03, 0);
      for (let x = -hw + 0.35; x < hw - 0.2; x += 0.45) B(0.05, 0.02, it.len - 0.1, 0xb8b2a4, x, 0.065, 0);
      // the kerbs run a hair past the gravel's ends, so the ends never share a plane
      for (const x of [-hw, hw]) B(0.16, 0.1, it.len + 0.02, 0x7a756e, x, 0.05, 0);
      flat(0.06);
      break;
    case 'path_flag':
      for (let z = -hl + 0.55; z < hl; z += 1.1) {
        for (let x = -hw + 0.55; x < hw - 0.1; x += 1.1) B(1.0, 0.1 + rnd() * 0.03, 1.0, [0xa8a39b, 0x9a958e, 0xb4afa6][Math.floor(rnd() * 3)], x, 0.05, z);
      }
      flat(0.1);
      break;
    case 'path_petal':
      B(it.pw, 0.06, it.len, 0xc9a77a, 0, 0.03, 0);
      for (let k = 0; k < 40; k++) {
        const p = new THREE.CylinderGeometry(0.09, 0.09, 0.02, 5);
        paint(p, rnd() < 0.6 ? 0xffb7cf : 0xffe0ea);
        // each its own height, so two that overlap never share a plane
        p.translate((rnd() - 0.5) * it.pw * 0.9, 0.07 + k * 0.0012, (rnd() - 0.5) * it.len * 0.95);
        solid.push(p);
      }
      flat(0.06);
      break;
    case 'path_lantern':
      B(it.pw - 1.0, 0.06, it.len, 0xd8d2c4, 0, 0.03, 0);
      for (const [x, z] of pathPosts(it).at) lamps.push(lampParts(solid, x, z));
      decks.push({ x0: -hw + 0.5, x1: hw - 0.5, z0: -hl, z1: hl, y: 0.06 });
      break;
    case 'path_carpet':
      B(it.pw - 0.5, 0.05, it.len, 0xc0202a, 0, 0.025, 0);
      for (const x of [-hw + 0.3, hw - 0.3]) B(0.12, 0.06, it.len + 0.02, 0xe8b84a, x, 0.03, 0);
      for (let z = -hl + 1; z < hl; z += 2) B(0.5, 0.055, 0.5, 0xe8b84a, 0, 0.03, z);
      decks.push({ x0: -hw + 0.25, x1: hw - 0.25, z0: -hl, z1: hl, y: 0.05 });
      break;
    case 'path_tiki': {
      B(it.pw - 1.0, 0.06, it.len, 0xe2cf9a, 0, 0.03, 0);
      for (const [x, z] of pathPosts(it).at) torches.push(torchParts(solid, x, z));
      decks.push({ x0: -hw + 0.5, x1: hw - 0.5, z0: -hl, z1: hl, y: 0.06 });
      break;
    }
    default:
      B(it.pw, 0.06, it.len, 0xc9a77a, 0, 0.03, 0);
      flat(0.06);
  }
  return { solid, glow, torches, lamps, decks };
}

/** A bamboo tiki torch's pole and cup at (x, z); returns where its flame sits. */
export function torchParts(solid, x, z) {
  const pole = new THREE.CylinderGeometry(0.08, 0.1, 2.4, 6);
  paint(pole, 0xb08a4a);
  pole.translate(x, 1.2, z);
  const wrap = new THREE.CylinderGeometry(0.11, 0.11, 0.3, 6);
  paint(wrap, 0x6a4a2a);
  wrap.translate(x, 1.9, z);
  const cup = new THREE.CylinderGeometry(0.22, 0.13, 0.38, 7);
  paint(cup, 0x6a4a2a);
  cup.translate(x, 2.55, z);
  solid.push(pole, wrap, cup);
  return [x, 2.72, z];
}

/** A little stone path lantern at (x, z): post and cap into `solid`; returns its paper. */
export function lampParts(solid, x, z) {
  const b = (w, h, d, c, y) => { const g = new THREE.BoxGeometry(w, h, d); paint(g, c); g.translate(x, y, z); solid.push(g); };
  b(0.35, 0.5, 0.35, 0x8a857c, 0.25);
  b(0.5, 0.1, 0.5, 0x7a756e, 0.87);
  const paper = new THREE.BoxGeometry(0.3, 0.32, 0.3);
  paper.translate(x, 0.66, z);
  return paper;
}

/**
 * STEPPING STONES THAT FIT. Richard, Oct 2026: "stepping-stone paths get
 * varied heights (no z-fighting) and shapes that fit tightly without
 * intersecting." They were heptagons r 0.62-0.77 every 1.2, so neighbours
 * overlapped by up to 0.34 and their tops, all at 0.12, fought. Now the strip
 * is CUT: slanted lines across it, a stone between each two, drawn in from
 * both lines by GAP so the seam between them is a thin even line of grass;
 * corners clipped so they read as stone, not tiles; each its own height.
 * Every stone is convex by construction (two lines that never cross inside
 * the strip, since |slope| * width < the narrowest spacing).
 */
export const STONE_GAP = 0.06;
export function steppingStones(it, rnd) {
  const hw = it.pw / 2, hl = it.len / 2;
  const cuts = [{ c: -hl, s: 0 }];
  for (let z = -hl + 1.1 + rnd() * 0.3; z < hl - 0.9; z += 1.0 + rnd() * 0.4) cuts.push({ c: z, s: (rnd() - 0.5) * 0.3 });
  cuts.push({ c: hl, s: 0 });
  const out = [];
  for (let k = 0; k + 1 < cuts.length; k++) {
    const A = cuts[k], C = cuts[k + 1];
    const x0 = -hw + 0.05 + rnd() * 0.2, x1 = hw - 0.05 - rnd() * 0.2;
    const zA = (x) => A.c + A.s * x + STONE_GAP, zC = (x) => C.c + C.s * x - STONE_GAP;
    const q = [[x0, zA(x0)], [x1, zA(x1)], [x1, zC(x1)], [x0, zC(x0)]];
    // clip each corner 0.14 along both its edges
    const poly = [];
    for (let i = 0; i < 4; i++) {
      const P0 = q[(i + 3) % 4], P1 = q[i], P2 = q[(i + 1) % 4];
      const toward = (Q, d) => { const L = Math.hypot(Q[0] - P1[0], Q[1] - P1[1]); return [P1[0] + ((Q[0] - P1[0]) / L) * d, P1[1] + ((Q[1] - P1[1]) / L) * d]; };
      poly.push(toward(P0, 0.14), toward(P2, 0.14));
    }
    out.push({
      poly,
      h: 0.08 + ((k * 5) % 4) * 0.025 + rnd() * 0.01,
      c: rnd() < 0.5 ? 0x9a958e : 0x8a857c,
      deck: { x0: x0 + 0.1, x1: x1 - 0.1, z0: Math.max(zA(x0), zA(x1)), z1: Math.min(zC(x0), zC(x1)) },
    });
  }
  return out;
}

/** Under this much of the ceiling, at the least, every room thing stays. */
export const CEILING_GAP = 0.3;

/** Yard things the build draws itself, rather than as one model: no look. */
export const YARD_BUILT = new Set(['koipond', 'onsen', 'volleyball', 'bamboofarm', 'pen', 'treehouse', 'bladeforest', 'tiki', 'pathlamp', 'zengarden', ...ITEMS.filter((i) => i.path).map((i) => i.id)]);

/**
 * A room thing's look, with the box it must stay in: under the ceiling (the
 * walls are FLOOR_H - 0.35 tall, and the slab above sits on them) and inside
 * its own tatami, in its own unturned frame — cells[0] along x. Richard: "be
 * careful that when customizing items, that they do not go through the floor,
 * ceiling, or through walls." The floor is free: `fitTo` sits everything on it.
 */
export function roomLook(it, placed) {
  const [cx, cz] = it.cells ?? [1, 1];
  return {
    s: placed?.look?.s ?? 1,
    style: placed?.look?.style ?? null,
    cap: { y: FLOOR_H - 0.35 - CEILING_GAP, x: cx * 2 - 0.1, z: cz * 2 - 0.1 },
  };
}
