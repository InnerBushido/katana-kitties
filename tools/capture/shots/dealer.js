/* ============================================================================
   KEPT AS A RECORD. DO NOT COPY THIS ONE.

   `dealer.gif` films the dealer's shop, which is a DOM overlay — and `readPixels`
   off the WebGL back buffer cannot see a DOM overlay at all. The answer here was
   to load **html2canvas** and rasterise it, which works and is the only
   third-party library this project has ever pulled in. That makes it a straight
   violation of the ninth non-negotiable in CLAUDE.md, and the library is NOT
   vendored with this file: running it means fetching html2canvas yourself.

   THE DEPENDENCY-FREE ANSWER IS `shots/phone.js`. It redraws the overlay onto
   the captured frame from the live DOM's own measurements — getBoundingClientRect
   and getComputedStyle on every real element — so it invents nothing, cannot
   disagree with the game, and needs no library. Anything that has to film DOM
   from here on copies that.

   This file survives because it is the only thing that could ever re-cut
   `dealer.gif`, and because the choreography in it is still good.
   ============================================================================ */
/* Dealer's-stall GIF, v4.
   ==================================================================
   WHY THE BLACK BARS HAPPENED (v3, kept because it will be re-asked):
   not the DOM, and not color-mix. Measured: the captured pixel at the selected
   shop row came back rgb(138,118,83) where the live page gives rgb(248,219,144)
   — exactly the row's own shadow colour rgb(29,18,22) over the whole row at
   ~50%. html2canvas 1.4.1 does not implement `box-shadow: inset 0 0 0 3px`; it
   FLOODS the element with the shadow colour. 81 elements here carry a
   box-shadow, which is why bars turned up all over. So every shadow is off for
   the capture and the one that carries meaning — the ring round the cursor — is
   drawn by hand from the live rect. `outline` was tried as a replacement and is
   ALSO ignored by html2canvas (measured: ring pixels came back unchanged).
   `color(srgb ...)` is a separate, smaller bug: it THROWS rather than
   mis-painting, and one element has it; it is converted from the computed value
   so the purse keeps its true player tint.

   WHAT v4 CHANGES
   1. A HELD BEAT MUST NOT FREEZE THE WORLD. v3 held by sitting on ONE frame for
      seconds, so the Kotodama orb stopped mid-orbit and the whole clip read as
      a lag spike rather than a pause. Beats where the world is visible are now
      captured LIVE: the DOM layer is rasterised once (it is not changing during
      a hold) and re-composited over FRESH world frames, with each frame's delay
      set to the time it really took — so the orbit plays back at true speed
      instead of being sped up to fit. The game is never paused by this script.
      Beats at the counter stay single-frame on purpose: `profile.open('shop')`
      freezes the world for everybody (that is the game's own rule, see
      inspector.js CHOICES) and the panel covers the screen, so there is
      nothing moving to miss and animating it would only cost frames.
   2. THE MATHS OVERLAY IS OFF. `_toggleMath` drops the cos/sin working the
      Kotodama orb prints; the orb itself keeps orbiting, which is the bit worth
      seeing here. This clip is about the dealer, not the maths.
   3. THE CAPTION HAS ITS OWN STRIP. It used to sit over the bottom of the
      panel and cover "JUMP buy · ATTACK sell · INTERACT leave" — the line that
      says what the buttons do, which is exactly what a Help clip must not
      cover. The canvas is now VH+BAR tall: the game gets the top, the caption
      gets a strip of its own underneath, and nothing overlaps.
   4. Longer holds throughout (see BEATS).

   Call: eval, `await window.__dealerSetup()`, `await window.__dealerShot()`,
   then `await window.__encodeDealer()`. */
