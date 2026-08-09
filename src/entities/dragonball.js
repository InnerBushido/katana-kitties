import * as THREE from 'three';
import { Label } from '../core/label.js';

/* ---------------------------------------------------------------------------
   The seven dragon balls.

   One on every island, and there are exactly seven islands — that is not a
   coincidence the code should have to rediscover, it is the reason the number
   is seven. `world-check` asserts one per island and no island with two,
   because a pair on the home island and none on the ash island is a hunt that
   ends with two girls flying in circles over a rock.

   EVERY STAR BUT THE FIRST IS LOCKED, AND EACH LOCK ASKS FOR A DIFFERENT VERB.
   They used to sit in the open on a hillside, which made the hunt a matter of
   flying over seven islands and looking down — the dragon did all seven, and
   nothing else in the game was needed to finish the thing the whole game builds
   toward. Now the hunt is where the verbs meet: one wants you off the dragon
   and underground, one wants the dragon's breath, one wants a panda's claw, one
   wants a clan buff, one wants you in the air. See LOCKS.

   THE FIRST STAR IS FREE, and that is not laziness. A locked star teaches
   nothing to somebody who has never seen an unlocked one — you need to know
   what a star IS, what the counter does and that it is worth crossing an island
   for before a lock can read as a lock rather than as scenery.

   A LOCK MUST SAY WHAT IT WANTS. This is the shrine's three-distances lesson
   again: the ward is visible from the air by its colour, the star's own beam is
   tinted to match, and standing near it puts the requirement on screen in
   words. A nine-year-old who cannot tell a locked star from a bug has been
   given a chore, not a puzzle.

   THEY ARE PROCEDURAL, not generated art. Every prop in this game is boxes and
   cylinders painted with vertex colours, and a photographic sphere dropped
   into that reads as a sticker. The stars are drawn to a canvas at load time,
   the same trick `label.js` uses for text.
--------------------------------------------------------------------------- */

/** How many there are, and therefore how many islands need one. */
export const BALL_COUNT = 7;

/** How close a kitten has to get. Generous — they are small and they bob. */
export const PICKUP_RADIUS = 3.2;

/** How close before the lock explains itself in words. */
export const HINT_RADIUS = 17;

/**
 * The gates, one per island.
 *
 * `foot`   — must be standing on her own two feet: no dragon, no panda.
 * `breaks` — the ward shatters to this attack and nothing else.
 * `tint`   — the star's beam and its ward share this, so the colour in the sky
 *            is a readable promise about what the star will ask for.
 * `hint`   — shown in world space inside HINT_RADIUS. Written as an
 *            instruction, not a description: a kid reading "SEALED IN ICE"
 *            knows what she is looking at and still not what to do about it.
 *
 * THE HINT IS THE FEATURE, not decoration on top of it. Each of these was
 * first written as a noun and every one of them had to be rewritten as a verb.
 */
export const LOCKS = {
  /** The teacher. Home island, lying in the open. */
  none: { tint: 0xffcf6a, hint: null },
  /**
   * In a grotto. The rock keeps a dragon out by being a roof — but the rule is
   * enforced rather than left to the geometry, because a billboarded dragon is
   * a flat drawing with a point for a position and that point fits through any
   * doorway you can walk through.
   */
  cave: { tint: 0xffd9a0, hint: 'GO IN ON FOOT', foot: true },
  /** Sealed in ice on the frost island. Any breath does it; frost included, on
   *  the grounds that arguing about thermodynamics with a nine-year-old is a
   *  worse outcome than a frost dragon cracking ice. */
  ice: { tint: 0xdff4ff, hint: 'BURN IT OFF — RIDE A DRAGON', breaks: 'breath' },
  /** Under a boulder no katana will touch. The panda's claw is the only thing
   *  in the game heavy enough, which is what makes raising one worth it. */
  boulder: { tint: 0xc9a06a, hint: "CRACK IT — A PANDA'S CLAW", breaks: 'claw' },
  /** On a spire too tall to jump. This one WANTS you on a dragon. */
  perch: { tint: 0xffb03a, hint: 'FLY UP TO IT' },
  /**
   * Up a stack of floating shards, spaced for a third jump.
   *
   * `climbed` IS A SEPARATE RULE FROM `foot`, and it has to be. `foot` asks
   * where she is *right now*; `climbed` asks how she GOT there. Every other
   * foot lock is happy with the first question — you cannot ride a dragon into
   * a grotto — but this star is in open sky, so "not on a dragon" was
   * satisfied by flying up, hopping off and landing on the top shard. The
   * gate the whole island exists for was a dismount.
   */
  sky: {
    tint: 0xc8a8ff, hint: 'THREE JUMPS — ON YOUR OWN FEET', foot: true, climbed: true,
  },
};

