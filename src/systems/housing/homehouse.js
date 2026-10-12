import * as THREE from 'three';
import { paint } from '../../core/gfx.js';
import { PALETTE, pagodaRoof, pagodaSoffit } from '../../world/build.js';

/* ---------------------------------------------------------------------------
   The three houses, as SHELLS you can walk into.

   NOT `buildHouse`. The town's houses are solid boxes with a roof on — the
   right thing for a building nobody enters, and the wrong thing for one she
   owns. These are hollow: a floor she stands on, four walls with a door in
   the front one, a ramp up to every floor above, and a roof that comes off
   for whoever is inside. They are built from the town's own materials (the
   plaster, the dark timber framing, the pagoda roof) so a house a bridge away
   still reads as one of the town's.

   EVERYTHING HERE IS IN THE HOUSE'S OWN FRAME: the door is on +z, the origin
   is the middle of the ground floor at ground height. `homeisle.js` turns and
   lifts it into the world, colliders and all, so no number here knows where
   the island is.

   THE PIECES ARE SPLIT BY WHAT HIDES THEM. A kitten inside on floor k must
   see floor k with no ceiling over it — "the default camera with a cutaway
   roof and ceiling" — so every floor's walls, and the slab that is the floor
   ABOVE's ground, live in that floor's group, and the roof in its own. The
   cutaway is then "hide every group above hers" and nothing cleverer.

   ACCENTS ARE PAINTED WHITE AND TINTED BY MATERIAL, which is the whole of
   "the colours change at runtime per owner": the noren over the door, the
   trim under every eave, the ridge, and the roof itself are geometry that
   never changes, under a material whose colour is hers. Four accent slots,
   for the castle's four owners; a house with one owner tints all four the
   same. The preview's fade from neutral to her colours is the same material
   colour lerped (`Housing._tint`).
--------------------------------------------------------------------------- */

/** Floor-to-floor height. A kitten is 2.9 tall and the follow camera sits
 *  behind and above her, so a room has to be tall enough that the ceiling is
 *  not in the shot even before it is cut away. */
export const FLOOR_H = 4.6;
/** Ramp grade between floors. The roads allow 0.3; a staircase indoors can be
 *  steeper and has to be, or it does not fit in a room. */
const STAIR_GRADE = 0.5;
const STAIR_W = 2.6;
const WALL_T = 0.3;
const DOOR_W = 2.8;

/** Each house's floors: half-sizes, from the ground up, and its plinth. */
const SHAPES = {
  minka: { base: 0.7, floors: [[6, 5]], roof: 2.6, porch: 1.6 },
  dojohouse: { base: 0.9, floors: [[8, 6], [6.6, 5]], roof: 3.0, porch: 1.6 },
  castle: { base: 2.6, floors: [[11, 11], [9, 9], [6.6, 6.6]], roof: 3.6, porch: 2.4, stone: true },
};

const box = (w, h, d, c, x = 0, y = 0, z = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  paint(g, c);
  g.translate(x, y, z);
  return g;
};

/**
 * Build one house.
 *
 * @returns {{
 *   floors: THREE.BufferGeometry[][],   per floor: walls + its ceiling slab
 *   roof: THREE.BufferGeometry[],       the top roof (and the eave skirts)
 *   accent: THREE.BufferGeometry[][],   four slots, painted white
 *   tint: THREE.BufferGeometry[],       roof tiles, painted light, tinted hers
 *   door: {x,z,w,y},                    the front door's gap, local
 *   walls: {ax,az,bx,bz,y0,y1,door?}[], collision segments, local
 *   decks: {x0,x1,z0,z1,y,yAt?}[],      walkable floors and ramps, local
 *   floorY: number[], half: [hw,hd][], base: number, front: number
 * }}
 */
