import * as THREE from 'three';
import { SIM, HOLO } from '../../world/simworld.js';
import { HoloPanel } from './holo.js';

/* ---------------------------------------------------------------------------
   A PAD TO STAND ON, A SIGN OVER IT, AND A CARD FOR WHOEVER IS NEAREST.

   The gallery's pedestals and the hall's shrines grew this shape twice by
   hand; the range and the kata floor are the third and fourth, so it is one
   class now. What a kiosk owns:

     · the pad — a ring on the floor. Standing inside it is what makes it the
       station `DreamDojo.stationAt` finds, so the prompt and INTERACT go to it;
     · a small sign that is always lit (kanji and a word), so the floor reads
       from the bridge;
     · the card, shown to the NEAREST kitten within `near` and painted for
       her — her stars, her buttons — and hidden from anybody mid-drill,
       because the drill's own card hangs at the same height over the same
       spot (the gallery found that out first).

   `o.card(p)` returns the card's lines, `o.prompt(p, key)` her callout, and
   `o.interact(p)` what INTERACT does. All three are asked fresh every time,
   so a kiosk never shows a kitten somebody else's stars.
--------------------------------------------------------------------------- */

export class Kiosk {
  constructor(dream, o) {
    this.dream = dream;
    this.o = o;
    this.x = o.x;
    this.z = o.z;
    this.y = o.y;
    this.r = o.r ?? 1.8;
    this.show = 0;
    const colour = o.colour ?? HOLO.cyan;
    this.group = new THREE.Group();
    this.group.position.set(o.x, o.y, o.z);
    this.pad = new THREE.Mesh(
      new THREE.RingGeometry(this.r - 0.25, this.r, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.6, toneMapped: false, depthWrite: false })
    );
    this.pad.position.y = 0.05;
    this.group.add(this.pad);
    this.sign = new HoloPanel({ w: 3.4, h: 1.5, px: 80, edge: colour });
    this.sign.position.y = 3.2;
    this.sign.set([
      { text: o.kanji ?? '', size: 2.4, color: colour, glow: true, jp: true },
      { text: o.title ?? '', size: 1.2 },
    ], colour);
    this.group.add(this.sign);
    this.card = new HoloPanel({ w: o.cardW ?? 6.6, h: o.cardH ?? 3.4, px: 96, edge: colour });
    this.card.position.y = 6.4;
    this.card.visible = false;
    this.group.add(this.card);
    dream.sim.root.add(this.group);
    this.station = {
      x: o.x, z: o.z, y: o.y, r: this.r,
      prompt: (p, key) => o.prompt(p, key),
      interact: (p) => o.interact(p),
    };
  }

  update(dt, inside) {
    let near = null;
    let nd = this.o.near ?? 8;
    for (const p of inside) {
      const d = Math.hypot(p.position.x - SIM.dx - this.x, p.position.z - SIM.dz - this.z);
      if (d < nd) { nd = d; near = p; }
    }
    if (near) this.card.set(this.o.card(near), this.o.colour ?? HOLO.cyan);
    this.show += ((near ? 1 : 0) - this.show) * Math.min(1, dt * 6);
    this.card.visible = this.show > 0.03;
    this.card.mat.opacity = this.show;
    this.pad.material.opacity = 0.45 + 0.25 * Math.sin(this.dream.t * 3 + this.x);
  }

  faceCamera(camera) {
    this.sign.faceCamera(camera);
    if (this.card.visible) this.card.faceCamera(camera);
  }
}

/** Kittens in the sim who are not mid-drill — the ones a kiosk card is for. */
export function idleIn(dream) {
  return dream.simKittens().filter((p) => {
    const d = dream.drills[p.index];
    return !d || (d.state !== 'ready' && d.state !== 'live');
  });
}

/** A point on an island, `a` along its `fwd` and `b` to the right. */
export function isleSpot(isle, a, b) {
  const f = isle.fwd;
  return { x: isle.x + f.x * a - f.z * b, y: isle.y, z: isle.z + f.z * a + f.x * b };
}

export const stars3 = (n) => `${'★'.repeat(n)}${'☆'.repeat(3 - n)}`;
