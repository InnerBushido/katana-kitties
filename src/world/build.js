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
  /* The tournament grounds. Deliberately the most ARTIFICIAL palette in the
     game — raked sand and dressed stone rather than grass — because every
     other island is somewhere that grew and this is somewhere that was BUILT.
     A kid arriving should be able to tell at a glance that people made it. */
  arena: {
    name: 'Arena', grass: 0xd9c48c, grassDark: 0xb09a63, grassWarm: 0xefdcae,
    rock: 0xa89478, rockDark: 0x5f5343, dirt: 0xc9b184, map: 0xd9c48c,
  },
};

export class Island {
  constructor(opts) {
    const {
      x = 0, z = 0, baseY = 0, radius = 60, seed = 1,
      hill = 4.5, plateau = 0.5, flatten = null, biome = 'meadow', kind = null,
    } = opts;

    /**
     * What this island is FOR, when that is not derivable from its biome.
     *
     * `null` for the six ordinary adventure islands, `'dojo'` for the maths
     * island and `'arena'` for the tournament grounds. It exists because this
     * file has already been bitten twice by places that identify a special
     * island by its INDEX — "the last one is the dojo" — which is true right
     * up until something is appended after it. Every loop that used to say
     * `k < islands.length - 1` now asks `isl.kind` instead, so adding a ninth
     * island cannot quietly plant trees on the unit circle.
     */
    this.kind = kind;
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
 * A curved wall: one seamless annular-sector solid.
 *
 * THIS REPLACED A ROW OF OVERLAPPING BOXES, AND THE REASON IS Z-FIGHTING.
 * Stepping little boxes round an arc is the obvious way to draw a curved wall
 * and it looks fine from the side — but every box overlaps its neighbours, so
 * along the top the two flat faces are coplanar and the depth buffer cannot
 * choose between them. The result is a shimmering dashed line down the top of
 * every wall in the grotto, which is exactly where the eye goes once the roof
 * is off. One mesh has no interior faces to fight over.
 *
 * Built by hand rather than with ExtrudeGeometry: this needs position, normal
 * and colour and nothing else (see mergeParts), and a lathe/extrude brings UVs
 * and seam handling that would only have to be stripped again.
 *
 * @param {number} rIn   inner radius
 * @param {number} rOut  outer radius
 * @param {number} y0    floor
 * @param {number} y1    ceiling
 * @param {number} a0    start angle
 * @param {number} a1    end angle (may be less than a0; it just winds the
 *                       other way)
 */
export const __curvedWallForTest = (...a) => curvedWall(...a);

function curvedWall(rIn, rOut, y0, y1, a0, a1, color, segs = 0) {
  const span = a1 - a0;
  const n = segs || Math.max(3, Math.ceil(Math.abs(span) * rOut * 0.7));
  const pos = [];
  const idx = [];
  // Four rings of vertices: inner/outer x bottom/top, one column per segment.
  for (let i = 0; i <= n; i++) {
    const a = a0 + (span * i) / n;
    const c = Math.cos(a);
    const s = Math.sin(a);
    pos.push(rIn * c, y0, rIn * s);   // 0: inner bottom
    pos.push(rIn * c, y1, rIn * s);   // 1: inner top
    pos.push(rOut * c, y0, rOut * s); // 2: outer bottom
    pos.push(rOut * c, y1, rOut * s); // 3: outer top
  }
  const V = (i, k) => i * 4 + k;
  for (let i = 0; i < n; i++) {
    const A = V(i, 0);
    const B = V(i, 1);
    const C = V(i, 2);
    const D = V(i, 3);
    const A2 = V(i + 1, 0);
    const B2 = V(i + 1, 1);
    const C2 = V(i + 1, 2);
    const D2 = V(i + 1, 3);
    /* WINDING IS COUNTER-CLOCKWISE SEEN FROM THE OUTSIDE OF EACH FACE, and
       every one of these was backwards on the first pass — all four groups,
       consistently. The world material is `FrontSide`, so a back-facing wall
       is culled from the side you are meant to look at it from and drawn from
       the side you are not: the grotto read as inside-out, lit wrong, with the
       far side of the room showing through the near side.
       Do not eyeball this. `world-check` builds a test wall and asserts the
       outer face's normals point away from the axis and the top's point up —
       which is how the bug was found, after it had already shipped once. */
    // inner face — normals toward the middle of the room
    idx.push(A, B2, B, A, A2, B2);
    // outer face — normals away from it
    idx.push(C2, D, D2, C2, C, D);
    // top
    idx.push(B, D2, D, B, B2, D2);
    // bottom (rarely seen, but an open solid shades wrong from below)
    idx.push(A2, C, C2, A2, A, C);
  }
  // End caps, so the wall ends in a face rather than a hole at a gap.
  const cap = (i, flip) => {
    const A = V(i, 0);
    const B = V(i, 1);
    const C = V(i, 2);
    const D = V(i, 3);
    if (flip) idx.push(A, D, C, A, B, D);
    else idx.push(A, C, D, A, D, B);
  };
  cap(0, span > 0);
  cap(n, span < 0);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  paint(g, color);
  return g;
}

/**
 * The grotto: a ring of rock with a roof, one doorway, and a maze inside it.
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
 * THREE PART LISTS COME BACK, and which list a piece is in decides how it is
 * drawn:
 *
 *   parts      merged into the island's rock mesh like any other scenery —
 *              the outlying boulders, the lintel, the doorway glow.
 *   wallParts  the walls, inside and out. Their own mesh with the X-RAY
 *              material, so a wall between the camera and a kitten opens a
 *              hole around her instead of hiding the whole building.
 *   roofParts  the dome and the ceiling under it. Their own mesh, hidden while
 *              somebody is inside — you cannot see down into a room through a
 *              roof, and no shader trick changes that.
 *
 * @returns {{parts, wallParts, roofParts, solids, lamps, r, mouth}}
 *          `mouth` is the outside of the doorway, in local coordinates — the
 *          caller needs it to keep trees and props from growing across the
 *          entrance, which is a way to lose a star nobody would ever diagnose.
 */
export function buildGrotto(seed = 0, opts = {}) {
  /* `door` is an ANGLE, so the mouth grows with the room unless it is scaled
     back. 0.62 was measured at r 8.2; holding the opening at the same number
     of world units keeps "find the mouth" true instead of leaving a third of
     the wall missing. */
  const { r = 12.4, h = 7.0, door = 0.62 * (8.2 / r) } = opts;
  const parts = [];
  const wallParts = [];
  const roofParts = [];
  const solids = [];
  const lamps = [];

  /* How tall a wall may be at distance `d` from the middle.
     IT IS DERIVED FROM THE DOME THAT IS ACTUALLY THERE. This used to describe
     a second, inward-facing ceiling at r*1.0 — and when that was deleted the
     formula stayed, describing a surface that no longer existed. The dome it
     was replaced by is HIGHER at the rim and LOWER toward the middle, so the
     inner maze rings, sized against the old numbers plus a unit of headroom,
     stood 0.33 proud of the roof: from outside, the grotto had two grey rings
     sticking up out of its dome like a crown.
     One formula, taken off the dome's own geometry, less a margin. */
  const domeR = r * 1.04;
  const ceilAt = (d) => h * 0.58 + 0.62 * Math.sqrt(Math.max(0, domeR * domeR - d * d)) - 0.45;

  /** Solids along an arc, spaced closely enough that nothing slips between. */
  const arcSolids = (rad, a0, a1, sr) => {
    const span = a1 - a0;
    const n = Math.max(1, Math.ceil((Math.abs(span) * rad) / (sr * 1.3)));
    for (let i = 0; i <= n; i++) {
      const a = a0 + (span * i) / n;
      solids.push({ x: Math.cos(a) * rad, z: Math.sin(a) * rad, r: sr });
    }
  };

  /* --- the outer ring ---
     The doorway faces +Z. The caller rotates the whole thing, so everything
     here is written against one fixed opening and the rotation is the only
     place the direction lives. */
  const DOOR_A = Math.PI / 2;
  const WT = 1.15;                       // wall thickness
  const SR = 0.66;                       // solid radius that matches it
  wallParts.push(curvedWall(
    r - WT / 2, r + WT / 2, -0.6, ceilAt(r),
    DOOR_A + door, DOOR_A + Math.PI * 2 - door, 0x9d938b,
  ));
  arcSolids(r, DOOR_A + door, DOOR_A + Math.PI * 2 - door, SR);

  /* --- the maze ---
     Two more rings inside the outer one, each with its gap somewhere else, and
     a radial spur in each corridor that turns one way round into a dead end.
     Walk it: in at the mouth, one way is blocked so you take the other, round
     to the gap, and again, and again. Four legs and two wrong turns.

     THE RINGS ARE 3.7 APART, WHICH IS NOT A LOOK — it is the smallest spacing
     that leaves a corridor a kitten fits down. Wall thickness is 1.15 and she
     is 1.5 across, so 3.7 gives 2.55 of corridor and 1.05 of slack. Anything
     tighter and she scrapes both walls; the first version of this maze used
     four rings at 2.8 and was unwalkable.

     IT CANNOT BE JUMPED, AND THAT IS FREE RATHER THAN TUNED. Solids are
     infinite cylinders unless they are given a `top`, and these are not: a
     kitten is pushed out of one at any height at all, so Shadowtail's 8.7-unit
     triple jump is no more use in here than a hop. The geometry runs up into
     the ceiling anyway, because a wall you cannot cross but can see over reads
     as a bug even when the rule is the one you want.

     IT CANNOT BE CUT, EITHER. These are world geometry, not `props` — the
     katana only ever knocks over a Prop, so there is nothing here for it to
     bite on. Same reason a dragon cannot burn its way in. */
  const GAP = 0.62;                      // half-width of a ring's gap, radians
  const rings = [
    { rad: r - 3.7, gap: DOOR_A + Math.PI * 0.72 },
    { rad: r - 7.4, gap: DOOR_A - Math.PI * 0.66 },
  ];
  for (const [i, ring] of rings.entries()) {
    const top = ceilAt(ring.rad);
    wallParts.push(curvedWall(
      ring.rad - WT / 2, ring.rad + WT / 2, -0.6, top,
      ring.gap + GAP, ring.gap + Math.PI * 2 - GAP,
      i % 2 ? 0x8d837c : 0x857b74,
    ));
    arcSolids(ring.rad, ring.gap + GAP, ring.gap + Math.PI * 2 - GAP, SR);
  }

  /* The spurs. Each one crosses a corridor at an angle roughly opposite that
     corridor's exit, so the short way round is the one that dies. */
  const spurs = [
    { a: DOOR_A - Math.PI * 0.42, r0: rings[0].rad, r1: r },
    { a: DOOR_A + Math.PI * 0.30, r0: rings[1].rad, r1: rings[0].rad },
  ];
  for (const s of spurs) {
    const top = ceilAt((s.r0 + s.r1) / 2);
    // A short arc rather than a true radial box: same helper, no new geometry
    // path, and it meets the rings it spans with the same curvature they have.
    const half = (WT / 2) / ((s.r0 + s.r1) / 2);
    wallParts.push(curvedWall(
      s.r0 - WT / 2, s.r1 + WT / 2, -0.6, top,
      s.a - half, s.a + half, 0x7d746d, 2,
    ));
    for (let d = s.r0; d <= s.r1; d += SR * 1.2) {
      solids.push({ x: Math.cos(s.a) * d, z: Math.sin(s.a) * d, r: SR });
    }
  }

  /* --- light to see it by ---
     A cave you cannot see inside is a cave nobody explores; they walk in, see
     black, and walk out. Crystals on the walls are the SOURCE, and the caller
     hangs a real point light on each so the rock around them actually lifts —
     glowing meshes on their own light nothing and read as stickers stuck to a
     dark wall. One per corridor, so each leg of the walk has something ahead
     of it to move toward. */
  for (const [la, ld] of [
    [DOOR_A + 0.9, r - 1.9],
    [DOOR_A + Math.PI, r - 1.9],
    [rings[0].gap + 0.8, rings[0].rad - 1.9],
    [rings[1].gap + Math.PI, rings[1].rad - 1.6],
  ]) {
    lamps.push({ x: Math.cos(la) * ld, y: 3.1, z: Math.sin(la) * ld });
  }

  /* The roof. A squashed dome sitting on the ring — this is what stops you
     seeing in and flying in from outside, so it overlaps the wall tops
     generously rather than meeting them (coplanar faces z-fight; see the
     house). Hidden by the caller while anybody is inside. */
  const dome = new THREE.SphereGeometry(r * 1.04, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
  dome.scale(1, 0.62, 1);
  paint(dome, 0x9d938b);
  dome.translate(0, h * 0.58, 0);
  roofParts.push(dome);

  /* THERE IS NO SECOND, INWARD-FACING CEILING ANY MORE, and removing it is
     what fixed the shimmer over the whole dome.

     It used to be there for a good reason: the world mesh is FrontSide, so
     from inside you looked straight up through the roof at open sky. The fix
     was a mirrored copy at r*1.0 against the outer dome's r*1.04 — which puts
     two surfaces 0.5 apart radially and **0.07 apart vertically near the rim**,
     and the depth buffer cannot separate that. The result was dark bands
     crawling across the roof of every grotto.

     It is dead geometry now regardless. The roof mesh is hidden the instant
     anybody steps inside, so the underside of it is never on screen — the
     ceiling existed to be looked at from a position that no longer renders it.
     One dome, one surface, nothing to fight. */

  // A couple of boulders outside, so it reads as an outcrop rather than a hut.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 1.1;
    const s = 1.6 + valueNoise(seed, i, 29) * 1.4;
    const g = new THREE.IcosahedronGeometry(s, 0);
    paint(g, 0xa9a099);
    g.translate(Math.cos(a) * (r + 2.4), s * 0.4, Math.sin(a) * (r + 2.4));
    parts.push(g);
    solids.push({ x: Math.cos(a) * (r + 2.4), z: Math.sin(a) * (r + 2.4), r: s * 0.8 });
  }

  /* --- THE PORCH: the entrance has to be findable from outside ---

     A dome is a dome from every angle. The mouth was a gap in a wall UNDER an
     overhanging roof, so from anywhere but dead in front of it there was
     nothing to see — you walked a full circle round a grey lump looking for
     the way in, which is the opposite of what the glowing doorway was supposed
     to buy. A kid should be able to point at the entrance from the air.

     So the doorway now sticks OUT past the dome's silhouette: two jambs and a
     lintel projecting `PORCH` beyond the wall, with the warm quad at the far
     end of it and a lantern on each side. It breaks the dome's outline from
     every direction, which is the only thing that actually reads at distance —
     colour alone does not, because the whole island is warm rock. */
  const PORCH = 4.6;
  const jamb = 1.5;
  for (const sx of [-1, 1]) {
    wallParts.push(box(jamb, h * 0.62, PORCH, 0x8d837c,
      sx * (2.8 + jamb / 2), h * 0.31 - 0.6, r + PORCH / 2 - 0.6));
    solids.push({ x: sx * (2.8 + jamb / 2), z: r + PORCH / 2 - 0.6, r: 0.85 });
  }
  // The lintel across the top of the porch, and the one in the wall behind it.
  wallParts.push(box(5.6 + jamb * 2, 1.2, PORCH, 0x6b625c,
    0, h * 0.62 - 0.6, r + PORCH / 2 - 0.6));
  wallParts.push(box(5.6, 1.1, 2.4, 0x6b625c, 0, h * 0.52, r));
  // Lanterns either side of the opening — the game's own "somebody lives here"
  // vocabulary, and they read as a doorway long before the rock does.
  for (const sx of [-1, 1]) {
    const L = buildLantern(0.85);
    transformParts(L, sx * (2.8 + jamb + 0.9), -0.4, r + PORCH - 0.2, 0);
    parts.push(...L);
  }
  /* NOT ROTATED. A PlaneGeometry faces +Z, the doorway faces +Z, and the
     merged world mesh is FrontSide — so the first version, which turned the
     quad to face the interior, was a light you could only see by already
     being inside the cave it exists to advertise. */
  const glow = new THREE.PlaneGeometry(4.4, 4.2);
  paint(glow, 0xffc061);
  glow.translate(0, 2.1, r + PORCH + 0.1);
  wallParts.push(glow);
  /* And one facing IN as well, so the mouth still glows from inside — the
     interior is otherwise a windowless dome and the way out should read. */
  const inner = new THREE.PlaneGeometry(4.4, 4.2);
  paint(inner, 0xffc061);
  inner.rotateY(Math.PI);
  inner.translate(0, 2.1, r + 0.9);
  wallParts.push(inner);

  return { parts, wallParts, roofParts, solids, lamps, r,
    mouth: { x: 0, z: r + PORCH + 3.5 } };
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

/* ---------------------------------------------------------------------------
   The World Martial Arts Tournament arena.

   A square dressed-stone ring on a stepped plinth, four banner posts, tiered
   stands all the way round, the announcer's box and the record board. It is
   the only built place in the game outside the home town, and that contrast
   is the point: you arrive somewhere that people made on purpose.
--------------------------------------------------------------------------- */

/** Half-width of the square fighting ring. The deck is ARENA_RING*2 across. */
export const ARENA_RING = 28;

/* HOW FAR OUT THE TORII STANDS, measured from the ring like everything else on
   this island. Exported because the griffin's landing spot is defined against
   it — see `arenaLanding` in world/world.js, which has to be on the near side
   of it or the ride ends by flying through the gate. Two literals four hundred
   lines apart is how that happened in the first place. */
export const ARENA_GATE = 34;
/** How far the ring's deck stands above the island under it. */
export const ARENA_RISE = 2.4;
/**
 * How far past the deck edge a fighter has to be before it counts as out.
 *
 * A fighter is a point and the ring is 56 across, so a bare edge test fires
 * while she is still visibly standing on stone — the sprite is nearly three
 * units wide and its feet are what a player reads as "on the ring". The
 * margin is measured from the deck rather than picked: it is a little over
 * one player radius (0.75), so the whole drawn kitten has to have cleared the
 * edge before the ring lets go of her.
 */
export const ARENA_OUT = 1.1;

/**
 * Where the announcer stands, and where the record board faces the ring.
 *
 * THE BOOTH SITS BETWEEN THE RING AND THE STANDS, not behind them. The first
 * pass put it out at `ARENA_RING + 19`, which is inside the seating ring —
 * so the stands swallowed its walls and all that was left on screen was a
 * pagoda roof the width of the stand it was buried in, hanging out over the
 * deck like a tarpaulin. An announcer has to be visibly ABOVE the fight and
 * clearly not in it, which means close to the ring and raised, not far back
 * and tall.
 *
 * AND IT IS ON THE FAR SIDE, WHICH IS THE PART THAT IS NOT DECORATION. This
 * game's camera has a FIXED yaw of -PI/4 (`CAM_YAW` in player.js) and only
 * ever changes its distance — that is what keeps the billboards seen from the
 * angle they were drawn for, and it means the camera is always at -x/+z of
 * whatever it is watching. So anything built at +z is permanently between the
 * players and the lens. The booth was there first, and a six-unit roof parked
 * across the middle of the deck is a roof across the middle of every round.
 * North for the announcer (he reads as a backdrop over the ring, which is
 * where a commentator belongs), west for the board, and the entrance keeps
 * the south — a torii you walk in through is the one thing that EARNS being
 * in the foreground.
 */
export const ARENA_BOOTH = { x: 0, z: -(ARENA_RING + 8) };
export const ARENA_BOARD = { x: -(ARENA_RING + 20), z: 0 };

/**
 * The four corners a fighter can be posted at, as fractions of the ring.
 *
 * Rounds start with the two of them on OPPOSITE sides facing in, which is the
 * one arrangement that reads as a duel rather than as two kittens who happen
 * to be standing near each other. They are pulled well inside the edge (0.62)
 * so nobody opens a round already halfway out of the ring.
 */
export const ARENA_POSTS = [
  { x: -ARENA_RING * 0.62, z: 0 },
  { x: ARENA_RING * 0.62, z: 0 },
];

/**
 * Where fighters stand when there are more than two of them.
 *
 * TEAMMATES MUST BE ADJACENT AND OPPONENTS ACROSS THE RING, which is the whole
 * reason this is a table rather than a ring of evenly spaced points. In 2v2 the
 * pairs open on opposite sides and a kid can see at a glance who is with her;
 * spaced evenly by index, the four alternate round the circle and every round
 * opens with both teams already tangled.
 *
 * `postsFor` lays sides out as ARCS: side 0 gets the west arc, side 1 the east,
 * and a third or fourth side (free-for-all) the north and south. Within a side
 * its members are spread along their own arc, so 2v2 is two pairs facing each
 * other and a free-for-all is four corners.
 *
 * @param {number[]} sides side index per fighter
 * @returns {{x:number, z:number}[]} one post per fighter, in fighter order
 */
export function postsFor(sides) {
  const n = sides.length;
  if (n <= 2) return ARENA_POSTS.slice(0, Math.max(1, n));

  const ids = [...new Set(sides)];
  // Bearings for each side, in the order the sides appear. Two sides face off
  // across the ring; three or four take the quarters.
  const BEARINGS = { 2: [Math.PI, 0], 3: [Math.PI, 0, Math.PI / 2], 4: [Math.PI, 0, Math.PI / 2, -Math.PI / 2] };
  const bearings = BEARINGS[ids.length] ?? ids.map((_, i) => (i / ids.length) * Math.PI * 2);
  const r = ARENA_RING * 0.62;
  // How wide a side's own arc opens, so two teammates stand beside each other
  // rather than on top of one another.
  const SPREAD = 0.42;

  return sides.map((side, i) => {
    const s = ids.indexOf(side);
    const mates = sides.filter((x) => x === side).length;
    const rank = sides.slice(0, i).filter((x) => x === side).length;
    const off = mates > 1 ? (rank / (mates - 1) - 0.5) * SPREAD * 2 : 0;
    const a = bearings[s] + off;
    return { x: Math.cos(a) * r, z: Math.sin(a) * r };
  });
}

export function buildArena() {
  const parts = [];
  /* THE PIECES THAT GET DRAWN WITH A HOLE IN THEM.
     A separate list rather than a flag on each part, because the split is a
     DRAW-CALL split: `World._buildArena` merges this pile under
     `xrayVertexMat` and the other pile under `toonVertexMat`, and a merged
     geometry has exactly one material. Two lists in, two meshes out.

     WHAT IS IN IT IS EVERYTHING TALL AND NEAR THE FIGHT. The four corner posts
     are 11 units of solid vermillion at the corners of a 56-unit deck, which
     is precisely where a kitten thrown toward a rim ends up — reported as
     losing her behind a pillar. The announcer's box is worse: Mr Satan stands
     ON it, and anybody who lands up there with him is behind its roof from
     every camera on the ring side.

     WHAT IS NOT IN IT: the deck, the steps, the stands and the record board.
     None of them is tall enough to hide a 2.9-unit kitten from a camera that
     is already above her, and every part moved into the x-ray mesh is a part
     that pays the cut test per fragment for nothing. */
  const seeThrough = [];
  const solids = [];
  const platforms = [];
  const R = ARENA_RING;
  const H = ARENA_RISE;

  /* --- the ring ---
     Three stacked slabs, each wider than the one above. A single extruded
     square reads as a box dropped on the grass; the step is what makes it
     masonry somebody laid. The TOP slab's surface is exactly H, because that
     is the number the platform and every spawn point is derived from. */
  parts.push(box(R * 2 + 4.4, 0.85, R * 2 + 4.4, PALETTE.rockDark, 0, H - 2.03, 0));
  parts.push(box(R * 2 + 2.2, 0.85, R * 2 + 2.2, PALETTE.rock, 0, H - 1.18, 0));
  parts.push(box(R * 2, 0.75, R * 2, PALETTE.sand, 0, H - 0.375, 0));

  /* Raked tiling. Thin proud strips rather than a checker of 64 quads: the
     lines are what tell you the deck is a measured square, and they also give
     the eye something to judge a knockback against on an otherwise blank
     surface — 56 units of flat sand has no scale to it at all. */
  for (let i = 1; i < 8; i++) {
    const t = (i / 8 - 0.5) * R * 2;
    parts.push(box(R * 2, 0.05, 0.28, PALETTE.rockDark, 0, H + 0.02, t));
    parts.push(box(0.28, 0.05, R * 2, PALETTE.rockDark, t, H + 0.02, 0));
  }

  /* THE BOUNDARY IS DRAWN, because it is a rule. A fighter thrown toward the
     rim has to be able to see how much ring is left without looking away from
     the fight, so the last stride of it is a bright vermillion frame with a
     white inner line — the two together read at a distance where either alone
     is a smudge. `ARENA_OUT` is what the game actually measures, and the
     stripe sits on the same number so what she can see is what is enforced. */
  const edge = R - ARENA_OUT;
  for (const s of [-1, 1]) {
    parts.push(box(R * 2, 0.07, ARENA_OUT * 2, PALETTE.vermillion, 0, H + 0.03, s * (R - ARENA_OUT)));
    parts.push(box(ARENA_OUT * 2, 0.07, R * 2, PALETTE.vermillion, s * (R - ARENA_OUT), H + 0.03, 0));
    parts.push(box(R * 2, 0.09, 0.34, PALETTE.paper, 0, H + 0.05, s * edge));
    parts.push(box(0.34, 0.09, R * 2, PALETTE.paper, s * edge, H + 0.05, 0));
  }

  /* The deck. One platform, so `heightAt` answers with it and every piece of
     ground physics the rest of the game already has — gravity, the slope
     snap, `resolveSolids` — works up here untouched. */
  platforms.push({ x0: -R, x1: R, z0: -R, z1: R, y: H });

  /* Steps up, on the two sides the fighters walk in from. The deck is 2.4 up
     and a single jump clears 4.2, so these are not strictly needed — but a
     kitten who has to jump onto the stage every time she wanders off it reads
     the stage as a wall, and between rounds both girls are walking around
     down here. Two treads a side, each comfortably inside a stride. */
  for (const s of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const y = H * ((i + 1) / 3);
      const z = s * (R + 1.4 + (1 - i) * 1.9);
      parts.push(box(16, y + 0.4, 2.0, PALETTE.stone, 0, (y + 0.4) / 2 - 0.2, z));
      platforms.push({ x0: -8, x1: 8, z0: z - 1.0, z1: z + 1.0, y });
    }
  }

  /* --- the four corner posts ---
     Vermillion columns with gold caps and a hanging banner. They are the
     silhouette: from the air the ring is a pale square, and these are what
     make it read as a venue rather than as a patio. Solids with a `top`, so
     a fighter knocked into one is stopped by it and can still be thrown on
     top of it — see resolveSolids. */
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (R + 1.1);
      const z = sz * (R + 1.1);
      /* ALL FIVE PIECES, INCLUDING THE BANNER. The banner is the part that
         actually does the hiding — it hangs INWARD, over the deck, so it is
         between the camera and a fighter far more often than the column it
         hangs off. A post that opened and a banner that did not would be a
         hole with a curtain across it. */
      seeThrough.push(box(1.5, 11, 1.5, PALETTE.vermillion, x, H + 5.5, z));
      seeThrough.push(box(2.2, 0.7, 2.2, PALETTE.gold, x, H + 11.3, z));
      seeThrough.push(box(2.6, 0.5, 2.6, PALETTE.vermillion, x, H + 11.85, z));
      // The banner, hanging inward toward the ring.
      seeThrough.push(box(0.16, 5.2, 2.4, PALETTE.paper, x - sx * 0.9, H + 7.4, z));
      seeThrough.push(box(0.18, 0.5, 2.4, PALETTE.tileIndigo, x - sx * 0.94, H + 9.8, z));
      solids.push({ x, z, r: 1.5, top: H + 11.6 });
    }
  }

