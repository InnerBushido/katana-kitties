import * as THREE from 'three';
import { beatOver, TAIL, drawPortrait } from './cutscene.js';

/* ---------------------------------------------------------------------------
   The two story beats of the dragon hunt.

   FOUND   fires the moment the seventh star is picked up, wherever the girls
           are standing. Patchfur tells them what they have and where to take
           it, which is the only thing standing between "I collected seven
           shiny balls" and knowing there is a dragon at the end of it.

   SUMMON  fires when somebody walks up to Ryuuseki for the first time. The sky
           goes dark across it and stays dark while he is in the world.

   BOTH ARE SKIPPABLE AND BOTH FIRE ONCE. Same rule as the shrine scenes and
   for the same reason — the second time is an obstacle between a kid and a
   dragon she has already been introduced to.

   THE SKY IS THE SCENE'S JOB, NOT THE DRAGON'S. `dusk` is driven from here and
   handed to the world every frame, so the darkening is tied to the moment
   rather than to a flag somebody might forget to clear. Ryuuseki leaving the
   world puts it back.

   AND THE FINALE HAS ITS OWN CHANNEL, `dawn`, which does the opposite and does
   not go back. The ending is the one moment the world is allowed to change and
   stay changed — see `start` and `World.setSky`.
--------------------------------------------------------------------------- */

const FADE = 0.5;
const TYPE_SPEED = 34;

/** How dark the sky goes when he is out, 0..1. */
export const DUSK_DEEP = 0.86;
/** Seconds the sky takes to fall, and to come back. Falling is slower. */
export const DUSK_FALL = 3.2;
export const DUSK_LIFT = 1.6;

/**
 * Seconds the sky takes to clear at the ending, and how far it goes.
 *
 * TWELVE, WHICH IS LONGER THAN ANY OTHER SKY CHANGE IN THE GAME AND IS MEANT
 * TO BE. The dusk falls in 3.2 because a dragon arriving is an event; this is
 * a morning coming up, and the finale's first two beats run about sixteen
 * seconds between them — so the change lands entirely inside Patchfur's first
 * two lines, slowly enough that a nine-year-old notices it happening rather
 * than noticing that it has happened. Cutting it to four was tried and reads
 * as a light switch.
 *
 * DEEP IS 1 AND NOT LESS. Unlike `DUSK_DEEP` there is nothing to hold back
 * for: the storm stops short of black so Ryuuseki still has a sky to be
 * enormous against, and there is no equivalent thing for a clear morning to
 * leave room for.
 */
export const DAWN_RISE = 12;
export const DAWN_DEEP = 1;

