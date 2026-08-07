import * as THREE from 'three';
import { toonVertexMat, outlineGroup } from '../core/gfx.js';
import { PALETTE, mergeParts, valueNoise } from '../world/build.js';

/* ---------------------------------------------------------------------------
   Knockable scenery — the Untitled Goose Game half of the design. Every one of
   these can be shoved, and shoving it for the first time scores a Whisker
   Point. They tumble with cheap rigid-ish physics: enough to be funny, not
   enough to need a physics engine.
--------------------------------------------------------------------------- */

const SHARED_MAT = toonVertexMat();
const GEO_CACHE = new Map();

function paintTo(geo, color) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function makeGeo(kind) {
  if (GEO_CACHE.has(kind)) return GEO_CACHE.get(kind);
  const parts = [];

  if (kind === 'barrel') {
    const body = new THREE.CylinderGeometry(0.52, 0.46, 1.1, 12);
    paintTo(body, PALETTE.wood); body.translate(0, 0.55, 0); parts.push(body);
    for (const y of [0.22, 0.88]) {
      const hoop = new THREE.TorusGeometry(0.53, 0.055, 6, 14);
      hoop.rotateX(Math.PI / 2);
      paintTo(hoop, 0x4a3a2c); hoop.translate(0, y, 0); parts.push(hoop);
    }
    const fish = new THREE.IcosahedronGeometry(0.3, 0);
    fish.scale(1.5, 0.6, 0.9);
    paintTo(fish, 0xbcd8e8); fish.translate(0, 1.16, 0); parts.push(fish);
  } else if (kind === 'basket') {
    const body = new THREE.CylinderGeometry(0.52, 0.34, 0.72, 10);
    paintTo(body, 0xc79a54); body.translate(0, 0.36, 0); parts.push(body);
    const rim = new THREE.TorusGeometry(0.52, 0.07, 6, 12);
    rim.rotateX(Math.PI / 2);
    paintTo(rim, 0x8f6b32); rim.translate(0, 0.72, 0); parts.push(rim);
    for (let i = 0; i < 3; i++) {
      const f = new THREE.IcosahedronGeometry(0.2, 0);
      paintTo(f, [0xe8613f, 0xf2a83c, 0xd94a6a][i]);
      f.translate((i - 1) * 0.24, 0.82, (i % 2) * 0.16 - 0.08);
      parts.push(f);
    }
  } else if (kind === 'crate') {
    const body = new THREE.BoxGeometry(0.92, 0.86, 0.92);
    paintTo(body, PALETTE.wood); body.translate(0, 0.43, 0); parts.push(body);
    for (const [ax, az] of [[1, 0], [0, 1]]) {
      const slat = new THREE.BoxGeometry(ax ? 1.0 : 0.14, 0.14, az ? 1.0 : 0.14);
      paintTo(slat, PALETTE.woodDark);
      slat.translate(az ? 0.5 : 0, 0.43, ax ? 0.5 : 0);
      parts.push(slat);
    }
  } else if (kind === 'lantern') {
    const post = new THREE.CylinderGeometry(0.09, 0.11, 1.5, 7);
    paintTo(post, PALETTE.woodDark); post.translate(0, 0.75, 0); parts.push(post);
    const paper = new THREE.CylinderGeometry(0.34, 0.34, 0.62, 10);
    paintTo(paper, 0xff6a4d); paper.translate(0, 1.75, 0); parts.push(paper);
    const capTop = new THREE.CylinderGeometry(0.16, 0.34, 0.14, 10);
    paintTo(capTop, 0x3a2a22); capTop.translate(0, 2.1, 0); parts.push(capTop);
  } else if (kind === 'icicle') {
    /* A cluster of ice spikes growing out of the ground. Tall, pale and
       glassy so they read against snow, and they shatter into the same
       tumbling physics as everything else. */
    const spikes = 3;
    for (let i = 0; i < spikes; i++) {
      const a = (i / spikes) * Math.PI * 2 + 0.6;
      const off = i === 0 ? 0 : 0.32;
      const h = i === 0 ? 2.6 : 1.5 + (i * 0.35);
      const spike = new THREE.ConeGeometry(0.26 - i * 0.04, h, 6);
      paintTo(spike, i % 2 === 0 ? 0xd8f0ff : 0xa8d8f0);
      spike.translate(Math.cos(a) * off, h / 2, Math.sin(a) * off);
      parts.push(spike);
    }
    // A frozen puddle at the base, so they don't look stuck on.
    const base = new THREE.CylinderGeometry(0.62, 0.72, 0.16, 9);
    paintTo(base, 0xbfe4f5);
    base.translate(0, 0.08, 0);
    parts.push(base);
  } else if (kind === 'bamboo') {
    /* A single cane, cut waist-high. Tall and thin so a felled one topples
       spectacularly — this is the prop the whole grove is built around. */
    const H = 8.5;
    const segs = 6;
    for (let s = 0; s < segs; s++) {
      const y0 = (s / segs) * H;
      const sh = (H / segs) * 0.94;
      const taper = 1 - (s / segs) * 0.3;
      const cane = new THREE.CylinderGeometry(0.2 * taper * 0.94, 0.2 * taper, sh, 7);
      paintTo(cane, s % 2 === 0 ? 0x7fae3f : 0x8fbe4a);
      cane.translate(0, y0 + sh / 2, 0);
      parts.push(cane);
      const joint = new THREE.CylinderGeometry(0.235 * taper, 0.235 * taper, 0.1, 7);
      paintTo(joint, 0x5f8a2c);
      joint.translate(0, y0 + sh, 0);
      parts.push(joint);
    }
    for (let l = 0; l < 4; l++) {
      const a = l * 1.7;
      const ly = H * (0.6 + l * 0.1);
      const leaf = new THREE.IcosahedronGeometry(0.62, 0);
      leaf.scale(1.6, 0.3, 0.8);
      paintTo(leaf, l % 2 ? 0x6fa337 : 0x87c04d);
      leaf.translate(Math.cos(a) * 0.85, ly, Math.sin(a) * 0.85);
      parts.push(leaf);
    }
  } else {
    // melon stack
    for (let i = 0; i < 3; i++) {
      const m = new THREE.IcosahedronGeometry(0.34, 1);
      m.scale(1, 0.88, 1);
      paintTo(m, i === 2 ? 0x6fbf4a : 0x4e9c37);
      m.translate((i - 1) * 0.36 * (i === 2 ? 0 : 1), 0.3 + (i === 2 ? 0.55 : 0), 0);
      parts.push(m);
    }
  }

  const geo = mergeParts(parts);
  geo.computeBoundingSphere();
  GEO_CACHE.set(kind, geo);
  return geo;
}

