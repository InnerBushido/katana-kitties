/* The Dream Dojo's Help STILLS, filmed out of the running game.

   Richard: "We should provide pictures of Lionheart, the Dream Dojo island,
   and a photo of the islands in the simulation with the islands names next to
   them as a Map Legend and overview map of the simulation and its
   activities. All the activities can be laid out like the Clan Leaders page."

   So, four kinds of picture, all of them the engine's own frames:
     dojo/arcade.jpg         the Dream Dojo island in the real archipelago
     dojo/map.jpg            the simulator from straight above, every island's
                             name written beside it — the legend. The names
                             are projected through the SAME camera that took
                             the frame, so a label cannot drift off its island.
     dojo/isle-<key>.jpg     one per island, for the cards laid out like the
                             clan leaders'
     dojo/lionheart.png      his drawing, cut from the sheet the game draws
                             him with (`/sprites/lionheart/town.png`)

   A STILL IS NOT A CLIP, so this does not use the recorder. It renders the
   real scene through its own camera at the still's exact size (the renderer is
   resized for one frame and the game's own resize handler puts it back), which
   is the only way to get a 16:9 still out of a phone-shaped pane. It is driven
   by `game._tick` rather than rAF, because the in-app browser pane does not
   fire animation frames while it is hidden.

   Call, with the bridge up and the game in play:
     for (const f of ['harness.js', 'shots/dreamdojo.js'])
       eval(await (await fetch(`http://localhost:7799/file?p=tools/capture/${f}`)).text());
     await __ddStills();                 // every still
     await __ddStills({ only: ['map'], out: 'tools/capture/.out/' });   // a proof */
