import * as THREE from 'three';
import { mealPct, BOON } from './boons.js';
import { TEA_T, TEA_LEN, TEA_ANIM, TEA_SHEET, teaFrameAt, teaSips } from './teahouse.js';
import { ONSEN } from './homeisle.js';

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

   THE POSES ARE DRAWN (Oct 2026): 'pray' at the shrine, 'bath' - a head and
   a towel on the water - in the onsen, 'futon' asleep under the covers
   (Player.setHomeArt). Each falls back to the pose it replaced when its file
   is missing: the star's reach, the eating crouch, hiding her.

   PLACEHOLDERS, all listed in docs/notes/housing.md:
     - the prayer is one still, not Richard's four-direction sheet;
     - the meal still wears the eating crouch, which is what a meal is;
     - the drum and the cups game are a line and a sound, not games yet.
--------------------------------------------------------------------------- */

/** How long each hold lasts, in seconds. */
export const HOLD = {
  pray: 5,
  soak: 6,
  nap: 4,
  /* Longer than it was (5): a first-person look is a look at something,
     and the first second of it is the camera arriving. */
  look: 9,
  sit: 2.5,
  /** The meal: everybody sitting down, the prayer, the eating. */
  mealSit: 1,
  mealPray: 1.6,
  mealEat: 3,
};

/**
 * THE LOOK OUT OF A WINDOW, FIRST PERSON. Richard, Oct 2026: "let's have the
 * player fade away as the camera gets near to her and let's have the camera
 * take more of a 'first person' view here. The camera is too high and too far
 * away and the player sprite is blocking the view." It was a shot from
 * `back` 4.5 behind her at 2.2 up, aimed 7 past the frame — her sprite filled
 * the middle of the window.
 * Now the lens stands `back` inside the frame at `eye` over the floor — the
 * middle of the opening, which is `WINDOW.sill` 1.0 to 2.6 (homehouse.js) —
 * and looks `ahead` out, tipped down by `pitch` onto her yard. She stands
 * further in than `back`, so she ends up behind the lens, and fades out on
 * the way past (`fadeHer`, player.js).
 */
export const LOOK_SHOT = { ahead: 8, eye: 1.8, back: 0.9, pitch: 0.1 };

/** The window spot's first-person camera: where the lens stands and the
 *  focus that puts it there. Pure, so the checks can ask it. */
export function lookShot(s, out, W = LOOK_SHOT) {
  const wx = s.wx ?? s.x, wz = s.wz ?? s.z;
  const eye = { x: wx - out.x * W.back, y: s.y + W.eye, z: wz - out.z * W.back };
  const c = Math.cos(W.pitch), sn = Math.sin(W.pitch);
  // the rig sits at centre + (sin yaw·cos p, sin p, cos yaw·cos p)·dist, and yaw
  // is the way back IN; so the centre is the eye pushed `ahead` out and down
  const centre = { x: eye.x + out.x * c * W.ahead, y: eye.y - sn * W.ahead, z: eye.z + out.z * c * W.ahead };
  return { eye, centre, dist: W.ahead, pitch: W.pitch, yaw: Math.atan2(-out.x, -out.z) };
}

/** The temple piece: once through, then the second gong (jukebox.js). */
export const PRAYER_TRACK = 'shrinePrayer';
export const PRAYER_LEN = 45;
/** The tea ceremony's piece (jukebox.js): once through, from its first kneel. */
export const TEA_TRACK = 'teaCeremony';
/** How far in front of her knees, toward the tray, her bowl is set down (teahouse metres). */
export const TEA_BOWL_KNEES = 0.5;
const smooth = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
export const TEA_MUSIC_LEN = 30;

/**
 * THE NAP'S FADE, as an opacity over the hold — 0 to black in a second, held,
 * and back in the last second. Pure, so the checks can ask it.
 */
export function napFade(t, dur = HOLD.nap) {
  if (!(t >= 0) || t >= dur) return 0;
  return Math.min(1, t / 1, (dur - t) / 1);
}

