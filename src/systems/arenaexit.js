import * as THREE from 'three';
import { Billboard, paint } from '../core/gfx.js';
import { PALETTE } from '../world/build.js';

/* ---------------------------------------------------------------------------
   OUT THROUGH THE FRONT DOOR — the end of a tournament that began at it.

   "Once the arena fight is over, if the players started the fight at the
   entrance of the arena, it should return them there once it is over. We can
   have a cutscene play where, instead of griffin flying back to the main
   island, the doors to the arena are opened and the players that won walk back
   to the entrance of the arena. The players that lost are 'knocked over' ...
   on a stretcher ... 'hospital' cats that are carrying the stretcher from the
   front and the back ... Mr. Satan should be waiting for them and when they
   walk past him, he puts his arms up with the Charge animation ... as if he is
   excited and sad at the same time, have him hold the pose for a few seconds
   before going back to normal before the cutscene fades out and ends. The
   winning players can be jumping around as they return to the entrance, since
   they won and are happy and excited!"

   THE WHOLE SCENE IS A FUNCTION OF ITS CLOCK. `_plan` lays the procession out
   once, at `start`, as start times, speeds and marks — every position below is
   read off `this.t` and nothing is integrated — so the scene cannot drift, a
   skip lands on exactly the frame a watch would have ended on, and the checks
   can ask where anybody is at any second without playing it.

   ITS ACTORS ARE ITS OWN. Billboards built off each kitten's own atlas, three
   hospital cats' worth of bearers and a procedural stretcher: the real kittens
   are hidden for the length of it and put down on the carpet when it is over.
   The one exception is Mr Satan, who is the real one — he is standing where he
   stands in the game, before and after, and his charge pose is the real pose.

   STATE CHANGES ON ACCEPT. `Game.leaveArena` tears the tournament down BEFORE
   this starts, so a skip on frame one leaves exactly the world a watch leaves:
   the kittens on the carpet, standing, the doors swinging shut behind them,
   and Mr Satan back on his door.

   THE STRETCHER IS 3D GEOMETRY, NOT A SPRITE. Generated turnarounds of a
   stretcher came back with their end-on views in three different columns —
   a sheet that disagreed with itself about which way the thing pointed — and
   a pole-and-canvas frame is six boxes that read correctly from every angle.
   The bearers are generated art (sprites/hospital/cat.png, ten views, a stand
   row and a walk row, arms down so the poles sit at their paws).
--------------------------------------------------------------------------- */

/** Every fixed number the scene is laid out with, in one place. */
export const EXIT = {
  fadeIn: 0.7,
  /** When the doors start to open, and how long before anyone steps out. */
  doorAt: 0.8,
  firstOut: 1.9,
  /** Winners hop, losers are carried, a draw walks. Units a second. */
  hopSpeed: 4.4, carrySpeed: 3.1, walkSpeed: 3.6,
  /** Seconds between one stretcher leaving and the next. */
  carryGap: 2.1,
  /** How far inside the doorway everybody starts, and the carpet marks. */
  inside: 7,
  /** The hop: height and rate. */
  hopH: 1.25, hopRate: 2.6,
  /** Bearers: half the spacing between the two, the paw height as a fraction
   *  of the cat, and the cat's height (a kitten is 2.9). */
  bearHalf: 2.35, pawK: 0.34, catH: 2.75,
  /** Where the winners finish, relative to his mark.
   *  THE FIRST TWO IN FRONT OF HIM, one either side. Richard: "lets have the
   *  first 2 winning players walking/jumping infront of Mr. Satan, not behind
   *  him, we can have them walk behind if more than 2 winners ... because
   *  they are champions and should be infront." The second one's mark used
   *  to be (2.6, 3.0), on the far side of him from both lenses that film
   *  them: she crossed his line 1.6 behind him and finished 2.6 behind. Both
   *  marks now stand 3 toward the `him` lens (bearing -60) and 2.4 either
   *  side of its line to him, so neither covers him, and both are on the
   *  lens side (-x) of him for the side-on shot. A third and fourth go
   *  behind, clear of him. */
  round: [[-1.4, 3.6], [-3.8, -0.6], [2.6, 3.0], [1.4, -3.4]],
  /** He holds the charge this long after the last of them has gone by. */
  /** Seconds the side-on shot takes to become the one on him — see `pose`. */
  himBlend: 1.4,
  holdAfter: 2.6,
  /** ...then stands normally this long, then the fade. */
  settle: 1.1, fadeOut: 0.8,
  /** His two lines, in his own bubble — see `update`. */
  lines: [
    'Make way, make way!\nHere come the CHAMPIONS!',
    '...and the bravest little fighters\nI ever saw. *sniff* Such HEART!',
  ],
  /** ...and their recordings, Harrison's preset on the same two strings
   *  (the line break is layout). 3.12 s and 4.40 s. */
  voices: ['sat_parade1', 'sat_parade2'],
  /** A breath between his two lines, and after the second before the fade. */
  lineGap: 0.3,
};

