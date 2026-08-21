import * as THREE from 'three';
import { Label, makeLabelTexture } from '../core/label.js';

/* ---------------------------------------------------------------------------
   POWERUP KOTODAMA — the endgame collectible.

   The plain Kotodama Orb is a teaching object: one companion circling the
   kitten, drawing its own sin/cos working at a size you can read while you
   walk. These are the other thing. They are small, they sit close in, you wear
   up to eight of them at once, and every one changes a verb.

   WHY THEY REPLACE THE PLAIN ORB RATHER THAN SITTING ALONGSIDE IT. At 100%
   mischief every plain orb in the world and on both kittens is dissolved (see
   `systems/kotodama.js`), which sounds like taking away the thing the project
   is about. It isn't, and the reason is that the lesson has two homes: the
   Dojo of the Turning Circle is a walkable unit circle and is untouched by any
   of this. What the plain orb was carrying — that the numbers on screen are
   the numbers moving the thing — is carried here too, just smaller: the lead
   orb still prints its own live `cos θ` / `sin θ`, computed from the same two
   numbers that place it. The katakana are decoration AROUND a real readout,
   never instead of one. A prettier orb that lies about its own position would
   be worse than no orb.

   EIGHT TYPES, EIGHT DIFFERENT VERBS. Same rule the clans follow: swapping one
   changes how the game plays rather than recolouring a badge. Three of them
   are movement, two are reach and body, three are attacks she does not
   otherwise have.

   THEY STACK, AND STACKING IS ADDITIVE, NOT MULTIPLICATIVE. Eight speed orbs
   at x1.22 each compounds to x4.9 and a kitten who cannot turn a corner;
   1 + 0.22n gives x2.76 at the same count, which is fast enough to be the
   joke and slow enough to still be a game. Every stack rule below is written
   as `1 + k*n` or `base + k*n` for that reason, and `world-check` asserts the
   eight-stack case for each one rather than the single.
--------------------------------------------------------------------------- */

/** Nobody carries more than this. The profile screen draws exactly 8 slots. */
export const MAX_EQUIPPED = 8;

/**
 * The eight.
 *
 * `kanji` is what the orb prints on itself and what the profile screen shows;
 * `name` is the romaji the toasts use, because a nine-year-old cannot read the
 * first one and the sight of it is the point of having it.
 */
export const POWER_ORBS = [
  {
    id: 'swift',
    stack: true,
    name: 'Hayate',
    kanji: '疾',
    label: 'GALE',
    color: 0x53e2ff,
    blurb: 'Run faster.',
    detail: (n) => `Run speed x${(1 + 0.22 * n).toFixed(2)}`,
  },
  {
    id: 'reach',
    stack: true,
    name: 'Nagagiri',
    kanji: '斬',
    label: 'LONG CUT',
    color: 0xc08bff,
    blurb: 'The katana reaches further.',
    detail: (n) => `Katana reach x${(1 + 0.30 * n).toFixed(2)}`,
  },
  {
    id: 'vigor',
    stack: true,
    name: 'Kongo',
    kanji: '剛',
    label: 'ADAMANT',
    color: 0x6bf08a,
    blurb: 'More health in the ring.',
    detail: (n) => `Max health ${100 + 30 * n}`,
  },
  {
    id: 'leap',
    stack: true,
    name: 'Tobi',
    kanji: '跳',
    label: 'LEAP',
    color: 0xffe14f,
    blurb: 'One more jump in the air.',
    detail: (n) => `${2 + n} jumps`,
  },
  {
    id: 'ward',
    name: 'Kabe',
    kanji: '壁',
    label: 'WARD',
    color: 0x9fd8ff,
    blurb: 'HOLD the dragon button for a shield you cannot be hurt through.',
    detail: (n) => `${WARD.max.toFixed(1)}s of block, `
      + `${Math.max(WARD.coolMin, WARD.cool - 0.25 * (n - 1)).toFixed(2)}s wait`,
  },
  {
    id: 'dive',
    name: 'Otoshi',
    kanji: '落',
    label: 'POWER DIVE',
    color: 0xff7a3d,
    blurb: 'Interact in the air to fall like a hammer.',
    detail: (n) => `Dive damage ${DIVE.dmg + 6 * (n - 1)}`,
  },
  {
    id: 'tri',
    name: 'Sanzan',
    kanji: '三',
    label: 'TRIPLE SLASH',
    color: 0xff6fae,
    blurb: 'Hold attack for three cuts. You cannot move through them.',
    detail: (n) => `3 cuts, x${(1 + 0.15 * (n - 1)).toFixed(2)} damage`,
  },
  {
    id: 'charge',
    name: 'Totsugeki',
    kanji: '突',
    label: 'CHARGE',
    color: 0xffd166,
    blurb: 'Attack while sprinting to charge straight through.',
    detail: (n) => `${(CHARGE.dist + 4 * (n - 1)).toFixed(0)}-unit charge`,
  },
];

