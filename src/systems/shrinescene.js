import * as THREE from 'three';
import { leaderSpot, FACE_BIAS_MAX } from '../entities/leader.js';
import { SHRINE_GATE } from '../world/build.js';
import { beatOver, LINE_TAIL, TAIL } from './cutscene.js';

/* ---------------------------------------------------------------------------
   The shrine scene: a clan leader introducing herself, once.

   Before this, a leader was a drawing with a speech bubble you could walk past
   without reading, and joining her clan was pressing a button at some
   stonework. The bubble names the buff — but a bubble is scenery, and a
   nine-year-old walking a kitten across an island does not stop to read
   scenery. So the leader stops her: stand near her for two seconds and she
   takes the screen, in the same furniture the opening cutscene uses, and tells
   you who she is in her own recorded voice.

   THREE RULES, and each of them is the difference between a scene and a
   nuisance:

   1. ONCE. Ever. `leader.met` latches the moment the scene STARTS, not when it
      ends, so skipping still spends it. A cutscene that replays every time a
      kitten crosses a dais would be the single most irritating thing in the
      game — and the dais is exactly where both girls stand around, because
      that is where the join ring is.

   2. IT GATES JOINING. You cannot swear to a clan you have not been introduced
      to. That is the whole reason the scene can afford to be full-screen: it is
      not an interruption on the way to the buff, it IS the way to the buff.

   3. THE DWELL IS TWO SECONDS OF STANDING STILL-ISH, not of touching the
      radius. Kittens sprint over shrines constantly on the way somewhere else,
      and firing a cutscene at someone running past is how you teach a kid to
      avoid the shrine island.
--------------------------------------------------------------------------- */

/** How close you have to be, and for how long, before she speaks up. */
export const SCENE_RADIUS = 10;
export const DWELL = 2.0;

/** Seconds of black at each end, matching the opening cutscene's furniture. */
const FADE = 0.5;

/* --- THE TWO-SHOT ----------------------------------------------------------
   THE SCENE USED TO HAVE ONE PERSON IN IT. The camera sat ON the axis between
   the leader and the kitten, behind the kitten looking past her — so the
   kitten was directly under the lens, a blob at the bottom of frame with the
   dialogue box drawn over her, and a leader talking earnestly at a camera with
   nobody in front of it. It reads as a portrait, not a conversation.

   Two changes, and they only work together:

   THE KITTEN IS STOOD ON A MARK. She stopped wherever she stopped — behind the
   leader, off the edge of the stone, at the far rim of a ten-unit radius with
   her back turned — and no camera rule can make a composition out of an
   arbitrary arrangement of two bodies. `_stand` puts her `TALK_GAP` in front
   of the leader on the leader's own axis, facing her, and everything below is
   then a FIXED shot of a known pair.

   THE CAMERA SWINGS OFF THE AXIS. `SHOT_SWING` round it puts the two of them
   across the frame instead of one behind the other: the leader turned toward
   the kitten (see `ClanLeader.faceCamera` — a bias on top of the billboard
   turn, capped at the limit of the art so she never yaws far enough to read as
   a sheet of paper), the kitten in profile looking back at her.

   THE HEIGHTS ARE THE OTHER HALF OF IT, and they are not in this file: both of
   them are standing on the dais now, because every step of it is a walkable
   disc platform (`World._buildShrines`). Before that the leader was lifted
   onto the stone by hand and the player was not, so a two-shot would have been
   a grown-up on a plinth talking down to a kitten buried to the ears. */

/** How far in front of the leader the kitten is stood, in world units. */
const TALK_GAP = 4.6;
/** How far round the axis between them the camera swings, in radians (~66°).
 *  0 is the old shot — straight down the axis, one body hiding the other. */