/**
 * THE THREE SHOTS, AS NUMBERS, each measured against its doors (D) or his mark
 * (S). SOLVED, NOT PICKED: every candidate was scored against the real
 * entrance for the four casts a tournament can end with (1v1, one against
 * three, 2v2, a draw) — what fraction of the shot's subjects are inside the
 * letterbox and not behind a lantern, a dragon column, a torii post or its
 * beam — and world-check replays the winners through the same test.
 *
 *  doors — LOW AND THROUGH THE TORII, from between the nearest pair of
 *          lanterns. The first try was three-quarter from the left at 19
 *          units out, which put the lens inside the far-left lantern's roof.
 *          THE PUSH IS SMALL BECAUSE THE DOORWAY IS BIG: at the first frame
 *          it is 1.33 of the 1.56 of frame height the letterbox leaves, so
 *          the 0.14 the solve first chose (it scored the actors, not the
 *          doors' corners) put the left leaf's top 0.11 into the letterbox by
 *          the cut — 82% of the corner sightings. 0.04 and a look 0.3 higher
 *          keeps all four corners in for the whole shot with 0.027 to spare;
 *          0.05 is the largest that fits at all.
 *  along — side-on from HIS far side, inside the lantern row: from outside it
 *          (x -15) the dragon column and both lanterns stood between the lens
 *          and the carpet in turn. It never trucks past `zAhead` of him,
 *          because beyond that the torii's left post is in the sight line.
 *          WIDE ON PURPOSE, 66 degrees: the lanterns stop the lens backing
 *          off, and at 56-60 the bearers' feet left the frame (0.79-0.82 of
 *          sightings against 0.97-0.98).
 *  him   — Mr Satan, his bubble and the winners hopping round him, from
 *          his left, low, inside the torii. Not a close-up, because his lines
 *          are in his bubble and bubble-to-feet is 8.6 units — a nearer lens
 *          has to choose which end of him to lose. Two solves were thrown
 *          out: off his left at -25 degrees and 18 out, where the winner's end
 *          mark was five units in front of the lens and filled half of it (so
 *          the actors are occluders in the solve now, and the winners finish
 *          round him — `EXIT.round`); and straight down the carpet at 16,
 *          which scored well and put the torii's right post down the middle
 *          of the frame between her and him (so a post inside the middle 60%
 *          of the frame now costs a candidate 0.3).
 */
export const SHOTS = {
  doors: { fov: 46, x: -2.5, y: 3.5, z: 20.9, lookX: 1.5, lookY: 5.8, lookZ: 1, push: 0.04 },
  along: { fov: 66, x: -7.5, y: 3.5, zo: -1, zAhead: 3, lookX: 1.8, lookY: 3 },
  him: { fov: 66, bearing: -60, dist: 12, y: 3.2, lookY: 3.6 },
};
const ALONG = SHOTS.along;

/**
 * WHICH WAY EACH OF THE BEARERS' TEN DRAWINGS FACES, in degrees from facing
 * the camera, toward screen-right. MEASURED, NOT EVENLY SPACED: the generated
 * sheet's views are bunched — the eyes sit 0.00, 0.10, 0.14, 0.24 of a head's
 * width off centre across columns 0-3 and -0.21, -0.11, 0.00 across 7-9, with
 * no eyes at all on 4-6 — so its clean profiles are columns 3 and 7, where an
 * even 36-degree grid puts them at 2.5 and 7.5. Read on the even grid (what
 * `Billboard` does), a cat walking straight across the screen was drawn in
 * three-quarter, looking at the camera. `_faceBearer` picks off this instead.
 */
