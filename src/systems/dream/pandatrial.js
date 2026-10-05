import * as THREE from 'three';
import { SIM, HOLO } from '../../world/simworld.js';
import { Panda, PANDA, CLAW } from '../../entities/panda.js';
import { HoloPanel } from './holo.js';
import { Cane } from './targets.js';
import { HoloFighter, HOLO_CLOSE, HOLO_REACH, HOLO_WIND, HOLO_REST, HOLO_SPEED, SLASH_T } from './school.js';

/* ---------------------------------------------------------------------------
   熊 THE PANDAPAW TRIAL — the whole life of a panda in the ring, in one go.

   Richard: "first you cut down some bamboo, no more than 10, then you get baby
   panda, then after a moment, you are immersed in combat with multiple
   opponents, and start with below 35% health ... the panda heals them back up
   ... Then, have more bamboo spawn ... once cut, a bigger panda is spawned in
   place of the baby panda ... Then have the player fight against twice as
   many opponents ... have 3 or 4 enemies spawn, hit the panda until it turns
   into a baby panda ... Player can keep baby panda while part of Pandapaw in
   the simulation, but once they are about to leave the island and enter the
   bridge, the panda poofs away and no more panda."

   The old trial was ten canes against a clock, and it taught the one thing
   about Pandapaw a kitten already knew. What she did NOT know is what the
   animal is worth once it is hers — that a cub licks you better, that a grown
   one fights, and that a grown one knocked down is a cub again until the
   shrine. Those three facts are this trial's stages:

     cut1   six canes                      (the oath's job: bamboo)
     cub    a cub poofs in beside her      (a breath to look at it)
     fight1 three holo-kittens, her SIM bar at START
     heal1  ROOTED: the cub licks her up to its line, and the card says why
     read1  control back, the card stays up long enough to read
     cut2   six more canes
     meet   the cub grows, in a poof       (a moment to look at it)
     fight2 six holo-kittens, at START again; the panda claws beside her
     lesson ROOTED: four more come for the PANDA, and their FIRST blow
            knocks it down, and they poof; the card says what that means out
            there, and the cub licks her back up. Then the trial is won.

   RICHARD'S PLAYTHROUGH (the second pass):
     · "After panda in the simulation turns into a big panda, I am unable to
       ride it. I should be able to ride it while doing the Pandapaw trial."
       From `meet` through `fight2` the grown panda is offered as `p.simRide`,
       and MOUNT climbs on (`Player._simRideNear`). It is then her ordinary
       `pandaMount`; `carryOff` is the one thing the real panda needed to
       learn, because it lives in the layer and she does not.
     · "it is taking too long for the panda to turn into a baby panda after
       the player loses input control, so make it that, the first time big
       panda gets hit, it turns into a baby panda and heals the player." The
       lesson's four had to take its whole bar off, five blows; now the first
       blow is the knock-down (`knockDown`), and `lesson2` is the lick.
     · "The enemies should also draw a slashing attack animation when
       attacking" — `HoloFighter.slash` (school.js), at every blow, hit or
       miss, and a sliver of it while they wind up.

   THE PANDA IS THE REAL ONE. `entities/panda.js` `Panda`, with its real lick
   (`PANDA.lickBelow` / `lickRate` / `lickWarm`), its real `hurt`, `collapse`
   and claw. A copy drawn for the simulator would teach whatever the copy did;
   this one cannot say anything the ring's panda does not do. It runs in the
   LAYER (`layerWorld`, `PandaOwner`), and its owner is her SIM bar — never her
   health, which is the ring's (non-negotiable 3, and `simHit` is the only way
   a hologram reaches her).

   "BELOW 35%, LIKE 30%" IS THE REAL LINE. Richard's 35% is `PANDA.lickBelow`
   as tuned (src/tuning.json — the shipped default is 30%), so `startFrac`
   starts each fight at his 30% and, if the line is ever tuned under it, a
   notch below the line instead: a fight started AT the line that she won
   untouched would leave the cub nothing to show her.

   WHAT IS NOT TRUE TO THE RING, AND SAYS SO:
     · `healSecs`: rooted, she is healed in about that long however far down
       she is. The ring's lick is `lickRate` a second (1% as tuned), so 30%
       to 35% is the real speed — but a kitten knocked to 6% in the fight
       would stand rooted for half a minute. Only the stretch beyond the real
       pace is sped up, and only THEN does the card say "faster in here": a
       lesson that hid the speed-up would be a kitten waiting in the ring
       for a heal that comes four times slower than she was shown.
     · The lesson's knock-down is ONE blow. In the ring it is a whole bar
       ("it is taking too long", above); the card says what it means out
       there, not how many blows it takes.
--------------------------------------------------------------------------- */