export class Prop {
  constructor(kind, x, y, z, seed = 0) {
    this.kind = kind;
    this.home = new THREE.Vector3(x, y, z);
    this.knocked = false;
    this.scored = false;
    /** Fell off the world and was retired. Never comes back — see _retire. */
    this.gone = false;
    this.settleTimer = 0;

    this.group = new THREE.Group();
    this.group.position.set(x, y, z);
    this.group.rotation.y = valueNoise(seed, 1, 5) * Math.PI * 2;

    const mesh = new THREE.Mesh(makeGeo(kind), SHARED_MAT);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    outlineGroup(this.group, 0.035);

    this.vel = new THREE.Vector3();
    this.spin = new THREE.Vector3();
    this.radius = 0.6;
    this.height = kind === 'lantern' ? 2.2
      : kind === 'bamboo' ? 8.5
        : kind === 'icicle' ? 2.6 : 1.0;

    /** Bamboo answers to the katana and nothing else — not a dive-bomb, not
     *  dragon breath. It's the reason to get off the dragon. */
    this.katanaOnly = kind === 'bamboo';
    /** Worth more, because cutting it means landing first. Icicles are worth
     *  a little extra too — they're a flight away from anywhere. */
    this.points = kind === 'bamboo' ? 25 : kind === 'icicle' ? 15 : 10;
  }

  /** Shove it. `dir` is a normalised XZ direction, `power` roughly 1. */
  knock(dir, power = 1) {
    const first = !this.knocked;
    this.knocked = true;
    this.settleTimer = 0;
    this.vel.set(dir.x * 6.5 * power, 4.4 * power, dir.z * 6.5 * power);
    this.spin.set(
      (Math.random() - 0.5) * 9 * power,
      (Math.random() - 0.5) * 6 * power,
      (Math.random() - 0.5) * 9 * power
    );
    return first;
  }

  update(dt, world) {
    if (this.gone || !this.knocked) return;

    this.vel.y -= 22 * dt;
    this.group.position.addScaledVector(this.vel, dt);
    this.group.rotation.x += this.spin.x * dt;
    this.group.rotation.y += this.spin.y * dt;
    this.group.rotation.z += this.spin.z * dt;

    const g = world.heightAt(this.group.position.x, this.group.position.z);
    if (g == null) {
      // Knocked clean off the island. It falls, and it STAYS gone — see _retire.
      if (this.group.position.y < -140) this._retire();
      return;
    }

    if (this.group.position.y <= g.y) {
      this.group.position.y = g.y;
      if (Math.abs(this.vel.y) > 2.2) {
        this.vel.y = -this.vel.y * 0.36;   // bounce
        this.vel.x *= 0.7;
        this.vel.z *= 0.7;
        this.spin.multiplyScalar(0.6);
      } else {
        this.vel.set(0, 0, 0);
        this.spin.multiplyScalar(0.82);
        // Lie down rather than snapping upright — it looks knocked over.
        this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, Math.PI / 2, dt * 4);
        this.group.rotation.z = THREE.MathUtils.lerp(this.group.rotation.z, 0, dt * 4);
        this.settleTimer += dt;
      }
    }

    // Ground friction while sliding.
    if (Math.abs(this.vel.y) < 0.1) {
      this.vel.x *= 1 - Math.min(1, dt * 4.5);
      this.vel.z *= 1 - Math.min(1, dt * 4.5);
    }
  }

  /**
   * Gone for good, because it fell off the edge of the world.
   *
   * It used to reappear standing at `home`, which is the wrong answer for
   * every prop and a badly wrong one for bamboo. A cane you cut, watched
   * topple over the rim and then found standing in the grove again is a cane
   * you cut twice and were paid for once — `scored` latches on the first hit,
   * so the second swing does nothing at all. From the floor that is
   * indistinguishable from a broken katana, and it makes the one number the
   * game asks a kid to trust — her Mischief count — impossible to reconcile
   * with what she can see standing in front of her.
   *
   * It stays in `world.props`, because it was scored on the way over the edge
   * and the mischief total must not shrink underneath her. Nothing collides
   * with props (`world.solids` holds the trees and buildings), so hiding one
   * where it fell has no other consequence.
   */
  _retire() {
    this.gone = true;
    this.group.visible = false;
    this.vel.set(0, 0, 0);
    this.spin.set(0, 0, 0);
  }

  /** Put it back as it started. The restart path only — see _retire. */
  _reset() {
    this.group.position.copy(this.home);
    this.group.rotation.set(0, Math.random() * 6.28, 0);
    this.vel.set(0, 0, 0);
    this.spin.set(0, 0, 0);
    this.knocked = false;
    this.gone = false;
    this.group.visible = true;
    this.settleTimer = 0;
  }
}
