import * as THREE from 'three';
import { SIM, HOLO } from '../../world/simworld.js';
import { Kiosk, idleIn, isleSpot, stars3 } from './kiosk.js';
import { Target, toWorld, holoSolid, holoMat } from './targets.js';

/* ---------------------------------------------------------------------------
   KUDAMONO STORM — 果物, fruit. Holo-fruit is lobbed at her from launchers
   round the island's rim; cut it out of the air before it lands. The purple
   ones are VIRUSES: leave them to fall.

   THE ARC IS AIMED, NOT RANDOM. Every throw is solved for where it lands — a
   point within LAND_R of where she is standing when it leaves the barrel —
   so a fruit that she could never have reached is impossible, and standing
   still is never quite enough, because LAND_R is bigger than her blade.
   `world-check` throws a thousand and checks each lands where it was aimed and
   spends at least CUT_WINDOW seconds low enough for a standing slash.

   GRAVITY IS LIGHTER IN HERE (`G`) on purpose: a real lob lasts a second, and
   a nine-year-old needs to see it coming, pick it, and walk to it. And the
   arc is FLAT: a standing slash reaches 4.0 above her feet (the gate's
   strikeHeight plus a fruit's hitUp), and the first cut — G 6, 2.3-2.8s —
   peaked near 5.8 and spent only 0.36s of its fall inside that, so CUT_WINDOW
   was a claim the code did not keep. G 4 over 2.1-2.6s peaks at 4.5 at most
   and spends 0.9s or more in reach (2.2-2.7 measured 0.80, on the line);
   world-check measures it.

   A VIRUS CUT COSTS, AND SAYS SO: three points off, a hit on her SIM bar, and
   a hint the first time — a cut that silently did nothing would read as the
   game being broken (non-negotiable 6).
--------------------------------------------------------------------------- */

export const G = 4;
export const LAND_R = 2.6;
export const CUT_WINDOW = 0.8;
export const STORM_TIME = 45;
export const STORM_BANDS = [10, 20, 28];
/** The rim launchers, as angles round the island, and their distance out. */
const LAUNCH_R = 15;
const LAUNCHERS = 6;

export const FRUIT = {
  momo: { kanji: '桃', colour: 0xff8fb0, r: 0.45, pts: 1, hits: 1 },
  mikan: { kanji: '蜜柑', colour: 0xffa030, r: 0.4, pts: 1, hits: 1 },
  nashi: { kanji: '梨', colour: 0xd8ff70, r: 0.42, pts: 1, hits: 1 },
  suika: { kanji: '西瓜', colour: 0x3cff6a, r: 0.7, pts: 2, hits: 2 },
  virus: { kanji: '毒', colour: 0xa040ff, r: 0.5, pts: -3, hits: 1, virus: true },
};

/**
 * Solve a lob from `from` to land on `to` (layer points) after `T` seconds
 * under G. Pure — the drill throws with it and the check reads it back.
 */
export function lob(from, to, T) {
  return {
    x: (to.x - from.x) / T,
    z: (to.z - from.z) / T,
    y: (to.y - from.y + 0.5 * G * T * T) / T,
  };
}

