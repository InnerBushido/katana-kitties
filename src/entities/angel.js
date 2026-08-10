import * as THREE from 'three';
import { Billboard } from '../core/gfx.js';

/* ---------------------------------------------------------------------------
   Angel cat — what being knocked out looks like between rounds.

   A KNOCKED-OUT KITTEN USED TO HAVE NOTHING TO DO. The round ended, both girls
   were teleported to their marks, and the next card came up: whoever lost spent
   the gap watching a banner. Now the loser gets the sky. She goes pale, wings
   open behind her, a halo pops on over her head, and she can fly anywhere she
   likes until the gong — while her sister, who is still carrying the damage
   that won her the round, is down on the deck hunting rats. The two of them are
   doing completely different things for fifteen seconds, which is the most
   co-op the tournament has ever been.

   THE HALO IS THE DBZ ONE, AND THAT IS THE WHOLE READ. A ring over the head is
   the single most legible "this one is dead" in any cartoon either girl has
   watched, and it costs no art: from this game's fixed three-quarter camera a
   flat torus already IS a halo. Everything else here — the pale wash, the
   wings, the shine — is supporting it.

   IT ALL HAD TO BE LOUDER THAN THE FIRST PASS. That version was a subtle
   blue-white tint, a small halo and a soft sphere, and from the feast camera —
   96 units out, framing a 56-unit deck — she read as an ordinary kitten with
   something white behind her. A state that lasts fifteen seconds and explains
   why one player cannot do anything has to be unmistakable at the distance it
   is actually seen from, not at the distance it was tuned at.

   NO NEW KITTEN ART, which is the same call the hit and KO states made. Both
   live sheets are 4-row turnarounds whose rows have to agree about which way
   the character turns, and one of the two in this project is already unusable
   because its rows don't. So an angel is the SAME drawn cell, washed out, plus
   three pieces of furniture that are not her.
--------------------------------------------------------------------------- */

/**
 * How see-through she is.
 *
 * IT MUST STAY ABOVE `alphaTest`, AND THAT IS THE WHOLE TRICK. The sprite
 * material runs `alphaTest: 0.35`, and three.js tests the fragment alpha
 * *after* `material.opacity` is folded in — so an opacity under 0.35 discards
 * every pixel of the drawing at once and she does not fade, she blinks out.
 * That is the trap the invulnerability flicker is documented against, and it is
 * why the first pass concluded a ghost was impossible here and settled for a
 * tint. It isn't: 0.62 leaves the solid interior of the drawing comfortably
 * above the threshold and genuinely translucent, and the only thing it costs is
 * the outermost ring of anti-aliased edge pixels (source alpha ~0.5, so
 * 0.5 x 0.62 = 0.31, just under) — which tightens her silhouette by a texel and
 * looks, if anything, cleaner.
 */
export const ANGEL_ALPHA = 0.62;

/** Wingspan as a multiple of the kitten's height. */
const WING_K = 1.45;
/** How far behind her the wings sit, in world units, along the camera axis. */
const WING_BACK = 0.5;
/**
 * How far the halo leans toward the camera, in radians.
 *
 * A perfectly flat ring is an ELLIPSE from the fight camera and a LINE from a
 * low one, and the arena has both: the feast rig looks down at 0.56 but the
 * summon and result shots sit much flatter. Leaning it toward whichever camera
 * is drawing guarantees it always reads as a ring, which is the one thing it
 * exists to do. Applied per view in `aim`, like the wings.
 */
const HALO_TILT = 0.42;

