/* "Moving & fighting" — the two clips the topic was still missing.
   =======================================================================
   `move-arena` — sprint, jump, double-jump and a slash that LANDS, filmed in
   the tournament ring with a live round running, one kitten on the keyboard and
   one on the controller, both diagrams on screen at once.
   `move-air`  — the same buttons on a dragon: climb, dive, boost, fire.

   WHY BOTH DIAGRAMS ARE IN ONE FRAME, when the two existing clips each carry
   one. The ask was to "show both players jumping with two button presses on 2
   input types", and it is the better picture anyway: this is a split-screen
   co-op game, the ordinary case is two kids on two different things, and a
   frame with a keyboard under one kitten and a pad under the other says that
   in a way no caption does. The existing pair stays as it is — it is the
   SAME run twice, which is the right shape for "here is your device" — and
   these two are the shape for "here are the two of you".

   THE PAD IS LIT FROM THE ACTION, NOT FROM A GAMEPAD. Both kittens are driven
   by synthesized keys, because that is the only input a script has. What the
   pad diagram lights is the ACTION the game read this frame (`input.players[1]
   .held`), and it wears the glyph `PROMPTS.playstation` gives that action — so
   it is a picture of the mapping, which is exactly what it is on the page. The
   existing `move-pad` clip was filmed the same way.

   THE ROUND IS REAL. `Tournament.begin()` deals the sides, posts the fighters,
   sets both bars full and starts the menagerie; the state is then moved
   straight to `live`, skipping the card and the countdown, because both of
   those are DOM banners `readPixels` cannot see and three seconds of a frozen
   kitten is not what this clip is for. `fighting` is true from the first frame,
   which is the ONLY gate `Game.strikePlayers` asks — so the slash that lands
   here lands through the same code a player's does, damage, spark and all.

   THE CAMERA IS PINNED IN `_render`, and that is not a detail — see the header
   of ryu-shot.js for the trap in full. Short version: `Player.setFocus` aims
   the per-player camera, and with the kittens this close it is not the camera
   drawing; `_updateSplit` merges them onto `rigs[0]`. The tournament ALSO has
   its own `cameraWant`, which tracks the pair's midpoint — a moving camera,
   and the encoder charges full price for every frame of one. Pinned, the ring
   floor never changes and only the two cats cost anything.

   The stage is the ring's own centre at the tournament's own pitch (0.52,
   flatter than the walking camera because the fight is horizontal and these are
   billboards) and the game's own yaw, so screen-right is `D` and the sprint
   reads as a clean run across the frame.

   THE CAPTION STRIP IS PART OF THE PICTURE, and it is measured off the clips it
   sits beside: 512x332 published is 512x288 of game, a 4px ink rule, and a 43px
   band of `paper2` — so the master is 768x432 plus 66, and 1.5x down lands on
   the same numbers. It turns vermillion for a beat where a button is HELD
   rather than tapped, which is the one thing a diagram of a key cannot show.

   Call: eval this, then `await window.__arenaShot()` / `await window.__airShot()`,
   then `await window.__encodeMv('move-arena', { w: 512, every: 1 })`. */
