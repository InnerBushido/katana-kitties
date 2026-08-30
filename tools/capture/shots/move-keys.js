/* "Moving & fighting", clip 1 of 2: THE KEYBOARD.
   ==================================================================
   Move, jump, double-jump, slash, sprint — then the second kitten joins on the
   same keyboard and both diagrams light at once. Clip 2 is the controller and
   the dragon.

   THE INPUT IS REAL. Every beat presses the actual key through the game's own
   keydown path, and the diagram lights from `input.keys` afterwards — so the
   overlay cannot disagree with what the kitten did. Nothing here animates a
   kitten by hand; the only hand-placed positions are the marks she starts a
   beat on.

   THE KEY NAMES COME OUT OF KEYSETS, not out of this file. A Help clip that
   disagrees with the game is worse than no clip, and player 2's set in
   particular has moved three times (numpad, punctuation, then the O K L ;
   cluster) — so it is imported and read, and `pick` prefers the letter cluster
   the help text names over the numpad KEYSETS lists first, because laptops
   have no numpad.

   WHY THE CAMERA IS PINNED TO A STAGE. Measured on this island: she walks at
   8 units a second and sprints at 12.3, the follow camera cannot go closer
   than 26 units, and the ash island's dragon-ball pillar (a 4.4-unit solid at
   -120.1, 128.9) plus a sleeping dragon at -107.1, 134.6 sit either side of
   the only clear ground. A following camera at 26 units put the pillar through
   the middle of the shot and the dragon over the kitten, and two seconds of
   holding W walked her off the plateau. A fixed stage fixes all three: the
   ground stays put, so the eye can see that SHE is the thing that moved.

   Call: eval, `await window.__moveKeysSetup()`, `await window.__moveKeysShot()`,
   `await window.__encodeMove('move-keys')`. */