export const SCRIPTS = {
  found: [
    {
      id: 'balls1', who: 'Patchfur', sub: 'Calico',
      voice: '/voice/balls1.mp3',
      text: 'Seven stars. You found all seven. Nobody has held them together since before the islands broke apart.',
    },
    {
      id: 'balls2', who: 'Patchfur', sub: 'Calico',
      voice: '/voice/balls2.mp3',
      text: 'Take them to the great torii, both of you. And when the sky goes dark, do not run.',
    },
  ],
  summon: [
    {
      id: 'summon1', who: 'Ryuuseki', sub: 'The Wish That Waits',
      voice: '/voice/summon1.mp3',
      text: 'I am Ryuuseki. The wish that waits. Seven stars have called me out of the storm.',
    },
    {
      id: 'summon2', who: 'Ryuuseki', sub: 'The Wish That Waits',
      voice: '/voice/summon2.mp3',
      text: 'One of you will steer. One of you will burn. Alone, you may ride me. Together, you will light the whole sky.',
    },
  ],

  /* --- 100% mischief: the one ending the game has ---
     Fires when the last knockable thing in the world has been scored. Patchfur
     again, because she opened the story and the person who tells you what a
     place is should be the one who tells you what you did to it.

     IT IS NOT A "YOU WIN" SCREEN, AND THAT IS THE POINT. Nothing is taken
     away, no credits roll, the world is not reset — the last beat exists to
     say out loud that she can keep playing, because a nine-year-old who sees a
     completion screen reasonably concludes the game is over and stops.

     THE LAST BEAT SENDS THEM TO THE ARENA, and it speaks about it as a place
     that is open. Richard asked for that deliberately: the arena is the next
     thing being built, and the finale is the natural door into it — a
     tournament where the two of them stop knocking over furniture and find out
     which of them is the stronger fighter. **Until it exists, this line is a
     promise the game has made out loud to a nine-year-old**, which is a
     sharper kind of TODO than the rest of the list. If the arena slips, soften
     this line back to "there is a ring being marked out" rather than leaving
     her looking for a place she cannot find.

     WHY IT TALKS ABOUT ENTROPY. The maths in this game is not decoration — it
     has a walkable unit circle in it — and the mischief counter is the one
     number the girls have been watching all afternoon. Order is one
     arrangement of a town; every other arrangement is the rest of them, and
     they have been working through the rest of them with a katana. It is a
     real idea, said in words a nine-year-old can hold, and it is the honest
     reading of what they actually did rather than a moral bolted on at the
     end.

     RECORDED, like every other scene. Patchfur's preset voice is Mabel, the
     same one she uses for the intro and for `found` — a narrator who is
     ElevenLabs for seven lines and synthesised blips for the ending would make
     the ending sound like the part nobody finished. `dur` is still authored as
     a floor; `load()` grows it to the real clip length plus TAIL. */
  finale: [
    {
      id: 'done1', who: 'Patchfur', sub: 'Calico', voice: '/voice/done1.mp3', dur: 7.5,
      text: 'Every barrel. Every lantern. Every last cane of bamboo. There is nothing left standing on any of these islands that you two have not put your paws through.',
    },
    {
      id: 'done2', who: 'Patchfur', sub: 'Calico', voice: '/voice/done2.mp3', dur: 8.5,
      text: 'The elders called it mischief. I think it is simpler than that. A tidy town is only one way for a town to be. Every other way is the rest of them — and you have been counting your way through the rest of them all afternoon.',
    },
    {
      id: 'done3', who: 'Patchfur', sub: 'Calico', voice: '/voice/done3.mp3', dur: 8.5,
      text: 'The islands did not drift apart because something broke. They drifted because nobody was crossing between them any more. You crossed. An angle, a circle, and the nerve to jump — that is all a bridge has ever been.',
    },
    {
      id: 'done4', who: 'Patchfur', sub: 'Calico', voice: '/voice/done4.mp3', dur: 9.0,
      text: 'So stay. Fly. Knock it all down again tomorrow. And when you would rather test what you have learned on each other than on the furniture — the arena is open. Go and find out which of you is the strongest fighter on this world.',
    },
  ],

  /* --- MR. SATAN ANNOUNCES THE TOURNAMENT ---
     Fires thirty seconds after Ryuuseki has been summoned AND ridden. Both
     halves of that gate matter: the seven stars are the achievement, but a
     kid who has collected them and not yet climbed on has not seen the payoff
     yet, and interrupting her walk toward a legendary dragon to advertise a
     different feature is the worst possible moment for this. The thirty
     seconds let the flight happen first.

     HE IS THE ONLY VOICE IN THE GAME THAT IS NOT SINCERE. Patchfur narrates,
     the six leaders introduce themselves, Ryuuseki pronounces — all of them
     mean it. He is a showman selling tickets, and the tonal gap is what makes
     the tournament feel like a different kind of thing from the story the
     rest of the game tells. It is also cover: a game for a nine-year-old
     about her and her sister hitting each other needs the person proposing it
     to be ridiculous. */
  satanAnnounce: [
    {
      id: 'sat_ann1', who: 'MR. SATAN', sub: 'World Champion',
      voice: '/voice/sat_ann1.mp3', dur: 7.0,
      text: 'AHEM! Is this thing on? Citizens of the floating islands — it is I, MISTER SATAN! Strongest cat in the world, and yes, this magnificent moustache is absolutely real.',
    },
    {
      id: 'sat_ann2', who: 'MR. SATAN', sub: 'World Champion',
      voice: '/voice/sat_ann2.mp3', dur: 6.5,
      text: 'I have seen a green dragon as long as a street. I have seen two kittens climb on and ride it. And I thought — hoo hoo hoo! — those two need a proper stage.',
    },
    {
      id: 'sat_ann3', who: 'MR. SATAN', sub: 'World Champion',
      voice: '/voice/sat_ann3.mp3', dur: 7.0,
      text: 'So I am building one! The World Martial Arts Tournament returns! Knock this town flat, prove to me you are ready, and I will fly you there myself. Ho ho HO!',
    },
  ],

  /* --- AND OPENS IT, at 80% mischief ---
     The one moment the arena island actually appears in the sky. Short on
     purpose: everything that needed saying was said in the announcement, and
     what a kid wants at 80% is to go, not to be told again. */
  satanOpen: [
    {
      id: 'sat_open1', who: 'MR. SATAN', sub: 'World Champion',
      voice: '/voice/sat_open1.mp3', dur: 6.0,
      text: 'IT IS DONE! Every barrel, every lantern, every last cane of bamboo — and the arena is OPEN!',
    },
    {
      id: 'sat_open2', who: 'MR. SATAN', sub: 'World Champion',
      voice: '/voice/sat_open2.mp3', dur: 7.0,
      text: 'Come and find me in the town, both of you, together. Say the word, and my griffin will carry you to the ring. Ho ho ho hooo!',
    },
  ],
};

