import * as THREE from 'three';
import { Label } from '../core/label.js';

/* ---------------------------------------------------------------------------
   The Kotodama Orb — a companion that circles the kitten.

   It is deliberately, visibly built out of the unit circle:

       x = centre.x + cos(theta) * r
       z = centre.z + sin(theta) * r

   and the game draws every part of that as you play — the radius vector, the
   angle arc, the sine and cosine legs of the right triangle, and a live
   readout of theta in both degrees and radians. Nothing here is decoration
   pretending to be maths; the numbers on screen are the numbers moving the orb.
--------------------------------------------------------------------------- */

export class Orb {
  /**
   * @param {object} opts
   *   radius   — orbit radius, the "r" in the equations
   *   speed    — radians per second
   *   phase    — starting theta
   *   color    — orb tint
   */
  constructor(opts = {}) {
    const {
      radius = 3.2, speed = 1.15, phase = 0, color = 0x7fe3ff,
      height = 1.6, tilt = 0.22,
    } = opts;

    this.r = radius;
    this.speed = speed;
    this.theta = phase;
    this.height = height;
    this.tilt = tilt;
    this.color = color;

    this.group = new THREE.Group();

    // --- the orb itself ---
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.4, 1),
      new THREE.MeshBasicMaterial({ color, toneMapped: false })
    );
    const halo = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.62, 1),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.28,
        side: THREE.BackSide, depthWrite: false, toneMapped: false,
      })
    );
    this.orbNode = new THREE.Group();
    this.orbNode.add(core, halo);
    this.group.add(this.orbNode);
    this.core = core;

    /* There used to be a ring of little drifting "sin / cos / π" glyphs around
       the orb. They were parented to orbNode, which tumbles on X every frame,
       while faceCamera copies the camera's quaternion onto each label — so the
       parent's spin fought the billboarding and the text sheared and flickered
       instead of hanging in the air. They also competed with the real lesson.
       Removed: the θ / cos / sin readouts on the overlay below are the numbers
       that matter, and they're anchored to the diagram rather than the orb. */

    this._buildMathOverlay(color);
    this.showMath = true;
  }

  /* The live geometry lesson: radius vector, angle arc, and the right
     triangle whose legs are literally cos(theta)*r and sin(theta)*r. */
  _buildMathOverlay(color) {
    this.overlay = new THREE.Group();
    this.group.add(this.overlay);

    const line = (c, dashed = false) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
      const mat = dashed
        ? new THREE.LineDashedMaterial({
            color: c, dashSize: 0.34, gapSize: 0.26,
            transparent: true, opacity: 0.95, depthTest: false, toneMapped: false,
          })
        : new THREE.LineBasicMaterial({
            color: c, transparent: true, opacity: 0.95,
            depthTest: false, toneMapped: false,
          });
      const l = new THREE.Line(geo, mat);
      l.renderOrder = 15;
      l.frustumCulled = false;
      this.overlay.add(l);
      return l;
    };

    // radius vector (the hypotenuse) and the two legs
    this.lineR = line(color);
    this.lineCos = line(0xffb347, true);   // adjacent  → cos
    this.lineSin = line(0x8bff9a, true);   // opposite  → sin

    // the circle the orb travels on
    const circlePts = [];
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      circlePts.push(Math.cos(a) * this.r, 0, Math.sin(a) * this.r);
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(circlePts, 3));
    this.circle = new THREE.Line(cg, new THREE.LineBasicMaterial({
      color, transparent: true, opacity: 0.32, depthTest: false, toneMapped: false,
    }));
    this.circle.renderOrder = 14;
    this.overlay.add(this.circle);

    // the swept angle arc, rebuilt every frame
    this.arc = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0xffe27a, transparent: true, opacity: 0.95,
        depthTest: false, toneMapped: false,
      })
    );
    this.arc.renderOrder = 15;
    this.arc.frustumCulled = false;
    this.overlay.add(this.arc);

    this.thetaLabel = new Label('θ', {
      height: 0.72, size: 72, color: '#ffe27a', stroke: '#2a1c06', strokeWidth: 8,
      depthTest: false,
    });
    this.overlay.add(this.thetaLabel);

    this.cosLabel = new Label('cos', {
      height: 0.6, size: 64, color: '#ffb347', stroke: '#2a1c06', strokeWidth: 8,
      depthTest: false,
    });
    this.sinLabel = new Label('sin', {
      height: 0.6, size: 64, color: '#8bff9a', stroke: '#0e2a12', strokeWidth: 8,
      depthTest: false,
    });
    this.overlay.add(this.cosLabel, this.sinLabel);
  }

  setMathVisible(v) {
    this.showMath = v;
    this.overlay.visible = v;
  }

  /** @returns live values so the HUD can print the same numbers. */
  update(dt, centre) {
    this.theta += this.speed * dt;
    if (this.theta > Math.PI * 2) this.theta -= Math.PI * 2;

    const c = Math.cos(this.theta);
    const s = Math.sin(this.theta);
    const x = c * this.r;
    const z = s * this.r;

    // The orbit plane is tilted a little so it reads as 3D, but the maths
    // is still plain 2D on that plane.
    this.group.position.set(centre.x, centre.y + this.height, centre.z);
    this.group.rotation.z = this.tilt;

    this.orbNode.position.set(x, 0, z);
    this.orbNode.rotation.y += dt * 1.6;
    this.orbNode.rotation.x += dt * 1.1;

    if (this.showMath) {
      this._updateOverlay(x, z, c, s);
    }

    return { theta: this.theta, cos: c, sin: s, x, z, r: this.r };
  }

  _updateOverlay(x, z, c, s) {
    const setLine = (line, ax, ay, az, bx, by, bz) => {
      const p = line.geometry.attributes.position;
      p.setXYZ(0, ax, ay, az);
      p.setXYZ(1, bx, by, bz);
      p.needsUpdate = true;
      if (line.material.isLineDashedMaterial) line.computeLineDistances();
    };

    // hypotenuse: origin → orb
    setLine(this.lineR, 0, 0, 0, x, 0, z);
    // adjacent leg along +X (this length is cos(theta) * r)
    setLine(this.lineCos, 0, 0, 0, x, 0, 0);
    // opposite leg parallel to Z (this length is sin(theta) * r)
    setLine(this.lineSin, x, 0, 0, x, 0, z);

    // arc from the +X axis round to theta
    const steps = Math.max(2, Math.ceil((this.theta / (Math.PI * 2)) * 64) + 1);
    const pts = new Float32Array(steps * 3);
    const ar = this.r * 0.3;
    for (let i = 0; i < steps; i++) {
      const a = (i / (steps - 1)) * this.theta;
      pts[i * 3] = Math.cos(a) * ar;
      pts[i * 3 + 2] = Math.sin(a) * ar;
    }
    this.arc.geometry.dispose();
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    this.arc.geometry = ag;

    const half = this.theta / 2;
    this.thetaLabel.position.set(Math.cos(half) * ar * 1.45, 0.1, Math.sin(half) * ar * 1.45);
    this.thetaLabel.setText(`θ ${Math.round((this.theta * 180) / Math.PI)}°`);

    this.cosLabel.position.set(x / 2, 0.1, -0.55 * Math.sign(z || 1));
    this.cosLabel.setText(`cos θ = ${c.toFixed(2)}`);

    this.sinLabel.position.set(x + 0.75 * Math.sign(x || 1), 0.1, z / 2);
    this.sinLabel.setText(`sin θ = ${s.toFixed(2)}`);
  }

  faceCamera(camera) {
    if (this.showMath) {
      this.thetaLabel.faceCamera(camera);
      this.cosLabel.faceCamera(camera);
      this.sinLabel.faceCamera(camera);
    }
  }

  dispose(parent) {
    parent.remove(this.group);
  }
}

