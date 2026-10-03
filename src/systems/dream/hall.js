import * as THREE from 'three';
import { CLANS } from '../../world/world.js';
import { Billboard } from '../../core/gfx.js';
import { SIM, HOLO } from '../../world/simworld.js';
import { STEAL, DBREATH } from '../../entities/clanpower.js';
import { HoloPanel } from './holo.js';
import { Post, Cane, HoloKitten, BLADE_KINDS } from './targets.js';

/* ---------------------------------------------------------------------------
   THE CLAN TRIAL HALL — all six oaths, sworn for a minute, tried for real.

   Richard: "They can also apply different Clan abilities here by
   'temporarily' pledging to the Clans and can learn the benefits of each clan
   and also can use the special clan abilities here."

   Six holo-shrines in a horseshoe, each with its leader standing in light.
   Step onto one and press INTERACT: you are sworn to that clan FOR AS LONG AS
   YOU ARE IN THE SIMULATOR (`DreamDojo.swearFor`), and its trial starts — a
   short test that cannot be passed without the clan's own power.

   THE OATH IS A COSTUME. Her real clan is kept on `dreamOath.was` and put
   back the moment she jacks out, however she jacks out; `castRow` saves the
   real one if a save lands while she is in here. Swearing in here never calls
   `onJoinClan`, so no leader cheers, no panda arrives, no quest moves —
   nothing in the archipelago knows she did it.

   THE TWO ARENA POWERS ARE THE POINT. 盗 Steal Mischief and 息 Dragon Breath
   only work in a live round, which means until now the first time a kitten
   ever pressed them was in front of her sisters with a round on the clock.
   In here `arenaLive` is yes (see simhud.js), the holo-kittens are something
   to aim at, and the cooldowns are cut to a second so a miss is a retry
   rather than a forty-second wait.
--------------------------------------------------------------------------- */

/** What each clan does in the ring, said plainly — the card's last line. */
/** 河: Riverclaw's posts are cut from outside a ring this wide. */
export const RIVER_RING = 5.4;
/** 影: Shadowtail's star, above the hall floor. */
export const SHADOW_DECK = 6.8;

export const CLAN_ARENA = {
  thunder: 'In the ring: you out-run everybody',
  river: 'In the ring: your blade out-reaches theirs',
  shadow: 'In the ring: three jumps to dodge with',
  wind: '息 Dragon Breath on foot — press {interact}',
  ice: '盗 Steal Mischief — {interact} to mark, then hit her',
  panda: 'Your panda fights beside you in the ring',
};

export class TrialHall {
  constructor(dream, isle) {
    this.dream = dream;
    this.isle = isle;
    this.shrines = [];
    this.stations = [];
    this._build();
  }