export class SummonScene {
  constructor({ world, audio }) {
    this.world = world;
    this.audio = audio;
    this.active = false;
    this.script = null;
    this.beat = 0;
    this.played = {
      found: false, summon: false, finale: false,
      satanAnnounce: false, satanOpen: false,
    };

    /** 0..1, how dark the sky is right now. Owned here, applied by the game. */
    this.dusk = 0;
    this.duskWant = 0;
    /** 0..1, how far the sky has cleared for the ending. Owned here for the
     *  same reason the dusk is: the sky belongs to the moment, not to a flag
     *  on an object somebody might forget to clear. */
    this.dawn = 0;
    this.dawnWant = 0;

    this.camera = new THREE.PerspectiveCamera(54, 16 / 9, 0.1, 4000);
    this._look = new THREE.Vector3();
    this.focus = new THREE.Vector3();

    this.el = document.getElementById('cutscene');
    this.boxEl = document.getElementById('cs-box');
    this.nameEl = document.getElementById('cs-name');
    this.textEl = document.getElementById('cs-text');
    this.portraitEl = document.getElementById('cs-portrait');
    this.fadeEl = document.getElementById('cs-fade');
    this.barEl = document.getElementById('cs-progress');
  }

  /**
   * Preload every line that HAS one. Same discipline as the intro.
   *
   * Beats with `voice: null` are skipped rather than fed a null src — an
   * `<audio>` pointed at nothing resolves against the page URL and fetches the
   * document itself, which then fails to decode several seconds later. The
   * finale is authored that way today, so this is not a hypothetical.
   */
  async load() {
    /* EVERY SCRIPT IN THE TABLE, derived rather than listed. This was a
       hand-written list of three, and adding Mr Satan's two would have made
       it a hand-written list of three that silently skipped them — the
       scenes would still play, on their authored durations, cutting every
       line off mid-word, and nothing anywhere would report a problem. */
    const all = Object.values(SCRIPTS).flat().filter((b) => b.voice);
    await Promise.all(all.map((b) => new Promise((resolve) => {
      const el = new window.Audio();
      el.preload = 'auto';
      const done = (ok) => {
        if (ok && Number.isFinite(el.duration) && el.duration > 0) {
          b.el = el;
          b.voiceDur = el.duration;
          b.dur = el.duration + TAIL;
          b.typeRate = b.text.length / Math.max(0.6, el.duration * 0.72);
        } else {
          b.el = null;
          b.voiceDur = 0;
          b.dur = 7;
        }
        resolve();
      };
      el.addEventListener('canplaythrough', () => done(true), { once: true });
      el.addEventListener('loadedmetadata', () => setTimeout(() => done(true), 1500), { once: true });
      el.addEventListener('error', () => done(false), { once: true });
      setTimeout(() => done(Number.isFinite(el.duration)), 4000);
      el.src = b.voice;
    })));
    const n = all.filter((b) => b.el).length;
    console.log(`[voice] ${n}/${all.length} dragon-hunt lines recorded`);
  }

