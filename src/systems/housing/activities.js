import * as THREE from 'three';
import { mealPct, BOON } from './boons.js';

/* ---------------------------------------------------------------------------
   THINGS TO DO AT HOME — the furniture that answers back.

   Richard's playtest: "nap: fade to black or a blink; kotatsu: sit; meal:
   instant cook, carry the plate overhead, one plate per player, everyone sits
   and prays Itadakimasu; shrine: stop the music, temple music, a long gong;
   onsen: poof into bathing suits, walk into the water, relax". Every one of
   them is a HOLD: a few seconds in which her pad is dead (`holds`, read by
   main.js beside `inspector.busy`) and her drawing is one of the poses
   `Player` already owns (`homePose`). Each hold is SHORT and TIMED, so there
   is no way to get stuck in one and no button to learn to get out.

   WHAT THEY PAY is in boons.js — this file only decides when they have been
   earned.

   PLACEHOLDERS, all listed in docs/notes/housing.md:
     - the prayer wears the star's reach pose; Richard asked for a prayer
       sheet, four directions x three or four frames;
     - the onsen and the meal wear the eating crouch; there are no bathing
       suits — the "poof" is a puff of steam;
     - the nap hides her (under the covers) — there is no lying-down drawing;
     - the drum and the cups game are a line and a sound, not games yet.
--------------------------------------------------------------------------- */

/** How long each hold lasts, in seconds. */
export const HOLD = {
  pray: 5,
  soak: 6,
  nap: 4,
  look: 5,
  sit: 2.5,
  /** The meal: the wait for the others to sit, the prayer, the eating. */
  mealWait: 3,
  mealPray: 1.6,
  mealEat: 3,
};

/** The temple piece: once through, then the second gong (jukebox.js). */
export const PRAYER_TRACK = 'shrinePrayer';
export const PRAYER_LEN = 45;

/**
 * THE NAP'S FADE, as an opacity over the hold — 0 to black in a second, held,
 * and back in the last second. Pure, so the checks can ask it.
 */
export function napFade(t, dur = HOLD.nap) {
  if (!(t >= 0) || t >= dur) return 0;
  return Math.min(1, t / 1, (dur - t) / 1);
}

export class HomeActivities {
  constructor(housing) {
    this.H = housing;
    this.game = housing.game;
    /** Seat index → { act, t, dur, ... } for every kitten being held. */
    this.held = new Map();
    /** Kotatsu key → { at, diners: Set, t, phase } — the meals being eaten. */
    this.meals = new Map();
    /** The shrine's song: { site, t } while it is playing, else null. */
    this.prayer = null;
    this._plates = new Map();
    this._puffs = [];
    this._fades = null;
  }

  /** Is her pad held still this frame? (main.js, beside `inspector.busy`) */
  holds(i) { return this.held.has(i); }

  /** INTERACT at a spot whose act is one of ours. True if answered. */
  start(p, s) {
    const fn = {
      pray: this._pray, soak: this._soak, nap: this._nap, look: this._look,
      cook: this._cook, sit: this._sit, trophies: this._trophies, bell: this._bell,
      drum: this._drum,
    }[s.act];
    if (!fn || this.held.has(p.index)) return false;
    fn.call(this, p, s);
    return true;
  }

  _hold(p, act, dur, extra = {}) {
    this.held.set(p.index, { act, t: 0, dur, ...extra });
    p.velocity?.set?.(0, 0, 0);
  }

  _release(p) {
    this.held.delete(p.index);
    if (p) p.homePose = null;
  }

  /* -------------------------------- shrine -------------------------------- */

  _pray(p, s) {
    const G = this.game;
    this._hold(p, 'pray', HOLD.pray, { s });
    p.homePose = 'bless';
    /* THE SONG STARTS ONCE. A second kitten praying while it plays joins
       it, rather than starting it over under her sister. */
    if (!this.prayer) {
      this.prayer = { site: s.home?.site ?? null, t: 0 };
      G.audio?.sample?.('templeGong', 0.9);
    }
    G.toast(`${p.name} claps twice, bows, and prays…`, p.index);
  }

