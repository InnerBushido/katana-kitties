import * as THREE from 'three';
import { Label } from '../core/label.js';
import { POWER_ORBS } from './powerorb.js';

/* ---------------------------------------------------------------------------
   THE KOTODAMA DEALER'S STALL.

   A market stall in the plaza that appears at the Awakening, with eight orbs
   turning slowly above the counter — one of each, which is literally the
   stock. It is furniture, not a character, and that is a decision rather than
   a corner cut: every talking figure in this game is a generated sprite sheet
   with a matched recorded voice, and adding a ninth cat with neither would
   read as the one placeholder in a world where everybody else is finished.
   A stall with a noren over it and its wares floating above it says "shop" in
   a Japanese market without claiming to be a person.

   THE STOCK IS THE SIGN. Eight orbs hanging over the counter in their own
   colours is what tells a nine-year-old what is for sale before she has read
   a word, and when the dealer runs out of one the ball goes dark — so "he
   hasn't got a Ward left" is a thing you can see from across the plaza rather
   than a line of red text inside a menu.
--------------------------------------------------------------------------- */

/** How close you have to stand for the prompt. Comfortably outside the solid
 *  registered around the counter, so you cannot be shoved out of range of the
 *  thing you are standing at. */
export const STALL_RADIUS = 6.5;

