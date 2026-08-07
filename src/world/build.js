import * as THREE from 'three';
import { paint, paintBy } from '../core/gfx.js';

/* ---------------------------------------------------------------------------
   Geometry builders for the world. Everything here returns geometry painted
   with vertex colours so it can be merged into a handful of draw calls later.
--------------------------------------------------------------------------- */

export const PALETTE = {
  // Pulled toward the key art: sage/olive greens and warm tan rock rather
  // than the saturated primary green a default hue lands on.
  grass: 0x86b352,
  grassDark: 0x4f7d38,
  grassWarm: 0xa8c25c,
  rock: 0xb99a6f,
  rockDark: 0x6d5a4c,
  dirt: 0xbe9a68,
  sand: 0xe8d29b,
  wood: 0x8c5a37,
  woodDark: 0x5e3a24,
  plaster: 0xf2e6d0,
  tileIndigo: 0x37477d,
  tileRed: 0x8f3038,
  tileGreen: 0x3d6b57,
  vermillion: 0xd9502f,
  blossom: 0xffb3ce,
  blossomDeep: 0xf58bb4,
  stone: 0x9a9490,
  gold: 0xe8b93f,
  paper: 0xfff2d4,
};

/* ------------------------------- noise ----------------------------------- */

function hash2(x, y, seed) {
  let h = x * 374761393 + y * 668265263 + seed * 1442695041;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

export function valueNoise(x, y, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = smooth(xf);
  const v = smooth(yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

export function fbm(x, y, seed = 0, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq, seed + i * 71) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

export function smoothstep(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/* ------------------------------- island ---------------------------------- */

/**
 * A floating island: a rolling grass top that falls away to a rim, and a
 * craggy rock underside tapering to a point. Height is queryable analytically
 * so the players collide with the exact surface the mesh was built from.
 */
/**
 * Ground palettes. Every island picks one, and it's the single biggest lever
 * on "somewhere else" — from the air you should be able to tell the bamboo
 * island from the ember island without flying to either.
 */
export const BIOMES = {
  meadow: {
    name: 'Meadow', grass: 0x86b352, grassDark: 0x4f7d38, grassWarm: 0xa8c25c,
    rock: 0xb99a6f, rockDark: 0x6d5a4c, dirt: 0xbe9a68, map: 0x86b352,
  },
  bamboo: {
    name: 'Bamboo', grass: 0x6fae52, grassDark: 0x35633c, grassWarm: 0x9fd06a,
    rock: 0x8d9c78, rockDark: 0x4d5942, dirt: 0x9db06a, map: 0x6fae52,
  },
  autumn: {
    name: 'Autumn', grass: 0xd08a3c, grassDark: 0x8f4a22, grassWarm: 0xf0b455,
    rock: 0xa8724a, rockDark: 0x5e3826, dirt: 0xc98d4e, map: 0xd08a3c,
  },
  ash: {
    name: 'Ash', grass: 0x6b5f6e, grassDark: 0x3d3444, grassWarm: 0x8b7a86,
    rock: 0x7a6a68, rockDark: 0x3a3030, dirt: 0x7d6a63, map: 0x6b5f6e,
  },
  frost: {
    name: 'Frost', grass: 0xd8ecf5, grassDark: 0x8fb4c8, grassWarm: 0xf2fbff,
    rock: 0x9fb0bd, rockDark: 0x54646f, dirt: 0xbcd0da, map: 0xd8ecf5,
  },
  dusk: {
    name: 'Dusk', grass: 0x7a6ea8, grassDark: 0x453c66, grassWarm: 0xa294cc,
    rock: 0x8a7a9c, rockDark: 0x453a58, dirt: 0x9384ad, map: 0x7a6ea8,
  },
};

export class Island {
  constructor(opts) {
    const {
      x = 0, z = 0, baseY = 0, radius = 60, seed = 1,
      hill = 4.5, plateau = 0.5, flatten = null, biome = 'meadow',
    } = opts;

    this.biome = BIOMES[biome] ? biome : 'meadow';
    this.palette = BIOMES[this.biome];
    this.x = x;
    this.z = z;
    this.baseY = baseY;
    this.radius = radius;
    this.seed = seed;
    this.hill = hill;
    this.plateau = plateau;
    /** [{x, z, r, falloff}] — regions forced flat, e.g. the town plaza */
    this.flatten = flatten || [];
    this.mesh = null;
  }

  /** Height above baseY at a world position, or null if off the island. */
  localHeight(wx, wz) {
    const dx = wx - this.x;
    const dz = wz - this.z;
    const r = Math.hypot(dx, dz) / this.radius;
    if (r >= 1) return null;

    // Rim falloff — flat in the middle, curving down to zero at the edge.
    const rim = 1 - smoothstep(this.plateau, 1.0, r);
    const n = fbm(dx * 0.022, dz * 0.022, this.seed, 4);
    let h = rim * (this.hill * n + this.hill * 0.35);

    // Force chosen regions flat so the town has buildable ground.
    for (const f of this.flatten) {
      const d = Math.hypot(wx - f.x, wz - f.z);
      const k = 1 - smoothstep(f.r, f.r + (f.falloff ?? 12), d);
      if (k > 0) h = h * (1 - k) + (f.y ?? this.hill * 0.5) * k;
    }
    return h;
  }

  heightAt(wx, wz) {
    const h = this.localHeight(wx, wz);
    return h == null ? null : this.baseY + h;
  }

  /** Surface normal via finite differences — used to tilt props and slide. */
  normalAt(wx, wz) {
    const e = 0.6;
    const hL = this.localHeight(wx - e, wz) ?? 0;
    const hR = this.localHeight(wx + e, wz) ?? 0;
    const hD = this.localHeight(wx, wz - e) ?? 0;
    const hU = this.localHeight(wx, wz + e) ?? 0;
    return new THREE.Vector3(hL - hR, 2 * e, hD - hU).normalize();
  }

  buildMesh(rings = 22, segments = 56) {
    const positions = [];
    const indices = [];
    const grid = [];

    // --- top surface (polar grid) ---
    for (let i = 0; i <= rings; i++) {
      const row = [];
      const rr = (i / rings) * this.radius * 0.999;
      for (let j = 0; j < segments; j++) {
        const a = (j / segments) * Math.PI * 2;
        // Wobble the outline so islands aren't perfect circles.
        const wob = 1 + (fbm(Math.cos(a) * 2 + 9, Math.sin(a) * 2 + 4, this.seed, 3) - 0.5) * 0.22;
        const r = rr * (i === 0 ? 1 : wob);
        const px = Math.cos(a) * r;
        const pz = Math.sin(a) * r;
        const py = this.localHeight(this.x + px, this.z + pz) ?? 0;
        row.push(positions.length / 3);
        positions.push(px, py, pz);
      }
      grid.push(row);
    }

    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < segments; j++) {
        const j2 = (j + 1) % segments;
        const a = grid[i][j];
        const b2 = grid[i][j2];
        const c = grid[i + 1][j];
        const d = grid[i + 1][j2];
        if (i === 0) {
          indices.push(a, d, c);
        } else {
          indices.push(a, d, c, a, b2, d);
        }
      }
    }

    // --- underside: rim ring pulled down and inward to a craggy point ---
    const underRings = 7;
    const depth = this.radius * (0.85 + fbm(this.seed, 3, 7) * 0.5);
    let prev = grid[rings];
    for (let k = 1; k <= underRings; k++) {
      const t = k / underRings;
      const shrink = Math.pow(1 - t, 0.62);
      const drop = depth * Math.pow(t, 0.85);
      const row = [];
      for (let j = 0; j < segments; j++) {
        const bx = positions[grid[rings][j] * 3];
        const bz = positions[grid[rings][j] * 3 + 2];
        const crag = (fbm(bx * 0.05, bz * 0.05 + t * 4, this.seed + 33, 3) - 0.5) * this.radius * 0.14 * (1 - t);
        const px = bx * shrink + crag;
        const pz = bz * shrink + crag;
        const py = (positions[grid[rings][j] * 3 + 1]) - drop;
        row.push(positions.length / 3);
        positions.push(px, k === underRings ? 0 : py, pz);
      }
      if (k === underRings) {
        // collapse the last ring to a single tip
        let sx = 0;
        let sy = 0;
        let sz = 0;
        for (let j = 0; j < segments; j++) {
          sx += positions[row[j] * 3];
          sy += positions[grid[rings][j] * 3 + 1] - depth * 1.05;
          sz += positions[row[j] * 3 + 2];
        }
        const tip = positions.length / 3;
        positions.push(sx / segments, sy / segments, sz / segments);
        for (let j = 0; j < segments; j++) {
          const j2 = (j + 1) % segments;
          indices.push(prev[j], tip, prev[j2]);
        }
        break;
      }
      for (let j = 0; j < segments; j++) {
        const j2 = (j + 1) % segments;
        indices.push(prev[j], row[j2], row[j], prev[j], prev[j2], row[j2]);
      }
      prev = row;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const B = this.palette;
    const grass = new THREE.Color(B.grass);
    const grassDark = new THREE.Color(B.grassDark);
    const grassWarm = new THREE.Color(B.grassWarm);
    const rock = new THREE.Color(B.rock);
    const rockDark = new THREE.Color(B.rockDark);
    const dirt = new THREE.Color(B.dirt);

    paintBy(geo, (p, n, c) => {
      if (p.y < -0.4) {
        // underside rock: strata banding, darkening with depth
        const t = smoothstep(0, -depth, p.y);
        c.copy(rock).lerp(rockDark, t * 0.92);
        const band = Math.sin(p.y * 0.55 + fbm(p.x * 0.05, p.z * 0.05, this.seed + 8, 2) * 4);
        const speck = fbm(p.x * 0.18, p.z * 0.18, this.seed + 5, 2);
        c.offsetHSL(0, 0, band * 0.035 + (speck - 0.5) * 0.08);
      } else if (n.y < 0.74) {
        // cliff faces and steep banks
        const t = smoothstep(0.74, 0.4, n.y);
        c.copy(dirt).lerp(rock, 0.35 + t * 0.4);
      } else {
        // Two noise scales: broad meadow patches, plus fine mottling. One
        // octave alone reads as a single flat sheet of green from the air.
        const broad = fbm(p.x * 0.018, p.z * 0.018, this.seed + 12, 2);
        const fine = fbm(p.x * 0.11, p.z * 0.11, this.seed + 31, 3);
        c.copy(grassDark).lerp(grass, 0.25 + broad * 0.85);
        c.lerp(grassWarm, Math.max(0, fine - 0.55) * 0.9);
        c.offsetHSL(0, (fine - 0.5) * 0.05, (fine - 0.5) * 0.07);
        // dust the grass toward rock as it approaches a cliff edge
        c.lerp(dirt, smoothstep(0.88, 0.75, n.y) * 0.5);
      }
    });

    geo.translate(this.x, this.baseY, this.z);
    this.geometry = geo;
    return geo;
  }
}

/* ------------------------------ structures -------------------------------- */

function squareRing(hw, hd, perSide = 5) {
  const pts = [];
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i < perSide; i++) {
      const t = i / perSide;
      let x;
      let z;
      if (side === 0) { x = -hw + 2 * hw * t; z = -hd; }
      else if (side === 1) { x = hw; z = -hd + 2 * hd * t; }
      else if (side === 2) { x = hw - 2 * hw * t; z = hd; }
      else { x = -hw; z = hd - 2 * hd * t; }
      // 1 at the corners, 0 at the middle of each edge
      const cx = Math.abs(x) / (hw || 1);
      const cz = Math.abs(z) / (hd || 1);
      pts.push({ x, z, corner: Math.pow(Math.min(cx, cz), 2) });
    }
  }
  return pts;
}

/**
 * Pagoda roof: shallow at the flared eaves, steep near the ridge, corners
 * kicked up. This single shape does most of the work of selling "Japan".
 */
export function pagodaRoof(hw, hd, height, opts = {}) {
  const { overhang = 0.45, cornerLift = 0.55, rings = 6, perSide = 6 } = opts;
  const positions = [];
  const indices = [];
  const rows = [];

  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const scale = 1 - t;
    const y = height * Math.pow(t, 1.75);
    const ring = squareRing(
      Math.max(0.001, hw * (1 + overhang) * scale),
      Math.max(0.001, hd * (1 + overhang) * scale),
      perSide
    );
    const row = [];
    for (const p of ring) {
      row.push(positions.length / 3);
      positions.push(p.x, y + cornerLift * p.corner * Math.pow(1 - t, 2.2), p.z);
    }
    rows.push(row);
  }

  /* Wound so the faces point UP and OUT.
     squareRing walks its outline in the order that, lofted this way, produces
     downward-facing normals — which meant the whole roof was backface-culled
     from above and every rooftop in the game was actually the plaster wall top
     showing through, fighting for depth with the roof's underside. */
  const n = rows[0].length;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < n; j++) {
      const j2 = (j + 1) % n;
      indices.push(rows[i][j], rows[i + 1][j2], rows[i][j2]);
      indices.push(rows[i][j], rows[i + 1][j], rows[i + 1][j2]);
    }
  }
  // apex cap
  const apex = positions.length / 3;
  positions.push(0, height + 0.02, 0);
  for (let j = 0; j < n; j++) {
    const j2 = (j + 1) % n;
    indices.push(rows[rings][j], apex, rows[rings][j2]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function box(w, h, d, color, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  paint(g, color);
  g.applyMatrix4(
    new THREE.Matrix4().makeTranslation(x, y, z)
      .multiply(new THREE.Matrix4().makeRotationY(ry))
  );
  return g;
}

function cyl(rt, rb, h, color, x = 0, y = 0, z = 0, seg = 10) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  paint(g, color);
  g.translate(x, y, z);
  return g;
}

/**
 * A townhouse: plaster walls on a wooden frame, a pagoda roof, and a
 * paper-lantern glow over the door.
 */
export function buildHouse(opts = {}) {
  const { w = 6, d = 5, floors = 1, tile = PALETTE.tileIndigo } = opts;
  const parts = [];
  const floorH = 3.2;
  let y = 0;

  for (let f = 0; f < floors; f++) {
    const shrink = 1 - f * 0.12;
    const hw = (w / 2) * shrink;
    const hd = (d / 2) * shrink;

    /* Every stacked piece here gets a DIFFERENT top height on purpose.
       The wall, the four corner posts and the sill beam all used to end at
       exactly y + floorH — three coplanar top faces fighting for the same
       depth, which is the shimmer across the rooftops. They only need to
       overlap, not line up, so each is pulled down by a different amount. */
    const wallTop = y + floorH;

    parts.push(box(hw * 2, floorH, hd * 2, PALETTE.plaster, 0, y + floorH / 2, 0));

    // corner posts + sill beam — the dark timber that reads as Japanese framing
    const postH = floorH - 0.18;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        parts.push(box(0.34, postH, 0.34, PALETTE.woodDark, sx * hw, y + postH / 2, sz * hd));
      }
    }
    parts.push(box(hw * 2 + 0.2, 0.3, hd * 2 + 0.2, PALETTE.woodDark, 0, wallTop - 0.3, 0));

    if (f === 0) {
      // shoji door
      parts.push(box(1.7, 2.2, 0.14, PALETTE.paper, 0, 1.1, hd + 0.04));
      parts.push(box(1.9, 0.2, 0.2, PALETTE.woodDark, 0, 2.25, hd + 0.04));
      parts.push(box(0.14, 2.2, 0.18, PALETTE.woodDark, 0, 1.1, hd + 0.07));
      // side window
      parts.push(box(0.16, 1.2, 1.6, PALETTE.paper, hw + 0.02, 1.9, 0));
    } else {
      parts.push(box(1.4, 1.1, 0.14, PALETTE.paper, 0, y + 1.7, hd + 0.04));
    }

    const roof = pagodaRoof(hw, hd, 1.9, { overhang: 0.5, cornerLift: 0.6 });
    const roofColor = new THREE.Color(tile);
    paintBy(roof, (p, nn, c) => {
      // subtle gradient so the big roof planes aren't dead flat
      c.copy(roofColor).offsetHSL(0, 0, (p.y / 2.4) * 0.16 - 0.04);
    });
    /* Roof height is set from where the roof SURFACE passes over the wall,
       not from where its base ring sits.
       The base ring is out at hw*(1+overhang), and the surface climbs as
       y = 1.9 * t^1.75 while the ring shrinks linearly — so directly above the
       wall edge (radius hw, i.e. t = 1/3) the roof is only ~0.30 above its
       base. Dropping the base a flat 0.28 to "sink it into the walls" left
       0.02 of clearance there, which is coplanar for all practical purposes
       and punched the white wall top straight through the tiles. 0.10 leaves
       a solid 0.20 over the wall while the eaves still tuck under the top. */
    roof.translate(0, wallTop - 0.10, 0);
    parts.push(roof);

    y += floorH * 0.86;
  }

  return parts;
}

