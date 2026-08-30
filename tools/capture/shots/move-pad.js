/* "Moving & fighting", clip 2 of 2: THE CONTROLLER, AND THE DRAGON.
   ===================================================================
   Clip 1 is the keyboard and the ring. This one answers the other half of the
   help page: the pad, and the five commands that only exist while you are
   flying.

   THE PAD IS DRAWN, NOT PHOTOGRAPHED — rule 9. See `padPanel` in movekit for
   the drawing and for why the lettering is read out of `PROMPTS.playstation`
   rather than typed here. What matters at this end is that the buttons light
   from the GAME'S action state: the kitten is really driven by the keyboard
   (there is no pad plugged into a capture rig), and `litFor` asks the key set
   which ACTIONS are down, so ✕ is lit exactly when jump is down. The picture
   can be wrong about which lump of plastic was pressed; it cannot be wrong
   about what the game was told.

   WHY THE FLYING BEATS DROP THE FIXED STAGE. Everything on foot is filmed on a
   pinned camera, because a still ground is what makes movement legible. A
   dragon crosses two hundred units in the time one caption is up, so there is
   no stage to pin — those beats hand the camera back to the game's own follow
   rig, which is also what a player will actually see.

   Call: eval, `await window.__movePadSetup()`, `await window.__movePadShot()`,
   `await window.__encodePad('move-pad')`. */
