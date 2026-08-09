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

/* ---------------------------------------------------------------------------
   The three dragon-ball locks that are made of WORLD rather than of ward.

   `ice` and `boulder` are things standing in front of a star and they belong
   to the star (see dragonball.js — they break, and a break needs an owner).
   These three lock a star by WHERE IT IS, which makes them island furniture:
   a grotto you have to walk into, a spire only a dragon reaches, and a stack
   of shards spaced for a third jump.

   All three are built here, merged into the world mesh, and register their own
   `solids`. None of them knows what a dragon ball is.
--------------------------------------------------------------------------- */

/**
 * The grotto: a ring of rock with a roof and one doorway.
 *
 * IT IS ABOVE GROUND, NOT DUG IN, and that is a constraint rather than a
 * choice. The islands are an analytic height field — `world.heightAt` answers
 * with one surface height per column and the kittens collide against exactly
 * that — so there is no way to express a hole with ground both above and below
 * it. A real cave would need a second collision system for the one feature
 * that uses it. A rock dome gets the same thing the cave was for: you cannot
 * see in from the air, you cannot fly in, and you have to find the mouth and
 * walk through it.
 *
 * THE MOUTH GLOWS. A grey lump on a grey hillside is not findable from a
 * dragon, and the star inside has no light column precisely because it is
 * under a roof — so the doorway is the advertisement, and it is lit warm
 * against the rock so it reads as "something is in there" from the air.
 *
 * @returns {{parts: THREE.BufferGeometry[], solids: {x,z,r}[], mouth: {x,z}}}
 *          `mouth` is the outside of the doorway, in local coordinates — the
 *          caller needs it to keep trees and props from growing across the
 *          entrance, which is a way to lose a star nobody would ever diagnose.
 */