  _build() {
    const { dream, isle } = this;
    const sim = dream.sim;
    const f = isle.fwd;
    const r = { x: -f.z, z: f.x };
    const n = CLANS.length;
    const R = isle.r - 5;
    CLANS.forEach((clan, i) => {
      const a = THREE.MathUtils.degToRad(-120 + (240 * i) / (n - 1));
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const x = isle.x + (f.x * ca + r.x * sa) * R;
      const z = isle.z + (f.z * ca + r.z * sa) * R;
      const grp = new THREE.Group();
      grp.position.set(x, isle.y, z);
      // A torii of light: two posts, two beams, in the clan's colour.
      const mat = new THREE.MeshBasicMaterial({ color: clan.color, transparent: true, opacity: 0.85, toneMapped: false });
      const post = new THREE.CylinderGeometry(0.16, 0.2, 4.4, 8);
      for (const s of [-1.9, 1.9]) {
        const m = new THREE.Mesh(post, mat);
        m.position.set(0, 2.2, 0);
        m.position.x = s;
        grp.add(m);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.3, 0.3), mat);
      beam.position.y = 4.5;
      const beam2 = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.18, 0.2), mat);
      beam2.position.y = 3.8;
      grp.add(beam, beam2);
      // Face the torii into the floor's middle.
      grp.rotation.y = Math.atan2(isle.x - x, isle.z - z);
      const pad = new THREE.Mesh(
        new THREE.RingGeometry(2.0, 2.3, 40).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: clan.color, transparent: true, opacity: 0.6, toneMapped: false, depthWrite: false })
      );
      pad.position.set(x, isle.y + 0.04, z);
      sim.root.add(grp, pad);
      // Her leader, in light, behind the gate.
      const back = { x: x + (x - isle.x) * 0.12, z: z + (z - isle.z) * 0.12 };
      const holo = this._holoLeader(clan, back.x, isle.y, back.z);
      const card = new HoloPanel({ w: 7.0, h: 3.6, px: 92, edge: clan.color });
      card.position.set(x, isle.y + 7.4, z);
      card.visible = false;
      sim.root.add(card);
      const sh = { clan, x, z, card, pad, holo, show: 0 };
      this.shrines.push(sh);
      this.stations.push({
        x, z, y: isle.y, r: 2.4,
        prompt: (p, key) => `[${key}]  SWEAR TO ${clan.name.toUpperCase()} — FOR NOW`,
        interact: (p) => this.start(p, sh),
      });
    });
    sim.tickers.push((dt) => this.update(dt));
  }

  /** The real leader's own drawing, tinted to light. Nothing new is drawn. */
  _holoLeader(clan, x, y, z) {
    const L = this.dream.game.leaders?.find((l) => l.clan?.id === clan.id);
    if (!L?.sprite) return null;
    const b = new Billboard(L.sprite.tex, { cols: 1, rows: 1, width: L.quad, height: L.quad, mirror: false });
    b.mesh.geometry.dispose();
    b.mesh.geometry = L.sprite.mesh.geometry;
    b.mat.color.set(0xb8f8ff).lerp(new THREE.Color(clan.color), 0.35);
    b.mat.transparent = true;
    b.mat.opacity = 0.8;
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.add(b);
    this.dream.sim.root.add(g);
    return b;
  }

  _paintCard(sh, p) {
    const c = sh.clan;
    const stars = this.dream.progress.stars(p.style?.name ?? p.name, `hall.${c.id}`);
    const arena = (CLAN_ARENA[c.id] ?? '').replace(/\{(\w+)\}/g, (_, a) => `[${this.dream.key(p, a)}]`);
    const sworn = p.clan?.id === c.id;
    sh.card.set([
      { text: c.name.toUpperCase(), size: 2.0, color: c.color, glow: true },
      { text: `“${c.motto}”`, size: 1.0, color: 0x9fefff },
      { text: c.buff.label, size: 1.25 },
      { text: arena, size: 1.0, color: HOLO.gold },
      { text: sworn ? 'SWORN — press again for the trial' : `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`, size: 1.15, color: HOLO.gold },
    ], c.color);
  }

  update(dt) {
    /* A kitten in a drill has the drill's card over her head; the shrine's
       card is the same height over the same spot and lands on top of it. */
    const inside = this.dream.simKittens().filter((p) => !this.dream.drills[p.index]);
    for (const sh of this.shrines) {
      let near = null;
      let nd = 9;
      for (const p of inside) {
        const d = Math.hypot(p.position.x - SIM.dx - sh.x, p.position.z - SIM.dz - sh.z);
        if (d < nd) { nd = d; near = p; }
      }
      if (near) this._paintCard(sh, near);
      sh.show += ((near ? 1 : 0) - sh.show) * Math.min(1, dt * 6);
      sh.card.visible = sh.show > 0.03;
      sh.card.mat.opacity = sh.show;
      sh.pad.material.opacity = 0.45 + 0.25 * Math.sin(this.dream.t * 2.6 + sh.z);
      if (sh.holo) sh.holo.mat.opacity = Math.sin(this.dream.t * 29 + sh.x) > 0.94 ? 0.35 : 0.8;
    }
  }

  faceCamera(camera) {
    for (const sh of this.shrines) {
      sh.holo?.faceCamera(camera);
      if (sh.card.visible) sh.card.faceCamera(camera);
    }
  }

  start(p, sh) {
    this.dream.swearFor(p, sh.clan);
    const spec = TRIALS[sh.clan.id]?.(this, p);
    if (!spec) return false;
    this.dream.startDrill(p, { ...spec, id: `hall.${sh.clan.id}` }, {
      x: this.isle.x, y: this.isle.y, z: this.isle.z, r: this.isle.r, fwd: this.isle.fwd,
    });
    return true;
  }
}

