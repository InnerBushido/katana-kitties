import * as THREE from 'three';
import { voicePath } from '../../core/audio.js';

/* ---------------------------------------------------------------------------
   ROSHI — the realtor. A cat-ified old turtle master on holiday: a stick, a
   turtle shell on his back, sunglasses and a flowered shirt, standing in the
   market under a FOR SALE sign. He is to the islands what Mr. Satan is to the
   arena: a loud grown-up who sells you the thing.

   HIS DRAWING is `ROSHI_SHEET` — gpt_image_2_5 on magenta off the elder's
   sheet, baked by `sprite-bake` (docs/notes/art.md). The canvas drawing below
   is the FALLBACK, shown until the file arrives and forever if it is
   deleted: ninth non-negotiable.
--------------------------------------------------------------------------- */

export const ROSHI_TOWN = { x: 22, z: 30 };
export const ROSHI_TALK_R = 5;
export const ROSHI_HEIGHT = 5.4;
export const ROSHI_SHEET = '/sprites/roshi/roshi.png';
/** MEASURED off the baked 768² sheet: ink from y 14 to 752, so he is 0.961 of
 *  the square tall and his sandals stand 15px (0.0195) off its bottom edge. */
export const ROSHI_INK = 0.961;
export const ROSHI_FOOT = 0.0195;

/* HIS VOICE is Arthur, an ElevenLabs preset (docs/notes/voices.md has the
   row), and every clip is a render of EXACTLY the string beside its id — the
   card and the recording are one string, so they cannot drift. `closed` is
   the narrator describing him, not him talking, and stays a toast. A missing
   clip costs the sound and nothing else. */
export const ROSHI_VOICE = {
  'Ohoho! Looking for a little place of your own, eh?': 'roshi_hello1',
  'Welcome, welcome! Every island comes with a sea view. Ohoho!': 'roshi_hello2',
  'Sunglasses on, prices down! Well... prices sideways.': 'roshi_hello3',
  'A fine choice! Your bridge is growing as we speak!': 'roshi_bought',
  'Ohoho, back on the market it goes!': 'roshi_sold',
};

export const ROSHI_LINES = {
  hello: [
    'Ohoho! Looking for a little place of your own, eh?',
    'Welcome, welcome! Every island comes with a sea view. Ohoho!',
    'Sunglasses on, prices down! Well... prices sideways.',
  ],
  closed: 'Roshi is still on holiday — he opens his shop once the whole town is MISCHIEF-FREE!',
  bought: 'A fine choice! Your bridge is growing as we speak!',
  sold: 'Ohoho, back on the market it goes!',
};

