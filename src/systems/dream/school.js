import * as THREE from 'three';
import { SIM, HOLO } from '../../world/simworld.js';
import { CRITTER_BY_ID, EAT_TIME, CATCH_RADIUS, STUN_TIME } from '../../entities/critter.js';
import {
  MODES, handicapFor, decideOnTime, purseSplit, TEAM_COLOURS, TEAM_NAMES,
  ROUND_LIMIT, WINS_NEEDED,
} from '../tournament.js';
import { Kiosk, idleIn, isleSpot, stars3 } from './kiosk.js';
import { HoloPanel } from './holo.js';
import { Target, HoloKitten, holoSolid, holoMat } from './targets.js';

/* ---------------------------------------------------------------------------
   THE ARENA SCHOOL — 闘技. The tournament, taught before it is fought.

   The pitch Richard approved: "Holo-rats to eat, each battle type walked
   through with practice rounds, and a live scoreboard explained". Until now
   the first time a kitten met any of the ring's rules was with her sisters
   watching and the clock running — and the two rules that decide most rounds
   (the feast, and "the most health LEFT wins on time") are invisible: you
   cannot see a mean, and nobody tells you a stunned rat is food.

   THREE THINGS ON ONE FLOOR:

     · 食 THE FEAST PEN. Holo-critters to stun and eat, on the ring's OWN
       numbers — `EAT_TIME`, `CATCH_RADIUS`, `STUN_TIME` and each animal's
       `heal` are imported from entities/critter.js, not restated, so the
       lesson cannot drift from the game. She starts on 40% SIM and eats her
       way back up, which is exactly what the feast is for.
     · 対 SIX PRACTICE ROUNDS, one per league in `MODES`, against holo-
       kittens, with holo-partners where the league has partners. Every
       league explains itself in its own `blurb`; the handicap leagues put HER
       in the lone seat, so the bigger bar she is told about is hers.
     · 板 THE SCOREBOARD. It shows the practice round of the nearest kitten,
       and the round is DECIDED by `decideOnTime` and its purse printed by
       `purseSplit` — the tournament's own two functions (tournament.js), not
       copies. A scoreboard that explained a rule the ring did not use would
       be the prettier orb that lies about its position (non-negotiable 1).

   NOBODY IS HURT (non-negotiable 3). Her blows reach holograms through the
   TrainingGate; theirs reach her SIM bar through `simHit`; and a holo-kitten
   striking a holo-kitten is arithmetic on two holograms. A knockout here is
   the simulator catching her, and the round carries on without her — which is
   what a knockout in a team league is like, and why it is allowed to.
--------------------------------------------------------------------------- */

/** Seconds a practice round lasts. A real one is `ROUND_LIMIT` (two minutes);
 *  forty is long enough to see the clock decide one and short enough to try
 *  every league in an afternoon. The card says which is which. */
export const PRACTICE_T = 40;
/** Blows a holo-fighter takes, before its handicap. */
export const HOLO_HITS = 5;
/** SIM a holo-fighter's blow costs her, before her handicap. */
export const HOLO_DMG = 15;
/** How close a holo-fighter gets before it winds up, how far its blade then
 *  reaches, and how long the wind-up is — the tell. 0.65s and a 0.5-unit
 *  margin is a step back she has time for at a walk (10.5 u/s). */
export const HOLO_CLOSE = 1.9;
export const HOLO_REACH = 2.4;
export const HOLO_WIND = 0.65;
export const HOLO_REST = 0.9;
export const HOLO_SPEED = 4.5;
/** How many seats each league is practised with. FFA is three, not four:
 *  `TEAM_COLOURS` has three, and three is enough to see "everyone for
 *  herself" without four holograms in a nine-unit ring. */
export const LEAGUE_SEATS = { duel: 2, ffa: 3, pairs: 4, two_one: 3, three_one: 4, two_one_one: 4 };
/** Her seat. The handicap leagues put her in the LONE seat, so the slightly
 *  bigger bar the blurb promises is the one over her own head. */
export const HER_SEAT = { duel: 0, ffa: 0, pairs: 0, two_one: 2, three_one: 3, two_one_one: 2 };

