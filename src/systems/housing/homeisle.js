import * as THREE from 'three';
import { toonVertexMat, xrayVertexMat, paint } from '../../core/gfx.js';
import { Island, mergeParts, PALETTE } from '../../world/build.js';
import { makeLabelTexture } from '../../core/label.js';
import { buildHouseShell, houseHeight, houseRadius, FLOOR_H, SLAB_T } from './homehouse.js';
import { HOUSE_BY_ID, ITEM_BY_ID } from './catalog.js';
import { placeModel, drawItem } from './models.js';
import { wallSlots, yardR } from './editor.js';
import { buildTreehouse } from './treehouse.js';
import { holoLayout, HOLO_GEAR_SCALE } from './holodeck.js';
import { GEAR_ITEMS, GEAR_SCALE, GEAR_LIFT, gearModel } from '../dream/gear.js';

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
const SOLID = { teahouse: 2.4, belltower: 1.8, well: 1.1, shrine: 2.2, maple: 0.5, cherry: 0.5, pine: 0.5, waterwheel: 1.2, lantern: 0.5, firebasket: 0.3, sake: 0.8, drum: 1.0 };

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
    this.xrayMats = [this.wallMat, this.roofMat, this.soffitMat, ...this.accentMats];
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
    /** Who has won how many arena battles — Housing hands this in, for the
     *  trophy shelf. Null draws an empty shelf. */
    this.cupsFor = null;
  }

  /* ------------------------------ building ----------------------------- */

  build(scene) {
    const geo = this.island.buildMesh(20, 48);
    this.islandMesh = new THREE.Mesh(geo, toonVertexMat());
    this.group.add(this.islandMesh);
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
    this.houseGroup.clear();
    this.floorMeshes = [];
    this.roofMeshes = [];
    this.houseWalls = [];
    this.houseDecks = [];
    this.shell = null;
    this.saleSign.visible = !home;
    if (home) {
      const S = buildHouseShell(home.house);
      this.shell = S;
      const hg = new THREE.Group();
      hg.position.set(this.x, this.groundY, this.z);
      hg.rotation.y = this.ry;
      for (const parts of S.floors) {
        const m = new THREE.Mesh(mergeParts(parts), this.wallMat);
        hg.add(m);
        this.floorMeshes.push(m);
      }
      if (S.roof.length) {
        const m = new THREE.Mesh(mergeParts(S.roof), this.soffitMat);
        hg.add(m);
        this.roofMeshes.push(m);
      }
      if (S.tint.length) {
        /* The roof is the last floor's tint and the skirts belong to the
           floors they hang off — but one mesh is one draw call, and the
           cutaway only needs to know "is anyone inside below the top", so
           the whole tinted set goes with the roof. */
        const m = new THREE.Mesh(mergeParts(S.tint), this.roofMat);
        hg.add(m);
        this.roofMeshes.push(m);
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
        this.roofMeshes.push(m);
      });
      if (S.sign) hg.add(this._nameBoard(S.sign, home, colours));
      this.houseGroup.add(hg);
      // colliders and decks into the world frame
      for (const w of S.walls) {
        const a = this.local(w.ax, w.az);
        const b = this.local(w.bx, w.bz);
        this.houseWalls.push({ ...w, ax: a.x, az: a.z, bx: b.x, bz: b.z, y0: w.y0 + this.groundY, y1: w.y1 + this.groundY });
      }
      this.houseDecks = S.decks.map((d) => ({ ...d }));
      this.doorWorld = this.local(0, S.door.z);
      this.doorLocal = S.door;
    }
    this.setColours(colours, 1);
    this.rebuildItems();
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
    /* The house's colliders and decks, then whatever the yard adds (the
       treehouse is a level of its own). Two lists joined, so moving a tree
       never has to rebuild the house. */
    this.walls = [...(this.houseWalls ?? [])];
    this.decks = [...(this.houseDecks ?? [])];
    this.itemMeshes = new Map();
    const H = this.home;
    if (!H) return;
    // ---- outdoors
    for (const q of H.outdoor ?? []) {
      const it = ITEM_BY_ID[q.id];
      if (!it || it.later) continue;
      const g = this._yardItem(it, q);
      this.itemGroup.add(g);
      this.itemMeshes.set('o' + q.uid, g);
    }
    // ---- the rooms, and their walls
    const def = HOUSE_BY_ID[H.house];
    for (const room of def?.rooms ?? []) {
      const R = H.rooms?.[room.id];
      if (R?.type === 'kendo' || R?.type === 'holodeck') {
        const dz = this._roomDressing(room, R.type);
        dz.userData.floor = room.floor;
        this.itemGroup.add(dz);
      }
      const y = this.groundY + (this.shell?.floorY[room.floor] ?? 0);
      for (const [k, placed] of (R?.items ?? []).entries()) {
        const it = ITEM_BY_ID[placed.id];
        if (!it) continue;
        const L = this.cellCentre(room, placed.gx, placed.gz, it, placed.rot);
        const w = this.local(L.x, L.z);
        const g = placeModel(it.model, drawItem(it.id, 2), it.size, roomLook(it, placed));
        g.position.set(w.x, y, w.z);
        g.rotation.y = this.ry + (placed.rot ?? 0) * (Math.PI / 2);
        g.userData.floor = room.floor;
        this.itemGroup.add(g);
        this.itemMeshes.set(`r:${room.id}:${k}`, g);
        if (it.act) this.spots.push({ x: w.x, z: w.z, y, r: 2.6, act: it.act, item: it.id, room: room.id, k });
      }
      const slots = (R?.wall?.length) ? wallSlots(H.house, room) : [];
      for (const [k, q] of (R?.wall ?? []).entries()) {
        const it = ITEM_BY_ID[q.id];
        const S = slots.find((s) => s.side === q.side && s.k === q.k);
        if (!it || !S) continue;
        const cups = q.id === 'trophy' ? (this.cupsFor?.(H) ?? 0) : 0;
        const g = placeModel(null, drawItem(it.id, 2, { cups }), it.size);
        const w = this.local(S.x, S.z);
        g.position.set(w.x, y + (WALL_Y[q.id] ?? 1), w.z);
        g.rotation.y = this.ry + S.ry;
        g.userData.floor = room.floor;
        this.itemGroup.add(g);
        this.itemMeshes.set(`w:${room.id}:${k}`, g);
        if (it.act) {
          // the spot is a step into the room from the wall, where she stands
          const f = this.local(S.x - Math.sin(S.ry) * -1.4, S.z - Math.cos(S.ry) * -1.4);
          this.spots.push({ x: f.x, z: f.z, y, r: 1.8, act: it.act, item: it.id, room: room.id, side: q.side, slot: S });
        }
      }
    }
    // the front door's own spot: owner's lock, everybody's knock
    if (this.doorWorld) {
      const d = this.local(0, (this.shell?.door.z ?? 6) + 1.6);
      this.spots.push({ x: d.x, z: d.z, y: this.groundY + (this.shell?.base ?? 0), r: 2.6, act: 'door' });
    }
  }

  /** The first outdoor place holding item `id`, or null — the koi and the farm ask. */
  placeOf(id) {
    for (const P of this.places.values()) if (P.item === id) return P;
    return null;
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
    switch (it.id) {
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
          q.rot ?? 0, gy - this.groundY, this.wallMat,
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
          this.obstacles.push({ x: o.x, z: o.z, r: t.r });
        }
        g.userData.treehouse = T;
        break;
      }
      case 'bladeforest': break;
      default: {
        add(placeModel(it.model, drawItem(it.id, 2), it.size, q.look ? { s: q.look.s, style: q.look.style } : null));
        if (it.act) spot(it.act, Math.max(2.4, r + 0.8));
        const solid = SOLID[it.id];
        if (solid) this.obstacles.push({ x: w.x, z: w.z, r: solid * Math.max(1, r / 2.5) });
      }
    }
    g.userData.place = P.id;
    g.userData.item = it.id;
    return g;
  }

  /** What a kendo dojo or a holodeck adds to a room: the floor and the kit. */
  _roomDressing(room, type) {
    const g = new THREE.Group();
    const y = this.groundY + (this.shell?.floorY[room.floor] ?? 0);
    const c = this.local(room.cx, room.cz);
    g.position.set(c.x, y, c.z);
    g.rotation.y = this.ry;
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
      const rackW = this.local(room.cx - room.w / 2 + 1.6, room.cz - room.d / 2 + 1.4);
      this.spots.push({ x: rackW.x, z: rackW.z, y, r: 2.4, act: 'kendo', room: room.id });
    } else if (type === 'holodeck') {
      /* HER TUBE AND THE THREE RACKS (holodeck.js): the arcade's, smaller.
         The floor is a dark plate the size of the room; the tube is the
         arcade's glass, with a base and a cap; each rack is a plinth with
         its piece floating over it and a ring on the floor while it is there. */
      const L = holoLayout(room);
      const floor = new THREE.BoxGeometry(room.w - 1, 0.08, room.d - 1);
      paint(floor, 0x1a2a3a);
      floor.translate(0, 0.1, 0);
      const hard = [floor];
      const base = new THREE.CylinderGeometry(1.45, 1.55, 0.3, 16);
      paint(base, 0x2f3446);
      base.translate(L.tube.x, 0.25, L.tube.z);
      const cap = new THREE.CylinderGeometry(1.45, 1.35, 0.3, 16);
      paint(cap, 0x2f3446);
      cap.translate(L.tube.x, 3.75, L.tube.z);
      hard.push(base, cap);
      const pod = new THREE.CylinderGeometry(1.25, 1.25, 3.3, 16, 1, true);
      paint(pod, 0x7fe6ff);
      pod.translate(L.tube.x, 2.05, L.tube.z);
      const R = { room: room.id, racks: [] };
      for (const r of L.racks) {
        const pl = new THREE.CylinderGeometry(0.7, 0.8, 0.45, 14);
        paint(pl, 0x2f3446);
        pl.translate(r.x, 0.32, r.z);
        hard.push(pl);
      }
      g.add(new THREE.Mesh(mergeParts(hard), toonVertexMat()));
      g.add(new THREE.Mesh(pod, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false })));
      for (const [k, r] of L.racks.entries()) {
        const item = GEAR_ITEMS.find((x) => x.id === r.id);
        const m = gearModel(r.id, item.colour);
        m.scale.setScalar((GEAR_SCALE[r.id] ?? 1) * HOLO_GEAR_SCALE);
        const lift = 0.55 + 0.6 * (GEAR_LIFT[r.id] ?? 1.6) * HOLO_GEAR_SCALE;
        m.position.set(r.x, lift, r.z);
        g.add(m);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 32),
          new THREE.MeshBasicMaterial({ color: item.colour, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(r.x, 0.16, r.z);
        g.add(ring);
        const w = this.local(room.cx + r.x, room.cz + r.z);
        // No collider: walking INTO the rack is how she picks the piece up.
        R.racks.push({ id: r.id, x: w.x, z: w.z, y, mesh: m, ring, baseY: lift, yaw: 0, phase: k * 2.1 });
      }
      this.holoRooms.push(R);
      const t = this.local(room.cx + L.tube.x, room.cz + L.tube.z);
      // The way out of the tube, in the world: the room's own axis, turned like the house.
      const o = this.local(room.cx + L.tube.x + L.out.x, room.cz + L.tube.z + L.out.z);
      this.spots.push({ x: t.x, z: t.z, y, r: 2.2, act: 'holodeck', room: room.id, out: { x: o.x - t.x, z: o.z - t.z } });
    }
    return g;
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
        const py = this.groundY + (d.yAt ? d.yAt(lx, lz) : d.y);
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
    const S = this.shell;
    if (!S) return null;
    const L = this.toLocal(x, z);
    const ly = y - this.groundY;
    const n = S.floorY.length;
    for (let k = 0; k < n; k++) {
      const [hw, hd] = S.half[k];
      if (Math.abs(L.x) > hw || Math.abs(L.z) > hd) continue;
      const lid = S.floorY[k] + FLOOR_H - (k + 1 < n ? SLAB_T : 0.12);
      if (ly < S.floorY[k] - 0.6 || ly >= lid) continue;
      const W = k + 1 < n ? S.wells?.[k] : null;
      if (W && L.x > W.x0 && L.x < W.x1 && L.z > W.z0 && L.z < W.z1) return null;
      return this.groundY + lid;
    }
    return null;
  }

  /** Which floor of the house a point is on, or -1 if not inside it. */
  floorAt(x, y, z) {
    if (!this.shell) return -1;
    const L = this.toLocal(x, z);
    let f = -1;
    for (let k = 0; k < this.shell.floorY.length; k++) {
      const [hw, hd] = this.shell.half[k];
      if (Math.abs(L.x) > hw + 0.2 || Math.abs(L.z) > hd + 0.2) continue;
      if (y >= this.groundY + this.shell.floorY[k] - 0.6) f = k;
    }
    return f;
  }

  /** The room a point is in, or null. */
  roomAt(x, y, z) {
    const f = this.floorAt(x, y, z);
    if (f < 0 || !this.home) return null;
    const L = this.toLocal(x, z);
    const def = HOUSE_BY_ID[this.home.house];
    return def?.rooms.find((r) => r.floor === f
      && Math.abs(L.x - r.cx) <= r.w / 2 && Math.abs(L.z - r.cz) <= r.d / 2) ?? null;
  }

  /** Over the island at all (for the bubble and the music). */
  over(x, z, pad = 0) {
    return Math.hypot(x - this.x, z - this.z) < this.radius + pad;
  }

  bubbleRadius() { return this.radius + BUBBLE_PAD; }

  update(dt, t) {
    const U = this.bubble.material.uniforms;
    U.uTime.value = t;
    U.uHitT.value += dt;
  }

  bump(x, y, z) {
    const U = this.bubble.material.uniforms;
    U.uHit.value.set(x, y, z);
    U.uHitT.value = 0;
  }

  /** Cutaway: hide every floor above `floor` and the roof, or show all. */
  cutaway(floor) {
    const n = this.floorMeshes.length;
    for (let k = 0; k < n; k++) this.floorMeshes[k].visible = floor < 0 || k <= floor;
    for (const m of this.roofMeshes) m.visible = floor < 0;
    // ...and the things standing on a floor that is cut away go with it
    for (const g of this.itemGroup.children) {
      if (g.userData.floor != null) g.visible = !g.userData.held && (floor < 0 || g.userData.floor <= floor);
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

/** Under this much of the ceiling, at the least, every room thing stays. */
export const CEILING_GAP = 0.3;

/** Yard things the build draws itself, rather than as one model: no look. */
export const YARD_BUILT = new Set(['koipond', 'onsen', 'volleyball', 'bamboofarm', 'pen', 'treehouse', 'bladeforest']);

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