  /* --- the stands ---
     Three tiers of benching on all four sides, set well back so nothing can
     crowd the ring or block a camera that has to see two fighters at once.
     They are solid, which matters: without them a knockback sends a kitten
     out across an empty island and the arena stops being a room. */
  for (let side = 0; side < 4; side++) {
    const a = (side * Math.PI) / 2;
    const nx = Math.round(Math.sin(a));
    const nz = Math.round(Math.cos(a));
    for (let tier = 0; tier < 3; tier++) {
      const d = R + 13 + tier * 3.4;
      const y = 1.1 + tier * 1.7;
      const len = R * 2 + 22 + tier * 7;
      const w = 3.4;
      const g = new THREE.BoxGeometry(
        nz ? len : w, y * 2, nz ? w : len
      );
      paint(g, tier % 2 ? PALETTE.wood : PALETTE.woodDark);
      g.translate(nx * d, y, nz * d);
      parts.push(g);
      // A stripe of seated colour on top, so the stands don't read as crates.
      const s = new THREE.BoxGeometry(nz ? len - 1 : 1.2, 0.5, nz ? 1.2 : len - 1);
      paint(s, [PALETTE.tileIndigo, PALETTE.tileRed, PALETTE.tileGreen][tier]);
      s.translate(nx * d, y * 2 + 0.25, nz * d);
      parts.push(s);
      solids.push({ x: nx * d, z: nz * d, r: tier === 2 ? 4.6 : 3.2, top: y * 2 + 0.5 });
    }
  }

