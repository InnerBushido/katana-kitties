import * as THREE from 'three';
import { STEAL, DBREATH } from '../entities/clanpower.js';

/* ---------------------------------------------------------------------------
   THE TWO ARENA CLAN POWERS, MADE VISIBLE.

     THE MARK. 盗 Steal Mischief chooses somebody and then does nothing for up
     to five seconds, which is the whole move — the press is a promise and the
     hit is the payment. A promise nobody can see is indistinguishable from a
     button that did not work, so whoever was marked wears a ring in the
     THIEF'S colour, and the ring SHRINKS as the window runs out. She can tell
     that she is the one being hunted, by whom, and roughly how long she has to
     stay out of reach — three facts, no numbers, no HUD.

     AND A SIGHT OVER HER HEAD, WHICH IS THE OTHER HALF OF THE SAME REPORT:
     "let's have a target over the player that is targeted with the Steal
     Mischief ability, so that they know they are targeted and able to lose an
     orb if attacked ... keep the 'by their feet' target as well, so we will
     have 2 indicators". TWO, on purpose, and they answer different questions.
     A ring on the deck is where the kitten LOOKING DOWN AT HER OWN FEET reads
     it, and it is the one that survives a crowd; a sight over her head is
     what somebody watching the fight from across the ring sees, and it is the
     one that survives her running behind a stall (`depthTest: false`).

     IT IS THE SAME CHEVRON SENSE MISCHIEF HANGS OVER A BARREL, built rather
     than imported — the arrow is six lines of cone in `Game._updateSeek` and
     a shared constructor for six lines would be further to read than the six.
     One word, one picture: that arrow has meant THE THING YOU ARE LOOKING FOR
     IS HERE since the first island, and a marked sister is a barrel with legs.
     It used to be the Flash Step's eight-bit ring sight, which said "aimed at"
     rather than "found", and shared a drawing with a move that is not this
     one. Asked for by name; see `_rig`.

     IT FADES OUT RATHER THAN VANISHING. "Can have the target above targeted
     person's head fade when it is about to expire, to indicate it is ending."
     The ring under her feet says the same thing by shrinking; the sight says
     it by going out, because a sight that shrank would read as getting further
     away rather than as running out.

     THE INHALE. 息 Dragon Breath spends a second and a half rearing back
     before anything happens, and that pause exists entirely for the other
     kitten: it is her chance to move. Reported after play as not being read at
     all — "we need more indicators that the attack is happening... to warn the
     other players to prepare" — so it is now three things at once, and each of
     them says a different one of the three facts somebody else needs.

       * AIR, DRAGGED IN. A vortex of specks spiralling down out of the sky and
         into her mouth, which is what she is doing and the only part of it a
         drawing can show. It tightens as it fills.
       * THE BALL AT HER MOUTH, swelling and paling towards white as the charge
         completes — WHEN.
       * A RING ROUND HER FEET that closes with it — WHO, for anybody whose eyes
         are on the deck rather than on her face, and the same shape the steal's
         mark uses, so the vocabulary is one vocabulary.

     She also wears a drawn pose FOR THE REAR-BACK (`Player.breathPose`), head
     back and cheeks full, which is the fourth indicator and the only one that
     survives her being behind a stall. It comes off on the frame the flame
     leaves her and she goes back to her ordinary run and idle — a single
     drawn cell held over a second of walking reads as the game having frozen,
     and by then the cone is doing the talking anyway. Everything below is
     drawn from her mouth in world space and does not care which cell of her
     sheet is up.

     THE FLAME. A cone of shards fired from the mouth, which is the same
     drawing a dragon's breath is (`Dragon._updateBreath`) at a kitten's size,
     because it is the same trick: `DBREATH.range` and `DBREATH.spread` are
     authored exactly as a breed's `range` and `spread` are, and the ATTACKS row
     the strike gate reads is derived from those same two numbers. Eighth
     non-negotiable, across two files — what you can see IS the hitbox.

     AND IT IS FIRE, IN HER OWN COLOUR. It shipped as nine flat green lumps and
     the report was that it was hard to see at all. Four things were wrong with
     it, and all four are what separates a flame from a spell: it was ONE FLAT
     COLOUR (fire is pale and hot at its heart and coloured at its edge), it did
     not FLICKER, it did not RISE (hot air goes up — a cone that travels dead
     straight reads as a beam), and it was drawn with ordinary blending, so
     nine shards overlapping came to exactly the brightness of one. It is now
     graded from `DBREATH.hot` through the PLAYER'S colour to a cooling tip,
     jittered per shard, buoyant, and additive — so the middle of the cone,
     where the shards pile up, is the brightest part of it. Her colour rather
     than the clan's is deliberate and was asked for outright: four kittens
     breathing green is four anonymous cones, and the one thing a flame crossing
     the deck should say first is WHOSE it is.

   ------------------------------------------------------------------ WHY HERE

   NOTHING IN THIS FILE IS DRIVEN BY A CALLBACK. It is the argument
   `systems/dodgefx.js` and `systems/crossfx.js` both make at length: `update`
   reads the kitten's own clocks — `stealMarkT`, `stealTarget`, `breathChargeT`,
   `breathFireT` — and derives what should be on screen. A clan power can end
   six ways (it lands, the window runs out, she is knocked out, the round ends
   under her, she is dragged onto an animal, `_clearSpecials` fires) and a
   callback would be one path per ending. The one that got missed would leave a
   ring welded to somebody's head for the rest of the afternoon.

   FLAT RINGS AND SOLID SHARDS, NO BILLBOARDS. Up to four cameras render this
   scene every frame. A hand-turned billboard faces whichever camera asked
   last — edge-on in the other three panes — so everything here is either a
   torus lying flat on the deck or a lump of geometry that looks the same from
   any angle. `dodgefx` solves the same problem with `THREE.Sprite`, which
   three.js turns per camera; either answer is fine, and geometry is cheaper
   than a texture for a shape this simple.
--------------------------------------------------------------------------- */

