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
/** One step of the box stairs: about a third of a kitten's knee. */
const STEP_RISE = 0.3;
/** The ceiling slab's thickness, under each floor above the ground. */
export const SLAB_T = 0.34;
/** How much of a kitten is solid against a ceiling, measured from her feet. */
export const HEAD_H = 2.4;
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
  /** Trim on the ground floor's walls (the noren), in the four colour slots. */
  const accent = [[], [], [], []];
  /** Trim that belongs to the roof and the eaves — hidden with them. */
  const ridge = [[], [], [], []];
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

  /* The stairwells, worked out before any floor is drawn: floor f + 1 has
     the hole that floor f's stairs come up through. */
  const wells = stairWells(houseId);

  /* ---- each floor ---- */
  let y = base;
  for (let f = 0; f < S.floors.length; f++) {
    const [hw, hd] = S.floors[f];
    floorY.push(y);
    half.push([hw, hd]);
    const g = f === 0 ? [...plinth] : [];
    const top = y + FLOOR_H;
    const wallH = FLOOR_H - 0.35;
    // tatami floor, laid in 2x1 mats so the editor's grid is VISIBLE —
    // and none over the stairwell coming up through this floor
    const well = f > 0 ? wells[f - 1] : null;
    for (let x = -hw + 1; x < hw - 0.5; x += 2) {
      for (let z = -hd + 1; z < hd - 0.5; z += 2) {
        if (well && x + 1 > well.x0 && x - 1 < well.x1 && z + 1 > well.z0 && z - 1 < well.z1) continue;
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
        /* NO BUILT-IN WINDOW. There was a paper panel in the middle of every
           wall; windows are furniture now, hung where she wants them
           (catalog.js `where: 'wall'`), and a painted one left behind would
           sit under a real one or contradict an empty wall. */
      }
      /* Timber posts at the ends and a beam along the top — NO FACE OF EITHER
         IN THE PLANE OF ANOTHER. Richard: "The ceiling wooden beams are also
         having some Z-fighting". They were: the beam's top sat exactly on the
         wall's top (y + wallH both), and with the roof cut away that is the
         face the camera looks straight down at; and every corner had two
         full-length beams crossing in the same slab of space, top faces
         coplanar. So the beam runs BETWEEN the posts (len - 0.4, not len),
         stands 0.05 proud of the wall top, the post 0.08 proud of the beam,
         and beams along x sit 0.02 lower than beams along z so a corner
         never has two faces at one depth. */
      const lift = along === 'x' ? 0.03 : 0.05;
      g.push(box(0.38, wallH + 0.13, 0.38, PALETTE.woodDark, ax, y + (wallH + 0.13) / 2, az));
      g.push(box(along === 'x' ? len - 0.4 : 0.36, 0.3, along === 'z' ? len - 0.4 : 0.36, PALETTE.woodDark, mx, y + wallH - 0.15 + lift, mz));
    };
    side(-hw, hd, hw, hd, true);
    side(hw, hd, hw, -hd, false);
    side(hw, -hd, -hw, -hd, false);
    side(-hw, -hd, -hw, hd, false);
    /* The floor deck (the ground floor's is the plinth's) — WITH THE
       STAIRWELL CUT OUT OF IT. Richard: "If player navigated to the 2nd or
       3rd floor in the house, they are getting stuck on that floor. There is
       no way for them to go back down". The floor above was one deck over
       the whole footprint, the top of the stairs included, and `heightAt`
       takes the highest surface under her: standing over the stairs she
       stood on the floor, never on the step below it. Four decks round the
       hole, and over the hole there is only the stair. */
    if (f > 0) for (const d of around(-hw, hw, -hd, hd, well)) decks.push({ ...d, y, step: 0.4, floor: f });

    /* Eave skirt round each storey but the top: the castle's tiers, the
       dojo's band. Tinted hers, like every roof. */
    if (f < S.floors.length - 1) {
      const skirt = pagodaRoof(hw, hd, 0.9, { overhang: 0.32, cornerLift: 0.35 });
      paint(skirt, 0xe6e6e6);
      skirt.translate(0, top - 0.55, 0);
      tint.push(skirt);
      ridge[f % 4].push(box(hw * 2 + 0.4, 0.22, 0.12, 0xffffff, 0, top - 0.7, hd + 0.25));
    }
    floors.push(g);
    y = top;
  }

  /* Ceiling slabs belong to the floor they are the GROUND of, so a kitten
     on floor k never has one over her head — in pieces round the stairwell. */
  for (let f = 1; f < S.floors.length; f++) {
    const [hw, hd] = S.floors[f];
    for (const d of around(-hw, hw, -hd, hd, wells[f - 1])) {
      floors[f].push(box(d.x1 - d.x0, SLAB_T, d.z1 - d.z0, PALETTE.woodDark, (d.x0 + d.x1) / 2, floorY[f] - SLAB_T / 2, (d.z0 + d.z1) / 2));
    }
  }

  /* ---- the stairs between floors, alternating sides ----
     HAKO-KAIDAN, the box staircase of a Japanese house: solid steps of
     timber, each a block down to the floor, so it reads as stairs from any
     angle and has no underside to see through. Richard: "Consider making
     the staircases more traditional looking stairs and connecting properly."
     It was a tilted plank. The SURFACE she walks on is still the straight
     slope through the steps' front edges — a stepped `yAt` would bounce the
     camera on every tread — and the steps are drawn on it. */
  for (let f = 0; f < S.floors.length - 1; f++) {
    const W = wells[f];
    const { y0, rise, xc, zTop, zBot, sx } = W;
    const L = zBot - zTop;
    const g = floors[f];
    const n = Math.max(4, Math.round(rise / STEP_RISE));
    const h = rise / n;
    const run = L / n;
    for (let k = 0; k < n; k++) {
      // step k: from the front (zBot) back; its top at (k + 1) rises
      const za = zBot - (k + 1) * run;
      const top = y0 + (k + 1) * h;
      g.push(box(STAIR_W, top - y0, run, k % 2 ? PALETTE.wood : 0xb98a52, xc, y0 + (top - y0) / 2, za + run / 2));
      // the dark nosing along each tread's front edge
      g.push(box(STAIR_W + 0.04, 0.06, 0.1, PALETTE.woodDark, xc, top + 0.01, za + run - 0.05));
    }
    decks.push({
      x0: xc - STAIR_W / 2, x1: xc + STAIR_W / 2, z0: zTop, z1: zBot, y: y0 + rise, step: 0.6, stair: f,
      yAt: (x, z) => y0 + rise * Math.min(1, Math.max(0, (zBot - z) / L)),
    });
    // a rail on the open side, which is also a collider so nobody walks off it
    const rx = xc - sx * (STAIR_W / 2);
    walls.push({ ax: rx, az: zTop, bx: rx, bz: zBot - 1.2, y0: y0 + 1.2, y1: y0 + rise + 2, rail: true });
    g.push(box(0.12, 1, L, PALETTE.woodDark, rx, y0 + rise * 0.5 + 0.8, (zTop + zBot) / 2));
    /* THE OPENING UPSTAIRS IS RAILED on its two long sides and its front, so
       nobody walks into it by accident; its BACK is open, because that is
       where the stairs arrive at the floor and where she steps on to go
       down. A kitten who wants to can still jump down through it. */
    const up = floors[f + 1];
    const yu = floorY[f + 1];
    const railH = 1;
    for (const x of [W.x0, W.x1]) {
      walls.push({ ax: x, az: W.z0 + 0.4, bx: x, bz: W.z1, y0: yu, y1: yu + 2, rail: true });
      up.push(box(0.12, railH, W.z1 - W.z0 - 0.4, PALETTE.woodDark, x, yu + railH - 0.05, (W.z0 + 0.4 + W.z1) / 2));
      up.push(box(0.2, railH + 0.1, 0.2, PALETTE.woodDark, x, yu + (railH + 0.1) / 2, W.z1));
    }
    walls.push({ ax: W.x0, az: W.z1, bx: W.x1, bz: W.z1, y0: yu, y1: yu + 2, rail: true });
    up.push(box(W.x1 - W.x0, 0.12, 0.12, PALETTE.woodDark, (W.x0 + W.x1) / 2, yu + railH - 0.05, W.z1));
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
  /* THE RIDGE CAP IS THE ROOF'S, not the house's. Richard: "When inside the
     house, the center point of the roof is still visible, should probably
     disappear with the roof." It was in accent slot 0 with the noren, and
     slot 0 was the one slot `setHome` kept when the roof came off — so a
     block floated in mid-air over the room. Everything up here now goes in
     `ridge`, which is hidden with the roof, whatever its colour slot. */
  ridge[0].push(box(0.5, 0.5, td * 0.6, 0xffffff, 0, yTop + S.roof - 0.2, 0));
  if (houseId === 'castle') {
    // shachihoko-ish fins on the ridge — one per possible owner
    for (let k = 0; k < 4; k++) {
      const ang = (k / 4) * Math.PI * 2 + Math.PI / 4;
      ridge[k].push(box(0.5, 1.1, 0.5, 0xffffff,
        Math.cos(ang) * tw * 1.3, yTop + 0.5, Math.sin(ang) * td * 1.3));
    }
  }

  return {
    floors, roof, accent, ridge, tint, walls, decks, floorY, half, base, front: pd, wells,
    door: { x: 0, z: bd, w: DOOR_W, y: base },
    /* The name board over the door, in the wall above the opening (3.1 to
       4.25 up). Richard: "the placard above the houses door frame ... is not
       visible as the roof blocks it from camera" — so it is not moved, the
       CAMERA is: walking up to the door frames it from behind her, low, under
       the eave (`Housing.cameraFocus`, `doorShot`). */
    sign: { x: 0, y: base + 3.66, z: bd + 0.26, w: DOOR_W + 0.6, h: 0.95 },
  };
}

