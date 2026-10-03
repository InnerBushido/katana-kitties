import * as THREE from 'three';
import { SIM, HOLO } from '../../world/simworld.js';
import { Kiosk, idleIn, isleSpot, stars3 } from './kiosk.js';
import { Target, holoSolid, holoMat } from './targets.js';

/* ---------------------------------------------------------------------------
   HOLO-SENTRIES — 番兵. The first thing in the simulator that shoots back.

   Four sentries stand round a CORE. Each sentry fires a bolt at her every few
   seconds; the core sits under a shield until the last sentry is down, and
   then fires bursts of three. Bring the core down to clear the island.

   EVERY SHOT IS TOLD FIRST. A sentry's eye swells and goes white for TELL
   seconds before it fires, and the shot flies at where she WAS (targets.js,
   Bolt), so the lesson is the two answers the game already has: step aside,
   or raise the Ward. A shot with no tell is a hit she could not have stopped,
   and that is not training anybody.

   RICHARD'S RULE FOR BARS — "if weaker (3 hits or less to defeat) probably no
   health bar needed" — is a fact about the target (targets.js `Target`), so it
   holds here without being said: the sentries take three and wear none, the
   core takes eight and wears one.

   THE SHIELD REFUSES IN WORDS (non-negotiable 6): a blade on the shield rocks
   it and the hint says what it wants instead.

   Each seat gets her own quarter of the island, as on the range, so four
   sisters fight four rings of sentries, not one.
--------------------------------------------------------------------------- */

export const TELL = 0.7;
export const SENTRY_HITS = 3;
export const CORE_HITS = 8;
export const SENTRY_BANDS = [80, 50, 32];
/** Where, in her quarter: the core, and the four sentries round it (a, b). */
export const CORE_AT = [14, 0];
export const SENTRY_AT = [[9, -5], [9, 5], [17, -6], [17, 6]];

/** A turret: a pylon and an eye that turns to her and swells before it fires. */
export class Sentry extends Target {
  constructor(o) {
    super({ hits: SENTRY_HITS, centre: 1.4, pad: 0.6, colour: 0xff5a6a, name: 'the sentry', ...o });
    const pylon = holoSolid(new THREE.CylinderGeometry(0.35, 0.55, 2.2, 8).translate(0, 1.1, 0), this.colour, 0.3);
    this.body.add(pylon);
    this.body.userData.mats = pylon.userData.mats;
    this.eye = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), holoMat(0xff5a6a, 0.85));
    this.eye.position.y = 2.6;
    this.body.add(this.eye);
    this.period = o.period ?? 2.6;
    this.clock = o.phase ?? 0;
  }

  /** Seconds until it fires, and whether it is in its tell. */
  get charging() { return this.period - this.clock <= TELL; }

  /** Advance its clock; returns true on the frame it fires. */
  tickFire(dt) {
    if (!this.live) return false;
    this.clock += dt;
    const k = this.charging ? 1 - (this.period - this.clock) / TELL : 0;
    this.eye.scale.setScalar(1 + k * 0.8);
    this.eye.material.color.set(k > 0 ? 0xffffff : 0xff5a6a);
    if (this.clock >= this.period) { this.clock = 0; return true; }
    return false;
  }

  aimAt(p) {
    const x = p.position.x - SIM.dx - this.local.x;
    const z = p.position.z - SIM.dz - this.local.z;
    this.eye.rotation.y = Math.atan2(x, z);
  }
}

/** The core: eight hits, a bar, and a shield while any sentry stands. */
export class Core extends Sentry {
  constructor(o) {
    super({ hits: CORE_HITS, centre: 1.8, pad: 1.0, colour: 0xff3b8a, name: 'the core', barY: 4.6, period: 3.0, ...o });
    this.eye.scale.setScalar(1.6);
    this.eye.position.y = 3.2;
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(2.4, 18, 12),
      new THREE.MeshBasicMaterial({ color: HOLO.cyan, wireframe: true, transparent: true, opacity: 0.45, toneMapped: false, depthWrite: false }));
    this.shield.position.y = 1.8;
    this.group.add(this.shield);
  }

  tickFire(dt) {
    if (!this.live) return false;
    const fired = super.tickFire(dt);
    this.eye.scale.multiplyScalar(1.6);   // reset by super every call, so this never compounds
    return fired;
  }
}

