import * as THREE from 'three';
import { POWER_ORBS, PowerOrbPickup, WARD, AEGIS, DODGE, CHARGE, PARRY, lockRangeFor, parryWindowFor } from '../../entities/powerorb.js';
import { SIM, HOLO } from '../../world/simworld.js';
import { HoloPanel } from './holo.js';
import { Post, Tile, Mat, HoloKitten, BLADE_KINDS, holoMat } from './targets.js';
import { SCREEN } from './kata.js';
import { COMBAT } from '../../entities/player.js';

/* ---------------------------------------------------------------------------
   THE KOTODAMA GALLERY — every orb in the game, one at a time, in your paws.

   Richard: "they can look at each individual powerup Kotodama orb and can
   learn what they do and how each ability works." So: a pedestal per orb
   (thirteen since the dealer's three rare ones were merged) in a horseshoe, open toward the bridge, one orb floating over each. Walk up to
   one and its card lights — what it is, what it does, which button — and
   press INTERACT to be LENT it and dropped into a short drill that cannot be
   passed without it.

   THE DRILL IS THE EXPLANATION. A card that says "one more jump in the air"
   is a sentence; a star on a ledge that two jumps cannot reach and three
   can is the sentence happening to her. Every drill below is built so the
   orb is the difference between failing and passing — the numbers in each
   comment are the measurement that makes it so.

   A LOAN, NOT A GIFT. The orb is hers until she disconnects, and only in here:
   `DreamDojo.lend` folds it into `p.power` and her worn ring and never into
   `powerOrbs`, so it cannot be traded, saved, stolen in the ring or sold.
   Nothing is lost (4) and nothing is duplicated.

   BEFORE THE AWAKENING TOO. The orbs do not exist in the real world until the
   town reaches 100%, and that is exactly when a kitten most wants to know
   what she is going to be fighting for. The gallery is open from the first
   afternoon.
--------------------------------------------------------------------------- */

/** How to use each one, with `{action}` for her own button. */
export const HOW_TO = {
  swift: 'Just run — hold {sprint} to go faster',
  reach: 'Swing {attack} from further away',
  vigor: 'A bigger SIM bar here, more health in the ring',
  leap: 'Press {jump} again in the air',
  ward: 'HOLD {mount} for a shield',
  dive: '{jump}, then {interact} in the air',
  tri: 'HOLD {attack} for three cuts',
  charge: 'Hold {sprint} and press {attack}',
  aegis: 'With Ward: HOLD {mount} for longer',
  blink: 'Hold {sprint} and press {interact}',
  far: 'Face them, hold {sprint} and press {interact} from further away',
  parry: 'Stand still, HOLD {interact}, then PUSH the stick at them',
  longparry: 'With Riposte: your guard stays up longer',
};

/** What each drill lends, beyond the orb itself. */
/* What else a drill lends with its own orb. Long Guard needs a Ward to guard
   WITH, and is lent as a pair: one Nagamori is 0.36s of slack on the beam,
   which a child who raises the shield early runs out of (measured — she held
   from 0.39s before it fired and lost the last two frames); two is a second. */
/* The three rare ones are each useless alone or a booster: 遠 Far Step needs a
   瞬 to stretch, and 間 Long Parry a 返 to lengthen. One of each is the
   difference their drills measure (`farRing`, PARRY_LATE). */
export const NEEDS = { aegis: ['ward', 'aegis'], far: ['blink'], longparry: ['parry'] };

/* THE NUMBERS EACH DRILL IS A GATE ON, exported so `world-check` measures
   them against the real reach and the real jump rather than against these
   comments — which had a three-jump climb wrong by six tenths for a day. */
/** 斬: posts are cut from outside a ring this wide. */
export const REACH_RING = 4.3;
/** 跳: the tall step of the tower — three jumps' worth (see the drill). */
export const LEAP_DECK = 5.7;
/* 遠: A FRACTION OF THE LIVE LOCK RANGE, NOT A DISTANCE. The first cut was
   16.5 and 19.5, against the shipped 15 — and the balance page has Lock range
   at 10 (tuning.json), where one Far Step reaches 15 and the spot was out of
   reach even with the orb. world-check caught it. One Far Step is 1 + farK
   (1.5) of it, so the ring sits between 1 and that whatever it is tuned to. */
/** The pedestal's card: world units, and how high its bottom edge sits over
 *  the floor. Sized for wrapped lines (`galleryCardLines`).
 *
 *  WIDE AND SHORT, AND OVER HER RATHER THAN OVER THE PEDESTAL, because her
 *  camera is high and keeps one bearing. Measured by `world-check`, which
 *  stands her at 16 points round each of the 13 pedestals with her own
 *  camera settled and asks where the card's corners land (NDC):
 *   - the first wrapped card, 8.2 x 6.4 from 4.5 up over the pedestal: its
 *     top at 1.05 from the station — the top line was gone;
 *   - 10 x 5.2 from 4.3, still over the pedestal: 1.08 with her on its far
 *     side, because whatever is beyond her rides UP the frame toward the
 *     horizon;
 *   - hung 3-4 toward the lens instead: in the frame (0.87), but with her
 *     behind the pedestal it lay across her by 0.22-0.33;
 *   - halfway between her and the pedestal: 1.03.
 *  Over the kitten reading it, the card is where her camera always is, so
 *  every spot reads the same: top 0.90 at worst, lower edge 0.17 clear of
 *  her head. It no longer sits over the orb, so it may come down past the
 *  orb's name (3.75) to 3.8. 10 wide holds the 112-character Riposte blurb in
 *  four rows at 0.44 units a letter — the size the tall card had.
 *
 *  The pedestals are 8 apart, which is why only her NEAREST card lights
 *  (`update`): two cards for one kitten would be one on top of the other. */
export const GALLERY_CARD = { w: 10, h: 5.2, bottom: 3.8 };

/**
 * What a pedestal's card says, in order. The blurb and the how-to WRAP, at
 * sizes picked to be read from where she stands at the pedestal: the blurb
 * and the how-to are 0.85 of a tenth of the card (0.44 units a line, against
 * 0.32 nominal before — and far less once a long one was squeezed onto one
 * row). Pure, for `world-check`.
 */
export function galleryCardLines(s, howTo, stars) {
  return [
    { text: `${s.kanji}  ${s.name}`, size: 1.2, color: s.color, glow: true, jp: true },
    { text: s.label, size: 0.7, color: 0x9fefff },
    { text: s.blurb, size: 0.85, wrap: true },
    { text: howTo, size: 0.85, color: HOLO.gold, wrap: true },
    { text: `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`, size: 0.75, color: HOLO.gold },
  ];
}

/** 遠: a Flash Step only counts if it locked from outside this ring round the
 *  holo-kitten — past a bare Lock range, inside one Far Step's. */
export const farRing = () => DODGE.range * 1.12;
/** 遠: she has gone somewhere when the step carried her this far. */
export const FAR_MOVED = 1.5;
/** 返: the holo-kitten's tell, white and still, lasts this long before the
 *  blow — longer than a bare window (0.35), so a guard raised AT the flash
 *  has closed by the time it lands. The read is when, not just whether. */
export const PARRY_TELL = 0.7;
/** 間: this one WAITS — its blow lands this long after she raises her guard.
 *  Past a bare window, inside one Long Parry's (0.525). */
export const PARRY_LATE = 0.42;
/** 間: ...unless she never raises it, and then it lands at the end of this. */
export const PARRY_TELL_MAX = 1.4;

/* ----------------------- the Oct 2026 pass's numbers ----------------------
   Richard's notes on every drill, Oct 2026 — quoted beside each drill below.
   Exported so `world-check` measures them against the real jump, reach and
   shield rather than against these comments. */
/** 疾: the bands, one second kinder at three stars (9.5 -> 10.5). */
export const GALE_BANDS = [25, 13, 10.5];
/** 疾: a gate's yaw — its face toward the floor's centre `c`. */
export const GALE_FACE = (q, c) => Math.atan2(q.x - c.x, q.z - c.z);
/** 剛: the gold circle's inner edge, the count-in once she is in it, and the
 *  closer camera she gets there (the walking one is 24-34 out at 0.66). */
export const ADAMANT_RING = 5.6;
export const ADAMANT_GRACE = 2;
export const ADAMANT_CAM = { dist: 16, pitch: 0.5 };
/** 跳: the tower. A step of LEAP_STEP is one jump; LEAP_DECK is three. Flat
 *  rows with `sway` drift in and out from the middle over LEAP_SWAY_T. */
export const LEAP_STEP = 1.6;
export const LEAP_R = 2.0;
export const LEAP_SPIRAL = 11;
export const LEAP_SWAY_T = 4;
export const LEAP_CLIMB = [
  { up: LEAP_STEP, turn: 0 },
  { up: LEAP_STEP, turn: 26 },
  { up: LEAP_DECK, turn: 40 },
  { up: LEAP_STEP, turn: 26 },
  { up: 0, turn: 30, sway: 2 },
  { up: LEAP_STEP, turn: 26 },
  { up: LEAP_DECK, turn: 40 },
  { up: LEAP_STEP, turn: 26 },
  { up: 0, turn: 30, sway: 2 },
  { up: LEAP_STEP, turn: 26 },
  { up: LEAP_STEP, turn: 26 },
  { up: LEAP_DECK, turn: 40 },
];
/** 跳: the CHECKPOINT is the second-to-last step (`LEAP_CHECK` from the
 *  top): once she has stood on it, a fall puts her back on it, and her camera
 *  is behind her and above, looking up the last tall step. */
export const LEAP_CHECK = 2;
/* Above the walking camera's 0.66 ("from a distance and from above"), and
   a little further out than its 24, so the step she is on and the one she
   is jumping to are both in the pane. */
export const LEAP_CAM = { dist: 26, pitch: 0.78 };
/** 跳: what a missed tall step says, and the checkpoint's line. */
export const LEAP_MISS = 'Missed it! The tall steps need a TRIPLE JUMP — press jump THREE times';
export const LEAP_BACK = 'Back up you go — TRIPLE JUMP to the star!';
/** 壁: three stars — no bolt landed, and done inside this. */
export const WARD_GOLD = 18;
/** 十: posts stand CROSS_R from her; in the air, CROSS_AIR up, and answering
 *  only to a kitten above the floor (CROSS_AIR_UP narrows the window: from
 *  the floor its middle is 3.3 over her, past 3.4 - 1.2).
 *  FURTHER OUT, AND AIMED AT. Richard, Oct 2026: "have the targets be further
 *  away from the player (although within striking distance) so that it is
 *  slightly harder to hit them because the player has to aim where they
 *  swing." 2.4 -> 3.2, against a reach of 4.0 (A.reach 3.4 + the post's 0.6).
 *  Further alone changes nothing — the gate's test is an ANGLE, and the
 *  Cross Slash's is a 150-degree fan (cos -0.25) at any distance — so each
 *  post also asks to be aimed at within CROSS_AIM (cos 0.5, 60 degrees
 *  either side): wide enough for a keyboard's eight directions (22.5 off at
 *  worst), narrow enough that two posts a third of a turn apart are two cuts. */
export const CROSS_R = 3.2;
export const CROSS_AIM = 0.5;
/** 十: the last level's next post fades in where it will be for this long
 *  before it can be cut — "Maybe 0.5s before the first cut". */