export const PANDA_TRIAL = {
  /** Canes in each grove — "no more than 10". */
  canes: [6, 6],
  /** Her SIM bar at the top of each fight — Richard's "like 30%". See
   *  `startFrac`, which keeps it under the cub's line however that is tuned. */
  start: 0.30,
  /** Holo-kittens in each fight — "twice as many" the second time. */
  foes: [3, 6],
  /** ...and in the lesson, the ones who come for the panda ("3 or 4"). */
  lessonFoes: 4,
  /** Blows a holo-kitten takes. Under four, so no bar (Richard's rule). */
  foeHits: 2,
  /** What a blow costs HER, per 100 of SIM bar — five blows from START. */
  foeDmg: 6,
  /** What a blow costs the grown panda: `PANDA.hpFrac` of 100 is 30, so five. */
  pandaDmg: 6,
  /** Seconds between the grown panda's claws while a fight is on. */
  clawEvery: 1.4,
  /** "after a moment": the cub's arrival, and the grown panda's. */
  cubT: 2.5,
  meetT: 4,
  /** "wait a few seconds for player to read the text". */
  readT: 4.5,
  /** The lesson's card is longer, and stays at least this long. */
  lessonT: 8,
  /** A rooted heal takes about this long, however far down she is — see the
   *  header. Never slower than the real lick. */
  healSecs: 5,
  /** A cub that has not reached her by now is helped there. */
  healCap: 12,
};

/** The two cards, in Richard's words as near as a card allows. */
export const HEAL_TEXT = 'After the battle, your baby panda licked you back up as far as it can. That is the power of a baby panda in the arena!';
export const LESSON_TEXT = 'When an adult panda loses all her health in the arena, she turns back into a baby panda — and follows you and licks you back to health. To turn her back into an adult panda, visit Pandapaw again.';

/** Where each fight starts her: Richard's 30%, under the cub's line. */
export function startFrac() {
  return Math.min(PANDA_TRIAL.start, PANDA.lickBelow - 0.05);
}

/** How many times the real lick a rooted heal runs at, to close `gap` (a
 *  fraction of her bar) in `healSecs`. 1 when the real pace is fast enough. */
export function healK(gap) {
  return Math.max(1, gap / (PANDA.lickRate * PANDA_TRIAL.healSecs));
}

const ROOTED = new Set(['heal1', 'lesson', 'lesson2']);
const FIGHTS = new Set(['fight1', 'fight2', 'lesson']);

/** The panda's world, in the layer: the sim's own floor and solids, shifted. */
function layerWorld(sim) {
  return {
    heightAt: (x, z, y) => sim.heightAt(x + SIM.dx, z + SIM.dz, y),
    resolveSolids: (x, z, r) => {
      const q = sim.resolveSolids(x + SIM.dx, z + SIM.dz, r);
      return { x: q.x - SIM.dx, z: q.z - SIM.dz };
    },
    // `_catchUp` lands it ON her if nothing better is offered; the layer has
    // no crowd to find a gap in.
    findOpenSpot: (x, z) => ({ x: x + 1.5, z }),
  };
}

/**
 * Her, as the panda sees her: in the layer, with her SIM bar for a health
 * bar. `sync` before the panda's update, `commit` after — the lick is the
 * one thing that writes, and it writes to `simHp`, never to `hp`.
 */
export class PandaOwner {
  constructor(dream, p) {
    this.dream = dream;
    this.p = p;
    this.position = new THREE.Vector3();
    this.style = p.style;
    this.ko = false;
    this.angel = false;
    this.sync();
  }

