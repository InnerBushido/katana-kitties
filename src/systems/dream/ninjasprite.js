import * as THREE from 'three';
import { Billboard } from '../../core/gfx.js';
import { recolourAtlas } from '../../core/spritesheet.js';
import { PLAYER_STYLE } from '../../core/palette.js';
import { NINJA_ATLAS } from './ninjaclips.js';
import { sheetFix, clipPoseFix } from '../../core/spritefix.js';

/* ---------------------------------------------------------------------------
   ONE ATLAS PER CHARACTER, MANY CLIPS IN IT — Bamboo Infiltration's drawings.

   Richard: "Is there a way to combine all actions into 1 sprite sheet like we
   do for Ember/Frost sprite atlas ... lets make sure we are using the sprite
   sheets and atlasing to the fullest". So every action was generated as its
   own sheet (one per action is what the model can hold to a grid), and
   tools/ninja-atlas.mjs MEASURES and packs all of a character's sheets into
   one 2040-square texture, with a manifest of where each clip sits
   (ninjaclips.js, generated). A clip is `dirs` rows of `frames` cells:

     4 directions — front, RIGHT profile, back, LEFT profile
     8 directions — front, then clockwise: front-right, right, back-right,
                    back, back-left, left, front-left (the kittens' crawl)

   which is the order every row was asked for in and then checked in the
   packer's proof image (out/bake/ninja_<id>.png). NOTHING IS MIRRORED at
   draw time: a mirror swaps Ember's tail and the archer's bow hand, and these
   sheets have a drawing for every side. (The archer's LEFT shooting row IS a
   mirror — of his own right row, baked in by the packer, because the model
   drew him standing still in it twice. See the tool's header.)

   WHICH ROW: `rel = facing - camAngle`, wrapped. rel 0 is facing the lens,
   and sin(rel) > 0 points her toward screen-RIGHT — the convention every
   Billboard in the game uses (gfx.js `faceCamera`). So the row index runs
   with rel, positive toward the right profile, and `round(rel / step)`
   picks the nearest drawn side.

   THE QUAD IS SIZED OFF HER STANDING HEIGHT, not the cell: `stand` is how
   many pixels her standing frame is in a cell, so a cell is `cell / stand`
   of her height and every clip — the crawl, the hang, the hands up — draws
   her at the size she is. Feet sit `pad` up from the cell's bottom, which is
   where the packer stood every feet-aligned clip; a TOP-aligned clip (the
   rope) is hung by its highest paw `pad` down from the cell's top, and the
   quad is dropped so that paw line is the billboard's origin.
--------------------------------------------------------------------------- */

/** One ninja character's drawing, playing one clip at a time. */
export class ClipSprite extends Billboard {
  /**
   * @param {THREE.Texture} texture   the packed atlas
   * @param {object} man              its NINJA_ATLAS entry
   * @param {number} height           her standing height, world units
   */
  constructor(texture, man, height) {
    const S = height * man.cell / Math.max(1, man.stand);
    super(texture, { cols: man.cols, rows: man.rows, width: S, height: S, mirror: false, footOffset: man.pad * S });
    this.man = man;
    this.S = S;
    this.H = height;
    /** The facing row drawn last (`faceCamera`): whose frame order counts the steps between draws. */
    this.dirRow = 0;
    this.clip = null;
    this.clipT = 0;
    this.setClip(Object.keys(man.clips)[0]);
  }

  /** Play clip `name` from `t` seconds in (frames are `t * fps`). */
  setClip(name, t = 0) {
    const c = this.man.clips[name];
    if (!c) return false;
    if (c !== this.clip) {
      this.clip = c;
      this.clipName = name;
    }
    this._hang();
    this.clipT = t;
    return true;
  }

  /** `ninja/ember:mount` — the key this clip's fixes are saved under. */
  get clipId() { return `${NINJA_ID.get(this.man) ?? '?'}:${this.clipName}`; }

  /* THE ROPE HANGS FROM HER PAWS. Its frames were stood on their highest
     paw `pad` from the cell's top; this drops the quad so that line is the
     origin — the rope — instead of her feet. Then the sprite editor's size
     and height for the clip (`clipPoseFix`): scaled about that same origin,
     so a bigger rope clip still hangs from the rope, and lifted in her
     heights. Every draw, not once per clip — the editor moves the draft under
     a live sprite, and this is two multiplies. */
  _hang() {
    const c = this.clip;
    const f = clipPoseFix(this.clipId);
    this.mesh.scale.set(f.s, f.s, 1);
    this.mesh.position.y = (c.align === 'top' ? -this.S * (1 - 2 * this.man.pad) * f.s : 0) + f.y * this.H;
  }