const SHOT_SWING = 1.15;
/** The swings `_pickSwing` may choose from, IN PREFERENCE ORDER. The first is
 *  the shot; the rest are it mirrored, tightened toward an over-the-shoulder,
 *  and opened out toward a flat two-shot. Six shrines, six accidental
 *  arrangements of stone and bamboo, one composition that has to survive all
 *  of them. */
const SHOT_SWINGS = [SHOT_SWING, -SHOT_SWING, 0.86, -0.86];
/** Radians of clear line a candidate has to BUY before it is worth leaving the
 *  one already chosen. A tie-break, not a tax: measured at a shrine, the whole
 *  spread between the best and worst candidate is about five degrees, so this
 *  is deliberately under one — enough that two candidates which are the same
 *  shot to the pixel resolve to the earlier one, and not enough to hold the
 *  camera on a post. It was 0.16 for one commit and pinned every shrine to the
 *  default, which is the same as not having this function. */
const SWING_COST = 0.012;
/** Camera distance from the middle of the pair. Dollies in over the scene, the
 *  same slow push the opening cutscene uses and for the same reason. */
const SHOT_FAR = 10.9;
const SHOT_NEAR = 9.2;
/** Camera height above the dais, and the height on it the lens holds. Looking
 *  BELOW both their middles is deliberate: it lifts the pair into the top of
 *  the frame, which is the part the dialogue box does not cover. */
const SHOT_EYE = 2.9;
const SHOT_LOOK = 0.6;
/** Where along the pair the shot centres, from the kitten (0) to the leader
 *  (1). A dead-centre two-shot makes THE PAIR the subject; she is. */
const SHOT_BIAS = 0.62;
/** Fallback typing speed when a line has no recording. */
const TYPE_SPEED = 34;

export { FACE_BIAS_MAX };

export class ShrineScene {
  constructor({ world, audio }) {
    this.world = world;
    this.audio = audio;
    this.active = false;
    this.leader = null;
    this.player = null;
    this.voiceEl = null;
    this.lineEndedAt = null;

    this.camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 4000);
    this._look = new THREE.Vector3();

    this.el = document.getElementById('cutscene');
    this.boxEl = document.getElementById('cs-box');
    this.nameEl = document.getElementById('cs-name');
    this.textEl = document.getElementById('cs-text');
    this.portraitEl = document.getElementById('cs-portrait');
    this.fadeEl = document.getElementById('cs-fade');
    this.barEl = document.getElementById('cs-progress');

