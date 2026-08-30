/* Capture harness for the Help GIFs. Injected into the game page by fetch+eval
   from the asset server (survives nothing — re-eval after every reload). Drives
   the real game: synthesized keys, teleports, a lockable follow camera, and a
   render-hook recorder that mirrors the WebGL canvas to an offscreen 2D canvas,
   snapshots one frame per rAF, and POSTs decimated frames to the asset server
   for tools/gif.mjs to encode. Overlays (keyboard/controller/touch) are drawn
   onto the offscreen frame just before snapshot — that is how DOM-only UI (the
   touch pad) and input diagrams get into a canvas-only film. */
(() => {
  const S = 'http://localhost:7799';
  const g = window.game;
  const cap = {
    g, S,
    /* --- boot --- */
    play() {
      if (g.state !== 'play') {
        g.introPlayed = true;                 // no intro cutscene
        g._trailerOfferDue = () => false;      // no "watch the trailer?" gate
        g.startPlay();
      }
      return g.state;
    },
    solo() { while (g.partySize > 1) g._leavePlayer(g.partySize - 1); return g.partySize; },
    /* --- input ---
       THE JOIN FLOW NORMALLY ASSIGNS THE KEYSET. A scripted boot skips it, so
       every slot's binding.keyset is null and synthesized keys route nowhere:
       the key lands in `input.keys` (the game's own keydown listener catches
       our dispatched events) but no slot reads that set. bindKB() does what the
       dealer would have — hands slot i keyboard set i (0=WASD, 1=Arrows) — and
       clears keys, because a stale key left in the Set reads as still-held and
       was the reason the first movement test moved nothing. */
    bindKB() { this.g.input.keys.clear(); for (let i = 0; i < this.g.partySize; i++) this.g.input.bindings[i].keyset = i; },
    key(code, down) { window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true })); },
    down(c) { this.g.input.keys.add(c); this.key(c, true); },
    up(c) { this.g.input.keys.delete(c); this.key(c, false); },
    /* Hold a key for `ms`, frame-accurate (release scheduled off rAF, not a bare
       timer, so it lines up with the capture clock). */
    hold(code, ms) {
      return new Promise((res) => {
        this.down(code); const t0 = performance.now();
        const step = () => { if (performance.now() - t0 >= ms) { this.up(code); return res(); } requestAnimationFrame(step); };
        requestAnimationFrame(step);
      });
    },
    /* A single edge press. `pressed()` is held && !prev, so the keydown must
       survive at least one input.update() before the keyup — two rAF does it. */
    async tap(code) { this.down(code); await new Promise((r) => requestAnimationFrame(r)); await new Promise((r) => requestAnimationFrame(r)); this.up(code); },
    tapUp() { for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyF', 'KeyE', 'KeyQ', 'ShiftLeft',
      'KeyO', 'KeyK', 'KeyL', 'Semicolon', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']) this.up(c); },
    /* --- teleport ---
       heightAt returns {y}, NOT a number — setting position.y to that object
       poisons it to undefined, y goes non-finite, and the camera lerp turns to
       NaN and never recovers (a black render). Resolve to `.y` and never let a
       null height through: fall back to the current y, which is always finite. */
    tp(i, x, z, y) {
      const p = g.players[i]; if (!p) return;
      let yy = y;
      if (y == null) { const h = g.world.heightAt && g.world.heightAt(x, z); yy = (h && Number.isFinite(h.y)) ? h.y : p.position.y; }
      if (!Number.isFinite(yy)) yy = p.position.y;
      p.position.set(x, yy, z); p.group.position.copy(p.position); p.velocity && p.velocity.set(0, 0, 0);
    },
    /* --- lockable follow camera. centreFn()=>Vec3 (defaults to the player). --- */
    lock(i, { dist, pitch, yaw = 0, centreFn = null }) {
      const p = g.players[i]; if (!p) return;
      if (!p.__osFocus) { p.__osFocus = p.setFocus.bind(p); p.setFocus = (f) => { if (!p.__locked) p.__osFocus(f); }; }
      p.__locked = true;
      const apply = () => {
        if (!p.__locked) return;
        p.__osFocus({ centre: centreFn ? centreFn() : p.position, dist, pitch, yaw });
        requestAnimationFrame(apply);
      };
      apply();
    },
    unlock(i) { const p = g.players[i]; if (p) { p.__locked = false; p.__osFocus && p.__osFocus(null); } },
    /* --- a per-frame driver (e.g. orbit the dojo point), stopped by clearDrive() --- */
    drive(fn) { this._drive = fn; const step = (t) => { if (this._drive) { this._drive(t); requestAnimationFrame(step); } }; requestAnimationFrame(step); },
    clearDrive() { this._drive = null; },
    /* --- recorder. Deterministic: capture auto-STOPS at `max` snapshots, so the
       clip length does not depend on how long tool round-trips take. `n` is the
       raw rAF counter (drive θ off it for capture-synced motion); `count` is
       snapshots kept. Encode is a separate step so the 30s tool budget is spent
       on transfer+encode of a KNOWN small number of frames, never on runaway
       capture. --- */
    startRec(name, w = 640, h = 360, everyN = 3, max = 80, src = null) {
      const gl = g.renderer.domElement;
      const oc = document.createElement('canvas'); oc.width = w; oc.height = h;
      const ox = oc.getContext('2d', { willReadFrequently: true });
      const rec = { name, w, h, everyN, max, n: 0, count: 0, frames: [], overlay: null, done: false, oc, ox, gl, orig: g.renderer.render.bind(g.renderer) };
      /* `src` crops a sub-rect of the WebGL buffer before scaling into w×h. The
         default is the whole buffer; passing a centred square is how a 16:9
         viewport yields an UNDISTORTED square clip (drawing the full 16:9 into a
         square target would squash it). Evaluated per frame so a DPR/resize does
         not desync the crop from the live buffer size. */
      g.renderer.render = (...a) => {
        rec.orig(...a);
        const s = (typeof src === 'function') ? src(gl) : (src || { x: 0, y: 0, w: gl.width, h: gl.height });
        ox.drawImage(gl, s.x, s.y, s.w, s.h, 0, 0, w, h);
      };
      this.rec = rec;
      const snap = () => {
        if (this.rec !== rec || rec.done) return;
        rec.n++;
        if (rec.n % everyN === 0) {
          if (rec.overlay) rec.overlay(ox, rec.count);
          rec.frames.push(ox.getImageData(0, 0, w, h).data.slice());
          rec.count++;
          if (rec.count >= rec.max) { rec.done = true; g.renderer.render = rec.orig; return; } // stop capturing, keep frames
        }
        requestAnimationFrame(snap);
      };
      requestAnimationFrame(snap);
      return 'recording ' + name + ' (max ' + max + ')';
    },
    setOverlay(fn) { if (this.rec) this.rec.overlay = fn; },
    capturing() { return !!this.rec && !this.rec.done; },
    progress() { return this.rec ? { count: this.rec.count, max: this.rec.max, n: this.rec.n, done: this.rec.done } : null; },
    /* Encode whatever has been captured (POST frames + encode), then drop it. */
    async encode({ delay = 60, colors = 256, dither = false } = {}) {
      const rec = this.rec; if (!rec) return 'nothing to encode';
      g.renderer.render = rec.orig; this.rec = null;
      await fetch(`${S}/gif/begin?name=${rec.name}&w=${rec.w}&h=${rec.h}`);
      for (const f of rec.frames) await fetch(`${S}/gif/frame?name=${rec.name}`, { method: 'POST', body: f });
      const r = await fetch(`${S}/gif/end?name=${rec.name}&delay=${delay}&colors=${colors}&dither=${dither ? 1 : 0}`);
      return await r.json();
    },
    frameCount() { return this.rec ? this.rec.count : 0; },
  };
  window.__cap = cap;
  return 'harness ready; players=' + g.players.length + ' state=' + g.state;
})();
