import * as THREE from 'three';

/* ---------------------------------------------------------------------------
   Crisp world-space text. Canvas textures on camera-facing quads — used for
   the axis numbers, angle labels and live readouts in the Unit Circle Dojo.
--------------------------------------------------------------------------- */

const CACHE = new Map();

/* HOW MANY TEXTURE PIXELS PER AUTHORED PIXEL.

   THE GLYPHS WERE DRAWN 1:1 AND THAT IS WHY EVERY PIECE OF WORLD TEXT LOOKED
   SOFT. `size` is an authored height in canvas pixels, and the quad it lands on
   is sized in WORLD units — so how many screen pixels a label actually covers
   depends on the camera, not on `size`. Standing next to a clan leader, or
   reading the Dojo's axis numbers on a phone at devicePixelRatio 3, the texture
   is magnified well past 1:1 and the browser has nothing left to sample.

   Supersampling is the whole fix: draw at SS times the size, keep the mesh
   exactly as big, and let the mipmap chain handle the minified case. Nothing
   about the quad's world size changes, so no caller moves.

   3 rather than 2, because 2 is still visibly soft against a 3x panel — and
   these textures are small. A long label at size 88 is roughly 700x150, so 3x is
   about 1.2MB before mipmaps, and there are a few dozen of them at most. That is
   a rounding error next to one dragon sheet at 16MB. */
const SS = 3;

export function makeLabelTexture(text, opts = {}) {
  const {
    size = 88, color = '#fff6de', stroke = '#1d1216', strokeWidth = 8,
    font = 'Bangers', italic = false, pad = 18,
  } = opts;

  const key = `${text}|${size}|${color}|${stroke}|${strokeWidth}|${font}|${italic}`;
  if (CACHE.has(key)) return CACHE.get(key);

  /* Measured at the AUTHORED size and then scaled, rather than measured at the
     supersampled size. Both give the same aspect, but measuring small and
     multiplying keeps `aspect` bit-identical to what it was before
     supersampling existed — and `aspect` is what sizes the quad, so a drift here
     would silently resize every label in the game. */
  const measure = document.createElement('canvas').getContext('2d');
  const fontSpec = `${italic ? 'italic ' : ''}${size}px ${font}, sans-serif`;
  measure.font = fontSpec;
  const w = Math.ceil(measure.measureText(text).width) + pad * 2;
  const h = Math.ceil(size * 1.4) + pad * 2;

  const cv = document.createElement('canvas');
  cv.width = w * SS;
  cv.height = h * SS;
  const g = cv.getContext('2d');
  /* One scale on the context and every coordinate below stays in authored
     units — so the drawing code is untouched and cannot disagree with the
     measurement above. */
  g.scale(SS, SS);
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
  /* 8, not 4: these quads are read at a slant whenever the camera is not square
     to them, which for a label standing in the world is most of the time. */
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  /* `aspect` is deliberately the AUTHORED ratio, not the canvas ratio. They are
     equal — SS scales both axes — and saying so here is what stops somebody
     "fixing" it to `cv.width / cv.height` and getting the same number by luck. */
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
