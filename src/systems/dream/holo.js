import * as THREE from 'three';
import { HOLO } from '../../world/simworld.js';

/* ---------------------------------------------------------------------------
   THE SIMULATOR'S OWN SCREENS — panels of light that stand in the world.

   EVERYTHING LIONHEART SHOWS A KITTEN IN HERE IS IN THE WORLD, NOT ON THE
   GLASS. A drill's clock, a pedestal's explanation, the rundown of her orbs:
   all of it is a card hanging in the air in front of her, in the void, in the
   simulator's own cyan. Two reasons, and the second is the one that decided it:

     · it is VR. A hologram you walk up to is what the Dream Dojo is selling;
       a DOM panel over the pane is a menu, and the kittens already have
       plenty of those.
     · FOUR PANES. A card in the world is drawn by every pane that can see it,
       at the size that pane draws it, with no layout to get wrong at 844x390.
       A DOM card per pane is a positioning problem per pane, and the award
       card at the ending is the record of how that goes on a phone.

   ONE CANVAS PER PANEL, REPAINTED IN PLACE, CPU-BACKED. The same three rules
   `core/label.js` learned the expensive way: a canvas per distinct string is
   a leak, `needsUpdate` on the material is a shader recompile, and a GPU-
   backed canvas re-uploaded on a clock that is not vsync is stutter that the
   fps counter cannot see. So a panel is sized once, `set()` repaints only when
   the lines actually differ, and the texture object never changes.
--------------------------------------------------------------------------- */

const css = (hex) => `#${new THREE.Color(hex).getHexString()}`;

/**
 * How bright a hologram is at time `t` — the ONE flicker every holo-figure in
 * the simulator uses.
 *
 * Richard: "The hologram flickering on the clan leaders in the simulation is
 * flickering too fast and hurts to look at". It was a hard blink:
 * `sin(t * 29) > 0.94 ? 0.35 : 0.8` — the opacity jumping 0.45 in ONE frame,
 * 4.6 times a second, on six leaders at once, each on its own phase. The
 * holo-kittens blinked at 4.9 Hz and the Lionheart over the arcade at 5.9 Hz.
 * Three-plus hard flashes a second is exactly the band the photosensitivity
 * guidelines say to stay out of.
 *
 * NOW: a slow breath (~0.2 Hz) and, about every five seconds, one soft dip
 * that fades down and back up over a third of a second. Nothing steps; the
 * steepest it ever changes is ~1.2 opacity a second (the blink was 27 a frame
 * at 60), and `world-check` pins both the slew and the dip count. It still
 * reads as a projection — the dip is what says "light", not "glass".
 *
 * @param {number} t      seconds
 * @param {number} seed   any number; different seeds dip at different times
 * @param {number} hi     the brightest it gets
 * @param {number} depth  how far a full dip takes it down
 */
export function holoFlicker(t, seed = 0, hi = 0.82, depth = 0.2) {
  const breath = 0.5 + 0.5 * Math.sin(t * 1.3 + seed * 1.7);
  const ph = (((t * 0.19 + seed * 0.37) % 1) + 1) % 1;
  const dip = ph < 0.07 ? Math.sin((Math.PI * ph) / 0.07) ** 2 : 0;
  return hi - depth * (0.3 * breath + 0.7 * dip);
}

/**
 * A card of light. `lines` is a list of `{ text, size?, color?, weight? }`
 * (or bare strings), drawn top to bottom and centred.
 */
/** The widest a line may run, as a share of the card. */
const MAX_W = 0.9;
/** The most of the card's height the text may fill before it all shrinks. */
const MAX_H = 0.92;

/**
 * Lay a card's lines out: which words go on which row, at what size.
 *
 * A LINE MAY WRAP. Richard, on the Gallery's cards: "The subtext on the
 * kotodama orbs in the simulator is too small and can't be read. It is okay
 * if the subtext is more than 1 line long and made bigger. Let's focus on
 * readability". Every line used to be ONE row, shrunk to the card's width —
 * "shrink to fit rather than clip" — and the Riposte's 112-character blurb
 * came out at about a sixth of its size. A line marked `wrap` now breaks at
 * spaces into as many rows as it needs at its OWN size; only a single word
 * wider than the card still shrinks.
 *
 * AND THE WHOLE CARD SHRINKS BEFORE ANYTHING IS CLIPPED. If the rows add up
 * taller than the card, every size comes down by the same factor, so the
 * proportions hold and nothing falls off the bottom. A clipped instruction is
 * still a lie. Exported for `world-check`, which hands it a measuring stub.
 */