export const ORB_BY_ID = Object.fromEntries(POWER_ORBS.map((o) => [o.id, o]));
export const ORB_IDS = POWER_ORBS.map((o) => o.id);

/**
 * How many of each the dealer has at open.
 *
 * THE FOUR STAT ORBS ARE STOCKED DEEP AND THE FOUR MOVES ARE NOT, and the two
 * halves of the roster want opposite things from a shop. Gale, Long Cut,
 * Adamant and Leap are worth having four of — the whole point of them is the
 * number going up, and a second one is a real, felt difference. A second
 * Charge orb only widens a charge she already has; the move is the prize, and
 * the fourth copy of it is a slot she could have spent on something she cannot
 * do at all.
 *
 * IT DOES NOT MAKE THEM CHEAP. The world holds four orbs per player, so the
 * only way to STACK is to buy — and a purse buys three orbs TOTAL. The shelf
 * being deep moves the scarcity from "the dealer hasn't got one" to "you
 * cannot afford it and your sister has two", which is the scarcity that
 * produces a conversation instead of a shrug.
 *
 * THE SHELF GROWS WITH THE PARTY: one more of every kind per player past the
 * second. Four kittens shopping off a shelf sized for two means the third one
 * to reach the market finds it empty, which is not scarcity — scarcity is a
 * price you cannot meet, and an empty shelf is just being late. The four move
 * orbs go from one to three rather than to four, so they stay the thing you
 * mostly get by trading.
 */
export const STOCK_STACKABLE = 4;
export const STOCK_UNIQUE = 1;
export const stockFor = (id, players = 2) => {
  const extra = Math.max(0, players - 2);
  return (ORB_BY_ID[id]?.stack ? STOCK_STACKABLE : STOCK_UNIQUE) + extra;
};

/* --------------------------- the three abilities -------------------------- */

/**
 * The ward. HELD, not toggled.
 *
 * ON THE DRAGON BUTTON, AND THE DRAGON STILL WINS IT. `mount` already means
 * "get on the thing next to me", and a kitten standing beside a storm dragon
 * pressing it and getting a bubble instead would read as the game refusing to
 * let her fly. `Player._updateGround` tries every mount first and only reaches
 * the ward when nothing was in range — which is nearly always, because a
 * dragon is a place you walk to.
 *
 * IT IS A BUTTON YOU HOLD DOWN, AND THAT IS THE WHOLE DIFFERENCE BETWEEN A
 * BLOCK AND AN INVULNERABILITY. The first version was a toggle: press once,
 * get three seconds. Three seconds is a long time in a fight two nine-year-olds
 * are having, and a shield that stays up while she does something else is not
 * a decision — it is a state she is in. Holding costs her the button for as
 * long as she wants the cover, so blocking is something she is *doing*.
 *
 * `max` IS A HARD CAP AND STACKING DOES NOT MOVE IT. Two seconds, however many
 * Ward orbs she is wearing. Stacks buy a shorter WAIT instead, which is the
 * only one of the two numbers that can grow without the shield eventually
 * being up more than it is down.
 *
 * `tail` — it keeps working for a fifth of a second after she lets go. Without
 * it, a blow that lands on the exact frame her thumb comes off reads as the
 * block failing, and a kid cannot tell that apart from a block that does not
 * work. It is short enough that letting go early is still letting go.
 *
 * THE WAIT STARTS WHEN SHE RELEASES, not when the tail ends and not when she
 * pressed. Started at the press, a 2s block on a 1.5s cooldown is already
 * available again before it runs out. Started at the end of the tail, the two
 * numbers on the profile screen do not add up to the gap she actually feels.
 *
 * QUARTER GRAVITY WHILE IT IS UP, and that is what makes it an air move rather
 * than a panic button. Holding it at the top of a jump turns a fall into a
 * float, which is how you cross to a shard or hang over a sister winding up a
 * dash — and now it costs her the two seconds she is holding it for.
 */