export class AngelForm {
  /**
   * @param {?object} art loaded wings atlas ({texture, contentScale, pad}),
   *        or null — a missing sheet costs the wings and nothing else.
   * @param {number} height the kitten's drawn height
   */
  constructor(art, height) {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.height = height;
    this.t = 0;

    if (art?.texture) {
      const quad = height * WING_K / (art.contentScale || 1);
      /* `mirror: false` with a single cell is the one combination that NEVER
         flips — the full-turn path with one cell always picks index 0 and never
         sets `flip`. Exactly what the clan leaders use, and for the same
         reason: these wings are drawn symmetrically from the front, and a pair
         of wings that mirrors as she turns is a pair of wings that visibly
         jumps for no reason a player can see. */
      this.wings = new Billboard(art.texture, {
        cols: 1,
        rows: 1,
        mirror: false,
        width: quad,
        height: quad,
        footOffset: (art.pad ?? 0) * quad,
      });
      this.wings.quad = quad;
      /* BEHIND HER, and it has to be a real depth offset rather than a render
         order. She is a transparent billboard standing at very nearly the same
         depth; `renderOrder` alone leaves the sort deciding frame by frame
         which quad is in front, and the wings strobe through her chest. The
         offset is applied per view in `aim`, because "behind" is a direction
         from the camera and in this game that is the only direction that
         matters. */
      this.wings.mesh.renderOrder = -1;
      this.group.add(this.wings);
    }

    this._buildShine();
    this._buildHalo();
  }

  /**
   * The light around her — a soft disc with slow spokes turning inside it.
   *
   * ADDITIVE AND BILLBOARDED, which is what makes it read as light rather than
   * as a white shape stuck to her back. Both are drawn before she is and write
   * no depth, so she stays crisply in front of her own glow.
   *
   * The texture is drawn on a canvas at load time like every other generated
   * thing in this project — no file, nothing to ship, and a radial gradient is
   * three lines.
   */
  _buildShine() {
    const h = this.height;
    this.shine = new THREE.Group();

    const cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 128;
    const ctx = cv.getContext('2d');
    const grd = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,0.85)');
    grd.addColorStop(0.35, 'rgba(206,236,255,0.42)');
    grd.addColorStop(1, 'rgba(160,205,255,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 128, 128);

    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(h * 3.1, h * 3.1),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(cv),
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    halo.renderOrder = -3;
    this.glowDisc = halo;
    this.shine.add(halo);

    /* Eight tapered spokes, turning slowly. A disc alone is a smudge; the
       spokes are what say "shining" rather than "blurry". One merged geometry,
       so the whole thing is a single draw call.

       SHORT AND FAINT, and the first pass was neither. At 1.75h long and half
       opacity they reached most of a deck tile past her and read as white
       SCRATCHES across the floor rather than as light coming off her — hard
       edges at that length stop looking like glow and start looking like
       geometry. They live inside the radial disc now, which is what gives them
       their soft ends. */
    const spokes = new THREE.BufferGeometry();
    const verts = [];
    const N = 8;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const w = 0.038;
      const r0 = h * 0.45;
      const r1 = h * (i % 2 ? 0.92 : 1.18);
      verts.push(
        Math.cos(a - w) * r0, Math.sin(a - w) * r0, 0,
        Math.cos(a + w) * r0, Math.sin(a + w) * r0, 0,
        Math.cos(a) * r1, Math.sin(a) * r1, 0
      );
    }
    spokes.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    const rays = new THREE.Mesh(spokes, new THREE.MeshBasicMaterial({
      color: 0xdff0ff,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }));
    rays.renderOrder = -2;
    this.rays = rays;
    this.shine.add(rays);

