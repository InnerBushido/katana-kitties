import * as THREE from 'three';
import { PLAYER_STYLE } from '../../core/palette.js';
import {
  HOME_SITES, SITE_BY_ID, HOUSE_BY_ID, ITEM_BY_ID, PRESET_BY_ID, ROOM_TYPE_BY_ID, HOME_SELL, priceOf, SPEED_STRIP,
  FREE_ANNEX, LINK_BY_ID, homeRooms,
} from './catalog.js';
import { loadStore, saveStore, newHome, homeOf, normalise, newer, exportFile, importFile, emptyStore, homeKey } from './homestore.js';
import { HomeIsle, XRAY_SLOTS, XRAY_INDOOR, BRIDGE_CLIPS } from './homeisle.js';
import { HomeBridge, solveHomeRoads, GATE, HOLO_DECK } from './homebridge.js';
import { Roshi } from './roshi.js';
import { PurchaseScene } from './purchasescene.js';
import { JUKEBOX, ACTIVITY_MUSIC, hasRecording, previewOf } from './jukebox.js';
import { Koi } from './koi.js';
import { Farm } from './farm.js';
import { Kendo } from './kendo.js';
import { autoLayout, defaultWindows, houseWhy, brokenLinks, wallSlots, ITEM_SELL, layDoorPath, layRampPath, doorPathId } from './editor.js';

/** How far toward its bridge a NEW house of this kind stands (see `buy`). */
export const HOME_FORWARD = { castle: 7 };
/** An extra house on an island she already owns costs this much of Roshi's price (`annexPrice`). */
export const ANNEX_OFF = 0.5;
import { linkWhy, linkBlockers, linkPriceK } from './links.js';
import { HousingCards, roomTypeRefund } from './cards.js';
import { BuildMode } from './build.js';
import { HomeBoons } from './boons.js';
import { HomeActivities, TABLE_SEATS } from './activities.js';
import { SlideRides } from './sliderider.js';
import { migrateCastleRooms, migrateMixedRooms } from './migrate.js';
import { HEAD_H, roofY, PORT_H, floorOf } from './homehouse.js';

/** "Hana", "Hana and Mei", "Hana, Mei and Rin". */
export const ownerNames = (H) => {
  const n = H?.owners ?? [];
  return n.length < 2 ? (n[0] ?? 'Somebody') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
};

/** The wall a shut door makes, in world units: across its doorway, from its sill to its lintel. */
export function doorSeg(hs, d) {
  const F = floorOf(hs.house, d.floor);
  const h = d.w / 2 + 0.2;
  const [lx, lz] = d.front ? [0, hs.shell.door.z] : [[d.at, F.hd], [F.hw, d.at], [d.at, -F.hd], [-F.hw, d.at]][d.side];
  const along = !d.front && d.side % 2 ? [[lx, lz - h], [lx, lz + h]] : [[lx - h, lz], [lx + h, lz]];
  const a = hs.local(...along[0]);
  const b = hs.local(...along[1]);
  return { ax: a.x, az: a.z, bx: b.x, bz: b.z, y0: d.y - 0.6, y1: d.y + PORT_H };
}

/**
 * A DOOR THE HOUSE HIDES (`aimView`): within `near` of a kitten in the pane
 * and facing away from its camera, it gets a cut `k` strong — a thinning, not
 * a hole — no wider than the doorway (`scale` of the houses' cutR 1.6 is its
 * half-width) and stopping at its lintel. Richard, Oct 2026: "an x-ray
 * highlight, about 25% strength and no bigger than the door path".
 */
/** The teahouse shot (`teaShotFor`): how far back, and how high over the tatami it aims. Was 10 and 1.0. */
export const TEA_SHOT = { dist: 14, aimY: 1.8 };
export const DOOR_XRAY = { near: 18, k: 0.25, lintel: 0.2 };

/** How high off a tall house's ground floor she may be and still count as "on the ground" behind it (a jump, not a bridge). */
export const BEHIND_HOP = 3.5;

/**
 * KNOCKING (`Housing.knock`). Richard, Oct 2026: "A non-owner gets a 'knock'
 * option in front of a closed door ... After 3 knocks the owner gets a
 * message asking whether to open the door ... The request is limited to once
 * every 30s". `count` knocks inside `window` seconds of each other ask; a
 * NO makes her `wait` before the next three count.
 */
export const KNOCK = { count: 3, window: 6, wait: 30 };

/** Does the segment (ax, az)-(bx, bz) cross the rectangle |x| < hw, |z| < hd? (slab test) */
export function segHitsRect(ax, az, bx, bz, hw, hd) {
  let t0 = 0, t1 = 1;
  for (const [p, d, h] of [[ax, bx - ax, hw], [az, bz - az, hd]]) {
    if (Math.abs(d) < 1e-9) { if (Math.abs(p) > h) return false; continue; }
    let u = (-h - p) / d, v = (h - p) / d;
    if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u); t1 = Math.min(t1, v);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * The bed (`Housing._bed`): `g` is Player's GRAVITY (26), so a launch of
 * sqrt(2 g h) rises h; `over` is how far past the ceiling it aims, so the
 * head really meets it; `through` bounces in a row go on to the next; `clear`
 * is how far over the floor above (or the roof) that one aims; `hop` is the
 * rise where there is no ceiling at all.
 */
export const BED = { g: 26, over: 0.25, through: 6, clear: 1, hop: 1.6, lift: 0.02 };
import { HoloDeck } from './holodeck.js';
import { Angling } from './angling.js';
import { PetPlay } from './petplay.js';

/** Roshi's tour: turn to the next island, then fly there; and the map's
 *  zoom-out. Seconds. */
export const TOUR = { look: 0.8, fly: 2.4, mapIn: 0.8 };
const tourEase = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
function lerpAngle(a, b, u) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * u;
}

/* ---------------------------------------------------------------------------
   CUSTOM HOUSING — the one object the game talks to.

   The game asks it eleven questions and it answers each in one place:

     heightAt / wall    — is there ground here, and may she walk into that
                          (World.homeGround, Player after `_arenaWall`)
     interact / prompt  — what INTERACT means here and what the callout says
     cameraFocus        — Roshi's tour flies her own pane to an island
     aimView            — the cutaway: floors above her and the roof come off,
                          per pane, and the walls take an x-ray bite
     musicTrack         — her bridge's jukebox, over everything but the ending
     sparZone           — the kendo dojo, the one floor outside the ring where
                          a blow lands (non-negotiable 3, relaxed Oct 2026)
     scene              — the purchase cutscene, a full-screen scene
     snapshot / restore — the game save carries the homes too

   NOTHING HERE IS A NEW KIND OF THING. The islands are `Island`s, the bridges
   are Snake Way roads, the cards are the dealer's per-pane cards, the scene
   is the shrine scene's furniture. What is new is that the kittens own them.

   STATE CHANGES ON ACCEPT, NEVER ON A SCENE ENDING (non-negotiable 7). The
   points leave her purse and the home is written down the frame she says YES;
   the cutscene that follows is a picture of something already true, and
   skipping it skips nothing.
--------------------------------------------------------------------------- */

/** Real-time units. */
const DAY = 24 * 3600 * 1000;

/** How long between two "is it locked" toasts to the same kitten. */
const NAG = 2.6;

const styleByName = (n) => PLAYER_STYLE.find((s) => s.name === n) ?? null;

/** Player.js's resting camera yaw (`CAM_YAW`), which a focus yaw is lerped
 *  from — a shot's yaw is wrapped to within half a turn of it so the camera
 *  swings the short way round. */
const CAM_YAW_DEFAULT = -Math.PI * 0.25;

/** The front door's shot: this far back, aimed this far under the name board,
 *  and never steeper than `pitch`. */
export const DOOR_SHOT = { dist: 12, below: 1.0, pitch: 0.16, widest: 1.8, clear: 0.15 };

/** How much bigger the x-ray hole is for a kitten on a floor below the one her
 *  pane shows (`aimView`). Richard asked for "2-3x"; the middle of it. */
export const LOWER_XRAY = 2.5;
/**
 * ...and THROUGH THE FLOOR ABOVE TOO, by how much she is moving. Richard, Oct
 * 2026: "the player on 1st floor's xray shader is not affecting the 2nd
 * floor, it should affect all the floors, but let's make it that their xray
 * shader becomes smaller over time on the 2nd floor when the player stops
 * moving around and gets bigger twice as fast when they move around." `p._xrayUp`
 * runs 0..1: down over `t` seconds while she is still, up in half that while
 * her feet move faster than `moving`. The upstairs hole is LOWER_XRAY times it.
 */
/** A bridge is cut this far above the floor she is on (`clipBridges`). The storey is FLOOR_H (4.6) to the next deck; 3.9, under a bridge's beams, left a third-floor bridge
 *  0.26 into the 2nd-floor room where it slopes down through that floor's wall (world-check measures it). Nothing on a deck at her own floor reaches 3.2. */
export const BRIDGE_CLIP_UNDER = 3.2;
/** The islands' rise in the ending (`rise`): over this part of the road clock (the gates are its first 0.35, snakeway.js), from this far under. */
export const RISE = { from: 0.4, to: 0.95, depth: 70 };
export const XRAY_UP = { t: 3, moving: 0.6 };

/**
 * HOW STEEP THE DOOR SHOT MAY LOOK DOWN, for house shell `S`: its 0.16, or
 * lower, until the line from the lens to the TOP of the name board passes
 * under the ground floor's eave. Richard, Oct 2026: "When the castle camera
 * view zooms in on the entrance, the names of the players above the door are
 * being obstructed by the 2nd floors roof, should fix that by either lowering
 * the camera angle or something." Measured: the castle's eave band hangs 3.3
 * in front of the board with its trim at 6.41, and from 0.16 the line to the
 * board's top crossed that plane at 6.84 — the names' top half was behind
 * the tiles. The dojo house had the same fault and nobody had said so.
 *
 * SOLVED AT TWO DISTANCES, 12 and 12 x `widest`, because a narrow pane pulls
 * the lens back (`paneWiden`) along the same pitch, and the eave is BELOW the
 * board's top: further back has to be lower, not the same height. A house
 * with no eave band (the one-floor houses) keeps 0.16.
 */
export function doorPitch(S, shot = DOOR_SHOT) {
  const E = S?.eave;
  if (!E || !S.sign) return shot.pitch;
  const top = S.sign.y + S.sign.h / 2 + 0.05;
  const centreY = S.sign.y - shot.below;
  const centreZ = S.door.z + 2.2;
  const slope = (E.y - shot.clear - top) / (E.z - S.sign.z);
  let p = shot.pitch;
  for (const dist of [shot.dist, shot.dist * shot.widest]) {
    // the steepest pitch whose lens is under the line from the board's top over the eave
    for (let k = 0; k < 40; k++) {
      const D = centreZ + dist * Math.cos(p) - S.sign.z;
      if (centreY + dist * Math.sin(p) <= top + slope * D) break;
      p -= 0.01;
    }
  }
  return p;
}