/** A thrown fruit: a Target whose foot moves. */
export class Fruit extends Target {
  constructor(o) {
    const kind = FRUIT[o.kind] ?? FRUIT.momo;
    super({ centre: 0, pad: kind.r + 0.35, hitUp: 0.6, hitDown: 1.2, hits: kind.hits, colour: kind.colour, ...o });
    this.kind = kind;
    this.vel = new THREE.Vector3(o.vel.x, o.vel.y, o.vel.z);
    this.floorY = o.floorY;
    this.landed = false;
    const geo = kind.virus ? new THREE.IcosahedronGeometry(kind.r, 0) : new THREE.SphereGeometry(kind.r, 12, 9);
    const solid = holoSolid(geo, kind.colour, 0.4);
    this.body.add(solid);
    this.body.userData.mats = solid.userData.mats;
    if (kind.virus) {
      for (let i = 0; i < 8; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 5), holoMat(kind.colour, 0.9));
        const a = (i / 8) * Math.PI * 2;
        spike.position.set(Math.cos(a) * kind.r, Math.sin(a * 2) * 0.2, Math.sin(a) * kind.r);
        spike.lookAt(spike.position.clone().multiplyScalar(2));
        spike.rotateX(Math.PI / 2);
        this.body.add(spike);
      }
    } else {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 4), holoMat(0x6dffb0, 0.9));
      leaf.position.y = kind.r + 0.1;
      this.body.add(leaf);
    }
    /* WHERE IT WILL LAND, on the floor, tightening as it falls — "see it
       coming, pick it, walk to it" needs the third thing marked, because a
       fruit high overhead gives no sense of where it is going to come down.
       It is drawn at `aim`, which is the point the lob was solved for. */
    if (o.aim) {
      this.mark = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 28).rotateX(-Math.PI / 2), holoMat(kind.colour, 0.7));
      this.mark.position.set(o.aim.x, o.floorY + 0.07, o.aim.z);
      this.flightT = o.T ?? 2.5;
      this.age = 0;
      o.parent?.add(this.mark);
    }
  }

  dispose() {
    super.dispose();
    this.mark?.removeFromParent();
  }

  update(dt) {
    super.update(dt);
    if (!this.live) { if (this.mark) this.mark.visible = false; return; }
    if (this.mark) {
      this.age += dt;
      this.mark.scale.setScalar(1.6 - Math.min(1, this.age / this.flightT));
    }
    this.vel.y -= G * dt;
    this.local.addScaledVector(this.vel, dt);
    this.group.position.copy(this.local);
    this.body.rotation.y += dt * 3;
    this.position.copy(toWorld(this.local.x, this.local.y, this.local.z));
    if (this.vel.y < 0 && this.local.y <= this.floorY + this.kind.r) {
      // Landed: gone, with a little splash, and no penalty — a miss is a miss.
      this.landed = true;
      this.live = false;
      this.group.visible = false;
      this.o.shards?.burst(this.local.x, this.floorY + 0.1, this.local.z, this.kind.colour, 10, 1, 3);
    }
  }
}

export class KudamonoStorm {
  constructor(dream, isle) {
    this.dream = dream;
    this.isle = isle;
    // The launchers: a ring of barrels round the rim, always there.
    this.launchers = [];
    for (let i = 0; i < LAUNCHERS; i++) {
      const a = (i / LAUNCHERS) * Math.PI * 2 + Math.PI / LAUNCHERS;
      const x = isle.x + Math.cos(a) * LAUNCH_R;
      const z = isle.z + Math.sin(a) * LAUNCH_R;
      const barrel = holoSolid(new THREE.CylinderGeometry(0.7, 0.9, 1.6, 10).translate(0, 0.8, 0), HOLO.gold, 0.3);
      barrel.position.set(x, isle.y, z);
      dream.sim.root.add(barrel);
      dream.sim.solids.push({ x, z, r: 1.0 });
      this.launchers.push({ x, z, y: isle.y + 1.7 });
    }
    const q = isleSpot(isle, -18, 0);
    this.kiosk = new Kiosk(dream, {
      x: q.x, z: q.z, y: isle.y, colour: HOLO.magenta, kanji: '果物', title: 'KUDAMONO STORM',
      card: (p) => {
        const name = p.style?.name ?? p.name;
        const best = dream.progress.best(name, 'storm');
        return [
          { text: '果物 KUDAMONO STORM', size: 1.9, color: HOLO.magenta, glow: true, jp: true },
          { text: `Cut the fruit before it lands — ${STORM_TIME} seconds`, size: 1.15 },
          { text: 'Purple ones are VIRUSES — let them fall!', size: 1.15, color: 0xd59bff },
          { text: `best ${best ?? '—'}   ${stars3(dream.progress.stars(name, 'storm'))}`, size: 1.2, color: HOLO.gold },
        ];
      },
      prompt: (p, key) => `[${key}]  KUDAMONO STORM`,
      interact: (p) => dream.startDrill(p, STORM(this), { x: isle.x, y: isle.y, z: isle.z, r: isle.r, fwd: isle.fwd }),
    });
    this.stations = [this.kiosk.station];
    dream.sim.tickers.push((dt) => this.update(dt));
  }

