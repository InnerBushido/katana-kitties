/* "Clan abilities" — the three clips for the arena's clan-powers card.
   =======================================================================
   `clan-steal`  — 盗 Steal Mischief (Icewhisker): mark her, hit her inside the
                   window, the Kotodama falls on the deck and refuses everybody
                   for a few seconds, then anybody can grab it.
   `clan-breath` — 息 Dragon Breath (Windwhisker): rear back, breathe; then the
                   other kitten does it back and a blade cannot stop it.
   `clan-panda`  — Pandapaw: ride the grown panda, the claw lands, the panda is
                   knocked back down to a cub — CUT — and the cub licks a kitten
                   who is low on health.

   THE STAGE IS `move-arena`'S, NOT A NEW ONE. Same ring, same camera angle
   (pitch 0.52, the game's own yaw — pulled in from 31 to 19 along its own ray,
   see `settle`), same caption strip, same two diagrams — `shots/fight.js`
   hands its rig out as `window.__mvKit` and this file borrows it. A reader who
   has just watched "Fighting in the arena" is looking at the same picture with
   one new button lit, which is the lesson. So `fight.js` has to be eval'd first.

   DO NOT EDIT index.html OR ANYTHING UNDER src/ WHILE A TAKE IS IN MEMORY.
   Vite hot-reloads the page on the save, and the frames, the rig and the
   staged round go with it — one finished steal take was lost that way between
   filming and `__encodeMv`. Tools/ is not watched; the page is.

   ACTION IS THE BUTTON THE CLIPS ARE ABOUT, and it is lit off the game's own
   input state like every other key in these diagrams: `E` on Ember's
   keyboard, `○` on Frost's pad. If a press is swallowed the key stays dark.

   THE ROUND IS REAL, exactly as in `move-arena`: `Tournament.begin()` then
   straight to `live`, so `arenaLive` is true and every blow, mark, flame and
   claw goes through `Game.strikePlayers`. What is staged, and only between
   beats, is the SET-UP a real afternoon would have taken an hour to reach:
   the oaths, which orbs are worn, the forty canes of bamboo, and — at the one
   cut in the panda clip — Ember's health, so the cub has a reason to come.

   EVERY PRESS IS FIRED OFF STATE (is she in reach, is the orb unlocked, has
   the panda collapsed) with a frame cap as the fallback, for the reason
   `fight.js` gives at length: a beat that only works from one starting
   position has to be re-timed every take.

   Call: eval harness.js, movekit.js, shots/fight.js, then this. Then
     `await __stealShot()`  → `await __encodeMv('clan-steal', { w: 512 })`
     `await __breathShot()` → `await __encodeMv('clan-breath', { w: 512 })`
     `await __pandaArenaShot()` → `await __encodeMv('clan-panda', { w: 512 })`
   Each shot takes longer than a browser eval allows: kick it off with
   `.then(v => window.__S = v)` and poll. */
