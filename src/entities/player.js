import * as THREE from 'three';
import { Billboard } from '../core/gfx.js';
import { PANDA_SPEED, PANDA_JUMP } from './panda.js';
import { aggregate, WARD, DIVE, TRIPLE, CHARGE } from './powerorb.js';

/* ---------------------------------------------------------------------------
   A Katana Kitty and the camera that follows it.

   Two movement modes share one controller:
     ground â€” run, jump, double-jump, pounce-dash, katana slash
     flight â€” riding a storm dragon; the camera pulls way back so the world
              reads at Dragon Ball Z scale

   The camera keeps a fixed isometric yaw and pitch and only ever changes its
   distance. That's what holds the 2.5D look together: the billboard sprites
   are always seen from the angle they were drawn for.
--------------------------------------------------------------------------- */

const CAM_YAW = -Math.PI * 0.25;
const CAM_PITCH_GROUND = 0.66;
const CAM_PITCH_AIR = 0.60;

const GRAVITY = 26;
const WALK_SPEED = 10.5;
const SPRINT_SPEED = 17;
const ACCEL = 60;
const AIR_ACCEL = 26;
const JUMP_V = 11.2;
const COYOTE = 0.12;

/** A dead controller, for the frames a kitten is not in charge of herself.
 *  Shaped exactly like a real pad so nothing downstream has to check. */
const FROZEN_PAD = {
  mx: 0, my: 0, down: () => false, pressed: () => false,
};

const FLY_SPEED = 34;
const FLY_BOOST = 62;
const FLY_LIFT = 20;

/* ---------------------------------------------------------------------------
   Tournament combat.

   THE THREE ATTACKS ARE THE THREE THINGS SHE ALREADY DOES. There is no new
   button: a standing slash, a slash while sprinting, and a slash in the air.
   Two kids who have spent an afternoon knocking over barrels already know all
   three, so the tournament teaches a game rather than a control scheme — and
   the one that hits hardest is the one that costs the most to set up, which
   is the whole of the depth here and as much as this needs.

     standing   quick, short, safe
     dash       sprint into it — most knockback, and how you throw her out
     aerial     jump into it — most damage, hardest to land

   `hp` IS THE ONLY LOSS CONDITION. A ring-out hurts rather than ending the
   round (see Tournament._updateOut): two ways to lose, one of them instant,
   is two things for a nine-year-old to read on a screen where she is already
   watching her sister — and an instant one turns a two-minute round into a
   two-second one on a mistimed knockback.
--------------------------------------------------------------------------- */

export const MAX_HP = 100;

export const ATTACKS = {
  stand: { dmg: 10, knock: 9, lift: 3.5, reach: 3.4, arc: -0.25 },
  dash: { dmg: 15, knock: 19, lift: 5.0, reach: 3.9, arc: -0.1 },
  air: { dmg: 14, knock: 13, lift: 7.5, reach: 3.7, arc: -0.35 },

  /* THE THREE POWER-ORB MOVES ARE ENTRIES IN THIS TABLE AND NOT A SECOND
     SYSTEM, which is the whole reason they cannot leak out of the ring.
     `Game.strikePlayers` is still the one gate that asks whether the two of
     them are allowed to hurt each other; giving these their own damage path
     would put that question in a second place, and the copy nobody remembers
     is how a nine-year-old ends up able to power-dive her sister in the
     market square. `world-check` asserts a full-power charge does zero damage
     with the tournament off, exactly as it does for a dash.

     `arc` is the cosine floor on the forward test. The dive is -1 — it lands
     on everything under her, and a falling body has no facing. */
  tri: { dmg: 9, knock: 7, lift: 2.6, reach: 3.4, arc: -0.25 },
  dive: { dmg: DIVE.dmg, knock: DIVE.knock, lift: DIVE.lift, reach: DIVE.radius, arc: -1 },
  charge: { dmg: CHARGE.dmg, knock: CHARGE.knock, lift: CHARGE.lift, reach: CHARGE.radius, arc: -0.6 },
};

/** Seconds a hit takes control away, and how long she cannot be hit again. */
const HIT_STUN = 0.26;
const INVULN = 0.55;
/** How long she lies there after a knockout, before the round can move on. */
export const KO_TIME = 1.8;

/**
 * How much harder a hurt kitten flies.
 *
 * Smash's percent rule, borrowed on purpose: knockback grows as she loses
 * health, so a round that has been going a while starts throwing people
 * around and the ring's edge stops being decoration. Capped, and gentle at
 * the start — this is the difference between a fight that builds and a fight
 * that is the same exchange twelve times.
 */
const RAGE_MAX = 1.6;