  sync() {
    const { p, dream } = this;
    const s = dream.st[p.index];
    this.position.set(p.position.x - SIM.dx, p.position.y, p.position.z - SIM.dz);
    this.maxHp = dream.simMax(p);
    this.hp = s?.simHp ?? this.maxHp;
    this.mount = p.mount ?? null;
    this.carried = p.carried ?? null;
    this.camYaw = p.camYaw ?? 0;
    this.clan = p.clan;
    this._was = this.hp;
  }

  /** Only a heal is written, as a CHANGE — so a blow taken this frame is
   *  never undone — and never past `cap` unless she was already over it. */
  commit(extra = 0, cap = Infinity) {
    const s = this.dream.st[this.p.index];
    if (!s) return;
    const healed = this.hp - this._was + extra;
    if (healed > 0) s.simHp = Math.min(s.simHp + healed, Math.max(cap, s.simHp));
  }
}

/** A real Panda, parented in the layer, beside her. */
function spawnPanda(dream, p, owner) {
  const art = dream.game.pandaArt ?? { cub: { texture: new THREE.Texture() }, adult: { texture: new THREE.Texture() } };
  const panda = new Panda(art, { owner, tier: 0 });
  const at = owner.position;
  const g = dream.sim.heightAt(at.x + 1.8 + SIM.dx, at.z + SIM.dz);
  panda.position.set(at.x + 1.8, g?.y ?? at.y, at.z);
  panda.group.position.copy(panda.position);
  // In the layer; she is in the world (`Panda.carry`).
  panda.carryOff = { x: SIM.dx, z: SIM.dz };
  dream.sim.root.add(panda.group);
  return panda;
}

function poof(dream, panda) {
  const q = panda.position;
  dream.shards?.burst(q.x, q.y + 1, q.z, 0xffffff, 40, 4, 6);
  dream.shards?.burst(q.x, q.y + 1, q.z, 0x7dffb0, 24, 3, 5);
  dream.game.sfx?.('pandapoof');
}

/** One frame of the panda: her, it, the sounds. `heal` is the demo multiple. */
function stepPanda(dream, panda, owner, dt, heal = 1) {
  owner.sync();
  panda.update(dt, layerWorld(dream.sim), owner);
  /* THE DEMO LICK IS THE REAL LICK, MULTIPLIED — it only adds while the real
     one is healing, and never past the real one's line. */
  const line = owner.maxHp * PANDA.lickBelow;
  const extra = panda.licking && heal > 1 ? owner.maxHp * PANDA.lickRate * dt * (heal - 1) : 0;
  owner.commit(extra, line);
  if (panda.lickSfx) { panda.lickSfx = false; dream.game.sfx?.('lick'); }
  if (panda.danceSfx) { panda.danceSfx = false; dream.game.sfx?.('lickdone'); }
}

/* ------------------------------- the stages ------------------------------- */

function grove(d, n) {
  d.grove = [];
  const her = { x: d.p.position.x - SIM.dx, z: d.p.position.z - SIM.dz };
  // Round the floor's middle, but never under her feet or out by the shrines.
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (d.groves ?? 0) * 0.5;
    const rr = 4.5 + (i % 2) * 3;
    let q = d.spot(Math.cos(a) * rr, Math.sin(a) * rr);
    if (Math.hypot(q.x - her.x, q.z - her.z) < 2.2) q = d.spot(Math.cos(a) * (rr + 3), Math.sin(a) * (rr + 3));
    d.grove.push(d.target(Cane, {
      x: q.x, y: q.y, z: q.z,
      onRefuse: () => d.dream.hint(d.p, 'Bamboo only answers to the katana'),
      onBreak: () => { d.cut += 1; d.dream.game.sfx?.('score'); },
    }));
  }
  d.groves = (d.groves ?? 0) + 1;
}

