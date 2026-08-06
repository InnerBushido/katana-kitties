/* ---------------------------------------------------------------------------
   Sound.

   Every sound in this game is SYNTHESISED at runtime from oscillators and
   noise. No audio files, nothing to download, nothing to licence, no asset
   pipeline, and the whole thing costs a few kilobytes of source. For a game
   made of flat colours and hand-drawn cats that's not a compromise — chiptune
   blips suit it better than recorded foley would.

   The music is generated the same way: a slow koto-ish pluck wandering a
   Japanese pentatonic scale over a drone, scheduled a bar ahead. It never
   loops exactly, so it doesn't get tiresome the way an 8-second sample would.

   Browsers refuse to start audio without a user gesture, so nothing exists
   until resume() is called from a real click or button press.
--------------------------------------------------------------------------- */

/* Hirajoshi — the scale that makes five notes sound unmistakably Japanese.
   Semitone offsets from the root. */
const HIRAJOSHI = [0, 2, 3, 7, 8];
const ROOT = 146.83; // D3

const semi = (n) => ROOT * Math.pow(2, n / 12);

/** See sfxBus — turns the relative per-sound gains into real loudness. */
const SFX_MAKEUP = 3.2;

export class Audio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.sfxVolume = 0.75;
    this.musicVolume = 0.4;
    this._noiseBuf = null;
    this._voices = 0;
    this._musicTimer = null;
    this._nextNote = 0;
    this._step = 0;
  }

  /** Called from a real user gesture. Safe to call repeatedly. */
  resume() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      this.ctx = new Ctx();

      // A little headroom management so a market full of tumbling barrels
      // doesn't clip into a nasty crunch.
      /* Catch loud pile-ups only. The default 30dB knee starts compressing
         30dB BELOW the threshold, which quietly squashed every single blip in
         the game to a third of its intended level — everything "worked" and
         everything was inaudible. */
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -8;
      this.comp.knee.value = 6;
      this.comp.ratio.value = 6;
      this.comp.attack.value = 0.002;
      this.comp.release.value = 0.18;
      this.comp.connect(this.ctx.destination);

      /* Makeup gain. The per-sound gains are written as "how loud is this
         relative to the others", which lands well under full scale once the
         short exponential envelopes are accounted for. This brings the bus up
         to a usable level in one place, so tuning one sound never means
         re-tuning all of them. */
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.sfxVolume * SFX_MAKEUP;
      this.sfxBus.connect(this.comp);

      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0;
      this.musicBus.connect(this.comp);

      this._buildNoise();
      this.ready = true;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  _buildNoise() {
    const len = Math.floor(this.ctx.sampleRate * 0.6);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noiseBuf = buf;
  }

  setSfxVolume(v) {
    this.sfxVolume = v;
    if (this.sfxBus) this.sfxBus.gain.value = v * SFX_MAKEUP;
  }

  setMusicVolume(v) {
    this.musicVolume = v;
    if (this.musicBus && this._musicTimer) {
      this.musicBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.2);
    }
  }

  /* ------------------------------ primitives ----------------------------- */

  /** A pitched blip. `type` is any OscillatorNode type. */
  _tone(opts) {
    const {
      type = 'sine', from, to = from, dur = 0.15, gain = 0.3,
      delay = 0, curve = 'exp', detune = 0,
    } = opts;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) {
      if (curve === 'exp') osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
      else osc.frequency.linearRampToValueAtTime(to, t + dur);
    }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.012, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** A filtered burst of noise — every impact, slash and whoosh is one. */
  _noise(opts) {
    const {
      dur = 0.2, gain = 0.3, type = 'bandpass',
      from = 1200, to = from, q = 1.2, delay = 0,
    } = opts;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    if (to !== from) f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /* -------------------------------- sfx ---------------------------------- */

  /**
   * @param {string} name
   * @param {number} vol 0..1 — pass a distance-based value for far-off events
   */
  play(name, vol = 1) {
    if (!this.ready || vol <= 0.02) return;
    // Cheap voice cap: a dragon strafing a market can fire a lot of these.
    if (this._voices > 14) return;
    this._voices++;
    setTimeout(() => { this._voices--; }, 260);

    const v = vol;
    switch (name) {
      case 'jump':
        this._tone({ type: 'triangle', from: 300, to: 660, dur: 0.13, gain: 0.22 * v });
        break;
      case 'doubleJump':
        this._tone({ type: 'triangle', from: 420, to: 900, dur: 0.14, gain: 0.2 * v });
        this._tone({ type: 'sine', from: 840, to: 1500, dur: 0.1, gain: 0.08 * v, delay: 0.02 });
        break;
      case 'land':
        this._tone({ type: 'triangle', from: 150, to: 62, dur: 0.14, gain: 0.26 * v });
        this._noise({ from: 700, to: 200, dur: 0.1, gain: 0.13 * v, q: 0.8 });
        break;
      case 'slash':
        // The blade: a fast bright sweep, plus a touch of ring. Bandpass at
        // high Q throws most of the noise away, so it needs more gain than
        // its loudness relative to the others suggests.
        this._noise({ from: 3600, to: 700, dur: 0.17, gain: 0.75 * v, q: 2.4 });
        this._tone({ type: 'sine', from: 2400, to: 1500, dur: 0.1, gain: 0.06 * v });
        break;
      case 'hit':
        // Wood knocked over.
        this._tone({ type: 'square', from: 220, to: 90, dur: 0.1, gain: 0.16 * v });
        this._noise({ from: 1400, to: 500, dur: 0.12, gain: 0.16 * v, q: 1.1 });
        break;
      case 'bamboo': {
        /* A hollow crack. The pitched part matters: bamboo is a tube, so it
           rings for a moment after it splits — that's the whole character of
           the sound and what makes cutting a whole grove satisfying. */
        this._noise({ from: 5200, to: 1800, dur: 0.09, gain: 0.34 * v, type: 'highpass', q: 0.7 });
        this._tone({ type: 'triangle', from: 780, to: 300, dur: 0.26, gain: 0.2 * v });
        this._tone({ type: 'sine', from: 1560, to: 900, dur: 0.2, gain: 0.07 * v, delay: 0.01 });
        break;
      }
      case 'breath':
        // A long exhale that opens up and closes again.
        this._noise({ from: 400, to: 2600, dur: 0.38, gain: 0.55 * v, type: 'lowpass', q: 0.9 });
        this._tone({ type: 'sawtooth', from: 90, to: 42, dur: 0.36, gain: 0.1 * v });
        break;
      case 'mount':
        [0, 3, 7].forEach((n, i) => this._tone({
          type: 'triangle', from: semi(n + 12), dur: 0.22,
          gain: 0.16 * v, delay: i * 0.055,
        }));
        break;
      case 'dismount':
        [7, 3, 0].forEach((n, i) => this._tone({
          type: 'triangle', from: semi(n + 12), dur: 0.18,
          gain: 0.13 * v, delay: i * 0.05,
        }));
        break;
      case 'orb':
        // A bell: fundamental plus a slightly detuned partial, long decay.
        this._tone({ type: 'sine', from: semi(24), dur: 1.1, gain: 0.2 * v });
        this._tone({ type: 'sine', from: semi(31), dur: 0.85, gain: 0.1 * v, detune: 6 });
        break;
      case 'clan':
        // A gong-ish swell for a moment that should feel like a big deal.
        // Five partials land almost together, so each has to be modest or the
        // gong alone eats most of the headroom.
        HIRAJOSHI.forEach((n, i) => this._tone({
          type: 'sine', from: semi(n), dur: 1.5 - i * 0.12,
          gain: 0.075 * v, delay: i * 0.012,
        }));
        this._noise({ from: 300, to: 90, dur: 1.0, gain: 0.07 * v, q: 0.6 });
        break;
      case 'score':
        this._tone({ type: 'square', from: semi(19), dur: 0.07, gain: 0.1 * v });
        this._tone({ type: 'square', from: semi(24), dur: 0.12, gain: 0.1 * v, delay: 0.07 });
        break;
      case 'menu':
        this._tone({ type: 'sine', from: 900, to: 1300, dur: 0.07, gain: 0.22 * v });
        break;
      default:
        break;
    }
  }

  /* ------------------------------- music --------------------------------- */

  startMusic() {
    if (!this.ready || this._musicTimer) return;
    this.musicBus.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, 0.8);
    this._nextNote = this.ctx.currentTime + 0.1;
    this._step = 0;
    // Schedule ahead on a timer rather than per-frame: audio timing must not
    // depend on the render loop, or it stutters whenever the GPU does.
    this._musicTimer = setInterval(() => this._schedule(), 120);
  }

  stopMusic() {
    if (!this._musicTimer) return;
    clearInterval(this._musicTimer);
    this._musicTimer = null;
    this.musicBus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
  }

  /** Duck the music (pause menu) without tearing the schedule down. */
  duck(on) {
    if (!this.ready || !this._musicTimer) return;
    this.musicBus.gain.setTargetAtTime(
      on ? this.musicVolume * 0.25 : this.musicVolume, this.ctx.currentTime, 0.25
    );
  }

  _schedule() {
    const beat = 0.52;
    while (this._nextNote < this.ctx.currentTime + 0.6) {
      this._pluck(this._nextNote, this._step);
      this._nextNote += beat;
      this._step++;
    }
  }

  _pluck(t, step) {
    const bar = Math.floor(step / 8);

    // A low drone every couple of bars, holding the key down.
    if (step % 16 === 0) {
      const d = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      d.type = 'sine';
      d.frequency.value = ROOT / 2;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.14, t + 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 8);
      d.connect(g).connect(this.musicBus);
      d.start(t);
      d.stop(t + 8.1);
    }

    // Rests are what make it feel like music rather than an arpeggiator.
    const r = Math.sin(step * 12.9898 + bar * 78.233) * 43758.5453;
    const rnd = r - Math.floor(r);
    if (rnd > 0.72) return;

    const octave = rnd > 0.55 ? 12 : rnd > 0.2 ? 0 : 24;
    const note = HIRAJOSHI[Math.floor(rnd * 5 * 3) % 5] + octave;
    const freq = semi(note);

    /* A plucked string: two detuned triangles through a lowpass that closes
       as the note decays — the filter sweep is what reads as "plucked"
       rather than "beeped". */
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 1.1;
    f.frequency.setValueAtTime(freq * 7, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(200, freq * 1.6), t + 0.9);

    for (const det of [-5, 6]) {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + 2.0);
    }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    f.connect(g).connect(this.musicBus);
  }
}