export const WARD = {
  max: 2.0,
  tail: 0.2,
  cool: 1.5,
  coolMin: 0.4,
  gravity: 0.25,
  radius: 2.6,
};

/**
 * The power dive. Interact, in the air, and she drops.
 *
 * `interact` is free up there by construction: the only thing it does on the
 * ground is swear an oath at a shrine or open the stall, and neither of those
 * is reachable off the floor. No new button, which is the rule the tournament
 * set and the one worth keeping — two kids on Joy-Cons have six buttons
 * between them and every one is already spoken for.
 */
export const DIVE = {
  speed: 46,
  dmg: 22,
  knock: 14,
  lift: 6.5,
  radius: 4.2,
};

/**
 * The triple slash. Hold attack; she plants and cuts three times.
 *
 * SHE CANNOT MOVE OR JUMP THROUGH IT, which is the cost that makes it worth
 * having. In the air she gets quarter gravity for the duration instead of
 * being frozen — freezing a falling kitten in mid-air reads as the game
 * hanging, and a slow drift through three cuts reads as the move.
 *
 * IT USED TO BE THREE CUTS AT A CORPSE. The first swing knocked the target
 * away with ordinary knockback and the other two hit the air where she had
 * been — so the move was strictly worse than one slash, and read as the game
 * stuttering. The three cuts now HOLD whoever they catch: stunned in place,
 * gravity off, untouchable by anybody else, damage banking up. When the last
 * one lands there is a beat, and then everything held goes flying at once.
 *
 * That is Smash's charged bat, and it is deliberate — a big hit needs a moment
 * of nothing before it to be worth landing. `hang` is that moment.
 *
 * `hold` IS 0.05 AND NOT 0.22, which changes what the button means. Past 0.22
 * the ordinary swing had already been thrown, so the move could only ever be a
 * slash PLUS three; at 0.05 the press has not committed to anything yet, so a
 * tap is a slash and a hold is the technique, and they are alternatives rather
 * than a sequence. The cost is that wearing this orb puts 50ms — three frames —
 * on every ordinary slash, which is the trade the whole rework is.
 *
 * `gap` IS A THIRD LONGER THAN IT WAS. At 0.16 the three cuts were over before
 * a nine-year-old could see there had been three of them.
 */
export const TRIPLE = {
  cuts: 3,
  gap: 0.21,
  hold: 0.05,
  gravity: 0.25,
  /** The beat between the last cut and the launch. Smash's pause-for-effect. */
  hang: 0.25,
  /** ...and how long she cannot attack at all once it is over. */
  cool: 0.5,
  /** THE LAUNCH IS NOT `tri.knock`. That number is per-cut and deliberately
     feeble — nine damage and a nudge — because the cuts are not supposed to
     move anybody any more; they are supposed to HOLD. All the force the move
     ever had is spent here, once, on everything it caught. */
  knock: 30,
  lift: 13,
};

/**
 * The charge. Sprint into an attack and she goes straight through it.
 *
 * GRAVITY IS OFF FOR THE DURATION, IN THE AIR AND ON THE GROUND. On the ground
 * that is invisible and harmless; in the air it is the whole move, because a
 * charge that arcs is a jump with a sword in it. It ends early on hitting
 * anything solid, so charging a clan hall stops at the wall rather than
 * pushing a kitten through it.
 */
