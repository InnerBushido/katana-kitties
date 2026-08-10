import * as THREE from 'three';
import { Billboard } from '../core/gfx.js';
import { MAX_HP } from './player.js';

/* ---------------------------------------------------------------------------
   Ring snacks — the rats, rabbits and birds that live on the tournament deck.

   THEY EXIST ONLY INSIDE THE ARENA, AND ONLY WHILE A TOURNAMENT IS RUNNING.
   That is not squeamishness, it is the same fence the combat sits behind: this
   whole project deliberately has no hunting and no enemies in the world, and
   the katana exists to knock scenery over. What changed for the tournament is
   that the two players fight *each other* in one ring at one time — and a
   health bar with no way to refill it is what makes a three-round match a
   grind. So the snack is a tournament rule, spawned by `Menagerie`, and it can
   no more appear in the market square than a dash attack can land there.

   THE JOKE IS THE POINT. She pins the thing, it goes bug-eyed, there is a
   two-second hold where neither of you can move, and it vanishes in a puff.
   Nothing is drawn being hurt: every animal has exactly two drawings, a normal
   one and a comically startled one, and the second is the last thing you see
   before the poof. A nine-year-old should laugh at this, and the moment it
   reads as cruelty rather than as slapstick the feature has failed.

   THREE ANIMALS, ONE VERB, THREE DIFFICULTIES:

     hit it        it STOPS DEAD, stunned (a bird goes in your mouth instead)
     stand by it   hold attack for two seconds
     eat

     rat      slowest, and always on the floor           easiest   10 hp
     rabbit   fast, and airborne half the time           harder    15 hp
     bird     overhead, and a five-second fuse after     hardest   20 hp

   THE SWING IS THE CATCH, AND THAT IS A CORRECTION. The first version had
   three different ways in — a rat grabbed off the floor, a rabbit knocked out
   of its hop, a bird taken out of the air — and the rat, the EASIEST animal
   and the one that is supposed to teach the whole mechanic, turned out to be
   the one you could not catch. It runs at 8.2 against a kitten's 10.5 walk, so
   closing to within a 3.4 grab radius means cornering it, and it flees the
   moment you are close enough to try. Three separate verbs also meant a
   nine-year-old had to work out which animal wanted which before ANY of them
   worked.

   So now a swing that reaches any of them stops it, and the difficulty lives
   in how hard that swing is to land rather than in what the button does —
   which is the tournament's own principle, where the three attacks are three
   things she already does. Landing a hit on a rat is easy; on a rabbit three
   metres up in the middle of a hop it is not.

   The grab survives underneath it: walking into a grounded animal and pressing
   attack still pins it outright, because the pin is checked before the swing.
   That is the easy path, and it stays open for anyone who gets close enough.
--------------------------------------------------------------------------- */

/**
 * How long the hold is, and how long a bird will sit in a mouth.
 *
 * TWO SECONDS IS A LONG TIME IN A LIVE ROUND, and it is meant to be. She is
 * rooted, she cannot block, and her sister can see exactly what she is doing —
 * so eating in the middle of a fight is a gamble rather than a free top-up.
 * Between rounds, where there is nobody to punish it, the same two seconds is
 * simply the pace of the feast.
 */
export const EAT_TIME = 2.0;
/** A bird that is not swallowed inside this gets away, and heals nobody. */
export const MOUTH_TIME = 5.0;
/** How far off her the pin reaches. Generous — she is aiming at a rat. */
export const CATCH_RADIUS = 3.4;
/** A rabbit knocked out of its hop sits here this long before it recovers. */
export const STUN_TIME = 3.2;

/**
 * The three animals.
 *
 * `heal` IS AN ABSOLUTE NUMBER OFF `MAX_HP`, NOT A FRACTION OF HER OWN BAR.
 * An Adamant orb raises `player.maxHp`, and a percentage of that would quietly
 * make every snack in the ring stronger for whichever kitten is wearing more
 * armour — the orb would be buffing her healing as well as her health, which
 * is a stack nobody asked for and nobody could see. 10 / 15 / 20 against the
 * base hundred, in difficulty order, and `Menagerie` clamps to her real bar.
 *
 * `size` is the DRAWN HEIGHT OF THE CALM POSE in world units, measured against
 * a 2.9-unit kitten — the same convention the panda tiers use, and for the
 * same reason: a number that means "how big is the animal" survives the art
 * being redrawn, and a number that means "how big is its atlas cell" does not.
 * The startled and leaping drawings are sized to cover the same area as the
 * calm one rather than to the same height; see `poseQuad`.
 */
