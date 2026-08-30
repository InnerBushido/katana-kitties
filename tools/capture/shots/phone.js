/* "On a phone" — the topic that had no picture at all.
   =======================================================================
   Move, jump, slash, hold RUN, DOUBLE-TAP to lock RUN on, charge with the one
   thumb that is left, then the same trick on the shield: hold RIDE, or
   double-tap it and let go. Filmed on the tournament deck, one kitten, the real
   touch overlay driven by real pointer events.

   THE OVERLAY IS DOM, AND `readPixels` CANNOT SEE IT. That is the whole reason
   this file is different from the other shot scripts: the frame that comes off
   the framebuffer has the kitten in it and nothing else, and a clip about the
   phone controls with no controls in it is not a clip. So the overlay is drawn
   onto the frame AFTER the game — but MEASURED off the live one, never invented:
   every circle is a `getBoundingClientRect()` on the real button, every colour,
   border, shadow, font and opacity is `getComputedStyle` on the real element,
   and the glyph and the label are the strings the element is actually carrying
   this frame. So when `_updateTouchContext` renames RIDE to SHIELD, or the
   double-tap latch adds `.locked` and the CSS turns it gold, the picture changes
   because THE GAME changed it. A hand-drawn replica would have been half the
   code and would have started lying the first time a label moved.

   AND IT IS DRIVEN BY REAL POINTERS, for the same reason. `TouchPad._down`
   reads `e.target.closest('.tp-btn')`, stamps `performance.now()` and runs the
   double-tap latch itself; `PadState.doubled` stamps its own gap the same way.
   Synthesizing keys instead would have lit nothing and latched nothing — the
   two things this clip exists to show. Every tap below is a `PointerEvent`
   dispatched at the real element, so the latch that goes gold on screen is the
   latch a thumb would have set.

   THE THUMBS ARE DRAWN, because nothing else in the frame says where the hand
   is. A button that lights on its own reads as the game doing it; a pale disc
   sitting on the button reads as somebody pressing it, and the moment the disc
   LIFTS OFF a button that stays gold is the entire lesson of the lock.

   THE PHONE IS A REAL PHONE SIZE. The tab is emulated at 812x375 — an iPhone-X
   class landscape viewport — so `@media (max-height: 460px)` fires and
   `--tp-unit` is the 68px a phone actually gets, not the 84px a desktop test
   window gets. The cluster is then placed by `TouchPad._placeCluster` off that,
   which is why the geometry here is read and not written down. The master is
   936x432 because 812x375 is 2.165:1 and 936x432 is 2.167:1 — the same picture,
   filmed big. Published at 512 it lands 512x280: 236 of game and the same 44px
   caption strip the other four Help clips carry, so the strip's type is the
   same size on the page as theirs.

   NO TOURNAMENT, BUT THE ARENA IS OPEN. `world.arenaOpen` is false until the
   girls fly out there and a shut arena HAS NO GROUND (see the note in
   fight-shot.js, and world.js at length) — so the deck has to be opened or the
   kitten falls through an orange sky. The ROUND is deliberately not started:
   `Game._updateTouchContext` blanks the RIDE label to an em-dash while
   `tournament.active`, because in a live round there is nothing to ride — and
   the shield demo needs that button to say SHIELD. Deck yes, round no.

   Call: eval this, then `await window.__phoneShot()`, then
   `await window.__encodePh('phone', { w: 512 })`. */