export const CHARGE = {
  dist: 16,
  speed: 42,
  dmg: 18,
  knock: 22,
  lift: 5.5,
  radius: 2.4,
};

/* ------------------------------- aggregation ------------------------------ */

/**
 * Fold a kitten's orbs into one buff object.
 *
 * ONE FUNCTION, CALLED FROM EVERYWHERE, AND IT TAKES A LIST OF IDS. Every
 * caller that wants to know "how fast is she" — the controller, the profile
 * screen, the smoke test — asks this, so there is no second place where the
 * stacking maths can drift from the first. Passing ids rather than orb objects
 * is what lets `world-check` ask the question without building any geometry.
 *
 * @param {string[]} ids
 */
export function aggregate(ids = []) {
  const n = (id) => ids.filter((k) => k === id).length;
  const swift = n('swift');
  const reach = n('reach');
  const vigor = n('vigor');
  const leap = n('leap');
  const ward = n('ward');
  const dive = n('dive');
  const tri = n('tri');
  const charge = n('charge');

  return {
    counts: Object.fromEntries(ORB_IDS.map((id) => [id, n(id)])),
    total: ids.length,
    speed: 1 + 0.22 * swift,
    reach: 1 + 0.30 * reach,
    hp: 100 + 30 * vigor,
    jumps: leap,
    /* Only the WAIT moves with the stack. The two seconds of block are a hard
       cap: it is the number that decides whether the shield is a decision or a
       state, and there is no count of orbs that should turn it back into a
       state. See WARD. */
    ward: ward
      ? {
          max: WARD.max,
          cool: Math.max(WARD.coolMin, WARD.cool - 0.25 * (ward - 1)),
        }
      : null,
    dive: dive ? { dmg: DIVE.dmg + 6 * (dive - 1) } : null,
    tri: tri ? { dmgK: 1 + 0.15 * (tri - 1) } : null,
    charge: charge ? { dist: CHARGE.dist + 4 * (charge - 1) } : null,
  };
}

/* -------------------------------- economy --------------------------------- */

/**
 * What the stall charges.
 *
 * DERIVED FROM THE WORLD, NOT PICKED. Every point either kitten will ever have
 * comes from knocking something over, the orbs only exist once everything has
 * been knocked over, so the entire economy is a fixed pot: `world.pointsTotal`,
 * currently 4550 across 216 props. Two girls who split it evenly hold about
 * 2275 each, and the brief is that all of it buys three or four orbs — so the
 * price is that share divided by 3.5.
 *
 * That number matters more than it looks. Eight types, a stall that stocks one
 * of each, and a wallet that reaches three of them is what makes TRADING the
 * way you build a set rather than an extra you can ignore: there is no amount
 * of playing that buys a stack, and the only other copies in the world are the
 * ones lying on the islands and the ones in your sister's hand.
 *
 * THE SHARE IS PER PLAYER, so the divisor is the party size rather than 2. The
 * pot is fixed — it is every prop in the world — so four kittens split it four
 * ways, and leaving the price alone would quietly halve what each of them can
 * buy and turn "your share buys three or four" into "your share buys one and a
 * half". Two players give exactly the number they gave before.
 *
 * @param {number} totalPoints every point earnable in the world
 * @param {number} players     how many kittens are splitting it
 */
export const BUYS_PER_PURSE = 3.5;
export const SELL_FRACTION = 0.75;

export const orbPrice = (totalPoints, players = 2) =>
  Math.round(totalPoints / Math.max(1, players) / BUYS_PER_PURSE);
export const orbSellPrice = (totalPoints, players = 2) =>
  Math.round(orbPrice(totalPoints, players) * SELL_FRACTION);

/* ------------------------- the worn companion orb ------------------------- */

/** Scratch, so turning sixteen orbs toward two cameras allocates nothing. */
const _q = new THREE.Quaternion();

/** Katakana the drifting glyphs are drawn from. Deliberately not kanji: these
 *  are meant to read as a rain of characters rather than as words, which is
 *  what the Matrix look actually is. */
