/* "Dragon balls & Ryuuseki" — the Help clip, in four fixed shots.
   =======================================================================
   Ember walks up to the free star in the plaza and takes it; the other six
   follow, the sky goes out over the great torii and Ryuuseki rises; both
   kittens climb on and he crosses the sky firing the seven beams.

   IT IS FILMED THROUGH THE GAME, not around it. The star is collected by
   walking into it — the same `_updateBalls` branch a player hits, holding it
   aloft and all. The dusk is `SummonScene.duskWant` driven to `DUSK_DEEP`,
   which is the field the real `summon` scene sets, and it falls at the game's
   own `DUSK_FALL` rate. The seats are `Ryuuseki.freeSeat()`, the beams are
   `Ryuuseki.fire` through the gunner, and the flight is the pilot's key
   through `_updateFlight`. The two liberties are (1) the other six stars are
   handed over rather than hunted, which is `Digit7` and is what that key is
   for, and (2) the `found` cutscene is cancelled the frame it starts, because
   it is a DOM overlay and `readPixels` cannot see one.

   ------------------------------------------------------------------------
   THE CAMERA IS PINNED IN `_render`, AND THAT IS NOT A DETAIL.
   The first take of this clip drifted, and the reason is the trap main.js
   names in its own comments three separate times: `Player.setFocus` aims the
   PER-PLAYER camera, and when the kittens are close together — which is this
   entire clip — that camera is not the one drawing. `_updateSplit` merges them
   onto `rigs[0]`, whose target comes off the group centroid and never reads
   `p.focus`. So the shot is applied in `_render`, which runs after
   `_updateSplit` and is the last moment there is; `_aimXray` and `_faceAll`
   both read the camera INSIDE it, so a camera placed here still gets its
   billboards turned to face it.

   AND THE PLAYERS MUST BE DISMOUNTED BETWEEN TAKES. The other half of that
   first bad take: the reset put the stars back and deleted the dragon but left
   `p.mount` pointing at him, so Ember filmed the whole clip in the FLIGHT
   camera (pitch 0.60, distance up to 130) fifteen units off the ground, and
   collected the star from seven units away because a mounted player gets
   `PICKUP_RADIUS + 4`. Nothing looked broken. It was just wrong.

   ONE BEAT IS NOT PINNED, AND IT IS THE ONE THE GAME ALREADY DIRECTS. Taking
   a star fires `Game.starShot`, which swings the shared camera onto the finder
   and pulls it in to fifteen units over two seconds — a shot the game plays for
   a real player and the one moment in this sequence a child has seen before.
   Pinning over it would have been showing her something the game does not do.
   So the pin is dropped on the frame the star is taken and taken back after,
   and that beat is filmed at 12fps because the whole frame is moving and every
   frame of it costs full price.

   THE TOAST IS PAINTED, BECAUSE IT IS DOM AND `readPixels` CANNOT SEE IT. Same
   limit as the dealer's shop and the HUD, same answer as the drawn controller
   in the pad clip: it is composited onto the captured frame. **The words are
   read off the live toast element**, not typed here — so it says whatever the
   game said, and a change to that string changes the clip rather than making
   the clip a lie.

   FOUR FIXED CAMERAS, NOT A FOLLOW. Two reasons, and the encoder's is the loud
   one: `tools/gif.mjs` stores only what moved, so a shot whose ground stays put
   is nearly free and a shot that pans costs full price every frame. The other
   is the picture — with the ground pinned, the eye can see that the KITTEN is
   the thing that moved. Every stage sits on the game's own isometric yaw
   (`CAM_YAW`, -PI/4), so the clip looks like the game and, more usefully, "up
   on the stick" walks straight up the screen.

   A BEAT TO READ ON IS PLAYED, NOT FROZEN. The first cut of this bought its
   pauses the cheap way — one frame with a 1.4-second GIF delay — and Richard's
   verdict on watching it was that the clip looked like it was glitching. He is
   right, and the reason is that there is nothing on screen to read: no caption,
   no arrow, no number. A held frame only reads as a pause when the eye has been
   given a job; with nothing to do it reads as the picture having stopped.

   So a beat lingers by RUNNING THE GAME — `linger()` below — at a lower frame
   rate, because a kitten standing still is cheap to encode and a kitten
   standing still is also visibly alive: she breathes, her tail moves, petals
   drift past, the dragon undulates. What is left of the old hold is a fifth of
   it, a couple of hundred milliseconds on the last frame, which is enough to
   punctuate a cut without ever looking stopped.

   WHERE THE BYTES ACTUALLY GO, measured off this take: two beats out of nine
   are full price and they are most of the file. The star shot moves the whole
   camera and the sky going out repaints every pixel, so the encoder's
   differencing saves nothing on either; between them they are about a quarter
   of the frames and about three quarters of the bytes. Everything else is a
   pinned camera with a kitten in it and costs almost nothing. So the frame rate
   is spent where it shows — the walk, the beam fan and the fly-past keep 18 —
   and the two expensive beats and every idle one are filmed slower.

   Call: eval this, then `await window.__ryuShot()`, then
   `await window.__encodeRyu('ryuuseki', { w: 512, every: 1 })`. */
