import * as THREE from 'three';
import { Label } from '../core/label.js';

/* ---------------------------------------------------------------------------
   Clan shrine — the animated half of a shrine. The stonework itself is static
   geometry merged into the world mesh (buildShrine); everything here moves,
   because movement is what makes a nine-year-old walk across an island to find
   out what something is.

   Three layers of "come here", at three distances:

     far   a coloured beam standing straight up out of the island, visible from
           the air and through fog
     mid   a hovering crystal turning slowly above the gate, plus the clan's
           name on a board you can read before you commit to the walk
     near  a ring on the ground that lights up when you step into it, and a
           prompt that tells you which button to press

   Without the near layer players stood on top of a shrine not knowing they had
   arrived. Without the far layer they never found one at all.
--------------------------------------------------------------------------- */

const RADIUS = 6.4;

export class ClanShrine {
  constructor(clan, x, y, z) {
    this.clan = clan;
    this.position = new THREE.Vector3(x, y, z);
    /** How close a kitten has to stand to swear the oath. */
    this.radius = RADIUS;
    this.t = Math.random() * Math.PI * 2;
    this.glow = 0;
    this.claimed = false;

    this.group = new THREE.Group();
    this.group.position.set(x, y, z);

    const col = new THREE.Color(clan.color);

    // --- ground ring: the "stand here" marker ---
    const ringGeo = new THREE.RingGeometry(RADIUS - 0.7, RADIUS, 40);
    ringGeo.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: col, transparent: true, opacity: 0.35,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }));
    this.ring.position.y = 1.15;
    this.group.add(this.ring);

    // A second, inner ring that sweeps outward when you're standing in it.
    const pulseGeo = new THREE.RingGeometry(0.9, 1.25, 32);
    pulseGeo.rotateX(-Math.PI / 2);
    this.pulse = new THREE.Mesh(pulseGeo, new THREE.MeshBasicMaterial({
      color: col, transparent: true, opacity: 0,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }));
    this.pulse.position.y = 1.18;
    this.group.add(this.pulse);

    // --- hovering crystal above the gate ---
    const gem = new THREE.OctahedronGeometry(0.95, 0);
    this.crystal = new THREE.Mesh(gem, new THREE.MeshBasicMaterial({
      color: col, toneMapped: false,
    }));
    this.crystal.position.y = 10.4;
    this.group.add(this.crystal);

    const halo = new THREE.OctahedronGeometry(1.5, 0);
    this.halo = new THREE.Mesh(halo, new THREE.MeshBasicMaterial({
      color: col, transparent: true, opacity: 0.28,
      depthWrite: false, toneMapped: false,
    }));
    this.halo.position.y = 10.4;
    this.group.add(this.halo);

    /* --- the beam: how you find this from the next island ---
       Slim, and it STARTS ABOVE THE GATE. A fat column rising from the dais
       washed out the entire shrine at close range — the thing it exists to
       advertise became the thing you couldn't see. It only has to read from a
       long way off, so it's narrow, faint, and begins over the lintel. */
    const BEAM_BASE = 11.5;
    const BEAM_H = 80;
    const beamGeo = new THREE.CylinderGeometry(0.30, 0.62, BEAM_H, 10, 1, true);
    const cols = [];
    const pos = beamGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) + BEAM_H / 2) / BEAM_H;   // 0 at base, 1 at top
      const f = Math.pow(1 - t, 1.5);
      cols.push(col.r * f, col.g * f, col.b * f);
    }
    beamGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.5,
      depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide, toneMapped: false,
    }));
    this.beam.position.y = BEAM_BASE + BEAM_H / 2;
    this.group.add(this.beam);

    // --- the clan's name, readable before you walk over ---
    const hex = `#${clan.color.toString(16).padStart(6, '0')}`;
    this.label = new Label(clan.name.toUpperCase(), { height: 2.0, color: hex, size: 96 });
    this.label.position.y = 13.2;
    this.group.add(this.label);

    this.prompt = new Label('STAND HERE', { height: 1.25, color: '#fff6de', size: 72 });
    this.prompt.position.y = 11.6;
    this.prompt.visible = false;
    this.group.add(this.prompt);
  }

  faceCamera(camera) {
    this.label.faceCamera?.(camera);
    this.prompt.faceCamera?.(camera);
  }

  /** @param players the two kittens, so the shrine can react to being stood in */
  update(dt, players) {
    this.t += dt;

    let inside = false;
    let claimedBy = null;
    for (const p of players) {
      if (p.mount) continue;
      if (Math.hypot(p.position.x - this.position.x, p.position.z - this.position.z) < this.radius) {
        inside = true;
        if (p.clan?.id === this.clan.id) claimedBy = p;
      }
    }
    this.claimed = !!claimedBy;

    // Ease the "you're in it" glow rather than snapping, so brushing the edge
    // doesn't strobe the whole shrine.
    this.glow += ((inside ? 1 : 0) - this.glow) * Math.min(1, dt * 6);

    const g = this.glow;
    this.ring.material.opacity = 0.3 + g * 0.5 + Math.sin(this.t * 2.4) * 0.05;
    this.ring.scale.setScalar(1 + g * 0.03);

    // The inner ring sweeps outward only while someone is standing in it.
    if (g > 0.02) {
      const k = (this.t * 0.9) % 1;
      this.pulse.scale.setScalar(0.9 + k * (RADIUS / 1.1));
      this.pulse.material.opacity = (1 - k) * 0.5 * g;
    } else {
      this.pulse.material.opacity = 0;
    }

    this.crystal.rotation.y = this.t * 0.9;
    this.crystal.rotation.x = Math.sin(this.t * 0.7) * 0.25;
    this.crystal.position.y = 10.4 + Math.sin(this.t * 1.5) * 0.35;
    this.halo.rotation.y = -this.t * 0.5;
    this.halo.position.y = this.crystal.position.y;
    this.halo.scale.setScalar(1 + Math.sin(this.t * 1.9) * 0.09 + g * 0.25);

    this.beam.material.opacity = 0.42 + g * 0.25 + Math.sin(this.t * 1.3) * 0.06;

    // Only nag when someone is close and hasn't joined yet.
    this.prompt.visible = g > 0.35 && !this.claimed;
    if (this.prompt.visible) {
      this.prompt.position.y = 11.6 + Math.sin(this.t * 4) * 0.12;
    }
  }
}