    this.shine.position.y = this.height * 0.55;
    this.group.add(this.shine);
  }

  /**
   * The halo: a bright ring and a fainter one bloomed around it.
   *
   * Geometry rather than art, because a drawn halo would have to be
   * billboarded and would then never read as a circle lying flat — the thing
   * that makes it a halo is that it is a ring seen at an angle.
   */
  _buildHalo() {
    const h = this.height;
    this.halo = new THREE.Group();
    /* Yaw first, then the lean, then the spin — so `aim` can point the ring at
       whichever camera is drawing without fighting the turn in `update`. */
    this.halo.rotation.order = 'YXZ';

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(h * 0.34, h * 0.055, 10, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffd452, transparent: true, opacity: 1,
        depthWrite: false, depthTest: false, toneMapped: false,
      })
    );
    /* `depthTest: false` for the same reason the held star has it: she is a
       transparent billboard and the ring sits at very nearly her own depth, so
       otherwise the sort decides frame by frame whether her ears are in front
       of it and the halo flickers through her head. */
    ring.renderOrder = 12;
    this.ring = ring;
    this.halo.add(ring);

    /* THE BLOOM IS A HALO AROUND THE RING, NOT A DISC WHERE THE HOLE SHOULD
       BE. At a tube radius of 0.13h against a ring radius of 0.34h it was
       nearly 40% of the radius, so the two tori together closed the middle up
       and the whole thing rendered as a solid gold coin — additive blending
       finished the job. The hole is the entire reason a ring reads as a halo.
       0.075h leaves it wide open and still glows. */
    const bloom = new THREE.Mesh(
      new THREE.TorusGeometry(h * 0.34, h * 0.075, 8, 28),
      new THREE.MeshBasicMaterial({
        color: 0xfff0b0, transparent: true, opacity: 0.34,
        blending: THREE.AdditiveBlending,
        depthWrite: false, depthTest: false, toneMapped: false,
      })
    );
    bloom.renderOrder = 11;
    this.bloom = bloom;
    this.halo.add(bloom);

    this.group.add(this.halo);
  }

  /** Wings out, halo on. */
  show() {
    this.group.visible = true;
    this.t = 0;
  }

  hide() {
    this.group.visible = false;
  }

  get on() { return this.group.visible; }

  update(dt) {
    if (!this.group.visible) return;
    this.t += dt;

    /* A POP ON THE WAY IN. She has just been knocked flat and a second later
       she is floating; without a beat of scale on the halo and the shine the
       transition reads as a draw glitch rather than as something happening. */
    const pop = Math.min(1, this.t / 0.45);
    const overshoot = 1 + Math.sin(pop * Math.PI) * 0.35;

    const beat = Math.sin(this.t * 3.4);
    if (this.wings) {
      this.wings.mesh.scale.set(
        (1 + beat * 0.10) * pop,
        (1 - beat * 0.06) * pop,
        1
      );
      this.wings.mesh.rotation.z = beat * 0.05;
    }

    /* CLEAR OF THE HEALTH BAR, which sits at 1.32h. The first pass put the
       halo at 1.26 and the two drew straight through each other — a black bar
       across a gold ring, which reads as a rendering fault rather than as
       either of the two things it is. `Player._updateCombat` hides her bar
       while she is an angel (it says zero and nobody is fighting her), and the
       halo goes above where it used to be anyway so the two can never argue
       again if that ever changes back. */
    this.halo.position.y = this.height * 1.44 + Math.sin(this.t * 1.7) * this.height * 0.035;
    this.halo.rotation.z += dt * 1.1;
    this.halo.scale.setScalar(pop * overshoot);
    this.ring.material.opacity = 0.85 + Math.sin(this.t * 2.6) * 0.15;
    this.bloom.material.opacity = 0.26 + Math.sin(this.t * 2.6) * 0.12;

    this.shine.position.y = this.height * 0.55;
    this.rays.rotation.z += dt * 0.55;
    this.rays.material.opacity = (0.38 + Math.sin(this.t * 1.9) * 0.14) * pop;
    this.glowDisc.material.opacity = (0.72 + Math.sin(this.t * 1.3) * 0.16) * pop;
    this.glowDisc.scale.setScalar(pop * (1 + Math.sin(this.t * 1.3) * 0.05));
  }

  /**
   * Per view: turn everything to the camera and push the wings behind her.
   *
   * Called from `Player.faceCamera`, which already runs once per viewport for
   * exactly this class of problem — see the mount's outward nudge, which is the
   * same computation with the sign the other way round.
   */
  aim(camera, worldPos) {
    const dx = camera.position.x - worldPos.x;
    const dz = camera.position.z - worldPos.z;
    const len = Math.hypot(dx, dz) || 1;

    if (this.wings) {
      this.wings.faceCamera(camera);
      this.wings.position.set(
        -(dx / len) * WING_BACK,
        this.height * 0.30,
        -(dz / len) * WING_BACK
      );
    }

    /* The shine is a flat quad pretending to be light, so it has to face the
       lens squarely — a full quaternion copy, not a yaw, exactly like the
       health bar above her head. */
    this.shine.quaternion.copy(camera.quaternion);

    /* And the halo leans toward whoever is looking, so it is an ellipse from
       every camera in the arena rather than a ring from one and a line from
       the next. The yaw goes in first (see `rotation.order`) and `update` keeps
       spinning it on Z underneath. */
    this.halo.rotation.y = Math.atan2(dx, dz);
    this.halo.rotation.x = -Math.PI / 2 + HALO_TILT;
  }
}
