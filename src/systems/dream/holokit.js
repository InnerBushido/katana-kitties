import * as THREE from 'three';
import { HOLO } from '../../world/simworld.js';
import { ORB_BY_ID, ORB_IDS, MAX_EQUIPPED, HOLO_MAX_EACH, cleanHoloOrbs } from '../../entities/powerorb.js';
import { HoloPanel } from './holo.js';

/* ---------------------------------------------------------------------------
   HER HOLO KIT — the Kotodama she wears in the simulator, and the ones she
   has earned in it.

   Richard: "when a player enters the dojo, we temporarily 'hijack' the
   Players Profile or we add a 2nd Players Profile in the menu and call it
   '(Holo) Player Profile' ... When a player enters the simulator, they appear
   there with no kotodama orbs or Clan abilities ... The players normal
   kotodama orbs that float around them outside of the simulator will also be
   temporarily removed or hidden while in the simulator and returned when
   they leave ... When they gather kotodama in the simulator, it will
   automatically equip them in the first 8 slots ... unique ones that the
   player doesn't have yet ... if they get a duplicate, it will go to their
   inventory. After a player completes the kotodama orb trial with the 3
   stars, then they gain the ability to get an extra of that same orb ... a
   max of 4 of the same kotodama orbs to each player". And then: "We should
   copy whatever kotodama orbs the player enters the simulation with equipped
   to be the same as what they start with in the simulation". Asked which of
   the two wins: "Copy every entry".

   SO THERE ARE TWO LISTS, AND ONLY ONE OF THEM IS KEPT.
     `p.holoOrbs`   every orb she has EARNED in here — the gallery's first
                    win of each drill, and the extras a 3★ pedestal hands
                    out, at most `HOLO_MAX_EACH` of a kind. Saved in her row
                    (savegame.js `castRow`), cleared on a restart.
     `s.holoWorn`   what she wears THIS VISIT, eight at most. Set on the way
                    in to a copy of what she wears outside; thrown away on
                    the way out.
   Her holo BAG is not stored at all: it is everything she has in here
   (`holoWorn`'s copies of her real orbs, plus everything she has earned)
   minus what she is wearing — `holoBag`. So nothing can be lost between the
   two, and nothing can be duplicated: wearing an orb moves it, and an orb
   only exists in here as many times as it was copied or earned.

   HER REAL ORBS ARE NEVER TOUCHED. `powerOrbs` and `orbBag` — what the save,
   the trade, the dealer and a 盗 steal read — are exactly what they were;
   the sim folds `holoWorn` (and the gallery's loans) into `p.power` and draws
   them round her instead (`DreamDojo._applyKit`), and `_leaveSim` puts the
   real ring back. Nothing is lost (4).

   THE CLAN COMES OFF THE SAME WAY THE TRIAL HALL'S OATH GOES ON — the costume
   `swearFor` already wears: her real clan is kept on `dreamOath.was`, and
   `_leaveSim` puts it back however she leaves. She swears a holo-clan in the
   Trial Hall, and the badge and the holo profile call it "(Holo)".
--------------------------------------------------------------------------- */

export { HOLO_MAX_EACH, cleanHoloOrbs };

const count = (list, id) => (list ?? []).filter((x) => x === id).length;

/** On the way in: wear a copy of what she wears outside, and no clan. */
export function enterHolo(dream, p) {
  const s = dream.st[p.index];
  if (!s) return;
  s.holoWorn = (p.powerOrbs ?? []).slice(0, MAX_EQUIPPED);
  s.holoCopies = [...s.holoWorn];
  p.holoOrbs ??= [];
  if (!p.dreamOath) p.dreamOath = { was: p.clan ?? null };
  p.clan = null;
  p.clanRing?.material.color.set(p.style?.colour ?? 0xffffff);
  dream.game._updateClanBadge?.(p);
}

/** Everything she has in here that she is not wearing. A multiset
 *  difference: what was copied in plus what was earned, minus what is worn. */
export function holoBag(p, s) {
  const pool = [...(s?.holoCopies ?? []), ...(p.holoOrbs ?? [])];
  for (const id of s?.holoWorn ?? []) {
    const k = pool.indexOf(id);
    if (k >= 0) pool.splice(k, 1);
  }
  return pool.sort((a, b) => ORB_IDS.indexOf(a) - ORB_IDS.indexOf(b));
}

/** How many more of `id` the simulator will give her — 0 at the cap. */
export function holoLeft(p, id) {
  return Math.max(0, HOLO_MAX_EACH - count(p.holoOrbs, id));
}

/**
 * She earned one. Returns { ok, worn } or { ok: false, why }.
 *
 * WORN IF IT IS NEW TO HER RING AND THERE IS ROOM — "unique ones that the
 * player doesn't have yet that get equipped ... if they get a duplicate, it
 * will go to their inventory" — and in the bag otherwise, which here means
 * simply not worn (`holoBag` finds it).
 */
export function grantHolo(dream, p, id) {
  const s = dream.st[p.index];
  if (!s || !ORB_BY_ID[id]) return { ok: false, why: 'not in the simulator' };
  if (!holoLeft(p, id)) {
    return { ok: false, why: `you have all ${HOLO_MAX_EACH} ${ORB_BY_ID[id].name} — ${HOLO_MAX_EACH} is the most the simulator gives` };
  }
  p.holoOrbs = [...(p.holoOrbs ?? []), id];
  s.holoWorn ??= [];
  const worn = s.holoWorn.length < MAX_EQUIPPED && !s.holoWorn.includes(id);
  if (worn) s.holoWorn = [...s.holoWorn, id];
  dream._applyKit?.(p, true);
  const name = ORB_BY_ID[id].name;
  dream.game.toast?.(worn
    ? `${p.name} earned a holo ${name} — and is wearing it`
    : `${p.name} earned a holo ${name} — it is in her holo bag`, p.index);
  dream.game.sfx?.('powerorb');
  return { ok: true, worn };
}

