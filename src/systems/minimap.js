/* ---------------------------------------------------------------------------
   Minimap.

   Two nine-year-olds on six floating islands with no landmarks in the fog get
   lost inside a minute, and "I don't know where I am" is the fastest way to
   stop having fun. This draws the whole archipelago at once — every island in
   its own biome colour, both kitties, every dragon, and the places worth
   walking to — so there is always an answer to "where do I go now".

   Canvas 2D over the top of the WebGL canvas. It costs nothing and it can't
   fight the renderer for state.
--------------------------------------------------------------------------- */

const PAD = 46;

/** Zoom steps. 1 fits the whole archipelago; the rest close in on a player. */
export const ZOOMS = [1, 2.2, 4.5];

export class Minimap {
  /**
   * @param canvas the <canvas> to draw into
   * @param world  the World, for islands, shrines and landmarks
   * @param focusIndex which player to centre on when zoomed in, or null to
   *        centre on the pair (used by the single shared map)
   */
  constructor(canvas, world, focusIndex = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.focusIndex = focusIndex;
    this.zoom = 1;

    // Fit every island (plus its radius) into the canvas, once, at build time.
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const isl of world.islands) {
      minX = Math.min(minX, isl.x - isl.radius);
      maxX = Math.max(maxX, isl.x + isl.radius);
      minZ = Math.min(minZ, isl.z - isl.radius);
      maxZ = Math.max(maxZ, isl.z + isl.radius);
    }
    this.bounds = { minX, maxX, minZ, maxZ };
    this._resize();