/** The pen and the ring, on the island (a along `fwd`, b to its right). */
export const PEN_AT = [3, -13];
export const PEN_R = 8;
export const RING_AT = [3, 12];
export const RING_R = 9;
/** League pads, on an arc of this radius round the ring, facing the bridge. */
export const LEAGUE_ARC = 12;
export const LEAGUE_ANGLES = [90, 120, 150, 180, 210, 240];
export const FEAST_KIOSK = [-10, -13];
export const BOARD_AT = [17, 12];
/** How long the board keeps a decided round up after its drill has gone. */
export const BOARD_HOLD = 12;
/** The three she eats in the pen — the ring's three common animals. The
 *  mantis (+40, at 18.9 u/s) is a story the card tells, not a lesson. */
export const PEN_KINDS = ['rat', 'rabbit', 'bird'];
/** In a pen of radius eight a rabbit at its ring speed (11.6) outruns her
 *  walk forever; the holo-critters flee at this fraction of their real speed.
 *  The stun, the hold and the heal are the real numbers. */
export const PEN_SLOW = 0.55;
export const FEAST_START = 0.4;
export const FEAST_BANDS = [90, 36, 24];

/** How far she can be moving and still be eating — `STILL_SPEED` in
 *  menagerie.js, which does not export it. world-check reads it off the file
 *  and fails if the two ever differ. */
export const STILL = 3.0;

const hexOf = (css) => parseInt(String(css).slice(1), 16);

/**
 * A side's bar, 0..1: the MEAN of its fighters, a knocked-out one counting
 * nought and nobody counting past her own 100%. This is `_sideHealth` for
 * things that are not Players — `world-check` runs the two side by side.
 */
export function sideMean(members) {
  if (!members.length) return 0;
  return members.reduce((n, m) => n + (m.ko ? 0 : Math.max(0, Math.min(1, m.frac))), 0) / members.length;
}

/**
 * What the scoreboard says. PURE: `view` is the round as numbers, and the
 * decision on it is `decideOnTime`'s — the line that says who is ahead is
 * computed by the same call that will decide the round when the clock hits
 * zero. `null` view is the rules, for when nobody is practising.
 *
 * @param {null|{ mode, sides:{side,health,hits,up,hers}[], left, price, done? }} view
 */
export function boardLines(view) {
  if (!view) {
    return [
      { text: '板 HOW A ROUND IS WON', size: 1.5, color: HOLO.gold, glow: true, jp: true },
      { text: '1 · Knock the other side out', size: 0.95 },
      { text: '2 · Time up? The side with the most health LEFT wins', size: 0.95 },
      { text: '     (a team counts its AVERAGE, so bigger is not better)', size: 0.75, color: 0x9fefff },
      { text: '3 · Level? Whoever landed more this round', size: 0.95 },
      { text: '4 · Still level? It is a draw', size: 0.95 },
      { text: `Best of ${WINS_NEEDED * 2 - 1} · ${ROUND_LIMIT / 60} minutes a round · the winners split the purse`, size: 0.8, color: 0x9fefff },
    ];
  }
  const health = view.sides.map((s) => s.health);
  const { leaders, onDamage } = decideOnTime(health, (k) => view.sides[k].hits);
  const lines = [{ text: `板 ${view.mode.name}`, size: 1.4, color: HOLO.gold, glow: true, jp: true }];
  for (const [k, s] of view.sides.entries()) {
    const lead = leaders.length === 1 && leaders[0] === k;
    lines.push({
      text: `${s.hers ? '▶ ' : ''}${TEAM_NAMES[s.side]}  ${Math.round(s.health * 100)}%  ·  ${s.hits} landed${s.up ? '' : '  · OUT'}${lead ? '  ◀ AHEAD' : ''}`,
      size: 1.0, color: TEAM_COLOURS[s.side],
    });
  }
  const why = leaders.length !== 1 ? 'level on health and hits — a DRAW if time ran out now'
    : onDamage ? 'level on health — ahead on hits landed'
      : 'ahead on health LEFT';
  lines.push({ text: `${view.done ? 'Decided' : `${Math.ceil(view.left)}s`} · ${why}`, size: 0.85, color: 0x9fefff });
  const winners = leaders.length === 1 ? view.sides[leaders[0]].size : 0;
  if (view.price > 0 && winners > 0) {
    const { share, odd } = purseSplit(view.price, winners);
    lines.push({
      text: winners > 1
        ? `Purse ${view.price} split ${winners} ways: ${share} each${odd ? ` (+${odd} to the winner)` : ''}`
        : `Purse ${view.price}: all of it to the winner`,
      size: 0.85, color: HOLO.gold,
    });
  } else {
    lines.push({ text: 'The purse is one Kotodama\'s price, split between the winners', size: 0.8, color: HOLO.gold });
  }
  return lines;
}