/** Put a worn one in the bag. Returns null, or why not. */
export function holoStow(dream, p, k) {
  const s = dream.st[p.index];
  if (!s?.holoWorn?.[k]) return 'That slot is empty';
  s.holoWorn = s.holoWorn.filter((_, j) => j !== k);
  dream._applyKit?.(p, true);
  return null;
}

/** Wear the `j`th one in her bag. Returns null, or why not. */
export function holoWear(dream, p, j) {
  const s = dream.st[p.index];
  const id = holoBag(p, s)[j];
  if (!s || !id) return 'That slot is empty';
  if ((s.holoWorn?.length ?? 0) >= MAX_EQUIPPED) return `Eight is the most — put one in the bag first`;
  s.holoWorn = [...(s.holoWorn ?? []), id];
  dream._applyKit?.(p, true);
  return null;
}

/* ---------------------------- the pedestal's ask ---------------------------- */

/**
 * "when they click on the orb again, before it starts the trial, then they
 * will get a UI option that lets them either start the trial or add an extra
 * kotodama orb to their inventory."
 *
 * A CARD OVER HER OWN HEAD, driven by her own stick — one player drives a
 * menu, and the screen says who (non-negotiable 7): it is hers, in her
 * colour, and nobody else's pad reaches it. She is rooted while it is up
 * (`DreamDojo.padFor`), so the stick that moves the cursor does not also walk
 * her off the pedestal.
 *
 * NOTHING ON IT IS IRREVERSIBLE — a trial can be stopped, an extra orb only
 * adds — so it opens on what she pressed for, START THE TRIAL, and a third
 * row is the way out without either. Each row says what it DOES (6).
 *
 * BESIDE HER, NOT OVER HER HEAD. Over her head it was where every other card
 * in the simulator goes, and measured in a 800x490 pane it spanned y 59-163
 * with the HUD's top band reaching 110: the title and the first row — START
 * THE TRIAL, the one the cursor opens on — were under the clan badge. On a
 * 390px phone that band is the same size in fewer pixels. To her right in
 * whichever pane is drawing it (`faceCamera` runs once per pane camera), at
 * her own height, it is clear of the HUD, of her, and of Lionheart's bubble,
 * which takes the left.
 *
 * UI FALL-THROUGH (docs/notes/gotchas.md): the INTERACT that opened it was
 * spent by the caller, and the STICK has to come back to the middle before
 * it moves anything — a kitten still walking onto the pedestal arrives with
 * it pushed, and that push is not a choice.
 */
export class HoloChoice {
  constructor(dream, p, { title, rows }) {
    this.dream = dream;
    this.p = p;
    this.rows = rows;
    this.title = title;
    this.i = 0;
    this.armed = false;
    this.panel = new HoloPanel({ w: 7.4, h: 3.4, px: 96, edge: p.style?.colour ?? HOLO.cyan });
    this.panel.position.y = this._y();
    p.group.add(this.panel);
    this._paint();
  }

  /** Her stick: one step per push, after it has been let go once. */
  update(pad) {
    const y = Math.abs(pad?.my ?? 0) > 0.55 ? Math.sign(pad.my) : 0;
    if (!this.armed) { if (!y) this.armed = true; this._held = 0; return; }
    if (y && y !== this._held) {
      this.i = (this.i + y + this.rows.length) % this.rows.length;
      this.dream.game.sfx?.('menu');
      this._paint();
    }
    this._held = y;
  }

  /** INTERACT: do the row under the cursor. */
  pick() {
    const r = this.rows[this.i];
    r?.act?.();
  }

  _paint() {
    const key = this.dream.key?.(this.p, 'interact') ?? 'E';
    this.panel.set([
      { text: this.title, size: 1.5, color: this.p.style?.colour ?? HOLO.cyan, glow: true },
      ...this.rows.map((r, k) => ({
        text: `${k === this.i ? '▶ ' : '   '}${r.text}`,
        size: 1.15,
        color: k === this.i ? HOLO.gold : (r.dim ? 0x7f9fa8 : 0xd8fdff),
      })),
      { text: `stick ▲ ▼ to choose · [${key}] to pick`, size: 0.85, color: 0x9fefff },
    ], this.p.style?.colour ?? HOLO.cyan);
  }

  /** Centred a little under her head, so it stands on the floor beside her. */
  _y() { return Math.max(1.8, (this.p.height ?? 2.6) * 0.65); }

  faceCamera(camera) {
    // Half the card's width plus a body's clearance, along this camera's right.
    // 1.3 clipped the orbs she wears, which circle her at about 1.5 (seen in
    // the browser pane); 1.8 clears them.
    _side.set(1, 0, 0).applyQuaternion(camera.quaternion).setY(0);
    if (_side.lengthSq() < 1e-6) _side.set(1, 0, 0);
    _side.normalize().multiplyScalar(3.7 + 1.8);
    if (this.p.group) _side.applyQuaternion(this.p.group.getWorldQuaternion(_pq).invert());
    this.panel.position.set(_side.x, this._y(), _side.z);
    this.panel.faceCamera(camera);
  }

  dispose() { this.panel.removeFromParent(); }
}

const _side = new THREE.Vector3();
const _pq = new THREE.Quaternion();