/** How big the mark is when it lands, and how small it gets before it goes. */
const MARK_R0 = 1.45;
const MARK_R1 = 0.85;
/** How wide the sight over her head is, in world units. MEASURED ON SCREEN IN
 *  THE RING, not reasoned: at 1.5 it came out 20 pixels across in an 800-wide
 *  window against a kitten 38 tall, which is a smudge — the arena camera sits
 *  49 units out with a 38° lens and everything in it is small. 2.1 is about
 *  three quarters of her height and reads from the far corner of the deck. */
const SIGHT_W = 2.1;
/** Where it floats, as a multiple of her drawn height — and there are two,
 *  because there are two things it has to clear.
 *
 *  `Player._updateBars` owns the ladder over a kitten's head: the health bar
 *  at 1.32, the team pennant at 1.62 (with the bar up), the callout at 1.98.
 *  At 1.9 the sight sat ON the bar and at 2.0 it clears it with a gap — both
 *  looked at, in the ring, at the distance the fight is actually watched
 *  from. The pennant is half a unit tall on top of its own 1.62, so a 2v2
 *  needs the extra: two marks in one place in exactly the mode where both
 *  are on is the worst case, not the rare one. */
const HEAD_Y = 2.0;
const HEAD_Y_TEAM = 2.3;
/** The last fraction of the window, over which the sight fades out. Long
 *  enough to read as "going", short enough that most of the mark is solid. */
const SIGHT_FADE = 0.35;
/** Shards in one flame. The dragon uses 26 over 17-20 units; this is a third
 *  the length, so at the dragon's density it would be nine — which is what it
 *  was, and which read as nine lumps rather than as a flame. A dragon's cone is
 *  seen from a long way off and this one is two metres from your face, so it is
 *  drawn at three times the density and the shards are graded, jittered and
 *  additive rather than nine identical blobs. */
const PUFFS = 26;
/** Specks of air dragged into her mouth during the rear-back. Enough to read as
 *  a stream from the other side of the deck; few enough to stay specks. */
const SIPS = 16;
/** How far out the intake starts, in metres. A whole body's width beyond her,
 *  so it is visible around a kitten standing in front of a stall. */
const SIP_R = 3.4;