export class Housing {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    /* EMPTY AT BOOT. Homes belong to one saved game (homestore.js), and a
       boot is a new game until a save is loaded — `restore` fills it then. */
    this.store = emptyStore();
    this.isles = [];
    /** Per isle index: the solved bridge, or null until solved/when unsolvable. */
    this.bridges = [];
    this.roadsReady = false;
    this._solve = null;
    this._nag = new Map();
    /** "site:hk" → the names let in by an owner this game (`answerKnock`). */
    this.guests = new Map();
    /** "visitor:site:hk" → { n, at, until, asking } (`knock`). */
    this.knocks = new Map();
    this.time = 0;
    /** Which site's jukebox is playing, and since when (the most recent
     *  kitten onto a bridge picks — see `_trackMusic`). */
    this.musicSite = null;
    this._onBridge = new Map();
    this.scene = null;
    /** Seats browsing Roshi's tour: index → { site, house } for the camera. */
    this.browsing = new Map();
    /** ...and the pose each tour has its pane's camera in (`tourLens`). */
    this.lens = new Map();
    /** Seats watching a sister's tour in her pane: watcher → owner. */
    this.watchers = new Map();
    /** Seats currently looking at a PREVIEW (the island recoloured to her). */
    this.preview = null;
    this.koi = new Koi(this);
    this.farm = new Farm(this);
    this.kendo = new Kendo(this);
    /** Build mode's ghosts, camera and corner map (`build.js`). Not `build`:
     *  that is the method that puts the islands in the sky. */
    this.builder = new BuildMode(this);
    /** What home is worth in the next battle, and the things that earn it. */
    this.boons = new HomeBoons(this);
    this.activities = new HomeActivities(this);
    /** The treehouse slide's question at the top, and the ride it starts (sliderider.js). */
    this.slides = new SlideRides(this);
    /** The holodeck's racks and her tube (`holodeck.js`). */
    this.holo = new HoloDeck(this);
    /** The rod, the lure and the wild fish at the koi pond (`angling.js`). */
    this.angling = new Angling(this);
    /** Walks, fetch, catch, hop-along and the messes in the pen (`petplay.js`). */
    this.pets = new PetPlay(this);
    this.built = false;
  }

  /* ------------------------------- setup -------------------------------- */

  build() {
    const scene = this.game.scene;
    this.isles = HOME_SITES.map((s) => new HomeIsle(s, this.world));
    for (const I of this.isles) {
      I.build(scene);
      I.cupsFor = (H) => this.cupsOf(H);
      I.opensFor = (p, hs, d) => this.opensFor(I, p, hs, d);
    }
    this.bridges = this.isles.map(() => null);
    /* THE TWO HOOKS. `homeGround` is read at the bottom of `World.heightAt`;
       `homeWall` is called by `Player` right after the arena's wall. */
    this.world.homeGround = this;
    this.world.homeWall = (p, wx, wz, hud) => this.wall(p, wx, wz, hud);
    this.roshi = new Roshi(this.game);
    this.roshi.spawn(scene);
    this.purchase = new PurchaseScene(this);
    this.game.housingCards = new HousingCards(this.game, this);
    this._applyStore();
    this.built = true;
    this._showIsles();
  }

  /**
   * HOW FAR OUT OF THE CLOUDS THE ISLANDS ARE, 0..1: the ending's road clock
   * (`World.setBridges`), and 1 for as long as the shop is open. Richard, Oct
   * 2026: "The player islands are appearing during the intro cutscene ...
   * They shouldn't spawn until after the ending cutscene. Ideally they spawn
   * during the ending cutscene, when the islands visually come up through the
   * clouds." The hiding was in `update`, which does not run while a scene
   * does — so from boot through the whole intro they stood in the sky as
   * built. Now they are hidden on the frame they are built, and they come up
   * through the road phase, after the gates, with the far islands (`RISE`).
   */
  rise(p) {
    this.riseP = p;
    if (this.built) this._showIsles();
  }

  _showIsles() {
    const up = this.isUp();
    const q = up ? 1 : Math.max(0, Math.min(1, ((this.riseP ?? 0) - RISE.from) / (RISE.to - RISE.from)));
    const e = 1 - (1 - q) ** 3;
    for (const I of this.isles) {
      I.group.visible = q > 0;
      I.group.position.y = -(1 - e) * RISE.depth;
    }
    for (const B of this.bridges) if (B && !up) B.group.visible = false;
    return up;
  }

  /** Re-draw every isle from the store. */
  _applyStore() {
    for (const [k, I] of this.isles.entries()) {
      const H = this.store.homes[I.site.id] ?? null;
      // a castle saved with four rooms gets its two floors (migrate.js), once
      if (H && migrateCastleRooms(H, this.store.bank, (t) => this.roomPrice(t))) this.save();
      // ...and its ground floor's dojo or holodeck into a feature of it, with room for both (migrate.js)
      if (H && migrateMixedRooms(H, (t) => this.roomPrice(t))) this.save();
      // a home bought before houses had windows gets them, once (`defaultWindows`)
      if (H && !H.winV) { defaultWindows(H); H.winV = 1; }
      // ...and the castle's, whose rooms sit in from its walls, on the sides that only now count (editor.js `wallSlots`)
      if (H && H.winV < 2) { defaultWindows(H, null, true); H.winV = 2; }
      /* ...and a walk laid when it stopped at the foot of the ramp goes on up
         it to the door (editor.js `rampWalk`), once — only if she kept the
         walk she was given, and round anything she has put on the ramp since */
      if (H && !H.rampV) {
        if ((H.outdoor ?? []).some((q) => q.free && q.id === doorPathId(H))) layRampPath(H, this.envOf(I));
        H.rampV = 1;
        this.save();
      }
      I.setHome(H, H ? this.coloursOf(H) : null);
      const B = this.bridges[k];
      if (B) this._dressBridge(k);
    }
    this.koi.sync();
    this.angling.sync();
    this.farm.sync();
    this.pets.sync();
  }

  /** The owners' colours, in owner order. */
  coloursOf(home) {
    return home.owners.map((n) => styleByName(n)?.colour ?? 0xffffff);
  }

  /** The home row this kitten owns (or co-owns), or null. */
  homeOf(p) {
    const n = p?.style?.name;
    return n ? homeOf(this.store, n) : null;
  }

  isleOf(siteId) {
    return this.isles.find((I) => I.site.id === siteId) ?? null;
  }

  /** May this kitten be inside this home right now? */
  allowed(p, home) {
    if (!home) return true;
    const n = p?.style?.name;
    if (home.owners.includes(n)) return true;
    /* THE CASTLE'S RULE, AND THE ONE-OWNER CASE OF IT: each owner says
       whether non-owners may come in. The island and the front door are open
       if ANY owner has opened them — a sister invited by one co-owner is
       invited — and a claimed room inside is its claimer's alone (`_roomWall`). */
    return home.owners.some((o) => home.open?.[o]);
  }

  locked(home) {
    return !!home && !home.owners.some((o) => home.open?.[o]);
  }

  /**
   * DOES DOOR `d` OPEN FOR HER? Richard, Oct 2026: "a door must not
   * auto-open for a non-owner ... If the owner left the door open, anyone
   * may enter. A player inside can always leave, with the doors auto-opening,
   * and can open doors from inside. The same rules apply to bridge doors."
   * So: a door left open (`pinned`), an owner, a guest she let in
   * (`letIn`, for this house and this game), or somebody already INSIDE it.
   */
  opensFor(I, p, hs, d) {
    const H = I.home;
    if (!H || d.pinned) return true;
    const n = p?.style?.name;
    if (H.owners.includes(n)) return true;
    if (this.guests.get(`${H.site}:${hs.hk}`)?.has(n)) return true;
    return I.houseAt(p.position.x, p.position.y, p.position.z)?.hs === hs;
  }

  /**
   * A KNOCK on door `d` of house `hs`. The third inside `KNOCK.window` asks
   * an owner who is playing and has no card up, on a card of her own
   * (`_v_knock`, NO first); everything else says what is happening — nobody
   * home, she is busy, she is still deciding, how long to wait.
   */
  knock(p, I, hs) {
    const H = I.home;
    const G = this.game;
    G.audio?.play?.('knock');
    const key = `${p.index}:${H.site}:${hs.hk}`;
    const K = this.knocks.get(key) ?? { n: 0, at: -99, until: -99, asking: false };
    this.knocks.set(key, K);
    if (K.asking) { G.toast(`Knock knock! ${ownerNames(H)} is deciding…`, p.index); return; }
    if (this.time < K.until) { G.toast(`Wait ${Math.ceil(K.until - this.time)} more seconds before knocking again.`, p.index); return; }
    if (this.time - K.at > KNOCK.window) K.n = 0;
    K.n++;
    K.at = this.time;
    if (K.n < KNOCK.count) { G.toast(`Knock${' knock'.repeat(K.n - 1)}…`, p.index); return; }
    K.n = 0;
    const home = (G.players ?? []).filter((q) => q && H.owners.includes(q.style?.name));
    if (!home.length) { G.toast(`Nobody is home — ${ownerNames(H)} is not playing right now.`, p.index); return; }
    const free = home.find((q) => !G.inspector?.cards?.[q.index]?.state);
    if (!free) { G.toast(`${ownerNames(H)} is busy — knock again in a moment.`, p.index); return; }
    if (!G.housingCards?.open(free.index, 'knock', { site: H.site, hk: hs.hk, visitor: p.index, key })) {
      G.toast(`${ownerNames(H)} is busy — knock again in a moment.`, p.index);
      return;
    }
    K.asking = true;
    G.toast(`${free.name} heard you knocking!`, p.index);
    G.toast(`${p.name} is knocking at your door — look at your card!`, free.index);
  }

  /** The owner's answer to a knock (cards.js `_v_knock`); closing the card unanswered is a NO. */
  answerKnock(owner, A, yes) {
    const K = this.knocks.get(A.key);
    if (K) K.asking = false;
    const p = this.game.players?.[A.visitor];
    if (!p) return;
    const H = this.store.homes[A.site];
    if (yes && H) {
      const g = `${A.site}:${A.hk}`;
      if (!this.guests.has(g)) this.guests.set(g, new Set());
      this.guests.get(g).add(p.style.name);
      this.game.toast(`${owner.name} let you in — come in!`, p.index);
      this.game.audio?.play?.('doors');
    } else {
      if (K) K.until = this.time + KNOCK.wait;
      this.game.toast(`${owner.name} says not right now — try again in ${KNOCK.wait} seconds.`, p.index);
    }
  }

  /** The price of `mult` orbs, today. */
  price(mult) {
    return priceOf(mult, this.game.kotodama?.price || 650);
  }

  /** This game's row in the browser (homestore.js `homeKey`). */
  _key() { return homeKey(this.game.sessionId); }

  save() {
    saveStore(this.store, globalThis.localStorage, this._key());
    this.game.savegame?.touch?.();
  }

  /**
   * A NEW GAME. `Game.restart` calls this after minting the new session: the
   * homes, the boons, the records and the bank all belonged to the game that
   * was just left, and its own row and its saves still have them. Everything
   * that was being done at home stops, and the islands go back into the
   * clouds until the ending puts them up again.
   */
  reset() {
    this.store = emptyStore();
    this.debugOpen = false;
    this.stopPreview?.();
    this.browsing.clear();
    this.lens.clear();
    this.watchers.clear();
    this.musicSite = null;
    this._onBridge.clear();
    for (const p of this.game.players ?? []) {
      this.holo.drop(p.index);
      this.angling.drop(p.index);
      this.slides.drop(p.index);
      this.pets.drop(p.index);
      p.homeBoon = null;
    }
    if (this.built) this._applyStore();
    for (let k = 0; k < this.bridges.length; k++) this._dressBridge(k);
  }

  /** Are the islands up? Only after the ending (or the debug row), and the
   *  same answer as the shop's: before that they are not in the sky at all. */
  isUp() { return this.shopOpen(); }

  /* ---------------------------- the trophies ---------------------------- */

  /**
   * AN ARENA BATTLE WON puts a cup on her trophy shelf. Richard: "trophies
   * that players win at the arena". Counted by NAME in the home store, not
   * the game save, because a shelf outlives an afternoon the way the house
   * does — and counted whether or not she owns a house yet, so the shelf she
   * buys later is already full. Tournament calls this once per match won.
   */
  battleWon(names) {
    const C = (this.store.records.cups ??= {});
    for (const n of names) if (n) C[n] = (C[n] ?? 0) + 1;
    this.save();
    for (const I of this.isles) if (I.home?.owners.some((o) => names.includes(o))) I.rebuildItems();
    // A rebuild clears the island's item group, and the koi and the wild fish live in it.
    this.koi.sync();
    this.angling.sync();
    this.farm.sync();
    this.pets.sync();
  }

  /** Cups on a home's shelf: every owner's wins together. */
  cupsOf(H) {
    const C = this.store.records?.cups ?? {};
    return (H?.owners ?? []).reduce((a, n) => a + (C[n] ?? 0), 0);
  }

  /* ---------------------------- the bridges ---------------------------- */

  /** Do we need the roads wound? When anybody owns a home, or Roshi is open. */
  _wantRoads() {
    return Object.keys(this.store.homes).length > 0 || this.browsing.size > 0 || this._roadsAsked;
  }

  _pumpRoads() {
    if (this.roadsReady || !this._wantRoads()) return;
    if (!this.world.snakeWay) {
      /* Snake Way's roads first: ours go round them. This SOLVES them and
         builds their (hidden) meshes, which the ending would otherwise do;
         nothing is opened or shown. */
      this.world.prepareSnakeWay(2);
      return;
    }
    this._solve ??= solveHomeRoads(this.world, this.isles);
    const t0 = performance.now();
    while (performance.now() - t0 < 3) {
      const r = this._solve.next();
      if (r.done) {
        this.roadsReady = true;
        this.wound = r.value;
        r.value.forEach((w, k) => {
          if (!w) {
            console.warn(`[housing] no road could be wound to ${this.isles[k].site.id}`);
            return;
          }
          if (w.faults?.length) console.warn(`[housing] road to ${this.isles[k].site.id} has faults`, w.faults);
          this.bridges[k] = new HomeBridge(w, this.isles[k], this.world, k);
          /* The strip: 2x between `from` and `to` of the road, either way. */
          const B = this.bridges[k];
          B.road.boost = (x, z, y) => {
            const a = B.along(x, z, y);
            return a != null && a > SPEED_STRIP.from && a < SPEED_STRIP.to ? SPEED_STRIP.mult : 1;
          };
          this._dressBridge(k);
        });
        return;
      }
    }
  }

  /** Synchronous solve — headless checks and a debug key. */
  solveNow() {
    this._roadsAsked = true;
    while (!this.world.prepareSnakeWay(1000));
    while (!this.roadsReady) this._pumpRoads();
  }

  /** Build/show/colour bridge k to match its home. */
  _dressBridge(k) {
    const B = this.bridges[k];
    if (!B) return;
    const H = this.store.homes[this.isles[k].site.id];
    if (!H) { B.group.visible = false; B.solid = false; return; }
    B.build(this.game.scene);
    // a statue for EVERY owner, in her own colour (homebridge.js STATUE_SLOTS)
    B.setOwners(H.owners.map((n) => {
      const st = styleByName(n);
      return { name: n, colour: st?.colour ?? 0xf4c542, sheet: st?.sheet };
    }));
    B.setLocked(this.locked(H), true);  // a load, not a press: no swing
    if (!this.purchase?.active || this.purchase.k !== k) {
      B.group.visible = true;
      B.solid = true;
      B.setGrow(1);
      B.gateMat.reveal = 1;
    }
  }

  /* ------------------------------ ground ------------------------------- */

  /** The window card's two answers (cards.js `_v_window`). `open`: true to
   *  open, false to shut; `look`: open it and look out (activities `_look`). */
  windowDo(p, s, { open = null, look = false } = {}) {
    const q = s?.home?.rooms?.[s.room]?.wall?.[s.wk];
    if (!q) return false;
    const want = look ? true : open;
    if (want === true && !q.open) { q.open = true; this.save(); }
    if (want === false && q.open) { delete q.open; this.save(); }
    if (look) return this.activities.start(p, { ...s, act: 'look' });
    return true;
  }

  /** `World.heightAt`'s last loop. `who`, when a kitten asks for her own
   *  feet, is what lets a locked bridge be a hologram to her (`ghostFor`). */
  heightAt(x, z, fromY = Infinity, who = null) {
    if (!this.isUp()) return null;
    let best = null;
    for (const I of this.isles) {
      const h = I.heightAt(x, z, fromY);
      if (h && (!best || h.y > best.y)) best = h;
    }
    for (const [k, B] of this.bridges.entries()) {
      if (!B?.solid) continue;
      // the ramp off each end (`buildLandingApron`), solid to everybody
      for (const a of B.aprons ?? []) {
        if (x < a.x0 || x > a.x1 || z < a.z0 || z > a.z1) continue;
        const y = a.yAt(x, z, fromY);
        if (y == null || fromY + (a.step ?? 0.6) < y) continue;
        if (!best || y > best.y) best = { y, platform: a, island: null };
      }
      const p = B.platform;
      if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
      if (who && this.ghostFor(who, k)) continue;
      const y = p.yAt(x, z, fromY);
      if (y == null || fromY + (p.step ?? 0.6) < y) continue;
      if (!best || y > best.y) best = { y, platform: p, island: null };
    }
    return best;
  }

  /**
   * IS BRIDGE k A HOLOGRAM TO HER? Richard, Oct 2026: "if a player that is
   * not an owner tries to jump on the bridge while 'the gates are closed'
   * then they will pass-through it as if it doesn't exist". Yes when the
   * island is locked, she is not let in, and she did not get onto the deck
   * the honest way: `footing` is what she last stood on (player.js), so a
   * visitor who was ON the bridge when its owner shut the gates keeps her
   * feet and can walk off it, and one who jumps or glides onto it from
   * anywhere else — round the gate, off a roof — goes straight through.
   */
  ghostFor(p, k) {
    const B = this.bridges[k];
    const H = this.isles[k]?.home;
    if (!B || !H || !this.locked(H) || this.allowed(p, H)) return false;
    return p.footing !== B.platform;
  }

  /* ------------------------------- walls -------------------------------- */

  /**
   * Everything solid that housing owns, for one kitten, after she has moved.
   * Doors and the bubble are solid only to somebody not allowed through.
   */
  wall(p, wasX, wasZ, hud) {
    if (!this.built || !this.isUp()) return;
    const pos = p.position;
    const r = p.radius ?? 0.6;
    for (const [k, I] of this.isles.entries()) {
      const H = I.home;
      // The bubble — far out, cheap test first.
      const dx = pos.x - I.x;
      const dz = pos.z - I.z;
      const d2 = dx * dx + dz * dz;
      const R = I.bubbleRadius();
      if (d2 > (R + 30) ** 2) {
        const B = this.bridges[k];
        this._bridgeWalls(p, B, H, r);
        continue;
      }
      if (H && !this.allowed(p, H) && pos.y > I.groundY - 60 && pos.y < I.groundY + R) {
        const d = Math.sqrt(d2) || 1;
        if (d < R) {
          pos.x = I.x + (dx / d) * (R + 0.05);
          pos.z = I.z + (dz / d) * (R + 0.05);
          const into = -(p.velocity.x * dx + p.velocity.z * dz) / d;
          if (into < 0) { p.velocity.x -= (dx / d) * into * 1.6; p.velocity.z -= (dz / d) * into * 1.6; }
          I.bump(pos.x, pos.y + 1, pos.z);
          this._refuse(p, H);
          continue;
        }
      }
      // The bridge's two ends: the hologram, and the statues and things there.
      this._bridgeWalls(p, this.bridges[k], H, r);
      if (!H || !I.shell) continue;
      // houses stand anywhere on the island now, so "near a house" is "on it"
      if (d2 > (I.radius + 4) ** 2) {
        this._obstacles(p, I, r);
        continue;
      }
      // a kitten lying on a futon or sat at the table is IN the furniture's rectangle, on purpose
      const held = this.activities?.holds?.(p.index);
      /* ON A BRIDGE, THE HOUSES' WALLS ARE BELOW HER. Richard, Oct 2026: "The
         wall collider from the floor below is still interfering with the
         bridge built above ... (player has to jump over it to keep crossing
         the bridge)". The castle steps in a floor at a time, so a bridge out
         of its third floor slopes down over the second floor's roof band, which
         is still INSIDE the second floor's footprint: her feet dipped under
         that floor's lid, the ceiling clamp below took her for somebody
         indoors and pulled her head under it — into the room, where its walls
         and a stair rail held her. Measured in world-check: stuck 4.4 of 23.3
         down, at 9.06 with the deck at 11.33. So on a bridge's deck she is
         under no house's ceiling, and only the bridge's own rails (`link`)
         hold her: its doorways are cut, and any other house wall along it is
         one she is walking over. */
      const onLink = I.linkMeshes?.size ? I.heightAt(pos.x, pos.z, pos.y + 0.1)?.deck?.link != null : false;
      for (const w of I.walls) {
        if (pos.y + 1.5 < w.y0 || pos.y > w.y1) continue;
        if (held && w.furn) continue;
        if (onLink && w.hk != null && w.link == null) continue;
        this._segPush(p, w, r);
      }
      // every house's front door, for somebody the lock keeps out
      if (!this.allowed(p, H)) {
        for (const hs of I.houses) {
          const D = hs.shell.door;
          const a = hs.local(-D.w / 2, D.z);
          const b = hs.local(D.w / 2, D.z);
          const seg = { ax: a.x, az: a.z, bx: b.x, bz: b.z, y0: hs.gy, y1: hs.gy + 5 };
          if (this._segPush(p, seg, r)) this._refuse(p, H);
        }
      } else {
        /* ...and every SHUT door to a visitor the island lets in: it is a
           door, and it opens when she is let in (`opensFor`). SHUT is the
           panels: a door her sister has just slid open for herself is an open
           door, and a wall standing in an open doorway would be the one thing
           worse than her slipping in behind. */
        for (const hs of I.houses) {
          for (const d of hs.doors) {
            if (d.k > 0.5 || this.opensFor(I, p, hs, d)) continue;
            const seg = doorSeg(hs, d);
            if (pos.y + 1.5 < seg.y0 || pos.y > seg.y1) continue;
            if (this._segPush(p, seg, r)) this._nagOnce(p, `This is ${ownerNames(H)}'s house — KNOCK, and wait to be let in.`);
          }
        }
      }
      this._roomWall(p, I, H);
      this._obstacles(p, I, r);
      this._slide(p, I);
      this._bed(p, I, hud);
      /* ...and her head against the ceiling (HomeIsle `ceilingAt`) — except
         on the seventh bounce off a bed, which goes THROUGH it */
      const c = onLink ? null : I.ceilingAt(pos.x, pos.y, pos.z);
      if (p._bed?.through && p.velocity.y <= 0) p._bed.through = false;
      if (c != null && pos.y + HEAD_H > c && !p._bed?.through) {
        pos.y = c - HEAD_H;
        if (p.velocity.y > 0) {
          p.velocity.y = 0;
          hud?.sfx?.('bonk', 0.7);
        }
      }
    }
  }

  /**
   * A BRIDGE'S ENDS. To a visitor while it is locked, the hologram — across
   * each doorway and along the deck's edges round it — unless her feet are
   * already on the deck (`ghostFor`'s rule), when it lets her walk off. And
   * to EVERYBODY, the things that stand there: Richard, "The players statues
   * and entrance decorations and boom box need to have colliders"
   * (`HomeBridge.solids`: the statues, the boombox, the lanterns, the banner
   * poles and the torii's posts).
   */
  _bridgeWalls(p, B, H, r) {
    if (!B?.solid || !H) return;
    const pos = p.position;
    if (!this.allowed(p, H) && p.footing !== B.platform) {
      for (const seg of B.barrierSegments()) this._doorPush(p, seg, r, H);
    }
    for (const o of B.solids ?? []) {
      if (pos.y + 1.5 < o.y0 || pos.y > o.y1) continue;
      const dx = pos.x - o.x;
      const dz = pos.z - o.z;
      const m = o.r + r;
      if (dx * dx + dz * dz >= m * m) continue;
      const d = Math.hypot(dx, dz);
      if (d < 1e-6) continue;
      pos.x = o.x + (dx / d) * m;
      pos.z = o.z + (dz / d) * m;
    }
  }

  /**
   * A BED BOUNCES. Richard, Oct 2026: "Landing on the bed plays a bouncing
   * sound and bounces her up and down quickly; she hits her head on the
   * ceiling and falls back down. After more than 6 bounces she goes through
   * the ceiling to the floor above, or through the roof and lands on top of
   * it." A kitten standing on a `bed` deck (`_furnWalls`) is launched as hard
   * as it takes to put her head on the ceiling a hair early — the bonk is the
   * ceiling clamp's own — and the seventh launch in a row is aimed a metre
   * over the next floor up (or the roof over her) with the clamp switched off
   * until she starts to fall. Landing on anything that is not a bed starts
   * the count again. Nobody on an animal or held by an activity (a nap lies
   * ON the futon, and is not a bounce).
   */
  _bed(p, I, hud) {
    if (!p.onGround || p.mount || p.pandaMount || p.rideAlong || p.ko) return;
    const pos = p.position;
    const h = I.heightAt(pos.x, pos.z, pos.y + 0.05);
    const B = (p._bed ??= { n: 0, through: false });
    if (!h?.deck?.bed || Math.abs(pos.y - h.y) > 0.05 || this.activities?.holds?.(p.index)) {
      B.n = 0;
      return;
    }
    B.n++;
    let want = BED.hop;
    const c = I.ceilingAt(pos.x, pos.y, pos.z);
    if (c != null) want = c - HEAD_H - pos.y + BED.over;
    if (B.n > BED.through) {
      const at = I.houseAt(pos.x, pos.y, pos.z);
      const S = at?.hs.shell;
      if (S) {
        const L = at.hs.toLocal(pos.x, pos.z);
        const roof = S.eaves?.find((E) => E.roof);
        const up = at.f + 1 < S.floorY.length ? S.floorY[at.f + 1] : roofY(roof, L.x, L.z);
        if (up != null) {
          want = at.hs.gy + up + BED.clear - pos.y;
          B.through = true;
          B.n = 0;
        }
      }
    }
    p.velocity.y = Math.sqrt(2 * BED.g * Math.max(0.4, want));
    /* ...and OFF it. This runs after this frame's gravity step and before
       Player's ground test, which finds her a hair under the deck and lands
       her again — velocity zeroed, the bounce gone before it began. */
    pos.y = h.y + BED.lift;
    p.onGround = false;
    hud?.sfx?.('boing', 0.8);
  }

  /**
   * THE TREEHOUSE SLIDE: while her feet are on a `slide` deck, which way is
   * downhill, as `p.slide` ({x, z}, world, unit). Player rides it (see
   * `SLIDE_RIDE`). A slide deck's own +z is downhill (treehouse.js `chord`),
   * so the direction is the deck's frame turned onto the island. Nobody on an
   * animal: a panda does not fit in the chute.
   */
  _slide(p, I) {
    if (p.mount || p.pandaMount || p.rideAlong || p.ko) return;
    const pos = p.position;
    const h = I.heightAt(pos.x, pos.z, pos.y + 0.2);
    const d = h?.deck;
    if (!d?.slide || !d.frame || pos.y - h.y > 0.45) return;
    const o = I.local(0, 0);
    const e = I.local(Math.sin(d.frame.a), Math.cos(d.frame.a));
    const L = Math.hypot(e.x - o.x, e.z - o.z) || 1;
    p.slide = { x: (e.x - o.x) / L, z: (e.z - o.z) / L };
  }

  _obstacles(p, I, r) {
    for (const o of I.obstacles) {
      /* Most are posts from the ground up and have no range; one with `y0`
         or `y1` is skipped by a kitten wholly above or below it, the way a
         wall is — the cabin tree is a trunk under the floor and a mast above. */
      if (o.y0 != null && p.position.y + 1.5 < o.y0) continue;
      if (o.y1 != null && p.position.y > o.y1) continue;
      const dx = p.position.x - o.x;
      const dz = p.position.z - o.z;
      const d = Math.hypot(dx, dz);
      const m = o.r + r;
      if (d < m && d > 1e-6) {
        p.position.x = o.x + (dx / d) * m;
        p.position.z = o.z + (dz / d) * m;
      }
    }
  }

  /** Circle against a wall segment. True if it pushed. */
  _segPush(p, w, r) {
    const pos = p.position;
    const ex = w.bx - w.ax;
    const ez = w.bz - w.az;
    const L2 = ex * ex + ez * ez || 1;
    let t = ((pos.x - w.ax) * ex + (pos.z - w.az) * ez) / L2;
    t = Math.max(0, Math.min(1, t));
    const qx = w.ax + ex * t;
    const qz = w.az + ez * t;
    const dx = pos.x - qx;
    const dz = pos.z - qz;
    const d = Math.hypot(dx, dz);
    const m = r + 0.18;
    if (d >= m) return false;
    let nx;
    let nz;
    if (d > 1e-5) { nx = dx / d; nz = dz / d; } else {
      const l = Math.sqrt(L2);
      nx = -ez / l; nz = ex / l;
    }
    pos.x = qx + nx * m;
    pos.z = qz + nz * m;
    const into = p.velocity.x * nx + p.velocity.z * nz;
    if (into < 0) { p.velocity.x -= nx * into; p.velocity.z -= nz * into; }
    return true;
  }

  _doorPush(p, seg, r, H) {
    if (p.position.y + 1.5 < seg.y0 || p.position.y > seg.y1) return;
    if (this._segPush(p, seg, r)) this._refuse(p, H);
  }

  /**
   * A castle room claimed by somebody who has not opened it: its rectangle is
   * a wall to everybody but her. "Each owner decides whether non-owners may
   * enter" — and a co-owner is a non-owner of HER sister's room.
   */
  _roomWall(p, I, H) {
    const rooms = homeRooms(H);
    if (H.owners.length < 2 && !rooms.some((r) => r.claim)) return;
    const n = p.style?.name;
    const at = I.houseAt(p.position.x, p.position.y, p.position.z);
    if (!at) return;
    const f = at.f;
    const L = at.hs.toLocal(p.position.x, p.position.z);
    for (const room of rooms) {
      /* A ROOM EVERYBODY CROSSES IS NEVER A WALL (`through`): the front door
         or the stairs up are in it, and a sister whose own room is upstairs
         has to walk through to get home. Its claim is who furnishes it. */
      if (!room.claim || room.through || room.hk !== at.hs.hk || room.floor !== f) continue;
      const who = H.rooms?.[room.id]?.claim;
      if (!who || who === n || H.open?.[who]) continue;
      const hx = room.w / 2;
      const hz = room.d / 2;
      const ox = L.x - room.cx;
      const oz = L.z - room.cz;
      if (Math.abs(ox) > hx + 0.6 || Math.abs(oz) > hz + 0.6) continue;
      // out by the nearest edge
      const px = hx + 0.6 - Math.abs(ox);
      const pz = hz + 0.6 - Math.abs(oz);
      if (px < pz) L.x = room.cx + Math.sign(ox || 1) * (hx + 0.6);
      else L.z = room.cz + Math.sign(oz || 1) * (hz + 0.6);
      const w = at.hs.local(L.x, L.z);
      p.position.x = w.x;
      p.position.z = w.z;
      this._nagOnce(p, `That is ${who}'s room — ask her to open it.`);
      return;
    }
  }

  /** "Bao's island is locked — ask her to open the door." Not every frame. */
  _refuse(p, H) {
    const names = H.owners;
    const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    const pron = names.length === 1 ? 'her' : 'one of them';
    this._nagOnce(p, `${who}'s island is locked — ask ${pron} to open the door.`);
  }

  _nagOnce(p, text) {
    const last = this._nag.get(p.index) ?? -99;
    if (this.time - last < NAG) return;
    this._nag.set(p.index, this.time);
    this.game.toast(text, p.index);
    this.game.audio?.play?.('menu');
  }

  /* ------------------------------ per frame ----------------------------- */

  update(dt) {
    /* THE BOONS RUN WHETHER OR NOT THE ISLANDS ARE UP: the wings and the
       auras are drawn in the RING, and a battle needs no house built. */
    this.boons.update(dt, this.game.players ?? [], this.game.scene);
    if (!this.built) return;
    this.time += dt;
    for (const b of this.browsing.values()) {
      b.t = (b.t ?? 0) + dt;
      if (b.ft != null) b.ft += dt;
    }
    this._updateLens(dt);
    for (const [j, o] of [...this.watchers]) {
      if (!this.browsing.has(o) || !this.game.players?.[j]) this.watchers.delete(j);
    }
    this._pumpRoads();
    const players = this.game.players ?? [];
    /* NOT IN THE SKY UNTIL THE ENDING. Richard: "The islands for purchase
       shouldn't be spawned until after the ending cutscene plays." They are
       built at boot (the roads take seconds to solve) and simply not shown,
       stood on or walled until the shop is open. */
    const up = this._showIsles();
    // Roshi stands in the TOWN, islands or not.
    this.roshi?.update(dt, players);
    if (!up) return;
    for (const I of this.isles) {
      I.update(dt, this.time, players);
      const H = I.home;
      // the bubble shows while it is keeping somebody here out
      I.bubble.visible = !!H && this.locked(H) && players.some((p) => !this.allowed(p, H));
    }
    for (const [k, B] of this.bridges.entries()) {
      const H = this.isles[k].home;
      if (B && H) B.setLocked(this.locked(H));
      B?.update?.(dt, this.time, B && H ? this._ownersNear(B, H, players) : null);
      if (B && H) B.setHolo(this._holoPoints(k, players));
    }
    for (const p of players) {
      if (!p?.velocity) continue;
      const mv = Math.hypot(p.velocity.x, p.velocity.z) > XRAY_UP.moving;
      p._xrayUp = Math.max(0, Math.min(1, (p._xrayUp ?? 1) + (mv ? 2 : -1) * dt / XRAY_UP.t));
    }
    this._mounts(players);
    this.holo.update(dt, players);
    this._payBank(players);
    this._trackMusic(players);
    this.koi.update(dt);
    this.angling.update(dt, players);
    this.farm.update(dt);
    this.pets.update(dt, players);
    this.kendo.update(dt, players);
    this.builder.update(dt, this.time);
    this.activities.update(dt, players);
    this.slides.update(dt, players);
    if (this.purchase?.active) this.purchase.update(dt);
    // Roshi's preview fades in on whichever island is being looked at
    if (this.preview) {
      const P = this.preview;
      P.k = Math.min(1, P.k + dt / 1.6);
      P.isle.setColours(P.colours, P.k);
    }
  }

  /** Per gate: is an OWNER near enough that its leaves swing open for her? */
  _ownersNear(B, H, players) {
    return (B.gates ?? []).map((G) => players.some((p) => p?.position && H.owners.includes(p.style?.name)
      && Math.hypot(p.position.x - G.cx, p.position.z - G.cz) < GATE.near
      && Math.abs(p.position.y - G.y) < GATE.nearY));
  }

  /**
   * WHERE THE DECK SHOWS ITSELF AS A HOLOGRAM: round every kitten bridge k
   * is a hologram to (`ghostFor`) who is over its deck or within reach of
   * it — "when they get near it or step on it". Up to HOLO_DECK.max.
   */
  _holoPoints(k, players) {
    const B = this.bridges[k];
    const out = [];
    if (!B?.solid) return out;
    const P = B.platform;
    for (const p of players) {
      if (!p?.position || out.length >= HOLO_DECK.max || !this.ghostFor(p, k)) continue;
      const { x, y, z } = p.position;
      if (x < P.x0 - 8 || x > P.x1 + 8 || z < P.z0 - 8 || z > P.z1 + 8) continue;
      // over the deck, or a few steps off its edge in any direction
      let near = null;
      for (const [dx, dz] of [[0, 0], [4, 0], [-4, 0], [0, 4], [0, -4]]) {
        const py = P.yAt(x + dx, z + dz, Infinity);
        if (py != null && Math.abs(py - y) < 8) { near = py; break; }
      }
      if (near != null) out.push({ x, y: near, z, k: 1 });
    }
    return out;
  }

  /**
   * THE BUBBLE STOPS DRAGONS TOO. A kitten on a mount is the mount's
   * passenger — `Player.wall` never runs — so the animal is pushed instead.
   * "Pushes non-owners back, including those flying on a dragon or griffin."
   */
  _mounts(players) {
    for (const p of players) {
      const body = p.mount ?? p.rideAlong;
      if (!body?.position) continue;
      for (const I of this.isles) {
        const H = I.home;
        if (!H || this.allowed(p, H)) continue;
        const R = I.bubbleRadius() + 4;
        const dx = body.position.x - I.x;
        const dz = body.position.z - I.z;
        const d = Math.hypot(dx, dz);
        if (d >= R || d < 1e-6) continue;
        body.position.x = I.x + (dx / d) * R;
        body.position.z = I.z + (dz / d) * R;
        I.bump(body.position.x, body.position.y, body.position.z);
        this._refuse(p, H);
      }
    }
  }

  /** Refunds waiting under a kitten's name, paid when she is here. */
  _payBank(players) {
    for (const p of players) {
      const n = p.style?.name;
      const owed = n && this.store.bank[n];
      if (!owed) continue;
      delete this.store.bank[n];
      p.score += owed;
      this.game.onScoreChanged?.(p);
      this.game.toast(`Roshi kept ${owed.toLocaleString()} points safe for you — here they are!`, p.index);
      this.save();
    }
  }

  /** Pay a kitten by name, whether she is here or not. */
  pay(name, amount) {
    if (!(amount > 0)) return;
    const p = (this.game.players ?? []).find((q) => q?.style?.name === name);
    if (p) {
      p.score += amount;
      this.game.onScoreChanged?.(p);
      return;
    }
    /* NOT IN THE GAME: into her row in this session's cast if she played
       today, which is what a save will carry; and into the bank otherwise,
       which outlives any one game. */
    const row = this.game.sessionCast?.get?.(name);
    if (row && Number.isFinite(row.score)) { row.score += amount; return; }
    this.store.bank[name] = (this.store.bank[name] ?? 0) + amount;
  }

  /* ------------------------------- music -------------------------------- */

  /**
   * THE MOST RECENT KITTEN ONTO A BRIDGE PICKS. Richard: one audio output,
   * four kittens — so when two are on two different bridges, whoever stepped
   * on last decides, and it stays her bridge's song while anybody is still on
   * a home bridge or a home island.
   */
  _trackMusic(players) {
    let any = false;
    for (const p of players) {
      const road = p.snakeRide?.road;
      const site = road?.home ? road.name.slice(5) : null;
      const was = this._onBridge.get(p.index) ?? null;
      if (site && site !== was) this.musicSite = site;
      this._onBridge.set(p.index, site);
      if (site) any = true;
      else if (this.isles.some((I) => I.home && I.over(p.position.x, p.position.z, 4) && Math.abs(p.position.y - I.groundY) < 40)) {
        any = true;
        if (!this.musicSite) {
          const I = this.isles.find((J) => J.home && J.over(p.position.x, p.position.z, 4));
          this.musicSite = I?.site.id ?? null;
        }
      }
    }
    if (!any) this.musicSite = null;
  }

  /**
   * Which activity on island `site` is going on now, by ACTIVITY_MUSIC's
   * order: a kendo match in one of its rooms, a kitten in its onsen (soaking,
   * or just stood in the water after), one holding a rod at its pond, one
   * walking, playing fetch or catching with one of its animals. Pure on the
   * game's state, so a check can set each up and ask.
   */
  activityNow(site, players = this.game.players ?? []) {
    const I = this.isles.find((J) => J.site.id === site);
    const here = (p) => p?.position && I?.over(p.position.x, p.position.z, 4);
    const doing = {
      kendo: () => [...(this.kendo?.bouts?.values() ?? [])].some((B) => B.key?.startsWith(`${site}:`)),
      onsen: () => players.some((p) => here(p) && (this.activities?.held.get(p.index)?.act === 'soak'
        || I.spots.some((s) => s.act === 'soak' && Math.hypot(p.position.x - s.x, p.position.z - s.z) < (s.r ?? 3) && Math.abs(p.position.y - s.y) < 3))),
      fishing: () => players.some((p) => p && this.angling?.lineOf?.(p.index)?.site === site),
      pets: () => players.some((p) => { const S = p && this.pets?.playing?.(p.index); return S?.site === site && S.kind !== 'hop'; }),
    };
    return ACTIVITY_MUSIC.find((T) => doing[T.act]?.()) ?? null;
  }

  /** `activityNow`'s song, or its procedural stand-in when the mp3 is not there. */
  activityTrack(site) {
    const T = this.activityNow(site);
    if (!T) return null;
    if (this.game.audio?.fileMissing?.(T.id) || !hasRecording(T.id)) return T.fallback;
    return T.id;
  }

  /** The jukebox's track for `_wantedTrack`, or null. */
  musicTrack() {
    /* THE SHRINE'S SONG OUTRANKS THE BOOMBOX while it plays — "stop all
       music; temple music while she prays and on to the song's end". */
    const prayer = this.musicSite ? this.activities?.prayerTrack() : null;
    if (prayer) return prayer;
    /* ...and so does whatever she is DOING on this island (jukebox.js
       ACTIVITY_MUSIC) — but not over a sister auditioning a boombox song,
       which is her asking to hear it. */
    const act = !this.audition && this.musicSite ? this.activityTrack(this.musicSite) : null;
    if (act) return act;
    /* A kitten browsing the boombox hears the row under her cursor (cards.js
       `drive`), and only for as long as the card is open. */
    const id = this.audition?.id ?? (this.musicSite ? this.store.jukebox?.[this.musicSite] ?? JUKEBOX[0].id : null);
    if (!id) return null;
    const T = JUKEBOX.find((t) => t.id === id) ?? JUKEBOX[0];
    /* A RECORDING THAT IS NOT ON DISK PLAYS ITS PROCEDURAL STAND-IN, which
       is non-negotiable 9: delete public/music and the jukebox still plays. */
    if (this.game.audio?.fileMissing?.(T.id)) return T.fallback;
    if (!hasRecording(T.id)) return T.fallback;
    // an audition starts where the music does (jukebox.js PREVIEW_AT)
    return this.audition?.id === T.id ? previewOf(T.id) : T.id;
  }

  /**
   * THE TOUR ON THE MINIMAP, for the pane `members` share, or null. The four
   * sky islands are not `world.islands` and the corner map has never drawn
   * them; on the tour it zooms out to take them in (over `TOUR.mapIn`) and
   * rings the one the cursor is on. Richard: "the minimap zooms out and
   * highlights the island".
   */
  /** Roshi's islands for the minimap once they are in the sky, or null (minimap.js `homes`). */
  homesMap() {
    if (!this.built || !this.isUp()) return null;
    return HOME_SITES.map((s) => ({ x: s.x, z: s.z, r: s.r, name: s.name, owned: !!this.store.homes[s.id] }));
  }

  tourMap(members) {
    const b = members.map((i) => this.browsing.get(i)).find(Boolean);
    if (!b) return null;
    return {
      k: tourEase(Math.min(1, (b.t ?? 0) / TOUR.mapIn)),
      sites: HOME_SITES.map((s) => ({
        x: s.x, z: s.z, r: s.r, name: s.name, hl: s.id === b.site,
        owned: !!this.store.homes[s.id],
      })),
    };
  }

  /* ------------------------------ cameras ------------------------------- */

  /**
   * ROSHI'S TOUR IS LOOKING AT `site`. The entry is KEPT across cursor moves —
   * it used to be replaced on every row, which threw away where the camera was
   * and is why the old tour could only cut. `from` is the centre it flies from.
   */
  browse(index, site) {
    const b = this.browsing.get(index);
    // The first island is turned to and flown to from wherever her camera is.
    if (!b) { this.browsing.set(index, { site, t: 0, ft: 0 }); this._lensFor(index).restart = true; return; }
    if (b.site === site) return;
    b.fromSite = b.site;
    b.site = site;
    b.ft = 0;
    this._lensFor(index).restart = true;
  }

  /* ------------------------------ the tour lens --------------------------- */

  /**
   * ROSHI'S TOUR DRIVES THE PANE'S CAMERA ITSELF. Richard, Oct 2026: "the
   * camera is not keeping the island it will go to next ... in the center of
   * the screen ... The camera should rotate to look at the island from where
   * it is, then when moving to the island, it should keep looking at it ...
   * always keeping the island in the center of the screen regardless of the
   * splitscreen the player is on."
   *
   * It used to be a `setFocus` on HER camera, and that had two faults. Her
   * follow camera chases a focus — `camTarget` lerps at 3.4/s and the
   * distance at 4/s — so while the centre flew four hundred units in 2.4s
   * the camera trailed it and the island slid off the middle of the frame.
   * And in a SHARED pane her camera is not the one drawing: the group's rig
   * is, and it has never heard of the tour. So the lens is a pose — an eye
   * and a point it looks at — laid over whatever camera draws her pane, in
   * `_renderView`, and the look point IS the island's centre from the moment
   * the turn ends. Centred by construction rather than by chasing.
   *
   *   turn   TOUR.look   the eye stays put; the look point swings from where
   *                      the camera was looking to the island
   *   fly    TOUR.fly    the eye travels (eased, arcing up) to its orbit
   *                      spot; the look point stays ON the island
   *   orbit              a slow sway round it, still looking at it
   *
   * Blended in over half a second from the camera's own pose and out again
   * the same way when the card closes, so neither end is a cut.
   */
  _lensFor(index) {
    let L = this.lens.get(index);
    if (!L) { L = { eye: null, look: null, eye0: null, look0: null, k: 0, live: true, restart: true }; this.lens.set(index, L); }
    L.live = true;
    return L;
  }

  /** The orbit spot over an island at time `t`: in front of it, up and back. */
  _orbitEye(I, t, out) {
    const yaw = I.ry + Math.PI + Math.sin(t * 0.12) * 0.7;
    const d = 95;
    const pitch = 0.42;
    return out.set(
      I.x + Math.sin(yaw) * Math.cos(pitch) * d,
      I.groundY + 6 + Math.sin(pitch) * d,
      I.z + Math.cos(yaw) * Math.cos(pitch) * d);
  }

  _updateLens(dt) {
    for (const [i, L] of this.lens) {
      const b = this.browsing.get(i);
      if (!b) L.live = false;
      L.k = Math.max(0, Math.min(1, L.k + (L.live ? dt : -dt) / 0.5));
      if (!L.live && L.k <= 0) { this.lens.delete(i); continue; }
      if (!b || !L.eye) continue;
      const I = this.isleOf(b.site);
      if (!I) continue;
      if (L.restart) {
        L.eye0 = L.eye.clone();
        L.look0 = L.look.clone();
        L.restart = false;
      }
      const target = (L._t ??= new THREE.Vector3()).set(I.x, I.groundY + 6, I.z);
      const orbit = this._orbitEye(I, this.time, L._o ??= new THREE.Vector3());
      const ft = b.ft ?? Infinity;
      if (ft < TOUR.look) {
        L.eye.copy(L.eye0);
        L.look.lerpVectors(L.look0, target, tourEase(ft / TOUR.look));
      } else if (ft < TOUR.look + TOUR.fly) {
        const u = tourEase((ft - TOUR.look) / TOUR.fly);
        L.eye.lerpVectors(L.eye0, orbit, u);
        L.eye.y += Math.sin(u * Math.PI) * 20;
        L.look.copy(target);
      } else {
        L.eye.copy(orbit);
        L.look.copy(target);
      }
    }
  }

  /**
   * Lay the tour over `camera` for one pane's render. `members` are the pane's
   * kittens; the first with a lens wins — in a shared pane that is the girl
   * at the counter, whose sisters are watching her tour (`watchers`).
   */
  tourLens(camera, members) {
    if (!this.lens.size) return;
    const ids = members ?? (this.game.players ?? []).map((_, k) => k);
    const i = ids.find((k) => this.lens.has(k));
    if (i == null) return;
    const L = this.lens.get(i);
    const fwd = (this._fwd ??= new THREE.Vector3());
    camera.getWorldDirection(fwd);
    if (!L.eye) {
      // The pose the camera already has is where the tour starts from.
      L.eye = camera.position.clone();
      L.look = camera.position.clone().addScaledVector(fwd, 40);
      L.restart = true;
      this._updateLens(0);
    }
    const k = tourEase(L.k);
    if (k <= 0) return;
    /* A NARROW PANE STANDS FURTHER BACK, so a column of split screen still
       shows the whole island: the eye is pushed out along its own line to the
       look point, which keeps the island exactly where it was in the frame. */
    const back = Math.max(1, Math.min(2.4, 1.5 / Math.max(0.2, camera.aspect)));
    const eye = (this._eye ??= new THREE.Vector3()).copy(L.eye).sub(L.look).multiplyScalar(back).add(L.look);
    const look = (this._look ??= new THREE.Vector3()).copy(camera.position).addScaledVector(fwd, 40);
    look.lerp(L.look, k);
    camera.position.lerp(eye, k);
    camera.lookAt(look);
  }

  /* ------------------------------ the watchers ---------------------------- */

  /**
   * SISTERS SHARING HER PANE WATCH HER TOUR. Richard: "When players are both
   * next to Roshi and are in the same shared screen, if a player brings up
   * the Roshi menu, then instead of going to splitscreen, the UI should take
   * up the entire screen and all the players can see what the player talking
   * to Roshi is doing. A player not controlling the UI should still lose their
   * normal input control ... but if they press the back button to back out of
   * the UI, then it will go to splitscreen mode and player regains control."
   *
   * A personal card normally puts its kitten in a pane of her own
   * (`Game._clusters`' `solo`). Roshi's does not while anybody is watching:
   * she and her watchers are one LANE, so the pane they were sharing stays
   * theirs with her card in it and the lens on it. A watcher's pad is dead but
   * for the way out — INTERACT or START, the same two buttons that close a
   * card — and when the last one has gone, her card is solo again and the
   * screen splits exactly as it always did.
   */
  startWatch(owner) {
    const G = this.game;
    const group = (G.groups ?? []).find((m) => m.includes(owner)) ?? [];
    for (const j of group) {
      const q = G.players?.[j];
      if (j === owner || !q || q.mount || q.rideAlong || G.inspector?.busy?.(j) || this.watchers.has(j)) continue;
      this.watchers.set(j, owner);
      G.toast?.(`${G.players[owner]?.name ?? 'Your sister'} is looking at Roshi's islands — you are watching. INTERACT to go back to playing.`, j);
    }
  }

  endWatch(owner) {
    for (const [j, o] of [...this.watchers]) if (o === owner) this.watchers.delete(j);
  }

  /** Is seat `j` watching somebody's tour? Then her pad is dead (Game). */
  watching(j) { return this.watchers.has(j); }

  /** The pane lane for `Game._clusters`: owner and watchers share one. */
  watchLane(i) {
    if (this.watchers.has(i)) return `tour:${this.watchers.get(i)}`;
    for (const o of this.watchers.values()) if (o === i) return `tour:${i}`;
    return null;
  }

  /** A watcher pressed the way out. */
  unwatch(j) {
    if (!this.watchers.delete(j)) return;
    this.game.toast?.('Back to playing!', j);
    this.game.audio?.play?.('menu');
  }

  /**
   * Roshi's tour: her pane flies out to the island she is looking at.
   *
   * LOOK, THEN GO. Richard: "the camera looks, then flies, 2–3 seconds,
   * slower". A new island is first TURNED TO from where the camera is — the
   * centre stays put and the camera swings round behind it so the next island
   * is in the middle of the frame — and only then does the centre travel, eased,
   * over `TOUR.fly`. The orbit's slow sway comes back in as it arrives.
   */
  cameraFocus(p) {
    // Roshi's tour is not a focus any more: it is a lens (`tourLens`).
    if (this.browsing.has(p.index)) return null;
    return this.builder.camera(p) ?? this.activities.cameraFocus(p) ?? this._doorShot(p) ?? this.koi.cameraFocus?.(p) ?? null;
  }

  /**
   * WALKING UP TO A FRONT DOOR, the camera comes round behind her and frames
   * the door and its name board. Richard: "the placard above the houses door
   * frame ... is not visible as the roof blocks it from camera. Let's make it
   * that when the player is approaching the front of the house, the camera
   * goes behind the player and focuses on the door frame and placard."
   *
   * The zone is a box in front of the door, out to 13 units. The shot is low
   * (pitch 0.16): from the usual 0.6 the eave's overhang is exactly what
   * hides the board, so the only way to see it is to come in under it.
   */
  _doorShot(p) {
    if (p.mount || p.rideAlong) return null;
    /* HER PANE'S GROUP, not her alone. Richard: "when multiple players are
       in front of a player's house, it does not do the 3D camera view ... But,
       the controls are being overridden as if the camera rotated". Two
       kittens sharing a pane are drawn by the shared rig (main.js
       `_updateRig`), which never asked about the door — while each one's
       stick was read through her OWN camYaw, which had swung round to the
       door. So the decision is the group's: everybody sharing her pane gets
       the shot (her focus here, which turns her stick) and the rig gets the
       same one (`doorShotFor`, at the same easing rate), so what she sees
       and what her stick means move together. */
    const members = this.game.groups?.find((m) => m.includes(p.index)) ?? [p.index];
    return this.groupShot(members.includes(p.index) ? members : [p.index]);
  }

  /**
   * The shot a pane's group shares, or null: a kendo match being watched
   * (kendo.js `shotFor`) over a front door. ONE answer for the per-kitten
   * focus and the shared rig (main.js `_updateRig`), which is what keeps the
   * camera and the sticks in it pointing the same way.
   */
  groupShot(members) {
    return this.kendo.shotFor(members) ?? this.teaShotFor(members) ?? this.doorShotFor(members);
  }

  /**
   * THE TEAHOUSE'S FRONT, the door shot's little sister. Richard: "a camera
   * zoom on its front (smaller radius)". Anybody in the pane's group on its
   * step, its tatami or the few metres in front of its open side gets the
   * room framed from the street: 10 back instead of the house's 12, aimed a
   * metre over the tatami where four kittens kneel. Behind it or beside its
   * closed wall she keeps her own camera — there is nothing to look INTO.
   */
  teaShotFor(members) {
    const players = this.game.players ?? [];
    const kits = members.map((i) => players[i]).filter((q) => q && !q.mount && !q.rideAlong);
    if (!kits.length) return null;
    for (const I of this.isles) {
      for (const T of I.teahouses ?? []) {
        const c = Math.cos(T.a), s = Math.sin(T.a);
        const near = kits.some((q) => {
          const dx = q.position.x - T.x, dz = q.position.z - T.z;
          const lx = dx * c - dz * s, lz = dx * s + dz * c;
          return Math.abs(lx) <= 3.6 * T.k && lz >= -2.4 * T.k && lz <= 2.96 * T.k + 6 && q.position.y <= T.gy + 4;
        });
        if (!near) continue;
        /* PULLED BACK, SAME ANGLE. Richard, Oct 2026: "the camera zooms in too
           much and user can't read the text above the players head." At 10 the
           names and the toast over four kneeling kittens ran off the top of
           the pane; TEA_SHOT moves the camera back along its own ray (the
           angle he liked stays) and aims at their heads rather than the mat. */
        (T._centre ??= new THREE.Vector3()).set(T.x + 0.4 * T.k * s, T.floorY + TEA_SHOT.aimY, T.z + 0.4 * T.k * c);
        let yaw = T.a;
        while (yaw - CAM_YAW_DEFAULT > Math.PI) yaw -= Math.PI * 2;
        while (yaw - CAM_YAW_DEFAULT < -Math.PI) yaw += Math.PI * 2;
        return { centre: T._centre, aim: true, dist: TEA_SHOT.dist, pitch: 0.18, yaw };
      }
    }
    return null;
  }

  /**
   * The door shot for a pane's group, or null: somebody in it is in front of
   * a house's door, and NOBODY in it is inside that house. "If someone is
   * inside the house, then that camera angle should get overridden back to
   * ... the view it should be when a player is inside the house." A kitten
   * on a mount has the animal's camera and neither asks nor vetoes.
   */
  doorShotFor(members) {
    const players = this.game.players ?? [];
    const kits = members.map((i) => players[i]).filter((q) => q && !q.mount && !q.rideAlong);
    for (const I of this.isles) {
      /* THE FIRST HOUSE'S DOOR, WHEREVER IT HAS BEEN MOVED TO: the shot is
         in its own frame. Richard: "When moving the main house, the camera
         zooming in on the front-name plate should move with it". */
      const M = I.main;
      const S = M?.shell;
      if (!S?.sign || !I.home) continue;
      const atDoor = kits.some((q) => {
        if (!I.over(q.position.x, q.position.z)) return false;
        const L = M.toLocal(q.position.x, q.position.z);
        if (Math.abs(L.x) > 6.5 || L.z < S.door.z + 0.4 || L.z > S.door.z + 13) return false;
        return q.position.y <= M.gy + S.base + 2.5;
      });
      if (!atDoor) continue;
      if (kits.some((q) => I.houseAt(q.position.x, q.position.y, q.position.z)?.hs === M)) return null;
      const c = M.local(0, S.door.z + 2.2);
      (I._doorCentre ??= new THREE.Vector3()).set(c.x, M.gy + S.sign.y - DOOR_SHOT.below, c.z);
      // the house's front, wrapped to within a half-turn of the usual yaw
      let yaw = M.ry;
      while (yaw - CAM_YAW_DEFAULT > Math.PI) yaw -= Math.PI * 2;
      while (yaw - CAM_YAW_DEFAULT < -Math.PI) yaw += Math.PI * 2;
      return { centre: I._doorCentre, aim: true, dist: DOOR_SHOT.dist, pitch: doorPitch(S), yaw };
    }
    return null;
  }

  /**
   * THE CUTAWAY, per pane. Every floor above the HIGHEST kitten in this pane
   * who is inside, and the roof, are hidden for THIS render only; the walls
   * of the floor she is on take an x-ray bite for her, and a sister on a
   * floor below takes a bigger one through the floor over her head
   * (`LOWER_XRAY`). A scene's lens shows every house whole.
   */
  aimView(camera, members, scene) {
    if (!this.built) return;
    const players = this.game.players ?? [];
    const who = members ?? players.map((_, k) => k);
    for (const I of this.isles) {
      if (!I.home) continue;
      if (scene) { I.cutaway(-1); I.halfWalls(null); I.clipBridges([]); for (const M of I.xrayMats) M.setCuts?.(camera.position, []); continue; }
      /* EACH HOUSE CUT TO THE HIGHEST FLOOR anybody in this pane is on in IT.
         Richard, Oct 2026: "Show the upper floor for the player who is
         upstairs." It was the LOWEST, so two sisters sharing a pane, one
         upstairs, had the upstairs girl's whole floor taken away from her —
         she walked about on nothing. The girl below is seen through it. */
      const cut = new Map();
      const at = who.map((i) => {
        const p = players[i];
        const a = p ? I.houseAt(p.position.x, p.position.y, p.position.z) : null;
        if (a) cut.set(a.hs.hk, Math.max(cut.get(a.hs.hk) ?? -1, a.f));
        return a;
      });
      const seen = [];
      const floors = [];
      const scale = [];
      const ceil = [];
      /* INSIDE, A SCREEN; OUTSIDE, A HOLE. Richard, Oct 2026: "Rather than
         cutting the geometry with the shader, maybe we can just use the
         dithering effect ... we should be able to do this better indoors at
         least when players are inside the building." A kitten in a house is
         cut for at XRAY_INDOOR, so the wall between her and the camera is a
         stipple she is seen through rather than a bite out of the room; out
         on the lawn it is still the porthole, which reads better against a
         building she is not in. */
      const k = [];
      for (const [j, i] of who.entries()) {
        const p = players[i];
        if (!p) continue;
        if (Math.hypot(p.position.x - I.x, p.position.z - I.z) < I.radius + 14 && seen.length < 4) {
          seen.push(new THREE.Vector3(p.position.x, p.position.y + 1.4, p.position.z));
          /* A KNEE'S HEIGHT ABOVE HER FEET, not just under them. Richard: the
             x-ray "is cutting into the flooring and the foundation of the
             house". At -0.05 the tatami (0.06 thick, ON the floor) and the
             plinth's top edge were above the line and inside the cone. */
          floors.push(p.position.y + 0.35);
          /* BELOW THE FLOOR THAT IS SHOWN: "Make the lower player's x-ray 2-3x
             bigger. Upper-floor items must not be affected by the lower
             player's x-ray." Her hole is `LOWER_XRAY` times the size, and it
             stops at the TOP of the slab over her head, so it opens the floor
             and nothing standing on it. */
          const a = at[j];
          const f = a ? cut.get(a.hs.hk) : null;
          const lower = a && f > a.f && Number.isFinite(a.hs.shell.floorY[a.f + 1]);
          scale.push(lower ? LOWER_XRAY : 1);
          ceil.push(lower ? a.hs.gy + a.hs.shell.floorY[a.f + 1] + 0.02 : null);
          k.push(a ? XRAY_INDOOR : 1);
        }
      }
      // ...and a sister downstairs, through the floor over her too (XRAY_UP): after all four kittens' own slots
      for (const [j, i] of who.entries()) {
        const p = players[i], a = at[j];
        if (!p || !a || seen.length >= XRAY_SLOTS) continue;
        const f = cut.get(a.hs.hk);
        const e = p._xrayUp ?? 1;
        if (!(f > a.f) || !Number.isFinite(a.hs.shell.floorY[a.f + 1]) || e < 0.02) continue;
        seen.push(new THREE.Vector3(p.position.x, p.position.y + 1.4, p.position.z));
        floors.push(a.hs.gy + a.hs.shell.floorY[a.f + 1] + 0.02);
        scale.push(LOWER_XRAY * e);
        ceil.push(null);
        k.push(XRAY_INDOOR);
      }
      /* ...AND THE THING SHE IS PLACING OR CUSTOMISING OUTSIDE (`Builder.xrayAt`):
         Richard: "The house, especially a castle, can block the camera." */
      for (const q of this.builder.xrayAt(I, who)) {
        if (seen.length >= 4) break;
        seen.push(q.p);
        floors.push(q.floor);
        scale.push(1);
        ceil.push(null);
        k.push(1);
      }
      /* BEHIND A TALL HOUSE, ON THE GROUND: its first floor with the roofs
         off. Richard, Oct 2026: "The castle obstructs the backyard. When the
         player is on the ground outside (or jumping from the ground), not on a
         bridge or in a house, and is directly behind the castle, show the
         castle's 1st floor with the roofs removed. Otherwise the roofs stay
         on." Directly behind is the camera-to-her line crossing the house's
         ground floor, eaves and all; a house somebody in the pane is inside is
         already cut to her floor and keeps that. Two storeys or more — a
         one-storey house is cut to its first floor already by losing its roof,
         and there is nothing over it to hide her. */
      for (const hs of I.houses ?? []) {
        const S = hs.shell;
        if (cut.has(hs.hk) || S.floorY.length < 2) continue;
        const [hw, hd] = S.half[0];
        const behind = who.some((i) => {
          const p = players[i];
          if (!p || p.mount || p.rideAlong || !I.over(p.position.x, p.position.z)) return false;
          if (p.position.y > hs.gy + S.floorY[0] + BEHIND_HOP) return false;
          if (I.heightAt(p.position.x, p.position.z, p.position.y + 0.1)?.deck?.link != null) return false;
          const a = hs.toLocal(camera.position.x, camera.position.z);
          const b = hs.toLocal(p.position.x, p.position.z);
          if (Math.abs(b.x) < hw && Math.abs(b.z) < hd) return false;
          /* THROUGH THE WALLS, or through the eaves from OUTSIDE them. Richard,
             Oct 2026: "When walking to the front of the castle, when under the
             roof on the 1st floor, the 2nd/3rd floor are being removed ...
             This shouldn't happen until the player walks into the castle and
             past the door frame". On the ramp and the porch she is INSIDE the
             eaves' rectangle (hw x 1.32), so a line from the camera in front of
             her ended in it and she counted as behind the castle from 14 out
             with the door at 11 (measured). The eaves hide her only from
             beyond them; under them, only the walls do. */
          if (segHitsRect(a.x, a.z, b.x, b.z, hw, hd)) return true;
          if (Math.abs(b.x) < hw * 1.32 && Math.abs(b.z) < hd * 1.32) return false;
          return segHitsRect(a.x, a.z, b.x, b.z, hw * 1.32, hd * 1.32);
        });
        if (behind) cut.set(hs.hk, 0);
      }
      /* A card about a room cuts the house to THAT room's floor, whatever
         floor she is standing on — the camera has to see the tatami. It
         used to be the lower of the two, so a girl downstairs choosing a room
         upstairs had the very floor she was choosing cut away (Richard: "it
         only shows the floor the players are on"). */
      const bf = this.builder.cutFloor(I, members ?? players.map((_, k) => k));
      if (bf) cut.set(bf.hk, bf.f);
      // building outside: roofs off, and a bridge's house cut to the bridge's floor
      const soft = new Set(cut.keys());
      for (const c of this.builder.outdoorCuts(I, members ?? players.map((_, k) => k))) {
        if (c.hard) cut.set(c.hk, c.f);
        else if (!soft.has(c.hk)) cut.set(c.hk, Math.min(cut.get(c.hk) ?? 99, c.f));
      }
      I.cutaway(cut);
      // ...and the bridges from the storeys that came off, above the walls of the one left (`clipBridges`)
      const clips = [];
      for (const hs of I.houses ?? []) {
        const f = cut.get(hs.hk), S = hs.shell;
        if (!(f >= 0) || f >= S.floorY.length - 1 || clips.length >= BRIDGE_CLIPS) continue;
        const [hw, hd] = S.half[f];
        clips.push({ x: hs.wx, z: hs.wz, cos: hs.cos, sin: hs.sin, hw, hd, y: hs.gy + S.floorY[f] + BRIDGE_CLIP_UNDER });
      }
      I.clipBridges(clips);
      /* THE DOORS THE HOUSE HIDES: every doorway on a floor this pane shows,
         facing away from its camera, near somebody in it (`DOOR_XRAY`). */
      const cam = camera.position;
      for (const hs of I.houses ?? []) {
        const f = cut.get(hs.hk);
        for (const d of hs.doors ?? []) {
          if (seen.length >= XRAY_SLOTS) break;
          if (f != null && f >= 0 && d.floor > f) continue;
          const o = hs.local(0, 0);
          const n = hs.local([0, 1, 0, -1][d.side], [1, 0, -1, 0][d.side]);
          if ((cam.x - d.wx) * (n.x - o.x) + (cam.z - d.wz) * (n.z - o.z) > 0) continue;
          if (!who.some((i) => players[i] && Math.hypot(players[i].position.x - d.wx, players[i].position.z - d.wz) < DOOR_XRAY.near)) continue;
          seen.push(new THREE.Vector3(d.wx, d.y + PORT_H / 2, d.wz));
          floors.push(d.y + 0.05);
          scale.push(Math.min(1, (d.w / 2) / I.xrayR));
          ceil.push(d.y + PORT_H + DOOR_XRAY.lintel);
          k.push(DOOR_XRAY.k);
        }
      }
      // a kendo match being watched: the walls at half height (kendo.js)
      I.halfWalls(this.kendo.halfWallFor(I, members ?? players.map((_, k) => k)));
      for (const M of I.xrayMats) M.setCuts?.(camera.position, seen, floors, { scale, ceil, k });
    }
  }

  /* ------------------------------- buying ------------------------------- */

  /** Is the shop open? After the ending (the roads exist), or by debug. */
  shopOpen() {
    return !!(this.world.snakeOpen || this.debugOpen);
  }

  /**
   * BUY. Called the frame the last YES is pressed — the card has already
   * checked the purse, and checks again here because four kittens can spend
   * at once.
   *
   * @param {string} siteId
   * @param {string} houseId
   * @param {Array<{p: Player, share: number}>} buyers — the castle pools
   * @param {string|null} presetId
   */
  buy(siteId, houseId, buyers, presetId = null) {
    const I = this.isleOf(siteId);
    const def = HOUSE_BY_ID[houseId];
    if (!I || !def) return { ok: false, why: 'That island is not for sale.' };
    if (this.store.homes[siteId]) return { ok: false, why: 'Somebody already lives there!' };
    for (const { p } of buyers) {
      if (this.homeOf(p)) return { ok: false, why: `${p.name} already has a home — one each!` };
    }
    for (const { p, share } of buyers) {
      if (p.score < share) return { ok: false, why: `${p.name} needs ${share - p.score} more points.` };
    }
    const owners = buyers.map(({ p }) => p.style.name);
    const H = newHome(siteId, houseId, owners);
    for (const { p, share } of buyers) {
      p.score -= share;
      H.paid[p.style.name] = share;
      this.game.onScoreChanged?.(p);
    }
    /* THE CASTLE STANDS FORWARD, toward its bridge, so the back of the island
       is one big garden: Richard, "or move the castle a bit forward so there is
       more room to build the Koi pond on the island". Only a new castle — an
       old save keeps the place its furniture and yard were laid out round. */
    const fwd = HOME_FORWARD[houseId];
    if (fwd) {
      const at = { x: 0, z: fwd, rot: 0 };
      if (!houseWhy({ ...H, at }, { hk: 'main', house: houseId, ...at }, this.envOf(I))) H.at = at;
    }
    defaultWindows(H);
    H.winV = 2;
    // the walk from her bridge to her door, and nothing of a preset's on it (editor.js `layDoorPath`)
    const env = this.envOf(I);
    /* No bridge wound yet (the roads solve in the background): the landing
       is where it always lands, the rim straight out from the front of the
       island, which is its +z (the house faces home). */
    env.landing ??= { x: 0, z: I.radius - 4 };
    layDoorPath(H, env);
    H.rampV = 1;
    if (presetId && PRESET_BY_ID[presetId]) autoLayout(H, PRESET_BY_ID[presetId], I, env);
    this.store.homes[siteId] = H;
    this.save();
    I.setHome(H, this.coloursOf(H));
    this.koi.sync();
    this.angling.sync();
    this.farm.sync();
    this.pets.sync();
    this.game.audio?.play?.('score');
    const k = this.isles.indexOf(I);
    this.stopPreview();
    /* The scene, AFTER the fact. If the roads are not wound yet (they are
       pumped in the background from the moment Roshi's card opens) the
       scene waits on them; skipping it loses nothing. */
    this.purchase.start(k, owners);
    return { ok: true };
  }

  /** Total paid for a home by everyone (house + things in it). */
  paidFor(H) {
    return Object.values(H.paid ?? {}).reduce((a, b) => a + (b || 0), 0);
  }

  /**
   * SELL. 75% of what each owner put in goes back to EACH owner — the ones
   * who are not here get it in the bank. The card only offers this when every
   * owner is in the game and has said yes (`cards.js`).
   */
  sell(siteId) {
    const H = this.store.homes[siteId];
    if (!H) return false;
    for (const n of H.owners) this.pay(n, Math.round((H.paid?.[n] ?? 0) * HOME_SELL));
    delete this.store.homes[siteId];
    if (this.store.jukebox) delete this.store.jukebox[siteId];
    this.save();
    const k = this.isles.findIndex((I) => I.site.id === siteId);
    this.isles[k]?.setHome(null);
    if (this.bridges[k]) { this.bridges[k].group.visible = false; this.bridges[k].solid = false; }
    if (this.musicSite === siteId) this.musicSite = null;
    this.koi.sync();
    this.angling.sync();
    this.farm.sync();
    this.pets.sync();
    return true;
  }

  /** Spend on a home: the item, room type or preset. Records who paid. */
  spend(p, H, amount) {
    if (p.score < amount) return false;
    p.score -= amount;
    H.paid[p.style.name] = (H.paid[p.style.name] ?? 0) + amount;
    this.game.onScoreChanged?.(p);
    return true;
  }

  /** Something in a home changed: write it, redraw it. */
  changed(H) {
    this.save();
    const I = this.isleOf(H.site);
    I?.rebuildItems();
    this.koi.sync();
    this.angling.sync();
    this.farm.sync();
    this.pets.sync();
  }

  setOpen(p, H, open) {
    const n = p.style.name;
    if (!H.owners.includes(n)) return false;
    H.open[n] = !!open;
    this.save();
    const k = this.isles.findIndex((I) => I.site.id === H.site);
    this.bridges[k]?.setLocked(this.locked(H));
    return true;
  }

  /* ---------------------------- a share of it ---------------------------- */

  /*
   * BUYING INTO A HOME THAT IS ALREADY OWNED, AND SELLING BACK OUT. Richard,
   * Oct 2026: "Share part of the house ... A new co-owner pays a 1/n share,
   * split evenly among the current owners. Added owners get building colours,
   * a statue and other benefits. A 'sell back' removes their colours, statue
   * and access." Everything an owner gets is read off `H.owners` — the
   * colours (`coloursOf`), the statues (`_dressBridge`), the locks and the
   * rooms — so joining is one name pushed and selling out one name taken
   * away, with the redraw after each. The price is the house's at Roshi's
   * over the owners there will be, as a purchase shared four ways is; it goes
   * to the owners, not to Roshi, and comes off what each of them has in it
   * (`H.paid`), so a later sale pays everybody back on what they really hold.
   * Selling out is Roshi's 75% of what she paid, as everything else is.
   */
  sharePrice(H) {
    return Math.ceil(this.housePrice(H.house) / (H.owners.length + 1) / 10) * 10;
  }

  shareWhy(p, H) {
    const def = HOUSE_BY_ID[H.house];
    const n = p?.style?.name;
    if (!def || !n) return 'Nobody to buy it.';
    if (H.owners.includes(n)) return `${p.name} already owns a share of it.`;
    if ((def.owners ?? 1) <= 1) return `A ${def.name} is for one owner — only a castle is shared.`;
    if (H.owners.length >= def.owners) return `The ${def.name} already has ${def.owners} owners — that is as many as it holds.`;
    if (this.homeOf(p)) return `${p.name} already has a home — one each! Sell it first.`;
    const price = this.sharePrice(H);
    if (p.score < price) return `${p.name} needs ${price - p.score} more.`;
    return null;
  }

  joinHome(p, H) {
    const why = this.shareWhy(p, H);
    if (why) return { ok: false, why };
    const price = this.sharePrice(H);
    const was = [...H.owners];
    p.score -= price;
    this.game.onScoreChanged?.(p);
    H.paid ??= {};
    // evenly, and the odd points to the first owner, so not one is made or lost
    const each = Math.floor(price / was.length);
    was.forEach((o, i) => {
      const got = each + (i === 0 ? price - each * was.length : 0);
      this.pay(o, got);
      H.paid[o] = Math.max(0, (H.paid[o] ?? 0) - got);
    });
    H.owners.push(p.style.name);
    H.paid[p.style.name] = price;
    this._reowned(H);
    return { ok: true, price, each };
  }

  leaveWhy(p, H) {
    const n = p?.style?.name;
    if (!H?.owners.includes(n)) return 'Only an owner can sell her share.';
    if (H.owners.length < 2) return 'She is the only owner — selling her share would be selling the house. Use SELL MY HOME.';
    return null;
  }

  leaveHome(p, H) {
    const why = this.leaveWhy(p, H);
    if (why) return { ok: false, why };
    const n = p.style.name;
    const back = Math.round((H.paid?.[n] ?? 0) * HOME_SELL);
    this.pay(n, back);
    H.owners = H.owners.filter((o) => o !== n);
    delete H.paid?.[n];
    delete H.open?.[n];
    for (const R of Object.values(H.rooms ?? {})) if (R?.claim === n) delete R.claim;
    this._reowned(H);
    return { ok: true, back };
  }

  /** Who owns it changed: the colours, the statues, the locks, written down. */
  _reowned(H) {
    this.save();
    const k = this.isles.findIndex((I) => I.site.id === H.site);
    this.isles[k]?.setHome(H, this.coloursOf(H));
    this._dressBridge(k);
    this.koi.sync();
    this.angling.sync();
    this.farm.sync();
    this.pets.sync();
  }

  /* --------------------------- castle rooms ----------------------------- */

  /**
   * CLAIMING A CASTLE ROOM. Richard: "How does player go about claiming
   * Castle Rooms? I don't see a way to claim it yet ... players can only
   * claim their fair half of the amount of rooms available, so that, everyone
   * gets a fair amount of rooms. If there is an odd numbered room, then it is
   * shared or unclaimed. A player can revoke their claimed room and claim a
   * new one if there is one available." There was no way: the card said
   * "walk into it first" and nothing ever wrote a claim.
   *
   * Her FAIR SHARE is the claimable rooms over the owners, rounded DOWN —
   * four rooms are 2 each for two owners, 1 each for three with one left
   * over, and that one can never be claimed by anybody, so it is everybody's.
   * Only an owner claims. Claims are on the CASTLE ROOMS card, both ways.
   */
  claimShare(H) {
    const n = homeRooms(H).filter((r) => r.claim).length;
    return H.owners.length ? Math.floor(n / H.owners.length) : 0;
  }

  claimsOf(H, name) {
    return Object.entries(H.rooms ?? {}).filter(([, R]) => R?.claim === name).map(([id]) => id);
  }

  /** Why she cannot claim this room, or null. */
  claimWhy(p, H, roomId) {
    const n = p.style?.name;
    const room = homeRooms(H).find((r) => r.id === roomId);
    if (!room?.claim) return 'That room is for everybody — it cannot be claimed.';
    if (!H.owners.includes(n)) return `Only the castle's owners can claim a room — ${H.owners.join(' & ')}.`;
    const who = H.rooms?.[roomId]?.claim;
    if (who === n) return null;
    if (who) return `That is ${who}'s room. Pick one that says UNCLAIMED.`;
    const share = this.claimShare(H);
    const rooms = homeRooms(H);
    const mine = this.claimsOf(H, n).map((id) => rooms.find((r) => r.id === id)).filter(Boolean);
    if (mine.length >= share) {
      return share === 1
        ? 'You already have your room — let it go first to pick a different one.'
        : `You already have your fair share of ${share} rooms — let one go first to pick a different one.`;
    }
    /* ONE IN EACH BUILDING, AND ONE GROUND FLOOR. Richard, Oct 2026: "If there
       are 2 co-owners, each person can get 1 room in each building ... If a
       player claims a 1st floor of the castle or the dojo house, they can not
       claim the 1st floor of the other house." Two rules, each a sentence a
       nine-year-old can act on: a second room in the same house is refused
       while there is somebody to share with, and a second ground floor always. */
    if (H.owners.length > 1 && mine.some((r) => r.hk === room.hk)) {
      return 'You already have a room in this house — pick one in the other house, so everybody gets one in each.';
    }
    if (room.floor === 0 && mine.some((r) => r.floor === 0)) {
      return 'You already have a ground floor — pick an upstairs room, so your sister gets a ground floor too.';
    }
    return null;
  }

  /** Claim it (true) or let it go (false). Says why on a refusal. */
  setClaim(p, H, roomId, claim) {
    const n = p.style?.name;
    const R = (H.rooms[roomId] ??= { items: [] });
    if (!claim) {
      if (R.claim !== n) { this.game.toast('That room is not yours to let go.', p.index); return false; }
      delete R.claim;
    } else {
      const why = this.claimWhy(p, H, roomId);
      if (why) { this.game.toast(why, p.index); return false; }
      R.claim = n;
    }
    this.save();
    return true;
  }

  /* ------------------------ houses on the island ------------------------ */

  /** What the pure placing rules need to know about an island's ground. */
  envOf(I) {
    const B = this.bridges[this.isles.indexOf(I)];
    const landing = B?.end ? I.toLocal(B.end.x, B.end.z) : null;
    const g = (x, z) => {
      const w = I.local(x, z);
      return (I.island.heightAt(w.x, w.z) ?? I.groundY) - I.groundY;
    };
    /* WHAT STANDS AT HER END OF THE BRIDGE — the statues, the boombox, the
       lanterns and the banners (`HomeBridge.solids`) — as island-local
       circles, which a yard thing keeps off (editor.js `yardWhy`). Only the
       island end's: the town end is not on her island. */
    const G1 = B?.gates?.[1];
    const entrance = G1 ? (B.solids ?? [])
      .filter((o) => Math.hypot(o.x - G1.cx, o.z - G1.cz) < 25)
      .map((o) => ({ ...I.toLocal(o.x, o.z), r: o.r })) : [];
    return { r: I.radius, landing, entrance, gyAt: g, groundAt: g };
  }

  /**
   * What an extra house costs HER here: nothing for the first of the one a
   * size down that came with the island (`FREE_ANNEX` — "the first house is
   * free that comes with the island, after that they have to buy any
   * additional houses"), else HALF Roshi's price for it — the island is
   * already hers (Richard, Oct 2026: "When buying a house on an already owned
   * island, let's lower the price by 50%"). Selling it back pays HOME_SELL of
   * what was PAID, so the discount is not a profit.
   */
  annexPrice(H, houseId) {
    const free = FREE_ANNEX[H.house] === houseId && !(H.annex ?? []).some((a) => a.free);
    return free ? 0 : Math.max(10, Math.round(this.housePrice(houseId) * ANNEX_OFF / 10) * 10);
  }

  /**
   * Put a house down: a new one (`spec.hk` null), or one being moved —
   * `spec` is `{ hk, house, x, z, rot }` in the island's frame. A bridge to a
   * moved house that can no longer be built is SOLD BACK, and she is told.
   * Returns true when it happened.
   */
  placeHouse(p, H, spec) {
    const I = this.isleOf(H.site);
    const env = this.envOf(I);
    const why = houseWhy(H, spec, env);
    if (why) { this.game.toast(why, p.index); return false; }
    const def = HOUSE_BY_ID[spec.house];
    let raise = null;
    const at = { x: +spec.x.toFixed(2), z: +spec.z.toFixed(2), rot: +(spec.rot ?? 0).toFixed(4) };
    if (!spec.hk) {
      const price = this.annexPrice(H, spec.house);
      if (price && !this.spend(p, H, price)) { this.game.toast(`${p.name} needs ${(price - p.score).toLocaleString()} more points.`, p.index); return false; }
      H.uid = (H.uid ?? 0) + 1;
      H.annex ??= [];
      H.annex.push({ uid: H.uid, house: spec.house, ...at, paid: price, free: !price });
      defaultWindows(H, `a${H.uid}`);
      this.game.toast(price ? `The ${def.name} is built!` : `The ${def.name} is built — free, it came with the island!`, p.index);
      /* "Play a build animation when a house is built, similar to the island
         purchase": the purchase scene's rise, in place, without taking the
         camera away from her build view. It changes nothing — the house is
         already written down above. */
      raise = `a${H.uid}`;
    } else {
      const sold = brokenLinks(H, spec, env);
      if (spec.hk === 'main') H.at = at;
      else Object.assign(H.annex.find((a) => `a${a.uid}` === spec.hk), at);
      for (const L of sold) this._dropLink(p, H, L);
      this.game.toast(sold.length
        ? `Moved the ${def.name}. ${sold.length === 1 ? 'A bridge' : `${sold.length} bridges`} could not reach it any more — Roshi bought ${sold.length === 1 ? 'it' : 'them'} back.`
        : `Moved the ${def.name} — and everything inside it.`, p.index);
    }
    this.changed(H);
    if (raise) { I?.raise?.(raise); this.game.audio?.play?.('islerise'); } else this.game.audio?.play?.('land');
    return true;
  }

  /** What selling an extra house pays back: the house and everything in it. */
  annexRefund(H, hk) {
    const a = (H.annex ?? []).find((x) => `a${x.uid}` === hk);
    if (!a) return 0;
    let n = Math.round((a.paid ?? 0) * HOME_SELL);
    for (const room of homeRooms(H)) {
      if (room.hk !== hk) continue;
      const R = H.rooms?.[room.id];
      for (const q of [...(R?.items ?? []), ...(R?.wall ?? [])]) if (!q.free) n += Math.round(this.itemPrice(q.id) * ITEM_SELL);
      // ...and a holodeck or a dojo in it, which is bought like furniture and sold like it
      n += roomTypeRefund(this, R);
    }
    for (const L of H.links ?? []) if (L.a.hk === hk || L.b.hk === hk) n += Math.round((L.paid ?? 0) * HOME_SELL);
    return n;
  }

  /** Sell an EXTRA house back (the island's own goes with the island). */
  sellHouse(p, H, hk) {
    if (hk === 'main') { this.game.toast('Your first house goes with the island — sell the whole home at Roshi\'s to sell it.', p.index); return false; }
    const k = (H.annex ?? []).findIndex((x) => `a${x.uid}` === hk);
    if (k < 0) return false;
    const back = this.annexRefund(H, hk);
    for (const room of homeRooms(H)) if (room.hk === hk) delete H.rooms[room.id];
    H.links = (H.links ?? []).filter((L) => L.a.hk !== hk && L.b.hk !== hk);
    H.annex.splice(k, 1);
    this._refund(p, H, back);
    this.changed(H);
    return back;
  }

  _refund(p, H, back) {
    if (!back) return;
    p.score += back;
    const n = p.style?.name;
    if (n && H.paid) H.paid[n] = Math.max(0, (H.paid[n] ?? 0) - back);
    this.game.onScoreChanged?.(p);
  }

  _dropLink(p, H, L) {
    H.links = (H.links ?? []).filter((x) => x !== L);
    this._refund(p, H, Math.round((L.paid ?? 0) * HOME_SELL));
  }

  /** A bridge's price: its style's, and a quarter more for each turn and each smooth one (links.js `linkPriceK`). */
  linkPrice(style, L = null) {
    const base = this.price(LINK_BY_ID[style]?.mult ?? 0.5);
    return L?.via?.length ? Math.round(base * linkPriceK(L)) : base;
  }

  /**
   * BUILD A BRIDGE. `L` is `{ a, b, style }`. Yard things in its way that do
   * not fit under it are sold first if `sellBlockers` (the card asks — "we
   * can offer to the player to automatically sell the object interfering and
   * build the bridge anyways"), else it refuses and names them. Anything
   * hanging on the wall where a door is cut is sold back: "If the bridge cuts
   * a hole where there is an object on the wall, then that object gets sold
   * and paid back to player."
   */
  buildLink(p, H, L, sellBlockers = false) {
    const I = this.isleOf(H.site);
    const env = this.envOf(I);
    const why = linkWhy(H, L, env);
    if (why) { this.game.toast(why, p.index); return { ok: false, why }; }
    const block = linkBlockers(H, L, env);
    if (block.length && !sellBlockers) return { ok: false, blockers: block };
    const price = this.linkPrice(L.style, L);
    let back = 0;
    for (const k of block) { const q = H.outdoor[k]; back += Math.round(this.itemPrice(q.id) * ITEM_SELL); }
    const w = (LINK_BY_ID[L.style] ?? LINK_BY_ID.plank).w;
    const onWall = [];
    for (const e of [L.a, L.b]) {
      for (const room of homeRooms(H)) {
        if (room.hk !== e.hk || room.floor !== e.floor) continue;
        const R = H.rooms?.[room.id];
        if (!R?.wall?.length) continue;
        const slots = wallSlots(room.house, room);
        R.wall.forEach((q, i) => {
          const S = slots.find((s) => s.side === q.side && s.k === q.k);
          if (S && S.side === e.side && Math.abs((S.side % 2 ? S.z : S.x) - e.at) < w / 2 + 1.1) onWall.push([R, i, q]);
        });
      }
    }
    for (const [, , q] of onWall) if (!q.free) back += Math.round(this.itemPrice(q.id) * ITEM_SELL);
    if (p.score + back < price) { this.game.toast(`${p.name} needs ${(price - p.score - back).toLocaleString()} more points.`, p.index); return { ok: false }; }
    this._refund(p, H, back);
    if (!this.spend(p, H, price)) return { ok: false };
    H.outdoor = H.outdoor.filter((_, k) => !block.includes(k));
    for (const [R, , q] of onWall) R.wall = R.wall.filter((x) => x !== q);
    H.uid = (H.uid ?? 0) + 1;
    H.links ??= [];
    // a turned bridge keeps its corners; a straight one's row is what it always was
    const via = L.via?.length ? { via: L.via.map((v) => ({ x: +v.x.toFixed(2), z: +v.z.toFixed(2), smooth: !!v.smooth })) } : {};
    H.links.push({ uid: H.uid, a: { ...L.a }, b: { ...L.b }, style: L.style, paid: price, ...via });
    this.changed(H);
    this.game.audio?.play?.('land');
    this.game.toast(`The ${LINK_BY_ID[L.style].name} is built!${back ? ` Roshi paid ${back.toLocaleString()} points for what was in the way.` : ''}`, p.index);
    return { ok: true };
  }

  sellLink(p, H, uid) {
    const L = (H.links ?? []).find((x) => x.uid === uid);
    if (!L) return 0;
    const back = Math.round((L.paid ?? 0) * HOME_SELL);
    this._dropLink(p, H, L);
    if (H.doors) { delete H.doors[`L${uid}a`]; delete H.doors[`L${uid}b`]; }
    this.changed(H);
    return back;
  }

  /** INTERACT on a door: pin it open, or let it shut behind her. */
  toggleDoor(p, H, d) {
    if (!d) return;
    d.pinned = !d.pinned;
    H.doors ??= {};
    if (d.pinned) H.doors[d.key] = true; else delete H.doors[d.key];
    this.save();
    this.game.audio?.play?.('menu');
    this.game.toast(d.pinned ? 'The door slides OPEN and stays open.' : 'The door will slide shut when nobody is near it.', p.index);
  }

  /* ----------------------------- the preview ---------------------------- */

  /** Show `houseId` on `siteId` in this kitten's colours, fading in. */
  startPreview(p, siteId, houseId) {
    const I = this.isleOf(siteId);
    if (!I || I.home && !I.home.preview) return;
    if (this.preview?.isle && this.preview.isle !== I) this.stopPreview();
    const colours = [p.style.colour];
    if (!this.preview || this.preview.isle !== I || this.preview.house !== houseId) {
      I.setHome({ ...newHome(siteId, houseId, [p.style.name]), preview: true }, null);
      this.preview = { isle: I, house: houseId, colours, k: 0, who: p.index };
    }
  }

  stopPreview() {
    const P = this.preview;
    if (!P) return;
    this.preview = null;
    const H = this.store.homes[P.isle.site.id] ?? null;
    P.isle.setHome(H, H ? this.coloursOf(H) : null);
  }

  /* ----------------------------- interaction ---------------------------- */

  /** The nearest thing INTERACT would answer, for prompt and press alike. */
  _spotFor(p) {
    if (!this.built || p.mount || p.rideAlong) return null;
    if (this.roshi?.near(p)) return { act: 'roshi' };
    for (const [k, B] of this.bridges.entries()) {
      if (!B?.solid) continue;
      for (const J of B.jukeboxSpots ?? (B.jukeboxSpot ? [B.jukeboxSpot] : [])) {
        if (Math.hypot(p.position.x - J.x, p.position.z - J.z) < 3.4) {
          return { act: 'jukebox', k, home: this.isles[k].home };
        }
      }
      /* THE GATES, at either end: an owner opens and shuts them here, at the
         door itself, rather than only from a menu in her house. */
      if (this.isles[k].home && B.gateNear?.(p.position.x, p.position.z, 4.2) >= 0
        && Math.abs(p.position.y - (B.gates[B.gateNear(p.position.x, p.position.z, 4.2)].y)) < 4) {
        return { act: 'gates', k, home: this.isles[k].home };
      }
    }
    // The rod stand stands on the koi pond's bank, inside the pond's own spot.
    const pond = this.angling.standNear(p);
    if (pond) return { act: 'rod', pond, home: pond.I.home };
    const pile = this.pets.pileNear(p);
    if (pile) return { act: 'clean', pile, home: pile.v.H };
    for (const I of this.isles) {
      if (!I.home || !I.over(p.position.x, p.position.z, 2)) continue;
      let best = null;
      for (const s of I.spots) {
        const d = Math.hypot(p.position.x - s.x, p.position.z - s.z);
        if (d > s.r || Math.abs(p.position.y - s.y) > 3) continue;
        if (!best || d < best.d) best = { ...s, d, isle: I, home: I.home };
      }
      if (best) return best;
    }
    return null;
  }

  /** The callout for her, or null. */
  prompt(p, key) {
    if (!key) return null;
    // With a rod in her hands, the callout is the rod's: power, line, BITE.
    const rod = this.angling.prompt(p, key);
    if (rod) return rod;
    const pet = this.pets.prompt(p);
    if (pet) return pet;
    const s = this._spotFor(p);
    if (!s) return null;
    const own = s.home && s.home.owners.includes(p.style.name);
    /* LAZY, because `words` below is an object literal and EVERY entry in it
       is evaluated, whichever spot she is at. Written inline, this read
       `s.door.hs` at Roshi, at a gate, at a sister's kotatsu — any spot that
       has no door — and threw every frame for a visitor: the game froze, the
       menus still worked (Richard, Oct 2026, near Roshi and behind a castle). */
    const shut = () => !!s.door && !this.opensFor(s.isle, p, s.door.hs, s.door);
    const words = {
      roshi: 'TALK TO ROSHI',
      jukebox: own ? 'PICK THE MUSIC' : 'LISTEN',
      // inside the door: the card is hers; a visitor is behind the door, where nobody knocks
      door: own ? 'MY HOME' : null,
      frontdoor: s.act !== 'frontdoor' ? null : !own ? (!this.allowed(p, s.home) || shut() ? 'KNOCK' : null)
        : s.door?.pinned ? 'CLOSE THE DOOR' : 'KEEP THE DOOR OPEN',
      portdoor: own ? (s.door?.pinned ? 'CLOSE THE DOOR' : 'KEEP THE DOOR OPEN') : null,
      portknock: s.act === 'portknock' && !own && shut() ? 'KNOCK' : null,
      // the window asks what she wants (cards.js `_v_window`)
      window: 'THE WINDOW',
      koi: 'THE KOI POND',
      rod: 'PICK UP A FISHING ROD',
      clean: 'CLEAN UP THE MESS',
      harvest: 'HARVEST BAMBOO',
      animals: 'THE ANIMALS',
      kendo: 'KENDO GEAR',
      holodeck: p.simLook ? 'INTO THE SIMULATOR' : 'HOLODECK',
      chest: 'STORAGE CHEST',
      nap: 'NAP',
      cook: this.activities.carrying(p.index) ? 'PUT THE PLATE BACK' : 'COOK',
      drum: 'PLAY THE DRUM',
      bell: 'RING THE BELL',
      rake: 'RAKE THE SAND',
      tea: this.activities.teaParty ? 'KNEEL FOR TEA TOO' : 'KNEEL FOR TEA',
      soak: 'SOAK',
      volley: 'VOLLEYBALL',
      pray: 'PRAY',
      sit: this.activities.carrying(p.index) && this.activities.platesOn(this.activities.tableKey(s)) < TABLE_SEATS ? 'SET THE TABLE WITH THE FOOD'
        : this.activities.platesOn(this.activities.tableKey(s)) ? 'EAT TOGETHER' : 'SIT AT THE KOTATSU',
      // "When it says 'Close the gates', should say 'Close the gates for visitors'"
      gates: own ? (this.locked(s.home) ? 'OPEN THE GATES' : 'CLOSE THE GATES FOR VISITORS') : null,
      look: 'LOOK OUT',
      trophies: 'TROPHIES',
    }[s.act];
    return words ? `[${key}]  ${words}` : null;
  }

  /** INTERACT pressed. True if housing answered it (the press is spent). */
  interact(p) {
    const s = this._spotFor(p);
    if (!s) return false;
    const G = this.game;
    const C = G.housingCards;
    switch (s.act) {
      case 'roshi':
        if (!this.shopOpen()) {
          G.toast('Roshi is still on holiday — he opens his shop once the whole town is MISCHIEF-FREE!', p.index);
          return true;
        }
        this._roadsAsked = true;
        C.open(p.index, 'realtor');
        this.roshi.greet(p);
        return true;
      case 'jukebox':
        C.open(p.index, 'jukebox', { k: s.k });
        return true;
      case 'gates': {
        const H = s.home;
        if (!H.owners.includes(p.style.name)) {
          G.toast(`These are ${H.owners.join(' & ')}'s gates — only ${H.owners.length > 1 ? 'they' : 'she'} can open them.`, p.index);
          return true;
        }
        const shut = this.locked(H);
        this.setOpen(p, H, shut);
        G.audio?.play?.(shut ? 'menu' : 'land');
        /* THE DOORS ARE ALREADY OPEN FOR HER — they swing for any owner who
           walks up (homebridge.js GATE) — so what this button moves is the
           hologram. */
        G.toast(shut ? 'The hologram barrier switches OFF — visitors are welcome!'
          : 'The hologram barrier hums ON — the gates open for the owners and nobody else.', p.index);
        return true;
      }
      case 'door':
        if (!s.home.owners.includes(p.style.name)) return false;
        C.open(p.index, 'home', { site: s.home.site });
        return true;
      case 'frontdoor':
        if (!this.allowed(p, s.home)) {
          G.toast(`Knock knock! ${s.home.owners.join(' & ')}'s door is locked.`, p.index);
          G.audio?.play?.('menu');
          return true;
        }
        if (!s.home.owners.includes(p.style.name)) {
          if (this.opensFor(s.isle, p, s.door.hs, s.door)) G.toast('The door is open for you — come in!', p.index);
          else this.knock(p, s.isle, s.door.hs);
          return true;
        }
        this.toggleDoor(p, s.home, s.door);
        return true;
      case 'portdoor':
        if (!s.home.owners.includes(p.style.name)) {
          G.toast(`Only ${ownerNames(s.home)} can keep this door open — it opens for you on the way out.`, p.index);
          return true;
        }
        this.toggleDoor(p, s.home, s.door);
        return true;
      case 'portknock':
        if (s.home.owners.includes(p.style.name) || this.opensFor(s.isle, p, s.door.hs, s.door)) return false;
        this.knock(p, s.isle, s.door.hs);
        return true;
      case 'window': {
        /* A WINDOW ASKS. Richard, Oct 2026: "Looking out the window should be
           an option when interacting with the window, not every time you
           open it. We can have a menu dialog appear like what appears in the
           simulator with Kata Trace or Kotodama Gallery." It was one button:
           a shut window opened AND started the look, an open one shut — so
           airing a room meant a nine-second camera move. The card is
           `_v_window` (cards.js): no, look out, open/shut. */
        if (!s.home.rooms?.[s.room]?.wall?.[s.wk]) return true;
        G.audio?.play?.('menu');
        if (!C.open(p.index, 'window', { spot: s })) G.toast('Not right now — finish what you are doing first.', p.index);
        return true;
      }
      case 'koi':
        C.open(p.index, 'koi', { site: s.home.site });
        return true;
      case 'rod':
        this.angling.toggle(p, s.pond);
        return true;
      case 'clean':
        this.pets.clean(p, s.pile);
        return true;
      case 'harvest':
        this.farm.harvest(p, s.home);
        return true;
      case 'animals':
        C.open(p.index, 'pen', { site: s.home.site });
        return true;
      case 'kendo':
        this.kendo.toggleGear(p);
        return true;
      case 'holodeck':
        this.holo.enter(p, s);
        return true;
      case 'chest':
        if (s.home.owners.includes(p.style.name)) C.open(p.index, 'home', { site: s.home.site, state: 'chest' });
        else G.toast('That chest is not yours to open!', p.index);
        return true;
      default:
        if (this.activities.start(p, s)) return true;
        this._fun(p, s);
        return true;
    }
  }

  /** What is left with no activity of its own — a line and a sound.
   *  PLACEHOLDER behaviour; everything else is `activities.js`. */
  _fun(p, s) {
    const G = this.game;
    const lines = {
      volley: `${p.name} bats the ball over the net! (Volleyball match coming soon.)`,
    };
    G.toast(lines[s.act] ?? 'Hmm.', p.index);
    G.audio?.play?.('menu');
  }

  /** Is a seat's pad being driven by housing outside of a card? */
  busy(index) {
    return this.kendo.kiaiBusy(index);
  }

  /** Is a seat's pad the kendo ceremony's (kneel, kiai, bow, YAME)? */
  kendoHolds(index) {
    return this.kendo.holds(index);
  }

  /** Kendo: the sparring zone this kitten is standing in, or null. */
  sparZone(p) {
    return this.kendo.zoneOf(p);
  }

  /* -------------------------------- save -------------------------------- */

  snapshot() {
    return JSON.parse(JSON.stringify(this.store));
  }

  /** A loaded game's homes: the newer of the save's and the browser's. */
  restore(snap) {
    // This game's own row, which may be up to an autosave ahead of the save.
    const mine = (() => {
      const s = loadStore(globalThis.localStorage, this._key());
      return s.at ? s : null;
    })();
    const theirs = snap ? normalise(snap) : null;
    this.store = newer(mine, theirs) ?? emptyStore();
    saveStore(this.store, globalThis.localStorage, this._key());
    if (this.built) this._applyStore();
    for (let k = 0; k < this.bridges.length; k++) this._dressBridge(k);
  }

  exportJson() { exportFile(this.store); }

  async importJson(index) {
    const s = await importFile();
    if (!s) { this.game.toast('That file is not a Katana Kitties homes file.', index); return; }
    this.store = s;
    saveStore(this.store, globalThis.localStorage, this._key());
    this._applyStore();
    for (let k = 0; k < this.bridges.length; k++) this._dressBridge(k);
    this.game.toast(`Loaded ${Object.keys(s.homes).length} home(s) from the file.`, index);
  }

  /* ------------------------------ helpers ------------------------------- */

  static get DAY() { return DAY; }
  /** `mult: 0` is FREE (the holodeck's kit), not priceOf's floor of 10. */
  itemPrice(id) { const m = ITEM_BY_ID[id]?.mult ?? 1; return m === 0 ? 0 : this.price(m); }
  roomPrice(id) { return this.price(ROOM_TYPE_BY_ID[id]?.mult ?? 0); }
  housePrice(id) { return this.price(HOUSE_BY_ID[id]?.mult ?? 8); }
  site(id) { return SITE_BY_ID[id]; }
}
