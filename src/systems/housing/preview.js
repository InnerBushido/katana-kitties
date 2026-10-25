import * as THREE from 'three';
import { ITEM_BY_ID } from './catalog.js';
import { drawItem, fitTo, loadModel } from './models.js';

/* ---------------------------------------------------------------------------
   THE SHOP'S TURNTABLE — the thing under her cursor, turning, before she buys
   it. Richard: "Before placing the furniture, there should be a 3D preview of
   it rotating so the player can see what they are buying."

   ONE SMALL RENDERER FOR EVERY CARD, offscreen, and the frame is copied into
   whichever card asked with `drawImage`. Four turntables would be four WebGL
   contexts on a phone that already has one big one; this is one more, made
   the first time a shop opens and never again. If the browser will not give
   it one (or there is no browser — world-check), `draw` does nothing and the
   card is the list it always was: a rule that degrades.

   THE MODEL IS THE REAL ONE WHEN IT HAS LOADED — the same vendored GLB the
   yard will show, through models.js — and the stand-in until then.
--------------------------------------------------------------------------- */

const W = 200, H = 140;

export class Preview {
  /**
   * @param {(id: string) => THREE.Object3D|null} [builder] the real thing for
   *   an id drawItem only has a stand-in for — the yard's BUILT things (the
   *   koi pond, the onsen ...), which are made by the island, not loaded.
   *   Richard, Oct 2026: they "appear as large cubes in the Build Something
   *   for Yard screen, instead of a cube, should show the 3D object".
   */
  constructor(builder = null) {
    this.builder = builder;
    this.want = new Map(); // index → item id
    this.r = null;
    this.failed = false;
    this.t = 0;
    this.cur = null; // { id, obj }
  }

  show(index, id) { this.want.set(index, id ?? null); }
  hide(index) { this.want.delete(index); }

  _init() {
    if (this.r || this.failed) return !!this.r;
    if (typeof document === 'undefined') { this.failed = true; return false; }
    try {
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      this.r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
      this.r.setSize(W, H, false);
      this.scene = new THREE.Scene();
      this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a6a, 1.6));
      const sun = new THREE.DirectionalLight(0xffffff, 1.4);
      sun.position.set(3, 6, 4);
      this.scene.add(sun);
      this.cam = new THREE.PerspectiveCamera(32, W / H, 0.1, 400);
      this.spin = new THREE.Group();
      this.scene.add(this.spin);
      return true;
    } catch (e) {
      console.warn('[housing] no turntable (no second WebGL context)', e);
      this.failed = true;
      this.r = null;
      return false;
    }
  }

  _set(id) {
    if (this.cur?.id === id) return;
    /* A BUILT one is this card's own mesh, made for it, so its geometry goes
       with it; a model or a stand-in is shared with the yard and is not ours
       to dispose. */
    if (this.cur?.built) this.cur.obj?.traverse((o) => o.geometry?.dispose?.());
    this.spin.clear();
    this.cur = { id, obj: null };
    if (!id) return;
    const it = ITEM_BY_ID[id];
    const put = (obj) => {
      if (this.cur?.id !== id) return;
      this.spin.clear();
      fitTo(obj, it?.size ?? { h: 3 });
      // centre it on the turntable, whatever its pivot
      const box = new THREE.Box3().setFromObject(obj);
      const c = box.getCenter(new THREE.Vector3());
      obj.position.x -= c.x;
      obj.position.z -= c.z;
      this.spin.add(obj);
      this.cur.obj = obj;
      const s = box.getSize(new THREE.Vector3());
      const R = Math.max(s.x, s.y, s.z) * 0.62 + 0.2;
      const d = R / Math.tan((this.cam.fov * Math.PI) / 360) * 1.15;
      this.cam.position.set(0, s.y * 0.55 + d * 0.32, d);
      this.cam.lookAt(0, s.y * 0.45, 0);
    };
    const real = this.builder?.(id);
    if (real) {
      /* AT ITS OWN SIZE: the camera below frames whatever it is handed, and
         `fitTo` would squash a 16-unit treehouse to the 3 a stand-in uses. */
      this.spin.add(real);
      this.cur.obj = real;
      this.cur.built = true;
      const box = new THREE.Box3().setFromObject(real);
      const c = box.getCenter(new THREE.Vector3());
      real.position.x -= c.x;
      real.position.z -= c.z;
      real.position.y -= box.min.y;
      const s = box.getSize(new THREE.Vector3());
      const R = Math.max(s.x, s.y, s.z) * 0.62 + 0.2;
      const d = R / Math.tan((this.cam.fov * Math.PI) / 360) * 1.15;
      this.cam.position.set(0, s.y * 0.55 + d * 0.32, d);
      this.cam.lookAt(0, s.y * 0.45, 0);
      return;
    }
    put(drawItem(id, 2, { cups: 3 }));
    if (it?.model) loadModel(it.model).then((m) => { if (m) put(m); });
  }

  /** Turn and copy the frame into her card's canvas. */
  draw(index, cv, dt) {
    if (!cv || !this.want.has(index)) return;
    const id = this.want.get(index);
    const g = cv.getContext('2d');
    if (!id) { g.clearRect(0, 0, cv.width, cv.height); return; }
    if (!this._init()) return;
    this._set(id);
    this.t += dt;
    this.spin.rotation.y = this.t * 0.9;
    this.r.render(this.scene, this.cam);
    g.clearRect(0, 0, cv.width, cv.height);
    g.drawImage(this.r.domElement, 0, 0, cv.width, cv.height);
  }
}