  /** The jukebox gives way to this while it plays (Housing.musicTrack). */
  prayerTrack() {
    if (!this.prayer) return null;
    return this.game.audio?.fileMissing?.(PRAYER_TRACK) ? 'dojo' : PRAYER_TRACK;
  }

  /* --------------------------------- onsen -------------------------------- */

  _soak(p, s) {
    /* INTO THE WATER: round the middle of the spring, a place each, so four
       kittens soaking are four kittens and not one stack of them. */
    const n = [...this.held.values()].filter((h) => h.act === 'soak').length;
    const a = n * (Math.PI / 2) + 0.4;
    const x = s.x + Math.sin(a) * 1.6;
    const z = s.z + Math.cos(a) * 1.6;
    this._puff(p.position);
    p.position.x = x;
    p.position.z = z;
    p.group?.position?.copy?.(p.position);
    this._puff(p.position);
    this._hold(p, 'soak', HOLD.soak, { s });
    p.homePose = 'eat';
    this.game.toast(`POOF! ${p.name} is in her bathing suit and sinks into the onsen… ahhh.`, p.index);
    this.game.audio?.play?.('menu');
  }

  /* ---------------------------------- nap --------------------------------- */

  _nap(p, s) {
    this._hold(p, 'nap', HOLD.nap, { s });
    p.homePose = 'hidden';
    this.game.toast(`${p.name} snuggles under the futon… zzz`, p.index);
  }

  /** Is everybody in this pane asleep? Then the pane fades to black. */
  layoutPanes(panes, groups, W, H) {
    if (!this._fades) {
      if (typeof document === 'undefined') return;
      this._fades = document.createElement('div');
      this._fades.id = 'nap-fades';
      document.body.appendChild(this._fades);
    }
    const host = this._fades;
    while (host.childElementCount < panes.length) {
      const d = document.createElement('div');
      d.className = 'nap-fade';
      host.appendChild(d);
    }
    while (host.childElementCount > panes.length) host.lastElementChild.remove();
    panes.forEach((v, i) => {
      const el = host.children[i];
      const members = groups[i] ?? [];
      /* EVERYBODY IN THE PANE, OR NOBODY. A pane two kittens share must not go
         black on the one who is wide awake; she sees her sister vanish under
         the covers instead, which is the "blink" half of the request. */
      const naps = members.map((m) => this.held.get(m)).filter((h) => h?.act === 'nap');
      const k = members.length && naps.length === members.length
        ? Math.min(...naps.map((h) => napFade(h.t, h.dur))) : 0;
      el.style.opacity = k.toFixed(3);
      if (k <= 0) return;
      el.style.left = `${v.x}px`;
      el.style.top = `${H - v.y - v.h}px`;
      el.style.width = `${v.w}px`;
      el.style.height = `${v.h}px`;
    });
  }

  /* ---------------------------- the window ---------------------------------- */

  _look(p, s) {
    const I = s.isle;
    if (!I) return;
    // outward: from the island's middle through the window
    const ox = s.x - I.x, oz = s.z - I.z;
    const L = Math.hypot(ox, oz) || 1;
    this._hold(p, 'look', HOLD.look, { s, out: { x: ox / L, z: oz / L } });
    this.game.toast(`${p.name} slides the window open and looks out…`, p.index);
  }

  /**
   * LOOKING OUT: over her shoulder, through the window, at her own yard. The
   * camera sits inside the room behind her and aims at a point out past the
   * frame.
   */
  cameraFocus(p) {
    const h = this.held.get(p.index);
    if (h?.act !== 'look') return null;
    const { s, out } = h;
    (h.centre ??= new THREE.Vector3()).set(s.x + out.x * 9, s.y + 2.2, s.z + out.z * 9);
    return { centre: h.centre, aim: true, dist: 12.5, pitch: 0.1, yaw: Math.atan2(-out.x, -out.z) };
  }

  /* ---------------------------- kitchen + kotatsu ---------------------------- */

  _kotatsuOf(s) {
    return s.isle?.spots?.find((q) => q.act === 'sit' && q.item === 'kotatsu') ?? null;
  }