export function buildGrotto(seed = 0, opts = {}) {
  /* `door` is an ANGLE, so the mouth grows with the room unless it is scaled
     back. 0.62 was measured at r 8.2; holding the opening at the same number
     of world units keeps "find the mouth" true instead of leaving a third of
     the wall missing. */
  const { r = 10.5, h = 7.0, door = 0.62 * (8.2 / r) } = opts;
  const parts = [];
  const solids = [];
  const lamps = [];

  /* The inside of the roof, as a function of distance from the middle. The
     ceiling is a squashed dome, so "how tall is a wall here" has an answer and
     it is not a constant — see `wall()` below, which uses it to run every
     interior wall right up into the rock. */
  const ceilAt = (d) => h * 0.57 + 0.60 * Math.sqrt(Math.max(0, r * r - d * d));

  /* The doorway faces +Z. The caller rotates the whole thing, so everything
     here is written against one fixed opening and the rotation is the only
     place the direction lives. */
  /* Blocks every 3.68 units around the ring, DERIVED rather than a count.
     It was a flat 14, which is exactly right at the radius the grotto used to
     be and wrong at any other: growing the room with a fixed count spreads the
     same 14 blocks thinner, so their 1.9-radius solids stop overlapping and
     the wall develops gaps you can walk through. The spacing is what has to
     stay constant, so that is what is written down. */
  const N = Math.max(12, Math.round((Math.PI * 2 * r) / 3.68));
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    // The gap: a wedge centred on +Z, wide enough to run through without
    // catching a shoulder on the solids either side of it.
    const toDoor = Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2)));
    if (toDoor < door) continue;

    const n = valueNoise(seed, i, 17);
    const bh = h * (0.72 + n * 0.5);
    const bw = 3.0 + n * 1.6;
    const g = new THREE.BoxGeometry(bw, bh, 2.8 + n);
    /* PALE STONE, not the grey it wants to be. The toon ramp steps hard and
       these faces mostly point away from the sun, so mid-grey rock lands on
       the bottom step and the whole outcrop renders as one black lump with no
       readable shape — worse on the dusk island, which is where one of them
       is. Painted this light it reads as rock in every biome. */
    paint(g, i % 3 === 0 ? 0xa79d95 : i % 3 === 1 ? 0xb3a99f : 0x968c85);
    g.applyMatrix4(new THREE.Matrix4()
      .makeTranslation(Math.cos(a) * r, bh / 2 - 0.6, Math.sin(a) * r)
      .multiply(new THREE.Matrix4().makeRotationY(-a)));
    parts.push(g);
    solids.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, r: 1.9 });
  }

  /* --- the maze ---
     A star lying in the middle of an empty room is a star you can see from the
     doorway, which makes the grotto a corridor with a prize at the end of it
     rather than somewhere you go IN to. So the inside is a spiral: an arc wall
     with its gap on the far side, and one spur across the corridor that turns
     the obvious way in into a dead end.

     Walk it: in at the mouth, right is blocked, so left, all the way round the
     back, through the gap, and the star is in the middle. Three legs and one
     wrong turn — enough to have to look, nowhere near enough to get lost in.

     IT CANNOT BE JUMPED, AND THAT IS FREE RATHER THAN TUNED. Solids are
     infinite cylinders unless they are given a `top`, and these are not: a
     kitten is pushed out of one at any height at all, so Shadowtail's 8.7-unit
     triple jump is no more use in here than a hop. The geometry is run up into
     the ceiling anyway (`ceilAt`), because a wall you cannot cross but can see
     over reads as a bug even when the rule is the one you want.

     IT CANNOT BE CUT, EITHER. These are world geometry merged into the island
     mesh, not `props` — the katana only ever knocks over a Prop, so there is
     nothing here for it to bite on. Same reason a dragon cannot burn its way
     in. Between the roof, the solids and `LOCKS.cave.foot`, the mouth is the
     only way to the star. */
  const wall = (a0, a1, rad, thick = 0.95, step = 0.55) => {
    const span = a1 - a0;
    const n = Math.max(2, Math.ceil((Math.abs(span) * rad) / step));
    for (let i = 0; i <= n; i++) {
      const a = a0 + (span * i) / n;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      // Up into the rock. The blocks overlap generously; a merged mesh does
      // not care and a visible seam between two of them would.
      const hh = ceilAt(rad) + 1.0;
      const g = new THREE.BoxGeometry(thick * 2.1, hh, thick * 2.4);
      paint(g, i % 2 ? 0x8d837c : 0x7d746d);
      g.applyMatrix4(new THREE.Matrix4()
        .makeTranslation(x, hh / 2 - 0.6, z)
        .multiply(new THREE.Matrix4().makeRotationY(-a)));
      parts.push(g);
      solids.push({ x, z, r: thick });
    }
  };

  const HALF = Math.PI / 2;
  /* The arc: everything except a gap centred on -Z, which is directly opposite
     the mouth. The player has to reach the far side of the room to get in.

     0.42 of the radius, not half. The corridor outside it has to be walkable —
     the outer wall's solids reach 1.9 inward, so at 0.5 the gap between the
     two rings left a 0.9-unit lane for a kitten 1.5 across. It is 1.9 now, and
     the chamber inside is still wider than the star's own pickup radius. */
  const ringR = r * 0.42;
  wall(-HALF + 0.55, HALF * 3 - 0.55, ringR, 0.8);
  /* The spur, from the arc out to the outer wall on the +X side. This is what
     makes it a maze rather than a ring: one of the two ways round is a dead
     end, so the first choice she makes is a real one. Both ends overlap what
     they meet, because a corridor with a hand's width of daylight at the end
     of it is a maze a kid solves by running at the wall. */
  for (let d = ringR + 1.0; d <= r - 2.6; d += 0.62) {
    const hh = ceilAt(d) + 1.0;
    const g = new THREE.BoxGeometry(2.0, hh, 1.9);
    paint(g, 0x857b74);
    g.translate(d, hh / 2 - 0.6, 0);
    parts.push(g);
    solids.push({ x: d, z: 0, r: 0.95 });
  }

  /* --- light to see it by ---
     A cave you cannot see inside is a cave nobody explores; they walk in, see
     black, and walk out. Crystals on the walls are the SOURCE, and the caller
     hangs a real point light on each so the rock around them actually lifts —
     glowing meshes on their own light nothing and read as stickers stuck to a
     dark wall. Three of them, spread round the spiral, so each leg of the
     walk has something ahead of it to move toward. */
  for (const [la, ld] of [[HALF, r * 0.82], [Math.PI, r * 0.70], [-HALF, r * 0.66]]) {
    lamps.push({ x: Math.cos(la) * ld, y: 3.1, z: Math.sin(la) * ld });
  }

  /* The roof. A squashed dome sitting on the ring — this is what stops you
     seeing in and flying in, so it overlaps the wall tops generously rather
     than meeting them (coplanar faces z-fight; see the house). */
  const dome = new THREE.SphereGeometry(r * 1.04, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
  dome.scale(1, 0.62, 1);
  paint(dome, 0x9d938b);
  dome.translate(0, h * 0.58, 0);
  parts.push(dome);

  /* AND A CEILING, because the outer dome is invisible from underneath.
     The world mesh is FrontSide, so standing inside the grotto you looked
     straight up through the roof at open sky — which is the one thing the
     roof exists to prevent, and it made the interior read as a ring of
     standing stones rather than as somewhere you had gone in.
     Mirroring on x reverses the winding and leaves a dome symmetric in x
     unchanged in shape, which is the cheapest honest way to get an inward-
     facing copy without a second material on the merged mesh. Darker,
     because it is a rock ceiling in shadow. */
  const roof = new THREE.SphereGeometry(r * 1.0, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
  roof.scale(-1, 0.60, 1);
  paint(roof, 0x584f4a);
  roof.translate(0, h * 0.57, 0);
  parts.push(roof);

  // A couple of boulders outside, so it reads as an outcrop rather than a hut.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 1.1;
    const s = 1.6 + valueNoise(seed, i, 29) * 1.4;
    const g = new THREE.IcosahedronGeometry(s, 0);
    paint(g, 0xa9a099);
    g.translate(Math.cos(a) * (r + 3.4), s * 0.4, Math.sin(a) * (r + 3.4));
    parts.push(g);
    solids.push({ x: Math.cos(a) * (r + 3.4), z: Math.sin(a) * (r + 3.4), r: s * 0.8 });
  }

  /* The lintel over the mouth, and the warm light under it. The glow is a
     plain unlit quad rather than a real light: the scene has one directional
     sun and adding a point light per grotto for a doorway is a lot of shader
     for a thing you look at from two hundred units away. */
  parts.push(box(5.6, 1.1, 2.4, 0x6b625c, 0, h * 0.52, r));
  /* NOT ROTATED. A PlaneGeometry faces +Z, the doorway faces +Z, and the
     merged world mesh is FrontSide — so the first version, which turned the
     quad to face the interior, was a light you could only see by already
     being inside the cave it exists to advertise. */
  const glow = new THREE.PlaneGeometry(4.4, 4.2);
  paint(glow, 0xffc061);
  glow.translate(0, 2.1, r + 1.25);
  parts.push(glow);
  /* And one facing IN as well, so the mouth still glows from inside — the
     interior is otherwise a windowless dome and the way out should read. */
  const inner = new THREE.PlaneGeometry(4.4, 4.2);
  paint(inner, 0xffc061);
  inner.rotateY(Math.PI);
  inner.translate(0, 2.1, r + 1.05);
  parts.push(inner);

  return { parts, solids, lamps, mouth: { x: 0, z: r + 4.5 } };
}

