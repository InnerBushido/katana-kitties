/* Shared rig for the two "Moving & fighting" clips.
   ===================================================================
   Everything here was learned on the dealer clip and is kept verbatim because
   it will be needed again:

   * THE GAME LOOP IS NOT rAF-SAFE IN A CAPTURE PANE. A hidden tab throttles
     requestAnimationFrame to about one frame every three seconds, and
     three.js's setAnimationLoop IS rAF — so the simulation, not the recording,
     is what stops. The capture takes the loop off rAF and steps it by hand
     with a stubbed delta. That also makes a take deterministic.
   * drawImage(webglCanvas) IS COMPOSITOR-GATED and returns a stale picture in
     the same situation; gl.readPixels goes to the backbuffer and does not.
     Y is flipped because GL's origin is bottom-left.
   * A HELD BEAT MUST NOT FREEZE THE WORLD — a still frame reads as a lag
     spike, not as a pause. Every beat here is live; the per-frame GIF delays
     are what make a beat last long enough to read.

   AND ONE THAT IS NEW HERE:
   * THE SHRINE BANNER. The game camera sits 20.5 units south-west of whoever
     it follows, on a FIXED yaw of -PI/4, and the ash island's Shadowtail hall
     flies a world-space banner the width of the screen. Filmed from the middle
     of the island the camera lands beyond the hall and the banner fills the
     shot — measured, first take. It is out of frame whenever the camera is
     north-east of the hall, which means staging in the island's north-east
     quarter. `cameraFor()` is here so a beat can be checked before it is
     filmed rather than after.                                             */