function brawl(d, n, { onlyPanda = false } = {}) {
  const T = PANDA_TRIAL;
  const her = onlyPanda ? d.panda.position : { x: d.p.position.x - SIM.dx, z: d.p.position.z - SIM.dz };
  const spec = d.dream.kittenSpec();
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.4;
    const R = onlyPanda ? 5.5 : 7;
    let x = her.x + Math.cos(a) * R;
    let z = her.z + Math.sin(a) * R;
    // Inside the floor, where the shrines' pads are not.
    const ox = x - d.at.x; const oz = z - d.at.z; const od = Math.hypot(ox, oz);
    const lim = d.at.r - 7;
    if (od > lim) { x = d.at.x + (ox / od) * lim; z = d.at.z + (oz / od) * lim; }
    const f = d.target(HoloFighter, {
      x, y: d.at.y, z, spec, side: 1, hits: T.foeHits,
      name: 'a holo-kitten',
      // The lesson's four are not hers to fight: she is rooted and watching.
      accept: () => !onlyPanda,
      onRefuse: () => d.dream.hint(d.p, 'Watch — this is what happens to a panda in the ring'),
    });
    f.state = 'rest';
    f.restT = 0.5 + i * 0.3;
    f.onlyPanda = onlyPanda;
    out.push(f);
  }
  return out;
}

/** The holo-kittens: the league's rest / wind / walk, at her and her panda. */
function fightTick(d, dt) {
  const T = PANDA_TRIAL;
  const p = d.p;
  const me = { x: p.position.x - SIM.dx, z: p.position.z - SIM.dz };
  const pa = d.panda;
  // The ANIMAL's bar (entities/panda.js `hurt` decides nothing about who may
  // hit it). world-check's no-`hurt()` guard allows this one name and no other.
  const panda = pa;
  const k100 = d.dream.simMax(p) / 100;
  for (const f of d.foes ?? []) {
    if (!f.live) continue;
    const at = { x: f.group.position.x, z: f.group.position.z };
    // Nearest of her and a panda still standing; the lesson's only see the panda.
    let tgt = f.onlyPanda ? null : { who: 'her', x: me.x, z: me.z, reach: HOLO_REACH, close: HOLO_CLOSE };
    if (pa?.fighter) {
      const pq = { who: 'panda', x: pa.position.x, z: pa.position.z, reach: HOLO_REACH + PANDA.body * 0.5, close: HOLO_CLOSE + PANDA.body * 0.5 };
      if (!tgt || Math.hypot(pq.x - at.x, pq.z - at.z) < Math.hypot(tgt.x - at.x, tgt.z - at.z)) tgt = pq;
    }
    if (!tgt) continue;
    const fd = Math.hypot(tgt.x - at.x, tgt.z - at.z);
    if (f.state === 'rest') {
      f.restT -= dt;
      if (f.restT <= 0) f.state = 'walk';
    } else if (f.state === 'wind') {
      f.flash = Math.max(f.flash, 0.5);
      f.windYaw = Math.atan2(tgt.x - at.x, tgt.z - at.z);
      f.windT -= dt;
      if (f.windT <= 0) {
        f.state = 'rest';
        f.restT = HOLO_REST;
        f.slash?.(f.windYaw);
        if (fd <= tgt.reach + 0.4) {
          if (tgt.who === 'her') {
            const kk = 1 / (fd || 1);
            d.dream.simHit(p, { dmg: T.foeDmg * k100, push: { x: (tgt.x - at.x) * kk, z: (tgt.z - at.z) * kk }, src: 'blade', drill: d, from: at, foe: f });
          } else if (panda.hurt(T.pandaDmg * k100, at)) {
            d.dream.game.sfx?.('hit');
            // The lesson's first blow is the knock-down (see the header).
            if (pa.hp <= 0 || d.stage === 'lesson') knockDown(d);
          }
        }
      }
    } else if (fd > tgt.close) {
      const step = Math.min(HOLO_SPEED * dt, fd - tgt.close) / (fd || 1);
      f.group.position.x += (tgt.x - at.x) * step;
      f.group.position.z += (tgt.z - at.z) * step;
      f.local.x = f.group.position.x;
      f.local.z = f.group.position.z;
    } else {
      f.state = 'wind';
      f.windT = HOLO_WIND;
    }
  }
  // The grown panda fights beside her — the real claw, on the nearest in reach.
  if (pa?.fighter && !ROOTED.has(d.stage)) {
    d.clawT = (d.clawT ?? T.clawEvery) - dt;
    if (d.clawT <= 0) {
      let near = null; let nd = CLAW.range * 0.6;
      for (const f of d.foes ?? []) {
        if (!f.live) continue;
        const dd = Math.hypot(f.group.position.x - pa.position.x, f.group.position.z - pa.position.z);
        if (dd < nd) { nd = dd; near = f; }
      }
      if (near) {
        d.clawT = T.clawEvery;
        pa.swipe(Math.atan2(near.group.position.x - pa.position.x, near.group.position.z - pa.position.z));
        near.hp -= 1; near.flash = 1; near.wobV += 7;
        d.dream.game.sfx?.('hit');
        if (near.hp <= 0) near.breakNow();
      }
    }
  }
}