export const CAT_VIEWS = [0, 28, 55, 90, 135, 180, 225, 270, 310, 345];

const _wp = new THREE.Vector3();

function mkBox(w, h, d, color, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  paint(g, color);
  g.translate(x, y, z);
  return g;
}

/**
 * A stretcher along +z: two poles, a canvas bed with a red cross, two spreader
 * bars. The origin is the middle of the poles at pole height.
 */
function buildStretcher(len) {
  const grp = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const parts = [];
  for (const s of [-1, 1]) {
    const pole = new THREE.CylinderGeometry(0.09, 0.09, len, 8);
    pole.rotateX(Math.PI / 2);
    paint(pole, PALETTE.wood);
    pole.translate(s * 0.62, 0, 0);
    parts.push(pole);
  }
  parts.push(mkBox(1.18, 0.07, len - 1.5, 0xf1ebdc, 0, 0.02, 0));
  parts.push(mkBox(0.5, 0.08, 0.14, 0xd8323a, 0, 0.05, len * 0.18));
  parts.push(mkBox(0.14, 0.08, 0.5, 0xd8323a, 0, 0.05, len * 0.18));
  for (const z of [-(len - 1.5) / 2, (len - 1.5) / 2]) parts.push(mkBox(1.3, 0.1, 0.12, PALETTE.woodDark, 0, -0.02, z));
  for (const g of parts) grp.add(new THREE.Mesh(g, mat));
  return grp;
}

export class ArenaExit {
  constructor({ world, audio }) {
    this.world = world;
    this.audio = audio;
    this.active = false;
    this.t = 0;
    this.camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 4000);
    this._look = new THREE.Vector3();
    this._from = new THREE.Vector3();
    this._fromLook = new THREE.Vector3();
    this.root = new THREE.Group();
    this.root.visible = false;
    /** The bearers' atlas, handed in by `Game` once it has loaded. */
    this.catArt = null;