export class HoloSentries {
  constructor(dream, isle) {
    this.dream = dream;
    this.isle = isle;
    // Beside the light-cycle pad, not on it (it lands at -(r - 5), 0).
    const q = isleSpot(isle, -(isle.r - 5), 5);
    this.kiosk = new Kiosk(dream, {
      x: q.x, z: q.z, y: isle.y, colour: 0xff5a6a, kanji: '番兵', title: 'HOLO-SENTRIES',
      card: (p) => {
        const name = p.style?.name ?? p.name;
        const best = dream.progress.best(name, 'sentries');
        return [
          { text: '番兵 HOLO-SENTRIES', size: 1.9, color: 0xff8a8a, glow: true, jp: true },
          { text: 'Four sentries guard a core. They shoot back!', size: 1.15 },
          { text: 'An eye that turns WHITE is about to fire: step aside, or Ward', size: 1.0, color: 0x9fefff },
          { text: `best ${best != null ? `${best.toFixed(1)}s` : '—'}   ${stars3(dream.progress.stars(name, 'sentries'))}`, size: 1.2, color: HOLO.gold },
        ];
      },
      prompt: (p, key) => `[${key}]  HOLO-SENTRIES`,
      interact: (p) => dream.startDrill(p, SENTRIES(), this.floor(p)),
    });
    this.stations = [this.kiosk.station];
    dream.sim.tickers.push((dt) => this.kiosk.update(dt, idleIn(this.dream)));
  }

  /** Her quarter: the island's middle, `fwd` turned a quarter per seat. */
  floor(p) {
    const i = this.isle;
    const k = ((p?.index ?? 0) % 4) * (Math.PI / 2);
    const c = Math.cos(k);
    const s = Math.sin(k);
    return { x: i.x, y: i.y, z: i.z, r: i.r, fwd: { x: i.fwd.x * c - i.fwd.z * s, z: i.fwd.x * s + i.fwd.z * c } };
  }

  faceCamera(camera) { this.kiosk.faceCamera(camera); }
}

function SENTRIES() {
  return {
    id: 'sentries', title: 'HOLO-SENTRIES', kanji: '番兵',
    goalText: 'Knock out the four sentries, then the core', goal: 5, countLabel: 'down ',
    bands: SENTRY_BANDS, time: 150,
    setup(d) {
      d.sentries = SENTRY_AT.map(([a, b], i) => {
        const q = d.spot(a, b);
        // Staggered, so they never all fire on one beat.
        return d.target(Sentry, { x: q.x, y: q.y, z: q.z, phase: -0.8 - i * 0.65, onBreak: () => d.progress() });
      });
      const c = d.spot(...CORE_AT);
      d.core = d.target(Core, {
        x: c.x, y: c.y, z: c.z, phase: -1.5,
        accept: () => d.sentries.every((s) => !s.live),
        onRefuse: () => d.dream.hint(d.p, `the core is shielded — knock out the sentries first (${d.sentries.filter((s) => s.live).length} left)`),
        onBreak: () => d.progress(),
      });
    },
    tick(d, dt) {
      const p = d.p;
      const exposed = d.sentries.every((s) => !s.live);
      d.core.shield.visible = !exposed;
      for (const s of [...d.sentries, d.core]) {
        if (!s.live) continue;
        s.aimAt(p);
        if (s === d.core && !exposed) { s.clock = Math.min(s.clock, 0); continue; }
        if (!s.tickFire(dt)) continue;
        d.dream.game.sfx?.('zap');
        const from = { x: s.local.x, y: s.local.y + s.eye.position.y, z: s.local.z };
        if (s === d.core) {
          // A burst of three, fanned: one at her, one either side.
          const fx = p.position.x - SIM.dx - from.x;
          const fz = p.position.z - SIM.dz - from.z;
          const n = Math.hypot(fx, fz) || 1;
          for (const side of [-1, 0, 1]) {
            const to = {
              x: p.position.x - SIM.dx + (-fz / n) * side * 1.6,
              y: p.position.y + (p.height ?? 2.6) * 0.5,
              z: p.position.z - SIM.dz + (fx / n) * side * 1.6,
            };
            d.boltTo(from, to, { dmg: 12, speed: 13 });
          }
        } else {
          d.bolt(from, { dmg: 12, speed: 14 });
        }
      }
    },
  };
}