export const CROSS_GHOST = { t: 0.5, alpha: 0.4 };
export const CROSS_AIR = 2.0;
export const CROSS_AIR_UP = -1.2;
export const CROSS_LEVELS = [
  { name: 'One post — land all three cuts', posts: [0], hits: 3 },
  { name: 'In front AND behind', posts: [0, 180] },
  { name: 'All round you', posts: [0, 120, 240] },
  { name: 'Moving round you', posts: [0, 120, 240], orbit: 0.9 },
  { name: 'In the air — jump, then slash', posts: [0, 120, 240], air: true },
  { name: 'Catch them as they appear', posts: [0, 0, 0], chain: true },
];
/** 突: the tops of one and of two jumps without the Leap orb (JUMP_V 11.2,
 *  GRAVITY 26, the last jump of a chain x0.86), and how far either side of
 *  its height a set in the air answers. world-check measures all three. */
export const CHARGE_ONE = 2.4;
export const CHARGE_TWO = 4.2;
export const AIR_BAND = 0.9;
/* ON THE SCREEN'S OWN AXES. Richard, Oct 2026: "it is hard to do these drills
   on keyboard since they require the diagonal movements (like Northwest,
   Southwest, etc. which require two fingers per key rather than 1), we should
   instead rotate them so they require more cardinal movements with the
   Charge ... We can have half of the first 2 drills be diagonal, but after
   that, should be cardinal directions." The parts were laid out on the
   island's own `fwd`, which is a spoke off the hub and nothing to do with the
   camera — whose yaw never turns in here (kata.js `SCREEN`) — so every row
   came out at some angle to the screen. Now `at` is [screen-up, screen-right]
   from the floor's middle and `dir` is degrees from screen-up toward
   screen-right: 0/90/180/270 are one key, 45/135 two. Parts 1 and 2 have two
   of each; 3, 4 and 5 are all one key. */
export const CHARGE_PARTS = [
  { name: 'Four sets', start: [-3, 0], sets: [
    { at: [8, 0], dir: 90, gap: 3 }, { at: [-8, 0], dir: 90, gap: 3 },
    { at: [0, 8], dir: 45, gap: 3 }, { at: [0, -8], dir: 135, gap: 3 }] },
  { name: 'Spread out — start at the first one', start: [-3, 0], sets: [
    { at: [11, 0], dir: 90, gap: 5.5 }, { at: [-11, 0], dir: 90, gap: 5.5 },
    { at: [0, 11], dir: 45, gap: 5.5 }, { at: [0, -11], dir: 135, gap: 5.5 }] },
  { name: 'In the air — jump, then charge', start: [-3, 0], sets: [
    { at: [8, 0], dir: 90, gap: 3, h: CHARGE_ONE }, { at: [-8, 0], dir: 90, gap: 3, h: CHARGE_TWO },
    { at: [0, 8], dir: 0, gap: 3, h: CHARGE_ONE }, { at: [0, -8], dir: 0, gap: 3, h: CHARGE_TWO }] },
  { name: 'In the air AND spread out', start: [-3, 0], sets: [
    { at: [11, 0], dir: 90, gap: 5.5, h: CHARGE_ONE }, { at: [-11, 0], dir: 90, gap: 5.5, h: CHARGE_TWO },
    { at: [0, 11], dir: 0, gap: 5.5, h: CHARGE_ONE }, { at: [0, -11], dir: 0, gap: 5.5, h: CHARGE_TWO }] },
  /* THE L, OUT OF PART 4. Richard, Oct 2026: "where the player has to jump
     charge twice in the L-shape, it is currently too difficult and the blocks
     are not in the correct placement, we can use the placement of the blocks
     on part 4 for the placement of part 5." So these are two of part 4's sets
     exactly — its top row (one jump) and its left column (two) — and the
     corner between them is the L: charge LEFT along the top, jump, charge
     DOWN the left. The old L had its high row 13 out against a charge that
     ended wherever she had started it; from this start (7 right of the top
     row's middle) the first charge ends at -9, two from the column's line
     against a charge radius of 3.3 (CHARGE.radius 2.4 + a mat's 0.9). */
  { name: 'Low set, jump, high set — no landing', start: [11, 7], face: 0, combo: true, sets: [
    { at: [11, 0], dir: 270, gap: 5.5, h: CHARGE_ONE }, { at: [0, -11], dir: 180, gap: 5.5, h: CHARGE_TWO }] },
];
/** The Long Guard beam: past a bare Ward (2.2s), well short of the lent pair
 *  (3.4s) — once GUARD.grow is added, which is how long she sees it coming. */
export const BEAM_T = WARD.max + WARD.tail + AEGIS.add * 0.4;
/** 守: the turrets' ring, how long they take to rise, then each volley's
 *  charge, hold, grow and the pause after ("a 2-3 secs pause"). */
export const GUARD = { r: 10, rise: 0.9, charge: 1.0, hold: 1.0, grow: 0.25, pause: 2.5 };
/** 守: each level's beam, after it reaches her: short, longer, the old one. */
export const GUARD_BEAMS = [1.0, 1.5, BEAM_T];
/** 瞬: the levels, a wall's beams (six: three was a wall two jumps clear),
 *  the floating star's height and flat reach, and the shield-bearer. */
export const BLINK_LEVELS = 4;
export const BLINK_WALL = [0.4, 1.3, 2.2, 3.1, 4.0, 4.9];
export const BLINK_AIR_Y = 2.6;
export const BLINK_AIR_REACH = 3.0;
/** 瞬: "it takes the enemy 0.75s before they face the player again" —
 *  `wait`, then half a turn at `rate`: 0.35 + PI / rate = 0.75. */
export const SHIELD_TURN = { wait: 0.35, rate: Math.PI / 0.4 };
export const SHIELD_HITS = 3;
/** The beat between one level clearing and the next being built. */
export const LEVEL_PAUSE = 1.0;
/** 返 / 間: how long a holo-kitten's sword takes to come down. */
export const SWORD_SWING = 0.3;
/** 間: the pack's levels — `from` is [degrees off fwd, a step to the side]. */
export const PACK_LEVELS = [
  { name: 'One partner — catch three', from: [[0, 0]], need: 3 },
  { name: 'Two at once, from one side', from: [[0, -1.2], [0, 1.2]], need: 3 },
  { name: 'Three round you — lead them to ONE side', from: [[0, 0], [120, 0], [240, 0]], need: 1 },
];
/** 間: where they start, how close they come, how fast, how far apart they
 *  keep, how far they step back after a catch and how long they wait then —
 *  past her guard's own cool-down (PARRY.cool 1.2 after the 0.26 answer). */
export const PACK_SPAWN = 8;
export const PACK_CLOSE = 2.0;
export const PACK_SPEED = 4.5;
export const PACK_GAP = 1.5;
export const PACK_BACK = 4.5;
export const PACK_REST = 1.8;

export class Gallery {
  constructor(dream, isle) {
    this.dream = dream;
    this.isle = isle;
    this.pedestals = [];
    this.stations = [];
    this._build();
  }

  _build() {
    const { dream, isle } = this;
    const sim = dream.sim;
    const f = isle.fwd;
    const r = { x: -f.z, z: f.x };
    /* A HORSESHOE OPEN TO THE BRIDGE. Ten over 290 degrees, the gap facing
       the way in, so the first thing she walks into is the middle of the
       floor and every orb is in front of her. */
    const n = POWER_ORBS.length;
    const R = isle.r - 5;
    POWER_ORBS.forEach((spec, i) => {
      const a = THREE.MathUtils.degToRad(-145 + (290 * i) / (n - 1));
      // Angle 0 is straight ahead (away from the bridge).
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const x = isle.x + (f.x * ca + r.x * sa) * R;
      const z = isle.z + (f.z * ca + r.z * sa) * R;
      const base = new THREE.Group();
      base.position.set(x, isle.y, z);
      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 1.15, 1.1, 6),
        new THREE.MeshBasicMaterial({ color: 0x0b2734, transparent: true, opacity: 0.9 })
      );
      col.position.y = 0.55;
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.9, 1.15, 1.1, 6)),
        new THREE.LineBasicMaterial({ color: spec.color, toneMapped: false })
      );
      edge.position.y = 0.55;
      const pad = new THREE.Mesh(
        new THREE.RingGeometry(1.7, 2.0, 40).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0.6, toneMapped: false, depthWrite: false })
      );
      pad.position.y = 0.04;
      base.add(col, edge, pad);
      sim.root.add(base);
      const orb = new PowerOrbPickup(spec, x, isle.y + 0.9, z);
      sim.root.add(orb.group);
      /* The card, over the orb and toward the floor's centre, so it is
         between the orb and the camera for a kitten walking up to it. */
      /* TALLER, SO THE WORDS CAN BE BIG. Richard: "The subtext on the
         kotodama orbs in the simulator is too small and can't be read. It is
         okay if the subtext is more than 1 line long and made bigger." The
         card was 6.6 x 3.4 with every line squeezed onto one row; the blurb
         and the how-to now wrap (`layoutLines`, dream/holo.js), and the card
         is GALLERY_CARD to hold them — wider rather than taller, because her
         camera is high and a tall card's top left the frame. */
      // Its height only: it is put over whoever is reading it (`_placeCard`).
      const card = new HoloPanel({ w: GALLERY_CARD.w, h: GALLERY_CARD.h, px: 96, edge: spec.color });
      card.position.set(x, isle.y + GALLERY_CARD.bottom + GALLERY_CARD.h / 2, z);
      card.visible = false;
      sim.root.add(card);
      const ped = { spec, x, z, orb, card, pad, show: 0 };
      this.pedestals.push(ped);
      this.stations.push({
        x, z, y: isle.y, r: 2.2,
        prompt: (p, key) => `[${key}]  TRY ${spec.label} — ${spec.kanji}`,
        // At three stars it asks first: the trial, or another holo orb.
        interact: (p) => this.dream.pedestal(p, spec.id, () => this.start(p, ped)),
      });
    });
    sim.tickers.push((dt) => this.update(dt));
  }

  /** Her own button for an action, as the HUD would print it. */
  key(p, action) {
    return this.dream.key(p, action);
  }

  howTo(p, id) {
    return (HOW_TO[id] ?? '').replace(/\{(\w+)\}/g, (_, a) => `[${this.key(p, a)}]`);
  }

  /** Put the card over the kitten reading it (see GALLERY_CARD), eased so it
   *  glides rather than jitters as she moves; on the frame it lights it is
   *  simply there. */
  _placeCard(ped, p, dt) {
    const tx = p.position.x - SIM.dx;
    const tz = p.position.z - SIM.dz;
    const k = ped.show < 0.05 ? 1 : Math.min(1, dt * 8);
    ped.card.position.x += (tx - ped.card.position.x) * k;
    ped.card.position.z += (tz - ped.card.position.z) * k;
  }

  /** The card for whichever kitten is nearest it. */
  _paintCard(ped, p) {
    const s = ped.spec;
    const stars = this.dream.progress.stars(p.style?.name ?? p.name, `gallery.${s.id}`);
    ped.card.set(galleryCardLines(s, this.howTo(p, s.id), stars), s.color);
  }

  update(dt) {
    /* A kitten in a drill has the drill's card over her head; the pedestal's
       card is the same height over the same spot and lands on top of it. */
    const inside = this.dream.simKittens().filter((p) => !this.dream.drills[p.index]);
    /* HER NEAREST CARD ONLY. Each card lit for any kitten within 9, and the
       pedestals are 8 apart, so a kitten reading one had both neighbours'
       cards up beside it — harmless at 6.6 wide, overlapping at 10. */
    const lit = new Map();
    for (const p of inside) {
      let best = null;
      let bd = 9;
      for (const ped of this.pedestals) {
        const d = Math.hypot(p.position.x - SIM.dx - ped.x, p.position.z - SIM.dz - ped.z);
        if (d < bd) { bd = d; best = ped; }
      }
      if (best && !(lit.get(best)?.d <= bd)) lit.set(best, { p, d: bd });
    }
    for (const ped of this.pedestals) {
      ped.orb.update(dt);
      const near = lit.get(ped)?.p ?? null;
      if (near) {
        this._paintCard(ped, near);
        this._placeCard(ped, near, dt);
      }
      ped.show += ((near ? 1 : 0) - ped.show) * Math.min(1, dt * 6);
      ped.card.visible = ped.show > 0.03;
      ped.card.mat.opacity = ped.show;
      ped.pad.material.opacity = 0.45 + 0.25 * Math.sin(this.dream.t * 3 + ped.x);
    }
  }

  faceCamera(camera) {
    for (const ped of this.pedestals) {
      ped.orb.faceCamera(camera);
      if (ped.card.visible) ped.card.faceCamera(camera);
    }
  }

  /** She pressed INTERACT on a pedestal: lend it, and run its drill. */
  start(p, ped) {
    const id = ped.spec.id;
    this.dream.lend(p, [...(NEEDS[id] ?? []), id]);
    const spec = DRILLS[id]?.(this, p);
    if (!spec) return false;
    this.dream.startDrill(p, { kanji: ped.spec.kanji, ...spec, id: `gallery.${id}` }, this.floor());
    return true;
  }

  /** The drill floor: the island's middle, facing away from the bridge. */
  floor() {
    const i = this.isle;
    return { x: i.x, y: i.y, z: i.z, r: i.r, fwd: i.fwd };
  }
}