(() => {
  const g = window.game;
  const K = window.__mk;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let KEYSETS = null;
  window.__moveKeysSetup = async function () {
    const m = await import('/src/core/input.js');
    KEYSETS = m.KEYSETS;
    if (g.state !== 'play') { g.introPlayed = true; g._trailerOfferDue = () => false; g.startPlay(); }
    for (let i = 0; i < 240 && g.state !== 'play'; i++) await sleep(25);
    while (g.partySize > 1) g._leavePlayer(g.partySize - 1);
    /* NO LIVE ROUND UNDERNEATH. A tournament left running by a previous take
       hangs a health bar over every kitten's head — they are 3D, so unlike the
       HUD they DO end up in the capture, and the first re-render of this clip
       came back with an orange bar floating over the crate beat. */
    if (g.tournament && g.tournament.state !== 'off') g.tournament.state = 'off';
    /* `barOn` is the flag the health bar actually reads, and ending the round
       does not clear it — measured: with `tournament.state` already 'off' the
       bar was still hanging over her head in the crate beat. */
    for (const p of g.players) { p.hp = p.maxHp; p.barOn = false; if (p.hpGroup) p.hpGroup.visible = false; }
    window.__cap.bindKB();
    return 'sets: ' + KEYSETS.map((k) => k.name).join(', ') + ' party ' + g.partySize;
  };

  /* The label a key wears on a cap. `Semicolon` has to read as `;` or the
     picture is naming a key nobody can find on their keyboard. */
  const GLYPH = {
    Space: 'SPACE', ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT',
    Semicolon: ';', Comma: ',', Period: '.', Slash: '/', Quote: "'",
    ControlRight: 'RCTRL', AltRight: 'RALT', Enter: 'ENTER',
  };
  const glyph = (code) => GLYPH[code] || code.replace(/^Key|^Digit|^Numpad/, '');
  const pick = (set, field, prefer) => {
    const codes = set[field] || [];
    for (const want of prefer || []) if (codes.includes(want)) return want;
    return codes[0];
  };

  window.__moveKeysShot = async function (opts = {}) {
    const c = window.__cap;
    const VW = opts.w ?? 640;
    const VH = opts.h ?? Math.round(VW * innerHeight / innerWidth);
    const BAR = opts.bar ?? 46;
    const H = VH + BAR;
    const FPS = opts.fps ?? 8;
    const V = g.players[0].position.constructor;      // THREE.Vector3

    await K.padInit();          // the pad diagram's lettering, from the game's table
    K.hideChrome();
    K.startMirror();
    K.drive.start();
    c.tapUp();

    /* X-RAY WHATEVER STANDS IN THE WAY, rather than staging around it.
       Four takes went on moving this clip's marks away from the dragon-ball
       pillar, and the shot got worse each time — the good ground on this
       island is the ground the pillar is on. The game already solves this for
       grotto walls with `xrayVertexMat`, and `_aimXray` is the per-view hook
       that feeds it. Wrapping that hook (rather than aiming from the beat
       loop) means the cut is set with the camera that is about to draw, which
       is also what makes it correct per pane if this is ever filmed split. */
    await K.xrayInit();
    const osAimXray = g._aimXray.bind(g);
    g._aimXray = (camera) => { osAimXray(camera); K.xrayStep(camera); };

    const tc = document.createElement('canvas'); tc.width = VW; tc.height = H;
    const tx = tc.getContext('2d', { willReadFrequently: true });
    const frames = [], delays = [];

    /* THE CAPTION GETS ITS OWN BAND, IN PAPER — not a black letterbox over the
       picture. Both halves of that were asked for on the dealer clip: a dark
       strip reads as a video bar whatever it says, and a caption laid over the
       game covers the thing it is describing. */
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

    /* Which actions are DOWN right now, straight off the live key set. */
    const litFor = (setIndex) => {
      const set = KEYSETS[setIndex], keys = g.input.keys, out = new Set();
      for (const f of ['up', 'down', 'left', 'right', 'jump', 'attack', 'interact', 'mount', 'sprint']) {
        if ((set[f] || []).some((code) => keys.has(code))) out.add(f);
      }
      return out;
    };
    const panelFor = (setIndex) => {
      const s = KEYSETS[setIndex];
      return {
        keys: {
          up: glyph(pick(s, 'up', ['KeyW', 'KeyO'])),
          left: glyph(pick(s, 'left', ['KeyA', 'KeyK'])),
          down: glyph(pick(s, 'down', ['KeyS', 'KeyL'])),
          right: glyph(pick(s, 'right', ['KeyD', 'Semicolon'])),
        },
        actions: [
          { act: 'jump', label: glyph(pick(s, 'jump', ['Space', 'ControlRight'])), w: 60 },
          { act: 'attack', label: glyph(pick(s, 'attack', ['KeyF', 'KeyJ'])), w: 30 },
          { act: 'sprint', label: glyph(pick(s, 'sprint', ['ShiftLeft', 'ShiftRight'])), w: 52 },
        ],
      };
    };

    /* WHERE THE STICK IS BEING PUSHED, for the drawn pad's left stick. Taken
       from the key set rather than from the kitten's velocity: velocity lags
       the input by a frame or two and keeps drifting after the key is up, so a
       knob driven by it leans the wrong way at both ends of a press. */
    const stickFor = (setIndex) => {
      const l = litFor(setIndex);
      return {
        x: (l.has('right') ? 1 : 0) - (l.has('left') ? 1 : 0),
        y: (l.has('down') ? 1 : 0) - (l.has('up') ? 1 : 0),
      };
    };

    const TINT = ['#ff8a3d', '#7fd4ff', '#9be26a', '#ff8fc7'];
    const draw = (badge, hot, two, both) => {
      K.readGL();
      tx.clearRect(0, 0, VW, H);
      tx.drawImage(K.mirror, 0, 0, K.mirror.width, K.mirror.height, 0, 0, VW, VH);
      if (both) {
        /* ONE KEYBOARD AND ONE PAD IN THE SAME FRAME. Player two is really on
           the second key set — the pad is a diagram of the alternative, not a
           second device — but everything lit on it is read out of HER action
           state, so it is never showing a button the game did not receive. */
        const s = 0.66, bh = 93;
        K.keyPanel(tx, 18, VH - bh - 12, { ...panelFor(0), scale: s, lit: litFor(0), tint: TINT[0], title: 'PLAYER 1' });
        K.padPanel(tx, VW - 18 - 168, VH - 105 - 12,
          { scale: 0.7, lit: litFor(1), stick: stickFor(1), tint: TINT[1], title: 'PLAYER 2' });
      } else if (two) {
        const s = 0.72, bw = 120, bh = 101;
        K.keyPanel(tx, 20, VH - bh - 12, { ...panelFor(0), scale: s, lit: litFor(0), tint: TINT[0], title: 'PLAYER 1' });
        K.keyPanel(tx, VW - 20 - bw, VH - bh - 12, { ...panelFor(1), scale: s, lit: litFor(1), tint: TINT[1], title: 'PLAYER 2' });
      } else {
        K.keyPanel(tx, 24, VH - 127 - 14, { ...panelFor(0), scale: 0.9, lit: litFor(0), tint: TINT[0], title: 'PLAYER 1' });
      }
      drawBar(badge, hot);
      frames.push(tx.getImageData(0, 0, VW, H).data.slice());
    };

    /* --- the stage: a fixed camera, aimed every frame (see the header) --- */
    let SHOT = null;
    const stage = (cx, cz, dist, yaw = -Math.PI / 4, pitch = 0.6, y = null) => {
      SHOT = { centre: new V(cx, (y != null ? y : K.ground(cx, cz, 60)) + 1.2, cz), dist, pitch, yaw };
      return SHOT;
    };
    /* A STAGE CAMERA THAT IS ACTUALLY STILL, and it is worth a third of the
       file. The rig LERPS towards whatever it is focused on — `rig.target.lerp
       (want, dt*6)` and the same for distance — so even aimed at a fixed point
       it creeps a fraction of a unit every frame and never quite arrives.
       Invisible to watch, and ruinous to encode: measured on the first cut,
       70 to 83 per cent of the pixels differed frame to frame during beats
       where nothing but the kitten was moving, because a sub-pixel camera
       shift changes every pixel in the picture. Re-seeding each frame makes
       the rig COPY the focus instead of easing towards it, so the ground is
       bit-identical between frames and the encoder's differencing has
       something to remove. The two-player beat is left on the lerp: it uses
       the game's own merged camera following a moving centroid, where snapping
       would read as a jerk. */
    const aimAll = () => {
      if (!SHOT) return;
      for (let i = 0; i < g.partySize; i++) K.aim(i, SHOT);
      K.seed();
    };
    const settle = (n = 24) => { for (let i = 0; i < n; i++) { aimAll(); K.drive.step(1 / 60); } };

    /* One beat: `ms` of real game time at `fps`, with `plan(i, n)` free to
       press and release keys on any frame. The delay written into the GIF is
       the time the frame really covers, so it plays back at the game's speed.
       Nothing here ever holds a still — a frozen frame reads as a lag spike. */
    const run = async (ms, badge, hot, plan, o = {}) => {
      const fps = o.fps ?? FPS, per = 1000 / fps;
      const n = Math.max(1, Math.round(ms / per));
      for (let i = 0; i < n; i++) {
        if (plan) plan(i, n);
        aimAll();
        K.drive.step(per / 1000, o.sub ?? 2);
        draw(badge, hot, o.two, o.both);
        delays.push(Math.round(per));
      }
    };

    /* Screen-right in world XZ, MEASURED by pressing D for half a second on
       this stage: (0.707, 0.707). W is the same vector rotated to (0.707,
       -0.707) — into the screen. Anything that has to read as speed has to
       cross the frame, not recede into it. */
    const RIGHT = { x: 0.7071, z: 0.7071 };
    const along = (cx, cz, k) => [cx + RIGHT.x * k, cz + RIGHT.z * k];

    // 1. move -----------------------------------------------------------
    stage(-113, 132, 15);
    K.place(0, -113, 132, -Math.PI * 0.75);
    K.seed(); settle(30);
    /* IN THE ORDER THE CAPTION READS THEM. An earlier cut ran W S D A to keep
       her from ever standing left of her mark, because A walked her behind the
       dragon-ball pillar — that is what the x-ray is for now, so the demo can
       go back to matching the words under it. Each pair still returns her to
       the mark, which is what keeps the stage framed. */
    const MOVE = 'MOVE  —  W A S D';
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) {
      await run(600, MOVE, false, (i, n) => {
        if (i === 0) c.down(code);
        if (i === n - 1) c.up(code);
      });
    }
    c.tapUp();

    // 2. jump -----------------------------------------------------------
    K.place(0, -113, 132, -Math.PI * 0.75); settle(6);
    await run(1500, 'JUMP  —  SPACE', true, (i) => {
      if (i === 0) c.down('Space');
      if (i === 2) c.up('Space');
    });

    // 3. double jump — the second press has to land IN THE AIR, which is the
    //    whole point of the beat. Her arc peaks 1.73 units up in about a third
    //    of a second (measured), so the second tap goes at frame 4 of 8fps.
    K.place(0, -113, 132, -Math.PI * 0.75); settle(6);
    await run(2100, 'DOUBLE JUMP  —  SPACE twice', true, (i) => {
      if (i === 0) c.down('Space');
      if (i === 2) c.up('Space');
      if (i === 4) c.down('Space');
      if (i === 6) c.up('Space');
    });

    // 4. slash — at the crate, because the katana is FOR knocking scenery over
    //    and a swing at nothing does not say that. Facing is aimed at the
    //    crate's real position, not guessed.
    /* THE CRATE IS PUT BACK, NOT FOUND. Nothing regrows in this game, and this
       beat has now filmed a swing at bare rock twice for two different reasons.
       First cut: a hard-coded coordinate, and the takes before it had already
       knocked the two crates by that mark over. Second cut: ask the world for a
       prop that is still STANDING and stage at it — which worked until enough
       takes had run that no standing prop was left within the radius, and it
       fell through to its own fallback coordinate and filmed bare rock again.
       Searching cannot fix a beat that consumes the thing it searches for.
       So the rig RESETS one instead. `Prop._reset` is the restart path the
       game already ships, and re-homing it to the mark is a capture-rig
       liberty — the shipped world still never regrows anything, which is why
       this lives here and not in src.
       PILLAR is the dragon-ball rock; a stage within six units of it puts it
       between the camera and the kitten, which is what the x-ray is for. */
    const PILLAR = { x: -120.1, z: 128.9 };
    const CRATE = (() => {
      const at = { x: -111.6, z: 137.4 };
      /* Not bamboo: a cane is 8.5 units tall and would fill the frame, and it
         falls in one piece rather than tipping the way a crate does. */
      const cand = g.world.props
        .filter((p) => p.kind !== 'bamboo' && p.group)
        .map((p) => ({ p, d: Math.hypot(p.group.position.x - at.x, p.group.position.z - at.z) }))
        .sort((a, b) => a.d - b.d)[0];
      if (!cand) return at;
      const p = cand.p;
      p._reset();                       // clears knocked/gone and makes it visible again
      p.home.set(at.x, K.ground(at.x, at.z, 60), at.z);
      p.group.position.copy(p.home);
      p.group.rotation.set(0, 0.4, 0);  // a touch off-square so it reads as a solid
      p.scored = false;
      return at;
    })();
    /* Stand a stride short of it, on the camera's side, so the swing is across
       the frame rather than into it. */
    const SLASH_AT = { x: CRATE.x - 1.05, z: CRATE.z - 0.75 };
    stage((CRATE.x + SLASH_AT.x) / 2, (CRATE.z + SLASH_AT.z) / 2, 11);
    K.place(0, SLASH_AT.x, SLASH_AT.z, Math.atan2(CRATE.x - SLASH_AT.x, CRATE.z - SLASH_AT.z));
    K.seed(); settle(24);
    /* Twelve frames a second here, not eight: the swing and the crate going
       over take about a quarter of a second between them, which is two frames
       at the clip's normal rate — enough to miss entirely. */
    await run(1900, 'SLASH  —  F', true, (i) => {
      if (i === 3) c.down('KeyF');
      if (i === 5) c.up('KeyF');
    }, { fps: 12 });

    // 5. sprint — ACROSS the frame, not into it. She covers 12.3 units a
    //    second sprinting against 8 walking, and that difference is only
    //    legible sideways.
    stage(-113, 132, 18);
    {
      const [sx, sz] = along(-113, 132, -4.2);
      K.place(0, sx, sz, -Math.PI * 0.75);
    }
    K.seed(); settle(24);
    await run(2000, 'SPRINT  —  hold SHIFT', true, (i, n) => {
      if (i === 0) { c.down('ShiftLeft'); c.down('KeyD'); }
      if (i === Math.round(n * 0.55)) { c.up('KeyD'); c.up('ShiftLeft'); }
    });
    c.tapUp();

    /* 6. a second kitten on the same keyboard --------------------------
       THE STAGE CAMERA DOES NOT WORK WITH TWO. `setFocus` is the SPLIT-screen
       half of the camera and does nothing at all while the kittens are merged
       — and merged is what they are here, since the screen only splits beyond
       46 units and this island is 56 across, so separating them enough would
       put one of them off the edge. Measured: the first take of this beat
       filmed the sleeping dragon from 26 units with both kittens hidden
       underneath it.

       So this beat uses the game's OWN merged camera, which follows the
       centroid on the same -PI/4 yaw, and the only thing overridden is how far
       back it may sit: `_maxViewDist` is the one clamp in that path that is
       reachable from outside, and pulling it to 19 gives the same framing as
       the stages above. The centroid is offset sideways from the pillar
       because the merged camera cannot be aimed off it. */
    if (g.partySize < 2) {
      g._joinPlayer({ pad: null, half: null, keyset: 1, touch: false });
      g.picking = null;                        // no "choose your kitten" card
    }
    g.input.bindings[0].keyset = 0;
    g.input.bindings[1].keyset = 1;
    for (let i = 0; i < g.partySize; i++) K.unaim(i);
    const osMaxView = g._maxViewDist.bind(g);
    g._maxViewDist = () => 19;
    SHOT = null;
    /* The same mark the single-player beats use. Nudging it two units towards
       the dragon — which is what "put them somewhere with room" looked like —
       parked both kittens under its wing, because the merged camera centres on
       the CENTROID and cannot be aimed off it. */
    const CENTROID = { x: -113, z: 132 };
    {
      const [ax, az] = along(CENTROID.x, CENTROID.z, -2.4);
      const [bx, bz] = along(CENTROID.x, CENTROID.z, 2.4);
      K.place(0, ax, az, -Math.PI * 0.75);
      K.place(1, bx, bz, -Math.PI * 0.75);
    }
    K.seed(); settle(24);
    /* SHORT LEGS THAT CANCEL. The first cut of this beat held one direction
       for a second, which at 8 units a second walked both kittens ten units
       into the sleeping dragon and off the side of the shot — the merged
       camera follows their centroid, so they take the frame with them. Each
       key now runs a third of a second and is answered by its opposite, so
       they finish on the mark they started on. */
    const LEGS = [['KeyW', 'KeyL'], ['KeyS', 'KeyO'], ['KeyD', 'KeyK'], ['KeyA', 'Semicolon']];
    const LAST = 'TWO ON ONE KEYBOARD  —  press ENTER to join';
    await run(3000, LAST, false, (i, n) => {
      const leg = Math.floor(i / Math.max(1, Math.floor(n / 5)));
      for (let L = 0; L < LEGS.length; L++) {
        for (const code of LEGS[L]) (L === leg ? c.down(code) : c.up(code));
      }
      if (leg >= 4) { c.down('Space'); c.down('ControlRight'); }
      if (leg >= 4 && i >= n - 1) { c.up('Space'); c.up('ControlRight'); }
    }, { two: true });

    /* 7. THREE SECONDS TO READ THE LAST LINE. A clip that cuts the moment the
       last action finishes gives a reader who is still on the caption nothing
       — and it loops, so she lands back at the start mid-sentence.

       A FREEZE, NOT SLOW MOTION. The first cut of this ending ran the last
       three seconds at three frames a second so the kittens would still be
       breathing while the words stayed up. Watched back, that is
       indistinguishable from the game dropping to three fps — it reads as a
       lag spike at the exact moment the reader is deciding whether this game
       runs well. So: let them come down and stand for a beat at the clip's
       real rate, then stop dead on ONE frame that is held for three seconds.
       A deliberate freeze reads as a caption; a slow one reads as a fault. */
    c.tapUp();
    await run(700, LAST, false, null, { two: true });
    /* Six sixtieths of unrecorded game time first, so the held frame lands on
       a settled pose rather than mid-blink or mid-step. */
    for (let i = 0; i < 6; i++) { aimAll(); K.drive.step(1 / 60, 1); }
    draw(LAST, false, true);
    delays.push(3000);

    c.tapUp();
    g._maxViewDist = osMaxView;
    g._aimXray = osAimXray;
    K.xrayOff();
    for (let i = 0; i < g.partySize; i++) K.unaim(i);
    K.drive.stop(); K.showChrome();
    window.__moveFrames = { frames, delays, w: VW, h: H };
    return 'move-keys: ' + frames.length + ' frames, '
      + (delays.reduce((a, b) => a + b, 0) / 1000).toFixed(1) + 's at ' + VW + 'x' + H
;
  };

  window.__encodeMove = async function (name, { colors = 128 } = {}) {
    const S = 'http://localhost:7799', f = window.__moveFrames;
    await fetch(S + '/gif/begin?name=' + name + '&w=' + f.w + '&h=' + f.h);
    for (const fr of f.frames) await fetch(S + '/gif/frame?name=' + name, { method: 'POST', body: fr });
    const r = await fetch(S + '/gif/end?name=' + name + '&colors=' + colors + '&dither=0', {
      method: 'POST', body: JSON.stringify({ delays: f.delays }),
    });
    return await r.json();
  };

  window.__dumpMove = async function (list) {
    const S = 'http://localhost:7799';
    /* Where dumped frames go. Repo-relative, so the asset server's sandbox
       accepts it and .gitignore keeps it out of commits; set `window.__SP` to
       override. Three of these shots used to carry an ABSOLUTE path into one
       machine's session scratchpad, which is exactly the sort of thing that
       made the rig unusable to anybody else. */
    const D = (window.__SP || 'tools/capture/.out') + '/';
    const f = window.__moveFrames;
    for (const [i, name] of list) {
      const cv = document.createElement('canvas'); cv.width = f.w; cv.height = f.h;
      const x = cv.getContext('2d');
      const im = x.createImageData(f.w, f.h); im.data.set(f.frames[i]); x.putImageData(im, 0, 0);
      const b = await new Promise((r) => cv.toBlob(r, 'image/png'));
      await fetch(S + '/put?path=' + encodeURIComponent(D + name + '.png'), { method: 'POST', body: b });
    }
    return 'dumped ' + list.length + ' of ' + f.frames.length;
  };

  return 'move-keys shot ready';
})();