(() => {
  const g = window.game;
  const glc = g.renderer.domElement;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const K = {
    g,
    sleep,
    /* --- the world, stepped by hand --- */
    drive: {
      on: false,
      start() { if (this.on) return; g.renderer.setAnimationLoop(null); this.on = true; },
      stop() { if (!this.on) return; g.renderer.setAnimationLoop(() => g._tick()); this.on = false; },
      step(seconds, sub = 2) {
        const cl = g.clock, orig = cl.getDelta.bind(cl);
        cl.getDelta = () => seconds / sub;
        try { for (let i = 0; i < sub; i++) g._tick(); } finally { cl.getDelta = orig; }
      },
    },

    /* --- the framebuffer mirror --- */
    mirror: null, mctx: null, buf: null, img: null,
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

    /* --- the rest of the game's own UI, off --- */
    hidden: [], mathWas: null,
    hideChrome() {
      /* START FROM A CLOSED SCREEN. A panel left up by the previous take
         covers the viewport AND freezes the world — every frame comes out
         identical and the hunt goes looking for a missing animation. */
      try { g.profile.close(); } catch (e) {}
      try { g.inspector.closeAll(); } catch (e) {}
      for (const id of ['hud', 'touch-pad']) {
        const el = document.getElementById(id);
        if (el && !el.classList.contains('hidden')) { el.classList.add('hidden'); this.hidden.push(el); }
      }
      this.mathWas = g.mathVisible;
      if (g.mathVisible) g._toggleMath();
    },
    showChrome() {
      for (const el of this.hidden) el.classList.remove('hidden');
      this.hidden = [];
      if (this.mathWas && !g.mathVisible) g._toggleMath();
    },

    /* Where the follow camera ends up for a kitten standing at x,z — see the
       shrine-banner note at the top. MEASURED off a real take, not derived
       from the camera code, whose `want` runs through a cluster centroid and
       three clamps before it means anything. */
    cameraFor(x, z) { return { x: x - 14.5, z: z + 14.5 }; },

    ground(x, z, fallback) {
      const h = g.world.heightAt && g.world.heightAt(x, z);
      return (h && Number.isFinite(h.y)) ? h.y : fallback;
    },
    /* `y` IS AN ARGUMENT BECAUSE `heightAt` DOES NOT COVER THE ARENA.
       Measured: `world.heightAt(40, -330)` — dead centre of the ring — returns
       null, so the fallback wins and the kitten is left wherever she was. The
       arena beats filmed two specks falling through an orange sky for exactly
       this reason. The ring's floor is 49, and it is read off
       `world.postsForSides`, which is the same source the tournament itself
       stands the fighters on. */
    place(i, x, z, facing, y) {
      const p = g.players[i]; if (!p) return;
      p.position.set(x, y != null ? y : this.ground(x, z, p.position.y), z);
      p.group.position.copy(p.position);
      if (p.velocity) p.velocity.set(0, 0, 0);
      if (facing != null) p.facing = facing;
    },
    /* Snap the camera rather than let it fly in from two islands away. */
    seed() { g.rigs.forEach((r) => { if (r) r.seeded = false; }); },

    /* A FIXED CAMERA ON A STAGE, not the follow camera.
       The follow camera cannot be aimed and cannot be pulled in: single-player
       it sits 20.5 units south-west on a hard-coded yaw, and its distance
       floors at 26 (`clamp(26 + spread*0.85, 26, 52)` with a spread of zero).
       On the ash island that puts a dragon-ball pillar in the middle of the
       shot and a sleeping dragon over the kitten, and every attempt to walk
       out of that walks her off the plateau. A stage the kitten moves AROUND
       IN is also the better picture for a clip about moving: the ground stays
       put, so the eye can see she is the thing that moved.

       `lock` in the harness re-applies on requestAnimationFrame, which is
       useless here (the loop is being stepped by hand), so the aim is applied
       one frame at a time by the beat runner instead. */
    aim(i, shot) {
      const p = g.players[i]; if (!p) return;
      if (!p.__osFocus) { p.__osFocus = p.setFocus.bind(p); p.setFocus = (f) => { if (!p.__locked) p.__osFocus(f); }; }
      p.__locked = true;
      p.__osFocus({ centre: shot.centre, dist: shot.dist, pitch: shot.pitch, yaw: shot.yaw });
    },
    unaim(i) { const p = g.players[i]; if (p) { p.__locked = false; if (p.__osFocus) p.__osFocus(null); } },

    /* ------------------------- X-RAY THE OCCLUDERS -------------------------
       The ash island's dragon-ball pillar stands right where the camera wants
       to be, and the first four takes were spent moving the stage around it.
       The game already owns the answer: `xrayVertexMat` in core/gfx.js, which
       discards every fragment inside a cone running from the camera to the
       player, dithered at the edge so it reads as a soft porthole. It was
       written for the grotto's walls and dome, and `_aimXray` feeds it the
       camera and the kittens once per view.

       Nothing about it is grotto-specific, so this borrows it: find whatever
       solid lies on the camera-to-kitten line, swap the x-ray material onto
       it, and drive `setCuts` on the same schedule the grotto uses. The
       originals go back on afterwards.

       WHAT IS DIFFERENT FROM THE GROTTO, AND IT IS THE WHOLE DIFFICULTY.
       A grotto is its own mesh, so the material can be aimed at the walls and
       the dome and NOT at the floor. This world is not built that way: it is
       merged into a handful of enormous meshes — the biggest 42,138 triangles
       with a 237-unit bounding sphere — and the ash island's pillar, its
       boulders and the ground they stand on are all inside one of them. There
       is nothing finer to swap a material onto, so the floor cannot be spared
       by choosing meshes. It is spared by the SHAPE of the cut instead:
       `xrayStep` ends the segment three units in front of her rather than at
       her head, which leaves every bit of ground that matters outside the cone
       while the thing actually in the way is at half that distance and still
       inside it.

       ANYTHING BILLBOARDED IS STILL EXCLUDED BY NAME. Kittens, dragons and
       orbs are camera-facing quads on their own materials; they are the
       subject, not the wall.                                              */
    xrayOn: [], xrayMats: new Map(), THREE: null,
    async xrayInit() {
      if (this._gfx) return this._gfx;
      this.xraySweep();          // undo anything a previous reload orphaned
      this._gfx = await import('/src/core/gfx.js');
      /* Vector3 comes off a live position rather than from `import('three')`,
         which does not resolve here: this file is eval'd into the page, so it
         is never seen by Vite and a bare specifier has nothing to rewrite it.
         Everything below is plain arithmetic for the same reason — no
         Raycaster, no Box3. */
      this.V3 = g.players[0].position.constructor;
      return this._gfx;
    },

    /* Meshes whose bounding sphere straddles the camera->kitten segment.
       A RAYCAST WOULD HAVE BEEN WRONG ANYWAY, not just unavailable. The cut is
       a cone of radius 2.1 around the segment, so the thing that matters is
       whether a mesh comes NEAR the line, not whether one infinitely thin ray
       happens to pierce it — a pillar the ray passes a hand's width beside
       still eats half of her. Sphere-to-segment distance asks the question the
       shader actually answers, and it costs one dot product per mesh. */
    xrayFind(camPos, points) {
      const out = [];
      const REACH = 3.4;                       // 2.1 cut + 1.0 soft edge + slack
      g.scene.traverse((o) => {
        if (!o.isMesh || !o.visible || !o.geometry || !o.material) return;
        if (!o.geometry.attributes.color) return;   // not a painted world mesh
        /* NEVER AN OUTLINE SHELL. `addOutline` gives every prop an inverted
           hull that SHARES the prop's geometry — so it carries the same colour
           attribute and passed the test above. Its material is BackSide and
           near-black by design; swapping that for a FrontSide x-ray toon draws
           a solid black box a hair larger than the prop, which is exactly what
           the slash beat's crate turned into. */
        if (o.userData.isOutline) return;
        for (let n = o; n; n = n.parent) {
          if (n.userData && (n.userData.billboard || n.userData.noXray)) return;
        }
        /* THE TERRAIN IS INCLUDED, AND IT HAS TO BE. Measured: this world is
           not one mesh per rock — it is a handful of merged meshes, the
           biggest 42,138 triangles with a 237-unit bounding sphere, and the
           ash island's pillar and boulders live inside one of them along with
           the ground they stand on. There is nothing finer to swap a material
           onto. What keeps the floor solid is `xrayStep` STOPPING THE CUT
           SHORT of her instead of running it to her head — see the note there. */
        let sph = o.geometry.boundingSphere;
        if (!sph) { o.geometry.computeBoundingSphere(); sph = o.geometry.boundingSphere; }
        if (!sph) return;
        o.updateWorldMatrix(true, false);
        const c = sph.center.clone().applyMatrix4(o.matrixWorld);
        const sc = o.matrixWorld.getMaxScaleOnAxis();
        const r = sph.radius * sc;
        /* ONLY THE BIG MERGED MESHES. Props are painted geometry too, so they
           passed every test above and the slash beat filmed its crate as a
           black box: the x-ray discarded the crate's front faces and left the
           inverted-hull OUTLINE, which is black by design, standing where the
           crate should be. The thing the x-ray exists to see through is
           terrain, and terrain here is four meshes with 85-to-295-unit
           bounding spheres against a prop's one — so the radius separates them
           cleanly with two orders of magnitude to spare. */
        if (r < 20) return;
        for (const pt of points) {
          const ax = camPos.x, ay = camPos.y, az = camPos.z;
          const bx = pt.x - ax, by = pt.y - ay, bz = pt.z - az;
          const len2 = bx * bx + by * by + bz * bz;
          const t = Math.max(0, Math.min(1, ((c.x - ax) * bx + (c.y - ay) * by + (c.z - az) * bz) / (len2 || 1)));
          /* CLAMPED, AND WITH NO "IS IT IN FRONT OF HER" TEST. That test
             belongs in the shader, which applies it per fragment, and putting
             it here threw away the only meshes that mattered: the world is
             merged into a few enormous chunks, so the 42k-triangle mesh
             holding this island has its bounding-sphere centre 190 units away
             with an unclamped t of 8.3 — "behind her", and skipped, while its
             triangles were sitting in front of her face. A sphere this coarse
             can only answer "might this mesh reach the segment at all". */
          const dx = c.x - (ax + bx * t), dy = c.y - (ay + by * t), dz = c.z - (az + bz * t);
          if (Math.sqrt(dx * dx + dy * dy + dz * dz) < r + REACH) { out.push(o); break; }
        }
      });
      return out;
    },
    xrayApply(meshes) {
      const { xrayVertexMat } = this._gfx;
      for (const m of meshes) {
        if (this.xrayMats.has(m)) continue;
        /* ONE MATERIAL PER MESH. The cut lives in the material's uniforms, so
           a shared instance would open every occluder's hole in one place —
           the same reason the two grottos each get their own. */
        const mat = xrayVertexMat(m.material.color ? { color: m.material.color.clone() } : {});
        this.xrayMats.set(m, m.material);
        /* ALSO ON THE MESH, not only in this rig's Map. Re-evaluating movekit
           builds a NEW `window.__mk` with an empty Map, which orphans every
           material the previous one swapped: the mesh keeps the x-ray forever
           and nothing left alive knows what it used to be. That is what put a
           solid black crate in the slash beat — a prop x-rayed by a take three
           reloads ago, drawn ever since with a material that has no vertex
           colours. Parking the original on the mesh lets `xraySweep` undo it
           from any later session. */
        m.userData.xrayOrig = m.material;
        m.material = mat;
        this.xrayOn.push(m);
      }
    },
    /** Undo every swap any previous copy of this rig made. See xrayApply. */
    xraySweep() {
      let n = 0;
      g.scene.traverse((o) => {
        if (!o.isMesh || !o.userData || !o.userData.xrayOrig) return;
        o.material.dispose?.();
        o.material = o.userData.xrayOrig;
        delete o.userData.xrayOrig;
        n++;
      });
      return n;
    },
    /* A WIDER HOLE THAN THE GROTTO WANTS. 2.1 units at the far end is tuned
       for a wall a couple of strides from her face; here the cut also stops
       short of her, so by the time the cone reaches her it has narrowed to
       about her ring and the top of her ears — measured on the first take.
       The uniforms are reachable because onBeforeCompile does
       `Object.assign(shader.uniforms, u)`, which keeps the same objects, and
       three exposes the compiled shader on `material.userData.shader`. It only
       exists after the first draw, hence the guard and the per-frame call. */
    /* BACK TO THE GROTTO'S OWN NUMBERS. The first pass ran 3.0 with a 0.62
       flare, which did reveal her but took the whole pillar with it — the
       shader is meant to bite a hole in a wall, not delete it. Area goes with
       the square of the radius, so 2.1 is about half as much cut as 3.0, and
       it is the value the grotto walls have been using all along. */
    xrayR: 2.1, xrayFlare: 0.5,
    xrayAim(camPos, points) {
      for (const m of this.xrayOn) {
        m.material.setCuts?.(camPos, points);
        const sh = m.material.userData && m.material.userData.shader;
        if (sh) { sh.uniforms.uCutR.value = this.xrayR; sh.uniforms.uCutFlare.value = this.xrayFlare; }
      }
    },
    /* Wrap the game's own per-view hook with this. `_aimXray(camera)` runs
       once per pane immediately before the draw, with the camera that is about
       to be used — which is exactly where a cut has to be aimed, and saves
       this from having to know anything about split screen. */
    /* How far short of the kitten the cut stops, in world units. */
    xrayBack: 3.0,
    xrayStep(camera) {
      const cam = camera.position;
      const pts = [];
      for (let i = 0; i < g.partySize; i++) {
        const p = g.players[i]; if (!p) continue;
        /* THE CUT ENDS THREE UNITS IN FRONT OF HER, NOT AT HER HEAD.
           The shader cuts a cone about the camera->point segment, 2.1 units
           wide at the far end. Aim that end at her and the last stretch of the
           segment is only about 1.4 units above the ground, so the cone eats a
           three-metre hole in the island around her feet and you see space
           through the floor. In the grotto that never showed, because only the
           WALLS and the DOME carry this material and the floor is ordinary
           toon — here the ground and the pillar are the same merged mesh, so
           the protection has to come from the shape of the cut instead.
           Stopping short leaves every bit of ground within three units of her
           outside the cone, while the thing actually in the way sits at half
           that distance and stays inside it. */
        const hx = p.position.x, hy = p.position.y + 1.4, hz = p.position.z;
        const dx = hx - cam.x, dy = hy - cam.y, dz = hz - cam.z;
        const len = Math.hypot(dx, dy, dz) || 1;
        const k = Math.max(0, (len - this.xrayBack) / len);
        pts.push(new this.V3(cam.x + dx * k, cam.y + dy * k, cam.z + dz * k));
      }
      if (!pts.length) return;
      this.xrayApply(this.xrayFind(camera.position, pts));
      this.xrayAim(camera.position, pts);
    },
    xrayOff() {
      for (const m of this.xrayOn) {
        const orig = this.xrayMats.get(m);
        if (orig) { m.material.dispose?.(); m.material = orig; delete m.userData.xrayOrig; }
      }
      this.xrayOn = []; this.xrayMats.clear();
      this.xraySweep();          // and anything an earlier copy of the rig left
    },

    /* ---------------- the input diagrams, drawn not photographed -----------
       CLAUDE.md's ninth rule: everything is procedural or generated. A
       photograph of a real controller would be the one piece of art here that
       is neither the kids' nor the code's, and it would also be somebody
       else's product shot. So the pad is drawn — and drawn FROM the mapping in
       core/input.js, so a rebind changes the picture instead of making it a
       lie. */
    ink: '#1d1216', paper: '#fbeed2', paper2: '#f2ddb4',
    gold: '#f5c341', ember: '#ff8a3d', vermillion: '#e0512c',

    cap(tx, x, y, w, h, label, on, tint) {
      tx.save();
      const r = Math.min(8, h / 3);
      const dy = on ? 2 : 0;                     // a pressed key sits down
      tx.beginPath();
      if (tx.roundRect) tx.roundRect(x, y + dy, w, h - dy, r); else tx.rect(x, y + dy, w, h - dy);
      tx.fillStyle = on ? (tint || this.vermillion) : 'rgba(251,238,210,.93)';
      tx.fill();
      tx.lineWidth = 2; tx.strokeStyle = this.ink; tx.stroke();
      tx.fillStyle = on ? this.ink : this.ink;
      tx.font = '700 ' + Math.round(h * (label.length > 3 ? 0.34 : 0.46)) + 'px Nunito, system-ui, sans-serif';
      tx.textAlign = 'center'; tx.textBaseline = 'middle';
      tx.fillText(label, x + w / 2, y + dy + (h - dy) / 2 + 1);
      tx.restore();
    },

    /* One player's keyboard. `lit` is a Set of action names, read off the
       live input state so the diagram cannot disagree with the game. */
    keyPanel(tx, px, py, opts) {
      const s = opts.scale ?? 1, lit = opts.lit, tint = opts.tint || this.ember;
      const C = Math.round(30 * s), G = Math.round(4 * s);
      const cross = C * 3 + G * 2;
      const top = Math.round(20 * s);
      const gapRow = Math.round(9 * s);
      const rowY = py + top + C * 2 + G + gapRow;
      const inner = opts.actions
        ? Math.max(cross, opts.actions.reduce((a, k) => a + Math.round(k.w * s) + G, -G))
        : cross;
      const H = (opts.actions ? rowY + C : py + top + C * 2 + G) - py;
      const pad = Math.round(9 * s);
      tx.save();
      tx.beginPath();
      if (tx.roundRect) tx.roundRect(px - pad, py - pad, inner + pad * 2, H + pad * 2, 10);
      else tx.rect(px - pad, py - pad, inner + pad * 2, H + pad * 2);
      tx.fillStyle = 'rgba(20,12,16,.62)'; tx.fill();
      tx.lineWidth = 2; tx.strokeStyle = tint; tx.stroke();
      tx.fillStyle = tint;
      tx.font = '700 ' + Math.round(13 * s) + 'px Nunito, system-ui, sans-serif';
      tx.textAlign = 'left'; tx.textBaseline = 'top';
      tx.fillText(opts.title, px, py);
      tx.restore();
      const k = opts.keys;
      this.cap(tx, px + C + G, py + top, C, C, k.up, lit.has('up'), tint);
      this.cap(tx, px, py + top + C + G, C, C, k.left, lit.has('left'), tint);
      this.cap(tx, px + C + G, py + top + C + G, C, C, k.down, lit.has('down'), tint);
      this.cap(tx, px + (C + G) * 2, py + top + C + G, C, C, k.right, lit.has('right'), tint);
      if (opts.actions) {
        let x = px;
        for (const a of opts.actions) {
          const w = Math.round(a.w * s);
          this.cap(tx, x, rowY, w, C, a.label, lit.has(a.act), tint);
          x += w + G;
        }
      }
      return { w: inner + pad * 2, h: H + pad * 2 };
    },

    /* ------------------------- THE CONTROLLER, DRAWN ----------------------
       A PlayStation pad in about sixty lines of canvas. Not a photograph:
       rule 9 says everything here is procedural or generated, and a product
       shot of somebody else's hardware would be the one asset in the game
       that is neither the kids' drawing nor this code's output.

       THE LETTERING COMES OUT OF core/input.js AND THE POSITIONS DO NOT.
       Which glyph a button wears is a fact about the game's prompt table
       (`PROMPTS.playstation`) and can change — it already did once, when a
       DualSense player was being told to press a button called B. WHERE that
       button sits is a fact about the plastic and cannot. So the table is read
       for the strings and each string is then placed by what it IS: the
       triangle goes at the top of the diamond because it is the triangle, and
       if the table ever renames it, the picture follows the name to the right
       hole rather than quietly mislabelling a different one.

       Everything is laid out in a 240x150 box and scaled, so a beat can put
       the pad anywhere at any size without a second set of numbers. */
    _prompts: null,
    /** Load the game's PlayStation prompt table. Must be awaited before padPanel. */
    async padInit() {
      if (this._prompts) return this._prompts;
      const m = await import('/src/core/input.js');
      this._prompts = m.PROMPTS.playstation;
      return this._prompts;
    },
    /* --------- THE PAD: A DUALSHOCK 4 WITH A CAT'S FACE ON THE FRONT -------
       THE SILHOUETTE IS A DS4. THE FACE PAINTED ON IT IS A CAT. Those are two
       separate decisions and only the second one is a joke.

       WHY IT IS DRAWN AT ALL: rule 9, everything is procedural or generated. A
       photo of somebody else's hardware would be the one asset in the game
       that is neither the kids' drawing nor this code's output.

       FOUR PADS WERE DRAWN BEFORE THIS ONE AND EACH FAILED DIFFERENTLY. Worth
       keeping, because every one of them is a shape somebody will be tempted
       to go back to:
         1  a rounded blob with two horns. Read as a bib. The grips were the
            biggest thing in the picture and the buttons — which are what the
            clip is about — were the smallest.
         2  an honest trace of a DS4 silhouette. Read correctly, and looked
            like a stock icon dropped into a game whose art direction is a
            nine-year-old's felt-tip cats.
         3  a cat: head, ears, and two thin arms ending in paws. Charming, and
            no longer a controller — you could not tell a kid "hold this" and
            have them recognise the object in their hands.
         4  the same, with the sticks doing double duty as the eyes. The knob
            leaning as she walked made the cat's eyes swivel, which was very
            clever and, in the word that came back, creepy.
       So: the OUTLINE is trace number 2, with the grips slimmed; the EYES are
       their own thing, higher up the face, and they do not move.

       WHAT DID NOT MOVE, AND MUST NOT. Every control sits where the DS4 puts
       it, in fractions of the body — that is what makes the picture teachable
       rather than decorative. The one exception is the stick pair, which is
       carried about seven per cent of the body height further down to clear
       the muzzle; on the plastic they sit exactly where the nose wants to be,
       and something had to give.

       THE TOP FORTY UNITS ARE NOT HARDWARE. L1/L2/R1/R2 live on the back edge
       and cannot be drawn from the front, so they are stacked in the margins
       either side of the ears as labelled tabs. That is a diagram's licence
       and the only one taken here.

       Everything is laid out in a 280 x 214 box and scaled, so a beat can put
       the pad anywhere at any size without a second set of numbers. */
    padGeom() {
      /* Placed by glyph, not by action. Which glyph a button wears is a fact
         about the game's prompt table (`PROMPTS.playstation`) and can change —
         it already did once, when a DualSense player was being told to press a
         button called B. WHERE that button sits is a fact about the plastic
         and cannot. So the table is read for the STRINGS and each string is
         placed by what it IS: the triangle goes at the top of the diamond
         because it is the triangle, and if the table ever renames it the
         picture follows the name to the right hole rather than quietly
         mislabelling a different one. Anything the table holds that this pad
         has no hole for comes back in `orphans`, so a beat can draw it beside
         the pad instead of dropping it. */
      const P = this._prompts;
      const FX = 222, FY = 90, FD = 19;             // face diamond: centre, spread
      const SLOT = {
        '△': ['face', FX, FY - FD], '○': ['face', FX + FD, FY],
        '✕': ['face', FX, FY + FD], '□': ['face', FX - FD, FY],
        L1: ['bump', 0, 26, 32, 12], R1: ['bump', 248, 26, 32, 12],
        L2: ['bump', 0, 10, 32, 12], R2: ['bump', 248, 10, 32, 12],
        /* Slivers, not pills, and DELIBERATELY UNLABELLED — see `label`. On the
           plastic these are 4mm slots you could not print OPTIONS on either.
           On the DS4 they flank the touchpad; the touchpad is gone (see
           padPanel) and they have landed just above the eyes, where they pass
           for eyebrows — so pressing OPTIONS raises one. */
        SHARE: ['sliver', 105, 52, 10, 14], OPTIONS: ['sliver', 165, 52, 10, 14],
      };
      const holes = [], orphans = [], used = new Set();
      for (const [act, glyph] of Object.entries(P)) {
        const s = SLOT[glyph];
        if (s) { holes.push({ act, glyph, kind: s[0], box: s.slice(1) }); used.add(glyph); }
        else orphans.push({ act, glyph });
      }
      /* A HOLE THE GAME NEVER USES IS STILL A HOLE IN THE PLASTIC. This game
         binds OPTIONS and not SHARE, and R2/R1 and not L2 — which left one
         lone sliver off to one side and a bare left shoulder against a stacked
         right one. Both read as mistakes rather than as hardware. Anything in
         SLOT that no action claimed comes back as `blanks`, drawn unlabelled
         and never lit: the same treatment the d-pad gets, and for the same
         reason. Face buttons are never blanked — all four are bound, and an
         empty circle in the diamond would be a button a kid goes looking for. */
      const blanks = Object.entries(SLOT)
        .filter(([glyph, s]) => s[0] !== 'face' && !used.has(glyph))
        .map(([glyph, s]) => ({ glyph, kind: s[0], box: s.slice(1) }));
      return { holes, orphans, blanks };
    },
    padPanel(tx, px, py, opts = {}) {
      const s = opts.scale ?? 1, lit = opts.lit || new Set();
      const tint = opts.tint || this.ember;
      const X = (v) => px + v * s, Y = (v) => py + v * s, S = (v) => v * s;
      /* OPAQUE, AND IT HAS TO BE. At 94% the shell was a sheet of tinted
         glass: everything drawn underneath it — the ears' hidden halves, the
         seams the draw order exists to hide — came back as scars across the
         face. */
      const shell = '#1c141a';
      const etch = 'rgba(251,238,210,.6)';
      const pink = 'rgba(232,124,138,.78)';
      tx.save();
      tx.lineJoin = 'round'; tx.lineCap = 'round';
      if (opts.title) {
        tx.fillStyle = tint;
        tx.font = '700 ' + Math.round(13 * s) + 'px Nunito, system-ui, sans-serif';
        tx.textAlign = 'left'; tx.textBaseline = 'bottom';
        tx.fillText(opts.title, X(4), Y(-2));
      }

      const { holes, blanks } = this.padGeom();
      const path = (kind, box) => {
        const p = new Path2D();
        if (kind === 'face') p.arc(X(box[0]), Y(box[1]), S(8.6), 0, Math.PI * 2);
        else {
          const [bx, by, bw, bh] = box;
          const r = kind === 'sliver' ? bw / 2 : bh / 2;
          p.roundRect ? p.roundRect(X(bx), Y(by), S(bw), S(bh), S(r))
            : p.rect(X(bx), Y(by), S(bw), S(bh));
        }
        return p;
      };
      const glow = (p, on) => {
        tx.fillStyle = on ? tint : 'rgba(251,238,210,.16)';
        tx.fill(p);
        tx.lineWidth = S(1.6); tx.strokeStyle = on ? this.paper : etch;
        tx.stroke(p);
      };

      /* SHOULDERS FIRST, SO THE SHELL COVERS THEIR ROOTS. They used to be
         drawn after it, which left four tabs sitting ON TOP of the outline
         like stickers. On the plastic they go in behind it. */
      for (const h of holes) if (h.kind === 'bump') glow(path('bump', h.box), lit.has(h.act));
      for (const b of blanks) if (b.kind === 'bump') glow(path('bump', b.box), false);

      /* OUTLINE FIRST, FILL SECOND, PIECE BY PIECE. The ears and the shell
         overlap, and a single stroked path over overlapping subpaths draws the
         seam where they meet — an ear with a line across its base. Stroking
         every piece at double width and then filling it covers each seam with
         the neighbour's fill, and only the true outer edge survives. */
      const solid = (draw) => {
        tx.beginPath(); draw();
        tx.lineWidth = S(4.8); tx.strokeStyle = this.paper2; tx.stroke();
        tx.fillStyle = shell; tx.fill();
      };

      /* Ears, big, and drawn BEFORE the shell so their bases disappear under
         it. Small ones on a body this wide read as dents, not ears. */
      const EARS = [[30, 82, 44, 4, 104, 52], [250, 82, 236, 4, 176, 52]];
      for (const [x0, y0, ax, ay, x1, y1] of EARS) {
        solid(() => {
          tx.moveTo(X(x0), Y(y0));
          tx.quadraticCurveTo(X(ax - (ax - x0) * 0.3), Y(ay + 18), X(ax), Y(ay));
          tx.quadraticCurveTo(X(ax + (x1 - ax) * 0.22), Y(ay + 14), X(x1), Y(y1));
          tx.closePath();
        });
      }

      /* The shell: trace number 2 with the grips slimmed and the notch between
         them raised, which is what made room for a muzzle. Read it as a flat
         shelf across the top, a raised shoulder either side, the outer edge
         bulging and then tapering into a grip, and a shallow notch between the
         grips. The grips were 22% of the width each on the trace and the note
         back was that they were too fat for a kid to hold; these are 15%. */
      solid(() => {
        tx.moveTo(X(96), Y(50));
        tx.lineTo(X(182), Y(50));
        tx.bezierCurveTo(X(190), Y(50), X(194), Y(45), X(202), Y(45));
        tx.lineTo(X(240), Y(45));
        tx.bezierCurveTo(X(254), Y(45), X(266), Y(58), X(270), Y(80));
        tx.bezierCurveTo(X(274), Y(100), X(272), Y(122), X(267), Y(142));
        tx.bezierCurveTo(X(261), Y(170), X(250), Y(196), X(234), Y(202));
        tx.bezierCurveTo(X(220), Y(207), X(208), Y(200), X(201), Y(184));
        tx.bezierCurveTo(X(195), Y(170), X(190), Y(152), X(178), Y(149));
        tx.bezierCurveTo(X(168), Y(147), X(158), Y(151), X(139), Y(151));
        tx.bezierCurveTo(X(120), Y(151), X(112), Y(147), X(102), Y(149));
        tx.bezierCurveTo(X(90), Y(152), X(85), Y(170), X(79), Y(184));
        tx.bezierCurveTo(X(72), Y(200), X(60), Y(207), X(46), Y(202));
        tx.bezierCurveTo(X(30), Y(196), X(19), Y(170), X(13), Y(142));
        tx.bezierCurveTo(X(8), Y(122), X(6), Y(100), X(10), Y(80));
        tx.bezierCurveTo(X(14), Y(58), X(26), Y(45), X(40), Y(45));
        tx.lineTo(X(78), Y(45));
        tx.bezierCurveTo(X(86), Y(45), X(90), Y(50), X(96), Y(50));
        tx.closePath();
      });

      /* The pink insides go on AFTER the shell, so its fill cannot bury them.
         A triangle with nothing in it reads as a spike; the pink is most of
         what says "ear". */
      tx.fillStyle = pink;
      for (const [x0, y0, ax, ay, x1, y1] of EARS) {
        const k = (a, b, t) => a + (b - a) * t;
        tx.beginPath();
        tx.moveTo(X(k(x0, ax, 0.34)), Y(k(y0, ay, 0.24)));
        tx.quadraticCurveTo(X(ax), Y(ay + 26), X(ax), Y(ay + 14));
        tx.quadraticCurveTo(X(ax), Y(ay + 26), X(k(x1, ax, 0.36)), Y(k(y1, ay, 0.26)));
        tx.closePath(); tx.fill();
      }

      /* NO TOUCHPAD. It is the one DS4 landmark this pad drops, and it was
         asked about twice before the shell got a face: a hollow rounded
         rectangle only reads as a touchpad if you already know DualShocks, and
         on a forehead it read as a screen taped to the animal. The game binds
         nothing to it, so nothing is lost but the reference. */

      /* FITTED, NOT GUESSED. Point sizes were hand-picked once and the same
         number overflowed one hole and floated tiny in another. Both axes are
         now measured off the glyph actually being rendered — which also
         settles the square: U+25A1 draws about two thirds the height of U+25CB
         at the same point size, so at one fixed size it looked like a smaller
         button than the three around it. Normalising by MEASURED ink height
         makes all four faces read the same size whatever font the browser
         falls back to. */
      const fit = (text, targetH, maxW) => {
        tx.font = '700 100px Nunito, system-ui, sans-serif';
        const m = tx.measureText(text);
        const h = (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) || 72;
        const w = m.width || 60;
        return Math.max(4, Math.min(100 * targetH / h, 100 * maxW / w));
      };
      const label = (text, cx, cy, targetH, maxW, on) => {
        tx.fillStyle = on ? this.ink : this.paper;
        tx.font = '700 ' + fit(text, targetH, maxW).toFixed(1)
          + 'px Nunito, system-ui, sans-serif';
        tx.textAlign = 'center'; tx.textBaseline = 'alphabetic';
        const m = tx.measureText(text);
        /* Centre on the INK, not on the em box. `middle` centres the em box,
           and ✕ and □ have wildly different ascents and descents inside it —
           the square sat visibly high in its circle while the cross sat low. */
        const a = m.actualBoundingBoxAscent || 0, d = m.actualBoundingBoxDescent || 0;
        tx.fillText(text, X(cx), Y(cy) + (a - d) / 2);
      };

      for (const b of blanks) if (b.kind !== 'bump') glow(path(b.kind, b.box), false);
      for (const h of holes) {
        if (h.kind === 'bump') continue;                 // drawn already, behind the shell
        const on = lit.has(h.act);
        glow(path(h.kind, h.box), on);
        /* SLIVERS CARRY NO LETTERING. "OPTIONS" is seven letters in a slot ten
           units wide; every size that fitted came out smaller than the GIF's
           own dither noise, legible as neither a word nor a shape. The caption
           bar under the clip already spells the name out, and what the picture
           has to say is WHICH slot lit up. */
        if (h.kind === 'sliver') continue;
        label(h.glyph, h.box[0], h.box[1], S(8.6), S(12.5), on);
      }
      // shoulder lettering, on top of the tabs drawn before the shell
      for (const h of holes) {
        if (h.kind !== 'bump') continue;
        label(h.glyph, h.box[0] + h.box[2] / 2, h.box[1] + h.box[3] / 2,
          S(6.5), S(h.box[2] - 8), lit.has(h.act));
      }

      /* The d-pad is drawn but never lit: this game steers with the STICK, and
         a cross that lights up would teach the wrong control. */
      tx.save();
      tx.fillStyle = 'rgba(251,238,210,.16)';
      tx.strokeStyle = etch; tx.lineWidth = S(1.5);
      for (const [dx, dy, w, h] of [[-11, -4.5, 22, 9], [-4.5, -11, 9, 22]]) {
        const p = new Path2D();
        p.roundRect ? p.roundRect(X(56 + dx), Y(90 + dy), S(w), S(h), S(2.5))
          : p.rect(X(56 + dx), Y(90 + dy), S(w), S(h));
        tx.fill(p); tx.stroke(p);
      }
      tx.restore();

      /* ------------------------------ the face ------------------------------
         EYES OF THEIR OWN, ABOVE THE STICKS AND STILL. The version that used
         the sticks as eyes swivelled them as the player walked, which read as
         creepy rather than as cute — and it also meant the one part of the
         picture that has to say "this is a control" was pretending to be
         something else. These are painted on, they never move, and they never
         light: nothing on this pad that a player cannot press is allowed to
         change, or the lighting stops meaning anything. */
      for (const ex of [110, 170]) {
        tx.beginPath(); tx.ellipse(X(ex), Y(78), S(11), S(12), 0, 0, Math.PI * 2);
        tx.fillStyle = 'rgba(251,238,210,.9)'; tx.fill();
        tx.lineWidth = S(1.5); tx.strokeStyle = this.ink; tx.stroke();
        tx.beginPath(); tx.ellipse(X(ex), Y(79), S(5), S(8), 0, 0, Math.PI * 2);
        tx.fillStyle = this.ink; tx.fill();
        tx.beginPath(); tx.arc(X(ex + 3.5), Y(73), S(2.4), 0, Math.PI * 2);
        tx.fillStyle = 'rgba(255,255,255,.85)'; tx.fill();
      }

      // nose, mouth and whiskers, in the gap the sticks were moved down to open
      tx.lineWidth = S(1.7); tx.strokeStyle = etch;
      tx.beginPath();
      tx.moveTo(X(132), Y(98)); tx.lineTo(X(148), Y(98));
      tx.lineTo(X(140), Y(107)); tx.closePath();
      tx.fillStyle = pink; tx.fill(); tx.stroke();
      /* The two arcs of a cat's w, WIDE. The first cut ran them four units
         either side and the whole thing read as a thin Y hanging off the nose
         rather than as a mouth. */
      tx.beginPath();
      tx.moveTo(X(140), Y(107)); tx.lineTo(X(140), Y(111));
      tx.moveTo(X(140), Y(111));
      tx.bezierCurveTo(X(140), Y(119), X(130), Y(120), X(126), Y(112));
      tx.moveTo(X(140), Y(111));
      tx.bezierCurveTo(X(140), Y(119), X(150), Y(120), X(154), Y(112));
      tx.stroke();
      /* Whiskers run out under the eyes and are OVERDRAWN BY THE STICKS, which
         is why they are stroked here and the sticks come last: a whisker that
         stopped short of a stick well looked snapped off. */
      tx.beginPath();
      for (const dir of [-1, 1]) {
        for (const [dy, len, drop] of [[-4, 30, -5], [0, 34, 0], [4, 30, 5]]) {
          tx.moveTo(X(140 + dir * 12), Y(102 + dy));
          tx.quadraticCurveTo(X(140 + dir * (12 + len * 0.6)), Y(102 + dy + drop * 0.3),
            X(140 + dir * (12 + len)), Y(102 + dy + drop));
        }
      }
      tx.lineWidth = S(1.3); tx.stroke();

      // sticks — the left one leans the way she is being pushed
      const stick = (cx, cy, dx, dy, live) => {
        tx.beginPath(); tx.arc(X(cx), Y(cy), S(16), 0, Math.PI * 2);
        tx.fillStyle = 'rgba(12,8,12,.95)'; tx.fill();
        tx.lineWidth = S(1.5); tx.strokeStyle = 'rgba(251,238,210,.5)'; tx.stroke();
        tx.beginPath();
        /* THE KNOB TRAVELS TEN, which is two thirds of the well. At the two it
           would really move, the lean was invisible at the size the clip plays
           back — and which way she is being pushed is the one thing in this
           picture that has to read. */
        tx.arc(X(cx + dx * 10), Y(cy + dy * 10), S(10), 0, Math.PI * 2);
        tx.fillStyle = live ? tint : 'rgba(251,238,210,.82)'; tx.fill();
        tx.lineWidth = S(1.7); tx.strokeStyle = this.ink; tx.stroke();
      };
      const st = opts.stick || { x: 0, y: 0 };
      const moving = Math.hypot(st.x, st.y) > 0.05;
      stick(98, 124, st.x, st.y, moving);
      stick(182, 124, 0, 0, false);
      tx.restore();
      return { w: S(280), h: S(214) };
    },
  };

  window.__mk = K;
  return 'movekit ready';
})();
