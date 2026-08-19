import * as THREE from 'three';
import { Billboard } from '../core/gfx.js';
import { LEADERS, ELDER, leaderSpot } from '../entities/leader.js';

/* ---------------------------------------------------------------------------
   The opening cutscene.

   An old calico called Patchfur tells two kittens where they live, and then
   flies them past every clan in the sky. It runs once at the start of a
   session, takes about seventy seconds, and any button skips it.

   THE STAGE IS THE REAL WORLD. There is no separate 2D cutscene canvas and no
   pre-rendered video: this drives its own camera through the same scene the
   game is played in, and the leaders it flies to are the same billboards
   standing at those shrines when you walk up to them afterwards. That's what
   buys the depth and parallax — islands slide past each other, the beam of a
   shrine you haven't reached yet stands up over the horizon behind whoever is
   talking — and it means the intro can never show a world that doesn't match
   the one it hands you at the end of it.

   The Pokemon-battle framing sits on top of that: whoever is speaking is a
   big front-facing sprite lit against the live 3D backdrop, with a bordered
   dialogue box, a portrait and text typed a letter at a time.

   Timing is in SECONDS and driven by the frame delta, not by setTimeout, so
   it stays in step with the render and pauses when the tab does.
--------------------------------------------------------------------------- */

/** Skipping is always available; this is only how long it runs if nobody does. */
const TYPE_SPEED = 34;      // characters per second, when there's no recording
const FADE = 0.6;           // seconds of black at each end
/** Silence left after a line finishes before the camera cuts away. */
export const TAIL = 1.5;
/* Breath after a line finishes before the beat turns over. Small, because the
   authored `dur` already carries TAIL for a line that started on time; this is
   only what a LATE line gets, so that a slipped beat still ends on a beat of
   silence rather than cutting straight to the next speaker. */
export const LINE_TAIL = 0.35;
/* Hard cap on waiting for a line that is never going to finish — a rejected
   play(), a file that stalls. The scene must always reach its end on its own. */
export const MAX_SLIP = 4;

/**
 * Is this beat over?
 *
 * Pulled out as a pure function because it is the rule the whole cut-off bug
 * turned on, and it is the one part of the cutscene that can be checked
 * without a DOM, an audio device or a GPU.
 *
 * Two conditions, and it needs BOTH: the authored time has run, and the line
 * has actually finished speaking. `dur` is only `voiceDur + TAIL`, so a timer
 * on its own quietly assumes the audio began the instant the beat did — and
 * every millisecond of start latency past TAIL came off the end of the
 * sentence. The third term is the escape hatch: a line that never finishes,
 * because the browser refused `play()` or the element never buffered, must not
 * strand the scene.
 *
 * The cap keys off whether the line ever STARTED, not off elapsed time alone.
 * A cap on elapsed time is itself a way to cut a line off — it just needs a
 * slower start to do it — and a line you can hear playing must always be
 * allowed to finish. The far looser second bound is for the one case that
 * leaves: a clip that began and then stalled mid-word.
 *
 * @param {number}  t           seconds since this beat began
 * @param {number}  dur         authored beat length
 * @param {?number} lineEndedAt `t` at which the voice finished, null if not yet
 * @param {boolean} started     has the voice actually begun playing?
 */
export function beatOver(t, dur, lineEndedAt, started = false) {
  const spoken = lineEndedAt != null && t >= lineEndedAt + LINE_TAIL;
  if (t >= dur && spoken) return true;
  return t >= dur + (started ? MAX_SLIP * 2 : MAX_SLIP);
}

/* Each speaker gets a blip pitch, so you can tell who is talking with your
   eyes shut. Low and slow for the elder, bright for the Siamese. */
const VOICE = {
  elder: 0.62, thunder: 1.28, river: 1.05, shadow: 0.86,
  wind: 0.70, ice: 1.15, panda: 0.94, kitten: 1.4,
};