(() => {
  const g = window.game;
  const glc = g.renderer.domElement;
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------------------------------------------------------------------
     DRIVE THE WORLD BY HAND, DO NOT WAIT ON requestAnimationFrame.
     Measured in this capture pane: rAF fires about every 3000ms, because the
     page is genuinely hidden (document.hidden === true) and browsers throttle
     hidden tabs. three.js's setAnimationLoop is rAF, so the GAME LOOP itself
     was running at ~0.3fps — which is the real reason the Kotodama orb "stopped
     spinning and looked like lag". No amount of holding frames could have fixed
     that; the simulation was not advancing.

     So the capture takes the loop off rAF and steps it itself, with the clock
     stubbed to a fixed dt. That makes motion smooth AND deterministic (the same
     script gives the same frames whatever the machine is doing), and it drops
     the capture from minutes to seconds. `sub` splits one displayed frame into
     a couple of physics steps so nothing tunnels at 12fps. --------------- */
  const drive = {
    on: false,
    start() { if (this.on) return; g.renderer.setAnimationLoop(null); this.on = true; },
    stop() { if (!this.on) return; g.renderer.setAnimationLoop(() => g._tick()); this.on = false; },
    step(seconds, sub = 2) {
      const cl = g.clock, orig = cl.getDelta.bind(cl);
      cl.getDelta = () => seconds / sub;
      try { for (let i = 0; i < sub; i++) g._tick(); } finally { cl.getDelta = orig; }
    },
  };

  const dealer = {
    mirror: null, mctx: null, orig: null, undo: [], hidden: [], mathWas: null,

    /* THE MIRROR READS THE FRAMEBUFFER, NOT THE CANVAS.
       `drawImage(webglCanvas)` looked right and was silently three seconds
       stale: in a hidden tab the COMPOSITOR is what refreshes the canvas's
       presented image, and it runs on the same throttled clock as rAF. So a
       hundred render() calls in a row all copied the same picture, and the clip
       came out frozen no matter what the simulation did. Measured: with
       drawImage, consecutive captured frames were byte-identical even across a
       teleport; with readPixels the teleport shows up on the very next frame.
       readPixels goes straight to the GL backbuffer and is not compositor-gated
       — it must be called while the frame is still current, which is why it
       happens at the top of compose(), immediately after the step that drew it.
       Y is flipped because GL's origin is bottom-left. */
    startMirror() {
      const m = document.createElement('canvas');
      m.width = glc.width; m.height = glc.height;
      this.mirror = m; this.mctx = m.getContext('2d');
      this.buf = null; this.img = null;
    },
    readGL() {
      const gl = g.renderer.getContext();
      const W = glc.width, H = glc.height;
      if (!this.buf || this.buf.length !== W * H * 4) {
        this.buf = new Uint8Array(W * H * 4);
        this.mirror.width = W; this.mirror.height = H;
        this.img = this.mctx.createImageData(W, H);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, this.buf);
      const d = this.img.data, row = W * 4;
      for (let y = 0; y < H; y++) d.set(this.buf.subarray((H - 1 - y) * row, (H - y) * row), y * row);
      this.mctx.putImageData(this.img, 0, 0);
    },
    stopMirror() { this.buf = null; this.img = null; },

    _set(el, p, v) {
      this.undo.push([el, p, el.style.getPropertyValue(p), el.style.getPropertyPriority(p)]);
      el.style.setProperty(p, v, 'important');
    },

    hideChrome() {
      for (const id of ['hud', 'touch-pad']) {
        const el = document.getElementById(id);
        if (el && !el.classList.contains('hidden')) { el.classList.add('hidden'); this.hidden.push(el); }
      }
      // The orb keeps orbiting; only its printed working goes.
      this.mathWas = g.mathVisible;
      if (g.mathVisible) g._toggleMath();
    },
    showChrome() {
      for (const el of this.hidden) el.classList.remove('hidden');
      this.hidden = [];
      if (this.mathWas && !g.mathVisible) g._toggleMath();
    },

    neutralise() {
      const conv = (v) => v.replace(/color\(srgb([^)]*)\)/g, (m, b) => {
        const [n, a] = b.split('/');
        const [r, gg, bb] = n.trim().split(/\s+/).map(Number);
        return `rgba(${Math.round(r * 255)}, ${Math.round(gg * 255)}, ${Math.round(bb * 255)}, ${a !== undefined ? parseFloat(a) : 1})`;
      });
      this._set(document.body, 'background', 'transparent');
      this._set(document.documentElement, 'background', 'transparent');
      for (const el of document.querySelectorAll('*')) {
        const c = getComputedStyle(el);
        const bc = c.getPropertyValue('background-color');
        if (bc.includes('color(')) this._set(el, 'background-color', conv(bc));
        const col = c.getPropertyValue('color');
        if (col.includes('color(')) this._set(el, 'color', conv(col));
        const bs = c.getPropertyValue('box-shadow');
        if (bs && bs !== 'none') this._set(el, 'box-shadow', 'none');
      }
    },
    restore() {
      for (const [el, p, val, pri] of this.undo) { if (val) el.style.setProperty(p, val, pri); else el.style.removeProperty(p); }
      this.undo = [];
    },

    /* The cursor ring html2canvas cannot draw, taken from the live rect. */
    /* ONLY redraw a ring the element ACTUALLY HAS, at the width it actually
       has. Both halves were wrong and both showed: the ring was stroked 3px in
       the TARGET canvas, which is half-scale, so it came out at twice the
       game's 3 CSS px and read as a black band round the text; and it was
       stamped on the chooser rows too, which carry a real `border` in the
       player's colour that html2canvas draws correctly — so that ember border
       got an ink ring on top of it. Now the shadow is parsed off the live
       element (colour, spread, inset-or-not) and anything without an inset ring
       is left alone. Read BEFORE `neutralise`, which is why this is called
       outside it. */
    ringRects() {
      const out = [];
      for (const el of document.querySelectorAll('#panel-profile .cursor, #pane-cards .cursor')) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const cs = getComputedStyle(el);
        const bs = cs.boxShadow;
        if (!bs || bs === 'none' || bs.indexOf('inset') < 0) continue;
        const col = (bs.match(/rgba?\([^)]*\)/) || ['rgb(29,18,22)'])[0];
        const lens = (bs.replace(/rgba?\([^)]*\)/, '').match(/-?[\d.]+px/g) || []).map(parseFloat);
        const spread = Math.abs(lens[3] ?? 3) || 3;
        out.push({ r, rad: parseFloat(cs.borderRadius) || 0, col, w: spread });
      }
      return out;
    },
  };
  window.__dealer = dealer;

  window.__dealerSetup = async function () {
    /* `startPlay` does not land in the same tick — the world is built and the
       kittens seated over the next few frames. Awaiting it matters: calling
       `_unlockEndgame` too early raised no stall, and the next line then read
       `.group` off null. */
    if (g.state !== 'play') { g.introPlayed = true; g._trailerOfferDue = () => false; g.startPlay(); }
    for (let i = 0; i < 240 && g.state !== 'play'; i++) await sleep(25);
    while (g.partySize > 1) g._leavePlayer(g.partySize - 1);
    if (!g.kotodama.stall) g._unlockEndgame();
    for (let i = 0; i < 240 && !g.kotodama.stall; i++) await sleep(25);
    await raf();
    const s = g.kotodama.stall.group.position;
    return { stall: { x: +s.x.toFixed(2), y: +s.y.toFixed(2), z: +s.z.toFixed(2) } };
  };

  window.__dealerShot = async function (opts = {}) {
    const c = window.__cap, P = g.profile, INS = g.inspector, K = g.kotodama;
    const VW = opts.w ?? 640;                       // the game picture
    const VH = opts.h ?? Math.round(VW * innerHeight / innerWidth);
    const BAR = opts.bar ?? 46;                     // the caption's own strip
    const H = VH + BAR;
    const p = g.players[0];
    const s = K.stall.group.position;

    /* START FROM A CLOSED SCREEN. Re-running the script left the counter up
       from the last take, and because that panel covers the whole viewport the
       "walk to the stall" beats filmed the SHOP — every frame identical, which
       is what sent the last debugging session hunting for a missing animation
       that was never the problem. Close everything first, every time. */
    if (P.active) { try { P.close(); } catch (e) {} }
    try { INS.closeAll(); } catch (e) {}
    c.play(); c.solo(); c.bindKB();
    p.score = opts.score ?? 5200;
    p.setPowerOrbs([]);
    if (g.syncOrbMeshes) g.syncOrbMeshes(p);

    dealer.startMirror();
    dealer.hideChrome();
    drive.start();

    const tc = document.createElement('canvas'); tc.width = VW; tc.height = H;
    const tx = tc.getContext('2d', { willReadFrequently: true });
    const frames = [], delays = [];
    const sx = VW / innerWidth, sy = VH / innerHeight;

    /* --- the caption strip: its own band under the picture, never over it --- */
    /* THE CAPTION BAND IS PAPER, NOT A BLACK LETTERBOX. It started near-black
       and was reported straight back as "the black bars are back" — a dark
       strip under a picture reads as a video bar whatever it says. It takes the
       game's own paper and ink instead, with the pressed state in vermillion
       and a hairline of ink dividing it from the picture, so it reads as part
       of the game. It is still its OWN band rather than an overlay, which is
       the point: the panel's control line underneath must stay readable. */
    const drawBar = (text, hot) => {
      tx.save();
      tx.fillStyle = hot ? '#e0512c' : '#f2ddb4';
      tx.fillRect(0, VH, VW, BAR);
      tx.fillStyle = '#1d1216';
      tx.fillRect(0, VH, VW, 3);
      if (text) {
        tx.font = '600 20px Nunito, system-ui, sans-serif';
        tx.textAlign = 'center'; tx.textBaseline = 'middle';
        tx.fillStyle = hot ? '#fbeed2' : '#1d1216';
        tx.fillText(text, VW / 2, VH + BAR / 2 + 2);
      }
      tx.restore();
    };
    const drawBig = (big) => {
      if (!big) return;
      tx.save();
      const w = Math.min(VW - 60, 460), h = big.sub ? 116 : 82, x = (VW - w) / 2, y = (VH - h) / 2;
      tx.beginPath();
      if (tx.roundRect) tx.roundRect(x, y, w, h, 16); else tx.rect(x, y, w, h);
      tx.fillStyle = 'rgba(20,12,16,.92)'; tx.fill();
      tx.lineWidth = 4; tx.strokeStyle = big.tint || '#f5c341'; tx.stroke();
      tx.textAlign = 'center'; tx.textBaseline = 'middle';
      tx.fillStyle = big.tint || '#f5c341';
      tx.font = '700 34px Bangers, Nunito, system-ui, sans-serif';
      tx.fillText(big.title, VW / 2, y + (big.sub ? 42 : h / 2));
      if (big.sub) {
        tx.fillStyle = '#fbeed2';
        tx.font = '600 21px Nunito, system-ui, sans-serif';
        tx.fillText(big.sub, VW / 2, y + 84);
      }
      tx.restore();
    };
    const drawRings = (rects) => {
      tx.save();
      for (const { r, rad, col, w } of rects) {
        const lw = Math.max(1, w * sx);       // the game's px, in THIS canvas's scale
        tx.lineWidth = lw; tx.strokeStyle = col;
        const x = r.left * sx + lw / 2, y = r.top * sy + lw / 2;
        const ww = r.width * sx - lw, hh = r.height * sy - lw;
        tx.beginPath();
        if (tx.roundRect) tx.roundRect(x, y, ww, hh, Math.max(0, rad * sx - lw / 2)); else tx.rect(x, y, ww, hh);
        tx.stroke();
      }
      tx.restore();
    };

    /* Rasterise the DOM once. `null` when nothing is up, which is the case for
       the whole walk (HUD hidden, no panel) — the prompts over the stall are 3D
       and already in the mirror, so html2canvas can be skipped entirely there. */
    const rasterDOM = async () => {
      const up = document.querySelector('#panel-profile:not(.hidden), #pane-cards:not(.hidden)');
      if (!up) return null;
      if (P.active && P._paint) P._paint();
      await sleep(0);
      dealer.neutralise();
      try {
        return await window.html2canvas(document.body, {
          backgroundColor: null, scale: 1, logging: false, ignoreElements: (el) => el === glc,
        });
      } finally { dealer.restore(); }
    };

    const compose = (dom, rects, badge, hot, big) => {
      dealer.readGL();                        // fresh pixels, not the stale canvas
      tx.clearRect(0, 0, VW, H);
      tx.drawImage(dealer.mirror, 0, 0, dealer.mirror.width, dealer.mirror.height, 0, 0, VW, VH);
      if (dom) tx.drawImage(dom, 0, 0, dom.width, dom.height, 0, 0, VW, VH);
      if (rects && rects.length) drawRings(rects);
      drawBig(big);
      drawBar(badge, hot);
      frames.push(tx.getImageData(0, 0, VW, H).data.slice());
    };

    /* A beat at the counter: the game has frozen the world itself, so one frame
       that sits for `ms` is both honest and cheap. */
    const still = async (ms, badge = null, hot = false, big = null) => {
      drive.step(1 / 60);                     // refresh the mirror
      const dom = await rasterDOM();
      compose(dom, dealer.ringRects(), badge, hot, big);
      delays.push(ms);
    };

    /* A HELD BEAT WITH THE WORLD IN SHOT HAS TO KEEP MOVING.
       Measured first, so this is not decoration: with the kitten standing
       still, the scene is byte-identical frame to frame. There is no idle
       animation in this view and the orb constellation does not orbit on its
       own — the "orb spinning" in the last cut was the orb travelling WITH her,
       so the moment she stopped the picture was genuinely a still, which is
       exactly what read as a lag spike.

       Two things were tried and MEASURED NOT TO WORK before this one, so nobody
       repeats them: stepping the game's own loop (60fps, for seconds) leaves
       the frame byte-identical, and pushing the locked camera's yaw by 34
       degrees over 30 steps ALSO changes nothing — `__osFocus` does not steer
       this shot. Moving the kitten does; that is measured too. So the life in a
       held beat is her shifting her weight on her feet: a couple of centimetres
       and a few degrees, which is what standing at a counter looks like, rather
       than a frozen photograph. */
    let swayT = 0;
    let idleAt = null;                        // {x, z, facing} she is standing on
    const idle = () => {
      if (!idleAt) return;
      const x = idleAt.x + 0.05 * Math.sin(swayT * 1.6);
      const z = idleAt.z + 0.07 * Math.sin(swayT * 2.3);
      const h = g.world.heightAt && g.world.heightAt(x, z);
      p.position.set(x, (h && Number.isFinite(h.y)) ? h.y : p.position.y, z);
      p.group.position.copy(p.position);
      p.facing = idleAt.facing + 0.07 * Math.sin(swayT * 1.15);
    };

    const live = async (ms, badge = null, hot = false, step = null, fps = null) => {
      const f = fps ?? opts.fps ?? 8;         // enough to read as alive, cheap enough to ship
      const per = 1000 / f;
      const n = Math.max(1, Math.round(ms / per));
      const dom = await rasterDOM();          // the DOM does not change during a hold
      const rects = dealer.ringRects();
      for (let i = 0; i < n; i++) {
        swayT += per / 1000;
        if (step) step(i, n); else idle();     // a beat with no motion of its own still breathes
        drive.step(per / 1000);                // advance the WORLD by one frame's worth
        compose(dom, rects, badge, hot, null);
        delays.push(Math.round(per));
      }
    };

    c.lock(0, { dist: opts.dist ?? 9, pitch: opts.pitch ?? 0.62, yaw: 0, centreFn: () => (s.clone ? s.clone() : s) });

    // ==================== 1. walk up (live) ====================
    const ox = opts.ox ?? 0, ozFar = opts.ozFar ?? 12, ozNear = opts.ozNear ?? 5.5;
    const groundY = (x, z) => { const h = g.world.heightAt && g.world.heightAt(x, z); return (h && Number.isFinite(h.y)) ? h.y : p.position.y; };
    const stand = (x, z) => { p.position.set(x, groundY(x, z), z); p.group.position.copy(p.position); p.facing = Math.atan2(s.x - x, s.z - z); };
    stand(s.x + ox, s.z + ozFar);
    const WALK = opts.walkMs ?? 2200;
    await live(WALK, 'walk up to the stall  —  WASD', false, (i, n) => {
      const t = n > 1 ? i / (n - 1) : 1;
      stand(s.x + ox, s.z + ozFar + (ozNear - ozFar) * t);
    }, opts.walkFps ?? 10);
    stand(s.x + ox, s.z + ozNear);
    idleAt = { x: s.x + ox, z: s.z + ozNear, facing: p.facing };
    await live(250, 'walk up to the stall  —  WASD');      // stand a beat before the menu

    // ==================== 2. ask the dealer (live) ====================
    INS.open(0);
    drive.step(1 / 60);
    await live(2400, 'press  INTERACT  at the stall', true);
    INS.cards[0].i = 0;
    await live(2400, 'JUMP  —  choose TRADE', true);
    INS._choose(0);
    drive.step(1 / 60);

    // ==================== 3. the shelf (still: the counter freezes) ==========
    const target = opts.row ?? 2;                 // 0 GALE 1 LONG CUT 2 ADAMANT
    P.sides[0].i = 0;
    await still(2300, 'the dealer’s shelf');
    for (let r = 1; r <= target; r++) {
      P.sides[0].i = r;
      g.audio?.play('menu');
      await still(1500, 'scroll  ▼');
    }
    await still(1700, 'scroll  ▼');

    // ==================== 4. buy ====================
    const name = 'ADAMANT';
    P._buyHere(0);
    await still(2600, 'JUMP  —  buy', true);
    P._answerHere(0, true);
    await still(2200, null);
    await still(4000, null, false, { title: `BOUGHT ${name}`, sub: `−${K.price} points · now 1 / 8 in her slots`, tint: '#8ce87a' });
    await still(2500, 'bought — and worn straight away');

    // ==================== 5. sell it back ====================
    P.sides[0].i = target;
    await still(2300, 'ATTACK  —  sell', true);
    P._sellHere(0);
    await still(2600, 'JUMP  —  yes, sell it', true);
    P._answerHere(0, true);
    await still(2200, null);
    await still(5000, null, false, { title: `SOLD ${name}`, sub: `+${K.sellPrice} points · back to 0 / 8`, tint: '#ffc65c' });
    await still(4000, 'sell to free a slot when all eight are full');

    drive.stop(); dealer.stopMirror(); dealer.showChrome();
    window.__dealerFrames = { frames, delays, w: VW, h: H };
    return `dealer: ${frames.length} frames, ${(delays.reduce((a, b) => a + b, 0) / 1000).toFixed(1)}s at ${VW}x${H}`;
  };

  window.__encodeDealer = async function ({ colors = 128 } = {}) {
    const S = 'http://localhost:7799', f = window.__dealerFrames;
    await fetch(`${S}/gif/begin?name=dealer&w=${f.w}&h=${f.h}`);
    for (const fr of f.frames) await fetch(`${S}/gif/frame?name=dealer`, { method: 'POST', body: fr });
    const r = await fetch(`${S}/gif/end?name=dealer&colors=${colors}&dither=0`, {
      method: 'POST', body: JSON.stringify({ delays: f.delays }),
    });
    return await r.json();
  };

  return 'dealer-shot v4 ready';
})();
