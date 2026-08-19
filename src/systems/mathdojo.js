import * as THREE from 'three';
import { Label } from '../core/label.js';

/* ---------------------------------------------------------------------------
   THE DOJO OF THE TURNING CIRCLE

   A walkable unit circle, 24 world units to the radius, painted on the floor
   of its own floating island. Walk onto it and *you become the point*: the
   game reads your angle from the origin and draws, live:

     · the radius vector from (0,0) out to you            → a vector
     · the swept angle from the +x axis                   → theta
     · the horizontal leg, whose length is cos(theta)     → cosine
     · the vertical leg, whose length is sin(theta)       → sine
     · your coordinates as (cos theta, sin theta)         → a point on the circle

   and a board beside the circle plots both waves with a playhead locked to
   your angle, in degrees *and* radians at the same time.

   The world's +X axis is the maths x axis; the world's +Z axis is the maths
   y axis. Everything is on the floor so the whole lesson is something you can
   physically stand inside.
--------------------------------------------------------------------------- */

const R = 24;                       // world units per 1.0 on the circle
const AXIS = R * 1.42;
/* The swept-angle arc at a full turn: 96 segments plus the closing point. The
   buffer is allocated at this length once and drawn short. */
const ARC_MAX = 97;

/* Maths y maps to world -Z.
   The dojo camera looks down the +Z axis, so world -Z is screen-up. Without
   this flip the y axis would point *down* the screen and every diagram would
   be mirrored against the graph paper she's drawing on. */
const ZS = -1;
const wx = (mathX) => mathX * R;
const wz = (mathY) => ZS * mathY * R;
const GOLD = 0xffe27a;
const COS_C = 0xffb347;             // adjacent / cosine
const SIN_C = 0x8bff9a;             // opposite / sine
const VEC_C = 0x7fe3ff;             // the radius vector

export class MathDojo {
  constructor(scene, centre) {
    this.scene = scene;
    this.centre = centre.clone();
    this.theta = 0;
    this.autoSpin = true;
    this.driver = null;             // which player is steering the angle
    this.playerRadius = 1;

    this.group = new THREE.Group();
    this.group.position.copy(this.centre);
    this.group.position.y += 0.12;
    scene.add(this.group);

    this._buildFloor();
    this._buildAxes();
    this._buildCircle();
    this._buildLiveTriangle();
    this._buildBoard();
    this._buildGate();
  }

  /* ------------------------------- floor -------------------------------- */