/* ------------------------------- the drills ------------------------------ */

/**
 * One builder per orb. Each returns a drill spec (see drill.js). `g` is the
 * Gallery, `p` the kitten. Thresholds are in seconds unless `score` says not.
 */
export const DRILLS = {
  /* 疾 GALE. Eight gates in a ring, run in star order, each one lit only when
     the last is through. A star is ~18.5 units a leg: 148 units in all, so a
     sprint (17 u/s) is ~9s of running before the turns.
     THE GATES LOOK AT THE MIDDLE. Richard, Oct 2026: "all hoops facing in a
     circle towards the center so that they are forming a circle and look less
     random". Each faced the NEXT gate, which on a star is a different chord
     every time — eight hoops at eight unrelated angles. Now every one looks
     at the floor's centre (GALE_FACE), so the eight read as one ring; a gate
     is passed by being inside its circle, whichever way she comes through.
     "make it a bit easier to get 3 stars, maybe make it an extra second":
     9.5 -> 10.5. */
  swift: (g, p) => ({
    title: 'GALE DRILL', goal: 8, time: 25, bands: GALE_BANDS,
    goalText: 'Run through the gates in order', countLabel: 'gates ',
    setup(d) {
      const c = d.spot(0, 0);
      const pts = [];
      for (let i = 0; i < 8; i++) {
        const a = (i * 3 * Math.PI * 2) / 8;
        pts.push(d.spot(Math.cos(a) * 9.5, Math.sin(a) * 9.5));
      }
      d.gateList = pts.map((q, i) => {
        const rr = d.ring({ x: q.x, y: q.y, z: q.z, yaw: GALE_FACE(q, c), r: 1.9, onPass: () => armNext(d, i) });
        rr.armed = i === 0;
        if (i) rr.setColour(0x335566);
        return rr;
      });
    },
  }),

  /* 斬 LONG CUT. A red ring round each post at REACH_RING. The gate's reach
     is A.reach + 0.6 of padding: 4.0 bare, 5.0 with one Nagagiri (x1.30) — so
     from outside the ring, only the lent blade arrives. A cut from inside is
     refused and she is told to step back. */
  reach: (g, p) => ({
    title: 'LONG CUT DRILL', goal: 5, time: 30, bands: [30, 16, 10],
    goalText: 'Cut each post from OUTSIDE its red ring', countLabel: 'posts ',
    setup(d) {
      const pts = [[0, 0], [6, -6], [6, 6], [-6, -6], [-6, 6]];
      for (const [a, b] of pts) {
        const q = d.spot(a, b);
        const t = d.target(Post, {
          x: q.x, y: q.y, z: q.z,
          accept: (info) => info.dist >= REACH_RING,
          onRefuse: () => d.dream.hint(d.p, 'Step back — cut from OUTSIDE the red ring'),
          onBreak: () => d.progress(),
        });
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(REACH_RING - 0.15, REACH_RING, 48).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: 0xff3b5b, transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false })
        );
        ring.position.y = 0.06;
        t.group.add(ring);
      }
    },
  }),

  /* 剛 ADAMANT. Stand inside the circle for twelve seconds while two shin-
     high beams sweep round in opposite directions. Each beam is jumpable;
     two of them, crossing, are not always. A hit is 15 of the SIM bar, so
     bare (100) she can take six and lent (130) she can take eight. The score
     is how much bar she still has.
     IT WAITS FOR HER. Richard, Oct 2026: "the drill is starting before the
     player gets to the circle, the drill should not start until the player
     gets into the circle, then the lazers should spawn, and there should be a
     second or two before the trial begins." She starts it at the pedestal,
     19 units out, and the twelve seconds were running while she walked in.
     Now: the circle alone (`startZone`), the beams only once she is in it
     (`arrived`), then ADAMANT_GRACE of count-in with them already turning so
     she sees what is coming. "in the least, would be good to have the camera
     zoom in when the player is in the circle": ADAMANT_CAM, from the moment
     she is in it. NOT A JUMP ROPE — he asked — they are two clock hands at
     shin height going opposite ways; she hops each one as it reaches her. */
  vigor: (g, p) => ({
    title: 'ADAMANT DRILL', goal: 1, time: 12, timeWins: true, showCount: false,
    goalText: 'Stay in the circle — jump the beams', score: (d) => d.dream.simFrac(d.p),
    arriveText: 'Walk into the gold circle to start', grace: ADAMANT_GRACE,
    lowerIsBetter: false, bands: [0.01, 0.45, 0.75],
    doneText: (d) => `${Math.round(d.dream.simFrac(d.p) * 100)}% of your bar left`,
    startZone: (d) => ({ ...d.spot(0, 0), r: ADAMANT_RING - 1 }),
    camera: (d) => (d.state === 'arrive' ? null : adamantCam(d)),
    setup(d) {
      const c = d.spot(0, 0);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(ADAMANT_RING, ADAMANT_RING + 0.3, 48).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: HOLO.gold, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false })
      );
      ring.position.set(c.x, c.y + 0.06, c.z);
      d.root.add(ring);
      d.dream.refillSim(d.p);
    },
    arrived(d) {
      const c = d.spot(0, 0);
      for (const [w, ph] of [[1.25, 0], [-0.9, Math.PI]]) {
        d.laser({
          a: { x: c.x, y: c.y + 0.55, z: c.z }, b: { x: c.x, y: c.y + 0.55, z: c.z }, dmg: 15, thick: 0.22, warm: 0.6,
          move: (t, L) => {
            const a = ph + w * t;
            L.b.set(c.x + Math.cos(a) * 7.5, c.y + 0.55, c.z + Math.sin(a) * 7.5);
          },
        });
      }
      d.dream.refillSim(d.p);
    },
    tick(d) {
      const x = d.p.position.x - SIM.dx;
      const z = d.p.position.z - SIM.dz;
      const c = d.spot(0, 0);
      if (Math.hypot(x - c.x, z - c.z) > ADAMANT_RING + 0.6) d.fail('Out of the circle!');
    },
  }),

  /* 跳 LEAP. A TOWER: twelve lidded platforms in a rising spiral (LEAP_CLIMB),
     the star on the last. Richard, Oct 2026: "there is only 1 platform and it
     is very easy to jump on with just 2 jumps. Let's make it that the player
     can't jump on the platform from underneath it (they hit it with their
     head, like a ceiling) ... Also increase the height to force triple jump
     ... add more like a dozen platforms ... some moving platforms ... Don't
     make it too hard as this is primarily to focus on triple jumps".
     So: most steps are LEAP_STEP up (one jump), two are flat moving decks,
     and three are LEAP_DECK up — the triple jump's. Every deck is a LID
     (`SimWorld.lidAt`): a kitten under one bonks and must jump from beside it.
     WHY 5.7 AND NOT 5.0: with the Leap orb lent she has three jumps, and only
     the LAST of a chain is the weak one (x0.86) — so her SECOND jump is a
     full one, two full jumps top out at 4.82, and 5.0 was 0.22 under the
     0.4 a deck lands from. That is the "just 2 jumps" he saw. world-check now
     models it the same way.
     THE SECOND PASS, Richard, Oct 2026: "On platforms that require triple
     jump, if a player misses the platform and falls, lets send a message to
     remind them to TRIPLE JUMP ... At the 2nd to last platform, we should have
     the camera change to be behind the player, from a distance and from above
     and we should have them spawn from up there if they fall and hit the
     ground, also remind them to triple jump." So `leapStep` knows which step
     she is standing on: landing lower than the step under a tall one says
     LEAP_MISS; once she has stood on the checkpoint, landing anywhere below
     it puts her back on it (LEAP_BACK); and `camera` turns her lens to look
     from the checkpoint up at the last step. The x-ray on the steps and the
     shadow drawn over them are SimWorld's (`cutDeckMat`, `slab.renderOrder`). */
  leap: (g, p) => ({
    title: 'LEAP DRILL', goal: 1, time: 150, bands: [150, 75, 45], showCount: false,
    goalText: 'Climb to the star — TRIPLE jump the tall steps',
    camera: (d) => leapCam(d),
    setup(d) {
      d.climb = leapClimb(d);
      for (const s of d.climb) {
        s.deck = d.deck({ x: s.x, z: s.z, y: s.y, r: LEAP_R, ceiling: true });
        // A thin line of light from the floor, so a height reads as a height.
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.05, Math.max(0.1, s.y - d.at.y), 6),
          new THREE.MeshBasicMaterial({ color: d.colour, transparent: true, opacity: 0.25, toneMapped: false, depthWrite: false })
        );
        post.position.set(s.x, (s.y + d.at.y) / 2, s.z);
        d.root.add(post);
        s.post = post;
      }
      const top = d.climb[d.climb.length - 1];
      d.star({ x: top.x, y: top.y, z: top.z, onTake: () => d.progress() });
      d.bonks = 0;
      d.onStep = -1;
      d.best = -1;
    },
    tick(d) {
      leapStep(d);
      for (const s of d.climb) {
        if (!s.sway) continue;
        const k = Math.sin(d.t * (Math.PI * 2) / LEAP_SWAY_T) * s.sway;
        d.dream.sim.moveTempDisc(s.deck, s.x + s.rx * k, s.y, s.z + s.rz * k, [d.p]);
        s.post.position.set(s.deck.x, (s.y + d.at.y) / 2, s.deck.z);
      }
      // A bonk is a lesson: say it, once in a while.
      const p = d.p;
      if (p.velocity.y === 0 && !p.onGround && (d.wasVy ?? 0) > 0.5) {
        d.bonks++;
        if (d.bonks === 1 || d.bonks % 4 === 0) d.dream.hint(p, 'Bonk! Jump from BESIDE it, not under it');
      }
      d.wasVy = p.velocity.y;
    },
  }),

  /* 壁 WARD. Three turrets round her, firing in turn, slow enough to see.
     Six blocked bolts passes; a bolt that lands costs 12 of the bar. A step
     aside also dodges one — that is allowed, but only a BLOCK counts.
     THREE STARS ARE A RULE, NOT A BAND. Richard, Oct 2026: "it is currently
     too hard. We should do it that, if the player can beat it in under 18
     seconds and not get hit, then they will get the 3 stars." It was 11s.
     Six bolts at one every 1.5s is 9s plus the first 1.2: a clean run is
     about 10s, so WARD_GOLD leaves five misses (stepped aside, not hit). */
  ward: (g, p) => wardDrill(g, p, {
    title: 'WARD DRILL', goal: 6, bands: [30, 24, 18], every: 1.5,
    goalText: 'HOLD the shield button to block the bolts',
    stars: (d, t) => (!d.hits && t < WARD_GOLD ? 3 : t < 24 ? 2 : 1),
  }),

  /* 落 POWER DIVE. Four cracked tiles. A swing rocks them and says so; only
     the dive (radius DIVE.radius round her landing) breaks one. (The dive
     falling THROUGH the floating discs was the player's landing test, not
     this drill — see "SWEPT" in player.js.) */
  dive: (g, p) => ({
    title: 'POWER DIVE DRILL', goal: 4, time: 30, bands: [30, 15, 9],
    goalText: 'Jump, then press it again in the air — land ON the tiles', countLabel: 'tiles ',
    setup(d) {
      for (const [a, b] of [[5, -5], [5, 5], [-5, -5], [-5, 5]]) {
        const q = d.spot(a, b);
        d.target(Tile, {
          x: q.x, y: q.y, z: q.z,
          onRefuse: () => d.dream.hint(d.p, `Only a POWER DIVE breaks it — [${g.key(d.p, 'jump')}] then [${g.key(d.p, 'interact')}]`),
          onBreak: () => d.progress(),
        });
      }
    },
  }),

  /* 十 CROSS SLASH. SIX LEVELS, each passed by ONE Cross Slash that breaks
     everything on the level; a Cross Slash that leaves anything standing puts
     the level back and she goes again. Richard, Oct 2026, in his order:
       1 one post, three cuts;  2 two, in front and behind;  3 three round
       her;  4 three circling her;  5 three in the air, cut at the top of
       one jump;  6 one in front, then each of the next two appears in a
       random direction the moment the one before is cut.
     WHY IT CAN BE DONE: she TURNS through a Cross Slash — the stick sets her
     facing every frame, and each cut is thrown along the facing it has then
     (`Player._doSlash`), CROSS.gap (0.3s) apart. And it works in the air at
     a quarter of gravity (CROSS.gravity), which is what makes level 5 a
     hang and not a guess. Posts sit CROSS_R from her, inside A.reach.
     WHAT ONE ATTEMPT IS: `triAt` — wind-up to the end of the hang — read on
     its falling edge. A tap still rocks a post and says how. */
  tri: (g, p) => ({
    title: 'CROSS SLASH DRILL', goal: CROSS_LEVELS.length, time: 180, bands: [180, 90, 55],
    goalText: 'HOLD attack — break them ALL in one Cross Slash', countLabel: 'level ',
    setup(d) { levels(d, CROSS_LEVELS.map((L) => crossLevel(g, L))); },
    tick: (d, dt) => stepLevels(d, dt),
  }),

  /* 突 CHARGE. SETS OF THREE MATS, each set gone through in ONE charge; a
     charge that leaves part of a set standing puts that set back. Richard,
     Oct 2026: "if the player fails to charge through all three as a set with
     1 charge, then they are respawned and will keep respawing". Five parts
     (CHARGE_PARTS): four sets close; four spread so she has to start the
     charge at the first mat and aimed down the row; four in the air at the
     top of one jump and of two; the same, spread; and two sets in an L, one
     high and one low, both before she lands.
     A charge is CHARGE.dist (16) at CHARGE.speed (42), gravity off — so in
     the air it is a flat line at whatever height she started it. A set in
     the air answers only inside AIR_BAND of its height (`airMat`), so a set
     at the top of two jumps cannot be charged from the top of one. */
  charge: (g, p) => ({
    title: 'CHARGE DRILL', goal: CHARGE_PARTS.length, time: 240, bands: [240, 120, 70],
    goalText: 'Sprint + attack: charge through a WHOLE set at once', countLabel: 'part ',
    setup(d) {
      levels(d, CHARGE_PARTS.map((P) => chargePart(g, P)));
      d.wasCharging = d.p.chargeT > 0;
    },
    tick: (d, dt) => stepLevels(d, dt),
  }),

  /* 守 LONG GUARD. THREE TURRETS, A WARNING, AND A BEAM SHE SEES COMING.
     Richard, Oct 2026: "instead of having the lazer follow the player, have
     like three turrets opposing from the player that charge up, hold for a
     second the charged beam and then visually show a lazer grow from the
     turret and shoot towards the player where it collides with them in about
     0.25s ... The turrets can be animated showing up in the room, then have
     them turn towards the player and then put a target on the player ...
     There should be a 2-3 secs pause ... There could be 3 levels".
     So, each volley: GUARD.charge of charging, GUARD.hold of holding it,
     then the three beams GROW to her over GUARD.grow — following her, heat-
     seeking — and stay on her for the level's beam (GUARD_BEAMS), then
     GUARD.pause before the next. A volley held off from first touch to last
     clears the level.
     A BEAM AND NOT A STREAM OF BOLTS — the first cut of the old drill was a
     stream, and `WARD.hits` (2) blows smash a bubble however long it had
     left. A held beam (`simHit(..., {hold})`) asks only whether it is up.
     THE LAST LEVEL IS THE OLD ONE'S LENGTH, BEAM_T, measured between the two
     kits it tells apart: from the first sight of the beam she must hold
     GUARD.grow + BEAM_T — past a bare Ward's 2.2s, inside the lent pair's
     3.4s. world-check pins both sides. */
  aegis: (g, p) => ({
    title: 'LONG GUARD DRILL', goal: GUARD_BEAMS.length, time: 120, bands: [120, 60, 40], countLabel: 'level ',
    goalText: 'Shield UP as the beams fire — and HOLD it', grace: 1.4,
    setup(d) {
      d.put({ ...d.spot(0, 0), facing: Math.atan2(d.at.fwd.x, d.at.fwd.z) });
      guardRig(d);
      levels(d, GUARD_BEAMS.map((beam, i) => ({
        name: ['Short beams', 'Longer beams', 'The long beams'][i] ?? `Level ${i + 1}`,
        // The first volley a second after GO; a later level's, a second after it is built.
        build: (dd, L) => { L.beam = beam; L.phase = 'aim'; L.t = GUARD.pause - 1; },
        tick: (dd, L, dt) => guardTick(g, dd, L, dt),
      })));
      d.dream.refillSim(d.p);
    },
    always: (d, dt) => guardAlways(d, dt),
    tick: (d, dt) => stepLevels(d, dt),
  }),

  /* 遠 FAR STEP. One holo-kitten in the middle of the floor, a red ring of
     `farRing` round it. A Flash Step locks on only within Lock range (10 as
     tuned, 15 shipped), and half as far again with the one Enpo this drill
     lends — so from outside the ring only the lent orb reaches. Three steps
     round it.
     IT STANDS STILL, IN THE MIDDLE, and that is the second design. The first
     moved it to a fresh spot toward the floor's middle after each step — and
     one 瞬 PIVOTS her round whoever she locked, at the distance she locked
     from (`_dodgeSpotFor`), so from the middle the far side was off the
     island and the step was refused out loud (seen in the browser). Round the
     centre, the far side is the same distance out the other way, inside the
     floor for any lock the orb can make (world-check), and still outside the
     ring — so she can go straight round again. She starts at the pedestal,
     19 out: past a tuned lock even with the orb, so the first thing she
     learns is where to stand. */
  far: (g, p) => ({
    title: 'FAR STEP DRILL', goal: 3, time: 35, bands: [35, 16, 10],
    goalText: 'Flash Step round it from OUTSIDE the red ring', countLabel: 'steps ',
    setup(d) {
      const spec = d.dream.kittenSpec();
      const c = d.spot(0, 0);
      d.holo = d.target(HoloKitten, {
        x: c.x, y: c.y, z: c.z, spec, name: 'the holo-kitten', hits: 1,
        accept: () => false,
        onRefuse: () => d.dream.hint(d.p, `Flash Step round it — [${g.key(d.p, 'sprint')}] + [${g.key(d.p, 'interact')}]`),
      });
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(farRing() - 0.2, farRing(), 96).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xff3b5b, transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false })
      );
      ring.position.y = 0.06;
      d.holo.group.add(ring);
      d.seq = d.p.dodgeSeq;
      d.placed = true;
    },
    tick(d) {
      const p = d.p;
      if (p.dodgeSeq !== d.seq) {
        d.seq = p.dodgeSeq;
        d.placed = false;
        d.good = p.dodgeTarget === d.holo && p.dodgeD0 > farRing();
        if (d.good) d.dream.hint(p, '遠 Locked from far away!');
        else if (p.dodgeTarget === d.holo) d.dream.hint(p, 'Too close — step back OUTSIDE the red ring first');
        else d.dream.hint(p, 'No lock — FACE it from just outside the ring, then Flash Step');
      }
      /* Counted when she has GONE, not when she locks: a locked step with
         the stick let go is the "stay put, untouchable" half of the move
         (`_commitDodge`), and the first cut paid a star for one in the
         browser while she never left her spot. */
      if (!d.placed && p.dodgePlaced) {
        d.placed = true;
        if (d.good) {
          d.good = false;
          if (Math.hypot(p.position.x - p.dodgeFrom.x, p.position.z - p.dodgeFrom.z) > FAR_MOVED) d.progress();
          else d.dream.hint(p, 'Locked — now PUSH the stick as you step, to go round it');
        }
      }
    },
  }),

  /* 返 RIPOSTE. A holo-kitten walks up and swings. Before it does it goes
     white and still for PARRY_TELL — the tell — with its sword going up over
     its shoulder, and the blow is the sword coming down. Richard, Oct 2026:
     "have the enemy swing a sword once they get near the player." Guard
     toward it inside the last 0.35s of that and the blow is caught and
     answered (`simHit` asks the parry, then `riposte` swings back through the
     sim's gate). It only answers to a riposte: a swing at it rocks it and she
     is told how. */
  parry: (g, p) => parryDrill(g, p, {
    title: 'RIPOSTE DRILL', bands: [40, 20, 12],
    goalText: 'When it flashes: HOLD Interact, PUSH the stick at it',
    blowAt: () => PARRY_TELL,
    missed: (g2, d) => `Too early or too late — HOLD [${g2.key(d.p, 'interact')}] and PUSH just before it swings`,
  }),

  /* 間 LONG PARRY. LEVELS OF PARTNERS, and they swing TOGETHER. Richard, Oct
     2026: "first blocking three attacks from 1 enemy without getting hit,
     then blocking three attacks from two enemies at once (coming from the
     same side), then having three enemies coming from three different areas
     around the player, the player will have to "kite" the enemies to get
     them in one area to be able to riposte all three attacks without getting
     hit. If player gets hit, then the round restarts and enemies are
     respawned ... it takes the enemies a second or two before they try to
     attack the player again after the riposte wears off."
     THE PACK RULE (`packDrill`): nobody swings until every partner is close,
     and then they all wind and all land on the same frame. One guard covers
     a HALF-PLANE (`Player.parries`), so a pack on one side is caught whole
     and a pack round her is not — that is what kiting is for.
     EACH ONE WAITS her out the old way: its blow lands PARRY_LATE after she
     raises her guard, 0.07s past a bare window (0.35) and 0.105s inside one
     Ma's (0.525). So bare it cannot be passed however it is timed, and lent
     it is the sentence on the orb's card. `world-check` pins both sides. */
  longparry: (g, p) => packDrill(g, p, {
    title: 'LONG PARRY DRILL', bands: [120, 60, 35],
    goalText: 'Raise your guard as they flash — and HOLD it',
    blowAt: (d) => (d.guardAt != null ? Math.min(PARRY_TELL_MAX, d.guardAt + PARRY_LATE) : PARRY_TELL_MAX),
    missed: (g2, d) => (d.p.parryWin > PARRY.window + 1e-6
      ? 'Raise it while they flash — Long Parry holds it till the blow'
      : 'They waited until your guard dropped — Long Parry holds it longer'),
  }),

  /* 瞬 FLASH STEP. FOUR LEVELS. Richard, Oct 2026: "the first one can be
     simple with just 1 lazer wall, then the next one can have multiple lazer
     walls and player has to grab multiple prizes, like 4 or more, then lets
     make a level where the player has to use Flash Step while jumping ...
     have the prize in the air and have lazers on the ground ... and respawn
     them in a clear area to try again. The final trial should have an enemy
     where the player has to teleport behind them and hit them before they
     turn around ... a shield infront of them facing towards the player ...
     it takes the enemy 0.75s before they face the player again".
     A WALL IS SIX BEAMS HIGH (BLINK_WALL), not three: three topped out at
     2.2, under the top of two jumps (4.19), so it was a wall you could hop.
     Every level stands her on its own START PAD, clear of everything: "the
     player is taking damage before even stepping into the lazers" was, in
     part, a pedestal 19 out that the old wall's line ran near, and in part a
     body test 0.45 wider than the beam it drew (LASER_PAD). */
  blink: (g, p) => ({
    title: 'FLASH STEP DRILL', goal: BLINK_LEVELS, time: 180, bands: [180, 90, 55], countLabel: 'level ',
    goalText: 'Sprint + interact: Flash Step THROUGH the lasers',
    setup(d) {
      levels(d, [
        { name: 'One wall', build: (dd, L) => blinkOne(dd, L) },
        { name: 'Walls everywhere — get every star', build: (dd, L) => blinkGrid(dd, L) },
        { name: 'Jump, THEN Flash Step', build: (dd, L) => blinkAir(dd, L) },
        { name: 'Get behind the shield', build: (dd, L) => blinkShield(g, dd, L), tick: (dd, L, dt) => shieldTick(dd, L, dt) },
      ]);
    },
    tick: (d, dt) => stepLevels(d, dt),
  }),
};