export function buildTorii(scale = 1) {
  const parts = [];
  const h = 6 * scale;
  const w = 4.4 * scale;
  const r = 0.34 * scale;
  parts.push(cyl(r * 0.85, r, h, PALETTE.vermillion, -w / 2, h / 2, 0));
  parts.push(cyl(r * 0.85, r, h, PALETTE.vermillion, w / 2, h / 2, 0));
  // nuki (lower beam)
  parts.push(box(w + 1.1 * scale, 0.42 * scale, 0.52 * scale, PALETTE.vermillion, 0, h * 0.76, 0));
  // kasagi (top beam) with a slight upward sweep, faked with two stacked bars
  parts.push(box(w + 2.1 * scale, 0.44 * scale, 0.72 * scale, PALETTE.vermillion, 0, h + 0.2 * scale, 0));
  parts.push(box(w + 2.5 * scale, 0.3 * scale, 0.86 * scale, 0x2a1a1e, 0, h + 0.52 * scale, 0));
  parts.push(box(0.4 * scale, 0.9 * scale, 0.4 * scale, PALETTE.vermillion, 0, h * 0.88, 0));
  return parts;
}

export function buildLantern(scale = 1) {
  const parts = [];
  parts.push(cyl(0.5 * scale, 0.62 * scale, 0.4 * scale, PALETTE.stone, 0, 0.2 * scale, 0, 8));
  parts.push(cyl(0.26 * scale, 0.3 * scale, 1.5 * scale, PALETTE.stone, 0, 1.15 * scale, 0, 8));
  parts.push(cyl(0.62 * scale, 0.52 * scale, 0.9 * scale, PALETTE.paper, 0, 2.35 * scale, 0, 8));
  const cap = pagodaRoof(0.62 * scale, 0.62 * scale, 0.6 * scale, { overhang: 0.5, cornerLift: 0.25, rings: 3, perSide: 3 });
  paint(cap, PALETTE.stone);
  // Overlapped into the paper shade, not balanced on it — see buildHouse.
  cap.translate(0, 2.72 * scale, 0);
  parts.push(cap);
  return parts;
}