  _cook(p, s) {
    const G = this.game;
    if (this._plates.has(p.index)) {
      G.toast('You are already carrying a plate — take it to the KOTATSU and sit down!', p.index);
      return;
    }
    if (!this._kotatsuOf(s)) {
      G.toast('You need a KOTATSU TABLE to eat at — buy one at Roshi\'s furniture shop!', p.index);
      return;
    }
    this._plates.set(p.index, this._plateMesh());
    G.audio?.play?.('menu');
    G.toast(`${p.name} cooks onigiri and miso! Carry it to the KOTATSU — everybody who brings a plate eats together.`, p.index);
  }

  _sit(p, s) {
    const G = this.game;
    const key = `${s.home?.site}:${s.room}:${s.k}`;
    if (!this._plates.has(p.index)) {
      this._hold(p, 'sit', HOLD.sit, { s });
      p.homePose = 'eat';
      G.toast(`${p.name} tucks her feet under the warm kotatsu. Cosy! (Bring a plate from the KITCHEN to eat here.)`, p.index);
      return;
    }
    let M = this.meals.get(key);
    if (M && M.phase !== 'wait') {
      G.toast('They have already started eating — cook another plate and join the next one!', p.index);
      return;
    }
    if (!M) {
      M = { s, diners: new Set(), t: 0, phase: 'wait' };
      this.meals.set(key, M);
    }
    M.diners.add(p.index);
    M.t = 0;
    // a place round the table each, facing it
    const k = M.diners.size - 1;
    const a = k * (Math.PI / 2);
    p.position.x = s.x + Math.sin(a) * 2.2;
    p.position.z = s.z + Math.cos(a) * 2.2;
    p.group?.position?.copy?.(p.position);
    p.facing = Math.atan2(s.x - p.position.x, s.z - p.position.z);
    this._hold(p, 'meal', Infinity, { key });
    p.homePose = 'eat';
    G.toast(M.diners.size === 1
      ? `${p.name} sits down with her plate. Anybody else? Bring a plate and sit too!`
      : `${p.name} joins the meal — ${M.diners.size} at the table!`, p.index);
  }

