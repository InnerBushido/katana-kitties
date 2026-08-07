import * as THREE from 'three';
import { Billboard } from '../core/gfx.js';
import { SHRINE_DAIS } from '../world/build.js';

/* ---------------------------------------------------------------------------
   Clan leaders.

   Every shrine now has somebody standing at it. Before this, joining a clan
   was walking into a ring and pressing a button at some stonework; the buff
   arrived from nowhere and the clan was a colour and a word. A character who
   turns to you and says what her clan does is the difference between a menu
   and a place.

   The cast is drawn from a page of characters one of the girls designed —
   eight cats, each labelled with its breed, each marked "use". Six of them
   became the leaders, matched to the clan their breed already suggested: the
   Turkish Van (the breed that famously swims) leads Riverclaw, the tuxedo
   nobody hears coming leads Shadowtail, the huge maned Maine Coon leads the
   dragon clan. The calico became Patchfur, who narrates the intro. The orange
   tabby was already in the game — that one is Ember.

   These are FRONT-FACING single cells: `cols: 1, rows: 1, mirror: false`,
   which is the one combination that never flips. The dragon and the panda are
   side-on drawings that mirror to face their heading; a character standing
   still and talking to you must not, or she turns her back the moment you
   walk past her.
--------------------------------------------------------------------------- */

/**
 * The roster, keyed by clan id. `art` is the sprite basename, `line` is what
 * they say when you walk into their ring — which always NAMES THE BUFF,
 * because the whole reason to cross an island is what you get and a
 * nine-year-old shouldn't have to infer it from a motto.
 */
export const LEADERS = {
  thunder: {
    name: 'Sunstreak', breed: 'Siamese', art: 'thunderpaw',
    line: "I am Sunstreak of Thunderpaw.\nWe run so fast the rain never\nlands on us. Stand with me and\nyou'll outrun your own shadow.",
    voice: '/voice/shrine_thunder.mp3',
  },
  river: {
    name: 'Rippleclaw', breed: 'Turkish Van', art: 'riverclaw',
    line: "Rippleclaw of Riverclaw.\nWe never walk around a puddle.\nSwear here and your katana will\nreach what you cannot touch.",
    voice: '/voice/shrine_river.mp3',
  },
  shadow: {
    name: 'Duskcoat', breed: 'Tuxedo', art: 'shadowtail',
    line: "You didn't hear me arrive,\ndid you? Shadowtail jump three\ntimes before we come down.\nCome and learn the third one.",
    voice: '/voice/shrine_shadow.mp3',
  },
  wind: {
    name: 'Galemane', breed: 'Maine Coon', art: 'windwhisker',
    line: "Galemane of Windwhisker.\nWe taught the storm dragons to\nbreathe. Ride with us and yours\nwill breathe twice as far.",
    voice: '/voice/shrine_wind.mp3',
  },
  ice: {
    name: 'Snowmantle', breed: 'Himalayan', art: 'icewhisker',
    line: "Nothing is ever truly lost,\nlittle one. Icewhisker can feel\nthe last unbroken barrel on any\nisland in the sky. Let me show you.",
    voice: '/voice/shrine_ice.mp3',
  },
  panda: {
    name: 'Bambooheart', breed: 'Ragdoll', art: 'pandapaw',
    line: "Pandapaw hand out no power.\nWe hand out a job. Cut twenty\ncanes of bamboo, and something\nvery small will follow you home.",
    voice: '/voice/shrine_panda.mp3',
  },
};

/** The storyteller. No shrine, no clan — she only appears in the intro. */
export const ELDER = {
  name: 'Patchfur', breed: 'Calico', art: 'elder',
};

/* How tall a leader stands, in world units. A kitten is 2.9; these are the
   grown-ups, and reading as taller than the players is most of what makes
   them read as leaders at all. */
const LEADER_HEIGHT = 4.2;

/**
 * How far out from the middle of the dais a leader stands.
 *
 * Exported because the cutscene camera frames this exact spot — a duplicated
 * 3.4 in two files is a shot that silently drifts off its subject the first
 * time somebody nudges one of them.
 */
export const LEADER_OFFSET = 3.4;

/**
 * The most a leader turns toward a player, in radians (~22 degrees).
 *
 * Re-exported from here rather than owned by the scene, because the limit is a
 * fact about the ART — a front-facing single cell has no drawing for a bigger
 * turn — not about any one system that uses it.
 */
export const FACE_BIAS_MAX = 0.38;

/**
 * Where a leader stands, and the axis the camera should look down to see her.
 *
 * Shared by the entity and by the cutscene's shot framing, so the two can
 * never disagree about where she is.
 *
 * SHE STANDS ON THE DAIS, not on the terrain. The stone platform is
 * decorative geometry merged into the world mesh — `world.heightAt` knows
 * nothing about it and returns the hillside underneath, which planted every
 * leader knee-deep in the top step. Her height is therefore the ground under
 * the MIDDLE of the shrine (where the dais was built, and which is flat by
 * construction) plus the dais, not the ground under her own feet.
 */