function armNext(d, i) {
  d.progress();
  const nx = d.gateList[i + 1];
  if (nx) { nx.armed = true; nx.setColour(d.colour); }
  d.gateList[i].setColour(0x224433);
}

/* --------------------------------- levels -------------------------------- */

/**
 * A drill in LEVELS. `list` is [{ name, build(d, L), tick?(d, L, dt) }]; the
 * drill's `goal` is the number of levels and `progress` is one cleared. Each
 * level is built after `d.mark()` and wiped on the way to the next, so what
 * one leaves behind cannot catch her in another. `L` is the level's own
 * state, fresh each time it is built.
 */
function levels(d, list) {
  d.levels = list;
  d.base = d.mark();
  d.lvNext = null;
  enterLevel(d, 0);
}

function enterLevel(d, i) {
  d.wipe(d.base);
  d.lv = i;
  const lv = d.levels[i];
  d.stageLabel = `LEVEL ${i + 1} of ${d.levels.length}: ${lv.name}`;
  d.L = {};
  lv.build(d, d.L);
}

/** The level is done: count it, and the next is built after a beat to see it. */
function cleared(d, pause = LEVEL_PAUSE) {
  if (d.lvNext != null || d.state !== 'live') return;
  d.progress();
  if (d.state === 'live') {
    d.lvNext = pause;
    d.dream.hint(d.p, `Level ${d.lv + 1} clear!`);
  }
}