  _buildFloor() {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(AXIS + 8, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x141026, transparent: true, opacity: 0.88 })
    );
    disc.position.y = -0.06;
    this.group.add(disc);

    // faint graph-paper grid — the same squared paper she's drawing on
    const pts = [];
    const step = R / 4;
    for (let i = -6; i <= 6; i++) {
      const v = i * step;
      if (Math.abs(v) > AXIS) continue;
      pts.push(-AXIS, 0, v, AXIS, 0, v);
      pts.push(v, 0, -AXIS, v, 0, AXIS);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const grid = new THREE.LineSegments(
      g,
      new THREE.LineBasicMaterial({ color: 0x4a6fa5, transparent: true, opacity: 0.3 })
    );
    grid.position.y = -0.04;
    this.group.add(grid);
  }

  /* ------------------------------- axes --------------------------------- */

  _line(color, opacity = 1, dashed = false) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    const mat = dashed
      ? new THREE.LineDashedMaterial({ color, dashSize: 0.9, gapSize: 0.7, transparent: true, opacity, toneMapped: false })
      : new THREE.LineBasicMaterial({ color, transparent: true, opacity, toneMapped: false });
    const l = new THREE.Line(geo, mat);
    l.frustumCulled = false;
    this.group.add(l);
    return l;
  }

  _setLine(line, ax, az, bx, bz, y = 0) {
    const p = line.geometry.attributes.position;
    p.setXYZ(0, ax, y, az);
    p.setXYZ(1, bx, y, bz);
    p.needsUpdate = true;
    if (line.material.isLineDashedMaterial) line.computeLineDistances();
  }

  _buildAxes() {
    const mk = (a, b, c, d) => {
      const l = this._line(0xfff0d0, 0.9);
      this._setLine(l, a, b, c, d, 0.02);
      return l;
    };
    mk(-AXIS, 0, AXIS, 0);   // x axis
    mk(0, -AXIS, 0, AXIS);   // y axis

    // arrow heads at +x and +y
    const arrow = (x, z, rot) => {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.9, 2.4, 12),
        new THREE.MeshBasicMaterial({ color: 0xfff0d0, toneMapped: false })
      );
      cone.rotation.set(Math.PI / 2, 0, rot);
      cone.position.set(x, 0.3, z);
      this.group.add(cone);
    };
    arrow(AXIS, 0, -Math.PI / 2);
    arrow(0, wz(AXIS / R), Math.PI);

    this.labels = [];
    const lab = (t, x, z, opts = {}) => {
      const l = new Label(t, {
        height: 2.1, size: 76, color: '#fff0d0', stroke: '#1d1216', strokeWidth: 9,
        fixedScreenSize: true, ...opts,
      });
      l.position.set(x, 1.4, z);
      this.group.add(l);
      this.labels.push(l);
      return l;
    };
    lab('x', AXIS + 4.4, 0, { height: 2.6 });
    lab('y', 0, wz(AXIS / R) - ZS * 4.4, { height: 2.6 });
    // Tucked into the lower-left quadrant so it stays clear of the cos leg,
    // which runs along +x whenever the angle is in the first quadrant.
    lab('(0, 0)', -4.6, wz(-0.19), { height: 1.5, size: 54 });

    // tick marks and their numbers — the graph-paper scale
    const ticks = [[1, '1'], [0.5, '0.5'], [-0.5, '-0.5'], [-1, '-1']];
    for (const [v, text] of ticks) {
      const t1 = this._line(0xfff0d0, 0.65);
      this._setLine(t1, wx(v), -1.1, wx(v), 1.1, 0.02);
      const t2 = this._line(0xfff0d0, 0.65);
      this._setLine(t2, -1.1, wz(v), 1.1, wz(v), 0.02);
      lab(text, wx(v), wz(-0.13), { height: 1.5, size: 54 });
      lab(text, -4.4, wz(v), { height: 1.5, size: 54 });
    }

    // the four cardinal angles, in degrees and radians
    const marks = [
      [0, '0° = 0'], [90, '90° = π/2'], [180, '180° = π'], [270, '270° = 3π/2'],
    ];
    for (const [deg, text] of marks) {
      const a = (deg * Math.PI) / 180;
      lab(text, Math.cos(a) * (R + 9), wz(Math.sin(a) * (R + 9) / R),
        { height: 1.9, size: 60, color: '#9fd8ff' });
    }
  }

  _buildCircle() {
    const pts = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      pts.push(Math.cos(a) * R, 0.03, ZS * Math.sin(a) * R);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.group.add(new THREE.Line(g, new THREE.LineBasicMaterial({
      color: GOLD, transparent: true, opacity: 0.85, toneMapped: false,
    })));

    // A ring of glow so the circle reads from the air.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(R - 0.55, R + 0.55, 96).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.28, toneMapped: false })
    );
    ring.position.y = 0.015;
    this.group.add(ring);

    const rl = new Label('radius = 1', {
      height: 2.0, size: 62, color: '#ffe27a', stroke: '#2a1c06', strokeWidth: 8,
      fixedScreenSize: true,
    });
    rl.position.set(-R * 0.74, 1.2, wz(0.74));
    this.group.add(rl);
    this.labels.push(rl);
  }

  /* --------------------------- the live parts ---------------------------- */

  _buildLiveTriangle() {
    this.vec = this._line(VEC_C, 1);            // radius vector, origin → P
    this.cosLeg = this._line(COS_C, 1, true);   // adjacent
    this.sinLeg = this._line(SIN_C, 1, true);   // opposite
    this.dropX = this._line(0xffffff, 0.35, true);
    this.dropY = this._line(0xffffff, 0.35, true);

    /* THE ARC IS ONE BUFFER, RESIZED BY `drawRange`, NEVER REBUILT.

       It used to dispose its geometry and construct a new one every frame,
       because the arc gets longer as theta sweeps. That is a fresh
       Float32Array, a fresh BufferGeometry and a fresh GPU buffer sixty times a
       second for a line that never exceeds 97 points — so it is allocated at
       full length once and the tail is simply not drawn. `frustumCulled` is off
       (below), which is also what lets the bounding sphere go stale safely. */
    const arcGeo = new THREE.BufferGeometry();
    arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARC_MAX * 3), 3));
    this.arc = new THREE.Line(
      arcGeo,
      new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 1, toneMapped: false })
    );
    this.arc.frustumCulled = false;
    this.group.add(this.arc);

    // the point itself
    this.point = new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 16, 12),
      new THREE.MeshBasicMaterial({ color: VEC_C, toneMapped: false })
    );
    this.point.position.y = 0.9;
    this.group.add(this.point);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(1.9, 16, 12),
      new THREE.MeshBasicMaterial({
        color: VEC_C, transparent: true, opacity: 0.25,
        side: THREE.BackSide, depthWrite: false, toneMapped: false,
      })
    );
    this.point.add(halo);

    /* EVERY ONE OF THESE IS `live`, AND THAT IS LOAD-BEARING.

       These five are rewritten every frame from a float. Through the shared
       label cache that is a texture per distinct value, kept forever: the point
       readout alone measured 972 MB for one lap of the circle and took the tab
       down with it in about four seconds — the crash the Dojo shipped with. The
       reserve string each one passes is the widest it can ever draw, so the
       canvas is allocated once and repainted in place. See `Label`'s `_live`.

       The reserves are the worst case spelled out, not a guess with slack added:
       theta goes to three digits, every trig value can be negative and is fixed
       to two places, and the idle hint is longer than any name plus its radius
       ("Blossom" is the longest kitten). Reserve short and the text clips. */
    const L = (color, stroke, live, size = 66, height = 2.4) => {
      const l = new Label('', {
        height, size, color, stroke, strokeWidth: 9, fixedScreenSize: true, live,
      });
      this.group.add(l);
      this.labels.push(l);
      return l;
    };
    this.lblTheta = L('#ffe27a', '#2a1c06', 'θ = 360°');
    this.lblCos = L('#ffb347', '#2a1c06', 'cos θ = -0.00');
    this.lblSin = L('#8bff9a', '#0e2a12', 'sin θ = -0.00');
    this.lblPoint = L('#7fe3ff', '#0c2733', '( -0.00 , -0.00 )', 72, 2.9);
    this.lblHint = L('#fff0d0', '#1d1216',
      'nobody on the circle — spinning by itself', 56, 1.7);
  }

  /* ------------------------------- board -------------------------------- */

  _buildBoard() {
    this.boardCv = document.createElement('canvas');
    this.boardCv.width = 1280;
    this.boardCv.height = 720;
    this.boardCanvas = this.boardCv;
    this.boardCtx = this.boardCv.getContext('2d');

    /* The board lives in the HUD rather than in the world. A signboard mesh
       has to be squeezed into whatever the camera framing leaves over, and
       the framing here is already tight because the whole diagram has to fit;
       as an overlay it is pixel-crisp, always in frame, and survives the
       screen splitting. `boardCanvas` is picked up by the HUD layer. */
    this._boardAcc = 0;
  }

  /* Approach signage. Sits well outside the circle on the arrival side, so
     it greets you as you fly in and then falls behind the camera once the
     lesson framing takes over — which is exactly when it stops being useful. */
  _buildGate() {
    const l = new Label('THE DOJO OF THE TURNING CIRCLE', {
      height: 4.6, size: 90, color: '#ffe27a', stroke: '#1d1216', strokeWidth: 11,
    });
    l.position.set(0, 11, AXIS + 21);
    this.group.add(l);
    this.labels.push(l);

    const l2 = new Label('walk onto the circle — you are the point', {
      height: 2.6, size: 60, color: '#fff0d0', stroke: '#1d1216', strokeWidth: 9,
    });
    l2.position.set(0, 6.6, AXIS + 21);
    this.group.add(l2);
    this.labels.push(l2);
  }

  /* ------------------------------ update -------------------------------- */

  update(dt, players) {
    // Whoever is standing nearest the circle *line* steers theta — not whoever
    // is nearest the origin, or a player wandering past the middle would yank
    // the angle away from the one deliberately walking the rim.
    let driver = null;
    let bestErr = Infinity;
    for (const p of players) {
      if (p.mount) continue;
      const dx = p.position.x - this.centre.x;
      const dz = p.position.z - this.centre.z;
      const d = Math.hypot(dx, dz);
      if (d < AXIS + 6 && d > 2.5) {
        const err = Math.abs(d - R);
        if (err < bestErr) {
          bestErr = err;
          driver = { p, dx, dz, d };
        }
      }
    }

    this.driver = driver ? driver.p : null;
    if (driver) {
      this.theta = Math.atan2(ZS * driver.dz, driver.dx);
      if (this.theta < 0) this.theta += Math.PI * 2;
      this.playerRadius = driver.d / R;
    } else {
      this.theta += dt * 0.42;
      if (this.theta > Math.PI * 2) this.theta -= Math.PI * 2;
      this.playerRadius = 1;
    }

    const c = Math.cos(this.theta);
    const s = Math.sin(this.theta);
    const px = c * R;
    const pz = ZS * s * R;

    this.point.position.set(px, 0.9, pz);
    this._setLine(this.vec, 0, 0, px, pz, 0.06);
    this._setLine(this.cosLeg, 0, 0, px, 0, 0.05);
    this._setLine(this.sinLeg, px, 0, px, pz, 0.05);
    this._setLine(this.dropX, px, pz, px, 0, 0.04);
    this._setLine(this.dropY, px, pz, 0, pz, 0.04);

    // swept angle arc — written into the buffer built in _buildLiveTriangle
    const steps = Math.min(ARC_MAX, Math.max(2, Math.ceil((this.theta / (Math.PI * 2)) * 96) + 1));
    const ap = this.arc.geometry.attributes.position;
    const ar = R * 0.26;
    for (let i = 0; i < steps; i++) {
      const a = (i / (steps - 1)) * this.theta;
      ap.setXYZ(i, Math.cos(a) * ar, 0.07, ZS * Math.sin(a) * ar);
    }
    ap.needsUpdate = true;
    this.arc.geometry.setDrawRange(0, steps);

    const deg = (this.theta * 180) / Math.PI;
    const half = this.theta / 2;
    this.lblTheta.position.set(Math.cos(half) * ar * 1.45, 1.3, ZS * Math.sin(half) * ar * 1.45);
    this.lblTheta.setText(`θ = ${deg.toFixed(0)}°`);

    // Park the leg labels clear of the triangle they annotate.
    this.lblCos.position.set(px / 2, 1.3, ZS * -3.6 * Math.sign(s || 1));
    this.lblCos.setText(`cos θ = ${c.toFixed(2)}`);

    this.lblSin.position.set(px + 6.4 * Math.sign(c || 1), 1.3, pz / 2);
    this.lblSin.setText(`sin θ = ${s.toFixed(2)}`);

    this.lblPoint.position.set(px * 1.2, 3.4, pz * 1.2);
    this.lblPoint.setText(`( ${c.toFixed(2)} , ${s.toFixed(2)} )`);

    this.lblHint.position.set(0, 2.6, wz(-0.46));
    this.lblHint.setText(
      this.driver
        ? `${this.driver.name} is at ${(this.playerRadius).toFixed(2)} × radius`
        : 'nobody on the circle — spinning by itself'
    );

    this._boardAcc += dt;
    if (this._boardAcc > 1 / 30) {
      this._boardAcc = 0;
      this._drawBoard(c, s, deg);
    }
  }

  /* --------------------------- the wave board ---------------------------- */

  _drawBoard(c, s, deg) {
    const g = this.boardCtx;
    const W = this.boardCv.width;
    const H = this.boardCv.height;
    const rad = this.theta;

    g.clearRect(0, 0, W, H);
    g.fillStyle = '#141026';
    g.fillRect(0, 0, W, H);

    // ---- header ----
    g.fillStyle = '#ffe27a';
    g.font = 'bold 48px Bangers, sans-serif';
    g.textAlign = 'left';
    g.fillText('SIN & COS — THE SAME ANGLE, TWO WAVES', 40, 62);

    // ---- live readout ----
    const rows = [
      ['θ', `${deg.toFixed(1)}°`, '#ffe27a'],
      ['θ in radians', `${rad.toFixed(3)}  (${(rad / Math.PI).toFixed(2)}π)`, '#ffe27a'],
      ['cos θ  →  x', c.toFixed(3), '#ffb347'],
      ['sin θ  →  y', s.toFixed(3), '#8bff9a'],
      ['point on circle', `( ${c.toFixed(2)} , ${s.toFixed(2)} )`, '#7fe3ff'],
      ['cos²θ + sin²θ', (c * c + s * s).toFixed(3), '#ffffff'],
    ];
    g.font = 'bold 27px Nunito, sans-serif';
    rows.forEach(([k, v, col], i) => {
      const y = 122 + i * 40;
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.textAlign = 'left';
      g.fillText(k, 44, y);
      g.fillStyle = col;
      g.font = 'bold 31px Nunito, sans-serif';
      g.textAlign = 'right';
      g.fillText(v, 470, y);
      g.font = 'bold 27px Nunito, sans-serif';
    });

    // ---- the two waves ----
    const gx = 540;
    const gy = 108;
    const gw = W - gx - 50;
    const gh = H - gy - 96;
    const midY = gy + gh / 2;
    const amp = gh / 2 - 14;

    g.strokeStyle = 'rgba(255,255,255,0.14)';
    g.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      const x = gx + (i / 8) * gw;
      g.beginPath(); g.moveTo(x, gy); g.lineTo(x, gy + gh); g.stroke();
    }
    for (const v of [-1, -0.5, 0, 0.5, 1]) {
      const y = midY - v * amp;
      g.beginPath(); g.moveTo(gx, y); g.lineTo(gx + gw, y); g.stroke();
    }

    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.beginPath(); g.moveTo(gx, midY); g.lineTo(gx + gw, midY); g.stroke();

    const curve = (fn, color) => {
      g.strokeStyle = color;
      g.lineWidth = 4;
      g.beginPath();
      for (let i = 0; i <= 240; i++) {
        const a = (i / 240) * Math.PI * 2;
        const x = gx + (a / (Math.PI * 2)) * gw;
        const y = midY - fn(a) * amp;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    };
    curve(Math.cos, '#ffb347');
    curve(Math.sin, '#8bff9a');

    // playhead locked to the angle
    const phx = gx + (rad / (Math.PI * 2)) * gw;
    g.strokeStyle = '#ffe27a';
    g.lineWidth = 3;
    g.setLineDash([8, 7]);
    g.beginPath(); g.moveTo(phx, gy); g.lineTo(phx, gy + gh); g.stroke();
    g.setLineDash([]);

    const dot = (val, color) => {
      const y = midY - val * amp;
      g.fillStyle = color;
      g.beginPath(); g.arc(phx, y, 11, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#141026';
      g.lineWidth = 4;
      g.stroke();
    };
    dot(c, '#ffb347');
    dot(s, '#8bff9a');

    // axis captions
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.font = 'bold 22px Nunito, sans-serif';
    g.textAlign = 'center';
    ['0', 'π/2', 'π', '3π/2', '2π'].forEach((t, i) => {
      g.fillText(t, gx + (i / 4) * gw, gy + gh + 34);
    });
    g.textAlign = 'right';
    g.fillText('+1', gx - 10, midY - amp + 8);
    g.fillText('0', gx - 10, midY + 8);
    g.fillText('-1', gx - 10, midY + amp + 8);

    g.textAlign = 'left';
    g.fillStyle = '#ffb347';
    g.font = 'bold 26px Nunito, sans-serif';
    g.fillText('cos θ', gx + 14, gy + 30);
    g.fillStyle = '#8bff9a';
    g.fillText('sin θ', gx + 100, gy + 30);
  }

  faceCamera(camera) {
    for (const l of this.labels) l.faceCamera(camera);
  }
}

export { R as DOJO_RADIUS };
