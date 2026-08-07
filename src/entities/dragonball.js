import * as THREE from 'three';
import { Label } from '../core/label.js';

/* ---------------------------------------------------------------------------
   The seven dragon balls.

   One on every island, and there are exactly seven islands — that is not a
   coincidence the code should have to rediscover, it is the reason the number
   is seven. `world-check` asserts one per island and no island with two,
   because a pair on the home island and none on the ash island is a hunt that
   ends with two girls flying in circles over a rock.

   THEY ARE PROCEDURAL, not generated art. Every prop in this game is boxes and
   cylinders painted with vertex colours, and a photographic sphere dropped
   into that reads as a sticker. The stars are drawn to a canvas at load time,
   the same trick `label.js` uses for text.

   THEY ADVERTISE THEMSELVES FROM THE AIR. A collectible you cannot see from a
   dragon is a collectible a nine-year-old will never find on an island she has
   already walked over — so each one stands a thin column of amber light, the
   same lesson the clan shrines taught. The column is much thinner and shorter
   than a shrine beam: it has to be findable without competing with the thing
   that grants a buff.
--------------------------------------------------------------------------- */

/** How many there are, and therefore how many islands need one. */
export const BALL_COUNT = 7;

/** How close a kitten has to get. Generous — they are small and they bob. */
export const PICKUP_RADIUS = 3.2;

/**
 * The classic look: amber glass with red stars. Drawn once per star count and
 * shared, because seven textures is seven, but seven textures per ball across
 * a restart is a leak nobody would ever notice until the tenth restart.
 */
const starCache = new Map();

function ballTexture(stars) {
  if (starCache.has(stars)) return starCache.get(stars);
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const g = cv.getContext('2d');

  // Amber body with a lit side, so it reads as glass rather than a flat disc.
  g.fillStyle = '#f2a52a';
  g.fillRect(0, 0, S, S);
  const grad = g.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, 'rgba(255,232,150,0.85)');
  grad.addColorStop(0.45, 'rgba(255,180,60,0.15)');
  grad.addColorStop(1, 'rgba(150,70,10,0.55)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);

  /* Stars sit in a ring, with the odd one in the middle — the arrangement the
     real ones use, and the thing that makes a four-star read as a four-star at
     a glance rather than as "some stars". */
  const drawStar = (cx, cy, r) => {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const rr = i % 2 ? r * 0.45 : r;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
    g.fillStyle = '#d81f26';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = '#7d0f14';
    g.stroke();
  };

  const cx = S / 2;
  const cy = S / 2;
  const r = stars === 1 ? 46 : 26;
  if (stars === 1) {
    drawStar(cx, cy, r);
  } else {
    const ring = stars % 2 === 1 ? stars - 1 : stars;
    const spare = stars - ring;
    for (let i = 0; i < ring; i++) {
      const a = (Math.PI * 2 * i) / ring - Math.PI / 2;
      drawStar(cx + Math.cos(a) * 56, cy + Math.sin(a) * 56, r);
    }
    if (spare) drawStar(cx, cy, r);
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  starCache.set(stars, tex);
  return tex;
}

export class DragonBall {
  /**
   * @param {number} stars 1..7 — which ball this is, and what it looks like
   * @param {object} island the island it belongs to, for the checks
   */
  constructor(stars, x, y, z, island = null) {
    this.stars = stars;
    this.island = island;
    this.taken = false;
    this.position = new THREE.Vector3(x, y, z);
    this.t = Math.random() * 6.28;

    this.group = new THREE.Group();
    this.group.position.set(x, y, z);

    const R = 0.85;
    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(R, 22, 16),
      new THREE.MeshBasicMaterial({ map: ballTexture(stars), toneMapped: false })
    );
    this.ball.position.y = 1.6;
    this.group.add(this.ball);

    // Inner glow, so it still reads at dusk and on the ash island.
    this.halo = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.5, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0xffcf6a, transparent: true, opacity: 0.18,
        side: THREE.BackSide, depthWrite: false, toneMapped: false,
      })
    );
    this.halo.position.y = 1.6;
    this.group.add(this.halo);

    /* The findable-from-the-air column. Deliberately thin and only 22 tall —
       a shrine beam is a landmark you navigate by, this is a hint you notice.
       Sized any bigger and the sky over seven islands is a light show in which
       nothing means anything. */
    const beamGeo = new THREE.CylinderGeometry(0.22, 0.42, 22, 10, 1, true);
    beamGeo.translate(0, 11 + 2.2, 0);
    this.beam = new THREE.Mesh(
      beamGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffcf6a, transparent: true, opacity: 0.30,
        depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      })
    );
    this.group.add(this.beam);

    this.label = new Label(`${stars}★`, {
      height: 0.62, size: 64, color: '#ffe6a8', stroke: '#5a2a06', strokeWidth: 7,
    });
    this.label.position.y = 3.3;
    this.group.add(this.label);
  }

  update(dt) {
    if (this.taken) return;
    this.t += dt;
    this.group.position.y = this.position.y + Math.sin(this.t * 1.7) * 0.28;
    this.ball.rotation.y += dt * 0.9;
    this.beam.material.opacity = 0.22 + Math.sin(this.t * 2.2) * 0.09;
    this.label.position.y = 3.3 + Math.sin(this.t * 1.7) * 0.1;
  }

  faceCamera(camera) {
    if (!this.taken) this.label.faceCamera(camera);
  }

  /** Picked up. Kept in the list so a restart can put it back. */
  take() {
    this.taken = true;
    this.group.visible = false;
  }

  reset() {
    this.taken = false;
    this.group.visible = true;
  }
}