/** The way she faces asleep on a futon turned `ry`: toward its pillow, which
 *  the drawn futon has at its own -z. */
export const napFacing = (ry) => ry + Math.PI;

/** Four places at a kotatsu, a plate at each. */
export const TABLE_SEATS = 4;
/** How near the table a kitten has to be to be sat down for the meal. */
export const TABLE_NEAR = 7;

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
    /** Kotatsu key → { s, plates: Mesh[] } — the food SET on each table. */
    this.tables = new Map();
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
      drum: this._drum, rake: this._rake, tea: this._tea,
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
    const h = this.held.get(p?.index);
    this.held.delete(p.index);
    if (p) { p.homePose = null; p.homeLift = 0; }
    // she was lifted onto the futon; she gets up where she lay down from
    if (h?.back && p?.position) { p.position.x = h.back.x; p.position.z = h.back.z; }
  }

  /* -------------------------------- shrine -------------------------------- */

  _pray(p, s) {
    const G = this.game;
    this._hold(p, 'pray', HOLD.pray, { s });
    p.homePose = 'pray';
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
    if (this.teaMusic) return this.game.audio?.fileMissing?.(TEA_TRACK) ? 'frost' : TEA_TRACK;
    if (!this.prayer) return null;
    return this.game.audio?.fileMissing?.(PRAYER_TRACK) ? 'dojo' : PRAYER_TRACK;
  }

  /* ------------------------------ the teahouse ----------------------------- */

  /**
   * KNEEL FOR TEA (teahouse.js has Richard's note). The first kitten to kneel
   * starts the ceremony and its music; for TEA_T.join seconds anybody else
   * may kneel beside her — the kettle is being whisked — and then the bowls
   * go round, one sip each, every kitten's share of the same 16 seconds, and
   * everybody bows. 26 seconds, one kitten or four.
   *
   * SEIZA IS THE PRAYER DRAWING until the bowls go round, and then it is
   * her tea sheet (`teaFrameAt`): she turns to you, takes the bowl up, sips
   * slowly six times, sets it down and prays — and on the bow turns back
   * side-on while her bowl goes back to the tray. Richard: "the player stays
   * in seiza the whole time ... little or no bouncing". The sip used to be
   * the MEAL's pose, which is the bounce he meant. Without the drawing she
   * keeps the prayer and the bowl rises to her instead.
   */
  _tea(p, s) {
    const G = this.game;
    const T = s.tea;
    if (!T) return;
    let C = this.teaParty;
    if (C && C.T !== T) { G.toast('A tea ceremony is already happening in the other teahouse — wait for it to finish.', p.index); return; }
    if (C && C.t >= TEA_T.join) { G.toast('The tea is already being served. Kneel for the next one when this ends!', p.index); return; }
    if (!C) {
      C = this.teaParty = { T, t: 0, seats: [], sipper: -1 };
      this.teaMusic = { t: 0 };
    }
    const taken = new Set(C.seats.map((q) => q.k));
    const k = [0, 1, 2, 3].find((n) => !taken.has(n));
    if (k == null) { G.toast('All four places are taken!', p.index); return; }
    C.seats.push({ i: p.index, k });
    const at = T.seat(k);
    p.position.set(at.x, T.floorY, at.z);
    p.group?.position?.copy?.(p.position);
    p.facing = Math.atan2(T.tray.x - at.x, T.tray.z - at.z);
    this._hold(p, 'tea', Infinity);
    p.homePose = 'pray';
    G.toast(C.seats.length === 1
      ? `${p.name} kneels for tea. Sisters, come and kneel too — the tea is served in ${Math.ceil(TEA_T.join - C.t)} seconds!`
      : `${p.name} kneels beside ${C.seats.length - 1 === 1 ? 'her sister' : 'her sisters'}.`, p.index);
  }

  /** The ceremony's clock: whisk, a sip each, the bow, then everybody up. */
  _updateTea(dt, players) {
    if (this.teaMusic && (this.teaMusic.t += dt) >= TEA_MUSIC_LEN) this.teaMusic = null;
    const C = this.teaParty;
    if (!C) return;
    const G = this.game;
    C.seats = C.seats.filter((q) => this.held.get(q.i)?.act === 'tea' && players[q.i]);
    // the yard rebuilt under them (somebody moved a lantern): the old tea set is gone
    if (!C.seats.length || C.T.group.userData.disposed) { this._endTea(C, players); return; }
    C.t += dt;
    C.T.group.updateWorldMatrix?.(true, false);
    const t0 = TEA_T.whisk, bowAt = t0 + TEA_T.sip * 4;
    const sips = C.sips ??= teaSips();
    /* THE KETTLE IS WHISKED while the others may still kneel: the chasen's
       brisk little strokes, soft, and they stop a beat before the bowls go. */
    if (C.t > 1 && C.t < t0 - 0.6 && (C.whisk = (C.whisk ?? 0) - dt) <= 0) {
      C.whisk = 0.22 + Math.random() * 0.08;
      G.audio?.play?.('teawhisk', 0.5);
    }
    if (C.t >= t0 && !C.served) {
      C.served = true;
      for (const q of C.seats) if (players[q.i]) G.toast('The bowls go round… everybody drinks the matcha, slowly. Mmm!', q.i);
    }
    C.seats.forEach((q, j) => {
      const p = players[q.i];
      const b = C.T.bowls[q.k];
      const drawn = !!p?.teaPose;
      const u = C.t - t0 - j * TEA_ANIM.stagger;
      const r = teaFrameAt(u, sips, C.t >= bowAt ? C.t - bowAt : -1);
      if (p) {
        p.homePose = drawn ? 'tea' : 'pray';
        p.teaFrame = r.frame;
      }
      // her sounds, on the edges of her own beats — four kittens are four sips, not one
      const was = q.beat;
      if (r.beat === 'sip' && r.mouth && !q.mouth) G.audio?.play?.('teasip', 0.55);
      if (r.beat === 'sip' && was === 'pick') G.audio?.play?.('teaclink', 0.4);
      if (r.beat === 'pray' && was === 'down') G.audio?.play?.('teaclink', 0.6);
      q.beat = r.beat;
      q.mouth = !!r.mouth;
      if (!b) return;
      /* THE BOWL. With the drawing: during her turn the tray's bowl slides to
         the floor in front of her knees and is hidden the moment she has one
         in her paws (the drawing's own — the sheet's pick frames hold it at
         exactly that spot); on the bow it is there again and slides home.
         Without it: the bowl rises to her on every sip. */
      const at = C.T.seat(q.k);
      const lp = C.T.group.worldToLocal?.(new THREE.Vector3(at.x, C.T.floorY, at.z));
      if (!lp) return;
      const home = b.userData.home;
      const knees = lp.clone().setY(home.y).addScaledVector(home.clone().sub(lp).setY(0).normalize(), TEA_BOWL_KNEES);
      b.visible = true;
      b.rotation.x = 0;
      if (drawn) {
        if (r.beat === 'wait') b.position.copy(home);
        else if (r.beat === 'turn') b.position.lerpVectors(home, knees, smooth(Math.max(0, u) / TEA_ANIM.turn));
        else if (r.beat === 'turnBack' || r.beat === 'seiza') b.position.lerpVectors(knees, home, smooth(Math.min(1, (C.t - bowAt) / TEA_ANIM.turnBack)));
        else b.visible = false;
      } else {
        const S = TEA_SHEET.seg.sip;
        const lift = r.beat === 'sip' ? (r.frame - S[0]) / (S[1] - 1 - S[0]) : 0;
        b.position.lerpVectors(home, lp.setY(home.y + 1.25).addScaledVector(lp.clone().sub(home).setY(0).normalize(), -0.55), lift);
        b.rotation.x = lift * 0.5;
      }
    });
    if (C.t >= bowAt && !C.bowed) {
      C.bowed = true;
      for (const q of C.seats) {
        const p = players[q.i];
        if (!p) continue;
        G.toast('Everybody bows together… ARIGATOU GOZAIMASU!', p.index);
      }
      // the rin: a small temple bowl-bell, struck once, left to ring out
      G.audio?.play?.('rin', 0.8);
    }
    if (C.t >= TEA_LEN) this._endTea(C, players);
  }

  _endTea(C, players = this.game.players ?? []) {
    for (const q of C.seats) {
      const p = players[q.i];
      if (p && this.held.get(q.i)?.act === 'tea') this._release(p);
    }
    for (const b of C.T.bowls) { b.position.copy(b.userData.home); b.rotation.x = 0; b.visible = true; }
    for (const q of C.seats) { const p = players[q.i]; if (p) p.teaFrame = 0; }
    this.teaParty = null;
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
    p.homePose = 'bath';
    // the drawing's neck at the water line, not under it (`ONSEN`)
    p.homeLift = ONSEN.water - ONSEN.neck;
    this.game.toast(`POOF! ${p.name} is in her bathing suit and sinks into the onsen… ahhh.`, p.index);
    this.game.audio?.play?.('menu');
  }

  /* ---------------------------------- nap --------------------------------- */

  _nap(p, s) {
    /* ONTO THE FUTON, HEAD ON THE PILLOW. Richard, Oct 2026: "When napping on
       the bed, the player sprite model is not facing in the correct
       direction." The drawing was a billboard that never turned, so her head
       was on the left of the screen whichever way the futon lay, and she lay
       wherever she had pressed INTERACT from, up to 2.6 off it. She is put on
       its middle now and faces the pillow, which `drawItem('futon')` draws at
       its own -z: the world heading of that is the futon's turn plus a half
       turn. The billboard mirrors on it (player.js `setHomeArt`). */
    const back = { x: p.position.x, z: p.position.z };
    if (Number.isFinite(s.ry)) {
      p.position.x = s.x;
      p.position.z = s.z;
      p.facing = napFacing(s.ry);
    }
    this._hold(p, 'nap', HOLD.nap, { s, back });
    p.homePose = 'futon';
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
    /* OUTWARD IS THE WALL'S, not "away from the island's middle": with houses
       that stand anywhere and turn, a window on the side of a house near the
       rim pointed the camera along the wall. `face` is the window's own turn
       (its +z into the room), so out is the other way; the old guess stays
       for a spot that has none. */
    let ox, oz;
    if (Number.isFinite(s.face)) { ox = -Math.sin(s.face); oz = -Math.cos(s.face); } else {
      const I = s.isle;
      if (!I) return;
      ox = s.x - I.x; oz = s.z - I.z;
    }
    const L = Math.hypot(ox, oz) || 1;
    const out = { x: ox / L, z: oz / L };
    // she steps up to it, facing out, so the shot is over the room and past her
    p.position.x = s.x;
    p.position.z = s.z;
    p.facing = Math.atan2(out.x, out.z);
    this._hold(p, 'look', HOLD.look, { s, out });
    this.game.toast(`${p.name} looks out of the window…`, p.index);
  }

  /**
   * Is she at a window, looking out? Asked by `Game._groups` for `solo`.
   * Richard, Oct 2026: "A player looking out of a window gets her own
   * split-screen pane if she is sharing one." The shot is first person, so in
   * a shared pane it took her sister's camera through the glass with her.
   */
  lookingOut(p) {
    return this.held.get(p?.index)?.act === 'look';
  }

  /**
   * LOOKING OUT, first person (`LOOK_SHOT`, `lookShot`). `exact`: the lens
   * is where this says, so the split screen's pull-back (`paneWiden`) must
   * not push it back through the room. `fadeHer`: she is between the lens
   * and where it was, so she fades as it closes on her.
   */
  cameraFocus(p) {
    const h = this.held.get(p.index);
    if (h?.act !== 'look') return null;
    const L = lookShot(h.s, h.out);
    (h.centre ??= new THREE.Vector3()).set(L.centre.x, L.centre.y, L.centre.z);
    return { centre: h.centre, aim: true, dist: L.dist, pitch: L.pitch, yaw: L.yaw, exact: true, fadeHer: true };
  }

  /* ---------------------------- kitchen + kotatsu ---------------------------- */

  _kotatsuOf(s) {
    return s.isle?.spots?.find((q) => q.act === 'sit' && q.item === 'kotatsu') ?? null;
  }

  _cook(p, s) {
    const G = this.game;
    /* A PLATE GOES BACK WHERE IT CAME FROM. Richard, Oct 2026: "it is
       possible all 4 spots get filled up, then player is stuck with a plate
       above their head. They should be able to return it to the cooking
       table." So INTERACT at the kitchen with one over her head puts it back
       on the counter — the one way to put a plate down that is not the table. */
    if (this._plates.has(p.index)) {
      this._dropPlate(p.index);
      G.audio?.play?.('land');
      G.toast(`${p.name} puts the plate back in the kitchen. (Cook another any time!)`, p.index);
      return;
    }
    if (!this._kotatsuOf(s)) {
      G.toast('You need a KOTATSU TABLE to eat at — buy one at Roshi\'s furniture shop!', p.index);
      return;
    }
    this._plates.set(p.index, this._plateMesh());
    G.audio?.play?.('menu');
    /* "let's also send a message letting the player know that a cooking
       mini-game will come in the future, like we were doing before". */
    G.toast(`${p.name} cooks onigiri and miso! Take it to the KOTATSU and set the table. (A cooking mini-game is coming in a future update!)`, p.index);
  }

  /**
   * THE KOTATSU, Oct 2026. Richard: "When bringing plate to the table ... the
   * message should say something like 'Set the table with the food' ... and
   * have it that the plate of food appears on the table. Player will have to
   * bring a plate of food for every player that will sit at the table. Then
   * player can sit at the table with everyone to eat. There should be a
   * dialog saying 'Are you sure you want to eat with everyone at the
   * table?' if confirmed, then everyone sitting at or near the table sits
   * down and does the 'itadakimasu' prayer before eating."
   *
   *   with a plate     SET THE TABLE: it goes from over her head onto the
   *                    table, at the next of four places
   *   food on it       EAT TOGETHER: her card asks (NO first), and on a yes
   *                    every kitten round the table sits, ITADAKIMASU, eats
   *   nothing on it    sit and get warm, as before
   *
   * It used to be the plate-carriers sitting one by one and a three-second
   * wait for anybody else; now the food is on the table for everybody to
   * see, and nobody sits until somebody says so.
   */
  _sit(p, s) {
    const G = this.game;
    const key = this.tableKey(s);
    if (this.meals.has(key)) {
      G.toast('They have already started eating — cook another plate and join the next one!', p.index);
      return;
    }
    /* ...AND A FULL TABLE IS NOT A DEAD END FOR HER. Before, a plate over her
       head always meant "set it", and with four set that was refused for ever,
       so the one kitten who could not sit down to eat was the one who had
       cooked. A full table with a plate in her paws asks about the meal like
       an empty-handed press does; her plate is the kitchen's again when the
       meal starts (`startMeal` drops it). */
    if (this._plates.has(p.index) && this.platesOn(key) < TABLE_SEATS) { this._setPlate(p, s); return; }
    if (this._plates.has(p.index)) {
      G.toast(`The table is full — ${TABLE_SEATS} plates already. Take yours back to the KITCHEN, or eat together now!`, p.index);
    }
    if (this.platesOn(key)) {
      if (!G.housingCards?.open?.(p.index, 'meal', { key })) G.toast('Not right now — finish what you are doing first.', p.index);
      return;
    }
    this._hold(p, 'sit', HOLD.sit, { s });
    p.homePose = 'eat';
    G.toast(`${p.name} tucks her feet under the warm kotatsu. Cosy! (Cook food in the KITCHEN and set the table to eat here.)`, p.index);
  }

  tableKey(s) { return `${s.home?.site}:${s.room}:${s.k}`; }

  /** Is she carrying a plate over her head? (the kotatsu's callout) */
  carrying(i) { return this._plates.has(i); }

  platesOn(key) { return this.tables.get(key)?.plates.length ?? 0; }

  /** Her plate, off her head and onto the table at the next place. */
  _setPlate(p, s) {
    const G = this.game;
    const key = this.tableKey(s);
    const T = this.tables.get(key) ?? { s, plates: [] };
    this.tables.set(key, T);
    if (T.plates.length >= TABLE_SEATS) {
      G.toast(`The table is full — ${TABLE_SEATS} plates is a place for everybody. Press INTERACT without a plate to eat!`, p.index);
      return;
    }
    const m = this._plates.get(p.index);
    this._plates.delete(p.index);
    const k = T.plates.length;
    T.plates.push(m);
    const top = this._tableTop(s);
    const a = k * (Math.PI / 2) + Math.PI / 4;
    m.position.set(s.x + Math.sin(a) * 0.7, top, s.z + Math.cos(a) * 0.7);
    m.scale.setScalar(0.8);
    m.visible = true;
    G.audio?.play?.('land');
    const n = T.plates.length;
    G.toast(`${p.name} sets the table — ${n} plate${n > 1 ? 's' : ''} of food on the kotatsu. One for everybody who eats, then INTERACT to eat together!`, p.index);
  }

  /** The kotatsu's top, measured off the drawn table (it is not a model). */
  _tableTop(s) {
    const mesh = s.isle?.itemMeshes?.get(`r:${s.room}:${s.k}`);
    if (mesh) {
      mesh.updateMatrixWorld?.(true);
      const b = new THREE.Box3().setFromObject(mesh);
      if (!b.isEmpty()) return b.max.y + 0.06;
    }
    return s.y + 1.1;
  }

  /**
   * Who would sit down if she said yes: every kitten round the table (on its
   * floor, a few steps from it, not busy with something else), the girl who
   * asked first. Pure enough for the card to ask before anybody moves.
   */
  dinersAt(key, asker) {
    const T = this.tables.get(key);
    if (!T) return [];
    const s = T.s;
    const out = [];
    for (const q of this.game.players ?? []) {
      if (!q || q.mount || q.rideAlong) continue;
      if (this.held.has(q.index)) continue;
      if (Math.hypot(q.position.x - s.x, q.position.z - s.z) > TABLE_NEAR || Math.abs(q.position.y - s.y) > 2.5) continue;
      out.push(q);
    }
    out.sort((a, b) => (a.index === asker ? -1 : b.index === asker ? 1 : a.index - b.index));
    return out.slice(0, TABLE_SEATS);
  }

  /** Why the meal cannot start, or null (the card greys YES with it). */
  mealWhy(key, asker) {
    const n = this.platesOn(key);
    const d = this.dinersAt(key, asker).length;
    if (!n) return 'There is no food on the table yet — cook some in the KITCHEN.';
    if (this.meals.has(key)) return 'They have already started eating!';
    if (d > n) return `There ${d === 1 ? 'is' : 'are'} ${d} of you and ${n} plate${n > 1 ? 's' : ''} — cook ${d - n} more so everybody has one!`;
    return null;
  }

  /** YES on the card: everybody round the table sits, prays and eats. */
  startMeal(key, asker) {
    const G = this.game;
    const why = this.mealWhy(key, asker);
    if (why) { G.toast(why, asker); return false; }
    const T = this.tables.get(key);
    const s = T.s;
    const diners = this.dinersAt(key, asker);
    const M = { s, diners: new Set(), t: 0, phase: 'sit' };
    this.meals.set(key, M);
    diners.forEach((p, k) => {
      M.diners.add(p.index);
      // a place round the table each, facing it — at the plate she will eat
      const a = k * (Math.PI / 2) + Math.PI / 4;
      p.position.x = s.x + Math.sin(a) * 2.2;
      p.position.z = s.z + Math.cos(a) * 2.2;
      p.group?.position?.copy?.(p.position);
      p.facing = Math.atan2(s.x - p.position.x, s.z - p.position.z);
      this._hold(p, 'meal', Infinity, { key });
      p.homePose = 'eat';
      this._dropPlate(p.index);
      this._puff(p.position);
      G.toast(diners.length > 1 ? `Everybody sits down at the kotatsu — ${diners.length} at the table!` : `${p.name} sits down to eat.`, p.index);
    });
    G.audio?.play?.('menu');
    return true;
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

  /** The zen garden's rake: it crosses the bed and leaves it smooth (zengarden.js). */
  _rake(p, s) {
    const Z = s.zen;
    if (!Z) return;
    if (!Z.trodden && !Z.rake) { this.game.toast('The sand is already raked smooth. Go and walk on it!', p.index); return; }
    if (!Z.startRake()) { this.game.toast('Somebody is already raking it.', p.index); return; }
    this.game.audio?.play?.('menu');
    this.game.toast(`${p.name} rakes the sand smooth…`, p.index);
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
    this._pruneTables(players);
    this._updateMeals(dt, players);
    this._updateTea(dt, players);
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

  /**
   * PLATES GO WITH THEIR TABLE. Richard, Oct 2026: "When table is sold, or
   * maybe moved, any plates on the table need to be removed so they are not
   * floating in the air." A table is keyed by its room and its INDEX in the
   * room's item list, and the plates are free meshes in the scene â€” so a sold
   * kotatsu left them hanging where its top had been, and a moved one left
   * them behind it. Every frame each set table is looked for among its isle's
   * live `sit` spots (rebuilt on every edit): found where it was, nothing
   * changes; found at the same place under a NEW index (a lower item was
   * sold and the list closed up), the table is re-keyed rather than cleared;
   * not found, its plates go, a meal at it ends, and whoever was setting it
   * is told. Watching the spots rather than hooking sell and move is what
   * covers the paths nobody listed â€” a room re-typed, a room sold, a home sold.
   */
  _pruneTables(players) {
    const G = this.game;
    for (const [key, T] of [...this.tables]) {
      const s = T.s;
      const spots = s.isle?.spots;
      if (!Array.isArray(spots)) continue;             // nothing to compare against â€” leave it be
      const here = spots.find((q) => q.act === 'sit' && q.room === s.room
        && Math.abs(q.x - s.x) < 0.05 && Math.abs(q.z - s.z) < 0.05);
      // a home sold empties its isle (home null); a test isle has no home at all
      const sameHome = s.isle.home === undefined || s.isle.home?.site === s.home?.site;
      if (here && here.k === s.k && sameHome) continue;
      if (here && sameHome) {
        const s2 = { ...s, k: here.k };
        const k2 = this.tableKey(s2);
        if (!this.tables.has(k2)) {
          this.tables.delete(key);
          this.tables.set(k2, { ...T, s: s2 });
          const M = this.meals.get(key);
          if (M) { this.meals.delete(key); this.meals.set(k2, { ...M, s: s2 }); }
          continue;
        }
      }
      for (const m of T.plates) m.parent?.remove(m);
      this.tables.delete(key);
      const M = this.meals.get(key);
      if (M) {
        for (const i of M.diners) { const p = players[i]; if (p) this._release(p); this.held.delete(i); }
        this.meals.delete(key);
      }
      const near = (players ?? []).filter((p) => p && Math.hypot(p.position.x - s.x, p.position.z - s.z) < TABLE_NEAR * 2);
      for (const p of near) G.toast('The kotatsu moved â€” its plates went back to the kitchen.', p.index);
    }
  }

  _updateMeals(dt, players) {
    const G = this.game;
    for (const [key, M] of this.meals) {
      M.t += dt;
      const diners = [...M.diners].map((i) => players[i]).filter(Boolean);
      if (!diners.length) { this.meals.delete(key); continue; }
      if (M.phase === 'sit' && M.t >= HOLD.mealSit) {
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
        // the plates they ate from are gone; any spare stay set for later
        const T = this.tables.get(key);
        for (const m of T?.plates.splice(0, diners.length) ?? []) m.parent?.remove(m);
        if (T && !T.plates.length) this.tables.delete(key);
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