/** The drawing — a placeholder good enough to read at 40 metres. */
function drawRoshi() {
  const W = 256;
  const H = 320;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const ink = '#2a1d14';
  g.lineWidth = 5;
  g.strokeStyle = ink;
  g.lineJoin = 'round';
  const blob = (fill, path) => { g.beginPath(); path(); g.fillStyle = fill; g.fill(); g.stroke(); };
  // the stick
  g.save();
  g.lineWidth = 9;
  g.strokeStyle = '#7a4a22';
  g.beginPath(); g.moveTo(200, 120); g.lineTo(222, 312); g.stroke();
  g.restore();
  // shell, behind
  blob('#3f8a3a', () => g.ellipse(128, 186, 84, 92, 0, 0, Math.PI * 2));
  g.fillStyle = '#2e6a2a';
  for (const [x, y] of [[96, 160], [150, 150], [124, 206], [88, 222], [168, 214]]) {
    g.beginPath(); g.ellipse(x, y, 18, 14, 0, 0, Math.PI * 2); g.fill();
  }
  // body: the flowered shirt
  blob('#ff9a3c', () => g.roundRect(78, 150, 100, 110, 30));
  g.fillStyle = '#ffe36a';
  for (const [x, y] of [[98, 176], [146, 196], [112, 232], [160, 240]]) {
    g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill();
  }
  // legs and feet
  blob('#e8d2b0', () => g.roundRect(92, 252, 26, 44, 10));
  blob('#e8d2b0', () => g.roundRect(138, 252, 26, 44, 10));
  // head: an old white cat
  blob('#f2ece2', () => g.ellipse(128, 104, 62, 56, 0, 0, Math.PI * 2));
  blob('#f2ece2', () => { g.moveTo(76, 80); g.lineTo(84, 30); g.lineTo(112, 62); g.closePath(); });
  blob('#f2ece2', () => { g.moveTo(180, 80); g.lineTo(172, 30); g.lineTo(144, 62); g.closePath(); });
  // the beard
  blob('#ffffff', () => { g.moveTo(92, 128); g.quadraticCurveTo(128, 210, 164, 128); g.closePath(); });
  // sunglasses
  g.fillStyle = '#1a1a1a';
  g.beginPath(); g.roundRect(84, 88, 38, 22, 8); g.fill();
  g.beginPath(); g.roundRect(134, 88, 38, 22, 8); g.fill();
  g.fillRect(120, 94, 16, 5);
  // a nose and a grin
  g.fillStyle = '#ff8fa0';
  g.beginPath(); g.moveTo(122, 116); g.lineTo(134, 116); g.lineTo(128, 124); g.closePath(); g.fill();
  // whiskers
  g.lineWidth = 2.5;
  for (const s of [-1, 1]) {
    for (const k of [0, 1]) {
      g.beginPath();
      g.moveTo(128 + s * 18, 124 + k * 6);
      g.lineTo(128 + s * 58, 118 + k * 12);
      g.stroke();
    }
  }
  // the hand on the stick
  g.lineWidth = 5;
  blob('#f2ece2', () => g.arc(204, 168, 15, 0, Math.PI * 2));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Roshi {
  constructor(game) {
    this.game = game;
    this.sprite = null;
    this.x = ROSHI_TOWN.x;
    this.z = ROSHI_TOWN.z;
    this.y = 0;
    this._said = 0;
  }

  spawn(scene) {
    if (typeof document === 'undefined') return;
    const spot = this.game.world.findOpenSpot?.(ROSHI_TOWN.x, ROSHI_TOWN.z, 3) ?? ROSHI_TOWN;
    this.x = spot.x;
    this.z = spot.z;
    this.y = this.game.world.heightAt(this.x, this.z)?.y ?? 0;
    const mat = new THREE.SpriteMaterial({ map: drawRoshi(), transparent: true, alphaTest: 0.3 });
    this.sprite = new THREE.Sprite(mat);
    this.sprite.scale.set(ROSHI_HEIGHT * 0.8, ROSHI_HEIGHT, 1);
    this.sprite.center.set(0.5, 0.02);
    this.sprite.position.set(this.x, this.y, this.z);
    scene.add(this.sprite);
    // A generated sheet wins, when there is one.
    if (globalThis.location) new THREE.TextureLoader().load(ROSHI_SHEET, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      mat.map = t;
      mat.needsUpdate = true;
      // A square sheet, not the canvas's 4:5; the same height on screen.
      const s = ROSHI_HEIGHT / ROSHI_INK;
      this.sprite.scale.set(s, s, 1);
      this.sprite.center.set(0.5, ROSHI_FOOT);
    }, undefined, () => {});
    this._sign(scene);
  }

  /** A FOR SALE board beside him, so a kitten across the square knows why. */
  _sign(scene) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#f4e3c1';
    g.fillRect(0, 0, 256, 128);
    g.strokeStyle = '#7a4a22';
    g.lineWidth = 10;
    g.strokeRect(5, 5, 246, 118);
    g.fillStyle = '#b8322a';
    g.font = 'bold 44px sans-serif';
    g.textAlign = 'center';
    g.fillText('ISLANDS', 128, 56);
    g.font = 'bold 32px sans-serif';
    g.fillStyle = '#2a1d14';
    g.fillText('FOR SALE', 128, 100);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
    s.scale.set(3.6, 1.8, 1);
    s.center.set(0.5, 0);
    s.position.set(this.x + 2.6, this.y + 3.4, this.z);
    scene.add(s);
    this.signSprite = s;
  }

  near(p) {
    if (!this.sprite) return false;
    return Math.hypot(p.position.x - this.x, p.position.z - this.z) < ROSHI_TALK_R
      && Math.abs(p.position.y - this.y) < 4;
  }

  greet(p) {
    const L = ROSHI_LINES.hello;
    this._line(L[this._said++ % L.length], [p.index]);
  }

  /** One of his fixed lines (`bought`, `sold`), to every seat in `seats`. */
  say(key, seats) {
    this._line(ROSHI_LINES[key], seats);
  }

  /* The toast, and the clip once however many seats read it. NEVER OVER
     ANYBODY: `Audio.speak` is one speaker and cuts whoever is on, and a
     shopkeeper talking over Patchfur or Mr. Satan is worse than silence. */
  _line(text, seats) {
    for (const k of seats) this.game.toast(`ROSHI: ${text}`, k);
    const id = ROSHI_VOICE[text];
    const A = this.game.audio;
    if (!id || !A?.speak || typeof window === 'undefined' || !window.Audio) return;
    const on = A._speaking;
    if (on && !on.paused && !on.ended && !this._clips?.has(on)) return;
    this._voice ??= new Map();
    this._clips ??= new Set();
    let el = this._voice.get(id);
    if (!el) {
      el = new window.Audio(voicePath(id));
      el.preload = 'auto';
      this._voice.set(id, el);
      this._clips.add(el);
    }
    A.speak(el);
  }

  update(dt, players) {
    if (!this.sprite) return;
    // A little holiday sway.
    this._t = (this._t ?? 0) + dt;
    this.sprite.material.rotation = Math.sin(this._t * 1.3) * 0.04;
    // Solid, like Payne: kittens walk round him, not through him.
    for (const p of players) {
      const dx = p.position.x - this.x;
      const dz = p.position.z - this.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.1 && d > 1e-5 && Math.abs(p.position.y - this.y) < 3) {
        p.position.x = this.x + (dx / d) * 1.1;
        p.position.z = this.z + (dz / d) * 1.1;
      }
    }
  }
}