(() => {
  const g = window.game;
  const K = window.__mk;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let KEYSETS = null;
  window.__movePadSetup = async function () {
    const m = await import('/src/core/input.js');
    KEYSETS = m.KEYSETS;
    if (g.state !== 'play') { g.introPlayed = true; g._trailerOfferDue = () => false; g.startPlay(); }
    for (let i = 0; i < 240 && g.state !== 'play'; i++) await sleep(25);
    /* One kitten. A pad is one player's device and a second kitten in frame
       would raise a question this clip is not answering. */
    while (g.partySize > 1) g._leavePlayer(g.partySize - 1);
    if (g.tournament && g.tournament.state !== 'off') g.tournament.state = 'off';
    window.__cap.bindKB();
    await K.padInit();
    return 'party ' + g.partySize + ' prompts ' + JSON.stringify(K._prompts);
  };

  window.__movePadShot = async function (opts = {}) {
    const c = window.__cap;
    const VW = opts.w ?? 512;
    const VH = opts.h ?? Math.round(VW * innerHeight / innerWidth);
    const BAR = opts.bar ?? 46;
    const H = VH + BAR;
    const FPS = opts.fps ?? 7;
    /* TWO TAKES, NOT ONE CLIP. On foot and on a dragon went out as one 28-second
       take first, and it encoded to 4.5MB — more than twice anything else in
       the panel. The reason is structural, not a setting: the on-foot beats are
       filmed on a pinned camera where only the kitten moves, so the encoder's
       differencing throws away most of every frame, while a dragon scrolls the
       entire world past the lens and every pixel genuinely changes. Halving the
       palette moved it by seven per cent, which is the number that says the
       palette was never the problem.
       Splitting also puts each half beside the column of the help page it
       explains — "On foot" and "On a dragon" are already two lists there. */
    const PART = opts.part ?? 'foot';           // 'foot' | 'air'
    const FOOT = PART === 'foot', AIR = PART === 'air';
    const V = g.players[0].position.constructor;

    K.hideChrome();
    K.startMirror();
    K.drive.start();
    c.tapUp();

    await K.xrayInit();
    const osAimXray = g._aimXray.bind(g);
    let XRAY = true;
    g._aimXray = (camera) => { osAimXray(camera); if (XRAY) K.xrayStep(camera); };

    const tc = document.createElement('canvas'); tc.width = VW; tc.height = H;
    const tx = tc.getContext('2d', { willReadFrequently: true });
    const frames = [], delays = [];
    const notes = [];

    const drawBar = (text, hot) => {
      tx.save();
      tx.fillStyle = hot ? K.vermillion : K.paper2;
      tx.fillRect(0, VH, VW, BAR);
      tx.fillStyle = K.ink;
      tx.fillRect(0, VH, VW, 3);
      if (text) {
        tx.font = '600 20px Nunito, system-ui, sans-serif';
        tx.textAlign = 'center'; tx.textBaseline = 'middle';
        tx.fillStyle = hot ? K.paper : K.ink;
        tx.fillText(text, VW / 2, VH + BAR / 2 + 2);
      }
      tx.restore();
    };

    /* Which ACTIONS are down, off the live key set — the pad lights from this
       and from nothing else. */
    const lit = () => {
      const set = KEYSETS[0], keys = g.input.keys, out = new Set();
      for (const f of ['up', 'down', 'left', 'right', 'jump', 'attack', 'interact', 'mount', 'sprint']) {
        if ((set[f] || []).some((code) => keys.has(code))) out.add(f);
      }
      return out;
    };
    const stick = () => {
      const l = lit();
      return {
        x: (l.has('right') ? 1 : 0) - (l.has('left') ? 1 : 0),
        y: (l.has('down') ? 1 : 0) - (l.has('up') ? 1 : 0),
      };
    };

    /* THE PANEL IS 280 x 214 NOW, not 240 x 150 — the pad grew when the shell
       was retraced and given a face, so both the scale and the offset below
       are derived from `padPanel`'s own box rather than from a copy of the old
       numbers that would silently mis-place it. */
    const PAD_W = 280, PAD_H = 214, PAD_S = 0.62;
    const draw = (badge, hot) => {
      K.readGL();
      tx.clearRect(0, 0, VW, H);
      tx.drawImage(K.mirror, 0, 0, K.mirror.width, K.mirror.height, 0, 0, VW, VH);
      K.padPanel(tx, 14, VH - PAD_H * PAD_S - 10,
        { scale: PAD_S, lit: lit(), stick: stick(), tint: '#ff8a3d' });
      drawBar(badge, hot);
      frames.push(tx.getImageData(0, 0, VW, H).data.slice());
    };

    let SHOT = null;
    const stage = (cx, cz, dist, y = null, yaw = -Math.PI / 4, pitch = 0.6) => {
      SHOT = { centre: new V(cx, (y != null ? y : K.ground(cx, cz, 60)) + 1.2, cz), dist, pitch, yaw };
      return SHOT;
    };
    const aimAll = () => {
      if (!SHOT) return;
      for (let i = 0; i < g.partySize; i++) K.aim(i, SHOT);
      K.seed();
    };
    const settle = (n = 24) => { for (let i = 0; i < n; i++) { aimAll(); K.drive.step(1 / 60); } };

    const run = async (ms, badge, hot, plan, o = {}) => {
      const fps = o.fps ?? FPS, per = 1000 / fps;
      const n = Math.max(1, Math.round(ms / per));
      for (let i = 0; i < n; i++) {
        if (plan) plan(i, n);
        aimAll();
        K.drive.step(per / 1000, o.sub ?? 2);
        draw(badge, hot);
        delays.push(Math.round(per));
      }
    };

    const RIGHT = { x: 0.7071, z: 0.7071 };
    const along = (cx, cz, k) => [cx + RIGHT.x * k, cz + RIGHT.z * k];

    /* ------------------------------ on foot ------------------------------ */
    /* FILMED BESIDE THE DRAGON SHE IS ABOUT TO GET ON, so the clip is one
       continuous place rather than a cut to somewhere new halfway through —
       the dragon is in shot for every on-foot beat, which is its own quiet
       argument for pressing △. The dragon is FOUND, not typed: there are ten
       in the world and which one is nearest a given mark is not something to
       hard-code. */
    const HOME = { x: -113, z: 132 };
    /* CHOSEN BY ITS `perch`, WHICH IS THE ONLY ONE OF THE THREE THAT HOLDS
       STILL. A dragon has three positions and it took two wrong takes to learn
       the difference:
         position   where it is this frame. Useless between takes — dismounted
                    in mid-air it flies itself home (fourth non-negotiable), so
                    it is somewhere over the sea for the next twenty seconds.
         home       where it is FLYING BACK TO — and `dragon.js` REWRITES this
                    on every dismount (`perchHere`, lines 336 and 351: settle
                    wherever the rider stepped off, rather than fly home). So
                    the take that ended with a dismount two islands away moved
                    this dragon's `home` two islands away with it, and the next
                    take's search reported the nearest dragon as 97 units off
                    when a live probe said 6.
         perch      the original placement. Never written after construction.
       So: pick on `perch`, then call the game's own `returnHome()` — which is
       the one line that copies perch back into home — and put it down there.
       That is the state the ride beat is written for, and it is now the same
       state on every take however the last one ended. */
    const DRAGON = (() => {
      let best = null, bd = Infinity;
      for (const d of g.dragons || []) {
        const h = d.perch || d.home;
        if (!h) continue;
        const dist = Math.hypot(h.x - HOME.x, h.z - HOME.z);
        if (dist < bd) { bd = dist; best = { d, x: h.x, y: h.y, z: h.z, dist }; }
      }
      if (best) {
        best.d.rider = null;
        if (best.d.returnHome) best.d.returnHome();     // home := perch
        const p = best.d.position || (best.d.group && best.d.group.position);
        if (p) p.set(best.x, best.y, best.z);
        if (best.d.group) best.d.group.position.set(best.x, best.y, best.z);
        best.d.state = 'perched';
      }
      return best;
    })();
    notes.push('dragon at ' + (DRAGON ? `${DRAGON.x.toFixed(0)},${DRAGON.z.toFixed(0)} (${DRAGON.dist.toFixed(0)}u away)` : 'NONE'));

    stage(HOME.x, HOME.z, 15);
    K.place(0, HOME.x, HOME.z, -Math.PI * 0.75);
    K.seed(); settle(30);

    if (FOOT) {
    // 1. move — the stick, all four ways, each answered by its opposite so she
    //    finishes on the mark the stage is framed on.
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) {
      await run(620, 'MOVE  —  left stick', false, (i, n) => {
        if (i === 0) c.down(code);
        if (i === n - 1) c.up(code);
      });
    }
    c.tapUp();

    // 2. jump, then the second press IN THE AIR — measured at frame 4 of 8fps
    //    on the keyboard clip, and the arc is the same arc.
    K.place(0, HOME.x, HOME.z, -Math.PI * 0.75); settle(6);
    await run(1500, 'JUMP  —  ' + K._prompts.jump, true, (i) => {
      if (i === 0) c.down('Space');
      if (i === 2) c.up('Space');
    });
    K.place(0, HOME.x, HOME.z, -Math.PI * 0.75); settle(6);
    await run(2100, 'DOUBLE JUMP  —  ' + K._prompts.jump + ' twice', true, (i) => {
      if (i === 0) c.down('Space');
      if (i === 2) c.up('Space');
      if (i === 4) c.down('Space');
      if (i === 6) c.up('Space');
    });

    // 3. slash — same reset-a-prop trick as clip 1, and for the same reason:
    //    nothing regrows, so a beat that knocks a crate over cannot go looking
    //    for a standing one on the next take.
    const CRATE = (() => {
      const at = { x: HOME.x + 1.4, z: HOME.z + 5.4 };
      const cand = (g.world.props || [])
        .filter((p) => p.kind !== 'bamboo' && p.group)
        .map((p) => ({ p, d: Math.hypot(p.group.position.x - at.x, p.group.position.z - at.z) }))
        .sort((a, b) => a.d - b.d)[0];
      if (!cand) return at;
      const p = cand.p;
      p._reset();
      p.home.set(at.x, K.ground(at.x, at.z, 60), at.z);
      p.group.position.copy(p.home);
      p.group.rotation.set(0, 0.4, 0);
      p.scored = false;
      return at;
    })();
    const SLASH_AT = { x: CRATE.x - 1.05, z: CRATE.z - 0.75 };
    stage((CRATE.x + SLASH_AT.x) / 2, (CRATE.z + SLASH_AT.z) / 2, 11);
    K.place(0, SLASH_AT.x, SLASH_AT.z, Math.atan2(CRATE.x - SLASH_AT.x, CRATE.z - SLASH_AT.z));
    K.seed(); settle(24);
    const crateWas = (() => {
      const cand = (g.world.props || [])
        .map((p) => ({ p, d: Math.hypot(p.group.position.x - CRATE.x, p.group.position.z - CRATE.z) }))
        .sort((a, b) => a.d - b.d)[0];
      return cand && cand.p;
    })();
    await run(1900, 'SLASH  —  ' + K._prompts.attack, true, (i) => {
      if (i === 3) c.down('KeyF');
      if (i === 5) c.up('KeyF');
    }, { fps: 12 });
    c.tapUp();
    notes.push('crate ' + (crateWas && crateWas.knocked ? 'KNOCKED' : 'still standing'));

    // 4. sprint, across the frame — 12.3 units a second against 8, and that
    //    difference only reads sideways.
    stage(HOME.x, HOME.z, 18);
    {
      const [sx, sz] = along(HOME.x, HOME.z, -4.2);
      K.place(0, sx, sz, Math.PI * 0.25);
    }
    K.seed(); settle(24);
    await run(2000, 'SPRINT  —  hold ' + K._prompts.sprint, true, (i, n) => {
      if (i === 0) { c.down('ShiftLeft'); c.down('KeyD'); }
      if (i === Math.round(n * 0.55)) { c.up('KeyD'); c.up('ShiftLeft'); }
    });
    c.tapUp();
    }   /* end FOOT */

    /* ------------------------------ the dragon ---------------------------- */
    // 5. ride — walk the last stride and press it, with the dragon in shot.
    let MOUNTED = false;
    if (AIR && DRAGON) {
      const stand = { x: DRAGON.x + 3.2, z: DRAGON.z + 3.2 };
      stage((DRAGON.x + stand.x) / 2, (DRAGON.z + stand.z) / 2, 17, DRAGON.y);
      K.place(0, stand.x, stand.z, Math.atan2(DRAGON.x - stand.x, DRAGON.z - stand.z),
        K.ground(stand.x, stand.z, DRAGON.y));
      K.seed(); settle(24);
      let atPress = null;
      await run(2200, 'RIDE  —  ' + K._prompts.mount + '  (when the ring glows)', true, (i) => {
        if (i === 5) {
          const p = g.players[0], dp = DRAGON.d.position || DRAGON.d.group.position;
          atPress = { state: DRAGON.d.state, rider: !!DRAGON.d.rider, r: +DRAGON.d.mountRadius?.toFixed(1),
            d: +Math.hypot(p.position.x - dp.x, p.position.z - dp.z).toFixed(1),
            dy: +(p.position.y - dp.y).toFixed(1) };
          c.down('KeyQ');
        }
        if (i === 7) c.up('KeyQ');
      });
      MOUNTED = !!g.players[0].mount;
      notes.push('mount ' + (MOUNTED ? 'OK' : 'FAILED') + ' ' + JSON.stringify(atPress));
    }

    /* THE STAGE COMES OFF HERE. A dragon covers a couple of hundred units
       while one caption is up; there is nothing to pin a camera to, and the
       game's own follow rig is what a player will be looking through anyway.
       The x-ray comes off with it — it exists to cut a hole in the one pillar
       that stands between this camera and this kitten, and there is nothing
       between a camera and a kitten three hundred feet up. */
    if (AIR) {
    SHOT = null;
    for (let i = 0; i < g.partySize; i++) K.unaim(i);
    XRAY = false;
    K.xrayOff();
    K.seed(); settle(20);

    // 6. fly
    await run(2400, 'FLY  —  left stick', false, (i, n) => {
      if (i === 0) c.down('KeyW');
      if (i === Math.round(n * 0.5)) { c.up('KeyW'); c.down('KeyD'); }
      if (i === n - 1) c.up('KeyD');
    });
    c.tapUp();

    // 7. up / down — the two that have no equivalent on foot.
    await run(2600, 'UP / DOWN  —  ' + K._prompts.jump + ' / ' + K._prompts.interact, true, (i, n) => {
      if (i === 0) c.down('Space');
      if (i === Math.round(n * 0.45)) { c.up('Space'); c.down('KeyE'); }
      if (i === n - 1) c.up('KeyE');
    });
    c.tapUp();

    // 8. boost
    await run(2200, 'BOOST  —  hold ' + K._prompts.sprint, true, (i, n) => {
      if (i === 0) { c.down('ShiftLeft'); c.down('KeyW'); }
      if (i === n - 1) { c.up('KeyW'); c.up('ShiftLeft'); }
    });
    c.tapUp();

    // 9. breathe
    await run(2200, 'BREATHE  —  ' + K._prompts.attack, true, (i, n) => {
      if (i === 2) c.down('KeyF');
      if (i === Math.round(n * 0.7)) c.up('KeyF');
    });
    c.tapUp();

    // 10. hop off — and the point of the beat is the sentence under it: you can
    //     do this anywhere, because the dragon takes itself home. Fourth
    //     non-negotiable, and the reason a kid can be trusted with a dragon.
    await run(2400, 'HOP OFF ANYWHERE  —  ' + K._prompts.mount + '  (it flies home itself)', true, (i) => {
      if (i === 2) c.down('KeyQ');
      if (i === 4) c.up('KeyQ');
    });
    notes.push('dismount ' + (g.players[0].mount ? 'FAILED — still riding' : 'OK'));
    }   /* end AIR */

    /* 11. A FREEZE, NOT SLOW MOTION — see the note on clip 1's ending. Let her
       land at the clip's real rate, then stop dead on one frame held for three
       seconds so the last line can be read before it loops. */
    const LAST = FOOT
      ? 'ON FOOT  —  ' + K._prompts.jump + ' jump, ' + K._prompts.attack + ' slash, '
        + K._prompts.mount + ' ride'
      : 'ON A DRAGON  —  ' + K._prompts.jump + ' up, ' + K._prompts.interact
        + ' down, ' + K._prompts.attack + ' breathe';
    await run(1400, LAST, false, null, {});
    for (let i = 0; i < 6; i++) { aimAll(); K.drive.step(1 / 60, 1); }
    draw(LAST, false);
    delays.push(3000);

    c.tapUp();
    g._aimXray = osAimXray;
    K.xrayOff();
    for (let i = 0; i < g.partySize; i++) K.unaim(i);
    K.drive.stop(); K.showChrome();
    window.__padFrames = { frames, delays, w: VW, h: H };
    return 'move-pad[' + PART + ']: ' + frames.length + ' frames, '
      + (delays.reduce((a, b) => a + b, 0) / 1000).toFixed(1) + 's at ' + VW + 'x' + H
      + ' | ' + notes.join(' | ');
  };

  window.__encodePad = async function (name, { colors = 128 } = {}) {
    const S = 'http://localhost:7799', f = window.__padFrames;
    await fetch(S + '/gif/begin?name=' + name + '&w=' + f.w + '&h=' + f.h);
    for (const fr of f.frames) await fetch(S + '/gif/frame?name=' + name, { method: 'POST', body: fr });
    const r = await fetch(S + '/gif/end?name=' + name + '&colors=' + colors + '&dither=0', {
      method: 'POST', body: JSON.stringify({ delays: f.delays }),
    });
    return await r.json();
  };

  window.__dumpPad = async function (list) {
    const S = 'http://localhost:7799';
    /* Where dumped frames go. Repo-relative, so the asset server's sandbox
       accepts it and .gitignore keeps it out of commits; set `window.__SP` to
       override. Three of these shots used to carry an ABSOLUTE path into one
       machine's session scratchpad, which is exactly the sort of thing that
       made the rig unusable to anybody else. */
    const D = (window.__SP || 'tools/capture/.out') + '/';
    const f = window.__padFrames;
    for (const [i, name] of list) {
      const cv = document.createElement('canvas'); cv.width = f.w; cv.height = f.h;
      const x = cv.getContext('2d');
      const im = x.createImageData(f.w, f.h); im.data.set(f.frames[i]); x.putImageData(im, 0, 0);
      const b = await new Promise((r) => cv.toBlob(r, 'image/png'));
      await fetch(S + '/put?path=' + encodeURIComponent(D + name + '.png'), { method: 'POST', body: b });
    }
    return 'dumped ' + list.length + ' of ' + f.frames.length;
  };

  return 'move-pad shot ready';
})();