/* ------------------------------- the trials ------------------------------ */

/** In a trial the two arena powers come back in a second, not forty. */
function quickPowers(p) {
  if (p.stealCool > 1 && !p.stealMarked) p.stealCool = 1;
  if (p.breathCool > 1 && !p.arenaBreathAt) p.breathCool = 1;
}

export const TRIALS = {
  /* 雷 THUNDERPAW. Ten gates in a star (each leg ~15.4 units, 154 in all).
     A sprint is 17 u/s; sworn, 23. Three stars wants the oath. */
  thunder: (h, p) => ({
    title: 'THUNDERPAW TRIAL', kanji: '雷', goal: 10, time: 24, bands: [24, 12, 8.5],
    goalText: 'Run every gate before the thunder rolls', countLabel: 'gates ',
    setup(d) {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = (i * 3 * Math.PI * 2) / 10;
        pts.push(d.spot(Math.cos(a) * 9.5, Math.sin(a) * 9.5));
      }
      d.gateList = pts.map((q, i) => {
        const nx = pts[(i + 1) % 10];
        const rr = d.ring({
          x: q.x, y: q.y, z: q.z, r: 1.9, yaw: Math.atan2(nx.x - q.x, nx.z - q.z),
          onPass: () => {
            d.progress();
            const n = d.gateList[i + 1];
            if (n) { n.armed = true; n.setColour(d.colour); }
            rr.setColour(0x224433);
          },
        });
        rr.armed = i === 0;
        if (i) rr.setColour(0x335566);
        return rr;
      });
    },
  }),

  /* 河 RIVERCLAW. Posts inside red rings of 5.4. Bare reach is 4.0 with the
     gate's padding, one Long Cut orb 5.0 — neither arrives. Sworn, 1.8x
     the blade is 6.1 + 0.6: it does. */
  river: (h, p) => ({
    title: 'RIVERCLAW TRIAL', kanji: '河', goal: 4, time: 30, bands: [30, 15, 10],
    goalText: 'Cut each post from OUTSIDE its ring', countLabel: 'posts ',
    setup(d) {
      for (const [a, b] of [[6, -6], [6, 6], [-6, -6], [-6, 6]]) {
        const q = d.spot(a, b);
        const t = d.target(Post, {
          x: q.x, y: q.y, z: q.z,
          accept: (info) => info.dist >= RIVER_RING,
          onRefuse: () => d.dream.hint(d.p, 'Further! Riverclaw cuts from OUTSIDE the ring'),
          onBreak: () => d.progress(),
        });
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(RIVER_RING - 0.15, RIVER_RING, 56).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: 0x6fd0f0, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false })
        );
        ring.position.y = 0.06;
        t.group.add(ring);
      }
    },
  }),

  /* 影 SHADOWTAIL. A star SHADOW_DECK up. Two ordinary jumps top out at
     4.19 (+0.4 to land = 4.59): nowhere near. Sworn, every jump is x1.15 and
     there are three, only the last of them weak: 3.19 + 3.19 + 2.36 = 8.74.
     A kitten wearing a 跳 Leap orb has three ordinary jumps (6.61 + 0.4) and
     makes it as well — she bought her own way up, which is the same lesson,
     so the trial does not pretend otherwise. */
  shadow: (h, p) => ({
    title: 'SHADOWTAIL TRIAL', kanji: '影', goal: 1, time: 20, bands: [20, 8, 5], showCount: false,
    goalText: 'Three jumps, higher than you have ever jumped',
    setup(d) {
      const q = d.spot(5, 0);
      d.deck({ x: q.x, z: q.z, y: q.y + SHADOW_DECK, r: 2.3 });
      d.star({ x: q.x, y: q.y + SHADOW_DECK, z: q.z, onTake: () => d.progress() });
    },
  }),

  /* 息 WINDWHISKER. Three holo-kittens close together, inside one cone
     (DBREATH.range, half-angle acos(1 - spread)). One breath catches all
     three; anything else just rocks them. */
  wind: (h, p) => ({
    title: 'WINDWHISKER TRIAL', kanji: '息', goal: 3, time: 25, bands: [25, 10, 6],
    goalText: `Breathe on all three — [${h.dream.key(p, 'interact')}] on the ground`, countLabel: 'caught ',
    setup(d) {
      const spec = d.dream.kittenSpec();
      const reach = Math.min(DBREATH.range - 1.5, 6.5);
      for (const b of [-1.6, 0, 1.6]) {
        const q = d.spot(reach, b);
        d.target(HoloKitten, {
          x: q.x, y: q.y, z: q.z, spec, name: 'a holo-kitten', kinds: ['dbreath'],
          onRefuse: () => d.dream.hint(d.p, `Breathe! Press [${h.dream.key(d.p, 'interact')}] on the ground`),
          onBreak: () => d.progress(),
        });
      }
      d.p.breathCool = 0;
    },
    tick: (d) => quickPowers(d.p),
  }),

  /* 盗 ICEWHISKER. A holo-kitten wearing a holo-orb, pacing. MARK her
     (interact, facing her, within STEAL.range), then hit her inside
     STEAL.window seconds: the orb comes off and rolls away. Pick it up. */
  ice: (h, p) => ({
    title: 'ICEWHISKER TRIAL', kanji: '盗', goal: 1, time: 35, bands: [35, 16, 10], showCount: false,
    goalText: `Mark her with [${h.dream.key(p, 'interact')}], then HIT her`,
    setup(d) {
      const spec = d.dream.kittenSpec();
      const c = d.spot(5, 0);
      d.mark = d.target(HoloKitten, {
        x: c.x, y: c.y, z: c.z, spec, name: 'the holo-kitten', orbs: ['swift'], hits: 99,
        onHit: (t, info) => {
          const a = info.attacker;
          if (a.stealMarked && a.stealTarget === t) {
            a._endMark(null);
            t.powerOrbs = [];
            d.dream.game.sfx?.('orb');
            const q = { x: t.group.position.x + 2, y: c.y, z: t.group.position.z };
            d.star({ x: q.x, y: q.y, z: q.z, colour: 0x53e2ff, onTake: () => d.progress() });
            d.dream.hint(d.p, 'Knocked loose! Grab the orb before it fades');
          } else if (!a.stealMarked) {
            d.dream.hint(d.p, `Mark her first — face her and press [${h.dream.key(d.p, 'interact')}]`);
          }
        },
      });
      d.p.stealCool = 0;
      d.pace = 0;
      d.c = c;
    },
    tick(d, dt) {
      quickPowers(d.p);
      // She paces a slow circle, so marking is aiming and not just pressing.
      d.pace += dt * 0.5;
      const m = d.mark;
      if (m?.live) {
        m.group.position.set(d.c.x + Math.cos(d.pace) * 3, d.c.y, d.c.z + Math.sin(d.pace) * 3);
      }
    },
  }),

  /* 熊 PANDAPAW. The patient clan's job is bamboo — the real oath pays a cub
     for it, and the cub grows into a panda that fights beside you in the
     ring. Ten canes; only the blade cuts them, as in the real grove. */
  panda: (h, p) => ({
    title: 'PANDAPAW TRIAL', kanji: '熊', goal: 10, time: 30, bands: [30, 16, 10],
    goalText: 'Cut ten canes — only the katana cuts bamboo', countLabel: 'canes ',
    doneText: () => 'Out there, that earns a panda cub',
    setup(d) {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const rr = 4 + (i % 2) * 3.5;
        const q = d.spot(Math.cos(a) * rr, Math.sin(a) * rr);
        d.target(Cane, {
          x: q.x, y: q.y, z: q.z,
          onRefuse: () => d.dream.hint(d.p, 'Bamboo only answers to the katana'),
          onBreak: () => d.progress(),
        });
      }
    },
  }),
};

export { BLADE_KINDS, STEAL };
