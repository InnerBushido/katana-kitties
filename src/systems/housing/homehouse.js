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
/** How far in each course of the castle's stone base steps from the one below. */
export const CASTLE_COURSE = 0.45;
/** A storey's wall collider stops this far under the floor above (its slab). */
export const WALL_UNDER = SLAB_T;

/** Each house's floors: half-sizes, from the ground up, and its plinth. */
const SHAPES = {
  tiny: { base: 0.5, floors: [[4, 4]], roof: 2.0, porch: 1.2 },
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
/**
 * HOLES IN THE WALLS. Richard, Oct 2026: windows "should be the same as the
 * shoji window furniture, except that there needs to be a hole in the wall
 * where the window is, and when opened can show the outside", and a bridge
 * between two houses needs "a hole ... cut in the wall of the house". An
 * opening is `{ floor, side, at, w, sill, h, door }` in the house's frame —
 * `side` as `wallSlots` counts them (0 front, 1 +x, 2 back, 3 -x), `at` the
 * centre along it, `sill`/`h` from the floor up. A DOOR (sill 0) also cuts the
 * wall's collider; a window does not, so nobody climbs out of one.
 */
export const WINDOW = { w: 1.6, sill: 1.0, h: 1.6 };
/** A doorway cut for a bridge: as tall as the front door. */
export const PORT_H = 3.1;
/** How far a plinth runs down into the ground, and how far below it she is still lifted on. */
export const PLINTH_SINK = 2.0;

export function buildHouseShell(houseId, openings = []) {
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
  /** The front edge of the ground floor's eave band, where there is one. */
  let eave = null;
  /** Every eave band and the roof, as surfaces she can land on and bonk into (`bandOf`, `roofOf`). */
  const eaves = [];
  const base = S.base;
  const [bw, bd] = S.floors[0];

  /* ---- the plinth: stone for the castle, a timber engawa otherwise ---- */
  const plinth = [];
  const pw = bw + S.porch;
  const pd = bd + S.porch;
  /* THE PLINTH GOES DOWN INTO THE GROUND, and she is put on top of it.
     Richard, Oct 2026: "Step up base colliders aren't working all the time.
     Sometimes after moving or rotating a house, the player can just walk
     through the base ... should be pushed up on top of it". The house stands
     at the ground height under its MIDDLE (`_frame`), so on a slope the
     downhill edge of a timber plinth was its 0.7 plus the slope above the
     grass — past the deck's 0.75 step, and the plinth has no wall, so she
     walked into it with her feet on the grass. Now the timber plinth's deck
     takes her from anything up to PLINTH_SINK below it, and the box is drawn
     that far down so the downhill side is not a shelf floating on air. The
     castle's stone base is a storey and has a ramp: it keeps its step, and
     its sides are WALLS instead, but for the ramp's mouth. */
  if (S.stone) {
    /* ISHIGAKI IN STEPS SHE CAN CLIMB. Richard, Oct 2026: "Unable to walk up
       the steps around the castle edges". They looked like steps — four thin
       courses proud of a sheer storey of stone, which was a wall all round
       but for the ramp — and were not. Now the base IS four courses, each
       CASTLE_COURSE in from the one under it and a quarter of the base high,
       and each is a deck (`course`), so she walks up any side of it; the top
       course is the porch the castle stands on. All inside the footprint the
       old base had (`houseFoot` does not move), and each course's foot is a
       hair lower than the last so no two undersides share a plane. */
    for (let k = 0; k < 4; k++) {
      const i = (3 - k) * CASTLE_COURSE;
      const top = (k + 1) * (base / 4), foot = -PLINTH_SINK - k * 0.01;
      plinth.push(box((pw - i) * 2, top - foot, (pd - i) * 2, k % 2 ? PALETTE.stone : 0x8f8a83, 0, (top + foot) / 2, 0));
    }
  } else {
    plinth.push(box(pw * 2, base + PLINTH_SINK, pd * 2, PALETTE.wood, 0, (base - PLINTH_SINK) / 2, 0));
    // the posts stop 0.1 short of the box's foot, so the two undersides are not one plane
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      plinth.push(box(0.4, base + 0.1 + PLINTH_SINK - 0.1, 0.4, PALETTE.woodDark, sx * (pw - 0.3), (base + 0.1 - PLINTH_SINK + 0.1) / 2, sz * (pd - 0.3)));
    }
  }
  if (S.stone) {
    // the courses, each a step of a quarter of the base; the lowest takes her from anything down to PLINTH_SINK
    for (let k = 0; k < 4; k++) {
      const i = (3 - k) * CASTLE_COURSE;
      decks.push({ x0: -pw + i, x1: pw - i, z0: -pd + i, z1: pd - i, y: (k + 1) * (base / 4), step: k ? 0.75 : base / 4 + PLINTH_SINK, plinth: k === 3, course: k });
    }
  } else {
    decks.push({ x0: -pw, x1: pw, z0: -pd, z1: pd, y: base, step: base + PLINTH_SINK, plinth: true });
  }

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
    // the walls: four sides, with the front door, windows and bridge doors cut out
    const side = (ax, az, bx, bz, isFront, sideNo) => {
      const len = Math.hypot(bx - ax, bz - az);
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      const along = Math.abs(bx - ax) > Math.abs(bz - az) ? 'x' : 'z';
      const piece = (from, to, h0, h1, colour) => {
        const L = to - from;
        if (L <= 0.01 || h1 - h0 <= 0.01) return;
        const c = from + L / 2;
        const px = along === 'x' ? ax + (bx - ax) * (c / len) : mx;
        const pz = along === 'z' ? az + (bz - az) * (c / len) : mz;
        g.push(box(along === 'x' ? L : WALL_T, h1 - h0, along === 'z' ? L : WALL_T, colour, px, (h0 + h1) / 2, pz));
      };
      const pt = (t) => ({ x: ax + (bx - ax) * (t / len), z: az + (bz - az) * (t / len) });
      /* `at` (house x on the front and back, house z on the sides) to the
         distance along this side from its start corner. */
      const tOf = (at) => (sideNo === 0 ? at + hw : sideNo === 1 ? hd - at : sideNo === 2 ? hw - at : at + hd);
      const holes = [];
      if (isFront && f === 0) {
        const a = (len - DOOR_W) / 2;
        holes.push({ t0: a, t1: a + DOOR_W, h0: 0, h1: PORT_H, door: true });
        // the noren — the curtain over the door is the first thing in her colour
        accent[0].push(box(DOOR_W * 0.9, 0.9, 0.08, 0xffffff, 0, y + 2.75, bz + 0.2));
      }
      for (const o of openings) {
        if (o.floor !== f || o.side !== sideNo) continue;
        const t = tOf(o.at);
        const t0 = Math.max(0.35, t - o.w / 2), t1 = Math.min(len - 0.35, t + o.w / 2);
        if (t1 - t0 < 0.3) continue;
        holes.push({ t0, t1, h0: o.sill, h1: Math.min(wallH - 0.2, o.sill + o.h), door: !o.sill });
        /* A dark timber frame round every cut, so a hole reads as built and
           not broken — AND STANDING 0.04 PROUD INTO THE HOLE. Richard, Oct
           2026: "windows are z-fighting with the hole cut in the wall". They
           were: each jamb ended exactly where the wall piece beside it ended,
           the head's underside was the plane of the plaster over the hole and
           the sill's top the plane of the plaster under it, so the hole's
           four inner faces were two colours at one depth. The jambs are a
           hair thinner than the head and sill (0.08 proud of the wall, not
           0.1) and the head and sill a hair longer, so no two of the frame's
           own faces share a plane either. tools/checks/zfight.mjs proves it
           for every house, with windows and bridge doors cut. */
        const fr = (from, to, h0, h1, dd = 0.1) => {
          const L = to - from, c = from + L / 2, P = pt(c);
          g.push(box(along === 'x' ? L : WALL_T + dd, h1 - h0, along === 'z' ? L : WALL_T + dd, PALETTE.woodDark, P.x, y + (h0 + h1) / 2, P.z));
        };
        const top1 = Math.min(wallH - 0.2, o.sill + o.h);
        fr(t0 - 0.12, t0 + 0.04, o.sill, top1, 0.08);
        fr(t1 - 0.04, t1 + 0.12, o.sill, top1, 0.08);
        fr(t0 - 0.14, t1 + 0.14, top1 - 0.04, top1 + 0.12);
        if (o.sill > 0) fr(t0 - 0.14, t1 + 0.14, o.sill - 0.12, o.sill + 0.04);
      }
      holes.sort((p, q) => p.t0 - q.t0);
      let t = 0;
      let c0 = 0;
      for (const o of holes) {
        piece(t, o.t0, y, y + wallH, PALETTE.plaster);
        piece(o.t0, o.t1, y, y + o.h0, PALETTE.plaster);
        piece(o.t0, o.t1, y + o.h1, y + wallH, PALETTE.plaster);
        if (o.door) {
          const A = pt(c0), B = pt(o.t0);
          if (o.t0 - c0 > 0.01) walls.push({ ax: A.x, az: A.z, bx: B.x, bz: B.z, y0: y, y1: top - WALL_UNDER });
          c0 = o.t1;
        }
        t = Math.max(t, o.t1);
      }
      piece(t, len, y, y + wallH, PALETTE.plaster);
      /* ...TO THE UNDERSIDE OF THE FLOOR ABOVE, not to its top. Richard, Oct
         2026: "when building a bridge to the 2nd or 3rd floor, there is
         something blocking the doorway". There was: a storey's walls stood
         to `top`, which is the floor ABOVE's surface, and a wall is solid to
         anyone whose feet are not above its top — so a kitten walking in
         off a bridge, feet exactly at `top`, was walled by the lower storey's
         wall wherever that storey is wider than hers (the castle, the dojo
         house: the eave band's lap). WALL_UNDER is the slab. */
      { const A = pt(c0); walls.push({ ax: A.x, az: A.z, bx, bz, y0: y, y1: top - WALL_UNDER }); }
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
    side(-hw, hd, hw, hd, true, 0);
    side(hw, hd, hw, -hd, false, 1);
    side(hw, -hd, -hw, -hd, false, 2);
    side(-hw, -hd, -hw, hd, false, 3);
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
       dojo's band. Tinted hers, like every roof.
       A BAND, NOT A ROOF. Richard: the beams were poking out through the
       roof from outside. They were: the skirt was a whole `pagodaRoof`
       pyramid dropped to `top - 0.55`, which put its surface at the wall
       line about 0.48 below the storey's top — under the beam (top - 0.30)
       and the corner posts (top - 0.22) — and its apex 0.35 ABOVE the next
       floor, inside her room. Now it runs from the eave up to the foot of
       the next storey's wall and no further, and `eaveBand`'s numbers keep
       it over the timber (world-check casts down on every post and beam). */
    if (f < S.floors.length - 1) {
      const [uw, ud] = S.floors[f + 1];
      /* CUT WHERE A BRIDGE LEAVES THE STOREY ABOVE. Richard, Oct 2026: "When
         bridge is going to 2nd or 3rd floor, seems the bridge is going
         through the roof overhang of 1st or 2nd floor ... Let's remove
         sections of the protruding roof to accommodate for the bridge ... If
         the bridge is removed, then this cut roof can be repaired". A door on
         floor f + 1 opens at this band's height, so the band has a notch the
         bridge's width and a step more each side, straight out from the door
         — and since the shell is built from its openings, selling the bridge
         rebuilds the band whole. With no doors upstairs it is exactly the old
         band. */
      const gaps = openings.filter((o) => o.floor === f + 1 && !o.sill).map((o) => ({ side: o.side, lo: o.at - o.w / 2 - EAVE_GAP, hi: o.at + o.w / 2 + EAVE_GAP }));
      const skirt = eaveBand(hw, hd, uw, ud, top, gaps);
      paint(skirt, 0xe6e6e6);
      tint.push(skirt);
      eaves.push(bandOf(hw, hd, uw, ud, top, gaps, f));
      // the trim along the front, in pieces round a notch on that side
      const tx = hw + 0.2;
      let from = -tx;
      for (const G of gaps.filter((q) => q.side === 0).sort((p, q) => p.lo - q.lo)) {
        if (G.lo - from > 0.05) ridge[f % 4].push(box(G.lo - from, 0.22, 0.12, 0xffffff, (from + G.lo) / 2, top + SKIRT_EAVE - 0.18, hd * (1 + SKIRT_OVER) - 0.02));
        from = Math.max(from, G.hi);
      }
      if (tx - from > 0.05) ridge[f % 4].push(box(tx - from, 0.22, 0.12, 0xffffff, (from + tx) / 2, top + SKIRT_EAVE - 0.18, hd * (1 + SKIRT_OVER) - 0.02));
      // its trim hangs 0.18 + 0.11 under the band's edge: that is the lowest
      // thing in front of the name board (`doorPitch`)
      if (f === 0) eave = { z: hd * (1 + SKIRT_OVER), y: top + SKIRT_EAVE - 0.29 };
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
    /* ONE SOLID, NOT n BOXES. Richard, Oct 2026: "it seems like the
       staircases, each step is a separate model, they should be joined
       together as one model if possible so that the xray shader works
       properly on them." Each step was a box down to the floor, so an x-ray
       hole through the flight showed n boxes' worth of insides, every one a
       different depth. `stairSolid` is the side profile — the sawtooth of
       treads and risers — swept across the stair's width: one closed shape. */
    g.push(stairSolid(xc - STAIR_W / 2, xc + STAIR_W / 2, zTop, zBot, y0, n, h, run));
    for (let k = 0; k < n; k++) {
      const za = zBot - (k + 1) * run;
      const top = y0 + (k + 1) * h;
      // the dark nosing along each tread's front edge, 0.01 proud of the riser
      // so its face is not the step's face (zfight.mjs)
      g.push(box(STAIR_W + 0.04, 0.06, 0.1, PALETTE.woodDark, xc, top + 0.01, za + run - 0.04));
    }
    /* AND SOLID FROM THE FLOOR. Richard, Oct 2026: "Player can walk under the
       staircases in the house, this shouldn't be possible". The stairs were a
       deck she could stand on and nothing she could walk INTO, so from the
       side or the back, where a step is taller than she can step up, she
       walked straight into the flight. Walls down both sides and across the
       back — in lengths of STAIR_SEG, each as tall as the LOWEST tread it
       runs past less a hair, so a kitten ON the stairs is always above the
       piece beside her, and none where a tread is low enough to step onto
       from the floor. The back stops STAIR_BACK under the top, because she
       walks up to within a radius of it on the last steps. */
    const tread = (z) => y0 + rise * Math.min(1, Math.max(0, (zBot - z) / L));
    for (let z1 = zBot; z1 > zTop + 1e-6; z1 -= STAIR_SEG) {
      const z0 = Math.max(zTop, z1 - STAIR_SEG);
      const y1 = tread(z1 + 0.9) - 0.1;
      if (y1 - y0 < 0.6) continue;
      for (const x of [xc - STAIR_W / 2, xc + STAIR_W / 2]) walls.push({ ax: x, az: z0, bx: x, bz: z1, y0: y0 - 0.5, y1, stairSide: f });
    }
    walls.push({ ax: xc - STAIR_W / 2, az: zTop, bx: xc + STAIR_W / 2, bz: zTop, y0: y0 - 0.5, y1: y0 + rise - STAIR_BACK, stairSide: f });
    decks.push({
      x0: xc - STAIR_W / 2, x1: xc + STAIR_W / 2, z0: zTop, z1: zBot, y: y0 + rise, step: 0.6, stair: f,
      yAt: (x, z) => y0 + rise * Math.min(1, Math.max(0, (zBot - z) / L)),
    });
    // a rail on the open side, which is also a collider so nobody walks off it
    const rx = xc - sx * (STAIR_W / 2);
    /* ...and it stops UNDER the floor above. Richard: "Unable to climb to the
       second floor in the castle house ... there is a barrier blocking the
       walking path at the top of the steps". It reached 2 over the upper
       floor, so up there it was a second wall along the stairwell, from the
       very back — and between it and the house's back wall was 1.2 of floor
       for a kitten 1.2 wide. The floor above has its own rails round the hole. */
    walls.push({ ax: rx, az: zTop, bx: rx, bz: zBot - 1.2, y0: y0 + 1.2, y1: y0 + rise - 0.15, rail: true });
    // 0.02 short of the top step's back, whose face it shared
    g.push(box(0.12, 1, L - 0.02, PALETTE.woodDark, rx, y0 + rise * 0.5 + 0.8, (zTop + zBot) / 2 + 0.01));
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
  /* THE ROOF IS SOMETHING TO STAND ON. Richard, Oct 2026: "when jumping on
     the roof, the player falls through ... if they are outside and land on
     top of the roof, then the roof should be drawn and the player should be
     able to collide with the roof and run around the roof." It was drawn
     and nothing else. Now it is a deck that is the roof's own surface
     (`roofOf`), reached only from above (a deck is one-way), and its eaves
     are a ceiling to a kitten jumping up under them (`HomeIsle.ceilingAt`). */
  const roofSurf = roofOf(tw, td, S.roof, yTop - 0.12);
  eaves.push(roofSurf);
  decks.push(...roofDecks(roofSurf));
  for (const E of eaves) if (E.band) decks.push(...roofDecks(E));
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
    floors, roof, accent, ridge, tint, walls, decks, floorY, half, base, front: pd, wells, eave, eaves,
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
    // (a LANDING of 2.2 behind it: she steps off the top and turns there)
    const zTop = -ud + 2.2;
    const zBot = Math.min(zTop + len, ud - 0.6);
    out.push({ floor: f, y0, rise, xc, sx, zTop, zBot, x0: xc - STAIR_W / 2, x1: xc + STAIR_W / 2, z0: zTop, z1: zBot });
    y0 += FLOOR_H;
  }
  return out;
}

/** The stairs' side walls come in lengths this long, each its own height. */
const STAIR_SEG = 1;
/** ...and the wall across the back stops this far under the top step. */
const STAIR_BACK = 0.6;

/**
 * A FLIGHT OF STAIRS AS ONE CLOSED SOLID: the side profile in (z, y) — up the
 * front riser, along each tread and up each riser to the top at zTop, down
 * the back and along the floor — swept from x0 to x1. Treads alternate the two
 * woods the box steps had, risers take the darker; flat-shaded, one mesh.
 */
export function stairSolid(x0, x1, zTop, zBot, y0, n, h, run) {
  const P = [[zBot, y0]];
  for (let k = 0; k < n; k++) {
    const z = zBot - k * run, y = y0 + (k + 1) * h;
    P.push([z, y], [Math.max(zTop, z - run), y]);
  }
  P.push([zTop, y0]);
  // the outline's turn: + is anticlockwise in (z, y)
  let area = 0;
  for (let i = 0; i < P.length; i++) { const [a, b] = P[i], [c, d] = P[(i + 1) % P.length]; area += a * d - c * b; }
  const sgn = Math.sign(area) || 1;
  const pos = [];
  const col = [];
  const tri = (A, B, C, nrm, c) => {
    // wind it to face `nrm`
    const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const flip = cr[0] * nrm[0] + cr[1] * nrm[1] + cr[2] * nrm[2] < 0;
    for (const V of flip ? [A, C, B] : [A, B, C]) { pos.push(...V); col.push(c.r, c.g, c.b); }
  };
  const C = (hex) => new THREE.Color(hex);
  const lightW = C(PALETTE.wood), darkW = C(0xb98a52);
  // the two side faces
  const flat = P.map(([z, y]) => new THREE.Vector2(z, y));
  const faces = THREE.ShapeUtils.triangulateShape(flat, []);
  for (const [x, nx] of [[x0, -1], [x1, 1]]) {
    for (const [a, b, c] of faces) tri([x, P[a][1], P[a][0]], [x, P[b][1], P[b][0]], [x, P[c][1], P[c][0]], [nx, 0, 0], darkW);
  }
  // round the outline: each edge swept across
  for (let i = 0; i < P.length; i++) {
    const [za, ya] = P[i], [zb, yb] = P[(i + 1) % P.length];
    if (Math.hypot(zb - za, yb - ya) < 1e-6) continue;
    // outward: the edge's right-hand normal on an anticlockwise outline
    const nz = (yb - ya) * sgn, ny = -(zb - za) * sgn;
    const k = Math.round((zBot - Math.max(za, zb)) / run);
    const c = Math.abs(yb - ya) < 1e-6 && ya > y0 + 1e-6 ? (k % 2 ? lightW : darkW) : darkW;
    const A = [x0, ya, za], B = [x1, ya, za], Cc = [x1, yb, zb], D = [x0, yb, zb];
    tri(A, B, Cc, [0, ny, nz], c);
    tri(A, Cc, D, [0, ny, nz], c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
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

/** The eave skirt: out past the wall by this much of the storey's half-width, */
const SKIRT_OVER = 0.32;
/** ...its eave this far below the storey's top, its foot this far above it. */
const SKIRT_EAVE = -0.5;
const SKIRT_FOOT = 0.3;

/**
 * The band of tiles round a storey with a smaller one on top: a hipped
 * frustum from the eave (hw, hd grown by SKIRT_OVER, at top + SKIRT_EAVE) up
 * to the foot of the storey above (uw, ud, at top + SKIRT_FOOT), faces up and
 * out like `pagodaRoof`'s. The eave corners lift, as the roof's do.
 */
function eaveBand(hw, hd, uw, ud, top, gaps = []) {
  if (gaps.length) return notchedBand(hw, hd, uw, ud, top, gaps);
  const ox = hw * (1 + SKIRT_OVER), oz = hd * (1 + SKIRT_OVER);
  const ix = uw + 0.05, iz = ud + 0.05;
  const y0 = top + SKIRT_EAVE, y1 = top + SKIRT_FOOT;
  const lift = 0.3;
  // outer ring then inner ring, corners in order round the rect
  const P = [
    [ox, y0 + lift, oz], [-ox, y0 + lift, oz], [-ox, y0 + lift, -oz], [ox, y0 + lift, -oz],
    [ix, y1, iz], [-ix, y1, iz], [-ix, y1, -iz], [ix, y1, -iz],
  ];
  // mid-edge eave points, unlifted, so the corners curl and the sides do not
  const M = [[0, y0, oz], [-ox, y0, 0], [0, y0, -oz], [ox, y0, 0]];
  const M1 = [[0, y1, iz], [-ix, y1, 0], [0, y1, -iz], [ix, y1, 0]];
  const pos = [...P, ...M, ...M1].flat();
  const idx = [];
  for (let k = 0; k < 4; k++) {
    const o0 = k, o1 = (k + 1) % 4, i0 = 4 + k, i1 = 4 + (k + 1) % 4, om = 8 + k, im = 12 + k;
    // each side in two halves: corner k → mid → corner k+1
    idx.push(o0, i0, im, o0, im, om, om, im, i1, om, i1, o1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** A bridge's notch in the eave band is this much wider than its doorway, each side. */
export const EAVE_GAP = 0.5;

/**
 * An eave band with NOTCHES: the same frustum as `eaveBand`, side by side,
 * cut into pieces along each side at every gap's ends and at the corners, and
 * the pieces inside a gap left out. A side's outer edge lifts toward its
 * corners exactly as the whole band's does; each piece's inner edge is the
 * point straight in from its outer one (clamped to the inner corners, which
 * makes the hips), so a notch's two cuts run square out from the wall.
 */
function notchedBand(hw, hd, uw, ud, top, gaps) {
  const ox = hw * (1 + SKIRT_OVER), oz = hd * (1 + SKIRT_OVER);
  const ix = uw + 0.05, iz = ud + 0.05;
  const y0 = top + SKIRT_EAVE, y1 = top + SKIRT_FOOT;
  const lift = 0.3;
  const pos = [];
  /* band side k runs from corner k to k + 1 as `eaveBand` numbers them:
     front (+z, x falling), -x (z falling), back (-z, x rising), +x (z rising);
     `door` is the opening side the same wall has (0 front, 1 +x, 2 back, 3 -x) */
  const SIDES = [
    { door: 0, o: ox, i: ix, from: ox, to: -ox, at: (u, w, y) => [u, y, w], w0: oz, w1: iz },
    { door: 3, o: oz, i: iz, from: oz, to: -oz, at: (u, w, y) => [-w, y, u], w0: ox, w1: ix },
    { door: 2, o: ox, i: ix, from: -ox, to: ox, at: (u, w, y) => [u, y, -w], w0: oz, w1: iz },
    { door: 1, o: oz, i: iz, from: -oz, to: oz, at: (u, w, y) => [w, y, u], w0: ox, w1: ix },
  ];
  for (const S of SIDES) {
    const G = gaps.filter((g) => g.side === S.door);
    const cuts = new Set([S.from, S.to, -S.i, S.i, 0]);
    for (const g of G) { cuts.add(Math.max(-S.o, Math.min(S.o, g.lo))); cuts.add(Math.max(-S.o, Math.min(S.o, g.hi))); }
    const us = [...cuts].sort((a, b) => (S.to > S.from ? a - b : b - a));
    for (let j = 0; j + 1 < us.length; j++) {
      const ua = us[j], ub = us[j + 1];
      const lo = Math.min(ua, ub), hi = Math.max(ua, ub);
      if (hi - lo < 1e-4 || G.some((g) => lo < g.hi - 1e-6 && hi > g.lo + 1e-6)) continue;
      const O = (u) => S.at(u, S.w0, y0 + lift * Math.abs(u) / S.o);
      const I = (u) => S.at(Math.max(-S.i, Math.min(S.i, u)), S.w1, y1);
      // as `eaveBand` winds a half-side: outer, inner, inner next; outer, inner next, outer next
      pos.push(...O(ua), ...I(ua), ...I(ub), ...O(ua), ...I(ub), ...O(ub));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * The eave band round storey f as a SURFACE: where it is, how high it is at
 * a point (`roofY`), and its notches. The lift at the corners is left out —
 * 0.3 at the very tip of a hip — so a kitten on a corner stands a hair inside
 * the tiles rather than on a seam.
 */
function bandOf(hw, hd, uw, ud, top, gaps, f) {
  return {
    band: true, f, ox: hw * (1 + SKIRT_OVER), oz: hd * (1 + SKIRT_OVER), ix: uw + 0.05, iz: ud + 0.05,
    y0: top + SKIRT_EAVE, y1: top + SKIRT_FOOT, gaps,
  };
}

/** The top roof as a surface: `pagodaRoof`'s own height, ring by ring (no corner lift). */
function roofOf(tw, td, h, y) {
  return { roof: true, ox: tw * 1.42, oz: td * 1.42, ix: tw, iz: td, y, h, gaps: [] };
}

/**
 * The height of roof surface E over house-local (x, z), or null off it (or in
 * a notch). A band runs from its eave up to the foot of the storey above; the
 * roof is `pagodaRoof`'s y = h * t^1.75 with t = 1 - the ring the point is on.
 */
export function roofY(E, x, z) {
  if (E.band) {
    const qx = (E.ox - Math.abs(x)) / (E.ox - E.ix), qz = (E.oz - Math.abs(z)) / (E.oz - E.iz);
    const q = Math.min(qx, qz);
    if (q < 0 || q > 1) return null;
    // which side's band it is on, and how far along that side
    const door = qx < qz ? (x > 0 ? 1 : 3) : (z > 0 ? 0 : 2);
    const along = qx < qz ? z : x;
    if (E.gaps.some((g) => g.side === door && along > g.lo && along < g.hi)) return null;
    return E.y0 + (E.y1 - E.y0) * q;
  }
  const s = Math.max(Math.abs(x) / E.ox, Math.abs(z) / E.oz);
  if (s > 1) return null;
  return E.y + E.h * Math.pow(1 - s, 1.75);
}

/**
 * A roof surface as decks, in the house's frame: rectangles that cover it,
 * each reading its height off `roofY` — the band's four sides round the
 * storey above, each in pieces round its notches; the roof one rectangle.
 */
function roofDecks(E) {
  const mk = (x0, x1, z0, z1) => ({
    x0, x1, z0, z1, y: E.band ? E.y1 : E.y + E.h, step: 0.6, roof: E.band ? E.f : 'top',
    yAt: (x, z) => roofY(E, x, z) ?? (E.band ? E.y0 : E.y),
  });
  if (!E.band) return [mk(-E.ox, E.ox, -E.oz, E.oz)];
  const out = [];
  // a strip from a to b along one axis, less the notches on that side
  const strip = (lo, hi, door, put) => {
    let from = lo;
    for (const g of E.gaps.filter((q) => q.side === door).sort((p, q) => p.lo - q.lo)) {
      if (g.lo - from > 0.05) put(from, Math.min(hi, g.lo));
      from = Math.max(from, g.hi);
    }
    if (hi - from > 0.05) put(from, hi);
  };
  strip(-E.ox, E.ox, 0, (a, b) => out.push(mk(a, b, E.iz, E.oz)));
  strip(-E.ox, E.ox, 2, (a, b) => out.push(mk(a, b, -E.oz, -E.iz)));
  strip(-E.iz, E.iz, 1, (a, b) => out.push(mk(E.ix, E.ox, a, b)));
  strip(-E.iz, E.iz, 3, (a, b) => out.push(mk(-E.ox, -E.ix, a, b)));
  return out;
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

/**
 * The ground a house takes, in its own frame: the plinth and its porch, and
 * the castle's ramp out of the front door. What a yard thing, another house
 * and a bridge's feet keep off — a rectangle, not `houseRadius`'s circle round
 * its corners. Richard: "there seems to be a big 'No build buffer zone'
 * around houses that should be smaller".
 */
export function houseFoot(houseId) {
  const S = SHAPES[houseId] ?? SHAPES.minka;
  const [w, d] = S.floors[0];
  const pw = w + S.porch, pd = d + S.porch;
  return { x0: -pw, x1: pw, z0: -pd, z1: pd + (S.base > 0.8 ? S.base / 0.32 : 0) };
}

/** Floor k's outer half-sizes and its floor height, without building it. */
export function floorOf(houseId, k) {
  const S = SHAPES[houseId] ?? SHAPES.minka;
  if (k < 0 || k >= S.floors.length) return null;
  return { hw: S.floors[k][0], hd: S.floors[k][1], y: S.base + k * FLOOR_H };
}

/** The footprint radius — plots and the statue keep clear of it. */
export function houseRadius(houseId) {
  const S = SHAPES[houseId] ?? SHAPES.minka;
  const [w, d] = S.floors[0];
  return Math.hypot(w + S.porch, d + S.porch) + (S.base > 0.8 ? S.base / 0.32 : 0) * 0.5;
}