(() => {
  const g = window.game, c = window.__cap, K = window.__mk;
  const V3 = g.players[0].position.constructor;

  /* FILM BIG, PUBLISH SMALL — AND FILM ONCE.
     The capture is the expensive, fiddly, unrepeatable half: it drives the
     game, and no two takes are identical. The encode is cheap and pure. So the
     master is held at 768x432 in the page and `__encodeRyu` scales and thins it
     on the way out, which means the size/quality trade can be re-decided as
     many times as it takes WITHOUT re-filming — and every candidate comes off
     the same take, so they are actually comparable.

     Two levers, and only two, because they are the two that were measured (see
     the 4.5MB paragraph in docs/notes/help.md): RESOLUTION, and HOW MANY FRAMES
     THERE ARE. The palette is not one — halving it moved the movement clip
     seven per cent. `every: 2` drops every other frame and adds its delay to
     the one it kept, so the clip plays at the same speed and costs half.

     Downscaling here also beats filming small: 768 -> 384 is an average of four
     real pixels, where filming at 384 samples the world once. */
  const VW = 768, VH = 432;
  const FPS = 18, PER = 1000 / FPS;

  /* The game's own isometric yaw. Every stage uses it, so the walk keys line up
     with the screen and the clip looks like play rather than like a flythrough.
     `fwd` is where W goes, `right` is where D goes — and because the camera
     shares the yaw, `right` is exactly screen-right with no change in depth,
     which is why the dragon's fly-past is a clean horizontal crossing. */
  const YAW = -Math.PI * 0.25;
  const F = { x: -Math.sin(YAW), z: -Math.cos(YAW) };
  const R6 = { x: Math.cos(YAW), z: -Math.sin(YAW) };       // cross(fwd, up)
  const along = (P, o, d) => ({ x: o.x + d.x * P, z: o.z + d.z * P });

  window.__ryuShot = async function () {
    const p = g.players[0], q = g.players[1];
    if (!q) return 'need two kittens — join one first';

    /* --- scene setup, all of it before a single frame --- */
    c.play();
    c.bindKB();
    c.tapUp();
    K.hideChrome();
    K.startMirror();

    /* A CLEAN WORLD EVERY TAKE — INCLUDING THE PLAYERS.
       Stars back, dragon gone, sky back up, and both kittens off whatever they
       were riding. Without the last one the second take films from the flight
       camera; see the header. */
    for (const w of g.players) {
      w.mount = null; w.rideAlong = null; w.pandaMount = null;
      w.flySide = 0; w.dismountEase = 0; w.camDist = 26;
      w.aloftT = 0; w.velocity.set(0, 0, 0);
    }
    for (const b of g.balls) if (b.taken) b.reset();
    g.ballsHeld = 0;
    g._updateBallHud();
    if (g.ryu) { g.scene.remove(g.ryu.group); g.ryu = null; }
    g.starShot = null;
    g.summonScene.duskWant = 0;
    g.summonScene.dusk = 0;
    g.world.setDusk(0);
    g.summonScene.played.found = false;
    g.summonScene.played.summon = false;

    const canvas = document.createElement('canvas');
    canvas.width = VW; canvas.height = VH;
    const tx = canvas.getContext('2d', { willReadFrequently: true });
    const frames = [], delays = [];

    let SHOT = null;
    const place = () => {
      if (!SHOT) return;
      const cam = g.rigs[0].camera, C = SHOT.centre, cp = Math.cos(SHOT.pitch);
      cam.position.set(
        C.x + Math.sin(YAW) * cp * SHOT.dist,
        C.y + Math.sin(SHOT.pitch) * SHOT.dist,
        C.z + Math.cos(YAW) * cp * SHOT.dist,
      );
      cam.lookAt(C);
    };
    if (!g.__osRender) {
      g.__osRender = g._render.bind(g);
      g._render = () => { if (g.__pin) g.__pin(); g.__osRender(); };
    }
    g.__pin = place;
    /* A stage is chosen when the beat starts, not written down in advance:
       Ryuuseki settles for a second or two after he is summoned and does not
       arrive at the same height twice, so the two shots that frame him take
       their centre off where he ACTUALLY is. It is still a fixed camera — it
       just stops guessing. */
    const stage = (centre, dist, pitch) => { SHOT = { centre, dist, pitch }; place(); };

    /* Anything drawn onto the frame after the world and before it is kept.
       Set to a painter for the beats that need one; null the rest of the time. */
    let OVERLAY = null;
    const draw = () => {
      K.readGL();
      tx.drawImage(K.mirror, 0, 0, K.mirror.width, K.mirror.height, 0, 0, VW, VH);
      if (OVERLAY) OVERLAY(tx);
      frames.push(tx.getImageData(0, 0, VW, VH).data.slice());
    };

    /* --- the toast, redrawn ---
       Its shape is `.toast` in style.css scaled up: a kid watching a 640-wide
       clip in a help panel cannot read the HUD at its true size, and the point
       of putting it there at all is that she reads it. Everything else about it
       is the real thing — the paper, the ink border, the ember-coloured left
       edge that says whose message it is, and Bangers, which is already loaded
       for the page and so is already loaded for the canvas.
       `slide` is the game's own `toastIn`: up and out of a small scale. */
    const paintToast = (ctx, text, slide) => {
      if (!text) return;
      const FS = 26, S = FS / 19;                   // .toast is 19px in the HUD
      ctx.save();
      ctx.font = `${FS}px Bangers, cursive`;
      ctx.textBaseline = 'middle';
      /* Bangers has no letter-spacing in canvas, so the tracking that makes the
         real toast readable is applied by drawing the string a glyph at a
         time. Measured per glyph rather than assumed — the usual rule. */
      const TRACK = 1.4 * S;
      const chars = [...text];
      const widths = chars.map((ch) => ctx.measureText(ch).width);
      const tw = widths.reduce((a, b) => a + b, 0) + TRACK * (chars.length - 1);
      const padX = 18 * S, padY = 7 * S, bw = 4 * S, lw = 10 * S, r = 10 * S;
      const w = tw + padX * 2 + bw + lw, h = FS + padY * 2 + bw * 2;
      const x = Math.round((VW - w) / 2);
      const y = Math.round(22 + (1 - slide) * 16 * S);
      ctx.globalAlpha = slide;
      const box = (dx, dy, fill) => {
        ctx.beginPath();
        ctx.moveTo(x + dx + r, y + dy);
        ctx.arcTo(x + dx + w, y + dy, x + dx + w, y + dy + h, r);
        ctx.arcTo(x + dx + w, y + dy + h, x + dx, y + dy + h, r);
        ctx.arcTo(x + dx, y + dy + h, x + dx, y + dy, r);
        ctx.arcTo(x + dx, y + dy, x + dx + w, y + dy, r);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      };
      box(0, 4 * S, '#1d1216');                     // box-shadow: 0 4px 0 ink
      box(0, 0, '#1d1216');                         // the border, as a fill
      ctx.save();                                   // the ember left edge
      ctx.beginPath();
      ctx.rect(x, y, lw, h);
      ctx.clip();
      box(0, 0, '#ff8a3d');
      ctx.restore();
      ctx.fillStyle = 'rgba(251,238,210,0.96)';
      ctx.fillRect(x + lw, y + bw, w - lw - bw, h - bw * 2);
      ctx.fillStyle = '#1d1216';
      let cx = x + lw + padX;
      for (let i = 0; i < chars.length; i++) {
        ctx.fillText(chars[i], cx, y + h / 2 + 1);
        cx += widths[i] + TRACK;
      }
      ctx.restore();
    };

    /* One beat. `ms` of live world; `plan(i, n)` runs before each step; `hold`
       is added to the LAST frame's delay — punctuation on a cut, never a pause
       long enough to read as a freeze. See the header.

       `fps` IS PER-BEAT, and it is a price control. The sky going out is a
       full-screen gradient: the encoder's interframe differencing saves nothing
       on it and every frame costs full price, but nothing else is moving during
       it, so half the frame rate is half the bytes and looks identical. The
       same argument covers `linger` below. The walk and the fly-past keep the
       full 18 — those two are what a child reads as "this is the game". */
    const run = async (ms, plan, hold = 0, fps = FPS) => {
      const per = 1000 / fps;
      const n = Math.max(1, Math.round(ms / per));
      for (let i = 0; i < n; i++) {
        if (plan) plan(i, n);
        K.drive.step(per / 1000, Math.max(2, Math.round(per / 12)));
        draw();
        delays.push(Math.round(per) + (hold && i === n - 1 ? hold : 0));
      }
    };

    /* THE BEAT A CHILD READS ON, PLAYED. Live world at 12fps: nothing is
       moving fast enough during one of these to want 18, and on a pinned camera
       an idling kitten changes so few pixels that the encoder stores almost
       nothing for it — which is the whole reason a played pause is affordable
       and a panning one is not. */
    const linger = (ms, tail = 220) => run(ms, null, tail, 12);

    K.drive.start();

    /* ---------------------------------------------------------------- 1
       THE STAR. She walks north-east into it and the game takes it off her
       hands: `_updateBalls` sees PICKUP_RADIUS, calls `take()`, and puts her
       into the hold-aloft pose with the star's own face over her head. */
    const ball = g.balls[0].position.clone();
    const rem = (who) => (who.position.x - ball.x) * F.x + (who.position.z - ball.z) * F.z;

    const s0 = along(-14, ball, F);
    const s1 = { x: s0.x + R6.x * 4.5, z: s0.z + R6.z * 4.5 };
    K.place(0, s0.x, s0.z, Math.PI * 0.75);       // facing = atan2(dx,dz)
    K.place(1, s1.x, s1.z, Math.PI * 0.75);
    K.seed();
    /* The centre sits BEHIND the star, not on it. Framed on the star the two
       kittens start with their feet off the bottom of the frame, so the whole
       opening beat is a pair of cropped cats. */
    const mid = along(-7.5, ball, F);
    stage(new V3(mid.x, 5.8, mid.z), 30, 0.55);
    for (let i = 0; i < 24; i++) K.drive.step(1 / 60, 1);   // settle the lerps

    await run(360, null, 0);
    await linger(520);                      // stand a beat, so the star reads first

    /* Both of them walk in. Frost is on the arrow keys, stays a stride behind
       and off to one side, and never gets inside the 3.2 that would let her
       take it — she is a second player, not a shadow.

       AND THE PIN COMES OFF THE FRAME THE STAR IS TAKEN, not at the end of the
       beat: `Game.starShot` starts on that frame and runs for `STAR_POSE`
       seconds whether or not anyone is filming it, so a beat boundary here
       would spend half the shot behind a pinned camera and cut in halfway
       through the swing. */
    let said = '';
    await run(1300, () => {
      if (!g.balls[0].taken && rem(p) < -3.0) c.down('KeyW'); else c.up('KeyW');
      if (rem(q) < -6.5) c.down('ArrowUp'); else c.up('ArrowUp');
      if (g.balls[0].taken && g.__pin) {
        g.__pin = null;
        /* READ, NOT TYPED. Whatever the game just said is what the clip says. */
        said = document.querySelector('#toasts .toast')?.textContent?.trim() ?? '';
      }
    });
    c.tapUp();

    /* THE GAME'S OWN SHOT. `_updateSplit` swings the shared camera onto her and
       pulls it to fifteen units over `STAR_POSE`, then lets it back out; she is
       in `holdAloft` for the same two seconds with the star's face over her
       head, and the toast is up for longer than that. 12fps because every pixel
       is moving and each frame costs full price. */
    let tf = 0;
    OVERLAY = (ctx) => paintToast(ctx, said, Math.min(1, ++tf / 4));
    await run(2600, null, 0, 12);
    OVERLAY = null;
    g.__pin = place;                        // and the fixed cameras are back

    /* ---------------------------------------------------------------- 2
       THE OTHER SIX, THE DARK, AND THE DRAGON. `Digit7` is the debug key that
       hands over the rest and calls `_onAllBalls` — the real summon path, which
       spawns him over the torii at a known (0, -46). The `found` scene it
       starts is a DOM overlay, so it is cancelled on the spot and the sky is
       driven here instead, on the field the `summon` scene would have set. */
    stage(new V3(0, 15, -46), 52, 0.42);
    await run(350, null, 0);
    await linger(560);

    g._debugKey('Digit7');                  // through the handler, not around it
    g.summonScene.finish();
    g.summonScene.played.found = true;
    g.summonScene.played.summon = true;     // and no scene when they fly at him
    g.summonScene.duskWant = 0.86;          // DUSK_DEEP

    /* 6fps, and it still looks identical: the only thing changing is a smooth
       full-screen gradient, and a full-screen change is exactly what the
       encoder cannot compress. Slower here is free to watch and cheap to keep.
       The FALL ITSELF is the game's own `DUSK_FALL` — 2.75 seconds to reach
       `DUSK_DEEP` — and is not sped up. Showing the sky going out faster than
       it goes out would have been the easy saving and the dishonest one. */
    await run(2900, null, 0, 6);            // the sky goes out around him
    await linger(2000);                     // and he is there

    /* ---------------------------------------------------------------- 3
       ABOARD. `Digit8` is the debug key for exactly this, and it goes through
       `freeSeat()` and `seatOffset()`, so the girls sit where the game seats
       them and `onRyuMount` says who has the beams. */
    const R = g.ryu;
    g._debugKey('Digit8');
    /* FRAMED ON THE RIDERS, NOT ON THE DRAGON. `R.position` is his centre and
       the seats are draw offsets up on his neck — the same point `_updateCamera`
       makes about `ridersMidpoint`. Centred on him, the two kittens sit in the
       top-right corner with their heads off the frame, which is the half of the
       shot the beat exists to show. */
    const m = R.ridersMidpoint?.() ?? R.position;
    stage(new V3(m.x, m.y, m.z), 52, 0.34);
    await linger(2100);                     // two kittens on a dragon

    /* ---------------------------------------------------------------- 4
       THE SEVEN BEAMS AND THE FLIGHT. The gunner's fan is `Digit9`, which is
       `Ryuuseki.fire` through whoever is in the gunner's seat; the flight is
       the pilot's key through `_updateFlight`. `right` is screen-right on this
       yaw, so holding D crosses the frame without changing his distance from
       the camera — a fixed camera can hold the whole pass. */
    const c4 = { x: R.position.x + R6.x * 17, z: R.position.z + R6.z * 17 };
    stage(new V3(c4.x, R.position.y - 2, c4.z), 78, 0.38);
    await run(600, (i) => { if (i === 2) g._debugKey('Digit9'); }, 0);
    await linger(700);

    await run(1600, (i, n) => {
      c.down('KeyD');                       // screen-right, across the frame
      if (i === Math.round(n * 0.30)) g._debugKey('Digit9');
      /* LATE, SO THE CLIP LOOPS OUT OF A BEAM. This is the last beat and it has
         no linger, so whatever is on screen at the end is what a child sees
         wrap round to the star again. A dragon mid-fan is a better place to
         leave her than a dragon coasting. */
      if (i === Math.round(n * 0.82)) g._debugKey('Digit9');
    }, 300);
    c.tapUp();
    /* NO LINGER ON THE LAST BEAT. The clip ends mid-flight and loops straight
       back to the star, so the one place a frozen tail would have been most
       visible is the one place there is nothing to freeze. Letting him coast
       instead was tried: he does not decelerate much (about 32 units a second
       with the key up) and a second of coasting takes him off the frame. */

    /* --- put the game back --- */
    K.drive.stop();
    g.__pin = null;                          // hand the camera back
    K.showChrome();

    window.__ryuFrames = { frames, delays, w: VW, h: VH };
    const secs = (delays.reduce((a, b) => a + b, 0) / 1000).toFixed(1);
    return `ryuuseki: ${frames.length} frames, ${secs}s at ${VW}x${VH}`;
  };

  /**
   * Encode the master at a chosen size and frame rate. Re-runnable: the film
   * stays in the page, so trying 512 against 384, or 18fps against 9, costs a
   * few seconds and not another take.
   *
   * `every: n` KEEPS ONE FRAME IN n AND GIVES IT THE DELAYS OF THE ONES IT
   * DROPPED, so the clip is the same length in seconds and half the bytes. The
   * held beats survive it untouched, because a hold is a long delay on one
   * frame rather than a run of repeated frames.
   */
  window.__encodeRyu = async function (name, { w = 512, colors = 256, every = 1 } = {}) {
    const S = 'http://localhost:7799', f = window.__ryuFrames;
    if (!f) return 'nothing filmed';
    const OW = w, OH = Math.round(w * f.h / f.w);
    const src = document.createElement('canvas'); src.width = f.w; src.height = f.h;
    const sx = src.getContext('2d');
    const dst = document.createElement('canvas'); dst.width = OW; dst.height = OH;
    const dx = dst.getContext('2d', { willReadFrequently: true });
    dx.imageSmoothingEnabled = true; dx.imageSmoothingQuality = 'high';

    await fetch(`${S}/gif/begin?name=${name}&w=${OW}&h=${OH}`);
    const outDelays = [];
    for (let i = 0; i < f.frames.length; i += every) {
      /* The dropped frames' time is added to the frame that replaces them —
         never thrown away, or the clip speeds up as it gets smaller. */
      let ms = 0;
      for (let k = i; k < Math.min(f.frames.length, i + every); k++) ms += f.delays[k];
      outDelays.push(ms);
      sx.putImageData(new ImageData(new Uint8ClampedArray(f.frames[i]), f.w, f.h), 0, 0);
      dx.drawImage(src, 0, 0, f.w, f.h, 0, 0, OW, OH);
      await fetch(`${S}/gif/frame?name=${name}`,
        { method: 'POST', body: dx.getImageData(0, 0, OW, OH).data });
    }
    const r = await fetch(`${S}/gif/end?name=${name}&colors=${colors}&dither=0`, {
      method: 'POST', body: JSON.stringify({ delays: outDelays }),
    });
    const out = await r.json();
    return { ...out, size: `${OW}x${OH}`, every, kept: outDelays.length };
  };

  /* Dump captured frames as PNGs so a beat can be looked at before the whole
     thing is encoded — which is how the drifting camera and the mounted kitten
     were both found. */
  window.__dumpRyu = async function (list) {
    const S = 'http://localhost:7799';
    /* Where dumped frames go. Repo-relative, so the asset server's sandbox
       accepts it and .gitignore keeps it out of commits; set `window.__SP` to
       override. Three of these shots used to carry an ABSOLUTE path into one
       machine's session scratchpad, which is exactly the sort of thing that
       made the rig unusable to anybody else. */
    const D = (window.__SP || 'tools/capture/.out') + '/';
    const f = window.__ryuFrames;
    const cv = document.createElement('canvas'); cv.width = f.w; cv.height = f.h;
    const cx = cv.getContext('2d');
    for (const [i, nm] of list) {
      const im = new ImageData(new Uint8ClampedArray(f.frames[i]), f.w, f.h);
      cx.putImageData(im, 0, 0);
      const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
      await fetch(`${S}/put?path=${encodeURIComponent(D + nm + '.png')}`,
        { method: 'POST', body: blob });
    }
    return 'dumped ' + list.length;
  };

  return 'ryu-shot loaded';
})();
