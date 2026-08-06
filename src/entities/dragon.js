import * as THREE from 'three';
import { Billboard } from '../core/gfx.js';

/* ---------------------------------------------------------------------------
   Storm dragon. Perches on an island until a kitten climbs on, then becomes
   the player's flight rig. The dragon is a single side-on sprite mirrored to
   face its heading — with a fixed-ish isometric camera that reads correctly
   from every angle, and it keeps the hand-drawn art perfectly on-model.

   Every dragon is a BREED: its own colour, its own breath, its own name. The
   point is discovery — spotting a green shape on a far island and flying out
   to find out what it breathes. Breeds are also why a dragon must never be
   lost: see returnHome().
--------------------------------------------------------------------------- */

/** The breeds, in the order they're handed out. Home island always gets [0]. */
export const BREEDS = [
  {
    id: 'storm', name: 'Storm', tint: 0x9fd4ff,
    breath: { color: 0x8fe6ff, name: 'lightning', range: 17, spread: 0.55, power: 1.5 },
  },
  {
    id: 'ember', name: 'Ember', tint: 0xff9d5c,
    breath: { color: 0xffb03a, name: 'fire', range: 20, spread: 0.5, power: 1.8 },
  },
  {
    id: 'moss', name: 'Moss', tint: 0x9fe0a0,
    breath: { color: 0xa8f06a, name: 'pollen', range: 15, spread: 0.85, power: 1.2 },
  },
  {
    id: 'frost', name: 'Frost', tint: 0xc9e8ff,
    breath: { color: 0xdff4ff, name: 'frost', range: 18, spread: 0.6, power: 1.4 },
  },
  {
    id: 'plum', name: 'Plum', tint: 0xe0a6e8,
    breath: { color: 0xffa8dc, name: 'blossom', range: 16, spread: 0.95, power: 1.3 },
  },
];

const RETURN_SPEED = 42;