export const CRITTERS = [
  {
    id: 'rat',
    name: 'rat',
    kind: 'ground',
    heal: Math.round(MAX_HP * 0.10),
    size: 0.9,
    /** Top speed while bolting away from a kitten. Faster than a walk (10.5)
     *  is unfair; this is caught by walking at it and swinging. */
    speed: 8.2,
    /** It notices you at this range and runs. */
    flee: 9,
    /** Cell fraction the drawn animal fills — overwritten from the atlas. */
    colour: 0x8d7a6b,
  },
  {
    id: 'rabbit',
    name: 'rabbit',
    kind: 'hopper',
    heal: Math.round(MAX_HP * 0.15),
    size: 1.35,
    /* FASTER THAN THE RAT, and it has to be now that one swing catches
       anything. The two used to be separated by what the button did; they are
       separated by how hard the swing is to land instead, so the middle animal
       has to be genuinely harder to corner than the easy one. */
    speed: 9.0,
    flee: 11,
    /**
     * Launch speed of a hop, and the gap between them.
     *
     * TWICE THE HEIGHT, WHICH IS NOT TWICE THE SPEED. Hop height is v²/2g, so
     * doubling it means multiplying the launch by √2: 8.4 → 11.88, which puts
     * the top of a hop 2.94 units up instead of 1.47. That is most of a
     * kitten's height and it is what makes the rabbit the middle difficulty —
     * it spends longer in the air, higher, and a swing has to be timed rather
     * than merely aimed. Deliberately still inside the aerial window
     * `Menagerie.strike` allows (6.5), or it would stop being catchable
     * instead of becoming harder to catch.
     */
    hopV: 11.88,
    /**
     * Seconds ON THE GROUND between hops — chased, and not chased.
     *
     * Both are re-rolled with up to 100% jitter every time, so the hop can
     * never be counted on a beat (see `_hopStep`). They are set against the
     * hop itself, which is 2·hopV/g ≈ 0.99s of air:
     *
     *   chased   0.7-1.4s on the ground   -> a hop every ~2s, about half air
     *   calm     2.9-5.8s on the ground   -> a hop every ~5s, about a fifth
     *
     * IT HAS TO RUN MORE THAN IT HOPS, which is what these are tuned to. At
     * 0.35 the chased rabbit was airborne two thirds of the time and read as a
     * bouncing ball rather than as an animal running away that occasionally
     * leaps — and the ground drawing, which is the whole reason there are two,
     * barely appeared. The gap between the two numbers is the tell that
     * something is chasing it, and it wants to stay wide.
     */
    hopGap: 0.7,
    hopIdle: 2.9,
    colour: 0xc9a476,
  },
  {
    id: 'bird',
    name: 'bird',
    kind: 'flier',
    heal: Math.round(MAX_HP * 0.20),
    size: 1.1,
    speed: 9.4,
    flee: 13,
    /** How far above the deck it cruises. Above a jump, below an aerial. */
    cruise: 4.6,
    colour: 0x5f86a8,
  },
];

export const CRITTER_BY_ID = Object.fromEntries(CRITTERS.map((c) => [c.id, c]));

/** Gravity for a hopping rabbit. Its own, so retuning the kittens can't
 *  silently change how far a rabbit hops. */
const HOP_G = 24;

/** Where each named drawing sits in `Critter.poses`. */
const POSE_IX = { calm: 0, shock: 1, air: 2 };