/** Start the level over — what is built is built again, from scratch. */
function retry(d, why) {
  if (why) d.dream.hint(d.p, why);
  enterLevel(d, d.lv);
}

function stepLevels(d, dt) {
  if (d.lvNext != null) {
    d.lvNext -= dt;
    if (d.lvNext <= 0) { d.lvNext = null; enterLevel(d, d.lv + 1); }
    return;
  }
  d.levels[d.lv]?.tick?.(d, d.L, dt);
}

/** A start pad: a green ring she is stood on, and the point to stand her on. */
function startPad(d, a, b, look = null) {
  const q = d.spot(a, b);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 1.85, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x6dffb0, transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false })
  );
  ring.position.set(q.x, q.y + 0.05, q.z);
  d.root.add(ring);
  const f = d.at.fwd;
  const facing = look ? Math.atan2(look.x - q.x, look.z - q.z) : Math.atan2(f.x, f.z);
  return { ...q, facing };
}

/* ------------------------------ 剛 adamant ------------------------------- */

function adamantCam(d) {
  const c = d.spot(0, 0);
  const f = (d._cam ??= { centre: new THREE.Vector3(), aim: true, dist: ADAMANT_CAM.dist, pitch: ADAMANT_CAM.pitch });
  f.centre.set(c.x + SIM.dx, c.y + 0.4, c.z + SIM.dz);
  return f;
}

/* -------------------------------- 跳 leap -------------------------------- */

/** The tower, in the layer: one point per LEAP_CLIMB row, round a spiral. */
export function leapClimb(d) {
  let ang = 0;
  let y = d.at.y;
  return LEAP_CLIMB.map((s, i) => {
    if (i) ang += THREE.MathUtils.degToRad(s.turn);
    y += s.up;
    const q = d.spot(Math.cos(ang) * LEAP_SPIRAL, Math.sin(ang) * LEAP_SPIRAL);
    const c = d.spot(0, 0);
    const n = Math.hypot(q.x - c.x, q.z - c.z) || 1;
    return { ...s, x: q.x, y, z: q.z, rx: (q.x - c.x) / n, rz: (q.z - c.z) / n };
  });
}

/** Which step of the tower is under her feet: its index, or -1 for the floor. */
export function leapStandingOn(d) {
  const p = d.p;
  const g = d.dream.sim.heightAt(p.position.x, p.position.z, p.position.y + 0.1);
  return d.climb.findIndex((s) => s.deck === g?.platform);
}

/**
 * Every LANDING on the tower, judged: higher is progress, lower is a miss. A
 * miss from under a tall step says how the tall ones are done; any landing
 * below the checkpoint, once she has stood on it, puts her back on it.
 */
function leapStep(d) {
  const p = d.p;
  const was = d.grounded ?? true;
  d.grounded = !!p.onGround;
  if (!p.onGround || was) return;
  const i = leapStandingOn(d);
  const from = d.onStep;
  const cp = d.climb.length - LEAP_CHECK;
  if (d.best >= cp && i < cp) {
    leapToCheck(d);
    d.dream.hint(p, LEAP_BACK);
    return;
  }
  if (i < from && d.climb[from + 1]?.up === LEAP_DECK) d.dream.hint(p, LEAP_MISS);
  d.onStep = i;
  d.best = Math.max(d.best, i);
}

/** Stand her on the checkpoint, facing the last step. */
function leapToCheck(d) {
  const cp = d.climb[d.climb.length - LEAP_CHECK];
  const top = d.climb[d.climb.length - 1];
  d.put({ x: cp.deck.x, y: cp.deck.y, z: cp.deck.z, facing: Math.atan2(top.x - cp.deck.x, top.z - cp.deck.z) });
  d.onStep = d.climb.length - LEAP_CHECK;
  d.grounded = true;
}

/** From the checkpoint on, her lens is behind and above her, looking up at the star. */
function leapCam(d) {
  if (d.best == null || d.best < d.climb.length - LEAP_CHECK) return null;
  const cp = d.climb[d.climb.length - LEAP_CHECK];
  const top = d.climb[d.climb.length - 1];
  const hx = top.x - cp.x;
  const hz = top.z - cp.z;
  const f = (d._cam ??= { centre: new THREE.Vector3(), aim: true, dist: LEAP_CAM.dist, pitch: LEAP_CAM.pitch, yaw: 0 });
  f.yaw = Math.atan2(-hx, -hz);
  f.centre.set((cp.x + top.x) / 2 + SIM.dx, (cp.y + top.y) / 2, (cp.z + top.z) / 2 + SIM.dz);
  return f;
}

/* -------------------------------- 壁 ward -------------------------------- */

/** The Ward drill's turret rig. */
function wardDrill(g, p, o) {
  return {
    title: o.title, goal: o.goal, time: 32, bands: o.bands, showCount: o.showCount, stars: o.stars,
    goalText: o.goalText, countLabel: 'blocked ',
    setup(d) {
      d.fireT = 1.2;
      d.turn = 0;
      d.hits = 0;
      d.turrets = [d.spot(10, 0, 1.6), d.spot(-5, 8.7, 1.6), d.spot(-5, -8.7, 1.6)];
      for (const q of d.turrets) {
        const t = new THREE.Mesh(new THREE.OctahedronGeometry(0.8, 0), new THREE.MeshBasicMaterial({ color: 0xff5a3a, wireframe: true, toneMapped: false }));
        t.position.set(q.x, q.y, q.z);
        d.root.add(t);
      }
      d.dream.refillSim(d.p);
    },
    tick(d, dt) {
      d.fireT -= dt;
      if (d.fireT <= 0) {
        d.fireT = o.every;
        const q = d.turrets[d.turn++ % d.turrets.length];
        d.bolt(q, {
          speed: 13, dmg: 12,
          onResult: (r) => {
            if (r === 'blocked') d.progress();
            else if (r === 'hit') d.hits++;
          },
        });
      }
    },
  };
}

/* ------------------------------ 十 cross slash --------------------------- */

/**
 * One Cross Slash level. `L.posts` is how many and where; the level is
 * judged when the Cross Slash ENDS (`triAt` falls): all down, cleared; any
 * standing, all of them back.
 */