export function leaderSpot(hall, world) {
  const isl = world.heightAt(hall.x, hall.z)?.island;
  let ax = hall.x - (isl?.x ?? 0);
  let az = hall.z - (isl?.z ?? 0);
  const len = Math.hypot(ax, az) || 1;
  ax /= len;
  az /= len;
  const x = hall.x + ax * LEADER_OFFSET;
  const z = hall.z + az * LEADER_OFFSET;
  const base = world.heightAt(hall.x, hall.z);
  // Off the edge of the stone she'd be back on the hillside — but she isn't,
  // and LEADER_OFFSET is asserted to keep her on it.
  const onDais = LEADER_OFFSET < SHRINE_DAIS.r;
  const g = onDais ? base : (world.heightAt(x, z) ?? base);
  return { x, z, y: (g ? g.y : 0) + (onDais ? SHRINE_DAIS.y : 0), ax, az };
}

/** Wrapped speech, drawn to a canvas and hung in the air. */
function bubbleTexture(text, color) {
  const LINE = 40;
  const lines = text.split('\n');
  const cv = document.createElement('canvas');
  const g0 = cv.getContext('2d');
  g0.font = `600 ${LINE}px Nunito, sans-serif`;
  const w = Math.max(...lines.map((l) => g0.measureText(l).width));
  const PAD = 34;
  const TAIL = 30;
  cv.width = Math.ceil(w + PAD * 2);
  cv.height = Math.ceil(lines.length * LINE * 1.28 + PAD * 2 + TAIL);

  const g = cv.getContext('2d');
  const W = cv.width;
  const H = cv.height - TAIL;
  const r = 26;

  /* Rounded box plus a tail, drawn as one path so the outline runs round the
     whole thing — a separately stroked tail leaves a seam across the point
     where it meets the box, which at this size is very visible. */
  g.beginPath();
  g.moveTo(r, 0);
  g.lineTo(W - r, 0);
  g.quadraticCurveTo(W, 0, W, r);
  g.lineTo(W, H - r);
  g.quadraticCurveTo(W, H, W - r, H);
  g.lineTo(W * 0.42 + 26, H);
  g.lineTo(W * 0.40, H + TAIL);
  g.lineTo(W * 0.42 - 4, H);
  g.lineTo(r, H);
  g.quadraticCurveTo(0, H, 0, H - r);
  g.lineTo(0, r);
  g.quadraticCurveTo(0, 0, r, 0);
  g.closePath();
  g.fillStyle = 'rgba(28,17,24,0.90)';
  g.fill();
  g.lineWidth = 7;
  g.lineJoin = 'round';
  g.strokeStyle = color;
  g.stroke();

  g.font = `600 ${LINE}px Nunito, sans-serif`;
  g.fillStyle = '#fff4dd';
  g.textBaseline = 'top';
  lines.forEach((l, i) => g.fillText(l, PAD, PAD + i * LINE * 1.28));

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { texture: tex, aspect: cv.width / cv.height };
}

export class ClanLeader {
  /**
   * @param {object} clan  the CLANS entry
   * @param {object} art   atlas from loadSpriteAtlas
   * @param {object} hall  the clanHall entry — {x, z} at the middle of the dais
   * @param {World} world  for the axis out of the island and the ground height
   */
  constructor(clan, art, hall, world) {
    this.clan = clan;
    this.spec = LEADERS[clan.id];
    this.name = this.spec?.name ?? clan.name;

    /* She stands on the FAR side of the dais, on the axis running out from
       the island's centre, so a kitten walking up from the island meets her
       across the ring — with the gate and the beam behind her — rather than
       arriving at her back. */
    const at = leaderSpot(hall, world);
    this.position = new THREE.Vector3(at.x, at.y, at.z);

    this.group = new THREE.Group();
    this.group.position.copy(this.position);

    const quad = LEADER_HEIGHT / (art.contentScale || 1);
    this.quad = quad;
    this.sprite = new Billboard(art.texture, {
      cols: 1,
      rows: 1,
      width: quad,
      height: quad,
      footOffset: (art.pad ?? 0) * quad,
      /* The one combination that never mirrors: with a single cell and the
         full-turn path, the cell index is always 0 and `flip` is never set.
         Leaving mirror on (the default) would flip her left-to-right the
         moment the camera crossed her axis, which on a character with a sash
         over one shoulder is instantly obvious. */
      mirror: false,
    });
    this.group.add(this.sprite);

    // Blob shadow, so she's standing on the dais rather than hovering over it.
    const sg = new THREE.CircleGeometry(0.9, 18);
    sg.rotateX(-Math.PI / 2);
    this.shadow = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({
      color: 0x2a1830, transparent: true, opacity: 0.34, depthWrite: false,
    }));
    this.group.add(this.shadow);