/**
 * The spire: a stone finger with a flat top, too tall to jump onto.
 *
 * THE HEIGHT IS THE LOCK, so it is checked rather than eyeballed. A kitten's
 * best standing jump is two jumps' worth of `JUMP_V`, and Shadowtail's third
 * takes that to about 8.7 units — so a top at `SPIRE_H` above the ground
 * around it cannot be reached on foot by anybody, with any buff, and the only
 * way up is a dragon. `world-check` asserts the margin against the real
 * numbers out of player.js rather than against a copy of them.
 */
export const SPIRE_H = 21;

export function buildSpire(seed = 0) {
  const parts = [];
  // Tapered, and stacked in drums so the silhouette has some shape to it —
  // a plain cone reads as a traffic bollard at this scale.
  const drums = 5;
  for (let i = 0; i < drums; i++) {
    const t = i / drums;
    const rt = 4.6 - t * 2.6;
    const rb = 5.2 - t * 2.6;
    const hh = SPIRE_H / drums;
    const n = valueNoise(seed, i, 53);
    parts.push(cyl(rt, rb, hh * 1.06, i % 2 ? 0x776e68 : 0x6b625d,
      (n - 0.5) * 0.7, hh * (i + 0.5), (n - 0.5) * 0.7, 9));
  }
  // A flat cap to stand on, and a lip so a landing dragon has an edge to read.
  parts.push(cyl(3.4, 2.9, 0.7, 0x8a817a, 0, SPIRE_H + 0.35, 0, 10));
  parts.push(cyl(3.0, 3.4, 0.4, 0x9c938b, 0, SPIRE_H + 0.85, 0, 10));
  return { parts, solids: [{ x: 0, z: 0, r: 4.4 }] };
}