  /**
   * @param {'found'|'summon'} which
   * @param {THREE.Vector3} focus what the camera should be looking at
   * @param {number} [radius] how big the subject is, in world units.
   *        The summon shot is FRAMED OFF THIS rather than off a fixed
   *        distance. Ryuuseki's quad is about 60 units across — a hardcoded
   *        46, which is a perfectly good distance for a 13-unit storm dragon,
   *        put the camera inside him and filled the screen with a green wall.
   *        A shot of something enormous has to know it is enormous.
   */
  start(which, focus, radius = 30, art = null) {
    this.radius = radius;
    if (this.active || this.played[which]) return false;
    this.played[which] = true;
    this.active = true;
    this.script = SCRIPTS[which];
    this.which = which;
    this.focus.copy(focus);
    this.beat = -1;
    this.fadeIn = FADE;
    this.el.classList.remove('hidden');
    /* THE FINALE SHOWS PATCHFUR; THE OTHER TWO SHOW NOBODY, and the difference
       is who the camera is on. `found` and `summon` frame a place or a dragon
       and the speaker is elsewhere, so a portrait would be furniture for its
       own sake. The finale is Patchfur talking directly to them over a shot of
       the world — she is the one thing NOT on screen, which is exactly when
       the little box earns its place and what every other scene she speaks in
       already does. */
    /* THE PORTRAIT SHOWS WHEN THE SPEAKER IS NOT ON SCREEN, which is the same
       rule the finale established and the reason Mr Satan gets one too. His
       shots frame the TOWN and then the arena — the places he is talking
       about — so he is the one thing not in the picture, and that is exactly
       when the little box earns its space. `found` and `summon` still show
       nobody: those already frame their own subject. */
    const showPortrait = (which === 'finale' || which === 'satanAnnounce' || which === 'satanOpen')
      && !!art;
    this.portraitEl.style.display = showPortrait ? '' : 'none';
    if (showPortrait) {
      drawPortrait(this.portraitEl, art, which.startsWith('satan') ? '#ffd24a' : '#e8c98a');
    }
    if (which === 'summon') this.duskWant = DUSK_DEEP;
    /* THE ENDING TAKES THE STORM DOWN AND PUTS A MORNING UP, and both halves
       matter. The finale fires at 100% mischief, which in a real run happens
       long after the dragon has been summoned — so the sky it opens on is
       Ryuuseki's black one, and Patchfur's four lines about what the girls
       have made of this place were being spoken over a thunderstorm.
       IT IS NOT PUT BACK WHEN THE SCENE ENDS. Every other scene's sky is
       borrowed and returned; this one is the world having changed, and
       changing back the moment the box closes would say the opposite of what
       the scene just said. Only a restart clears it — see `resetSky`.
       `clearDusk` is still what Ryuuseki leaving calls, and it deliberately
       does not touch the dawn: the dragon can come and go afterwards without
       taking the morning with him. */
    if (which === 'finale') {
      this.duskWant = 0;
      this.dawnWant = DAWN_DEEP;
    }
    this._next();
    return true;
  }

  _next() {
    this.beat++;
    if (this.beat >= this.script.length) { this.finish(); return; }
    const b = this.script[this.beat];
    this.t = 0;
    this.typed = 0;
    this.lineEndedAt = null;
    this.textEl.textContent = '';
    /* His gold, so the tournament reads as a different thread from the story
       the moment the box opens — the girls know a Patchfur scene from a
       Ryuuseki scene by its colour already. */
    const color = this.which === 'summon' ? '#ffe07a'
      : this.which.startsWith('satan') ? '#ffd24a' : '#e8c98a';
    this.nameEl.textContent = `${b.who}  ·  ${b.sub}`;
    this.nameEl.style.color = color;
    this.boxEl.style.setProperty('--cs-accent', color);
    this.voiceEl = this.audio?.speak(b.el ?? b.voice) ?? null;
  }