/* ------------------------------ the critters ----------------------------- */

/** A holo-rat (or rabbit, or bird). A blade STUNS it — it never breaks. */
export class HoloCritter extends Target {
  constructor(o) {
    super({ hits: 1, centre: 0.5, pad: 0.9, hitUp: 1, hitDown: 2.5, name: `the holo-${o.kind.name}`, ...o });
    this.kind = o.kind;
    this.home = o.home;
    this.state = 'run';
    this.stunT = 0;
    this.chew = 0;
    this.heading = Math.random() * Math.PI * 2;
    this.wanderT = 0;
    const s = this.kind.size;
    const c = this.colour;
    const parts = [];
    if (this.kind.id === 'rat') {
      parts.push(holoSolid(new THREE.BoxGeometry(0.5 * s, 0.38 * s, 0.85 * s).translate(0, 0.25 * s, 0), c));
      parts.push(holoSolid(new THREE.ConeGeometry(0.18 * s, 0.4 * s, 6).rotateX(Math.PI / 2).translate(0, 0.25 * s, 0.6 * s), c));
      parts.push(holoSolid(new THREE.CylinderGeometry(0.03 * s, 0.05 * s, 0.9 * s, 4).rotateX(Math.PI / 2).translate(0, 0.15 * s, -0.85 * s), c));
    } else if (this.kind.id === 'rabbit') {
      parts.push(holoSolid(new THREE.SphereGeometry(0.42 * s, 10, 8).scale(1, 0.9, 1.15).translate(0, 0.4 * s, 0), c));
      for (const x of [-0.12, 0.12]) {
        parts.push(holoSolid(new THREE.BoxGeometry(0.1 * s, 0.5 * s, 0.06 * s).translate(x * s, 0.95 * s, 0.2 * s), c));
      }
    } else {
      parts.push(holoSolid(new THREE.SphereGeometry(0.3 * s, 10, 8).translate(0, 0.45 * s, 0), c));
      for (const x of [-1, 1]) {
        parts.push(holoSolid(new THREE.BoxGeometry(0.5 * s, 0.04 * s, 0.3 * s).translate(x * 0.38 * s, 0.5 * s, 0), c));
      }
    }
    for (const m of parts) this.body.add(m);
    this.body.userData.mats = parts.flatMap((m) => m.userData.mats ?? []);
  }

  stun() {
    this.state = 'stunned';
    this.stunT = STUN_TIME;
    this.flash = 1;
  }

  /** Run about the pen; flee her when she is close; lie still when stunned. */
  steer(dt, her) {
    const g = this.group.position;
    if (this.state === 'stunned') {
      this.stunT -= dt;
      this.body.rotation.z = Math.PI * 0.5;   // on its side, legs to the camera
      if (this.stunT <= 0 && this.chew <= 0) { this.state = 'run'; this.body.rotation.z = 0; }
    } else {
      const hx = her.position.x - SIM.dx - g.x;
      const hz = her.position.z - SIM.dz - g.z;
      const d = Math.hypot(hx, hz) || 1;
      let speed = 2.0;
      if (d < 4.5) {
        this.heading = Math.atan2(-hx / d, -hz / d);
        speed = this.kind.speed * PEN_SLOW;
      } else {
        this.wanderT -= dt;
        if (this.wanderT <= 0) { this.wanderT = 1 + Math.random() * 1.5; this.heading += (Math.random() - 0.5) * 2.2; }
      }
      let nx = g.x + Math.sin(this.heading) * speed * dt;
      let nz = g.z + Math.cos(this.heading) * speed * dt;
      // The pen's fence: back inside, and turned along it, never through it.
      const ox = nx - this.home.x; const oz = nz - this.home.z;
      const od = Math.hypot(ox, oz);
      if (od > this.home.r - 1) {
        nx = this.home.x + (ox / od) * (this.home.r - 1);
        nz = this.home.z + (oz / od) * (this.home.r - 1);
        this.heading = Math.atan2(-oz, ox);
      }
      g.x = nx; g.z = nz;
      this.body.rotation.y = this.heading;
      // A hop, so a rabbit and a bird read as what they are.
      this.body.position.y = this.kind.kind === 'ground' ? 0 : Math.abs(Math.sin(this.t * 7)) * 0.35;
    }
    const k = 1 - 0.55 * Math.min(1, this.chew / EAT_TIME);
    this.body.scale.setScalar(k);
    this.position.set(g.x + SIM.dx, g.y + this.o.centre, g.z + SIM.dz);
  }
}