/** Foliage palettes so a tree can belong to its island. */
export const FOLIAGE = {
  blossom: [PALETTE.blossom, PALETTE.blossomDeep],
  autumn: [0xf0a83c, 0xd4542a],
  frost: [0xe8f4ff, 0xb6d4e8],
  ash: [0x6a5f70, 0x413848],
  dusk: [0xa78fd8, 0x6f5aa0],
  pine: [0x4f8f4a, 0x2f6338],
};

export function buildTree(seed = 0, scale = 1, foliage = 'blossom') {
  const parts = [];
  const [leafA, leafB] = FOLIAGE[foliage] ?? FOLIAGE.blossom;
  const h = (4 + valueNoise(seed, 3, 11) * 2.4) * scale;
  const trunk = cyl(0.24 * scale, 0.46 * scale, h, PALETTE.woodDark, 0, h / 2, 0, 7);
  parts.push(trunk);
  // a few angled boughs
  const clusters = 4 + Math.floor(valueNoise(seed, 7, 4) * 3);
  for (let i = 0; i < clusters; i++) {
    const a = (i / clusters) * Math.PI * 2 + valueNoise(seed, i, 2) * 2;
    const rr = (1.1 + valueNoise(seed, i, 9) * 1.3) * scale;
    const cx = Math.cos(a) * rr;
    const cz = Math.sin(a) * rr;
    const cy = h + (valueNoise(seed, i, 13) - 0.3) * 1.4 * scale;
    const blob = new THREE.IcosahedronGeometry((1.5 + valueNoise(seed, i, 21) * 0.9) * scale, 0);
    const c = new THREE.Color(leafA).lerp(
      new THREE.Color(leafB),
      valueNoise(seed, i, 31)
    );
    paint(blob, c.getHex());
    blob.translate(cx, cy, cz);
    parts.push(blob);
  }
  return parts;
}