(() => {
  const g = window.game, c = window.__cap, K = window.__mk;
  const V3 = g.players[0].position.constructor;

  /* Film big, publish small — same bargain as the other two shot scripts. The
     capture is the expensive, unrepeatable half; the encode is cheap and pure. */
  const VW = 936, VH = 432, CAP = 80, OH = VH + CAP;

  const YAW = -Math.PI * 0.25;
  const R = { x: Math.cos(YAW), z: -Math.sin(YAW) };   // screen-right, no depth

  /* ------------------------------------------------------- pointer plumbing */
  /* Our own book of live pointers: the id we dispatched, where it is, and what
     it is holding. It is OURS and not the pad's because the pad only keeps what
     it needs (`_active` maps id -> {kind, action}) and the thumb discs need the
     coordinates back. */
  const P = new Map();
  let PID = 9000;
  const ev = (type, id, x, y) => new PointerEvent(type, {
    pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true,
    isPrimary: P.size <= 1, pointerType: 'touch', button: 0, buttons: 1,
  });
  const down = (el, x, y, tag) => {
    const id = ++PID;
    P.set(id, { x, y, tag });
    el.dispatchEvent(ev('pointerdown', id, x, y));
    return id;
  };
  const move = (id, x, y) => {
    const p = P.get(id); if (!p) return;
    p.x = x; p.y = y;
    window.dispatchEvent(ev('pointermove', id, x, y));
  };
  const up = (id) => {
    const p = P.get(id); if (!p) return;
    window.dispatchEvent(ev('pointerup', id, p.x, p.y));
    P.delete(id);
  };
  const upAll = () => { for (const id of [...P.keys()]) up(id); };

  const tp = () => g.touchPad;
  const btnEl = (a) => tp().buttons.get(a);
  const centre = (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };

  /* --- the two gestures, as gestures --- */
  let stickId = null, stickBase = null;
  const stickOn = () => {
    if (stickId != null) return;
    /* PRESSED AT THE BASE'S OWN RESTING CENTRE, so `_placeStick` puts it back
       exactly where it already is and the base does not jump on contact. Read
       off the element rather than recomputed from STICK_REST_*: the resting spot
       is `_parkStick`'s to decide and it measures the zone. */
    stickBase = centre(tp().stick);
    stickId = down(tp().zone, stickBase.x, stickBase.y, 'stick');
  };
  /* dx,dy are SCREEN units, -1..1, y down — the same axes `_moveStick` reads.
     46 is STICK_RADIUS, which is also the base's own radius, so full deflection
     puts the thumb on the rim where a thumb would be. */
  const stick = (dx, dy) => {
    stickOn();
    move(stickId, stickBase.x + dx * 46, stickBase.y + dy * 46);
  };
  const stickOff = () => { if (stickId != null) { up(stickId); stickId = null; } };

  const held = new Map();   // action -> pointer id
  const press = (a) => {
    if (held.has(a)) return;
    const el = btnEl(a), p = centre(el);
    held.set(a, down(el, p.x, p.y, a));
  };
  const release = (a) => { const id = held.get(a); if (id != null) { up(id); held.delete(a); } };

  /* ------------------------------------------------------- the replica ---- */
  /* Everything below is READ. The only numbers written down are where the thumb
     disc is drawn, because there is no element for a thumb. */
  const num = (s) => parseFloat(s) || 0;
  /* `box-shadow` computed is "rgb(r,g,b) Xpx Ypx Bpx Spx", possibly a comma
     list — the locked button carries two, and the second one is the gold ring
     that says it is latched. Split on commas that are not inside rgb(). */
  const shadows = (css) => (css === 'none' ? [] : css.split(/,(?![^(]*\))/).map((s) => {
    const col = (s.match(/rgba?\([^)]*\)/) || ['#000'])[0];
    const n = (s.replace(/rgba?\([^)]*\)/, '').match(/-?[\d.]+px/g) || []).map(num);
    return { col, dx: n[0] || 0, dy: n[1] || 0, blur: n[2] || 0, spread: n[3] || 0 };
  }));

  function replica(tx) {
    const glc = g.renderer.domElement, r = glc.getBoundingClientRect();
    const SX = VW / r.width, SY = VH / r.height;
    const px = (x) => (x - r.left) * SX, py = (y) => (y - r.top) * SY;
    const root = document.getElementById('touch-pad');
    if (!root || root.classList.contains('hidden')) return;

    const disc = (cx, cy, rad, fill, strokeCol, strokeW) => {
      tx.beginPath(); tx.arc(cx, cy, Math.max(0.5, rad), 0, Math.PI * 2);
      if (fill) { tx.fillStyle = fill; tx.fill(); }
      if (strokeW > 0) { tx.lineWidth = strokeW; tx.strokeStyle = strokeCol; tx.stroke(); }
    };
    /* One circular element, shadows first, then body, then its own text nodes —
       each text node placed in ITS measured box, because the button is a flex
       column and reproducing flex by hand is exactly the kind of reasoning the
       house rule says loses. */
    const circle = (el) => {
      const b = el.getBoundingClientRect();
      if (!b.width) return;
      const cs = getComputedStyle(el);
      const op = num(cs.opacity) || 1;
      const cx = px(b.x + b.width / 2), cy = py(b.y + b.height / 2);
      const bw = num(cs.borderTopWidth) * SX;
      const rad = (b.width / 2) * SX - bw / 2;
      tx.save();
      tx.globalAlpha = op;
      for (const s of shadows(cs.boxShadow)) {
        disc(cx + s.dx * SX, cy + s.dy * SY, rad + s.spread * SX + bw / 2, s.col, null, 0);
      }
      disc(cx, cy, rad, cs.backgroundColor, cs.borderTopColor, bw);
      for (const t of el.children) {
        const tb = t.getBoundingClientRect();
        if (!tb.width) continue;
        const ts = getComputedStyle(t);
        tx.globalAlpha = op * (num(ts.opacity) || 1);
        tx.fillStyle = ts.color;
        tx.font = `${ts.fontWeight} ${num(ts.fontSize) * SY}px ${ts.fontFamily}`;
        tx.textAlign = 'center';
        tx.textBaseline = 'middle';
        /* Tracked by hand because canvas has no letter-spacing and the labels
           are set with it — 0.6px on an 9px label is visible at this scale. */
        const track = num(ts.letterSpacing) * SX;
        const chars = [...t.textContent];
        if (track) {
          const w = chars.map((ch) => tx.measureText(ch).width);
          let x = px(tb.x + tb.width / 2) - (w.reduce((a, v) => a + v, 0) + track * (chars.length - 1)) / 2;
          tx.textAlign = 'left';
          for (let i = 0; i < chars.length; i++) { tx.fillText(chars[i], x, py(tb.y + tb.height / 2)); x += w[i] + track; }
        } else {
          tx.fillText(t.textContent, px(tb.x + tb.width / 2), py(tb.y + tb.height / 2));
        }
      }
      tx.restore();
    };

    circle(tp().stick);
    circle(tp().knob);
    for (const [, el] of tp().buttons) circle(el);

    /* THE THUMBS. Nothing in the DOM says where the hand is, and without them a
       button that lights looks like the game pressing itself — while a disc that
       LIFTS OFF a button which stays gold is the whole lesson of the lock.
       A RING, NOT A LID. The first pass drew a filled circle the size of the
       button with a dot in the middle, and it covered the glyph and most of the
       word under it: the frame said a thumb was somewhere without saying on
       what. The ring is the same size as the fingertip and the fill is faint
       enough to read SHIELD straight through. */
    for (const [, p] of P) {
      const cx = px(p.x), cy = py(p.y), rad = 25 * SX;
      disc(cx, cy, rad, 'rgba(251,238,210,0.13)', null, 0);
      disc(cx, cy, rad, null, 'rgba(251,238,210,0.95)', 4 * SX);
      disc(cx, cy, rad, null, 'rgba(29,18,22,0.45)', 1.2 * SX);
    }
  }

  /* ------------------------------------------------------------------ rig */
  function rig() {
    const canvas = document.createElement('canvas');
    canvas.width = VW; canvas.height = OH;
    const tx = canvas.getContext('2d', { willReadFrequently: true });
    const frames = [], delays = [];

    let SHOT = null;
    const place = () => {
      if (!SHOT) return;
      g.groups = [g.players.map((_, i) => i)];
      g.merged = true;
      /* EVERY CAMERA `_cameraFor` COULD HAND BACK, AND THAT IS NOT BELT AND
         BRACES — IT IS THE BUG THIS SHOT SPENT FOUR TAKES ON.

           _cameraFor(members) {
             if (members.length === 1) return this.players[members[0]].camera;
             return this.rigs[members[0]].camera;
           }

         A group of ONE is drawn through the PLAYER'S own camera; only a group
         of two or more is drawn through the rig. Both the other shot scripts
         film two kittens, so pinning `rigs[0].camera` was enough and the rule
         was never noticed. This clip is one kitten on a phone — so the pin was
         landing on a camera nothing rendered, the follow camera drew every
         frame, and the take came back with the deck sliding about underneath
         her. It read as the arena drifting, which is what sent the hunt to
         `openArena` and the island meshes; the camera was reported as pinned
         by every probe, because the pinned one really was pinned. It was just
         not the one drawing.
         Pinning all of them costs a handful of `lookAt`s and cannot be wrong
         whichever branch the grouping takes. */
      const C = SHOT.centre, cp = Math.cos(SHOT.pitch);
      const pos = [
        C.x + Math.sin(YAW) * cp * SHOT.dist,
        C.y + Math.sin(SHOT.pitch) * SHOT.dist,
        C.z + Math.cos(YAW) * cp * SHOT.dist,
      ];
      for (const cam of [g.rigs[0]?.camera, ...g.players.map((w) => w.camera)]) {
        if (!cam) continue;
        cam.position.set(pos[0], pos[1], pos[2]);
        cam.lookAt(C);
      }
    };
    if (!g.__osRender) {
      g.__osRender = g._render.bind(g);
      g._render = () => { if (g.__pin) g.__pin(); g.__osRender(); };
    }
    g.__pin = place;
    const stage = (cen, dist, pitch) => { SHOT = { centre: cen, dist, pitch }; place(); };

    /* The caption strip, the same one the other four clips carry, scaled: 936 is
       768 x 1.219, so 66 -> 80, 24px -> 29px, 3.6 track -> 4.4. At 512 published
       that lands on 44px and 16px, which is what they publish at. */
    let CAPTION = '', HOT = false;
    const strip = () => {
      tx.fillStyle = K.ink; tx.fillRect(0, VH - 6, VW, 6);
      tx.fillStyle = HOT ? K.vermillion : K.paper2;
      tx.fillRect(0, VH, VW, CAP);
      if (!CAPTION) return;
      tx.save();
      tx.font = '700 29px Nunito, system-ui, sans-serif';
      tx.textAlign = 'left';
      tx.textBaseline = 'middle';
      const TRACK = 4.4, chars = [...CAPTION];
      const wid = chars.map((ch) => tx.measureText(ch).width);
      const tw = wid.reduce((a, b) => a + b, 0) + TRACK * (chars.length - 1);
      tx.fillStyle = HOT ? K.paper : K.ink;
      let x = (VW - tw) / 2;
      for (let i = 0; i < chars.length; i++) { tx.fillText(chars[i], x, VH + CAP / 2 + 1); x += wid[i] + TRACK; }
      tx.restore();
    };

    const draw = () => {
      K.readGL();
      tx.drawImage(K.mirror, 0, 0, K.mirror.width, K.mirror.height, 0, 0, VW, VH);
      replica(tx);
      strip();
      frames.push(tx.getImageData(0, 0, VW, OH).data.slice());
      /* A per-frame trace, for looking at a take without dumping pictures of
         it: where she is along screen-right, what the pad is holding, and what
         is latched. Costs nothing and answers most questions about a bad beat. */
      const q = g.players[0], rg2 = g.world.arenaRing;
      window.__phTrace.push([frames.length - 1,
        +((q.position.x - rg2.x) * R.x + (q.position.z - rg2.z) * R.z).toFixed(1),
        +q.chargeT.toFixed(2), q.wardOn ? 1 : 0,
        [...g.touchPad._locked].join('+'),
        Object.keys(g.touchPad._held).filter((k) => g.touchPad._held[k]).join('+')]);
    };

    const run = async (ms, plan, { hold = 0, fps = 16, cap = null, hot = false } = {}) => {
      if (cap != null) { CAPTION = cap; HOT = hot; }
      const per = 1000 / fps, n = Math.max(1, Math.round(ms / per));
      for (let i = 0; i < n; i++) {
        if (plan) plan(i, n);
        K.drive.step(per / 1000, Math.max(2, Math.round(per / 12)));
        draw();
        delays.push(Math.round(per) + (hold && i === n - 1 ? hold : 0));
      }
    };
    const linger = (ms, o = {}) => run(ms, null, { hold: 200, fps: 11, ...o });
    return { tx, frames, delays, stage, run, linger, place };
  }

  /* --------------------------------------------------------------- the shot */
  window.__phoneShot = async function () {
    const p = g.players[0];
    c.play();
    upAll(); held.clear(); stickId = null;

    /* THE DOUBLE-TAP WINDOW IS WALL-CLOCK TIME, AND A CAPTURE DOES NOT RUN AT
       WALL-CLOCK SPEED. This cost a whole take. `TouchPad._down` and
       `PadState._stamp` both measure with `performance.now()`, and one captured
       frame costs about 11ms of real time while standing for 62.5ms of clip —
       so two taps that are a second and a half apart on screen are a quarter of
       a second apart in reality, and the pad reads them as one double tap. The
       take came back with the RUN button un-latching itself: the hold in beat 5
       and the first tap of beat 6 paired up, latched, and then beat 6's second
       tap undid it.
       `settle` is a REAL sleep between beats. It costs nothing in the clip —
       every frame is already captured — and it is the honest fix, because what
       it restores is the gap a thumb would actually have left. */
    const settle = () => K.sleep(420);
    /* And a clean pad, so a take cannot inherit the last one's latches. */
    g.touchPad._releaseAll();
    g.touchPad._lastTap.clear();

    /* PHONE MODE, MUTATED RATHER THAN REBOOTED. `writeOverride('mobile')` is the
       supported desktop test switch and it is the honest one — but it only takes
       on a reload, and a reload takes the capture harness with it. The two facts
       the overlay depends on are `touchPrimary` (the layout, `body.touch-ui`)
       and `padOn` (whether the pad is drawn and dealt a slot); everything else
       `profileFor` decides is boot-only spend — antialias, the atlas budget —
       and none of it is in this picture. */
    g.device.touchPrimary = true;
    g.device.padOn = true;
    g._applyTouchMode();

    /* KILL THE BUTTONS' TRANSITION FOR THE TAKE, AND THIS ONE COST TWO TAKES.
       `.tp-btn` carries `transition: transform .09s, box-shadow .09s,
       background .09s` — ninety milliseconds of ease so a press does not snap,
       which is right on a phone and fatal here. The replica reads
       `getComputedStyle`, and a computed value DURING a transition is the
       interpolated one; a transition only advances when the browser gets a
       frame, and a capture beat is one synchronous loop with no rAF in it. So
       the clock the ease runs on never moved, every frame of the beat read the
       value the button had BEFORE the press, and the gold on a latched RUN was
       never drawn once — while a MutationObserver watching the same element
       showed `.locked` going on and coming off exactly when it should. The
       state was right and the picture was of the frame before it.
       Reverted at the end of the take: this is a capture artefact, not a
       preference about how the game should feel. */
    const noEase = document.createElement('style');
    noEase.textContent = '#touch-pad .tp-btn, #touch-pad .tp-stick, #touch-pad .tp-knob'
      + ' { transition: none !important; }';
    document.head.appendChild(noEase);

    K.hideChrome();
    /* ...but NOT the pad. `hideChrome` takes `#touch-pad` down with the HUD,
       which is right for every other clip and exactly wrong for this one: the
       replica measures the live elements, and a `display:none` overlay measures
       zero on every rect. */
    document.getElementById('touch-pad').classList.remove('hidden');
    for (const id of ['announce', 'arena-hud', 'arena-banner', 'arena-result']) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    }
    K.startMirror();

    for (const w of g.players) {
      w.mount = null; w.rideAlong = null; w.pandaMount = null;
      w.flySide = 0; w.dismountEase = 0; w.velocity.set(0, 0, 0);
      w.wardOn = false; w.wardHold = false; w.wardUsed = 0; w.wardCool = 0; w.wardRegrab = 0;
      w.chargeT = 0; w.chargeLeft = 0; w.attackCooldown = 0;
    }
    g.starShot = null;

    /* THE TWO ABILITIES THE CLIP IS ABOUT, AND NOT THE OTHER SIX. `3` wears
       all eight, which was the first take and cost twice: eight orbs draw eight
       icons in a constellation around her, which is clutter in a frame already
       carrying a whole control overlay — and one of the eight is Swift, whose
       1.22x put her sprint at nineteen units a second and sent her clean off the
       deck inside one beat. Two orbs, two icons, the shipped speed.
       `syncOrbMeshes` because `setPowerOrbs` is the truth about what she is
       WEARING and the constellation is rebuilt from it, not by it. */
    p.setPowerOrbs(['ward', 'charge']);
    g.syncOrbMeshes?.(p);

    const wasOpen = g.world.arenaOpen;
    g.world.openArena(true);

    window.__phTrace = [];
    const rg = rig();
    const { run, linger, stage } = rg;

    const ring = g.world.arenaRing;
    const mark = (d) => ({ x: ring.x + R.x * d, z: ring.z + R.z * d });
    const faceR = Math.atan2(R.x, R.z);
    const START = mark(-9);
    K.place(0, START.x, START.z, faceR, ring.y);
    K.seed();

    /* THE AIM POINT IS ON THE DECK, AND THE WHOLE COMPOSITION FALLS OUT OF IT.
       Measured, not chosen by eye: the overlay owns the bottom half of the frame
       — the cluster runs from 196 to 329 of 375 and the stick from 218 to 310 —
       so nothing may stand below about 52% of the height. Aiming at the deck
       puts her FEET at the centre of the frame and her whole body above it, in
       the empty top half. The first take lifted the aim point to 6.2 to "get her
       up the frame" and did the exact opposite: a camera looks at what you aim
       it at, so raising the target lowered the kitten, and she spent the clip
       standing behind the JUMP button.
       AND MOVING ALONG `R` DOES NOT CHANGE THAT. `R` is screen-right at the
       camera's own yaw, so it is perpendicular to the view: she can cross the
       whole width of the frame without her depth, her size or her height on
       screen moving at all. Every horizontal budget below is spent freely
       because of that; only the beat that pushes the stick INTO the screen costs
       anything vertically, and it is short. */
    /* TWENTY, NOT EIGHTEEN, AND THE CHARGE IS THE REASON. `power.charge.dist`
       is a flat 16 units and she coasts a unit or two out of it, so the move
       needs about eighteen units of frame all by itself; at 18 the camera held
       nine either side and she finished it off the right-hand edge. At 20 it
       holds about ten, which is the whole move with a unit to spare, and she is
       barely smaller for it. */
    stage(new V3(ring.x, ring.y + 0.5, ring.z), 20, 0.34);
    for (let i = 0; i < 24; i++) K.drive.step(1 / 60, 1);

    K.drive.start();

    /* EVERY DURATION BELOW IS A DISTANCE, and the two numbers are measured:
       she walks at 10.0 units a second and sprints at 15.6. The frame holds
       about nine units either side of the middle at this distance, and the
       charge is a flat 16 (`power.charge.dist`) — so the charge alone is most of
       the width, which is why she is walked to the left-hand side before it and
       why the locked-sprint beat is a loop out and back rather than a line. A
       sprint held "for about two seconds" is thirty-one units and ends off the
       deck; the first take did exactly that. */

    /* 1 — the overlay, at rest. Nothing happens; the frame is the message. */
    await linger(1300, { cap: 'ON A PHONE IT IS ALL THUMBS' });

    /* 2 — MOVE. The base goes where the thumb lands and the knob follows it;
       both are real elements, so what is drawn is what the game is reading. One
       push INTO the screen as well as the two across it, because the stick is a
       full circle and a demo that only ever goes left and right does not say so.
       Short, though: depth is the one direction that changes her size. */
    await run(2300, (i, n) => {
      const t = i / n;
      if (t < 0.30) stick(1, 0);
      else if (t < 0.55) stick(0, -1);
      else if (t < 0.85) stick(-1, 0);
      else if (i === n - 4) stickOff();
    }, { cap: 'MOVE — DRAG THE STICK' });

    /* 3 — JUMP. HELD SIX FRAMES, NOT TWO, for the reason the ring clip found:
       the game reads the press EDGE, so two frames is a real jump — and two
       frames of a lit button at sixteen a second is an eighth of a second, which
       leaves a kitten in the air over a dark button. */
    await run(1500, (i) => {
      if (i === 3) press('jump');
      if (i === 9) release('jump');
    }, { cap: 'JUMP — TAP IT', hold: 100 });

    /* 4 — SLASH. */
    await run(1500, (i) => {
      if (i === 3) press('attack');
      if (i === 9) release('attack');
    }, { cap: 'SLASH — TAP IT', hold: 100 });

    await settle();
    /* 5 — RUN, HELD, AND HELD FOR THE WHOLE BEAT. The first take pressed it for
       seven frames and let go, because seven frames of sprinting is as far right
       as she can go — so the caption said "hold it down" over a beat that spent
       two thirds of itself with the button up and no thumb on it. The distance
       is what has to give, not the hold: she runs out and comes back, and the
       button is lit and under a thumb from the second frame to the last. The
       strip goes hot for the same reason the caption exists — a picture of a
       button can show that it is DOWN and not that it is being HELD. */
    await run(1900, (i, n) => {
      if (i === 1) { stick(1, 0); press('sprint'); }
      if (i === 9) stick(-1, 0);
      if (i === 19) stickOff();
      if (i === n - 2) release('sprint');
    }, { cap: 'RUN — HOLD IT DOWN', hot: true });

    await settle();
    /* 6 — DOUBLE TAP, AND THEN THE THUMB COMES OFF. Two presses one frame
       apart: `TouchPad._down` stamps `performance.now()` and latches on a second
       tap inside DOUBLE_TAP_MS (340), and a capture frame costs far less than
       that in real time — but each press still has to survive one
       `input.update()` to be an edge at all, which is why they are a frame apart
       and not in the same one. The button goes gold on the second, the disc
       LIFTS, and she keeps running: that is the beat this clip exists for.
       SHE RUNS A LOOP, NOT A LINE. Sixteen frames of locked sprint is twenty-two
       units and the frame holds nine, so the stick sweeps right -> away -> left
       and she comes back the way she went. It is also the better picture of what
       the lock IS: the only thumb still on the glass is the one steering. */
    await run(2800, (i) => {
      if (i === 0) stick(1, 0);
      if (i === 1) press('sprint');
      if (i === 2) release('sprint');
      if (i === 3) press('sprint');
      if (i === 5) release('sprint');            // latched: it stays down
      /* OUT, STOP, AND BACK — and the STOP is the important third of it. With
         the stick let go as well, the frame has a gold button and no thumb on
         the glass at all, which is the plainest possible statement that the
         lock is a thing the game is holding for her. Then the stick alone
         starts her sprinting again, and nothing was pressed to do it.
         The distances are the frame's, and they are MEASURED off a take rather
         than derived: a locked sprint moves her 1.03 units a capture frame once
         the coast at the end is counted in, and the picture holds about ten
         units either side of the middle. Nine frames out, a long stop, then
         thirteen back — which parks her hard against the left-hand side with
         the whole width in front of her, because the charge in the next beat
         is seventeen units long and there is nowhere else to put it. */
      if (i === 9) stickOff();
      if (i === 25) stick(-1, 0);
      if (i === 38) stickOff();
    }, { cap: 'DOUBLE-TAP TO LOCK IT ON' });

    /* 7 — CHARGE, on one thumb. RUN is latched, so the only thumb on the glass
       is the one steering — and `sprinting` is `pad.down('sprint') && moving`,
       which is now true with nobody holding the trigger. A tap on SLASH in that
       state is the charge, and it goes where she FACES (`_startCharge` takes the
       direction once, at the press) — which is why the stick is swung back to
       screen-right first and the press waits for it. ACROSS the frame and not
       into it: the ask was to see the kitten, not her back. */
    /* THE PRESS IS TRIGGERED BY WHERE SHE IS, NOT BY A FRAME NUMBER, and that
       is the same repair the ring clip's landed slash needed. She arrives at
       this beat running LEFT, so the stick has to turn her round first and how
       long that takes is a deceleration curve, not a constant — the take that
       pressed on frame 7 caught her still skidding and threw the charge into
       the corner she came from. Asked as a question instead: is she pointed
       across the frame, and is there room in front of her for sixteen units?
       The `i >= 3` floor is only so the stick has been read at least once, and
       the `i === 12` fallback is the house rule about degrading rather than
       vanishing — a beat that never fires is a beat with nothing in it. */
    let fired = 0;
    await run(2200, (i) => {
      if (i === 0) stick(1, 0);
      const along = (p.position.x - ring.x) * R.x + (p.position.z - ring.z) * R.z;
      const off = Math.atan2(Math.sin(p.facing - faceR), Math.cos(p.facing - faceR));
      /* ONE FRAME IS ALL THE TURN COSTS — measured, and it is why this fires so
         early. `facing` snaps to the stick on the tick after it moves, so `off`
         is zero from frame one; what is NOT instant is her VELOCITY, and while
         it comes round she is still travelling at sprint speed. The take that
         waited for `along < -7` missed the window by two tenths of a unit,
         fell through to the fallback nine frames later, and threw the charge
         from the middle of the frame clean off the right-hand edge. */
      if (!fired && ((i >= 1 && Math.abs(off) < 0.3 && along < -6) || i === 8)) {
        press('attack');
        fired = i;
      }
      if (fired && i === fired + 5) release('attack');
      if (fired && i === fired + 11) stickOff();  // let her coast to a stop
    }, { cap: 'NOW ONE THUMB DOES BOTH', hold: 140 });

    await settle();
    /* 8 — AND A THIRD TAP LETS IT GO. Short, and it has to be there: a lock
       nobody is shown undoing is a control that looks stuck. She walks back
       towards the middle on the way, at walking pace, because the lock is off. */
    await run(1500, (i) => {
      if (i === 2) press('sprint');
      if (i === 5) release('sprint');
      if (i === 6) stick(-1, 0);
      if (i === 18) stickOff();
    }, { cap: 'TAP AGAIN TO LET IT GO' });

    await settle();
    /* 9 — SHIELD, held. The button says SHIELD because `_updateTouchContext`
       renamed it: the orb is worn and there is no round running. */
    await run(1900, (i, n) => {
      if (i === 2) press('mount');
      if (i === n - 3) release('mount');
    }, { cap: 'SHIELD — HOLD RIDE', hot: true });

    await settle();
    /* 10 — OR DOUBLE-TAP IT AND LET GO. `_latchWard` needs either a bubble
       already up or a release inside `WARD.regrab`, so a double tap from rest is
       exactly: press (bubble up), release (regrab armed), press (latched) — the
       same three events the pad's own latch reads, both fired by the one
       gesture. Popping fresh also resets `wardUsed`, so the latched block gets
       very nearly the whole two seconds rather than the remainder of beat 9's.
       WAITED FOR, THOUGH: `_dropWard` charges WARD.cool (1.5s) on the release
       above and `_popWard` refuses while it runs, so the first press here is
       deliberately late in a long beat rather than on frame 2. */
    await run(3400, (i) => {
      if (i === 28) press('mount');
      if (i === 29) release('mount');
      if (i === 30) press('mount');
      if (i === 32) release('mount');            // latched: bubble stays, thumb off
    }, { cap: 'OR DOUBLE-TAP AND LET GO' });

    /* 11 — AND IT LETS ITSELF GO. The shield is capped at two seconds, and when
       it runs out `_updateTouchContext` releases the latch, so the gold goes out
       on its own. Filmed rather than captioned away: a latch that ends by itself
       is the one thing a reader would otherwise take for a bug. */
    await linger(2000, { cap: 'THE SHIELD LASTS TWO SECONDS' });
    await linger(900, { cap: '' });

    upAll(); held.clear(); stickId = null;
    K.drive.stop();
    noEase.remove();
    K.showChrome();
    if (!wasOpen) g.world.openArena(false);

    window.__phFrames = { frames: rg.frames, delays: rg.delays, w: VW, h: OH };
    return { frames: rg.frames.length, ms: rg.delays.reduce((a, b) => a + b, 0) };
  };

  /* -------------------------------------------------------------- encoding */
  window.__encodePh = async function (name, { w = 512, colors = 256, every = 1 } = {}) {
    const S = 'http://localhost:7799', f = window.__phFrames;
    if (!f) return 'nothing filmed';
    const OW = w, OHo = Math.round(w * f.h / f.w);
    const src = document.createElement('canvas'); src.width = f.w; src.height = f.h;
    const sx = src.getContext('2d');
    const dst = document.createElement('canvas'); dst.width = OW; dst.height = OHo;
    const dx = dst.getContext('2d', { willReadFrequently: true });
    dx.imageSmoothingEnabled = true; dx.imageSmoothingQuality = 'high';

    await fetch(`${S}/gif/begin?name=${name}&w=${OW}&h=${OHo}`);
    const out = [];
    for (let i = 0; i < f.frames.length; i += every) {
      let ms = 0;
      for (let k = i; k < Math.min(f.frames.length, i + every); k++) ms += f.delays[k];
      out.push(ms);
      sx.putImageData(new ImageData(new Uint8ClampedArray(f.frames[i]), f.w, f.h), 0, 0);
      dx.drawImage(src, 0, 0, f.w, f.h, 0, 0, OW, OHo);
      await fetch(`${S}/gif/frame?name=${name}`, { method: 'POST', body: dx.getImageData(0, 0, OW, OHo).data });
    }
    const r = await fetch(`${S}/gif/end?name=${name}&colors=${colors}&dither=0`,
      { method: 'POST', body: JSON.stringify({ delays: out }) });
    return await r.json();
  };

  /* A handful of master frames as PNGs, for looking at before spending an
     encode on them. */
  window.__dumpPh = async function (list) {
    const S = 'http://localhost:7799', f = window.__phFrames;
    if (!f) return 'nothing filmed';
    const cv = document.createElement('canvas'); cv.width = f.w; cv.height = f.h;
    const x = cv.getContext('2d');
    /* Where dumped frames go. Repo-relative, so the asset server's sandbox
       accepts it and .gitignore keeps it out of commits; set `window.__SP` to
       override. Three of these shots used to carry an ABSOLUTE path into one
       machine's session scratchpad, which is exactly the sort of thing that
       made the rig unusable to anybody else. */
    const D = (window.__SP || 'tools/capture/.out') + '/';
    for (const i of list) {
      const k = i === 'end' ? f.frames.length - 1 : i;
      if (!f.frames[k]) continue;
      x.putImageData(new ImageData(new Uint8ClampedArray(f.frames[k]), f.w, f.h), 0, 0);
      const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
      await fetch(`${S}/put?path=${encodeURIComponent(D + 'p-' + i + '.png')}`, { method: 'POST', body: blob });
    }
    return 'dumped ' + list.length;
  };

  return 'phone-shot ready';
})();