/**
 * Which island gets which lock, by index into `world.islands`.
 *
 * ORDER MATTERS AND IT IS A DIFFICULTY CURVE, not a shuffle. Home is free.
 * The two that only need a dragon come next, because a dragon is the first
 * thing either girl learns to use. The panda and the triple jump are last
 * because both cost a clan oath, and one of them costs forty canes.
 *
 * `world-check` asserts every kind is used and no island gets two, so this
 * cannot silently drift into six caves.
 */
export const ISLAND_LOCKS = [
  'none',     // 0 home / meadow — the one that teaches what a star is
  'cave',     // 1 autumn
  'ice',      // 2 frost
  'boulder',  // 3 bamboo — where you raise the panda that opens it
  'perch',    // 4 ash
  'cave',     // 5 dusk
  'sky',      // 6 dojo
];

/* WHY THE SHARDS ARE ON THE DOJO AND NOT THE DUSK ISLAND.
   The dojo island is 66 units across with a 46-unit flattened disc in the
   middle of it that must stay clear — the unit circle is the maths lesson and
   a grotto standing on the graph paper is a rock in the middle of the diagram.
   That leaves a band about twelve units wide out on the rim, and a grotto with
   its outlying boulders needs eleven of clear level ground in every direction.
   It did not fit, so the placer fell back to an unlocked star and the game
   quietly shipped TWO free stars and only one cave. The smoke test caught it
   and now asserts no lock is allowed to fall back at all.
   Shards need five. They fit on the rim with room, they are nowhere near the
   circle, and floating rock over the edge of the maths island is a better
   sight than another lump of grey anyway. */

/**
 * The classic look: amber glass with red stars. Drawn once per star count and
 * shared, because seven textures is seven, but seven textures per ball across
 * a restart is a leak nobody would ever notice until the tenth restart.
 */
const starCache = new Map();