/**
 * A stand of bamboo — several tall segmented canes from one root.
 *
 * Deliberately taller than a house and thin enough to read as a forest when
 * they're packed together. The grove is the one place a katana beats a dragon,
 * so it has to look obviously different from anything you can dive-bomb.
 */
export function buildBamboo(seed = 0, scale = 1) {
  const parts = [];
  const canes = 2 + Math.floor(valueNoise(seed, 5, 3) * 3);
  for (let c = 0; c < canes; c++) {
    const a = valueNoise(seed, c, 17) * Math.PI * 2;
    const off = valueNoise(seed, c, 23) * 0.7 * scale;
    const cx = Math.cos(a) * off;
    const cz = Math.sin(a) * off;
    const h = (7 + valueNoise(seed, c, 29) * 5) * scale;
    const r = (0.17 + valueNoise(seed, c, 31) * 0.07) * scale;
    const lean = (valueNoise(seed, c, 37) - 0.5) * 0.16;

    // Segments with a joint ring between each — that banding is what makes a
    // green cylinder read as bamboo.
    const segs = 4 + Math.floor(h / 2.6);
    for (let s = 0; s < segs; s++) {
      const y0 = (s / segs) * h;
      const sh = (h / segs) * 0.94;
      const taper = 1 - (s / segs) * 0.34;
      const g = new THREE.CylinderGeometry(r * taper * 0.94, r * taper, sh, 6);
      paint(g, s % 2 === 0 ? 0x7fae3f : 0x8fbe4a);
      g.translate(cx + lean * y0, y0 + sh / 2, cz + lean * y0 * 0.6);
      parts.push(g);

      const joint = new THREE.CylinderGeometry(r * taper * 1.16, r * taper * 1.16, 0.1 * scale, 6);
      paint(joint, 0x5f8a2c);
      joint.translate(cx + lean * y0, y0 + sh, cz + lean * y0 * 0.6);
      parts.push(joint);
    }

    // Leaf sprays near the top.
    for (let l = 0; l < 3; l++) {
      const la = a + l * 2.1;
      const ly = h * (0.66 + l * 0.11);
      const leaf = new THREE.IcosahedronGeometry((0.7 + valueNoise(seed, l, 41) * 0.5) * scale, 0);
      leaf.scale(1.5, 0.32, 0.8);
      paint(leaf, l % 2 ? 0x6fa337 : 0x87c04d);
      leaf.translate(
        cx + lean * ly + Math.cos(la) * 0.9 * scale,
        ly,
        cz + lean * ly * 0.6 + Math.sin(la) * 0.9 * scale
      );
      parts.push(leaf);
    }
  }
  return parts;
}