export class ClanFx {
  constructor(scene) {
    this.scene = scene;
    /** One rig per player INDEX, not per player — a kitten who leaves and
     *  rejoins is the same seat, and a rig keyed on the object would leak one
     *  per rejoin. Same rule `dodgefx` follows. */
    this.rigs = new Map();
    this._m = new THREE.Matrix4();
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    /* Scratch colours, mixed into every frame. Allocating a THREE.Color per
       shard per frame is 26 of them at sixty frames a second, per kitten. */
    this._c = new THREE.Color();
    this._hot = new THREE.Color(DBREATH.hot);
    this._mine = new THREE.Color();
  }

  update(dt, players) {
    for (const p of players ?? []) {
      const r = this._rig(p);
      if (!r) continue;
      this._mark(dt, p, r);
      this._breath(dt, p, r);
    }
  }

  /**
   * Everything back to nothing.
   *
   * A restart must not leave a mark on somebody who is about to be a different
   * player, and the flame must not be left hanging in the air over a deck that
   * no longer has a fight on it. The clocks this polls are all cleared by
   * `Player._clearSpecials`, so this is belt and braces — but the rig belongs
   * to this file and clearing it is this file's job.
   */
  reset() {
    for (const r of this.rigs.values()) {
      r.mark.visible = false;
      if (r.sight) r.sight.visible = false;
      r.flame.visible = false;
      r.gather.visible = false;
      r.sip.visible = false;
      r.foot.visible = false;
      r.flash.visible = false;
    }
  }