(() => {
  const g = window.game, c = window.__cap, K = window.__mk;
  const V3 = g.players[0].position.constructor;

  /* FILM BIG, PUBLISH SMALL — AND FILM ONCE. Same bargain as ryu-shot: the
     capture is the expensive, unrepeatable half and the encode is cheap and
     pure, so the master is held at 768 and `__encodeMv` decides the size and
     the frame count afterwards, as many times as it takes, off one take. */
  const VW = 768, VH = 432, CAP = 66, OH = VH + CAP;

  /* The game's own isometric yaw. `F` is where W goes and `R` is where D goes;
     because the camera shares the yaw, `R` is exactly screen-right with no
     change in depth, which is what makes the sprint a clean crossing. */
  const YAW = -Math.PI * 0.25;
  const F = { x: -Math.sin(YAW), z: -Math.cos(YAW) };
  const R = { x: Math.cos(YAW), z: -Math.sin(YAW) };

  /* Player 2's keys, from KEYSETS[1]. Named here rather than reached for one at
     a time so a rebind is one edit and so the arrows set is visibly a SET —
     the whole point of it is that she is playing a different instrument. */
  const P1 = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', attack: 'KeyF', sprint: 'ShiftLeft', mount: 'KeyQ', interact: 'KeyE' };
  const P2 = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', jump: 'ControlRight', attack: 'KeyJ', sprint: 'ShiftRight', mount: 'Period', interact: 'Comma' };
  const allUp = () => { for (const s of [P1, P2]) for (const k of Object.values(s)) c.up(k); };

  /* ------------------------------------------------------------------ rig */
  function rig(actions) {
    const canvas = document.createElement('canvas');
    canvas.width = VW; canvas.height = OH;
    const tx = canvas.getContext('2d', { willReadFrequently: true });
    const frames = [], delays = [];

    let SHOT = null;
    const place = () => {
      if (!SHOT) return;
      /* ONE VIEW, WHATEVER THE CLUSTER THINKS. `_updateSplit` gives each group
         of kittens its own pane, and the rule is a distance: they share a view
         within 30 units and stop sharing beyond 46. That is right for play and
         wrong for a diagram — two dragons close enough to guarantee a merge are
         close enough to overlap on screen, so the air clip's first take came
         back as two half-width panes each showing one dragon and half a
         controller. Forced here, in the same hook and for the same reason as
         the camera itself: this is a shot, and the shot is one frame.
         AFTER `_updateSplit` AND BEFORE `_render`'s body, which is the only
         moment both facts are settled and nothing has been drawn — `_panes()`
         is called inside `_render` and reads `groups`. */
      g.groups = [g.players.map((_, i) => i)];
      g.merged = true;
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
    const stage = (centre, dist, pitch) => { SHOT = { centre, dist, pitch }; place(); };

    /* --- the caption strip ---
       Measured off `move-keys.gif` rather than invented: sample its pixels and
       the band is `#f2ddb4` (paper2) under a `#181319` rule, 43px of a 332px
       frame. These numbers are that, times 1.5. */
    let CAPTION = '', HOT = false;
    const strip = () => {
      tx.fillStyle = K.ink; tx.fillRect(0, VH - 5, VW, 5);
      tx.fillStyle = HOT ? K.vermillion : K.paper2;
      tx.fillRect(0, VH, VW, CAP);
      if (!CAPTION) return;
      tx.save();
      tx.font = '700 24px Nunito, system-ui, sans-serif';
      tx.textBaseline = 'middle';
      /* Tracked by hand, a glyph at a time. Canvas has no letter-spacing and
         the strip is set wide — at 512 published it is the only text in the
         clip and it has to survive being a third of its filmed size. */
      const TRACK = 3.6, chars = [...CAPTION];
      const wid = chars.map((ch) => tx.measureText(ch).width);
      const tw = wid.reduce((a, b) => a + b, 0) + TRACK * (chars.length - 1);
      tx.fillStyle = HOT ? K.paper : K.ink;
      let x = (VW - tw) / 2;
      for (let i = 0; i < chars.length; i++) { tx.fillText(chars[i], x, VH + CAP / 2 + 1); x += wid[i] + TRACK; }
      tx.restore();
    };

    /* What the game read THIS FRAME, per slot, as the Set the diagrams want.
       Read off `input.players[i]` and not off the keys this script pressed, so
       a diagram cannot disagree with the game: if a press was swallowed — by a
       menu, by the tournament's frozen pad — the button does not light. */
    const litFor = (i) => {
      const st = g.input.players[i], out = new Set();
      if (!st) return out;
      if (st.my < -0.3) out.add('up');
      if (st.my > 0.3) out.add('down');
      if (st.mx < -0.3) out.add('left');
      if (st.mx > 0.3) out.add('right');
      for (const a of Object.keys(st.held)) if (st.held[a]) out.add(a);
      return out;
    };
    const stickFor = (i) => {
      const st = g.input.players[i];
      return st ? { x: st.mx, y: st.my } : { x: 0, y: 0 };
    };

    /* Both diagrams, one frame. Player one's keyboard bottom-left, player two's
       pad bottom-right, each in her own colour — `style.colour` off the player,
       which is `PLAYER_STYLE[i]` in palette.js: the same
       number her health bar and her name are drawn in, so which panel is whose
       is answered by the same cue the HUD already uses. */
    const tint = (i) => '#' + (g.players[i]?.style?.colour ?? 0xff8a3d).toString(16).padStart(6, '0');
    const panels = () => {
      K.keyPanel(tx, 24, VH - 145, {
        scale: 1.1, lit: litFor(0), tint: tint(0), title: g.players[0].name.toUpperCase() + ' — KEYBOARD',
        keys: { up: 'W', left: 'A', down: 'S', right: 'D' },
        actions,
      });
      K.padPanel(tx, VW - 252, VH - 183, {
        scale: 0.82, lit: litFor(1), tint: tint(1),
        title: (g.players[1]?.name ?? 'PLAYER 2').toUpperCase() + ' — CONTROLLER',
        stick: stickFor(1),
      });
    };

    const draw = () => {
      K.readGL();
      tx.drawImage(K.mirror, 0, 0, K.mirror.width, K.mirror.height, 0, 0, VW, VH);
      panels();
      strip();
      frames.push(tx.getImageData(0, 0, VW, OH).data.slice());
    };

    /* One beat. `plan(i, n)` runs before each step; `hold` is added to the last
       frame's delay — punctuation on a cut, never long enough to read as a
       freeze. `fps` is per-beat and it is a price control; see ryu-shot. */
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

  /* --------------------------------------------------------------- arena */
  window.__arenaShot = async function () {
    const p = g.players[0], q = g.players[1];
    if (!q) return 'need two kittens — join one first';

    c.play(); c.bindKB(); allUp();
    await K.padInit();
    K.hideChrome();
    for (const id of ['arena-hud', 'arena-banner', 'arena-result', 'announce']) {
      const el = document.getElementById(id);
      if (el) { el.style.display = 'none'; el.__mvHidden = true; }
    }
    K.startMirror();

    /* A clean world every take, players included — the second take of the
       Ryuuseki clip filmed from a flight camera because `p.mount` still pointed
       at a dragon that had been deleted. Nothing looked broken; it was wrong. */
    for (const w of g.players) {
      w.mount = null; w.rideAlong = null; w.pandaMount = null;
      w.flySide = 0; w.dismountEase = 0; w.camDist = 26;
      w.aloftT = 0; w.velocity.set(0, 0, 0);
    }
    g.starShot = null;

    /* OPEN THE GROUNDS FIRST, AND THIS IS THE WHOLE OF THE FIRST BAD TAKE.
       `world.arenaOpen` is false until the girls actually fly out there, and a
       shut arena HAS NO GROUND — `heightAt` skips both the island and the
       arena-tagged platforms, deliberately, so a kid on a dragon cannot land on
       an invisible stone square in open sky (world.js says so at length). The
       island mesh is hidden by the same call. So the first take was two kittens
       and a rabbit falling through an orange sky with the deck nowhere: exactly
       the failure `movekit.place` already warns about, and the same cause.
       `openArena` is one call because "the arena exists" is four facts. */
    const wasOpen = g.world.arenaOpen;
    g.world.openArena(true);

    /* THE ROUND, DEALT BY THE TOURNAMENT AND THEN FAST-FORWARDED. `begin` is
       what posts the fighters, fills both bars and starts the animals; `card`
       and `count` are five seconds of DOM banner over two frozen kittens, so
       the state goes straight to `live` and `fighting` is true from frame one. */
    g.tournament.begin();
    g.tournament.state = 'live';
    g.tournament.t = 0;

    const rg = rig([{ label: 'SPACE', act: 'jump', w: 58 }, { label: 'F', act: 'attack', w: 30 }, { label: 'SHIFT', act: 'sprint', w: 50 }]);
    const { run, linger, stage } = rg;

    /* Posted along SCREEN-RIGHT rather than on the marks. The two posts are
       34 units apart on the X axis, which at this yaw is a diagonal running
       away from the camera — one kitten large and near, one small and far. Laid
       out along `R` they are the same size, side by side, and a sprint from one
       to the other crosses the frame instead of walking into it. They are still
       inside the ring and the round is still live, which is all `fighting`
       asks. */
    const ring = g.world.arenaRing;
    const mark = (d) => ({ x: ring.x + R.x * d, z: ring.z + R.z * d });
    /* THIRTEEN AND THREE, AND EVERY DURATION BELOW IS A DISTANCE.
       MEASURED, not reasoned: she walks at 10.0 units a second and sprints at
       15.6, and the pinned frame holds about seventeen units either side of the
       middle before she is half off the edge of it. So the beats are budgeted
       in units and converted back to seconds, which is the opposite of how the
       first two takes were written — those held sprint for "about two seconds"
       and sent her thirty units, straight past Frost and out of the picture.
       Sixteen units of gap: ten spent on the sprint beat and the rest closed on
       the run, because the blow that lands is the DASH one — see beat 6.
       THE GAP IS SPENT WALKING TOWARDS THE MIDDLE, not across it. Frost stands
       three units right of centre rather than seven, so the exchange happens
       near the middle of the frame instead of in the top corner beside the pad
       — which is where the previous take put it, having started them both too
       far right and let Ember's sprint carry the fight the rest of the way. */
    const A = mark(-13), B = mark(3);
    const faceR = Math.atan2(R.x, R.z), faceL = Math.atan2(-R.x, -R.z);
    K.place(0, A.x, A.z, faceR, ring.y);
    K.place(1, B.x, B.z, faceL, ring.y);
    K.seed();
    /* THE LOOK-AT POINT IS ON THE DECK, NOT AT CHEST HEIGHT, and that is a
       composition fix rather than a taste one: the lookAt lands in the middle
       of the frame, so aiming at 3.2 above the floor put both fighters in the
       BOTTOM half — exactly where the two diagrams are, and the first framed
       take had a kitten behind each panel. On the floor, they stand across the
       middle and the panels sit in empty deck underneath them. */
    stage(new V3(ring.x, ring.y + 0.8, ring.z), 31, 0.52);
    for (let i = 0; i < 24; i++) K.drive.step(1 / 60, 1);

    K.drive.start();

    /* 1 — who is playing what. Nothing happens; the frame is the message. */
    await linger(1100, { cap: 'TWO OF YOU, TWO DIFFERENT THINGS' });

    /* 2 — MOVE. Both walk, so both diagrams light a direction at once and the
       reader gets the mapping before anything fast happens.

       THEY WALK IN DEPTH AND COME BACK, and that is a framing rule rather than
       a choice. The camera is pinned: anything either of them spends walking
       sideways here is spent out of the eleven units the frame holds, and the
       take that had them stroll across each other left Ember off the right edge
       by the sprint beat. Up and back is a round trip — she ends on her mark —
       and going opposite ways reads as two players rather than a mirror. */
    await run(1700, (i, n) => {
      if (i === 0) { c.down(P1.up); c.down(P2.down); }
      if (i === Math.round(n * 0.42)) { c.up(P1.up); c.up(P2.down); }
      if (i === Math.round(n * 0.52)) { c.down(P1.down); c.down(P2.up); }
      if (i === n - 2) { c.up(P1.down); c.up(P2.up); }
    }, { cap: 'MOVE' });

    /* 3 — SPRINT, held, and it is the approach: she crosses most of the gap.
       The strip goes hot because a diagram of a key can show that it is DOWN
       and not that it is being HELD, and "hold it" is the whole instruction. */
    await run(1500, (i) => {
      if (i === 1) { c.down(P1.sprint); c.down(P1.right); }
      if (i === 11) { c.up(P1.sprint); c.up(P1.right); }   // 10 frames = 9.7 units
    }, { cap: 'SPRINT — hold it down', hot: true });

    /* 4 — JUMP, both at once, one press each on two different devices. This is
       the frame the whole two-diagram layout exists for. */
    /* HELD FOR SIX FRAMES, NOT TWO, and that is about the DIAGRAM rather than
       about the jump. The game reads the press edge, so two frames is a real
       jump — but two frames of a lit key at sixteen a second is an eighth of a
       second, and the take that did it that way showed both kittens in the air
       over two diagrams with nothing lit on either. The button has to still be
       down while she is going up, or the picture does not connect the two. */
    await run(1300, (i) => {
      if (i === 2) { c.down(P1.jump); c.down(P2.jump); }
      if (i === 8) { c.up(P1.jump); c.up(P2.jump); }
    }, { cap: 'JUMP — one press each', hold: 120 });

    /* 5 — DOUBLE JUMP. Two presses, far enough apart to read as two. */
    await run(1500, (i) => {
      if (i === 1) c.down(P1.jump);
      if (i === 5) c.up(P1.jump);
      if (i === 9) c.down(P1.jump);
      if (i === 13) c.up(P1.jump);
    }, { cap: 'DOUBLE JUMP — press it twice', hold: 120 });

    /* 6 — SLASH, AND IT LANDS. She walks the last of the gap and cuts; the blow
       goes through `Game.strikePlayers`, which asks `Tournament.fighting` and
       nothing else, so Frost takes real damage and her bar — an in-world
       sprite, not the DOM HUD — drops on camera. */
    /* THE PRESS IS FIRED BY DISTANCE, NOT BY FRAME NUMBER. Written as "attack
       on frame nine" it landed sometimes and swung at air the rest of the time:
       the gap she closes depends on how the previous beat happened to end, and
       a beat that only works from one starting position is a beat that has to
       be re-timed every take. `gap` is read off the two positions each step and
       the blow goes out the frame it can reach, which is what a player does. */
    const gap = () => Math.hypot(q.position.x - p.position.x, q.position.z - p.position.z);
    const strike = (who, keys, reach) => {
      let armed = 0;
      return (i) => {
        if (armed === 0 && gap() <= reach && i > 1) { c.down(keys.attack); armed = i; }
        /* HELD FIVE FRAMES. The swing is over long before that, but the key
           is the half of this picture the reader is looking AT, and three
           frames of it at sixteen a second is under two tenths of a second. */
        if (armed && i === armed + 5) c.up(keys.attack);
        return armed;
      };
    };

    /* IT IS THE DASH SLASH, WHICH IS WHY SHE IS STILL SPRINTING WHEN SHE CUTS.
       `Player._slashKind` answers `dash` when sprint is held AND she is moving,
       and that entry in ATTACKS is 15 damage against 10 and — the part that
       matters here — 19 of knockback against 9. A standing slash takes a tenth
       off a bar that is eleven pixels long in the published clip: the take that
       used one is indistinguishable from a miss. Frost being THROWN is what
       reads as "it lands", at any size, with no bar to read at all. */
    const cut = strike(p, P1, 3.6);
    await run(2500, (i, n) => {
      if (i === 1) { c.down(P1.sprint); c.down(P1.right); }
      const armed = cut(i);
      if (armed && i === armed + 4) { c.up(P1.sprint); c.up(P1.right); }
      if (i === n - 1) allUp();
    }, { cap: 'SLASH — and it lands', hot: true });

    /* 7 — and she hits back, on the other device. She walks in — Frost has just
       been thrown several units — and the same distance test fires her cut. */
    const back = strike(q, P2, 3.3);
    await run(2200, (i, n) => {
      if (i === 1) c.down(P2.left);
      const armed = back(i);
      if (armed && i === armed) c.up(P2.left);
      if (i === n - 1) allUp();
    }, { cap: 'SLASH — and she hits back' });

    await linger(1300, { cap: 'SLASH — and she hits back' });

    allUp();
    K.drive.stop();
    K.showChrome();
    /* SHUT IT BEHIND US. A round left live owns both kittens for the rest of
       the session — see the note at the top of `__airShot`, which is where that
       was discovered the expensive way. */
    g.tournament.finish();
    if (!wasOpen) g.world.openArena(false);   // leave the world as it was found
    for (const id of ['arena-hud', 'arena-banner', 'arena-result', 'announce']) {
      const el = document.getElementById(id);
      if (el && el.__mvHidden) { el.style.display = ''; delete el.__mvHidden; }
    }
    window.__mvFrames = { frames: rg.frames, delays: rg.delays, w: VW, h: OH };
    const ms = rg.delays.reduce((a, b) => a + b, 0);
    return `arena: ${rg.frames.length} frames, ${(ms / 1000).toFixed(2)}s`;
  };

  /* ----------------------------------------------------------------- air */
  /* THE SAME FOUR BUTTONS, A THOUSAND UNITS UP. The dragon table on the Help
     page names climb, dive, boost and fire, and until now nothing on the page
     showed any of them: the two on-foot clips stop at the ground.

     A DRAGON IS FAST AND A PINNED FRAME IS NOT NEGOTIABLE, so every beat here
     is budgeted in units the way the arena beats are — and the budget is
     ACCELERATION, not speed, which is the correction that cost a take. The top
     speeds in player.js are enormous (FLY_SPEED 34 a second, FLY_BOOST 62), so
     the first pass held boost for one second and expected sixty units of
     travel. It got twenty. The velocity is lerped at 26 a second SQUARED, which
     means a dragon needs nearly two and a half seconds just to reach boost
     speed, and a burst shorter than that is one half a t squared and nothing
     else. So the holds here run nearly the whole beat rather than a slice of
     it: 1.7 seconds of boost is about forty units, and forty units is a third
     of the picture. The frame holds about 160 across and 90 up at a distance of
     96, and 4.8 pixels is a unit.

     THERE IS ONE CUT, AND IT IS DELIBERATE. Climb and dive leave both dragons
     wherever the vertical beats put them, and boost needs a full frame width to
     be worth showing — so both are re-placed once, at the caption change
     between "dive" and "boost", which is where a reader is already being told
     a new thing is starting. The alternative was a beat that only works from
     one starting height, which is what made the arena take unrepeatable.

     TWO DRAGONS, NOT ONE WITH A PASSENGER. `rideAlong` is a real and lovely
     thing and it is the wrong thing here: the gunner's seat presses nothing, so
     half the frame would be a controller diagram with every button dark. One
     each keeps both diagrams live, which is the whole argument for this layout.
     There is one rideable animal per player on the home island — that is a
     non-negotiable in CLAUDE.md — so two is always available. */
  window.__airShot = async function () {
    const p = g.players[0], q = g.players[1];
    if (!q) return 'need two kittens — join one first';

    c.play(); c.bindKB(); allUp();
    await K.padInit();
    K.hideChrome();
    K.startMirror();

    /* SHUT THE TOURNAMENT FIRST, AND THIS IS THE WHOLE OF THE FIRST BAD TAKE.
       Filming the arena clip leaves a round LIVE, and a live round owns both
       kittens wherever they are in the world: `_catchFallers` teleports anybody
       below the ring's floor back onto the deck, and `_updateOut` reels in
       anybody outside it. So Ember was placed in the sky over the town, dragged
       three hundred units back to the arena on the first tick, and spent the
       whole clip sitting there — while Frost, who happened to be placed a few
       units higher and so above the catch floor, was quietly pulled the other
       way by the ring-out leash and never answered a key either.
       Nothing about it looked like a tournament bug. It looked like the flight
       code had stopped working. */
    g.tournament?.finish();

    for (const w of g.players) {
      w.mount = null; w.rideAlong = null; w.pandaMount = null;
      w.flySide = 0; w.dismountEase = 0; w.camDist = 26;
      w.aloftT = 0; w.velocity.set(0, 0, 0);
    }
    g.starShot = null;
    for (const d of g.dragons) d.rider = null;

    const rg = rig([
      { label: 'SPACE', act: 'jump', w: 58 }, { label: 'E', act: 'interact', w: 30 },
      { label: 'F', act: 'attack', w: 30 }, { label: 'SHIFT', act: 'sprint', w: 50 },
    ]);
    const { run, linger, stage } = rg;

    /* The stage: high over the home island, looking down the game's own yaw. It
       is the island the girls start on, so the ground under the flight is a
       place a reader recognises — and it is STILL, which is what makes a
       dragon crossing it cost the encoder almost nothing. */
    const C = { x: 0, y: 46, z: 20 };
    /* `u` is across the frame, `dy` is up it, and `v` is TOWARDS THE CAMERA —
       which is the lever the fire beat needed. See the cut, below. */
    const at = (u, dy, v = 0) => ({
      x: C.x + R.x * u + F.x * -v, y: C.y + dy, z: C.z + R.z * u + F.z * -v,
    });

    /* Mounted by assignment, not by walking up and pressing the button. The
       mount itself is taught by the on-foot clips and by the table; this clip
       is about the four buttons you press once you are up there, and eleven
       seconds is not enough to spend two of them climbing on. Everything after
       this line is `Player._updateFlight` reading a real pad. */
    const ride = (who, d, u, dy, v = 0) => {
      who.mount = d; d.rider = who; who.flySide = 1;
      const at0 = at(u, dy, v);
      who.position.set(at0.x, at0.y, at0.z);
      who.group.position.copy(who.position);
      who.velocity.set(0, 0, 0);
      d.position.set(at0.x, at0.y - d.seatOffset().y, at0.z);
      d.hovering = false;
    };
    /* SIDE BY SIDE AT THE SAME HEIGHT, and apart across the frame rather than
       up and down it. Placed at different heights the lower one flew behind the
       keyboard diagram, which occupies the bottom-left corner of every frame in
       this clip; and the climb beat then took the higher one off the top. One
       band, two lanes, and the vertical is left free for the beat that needs
       it. At 96 units the frame holds about 160 across and 90 up, and 4.8
       pixels is a unit — every number below was chosen against those. */
    ride(p, g.dragons[0], -60, 6);
    ride(q, g.dragons[1], -20, 6);
    K.seed();
    stage(new (p.position.constructor)(C.x, C.y, C.z), 96, 0.42);
    for (let i = 0; i < 24; i++) K.drive.step(1 / 60, 1);

    K.drive.start();

    await linger(1100, { cap: 'TWO OF YOU, ON TWO DRAGONS' });

    /* FLY. 1.2s of stick is 41 units, which is a quarter of the frame. */
    await run(1800, (i) => {
      if (i === 1) { c.down(P1.right); c.down(P2.right); }
      if (i === 26) { c.up(P1.right); c.up(P2.right); }
    }, { cap: 'FLY — push the stick' });

    await run(1600, (i) => {
      if (i === 1) { c.down(P1.jump); c.down(P2.jump); }
      if (i === 15) { c.up(P1.jump); c.up(P2.jump); }
    }, { cap: 'CLIMB — hold it', hot: true });

    await run(1600, (i) => {
      if (i === 1) { c.down(P1.interact); c.down(P2.interact); }
      if (i === 15) { c.up(P1.interact); c.up(P2.interact); }
    }, { cap: 'DIVE — hold it', hot: true });

    /* The one cut. Both back to the right-hand edge, to boost across. */
    allUp();
    /* THE CUT MOVES THEM TWENTY-EIGHT UNITS NEARER THE CAMERA, and that is
       for the fire. A dragon's breath is a short cone of particles hung off its
       mouth, and at ninety-six units back it came out as a few pale specks
       beside a caption promising fire — true to the game and useless as a
       picture. The camera cannot come in (it is pinned, and that is what makes
       this clip affordable), so the SUBJECT does: closer is 1.4x bigger, which
       is the difference between specks and a flame. Boost gets the same
       benefit, and a cut to a nearer angle is ordinary film grammar — it lands
       on a caption change, where the reader is already being told this is a new
       thing.
       AND THE BOOST STOPS SHORT OF THE LEFT EDGE, because a dragon breathes
       FORWARD: the take that let them cross the whole frame has fire in it and
       no fire on screen. */
    /* CLOSER ALSO MEANS SMALLER NUMBERS: at 68 effective units the frame holds
       about 113 across rather than 160, so the same hold that was a third of
       the picture is now more than half of it. Both the start marks and the
       hold shrink to match, or they boost straight out of the left edge —
       which the first take at this depth did. */
    const NEAR = 28;
    ride(p, p.mount, 30, 12, NEAR);
    ride(q, q.mount, 38, 24, NEAR);
    await run(2200, (i) => {
      if (i === 1) { c.down(P1.sprint); c.down(P1.left); c.down(P2.sprint); c.down(P2.left); }
      if (i === 18) { c.up(P1.sprint); c.up(P1.left); c.up(P2.sprint); c.up(P2.left); }
    }, { cap: 'BOOST — hold it down', hot: true });

    /* FIRE. `attack` is edge-read here (`pad.pressed`) with a half-second
       cooldown, so it is two separate presses and not one long hold. */
    await run(2600, (i) => {
      if (i === 2) { c.down(P1.attack); c.down(P2.attack); }
      if (i === 6) { c.up(P1.attack); c.up(P2.attack); }
      if (i === 14) { c.down(P1.attack); c.down(P2.attack); }
      if (i === 18) { c.up(P1.attack); c.up(P2.attack); }
      if (i === 26) { c.down(P1.attack); c.down(P2.attack); }
      if (i === 30) { c.up(P1.attack); c.up(P2.attack); }
    }, { cap: 'BREATHE FIRE' });

    await linger(1300, { cap: 'BREATHE FIRE' });

    allUp();
    K.drive.stop();
    K.showChrome();
    window.__mvFrames = { frames: rg.frames, delays: rg.delays, w: VW, h: OH };
    const ms = rg.delays.reduce((a, b) => a + b, 0);
    return `air: ${rg.frames.length} frames, ${(ms / 1000).toFixed(2)}s`;
  };

  /* ------------------------------------------------------------- encode */
  window.__encodeMv = async function (name, { w = 512, colors = 256, every = 1 } = {}) {
    const S = 'http://localhost:7799', f = window.__mvFrames;
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
      /* Dropped frames' time is added to the frame that replaces them, never
         thrown away — or the clip speeds up as it gets smaller. */
      let ms = 0;
      for (let k = i; k < Math.min(f.frames.length, i + every); k++) ms += f.delays[k];
      out.push(ms);
      sx.putImageData(new ImageData(new Uint8ClampedArray(f.frames[i]), f.w, f.h), 0, 0);
      dx.drawImage(src, 0, 0, f.w, f.h, 0, 0, OW, OHo);
      await fetch(`${S}/gif/frame?name=${name}`, { method: 'POST', body: dx.getImageData(0, 0, OW, OHo).data });
    }
    const r = await fetch(`${S}/gif/end?name=${name}&colors=${colors}&dither=0`, {
      method: 'POST', body: JSON.stringify({ delays: out }),
    });
    return { ...(await r.json()), size: `${OW}x${OHo}`, every, kept: out.length };
  };

  window.__dumpMv = async function (list) {
    const S = 'http://localhost:7799',
      /* Where dumped frames go. Repo-relative, so the asset server's sandbox
       accepts it and .gitignore keeps it out of commits; set `window.__SP` to
       override. Three of these shots used to carry an ABSOLUTE path into one
       machine's session scratchpad, which is exactly the sort of thing that
       made the rig unusable to anybody else. */
    D = (window.__SP || 'tools/capture/.out') + '/', f = window.__mvFrames;
    const cv = document.createElement('canvas'); cv.width = f.w; cv.height = f.h;
    const cx = cv.getContext('2d');
    for (const [i, nm] of list) {
      cx.putImageData(new ImageData(new Uint8ClampedArray(f.frames[i]), f.w, f.h), 0, 0);
      const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
      await fetch(`${S}/put?path=${encodeURIComponent(D + nm + '.png')}`, { method: 'POST', body: blob });
    }
    return 'dumped ' + list.length;
  };

  return 'fight-shot loaded';
})();