  skip() { if (this.active) this.finish(); }

  finish() {
    this.active = false;
    this.script = null;
    this.el.classList.add('hidden');
    this.portraitEl.style.display = '';
    /* Clear the black. `#cs-fade` is SHARED with the opening cutscene and the
       shrine scenes, and this one ends on a fade-out — leaving it at full
       means the next scene to use the element opens on a black frame before
       its own first update overwrites it. Hidden is not the same as reset. */
    this.fadeEl.style.opacity = 0;
    this.barEl.style.width = '0%';
    this.audio?.stopSpeaking();
    this.voiceEl = null;
  }

  /** Sky back to sunset — called when Ryuuseki leaves the world.
   *  IT DOES NOT TOUCH THE DAWN. The dragon leaving is not the ending being
   *  undone; see the note in `start`. */
  clearDusk() { this.duskWant = 0; }

  /** Everything about the sky back to the opening state. RESTART ONLY — the
   *  dawn is permanent within a run and this is the one thing that unmakes it,
   *  for the same reason `_restart` un-meets every clan leader. */
  resetSky() {
    this.duskWant = 0;
    this.dusk = 0;
    this.dawnWant = 0;
    this.dawn = 0;
  }

  /**
   * Ease both sky channels toward their targets and hand them to the world.
   * Runs every frame, scene or no scene.
   *
   * IT APPLIES THEM ITSELF rather than returning a number for the game to
   * apply. It used to be `world.setDusk(scene.updateDusk(dt))` at two call
   * sites, which was fine while the sky had one channel and is a trap with
   * two: the finale drops the dusk and raises the dawn on the same frame, and
   * anything that forwards only one of them draws a storm-lit morning. One
   * call, both numbers, in the order `World.setSky` blends them.
   */
  updateSky(dt) {
    const rate = this.duskWant > this.dusk ? dt / DUSK_FALL : dt / DUSK_LIFT;
    if (this.dusk < this.duskWant) this.dusk = Math.min(this.duskWant, this.dusk + rate);
    else this.dusk = Math.max(this.duskWant, this.dusk - rate);
    /* One rate, both directions. Nothing in the game lowers the dawn — only
       `resetSky` does, and a restart wants it gone that frame, not eased. */
    const dRate = dt / DAWN_RISE;
    if (this.dawn < this.dawnWant) this.dawn = Math.min(this.dawnWant, this.dawn + dRate);
    else this.dawn = Math.max(this.dawnWant, this.dawn - dRate);
    this.world?.setSky(this.dusk, this.dawn);
    return this.dusk;
  }