  /* THE SPRITE EDITOR'S FRAME ORDER (spritefix.js, key `ninja/ember:sneak`, or `...:sneak@2` for one
     facing): which drawn frame each step of the clip is, and which steps are mirrored. Asked on every
     read rather than cached, because the editor changes the draft under a live sprite and the game's
     file never changes in a build. */
  get clipFix() {
    return sheetFix(this.clipId, this.clip.frames, undefined, this.dirRow);
  }

  /** How many steps the clip plays: its drawn frames, or the saved order's length. */
  get clipFrames() { return this.clipFix?.order.length ?? this.clip.frames; }

  /** The step `clipT` lands on: looped, or held on the last. */
  get clipFrame() {
    const c = this.clip;
    const n = this.clipFrames;
    const f = Math.floor(this.clipT * c.fps);
    return c.loop ? ((f % n) + n) % n : Math.min(n - 1, Math.max(0, f));
  }

  /** Is a one-shot clip over? */
  get clipDone() {
    return !this.clip.loop && this.clipT * this.clip.fps >= this.clipFrames;
  }

  faceCamera(camera) {
    this.getWorldPosition(_wp);
    const camAngle = Math.atan2(camera.position.x - _wp.x, camera.position.z - _wp.z);
    this.mesh.rotation.y = camAngle;
    // the facing first: each has its own frame order, and so its own count of steps
    this.dirRow = dirIndex(this.facing - camAngle, this.clip.dirs);
    this._hang();
    const step = this.clipFrame;
    const fix = this.clipFix;
    const drawn = fix ? fix.order[step] : step;
    this._setCell(this.clip.col + drawn, this.clip.row + this.dirRow, !!fix?.flip.includes(step));
  }
}

/* A manifest entry -> its sheet's id. By ENTRY, not by texture: Storm wears a recoloured copy of
   Ember's atlas and the same manifest, so she wears Ember's frame orders, like every other fix. */
const NINJA_ID = new Map(Object.entries(NINJA_ATLAS).map(([id, man]) => [man, `ninja/${id}`]));

/**
 * Which drawn side of `dirs` best matches `rel` (facing minus the lens's
 * bearing): 0 facing the lens, counting toward the RIGHT profile. Exported
 * so world-check asks the same function the drawing does.
 */
export function dirIndex(rel, dirs) {
  const step = (Math.PI * 2) / dirs;
  let r = Math.atan2(Math.sin(rel), Math.cos(rel));
  if (r < 0) r += Math.PI * 2;
  return Math.round(r / step) % dirs;
}

const _wp = new THREE.Vector3();

/** The loaded texture for one packed atlas, already keyed on transparent. */
function loadTex(url) {
  return new THREE.TextureLoader().loadAsync(url).then((t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
}

/**
 * EVERY NINJA DRAWING, loaded ONCE, on the first walk onto the island
 * (`BambooInfiltration`), never at boot: four 2040-square atlases an afternoon
 * that never goes near the bamboo has no reason to download.
 *
 * `kittens[style]` is per STYLE, never per slot — Storm and Blossom are
 * Ember's and Frost's sheets through the same recolour their turnarounds
 * get (palette.js PLAYER_STYLE), the rule main.js writes out nine times.
 *
 * EVERY FILE DEGRADES. A missing kitten atlas leaves her in her ordinary
 * drawing (no crawl, no hang — she still sneaks, and the noise ring still says
 * so); a missing guard atlas falls back to a tinted figure built from the
 * nearest drawing the game always has. Nothing here can stop the course.
 */
export function loadNinjaArt() {
  if (_load) return _load;
  const one = (id) => loadTex(`/sprites/ninja/${id}.png`).then((t) => (t?.image ? t : null)).catch(() => null);
  _load = Promise.all(['ember', 'frost', 'samurai', 'archer'].map(one)).then(([ember, frost, samurai, archer]) => {
    const base = { ember, frost };
    const kittens = PLAYER_STYLE.map((s) => {
      const t = base[s.sheet];
      if (!t) return null;
      const tex = s.recolour ? recolourAtlas({ texture: t }, s.recolour).texture : t;
      return { texture: tex, man: NINJA_ATLAS[s.sheet] };
    });
    const art = {
      kittens,
      samurai: samurai ? { texture: samurai, man: NINJA_ATLAS.samurai } : null,
      archer: archer ? { texture: archer, man: NINJA_ATLAS.archer } : null,
    };
    console.log(`[art] ninja atlases → ${[ember, frost, samurai, archer].filter(Boolean).length}/4`);
    return art;
  });
  return _load;
}
let _load = null;