export function layoutLines(g, items, W, H) {
  const fit = (k) => {
    const unit = (H / 10) * k;
    const rows = [];
    for (const l of items) {
      const s = (l.size ?? 1) * unit;
      const face = l.font ?? (l.jp ? '"Noto Serif JP", serif' : 'Nunito, sans-serif');
      const font = `${l.weight ?? 800} ${s}px ${face}`;
      g.font = font;
      const maxW = W * MAX_W;
      const parts = [];
      if (l.wrap) {
        let cur = '';
        for (const w of String(l.text).split(/\s+/).filter(Boolean)) {
          const next = cur ? `${cur} ${w}` : w;
          if (cur && g.measureText(next).width > maxW) { parts.push(cur); cur = w; } else cur = next;
        }
        if (cur || !parts.length) parts.push(cur);
      } else {
        parts.push(String(l.text));
      }
      parts.forEach((text, i) => {
        g.font = font;
        const mw = g.measureText(text).width;
        // Shrink to fit rather than clip: a clipped instruction is a lie.
        const ft = mw > maxW ? `${l.weight ?? 800} ${s * (maxW / mw)}px ${face}` : font;
        rows.push({ item: l, text, font: ft, h: s, last: i === parts.length - 1, px: mw > maxW ? s * (maxW / mw) : s });
      });
    }
    const gap = unit * 0.28;
    const lead = unit * 0.1;
    const total = rows.reduce((a, r) => a + r.h + (r.last ? gap : lead), 0) - (rows.length ? gap : 0);
    return { rows, gap, lead, total, k };
  };
  let lay = fit(1);
  if (lay.total > H * MAX_H) lay = fit(Math.max(0.3, (H * MAX_H) / lay.total));
  // Wrapping depends on the size, so one more pass settles it.
  if (lay.total > H * MAX_H) lay = fit(lay.k * ((H * MAX_H) / lay.total));
  return lay;
}