/* --------------------------- the practice fighters ------------------------ */

/** A holo-kitten with a side, a blade and a wind-up you can see. */
export class HoloFighter extends HoloKitten {
  constructor(o) {
    super({ hits: o.hits, tint: hexOf(TEAM_COLOURS[o.side]), colour: hexOf(TEAM_COLOURS[o.side]), barY: 3.6, ...o });
    this.side = o.side;
    this.state = 'walk';
    this.windT = 0;
    this.restT = 0;
    this.foe = null;
  }

  get ko() { return !this.live; }
  set ko(_) { /* Target writes it; liveness is the truth */ }
  get frac() { return this.hp / this.maxHits; }
}

/* -------------------------------- the school ------------------------------ */

export class ArenaSchool {
  constructor(dream, isle) {
    this.dream = dream;
    this.isle = isle;
    this.stations = [];
    this.kiosks = [];
    const at = (a, b) => isleSpot(isle, a, b);
    this.pen = { ...at(...PEN_AT), r: PEN_R };
    this.ring = { ...at(...RING_AT), r: RING_R };

    // The ring and the pen, drawn on the floor — the ring in the arena's gold.
    const mark = (c, r, colour) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.3, r, 64).rotateX(-Math.PI / 2), holoMat(colour, 0.7));
      m.position.set(c.x, c.y + 0.06, c.z);
      dream.sim.root.add(m);
    };
    mark(this.ring, RING_R, HOLO.gold);
    mark(this.pen, PEN_R, HOLO.green);

    const fk = at(...FEAST_KIOSK);
    this._kiosk({
      x: fk.x, z: fk.z, y: isle.y, colour: HOLO.green, kanji: '食', title: 'THE FEAST',
      card: (p) => {
        const name = p.style?.name ?? p.name;
        const best = dream.progress.best(name, 'school.feast');
        const h = (id) => CRITTER_BY_ID[id].heal;
        return [
          { text: '食 THE FEAST', size: 1.9, color: HOLO.green, glow: true, jp: true },
          { text: 'Between rounds, animals run into the ring. Eat to heal!', size: 1.05 },
          { text: `Swing to STUN one — then stand still and HOLD [${dream.key(p, 'attack')}] for ${EAT_TIME} seconds`, size: 0.95, color: 0x9fefff },
          { text: `rat +${h('rat')} · rabbit +${h('rabbit')} · bird +${h('bird')} · mantis +${h('mantis')}`, size: 0.95, color: 0x9fefff },
          { text: `best ${best != null ? `${best.toFixed(1)}s` : '—'}   ${stars3(dream.progress.stars(name, 'school.feast'))}`, size: 1.15, color: HOLO.gold },
        ];
      },
      prompt: (p, key) => `[${key}]  THE FEAST`,
      interact: (p) => dream.startDrill(p, FEAST(this), { ...this.pen, fwd: isle.fwd }),
    });

    MODES.forEach((mode, k) => {
      const th = THREE.MathUtils.degToRad(LEAGUE_ANGLES[k]);
      const q = at(RING_AT[0] + Math.cos(th) * LEAGUE_ARC, RING_AT[1] + Math.sin(th) * LEAGUE_ARC);
      const id = `school.${mode.id}`;
      this._kiosk({
        x: q.x, z: q.z, y: isle.y, r: 1.5, near: 3.4, colour: HOLO.gold, kanji: '対', title: mode.name,
        card: (p) => {
          const name = p.style?.name ?? p.name;
          const n = LEAGUE_SEATS[mode.id];
          const sides = mode.sides(n);
          const hk = handicapFor(sides, !!mode.handicap)[HER_SEAT[mode.id]];
          return [
            { text: `対 ${mode.name}`, size: 1.7, color: HOLO.gold, glow: true, jp: true },
            { text: mode.blurb, size: 1.05 },
            { text: hk > 1 ? `You are the lone fighter: your bar is ×${hk.toFixed(1)}` : `${n} fighters · ${new Set(sides).size} sides`, size: 0.95, color: 0x9fefff },
            { text: `Practice: ${PRACTICE_T}s (a real round is ${ROUND_LIMIT / 60} minutes)`, size: 0.9, color: 0x9fefff },
            { text: `best ${dream.progress.best(name, id) ?? '—'}${dream.progress.best(name, id) != null ? '%' : ''} kept   ${stars3(dream.progress.stars(name, id))}`, size: 1.1, color: HOLO.gold },
          ];
        },
        prompt: (p, key) => `[${key}]  PRACTISE ${mode.name}`,
        interact: (p) => dream.startDrill(p, LEAGUE(this, mode), { ...this.ring, fwd: isle.fwd }),
      });
    });

    // The scoreboard, standing beyond the ring and facing the bridge.
    const bq = at(...BOARD_AT);
    this.board = new HoloPanel({ w: 12, h: 6.4, px: 80, edge: HOLO.gold });
    this.board.position.set(bq.x, isle.y + 6.2, bq.z);
    this.board.set(boardLines(null), HOLO.gold);
    dream.sim.root.add(this.board);
    const post = holoSolid(new THREE.CylinderGeometry(0.3, 0.4, 3, 8).translate(0, 1.5, 0), HOLO.gold, 0.3);
    post.position.set(bq.x, isle.y, bq.z);
    dream.sim.root.add(post);

    dream.sim.tickers.push((dt) => this.update(dt));
  }

  _kiosk(o) {
    const k = new Kiosk(this.dream, o);
    this.kiosks.push(k);
    this.stations.push(k.station);
    return k;
  }

  /** Which practice round the board shows: the nearest kitten's, live or just
   *  decided; else the rules. */
  boardView() {
    let best = null;
    let bd = 40;
    for (const p of this.dream.simKittens()) {
      const d = this.dream.drills[p.index];
      if (!d?.league) continue;
      const dist = Math.hypot(p.position.x - SIM.dx - this.ring.x, p.position.z - SIM.dz - this.ring.z);
      if (dist < bd) { bd = dist; best = d; }
    }
    if (!best) return null;
    return leagueView(best, this.dream.game.kotodama?.price ?? 0);
  }

  update(dt) {
    const idle = idleIn(this.dream);
    for (const k of this.kiosks) k.update(dt, idle);
    /* THE RESULT STAYS UP. A decided drill is disposed 2.6-3.2s after it ends,
       and the board went straight back to the rules with it — so the one
       moment a kid turns round to read who won was the moment it had gone.
       The last view is held for BOARD_HOLD once its drill is. */
    let view = this.boardView();
    if (view) this.held = { view, t: BOARD_HOLD };
    else if (this.held && (this.held.t -= dt) > 0) view = { ...this.held.view, done: true };
    else this.held = null;
    this.board.set(boardLines(view), HOLO.gold);
  }

  faceCamera(camera) {
    for (const k of this.kiosks) k.faceCamera(camera);
    this.board.faceCamera(camera);
  }
}