  /* --- the announcer's box ---
     Raised, facing the ring, on the side the fighters do NOT enter from. Mr
     Satan stands on it for the whole tournament, which is why it is a real
     platform with a real height rather than a decorative lump: his billboard
     is placed off `ARENA_BOOTH.y`, and a booth whose top nobody can query
     puts him standing in mid-air over it. */
  const B = ARENA_BOOTH;
  /* THE WHOLE BOOTH IS SEE-THROUGH, ROOF INCLUDED. Mr Satan stands on top of
     it and a kitten knocked north lands up there beside him; from every camera
     on the ring side of the arena — which is all of them, because that is where
     the fight is — the roof and its two posts are directly in front of both of
     them. This is the case that was reported: not that the booth looked bad,
     but that you could not see who was on it. */
  seeThrough.push(box(10, 6.2, 5.6, PALETTE.plaster, B.x, 3.1, B.z));
  seeThrough.push(box(11, 0.6, 6.6, PALETTE.tileRed, B.x, 6.4, B.z));
  // The rail, on the RING side of the booth — he leans on it to shout at them.
  seeThrough.push(box(10.6, 0.5, 0.5, PALETTE.gold, B.x, 6.95, B.z + 2.9));
  for (const sx of [-1, 1]) {
    seeThrough.push(box(0.5, 3.4, 0.5, PALETTE.woodDark, B.x + sx * 4.8, 8.4, B.z));
  }
  /* `pagodaRoof` hands back ONE unpainted geometry, not a list of parts — it
     is the odd one out in this file, and every other caller paints it before
     pushing it. Merging an unpainted geometry throws on the missing colour
     attribute rather than drawing something grey, which is at least loud.
     Sized so the eave stops SHORT of the deck: half-width 4.4 with the 0.5
     overhang reaches 6.6, against the 8 units of clear ground between the
     booth's centre and the ring edge. A roof that oversails the ring is a
     roof that hides the fight from every camera south of it. */
  const boothRoof = pagodaRoof(4.4, 3.2, 2.2, { overhang: 0.5, cornerLift: 0.5 });
  paint(boothRoof, PALETTE.tileIndigo);
  boothRoof.translate(B.x, 10.1, B.z);
  seeThrough.push(boothRoof);
  solids.push({ x: B.x, z: B.z, r: 5.2, top: 6.7 });
  platforms.push({ x0: B.x - 5, x1: B.x + 5, z0: B.z - 2.8, z1: B.z + 2.8, y: 6.7 });

