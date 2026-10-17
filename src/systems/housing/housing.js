import * as THREE from 'three';
import { PLAYER_STYLE } from '../../core/palette.js';
import {
  HOME_SITES, SITE_BY_ID, HOUSE_BY_ID, ITEM_BY_ID, PRESET_BY_ID, ROOM_TYPE_BY_ID, HOME_SELL, priceOf, SPEED_STRIP,
  FREE_ANNEX, LINK_BY_ID, homeRooms,
} from './catalog.js';
import { loadStore, saveStore, newHome, homeOf, normalise, newer, exportFile, importFile, emptyStore, homeKey } from './homestore.js';
import { HomeIsle } from './homeisle.js';
import { HomeBridge, solveHomeRoads } from './homebridge.js';
import { Roshi } from './roshi.js';
import { PurchaseScene } from './purchasescene.js';
import { JUKEBOX, hasRecording, previewOf } from './jukebox.js';
import { Koi } from './koi.js';
import { Farm } from './farm.js';
import { Kendo } from './kendo.js';
import { autoLayout, defaultWindows, houseWhy, brokenLinks, wallSlots, ITEM_SELL } from './editor.js';

/** How far toward its bridge a NEW house of this kind stands (see `buy`). */
export const HOME_FORWARD = { castle: 7 };
import { linkWhy, linkBlockers } from './links.js';
import { HousingCards, roomTypeRefund } from './cards.js';
import { BuildMode } from './build.js';
import { HomeBoons } from './boons.js';
import { HomeActivities } from './activities.js';
import { HEAD_H } from './homehouse.js';
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
  }

  /** Re-draw every isle from the store. */
  _applyStore() {
    for (const [k, I] of this.isles.entries()) {
      const H = this.store.homes[I.site.id] ?? null;
      // a home bought before houses had windows gets them, once (`defaultWindows`)
      if (H && !H.winV) { defaultWindows(H); H.winV = 1; }
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
    const owner = H.owners[0];
    const st = styleByName(owner);
    B.setOwner(H.owners.length > 1 ? H.owners.join(' & ') : owner, st?.colour ?? 0xf4c542, st?.sheet);
    B.setLocked(this.locked(H), true);  // a load, not a press: no swing
    if (!this.purchase?.active || this.purchase.k !== k) {
      B.group.visible = true;
      B.solid = true;
      B.setGrow(1);
      B.gateMat.reveal = 1;
    }
  }

  /* ------------------------------ ground ------------------------------- */

  /** `World.heightAt`'s last loop. */
  heightAt(x, z, fromY = Infinity) {
    if (!this.isUp()) return null;
    let best = null;
    for (const I of this.isles) {
      const h = I.heightAt(x, z, fromY);
      if (h && (!best || h.y > best.y)) best = h;
    }
    for (const B of this.bridges) {
      if (!B?.solid) continue;
      const p = B.platform;
      if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
      const y = p.yAt(x, z, fromY);
      if (y == null || fromY + (p.step ?? 0.6) < y) continue;
      if (!best || y > best.y) best = { y, platform: p, island: null };
    }
    return best;
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
        if (B?.solid && H && !this.allowed(p, H)) for (const seg of B.doorSegments()) this._doorPush(p, seg, r, H);
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
      // The bridge door, at the town end.
      const B = this.bridges[k];
      if (B?.solid && H && !this.allowed(p, H)) for (const seg of B.doorSegments()) this._doorPush(p, seg, r, H);
      if (!H || !I.shell) continue;
      // houses stand anywhere on the island now, so "near a house" is "on it"
      if (d2 > (I.radius + 4) ** 2) {
        this._obstacles(p, I, r);
        continue;
      }
      // a kitten lying on a futon or sat at the table is IN the furniture's rectangle, on purpose
      const held = this.activities?.holds?.(p.index);
      for (const w of I.walls) {
        if (pos.y + 1.5 < w.y0 || pos.y > w.y1) continue;
        if (held && w.furn) continue;
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
      }
      this._roomWall(p, I, H);
      this._obstacles(p, I, r);
      this._slide(p, I);
      // ...and her head against the ceiling (HomeIsle `ceilingAt`)
      const c = I.ceilingAt(pos.x, pos.y, pos.z);
      if (c != null && pos.y + HEAD_H > c) {
        pos.y = c - HEAD_H;
        if (p.velocity.y > 0) p.velocity.y = 0;
      }
    }
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
      if (!room.claim || room.hk !== at.hs.hk || room.floor !== f) continue;
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
    const up = this.isUp();
    for (const I of this.isles) I.group.visible = up;
    for (const B of this.bridges) if (B && !up) B.group.visible = false;
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
      B?.update?.(dt, this.time);
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
    if (this.purchase?.active) this.purchase.update(dt);
    // Roshi's preview fades in on whichever island is being looked at
    if (this.preview) {
      const P = this.preview;
      P.k = Math.min(1, P.k + dt / 1.6);
      P.isle.setColours(P.colours, P.k);
    }
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

  /** The jukebox's track for `_wantedTrack`, or null. */
  musicTrack() {
    /* THE SHRINE'S SONG OUTRANKS THE BOOMBOX while it plays — "stop all
       music; temple music while she prays and on to the song's end". */
    const prayer = this.musicSite ? this.activities?.prayerTrack() : null;
    if (prayer) return prayer;
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
    return this.kendo.shotFor(members) ?? this.doorShotFor(members);
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
      (I._doorCentre ??= new THREE.Vector3()).set(c.x, M.gy + S.sign.y - 1.0, c.z);
      // the house's front, wrapped to within a half-turn of the usual yaw
      let yaw = M.ry;
      while (yaw - CAM_YAW_DEFAULT > Math.PI) yaw -= Math.PI * 2;
      while (yaw - CAM_YAW_DEFAULT < -Math.PI) yaw += Math.PI * 2;
      return { centre: I._doorCentre, aim: true, dist: 12, pitch: 0.16, yaw };
    }
    return null;
  }

  /**
   * THE CUTAWAY, per pane. Every floor above the lowest kitten in this pane
   * who is inside, and the roof, are hidden for THIS render only; the walls
   * of the floor she is on take an x-ray bite for her. A scene's lens shows
   * every house whole.
   */
  aimView(camera, members, scene) {
    if (!this.built) return;
    const players = this.game.players ?? [];
    for (const I of this.isles) {
      if (!I.home) continue;
      if (scene) { I.cutaway(-1); I.halfWalls(null); for (const M of I.xrayMats) M.setCuts?.(camera.position, []); continue; }
      // each house cut to the lowest floor anybody in this pane is on in IT
      const cut = new Map();
      const seen = [];
      const floors = [];
      for (const i of members ?? players.map((_, k) => k)) {
        const p = players[i];
        if (!p) continue;
        const a = I.houseAt(p.position.x, p.position.y, p.position.z);
        if (a) cut.set(a.hs.hk, Math.min(cut.get(a.hs.hk) ?? 99, a.f));
        if (Math.hypot(p.position.x - I.x, p.position.z - I.z) < I.radius + 14 && seen.length < 4) {
          seen.push(new THREE.Vector3(p.position.x, p.position.y + 1.4, p.position.z));
          /* A KNEE'S HEIGHT ABOVE HER FEET, not just under them. Richard: the
             x-ray "is cutting into the flooring and the foundation of the
             house". At -0.05 the tatami (0.06 thick, ON the floor) and the
             plinth's top edge were above the line and inside the cone. */
          floors.push(p.position.y + 0.35);
        }
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
      // a kendo match being watched: the walls at half height (kendo.js)
      I.halfWalls(this.kendo.halfWallFor(I, members ?? players.map((_, k) => k)));
      for (const M of I.xrayMats) M.setCuts?.(camera.position, seen, floors);
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
    H.winV = 1;
    if (presetId && PRESET_BY_ID[presetId]) autoLayout(H, PRESET_BY_ID[presetId], I);
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
    const mine = this.claimsOf(H, n).length;
    if (mine >= share) {
      return share === 1
        ? 'You already have your room — let it go first to pick a different one.'
        : `You already have your fair share of ${share} rooms — let one go first to pick a different one.`;
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
    return { r: I.radius, landing, gyAt: g, groundAt: g };
  }

  /**
   * What an extra house costs HER here: nothing for the first of the one a
   * size down that came with the island (`FREE_ANNEX` — "the first house is
   * free that comes with the island, after that they have to buy any
   * additional houses"), else Roshi's price for it.
   */
  annexPrice(H, houseId) {
    const free = FREE_ANNEX[H.house] === houseId && !(H.annex ?? []).some((a) => a.free);
    return free ? 0 : this.housePrice(houseId);
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

  linkPrice(style) { return this.price(LINK_BY_ID[style]?.mult ?? 0.5); }

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
    const price = this.linkPrice(L.style);
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
    H.links.push({ uid: H.uid, a: { ...L.a }, b: { ...L.b }, style: L.style, paid: price });
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
    const words = {
      roshi: 'TALK TO ROSHI',
      jukebox: own ? 'PICK THE MUSIC' : 'LISTEN',
      door: own ? 'MY HOME' : 'KNOCK',
      frontdoor: !this.allowed(p, s.home) ? 'KNOCK' : s.door?.pinned ? 'CLOSE THE DOOR' : 'KEEP THE DOOR OPEN',
      portdoor: s.door?.pinned ? 'CLOSE THE DOOR' : 'KEEP THE DOOR OPEN',
      window: s.home?.rooms?.[s.room]?.wall?.[s.wk]?.open ? 'CLOSE THE WINDOW' : 'OPEN THE WINDOW AND LOOK OUT',
      koi: 'THE KOI POND',
      rod: 'PICK UP A FISHING ROD',
      clean: 'CLEAN UP THE MESS',
      harvest: 'HARVEST BAMBOO',
      animals: 'THE ANIMALS',
      kendo: 'KENDO GEAR',
      holodeck: p.simLook ? 'INTO THE SIMULATOR' : 'HOLODECK',
      chest: 'STORAGE CHEST',
      nap: 'NAP',
      cook: 'COOK',
      drum: 'PLAY THE DRUM',
      bell: 'RING THE BELL',
      soak: 'SOAK',
      volley: 'VOLLEYBALL',
      pray: 'PRAY',
      sit: this.activities.carrying(p.index) ? 'SET THE TABLE WITH THE FOOD'
        : this.activities.platesOn(this.activities.tableKey(s)) ? 'EAT TOGETHER' : 'SIT AT THE KOTATSU',
      gates: own ? (this.locked(s.home) ? 'OPEN THE GATES' : 'CLOSE THE GATES') : null,
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
        G.toast(shut ? 'The gates swing OPEN — visitors are welcome!'
          : 'The gates swing SHUT and the force field hums — only the owners can come in now.', p.index);
        return true;
      }
      case 'door':
        if (s.home.owners.includes(p.style.name)) C.open(p.index, 'home', { site: s.home.site });
        else G.toast(this.locked(s.home)
          ? `Knock knock! ${s.home.owners.join(' & ')}'s door is locked.`
          : `Come on in — ${s.home.owners.join(' & ')} left the door open!`, p.index);
        return true;
      case 'frontdoor':
        if (!this.allowed(p, s.home)) {
          G.toast(`Knock knock! ${s.home.owners.join(' & ')}'s door is locked.`, p.index);
          G.audio?.play?.('menu');
          return true;
        }
        this.toggleDoor(p, s.home, s.door);
        return true;
      case 'portdoor':
        this.toggleDoor(p, s.home, s.door);
        return true;
      case 'window': {
        /* OPENING A WINDOW IS LOOKING OUT OF IT. Richard, Oct 2026: "The 'zoom
           in and look out the window' option is no longer there, we should
           reintroduce that". It went when windows became real holes that open
           and shut, because INTERACT became the latch and the window's spot
           stopped being a 'look'. One button, so: a shut window slides open
           and she looks out (the hold, activities.js `_look`); an open one
           shuts. Every opening is a look. */
        const q = s.home.rooms?.[s.room]?.wall?.[s.wk];
        if (!q) return true;
        G.audio?.play?.('menu');
        if (q.open) { delete q.open; this.save(); return true; }
        q.open = true;
        this.save();
        this.activities.start(p, { ...s, act: 'look' });
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