  /** A throw at her: from the launcher that has the clearest lob. */
  throwAt(d, kind) {
    const p = d.p;
    const px = p.position.x - SIM.dx;
    const pz = p.position.z - SIM.dz;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * LAND_R;
    let to = { x: px + Math.cos(a) * r, y: this.isle.y + FRUIT[kind].r, z: pz + Math.sin(a) * r };
    // Never onto the void: pulled in toward the middle if it would miss the deck.
    const off = Math.hypot(to.x - this.isle.x, to.z - this.isle.z);
    if (off > this.isle.r - 2) {
      const k = (this.isle.r - 2) / off;
      to = { x: this.isle.x + (to.x - this.isle.x) * k, y: to.y, z: this.isle.z + (to.z - this.isle.z) * k };
    }
    const from = this.launchers[Math.floor(Math.random() * this.launchers.length)];
    const T = 2.1 + Math.random() * 0.5;
    const vel = lob(from, to, T);
    return d.target(Fruit, { x: from.x, y: from.y, z: from.z, kind, vel, floorY: this.isle.y, colour: FRUIT[kind].colour,
      aim: to, T,
      onBreak: (t) => d.spec.onCut(d, t) });
  }

  update(dt) {
    this.kiosk.update(dt, idleIn(this.dream));
  }

  faceCamera(camera) { this.kiosk.faceCamera(camera); }
}

function STORM(storm) {
  return {
    id: 'storm', title: 'KUDAMONO STORM', kanji: '果物',
    goalText: 'Cut the fruit — leave the purple viruses',
    score: (d) => d.points, lowerIsBetter: false, bands: STORM_BANDS,
    setup(d) {
      d.points = 0;
      d.cut = 0;
      d.nextThrow = 0.4;
      d.toldVirus = false;
    },
    onCut(d, t) {
      const k = t.kind;
      if (k.virus) {
        d.points = Math.max(0, d.points + k.pts);
        d.dream.simHit(d.p, { dmg: 15, src: 'virus', drill: d });
        d.dream.game.sfx?.('deny');
        if (!d.toldVirus) {
          d.toldVirus = true;
          d.dream.hint(d.p, 'that was a VIRUS — minus 3! Let the purple ones fall');
        }
        return;
      }
      d.points += k.pts;
      d.cut++;
      d.dream.game.sfx?.(k.pts > 1 ? 'perfect' : 'great');
    },
    tick(d, dt) {
      // The storm builds: a throw every 1.4s at the start, every 0.55s at the end.
      d.nextThrow -= dt;
      if (d.nextThrow <= 0 && d.t < STORM_TIME - 2.4) {
        const k = d.t / STORM_TIME;
        d.nextThrow = 1.4 - 0.85 * k;
        const n = Math.random() < 0.15 + 0.25 * k ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const roll = Math.random();
          const kind = roll < 0.18 ? 'virus' : roll < 0.3 ? 'suika' : ['momo', 'mikan', 'nashi'][Math.floor(Math.random() * 3)];
          storm.throwAt(d, kind);
        }
      }
      // Fruit that has landed or been cut is gone for good.
      for (const t of d.targets.filter((x) => !x.live)) {
        d.dream.gate.remove(t);
        t.dispose();
        d.targets.splice(d.targets.indexOf(t), 1);
      }
      if (d.t >= STORM_TIME) {
        if (d.points > 0) d.win();
        else d.fail('No fruit cut — swing as they come down!');
      }
    },
    paint(d) {
      if (d.state !== 'live') return null;
      const left = Math.max(0, STORM_TIME - d.t);
      return [
        { text: '果物 KUDAMONO STORM', size: 1.9, color: d.colour, glow: true, jp: true },
        { text: `${d.points} points`, size: 2.0, color: HOLO.gold },
        { text: `${left.toFixed(1)}s`, size: 1.6, color: left < 5 ? 0xff6a6a : HOLO.cyan },
      ];
    },
  };
}
