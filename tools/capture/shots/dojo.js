/* Dojo GIF, SPLIT into two synced clips from ONE run:
     dojo-world.gif   — the 3D turning-circle (WebGL mirror; the board is a DOM
                        overlay so the mirror already excludes it — clean 3D).
     dojo-sincos.gif  — the sin/cos board (mathdojo.boardCanvas) snapshotted at
                        the SAME capture tick, so its playhead/values line up
                        frame-for-frame with the 3D even at variable fps.

   The two are captured in the recorder's single `snap()`: the overlay callback
   grabs the board into its own buffer right before the 3D frame is pushed, so
   they can never drift. Encode is two calls (the built-in encode for the 3D,
   and a manual POST of the board buffer as a second clip).

   Motion is deterministic: the player is teleported to a maths point each
   captured frame, so she IS the point. Phase 1 sweeps the rim once (the "360").
   Phase 2 is the requested walk: centre -> 0.5 right (pause) -> 0.5 up (pause)
   -> a small loop around (0.5,0.5). Radius exactness is not load-bearing — the
   ANGLE is (any point on +x reads theta=0; any x==y reads 45) — and the live
   "N x radius" hint shows the rest.

   Call: eval, then `await window.__dojoShot()`; poll __cap.progress(); when done
   `await window.__encodeDojo()`. */
window.__dojoShot = async function (opts = {}) {
  const g = window.game, c = window.__cap, p = g.players[0], md = g.dojo, C = g.world.dojoCentre;
  const R = 24;                                   // world units per 1.0 (mathdojo R)
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  c.play(); c.solo(); c.bindKB(); g.ryu = null;

  // maths (mx,my) -> world. maths x = world +X; maths y = world -Z (ZS=-1).
  const toW = (mx, my) => ({ x: C.x + mx * R, z: C.z - my * R });
  let prev = { x: C.x, z: C.z };
  const put = (mx, my) => {
    const w = toW(mx, my);
    // face along travel so she does not read as frozen while gliding
    const dx = w.x - prev.x, dz = w.z - prev.z;
    if (Math.hypot(dx, dz) > 0.001) p.facing = Math.atan2(dx, dz);
    prev = w;
    c.tp(0, w.x, w.z, C.y);
  };

  put(0, 0);
  // Zoomed ~2x vs the first cut and steeper, so the circle FILLS a square frame
  // with the grass cropped away. dist halved-ish, pitch raised for a rounder ring.
  const DIST = opts.dist ?? 48, PITCH = opts.pitch ?? 1.24, YAW = opts.yaw ?? 0;
  c.lock(0, { dist: DIST, pitch: PITCH, yaw: YAW, centreFn: () => C.clone().setY(C.y) });
  await sleep(1000);                              // let the follow-cam settle onto the circle

  // --- capture sizing: the 3D is SQUARE (circle fills it, no grass), the board
  //     stays 16:9 (it is a wide readout). They are decoupled on purpose. ---
  const W3 = opts.w ?? 480, H3 = opts.h ?? 480;
  const bW = opts.bw ?? 640, bH = opts.bh ?? 360;
  // A centred-square crop of the (16:9) WebGL buffer -> an undistorted circle.
  const sqCrop = (gl) => { const m = Math.min(gl.width, gl.height); return { x: (gl.width - m) / 2, y: (gl.height - m) / 2, w: m, h: m }; };
  const boc = document.createElement('canvas'); boc.width = bW; boc.height = bH;
  const boctx = boc.getContext('2d', { willReadFrequently: true });
  const boardFrames = [];

  // --- frame plan (captured frames) ---
  const SPIN_END = opts.spinEnd ?? 48;            // one full rim sweep
  const MAX = opts.max ?? 100;                    // + the walk
  const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));

  const step = () => {
    const fc = c.frameCount();
    if (fc < SPIN_END) {
      const a = (fc / SPIN_END) * Math.PI * 2;    // 0..2pi, one turn
      put(Math.cos(a), Math.sin(a));
    } else {
      const f = fc - SPIN_END;                    // 0..(MAX-SPIN_END)
      let mx, my;
      if (f < 10) { mx = lerp(0, 0.5, f / 10); my = 0; }            // centre -> 0.5 right
      else if (f < 17) { mx = 0.5; my = 0; }                       // pause
      else if (f < 27) { mx = 0.5; my = lerp(0, 0.5, (f - 17) / 10); } // -> 0.5 up
      else if (f < 34) { mx = 0.5; my = 0.5; }                     // pause
      else {                                                       // small loop around (0.5,0.5)
        const t = (f - 34) / (MAX - SPIN_END - 34);
        const ang = t * Math.PI * 2;
        mx = 0.5 + 0.2 * Math.cos(ang); my = 0.5 + 0.2 * Math.sin(ang);
      }
      put(mx, my);
    }
    if (c.capturing()) requestAnimationFrame(step);
  };

  c.startRec('dojo-world', W3, H3, opts.everyN ?? 4, MAX, sqCrop);
  c.setOverlay(() => {
    // grab the live board at this exact capture tick; do NOT draw onto the 3D frame
    boctx.drawImage(md.boardCanvas, 0, 0, md.boardCanvas.width, md.boardCanvas.height, 0, 0, bW, bH);
    boardFrames.push(boctx.getImageData(0, 0, bW, bH).data.slice());
  });
  requestAnimationFrame(step);

  window.__dojoBoard = { frames: boardFrames, w: bW, h: bH };
  return 'dojo shot started: ' + MAX + ' frames, spin ends ' + SPIN_END;
};

/* Encode both clips. The 3D uses the harness encoder; the board is POSTed by
   hand to the same /gif endpoints as a second clip. */
window.__encodeDojo = async function ({ delay = 70, colors = 128 } = {}) {
  const c = window.__cap, S = 'http://localhost:7799';
  const world = await c.encode({ delay, colors });
  const b = window.__dojoBoard;
  await fetch(`${S}/gif/begin?name=dojo-sincos&w=${b.w}&h=${b.h}`);
  for (const f of b.frames) await fetch(`${S}/gif/frame?name=dojo-sincos`, { method: 'POST', body: f });
  const r = await fetch(`${S}/gif/end?name=dojo-sincos&delay=${delay}&colors=${colors}&dither=0`);
  const board = await r.json();
  return { world, board };
};
