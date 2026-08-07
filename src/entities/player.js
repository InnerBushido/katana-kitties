import * as THREE from 'three';
import { Billboard } from '../core/gfx.js';
import { PANDA_SPEED, PANDA_JUMP } from './panda.js';

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

const FLY_SPEED = 34;
const FLY_BOOST = 62;
const FLY_LIFT = 20;

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
    /** The storm dragon being flown, or null. Flight is a whole other mode. */
    this.mount = null;
    /** The panda being ridden, or null. Riding one is still GROUND movement —
     *  see _updateGround — so it deliberately does not go through `mount`. */
    this.pandaMount = null;
    /** This kitten's own panda, once she has raised one. */
    this.panda = null;
    /** Lifetime bamboo canes cut. Feeds the panda; see PANDA_TIERS. */
    this.bambooCut = 0;
    this.score = 0;
    this.radius = 0.75;
    this.height = height;

    this.attackTimer = 0;
    this.attackCooldown = 0;
    this.stepPhase = 0;
    this.squash = 0;

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
    // A mounted kitten sits inside the dragon's billboard quad, so at equal
    // depth it loses the sort and disappears. Nudging the rider toward the
    // camera puts it cleanly in front from every angle â€” and it has to happen
    // per view, because the two split-screen cameras see it from different
    // sides.
    if (this.mount || this.pandaMount) {
      const dx = camera.position.x - this.position.x;
      const dz = camera.position.z - this.position.z;
      const len = Math.hypot(dx, dz) || 1;
      this.sprite.position.set((dx / len) * 2.4, 0, (dz / len) * 2.4);
    } else if (this.sprite.position.lengthSq() > 0) {
      this.sprite.position.set(0, 0, 0);
    }
  }

  /* ------------------------------- update ------------------------------- */

  update(dt, pad, world, dragons, hud) {
    if (this.mount) this._updateFlight(dt, pad, world, hud);
    else this._updateGround(dt, pad, world, dragons, hud);

    this.group.position.copy(this.position);
    this.sprite.facing = this.facing;
    this._updateFeedback(dt, world);
    this._updateCamera(dt);
  }

  _updateGround(dt, pad, world, dragons, hud) {
    const { fwd, right } = this._basis();
    const wish = new THREE.Vector3()
      .addScaledVector(right, pad.mx)
      .addScaledVector(fwd, -pad.my);

    const moving = wish.lengthSq() > 0.0001;
    if (moving) {
      wish.normalize();
      this.facing = Math.atan2(wish.x, wish.z);
    }

    const sprinting = pad.down('sprint') && moving;
    const buff = this.clan?.buff;
    const speedK = buff?.speed ?? 1;
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

    this.velocity.x += THREE.MathUtils.clamp(target.x - this.velocity.x, -rate, rate);
    this.velocity.z += THREE.MathUtils.clamp(target.z - this.velocity.z, -rate, rate);
    this.velocity.y -= GRAVITY * dt;

    // --- jump / double jump ---
    if (this.onGround) this.coyote = COYOTE;
    else this.coyote -= dt;

    /* Shadowtail grants a third jump and a little more lift. `maxJumps` is
       read wherever the count is refilled, so landing restores all of them. */
    const jumpK = (buff?.jump ?? 1) * (this.pandaMount ? PANDA_JUMP : 1);
    this.maxJumps = buff?.jumps ?? 2;
    if (pad.pressed('jump')) {
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
    if (pad.pressed('attack') && this.attackCooldown <= 0) {
      this.attackTimer = 0.26;
      if (this.pandaMount) {
        this.attackCooldown = 0.45;
        this._doClaw(world, hud);
      } else {
        this.attackCooldown = 0.36;
        hud?.sfx('slash');
        this._doSlash(world, hud);
      }
    }
    if (this.attackTimer > 0) this.attackTimer -= dt;

    // --- move + collide ---
    const wasX = this.position.x;
    const wasZ = this.position.z;
    this.position.addScaledVector(this.velocity, dt);

    const fixed = world.resolveSolids(this.position.x, this.position.z, this.radius);
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
        }
      }
    }

    // --- swear to a clan ---
    if (pad.pressed('interact')) {
      const hall = world.clanHallNear(this.position.x, this.position.z);
      if (hall && this.clan?.id !== hall.clan.id) {
        this.clan = hall.clan;
        this.marker.material.color.set(hall.clan.color);
        hud?.sfx('clan');
        hud?.onJoinClan?.(this, hall.clan);
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

  _doSlash(world, hud) {
    const dir = new THREE.Vector2(Math.sin(this.facing), Math.cos(this.facing));
    // Riverclaw's blade reaches further — and the drawn arc grows with it, so
    // the buff is something you can see rather than just feel.
    const reach = 3.4 * (this.clan?.buff?.reach ?? 1);
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
      const push = new THREE.Vector3(dx, 0, dz).normalize();
      const fresh = p.knock(push, 1.15);
      // Bamboo gets its own crack; everything else a wooden knock. One per
      // prop is fine â€” the voice cap in the audio engine handles a big hit.
      hud?.sfx(p.kind === 'bamboo' ? 'bamboo' : 'hit');
      if (fresh && !p.scored) {
        p.scored = true;
        this.score += p.points ?? 10;
        hud?.sfx('score');
        hud?.onMischief(this, p);
      }
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
    if (hits) this.squash = 0.5;
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
    this.sprite.mesh.position.y = this.mount ? this.mount.flapBob
      : this.pandaMount ? this.pandaMount.seatHeight + this.pandaMount.bounce : 0;

    // Slash arc: snap out and fade. The panda draws its own claw marks, so the
    // katana arc stays sheathed while she's riding — two overlapping arcs on
    // one swing just reads as a smear.
    if (this.attackTimer > 0 && !this.pandaMount) {
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
    const lead = this.mount ? 0.55 : this.pandaMount ? 0.42 : 0.25;
    // Aim at where the kitten is DRAWN, which on a panda is up on its back.
    const want = new THREE.Vector3(
      this.position.x + this.velocity.x * lead,
      this.position.y + (this.mount ? 2.5 : 1.4)
        + (this.pandaMount ? this.pandaMount.seatHeight : 0),
      this.position.z + this.velocity.z * lead
    );
    const follow = this.mount ? 3.2 : 7.5;
    this.camTarget.lerp(want, Math.min(1, dt * follow));

    // Distance grows with speed and altitude â€” that's the Dragon Ball Z zoom.
    const speed = this.velocity.length();
    /* Riding gets its own range, between the walking camera and the flying
       one — which is exactly where the speed sits. The walking camera tops out
       at 34 units, close enough that at a panda's pace the next building is on
       screen only after you have hit it. It also has to start further back
       than the walking one whatever the speed, because the kitten is sitting
       four units up and the animal under her is another six wide. */
    let wantDist = this.mount
      ? THREE.MathUtils.clamp(46 + speed * 1.5, 46, 130)
      : this.pandaMount
        ? THREE.MathUtils.clamp(28 + speed * 0.6, 28, 52)
        : THREE.MathUtils.clamp(24 + speed * 0.35, 24, 34);
    let pitch = this.mount ? CAM_PITCH_AIR : CAM_PITCH_GROUND;

    // Ease into (and out of) a focus area.
    const active = this.focus && !this.mount;
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