/** The grown panda is knocked down: a cub again, as in the ring. */
function knockDown(d) {
  const pa = d.panda;
  if (!pa?.collapse()) return;
  poof(d.dream, pa);
  if (d.stage === 'lesson') {
    /* Its job done, the four poof away too — once the swing that did it has
       been SEEN: poofed on the same frame, the blow that knocked the panda
       down was the one slash nobody saw, because a broken target is hidden. */
    d.poofT = SLASH_T + 0.1;
  } else {
    d.dream.game.toast?.(`${d.p.name} — your panda was knocked down! It is a baby panda again`, d.p.index);
  }
}

function go(d, stage, extra = {}) {
  d.stage = stage;
  d.stageT = 0;
  d.healK = null;
  Object.assign(d, extra);
}

/** The stages she may ride the grown panda in: from when it grows to the
 *  end of the fight beside it. Not the lesson, which is watched. */
const RIDES = new Set(['meet', 'fight2']);

/** Offer the grown panda to ride, or take the offer back (and her off it). */
function offerRide(d) {
  const p = d.p;
  const pa = d.panda;
  const on = !!pa?.rideable && RIDES.has(d.stage) && d.state === 'live';
  if (on) {
    if (p.simRide?.panda !== pa) p.simRide = { panda: pa, off: { x: SIM.dx, z: SIM.dz } };
    return;
  }
  if (p.simRide?.panda === pa) p.simRide = null;
}

/** Off its back, quietly — the trial is ending, or it is about to be a cub. */
function dismount(d) {
  const pa = d.panda;
  if (pa && pa.rider) { pa.rider.pandaMount = null; pa.rider = null; }
  if (d.p.simRide?.panda === pa) d.p.simRide = null;
}

function startFight(d, n) {
  const s = d.dream.st[d.p.index];
  if (s) s.simHp = d.dream.simMax(d.p) * startFrac();
  d.foes = brawl(d, n);
  d.dream.game.sfx?.('count');
  d.dream.hint(d.p, `FIGHT! You start hurt — ${Math.round(startFrac() * 100)}%. Your panda is with you`);
}

function say(d, text) {
  d.note = text;
  d.dream.game.toast?.(`${d.p.name} — ${text}`, d.p.index);
}