/**
 * Every staircase in a house, as data: floor `f`'s stairs climb from the
 * front (zBot, at floor f) to the back (zTop, at floor f + 1), and the rect
 * x0..x1, z0..z1 is BOTH the stairs' footprint on floor f AND the hole they
 * come up through in floor f + 1. The editor keeps furniture off both
 * (`stairBlocks`), and the ceiling has no lid over it (`ceilingAt`).
 */
export function stairWells(houseId) {
  const S = SHAPES[houseId] ?? SHAPES.minka;
  const out = [];
  let y0 = S.base;
  for (let f = 0; f < S.floors.length - 1; f++) {
    const [uw, ud] = S.floors[f + 1];
    const rise = FLOOR_H;
    const len = rise / STAIR_GRADE;
    const sx = f % 2 === 0 ? -1 : 1;
    const xc = sx * (uw - STAIR_W / 2 - 0.4);
    // it climbs from the front toward the back, and arrives inside the floor above
    const zTop = -ud + 1.2;
    const zBot = Math.min(zTop + len, ud - 0.6);
    out.push({ floor: f, y0, rise, xc, sx, zTop, zBot, x0: xc - STAIR_W / 2, x1: xc + STAIR_W / 2, z0: zTop, z1: zBot });
    y0 += FLOOR_H;
  }
  return out;
}

/** Rects of the room grid that furniture may not cover: stairs below, a hole above. */
export function stairBlocks(houseId, floor) {
  return stairWells(houseId).filter((W) => W.floor === floor || W.floor + 1 === floor);
}

/** The rect x0..x1, z0..z1 as up to four rects round `hole` (or itself). */
function around(x0, x1, z0, z1, hole) {
  if (!hole) return [{ x0, x1, z0, z1 }];
  const out = [
    { x0, x1, z0, z1: hole.z0 },
    { x0, x1, z0: hole.z1, z1 },
    { x0, x1: hole.x0, z0: hole.z0, z1: hole.z1 },
    { x0: hole.x1, x1, z0: hole.z0, z1: hole.z1 },
  ];
  return out.filter((d) => d.x1 - d.x0 > 0.01 && d.z1 - d.z0 > 0.01);
}

/** The shape table's row, for the editor's wall slots (no geometry built). */
export function houseShape(houseId) {
  return SHAPES[houseId] ?? SHAPES.minka;
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