const KANA = [...'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン'];

/**
 * One worn orb.
 *
 * SMALLER AND CLOSER IN THAN THE PLAIN ORB, and that is a requirement rather
 * than a style note: eight of the old ones at radius 3.2–9.5 would be a
 * twelve-unit-wide cloud of geometry around a 2.9-unit kitten, and in split
 * screen it would fill her half of the display. These sit on a 1.5–2.6 shell
 * and read as armour.
 *
 * @param {object} spec one of POWER_ORBS
 * @param {number} slot 0..7 — decides the shell radius, speed and phase
 */
export class PowerOrb {
  constructor(spec, slot = 0, ofTotal = 1) {
    this.spec = spec;
    this.id = spec.id;
    this.slot = slot;

    /* The shell grows slowly and alternates direction by slot, so eight orbs
       are eight readable paths rather than one blurred sphere. Phase is spread
       over the whole ring by how many she is actually wearing — spacing them
       by a fixed angle bunches the first three together and leaves a gap. */
    this.r = 1.5 + (slot % 4) * 0.36;
    this.speed = (1.5 + (slot % 3) * 0.34) * (slot % 2 ? -1 : 1);
    this.theta = (slot / Math.max(1, ofTotal)) * Math.PI * 2;
    this.height = 1.05 + (slot % 4) * 0.34;
    this.tilt = 0.16 + (slot % 3) * 0.14;

    this.group = new THREE.Group();
    this.orbNode = new THREE.Group();
    this.group.add(this.orbNode);

    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.26, 1),
      new THREE.MeshBasicMaterial({ color: spec.color, toneMapped: false })
    );
    const halo = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.44, 1),
      new THREE.MeshBasicMaterial({
        color: spec.color, transparent: true, opacity: 0.3,
        side: THREE.BackSide, depthWrite: false, toneMapped: false,
      })
    );
    this.orbNode.add(core, halo);
    this.core = core;
    this.halo = halo;

    /* The orb wears its own kanji, which is how you tell eight glowing dots
       apart at a glance. `depthTest: false` because it is a 0.4-unit quad
       pinned to a 0.38-unit sphere: at equal depth the sort flickers it in and
       out of the ball it is labelling. */
    this.mark = new Label(spec.kanji, {
      height: 0.52, size: 76, color: '#ffffff',
      stroke: '#101018', strokeWidth: 9, depthTest: false,
    });
    this.orbNode.add(this.mark);

    this._buildRain(spec.color);
    this.showMath = false;
  }

  /**
   * The character rain, and the live readout underneath it.
   *
   * THE GLYPHS ARE DECORATION; THE NUMBER IS NOT. Four katakana fall down a
   * short column beside the orb on their own loop, and below them sits the
   * same `cos θ = …` the plain Kotodama Orb printed, driven by the very cosine
   * that put the orb where it is this frame. Kill the readout and this is a
   * screensaver; kill the glyphs and it is the old orb at half size. The lead
   * orb is the only one that prints the numbers — eight copies of the same
   * two figures orbiting one cat is noise, and the whole reason the old
   * overlay was legible was that there was one of it.
   */
  _buildRain(color) {
    this.rain = new THREE.Group();
    this.group.add(this.rain);

    const hex = `#${new THREE.Color(color).getHexString()}`;
    this.hex = hex;
    this.drops = [];
    for (let i = 0; i < 4; i++) {
      const { texture, aspect } = makeLabelTexture(
        KANA[(Math.random() * KANA.length) | 0],
        { size: 64, color: hex, stroke: '#06131a', strokeWidth: 7 }
      );
      const h = 0.34;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(h * aspect, h),
        new THREE.MeshBasicMaterial({
          map: texture, transparent: true, opacity: 0.8,
          depthTest: false, depthWrite: false, toneMapped: false,
        })
      );
      m.renderOrder = 15;
      this.rain.add(m);
      this.drops.push({ mesh: m, t: Math.random(), swap: 0 });
    }

    /* `live`. This one is `cos X  sin Y` — 201 x 201 reachable strings, the same
       combinatorial shape as the Dojo's point readout that took the tab down at
       roughly a gigabyte per lap, and there are up to sixteen orbs. The cached
       path would mint a never-freed texture per value. See `Label`'s `_live`. */
    this.readout = new Label('cos θ', {
      height: 0.34, size: 60, color: hex,
      stroke: '#06131a', strokeWidth: 7, depthTest: false,
      live: 'cos -0.00  sin -0.00',
    });
    this.rain.add(this.readout);
    this.rain.visible = false;
  }

  /** Only the lead orb shows its working. See _buildRain. */
  setMathVisible(v) {
    this.showMath = v;
    this.rain.visible = v;
  }

  /** @returns the same {theta, cos, sin} the plain orb returned. */
  update(dt, centre) {
    this.theta += this.speed * dt;
    if (this.theta > Math.PI * 2) this.theta -= Math.PI * 2;
    else if (this.theta < 0) this.theta += Math.PI * 2;

    const c = Math.cos(this.theta);
    const s = Math.sin(this.theta);
    const x = c * this.r;
    const z = s * this.r;

    this.group.position.set(centre.x, centre.y + this.height, centre.z);
    this.group.rotation.z = this.tilt;
    this.orbNode.position.set(x, 0, z);
    this.orbNode.rotation.y += dt * 2.2;
    this.mark.position.set(0, 0, 0);

    // A slow breath so a still kitten still looks powered up.
    const pulse = 1 + Math.sin(this.theta * 3) * 0.12;
    this.halo.scale.setScalar(pulse);

    if (this.showMath) this._updateRain(dt, x, z, c, s);
    return { theta: this.theta, cos: c, sin: s, x, z, r: this.r };
  }

  _updateRain(dt, x, z, c, s) {
    /* The column hangs beside the orb, not at the kitten's centre, so it
       travels with the thing whose numbers it is printing — which is the same
       reason the plain orb anchored its labels to the diagram rather than to
       the cat. */
    this.rain.position.set(x * 1.25, 0, z * 1.25);
    for (const d of this.drops) {
      d.t += dt * 0.7;
      if (d.t > 1) {
        d.t -= 1;
        /* A new glyph at the top of the fall, not a new mesh: swapping the map
           on a cached texture costs nothing, and building four canvases a
           second per orb across sixteen orbs would be the most expensive thing
           in the frame. `makeLabelTexture` caches by content, so this settles
           onto the same 47 textures for the whole session. */
        const { texture } = makeLabelTexture(
          KANA[(Math.random() * KANA.length) | 0],
          { size: 64, color: this.hex, stroke: '#06131a', strokeWidth: 7 }
        );
        d.mesh.material.map = texture;
        d.mesh.material.needsUpdate = true;
      }
      d.mesh.position.set(0, 0.85 - d.t * 1.7, 0);
      // Brightest at the head of the fall and gone by the bottom — the one
      // detail that makes falling characters read as falling.
      d.mesh.material.opacity = 0.9 * Math.sin(d.t * Math.PI);
    }
    this.readout.position.set(0, -1.0, 0);
    this.readout.setText(`cos ${c.toFixed(2)}  sin ${s.toFixed(2)}`);
  }

  /**
   * Turn every piece of text to face the camera SQUARELY.
   *
   * A QUATERNION COPY IS LOCAL, AND EVERYTHING HERE HANGS OFF SOMETHING THAT
   * IS TURNING. `group` is tilted by `tilt` so the orbit reads as 3D, and
   * `orbNode` tumbles on two axes every frame — so `mesh.quaternion.copy(cam)`
   * leaves the parent's rotation still applied on top and the text arrives
   * sheared, leaning, and rolling once a second. It is legible in a still
   * frame and unreadable in motion, which is the worst way for it to be wrong.
   *
   * This is the same bug that got the drifting glyphs deleted from the plain
   * Kotodama Orb — see the note in `orb.js`. They were parented to a node that
   * tumbled, the billboarding fought the parent's spin, and the answer at the
   * time was to remove them. The answer here is to cancel the parent first:
   * invert its world rotation, then apply the camera's, and the result is a
   * quad that is genuinely square to the viewer whatever it is bolted to.
   *
   * The parent quaternions are composed by hand rather than read from
   * `getWorldQuaternion`, which needs the world matrices to be current — they
   * are not, because this runs per VIEW before the render that would update
   * them. `Object3D` keeps `.quaternion` in step with `.rotation` on every
   * assignment, so these two are always live.
   */
  faceCamera(camera) {
    // mark: parented to orbNode, which is parented to group.
    _q.copy(this.group.quaternion).multiply(this.orbNode.quaternion).invert();
    this.mark.mesh.quaternion.copy(_q).multiply(camera.quaternion);
    if (!this.showMath) return;
    // rain and readout: parented to `rain`, which only ever moves, so the
    // group's tilt is the whole of what has to come off.
    _q.copy(this.group.quaternion).invert();
    for (const d of this.drops) d.mesh.quaternion.copy(_q).multiply(camera.quaternion);
    this.readout.mesh.quaternion.copy(_q).multiply(camera.quaternion);
  }

  dispose(parent) {
    parent.remove(this.group);
  }
}

