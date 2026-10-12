import * as THREE from 'three';
import { toonVertexMat, xrayVertexMat, paint } from '../../core/gfx.js';
import { Island, mergeParts, PALETTE } from '../../world/build.js';
import { makeLabelTexture } from '../../core/label.js';
import { buildHouseShell, houseHeight, houseRadius, FLOOR_H } from './homehouse.js';
import { HOUSE_BY_ID, ITEM_BY_ID } from './catalog.js';
import { placeModel, drawItem } from './models.js';

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

/** Yard plots: angle off the front (radians), distance out, kind, size.
 *  Nothing within ±0.7 rad of the front, which is the bridge's landing. */
export const PLOTS = [
  { id: 'p1', a: 1.05, d: 30, kind: 'garden', r: 6 },
  { id: 'p2', a: 1.75, d: 31, kind: 'water', r: 7 },
  { id: 'p3', a: 2.45, d: 31, kind: 'grove', r: 7 },
  { id: 'p4', a: Math.PI, d: 31, kind: 'court', r: 8 },
  { id: 'p5', a: -2.45, d: 31, kind: 'grove', r: 7 },
  { id: 'p6', a: -1.75, d: 31, kind: 'water', r: 7 },
  { id: 'p7', a: -1.05, d: 30, kind: 'garden', r: 6 },
];

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
    this.accentMats = [0, 1, 2, 3].map(() => toonVertexMat({ color: NEUTRAL_ACCENT }));
    this.roofMat = toonVertexMat({ color: NEUTRAL_ROOF });
    this.wallMat = xrayVertexMat();
    /** Floor groups and the roof, for the per-pane cutaway. */
    this.floorMeshes = [];
    this.roofMeshes = [];
    /** World-space colliders the walls hook reads: rebuilt with the house. */
    this.walls = [];
    this.obstacles = [];
    /** What INTERACT means where: rebuilt with the house and the yard. */
    this.spots = [];
    this.plots = PLOTS.map((P) => {
      const a = this.ry + P.a;
      /* Rotated off the FRONT: the front is local +z, which in the world is
         (sin ry, cos ry); an angle a off it is (sin(ry+a), cos(ry+a)). */
      const x = site.x + Math.sin(a) * P.d;
      const z = site.z + Math.cos(a) * P.d;
      return { ...P, x, z, y: this.island.heightAt(x, z) ?? this.groundY };
    });
  }

  /* ------------------------------ building ----------------------------- */

  build(scene) {
    const geo = this.island.buildMesh(20, 48);
    this.islandMesh = new THREE.Mesh(geo, toonVertexMat());
    this.group.add(this.islandMesh);
    // plot outlines: a ring of flat stones, so an empty plot reads as a place
    const rings = [];
    for (const P of this.plots) {
      const n = Math.round(P.r * 2.2);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const g = new THREE.CylinderGeometry(0.35, 0.42, 0.18, 6);
        paint(g, P.kind === 'water' ? 0x8fb7c9 : P.kind === 'court' ? 0xe8d29b : P.kind === 'grove' ? 0x7a9a5a : 0xb8b0a0);
        const x = P.x + Math.cos(a) * P.r;
        const z = P.z + Math.sin(a) * P.r;
        g.translate(x, (this.island.heightAt(x, z) ?? P.y) + 0.05, z);
        rings.push(g);
      }
    }
    this.plotMesh = new THREE.Mesh(mergeParts(rings), toonVertexMat());
    this.group.add(this.plotMesh);
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
    this.walls = [];
    this.decks = [];
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
        const m = new THREE.Mesh(mergeParts(S.roof), toonVertexMat());
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
        const m = new THREE.Mesh(mergeParts(parts), this.accentMats[k]);
        hg.add(m);
        /* Accents on the top floor and the roof go with the roof; the
           ground floor's noren stays. Close enough: they are all trim. */
        if (k > 0) this.roofMeshes.push(m);
      });
      this.houseGroup.add(hg);
      // colliders and decks into the world frame
      for (const w of S.walls) {
        const a = this.local(w.ax, w.az);
        const b = this.local(w.bx, w.bz);
        this.walls.push({ ...w, ax: a.x, az: a.z, bx: b.x, bz: b.z, y0: w.y0 + this.groundY, y1: w.y1 + this.groundY });
      }
      this.decks = S.decks.map((d) => ({ ...d }));
      this.doorWorld = this.local(0, S.door.z);
      this.doorLocal = S.door;
    }
    this.setColours(colours, 1);
    this.rebuildItems();
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

  /** Lay the yard and the rooms out again from `this.home`. */
  rebuildItems() {
    for (const c of this.itemGroup.children) c.userData.disposed = true;
    this.itemGroup.clear();
    this.obstacles = [];
    this.spots = [];
    const H = this.home;
    if (!H) return;
    // ---- the yard
    for (const P of this.plots) {
      const id = H.yard?.[P.id];
      const it = id && ITEM_BY_ID[id];
      if (!it) continue;
      const g = this._yardItem(it, P);
      this.itemGroup.add(g);
    }
    // ---- the rooms
    const def = HOUSE_BY_ID[H.house];
    for (const room of def?.rooms ?? []) {
      const R = H.rooms?.[room.id];
      if (R?.type === 'kendo' || R?.type === 'holodeck') {
        this.itemGroup.add(this._roomDressing(room, R.type));
      }
      for (const placed of R?.items ?? []) {
        const it = ITEM_BY_ID[placed.id];
        if (!it) continue;
        const L = this.cellCentre(room, placed.gx, placed.gz, it, placed.rot);
        const w = this.local(L.x, L.z);
        const y = this.groundY + (this.shell?.floorY[room.floor] ?? 0);
        const g = placeModel(it.model, drawItem(it.id, 2));
        g.position.set(w.x, y, w.z);
        g.rotation.y = this.ry + (placed.rot ?? 0) * (Math.PI / 2);
        this.itemGroup.add(g);
        if (it.act) this.spots.push({ x: w.x, z: w.z, y, r: 2.4, act: it.act, item: it.id, room: room.id });
      }
    }
    // the front door's own spot: owner's lock, everybody's knock
    if (this.doorWorld) {
      const d = this.local(0, (this.shell?.door.z ?? 6) + 1.6);
      this.spots.push({ x: d.x, z: d.z, y: this.groundY + (this.shell?.base ?? 0), r: 2.6, act: 'door' });
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

  _yardItem(it, P) {
    const g = new THREE.Group();
    g.position.set(P.x, P.y, P.z);
    g.rotation.y = this.ry + P.a + Math.PI;
    const add = (o) => { g.add(o); return o; };
    const mat = toonVertexMat();
    const flat = (parts) => add(new THREE.Mesh(mergeParts(parts), mat));
    const disc = (r, h, c, y = 0, seg = 24) => {
      const d = new THREE.CylinderGeometry(r, r, h, seg);
      paint(d, c);
      d.translate(0, y + h / 2, 0);
      return d;
    };
    switch (it.id) {
      case 'koipond': {
        flat([disc(P.r - 0.6, 0.25, 0x9a948a), disc(P.r - 1.3, 0.28, 0x2f6f9a, 0.02)]);
        // lily pads
        const pads = [];
        for (let k = 0; k < 6; k++) pads.push(disc(0.6, 0.06, 0x4a8a3a, 0.31, 8).translate(Math.cos(k * 2.1) * (P.r - 2.8), 0, Math.sin(k * 2.1) * (P.r - 2.8)));
        flat(pads);
        g.userData.pond = { r: P.r - 1.3 };
        this.spots.push({ x: P.x, z: P.z, y: P.y, r: P.r + 1, act: 'koi', item: it.id, plot: P.id });
        break;
      }
      case 'onsen': {
        flat([disc(P.r - 0.5, 0.6, 0x7d7870), disc(P.r - 1.2, 0.62, 0x8fd0d8, 0.02)]);
        for (let k = 0; k < 8; k++) {
          const s = new THREE.DodecahedronGeometry(0.8, 0);
          paint(s, 0x6a655e);
          s.translate(Math.cos(k * 0.8) * (P.r - 0.4), 0.5, Math.sin(k * 0.8) * (P.r - 0.4));
          flat([s]);
        }
        this.spots.push({ x: P.x, z: P.z, y: P.y, r: P.r, act: 'soak', item: it.id, plot: P.id });
        break;
      }
      case 'volleyball': {
        const sand = new THREE.BoxGeometry(P.r * 1.6, 0.12, P.r * 1.0);
        paint(sand, 0xead7a0);
        sand.translate(0, 0.06, 0);
        const net = new THREE.BoxGeometry(0.08, 1.2, P.r);
        paint(net, 0xffffff);
        net.translate(0, 2.2, 0);
        const p1 = new THREE.BoxGeometry(0.2, 3, 0.2); paint(p1, 0x444444); p1.translate(0, 1.5, P.r / 2);
        const p2 = new THREE.BoxGeometry(0.2, 3, 0.2); paint(p2, 0x444444); p2.translate(0, 1.5, -P.r / 2);
        flat([sand, net, p1, p2]);
        this.spots.push({ x: P.x, z: P.z, y: P.y, r: P.r, act: 'volley', item: it.id, plot: P.id });
        break;
      }
      case 'bamboofarm': {
        const soil = new THREE.CylinderGeometry(P.r - 0.6, P.r - 0.6, 0.15, 20);
        paint(soil, 0x6a4a2a);
        soil.translate(0, 0.08, 0);
        flat([soil]);
        g.userData.farm = { r: P.r - 1 };
        this.spots.push({ x: P.x, z: P.z, y: P.y, r: P.r, act: 'harvest', item: it.id, plot: P.id });
        break;
      }
      case 'pen': {
        const posts = [];
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          const b = new THREE.BoxGeometry(0.2, 1.2, 0.2);
          paint(b, PALETTE.wood);
          b.translate(Math.cos(a) * (P.r - 0.6), 0.6, Math.sin(a) * (P.r - 0.6));
          posts.push(b);
        }
        const rail = new THREE.TorusGeometry(P.r - 0.6, 0.08, 4, 32);
        paint(rail, PALETTE.woodDark);
        rail.rotateX(Math.PI / 2);
        rail.translate(0, 1.0, 0);
        const trough = new THREE.BoxGeometry(2, 0.5, 0.8);
        paint(trough, PALETTE.woodDark);
        trough.translate(0, 0.25, P.r - 2);
        flat([...posts, rail, trough]);
        g.userData.pen = { r: P.r - 1.5 };
        this.spots.push({ x: P.x, z: P.z, y: P.y, r: P.r, act: 'animals', item: it.id, plot: P.id });
        break;
      }
      case 'bladeforest': break;
      default: {
        const m = placeModel(it.model, drawItem(it.id, 2));
        add(m);
        if (it.act) this.spots.push({ x: P.x, z: P.z, y: P.y, r: P.r * 0.7, act: it.act, item: it.id, plot: P.id });
        const solid = { treehouse: 1.2, teahouse: 2.4, belltower: 1.8, well: 1.1, shrine: 2.2, maple: 0.5, cherry: 0.5, pine: 0.5, waterwheel: 1.2 }[it.id];
        if (solid) this.obstacles.push({ x: P.x, z: P.z, r: solid });
      }
    }
    g.userData.plot = P.id;
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
      const floor = new THREE.CylinderGeometry(Math.min(room.w, room.d) / 2 - 1, Math.min(room.w, room.d) / 2 - 1, 0.1, 6);
      paint(floor, 0x1a2a3a);
      floor.translate(0, 0.1, 0);
      const pod = new THREE.CylinderGeometry(1.1, 1.3, 3.2, 12, 1, true);
      paint(pod, 0x7fe6ff);
      pod.translate(0, 1.7, 0);
      g.add(new THREE.Mesh(floor, toonVertexMat()));
      const podM = new THREE.Mesh(pod, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
      g.add(podM);
      this.spots.push({ x: c.x, z: c.z, y, r: 2.4, act: 'holodeck', room: room.id });
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
        if (L.x < d.x0 || L.x > d.x1 || L.z < d.z0 || L.z > d.z1) continue;
        const py = this.groundY + (d.yAt ? d.yAt(L.x, L.z) : d.y);
        if (fromY + (d.step ?? 0.4) < py) continue;
        if (!best || py > best.y) best = { y: py, island: this.island, home: this, deck: d };
      }
    }
    return best;
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