/**
 * A flat ribbon of road laid over the terrain.
 *
 * `pts` is a centre-line in world XZ; `height(x, z)` samples the ground. Each
 * span is two triangles sitting a hair above the surface, so the road follows
 * every slope instead of hovering. Widths taper per point so a street can open
 * into a plaza.
 */
export function buildRoad(pts, height, opts = {}) {
  /* `lift` only has to beat depth precision now, NOT the tessellation.
     A flat 0.32 cleared the ground everywhere but left the road visibly
     hovering, with the kitties wading through it up to the ankles. Instead
     each vertex takes the highest of a few nearby ground samples (see below),
     which lifts the road only where the terrain actually bulges. */
  const { color = PALETTE.dirt, lift = 0.05, steps = 8 } = opts;

  /* The island mesh is a polar grid roughly 4-5 units across, so between
     vertices its flat triangles are a CHORD of the real surface. In a dip the
     chord sits above the analytic height, and a road laid at the analytic
     height gets swallowed. Taking the max of a small ring of samples
     approximates that chord — no lift on flat ground, exactly enough in a
     hollow. */
  const surface = (x, z) => {
    let best = height(x, z);
    if (best == null) return null;
    for (const [dx, dz] of [[2.4, 0], [-2.4, 0], [0, 2.4], [0, -2.4]]) {
      const h = height(x + dx, z + dz);
      if (h != null && h > best) best = h;
    }
    return best;
  };
  const parts = [];

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    // Subdivide so the ribbon tracks curvature in the ground, not just at ends.
    for (let s = 0; s < steps; s++) {
      const t0 = s / steps;
      const t1 = (s + 1) / steps;
      const p0x = a.x + (b.x - a.x) * t0;
      const p0z = a.z + (b.z - a.z) * t0;
      const p1x = a.x + (b.x - a.x) * t1;
      const p1z = a.z + (b.z - a.z) * t1;
      const w0 = (a.w + (b.w - a.w) * t0) / 2;
      const w1 = (a.w + (b.w - a.w) * t1) / 2;

      const dx = p1x - p0x;
      const dz = p1z - p0z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;

      const corners = [
        [p0x - nx * w0, p0z - nz * w0],
        [p0x + nx * w0, p0z + nz * w0],
        [p1x + nx * w1, p1z + nz * w1],
        [p1x - nx * w1, p1z - nz * w1],
      ];
      const ys = corners.map(([x, z]) => surface(x, z));
      if (ys.some((y) => y == null)) continue;

      const pos = new Float32Array(12);
      corners.forEach(([x, z], k) => {
        pos[k * 3] = x;
        pos[k * 3 + 1] = ys[k] + lift;
        pos[k * 3 + 2] = z;
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      /* Wound to face UP. The corners run left-start, right-start, right-end,
         left-end, and the other winding gives every quad a downward normal —
         so the road was lit from below and came out a dark olive strip
         instead of pale sand. Same class of bug as the pagoda roofs. */
      g.setIndex([0, 1, 2, 0, 2, 3]);
      g.computeVertexNormals();
      // Mottle each patch a little so a long road isn't one dead flat slab.
      const n = valueNoise(p0x * 0.2, p0z * 0.2, 91);
      const c = new THREE.Color(color).offsetHSL(0, 0, (n - 0.5) * 0.09);
      paint(g, c.getHex());
      parts.push(g);
    }
  }
  return parts;
}

/**
 * A clan shrine: a stone platform, a ring of standing stones, and a pair of
 * pillars carrying a clan-coloured lintel.
 *
 * Built to be recognised from a long way off and from the air — the whole
 * point is that a kid spots a coloured shape on a far island and goes to find
 * out what it is. The animated parts (the hovering crystal, the pulsing ring,
 * the beam) are NOT here: they're live objects on the ClanShrine entity, since
 * this returns static geometry to be merged away.
 */
/**
 * The stepped stone dais a shrine stands on, as built below.
 *
 * Exported because the clan leader stands ON it. Planting her at the terrain
 * height under her feet — which is what you get from `world.heightAt`, since
 * the dais is decorative geometry and not a platform — buried her to the knee
 * in the top step. `y` is the height of the upper surface above the ground the
 * shrine was placed on, and `r` is how far out that surface reaches.
 */
export const SHRINE_DAIS = { r: 5.2, y: 0.885 };

export function buildShrine(color, seed = 0) {
  const parts = [];

  // Stepped stone dais — reads as "something was built here on purpose".
  parts.push(cyl(6.2, 6.8, 0.5, PALETTE.stone, 0, 0.25, 0, 12));
  parts.push(cyl(SHRINE_DAIS.r, 5.8, 0.45, 0xb0a89e, 0, 0.66, 0, 12));

  // A ring of standing stones around the rim.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const h = 1.1 + valueNoise(seed, i, 71) * 0.7;
    const g = new THREE.BoxGeometry(0.55, h, 0.55);
    paint(g, i % 2 ? PALETTE.stone : 0x8d857e);
    g.applyMatrix4(new THREE.Matrix4()
      .makeTranslation(Math.cos(a) * 5.4, 0.9 + h / 2, Math.sin(a) * 5.4)
      .multiply(new THREE.Matrix4().makeRotationY(a)));
    parts.push(g);
  }

  // Two pillars and a lintel, painted in the clan's colour: a gate you stand
  // under. Deliberately echoes the torii so it reads as sacred, not municipal.
  const H = 7.2;
  for (const sx of [-1, 1]) {
    parts.push(cyl(0.36, 0.46, H, PALETTE.stone, sx * 2.6, H / 2 + 0.9, 0, 8));
  }
  parts.push(box(7.2, 0.6, 0.9, color, 0, H + 1.1, 0));
  parts.push(box(6.0, 0.36, 1.1, 0x2a1a1e, 0, H + 1.5, 0));
  // Clan banner hanging from the lintel.
  parts.push(box(1.5, 2.6, 0.14, color, 0, H - 0.5, 0.2));

  return parts;
}