export class Player {
  constructor(opts) {
    const {
      texture, index = 0, spawn = new THREE.Vector3(),
      name = 'Kitty', tint = 0xffffff, height = 2.5,
      cols = 4, rows = 1, mirror = true, contentScale = 1, pad = 0,
      dirSense = 1, rowSense = null,
    } = opts;

    this.index = index;
    this.name = name;
    this.position = spawn.clone();
    this.velocity = new THREE.Vector3();
    this.facing = 0;
    this.onGround = false;
    this.coyote = 0;
    this.jumpsLeft = 2;
    /**
     * True while everything between her and the ground was done on her own
     * feet. Cleared by touching ANY mount, and restored only by standing on
     * real terrain again — not on a platform, which is the whole point: the
     * jump shards are platforms, so a dragon that drops her on the top one
     * leaves this false and the 7★ still refuses her. See LOCKS.sky.climbed.
     */
    this.footClimb = true;
    /** The storm dragon being flown, or null. Flight is a whole other mode. */
    this.mount = null;
    /** The panda being ridden, or null. Riding one is still GROUND movement —
     *  see _updateGround — so it deliberately does not go through `mount`. */
    this.pandaMount = null;
    /** This kitten's own panda, once she has raised one. */
    this.panda = null;
    /** Lifetime bamboo canes cut. Feeds the panda; see PANDA_TIERS. */
    this.bambooCut = 0;
    /** `bambooCut` at the moment the panda was last granted or grown. Growth
     *  above the cub is charged from here, not from zero — see tierFor. */
    this.pandaFedFrom = null;
    /** Ryuuseki's second seat. Deliberately NOT `mount`: everything in the
     *  game reads `mount` as "is steering a flying thing", and a gunner is
     *  aboard without steering anything. See Player._updatePassenger. */
    this.rideAlong = null;
    this.score = 0;
    this.radius = 0.75;
    this.height = height;

    this.attackTimer = 0;
    this.attackCooldown = 0;
    this.stepPhase = 0;
    this.squash = 0;

    /* --- tournament combat ---
       All of this is inert outside a live round. Nothing here is gated on the
       PLAYER, though: `hurt` is only ever called from `Game.strikePlayers`,
       which is the single place that asks whether fighting is allowed. Two
       copies of that question is how you end up able to cut your sister down
       in the middle of the town. */
    this.maxHp = MAX_HP;
    this.hp = MAX_HP;
    /** Seconds of hit-stun left — she keeps her momentum and loses her stick. */
    this.hitT = 0;
    /** Seconds of invulnerability left. Stops a fast blade chain-locking her. */
    this.invulnT = 0;
    /** Seconds left lying knocked out. Zero means she is up. */
    this.koT = 0;
    /** True from the moment she is knocked out until the round resets her. */
    this.ko = false;
    /** Scoring, per tournament. See Tournament.score. */
    this.dmgDealt = 0;
    this.dmgTaken = 0;
    /** Drives the white hit-flash on the sprite. */
    this.flashT = 0;
    /** Which way the last hit threw her, for the recoil lean. */
    this.hitLean = 0;
    /** Seconds left of the star-found pose. See Player.holdAloft. */
    this.aloftT = 0;
    /** The star she is holding up, parented to her group for the duration. */
    this.aloft = null;

    /* --- Powerup Kotodama ---
       `powerOrbs` is the ONE piece of truth about what she is wearing: an
       array of orb ids, duplicates and all. Everything else — the buff
       numbers, the profile screen, the worn geometry, what the stall will buy
       back — is derived from it, and `setPowerOrbs` is the only way it moves.
       Anything that edits the array in place gets a kitten whose maximum
       health and whose displayed inventory disagree. */
    this.powerOrbs = [];
    /** Folded buff totals. Never null: an empty list aggregates to the
     *  identity, so every read site is `this.power.speed` with no `?? 1`. */
    this.power = aggregate([]);
    /** Seconds the ward bubble has left, and the wait after it drops. */
    this.wardT = 0;
    this.wardCool = 0;
    /** Seconds left of a charge, and the direction it is committed to. */
    this.chargeT = 0;
    this.chargeDir = new THREE.Vector2(0, 1);
    this.chargeLeft = 0;
    /** Triple-slash sequencer: cuts still to throw and the clock to the next. */
    this.triLeft = 0;
    this.triT = 0;
    /** True while falling as a power dive. */
    this.diving = false;
    /** Seconds the attack button has been held, for the triple-slash arm. */
    this.attackHeld = 0;

    this.group = new THREE.Group();

    /* `height` is how tall the KITTEN should be in world units. The quad has
       to be bigger than that, because the drawn art only fills part of its
       square atlas cell â€” dividing by contentScale keeps the character the
       requested size whatever the sheet's packing turned out to be.
       Square quad: the atlas cells are square and already preserve the art's
       own proportions (see loadSpriteAtlas). */
    const quad = height / (contentScale || 1);
    this.sprite = new Billboard(texture, {
      cols,
      rows,
      width: quad,
      height: quad,
      footOffset: pad * quad,
      artFacesRight: true,
      mirror,
      dirSense,
      rowSense,
    });
    /** Animation rows in the generated sheet, in order. A single-row fallback
     *  atlas collapses them all to 0. */
    this.anim = rows >= 4
      ? { idle: 0, walk: 1, jump: 2, attack: 3 }
      : { idle: 0, walk: 0, jump: 0, attack: 0 };
    if (tint !== 0xffffff) this.sprite.mat.color.set(tint);
    this.group.add(this.sprite);

    // Blob shadow.
    const sg = new THREE.CircleGeometry(0.62, 18);
    sg.rotateX(-Math.PI / 2);
    this.shadow = new THREE.Mesh(
      sg,
      new THREE.MeshBasicMaterial({ color: 0x2a1830, transparent: true, opacity: 0.38, depthWrite: false })
    );
    this.group.add(this.shadow);

    // Katana slash arc.
    const arc = new THREE.RingGeometry(1.0, 2.0, 20, 1, -0.9, 1.8);
    arc.rotateX(-Math.PI / 2);
    this.slash = new THREE.Mesh(
      arc,
      new THREE.MeshBasicMaterial({
        color: 0xbff3ff, transparent: true, opacity: 0,
        depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      })
    );
    this.slash.position.y = 0.9;
    this.group.add(this.slash);

    // Player-colour ring so you can always find yourself on a busy screen.
    const mg = new THREE.RingGeometry(0.78, 0.95, 24);
    mg.rotateX(-Math.PI / 2);
    this.marker = new THREE.Mesh(
      mg,
      new THREE.MeshBasicMaterial({
        color: index === 0 ? 0xff8a3d : 0xff6fae,
        transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false,
      })
    );
    this.marker.position.y = 0.04;
    this.group.add(this.marker);

    /* --- the health bar ---
       Over her head rather than only in the corner, and that is the important
       half. In split screen each girl reads her own corner fine; what neither
       of them can read is the OTHER kitten's health, which is the number that
       decides whether you press the attack or back off. Above the target, in
       the target's own colour, is the only place that works from both halves
       of the screen at once.
       Hidden outside the tournament — a permanent health bar over a kitten
       knocking over barrels states a threat the rest of the game does not
       have. `depthTest: false` so it reads through the ring's corner posts:
       a bar you lose behind scenery is worse than no bar. */
    this.hpGroup = new THREE.Group();
    this.hpGroup.visible = false;
    const barW = 3.0;
    const barMesh = (w, color, z, opacity = 1) => {
      const g = new THREE.PlaneGeometry(w, 0.42);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity, depthTest: false, depthWrite: false,
        toneMapped: false, side: THREE.DoubleSide,
      }));
      m.renderOrder = 20 + z;
      return m;
    };
    this.hpBack = barMesh(barW + 0.22, 0x1c1016, 0, 0.85);
    this.hpFill = barMesh(barW, index === 0 ? 0xff8a3d : 0xff6fae, 1);
    /* The fill shrinks from the LEFT EDGE, not from its centre. A plane
       scaled on x contracts toward its own origin, so a bar built centred
       eats itself from both ends and reads as half the damage it is showing.
       Parenting the quad to a pivot at the left end and scaling the pivot is
       the cheap fix that keeps the geometry untouched. */
    this.hpPivot = new THREE.Group();
    this.hpPivot.position.x = -barW / 2;
    this.hpFill.position.x = barW / 2;
    this.hpPivot.add(this.hpFill);
    this.hpGroup.add(this.hpBack, this.hpPivot);
    this.group.add(this.hpGroup);
    this._barW = barW;

    /* --- the ward bubble ---
       Two shells, both BackSide, both additive-ish through low opacity: from
       inside you see the far wall of the sphere, which is what makes it read
       as being INSIDE something rather than as a ball stuck to her. Built
       once and hidden, because a kitten with the orb pops this every few
       seconds and allocating a sphere per press is how you get a hitch every
       time she defends herself. */
    this.wardMesh = new THREE.Group();
    const shell = (r, c, o) => new THREE.Mesh(
      new THREE.IcosahedronGeometry(r, 2),
      new THREE.MeshBasicMaterial({
        color: c, transparent: true, opacity: o, side: THREE.BackSide,
        depthWrite: false, toneMapped: false,
      })
    );
    this.wardShell = shell(WARD.radius, 0x9fd8ff, 0.22);
    this.wardCore = shell(WARD.radius * 0.82, 0xe8f6ff, 0.10);
    this.wardMesh.add(this.wardShell, this.wardCore);
    this.wardMesh.visible = false;
    this.group.add(this.wardMesh);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 4000);
    this.camDist = 26;
    this.camTarget = this.position.clone();
    this._offset = new THREE.Vector3();

    /* When the kitten walks into a "focus" area â€” right now the Unit Circle
       Dojo â€” the camera pulls back and tilts toward top-down so the whole
       diagram is legible instead of filling the screen one label at a time. */
    this.focus = null;
    this.focusT = 0;
    this.camYaw = CAM_YAW;
  }

  /** @param {{centre: THREE.Vector3, dist: number, pitch: number}|null} f */
  setFocus(f) {
    this.focus = f;
  }

  /* ------------------------ Powerup Kotodama ---------------------------- */

  /**
   * Equip a list of orb ids. The ONLY way `powerOrbs` ever changes.
   *
   * HEALTH IS THE ONE STAT THAT CANNOT SIMPLY BE RECOMPUTED, because it has a
   * current value as well as a maximum. Taking a vigor orb off a kitten
   * standing at 130 of 130 has to leave her at 100 of 100 and not at 130 of
   * 100; putting one on mid-round must not be a free heal either, so the
   * CURRENT value keeps its share of the bar rather than its absolute number.
   * Trading a stack away in the middle of a fight is a real thing two sisters
   * will try, and both of the obvious implementations of it are wrong.
   *
   * @param {string[]} ids
   */
  setPowerOrbs(ids) {
    const frac = this.maxHp > 0 ? this.hp / this.maxHp : 1;
    this.powerOrbs = [...ids];
    this.power = aggregate(this.powerOrbs);
    this.maxHp = this.power.hp;
    this.hp = Math.round(this.maxHp * frac);
    return this.powerOrbs;
  }

  /** How much of gravity applies this frame. See WARD / TRIPLE / CHARGE. */
  _gravityK() {
    if (this.chargeT > 0) return 0;
    if (this.wardT > 0) return WARD.gravity;
    if (this.triLeft > 0 && !this.onGround) return TRIPLE.gravity;
    return 1;
  }

  /** True while a special move owns her feet — no stick, no jump. */
  get busy() {
    return this.triLeft > 0 || this.chargeT > 0;
  }

  /* ------------------------------ helpers ------------------------------- */

  /** Camera-relative basis, so "up on the stick" is always "away from you".
   *  Uses the live camera yaw, so movement stays correct while the camera
   *  swings round to square up with the dojo's axes. */
  _basis() {
    const y = this.camYaw;
    const fwd = new THREE.Vector3(-Math.sin(y), 0, -Math.cos(y)).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    return { fwd, right };
  }

  faceCamera(camera) {
    this.sprite.faceCamera(camera);

    /* THE HEALTH BAR IS A FLAT QUAD AND HAS TO BE TURNED, like the leaders'
       speech bubbles are. It is parented to `group`, which never rotates, so
       without this it stays facing +Z for ever: from the game's fixed -PI/4
       camera every bar rendered as a thin diagonal streak above a kitten,
       which reads as a rendering fault rather than as a health bar.
       A FULL quaternion copy, not a yaw — `Billboard.faceCamera` turns on Y
       only, which is right for a character standing on the ground and wrong
       for a strip of UI. The fight camera looks down at ~0.55 radians and a
       yaw-only bar is foreshortened to about half its height there. */
    if (this.hpGroup.visible) this.hpGroup.quaternion.copy(camera.quaternion);
    // A mounted kitten sits inside the dragon's billboard quad, so at equal
    // depth it loses the sort and disappears. Nudging the rider toward the
    // camera puts it cleanly in front from every angle â€” and it has to happen
    // per view, because the two split-screen cameras see it from different
    // sides.
    /* `carried` is the griffin. It is deliberately NOT `mount` — everything
       in this game reads `mount` as "is steering a flying thing", and a
       passenger on a scripted taxi steers nothing — but it needs this one
       piece of mount behaviour: the outward nudge. Without it both kittens
       sit at the animal's own depth inside a quad three times their height,
       lose the sort, and vanish into the thing carrying them. Exactly the bug
       Ryuuseki had, and the same fix. */
    if (this.mount || this.pandaMount || this.rideAlong || this.carried) {
      const dx = camera.position.x - this.position.x;
      const dz = camera.position.z - this.position.z;
      const len = Math.hypot(dx, dz) || 1;
      /* Ryuuseki's quad is far bigger than a storm dragon's, so the 2.4 that
         lifts a kitten clear of one leaves her buried inside him. The nudge is
         scaled to whatever she is sitting on. */
      const seat = this.mount ?? this.rideAlong ?? this.carried;
      const out = seat ? Math.max(2.4, seat.quad * 0.10) : 2.4;
      /* ...and on top of that, a Ryuuseki rider's place ALONG his body is a
         draw offset rather than a position — so the animal under the pilot
         never lurches when his drawn heading flips, and both girls resolve
         their seat against the same heading in the same frame. See
         Ryuuseki.drawOffset. */
      const s = seat?.drawOffset
        ? seat.drawOffset(this.rideAlong ? 'gunner' : 'pilot')
        : null;
      this.sprite.position.set(
        (dx / len) * out + (s ? s.x : 0),
        0,
        (dz / len) * out + (s ? s.z : 0)
      );
    } else if (this.sprite.position.lengthSq() > 0) {
      this.sprite.position.set(0, 0, 0);
    }
  }

  /* ------------------------------- update ------------------------------- */

  update(dt, pad, world, dragons, hud) {
    /* A kitten holding a star over her head is not also sprinting off with it.
       Feeding the ground controller a dead stick freezes her without any of
       the three movement modes needing to know this pose exists.

       NOT WHILE SHE IS FLYING. A dead stick on a dragon is a dragon nobody is
       steering, thirty units up, for two seconds — and one of the seven stars
       is deliberately taken from the air, so this is a case that really
       happens rather than a hypothetical. She keeps the reins; she just gets
       the camera and the noise. */
    if (this.aloftT > 0 && !this.mount && !this.rideAlong) pad = FROZEN_PAD;

    /* A HIT TAKES THE STICK, AND A KNOCKOUT KEEPS IT. Same trick as the star
       pose: hand the ground controller a dead pad and none of the three
       movement modes has to know combat exists. It is the stick and not the
       physics — she keeps every bit of the momentum the blow gave her, which
       is the difference between being knocked across the ring and being
       switched off in mid-air. */
    if (this.hitT > 0 || this.ko) pad = FROZEN_PAD;

    /* NO POWER MOVE SURVIVES GETTING ON AN ANIMAL. `_stepSpecials` only runs
       inside the ground controller, so a ward popped a frame before mounting
       a dragon would keep `wardT` at three seconds for ever — a permanently
       invincible kitten, produced by a button press that looks like getting
       on a dragon. Same for a charge, which would hold gravity at zero. */
    if ((this.mount || this.rideAlong) && (this.wardT > 0 || this.busy || this.diving)) {
      this._clearSpecials();
    }

    if (this.rideAlong) this._updatePassenger(dt, pad, world, hud);
    else if (this.mount) this._updateFlight(dt, pad, world, hud);
    else this._updateGround(dt, pad, world, dragons, hud);

    this.group.position.copy(this.position);
    this.sprite.facing = this.facing;
    this._updateAloft(dt);
    this._updateCombat(dt);
    this._updateFeedback(dt, world);
    this._updateCamera(dt);
  }

  /* ---------------------------- combat ---------------------------------- */

  /**
   * Take a hit. Called ONLY from `Game.strikePlayers`.
   *
   * Returns the damage actually dealt, so the attacker can be credited with
   * it — 0 when the hit was eaten by invulnerability, which the caller needs
   * to know so a whiffed swing does not score.
   *
   * @param {number} dmg
   * @param {{x:number,z:number}} from where the blow came from
   * @param {{knock:number, lift:number}} force
   */
  hurt(dmg, from, force, hud) {
    if (this.invulnT > 0 || this.ko) return 0;

    /* THE WARD STOPS BLADES, NOT THE EDGE OF THE WORLD. `force.pierce` is set
       by exactly one caller — the ring-out — and it has to be, because the
       bubble runs 3s on a 1.5s wait: without this a kitten with the orb can
       stand off the side of the arena for the whole round and take nothing,
       which deletes the ring. Blocking a blade is what she bought; blocking
       the floor is not. */
    if (this.wardT > 0 && !force?.pierce) {
      this.wardFlash = 0.25;
      hud?.sfx?.('wardhit');
      return 0;
    }

    const before = this.hp;
    this.hp = Math.max(0, this.hp - dmg);
    const dealt = before - this.hp;
    this.dmgTaken += dealt;

    /* THE PUSH IS AWAY FROM THE ATTACKER, and it needs a fallback. Two
       kittens standing in exactly the same spot give a zero-length vector,
       which normalises to NaN and teleports somebody to the origin — and two
       kittens standing in the same spot is not a hypothetical in a game where
       they are trying to hit each other. */
    let dx = this.position.x - from.x;
    let dz = this.position.z - from.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.001) { dx = Math.sin(this.facing) * -1; dz = Math.cos(this.facing) * -1; }
    else { dx /= len; dz /= len; }

    // Smash's percent rule: the more she has taken, the further she flies.
    const rage = 1 + (1 - this.hp / this.maxHp) * (RAGE_MAX - 1);
    this.velocity.x = dx * force.knock * rage;
    this.velocity.z = dz * force.knock * rage;
    this.velocity.y = Math.max(this.velocity.y, force.lift * rage);

    this.hitT = HIT_STUN;
    this.invulnT = INVULN;
    this.flashT = 0.3;
    this.squash = 1;
    this.hitLean = Math.sign(dx * Math.cos(this.camYaw) - dz * Math.sin(this.camYaw)) || 1;
    this.onGround = false;

    if (this.hp <= 0) {
      this.ko = true;
      this.koT = KO_TIME;
      /* A knockout throws her further than the blow that caused it. The last
         hit of a round has to look different from the eleven before it, and
         this is the cheapest way to say so with no new art. */
      this.velocity.x *= 1.5;
      this.velocity.z *= 1.5;
      this.velocity.y = Math.max(this.velocity.y, force.lift * 2.2);
      hud?.sfx('ko');
    } else {
      hud?.sfx('hurt');
    }
    return dealt;
  }

  /**
   * Put her back on her feet for a fresh round: full health, no timers.
   *
   * Deliberately NOT a general reset — it leaves `dmgDealt`/`dmgTaken` alone,
   * because those are tournament totals and the score is computed across all
   * three rounds. Clearing them here would silently score only the last one.
   */
  resetForRound(x, y, z, facing) {
    this.hp = this.maxHp;
    this.hitT = 0;
    this.invulnT = 0;
    this.koT = 0;
    this.ko = false;
    this.flashT = 0;
    this.outT = 0;
    this.position.set(x, y, z);
    this.group.position.copy(this.position);
    this.velocity.set(0, 0, 0);
    this.facing = facing;
    this.camTarget.copy(this.position);
    this.onGround = true;
    this.attackTimer = 0;
    this.attackCooldown = 0;
    /* Every power move dies with the round too. A charge that survives the
       reset carries its committed direction and its zero gravity across the
       teleport to her post and flies her straight back off the ring before
       the countdown has finished. */
    this._clearSpecials();
  }

  /** Drop every power move on the floor. Safe to call at any time. */
  _clearSpecials() {
    this.wardT = 0;
    this.wardCool = 0;
    this.chargeT = 0;
    this.chargeLeft = 0;
    this.triLeft = 0;
    this.triT = 0;
    this.diving = false;
    this.attackHeld = 0;
    this.wardMesh.visible = false;
  }

  /** Which of the three attacks this swing is. See ATTACKS. */
  attackKind(pad) {
    if (!this.onGround) return 'air';
    const moving = Math.abs(pad.mx) + Math.abs(pad.my) > 0.2;
    return (pad.down('sprint') && moving) ? 'dash' : 'stand';
  }

  _updateCombat(dt) {
    this.hitT = Math.max(0, this.hitT - dt);
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    if (this.koT > 0) this.koT = Math.max(0, this.koT - dt);

    const bar = this.hpGroup;
    if (!bar.visible) return;
    // Above her head, clear of the star she might be holding.
    bar.position.set(0, this.height * 1.32, 0);
    const k = Math.max(0, this.hp / this.maxHp);
    this.hpPivot.scale.x = k;
    /* THE BAR CHANGES COLOUR BEFORE IT RUNS OUT. Her own colour down to a
       third, then amber, then red — so "I am nearly out" is something she
       reads from the corner of her eye rather than by measuring a stripe
       against a stripe. The pulse is what carries it in peripheral vision;
       a static red bar at 12% and a static red bar at 30% look the same. */
    const low = k <= 0.34;
    this.hpFill.material.color.set(
      k > 0.34 ? (this.index === 0 ? 0xff8a3d : 0xff6fae) : k > 0.18 ? 0xffc23d : 0xff3b30
    );
    this.hpFill.material.opacity = low
      ? 0.65 + Math.abs(Math.sin((this.idlePhase ?? 0) * 4.5)) * 0.35
      : 1;
  }

  /**
   * The Zelda beat: she stops where she is and holds the star over her head.
   *
   * IT IS PER PLAYER, NOT A CUTSCENE, and that is deliberate. Every other
   * scripted moment in this game (the intro, the shrines, the summoning) takes
   * the whole screen from both girls, which is right when the thing being said
   * is said to both of them. A star is found by ONE kitten, usually while her
   * sister is two islands away doing something else — stopping that sister's
   * game to show her a cutscene about something she did not do is the exact
   * interruption the split screen exists to avoid. So this rides her own
   * camera, and in split screen the other half never notices.
   *
   * @param {THREE.Texture} map the star's own face, so the thing over her head
   *        is visibly the 4★ she just picked up and not a generic orb.
   */
  holdAloft(map, dur = 2.0) {
    this.aloftT = dur;
    this.aloftDur = dur;
    if (!this.aloft) {
      this.aloft = new THREE.Mesh(
        new THREE.SphereGeometry(0.62, 20, 14),
        new THREE.MeshBasicMaterial({ toneMapped: false })
      );
      /* Over everything. She is a transparent billboard and the star sits at
         very nearly her own depth, so without this the sort decides which of
         the two is in front on a frame-by-frame basis and the prize flickers
         inside the cat holding it. */
      this.aloft.renderOrder = 8;
      this.aloft.material.depthTest = false;
      this.group.add(this.aloft);

      this.aloftGlow = new THREE.Mesh(
        new THREE.SphereGeometry(1.5, 16, 12),
        new THREE.MeshBasicMaterial({
          color: 0xffe9a8, transparent: true, opacity: 0.3,
          side: THREE.BackSide, depthWrite: false, depthTest: false,
          toneMapped: false,
        })
      );
      this.aloftGlow.renderOrder = 7;
      this.group.add(this.aloftGlow);
    }
    this.aloft.material.map = map ?? null;
    this.aloft.material.color.set(map ? 0xffffff : 0xffcf6a);
    this.aloft.material.needsUpdate = true;
    this.aloft.visible = true;
    this.aloftGlow.visible = true;
  }

  _updateAloft(dt) {
    if (this.aloftT <= 0) return;
    this.aloftT = Math.max(0, this.aloftT - dt);
    const dur = this.aloftDur || 2.0;
    const t = 1 - this.aloftT / dur;              // 0 at the start, 1 at the end

    /* Up fast, hold, then away. The rise overshoots by a hair and settles —
       a linear lift to a stop reads as an object being positioned, and the
       whole point of this pose is that she is presenting it. */
    const rise = t < 0.22 ? Math.sin((t / 0.22) * Math.PI * 0.62) * 1.08 : 1;
    const y = this.height * 0.55 + rise * (this.height * 0.85);
    const bob = Math.sin(t * 9) * 0.06 * (t > 0.22 ? 1 : 0);
    this.aloft.position.set(0, y + bob, 0);
    this.aloft.rotation.y += dt * 3.4;
    this.aloftGlow.position.copy(this.aloft.position);

    const fade = this.aloftT < 0.4 ? this.aloftT / 0.4 : 1;
    const pop = 1 + Math.sin(Math.min(1, t / 0.22) * Math.PI) * 0.35;
    this.aloft.scale.setScalar(fade * pop);
    this.aloftGlow.scale.setScalar(fade * (0.7 + Math.sin(t * 7) * 0.12));
    this.aloftGlow.material.opacity = 0.3 * fade;

    if (this.aloftT <= 0) {
      this.aloft.visible = false;
      this.aloftGlow.visible = false;
    }
  }

  _updateGround(dt, pad, world, dragons, hud) {
    /* THE POWER MOVES ARE STEPPED BEFORE THE STICK IS READ, because two of
       them take the stick away. Running the sequencers afterwards means a
       charge that ended this frame still eats this frame's input, which is
       one frame of unresponsiveness per charge — small, constant, and exactly
       the kind of thing that makes a control scheme feel soft. */
    this._stepSpecials(dt, pad, world, hud);

    const { fwd, right } = this._basis();
    const wish = new THREE.Vector3()
      .addScaledVector(right, pad.mx)
      .addScaledVector(fwd, -pad.my);

    let moving = wish.lengthSq() > 0.0001;
    if (moving) {
      wish.normalize();
      this.facing = Math.atan2(wish.x, wish.z);
    }
    /* Planted. She keeps her facing from the frame the move started — a
       triple slash you can steer is a triple slash with no cost. */
    if (this.busy) { wish.set(0, 0, 0); moving = false; }

    const sprinting = pad.down('sprint') && moving;
    const buff = this.clan?.buff;
    /* Clan buff and orbs MULTIPLY. Thunderpaw's 1.35 on top of four Gale orbs
       is 2.54, which is absurd and correct: the orbs only exist after 100%
       mischief, the clans are a mid-game choice, and a kid who has done both
       has earned the silly number. Nothing downstream reads speed as bounded. */
    const speedK = (buff?.speed ?? 1) * this.power.speed;
    /* A grown panda is a mount, not a buff — riding one multiplies whatever
       you already had, so a Thunderpaw kitten on a panda is the fastest thing
       in the game. It is ground movement throughout: same gravity, same
       collisions, same slope snapping, so nothing about the world has to know
       she is on it. */
    const rideK = this.pandaMount ? PANDA_SPEED : 1;
    const target = wish.multiplyScalar(
      moving ? (sprinting ? SPRINT_SPEED : WALK_SPEED) * speedK * rideK : 0
    );
    /* Acceleration is scaled by the square root of the speed jump, not by the
       speed jump itself. At the flat ground figure a panda needs nearly two
       seconds to reach full pelt, which reads as unresponsive; at the full
       multiple it hits 10x from a standstill in a frame, which reads as a
       teleport. The middle keeps the animal's weight — it gathers itself and
       then goes. */
    const rate = (this.onGround ? ACCEL : AIR_ACCEL) * Math.sqrt(rideK) * dt;

    /* KNOCKBACK IS NOT STEERED, AND IT MUST NOT BE BRAKED EITHER.
       While she is stunned the pad is dead, so `target` is zero — and the
       ordinary controller reads a zero target as "stop", decelerating at
       ACCEL (60/s). That erases a 19-unit knockback in about a third of a
       second, which is shorter than the stun itself: every blow landed, every
       health bar moved, and nobody ever went anywhere. Being hit has to
       LOOK like being hit.
       So during the stun the movement accel is skipped entirely and the
       throw decays on its own gentle drag instead. Gravity is untouched, so
       she still falls, still lands, and still slides to a stop. */
    if (this.chargeT > 0) {
      /* A CHARGE IS A VELOCITY, NOT A TARGET. Feeding it through the ordinary
         accelerator makes it ramp up over a third of a second and arrive
         nowhere near CHARGE.speed before the timer runs out — the move looks
         like a brisk walk. It is set flat, every frame, in the direction it
         committed to at the press. */
      this.velocity.x = this.chargeDir.x * CHARGE.speed;
      this.velocity.z = this.chargeDir.y * CHARGE.speed;
      this.velocity.y = 0;
    } else if (this.hitT > 0 || this.ko) {
      const drag = Math.min(1, dt * (this.onGround ? 3.4 : 0.7));
      this.velocity.x -= this.velocity.x * drag;
      this.velocity.z -= this.velocity.z * drag;
    } else {
      this.velocity.x += THREE.MathUtils.clamp(target.x - this.velocity.x, -rate, rate);
      this.velocity.z += THREE.MathUtils.clamp(target.z - this.velocity.z, -rate, rate);
    }
    /* A power dive is a fall she is DRIVING. Gravity alone tops out around
       terminal for the height of a double jump and reads as an ordinary drop
       with a sound effect on it; pinning the speed is what makes it a move. */
    if (this.diving) this.velocity.y = -DIVE.speed;
    else this.velocity.y -= GRAVITY * this._gravityK() * dt;

    // --- jump / double jump ---
    if (this.onGround) this.coyote = COYOTE;
    else this.coyote -= dt;

    /* Shadowtail grants a third jump and a little more lift. `maxJumps` is
       read wherever the count is refilled, so landing restores all of them. */
    const jumpK = (buff?.jump ?? 1) * (this.pandaMount ? PANDA_JUMP : 1);
    /* Leap orbs ADD to whatever the clan gave her, so a Shadowtail kitten
       wearing three of them has six. The count is read wherever jumps are
       refilled, so landing restores all of them however many that is. */
    this.maxJumps = (buff?.jumps ?? 2) + this.power.jumps;
    if (pad.pressed('jump') && !this.busy) {
      if (this.coyote > 0 || this.jumpsLeft > 1) {
        this.velocity.y = JUMP_V * jumpK;
        this.jumpsLeft = Math.max(1, this.jumpsLeft - 1);
        this.coyote = 0;
        this.squash = 1;
        hud?.sfx('jump');
      } else if (this.jumpsLeft > 0) {
        hud?.sfx('doubleJump');
        // Later jumps are a little weaker but add a forward pop.
        this.velocity.y = JUMP_V * 0.86 * jumpK;
        if (moving) {
          this.velocity.x += Math.sin(this.facing) * 4;
          this.velocity.z += Math.cos(this.facing) * 4;
        }
        this.jumpsLeft = 0;
        this.squash = 1;
      }
    }

    /* --- katana slash, or the panda's claw ---
       Riding one swaps the attack the way riding a dragon swaps it for the
       breath. The kitten still plays her attack pose, which reads as the two
       of them going for it together. */
    this.attackCooldown -= dt;
    if (pad.pressed('attack') && this.attackCooldown <= 0 && !this.busy) {
      this.attackTimer = 0.26;
      if (this.pandaMount) {
        this.attackCooldown = 0.45;
        this._doClaw(world, hud);
      } else if (this.power.charge && sprinting) {
        /* CHARGE OUTRANKS THE HOLD, and the reason is that it is the one the
           stick already says out loud. She is sprinting in a direction with
           the trigger down; a hold-detector that stole that press would make
           the sprint attack unreachable for anyone wearing both orbs, and the
           sprint attack is the one two kids already know from the barrels. */
        this._startCharge(hud);
      } else {
        this.attackCooldown = 0.36;
        hud?.sfx('slash');
        /* The kind is read from the pad AT THE MOMENT OF THE PRESS, not
           recomputed later. `onGround` and the stick both change during the
           rest of this function — the ground snap runs below — so asking
           afterwards can turn the aerial she actually threw into a standing
           slash on the frame she lands. */
        this._doSlash(world, hud, this.attackKind(pad));
        // That swing is the first of three if she keeps the button down.
        this._triArm = !!this.power.tri;
      }
    }
    if (this.attackTimer > 0) this.attackTimer -= dt;

    /* --- the triple slash arms on the HOLD, and fires after the first cut ---
       Tapping still throws the ordinary swing above; keeping the button down
       past TRIPLE.hold turns that swing into the first of three. Arming on the
       press instead would put a 0.22s delay on every attack in the game for
       anyone wearing the orb, which is a worse trade than it sounds: the
       ordinary slash is what she uses on barrels a hundred times an hour. */
    if (this.power.tri && !this.pandaMount) {
      const held = pad.down('attack');
      this.attackHeld = held ? this.attackHeld + dt : 0;
      if (!held) this._triArm = false;
      /* ARMED BY THE SWING, FIRED BY THE HOLD, and the arming flag is what
         makes the window usable. Gating on `attackTimer > 0` instead — the
         obvious version — leaves 40 milliseconds between the hold threshold
         and the end of the swing animation, which is two frames: the move
         would work about a third of the time and read as the game ignoring
         her. The flag lives from the press until she lets go. */
      if (this._triArm && this.attackHeld > TRIPLE.hold && this.triLeft === 0) {
        this._startTriple(hud);
      }
    }

    /* --- the power dive ---
       Airborne only, which is what keeps `interact` free for the oath and the
       stall: neither of those is reachable off the floor, so the two meanings
       of the button can never both be live at once. */
    if (this.power.dive && pad.pressed('interact') && !this.onGround
        && !this.diving && !this.busy) {
      this._startDive(hud);
    }

    // --- move + collide ---
    const wasX = this.position.x;
    const wasZ = this.position.z;
    this.position.addScaledVector(this.velocity, dt);

    /* Her own height goes in, so a solid she is standing ON TOP of stops
       shoving her sideways — see World.resolveSolids. Without it the spire
       holding one of the seven stars throws her off its own deck. */
    const fixed = world.resolveSolids(
      this.position.x, this.position.z, this.radius, this.position.y
    );
    this.position.x = fixed.x;
    this.position.z = fixed.z;

    /* How far we actually travelled across the ground this frame â€” including
       any shove out of a tree or a wall, which can be a lot further than
       velocity alone predicts. The ground-snap tolerance below is sized from
       this, because that's what bounds how much the surface can have dropped
       underneath us. */
    const travelled = Math.hypot(this.position.x - wasX, this.position.z - wasZ);

    // Own height passed in so bridge decks and terraces are one-way: you land
    // on top of them, and walk underneath from below.
    const g = world.heightAt(this.position.x, this.position.z, this.position.y);
    const wasGrounded = this.onGround;

    /* Ground snapping. Running DOWN a slope, gravity alone leaves the kitten
       a hair above the falling surface for a frame or two every frame â€” enough
       to read as airborne, flip to the jump pose, land, and flip back. That's
       the buzzing animation on every hillside.
       So: if we were on the ground and aren't rising, and the surface is just
       below, stick to it. The tolerance scales with how far we actually moved
       this frame, because that's what bounds how far the ground can have
       fallen away under us. */
    const snap = 0.35 + travelled * 2.6;

    if (g && this.position.y <= g.y) {
      /* THE DIVE LANDS BEFORE THE VELOCITY IS ZEROED. Two lines further down
         `velocity.y = 0` and `onGround = true`, and a shockwave that asks
         afterwards how fast she was falling gets nothing. */
      if (this.diving) this._diveImpact(world, hud);
      if (!wasGrounded && this.velocity.y < -12) this.squash = 1;
      // Only a real fall gets a landing thump â€” the ground snapping below
      // means brief slope blips must not fire one every stride.
      if (!wasGrounded && (this.airTime ?? 0) > 0.14) {
        hud?.sfx('land', Math.min(1, 0.4 + Math.abs(this.velocity.y) / 22));
      }
      this.position.y = g.y;
      this.velocity.y = 0;
      this.onGround = true;
      this.jumpsLeft = this.maxJumps ?? 2;
    } else if (g && wasGrounded && this.velocity.y <= 0 && this.position.y - g.y <= snap) {
      this.position.y = g.y;
      this.velocity.y = 0;
      this.onGround = true;
      this.jumpsLeft = this.maxJumps ?? 2;
    } else {
      this.onGround = false;
      // Fell off the world â€” respawn in the plaza.
      if (this.position.y < -160) this._respawn(world);
    }

    // Time spent genuinely airborne, for the animation to threshold against.
    this.airTime = this.onGround ? 0 : (this.airTime ?? 0) + dt;

    /* `footClimb` — did she get where she is under her own power?
       Written here rather than at each of the four places a mount is taken,
       because the question is about STATE and there are more ways onto an
       animal than there are lines that say `this.mount =`: a storm dragon, a
       panda, and both of Ryuuseki's seats. Being on any of them clears it.
       Only TERRAIN restores it — `g.platform` is set when she is standing on a
       shard deck or a spire cap, and treating those as ground would hand the
       7★ back to anyone who can fly. */
    if (this.mount || this.rideAlong || this.pandaMount) this.footClimb = false;
    else if (this.onGround && g && !g.platform) this.footClimb = true;

    /* --- mount: a dragon if one is in reach, otherwise your own panda ---
       Dragons are scanned FIRST and win ties outright. A panda is always at
       your heel, so letting it match first would mean a kitten who has raised
       one could never climb onto a dragon again. */
    if (pad.pressed('mount')) {
      if (this.pandaMount) {
        const p = this.pandaMount;
        this.pandaMount = null;
        p.rider = null;
        hud?.sfx('dismount');
        hud?.toast(`${this.name} hopped off ${this.pandaName}`, this.index);
      } else if (hud?.ryu && hud.ryu.freeSeat()
                 && this.position.distanceTo(hud.ryu.position) < hud.ryuMountRadius) {
        /* Ryuuseki wins the mount button outright when he is in reach and has
           a seat free. He is one summoned animal parked over the town, and a
           storm dragon perched nearby stealing the button would be baffling —
           there are seven of those and one of him. */
        const R = hud.ryu;
        const seat = R.freeSeat();
        this.velocity.set(0, 0, 0);
        if (seat === 'pilot') {
          R.pilot = this;
          this.mount = R;
          this.flySide = 1;
        } else {
          R.gunner = this;
          this.rideAlong = R;
        }
        hud.sfx('mount');
        hud.onRyuMount?.(this, seat);
      } else {
        let best = null;
        let bestD = Infinity;
        for (const d of dragons) {
          if (d.mounted) continue;
          const dist = this.position.distanceTo(d.position);
          if (dist < d.mountRadius && dist < bestD) { best = d; bestD = dist; }
        }
        if (best) {
          this.mount = best;
          best.rider = this;
          best.state = 'ridden';
          best.facing = this.facing;
          this.velocity.set(0, 0, 0);
          hud?.sfx('mount');
          hud?.toast(`${this.name} is riding ${best.name}!`, this.index);
        } else if (this.panda?.rideable && !this.panda.mounted
                   && this.position.distanceTo(this.panda.position) < this.panda.mountRadius) {
          this.pandaMount = this.panda;
          this.panda.rider = this;
          this.velocity.set(0, 0, 0);
          hud?.sfx('mount');
          hud?.toast(`${this.name} climbed onto ${this.pandaName}!`, this.index);
        } else {
          /* NOTHING TO CLIMB ON — so this is the ward. The animal wins the
             button outright and always will: a kitten standing beside a storm
             dragon who presses mount and gets a bubble reads as the game
             refusing to let her fly, and she has no way to tell that the orb
             she is wearing is the reason. It falls through to here, which is
             nearly always, because a dragon is a place you walk to. */
          this._popWard(hud);
        }
      }
    }

    // --- swear to a clan ---
    if (pad.pressed('interact')) {
      const hall = world.clanHallNear(this.position.x, this.position.z);
      if (hall && this.clan?.id !== hall.clan.id) {
        /* You cannot swear to somebody you have not met. The leader's shrine
           scene is the introduction, and it fires on its own after two seconds
           of standing here — so this branch is only reachable by pressing
           interact within that window, which is a very small door. Saying so
           out loud matters more than blocking silently: an interact button
           that does nothing is indistinguishable from a broken one. */
        if (hud?.leaderFor && !hud.leaderFor(hall.clan)?.met) {
          hud?.toast?.('Wait — she has something to say first…', this.index);
        } else {
          this.clan = hall.clan;
          this.marker.material.color.set(hall.clan.color);
          hud?.sfx('clan');
          hud?.onJoinClan?.(this, hall.clan);
        }
      }
    }

    // Footstep bob.
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.onGround && speed > 0.6) this.stepPhase += dt * (5 + speed * 0.55);
    else this.stepPhase *= 1 - Math.min(1, dt * 6);

    /* Hang the panda off the kitten once her position is final, so the SEAT
       lands where the player is. Solved the other way round — panda first,
       rider offset from it — the player's own position lags the thing she is
       steering, and the camera follows the player. Same reasoning as the
       dragon's seat in _updateFlight. */
    if (this.pandaMount) this.pandaMount.carry(this);
  }

  /** Each kitten's panda has its own name, so the girls aren't both
   *  shouting about "the panda". */
  get pandaName() {
    return this.index === 0 ? 'Bao' : 'Mochi';
  }

  /* ------------------------- the power moves ---------------------------- */

  /**
   * Step every power-move clock. Runs before the stick is read.
   *
   * ONE FUNCTION FOR ALL FOUR, and the ordering inside it is the contract:
   * the ward is stepped first because it is the only one that can be up at
   * the same time as another, and the charge last because ending it has to
   * leave a velocity the ordinary controller can take back over.
   */
  _stepSpecials(dt, pad, world, hud) {
    // --- ward ---
    if (this.wardT > 0) {
      this.wardT = Math.max(0, this.wardT - dt);
      if (this.wardT === 0) {
        /* THE WAIT STARTS WHEN THE BUBBLE DROPS, NOT WHEN IT GOES UP. Charging
           the cooldown from the press means a 3s shield on a 1.5s cooldown is
           off for nothing at all — it is already available again by the time
           it pops. Read the other way round the two numbers say what they look
           like they say: three seconds of cover, then one and a half of not. */
        this.wardCool = this.power.ward?.cool ?? WARD.cool;
        hud?.sfx?.('warddown');
      }
    } else if (this.wardCool > 0) {
      this.wardCool = Math.max(0, this.wardCool - dt);
    }
    this.wardFlash = Math.max(0, (this.wardFlash ?? 0) - dt);

    // --- triple slash ---
    if (this.triLeft > 0) {
      this.triT -= dt;
      if (this.triT <= 0) {
        this.triLeft--;
        this.attackTimer = 0.2;
        hud?.sfx('slash');
        this._doSlash(world, hud, 'tri');
        this.triT = TRIPLE.gap;
        if (this.triLeft === 0) this.attackCooldown = 0.3;
      }
    }

    // --- charge ---
    if (this.chargeT > 0) {
      this.chargeT -= dt;
      this.chargeLeft -= CHARGE.speed * dt;
      this._chargeStrike(world, hud);
      if (this.chargeT <= 0 || this.chargeLeft <= 0) this._endCharge();
    }

    /* --- the dive ends when she stops falling ---
       Landing is handled where the ground snap happens, because the impact
       needs the speed. This is the OTHER way out: a dive that clips a wall,
       gets shoved by `resolveSolids` and ends up rising, or one thrown while
       a round ends. Without it `diving` latches and pins her downward
       velocity for the rest of the afternoon. */
    if (this.diving && (this.onGround || this.hitT > 0 || this.ko)) this.diving = false;
  }

  /** Put the bubble up, if she has the orb and the wait has run out. */
  _popWard(hud) {
    if (!this.power.ward || this.wardT > 0 || this.wardCool > 0) return false;
    this.wardT = this.power.ward.dur;
    this.wardMesh.visible = true;
    hud?.sfx?.('wardup');
    return true;
  }

  /**
   * Commit to a charge.
   *
   * THE DIRECTION IS TAKEN ONCE, AT THE PRESS. A charge you can steer is a
   * sprint with a hitbox — the whole shape of the move is that she picks a
   * line and lives with it, which is what makes dodging one a skill her
   * sister can learn rather than a coin flip.
   */
  _startCharge(hud) {
    this.chargeDir.set(Math.sin(this.facing), Math.cos(this.facing));
    this.chargeLeft = this.power.charge.dist;
    this.chargeT = this.power.charge.dist / CHARGE.speed;
    this.attackTimer = this.chargeT;
    this.attackCooldown = this.chargeT + 0.28;
    this._chargeHit = new Set();
    hud?.sfx('slash');
    hud?.sfx('mount', 0.5);
  }

  _endCharge() {
    this.chargeT = 0;
    this.chargeLeft = 0;
    /* Hand her back a velocity the controller can decelerate, not the 42/s
       the charge was running at — released at full pelt she skates halfway
       across the island afterwards, which reads as ice rather than as a stop. */
    this.velocity.x *= 0.35;
    this.velocity.z *= 0.35;
  }

  _startTriple(hud) {
    this.triLeft = TRIPLE.cuts - 1;   // the swing that armed it was the first
    this.triT = TRIPLE.gap;
    this.attackHeld = 0;
    this._triArm = false;
    hud?.toast?.(`${this.name} — TRIPLE SLASH!`, this.index);
  }

  _startDive(hud) {
    this.diving = true;
    /* PINNED HERE AS WELL AS IN THE CONTROLLER. The controller's pin runs near
       the top of `_updateGround`, next to gravity, and this is called from
       further down it — so on the frame she presses the button she keeps
       whatever upward velocity the jump left her with, and the drop starts one
       frame late. One frame is not much; it is enough to see, because the
       thing she is watching for is an instant change of direction. */
    this.velocity.y = -DIVE.speed;
    this.velocity.x *= 0.3;
    this.velocity.z *= 0.3;
    this.squash = 1;
    hud?.sfx('slash');
  }

  /**
   * The charge's moving hitbox, tested every frame it is live.
   *
   * REPEAT HITS ARE STOPPED BY INVULNERABILITY, not by a per-charge set —
   * `hurt` already refuses for INVULN seconds after a blow lands, and a
   * charge is over in under half a second. Props get their own set, because
   * `knock` has no equivalent guard and a barrel hit forty times in one pass
   * scores once and rattles forty times.
   */
  _chargeStrike(world, hud) {
    hud?.strikePlayers?.(this, 'charge', this._reach(), this.chargeDir);
    for (const p of world.props) {
      if (this._chargeHit.has(p)) continue;
      const dx = p.group.position.x - this.position.x;
      const dz = p.group.position.z - this.position.z;
      if (Math.abs(p.group.position.y - this.position.y) > 3) continue;
      const dist = Math.hypot(dx, dz);
      if (dist > CHARGE.radius) continue;
      this._chargeHit.add(p);
      this._knockProp(p, dx, dz, 1.5, world, hud);
    }
  }

  /** The dive's landing: everything around her feet goes over. */
  _diveImpact(world, hud) {
    this.diving = false;
    this.squash = 1;
    hud?.sfx('rockbreak');
    /* Straight down has no facing, so the strike is fed the direction she is
       pointed and ATTACKS.dive's arc of -1 ignores it. Passing the UNSCALED
       katana reach is deliberate: this is a falling body, not a blade, so a
       Riverclaw oath must not widen the crater. */
    hud?.strikePlayers?.(this, 'dive', 3.4, new THREE.Vector2(Math.sin(this.facing), Math.cos(this.facing)));
    for (const p of world.props) {
      /* THE DIVE IS THE DIVE-BOMB `prop.js` ALREADY NAMES. "Bamboo answers to
         the katana and nothing else — not a dive-bomb, not dragon breath" was
         written before there was a dive to bomb with, and it is still the
         rule that makes a 150-cane grove the one place flight and force fail
         and a girl has to stand there and cut. The charge keeps its blade out
         and does cut; a falling body does not. */
      if (p.katanaOnly) continue;
      const dx = p.group.position.x - this.position.x;
      const dz = p.group.position.z - this.position.z;
      if (Math.abs(p.group.position.y - this.position.y) > 3.5) continue;
      if (Math.hypot(dx, dz) > DIVE.radius) continue;
      this._knockProp(p, dx, dz, 1.9, world, hud);
    }
  }

  /** Her katana's real reach, clan and orbs folded in. One place. */
  _reach() {
    return 3.4 * (this.clan?.buff?.reach ?? 1) * this.power.reach;
  }

  /**
   * Knock one prop over and score it.
   *
   * Lifted out of `_doSlash` when the dive and the charge arrived: three
   * copies of "push it, play a noise, score it if it is fresh" is three places
   * for the bamboo tally or the mischief hook to be forgotten in.
   */
  _knockProp(p, dx, dz, power, world, hud) {
    const push = new THREE.Vector3(dx, 0, dz).normalize();
    const fresh = p.knock(push, power);
    hud?.sfx(p.kind === 'bamboo' ? 'bamboo' : 'hit');
    if (fresh && !p.scored) {
      p.scored = true;
      this.score += p.points ?? 10;
      hud?.sfx('score');
      hud?.onMischief(this, p);
    }
    return fresh;
  }

  _doSlash(world, hud, kind = 'stand') {
    const dir = new THREE.Vector2(Math.sin(this.facing), Math.cos(this.facing));
    // Riverclaw's blade reaches further, and so does every Long Cut orb — and
    // the drawn arc grows with both, so the buff is something you can see
    // rather than just feel. One accessor, so the arc can never disagree with
    // the hitbox it is drawing.
    const reach = this._reach();

    /* THE OTHER KITTEN, FIRST — and through the game, not from here.
       `strikePlayers` is the ONE place that asks whether the two of them are
       allowed to hurt each other, exactly like `strikeWards` is the one place
       that knows what a lock answers to. Testing "am I in the arena?" here
       would put that rule in a second place, and the copy nobody remembers is
       how you end up able to cut your sister down in the market square. */
    hud?.strikePlayers?.(this, kind, reach, dir);
    let hits = 0;
    for (const p of world.props) {
      const dx = p.group.position.x - this.position.x;
      const dz = p.group.position.z - this.position.z;
      const dy = p.group.position.y - this.position.y;
      const dist = Math.hypot(dx, dz);
      if (dist > reach || Math.abs(dy) > 3) continue;
      // 150-degree arc in front
      const dot = (dx * dir.x + dz * dir.y) / (dist || 1);
      if (dot < -0.25) continue;
      // Bamboo gets its own crack; everything else a wooden knock. One per
      // prop is fine â€” the voice cap in the audio engine handles a big hit.
      this._knockProp(p, dx, dz, 1.15, world, hud);
      hits++;
    }
    if (hits) this.squash = 0.6;
  }

  /**
   * The panda's claw swipe — the ground-level counterpart to dragon breath.
   *
   * Wide and heavy but close in, and it swings along the KITTEN's facing
   * rather than the panda's. The panda's drawn heading is locked broadside so
   * it only ever points two ways; hanging the hitbox off that would mean the
   * attack could not be aimed at all. She steers, the panda swings.
   *
   * It DOES cut bamboo — the only thing in the game besides the katana that
   * does. See CLAW in panda.js for why that reversed. Dragon breath and
   * dive-bombing still can't, so the grove stays the place flight fails.
   */
  _doClaw(world, hud) {
    const c = this.pandaMount.swipe(this.facing);
    hud?.sfx('claw');
    const dir = new THREE.Vector2(Math.sin(this.facing), Math.cos(this.facing));
    let hits = 0;
    for (const p of world.props) {
      const dx = p.group.position.x - this.position.x;
      const dz = p.group.position.z - this.position.z;
      const dy = p.group.position.y - this.position.y;
      const dist = Math.hypot(dx, dz);
      if (dist > c.range || Math.abs(dy) > 5) continue;
      const dot = (dx * dir.x + dz * dir.y) / (dist || 1);
      if (dot < 1 - c.spread) continue;
      const push = new THREE.Vector3(dx, 0, dz).normalize();
      const fresh = p.knock(push, c.power);
      // Bamboo keeps its own hollow crack whatever cut it.
      hud?.sfx(p.kind === 'bamboo' ? 'bamboo' : 'hit');
      if (fresh && !p.scored) {
        p.scored = true;
        this.score += p.points ?? 10;
        hud?.sfx('score');
        hud?.onMischief(this, p, 'a panda claw');
      }
      hits++;
    }
    // The boulder over a star answers to this and to nothing else.
    if (hud?.strikeWards) hud.strikeWards(this, 'claw', c.range);
    if (hits) this.squash = 0.6;
  }

  /**
   * Dragon breath: a cone of whatever this breed exhales.
   *
   * Deliberately cannot cut bamboo. Bamboo is the one thing in the world that
   * only answers to the katana, which means the grove is the place you have to
   * get OFF the dragon â€” the flying is more fun for having somewhere it
   * doesn't work.
   */
  _doBreath(world, hud) {
    /* Ryuuseki fires a fan of beams rather than a cone of breath, and owns
       that code because the count and the aim are facts about the dragon and
       the seat, not about the kitten pressing the button. From here it is one
       call either way. The PILOT always gets one beam — see PILOT_BEAMS. */
    if (this.mount.fire) { this.mount.fire(world, hud, this); return; }
    // Windwhisker makes the flame itself bigger, so the dragon draws a longer
    // cone as well as hitting further.
    const k = this.clan?.buff?.breath ?? 1;
    const b = this.mount.breathe(k);
    hud?.sfx('breath');
    const range = b.range * k;
    const dir = new THREE.Vector2(Math.sin(this.facing), Math.cos(this.facing));
    let hits = 0;
    for (const p of world.props) {
      if (p.katanaOnly) continue;
      const dx = p.group.position.x - this.position.x;
      const dz = p.group.position.z - this.position.z;
      const dy = p.group.position.y - this.position.y;
      const dist = Math.hypot(dx, dz);
      if (dist > range || dy > 6 || dy < -range) continue;
      const dot = (dx * dir.x + dz * dir.y) / (dist || 1);
      if (dot < 1 - b.spread) continue;
      const push = new THREE.Vector3(dx, 0, dz).normalize();
      if (p.knock(push, b.power) && !p.scored) {
        p.scored = true;
        this.score += p.points ?? 10;
        hud?.onMischief(this, p, b.name);
      }
      hits++;
    }
    // The ice over a star cracks to any breath. See LOCKS.ice.
    if (hud?.strikeWards) hud.strikeWards(this, 'breath', range);
    if (hits) this.squash = 0.5;
  }

  /**
   * The gunner's seat on Ryuuseki.
   *
   * She steers NOTHING. Her position is whatever the dragon says it is, which
   * is the only honest way to do it — giving the second seat any influence
   * over where the animal goes means two kittens fighting over one heading,
   * and the loser concludes the controls are broken.
   *
   * What she does own is the fan. It is aimed along HER facing, and her stick
   * turns that facing, so she is a turret: she cannot go anywhere but she
   * chooses what gets hit. That division is the whole feature — neither girl
   * can do both, and the dragon only does its best trick when both are aboard.
   */
  _updatePassenger(dt, pad, world, hud) {
    const R = this.rideAlong;
    /* VERTICAL ONLY, exactly like the pilot — her place along his body is a
       DRAW offset (Ryuuseki.drawOffset), applied in faceCamera.
       Doing it here instead put her seat and Ember's on two different clocks:
       this runs in the update phase and the pilot's runs at render, so the two
       were resolved against different values of a heading that swaps. She
       measured 0.112 along his body when the number said 0.38, and no amount
       of staring at the constant would have explained it. Same offset, same
       place, same frame. */
    const seat = R.seatOffset('gunner');
    this.position.set(R.position.x, R.position.y + seat.y, R.position.z);
    this.velocity.set(0, 0, 0);
    this.onGround = false;
    this.airTime = 0;

    // Her stick aims the guns. No stick, and she keeps the last heading.
    const { fwd, right } = this._basis();
    if (Math.abs(pad.mx) + Math.abs(pad.my) > 0.15) {
      const ax = right.x * pad.mx + fwd.x * -pad.my;
      const az = right.z * pad.mx + fwd.z * -pad.my;
      this.facing = Math.atan2(ax, az);
    }
    /* CLAMPED TO HIS HEAD, every frame rather than only when she pushes the
       stick, because the thing she is clamped against MOVES — his drawn
       heading flips whenever the pilot turns decisively, and an aim left
       correct against the old side is 180 degrees out against the new one.
       `Ryuuseki.aimFor` is the same call `fire` makes, so what she is drawn
       pointing at is exactly where the beams will go: a gunner visibly aiming
       one way while seven beams leave the jaw another reads as broken even
       when the beams are the part that's right. */
    this.facing = R.aimFor(this);

    this.attackCooldown -= dt;
    if (pad.pressed('attack') && this.attackCooldown <= 0) {
      this.attackTimer = 0.26;
      this.attackCooldown = 0.55;
      R.fire(world, hud, this);
    }
    if (this.attackTimer > 0) this.attackTimer -= dt;

    if (pad.pressed('mount')) {
      R.gunner = null;
      this.rideAlong = null;
      hud?.sfx('dismount');
      hud?.onRyuDismount?.(this);
    }
  }

  _updateFlight(dt, pad, world, hud) {
    const { fwd, right } = this._basis();
    const wish = new THREE.Vector3()
      .addScaledVector(right, pad.mx)
      .addScaledVector(fwd, -pad.my);

    const moving = wish.lengthSq() > 0.0001;
    if (moving) wish.normalize();

    /* A dragon is a long side-on drawing, so it only really has two poses:
       facing screen-left and facing screen-right. Steering it with the full
       movement heading meant flying "into" the screen put it edge-on, where
       the billboard's mirror test sits right on its threshold and the whole
       creature snapped back and forth â€” pressing UP made it flip.
       So the drawn heading is locked broadside and only swaps on decisive
       LEFT/RIGHT motion. Movement itself is unaffected: that comes from
       `wish` and the camera basis, not from this. */
    const lateral = this.velocity.x * right.x + this.velocity.z * right.z;
    if (Math.abs(lateral) > 2.5) this.flySide = Math.sign(lateral);
    this.flySide = this.flySide || 1;
    this.facing = this.camYaw + this.flySide * (Math.PI / 2);

    const boosting = pad.down('sprint');
    const speed = boosting ? FLY_BOOST : FLY_SPEED;
    const target = wish.multiplyScalar(moving ? speed : 0);

    // Vertical: jump climbs, interact dives, otherwise gently level out.
    let vy = 0;
    if (pad.down('jump')) vy = FLY_LIFT;
    else if (pad.down('interact')) vy = -FLY_LIFT;

    const rate = 26 * dt;
    this.velocity.x += THREE.MathUtils.clamp(target.x - this.velocity.x, -rate, rate);
    this.velocity.z += THREE.MathUtils.clamp(target.z - this.velocity.z, -rate, rate);
    this.velocity.y += THREE.MathUtils.clamp(vy - this.velocity.y, -rate * 1.6, rate * 1.6);

    this.position.addScaledVector(this.velocity, dt);

    /* Don't let the dragon fly through terrain. The floor is measured from the
       DRAGON, not the rider: the creature hangs a seat-height below you, so a
       floor set at the rider's height buries the whole animal in the hill.
       Coming within a couple of units of it counts as hovering, which swaps
       the dragon to its perched pose â€” see Dragon.update. */
    const d0 = this.mount;
    const clearance = d0.seatOffset().y + 1.2;
    const g = world.heightAt(this.position.x, this.position.z, this.position.y);
    const floor = (g ? g.y : -200) + clearance;
    if (this.position.y < floor) {
      this.position.y = floor;
      if (this.velocity.y < 0) this.velocity.y = 0;
    }
    d0.hovering = !!g && this.position.y - floor < 2.5;
    if (this.position.y > 420) {
      this.position.y = 420;
      this.velocity.y = Math.min(0, this.velocity.y);
    }

    // --- breathe ---
    this.attackCooldown -= dt;
    if (pad.pressed('attack') && this.attackCooldown <= 0) {
      this.attackTimer = 0.26;
      this.attackCooldown = 0.5;
      this._doBreath(world, hud);
    }
    if (this.attackTimer > 0) this.attackTimer -= dt;

    // Dive-bomb: flying low and fast scatters everything you pass over â€”
    // except bamboo, which is katana-only.
    if (Math.hypot(this.velocity.x, this.velocity.z) > 18) {
      for (const p of world.props) {
        if (p.katanaOnly) continue;
        const dx = p.group.position.x - this.position.x;
        const dz = p.group.position.z - this.position.z;
        const dy = this.position.y - p.group.position.y;
        if (dy > 6 || dy < -2) continue;
        if (dx * dx + dz * dz > 30) continue;
        const push = new THREE.Vector3(dx, 0, dz).normalize();
        if (p.knock(push, 1.5) && !p.scored) {
          p.scored = true;
          this.score += p.points ?? 10;
          hud?.onMischief(this, p);
        }
      }
    }

    /* The kitten drives; the dragon is hung off the kitten's position so that
       the SEAT lands where the player is. Solving it the other way (dragon
       first, rider offset from it) makes the player's own position lag the
       thing they're steering, and the camera follows the player. */
    const d = this.mount;
    d.facing = this.facing;
    const seat = d.seatOffset();
    d.position.set(
      this.position.x - seat.x,
      this.position.y - seat.y,
      this.position.z - seat.z
    );

    if (pad.pressed('mount')) {
      /* Ryuuseki has no perch to go back to and cannot be lost — there is one
         of him and he was summoned to the town. He simply stops where he is
         and waits, with his mount ring lit, which is also what a gunner still
         aboard needs him to do. */
      if (d.pilot !== undefined) {
        d.pilot = null;
        this.mount = null;
        this.velocity.set(0, 0, 0);
        this.dismountEase = 1;
        hud?.sfx('dismount');
        hud?.onRyuDismount?.(this);
        return;
      }
      /* If there is ANY ground under you, the dragon comes down to it â€” right
         beside you if you stepped off, following you down if you bailed out
         from height. It only goes back to its own perch when you let go over
         open sky, where there's nowhere for it to land. */
      const g = world.heightAt(this.position.x, this.position.z);
      const bailedHigh = !!g && this.position.y - g.y > 12;
      if (!g) d.returnHome();
      else if (bailedHigh) d.flyTo(this.position.x, this.position.z);
      else d.landAt(this.position.x, this.position.z);
      const high = !g;

      this.mount = null;
      this.velocity.y = Math.min(this.velocity.y, 0);
      this.dismountEase = 1;
      hud?.sfx('dismount');
      hud?.toast(
        high ? `${this.name} let go over the sky! ${d.name} flies home`
          : bailedHigh ? `${this.name} jumped! ${d.name} is coming down`
            : `${this.name} hopped off`,
        this.index
      );
    }
  }

  _respawn(world) {
    const g = world.heightAt(0, 30);
    this.position.set(this.index === 0 ? -3 : 3, (g ? g.y : 10) + 2, 30);
    this.velocity.set(0, 0, 0);
  }

  /**
   * Draw the ward.
   *
   * IT HAS TO SAY WHEN IT IS ABOUT TO GO OUT. A bubble that vanishes without
   * warning teaches nothing except that the game is unfair — the last 0.7s
   * flicker at 9Hz, which is early enough to run and unmistakable next to the
   * steady breath it holds for the rest of its life. The white flash on a
   * blocked blow is the other half: a shield you cannot tell is working is
   * indistinguishable from a sister who keeps missing.
   */
  _updateWardMesh(dt) {
    const up = this.wardT > 0;
    this.wardMesh.visible = up;
    if (!up) return;
    this.wardMesh.position.set(0, this.height * 0.55, 0);
    const dying = this.wardT < 0.7;
    const flick = dying ? 0.45 + 0.55 * (Math.sin(this.wardT * 56) > 0 ? 1 : 0) : 1;
    const hit = (this.wardFlash ?? 0) > 0 ? 1 + this.wardFlash * 2.4 : 1;
    this.wardShell.material.opacity = 0.22 * flick * hit;
    this.wardCore.material.opacity = 0.10 * flick * hit;
    // A slow swell, and a pop on the frame it goes up.
    const born = Math.min(1, (this.power.ward.dur - this.wardT) / 0.18);
    this.wardMesh.scale.setScalar(born * (1 + Math.sin(this.wardT * 3.1) * 0.04));
    this.wardShell.rotation.y += dt * 0.7;
    this.wardCore.rotation.y -= dt * 1.1;
  }

  _updateFeedback(dt, world) {
    /* ---- pick the animation row ----
       Attack wins over everything so a slash always reads, then airborne,
       then walking. Ordered by what the player most needs to see. */
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const a = this.anim;
    /* A short airborne threshold on top of the ground snapping above. Snapping
       fixes the physics; this makes the pose robust to any single-frame blip
       that still gets through â€” dropping off a kerb shouldn't strobe. Rising
       fast is exempt so a real jump reads instantly. */
    const airborne = !this.onGround && ((this.airTime ?? 0) > 0.09 || this.velocity.y > 1);
    /* Sitting on a panda holds the IDLE pose. There is no drawn sit, and the
       walk cycle is the wrong lie — legs pumping while the panda does the
       running reads as the kitten sliding along above it. Idle plus the
       animal's own waddle underneath is what sells being carried. */
    if (this.attackTimer > 0) this.sprite.row = a.attack;
    else if (this.mount || airborne) this.sprite.row = a.jump;
    else if (this.pandaMount) this.sprite.row = a.idle;
    else if (speed > 0.9) this.sprite.row = a.walk;
    else this.sprite.row = a.idle;

    // Squash & stretch on jumps, landings and hits.
    this.squash *= 1 - Math.min(1, dt * 7);
    const bob = this.onGround ? Math.abs(Math.sin(this.stepPhase)) * 0.06 : 0;
    const sq = this.squash;

    /* Secondary motion on top of the drawn poses: a breathing rise when idle,
       and a lean that rocks in time with the footstep bob when walking. One
       drawn walk frame plus this reads as a walk cycle; without it the pose
       just slides along the ground. */
    this._updateWardMesh(dt);

    this.idlePhase = (this.idlePhase ?? 0) + dt * 2.1;
    const idling = this.onGround && !this.mount && speed <= 0.9 && this.attackTimer <= 0;
    const breathe = idling ? Math.sin(this.idlePhase) * 0.018 : 0;
    const lean = this.onGround && speed > 0.9 ? Math.sin(this.stepPhase) * 0.05 : 0;
    this.sprite.mesh.rotation.z = lean;

    this.sprite.mesh.scale.set(
      1 + sq * 0.22 + bob * 0.4 - breathe,
      1 - sq * 0.24 + bob + breathe,
      1
    );
    /* Riding: the seat is solved in _updateFlight, so the sprite sits at the
       group origin â€” but it has to RIDE THE WINGBEAT. Without this the kitten
       hangs perfectly still while the dragon heaves up and down underneath
       it, which instantly reads as two separate drawings rather than one
       creature carrying another. */
    /* Riding a panda raises the DRAWING onto its back and leaves the kitten
       herself on the ground, where all the ground physics still expect her —
       see Panda.seatHeight. The dragon needs no equivalent because flight
       moves the whole entity. */
    /* `?? 0` is load-bearing, not defensive noise. `flapBob` is a storm-dragon
       field; Ryuuseki has no wings and did not have one, so this produced
       `undefined`, NaN'd the rider's local Y, and three.js silently refused to
       draw her — the PILOT was invisible on the legendary dragon while the
       gunner, who rides through `rideAlong` and never touches this line, was
       fine. It read exactly like a depth-sorting problem and was not one. Any
       future mount that misses a field must fall back, not vanish. */
    /* `mount ?? rideAlong`, so BOTH seats ride the animal's motion. Reading
       `mount` alone meant the gunner sat perfectly still on a creature that was
       swelling underneath her — two drawings sliding past each other, which is
       the exact thing flapBob exists to prevent, and it was only ever wired up
       for the seat that steers.
       `?? 0` is load-bearing too: flapBob is a storm-dragon field, and when
       Ryuuseki lacked one this line NaN'd the rider's local Y and three.js
       silently refused to draw her. Any mount missing a field must degrade,
       not vanish. */
    const ride = this.mount ?? this.rideAlong;
    this.sprite.mesh.position.y = ride ? (ride.flapBob ?? 0)
      : this.pandaMount ? this.pandaMount.seatHeight + this.pandaMount.bounce : 0;

    /* ---- what being hit LOOKS like ----

       NO NEW ART, AND THAT IS A DECISION RATHER THAN A SHORTCUT. The obvious
       answer to "how do we show a hit" is to generate a hurt pose and a KO
       pose and add two rows to each sheet. Both live sheets are 4x8-or-10
       turnarounds whose rows have to agree with each other about which way
       the character turns, and one of the two sheets in this project is
       already unusable because its rows DON'T (see frost_grid_v2 in
       HANDOFF). Regenerating either to add rows risks the direction mapping
       that every one of the sprite checks in world-check exists to protect —
       to buy two poses that the material can express anyway.

       So all three states are transforms of the drawn cell:
         hit    a hot flash and a recoil lean, away from the blow
         invuln a hard flicker — the arcade convention, and the only one a
                nine-year-old already knows means "can't be hit"
         KO     laid flat on her side, darkened, still visibly herself */
    /* Both live kitten sheets ship untinted (`tint` defaults to white and
       main.js passes none), so this block owns the material colour outright.
       If a sheet ever DOES want a tint, it has to become the rest value here
       rather than a one-off `set` in the constructor — otherwise the first
       hit would wash it out permanently. */
    const mat = this.sprite.mat;
    const base = 1;

    if (this.ko) {
      /* Flat on her back. The JUMP row, not idle: it is the one pose with the
         limbs away from the body, and an idle cell rotated 90 degrees reads
         as a cat standing on a wall rather than as a cat who has been knocked
         over. Which WAY she falls follows the blow. */
      this.sprite.row = a.jump;
      const fall = Math.min(1, (KO_TIME - this.koT) / 0.35);
      this.sprite.mesh.rotation.z = (this.hitLean || 1) * 1.42 * fall;
      this.sprite.mesh.position.y -= this.height * 0.30 * fall;
      mat.color.setRGB(base * 0.52, base * 0.46, base * 0.55);
      this.sprite.mesh.visible = true;
    } else if (this.flashT > 0) {
      /* Brighter than white. `toneMapped: false` on this material means the
         renderer hands the colour straight through, so pushing the red
         channel past 1 blows the sprite out into a hot flash instead of
         merely tinting it — a tint at these sizes is invisible. */
      const f = this.flashT / 0.3;
      mat.color.setRGB(base * (1 + f * 1.5), base * (1 - f * 0.42), base * (1 - f * 0.5));
      this.sprite.mesh.rotation.z = lean + (this.hitLean || 1) * 0.42 * f;
      this.sprite.mesh.visible = true;
    } else if (this.invulnT > 0) {
      /* A HARD FLICKER, NOT A FADE. Fading is the natural reach and it does
         not work here: the material runs `alphaTest: 0.35`, so any opacity
         below that discards every pixel of the sprite at once and she does
         not fade out, she disappears in one step. Toggling visibility is
         honest about what the material can actually do, and it is also the
         convention every game a kid has played uses for exactly this. */
      mat.color.setRGB(base, base, base);
      this.sprite.mesh.visible = Math.floor(this.invulnT * 16) % 2 === 0;
    } else {
      mat.color.setRGB(base, base, base);
      this.sprite.mesh.visible = true;
    }

    // Slash arc: snap out and fade. The panda draws its own claw marks, so the
    // katana arc stays sheathed while she's riding — two overlapping arcs on
    // one swing just reads as a smear.
    /* Sheathed whenever she is riding ANYTHING. The panda draws its own claw
       marks and a dragon breathes; in both cases the katana arc is a second
       overlapping effect for one button press. On Ryuuseki it was unmissable —
       a two-metre sword swipe going off in the middle of a thirty-metre dragon
       every time the beams fired. The dragon case was there before he was, it
       was just small enough on a storm dragon to look like part of the breath. */
    const riding = this.pandaMount || this.mount || this.rideAlong;
    if (this.attackTimer > 0 && !riding) {
      const t = 1 - this.attackTimer / 0.26;
      this.slash.visible = true;
      this.slash.material.opacity = (1 - t) * 0.9;
      /* The arc geometry is a ring wedge centred on its own local +X. After
         the -90 degree X rotation that lays it flat, local +X points along
         world +X, which is a facing angle of PI/2 â€” not 0. So the yaw needs
         that quarter turn removed, and it needs +facing, not -facing: the old
         `-facing` mirrored the arc across the diagonal, which read as the
         slash coming out sideways or backwards depending on which way you
         were walking. */
      this.slash.rotation.y = this.facing - Math.PI / 2 + (1 - t) * 0.7;
      this.slash.scale.setScalar((0.7 + t * 0.9) * (this.clan?.buff?.reach ?? 1));
    } else {
      this.slash.visible = false;
    }

    // The panda carries its own ring in the same colour, so two would stack.
    this.marker.visible = !this.mount && !this.pandaMount;

    /* THE EDGE WARNING GOES ON HER FEET, because that is what is about to
       leave the stage. `Tournament._updateOut` sets `nearEdge` inside the
       last few units of deck and rules at the line, and the gap between the
       two is the entire point: a thirty-point penalty that arrives with no
       warning reads as the game taking health off you for no reason.
       Her own colour ring is already the thing a player uses to find herself
       in a scrap, so flashing THAT red needs no new object and no new place
       to look — she is watching it anyway. */
    const edgeLit = !!(this.nearEdge && this.hpGroup.visible);
    if (edgeLit) {
      /* SAVED ON THE WAY IN, not reconstructed on the way out. This ring is
         also the clan badge — `_updateGround` recolours it the moment she
         swears an oath — so restoring it to "her player colour" would
         silently strip a Thunderpaw kitten's green the first time she backed
         toward the edge of the ring. Remember what it actually was. */
      if (!this._edgeLit) this._edgeSaved = this.marker.material.color.getHex();
      const beat = Math.sin((this.idlePhase ?? 0) * 11) > 0;
      this.marker.material.color.set(beat ? 0xff2a20 : 0xfff0a0);
      this.marker.material.opacity = 0.95;
      this.marker.scale.setScalar(1.25);
    } else if (this._edgeLit) {
      this.marker.material.color.set(this._edgeSaved ?? (this.index === 0 ? 0xff8a3d : 0xff6fae));
      this.marker.material.opacity = 0.75;
      this.marker.scale.setScalar(1);
    }
    this._edgeLit = edgeLit;

    // Blob shadow tracks the ground below and shrinks with altitude.
    const g = world.heightAt(this.position.x, this.position.z, this.position.y);
    if (g) {
      const drop = this.position.y - g.y;
      this.shadow.visible = drop < 60;
      this.shadow.position.y = -drop + 0.05;
      const k = Math.max(0.2, 1 - drop / 60);
      this.shadow.scale.setScalar(0.6 + k * 0.6);
      this.shadow.material.opacity = 0.4 * k;
      this.marker.position.y = -drop + 0.07;
    } else {
      this.shadow.visible = false;
      this.marker.visible = false;
    }
  }

  _updateCamera(dt) {
    // Look slightly ahead of the kitten so you can see where you're going.
    const flying = !!(this.mount || this.rideAlong);
    const lead = flying ? 0.55 : this.pandaMount ? 0.42 : 0.25;
    /* On a big mount, look at and orbit THE RIDERS AS DRAWN.
       Their `position` is the animal's centre — the seats are draw offsets —
       so aiming at "the rider" and aiming at "the dragon" are the same point,
       which is why pulling the camera back never re-framed anything. The place
       a player is actually watching is the pair of kittens on his neck.
       `camScale` marks the mounts that want this. */
    const big = (this.mount ?? this.rideAlong);
    const mid = big?.camScale ? big.ridersMidpoint() : null;
    const aim = mid ?? this.position;
    // Aim at where the kitten is DRAWN, which on a panda is up on its back.
    const want = new THREE.Vector3(
      aim.x + this.velocity.x * lead,
      aim.y + (mid ? 0 : (flying ? 2.5 : 1.4))
        + (this.pandaMount ? this.pandaMount.seatHeight : 0),
      aim.z + this.velocity.z * lead
    );
    const follow = flying ? 3.2 : 7.5;
    this.camTarget.lerp(want, Math.min(1, dt * follow));

    // Distance grows with speed and altitude â€” that's the Dragon Ball Z zoom.
    const speed = this.velocity.length();
    /* Riding gets its own range, between the walking camera and the flying
       one — which is exactly where the speed sits. The walking camera tops out
       at 34 units, close enough that at a panda's pace the next building is on
       screen only after you have hit it. It also has to start further back
       than the walking one whatever the speed, because the kitten is sitting
       four units up and the animal under her is another six wide. */
    /* The flying range is sized for a storm dragon, whose quad is about 24
       units across. The ride distance scales with whatever you are actually on
       rather than assuming every flying thing is the same size — `mountScale`
       is 1 for a storm dragon by construction.

       A mount may ask for MORE than its size implies, and Ryuuseki does. A
       yaw-only billboard only really faces you at its centre; the further its
       edges are off the view axis the more the perspective keystones them, and
       on a creature nearly thirty units wide that reads as the whole dragon
       being rotated twenty degrees away from you rather than as perspective.
       Pulling the camera back shrinks the angle he subtends, which is the only
       thing that actually fixes it short of abandoning yaw-only billboards —
       and it is also what lets you see the ground he is flying over. */
    const seat = this.mount ?? this.rideAlong;
    const mountScale = seat ? (seat.camScale ?? Math.max(1, seat.quad / 24)) : 1;
    let wantDist = seat
      ? THREE.MathUtils.clamp((46 + speed * 1.5) * mountScale, 46 * mountScale, 320)
      : this.pandaMount
        ? THREE.MathUtils.clamp(28 + speed * 0.6, 28, 52)
        : THREE.MathUtils.clamp(24 + speed * 0.35, 24, 34);
    let pitch = flying ? CAM_PITCH_AIR : CAM_PITCH_GROUND;

    // Ease into (and out of) a focus area.
    const active = this.focus && !flying;
    this.focusT += ((active ? 1 : 0) - this.focusT) * Math.min(1, dt * 2.2);
    let yaw = CAM_YAW;
    if (this.focusT > 0.001 && this.focus) {
      const t = this.focusT;
      wantDist = THREE.MathUtils.lerp(wantDist, this.focus.dist, t);
      pitch = THREE.MathUtils.lerp(pitch, this.focus.pitch, t);
      yaw = THREE.MathUtils.lerp(CAM_YAW, this.focus.yaw ?? CAM_YAW, t);
      // Slide the look-at toward the middle of the diagram so it stays centred
      // however far around the circle the player walks.
      this.camTarget.lerp(this.focus.centre, Math.min(1, dt * 3.4) * t);
    }

    /* THE STAR SHOT. Applied on top of whatever the camera was already doing
       rather than through `setFocus`, because `focus` is the Dojo's and the
       two overlap: the dojo island has a star on it, and a kitten can be
       standing on the unit circle when she finds it. Composing means the shot
       pulls in from wherever the dojo had put the camera instead of the two
       systems fighting over one field.
       Eased in and out on a sine so it never snaps — the pose is two seconds
       long and half a second of that is the camera moving. */
    if (this.aloftT > 0) {
      const dur = this.aloftDur || 2;
      const k = Math.sin(Math.min(1, (1 - this.aloftT / dur) / 0.25) * Math.PI * 0.5)
        * Math.min(1, this.aloftT / 0.45);
      wantDist = THREE.MathUtils.lerp(wantDist, flying ? wantDist * 0.62 : 12, k);
      pitch = THREE.MathUtils.lerp(pitch, 0.42, k);
    }

    this.camYaw = yaw;

    /* Easing back down after a dismount. The flight camera sits up to 130
       units out and the ground camera at 24, so snapping between them at the
       normal follow rate is a lurch right at the moment the player is trying
       to work out where they landed. Decay the ease so it only slows the
       first second or so. */
    this.dismountEase = Math.max(0, (this.dismountEase ?? 0) - dt * 0.9);
    const zoomRate = this.mount ? 1.6 : THREE.MathUtils.lerp(4, 1.5, this.dismountEase);
    this.camDist += (wantDist - this.camDist) * Math.min(1, dt * zoomRate);

    this._offset.set(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch)
    ).multiplyScalar(this.camDist);

    this.camera.position.copy(this.camTarget).add(this._offset);
    this.camera.lookAt(this.camTarget);
  }
}