/**
 * How big to build the quad for one pose of one animal.
 *
 * EVERY DRAWING OF ONE ANIMAL IS SIZED BY AREA, NOT BY HEIGHT, and getting
 * that wrong is what made the running rabbit and the leaping rabbit look like
 * two different animals. `contentScale` is the fraction of its cell a drawing
 * reaches UP, and dividing by it makes any single figure exactly `size` tall —
 * which is right, and is the whole reason it exists, for a creature with one
 * drawing. Give the same creature a second pose and it becomes actively wrong:
 *
 *   rabbit_run.png    bbox 665 x 368    ->  1.35 tall, 2.44 LONG
 *   rabbit.png        bbox 656 x 534    ->  1.35 tall, 1.77 long
 *
 * Both are the same rabbit drawn at the same scale — the body is 660-odd
 * pixels long in each — but one is stretched flat out and one is bunched up
 * mid-leap, so equalising their HEIGHTS stretches the flat one 38% longer than
 * the other. On screen the animal visibly grew the moment it landed.
 *
 * So `size` means the drawn height of the CALM pose, which is the one that is
 * on screen most of the time and the one every number in `CRITTERS` was tuned
 * against, and every other pose is scaled to cover the same amount of ink
 * (`contentArea`). A rabbit mid-leap therefore comes out taller and shorter
 * than one mid-run, which is what a rabbit mid-leap is.
 *
 * Art with no `contentArea` — the smoke test's stub atlases, and any sheet
 * loaded by something older — falls back to the height rule, so a missing
 * measurement costs the consistency and never the sprite.
 */
export function poseQuad(size, calm, pose) {
  const base = size / (calm?.contentScale || 1);
  if (!pose || pose === calm) return base;
  if (!calm?.contentArea || !pose.contentArea) return size / (pose.contentScale || 1);
  return base * (calm.contentArea / pose.contentArea);
}

/**
 * One animal on the deck.
 *
 * Its drawn heading is locked BROADSIDE, exactly like the panda and the ridden
 * dragon: these are single side-on drawings, so heading "into" the screen puts
 * them edge-on at the billboard's mirror threshold and the animal strobes
 * between its own two mirror images. The lock is measured against the camera's
 * yaw, which in the arena is the one shared rig — a round is always one screen.
 */
export class Critter {
  /**
   * @param {object} spec  an entry from CRITTERS
   * @param {object} art   { calm, shock } loaded atlases, each one cell
   */
  constructor(spec, art) {
    this.spec = spec;
    this.id = spec.id;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.facing = 0;
    this.side = 1;
    this.step = Math.random() * Math.PI * 2;

    /** roam | stunned | pinned | mouthed | gone */
    this.state = 'roam';
    /** Counts down in `stunned` and in `mouthed`; counts up in `pinned`. */
    this.t = 0;
    /** The player holding it — pinned or mouthed. */
    this.holder = null;
    /** Where it is heading while roaming, and how long before it picks again. */
    this.wanderT = 0;
    this.wish = new THREE.Vector2();

    this.group = new THREE.Group();

    /* ONE DRAWING PER POSE, TOGGLED — the panda's two-tier pattern, and for
       the same mechanical reason: a Billboard bakes its size into its
       geometry, so two sheets that packed at different scales cannot share one
       quad. It is also the reason there is no "hurt" art anywhere in this
       game: adding rows to a sheet risks the direction mapping every sprite
       check exists to protect, and separate single-cell files never can.

       `air` IS OPTIONAL AND ONLY THE RABBIT HAS ONE. It shipped without: the
       only rabbit drawing was the mid-leap one, so the animal was permanently
       frozen in a jump pose whether it was in the air or scampering along the
       floor — which reads as a broken sprite, not as a rabbit. Anything with
       no `air` sheet falls back to `calm`, which is right for a rat (it never
       leaves the ground) and for a bird (it never touches it). */
    this.poses = ['calm', 'shock', 'air'].map((k) => {
      const a = art?.[k] ?? art?.calm;
      /* SIZED AGAINST THE CALM DRAWING BY AREA, not against its own height —
         see `poseQuad`. Height-normalising each pose separately is what made
         the rabbit change size between running and hopping. */
      const quad = poseQuad(spec.size, art?.calm, a);
      const b = new Billboard(a.texture, {
        cols: 1,
        rows: 1,
        width: quad,
        height: quad,
        footOffset: (a.pad ?? 0) * quad,
        /* WHICH WAY A DRAWING FACES IS DECLARED PER DRAWING, NOT PER SPECIES.
           Six of the seven sheets came back drawn facing left as asked and the
           startled rabbit came back facing right — image models do not honour
           that instruction any more reliably than they honour "exactly eight
           columns", which is the same lesson `loadSpriteAtlas` learned by
           counting the cells rather than trusting the prompt. Two poses of one
           animal disagreeing means the rabbit spins round at the instant she
           pins it, which is exactly the moment a player is looking at it.
           The flag lives beside the filename in `main.js`, because that is
           where somebody replacing the art will be looking. */
        artFacesRight: !!a.facesRight,
      });
      b.visible = k === 'calm';
      b.quad = quad;
      this.group.add(b);
      return b;
    });
    this.sprite = this.poses[0];
    this.quad = this.sprite.quad;

    const shadowGeo = new THREE.CircleGeometry(1, 16);
    shadowGeo.rotateX(-Math.PI / 2);
    this.shadow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({
      color: 0x2a1830, transparent: true, opacity: 0.3, depthWrite: false,
    }));
    this.shadow.scale.setScalar(spec.size * 0.34);
    this.group.add(this.shadow);