export function buildStall(seed = 0) {
  const parts = [];
  const w = 3.2;
  const d = 2.2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(box(0.18, 2.5, 0.18, PALETTE.woodDark, sx * w / 2, 1.25, sz * d / 2));
    }
  }
  parts.push(box(w + 0.5, 0.22, d + 0.6, valueNoise(seed, 1, 1) > 0.5 ? PALETTE.vermillion : PALETTE.tileIndigo, 0, 2.6, 0));
  parts.push(box(w, 0.2, d, PALETTE.wood, 0, 1.1, 0));
  // awning stripe
  parts.push(box(w + 0.5, 0.5, 0.12, PALETTE.paper, 0, 2.3, d / 2 + 0.34));
  return parts;
}

export function buildBridge(len = 14, wide = 3.4) {
  const parts = [];
  const segs = 10;
  const rise = 2.2;
  for (let i = 0; i < segs; i++) {
    const t = (i + 0.5) / segs;
    const y = Math.sin(t * Math.PI) * rise;
    const z = (t - 0.5) * len;
    parts.push(box(wide, 0.3, len / segs + 0.06, PALETTE.vermillion, 0, y, z));
    if (i % 3 === 0) {
      for (const sx of [-1, 1]) {
        parts.push(box(0.18, 1.1, 0.18, PALETTE.vermillion, sx * wide / 2, y + 0.6, z));
      }
    }
  }
  for (const sx of [-1, 1]) {
    for (let i = 0; i < segs; i++) {
      const t = (i + 0.5) / segs;
      const y = Math.sin(t * Math.PI) * rise;
      const z = (t - 0.5) * len;
      parts.push(box(0.14, 0.16, len / segs + 0.06, 0x2a1a1e, sx * wide / 2, y + 1.15, z));
    }
  }
  return parts;
}

