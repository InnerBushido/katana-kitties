import * as THREE from 'three';

/* ---------------------------------------------------------------------------
   Crisp world-space text. Canvas textures on camera-facing quads — used for
   the axis numbers, angle labels and live readouts in the Unit Circle Dojo.
--------------------------------------------------------------------------- */

const CACHE = new Map();

export function makeLabelTexture(text, opts = {}) {
  const {
    size = 88, color = '#fff6de', stroke = '#1d1216', strokeWidth = 8,
    font = 'Bangers', italic = false, pad = 18,
  } = opts;

  const key = `${text}|${size}|${color}|${stroke}|${strokeWidth}|${font}|${italic}`;
  if (CACHE.has(key)) return CACHE.get(key);

  const measure = document.createElement('canvas').getContext('2d');
  const fontSpec = `${italic ? 'italic ' : ''}${size}px ${font}, sans-serif`;
  measure.font = fontSpec;
  const w = Math.ceil(measure.measureText(text).width) + pad * 2;
  const h = Math.ceil(size * 1.4) + pad * 2;

  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  g.font = fontSpec;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.miterLimit = 2;
  if (strokeWidth > 0) {
    g.strokeStyle = stroke;
    g.lineWidth = strokeWidth;
    g.strokeText(text, w / 2, h / 2);
  }
  g.fillStyle = color;
  g.fillText(text, w / 2, h / 2);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  const out = { texture: tex, aspect: w / h };
  CACHE.set(key, out);
  return out;
}

/**
 * A label that always faces the camera and keeps a constant on-screen size
 * regardless of distance — so it stays readable when the camera pulls back.
 */
export class Label extends THREE.Object3D {
  constructor(text, opts = {}) {
    super();
    const { height = 1.6, fixedScreenSize = false, refDistance = 70 } = opts;
    this.fixedScreenSize = fixedScreenSize;
    /** Camera distance at which the label draws at its authored size. */
    this.refDistance = refDistance;
    this.baseHeight = height;

    const { texture, aspect } = makeLabelTexture(text, opts);
    this.mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: opts.depthTest !== false,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(height * aspect, height), this.mat);
    this.add(this.mesh);
    this.renderOrder = 20;
    this.mesh.renderOrder = 20;
    this._text = text;
    this._opts = opts;
    this._aspect = aspect;
  }

  setText(text) {
    if (text === this._text) return;
    this._text = text;
    const { texture, aspect } = makeLabelTexture(text, this._opts);
    this.mat.map = texture;
    this.mat.needsUpdate = true;
    if (Math.abs(aspect - this._aspect) > 0.001) {
      this._aspect = aspect;
      this.mesh.geometry.dispose();
      this.mesh.geometry = new THREE.PlaneGeometry(this.baseHeight * aspect, this.baseHeight);
    }
  }

  faceCamera(camera) {
    this.mesh.quaternion.copy(camera.quaternion);
    if (this.fixedScreenSize) {
      // Grow with distance so on-screen size stays roughly constant, but
      // clamped: unclamped, a pulled-back camera makes labels swallow the
      // diagram they are annotating.
      const d = camera.position.distanceTo(this.getWorldPosition(_tmp));
      const s = THREE.MathUtils.clamp(d / this.refDistance, 0.45, 1.75);
      this.mesh.scale.setScalar(s);
    }
  }
}

const _tmp = new THREE.Vector3();