  _plateMesh() {
    const g = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.5, 0.1, 18),
      new THREE.MeshLambertMaterial({ color: 0xf4efe6 }));
    g.add(plate);
    const rice = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.38, 3),
      new THREE.MeshLambertMaterial({ color: 0xffffff }));
    rice.position.set(-0.15, 0.24, 0);
    rice.rotation.x = -Math.PI / 2 + 0.2;
    g.add(rice);
    const nori = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.08),
      new THREE.MeshLambertMaterial({ color: 0x1d3020 }));
    nori.position.set(-0.15, 0.12, 0.1);
    g.add(nori);
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x8a2a1c, side: THREE.DoubleSide }));
    bowl.position.set(0.22, 0.28, 0);
    g.add(bowl);
    this.game.scene?.add(g);
    return g;
  }

  _dropPlate(i) {
    const m = this._plates.get(i);
    if (m) m.parent?.remove(m);
    this._plates.delete(i);
  }

  /* -------------------------------- the rest -------------------------------- */

  _trophies(p, s) {
    const n = this.H.cupsOf?.(s.home) ?? 0;
    this.game.toast(n
      ? `${n} golden cup${n === 1 ? '' : 's'} on the shelf — one for every arena battle won!`
      : 'An empty shelf… WIN an arena battle and a golden cup appears here!', p.index);
  }

  _bell(p) {
    this.game.audio?.sample?.('templeGong', 0.8);
    this.game.toast('GONNNNNG…', p.index);
  }

  _drum(p) {
    // PLACEHOLDER: the rhythm game is not built; a beat and a line for now
    this.game.audio?.play?.('gong', 0.5);
    this.game.toast('DON! DON! DOKO-DON! (The drum game is coming soon.)', p.index);
  }

  _puff(at) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false,
    }));
    m.position.set(at.x, at.y + 1.2, at.z);
    this.game.scene?.add(m);
    this._puffs.push({ m, t: 0 });
  }

  /* -------------------------------- per frame -------------------------------- */

  update(dt, players) {
    const G = this.game;
    const T = G.tournament;
    /* A BATTLE STARTING ENDS EVERY HOLD. Nothing at home may keep a kitten
       frozen into a round. */
    const fighting = T?.state && T.state !== 'off';
    for (const [i, h] of this.held) {
      const p = players[i];
      if (!p || fighting) { this._release(p ?? {}); this.held.delete(i); continue; }
      h.t += dt;
      p.velocity?.set?.(0, Math.min(0, p.velocity.y), 0);
      if (h.act === 'meal' || h.t < h.dur) continue;
      this._release(p);
      if (h.act === 'pray') {
        this.H.boons?.grant(p, 'bless');
        G.toast(`${p.name} is BLESSED! Fall out of the ring in your next battle and you will FLY.`, p.index);
      } else if (h.act === 'soak') {
        this.H.boons?.grant(p, 'onsen');
        p.hp = Math.max(p.hp, p.maxHp ?? p.hp);
        this._puff(p.position);
        G.toast(`${p.name} feels FIERY! Your first ${BOON.onsenT} seconds of every round next battle hit TWICE as hard.`, p.index);
      } else if (h.act === 'nap') {
        p.hp = Math.max(p.hp, p.maxHp ?? p.hp);
        G.toast(`${p.name} wakes up fully rested!`, p.index);
      }
    }
    this._updateMeals(dt, players);
    // the plate rides over her head; gone if she leaves home or a battle starts
    for (const [i, m] of this._plates) {
      const p = players[i];
      const home = p && this.H.isles.some((I) => I.home && I.over(p.position.x, p.position.z, 6));
      if (!p || !home || fighting) {
        this._dropPlate(i);
        if (p && !fighting) G.toast('You left your plate at home — cook another one!', i);
        continue;
      }
      m.position.set(p.position.x, p.position.y + 3.6 + Math.sin(this.H.time * 5) * 0.06, p.position.z);
      m.visible = this.held.get(i)?.act !== 'meal' || this.meals.get(this.held.get(i).key)?.phase === 'wait';
    }
    // the prayer's song: once through, then the bell again
    if (this.prayer) {
      this.prayer.t += dt;
      if (this.prayer.t >= PRAYER_LEN) {
        this.prayer = null;
        G.audio?.sample?.('templeGong', 0.9);
      }
    }
    for (let k = this._puffs.length - 1; k >= 0; k--) {
      const P = this._puffs[k];
      P.t += dt;
      P.m.scale.setScalar(1 + P.t * 3);
      P.m.material.opacity = Math.max(0, 0.8 - P.t * 1.6);
      if (P.t > 0.5) { P.m.parent?.remove(P.m); this._puffs.splice(k, 1); }
    }
  }

  _updateMeals(dt, players) {
    const G = this.game;
    for (const [key, M] of this.meals) {
      M.t += dt;
      const diners = [...M.diners].map((i) => players[i]).filter(Boolean);
      if (!diners.length) { this.meals.delete(key); continue; }
      if (M.phase === 'wait' && M.t >= HOLD.mealWait) {
        M.phase = 'pray';
        M.t = 0;
        for (const p of diners) {
          p.homePose = 'bless';
          G.toast('Everybody together… ITADAKIMASU!', p.index);
        }
        G.audio?.play?.('menu');
      } else if (M.phase === 'pray' && M.t >= HOLD.mealPray) {
        M.phase = 'eat';
        M.t = 0;
        for (const p of diners) { p.homePose = 'eat'; this._dropPlate(p.index); }
      } else if (M.phase === 'eat' && M.t >= HOLD.mealEat) {
        const pct = mealPct(diners.length);
        for (const p of diners) {
          this._release(p);
          this.H.boons?.grant(p, 'meal', pct);
          G.toast(`Gochisousama! ${p.name} is full — +${pct}% GREEN health at the start of your next battle${diners.length < 3 ? ' (eat with more friends for more!)' : '!'}`, p.index);
        }
        this.meals.delete(key);
      }
    }
  }
}