/** Merge a pile of painted geometries into one BufferGeometry. */
export function mergeParts(parts) {
  let vertCount = 0;
  let idxCount = 0;
  for (const g of parts) {
    vertCount += g.attributes.position.count;
    idxCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vertCount * 3);
  const nrm = new Float32Array(vertCount * 3);
  const col = new Float32Array(vertCount * 3);
  const idx = vertCount > 65535 ? new Uint32Array(idxCount) : new Uint16Array(idxCount);

  let vo = 0;
  let io = 0;
  for (const g of parts) {
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position.array;
    const nn = g.attributes.normal.array;
    const cc = g.attributes.color.array;
    pos.set(p, vo * 3);
    nrm.set(nn, vo * 3);
    col.set(cc, vo * 3);
    const count = g.attributes.position.count;
    if (g.index) {
      const gi = g.index.array;
      for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
      io += gi.length;
    } else {
      for (let i = 0; i < count; i++) idx[io + i] = i + vo;
      io += count;
    }
    vo += count;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

export function transformParts(parts, x, y, z, ry = 0, scale = 1) {
  const m = new THREE.Matrix4()
    .makeTranslation(x, y, z)
    .multiply(new THREE.Matrix4().makeRotationY(ry))
    .multiply(new THREE.Matrix4().makeScale(scale, scale, scale));
  parts.forEach((g) => g.applyMatrix4(m));
  return parts;
}