export class HoloPanel extends THREE.Object3D {
  /**
   * @param {object} o
   * @param {number} o.w  width in world units
   * @param {number} o.h  height in world units
   * @param {number} [o.px] canvas pixels per world unit
   * @param {number} [o.edge] frame colour
   */
  constructor({ w = 6, h = 3, px = 96, edge = HOLO.cyan, fill = 'rgba(4, 22, 34, 0.80)', depthTest = true } = {}) {
    super();
    this.w = w;
    this.h = h;
    this.edge = edge;
    this.fill = fill;
    const cv = document.createElement('canvas');
    cv.width = Math.round(w * px);
    cv.height = Math.round(h * px);
    this.cv = cv;
    // CPU-backed: see the header, and `Label`'s own note on the measurement.
    this.g = cv.getContext('2d', { willReadFrequently: true });
    this.tex = new THREE.CanvasTexture(cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.mat = new THREE.MeshBasicMaterial({
      map: this.tex, transparent: true, depthWrite: false, depthTest,
      toneMapped: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat);
    this.mesh.renderOrder = 22;
    this.add(this.mesh);
    this._key = null;
    this.t = 0;
  }

  /** Repaint, if (and only if) the content changed. */
  set(lines, edge = this.edge) {
    const key = JSON.stringify([lines, edge]);
    if (key === this._key) return;
    this._key = key;
    const { g, cv } = this;
    const W = cv.width;
    const H = cv.height;
    g.clearRect(0, 0, W, H);
    const r = Math.min(W, H) * 0.08;
    g.fillStyle = this.fill;
    roundRect(g, 6, 6, W - 12, H - 12, r);
    g.fill();
    g.lineWidth = Math.max(3, W * 0.006);
    g.strokeStyle = css(edge);
    g.shadowColor = css(edge);
    g.shadowBlur = 14;
    roundRect(g, 8, 8, W - 16, H - 16, r);
    g.stroke();
    g.shadowBlur = 0;
    // corner ticks, the "this is a HUD element" tell
    g.lineWidth = Math.max(4, W * 0.01);
    const k = Math.min(W, H) * 0.12;
    for (const [x, y, sx, sy] of [[14, 14, 1, 1], [W - 14, 14, -1, 1], [14, H - 14, 1, -1], [W - 14, H - 14, -1, -1]]) {
      g.beginPath();
      g.moveTo(x, y + sy * k); g.lineTo(x, y); g.lineTo(x + sx * k, y);
      g.stroke();
    }
    const items = (lines ?? []).map((l) => (typeof l === 'string' ? { text: l } : l)).filter((l) => l.text != null);
    const lay = layoutLines(g, items, W, H);
    let y = (H - lay.total) / 2;
    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (const r of lay.rows) {
      g.font = r.font;
      const l = r.item;
      g.fillStyle = l.color ? (typeof l.color === 'number' ? css(l.color) : l.color) : '#d8fdff';
      if (l.glow) { g.shadowColor = g.fillStyle; g.shadowBlur = 16; }
      g.fillText(r.text, W / 2, y);
      g.shadowBlur = 0;
      y += r.h + (r.last ? lay.gap : lay.lead);
    }
    this.layout = lay;
    this.tex.needsUpdate = true;
  }

  /** Turn to the lens, about Y only — a card that tips back is a card on a hinge. */
  faceCamera(camera) {
    _e.setFromQuaternion(camera.quaternion, 'YXZ');
    const parentYaw = this.parent ? _e2.setFromQuaternion(this.parent.getWorldQuaternion(_q), 'YXZ').y : 0;
    this.rotation.set(0, _e.y - parentYaw, 0);
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/* ------------------------------ the SIM bar ------------------------------- */

/**
 * The bar over a kitten's head that exists only in here.
 *
 * NOT HER HEALTH. Her real health is the ring's, and non-negotiable 3 says
 * nothing outside a live round may touch it. A hologram that hits her drains
 * THIS, and at zero the simulator catches her and puts her back at the start
 * of what she was doing — so "hit" means something without anything being
 * hurt. Richard: "If fighting tougher opponents, they have health bar, if
 * weaker (3 hits or less to defeat) probably no health bar needed" — and the
 * same bar, red instead of green, is what a tough hologram wears.
 */
export class SimBar extends THREE.Object3D {
  constructor({ w = 2.4, h = 0.26, color = HOLO.green, back = 0x08131c } = {}) {
    super();
    this.w = w;
    const mk = (c, o, ro) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
        color: c, transparent: true, opacity: o, depthWrite: false, depthTest: false, toneMapped: false,
      }));
      m.renderOrder = ro;
      return m;
    };
    this.back = mk(back, 0.8, 30);
    this.back.scale.set(w + 0.12, h + 0.12, 1);
    this.fillM = mk(color, 0.95, 31);
    this.fillM.scale.set(w, h, 1);
    this.ghost = mk(0xffffff, 0.55, 30.5);
    this.ghost.scale.set(w, h, 1);
    this.add(this.back, this.ghost, this.fillM);
    this.frac = 1;
    this.ghostFrac = 1;
  }

  setFrac(f, dt = 0) {
    this.frac = THREE.MathUtils.clamp(f, 0, 1);
    // The white trail that drains after the bar: how much that hit cost.
    this.ghostFrac = Math.max(this.frac, this.ghostFrac - dt * 0.6);
    const place = (m, k) => {
      m.scale.x = Math.max(1e-3, this.w * k);
      m.position.x = -this.w / 2 + (this.w * k) / 2;
    };
    place(this.fillM, this.frac);
    place(this.ghost, this.ghostFrac);
  }

  faceCamera(camera) {
    // Local = parent's world inverse * camera, so a rotated parent cannot
    // turn the bar off square (the stall-sign lesson in `Label.faceCamera`).
    if (this.parent) this.parent.getWorldQuaternion(_q).invert();
    else _q.identity();
    this.quaternion.copy(_q).multiply(camera.quaternion);
  }
}

const _e = new THREE.Euler();
const _e2 = new THREE.Euler();
const _q = new THREE.Quaternion();