const ease = (t) => t * t * (3 - 2 * t);           // smoothstep
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Turn an authored line into one that can use the width it is given.
 *
 * THE SCRIPT'S SINGLE LINE BREAKS ARE TYPOGRAPHY, NOT MEANING. They were placed
 * to make a pleasing shape in the box the writer had — around 42 characters —
 * and carrying them onto a phone produced four rows of half-empty box. A single
 * break becomes a space and the line re-wraps to whatever room it actually has.
 *
 * A DOUBLE break is different: that is a deliberate beat between two thoughts
 * ("...since you could walk." / "Good. Go and find them.") and it survives.
 * `pre-wrap` in the stylesheet is still what renders it.
 */
export function reflow(text) {
  return String(text)
    .split(/\n{2,}/)
    .map((para) => para.replace(/\s*\n\s*/g, ' ').trim())
    .join('\n\n');
}

export class Cutscene {
  /**
   * @param {object} deps { scene, world, players, renderer, audio, leaders,
   *                        elderArt, kittenArt }
   */
  constructor(deps) {
    Object.assign(this, deps);

    this.active = false;
    this.done = false;
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 4000);

    /* The speaker's close-up. One quad, re-pointed at whichever atlas is
       talking — building a billboard per character and toggling visibility
       would work too, but a single quad guarantees only one thing is ever on
       stage, which is the whole grammar of the scene. */
    this.stage = new THREE.Group();
    this.stageSprite = null;
    this.scene.add(this.stage);