export class KotodamaStall {
  constructor(x, y, z) {
    this.position = new THREE.Vector3(x, y, z);
    this.radius = STALL_RADIUS;
    this.group = new THREE.Group();
    this.group.position.set(x, y, z);
    /* TURNED TO FACE THE CAMERA'S FIXED YAW, not north. This game's camera
       never rotates — it sits at -PI/4 for ever, which is what holds the 2.5D
       look together — so "the front of a building" is a known direction here
       rather than something that depends on where the player is standing.
       Left at zero the counter is seen edge-on and the noren, which is the
       thing that says "shop", hangs entirely out of sight behind it. */
    this.group.rotation.y = -Math.PI / 4;
    this.t = 0;

    const wood = new THREE.MeshLambertMaterial({ color: 0x6b3f2a });
    const dark = new THREE.MeshLambertMaterial({ color: 0x3c2418 });
    const cloth = new THREE.MeshLambertMaterial({ color: 0x8f1f2e });

    const add = (geo, mat, px, py, pz, ry = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.rotation.y = ry;
      m.castShadow = true;
      this.group.add(m);
      return m;
    };

    // counter
    add(new THREE.BoxGeometry(4.4, 1.15, 1.5), wood, 0, 0.58, 0);
    add(new THREE.BoxGeometry(4.8, 0.16, 1.9), dark, 0, 1.22, 0);
    // posts and a roof beam
    for (const sx of [-2.0, 2.0]) {
      add(new THREE.BoxGeometry(0.22, 3.2, 0.22), dark, sx, 1.6, -0.5);
    }
    add(new THREE.BoxGeometry(4.8, 0.2, 0.3), dark, 0, 3.25, -0.5);
    // the noren, hanging in three panels with gaps you can see through
    for (let i = -1; i <= 1; i++) {
      add(new THREE.BoxGeometry(1.35, 1.0, 0.06), cloth, i * 1.5, 2.65, -0.5);
    }
    // a paper lantern at each end, unlit geometry but bright — it is a
    // MeshBasic so it reads as a light source rather than a pale box
    for (const sx of [-2.0, 2.0]) {
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 12, 10),
        new THREE.MeshBasicMaterial({ color: 0xffd98a, toneMapped: false })
      );
      lamp.position.set(sx, 2.95, 0.25);
      lamp.scale.y = 1.25;
      this.group.add(lamp);
    }

    /* --- the wares ---
       Eight small orbs in a slow arc over the counter, in roster order, so the
       shelf is in the same order as the profile screen's slots and the shop
       list. Three places showing the same eight things in three different
       orders is how a kid loses track of which one she is buying. */
    this.wares = POWER_ORBS.map((spec, i) => {
      const g = new THREE.Group();
      const a = (i / (POWER_ORBS.length - 1) - 0.5) * 2.6;
      g.position.set(a, 1.95 + Math.cos(a) * 0.12, 0.1);
      const core = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.17, 1),
        new THREE.MeshBasicMaterial({ color: spec.color, toneMapped: false })
      );
      const halo = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.3, 1),
        new THREE.MeshBasicMaterial({
          color: spec.color, transparent: true, opacity: 0.3,
          side: THREE.BackSide, depthWrite: false, toneMapped: false,
        })
      );
      g.add(core, halo);
      this.group.add(g);
      return { spec, group: g, core, halo, phase: i * 0.7 };
    });

    /* TWICE THE HEIGHT IT WAS, AND THE REASON IS THE SPLIT SCREEN.

       A label is a quad of a fixed WORLD size, so how many screen pixels it
       covers is a function of the pane it is drawn in. At two players that was
       fine and at four it is not: a quadrant is half the width and half the
       height of the screen these were sized against, so every piece of world
       text in the game comes out at half its linear size — and this one is
       eleven characters of a word nobody has seen before. Reported as "you can
       hardly see the text".

       THE HEIGHT DOUBLES AND `size` DOES NOT, which is worth stating because
       the obvious move is to raise both. `size` is the AUTHORED height of the
       canvas the text is drawn on, so raising it costs texture memory
       quadratically; `height` is the world size of the quad it lands on, which
       is free. The texture is supersampled 3x (see SS in core/label.js) and was
       being drawn at roughly a third of its own resolution even before this, so
       there is headroom to spend and it is spent here: at 1.2 units the label
       only magnifies past 1:1 if you stand closer than about four units to it
       on a full screen, and the counter's solid stops you at three.

       It sits higher to make room. The roof beam tops out at 3.35 and the quad
       is 1.2 tall, so 4.1 puts its bottom edge at 3.5 — the same clearance the
       old one had at 3.85. */
    this.sign = new Label('KOTODAMA — 言霊', {
      height: 1.2, size: 68, color: '#ffe6a8', stroke: '#2a1408', strokeWidth: 8,
    });
    this.sign.position.set(0, 4.1, -0.4);
    this.group.add(this.sign);

    /* The prompt only appears when somebody is standing at it — the same
       three-distance argument the shrines make, collapsed to two, because a
       market stall does not need to be visible from the air. */
    this.prompt = new Label('PRESS INTERACT TO TRADE', {
      height: 1.0, size: 60, color: '#ffffff', stroke: '#1a2030', strokeWidth: 8,
    });
    /* Above the sign with a gap: both quads doubled, so the old 0.75 between
       their centres is now less than their two half-heights and they would be
       drawn through each other. */
    this.prompt.position.set(0, 5.6, -0.4);
    this.prompt.visible = false;
    this.group.add(this.prompt);
  }

  /** Grey out what the dealer has sold out of. See the header. */
  setStock(stock) {
    for (const w of this.wares) {
      const has = (stock?.[w.spec.id] ?? 0) > 0;
      w.core.material.color.set(has ? w.spec.color : 0x2c3038);
      w.halo.material.opacity = has ? 0.3 : 0.06;
    }
  }

  update(dt, players = []) {
    this.t += dt;
    for (const w of this.wares) {
      w.group.rotation.y += dt * 1.2;
      w.group.position.y = 1.95 + Math.sin(this.t * 1.4 + w.phase) * 0.09;
    }
    const near = players.some(
      (p) => !p.mount && !p.rideAlong
        && Math.hypot(p.position.x - this.position.x, p.position.z - this.position.z) < this.radius
    );
    this.prompt.visible = near;
  }

  faceCamera(camera) {
    this.sign.faceCamera(camera);
    if (this.prompt.visible) this.prompt.faceCamera(camera);
  }
}
