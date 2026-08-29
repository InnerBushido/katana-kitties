import * as THREE from 'three';
import { Billboard } from '../core/gfx.js';
import { bubbleTexture } from './leader.js';
import { poseQuad } from './critter.js';

/* ---------------------------------------------------------------------------
   MR. SATAN — the champion, the announcer, and the joke.

   He is drawn as a cat because everybody in this world is a cat, and the
   sight gag is the point: a burly tabby in a gi with a championship belt and
   a moustache, arms folded, absolutely certain he is the strongest thing on
   the islands. Nothing he says is ever quite true and none of it matters,
   which is exactly what the tournament needed — a voice that can shout about
   a fight without the game having to mean it.

   HE IS NOT A `ClanLeader`, though he is built the same way. That class is
   welded to a clan, a shrine, a dais and an oath, and he has none of the
   four: he stands in the town square, moves to the arena when the tournament
   opens, and cannot be sworn to. What he DOES share is the speech bubble,
   imported rather than reimplemented — a character speaking to you in the
   world should look the same doing it whoever they are.

   FRONT-FACING SINGLE CELL, `mirror: false`. The one combination that never
   flips: with a single cell the full-turn path always picks index 0 and never
   sets `flip`. He has a belt buckle and a cape over one shoulder, so a mirror
   would be as obvious on him as it is on a leader with a sash.
--------------------------------------------------------------------------- */

/** Drawn height in world units. A kitten is 2.9; a clan leader is 4.2. He is
 *  the biggest person in the game, because he would want to be. */
const SATAN_HEIGHT = 4.6;

/** How close a kitten has to be before he says anything. */
export const SATAN_RADIUS = 9;

export class MrSatan {
  /**
   * @param {object} art atlas from loadSpriteAtlas
   * @param {{x:number,y:number,z:number}} at where he stands to begin with
   */
  constructor(art, at) {
    this.group = new THREE.Group();
    this.position = new THREE.Vector3(at.x, at.y, at.z);
    this.group.position.copy(this.position);
    this.art = art;

    const quad = SATAN_HEIGHT / (art.contentScale || 1);
    this.quad = quad;
    this.sprite = new Billboard(art.texture, {
      cols: 1,
      rows: 1,
      width: quad,
      height: quad,
      footOffset: (art.pad ?? 0) * quad,
      mirror: false,
    });
    this.group.add(this.sprite);

    const sg = new THREE.CircleGeometry(1.0, 18);
    sg.rotateX(-Math.PI / 2);
    this.shadow = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({
      color: 0x2a1830, transparent: true, opacity: 0.34, depthWrite: false,
    }));
    this.group.add(this.shadow);