/** A practice round as numbers — what the board and the decision both read. */
export function leagueView(d, price = 0) {
  const L = d.league;
  return {
    mode: L.mode,
    left: Math.max(0, PRACTICE_T - d.t),
    done: d.state === 'won' || d.state === 'failed',
    price,
    sides: L.sideIds.map((s) => {
      const members = L.members(s);
      return {
        side: s, size: members.length, hits: L.hits[s],
        health: sideMean(members), up: members.some((m) => !m.ko), hers: s === L.mySide,
      };
    }),
  };
}

/* -------------------------------- the drills ------------------------------ */

/** Still enough to eat: on the floor, not mid-move, barely moving. */
function feastStill(p) {
  return !!p.onGround && !p.busy && !p.ko && Math.hypot(p.velocity.x, p.velocity.z) < STILL;
}

/** The stunned animal under her paw, or null — nearest inside `CATCH_RADIUS`. */
function feastPin(d) {
  const p = d.p;
  let near = null;
  let nd = CATCH_RADIUS;
  for (const c of d.critters ?? []) {
    if (!c.live || c.state !== 'stunned') continue;
    const dist = Math.hypot(p.position.x - SIM.dx - c.group.position.x, p.position.z - SIM.dz - c.group.position.z);
    if (dist <= nd) { nd = dist; near = c; }
  }
  return near;
}