    /** Per-leader dwell timers, keyed by clan id. */
    this.dwell = new Map();
  }

  /**
   * Preload every leader's line, exactly the way the opening cutscene does.
   *
   * Same reasoning, same trap: an element built at the moment she is supposed
   * to speak has to fetch and decode inside the beat's own budget, and the
   * beat is sized as `line + TAIL`. See Cutscene.loadVoices — this is the
   * short version of the same fix, and it must not drift from it.
   */
  async load(leaders) {
    await Promise.all(leaders.map((L) => new Promise((resolve) => {
      const url = L.spec?.voice;
      if (!url) { L.voiceDur = 0; resolve(); return; }
      const el = new window.Audio();
      el.preload = 'auto';
      const done = (ok) => {
        if (ok && Number.isFinite(el.duration) && el.duration > 0) {
          L.voiceEl = el;
          L.voiceDur = el.duration;
          L.sceneDur = el.duration + TAIL;
          L.typeRate = L.textLine.length / Math.max(0.6, el.duration * 0.72);
        } else {
          L.voiceEl = null;
          L.voiceDur = 0;
          L.sceneDur = 6.5;
        }
        resolve();
      };
      el.addEventListener('canplaythrough', () => done(true), { once: true });
      el.addEventListener('loadedmetadata', () => setTimeout(() => done(true), 1500), { once: true });
      el.addEventListener('error', () => done(false), { once: true });
      setTimeout(() => done(Number.isFinite(el.duration)), 4000);
      el.src = url;
    })));
    const n = leaders.filter((L) => L.voiceEl).length;
    console.log(`[voice] ${n}/${leaders.length} shrine lines recorded`);
  }

  /* --------------------------- the dwell trigger ------------------------- */

  /**
   * Watch every leader for a kitten loitering, and start a scene if one does.
   *
   * Returns the scene's owner if one started this frame, else null.
   *
   * The timer RESETS the moment she leaves, rather than decaying, because a
   * kitten pacing in and out of the radius should not accumulate her way into
   * a cutscene she is plainly not stopping for.
   */
  watch(dt, leaders, players) {
    if (this.active) return null;
    for (const L of leaders) {
      if (L.met) continue;
      let who = null;
      for (const p of players) {
        // Not while flying: a kitten passing overhead on a dragon has not
        // arrived anywhere, and taking the screen off her mid-flight is theft.
        if (p.mount) continue;
        const d = Math.hypot(p.position.x - L.position.x, p.position.z - L.position.z);
        if (d < SCENE_RADIUS) { who = p; break; }
      }
      const key = L.clan.id;
      if (!who) { this.dwell.set(key, 0); continue; }
      const t = (this.dwell.get(key) ?? 0) + dt;
      this.dwell.set(key, t);
      if (t >= DWELL) { this.start(L, who); return who; }
    }
    return null;
  }

  /* ------------------------------ playback ------------------------------- */

  start(leader, player) {
    if (this.active) return;
    this.active = true;
    /* LATCHES HERE, not in finish(). Skipping spends the introduction — the
       player has been shown who this is and the clan unlocks either way. A
       scene that only counts when watched to the end is a scene that replays
       at a kid who already decided she didn't want it. */
    leader.met = true;

    this.leader = leader;
    this.player = player;
    this.t = 0;
    this.typed = 0;
    this.fadeIn = FADE;
    this.lineEndedAt = null;

    const spec = leader.spec;
    const color = `#${leader.clan.color.toString(16).padStart(6, '0')}`;
    this.nameEl.textContent = `${spec.name}  ·  ${spec.breed}`;
    this.nameEl.style.color = color;
    this.boxEl.style.setProperty('--cs-accent', color);
    this.textEl.textContent = '';
    this._setPortrait(leader.art, color);
    this.el.classList.remove('hidden');

    /* Stand the kitten on her mark and turn the leader toward THAT, not
       toward wherever the player happened to be when the dwell ran out — the
       shot below is composed around the mark, and a leader leaning at a point
       the camera is not framing is a character talking to nobody. */
    this.mark = this._stand(leader, player);
    /* WHICH SIDE THE CAMERA SWINGS TO IS DECIDED ONCE, HERE, and held for the
       whole scene: a shot that re-picks it per frame is a shot that can cut to
       the other side of two people mid-sentence. */
    const hall = this.world?.clanHalls?.find((h) => h.clan === leader.clan);
    this.swing = hall
      ? this._pickSwing(leaderSpot(hall, this.world), this.mark, hall)
      : SHOT_SWING;
    leader.lookAt(this.mark);

    this.dur = leader.sceneDur ?? 6.5;
    this.voiceEl = this.audio?.speak(leader.voiceEl ?? spec.voice) ?? null;
    this.audio?.sfx?.('clan');
  }

  skip() {
    if (this.active) this.finish();
  }

  finish() {
    this.active = false;
    this.el.classList.add('hidden');
    this.audio?.stopSpeaking();
    this.leader?.lookAt(null);
    this.leader = null;
    this.player = null;
    this.mark = null;
    this.swing = SHOT_SWING;
    this.voiceEl = null;
    this.lineEndedAt = null;
  }

  /** Same crop as the opening cutscene's portrait — square, off the cell. */
  _setPortrait(art, color) {
    const cv = this.portraitEl;
    const img = art?.texture?.image;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    this.portraitEl.style.display = img ? '' : 'none';
    if (!img) return;
    const cell = img.width / (art.cols || 1);
    const figure = cell * (art.contentScale ?? 0.7);
    const head = cell * (1 - (art.pad ?? 0.06)) - figure;
    const side = Math.min(figure * 0.55, cell);
    const sx = Math.max(0, Math.min(cell - side, cell / 2 - side / 2));
    const sy = Math.max(0, Math.min(img.height - side, head - side * 0.08));
    g.drawImage(img, sx, sy, side, side, 0, 0, cv.width, cv.height);
    cv.style.borderColor = color;
  }

  /**
   * Which way to swing the camera off the axis: whichever way has the shot.
   *
   * A SHRINE IS A GATE, and its two pillars are seven units of stone standing
   * at a fixed offset along WORLD x. They do not turn with the leader's axis,
   * so which of the six shrines happens to put a post through somebody's face
   * is pure accident of where that island's centre is — Shadowtail drew one
   * straight down the kitten and Thunderpaw did not, from the same code. And
   * Pandapaw's shrine is in a bamboo FOREST, where the same accident is eight
   * metres of cane. There is no framing rule that fixes any of that, because
   * there is nothing about the pair of them to fix; the answer is to stand
   * somewhere else.
   *
   * SCORED, NOT REASONED, which is the house rule for anything drawn: build
   * every candidate camera, project the obstacles and both characters from
   * each, and take the closest approach ON SCREEN. Something BEHIND a
   * character is not counted — that is a gate they are standing in front of,
   * which is the picture the shrine was built for. Candidates are tried in
   * preference order and have to beat the standing best by `SWING_COST`, so a
   * shrine with a clear line keeps the shot exactly as it was framed.
   *
   * @returns {number} the swing to use, in radians. Signed: which side.
   */
  _pickSwing(spot, mark, hall) {
    // The pair's mid-point, weighted the way the shot itself weights it.
    const midX = mark.x + (spot.x - mark.x) * SHOT_BIAS;
    const midZ = mark.z + (spot.z - mark.z) * SHOT_BIAS;
    let ux = mark.x - spot.x;
    let uz = mark.z - spot.z;
    const len = Math.hypot(ux, uz) || 1;
    ux /= len;
    uz /= len;

    /* WHAT COUNTS AS BEING IN THE WAY: the gate's own two posts, and any
       standing prop near the shrine tall enough to cover a face. A crate is
       not in the way — it is a foot high and the lens looks straight over it —
       and a prop already knocked over is lying on the stone. Bamboo is the
       case this list exists for. */
    const posts = [-1, 1].map((sx) => ({
      x: hall.x + sx * SHRINE_GATE.x, z: hall.z, r: SHRINE_GATE.r,
    }));
    for (const pr of this.world?.props ?? []) {
      if (pr.knocked || pr.gone || (pr.height ?? 0) < 2.6) continue;
      if (Math.hypot(pr.home.x - hall.x, pr.home.z - hall.z) > 16) continue;
      posts.push({ x: pr.home.x, z: pr.home.z, r: pr.radius ?? 0.6 });
    }
    // Judged from the middle of the dolly, so neither end of the push-in gets
    // to decide the whole shot on its own.
    const at = (SHOT_FAR + SHOT_NEAR) / 2;

    let best = SHOT_SWINGS[0];
    let bestGap = -Infinity;
    for (const swing of SHOT_SWINGS) {
      const cs = Math.cos(swing);
      const sn = Math.sin(swing);
      const camX = midX + (ux * cs - uz * sn) * at;
      const camZ = midZ + (uz * cs + ux * sn) * at;
      let gap = Math.PI;
      for (const who of [spot, mark]) {
        const wa = Math.atan2(who.x - camX, who.z - camZ);
        const wd = Math.hypot(who.x - camX, who.z - camZ);
        for (const q of posts) {
          const qd = Math.hypot(q.x - camX, q.z - camZ);
          if (qd >= wd) continue;                 // behind them: it is scenery
          const qa = Math.atan2(q.x - camX, q.z - camZ);
          const raw = Math.abs(Math.atan2(Math.sin(qa - wa), Math.cos(qa - wa)));
          /* Minus the post's OWN half-width as an angle, because a post two
             units from the lens hides a great deal more of the frame than the
             same post ten units away, and the thing being avoided is how much
             of her it covers on screen. */
          gap = Math.min(gap, raw - Math.atan2(q.r, qd));
        }
      }
      if (gap > bestGap + SWING_COST) { bestGap = gap; best = swing; }
    }
    return best;
  }

  /**
   * Stand the kitten on her mark, facing the leader. Returns where she is.
   *
   * MOVING THE PLAYER IS THE POINT, and it is hidden by the half second of
   * black the scene opens on, so nobody ever sees it happen. The alternative
   * is a camera rule clever enough to frame two bodies in any of the
   * arrangements a ten-unit trigger radius allows, which is not a camera rule,
   * it is a series of accidents.
   *
   * SHE IS LEFT THERE WHEN IT ENDS. Putting her back would be a second
   * teleport, this one out of a fade she can see — and the mark is the middle
   * of the dais she was walking onto anyway, with the join ring right under
   * her feet.
   *
   * NOT WHILE SHE IS RIDING SOMETHING. Nothing is ticked during the scene, so
   * moving a rider leaves the animal where it was and sits her on thin air.
   * `watch` already refuses to fire for a mounted kitten; the debug key does
   * not, so this degrades to framing her where she really is rather than
   * breaking — a rule that degrades beats one that vanishes.
   */
  _stand(leader, player) {
    const hall = this.world?.clanHalls?.find((h) => h.clan === leader.clan);
    const spot = hall ? leaderSpot(hall, this.world) : null;
    const at = new THREE.Vector3().copy(player.position);
    if (!spot || player.mount || player.rideAlong || player.pandaMount) return at;

    /* On the leader's OWN axis, `TALK_GAP` back toward the island — so the two
       of them face each other along the line the shrine was laid out on, with
       the gate and the beam behind her. `spot.y` is the dais, which is now
       simply the ground there. */
    at.set(spot.x - spot.ax * TALK_GAP, spot.y, spot.z - spot.az * TALK_GAP);
    player.position.copy(at);
    /* AND THE GROUP WITH IT, WHICH IS NOT BELT AND BRACES. `position` is where
       she IS; `group.position` is where she is DRAWN, and the one follows the
       other inside `Player.update` — which is exactly what a scene does not
       run. Setting only `position` moved her logically and left the drawing
       standing wherever she was when the dwell expired, so the camera framed
       an empty patch of dais. `camTarget` goes too, or the play camera whips
       across the island when the scene hands control back. */
    player.group.position.copy(at);
    player.camTarget?.copy(at);
    player.velocity?.set(0, 0, 0);
    player.onGround = true;
    /* `facing` is a bearing measured atan2(x, z) — the same convention
       Billboard.faceCamera measures the camera with, which is what picks the
       drawn direction cell. Anything else and she is stood on her mark facing
       the wrong way, which is worse than where she was. */
    player.facing = Math.atan2(spot.x - at.x, spot.z - at.z);
    /* And standing, not frozen mid-stride. The pose row is chosen in
       `Player.update`, which does not run during a scene, so whatever she was
       doing when the dwell expired is what she holds for the next six seconds
       — usually the walk cycle, because she was walking up to the shrine. */
    if (player.sprite && player.anim) {
      player.sprite.row = player.anim.idle;
      player.sprite.facing = player.facing;
    }
    return at;
  }

  faceCamera() { /* nothing on stage — she is really standing there */ }

  /**
   * Advance one frame. Returns true while the scene owns the screen.
   *
   * THE SHOT IS A TWO-SHOT, TAKEN OFF THE AXIS BETWEEN THEM. It still agrees
   * about which way you arrived from — the axis is the leader's own and the
   * kitten is stood on the near end of it — but the camera is swung out to the
   * side so both of them are in it. Framing it from the leader's own axis
   * (which is what the opening cutscene does) would be less code and is wrong
   * here: the intro is showing you a place, this is showing you a conversation
   * you just walked into, and a conversation needs two people on screen.
   */
  update(dt) {
    if (!this.active) return false;
    this.t += dt;
    this.fadeIn = Math.max(0, this.fadeIn - dt);

    const L = this.leader;
    const spot = leaderSpot(this.world.clanHalls.find((h) => h.clan === L.clan), this.world);
    /* Her mark if she has one, her real position if she was riding something —
       the framing below works either way, it is only a better picture when the
       pair is arranged. */
    const mark = this.mark ?? this.player.position;

    // The axis between the two of them, flattened: leader toward kitten.
    const ax = mark.x - spot.x;
    const az = mark.z - spot.z;
    const len = Math.hypot(ax, az) || 1;
    const ux = ax / len;
    const uz = az / len;

    // Swung off that axis, which is what puts both bodies in frame. See the
    // header block on SHOT_SWING.
    const swing = this.swing ?? SHOT_SWING;
    const cs = Math.cos(swing);
    const sn = Math.sin(swing);
    const vx = ux * cs - uz * sn;
    const vz = uz * cs + ux * sn;

    /* Dolly in over the scene. The opening cutscene learned the far end of
       this the hard way at 19: a 4.2-unit character further out than about 15
       stops being someone talking to you and becomes someone standing on an
       island — and this shot has to hold a 2.9-unit kitten as well, so it
       starts closer than that and ends closer still. */
    const k = Math.min(1, this.t / Math.max(0.001, this.dur));
    const ease = 1 - (1 - k) * (1 - k);
    const dist = SHOT_FAR + (SHOT_NEAR - SHOT_FAR) * ease;

    // Centred between them, leaning toward the leader: she is who this is about.
    const cx = mark.x + (spot.x - mark.x) * SHOT_BIAS;
    const cz = mark.z + (spot.z - mark.z) * SHOT_BIAS;

    this.camera.position.set(
      cx + vx * dist,
      spot.y + SHOT_EYE - ease * 0.35,
      cz + vz * dist
    );
    this._look.set(cx, spot.y + SHOT_LOOK, cz);
    this.camera.lookAt(this._look);

    // --- typewriter, on the audio's own playhead. See Cutscene.update.
    const clock = (this.voiceEl && L.voiceDur && this.voiceEl.currentTime > 0)
      ? this.voiceEl.currentTime
      : this.t;
    const text = L.textLine;
    const want = Math.floor(clock * (L.typeRate ?? TYPE_SPEED));
    if (want > this.typed && this.typed < text.length) {
      this.typed = Math.min(text.length, want);
      this.textEl.textContent = text.slice(0, this.typed);
    }

    this.barEl.style.width = `${Math.min(1, this.t / this.dur) * 100}%`;
    const fadeOut = Math.max(0, FADE - (this.dur - this.t)) / FADE;
    this.fadeEl.style.opacity = Math.max(this.fadeIn / FADE, Math.min(1, fadeOut));

    // --- over when the authored time has run AND she has finished speaking.
    if (this.lineEndedAt == null && this._lineFinished()) this.lineEndedAt = this.t;
    const started = !!this.voiceEl && this.voiceEl.currentTime > 0;
    if (beatOver(this.t, this.dur, this.lineEndedAt, started)) this.finish();
    return this.active;
  }

  _lineFinished() {
    const el = this.voiceEl;
    const d = this.leader?.voiceDur;
    if (!el || !d) return true;
    if (el.ended) return true;
    return el.currentTime > 0 && el.currentTime >= d - 0.06;
  }
}

export { LINE_TAIL };