    this.bubble = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0, depthWrite: false, depthTest: false,
        toneMapped: false, side: THREE.DoubleSide,
      })
    );
    this.bubble.renderOrder = 24;
    this.bubble.visible = false;
    this.group.add(this.bubble);

    this.t = Math.random() * Math.PI * 2;
    this.show = 0;
    this.line = '';
    this._lineSet = null;

    /** 'idle' | 'charge'. Only ever anything but 'idle' while
     *  `systems/satanblast.js` has him winding up. */
    this.pose = 'idle';
    this.chargeSprite = null;
  }

  /**
   * Give him a second drawing: arms up, charging.
   *
   * A SECOND BILLBOARD RATHER THAN A SECOND ROW OF THE FIRST SHEET. The two
   * images are separate files generated months apart, and packing them into
   * one atlas would mean re-measuring the sheet the eighth non-negotiable says
   * must be measured — the existing one is a single front-facing cell with
   * `mirror: false`, which is the one combination that is known never to flip,
   * and putting a second cell beside it changes that. Two quads at the same
   * position with one visible costs nothing and cannot move his face.
   *
   * SIZED OFF ITS OWN ATLAS, NOT OFF HIS. `contentScale` and `pad` are
   * measured per sheet by `loadSpriteAtlas`; reusing his numbers here would
   * draw the new pose at whatever height the old drawing's proportions imply,
   * which is exactly the reasoned-rather-than-measured mistake the eighth
   * non-negotiable is about.
   *
   * @param {object|null} art atlas from loadSpriteAtlas, or null to do nothing
   */
  setChargeArt(art) {
    if (!art || this.chargeSprite) return;
    /* MEASURED AGAINST HIS IDLE SHEET BY INK AREA, NOT BY HEIGHT — the exact
       trap `spritesheet.js` documents under `contentArea` and `critter.js`
       solved for the rabbit. `contentScale` says how far up its cell a drawing
       reaches, so sizing on it makes every pose the same HEIGHT: this one has
       his arms straight up, so equalising heights would shrink the cat until
       his raised fists were level with the top of his idle head, and he would
       visibly shrink the instant he started charging. `poseQuad` scales the
       second drawing to cover the same amount of ink as the first, which is
       what "the same character" means when the character has two poses.

       This is why the aura the first generation came back with had to go. It
       was lovely and it was several times the ink of the cat inside it, so it
       would have shrunk him by that ratio. The gathering ball in
       `systems/satanblast.js` is the glow now, and it is drawn rather than
       painted — so it can be tuned without regenerating a sprite. */
    const quad = poseQuad(SATAN_HEIGHT, this.art, art);
    this.chargeSprite = new Billboard(art.texture, {
      cols: 1,
      rows: 1,
      width: quad,
      height: quad,
      footOffset: (art.pad ?? 0) * quad,
      mirror: false,
    });
    this.chargeSprite.visible = false;
    this.group.add(this.chargeSprite);
  }

  /**
   * Swap between his ordinary pose and the charging one.
   *
   * A NO-OP WITH NO CHARGE ART, AND THAT IS THE POINT. `public/sprites/` can be
   * deleted down to nothing and the game still runs (ninth non-negotiable);
   * this file already survives `satanArt` being null, and the charge pose is a
   * strictly smaller promise than that. Called unconditionally by the blast so
   * there is no second place that has to remember whether the drawing exists.
   *
   * @param {'idle'|'charge'} pose
   */
  setPose(pose) {
    this.pose = pose === 'charge' && this.chargeSprite ? 'charge' : 'idle';
    const charging = this.pose === 'charge';
    this.sprite.visible = !charging;
    if (this.chargeSprite) this.chargeSprite.visible = charging;
  }

  /** Move him — used when the tournament opens and he goes to his box. */
  moveTo(x, y, z) {
    this.position.set(x, y, z);
    this.group.position.copy(this.position);
  }

  /**
   * What his bubble says. Setting the same line twice is free.
   *
   * The texture is rebuilt on change, which is why the guard matters: this is
   * called every frame from the quest state machine, and re-rasterising a
   * canvas at 60Hz to draw the same sentence would cost more than everything
   * else in this file put together.
   */
  setLine(text) {
    if (text === this._lineSet) return;
    this._lineSet = text;
    this.line = text;
    if (!text) return;
    const { texture, aspect } = bubbleTexture(text, '#f5c341');
    const BH = 3.2;
    this.bubble.geometry.dispose();
    this.bubble.geometry = new THREE.PlaneGeometry(BH * aspect, BH);
    this.bubble.material.map?.dispose();
    this.bubble.material.map = texture;
    this.bubble.material.needsUpdate = true;
  }

  faceCamera(camera) {
    this.sprite.faceCamera(camera);
    /* BOTH, ALWAYS, EVEN THE HIDDEN ONE. Turning only the visible quad means
       the frame the pose swaps on draws a billboard still square to whatever
       camera last saw it — which in split screen is the OTHER player's camera,
       so he flashes edge-on for one frame in one pane. Turning a hidden quad
       costs a quaternion copy. */
    this.chargeSprite?.faceCamera(camera);
    // The bubble faces the viewer squarely rather than turning on Y only —
    // text seen edge-on at a steep camera pitch is unreadable.
    this.bubble.quaternion.copy(camera.quaternion);
  }

  /**
   * @param {number} dt
   * @param {Player[]} players  pass an empty array to suppress the bubble,
   *        which is what the scenes do — his recorded line and his world
   *        bubble are different sentences, and two blocks of unrelated text
   *        on screen at once is clutter. Same rule the leaders follow.
   */
  update(dt, players) {
    this.t += dt;

    const near = players.some(
      (p) => Math.hypot(p.position.x - this.position.x, p.position.z - this.position.z) < SATAN_RADIUS
    );
    const want = near && this.line ? 1 : 0;
    this.show += (want - this.show) * Math.min(1, dt * 5);
    this.bubble.visible = this.show > 0.02 && !!this.line;
    this.bubble.material.opacity = this.show;
    this.bubble.position.y = this.quad * 0.92 + 1.6 + Math.sin(this.t * 1.6) * 0.16;
    this.bubble.scale.setScalar(0.7 + this.show * 0.3);

    /* A bigger, slower breath than a kitten's. He is a heavy character and
       he is posing; the swagger is most of the joke and it costs one sine. */
    const breathe = Math.sin(this.t * 1.5) * 0.022;
    this.sprite.mesh.scale.set(1 - breathe, 1 + breathe, 1);
    this.shadow.scale.setScalar(1 + breathe * 0.4);

    /* CHARGING IS A SHUDDER, NOT A BREATH. He is holding something in; the
       swagger sine is the wrong shape for it and half the read of the pose is
       that it is straining. Four times the rate and three times the depth off
       the same clock, so it costs one more sine and no new state. */
    if (this.chargeSprite?.visible) {
      const shake = Math.sin(this.t * 26) * 0.05;
      this.chargeSprite.mesh.scale.set(1 - shake, 1 + shake, 1);
    }
  }
}