function crossLevel(g, spec) {
  return {
    name: spec.name,
    build(d, L) {
      const c = d.spot(0, 0);
      const fy = Math.atan2(d.at.fwd.x, d.at.fwd.z);
      d.put({ ...c, facing: fy });
      L.c = c;
      L.t = 0;
      L.was = !!d.p.triAt;
      L.posts = spec.posts.map((deg, i) => {
        const a = fy + THREE.MathUtils.degToRad(deg);
        const lift = spec.air ? CROSS_AIR : 0;
        const t = d.target(Post, {
          x: c.x + Math.sin(a) * CROSS_R, y: c.y + lift, z: c.z + Math.cos(a) * CROSS_R,
          hits: spec.hits ?? 1, kinds: ['tri'], aimArc: CROSS_AIM, onePerSwing: true,
          // In the air, out of reach from the floor: see CROSS_AIR.
          ...(spec.air ? { hitUp: CROSS_AIR_UP } : {}),
          onRefuse: () => d.dream.hint(d.p, `That was a tap — HOLD [${g.key(d.p, 'attack')}] for the Cross Slash`),
          onBreak: () => spec.chain && i < spec.posts.length - 1 && crossReveal(d, L, i + 1),
        });
        t.ang = a;
        if (spec.air) airMarks(d, t, lift);
        if (spec.chain && i) crossHide(t);
        return t;
      });
    },
    tick(d, L, dt) {
      L.t += dt;
      if (spec.chain) {
        /* THE FIRST ONE'S NEXT, AS SOON AS SHE PRESSES. The hold before a
           Cross Slash is CROSS.hold + CROSS.wind = 0.5s, and the press is the
           moment we know it is coming. */
        const p = d.p;
        if ((p._triPend || p.triWindT > 0) && L.posts[0].live && !L.posts[1].ghost && !L.posts[1].live) {
          crossGhost(d, L, 1, Math.atan2(L.posts[0].local.x - (p.position.x - SIM.dx), L.posts[0].local.z - (p.position.z - SIM.dz)));
        }
        for (const t of L.posts) if (t.ghost) t.fade = Math.min(CROSS_GHOST.alpha, (t.fade ?? 0) + dt * CROSS_GHOST.alpha / CROSS_GHOST.t);
      }
      if (spec.orbit) {
        L.posts.forEach((t, i) => {
          const a = t.ang + L.t * spec.orbit;
          t.moveTo(L.c.x + Math.sin(a) * CROSS_R, L.c.y, L.c.z + Math.cos(a) * CROSS_R);
        });
      }
      const now = !!d.p.triAt;
      if (L.was && !now) {
        if (L.posts.every((t) => !t.live)) cleared(d);
        else {
          const any = L.posts.some((t) => !t.live || t.hp < t.maxHits);
          crossReset(d, L, spec);
          d.dream.hint(d.p, any ? 'ALL of them in ONE Cross Slash — again!' : 'Turn the stick between cuts to aim each one');
        }
      }
      L.was = now;
    },
  };
}

/* THE LAST LEVEL'S NEXT POST: BEHIND HER, AND SHOWN BEFORE IT IS LIVE.
   Richard, Oct 2026: "When they are quickly appearing randomly placed at the
   end, lets make them appear always behind the player in a randomized 180
   degree area, to force the player to have to change directions while
   cutting. Maybe 0.5s before the first cut ... we can show where the next one
   will appear by having it fade in before the previous target is cut down,
   that way giving the player some time to react". It was a quarter turn
   either way or a half turn, off whatever way she happened to be facing.
   Now: "behind" is behind the post she is about to cut (`toward`, her
   bearing to it), anywhere in that half circle; it fades in as a ghost
   (`fade`, not `live`, so a cut cannot find it) and stands up for real the
   moment the one before it breaks — when the next one's ghost appears,
   behind THAT one. */
export function crossBehind(toward, r = Math.random()) {
  return toward + Math.PI + (r - 0.5) * Math.PI;
}

function crossGhost(d, L, i, toward) {
  const t = L.posts[i];
  if (!t || t.live || t.ghost) return;
  const p = d.p;
  const a = crossBehind(toward);
  t.moveTo(p.position.x - SIM.dx + Math.sin(a) * CROSS_R, L.c.y, p.position.z - SIM.dz + Math.cos(a) * CROSS_R);
  t.ghost = true;
  t.fade = 0;
  t.group.visible = true;
}

function crossReveal(d, L, i) {
  const t = L.posts[i];
  const p = d.p;
  const bearing = (q) => Math.atan2(q.local.x - (p.position.x - SIM.dx), q.local.z - (p.position.z - SIM.dz));
  // Cut before it was ever shown (the press came too late to see): place it now.
  if (!t.ghost) crossGhost(d, L, i, bearing(L.posts[i - 1]));
  t.ghost = false;
  t.fade = 1;
  t.revive();
  crossGhost(d, L, i + 1, bearing(t));
}

/** Not here yet: hidden, uncuttable, and no ghost. */
function crossHide(t) {
  t.live = false;
  t.ghost = false;
  t.fade = 1;
  t.group.visible = false;
  t.hp = t.maxHits;
}

function crossReset(d, L, spec) {
  L.posts.forEach((t, i) => {
    if (spec.chain && i) { crossHide(t); return; }
    if (!t.live) t.revive();
    t.hp = t.maxHits;
  });
}

/* A POST IN THE AIR SAYS SO. Richard, Oct 2026: "When the targets are in the
   air, they have no shadow, so it is hard to see they are in the air ... can
   potentially put a lazer underneath them like we do for Leap Drill and the
   platforms." A beam from the floor up to its peg, and a shadow and a ring on
   the floor under it — parented to the post, so they go when it breaks and
   come back with it. */
function airMarks(d, t, lift) {
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, lift, 6),
    new THREE.MeshBasicMaterial({ color: d.colour, transparent: true, opacity: 0.55, toneMapped: false, depthWrite: false })
  );
  beam.position.y = -lift / 2;
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.75, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x02060a, transparent: true, opacity: 0.55, depthWrite: false })
  );
  shadow.position.y = -lift + 0.04;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.75, 0.92, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: d.colour, transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false })
  );
  ring.position.y = -lift + 0.05;
  t.group.add(beam, shadow, ring);
  t.airMarks = { beam, shadow, ring };
}

/* -------------------------------- 突 charge ------------------------------ */

/**
 * One part of the Charge drill. Each set is three mats in a row; a set in
 * the air answers only to a kitten inside AIR_BAND of its height. Judged on
 * the frame a charge ENDS: a set wholly down is done, a set partly down is
 * put back. `combo` (the L) is judged when she LANDS instead: all of it
 * before her feet touch, or all of it back.
 */
/** A charge drill point: `a` up the screen, `b` to its right, from the floor's middle. */
export function chargeSpot(d, a, b) {
  const c = d.spot(0, 0);
  return { x: c.x + SCREEN.up.x * a + SCREEN.right.x * b, y: c.y, z: c.z + SCREEN.up.z * a + SCREEN.right.z * b };
}

/** A charge drill direction: degrees from screen-up toward screen-right, as a flat unit vector. */
export function chargeDir(deg) {
  const r = THREE.MathUtils.degToRad(deg);
  return { x: SCREEN.up.x * Math.cos(r) + SCREEN.right.x * Math.sin(r), z: SCREEN.up.z * Math.cos(r) + SCREEN.right.z * Math.sin(r) };
}

function chargePart(g, P) {
  return {
    name: P.name,
    build(d, L) {
      const s = chargeSpot(d, ...P.start);
      // Facing the floor's middle, or the first set when the part says so.
      const to = P.face != null ? chargeSpot(d, ...P.sets[P.face].at) : d.spot(0, 0);
      d.put({ ...s, facing: Math.atan2(to.x - s.x, to.z - s.z) });
      L.sets = P.sets.map((S) => chargeSet(g, d, S));
      L.was = d.p.chargeT > 0;
      L.air = !d.p.onGround;
    },
    tick(d, L) {
      const on = d.p.chargeT > 0;
      if (P.combo) {
        const all = L.sets.every((s) => s.mats.every((m) => !m.live));
        if (all) { cleared(d); return; }
        const landed = d.p.onGround && L.air;
        if (landed && !on && L.sets.some((s) => s.mats.some((m) => !m.live))) {
          for (const s of L.sets) for (const m of s.mats) if (!m.live) m.revive();
          d.dream.hint(d.p, 'BOTH sets before you land — low one, jump, high one!');
        }
      } else if (L.was && !on) {
        for (const s of L.sets) {
          if (s.done) continue;
          const down = s.mats.filter((m) => !m.live).length;
          if (down === s.mats.length) s.done = true;
          else if (down) {
            for (const m of s.mats) if (!m.live) m.revive();
            d.dream.hint(d.p, 'All THREE in ONE charge — line up behind the first');
          }
        }
        if (L.sets.every((s) => s.done)) cleared(d);
      }
      L.was = on;
      L.air = !d.p.onGround;
    },
  };
}

/** Three mats along a row: `at` [up, right], `dir` degrees on the screen, `gap` apart, `h` up. */
function chargeSet(g, d, S) {
  const v = chargeDir(S.dir);
  const yaw = Math.atan2(v.x, v.z);
  const mid = chargeSpot(d, ...S.at);
  const mats = [-1, 0, 1].map((k) => {
    const q = { x: mid.x + v.x * k * S.gap, y: mid.y, z: mid.z + v.z * k * S.gap };
    const air = S.h ? {
      y: q.y + S.h - 0.3,
      // dy from her feet to its middle is h + 1.0 - her y; answer only near h.
      hitUp: (1.0 + AIR_BAND) - COMBAT.strikeHeight, hitDown: -(1.0 - AIR_BAND) - COMBAT.strikeHeight,
    } : { y: q.y };
    const m = d.target(Mat, {
      x: q.x, z: q.z, ...air, yaw,
      onRefuse: () => d.dream.hint(d.p, `Hold [${g.key(d.p, 'sprint')}] and press [${g.key(d.p, 'attack')}] to CHARGE`),
    });
    if (S.h) {
      const stalk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, S.h - 0.3, 6),
        new THREE.MeshBasicMaterial({ color: d.colour, transparent: true, opacity: 0.55, toneMapped: false, depthWrite: false })
      );
      stalk.position.set(q.x, q.y + (S.h - 0.3) / 2, q.z);
      // ...and its shadow on the floor, the mat's own footprint.
      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 0.7).rotateX(-Math.PI / 2).rotateY(yaw),
        new THREE.MeshBasicMaterial({ color: 0x02060a, transparent: true, opacity: 0.55, depthWrite: false })
      );
      shadow.position.set(q.x, q.y + 0.04, q.z);
      d.root.add(stalk, shadow);
    }
    return m;
  });
  if (S.h) jumpSign(d, mid, v, S.h > CHARGE_ONE + AIR_BAND ? 2 : 1);
  return { mats, done: false };
}

/* HOW HIGH, WRITTEN ON THE FLOOR. Richard, Oct 2026: "it is hard to see that
   the platforms are high up, they need a shadow or some kind of indicator to
   show they are double jump needed rather than single jump." Each mat has a
   shadow (above), and each set a sign beside it, toward the floor's middle
   where she comes from: one arrow and 1 JUMP, or two and 2 JUMPS, in gold.
   Lying flat and turned to read upright on the screen, whose yaw never
   changes in here (kata.js `SCREEN`). */
export const JUMP_SIGN = { w: 3.4, h: 1.3, off: 2.4 };
function jumpSign(d, mid, v, n) {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 98;
  const g = cv.getContext('2d');
  g.fillStyle = 'rgba(2, 8, 14, 0.7)';
  g.fillRect(0, 0, 256, 98);
  g.strokeStyle = n > 1 ? '#ffd56a' : '#5ff6ff';
  g.lineWidth = 5;
  g.strokeRect(3, 3, 250, 92);
  g.fillStyle = g.strokeStyle;
  g.font = 'bold 50px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(`${'▲'.repeat(n)} ${n} JUMP${n > 1 ? 'S' : ''}`, 128, 52);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(JUMP_SIGN.w, JUMP_SIGN.h).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false })
  );
  // Beside the row, on the side toward the middle of the floor.
  const c = d.spot(0, 0);
  let px = -v.z;
  let pz = v.x;
  if (px * (c.x - mid.x) + pz * (c.z - mid.z) < 0) { px = -px; pz = -pz; }
  sign.position.set(mid.x + px * JUMP_SIGN.off, mid.y + 0.05, mid.z + pz * JUMP_SIGN.off);
  // Its top edge toward screen-up: the plane's +y lies along -z once flat.
  sign.rotation.y = Math.atan2(-SCREEN.up.x, -SCREEN.up.z);
  sign.userData.jumps = n;
  sign.name = 'jump-sign';
  d.root.add(sign);
  return sign;
}

