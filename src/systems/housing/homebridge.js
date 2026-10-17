import * as THREE from 'three';
import { toonVertexMat, paint } from '../../core/gfx.js';
import { buildTorii, mergeParts, transformParts, PALETTE } from '../../world/build.js';
import { makeLabelTexture } from '../../core/label.js';
import {
  SNAKE, SnakeRoad, findLandings, windRoadSteps, buildRoadMesh, toriiScale, cloudPuff, buildSnakeHead, dissolveMat,
} from '../../world/snakeway.js';
import { DRAGON_SPOTS } from '../../entities/dragon.js';
import { SPEED_STRIP, ITEM_BY_ID } from './catalog.js';
import { drawStatue, loadGenerated, tintGenerated } from './statue.js';
import { drawItem, placeModel } from './models.js';

/** Seconds for the grand doors to swing all the way. */
export const DOOR_SWING = 1.6;

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
    this.roadMesh = new THREE.Mesh(built.geometry, toonVertexMat());
    this.roadMesh.frustumCulled = false;
    this.perSeg = built.perSeg;
    this.segs = built.segs;
    this.caps = built.caps;
    this.group.add(this.roadMesh);

    // the snake's head at her island's end, looking back down the road
    const head = buildSnakeHead(this.road.id);
    const e = this.end;
    const ehl = Math.hypot(e.tx, e.tz) || 1;
    const side = SNAKE.halfW + 4.5;
    transformParts(head, e.x + (-e.tz / ehl) * side, e.y - 0.4, e.z + (e.tx / ehl) * side, Math.atan2(-e.tx, -e.tz));
    this.headGeo = mergeParts(head);
    this.headColours = this.headGeo.attributes.color.array.slice();
    this.headMesh = new THREE.Mesh(this.headGeo, toonVertexMat());
    this.group.add(this.headMesh);

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
    this.gates = [this._grandGate(s, 1, 0.6)];
    this.openK = 1;
    this.openWant = 1;

    // the name over the gate, set by `setOwner`
    this.namePlate = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    this.namePlate.position.set(s.x, this.gateTop + 1.6, s.z);
    this.namePlate.rotation.y = ry;
    this.group.add(this.namePlate);

    // the statue — left of the gate as you walk out of town
    const st = drawStatue();
    this.statue = st.group;
    this.statueAccent = st.accentMat;
    const sx = s.x - this.rx * (SNAKE.halfW + 4.5) - this.fx * 3;
    const sz = s.z - this.rz * (SNAKE.halfW + 4.5) - this.fz * 3;
    this.statueSpot = { x: sx, z: sz };
    this.statue.position.set(sx, s.y - 0.5, sz);
    /* FACING THE TOWN, toward whoever walks up to her gate. MEASURED, not
       reasoned: `ry + PI` was the first guess and the purchase scene filmed
       the back of her head. The drawn statue's front (paws, katana) is local
       +z, and `ry` turns that to face back along the road into town. */
    this.statue.rotation.y = Math.atan2(-this.fx, -this.fz);
    this.group.add(this.statue);

    // the jukebox — a boombox on a barrel with a surfboard leaning on it, right of the gate
    const jx = s.x + this.rx * (SNAKE.halfW + 4) - this.fx * 3;
    const jz = s.z + this.rz * (SNAKE.halfW + 4) - this.fz * 3;
    this.jukeboxSpot = { x: jx, z: jz, y: s.y - 0.45 };
    const jb = new THREE.Group();
    jb.position.set(jx, s.y - 0.45, jz);
    jb.rotation.y = ry + Math.PI;
    jb.add(placeModel('komodaru-sake-barrel-c5199a', drawItem('sake')));
    const barrelScale = 2.2;
    jb.children[0].scale.setScalar(barrelScale);
    jb.add(drawBoombox(barrelScale));
    jb.add(drawSurfboard());
    this.jukebox = jb;
    this.group.add(jb);
    this.jukeboxSpots = [this.jukeboxSpot];
    this._dress(s, -1);

    /* THE ISLAND END, dressed the same: a torii and the doors over the road
       where it lands, her statue left and the jukebox right as she walks onto
       her island — "a jukebox and a door at both ends; the player's statue on
       her island". Everything here stands on her island past the landing
       (`+t`), because back along the road from the landing is sky. Hidden
       until the road has grown all the way (`setGrow`), so the purchase scene
       does not show the far end finished before the bridge reaches it. */
    this.endGroup = new THREE.Group();
    const eT = Math.hypot(e.tx, e.tz) || 1;
    const etx = e.tx / eT, etz = e.tz / eT;
    const erx = -etz, erz = etx;
    const ery = Math.atan2(-etx, -etz);
    const gy = (x, z) => this.isle.island?.heightAt?.(x, z) ?? (e.y - 0.45);
    const endGate = transformParts(buildTorii(ts), e.x + etx * 1.5, e.y - 0.45, e.z + etz * 1.5, ery);
    this.endGate = new THREE.Mesh(mergeParts(endGate), toonVertexMat());
    this.endGroup.add(this.endGate);
    this.gates.push(this._grandGate({ x: e.x + etx * 1.5, y: e.y, z: e.z + etz * 1.5 }, 1, 0.6, { fx: etx, fz: etz, rx: erx, rz: erz, ry: ery }, this.endGroup));
    const st2 = drawStatue();
    this.statue2 = st2.group;
    this.statueAccent2 = st2.accentMat;
    const s2x = e.x - erx * (SNAKE.halfW + 4.5) + etx * 6;
    const s2z = e.z - erz * (SNAKE.halfW + 4.5) + etz * 6;
    this.statue2.position.set(s2x, gy(s2x, s2z) - 0.1, s2z);
    this.statue2.rotation.y = ery;
    this.endGroup.add(this.statue2);
    const j2x = e.x + erx * (SNAKE.halfW + 4) + etx * 9;
    const j2z = e.z + erz * (SNAKE.halfW + 4) + etz * 9;
    const jb2 = jb.clone(true);
    jb2.position.set(j2x, gy(j2x, j2z), j2z);
    jb2.rotation.y = ery + Math.PI;
    this.endGroup.add(jb2);
    this.jukeboxSpots.push({ x: j2x, z: j2z, y: gy(j2x, j2z) });
    this._dress({ x: e.x + etx * 1.5, y: e.y, z: e.z + etz * 1.5 }, 1, { fx: etx, fz: etz, rx: erx, rz: erz }, this.endGroup, gy);
    this.group.add(this.endGroup);

    scene.add(this.group);
    this.setGrow(this.grow);
  }

  /**
   * One pair of grand doors and the field between them, across the road at
   * `at`. `F` is the road's frame there (forward, right, the torii's yaw).
   */
  _grandGate(at, _unused, ahead, F = null, parent = this.group) {
    const fx = F?.fx ?? this.fx, fz = F?.fz ?? this.fz, rx = F?.rx ?? this.rx, rz = F?.rz ?? this.rz;
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
    // the field: a shimmering sheet in her colour, up only while they are shut
    const fieldMat = new THREE.MeshBasicMaterial({
      color: this.colour, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, toneMapped: false,
    });
    this.accentMats.push(fieldMat);
    const field = new THREE.Mesh(new THREE.PlaneGeometry(doorW + 1.2, H + 1.4, 1, 6), fieldMat);
    field.position.set(cx + fx * 0.5, at.y + H / 2, cz + fz * 0.5);
    field.rotation.y = ry;
    field.visible = false;
    parent.add(field);
    return { leaves, field, fieldMat, cx, cz, rx, rz, fx, fz, y: at.y, doorW };
  }

  /**
   * DRESSED ENTRANCES: a stone lantern either side of the gate and a pair of
   * nobori banners in her colour. `side` -1 dresses toward town (behind the
   * start gate), 1 toward her island.
   */
  _dress(at, side, F = null, parent = this.group, gy = null) {
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
      // the banner: a pole and a tall cloth in her colour, facing the road
      const bx = at.x + rx * sg * (off + 1.6) + fx * side * 4.2;
      const bz = at.z + rz * sg * (off + 1.6) + fz * side * 4.2;
      const by = gy ? gy(bx, bz) : at.y - 0.45;
      const pole = new THREE.CylinderGeometry(0.08, 0.08, 5.6, 6);
      paint(pole, 0x3a2a22);
      pole.translate(0, 2.8, 0);
      const poleMesh = new THREE.Mesh(pole, toonVertexMat());
      poleMesh.position.set(bx, by, bz);
      parent.add(poleMesh);
      const cloth = new THREE.PlaneGeometry(0.9, 3.4);
      cloth.translate(0.5, 3.6, 0);
      const clothMat = new THREE.MeshLambertMaterial({ color: this.colour, side: THREE.DoubleSide });
      this.accentMats.push(clothMat);
      const clothMesh = new THREE.Mesh(cloth, clothMat);
      clothMesh.position.set(bx, by, bz);
      clothMesh.rotation.y = Math.atan2(rx * sg, rz * sg);
      parent.add(clothMesh);
    }
  }

  /** The doors swing to `openWant`; the field rises as they shut. */
  update(dt, time = 0) {
    if (!this.gates) return;
    const k = this.openK + Math.sign(this.openWant - this.openK) * Math.min(Math.abs(this.openWant - this.openK), dt / DOOR_SWING);
    this.openK = k;
    const e = k * k * (3 - 2 * k);
    for (const G of this.gates) {
      for (const h of G.leaves) h.rotation.y = h.userData.ry + h.userData.sg * (Math.PI / 2 - 0.15) * e;
      const shut = 1 - e;
      G.field.visible = shut > 0.02;
      G.fieldMat.opacity = shut * (0.22 + 0.1 * Math.sin(time * 3.1)) ;
    }
  }

  /** Put this bridge in `colour` with `name` over the gate. */
  setOwner(name, colour, sheet) {
    this.colour = colour;
    if (!this._built) return;
    const pos = this.roadMesh.geometry.attributes.color;
    pos.array.set(this.baseColours);
    tintGeometry(this.roadMesh.geometry, colour);
    this.headGeo.attributes.color.array.set(this.headColours);
    tintGeometry(this.headGeo, colour);
    this.stripMat.color.set(colour).lerp(new THREE.Color(0xffffff), 0.5);
    this.statueAccent.color.set(colour);
    this.statueAccent2?.color.set(colour);
    for (const m of this.accentMats ?? []) m.color.set(colour);
    const label = `${String(name).toUpperCase()}'S ISLAND`;
    const css = `#${new THREE.Color(colour).getHexString()}`;
    const { texture, aspect } = makeLabelTexture(label, { size: 72, color: css, stroke: '#1d1216', strokeWidth: 9 });
    this.namePlate.material.map = texture;
    this.namePlate.material.needsUpdate = true;
    this.namePlate.scale.set(1.5 * aspect, 1.5, 1);
    // the generated statue, if there is one on disk — recoloured to her
    if (sheet && this._statueSheet !== sheet) {
      this._statueSheet = sheet;
      loadGenerated(sheet).then((g) => {
        if (!g || this._statueSheet !== sheet) return;
        if (this.genStatue) this.statue.remove(this.genStatue);
        this.genStatue = g.root;
        this.genMats = g.mats;
        for (const c of this.statue.children) c.visible = false;
        this.statue.add(g.root);
        tintGenerated(g.mats, this.colour, 1);
      });
      // ...and the one on her island, its own clone so it wears its own tint
      if (this.statue2) {
        loadGenerated(sheet).then((g) => {
          if (!g || this._statueSheet !== sheet) return;
          if (this.genStatue2) this.statue2.remove(this.genStatue2);
          this.genStatue2 = g.root;
          this.genMats2 = g.mats;
          for (const c of this.statue2.children) c.visible = false;
          this.statue2.add(g.root);
          tintGenerated(g.mats, this.colour, 1);
        });
      }
    } else {
      if (this.genMats) tintGenerated(this.genMats, colour, 1);
      if (this.genMats2) tintGenerated(this.genMats2, colour, 1);
    }
  }

  /** How much of the road is drawn: the deck grows from the town out. */
  setGrow(k) {
    this.grow = k;
    if (this.endGroup) this.endGroup.visible = k >= 1;
    if (!this.roadMesh) return;
    const segs = Math.round(this.segs * Math.max(0, Math.min(1, k)));
    this.roadMesh.geometry.setDrawRange(0, k >= 1 ? Infinity : segs * this.perSeg);
    this.headMesh.visible = k >= 1;
    if (this.strip) this.strip.visible = k >= 1;
  }

  /** Locked: the grand doors swing shut and the field comes up (`update`).
   *  `snap` puts them there now — a load, not a press. */
  setLocked(locked, snap = false) {
    this.openWant = locked ? 0 : 1;
    if (snap) { this.openK = this.openWant; this.update(0); }
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

/** Roshi's 90s boombox, sitting on the barrel. PLACEHOLDER art (drawn). */
function drawBoombox(barrelScale) {
  const top = 0.47 * barrelScale;
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
  g.translate(1.6, 2.0, -0.3);
  return new THREE.Mesh(g, toonVertexMat());
}