    this._buildDom();
    this._buildBeats();
  }

  /* ------------------------------- DOM ---------------------------------- */

  _buildDom() {
    this.el = document.getElementById('cutscene');
    this.boxEl = document.getElementById('cs-box');
    this.nameEl = document.getElementById('cs-name');
    this.textEl = document.getElementById('cs-text');
    /* TWO SPANS, AND THE HIDDEN ONE IS THE WHOLE TRICK.

       The typewriter used to assign `textContent = text.slice(0, n)`, so the
       element grew a character at a time and every word re-wrapped as it went.
       The old defence against that was authoring hard line breaks into the
       script and setting `pre-wrap` — which stops the reflow but fixes the line
       length at whatever the writer's box was, and that is why a phone showed
       four short rows in a box wide enough for two.

       Instead the FULL line is in the DOM from the first frame, with the
       not-yet-typed tail merely `visibility: hidden`. Hidden text still takes up
       space, so the layout is final before a single character appears: nothing
       can reflow, because nothing moves. Two inline spans rather than two
       elements, so a word split across the boundary is still one word to the
       line breaker. */
    this.saidEl = document.createElement('span');
    this.restEl = document.createElement('span');
    this.restEl.className = 'cs-rest';
    this.textEl.textContent = '';
    this.textEl.append(this.saidEl, this.restEl);
    this.portraitEl = document.getElementById('cs-portrait');
    this.fadeEl = document.getElementById('cs-fade');
    this.barEl = document.getElementById('cs-progress');
  }

  /**
   * Draw a speaker's head and shoulders into the little portrait box.
   * The real work is `drawPortrait` at the bottom of this file — see there for
   * why the crop has to be square and measured off the CELL rather than off
   * the image.
   */
  _setPortrait(art, color) {
    drawPortrait(this.portraitEl, art, color);
  }

  /* ------------------------------ script -------------------------------- */

  /**
   * Camera framing for a shrine: stand off it, a little above head height,
   * and dolly slowly in. The offset is taken from the island's centre so the
   * shot always looks back toward the island rather than off into empty sky,
   * whichever side of the map the shrine happens to be on.
   */
  _frameShrine(hall) {
    /* Exactly where the leader is standing, from the same function that put
       her there — so the shot can never drift off its subject. */
    const s = leaderSpot(hall, this.world);
    const eye = s.y + 3.6;                 // her head, roughly
    const side = { x: -s.az, z: s.ax };    // perpendicular, for the arc
    return {
      from: {
        pos: [s.x + s.ax * 26 + side.x * 12, s.y + 15, s.z + s.az * 26 + side.z * 12],
        look: [s.x, eye + 1.2, s.z],
      },
      /* Close enough that she fills about half the frame by the end of the
         line. At the 19 units the wider framing left her at, a 4.2-unit cat
         is under a third of the screen — technically in shot, but you are
         looking at an island with someone standing on it rather than at a
         character talking to you, which is the whole difference between this
         and a flythrough. */
      to: {
        pos: [s.x + s.ax * 10 - side.x * 2.6, s.y + 6.4, s.z + s.az * 10 - side.z * 2.6],
        look: [s.x, eye, s.z],
      },
    };
  }

  _buildBeats() {
    const W = this.world;
    const townY = W.heightAt(0, 40)?.y ?? 4;
    const hallOf = (id) => W.clanHalls.find((h) => h.clan.id === id);

    /** A beat: where the camera goes, who is on stage, what they say. */
    const beats = [
      {
        id: 'sky', speaker: null, dur: 8,
        text: 'Long ago, all of this was one island.',
        cam: {
          from: { pos: [-260, 300, 300], look: [0, 40, 20] },
          to: { pos: [130, 250, 330], look: [0, 30, 20] },
        },
      },
      {
        id: 'break', speaker: null, dur: 7,
        text: 'Then the storm came, and it broke into six.',
        cam: {
          from: { pos: [150, 210, 300], look: [0, 20, 20] },
          to: { pos: [70, 95, 175], look: [0, townY + 6, 40] },
        },
      },
      {
        id: 'elder1', speaker: 'elder', dur: 7,
        text: 'I am Patchfur. I am old enough to remember\nwhen you could walk from end to end.',
        cam: {
          from: { pos: [46, townY + 26, 106], look: [0, townY + 5, 44] },
          to: { pos: [34, townY + 17, 88], look: [0, townY + 5, 44] },
        },
      },
      {
        id: 'elder2', speaker: 'elder', dur: 7,
        text: 'Six pieces. Six clans. Every one of them\nkeeps something worth crossing the sky for.',
        cam: {
          from: { pos: [-38, townY + 20, 92], look: [0, townY + 5, 44] },
          to: { pos: [-26, townY + 14, 76], look: [0, townY + 4, 44] },
        },
      },
    ];

    /* One beat per clan, in the order the shrines were built.
       FIRST PERSON. These were third-person — Patchfur describing each chief —
       while the box underneath showed that chief's own name and portrait, so
       the scene claimed she was speaking and the words said otherwise. She is
       standing right there; she can introduce herself. */
    const clanLines = {
      thunder: 'I am Sunstreak, of Thunderpaw.\nWe run so fast the rain never\nlands on us.',
      river: 'Rippleclaw, of Riverclaw.\nI have never walked around a\npuddle in my life.',
      shadow: 'You did not hear me arrive.\nShadowtail land after our\nthird jump.',
      wind: 'Galemane, of Windwhisker.\nWe taught the storm dragons\nhow to breathe.',
      ice: 'I am Snowmantle. Icewhisker can\nfeel every unbroken barrel\nin the sky.',
      panda: 'Bambooheart, of Pandapaw.\nWe will give you nothing at all.\nNot until you feed it.',
    };
    for (const [id, text] of Object.entries(clanLines)) {
      const hall = hallOf(id);
      if (!hall) continue;
      beats.push({ id, speaker: id, dur: 7, text, cam: this._frameShrine(hall) });
    }

    beats.push({
      id: 'close', speaker: 'elder', dur: 8,
      text: 'You two are Ember and Frost, and you have\nbeen trouble since you could walk.\n\nGood. Go and find them.',
      cam: {
        from: { pos: [30, townY + 18, 96], look: [0, townY + 4, 46] },
        to: { pos: [-14, townY + 40, 128], look: [0, townY + 4, 40] },
      },
    });

    // Every beat's id doubles as its voice filename.
    for (const b of beats) b.voice = `/voice/${b.id}.mp3`;

    this.beats = beats;
    this.total = beats.reduce((s, b) => s + b.dur, 0);
  }

  /**
   * Preload the recorded lines and FIT EACH BEAT TO ITS OWN.
   *
   * The authored durations were guesses made before there were voices, and a
   * beat that ends mid-sentence is far worse than one that sits a moment too
   * long — so a beat lasts however long its line takes plus a tail, or its
   * authored length, whichever is more. That also means re-recording a line
   * can never desynchronise the scene: nothing here is a hardcoded timing.
   *
   * Resolves either way. Missing files fall back to blips and the authored
   * timings, which is what a fresh clone with no `public/voice` gets.
   */
  async loadVoices() {
    await Promise.all(this.beats.map((b) => new Promise((resolve) => {
      const el = new window.Audio();
      el.preload = 'auto';
      const done = (ok) => {
        if (ok && Number.isFinite(el.duration) && el.duration > 0) {
          b.voiceDur = el.duration;
          b.dur = Math.max(b.dur, el.duration + TAIL);
          /* KEEP THE ELEMENT. It used to be read for its duration and dropped,
             and `speak` then built a fresh Audio(url) on every beat — so the
             fetch and the decode happened inside that beat's own time budget,
             while its clock was already running. Six of the eleven beats have
             exactly TAIL (1.5s) of slack, so any start delay past that cut the
             line off mid-sentence. Worse, it was invisible in Chrome and
             intermittent in Firefox, because `loadedmetadata` fires as soon as
             the header lands: the file could look loaded while the body had
             never been fetched, and a brand-new element would go and get it
             again. Holding the element that has actually buffered the clip is
             what makes playback start immediately. */
          b.el = el;
          /* Type the line so it lands with the speech instead of racing it:
             text finished and sitting still while a voice keeps talking looks
             like the audio belongs to something else. */
          b.typeRate = b.text.length / Math.max(0.6, el.duration * 0.72);
        } else {
          b.voice = null;
          b.el = null;
        }
        resolve();
      };
      /* Resolve on canplaythrough, not loadedmetadata — that is the event that
         means the whole clip is buffered and will not stall on play. Metadata
         is the fallback: some browsers decline to prefetch the body and never
         fire canplaythrough at all, and a usable duration still beats none. */
      el.addEventListener('canplaythrough', () => done(true), { once: true });
      el.addEventListener('loadedmetadata', () => {
        // Give the body a moment to arrive before settling for metadata alone.
        setTimeout(() => done(true), 1500);
      }, { once: true });
      el.addEventListener('error', () => done(false), { once: true });
      // A file that never answers must not hold the loading screen forever.
      setTimeout(() => done(Number.isFinite(el.duration)), 4000);
      el.src = b.voice;
    })));
    this.total = this.beats.reduce((s, b) => s + b.dur, 0);
    this.voiced = this.beats.filter((b) => b.voice).length;
    console.log(`[voice] ${this.voiced}/${this.beats.length} lines recorded, `
      + `intro runs ${Math.round(this.total)}s`);
    return this.total;
  }

  /* ------------------------------ playback ------------------------------ */

  play() {
    if (this.active) return;
    this.active = true;
    this.done = false;
    this.beat = -1;
    this.fadeIn = FADE;
    this.voiceEl = null;
    this.lineEndedAt = null;
    this.el.classList.remove('hidden');
    this.audio?.startMusic('intro');
    this._nextBeat();
  }

  _nextBeat() {
    this.beat++;
    if (this.beat >= this.beats.length) { this.finish(); return; }
    const b = this.beats[this.beat];
    this.t = 0;
    this.typed = 0;
    this.flow = reflow(b.text);
    this.saidEl.textContent = '';
    this.restEl.textContent = this.flow;

    const art = b.speaker === 'elder' ? this.elderArt
      : b.speaker ? this.leaders.find((l) => l.clan.id === b.speaker)?.art : null;
    const who = b.speaker === 'elder' ? ELDER : (LEADERS[b.speaker] ?? null);
    const color = b.speaker && b.speaker !== 'elder'
      ? `#${(this.leaders.find((l) => l.clan.id === b.speaker)?.clan.color ?? 0xffffff)
        .toString(16).padStart(6, '0')}`
      : '#e8c98a';

    this.nameEl.textContent = who ? `${who.name}  ·  ${who.breed}` : '';
    this.nameEl.style.color = color;
    this.boxEl.style.setProperty('--cs-accent', color);
    this._setPortrait(art, color);
    this.portraitEl.style.display = art ? '' : 'none';
    this.pitch = VOICE[b.speaker] ?? VOICE.elder;

    /* The elder has no shrine to stand at, so she is placed ON STAGE: a big
       billboard parked a fixed distance in front of the camera, which is the
       Pokemon trick — the character is foreground furniture and the world is
       the backdrop behind her. Leaders don't need it, because they are really
       standing at the place the camera has just flown to. */
    this._setStage(b.speaker === 'elder' ? this.elderArt : null);

    /* Say it, from the element preloaded at boot. Blips are the fallback for a
       line with no recording. `voiceEl` is what the beat's end is judged
       against — see update. */
    this.voiceEl = this.audio?.speak(b.el ?? b.voice) ?? null;
    this.lineEndedAt = null;
  }

  /**
   * Has the recorded line actually finished?
   *
   * `ended` is the honest signal but it can be missed between frames, so the
   * playhead is checked too. A voice that never starts at all — a rejected
   * `play()`, a wedged element — reports false forever, which is why the
   * caller also has a hard cap.
   */
  _lineFinished(b) {
    const el = this.voiceEl;
    if (!el || !b.voiceDur) return true;
    if (el.ended) return true;
    return el.currentTime > 0 && el.currentTime >= b.voiceDur - 0.06;
  }

  _setStage(art) {
    if (!art) { this.stage.visible = false; return; }
    if (!this.stageSprite || this.stageArt !== art) {
      if (this.stageSprite) this.stage.remove(this.stageSprite);
      const quad = 9 / (art.contentScale || 1);
      this.stageSprite = new Billboard(art.texture, {
        cols: 1, rows: 1, width: quad, height: quad,
        footOffset: (art.pad ?? 0) * quad, mirror: false,
      });
      this.stage.add(this.stageSprite);
      this.stageArt = art;
    }
    this.stage.visible = true;
  }

  /** Any button, any key, a click. */
  skip() {
    if (!this.active) return;
    this.finish();
  }

  finish() {
    this.active = false;
    this.done = true;
    this.stage.visible = false;
    this.el.classList.add('hidden');
    // Cut the speaker off mid-word if she is still going — skipping has to
    // mean skipping, not "hide the box and keep listening to her".
    this.audio?.stopSpeaking();
    this.audio?.startMusic('play');
    /* Drop the reference, not the element — the clips are reused when WATCH
       THE STORY AGAIN replays the intro, and rebuffering them would put the
       start-delay bug straight back. stopSpeaking pauses and rewinds, which is
       all a reused element needs. */
    this.voiceEl = null;
    this.lineEndedAt = null;
  }

  faceCamera(camera) {
    this.stageSprite?.faceCamera(camera);
  }

  /**
   * Advance one frame. Returns true while the cutscene owns the screen.
   */
  update(dt) {
    if (!this.active) return false;
    const b = this.beats[this.beat];
    if (!b) { this.finish(); return false; }

    this.t += dt;
    this.fadeIn = Math.max(0, this.fadeIn - dt);

    // --- camera: eased dolly across the beat, plus a slow drift so a long
    // line never sits on a dead-still frame.
    const k = ease(Math.min(1, this.t / b.dur));
    const drift = Math.sin(this.t * 0.5) * 0.8;
    const p = b.cam.from.pos;
    const q = b.cam.to.pos;
    const l = b.cam.from.look;
    const m = b.cam.to.look;
    this.camera.position.set(
      lerp(p[0], q[0], k) + drift,
      lerp(p[1], q[1], k) + Math.sin(this.t * 0.37) * 0.5,
      lerp(p[2], q[2], k) - drift * 0.6
    );
    this._look = this._look ?? new THREE.Vector3();
    this._look.set(lerp(l[0], m[0], k), lerp(l[1], m[1], k), lerp(l[2], m[2], k));
    this.camera.lookAt(this._look);

    // --- stage character, parked in front of the camera and sliding in
    if (this.stage.visible && this.stageSprite) {
      const inT = Math.min(1, this.t / 0.55);
      const fwd = new THREE.Vector3();
      this.camera.getWorldDirection(fwd);
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
      const d = 17;
      this.stage.position.copy(this.camera.position)
        .addScaledVector(fwd, d)
        .addScaledVector(right, lerp(9, 3.4, ease(inT)))
        .add(new THREE.Vector3(0, -5.2 + Math.sin(this.t * 1.7) * 0.14, 0));
      this.stageSprite.mat.opacity = ease(inT);
      this.stageSprite.mat.transparent = true;
    }

    /* --- typewriter, paced to the recording when there is one.
       Against the AUDIO's own playhead, not the beat clock, so a line that
       starts a little late types a little late with it. Keyed to the beat
       clock, a late start meant the text finished and sat there while she was
       still talking — the exact desynchronisation typeRate exists to stop. */
    const clock = (this.voiceEl && b.voiceDur && this.voiceEl.currentTime > 0)
      ? this.voiceEl.currentTime
      : this.t;
    const want = Math.floor(clock * (b.typeRate ?? TYPE_SPEED));
    if (want > this.typed && this.typed < this.flow.length) {
      const next = Math.min(this.flow.length, want);
      /* Blips ONLY when nobody recorded this line. A blip track under an
         actual voice is the worst of both. One per character is a machine gun
         either way, so it's every third letter. */
      if (!b.voice && Math.floor(this.typed / 3) !== Math.floor(next / 3)) {
        this.audio?.voice(this.pitch * (0.94 + Math.random() * 0.12));
      }
      this.typed = next;
      this.saidEl.textContent = this.flow.slice(0, this.typed);
      this.restEl.textContent = this.flow.slice(this.typed);
    }

    // --- progress, so a kid can see how much is left
    const before = this.beats.slice(0, this.beat).reduce((s, x) => s + x.dur, 0);
    this.barEl.style.width = `${((before + this.t) / this.total) * 100}%`;

    // --- fades
    const fadeOut = Math.max(0, FADE - (b.dur - this.t)) / FADE;
    this.fadeEl.style.opacity = Math.max(
      this.fadeIn / FADE,
      this.beat === this.beats.length - 1 ? fadeOut : 0
    );

    // --- when is the beat over? See beatOver.
    if (this.lineEndedAt == null && this._lineFinished(b)) this.lineEndedAt = this.t;
    const started = !!this.voiceEl && this.voiceEl.currentTime > 0;
    if (beatOver(this.t, b.dur, this.lineEndedAt, started)) this._nextBeat();
    return this.active;
  }
}