export function PANDA_SPEC() {
  const T = PANDA_TRIAL;
  return {
    title: 'PANDAPAW TRIAL', kanji: '熊', goal: 1, showCount: false,
    // Scored on the ACTIVE seconds only — the rooted stages and the pauses
    // are the same length for everybody. First numbers, not yet played.
    score: (d) => d.active, lowerIsBetter: true, bands: [80, 50, 36],
    goalText: 'Cut bamboo, raise a panda — see what it does in the ring',
    doneText: () => 'Out there, Pandapaw gives you a real one',
    setup(d) {
      d.dream.dropSimPanda?.(d.p);
      d.cut = 0;
      d.active = 0;
      d.foes = [];
      go(d, 'cut1');
      grove(d, T.canes[0]);
      d.owner = new PandaOwner(d.dream, d.p);
      const card = new HoloPanel({ w: 7.6, h: 3.2, px: 100, edge: d.colour });
      card.position.y = (d.p.height ?? 2.6) + 2.9;
      card.visible = false;
      d.p.group.add(card);
      d.card = card;
    },
    roots: (d) => ROOTED.has(d.stage),
    caught(d) {
      // The simulator caught her: the fight goes on, from START again.
      d.recatch = true;
      d.dream.hint(d.p, `Caught! Back to ${Math.round(startFrac() * 100)}% — keep fighting`);
      return true;
    },
    tick(d, dt) {
      d.stageT += dt;
      const s = d.dream.st[d.p.index];
      if (d.recatch && s) { d.recatch = false; s.simHp = d.dream.simMax(d.p) * startFrac(); }
      if (!ROOTED.has(d.stage) && !/^read|^cub$|^meet$/.test(d.stage)) d.active += dt;
      const pa = d.panda;
      const healing = d.stage === 'heal1' || d.stage === 'lesson2';
      if (healing && d.healK == null && s) {
        d.healK = healK(PANDA.lickBelow - s.simHp / d.dream.simMax(d.p));
        d.fast ||= d.healK > 1.05;
      }
      if (pa) stepPanda(d.dream, pa, d.owner, dt, healing ? (d.healK ?? 1) : 1);
      if (FIGHTS.has(d.stage)) fightTick(d, dt);
      if (d.poofT != null && (d.poofT -= dt) <= 0) {
        d.poofT = null;
        for (const f of d.foes) if (f.live) f.breakNow();
      }
      const line = d.dream.simMax(d.p) * PANDA.lickBelow;
      const healed = () => !s || s.simHp >= line - 0.01 || d.stageT > T.healCap;
      switch (d.stage) {
        case 'cut1':
          if (d.grove.every((c) => !c.live)) {
            d.panda = spawnPanda(d.dream, d.p, d.owner);
            poof(d.dream, d.panda);
            say(d, 'A baby panda! It follows you everywhere');
            go(d, 'cub');
          }
          break;
        case 'cub':
          if (d.stageT >= T.cubT) { d.note = null; startFight(d, T.foes[0]); go(d, 'fight1'); }
          break;
        case 'fight1':
          if (d.foes.every((f) => !f.live)) { go(d, 'heal1'); d.dream.hint(d.p, 'You won! Stand still — your baby panda is coming'); }
          break;
        case 'heal1':
          if (healed()) {
            if (s && s.simHp < line) s.simHp = line;
            say(d, HEAL_TEXT);
            go(d, 'read1');
          }
          break;
        case 'read1':
          if (d.stageT >= T.readT) { d.note = null; grove(d, T.canes[1]); go(d, 'cut2'); d.dream.hint(d.p, 'More bamboo! Cut it with your cub beside you'); }
          break;
        case 'cut2':
          if (d.grove.every((c) => !c.live)) {
            pa.setTier(1);
            poof(d.dream, pa);
            say(d, `Your panda is GROWN! It fights beside you — press [${d.dream.key?.(d.p, 'mount') ?? 'MOUNT'}] to ride it`);
            go(d, 'meet');
          }
          break;
        case 'meet':
          if (d.stageT >= T.meetT) { d.note = null; startFight(d, T.foes[1]); go(d, 'fight2'); }
          break;
        case 'fight2':
          if (d.foes.every((f) => !f.live)) {
            if (pa.fighter) {
              d.foes = brawl(d, T.lessonFoes, { onlyPanda: true });
              d.dream.hint(d.p, 'Watch your panda…');
              go(d, 'lesson');
            } else {
              say(d, LESSON_TEXT);
              go(d, 'lesson2');
            }
          }
          break;
        case 'lesson':
          // Richard: "even if big panda has lost its health already" — so the
          // card is the same either way, and comes when the panda is a cub.
          if (!pa.fighter) { say(d, LESSON_TEXT); go(d, 'lesson2'); }
          break;
        case 'lesson2':
          if (d.stageT >= T.lessonT && healed()) {
            if (s && s.simHp < line) s.simHp = line;
            d.kept = true;
            d.progress();
          }
          break;
        default:
      }
      // After the stage has moved, so the offer is never a frame behind it.
      offerRide(d);
    },
    paint(d) {
      const note = d.state === 'live' ? d.note : null;
      if (d.card) {
        d.card.visible = !!note;
        if (note) {
          d.card.set([
            { text: '熊 PANDAPAW', size: 1.3, color: d.colour, glow: true },
            { text: note, size: 1.0, wrap: true },
            ...(d.fast && (d.stage === 'read1' || d.stage === 'lesson2') ? [{ text: 'It licks faster in here than in the ring', size: 0.75, color: HOLO.gold }] : []),
          ], d.colour);
        }
      }
      d.panel.visible = !note;
      if (d.state !== 'live') return null;
      const left = d.grove?.filter((c) => c.live).length ?? 0;
      const foes = (d.foes ?? []).filter((f) => f.live).length;
      const doing = {
        cut1: `Cut the bamboo — ${left} left`,
        cub: 'Meet your baby panda',
        fight1: `Fight! ${foes} holo-kittens left`,
        heal1: 'Your cub is licking you better…',
        read1: 'Your cub is licking you better…',
        cut2: `More bamboo — ${left} left`,
        meet: 'Your panda has grown up!',
        fight2: `Fight beside your panda! ${foes} left`,
        lesson: 'Watch what happens to your panda…',
        lesson2: 'Your cub is licking you better…',
      }[d.stage];
      return [
        { text: '熊 PANDAPAW TRIAL', size: 2.0, color: d.colour, glow: true },
        { text: doing ?? '', size: 1.5 },
        { text: `${d.t.toFixed(1)}s`, size: 1.6, color: HOLO.cyan },
      ];
    },
    face(d, camera) {
      d.panda?.faceCamera(camera);
      d.card?.faceCamera(camera);
    },
    dispose(d) {
      d.card?.removeFromParent();
      if (!d.panda) return;
      dismount(d);
      // Won: the cub is hers while she stays (`keepSimPanda`). Anything else: poof.
      if (d.kept && d.state === 'won') d.dream.keepSimPanda?.(d.p, d.panda, d.owner);
      else { poof(d.dream, d.panda); d.panda.group.removeFromParent(); }
      d.panda = null;
    },
  };
}