    this.el = typeof document !== 'undefined' ? document.getElementById?.('cutscene') ?? null : null;
    this.boxEl = this.el && document.getElementById('cs-box');
    this.fadeEl = this.el && document.getElementById('cs-fade');
    this.barEl = this.el && document.getElementById('cs-progress');
  }

  /**
   * Lay the procession out. Pure: marks and times from the world's door and
   * who won, so the checks can ask it for a plan without a scene.
   *
   * @param {{won: boolean[]}} cast one entry per kitten, in seat order
   */
  plan(cast) {
    const W = this.world;
    const D = W.arenaDoors;
    const S = W.arenaDoorStand;
    const C = W.arenaCarpet;
    const E = EXIT;
    const anyWon = cast.won.some(Boolean);
    const winners = [];
    const losers = [];
    cast.won.forEach((w, i) => ((w || !anyWon) ? winners : losers).push(i));
    const z0 = D.z - E.inside;
    const actors = [];
    /* THE WINNERS FIRST, out of the doors and round HIM — they finish on
       `E.round`, a ring of marks just in front of his, still hopping. They
       used to hop on down the carpet, and the last of them landed a few units
       from the lens that is framing him for his big moment, filling half of
       it with the back of her head. A draw walks instead: nobody lost, and
       nobody won either. */
    winners.forEach((i, k) => {
      const n = winners.length;
      const [dx, dz] = E.round[k % E.round.length];
      actors.push({
        seat: i, kind: anyWon ? 'hop' : 'walk',
        x0: D.x + 0.6 + (k - (n - 1) / 2) * 1.5, x1: S.x + dx,
        z0: z0 - k * 0.6, z1: S.z + dz,
        at: E.firstOut + k * 0.25,
        speed: anyWon ? E.hopSpeed : E.walkSpeed,
      });
    });
    /* ...AND THEN THE STRETCHERS, in single file down the far side of the
       carpet from him, each stopping short of the one before. */
    const carryAt = E.firstOut + (winners.length ? 1.6 : 0);
    losers.forEach((i, k) => {
      actors.push({
        seat: i, kind: 'carry',
        x0: D.x - 1.3, x1: D.x - 1.3,
        z0, z1: C.z1 - 4 - k * (E.bearHalf * 2 + 2.2),
        at: carryAt + k * E.carryGap,
        speed: E.carrySpeed,
      });
    });
    for (const a of actors) {
      a.dur = Math.abs(a.z1 - a.z0) / a.speed;
      /* When this one's middle goes by him — the moment the note is about. */
      a.passAt = a.at + Math.max(0, (S.z + 0.5 - a.z0) / a.speed);
    }
    const first = Math.min(...actors.map((a) => a.passAt));
    const last = Math.max(...actors.map((a) => a.passAt + (a.kind === 'carry' ? E.bearHalf / a.speed : 0)));
    const chargeOff = last + E.holdAfter;
    /* HIS LINES ARE TIMED TO HIS VOICE when there is one. The second waited
       only for the last of them to reach him, and a draw's walkers reach him
       3.4 s after the first line starts, which is shorter than it is said
       in. So the second starts once the first has been SAID, and the fade
       waits for the second to be. `lineDur` is the two clips' lengths, from
       the announcer's buffers; with no files it is zeros and this is the
       scene it was. */
    const [d0, d1] = this.lineDur ?? [0, 0];
    const lineAt = [E.firstOut, Math.max(last - 0.6, d0 ? E.firstOut + d0 + E.lineGap : 0)];
    const end = Math.max(chargeOff + E.settle + E.fadeOut, d1 ? lineAt[1] + d1 + E.lineGap + E.fadeOut : 0);
    /* THE SHOTS, keyed to the procession rather than to the clock:
         doors   — three-quarter on the doors with him in it, until the first
                   stretcher (or the last winner) has cleared the doorway;
         along   — side-on down the carpet from his far side, trucking with
                   the stretchers, so they go by IN FRONT of him;
         him     — a medium on Mr Satan, holding the pose and letting it go. */
    const lead = actors.find((a) => a.kind === 'carry') ?? actors[actors.length - 1];
    const cutAlong = Math.min(first - 0.4, lead.at + (D.z + 2 - lead.z0) / lead.speed);
    const cutHim = Math.max(cutAlong + 2.5, last + 0.3);
    return {
      actors, first, last, chargeAt: first, chargeOff, end, lineAt,
      shots: [
        { id: 'doors', from: 0 },
        { id: 'along', from: Math.max(E.doorAt + 1.6, cutAlong) },
        { id: 'him', from: cutHim },
      ],
    };
  }

  /**
   * The z the side-on shot trucks to at time `t`: the stretchers, each
   * weighted by how near it is to HIS mark, so the lens rides with whichever
   * one is going past him and hands over to the next without a jump. A plain
   * mean of three stretchers strung out over twenty units framed the gap
   * between them. Every stretcher's z is a smooth function of `t`, so this is
   * too — no state, no follow lag.
   */
  alongZ(t) {
    const P = this.plan_;
    const S = this.world.arenaDoorStand;
    const D = this.world.arenaDoors;
    const carried = P.actors.filter((a) => a.kind === 'carry');
    const src = carried.length ? carried : P.actors;
    let sw = 0;
    let sz = 0;
    for (const a of src) {
      const z = this.where(a, t).z;
      const w = Math.exp(-(((z - S.z) / 6) ** 2)) + 1e-4;
      sw += w;
      sz += w * z;
    }
    return Math.max(D.z + 3, Math.min(S.z + ALONG.zAhead, sz / sw));
  }

  /** Where actor `a` is at scene time `t`: {x, z, moving, u}. */
  where(a, t) {
    const u = Math.max(0, Math.min(1, (t - a.at) / Math.max(0.01, a.dur)));
    return {
      x: a.x0 + (a.x1 - a.x0) * u,
      z: a.z0 + (a.z1 - a.z0) * u,
      moving: t > a.at && u < 1,
      u,
    };
  }

  /**
   * @param {object} o
   * @param {object[]} o.players  the real kittens, in seat order
   * @param {boolean[]} o.won     one per kitten
   * @param {object} o.satan      the real Mr Satan
   * @param {THREE.Scene} o.scene
   */
  start({ players, won, satan, scene, announcer = null }) {
    if (this.active || !this.world.arenaDoors) return false;
    this.players = players;
    this.satan = satan;
    /* HIS VOICE IS THE SCENE'S, AND NOTHING ELSE OF HIS PLAYS OVER IT.
       Richard: "If Mr. Satan voice is still queued up before the cutscene, we
       can end the queue and just play his voice for this new cutscene." The
       round's last calls (`sat_win1`, `sat_over`, ...) are queued as the
       tournament ends, which is the frame this starts on. `hush` empties the
       queue, stops the line in his mouth and refuses new ones until
       `finish` — whatever it was set to before is put back, so a parade
       can never lift the ending's hush. */
    this.announcer = announcer;
    this._hushWas = announcer?.hushed ?? false;
    announcer?.hush(true);
    this.lineDur = EXIT.voices.map((id) => announcer?.clip(id)?.dur ?? 0);
    this.plan_ = this.plan({ won });
    this.t = 0;
    this.active = true;
    this.lineI = -1;
    this.charged = false;
    if (!this.root.parent && scene) scene.add(this.root);
    this._cast();
    this.root.visible = true;

    this.world.setArenaDoors(false, true);
    const S = this.world.arenaDoorStand;
    satan?.moveTo(S.x, S.y, S.z);
    satan?.setLine('');
    satan?.setPose?.('idle', 'exit');
    /* SHOWN BY THE SCENE, not trusted to be. The quest makes him visible when
       it reaches 'open', and a party at his doors has always passed that — but
       a debug jump straight to the arena has not, and a take of this scene with
       no Mr Satan in it was the first thing a three-kitten run showed. He is
       the scene's subject; it does not ask whether he was left switched on. */
    if (satan) satan.group.visible = true;
    for (const p of players) p.group.visible = false;

    /* The letterbox, the fade and the skip line — and not the box: he says
       his lines in his own bubble (see `update`). */
    if (this.el) {
      this.el.classList.remove('hidden');
      this.boxEl.style.visibility = 'hidden';
    }
    this.update(0);
    return true;
  }

  /** The billboards, bearers and stretchers for this showing. */
  _cast() {
    for (const c of [...this.root.children]) this.root.remove(c);
    this.actors = this.plan_.actors.map((a) => {
      const p = this.players[a.seat];
      const spec = p?.spriteSpec;
      const fig = spec ? new Billboard(spec.texture, spec.opts) : null;
      if (fig) {
        fig.mat.color.copy(p.sprite.mat.color);
        this.root.add(fig);
      }
      const act = { a, fig, anim: p?.anim ?? { idle: 0, walk: 0, jump: 0 }, height: p?.height ?? 2.9 };
      if (a.kind === 'carry') {
        act.stretcher = buildStretcher(EXIT.bearHalf * 2 + 0.3);
        this.root.add(act.stretcher);
        act.bearers = [0, 1].map(() => this._bearer());
        for (const b of act.bearers) if (b) this.root.add(b);
        /* Knocked out, the way the ring draws it — the jump row on its side,
           dimmed — but only a shade dimmed: she is being looked after. */
        if (fig) {
          fig.row = act.anim.jump;
          fig.mat.color.multiplyScalar(0.72);
        }
      }
      return act;
    });
  }

  _bearer() {
    const art = this.catArt;
    if (!art?.texture) return null;
    const quad = EXIT.catH / (art.contentScale || 1);
    return new Billboard(art.texture, {
      cols: art.cols, rows: art.rows,
      width: quad, height: quad, footOffset: (art.pad ?? 0) * quad,
      artFacesRight: true, mirror: false, dirSense: 1,
    });
  }

  skip() { if (this.active) this.finish(); }

  /**
   * Over, watched or skipped: put the kittens on their marks, standing, and
   * send the doors shut behind them.
   */
  finish() {
    if (!this.active) return;
    this.active = false;
    this.root.visible = false;
    for (const c of [...this.root.children]) this.root.remove(c);
    const W = this.world;
    const P = this.plan_;
    for (const a of P.actors) {
      const p = this.players[a.seat];
      if (!p) continue;
      /* WHERE SHE WAS GOING, NOT WHERE THE SKIP CAUGHT HER. A stretcher's
         kitten gets up where it was set down, beside it rather than on top of
         where its bearer stood. */
      const x = a.x1 + (a.kind === 'carry' ? -1.2 : 0);
      const g = W.heightAt(x, a.z1);
      p.position.set(x, (g ? g.y : W.arenaDoors.y) + 0.1, a.z1);
      p.group.position.copy(p.position);
      p.velocity?.set(0, 0, 0);
      p.camTarget?.copy(p.position);
      p.onGround = true;
      p.footClimb = true;
      /* Facing the road home — the way the camera behind her looks. */
      p.facing = 0;
      p.group.visible = true;
      /* OUTSIDE, SAID OUTRIGHT. Her side of the stands' wall is read off where
         she WAS (`World.arenaWallAt`), and it is only asked within a few
         units of the wall — every mark here is further out than that, so it
         kept saying 'in' from the fight, and `Game._arenaDoorman` opened the
         doors again to let her out. "After cutscene is over and players have
         left the arena, the doors to the arena should close post-fight." */
      p.arenaSide = 'out';
    }
    this.satan?.setPose?.('idle', 'exit');
    W.setArenaDoors(false);
    this.satan?.setLine('');
    /* A SKIP CUTS HIM OFF WITH IT, and a watch has already heard him out. */
    if (this._voice) {
      this.audio?.stopSpeaking?.();
      this._voice = null;
    }
    if (this.announcer && !this._hushWas) this.announcer.hush(false);
    if (this.el) {
      this.el.classList.add('hidden');
      this.boxEl.style.visibility = '';
    }
  }

  faceCamera(camera) {
    if (!this.active) return;
    for (const act of this.actors ?? []) {
      act.fig?.faceCamera(camera);
      for (const b of act.bearers ?? []) if (b) this._faceBearer(b, camera);
    }
  }

  /** Turn a bearer to the lens, then choose her drawing off `CAT_VIEWS`. */
  _faceBearer(b, camera) {
    b.faceCamera(camera);
    if (b.cols !== CAT_VIEWS.length) return;
    b.getWorldPosition(_wp);
    const camA = Math.atan2(camera.position.x - _wp.x, camera.position.z - _wp.z);
    const rel = ((((b.facing - camA) * 180) / Math.PI) % 360 + 360) % 360;
    let best = 0;
    let gap = Infinity;
    CAT_VIEWS.forEach((a, i) => {
      const d = Math.abs(((rel - a + 540) % 360) - 180);
      if (d < gap) { gap = d; best = i; }
    });
    b._setCell(best, b.row, false);
  }

  update(dt) {
    if (!this.active) return false;
    this.t += dt;
    const t = this.t;
    const P = this.plan_;
    const W = this.world;
    const E = EXIT;
    const ground = (x, z) => (W.heightAt(x, z)?.y ?? W.arenaDoors.y);

    if (t >= E.doorAt && W.arenaDoorWant === 0) {
      W.setArenaDoors(true);
      this.audio?.play?.('doors');
    }

    /* --- the camera, from the shot list --- */
    const shot = [...P.shots].reverse().find((s) => t >= s.from) ?? P.shots[0];
    this._aim(shot, t);

    /* --- the procession --- */
    for (const act of this.actors) {
      const { a } = act;
      const w = this.where(a, t);
      const gy = ground(w.x, w.z);
      if (a.kind === 'carry') this._carry(act, w, gy, t);
      else this._step(act, w, gy, t);
    }

    /* --- him: arms up as they go by, held, and let go --- */
    const S = this.satan;
    if (S) {
      const want = t >= P.chargeAt && t < P.chargeOff ? 'charge' : 'idle';
      if ((want === 'charge') !== this.charged) {
        this.charged = want === 'charge';
        S.setPose?.(want, 'exit');
        if (this.charged) this.audio?.play?.('victory', 0.6);
      }
      /* HIS LINES ARE HIS BUBBLE, not the dialogue box. The box sits over
         the bottom third of the frame, which is exactly where a procession on
         a carpet is — measured on an 824x422 pane, it covered both kittens.
         `update` shows the bubble to whoever is near him, so it is handed one
         "somebody" standing on his own mark while he has a line. */
      S.update?.(dt, this.lineI >= 0 ? [{ position: S.position }] : []);
    }

    /* --- the two lines, said as well as shown --- */
    const lineI = t >= P.lineAt[1] ? 1 : t >= P.lineAt[0] ? 0 : -1;
    if (lineI !== this.lineI) {
      this.lineI = lineI;
      this.satan?.setLine(lineI < 0 ? '' : E.lines[lineI]);
      const clip = lineI < 0 ? null : this.announcer?.clip(E.voices[lineI]);
      if (clip) this._voice = this.audio?.speak?.(clip.el) ?? null;
    }

    if (this.fadeEl) {
      const fin = Math.max(0, 1 - t / E.fadeIn);
      const fout = Math.max(0, Math.min(1, (t - (P.end - E.fadeOut)) / E.fadeOut));
      this.fadeEl.style.opacity = Math.max(fin, fout);
    }
    if (this.barEl) this.barEl.style.width = `${Math.min(1, t / P.end) * 100}%`;
    if (t >= P.end) this.finish();
    return this.active;
  }

  /** A kitten on her own feet — hopping for joy, or walking for a draw. */
  _step(act, w, gy, t) {
    const { a, fig } = act;
    if (!fig) return;
    let y = 0;
    let row = act.anim.idle;
    if (a.kind === 'hop' && t > a.at - 0.4) {
      /* Hops all the way, and on the spot once she is there: "the winning
         players can be jumping around ... since they won and are happy". */
      const ph = (t - a.at) * EXIT.hopRate + a.seat * 0.9;
      y = Math.abs(Math.sin(ph * Math.PI)) * EXIT.hopH;
      row = y > 0.18 ? act.anim.jump : act.anim.idle;
    } else if (w.moving) {
      row = act.anim.walk;
      y = Math.abs(Math.sin((t - a.at) * 7)) * 0.08;
    }
    fig.position.set(w.x, gy + 0.12 + y, w.z);
    fig.row = row;
    /* Down the carpet while she is going, and to the camera once she is
       there — a champion on her mark is looking at whoever is watching. */
    fig.facing = w.u < 1 ? Math.atan2(a.x1 - a.x0, a.z1 - a.z0)
      : Math.atan2(this.camera.position.x - w.x, this.camera.position.z - w.z);
  }

  /** A stretcher, its two bearers, and whoever is lying on it. */
  _carry(act, w, gy, t) {
    const { a, fig, stretcher, bearers } = act;
    const E = EXIT;
    const dirZ = Math.sign(a.z1 - a.z0) || 1;
    const step = w.moving ? (t - a.at) * 6.2 : 0;
    const bob = w.moving ? Math.abs(Math.sin(step)) * 0.07 : 0;
    const paw = gy + E.catH * E.pawK;
    stretcher.position.set(w.x, paw + bob * 0.6, w.z);
    stretcher.rotation.set(0, 0, w.moving ? Math.sin(step * 0.5) * 0.025 : 0);
    bearers.forEach((b, k) => {
      if (!b) return;
      const s = k === 0 ? 1 : -1;
      b.position.set(w.x, gy + 0.1 + (w.moving ? Math.abs(Math.sin(step + k * Math.PI / 2)) * 0.08 : 0), w.z + s * dirZ * E.bearHalf);
      b.row = w.moving ? 1 : 0;
      b.facing = dirZ > 0 ? 0 : Math.PI;
    });
    if (fig) {
      /* ON HER BACK ALONG THE STRETCHER. A billboard lying down is lying
         across the SCREEN, so she is laid along the camera's own right and
         slid back half her length to sit on the canvas's middle — which is
         the stretcher's length from the side-on shot the procession is
         filmed in. */
      /* The quad's +x is the camera's right once it has turned to the lens,
         and a +1.42 roll lays her head to the LEFT of her feet — so her feet
         go half a body to the right of the canvas's middle. She is drawn in
         profile facing screen-right, which the roll turns face-up. */
      const cam = this.camera.position;
      const camA = Math.atan2(cam.x - w.x, cam.z - w.z);
      const half = act.height * 0.42;
      fig.position.set(w.x + Math.cos(camA) * half, paw + 0.12 + bob * 0.6, w.z - Math.sin(camA) * half);
      fig.row = act.anim.jump;
      fig.mesh.rotation.z = 1.42;
      fig.facing = camA + Math.PI / 2;
    }
  }

  /** The camera for `shot`, at scene time `t`. */
  _aim(shot, t) {
    const W = this.world;
    const D = W.arenaDoors;
    const S = W.arenaDoorStand;
    const cam = this.camera;
    const P = this.plan_;
    this.pose(shot.id, t, shot.from, cam);
  }

  /**
   * Put `cam` where shot `id` has it at time `t`. Split out of `_aim` so the
   * checks (and the solver that chose `SHOTS`) move the very same lens.
   */
  pose(id, t, from, cam = this.camera) {
    if (cam.fov !== SHOTS[id].fov) {
      cam.fov = SHOTS[id].fov;
      cam.updateProjectionMatrix();
    }
    const D = this.world.arenaDoors;
    const S = this.world.arenaDoorStand;
    const P = this.plan_;
    if (id === 'doors') {
      /* A slow push along its own ray while the doors swing: a push that
         only moved the lens forward would not climb, so it stays a dolly. */
      const Q = SHOTS.doors;
      const k = Math.min(1, t / Math.max(0.5, P.shots[1].from));
      const ease = k * k * (3 - 2 * k);
      this._look.set(D.x + Q.lookX, D.y + Q.lookY, D.z + Q.lookZ);
      cam.position.set(D.x + Q.x, D.y + Q.y, D.z + Q.z).lerp(this._look, Q.push * ease);
    } else if (id === 'along') {
      /* Side-on, trucking with whichever stretcher is going past him, so
         they are carried by IN FRONT of him and read broadside — the one
         angle a stretcher is unmistakably a stretcher. */
      const z = this.alongZ(t);
      cam.position.set(D.x + ALONG.x, D.y + ALONG.y, z + ALONG.zo);
      this._look.set(D.x + ALONG.lookX, D.y + ALONG.lookY, z - 0.5);
    } else {
      /* On him, drifting a little wider as he holds it.
         IT IS ARRIVED AT, NOT CUT TO. The side-on shot ends on its clamp at
         `zAhead` past him, from his left — and that is four units from where
         this lens sits and on the same side, so a cut between them was a jump
         cut: the same picture, twitched (a three-kitten take, frames 8.8 and
         11.2). Both shots look at the same place, so the join is a move from
         `along`'s last frame into this one, fov and all. */
      const Q = SHOTS.him;
      const k = Math.min(1, (t - from) / 3);
      const b = (Q.bearing * Math.PI) / 180;
      const d = Q.dist * (1 + 0.06 * k);
      const u = Math.min(1, Math.max(0, (t - from) / EXIT.himBlend));
      if (u < 1) {
        this.pose('along', from, from, cam);
        this._from.copy(cam.position);
        this._fromLook.copy(this._look);
      }
      cam.position.set(S.x + Math.sin(b) * d, S.y + Q.y, S.z + Math.cos(b) * d);
      this._look.set(S.x, S.y + Q.lookY, S.z);
      if (u < 1) {
        const e = u * u * (3 - 2 * u);
        cam.position.lerpVectors(this._from, cam.position, e);
        this._look.lerpVectors(this._fromLook, this._look, e);
        cam.fov = SHOTS.along.fov + (Q.fov - SHOTS.along.fov) * e;
        cam.updateProjectionMatrix();
      } else if (cam.fov !== Q.fov) {
        cam.fov = Q.fov;
        cam.updateProjectionMatrix();
      }
    }
    cam.lookAt(this._look);
  }
}