/* ------------------------------ 守 long guard ---------------------------- */

/** Three turrets round the floor's middle, and the target ring under her. */
function guardRig(d) {
  const c = d.spot(0, 0);
  d.turrets = [0, 120, 240].map((deg, i) => {
    const a = Math.atan2(d.at.fwd.x, d.at.fwd.z) + THREE.MathUtils.degToRad(deg + 180);
    const q = { x: c.x + Math.sin(a) * GUARD.r, y: c.y + 1.6, z: c.z + Math.cos(a) * GUARD.r };
    const grp = new THREE.Group();
    grp.position.set(q.x, q.y, q.z);
    const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), new THREE.MeshBasicMaterial({ color: 0xff5a3a, wireframe: true, toneMapped: false }));
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.4, 10).rotateX(Math.PI / 2).translate(0, 0, 0.9), holoMat(0xff5a3a, 0.55));
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 10), holoMat(0xffb070, 0.9));
    orb.position.z = 1.75;
    orb.scale.setScalar(0.01);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 1.6, 8).translate(0, -0.8, 0), holoMat(0xff5a3a, 0.2));
    grp.add(head, barrel, orb, base);
    grp.scale.setScalar(0.01);
    d.root.add(grp);
    const muzzle = () => {
      const yaw = grp.rotation.y;
      return { x: grp.position.x + Math.sin(yaw) * 1.75, y: grp.position.y, z: grp.position.z + Math.cos(yaw) * 1.75 };
    };
    const T = { grp, orb, q, muzzle, born: i * 0.25 };
    T.beam = d.laser({
      a: q, b: q, thick: 0.45, dmg: 6, hold: true,
      move: (_t, L) => {
        const m = muzzle();
        L.a.set(m.x, m.y, m.z);
        const k = d.L?.phase === 'fire' ? Math.min(1, d.L.t / GUARD.grow) : 0;
        if (k <= 0) { L.b.copy(L.a); return; }
        // Heat-seeking: at her middle, and on past her once it has arrived.
        const P = d.p;
        const x = P.position.x - SIM.dx;
        const z = P.position.z - SIM.dz;
        const y = P.position.y + (P.height ?? 2.6) * 0.5;
        const dx = x - m.x; const dy = y - m.y; const dz = z - m.z;
        const n = Math.hypot(dx, dy, dz) || 1;
        const reach = k < 1 ? n * k : n + 5;
        L.b.set(m.x + (dx / n) * reach, m.y + (dy / n) * reach, m.z + (dz / n) * reach);
      },
      onResult: (r) => {
        const L = d.L;
        if (!L || L.phase !== 'fire') return;
        if (r === 'blocked') L.held = true;
        else if (r === 'hit' || r === 'immune') L.leaked = true;
        else if (r === 'dodged') L.stepped = true;
      },
    });
    T.beam.on = false;
    return T;
  });
  const ret = new THREE.Group();
  const ringM = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.18, 40).rotateX(-Math.PI / 2), holoMat(0xff3b3b, 0.85));
  ret.add(ringM);
  for (let k = 0; k < 4; k++) {
    const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.6).rotateX(-Math.PI / 2).translate(0, 0, 1.35), holoMat(0xff3b3b, 0.85));
    tick.rotation.y = (k * Math.PI) / 2;
    ret.add(tick);
  }
  ret.visible = false;
  ret.renderOrder = 22;
  d.root.add(ret);
  d.reticle = ret;
  d.rigT = 0;
}

/** The turrets every frame, whatever the state: rise, turn to her, mark her. */
function guardAlways(d, dt) {
  if (!d.turrets) return;
  d.rigT += dt;
  const P = d.p;
  const x = P.position.x - SIM.dx;
  const z = P.position.z - SIM.dz;
  for (const T of d.turrets) {
    const k = THREE.MathUtils.clamp((d.rigT - T.born) / GUARD.rise, 0, 1);
    const e = 1 - (1 - k) * (1 - k);
    T.grp.scale.setScalar(Math.max(0.01, e));
    T.grp.position.y = T.q.y - 2 * (1 - e);
    if (k >= 1) {
      const want = Math.atan2(x - T.grp.position.x, z - T.grp.position.z);
      let dy = want - T.grp.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      T.grp.rotation.y += dy * Math.min(1, dt * 4);
    }
  }
  const marked = d.rigT > GUARD.rise + 0.6 && d.running;
  d.reticle.visible = marked;
  if (marked) {
    d.reticle.position.set(x, P.position.y + 0.08, z);
    const L = d.L ?? {};
    const hot = L.phase === 'charge' || L.phase === 'hold' || L.phase === 'fire';
    d.reticle.rotation.y += dt * (hot ? 4 : 1.2);
    d.reticle.scale.setScalar(L.phase === 'hold' ? 0.85 + 0.15 * Math.sin(d.rigT * 20) : 1);
  }
}

/** One level's volleys: aim, charge, hold, fire (grow, then the beam), judge, pause. */
function guardTick(g, d, L, dt) {
  L.t += dt;
  const orbK = L.phase === 'charge' ? Math.min(1, L.t / GUARD.charge) : L.phase === 'hold' ? 1 : 0;
  for (const T of d.turrets) {
    T.orb.scale.setScalar(Math.max(0.01, orbK * (L.phase === 'hold' ? 1 + 0.25 * Math.sin(L.t * 30) : 1)));
    T.beam.on = L.phase === 'fire';
  }
  if (L.phase === 'aim' && L.t >= GUARD.pause) { L.phase = 'charge'; L.t = 0; }
  else if (L.phase === 'charge' && L.t >= GUARD.charge) {
    L.phase = 'hold'; L.t = 0;
    d.dream.hint(d.p, `Charged! Shield UP as they fire — HOLD [${g.key(d.p, 'mount')}]`);
  } else if (L.phase === 'hold' && L.t >= GUARD.hold) {
    L.phase = 'fire'; L.t = 0; L.held = false; L.leaked = false; L.stepped = false;
  } else if (L.phase === 'fire' && L.t >= GUARD.grow + L.beam) {
    for (const T of d.turrets) T.beam.on = false;
    if (L.held && !L.leaked && !L.stepped) { cleared(d); return; }
    const short = !(d.p.power?.ward?.max > WARD.max + 0.01);
    d.dream.hint(d.p, L.stepped ? 'A Flash Step is not a block — HOLD the shield'
      : !L.held ? `Shield UP before the beams reach you — [${g.key(d.p, 'mount')}]`
      : short && L.beam > WARD.max ? 'Your shield ran out first — Long Guard holds it longer'
      : 'Raise it as they fire and HOLD it — again!');
    L.phase = 'aim';
    L.t = 0;
  }
}

/* ------------------------------ 瞬 flash step ---------------------------- */

/** A wall of BLINK_WALL beams across the island: `across` at a = o, else along fwd at b = o. */
function laserWall(d, across, o, extra = {}) {
  const R = d.at.r - 0.6;
  const h = Math.sqrt(Math.max(1, R * R - o * o));
  for (const y of BLINK_WALL) {
    const a = across ? d.spot(o, -h, y) : d.spot(-h, o, y);
    const b = across ? d.spot(o, h, y) : d.spot(h, o, y);
    d.laser({ a, b, dmg: 10, thick: 0.18, warm: 0.4, ...extra });
  }
}

function blinkOne(d, L) {
  L.pad = startPad(d, -7, 0);
  d.put(L.pad);
  laserWall(d, true, -1);
  const q = d.spot(7, 0);
  d.star({ x: q.x, y: q.y, z: q.z, onTake: () => cleared(d) });
}

function blinkGrid(d, L) {
  L.pad = startPad(d, -8, -10);
  d.put(L.pad);
  laserWall(d, true, 0);
  laserWall(d, false, -4);
  laserWall(d, false, 4);
  const spots = [[8, -10], [-8, 0], [8, 0], [-8, 10], [8, 10]];
  L.got = 0;
  for (const [a, b] of spots) {
    const q = d.spot(a, b);
    d.star({ x: q.x, y: q.y, z: q.z, onTake: () => { if (++L.got >= spots.length) cleared(d); } });
  }
}

/**
 * IN THE AIR: a tall wall, a floor of low beams past it, and the star over
 * that floor at BLINK_AIR_Y — out of reach of a kitten standing there (a
 * star is taken within 2.2 of its height) and inside it at the top of a jump.
 * A Flash Step on the ground lands her on the floor of beams; any beam sends
 * her back to the pad, clear of all of it.
 */
function blinkAir(d, L) {
  L.pad = startPad(d, -10, 0);
  d.put(L.pad);
  const back = (r) => { if (r === 'hit') { d.put(L.pad); d.dream.hint(d.p, 'Jump FIRST, then Flash Step in the air'); } };
  laserWall(d, true, -5, { onResult: back });
  const R = d.at.r - 0.6;
  for (let a = -3.5; a <= 12; a += 1.5) {
    const h = Math.sqrt(Math.max(1, R * R - a * a));
    d.laser({ a: d.spot(a, -h, 0.3), b: d.spot(a, h, 0.3), dmg: 10, thick: 0.14, warm: 0.4, onResult: back });
  }
  const q = d.spot(2.5, 0);
  d.star({ x: q.x, y: q.y + BLINK_AIR_Y, z: q.z, reach: BLINK_AIR_REACH, onTake: () => cleared(d) });
}

/**
 * THE SHIELDED ONE. Stands still, shield toward her, and turns to keep it
 * there — but a Flash Step that puts her behind it is seen late: it waits
 * SHIELD_TURN.wait, then turns at SHIELD_TURN.rate, which is the 0.75s
 * Richard asked for to come all the way round. A blow from inside its
 * shield's half is refused and she is told why; from behind, it counts.
 */
function blinkShield(g, d, L) {
  L.pad = startPad(d, -8, 0);
  d.put(L.pad);
  const c = d.spot(2, 0);
  L.foe = d.target(HoloKitten, {
    x: c.x, y: c.y, z: c.z, spec: d.dream.kittenSpec(), name: 'the shield-bearer', hits: SHIELD_HITS,
    kinds: BLADE_KINDS,
    accept: (info) => !shieldCovers(L, info.attacker),
    onRefuse: () => d.dream.hint(d.p, 'The shield blocks it — Flash Step BEHIND it, then swing'),
    onHit: () => { L.hits = (L.hits ?? 0) + 1; },
    onBreak: () => cleared(d),
  });
  L.foe.shield(true);
  L.yaw = Math.atan2(L.pad.x - c.x, L.pad.z - c.z);
  L.wait = 0;
  L.lastBear = L.yaw;
}

/** Is her blow coming from the shield's half? */
function shieldCovers(L, who) {
  const g = L.foe.group.position;
  const x = who.position.x - SIM.dx - g.x;
  const z = who.position.z - SIM.dz - g.z;
  const n = Math.hypot(x, z) || 1;
  return (x * Math.sin(L.yaw) + z * Math.cos(L.yaw)) / n > -0.2;
}

function shieldTick(d, L, dt) {
  if (!L.foe) return;
  const g = L.foe.group.position;
  const bear = Math.atan2(d.p.position.x - SIM.dx - g.x, d.p.position.z - SIM.dz - g.z);
  const jump = Math.abs(Math.atan2(Math.sin(bear - L.lastBear), Math.cos(bear - L.lastBear)));
  L.lastBear = bear;
  // A bearing that jumps more than a right angle in one frame is a teleport.
  if (jump > Math.PI / 2 && L.wait <= 0) L.wait = SHIELD_TURN.wait;
  if (L.wait > 0) L.wait -= dt;
  else {
    const dy = Math.atan2(Math.sin(bear - L.yaw), Math.cos(bear - L.yaw));
    L.yaw += Math.sign(dy) * Math.min(Math.abs(dy), SHIELD_TURN.rate * dt);
  }
  L.foe.shieldGrp.rotation.y = L.yaw;
}