function ballTexture(stars) {
  if (starCache.has(stars)) return starCache.get(stars);
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const g = cv.getContext('2d');

  // Amber body with a lit side, so it reads as glass rather than a flat disc.
  g.fillStyle = '#f2a52a';
  g.fillRect(0, 0, S, S);
  const grad = g.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, 'rgba(255,232,150,0.85)');
  grad.addColorStop(0.45, 'rgba(255,180,60,0.15)');
  grad.addColorStop(1, 'rgba(150,70,10,0.55)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);

  /* Stars sit in a ring, with the odd one in the middle — the arrangement the
     real ones use, and the thing that makes a four-star read as a four-star at
     a glance rather than as "some stars". */
  const drawStar = (cx, cy, r) => {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const rr = i % 2 ? r * 0.45 : r;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
    g.fillStyle = '#d81f26';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = '#7d0f14';
    g.stroke();
  };

  const cx = S / 2;
  const cy = S / 2;
  const r = stars === 1 ? 46 : 26;
  if (stars === 1) {
    drawStar(cx, cy, r);
  } else {
    const ring = stars % 2 === 1 ? stars - 1 : stars;
    const spare = stars - ring;
    for (let i = 0; i < ring; i++) {
      const a = (Math.PI * 2 * i) / ring - Math.PI / 2;
      drawStar(cx + Math.cos(a) * 56, cy + Math.sin(a) * 56, r);
    }
    if (spare) drawStar(cx, cy, r);
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  starCache.set(stars, tex);
  return tex;
}

export class DragonBall {
  /**
   * @param {number} stars 1..7 — which ball this is, and what it looks like
   * @param {object} island the island it belongs to, for the checks
   * @param {string} lock a key of LOCKS
   */
  constructor(stars, x, y, z, island = null, lock = 'none') {
    this.stars = stars;
    this.island = island;
    this.lock = LOCKS[lock] ? lock : 'none';
    this.rule = LOCKS[this.lock];
    this.taken = false;
    /** A ward that has been broken, or a lock that never had one. */
    this.open = !this.rule.breaks;
    this.breakT = 0;
    this.position = new THREE.Vector3(x, y, z);
    this.t = Math.random() * 6.28;

    this.group = new THREE.Group();
    this.group.position.set(x, y, z);

    const R = 0.85;
    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(R, 22, 16),
      new THREE.MeshBasicMaterial({ map: ballTexture(stars), toneMapped: false })
    );
    this.ball.position.y = 1.6;
    this.group.add(this.ball);

    // Inner glow, so it still reads at dusk and on the ash island.
    this.halo = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.5, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0xffcf6a, transparent: true, opacity: 0.18,
        side: THREE.BackSide, depthWrite: false, toneMapped: false,
      })
    );
    this.halo.position.y = 1.6;
    this.group.add(this.halo);

    /* The findable-from-the-air column. Deliberately thin and only 22 tall —
       a shrine beam is a landmark you navigate by, this is a hint you notice.
       Sized any bigger and the sky over seven islands is a light show in which
       nothing means anything.

       IT IS TINTED BY THE LOCK. Seven identical amber pins told you where the
       stars were and nothing about them; the colour is what lets a player look
       at the sky over the frost island and think "that one is the icy one"
       before she has ever landed on it.

       A CAVE STAR HAS NO COLUMN AT ALL. It is under a roof, so a beam would
       either be swallowed by the rock or stand on top of it pointing at a
       hillside with nothing on it, which is worse than no beam: it is a beam
       that lies. The grotto's own glowing mouth is its advertisement. */
    /* THE CAVE STAR GETS AN INDOOR MARKER, and it is a different thing from
       the beam. Once the maze went in you could stand two corridors away with
       no idea which way the star was — the walls run to the ceiling, so it is
       hidden until you are in the same ring as it. That is not exploration,
       it is a guess, and the wrong guess is a full lap of a corridor.
       So: a slim column at the star, drawn with `depthTest: false` so it reads
       THROUGH the maze, shown only while somebody is actually inside the
       grotto (the game toggles it). It tells you where, never how — you still
       have to find the gaps. Outside, it is off, so it can never poke up
       through the roof and give the game away from the air, which is the
       reason a cave star has no ordinary beam in the first place. */
    this.indoorMark = null;
    if (this.lock === 'cave') {
      const g = new THREE.CylinderGeometry(0.14, 0.30, 13, 8, 1, true);
      g.translate(0, 6.5 + 1.4, 0);
      this.indoorMark = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
        color: 0xffd9a0, transparent: true, opacity: 0.34,
        depthWrite: false, depthTest: false, side: THREE.DoubleSide,
        toneMapped: false,
      }));
      this.indoorMark.renderOrder = 4;
      this.indoorMark.visible = false;
      this.group.add(this.indoorMark);
    }

    this.beam = null;
    if (this.lock !== 'cave') {
      const beamGeo = new THREE.CylinderGeometry(0.22, 0.42, 22, 10, 1, true);
      beamGeo.translate(0, 11 + 2.2, 0);
      this.beam = new THREE.Mesh(
        beamGeo,
        new THREE.MeshBasicMaterial({
          color: this.rule.tint, transparent: true, opacity: 0.30,
          depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
        })
      );
      this.group.add(this.beam);
    }

    this.label = new Label(`${stars}★`, {
      height: 0.62, size: 64, color: '#ffe6a8', stroke: '#5a2a06', strokeWidth: 7,
    });
    this.label.position.y = 3.3;
    this.group.add(this.label);

    /* The words. Hidden until somebody is close enough to be asking the
       question — a hint you can read from the next island is clutter, and
       seven of them at once is a wall of text over the archipelago. */
    this.hint = null;
    if (this.rule.hint) {
      this.hint = new Label(this.rule.hint, {
        height: 0.52, size: 52, color: '#fff2cf', stroke: '#3a1f08', strokeWidth: 7,
      });
      this.hint.position.y = 4.5;
      this.hint.visible = false;
      this.group.add(this.hint);
    }

    this.ward = this._buildWard();
    if (this.ward) this.group.add(this.ward);
  }

  /**
   * The thing physically in the way, for the locks that have one.
   *
   * Only `ice` and `boulder` build anything here. `cave`, `perch` and `sky`
   * are locked by WHERE THEY ARE, and that is world geometry — a grotto, a
   * spire, a stack of shards — which belongs to the island rather than to the
   * star sitting on it. Keeping the two apart is what lets the ward have a
   * break animation without the island needing one.
   */
  _buildWard() {
    if (!this.rule.breaks) return null;
    const g = new THREE.Group();

    if (this.lock === 'ice') {
      /* A rough crystal, not a sphere: flat facets catch the light and read as
         ice, where a smooth ball reads as a second dragon ball.

         SATURATED, NOT PALE. The first pass was 0xcfeeff at 0.62 — which is
         exactly right for ice and completely invisible, because the only star
         with an ice ward is the one on the SNOW island. Near-white glass on a
         white hillside is camouflage: the thing a player has to spot from a
         dragon and then burn could not be seen from ten units away on foot.
         A ward has to read against its own biome, not against ice in general. */
      const shell = new THREE.Mesh(
        new THREE.IcosahedronGeometry(2.0, 0),
        new THREE.MeshBasicMaterial({
          color: 0x54c8f0, transparent: true, opacity: 0.82,
          depthWrite: false, toneMapped: false,
        })
      );
      shell.position.y = 1.6;
      g.add(shell);
      // Spikes out of the ground, so it looks grown rather than placed. Darker
      // than the shell so the silhouette has an edge against the snow.
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const spike = new THREE.Mesh(
          new THREE.ConeGeometry(0.34, 1.5 + (i % 3) * 0.6, 5),
          new THREE.MeshBasicMaterial({ color: 0x2b8fc4, transparent: true, opacity: 0.95 })
        );
        spike.position.set(Math.cos(a) * 1.7, 0.7 + (i % 3) * 0.3, Math.sin(a) * 1.7);
        spike.rotation.z = Math.cos(a) * 0.3;
        spike.rotation.x = -Math.sin(a) * 0.3;
        g.add(spike);
      }
    } else {
      // A boulder. Opaque, so the star is genuinely hidden and breaking it is
      // a reveal rather than a formality.
      const rock = new THREE.Mesh(
        new THREE.IcosahedronGeometry(2.3, 0),
        new THREE.MeshLambertMaterial({ color: 0x7d746f })
      );
      rock.position.y = 1.5;
      rock.scale.set(1, 0.86, 1.06);
      g.add(rock);
      // The crack, so it reads as breakable rather than as terrain.
      for (let i = 0; i < 3; i++) {
        const seam = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, 2.2, 0.16),
          new THREE.MeshBasicMaterial({ color: 0x2f2a28 })
        );
        seam.position.set(-0.6 + i * 0.6, 1.6, 1.5 - i * 0.25);
        seam.rotation.z = 0.3 - i * 0.25;
        g.add(seam);
      }
    }
    return g;
  }

  /**
   * Can this kitten pick it up right now, and if not, what should she be told?
   *
   * IT RETURNS A REASON RATHER THAN A BOOLEAN. A star that silently declines to
   * be collected is indistinguishable from a broken star — the same rule the
   * shrine join button follows, and for the same reason: a button that does
   * nothing reads as a bug, so the refusal has to be the teaching moment.
   */
  canTake(player) {
    if (this.taken) return { ok: false, why: null };
    if (!this.open) return { ok: false, why: this.rule.hint };
    if (!this.rule.foot) return { ok: true, why: null };

    if (player.mount || player.rideAlong) {
      return { ok: false, why: 'GET OFF THE DRAGON — THIS ONE IS ON FOOT' };
    }
    if (player.pandaMount) {
      return { ok: false, why: 'HOP OFF THE PANDA — TAKE IT ON YOUR OWN FEET' };
    }
    /* SHE HAS TO BE STANDING ON SOMETHING, and this is what actually closed
       the 7★. The pickup test allows FOURTEEN units of vertical slack, so that
       a kitten on a dragon can sweep past a star on a rim and still collect it
       — right for the five locks that want a dragon, and a hole under the two
       that don't. A double jump from the middle shard tops out 1.8 below the
       star, which is comfortably inside fourteen, so the third jump the whole
       island is built around was never needed: she grabbed it at the apex of
       her second and fell back down. Requiring both feet on a surface makes
       the vertical window irrelevant by construction rather than by tuning it,
       which is the trap — any number big enough for a dragon fly-by is big
       enough for a jump. */
    if (!player.onGround) {
      return { ok: false, why: 'LAND ON IT — NOT IN MID-AIR' };
    }
    /* And she has to have got up here herself. `footClimb` is false from the
       moment she touches any mount and is only restored by standing on real
       TERRAIN again, so hopping off a dragon onto the top shard leaves it
       false: the shards are platforms, not ground. */
    if (this.rule.climbed && !player.footClimb) {
      return { ok: false, why: 'CLIMB IT YOURSELF — NO DRAGON, NO PANDA' };
    }
    return { ok: true, why: null };
  }

  /**
   * Something hit the ward. Breaks it only if this is the attack it answers to.
   *
   * @param {'breath'|'claw'} kind
   * @returns {boolean} whether this call is what broke it
   */
  strike(kind) {
    if (this.taken || this.open || this.rule.breaks !== kind) return false;
    this.open = true;
    this.breakT = 0.55;
    return true;
  }

  update(dt, players = null) {
    if (this.taken) return;
    this.t += dt;
    this.group.position.y = this.position.y + Math.sin(this.t * 1.7) * 0.28;
    this.ball.rotation.y += dt * 0.9;
    if (this.beam) this.beam.material.opacity = 0.22 + Math.sin(this.t * 2.2) * 0.09;
    this.label.position.y = 3.3 + Math.sin(this.t * 1.7) * 0.1;

    /* The ward comes apart rather than blinking out. Half a second of a rock
       shrinking and fading is the whole reward for forty canes and a claw, and
       an instant swap would make the thing you just earned look like a
       rendering glitch. */
    if (this.breakT > 0) {
      this.breakT -= dt;
      const k = Math.max(0, this.breakT / 0.55);
      if (this.ward) {
        this.ward.scale.setScalar(0.02 + k * 0.98);
        this.ward.rotation.y += dt * 5;
        for (const m of this.ward.children) {
          m.material.transparent = true;
          m.material.opacity = (m.material.userData.base ??= m.material.opacity ?? 1) * k;
        }
        if (this.breakT <= 0) this.ward.visible = false;
      }
    } else if (this.ward) {
      this.ward.visible = !this.open;
    }

    /* The words appear when somebody is close enough to be asking, AND ONLY
       WHILE THE ANSWER IS STILL NO. A hint that keeps telling you to go in on
       foot while you are standing there on foot about to pick the thing up is
       noise, and noise is what teaches a kid to stop reading the hints — which
       costs her the four that are load-bearing. So it is shown for the players
       who are being refused, and disappears for the one who isn't. */
    if (this.hint) {
      let show = false;
      for (const p of players ?? []) {
        if (Math.hypot(p.position.x - this.position.x, p.position.z - this.position.z) >= HINT_RADIUS
          || Math.abs(p.position.y - this.position.y) >= 34) continue;
        if (!this.canTake(p).ok) { show = true; break; }
      }
      this.hint.visible = show && !this.taken;
      this.hint.position.y = 4.5 + Math.sin(this.t * 1.7) * 0.1;
    }
  }

  faceCamera(camera) {
    if (this.taken) return;
    this.label.faceCamera(camera);
    if (this.hint?.visible) this.hint.faceCamera(camera);
  }

  /** Picked up. Kept in the list so a restart can put it back. */
  take() {
    this.taken = true;
    this.group.visible = false;
  }

  reset() {
    this.taken = false;
    this.group.visible = true;
    this.open = !this.rule.breaks;
    this.breakT = 0;
    if (this.ward) {
      this.ward.visible = !this.open;
      this.ward.scale.setScalar(1);
      for (const m of this.ward.children) {
        if (m.material.userData.base != null) m.material.opacity = m.material.userData.base;
      }
    }
  }
}