export function buildHouseShell(houseId) {
  const S = SHAPES[houseId] ?? SHAPES.minka;
  const floors = [];
  const roof = [];
  const accent = [[], [], [], []];
  const tint = [];
  const walls = [];
  const decks = [];
  const floorY = [];
  const half = [];
  const base = S.base;
  const [bw, bd] = S.floors[0];

  /* ---- the plinth: stone for the castle, a timber engawa otherwise ---- */
  const plinth = [];
  const pw = bw + S.porch;
  const pd = bd + S.porch;
  if (S.stone) {
    plinth.push(box(pw * 2, base, pd * 2, PALETTE.stone, 0, base / 2, 0));
    // battered courses, so the base reads as Ishigaki and not as a box
    for (let k = 0; k < 4; k++) {
      const s = 1 + (3 - k) * 0.025;
      plinth.push(box(pw * 2 * s, 0.12, pd * 2 * s, 0x7f7a74, 0, (k + 0.5) * (base / 4), 0));
    }
  } else {
    plinth.push(box(pw * 2, base, pd * 2, PALETTE.wood, 0, base / 2, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      plinth.push(box(0.4, base + 0.1, 0.4, PALETTE.woodDark, sx * (pw - 0.3), base / 2, sz * (pd - 0.3)));
    }
  }
  decks.push({ x0: -pw, x1: pw, z0: -pd, z1: pd, y: base, step: 0.75 });

  /* The way up onto the plinth: a ramp out of the front door. For the
     minka it is one step and the deck's own `step` takes it; the castle's
     base is a storey of stone and needs a real slope. */
  if (base > 0.8) {
    const len = base / 0.32;
    const z0 = pd;
    const z1 = pd + len;
    decks.push({
      x0: -STAIR_W, x1: STAIR_W, z0, z1, y: base, step: 0.6,
      yAt: (x, z) => base * (1 - (z - z0) / len),
    });
    const ramp = new THREE.BoxGeometry(STAIR_W * 2, 0.4, Math.hypot(len, base));
    paint(ramp, S.stone ? 0x8a8580 : PALETTE.wood);
    ramp.rotateX(Math.atan2(base, len));
    ramp.translate(0, base / 2 - 0.2, z0 + len / 2);
    plinth.push(ramp);
  }

  /* ---- each floor ---- */
  let y = base;
  for (let f = 0; f < S.floors.length; f++) {
    const [hw, hd] = S.floors[f];
    floorY.push(y);
    half.push([hw, hd]);
    const g = f === 0 ? [...plinth] : [];
    const top = y + FLOOR_H;
    const wallH = FLOOR_H - 0.35;
    // tatami floor, laid in 2x1 mats so the editor's grid is VISIBLE
    for (let x = -hw + 1; x < hw - 0.5; x += 2) {
      for (let z = -hd + 1; z < hd - 0.5; z += 2) {
        const odd = ((Math.round(x) + Math.round(z)) / 2) % 2 === 0;
        g.push(box(1.94, 0.06, 1.94, odd ? 0xd8cf94 : 0xcfc489, x, y + 0.03, z));
      }
    }
    // the walls: four sides, the front with a door (ground) or a window
    const side = (ax, az, bx, bz, isFront) => {
      const len = Math.hypot(bx - ax, bz - az);
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      const along = Math.abs(bx - ax) > Math.abs(bz - az) ? 'x' : 'z';
      const piece = (from, to, h0, h1, colour) => {
        const L = to - from;
        if (L <= 0.01) return;
        const c = from + L / 2;
        const px = along === 'x' ? ax + (bx - ax) * (c / len) : mx;
        const pz = along === 'z' ? az + (bz - az) * (c / len) : mz;
        g.push(box(along === 'x' ? L : WALL_T, h1 - h0, along === 'z' ? L : WALL_T, colour, px, (h0 + h1) / 2, pz));
      };
      if (isFront && f === 0) {
        const a = (len - DOOR_W) / 2;
        piece(0, a, y, y + wallH, PALETTE.plaster);
        piece(a + DOOR_W, len, y, y + wallH, PALETTE.plaster);
        piece(a, a + DOOR_W, y + 3.1, y + wallH, PALETTE.plaster);
        walls.push({ ax, az, bx: ax + (bx - ax) * (a / len), bz: az + (bz - az) * (a / len), y0: y, y1: top });
        walls.push({ ax: ax + (bx - ax) * ((a + DOOR_W) / len), az: az + (bz - az) * ((a + DOOR_W) / len), bx, bz, y0: y, y1: top });
        // the noren — the curtain over the door is the first thing in her colour
        accent[0].push(box(DOOR_W * 0.9, 0.9, 0.08, 0xffffff, 0, y + 2.75, bz + 0.2));
      } else {
        piece(0, len, y, y + wallH, PALETTE.plaster);
        walls.push({ ax, az, bx, bz, y0: y, y1: top });
        // a paper window in the middle of every wall
        const wx = along === 'x' ? mx : mx + Math.sign(mx) * 0.17;
        const wz = along === 'z' ? mz : mz + Math.sign(mz) * 0.17;
        g.push(box(along === 'x' ? Math.min(3, len * 0.3) : 0.1, 1.4, along === 'z' ? Math.min(3, len * 0.3) : 0.1,
          PALETTE.paper, wx, y + 2.2, wz));
      }
      // timber posts at the ends and a beam along the top
      g.push(box(0.36, wallH, 0.36, PALETTE.woodDark, ax, y + wallH / 2, az));
      g.push(box(along === 'x' ? len : 0.34, 0.3, along === 'z' ? len : 0.34, PALETTE.woodDark, mx, y + wallH - 0.15, mz));
    };
    side(-hw, hd, hw, hd, true);
    side(hw, hd, hw, -hd, false);
    side(hw, -hd, -hw, -hd, false);
    side(-hw, -hd, -hw, hd, false);
    // the floor deck (the ground floor's is the plinth's)
    if (f > 0) decks.push({ x0: -hw, x1: hw, z0: -hd, z1: hd, y, step: 0.4, floor: f });

    /* Eave skirt round each storey but the top: the castle's tiers, the
       dojo's band. Tinted hers, like every roof. */
    if (f < S.floors.length - 1) {
      const skirt = pagodaRoof(hw, hd, 0.9, { overhang: 0.32, cornerLift: 0.35 });
      paint(skirt, 0xe6e6e6);
      skirt.translate(0, top - 0.55, 0);
      tint.push(skirt);
      accent[f % 4].push(box(hw * 2 + 0.4, 0.22, 0.12, 0xffffff, 0, top - 0.7, hd + 0.25));
    }
    floors.push(g);
    y = top;
  }

  /* Ceiling slabs belong to the floor they are the GROUND of, so a kitten
     on floor k never has one over her head. */
  for (let f = 1; f < S.floors.length; f++) {
    const [hw, hd] = S.floors[f];
    floors[f].push(box(hw * 2, 0.34, hd * 2, PALETTE.woodDark, 0, floorY[f] - 0.17, 0));
  }

  /* ---- the ramps between floors, alternating sides ---- */
  for (let f = 0; f < S.floors.length - 1; f++) {
    const [uw, ud] = S.floors[f + 1];
    const y0 = floorY[f];
    const rise = floorY[f + 1] - y0;
    const len = rise / STAIR_GRADE;
    const sx = f % 2 === 0 ? -1 : 1;
    const xc = sx * (uw - STAIR_W / 2 - 0.4);
    // it climbs from the front toward the back, and arrives inside the floor above
    const zTop = -ud + 1.2;
    const zBot = Math.min(zTop + len, ud - 0.6);
    const L = zBot - zTop;
    const g = floors[f];
    const ramp = new THREE.BoxGeometry(STAIR_W, 0.3, Math.hypot(L, rise));
    paint(ramp, PALETTE.wood);
    ramp.rotateX(Math.atan2(rise, L));
    ramp.translate(xc, y0 + rise / 2, (zTop + zBot) / 2);
    g.push(ramp);
    decks.push({
      x0: xc - STAIR_W / 2, x1: xc + STAIR_W / 2, z0: zTop, z1: zBot, y: y0 + rise, step: 0.6, stair: f,
      yAt: (x, z) => y0 + rise * Math.min(1, Math.max(0, (zBot - z) / L)),
    });
    // a rail on the open side, which is also a collider so nobody walks off it
    const rx = xc - sx * (STAIR_W / 2);
    walls.push({ ax: rx, az: zTop, bx: rx, bz: zBot - 1.2, y0: y0 + 1.2, y1: y0 + rise + 2, rail: true });
    g.push(box(0.12, 1, L, PALETTE.woodDark, rx, y0 + rise * 0.5 + 0.8, (zTop + zBot) / 2));
  }

  /* ---- the roof on top ---- */
  const [tw, td] = S.floors[S.floors.length - 1];
  const yTop = floorY[floorY.length - 1] + FLOOR_H;
  const R = pagodaRoof(tw, td, S.roof, { overhang: 0.42, cornerLift: 0.6 });
  paint(R, 0xe6e6e6);
  R.translate(0, yTop - 0.12, 0);
  tint.push(R);
  const soff = pagodaSoffit(tw, td, S.roof, { overhang: 0.42, cornerLift: 0.6 });
  paint(soff, PALETTE.woodDark);
  soff.translate(0, yTop - 0.12, 0);
  roof.push(soff);
  accent[0].push(box(0.5, 0.5, td * 0.6, 0xffffff, 0, yTop + S.roof - 0.2, 0));
  if (houseId === 'castle') {
    // shachihoko-ish fins on the ridge — one per possible owner
    for (let k = 0; k < 4; k++) {
      const ang = (k / 4) * Math.PI * 2 + Math.PI / 4;
      accent[k].push(box(0.5, 1.1, 0.5, 0xffffff,
        Math.cos(ang) * tw * 1.3, yTop + 0.5, Math.sin(ang) * td * 1.3));
    }
  }

  return { floors, roof, accent, tint, walls, decks, floorY, half, base, front: pd, door: { x: 0, z: bd, w: DOOR_W, y: base } };
}

/** How tall the whole house is, for the camera tour and the name sign. */
export function houseHeight(houseId) {
  const S = SHAPES[houseId] ?? SHAPES.minka;
  return S.base + S.floors.length * FLOOR_H + S.roof;
}

/** The footprint radius — plots and the statue keep clear of it. */
export function houseRadius(houseId) {
  const S = SHAPES[houseId] ?? SHAPES.minka;
  const [w, d] = S.floors[0];
  return Math.hypot(w + S.porch, d + S.porch) + (S.base > 0.8 ? S.base / 0.32 : 0) * 0.5;
}