(() => {
  const g = window.game, c = window.__cap, K = window.__mk, M = window.__mvKit;
  if (!M) return 'eval shots/fight.js first — this borrows its rig';
  const { rig, P1, P2, allUp, R, F, V3 } = M;

  const ARENA_DOM = ['arena-hud', 'arena-banner', 'arena-result', 'announce', 'join-card'];
  const ring = () => g.world.arenaRing;
  /* Along SCREEN-RIGHT, as `move-arena` posts its fighters: a distance along
     `R` changes NDC x and nothing else, so both kittens stay one size. `v` is
     UP the screen (away from the camera), for the few beats that need depth. */
  const mark = (u, v = 0) => ({ x: ring().x + R.x * u + F.x * v, z: ring().z + R.z * u + F.z * v });
  const faceR = Math.atan2(R.x, R.z), faceL = Math.atan2(-R.x, -R.z);
  const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  /* The log every take returns. The clip is judged by eye AND by these: a
     frame that looks right while `stealMarked` was false is a take of the
     wrong thing. */
  let LOG = [];
  /* WHERE ON THE MASTER FRAME, in pixels of the 768x432 game area: feet and
     head of each kitten, and the loose orb if there is one. The two diagrams
     own the bottom of the frame — the keyboard panel's top edge is y≈276 left
     of x≈232, the pad's ears start at y≈235 right of x≈516 — so a take is only
     good if these stay above those lines. Read off the camera that DREW the
     frame, which is `rigs[0]` because `place` forces one merged group. */
  const onFrame = (pos, up = 0) => {
    const cam = g.rigs[0].camera;
    const v = new V3(pos.x, pos.y + up, pos.z).project(cam);
    return [Math.round((v.x + 1) / 2 * 768), Math.round((1 - v.y) / 2 * 432)];
  };
  const note = (what) => {
    const [p, q] = g.players;
    const pk = (g.kotodama?.pickups ?? []).find((k) => !k.taken && flat(k.position, ring()) < 45);
    LOG.push({
      what,
      px: { ember: [onFrame(p.position), onFrame(p.position, 2.9)], frost: [onFrame(q.position), onFrame(q.position, 2.9)], orb: pk ? onFrame(pk.position) : null },
      gap: +flat(p.position, q.position).toFixed(2),
      hp: [+p.hp.toFixed(1), +q.hp.toFixed(1)],
      orbs: [p.powerOrbs.length, q.powerOrbs.length],
      marked: !!p.stealMarked,
      loose: (g.kotodama?.pickups ?? []).filter((k) => !k.taken && flat(k.position, ring()) < 45)
        .map((k) => +(k.lockT ?? 0).toFixed(2)),
      breath: [+(p.breathChargeT ?? 0).toFixed(2), +(p.breathFireT ?? 0).toFixed(2),
        +(q.breathChargeT ?? 0).toFixed(2), +(q.breathFireT ?? 0).toFixed(2)],
      panda: p.panda ? { tier: p.panda.tier, hp: +p.panda.hp.toFixed(1), ridden: !!p.pandaMount, lick: p.panda.licking } : null,
      u: [p, q].map((w) => +((w.position.x - ring().x) * R.x + (w.position.z - ring().z) * R.z).toFixed(1)),
    });
  };

  /* --- steering by synthesized keys, towards a world point ---
     W walks along `F` and D along `R` (the camera shares the game's yaw), so a
     heading is two dot products and a dead zone. Tracked per player so a key
     is only ever put down or lifted on a change — a held key re-pressed every
     frame is a fresh edge to anything that reads `pressed`. */
  const heldBy = [new Set(), new Set()];
  const setKeys = (i, keys, want) => {
    const set = heldBy[i];
    for (const k of set) if (!want.has(k)) { c.up(k); set.delete(k); }
    for (const k of want) if (!set.has(k)) { c.down(k); set.add(k); }
  };
  const steer = (i, keys, to, stopAt = 0.8, extra = []) => {
    const w = g.players[i];
    const dx = to.x - w.position.x, dz = to.z - w.position.z;
    const want = new Set(extra);
    if (Math.hypot(dx, dz) > stopAt) {
      const r = dx * R.x + dz * R.z, f = dx * F.x + dz * F.z, n = Math.hypot(r, f) || 1;
      if (r / n > 0.38) want.add(keys.right); else if (r / n < -0.38) want.add(keys.left);
      if (f / n > 0.38) want.add(keys.up); else if (f / n < -0.38) want.add(keys.down);
    }
    setKeys(i, keys, want);
  };
  const stopKeys = (i, keys) => setKeys(i, keys, new Set());
  /* A press held for `hold` frames and then let go — held long enough for the
     DIAGRAM to show it, which is longer than the game needs to read the edge. */
  const presser = () => {
    const live = [];
    return {
      press(key, hold = 5) { c.down(key); live.push([key, hold]); },
      tick() {
        for (let k = live.length - 1; k >= 0; k--) {
          if (--live[k][1] <= 0) { c.up(live[k][0]); live.splice(k, 1); }
        }
      },
      clear() { for (const [key] of live) c.up(key); live.length = 0; },
    };
  };

  /* A beat that lasts until something HAPPENS, in chunks, capped. `run` fixes
     its frame count up front, so a beat keyed to "until the panda falls" is a
     run of short runs under one caption. `plan` gets a frame counter that
     survives the chunking. */
  const runUntil = async (rg, maxMs, plan, done, opts = {}) => {
    let f = 0, spent = 0;
    const CH = 250;
    while (spent < maxMs) {
      await rg.run(CH, () => { plan(f++); }, { ...opts, hold: 0 });
      spent += CH;
      if (done()) break;
    }
    return { ms: spent, done: done() };
  };

  /* ------------------------------------------------------------ set-up */
  const setup = async ({ clans, orbs }) => {
    c.play(); c.bindKB(); allUp();
    heldBy.forEach((s) => s.clear());
    await K.padInit();
    K.hideChrome();
    for (const id of ARENA_DOM) {
      const el = document.getElementById(id);
      if (el && el.style.display !== 'none') { el.style.display = 'none'; el.__clHidden = true; }
    }
    K.startMirror();

    /* SHUT ANY ROUND BEHIND THE LAST TAKE FIRST. `finish` settles the loans,
       which is what puts a stolen orb back on the kitten it came off; resetting
       the orbs before it would let `settleLoans` hand one back on top. */
    g.tournament?.finish();
    const W = await import('/src/world/world.js');

    for (const w of g.players) {
      if (w.pandaMount) { w.pandaMount.rider = null; w.pandaMount = null; }
      w.mount = null; w.rideAlong = null;
      w.flySide = 0; w.dismountEase = 0; w.camDist = 26;
      w.aloftT = 0; w.velocity.set(0, 0, 0);
      w._endMark?.();
      w.stealCool = 0; w.breathCool = 0; w.breathChargeT = 0; w.breathFireT = 0;
    }
    g.starShot = null;

    /* Anything a previous take left lying on the deck. */
    for (const pk of g.kotodama?.pickups ?? []) {
      if (!pk.taken && flat(pk.position, ring()) < 45) { g.scene.remove(pk.group); pk.taken = true; }
    }
    if (g.kotodama) g.kotodama.loans = [];

    g.players.forEach((w, i) => {
      const clan = W.CLANS.find((k) => k.id === clans[i]) ?? null;
      w.clan = clan;
      if (clan) w.clanRing.material.color.set(clan.color);
      g._updateClanBadge?.(w);
      w.setPowerOrbs([...(orbs[i] ?? [])]);
      g.syncOrbMeshes(w);
    });

    const wasOpen = g.world.arenaOpen;
    g.world.openArena(true);
    g.tournament.begin();
    g.tournament.state = 'live';
    g.tournament.t = 0;
    /* `begin` fills the bars off `maxHp`, which the orbs just changed — so the
       fill has to come after the orbs, and the clocks after `begin`. */
    for (const w of g.players) { w.stealCool = 0; w.breathCool = 0; }
    /* NO RING SNACKS IN THESE THREE, and that is a teaching call rather than a
       saving. The first steal take had a hare the size of a kitten sprint
       through the foreground on the beat the orb fell, and a rat cross the
       mark — the animals are the Battle Feast's lesson, filmed in its own clip,
       and in this one they were the busiest thing on screen. `stop` is the
       tournament's own "nothing survives the ring" call. */
    g.menagerie?.stop?.();
    LOG = [];
    return wasOpen;
  };

  const teardown = (rg, wasOpen, name) => {
    allUp();
    heldBy.forEach((s) => s.clear());
    K.drive.stop();
    K.showChrome();
    g.tournament.finish();
    if (!wasOpen) g.world.openArena(false);
    for (const id of ARENA_DOM) {
      const el = document.getElementById(id);
      if (el && el.__clHidden) { el.style.display = ''; delete el.__clHidden; }
    }
    window.__mvFrames = { frames: rg.frames, delays: rg.delays, w: 768, h: 498 };
    const ms = rg.delays.reduce((a, b) => a + b, 0);
    window.__clanLog = LOG;
    return `${name}: ${rg.frames.length} frames, ${(ms / 1000).toFixed(2)}s`;
  };

  /* THE CAMERA IS `move-arena`'S ANGLE, PULLED IN ALONG ITS OWN RAY.
     At `move-arena`'s distance of 31 a kitten is ~52px tall on the master and
     27 in the published clip, which is right for a sprint across the deck and
     useless for a mark ring round somebody's feet or an orb lying on the
     floor — the first steal take had both, and both were specks. The angle
     was liked, so it is kept; only the distance moves (the skill's rule: zoom
     with distance, never with pitch).

     AND THE AIM POINT COMES 2.5 UNITS TOWARDS THE LENS, which puts the deck
     the kittens stand on ABOVE the middle of the frame. Measured with the
     real camera before filming, at d20: feet at y≈201 and heads at y≈125, the
     action from u=-9 to u=+6 spanning x 162..579 — clear of the pad's ears
     (y≈235) and the keyboard panel (y≈276). At d19 a kitten is ~80px tall and
     the frame holds about thirteen units either side of centre, which every
     mark below is placed against. */
  const DIST = 19, AIM_V = -2.5;
  /* The aim offset SCALES WITH THE DISTANCE, so the deck lands on the same
     line of the frame at any distance — a fixed 2.5 units is a sixth of the
     frame at 19 and a ninth at 27, and the kittens would drift down into the
     diagrams the moment the camera backed off (the skill's "express aim as a
     fraction of the frame"). */
  const aimAt = (centreU, dist) => {
    const C = mark(centreU, AIM_V * dist / DIST);
    return new V3(C.x, ring().y + 0.8, C.z);
  };
  const settle = (rg, centreU = 0, dist = DIST) => {
    K.seed();
    rg.stage(aimAt(centreU, dist), dist, 0.52);
    for (let i = 0; i < 24; i++) K.drive.step(1 / 60, 1);
    K.drive.start();
  };

  const KB_ACTIONS = [
    { label: 'SPACE', act: 'jump', w: 58 }, { label: 'F', act: 'attack', w: 30 },
    { label: 'E', act: 'interact', w: 30 }, { label: 'SHIFT', act: 'sprint', w: 50 },
  ];

  /* -------------------------------------------------------------- steal */
  window.__stealShot = async function () {
    const p = g.players[0], q = g.players[1];
    if (!q) return 'need two kittens — join one first';
    /* SHE WEARS THREE, SO ONE COMING OFF IS SOMETHING YOU CAN COUNT. The worn
       orbs circle her; the one that is knocked loose drops out of the ring of
       them and lands on the deck. Ember wears none, so she has room to take
       it and the circle round her going from nothing to one is the payoff. */
    const wasOpen = await setup({ clans: ['ice', null], orbs: [[], ['swift', 'leap', 'reach']] });
    const rg = rig(KB_ACTIONS);
    /* SIX UNITS APART: `STEAL.range` is 7, and a mark pressed at the very edge
       of it is a take that sometimes marks and sometimes toasts "point it at a
       fighter". */
    const A = mark(-8), B = mark(-2);
    K.place(0, A.x, A.z, faceR, ring().y);
    K.place(1, B.x, B.z, faceL, ring().y);
    settle(rg);
    note('start');

    await rg.linger(1400, { cap: '盗 STEAL MISCHIEF — ICEWHISKER' });

    /* 1 — the mark. ACTION, facing her. The ring that appears round Frost's
       feet is in EMBER'S colour and shrinks as the window runs out; that ring
       is the whole of what the caption means by "marked". */
    const k1 = presser();
    await rg.run(2400, (i) => {
      k1.tick();
      if (i === 2) k1.press(P1.interact, 6);
    }, { cap: 'ACTION AT HER — SHE IS MARKED' });
    k1.clear();
    note('after mark');

    /* 2 — the hit, inside the window. The dash slash, for the reason
       `move-arena` gives: a standing slash is indistinguishable from a miss at
       this size, a kitten being THROWN is not. Fired by distance. */
    /* THE KEYS COME UP ON THE FRAME OF THE CUT, not four frames after it. The
       first take held sprint through the swing and she coasted three units
       past the blow — straight onto the orb it had just knocked loose, so the
       orb spent its whole locked window hidden under her with its beacon
       coming out of her head. */
    const k2 = presser();
    let cut = -1;
    await rg.run(1900, (i) => {
      k2.tick();
      if (cut < 0) steer(0, P1, q.position, 0, [P1.sprint]);
      if (cut < 0 && i > 1 && flat(p.position, q.position) <= 3.6) { k2.press(P1.attack, 5); cut = i; stopKeys(0, P1); }
    }, { cap: 'HIT HER BEFORE THE RING RUNS OUT', hot: true });
    k2.clear(); stopKeys(0, P1);
    note('after hit');

    /* 3 — the orb on the deck, refusing everybody. Both of them go to it and
       NEITHER can take it: that standoff is what `STEAL.lock` exists to make.
       THEY FLANK IT, ONE EACH SIDE ALONG SCREEN-RIGHT. The first take sent them
       both at the orb from the same side and they finished stacked on top of
       each other and of it — three things in one place, none of them readable.
       Either side of it, the orb sits visibly between two kittens who want it. */
    const loose = () => (g.kotodama?.pickups ?? []).find((k) => !k.taken && flat(k.position, ring()) < 45);
    const side = (pk, s) => ({ x: pk.position.x + R.x * s, z: pk.position.z + R.z * s });
    await runUntil(rg, 3600, () => {
      const pk = loose();
      if (!pk) { stopKeys(0, P1); stopKeys(1, P2); return; }
      steer(0, P1, side(pk, -2.6), 0.5);
      steer(1, P2, side(pk, +2.6), 0.5);
    }, () => { const pk = loose(); return !pk || pk.lockT <= 0.15; },
    { cap: 'IT FALLS OFF — TOO HOT TO GRAB' });
    note('lock over');

    /* 4 — and then it is anybody's. Both go for it; Ember gets there, because
       her circle of orbs going from none to one is the thing to see — Frost
       sets off a quarter of a second late, which is all it takes. */
    await runUntil(rg, 2500, (f) => {
      const pk = loose();
      if (pk) steer(0, P1, pk.position, 0.2); else stopKeys(0, P1);
      if (pk && f >= 4) steer(1, P2, pk.position, 1.4); else stopKeys(1, P2);
    }, () => !loose(), { cap: 'NOW ANYBODY CAN GRAB IT!', hot: true });
    stopKeys(0, P1); stopKeys(1, P2);
    note('grabbed');
    await rg.linger(1500, { cap: 'NOW ANYBODY CAN GRAB IT!' });
    note('end');

    return teardown(rg, wasOpen, 'steal');
  };

  /* ------------------------------------------------------------- breath */
  window.__breathShot = async function () {
    const p = g.players[0], q = g.players[1];
    if (!q) return 'need two kittens — join one first';
    /* BOTH ARE WINDWHISKER, so the second half can be the same move on the
       other device — and the two flames come out in two different colours,
       which is the point `DBREATH.hot`'s comment makes: a cone says whose it
       is before it says what it is. */
    const wasOpen = await setup({ clans: ['wind', 'wind'], orbs: [[], []] });
    const rg = rig(KB_ACTIONS);
    /* SIX APART, inside the 8.5 of `DBREATH.range` with room for the cone's
       tip to reach past her. */
    const A = mark(-9), B = mark(-3);
    K.place(0, A.x, A.z, faceR, ring().y);
    K.place(1, B.x, B.z, faceL, ring().y);
    settle(rg);
    note('start');

    await rg.linger(1400, { cap: '息 DRAGON BREATH — WINDWHISKER' });

    /* 1 — ACTION, and the rear-back everybody can see coming, then the flame.
       One caption across both halves: the charge is 0.8s, and a caption that
       changed inside it would be gone before a child had read three words. */
    const k1 = presser();
    await rg.run(2600, (i) => {
      k1.tick();
      if (i === 2) k1.press(P1.interact, 6);
    }, { cap: 'ACTION — BREATHE IN… AND FIRE!', hot: true });
    k1.clear();
    note('after ember breath');
    await rg.linger(900, { cap: 'ACTION — BREATHE IN… AND FIRE!' });

    /* 2 — her turn, on the pad, and Ember tries to stop it. She sprints in;
       Frost presses ACTION when Ember is close (state, not frame), Ember's
       slash lands INSIDE the charge, and Frost does not budge. The flame comes
       out anyway, point blank. */
    const k2 = presser();
    let frostGo = -1, emberCut = -1;
    await rg.run(3200, (i) => {
      k2.tick();
      const gap = flat(p.position, q.position);
      if (emberCut < 0) steer(0, P1, q.position, 0, [P1.sprint]);
      if (frostGo < 0 && i > 1 && gap <= 6.5) { k2.press(P2.interact, 6); frostGo = i; }
      if (frostGo >= 0 && emberCut < 0 && gap <= 3.4) { k2.press(P1.attack, 5); emberCut = i; stopKeys(0, P1); }
    }, { cap: 'HITTING HER WILL NOT STOP IT' });
    k2.clear(); stopKeys(0, P1);
    note('after frost breath');
    await rg.linger(1300, { cap: 'HITTING HER WILL NOT STOP IT' });
    note('end');

    return teardown(rg, wasOpen, 'breath');
  };

  /* -------------------------------------------------------------- panda */
  window.__pandaArenaShot = async function () {
    const p = g.players[0], q = g.players[1];
    if (!q) return 'need two kittens — join one first';
    const wasOpen = await setup({ clans: ['panda', null], orbs: [[], []] });

    /* A GROWN PANDA, BY THE GAME'S OWN LADDER. Forty canes through
       `_updatePanda` twice — cub, then adult — rather than constructing an
       adult by hand, so the animal that fights here is the one a real
       afternoon grows. Any panda left over from a take is taken out first: a
       collapsed one is `knockedDown` and `_updatePanda` will not grow it. */
    if (p.panda) { g.scene.remove(p.panda.group); p.panda = null; }
    p.raisedPanda = true; p.bambooCut = 0; p.pandaFedFrom = null;
    p.bambooCut = 20; g._updatePanda(p);
    p.bambooCut = 40; g._updatePanda(p);
    p.panda.resetHp();

    const rg = rig([...KB_ACTIONS, { label: 'Q', act: 'mount', w: 30 }]);
    const A = mark(-10), B = mark(4);
    K.place(0, A.x, A.z, faceR, ring().y);
    K.place(1, B.x, B.z, faceL, ring().y);
    /* The panda beside her, a little up the screen so its drawing does not
       sit over hers — inside `mountRadius` (its drawn height) so the press
       takes. */
    const pa = mark(-12, 1.5);
    p.panda.position.set(pa.x, ring().y, pa.z);
    p.panda.velocity.set(0, 0, 0);
    /* THE GROWN HALF IS FILMED FROM 27, NOT 19. A kitten is 2.9 units tall and
       a kitten SITTING ON A GROWN PANDA is 7.6 — measured off the first take,
       where at 19 Ember's head was above the top of the frame on every frame
       she rode and the panda at u=-12 was cut by the left edge. Same angle, so
       it is a zoom and nothing else; centred on u=-2, between where the panda
       starts and where the claw throws Frost to (u≈+7.6). */
    settle(rg, -2, 27);
    note('start');

    await rg.linger(1400, { cap: 'PANDAPAW — YOUR PANDA FIGHTS TOO' });

    /* 1 — climb on. */
    const k1 = presser();
    await rg.run(1700, (i) => {
      k1.tick();
      if (i === 3) k1.press(P1.mount, 6);
    }, { cap: 'RIDE — CLIMB ON YOUR BIG PANDA' });
    k1.clear();
    note('after mount');

    /* 2 — ride at her and swipe. The claw reaches further than a blade
       (`CLAW.range`) and a panda moves at twice her speed, so the press is
       fired a good way out, by distance. */
    const k2 = presser();
    let swipe = -1;
    await rg.run(2300, (i) => {
      k2.tick();
      if (swipe < 0) steer(0, P1, q.position, 0);
      if (swipe < 0 && i > 1 && flat(p.position, q.position) <= 5.2) { k2.press(P1.attack, 5); swipe = i; stopKeys(0, P1); }
    }, { cap: 'SLASH — ITS CLAW HITS HARDER', hot: true });
    k2.clear(); stopKeys(0, P1);
    note('after claw');

    /* 3 — Frost takes the animal down. It has its own bar — thirty per cent of
       Ember's — and nothing on screen draws it, so the caption says it and the
       collapse shows it. She walks in and cuts at the PANDA, again and again,
       until `fighter` goes false. */
    const k3 = presser();
    let lastCut = -99;
    const up = () => p.panda && p.panda.fighter;
    await runUntil(rg, 6000, (f) => {
      k3.tick();
      if (!up()) { stopKeys(1, P2); return; }
      const gap = flat(q.position, p.panda.position);
      steer(1, P2, p.panda.position, 3.0);
      if (gap <= 5.0 && f - lastCut >= 8) { k3.press(P2.attack, 4); lastCut = f; }
    }, () => !up(), { cap: 'IT HAS ITS OWN HEALTH…' });
    k3.clear(); stopKeys(1, P2);
    note('after collapse');
    await rg.linger(1600, { cap: '…KNOCK IT OUT AND IT IS A CUB AGAIN' });

    /* ---- THE CUT. ----
       Part two is a different idea — the cub as a nurse — and it needs Ember
       under `PANDA.lickBelow` of her bar, which a real round reaches by losing
       and a clip cannot afford to film. So her health is SET at the cut, on a
       caption change, where the reader is already being told a new thing is
       starting; everything after it is the game. Frost steps back out of it. */
    allUp(); heldBy.forEach((s) => s.clear());
    const A2 = mark(-4), B2 = mark(10);
    K.place(0, A2.x, A2.z, faceR, ring().y);
    K.place(1, B2.x, B2.z, faceL, ring().y);
    const cub = mark(-9, 1.0);
    p.panda.position.set(cub.x, ring().y, cub.z);
    p.panda.velocity.set(0, 0, 0);
    p.hp = Math.round(p.maxHp * 0.22);
    /* ...AND THE CUB HALF COMES BACK IN TO 19, ON THE CUT. A cub is kitten-
       sized, and the lick is a tongue and a few green motes — at 27 they are a
       smudge. The caption changes on this same frame, so the reader is already
       being told a new thing is starting; the camera changing with it reads as
       a cut, not a jump. */
    rg.stage(aimAt(0, DIST), DIST, 0.52);
    note('cut');

    await rg.run(1700, null, { cap: 'LOW ON HEALTH? YOUR CUB COMES RUNNING' });
    note('cub arriving');
    await runUntil(rg, 3000, () => {}, () => false, { cap: 'IT LICKS YOU BETTER' });
    note('licking');
    await rg.linger(1200, { cap: 'IT LICKS YOU BETTER' });
    note('end');

    return teardown(rg, wasOpen, 'panda');
  };

  return 'clan-shot loaded';
})();