function FEAST(school) {
  return {
    id: 'school.feast', title: 'THE FEAST', kanji: '食', goal: PEN_KINDS.length, time: 90,
    goalText: 'Stun one, then stand still and HOLD attack to eat it', countLabel: 'eaten ',
    /* THE FLOOR REACHES HER PAD. It was PEN_R + 3, and the pad is 13 from the
       pen's middle — so the drill started, went live, and stopped her for
       leaving the floor she was standing on. */
    bands: FEAST_BANDS, leaveR: Math.hypot(FEAST_KIOSK[0] - PEN_AT[0], FEAST_KIOSK[1] - PEN_AT[1]) + 2,
    setup(d) {
      d.critters = PEN_KINDS.map((id, k) => {
        const a = (k / PEN_KINDS.length) * Math.PI * 2;
        const q = d.spot(Math.cos(a) * 4, Math.sin(a) * 4);
        return d.target(HoloCritter, {
          x: q.x, y: q.y, z: q.z, kind: CRITTER_BY_ID[id], home: school.pen, colour: HOLO.green,
          accept: (info, c) => {
            if (c.state !== 'stunned') d.dream.game.sfx?.('squeak');
            c.stun();
            d.dream.hint(d.p, `stunned! Stand still and HOLD [${d.dream.key(d.p, 'attack')}] to eat it`);
            return false;
          },
        });
      });
      d.eating = null;
    },
    start(d) {
      // She comes in hungry: the feast is for filling a bar that is NOT full.
      const s = d.dream.st[d.p.index];
      if (s) s.simHp = d.dream.simMax(d.p) * FEAST_START;
    },
    /* IS THIS PRESS THE EAT GESTURE — `Menagerie.wouldHold`'s rule, asked by
       the Cross Slash through `DreamDojo.critterHold`. Already chewing one, or
       standing still on top of a stunned one inside the FIXED `CATCH_RADIUS`.
       The same two functions `tick` decides the chew with, so the button and
       the meal cannot disagree about which animal is under her paw. */
    holds(d) {
      if (d.eating) return true;
      return feastStill(d.p) && !!feastPin(d);
    },
    tick(d, dt) {
      const p = d.p;
      for (const c of d.critters) if (c.live) c.steer(dt, p);
      const pad = d.dream.game.input?.players?.[p.index];
      const holding = !!pad?.down?.('attack');
      const still = feastStill(p);
      const near = feastPin(d);
      for (const c of d.critters) {
        if (c !== near || !holding || !still) { c.chew = 0; continue; }
        // Held down: it does not wake up under her paw.
        c.chew += dt;
        c.stunT = Math.max(c.stunT, 0.2);
        if (c.chew >= EAT_TIME) {
          const s = d.dream.st[p.index];
          if (s) s.simHp = Math.min(d.dream.simMax(p), (s.simHp ?? 0) + c.kind.heal);
          d.dream.game.sfx?.('chomp');
          d.dream.game.toast?.(`${p.name} ate the holo-${c.kind.name}: +${c.kind.heal}!`, p.index);
          c.chew = 0;
          c.breakNow();
          d.progress();
        }
      }
      d.eating = near && holding && still ? near : null;
    },
    paint(d) {
      if (d.state !== 'live' || !d.eating) return null;
      const k = Math.min(1, d.eating.chew / EAT_TIME);
      const bar = '▮'.repeat(Math.round(k * 10)) + '▯'.repeat(10 - Math.round(k * 10));
      return [
        { text: '食 EATING…', size: 2.0, color: HOLO.green, glow: true, jp: true },
        { text: bar, size: 1.6, color: HOLO.green },
        { text: 'keep holding — let go and it starts again', size: 1.2 },
      ];
    },
    doneText: () => 'In the ring, food past full turns GREEN — extra health!',
  };
}