window.__ddStills = async function (opts = {}) {
  const g = window.game;
  const S = 'http://localhost:7799';
  const D = g.dream;
  const out = opts.out ?? 'public/help/dojo/';
  const want = (k) => !opts.only || opts.only.includes(k);
  const V3 = g.players[0].position.constructor;
  const PC = g.players[0].camera.constructor;
  const step = async (n) => {
    for (let k = 0; k < n; k++) {
      g._tick(performance.now());
      await new Promise((r) => setTimeout(r, k % 10 === 0 ? 16 : 0));
    }
  };
  g.renderer.setAnimationLoop(null);
  const put = async (path, blob) => (await fetch(`${S}/put?path=${encodeURIComponent(path)}`, { method: 'POST', body: blob })).json();

  /* One frame of the real scene, through `cam`, at w x h (rendered at `ss`
     times that and scaled down, which is the anti-aliasing). */
  const frame = (cam, w, h, { ss = 2, fog = true } = {}) => {
    const R = g.renderer;
    const ratio = R.getPixelRatio();
    const keepFog = g.scene.fog;
    if (!fog) g.scene.fog = null;
    R.setPixelRatio(1);
    R.setSize(w * ss, h * ss, false);
    R.setScissorTest(false);
    R.setViewport(0, 0, w * ss, h * ss);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    // Every billboard turned to THIS lens, as the game does per pane (`_faceAll`):
    // without it the arcade's sign was filmed from behind, in mirror writing.
    g._faceAll?.(cam);
    R.render(g.scene, cam);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const cx = cv.getContext('2d');
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(R.domElement, 0, 0, w * ss, h * ss, 0, 0, w, h);
    g.scene.fog = keepFog;
    R.setPixelRatio(ratio);
    window.dispatchEvent(new Event('resize'));
    return cv;
  };
  const camAt = (pos, look, fov = 40) => {
    const cam = new PC(fov, 16 / 9, 0.5, 6000);
    cam.position.set(pos.x, pos.y, pos.z);
    cam.lookAt(new V3(look.x, look.y, look.z));
    return cam;
  };
  const jpeg = (cv, q = 0.84) => new Promise((r) => cv.toBlob(r, 'image/jpeg', q));
  const png = (cv) => new Promise((r) => cv.toBlob(r, 'image/png'));
  const done = {};
  const hideKittens = (on) => { for (const p of g.players) if (p.group) p.group.visible = !on; };

  const p = g.players[0];
  const SIM = { dx: 12000, dz: 0 };

  /* --- the arcade, in the real world: from out over the sea on the side
         away from the town, so the dome, the tubes and the gate all read --- */
  if (want('arcade')) {
    const ar = (await import('/src/systems/dreamdojo.js')).ARCADE;
    const u = D.layout.u;
    const v = D.layout.v;
    /* 2.6r from the other side was tried first: the dome cut off at both
       edges, and its sign — a billboard — filmed from behind. */
    const dist = opts.arcadeDist ?? ar.r * 3.3;
    const side = opts.arcadeSide ?? -0.35;
    const dir = { x: u.x + v.x * side, z: u.z + v.z * side };
    const L = Math.hypot(dir.x, dir.z);
    hideKittens(true);
    await step(4);
    const cam = camAt(
      { x: ar.x + (dir.x / L) * dist, y: ar.y + dist * (opts.arcadeUp ?? 0.5), z: ar.z + (dir.z / L) * dist },
      { x: ar.x, y: ar.y + ar.r * 0.25, z: ar.z }, opts.arcadeFov ?? 38);
    const cv = frame(cam, 1096, 616);
    done.arcade = await put(`${out}arcade.jpg`, await jpeg(cv));
    hideKittens(false);
  }

  /* Everything after this is in the simulator, so she goes in. */
  const inSim = async () => {
    if (D.st[0]?.phase === 'sim') return;
    p.dreamGeared = true;
    p.setSimLook?.(true);
    const t = D.layout.tubes[0];
    p.position.set(t.x, p.position.y, t.z);
    D._begin(p, 'rise');
    await g.loadSimArt();
    for (let i = 0; i < 80 && D.st[0]?.phase !== 'sim'; i++) await step(10);
    await step(30);
  };

  /* --- the legend: straight down, map-up is world -z (the minimap's and
         Lionheart's map's orientation, so all three agree), every island's
         name projected through this camera --- */
  if (want('map')) {
    await inSim();
    hideKittens(true);
    await step(4);
    const dc = g.world.dojoCentre;
    const pts = [{ x: dc.x, z: dc.z, r: 50 }, ...Object.values(D.isles), D.sim.portDeck];
    const minX = Math.min(...pts.map((q) => q.x - q.r));
    const maxX = Math.max(...pts.map((q) => q.x + q.r));
    const minZ = Math.min(...pts.map((q) => q.z - q.r));
    const maxZ = Math.max(...pts.map((q) => q.z + q.r));
    const cx = (minX + maxX) / 2 + SIM.dx;
    const cz = (minZ + maxZ) / 2 + SIM.dz;
    const W = 1096;
    const H = 760;
    const fov = 30;
    const span = Math.max((maxX - minX) * H / W, maxZ - minZ) * (opts.mapPad ?? 1.22);
    const hgt = span / 2 / Math.tan((fov / 2) * Math.PI / 180);
    // Up is -z: a camera straight overhead, nudged a hair south so lookAt has a
    // defined "up" and screen-up lands on -z.
    const cam = camAt({ x: cx, y: dc.y + hgt, z: cz + 0.001 }, { x: cx, y: dc.y, z: cz }, fov);
    cam.up.set(0, 0, -1);
    cam.lookAt(new V3(cx, dc.y, cz));
    const cv = frame(cam, W, H, { fog: false });
    const ctx = cv.getContext('2d');
    const ISL = await import('/src/systems/dream/islands.js');
    const proj = (x, y, z) => {
      const q = new V3(x, y, z).project(cam);
      return { x: (q.x + 1) / 2 * W, y: (1 - q.y) / 2 * H };
    };
    const label = (text, x, y, size, fill) => {
      ctx.font = `${size}px Bangers, 'Arial Black', sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.28;
      ctx.strokeStyle = 'rgba(4,16,24,0.95)';
      ctx.strokeText(text, x, y);
      ctx.fillStyle = fill;
      ctx.fillText(text, x, y);
    };
    for (const [key, I] of Object.entries(D.isles)) {
      const spec = ISL.ISLANDS[key];
      const c0 = proj(I.x + SIM.dx, I.y, I.z + SIM.dz);
      const e = proj(I.x + SIM.dx + I.r, I.y, I.z + SIM.dz);
      const rpx = Math.abs(e.x - c0.x);
      const ox = c0.x - proj(dc.x + SIM.dx, dc.y, dc.z + SIM.dz).x;
      const oy = c0.y - proj(dc.x + SIM.dx, dc.y, dc.z + SIM.dz).y;
      const L = Math.hypot(ox, oy) || 1;
      const lx = c0.x + (ox / L) * (rpx + 34);
      const ly = c0.y + (oy / L) * (rpx + 26);
      label(spec.kanji, lx, ly - 4, 24, '#5ff6ff');
      label(ISL.ISLE_ABOUT[key].short, lx, ly + 22, 26, '#ffffff');
    }
    const hub = proj(dc.x + SIM.dx, dc.y, dc.z + SIM.dz);
    label('DOJO OF THE', hub.x, hub.y - 4, 18, '#ffd24a');
    label('TURNING CIRCLE', hub.x, hub.y + 16, 18, '#ffd24a');
    const pd = D.sim.portDeck;
    const pc = proj(pd.x + SIM.dx, pd.y ?? dc.y, pd.z + SIM.dz);
    const po = { x: pc.x - hub.x, y: pc.y - hub.y };
    const pl = Math.hypot(po.x, po.y) || 1;
    label('YOUR TUBES', pc.x + (po.x / pl) * 44, pc.y + (po.y / pl) * 30 + 8, 22, '#ffb8f0');
    done.map = await put(`${out}map.jpg`, await jpeg(cv, 0.86));
    hideKittens(false);
  }

  /* --- one per island, A FEW SECONDS INTO ITS OWN DRILL, with her in it.
         Idle, half of them were an empty disc — the Range, the Sentries and
         the Shadow have nothing standing on them until a drill puts it
         there — and a card of an empty disc teaches nothing. So she walks
         onto the station whose prompt matches, presses it, and the frame is
         taken `secs` later; the drill is thrown away after. The Trial Hall and
         the Gallery are filmed as they stand: the six leaders and the
         thirteen pedestals ARE the activity, and a Gallery trial takes her off
         the island onto a floor of its own. --- */
  const LIVE = {
    gallery: null, hall: null, range: { on: /ONE SWING/, secs: 4 },
    kata: { on: /DAILY/, secs: 5, her: true }, storm: { on: /STORM/, secs: 6 },
    /* The course is not a station: she JOINS at its kiosk and the run is the
       session's (dream/sine.js). And it is filmed WIDE, from the side its own
       camera looks from, because the card's job is to show one course snaking
       across the island — over her shoulder it was three bars and a wall. */
    sine: { join: 'sine', secs: 5, wide: true },
    school: { on: /FEAST/, secs: 6 }, sentries: { on: /SENTRIES/, secs: 6 },
    bamboo: { on: /INFILTRATION/, secs: 4 }, shadow: { on: /EASY/, secs: 6 },
  };
  const until = async (secs) => {
    const t0 = performance.now();
    while (performance.now() - t0 < secs * 1000) await step(5);
  };
  /* The list is islands.js's, not `D.isles`: that only exists once a kitten
     is in the simulator, so asking for one island before going in filmed
     nothing and returned {}. */
  const ISLES = (await import('/src/systems/dream/islands.js')).ISLANDS;
  const keys = Object.keys(D.isles ?? ISLES).filter((k) => want(`isle-${k}`) || want('isles'));
  if (keys.length) {
    await inSim();
    const dc = g.world.dojoCentre;
    for (const key of keys) {
      const I = D.isles[key];
      if (!I) continue;
      const live = LIVE[key];
      const st = live?.on && D.stations.find((x) => Math.hypot(x.x - I.x, x.z - I.z) < I.r + 2 && live.on.test(x.prompt(p, 'E')));
      if (live?.join) {
        D[live.join].join(p);
        await until(live.secs);
      } else if (st) {
        p.position.set(st.x + SIM.dx, st.y + 0.5, st.z + SIM.dz);
        p.velocity?.set(0, 0, 0);
        await step(6);
        st.interact(p);
        await until(live.secs);
      } else {
        hideKittens(true);
        await step(4);
      }
      /* From BEHIND HER, looking across the island: her stations are on the
         hub side, so a lens on the island's centre from the hub framed either
         a tiny disc (far) or the drill without her in it (near). Over her
         shoulder, she is in the foreground and what she is doing is behind. */
      const ox = I.x - dc.x;
      const oz = I.z - dc.z;
      const L = Math.hypot(ox, oz) || 1;
      // Where she IS once the drill has her, not the station she pressed: the
      // kata puts her on her own floor, a third of the island away.
      const at = st ? { x: p.position.x - SIM.dx, z: p.position.z - SIM.dz } : null;
      const from = at && Math.hypot(at.x - I.x, at.z - I.z) < I.r ? at
        : { x: I.x - (ox / L) * I.r * 0.6, z: I.z - (oz / L) * I.r * 0.6 };
      const back = I.r * (opts.isleBack ?? 0.75);
      const up = I.r * (opts.isleUp ?? 0.7);
      /* The kata is the one drill that happens on HER floor, off to the side:
         aimed at the island's middle, she was cut in half on the frame's
         edge. So that one looks at her, from out past her on the line from the
         middle. */
      const herShot = live?.her && at;
      let cam;
      if (live?.wide) {
        const yaw = D[live.join]._yaw();
        // 1.25 r back and 1.05 up was tried first: the whole course, under a
        // third of a frame of empty sky.
        const back = I.r * (opts.wideBack ?? 1.0);
        cam = camAt(
          { x: I.x + Math.sin(yaw) * back + SIM.dx, y: I.y + I.r * (opts.wideUp ?? 0.95), z: I.z + Math.cos(yaw) * back + SIM.dz },
          { x: I.x + SIM.dx, y: I.y, z: I.z + SIM.dz }, 50);
      } else if (herShot) {
        const hx = at.x - I.x;
        const hz = at.z - I.z;
        const hl = Math.hypot(hx, hz) || 1;
        cam = camAt(
          { x: at.x + (hx / hl) * I.r * 0.55 + SIM.dx, y: I.y + I.r * 0.45, z: at.z + (hz / hl) * I.r * 0.55 + SIM.dz },
          { x: at.x - (hx / hl) * 3 + SIM.dx, y: I.y + 1.5, z: at.z - (hz / hl) * 3 + SIM.dz }, 50);
      } else {
        cam = camAt(
          { x: from.x - (ox / L) * back + SIM.dx, y: I.y + up, z: from.z - (oz / L) * back + SIM.dz },
          { x: I.x + SIM.dx, y: I.y + 1.5, z: I.z + SIM.dz }, 50);
      }
      const cv = frame(cam, 480, 300);
      done[`isle-${key}`] = await put(`${out}isle-${key}.jpg`, await jpeg(cv, 0.82));
      if (live?.join) D[live.join].reset?.();
      const d = D.drills[0];
      if (d) { d.dispose(); D.drills[0] = null; }
      D.closeChoice?.(p);
      hideKittens(false);
      const dcp = { x: dc.x + SIM.dx, z: dc.z + SIM.dz };
      p.position.set(dcp.x + 20, dc.y + 0.5, dcp.z);
      await step(10);
    }
  }

  /* --- his drawing: the whole figure, cropped to its own bounds --- */
  if (want('lionheart')) {
    const img = new Image();
    // onload, not decode(): decode() never settled in the in-app browser
    // while its pane was hidden.
    await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = '/sprites/lionheart/town.png'; });
    const a = document.createElement('canvas');
    a.width = img.width; a.height = img.height;
    const ax = a.getContext('2d', { willReadFrequently: true });
    ax.drawImage(img, 0, 0);
    // MEASURED, not assumed: the opaque bounds of the drawing.
    const d = ax.getImageData(0, 0, a.width, a.height).data;
    let x0 = a.width; let y0 = a.height; let x1 = 0; let y1 = 0;
    for (let y = 0; y < a.height; y++) {
      for (let x = 0; x < a.width; x++) {
        if (d[(y * a.width + x) * 4 + 3] > 24) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      }
    }
    const H = opts.lionH ?? 360;
    const k = H / (y1 - y0 + 1);
    const cv = document.createElement('canvas');
    cv.width = Math.round((x1 - x0 + 1) * k); cv.height = H;
    const cx2 = cv.getContext('2d');
    cx2.imageSmoothingQuality = 'high';
    cx2.drawImage(a, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 0, 0, cv.width, cv.height);
    done.lionheart = { ...(await put(`${out}lionheart.png`, await png(cv))), w: cv.width, h: cv.height, bounds: [x0, y0, x1, y1] };
  }
  return done;
};