    const hex = `#${clan.color.toString(16).padStart(6, '0')}`;
    const { texture, aspect } = bubbleTexture(this.spec.line, hex);
    const BH = 3.5;
    this.bubble = new THREE.Mesh(
      new THREE.PlaneGeometry(BH * aspect, BH),
      new THREE.MeshBasicMaterial({
        map: texture, transparent: true, opacity: 0,
        depthWrite: false, depthTest: false, toneMapped: false,
        side: THREE.DoubleSide,
      })
    );
    this.bubble.position.y = LEADER_HEIGHT + 2.6;
    this.bubble.renderOrder = 24;
    this.bubble.visible = false;
    this.group.add(this.bubble);

    this.t = Math.random() * Math.PI * 2;
    this.show = 0;

    /* Has her shrine scene played? Latches on START, not on finish, so
       skipping still spends it — see ShrineScene. Joining the clan is gated
       on this: you cannot swear to somebody you have not met. */
    this.met = false;
    /** One line of speech, unwrapped, for the dialogue box's typewriter. */
    this.textLine = this.spec.line.replace(/\n/g, ' ');
    /** Current and target turn-toward-you, in radians. See lookAt. */
    this.faceBias = 0;
    this.faceWant = 0;
  }

  /**
   * Turn slightly toward a point — or back to square when passed null.
   *
   * She cannot actually rotate. She is one front-facing drawing that must
   * never mirror (see the header), so past about a quarter turn there is
   * simply no art for where she is looking, and a billboard yawed that far
   * shows its own edge. What DOES work is a small bias on top of the
   * camera-facing turn, capped well inside that limit: a flat drawing tilted
   * twenty degrees reads as a character shifting toward you, and the cap is
   * what keeps it reading that way from every camera angle rather than only
   * the one it was authored against.
   *
   * The horizontal squash is the other half of it — a real turn foreshortens,
   * and taking half the cosine sells the rotation far better than the yaw
   * does on its own.
   */
  lookAt(target) {
    if (!target) { this.faceWant = 0; return; }
    this.faceTarget = target;
    this.faceWant = null;   // recomputed per frame against the live camera
  }

  faceCamera(camera) {
    this.sprite.faceCamera(camera);

    /* Where she'd have to turn to face the target, measured in the CAMERA's
       frame — "toward you" is a screen direction, and in split screen the two
       kittens have their own cameras. */
    if (this.faceTarget && this.faceWant === null) {
      const camYaw = Math.atan2(
        camera.position.x - this.position.x,
        camera.position.z - this.position.z
      );
      const toYaw = Math.atan2(
        this.faceTarget.x - this.position.x,
        this.faceTarget.z - this.position.z
      );
      let d = toYaw - camYaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.faceWant = THREE.MathUtils.clamp(d, -FACE_BIAS_MAX, FACE_BIAS_MAX);
    }
    const want = this.faceWant ?? 0;
    this.faceBias += (want - this.faceBias) * 0.12;
    this.sprite.mesh.rotation.y += this.faceBias;
    const fore = Math.cos(this.faceBias);
    this.sprite.mesh.scale.x *= 1 - (1 - fore) * 0.5;

    // The bubble takes the camera's own orientation rather than a yaw-only
    // turn, so it stays square to the screen when the camera tilts down —
    // which it does hard in the cutscene.
    this.bubble.quaternion.copy(camera.quaternion);
  }

  /**
   * @param players the kittens, so she can notice one arriving. Pass an empty
   *        list during the cutscene: her bubble carries the shrine invitation,
   *        which is a DIFFERENT line from the one she speaks in the intro, and
   *        two blocks of unrelated text on screen at once is clutter. The
   *        dialogue box owns the words there.
   */
  update(dt, players) {
    this.t += dt;

    let near = false;
    for (const p of players ?? []) {
      if (p.mount) continue;
      if (Math.hypot(p.position.x - this.position.x, p.position.z - this.position.z) < 11) {
        near = true;
      }
    }

    /* Ease the bubble in and out. Snapping it on the instant someone clips the
       radius makes it strobe when a kitten paces the edge of a shrine, which
       they do constantly because that's where the ring is. */
    this.show += ((near ? 1 : 0) - this.show) * Math.min(1, dt * 5);
    this.bubble.visible = this.show > 0.02;
    this.bubble.material.opacity = this.show;
    this.bubble.position.y = LEADER_HEIGHT + 2.6 + Math.sin(this.t * 1.6) * 0.16;
    this.bubble.scale.setScalar(0.7 + this.show * 0.3);

    // A slow breathing bob, and a lean toward whoever she's talking to.
    this.sprite.mesh.scale.set(
      1 - Math.sin(this.t * 1.5) * 0.012,
      1 + Math.sin(this.t * 1.5) * 0.018,
      1
    );
    this.sprite.mesh.rotation.z = Math.sin(this.t * 0.7) * 0.02;
    this.group.position.y = this.position.y + Math.sin(this.t * 1.5) * 0.05;
  }
}