    /** Landmarks worth a label. Kept short — a map with twenty names on it is
     *  as useless as one with none. */
    /* `dy` nudges each label off its own point. Town and the grove are only
       ~58 world units apart, which is a couple of dozen pixels here — centred
       on their own positions the two words sat on top of each other and the
       map's most useful information was the least readable thing on it. */
    this.marks = [
      { x: 0, z: 40, label: 'Town', dy: -7 },
      { x: world.dojoCentre.x, z: world.dojoCentre.z, label: 'Dojo', dy: -7 },
    ];
    /* Every grove gets a label, read straight off the world rather than typed
       in here — raising a panda costs forty canes, so "where is the bamboo"
       becomes the single most asked question on the map, and a hardcoded list
       that silently misses a grove is worse than no label at all. */
    for (const g of world.groves ?? []) {
      this.marks.push({ x: g.x, z: g.z, label: 'Bamboo', dy: 11 });
    }
    // Shrines get a proper labelled marker — they're a destination, not a dot.
    for (const h of world.clanHalls) {
      this.marks.push({
        x: h.x, z: h.z, kind: 'clan', color: h.clan.color, clan: h.clan,
      });
    }
  }

  _resize(centre) {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.dpr = dpr;

    const b = this.bounds;
    const spanX = b.maxX - b.minX;
    const spanZ = b.maxZ - b.minZ;
    // One uniform scale, so the archipelago keeps its real shape.
    const fit = Math.min((w - PAD) / spanX, (h - PAD) / spanZ);
    this.scale = fit * this.zoom;

    if (this.zoom <= 1 || !centre) {
      this.ox = (w - spanX * this.scale) / 2 - b.minX * this.scale;
      this.oy = (h - spanZ * this.scale) / 2 - b.minZ * this.scale;
    } else {
      // Zoomed in: keep the followed kitten in the middle of the frame.
      this.ox = w / 2 - centre.x * this.scale;
      this.oy = h / 2 - centre.z * this.scale;
    }
  }

  /** Step the zoom. Returns the new level, for the toast. */
  cycleZoom(dir = 1) {
    const i = ZOOMS.indexOf(this.zoom);
    const next = (i < 0 ? 0 : i + dir + ZOOMS.length) % ZOOMS.length;
    this.zoom = ZOOMS[next];
    return this.zoom;
  }

  _px(x) { return x * this.scale + this.ox; }

  _py(z) { return z * this.scale + this.oy; }

  /**
   * @param players two Player instances
   * @param dragons all Dragons
   */
  draw(players, dragons) {
    const focus = this.focusIndex != null
      ? players[this.focusIndex].position
      : {
        x: (players[0].position.x + players[1].position.x) / 2,
        z: (players[0].position.z + players[1].position.z) / 2,
      };
    this._resize(focus);
    this._t = (this._t ?? 0) + 0.09;      // slow pulse for the shrine haloes
    const c = this.ctx;
    const { width: W, height: H } = this.canvas;
    c.clearRect(0, 0, W, H);

    // --- islands ---
    for (const isl of this.world.islands) {
      const r = isl.radius * this.scale;
      c.beginPath();
      c.arc(this._px(isl.x), this._py(isl.z), r, 0, Math.PI * 2);
      c.fillStyle = `#${isl.palette.map.toString(16).padStart(6, '0')}`;
      c.globalAlpha = 0.82;
      c.fill();
      c.globalAlpha = 1;
      c.lineWidth = 1.5 * this.dpr;
      c.strokeStyle = 'rgba(28,16,22,0.75)';
      c.stroke();
    }

    // --- landmarks ---
    for (const m of this.marks) {
      const x = this._px(m.x);
      const y = this._py(m.z);
      if (m.kind === 'clan') {
        /* A clan shrine is drawn as a diamond with a pale halo and, once
           there's room, its name — these are the things worth flying to, so
           they have to look like a destination rather than a speck. A ring
           marks the one you've already sworn to. */
        const hex = `#${m.color.toString(16).padStart(6, '0')}`;
        const joined = players.some((p) => p.clan?.id === m.clan.id);
        const s = (joined ? 6.5 : 5.5) * this.dpr;

        c.save();
        c.translate(x, y);
        c.beginPath();
        c.arc(0, 0, s * 1.9, 0, Math.PI * 2);
        c.fillStyle = hex;
        c.globalAlpha = 0.22 + Math.sin(this._t ?? 0) * 0.06;
        c.fill();
        c.globalAlpha = 1;

        c.rotate(Math.PI / 4);
        c.fillStyle = hex;
        c.strokeStyle = 'rgba(20,12,18,0.9)';
        c.lineWidth = 1.8 * this.dpr;
        c.fillRect(-s / 1.4, -s / 1.4, s * 1.43, s * 1.43);
        c.strokeRect(-s / 1.4, -s / 1.4, s * 1.43, s * 1.43);
        c.restore();

        if (joined) {
          c.beginPath();
          c.arc(x, y, s * 2.4, 0, Math.PI * 2);
          c.strokeStyle = hex;
          c.lineWidth = 2 * this.dpr;
          c.stroke();
        }
        // Only label shrines when zoomed in — at world zoom four names on a
        // small map is worse than none.
        if (this.zoom > 1) {
          c.font = `800 ${9.5 * this.dpr}px Nunito, sans-serif`;
          c.textAlign = 'center';
          c.lineWidth = 3 * this.dpr;
          c.lineJoin = 'round';
          c.strokeStyle = 'rgba(20,12,18,0.9)';
          c.strokeText(m.clan.name, x, y + 17 * this.dpr);
          c.fillStyle = hex;
          c.fillText(m.clan.name, x, y + 17 * this.dpr);
        }
      } else {
        // Outlined, because these sit over island greens, snow and ash and
        // have to stay readable on all of them.
        c.font = `800 ${10 * this.dpr}px Nunito, sans-serif`;
        c.textAlign = 'center';
        c.lineWidth = 3 * this.dpr;
        c.lineJoin = 'round';
        c.strokeStyle = 'rgba(20,12,18,0.9)';
        c.strokeText(m.label, x, y + m.dy * this.dpr);
        c.fillStyle = '#fff2d4';
        c.fillText(m.label, x, y + m.dy * this.dpr);
      }
    }

    // --- dragons: a triangle each, in its breed colour ---
    for (const d of dragons) {
      if (d.mounted) continue;
      const x = this._px(d.position.x);
      const y = this._py(d.position.z);
      const s = 4 * this.dpr;
      c.beginPath();
      c.moveTo(x, y - s);
      c.lineTo(x + s, y + s * 0.8);
      c.lineTo(x - s, y + s * 0.8);
      c.closePath();
      c.fillStyle = `#${d.breed.tint.toString(16).padStart(6, '0')}`;
      c.fill();
      c.lineWidth = 1.2 * this.dpr;
      c.strokeStyle = 'rgba(28,16,22,0.8)';
      c.stroke();
    }

    /* --- a panda that has stopped following ---
       Only the waiting ones. A panda at your heel is already where your own
       marker is, so drawing it there is a second dot that tells you nothing —
       but one you left on another island is exactly as findable as a dragon
       needs to be, and for the same reason. Drawn as a rounded blob so it
       can't be confused with a dragon's triangle. */
    for (const p of players) {
      const pet = p.panda;
      if (!pet || pet.follows || pet.mounted) continue;
      const x = this._px(pet.position.x);
      const y = this._py(pet.position.z);
      const s = 4.2 * this.dpr;
      c.beginPath();
      c.arc(x, y, s, 0, Math.PI * 2);
      c.fillStyle = '#f4f1e8';
      c.fill();
      c.lineWidth = 1.4 * this.dpr;
      c.strokeStyle = '#1c1016';
      c.stroke();
      // Two ears, so it reads as a panda rather than a plain dot.
      for (const sx of [-1, 1]) {
        c.beginPath();
        c.arc(x + sx * s * 0.72, y - s * 0.72, s * 0.42, 0, Math.PI * 2);
        c.fillStyle = '#1c1016';
        c.fill();
      }
      // A pip in its owner's colour, so you can tell whose it is.
      c.beginPath();
      c.arc(x, y + s * 0.15, s * 0.34, 0, Math.PI * 2);
      c.fillStyle = p.index === 0 ? '#ff8a3d' : '#ff6fae';
      c.fill();
    }

    // --- the kitties, drawn last so they're never hidden ---
    players.forEach((p, i) => {
      const x = this._px(p.position.x);
      const y = this._py(p.position.z);
      const s = 5 * this.dpr;
      /* A heading wedge, so you can tell which way you're pointing.
         Map +y is world +z, and a facing of 0 is world +z — so a wedge drawn
         pointing UP needs a half turn taken off the rotation, or north and
         south come out swapped and the map actively misleads you. */
      c.save();
      c.translate(x, y);
      c.rotate(Math.PI - p.facing);
      c.beginPath();
      c.moveTo(0, -s * 1.5);
      c.lineTo(s, s);
      c.lineTo(0, s * 0.4);
      c.lineTo(-s, s);
      c.closePath();
      c.fillStyle = i === 0 ? '#ff8a3d' : '#ff6fae';
      c.fill();
      c.lineWidth = 1.6 * this.dpr;
      c.strokeStyle = '#1c1016';
      c.stroke();
      c.restore();
    });
  }
}