/* ------------------------------ pickups ---------------------------------- */

/** A collectable orb sitting on a pedestal, waiting to be walked into. */
export class OrbPickup {
  constructor(x, y, z, color = 0x7fe3ff) {
    this.position = new THREE.Vector3(x, y, z);
    this.taken = false;
    this.t = Math.random() * 6.28;

    this.group = new THREE.Group();
    this.group.position.set(x, y, z);

    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.55, 1),
      new THREE.MeshBasicMaterial({ color, toneMapped: false })
    );
    core.position.y = 1.5;
    const halo = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.95, 1),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.22,
        side: THREE.BackSide, depthWrite: false, toneMapped: false,
      })
    );
    halo.position.y = 1.5;

    const ringGeo = new THREE.TorusGeometry(1.05, 0.05, 6, 32);
    ringGeo.rotateX(Math.PI / 2);
    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, toneMapped: false })
    );
    ring.position.y = 1.5;

    this.core = core;
    this.ring = ring;
    this.group.add(core, halo, ring);

    this.label = new Label('sin / cos', {
      height: 0.5, size: 60, color: '#d9f6ff', stroke: '#123044', strokeWidth: 7,
    });
    this.label.position.y = 2.9;
    this.group.add(this.label);
  }

  update(dt) {
    this.t += dt;
    this.group.position.y = this.position.y + Math.sin(this.t * 1.8) * 0.22;
    this.core.rotation.y += dt * 1.4;
    this.core.rotation.x += dt * 0.8;
    this.ring.rotation.z += dt * 0.9;
  }

  faceCamera(camera) {
    this.label.faceCamera(camera);
  }
}