/* ------------------------- the cub she keeps after ------------------------ */

/**
 * Tick the cubs kept after a won trial, and poof the ones whose kitten is
 * done with them. "Player can keep baby panda while part of Pandapaw in the
 * simulation, but once they are about to leave the island and enter the
 * bridge, the panda poofs away and no more panda."
 *
 * "ABOUT TO ENTER THE BRIDGE" IS THE LOOK ACROSS. `peekAt.w` is 1 once its
 * trigger has decided she is walking into a bridge mouth (dream/peek.js
 * `PeekTrigger` — it was a distance dial, and is on/off since Richard's
 * second pass) — the moment the camera swings round to show her where she
 * is going, which is the moment a cub
 * left behind on the island reads as a choice the game made rather than a
 * pet that got lost. Off the island's rim (a fall, a ride) counts too.
 */
export const KEEP_PEEK = 0.9;

export function keptPandaGone(dream, p, k) {
  if (!p || !(dream.game.players ?? []).includes(p)) return 'gone';
  if (dream.realmOf(p) !== 'sim') return 'left';
  if (p.clan?.buff?.panda !== true) return 'oath';
  if (dream.drills?.[p.index]) return 'drill';
  if ((p.peekAt?.w ?? 0) >= KEEP_PEEK) return 'bridge';
  const I = k.isle;
  if (I && Math.hypot(p.position.x - SIM.dx - I.x, p.position.z - SIM.dz - I.z) > I.r + 0.5) return 'bridge';
  return null;
}

export function tickKeptPandas(dream, dt) {
  const list = dream.simPandas ?? [];
  for (let i = 0; i < list.length; i++) {
    const k = list[i];
    if (!k) continue;
    if (keptPandaGone(dream, k.p, k)) { dropKept(dream, i); continue; }
    stepPanda(dream, k.panda, k.owner, dt, 1);
  }
}

export function dropKept(dream, i) {
  const k = dream.simPandas?.[i];
  if (!k) return;
  poof(dream, k.panda);
  k.panda.group.removeFromParent();
  dream.simPandas[i] = null;
}