  _rig(p) {
    if (!p) return null;
    let r = this.rigs.get(p.index);
    if (r) return r;

    const colour = p.style?.colour ?? 0xffffff;

    /* THE MARK IS IN THE THIEF'S COLOUR, not the victim's and not the clan's.
       Four kittens in a free-for-all can be marking each other at once, and the
       only useful thing a ring round your feet can tell you is WHO. */
    const ringGeo = new THREE.TorusGeometry(1, 0.075, 6, 28);
    ringGeo.rotateX(Math.PI / 2);
    const mark = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: colour, transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
    }));
    mark.renderOrder = 26;
    mark.visible = false;
    this.scene.add(mark);

    /* THE SIGHT OVER HER HEAD IS THE SENSE MISCHIEF CHEVRON. Asked for as:
       "the target that displays above the targeted player head should be the
       same 3D shape we use when using the Sense Mischief ability in the game,
       but instead of sensing Mischief in the world, we are sensing the player
       that has kotodama orbs we can steal." That is the right reading of the
       two moves: Icewhisker's chevron means THE THING YOU ARE LOOKING FOR IS
       HERE, and a marked sister is exactly that — a barrel with legs and eight
       orbs in it. One vocabulary, the same argument the feet ring makes by
       being the same torus the Flash Step's target ring is.

       SO IT IS `Game._updateSeek`'S GEOMETRY, LITERALLY: a five-sided cone
       flipped to point down, turning slowly, in the colour of whoever is
       asking. Sized against `SIGHT_W` rather than against the seek arrow's own
       0.85 — that one hangs over a barrel on an empty hillside and this one
       over a kitten's head in a fight, and the thing that has to stay true is
       how big it is against HER.

       IT REPLACED A SPRITE, WHICH IS WHY THE NO-BILLBOARDS NOTE ABOVE THE
       FEET RING NO LONGER HAS A SECOND HALF. A Sprite is turned by three.js
       during each pane's render, so it faces all four cameras at once and a
       hand-turned quad cannot; a cone has no front, so the question does not
       arise and the split screen gets the same picture for free.

       `depthTest: false`, so being behind a stall does not hide the one thing
       telling her to run. The feet ring keeps its depth test, because a ring
       drawn through the deck would read as being under it. */
    const coneGeo = new THREE.ConeGeometry(SIGHT_W * 0.4, SIGHT_W * 0.86, 5);
    coneGeo.rotateX(Math.PI);
    const sight = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({
      color: colour,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    }));
    sight.renderOrder = 27;
    sight.visible = false;
    this.scene.add(sight);

    /* ORDINARY BLENDING, AND THAT WAS MEASURED RATHER THAN REASONED.
       Additive is the obvious answer for a flame and it was tried first, on the
       argument that shards piling up in the middle of the cone should read
       hotter than the thin edges. On screen it did the opposite of what it
       promised: adding an orange kitten's flame to a sunlit green deck clips
       every channel and the whole cone comes out WHITE — four players' fire all
       the same colour, which is the exact complaint this change exists to fix.
       Eighth non-negotiable, in its smallest form: look at it, do not argue
       about it.

       So the shards are solid, and the heat is drawn rather than summed — pale
       at her mouth, her colour through the body, cooling at the tip. The two
       things that genuinely SHOULD blow out to white, the ball she gathers and
       the muzzle flash, are still additive; they are meant to be the hottest
       thing on screen and they are one object each, so nothing piles up.

       `depthWrite` stays off so the shards do not z-fight each other, and the
       material's own colour is WHITE because the grading is per shard
       (`setColorAt`) and three.js multiplies the two. */
    const flame = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.34, 0),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
        depthWrite: false, toneMapped: false,
      }),
      PUFFS
    );
    flame.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    /* NOT CULLED. The instanced matrices are written every frame and three.js
       culls on the mesh's own bounding sphere, which is the geometry's — one
       shard at the origin. A cone eight units long would be culled the moment
       she turned away from the camera it was measured against. */
    flame.frustumCulled = false;
    flame.visible = false;
    /* setColorAt needs the attribute to exist before the first write, and it
       has to be dynamic because the grade is recomputed as the shards travel. */
    flame.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(PUFFS * 3).fill(1), 3
    );
    flame.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(flame);

    const gather = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.42, 1),
      new THREE.MeshBasicMaterial({
        color: colour, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false, toneMapped: false,
      })
    );
    gather.renderOrder = 25;
    gather.visible = false;
    this.scene.add(gather);

    /* THE AIR SHE IS DRAWING IN. Specks on a vortex that starts a body's width
       out and spirals into her mouth, in her own colour. It is the one part of
       the rear-back that says what she is DOING rather than merely that
       something is charging — asked for as "show air being drawn into the
       players mouth". */
    const sip = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.13, 0),
      new THREE.MeshBasicMaterial({
        color: colour, transparent: true, opacity: 0,
        depthWrite: false, toneMapped: false,
      }),
      SIPS
    );
    sip.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    sip.frustumCulled = false;
    sip.visible = false;
    this.scene.add(sip);

    /* AND A RING ROUND HER FEET, closing as the charge fills. Deliberately the
       same shape and the same flat lie-on-the-deck trick as the steal's mark,
       because a kitten who has learned that a ring on the floor means somebody
       has picked a target should not have to learn a second grammar. This one
       is round HER OWN feet and it is her own colour, which is what separates
       the two at a glance. */
    const footGeo = new THREE.TorusGeometry(1, 0.055, 6, 30);
    footGeo.rotateX(Math.PI / 2);
    const foot = new THREE.Mesh(footGeo, new THREE.MeshBasicMaterial({
      color: colour, transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
    }));
    foot.renderOrder = 26;
    foot.visible = false;
    this.scene.add(foot);

    /* THE MUZZLE. One pale sphere at her mouth on the frames the cone leaves
       her, which is what turns the flame from something that fades up into
       something that GOES OFF. */
    const flash = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.5, 2),
      new THREE.MeshBasicMaterial({
        color: DBREATH.hot, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false, toneMapped: false,
      })
    );
    flash.renderOrder = 27;
    flash.visible = false;
    this.scene.add(flash);

    r = {
      mark,
      /** null with no `document` — headless, and world-check runs there. The
       *  feet ring is geometry and always exists, so the move never loses BOTH
       *  of its indicators: prefer a rule that degrades over one that
       *  vanishes. */
      sight,
      flame,
      gather,
      sip,
      foot,
      flash,
      /** What `colour` was when the rig was built. A seat can be handed a
       *  different kitten between rounds, and everything here is tinted once —
       *  so `_breath` compares and re-tints rather than trusting it. */
      colour,
      seed: Array.from({ length: PUFFS }, (_, i) => ({
        t: i / PUFFS,
        a: Math.random() * Math.PI * 2,
        r: Math.random(),
        s: 0.6 + Math.random() * 0.9,
        /** How fast this shard's own flicker beats, and how fast it corkscrews
         *  out. Per shard, so no two of them pulse together — a cone whose
         *  shards flicker in step reads as one object breathing. */
        f: 18 + Math.random() * 26,
        w: (Math.random() * 2 - 1) * 2.2,
      })),
      sips: Array.from({ length: SIPS }, (_, i) => ({
        t: i / SIPS,
        a: Math.random() * Math.PI * 2,
        y: 0.3 + Math.random() * 1.5,
        s: 0.7 + Math.random() * 0.8,
      })),
      spin: 0,
      breath: 0,
    };
    this.rigs.set(p.index, r);
    return r;
  }

  /** The ring on whoever this kitten has marked. */
  _mark(dt, p, r) {
    const t = p.stealMarked ? p.stealTarget : null;
    if (!t) {
      r.mark.visible = false;
      /* "IF THEY ARE NO LONGER BEING TARGETED, YOU CAN REMOVE THE TARGET." It
         is the same poll `mark` above answers to, so the sight cannot outlive
         the mark by a frame whichever of the six ways the move ended — see the
         WHY HERE note at the top of this file. */
      if (r.sight) r.sight.visible = false;
      return;
    }
    r.spin += dt * 1.6;
    /* IT SHRINKS TOWARDS HER AS THE WINDOW CLOSES, which is the only number
       this move has and the only one worth drawing. Full width is a fresh
       mark; a ring tight round her ankles is half a second left. */
    const left = Math.min(1, Math.max(0, p.stealMarkT / STEAL.window));
    const rad = MARK_R1 + (MARK_R0 - MARK_R1) * left;
    r.mark.visible = true;
    r.mark.position.set(t.position.x, t.position.y + 0.09, t.position.z);
    r.mark.scale.setScalar(rad);
    r.mark.rotation.y = r.spin;
    /* A PULSE, SO IT CANNOT BE MISTAKEN FOR THE PLAYER RING SHE ALWAYS WEARS.
       That one is steady and in her OWN colour; this one beats and is in
       somebody else's. */
    r.mark.material.opacity = 0.55 + Math.sin(r.spin * 3.4) * 0.22;

    if (!r.sight) return;
    /* IT RIDES HER HEAD, NOT A FIXED HEIGHT. `t.height` is per sheet (Ember is
       2.9, Frost 2.85) and a mount or a panda changes where she actually is —
       everything here is in world space off her own position, so the sight
       cannot end up at the ankles of a kitten on a dragon. */
    r.sight.position.set(
      t.position.x,
      t.position.y + (t.height ?? 2.9)
        * (t.teamMark?.visible ? HEAD_Y_TEAM : HEAD_Y),
      t.position.z
    );
    /* A SLOW BOB, so it reads as hovering over her rather than being pinned to
       her. Off the same clock the ring spins on, so the two indicators beat
       together instead of against each other. */
    r.sight.position.y += Math.sin(r.spin * 1.7) * 0.09;
    /* AND IT GOES OUT AS THE WINDOW CLOSES. `left` is the same fraction the
       ring shrinks on, so the two cannot disagree about how long she has. The
       last 35% fades; before that it is solid, because a sight that started
       dimming immediately would read as broken rather than as expiring. */
    const fade = Math.min(1, left / SIGHT_FADE);
    r.sight.visible = fade > 0.02;
    r.sight.material.opacity = 0.95 * fade;
    /* IT TURNS, at the seek arrow's own 2.2 rad/s. A cone seen from one fixed
       side is a triangle and reads as flat; the spin is what says "solid thing
       hanging over her", and matching the world chevron's rate is what makes
       the two register as the same object doing the same job. Off `r.spin`
       like everything else in this rig, so the sight, the ring's pulse and the
       ring's own turn beat together — see the bob above. */
    r.sight.rotation.y = r.spin * 1.375;
    /* AND IT IS IN THE THIEF'S COLOUR, re-asked every frame for the reason
       `_breath` re-asks: a seat keeps its rig and can be handed a different
       kitten between rounds, so a colour set once at build time is a wrong
       colour waiting for the character picker. */
    const mine = p.style?.colour ?? 0xffffff;
    if (r.sight.material.color.getHex() !== mine) r.sight.material.color.setHex(mine);
  }

  /** The inhale, and then the cone. */
  _breath(dt, p, r) {
    const charging = p.breathChargeT > 0;
    const firing = !charging && p.breathFireT > 0;
    if (!charging && !firing) {
      r.flame.visible = false;
      r.gather.visible = false;
      r.sip.visible = false;
      r.foot.visible = false;
      r.flash.visible = false;
      return;
    }

    /* HER COLOUR, AND IT IS ASKED FOR RATHER THAN REMEMBERED. A seat keeps its
       rig for the whole session and can be handed a different kitten between
       rounds; everything here was tinted once, at the frame the rig was built.
       Comparing costs one number and removes a whole class of "why is player
       three breathing player one's fire". */
    const colour = p.style?.colour ?? 0xffffff;
    if (colour !== r.colour) {
      r.colour = colour;
      r.gather.material.color.setHex(colour);
      r.sip.material.color.setHex(colour);
      r.foot.material.color.setHex(colour);
    }
    this._mine.setHex(colour);

    /* A CLOCK OF ITS OWN, for the flicker. `dt` accumulated here rather than a
       global `performance.now()` so that two kittens breathing at once are not
       in lockstep, and so a paused game does not flicker. */
    r.breath += dt;

    /* WHERE HER MOUTH IS. Two thirds of the way up the drawn kitten and a
       little in front of her, which is where a dragon's `mouthOffset` puts the
       start of its cone for the same reason: a flame that leaves from between
       her feet reads as something she is standing in. */
    const fx = Math.sin(p.facing);
    const fz = Math.cos(p.facing);
    const mouth = {
      x: p.position.x + fx * 0.55,
      y: p.position.y + p.height * 0.66,
      z: p.position.z + fz * 0.55,
    };

    if (charging) {
      r.flame.visible = false;
      r.flash.visible = false;
      r.gather.visible = true;
      r.sip.visible = true;
      r.foot.visible = true;
      /* 0 AT THE PRESS, 1 AT THE FLAME. `breathChargeT` counts DOWN, so this
         is the fraction gathered rather than the fraction left — everything
         below swells and brightens into the moment it goes off. */
      const k = 1 - Math.min(1, Math.max(0, p.breathChargeT / DBREATH.charge));

      /* THE BALL. It ends the charge nearly white: the colour is mixed towards
         `DBREATH.hot` as it fills, so the last third of the rear-back looks
         like something that is about to catch rather than something that is
         still growing. */
      r.gather.position.set(mouth.x, mouth.y, mouth.z);
      r.gather.scale.setScalar((0.35 + k * 0.95) * (1 + Math.sin(r.breath * 26) * 0.06 * k));
      r.gather.material.opacity = 0.3 + k * 0.7;
      r.gather.material.color.copy(this._mine).lerp(this._hot, k * 0.8);
      r.gather.rotation.y += dt * 6;
      r.gather.rotation.x += dt * 3;

      /* THE AIR. Each speck runs its own lap from the outside in, and the laps
         get FASTER as the charge fills (`1 + k`), which is the whole read: a
         stream that is visibly accelerating into her is a thing about to
         happen. It spirals rather than falling straight, so it cannot be
         mistaken for the orb rain or for snow. */
      for (let i = 0; i < SIPS; i++) {
        const q = r.sips[i];
        const u = (q.t + r.breath * (1 + k) * 0.65) % 1;  // 0 far out, 1 arrived
        const rad = SIP_R * (1 - u) + 0.12;
        const ang = q.a + u * 5.2;
        this._v.set(
          mouth.x + Math.cos(ang) * rad,
          mouth.y + q.y * (1 - u) * 1.1,
          mouth.z + Math.sin(ang) * rad
        );
        // Fattest halfway in, gone at the mouth — so they are swallowed.
        this._s.setScalar(Math.max(0.001, q.s * (0.4 + k) * Math.sin(u * Math.PI)));
        this._m.compose(this._v, this._q, this._s);
        r.sip.setMatrixAt(i, this._m);
      }
      r.sip.instanceMatrix.needsUpdate = true;
      r.sip.material.opacity = 0.45 + k * 0.5;

      /* THE RING. It closes on her the way the steal's mark closes on its
         victim, and for the same reason: it is the only number the move has. */
      /* `position.y` IS HER FEET — the same assumption the mark above makes,
         and the one the blob shadow's `drop` is measured from. So this rides
         with her when she is in the air rather than being stranded on the deck,
         which is right: it is her ring, not her shadow. */
      r.foot.position.set(p.position.x, p.position.y + 0.1, p.position.z);
      r.foot.scale.setScalar(2.5 - k * 1.4);
      r.foot.material.opacity = 0.35 + k * 0.45 + Math.sin(r.breath * 14) * 0.12;
      r.foot.rotation.y = r.breath * 2.2;
      return;
    }

    r.gather.visible = false;
    r.sip.visible = false;
    r.foot.visible = false;
    r.flame.visible = true;
    const life = Math.max(0, p.breathFireT / DBREATH.fire);
    r.flame.material.opacity = Math.min(1, life * 1.6) * 0.95;

    /* THE MUZZLE, for the first fifth of the flame only. */
    const punch = Math.max(0, (life - 0.8) / 0.2);
    r.flash.visible = punch > 0;
    if (punch > 0) {
      r.flash.position.set(mouth.x, mouth.y, mouth.z);
      r.flash.scale.setScalar(0.6 + (1 - punch) * 1.9);
      r.flash.material.opacity = punch * 0.9;
    }

    for (let i = 0; i < PUFFS; i++) {
      const q = r.seed[i];
      // March each shard out along the cone, wrapping as it reaches the tip.
      const k = (q.t + (1 - life) * 1.3) % 1;
      const reach = k * DBREATH.range;
      const spread = k * DBREATH.spread * DBREATH.range * 0.42 * q.r;
      /* THE SPREAD GOES ACROSS HER, NOT ACROSS THE WORLD — and that is a bug
         `world-check` found rather than a refinement. It was written as a
         straight offset in world x and z, so with a kitten facing due east the
         sideways scatter was added to the SAME axis the cone travels down and
         the drawing reached 9.3 units out of a hit box that stops at 8.5. A
         cone that out-reaches its own hit box is the eighth non-negotiable
         failing in the direction that matters: it draws a flame on somebody it
         cannot hurt. `(fz, -fx)` is her facing turned a quarter turn on the
         deck, so the scatter is now perpendicular by construction and `reach`
         is the whole of the forward distance.

         IT CORKSCREWS AND IT RISES. Both are what a flame does and neither
         touches that reach — the shard orbits the cone's axis (cos across, sin
         up) instead of wandering off it. The lift is quadratic so the root of
         the cone stays on her mouth and only the far end curls up; a linear one
         tilts the whole thing and starts lying about the hit box again. */
      const ang = q.a + k * q.w;
      const px = fz;
      const pz = -fx;
      this._v.set(
        mouth.x + fx * reach + px * Math.cos(ang) * spread,
        mouth.y + Math.sin(ang) * spread * 0.7 + k * k * 1.25,
        mouth.z + fz * reach + pz * Math.cos(ang) * spread
      );
      // Per-shard flicker, on its own beat. Never zero, or a shard pops out.
      const flick = 0.78 + 0.22 * Math.sin(r.breath * q.f + q.a * 3);
      this._s.setScalar(Math.max(0.001, q.s * (0.45 + k * 1.7) * flick * Math.min(1, life * 1.8)));
      this._m.compose(this._v, this._q, this._s);
      r.flame.setMatrixAt(i, this._m);

      /* THE GRADE, WHICH IS THE WHOLE OF WHY IT READS AS FIRE. Pale and hot at
         her mouth, her own colour through the body of it, and cooling towards
         the tip — which under additive blending also means the tip thins out
         instead of ending in a hard edge. Written every frame because `k`
         moves every frame; it is twenty-six colours, and the alternative is a
         cone whose colours are painted on rather than travelling with the
         shards that wear them. */
      /* A SHORT NOSE AND A LONG BODY. The pale part was half the cone at
         first and the whole thing read as white smoke — which is the same
         mistake the blending made, in a second place. A real flame's white is
         the first few inches of it. */
      const heat = Math.max(0, 1 - k * 4.5);              // 1 at the mouth, 0 by a fifth
      const cool = Math.max(0, (k - 0.6) / 0.4);          // 0 until past the middle, 1 at the tip
      this._c.copy(this._mine).lerp(this._hot, heat).multiplyScalar(1 - cool * 0.45);
      r.flame.setColorAt(i, this._c);
    }
    r.flame.instanceMatrix.needsUpdate = true;
    r.flame.instanceColor.needsUpdate = true;
  }
}