  /* --- the record board ---
     The leaderboard exists as a real object in the world as well as on the
     HUD. A score that only lives in a menu is a score a nine-year-old forgets
     she has; a board she can walk up to and stand in front of is a thing she
     can show her sister. The names themselves are drawn on a canvas label at
     runtime — see ArenaBoard. */
  /* Built along Z and thin in X, because it stands on the WEST side and has
     to face the ring across +x. Its own axes rather than a rotation of the
     north-facing version: `box` takes a yaw, but every offset below would
     then need rotating with it, and a board whose posts are 90 degrees out
     from its face is exactly the sort of thing that looks fine until you walk
     round it. */
  const D = ARENA_BOARD;
  for (const sz of [-1, 1]) {
    parts.push(box(1.1, 9, 1.1, PALETTE.woodDark, D.x, 4.5, D.z + sz * 7.6));
  }
  parts.push(box(0.9, 9.4, 17, PALETTE.plaster, D.x, 8.2, D.z));
  parts.push(box(1.4, 1.0, 18, PALETTE.tileRed, D.x, 13.3, D.z));
  parts.push(box(1.4, 0.5, 18, PALETTE.gold, D.x, 3.4, D.z));
  solids.push({ x: D.x, z: D.z, r: 8.4, top: 13.8 });

  /* The way in: a torii on the fighters' axis, so the approach from the
     griffin's landing side is framed exactly like the great torii at home. */
  parts.push(...transformParts(buildTorii(1.5), 0, 0, R + ARENA_GATE, 0));

  return { parts, seeThrough, solids, platforms };
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