/* --------------------------------- pickups -------------------------------- */

/**
 * One lying in the world, waiting to be walked into.
 *
 * IT SAYS WHAT IT IS BEFORE YOU TAKE IT. A ring of eight identical glowing
 * balls scattered over six islands, each of which silently grants a different
 * power, is a lottery — the label and the colour are what turn "there's
 * another one" into "that's the jump one, I want that". Same three-distance
 * argument the shrines make, minus the beam: these are small on purpose.
 */
export class PowerOrbPickup {
  constructor(spec, x, y, z) {
    this.spec = spec;
    this.id = spec.id;
    this.position = new THREE.Vector3(x, y, z);
    this.taken = false;
    this.t = Math.random() * 6.28;

    this.group = new THREE.Group();
    this.group.position.set(x, y, z);

    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.42, 1),
      new THREE.MeshBasicMaterial({ color: spec.color, toneMapped: false })
    );
    core.position.y = 1.5;
    const halo = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.78, 1),
      new THREE.MeshBasicMaterial({
        color: spec.color, transparent: true, opacity: 0.24,
        side: THREE.BackSide, depthWrite: false, toneMapped: false,
      })
    );
    halo.position.y = 1.5;

    /* A short column, thinner and shorter than a dragon ball's, which is
       itself thinner and shorter than a shrine beam. The three heights are the
       whole legibility system for "how big a deal is that light". */
    const beamGeo = new THREE.CylinderGeometry(0.16, 0.30, 9, 10, 1, true);
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
      color: spec.color, transparent: true, opacity: 0.16,
      side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
    }));
    beam.position.y = 5.2;

    const ringGeo = new THREE.TorusGeometry(0.85, 0.045, 6, 28);
    ringGeo.rotateX(Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: spec.color, transparent: true, opacity: 0.65, toneMapped: false,
    }));
    ring.position.y = 1.5;

    this.core = core;
    this.ring = ring;
    this.group.add(core, halo, ring, beam);

    this.mark = new Label(spec.kanji, {
      height: 0.62, size: 80, color: '#ffffff',
      stroke: '#101018', strokeWidth: 9, depthTest: false,
    });
    this.mark.position.y = 1.5;
    this.group.add(this.mark);

    this.label = new Label(spec.label, {
      height: 0.46, size: 58,
      color: `#${new THREE.Color(spec.color).getHexString()}`,
      stroke: '#101820', strokeWidth: 7,
    });
    this.label.position.y = 2.85;
    this.group.add(this.label);
  }

  update(dt) {
    this.t += dt;
    this.group.position.y = this.position.y + Math.sin(this.t * 1.7) * 0.24;
    this.core.rotation.y += dt * 1.5;
    this.core.rotation.x += dt * 0.7;
    this.ring.rotation.z += dt * 1.1;
  }

  faceCamera(camera) {
    this.mark.faceCamera(camera);
    this.label.faceCamera(camera);
  }
}