/**
 * The jump shards: three small floating platforms in a rising staircase.
 *
 * `rise` IS THE WHOLE MECHANIC AND IT IS MEASURED, not chosen for feel. With
 * `GRAVITY` 26 and `JUMP_V` 11.2 out of player.js:
 *
 * ```
 *   two jumps  (nobody)      11.2^2/2g + (11.2*0.86)^2/2g            = 4.20
 *   three jumps (Shadowtail) 2 x (11.2*1.15)^2/2g + (11.2*.86*1.15)^2/2g = 8.74
 * ```
 *
 * A rise of 6.0 sits between them with room on both sides: 43% past what two
 * jumps can ever do even chained perfectly at the apex, and 69% of what three
 * jumps give, which is the slack a nine-year-old's timing needs. Anything
 * tighter than that gap is a platform that *sometimes* works, which is the
 * worst possible thing to build a gate out of. `world-check` recomputes both
 * numbers from the real constants and asserts the rise falls between them —
 * so retuning the jump can't quietly open or close this without failing.
 *
 * THE STEP IS ALSO HORIZONTAL. A vertical stack means jumping straight up with
 * a ceiling of rock over your head; stepping each shard outward gives her
 * something to aim at and makes the climb read as a staircase.
 */
export const SHARD_RISE = 6.0;
export const SHARD_STEP = 7.0;
export const SHARD_COUNT = 3;

export function buildShards(seed = 0) {
  const parts = [];
  const solids = [];
  const pads = [];
  for (let i = 0; i < SHARD_COUNT; i++) {
    const y = SHARD_RISE * (i + 1);
    const x = SHARD_STEP * (i + 1);
    const r = 3.6 - i * 0.35;
    // The pad you land on...
    parts.push(cyl(r, r * 0.92, 0.9, 0x7f8a72, x, y, 0, 10));
    parts.push(cyl(r * 0.94, r * 0.86, 0.34, 0x9ab488, x, y + 0.55, 0, 10));
    // ...and the crag hanging under it, so it reads as a piece of broken
    // island rather than as a disc floating in the air.
    const cone = new THREE.ConeGeometry(r * 0.88, r * 2.1, 8);
    cone.rotateX(Math.PI);
    paint(cone, 0x6a5f5a);
    cone.translate(x, y - r * 1.1, 0);
    parts.push(cone);
    solids.push({ x, z: 0, r: r * 0.55, top: y + 0.72 });
    pads.push({ x, y: y + 0.72, r });
  }
  return { parts, solids, pads };
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