function LEAGUE(school, mode) {
  const n = LEAGUE_SEATS[mode.id];
  const seat = HER_SEAT[mode.id];
  const sides = mode.sides(n);
  const hk = handicapFor(sides, !!mode.handicap);
  const mySide = sides[seat];
  return {
    id: `school.${mode.id}`, title: mode.name, kanji: '対', time: PRACTICE_T, goal: 1,
    goalText: mode.blurb, showCount: false, leaveR: LEAGUE_ARC + 2,
    score: (d) => Math.round(sideMean(d.league.members(mySide)) * 100),
    lowerIsBetter: false, bands: [0, 50, 80],
    setup(d) {
      const p = d.p;
      const spec = d.dream.kittenSpec();
      const fighters = [];
      // Her seat faces the way she came in; the rest share the circle.
      const hx = p.position.x - SIM.dx - school.ring.x;
      const hz = p.position.z - SIM.dz - school.ring.z;
      const base = Math.atan2(hx, hz);
      for (let i = 0; i < n; i++) {
        if (i === seat) {
          fighters.push({ her: true, side: sides[i], hk: hk[i], get ko() { return !!d.ko; }, get frac() { return d.dream.simFrac(p); } });
          continue;
        }
        const a = base + ((i - seat) / n) * Math.PI * 2;
        const x = school.ring.x + Math.sin(a) * (RING_R - 3);
        const z = school.ring.z + Math.cos(a) * (RING_R - 3);
        const f = d.target(HoloFighter, {
          x, y: school.ring.y, z, spec, side: sides[i], hits: Math.round(HOLO_HITS * hk[i]),
          name: `${TEAM_NAMES[sides[i]]}'s holo-kitten`,
          accept: (info, t) => t.side !== mySide,
          onRefuse: () => d.dream.hint(p, 'that is your PARTNER — partners cannot hurt each other'),
          onHit: () => { d.league.hits[mySide] += 1; },
        });
        f.restT = 0.6 + i * 0.25;
        f.state = 'rest';
        fighters.push(f);
      }
      const sideIds = [...new Set(sides)].sort((a, b) => a - b);
      d.league = {
        mode, mySide, fighters, sideIds,
        hits: Object.fromEntries(sideIds.map((s) => [s, 0])),
        members: (s) => fighters.filter((f) => f.side === s),
      };
    },
    /* KNOCKED OUT IS NOT STOPPED. The simulator catches her (her SIM bar is
       refilled so she can walk away) and the round goes on without her — her
       side counts her as nought, and in a team league her partner can still
       win it. That is the ring's own rule for a knockout. */
    caught(d) {
      if (d.ko) return true;
      d.ko = true;
      d.dream.hint(d.p, 'knocked out! In the ring you would be an angel now — can your side still win it?');
      return true;
    },
    tick(d, dt) {
      const p = d.p;
      const L = d.league;
      const her = L.fighters.find((f) => f.her);
      const posOf = (f) => (f.her
        ? { x: p.position.x - SIM.dx, z: p.position.z - SIM.dz }
        : { x: f.group.position.x, z: f.group.position.z });
      for (const f of L.fighters) {
        if (f.her || !f.live) continue;
        const me = posOf(f);
        // The nearest fighter on another side who is still up.
        let foe = null;
        let fd = Infinity;
        for (const o of L.fighters) {
          if (o === f || o.side === f.side || o.ko) continue;
          const q = posOf(o);
          const dist = Math.hypot(q.x - me.x, q.z - me.z);
          if (dist < fd) { fd = dist; foe = o; }
        }
        if (!foe) continue;
        const q = posOf(foe);
        if (f.state === 'rest') {
          f.restT -= dt;
          if (f.restT <= 0) f.state = 'walk';
        } else if (f.state === 'wind') {
          // THE TELL: white, and still. Then the blade, at whoever is in reach.
          f.flash = Math.max(f.flash, 0.5);
          f.windT -= dt;
          if (f.windT <= 0) {
            f.state = 'rest';
            f.restT = HOLO_REST;
            if (fd <= HOLO_REACH + 0.4) {
              if (foe.her) {
                const k = 1 / (fd || 1);
                const r = d.dream.simHit(p, { dmg: HOLO_DMG / her.hk, push: { x: (q.x - me.x) * k, z: (q.z - me.z) * k }, src: 'blade', drill: d });
                if (r === 'hit') L.hits[f.side] += 1;
              } else {
                foe.hp -= 1;
                foe.flash = 1;
                foe.wobV += 7;
                L.hits[f.side] += 1;
                if (foe.hp <= 0) foe.breakNow();
              }
            }
          }
        } else if (fd > HOLO_CLOSE) {
          const k = Math.min(HOLO_SPEED * dt, fd - HOLO_CLOSE) / (fd || 1);
          let nx = me.x + (q.x - me.x) * k;
          let nz = me.z + (q.z - me.z) * k;
          // Inside the ring's line, as the real ring's floor keeps them.
          const ox = nx - school.ring.x; const oz = nz - school.ring.z;
          const od = Math.hypot(ox, oz);
          if (od > RING_R - 0.8) { nx = school.ring.x + (ox / od) * (RING_R - 0.8); nz = school.ring.z + (oz / od) * (RING_R - 0.8); }
          f.group.position.x = nx;
          f.group.position.z = nz;
        } else {
          f.state = 'wind';
          f.windT = HOLO_WIND;
        }
      }
      decide(d);
    },
    paint(d) {
      if (d.state !== 'live') return null;
      const v = leagueView(d);
      return [
        { text: `対 ${mode.name}`, size: 1.8, color: d.colour, glow: true, jp: true },
        { text: v.sides.map((s) => `${TEAM_NAMES[s.side]} ${Math.round(s.health * 100)}%`).join('  ·  '), size: 1.5 },
        { text: `${Math.max(0, PRACTICE_T - d.t).toFixed(1)}s${d.ko ? '  · you are OUT' : ''}`, size: 1.6, color: d.ko ? 0xff8a8a : HOLO.cyan },
      ];
    },
    doneText: (d) => d.wonHow ?? 'WON!',
  };
}