  update(dt) {
    if (!this.active) return false;
    this.t += dt;
    this.fadeIn = Math.max(0, this.fadeIn - dt);
    const b = this.script[this.beat];

    /* The shot. FOUND looks down on the town from high and slides sideways —
       it is about a place you are being sent to. SUMMON is a low angle circling
       him, because the one thing the camera has to say is that he is enormous.
     */
    const k = Math.min(1, this.t / Math.max(0.001, b.dur));
    const ease = 1 - (1 - k) * (1 - k);
    const F = this.focus;
    if (this.which === 'summon') {
      /* Circling, from below. 1.55x his own size fits the whole creature with
         air around it; the dolly-in is a fraction of that rather than a fixed
         number of units, so the shot holds whatever he is scaled to. */
      const a = -0.6 + ease * 0.7 + this.beat * 0.9;
      const dist = this.radius * (1.55 - ease * 0.13);
      this.camera.position.set(
        F.x + Math.sin(a) * dist,
        F.y - this.radius * 0.22 + ease * this.radius * 0.1,
        F.z + Math.cos(a) * dist
      );
      this._look.set(F.x, F.y + this.radius * 0.06, F.z);
    } else if (this.which === 'finale') {
      /* THE SHOT IS THE ARGUMENT. She is talking about islands that drifted
         apart and two kittens who crossed between them, so the camera does the
         one thing the other two shots never do: it keeps going UP and BACK,
         beat after beat, until the whole archipelago is in frame at once and
         the town they have spent the afternoon flattening is a detail on it.
         Continuous across beats rather than reset per beat — the pull-back has
         to feel like one long breath, and four separate slow zooms read as
         four cuts. `radius` carries the world's own size in, so this cannot be
         quietly wrong if the archipelago grows. */
      const span = this.beat + ease;              // 0 -> script.length
      const out = span / Math.max(1, this.script.length);
      const a = 0.35 + span * 0.16;               // a slow, steady turn
      const dist = this.radius * (0.62 + out * 0.72);
      this.camera.position.set(
        F.x + Math.sin(a) * dist,
        F.y + this.radius * (0.30 + out * 0.46),
        F.z + Math.cos(a) * dist
      );
      this._look.set(F.x, F.y, F.z);
    } else if (this.which === 'satanAnnounce' || this.which === 'satanOpen') {
      /* HIS SHOTS ARE ABOUT THE PLACE, NOT ABOUT HIM. He is a billboard
         standing in a town square and there is no framing of a flat drawing
         that carries three beats — so the camera does what he is actually
         doing: showing you somewhere. The announcement circles the town he is
         telling them to flatten; the opening circles the arena, which has
         just appeared in the sky and is the only thing either girl wants to
         look at. He speaks from the portrait box over the top of it.
         Slow and steady, continuous across beats, so three beats read as one
         move rather than three cuts. */
      const span = this.beat + ease;
      const a = 0.6 + span * 0.30;
      const dist = this.radius * (1.5 - span * 0.10);
      this.camera.position.set(
        F.x + Math.sin(a) * dist,
        F.y + this.radius * (0.52 - span * 0.05),
        F.z + Math.cos(a) * dist
      );
      this._look.set(F.x, F.y + this.radius * 0.06, F.z);
    } else {
      const a = 0.5 + ease * 0.35 + this.beat * 0.5;
      this.camera.position.set(
        F.x + Math.sin(a) * 66,
        F.y + 42 - ease * 6,
        F.z + Math.cos(a) * 66
      );
      this._look.set(F.x, F.y + 4, F.z);
    }
    this.camera.lookAt(this._look);

    // --- typewriter on the audio's playhead. See Cutscene.update.
    const clock = (this.voiceEl && b.voiceDur && this.voiceEl.currentTime > 0)
      ? this.voiceEl.currentTime
      : this.t;
    const want = Math.floor(clock * (b.typeRate ?? TYPE_SPEED));
    if (want > this.typed && this.typed < b.text.length) {
      this.typed = Math.min(b.text.length, want);
      this.textEl.textContent = b.text.slice(0, this.typed);
    }

    const before = this.script.slice(0, this.beat).reduce((s, x) => s + x.dur, 0);
    const total = this.script.reduce((s, x) => s + x.dur, 0);
    this.barEl.style.width = `${((before + this.t) / total) * 100}%`;
    const last = this.beat === this.script.length - 1;
    const fadeOut = Math.max(0, FADE - (b.dur - this.t)) / FADE;
    this.fadeEl.style.opacity = Math.max(this.fadeIn / FADE, last ? Math.min(1, fadeOut) : 0);

    if (this.lineEndedAt == null && this._lineFinished(b)) this.lineEndedAt = this.t;
    const started = !!this.voiceEl && this.voiceEl.currentTime > 0;
    if (beatOver(this.t, b.dur, this.lineEndedAt, started)) this._next();
    return this.active;
  }

  _lineFinished(b) {
    const el = this.voiceEl;
    if (!el || !b.voiceDur) return true;
    if (el.ended) return true;
    return el.currentTime > 0 && el.currentTime >= b.voiceDur - 0.06;
  }

  faceCamera() { /* nothing on stage */ }
}