/**
 * Draw a speaker's head and shoulders into a portrait canvas.
 *
 * The atlas texture's image is already a canvas, so this is a crop rather than
 * a second set of art.
 *
 * **The crop has to be SQUARE, and it has to be measured off the CELL.** The
 * first version took the full width of the atlas by the top 42% of its height
 * and drew that into a square canvas — a 2.4:1 source squeezed into 1:1, which
 * flattened every cat's face by well over half. That reads as bad art rather
 * than a bad crop, which is why it survived a look: nobody inspects a 96px
 * portrait for aspect ratio, they just think the drawing is odd.
 *
 * Taking it off the whole image is wrong for a second reason. `contentScale`
 * and `pad` say where the figure actually sits inside its cell: bottom-aligned
 * above `pad`, horizontally centred, occupying `contentScale` of the height.
 * Cropping from the image's own top edge starts in the transparent margin above
 * her ears and slides down her chest by however loosely that particular sheet
 * happened to pack — so the seven leaders would each be framed differently.
 * From the cell, they all frame identically.
 *
 * Exported because the finale needed a third caller and this reasoning must not
 * be copy-pasted a third time. (`shrinescene.js` still carries its own copy; it
 * predates this and works, and rewiring a verified scene for tidiness alone is
 * not worth the risk — but a FOURTH caller should collapse both onto this.)
 */
export function drawPortrait(cv, art, color) {
  const img = art?.texture?.image;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  if (!img) return;

  const cell = img.width / (art.cols || 1);
  const figure = cell * (art.contentScale ?? 0.7);       // her drawn height
  const feet = cell * (1 - (art.pad ?? 0.06));           // her ground line
  const head = feet - figure;                            // top of her ears

  /* Head and upper body: a square 55% of her height. Much tighter crops the
     ears on the maned breeds; much looser and Galemane is a full-length cat in
     a thumbnail. */
  const side = Math.min(figure * 0.55, cell);
  const sx = Math.max(0, Math.min(cell - side, cell / 2 - side / 2));
  const sy = Math.max(0, Math.min(img.height - side, head - side * 0.08));

  g.drawImage(img, sx, sy, side, side, 0, 0, cv.width, cv.height);
  cv.style.borderColor = color;
}
