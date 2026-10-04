import * as THREE from 'three';
import { POWER_ORBS, PowerOrbPickup, WARD, AEGIS, DODGE, CHARGE, PARRY, lockRangeFor, parryWindowFor } from '../../entities/powerorb.js';
import { SIM, HOLO } from '../../world/simworld.js';
import { HoloPanel } from './holo.js';
import { Post, Tile, Mat, HoloKitten } from './targets.js';

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
/** 跳: the ledge the star sits on, above the island floor. */
export const LEAP_DECK = 5.0;
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
        interact: (p) => this.start(p, ped),
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
  /* 疾 GALE. Eight gates in a star across the floor, each one lit only when
     the last is through. A star is ~18.5 units a leg: 148 units in all, so a
     sprint (17 u/s) is ~9s of running before the turns, and 1.22x is the
     difference between two stars and three. */
  swift: (g, p) => ({
    title: 'GALE DRILL', goal: 8, time: 25, bands: [25, 13, 9.5],
    goalText: 'Run through the gates in order', countLabel: 'gates ',
    setup(d) {
      const pts = [];
      for (let i = 0; i < 8; i++) {
        const a = (i * 3 * Math.PI * 2) / 8;
        pts.push(d.spot(Math.cos(a) * 9.5, Math.sin(a) * 9.5));
      }
      d.gateList = pts.map((q, i) => {
        const nx = pts[(i + 1) % 8];
        const yaw = Math.atan2(nx.x - q.x, nx.z - q.z);
        const rr = d.ring({ x: q.x, y: q.y, z: q.z, yaw, r: 1.9, onPass: () => armNext(d, i) });
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
     is how much bar she still has. */
  vigor: (g, p) => ({
    title: 'ADAMANT DRILL', goal: 1, time: 12, timeWins: true, showCount: false,
    goalText: 'Stay in the circle — jump the beams', score: (d) => d.dream.simFrac(d.p),
    lowerIsBetter: false, bands: [0.01, 0.45, 0.75],
    doneText: (d) => `${Math.round(d.dream.simFrac(d.p) * 100)}% of your bar left`,
    setup(d) {
      const c = d.spot(0, 0);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(5.6, 5.9, 48).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: HOLO.gold, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false })
      );
      ring.position.set(c.x, c.y + 0.06, c.z);
      d.root.add(ring);
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
      if (Math.hypot(x - c.x, z - c.z) > 6.2) d.fail('Out of the circle!');
    },
  }),

  /* 跳 LEAP. A star on a ledge LEAP_DECK above the floor. From player.js:
     JUMP_V 11.2, GRAVITY 26, and only the LAST jump of a chain is the weak
     one (x0.86) — every jump before it is a full one. So one jump tops out
     at 2.41, two at 4.19, three at 6.61, and a deck is landable from 0.4
     under it. 4.59 < 5.0 < 7.01: two jumps cannot, three can. (The first
     cut of this comment said 5.98 for three, reading every air jump as weak;
     world-check now measures it.) */
  leap: (g, p) => ({
    title: 'LEAP DRILL', goal: 1, time: 20, bands: [20, 8, 5], showCount: false,
    goalText: 'Jump THREE times to reach the star',
    setup(d) {
      const q = d.spot(4, 0);
      d.deck({ x: q.x, z: q.z, y: q.y + LEAP_DECK, r: 2.3 });
      d.star({ x: q.x, y: q.y + LEAP_DECK, z: q.z, onTake: () => d.progress() });
    },
  }),

  /* 壁 WARD. Three turrets round her, firing in turn, slow enough to see.
     Six blocked bolts passes; a bolt that lands costs 12 of the bar. A step
     aside also dodges one — that is allowed, but only a BLOCK counts. */
  ward: (g, p) => wardDrill(g, p, {
    title: 'WARD DRILL', goal: 6, bands: [30, 16, 11], every: 1.5,
    goalText: 'HOLD the shield button to block the bolts',
  }),

  /* 落 POWER DIVE. Four cracked tiles. A swing rocks them and says so; only
     the dive (radius DIVE.radius round her landing) breaks one. */
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

  /* 十 CROSS SLASH. One big post, twelve blows, wearing a bar (it takes more
     than three — Richard's rule). The goal is the TECHNIQUE: three Cross
     Slash cuts landing on it. Tapping attack is an ordinary swing and does
     not count, and the card says so. */
  tri: (g, p) => ({
    title: 'CROSS SLASH DRILL', goal: 3, time: 25, bands: [25, 10, 6],
    goalText: 'HOLD attack — land all three cuts', countLabel: 'cuts ',
    setup(d) {
      const q = d.spot(4, 0);
      d.target(Post, {
        x: q.x, y: q.y, z: q.z, hits: 12, barY: 3.6, respawn: 0.6,
        onHit: (t, info) => {
          if (info.kind === 'tri') d.progress();
          else d.dream.hint(d.p, `That was a tap — HOLD [${g.key(d.p, 'attack')}] for the Cross Slash`);
        },
      });
    },
  }),

  /* 突 CHARGE. Three mats in a row, three units apart — a charge runs
     CHARGE.dist (16) and goes through all of them. Score is how many
     charges it took: one is three stars. */
  charge: (g, p) => ({
    title: 'CHARGE DRILL', goal: 3, time: 30, score: (d) => d.charges, lowerIsBetter: true,
    bands: [9, 2, 1], goalText: 'Sprint + attack: charge THROUGH the mats', countLabel: 'mats ',
    setup(d) {
      d.charges = 0;
      d.lastSeq = d.p.chargeT > 0;
      const yaw = Math.atan2(d.at.fwd.x, d.at.fwd.z);
      for (const a of [2, 5, 8]) {
        const q = d.spot(a, 0);
        d.target(Mat, {
          x: q.x, y: q.y, z: q.z, yaw,
          onRefuse: () => d.dream.hint(d.p, `Hold [${g.key(d.p, 'sprint')}] and press [${g.key(d.p, 'attack')}] to CHARGE`),
          onBreak: () => d.progress(),
        });
      }
    },
    tick(d) {
      const on = d.p.chargeT > 0;
      if (on && !d.lastSeq) d.charges++;
      d.lastSeq = on;
    },
  }),

  /* 守 LONG GUARD. One turret, one long BEAM, aimed at her the whole time.

     A BEAM AND NOT A STREAM OF BOLTS. The first cut was a stream, and it
     could not be passed by anybody: every bolt is a blow, and `WARD.hits`
     (2) blows smash a bubble however long it had left — the arena's rule, and
     the right one there. So the beam is a HELD thing: `simHit(..., {hold})`
     asks only whether the bubble is up and never spends a blow on it.

     ITS LENGTH IS MEASURED BETWEEN THE TWO KITS IT IS THERE TO TELL APART.
     A bare Ward is up for WARD.max plus the WARD.tail after the release, 2.2s;
     the pair of Nagamori this drill lends make it 3.4s. `BEAM_T` sits 0.24s
     past the first, so a bare Ward cannot pass however well it is timed, and
     a second short of the second, so a lent one can be raised early — and
     world-check pins both sides. The drill is the sentence on the orb's
     card: you can hold it longer. */
  aegis: (g, p) => ({
    title: 'LONG GUARD DRILL', goal: 1, time: 40, bands: [40, 18, 9], showCount: false,
    goalText: `Shield UP when the beam fires — hold it ${BEAM_T.toFixed(1)}s`,
    setup(d) {
      d.turret = d.spot(11, 0, 1.6);
      const t = new THREE.Mesh(new THREE.OctahedronGeometry(1.0, 0), new THREE.MeshBasicMaterial({ color: 0xff5a3a, wireframe: true, toneMapped: false }));
      t.position.set(d.turret.x, d.turret.y, d.turret.z);
      d.root.add(t);
      d.beamCycle = -1.4;
      d.beam = d.laser({
        a: d.turret, b: d.turret, thick: 0.5, dmg: 6, hold: true,
        // Always pointed at her middle, and on past her so it reads as a beam.
        move: (_t, L) => {
          const q = d.p;
          const x = q.position.x - SIM.dx;
          const z = q.position.z - SIM.dz;
          const y = q.position.y + (q.height ?? 2.6) * 0.5;
          const dx = x - L.a.x; const dy = y - L.a.y; const dz = z - L.a.z;
          const n = Math.hypot(dx, dy, dz) || 1;
          L.b.set(x + (dx / n) * 6, y + (dy / n) * 6, z + (dz / n) * 6);
        },
        onResult: (r) => {
          if (r === 'blocked') d.held = (d.held ?? 0) + 1;
          else if (r === 'hit' || r === 'immune') d.leaked = true;
          else if (r === 'dodged') d.stepped = true;
        },
      });
      d.beam.on = false;
      d.dream.refillSim(d.p);
    },
    tick(d, dt) {
      d.beamCycle += dt;
      const live = d.beamCycle >= 0 && d.beamCycle < BEAM_T;
      d.beam.on = live;
      if (d.beamCycle < 0 && d.beamCycle + dt >= -1.0) d.dream.hint(d.p, `Beam in 1… raise the shield [${g.key(d.p, 'mount')}]`);
      if (d.beamCycle >= BEAM_T) {
        // Judge the whole beam at once, then go again.
        if (!d.leaked && !d.stepped && d.held) { d.progress(); return; }
        const short = !(d.p.power?.ward?.max > WARD.max + 0.01);
        d.dream.hint(d.p, d.stepped ? 'A Flash Step is not a block — HOLD the shield'
          : short ? 'Your shield ran out first — Long Guard holds it longer'
          : 'Raise it as it fires and HOLD it — again!');
        d.beamCycle = -2.2;
        d.leaked = false; d.stepped = false; d.held = 0;
      }
    },
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
     white and still for PARRY_TELL — the tell. Guard toward it inside the last
     0.35s of that and the blow is caught and answered (`simHit` asks the
     parry, then `riposte` swings back through the sim's gate). It only
     answers to a riposte: a swing at it rocks it and she is told how. */
  parry: (g, p) => parryDrill(g, p, {
    title: 'RIPOSTE DRILL', bands: [40, 20, 12],
    goalText: 'When it flashes: HOLD Interact, PUSH the stick at it',
    blowAt: () => PARRY_TELL,
    missed: (g2, d) => `Too early or too late — HOLD [${g2.key(d.p, 'interact')}] and PUSH just before it swings`,
  }),

  /* 間 LONG PARRY. The same partner, but this one WAITS: its blow lands
     PARRY_LATE after she raises her guard, which is 0.07s after a bare
     window (0.35) has shut and 0.105s before one Ma's (0.525) does. So bare it
     cannot be passed however it is timed, and lent it is the sentence on the
     orb's card: raise it any time in the tell and it holds. `world-check`
     pins both sides, as it does Long Guard's beam. */
  longparry: (g, p) => parryDrill(g, p, {
    title: 'LONG PARRY DRILL', bands: [40, 20, 12],
    goalText: 'It waits you out — raise your guard as it flashes and HOLD it',
    blowAt: (d) => (d.guardAt != null ? Math.min(PARRY_TELL_MAX, d.guardAt + PARRY_LATE) : PARRY_TELL_MAX),
    missed: (g2, d) => (d.p.parryWin > PARRY.window + 1e-6
      ? 'Raise it while it flashes — Long Parry holds it till the blow'
      : 'It waited until your guard dropped — Long Parry holds it longer'),
  }),

  /* 瞬 FLASH STEP. A wall of three stacked beams right across the island,
     and a star on the far side. Walking through it costs bar and throws her
     back; a Flash Step is untouchable for DODGE.invuln and crosses it. */
  blink: (g, p) => ({
    title: 'FLASH STEP DRILL', goal: 1, time: 25, bands: [25, 10, 6], showCount: false,
    goalText: 'Sprint + interact: step THROUGH the laser wall',
    setup(d) {
      const R = d.at.r + 2;
      for (const h of [0.4, 1.3, 2.2]) {
        const a = d.spot(2, -R, h);
        const b = d.spot(2, R, h);
        d.laser({ a, b, dmg: 10, thick: 0.18, warm: 0.4 });
      }
      const q = d.spot(9, 0);
      d.star({ x: q.x, y: q.y, z: q.z, onTake: () => d.progress() });
    },
  }),
};

function armNext(d, i) {
  d.progress();
  const nx = d.gateList[i + 1];
  if (nx) { nx.armed = true; nx.setColour(d.colour); }
  d.gateList[i].setColour(0x224433);
}

/**
 * 返 / 間: a holo-kitten that walks up to her, tells, and swings — the
 * school's partner, one of them, with the tell a drill can time.
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
        onRefuse: () => d.dream.hint(d.p, 'Don\u2019t swing — catch ITS blow, then you hit back'),
      });
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
      if (d.mode === 'rest') {
        d.modeT -= dt;
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
        // THE TELL: white, and still.
        h.flash = Math.max(h.flash, 0.6);
        d.windT += dt;
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

/** The Long Guard beam: past a bare Ward (2.2s), well short of the lent pair (3.4s). */
export const BEAM_T = WARD.max + WARD.tail + AEGIS.add * 0.4;

/** The Ward drill's turret rig. */
function wardDrill(g, p, o) {
  return {
    title: o.title, goal: o.goal, time: 32, bands: o.bands, showCount: o.showCount,
    goalText: o.goalText, countLabel: 'blocked ',
    setup(d) {
      d.fireT = 1.2;
      d.turn = 0;
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
        d.bolt(q, { speed: 13, dmg: 12, onResult: (r) => { if (r === 'blocked') d.progress(); } });
      }
    },
  };
}

export { CHARGE, DODGE, PARRY, lockRangeFor, parryWindowFor };