    /* The "you can grab this" ring. It is on the ANIMAL rather than on the
       kitten because the question it answers is about the animal — which of
       the three things scuttling round the deck is close enough right now.
       A prompt on her would have to name one of them anyway. */
    const ringGeo = new THREE.RingGeometry(0.74, 0.98, 22);
    ringGeo.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: 0xffe27a, transparent: true, opacity: 0,
      depthWrite: false, toneMapped: false,
    }));
    this.ring.scale.setScalar(spec.size * 0.9);
    this.group.add(this.ring);
  }

  /** True when a kitten standing next to it may pin it with the attack button. */
  get pinnable() {
    if (this.state === 'stunned') return true;
    if (this.state !== 'roam') return false;
    // A rabbit in mid-hop and a bird in the air are not grabbed off the floor;
    // each has its own way in. See Menagerie.strike.
    if (this.spec.kind === 'flier') return false;
    return this.onGround;
  }

  /**
   * True when a swing can stop it — which is any of them, any time they are
   * loose.
   *
   * IT USED TO DEPEND ON THE SPECIES and that is what made the rat
   * uncatchable: a rat was pin-only, so the one animal slow enough to teach
   * the mechanic was the one the katana could not touch. There is no reading
   * of "hit the animal" under which a sword swing passing through a rat should
   * do nothing.
   */
  get swattable() {
    return this.state === 'roam';
  }

  /**
   * Show one of the drawings. `calm` | `shock` | `air`.
   *
   * Cheap enough to call every frame — it returns immediately unless the pose
   * actually changed, which matters because `_paint` asks for one on every one
   * of them.
   */
  _setPose(name) {
    const want = POSE_IX[name] ?? 0;
    if (this.sprite === this.poses[want]) return;
    this.poses.forEach((b, i) => { b.visible = i === want; });
    this.sprite = this.poses[want];
    this.quad = this.sprite.quad;
  }

  /** Swap to the bug-eyed drawing, or back to whatever it should be doing. */
  setShocked(on) {
    this._setPose(on ? 'shock' : this._loosePose());
  }

  /** Which drawing a free animal should be using right now. */
  _loosePose() {
    return this.onGround === false ? 'air' : 'calm';
  }

  /** Knocked out of the air. It drops, sits down and goes cross-eyed. */
  stun() {
    this.state = 'stunned';
    this.t = STUN_TIME;
    this.velocity.set(0, 0, 0);
    this.setShocked(true);
  }

  /** Held under a paw. `t` counts UP toward EAT_TIME. */
  pin(player) {
    this.state = 'pinned';
    this.holder = player;
    this.t = 0;
    this.velocity.set(0, 0, 0);
    this.setShocked(true);
  }

  /** In a kitten's mouth, wings going, on a five-second fuse. */
  mouth(player) {
    this.state = 'mouthed';
    this.holder = player;
    this.t = MOUTH_TIME;
    this.velocity.set(0, 0, 0);
    this.setShocked(true);
  }

  /**
   * Let go without eating it — she moved, she let the button up, or the bird's
   * five seconds ran out. It bolts, and it is briefly un-catchable so a kitten
   * mashing attack cannot re-pin it on the same frame she dropped it.
   */
  release() {
    this.state = 'roam';
    this.holder = null;
    this.t = 0;
    this.setShocked(false);
    this.panicT = 1.4;
    this.wanderT = 0;
  }

  /* ------------------------------ movement ------------------------------- */

  /**
   * @param {number} dt
   * @param {object} world
   * @param {Array}  players kittens it should be frightened of
   * @param {object} deck    { x, z, half, y } the stone it may not leave
   * @param {number} camYaw  for the broadside lock
   */
  update(dt, world, players, deck, camYaw) {
    this.step += dt * 6;
    this.panicT = Math.max(0, (this.panicT ?? 0) - dt);

    switch (this.state) {
      case 'pinned': this._updatePinned(dt); break;
      case 'mouthed': this._updateMouthed(dt); break;
      case 'stunned':
        this.t -= dt;
        this._fall(dt, world, deck);
        if (this.t <= 0) this.release();
        break;
      default: this._roam(dt, world, players, deck); break;
    }

    this.group.position.copy(this.position);
    this._aim(camYaw);
    this._paint(dt, world, players);
  }

  /**
   * Wander, and run from anybody who gets close.
   *
   * The flee vector is the SUM over both kittens rather than a chase of the
   * nearest one. Two fighters converging on the same rat from opposite sides
   * cancel out under a nearest-only rule and it stands perfectly still between
   * them, which looks broken; summing makes it squirt out sideways, which is
   * what a rat does and is much funnier to watch.
   */
  _roam(dt, world, players, deck) {
    let fx = 0;
    let fz = 0;
    for (const p of players) {
      if (!p || p.angel) continue;
      const dx = this.position.x - p.position.x;
      const dz = this.position.z - p.position.z;
      const d = Math.hypot(dx, dz);
      if (d > this.spec.flee || d < 0.001) continue;
      // Hardest at the kitten's feet, nothing at the edge of its notice.
      const k = (1 - d / this.spec.flee) ** 1.5;
      fx += (dx / d) * k;
      fz += (dz / d) * k;
    }
    const scared = Math.hypot(fx, fz) > 0.02;

    if (scared) {
      const l = Math.hypot(fx, fz);
      this.wish.set(fx / l, fz / l);
      this.wanderT = 0;
    } else {
      /* Nobody near: amble. A new heading every second or two with pauses in
         between — a critter that moves constantly reads as a machine on a
         path, and the pauses are what make it look like an animal deciding. */
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = 0.9 + Math.random() * 1.6;
        if (Math.random() < 0.3) this.wish.set(0, 0);
        else {
          const a = Math.random() * Math.PI * 2;
          this.wish.set(Math.sin(a), Math.cos(a));
        }
      }
    }

    /* TURNED BACK AT THE PAINTED LINE, because an animal that runs off the
       deck is an animal the girls can never catch and a spawn slot held open
       forever. It steers rather than being clamped: a critter pressed flat
       against an invisible wall reads as a bug, one that veers away along the
       edge reads as an animal that knows where the drop is. */
    const margin = deck.half - 2.6;
    const ox = this.position.x - deck.x;
    const oz = this.position.z - deck.z;
    if (Math.abs(ox) > margin) this.wish.x = -Math.sign(ox) * Math.max(0.6, Math.abs(this.wish.x));
    if (Math.abs(oz) > margin) this.wish.y = -Math.sign(oz) * Math.max(0.6, Math.abs(this.wish.y));

    const top = this.spec.speed * (scared ? 1 : 0.42) * (this.panicT > 0 ? 1.15 : 1);
    const rate = 34 * dt;

    if (this.spec.kind === 'flier') this._flyStep(dt, top, rate, world, deck);
    else if (this.spec.kind === 'hopper') this._hopStep(dt, top, rate, world, deck, scared);
    else this._runStep(dt, top, rate, world, deck);
  }

  _runStep(dt, top, rate, world, deck) {
    this.velocity.x += THREE.MathUtils.clamp(this.wish.x * top - this.velocity.x, -rate, rate);
    this.velocity.z += THREE.MathUtils.clamp(this.wish.y * top - this.velocity.z, -rate, rate);
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this._clamp(deck);
    this._ground(world, deck);
    this.onGround = true;
  }

  /**
   * A rabbit RUNS, and bursts into a hop every so often.
   *
   * IT USED TO MOVE ONLY BY HOPPING, and that was wrong twice over. It looked
   * wrong — the only drawing there was is the mid-leap one, so the animal was
   * permanently frozen in a jump pose whether it was in the air or sitting on
   * the floor, which reads as a broken sprite rather than as a rabbit. And it
   * played wrong: a creature that is airborne on a fixed cadence is a metronome
   * you can set your watch by, and the whole point of a rabbit is that you
   * cannot predict it.
   *
   * So it scampers along the ground like the rat, and every so often — much
   * more often when something is chasing it — it launches. That gives the hop
   * back its job: being in the air is what makes it un-pinnable, so a hop is
   * now an evasion the animal chooses rather than the way it gets about.
   */
  _hopStep(dt, top, rate, world, deck, scared) {
    const g = world.heightAt(this.position.x, this.position.z, this.position.y + 1);
    const floor = g ? g.y : deck.y;

    if (this.onGround !== false && this.position.y <= floor + 0.01) {
      this.position.y = floor;
      this.onGround = true;

      // Running, exactly like the rat — same accelerator, same feel.
      this.velocity.x += THREE.MathUtils.clamp(this.wish.x * top - this.velocity.x, -rate, rate);
      this.velocity.z += THREE.MathUtils.clamp(this.wish.y * top - this.velocity.z, -rate, rate);
      this.position.x += this.velocity.x * dt;
      this.position.z += this.velocity.z * dt;
      this._clamp(deck);
      this._ground(world, deck);

      /* SPORADIC, AND THE INTERVAL IS RE-ROLLED EVERY TIME. A fixed gap makes
         the hop predictable, which is the one thing it must not be — a player
         who can count the beat just waits for the landing. Frightened it goes
         off every second and a half or so; calm it is a lazy every four.

         BEING FRIGHTENED CUTS A PENDING CALM TIMER SHORT, and without that the
         steady state is right and the START is wrong: a rabbit that has just
         been noticed is still holding whatever idle interval it rolled, so its
         first hop can be five seconds after a kitten began chasing it — which
         is a rabbit that does not react, measured at 3.4 seconds of running in
         a straight line before it thought to jump. The contrast between calm
         and chased is the whole tell that something is after it, so it has to
         apply from the frame it notices.

         THE THRESHOLD IS THE SCARED MAXIMUM, NOT THE SCARED MINIMUM, and that
         distinction is the whole line. Tested against `hopGap` it also chops
         down the interval the last launch just rolled — every frame, forever —
         so the gap collapses to nearly nothing and the rabbit is airborne 82%
         of the time instead of about half. Only a CALM roll, which cannot be
         under `hopGap * 2`, is a stale one. */
      if (scared && this.hopT > this.spec.hopGap * 2) {
        this.hopT = this.spec.hopGap * Math.random();
      }
      this.hopT = (this.hopT ?? 0) - dt;
      if (this.hopT <= 0) {
        this.hopT = scared
          ? this.spec.hopGap + Math.random() * this.spec.hopGap
          : this.spec.hopIdle + Math.random() * this.spec.hopIdle;
        /* It keeps the speed it was already running at rather than being
           re-launched at top speed: a hop out of a standstill should be a
           little bunny bounce, and a hop out of a full run should carry. */
        this.velocity.y = this.spec.hopV;
        this.onGround = false;
      }
      return;
    }

    this.velocity.y -= HOP_G * dt;
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;
    this._clamp(deck);
    if (this.position.y <= floor) {
      this.position.y = floor;
      this.velocity.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }
  }

  _flyStep(dt, top, rate, world, deck) {
    this.velocity.x += THREE.MathUtils.clamp(this.wish.x * top - this.velocity.x, -rate, rate);
    this.velocity.z += THREE.MathUtils.clamp(this.wish.y * top - this.velocity.z, -rate, rate);
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this._clamp(deck);

    /* It holds a cruising height over whatever is underneath, and bobs. The
       height is the balance: `cruise` is above a standing kitten's reach and
       below the top of a jump, so the bird is the one snack that has to be
       taken out of the air. */
    const g = world.heightAt(this.position.x, this.position.z, this.position.y + 8);
    const floor = g ? g.y : deck.y;
    const want = floor + this.spec.cruise + Math.sin(this.step * 0.6) * 0.5;
    this.position.y += (want - this.position.y) * Math.min(1, dt * 3.2);
    this.onGround = false;
  }

  /** Stunned or dropped: come down and stay down. */
  _fall(dt, world, deck) {
    const g = world.heightAt(this.position.x, this.position.z, this.position.y + 1);
    const floor = g ? g.y : deck.y;
    if (this.position.y > floor) {
      this.velocity.y -= HOP_G * dt;
      this.position.y = Math.max(floor, this.position.y + this.velocity.y * dt);
    } else {
      this.position.y = floor;
      this.velocity.y = 0;
    }
    this.onGround = this.position.y <= floor + 0.01;
  }

  /**
   * Held under a paw, wriggling, while the hold runs.
   *
   * It is dragged to HER rather than her being stopped where it is. She is
   * frozen for these two seconds (see Menagerie) and an animal squirming three
   * units away from a motionless cat does not read as being held down.
   */
  _updatePinned(dt) {
    this.t += dt;
    const h = this.holder;
    if (!h) return;
    /* ON THE GROUND IN FRONT OF HER MOUTH — meaning in front of her ON SCREEN,
       which is toward the camera, not along her facing. She turns to face the
       viewer for the whole meal (`Player.eatPose` is a single front-facing
       cell), so placing the animal along `facing` would put it behind her from
       the one angle anybody is watching from. `camYaw` is the direction the
       camera sits in; the arena is always drawn merged, so there is exactly
       one of them. */
    const y = h.camYaw ?? -Math.PI * 0.25;
    const fx = h.position.x + Math.sin(y) * 1.15;
    const fz = h.position.z + Math.cos(y) * 1.15;
    const k = Math.min(1, dt * 9);
    this.position.x += (fx - this.position.x) * k;
    this.position.z += (fz - this.position.z) * k;
    this.position.y += (h.position.y - this.position.y) * k;
    this.velocity.set(0, 0, 0);
    this.onGround = true;
  }

  /** In her mouth: parented in spirit, not in the graph — see _paint. */
  _updateMouthed(dt) {
    this.t -= dt;
    const h = this.holder;
    if (!h) return;
    this.position.set(
      h.position.x + Math.sin(h.facing) * 0.55,
      h.position.y + h.height * 0.78,
      h.position.z + Math.cos(h.facing) * 0.55
    );
    this.velocity.set(0, 0, 0);
  }

  _clamp(deck) {
    const m = deck.half - 1.4;
    this.position.x = THREE.MathUtils.clamp(this.position.x, deck.x - m, deck.x + m);
    this.position.z = THREE.MathUtils.clamp(this.position.z, deck.z - m, deck.z + m);
  }

  _ground(world, deck) {
    const g = world.heightAt(this.position.x, this.position.z, this.position.y + 2);
    this.position.y = g ? g.y : deck.y;
  }

  /** Broadside, from the sign of sideways motion. Panda's rule, panda's reason. */
  _aim(camYaw) {
    const rx = Math.cos(camYaw);
    const rz = -Math.sin(camYaw);
    const lateral = this.velocity.x * rx + this.velocity.z * rz;
    if (Math.abs(lateral) > 0.9) this.side = Math.sign(lateral);
    this.facing = camYaw + (this.side || 1) * (Math.PI / 2);
    this.sprite.facing = this.facing;
  }

  /** Everything you can see that isn't a position: the wriggle, the ring, the
   *  shadow, and the mouthed bird's frantic flapping. */
  _paint(dt, world, players) {
    /* THE POSE IS DECIDED HERE, EVERY FRAME, from what the animal is actually
       doing — rather than at each of the handful of places that change its
       state. `onGround` flips inside three different movement steps and a
       rabbit crosses it twice a second; setting the drawing at each of those
       is how one of them ends up forgotten and the animal runs along the floor
       in its leaping pose. Held animals keep the startled drawing. */
    if (this.state === 'roam') this._setPose(this._loosePose());

    const s = this.sprite;
    let sx = 1;
    let sy = 1;
    let tilt = 0;

    if (this.state === 'pinned') {
      /* IT SHRINKS AS THE HOLD RUNS, and that is the progress bar. There is no
         wheel and no gauge: the animal getting smaller and shaking harder is
         legible from across a 56-unit deck, in a corner of a split... — and
         nothing has to be drawn on the HUD for a thing only one player is
         doing. */
      const k = Math.min(1, this.t / EAT_TIME);
      const shake = Math.sin(this.step * 7) * 0.16 * (0.4 + k);
      sx = (1 - k * 0.55) * (1 + shake * 0.5);
      sy = (1 - k * 0.55) * (1 - shake * 0.3);
      tilt = shake;
    } else if (this.state === 'mouthed') {
      // Flailing, and faster the closer it is to getting away with it.
      const urgency = 1 + (1 - Math.max(0, this.t) / MOUTH_TIME) * 1.8;
      sx = 1 + Math.sin(this.step * 6 * urgency) * 0.16;
      sy = 1 - Math.sin(this.step * 6 * urgency) * 0.16;
      tilt = Math.sin(this.step * 4 * urgency) * 0.22;
    } else if (this.state === 'stunned') {
      sy = 0.86;
      sx = 1.1;
      tilt = Math.sin(this.step * 1.4) * 0.08;
    } else if (this.spec.kind === 'flier') {
      // Flap: squash on the beat, exactly the panda's waddle one octave up.
      sy = 1 + Math.sin(this.step * 2.6) * 0.13;
      sx = 1 - Math.sin(this.step * 2.6) * 0.09;
    } else {
      const run = Math.min(1, Math.hypot(this.velocity.x, this.velocity.z) / this.spec.speed);
      sy = 1 - Math.sin(this.step * 1.6) * 0.06 * run;
      sx = 1 + Math.sin(this.step * 1.6) * 0.05 * run;
    }

    s.mesh.scale.set(sx, sy, 1);
    s.mesh.rotation.z = tilt;

    // A mouthed animal is drawn over the kitten holding it, or the depth sort
    // decides frame by frame whether it is in front of her face.
    s.mesh.renderOrder = this.state === 'mouthed' ? 9 : 0;
    s.mat.depthTest = this.state !== 'mouthed';

    const below = world.heightAt(this.position.x, this.position.z);
    if (below && this.state !== 'mouthed') {
      const drop = this.position.y - below.y;
      this.shadow.visible = drop < 24;
      this.shadow.position.y = -drop + 0.05;
      this.ring.position.y = -drop + 0.06;
      this.shadow.material.opacity = 0.3 * Math.max(0.2, 1 - drop / 14);
    } else {
      this.shadow.visible = false;
    }

    /* The ring only ever means "press attack NOW and you will get it". It is
       off for a bird (which is not taken off the floor), off for a rabbit in
       the air, and off the instant she is already holding something. */
    let want = 0;
    if (this.pinnable) {
      for (const p of players) {
        if (!p || p.angel) continue;
        if (p.position.distanceTo(this.position) < CATCH_RADIUS) {
          want = 0.55 + Math.sin(this.step * 2.4) * 0.2;
          break;
        }
      }
    }
    this.ring.material.opacity += (want - this.ring.material.opacity) * Math.min(1, dt * 9);
  }

  faceCamera(camera) {
    this.sprite.faceCamera(camera);
  }

  dispose(scene) {
    scene.remove(this.group);
    for (const b of this.poses) {
      b.mesh.geometry.dispose();
      b.mat.dispose();
      b.tex.dispose();
    }
    this.shadow.geometry.dispose();
    this.shadow.material.dispose();
    this.ring.geometry.dispose();
    this.ring.material.dispose();
  }
}