/* ----------------------------- 返 / 間 partners --------------------------- */

/**
 * 返: a holo-kitten that walks up to her, tells, and swings — the school's
 * partner, one of them, with the tell a drill can time.
 * `o.blowAt(d)` is when, after the tell starts, the blow lands.
 */
const PARRY_REST = 1.3;
function parryDrill(g, p, o) {
  return {
    title: o.title, goal: 3, time: 45, bands: o.bands, goalText: o.goalText, countLabel: 'caught ',
    setup(d) {
      const spec = d.dream.kittenSpec();
      const c = d.spot(6, 0);
      d.holo = d.target(HoloKitten, {
        x: c.x, y: c.y, z: c.z, spec, name: 'the holo-kitten', hits: 99, kinds: ['riposte'],
        onRefuse: () => d.dream.hint(d.p, 'Don’t swing — catch ITS blow, then you hit back'),
      });
      d.holo.swordPose(0, 0);
      d.mode = 'rest';
      d.modeT = 0.6;
      d.seq = d.p.parrySeq;
      d.dream.refillSim(d.p);
    },
    tick(d, dt) {
      const p = d.p;
      const h = d.holo;
      const me = h.group.position;
      const x = p.position.x - SIM.dx;
      const z = p.position.z - SIM.dz;
      const dist = Math.hypot(x - me.x, z - me.z);
      const raised = p.parrySeq !== d.seq;
      d.seq = p.parrySeq;
      if (d.mode !== 'strike') h.aimAt(x, z);
      if (d.mode === 'rest') {
        d.modeT -= dt;
        h.swordPose(0, 0);
        if (d.modeT <= 0) d.mode = 'walk';
      } else if (d.mode === 'walk') {
        /* STOPS 0.1 SHORT OF WHERE IT AIMS. It aimed at 1.9 and walked
           while further than 1.9, and a step clamped to the gap closes on a
           number it never quite reaches: it stood at 1.9000x forever and
           never swung (seen in the browser). */
        if (dist > 2.0) {
          const k = Math.min(4.5 * dt, dist - 1.9) / (dist || 1);
          me.x += (x - me.x) * k;
          me.z += (z - me.z) * k;
        } else {
          d.mode = 'wind';
          d.windT = 0;
          d.guardAt = null;
        }
      } else if (d.mode === 'wind') {
        // THE TELL: white, still, and the sword going up.
        h.flash = Math.max(h.flash, 0.6);
        d.windT += dt;
        h.swordPose(Math.min(1, d.windT / Math.max(0.1, o.blowAt(d))), 0);
        if (raised && d.guardAt == null) d.guardAt = d.windT;
        if (d.windT >= o.blowAt(d)) {
          const k = 1 / (dist || 1);
          const r = d.dream.simHit(p, {
            dmg: 10, push: { x: (x - me.x) * k, z: (z - me.z) * k }, src: 'blade', drill: d,
            from: { x: me.x, z: me.z }, foe: h,
          });
          if (r === 'parried') d.progress();
          else if (r === 'dodged') d.dream.hint(p, 'A Flash Step is not a catch — guard and PUSH at it');
          else if (r === 'blocked') d.dream.hint(p, 'A shield is not a catch — drop it, guard and PUSH');
          else if (r === 'hit') d.dream.hint(p, o.missed(g, d));
          // The blade comes down where everybody can see it, THEN it backs off.
          d.mode = 'strike';
          d.modeT = SWORD_SWING;
        }
      } else if (d.mode === 'strike') {
        d.modeT -= dt;
        h.swordPose(0, 1 - Math.max(0, d.modeT) / SWORD_SWING);
        if (d.modeT <= 0) {
          // And back off, to come at her from somewhere new.
          const a = Math.atan2(me.x - x, me.z - z) + (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 0.8);
          me.x = x + Math.sin(a) * 6;
          me.z = z + Math.cos(a) * 6;
          const R = d.at.r - 2;
          const ox = me.x - d.at.x; const oz = me.z - d.at.z;
          const od = Math.hypot(ox, oz);
          if (od > R) { me.x = d.at.x + (ox / od) * R; me.z = d.at.z + (oz / od) * R; }
          h.local.set(me.x, d.at.y, me.z);
          d.mode = 'rest';
          d.modeT = PARRY_REST;
        }
      }
    },
  };
}

/**
 * 間: the PACK. Levels of partners (PACK_LEVELS) who close on her, wait for
 * each other, and wind and swing together. The blows of one swing are
 * judged TOGETHER: who her guard covers is asked of every partner BEFORE any
 * blow is dealt, because the first caught blow's riposte closes her guard
 * (`Player.riposte`, one catch per stance) and the second would read as a
 * miss. All covered: one `simHit` for the pack, caught and answered. Any
 * not: the blow from the uncovered one lands, and the level starts over.
 */
function packDrill(g, p, o) {
  return {
    title: o.title, goal: PACK_LEVELS.length, time: 240, bands: o.bands, goalText: o.goalText, countLabel: 'level ',
    setup(d) {
      d.dream.refillSim(d.p);
      levels(d, PACK_LEVELS.map((P) => ({
        name: P.name,
        build: (dd, L) => packBuild(dd, L, P),
        tick: (dd, L, dt) => packTick(g, dd, L, P, o, dt),
      })));
    },
    tick: (d, dt) => stepLevels(d, dt),
  };
}

function packBuild(d, L, P) {
  const c = d.spot(0, 0);
  const fy = Math.atan2(d.at.fwd.x, d.at.fwd.z);
  d.put({ ...c, facing: fy });
  L.caught = 0;
  L.mode = 'rest';
  L.modeT = 0.8;
  L.seq = d.p.parrySeq;
  L.foes = P.from.map(([deg, side]) => {
    const a = fy + THREE.MathUtils.degToRad(deg);
    const sx = Math.cos(a) * side;
    const sz = -Math.sin(a) * side;
    const q = { x: c.x + Math.sin(a) * PACK_SPAWN + sx, y: c.y, z: c.z + Math.cos(a) * PACK_SPAWN + sz };
    const h = d.target(HoloKitten, {
      x: q.x, y: q.y, z: q.z, spec: d.dream.kittenSpec(), name: 'a holo-kitten', hits: 99, kinds: ['riposte'],
      onRefuse: () => d.dream.hint(d.p, 'Don’t swing — catch THEIR blows, then you hit back'),
    });
    h.swordPose(0, 0);
    return h;
  });
}

function packTick(g, d, L, P, o, dt) {
  const p = d.p;
  const x = p.position.x - SIM.dx;
  const z = p.position.z - SIM.dz;
  const raised = p.parrySeq !== L.seq;
  L.seq = p.parrySeq;
  const distOf = (h) => Math.hypot(x - h.group.position.x, z - h.group.position.z);
  for (const h of L.foes) if (L.mode !== 'strike') h.aimAt(x, z);
  if (L.mode === 'rest') {
    L.modeT -= dt;
    for (const h of L.foes) h.swordPose(0, 0);
    if (L.modeT <= 0) L.mode = 'walk';
  } else if (L.mode === 'walk') {
    for (const h of L.foes) {
      const me = h.group.position;
      const dist = distOf(h);
      if (dist > PACK_CLOSE - 0.1) {
        const k = Math.min(PACK_SPEED * dt, dist - (PACK_CLOSE - 0.2)) / (dist || 1);
        me.x += (x - me.x) * k;
        me.z += (z - me.z) * k;
      }
    }
    packSpread(L);
    // NOBODY SWINGS ALONE: the pack winds when every one of them is close.
    if (L.foes.every((h) => distOf(h) <= PACK_CLOSE + 0.3)) {
      L.mode = 'wind';
      L.windT = 0;
      d.guardAt = null;
    }
  } else if (L.mode === 'wind') {
    // She ran: they follow, and the tell starts again when they are back.
    if (L.foes.some((h) => distOf(h) > PACK_CLOSE + 1.4)) { L.mode = 'walk'; return; }
    L.windT += dt;
    const at = o.blowAt(d);
    for (const h of L.foes) {
      h.flash = Math.max(h.flash, 0.6);
      h.swordPose(Math.min(1, L.windT / Math.max(0.1, at)), 0);
    }
    if (raised && d.guardAt == null) d.guardAt = L.windT;
    if (L.windT >= at) packBlow(g, d, L, o, x, z);
  } else if (L.mode === 'strike') {
    L.modeT -= dt;
    for (const h of L.foes) h.swordPose(0, 1 - Math.max(0, L.modeT) / SWORD_SWING);
    if (L.modeT <= 0) {
      if (L.after === 'retry') { retry(d, L.why); return; }
      // Caught: they step back and wait the riposte out — "a second or two".
      for (const h of L.foes) {
        const me = h.group.position;
        const a = Math.atan2(me.x - x, me.z - z);
        me.x = x + Math.sin(a) * PACK_BACK;
        me.z = z + Math.cos(a) * PACK_BACK;
        h.local.set(me.x, d.at.y, me.z);
      }
      L.mode = 'rest';
      L.modeT = PACK_REST;
      if (L.caught >= P.need) cleared(d);
    }
  }
}

/** Partners do not stand in each other. */
function packSpread(L) {
  for (let i = 0; i < L.foes.length; i++) {
    for (let j = i + 1; j < L.foes.length; j++) {
      const a = L.foes[i].group.position;
      const b = L.foes[j].group.position;
      const dx = b.x - a.x; const dz = b.z - a.z;
      const n = Math.hypot(dx, dz);
      if (n > 1e-3 && n < PACK_GAP) {
        const k = (PACK_GAP - n) / n / 2;
        a.x -= dx * k; a.z -= dz * k;
        b.x += dx * k; b.z += dz * k;
      }
    }
  }
}

function packBlow(g, d, L, o, x, z) {
  const p = d.p;
  const at = (h) => ({ x: h.group.position.x + SIM.dx, z: h.group.position.z + SIM.dz });
  const open = L.foes.filter((h) => !p.parries?.(at(h)));
  const lead = open[0] ?? L.foes[0];
  const me = lead.group.position;
  const k = 1 / (Math.hypot(x - me.x, z - me.z) || 1);
  const r = d.dream.simHit(p, {
    dmg: 10, push: { x: (x - me.x) * k, z: (z - me.z) * k }, src: 'blade', drill: d,
    from: { x: me.x, z: me.z }, foe: lead,
  });
  L.mode = 'strike';
  L.modeT = SWORD_SWING;
  L.after = null;
  if (r === 'parried' && !open.length) {
    L.caught++;
    if (L.foes.length > 1) d.dream.hint(p, `返 Caught all ${L.foes.length}!`);
  } else if (r === 'hit' || r === 'immune' || r === 'parried') {
    L.after = 'retry';
    L.why = open.length && L.foes.length > 1 && open.length < L.foes.length
      ? 'One got you from the other side — lead them round so they all come from ONE side'
      : o.missed(g, d);
  } else if (r === 'dodged') d.dream.hint(p, 'A Flash Step is not a catch — guard and PUSH at them');
  else if (r === 'blocked') d.dream.hint(p, 'A shield is not a catch — drop it, guard and PUSH');
}

export { CHARGE, DODGE, PARRY, lockRangeFor, parryWindowFor };
