/* Raise-a-Panda GIF choreography. Assumes the harness (window.__cap) is already
   injected. A natural, narrative shot rather than a montage of jump-cuts:

     Ember walks the grove cane to cane, cutting each with her katana; a cub
     spawns beside her and trots after her; she cuts more and it grows up; she
     cuts more still, then turns around, walks back to the panda and climbs on;
     the two ride toward the camera mowing bamboo, the panda's claw swipe (the
     one thing besides the katana that cuts a cane) raking canes down in front.

   Everything is REAL: movement is synthesized W/A/S/D routed through the normal
   input path; the katana and the panda swipe are real KeyF presses; the panda
   grows because bambooCut crosses the same tier thresholds onMischief uses. The
   two liberties, both confined to this throwaway capture, are (1) driving
   bambooCut to the threshold on schedule so the cub/adult land on known frames,
   and (2) a bamboo "treadmill" that relocates passed canes into a band ahead of
   the ride and prop._reset()s them upright, so a finite grove reads as endless.
   The shipped game never regrows a thing (invariant #4) and world-check pins it.

   Call: eval this, then `await window.__pandaShot()`; poll __cap.progress();
   when done, __cap.encode(). */
window.__pandaShot = async function () {
  const g = window.game, c = window.__cap, p = g.players[0], W = g.world;
  const norm = (x, z) => { const l = Math.hypot(x, z) || 1; return { x: x / l, z: z / l }; };

  /* Camera-relative movement basis, MEASURED at yaw 0.7 (KeyW/KeyD travel
     directions). Any world heading decomposes onto these two to pick keys. */
  const CAM = { F: { x: -0.66, z: -0.75 }, R: { x: 0.74, z: -0.67 } };

  /* --- scene setup --- */
  c.play(); c.solo();
  const allCanes = W.props.filter((b) => b.kind === 'bamboo');
  // Fresh full grove for this take. Respawning happens ONLY here, between takes —
  // never during the recording (prop._reset is the game's own restart path).
  for (const b of allCanes) if (b.knocked || b.gone) b._reset();
  let centre = allCanes[0].home, bestN = -1;
  for (const a of allCanes) { let n = 0; for (const b of allCanes) if (Math.hypot(a.home.x - b.home.x, a.home.z - b.home.z) < 10) n++; if (n > bestN) { bestN = n; centre = a.home; } }
  const spot = (W.findOpenSpot && W.findOpenSpot(centre.x + 6, centre.z, 3)) || { x: centre.x + 6, z: centre.z };
  const h0 = W.heightAt(spot.x, spot.z);
  c.tp(0, spot.x, spot.z, h0 && Number.isFinite(h0.y) ? h0.y : null);
  p.raisedPanda = true; p.pandaFedFrom = null; p.bambooCut = 0;
  if (p.panda) { g.scene.remove(p.panda.group); p.panda = null; }
  const clan = (g.clans || []).find((cl) => cl && (cl.buff?.panda || /panda/i.test(cl.name || '')));
  if (clan) { p.clan = clan; g._updateClanBadge && g._updateClanBadge(p); }
  c.bindKB();
  g.ryu = null;                                  // no Ryuuseki to steal the mount button
  c.lock(0, { dist: 25, pitch: 0.5, yaw: 0.7, centreFn: () => p.position.clone().setY(p.position.y + 1.6) });

  /* --- movement: hold whatever keys point Ember at a world heading --- */
  let held = new Set();
  const applyMove = (want) => {
    for (const k of held) if (!want.has(k)) c.up(k);
    for (const k of want) if (!held.has(k)) c.down(k);
    held = want;
  };
  const steer = (dir) => {
    const f = dir.x * CAM.F.x + dir.z * CAM.F.z, r = dir.x * CAM.R.x + dir.z * CAM.R.z;
    const want = new Set();
    if (f > 0.35) want.add('KeyW'); else if (f < -0.35) want.add('KeyS');
    if (r > 0.35) want.add('KeyD'); else if (r < -0.35) want.add('KeyA');
    applyMove(want);
  };
  const stop = () => applyMove(new Set());
  const faceToward = (dx, dz) => { p.facing = Math.atan2(dx, dz); };   // dir = (sin f, cos f)

  /* --- on-foot: walk to the nearest standing cane a few steps off and cut it --- */
  let target = null;
  const pickTarget = () => {
    let best = null, bd = 1e9, nearAny = null, na = 1e9;
    for (const b of allCanes) {
      if (b.knocked || b.gone) continue;
      const d = Math.hypot(b.home.x - p.position.x, b.home.z - p.position.z);
      if (d < na) { na = d; nearAny = b; }
      if (d >= 4 && d < bd) { bd = d; best = b; }        // prefer one worth a walk
    }
    return best || nearAny;
  };
  let dwellUntil = 0;                          // stand still until this captured frame — the pacing
  const walkCut = (fc) => {
    if (fc < dwellUntil) { stop(); return; }   // a beat's pause, so it reads step-by-step not frantic
    if (!target || target.knocked || target.gone) target = pickTarget();
    if (!target) { stop(); return; }
    const dx = target.home.x - p.position.x, dz = target.home.z - p.position.z, d = Math.hypot(dx, dz);
    if (d > 2.8) { steer({ x: dx / d, z: dz / d }); }
    else {
      stop(); faceToward(dx, dz);
      c.hold('KeyF', 150);                    // katana swing (animation)
      target.knock(norm(dx, dz), 1);          // guarantee the cut regardless of arc
      p.bambooCut += 1;
      target = null;
      dwellUntil = fc + 3;                     // pause after the cut before walking to the next cane
    }
  };

  /* Let the follow-camera LERP settle onto the grove before a single frame is
     captured — otherwise frame 0 is the town (cherry blossom dead centre), the
     camera's resting place before the lock pulls it here. */
  await new Promise((r) => setTimeout(r, 1100));

  /* --- record + frame-locked phases (fc = captured frames, 0..MAX) --- */
  const MAX = 84;
  // 384x216 (16:9, 0.6x of 640x360): a moving follow-camera changes every pixel
  // every frame, so inter-frame compression can't help — resolution is the real
  // size lever, and this brings the busy grove into line with the other clips.
  c.startRec('panda', 384, 216, 3, MAX);
  let cubDone = false, adultDone = false, mountDone = false, rideTarget = null;
  const choreo = () => {
    const fc = c.frameCount();
    if (fc < 6) {
      // A held opening beat: she just stands in the grove before the first cut.
      stop();
    } else if (fc < 50) {
      // WALK & CUT on foot, with pauses. Cub and adult land on known frames and
      // she stands a beat to watch each one appear.
      walkCut(fc);
      if (!cubDone && fc >= 16) { p.bambooCut = Math.max(p.bambooCut, 20); g._updatePanda(p); cubDone = true; dwellUntil = fc + 5; }
      if (!adultDone && fc >= 34) { p.bambooCut = Math.max(p.bambooCut, 40); g._updatePanda(p); adultDone = true; dwellUntil = fc + 5; }
    } else if (fc < 60) {
      // TURN AROUND & MOUNT: walk to the trailing panda, face it, then climb on.
      if (p.pandaMount) { stop(); }
      else if (p.panda) {
        const dx = p.panda.position.x - p.position.x, dz = p.panda.position.z - p.position.z, d = Math.hypot(dx, dz);
        if (d > p.panda.mountRadius * 0.6 && fc < 57) steer({ x: dx / d, z: dz / d });
        else {
          // Force the mount directly — NO KeyQ tap: KeyQ TOGGLES the mount, so
          // repeated taps mounted then dismounted her. The set is instant and
          // looks the same on screen.
          stop(); faceToward(dx, dz);
          if (!mountDone && p.panda.rideable) { p.pandaMount = p.panda; p.panda.rider = p; p.velocity.set(0, 0, 0); mountDone = true; }
        }
      }
    } else {
      // RIDE THE GROVE: seek the nearest standing cane, ride at it, and swipe it
      // down — the claw cuts along Ember's facing, so steering AT bamboo aims the
      // swipe at bamboo (not at the empty camera side). She flows cane to cane.
      if (!rideTarget || rideTarget.knocked || rideTarget.gone) rideTarget = pickTarget();
      if (rideTarget) {
        const dx = rideTarget.home.x - p.position.x, dz = rideTarget.home.z - p.position.z, d = Math.hypot(dx, dz);
        steer({ x: dx / d, z: dz / d });
        if (d < 5) { c.hold('KeyF', 140); rideTarget.knock(norm(dx, dz), 1.6); rideTarget = null; }   // swipe + cut, then next
      } else stop();
    }
    if (c.capturing()) requestAnimationFrame(choreo);
    else stop();
  };
  requestAnimationFrame(choreo);
  return 'panda shot started: recording ' + MAX + ' frames';
};