export class Dragon {
  /**
   * @param {THREE.Texture} texture   perched pose
   * @param {THREE.Texture} [flyTexture] horizontal flight pose; falls back to
   *        the perched art if not supplied
   */
  constructor(texture, x, y, z, opts = {}) {
    /* `size` is the width of the square atlas cell, not of the creature.
       loadSpriteAtlas fits each view into a square cell preserving its aspect
       ratio, so the quad it is drawn on must be square too — giving the quad
       the art's own aspect ratio stretches it by that ratio a second time. */
    const {
      size = 13, breed = BREEDS[0], flyTexture = null,
      contentScale = 1, pad = 0,
    } = opts;

    /* Same content fit the players get. The drawn dragon only fills part of
       its square cell, so a raw 13-unit quad both sizes it wrong and puts the
       pivot below the art — which is why it appeared to swing rather than
       turn on the spot when the camera moved. */
    const quad = size / (contentScale || 1);
    /** Drawn size of the creature — the mouth and the rider's seat hang off
     *  this, so they track the art rather than the gameplay radius. */
    this.quad = quad;

    this.breed = breed;
    this.name = breed.name;
    /** The perch this dragon always belongs to. Never changes. */
    this.perch = new THREE.Vector3(x, y, z);
    this.home = new THREE.Vector3(x, y, z);
    /** Immutable original perch, so a restart can put it back. */
    this.spawn = new THREE.Vector3(x, y, z);
    this.position = new THREE.Vector3(x, y, z);
    this.facing = 0;
    this.rider = null;
    this.bob = Math.random() * Math.PI * 2;
    this.flap = 0;
    /** 'perched' | 'ridden' | 'returning' */
    this.state = 'perched';

    this.group = new THREE.Group();
    this.group.position.copy(this.position);

    // Two poses on two quads, toggled by visibility. Swapping the map on one
    // material would mean re-applying the atlas repeat/offset (which the
    // mirror-on-turn logic drives) to the new texture every time.
    const makePose = (tex) => {
      const b = new Billboard(tex, {
        cols: 1,
        rows: 1,
        width: quad,
        height: quad,
        footOffset: pad * quad,
        artFacesRight: false, // the generated dragon faces left
      });
      b.mat.color.set(breed.tint);
      this.group.add(b);
      return b;
    };
    this.spritePerched = makePose(texture);
    this.spriteFlying = flyTexture ? makePose(flyTexture) : this.spritePerched;
    this.spriteFlying.visible = false;
    this.sprite = this.spritePerched;

    // Blob shadow — cheaper and more readable than a shadow-mapped sprite.
    const shadowGeo = new THREE.CircleGeometry(size * 0.3, 20);
    shadowGeo.rotateX(-Math.PI / 2);
    this.shadow = new THREE.Mesh(
      shadowGeo,
      new THREE.MeshBasicMaterial({ color: 0x2a1830, transparent: true, opacity: 0.3, depthWrite: false })
    );
    this.group.add(this.shadow);

    // "Press to ride" ring that pulses when a kitten is close enough. Tinted
    // to the breed so you can tell from the ground what you're about to climb.
    const ringGeo = new THREE.RingGeometry(size * 0.28, size * 0.36, 28);
    ringGeo.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: breed.breath.color, transparent: true, opacity: 0, depthWrite: false,
      })
    );
    this.group.add(this.ring);

    this._buildBreath(size);

    this.size = size;
    /** How close a kitten has to get to climb on. Generous — a 9-year-old
     *  should not have to pixel-hunt a mount prompt. */
    this.mountRadius = size * 0.62;
  }

  /* A cone of billboarded shards fired from the dragon's mouth. Cheap, reads
     instantly, and tinted per breed so each dragon feels different to fly. */
  _buildBreath(size) {
    const COUNT = 26;
    const geo = new THREE.IcosahedronGeometry(size * 0.055, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: this.breed.breath.color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    });
    this.breathMesh = new THREE.InstancedMesh(geo, mat, COUNT);
    this.breathMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.breathMesh.frustumCulled = false;
    this.breathMesh.visible = false;
    this.group.add(this.breathMesh);

    this.breathTimer = 0;
    this._puffs = Array.from({ length: COUNT }, (_, i) => ({
      t: i / COUNT,
      a: Math.random() * Math.PI * 2,
      r: Math.random(),
      s: 0.6 + Math.random() * 0.9,
    }));
    this._bm = new THREE.Matrix4();
    this._bv = new THREE.Vector3();
    this._bq = new THREE.Quaternion();
    this._bs = new THREE.Vector3();
  }

  get mounted() {
    return this.rider != null;
  }

  /**
   * Fire the breath. Returns the breed's breath spec so the caller can apply
   * it. `scale` comes from the rider's clan buff and stretches the drawn cone
   * to match the range the caller will actually hit at.
   */
  breathe(scale = 1) {
    this.breathTimer = 0.42;
    this.breathScale = scale;
    return this.breed.breath;
  }

  /**
   * Where the head is, in the group's local space.
   *
   * The flight art is a LONG horizontal creature fitted into a SQUARE cell, so
   * it only fills a shallow band across the middle — roughly the full width
   * but barely half the height. Offsets scaled to the whole quad therefore put
   * the rider a body-length above the dragon's back. These fractions are
   * measured against the drawn body, not the cell.
   *
   * The billboard mirrors itself so the drawn head always points the way the
   * dragon is facing, which is why a plain world-space offset along `facing`
   * lands on the head from every camera angle.
   */
  mouthOffset() {
    const q = this.quad;
    return {
      x: Math.sin(this.facing) * q * 0.36,
      y: q * 0.165,
      z: Math.cos(this.facing) * q * 0.36,
    };
  }

  /** Where a rider sits — just behind the head, on the shoulders. */
  seatOffset() {
    const q = this.quad;
    return {
      x: Math.sin(this.facing) * q * 0.17,
      y: q * 0.20,
      z: Math.cos(this.facing) * q * 0.17,
    };
  }

  /**
   * Vertical bob of the wingbeat, so a rider can be matched to it.
   *
   * NEGATIVE of sin(flap), because the wingbeat is faked by squashing the
   * sprite: scale.y goes to `1 - sin(flap)*f`, which pulls the dragon's back
   * DOWN exactly when sin(flap) is positive. Following sin(flap) directly
   * sends the rider up as the dragon dips, and the two read as separate
   * drawings sliding past each other.
   */
  get flapBob() {
    return -Math.sin(this.flap) * (this.rider ? 0.55 : 0.2) * (this.quad / 26);
  }

  /**
   * Send the dragon back to its own perch.
   *
   * This is the whole answer to "dismounted in the air and lost the dragon".
   * A dragon left wherever it was abandoned could end up over open sky, or on
   * an island nobody can reach without a dragon — a dead end a kid cannot
   * recover from and cannot understand. Dragons belong to a perch and always
   * fly back to it, so every island that ever had one always has one.
   */
  returnHome() {
    this.rider = null;
    this.home.copy(this.perch);
    this.state = 'returning';
  }

  /**
   * Settle wherever the rider stepped off, rather than flying home.
   *
   * Hopping off on solid ground should leave the dragon standing next to you —
   * having it immediately fly away every single time you land is worse than
   * losing it, because now you can see it leaving and can't stop it. It only
   * heads home once nobody is left on its island (see the check in the game
   * loop), which covers falling off, flying elsewhere, and taking another
   * dragon.
   */
  landAt(x, z) {
    this.rider = null;
    this.home.set(x, this.position.y, z);
    this.state = 'perched';
  }

  /**
   * Fly down and settle on the ground below a point.
   *
   * Bailing out from high up used to send the dragon all the way back to its
   * perch, so a long drop cost you your ride — you land, and it's a speck on
   * the horizon. Now it follows you down and is waiting when you hit the
   * ground. It still only goes home if there was no ground under you at all.
   */
  flyTo(x, z) {
    this.rider = null;
    this.hovering = false;
    this.home.set(x, this.position.y, z);
    this.state = 'returning';
  }

  /** Is it sitting somewhere other than the perch it belongs to? */
  get strayed() {
    return Math.hypot(this.home.x - this.perch.x, this.home.z - this.perch.z) > 6;
  }

  faceCamera(camera) {
    this.sprite.faceCamera(camera);
  }

  update(dt, world, nearPlayers) {
    this.bob += dt * 1.6;
    this.flap += dt * (this.rider ? 6.5 : this.state === 'returning' ? 5 : 2.2);

    /* A ridden dragon ALWAYS uses the flight pose, even hovering a metre off
       the grass. Dropping to the perched drawing on approach was meant to keep
       its wings out of the hillside, but the floor clamp in _updateFlight
       already handles that, and swapping a wide gliding creature for a folded
       sitting one mid-descent just reads as a glitch. `hovering` is still set,
       for anything that wants to know. */
    const flying = this.rider || this.state === 'returning';
    const want = flying ? this.spriteFlying : this.spritePerched;
    if (want !== this.sprite) {
      this.sprite.visible = false;
      want.visible = true;
      this.sprite = want;
    }

    if (this.rider) {
      this.state = 'ridden';
      this.ring.material.opacity = 0;
    } else if (this.state === 'returning') {
      this._flyHome(dt, world);
    } else {
      this._perch(dt, world, nearPlayers);
    }

    this.group.position.copy(this.position);

    // Wing-flap fake: squash the sprite vertically on the beat.
    const f = flying ? 0.09 : 0.04;
    this.sprite.mesh.scale.set(1 + Math.sin(this.flap) * f * 0.5, 1 - Math.sin(this.flap) * f, 1);
    this.sprite.facing = this.facing;

    this._updateBreath(dt);

    // Drop the blob shadow onto whatever is below.
    const below = world.heightAt(this.position.x, this.position.z);
    if (below) {
      const drop = this.position.y - below.y;
      this.shadow.visible = drop < 90;
      this.shadow.position.y = -drop + 0.06;
      const k = Math.max(0.25, 1 - drop / 90);
      this.shadow.scale.setScalar(0.7 + k * 0.8);
      this.shadow.material.opacity = 0.32 * k;
    } else {
      this.shadow.visible = false;
    }
  }

  _perch(dt, world, nearPlayers) {
    const g = world.heightAt(this.home.x, this.home.z);
    const groundY = g ? g.y : this.home.y;
    this.position.set(
      this.home.x,
      groundY + 0.2 + Math.sin(this.bob) * 0.35,
      this.home.z
    );
    /* Deliberately NOT rotating on the spot. A single side-on cell mirrors
       whenever its facing crosses the camera axis, so a dragon idly turning
       flipped left-right every few seconds for no reason the player could
       see. It holds a heading instead and the billboard just faces you. */

    let near = false;
    for (const p of nearPlayers) {
      if (p.mount) continue;
      if (p.position.distanceTo(this.position) < this.mountRadius) near = true;
    }
    const target = near ? 0.55 + Math.sin(this.bob * 4) * 0.2 : 0.12;
    this.ring.material.opacity += (target - this.ring.material.opacity) * Math.min(1, dt * 8);
  }

  _flyHome(dt, world) {
    // Targets `home`, which is the original perch after returnHome() and the
    // spot under the player after flyTo().
    const g = world.heightAt(this.home.x, this.home.z);
    const target = this._t ?? (this._t = new THREE.Vector3());
    target.set(this.home.x, (g ? g.y : this.home.y) + 0.2, this.home.z);

    const to = target.clone().sub(this.position);
    const dist = to.length();
    if (dist < 1.2) {
      this.position.copy(target);
      this.state = 'perched';
      return;
    }
    to.divideScalar(dist);
    /* Climb a little on the way so it arcs over terrain instead of ploughing
       through a hillside — but only when it has to travel sideways. Coming
       straight DOWN to the spot the rider bailed out over, climbing first
       would send it up and away from the player it's following. */
    const flat = Math.hypot(target.x - this.position.x, target.z - this.position.z);
    const lift = Math.min(1, flat / 60) * 14 * Math.min(1, flat / 20);
    this.position.addScaledVector(to, Math.min(dist, RETURN_SPEED * dt));
    this.position.y += lift * dt;
    this.facing = Math.atan2(to.x, to.z);

    /* Terrain clearance has to FLARE OUT on approach. Held at a flat 3 units
       it also holds the dragon 3 units above the perch it is trying to land
       on, so it circles a metre out of reach forever and the island quietly
       loses its dragon after all. */
    const clear = Math.min(3, dist * 0.22);
    const floor = (world.heightAt(this.position.x, this.position.z)?.y ?? -400) + clear;
    if (this.position.y < floor) this.position.y = floor;
    this.ring.material.opacity = 0;
  }

  _updateBreath(dt) {
    if (this.breathTimer <= 0) {
      if (this.breathMesh.visible) this.breathMesh.visible = false;
      return;
    }
    this.breathTimer -= dt;
    const life = Math.max(0, this.breathTimer / 0.42);
    this.breathMesh.visible = true;
    this.breathMesh.material.opacity = life * 0.95;

    const b = this.breed.breath;
    // Local space: the group is unrotated, so aim the cone along the facing.
    const fx = Math.sin(this.facing);
    const fz = Math.cos(this.facing);

    /* Start the cone AT THE MOUTH, not at the dragon's feet. The head is
       forward along the facing and high up the quad, so the flame now leaves
       the face instead of erupting from under the belly. It does tie the
       breath to the drawn head position rather than a clean 8-direction fan,
       which is the trade the look is worth. */
    const mouth = this.mouthOffset();

    for (let i = 0; i < this._puffs.length; i++) {
      const p = this._puffs[i];
      // March each shard out along the cone, wrapping as it reaches the tip.
      const t = (p.t + (1 - life) * 1.3) % 1;
      const k = this.breathScale ?? 1;
      const reach = t * b.range * k;
      const spread = t * b.spread * b.range * 0.42 * p.r * k;
      this._bv.set(
        mouth.x + fx * reach + Math.cos(p.a) * spread,
        mouth.y + Math.sin(p.a) * spread * 0.7,
        mouth.z + fz * reach + Math.sin(p.a) * spread
      );
      const scale = p.s * (0.4 + t * 1.5) * life;
      this._bs.setScalar(Math.max(0.001, scale));
      this._bm.compose(this._bv, this._bq, this._bs);
      this.breathMesh.setMatrixAt(i, this._bm);
    }
    this.breathMesh.instanceMatrix.needsUpdate = true;
  }
}