/**
 * Is the round over, and who won it? The ring's two endings, in the ring's
 * order: one side left standing, or the clock — and the clock asks
 * `decideOnTime`, nothing else.
 */
function decide(d) {
  if (d.state !== 'live') return;
  const L = d.league;
  const up = L.sideIds.filter((s) => L.members(s).some((m) => !m.ko));
  const name = (s) => TEAM_NAMES[s];
  if (up.length <= 1) {
    if (up[0] === L.mySide) {
      d.wonHow = 'KNOCKOUT — the other side is down!';
      d.win();
    } else d.fail(up.length ? `${name(up[0])} knocked your side out` : 'Everybody is down — a draw');
    return;
  }
  if (d.t < PRACTICE_T) return;
  const v = leagueView(d);
  const health = v.sides.map((s) => s.health);
  const { leaders, onDamage } = decideOnTime(health, (k) => v.sides[k].hits);
  const mine = v.sides.findIndex((s) => s.hers);
  const pct = (k) => Math.round(v.sides[k].health * 100);
  if (leaders.length !== 1) {
    d.fail('Time! Level on health AND hits — a DRAW');
  } else if (leaders[0] === mine) {
    const next = Math.max(...v.sides.map((_, k) => (k === mine ? -1 : pct(k))));
    d.wonHow = onDamage ? 'On time: level on health, more hits landed' : `On time: ${pct(mine)}% left beats ${next}%`;
    d.win();
  } else {
    const l = leaders[0];
    d.fail(onDamage
      ? `Time! Level on health — ${name(v.sides[l].side)} landed more hits`
      : `Time! ${name(v.sides[l].side)} kept ${pct(l)}% to your ${pct(mine)}% — the most LEFT wins`);
  }
}
